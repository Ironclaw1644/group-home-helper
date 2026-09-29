import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logAccess } from '@/lib/audit';
import { extractForms, IMPORTER_MODEL } from '@/lib/importer/model';
import { buildDraftTemplates, type FormNumberRegistry } from '@/lib/importer/template-draft';
import { toEditable } from '@/lib/importer/editable';
import { signFormNumber } from '@/lib/importer/form-number-proof';
import { getStandardTemplateForOrg } from '@/lib/importer/templates';
import registryJson from '@/docs/golden/form-number-registry.json';

export const runtime = 'nodejs';
// Opus reads three pages in about 20 s; give a slow upload and one retry room.
export const maxDuration = 120;

/**
 * Read an agency's BLANK form.
 *
 * A blank form carries no information about anyone, which is why this may go
 * to a hosted model with no BAA in place. The screen says so, and asks for a
 * blank copy; this route cannot tell a blank page from a filled one, so it
 * does not claim to. Nothing here is stored: the model's reading comes back as
 * an editable draft, and only a human's Confirm (POST /api/forms/template)
 * turns it into a template.
 */

// Vercel refuses request bodies over 4.5 MB. The client downscales photos to
// well under this; the cap is here so an oversized PDF gets a sentence, not a 413.
const MAX_BASE64_CHARS = 4_200_000;

const Body = z.object({
  pages: z
    .array(
      z.object({
        mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']),
        base64: z.string().min(100).regex(/^[A-Za-z0-9+/=]+$/)
      })
    )
    .min(1)
    .max(10)
});

const registry = registryJson as unknown as FormNumberRegistry;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can change the form.' },
      { status: 403 }
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Add a photo or PDF of the form first.' }, { status: 400 });
  }
  const { pages } = parsed.data;

  const total = pages.reduce((n, p) => n + p.base64.length, 0);
  if (total > MAX_BASE64_CHARS) {
    return NextResponse.json(
      {
        error:
          'Those pages are too large to send together. Take photos of the pages instead, or send fewer at once.',
        reason: 'too_large'
      },
      { status: 413 }
    );
  }
  if (pages.filter((p) => p.mediaType === 'application/pdf').length > 1) {
    return NextResponse.json({ error: 'Send one PDF at a time.' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error: 'Reading forms is not switched on for this workspace yet. Your standard form still works.',
        reason: 'unavailable'
      },
      { status: 503 }
    );
  }

  const base = await getStandardTemplateForOrg(session.profile.orgId);

  let extraction;
  try {
    extraction = await extractForms(pages);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[importer] extraction failed', message);
    const unreadable = /refus|no parsed output/i.test(message);
    return NextResponse.json(
      {
        error: unreadable
          ? 'We could not find a form on those pages. Try again with the whole page in frame, flat, in good light.'
          : 'Reading the form took too long or failed. Nothing was saved — try again.',
        reason: unreadable ? 'unreadable' : 'error'
      },
      { status: unreadable ? 422 : 502 }
    );
  }

  const drafts = buildDraftTemplates(extraction.raw, { orgId: session.profile.orgId, registry });
  if (drafts.length === 0) {
    return NextResponse.json(
      {
        error: 'We could not find a form on those pages. Try again with the whole page in frame.',
        reason: 'unreadable'
      },
      { status: 422 }
    );
  }

  const forms = drafts.map((d) => {
    const form = toEditable(d, base.schema.signature.attestation);
    return { ...form, formNumberProof: signFormNumber(session.profile.orgId, form.formNumber) };
  });

  // The narrative note is what FlipBrief writes. Suggest the first form that
  // is not a log or time sheet, with the most questions.
  const suggested = forms
    .map((f, i) => ({ i, score: (f.isLogOrTable ? 0 : 100) + f.prompts.length }))
    .sort((a, b) => b.score - a.score)[0].i;

  const supabase = await createSupabaseServerClient();
  await logAccess(supabase, req, 'form.import_read', 'form_template', null, {
    model: extraction.usage.model,
    pages: pages.length,
    forms_found: forms.length,
    input_tokens: extraction.usage.inputTokens,
    output_tokens: extraction.usage.outputTokens,
    seconds: extraction.usage.elapsedSeconds
  });

  return NextResponse.json({
    forms,
    suggested,
    model: IMPORTER_MODEL,
    seconds: extraction.usage.elapsedSeconds
  });
}
