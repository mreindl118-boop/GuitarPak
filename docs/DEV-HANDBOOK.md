# soundLAB developer handbook (start here)

Written 2026-11-02, after the owner (Matt) lost reliable access to the Windows laptop (an ASUS
StudioBook) that ran several Claude Code chats through Remote Control. This page is the one place to
start for anyone who continues soundLAB without that laptop. It says where everything lives, how to set
up, and every dev / test / release / publish process with exact commands. It links to the specialised
docs instead of copying them.

Companion pages:

- [MODX-SOUNDLAB.md](MODX-SOUNDLAB.md): the Yamaha MODX8+ knowledge (setup, what is verified on
  hardware, open hardware tests, MIDI bridging per platform, pitfalls).
- [CHATS-AND-HISTORY.md](CHATS-AND-HISTORY.md): every chat that worked on soundLAB, every branch, and
  when each old chat can be deleted.

Unless marked otherwise, every process below was run in the cloud session
`session_01U4zwjurMuVa98eDXtapWqV` on 2026-11-02, on `claude/verify-project-files-4bchk6` @ `bc47da5`
(PR #90, web 1.4.0 candidate). `main` was `129720b` (web 1.3.1, live).

## 1. Where everything lives

| What | Where | Notes |
|---|---|---|
| Source | GitHub `mreindl118-boop/GuitarPak` (public), default branch `main` | The only source of truth. The laptop's checkouts are gone. |
| Live site (PWA) | `gh-pages` branch, served at `https://mreindl118-boop.github.io/GuitarPak/` | Written only by `.github/workflows/pages.yml`. Never delete `gh-pages`. |
| Android APK | `releases/soundLAB-alpha.apk` (+ the `GuitarLab-alpha.apk` copy) on `main` | Last built 0.75.0 / versionCode 100 (`639a571`). The app loads the live site, so web releases need no new APK. |
| Windows launcher | `releases/soundLAB-windows.bat`, shipped as `releases/soundLAB-windows.zip` | The zip is stale (section 4.9). |
| iOS app | built by `.github/workflows/ios.yml` on GitHub's Mac runner | Probably broken (section 4.8). |
| The app on claude.ai | artifact `https://claude.ai/artifact/R2c52cb7YA8xur86NNqpHs` ("soundLAB") | Private to Matt's account until shared. |
| APK signing key | private claude.ai artifact "soundLAB Signing Key" (`https://claude.ai/artifact/VWL2AAhC1JQe6XXBPnNLKr`), file `soundlab.keystore.b64` | Never in the repo. Section 4.7 and 5. |
| Synth Deck design boards | artifact `https://claude.ai/artifact/Xu1nFDWkBM7SnjweQV5fSD` ("Synth Deck design options") | Matt chose option A, strips (`docs/SYNTH-TAB.md`). |
| Coordination records | branch `coord/cowork-20261022-claude` (`tasks/*.md`), plus `tasks/` on `main` | The written memory of the laptop chats. Read: `git show origin/coord/cowork-20261022-claude:tasks/<file>`. |
| Work not yet on `main` | PR #90 and five branches without a PR | Listed in [CHATS-AND-HISTORY.md](CHATS-AND-HISTORY.md) section 3. Do not delete them. |

## 2. Environments

### 2.1 This cloud environment (claude.ai/code): use it first

The container a cloud session gets (checked 2026-11-02):

| Tool | In the container | Notes |
|---|---|---|
| Node | `/opt/node22/bin/node` v22.22.2 | CI uses Node 24; both pass the suites. |
| Playwright | global `/opt/node22/lib/node_modules/playwright` 1.56.1 | CI pins 1.62.1 (`.github/workflows/tests.yml`). |
| Chromium | `/opt/pw-browsers/chromium` (build 1194, matches Playwright 1.56.1) | Headless only. |
| Python | `python3` 3.11.15 | Serves the app; runs the SheetLab reference (needs 3.11+). |
| JDK | OpenJDK 21 (`javac`, `keytool`) | Use r8 8.7.x as `D8_JAR` for the APK (section 4.7). |
| Android SDK | not preinstalled | `tools/cloud/setup.sh --android` downloads it (section 3). |
| Xcode | none (Linux) | iOS builds only on GitHub's Mac runner. |
| `gh` | Claude Code's built-in `gh api` (REST only) | Actions artifact and log downloads, Pages settings and secrets are refused through the proxy. |

The repo is at `/home/user/GuitarPak`. The checkout can be shallow: run
`git fetch origin <branch>` (or `git fetch --unshallow`) before reading old history. Each session also
has a **scratchpad** folder under `/tmp/claude-0/...` (the session prompt names it). The scratchpad
belongs to that one session and disappears when the container is recycled: never keep anything there
that is not also in git or regenerable.

Network that answered through the session proxy: `dl.google.com`, `maven.google.com`,
`registry.npmjs.org`, `pypi.org`, `github.com`, `raw.githubusercontent.com`,
`objects.githubusercontent.com`, `mreindl118-boop.github.io`.

What the cloud **cannot** do:

- Reach any hardware (MODX8+, LUMI, Helix Stadium, phones, iPad). See section 6.
- Build iOS outside GitHub Actions, or run the Windows `.bat`.
- Recover anything that was only on the laptop (see [CHATS-AND-HISTORY.md](CHATS-AND-HISTORY.md)
  section 6).

### 2.2 A PC later (Windows, Mac or Linux)

Everything in section 4 also runs on a PC. What a PC adds is **hardware**: a real browser next to the
MODX8+ / LUMI / Helix.

- Node 24 and `npm i playwright@1.62.1 && npx playwright install chromium` in a scratch folder; point
  `NODE_PATH` at its `node_modules` (CLAUDE.md "Dev loop").
- Python 3.11+ for `tests/serve.py`.
- For the APK: JDK 17 or 21, Android `platforms;android-34` and `build-tools;34.0.0`, r8 8.7.x.
  `android/build.ps1` (PowerShell) or `android/build.sh` (bash).
- **Hardware tests need an installed Chrome or Edge.** Playwright's bundled Chromium 131 crashed on any
  send to the MODX on the laptop (`tasks/20261027T0000Z-release-1.3.1-claude.md` on the coord branch).
- On Windows: the Yamaha Steinberg USB Driver for the MODX; Chrome/Edge started with
  `--enable-features=MidiManagerWinrt` for Bluetooth MIDI (the launcher does it).

The laptop's own folders (`C:\Users\mrein\AndroidBuildTools`, the install checkout
`C:\Users\mrein\Creative-Workspace\GuitarPak`, `%TEMP%\sl-*` worktrees) are not needed: each has a
replacement here.

