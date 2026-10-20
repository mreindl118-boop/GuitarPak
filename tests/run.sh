#!/usr/bin/env bash
# soundLAB headless test suites (Node + Playwright + Chromium).
#   tests/run.sh             all suites
#   tests/run.sh game quiz   just those
# Needs playwright on NODE_PATH (cloud: NODE_PATH=/opt/node22/lib/node_modules).
set -u
cd "$(dirname "$0")/.."
python3 tests/serve.py & srv=$!
trap 'kill $srv 2>/dev/null' EXIT
for i in 1 2 3 4 5 6 7 8 9 10; do python3 -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:4573/index.html')" 2>/dev/null && break; sleep 0.3; done
fail=0
for t in ${@:-fingering lights keys practice game quiz nav smoke taps update audio-level midihub audioin btmidi colors multiin}; do
  echo "== $t"
  node "tests/$t.test.js" > "/tmp/sl-$t.out" 2>&1 && echo "   pass ($(grep -c PASS /tmp/sl-$t.out) checks)" || { fail=1; grep -E "FAIL|Error" "/tmp/sl-$t.out" | head -20; }
done
[ $fail = 0 ] && echo "ALL SUITES PASS" || echo "SOME SUITES FAILED (full logs: /tmp/sl-<suite>.out)"
exit $fail
