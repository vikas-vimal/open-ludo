import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileService } from '../src/profile/profile.service.js';

describe('ProfileService', () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    accountMerge: {
      findMany: vi.fn(),
    },
    matchSettlement: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  };

  let service: ProfileService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new ProfileService(prisma as never);
  });

  it('derives stats and history using merged guest identities', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'registered-user',
      kind: 'registered',
      email: 'sam@example.com',
      displayName: 'Sam',
      avatarKey: 'pawn_red',
      wallet: {
        coinBalance: 1900,
      },
    });
    prisma.accountMerge.findMany.mockResolvedValue([{ guestUserId: 'guest-user-1' }]);
    prisma.matchSettlement.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    prisma.matchSettlement.findMany.mockResolvedValue([
      {
        id: 'settlement-1',
        room: { code: 'ROOM01' },
        entryFee: 100,
        pot: 300,
        placementsJson: [
          { userId: 'guest-user-1', place: 2 },
          { userId: 'other', place: 1 },
        ],
        winnerUserId: 'other',
        settledAt: new Date('2026-03-22T10:00:00.000Z'),
        updatedAt: new Date('2026-03-22T10:00:00.000Z'),
      },
    ]);

    const profile = await service.getMyProfile('registered-user');

    expect(prisma.accountMerge.findMany).toHaveBeenCalledWith({
      where: { registeredUserId: 'registered-user' },
      select: { guestUserId: true },
    });
    expect(profile.profile.rank).toBe('GOLD');
    expect(profile.profile.stats).toEqual({
      gamesPlayed: 5,
      wins: 2,
      winRate: 40,
    });
    expect(profile.profile.history[0]).toEqual({
      settlementId: 'settlement-1',
      roomCode: 'ROOM01',
      entryFee: 100,
      pot: 300,
      place: 2,
      settledAt: '2026-03-22T10:00:00.000Z',
    });
  });

  it('updates display name and avatar key', async () => {
    prisma.user.update.mockResolvedValue({ id: 'registered-user' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'registered-user',
      kind: 'registered',
      email: 'sam@example.com',
      displayName: 'Updated Sam',
      avatarKey: 'pawn_blue',
      wallet: {
        coinBalance: 1200,
      },
    });
    prisma.accountMerge.findMany.mockResolvedValue([]);
    prisma.matchSettlement.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prisma.matchSettlement.findMany.mockResolvedValue([]);

    const updated = await service.updateMyProfile('registered-user', {
      displayName: 'Updated Sam',
      avatarKey: 'pawn_blue',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'registered-user' },
      data: {
        displayName: 'Updated Sam',
        avatarKey: 'pawn_blue',
      },
    });
    expect(updated.profile.displayName).toBe('Updated Sam');
    expect(updated.profile.avatarKey).toBe('pawn_blue');
  });
});
