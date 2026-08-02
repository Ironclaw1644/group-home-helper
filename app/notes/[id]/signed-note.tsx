'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Loader2, Plus } from 'lucide-react';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { interpolate } from '@/lib/forms/interpolate';
import { formatServiceDate } from '@/lib/utils';
import { displayName, PROGRESS_LEVELS, SUPPORT_LEVELS } from '@/lib/types';
import type { NoteActivity, NoteOutcome, Outcome, OutcomeActivity } from '@/lib/types';
import type { FormTemplate, Note, NoteAddendum, Resident } from '@/lib/types';

/**
 * Read-only view of a signed note.
 *
 * There is deliberately no edit affordance here: a signed note is the billing
 * record for that shift. Corrections are appended as addenda, which is what an
 * auditor expects to see and what the database enforces regardless.
 */
export default function SignedNote({
  note,
  resident,
  template,
  shiftLabel,
  addenda,
  canAddAddendum,
  signerName,
  signerTitle,
  outcomes,
  savedOutcomes,
  activities,
  savedActivities
}: {
  note: Note;
  resident: Resident;
  template: FormTemplate;
  shiftLabel: string;
  addenda: NoteAddendum[];
  canAddAddendum: boolean;
  signerName: string;
  signerTitle: string;
  outcomes: Outcome[];
  savedOutcomes: NoteOutcome[];
  activities: OutcomeActivity[];
  savedActivities: NoteActivity[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = (text: string) =>
    interpolate(text, { name: displayName(resident), pronouns: resident.pronouns });

  async function submitAddendum() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${note.id}/addendum`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error ?? 'Could not add the addendum.');
        return;
      }
      setBody('');
      setAdding(false);
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-status-signed">
          <Lock className="h-4 w-4" />
          Signed {note.signedAt ? new Date(note.signedAt).toLocaleString() : ''} — this note is final
        </div>

        <ol className="mb-5 list-decimal space-y-1 rounded-xl bg-brand-sand/60 p-4 pl-9 text-sm text-brand-navy">
          {template.schema.prompts.map((prompt, i) => (
            <li key={i}>{label(prompt)}</li>
          ))}
        </ol>

        <p className="whitespace-pre-wrap text-sm leading-7 text-brand-navy">{note.narrative}</p>

        <div className="mt-6 border-t border-brand-navy/10 pt-4 text-sm">
          <p className="text-brand-navy">
            <span className="text-brand-slate">Staff signature: </span>
            <span className="font-semibold">{note.signatureName}</span>
          </p>
          <p className="mt-1 text-xs text-brand-slate">
            {note.signatureTitle} · {formatServiceDate(note.serviceDate)} · {shiftLabel}
          </p>
          {note.attestationText ? (
            <p className="mt-3 text-xs italic text-brand-slate">{note.attestationText}</p>
          ) : null}
        </div>
      </Card>

      {outcomes.length > 0 ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-brand-slate">
            Service plan outcomes
          </h2>
          <ul className="space-y-3">
            {outcomes.map((outcome) => {
              const entry = savedOutcomes.find((e) => e.outcomeId === outcome.id);
              const support = SUPPORT_LEVELS.find((s) => s.value === entry?.supportLevel)?.label;
              const progress = PROGRESS_LEVELS.find((p) => p.value === entry?.progress)?.label;

              return (
                <li
                  key={outcome.id}
                  className="border-b border-brand-navy/5 pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-brand-navy">{outcome.title}</span>
                    <Badge tone={entry?.addressed ? 'signed' : 'missing'}>
                      {entry?.addressed ? 'Worked on' : 'Not this shift'}
                    </Badge>
                  </div>
                  {entry?.addressed ? (
                    <p className="mt-1 text-xs text-brand-slate">
                      {[support, progress].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                  {entry?.comment ? (
                    <p className="mt-1.5 text-sm text-brand-navy">{entry.comment}</p>
                  ) : null}

                  {activities
                    .filter((a) => a.outcomeId === outcome.id)
                    .map((activity) => {
                      const answer = savedActivities.find((s) => s.activityId === activity.id);
                      if (!answer || answer.completed === null) return null;

                      return (
                        <p key={activity.id} className="mt-1.5 text-xs text-brand-slate">
                          <span className="font-semibold text-brand-navy">
                            {answer.completed ? 'Yes' : 'No'}
                          </span>{' '}
                          — {activity.dailyQuestion || activity.description}
                          {answer.concern ? (
                            <span className="ml-1 font-semibold text-status-draft">· flagged</span>
                          ) : null}
                          {answer.comment ? (
                            <span className="mt-0.5 block text-brand-navy">{answer.comment}</span>
                          ) : null}
                        </p>
                      );
                    })}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {addenda.length > 0 ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-brand-slate">
            Addenda
          </h2>
          <ul className="space-y-4">
            {addenda.map((a) => (
              <li key={a.id} className="border-l-2 border-brand-teal/40 pl-4">
                <p className="whitespace-pre-wrap text-sm leading-6 text-brand-navy">{a.body}</p>
                <p className="mt-1 text-xs text-brand-slate">
                  {a.signatureName} · {a.signatureTitle} · {new Date(a.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {canAddAddendum ? (
        <Card>
          {adding ? (
            <div className="space-y-3">
              <div>
                <label htmlFor="addendum" className="field-label">
                  Addendum
                </label>
                <p className="mb-2 text-xs text-brand-slate">
                  This is appended to the note above. The original text is never changed.
                </p>
                <textarea
                  id="addendum"
                  className="field-input min-h-[120px]"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Describe the correction or additional information."
                />
              </div>

              {error ? <Alert tone="error">{error}</Alert> : null}

              <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" disabled={busy || body.trim().length < 3} onClick={submitAddendum}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Sign addendum as {signerName}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAdding(false)} disabled={busy}>
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-brand-slate">
                Will be signed {signerName} · {signerTitle}
              </p>
            </div>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              Add an addendum
            </Button>
          )}
        </Card>
      ) : null}
    </div>
  );
}
