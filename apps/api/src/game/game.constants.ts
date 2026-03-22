import type { PlayerColor } from '@open-ludo/contracts';

export const TURN_TIMEOUT_SECONDS = 20;
export const GAME_STATE_TTL_SECONDS = 60 * 60 * 24;
export const DISCONNECT_FORFEIT_SECONDS = 60;
export const WATCHDOG_INTERVAL_SECONDS = 30;
export const WATCHDOG_IDLE_CANCEL_SECONDS = 5 * 60;

export const PLAYER_COLORS: PlayerColor[] = ['RED', 'GREEN', 'YELLOW', 'BLUE'];

export const COLOR_START_INDEX: Record<PlayerColor, number> = {
  RED: 0,
  GREEN: 13,
  YELLOW: 26,
  BLUE: 39,
};

export const SAFE_MAIN_TRACK_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
