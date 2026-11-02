# tools/cloud: get a cloud session ready for soundLAB

`setup.sh` prepares a fresh claude.ai cloud container, or any Linux machine, for soundLAB work. It replaces the
toolchain that lived on the owner's laptop. It only writes to its cache (`$SL_CACHE`, default `~/.cache/soundlab`),
never to the repo. Re-running it is safe: a warm run takes about a second. Its stdout carries only `export` and
`#` lines, so wrap it in `eval`.

| Need | Command | Cold / warm (measured 2026-11-02) |
|---|---|---|
| Test suites | `eval "$(bash tools/cloud/setup.sh)"`, then `bash tests/run.sh [suite ...]` (set `SL_PORT` if 4573 is taken) | 4–34 s / 0.9 s |
| Android APK | `eval "$(bash tools/cloud/setup.sh --android)"`, then `bash android/build.sh` | 9 s / 1 s |
| SheetLab Python parity | `eval "$(bash tools/cloud/setup.sh --python)"` (about 1.2 GB) | 65 s / 1.4 s |

## What each mode does

- **Default (tests).** It reuses the image's global Playwright if `/opt/pw-browsers` holds the Chromium build that
  Playwright expects. Otherwise it installs the Playwright version pinned in `.github/workflows/tests.yml` and
  downloads that version's Chromium into the cache. It also installs the SheetLab npm packages at the versions CI
  uses. It exports `NODE_PATH` and `CHROMIUM`.
- **`--android`.** It downloads platform-34, build-tools 34.0.0 and r8 8.7.18 (the `D8_JAR`). The d8 in
  build-tools 34 crashes on JDK 21, which is why r8 is needed. Each download is checked against its size and
  SHA-1 as published by Google, and against a pinned SHA-256; a bad file is deleted. It exports `ANDROID_JAR`,
  `BUILD_TOOLS`, `D8_JAR` and `AAPT`. Setting `AAPT` also turns on the APK checks in `tests/update.test.js`.
- **`--python`.** It follows `tools/omr/README.md`:
  - homr checked out at commit `2d7e8c3`;
  - a venv with the pinned packages;
  - homr's fp32 and fp16 weights, verified against pinned SHA-256s;
  - `SL_OMR_MODELS`, rebuilt from the repo's `models/omr` parts.

  It exports `SL_OMR_PYTHON` and `SL_OMR_MODELS`. It does not make `SL_OMR_FIXTURES`: render the Mutopia
  PDFs and run the dump tools as tools/omr/README.md says (the engine is `tools/omr/sheetlab_engine.py`).

If a step fails, it is named on stderr and the script exits 1. Tool output goes to `$SL_CACHE/logs/`. `-v` shows
progress.

## The APK signing key

The script **never** fetches the signing key. For a real APK, which is needed only when MainActivity, MidiBridge
or the manifest change:

1. Use the Artifact tool with `action: "read"` on `https://claude.ai/artifact/VWL2AAhC1JQe6XXBPnNLKr` and
   `path: soundlab.keystore.b64`.
2. Decode it with `base64 -d` into the session scratchpad. Never put it in the repo.
3. Bump `android/AndroidManifest.xml`: it currently says 0.82.0 / 110, but the shipped APK is 0.75.0 / 100.
4. Run `KEYSTORE=<file> bash android/build.sh`, then delete the decoded key.

`build.sh` writes `releases/` and `version.json` in the tree it runs from. To rehearse a build, copy the tree first
and sign with a throwaway key:

```sh
S=<your scratchpad>; mkdir -p "$S/copy/android"
cp index.html manifest.webmanifest version.json "$S/copy/"; cp -r css js icons fonts samples data "$S/copy/"
cp -r android/AndroidManifest.xml android/res android/src android/build.sh "$S/copy/android/"
keytool -genkeypair -storetype PKCS12 -keystore "$S/throwaway.p12" -storepass throwaway -keypass throwaway \
  -alias t -keyalg RSA -dname "CN=THROWAWAY - not soundLAB"
KEYSTORE="$S/throwaway.p12" KEYSTORE_PASS=throwaway bash "$S/copy/android/build.sh"
```

## SessionStart hook (the owner adds it)

`setup.sh --hook` is built for a SessionStart hook:

- It runs only in cloud sessions (`CLAUDE_CODE_REMOTE=true`), and only the default step.
- npm is capped by `timeout` at 200 s.
- It writes the exports to `$CLAUDE_ENV_FILE`, prints one status line, and always exits 0.

On a warm cache it took 0.9 s here. It is not switched on, because adding it changes Claude Code's own
configuration, which an agent may not do on its own. To switch it on, merge this into `.claude/settings.json`
(keep `.claude/launch.json` as is):

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/tools/cloud/setup.sh\" --hook", "timeout": 300 } ] }
    ]
  }
}
```

Without the hook, run `eval "$(bash tools/cloud/setup.sh)"` once at the start of a session.
