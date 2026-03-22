'use client';

import type {
  ChatMessagePayload,
  GameCancelledPayload,
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
import { toFriendlyErrorMessage } from '../lib/error-messages';
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

const SOUND_PREF_KEY = 'open_ludo_sound_enabled';

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

export function LobbyClient({ roomCode }: LobbyClientProps) {
  const socketRef = useRef<Socket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(false);
  const previousDiceRef = useRef<number | null>(null);
  const previousTokenCellsRef = useRef<Map<string, number>>(new Map());
  const previousTokenProgressRef = useRef<Map<string, number>>(new Map());
  const tokenMapInitializedRef = useRef(false);
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
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([]);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'reconnecting' | 'sync_failed'>(
    'connecting',
  );
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [diceAnimating, setDiceAnimating] = useState(false);
  const [highlightedCells, setHighlightedCells] = useState<number[]>([]);

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
  const firstValidMoveToken = useMemo(() => {
    if (!gameState || gameState.validMoves.length === 0) {
      return null;
    }
    const next = gameState.validMoves.slice().sort((a, b) => a.tokenIndex - b.tokenIndex)[0];
    return typeof next?.tokenIndex === 'number' ? next.tokenIndex : null;
  }, [gameState]);

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
    if (typeof window !== 'undefined') {
      setSoundEnabled(window.localStorage.getItem(SOUND_PREF_KEY) === '1');
    }
  }, []);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  function playTone(frequency: number, durationMs = 90): void {
    if (!soundEnabledRef.current || typeof window === 'undefined') {
      return;
    }

    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      return;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioCtx();
    }
    const context = audioContextRef.current;
    if (!context) {
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.08;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + durationMs / 1000);
  }

  function toggleSound(): void {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SOUND_PREF_KEY, next ? '1' : '0');
    }
  }

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
    setConnectionState('connecting');
    const socket = createLobbySocket(token);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_room', { roomCode });
      setConnectionState('connected');
      setStatus('Connected to room.');
      setError(null);
    });
    socket.on('disconnect', () => {
      if (!aliveRef.current) {
        return;
      }
      setConnectionState('reconnecting');
      setStatus('Connection lost. Reconnecting...');
    });
    socket.io.on('reconnect_attempt', () => {
      if (!aliveRef.current) {
        return;
      }
      setConnectionState('reconnecting');
      setStatus('Attempting to reconnect...');
    });
    socket.io.on('reconnect', () => {
      if (!aliveRef.current) {
        return;
      }
      setConnectionState('connected');
      setStatus('Reconnected and synced.');
      setError(null);
    });
    socket.io.on('reconnect_failed', () => {
      if (!aliveRef.current) {
        return;
      }
      setConnectionState('sync_failed');
      applyClientError('RECONNECT_FAILED', 'Unable to reconnect. Refresh the page to retry.');
    });
    socket.on('player_joined', (next) => setRoomState(next));
    socket.on('player_left', (next) => setRoomState(next));
    socket.on('room_state', (next) => {
      const previousStatus = roomStatusRef.current;
      roomStatusRef.current = next.room.status;
      setRoomState(next);
      if (previousStatus !== 'playing' && next.room.status === 'playing') {
        setChatMessages([]);
      }
      setError(null);
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
      playTone(660, 180);
      setError(null);
      void refreshMeBalance(token);
    });
    socket.on('game_cancelled', (payload: GameCancelledPayload) => {
      setGameEnd(null);
      setGameState(payload.state);
      setStatus('Match cancelled due to inactivity. Entry fees were refunded.');
      playTone(260, 220);
      setError(null);
      void refreshMeBalance(token);
    });
    socket.on('error', (payload) => {
      applyClientError(payload.code, payload.message);
    });
    socket.on('chat_message', (payload) => {
      setChatMessages((previous) => [...previous.slice(-99), payload]);
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

        setConnectionState('sync_failed');
        if (caught instanceof ApiClientError) {
          applyClientError(caught.code, caught.message);
        } else {
          setError('Failed to connect to room.');
        }
      }
    })();

    return () => {
      alive = false;
      aliveRef.current = false;
      socket.removeAllListeners();
      socket.io.removeAllListeners();
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

  useEffect(() => {
    const nextDice = gameState?.dice.value ?? null;
    if (nextDice !== null && nextDice !== previousDiceRef.current) {
      setDiceAnimating(true);
      playTone(540, 80);
      const timeout = window.setTimeout(() => setDiceAnimating(false), 240);
      previousDiceRef.current = nextDice;
      return () => window.clearTimeout(timeout);
    }

    previousDiceRef.current = nextDice;
    return undefined;
  }, [gameState?.dice.value]);

  useEffect(() => {
    if (!gameState) {
      previousTokenCellsRef.current = new Map();
      previousTokenProgressRef.current = new Map();
      tokenMapInitializedRef.current = false;
      setHighlightedCells([]);
      return;
    }

    const next = new Map<string, number>();
    const nextProgress = new Map<string, number>();
    for (const player of gameState.players) {
      player.tokens.forEach((progress, tokenIndex) => {
        nextProgress.set(`${player.userId}:${tokenIndex}`, progress);
        if (progress < 0 || progress > 51) {
          return;
        }
        next.set(`${player.userId}:${tokenIndex}`, toTrackCell(player.color, progress));
      });
    }

    if (!tokenMapInitializedRef.current) {
      previousTokenCellsRef.current = next;
      previousTokenProgressRef.current = nextProgress;
      tokenMapInitializedRef.current = true;
      return;
    }

    const movedCells = new Set<number>();
    let capturedTokenDetected = false;
    for (const [key, cell] of next.entries()) {
      const previousCell = previousTokenCellsRef.current.get(key);
      if (typeof previousCell === 'number' && previousCell !== cell) {
        movedCells.add(cell);
      }

      const previousProgress = previousTokenProgressRef.current.get(key);
      const currentProgress = nextProgress.get(key);
      if (typeof previousProgress === 'number' && previousProgress >= 0 && previousProgress <= 51 && currentProgress === -1) {
        capturedTokenDetected = true;
      }
    }
    previousTokenCellsRef.current = next;
    previousTokenProgressRef.current = nextProgress;

    if (movedCells.size === 0) {
      return;
    }

    setHighlightedCells(Array.from(movedCells));
    playTone(capturedTokenDetected ? 300 : 420, capturedTokenDetected ? 120 : 70);
    const timeout = window.setTimeout(() => setHighlightedCells([]), 400);
    return () => window.clearTimeout(timeout);
  }, [gameState]);

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
        applyClientError(caught.code, caught.message);
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

  function retrySync(): void {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }
    setError(null);
    setConnectionState('connecting');
    setStatus('Retrying room sync...');

    if (!socket.connected) {
      socket.connect();
      return;
    }

    socket.emit('join_room', { roomCode });
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

  function sendChat(): void {
    if (!socketRef.current) {
      return;
    }

    const message = chatInput.trim();
    if (!message) {
      return;
    }

    socketRef.current.emit('send_chat', { roomCode, message });
    setChatInput('');
  }

  function leaveRoom(): void {
    if (socketRef.current?.connected) {
      socketRef.current.emit('leave_room', { roomCode });
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
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
        {loadingGuest ? <p className="loading-state">Creating guest identity...</p> : null}
        {error ? <p className="notice notice-error">{error}</p> : null}
      </section>
    );
  }

  const inLobby = roomState?.room.status === 'waiting';
  const myDisconnectDeadline =
    me && gameState?.disconnectDeadlineByUserId ? gameState.disconnectDeadlineByUserId[me.id] : undefined;
  const myDisconnectSeconds =
    myDisconnectDeadline ? Math.max(0, Math.ceil((new Date(myDisconnectDeadline).getTime() - Date.now()) / 1000)) : null;
  const connectionStatusText =
    connectionState === 'connected'
      ? 'Connected'
      : connectionState === 'reconnecting'
        ? 'Reconnecting'
        : connectionState === 'sync_failed'
          ? 'Sync failed'
          : 'Connecting';

  function applyClientError(code: string | undefined, fallbackMessage: string): void {
    setError(toFriendlyErrorMessage(code, fallbackMessage));
  }

  return (
    <div className="stack mobile-safe-area">
      <section className="panel stack">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Room {roomCode}</h2>
          <div className="row">
            <button onClick={copyShareLink}>Copy Share Link</button>
            <button onClick={toggleSound}>{soundEnabled ? 'Sound: On' : 'Sound: Off'}</button>
            <button onClick={leaveRoom}>Leave Room</button>
          </div>
        </div>
        <p className={`status-badge status-${connectionState}`}>Connection: {connectionStatusText}</p>
        <p className="notice notice-info">{status}</p>
        {me ? (
          <p>
            Coins: <strong>{me.coinBalance}</strong>
          </p>
        ) : null}
        {myDisconnectSeconds !== null ? (
          <p className="notice notice-warning">
            Reconnect in <strong>{myDisconnectSeconds}s</strong> to avoid forfeit.
          </p>
        ) : null}
        {roomState ? null : <p className="loading-state">Syncing room state...</p>}
        {error ? <p className="notice notice-error">{error}</p> : null}
        {connectionState === 'sync_failed' ? <button onClick={retrySync}>Retry Sync</button> : null}
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
          <p className="loading-state">Loading room state...</p>
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
                <p>
                  Dice:{' '}
                  <span className={`dice-chip ${diceAnimating ? 'dice-roll' : ''}`}>
                    {gameState.dice.value ?? '-'}
                  </span>
                </p>
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
            <div className="board-scroll">
              <div className="board-grid">
              {Array.from({ length: 52 }).map((_, cell) => {
                const occupants = trackOccupants.get(cell) ?? [];
                const isHighlighted = highlightedCells.includes(cell);
                return (
                  <div
                    key={cell}
                    className={`board-cell ${SAFE_CELLS.has(cell) ? 'board-cell-safe' : ''} ${isHighlighted ? 'board-cell-highlight' : ''}`}
                  >
                    <div style={{ fontSize: 11, color: '#7a6455' }}>#{cell}</div>
                    <div className="row">
                      {occupants.map((token) => (
                        <span
                          key={`${token.playerName}-${token.tokenIndex}`}
                          title={`${token.playerName} token ${token.tokenIndex + 1}`}
                          className="token-dot"
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 999,
                            background: COLOR_STYLE[token.color],
                            display: 'inline-block',
                            boxShadow: isHighlighted ? '0 0 0 2px rgba(241, 143, 1, 0.35)' : 'none',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
              </div>
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

          {roomState?.room.status === 'playing' ? (
            <section className="panel stack">
              <h3>Match Chat</h3>
              <div
                className="stack"
                style={{
                  border: '1px solid #d6c8b2',
                  borderRadius: 10,
                  padding: 10,
                  minHeight: 140,
                  maxHeight: 260,
                  overflowY: 'auto',
                }}
              >
                {chatMessages.length > 0 ? (
                  chatMessages.map((entry) => (
                    <div key={entry.messageId}>
                      <strong>{entry.senderDisplayName}</strong>: {entry.message}
                    </div>
                  ))
                ) : (
                  <p>No chat messages yet.</p>
                )}
              </div>
              <div className="row">
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Type a message"
                  maxLength={280}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      sendChat();
                    }
                  }}
                />
                <button onClick={sendChat} disabled={!chatInput.trim()}>
                  Send
                </button>
              </div>
            </section>
          ) : null}
        </>
      )}

      <section className="panel stack">
        <h3>QR Invite</h3>
        <div className="row" style={{ alignItems: 'center' }}>
          <QRCodeSVG value={shareLink} size={180} />
          <p style={{ maxWidth: 320 }}>{shareLink}</p>
        </div>
      </section>

      <div className="mobile-action-bar">
        {inLobby ? (
          <>
            <button className={myLobbyPlayer?.isReady ? '' : 'secondary'} onClick={toggleReady} disabled={!myLobbyPlayer}>
              {myLobbyPlayer?.isReady ? 'Unready' : 'Ready'}
            </button>
            <button className="primary" onClick={startMatch} disabled={!isHost || roomState?.players.length === 1}>
              Start
            </button>
          </>
        ) : (
          <>
            <button
              className="primary"
              onClick={rollDice}
              disabled={!isMyTurn || gameState?.turnPhase !== 'await_roll' || gameState?.status !== 'playing'}
            >
              Roll
            </button>
            <button
              onClick={() => {
                if (typeof firstValidMoveToken === 'number') {
                  moveToken(firstValidMoveToken);
                }
              }}
              disabled={
                !isMyTurn ||
                gameState?.turnPhase !== 'await_move' ||
                gameState?.status !== 'playing' ||
                typeof firstValidMoveToken !== 'number'
              }
            >
              Move
            </button>
            <button onClick={sendChat} disabled={!chatInput.trim() || roomState?.room.status !== 'playing'}>
              Send
            </button>
          </>
        )}
      </div>
    </div>
  );
}
