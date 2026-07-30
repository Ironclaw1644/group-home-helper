'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  DoorClosed,
  Plus,
  Search,
  X
} from 'lucide-react';
import { Badge, Card, EmptyState } from '@/components/ui';
import type { RosterEntry } from '@/lib/types';

/**
 * The daily roster, filtered in the browser.
 *
 * Filtering happens client-side rather than through the URL because this list
 * is one house on one day — small enough to hold in memory, and a DSP looking
 * for a name mid-shift should not wait on a round trip for each keystroke.
 * The resident-management screen does the opposite for the opposite reason.
 */
export function RosterList({
  entries,
  homeId,
  serviceDate
}: {
  entries: Array<RosterEntry & { displayName: string }>;
  homeId: string;
  serviceDate: string;
}) {
  const [query, setQuery] = useState('');

  const grouped = useMemo(() => {
    const term = query.trim().toLowerCase();

    const byResident = new Map<string, Array<RosterEntry & { displayName: string }>>();
    for (const entry of entries) {
      if (term) {
        const haystack = [
          entry.displayName,
          entry.residentFirstName,
          entry.residentLastName,
          entry.residentRoom ?? ''
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) continue;
      }
      const list = byResident.get(entry.residentId) ?? [];
      list.push(entry);
      byResident.set(entry.residentId, list);
    }
    return [...byResident.entries()];
  }, [entries, query]);

  // Below this a search box is just clutter — every name is already on screen.
  const showSearch = new Set(entries.map((e) => e.residentId)).size > 4;

  return (
    <>
      {showSearch ? (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-slate" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a resident"
            aria-label="Find a resident"
            className="w-full rounded-xl border border-brand-navy/15 bg-white py-3 pl-10 pr-10 text-sm text-brand-navy placeholder:text-brand-slate/70 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-slate hover:text-brand-navy"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}

      {grouped.length === 0 ? (
        query ? (
          <EmptyState title="Nobody matches" body="Try part of a name or a room number." />
        ) : (
          <EmptyState
            title="No residents in this house yet"
            body="Add them from the Residents screen."
          />
        )
      ) : (
        <div className="space-y-3">
          {grouped.map(([residentId, residentEntries]) => {
            const first = residentEntries[0];
            return (
              <Card key={residentId} className="p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-brand-navy">
                    {first.displayName} {first.residentLastName}
                  </h2>
                  {first.residentRoom ? (
                    <span className="inline-flex items-center gap-1 text-xs text-brand-slate">
                      <DoorClosed className="h-3 w-3" />
                      Room {first.residentRoom}
                    </span>
                  ) : null}
                  {first.isDemo ? <Badge tone="info">Training</Badge> : null}
                </div>

                <ul className="space-y-2">
                  {residentEntries
                    .slice()
                    .sort((a, b) => a.shiftSort - b.shiftSort)
                    .map((entry) => {
                      const { tone, label, Icon } = statusFor(entry);
                      const href = entry.noteId
                        ? `/notes/${entry.noteId}`
                        : `/notes/new?${new URLSearchParams({
                            resident: entry.residentId,
                            shift: entry.shiftId,
                            date: serviceDate,
                            home: homeId
                          }).toString()}`;

                      return (
                        <li key={entry.shiftId}>
                          <Link
                            href={href}
                            className="flex items-center gap-3 rounded-xl border border-brand-navy/10 bg-white px-3 py-3 transition hover:border-brand-teal/40 hover:bg-brand-sand/60"
                          >
                            <Icon
                              className={
                                tone === 'signed'
                                  ? 'h-5 w-5 shrink-0 text-status-signed'
                                  : tone === 'draft'
                                    ? 'h-5 w-5 shrink-0 text-status-draft'
                                    : 'h-5 w-5 shrink-0 text-status-missing'
                              }
                            />
                            <span className="text-sm font-semibold text-brand-navy">
                              {entry.shiftLabel}
                            </span>
                            <span className="ml-auto flex items-center gap-2">
                              <Badge tone={tone}>{label}</Badge>
                              {entry.noteId ? (
                                <ChevronRight className="h-4 w-4 text-brand-slate" />
                              ) : (
                                <Plus className="h-4 w-4 text-brand-slate" />
                              )}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function statusFor(entry: RosterEntry) {
  if (entry.noteStatus === 'signed') {
    return { tone: 'signed' as const, label: 'Signed', Icon: CircleCheck };
  }
  if (entry.noteStatus === 'draft') {
    return { tone: 'draft' as const, label: 'Draft', Icon: CircleDot };
  }
  return { tone: 'missing' as const, label: 'Not started', Icon: CircleAlert };
}
