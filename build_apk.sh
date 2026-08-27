#!/bin/sh
# Build the sideloadable test APK.
#
#   ./build_apk.sh v2     ->  worklog-debug.apk         (the shipping app, dist-v2/)
#   ./build_apk.sh        ->  worklog-frozen-debug.apk  (the frozen original, dist/)
#
# The shipping APK carries no version in its name on purpose: this app has never
# been released, so the first build that goes out to workers is version 1, not
# v2. 'v2' is a development lineage inside this repo, not something a worker
# should ever read. The frozen original's APK is named so it can never overwrite
# the shipping one — a stale build silently replacing the real one is exactly
# the trap this repo keeps writing down.
#
# Runs build.py first, copies the built site into the APK's assets, then builds
# with the Gradle already cached by Android Studio. Debug-signed with
# ~/.android/debug.keystore — fine for sideloading and testing, not for the
# Play Store (see DEPLOY.md for the TWA route once the app is hosted).
#
# Both variants carry the same applicationId, so installing one upgrades the
# other in place and the WebView's localStorage survives — which is what makes
# v2's v1->v2 record migration run on a real phone.
set -e
cd "$(dirname "$0")"

if [ "$1" = "v2" ]; then
  SRC=dist-v2
  OUT=worklog-debug.apk
else
  SRC=dist
  OUT=worklog-frozen-debug.apk
fi

# web icons and the Android launcher bitmaps, both from pwa/icon-source.png
python3 pwa/make_icons.py

python3 build.py $1

rm -rf android/app/src/main/assets/www
mkdir -p android/app/src/main/assets/www
cp $SRC/index.html $SRC/manifest.webmanifest $SRC/sw.js $SRC/icon-*.png \
   android/app/src/main/assets/www/

GRADLE=$(ls -d "$HOME"/.gradle/wrapper/dists/gradle-*/*/gradle-*/bin/gradle 2>/dev/null | tail -1)
if [ -z "$GRADLE" ]; then
  echo "No Gradle found. Open the android/ folder in Android Studio once, or install Gradle." >&2
  exit 1
fi

( cd android && "$GRADLE" --no-daemon assembleDebug )

cp android/app/build/outputs/apk/debug/app-debug.apk "$OUT"
echo
echo "$OUT  $(wc -c < "$OUT") bytes"
"$HOME"/Library/Android/sdk/build-tools/*/apksigner verify --print-certs "$OUT" 2>/dev/null | head -2 || true
