import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from '../src/rooms/room-code.util.js';

describe('room-code util', () => {
  it('generates valid 6-char uppercase codes', () => {
    for (let i = 0; i < 500; i += 1) {
      const code = generateRoomCode();
      expect(code).toHaveLength(6);
      expect(isValidRoomCode(code)).toBe(true);
      expect(code).toBe(code.toUpperCase());
    }
  });

  it('normalizes room code to uppercase', () => {
    expect(normalizeRoomCode('ab12cd')).toBe('AB12CD');
  });
});
