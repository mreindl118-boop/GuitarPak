# Helix built-in integration: handoff from Claude to null

- Author / sole writer: Claude. Created: 2026-10-22T21:41Z. Status section
  below is updated at each milestone; the newest commit on
  `feat/helix-stadium` is the truth.
- Authorization: Matt, 2026-10-22: "Integrate the plugin when you reach usage
  limits. Provide handoff instructions for [null] to finish." So Claude works
  until its usage runs out, and null finishes from here.
- Still needs Matt's say-so each time: pushing, merging to `main`, releasing,
  republishing the claude.ai artifact, and any hardware session.

## Goal

The Helix Stadium plugin (`plugins/helix-stadium.js`) hit the 100 KB plugin
cap. It becomes a built-in page: `js/helix.js`, page id `helix`, a fourth pill
"Helix" in the **Guitar** group (Neck · Tab · Notation · Helix). Behaviour stays
the same, with three built-in rules:

1. **Nothing connects at boot.** The plugin connected the bridge
   (`ws://127.0.0.1:4575`) and asked for Web MIDI in `init`. A built-in page
   inits for every user on every launch, so `init` only builds the DOM. MIDI
   is requested on the first `onShow`. The bridge connects only after the user
   pressed *Connect bridge* once (`hx.bridgeAuto`, default **false** now), and
   retries stop while the page is hidden.
2. **The old stored plugin must not run.** Users who loaded the plugin keep
   its code in `guitarlab.plugins.list`. `js/plugins.js` skips a stored plugin
   whose code sets `window.SLHelix` and marks it with an error telling the user
   to remove it (the built-in page replaces it).
3. **Safety unchanged**: disarmed by default, the arm window, the allow-list,
   favorites, observed panel — all as merged from null's work in `5e5bfde`.

## Steps (status)

| # | Step | Status |
|---|---|---|
| 1 | This handoff record | done (`tasks/` on `feat/helix-stadium`) |
| 2 | `js/helix.js` from the plugin: `App.register('helix', …)`, no boot connections, CSS via `App.injectCSS('helix', …)` | done (`3074727`) |
| 3 | `index.html`: `<section class="panel" id="panel-helix">` + `<script src="js/helix.js">` before `js/help.js` | done (`3074727`) |
| 4 | `js/app.js`: `helix` in `SPACES.practice`, Guitar group `pages`, `SPACE_LABELS.helix = 'Helix Stadium'`, `SUB_LABELS.helix = 'Helix'` | done (`3074727`) |
| 5 | `sw.js`: add `'js/helix.js'` to `ASSETS` (the `CACHE` bump is release bookkeeping, step 10) | done (`3074727`) |
| 6 | `js/plugins.js`: skip + flag the old stored Helix plugin | done (`3074727`) |
| 7 | `js/help.js`: `TOURS.helix` (3–4 stops: header strip/arm, views, Preset card) | done (`3074727`) |
| 8 | `plugins/helix-stadium.js`: replace with a short stub that says it is built in (keeps old links working) | done (`3074727`) |
| 9 | Tests: `tests/helix.test.js` drives the built-in page (no plugin injection) + a check that a stored old plugin is skipped; fix any suite that counts Guitar pills (`tests/nav.test.js` likely); run ALL suites | done: all 20 suites in `tests/run.sh` pass, 0 failures (21:47Z run on `8593ca5`) |
| 10 | Release (Matt approves first): `APP_VERSION` 0.82.0, `version.json` `web` + `notes` (never `version`), `android/AndroidManifest.xml` versionCode +1 / versionName, `sw.js` `CACHE` → `guitarlab-v118`; no APK build needed (web-only change) | pending, needs Matt |
| 11 | Docs: `CLAUDE.md` entry moves from `plugins/` to `js/helix.js`; `PLUGINS.md`; `docs/HELIX-STADIUM.md` (no longer "load from Settings › Plugins") | done |
| 12 | Merge to `main`, push, republish the claude.ai artifact (`CLAUDE.md` › claude.ai Artifact) | pending, needs Matt |

