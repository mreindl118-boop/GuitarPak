#!/usr/bin/env bash
# tools/cloud/setup.sh: make a fresh claude.ai cloud container (or any Linux box) ready for soundLAB work.
#
#   bash tools/cloud/setup.sh            Node packages for tests/run.sh: Playwright matched to the installed
#                                        Chromium + the SheetLab packages (versions = .github/workflows/tests.yml)
#   bash tools/cloud/setup.sh --android  also the Android SDK pieces android/build.sh reads (checksum-verified)
#   bash tools/cloud/setup.sh --python   also the SheetLab Python reference (tools/omr/README.md; ~1 min, ~1.2 GB)
#   eval "$(bash tools/cloud/setup.sh --android)"    puts the variables into the current shell
#
#   --hook   SessionStart mode (.claude/settings.json): cloud sessions only, Node step only, bounded by a
#            timeout, exports into $CLAUDE_ENV_FILE, always exits 0
#   -v       progress on stderr
#
# Re-running is safe: a warm run only checks versions, stamps and checksums. stdout carries only shell lines
# (export ... / # notes); stderr stays silent unless a step fails (or -v). Tool output: $SL_CACHE/logs/.
# Cache: $SL_CACHE (default ~/.cache/soundlab). Never writes the repo. Never fetches the APK signing key.
set -uo pipefail   # no -e: each step checks its own result, so --hook can never abort a session

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
CACHE=${SL_CACHE:-$HOME/.cache/soundlab}
HOOK=0 ANDROID=0 PY=0 VERBOSE=${SL_VERBOSE:-0}
for a in "$@"; do
  case $a in
    --hook) HOOK=1 ;;
    --android) ANDROID=1 ;;
    --python) PY=1 ;;
    -v|--verbose) VERBOSE=1 ;;
    -h|--help) sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "setup.sh: unknown option '$a' (see --help)" >&2; exit 2 ;;
  esac
done
if [ $HOOK = 1 ]; then
  [ "${CLAUDE_CODE_REMOTE:-}" = true ] || exit 0   # the laptop / a PC keeps its own setup
  exec </dev/null                                 # the hook's JSON on stdin is not needed
  ANDROID=0 PY=0
fi

# ---- pins ------------------------------------------------------------------------------------------
# Node packages: read from the CI workflow (one source of truth); these are the fallbacks.
PW_CI_DEFAULT=1.62.1
NPM_DEFAULTS=(onnxruntime-web@1.31.1 @techstark/opencv-js@5.0.0-release.1 pdfjs-dist@4.10.38)
# Android pieces: <url> <bytes> <sha256> <sha1>. Google publishes SHA-1 + size for the SDK zips
# (repository2-3.xml) and SHA-256 for r8 (Maven .sha256); the zips' SHA-256 were pinned on 2026-11-02
# from files that matched Google's SHA-1.
AND_PLATFORM=(https://dl.google.com/android/repository/platform-34-ext7_r03.zip 63180081
  16fdb74c55e59ae3ef52def135aec713508467bd56d7dabcd8c9be31fa8b20f3 1f2e9478d6a7601425ceaa553311dc43191f103d)
AND_BUILDTOOLS=(https://dl.google.com/android/repository/build-tools_r34-linux.zip 61224257
  e858c4b60069d0431051b225d384413b1643e1289b00a4825aed347f25bd510f d6d58e0c6925a9e4d9a541e84cd1f405c2f9d2a9)
AND_R8=(https://dl.google.com/android/maven2/com/android/tools/r8/8.7.18/r8-8.7.18.jar 17650417
  58366f77067207c39a17d469de7b05701d2877212a9c55201bcb0af43e59e903 c005831622e05397a450d640a016ab66c0c64342)
