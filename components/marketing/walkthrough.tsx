'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The product, in five real screens.
 *
 * Every frame is a photograph of this application, captured by
 * `npm run shots:walkthrough` driving the real app through the real demo
 * entry point at 390x844 — the phone a DSP actually holds. Nothing here is a
 * mockup, and the last frame is not a screenshot at all: it is page one of the
 * PDF the app rendered, so the claim about letterhead is the document itself.
 *
 * Three things this has to get right, in order:
 *
 * 1. It plays on its own, because an administrator scrolling on a phone will
 *    not tap a play button to find out what software does.
 * 2. It can be stopped, because autoplaying motion beside text is hostile to
 *    anyone who reads slowly, and because someone who wants to actually look
 *    at the draft needs it to hold still.
 * 3. If the visitor's phone is set to reduce motion, there is no carousel at
 *    all — the frames are laid out as a captioned strip they can read at their
 *    own pace. That fallback is rendered in the markup rather than swapped in
 *    by JavaScript, so it cannot flash the wrong one on first paint and cannot
 *    disagree between the server and the browser.
 */

type Frame = {
  src: string;
  /** The step, as the visitor would name it. */
  step: string;
  /** What they are looking at. Read aloud by the static fallback. */
  caption: string;
  /** Phone screenshots sit in a phone; the PDF sits on a desk. */
  kind: 'phone' | 'document';
  width: number;
  height: number;
};

const FRAMES: Frame[] = [
  {
    src: '/walkthrough/01-pick-resident.png',
    step: 'Pick a resident',
    caption:
      'The day opens on the people in the house and the shifts still to write. One tap starts the right note.',
    kind: 'phone',
    width: 780,
    height: 1688
  },
  {
    src: '/walkthrough/02-tap-what-happened.png',
    step: 'Tap what happened',
    caption:
      'The chips are the form — meals, sleep, personal care, mood, incidents, and the resident’s own service-plan goals.',
    kind: 'phone',
    width: 780,
    height: 1688
  },
  {
    src: '/walkthrough/03-draft-writes-itself.png',
    step: 'The draft writes itself',
    caption:
      'One tap turns the taps into a paragraph, then checks the paragraph back against what was actually recorded.',
    kind: 'phone',
    width: 780,
    height: 1688
  },
  {
    src: '/walkthrough/04-sign-on-the-glass.png',
    step: 'Sign on the glass',
    caption:
      'A finger on the screen, or a typed name. Signing locks the note in the database — nobody can edit it afterwards.',
    kind: 'phone',
    width: 780,
    height: 1688
  },
  {
    src: '/walkthrough/05-prints-on-your-letterhead.png',
    step: 'It prints on your letterhead',
    caption:
      'Your legal name, your logo, your address — on Form #680, ready for the binder or the licensing specialist.',
    kind: 'document',
    width: 900,
    height: 1164
  }
];

/** Long enough to read the caption, short enough that five frames is not a wait. */
const DWELL_MS = 3200;

