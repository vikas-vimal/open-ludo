import { Module } from '@nestjs/common';
import { EconomyService } from './economy.service.js';

@Module({
  providers: [EconomyService],
  exports: [EconomyService],
})
export class EconomyModule {}
