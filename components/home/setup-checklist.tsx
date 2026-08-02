import Link from 'next/link';
import { ArrowRight, Check, Circle } from 'lucide-react';
import { Card } from '@/components/ui';

/**
 * What is left before the agency is actually set up.
 *
 * A new workspace is empty and the app cannot show its value on empty data —
 * the roster is blank, the quarterly review has nothing to count, and the
 * compliance watch has nothing to watch. Rather than leaving someone to guess
 * the order, this names the next thing and disappears once it is done.
 */

export type SetupState = {
  hasResidents: boolean;
  hasOutcomes: boolean;
  hasStaff: boolean;
  hasSignedNote: boolean;
  hasBranding: boolean;
};

export function SetupChecklist({ state }: { state: SetupState }) {
  const steps = [
    {
      done: state.hasResidents,
      label: 'Add the people who live here',
      detail: 'One at a time, or import a whole roster from a spreadsheet.',
      href: '/residents'
    },
    {
      done: state.hasOutcomes,
      label: 'Put their service plans in',
      detail: 'The outcomes staff document against. This is what makes a note defensible.',
      href: '/residents'
    },
    {
      done: state.hasStaff,
      label: 'Invite your staff',
      detail: 'They get a link, pick a password, and land in the right house.',
      href: '/staff'
    },
    {
      done: state.hasBranding,
      label: 'Add your logo and colours',
      detail: 'So the printed form carries your agency, not ours.',
      href: '/settings'
    },
    {
      done: state.hasSignedNote,
      label: 'Write and sign one note',
      detail: 'Everything else — progress, reviews, exports — builds from signed notes.',
      href: '/'
    }
  ];

  const remaining = steps.filter((s) => !s.done);
  if (remaining.length === 0) return null;

  const next = remaining[0];
  const done = steps.length - remaining.length;

  return (
    <Card className="mb-6">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold text-brand-navy">Finish setting up</h2>
        <span className="text-xs text-brand-slate">
          {done} of {steps.length} done
        </span>
      </div>

      <ul className="space-y-1.5">
        {steps.map((step) => (
          <li key={step.label}>
            <Link
              href={step.href}
              className={
                step === next
                  ? 'flex items-start gap-2.5 rounded-lg bg-brand-aqua/20 px-2 py-2'
                  : 'flex items-start gap-2.5 rounded-lg px-2 py-2 hover:bg-brand-sand/60'
              }
            >
              {step.done ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-status-signed" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-brand-slate/40" />
              )}
              <span className="min-w-0 flex-1">
                <span
                  className={
                    step.done
                      ? 'block text-sm text-brand-slate line-through'
                      : 'block text-sm font-medium text-brand-navy'
                  }
                >
                  {step.label}
                </span>
                {!step.done ? (
                  <span className="block text-xs text-brand-slate">{step.detail}</span>
                ) : null}
              </span>
              {step === next ? (
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-brand-teal" />
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
