export type LocalUser = {
  id: string;
  displayName: string;
  coinBalance: number;
  kind: 'guest' | 'registered';
  email?: string;
};

const TOKEN_KEY = 'open_ludo_access_token';
const USER_KEY = 'open_ludo_user';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function saveSession(token: string, user?: LocalUser): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(TOKEN_KEY, token);
  if (user) {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export function readToken(): string | null {
  if (!isBrowser()) {
    return null;
  }

  return window.localStorage.getItem(TOKEN_KEY);
}

export function readUser(): LocalUser | null {
  if (!isBrowser()) {
    return null;
  }

  const value = window.localStorage.getItem(USER_KEY);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as LocalUser;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}
