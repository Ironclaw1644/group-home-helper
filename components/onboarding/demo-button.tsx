'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PlayCircle } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Alert } from '@/components/ui';

/**
 * Start a demo sandbox and drop straight into it.
 *
 * No form: anything asked for here is a reason to leave. The API provisions a
 * throwaway org with fictional residents and hands back credentials, which are
 * used immediately and never shown — the visitor just lands on a roster.
 */
export function DemoButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/demo', { method: 'POST' });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body.error ?? 'Could not start a demo right now.');
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: body.email,
        password: body.password
      });

      if (signInError) {
        setError('Could not start a demo right now. Try again shortly.');
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

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-teal/40 bg-white px-4 py-3 text-sm font-semibold text-brand-navy transition hover:bg-brand-aqua/15 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
        {busy ? 'Setting up your demo…' : 'Try the demo'}
      </button>

      <p className="mt-2 text-center text-xs text-brand-slate">
        Three fictional residents, no sign-up. Nothing you write here is real.
      </p>

      {error ? (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
    </div>
  );
}
