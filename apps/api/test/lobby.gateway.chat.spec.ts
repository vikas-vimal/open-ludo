import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LobbyGateway } from '../src/realtime/lobby.gateway.js';

describe('LobbyGateway chat', () => {
  const authService = {
    authenticateToken: vi.fn(),
  };
  const roomsService = {
    getRoomStateOrThrow: vi.fn(),
  };
  const gameEngine = {
    setPublisher: vi.fn(),
    getState: vi.fn(),
    rollDice: vi.fn(),
    moveToken: vi.fn(),
  };

  let gateway: LobbyGateway;
  const emitToRoom = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    gateway = new LobbyGateway(authService as never, roomsService as never, gameEngine as never);
    gateway.server = {
      to: vi.fn().mockReturnValue({
        emit: emitToRoom,
      }),
    } as never;
  });

  it('broadcasts sanitized chat in playing rooms', async () => {
    roomsService.getRoomStateOrThrow.mockResolvedValue({
      room: {
        id: 'room-1',
        code: 'ABC123',
        hostUserId: 'u1',
        status: 'playing',
        maxPlayers: 4,
        createdAt: '2026-03-22T10:00:00.000Z',
      },
      players: [
        {
          userId: 'u1',
          displayName: 'Host',
          isHost: true,
          isReady: true,
          joinedAt: '2026-03-22T10:00:00.000Z',
          isConnected: true,
        },
      ],
    });

    const client = {
      data: {
        userId: 'u1',
        joinedRooms: new Set<string>(),
      },
      emit: vi.fn(),
    };

    await gateway.sendChat(client as never, { roomCode: 'ABC123', message: 'this is shit' });

    expect(gateway.server.to).toHaveBeenCalledWith('ABC123');
    expect(emitToRoom).toHaveBeenCalledWith(
      'chat_message',
      expect.objectContaining({
        roomCode: 'ABC123',
        senderUserId: 'u1',
        senderDisplayName: 'Host',
        message: 'this is ****',
      }),
    );
  });

  it('returns CHAT_NOT_AVAILABLE when room is not playing', async () => {
    roomsService.getRoomStateOrThrow.mockResolvedValue({
      room: {
        id: 'room-1',
        code: 'ABC123',
        hostUserId: 'u1',
        status: 'waiting',
        maxPlayers: 4,
        createdAt: '2026-03-22T10:00:00.000Z',
      },
      players: [
        {
          userId: 'u1',
          displayName: 'Host',
          isHost: true,
          isReady: true,
          joinedAt: '2026-03-22T10:00:00.000Z',
          isConnected: true,
        },
      ],
    });

    const client = {
      data: {
        userId: 'u1',
        joinedRooms: new Set<string>(),
      },
      emit: vi.fn(),
    };

    await gateway.sendChat(client as never, { roomCode: 'ABC123', message: 'hello' });

    expect(client.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        code: 'CHAT_NOT_AVAILABLE',
      }),
    );
  });

  it('returns CHAT_NOT_AVAILABLE when sender is not an active room member', async () => {
    roomsService.getRoomStateOrThrow.mockResolvedValue({
      room: {
        id: 'room-1',
        code: 'ABC123',
        hostUserId: 'u2',
        status: 'playing',
        maxPlayers: 4,
        createdAt: '2026-03-22T10:00:00.000Z',
      },
      players: [
        {
          userId: 'u2',
          displayName: 'Host',
          isHost: true,
          isReady: true,
          joinedAt: '2026-03-22T10:00:00.000Z',
          isConnected: true,
        },
      ],
    });

    const client = {
      data: {
        userId: 'u1',
        joinedRooms: new Set<string>(),
      },
      emit: vi.fn(),
    };

    await gateway.sendChat(client as never, { roomCode: 'ABC123', message: 'hello' });

    expect(client.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        code: 'CHAT_NOT_AVAILABLE',
      }),
    );
  });
});