## 3. Setup

```sh
cd /home/user/GuitarPak
eval "$(bash tools/cloud/setup.sh)"              # Node side: Playwright + the SheetLab packages
eval "$(bash tools/cloud/setup.sh --android)"    # also the Android SDK pieces and r8 (checksum-verified)
eval "$(bash tools/cloud/setup.sh --python)"     # also the SheetLab Python reference (slow, ~1.2 GB)
```

The script prints only shell `export` lines on stdout, so `eval` puts them into the current shell:
`NODE_PATH` and `CHROMIUM`; with `--android` the variables `android/build.sh` reads (`ANDROID_JAR`,
`BUILD_TOOLS`, `D8_JAR`) plus `AAPT`; with `--python` `SL_OMR_PYTHON` and `SL_OMR_MODELS`. It caches
downloads in `$SL_CACHE` (default `~/.cache/soundlab`), never writes the repo, never fetches the
signing key, and is safe to re-run. `--hook` is its SessionStart-hook mode (cloud only, Node step only);
`--help` lists the options. Its header names exactly what it downloads; each mode, the hook and the
throwaway-key APK rehearsal are explained in [tools/cloud/README.md](../tools/cloud/README.md).
Checked by a fresh contributor on 2026-11-02 with an empty `SL_CACHE`: the default run took 4.5 s and
`--android` 6.5 s, both exit 0.

