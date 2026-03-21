import { Injectable } from '@nestjs/common';
import type { AuthContext } from '@open-ludo/contracts';
import type { UserKind } from '@prisma/client';
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
    };
  }
}
