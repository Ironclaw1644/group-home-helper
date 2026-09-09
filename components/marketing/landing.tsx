import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { FREE_ALLOWANCE } from '@/lib/billing/plan';
import { FlipLogo, FlipMark } from '@/components/brand/mark';
import { Walkthrough } from './walkthrough';
import { Films } from './films';
import { SiteMenu } from './site-menu';
import { DemoCta } from './demo-cta';
import { Reveal } from './reveal';
import './marketing.css';

/**
 * The FlipBrief landing page.
 *
 * Read by one person: the owner or administrator of a four-to-twenty bed group
 * home, on a phone, who is frightened of a state audit and currently keeping
 * progress notes in a binder. Everything here is written for them and nobody
 * else.
 *
 * Two rules held throughout:
 *
 * 1. Every claim is checkable against this repository. Where the code does not
 *    support a claim the claim is not made — see §"What FlipBrief does not do",
 *    which exists because the honest version of this page is also the more
 *    persuasive one for a buyer who has been sold to before.
 * 2. Nothing is themed by the signed-in app's palette. This page is served to
 *    strangers; `flip-*` are fixed colours, not the per-organization variables.
 */

const FACTS = [
  { k: '$100', v: 'a month, flat' },
  { k: 'Any', v: 'number of beds' },
  { k: '$0', v: 'to get set up' },
  // Was "#680 — Virginia's DBHDS form". That was wrong twice over: it stopped
  // being the whole truth when a second state shipped, and the form itself
  // never existed — 680 is a section of 12VAC35-105, not a document DBHDS
  // publishes. Every state and DC now has a template; twenty-three of them,
  // Virginia included, cite the state's own documentation rule on the page.
  { k: '50', v: 'states, plus DC' }
];

/**
 * What the walkthrough does not show.
 *
 * These used to be four cards restating the four steps a visitor has just
 * watched happen in real screenshots at the top of the page — the same words
 * as the captions, one scroll further down. What survived the cut is only the
 * part a screenshot cannot carry: what the software does that is not visible
 * in a picture of it.
 */
const STEPS = [
  {
    n: '01',
    head: 'The chips are the form',
    body: 'The same wording that is on the paper, and questions that carry the resident’s own name and pronouns — so nobody is reading “the individual” at the end of a twelve-hour shift.',
    aside: 'Their service-plan goals sit in the same list. Documenting the plan is not a second job.'
  },
  {
    n: '02',
    head: 'The draft is checked before you see it',
    body: 'It writes from what was recorded and nothing else. An invented clock time, a quoted sentence, or a topic nobody touched is flagged to the DSP before they can sign.',
    aside: 'The first ' + FREE_ALLOWANCE + ' drafts are free. Writing notes by hand never costs anything.'
  },
  {
    n: '03',
    head: 'Signing locks it in the database',
    body: 'Not in the app. No route, no script and no console session can edit a signed note afterwards, including ours.',
    aside: 'A correction goes on as a dated addendum, the way a paper chart works.'
  },
  {
    n: '04',
    head: 'The letterhead is yours',
    body: 'Legal name, logo, address and footer, pulled from your settings as the document renders. For a review, export a whole date range as one merged PDF and print it in a single pass.',
    aside: 'Quarterly progress against each resident’s plan builds itself from the notes already signed.'
  }
];

const TRUST = [
  {
    head: 'A signed note cannot be changed',
    body: 'Not by a supervisor, not by a support engineer, not by somebody with the database password. The refusal is a trigger inside Postgres, and it fires for every role. Addenda are append-only for the same reason.'
  },
  {
    head: 'Every read is on the record',
    body: 'Opening a note, rendering a PDF, running an export — each is written to an audit log with who, when, and the address it came from. That log can be added to and nothing else: no edit, no delete, enforced the same way.'
  },
  {
    head: 'Your letterhead, not ours',
    body: 'Legal name, address, logo and footer line are yours and are read per agency when the form is rendered. There is no default logo, because the only honest default for an agency that has not uploaded one is nothing at all.'
  },
  {
    head: 'Records stay inside your agency',
    body: 'Residents, notes and plans are visible only to the staff you invite, enforced by row-level security in the database rather than by what the screen chooses to show. Signatures and uploaded plans sit in private storage. Medicaid IDs are encrypted at rest.'
  }
];

