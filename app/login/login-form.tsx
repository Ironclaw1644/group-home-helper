'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogIn } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Alert, Button, Card } from '@/components/ui';

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        // Deliberately generic: distinguishing "no such user" from "wrong
        // password" tells an attacker which staff emails are real.
        setError('That email and password did not match. Please try again.');
        return;
      }

      router.replace(next);
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
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            className="field-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor="password" className="field-label">
              Password
            </label>
            <Link
              href="/forgot"
              className="mb-1.5 text-xs font-semibold text-brand-teal hover:underline"
            >
              Forgot it?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            className="field-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <Button type="submit" variant="primary" className="w-full" disabled={busy}>
          <LogIn className="h-4 w-4" />
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-brand-slate">
        This system contains protected health information. Access is logged.
      </p>
    </Card>
  );
}
