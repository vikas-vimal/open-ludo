import type { RoomState } from '@open-ludo/contracts';
import { vi } from 'vitest';
import { RoomsService } from '../src/rooms/rooms.service.js';

function mockRoomState(code: string, hostUserId = 'u1', status: RoomState['room']['status'] = 'waiting'): RoomState {
  return {
    room: {
      id: 'room-1',
      code,
      hostUserId,
      status,
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

  const gameEngine = {
    initializeGame: vi.fn(),
    handlePlayerDisconnected: vi.fn(),
    handlePlayerReconnected: vi.fn(),
  };
  const economy = {
    prepareMatchStart: vi.fn(),
  };

  let service: RoomsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new RoomsService(prisma as never, redis as never, economy as never, gameEngine as never);
    prisma.room.update.mockResolvedValue({ id: 'room-1' });
    prisma.roomPlayer.upsert.mockResolvedValue({});
    gameEngine.initializeGame.mockResolvedValue({ roomCode: 'ABC123', state: {} });
    gameEngine.handlePlayerDisconnected.mockResolvedValue(undefined);
    gameEngine.handlePlayerReconnected.mockResolvedValue(undefined);
    economy.prepareMatchStart.mockResolvedValue({
      entryFee: 100,
      pot: 200,
      eligiblePlayers: [
        { userId: 'u1', displayName: 'Host' },
        { userId: 'u2', displayName: 'Guest' },
      ],
      skippedUserIds: [],
    });
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

  it('requires at least 2 players before start and initializes game state', async () => {
    prisma.room.findUnique
      .mockResolvedValueOnce({
        id: 'room-1',
        code: 'ABC123',
        hostUserId: 'u1',
        status: 'waiting',
        players: [
          {
            userId: 'u1',
            user: { displayName: 'Host' },
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 'room-1',
        code: 'ABC123',
        hostUserId: 'u1',
        status: 'waiting',
        players: [
          { userId: 'u1', user: { displayName: 'Host' } },
          { userId: 'u2', user: { displayName: 'Guest' } },
        ],
      });

    await expect(service.startRoom('u1', 'ABC123')).rejects.toMatchObject({
      response: { code: 'INVALID_MOVE' },
    });

    vi.spyOn(service as any, 'getRoomStateOrThrow').mockResolvedValue(
      mockRoomState('ABC123', 'u1', 'playing'),
    );
    const started = await service.startRoom('u1', 'ABC123');

    expect(started.room.status).toBe('playing');
    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: 'room-1' },
      data: { status: 'playing' },
    });
    expect(economy.prepareMatchStart).toHaveBeenCalledWith('room-1', [
      { userId: 'u1', displayName: 'Host', coinBalance: 0 },
      { userId: 'u2', displayName: 'Guest', coinBalance: 0 },
    ]);
    expect(gameEngine.initializeGame).toHaveBeenCalledWith('ABC123', [
      { userId: 'u1', displayName: 'Host' },
      { userId: 'u2', displayName: 'Guest' },
    ], {
      entryFee: 100,
      pot: 200,
      participantUserIds: ['u1', 'u2'],
      skippedUserIds: [],
    });
  });

  it('starts match with only funded players and marks skipped users in game snapshot', async () => {
    prisma.room.findUnique.mockResolvedValue({
      id: 'room-1',
      code: 'ABC123',
      hostUserId: 'u1',
      status: 'waiting',
      players: [
        { userId: 'u1', user: { displayName: 'Host' } },
        { userId: 'u2', user: { displayName: 'Low Coins' } },
        { userId: 'u3', user: { displayName: 'Guest' } },
      ],
    });

    economy.prepareMatchStart.mockResolvedValueOnce({
      entryFee: 100,
      pot: 200,
      eligiblePlayers: [
        { userId: 'u1', displayName: 'Host' },
        { userId: 'u3', displayName: 'Guest' },
      ],
      skippedUserIds: ['u2'],
    });
    vi.spyOn(service as any, 'getRoomStateOrThrow').mockResolvedValue(
      mockRoomState('ABC123', 'u1', 'playing'),
    );

    await service.startRoom('u1', 'ABC123');

    expect(gameEngine.initializeGame).toHaveBeenCalledWith('ABC123', [
      { userId: 'u1', displayName: 'Host' },
      { userId: 'u3', displayName: 'Guest' },
    ], {
      entryFee: 100,
      pot: 200,
      participantUserIds: ['u1', 'u3'],
      skippedUserIds: ['u2'],
    });
  });
});
