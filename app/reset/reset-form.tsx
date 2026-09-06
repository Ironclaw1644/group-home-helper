'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Alert, Button, Card } from '@/components/ui';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/lib/auth/password';

/**
 * Set a new password after following a reset link.
 *
 * By the time this renders the recovery code has already been exchanged for a
 * session in /auth/callback, so this is an ordinary password change. The check
 * below is for the person who reaches this URL some other way — a bookmark, a
 * back button — who should be told to start again rather than shown a form
 * that cannot work.
 */
export default function ResetForm() {
  const router = useRouter();

  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();
        if (!cancelled) setReady(Boolean(session));
      } catch {
        if (!cancelled) setReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    if (password !== confirm) {
      setError('Those two passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(
          /same/i.test(updateError.message)
            ? 'That is your current password. Choose a different one.'
            : 'Could not set that password. Try a different one.'
        );
        return;
      }

      setDone(true);
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (ready === null) {
    return (
      <Card>
        <p className="text-center text-sm text-brand-slate">Checking your link…</p>
      </Card>
    );
  }

  if (!ready) {
    return (
      <Card>
        <Alert tone="error" title="This link is not valid any more">
          <p>
            Reset links last an hour, work once, and only in the browser that asked for them.
          </p>
        </Alert>
        <Link
          href="/forgot"
          className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy/90"
        >
          Ask for a new link
        </Link>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <Alert tone="info" title="Password changed">
          <p>You are signed in on this device. Use the new password next time.</p>
        </Alert>
        <Link
          href="/"
          className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy/90"
        >
          Go to my roster
        </Link>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="field-label">
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            className="field-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-brand-slate">
            At least {MIN_PASSWORD_LENGTH} characters. A short phrase you will remember beats a
            short one you will write down.
          </p>
        </div>

        <div>
          <label htmlFor="confirm" className="field-label">
            Type it again
          </label>
          <input
            id="confirm"
            type="password"
            required
            autoComplete="new-password"
            className="field-input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {busy ? 'Saving…' : 'Set my new password'}
        </Button>
      </form>
    </Card>
  );
}
