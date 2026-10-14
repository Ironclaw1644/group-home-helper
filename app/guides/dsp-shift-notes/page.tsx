import Link from 'next/link';
import type { Metadata } from 'next';
import { SiteMenu } from '@/components/marketing/site-menu';
import { JsonLd, breadcrumbs } from '@/components/marketing/json-ld';
import rules from '@/lib/state-page-rules.data.json';
import { checkedOnLabel, type StatePageRule } from '@/lib/state-page-rules';

/**
 * How to write a DSP shift note — answered from the rules, not from opinion.
 *
 * Somebody searching "DSP shift notes" or "how to write a progress note" gets
 * a page of advice that is mostly one vendor's taste. What a provider actually
 * needs to know is what the people who audit the note will look for, and that
 * is written down: in the documentation rules of the states we have read.
 *
 * So every point on this page rests on a passage from a state's own rule, and
 * every passage comes from lib/state-page-rules.data.json, which
 * scripts/build-state-page-rules.py fills only with text it found in the
 * source document on the day it ran. A point whose evidence did not survive
 * that check is not rendered — there is no fallback copy for it, on purpose.
 *
 * Quotation marks are used only for quotes, which were matched word for word.
 * Required elements are our research's summary of a rule, matched to the
 * source more loosely, so they are shown as "lists", never inside quotes.
 */

export const metadata: Metadata = {
  title: 'How to write a DSP shift note: what state rules ask for | FlipBrief',
  description:
    'What group home shift notes and progress notes must show, quoted from state documentation rules: write it at the time, date and times, the plan, the person’s response, your signature.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/guides/dsp-shift-notes' },
  openGraph: { images: ['/og.png'], type: 'article' }
};

const STATES = rules.states as Record<string, StatePageRule>;
const GUIDE = rules.guideQuotes as Record<string, { code: string; where: string; quote: string; sourceUrl: string }>;

const NAMES: Record<string, string> = {
  'US-AK': 'Alaska',
  'US-IA': 'Iowa',
  'US-KY': 'Kentucky',
  'US-LA': 'Louisiana',
  'US-MO': 'Missouri',
  'US-NC': 'North Carolina',
  'US-OH': 'Ohio',
  'US-PA': 'Pennsylvania',
  'US-RI': 'Rhode Island',
  'US-SC': 'South Carolina',
  'US-TX': 'Texas',
  'US-VA': 'Virginia'
};

/** Where a point's evidence comes from. */
type Ref =
  | { code: string; quote: true }
  | { code: string; element: RegExp }
  | { guide: string };

type Evidence = { code: string; where: string; text: string; quoted: boolean };

function resolve(ref: Ref): Evidence | null {
  if ('guide' in ref) {
    const g = GUIDE[ref.guide];
    return g ? { code: g.code, where: g.where, text: g.quote, quoted: true } : null;
  }
  const rule = STATES[ref.code];
  if (!rule) return null;
  if ('quote' in ref) return { code: ref.code, where: rule.citation, text: rule.quote, quoted: true };
  const el = rule.elements.find((e) => ref.element.test(e));
  return el ? { code: ref.code, where: rule.citation, text: el.replace(/^[A-Z ]+:\s*/, ''), quoted: false } : null;
}

