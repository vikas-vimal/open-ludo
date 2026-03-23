import { describe, expect, it } from 'vitest';
import { getSocketTransportErrorMessage, isApiErrorResponsePayload } from './socket-error';

describe('socket-error helpers', () => {
  it('recognizes API error payloads', () => {
    expect(isApiErrorResponsePayload({ code: 'ROOM_NOT_FOUND', message: 'Room does not exist.' })).toBe(true);
    expect(isApiErrorResponsePayload({ code: 'ROOM_NOT_FOUND' })).toBe(false);
    expect(isApiErrorResponsePayload(new Error('transport failed'))).toBe(false);
  });

  it('extracts human-readable transport messages', () => {
    expect(getSocketTransportErrorMessage('websocket failure')).toBe('websocket failure');
    expect(getSocketTransportErrorMessage(new Error('xhr poll error'))).toBe('xhr poll error');
    expect(getSocketTransportErrorMessage({ message: 'connection reset' })).toBe('connection reset');
    expect(getSocketTransportErrorMessage({})).toBe('Realtime transport issue');
  });
});
