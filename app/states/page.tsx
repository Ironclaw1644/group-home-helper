import Link from 'next/link';
import type { Metadata } from 'next';
import { listJurisdictionDetails } from '@/lib/jurisdictions';
import { SiteMenu } from '@/components/marketing/site-menu';

/**
 * What your state gets — public, and deliberately unflattering where it should
 * be.
 *
 * Fifty-two jurisdictions ship a template and until now a visitor had no way
 * to see that. Worse, the honest shape of it is genuinely interesting and was
 * invisible: almost no state publishes a progress-note form, so "which states
 * do you support" is the wrong question and "does the page you print cite MY
 * rule" is the right one.
 *
 * The page is therefore split into three groups rather than a flat list of
 * fifty-two ticks. A flat list would imply parity that does not exist, and an
 * owner in one of the twenty-eight would find out the hard way.
 *
 * It also states, in the open, that most states publish nothing to cite. That
 * is not a weakness to bury — an owner who has spent an afternoon looking for
 * their state's official form and not finding one has been told by every other
 * vendor that theirs is covered. Being the first page that says "there isn't
 * one, here is what we do instead" is worth more than a longer tick list.
 */

export const metadata: Metadata = {
  title: 'What FlipBrief prints in your state',
  description:
    'Every state and DC. Which ones cite your own documentation rule on the printed page, which reproduce your state’s form, and which print a general-purpose note that claims nothing.'
};

export const revalidate = 3600;

export default async function StatesPage() {
  const all = await listJurisdictionDetails();

  // West Virginia is the only state of the fifty-one that REQUIRES its own
  // form, so it gets a group of one rather than being lost among the cited.
  // Not the only one that publishes a form: Texas publishes 4119, 4118, 4117
  // and 2124, and tells providers they may use those or anything else that
  // meets the requirements. This comment said otherwise, and so did the page.
  const reproduced = all.filter((j) => j.code === 'US-WV');
  const cited = all.filter((j) => j.citation && j.code !== 'US-WV');
  const plain = all.filter((j) => !j.citation && j.code !== 'US-WV');

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-flip-paper px-5 py-10">
      {/* This page carried a back link and nothing else, so the only way on
          from it was backwards. The menu is the one the landing header has. */}
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-sm font-semibold text-flip-moss hover:underline">
          ← FlipBrief
        </Link>
        <SiteMenu />
      </div>

      <h1 className="fb-display mt-6 text-[2.1rem] font-medium leading-[1.05] text-flip-forest sm:text-[2.8rem]">
        What we print in your state.
      </h1>

      {/*
        This said "almost no state publishes a progress-note form", and the
        group below it said "1 state publishes an actual form". Two of the
        fifty-one do. Texas publishes Form 4119 for residential support, and
        our own research file has recorded that in `publishes: form` since the
        day it was written — the copy was simply never reconciled with it.

        The line that actually separates West Virginia is not that it publishes
        a form. It is that West Virginia makes you use it.
      */}
      <p className="mt-4 max-w-[54ch] text-[1.02rem] leading-relaxed text-flip-slate">
        Two states publish a form for this, and only one of them makes you use
        it. The other forty-nine publish a rule about what a note has to
        contain and leave the page to you — so the useful question is not
        whether we “support” your state, it is whether the document we print
        cites the rule you are actually held to.
      </p>

      <Group
        title={
          reproduced.length === 1
            ? 'One state requires its own form'
            : `${reproduced.length} states require their own form`
        }
        lede="West Virginia’s provider manual says documentation must be completed on a Direct-Support Service Log (WV-BMS-IDD-7). We reproduce it, and say which revision. Texas publishes forms too — Form 4119 for residential support among them — but tells providers they may document any way that meets the requirements, so Texas gets its rule at the foot of the page instead."
        items={reproduced}
        tone="best"
      />
      <Group
        title={`${cited.length} states cite their own documentation rule`}
        lede="The rule is printed at the foot of every page, so a licensing specialist can check it. Somebody read each one and a script re-fetched the state’s own site to confirm both the rule number and a quotation from it."
        items={cited}
        tone="good"
      />
      <Group
        title={`${plain.length} states print a general-purpose note`}
        lede="Either the state publishes no rule about note content, or what it publishes is about record retention or file contents rather than what a note must say. These print a complete, defensible note that makes no claim about your regulations — which is the honest output, and better than carrying a citation that would not survive being looked up."
        items={plain}
        tone="plain"
      />

      <div className="mt-12 rounded-2xl bg-flip-forest p-6 text-flip-paper">
        <p className="text-[1.05rem] font-semibold">Not sure which you are?</p>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-flip-sand">
          Open the demo, pick your state in Settings, and look at the printed
          page. It takes about a minute and asks you for nothing.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-xl bg-flip-paper px-4 py-2.5 text-sm font-semibold text-flip-forest hover:bg-flip-sand"
        >
          Open the demo →
        </Link>
      </div>
    </main>
  );
}

function Group({
  title,
  lede,
  items,
  tone
}: {
  title: string;
  lede: string;
  items: { code: string; name: string; citation: string | null; formLine: string }[];
  tone: 'best' | 'good' | 'plain';
}) {
  if (items.length === 0) return null;

  const accent =
    tone === 'best' ? 'bg-flip-moss' : tone === 'good' ? 'bg-flip-amber' : 'bg-flip-slate';

  return (
    <section className="mt-12">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${accent}`} aria-hidden />
        <h2 className="text-[1.15rem] font-semibold text-flip-forest">{title}</h2>
      </div>
      <p className="mt-2 max-w-[58ch] text-[0.92rem] leading-relaxed text-flip-slate">{lede}</p>

      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        {items.map((j) => (
          <li key={j.code}>
            <Link
              href={`/states/${j.code}`}
              className="block rounded-xl bg-flip-card p-4 ring-1 ring-flip-forest/10 transition hover:ring-flip-moss/40"
            >
              <p className="flex items-center justify-between gap-2 text-[0.98rem] font-semibold text-flip-forest">
                {j.name}
                {/* A page icon, because "show me the form" is the question
                    every one of these prompts and a list with no way through
                    to the document is just a longer tick list. */}
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-flip-moss" strokeWidth="1.8" aria-hidden>
                  <path d="M14 3v5h5" />
                  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                  <path d="M9 13h6M9 17h4" />
                </svg>
              </p>
            {/* The citation is the whole point for a cited state, so it is
                shown in full rather than truncated — a rule number a reader
                cannot finish reading is no better than none. */}
            <p className="mt-1 text-[0.8rem] leading-snug text-flip-slate">
              {j.citation
                ? j.citation.replace(/^Layout built to satisfy /, '').replace(/ Not a state-issued form\.$/, '')
                : j.formLine}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