If the script is missing or fails, these are the manual steps it replaces (all run here on
2026-11-02):

```sh
S=<scratchpad>/node-deps
npm install --prefix "$S" --no-save --ignore-scripts \
  onnxruntime-web@1.31.1 @techstark/opencv-js@5.0.0-release.1 pdfjs-dist@4.10.38      # ~13 s
export NODE_PATH=/opt/node22/lib/node_modules:$S/node_modules CHROMIUM=/opt/pw-browsers/chromium
```

Android pieces (SHA-1 checked against Google's repository XML / Maven `.sha1`):

| Piece | URL | SHA-1 |
|---|---|---|
| `platforms;android-34` | `https://dl.google.com/android/repository/platform-34-ext7_r03.zip` | `1f2e9478d6a7601425ceaa553311dc43191f103d` |
| `build-tools;34.0.0` (Linux) | `https://dl.google.com/android/repository/build-tools_r34-linux.zip` | `d6d58e0c6925a9e4d9a541e84cd1f405c2f9d2a9` |
| r8 8.7.18 (`D8_JAR`) | `https://maven.google.com/com/android/tools/r8/8.7.18/r8-8.7.18.jar` | `c005831622e05397a450d640a016ab66c0c64342` |

The build-tools zip unpacks to a folder named `android-14` (its `source.properties` says 34.0.0).
`ANDROID_JAR=<sdk>/platforms/android-34/android.jar`, `BUILD_TOOLS=<sdk>/build-tools/android-14`,
`AAPT=$BUILD_TOOLS/aapt`.

## 4. Processes

### 4.1 Serve and look at the app

```sh
python3 tests/serve.py                     # port $SL_PORT, default 4573
python3 -m http.server 4573                # the old launch config (.claude/launch.json "guitarlab")
```

There is no visible browser in the cloud: use headless Playwright or the `run` skill for screenshots.
The service worker is cache-first: bump `CACHE` in `sw.js` after edits, and clear it in previews
(CLAUDE.md "Dev loop").

### 4.2 Regression suites

```sh
cd /home/user/GuitarPak
SL_LOG_DIR=<scratchpad>/test-logs bash tests/run.sh            # all 74 suites
bash tests/run.sh synthdeck synthtab synthconnect midihub      # just these
SL_PORT=4591 bash tests/run.sh ...                             # if 4573 is busy
```

- All 74 suites passed here on `bc47da5`: "ALL SUITES PASS", about 20 minutes on 4 cores, 3,119
  checks with `AAPT` set (3,117 without it). 7 suites print "skipped": the Python-parity OMR suites
  without `SL_OMR_FIXTURES` (`omr-cv`, `omr-pil`, `omr-boxes`, `omr-model`, `omr-segment`, `omr-staff`,
  `omr-read`), exactly as in CI. A fresh contributor repeated the full run the same day from a new clone
  and an empty `SL_CACHE`: same result, 19 min 50 s, 3,117 checks (no `AAPT`).
- With `AAPT` set, `update.test.js` also checks that `version.json` `version` equals the committed APK's
  versionName (10 checks instead of 8).
- `pages-deploy` and `release-workflow` fail on a Windows checkout (CRLF vs LF regexes); run them on
  Linux or CI (`tasks/20261026T0600Z-release-1.3.0-claude.md`, coord branch).
- To match CI exactly, install `playwright@1.62.1` into the scratch folder, run
  `npx --prefix "$S" playwright install chromium`, and set `CHROMIUM` to that browser.
- Add a suite or checks for every new feature (CLAUDE.md "Dev loop").

### 4.3 SheetLab Python parity (optional)

Only needed when changing `js/omr/`. Follow [tools/omr/README.md](../tools/omr/README.md): homr at
`2d7e8c3b500ab9af10e579bebab8c0d9e551eb71`, a Python 3.11+ venv with the pinned packages, then
`SL_OMR_FIXTURES`, `SL_OMR_MODELS` and `SL_OMR_PYTHON` for `tests/omr-*.test.js`.
`tools/cloud/setup.sh --python` builds the venv, homr with its weights and the models, and exports
`SL_OMR_PYTHON` / `SL_OMR_MODELS`; the fixtures still come from the README's `tools/omr/dump_*.py`
steps.

The reference data built in the cloud chat (venv, homr clone with weights, about 745 MB of fixtures)
sits only in that session's scratchpad. All of it is regenerable from the README. Two parity suites
were rerun here against it: omr-pil 14/14, omr-cv 341/341. The one piece that was not regenerable, the
owner's `sheetlab_engine.py` (`dump_e2e.py` / `dump_sheetlab_prep.py` take it with `--engine`), is now in
the repo as `tools/omr/sheetlab_engine.py`, and the port notes are in `tools/omr/notes/` (`OMR-PORT.md`
plus one note per area).

### 4.4 A web release (the normal kind)

The rules are in CLAUDE.md "Release checklist"; `docs/RELEASE-1.0.0-CHECKLIST.md` and
`docs/RELEASE-1.3-CHECKLIST.md` show worked examples.

1. Work on a branch (`claude/<topic>` from the cloud). Never on `main`.
2. Stamp: `APP_VERSION` in `js/app.js`; `version.json` **`web` and `notes` only**; `sw.js` `CACHE`
   (+1; `main` is `guitarlab-v128`, PR #90 uses `v132`) and `ASSETS` for new files.
3. **Never touch `version.json` `version`.** It is the APK channel; only `android/build.sh` /
   `build.ps1` move it. Moving it by hand once sent Android users into an update loop (fixed in 0.70.1).
4. Run all suites (4.2). Push the branch, open a PR against `main`.
5. **Going live needs Matt's explicit go, each time** (coord rule, `tasks/20261022-cowork-split-claude.md`
   on the coord branch, not on `main`).
   On his go: merge the PR (GitHub UI, or `gh api` from a session with push access).
6. Check the live site after the Pages run (4.5), then republish the claude.ai artifact (4.6).

### 4.5 CI and the Pages deploy

- `.github/workflows/tests.yml` ("Test soundLAB") runs all suites on every PR, on manual dispatch and
  when called by the Pages workflow. Ubuntu, Node 24, Playwright 1.62.1, 45-minute limit.
- `.github/workflows/pages.yml` ("Deploy GitHub Pages") runs on each push to `main`: the full test job
  first, then a snapshot commit of the exact tested tree (+ `.nojekyll`) on `gh-pages`, with an ordinary
  push. Details: [CI-DEPLOYMENT.md](CI-DEPLOYMENT.md).
- Check what is live:

  ```sh
  curl -s https://mreindl118-boop.github.io/GuitarPak/version.json      # web 1.3.1 on 2026-11-02
  gh api repos/mreindl118-boop/GuitarPak/branches/gh-pages --jq .commit.sha
  gh api "repos/mreindl118-boop/GuitarPak/actions/runs?per_page=5" --jq '.workflow_runs[]|[.name,.head_sha[0:7],.conclusion]'
  ```

### 4.6 The claude.ai artifact (the app inside claude.ai)

Full steps in CLAUDE.md "claude.ai Artifact".

```sh
python3 tools/artifact_build.py <scratchpad>/artifact      # 174 files, 8.9 MB on bc47da5
```

Then the Artifact tool: `action: read` on `https://claude.ai/artifact/R2c52cb7YA8xur86NNqpHs` first
(required when this session did not create it), then publish with `url` = that URL,
`file_path` = `<staged>/index.html`, `root` = `<staged>`, `files` = only the changed assets.
`models/` is never staged (77 MB); Scan points to the full site inside the artifact.

Known versions: v19 = 0.81.0, v20 = 0.81.1, v22 = 1.1.0, v24 = 1.3.0, v25 = 1.3.1 (coord records). The
gallery shows a later update on 2026-10-29 from the cloud chat (most likely the 1.4.0 candidate; the
build was not re-read). Check which build it holds before the next publish, so it does not run ahead
of the live site by accident.

### 4.7 The Android APK, in the cloud

Build one **only** when `android/` changes (MainActivity, MidiBridge, the manifest): web releases need
no APK because `MainActivity` loads `LIVE_URL` (the Pages site).

A build with a throwaway key worked here end to end on 2026-11-02 (`apksigner verify`: v2 + v3,
`zipalign -c 4` OK, `com.mreindl.soundlab` 110 / 0.82.0; repeated by a fresh contributor the same
day). To rehearse without the real key, use the recipe under "The APK signing key" in
[tools/cloud/README.md](../tools/cloud/README.md): it copies the tree to the scratchpad first, because
`build.sh` rewrites `releases/*.apk` and `version.json` `version` in the tree it runs from. Never
rehearse in `/home/user/GuitarPak`. Steps for a real build:

1. **Choose the version on purpose.** `android/AndroidManifest.xml` already says versionCode 110 /
   versionName 0.82.0 (bumped during web releases), but the shipped APK is 100 / 0.75.0. Set
   versionCode to 111 or higher and a deliberate versionName (for example the web version). `build.sh`
   copies that versionName into `version.json` `version`.
2. Toolchain: `eval "$(bash tools/cloud/setup.sh --android)"` (section 3). With JDK 21, `D8_JAR` (r8 8.7.x) is
   required: build-tools 34's own `d8` crashes (`NullPointerException` on `MidiBridge$Js.class`;
   reproduced here).
