'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, CloudOff, Loader2, PenLine, Sparkles, Trash2 } from 'lucide-react';
import { FieldRenderer } from '@/components/form/FieldRenderer';
import { OutcomeEntry } from '@/components/note/outcome-entry';
import { SignaturePad, type SignatureMethod } from '@/components/form/SignaturePad';
import { Alert, Button, Card } from '@/components/ui';
import { hasAnySelection, interpolate } from '@/lib/forms/interpolate';
import { answeredOutcomes, unansweredOutcomes } from '@/lib/outcomes/answered';
import { createAutosave, type Autosave } from '@/lib/notes/autosave';
import {
  clearLocalDraft,
  localDraftIsNewer,
  readLocalDraft,
  saveLocalDraft
} from '@/lib/notes/draft-storage';
import { formatServiceDate } from '@/lib/utils';
import {
  displayName,
  type FormTemplate,
  type Note,
  type NoteActivity,
  type NoteOutcome,
  type Outcome,
  type OutcomeActivity,
  type Resident,
  type StructuredData
} from '@/lib/types';

type SaveState = 'idle' | 'saving' | 'saved' | 'offline';

/** What one autosave writes. Outcomes and activities are read from refs. */
type SavePayload = { structuredData: StructuredData; narrative: string };

const AUTOSAVE_DEBOUNCE_MS = 1200;