const NOT_YET = [
  ['No eMAR.', 'Medication administration stays wherever you keep it today. If your staff open Therap every shift for the MAR, they will still open it.'],
  ['No incident reporting yet.', 'The note asks whether there was an incident and records the answer. Filing the report with your state is still yours to do.'],
  // This read "No state issues a form we can print... nobody gets a form
  // number, because nobody has one to give". Both sentences were false by the
  // time anybody read them. West Virginia issues WV-BMS-IDD-7 and we have
  // reproduced it since 0041, and Texas issues Form 4119 for residential
  // support — which our own research file has recorded as `publishes: form`
  // from the day it was written. The count was stale too: twenty-three had
  // become twenty-six.
  //
  // No number is quoted here now. A count typed into prose goes stale the next
  // time somebody reads a rule, and /states computes the three groups from the
  // database, so that is where the number belongs.
  ['Only one state’s form is built.', 'West Virginia requires documentation on a Direct-Support Service Log (WV-BMS-IDD-7) and we reproduce it. Texas publishes Form 4119 for residential support and we do not — a Texas note cites the Texas rule instead. Those two are the only states of the fifty-one that publish a form at all; everywhere else a state publishes a rule about what a note must contain and leaves the layout to you. Where we have read that rule we cite it at the foot of the page, and where we have not, the note is complete and defensible but claims nothing about your regulations. We used to say Virginia issued “Form #680” and printed that on every Virginia note. There is no such form — 680 is a section of 12VAC35-105, the regulation that requires progress notes at all. We had read a citation as a form number, and an invented one is the thing that actually hurts you in an audit. There is a page listing every state and exactly which of the three yours is.'],
  ['No scheduling, no time clock, no family portal.', 'Small agencies do not buy those from the same place they buy documentation, and we would build them badly.'],
  ['And no customers yet.', 'FlipBrief has not been sold to anyone. You would be the first. There is no logo wall on this page because there is nothing honest to put on it.']
];

