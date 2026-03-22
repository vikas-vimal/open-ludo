import type { ApiErrorCode } from '@open-ludo/contracts';

const FRIENDLY_ERROR_TEXT: Partial<Record<ApiErrorCode, string>> = {
  AUTH_REQUIRED: 'Please sign in again to continue.',
  INVALID_TOKEN: 'Your session expired. Sign in again and retry.',
  ROOM_NOT_FOUND: 'That room code is not active.',
  ROOM_FULL: 'This room is full.',
  ROOM_NOT_WAITING: 'The match already started in this room.',
  ROOM_NOT_PLAYING: 'This match is not currently active.',
  GAME_NOT_STARTED: 'The match has not started yet.',
  TURN_NOT_YOURS: 'Wait for your turn before acting.',
  PLAYER_FORFEITED: 'You were forfeited after disconnect timeout and can now only spectate.',
  NO_VALID_MOVE: 'No valid move is available for this dice roll.',
  NOT_ENOUGH_FUNDED_PLAYERS: 'At least two funded players are needed to start this match.',
  CHAT_NOT_AVAILABLE: 'Chat is available only during active matches for room members.',
  CHAT_INVALID_MESSAGE: 'Message must be between 1 and 280 characters.',
  MATCH_CANCELLED_IDLE: 'The match was cancelled after inactivity. Entry fees were refunded.',
  RECONNECT_FAILED: 'Could not restore realtime connection. Retry sync or refresh.',
};

export function toFriendlyErrorMessage(code: string | undefined, fallbackMessage: string): string {
  if (!code) {
    return fallbackMessage;
  }

  return FRIENDLY_ERROR_TEXT[code as ApiErrorCode] ?? fallbackMessage;
}
