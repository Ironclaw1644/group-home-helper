#!/usr/bin/env node
/**
 * Fail when the repository contains a migration whose objects are not in the
 * database.
 *
 * This exists because the same failure landed twice in one day. Both times the
 * code was merged and green — typecheck passed, every suite passed — and both
 * times the schema it depended on was simply absent, because nothing applies
 * migrations automatically and nothing checked. The first cost a silently
 * disabled signing guard; the second broke the demo. In each case the symptom
 * appeared far from the cause, and only a browser test caught it.
 *
 * It deliberately does NOT read supabase_migrations.schema_migrations. That
 * table is bookkeeping, and this project's is incomplete: most early
 * migrations were applied without ever being recorded, so trusting it reports
 * a dozen false alarms and teaches everyone to ignore the check. What matters
 * is not whether a row says a migration ran — it is whether the tables,
 * columns and functions the code calls are actually there.
 *
 *   npm run verify:migrations
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, '..', 'supabase', 'migrations');

function query(sql) {
  const raw = execFileSync('python3', [join(HERE, 'pgquery.py'), '--full', '--sql', sql], {
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024
  });
  return JSON.parse(raw);
}

/**
 * The objects a migration claims to create.
 *
 * Only the four kinds this schema actually uses, and only the forms it writes
 * them in. A parser that tried to be general would be wrong in more
 * interesting ways than one that is narrow and honest about it.
 */
function declaredObjects(sql) {
  // Comments would otherwise contribute phantom objects.
  const body = sql.replace(/--[^\n]*/g, '');
  const created = [];
  const dropped = [];

  /*
   * Statement at a time, not file at a time.
   *
   * Scanning a whole file let the column pattern span two unrelated
   * statements: it paired `alter table ghh.documents` from one with
   * `add column is_platform_owner` from another further down, and reported a
   * column that was never meant to exist. Splitting first makes each match
   * local to the statement that produced it.
   */
  for (const raw of body.split(';')) {
    const s = raw.trim();
    if (!s) continue;

    let m = s.match(/^create\s+table\s+(?:if\s+not\s+exists\s+)?ghh\.([a-z0-9_]+)/i);
    if (m) created.push({ kind: 'table', name: m[1] });

    m = s.match(/^alter\s+table\s+(?:if\s+exists\s+)?ghh\.([a-z0-9_]+)/i);
    if (m) {
      const table = m[1];
      for (const c of s.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi)) {
        created.push({ kind: 'column', name: `${table}.${c[1]}` });
      }
      for (const c of s.matchAll(/drop\s+column\s+(?:if\s+exists\s+)?([a-z0-9_]+)/gi)) {
        dropped.push({ kind: 'column', name: `${table}.${c[1]}` });
      }
    }

    m = s.match(/^create\s+(?:or\s+replace\s+)?function\s+ghh\.([a-z0-9_]+)\s*\(/i);
    if (m) created.push({ kind: 'function', name: m[1] });

    m = s.match(/^drop\s+function\s+(?:if\s+exists\s+)?ghh\.([a-z0-9_]+)/i);
    if (m) dropped.push({ kind: 'function', name: m[1] });

    m = s.match(/^drop\s+table\s+(?:if\s+exists\s+)?ghh\.([a-z0-9_]+)/i);
    if (m) dropped.push({ kind: 'table', name: m[1] });
  }

  return { created, dropped };
}

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.error('no migrations found — is this the right directory?');
  process.exit(1);
}

const tables = new Set(
  query("select table_name from information_schema.tables where table_schema='ghh'").map(
    (r) => r.table_name
  )
);
const columns = new Set(
  query(
    "select table_name || '.' || column_name as c from information_schema.columns where table_schema='ghh'"
  ).map((r) => r.c)
);
const functions = new Set(
  query("select routine_name from information_schema.routines where routine_schema='ghh'").map(
    (r) => r.routine_name
  )
);

const present = { table: tables, column: columns, function: functions };

/*
 * Replay the migrations in order to work out what the schema is *supposed* to
 * look like at the end, rather than judging each file in isolation. Migration
 * 0012 creates prune_expired_demos and 0019 deliberately drops it again; a
 * per-file check calls that a missing object and is wrong.
 */
const expected = new Map();
const perFile = new Map();

for (const file of files) {
  const { created, dropped } = declaredObjects(readFileSync(join(MIGRATIONS, file), 'utf8'));
  perFile.set(file, created);
  for (const o of created) expected.set(`${o.kind}:${o.name}`, { ...o, from: file });
  for (const o of dropped) expected.delete(`${o.kind}:${o.name}`);
}

const missingByFile = new Map();
for (const o of expected.values()) {
  if (!present[o.kind].has(o.name)) {
    if (!missingByFile.has(o.from)) missingByFile.set(o.from, []);
    missingByFile.get(o.from).push(o);
  }
}

let missingTotal = 0;

for (const file of files) {
  const declared = perFile.get(file) ?? [];
  const missing = missingByFile.get(file) ?? [];

  if (declared.length === 0) {
    // Seed data, policy-only and grant-only migrations declare nothing this
    // check can see. Say so rather than implying they were verified.
    console.log(`  --    ${file}  (no table/column/function to check)`);
    continue;
  }

  if (missing.length === 0) {
    console.log(`  ok    ${file}  (${declared.length} object${declared.length === 1 ? '' : 's'})`);
  } else {
    missingTotal += missing.length;
    console.log(`  FAIL  ${file}`);
    for (const o of missing) console.log(`          absent: ${o.kind} ${o.name}`);
  }
}

console.log();
if (missingTotal === 0) {
  console.log('Every object the migrations declare is present in the database.');
  process.exit(0);
}

console.error(`${missingTotal} declared object(s) are missing from the database.`);
console.error('Apply the migrations before deploying — the code will call schema that is not there.');
process.exit(1);
