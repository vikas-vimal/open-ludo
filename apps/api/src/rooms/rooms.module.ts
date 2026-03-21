import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GameModule } from '../game/game.module.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsService } from './rooms.service.js';

@Module({
  imports: [AuthModule, GameModule],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
