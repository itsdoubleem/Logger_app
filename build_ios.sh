#!/bin/sh
# Build the iOS app and put it on the simulator.
#
#   ./build_ios.sh                 -> build, install on the booted simulator, launch
#   ./build_ios.sh build           -> build only
#   ./build_ios.sh "iPhone 17"     -> boot that simulator first, then install
#
# The iOS counterpart of build_apk.sh, and it works the same way: build.py
# produces the site, this copies it into the app bundle, then xcodebuild.
# ios/WorkLog/www is a folder reference in the project, so whatever is in it
# ships -- the same "delete your scratch pages first" rule as dist-v2/.
#
# Same applicationId as the APK (app.worklog.punch). It is a different platform
# and a different store listing; nothing is shared between them but the name.
#
# For a real iPhone rather than the simulator, open ios/WorkLog.xcodeproj, set
# your team under Signing & Capabilities, and Run. The only device-specific
# thing in the project is the signature; see DEPLOY.md.
set -e
cd "$(dirname "$0")"

DEV="$1"
case "$DEV" in build) DEV= ;; esac

python3 pwa/make_icons.py
python3 build.py v2

# The site, staged exactly as build_apk.sh stages it for the APK.
rm -rf ios/WorkLog/www
mkdir -p ios/WorkLog/www
cp dist-v2/index.html dist-v2/manifest.webmanifest dist-v2/sw.js dist-v2/icon-*.png \
   ios/WorkLog/www/

DD=ios/build
APP="$DD/Build/Products/Debug-iphonesimulator/WorkLog.app"
rm -rf "$APP"

xcodebuild \
  -project ios/WorkLog.xcodeproj \
  -scheme WorkLog \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$DD" \
  CODE_SIGNING_ALLOWED=NO \
  build

# build_apk.sh has been caught exiting 0 over a stale artifact. Do not trust the
# exit code -- look for the bundle, and look for the page inside it.
[ -d "$APP" ] || { echo "xcodebuild finished but there is no app at $APP" >&2; exit 1; }
[ -f "$APP/www/index.html" ] || { echo "the app bundle has no www/index.html" >&2; exit 1; }

echo
echo "$APP  $(find "$APP" -type f | wc -l | tr -d ' ') files"

[ "$1" = build ] && exit 0

if [ -n "$DEV" ]; then
  xcrun simctl boot "$DEV" 2>/dev/null || true
fi
xcrun simctl list devices booted | grep -q '(Booted)' || {
  echo "No simulator is booted. Open Simulator.app, or pass a device name." >&2; exit 1; }

open -a Simulator
xcrun simctl install booted "$APP"
xcrun simctl launch booted app.worklog.punch