## How to verify (PC recipe from `CLAUDE.md` › Dev loop)

```bash
python tests/serve.py
```

That serves the checkout on 127.0.0.1:4573 (stop any other serve.py first; on
Windows two servers can share the port silently). Then, with Playwright 1.49.1
on `NODE_PATH` (one exists at `C:\Users\mrein\AppData\Local\Temp\hxprobe\node_modules`):

```bash
NODE_PATH=/c/Users/mrein/AppData/Local/Temp/hxprobe/node_modules node tests/helix.test.js
```

Run every suite listed in `tests/run.sh` the same way before handing to Matt.
Known: `quiz` had one pre-existing failing assertion on 0.80.0 (see null's
practice-plan handoff); compare against `main` before calling anything a
regression.

## Path claims for this integration

- While Claude works: Claude holds every path in the step table.
- **From the moment Claude stops, null holds them** to finish: `js/helix.js`,
  `index.html` (panel + script lines only), `js/app.js` (the `helix`
  entries only), `sw.js`, `js/plugins.js` (the stored-plugin skip only),
  `js/help.js` (`TOURS.helix` only), `plugins/helix-stadium.js`,
  `tests/helix.test.js`, `tests/nav.test.js` (Guitar pills only),
  `docs/HELIX-STADIUM.md`, `PLUGINS.md`, the Helix entry in `CLAUDE.md`, and
  release bookkeeping in step 10 once Matt approves.
- Unchanged: `tools/helix-bridge.js` and `tools/helix-defs.json` stay as they
  are (no change needed). null's `task-2` stays null's.
