import { cn } from '@/lib/utils';

/**
 * The hero device: one shift note, assembling itself.
 *
 * This is the page's only substantial animation and it exists to perform the
 * claim in the headline rather than to decorate it — chips are tapped, a draft
 * resolves out of those taps, a signature is drawn, the note locks, and the
 * finished Form #680 lifts out from behind it on the agency's own letterhead.
 * Four beats, the same four the product has.
 *
 * It is CSS only. The whole sequence is expressed as `animation-delay` against
 * keyframes that declare their opening state and nothing else, so every
 * element's ordinary style is already the finished frame. Reduced motion
 * switches the animations off and the composed note is simply there.
 *
 * The chip labels are the real ones from the Form #680 template
 * (supabase/migrations/0004_seed_680.sql) and the draft below only says things
 * those chips actually record — a mock that claims more than the form collects
 * would be the exact dishonesty the assistant is built to prevent.
 */

const CHIPS = [
  { section: 'Breakfast', label: 'Ate 100%' },
  { section: 'Where did Jay choose to go?', label: 'Library' },
  { section: 'How did staff support Jay?', label: 'Verbal prompts' },
  { section: 'Overall mood', label: 'Calm' }
];

const NARRATIVE =
  'Jay ate 100% of breakfast and was calm through the morning. He went to the library in the afternoon, which he had chosen. Staff supported him with verbal prompts while he worked on the laundry goal from his service plan. There were no incidents or concerns during the shift.';

// One timeline, in seconds. Named because the sequence is read as a sequence.
//
// It is kept under six seconds on purpose. The card holds its finished height
// from the first frame — nothing reflows as the note fills in, which is what
// keeps the page from shoving itself around under a thumb — and the cost of
// that is an area of blank paper until the words arrive. Short beats keep that
// window brief. A page claiming forty seconds should not take ten to say so.
const T = {
  chip: 0.15,
  chipStep: 0.22,
  goal: 1.0,
  draftRule: 1.25,
  word: 1.45,
  wordStep: 0.028,
  sigRule: 3.25,
  sign: 3.45,
  locked: 4.4,
  sheet: 4.6
};

export function NoteDemo({ className }: { className?: string }) {
  const words = NARRATIVE.split(' ');

  return (
    <div className={cn('relative pt-11', className)} aria-hidden>
      {/* Beat four: the finished form, lifting out from behind the note. Only
          its letterhead shows — which is the part an administrator cares
          about, and the part that used to print somebody else's agency. */}
      <div
        className="fb-sheet absolute inset-x-4 top-0 z-0 h-44 rotate-[1.6deg] rounded-xl border border-flip-forest/12 bg-white shadow-leaf"
        style={{ animationDelay: `${T.sheet}s` }}
      >
        <span className="fb-fold" />
        <div className="flex items-center gap-2.5 px-4 pt-3.5">
          <span className="h-6 w-6 rounded-[5px] bg-flip-forest/12" />
          <span className="fb-label text-flip-forest">Your agency name, LLC</span>
        </div>
        <div className="mx-4 mt-2.5 h-px bg-flip-forest/15" />
      </div>

      {/* The note itself. */}
      <div className="relative z-10 overflow-hidden rounded-2xl border border-flip-forest/12 bg-flip-card shadow-lift">
        <div className="flex items-baseline justify-between gap-3 border-b border-flip-forest/10 px-4 py-3.5 sm:px-5">
          <span className="font-flip text-[0.95rem] font-semibold text-flip-ink">Jay P.</span>
          <span className="fb-label text-flip-slate">7AM–7PM</span>
        </div>

        <div className="px-4 py-4 sm:px-5">
          {/* Beat one: tap what happened. */}
          <p className="fb-label mb-3 text-flip-slate">What happened</p>
          <ul className="flex flex-wrap gap-1.5">
            {CHIPS.map((chip, i) => (
              <li
                key={chip.label}
                className="fb-chip-anim rounded-lg border border-flip-forest bg-flip-forest px-2.5 py-2 text-[0.78rem] font-medium leading-none text-flip-paper"
                style={{ animationDelay: `${T.chip + i * T.chipStep}s` }}
              >
                <span className="sr-only">{chip.section}: </span>
                {chip.label}
              </li>
            ))}
          </ul>

          {/* The service-plan goal sits in the same list as everything else,
              because in the product it does too. */}
          <div
            className="fb-rise mt-2.5 flex items-center gap-2.5 rounded-lg border border-flip-sand bg-flip-sand/25 px-2.5 py-2"
            style={{ animationDelay: `${T.goal}s` }}
          >
            <span className="fb-label shrink-0 text-flip-amber">Plan</span>
            <span className="font-flip text-[0.78rem] leading-tight text-flip-ink">
              Do own laundry with prompts — <strong className="font-semibold">worked on this</strong>
            </span>
          </div>

          {/* Beat two: the draft resolving out of the taps above. */}
          <div
            className="fb-line mt-5 h-px bg-flip-forest/15"
            style={{ animationDelay: `${T.draftRule}s` }}
          />
          <p
            className="fb-rise fb-label mb-2 mt-3 text-flip-slate"
            style={{ animationDelay: `${T.draftRule + 0.1}s` }}
          >
            Draft
          </p>
          <p className="font-flip text-[0.86rem] leading-[1.55] text-flip-ink sm:text-[0.9rem]">
            {words.map((word, i) => (
              <span
                key={`${word}-${i}`}
                className="fb-word"
                style={{ animationDelay: `${T.word + i * T.wordStep}s` }}
              >
                {word}
                {i < words.length - 1 ? ' ' : ''}
              </span>
            ))}
          </p>

          {/* Beat three: signed, and locked by the database. */}
          <div
            className="fb-line mt-5 h-px bg-flip-forest/15"
            style={{ animationDelay: `${T.sigRule}s` }}
          />
          <div className="mt-3 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p
                className="fb-rise fb-label mb-1 text-flip-slate"
                style={{ animationDelay: `${T.sigRule + 0.1}s` }}
              >
                Signature
              </p>
              <svg viewBox="0 0 200 40" className="h-10 w-[150px] sm:w-[180px]" role="presentation">
                <path
                  className="fb-sig-path"
                  style={{ animationDelay: `${T.sign}s` }}
                  pathLength={1}
                  d="M4 30C12 8 21 5 25 20s5 20 11 6c5-13 11 4 17 4 11 0 16-20 24-16s3 19 13 17c12-2 17-20 27-16 8 3 5 16 15 14 12-2 19-16 30-10 7 4 11 9 30 3"
                  fill="none"
                  stroke="#14452F"
                  strokeWidth={2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p
              className="fb-rise shrink-0 text-right font-flip text-[0.68rem] leading-tight text-flip-slate"
              style={{ animationDelay: `${T.locked}s` }}
            >
              Marisol T.
              <br />
              DSP
            </p>
          </div>

          <div
            className="fb-rise mt-3 flex items-center gap-2 rounded-lg bg-flip-forest/[0.06] px-2.5 py-2"
            style={{ animationDelay: `${T.locked}s` }}
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" role="presentation">
              <path
                d="M4.5 7V5a3.5 3.5 0 1 1 7 0v2"
                fill="none"
                stroke="#14452F"
                strokeWidth={1.6}
                strokeLinecap="round"
              />
              <rect x="3" y="7" width="10" height="7" rx="1.6" fill="#14452F" />
            </svg>
            <span className="font-flip text-[0.72rem] font-medium text-flip-forest">
              Signed and locked · corrections go on as an addendum
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
