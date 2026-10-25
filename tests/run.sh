#!/usr/bin/env bash
# soundLAB headless test suites (Node + Playwright + Chromium).
#   tests/run.sh             all suites
#   tests/run.sh game quiz   just those
# Needs playwright on NODE_PATH (cloud: NODE_PATH=/opt/node22/lib/node_modules).
set -u
cd "$(dirname "$0")/.."
# SL_PORT runs a second copy side by side (default 4573)
export SL_PORT=${SL_PORT:-4573} SL_URL=${SL_URL:-http://127.0.0.1:${SL_PORT:-4573}/index.html}
# Keep concurrent baseline/feature runs from overwriting one another's logs.
log_dir=${SL_LOG_DIR:-/tmp}
mkdir -p "$log_dir"
python3 tests/serve.py & srv=$!
trap 'kill $srv 2>/dev/null' EXIT
for i in 1 2 3 4 5 6 7 8 9 10; do python3 -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:$SL_PORT/index.html')" 2>/dev/null && break; sleep 0.3; done
fail=0
for t in ${@:-fingering lights keys practice game quiz quiz-correction nav smoke taps update audio-level midihub midihub-lock midihub-wheel audioin btmidi colors note-palette multiin lumidisplay lumi-practice display-master lumi-contexts midi-ports midi-ingress practice-router pitch-lock sound-lock performance-engine performance-import performance performance-safety practice-progress practice-progress-ui performance-progress practice-input practice-audio pages-deploy release-workflow practiceplan learn-instruments instrument-xp instrument-session context-global midihub-player}; do
  echo "== $t"
  node "tests/$t.test.js" > "$log_dir/sl-$t.out" 2>&1 && echo "   pass ($(grep -c PASS "$log_dir/sl-$t.out") checks)" || { fail=1; grep -E "FAIL|Error" "$log_dir/sl-$t.out" | head -20; }
done
[ $fail = 0 ] && echo "ALL SUITES PASS" || echo "SOME SUITES FAILED (full logs: $log_dir/sl-<suite>.out)"
exit $fail
