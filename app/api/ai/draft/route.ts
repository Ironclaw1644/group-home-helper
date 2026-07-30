import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
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

  // With the default local provider nothing leaves the machine, so names are
  // sent as-is. The hosted provider strips them unless BAAs are in place.
  const provider = await getProvider();
  const offMachine = provider.sendsDataOffMachine;
  const deidentified = deidentifyEnabled(offMachine);

  const { outboundName, rehydrate } = prepareName(resident.firstName, offMachine);
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

    userMessage = buildDraftUserMessage({
      residentName: outboundName,
      pronouns: resident.pronouns,
      shiftLabel,
      hasConcern: shiftHasConcern(template.schema, note.structuredData),
      selections,
      prompts: template.schema.prompts.map((p) => interpolate(p, outboundCtx))
    });
  }

  // Fail closed: if scrubbing regressed and an identifier is still in the
  // payload, do not send it.
  const residual = findResidualIdentifiers(
    userMessage,
    [resident.firstName, resident.lastName, resident.medicaidId],
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
            modelReported: result.draft.unsupported_claims ?? []
          }),
          ...checkClosingSentence(narrative, hasConcern)
        ]
      : [];

  const unsupported = findings.map((f) => f.detail);
  await logGeneration(unsupported, false);

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
