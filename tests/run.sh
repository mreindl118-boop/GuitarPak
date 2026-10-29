#!/usr/bin/env bash
# soundLAB headless test suites (Node + Playwright + Chromium).
#   tests/run.sh             all suites
#   tests/run.sh game quiz   just those
# Needs playwright on NODE_PATH (cloud: NODE_PATH=/opt/node22/lib/node_modules); the SheetLab suites
# (omr-*, sheetlab) also want onnxruntime-web, @techstark/opencv-js and pdfjs-dist there and print
# SKIP lines without them. SL_OMR_FIXTURES / SL_OMR_MODELS add the full Python-parity runs
# (tools/omr/README.md).
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
for t in ${@:-fingering lights keys practice game quiz quiz-correction nav smoke taps update audio-level midihub midihub-lock midihub-wheel audioin btmidi colors note-palette multiin lumidisplay lumi-practice display-master lumi-contexts midi-ports midi-ingress practice-router pitch-lock sound-lock performance-engine performance-import performance performance-safety practice-progress practice-progress-ui performance-progress practice-input practice-audio pages-deploy release-workflow practiceplan learn-instruments instrument-xp instrument-session context-global midihub-player helix synthdeck synthdeck-scope synthtab synthconnect synthconn oneopen remote remote-quiz remote-keys remote-shed remote-plan remote-runners omr-np omr-cv omr-pil omr-boxes omr-model omr-vocab omr-xml omr-runtime omr-midi omr-segment omr-staff omr-read omr-e2e sheetlab library}; do
  echo "== $t"
  # real checks only ("  PASS x" / "PASS: x", not a closing "ALL PASS"), and the SKIPs beside them: a
  # suite that skipped everything (no fixtures / packages here) says so instead of "pass (0 checks)"
  if node "tests/$t.test.js" > "$log_dir/sl-$t.out" 2>&1; then
    n=$(grep -cE '^[[:space:]]*PASS[: ]' "$log_dir/sl-$t.out"); m=$(grep -cE '^[[:space:]]*SKIP' "$log_dir/sl-$t.out")
    if [ "$n" = 0 ] && [ "$m" != 0 ]; then echo "   skipped (0 checks, $m skipped)"; else echo "   pass ($n checks, $m skipped)"; fi
  else fail=1; grep -E "FAIL|Error" "$log_dir/sl-$t.out" | head -20; fi
done
[ $fail = 0 ] && echo "ALL SUITES PASS" || echo "SOME SUITES FAILED (full logs: $log_dir/sl-<suite>.out)"
exit $fail