const POINTS: { title: string; body: string; refs: Ref[] }[] = [
  {
    title: 'Write it during the shift, or straight after',
    body: 'Not at the end of the week from memory. The rules below that say when all say the same thing: at the time, or as close to it as you can.',
    refs: [
      { code: 'US-LA', quote: true },
      { code: 'US-RI', element: /^Prepared at the time/ },
      { code: 'US-MO', quote: true }
    ]
  },
  {
    title: 'If it is late, say so',
    body: 'Never backdate. Where a rule covers late entries, it asks for them to be marked as late, and some notes carry the date they were written as well as the date of the service.',
    refs: [{ code: 'US-SC', quote: true }, { code: 'US-KY', element: /date the entry was made/i }]
  },
  {
    title: 'Put the date, and the start and stop times, on it',
    body: 'The full date, and for anything billed by time, when the service began and ended — not just how long it took.',
    refs: [
      { code: 'US-OH', element: /^Times the delivered service started and stopped/ },
      { code: 'US-AK', element: /^Stop and start times/ },
      { code: 'US-MO', element: /actual begin and end time/ }
    ]
  },
  {
    title: 'In a 24-hour home, one note for every shift',
    body: 'Each shift writes its own, and each note says which hours it covers.',
    refs: [{ code: 'US-NC', quote: true }]
  },
  {
    title: 'Say what you did, and tie it to the person’s plan',
    body: 'The note is the evidence that the plan is being carried out. Name the goal or outcome you worked on and what you did toward it.',
    refs: [
      { code: 'US-VA', quote: true },
      { code: 'US-OH', quote: true },
      { code: 'US-KY', quote: true }
    ]
  },
  {
    title: 'Write what the person did, not “had a good day”',
    body: 'What you did, and how the person responded to it. Texas names vague lines and ditto marks as unacceptable outright.',
    refs: [{ code: 'US-IA', quote: true }, { guide: 'tx-vague' }, { guide: 'tx-ditto' }]
  },
  {
    title: 'Describe anything unusual, and what you did about it',
    refs: [{ guide: 'tx-incident' }, { code: 'US-LA', element: /change in the recipient's medical condition/ }],
    body: 'A seizure, an illness, a behaviour — what happened and how staff responded belongs in the note, not only in a separate incident report.'
  },
  {
    title: 'Sign it, with your title',
    body: 'The person who gave the service signs the note. Several states want your title next to your name.',
    refs: [
      { code: 'US-RI', element: /^Legible, dated, and signed/ },
      { code: 'US-KY', element: /DAILY NOTE: The signature and title/ },
      { code: 'US-TX', quote: true }
    ]
  }
];

export default function DspShiftNotesGuide() {
  const points = POINTS.map((p) => ({ ...p, evidence: p.refs.map(resolve).filter((e): e is Evidence => e !== null) })).filter(
    (p) => p.evidence.length > 0
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl bg-flip-paper px-5 py-10">
      <JsonLd
        data={breadcrumbs([
          ['FlipBrief', '/'],
          ['How to write a DSP shift note', '/guides/dsp-shift-notes']
        ])}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: 'How to write a DSP shift note',
          description: metadata.description,
          url: 'https://flipbrief.com/guides/dsp-shift-notes',
          dateModified: rules.checkedOn,
          author: { '@type': 'Organization', name: 'FlipBrief', url: 'https://flipbrief.com/' },
          publisher: { '@id': 'https://flipbrief.com/#org' }
        }}
      />
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-sm font-semibold text-flip-moss hover:underline">
          ← FlipBrief
        </Link>
        <SiteMenu />
      </div>

      <h1 className="fb-display mt-6 text-[2rem] font-medium leading-[1.05] text-flip-forest sm:text-[2.5rem]">
        How to write a DSP shift note
      </h1>
      <p className="mt-4 text-[1rem] leading-relaxed text-flip-slate">
        Shift note, progress note, daily note, service log: states use all four
        names for the same record, the one that shows a service happened and
        what it did for the person. This page is what the state documentation
        rules we have read ask of it, in their own words, with a link to each
        rule.
      </p>
      <p className="mt-3 text-[0.9rem] leading-relaxed text-flip-slate">
        Every quote was checked against the state’s source document on{' '}
        {checkedOnLabel()}. Your own state’s rule is the one that counts —{' '}
        <Link href="/states" className="font-semibold text-flip-moss underline">
          look it up here
        </Link>
        . This is a guide, not legal advice.
      </p>

      <ol className="mt-8 space-y-8">
        {points.map((p, i) => (
          <li key={p.title}>
            <h2 className="text-[1.2rem] font-semibold leading-snug text-flip-forest">
              {i + 1}. {p.title}
            </h2>
            <p className="mt-2 text-[0.98rem] leading-relaxed text-flip-slate">{p.body}</p>
            <ul className="mt-3 space-y-2.5">
              {p.evidence.map((e) => (
                <li key={`${e.code}-${e.text}`} className="border-l-4 border-flip-moss/40 pl-3 text-[0.9rem] leading-relaxed">
                  <Link href={`/states/${e.code}`} className="font-semibold text-flip-moss hover:underline">
                    {NAMES[e.code] ?? e.code}
                  </Link>
                  <span className="text-flip-slate">, {e.where}{e.quoted ? ':' : ' lists:'} </span>
                  <span className="text-flip-forest">{e.quoted ? `“${e.text}”` : e.text}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <section aria-labelledby="checklist" className="mt-12 rounded-2xl bg-flip-card p-6 ring-1 ring-flip-forest/10">
        <h2 id="checklist" className="text-[1.15rem] font-semibold text-flip-forest">
          Before you sign: a shift-note checklist
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[0.95rem] leading-relaxed text-flip-slate">
          {points.map((p) => (
            <li key={p.title}>{p.title}.</li>
          ))}
        </ul>
      </section>

      <div className="mt-10 rounded-2xl bg-flip-forest p-6 text-flip-paper">
        <p className="text-[1.02rem] font-semibold">Or let the shift write it</p>
        <p className="mt-2 text-[0.93rem] leading-relaxed text-flip-sand">
          In FlipBrief, staff tap what happened and which plan goals they
          worked on, the note drafts itself from only what they tapped, and they
          read it and sign on their phone. It prints on your letterhead, on the
          form for your state.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-xl bg-flip-paper px-4 py-2.5 text-sm font-semibold text-flip-forest hover:bg-flip-sand"
        >
          See how it works →
        </Link>
      </div>
    </main>
  );
}
