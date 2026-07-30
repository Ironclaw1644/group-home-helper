import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createResident, findPossibleDuplicate } from '@/lib/residents/repo';
import { logAccess } from '@/lib/audit';

/**
 * Bulk-create residents from a reviewed import.
 *
 * The client sends rows it has already shown the supervisor, not raw CSV — the
 * parse happens in the browser so nothing is written before a human has seen
 * what the file was understood to mean.
 *
 * Rows are inserted one at a time and reported individually. A partial import
 * is the right outcome here: if row 14 has a bad date, rows 1-13 are still
 * correct people who belong on the roster, and failing the batch would make the
 * supervisor re-check all of them.
 */

const Row = z.object({
  rowNumber: z.number().int().nonnegative(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  preferredName: z.string().trim().max(80).nullable(),
  room: z.string().trim().max(40).nullable(),
  grouping: z.string().trim().max(60).nullable(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  pronouns: z.object({
    subject: z.string().min(1).max(12),
    object: z.string().min(1).max(12),
    possessive: z.string().min(1).max(12)
  }),
  medicaidId: z.string().trim().max(40).nullable()
});

const ImportBody = z.object({
  homeId: z.string().uuid(),
  rows: z.array(Row).min(1).max(500),
  /** Import rows whose name already exists in this home. */
  allowDuplicates: z.boolean().default(false)
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can import residents.' },
      { status: 403 }
    );
  }

  const parsed = ImportBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'The import could not be read.' },
      { status: 400 }
    );
  }

  const { homeId, rows, allowDuplicates } = parsed.data;

  const created: Array<{ rowNumber: number; id: string; name: string }> = [];
  const skipped: Array<{ rowNumber: number; name: string; reason: string }> = [];

  for (const row of rows) {
    const name = `${row.firstName} ${row.lastName}`;

    if (!allowDuplicates) {
      const existing = await findPossibleDuplicate(homeId, row.firstName, row.lastName);
      if (existing) {
        skipped.push({ rowNumber: row.rowNumber, name, reason: 'Already on this roster' });
        continue;
      }
    }

    const result = await createResident({ ...row, homeId }, session.profile.orgId);
    if ('error' in result) {
      skipped.push({ rowNumber: row.rowNumber, name, reason: result.error });
      continue;
    }
    created.push({ rowNumber: row.rowNumber, id: result.id, name });
  }

  const supabase = await createSupabaseServerClient();
  await logAccess(supabase, req, 'resident.import', 'resident', null, {
    home_id: homeId,
    created: created.length,
    skipped: skipped.length
  });

  return NextResponse.json({ created, skipped });
}
