import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GameModule } from '../game/game.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { LobbyGateway } from './lobby.gateway.js';

@Module({
  imports: [AuthModule, RoomsModule, GameModule],
  providers: [LobbyGateway],
})
export class RealtimeModule {}
