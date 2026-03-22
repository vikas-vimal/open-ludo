import { Module } from '@nestjs/common';
import { EconomyModule } from '../economy/economy.module.js';
import { GameEngineService } from './game-engine.service.js';

@Module({
  imports: [EconomyModule],
  providers: [GameEngineService],
  exports: [GameEngineService],
})
export class GameModule {}
