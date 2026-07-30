import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android wrapper for the notes app.
 *
 * The app is server-rendered and needs its API routes, so the APK is a native
 * shell around the running server rather than a bundle of static files. That
 * keeps one codebase and means an update is a server restart, not a re-install
 * on every phone.
 *
 * iOS is deliberately not here. Apple has no free sideloading path — ad-hoc
 * distribution costs $99/year and requires registering each device by UDID,
 * with a profile that expires annually. iPhone users install the PWA instead
 * (Share → Add to Home Screen), which gives the same icon and full-screen
 * behaviour for nothing.
 *
 * Set GHH_SERVER_URL before `npx cap sync` to point the APK at your server:
 *
 *   GHH_SERVER_URL=http://192.168.1.40:3000 npx cap sync android
 */

const serverUrl = process.env.GHH_SERVER_URL || 'http://192.168.1.40:3000';
const isLocalHttp = serverUrl.startsWith('http://');

const config: CapacitorConfig = {
  appId: 'com.athomefamilyservices.notes',
  appName: 'Daily Notes',
  // Capacitor requires this to exist even when loading from a server URL; it
  // holds the fallback page shown if the server cannot be reached.
  webDir: 'capacitor/www',

  server: {
    url: serverUrl,
    // Only needed when the server is plain HTTP on the house LAN. Point
    // GHH_SERVER_URL at an https:// address and this turns itself off.
    cleartext: isLocalHttp,
    androidScheme: 'https'
  },

  android: {
    // The note form posts base64 signature images; the default is comfortably
    // under what that needs, but be explicit.
    allowMixedContent: isLocalHttp,
    captureInput: true,
    webContentsDebuggingEnabled: false
  },

  plugins: {
    // Keep the splash brief — staff open this many times a shift.
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#0f2d45',
      showSpinner: false
    }
  }
};

export default config;
