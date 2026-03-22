import { describe, expect, it } from 'vitest';
import { sanitizeChatMessage } from '../src/realtime/chat-filter.util.js';

describe('sanitizeChatMessage', () => {
  it('masks profane words case-insensitively', () => {
    expect(sanitizeChatMessage('This is SHIT and damn bad')).toBe('This is **** and **** bad');
  });

  it('does not alter clean text', () => {
    expect(sanitizeChatMessage('Good luck and have fun')).toBe('Good luck and have fun');
  });
});
