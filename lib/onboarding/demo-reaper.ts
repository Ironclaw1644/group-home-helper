import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Remove expired demo sandboxes.
 *
 * Every demo visitor gets their own org, and each one is seeded with a couple
 * of months of realistic history so the product does not look empty — about
 * fifty notes, nearly all of them signed. `expires_at` was set on all of them
 * from the beginning and `ghh.prune_expired_demos()` existed to sweep them up,
 * so on paper this was already handled.
 *
 * It never worked. The function does a plain `delete from ghh.organizations`
 * and relies on the cascade, but the cascade reaches signed notes, and
 * `enforce_note_undeletable` refuses those — correctly, that is the whole point
 * of 0003. So every prune raised, deleted nothing, and demo orgs accumulated:
 * sixteen of them in production, alongside the one real agency, every one of
 * them expired and un-reapable.
 *
 * The fix is not to weaken the trigger. There is already exactly one door
 * through it — `ghh.purge_resident()`, which sets a transaction-local flag
 * naming a single resident, audits before it deletes, and is granted only to
 * service_role. This walks each demo org's residents through that door and
 * then deletes the org, whose remaining children (homes, shifts, profiles,
 * invitations, AI metering) cascade with nothing to object.
 *
 * `audit_log` has no foreign key to `organizations`, so the trail of what the
 * demo did survives the demo. That is deliberate on both counts.
 */

/** A demo org and enough about it to report what was removed. */
export type ReapedOrg = {
  orgId: string;
  name: string;
  residents: number;
  notes: number;
  signedNotes: number;
};

type PurgeResult = {
  notes: number;
  signedNotes: number;
  documentPaths: string[];
  signaturePaths: string[];
};

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * The safety scope for everything in this file.
 *
 * A demo org is one this app created through the demo endpoint: flagged
 * `is_demo`, with an `expires_at`. Nothing here selects an org any other way,
 * and `purgeDemoOrg` re-reads the flag from the database before it acts rather
 * than trusting the id it was handed. At Home Family Services is not `is_demo`
 * and cannot be reached by any path in this module.
 */
async function loadDemoOrg(admin: Admin, orgId: string) {
  const { data } = await admin
    .from('organizations')
    .select('id, name, is_demo, expires_at')
    .eq('id', orgId)
    .eq('is_demo', true)
    .maybeSingle();
  return data;
}

/** Demo orgs whose lifetime has run out. */
export async function listExpiredDemoOrgs(admin: Admin): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await admin
    .from('organizations')
    .select('id, name')
    .eq('is_demo', true)
    .not('expires_at', 'is', null)
    .lt('expires_at', new Date().toISOString());

  if (error) {
    console.error('[demo] could not list expired sandboxes', error.message);
    return [];
  }
  return (data ?? []) as Array<{ id: string; name: string }>;
}

/**
 * Delete one demo org and everything belonging to it.
 *
 * Refuses anything that is not flagged `is_demo` in the database, whatever the
 * caller believes about the id.
 */
export async function purgeDemoOrg(orgId: string): Promise<ReapedOrg | null> {
  const admin = createSupabaseAdminClient();

  const org = await loadDemoOrg(admin, orgId);
  if (!org) {
    console.error('[demo] refusing to purge %s — it is not a demo organization', orgId);
    return null;
  }

  const { data: residents } = await admin.from('residents').select('id').eq('org_id', orgId);

  let notes = 0;
  let signedNotes = 0;
  const documentPaths: string[] = [];
  const signaturePaths: string[] = [];

  for (const resident of residents ?? []) {
    // The one sanctioned way to remove a signed note. It audits the deletion
    // before performing it, on a table nothing can rewrite.
    const { data, error } = await admin.rpc('purge_resident', {
      p_resident_id: resident.id,
      p_actor: null,
      p_ip: null,
      p_user_agent: 'demo-reaper'
    });

    if (error) {
      console.error('[demo] could not purge resident %s: %s', resident.id, error.message);
      // Leave the org in place rather than half-emptying it. It stays expired
      // and the next sweep tries again.
      return null;
    }

    const result = data as PurgeResult;
    notes += result.notes ?? 0;
    signedNotes += result.signedNotes ?? 0;
    documentPaths.push(...(result.documentPaths ?? []));
    signaturePaths.push(...(result.signaturePaths ?? []));
  }

  // With the residents gone there are no signed notes left to object, so the
  // remaining children cascade.
  const { error: deleteError } = await admin
    .from('organizations')
    .delete()
    .eq('id', orgId)
    .eq('is_demo', true);

  if (deleteError) {
    console.error('[demo] could not delete sandbox org %s: %s', orgId, deleteError.message);
    return null;
  }

  await removeFiles(admin, 'ghh-documents', documentPaths);
  await removeFiles(admin, 'ghh-signatures', signaturePaths);
  await removeOrphanedDemoAccounts(admin);

  return {
    orgId,
    name: org.name as string,
    residents: residents?.length ?? 0,
    notes,
    signedNotes
  };
}

/**
 * Sweep every expired sandbox.
 *
 * Called at the start of the demo endpoint, so the cleanup runs on the traffic
 * that creates the mess. That is why sixteen of these piled up: pruning existed
 * as `npm run demo:prune` and nothing ever ran it. A sweep that depends on
 * someone remembering is a sweep that does not happen.
 */
export async function reapExpiredDemos(): Promise<ReapedOrg[]> {
  const admin = createSupabaseAdminClient();
  const expired = await listExpiredDemoOrgs(admin);

  const reaped: ReapedOrg[] = [];
  for (const org of expired) {
    const result = await purgeDemoOrg(org.id);
    if (result) reaped.push(result);
  }
  return reaped;
}

async function removeFiles(admin: Admin, bucket: string, paths: string[]): Promise<void> {
  const wanted = paths.filter(Boolean);
  if (!wanted.length) return;
  const { error } = await admin.storage.from(bucket).remove(wanted);
  // An orphan in a private bucket that nothing links to is worth reporting and
  // not worth failing a cleanup over.
  if (error) console.error('[demo] left files in %s: %s', bucket, error.message);
}

/**
 * Delete the auth accounts whose profile went with the cascade.
 *
 * Matched on the generated `@demo.invalid` address and on having no profile
 * left, so a real customer's account can never be selected here.
 */
async function removeOrphanedDemoAccounts(admin: Admin): Promise<number> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });

  let removed = 0;
  for (const user of data?.users ?? []) {
    if (!user.email?.endsWith('@demo.invalid')) continue;

    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      await admin.auth.admin.deleteUser(user.id).catch(() => {});
      removed++;
    }
  }
  return removed;
}
