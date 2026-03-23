import { describe, expect, it } from 'vitest';
import { getMainTrackCoordinate, LUDO_BOARD_SIZE, MAIN_TRACK_COORDINATES } from './ludo-track';

describe('ludo-track', () => {
  it('defines exactly 52 unique track cells', () => {
    expect(MAIN_TRACK_COORDINATES).toHaveLength(52);

    const cells = new Set(MAIN_TRACK_COORDINATES.map((coordinate) => coordinate.cell));
    expect(cells.size).toBe(52);
    expect(Math.min(...cells)).toBe(0);
    expect(Math.max(...cells)).toBe(51);
  });

  it('keeps all track coordinates inside the 15x15 board bounds', () => {
    for (const coordinate of MAIN_TRACK_COORDINATES) {
      expect(coordinate.row).toBeGreaterThanOrEqual(1);
      expect(coordinate.row).toBeLessThanOrEqual(LUDO_BOARD_SIZE);
      expect(coordinate.col).toBeGreaterThanOrEqual(1);
      expect(coordinate.col).toBeLessThanOrEqual(LUDO_BOARD_SIZE);
    }
  });

  it('resolves every known cell by index', () => {
    for (let cell = 0; cell < 52; cell += 1) {
      const coordinate = getMainTrackCoordinate(cell);
      expect(coordinate.cell).toBe(cell);
    }
  });

  it('throws for unknown track cells', () => {
    expect(() => getMainTrackCoordinate(99)).toThrow('Invalid ludo track cell: 99');
  });
});
