/**
 * Android app release metadata.
 *
 * The APK is a thin shell around this server, so almost every change ships by
 * deploying — staff get it the next time they open the app, with no re-install.
 * Bump `APK_VERSION` only when the *shell* itself has to change:
 *
 *   - the server URL it points at
 *   - the app name, icon, or package id
 *   - native permissions
 *   - the Capacitor major version
 *
 * The installed app reports its own version, so /download can tell a DSP
 * whether theirs is current instead of making them guess.
 */

export const APK_VERSION = '1.0.0';

/** What changed in the shell, newest first. Shown on the download page. */
export const APK_CHANGELOG: Array<{ version: string; date: string; notes: string }> = [
  {
    version: '1.0.0',
    date: '2026-07-29',
    notes: 'First release.'
  }
];

// Named for the product. This was `ahfs-daily-notes-1.0.0.apk`, so every DSP
// installing the Android app from the public download page got a file named
// after one particular customer -- including staff at every other agency.
export const APK_FILENAME = `flipbrief-${APK_VERSION}.apk`;

/**
 * Where the file is served from.
 *
 * Kept in `public/` rather than a release asset so the download works from the
 * same origin as the app — one address for staff to remember, and no dependency
 * on GitHub being reachable from a group home's network.
 */
export const APK_PATH = `/apk/${APK_FILENAME}`;
