#!/bin/sh
# All v2 checks. Run from anywhere: sh test/run.sh
set -e
cd "$(dirname "$0")/.."

echo "== regression suite =="
node test/regress.js

echo
echo "== template bindings =="
node test/bind.js

echo
echo "== sc-for row fields =="
node test/bind2.js

echo
echo "== translations =="
python3 tools/check_lang.py

echo
echo "== every language renders =="
for L in ko en vi zh th id ne km; do
  node test/snapshot.js "$L" > "/tmp/worklog-snap-$L.txt"
  t=$(grep -c 'THREW' "/tmp/worklog-snap-$L.txt" || true)
  p=$(grep -oE '\{[a-z][a-z0-9]*\}' "/tmp/worklog-snap-$L.txt" | sort -u | tr '\n' ' ')
  printf '%-3s  %6s strings  throws:%s  unresolved:%s\n' \
    "$L" "$(wc -l < "/tmp/worklog-snap-$L.txt" | tr -d ' ')" "$t" "${p:-none}"
done

echo
echo "== builds =="
python3 build.py    | head -1
python3 build.py v2 | head -1
