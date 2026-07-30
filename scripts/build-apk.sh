#!/usr/bin/env bash
#
# Build the sideloadable Android APK.
#
#   GHH_SERVER_URL=http://192.168.1.40:3000 npm run apk
#
# Capacitor 8 requires JDK 21 — JDK 17 fails with "invalid source release: 21",
# which is why this pins the version rather than trusting whatever `java` is on
# PATH. Both toolchains install via Homebrew:
#
#   brew install openjdk@21
#   brew install --cask android-commandlinetools
#   sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
#
set -euo pipefail

find_java() {
  for candidate in \
    "${JAVA_HOME:-}" \
    /opt/homebrew/opt/openjdk@21 \
    /usr/local/opt/openjdk@21 \
    "$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
  do
    if [ -n "$candidate" ] && [ -x "$candidate/bin/javac" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

find_sdk() {
  for candidate in \
    "${ANDROID_HOME:-}" \
    "${ANDROID_SDK_ROOT:-}" \
    /opt/homebrew/share/android-commandlinetools \
    "$HOME/Library/Android/sdk"
  do
    if [ -n "$candidate" ] && [ -d "$candidate/platform-tools" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

if ! JAVA_HOME="$(find_java)"; then
  echo "error: JDK 21 not found. Install it with: brew install openjdk@21" >&2
  exit 1
fi

if ! ANDROID_HOME="$(find_sdk)"; then
  echo "error: Android SDK not found. Install it with:" >&2
  echo "  brew install --cask android-commandlinetools" >&2
  echo "  sdkmanager 'platform-tools' 'platforms;android-36' 'build-tools;36.0.0'" >&2
  exit 1
fi

export JAVA_HOME
export ANDROID_HOME
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$PATH"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_URL="${GHH_SERVER_URL:-http://192.168.1.40:3000}"

echo "JDK:        $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"
echo "SDK:        $ANDROID_HOME"
echo "Server URL: $SERVER_URL"
echo

# Gradle needs this to locate the SDK; regenerated each run so a moved SDK
# does not leave a stale path behind.
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > "$ROOT/android/local.properties"

echo "Syncing Capacitor…"
( cd "$ROOT" && GHH_SERVER_URL="$SERVER_URL" npx cap sync android )

echo
echo "Building…"
( cd "$ROOT/android" && ./gradlew assembleDebug --no-daemon )

APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK" ]; then
  echo "error: build reported success but no APK at $APK" >&2
  exit 1
fi

echo
echo "APK: $APK"
du -h "$APK" | awk '{print "Size: "$1}'
echo
echo "Install by hosting the file and opening it on the phone, or over USB:"
echo "  $ANDROID_HOME/platform-tools/adb install -r \"$APK\""
