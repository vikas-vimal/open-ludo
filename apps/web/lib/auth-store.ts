export type LocalUser = {
  id: string;
  displayName: string;
  coinBalance: number;
  kind: 'guest' | 'registered';
  email?: string;
  avatarKey?: string;
};

const TOKEN_KEY = 'open_ludo_access_token';
const USER_KEY = 'open_ludo_user';
const PENDING_FRIEND_INVITE_KEY = 'open_ludo_pending_friend_invite';

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

export function savePendingFriendInvite(token: string): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(PENDING_FRIEND_INVITE_KEY, token.trim());
}

export function readPendingFriendInvite(): string | null {
  if (!isBrowser()) {
    return null;
  }

  const token = window.localStorage.getItem(PENDING_FRIEND_INVITE_KEY);
  if (!token) {
    return null;
  }

  const normalized = token.trim();
  return normalized.length > 0 ? normalized : null;
}

export function clearPendingFriendInvite(): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(PENDING_FRIEND_INVITE_KEY);
}
