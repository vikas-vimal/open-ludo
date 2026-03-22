import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EconomyService } from '../src/economy/economy.service.js';
import { ENTRY_FEE_COINS } from '../src/economy/economy.constants.js';

describe('EconomyService', () => {
  const tx = {
    matchSettlement: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    wallet: {
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    walletTransaction: {
      create: vi.fn(),
    },
    room: {
      findUnique: vi.fn(),
    },
  };

  const prisma = {
    $transaction: vi.fn(),
  };

  let service: EconomyService;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );
    tx.matchSettlement.create.mockResolvedValue({ id: 'settlement-1' });
    tx.wallet.updateMany.mockResolvedValue({ count: 1 });
    tx.walletTransaction.create.mockResolvedValue({});
    tx.room.findUnique.mockResolvedValue({ id: 'room-1' });
    tx.matchSettlement.findUnique.mockResolvedValue({
      id: 'settlement-1',
      roomId: 'room-1',
      entryFee: ENTRY_FEE_COINS,
      pot: 200,
      winnerUserId: null,
      status: 'PENDING',
    });
    tx.matchSettlement.updateMany.mockResolvedValue({ count: 1 });
    tx.wallet.update.mockResolvedValue({ userId: 'u1', coinBalance: 1200 });

    service = new EconomyService(prisma as never);
  });

  it('charges only funded players and creates entry-fee ledger rows', async () => {
    const prepared = await service.prepareMatchStart('room-1', [
      { userId: 'u1', displayName: 'Host', coinBalance: 1000 },
      { userId: 'u2', displayName: 'Guest', coinBalance: 20 },
      { userId: 'u3', displayName: 'Guest 2', coinBalance: 1400 },
    ]);

    expect(prepared.entryFee).toBe(ENTRY_FEE_COINS);
    expect(prepared.pot).toBe(200);
    expect(prepared.eligiblePlayers.map((player) => player.userId)).toEqual(['u1', 'u3']);
    expect(prepared.skippedUserIds).toEqual(['u2']);
    expect(tx.wallet.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        settlementId: 'settlement-1',
        kind: 'ENTRY_FEE',
        amount: -ENTRY_FEE_COINS,
      },
    });
    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u3',
        settlementId: 'settlement-1',
        kind: 'ENTRY_FEE',
        amount: -ENTRY_FEE_COINS,
      },
    });
  });

  it('rejects start when fewer than two players can afford entry fee', async () => {
    await expect(
      service.prepareMatchStart('room-1', [
        { userId: 'u1', displayName: 'Host', coinBalance: 99 },
        { userId: 'u2', displayName: 'Guest', coinBalance: 100 },
      ]),
    ).rejects.toMatchObject({
      response: { code: 'NOT_ENOUGH_FUNDED_PLAYERS' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('settles winner payout once and records payout ledger', async () => {
    const settled = await service.settleMatch('ABC123', [
      { userId: 'u1', displayName: 'Host', color: 'RED', place: 1 },
      { userId: 'u2', displayName: 'Guest', color: 'GREEN', place: 2 },
    ]);

    expect(tx.matchSettlement.updateMany).toHaveBeenCalledWith({
      where: { id: 'settlement-1', status: 'PENDING' },
      data: expect.objectContaining({
        status: 'SETTLED',
        winnerUserId: 'u1',
        placementsJson: [
          { userId: 'u1', displayName: 'Host', color: 'RED', place: 1 },
          { userId: 'u2', displayName: 'Guest', color: 'GREEN', place: 2 },
        ],
      }),
    });
    expect(tx.wallet.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { coinBalance: { increment: 200 } },
    });
    expect(tx.walletTransaction.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        settlementId: 'settlement-1',
        kind: 'PAYOUT',
        amount: 200,
      },
    });
    expect(settled).toEqual({
      winnerUserId: 'u1',
      entryFee: ENTRY_FEE_COINS,
      pot: 200,
    });
  });

  it('returns existing settled result without duplicating payout', async () => {
    tx.matchSettlement.findUnique.mockResolvedValueOnce({
      id: 'settlement-1',
      roomId: 'room-1',
      entryFee: ENTRY_FEE_COINS,
      pot: 200,
      winnerUserId: 'u1',
      status: 'SETTLED',
    });

    const settled = await service.settleMatch('ABC123', [
      { userId: 'u1', displayName: 'Host', color: 'RED', place: 1 },
      { userId: 'u2', displayName: 'Guest', color: 'GREEN', place: 2 },
    ]);

    expect(tx.matchSettlement.updateMany).not.toHaveBeenCalled();
    expect(tx.wallet.update).not.toHaveBeenCalled();
    expect(settled).toEqual({
      winnerUserId: 'u1',
      entryFee: ENTRY_FEE_COINS,
      pot: 200,
    });
  });
});
