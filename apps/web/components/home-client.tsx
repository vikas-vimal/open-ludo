'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from '../lib/api';
import { clearSession, readToken, readUser, saveSession } from '../lib/auth-store';
import { getSupabaseClient } from '../lib/supabase';

export function HomeClient(): JSX.Element {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4>(4);
  const [status, setStatus] = useState('Create a guest identity or sign in, then open a room.');
  const [token, setToken] = useState<string | null>(null);
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSupabase, setHasSupabase] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const guestTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const storedToken = readToken();
    const storedUser = readUser();

    setToken(storedToken);
    if (storedUser) {
      setStatus(`Signed in as ${storedUser.displayName} (${storedUser.kind})`);
      setDisplayName(storedUser.displayName);
      setCoinBalance(storedUser.coinBalance);
      if (storedUser.kind === 'guest') {
        guestTokenRef.current = storedToken;
      }
    }

    const supabase = getSupabaseClient();
    setHasSupabase(Boolean(supabase));
    if (!supabase) {
      return;
    }

    void supabase.auth.getSession().then(async ({ data }) => {
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        return;
      }

      await syncRegisteredSession(accessToken, guestTokenRef.current);
    });
  }, []);

  const canCreate = useMemo(() => !loading && maxPlayers >= 2 && maxPlayers <= 4, [loading, maxPlayers]);

  async function syncRegisteredSession(accessToken: string, guestToken: string | null): Promise<void> {
    setToken(accessToken);

    try {
      const me = await api.getMe(accessToken);
      let user = me.user;
      let merged = false;

      if (guestToken && me.user.kind === 'registered' && guestToken !== accessToken) {
        try {
          const upgrade = await api.upgradeGuest(guestToken, accessToken);
          user = upgrade.user;
          merged = upgrade.merged;
        } catch (caught) {
          if (
            caught instanceof ApiClientError &&
            ['GUEST_ALREADY_UPGRADED', 'UPGRADE_NOT_ALLOWED', 'GUEST_TOKEN_REQUIRED', 'INVALID_TOKEN'].includes(
              caught.code,
            )
          ) {
            // Ignore non-fatal upgrade cases and continue with registered session.
          } else {
            throw caught;
          }
        }
      }

      saveSession(accessToken, user);
      setDisplayName(user.displayName);
      setCoinBalance(user.coinBalance);
      setStatus(
        merged
          ? `Signed in as ${user.displayName} (registered). Guest session merged.`
          : `Signed in as ${user.displayName} (${user.kind})`,
      );
      if (user.kind === 'registered') {
        guestTokenRef.current = null;
      }
    } catch {
      setStatus('Supabase session detected but API token validation failed.');
    }
  }

  async function ensureGuestSession(): Promise<string> {
    const existing = token ?? readToken();
    if (existing) {
      return existing;
    }

    const trimmed = displayName.trim();
    if (trimmed.length < 2) {
      throw new ApiClientError('INVALID_NAME', 'Enter at least 2 characters for display name.');
    }

    const result = await api.createGuest(trimmed);
    saveSession(result.accessToken, result.user);
    setToken(result.accessToken);
    guestTokenRef.current = result.accessToken;
    setStatus(`Guest ready: ${result.user.displayName}`);
    setCoinBalance(result.user.coinBalance);
    return result.accessToken;
  }

  async function handleGuest(): Promise<void> {
    setLoading(true);
    try {
      const trimmed = displayName.trim();
      const result = await api.createGuest(trimmed);
      saveSession(result.accessToken, result.user);
      setToken(result.accessToken);
      guestTokenRef.current = result.accessToken;
      setStatus(`Guest session created for ${result.user.displayName}`);
      setCoinBalance(result.user.coinBalance);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setStatus(error.message);
      } else {
        setStatus('Failed to create guest session.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateRoom(): Promise<void> {
    setLoading(true);
    try {
      const accessToken = await ensureGuestSession();
      const created = await api.createRoom(maxPlayers, accessToken);
      router.push(`/room/${created.room.room.code}`);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setStatus(error.message);
      } else {
        setStatus('Failed to create room.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSignInWithGoogle(): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus('Supabase is not configured in NEXT_PUBLIC_SUPABASE_URL/ANON_KEY.');
      return;
    }

    const callbackUrl =
      typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
      },
    });

    if (error) {
      setStatus(error.message);
    }
  }

  async function handleEmailSignUp(): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus('Supabase is not configured in NEXT_PUBLIC_SUPABASE_URL/ANON_KEY.');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || password.length < 6) {
      setStatus('Enter a valid email and password (min 6 characters).');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });
      if (error) {
        setStatus(error.message);
        return;
      }

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        setStatus('Sign-up successful. Check your email to verify the account, then sign in.');
        return;
      }

      await syncRegisteredSession(accessToken, guestTokenRef.current);
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSignIn(): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setStatus('Supabase is not configured in NEXT_PUBLIC_SUPABASE_URL/ANON_KEY.');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || password.length < 6) {
      setStatus('Enter a valid email and password (min 6 characters).');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) {
        setStatus(error.message);
        return;
      }

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        setStatus('Sign-in succeeded but no access token was returned.');
        return;
      }

      await syncRegisteredSession(accessToken, guestTokenRef.current);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel stack">
      <h2>Start Playing</h2>

      <div>
        <label htmlFor="displayName">Display Name</label>
        <input
          id="displayName"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Aarav, Sana, Priya..."
          maxLength={24}
        />
      </div>

      <div className="row">
        <button className="primary" onClick={handleGuest} disabled={loading}>
          Continue as Guest
        </button>
        <button className="secondary" onClick={handleSignInWithGoogle} disabled={!hasSupabase || loading}>
          Sign In with Google
        </button>
        <button onClick={() => router.push('/profile')} disabled={!token || loading}>
          Profile
        </button>
        <button
          onClick={() => {
            clearSession();
            setToken(null);
            setCoinBalance(null);
            guestTokenRef.current = null;
            setStatus('Session cleared.');
          }}
          disabled={loading}
        >
          Clear Session
        </button>
      </div>

      <div className="panel stack" style={{ background: '#f7f8ff' }}>
        <h3>Email Account</h3>
        <div>
          <label htmlFor="authEmail">Email</label>
          <input
            id="authEmail"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
        <div>
          <label htmlFor="authPassword">Password</label>
          <input
            id="authPassword"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 6 characters"
            autoComplete="current-password"
          />
        </div>
        <div className="row">
          <button onClick={handleEmailSignIn} disabled={!hasSupabase || loading}>
            Sign In with Email
          </button>
          <button className="secondary" onClick={handleEmailSignUp} disabled={!hasSupabase || loading}>
            Sign Up with Email
          </button>
        </div>
      </div>

      <div className="panel stack" style={{ background: '#fffcf3' }}>
        <h3>Create Room</h3>
        <div>
          <label htmlFor="maxPlayers">Players</label>
          <select
            id="maxPlayers"
            value={maxPlayers}
            onChange={(event) => setMaxPlayers(Number(event.target.value) as 2 | 3 | 4)}
          >
            <option value={2}>2 players</option>
            <option value={3}>3 players</option>
            <option value={4}>4 players</option>
          </select>
        </div>
        <button className="primary" onClick={handleCreateRoom} disabled={!canCreate}>
          Create Room
        </button>
      </div>

      <div className="panel stack" style={{ background: '#f4fffc' }}>
        <h3>Join Room</h3>
        <div>
          <label htmlFor="joinCode">Room Code</label>
          <input
            id="joinCode"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
          />
        </div>
        <button
          onClick={() => {
            const code = joinCode.trim().toUpperCase();
            if (!code) {
              setStatus('Enter a room code to join.');
              return;
            }
            router.push(`/room/${code}`);
          }}
          disabled={loading}
        >
          Go to Room
        </button>
      </div>

      <p>{status}</p>
      {coinBalance !== null ? <p>Coins: {coinBalance}</p> : null}
      {token ? <p style={{ fontSize: '0.85rem' }}>Session token loaded.</p> : null}
    </section>
  );
}
