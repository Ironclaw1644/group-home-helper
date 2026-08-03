import Link from 'next/link';
import {
  ArrowRight,
  FileBarChart,
  FolderOpen,
  Sparkles,
  Target,
  UserPlus
} from 'lucide-react';

/**
 * What you can do from here.
 *
 * The app has a dozen screens and most of what makes it worth paying for —
 * service plans, progress, quarterly reviews — used to be reachable only by
 * knowing to click into a resident first. This is the discovery surface: named
 * actions with a sentence saying why each one matters.
 *
 * The AI card leads because it is the thing that changes a DSP's day, and the
 * one people are most likely to miss.
 */

type Action = {
  href: string;
  /** Marks the card whose destination is computed rather than fixed. */
  key?: 'write';
  title: string;
  detail: string;
  icon: typeof Sparkles;
  supervisorOnly?: boolean;
  feature?: boolean;
};

const ACTIONS: Action[] = [
  {
    href: '',
    key: 'write',
    title: 'Write a note with the assistant',
    detail: 'Tap what happened. It writes the note in your agency’s voice — you read and sign.',
    icon: Sparkles,
    feature: true
  },
  {
    href: '/residents',
    title: 'Residents',
    detail: 'Everyone in the house, their rooms, and how to reach their records.',
    icon: UserPlus
  },
  {
    href: '/residents',
    title: 'Service plans',
    detail: 'The outcomes staff document against. This is what makes each note defensible.',
    icon: Target,
    supervisorOnly: true
  },
  {
    href: '/reports',
    title: 'Quarterly reviews',
    detail: 'Progress against every outcome, counted from signed notes, ready to sign.',
    icon: FileBarChart,
    supervisorOnly: true
  },
  {
    href: '/residents',
    title: 'Documents',
    detail: 'ISPs, assessments, consents. Stored, searchable, and printable.',
    icon: FolderOpen
  }
];

export function QuickActions({
  role,
  writeNoteHref
}: {
  role: 'dsp' | 'supervisor' | 'admin';
  /**
   * Where "write a note" should go: the next shift still needing one.
   *
   * Null when every note for the day is written. The card then explains that
   * rather than linking somewhere — it previously pointed at "/", which is the
   * page it sits on, so clicking it did nothing at all.
   */
  writeNoteHref: string | null;
}) {
  const actions = ACTIONS.filter((a) => !a.supervisorOnly || role !== 'dsp');

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-brand-slate">
        What you can do
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        {actions.map((action) => {
          const isWrite = action.key === 'write';
          const href = isWrite ? writeNoteHref : action.href;

          // Every note is written, so there is nothing to link to. Say so
          // rather than offering a button that goes nowhere. The write card is
          // the only one whose href is computed, so it is the only one that can
          // land here.
          if (!href) {
            return (
              <div
                key={action.title}
                className="rounded-2xl border border-brand-navy/10 bg-brand-sand/40 p-4 sm:col-span-2"
              >
                <div className="flex items-start gap-3">
                  <action.icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-slate" />
                  <div>
                    <p className="text-sm font-semibold text-brand-navy">{action.title}</p>
                    <p className="mt-0.5 text-xs text-brand-slate">
                      Every note for this day is already written. Pick another day below, or open a
                      resident from the list.
                    </p>
                  </div>
                </div>
              </div>
            );
          }

          return (
          <Link
            key={action.title}
            href={href}
            className={
              action.feature
                ? 'group rounded-2xl border border-brand-teal/40 bg-brand-aqua/15 p-4 transition hover:border-brand-teal sm:col-span-2'
                : 'group rounded-2xl border border-brand-navy/10 bg-white p-4 transition hover:border-brand-teal/40 hover:bg-brand-sand/50'
            }
          >
            <div className="flex items-start gap-3">
              <action.icon
                className={
                  action.feature
                    ? 'mt-0.5 h-5 w-5 shrink-0 text-brand-teal'
                    : 'mt-0.5 h-5 w-5 shrink-0 text-brand-slate group-hover:text-brand-teal'
                }
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-navy">
                  {action.title}
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                </p>
                <p className="mt-0.5 text-xs text-brand-slate">{action.detail}</p>
              </div>
            </div>
          </Link>
          );
        })}
      </div>
    </section>
  );
}
