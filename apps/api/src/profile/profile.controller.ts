import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import type {
  GetMyProfileResponse,
  UpdateMyProfileRequest,
  UpdateMyProfileResponse,
} from '@open-ludo/contracts';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUserId } from '../auth/current-auth.decorator.js';
import { ProfileService } from './profile.service.js';

const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(2).max(24).optional(),
    avatarKey: z.string().min(1).optional(),
  })
  .refine((value) => value.displayName !== undefined || value.avatarKey !== undefined, {
    message: 'At least one field must be provided.',
  });

@UseGuards(AuthGuard)
@Controller('/v1/profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('/me')
  async myProfile(@CurrentUserId() userId: string): Promise<GetMyProfileResponse> {
    return this.profileService.getMyProfile(userId);
  }

  @Patch('/me')
  async updateProfile(
    @CurrentUserId() userId: string,
    @Body() body: UpdateMyProfileRequest,
  ): Promise<UpdateMyProfileResponse> {
    const parsed = updateProfileSchema.parse(body);
    return this.profileService.updateMyProfile(userId, parsed);
  }
}
