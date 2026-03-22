import { Injectable } from '@nestjs/common';
import type { AuthContext } from '@open-ludo/contracts';
import { Prisma, type UserKind } from '../generated/prisma/client.js';
import { ApiException } from '../common/errors.js';
import { PrismaService } from '../common/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureUserFromAuth(auth: AuthContext): Promise<{ id: string; coinBalance: number }> {
    const kind: UserKind = auth.userKind === 'guest' ? 'guest' : 'registered';

    const user = await this.prisma.user.upsert({
      where: { externalId: auth.subjectId },
      update: {
        displayName: auth.displayName,
        email: auth.email,
        kind,
      },
      create: {
        externalId: auth.subjectId,
        displayName: auth.displayName,
        email: auth.email,
        kind,
      },
    });

    const wallet = await this.prisma.wallet.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        coinBalance: 1000,
      },
    });

    return { id: user.id, coinBalance: wallet.coinBalance };
  }

  async findByExternalId(externalId: string): Promise<{ id: string; displayName: string } | null> {
    const user = await this.prisma.user.findUnique({
      where: { externalId },
      select: { id: true, displayName: true },
    });

    return user;
  }

  async getById(userId: string): Promise<{
    id: string;
    displayName: string;
    email: string | null;
    kind: 'guest' | 'registered';
    coinBalance: number;
    avatarKey: string;
  } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true },
    });

    if (!user || !user.wallet) {
      return null;
    }

    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      kind: user.kind,
      coinBalance: user.wallet.coinBalance,
      avatarKey: user.avatarKey,
    };
  }

  async mergeGuestIntoRegistered(
    guestUserId: string,
    registeredUserId: string,
  ): Promise<{ merged: boolean }> {
    if (guestUserId === registeredUserId) {
      throw new ApiException('UPGRADE_NOT_ALLOWED', 'Guest identity cannot be merged into itself.', 409);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const [guestUser, registeredUser] = await Promise.all([
          tx.user.findUnique({
            where: { id: guestUserId },
            include: { wallet: true },
          }),
          tx.user.findUnique({
            where: { id: registeredUserId },
            include: { wallet: true },
          }),
        ]);

        if (!guestUser || !registeredUser) {
          throw new ApiException('UPGRADE_NOT_ALLOWED', 'Merge users could not be resolved.', 404);
        }
        if (guestUser.kind !== 'guest') {
          throw new ApiException('GUEST_TOKEN_REQUIRED', 'A guest token is required for upgrade.', 409);
        }
        if (registeredUser.kind !== 'registered') {
          throw new ApiException('UPGRADE_NOT_ALLOWED', 'Only registered accounts can receive upgrades.', 409);
        }

        const existingMerge = await tx.accountMerge.findUnique({
          where: { guestUserId },
        });
        if (existingMerge) {
          if (existingMerge.registeredUserId !== registeredUserId) {
            throw new ApiException('GUEST_ALREADY_UPGRADED', 'Guest session was already upgraded.', 409);
          }
          return { merged: false };
        }

        const guestWallet = guestUser.wallet
          ? guestUser.wallet
          : await tx.wallet.upsert({
              where: { userId: guestUserId },
              update: {},
              create: { userId: guestUserId, coinBalance: 1000 },
            });
        await tx.wallet.upsert({
          where: { userId: registeredUserId },
          update: {},
          create: { userId: registeredUserId, coinBalance: 1000 },
        });

        await tx.accountMerge.create({
          data: {
            guestUserId,
            registeredUserId,
          },
        });

        if (guestWallet.coinBalance > 0) {
          await tx.wallet.update({
            where: { userId: registeredUserId },
            data: { coinBalance: { increment: guestWallet.coinBalance } },
          });
          await tx.wallet.update({
            where: { userId: guestUserId },
            data: { coinBalance: 0 },
          });
        }

        return { merged: true };
      });
    } catch (error) {
      if (error instanceof ApiException) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existingMerge = await this.prisma.accountMerge.findUnique({
          where: { guestUserId },
        });
        if (existingMerge && existingMerge.registeredUserId === registeredUserId) {
          return { merged: false };
        }
        throw new ApiException('GUEST_ALREADY_UPGRADED', 'Guest session was already upgraded.', 409);
      }
      throw error;
    }
  }
}