3. **Fetch the signing key without committing it.** The key never enters the repo, a commit, a log or
   a chat message.
   - Artifact tool: `action: read`, `url: https://claude.ai/artifact/VWL2AAhC1JQe6XXBPnNLKr`,
     `path: soundlab.keystore.b64`. Leave `out_dir` at its default (the session scratchpad). Never set
     it inside `/home/user/GuitarPak` (the repo ignores `*.keystore` and `*.keystore.b64`, as a safety net only).
   - Decode it into a private folder in the scratchpad, without printing it:

     ```sh
     K=<scratchpad>/key; mkdir -p "$K"; chmod 700 "$K"
     base64 -d "<path the read result gave>/soundlab.keystore.b64" > "$K/soundlab.keystore"
     ```
4. Build:

   ```sh
   cd /home/user/GuitarPak
   KEYSTORE="$K/soundlab.keystore" bash android/build.sh      # ANDROID_JAR, BUILD_TOOLS, D8_JAR set
   "$BUILD_TOOLS/apksigner" verify --print-certs releases/soundLAB-alpha.apk | grep 'certificate SHA-256'
   ```

   The certificate SHA-256 must start `5a10ecb5` and end `d0fd171a` (public certificate data, also in
   CLAUDE.md). Compare the "certificate SHA-256 digest" line, not the "public key SHA-256 digest" line
   that `--print-certs` also prints. Anything else means the wrong key: stop, do not commit.
