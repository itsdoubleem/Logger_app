#!/bin/sh
# Build the sideloadable test APK.
#
#   ./build_apk.sh v2       ->  worklog-debug.apk         (sideload, dist-v2/)
#   ./build_apk.sh          ->  worklog-frozen-debug.apk  (the frozen original, dist/)
#   ./build_apk.sh release  ->  worklog-release.apk       (release APK, dist-v2/)
#   ./build_apk.sh bundle   ->  worklog-release.aab       (what the Play Store takes)
#
# release and bundle are signed only if android/keystore.properties (or the
# WORKLOG_STORE_* environment variables) point at your upload key. Without it
# they still build, unsigned, and this script says so — an unsigned artifact
# cannot be uploaded. See android/keystore.properties.example.
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

# MODE tells build.py which source to unpack ('' = the frozen original).
case "$1" in
  release) SRC=dist-v2; MODE=v2; OUT=worklog-release.apk; TASK=assembleRelease
           ART=android/app/build/outputs/apk/release/app-release.apk
           UNSIGNED=android/app/build/outputs/apk/release/app-release-unsigned.apk ;;
  bundle)  SRC=dist-v2; MODE=v2; OUT=worklog-release.aab; TASK=bundleRelease
           ART=android/app/build/outputs/bundle/release/app-release.aab
           UNSIGNED= ;;
  v2)      SRC=dist-v2; MODE=v2; OUT=worklog-debug.apk; TASK=assembleDebug
           ART=android/app/build/outputs/apk/debug/app-debug.apk; UNSIGNED= ;;
  '')      SRC=dist;    MODE='';  OUT=worklog-frozen-debug.apk; TASK=assembleDebug
           ART=android/app/build/outputs/apk/debug/app-debug.apk; UNSIGNED= ;;
  *)       echo "unknown mode: $1  (use v2 | release | bundle | no argument)" >&2; exit 1 ;;
esac

# web icons and the Android launcher bitmaps, both drawn by pwa/make_icons.py
python3 pwa/make_icons.py

python3 build.py $MODE

rm -rf android/app/src/main/assets/www
mkdir -p android/app/src/main/assets/www
cp $SRC/index.html $SRC/manifest.webmanifest $SRC/sw.js $SRC/icon-*.png \
   android/app/src/main/assets/www/

GRADLE=$(ls -d "$HOME"/.gradle/wrapper/dists/gradle-*/*/gradle-*/bin/gradle 2>/dev/null | tail -1)
if [ -z "$GRADLE" ]; then
  echo "No Gradle found. Open the android/ folder in Android Studio once, or install Gradle." >&2
  exit 1
fi

( cd android && "$GRADLE" --no-daemon "$TASK" )

# An unsigned release lands under a different name than a signed one, so look
# for both rather than reporting "build ok" over a missing file.
if [ -f "$ART" ]; then
  cp "$ART" "$OUT"
elif [ -n "$UNSIGNED" ] && [ -f "$UNSIGNED" ]; then
  cp "$UNSIGNED" "$OUT"
else
  echo "gradle finished but no artifact at $ART" >&2
  exit 1
fi

echo
echo "$OUT  $(wc -c < "$OUT") bytes"

APKSIGNER=$(ls "$HOME"/Library/Android/sdk/build-tools/*/apksigner 2>/dev/null | tail -1)
case "$1" in
  bundle)
    # An .aab is a zip, not an APK — apksigner cannot read it. Play re-signs the
    # app itself; what matters is that the bundle carries YOUR upload signature.
    if unzip -l "$OUT" 2>/dev/null | grep -q 'META-INF/.*\.RSA\|META-INF/.*\.EC'; then
      echo "signed with your upload key — ready to upload"
    else
      echo
      echo "!! UNSIGNED — the Play Store will refuse this file."
      echo "   Point android/keystore.properties at your upload key and build again."
      echo "   See android/keystore.properties.example."
    fi ;;
  release)
    if [ -n "$APKSIGNER" ] && "$APKSIGNER" verify --print-certs "$OUT" >/dev/null 2>&1; then
      "$APKSIGNER" verify --print-certs "$OUT" 2>/dev/null | head -2
    else
      echo
      echo "!! UNSIGNED — this cannot be installed or uploaded as-is."
      echo "   Point android/keystore.properties at your upload key and build again."
      echo "   See android/keystore.properties.example."
    fi ;;
  *)
    [ -n "$APKSIGNER" ] && "$APKSIGNER" verify --print-certs "$OUT" 2>/dev/null | head -2 || true ;;
esac
