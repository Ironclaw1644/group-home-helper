'use client';

import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { addDays } from '@/lib/utils';
import type { Home } from '@/lib/types';

/**
 * Batch export for audit requests and monthly billing packets.
 *
 * Training examples are excluded by default: they are written about a
 * fictional resident for a shift nobody worked, so they have no place in a
 * billing packet. They can still be exported on their own as a training pack.
 */
export default function ExportPanel({ homes, defaultDate }: { homes: Home[]; defaultDate: string }) {
  const [homeId, setHomeId] = useState(homes[0]?.id ?? '');
  const [from, setFrom] = useState(addDays(defaultDate, -30));
  const [to, setTo] = useState(defaultDate);
  const [kind, setKind] = useState<'billing' | 'training'>('billing');

  const href = `/supervisor/export?${new URLSearchParams({
    home: homeId,
    from,
    to,
    kind
  }).toString()}`;

  const invalidRange = from > to;

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.12em] text-brand-slate">
        Batch export
      </h2>
      <p className="mb-4 text-xs text-brand-slate">
        One PDF containing every signed note in the range, for an audit request or a monthly
        billing packet.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {homes.length > 1 ? (
          <div>
            <label htmlFor="export-home" className="field-label">
              House
            </label>
            <select
              id="export-home"
              className="field-input"
              value={homeId}
              onChange={(e) => setHomeId(e.target.value)}
            >
              {homes.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label htmlFor="export-kind" className="field-label">
            Contents
          </label>
          <select
            id="export-kind"
            className="field-input"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'billing' | 'training')}
          >
            <option value="billing">Billing packet (real residents)</option>
            <option value="training">Training examples only</option>
          </select>
        </div>

        <div>
          <label htmlFor="export-from" className="field-label">
            From
          </label>
          <input
            id="export-from"
            type="date"
            className="field-input"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="export-to" className="field-label">
            To
          </label>
          <input
            id="export-to"
            type="date"
            className="field-input"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4">
        <Button href={invalidRange ? undefined : href} variant="primary" disabled={invalidRange}>
          <FileDown className="h-4 w-4" />
          Export PDF
        </Button>
        {invalidRange ? (
          <span className="ml-3 text-xs text-status-missing">
            The start date must be on or before the end date.
          </span>
        ) : null}
      </div>
    </Card>
  );
}
