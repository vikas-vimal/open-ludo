import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type {
  ApiErrorResponse,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@open-ludo/contracts';
import { Server, Socket } from 'socket.io';
import { ApiException } from '../common/errors.js';
import { getEnv } from '../common/env.js';
import { AuthService } from '../auth/auth.service.js';
import { RoomsService } from '../rooms/rooms.service.js';

type SocketData = {
  userId: string;
  joinedRooms: Set<string>;
};

type LobbySocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

@WebSocketGateway({
  path: '/socket.io',
  cors: {
    origin: getEnv().WEB_ORIGIN,
    credentials: true,
  },
})
export class LobbyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(
    private readonly authService: AuthService,
    private readonly roomsService: RoomsService,
  ) {}

  async handleConnection(client: LobbySocket): Promise<void> {
    try {
      const authToken =
        (typeof client.handshake.auth.token === 'string' && client.handshake.auth.token) ||
        this.extractBearerToken(client.handshake.headers.authorization);

      if (!authToken) {
        throw new ApiException('AUTH_REQUIRED', 'Socket connection requires auth token.', 401);
      }

      const authenticated = await this.authService.authenticateToken(authToken);
      client.data.userId = authenticated.userId;
      client.data.joinedRooms = new Set();
    } catch {
      client.emit('error', { code: 'INVALID_TOKEN', message: 'Socket authentication failed.' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: LobbySocket): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }

    const rooms = Array.from(client.data.joinedRooms ?? []) as string[];
    for (const roomCode of rooms) {
      try {
      const { roomState, hostTransferred } = await this.roomsService.handleDisconnect(userId, roomCode);
        this.server.to(roomCode).emit('player_left', roomState);
        if (hostTransferred) {
          this.server.to(roomCode).emit('host_transferred', roomState);
        }
      } catch {
        // Ignore disconnect cleanup errors for stale rooms/sockets.
      }
    }
  }

  @SubscribeMessage('join_room')
  async joinRoom(
    @ConnectedSocket() client: LobbySocket,
    @MessageBody() payload: { roomCode: string },
  ): Promise<void> {
    try {
      const roomState = await this.roomsService.joinRoom(client.data.userId, payload.roomCode);
      const roomCode = roomState.room.code;
      client.join(roomCode);
      client.data.joinedRooms.add(roomCode);
      this.server.to(roomCode).emit('player_joined', roomState);
      this.server.to(roomCode).emit('room_state', roomState);
    } catch (error) {
      this.emitSocketError(client, error);
    }
  }

  @SubscribeMessage('leave_room')
  async leaveRoom(
    @ConnectedSocket() client: LobbySocket,
    @MessageBody() payload: { roomCode: string },
  ): Promise<void> {
    try {
      const { roomState, hostTransferred } = await this.roomsService.leaveRoom(
        client.data.userId,
        payload.roomCode,
      );
      const roomCode = roomState.room.code;
      client.leave(roomCode);
      client.data.joinedRooms.delete(roomCode);
      this.server.to(roomCode).emit('player_left', roomState);
      if (hostTransferred) {
        this.server.to(roomCode).emit('host_transferred', roomState);
      }
    } catch (error) {
      this.emitSocketError(client, error);
    }
  }

  @SubscribeMessage('set_ready')
  async setReady(
    @ConnectedSocket() client: LobbySocket,
    @MessageBody() payload: { roomCode: string; ready: boolean },
  ): Promise<void> {
    try {
      const roomState = await this.roomsService.setReady(client.data.userId, payload.roomCode, payload.ready);
      this.server.to(roomState.room.code).emit('room_state', roomState);
    } catch (error) {
      this.emitSocketError(client, error);
    }
  }

  private emitSocketError(client: LobbySocket, error: unknown): void {
    if (error instanceof ApiException) {
      const response = error.getResponse() as ApiErrorResponse;
      client.emit('error', response);
      return;
    }

    client.emit('error', {
      code: 'ROOM_NOT_FOUND',
      message: 'Unexpected socket error.',
    });
  }

  private extractBearerToken(authHeader: string | string[] | undefined): string | null {
    if (!authHeader) {
      return null;
    }

    const value = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (!value || !value.startsWith('Bearer ')) {
      return null;
    }

    return value.slice('Bearer '.length).trim();
  }
}