KEY_ARTIFACT=https://claude.ai/artifact/VWL2AAhC1JQe6XXBPnNLKr   # where the signing key lives (never fetched here)
# SheetLab reference (tools/omr/README.md). The four packages the README leaves open are pinned to the
# versions of the venv the parity fixtures were made with.
HOMR_URL=https://github.com/liebharc/homr
HOMR_SHA=2d7e8c3b500ab9af10e579bebab8c0d9e551eb71
HOMR_WEIGHTS=https://github.com/liebharc/homr/releases/download/onnx_checkpoints
PY_REQS=(numpy==2.4.6 opencv-python-headless==5.0.0.93 onnxruntime==1.31.1 pillow==13.0.0 music21==10.5.2
  mido==1.3.3 pypdfium2==5.14.0 rapidocr==3.10.0 pymupdf==2.0 onnx==1.23.2)
# homr's ONNX weights (fp32 + fp16): <dir in homr/homr> <file> <bytes> <sha256>
WEIGHTS=(
  "segmentation segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f.onnx 57311361 6ed36640db4ef5d223098b6d5efe4eda97c66b24a2c72faab8a018c749003a8d"
  "segmentation segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f_fp16.onnx 28667207 60f495496cb41473c0521d0811d8f44b9d5cff892d287974a8aebb3eaee2fa83"
  "transformer encoder_pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31.onnx 52861122 ee5767286c60dc3d567fe72b6560e7285261ede1535b4215153c199ab3057559"
  "transformer encoder_pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31_fp16.onnx 26466256 bf0b6921c25b70311d8e299df36a0adc046ac7861aaf7dd710aa150a37426e6c"
  "transformer decoder_pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31.onnx 47356003 99a6ac39770616bc1a20d6c409bb85fbbe21ba47f972984f9ef834fb5741b96f"
  "transformer decoder_pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31_fp16.onnx 94059048 5df2acf03acf84b6ba7d74b04e481843961485c45c35997b19cd099360cb1e84"
)

# ---- helpers ---------------------------------------------------------------------------------------
OUT=()          # shell lines printed at the end
FAILS=()        # one line per failed step
LOGDIR="$CACHE/logs"
say() { [ "$VERBOSE" = 1 ] && echo "setup.sh: $*" >&2; return 0; }
err() { FAILS+=("$1"); echo "setup.sh: $1" >&2; [ -n "${2:-}" ] && [ -s "$2" ] && tail -15 "$2" | sed 's/^/    /' >&2; return 1; }
q() { printf '%q' "$1"; }
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
sha1() { if command -v sha1sum >/dev/null; then sha1sum "$1" | cut -d' ' -f1; else shasum -a 1 "$1" | cut -d' ' -f1; fi; }
size() { wc -c <"$1" | tr -d ' '; }
verify() { # verify <file> <bytes> <sha256> [sha1]
  [ -f "$1" ] && [ "$(size "$1")" = "$2" ] && [ "$(sha256 "$1")" = "$3" ] && { [ -z "${4:-}" ] || [ "$(sha1 "$1")" = "$4" ]; }
}
fetch() { # fetch <url> <dest> <bytes> <sha256> [sha1]: keeps only verified bytes at <dest>
  local url=$1 dest=$2 log="$LOGDIR/downloads.log"
  verify "$dest" "$3" "$4" "${5:-}" && return 0
  rm -f "$dest" "$dest.part"; mkdir -p "$(dirname "$dest")"
  say "downloading ${url##*/} ($(($3 / 1048576)) MB)"
  if ! curl -fsSL --retry 3 --retry-delay 2 -o "$dest.part" "$url" >>"$log" 2>&1; then
    rm -f "$dest.part"; err "download failed: $url" "$log"; return 1
  fi
  if ! verify "$dest.part" "$3" "$4" "${5:-}"; then
    echo "$(date -u +%FT%TZ) $url: got $(size "$dest.part") bytes sha256 $(sha256 "$dest.part")" >>"$log"
    rm -f "$dest.part"; err "checksum mismatch, nothing kept: $url (expected $3 bytes, sha256 $4)" "$log"; return 1
  fi
  mv -f "$dest.part" "$dest"
}
run() { # run <log> <cmd...>: tool output into the log only
  local log="$LOGDIR/$1.log"; shift
  echo "== $(date -u +%FT%TZ) $*" >>"$log"
  "$@" >>"$log" 2>&1
}

