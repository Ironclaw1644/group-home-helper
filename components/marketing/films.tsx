'use client';

import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * The four demo films, on the public page.
 *
 * WHY FOUR AND NOT ONE
 *
 * An owner deciding on this is not asking one question, they are asking
 * several, and the answers do not compress into a single film:
 *
 *   will my staff actually use it      -> the note, drafted, signed, locked
 *   can staff write on OUR form        -> the importer
 *   do I have to retype everyone       -> setup: form, people, staff
 *   will it look like OUR agency       -> the letterhead
 *
 * One reel forces the order; four lets somebody watch the one they are worried
 * about. "Could someone change a signed note" used to be its own film; the note
 * film now ends on the lock and the addendum, which is where a DSP meets it.
 *
 * HOW THEY ARE MADE
 *
 * scripts/films/record.ts drives the real demo sandbox through "Try it
 * yourself" and records the screen; films/ (Remotion) puts a phone, a camera,
 * captions and the intro and outro cards around that footage, and nothing
 * inside the screen is drawn. See films/README.md.
 *
 * NOTHING PRELOADS
 *
 * The four are about eighteen megabytes together and the reader is on a
 * phone, often on cellular, and has not decided to spend anything on us yet.
 * Each one loads a poster and nothing else until it is tapped;
 * `preload="metadata"` and no autoplay are the whole reason this is a client
 * component.
 *
 * SOUND
 *
 * Each film has a quiet music bed. A tap is the only thing that starts a
 * film, so it starts with sound: the <video> is mounted synchronously inside
 * the tap (flushSync) and play() is called there, which iOS counts as the
 * user's gesture. If a browser still refuses, it plays muted and the
 * controls can turn the sound on.
 */

type Film = {
  key: string;
  title: string;
  question: string;
  length: string;
};

// `length` is typed in rather than read off the file, so it has to be updated
// when a film is recut. Check it against `ffprobe public/demo/flipbrief-*.mp4`
// after a rebuild — the note film ran 0:57 here for a while after it became
// 1:04. (10-14 v2 cut, with the longer title card: 74.7, 66.5, 53.2,
// 45.6 s.)
const FILMS: Film[] = [
  {
    key: 'note',
    title: 'A shift note, start to finish',
    question: 'Will my staff actually use it?',
    length: '1:15'
  },
  {
    key: 'form',
    title: 'Any form, rebuilt for your staff',
    question: 'Can staff write on our own form?',
    length: '1:06'
  },
  {
    key: 'setup',
    title: 'Set up in three steps',
    question: 'Do I have to retype everyone?',
    length: '0:53'
  },
  {
    key: 'letterhead',
    title: 'Your letterhead, your colors',
    question: 'Will it look like my agency?',
    length: '0:46'
  }
];

export function Films({ className }: { className?: string }) {
  // Which film has been tapped. Until then the <video> is not even rendered,
  // so nothing is fetched beyond the poster image.
  const [playing, setPlaying] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const play = (key: string) => {
    flushSync(() => setPlaying(key));
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.play().catch(() => {
      v.muted = true;
      void v.play().catch(() => {});
    });
  };

  return (
    <div className={cn('grid gap-5 sm:grid-cols-2', className)}>
      {FILMS.map((film) => (
        <figure key={film.key} className="overflow-hidden rounded-2xl bg-flip-card ring-1 ring-flip-forest/12">
          <div className="relative aspect-[9/16] bg-flip-forest">
            {playing === film.key ? (
              <video
                ref={videoRef}
                className="h-full w-full"
                src={`/demo/flipbrief-${film.key}.mp4`}
                poster={`/demo/poster-${film.key}.jpg`}
                controls
                playsInline
                preload="metadata"
              >
                {/* The captions are burned in; this track is the same words
                    for screen readers, off unless someone turns it on. */}
                <track kind="captions" srcLang="en" label="English" src={`/demo/flipbrief-${film.key}.vtt`} />
              </video>
            ) : (
              <button
                type="button"
                onClick={() => play(film.key)}
                className="group absolute inset-0 h-full w-full"
                aria-label={`Play: ${film.title}, ${film.length}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/demo/poster-${film.key}.jpg`}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-0 bg-flip-forest/20 transition group-hover:bg-flip-forest/10" />
                <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-flip-paper/95 shadow-lg transition group-hover:scale-105">
                  <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6 fill-flip-forest" aria-hidden>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
                <span className="absolute bottom-3 right-3 rounded-md bg-flip-forest/85 px-2 py-1 text-[0.7rem] font-semibold text-flip-paper">
                  {film.length}
                </span>
              </button>
            )}
          </div>

          <figcaption className="p-5">
            <p className="fb-label text-flip-amber">{film.question}</p>
            <p className="mt-1.5 text-[1.02rem] font-semibold leading-snug text-flip-forest">
              {film.title}
            </p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
