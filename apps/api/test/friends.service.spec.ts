import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalFriendPair, FriendsService } from '../src/friends/friends.service.js';

describe('FriendsService', () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    friendInvite: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    friendship: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  let service: FriendsService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new FriendsService(prisma as never);

    prisma.user.findUnique.mockResolvedValue({ kind: 'registered' });
    prisma.friendInvite.create.mockResolvedValue({ id: 'invite-1' });
    prisma.friendInvite.updateMany.mockResolvedValue({ count: 1 });
    prisma.friendship.upsert.mockResolvedValue({ id: 'friendship-1' });
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback({
        friendInvite: prisma.friendInvite,
        friendship: prisma.friendship,
      });
    });
  });

  it('normalizes canonical friend pairs', () => {
    expect(canonicalFriendPair('u2', 'u1')).toEqual({ userAId: 'u1', userBId: 'u2' });
  });

  it('creates single-use invite for registered users', async () => {
    const result = await service.createInvite('registered-user', {
      subjectId: 'supa-user',
      userKind: 'registered',
      displayName: 'Riya',
      tokenIssuer: 'supabase',
    });

    expect(result.token.length).toBeGreaterThan(10);
    expect(result.inviteUrl).toContain('/invite/');
    expect(prisma.friendInvite.create).toHaveBeenCalledWith({
      data: {
        token: expect.any(String),
        inviterUserId: 'registered-user',
      },
    });
  });

  it('rejects invite generation for guest sessions', async () => {
    await expect(
      service.createInvite('guest-user', {
        subjectId: 'guest-user',
        userKind: 'guest',
        displayName: 'Guest',
        tokenIssuer: 'guest',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'REGISTERED_REQUIRED',
      },
    });
  });

  it('accepts invite once and creates friendship', async () => {
    prisma.friendInvite.findUnique.mockResolvedValue({
      id: 'invite-1',
      token: 'token-abc',
      inviterUserId: 'inviter-1',
      consumedAt: null,
      inviter: {
        id: 'inviter-1',
        displayName: 'Inviter',
        avatarKey: 'pawn_blue',
        wallet: {
          coinBalance: 1850,
        },
      },
    });

    const accepted = await service.acceptInvite(
      'recipient-1',
      {
        subjectId: 'recipient-auth',
        userKind: 'registered',
        displayName: 'Recipient',
        tokenIssuer: 'supabase',
      },
      'token-abc',
    );

    expect(prisma.friendInvite.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'invite-1',
        consumedAt: null,
      },
      data: {
        consumedByUserId: 'recipient-1',
        consumedAt: expect.any(Date),
      },
    });
    expect(prisma.friendship.upsert).toHaveBeenCalledWith({
      where: {
        userAId_userBId: {
          userAId: 'inviter-1',
          userBId: 'recipient-1',
        },
      },
      update: {},
      create: {
        userAId: 'inviter-1',
        userBId: 'recipient-1',
      },
    });
    expect(accepted.friend).toEqual({
      id: 'inviter-1',
      displayName: 'Inviter',
      avatarKey: 'pawn_blue',
      coinBalance: 1850,
      rank: 'GOLD',
    });
  });

  it('rejects invite reuse when already consumed', async () => {
    prisma.friendInvite.findUnique.mockResolvedValue({
      id: 'invite-1',
      token: 'token-abc',
      inviterUserId: 'inviter-1',
      consumedAt: new Date('2026-03-22T11:00:00.000Z'),
      inviter: {
        id: 'inviter-1',
        displayName: 'Inviter',
        avatarKey: 'pawn_blue',
        wallet: {
          coinBalance: 1850,
        },
      },
    });

    await expect(
      service.acceptInvite(
        'recipient-1',
        {
          subjectId: 'recipient-auth',
          userKind: 'registered',
          displayName: 'Recipient',
          tokenIssuer: 'supabase',
        },
        'token-abc',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'INVITE_ALREADY_USED',
      },
    });
  });

  it('rejects self-invite accept', async () => {
    prisma.friendInvite.findUnique.mockResolvedValue({
      id: 'invite-1',
      token: 'token-abc',
      inviterUserId: 'recipient-1',
      consumedAt: null,
      inviter: {
        id: 'recipient-1',
        displayName: 'Inviter',
        avatarKey: 'pawn_blue',
        wallet: {
          coinBalance: 1850,
        },
      },
    });

    await expect(
      service.acceptInvite(
        'recipient-1',
        {
          subjectId: 'recipient-auth',
          userKind: 'registered',
          displayName: 'Recipient',
          tokenIssuer: 'supabase',
        },
        'token-abc',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'INVITE_SELF',
      },
    });
  });
});
