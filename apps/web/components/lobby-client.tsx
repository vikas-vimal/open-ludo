'use client';

import type { RoomState } from '@open-ludo/contracts';
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

export function LobbyClient({ roomCode }: LobbyClientProps): JSX.Element {
  const socketRef = useRef<Socket | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<MeState | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState('Connecting...');
  const [error, setError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [loadingGuest, setLoadingGuest] = useState(false);

  const shareLink = useMemo(() => {
    if (typeof window === 'undefined') {
      return `https://open-ludo.local/room/${roomCode}`;
    }
    return `${window.location.origin}/room/${roomCode}`;
  }, [roomCode]);

  const myPlayer = useMemo(() => {
    if (!me || !roomState) {
      return null;
    }
    return roomState.players.find((player) => player.userId === me.id) ?? null;
  }, [me, roomState]);

  const isHost = useMemo(() => Boolean(me && roomState && roomState.room.hostUserId === me.id), [me, roomState]);

  useEffect(() => {
    setToken(readToken());
  }, []);

  useEffect(() => {
    if (!token) {
      setStatus('Create a guest identity to join this room.');
      return;
    }

    let alive = true;
    const socket = createLobbySocket(token);
    socketRef.current = socket;

    const applyState = (next: RoomState): void => {
      if (alive) {
        setRoomState(next);
      }
    };

    socket.on('connect', () => {
      socket.emit('join_room', { roomCode });
      setStatus('Connected to room.');
    });
    socket.on('player_joined', applyState);
    socket.on('player_left', applyState);
    socket.on('room_state', applyState);
    socket.on('host_transferred', applyState);
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
      if (socket.connected) {
        socket.emit('leave_room', { roomCode });
      }
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [roomCode, token]);

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
    if (!myPlayer || !socketRef.current) {
      return;
    }
    socketRef.current.emit('set_ready', { roomCode, ready: !myPlayer.isReady });
  }

  async function startMatch(): Promise<void> {
    if (!token) {
      return;
    }
    try {
      const response = await api.startRoom(roomCode, token);
      setRoomState(response.room);
      setStatus('Match started. Phase 2 game engine will take over from here.');
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
      } else {
        setError('Failed to start match.');
      }
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
        {error ? <p>{error}</p> : null}
      </section>
    );
  }

  return (
    <>
      <section className="panel stack">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Room {roomCode}</h2>
          <button onClick={copyShareLink}>Copy Share Link</button>
        </div>
        <p>{status}</p>
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

      <section className="panel stack">
        <h3>Lobby Controls</h3>
        <div className="row">
          <button className={myPlayer?.isReady ? '' : 'secondary'} onClick={toggleReady} disabled={!myPlayer}>
            {myPlayer?.isReady ? 'Unset Ready' : 'Set Ready'}
          </button>
          <button className="primary" onClick={startMatch} disabled={!isHost || roomState?.room.status !== 'waiting'}>
            Start Match (Host)
          </button>
        </div>
        {me ? <p>You are {me.displayName} ({me.kind}).</p> : null}
      </section>

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
