import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser client. Runs under RLS as the signed-in user, so it can read the
 * roster and autosave drafts, but it can never reach another home's residents
 * or edit a signed note.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase browser client is not configured');
  }
  return createBrowserClient(url, key, { db: { schema: 'ghh' } });
}
