'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { MEASURE_TYPES } from '@/lib/types';
import type { MeasureType, OutcomeActivity } from '@/lib/types';

/**
 * Support activities under one outcome — the WHAT in Virginia's hierarchy.
 *
 * The measure hint changes with the type because the three are genuinely
 * different: routine adds "how often", skill-building needs a countable
 * achievement plus how often AND how long, and health/safety states the
 * condition for *removing* the support rather than a target to hit.
 */
export function ActivityManager({
  outcomeId,
  activities
}: {
  outcomeId: string;
  activities: OutcomeActivity[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    description: '',
    measureType: 'routine' as MeasureType,
    measure: '',
    supportInstructions: '',
    dailyQuestion: ''
  });

  async function add() {
    setBusy(true);
    await fetch('/api/activities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        outcomeId,
        description: form.description.trim(),
        measureType: form.measureType,
        measure: form.measure.trim() || null,
        supportInstructions: form.supportInstructions.trim() || null,
        dailyQuestion: form.dailyQuestion.trim() || null,
        sortOrder: activities.length
      })
    });
    setBusy(false);
    setOpen(false);
    setForm({ description: '', measureType: 'routine', measure: '', supportInstructions: '', dailyQuestion: '' });
    router.refresh();
  }

  async function retire(id: string) {
    await fetch(`/api/activities/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  const inputClass =
    'w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy placeholder:text-brand-slate/60 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30';
  const hint = MEASURE_TYPES.find((m) => m.value === form.measureType)?.hint ?? '';

  return (
    <div className="ml-6 mt-3">
      {activities.length > 0 ? (
        <ul className="mb-2 space-y-1.5">
          {activities.map((a) => (
            <li key={a.id} className="rounded-lg bg-brand-sand/50 px-3 py-2 text-xs">
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 text-brand-navy">
                  {a.description}
                  {a.measure ? (
                    <span className="mt-0.5 block text-brand-slate">Measure: {a.measure}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => retire(a.id)}
                  aria-label="Retire activity"
                  className="shrink-0 text-brand-slate hover:text-status-missing"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div className="space-y-2 rounded-lg border border-brand-navy/10 p-3">
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Activity — e.g. “Tom uses weights at the gym.”"
            className={inputClass}
          />
          <select
            value={form.measureType}
            onChange={(e) => setForm({ ...form, measureType: e.target.value as MeasureType })}
            aria-label="Measure type"
            className={inputClass}
          >
            {MEASURE_TYPES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <input
            value={form.measure}
            onChange={(e) => setForm({ ...form, measure: e.target.value })}
            placeholder={hint}
            className={inputClass}
          />
          <textarea
            rows={2}
            value={form.supportInstructions}
            onChange={(e) => setForm({ ...form, supportInstructions: e.target.value })}
            placeholder="How staff give the support, in this person's terms"
            className={inputClass}
          />
          <input
            value={form.dailyQuestion}
            onChange={(e) => setForm({ ...form, dailyQuestion: e.target.value })}
            placeholder="The yes/no staff answer each shift (optional)"
            className={inputClass}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={add} disabled={busy || !form.description.trim()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-teal hover:underline"
        >
          <Plus className="h-3 w-3" />
          Add a support activity
        </button>
      )}
    </div>
  );
}
