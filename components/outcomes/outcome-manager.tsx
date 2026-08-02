'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, Loader2, Plus, Target, X } from 'lucide-react';
import { Alert, Badge, Button, Card } from '@/components/ui';
import type { Outcome } from '@/lib/types';

/**
 * Edit a resident's ISP outcomes.
 *
 * These are transcribed from the plan the team wrote, so the fields mirror what
 * an ISP actually contains rather than inventing a structure. The statement is
 * kept verbatim on purpose: a reviewer comparing the note to the plan should
 * find the same words in both.
 */
export function OutcomeManager({
  residentId,
  residentName,
  outcomes
}: {
  residentId: string;
  residentName: string;
  outcomes: Outcome[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    statement: '',
    supportStrategies: '',
    measure: '',
    frequency: '',
    category: ''
  });

  function startNew() {
    setEditing(null);
    setForm({ title: '', statement: '', supportStrategies: '', measure: '', frequency: '', category: '' });
    setOpen(true);
    setError(null);
  }

  function startEdit(o: Outcome) {
    setEditing(o);
    setForm({
      title: o.title,
      statement: o.statement ?? '',
      supportStrategies: o.supportStrategies ?? '',
      measure: o.measure ?? '',
      frequency: o.frequency ?? '',
      category: o.category ?? ''
    });
    setOpen(true);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);

    const payload = {
      ...(editing ? {} : { residentId }),
      title: form.title.trim(),
      statement: form.statement.trim() || null,
      supportStrategies: form.supportStrategies.trim() || null,
      measure: form.measure.trim() || null,
      frequency: form.frequency.trim() || null,
      category: form.category.trim() || null,
      sortOrder: editing?.sortOrder ?? outcomes.length
    };

    const res = await fetch(editing ? `/api/outcomes/${editing.id}` : '/api/outcomes', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const body = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(body.error ?? 'Could not save.');
      return;
    }

    setOpen(false);
    router.refresh();
  }

  async function retire(o: Outcome) {
    await fetch(`/api/outcomes/${o.id}`, { method: 'DELETE' });
    router.refresh();
  }

  const inputClass =
    'w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy placeholder:text-brand-slate/60 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30';
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-brand-slate';

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {open ? (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-brand-navy">
              {editing ? 'Edit outcome' : 'Add an outcome'}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cancel"
              className="text-brand-slate hover:text-brand-navy"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="o-title" className={labelClass}>
                Short name
              </label>
              <input
                id="o-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Cooking independence"
                className={inputClass}
              />
              <p className="mt-1.5 text-xs text-brand-slate">
                This is the heading staff see on the note form. Keep it short.
              </p>
            </div>

            <div>
              <label htmlFor="o-statement" className={labelClass}>
                Outcome, as written in the ISP
              </label>
              <textarea
                id="o-statement"
                rows={2}
                value={form.statement}
                onChange={(e) => setForm({ ...form, statement: e.target.value })}
                placeholder={`${residentName} will prepare a simple breakfast three mornings a week.`}
                className={inputClass}
              />
              <p className="mt-1.5 text-xs text-brand-slate">
                Copy it word for word. A reviewer comparing the note to the plan should find the
                same sentence in both.
              </p>
            </div>

            <div>
              <label htmlFor="o-strategies" className={labelClass}>
                How staff support it
              </label>
              <textarea
                id="o-strategies"
                rows={3}
                value={form.supportStrategies}
                onChange={(e) => setForm({ ...form, supportStrategies: e.target.value })}
                placeholder="Offer two choices, then step back. Hand-over-hand only for the stove."
                className={inputClass}
              />
              <p className="mt-1.5 text-xs text-brand-slate">
                Shown to the DSP while they document, so the strategy is in front of them when it
                matters.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="o-measure" className={labelClass}>
                  What counts as progress
                </label>
                <input
                  id="o-measure"
                  value={form.measure}
                  onChange={(e) => setForm({ ...form, measure: e.target.value })}
                  placeholder="Completes 3 of 4 steps unprompted"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="o-frequency" className={labelClass}>
                  How often
                </label>
                <input
                  id="o-frequency"
                  value={form.frequency}
                  onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                  placeholder="3x per week"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="o-category" className={labelClass}>
                Category <span className="font-normal normal-case">(optional)</span>
              </label>
              <input
                id="o-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Daily living"
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button onClick={save} disabled={busy || !form.title.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing ? 'Save changes' : 'Add outcome'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : (
        <Button onClick={startNew}>
          <Plus className="h-4 w-4" />
          Add an outcome
        </Button>
      )}

      {outcomes.length === 0 && !open ? (
        <Card className="text-center">
          <p className="font-semibold text-brand-navy">No outcomes yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-brand-slate">
            Add the outcomes from {residentName}&apos;s service plan. Staff will document against
            them on every shift, which is what shows the day supported the plan.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {outcomes.map((o) => (
            <Card key={o.id}>
              <div className="mb-2 flex flex-wrap items-start gap-2">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-brand-teal" />
                <h3 className="text-sm font-semibold text-brand-navy">{o.title}</h3>
                {o.category ? <Badge tone="neutral">{o.category}</Badge> : null}
                {!o.active ? <Badge tone="missing">Retired</Badge> : null}
                {o.frequency ? (
                  <span className="text-xs text-brand-slate">{o.frequency}</span>
                ) : null}
              </div>

              {o.statement ? (
                <p className="mb-2 ml-6 text-sm text-brand-navy">{o.statement}</p>
              ) : null}
              {o.supportStrategies ? (
                <p className="ml-6 text-xs text-brand-slate">
                  <span className="font-semibold">Support: </span>
                  {o.supportStrategies}
                </p>
              ) : null}
              {o.measure ? (
                <p className="ml-6 mt-1 text-xs text-brand-slate">
                  <span className="font-semibold">Progress: </span>
                  {o.measure}
                </p>
              ) : null}

              {o.active ? (
                <div className="ml-6 mt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => startEdit(o)}
                    className="text-xs font-semibold text-brand-teal hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => retire(o)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-slate hover:text-brand-navy"
                  >
                    <Archive className="h-3 w-3" />
                    Retire
                  </button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-brand-slate">
        Retiring an outcome removes it from new notes. It is never deleted — signed notes
        reference it, and those are permanent records.
      </p>
    </div>
  );
}
