'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Loader2 } from 'lucide-react';
import { Alert, Button, Card } from '@/components/ui';
import { formatServiceDate } from '@/lib/utils';
import type { Home } from '@/lib/types';

/**
 * Prepare a week of notes in one action.
 *
 * The customer's actual complaint is ten minutes a note. Most of that is not
 * writing — it is arriving at an empty form and re-entering the same routine
 * that happened yesterday. This is the button that removes it: every resident
 * gets an unsigned draft for every shift on every day of the coming week,
 * already carrying their usual pattern.
 *
 * The copy is careful on purpose. "Prepared" is not "written", and a supervisor
 * who thinks this fills in the week is a supervisor who will be surprised by
 * what their staff still have to do. Nothing here signs anything, nothing here
 * answers a service plan, and a DSP has to confirm each prepared note before it
 * can be signed.
 */
export default function PrestagePanel({
  homes,
  today
}: {
  homes: Home[];
  today: string;
}) {
  const router = useRouter();

  const [homeId, setHomeId] = useState(homes[0]?.id ?? '');
  const [from, setFrom] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    from: string;
    to: string;
    created: number;
    existing: number;
    withRoutine: number;
  } | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/notes/prestage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ homeId, from })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? 'Could not prepare the week.');
        return;
      }
      setResult(body);
      router.refresh();
    } catch {
      setError('Could not reach the server. Nothing was created.');
    } finally {
      setBusy(false);
    }
  }

  if (homes.length === 0) return null;

  return (
    <Card className="mb-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.12em] text-brand-slate">
        Prepare the week
      </h2>
      <p className="mb-4 text-xs text-brand-slate">
        Opens a draft for every resident, every shift, seven days — each one already carrying that
        person&apos;s usual pattern for that shift. Staff correct what was different, answer the
        service plan, add a line, and sign. Nothing is signed or answered for them, and a note for
        a later day cannot be signed before that day arrives.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        {homes.length > 1 ? (
          <div>
            <label htmlFor="prestage-home" className="field-label">
              House
            </label>
            <select
              id="prestage-home"
              value={homeId}
              onChange={(e) => setHomeId(e.target.value)}
              className="min-h-11 rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
            >
              {homes.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label htmlFor="prestage-from" className="field-label">
            Starting
          </label>
          <input
            id="prestage-from"
            type="date"
            value={from}
            min={today}
            onChange={(e) => setFrom(e.target.value)}
            className="min-h-11 rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
          />
        </div>

        <Button variant="primary" onClick={run} disabled={busy || !homeId}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CalendarPlus className="h-4 w-4" />
          )}
          {busy ? 'Preparing…' : 'Prepare 7 days'}
        </Button>
      </div>

      {error ? (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      {result ? (
        <div className="mt-4">
          <Alert tone="info" title={`${result.created} draft${result.created === 1 ? '' : 's'} ready`}>
            <p>
              {formatServiceDate(result.from)} to {formatServiceDate(result.to)}.{' '}
              {result.withRoutine > 0
                ? `${result.withRoutine} opened with the resident's usual pattern already filled in; staff confirm or change it.`
                : 'There is not enough signed history yet to fill any of them in, so they open blank. Run this again next week.'}
            </p>
            {result.existing > 0 ? (
              <p className="mt-1">
                {result.existing} note{result.existing === 1 ? ' was' : 's were'} already started and{' '}
                {result.existing === 1 ? 'was' : 'were'} left alone.
              </p>
            ) : null}
          </Alert>
        </div>
      ) : null}
    </Card>
  );
}
