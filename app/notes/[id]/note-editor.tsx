'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, CloudOff, Loader2, PenLine, Sparkles } from 'lucide-react';
import { FieldRenderer } from '@/components/form/FieldRenderer';
import { OutcomeEntry } from '@/components/note/outcome-entry';
import { SignaturePad, type SignatureMethod } from '@/components/form/SignaturePad';
import { Alert, Button, Card } from '@/components/ui';
import { hasAnySelection, interpolate } from '@/lib/forms/interpolate';
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

const AUTOSAVE_DEBOUNCE_MS = 1200;

export default function NoteEditor({
  note,
  resident,
  template,
  shiftLabel,
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
  signerName: string;
  signerTitle: string;
  /** This resident's ISP outcomes. Different for every person — that is the point. */
  outcomes: Outcome[];
  savedOutcomes: NoteOutcome[];
  /** Support activities across all of this resident's outcomes. */
  activities: OutcomeActivity[];
  savedActivities: NoteActivity[];
}) {
  const router = useRouter();

  const [data, setData] = useState<StructuredData>(note.structuredData);

  // Every outcome starts present-but-unaddressed, so a shift where nothing was
  // worked on is recorded as exactly that rather than as missing data. A run of
  // "not addressed" is a signal a supervisor needs to see.
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

  const [outcomeEntries, setOutcomeEntries] = useState<NoteOutcome[]>(() =>
    outcomes.map(
      (o) =>
        savedOutcomes.find((s) => s.outcomeId === o.id) ?? {
          outcomeId: o.id,
          addressed: false,
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

  // Autosave: localStorage immediately, server on a debounce.
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read through a ref so the debounced save always sends the latest outcome
  // documentation, not whatever was captured when the timer was set.
  const outcomesRef = useRef<NoteOutcome[]>(outcomeEntries);
  outcomesRef.current = outcomeEntries;

  const activitiesRef = useRef<NoteActivity[]>(activityEntries);
  activitiesRef.current = activityEntries;

  const persist = useCallback(
    async (nextData: StructuredData, nextNarrative: string) => {
      setSaveState('saving');
      try {
        const res = await fetch(`/api/notes/${note.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            structuredData: nextData,
            narrative: nextNarrative,
            outcomes: outcomesRef.current,
            activities: activitiesRef.current
          })
        });
        if (!res.ok) throw new Error(await res.text());
        setSaveState('saved');
        dirty.current = false;
        clearLocalDraft(note.id);
      } catch {
        // Keep the local copy and say so rather than pretending it saved.
        setSaveState('offline');
      }
    },
    [note.id]
  );

  const scheduleSave = useCallback(
    (nextData: StructuredData, nextNarrative: string) => {
      dirty.current = true;
      saveLocalDraft({ noteId: note.id, structuredData: nextData, narrative: nextNarrative });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void persist(nextData, nextNarrative), AUTOSAVE_DEBOUNCE_MS);
    },
    [note.id, persist]
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Warn before closing a tab with unsaved work.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirty.current) e.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

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

  async function submitSignature(force: boolean) {
    setSigning(true);
    setSignError(null);
    try {
      // Flush any pending edit so we sign exactly what is on screen.
      if (timer.current) clearTimeout(timer.current);
      await persist(data, narrative);

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
  const readyToSign = attested && narrative.trim().length > 0 && !narrativeTooShort;

  return (
    <div className="space-y-5">
      {restored ? (
        <Alert tone="warning" title="Recovered an unsaved draft">
          This device had newer changes than the server. Review the note before signing.
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

      {outcomes.length > 0 ? (
        <Card>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.12em] text-brand-slate">
            {displayName(resident)}&apos;s service plan
          </h2>
          <p className="mb-4 text-xs text-brand-slate">
            {outcomes.length} {outcomes.length === 1 ? 'outcome' : 'outcomes'} from{' '}
            {resident.pronouns.possessive} ISP. Recording these is what shows the day supported
            the plan.
          </p>
          <div className="space-y-3">
            {outcomes.map((outcome) => {
              const entry =
                outcomeEntries.find((e) => e.outcomeId === outcome.id) ?? {
                  outcomeId: outcome.id,
                  addressed: false,
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
          {!attested ? (
            <span className="text-xs text-brand-slate">Check the attestation to sign.</span>
          ) : narrativeTooShort ? (
            <span className="text-xs text-brand-slate">Add more detail before signing.</span>
          ) : null}
        </div>

        <p className="mt-3 text-xs text-brand-slate">
          Signing locks this note permanently. Corrections are added as a separate addendum.
        </p>
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
