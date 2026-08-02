'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, CreditCard, HelpCircle, IdCard, LogOut, Settings } from 'lucide-react';

/**
 * Account menu.
 *
 * Settings, staff, billing and help are things people look for by name under
 * their own account rather than in a list of daily work, so they live here
 * instead of competing with Today and Residents for space in the main nav.
 */
export function AccountMenu({
  name,
  title,
  role
}: {
  name: string;
  title: string;
  role: 'dsp' | 'supervisor' | 'admin';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click and on Escape, so the menu never strands someone
  // on a phone where there is no obvious way back out.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const supervisor = role !== 'dsp';
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const item =
    'flex items-center gap-2.5 px-3 py-2.5 text-sm text-brand-navy hover:bg-brand-sand w-full text-left';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition hover:bg-brand-sand"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-navy text-[11px] font-semibold text-white">
          {initials}
        </span>
        <span className="hidden text-xs font-semibold text-brand-navy sm:inline">{name}</span>
        <ChevronDown className="h-3.5 w-3.5 text-brand-slate" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-brand-navy/10 bg-white py-1 shadow-card"
        >
          <div className="border-b border-brand-navy/5 px-3 py-2.5">
            <p className="text-sm font-semibold text-brand-navy">{name}</p>
            <p className="text-xs text-brand-slate">{title}</p>
          </div>

          <Link href="/settings" className={item} onClick={() => setOpen(false)} role="menuitem">
            <Settings className="h-4 w-4 text-brand-slate" />
            Settings
          </Link>

          {supervisor ? (
            <>
              <Link href="/staff" className={item} onClick={() => setOpen(false)} role="menuitem">
                <IdCard className="h-4 w-4 text-brand-slate" />
                Staff and invitations
              </Link>
              <Link href="/billing" className={item} onClick={() => setOpen(false)} role="menuitem">
                <CreditCard className="h-4 w-4 text-brand-slate" />
                Billing
              </Link>
            </>
          ) : null}

          <Link href="/help" className={item} onClick={() => setOpen(false)} role="menuitem">
            <HelpCircle className="h-4 w-4 text-brand-slate" />
            Help and printing
          </Link>

          <form action="/api/auth/sign-out" method="post" className="border-t border-brand-navy/5">
            <button type="submit" className={item} role="menuitem">
              <LogOut className="h-4 w-4 text-brand-slate" />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
