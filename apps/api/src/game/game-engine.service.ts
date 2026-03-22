import { HttpStatus, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type {
  GameEndPayload,
  GameState,
  GameStatePayload,
  PlacementEntry,
  PlayerColor,
  ValidMove,
} from '@open-ludo/contracts';
import { PrismaService } from '../common/prisma.service.js';
import { RedisService } from '../common/redis.service.js';
import { ApiException } from '../common/errors.js';
import { EconomyService } from '../economy/economy.service.js';
import {
  COLOR_START_INDEX,
  GAME_STATE_TTL_SECONDS,
  PLAYER_COLORS,
  SAFE_MAIN_TRACK_CELLS,
  TURN_TIMEOUT_SECONDS,
} from './game.constants.js';

type StartPlayer = {
  userId: string;
  displayName: string;
};

type EngineResult = {
  statePayload: GameStatePayload;
  gameEndPayload?: GameEndPayload;
};

type PublishEventType = 'state_update' | 'game_end';
type PublishFn = (event: PublishEventType, payload: GameStatePayload | GameEndPayload) => Promise<void> | void;

@Injectable()
export class GameEngineService implements OnModuleDestroy {
  private readonly logger = new Logger(GameEngineService.name);
  private readonly roomLocks = new Map<string, Promise<void>>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private publisher?: PublishFn;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
  ) {}

  setPublisher(publisher: PublishFn): void {
    this.publisher = publisher;
  }

  async initializeGame(
    roomCode: string,
    players: StartPlayer[],
    economyState: {
      entryFee: number;
      pot: number;
      participantUserIds: string[];
      skippedUserIds: string[];
    },
  ): Promise<GameStatePayload> {
    if (players.length < 2) {
      throw new ApiException('INVALID_MOVE', 'At least 2 players are required to start.');
    }

    return this.withRoomLock(roomCode, async () => {
      const orderedPlayers = players.slice(0, 4).map((player, index) => ({
        userId: player.userId,
        displayName: player.displayName,
        color: PLAYER_COLORS[index] as PlayerColor,
        tokens: [-1, -1, -1, -1],
      }));

      const state: GameState = {
        roomCode,
        status: 'playing',
        players: orderedPlayers,
        economy: {
          entryFee: economyState.entryFee,
          pot: economyState.pot,
          participantUserIds: economyState.participantUserIds,
          skippedUserIds: economyState.skippedUserIds,
        },
        currentTurnIndex: 0,
        turnPhase: 'await_roll',
        dice: {
          value: null,
          isAuto: false,
        },
        validMoves: [],
        finishedOrder: [],
        lastUpdatedAt: new Date().toISOString(),
      };

      this.scheduleTurnTimeout(state);
      await this.persistState(state);
      return { roomCode, state };
    });
  }

  async getState(roomCode: string): Promise<GameState | null> {
    return this.redis.getJson<GameState>(this.stateKey(roomCode));
  }

  async rollDice(roomCode: string, userId: string): Promise<EngineResult> {
    return this.withRoomLock(roomCode, async () => {
      const state = await this.loadStateOrThrow(roomCode);
      this.assertPlayingState(state);
      this.assertCurrentTurn(state, userId);

      if (state.turnPhase !== 'await_roll') {
        throw new ApiException('INVALID_MOVE', 'Dice cannot be rolled right now.');
      }

      const result = this.executeRollInternal(state, false);
      await this.persistAndSchedule(result);
      return result;
    });
  }

  async moveToken(roomCode: string, userId: string, tokenIndex: number): Promise<EngineResult> {
    return this.withRoomLock(roomCode, async () => {
      const state = await this.loadStateOrThrow(roomCode);
      this.assertPlayingState(state);
      this.assertCurrentTurn(state, userId);

      if (state.turnPhase !== 'await_move') {
        throw new ApiException('INVALID_MOVE', 'Token cannot be moved right now.');
      }

      if (state.validMoves.length === 0) {
        throw new ApiException('NO_VALID_MOVE', 'No valid move is available.');
      }

      const result = this.executeMoveInternal(state, tokenIndex, false);
      await this.persistAndSchedule(result);
      return result;
    });
  }

  async handleTurnTimeout(roomCode: string): Promise<void> {
    await this.withRoomLock(roomCode, async () => {
      const state = await this.getState(roomCode);
      if (!state || state.status !== 'playing') {
        return;
      }

      let result: EngineResult;
      if (state.turnPhase === 'await_roll') {
        result = this.executeRollInternal(state, true);
      } else if (state.turnPhase === 'await_move') {
        const autoMove = state.validMoves
          .slice()
          .sort((a, b) => a.tokenIndex - b.tokenIndex)[0];

        if (!autoMove) {
          this.advanceTurn(state);
          state.lastUpdatedAt = new Date().toISOString();
          result = { statePayload: { roomCode, state } };
        } else {
          result = this.executeMoveInternal(state, autoMove.tokenIndex, true);
        }
      } else {
        return;
      }

      await this.persistAndSchedule(result);
      await this.publishFromResult(result);
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  private async persistAndSchedule(result: EngineResult): Promise<void> {
    if (result.gameEndPayload) {
      const settlement = await this.economy.settleMatch(
        result.gameEndPayload.roomCode,
        result.gameEndPayload.placements,
      );
      if (settlement) {
        result.statePayload.state.economy = {
          ...result.statePayload.state.economy,
          entryFee: settlement.entryFee,
          pot: settlement.pot,
        };
        result.gameEndPayload = {
          ...result.gameEndPayload,
          winnerUserId: settlement.winnerUserId,
          pot: settlement.pot,
          entryFee: settlement.entryFee,
        };
      }
      await this.markRoomFinished(result.gameEndPayload.roomCode);
    }

    await this.persistState(result.statePayload.state);
    this.scheduleTurnTimeout(result.statePayload.state);
  }

  private async persistState(state: GameState): Promise<void> {
    await this.redis.setJson(this.stateKey(state.roomCode), state, GAME_STATE_TTL_SECONDS);
  }

  private stateKey(roomCode: string): string {
    return `room:${roomCode}:game_state`;
  }

  private async loadStateOrThrow(roomCode: string): Promise<GameState> {
    const state = await this.getState(roomCode);
    if (!state) {
      throw new ApiException('GAME_NOT_STARTED', 'Game has not started for this room.', HttpStatus.CONFLICT);
    }
    return state;
  }

  private assertPlayingState(state: GameState): void {
    if (state.status !== 'playing') {
      throw new ApiException('ROOM_NOT_PLAYING', 'Room is not currently playing.', HttpStatus.CONFLICT);
    }
  }

  private assertCurrentTurn(state: GameState, userId: string): void {
    const current = state.players[state.currentTurnIndex];
    if (!current || current.userId !== userId) {
      throw new ApiException('TURN_NOT_YOURS', 'It is not your turn.', HttpStatus.FORBIDDEN);
    }
  }

  private executeRollInternal(state: GameState, isAuto: boolean): EngineResult {
    const currentPlayer = state.players[state.currentTurnIndex];
    if (!currentPlayer) {
      throw new ApiException('INVALID_MOVE', 'Current player is missing.', HttpStatus.CONFLICT);
    }

    const diceValue = this.randomDice();
    const validMoves = this.computeValidMoves(currentPlayer.tokens, diceValue);

    state.dice = {
      value: diceValue,
      rolledAt: new Date().toISOString(),
      isAuto,
    };
    state.validMoves = validMoves;

    if (validMoves.length === 0) {
      this.advanceTurn(state);
    } else {
      state.turnPhase = 'await_move';
    }

    state.lastUpdatedAt = new Date().toISOString();
    return {
      statePayload: {
        roomCode: state.roomCode,
        state,
      },
    };
  }

  private executeMoveInternal(state: GameState, tokenIndex: number, isAuto: boolean): EngineResult {
    const currentPlayer = state.players[state.currentTurnIndex];
    if (!currentPlayer) {
      throw new ApiException('INVALID_MOVE', 'Current player is missing.', HttpStatus.CONFLICT);
    }

    const move = state.validMoves.find((candidate) => candidate.tokenIndex === tokenIndex);
    if (!move) {
      throw new ApiException('INVALID_MOVE', 'Token move is not valid.');
    }

    currentPlayer.tokens[tokenIndex] = move.targetProgress;
    const didCapture = this.captureAtTarget(state, state.currentTurnIndex, move.targetProgress);
    const rolledSix = state.dice.value === 6;

    if (this.isPlayerFinished(currentPlayer) && !state.finishedOrder.includes(currentPlayer.userId)) {
      state.finishedOrder.push(currentPlayer.userId);
    }

    const shouldFinish = state.finishedOrder.length >= state.players.length - 1;
    if (shouldFinish) {
      const gameEnd = this.finalizeGame(state);
      state.lastUpdatedAt = new Date().toISOString();
      return {
        statePayload: {
          roomCode: state.roomCode,
          state,
        },
        gameEndPayload: gameEnd,
      };
    }

    const keepTurn = (didCapture || rolledSix) && !this.isPlayerFinished(currentPlayer);
    state.validMoves = [];
    state.dice = {
      value: null,
      isAuto,
    };

    if (keepTurn) {
      state.turnPhase = 'await_roll';
    } else {
      this.advanceTurn(state);
    }

    state.lastUpdatedAt = new Date().toISOString();
    return {
      statePayload: {
        roomCode: state.roomCode,
        state,
      },
    };
  }

  private finalizeGame(state: GameState): GameEndPayload {
    for (const player of state.players) {
      if (!state.finishedOrder.includes(player.userId)) {
        state.finishedOrder.push(player.userId);
      }
    }

    const placements: PlacementEntry[] = state.finishedOrder.map((userId, index) => {
      const player = state.players.find((candidate) => candidate.userId === userId);
      if (!player) {
        throw new ApiException('INVALID_MOVE', 'Placement player missing.', HttpStatus.CONFLICT);
      }
      player.finishedRank = index + 1;
      return {
        userId: player.userId,
        displayName: player.displayName,
        color: player.color,
        place: index + 1,
      };
    });
    const winner = placements[0];
    if (!winner) {
      throw new ApiException('INVALID_MOVE', 'Winner could not be determined.', HttpStatus.CONFLICT);
    }

    state.status = 'finished';
    state.turnPhase = 'finished';
    state.validMoves = [];
    state.turnDeadlineAt = undefined;
    state.dice = {
      value: null,
      isAuto: false,
    };

    this.clearTurnTimeout(state.roomCode);

    return {
      roomCode: state.roomCode,
      placements,
      state,
      winnerUserId: winner.userId,
      pot: state.economy.pot,
      entryFee: state.economy.entryFee,
    };
  }

  private advanceTurn(state: GameState): void {
    const total = state.players.length;
    for (let step = 1; step <= total; step += 1) {
      const candidate = (state.currentTurnIndex + step) % total;
      const player = state.players[candidate];
      if (!player || this.isPlayerFinished(player)) {
        continue;
      }

      state.currentTurnIndex = candidate;
      state.turnPhase = 'await_roll';
      state.validMoves = [];
      state.dice = {
        value: null,
        isAuto: false,
      };
      return;
    }

    state.turnPhase = 'finished';
    state.status = 'finished';
  }

  private computeValidMoves(tokens: number[], diceValue: number): ValidMove[] {
    const validMoves: ValidMove[] = [];
    for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
      const progress = tokens[tokenIndex];
      if (typeof progress !== 'number') {
        continue;
      }
      if (progress === 56) {
        continue;
      }

      if (progress === -1) {
        if (diceValue === 6) {
          validMoves.push({ tokenIndex, targetProgress: 0 });
        }
        continue;
      }

      const target = progress + diceValue;
      if (target <= 56) {
        validMoves.push({ tokenIndex, targetProgress: target });
      }
    }

    return validMoves;
  }

  private captureAtTarget(state: GameState, movingPlayerIndex: number, targetProgress: number): boolean {
    if (targetProgress < 0 || targetProgress > 51) {
      return false;
    }

    const movingPlayer = state.players[movingPlayerIndex];
    if (!movingPlayer) {
      return false;
    }

    const targetCell = this.toBoardCell(movingPlayer.color, targetProgress);
    if (SAFE_MAIN_TRACK_CELLS.has(targetCell)) {
      return false;
    }

    let captured = false;
    for (let index = 0; index < state.players.length; index += 1) {
      if (index === movingPlayerIndex) {
        continue;
      }

      const opponent = state.players[index];
      if (!opponent) {
        continue;
      }

      for (let tokenIndex = 0; tokenIndex < opponent.tokens.length; tokenIndex += 1) {
        const progress = opponent.tokens[tokenIndex];
        if (typeof progress !== 'number') {
          continue;
        }
        if (progress < 0 || progress > 51) {
          continue;
        }

        if (this.toBoardCell(opponent.color, progress) === targetCell) {
          opponent.tokens[tokenIndex] = -1;
          captured = true;
        }
      }
    }

    return captured;
  }

  private toBoardCell(color: PlayerColor, progress: number): number {
    return (COLOR_START_INDEX[color] + progress) % 52;
  }

  private isPlayerFinished(player: GameState['players'][number]): boolean {
    return player.tokens.every((token) => token === 56);
  }

  private randomDice(): number {
    return Math.floor(Math.random() * 6) + 1;
  }

  private scheduleTurnTimeout(state: GameState): void {
    this.clearTurnTimeout(state.roomCode);

    if (state.status !== 'playing' || state.turnPhase === 'finished') {
      state.turnDeadlineAt = undefined;
      return;
    }

    const deadline = new Date(Date.now() + TURN_TIMEOUT_SECONDS * 1000);
    state.turnDeadlineAt = deadline.toISOString();

    const timer = setTimeout(() => {
      void this.handleTurnTimeout(state.roomCode).catch((error: unknown) => {
        this.logger.error(`Turn timeout failed for room ${state.roomCode}`, error as Error);
      });
    }, TURN_TIMEOUT_SECONDS * 1000);

    this.timers.set(state.roomCode, timer);
  }

  private clearTurnTimeout(roomCode: string): void {
    const existing = this.timers.get(roomCode);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(roomCode);
    }
  }

  private async publishFromResult(result: EngineResult): Promise<void> {
    if (!this.publisher) {
      return;
    }

    if (result.gameEndPayload) {
      await this.publisher('game_end', result.gameEndPayload);
      return;
    }

    await this.publisher('state_update', result.statePayload);
  }

  private async markRoomFinished(roomCode: string): Promise<void> {
    await this.prisma.room
      .update({
        where: { code: roomCode },
        data: { status: 'finished' },
      })
      .catch(() => undefined);
  }

  private async withRoomLock<T>(roomCode: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.roomLocks.get(roomCode) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.then(() => current);
    this.roomLocks.set(roomCode, chained);

    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.roomLocks.get(roomCode) === chained) {
        this.roomLocks.delete(roomCode);
      }
    }
  }
}
