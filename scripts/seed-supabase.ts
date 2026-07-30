/**
 * Seed the ghh schema in Supabase.
 *
 *   npm run db:seed
 *
 * Reads the org/home/shift/resident rows and the Form #680 template out of
 * supabase/migrations/0004_seed_680.sql so that file stays the single source of
 * truth — the template JSON is large enough that hand-copying it into a
 * migration call would be a real transcription risk.
 *
 * Idempotent: every write is an upsert on a fixed UUID, so re-running after
 * editing the template updates it in place.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SEED_FILE = path.join(process.cwd(), 'supabase', 'migrations', '0004_seed_680.sql');

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const HOME_ID = '00000000-0000-0000-0000-000000000010';
const SHIFT_DAY_ID = '00000000-0000-0000-0000-000000000020';
const SHIFT_NIGHT_ID = '00000000-0000-0000-0000-000000000021';
const DEMO_RESIDENT_ID = '00000000-0000-0000-0000-000000000030';
const TEMPLATE_ID = '00000000-0000-0000-0000-000000000100';

function loadEnv() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    if (!process.env[key]) process.env[key] = line.slice(i + 1).trim();
  }
}

/** Pull a `$tag$ ... $tag$` dollar-quoted block out of the SQL. */
function extractDollarQuoted(sql: string, tag: string): unknown {
  const open = `$${tag}$`;
  const start = sql.indexOf(open);
  if (start === -1) throw new Error(`Could not find $${tag}$ block in the seed file`);
  const from = start + open.length;
  const end = sql.indexOf(open, from);
  if (end === -1) throw new Error(`Unterminated $${tag}$ block in the seed file`);

  const body = sql.slice(from, end).trim();
  try {
    return JSON.parse(body);
  } catch (err) {
    throw new Error(
      `The $${tag}$ block is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or a Supabase secret key in .env.local');
    process.exit(1);
  }

  const sql = fs.readFileSync(SEED_FILE, 'utf8');
  const schema = extractDollarQuoted(sql, 'json') as {
    prompts: string[];
    sections: Array<{ key: string; fields: unknown[] }>;
  };
  const renderConfig = extractDollarQuoted(sql, 'render');

  console.log(
    `Parsed template: ${schema.prompts.length} prompts, ${schema.sections.length} sections, ` +
      `${schema.sections.reduce((n, s) => n + s.fields.length, 0)} fields`
  );

  const db = createClient(url, key, {
    db: { schema: 'ghh' },
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // PostgREST query builders are thenable but not Promise instances, so the
  // parameter is typed as PromiseLike rather than Promise.
  const step = async (label: string, fn: () => PromiseLike<{ error: unknown }>) => {
    const { error } = await fn();
    if (error) {
      const message =
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message: unknown }).message)
          : String(error);
      console.error(`  FAIL ${label}: ${message}`);
      process.exitCode = 1;
      return false;
    }
    console.log(`  ok   ${label}`);
    return true;
  };

  console.log('\nSeeding:');

  await step('organization', () =>
    db.from('organizations').upsert({
      id: ORG_ID,
      name: 'At Home Family Services',
      legal_name: 'At Home Family Service, LLC',
      timezone: 'America/New_York',
      // Matches the palette the brand scanner recovers from their live site.
      branding: {
        navy: '#0f2d45',
        teal: '#0c9ea6',
        aqua: '#6fe2df',
        sand: '#f5f1ea',
        slate: '#536779',
        logo_url: '/brand/AHFS_logo.png'
      }
    })
  );

  await step('home', () =>
    db.from('homes').upsert({ id: HOME_ID, org_id: ORG_ID, name: 'Main House' })
  );

  // Inferred from the scanned form, which shows 7AM-7PM. CONFIRM WITH CLIENT.
  await step('shifts', () =>
    db.from('shifts').upsert([
      {
        id: SHIFT_DAY_ID,
        org_id: ORG_ID,
        home_id: HOME_ID,
        label: '7AM-7PM',
        start_time: '07:00',
        end_time: '19:00',
        crosses_midnight: false,
        sort_order: 1
      },
      {
        id: SHIFT_NIGHT_ID,
        org_id: ORG_ID,
        home_id: HOME_ID,
        label: '7PM-7AM',
        start_time: '19:00',
        end_time: '07:00',
        crosses_midnight: true,
        sort_order: 2
      }
    ])
  );

  // Fictional. Training examples are written about this resident, and are
  // excluded from billing exports because no service was delivered.
  await step('demo resident', () =>
    db.from('residents').upsert({
      id: DEMO_RESIDENT_ID,
      org_id: ORG_ID,
      home_id: HOME_ID,
      first_name: 'Alex',
      last_name: 'Sample',
      medicaid_id_demo: '100000000000',
      pronoun_subject: 'he',
      pronoun_object: 'him',
      pronoun_possessive: 'his',
      is_demo: true
    })
  );

  await step('Form #680 template', () =>
    db.from('form_templates').upsert({
      id: TEMPLATE_ID,
      org_id: null, // global — available to every organization
      key: 'daily_progress_note_680',
      version: 1,
      name: 'Daily Progress Note',
      form_number: '680',
      schema,
      render_config: renderConfig,
      active: true
    })
  );

  // Read back through the same client to confirm the rows are really there.
  const { data: check } = await db
    .from('form_templates')
    .select('form_number, schema')
    .eq('id', TEMPLATE_ID)
    .maybeSingle();

  const sectionCount = (check?.schema as { sections?: unknown[] })?.sections?.length ?? 0;
  console.log(
    `\nVerified: Form #${check?.form_number} stored with ${sectionCount} sections.\n`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
