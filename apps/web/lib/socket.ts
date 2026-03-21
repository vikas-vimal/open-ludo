import type { ClientToServerEvents, ServerToClientEvents } from '@open-ludo/contracts';
import { io, type Socket } from 'socket.io-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export function createLobbySocket(
  token: string,
): Socket<ServerToClientEvents, ClientToServerEvents> {
  return io(API_URL, {
    path: '/socket.io',
    auth: {
      token,
    },
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
  });
}