- Work in the `feat/helix-stadium` worktree
  (`C:\Users\mrein\Creative-Workspace\GuitarPak-helix`) or your own worktree
  of that branch. Never the install checkout
  `C:\Users\mrein\Creative-Workspace\GuitarPak` (Matt's Desktop soundLAB).
  No force-push. Recheck `origin` before any push.

## UPDATE 2026-10-24: `main` moved; read this before step 10

The release numbers in the step-10 table below are **stale**. Since this
branch was cut from `e9426ce` (0.81.1), `main` went to **1.0.0** (`2077f3b`,
2026-10-23), and a 1.1.0 release is being prepared on
`codex/soundlab-1.1-workflow-20261023` (`APP_VERSION` 1.1.0).

- **Take every number from `main` at merge time.** As of `2077f3b`:
  `APP_VERSION` 1.0.0, `version.json` `web` 1.0.0 (`version` still 0.75.0,
  never touch it), `versionCode` 110 / `versionName` 0.82.0,
  `CACHE` `guitarlab-v124`. Bump each by one from whatever `main` holds then.
- **Replace the "0.82.0" label** with the version Helix actually ships in, in
  7 files: `js/helix.js` (header), `js/plugins.js` (comment),
  `plugins/helix-stadium.js` (comment and the error message),
  `docs/HELIX-STADIUM.md`, `PLUGINS.md`, the Helix entry in `CLAUDE.md`, and
  `tests/helix.test.js` (header comment).
- **Trial merge** (`git merge-tree --write-tree origin/main
  feat/helix-stadium`, 2026-10-24): two conflicts, both additive, everything
  else auto-merges (`CLAUDE.md`, `index.html`, `js/help.js`, `sw.js`,
  `tests/nav.test.js`):
  - `js/app.js`, 4 hunks (`SPACES.practice`, `SPACE_LABELS`, the Guitar and
    Keys lines in `GROUPS`, `SUB_LABELS`): `main` added `lumipractice`, this
    branch added `helix`. Keep `main`'s lines and add the `helix` entries:
    `'helix'` after `'notation'` in `SPACES.practice`,
    `helix: 'Helix Stadium'`, Guitar `pages` `['fretboard', 'tab',
    'notation', 'helix']`, `helix: 'Helix'`.
  - `tests/run.sh`: keep `main`'s list (now about 40 suites) and append
    `helix`.
- **After the merge, run `main`'s full suite list**, not the 20 suites this
  branch was verified against. Check `tests/nav.test.js` still expects the
  Guitar pills `Neck|Tab|Notation|Helix`.
- Name the release branch for the real version (`release/<version>`), not
  `release/0.82.0`.

## How null finishes (steps 10 and 12; Matt approves each)

**Step 10, release bookkeeping** (exact values as of `8593ca5`; recheck
`origin/main` first, and if it moved past `e9426ce`, merge it in and bump from
its numbers instead):

| File | Change |
|---|---|
| `js/app.js` | `var APP_VERSION = '0.81.1';` → `'0.82.0'` |
| `version.json` | `"web": "0.81.1"` → `"0.82.0"`; new `"notes"` (suggested below). **Never touch `"version"`** (the APK channel, `0.75.0`). |
| `android/AndroidManifest.xml` | `versionCode="109"` → `"110"`, `versionName="0.81.1"` → `"0.82.0"` |
| `sw.js` | `var CACHE = 'guitarlab-v117';` → `'guitarlab-v118'` (`js/helix.js` is already in `ASSETS`) |

No APK build: nothing in `android/` changes functionally, and the app loads
the live site (`CLAUDE.md` › Cloud / mobile sessions).

Suggested `notes`: "Helix Stadium (Guitar › Helix): control a Line 6 Helix
Stadium from soundLAB over USB MIDI (presets, snapshots, knobs, pedals,
looper) and, with the helper running on your computer, edit the loaded preset
block by block. Nothing is sent until you press Arm."

**Step 12, merge and go live** (Matt says yes first, every time):

1. `git worktree add <new folder> -b release/0.82.0 origin/main`, then
   `git merge --no-ff feat/helix-stadium` there. Never the install checkout.
2. Do step 10 in that worktree; run every suite; check the page in a browser
   after unregistering the service worker and clearing caches (reload twice).
3. Push `release/0.82.0`; with Matt's yes, push it to `main` as a
   fast-forward (`git push origin release/0.82.0:main`). No force-push.
4. GitHub Pages republishes from `main` (the `gh-pages` mirror commits).
5. **Claude only:** republishing the claude.ai artifact needs Claude's Artifact
   tool (`CLAUDE.md` › claude.ai Artifact). Note it in your record and leave it.
6. Write your completion record (`tasks/<UTC>-helix-builtin-done-null.md`) with
   the commits, suite results and anything left.

**After release, with Matt watching** (hardware handshake: one owner, claim
and release in a record): the favorite recall with a snapshot, the setlist
CC32 mapping, the arm/disarm flow, and whether the Mixer view does anything on
firmware 1.1.0.

## Where Claude stopped

(updated at each milestone; see the newest commit message too)

- 21:41Z: record written; no code changed yet.
- 21:43Z: steps 2-8 committed as `3074727` (built-in page wired; plugin is a stub). Next: step 9 tests.
- 21:45Z: tests converted (`tests/helix.test.js` 54 checks, `tests/nav.test.js` Guitar pills) and one bug fixed: the first visit now always requests the page's own Web MIDI access (the boot-time `midi:state` could leave it on the shared output with no input). Next: run every suite.
- 21:46Z: docs updated (`8593ca5`), step 11 done.
- 21:55Z: **Claude stopped here.** Steps 1-9 and 11 are done and verified; every suite passes (fingering, lights, keys, practice, game, quiz, nav, smoke, taps, update, audio-level, midihub, midihub-wheel, audioin, btmidi, colors, multiin, lumidisplay, practiceplan, helix). The page was also checked by eye in a browser under Guitar › Helix: disarmed, bridge off, no connection. **null: steps 10 and 12 are yours once Matt says yes**, from the section "How null finishes". Nothing here is pushed yet unless Matt asked Claude to push it.
- 2026-10-24: both branches pushed on Matt's say-so (`feat/helix-stadium` at `46bd301`, coord at `857b05a`). `main` had moved to 1.0.0, so the dated UPDATE section above the finishing steps was added; follow it over the old numbers.
