import { electNextHost } from '../src/rooms/host-transfer.util.js';

describe('host-transfer util', () => {
  it('elects earliest connected player', () => {
    const next = electNextHost([
      { userId: 'u3', joinedAt: new Date('2026-01-01T10:10:00.000Z'), isConnected: true },
      { userId: 'u2', joinedAt: new Date('2026-01-01T10:05:00.000Z'), isConnected: true },
      { userId: 'u1', joinedAt: new Date('2026-01-01T10:00:00.000Z'), isConnected: false },
    ]);

    expect(next).toBe('u2');
  });

  it('returns null when nobody is connected', () => {
    const next = electNextHost([
      { userId: 'u1', joinedAt: new Date('2026-01-01T10:00:00.000Z'), isConnected: false },
    ]);

    expect(next).toBeNull();
  });
});
