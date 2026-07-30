import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getProvider } from '@/lib/ai/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Is note drafting available right now?
 *
 * With the local provider the usual failure is mundane — Ollama not running,
 * or the model not pulled yet — and the fix is a one-line command. Surfacing
 * that directly beats making an operator read server logs.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const provider = await getProvider();
  const health = await provider.health();

  return NextResponse.json({
    ok: health.ok,
    detail: health.detail,
    provider: provider.name,
    model: provider.model,
    sendsDataOffMachine: provider.sendsDataOffMachine
  });
}
