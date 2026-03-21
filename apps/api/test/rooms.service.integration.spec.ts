import type { RoomState } from '@open-ludo/contracts';
import { vi } from 'vitest';
import { RoomsService } from '../src/rooms/rooms.service.js';

function mockRoomState(code: string, hostUserId = 'u1'): RoomState {
  return {
    room: {
      id: 'room-1',
      code,
      hostUserId,
      status: 'waiting',
      maxPlayers: 4,
      createdAt: new Date('2026-03-01T10:00:00.000Z').toISOString(),
    },
    players: [
      {
        userId: 'u1',
        displayName: 'Host',
        isHost: hostUserId === 'u1',
        isReady: false,
        joinedAt: new Date('2026-03-01T10:00:00.000Z').toISOString(),
        isConnected: true,
      },
      {
        userId: 'u2',
        displayName: 'Guest',
        isHost: hostUserId === 'u2',
        isReady: false,
        joinedAt: new Date('2026-03-01T10:01:00.000Z').toISOString(),
        isConnected: true,
      },
    ],
  };
}

describe('RoomsService workflow', () => {
  const prisma = {
    room: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    roomPlayer: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const redis = {
    markConnected: vi.fn(),
    markDisconnected: vi.fn(),
    connectedUserSet: vi.fn(),
  };

  let service: RoomsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new RoomsService(prisma as never, redis as never);
    prisma.room.update.mockResolvedValue({ id: 'room-1' });
    prisma.roomPlayer.upsert.mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (input: unknown) => {
      if (typeof input === 'function') {
        return (input as (arg: unknown) => Promise<unknown>)({
          room: { create: prisma.room.update },
          roomPlayer: { upsert: prisma.roomPlayer.upsert },
        });
      }
      return Promise.resolve(input);
    });
  });

  it('creates a room and bootstraps host presence', async () => {
    prisma.room.findUnique.mockResolvedValueOnce(null);
    vi.spyOn(service as any, 'getRoomStateOrThrow').mockResolvedValue(mockRoomState('ABC123'));

    const result = await service.createRoom('u1', 4);

    expect(result.room.code).toHaveLength(6);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(redis.markConnected).toHaveBeenCalled();
  });

  it('joins room and toggles ready status', async () => {
    prisma.room.findUnique.mockResolvedValue({
      id: 'room-1',
      code: 'ABC123',
      status: 'waiting',
      maxPlayers: 4,
      players: [{ userId: 'u1' }],
    });
    prisma.roomPlayer.findUnique.mockResolvedValue(null);
    prisma.roomPlayer.create.mockResolvedValue({});
    vi.spyOn(service as any, 'getRoomStateOrThrow').mockResolvedValue(mockRoomState('ABC123'));
    vi.spyOn(service as any, 'requireRoomByCode').mockResolvedValue({
      id: 'room-1',
      code: 'ABC123',
      hostUserId: 'u1',
      status: 'waiting',
    });
    vi.spyOn(service as any, 'ensurePlayerInRoom').mockResolvedValue(undefined);

    const joined = await service.joinRoom('u2', 'abc123');
    const readyState = await service.setReady('u2', 'ABC123', true);

    expect(joined.room.code).toBe('ABC123');
    expect(prisma.roomPlayer.create).toHaveBeenCalled();
    expect(prisma.roomPlayer.update).toHaveBeenCalled();
    expect(readyState.room.code).toBe('ABC123');
  });

  it('transfers host after disconnect', async () => {
    vi.spyOn(service as any, 'transferHostIfNeeded').mockResolvedValue(true);
    vi.spyOn(service as any, 'getRoomStateOrThrow').mockResolvedValue(mockRoomState('ABC123', 'u2'));

    const result = await service.handleDisconnect('u1', 'ABC123');

    expect(redis.markDisconnected).toHaveBeenCalledWith('ABC123', 'u1');
    expect(result.hostTransferred).toBe(true);
    expect(result.roomState.room.hostUserId).toBe('u2');
  });
});
