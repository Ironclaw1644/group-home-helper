'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, Mail } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Alert, Button, Card } from '@/components/ui';

/**
 * Ask for a reset link.
 *
 * There was no way to do this at all. A DSP who forgot their password was
 * locked out permanently and the only remedy was the owner running a script
 * with the service-role key — "the owner is nearby to help", encoded as
 * architecture. At the staff turnover typical of this work that is a support
 * call in the first month of every account.
 */
export default function ForgotForm() {
  const params = useSearchParams();
  const expired = params.get('expired') === '1';

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset`
      });

      // Shown whatever happened. Distinguishing "no such account" from "sent"
      // would turn this box into a way to test whether a given care worker has
      // an account with a named agency.
      setSent(true);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Card>
        <Alert tone="info" title="Check your email">
          <p>
            If an account exists for <strong>{email.trim()}</strong>, a link to set a new password
            is on its way. It expires in an hour, and it only works in this browser.
          </p>
        </Alert>
        <p className="mt-4 text-center text-xs text-brand-slate">
          Nothing arrived? Check spam, then{' '}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-semibold text-brand-teal hover:underline"
          >
            try again
          </button>
          .
        </p>
      </Card>
    );
  }

  return (
    <Card>
      {expired ? (
        <Alert tone="error" title="That link has expired">
          <p>Reset links last an hour and work once. Ask for a new one below.</p>
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} className="mt-2 space-y-4">
        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            className="field-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-brand-slate">
            The address you sign in with. Your supervisor can tell you which one that is.
          </p>
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {busy ? 'Sending…' : 'Email me a reset link'}
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-brand-slate">
        Remembered it?{' '}
        <Link href="/login" className="font-semibold text-brand-teal hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
