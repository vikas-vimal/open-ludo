import { Injectable } from '@nestjs/common';
import type {
  GetMyProfileResponse,
  ProfileHistoryEntry,
  UpdateMyProfileRequest,
  UpdateMyProfileResponse,
} from '@open-ludo/contracts';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/errors.js';
import { PrismaService } from '../common/prisma.service.js';
import { deriveProfileRank, isValidAvatarKey } from './profile.constants.js';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyProfile(userId: string): Promise<GetMyProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true },
    });

    if (!user || !user.wallet) {
      throw new ApiException('INVALID_TOKEN', 'Authenticated user not found.', 401);
    }

    const identityUserIds = await this.resolveIdentityUserIds(user.id, user.kind);
    const historyWhere = this.buildHistoryWhere(identityUserIds);

    const [gamesPlayed, wins, settlements] = await Promise.all([
      this.prisma.matchSettlement.count({ where: historyWhere }),
      this.prisma.matchSettlement.count({
        where: {
          status: 'SETTLED',
          winnerUserId: { in: identityUserIds },
        },
      }),
      this.prisma.matchSettlement.findMany({
        where: historyWhere,
        include: {
          room: {
            select: {
              code: true,
            },
          },
        },
        orderBy: { settledAt: 'desc' },
        take: 20,
      }),
    ]);

    const winRate = gamesPlayed === 0 ? 0 : Number(((wins / gamesPlayed) * 100).toFixed(2));
    const history: ProfileHistoryEntry[] = settlements.map((settlement) => ({
      settlementId: settlement.id,
      roomCode: settlement.room.code,
      entryFee: settlement.entryFee,
      pot: settlement.pot,
      place: this.resolvePlace(settlement.placementsJson, identityUserIds, settlement.winnerUserId),
      settledAt: (settlement.settledAt ?? settlement.updatedAt).toISOString(),
    }));

    return {
      profile: {
        id: user.id,
        displayName: user.displayName,
        avatarKey: user.avatarKey,
        kind: user.kind,
        email: user.email ?? undefined,
        coinBalance: user.wallet.coinBalance,
        rank: deriveProfileRank(user.wallet.coinBalance),
        stats: {
          gamesPlayed,
          wins,
          winRate,
        },
        history,
      },
    };
  }

  async updateMyProfile(userId: string, input: UpdateMyProfileRequest): Promise<UpdateMyProfileResponse> {
    const data: Prisma.UserUpdateInput = {};

    if (typeof input.displayName === 'string') {
      const displayName = input.displayName.trim();
      if (displayName.length < 2 || displayName.length > 24) {
        throw new ApiException('INVALID_NAME', 'Display name must be between 2 and 24 characters.');
      }
      data.displayName = displayName;
    }

    if (typeof input.avatarKey === 'string') {
      if (!isValidAvatarKey(input.avatarKey)) {
        throw new ApiException('PROFILE_INVALID_AVATAR', 'Avatar key is invalid.', 400);
      }
      data.avatarKey = input.avatarKey;
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data,
      });
    }

    return this.getMyProfile(userId);
  }

  private async resolveIdentityUserIds(userId: string, kind: 'guest' | 'registered'): Promise<string[]> {
    if (kind !== 'registered') {
      return [userId];
    }

    const merges = await this.prisma.accountMerge.findMany({
      where: { registeredUserId: userId },
      select: { guestUserId: true },
    });

    return [userId, ...merges.map((merge) => merge.guestUserId)];
  }

  private buildHistoryWhere(identityUserIds: string[]): Prisma.MatchSettlementWhereInput {
    return {
      status: 'SETTLED',
      OR: identityUserIds.map((id) => ({
        participantUserIds: {
          array_contains: [id],
        },
      })),
    };
  }

  private resolvePlace(
    placementsJson: Prisma.JsonValue | null,
    identityUserIds: string[],
    winnerUserId: string | null,
  ): number | null {
    if (Array.isArray(placementsJson)) {
      for (const entry of placementsJson) {
        if (
          entry &&
          typeof entry === 'object' &&
          'userId' in entry &&
          'place' in entry &&
          typeof entry.userId === 'string' &&
          typeof entry.place === 'number' &&
          identityUserIds.includes(entry.userId)
        ) {
          return entry.place;
        }
      }
    }

    if (winnerUserId && identityUserIds.includes(winnerUserId)) {
      return 1;
    }

    return null;
  }
}
