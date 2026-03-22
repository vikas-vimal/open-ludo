'use client';

import type {
  GameEndPayload,
  GameState,
  PlacementEntry,
  PlayerColor,
  RoomState,
} from '@open-ludo/contracts';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { api, ApiClientError } from '../lib/api';
import { readToken, saveSession } from '../lib/auth-store';
import { createLobbySocket } from '../lib/socket';

type LobbyClientProps = {
  roomCode: string;
};

type MeState = {
  id: string;
  displayName: string;
  kind: 'guest' | 'registered';
  coinBalance: number;
  email?: string;
};

const START_INDEX: Record<PlayerColor, number> = {
  RED: 0,
  GREEN: 13,
  YELLOW: 26,
  BLUE: 39,
};

const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

const COLOR_STYLE: Record<PlayerColor, string> = {
  RED: '#c62828',
  GREEN: '#2e7d32',
  YELLOW: '#f9a825',
  BLUE: '#1565c0',
};

function toTrackCell(color: PlayerColor, progress: number): number {
  return (START_INDEX[color] + progress) % 52;
}

function derivePlacements(state: GameState): PlacementEntry[] {
  return state.finishedOrder.map((userId, index) => {
    const player = state.players.find((candidate) => candidate.userId === userId);
    if (!player) {
      return {
        userId,
        displayName: userId,
        color: 'RED',
        place: index + 1,
      };
    }

    return {
      userId: player.userId,
      displayName: player.displayName,
      color: player.color,
      place: index + 1,
    };
  });
}