const FAQ = [
  {
    q: 'How much work is one note, really?',
    a: 'Somebody counted, on a phone, on the demo anyone can open: one resident, one shift, two service-plan goals, from the roster to a signed note. Twenty-seven taps, twenty-eight if you open the PDF. Two service-plan goals account for ten of those taps — a shift with no plan work in it is closer to seventeen. None of them is typing. Then we timed it rather than guessing: three runs on the live site, one tap per second, from the roster to signed and locked. A note with one goal worked came to nineteen taps and thirty-one, thirty-three and forty-six seconds. Ten to twenty-four of those seconds were the draft being written — the slow one is the first note after a quiet spell — and a real person taps faster than once a second. The half hour we quote is not ours and we have not timed it: it is what a provider running homes today told us their own notes take. Treat that as one person telling you about their week rather than as a study — we looked for a study and there is not one, and the per-note figures quoted elsewhere in this market are usually invented. Your first week will be slower while people learn where things are, and a shift with an incident in it will always take longer, because it should. Count it yourself on the demo; if we are wrong we would rather you found out before you paid.'
  },
  {
    q: 'Does resident information go to an AI company?',
    a: 'On the hosted version, yes — and we are not going to phrase that away. Before a draft is requested the resident’s name is replaced with an initial, and long identification numbers, dates, phone numbers and email addresses are stripped out. If the resident’s name or Medicaid ID survives that pass, the request is refused instead of sent. That is real risk reduction and it is not de-identification, and we will not call it de-identification. A self-hosted install can point the assistant at a model running on a machine in your own building, in which case nothing leaves it. Ask which one you would be on before you decide.'
  },
  {
    q: 'Are you HIPAA certified? Will you sign a BAA?',
    a: 'No, and not yet. There is no HIPAA certification to hold — nobody issues one — and we have not signed a business associate agreement with you or with the model vendor. If a signed BAA is a condition of your contract or your insurer, that is a real blocker and you should hear it now rather than after you have typed a resident’s name in.'
  },
  {
    q: 'What if the assistant writes something that did not happen?',
    a: 'You catch it, and the product is built on the assumption that you will. The draft appears as editable text above the signature, never as a finished document. It is checked against the taps it came from, and anything it asserts that was not recorded is shown to the DSP as a warning before the note can be signed. Nothing is filed until a person reads it and signs their name to it.'
  },
  {
    q: 'Do we need computers?',
    a: 'No. It is built for the phone in a DSP’s pocket first and looks the way it should there. On an iPhone it installs from Safari with Add to Home Screen; on Android there is an app file on the download page that staff can install without an account. A note being written is saved on the device as it is typed and syncs when the signal comes back, so a basement laundry room does not lose a shift.'
  },
  {
    q: 'What happens if we stop paying?',
    a: 'Writing, signing, printing and exporting notes never require a subscription — that is true for a lapsed card as much as for a cancellation. What stops is the assistant. Your records stay readable and printable, because a documentation system that holds a Medicaid record hostage is not a documentation system.'
  },
  {
    q: 'Can we get our records out?',
    a: 'Pick a date range and a resident, or the whole house, and you get one merged PDF with every signed note in order. Per resident there is also a quarterly report built from the notes already signed. Both come out as documents, not as an export format only we can read.'
  }
];

