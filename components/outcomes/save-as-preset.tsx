'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookmarkPlus, Loader2, X } from 'lucide-react';
import { Alert, Button, Card } from '@/components/ui';
import {
  draftPresetFrom,
  draftTexts,
  findNames,
  type NameIdentity,
  type PresetDraft
} from '@/lib/outcomes/depersonalize';
import type { Outcome, OutcomeActivity } from '@/lib/types';

/**
 * Save one resident's outcome as a preset the whole agency can start from.
 *
 * The thing this screen exists to prevent: an outcome is written about a
 * person, by name, and a preset is an org-wide row that colleagues with no
 * access to that person's home can read. Copying it across as typed would move
 * PHI over that line without anyone noticing.
 *
 * So the text is de-personalized first — `{name}`, `{subject}`, `{object}`,
 * `{possessive}`, the same placeholders the starter library uses — and the
 * result is shown here to read and edit before anything is written. The
 * substitution is machine work and the reading is the control, which is why
 * the editable text is the de-personalized text and not the original.
 *
 * A name we could not take out blocks the save and says which name. A pronoun
 * we could not resolve is called out but does not block: it is not identifying,
 * and a supervisor can reword it better than a regex can.
 */
export function SaveAsPreset({
  residentId,
  identity,
  outcome,
  activities,
  onClose
}: {
  residentId: string;
  identity: NameIdentity;
  outcome: Outcome;
  activities: OutcomeActivity[];
  onClose: () => void;
}) {
  const router = useRouter();
  const initial = useMemo(
    () => draftPresetFrom(outcome, activities, identity),
    [outcome, activities, identity]
  );

  const [draft, setDraft] = useState<PresetDraft>(initial.draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recomputed against what is on screen now, not against what the
  // substitution produced — the supervisor can type a name back in.
  const leaked = useMemo(
    () => [...new Set(draftTexts(draft).flatMap((t) => findNames(t, identity)))],
    [draft, identity]
  );

  const carriesNothingElse = Boolean(outcome.supportStrategies || outcome.measure);

  function setField<K extends keyof PresetDraft>(key: K, value: PresetDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setActivity(index: number, patch: Partial<PresetDraft['activities'][number]>) {
    setDraft((d) => ({
      ...d,
      activities: d.activities.map((a, i) => (i === index ? { ...a, ...patch } : a))
    }));
  }

  async function save() {
    setBusy(true);
    setError(null);

    const res = await fetch('/api/outcomes/presets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sourceResidentId: residentId,
        title: draft.title.trim(),
        category: draft.category.trim() || null,
        lens: draft.lens ?? null,
        importantTo: draft.importantTo.trim() || null,
        importantFor: draft.importantFor.trim() || null,
        statement: draft.statement.trim() || null,
        frequency: draft.frequency.trim() || null,
        activities: draft.activities
      })
    });

    const body = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(body.error ?? 'Could not save that preset.');
      return;
    }

    onClose();
    router.refresh();
  }

  const inputClass =
    'w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy placeholder:text-brand-slate/60 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30';
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-brand-slate';

  return (
    <Card className="mt-3 border-brand-teal/30 bg-brand-sand/30">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-brand-navy">Save as a preset</h3>
          <p className="mt-1 max-w-xl text-xs text-brand-slate">
            Everyone at your agency will be able to start a plan from this wording. It is a
            drafting aid like the starter outcomes — whoever uses it still rewrites it in that
            person&apos;s own words.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel"
          className="text-brand-slate hover:text-brand-navy"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Said before the fields, because it explains why the text below does
          not read the way the supervisor wrote it. */}
      <p className="mb-3 rounded-xl bg-white/70 p-3 text-xs text-brand-slate">
        <span className="font-semibold text-brand-navy">
          {identity.preferredName?.trim() || identity.firstName}&apos;s name and pronouns have been
          taken out
        </span>{' '}
        and replaced with <code className="font-semibold">{'{name}'}</code>,{' '}
        <code className="font-semibold">{'{subject}'}</code>,{' '}
        <code className="font-semibold">{'{object}'}</code> and{' '}
        <code className="font-semibold">{'{possessive}'}</code>, which fill in with the next
        person&apos;s own name and pronouns. Read it through — a nickname, a housemate or a
        relative named in the text is not something this can find.
      </p>

      {error ? (
        <div className="mb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      {leaked.length > 0 ? (
        <div className="mb-3">
          <Alert tone="error">
            Still says {leaked.join(' and ')}. Replace {leaked.length === 1 ? 'it' : 'them'} with{' '}
            <code>{'{name}'}</code> before saving — a preset is shared with the whole agency.
          </Alert>
        </div>
      ) : null}

      {initial.ambiguous.length > 0 ? (
        <div className="mb-3">
          <Alert tone="warning">
            Left alone because substituting would be a guess: {initial.ambiguous.join(', ')}. For
            she/her, &quot;her&quot; can mean either <code>{'{object}'}</code> or{' '}
            <code>{'{possessive}'}</code>, and picking the wrong one puts the wrong word in
            somebody else&apos;s plan. Reword or replace it by hand.
          </Alert>
        </div>
      ) : null}

      {initial.recasedPronoun ? (
        <p className="mb-3 text-xs text-brand-slate">
          A pronoun that started a sentence became a placeholder, and placeholders fill in
          lowercase. Check those sentences still read right.
        </p>
      ) : null}

      {carriesNothingElse ? (
        <p className="mb-3 text-xs text-brand-slate">
          A preset carries the outcome and its support activities. The support notes and progress
          measure on this outcome are not copied — they are about how this is working for{' '}
          {identity.preferredName?.trim() || identity.firstName}.
        </p>
      ) : null}

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="p-title" className={labelClass}>
              Short name
            </label>
            <input
              id="p-title"
              value={draft.title}
              onChange={(e) => setField('title', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="p-category" className={labelClass}>
              Category <span className="font-normal normal-case">(optional)</span>
            </label>
            <input
              id="p-category"
              value={draft.category}
              onChange={(e) => setField('category', e.target.value)}
              placeholder="Whatever your agency calls this group"
              className={inputClass}
            />
            <p className="mt-1.5 text-xs text-brand-slate">
              Your own wording. It groups the preset in the picker; leave it blank and it sits on
              its own.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="p-statement" className={labelClass}>
            Outcome
          </label>
          <textarea
            id="p-statement"
            rows={2}
            value={draft.statement}
            onChange={(e) => setField('statement', e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="p-important-to" className={labelClass}>
              Important to <span className="font-normal normal-case">(optional)</span>
            </label>
            <input
              id="p-important-to"
              value={draft.importantTo}
              onChange={(e) => setField('importantTo', e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="p-frequency" className={labelClass}>
              How often <span className="font-normal normal-case">(optional)</span>
            </label>
            <input
              id="p-frequency"
              value={draft.frequency}
              onChange={(e) => setField('frequency', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {draft.importantFor ? (
          <div>
            <label htmlFor="p-important-for" className={labelClass}>
              Important for
            </label>
            <input
              id="p-important-for"
              value={draft.importantFor}
              onChange={(e) => setField('importantFor', e.target.value)}
              className={inputClass}
            />
          </div>
        ) : null}

        {draft.activities.length > 0 ? (
          <div>
            <p className={labelClass}>
              Support activities ({draft.activities.length})
            </p>
            <div className="space-y-3">
              {draft.activities.map((a, i) => (
                <div
                  key={i}
                  className="space-y-2 rounded-xl border border-brand-navy/10 bg-white p-3"
                >
                  <input
                    value={a.description}
                    onChange={(e) => setActivity(i, { description: e.target.value })}
                    aria-label={`Activity ${i + 1}`}
                    className={inputClass}
                  />
                  <input
                    value={a.measure}
                    onChange={(e) => setActivity(i, { measure: e.target.value })}
                    aria-label={`Activity ${i + 1} measure`}
                    placeholder="What counts as progress"
                    className={inputClass}
                  />
                  <textarea
                    rows={2}
                    value={a.supportInstructions}
                    onChange={(e) => setActivity(i, { supportInstructions: e.target.value })}
                    aria-label={`Activity ${i + 1} support instructions`}
                    placeholder="How staff support it"
                    className={inputClass}
                  />
                  <input
                    value={a.dailyQuestion}
                    onChange={(e) => setActivity(i, { dailyQuestion: e.target.value })}
                    aria-label={`Activity ${i + 1} daily question`}
                    placeholder="The yes/no staff answer each shift"
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex gap-2">
        <Button onClick={save} disabled={busy || leaked.length > 0 || !draft.title.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
          Save preset
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
