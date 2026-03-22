'use client';

import type { GetMyProfileResponse } from '@open-ludo/contracts';
import { useEffect, useMemo, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import { readToken, saveSession } from '../lib/auth-store';

const AVATAR_KEYS = ['pawn_red', 'pawn_green', 'pawn_yellow', 'pawn_blue'] as const;

export function ProfileClient(): JSX.Element {
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<GetMyProfileResponse['profile'] | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [avatarKey, setAvatarKey] = useState<(typeof AVATAR_KEYS)[number]>('pawn_red');
  const [status, setStatus] = useState('Loading profile...');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setToken(readToken());
  }, []);

  useEffect(() => {
    if (!token) {
      setStatus('Sign in to view your profile.');
      return;
    }

    let active = true;
    void (async () => {
      try {
        const result = await api.getMyProfile(token);
        if (!active) {
          return;
        }
        setProfile(result.profile);
        setDisplayName(result.profile.displayName);
        setAvatarKey(
          AVATAR_KEYS.includes(result.profile.avatarKey as (typeof AVATAR_KEYS)[number])
            ? (result.profile.avatarKey as (typeof AVATAR_KEYS)[number])
            : 'pawn_red',
        );
        setStatus('Profile loaded.');
      } catch (caught) {
        if (!active) {
          return;
        }
        if (caught instanceof ApiClientError) {
          setStatus(caught.message);
        } else {
          setStatus('Failed to load profile.');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [token]);

  const topMatches = useMemo(() => profile?.history.slice(0, 10) ?? [], [profile]);

  async function saveProfileChanges(): Promise<void> {
    if (!token) {
      return;
    }

    setSaving(true);
    try {
      const updated = await api.updateMyProfile(
        {
          displayName: displayName.trim(),
          avatarKey,
        },
        token,
      );
      setProfile(updated.profile);
      setDisplayName(updated.profile.displayName);
      setAvatarKey(
        AVATAR_KEYS.includes(updated.profile.avatarKey as (typeof AVATAR_KEYS)[number])
          ? (updated.profile.avatarKey as (typeof AVATAR_KEYS)[number])
          : 'pawn_red',
      );
      saveSession(token, {
        id: updated.profile.id,
        displayName: updated.profile.displayName,
        coinBalance: updated.profile.coinBalance,
        kind: updated.profile.kind,
        email: updated.profile.email,
        avatarKey: updated.profile.avatarKey,
      });
      setStatus('Profile updated.');
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setStatus(caught.message);
      } else {
        setStatus('Failed to update profile.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!token) {
    return (
      <section className="panel stack">
        <h2>Profile</h2>
        <p>{status}</p>
      </section>
    );
  }

  return (
    <section className="panel stack">
      <h2>Profile</h2>
      <p>{status}</p>

      {profile ? (
        <>
          <div className="panel stack" style={{ background: '#fffef6' }}>
            <h3>Identity</h3>
            <p>
              Type: <strong>{profile.kind}</strong>
            </p>
            <p>
              Coins: <strong>{profile.coinBalance}</strong> | Rank: <strong>{profile.rank}</strong>
            </p>
            <div>
              <label htmlFor="profileName">Display Name</label>
              <input
                id="profileName"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={24}
              />
            </div>
            <div>
              <label htmlFor="avatarKey">Avatar</label>
              <select
                id="avatarKey"
                value={avatarKey}
                onChange={(event) => setAvatarKey(event.target.value as (typeof AVATAR_KEYS)[number])}
              >
                {AVATAR_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
            <button className="primary" onClick={saveProfileChanges} disabled={saving}>
              Save Profile
            </button>
          </div>

          <div className="panel stack" style={{ background: '#f6fbff' }}>
            <h3>Stats</h3>
            <p>
              Games: <strong>{profile.stats.gamesPlayed}</strong>
            </p>
            <p>
              Wins: <strong>{profile.stats.wins}</strong>
            </p>
            <p>
              Win Rate: <strong>{profile.stats.winRate}%</strong>
            </p>
          </div>

          <div className="panel stack" style={{ background: '#f9f7ff' }}>
            <h3>Recent Matches</h3>
            {topMatches.length > 0 ? (
              <div className="stack">
                {topMatches.map((entry) => (
                  <div
                    key={entry.settlementId}
                    className="row"
                    style={{
                      justifyContent: 'space-between',
                      border: '1px solid #d7d0ef',
                      borderRadius: 10,
                      padding: 10,
                    }}
                  >
                    <div>
                      <strong>{entry.roomCode}</strong>
                      <div style={{ fontSize: '0.85rem' }}>{new Date(entry.settledAt).toLocaleString()}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div>Place: {entry.place ?? '-'}</div>
                      <div>Pot: {entry.pot}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>No settled matches yet.</p>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
