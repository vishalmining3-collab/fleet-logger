#!/usr/bin/env bash
# =============================================================================
# Build the production Android APK that points at the deployed Render backend.
#
# Usage:
#   npm run build:apk                    # uses default https://fleet-logger.onrender.com
#   VITE_API_BASE_URL=https://my-api.onrender.com npm run build:apk
#   npm run build:apk:dev                # uses http://10.0.2.2:3000 (for emulator w/ dev server)
#
# Output:
#   android/app/build/outputs/apk/debug/app-debug.apk
#
# Notes:
#   - This is a defensively-idempotent script — running it twice is safe.
#   - Requires: Node 20+, JDK 17, Android SDK platform-tools + build-tools,
#     Capacitor CLI. See DEPLOY.md section "Tools" for setup.
#   - VITE_API_BASE_URL is a build-time variable. Rebuild required for changes.
# =============================================================================
set -euo pipefail

API_URL="${VITE_API_BASE_URL:-https://fleet-logger.onrender.com}"

# Strip trailing slash, just in case.
API_URL="${API_URL%/}"

echo "==> Building APK with VITE_API_BASE_URL=${API_URL}"

# 1. Web build (Vite — picks up VITE_API_BASE_URL).
echo ""
echo "---- [1/4] vite build ----"
npm run build

# 2. Sync web bundle into the Android project.
echo ""
echo "---- [2/4] cap sync android ----"
npx cap sync android

# 3. Build the Android APK.
echo ""
echo "---- [3/4] gradle assembleDebug ----"
(
  cd android
  ./gradlew assembleDebug
)

# 4. Done. Print path + install hint.
echo ""
echo "---- [4/4] done ----"
APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
echo ""
echo "✓ APK ready: $APK_PATH ($APK_SIZE)"
echo "  Backend URL embedded: $API_URL"
echo ""
echo "Install on a connected device:"
echo "  adb install -r $APK_PATH"
echo ""
echo "To share with the client without USB, copy that file via Drive/WhatsApp/etc."
echo "When they tap it, Android will prompt to install from unknown sources (one-time)."
