#!/bin/sh
# 판 번호 올리기 · bump the Android version before a release.
#
#   ./bump_version.sh            versionCode +1, versionName unchanged
#   ./bump_version.sh patch      versionCode +1, 1.2   -> 1.2.1
#   ./bump_version.sh minor      versionCode +1, 1.2   -> 1.3
#   ./bump_version.sh major      versionCode +1, 1.2   -> 2.0
#   ./bump_version.sh 1.4.2      versionCode +1, versionName set to 1.4.2
#   ./bump_version.sh --show     print the current pair and stop
#
# versionCode is the only number the Play Store orders releases by, and it can
# never be reused or reduced — once a code is uploaded it is spent, even if you
# delete the draft. versionName is the string a worker sees; it means nothing to
# the store's ordering.
#
# This touches app/build.gradle and nothing else. In particular it does NOT
# touch the 근무내역서's '작성 도구' line — what that should say has not been
# decided (see CLAUDE.md, the twenty-third entry).
set -e
cd "$(dirname "$0")"

GRADLE_FILE=android/app/build.gradle
[ -f "$GRADLE_FILE" ] || { echo "no $GRADLE_FILE" >&2; exit 1; }

cur_code=$(sed -n 's/^[[:space:]]*versionCode[[:space:]]*\([0-9][0-9]*\).*$/\1/p' "$GRADLE_FILE" | head -1)
cur_name=$(sed -n "s/^[[:space:]]*versionName[[:space:]]*'\([^']*\)'.*$/\1/p" "$GRADLE_FILE" | head -1)

if [ -z "$cur_code" ] || [ -z "$cur_name" ]; then
  echo "could not read versionCode/versionName from $GRADLE_FILE" >&2
  exit 1
fi

if [ "$1" = "--show" ]; then
  echo "versionCode $cur_code   versionName $cur_name"
  exit 0
fi

# versionName ── major.minor.patch, missing parts read as 0
IFS='.' read -r MA MI PA <<EOF
$cur_name
EOF
MA=${MA:-0}; MI=${MI:-0}; PA=${PA:-0}

case "$1" in
  '')       new_name="$cur_name" ;;
  major)    new_name="$((MA + 1)).0" ;;
  minor)    new_name="$MA.$((MI + 1))" ;;
  patch)    new_name="$MA.$MI.$((PA + 1))" ;;
  *[!0-9.]*) echo "not a version: $1  (use major | minor | patch | 1.4.2)" >&2; exit 1 ;;
  *)        new_name="$1" ;;
esac

new_code=$((cur_code + 1))

# rewrite only those two lines
tmp=$(mktemp)
sed -e "s/^\([[:space:]]*versionCode[[:space:]]*\)[0-9][0-9]*/\1$new_code/" \
    -e "s/^\([[:space:]]*versionName[[:space:]]*\)'[^']*'/\1'$new_name'/" \
    "$GRADLE_FILE" > "$tmp"

# never leave the file half-written if the substitution missed
check_code=$(sed -n 's/^[[:space:]]*versionCode[[:space:]]*\([0-9][0-9]*\).*$/\1/p' "$tmp" | head -1)
check_name=$(sed -n "s/^[[:space:]]*versionName[[:space:]]*'\([^']*\)'.*$/\1/p" "$tmp" | head -1)
if [ "$check_code" != "$new_code" ] || [ "$check_name" != "$new_name" ]; then
  rm -f "$tmp"
  echo "rewrite failed — $GRADLE_FILE is untouched" >&2
  exit 1
fi
mv "$tmp" "$GRADLE_FILE"

echo "versionCode $cur_code -> $new_code"
echo "versionName $cur_name -> $new_name"
echo
echo "Next:  ./build_apk.sh bundle     (the .aab the Play Store takes)"
