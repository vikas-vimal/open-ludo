import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import type {
  AcceptFriendInviteResponse,
  AuthContext,
  CreateFriendInviteResponse,
} from '@open-ludo/contracts';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentAuth, CurrentUserId } from '../auth/current-auth.decorator.js';
import { FriendsService } from './friends.service.js';

const tokenParamSchema = z.object({
  token: z.string().trim().min(1),
});

@UseGuards(AuthGuard)
@Controller('/v1/friends')
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Post('/invites')
  async createInvite(
    @CurrentUserId() userId: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<CreateFriendInviteResponse> {
    return this.friendsService.createInvite(userId, auth);
  }

  @Post('/invites/:token/accept')
  async acceptInvite(
    @CurrentUserId() userId: string,
    @CurrentAuth() auth: AuthContext,
    @Param() params: { token: string },
  ): Promise<AcceptFriendInviteResponse> {
    const parsed = tokenParamSchema.parse(params);
    return this.friendsService.acceptInvite(userId, auth, parsed.token);
  }
}
