import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { parseRoster } from '@/lib/residents/import';
import { aiParseRoster } from '@/lib/residents/ai-parse';

const Body = z.object({
  text: z.string().min(1).max(20_000),
  /** Set once the supervisor has agreed to send the text to the model. */
  allowAi: z.boolean().default(false)
});

/**
 * Read a pasted roster.
 *
 * The deterministic parser runs first, every time. It is instant, free, and
 * gives the same answer twice — properties worth having when the output becomes
 * a chart. Only when it finds nothing usable is the assistant offered, and only
 * with the supervisor's say-so, because a roster is PHI and the names are the
 * payload rather than something that can be stripped.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can import residents.' },
      { status: 403 }
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Nothing to read.' }, { status: 400 });

  const plain = parseRoster(parsed.data.text);

  // Good enough when it found people and did not choke on the header.
  if (plain.residents.length > 0) {
    return NextResponse.json({ ...plain, usedAi: false, costCents: 0 });
  }

  if (!parsed.data.allowAi) {
    return NextResponse.json({
      ...plain,
      usedAi: false,
      costCents: 0,
      needsAi: true,
      aiHint:
        'This does not look like a spreadsheet. The assistant can read it — it will be sent to the note-assistant provider to do that.'
    });
  }

  const ai = await aiParseRoster(parsed.data.text);
  if ('error' in ai) return NextResponse.json({ error: ai.error }, { status: 422 });

  return NextResponse.json(ai);
}
