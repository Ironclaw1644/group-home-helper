import { NextResponse } from 'next/server';
import { APK_PATH, APK_VERSION } from '@/lib/apk';

export const dynamic = 'force-dynamic';

/**
 * Current Android shell version.
 *
 * The APK is a thin wrapper around this server, so the web app updates itself
 * on every deploy and a stale APK is normally harmless. It only matters when
 * the shell changes — a new server address, a new package id, new native
 * permissions — and in that case a phone running the old shell may be pointing
 * somewhere that no longer exists.
 *
 * Unauthenticated on purpose: it returns a version string and a download path,
 * nothing else, and a phone that cannot reach the app needs to be able to ask.
 */
export async function GET() {
  return NextResponse.json(
    {
      version: APK_VERSION,
      downloadPath: APK_PATH,
      // What the installed shell should compare against. Bumped only when a
      // reinstall is genuinely required.
      minimumSupported: APK_VERSION
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
