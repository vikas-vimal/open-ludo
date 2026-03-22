import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { CommonModule } from './common/common.module.js';
import { EconomyModule } from './economy/economy.module.js';
import { GameModule } from './game/game.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { RoomsModule } from './rooms/rooms.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [CommonModule, UsersModule, AuthModule, EconomyModule, GameModule, RoomsModule, RealtimeModule],
})
export class AppModule {}
