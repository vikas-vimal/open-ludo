import type { GameState } from '@open-ludo/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameEngineService } from '../src/game/game-engine.service.js';

function gameStateKey(roomCode: string): string {
  return `room:${roomCode}:game_state`;
}

describe('GameEngineService', () => {
  const store = new Map<string, string>();
  const redis = {
    setJson: vi.fn(async (key: string, value: unknown) => {
      store.set(key, JSON.stringify(value));
    }),
    getJson: vi.fn(async (key: string) => {
      const encoded = store.get(key);
      return encoded ? (JSON.parse(encoded) as unknown) : null;
    }),
    deleteKey: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    markRoomPlaying: vi.fn(async () => undefined),
    unmarkRoomPlaying: vi.fn(async () => undefined),
    listPlayingRooms: vi.fn<() => Promise<string[]>>(async () => []),
  };

  const prisma = {
    room: {
      update: vi.fn(async () => ({ id: 'room-1' })),
    },
  };
  const economy = {
    settleMatch: vi.fn(),
    cancelMatchForInactivity: vi.fn(),
  };

  let service: GameEngineService;

  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    economy.settleMatch.mockResolvedValue({
      winnerUserId: 'u1',
      entryFee: 100,
      pot: 200,
    });
    economy.cancelMatchForInactivity.mockResolvedValue({
      entryFee: 100,
      pot: 200,
      refundedUserIds: ['u1', 'u2'],
    });
    service = new GameEngineService(redis as never, prisma as never, economy as never);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    vi.restoreAllMocks();
  });

  it('rolls server dice and allows entry on 6', async () => {
    await service.initializeGame('ABCD12', [
      { userId: 'u1', displayName: 'Host' },
      { userId: 'u2', displayName: 'Guest' },
    ], {
      entryFee: 100,
      pot: 200,
      participantUserIds: ['u1', 'u2'],
      skippedUserIds: [],
    });

    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const rolled = await service.rollDice('ABCD12', 'u1');

    expect(rolled.statePayload.state.dice.value).toBe(6);
    expect(rolled.statePayload.state.validMoves.map((move) => move.tokenIndex)).toEqual([0, 1, 2, 3]);
    expect(rolled.statePayload.state.turnPhase).toBe('await_move');

    const moved = await service.moveToken('ABCD12', 'u1', 0);
    expect(moved.statePayload.state.players[0]?.tokens[0]).toBe(0);
    expect(moved.statePayload.state.turnPhase).toBe('await_roll');
    expect(moved.statePayload.state.currentTurnIndex).toBe(0);
  });

  it('captures on non-safe cell and keeps turn as bonus', async () => {
    const state: GameState = {
      roomCode: 'CAP123',
      status: 'playing',
      players: [
        {
          userId: 'u1',
          displayName: 'Host',
          color: 'RED',
          tokens: [0, -1, -1, -1],
          isForfeited: false,
        },
        {
          userId: 'u2',
          displayName: 'Guest',
          color: 'GREEN',
          tokens: [44, -1, -1, -1],
          isForfeited: false,
        },
      ],
      economy: {
        entryFee: 100,
        pot: 200,
        participantUserIds: ['u1', 'u2'],
        skippedUserIds: [],
      },
      currentTurnIndex: 0,
      turnPhase: 'await_move',
      dice: { value: 5, isAuto: false },
      validMoves: [{ tokenIndex: 0, targetProgress: 5 }],
      finishedOrder: [],
      forfeitedOrder: [],
      lastUpdatedAt: new Date().toISOString(),
    };
    await redis.setJson(gameStateKey('CAP123'), state);

    const moved = await service.moveToken('CAP123', 'u1', 0);
    expect(moved.statePayload.state.players[0]?.tokens[0]).toBe(5);
    expect(moved.statePayload.state.players[1]?.tokens[0]).toBe(-1);
    expect(moved.statePayload.state.currentTurnIndex).toBe(0);
    expect(moved.statePayload.state.turnPhase).toBe('await_roll');
  });

  it('does not capture on safe cells', async () => {
    const state: GameState = {
      roomCode: 'SAFE12',
      status: 'playing',
      players: [
        {
          userId: 'u1',
          displayName: 'Host',
          color: 'RED',
          tokens: [2, -1, -1, -1],
          isForfeited: false,
        },
        {
          userId: 'u2',
          displayName: 'Guest',
          color: 'GREEN',
          tokens: [47, -1, -1, -1],
          isForfeited: false,
        },
      ],
      economy: {
        entryFee: 100,
        pot: 200,
        participantUserIds: ['u1', 'u2'],
        skippedUserIds: [],
      },
      currentTurnIndex: 0,
      turnPhase: 'await_move',
      dice: { value: 6, isAuto: false },
      validMoves: [{ tokenIndex: 0, targetProgress: 8 }],
      finishedOrder: [],
      forfeitedOrder: [],
      lastUpdatedAt: new Date().toISOString(),
    };
    await redis.setJson(gameStateKey('SAFE12'), state);

    const moved = await service.moveToken('SAFE12', 'u1', 0);
    expect(moved.statePayload.state.players[1]?.tokens[0]).toBe(47);
  });

  it('finalizes placements and emits game end payload', async () => {
    const state: GameState = {
      roomCode: 'END123',
      status: 'playing',
      players: [
        {
          userId: 'u1',
          displayName: 'Host',
          color: 'RED',
          tokens: [55, 56, 56, 56],
          isForfeited: false,
        },
        {
          userId: 'u2',
          displayName: 'Guest',
          color: 'GREEN',
          tokens: [55, 56, 56, 56],
          isForfeited: false,
        },
      ],
      economy: {
        entryFee: 100,
        pot: 200,
        participantUserIds: ['u1', 'u2'],
        skippedUserIds: [],
      },
      currentTurnIndex: 0,
      turnPhase: 'await_move',
      dice: { value: 1, isAuto: false },
      validMoves: [{ tokenIndex: 0, targetProgress: 56 }],
      finishedOrder: [],
      forfeitedOrder: [],
      lastUpdatedAt: new Date().toISOString(),
    };
    await redis.setJson(gameStateKey('END123'), state);

    const moved = await service.moveToken('END123', 'u1', 0);
    expect(moved.gameEndPayload).toBeDefined();
    expect(moved.gameEndPayload?.placements.map((entry) => entry.userId)).toEqual(['u1', 'u2']);
    expect(moved.gameEndPayload?.winnerUserId).toBe('u1');
    expect(moved.gameEndPayload?.pot).toBe(200);
    expect(economy.settleMatch).toHaveBeenCalledWith('END123', expect.any(Array));
    expect(moved.statePayload.state.status).toBe('finished');
    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { code: 'END123' },
      data: { status: 'finished' },
    });
  });

  it('auto-rolls on turn timeout', async () => {
    await service.initializeGame('TIME01', [
      { userId: 'u1', displayName: 'Host' },
      { userId: 'u2', displayName: 'Guest' },
    ], {
      entryFee: 100,
      pot: 200,
      participantUserIds: ['u1', 'u2'],
      skippedUserIds: [],
    });

    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    await service.handleTurnTimeout('TIME01');

    const state = await service.getState('TIME01');
    expect(state?.currentTurnIndex).toBe(1);
    expect(state?.turnPhase).toBe('await_roll');
  });

  it('auto-moves the lowest token index on move timeout', async () => {
    const state: GameState = {
      roomCode: 'TIME02',
      status: 'playing',
      players: [
        {
          userId: 'u1',
          displayName: 'Host',
          color: 'RED',
          tokens: [0, -1, 2, -1],
          isForfeited: false,
        },
        {
          userId: 'u2',
          displayName: 'Guest',
          color: 'GREEN',
          tokens: [-1, -1, -1, -1],
          isForfeited: false,
        },
      ],
      economy: {
        entryFee: 100,
        pot: 200,
        participantUserIds: ['u1', 'u2'],
        skippedUserIds: [],
      },
      currentTurnIndex: 0,
      turnPhase: 'await_move',
      dice: { value: 1, isAuto: false },
      validMoves: [
        { tokenIndex: 2, targetProgress: 3 },
        { tokenIndex: 0, targetProgress: 1 },
      ],
      finishedOrder: [],
      forfeitedOrder: [],
      lastUpdatedAt: new Date().toISOString(),
    };
    await redis.setJson(gameStateKey('TIME02'), state);

    await service.handleTurnTimeout('TIME02');
    const updated = await service.getState('TIME02');
    expect(updated?.players[0]?.tokens[0]).toBe(1);
    expect(updated?.currentTurnIndex).toBe(1);
  });

  it('cancels disconnect forfeit when player reconnects within grace window', async () => {
    vi.useFakeTimers();
    try {
      await service.initializeGame('RECON1', [
        { userId: 'u1', displayName: 'Host' },
        { userId: 'u2', displayName: 'Guest' },
      ], {
        entryFee: 100,
        pot: 200,
        participantUserIds: ['u1', 'u2'],
        skippedUserIds: [],
      });

      await service.handlePlayerDisconnected('RECON1', 'u1');
      let state = await service.getState('RECON1');
      expect(state?.disconnectDeadlineByUserId?.u1).toBeTruthy();

      await service.handlePlayerReconnected('RECON1', 'u1');
      await vi.advanceTimersByTimeAsync(61_000);

      state = await service.getState('RECON1');
      expect(state?.disconnectDeadlineByUserId?.u1).toBeUndefined();
      expect(state?.players[0]?.isForfeited).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies forfeit order so earliest forfeit ranks worst', async () => {
    vi.useFakeTimers();
    try {
      await service.initializeGame('FORF01', [
        { userId: 'u1', displayName: 'Host' },
        { userId: 'u2', displayName: 'Guest A' },
        { userId: 'u3', displayName: 'Guest B' },
      ], {
        entryFee: 100,
        pot: 300,
        participantUserIds: ['u1', 'u2', 'u3'],
        skippedUserIds: [],
      });

      await service.handlePlayerDisconnected('FORF01', 'u2');
      await vi.advanceTimersByTimeAsync(61_000);
      await service.handlePlayerDisconnected('FORF01', 'u3');
      await vi.advanceTimersByTimeAsync(61_000);

      expect(economy.settleMatch).toHaveBeenCalledWith('FORF01', [
        { userId: 'u1', displayName: 'Host', color: 'RED', place: 1 },
        { userId: 'u3', displayName: 'Guest B', color: 'YELLOW', place: 2 },
        { userId: 'u2', displayName: 'Guest A', color: 'GREEN', place: 3 },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('watchdog cancels idle room and ignores fresh room', async () => {
    const now = Date.now();
    const idleState: GameState = {
      roomCode: 'IDLE01',
      status: 'playing',
      players: [
        { userId: 'u1', displayName: 'Host', color: 'RED', tokens: [-1, -1, -1, -1], isForfeited: false },
        { userId: 'u2', displayName: 'Guest', color: 'GREEN', tokens: [-1, -1, -1, -1], isForfeited: false },
      ],
      economy: {
        entryFee: 100,
        pot: 200,
        participantUserIds: ['u1', 'u2'],
        skippedUserIds: [],
      },
      currentTurnIndex: 0,
      turnPhase: 'await_roll',
      dice: { value: null, isAuto: false },
      validMoves: [],
      finishedOrder: [],
      forfeitedOrder: [],
      lastUpdatedAt: new Date(now - 6 * 60 * 1000).toISOString(),
    };
    await redis.setJson(gameStateKey('IDLE01'), idleState);

    redis.listPlayingRooms.mockResolvedValueOnce(['IDLE01']);
    economy.cancelMatchForInactivity.mockResolvedValueOnce({
      entryFee: 100,
      pot: 200,
      refundedUserIds: ['u1', 'u2'],
    });
    const publisher = vi.fn();
    service.setPublisher(publisher);

    await (service as unknown as { runInactivityWatchdog: () => Promise<void> }).runInactivityWatchdog();
    expect(economy.cancelMatchForInactivity).toHaveBeenCalledWith('IDLE01');
    expect(publisher).toHaveBeenCalledWith(
      'game_cancelled',
      expect.objectContaining({
        roomCode: 'IDLE01',
        reason: 'idle_timeout',
        refundedUserIds: ['u1', 'u2'],
      }),
    );

    const freshState = {
      ...idleState,
      roomCode: 'FRESH1',
      lastUpdatedAt: new Date(now).toISOString(),
    };
    await redis.setJson(gameStateKey('FRESH1'), freshState);
    redis.listPlayingRooms.mockResolvedValueOnce(['FRESH1']);
    economy.cancelMatchForInactivity.mockClear();

    await (service as unknown as { runInactivityWatchdog: () => Promise<void> }).runInactivityWatchdog();
    expect(economy.cancelMatchForInactivity).not.toHaveBeenCalled();
  });
});