export function Walkthrough({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = useCallback((next: number) => {
    setIndex(((next % FRAMES.length) + FRAMES.length) % FRAMES.length);
  }, []);

  useEffect(() => {
    if (!playing) return;

    // Someone who has asked their phone to stop moving things gets the static
    // strip below instead; there is no reason to also run a timer for a
    // carousel they cannot see.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (still.matches) return;

    timer.current = setTimeout(() => go(index + 1), DWELL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [index, playing, go]);

  const current = FRAMES[index];

  return (
    <div className={cn('fb-walk', className)}>
      {/* ---------------------------------------------------------------- */}
      {/* The carousel. Hidden outright under prefers-reduced-motion.        */}
      {/* ---------------------------------------------------------------- */}
      <div className="fb-walk-motion">
        <div
          className="relative"
          // A visitor reading a caption should not have it swapped out from
          // under them because their thumb happened to rest here.
          onMouseEnter={() => setPlaying(false)}
          onMouseLeave={() => setPlaying(true)}
        >
          <div className="fb-walk-stage relative flex items-center justify-center">
            {FRAMES.map((frame, i) => (
              // The border belongs on a wrapper shaped by aspect-ratio, not on
              // the image. An `object-contain` image keeps its own proportions
              // but its *element box* still fills the stage, so a border drawn
              // on the image is a rectangle floating around a letterboxed
              // screenshot — which on a wide viewport read as a phone twice as
              // wide as any phone.
              <div
                key={frame.src}
                className={cn(
                  'absolute h-full max-w-full overflow-hidden transition-opacity duration-500',
                  frame.kind === 'phone'
                    ? 'aspect-[390/844] rounded-[1.6rem] border-[6px] border-flip-forest/85 shadow-lift'
                    : 'aspect-[9/11.64] rounded-sm border border-flip-forest/15 shadow-lift',
                  i === index ? 'opacity-100' : 'pointer-events-none opacity-0'
                )}
              >
                <img
                  src={frame.src}
                  width={frame.width}
                  height={frame.height}
                  alt={`${frame.step}. ${frame.caption}`}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>

          {/* The caption is a live region: with the carousel running, a screen
              reader should hear the step change rather than silently miss it. */}
          <div className="mt-6 min-h-[6.5rem] sm:min-h-[5.5rem]">
            <p className="fb-label text-flip-amber" aria-hidden>
              Step {index + 1} of {FRAMES.length}
            </p>
            <div aria-live="polite" aria-atomic>
              <p className="fb-display mt-2 text-[1.3rem] font-medium leading-tight text-flip-forest">
                {current.step}
              </p>
              <p className="mt-1.5 max-w-[44ch] text-[0.92rem] leading-[1.55] text-flip-slate">
                {current.caption}
              </p>
            </div>
          </div>

          {/* Controls. The step buttons are the progress indicator — a separate
              row of dots that cannot be tapped would be decoration. */}
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-pressed={!playing}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-flip-forest/25 text-flip-forest transition hover:bg-flip-forest hover:text-flip-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flip-forest"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              <span className="sr-only">
                {playing ? 'Pause the walkthrough' : 'Play the walkthrough'}
              </span>
            </button>

            <ol className="flex flex-1 items-center gap-1.5">
              {FRAMES.map((frame, i) => (
                <li key={frame.src} className="flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPlaying(false);
                      go(i);
                    }}
                    aria-current={i === index ? 'step' : undefined}
                    className="group flex h-11 w-full items-center focus-visible:outline-none"
                  >
                    <span
                      className={cn(
                        'h-[3px] w-full rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-flip-forest',
                        // The unvisited steps have to stay legible as steps:
                        // at a lower opacity they vanished into the paper and
                        // the control read as one stray rule.
                        i === index ? 'bg-flip-forest' : 'bg-flip-forest/30 group-hover:bg-flip-forest/55'
                      )}
                    />
                    <span className="sr-only">{frame.step}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* The static fallback. The only thing shown under reduce-motion.     */}
      {/* ---------------------------------------------------------------- */}
      <ol className="fb-walk-static space-y-8">
        {FRAMES.map((frame, i) => (
          <li key={frame.src}>
            <p className="fb-label text-flip-amber">
              {String(i + 1).padStart(2, '0')}
            </p>
            <p className="fb-display mt-2 text-[1.25rem] font-medium leading-tight text-flip-forest">
              {frame.step}
            </p>
            <p className="mt-1.5 max-w-[46ch] text-[0.92rem] leading-[1.55] text-flip-slate">
              {frame.caption}
            </p>
            <img
              src={frame.src}
              width={frame.width}
              height={frame.height}
              alt=""
              loading="lazy"
              decoding="async"
              className={cn(
                'mt-4 w-full max-w-[15rem] object-contain',
                frame.kind === 'phone'
                  ? 'rounded-[1.6rem] border-[6px] border-flip-forest/85 shadow-leaf'
                  : 'max-w-[20rem] rounded-sm border border-flip-forest/15 shadow-leaf'
              )}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
