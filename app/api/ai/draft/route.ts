import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { getBillingState, recordGeneration } from '@/lib/billing/stripe';
import {
  getNoteActivities,
  getNoteOutcomes,
  listActivities,
  listOutcomes
} from '@/lib/outcomes/repo';
import { PROGRESS_LEVELS, SUPPORT_LEVELS } from '@/lib/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getActiveTemplate, getNote, getResident, getShifts } from '@/lib/notes/repo';
import {
  describeSelections,
  hasAnySelection,
  interpolate,
  shiftHasConcern
} from '@/lib/forms/interpolate';
import { buildDraftUserMessage, buildExampleUserMessage, SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { getProvider } from '@/lib/ai/provider';
import { deidentifyEnabled, findResidualIdentifiers, prepareName, scrubFreeText } from '@/lib/ai/deid';
import { checkClosingSentence, checkGrounding } from '@/lib/ai/guard';
import { finalizeNarrative } from '@/lib/ai/postprocess';
import { logAccess } from '@/lib/audit';
import { displayName } from '@/lib/types';

export const runtime = 'nodejs';

const Body = z.object({
  noteId: z.string().uuid(),
  mode: z.enum(['draft_assist', 'example'])
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { noteId, mode } = parsed.data;

  const note = await getNote(noteId);
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  if (note.locked || note.status === 'signed') {
    return NextResponse.json({ error: 'This note is signed and cannot be changed.' }, { status: 409 });
  }

  const [resident, template, shifts] = await Promise.all([
    getResident(note.residentId),
    getActiveTemplate(),
    getShifts(note.homeId)
  ]);
  if (!resident) return NextResponse.json({ error: 'Resident not found' }, { status: 404 });

  const shiftLabel = shifts.find((s) => s.id === note.shiftId)?.label ?? '';

  // A training example invents a plausible shift. That is only acceptable for
  // a fictional resident — inventing a shift for a real person would put a
  // fabricated account into their medical record. This is the load-bearing
  // check for the whole feature, so it is enforced here rather than in the UI.
  if (mode === 'example' && !resident.isDemo) {
    return NextResponse.json(
      {
        error:
          'Training examples can only be generated for the demo resident. For a real resident, record what happened and use "Write from my entries".'
      },
      { status: 400 }
    );
  }

  // Subscription gate. Deliberately the last check before generating, and
  // deliberately the ONLY thing it gates: a lapsed agency keeps the roster,
  // the form, signing, PDFs, and exports. Losing the ability to document a
  // shift over a card decline would leave a resident with no record of their
  // care that day.
  const billing = await getBillingState(session.profile.orgId);
  if (!billing.entitled) {
    return NextResponse.json(
      {
        error:
          'The note assistant needs an active subscription. You can still write this note yourself — nothing else changes.',
        reason: 'payment_required',
        billing: { status: billing.status, freeRemaining: 0 }
      },
      { status: 402 }
    );
  }

  // With the default local provider nothing leaves the machine, so names are
  // sent as-is. The hosted provider strips them unless BAAs are in place.
  // Collected before generation so the guard and the prompt see the same text.
  let outcomeComments: string[] = [];

  const provider = await getProvider();
  const offMachine = provider.sendsDataOffMachine;
  const deidentified = deidentifyEnabled(offMachine);

  // The narrative uses the name staff use. The legal name still appears in the
  // form's identity field, which is rendered from the record, not from here.
  const { outboundName, rehydrate } = prepareName(displayName(resident), offMachine);
  const outboundCtx = {
    name: outboundName,
    pronouns: resident.pronouns
  };

  let userMessage: string;

  if (mode === 'example') {
    userMessage = buildExampleUserMessage({
      residentName: outboundName,
      pronouns: resident.pronouns,
      shiftLabel,
      prompts: template.schema.prompts.map((p) => interpolate(p, outboundCtx)),
      // Nudge each generation somewhere different so a trainer showing the
      // feature twice does not get the same note back.
      variation: `Vary the activity and time of day from a typical previous example. Seed: ${noteId.slice(0, 8)}`
    });
  } else {
    if (!hasAnySelection(template.schema, note.structuredData)) {
      return NextResponse.json(
        { error: 'Record what happened this shift first, then generate a draft.' },
        { status: 400 }
      );
    }

    const selections = describeSelections(template.schema, note.structuredData, outboundCtx).map(
      (sel) => ({ ...sel, values: sel.values.map((v) => scrubFreeText(v, offMachine)) })
    );

    // Outcome documentation, resolved to the labels a reader would use. Only
    // outcomes the DSP actually touched reach the model; the rest are sent as
    // explicit negatives so the topic is suppressed rather than invented.
    const [planOutcomes, documented] = await Promise.all([
      listOutcomes(note.residentId),
      getNoteOutcomes(note.id)
    ]);

    const [planActivities, answeredActivities] = await Promise.all([
      listActivities(planOutcomes.map((o) => o.id)),
      getNoteActivities(note.id)
    ]);

    const outcomeInput = planOutcomes.map((o) => {
      const entry = documented.find((d) => d.outcomeId === o.id);
      return {
        title: o.title,
        // No row means nobody has answered. Coercing that to `false` would
        // tell the model that "not worked on this shift" was recorded, which
        // is a fact the DSP never entered.
        addressed: entry ? entry.addressed : null,
        supportLevel: SUPPORT_LEVELS.find((s) => s.value === entry?.supportLevel)?.label ?? null,
        progress: PROGRESS_LEVELS.find((pl) => pl.value === entry?.progress)?.label ?? null,
        // Free text the DSP wrote. Scrubbed on the same terms as everything
        // else when the provider sends data off the machine.
        comment: entry?.comment ? scrubFreeText(entry.comment, offMachine) : null,
        // Only answered activities are sent. An unanswered one is a gap in the
        // record, and describing it either way would be inventing.
        activities: planActivities
          .filter((a) => a.outcomeId === o.id)
          .map((a) => {
            const answer = answeredActivities.find((x) => x.activityId === a.id);
            if (!answer || answer.completed === null) return null;
            return {
              question: a.dailyQuestion || a.description,
              answered: answer.completed,
              concern: answer.concern,
              comment: answer.comment ? scrubFreeText(answer.comment, offMachine) : null
            };
          })
          .filter((a): a is NonNullable<typeof a> => a !== null)
      };
    });

    outcomeComments = [
      ...documented.map((d) => d.comment ?? ''),
      ...answeredActivities.map((a) => a.comment ?? '')
    ].filter(Boolean);

    userMessage = buildDraftUserMessage({
      residentName: outboundName,
      pronouns: resident.pronouns,
      shiftLabel,
      hasConcern: shiftHasConcern(template.schema, note.structuredData),
      selections,
      prompts: template.schema.prompts.map((p) => interpolate(p, outboundCtx)),
      outcomes: outcomeInput
    });
  }

  // Fail closed: if scrubbing regressed and an identifier is still in the
  // payload, do not send it.
  const residual = findResidualIdentifiers(
    userMessage,
    [resident.firstName, resident.preferredName, resident.lastName, resident.medicaidId],
    offMachine
  );
  if (residual.length > 0) {
    console.error('[ai] blocked outbound payload containing identifiers', residual.length);
    return NextResponse.json(
      { error: 'Could not prepare this request safely. Please write the note manually.' },
      { status: 500 }
    );
  }

  const result = await provider.generate(SYSTEM_PROMPT, userMessage);

  // Record every call, successful or not. Transparency about AI assistance is
  // protective in an audit.
  const admin = createSupabaseAdminClient();
  const logGeneration = (unsupported: string[], refused: boolean) =>
    admin
      .from('ai_generations')
      .insert({
        org_id: note.orgId,
        note_id: note.id,
        actor_id: session.profile.id,
        mode,
        model: result.model,
        deidentified,
        input_tokens: result.ok ? result.usage.inputTokens : null,
        output_tokens: result.ok ? result.usage.outputTokens : null,
        cache_read_tokens: result.ok ? result.usage.cacheReadTokens : null,
        unsupported_claims: unsupported,
        refused
      })
      .then(undefined, (err: unknown) => console.error('[ai] could not log generation', err));

  if (!result.ok) {
    await logGeneration([], result.reason === 'refusal');
    // 503 for "the model isn't running" so the client can tell a setup problem
    // from a model that answered badly.
    const status = result.reason === 'unavailable' ? 503 : 502;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }

  const hasConcern = shiftHasConcern(template.schema, note.structuredData);

  // The closing sentence is determined by the data, not by the model. Setting
  // it here rather than instructing the model turns an unreliable instruction
  // into a guarantee — a local 9B produced it on its own only about a third of
  // the time. Training examples get the same treatment (never a concern).
  const narrative = finalizeNarrative(
    rehydrate(result.draft.narrative),
    mode === 'example' ? false : hasConcern
  );

  // Deterministic grounding checks over the finished text. The model's own
  // unsupported_claims is one signal among several, not the only one.
  const findings =
    mode === 'draft_assist'
      ? [
          ...checkGrounding({
            schema: template.schema,
            data: note.structuredData,
            narrative,
            modelReported: result.draft.unsupported_claims ?? [],
            residentName: displayName(resident),
            // Outcome comments are recorded input too — the guard cannot see
            // them in structuredData, and without this it flags the DSP's own
            // words back at them.
            extraRecordedText: outcomeComments
          }),
          ...checkClosingSentence(narrative, hasConcern)
        ]
      : [];

  const unsupported = findings.map((f) => f.detail);
  await logGeneration(unsupported, false);

  // Counted only now, after a draft actually came back. A model error must not
  // burn a free generation the agency never received.
  await recordGeneration(session.profile.orgId);

  // Mark the note as AI-assisted. Saving the narrative itself stays with the
  // DSP's autosave, so nothing is written to the record they have not seen.
  const supabase = await createSupabaseServerClient();
  await supabase
    .from('notes')
    .update({ ai_assisted: true, ai_mode: mode })
    .eq('id', note.id);

  await logAccess(supabase, req, `ai.${mode}`, 'note', note.id, {
    provider: provider.name,
    model: result.model,
    deidentified,
    unsupported_count: unsupported.length
  });

  return NextResponse.json({
    narrative,
    unsupportedClaims: unsupported,
    deidentified,
    provider: provider.name,
    model: result.model,
    elapsedSeconds: result.usage.elapsedSeconds
  });
}
