import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { getEnv } from './env.js';

const PRESENCE_TTL_SECONDS = 120;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor() {
    const env = getEnv();
    this.redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
  }

  private roomPresenceKey(roomCode: string): string {
    return `room:${roomCode}:presence`;
  }

  async markConnected(roomCode: string, userId: string): Promise<void> {
    const key = this.roomPresenceKey(roomCode);
    await this.redis.sadd(key, userId);
    await this.redis.expire(key, PRESENCE_TTL_SECONDS);
  }

  async markDisconnected(roomCode: string, userId: string): Promise<void> {
    const key = this.roomPresenceKey(roomCode);
    await this.redis.srem(key, userId);
    await this.redis.expire(key, PRESENCE_TTL_SECONDS);
  }

  async isConnected(roomCode: string, userId: string): Promise<boolean> {
    const key = this.roomPresenceKey(roomCode);
    const result = await this.redis.sismember(key, userId);
    return result === 1;
  }

  async connectedUserSet(roomCode: string): Promise<Set<string>> {
    const key = this.roomPresenceKey(roomCode);
    const members = await this.redis.smembers(key);
    return new Set(members);
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }
}
