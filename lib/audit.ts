import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Record a PHI access event.
 *
 * Writes to notes and addenda are captured by database triggers. This covers
 * what the database cannot see on its own: reads, PDF renders, exports, and
 * the caller's IP and user agent.
 *
 * Audit logging must never break the operation it is recording, so failures
 * here are swallowed after being surfaced to the server log.
 */
export async function logAccess(
  supabase: SupabaseClient,
  req: Request,
  action: string,
  entity: string,
  entityId?: string | null,
  detail: Record<string, unknown> = {}
): Promise<void> {
  try {
    await supabase.rpc('log_access', {
      p_action: action,
      p_entity: entity,
      p_entity_id: entityId ?? null,
      p_detail: detail,
      p_ip: clientIp(req),
      p_user_agent: req.headers.get('user-agent') ?? null
    });
  } catch (err) {
    console.error('[audit] failed to record', action, entity, entityId, err);
  }
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    // Left-most entry is the original client; the rest are proxies.
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip');
}
