import Link from 'next/link';
import { Check } from 'lucide-react';

/**
 * First-run setup for a new agency: their form, their people, their staff.
 * Shown only while `?onboarding=1` is on the URL, so it never follows anyone
 * around the app after setup. Every step can be skipped — none of them is a
 * precondition for the others.
 */
const STEPS = [
  { key: 'form', label: 'Your form', href: '/forms?onboarding=1' },
  { key: 'people', label: 'Your people', href: '/residents/import?onboarding=1' },
  { key: 'staff', label: 'Your staff', href: '/staff?onboarding=1' }
] as const;

export type SetupStepKey = (typeof STEPS)[number]['key'];

export function SetupSteps({ current }: { current: SetupStepKey }) {
  const index = STEPS.findIndex((s) => s.key === current);
  const next = STEPS[index + 1];
  return (
    <nav aria-label="Setup" className="mb-5">
      <ol className="flex items-center gap-2 text-xs font-semibold">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <Link
              href={s.href}
              aria-current={i === index ? 'step' : undefined}
              className={
                i === index
                  ? 'flex items-center gap-1.5 rounded-full bg-brand-navy px-3 py-1.5 text-white'
                  : i < index
                    ? 'flex items-center gap-1.5 rounded-full bg-status-signed/15 px-3 py-1.5 text-brand-navy'
                    : 'flex items-center gap-1.5 rounded-full border border-brand-navy/15 px-3 py-1.5 text-brand-slate'
              }
            >
              {i < index ? <Check className="h-3.5 w-3.5" /> : <span>{i + 1}</span>}
              {s.label}
            </Link>
            {i < STEPS.length - 1 ? <span className="text-brand-slate/40">—</span> : null}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-brand-slate">
        {next ? (
          <Link href={next.href} className="font-semibold text-brand-teal underline">
            Skip this step
          </Link>
        ) : (
          <Link href="/" className="font-semibold text-brand-teal underline">
            Finish — go to today
          </Link>
        )}
      </p>
    </nav>
  );
}
