import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { FormPreview } from '@/components/branding/branding-editor';
import { DEFAULT_BRAND } from '@/lib/branding/theme';
import { listJurisdictions, listJurisdictionDetails } from '@/lib/jurisdictions';
import { SiteMenu } from '@/components/marketing/site-menu';
import { JsonLd, breadcrumbs } from '@/components/marketing/json-ld';
import { checkedOnLabel, stateRule } from '@/lib/state-page-rules';

/**
 * The form one state actually prints, before anybody signs up.
 *
 * /states says which of three groups a state is in. This answers the question
 * that immediately follows — "fine, show me" — because a provider who has been
 * told their state is covered has heard that before and wants the page.
 *
 * It renders through the same FormPreview the settings screen uses, fed by the
 * same jurisdiction captions the picker uses, so what a stranger sees here is
 * what a customer sees there and what the PDF prints. A second, prettier
 * preview built for marketing would drift from the product within a month and
 * would be the more persuasive of the two, which is the wrong way round.
 *
 * The agency identity shown is deliberately generic — "Your Agency, LLC", no
 * logo. The letterhead belongs to whoever signs up; putting a plausible
 * agency's name on a public sample would be inventing a customer.
 */

export const revalidate = 3600;

type Params = { params: Promise<{ code: string }> };

async function findState(code: string) {
  const wanted = decodeURIComponent(code).toUpperCase();
  const details = await listJurisdictionDetails();
  return details.find((d) => d.code.toUpperCase() === wanted) ?? null;
}

/** A search snippet shows about this much before it cuts off. */
const DESCRIPTION_LIMIT = 155;

