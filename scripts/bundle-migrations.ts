/**
 * Compile db/migrations/*.sql into a TypeScript module.
 *
 *   npm run db:bundle
 *
 * The packaged desktop app has no reliable filesystem path to the migration
 * directory, so they travel as source. Run this after editing any .sql file;
 * `npm run build` runs it first.
 */
import fs from 'node:fs';
import path from 'node:path';

const SOURCE = path.join(process.cwd(), 'db', 'migrations');
const OUTPUT = path.join(process.cwd(), 'lib', 'db', 'migrations.generated.ts');

function main() {
  const files = fs
    .readdirSync(SOURCE)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.error(`No .sql files found in ${SOURCE}`);
    process.exit(1);
  }

  const entries = files.map((file) => {
    const sql = fs.readFileSync(path.join(SOURCE, file), 'utf8');
    // Backticks and ${ would break the template literal; SQL uses neither, but
    // escape rather than trust that.
    const escaped = sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    return `  {\n    name: ${JSON.stringify(file)},\n    sql: \`${escaped}\`\n  }`;
  });

  const output = `// GENERATED FILE — do not edit.
// Source: db/migrations/*.sql
// Regenerate with: npm run db:bundle

export type Migration = { name: string; sql: string };

export const MIGRATIONS: Migration[] = [
${entries.join(',\n')}
];
`;

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, output);
  console.log(`Bundled ${files.length} migration(s) -> ${path.relative(process.cwd(), OUTPUT)}`);
  for (const f of files) console.log(`  ${f}`);
}

main();
