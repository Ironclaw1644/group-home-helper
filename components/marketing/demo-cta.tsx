'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

/**
 * Start a demo sandbox from the landing page.
 *
 * Same call as the button on /login (`components/onboarding/demo-button.tsx`)
 * — one POST that provisions a throwaway org with fictional residents and
 * hands back credentials which are used immediately and never shown. It is
 * duplicated here rather than reused because that component is painted in the
 * signed-in app's per-organization palette, and this page is not themed by
 * whoever happens to be logged in.
 *
 * Nothing is asked for. Every field on a landing page is a reason to leave.
 */
export function DemoCta({ className, tone = 'forest' }: { className?: string; tone?: 'forest' | 'sand' }) {
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
    <div className={className}>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className={cn(
          'inline-flex w-full items-center justify-center gap-2.5 rounded-lg px-6 py-4 text-[0.95rem] font-semibold transition',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-flip-paper',
          'disabled:cursor-wait disabled:opacity-70 sm:w-auto',
          tone === 'sand'
            ? 'bg-flip-sand text-flip-forest hover:bg-[#e6c79c] focus-visible:ring-flip-sand'
            : 'bg-flip-forest text-flip-paper hover:bg-flip-moss focus-visible:ring-flip-forest'
        )}
      >
        {busy ? 'Setting up a sandbox…' : 'Try it yourself — no signup'}
        <span aria-hidden className={cn('transition-transform', busy ? 'opacity-0' : 'translate-x-0')}>
          →
        </span>
      </button>

      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-[#a83f28]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
