'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, Loader2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Alert, Button, Card } from '@/components/ui';

/**
 * Create a new agency workspace.
 *
 * For a group home that found this on its own. The workspace starts empty —
 * no residents, no other staff — and the person signing up becomes its
 * administrator.
 */
export function SignupForm() {
  const router = useRouter();

  const [orgName, setOrgName] = useState('');
  const [homeName, setHomeName] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orgName,
          homeName: homeName.trim() || 'Main House',
          fullName,
          email,
          password,
          // The org's timezone decides what "today" means on the roster, so
          // take it from the browser rather than defaulting everyone to ET.
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        })
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'Could not create the workspace.');
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError('Your workspace was created, but sign-in failed. Try signing in.');
        return;
      }

      router.replace('/residents');
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="orgName" className="field-label">
            Agency name
          </label>
          <input
            id="orgName"
            required
            className="field-input"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="At Home Family Services"
          />
        </div>

        <div>
          <label htmlFor="homeName" className="field-label">
            First house
          </label>
          <input
            id="homeName"
            className="field-input"
            value={homeName}
            onChange={(e) => setHomeName(e.target.value)}
            placeholder="Main House"
          />
          <p className="mt-1.5 text-xs text-brand-slate">
            You can rename it or add more later. Two shifts are set up for you.
          </p>
        </div>

        <div>
          <label htmlFor="fullName" className="field-label">
            Your name
          </label>
          <input
            id="fullName"
            required
            autoComplete="name"
            className="field-input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
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
            className="field-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="password" className="field-label">
            Password
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
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
          {busy ? 'Setting things up…' : 'Create the workspace'}
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-brand-slate">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-brand-teal hover:underline">
          Sign in
        </Link>
      </p>

      <p className="mt-3 text-center text-xs text-brand-slate">
        Before entering real resident information, read the PHI section of the README — this needs
        signed agreements with your host and model vendor.
      </p>
    </Card>
  );
}
