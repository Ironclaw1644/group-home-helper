'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleDot } from 'lucide-react';

/**
 * Move between residents without going back to the roster.
 *
 * Writing the shift's notes is one continuous task — a DSP finishes one person
 * and immediately starts the next. Routing that through the roster every time
 * adds two taps per resident and loses the sense of working through a list.
 *
 * Every entry is for the same date and shift, so switching never silently
 * changes which shift is being documented.
 */

export type SwitcherEntry = {
  residentId: string;
  name: string;
  /** Existing note, if one has been started. */
  noteId: string | null;
  status: 'signed' | 'draft' | null;
};

export function ResidentSwitcher({
  entries,
  currentResidentId,
  serviceDate,
  shiftId,
  homeId
}: {
  entries: SwitcherEntry[];
  currentResidentId: string;
  serviceDate: string;
  shiftId: string;
  homeId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // One resident means there is nothing to switch between.
  if (entries.length < 2) return null;

  const index = entries.findIndex((e) => e.residentId === currentResidentId);
  const previous = index > 0 ? entries[index - 1] : null;
  const next = index >= 0 && index < entries.length - 1 ? entries[index + 1] : null;

  function hrefFor(entry: SwitcherEntry): string {
    if (entry.noteId) return `/notes/${entry.noteId}`;
    return `/notes/new?${new URLSearchParams({
      resident: entry.residentId,
      shift: shiftId,
      date: serviceDate,
      home: homeId
    }).toString()}`;
  }

  function go(entry: SwitcherEntry | null) {
    if (!entry) return;
    setOpen(false);
    router.push(hrefFor(entry));
  }

  const arrow = (entry: SwitcherEntry | null, direction: 'prev' | 'next') => (
    <button
      type="button"
      onClick={() => go(entry)}
      disabled={!entry}
      aria-label={
        entry
          ? `${direction === 'prev' ? 'Previous' : 'Next'} resident: ${entry.name}`
          : `No ${direction === 'prev' ? 'previous' : 'next'} resident`
      }
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-brand-slate transition hover:bg-brand-sand hover:text-brand-navy disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {direction === 'prev' ? (
        <ChevronLeft className="h-4 w-4" />
      ) : (
        <ChevronRight className="h-4 w-4" />
      )}
    </button>
  );

  return (
    <div className="relative mb-4">
      <div className="flex items-center gap-1 rounded-xl border border-brand-navy/10 bg-white px-1 py-1">
        {arrow(previous, 'prev')}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-navy hover:bg-brand-sand"
        >
          <span className="truncate">
            {index >= 0 ? `${index + 1} of ${entries.length}` : `${entries.length} residents`}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-brand-slate" />
        </button>

        {arrow(next, 'next')}
      </div>

      {open ? (
        <>
          {/* Click-away layer. Sits behind the menu but above the page. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />

          <ul
            role="listbox"
            className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-brand-navy/10 bg-white py-1 shadow-card"
          >
            {entries.map((entry) => {
              const current = entry.residentId === currentResidentId;
              return (
                <li key={entry.residentId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={current}
                    onClick={() => go(entry)}
                    className={
                      current
                        ? 'flex w-full items-center gap-2 bg-brand-sand/70 px-3 py-2.5 text-left text-sm font-semibold text-brand-navy'
                        : 'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-brand-navy hover:bg-brand-sand/60'
                    }
                  >
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>

                    {entry.status === 'signed' ? (
                      <Check className="h-4 w-4 shrink-0 text-status-signed" />
                    ) : entry.status === 'draft' ? (
                      <CircleDot className="h-4 w-4 shrink-0 text-status-draft" />
                    ) : (
                      <span className="shrink-0 text-xs font-medium text-brand-slate">
                        Not started
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
