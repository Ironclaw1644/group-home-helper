'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search, X } from 'lucide-react';

/**
 * Search, filter, and sort controls for the resident roster.
 *
 * State lives in the URL rather than in the component so a filtered roster can
 * be bookmarked, shared with a co-worker, and survives the back button. The
 * text box is debounced because every keystroke would otherwise be a round
 * trip; the selects apply immediately since those are single deliberate acts.
 */
export function RosterControls({
  homes,
  groupings,
  activeHomeId
}: {
  homes: Array<{ id: string; name: string }>;
  groupings: string[];
  activeHomeId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState(params.get('q') ?? '');
  // Tracks what the URL already holds, so the debounce effect can tell an
  // actual edit from a re-render caused by the navigation it just triggered.
  const applied = useRef(params.get('q') ?? '');

  function push(next: Record<string, string | null>) {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '') query.delete(key);
      else query.set(key, value);
    }
    startTransition(() => {
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    });
  }

  useEffect(() => {
    if (search === applied.current) return;

    const timer = setTimeout(() => {
      applied.current = search;
      push({ q: search || null });
    }, 250);

    return () => clearTimeout(timer);
    // `push` closes over params, which change on every navigation; depending on
    // it here would restart the timer mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const selectClass =
    'rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-sm font-medium text-brand-navy focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30';

  return (
    <div className="mb-5 space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-slate" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or room"
          aria-label="Search residents"
          className="w-full rounded-xl border border-brand-navy/15 bg-white py-3 pl-10 pr-10 text-sm text-brand-navy placeholder:text-brand-slate/70 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
        />
        {pending ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-slate" />
        ) : search ? (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-slate hover:text-brand-navy"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {homes.length > 1 ? (
          <select
            value={activeHomeId}
            onChange={(e) => push({ home: e.target.value })}
            aria-label="House"
            className={selectClass}
          >
            {homes.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        ) : null}

        {groupings.length > 0 ? (
          <select
            value={params.get('group') ?? ''}
            onChange={(e) => push({ group: e.target.value || null })}
            aria-label="Group"
            className={selectClass}
          >
            <option value="">All groups</option>
            {groupings.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        ) : null}

        <select
          value={params.get('sort') ?? 'last_name'}
          onChange={(e) => push({ sort: e.target.value })}
          aria-label="Sort by"
          className={selectClass}
        >
          <option value="last_name">Sort: last name</option>
          <option value="first_name">Sort: first name</option>
          <option value="room">Sort: room</option>
          <option value="recent">Sort: recently added</option>
        </select>

        <select
          value={params.get('status') ?? 'active'}
          onChange={(e) => push({ status: e.target.value })}
          aria-label="Status"
          className={selectClass}
        >
          <option value="active">Current residents</option>
          <option value="inactive">Discharged</option>
          <option value="all">Everyone</option>
        </select>
      </div>
    </div>
  );
}