export function LobbyClient({ roomCode }: LobbyClientProps): JSX.Element {
  const socketRef = useRef<Socket | null>(null);
  const aliveRef = useRef(false);
  const roomStatusRef = useRef<RoomState['room']['status'] | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeState | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [gameEnd, setGameEnd] = useState<GameEndPayload | null>(null);
  const [status, setStatus] = useState('Connecting...');
  const [error, setError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [loadingGuest, setLoadingGuest] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const shareLink = useMemo(() => {
    if (typeof window === 'undefined') {
      return `https://open-ludo.local/room/${roomCode}`;
    }
    return `${window.location.origin}/room/${roomCode}`;
  }, [roomCode]);

  const myLobbyPlayer = useMemo(() => {
    if (!me || !roomState) {
      return null;
    }
    return roomState.players.find((player) => player.userId === me.id) ?? null;
  }, [me, roomState]);

  const isHost = useMemo(() => Boolean(me && roomState && roomState.room.hostUserId === me.id), [me, roomState]);

  const currentTurnPlayer = useMemo(() => {
    if (!gameState) {
      return null;
    }
    return gameState.players[gameState.currentTurnIndex] ?? null;
  }, [gameState]);

  const isMyTurn = useMemo(
    () => Boolean(me && currentTurnPlayer && currentTurnPlayer.userId === me.id),
    [me, currentTurnPlayer],
  );

  const placements = useMemo(() => {
    if (gameEnd) {
      return gameEnd.placements;
    }
    if (!gameState) {
      return [];
    }
    return derivePlacements(gameState);
  }, [gameEnd, gameState]);

  const isSpectator = useMemo(() => {
    if (!me || !gameState) {
      return false;
    }
    return !gameState.economy.participantUserIds.includes(me.id);
  }, [me, gameState]);

  const trackOccupants = useMemo(() => {
    if (!gameState) {
      return new Map<number, Array<{ playerName: string; color: PlayerColor; tokenIndex: number }>>();
    }

    const map = new Map<number, Array<{ playerName: string; color: PlayerColor; tokenIndex: number }>>();
    for (const player of gameState.players) {
      player.tokens.forEach((progress, tokenIndex) => {
        if (progress < 0 || progress > 51) {
          return;
        }
        const cell = toTrackCell(player.color, progress);
        const list = map.get(cell) ?? [];
        list.push({ playerName: player.displayName, color: player.color, tokenIndex });
        map.set(cell, list);
      });
    }

    return map;
  }, [gameState]);

  useEffect(() => {
    setToken(readToken());
  }, []);

  async function refreshMeBalance(accessToken: string): Promise<void> {
    try {
      const meResult = await api.getMe(accessToken);
      if (!aliveRef.current) {
        return;
      }
      setMe(meResult.user);
      saveSession(accessToken, meResult.user);
    } catch {
      // Ignore balance refresh failures and keep existing UI state.
    }
  }

  useEffect(() => {
    if (!token) {
      setStatus('Create a guest identity to join this room.');
      return;
    }

    let alive = true;
    aliveRef.current = true;
    const socket = createLobbySocket(token);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_room', { roomCode });
      setStatus('Connected to room.');
    });
    socket.on('player_joined', (next) => setRoomState(next));
    socket.on('player_left', (next) => setRoomState(next));
    socket.on('room_state', (next) => {
      const previousStatus = roomStatusRef.current;
      roomStatusRef.current = next.room.status;
      setRoomState(next);
      if (previousStatus !== next.room.status && next.room.status !== 'waiting') {
        void refreshMeBalance(token);
      }
    });
    socket.on('host_transferred', (next) => setRoomState(next));
    socket.on('state_update', (payload) => {
      setGameState(payload.state);
    });
    socket.on('game_end', (payload) => {
      setGameEnd(payload);
      setGameState(payload.state);
      setStatus('Match finished.');
      void refreshMeBalance(token);
    });
    socket.on('error', (payload) => {
      setError(payload.message);
    });

    void (async () => {
      try {
        const meResult = await api.getMe(token);
        if (!alive) {
          return;
        }
        setMe(meResult.user);
        saveSession(token, meResult.user);

        const joined = await api.joinRoom(roomCode, token);
        if (!alive) {
          return;
        }

        setRoomState(joined.room);
        roomStatusRef.current = joined.room.room.status;
        setError(null);
        socket.connect();
      } catch (caught) {
        if (!alive) {
          return;
        }

        if (caught instanceof ApiClientError) {
          setError(caught.message);
        } else {
          setError('Failed to connect to room.');
        }
      }
    })();

    return () => {
      alive = false;
      aliveRef.current = false;
      if (socket.connected) {
        socket.emit('leave_room', { roomCode });
      }
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [roomCode, token]);

  useEffect(() => {
    if (!gameState?.turnDeadlineAt) {
      setSecondsLeft(null);
      return;
    }

    const deadline = new Date(gameState.turnDeadlineAt).getTime();
    const tick = (): void => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [gameState?.turnDeadlineAt]);

  async function createGuestAndJoin(): Promise<void> {
    setLoadingGuest(true);
    try {
      const guest = await api.createGuest(guestName.trim());
      saveSession(guest.accessToken, guest.user);
      setToken(guest.accessToken);
      setError(null);
      setStatus(`Guest session created: ${guest.user.displayName}`);
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
      } else {
        setError('Failed to create guest.');
      }
    } finally {
      setLoadingGuest(false);
    }
  }

  async function copyShareLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(shareLink);
      setStatus('Share link copied to clipboard.');
    } catch {
      setStatus('Could not copy link. Use the URL manually.');
    }
  }

  function toggleReady(): void {
    if (!myLobbyPlayer || !socketRef.current) {
      return;
    }
    socketRef.current.emit('set_ready', { roomCode, ready: !myLobbyPlayer.isReady });
  }

  function startMatch(): void {
    if (!socketRef.current) {
      return;
    }
    socketRef.current.emit('start_game', { roomCode });
  }

  function rollDice(): void {
    if (!socketRef.current) {
      return;
    }
    socketRef.current.emit('roll_dice', { roomCode });
  }

  function moveToken(tokenIndex: number): void {
    if (!socketRef.current) {
      return;
    }
    socketRef.current.emit('move_token', { roomCode, tokenIndex });
  }

  if (!token) {
    return (
      <section className="panel stack">
        <h2>Join Room {roomCode}</h2>
        <p>No active identity found in this browser.</p>
        <div>
          <label htmlFor="guestName">Guest Name</label>
          <input
            id="guestName"
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
            maxLength={24}
            placeholder="Enter your name"
          />
        </div>
        <button className="primary" onClick={createGuestAndJoin} disabled={loadingGuest}>
          Continue as Guest
        </button>
        {error ? <p>{error}</p> : null}
      </section>
    );
  }

  const inLobby = roomState?.room.status === 'waiting';

  return (
    <>
      <section className="panel stack">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Room {roomCode}</h2>
          <button onClick={copyShareLink}>Copy Share Link</button>
        </div>
        <p>{status}</p>
        {me ? (
          <p>
            Coins: <strong>{me.coinBalance}</strong>
          </p>
        ) : null}
        {error ? <p style={{ color: '#9e2414' }}>{error}</p> : null}
      </section>

      <section className="panel stack">
        <h3>Players</h3>
        {roomState ? (
          <div className="stack">
            {roomState.players.map((player) => (
              <div
                key={player.userId}
                className="row"
                style={{
                  justifyContent: 'space-between',
                  border: '1px solid #d2b89a',
                  borderRadius: 10,
                  padding: 10,
                  background: player.isConnected ? '#fcfff8' : '#fff5f2',
                }}
              >
                <div>
                  <strong>{player.displayName}</strong>
                  {player.isHost ? ' (Host)' : ''}
                </div>
                <div>
                  {player.isConnected ? 'Online' : 'Offline'} | {player.isReady ? 'Ready' : 'Not ready'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>Loading room state...</p>
        )}
      </section>

      {inLobby ? (
        <section className="panel stack">
          <h3>Lobby Controls</h3>
          <div className="row">
            <button className={myLobbyPlayer?.isReady ? '' : 'secondary'} onClick={toggleReady} disabled={!myLobbyPlayer}>
              {myLobbyPlayer?.isReady ? 'Unset Ready' : 'Set Ready'}
            </button>
            <button className="primary" onClick={startMatch} disabled={!isHost || roomState?.players.length === 1}>
              Start Match (Host)
            </button>
          </div>
        </section>
      ) : (
        <>
          {isSpectator ? (
            <section className="panel stack">
              <h3>Spectator Mode</h3>
              <p>
                You are spectating this match because you had fewer than {gameState?.economy.entryFee ?? 100} coins
                when it started.
              </p>
            </section>
          ) : null}
          <section className="panel stack">
            <h3>Turn Panel</h3>
            {gameState ? (
              <>
                <p>
                  Entry fee: <strong>{gameState.economy.entryFee}</strong> | Pot:{' '}
                  <strong>{gameState.economy.pot}</strong>
                </p>
                <p>
                  Current turn: <strong>{currentTurnPlayer?.displayName ?? 'Unknown'}</strong>
                </p>
                <p>
                  Phase: <strong>{gameState.turnPhase}</strong>
                  {secondsLeft !== null ? ` | ${secondsLeft}s left` : ''}
                </p>
                <p>Dice: {gameState.dice.value ?? '-'}</p>
                <div className="row">
                  <button
                    className="primary"
                    onClick={rollDice}
                    disabled={!isMyTurn || gameState.turnPhase !== 'await_roll' || gameState.status !== 'playing'}
                  >
                    Roll Dice
                  </button>
                </div>
              </>
            ) : (
              <p>Waiting for game state...</p>
            )}
          </section>

          <section className="panel stack">
            <h3>Main Track (52 cells)</h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(13, minmax(0, 1fr))',
                gap: 6,
              }}
            >
              {Array.from({ length: 52 }).map((_, cell) => {
                const occupants = trackOccupants.get(cell) ?? [];
                return (
                  <div
                    key={cell}
                    style={{
                      border: `2px solid ${SAFE_CELLS.has(cell) ? '#0f8b8d' : '#d7c6ae'}`,
                      borderRadius: 8,
                      minHeight: 52,
                      padding: 4,
                      background: SAFE_CELLS.has(cell) ? '#eefcff' : '#fff',
                    }}
                  >
                    <div style={{ fontSize: 11, color: '#7a6455' }}>#{cell}</div>
                    <div className="row">
                      {occupants.map((token) => (
                        <span
                          key={`${token.playerName}-${token.tokenIndex}`}
                          title={`${token.playerName} token ${token.tokenIndex + 1}`}
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 999,
                            background: COLOR_STYLE[token.color],
                            display: 'inline-block',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel stack">
            <h3>Your Token Moves</h3>
            {gameState && me ? (
              <>
                <div className="row">
                  {gameState.players
                    .find((player) => player.userId === me.id)
                    ?.tokens.map((progress, tokenIndex) => {
                      const move = gameState.validMoves.find((candidate) => candidate.tokenIndex === tokenIndex);
                      const isMovable = Boolean(move) && isMyTurn && gameState.turnPhase === 'await_move';

                      return (
                        <button
                          key={tokenIndex}
                          className={isMovable ? 'secondary' : ''}
                          disabled={!isMovable}
                          onClick={() => moveToken(tokenIndex)}
                        >
                          Token {tokenIndex + 1}: {progress}
                          {move ? ` -> ${move.targetProgress}` : ''}
                        </button>
                      );
                    })}
                </div>
                <p>Progress `-1` means yard. Progress `56` means home.</p>
              </>
            ) : (
              <p>Waiting for your player state...</p>
            )}
          </section>

          <section className="panel stack">
            <h3>Placements</h3>
            {placements.length > 0 ? (
              <div className="stack">
                {placements.map((entry) => (
                  <div key={entry.userId} className="row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      {entry.place}. {entry.displayName}
                    </span>
                    <span style={{ color: COLOR_STYLE[entry.color] }}>{entry.color}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p>No one has finished yet.</p>
            )}
          </section>
        </>
      )}

      <section className="panel stack">
        <h3>QR Invite</h3>
        <div className="row" style={{ alignItems: 'center' }}>
          <QRCodeSVG value={shareLink} size={180} />
          <p style={{ maxWidth: 320 }}>{shareLink}</p>
        </div>
      </section>
    </>
  );
}