export function Landing() {
  return (
    <div className="fb min-h-dvh bg-flip-paper font-flip text-flip-ink">
      <SiteHeader />

      <main>
        <Hero />
        <FactBand />
        <HowItWorks />
        <Auditor />
        <Pricing />
        <NotYet />
        <Questions />
        <FinalCta />
      </main>

      <SiteFooter />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Shell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-5 sm:px-8', className)}>{children}</div>;
}

/**
 * A ruled section, with its number and caption in the margin.
 *
 * The page is laid out like the document it produces: a hairline across the
 * full measure at every boundary, a numbered caption in the left margin, and a
 * single text column. On a phone the margin folds up above the heading, which
 * is where it belongs when there is no margin to speak of.
 */
function Section({
  id,
  n,
  label,
  title,
  lede,
  children,
  tone = 'paper'
}: {
  id?: string;
  n: string;
  label: string;
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  tone?: 'paper' | 'forest';
}) {
  const dark = tone === 'forest';

  return (
    <section id={id} className={cn('scroll-mt-16', dark && 'bg-flip-forest text-flip-paper')}>
      <Shell>
        <Reveal
          variant="draw"
          className={cn('h-px w-full origin-left', dark ? 'bg-flip-paper/20' : 'bg-flip-forest/16')}
        />
        <div className="grid gap-8 py-14 sm:py-20 lg:grid-cols-[8rem_1fr] lg:gap-12">
          {/* The margin caption, set the way a form numbers its sections:
              figure first, then the caption under a short rule. */}
          <div className="lg:pt-3">
            <p className={cn('fb-label tabular-nums', dark ? 'text-flip-sand' : 'text-flip-amber')}>
              {n}
            </p>
            <span
              className={cn(
                'mt-2.5 block h-px w-8',
                dark ? 'bg-flip-paper/25' : 'bg-flip-forest/20'
              )}
            />
            <p
              className={cn(
                'fb-label mt-2.5 leading-[1.5]',
                dark ? 'text-flip-paper/50' : 'text-flip-forest/45'
              )}
            >
              {label}
            </p>
          </div>

          <div>
            <Reveal>
              <h2
                className={cn(
                  'fb-display max-w-[19ch] text-[1.9rem] font-medium leading-[1.08] sm:text-[2.5rem] lg:text-[3rem]',
                  dark ? 'text-flip-paper' : 'text-flip-forest'
                )}
              >
                {title}
              </h2>
              {lede ? (
                <p
                  className={cn(
                    'mt-4 max-w-[46ch] text-[1.02rem] leading-[1.6]',
                    dark ? 'text-flip-paper/75' : 'text-flip-slate'
                  )}
                >
                  {lede}
                </p>
              ) : null}
            </Reveal>

            <div className="mt-9">{children}</div>
          </div>
        </div>
      </Shell>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-flip-forest/10 bg-flip-paper/90 backdrop-blur-md">
      <Shell className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flip-forest">
          <FlipLogo />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {[
            ['How it works', '#how'],
            // A real page, not an anchor. "Which states do you cover" is the
            // first question a provider asks and the answer is genuinely
            // interesting, so it gets somewhere to live rather than a line
            // buried in the limitations list.
            ['Your state', '/states'],
            ['What an auditor sees', '#auditor'],
            ['Price', '#price'],
            ['Questions', '#questions']
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="text-[0.86rem] font-medium text-flip-slate underline-offset-[5px] transition hover:text-flip-forest hover:underline"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <SiteMenu />
          <Link
            href="/login"
            // Hidden on a phone: the menu already carries Sign in, and two
            // outlined buttons of the same weight next to each other on a
            // 390px header is where the logo starts getting squeezed.
            className="hidden min-h-[44px] items-center rounded-lg border border-flip-forest/25 px-4 text-[0.86rem] font-semibold text-flip-forest transition hover:border-flip-forest hover:bg-flip-forest hover:text-flip-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flip-forest sm:inline-flex"
          >
            Sign in
          </Link>
        </div>
      </Shell>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Ruled paper, faintly. The only background texture on the page, and it
          is the one the product is about. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, rgba(20,69,47,0.055) 0 1px, transparent 1px 34px)',
          maskImage: 'linear-gradient(to bottom, black, transparent 78%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 78%)'
        }}
      />

      {/* Everything above the walkthrough has to fit an 844px phone screen with
          room to spare, because an administrator who cannot answer *what is
          this*, *what would I do with it* and *what does it cost* before their
          first scroll leaves. That budget is why there is one sentence here
          and not a paragraph, and why the price is in the hero rather than
          four sections down. */}
      <Shell className="relative grid gap-10 pb-14 pt-10 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-center lg:gap-16 lg:pb-24 lg:pt-20">
        <div>
          <p className="fb-label text-flip-amber">
            Shift notes for group homes
          </p>

          {/* Lead with what the staff stop doing, not with a count of what
              they still do.

              This has now been wrong in both directions. It said "Forty
              seconds", which nobody had timed. Correcting that, it said
              "Twenty-seven taps", which was true — somebody counted — and was
              a worse headline than the lie: it puts the effort in the largest
              type on the page and invites a tired DSP to picture twenty-seven
              of anything. A number that big does not read as fast, whatever it
              measures.

              What is actually being sold is that nobody composes prose at the
              end of a twelve-hour shift. That is structurally true, needs no
              stopwatch, and cannot rot. The tap count keeps its place in the
              FAQ, where precision belongs and where anyone who wants to check
              it can. */}
          <h1 className="fb-display mt-4 text-[2.7rem] font-medium leading-[0.98] text-flip-forest sm:text-[4rem] lg:text-[4.6rem]">
            Tap what happened.
            <br />
            <span className="relative inline-block">
              The note writes itself.
              <span
                aria-hidden
                className="absolute -bottom-1 left-0 h-[6px] w-full rounded-full bg-flip-sand/70"
              />
            </span>
          </h1>

          {/* The time is here, and it is measured.

              The headline above deliberately carries no number, and the reason
              written there is exact: it once said "Forty seconds", which
              nobody had timed. That objection was right, and it is the reason
              this sentence waited for scripts/time-a-note.ts rather than being
              written first and checked later.

              Timed three times on the live site, one tap per second, from
              tapping the resident on the roster to the note being signed and
              locked: 31s, 33s and 46s. The slow one was the first note after a
              quiet spell, when the draft took 24s instead of 10. One tap per
              second is slower than the demo capture's own pacing and far
              slower than a DSP who has done it a hundred times, so "under a
              minute" is a number a real person should beat, not one they have
              to live up to.

              It goes in the sentence rather than the headline because the
              headline argument still holds: a number in the largest type on
              the page is a number somebody will time you against on their
              worst day.

              The half hour is a different kind of number and is not ours. It
              is what a provider running homes today told us their own notes
              take. We have not timed a paper note and have not found anybody
              who has — the documentation-burden research is real but
              qualitative, with no per-note minutes in it — so this is one
              person's experience, said as such in the FAQ. That is the same
              split the tap count uses: the claim here, the provenance where
              precision belongs. If it ever needs defending, it needs a second
              provider saying it, not a rounder number. */}
          <p className="mt-5 max-w-[42ch] text-[1.04rem] leading-[1.55] text-flip-slate sm:text-[1.15rem]">
            <strong className="font-semibold text-flip-forest">
              A signed note in under a minute, not half an hour.
            </strong>{' '}
            Your staff tap what happened, the draft writes itself, and they sign on their phone. It
            prints on your letterhead. Once signed, nobody can change it — including us.
          </p>

          {/* The price, on the first screen. It is the question this buyer asks
              first and the one every competitor makes them book a call for. */}
          <p className="mt-5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="fb-display text-[1.75rem] font-medium leading-none text-flip-forest">
              $100 a month
            </span>
            <span className="text-[0.95rem] text-flip-slate">
              flat — any number of beds, any number of staff
            </span>
          </p>

          <div className="mt-6">
            <DemoCta />
            <p className="mt-3 max-w-[42ch] text-[0.84rem] leading-relaxed text-flip-slate">
              Opens a sandbox with three fictional residents. Nothing in it is real and it asks you
              for nothing —{' '}
              <Link
                href="/signup"
                className="font-semibold text-flip-forest underline underline-offset-[3px] hover:text-flip-moss"
              >
                or set up a workspace
              </Link>
              .
            </p>
          </div>
        </div>

        <Walkthrough className="mx-auto w-full max-w-[26rem] lg:max-w-none" />
      </Shell>
    </section>
  );
}

