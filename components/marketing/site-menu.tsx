'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Everywhere a visitor is allowed to go, in one dropdown.
 *
 * The header carried five inline links and hid all five below `md`. A phone —
 * which is most of this audience, and the device the product itself is built
 * for — got a logo and a Sign in button, and no way to reach the state library,
 * the help pages, the price, or the app download except by scrolling the whole
 * page and hoping. Two of those, /states and /help, are not sections of the
 * landing page at all; they were reachable only from a single inline link that
 * a phone never rendered.
 *
 * So the full list lives here and is available at every width. The inline links
 * stay on desktop because they are quicker for the three things most people
 * want, and this is the complete answer behind them.
 *
 * Only what a signed-out stranger can actually open is listed. The app's own
 * screens — residents, reports, oversight, settings — are behind the session
 * gate, and putting them in a public menu would send somebody who clicked one
 * to a login redirect for a page they cannot use yet.
 */

type Entry = readonly [label: string, href: string, hint?: string];

const SECTIONS: readonly Entry[] = [
  ['How it works', '/#how'],
  ['What an auditor sees', '/#auditor'],
  ['Price', '/#price'],
  // Linked nowhere before this. The page has a section that says plainly what
  // the product does not do, and it was reachable only by scrolling past it.
  ['What it does not do', '/#limits'],
  ['Questions', '/#questions']
];

const PAGES: readonly Entry[] = [
  ['Your state', '/states', 'What we print in each of the fifty states'],
  ['Help', '/help', 'How a note is written, signed and printed'],
  ['Get the app', '/download', 'Install it on a phone']
];

const ACCOUNT: readonly Entry[] = [
  ['Create a workspace', '/signup'],
  ['Sign in', '/login']
];

export function SiteMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    // Escape returns focus to the button rather than just closing, so a
    // keyboard user is not dropped back at the top of the document.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrap}>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="site-menu"
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-flip-forest/25 px-3.5 text-[0.86rem] font-semibold text-flip-forest transition hover:border-flip-forest hover:bg-flip-forest hover:text-flip-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flip-forest"
      >
        Menu
        <svg
          viewBox="0 0 24 24"
          className={cn(
            'h-3.5 w-3.5 fill-none stroke-current transition-transform duration-150 ease-out motion-reduce:transition-none',
            open && 'rotate-180'
          )}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/*
        Kept mounted and animated rather than mounted on open, because a panel
        that only exists while it is open cannot be seen leaving — it would fade
        in and then vanish, which reads worse than no animation at all.
        `visibility` is in the transition list on purpose: it is not
        interpolatable, so it flips at the END of the outgoing transition, which
        is what lets the panel fade out before it stops being there.

        `inert` is what makes keeping it mounted safe. Without it every link in
        here stays in the tab order while the menu is shut, so a keyboard user
        tabbing off the Menu button would walk through ten invisible links.
      */}
      <div
        id="site-menu"
        role="menu"
        inert={!open}
        aria-hidden={!open}
        // Right-aligned so it cannot run off the screen edge on a phone, and
        // capped in height because the list is longer than a short viewport in
        // landscape. Origin at the top right so it grows out of the button
        // rather than arriving from nowhere.
        className={cn(
          'absolute right-0 z-50 mt-2 max-h-[75vh] w-[17.5rem] origin-top-right overflow-y-auto',
          'rounded-2xl border border-flip-forest/12 bg-flip-paper p-2 shadow-xl shadow-flip-forest/10',
          'transition-[opacity,transform,visibility] duration-150 ease-out',
          // The rest of the site already hides its motion under this; a menu
          // that ignores it would be the only thing on the page that moves for
          // somebody who asked for none.
          'motion-reduce:transition-none',
          open
            ? 'visible translate-y-0 scale-100 opacity-100'
            : 'invisible -translate-y-1 scale-[0.97] opacity-0'
        )}
      >
        <Group title="On this page" entries={SECTIONS} onNavigate={() => setOpen(false)} />
        <Group title="Pages" entries={PAGES} onNavigate={() => setOpen(false)} bordered />
        <Group title="Your account" entries={ACCOUNT} onNavigate={() => setOpen(false)} bordered />
      </div>
    </div>
  );
}

function Group({
  title,
  entries,
  onNavigate,
  bordered
}: {
  title: string;
  entries: readonly Entry[];
  onNavigate: () => void;
  bordered?: boolean;
}) {
  return (
    <div className={bordered ? 'mt-1 border-t border-flip-forest/10 pt-1' : ''}>
      <p className="px-3 pb-1 pt-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-flip-slate">
        {title}
      </p>
      {entries.map(([label, href, hint]) => (
        <Link
          key={href}
          href={href}
          role="menuitem"
          onClick={onNavigate}
          className="block rounded-xl px-3 py-2.5 transition hover:bg-flip-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flip-forest"
        >
          <span className="block text-[0.92rem] font-semibold text-flip-forest">{label}</span>
          {hint ? <span className="mt-0.5 block text-[0.78rem] text-flip-slate">{hint}</span> : null}
        </Link>
      ))}
    </div>
  );
}
