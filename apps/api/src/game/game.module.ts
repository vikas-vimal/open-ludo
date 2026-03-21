import { Module } from '@nestjs/common';
import { GameEngineService } from './game-engine.service.js';

@Module({
  providers: [GameEngineService],
  exports: [GameEngineService],
})
export class GameModule {}
