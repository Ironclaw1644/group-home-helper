/**
 * Load `.env.local` the way Next does.
 *
 * Standalone scripts get no automatic env loading, so without this a script
 * reports a provider as unconfigured on a machine where the key is sitting in
 * the file right next to it. That has now cost two debugging detours; hence one
 * shared copy rather than a per-script one.
 *
 * Real environment variables win, so `FOO=bar npm run x` still overrides.
 */
import fs from 'node:fs';
import path from 'node:path';

export function loadEnv(): void {
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
