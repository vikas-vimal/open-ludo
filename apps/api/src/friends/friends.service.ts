import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AcceptFriendInviteResponse,
  AuthContext,
  CreateFriendInviteResponse,
  ProfileFriendEntry,
} from '@open-ludo/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { randomBytes } from 'node:crypto';
import { ApiException } from '../common/errors.js';
import { getEnv } from '../common/env.js';
import { PrismaService } from '../common/prisma.service.js';
import { deriveProfileRank } from '../profile/profile.constants.js';

const INVITE_TOKEN_BYTES = 18;

export function canonicalFriendPair(userIdA: string, userIdB: string): { userAId: string; userBId: string } {
  return userIdA < userIdB
    ? {
        userAId: userIdA,
        userBId: userIdB,
      }
    : {
        userAId: userIdB,
        userBId: userIdA,
      };
}

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  async createInvite(userId: string, auth: AuthContext): Promise<CreateFriendInviteResponse> {
    this.ensureRegistered(auth);
    await this.requireRegisteredUser(userId);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = randomBytes(INVITE_TOKEN_BYTES).toString('base64url');

      try {
        await this.prisma.friendInvite.create({
          data: {
            token,
            inviterUserId: userId,
          },
        });

        return {
          token,
          inviteUrl: `${getEnv().WEB_ORIGIN}/invite/${token}`,
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue;
        }
        throw error;
      }
    }

    throw new ApiException(
      'INVITE_INVALID',
      'Could not generate invite link. Try again.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  async acceptInvite(userId: string, auth: AuthContext, rawToken: string): Promise<AcceptFriendInviteResponse> {
    this.ensureRegistered(auth);
    await this.requireRegisteredUser(userId);

    const token = rawToken.trim();
    if (token.length === 0) {
      throw new ApiException('INVITE_INVALID', 'Invite token is invalid.', HttpStatus.BAD_REQUEST);
    }

    return this.prisma.$transaction(async (tx) => {
      const invite = await tx.friendInvite.findUnique({
        where: { token },
        include: {
          inviter: {
            include: {
              wallet: true,
            },
          },
        },
      });

      if (!invite) {
        throw new ApiException('INVITE_INVALID', 'Invite link is invalid.', HttpStatus.NOT_FOUND);
      }

      if (invite.inviterUserId === userId) {
        throw new ApiException('INVITE_SELF', 'You cannot accept your own invite.', HttpStatus.CONFLICT);
      }

      if (invite.consumedAt) {
        throw new ApiException('INVITE_ALREADY_USED', 'Invite link has already been used.', HttpStatus.CONFLICT);
      }

      const consume = await tx.friendInvite.updateMany({
        where: {
          id: invite.id,
          consumedAt: null,
        },
        data: {
          consumedByUserId: userId,
          consumedAt: new Date(),
        },
      });

      if (consume.count === 0) {
        throw new ApiException('INVITE_ALREADY_USED', 'Invite link has already been used.', HttpStatus.CONFLICT);
      }

      const { userAId, userBId } = canonicalFriendPair(invite.inviterUserId, userId);
      await tx.friendship.upsert({
        where: {
          userAId_userBId: {
            userAId,
            userBId,
          },
        },
        update: {},
        create: {
          userAId,
          userBId,
        },
      });

      const friend = this.toFriendEntry(invite.inviter.id, {
        displayName: invite.inviter.displayName,
        avatarKey: invite.inviter.avatarKey,
        coinBalance: invite.inviter.wallet?.coinBalance ?? 0,
      });

      return { friend };
    });
  }

  private toFriendEntry(
    userId: string,
    input: { displayName: string; avatarKey: string; coinBalance: number },
  ): ProfileFriendEntry {
    return {
      id: userId,
      displayName: input.displayName,
      avatarKey: input.avatarKey,
      coinBalance: input.coinBalance,
      rank: deriveProfileRank(input.coinBalance),
    };
  }

  private ensureRegistered(auth: AuthContext): void {
    if (auth.userKind !== 'registered') {
      throw new ApiException(
        'REGISTERED_REQUIRED',
        'This action requires a registered account.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async requireRegisteredUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { kind: true },
    });

    if (!user || user.kind !== 'registered') {
      throw new ApiException(
        'REGISTERED_REQUIRED',
        'This action requires a registered account.',
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
