import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type {
  CreateGuestRequest,
  CreateGuestResponse,
  GetMeResponse,
  UpgradeGuestRequest,
  UpgradeGuestResponse,
} from '@open-ludo/contracts';
import { z } from 'zod';
import { CurrentAuth, CurrentUserId } from './current-auth.decorator.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { ApiException } from '../common/errors.js';
import type { AuthContext } from '@open-ludo/contracts';

const createGuestSchema = z.object({
  displayName: z.string().trim().min(2).max(24),
});

const upgradeGuestSchema = z.object({
  guestAccessToken: z.string().min(1),
});

@Controller('/v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('/guest')
  async createGuest(@Body() body: CreateGuestRequest): Promise<CreateGuestResponse> {
    const parsed = createGuestSchema.parse(body);
    return this.authService.createGuest(parsed.displayName);
  }

  @Get('/me')
  @UseGuards(AuthGuard)
  async me(@CurrentUserId() userId: string): Promise<GetMeResponse> {
    const user = await this.usersService.getById(userId);
    if (!user) {
      throw new ApiException('INVALID_TOKEN', 'Authenticated user not found', 401);
    }

    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        coinBalance: user.coinBalance,
        kind: user.kind,
        email: user.email ?? undefined,
        avatarKey: user.avatarKey,
      },
    };
  }

  @Post('/upgrade')
  @UseGuards(AuthGuard)
  async upgradeGuest(
    @CurrentUserId() userId: string,
    @CurrentAuth() auth: AuthContext,
    @Body() body: UpgradeGuestRequest,
  ): Promise<UpgradeGuestResponse> {
    const parsed = upgradeGuestSchema.parse(body);
    return this.authService.upgradeGuestToRegistered(userId, auth, parsed.guestAccessToken);
  }
}