5. Clean up: `rm -f "$K/soundlab.keystore" "<path>/soundlab.keystore.b64"`. Then `git status --short`
   must list only `releases/soundLAB-alpha.apk`, `releases/GuitarLab-alpha.apk`, `version.json` and
   `android/AndroidManifest.xml`.
6. Commit on a branch, open a PR, merge on Matt's go. He installs from
   `https://github.com/mreindl118-boop/GuitarPak/raw/main/releases/soundLAB-alpha.apk`. Same key = an
   in-place update.

Never generate a new key: a different key forces every Android user to uninstall and reinstall.
`android/build.sh` refuses to run without `KEYSTORE`. The repo ignores `*.keystore` and
`*.keystore.b64`, but keep the decoded key in the scratchpad anyway, never inside the checkout.

### 4.8 iOS (unsigned IPA through GitHub Actions)

- `.github/workflows/ios.yml` ("iOS app (unsigned IPA)") runs on `macos-15` with XcodeGen. It runs by
  itself when `ios/**` changes on `main`, or by hand: GitHub › Actions › "iOS app (unsigned IPA)" ›
  Run workflow. The output is the artifact `GuitarLab-unsigned-ipa` (kept 30 days).
- Install by sideloading (AltStore or SideStore with Matt's free Apple ID; re-signed every 7 days), or
  Xcode on a Mac: [ios/README.md](../ios/README.md).
- Last run: 2026-10-22 on `6a5891f`, success. **But the IPA is probably blank:** the artifact is only
  43 KB while the web files alone are about 9 MB. `ios/project.yml` lists `WebAssets` under a key
  `resources:`, which XcodeGen does not have (resources belong under `sources:`), and
  `ios/sync-web.sh` does not copy `data/`. Fix both, rerun, and check the artifact is several MB. Not
  confirmed: the proxy refuses artifact downloads.
- Triggering the workflow from a session is a write
  (`gh api -X POST repos/mreindl118-boop/GuitarPak/actions/workflows/ios.yml/dispatches -f ref=main`):
  only on Matt's go.

### 4.9 Windows desktop launcher

`releases/soundLAB-windows.bat` finds Edge or Chrome, downloads the icon, and makes Desktop and Start
Menu shortcuts that open the Pages site with `--enable-features=MidiManagerWinrt --app=<URL>`. GitHub
serves a bare `.bat` as text, so README links the zip.

**The committed zip is stale:** it still holds the 0.77.2 `.bat` without the Bluetooth MIDI switch.
Rebuild it (keeps the CRLF line ends):

```sh
cd /home/user/GuitarPak/releases && zip -X -j soundLAB-windows.zip soundLAB-windows.bat
```

### 4.10 Helix Stadium bridge

```sh
node tools/helix-bridge.js [host-or-ip] [--port 4575] [-v]
```

- Zero dependencies; runs anywhere Node runs (a Mac, a Raspberry Pi, Android Termux).
- It listens on **127.0.0.1 only** (the pedal has no authentication) and the Helix page connects to
  `ws://127.0.0.1:4575`, so the bridge must run on the same device as the browser.
- It needs a LAN path to the pedal (or USB on firmware 1.4 with `feat/helix-deck`'s bridge 0.2.0). The
  cloud cannot reach it; here it was only smoke-tested (`--help`, loads 828 models, answers on
  loopback).
- Details: [HELIX-STADIUM.md](HELIX-STADIUM.md); open hardware steps:
  [MODX-SOUNDLAB.md](MODX-SOUNDLAB.md) section 5.

### 4.11 My library sync (1.4.0, PR #90)

Per device, in the app: Settings › Library sync, with a fine-grained GitHub key kept in that browser's
`localStorage` (`soundlab.secret.library`, never in backups). It writes to the orphan branch `library`,
which does not exist yet (nothing was synced so far). Details: [LIBRARY.md](LIBRARY.md).

## 5. Secrets and accounts (names and places only, never values)

| Secret / account | Used for | Where it lives | Note |
|---|---|---|---|
| APK signing key `soundlab.keystore` (passwordless PKCS12; cert SHA-256 `5A:10:EC:B5:...:D0:FD:17:1A`) | signing the APK | Matt's private claude.ai artifact "soundLAB Signing Key", file `soundlab.keystore.b64` (verified 2026-11-02: decoded, alias `soundlab`, certificate SHA-256 equal to the shipped `releases/soundLAB-alpha.apk`'s; the checked copy was deleted). Maybe also a copy on the laptop. | Keep a second offline copy (password manager or encrypted drive). Losing it forces every Android user to reinstall. |
| Retired key `guitarlab.keystore` (old `com.mreindl.guitarlab`) | nothing now | probably only on the laptop | Low impact: that app is retired. |
| GitHub account `mreindl118-boop` | merges, Pages, Actions, iOS workflow | GitHub | Make sure the 2FA recovery codes were not kept only on the laptop. |
| Claude GitHub App connection | cloud sessions push `claude/*` branches and open PRs | claude.ai › Settings › Connectors | |
| Laptop git credentials (Git Credential Manager token; no GitHub CLI was installed) | laptop pushes and PR merges via the REST API | the laptop | Revoke tokens issued to that machine: github.com/settings/tokens and /settings/applications. |
| Library sync key (fine-grained PAT) | `js/library.js` | each browser's `localStorage['soundlab.secret.library']` | If one was made for the laptop's browser, revoke it at github.com/settings/personal-access-tokens. |
| `GITHUB_TOKEN` | `pages.yml` | GitHub Actions, per run | The workflows use no stored `secrets.*`. |
| Apple ID (free) | sideloading the IPA | Matt's Apple account; AltServer pairing on whichever computer ran it | If AltServer ran on the laptop, 7-day refreshes stop: use SideStore or a Mac. |
| claude.ai account | artifacts, sessions, scheduled tasks | claude.ai | |
| Codex / OpenAI login (agent "null") | coworking tasks | unknown, likely the laptop | Log in again elsewhere if needed. |
| Helix Stadium | bridge | no credential: the pedal has no authentication | Keep the bridge on loopback. |

## 6. Hardware you need, per test

| Test | Hardware | Where the steps are |
|---|---|---|
| Everything web-side (74 suites, fake MIDI ports, fake bridges) | none: the cloud | 4.2 |
| MODX finger-tap test (the open item of 1.3.1) and the unchecked MODX items | MODX8+ on USB + a computer with installed Chrome/Edge (Yamaha driver on Windows) or Android Chrome + USB-OTG | [MODX-SOUNDLAB.md](MODX-SOUNDLAB.md) 5.1-5.2 |
| iPad Synth tab | iPad + USB camera adapter + MODX + a Web MIDI browser app | MODX-SOUNDLAB 5.3 |
| LUMI colour calibration, relight switch | LUMI Keys Block over Bluetooth + Windows Chrome with the WinRT switch (or Android) | MODX-SOUNDLAB 5.4 |
| Helix over USB on firmware 1.4; Helix MIDI checks | Helix Stadium XL + a Windows PC with Node, or the pedal on the LAN | MODX-SOUNDLAB 5.5-5.6 |
| Android APK MidiBridge (USB, Bluetooth) | an Android phone, USB-OTG cable, the MODX or LUMI | MODX-SOUNDLAB 5.7 |
| Practice router (scale-locked synth sound) | MODX with Local Control OFF + LUMI | MODX-SOUNDLAB 5.8 |
| Controller remote (pedal, synth button, page turner) | MODX foot switch or A.SW, or a Bluetooth page turner | [CONTROLLER-REMOTE.md](CONTROLLER-REMOTE.md) |
| iOS CoreMIDI bridge | iPad + a working IPA (4.8) | [ios/README.md](../ios/README.md) |

## 7. How we work

- **Branches.** Cloud sessions work on `claude/<topic>` branches. Everything reaches `main` through a
  PR. No force-push; recheck the remote head before each push (`git fetch` first). The laptop chats
  used `feat/*`, `fix/*`, `release/*`, `check/*`; those names remain in records.
- **PRs and going live.** Matt reviews from his phone. A merge to `main` deploys the site, so it needs
  his explicit go each time. Read-only work (inventories, reviews) never pushes, comments or merges.
- **Trailers.** Every commit ends with `Co-Authored-By:` and a
  `Claude-Session: https://claude.ai/code/session_...` line; PR bodies end with the Claude Code line.
  The laptop chats left no `Claude-Session` trailer, which is why their history had to be reconstructed
  ([CHATS-AND-HISTORY.md](CHATS-AND-HISTORY.md)). Keep the trailer.
- **Records.** When agents share the repo, each writes its own record
  `tasks/<UTC>-<topic>-<owner>.md`: exact path claims, branch, base, what landed, what is open. Claims
  are advisory. Only Claude stamps `APP_VERSION`, `version.json` `web` and the sw `CACHE`
  (`tasks/20261022-cowork-split-claude.md` and the version-order record on the coord branch).
- **Secrets.** Name where they live; never copy, print or commit a value (section 5).
- **The daily watch.** A scheduled task "Daily GuitarPak activity check" (`trig_01B4zrc9peSygP66HW2grqnR`)
  fires every day at 09:07 New York time into the cloud session `session_01U4zwjurMuVa98eDXtapWqV`. It
  fetches, lists every remote branch head and the open PRs, and compares them with the baseline files
  `watch-heads.txt` / `watch-prs.txt` in that session's scratchpad. It stays silent when nothing
  changed (gh-pages-only moves are ignored) and otherwise tells Matt what is new, then updates the
  baseline. It is read-only: it never pushes, comments or merges. It was hourly until 2026-10-26.
  Because it fires into that session, deleting that chat stops the watch. If the baseline files vanish
  with the container, its built-in fallback baseline is older (main `3890488`), so its first report
  after that is just a catch-up.

## 8. Known problems to fix (found 2026-11-02)

| Problem | Fix | Section |
|---|---|---|
| The MODX8+ and LUMI hardware findings are on `check/modx-maps-claude` and `check/lumi-claude`, not on `main`; no PR exists; `main`'s docs and map contradict the hardware | Merge or port both (the first merges cleanly; the second conflicts only in `tests/run.sh`) | [MODX-SOUNDLAB.md](MODX-SOUNDLAB.md) 7 |
| Web 1.4.0 is claimed twice: PR #90 (remote + SheetLab + library) and null's recognizer (`tasks/20261025T0300Z-version-order-1.3-claude.md`) | Whichever lands second re-stamps; decide with Matt | [CHATS-AND-HISTORY.md](CHATS-AND-HISTORY.md) 8 |
| `feat/helix-deck` stamps sw `CACHE` `guitarlab-v128`, the same as live `main` | Re-stamp when it lands | CHATS-AND-HISTORY 3 |
| Windows zip stale (no Bluetooth MIDI switch) | 4.9 | 4.9 |
| iOS IPA probably blank | 4.8 | 4.8 |
| Manifest 0.82.0 / 110 vs shipped APK 0.75.0 / 100 | choose on the next APK build | 4.7 |

## 9. The specialised docs

| Topic | Doc |
|---|---|
| Agent guide, module map, conventions, release checklist | [CLAUDE.md](../CLAUDE.md) |
| CI and Pages | [CI-DEPLOYMENT.md](CI-DEPLOYMENT.md) |
| Release examples | [RELEASE-1.0.0-CHECKLIST.md](RELEASE-1.0.0-CHECKLIST.md), [RELEASE-1.3-CHECKLIST.md](RELEASE-1.3-CHECKLIST.md) |
| MODX8+ and MIDI bridging | [MODX-SOUNDLAB.md](MODX-SOUNDLAB.md), [MODX-MIDI-REFERENCE.md](MODX-MIDI-REFERENCE.md), [SYNTH-DECK.md](SYNTH-DECK.md), [SYNTH-TAB.md](SYNTH-TAB.md), [SYNTH-TAB-PLAN.md](SYNTH-TAB-PLAN.md) |
| LUMI | [NOTE-PALETTE.md](NOTE-PALETTE.md), [LUMI-PRACTICE.md](LUMI-PRACTICE.md), [PRACTICE-ROUTER.md](PRACTICE-ROUTER.md), [EXTERNAL-MIDI-COVERAGE.md](EXTERNAL-MIDI-COVERAGE.md) |
| Helix Stadium | [HELIX-STADIUM.md](HELIX-STADIUM.md) (more on `feat/helix-deck`: `docs/HELIX-DECK.md`, `docs/HELIX-USB.md`) |
| Hands-free control | [CONTROLLER-REMOTE.md](CONTROLLER-REMOTE.md) |
| SheetLab, My library | [SHEETLAB.md](SHEETLAB.md), [tools/omr/README.md](../tools/omr/README.md), [LIBRARY.md](LIBRARY.md) |
| iOS | [ios/README.md](../ios/README.md) |
| Chats, branches, deletion checklist | [CHATS-AND-HISTORY.md](CHATS-AND-HISTORY.md) |
| Earlier audits | [BRANCH-AUDIT-2026-10-23.md](BRANCH-AUDIT-2026-10-23.md) (partly stale), [VALIDATION-2026-10-23.md](VALIDATION-2026-10-23.md) |
