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
| 9 | Tests: `tests/helix.test.js` drives the built-in page (no plugin injection) + a check that a stored old plugin is skipped; fix any suite that counts Guitar pills (`tests/nav.test.js` likely); run ALL suites | helix (54) + nav (33) pass; full run in progress |
| 10 | Release (Matt approves first): `APP_VERSION` 0.82.0, `version.json` `web` + `notes` (never `version`), `android/AndroidManifest.xml` versionCode +1 / versionName, `sw.js` `CACHE` → `guitarlab-v118`; no APK build needed (web-only change) | pending, needs Matt |
| 11 | Docs: `CLAUDE.md` entry moves from `plugins/` to `js/helix.js`; `PLUGINS.md`; `docs/HELIX-STADIUM.md` (no longer "load from Settings › Plugins") | pending |
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

## Where Claude stopped

(updated at each milestone; see the newest commit message too)

- 21:41Z: record written; no code changed yet.
- 22:0xZ: steps 2-8 committed as `3074727` (built-in page wired; plugin is a stub). Next: step 9 tests.
- 22:1xZ: tests converted (`tests/helix.test.js` 54 checks, `tests/nav.test.js` Guitar pills) and one bug fixed: the first visit now always requests the page's own Web MIDI access (the boot-time `midi:state` could leave it on the shared output with no input). Next: run every suite.
