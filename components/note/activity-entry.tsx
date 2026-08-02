'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, Info } from 'lucide-react';
import type { NoteActivity, OutcomeActivity } from '@/lib/types';

/**
 * Answer one support activity for this shift.
 *
 * A plain Yes/No, because that is what Virginia's own data sheets ask —
 * "Did John have coffee with friends? Yes / No", with staff initials and a
 * separate concerns question. Nothing here asks the DSP to grade anything;
 * they are recording what happened.
 *
 * Unanswered stays unanswered. A blank is a gap in the record and a "no" is a
 * documented fact, and turning the first into the second would put a claim in
 * the chart that nobody made.
 */
export function ActivityEntry({
  activity,
  value,
  onChange,
  disabled
}: {
  activity: OutcomeActivity;
  value: NoteActivity;
  onChange: (next: NoteActivity) => void;
  disabled?: boolean;
}) {
  const [showHow, setShowHow] = useState(false);

  const set = (patch: Partial<NoteActivity>) => onChange({ ...value, ...patch });

  const answer = (label: string, yes: boolean) => {
    const active = value.completed === yes;
    return (
      <button
        type="button"
        onClick={() => set({ completed: active ? null : yes })}
        disabled={disabled}
        aria-pressed={active}
        className={
          active
            ? yes
              ? 'rounded-xl bg-status-signed px-4 py-2 text-xs font-semibold text-white'
              : 'rounded-xl bg-status-draft px-4 py-2 text-xs font-semibold text-white'
            : 'rounded-xl border border-brand-navy/15 bg-white px-4 py-2 text-xs font-medium text-brand-navy hover:bg-brand-sand disabled:opacity-50'
        }
      >
        {label}
      </button>
    );
  };

  return (
    <div className="rounded-lg border border-brand-navy/10 bg-white p-3">
      <p className="text-sm text-brand-navy">
        {activity.dailyQuestion || activity.description}
      </p>

      {activity.measure ? (
        <p className="mt-0.5 text-xs text-brand-slate">Plan: {activity.measure}</p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {answer('Yes', true)}
        {answer('No', false)}

        {activity.supportInstructions ? (
          <button
            type="button"
            onClick={() => setShowHow((v) => !v)}
            aria-expanded={showHow}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-teal hover:underline"
          >
            <Info className="h-3 w-3" />
            How to support
            <ChevronDown className={showHow ? 'h-3 w-3 rotate-180' : 'h-3 w-3'} />
          </button>
        ) : null}
      </div>

      {showHow && activity.supportInstructions ? (
        <p className="mt-2 rounded-lg bg-brand-sand/70 p-3 text-xs text-brand-navy">
          {activity.supportInstructions}
        </p>
      ) : null}

      {value.completed !== null ? (
        <div className="mt-3 space-y-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={value.concern}
              onChange={(e) => set({ concern: e.target.checked })}
              disabled={disabled}
              className="h-4 w-4 accent-status-draft"
            />
            <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-navy">
              <AlertTriangle className="h-3 w-3 text-status-draft" />
              Something to flag
            </span>
          </label>

          {/* Prompted whenever there is a concern or a "no" — those are the two
              cases where a bare checkbox tells a reviewer nothing useful. */}
          {value.concern || value.completed === false ? (
            <textarea
              rows={2}
              disabled={disabled}
              value={value.comment ?? ''}
              onChange={(e) => set({ comment: e.target.value })}
              placeholder={
                value.completed === false
                  ? 'What got in the way?'
                  : 'What did you notice? Write what you saw, not what it might mean.'
              }
              aria-label="Details"
              className="w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy placeholder:text-brand-slate/60 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
