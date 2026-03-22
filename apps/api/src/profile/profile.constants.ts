import type { ProfileRank } from '@open-ludo/contracts';

export const AVATAR_KEYS = ['pawn_red', 'pawn_green', 'pawn_yellow', 'pawn_blue'] as const;
export const DEFAULT_AVATAR_KEY = AVATAR_KEYS[0];

export function isValidAvatarKey(value: string): boolean {
  return AVATAR_KEYS.includes(value as (typeof AVATAR_KEYS)[number]);
}

export function deriveProfileRank(coinBalance: number): ProfileRank {
  if (coinBalance >= 2600) {
    return 'DIAMOND';
  }
  if (coinBalance >= 1800) {
    return 'GOLD';
  }
  if (coinBalance >= 1200) {
    return 'SILVER';
  }
  return 'BRONZE';
}
