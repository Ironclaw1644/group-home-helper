import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { retireOutcome, updateOutcome } from '@/lib/outcomes/repo';
import { logAccess } from '@/lib/audit';

const PatchBody = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  statement: z.string().trim().max(2000).nullable().optional(),
  supportStrategies: z.string().trim().max(4000).nullable().optional(),
  measure: z.string().trim().max(2000).nullable().optional(),
  frequency: z.string().trim().max(120).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  active: z.boolean().optional()
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const { id } = await params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the fields and try again.' }, { status: 400 });
  }

  const result = await updateOutcome(id, parsed.data);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  await logAccess(supabase, req, 'outcome.update', 'outcome', id, {
    fields: Object.keys(parsed.data)
  });

  return NextResponse.json({ ok: true });
}

/**
 * Retire rather than delete.
 *
 * Signed notes reference the outcome, and those are permanent records. Deleting
 * it would leave documentation pointing at nothing — which reads to an auditor
 * as a missing plan.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const { id } = await params;
  const result = await retireOutcome(id, new Date().toISOString().slice(0, 10));
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  await logAccess(supabase, req, 'outcome.retire', 'outcome', id, {});

  return NextResponse.json({ ok: true });
}
