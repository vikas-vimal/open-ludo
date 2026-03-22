import { describe, expect, it } from 'vitest';
import { deriveProfileRank } from '../src/profile/profile.constants.js';

describe('deriveProfileRank', () => {
  it('maps rank thresholds correctly', () => {
    expect(deriveProfileRank(1199)).toBe('BRONZE');
    expect(deriveProfileRank(1200)).toBe('SILVER');
    expect(deriveProfileRank(1799)).toBe('SILVER');
    expect(deriveProfileRank(1800)).toBe('GOLD');
    expect(deriveProfileRank(2599)).toBe('GOLD');
    expect(deriveProfileRank(2600)).toBe('DIAMOND');
  });
});
