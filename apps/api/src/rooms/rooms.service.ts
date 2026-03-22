import { HttpStatus, Injectable } from '@nestjs/common';
import type { RoomState } from '@open-ludo/contracts';
import { ApiException } from '../common/errors.js';
import { PrismaService } from '../common/prisma.service.js';
import { RedisService } from '../common/redis.service.js';
import { EconomyService } from '../economy/economy.service.js';
import { GameEngineService } from '../game/game-engine.service.js';
import { electNextHost } from './host-transfer.util.js';
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from './room-code.util.js';

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly economy: EconomyService,
    private readonly gameEngine: GameEngineService,
  ) {}

  async createRoom(userId: string, maxPlayers: 2 | 3 | 4): Promise<RoomState> {
    if (![2, 3, 4].includes(maxPlayers)) {
      throw new ApiException('INVALID_MAX_PLAYERS', 'maxPlayers must be 2, 3, or 4.');
    }

    const code = await this.generateUniqueRoomCode();

    await this.prisma.$transaction(async (tx) => {
      const room = await tx.room.create({
        data: {
          code,
          hostUserId: userId,
          maxPlayers,
          status: 'waiting',
        },
      });

      await tx.roomPlayer.upsert({
        where: {
          roomId_userId: {
            roomId: room.id,
            userId,
          },
        },
        update: {
          isHost: true,
          isReady: false,
          leftAt: null,
          joinedAt: new Date(),
        },
        create: {
          roomId: room.id,
          userId,
          isHost: true,
          isReady: false,
          leftAt: null,
        },
      });
    });

    await this.redis.markConnected(code, userId);

    return this.getRoomStateOrThrow(code);
  }

  async joinRoom(userId: string, rawRoomCode: string): Promise<RoomState> {
    const roomCode = normalizeRoomCode(rawRoomCode);
    if (!isValidRoomCode(roomCode)) {
      throw new ApiException('INVALID_ROOM_CODE', 'Room code must be a 6 character alphanumeric code.');
    }

    const room = await this.prisma.room.findUnique({
      where: { code: roomCode },
      include: {
        players: {
          where: { leftAt: null },
          select: { userId: true },
        },
      },
    });

    if (!room) {
      throw new ApiException('ROOM_NOT_FOUND', 'Room does not exist.', HttpStatus.NOT_FOUND);
    }

    const existing = await this.prisma.roomPlayer.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId,
        },
      },
    });

    const activeCount = room.players.length;
    const existingIsActive = Boolean(existing && existing.leftAt === null);

    if (room.status !== 'waiting') {
      if (!existingIsActive) {
        throw new ApiException('ROOM_NOT_WAITING', 'Room has already started.', HttpStatus.CONFLICT);
      }
      await this.redis.markConnected(roomCode, userId);
      await this.gameEngine.handlePlayerReconnected(roomCode, userId);
      return this.getRoomStateOrThrow(roomCode);
    }

    if (!existingIsActive && activeCount >= room.maxPlayers) {
      throw new ApiException('ROOM_FULL', 'Room is full.', HttpStatus.CONFLICT);
    }

    if (existing) {
      await this.prisma.roomPlayer.update({
        where: { roomId_userId: { roomId: room.id, userId } },
        data: {
          leftAt: null,
          isReady: existingIsActive ? existing.isReady : false,
          joinedAt: existingIsActive ? existing.joinedAt : new Date(),
        },
      });
    } else {
      await this.prisma.roomPlayer.create({
        data: {
          roomId: room.id,
          userId,
          isHost: false,
          isReady: false,
          leftAt: null,
        },
      });
    }

    await this.redis.markConnected(roomCode, userId);
    await this.gameEngine.handlePlayerReconnected(roomCode, userId);

    return this.getRoomStateOrThrow(roomCode);
  }

  async getRoomStateOrThrow(rawRoomCode: string): Promise<RoomState> {
    const roomCode = normalizeRoomCode(rawRoomCode);
    if (!isValidRoomCode(roomCode)) {
      throw new ApiException('INVALID_ROOM_CODE', 'Room code must be a 6 character alphanumeric code.');
    }

    const room = await this.prisma.room.findUnique({
      where: { code: roomCode },
      include: {
        players: {
          where: { leftAt: null },
          include: {
            user: {
              include: {
                wallet: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!room) {
      throw new ApiException('ROOM_NOT_FOUND', 'Room does not exist.', HttpStatus.NOT_FOUND);
    }

    const connectedSet = await this.redis.connectedUserSet(roomCode);

    return {
      room: {
        id: room.id,
        code: room.code,
        hostUserId: room.hostUserId,
        status: room.status,
        maxPlayers: room.maxPlayers as 2 | 3 | 4,
        createdAt: room.createdAt.toISOString(),
      },
      players: room.players.map((player) => ({
        userId: player.userId,
        displayName: player.user.displayName,
        isHost: room.hostUserId === player.userId,
        isReady: player.isReady,
        joinedAt: player.joinedAt.toISOString(),
        isConnected: connectedSet.has(player.userId),
      })),
    };
  }

  async setReady(userId: string, rawRoomCode: string, ready: boolean): Promise<RoomState> {
    const roomCode = normalizeRoomCode(rawRoomCode);
    const room = await this.requireRoomByCode(roomCode);
    if (room.status !== 'waiting') {
      throw new ApiException('ROOM_NOT_WAITING', 'Room is not waiting.', HttpStatus.CONFLICT);
    }

    await this.ensurePlayerInRoom(room.id, userId);

    await this.prisma.roomPlayer.update({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId,
        },
      },
      data: {
        isReady: ready,
        leftAt: null,
      },
    });

    await this.redis.markConnected(roomCode, userId);

    return this.getRoomStateOrThrow(roomCode);
  }

  async startRoom(userId: string, rawRoomCode: string): Promise<RoomState> {
    const roomCode = normalizeRoomCode(rawRoomCode);
    const room = await this.prisma.room.findUnique({
      where: { code: roomCode },
      include: {
        players: {
          where: { leftAt: null },
          include: {
            user: {
              include: {
                wallet: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!room) {
      throw new ApiException('ROOM_NOT_FOUND', 'Room does not exist.', HttpStatus.NOT_FOUND);
    }

    if (room.hostUserId !== userId) {
      throw new ApiException('NOT_HOST', 'Only host can start the match.', HttpStatus.FORBIDDEN);
    }

    if (room.status !== 'waiting') {
      throw new ApiException('ROOM_NOT_WAITING', 'Room is not waiting.', HttpStatus.CONFLICT);
    }

    if (room.players.length < 2) {
      throw new ApiException('INVALID_MOVE', 'At least 2 players are required to start.', HttpStatus.CONFLICT);
    }

    const prepared = await this.economy.prepareMatchStart(
      room.id,
      room.players.map((player) => ({
        userId: player.userId,
        displayName: player.user.displayName,
        coinBalance: player.user.wallet?.coinBalance ?? 0,
      })),
    );

    await this.prisma.room.update({
      where: { id: room.id },
      data: { status: 'playing' },
    });

    await this.gameEngine.initializeGame(
      roomCode,
      prepared.eligiblePlayers.map((player) => ({
        userId: player.userId,
        displayName: player.displayName,
      })),
      {
        entryFee: prepared.entryFee,
        pot: prepared.pot,
        participantUserIds: prepared.eligiblePlayers.map((player) => player.userId),
        skippedUserIds: prepared.skippedUserIds,
      },
    );

    return this.getRoomStateOrThrow(roomCode);
  }

  async handleDisconnect(
    userId: string,
    rawRoomCode: string,
  ): Promise<{ roomState: RoomState; hostTransferred: boolean }> {
    const roomCode = normalizeRoomCode(rawRoomCode);
    await this.redis.markDisconnected(roomCode, userId);
    await this.gameEngine.handlePlayerDisconnected(roomCode, userId);

    const hostTransferred = await this.transferHostIfNeeded(roomCode);
    const roomState = await this.getRoomStateOrThrow(roomCode);

    return { roomState, hostTransferred };
  }

  async leaveRoom(userId: string, rawRoomCode: string): Promise<{ roomState: RoomState; hostTransferred: boolean }> {
    const roomCode = normalizeRoomCode(rawRoomCode);
    const room = await this.requireRoomByCode(roomCode);
    await this.ensurePlayerInRoom(room.id, userId);

    await this.prisma.roomPlayer.update({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId,
        },
      },
      data: {
        leftAt: new Date(),
        isHost: false,
        isReady: false,
      },
    });

    await this.redis.markDisconnected(roomCode, userId);
    await this.gameEngine.handlePlayerDisconnected(roomCode, userId);

    const hostTransferred = await this.transferHostIfNeeded(roomCode);
    const roomState = await this.getRoomStateOrThrow(roomCode);

    return { roomState, hostTransferred };
  }

  private async transferHostIfNeeded(roomCode: string): Promise<boolean> {
    const room = await this.prisma.room.findUnique({
      where: { code: roomCode },
      include: {
        players: {
          where: { leftAt: null },
          orderBy: { joinedAt: 'asc' },
          select: {
            userId: true,
            joinedAt: true,
          },
        },
      },
    });

    if (!room) {
      return false;
    }

    const connectedSet = await this.redis.connectedUserSet(roomCode);

    if (connectedSet.has(room.hostUserId)) {
      return false;
    }

    const nextHost = electNextHost(
      room.players.map((player) => ({
        userId: player.userId,
        joinedAt: player.joinedAt,
        isConnected: connectedSet.has(player.userId),
      })),
    );

    if (!nextHost) {
      return false;
    }

    await this.prisma.$transaction([
      this.prisma.room.update({
        where: { id: room.id },
        data: { hostUserId: nextHost },
      }),
      this.prisma.roomPlayer.updateMany({
        where: { roomId: room.id },
        data: { isHost: false },
      }),
      this.prisma.roomPlayer.update({
        where: {
          roomId_userId: {
            roomId: room.id,
            userId: nextHost,
          },
        },
        data: { isHost: true },
      }),
    ]);

    return true;
  }

  private async requireRoomByCode(roomCode: string) {
    if (!isValidRoomCode(roomCode)) {
      throw new ApiException('INVALID_ROOM_CODE', 'Room code must be a 6 character alphanumeric code.');
    }

    const room = await this.prisma.room.findUnique({
      where: { code: roomCode },
    });

    if (!room) {
      throw new ApiException('ROOM_NOT_FOUND', 'Room does not exist.', HttpStatus.NOT_FOUND);
    }

    return room;
  }

  private async ensurePlayerInRoom(roomId: string, userId: string): Promise<void> {
    const player = await this.prisma.roomPlayer.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId,
        },
      },
    });

    if (!player || player.leftAt !== null) {
      throw new ApiException('ROOM_NOT_FOUND', 'Player is not part of room.', HttpStatus.NOT_FOUND);
    }
  }

  private async generateUniqueRoomCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = generateRoomCode(6);
      const existing = await this.prisma.room.findUnique({ where: { code } });
      if (!existing) {
        return code;
      }
    }

    throw new ApiException(
      'INVALID_ROOM_CODE',
      'Could not allocate a unique room code. Retry request.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