function clip(text: string): string {
  if (text.length <= DESCRIPTION_LIMIT) return text;
  const cut = text.slice(0, DESCRIPTION_LIMIT - 1);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/**
 * The snippet under the search result. Built only from the citation text the
 * printed form already carries, so it can claim nothing the form does not.
 */
function describe(state: { code: string; name: string; citation: string | null }): string {
  const citation = state.citation?.trim();
  if (!citation) {
    return `${state.name}: a complete progress note that makes no claim about state regulations.`;
  }
  // A state whose rule we re-read gets the snippet a searcher is looking for:
  // that the page says what the rule asks for, not just which rule it is.
  const checked = stateRule(state.code, citation);
  if (checked && checked.elements.length >= 3 && state.code !== 'US-WV') {
    // A long manual title would be clipped mid-name, which reads worse than
    // not naming it; the page itself names it in full.
    const which = checked.citation.length <= 40 ? checked.citation : 'the state’s rule';
    return clip(
      `${state.name} group home progress notes: what ${which} asks a note to show, checked against the source, and the form we print.`
    );
  }
  // "Reproduces the WV I/DD Waiver ... Not issued by the state."
  if (/^Reproduces /.test(citation)) {
    return clip(`${state.name}: FlipBrief ${citation.charAt(0).toLowerCase()}${citation.slice(1)}`);
  }
  const rule = citation.replace(/^Layout built to satisfy /, '').replace(/ Not a state-issued form\.$/, '');
  return clip(`${state.name} group home progress note, laid out to satisfy ${rule}`);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const state = await findState(code);
  if (!state) return { title: 'State not found' };
  return {
    // "Requirements" only where the page names a rule: a state that cites
    // nothing gets a title that promises nothing.
    title: state.citation
      ? `${state.name} group home progress note requirements | FlipBrief`
      : `${state.name} group home progress notes | FlipBrief`,
    description: describe(state),
    // Public, and the root layout's noindex would otherwise hide it.
    robots: { index: true, follow: true },
    alternates: { canonical: `/states/${state.code}` },
    openGraph: { images: ['/og.png'] }
  };
}

export default async function StateFormPage({ params }: Params) {
  const { code } = await params;
  const state = await findState(code);
  if (!state) notFound();

  // The captions the picker offers, so this page and the sign-up preview
  // cannot disagree about what the state's form is called.
  const options = await listJurisdictions();
  const option = options.find((o) => o.code === state.code);

  const citation = state.citation
    ?.replace(/^Layout built to satisfy /, '')
    .replace(/ Not a state-issued form\.$/, '');
  const rule = stateRule(state.code, state.citation);

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl bg-flip-paper px-5 py-10">
      <JsonLd
        data={breadcrumbs([
          ['FlipBrief', '/'],
          ['States', '/states'],
          [state.name, `/states/${state.code}`]
        ])}
      />
      <div className="flex items-center justify-between gap-4">
        <nav aria-label="Breadcrumb" className="text-sm font-semibold text-flip-moss">
          <Link href="/" className="hover:underline">FlipBrief</Link>
          <span className="px-1.5 text-flip-slate" aria-hidden>/</span>
          <Link href="/states" className="hover:underline">All states</Link>
        </nav>
        <SiteMenu />
      </div>

      {/*
        The heading used to be the state's name and nothing else, which told a
        searcher nothing about what the page answers. It now says it, and the
        word "requirements" appears only where the page names a rule.
      */}
      <h1 className="fb-display mt-6 text-[2rem] font-medium leading-[1.05] text-flip-forest sm:text-[2.5rem]">
        {state.citation ? (
          <>{state.name} group home progress note requirements</>
        ) : (
          <>Group home progress notes in {state.name}</>
        )}
      </h1>

      {/*
        The West Virginia paragraph claimed it was the only state in the
        country publishing a progress-note form a provider fills in. It is not:
        Texas publishes Form 4119 for residential support, and our own research
        file has recorded that as `publishes: form` all along. What is true,
        and checked at both sources today, is that West Virginia is the only
        one of the fifty-one that REQUIRES its form -- "documentation must be
        completed on a Direct-Support Service Log (WV-BMS-IDD-7)" -- where
        Texas says a provider may use its form "or another form created for a
        similarly intended purpose".
      */}
      {state.code === 'US-WV' ? (
        <p className="mt-4 text-[1rem] leading-relaxed text-flip-slate">
          West Virginia’s provider manual says documentation must be completed
          on a Direct-Support Service Log (WV-BMS-IDD-7). Of the fifty-one
          jurisdictions we checked it is the only one that requires a named
          form rather than leaving the page to you. This reproduces it, and the
          four questions below are the state’s own words.{' '}
          <span className="text-flip-forest">
            Their form is used when something out of the ordinary happens; we
            write one every shift, so you would be documenting more than the
            state asks, not less.
          </span>
        </p>
      ) : citation ? (
        <p className="mt-4 text-[1rem] leading-relaxed text-flip-slate">
          Every page prints this at the foot, so a licensing specialist can look
          it up:
          <span className="mt-2 block rounded-lg bg-flip-card px-3 py-2 font-mono text-[0.86rem] text-flip-forest ring-1 ring-flip-forest/10">
            {citation}
          </span>
        </p>
      ) : (
        <p className="mt-4 text-[1rem] leading-relaxed text-flip-slate">
          {state.name} publishes no rule about what a progress note must
          contain — what it publishes covers record retention or what an
          individual’s file holds. So this page cites nothing. It is a complete,
          defensible note that makes no claim about your regulations, which is
          the honest thing to print when there is no rule to point at.
        </p>
      )}

      {rule ? (
        <section aria-labelledby="rule-heading">
          <h2 id="rule-heading" className="mt-10 text-[1.25rem] font-semibold text-flip-forest">
            What the rule says
          </h2>
          <p className="mt-1 text-[0.9rem] text-flip-slate">
            {rule.citation}
            {rule.citationTitle ? <> — {rule.citationTitle}</> : null}
          </p>
          <blockquote className="mt-3 border-l-4 border-flip-moss/40 pl-4 text-[1rem] italic leading-relaxed text-flip-forest">
            “{rule.quote}”
          </blockquote>
          {rule.elements.length ? (
            <>
              <h3 className="mt-6 text-[1.05rem] font-semibold text-flip-forest">
                What it asks a note to show
              </h3>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[0.95rem] leading-relaxed text-flip-slate">
                {rule.elements.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </>
          ) : null}
          {/*
            Said on the page because it is true and a reader deciding whether
            to trust this list should know it: anything we could not find in
            the source on the day we checked was left off rather than kept.
          */}
          <p className="mt-4 text-[0.85rem] leading-relaxed text-flip-slate">
            Checked against{' '}
            <a href={rule.sourceUrl} className="font-semibold text-flip-moss underline" rel="noopener">
              the source document
            </a>{' '}
            on {checkedOnLabel()}.
            {rule.elementsDropped > 0
              ? ' Anything our research listed that we could not find in that document on the day was left off.'
              : ''}{' '}
            This is a summary to help you find the rule, not legal advice; your
            licensing specialist reads the rule itself.
          </p>
        </section>
      ) : null}

      <p className="mt-8 text-[0.95rem] leading-relaxed text-flip-slate">
        New to writing these?{' '}
        <Link href="/guides/dsp-shift-notes" className="font-semibold text-flip-moss underline">
          How to write a DSP shift note
        </Link>{' '}
        covers what the rules we have read ask of every note.
      </p>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-[0.12em] text-flip-slate">
        The top of the page
      </h2>
      <p className="mt-1 text-[0.9rem] text-flip-slate">
        Your own name, logo and colors go here. This is the real preview, the
        one the app uses.
      </p>

      <div className="mt-4">
        <FormPreview
          value={{
            orgName: '',
            legalName: '',
            letterheadLine: '',
            addressLine: '',
            footerLine: '',
            logoPreview: null,
            logoPath: null,
            logoInline: null,
            logoFile: null,
            // Only the five colour roles; DEFAULT_BRAND also carries logoUrl
            // and fontFamily, which are not colours and not this component's
            // business.
            colors: {
              navy: DEFAULT_BRAND.navy,
              teal: DEFAULT_BRAND.teal,
              aqua: DEFAULT_BRAND.aqua,
              sand: DEFAULT_BRAND.sand,
              slate: DEFAULT_BRAND.slate
            }
          }}
          form={
            option
              ? {
                  title: option.formTitle,
                  formLine: option.formLine,
                  identityLabels: option.identityLabels
                }
              : null
          }
        />
      </div>

      <div className="mt-10 rounded-2xl bg-flip-forest p-6 text-flip-paper">
        <p className="text-[1.02rem] font-semibold">See it with your own name on it</p>
        <p className="mt-2 text-[0.93rem] leading-relaxed text-flip-sand">
          The demo opens a sandbox with three fictional residents. Set
          {' '}{state.name}{' '} in Settings, add your logo, and print one. It asks
          you for nothing.
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