export default function NoteEditor({
  note,
  resident,
  template,
  shiftLabel,
  signerName,
  signerTitle,
  today,
  outcomes,
  savedOutcomes,
  activities,
  savedActivities
}: {
  note: Note;
  resident: Resident;
  template: FormTemplate;
  shiftLabel: string;
  signerName: string;
  signerTitle: string;
  /** Today in the agency's own timezone, resolved on the server. */
  today: string;
  /** This resident's ISP outcomes. Different for every person — that is the point. */
  outcomes: Outcome[];
  savedOutcomes: NoteOutcome[];
  /** Support activities across all of this resident's outcomes. */
  activities: OutcomeActivity[];
  savedActivities: NoteActivity[];
}) {
  const router = useRouter();

  const [data, setData] = useState<StructuredData>(note.structuredData);

  // Activities start unanswered (`completed: null`) and stay that way until a
  // DSP answers the question. A blank is a gap in the record; a "no" is a
  // documented fact. They are not interchangeable.
  const [activityEntries, setActivityEntries] = useState<NoteActivity[]>(() =>
    activities.map(
      (a) =>
        savedActivities.find((s) => s.activityId === a.id) ?? {
          activityId: a.id,
          completed: null,
          concern: false,
          comment: null
        }
    )
  );

  // Outcomes start genuinely unanswered. `addressed: null` is not "no" — a
  // fresh note used to open with every outcome already showing "Not this
  // shift", which put an unverified clinical claim into a Medicaid record
  // before any human had looked at it. Unanswered entries are filtered out of
  // every save, so nothing is written until the DSP chooses.
  const [outcomeEntries, setOutcomeEntries] = useState<NoteOutcome[]>(() =>
    outcomes.map(
      (o) =>
        savedOutcomes.find((s) => s.outcomeId === o.id) ?? {
          outcomeId: o.id,
          addressed: null,
          supportLevel: null,
          progress: null,
          comment: null
        }
    )
  );
  const [narrative, setNarrative] = useState(note.narrative);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [restored, setRestored] = useState(false);

  const [drafting, setDrafting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // A subscription lapse is not a fault — it gets its own message and a link
  // for the people who can act on it, rather than looking like a broken app.
  const [aiNeedsPlan, setAiNeedsPlan] = useState(false);
  // Set when the model itself is unreachable (Ollama not running, model not
  // pulled) rather than the model answering badly. Different fix, different
  // message.
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [aiFlags, setAiFlags] = useState<string[]>([]);

  const [prestageConfirmedAt, setPrestageConfirmedAt] = useState<string | null>(
    note.prestageConfirmedAt
  );
  const [confirmingPrestage, setConfirmingPrestage] = useState(false);

  const [signing, setSigning] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signatureMethod, setSignatureMethod] = useState<SignatureMethod>('drawn');
  const [attested, setAttested] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<number | null>(null);
  const [overrodeDuplicate, setOverrodeDuplicate] = useState(false);

  const ctx = useMemo(
    () => ({ name: displayName(resident), pronouns: resident.pronouns }),
    [resident, resident.pronouns]
  );
  const label = useCallback((text: string) => interpolate(text, ctx), [ctx]);

  // Recover a draft the last session failed to sync.
  useEffect(() => {
    const local = readLocalDraft(note.id);
    if (localDraftIsNewer(local, note.updatedAt) && local) {
      setData(local.structuredData);
      setNarrative(local.narrative);
      setRestored(true);
    }
  }, [note.id, note.updatedAt]);

  // Read through a ref so the debounced save always sends the latest outcome
  // documentation, not whatever was captured when the timer was set.
  const outcomesRef = useRef<NoteOutcome[]>(outcomeEntries);
  outcomesRef.current = outcomeEntries;

  const activitiesRef = useRef<NoteActivity[]>(activityEntries);
  activitiesRef.current = activityEntries;

  // Autosave: localStorage immediately, server on a debounce. The controller
  // owns the timer and the in-flight request so that anything needing the
  // server to be current — generating a draft, signing — can flush and wait
  // rather than hope the debounce has fired.
  const autosaveRef = useRef<Autosave<SavePayload> | null>(null);
  if (autosaveRef.current === null) {
    autosaveRef.current = createAutosave<SavePayload>({
      delayMs: AUTOSAVE_DEBOUNCE_MS,
      onState: setSaveState,
      save: async ({ structuredData, narrative: body }) => {
        const res = await fetch(`/api/notes/${note.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            structuredData,
            narrative: body,
            // Only outcomes somebody actually answered. An unanswered one has
            // no row, and no row is how the record says "not documented" —
            // sending it would serialize as the negative "not worked on".
            outcomes: answeredOutcomes(outcomesRef.current),
            activities: activitiesRef.current
          })
        });
        // Throwing is what tells the controller the write did not land.
        if (!res.ok) throw new Error(await res.text());
        clearLocalDraft(note.id);
      }
    });
  }
  const autosave = autosaveRef.current;

  const scheduleSave = useCallback(
    (nextData: StructuredData, nextNarrative: string) => {
      saveLocalDraft({ noteId: note.id, structuredData: nextData, narrative: nextNarrative });
      autosave.schedule({ structuredData: nextData, narrative: nextNarrative });
    },
    [note.id, autosave]
  );

  useEffect(() => {
    return () => autosave.cancel();
  }, [autosave]);

  // Warn before closing a tab with unsaved work.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (autosave.isDirty()) e.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [autosave]);

  function updateField(key: string, value: string[] | boolean | string) {
    setData((prev) => {
      const next = { ...prev, [key]: value };
      scheduleSave(next, narrative);
      return next;
    });
  }

  function updateNarrative(value: string) {
    setNarrative(value);
    scheduleSave(data, value);
  }

  const [discarding, setDiscarding] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  async function discard() {
    setDiscarding(true);
    const res = await fetch(`/api/notes/${note.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setSignError(body.error ?? 'Could not discard this note.');
      setDiscarding(false);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  function updateActivity(next: NoteActivity) {
    setActivityEntries((prev) => {
      const updated = prev.map((a) => (a.activityId === next.activityId ? next : a));
      activitiesRef.current = updated;
      scheduleSave(data, narrative);
      return updated;
    });
  }

  function updateOutcome(next: NoteOutcome) {
    setOutcomeEntries((prev) => {
      const updated = prev.map((e) => (e.outcomeId === next.outcomeId ? next : e));
      outcomesRef.current = updated;
      scheduleSave(data, narrative);
      return updated;
    });
  }

  const canDraft = hasAnySelection(template.schema, data);

  async function generateDraft() {
    setDrafting(true);
    setAiError(null);
    setAiUnavailable(false);
    setAiNeedsPlan(false);
    setAiFlags([]);
    try {
      // The server generates from the saved row, not from this screen, because
      // the grounding check has to compare the narrative against what the
      // record actually contains. So the row has to be current first. Without
      // this, tapping chips quickly and hitting generate raced the 1.2 s
      // debounce and came back "Record what happened this shift first" on a
      // screen full of selections.
      if ((await autosave.flush()) === 'failed') {
        setAiError(
          'Your entries have not reached the server yet, so there is nothing to write from. Check your connection and try again — nothing is lost.'
        );
        return;
      }

      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ noteId: note.id, mode: 'draft_assist' })
      });
      const body = await res.json();
      if (!res.ok) {
        setAiUnavailable(res.status === 503 || body?.reason === 'unavailable');
        setAiNeedsPlan(res.status === 402 || body?.reason === 'payment_required');
        setAiError(body?.error ?? 'Could not generate a draft. Please write the note manually.');
        return;
      }
      setNarrative(body.narrative);
      scheduleSave(data, body.narrative);
      if (Array.isArray(body.unsupportedClaims) && body.unsupportedClaims.length > 0) {
        setAiFlags(body.unsupportedClaims);
      }
    } catch {
      setAiError('Could not reach the server. You can still write the note manually.');
    } finally {
      setDrafting(false);
    }
  }

  async function confirmPrestage() {
    setConfirmingPrestage(true);
    setSignError(null);
    try {
      // Flush first: the DSP has usually corrected something before confirming,
      // and the confirmation should cover what is on screen.
      await autosave.flush();

      const res = await fetch(`/api/notes/${note.id}/confirm-prestage`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSignError(body?.error ?? 'Could not record the confirmation.');
        return;
      }
      setPrestageConfirmedAt(body.confirmedAt ?? new Date().toISOString());
    } catch {
      setSignError('Could not reach the server. Your note is saved on this device.');
    } finally {
      setConfirmingPrestage(false);
    }
  }

  async function submitSignature(force: boolean) {
    setSigning(true);
    setSignError(null);
    try {
      // Sign exactly what is on screen. If the flush did not land, stop: a
      // signature is permanent, and locking a note whose entries never reached
      // the server would preserve the wrong record forever.
      if ((await autosave.flush()) === 'failed') {
        setSignError(
          'Your note has not saved to the server yet, so it cannot be signed. It is safe on this device — check your connection and try again.'
        );
        return;
      }

      const res = await fetch(`/api/notes/${note.id}/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          signatureImage: signatureData,
          signatureMethod,
          attested: true,
          acknowledgeDuplicate: force
        })
      });
      const body = await res.json();

      if (res.status === 409 && body?.code === 'duplicate_narrative') {
        setDuplicateWarning(body.similarity ?? 1);
        return;
      }
      if (!res.ok) {
        setSignError(body?.error ?? 'Could not sign this note.');
        return;
      }

      clearLocalDraft(note.id);
      router.refresh();
    } catch {
      setSignError('Could not reach the server. Your note is saved on this device.');
    } finally {
      setSigning(false);
    }
  }

  const narrativeTooShort =
    narrative.trim().length < (template.schema.narrative.min_length ?? 0);

  // A prepared note opens carrying the resident's routine. That is a starting
  // point, not an observation, so a person has to say it matches the shift they
  // worked before it can be signed. The database refuses too.
  const needsPrestageConfirm = Boolean(note.prestagedAt) && prestageConfirmedAt === null;

  // Prepared notes exist for days that have not arrived. Nobody can attest to a
  // shift they have not worked.
  const isFutureShift = note.serviceDate > today;

  // Signing is what turns this into a permanent Medicaid record, so every
  // outcome has to have a human answer behind it by then. Leaving one blank
  // used to be impossible to notice, because blank rendered as "Not this
  // shift"; now it blocks the signature instead of quietly becoming a claim.
  const stillUnanswered = unansweredOutcomes(outcomes, outcomeEntries);

  const readyToSign =
    attested &&
    narrative.trim().length > 0 &&
    !narrativeTooShort &&
    stillUnanswered.length === 0 &&
    !needsPrestageConfirm &&
    !isFutureShift;

  return (
    <div className="space-y-5">
      {restored ? (
        <Alert tone="warning" title="Recovered an unsaved draft">
          This device had newer changes than the server. Review the note before signing.
        </Alert>
      ) : null}

      {/* A prepared note says so, at the top, before anything else. The entries
          below came from what usually happens, not from anyone watching this
          shift, and the difference has to be the first thing the DSP reads. */}
      {note.prestagedAt && needsPrestageConfirm ? (
        <Alert tone="warning" title="Prepared ahead of the shift — check it">
          <p>
            The entries below were filled in from {displayName(resident)}&apos;s usual{' '}
            {shiftLabel} shift. Nobody has watched this one yet. Change anything that was
            different, then confirm.
          </p>
          <p className="mt-1">
            {resident.pronouns.possessive.charAt(0).toUpperCase() +
              resident.pronouns.possessive.slice(1)}{' '}
            service plan below was left blank on purpose — those answers are yours to give.
          </p>
          <div className="mt-3">
            <Button
              variant="primary"
              size="sm"
              onClick={confirmPrestage}
              disabled={confirmingPrestage || isFutureShift}
            >
              {confirmingPrestage ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              This matches my shift
            </Button>
          </div>
        </Alert>
      ) : null}

      {isFutureShift ? (
        <Alert tone="info" title="This shift has not happened yet">
          This note is for {formatServiceDate(note.serviceDate)}. It is here so it is ready when
          the shift ends — it cannot be signed until that day.
        </Alert>
      ) : null}

      {/* The five prompt questions, printed exactly as they appear on the form. */}
      <Card>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-brand-slate">
          Form #680 prompts
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-brand-navy">
          {template.schema.prompts.map((prompt, i) => (
            <li key={i}>{label(prompt)}</li>
          ))}
        </ol>
      </Card>

      {outcomes.length === 0 ? (
        <Card className="border-dashed">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.12em] text-brand-slate">
            {displayName(resident)}&apos;s service plan
          </h2>
          <p className="text-xs text-brand-slate">
            No outcomes have been added for {displayName(resident)} yet, so this note documents the
            shift only. Adding the plan is what lets a note show progress toward it — which is what
            a reviewer looks for.
          </p>
          <Link
            href={`/residents/${resident.id}/outcomes`}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-teal hover:underline"
          >
            Set up the service plan →
          </Link>
        </Card>
      ) : null}

      {outcomes.length > 0 ? (
        <Card>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-brand-slate">
              {displayName(resident)}&apos;s service plan
            </h2>
            <Link
              href={`/residents/${resident.id}/outcomes`}
              className="shrink-0 text-xs font-semibold text-brand-teal hover:underline"
            >
              Edit the plan
            </Link>
          </div>
          <p className="mb-4 text-xs text-brand-slate">
            {outcomes.length} {outcomes.length === 1 ? 'outcome' : 'outcomes'} from{' '}
            {resident.pronouns.possessive} ISP, filled in here as part of this note — there is no
            separate form to go and complete. Recording them is what shows the day supported the
            plan.
          </p>
          <div className="space-y-3">
            {outcomes.map((outcome) => {
              const entry =
                outcomeEntries.find((e) => e.outcomeId === outcome.id) ?? {
                  outcomeId: outcome.id,
                  addressed: null,
                  supportLevel: null,
                  progress: null,
                  comment: null
                };
              return (
                <OutcomeEntry
                  key={outcome.id}
                  outcome={outcome}
                  value={entry}
                  onChange={updateOutcome}
                  activities={activities.filter((a) => a.outcomeId === outcome.id)}
                  activityValues={activityEntries}
                  onActivityChange={updateActivity}
                />
              );
            })}
          </div>
        </Card>
      ) : null}

      {template.schema.sections.map((section) => (
        <Card key={section.key}>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-brand-slate">
            {section.title}
          </h2>
          <div className="space-y-5">
            {section.fields.map((field) => (
              <FieldRenderer
                key={field.key}
                field={field}
                sectionKey={section.key}
                data={data}
                onChange={updateField}
                interpolateLabel={label}
              />
            ))}
          </div>
        </Card>
      ))}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-brand-slate">
            {template.schema.narrative.label}
          </h2>
          <Button variant="secondary" size="sm" onClick={generateDraft} disabled={!canDraft || drafting}>
            {drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {drafting ? 'Writing…' : 'Write from my entries'}
          </Button>
        </div>

        {!canDraft ? (
          <p className="mb-3 text-xs text-brand-slate">
            Tap what happened this shift above, then generate a draft from it.
          </p>
        ) : null}

        {aiError ? (
          <div className="mb-3">
            <Alert
              tone={aiUnavailable || aiNeedsPlan ? 'warning' : 'error'}
              title={
                aiNeedsPlan
                  ? 'The note assistant needs a subscription'
                  : aiUnavailable
                    ? 'Note assistant is not running'
                    : undefined
              }
            >
              <p>{aiError}</p>
              {aiNeedsPlan ? (
                <p className="mt-1">
                  Write the note yourself below — signing, the PDF, and everything else work
                  exactly as normal. A supervisor can start a plan on the{' '}
                  <Link href="/billing" className="font-semibold underline">
                    billing page
                  </Link>
                  .
                </p>
              ) : aiUnavailable ? (
                <p className="mt-1">
                  You can write this note manually in the meantime — nothing is lost.
                </p>
              ) : null}
            </Alert>
          </div>
        ) : null}

        {aiFlags.length > 0 ? (
          <div className="mb-3">
            <Alert tone="warning" title="Review before signing">
              The draft mentions something that was not in your entries:{' '}
              {aiFlags.join('; ')}. Remove it or add the matching entry above.
            </Alert>
          </div>
        ) : null}

        <textarea
          className="field-input min-h-[280px] leading-7"
          value={narrative}
          onChange={(e) => updateNarrative(e.target.value)}
          placeholder="Describe the shift. You can generate a draft from your entries above and edit it here."
        />

        <div className="mt-2 flex items-center justify-between text-xs">
          <span className={narrativeTooShort && narrative.length > 0 ? 'text-status-draft' : 'text-brand-slate'}>
            {narrative.trim().length} characters
            {template.schema.narrative.min_length
              ? ` · ${template.schema.narrative.min_length} minimum`
              : ''}
          </span>
          <SaveIndicator state={saveState} />
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.12em] text-brand-slate">
          Signature
        </h2>
        <p className="mb-4 text-xs text-brand-slate">
          {signerName} · {signerTitle} · {formatServiceDate(note.serviceDate)} · {shiftLabel}
        </p>

        <SignaturePad
          defaultName={signerName}
          onChange={(dataUrl, method) => {
            setSignatureData(dataUrl);
            setSignatureMethod(method);
          }}
        />

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-brand-navy/10 bg-brand-sand/50 p-3">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-brand-teal"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
          />
          <span className="text-sm text-brand-navy">{template.schema.signature.attestation}</span>
        </label>

        {duplicateWarning !== null ? (
          <div className="mt-4">
            <Alert tone="warning" title="This looks like the previous note">
              <p>
                This narrative is {Math.round(duplicateWarning * 100)}% similar to{' '}
                {displayName(resident)}&apos;s last signed note. Near-identical notes across days are a
                common audit finding. Edit it to describe this shift specifically, or confirm it is
                accurate.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDuplicateWarning(null);
                    setOverrodeDuplicate(false);
                  }}
                >
                  Let me edit it
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={signing}
                  onClick={() => {
                    setOverrodeDuplicate(true);
                    void submitSignature(true);
                  }}
                >
                  It is accurate — sign anyway
                </Button>
              </div>
            </Alert>
          </div>
        ) : null}

        {signError ? (
          <div className="mt-4">
            <Alert tone="error">{signError}</Alert>
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="primary"
            disabled={!readyToSign || signing}
            onClick={() => void submitSignature(overrodeDuplicate)}
          >
            {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
            {signing ? 'Signing…' : 'Sign and lock note'}
          </Button>
          {isFutureShift ? (
            <span className="text-xs font-semibold text-status-draft">
              Can be signed on {formatServiceDate(note.serviceDate)}.
            </span>
          ) : needsPrestageConfirm ? (
            <span className="text-xs font-semibold text-status-draft">
              Confirm the prepared entries above first.
            </span>
          ) : stillUnanswered.length > 0 ? (
            <span className="text-xs font-semibold text-status-draft">
              {stillUnanswered.length === 1
                ? '1 service-plan outcome still needs an answer.'
                : `${stillUnanswered.length} service-plan outcomes still need an answer.`}
            </span>
          ) : !attested ? (
            <span className="text-xs text-brand-slate">Check the attestation to sign.</span>
          ) : narrativeTooShort ? (
            <span className="text-xs text-brand-slate">Add more detail before signing.</span>
          ) : null}
        </div>

        {stillUnanswered.length > 0 ? (
          <p className="mt-2 text-xs text-brand-slate">
            {stillUnanswered.map((o) => o.title).join(' · ')} — mark each one &ldquo;Worked on
            this&rdquo; or &ldquo;Not this shift&rdquo; in {resident.pronouns.possessive} service
            plan above. Nothing is recorded against an outcome until you say so.
          </p>
        ) : null}

        <p className="mt-3 text-xs text-brand-slate">
          Signing locks this note permanently. Corrections are added as a separate addendum.
        </p>

        {/* Discarding is only ever possible before signing, so it belongs here
            rather than in a menu — after this button it stops existing. */}
        <div className="mt-4 border-t border-brand-navy/5 pt-4">
          {confirmDiscard ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-brand-navy">
                Discard this draft? Everything typed here is lost.
              </span>
              <Button variant="danger" size="sm" onClick={discard} disabled={discarding}>
                {discarding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Yes, discard
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDiscard(false)}>
                Keep it
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDiscard(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-status-missing"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Discard this draft
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-brand-slate">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving…
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-status-signed">
        <Check className="h-3.5 w-3.5" />
        Saved
      </span>
    );
  }
  if (state === 'offline') {
    return (
      <span className="inline-flex items-center gap-1.5 text-status-draft">
        <CloudOff className="h-3.5 w-3.5" />
        Saved on this device only
      </span>
    );
  }
  return <span className="text-brand-slate">&nbsp;</span>;
}
