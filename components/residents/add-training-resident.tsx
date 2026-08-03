'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Loader2 } from 'lucide-react';
import { Alert, Button, Card } from '@/components/ui';

/**
 * Offer a practice resident when the roster has none.
 *
 * Shown only when there isn't one, so it stays out of the way for an agency
 * that kept theirs. Its real job is to make deleting the practice resident a
 * decision someone can change their mind about.
 */
export function AddTrainingResident({ homeId }: { homeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);

    const res = await fetch('/api/residents/training', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ homeId })
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(body.error ?? 'Could not add the practice resident.');
      return;
    }

    router.refresh();
  }

  return (
    <Card className="border-dashed">
      {error ? (
        <div className="mb-3">
          <Alert tone="warning">{error}</Alert>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-brand-slate" />
          <div>
            <p className="text-sm font-semibold text-brand-navy">Training new staff?</p>
            <p className="mt-0.5 max-w-xl text-xs text-brand-slate">
              Add a fictional resident for people to practise on. Notes written about them print
              exactly like a real one, so a trainee learns the actual form — and they are excluded
              from billing exports.
            </p>
          </div>
        </div>
        <Button onClick={add} disabled={busy} variant="ghost" size="sm">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Add a practice resident
        </Button>
      </div>
    </Card>
  );
}
