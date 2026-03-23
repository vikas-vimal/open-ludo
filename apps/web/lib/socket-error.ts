import type { ApiErrorResponse } from '@open-ludo/contracts';

export function isApiErrorResponsePayload(value: unknown): value is ApiErrorResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ApiErrorResponse>;
  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}

export function getSocketTransportErrorMessage(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (value && typeof value === 'object') {
    const candidate = value as { message?: unknown };
    if (typeof candidate.message === 'string' && candidate.message.trim().length > 0) {
      return candidate.message;
    }
  }

  return 'Realtime transport issue';
}
