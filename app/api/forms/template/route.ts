import { NextResponse } from 'next/server';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logAccess } from '@/lib/audit';
import { normalizeEditable } from '@/lib/importer/editable';
import { saveConfirmedForm, useStandardForm } from '@/lib/importer/templates';

export const runtime = 'nodejs';

/**
 * Confirm a reviewed form. This is the human sign-off: nothing the model read
 * becomes a template until an admin has looked at the filled-in preview and
 * tapped Confirm, and the row records who did it and when.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can change the form.' },
      { status: 403 }
    );
  }

  const body = (await req.json().catch(() => null)) as { form?: unknown; model?: unknown } | null;
  const normalized = normalizeEditable(body?.form);
  if (!normalized.ok) return NextResponse.json({ error: normalized.errors.join(' ') }, { status: 400 });

  const saved = await saveConfirmedForm({
    orgId: session.profile.orgId,
    form: normalized.form,
    confirmedBy: { id: session.profile.id, name: session.profile.fullName },
    model: typeof body?.model === 'string' ? body.model.slice(0, 60) : null
  });

  const supabase = await createSupabaseServerClient();
  await logAccess(supabase, req, 'form.confirm', 'form_template', saved.id, {
    version: saved.version,
    prompts: normalized.form.prompts.length,
    fields: normalized.form.fields.length
  });

  return NextResponse.json({ ok: true, ...saved });
}

/** Go back to the standard form. Signed notes keep the form they were signed on. */
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can change the form.' },
      { status: 403 }
    );
  }
  await useStandardForm(session.profile.orgId);
  const supabase = await createSupabaseServerClient();
  await logAccess(supabase, req, 'form.use_standard', 'form_template', null, {});
  return NextResponse.json({ ok: true });
}
