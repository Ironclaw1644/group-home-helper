'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { Alert, Button, Card } from '@/components/ui';

/**
 * Remove a resident.
 *
 * Two different acts wearing one label, and the difference matters enough to
 * show both up front rather than making someone discover the second by having
 * the first fail:
 *
 *   Discharge  — off the daily roster, every record kept. Almost always right.
 *   Delete     — the person and all their documentation, gone. Rare and final.
 *
 * The counts are real, fetched on the server, so the confirmation says exactly
 * what is about to be destroyed instead of asking for a leap of faith. Delete
 * is administrators only, and the full legal name has to be typed.
 */

export type RemovalCounts = {
  notes: number;
  signedNotes: number;
  documents: number;
  outcomes: number;
};

export function DeleteResident({
  residentId,
  fullName,
  homeId,
  counts,
  canPurge,
  isTrainingResident = false
}: {
  residentId: string;
  /** Legal name, which is what has to be typed to confirm. */
  fullName: string;
  homeId: string;
  counts: RemovalCounts;
  /** False for a supervisor, who can discharge but not erase. */
  canPurge: boolean;
  isTrainingResident?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasHistory =
    counts.notes > 0 || counts.documents > 0 || counts.outcomes > 0;

  async function remove() {
    setBusy(true);
    setError(null);

    // Nothing on file means the plain delete is enough, and it does not need
    // the administrator role. With history, it has to go through the purge.
    const res = hasHistory
      ? await fetch(`/api/residents/${residentId}/purge`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ confirm: typed })
        })
      : await fetch(`/api/residents/${residentId}`, { method: 'DELETE' });

    const body = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok) {
      setError(body.error ?? 'Could not delete.');
      return;
    }

    router.push(`/residents?home=${homeId}`);
    router.refresh();
  }

  const nameMatches = typed.trim().toLowerCase() === fullName.toLowerCase();

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-brand-navy">Remove this resident</h2>
      <p className="mb-3 text-xs text-brand-slate">
        If someone has moved out, mark them discharged — that takes them off the daily roster and
        keeps their records, which is what the state expects the agency to retain. Deleting is for
        a person entered by mistake, or where you are required to destroy the records.
      </p>

      {error ? (
        <div className="mb-3">
          <Alert tone="warning">{error}</Alert>
        </div>
      ) : null}

      {!canPurge && hasHistory ? (
        <p className="text-xs text-brand-slate">
          {fullName} has records on file, so only an administrator can delete them. You can mark
          them discharged above.
        </p>
      ) : open ? (
        <div className="rounded-xl border border-status-missing/40 bg-status-missing/5 p-3">
          <p className="text-xs font-semibold text-brand-navy">
            Delete {fullName} and everything on file?
          </p>

          {hasHistory ? (
            <ul className="mt-2 space-y-0.5 text-xs text-brand-slate">
              <li>
                {counts.notes} progress note{counts.notes === 1 ? '' : 's'}
                {counts.signedNotes > 0 ? ` (${counts.signedNotes} signed)` : ''}, plus any addenda
              </li>
              <li>
                {counts.outcomes} service-plan outcome{counts.outcomes === 1 ? '' : 's'} and their
                support activities
              </li>
              <li>
                {counts.documents} uploaded document{counts.documents === 1 ? '' : 's'}, files and
                all
              </li>
            </ul>
          ) : (
            <p className="mt-2 text-xs text-brand-slate">
              Nothing has been documented about them yet, so there is no history to lose.
            </p>
          )}

          {isTrainingResident ? (
            <p className="mt-2 text-xs text-brand-slate">
              This is the fictional resident staff practise on. Removing them also removes the
              subject of the training-example notes; you can add a new practice resident from the
              residents list whenever you want one back.
            </p>
          ) : null}

          {hasHistory ? (
            <>
              <p className="mt-2 text-xs text-brand-slate">
                This cannot be undone, and signed notes are normally permanent records. An entry
                naming you, the counts above, and the time is written to the audit log first — that
                entry stays.
              </p>
              <label
                htmlFor="confirmName"
                className="mt-3 block text-xs font-semibold text-brand-navy"
              >
                Type <span className="font-mono">{fullName}</span> to confirm
              </label>
              <input
                id="confirmName"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                className="mt-1.5 w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
              />
            </>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={remove}
              disabled={busy || (hasHistory && !nameMatches)}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Delete permanently
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                setTyped('');
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-status-missing"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete {fullName} and all their records
        </button>
      )}
    </Card>
  );
}