function FactBand() {
  return (
    <section className="border-y border-flip-forest/12 bg-flip-forest text-flip-paper">
      <Shell>
        <dl className="grid grid-cols-2 divide-flip-paper/15 sm:grid-cols-4 sm:divide-x">
          {FACTS.map((fact, i) => (
            <div
              key={fact.k}
              className={cn(
                'px-1 py-6 sm:px-6 sm:py-8',
                i < 2 && 'border-b border-flip-paper/15 sm:border-b-0',
                i % 2 === 1 && 'border-l border-flip-paper/15 sm:border-l-0',
                i === 0 && 'sm:pl-0',
                i === FACTS.length - 1 && 'sm:pr-0'
              )}
            >
              <dt className="fb-display text-[1.9rem] font-medium leading-none text-flip-sand sm:text-[2.2rem]">
                {fact.k}
              </dt>
              <dd className="mt-2 text-[0.86rem] leading-snug text-flip-paper/70">{fact.v}</dd>
            </div>
          ))}
        </dl>
      </Shell>
    </section>
  );
}

function HowItWorks() {
  return (
    <Section
      id="how"
      n="01"
      label="The shift"
      title="What the screenshots do not show."
      lede="You have just watched the whole product. There is no implementation phase, no configuration project and no week of training, because there is not enough here to need one — so this is the part that does not photograph."
    >
      {/* Four films of the real product, above the prose.
          They were shot, cut and committed a day before anything linked to
          them, so a reader could be told a signed note cannot be edited and
          had no way to watch one refuse. */}
      <div className="mb-12">
        <h3 className="fb-label text-flip-amber">Watch it happen</h3>
        <p className="mt-2 max-w-[46ch] text-[0.95rem] leading-relaxed text-flip-slate">
          Four short films, each answering a different question. Nothing in them
          is a mockup — every one is a recording of the demo you can open
          yourself.
        </p>
        <Films className="mt-6" />
      </div>

      <TimeCompare />

      <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-flip-forest/12 bg-flip-forest/10 sm:grid-cols-2">
        {STEPS.map((step, i) => (
          <Reveal
            as="li"
            key={step.n}
            delay={i * 70}
            className="relative bg-flip-card p-6 sm:p-8"
          >
            <span className="fb-display block text-[2.1rem] font-medium leading-none text-flip-sand">
              {step.n}
            </span>
            <h3 className="fb-display mt-3 text-[1.35rem] font-medium leading-tight text-flip-forest">
              {step.head}
            </h3>
            <p className="mt-3 text-[0.95rem] leading-[1.6] text-flip-slate">{step.body}</p>
            <p className="mt-4 border-l-2 border-flip-sand pl-3 text-[0.86rem] leading-snug text-flip-forest">
              {step.aside}
            </p>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}

/**
 * The claim, drawn to scale.
 *
 * A bar chart of two numbers is normally filler. Here it is the argument, and
 * the footnote under it points at the FAQ entry that says exactly what was
 * counted — because a marketing page that quotes a number and hides the method
 * is the reason this buyer distrusts marketing pages.
 */
function TimeCompare() {
  return (
    <Reveal className="rounded-2xl border border-flip-forest/12 bg-flip-card p-6 shadow-leaf sm:p-8">
      <p className="fb-label text-flip-slate">One note, start to signed</p>

      <div className="mt-6 space-y-5">
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <span className="text-[0.9rem] font-medium text-flip-slate">On paper, or in a shared doc</span>
            <span className="fb-display text-[1.4rem] font-medium leading-none text-flip-slate">
              ~10 min
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-flip-sand/45" />
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <span className="text-[0.9rem] font-medium text-flip-forest">In FlipBrief</span>
            <span className="fb-display text-[1.4rem] font-medium leading-none text-flip-forest">
              ~40 sec
            </span>
          </div>
          <div className="h-3 w-[6.7%] min-w-[14px] rounded-full bg-flip-forest" />
        </div>
      </div>

      <div className="mt-6 border-t border-flip-forest/10 pt-4">
        <p className="text-[0.82rem] leading-relaxed text-flip-slate">
          Drawn to scale. It is a tap count on the demo, not a stopwatch held over your staff.
        </p>
        <a
          href="#questions"
          className="mt-1 inline-flex min-h-[44px] items-center text-[0.82rem] font-semibold text-flip-forest underline underline-offset-[3px]"
        >
          Read exactly what we counted
        </a>
      </div>
    </Reveal>
  );
}

function Auditor() {
  return (
    <Section
      id="auditor"
      n="02"
      label="Under review"
      title="What an auditor sees."
      lede="The reason to move off the binder is not that typing is nicer. It is that a binder cannot prove when a note was written, who opened it, or that nobody went back and improved it afterwards."
      tone="forest"
    >
      {/* Ruled apart rather than boxed. These cards are the same colour as the
          section behind them, so padding them like cards only pushed them out
          of alignment with the heading above — on a phone that reads as a
          mistake. */}
      <div className="grid divide-y divide-flip-paper/18 border-y border-flip-paper/25 sm:grid-cols-2 sm:divide-y-0">
        {TRUST.map((item, i) => (
          <Reveal
            key={item.head}
            delay={i * 70}
            className={cn(
              'py-7 sm:border-flip-paper/18',
              i % 2 === 0 ? 'sm:border-r sm:pr-8' : 'sm:pl-8',
              i < 2 && 'sm:border-b'
            )}
          >
            <h3 className="fb-display text-[1.3rem] font-medium leading-tight text-flip-sand">
              {item.head}
            </h3>
            <p className="mt-3 text-[0.95rem] leading-[1.6] text-flip-paper/78">{item.body}</p>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-10 rounded-2xl border border-flip-sand/40 bg-flip-paper/[0.07] p-6 sm:p-8">
        <p className="fb-label text-flip-sand">What we are not claiming</p>
        <p className="mt-4 max-w-[62ch] text-[0.98rem] leading-[1.62] text-flip-paper/85">
          FlipBrief is not HIPAA certified — there is no such certificate, whatever a competitor’s
          badge implies — and we have not signed a business associate agreement with you or with the
          model vendor behind the drafting assistant. If a signed BAA is a condition of your
          contract or your insurer, it is a real blocker today and you should have it in writing
          from us before a resident’s name goes anywhere near this. We would rather lose the sale
          than let you assume otherwise and find out during a review.
        </p>
      </Reveal>
    </Section>
  );
}

function Pricing() {
  return (
    <Section
      id="price"
      n="03"
      label="The price"
      title="One hundred dollars a month. That is the price."
      lede="Not per bed, not per user, not per note. The systems built for two-hundred-bed operators want an implementation fee before you can write your first note; a six-bed house should not be paying for a sales engineer’s calendar."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <Reveal className="relative overflow-hidden rounded-2xl border border-flip-forest/12 bg-flip-card p-6 shadow-leaf sm:p-9">
          <span className="fb-fold" />

          <p className="flex items-baseline gap-2">
            <span className="fb-display text-[3.4rem] font-medium leading-none text-flip-forest sm:text-[4.2rem]">
              $100
            </span>
            <span className="text-[1rem] font-medium text-flip-slate">/ month</span>
          </p>

          <ul className="mt-8 space-y-4 border-t border-flip-forest/10 pt-7">
            {[
              'Every resident, every staff member, every house you run. There is no per-bed line.',
              'No setup fee, no implementation, no training package, no annual commitment.',
              `The first ${FREE_ALLOWANCE} assistant drafts are free, before you have decided anything.`,
              'Writing, signing, printing and exporting notes never require a subscription — a lapsed card stops the assistant, not your records.'
            ].map((line) => (
              <li key={line} className="flex gap-3.5 text-[0.97rem] leading-[1.55] text-flip-ink">
                <span aria-hidden className="mt-[0.42em] h-[7px] w-[7px] shrink-0 rotate-45 bg-flip-sand" />
                {line}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={90} className="rounded-2xl border border-flip-sand/60 bg-flip-sand/20 p-6 sm:p-8">
          <p className="fb-label text-flip-amber">Who this is for</p>
          <p className="mt-4 text-[0.95rem] leading-[1.6] text-flip-slate">
            A four-to-twenty bed group home or behavioural care agency, where the person choosing
            the software is also the person who will be sitting across from the licensing
            specialist. If you have an IT department, you are not who this was built for and it will
            feel too small to you.
          </p>
          <div className="mt-6">
            <DemoCta />
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

function NotYet() {
  return (
    <Section
      id="limits"
      n="04"
      label="The gaps"
      title="What FlipBrief does not do."
      lede="Put where you can find it, rather than three emails into a trial. Every one of these is a real reason somebody would not buy this, and you should know them all before you spend a hundred dollars."
    >
      <dl className="divide-y divide-flip-forest/12 border-y border-flip-forest/12">
        {NOT_YET.map(([head, body], i) => (
          <Reveal
            key={head}
            delay={i * 55}
            className="grid gap-2 py-6 sm:grid-cols-[16rem_1fr] sm:gap-8 sm:py-7"
          >
            <dt className="fb-display text-[1.18rem] font-medium leading-tight text-flip-forest">
              {head}
            </dt>
            <dd className="text-[0.95rem] leading-[1.6] text-flip-slate">{body}</dd>
          </Reveal>
        ))}
      </dl>
    </Section>
  );
}

function Questions() {
  return (
    <Section
      id="questions"
      n="05"
      label="Asked and answered"
      title="The questions that decide it."
      lede="Answered the way we would answer them on the phone."
    >
      {/* Held to a readable measure. A question and its disclosure marker
          stretched across a 1440px column read as two unrelated things. */}
      <div className="max-w-[52rem] divide-y divide-flip-forest/12 border-y border-flip-forest/12">
        {FAQ.map((item, i) => (
          <Reveal key={item.q} delay={i * 40}>
            <details className="fb-faq group" open={i === 0}>
              <summary className="flex items-start justify-between gap-6 py-5 text-left">
                <span className="fb-display text-[1.15rem] font-medium leading-snug text-flip-forest sm:text-[1.25rem]">
                  {item.q}
                </span>
                <span
                  aria-hidden
                  className="fb-faq-sign mt-1 shrink-0 select-none text-[1.3rem] font-light leading-none text-flip-amber"
                >
                  +
                </span>
              </summary>
              <p className="max-w-[70ch] pb-6 text-[0.95rem] leading-[1.65] text-flip-slate">
                {item.a}
              </p>
            </details>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function FinalCta() {
  return (
    <section className="border-t border-flip-forest/12 bg-flip-forest text-flip-paper">
      <Shell className="py-16 text-center sm:py-24">
        <Reveal>
          <FlipMark className="mx-auto h-11 w-11" tone="paper" />
          <h2 className="fb-display mx-auto mt-7 max-w-[16ch] text-[2.1rem] font-medium leading-[1.06] text-flip-paper sm:text-[3rem]">
            Write one note and see.
          </h2>
          <p className="mx-auto mt-5 max-w-[46ch] text-[1rem] leading-[1.6] text-flip-paper/72">
            The demo takes a few seconds to build, asks for nothing, and puts you on a roster with
            three fictional residents. Write a shift note, sign it, and open the PDF.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <DemoCta tone="sand" className="w-full sm:w-auto" />
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-lg border border-flip-paper/30 px-6 py-4 text-[0.95rem] font-semibold text-flip-paper transition hover:bg-flip-paper/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flip-sand sm:w-auto"
            >
              Sign in
            </Link>
          </div>
        </Reveal>
      </Shell>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-flip-forest text-flip-paper">
      <Shell className="border-t border-flip-paper/15 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <FlipLogo tone="paper" />

          {/* Reviewed with a thumb, so these get a 44px box even though they
              are set as running text. */}
          <nav className="-my-2 flex flex-wrap items-center gap-x-6 text-[0.86rem] text-flip-paper/70">
            <Link
              href="/login"
              className="inline-flex min-h-[44px] items-center font-semibold text-flip-paper hover:underline"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex min-h-[44px] items-center hover:text-flip-paper hover:underline"
            >
              Set up a workspace
            </Link>
            <Link
              href="/download"
              className="inline-flex min-h-[44px] items-center hover:text-flip-paper hover:underline"
            >
              Install on a phone
            </Link>
            <a
              href="#limits"
              className="inline-flex min-h-[44px] items-center hover:text-flip-paper hover:underline"
            >
              What it does not do
            </a>
          </nav>
        </div>

        <p className="mt-8 max-w-[62ch] text-[0.8rem] leading-relaxed text-flip-paper/55">
          Documentation software for small group homes and behavioural and elder care agencies.
          FlipBrief prints a progress note for every state and DC, citing your state’s own
          documentation rule where one exists. Staff joining an agency need an invitation from
          their supervisor.
        </p>
      </Shell>
    </footer>
  );
}
