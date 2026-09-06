'use client';

import { useState } from 'react';
import { ChevronDown, Target } from 'lucide-react';
import { PROGRESS_LEVELS, SUPPORT_LEVELS } from '@/lib/types';
import { ActivityEntry } from '@/components/note/activity-entry';
import type {
  NoteActivity,
  NoteOutcome,
  Outcome,
  OutcomeActivity,
  ProgressLevel,
  SupportLevel
} from '@/lib/types';

/**
 * Document one ISP outcome for this shift.
 *
 * This is the part of the note a Medicaid reviewer actually reads. A day of
 * service is defensible when the record shows which of the person's outcomes
 * were worked on, what support was given, and how they responded — not when it
 * says they had a nice day.
 *
 * Collapsed until the DSP marks it worked on. A resident can carry six or eight
 * outcomes, and showing every detail field for all of them turns a two-minute
 * note into a wall of inputs.
 *
 * Three states, not two. `addressed === null` is "not answered yet" and neither
 * chip is lit — a fresh note used to render "Not this shift" in the selected
 * style, which meant an untouched draft already asserted that none of this
 * person's service-plan outcomes had been worked on. Nobody had said that.
 */
export function OutcomeEntry({
  outcome,
  value,
  onChange,
  activities,
  activityValues,
  onActivityChange,
  disabled
}: {
  outcome: Outcome;
  value: NoteOutcome;
  onChange: (next: NoteOutcome) => void;
  /** This outcome's support activities — the WHAT under the WHERE. */
  activities: OutcomeActivity[];
  activityValues: NoteActivity[];
  onActivityChange: (next: NoteActivity) => void;
  disabled?: boolean;
}) {
  const [showPlan, setShowPlan] = useState(false);

  const set = (patch: Partial<NoteOutcome>) => onChange({ ...value, ...patch });

  const unanswered = value.addressed === null;

  const chip = (
    active: boolean,
    label: string,
    onClick: () => void,
    tone: 'default' | 'warn' = 'default'
  ) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      // Now that an answer is required, these are thumb targets on a phone
      // mid-shift, not decoration: 44 px minimum.
      className={
        'inline-flex min-h-[44px] items-center rounded-xl px-4 text-xs ' +
        (active
          ? tone === 'warn'
            ? 'bg-status-draft font-semibold text-white'
            : 'bg-brand-navy font-semibold text-white'
          : 'border border-brand-navy/15 bg-white font-medium text-brand-navy hover:bg-brand-sand disabled:opacity-50')
      }
    >
      {label}
    </button>
  );

  return (
    <div
      className={
        value.addressed === true
          ? 'rounded-xl border border-brand-teal/40 bg-brand-aqua/10 p-4'
          : unanswered
            ? // Dashed while it is still outstanding, so a DSP scrolling the
              // note can see at a glance which outcomes still need an answer.
              'rounded-xl border border-dashed border-status-draft/60 bg-status-draft/5 p-4'
            : 'rounded-xl border border-brand-navy/10 bg-white p-4'
      }
    >
      <div className="mb-1 flex items-start gap-2">
        <Target className="mt-0.5 h-4 w-4 shrink-0 text-brand-teal" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-brand-navy">{outcome.title}</h3>
          {outcome.frequency ? (
            <p className="text-xs text-brand-slate">Plan calls for: {outcome.frequency}</p>
          ) : null}
        </div>
      </div>

      {outcome.statement || outcome.supportStrategies || outcome.measure ? (
        <div className="mb-3 ml-6">
          <button
            type="button"
            onClick={() => setShowPlan((v) => !v)}
            aria-expanded={showPlan}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-teal hover:underline"
          >
            {showPlan ? 'Hide' : 'What the plan says'}
            <ChevronDown className={showPlan ? 'h-3 w-3 rotate-180' : 'h-3 w-3'} />
          </button>

          {showPlan ? (
            <div className="mt-2 space-y-2 rounded-lg bg-white/70 p-3 text-xs text-brand-navy">
              {outcome.statement ? (
                <p>
                  <span className="font-semibold">Outcome: </span>
                  {outcome.statement}
                </p>
              ) : null}
              {outcome.supportStrategies ? (
                <p>
                  <span className="font-semibold">How to support: </span>
                  {outcome.supportStrategies}
                </p>
              ) : null}
              {outcome.measure ? (
                <p>
                  <span className="font-semibold">Progress means: </span>
                  {outcome.measure}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {unanswered ? (
        <p className="mb-2 ml-6 text-xs font-semibold text-status-draft">
          Not answered yet — say whether this was worked on.
        </p>
      ) : null}

      <div className="ml-6 flex flex-wrap gap-2">
        {chip(value.addressed === true, 'Worked on this', () =>
          set({ addressed: true, progress: value.progress ?? null })
        )}
        {chip(
          value.addressed === false,
          'Not this shift',
          () => set({ addressed: false, supportLevel: null, progress: null }),
          'warn'
        )}
      </div>

      {value.addressed === true && activities.length > 0 ? (
        <div className="ml-6 mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-slate">
            Support activities
          </p>
          {activities.map((activity) => {
            const entry = activityValues.find((a) => a.activityId === activity.id) ?? {
              activityId: activity.id,
              completed: null,
              concern: false,
              comment: null
            };
            return (
              <ActivityEntry
                key={activity.id}
                activity={activity}
                value={entry}
                onChange={onActivityChange}
                disabled={disabled}
              />
            );
          })}
        </div>
      ) : null}

      {value.addressed === true ? (
        <div className="ml-6 mt-4 space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-slate">
              How much help was needed?
            </p>
            <div className="flex flex-wrap gap-2">
              {SUPPORT_LEVELS.map((s) =>
                chip(value.supportLevel === s.value, s.label, () =>
                  set({ supportLevel: value.supportLevel === s.value ? null : (s.value as SupportLevel) })
                )
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-slate">
              How did it go?
            </p>
            <div className="flex flex-wrap gap-2">
              {PROGRESS_LEVELS.map((p) =>
                chip(
                  value.progress === p.value,
                  p.label,
                  () =>
                    set({
                      progress: value.progress === p.value ? null : (p.value as ProgressLevel)
                    }),
                  p.value === 'regressed' || p.value === 'declined' ? 'warn' : 'default'
                )
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor={`outcome-comment-${outcome.id}`}
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-brand-slate"
            >
              What happened <span className="font-normal normal-case">(optional)</span>
            </label>
            <textarea
              id={`outcome-comment-${outcome.id}`}
              rows={2}
              disabled={disabled}
              value={value.comment ?? ''}
              onChange={(e) => set({ comment: e.target.value })}
              placeholder="A specific detail from this shift"
              className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy placeholder:text-brand-slate/60 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
            />
            <p className="mt-1 text-xs text-brand-slate">
              Anything written here can appear in the note. Nothing else will.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
