'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiClientError } from '../lib/api';
import {
  clearPendingFriendInvite,
  readToken,
  saveSession,
  savePendingFriendInvite,
} from '../lib/auth-store';
import { getSupabaseClient } from '../lib/supabase';

type InviteClientProps = {
  token: string;
};

export function InviteClient({ token }: InviteClientProps): JSX.Element {
  const [status, setStatus] = useState('Checking invite...');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const inviteToken = token.trim();
    if (!inviteToken) {
      setStatus('Invite link is invalid.');
      setBusy(false);
      return;
    }

    let active = true;

    void (async () => {
      let accessToken = readToken();
      if (!accessToken) {
        const supabase = getSupabaseClient();
        if (supabase) {
          const session = await supabase.auth.getSession();
          accessToken = session.data.session?.access_token ?? null;
        }
      }

      if (!accessToken) {
        savePendingFriendInvite(inviteToken);
        if (!active) {
          return;
        }
        setStatus('Invite saved. Sign in with a registered account to accept it.');
        setBusy(false);
        return;
      }

      try {
        const me = await api.getMe(accessToken);
        if (!active) {
          return;
        }
        saveSession(accessToken, me.user);

        if (me.user.kind !== 'registered') {
          savePendingFriendInvite(inviteToken);
          setStatus('Invite saved. Sign in with a registered account to accept it.');
          setBusy(false);
          return;
        }

        const accepted = await api.acceptFriendInvite(inviteToken, accessToken);
        if (!active) {
          return;
        }
        clearPendingFriendInvite();
        setStatus(`Friend added: ${accepted.friend.displayName}`);
      } catch (caught) {
        if (!active) {
          return;
        }
        if (caught instanceof ApiClientError) {
          if (['INVITE_ALREADY_USED', 'INVITE_INVALID', 'INVITE_SELF'].includes(caught.code)) {
            clearPendingFriendInvite();
          } else {
            savePendingFriendInvite(inviteToken);
          }
          setStatus(caught.message);
        } else {
          savePendingFriendInvite(inviteToken);
          setStatus('Could not process invite. It will be retried after sign in.');
        }
      } finally {
        if (active) {
          setBusy(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <section className="panel stack">
      <h2>Friend Invite</h2>
      <p>{status}</p>
      <div className="row">
        <Link href="/">Go Home</Link>
        <Link href="/profile">Go to Profile</Link>
      </div>
      {busy ? <p>Processing...</p> : null}
    </section>
  );
}
