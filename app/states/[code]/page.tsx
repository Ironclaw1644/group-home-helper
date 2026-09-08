import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { FormPreview } from '@/components/branding/branding-editor';
import { DEFAULT_BRAND } from '@/lib/branding/theme';
import { listJurisdictions, listJurisdictionDetails } from '@/lib/jurisdictions';

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

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const state = await findState(code);
  if (!state) return { title: 'State not found' };
  return {
    title: `What FlipBrief prints in ${state.name}`,
    description: state.citation
      ? `${state.name}: the printed note cites ${state.citation.replace(/^Layout built to satisfy /, '').replace(/ Not a state-issued form\.$/, '')}`
      : `${state.name}: a complete progress note that makes no claim about state regulations.`
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

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl bg-flip-paper px-5 py-10">
      <Link href="/states" className="text-sm font-semibold text-flip-moss hover:underline">
        ← All states
      </Link>

      <h1 className="fb-display mt-6 text-[2rem] font-medium leading-[1.05] text-flip-forest sm:text-[2.5rem]">
        {state.name}
      </h1>

      {state.code === 'US-WV' ? (
        <p className="mt-4 text-[1rem] leading-relaxed text-flip-slate">
          West Virginia is the only state in the country that publishes a
          progress-note form a provider fills in. This reproduces it, and the
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

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-[0.12em] text-flip-slate">
        The top of the page
      </h2>
      <p className="mt-1 text-[0.9rem] text-flip-slate">
        Your own name, logo and colours go here. This is the real preview, the
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
