'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Alert, Button, Card } from '@/components/ui';
import type { InviteDetails } from '@/lib/onboarding/provision';

/**
 * Accept an invitation and sign in.
 *
 * Two steps on purpose: the API creates the account with service_role, then the
 * browser signs in normally. Provisioning cannot set session cookies from a
 * route handler the way the auth client does, and having one code path for
 * "how a session begins" is worth the extra round trip.
 */
export function JoinForm({ code, invite }: { code: string; invite: InviteDetails }) {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(invite.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, email, password, fullName })
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Could not create the account.');
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        // The account exists at this point, so send them to sign in rather than
        // leaving them stuck on a form that would now fail as a duplicate.
        setError('Your account was created, but sign-in failed. Try signing in.');
        return;
      }

      router.replace('/');
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const roleLabel =
    invite.role === 'dsp' ? 'DSP' : invite.role === 'supervisor' ? 'Supervisor' : 'Administrator';

  return (
    <Card>
      <div className="mb-5 rounded-xl bg-brand-sand/70 px-4 py-3">
        <p className="text-sm font-semibold text-brand-navy">
          Joining {invite.orgName}
        </p>
        <p className="mt-0.5 text-xs text-brand-slate">
          as {roleLabel}
          {invite.homeName ? ` at ${invite.homeName}` : ''}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="fullName" className="field-label">
            Your full name
          </label>
          <input
            id="fullName"
            required
            autoComplete="name"
            className="field-input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-brand-slate">
            This prints on the signature line of every note you sign, so use the name your agency
            knows you by.
          </p>
        </div>

        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            readOnly={Boolean(invite.email)}
            className="field-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {invite.email ? (
            <p className="mt-1.5 text-xs text-brand-slate">
              This invitation was issued to this address.
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="password" className="field-label">
            Choose a password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className="field-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-brand-slate">At least 10 characters.</p>
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {busy ? 'Creating your account…' : 'Create my account'}
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-brand-slate">
        This system contains protected health information. Access is logged.
      </p>
    </Card>
  );
}
