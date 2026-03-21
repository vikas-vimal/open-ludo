import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomResponse,
  SetReadyRequest,
  StartRoomResponse,
} from '@open-ludo/contracts';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUserId } from '../auth/current-auth.decorator.js';
import { RoomsService } from './rooms.service.js';

const createRoomSchema = z.object({
  maxPlayers: z.union([z.literal(2), z.literal(3), z.literal(4)]),
});

const setReadySchema = z.object({
  ready: z.boolean(),
});

@UseGuards(AuthGuard)
@Controller('/v1/rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  async createRoom(
    @CurrentUserId() userId: string,
    @Body() body: CreateRoomRequest,
  ): Promise<CreateRoomResponse> {
    const parsed = createRoomSchema.parse(body);
    const room = await this.roomsService.createRoom(userId, parsed.maxPlayers);
    return { room };
  }

  @Post('/:code/join')
  async joinRoom(@CurrentUserId() userId: string, @Param('code') code: string): Promise<JoinRoomResponse> {
    const room = await this.roomsService.joinRoom(userId, code);
    return { room };
  }

  @Get('/:code')
  async getRoom(@Param('code') code: string): Promise<JoinRoomResponse> {
    const room = await this.roomsService.getRoomStateOrThrow(code);
    return { room };
  }

  @Post('/:code/ready')
  async setReady(
    @CurrentUserId() userId: string,
    @Param('code') code: string,
    @Body() body: SetReadyRequest,
  ): Promise<JoinRoomResponse> {
    const parsed = setReadySchema.parse(body);
    const room = await this.roomsService.setReady(userId, code, parsed.ready);
    return { room };
  }

  @Post('/:code/start')
  async startRoom(@CurrentUserId() userId: string, @Param('code') code: string): Promise<StartRoomResponse> {
    const room = await this.roomsService.startRoom(userId, code);
    return { room };
  }
}
