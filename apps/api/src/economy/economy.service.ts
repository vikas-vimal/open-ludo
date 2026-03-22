import { HttpStatus, Injectable } from '@nestjs/common';
import type { PlacementEntry } from '@open-ludo/contracts';
import { Prisma } from '@prisma/client';
import { ApiException } from '../common/errors.js';
import { PrismaService } from '../common/prisma.service.js';
import { ENTRY_FEE_COINS } from './economy.constants.js';

type StartPlayerWallet = {
  userId: string;
  displayName: string;
  coinBalance: number;
};

export type PreparedMatchStart = {
  entryFee: number;
  pot: number;
  eligiblePlayers: Array<{ userId: string; displayName: string }>;
  skippedUserIds: string[];
};

export type MatchSettlementSummary = {
  winnerUserId: string;
  entryFee: number;
  pot: number;
};

@Injectable()
export class EconomyService {
  constructor(private readonly prisma: PrismaService) {}

  async prepareMatchStart(
    roomId: string,
    players: StartPlayerWallet[],
  ): Promise<PreparedMatchStart> {
    const eligiblePlayers = players
      .filter((player) => player.coinBalance >= ENTRY_FEE_COINS)
      .map((player) => ({
        userId: player.userId,
        displayName: player.displayName,
      }));
    const skippedUserIds = players
      .filter((player) => player.coinBalance < ENTRY_FEE_COINS)
      .map((player) => player.userId);

    if (eligiblePlayers.length < 2) {
      throw new ApiException(
        'NOT_ENOUGH_FUNDED_PLAYERS',
        'At least 2 players with enough coins are required to start.',
        HttpStatus.CONFLICT,
      );
    }

    const pot = ENTRY_FEE_COINS * eligiblePlayers.length;

    try {
      await this.prisma.$transaction(async (tx) => {
        const settlement = await tx.matchSettlement.create({
          data: {
            roomId,
            entryFee: ENTRY_FEE_COINS,
            pot,
            participantUserIds: eligiblePlayers.map((player) => player.userId),
            skippedUserIds,
          },
        });

        for (const player of eligiblePlayers) {
          const updated = await tx.wallet.updateMany({
            where: {
              userId: player.userId,
              coinBalance: { gte: ENTRY_FEE_COINS },
            },
            data: {
              coinBalance: { decrement: ENTRY_FEE_COINS },
            },
          });

          if (updated.count !== 1) {
            throw new ApiException(
              'NOT_ENOUGH_FUNDED_PLAYERS',
              'Not enough funded players to start the match.',
              HttpStatus.CONFLICT,
            );
          }

          await tx.walletTransaction.create({
            data: {
              userId: player.userId,
              settlementId: settlement.id,
              kind: 'ENTRY_FEE',
              amount: -ENTRY_FEE_COINS,
            },
          });
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiException('ROOM_NOT_WAITING', 'Room has already started.', HttpStatus.CONFLICT);
      }
      throw error;
    }

    return {
      entryFee: ENTRY_FEE_COINS,
      pot,
      eligiblePlayers,
      skippedUserIds,
    };
  }

  async settleMatch(roomCode: string, placements: PlacementEntry[]): Promise<MatchSettlementSummary | null> {
    const winnerUserId = placements[0]?.userId;
    if (!winnerUserId) {
      return null;
    }

    return this.prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({
        where: { code: roomCode },
        select: { id: true },
      });

      if (!room) {
        throw new ApiException('ROOM_NOT_FOUND', 'Room does not exist.', HttpStatus.NOT_FOUND);
      }

      const settlement = await tx.matchSettlement.findUnique({
        where: { roomId: room.id },
      });

      if (!settlement) {
        return null;
      }

      if (settlement.status === 'SETTLED') {
        return {
          winnerUserId: settlement.winnerUserId ?? winnerUserId,
          entryFee: settlement.entryFee,
          pot: settlement.pot,
        };
      }

      const updated = await tx.matchSettlement.updateMany({
        where: {
          id: settlement.id,
          status: 'PENDING',
        },
        data: {
          status: 'SETTLED',
          winnerUserId,
          settledAt: new Date(),
        },
      });

      if (updated.count === 0) {
        const latest = await tx.matchSettlement.findUnique({
          where: { id: settlement.id },
        });
        if (!latest) {
          return null;
        }
        return {
          winnerUserId: latest.winnerUserId ?? winnerUserId,
          entryFee: latest.entryFee,
          pot: latest.pot,
        };
      }

      await tx.wallet.update({
        where: { userId: winnerUserId },
        data: {
          coinBalance: { increment: settlement.pot },
        },
      });

      await tx.walletTransaction.create({
        data: {
          userId: winnerUserId,
          settlementId: settlement.id,
          kind: 'PAYOUT',
          amount: settlement.pot,
        },
      });

      return {
        winnerUserId,
        entryFee: settlement.entryFee,
        pot: settlement.pot,
      };
    });
  }
}