mkdir -p "$LOGDIR" 2>/dev/null || { echo "setup.sh: cannot create $CACHE (set SL_CACHE)" >&2; [ $HOOK = 1 ] && exit 0; exit 1; }
if command -v flock >/dev/null; then   # a manual run and the SessionStart hook never interleave
  exec 9>"$CACHE/.lock"
  if ! flock -w "$([ $HOOK = 1 ] && echo 60 || echo 1800)" 9; then
    [ $HOOK = 1 ] && { echo "soundLAB setup: skipped (another tools/cloud/setup.sh run holds $CACHE/.lock)"; exit 0; }
    echo "setup.sh: another run holds $CACHE/.lock" >&2; exit 1
  fi
fi

# ---- Node: Playwright + the SheetLab packages ------------------------------------------------------
NODE_PATH_OUT="" CHROMIUM_OUT=""
pinned() { # pinned <pkg> <fallback version>: the version CI installs
  local v; v=$(grep -oE "(^|[[:space:]\"'])$1@[0-9][0-9A-Za-z.+-]*" "$REPO/.github/workflows/tests.yml" 2>/dev/null | head -1)
  if [ -n "$v" ]; then echo "${v##*@}"; else echo "$2"; fi
}
pw_chromium() { # pw_chromium <node_path> <browsers dir>: the Chromium that playwright expects, if installed
  local p; p=$(cd / && PLAYWRIGHT_BROWSERS_PATH="$2" NODE_PATH="$1" node -e \
    'process.stdout.write(require("playwright").chromium.executablePath())' 2>/dev/null) || return 1
  [ -x "$p" ] && echo "$p"
}
installed() { # installed <dir> <pkg@ver...>: every package present at exactly that version
  (cd / && node -e '
    const fs = require("fs"), path = require("path"), root = process.argv[1];
    for (const s of process.argv.slice(2)) {
      const i = s.lastIndexOf("@"), name = s.slice(0, i), want = s.slice(i + 1);
      try { if (JSON.parse(fs.readFileSync(path.join(root, name, "package.json"), "utf8")).version !== want) process.exit(1); }
      catch (e) { process.exit(1); }
    }' "$@")
}
node_step() {
  command -v node >/dev/null && command -v npm >/dev/null ||
    { err "node/npm not on PATH (the cloud image has them in /opt/node22/bin)"; return 1; }
  local deps=() d name fallback global="" browsers=${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers} chromium="" np
  for d in "${NPM_DEFAULTS[@]}"; do name=${d%@*}; fallback=${d##*@}; deps+=("$name@$(pinned "$name" "$fallback")"); done
  # 1) reuse the image's global Playwright when its own Chromium revision is installed (no download)
  for d in "$(npm root -g 2>/dev/null)" /opt/node22/lib/node_modules; do
    [ -n "$d" ] && [ -f "$d/playwright/package.json" ] && { global=$d; break; }
  done
  [ -n "$global" ] && [ -d "$browsers" ] && chromium=$(pw_chromium "$global" "$browsers")
  # 2) else the version CI pins, with its Chromium in the cache when the image lacks that revision
  [ -n "$chromium" ] || { global=""; deps+=("playwright@$(pinned playwright "$PW_CI_DEFAULT")"); }

  local pj; pj=$(cd / && node -e '
    const dependencies = {};
    for (const s of process.argv.slice(1)) { const i = s.lastIndexOf("@"); dependencies[s.slice(0, i)] = s.slice(i + 1); }
    console.log(JSON.stringify({ name: "soundlab-cloud-deps", private: true,
      description: "written by tools/cloud/setup.sh; safe to delete", dependencies }, null, 1));' "${deps[@]}")
  if [ "$(cat "$CACHE/package.json" 2>/dev/null)" != "$pj" ] || ! installed "$CACHE/node_modules" "${deps[@]}"; then
    say "npm install ${deps[*]}"
    printf '%s\n' "$pj" >"$CACHE/package.json"
    local to=(); [ $HOOK = 1 ] && command -v timeout >/dev/null && to=(timeout "${SL_HOOK_TIMEOUT:-200}")
    run npm ${to[@]+"${to[@]}"} npm install --prefix "$CACHE" --no-audit --no-fund --ignore-scripts \
      --no-package-lock --loglevel=error ||
      { err "npm install failed (${deps[*]})" "$LOGDIR/npm.log"; return 1; }
    installed "$CACHE/node_modules" "${deps[@]}" || { err "npm finished but the pinned versions are missing" "$LOGDIR/npm.log"; return 1; }
  fi

  if [ -n "$global" ]; then np="$global:$CACHE/node_modules"
  else
    np="$CACHE/node_modules"
    [ -d "$browsers" ] && chromium=$(pw_chromium "$np" "$browsers")
    if [ -z "$chromium" ]; then
      chromium=$(pw_chromium "$np" "$CACHE/ms-playwright")
      if [ -z "$chromium" ]; then
        say "installing Playwright's Chromium into $CACHE/ms-playwright"
        PLAYWRIGHT_BROWSERS_PATH="$CACHE/ms-playwright" run playwright node "$np/playwright/cli.js" install chromium ||
          { err "playwright install chromium failed" "$LOGDIR/playwright.log"; return 1; }
        chromium=$(pw_chromium "$np" "$CACHE/ms-playwright") || { err "Chromium still missing after playwright install"; return 1; }
      fi
    fi
  fi
  (cd / && NODE_PATH="$np" node -e 'require("playwright"); for (const m of ["onnxruntime-web", "@techstark/opencv-js", "pdfjs-dist/package.json"]) require.resolve(m)') \
    >>"$LOGDIR/npm.log" 2>&1 || { err "the packages do not resolve with NODE_PATH=$np" "$LOGDIR/npm.log"; return 1; }
  NODE_PATH_OUT=$np CHROMIUM_OUT=$chromium
  OUT+=("export NODE_PATH=$(q "$np") CHROMIUM=$(q "$chromium")")
}

# ---- Android: what android/build.sh reads -----------------------------------------------------------
unpack() { # unpack <zip> <top dir inside> <target> <stamp value>
  local tmp; tmp=$(mktemp -d "$CACHE/android/tmp.XXXXXX") || return 1
  if ! run android unzip -q "$1" -d "$tmp" || [ ! -d "$tmp/$2" ]; then rm -rf "$tmp"; err "could not unpack ${1##*/}" "$LOGDIR/android.log"; return 1; fi
  rm -rf "$3"; mkdir -p "$(dirname "$3")" && mv "$tmp/$2" "$3" && rm -rf "$tmp" && echo "$4" >"$3/.soundlab-setup"
}
sdk_piece() { # sdk_piece <url> <bytes> <sha256> <sha1> <top dir in zip> <target> <file that must exist>
  local zip="$CACHE/android/dl/${1##*/}"
  [ "$(cat "$6/.soundlab-setup" 2>/dev/null)" = "$3" ] && [ -e "$6/$7" ] && return 0
  fetch "$1" "$zip" "$2" "$3" "$4" || return 1
  unpack "$zip" "$5" "$6" "$3" || return 1
  rm -f "$zip"   # the stamp keeps the verified checksum; the zip is not needed again
}
android_step() {
  command -v unzip >/dev/null || { err "--android needs unzip (apt-get install unzip)"; return 1; }
  command -v javac >/dev/null && command -v java >/dev/null ||
    { err "--android needs a JDK 17+ on PATH (javac, java); the cloud image ships OpenJDK 21"; return 1; }
  local sdk="$CACHE/android/sdk" ok=1
  local jar="$sdk/platforms/android-34/android.jar" bt="$sdk/build-tools/34.0.0" d8="$CACHE/android/r8/${AND_R8[0]##*/}"
  sdk_piece "${AND_PLATFORM[@]}" android-34 "$sdk/platforms/android-34" android.jar || ok=0
  sdk_piece "${AND_BUILDTOOLS[@]}" android-14 "$bt" apksigner || ok=0   # the r34 zip unpacks as android-14/
  fetch "${AND_R8[0]}" "$d8" "${AND_R8[1]}" "${AND_R8[2]}" "${AND_R8[3]}" || ok=0
  [ $ok = 1 ] || return 1
  run android "$bt/aapt" version || { err "build-tools aapt does not run here" "$LOGDIR/android.log"; return 1; }
  run android java -cp "$d8" com.android.tools.r8.D8 --version || { err "r8 ($d8) does not run on this JDK" "$LOGDIR/android.log"; return 1; }
  OUT+=("export ANDROID_JAR=$(q "$jar") BUILD_TOOLS=$(q "$bt") D8_JAR=$(q "$d8") AAPT=$(q "$bt/aapt")"
    "# KEYSTORE is never fetched by this script. For a real APK only (MainActivity / MidiBridge / manifest changes):"
    "#   Artifact tool action \"read\", url $KEY_ARTIFACT, path soundlab.keystore.b64 -> base64 -d"
    "#   into the session scratchpad (never the repo) -> KEYSTORE=<that file> bash android/build.sh -> delete it."
    "#   Bump android/AndroidManifest.xml versionCode/versionName first; build.sh rewrites version.json \"version\".")
}

# ---- Python: the SheetLab reference (tools/omr/README.md) -------------------------------------------
python_step() {
  command -v python3 >/dev/null && python3 -c 'import sys; sys.exit(sys.version_info < (3, 11))' ||
    { err "--python needs python3 >= 3.11"; return 1; }
  command -v git >/dev/null && command -v unzip >/dev/null || { err "--python needs git and unzip"; return 1; }
  local base="$CACHE/omr" homr="$CACHE/omr/homr" venv="$CACHE/omr/venv" models="$CACHE/omr/models" ok=1 w dir f bytes sum
  mkdir -p "$base/dl"
  # homr at the commit the port follows (one commit, no history)
  if [ "$(git -C "$homr" rev-parse HEAD 2>/dev/null)" != "$HOMR_SHA" ]; then
    say "fetching homr @${HOMR_SHA:0:7}"
    rm -rf "$homr.tmp" && git init -q "$homr.tmp" &&
      run python git -C "$homr.tmp" fetch -q --depth 1 "$HOMR_URL" "$HOMR_SHA" &&
      run python git -C "$homr.tmp" -c advice.detachedHead=false checkout -q FETCH_HEAD &&
      rm -rf "$homr" && mv "$homr.tmp" "$homr" || { rm -rf "$homr.tmp"; err "could not fetch homr @$HOMR_SHA" "$LOGDIR/python.log"; return 1; }
  fi
  # the venv: pinned stack + homr itself (editable, no deps)
  local stamp="${PY_REQS[*]} homr=$HOMR_SHA $(python3 --version 2>&1)"
  if [ "$(cat "$venv/.soundlab-setup" 2>/dev/null)" != "$stamp" ] || [ ! -x "$venv/bin/python" ]; then
    say "building the venv (${PY_REQS[*]})"
    rm -rf "$venv" && run python python3 -m venv "$venv" &&
      run python "$venv/bin/python" -m pip install -q --disable-pip-version-check "${PY_REQS[@]}" &&
      run python "$venv/bin/python" -m pip install -q --disable-pip-version-check --no-deps -e "$homr" &&
      run python "$venv/bin/python" -I -c 'import numpy, cv2, onnxruntime, PIL, music21, mido, pypdfium2, pymupdf, onnx, homr' &&
      echo "$stamp" >"$venv/.soundlab-setup" || { err "could not build the SheetLab venv" "$LOGDIR/python.log"; return 1; }
  fi
  # homr's weights next to its code (fp32 for quantizing, fp16 for its Config() references)
  for w in "${WEIGHTS[@]}"; do
    read -r dir f bytes sum <<<"$w"
    verify "$homr/homr/$dir/$f" "$bytes" "$sum" && continue
    local zip="$base/dl/${f%.onnx}.zip" tmp   # the zip is not pinned; the .onnx inside it is
    say "downloading ${zip##*/}"
    if ! run downloads curl -fsSL --retry 3 --retry-delay 2 -o "$zip" "$HOMR_WEIGHTS/${f%.onnx}.zip"; then
      rm -f "$zip"; err "download failed: $HOMR_WEIGHTS/${f%.onnx}.zip" "$LOGDIR/downloads.log"; ok=0; continue
    fi
    tmp=$(mktemp -d "$base/dl/x.XXXXXX")
    if run python unzip -q -o "$zip" "$f" -d "$tmp" && verify "$tmp/$f" "$bytes" "$sum"; then mv -f "$tmp/$f" "$homr/homr/$dir/$f"
    else err "homr weight $f: missing from its zip or checksum mismatch (nothing kept)" "$LOGDIR/python.log"; ok=0; fi
    rm -rf "$tmp" "$zip"
  done
  [ $ok = 1 ] || return 1
  # SL_OMR_MODELS = the shipping int8 models joined from the repo's models/omr parts + homr's tokenizers
  run python python3 -I - "$REPO/models/omr" "$models" "$homr/homr/transformer" <<'PY' ||
import hashlib, json, os, shutil, sys
src, out, tok = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
man = json.load(open(os.path.join(src, 'manifest.json')))
def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
    return h.hexdigest()
for key, m in man['models'].items():
    dest = os.path.join(out, m['source'])
    if os.path.exists(dest) and os.path.getsize(dest) == m['bytes'] and sha(dest) == m['sha256']:
        continue
    with open(dest + '.part', 'wb') as w:
        for p in m['parts']:
            pp = os.path.join(src, p['file'])
            if sha(pp) != p['sha256']: sys.exit('part checksum mismatch: ' + pp)
            with open(pp, 'rb') as r: shutil.copyfileobj(r, w)
    if sha(dest + '.part') != m['sha256']: os.remove(dest + '.part'); sys.exit('model checksum mismatch: ' + key)
    os.replace(dest + '.part', dest)
for n in sorted(os.listdir(tok)):
    if n.startswith('tokenizer_') and n.endswith('.json'): shutil.copyfile(os.path.join(tok, n), os.path.join(out, n))
PY
    { err "could not assemble SL_OMR_MODELS from models/omr" "$LOGDIR/python.log"; return 1; }
  OUT+=("export SL_OMR_PYTHON=$(q "$venv/bin/python") SL_OMR_MODELS=$(q "$models")"
    "# homr @${HOMR_SHA:0:7} + fp32/fp16 weights: $homr (tools/omr/dump_*.py import it; always python -I)"
    "# SL_OMR_FIXTURES is not made here: render the Mutopia pages and run tools/omr/dump_*.py (tools/omr/README.md);"
    "#   dump_e2e.py / dump_sheetlab_prep.py take --engine tools/omr/sheetlab_engine.py.")
}

# ---- run --------------------------------------------------------------------------------------------
node_step
[ $ANDROID = 1 ] && android_step
[ $PY = 1 ] && python_step

if [ $HOOK = 1 ]; then
  if [ -n "$NODE_PATH_OUT" ]; then
    line="export NODE_PATH=$(q "$NODE_PATH_OUT") CHROMIUM=$(q "$CHROMIUM_OUT")"
    [ -n "${CLAUDE_ENV_FILE:-}" ] && { grep -qxF "$line" "$CLAUDE_ENV_FILE" 2>/dev/null || echo "$line" >>"$CLAUDE_ENV_FILE"; }
    echo "soundLAB setup: test deps ready (NODE_PATH, CHROMIUM exported): bash tests/run.sh [suite ...] (SL_PORT=<free port> if 4573 is taken). APK toolchain: eval \"\$(bash tools/cloud/setup.sh --android)\"."
  else
    echo "soundLAB setup: FAILED (${FAILS[*]:-unknown}); browser/SheetLab suites may SKIP or fail. Retry: bash tools/cloud/setup.sh -v (logs $LOGDIR)."
  fi
  exit 0
fi
[ ${#OUT[@]} = 0 ] || printf '%s\n' "${OUT[@]}"
[ ${#FAILS[@]} = 0 ]
