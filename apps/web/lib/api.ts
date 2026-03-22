import type {
  ApiErrorResponse,
  CreateGuestResponse,
  CreateRoomResponse,
  GetMyProfileResponse,
  GetMeResponse,
  JoinRoomResponse,
  StartRoomResponse,
  UpdateMyProfileRequest,
  UpdateMyProfileResponse,
  UpgradeGuestResponse,
} from '@open-ludo/contracts';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

class ApiClientError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set('Content-Type', 'application/json');

  if (init.token) {
    headers.set('Authorization', `Bearer ${init.token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    throw new ApiClientError(error?.code ?? 'HTTP_ERROR', error?.message ?? 'Request failed');
  }

  return (await response.json()) as T;
}

export const api = {
  createGuest(displayName: string): Promise<CreateGuestResponse> {
    return request('/v1/auth/guest', {
      method: 'POST',
      body: JSON.stringify({ displayName }),
    });
  },

  getMe(token: string): Promise<GetMeResponse> {
    return request('/v1/auth/me', {
      token,
    });
  },

  upgradeGuest(guestAccessToken: string, token: string): Promise<UpgradeGuestResponse> {
    return request('/v1/auth/upgrade', {
      method: 'POST',
      token,
      body: JSON.stringify({ guestAccessToken }),
    });
  },

  createRoom(maxPlayers: 2 | 3 | 4, token: string): Promise<CreateRoomResponse> {
    return request('/v1/rooms', {
      method: 'POST',
      token,
      body: JSON.stringify({ maxPlayers }),
    });
  },

  joinRoom(roomCode: string, token: string): Promise<JoinRoomResponse> {
    return request(`/v1/rooms/${roomCode}/join`, {
      method: 'POST',
      token,
    });
  },

  getRoom(roomCode: string, token: string): Promise<JoinRoomResponse> {
    return request(`/v1/rooms/${roomCode}`, {
      token,
    });
  },

  setReady(roomCode: string, ready: boolean, token: string): Promise<JoinRoomResponse> {
    return request(`/v1/rooms/${roomCode}/ready`, {
      method: 'POST',
      token,
      body: JSON.stringify({ ready }),
    });
  },

  startRoom(roomCode: string, token: string): Promise<StartRoomResponse> {
    return request(`/v1/rooms/${roomCode}/start`, {
      method: 'POST',
      token,
    });
  },

  getMyProfile(token: string): Promise<GetMyProfileResponse> {
    return request('/v1/profile/me', {
      token,
    });
  },

  updateMyProfile(payload: UpdateMyProfileRequest, token: string): Promise<UpdateMyProfileResponse> {
    return request('/v1/profile/me', {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },
};

export { ApiClientError };
