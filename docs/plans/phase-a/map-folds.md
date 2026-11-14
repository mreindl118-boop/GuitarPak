# Phase A map — the plug-in API and the three folds (Trainer, Synth pill, LUMI pill)

Read-only mapping of `/home/user/GuitarPak` at `5be2eab` (branch `claude/verify-project-files-4bchk6-v2` = `origin/v2`).
Nothing in the repository was changed and no test suite was run. Every line number below was read from the working tree.
The sibling report `map-studio-daw.md` (same folder) covers the Studio, sequencer and sampler; where the two areas meet it is named.

Contents: 1 plug-in API · 2 Trainer · 3 Synth pill · 4 LUMI pill · 5 shared edits (one table) · 6 PR #98 · 7 risks · 8 choices the roadmap leaves open

---

## 1. Plug-in API — remove

### 1.1 What exists

| Piece | Where | What it does |
|---|---|---|
| Runtime `window.SoundLab` (apiVersion 1) | `js/plugins.js:65-121` | `registerPage` (`:73-75` → `App.addPage`), `registerFx` (`:77-81` → `DAW.fxPlugins[id]`), `registerSynthPreset` (`:83-90` → pushes into `DAW.SYNTH_PRESETS`), `on`/`emit`, `app`/`daw`/`theory` getters, `plugins.{list, add, toggle, remove}` (`:92-120`) |
| Code execution | `js/plugins.js:34` | `new Function('SoundLab','App','DAW','Theory', p.code)` — the ONLY dynamic code execution in the app (grep for `new Function`, `eval(`, `importScripts`, `document.write`, `createElement('script')` over `js/` finds this one line) |
| Boot run of stored plug-ins | `js/plugins.js:52-63`, `:125` (`setTimeout(runStored, 0)`) | runs every enabled entry of store `plugins.list` on every launch |
| Helix stub handling | `js/plugins.js:45-50` (`supersededBy`), `:57-58` | a stored plug-in whose code sets `window.SLHelix` is skipped and flagged "Built in now" when `SLHelix.builtIn` (set at `js/helix.js:1109`) |
| Store | `plugins.list` (`js/plugins.js:25`, `:29`) | array of `{id, name, code, on, error}`; 100 KB cap per entry (`:22`, `:95`) |
| Settings card | markup `js/settings.js:234-244`; logic `js/settings.js:680-723` | ids `set-plugin-file`, `set-plugin-msg`, `set-plugin-list`; calls `SoundLab.plugins.add/remove/toggle` (`:703`, `:712`, `:720`) |
| Page surface | `js/app.js:885-908` (`addPage`), exported `js/app.js:1758` | adds a `<section class="panel">`, pushes into `SPACES`, `PANEL_ORDER`, and a one-page group `gpl-<id>` (`:899`) |
| FX surface | `js/daw/engine.js:282` (`fxPlugins`), `:287-292` (checked first in `buildFx`), `:800` (export) | Studio FX picker reads it at `js/studio.js:569-570` |
| Files | `plugins/sample-lofi.js` (50 lines), `plugins/helix-stadium.js` (10-line stub), `PLUGINS.md` (77 lines) | sample + stub + docs |
| Loaded by | `index.html:165`; precached `sw.js:64` | `plugins/` itself is not precached, not in the APK asset copy (`android/build.sh:33`, `android/build.ps1:31`) and not in `tools/artifact_build.py` `ASSET_DIRS` (`:20`) |

### 1.2 Delete

| File | Note |
|---|---|
| `js/plugins.js` | whole file |
| `plugins/sample-lofi.js`, `plugins/helix-stadium.js` (the `plugins/` folder) | nothing loads them: the only references are docs and comments (`CLAUDE.md:411-416`, `PLUGINS.md:12,17`, `docs/HELIX-STADIUM.md:5`, `docs/BRANCH-AUDIT-2026-10-23.md:18`, `js/helix.js:3`, `js/plugins.js:2-3`, `js/settings.js:237`) |
| `PLUGINS.md` | whole file |

### 1.3 Edit — every consumer

| File:line | Edit |
|---|---|
| `index.html:165` | remove `<script src="js/plugins.js"></script>` |
| `sw.js:64` | remove `'js/plugins.js'` from `ASSETS` — REQUIRED in the same commit: install uses `c.addAll` (`sw.js:101-105`), which fails as a whole if one listed file is missing. Bump `CACHE` (`sw.js:4`) |
| `js/settings.js:234-244` | remove the Plugins card markup |
| `js/settings.js:680-723` | remove the `// ---- plugins ----` block (`paintPlugins`, the file input and the two list listeners). It dereferences `#set-plugin-file` at `:697` without a guard, so markup and logic must go together |
| `js/help.js:143` | Settings tour text ends "…hands-free control and plugins for advanced workflows." — drop the plug-in clause (the same sentence also says "studio capture options": Studio mapper) |
| `js/daw/engine.js:282`, `:287-292`, `:800` | remove `fxPlugins` and its branch in `buildFx` (the sibling report cuts `buildFx` with the sequencer anyway) |
| `js/studio.js:569-570` | reads `DAW.fxPlugins`; the file is deleted by the Studio cut |
| `js/app.js:57-58` | comment "cross-links (fb:practice, st:edit, plugin pages)" |
| `js/app.js:885-908`, `:1758` | `addPage` — see 1.4 |
| `js/piano.js:1862` | comment "synth presets (incl. plugins) are loaded by now" |
| `js/helix.js:3`, `:8` | header comment about the plug-in origin; `builtIn: true` at `:1109` then has no reader in `js/` (only `tests/helix.test.js:84,87`) |
| `js/woodshed.js:1601`, `js/midihub.js:1815` | comments "lets plugins peek" / "test / plugin hook" — wording only |

Proof that nothing else calls the API: `grep -rn "SoundLab\b"` over `*.js`/`*.html` outside `js/plugins.js` and `plugins/` returns only `js/settings.js:685,700,703,712,720`, the comments at `js/app.js:885` and `js/daw/engine.js:282`, and `tests/helix.test.js:18,83`. `registerFx` / `registerSynthPreset` / `registerPage` are called only from `plugins/sample-lofi.js:9,50` and the test string at `tests/helix.test.js:18`.

### 1.4 `App.addPage` and `gpl-<id>` groups — who else relies on them

- `App.addPage` callers: `js/plugins.js:74` and **`tests/remote.test.js:57`**. The remote core suite builds its recording test page `rmtest` with it and visits it nine times (`tests/remote.test.js:57,111,170,194,208,235,271,294,315`). No production module calls it. (`js/synthdeck.js:308,745` has an unrelated local function of the same name: knob pages.)
- `gpl-` appears only at `js/app.js:899` (plus `CLAUDE.md:701`). No CSS, no test and no store reader names a `gpl-` group; the only trace is the remembered member key `app.gtab.gpl-<id>` written by `switchTo` (`js/app.js:780`).
- `addPage` itself runs no stored code. The risk was `new Function` in `js/plugins.js`, not the page surface.

Two ways to finish, pick one:
1. **Keep `App.addPage` as an internal/test surface** (recommended for Phase A): delete only `window.SoundLab`; reword the comment at `js/app.js:885`; `tests/remote.test.js` stays untouched. Cost: 24 lines of shell code with one caller (a test).
2. **Delete `addPage`** (what `map-studio-daw.md` §5.1 assumes: "it goes with the plug-in API"): then `tests/remote.test.js:54-59` loses its recording page. `App.register` alone cannot replace it after load: the page lists (`SPACES`, `PANEL_ORDER`, `GROUPS`) are private to `js/app.js` and panels are initialised once in `boot` (`js/app.js:1554-1569`). The suite would have to drive a real page and give up its isolated fixture. Larger test rewrite, no user-visible gain.

### 1.5 Stored data and the backup import

- `plugins.list` stays in `localStorage` of everyone who loaded a plug-in. After the removal nothing reads it, so it is inert. Phase A should **not** carry it into `soundlab2.*` (storage mapper: skip the key in the one-time import) and may delete `guitarlab.plugins.list` outright at that import.
- **Backup import today is a code-injection path**: `js/settings.js:975-995` writes every `guitarlab.*` key from the chosen JSON file into `localStorage` (`:985-987`), including `guitarlab.plugins.list`, and reloads (`:989`); `js/plugins.js:125` then runs that code. Removing `js/plugins.js` closes it. Hardening to do in the same PR:
  - import (`js/settings.js:985-987`): skip `plugins.list`; write only string values (`typeof d.keys[k] === 'string'`; today any JSON type is coerced by `setItem`); with the new prefix, accept a 1.x backup (`guitarlab.*`) and map it through the same key filter as the one-time import.
  - export (`js/settings.js:964-967`): leave out `plugins.list` (and the Studio keys the sibling report lists) so new backups carry no code.
  - text at `js/settings.js:139` says "preferences, palettes, jam songs, studio tracks": reword with the Studio cut.
- `pn.voice` may hold a plug-in preset id (`bell`, `plugins/sample-lofi.js:50`). Already safe: `js/piano.js:283-284` finds no preset and the sampled piano plays; `paintVoiceSel` falls back to "Grand piano" (`js/piano.js:302-303`).
- A stored Studio track with `fx.type` = a plug-in id: Studio cut, not this area.

### 1.6 Tests

| Test | Why it breaks | Change |
|---|---|---|
| `tests/helix.test.js:17-18`, `:28`, `:78`, `:80-87` | seeds `guitarlab.plugins.list` with an old Helix plug-in and reads `SoundLab.plugins.list` (`:83`) → `ReferenceError` once `window.SoundLab` is gone | replace with: a stored `plugins.list` is never run (`window.SoundLab === undefined`, no `#panel-helixold`, `SLHelix.old` falsy). The rest of the suite moves with Helix to `gear.html` (other mapper) |
| `tests/remote.test.js:54-59` | uses `App.addPage` | none if option 1 in 1.4 |
| none | no test touches `#set-plugin-*`, `fxPlugins`, `registerFx`, `registerSynthPreset` (grep over `tests/` is empty) | — |

### 1.7 Docs

`CLAUDE.md:406-416` (plug-in entry + the Helix note), `CLAUDE.md:701` (`App.addPage … gpl-<id>`), `docs/HELIX-STADIUM.md:5-6` (history line, may stay), `PLUGINS.md` (delete). Historical audit docs mention plug-ins as an exclusion (`docs/RELEASE-NOTES-1.0.0.md:53`, `docs/FEATURE-COVERAGE-2026-10-23.md:56,197`, `docs/EXTERNAL-MIDI-COVERAGE.md:35-39`): leave as history.

---

## 2. Trainer — fold into Plan + Exercises

### 2.1 What the page has (`js/trainer.js`, 653 lines, page `trainer`, Train group)

| # | Card | Code | What it does | Store |
|---|---|---|---|---|
| 1 | Practice session log | `js/trainer.js:64-158`; markup `:413-431` | free stopwatch (Start / Pause / Resume / Finish) with a text label; Finish appends `{dateISO, minutes, label}`; shows "Last 7 days: N min", the last 12 sessions, Clear history (uses `confirm()`, `:126`) | `tr.sessions` (`:68`, `:118`, `:127`) |
| 2 | Random practice prompts | `:160-222`; markup `:434-446`; wiring `:538-555` | buttons Random key / mode / chord / challenge (6 challenge generators, `:163-192`); shows the prompt and the last 5; **Go → Fretboard** for prompts that carry `{root, scale?, bpm?}` | none (session only) |
| 3 | One-minute chord changes | `:224-304`; markup `:449-470`; wiring `:557-568` | pick chord A and B from 15 open chords (`CC_CHORDS`, `:11`), 60 s countdown, count changes by button / Space / pedal, end chime (`App.pluck`, `:270-271`), best per pair | `tr.ccA`, `tr.ccB` (`:524-525`, `:559`, `:563`), `tr.best.<A>-<B>` (dynamic key, `:234`, `:272-276`) |
| 4 | Interval ear trainer | `:306-373`; markup `:472-487`; wiring `:570-585` | plays a random interval m2…P8 from a random root (MIDI 40–76), melodic or Harmonic checkbox, 12 answer buttons, score / streak / best streak | `tr.earHarm` (`:528`, `:580`), `tr.earBest` (`:358`, `:529`) |

Other hooks:
- Bus: emits `fb:practice` (`js/trainer.js:554`). Listens to nothing.
- Wake tags: `tr-sess` (`:93`, `:105`), `tr-cc` (`:242`, `:266`, `:288`). No ledger maps these tags (grep for `tr-sess|tr-cc` outside `js/trainer.js` and the test finds nothing).
- Page lifecycle: `onShow` re-renders the list (`:594-596`); `onHide` pauses the session clock, cancels a chord run, clears ear timers (`:598-609`). Note: the session clock pauses whenever the page is left, so it only times practice done with the Trainer page open.
- Keys: Space counts a change during a run (`:636-643`).
- Controller remote: `onRemote` (`:616-634`) — NEXT = count a change during a run, "Time's up" for 1.5 s after a run ran out, else Play interval; BACK = Replay; STOP = cancel the run, else pause the session clock. `remoteKey: true` (`:651`).
- CSS: injected with `App.injectCSS('trainer', …)` (`:379-398`); nothing in `css/*.css`.
- Help tour: `js/help.js:66-68` (one step, describes only the prompts).
- Tests: `tests/remote-runners.test.js:196-235` (remote on the Trainer), `:358`, `:385-388`, `:397` (double-tap plays an interval); page lists at `tests/smoke.test.js:22`, `tests/context-global.test.js:7`; pill text at `tests/nav.test.js:48`. No dedicated suite.

### 2.2 What points at the Trainer

- Navigation: `js/app.js:43` (SPACES), `:49` (SPACE_LABELS), `:67` (GROUPS `gprac`), `:78` (SUB_LABELS); `index.html:104` (panel), `:141` (script); `sw.js:36`.
- **The Practice plan does not launch it**: `RULES` (`js/practiceplan.js:9-18`) targets only `tuner`, `piano`, `shed`, `chords`, `jam`, `quiz`, `fretboard`; `grep -ci trainer` over `js/practiceplan.js`, `js/quiz.js`, `docs/PRACTICE-PLAN.md`, `tests/practiceplan.test.js` = 0 each. No module calls `App.switchTo('trainer')`.
- Text: `js/settings.js:199` (hands-free list names "the Trainer" and "LUMI practice"), `js/settings.js:91` ("…chord strums and trainer notes"), comments `js/app.js:436`, `js/fretboard.js:2065`.
- Docs: `README.md:31`, `:46`, `:76`; `CLAUDE.md:199` (`tr-` prefix), `:292`, `:692`, `:793`; `docs/CONTROLLER-REMOTE.md:58`; `tools/bundle.py:13` (superseded tool).
- Other "trainer" hits are different features and stay: the metronome's Tempo trainer (`js/metronome.js:64`, store `met.trainer`), the Circle page's Degree ear trainer (`js/theorytab.js:277`).

### 2.3 What Plan and Exercises already do

- **Exercises already contains card 4 and more.** Topic Intervals › unit "All intervals" (`js/quiz.js:991-992`) has an Ear mode with three levels — Ascending, Descending, Harmonic (`js/quiz.js:913-916`) — over the same 12 intervals, plus a 60-second Sprint and an Endless streak with records per node. Level ids are `intervals/iall/ear/1..3` (id format at `js/quiz.js:1061`; `SLQuiz.start(id)` at `:2959`).
- **Plan already measures time**: "Last seven days · N recorded minutes" (`js/practiceplan.js:275-278`) from `App.practiceProgress`. That ledger is observed practice only (`js/practice-progress.js:1`: "No timers…"), so a self-timed stopwatch must not be written into it.
- Plan already emits `fb:practice` for fretboard blocks (`js/practiceplan.js:186`), the same event the prompt's Go button uses; the listener is `js/fretboard.js:2068`.
- Exercises has no host for a drill that is not a question: its views are `home / topic / run / done` (`js/quiz.js:1256-1265`), and `#qz-homebody` is rebuilt on every tab click (`:2252-2264`).

### 2.4 Proposed fold

| Card | Goes to | Phase A (smallest faithful) | Phase C / D |
|---|---|---|---|
| 1 Session log | **Plan** | same stopwatch, label and list in a collapsed "Free practice" section on the Plan page; store stays `tr.sessions` (history carries over, no migration); stays self-timed and is not counted in the Plan's measured minutes | D: decide whether self-timed minutes join streak/goal |
| 2 Random prompts | **Plan** | same four buttons, prompt line and Go → Fretboard, in that section | D: a prompt becomes a plan block |
| 3 One-minute chord changes | **Exercises** by intent; **hosted on the Plan page in Phase A** (see below) | same drill, same ids and stores (`tr.ccA`, `tr.ccB`, `tr.best.*`) | C: a real Exercises drill (sprint-style record, maybe auto-count from MIDI / audio input) |
| 4 Interval ear trainer | **Exercises** | **dropped as a duplicate**: delete the card; one line in the section links to Exercises › Intervals (`SLQuiz.start('intervals/iall/ear/1')` after `App.switchTo('quiz')`). `tr.earBest` / `tr.earHarm` become unread; do not seed Exercises records from them (the XP layer forbids history seeding, `CLAUDE.md` xp.js entry) | — |

Why host card 3 on the Plan in Phase A: putting it under Exercises › Topics needs four touch points in `js/quiz.js` (mount after `:2260`, cancel in `onHide` `:2993-2999`, Space in `onKey` `:2492-2496`, the remote at `:2520-2521`) in the app's largest module (3010 lines, covered by `quiz`, `game`, `quiz-correction`, `remote-quiz`, `taps`, `learn-instruments`, `instrument-xp`). The Plan page needs a mount point, an `onHide` hook and a remote hook anyway for cards 1 and 2 (the session clock), so card 3 adds only the Space key there, and its markup is static outside `#pp-today`, `#pp-week`, `#pp-gaps` (`js/practiceplan.js:292`; only those regions are repainted, `:265-280`). The roadmap wording still holds: ear training lives in Exercises, the rest in the Plan. Alternative if the owner wants the drill in Exercises now: mount it under the Topics tab with the four hooks above (name it anything but "drill": `qz-drill` and `cur.drill` already mean "Drill these", `js/quiz.js:2470`).

Mechanics (recommended):
1. `js/trainer.js` stops being a page and becomes a card library: remove `App.register('trainer', …)` (`:645-652`); split `init` (`:378-592`) into `mountLog(el)`, `mountPrompts(el)`, `mountChanges(el)`; export `App.trainerCards = { mountLog, mountPrompts, mountChanges, hide, key, remote }` built from today's `onHide` (`:598-609`), `onKey` (`:636-643`) and `remote` (`:616-634`) minus their ear branches; delete card 4 (`:8-10`, `:35-41`, `:306-373`, `:472-487`, `:513-521`, `:528-530`, `:570-585`, `:590`, the ear lines in `:604-608` and `:621-630`). DOM ids keep the `tr-` prefix, stores keep `tr.*`. Keeping the file path means `index.html:141` and `sw.js:36` do not change; it already loads before `js/practiceplan.js` (`index.html:162`).
2. `js/practiceplan.js:292`: add after `<div id="pp-week" class="card"></div>` a static `<details class="card" id="pp-tools"><summary>Free practice: timer, prompts, one-minute changes</summary>…</details>` with three mount points; call the mounts at the end of `init` (`:290-329`).
3. `js/practiceplan.js:331-334` (`App.register`): `onHide` also calls `App.trainerCards.hide()`; `onKey` first offers the key to `App.trainerCards.key(e)` (Space during a run).
4. `js/practiceplan.js:202-213` (`remote`): first `var t = App.trainerCards.remote(action); if (t) return t;` — NEXT counts a change during a run and answers "Time's up" for 1.5 s after it, STOP cancels the run or pauses the session clock; otherwise today's Plan behaviour (NEXT launches the next block). The comment at `:190-196` ("No Stop") needs the new exception.
5. Remove the page from the shell (section 5).

### 2.5 Files to change and tests affected

Files: `js/trainer.js`, `js/practiceplan.js`, `js/app.js:43,49,67,78`, `index.html:104`, `js/help.js:66-68` (delete; add one step to `TOURS.practiceplan` `:15-19` for `#pp-tools`), `js/settings.js:199` and `:91` (text), comments `js/fretboard.js:2065`, `js/app.js:436`; docs `README.md:31,46,76`, `CLAUDE.md:199,292,692,793`, `docs/CONTROLLER-REMOTE.md:58`, `docs/PRACTICE-PLAN.md` (new section), `docs/ROADMAP-2.0.md` (tick).

| Test | Lines | Change |
|---|---|---|
| `tests/remote-runners.test.js` | header `:1-14`; `:196-235`; `:358`, `:385-388`, `:397` | re-home on the Plan page (`App.switchTo('practiceplan')`, open `#pp-tools`); keep the chord-run, late-press and session-pause checks (`#tr-cc-*`, `#tr-sess-*` unchanged); drop the interval checks (`tr.next === 'New interval'`, `tr.back === 'Again'`, `#tr-ear-*`); with no run, NEXT is now the Plan's "Block: …". Could move into `tests/remote-plan.test.js` |
| `tests/nav.test.js` | `:48` | Train pills become `Woodshed\|Tuner` |
| `tests/smoke.test.js` | `:22` | drop `'trainer'` from the id list |
| `tests/context-global.test.js` | `:7` | drop `'trainer'` |
| `tests/remote-plan.test.js` | `:215-345` | re-run: the Plan's remote gains a first step; idle STOP must still be `false` |
| `tests/practiceplan.test.js` | whole | re-run: a new card on the page (phone-width overflow check at `:333`, `:347`) |

---

## 3. Synth pill — a sound picker on Piano

### 3.1 How the pill works today

- `js/piano.js` registers two pages over one DOM. `piano` (`js/piano.js:1902-1907`) builds everything in `init` (`:1238…`); `synth` (`:1913-1945`) builds nothing: `init` only remembers its empty panel (`:1914-1916`).
- On show, the Synth page **moves every child of `#panel-piano` into `#panel-synth`** (`:1918-1920`), repaints the voice list, forces the voice to the last synth preset (`pn.synthPreset`, default `saw`; never `piano`) and **writes that into `pn.voice`** (`:1921-1930`). On hide it runs the piano's `onHide` and moves the children back (`:1935-1940`).
- Two differences while it is open: the lesson card is hidden by CSS (`'#panel-synth #pn-lessons{display:none}'`, `:1303`), and the remote drives only the runner (`:1944`). `js/keylessons.js:123`, `:137` refuse to act unless `App.active === 'piano'`.
- The voice itself is not page-bound: `pnVoice` (`:272`) is read by `synthVoice()` (`:276-292`) for every note — touch, typing keys and MIDI on every page (`midi:note` listener, `:1762-1776`). So after one visit to the Synth pill the Piano page (and MIDI everywhere) keeps the synth sound until the user picks "Grand piano".
- **The sound picker already exists on the Piano page**: `<select id="pn-voice">` labelled "Voice" (`:1340-1341`), filled by `paintVoiceSel` (`:294-304`) with "Grand piano" + `DAW.SYNTH_PRESETS` (four: Super saw, Warm pad, Soft keys, Round bass, `js/daw/synth.js:94-116`); change handler `:1481-1490`.
- A side effect that goes away with the pill: typing keys do not play on the Synth page, because `qwDown` returns unless `App.active === 'piano'` (`:1153`).

### 3.2 What "a sound picker on Piano" needs

Smallest version: **delete the page, keep `#pn-voice`**.
1. Remove `App.register('synth', …)` and its helper (`js/piano.js:1909-1947`), `synthRoot` (`:1236`), the CSS rule (`:1303`), and the comments at `:1065-1066`, `:1943`.
2. Relabel the control "Voice" → "Sound" and fix its tooltip, which says "the Studio's MPE synth presets" (`:1340`). Values stay `piano` or a preset id, so nothing stored changes meaning.
3. `js/keylessons.js:84` and `:269` credit `synth` when `App.active === 'synth'`; that branch can never be true again. The credit then comes only from `entryInstrument` (`learn:lesson`, `js/keylessons.js:82`; `App.keysLessons.open(id, instrument)`, `:866`). Simplify both lines; fix comments at `:38`, `:122`, `:853`.
4. `js/learn-instruments.js:22`: the Synth category's entry `{ label: 'Synth keyboard', page: 'synth', kind: 'Instrument' }` points at the deleted page. `App.switchTo` has no guard for an unknown id (`js/app.js:742-796`: it would show a blank page and store it as `app.tab`). Repoint to `page: 'piano'`. Faithful extra (about 8 lines): add `setVoice(id)` to `App.keys` (`js/piano.js:1880-1900`) and let this entry select the last synth sound, which is what the pill did.
5. Remove the page from the shell (section 5).

Optional, not needed for Phase A: merge the four sampled tones (`app.pianoTone`: grand / bright / electric / organ, `js/piano.js:199-204`, chosen in Settings at `js/settings.js:94`, `:768-786`) into the same picker so there is one sound list. That changes the value format of `pn.voice` and duplicates a Settings control; leave it for Phase B/C.

Dependency that must survive the Studio cut: `js/daw/synth.js` (`DAW.SYNTH_PRESETS`, `DAW.createSynth`), loaded at `index.html:143` after `js/piano.js` (`:135`) — the reason `paintVoiceSel` is called again in `onShow` (`js/piano.js:1862`). `map-studio-daw.md` §3.2 keeps that file whole.

### 3.3 Stores

| Key | Today | After the fold |
|---|---|---|
| `pn.voice` | current voice (`js/piano.js:1480`, `:1485`, `:1929`); seeded once in `tests/audio-level.test.js:32` | unchanged; the one sound setting |
| `pn.synthPreset` | written on every synth choice (`:1486`), read only by the Synth page (`:1923`) | no reader. Either stop writing it, or keep it as "last synth sound" for step 4's extra. No other file names it (grep: `js/piano.js` and `CLAUDE.md:682` only) |
| `app.gtab.gkeys` = `synth`, `app.tab` = `synth` | remembered page | already safe: `goGroup` falls back to the group's first page (`js/app.js:716-717`), boot / `setSpace` / the Settings toggle fall back to the home page (`:1652-1653`, `:1210-1211`, `:914-916`) |

No migration is needed: a user who last used the Synth pill already has `pn.voice` = that preset.

### 3.4 Files to change and tests affected

Files: `js/piano.js`, `js/keylessons.js:38,84,122,269,853`, `js/learn-instruments.js:22`, `js/app.js:43,49,64,79`, `index.html:100`; docs `CLAUDE.md:680-682,692`, `docs/CONTROLLER-REMOTE.md:53` ("Keys / Synth page runner").

| Test | Lines | Change |
|---|---|---|
| `tests/remote-keys.test.js` | `:313-340` | the whole "Synth page" block (hidden lesson card, runner-only remote, no hidden double-tap run) has nothing left to test: delete |
| `tests/nav.test.js` | `:39` (pills `Piano\|Charts\|Synth\|Pads\|LUMI`), `:42-43` (clicks the Synth pill), `:46` ("Keys remembers the last page (Synth)") | pills become `Piano\|Charts\|Pads` after both folds; test the remembered page with Charts or Pads |
| `tests/smoke.test.js` | `:22` | drop `'synth'` |
| `tests/context-global.test.js` | `:7` | drop `'synth'` |
| `tests/keys.test.js`, `tests/audio-level.test.js` | — | re-run; add one check that choosing a synth in `#pn-voice` stores `pn.voice` and sounds the synth |

The `synth` learn-instrument category (`js/learn-instruments.js:5`, `js/practice-progress.js:20`, tests such as `tests/instrument-session.test.js:78`) is a different thing and stays.

---

## 4. LUMI pill — fold into Keys lessons

### 4.1 What the page offers (`js/lumi-practice.js` 500 lines, `css/lumi-practice.css` 45 lines, `js/practice-router.js` 210 lines, `docs/LUMI-PRACTICE.md`, `docs/PRACTICE-ROUTER.md`)

- **Target practice**: single notes, major triads or minor triads (`#lp-kind`), exact pitch and octave inside a 24-key window that starts at a chosen MIDI note (`#lp-low`, default 48); targets come only from the selected key/scale (`js/lumi-practice.js:222-239`, via `App.scaleLock.contains`).
- **Two flows** (`#lp-flow`): "Wait until correct" (holds the exact notes for 700 ms, then advances, `:202-221`) and "Manual check and next" (`:252-260`). Score "n correct / n checks".
- **Simulated mode** (default): on-screen answer pads and a display preview; no MIDI port is opened or written (`:290-295`, `:451-454`).
- **Hardware mode**: answers from one exact Web MIDI input (`App.midi.subscribeInput`, `:160`; own running-status decoder `:105-143`), lights on one exact LUMI output through a temporary lease (`App.midi.leaseKeybedOutput(outputId, 'lumipractice')`, `:75`; frames `{target, correct, wrong, channel}` `:170-175`), gated by Test (300 ms) → "I observed the test" → Arm (`:176-201`, `:455-460`). Port roles are name-filtered (`:28-41`).
- **Scale-locked external synth sound** (`js/practice-router.js`): chosen keyboard input → chosen synth output, out-of-scale note-ons dropped when Scale Lock is on, sustain and pressure passed, note ledger and cleanup; needs the "Local Control OFF" tick. Started only from this page (`js/lumi-practice.js:440-443`), stopped by it (`:91`, `:437`, `:444`).
- **The only screen that sets the explicit LUMI display output**: `#lp-output` calls `App.midi.setDisplayOutput` (`js/lumi-practice.js:433` → `js/midi.js:470-479`, stores `lights.outputId` / `lights.outputName`). Settings' "Key lights" select calls `setOutput` instead (`js/settings.js:933`). The app tells users to come here: `js/midi.js:447` "Choose a LUMI display output in Keys → LUMI" (shown through the clef menu, `js/app.js:1408`, and the Woodshed player, `js/performance-player.js:216-217`).
- Stops itself on page leave, window blur, page hide, app hidden, any `midi:state`, key/scale change (`:470-482`, `:488`).
- Controller remote: NEXT = Start / Check / Next target / skip; STOP = Stop; no BACK (`:273-289`). `remoteKey` only in simulated mode (`:492`).
- No help tour (`js/help.js` has no `lumipractice` key).

### 4.2 Everything that would move

- **DOM**: container `#panel-lumipractice` (`index.html:115`); 42 ids, all `lp-`: `lp-mode-badge lp-mode lp-flow lp-kind lp-low lp-channel lp-range lp-octave lp-hardware lp-input lp-output lp-refresh lp-ports-status lp-sound-output lp-scale lp-local-control lp-sound-start lp-sound-stop lp-sound-status lp-test lp-arm lp-disarm lp-display-master lp-output-status lp-start lp-stop lp-score lp-status lp-target lp-target-notes lp-display lp-feedback lp-simulated lp-answers lp-clear lp-preview lp-mock-status lp-source lp-heard lp-check lp-next lp-result`; data attributes `data-target-note`, `data-answer-note` (`js/lumi-practice.js:338-339`).
- **CSS**: `css/lumi-practice.css` — every rule is scoped by `#panel-lumipractice` (44 selectors); linked at `index.html:17`, precached at `sw.js:10`.
- **Stores**: none of its own (all state is session-only, `js/lumi-practice.js:5`). Reads `fb.root`, `fb.scale` (`:322`); writes `lights.outputId` / `lights.outputName` through `setDisplayOutput`. The router reads `fb.root`, `fb.scale`, Scale Lock (`js/practice-router.js:30`) and **`midihub.thru`** (`:172`).
- **App.midi surface**: `explicitPortsSupported`, `subscribeInput`, `sendToOutput`, `leaseKeybedOutput` (`:26`), `inputFingerprint` (`:101`), `inputs` / `outputs`, `displayEnabled`, `setDisplayOutput`, `native`. Leases: owner `'lumipractice'` (`js/lumi-practice.js:75`) and owner `'practice-router'` (`js/practice-router.js:188`); mute owner `'practice-router'` (`:82`, `:194`). The owner is only a label (`js/midi.js:486-497`); a lease is refused while another lease or a `claim` (Pads) holds the port (`js/midi.js:488`).
- **Bus**: listens `colors`, `lights:master`, `practice:route`, `fb:set`, `fb:scale`, `midi:state` (`js/lumi-practice.js:461-479`); the router emits `practice:route` (`js/practice-router.js:40`) and listens `fb:set`, `fb:scale`, `scale:lock`, `scale:boundary`, `midi:state` (`:203-206`). Both ask `App.remote.owns` (`js/lumi-practice.js:137`, `js/practice-router.js:126`).
- **Outside users**: `js/midihub.js:568` (Thru is held back while `App.practiceRouter.active`); test hook `window.SLLumiPractice` (`js/lumi-practice.js:494-499`).
- **Load**: `index.html:127` (router), `:159` (page); `sw.js:23`, `:58`.

### 4.3 What "folded into Keys lessons" should mean in Phase A

**Recommended (A): LUMI practice becomes a section of the Keys lessons area on the Keys page.** Same code, same ids, same safety model; only the host changes.

1. `js/piano.js:1427`: add `<div id="pn-lumi"></div>` right after `<div id="pn-lessons"></div>`; mount it next to the lessons mount (`:1810-1812`): `App.lumiPractice.init(…)` inside a collapsed `<details>` ("Notes and triads on the LUMI").
2. `js/lumi-practice.js:485-493`: replace `App.register('lumipractice', …)` with `App.lumiPractice = { init, show, hide, remote, remoteKey, get running }` (`show` = today's `onShow` `:487`, `hide` = today's `onHide` `:488`). Keep `window.SLLumiPractice`. Keep the file free of `piano.js` calls: `tests/lumi-practice.test.js:93` injects it alone into a mock `App`.
3. `visible` (`js/lumi-practice.js:9`, checked at `:146`, `:177`, `:193`, `:214`, `:242`, `:291`) becomes "Keys page shown and the section open": `js/piano.js` `onShow` (`:1860-1864`) calls `show()` when the `<details>` is open, `onHide` (`:1866-1876`) calls `hide()`, the `<details>` toggle calls `show()` / `hide()`.
4. One owner at a time. Keys lessons and the runner light the LUMI through the shared painter (`App.midi.guide` behind `App.keys.ring`, `js/piano.js:1890`); an armed LUMI session takes a lease that pauses that painter on the same output. Today the two can never overlap because each stops when its page is left (`js/piano.js:1869`, `js/lumi-practice.js:488`). On one page they need an explicit rule: starting a LUMI session stops a lesson run and the runner (`App.keysLessons.stop()`, `App.keys.stopRunner()`); starting a lesson or the runner stops the LUMI session.
5. Remote: `js/piano.js:1092-1095` chain becomes "LUMI section open → `App.lumiPractice.remote(action)`; else lessons; else runner". With the section closed nothing changes for lessons. For the reserved double-tap key, give the piano page `remoteKey: function () { return sectionOpen && App.lumiPractice.remoteKey(); }` (today none, `:1906`) and make the lessons' own double-tap (`js/keylessons.js:832`) ignore taps while the section is open.
6. Lesson focus mode hides the rest of the Keys page (`.kl-running …{display:none!important}`, CSS at `js/keylessons.js:771-772`): add `#pn-lumi`.
7. CSS: rename the scope `#panel-lumipractice` → `#pn-lumi` in all 44 selectors of `css/lumi-practice.css` (the scope keeps its `fieldset`, `legend`, `[hidden]` and `:focus-visible` rules from leaking into the Keys page). File path can stay, so `index.html:17` and `sw.js:10` do not change.
8. `js/midi.js:447`: change "in Keys → LUMI" to the new place ("on the Keys page, under LUMI practice").
9. Remove the page from the shell (section 5). `js/practice-router.js` is unchanged.

Alternatives:
- **B — a fourth mode inside the Scale lessons card** (a chip next to the tier chips, the run view becomes LUMI practice). Closest to the roadmap words but `js/keylessons.js` repaints its whole card with `root.innerHTML` (`:510-517`), which would destroy the LUMI DOM and its timers; needs a restructure. Not Phase A.
- **C — keep the page, drop only the pill** (remove `lumipractice` from `GROUPS.gkeys` at `js/app.js:64`, keep it in `SPACES`, add an "Open LUMI target practice" button to the lessons card). Two lines of shell change and almost no test change, but the page then has no tab or pill highlighted (`groupOf` returns null, `js/app.js:83-89`, so `paintSubnav` hides the strip, `:727`). Use only as a fallback if A slips.
- **D — delete the feature** because Keys lessons + LUMI Display already light targets. Loses exact-octave triads, wait-until-correct, explicit port roles, the only display-output chooser and the synth sound route. Not a fold.

### 4.4 Files to change and tests affected (recommended A)

Files: `js/lumi-practice.js`, `js/piano.js`, `js/keylessons.js` (focus-mode CSS, double-tap gate, mutual stop), `css/lumi-practice.css`, `js/midi.js:447`, `js/app.js:43,51,64,80`, `index.html:115`, `js/settings.js:199` (text), optional `js/help.js` (`TOURS.piano`, `:41-48`: one step for `#pn-lumi`); docs `docs/LUMI-PRACTICE.md` (`:22` "Open Keys → LUMI" and the lifecycle text), `docs/PRACTICE-ROUTER.md:3`, `docs/GUIDED-PERFORMANCE.md:74,142`, `docs/CONTROLLER-REMOTE.md:40,55`, `README.md:29`, `CLAUDE.md:267-281,692`.

| Test | Lines | Change |
|---|---|---|
| `tests/lumi-practice.test.js` (788 lines, 12 sections) | fixture `#panel-lumipractice` `:17`, `:94`, `:444`; `App.modules.lumipractice.init/onShow/onHide` `:94`, `:99`, `:150`, `:523`, `:655`; `App.switchTo('lumipractice')` `:99`, `:230`, `:321`, `:442`; `simulation.page === 'lumipractice'` `:236`; reads `css/lumi-practice.css` `:8` | container id → `pn-lumi`; module calls → `App.lumiPractice.init/show/hide`; real-app steps → `App.switchTo('piano')` + open the section; page check → `'piano'`. The `lp-` ids and `SLLumiPractice.snapshot()` stay, so the bulk of the suite is untouched |
| `tests/remote-plan.test.js` | `:69-213` (five LUMI sections; `App.switchTo('lumipractice')` at `:73`, `:146`, `:184`) | open the section on the Keys page first; the NEXT = Start, double-tap and hardware checks stay valid only with rule 5 above |
| `tests/display-master.test.js` | `:125-172` (`App.switchTo('lumipractice')` `:128`) | same re-homing |
| `tests/remote-keys.test.js` | whole | re-run: the Keys remote chain gains a first step; closed section must behave exactly as today |
| `tests/keys.test.js`, `tests/lumidisplay.test.js`, `tests/lumi-contexts.test.js` | whole | re-run: a new block on the Keys page, lesson focus mode, shared painter vs lease |
| `tests/nav.test.js` | `:39` | pills |
| `tests/context-global.test.js` | `:7` | drop `'lumipractice'` |
| `tests/midi-ports.test.js` | `:210` | none (the owner string is a label) unless the owner is renamed |
| `tests/practice-router.test.js` | whole | none (drives `App.practiceRouter` directly) |
| `tests/run.sh` | `:17` | suite names unchanged |

---

## 5. Shared edits — one table for all four items

| File:line | Today | After |
|---|---|---|
| `js/app.js:43` | `SPACES.practice` contains `'synth'`, `'lumipractice'`, `'trainer'` | remove the three |
| `js/app.js:49`, `:51` | `SPACE_LABELS` `trainer`, `synth`, `lumipractice` | remove |
| `js/app.js:64` | `gkeys` pages `['piano','chart','synth','pads','lumipractice']` | `['piano','chart','pads']` |
| `js/app.js:67` | `gprac` pages `['shed','trainer','tuner']` | `['shed','tuner']` |
| `js/app.js:78-80` | `SUB_LABELS` `trainer`, `synth`, `lumipractice` | remove |
| `js/app.js:742` (`switchTo`) | an unknown id shows a blank page and is stored | optional guard: map `trainer → practiceplan`, `synth → piano`, `lumipractice → piano` |
| `index.html:100`, `:104`, `:115` | panels `panel-synth`, `panel-trainer`, `panel-lumipractice` | remove |
| `index.html:165` | `js/plugins.js` | remove |
| `sw.js:64` | `'js/plugins.js'` | remove; bump `CACHE` (`sw.js:4`) |
| `sw.js:10,23,36,58` | lumi CSS, router, trainer, lumi page | unchanged if the files keep their paths (recommended) |
| `js/settings.js:199` | hands-free list names "LUMI practice" and "the Trainer" | reword |
| `tests/nav.test.js:39,42-43,46,48`; `tests/smoke.test.js:22`; `tests/context-global.test.js:7` | page and pill lists | update once, after all three folds |

These lines are also edited by the Studio cut (`studio` space at `js/app.js:44`, `:68-71`) and the gear split (`helix`, `deck`, `liveset`, `midihub` in `:43`, `:63-65`): do them in one commit or in a fixed order to avoid conflicts between Phase A pull requests.

## 6. PR #98 (`origin/claude/project-thread-rhqjuv`)

`git diff origin/v2 origin/claude/project-thread-rhqjuv` touches four files: `CLAUDE.md` (the 2.0 paragraph), `js/app.js` (only `APP_VERSION`, line 101), `sw.js` (lines 2-4 and the `activate` filter), `version.json`.
- `sw.js`: Phase A must bump `CACHE` on line 4; PR #98 rewrites the same line to `PREFIX + 'v4'`. Whoever merges second resolves that one line (keep the scope prefix, use a number above both). The `ASSETS` edit at `sw.js:64` does not overlap.
- `js/app.js`: no overlap (line 101 vs lines 43-80 and 885-908).
- `CLAUDE.md`: PR #98 rewrites lines 19-30; Phase A edits the layout entries (`:199`, `:267-281`, `:292`, `:406-416`, `:680-682`, `:692`, `:701`, `:793`). No overlap unless Phase A also rewrites the 2.0 paragraph.
- If PR #98 merges first, live users run today's code as 2.0.0, plug-in runtime included. The storage import "at the flip" then has to treat live `guitarlab.*` data from 2.0.0 the same as 1.x data; for this area that means: never import `plugins.list`; carry `tr.sessions`, `tr.ccA`, `tr.ccB` and every `tr.best.*` key (dynamic names: import by prefix); carry `pn.voice`; `pn.synthPreset`, `tr.earBest`, `tr.earHarm` are optional.

## 7. Risks

1. Service worker: deleting `js/plugins.js` without removing `sw.js:64` breaks install for every user (`addAll`), so the old cache keeps serving the old app.
2. `tests/remote.test.js` depends on `App.addPage`; `map-studio-daw.md` §5.1 assumes `addPage` is deleted. The two plans must agree before coding.
3. LUMI on the Keys page: lessons/runner (shared painter) and an armed LUMI session (lease) would fight for the same output unless starting one stops the other (4.3 step 4). A lease is also refused while Pads holds a `claim`.
4. The Keys remote chain changes; a mistake there breaks the pedal on the most used page (`tests/remote-keys.test.js`, 560 lines, guards it).
5. `js/midi.js:447` would keep sending users to a pill that no longer exists.
6. `js/learn-instruments.js:22` would open a blank page for the Synth category if not repointed.
7. Trainer session clock: it pauses when its page is left. On the Plan page that means it pauses the moment a plan block is launched. Faithful to today, but worth a line of help text.
8. `js/practice-router.js:172` reads `midihub.thru` and `js/midihub.js:568` reads `App.practiceRouter`. When the MIDI Hub moves to `gear.html`, the main app keeps the router: the store read is harmless if the key is absent, but if Gear gets its own storage prefix the "turn Hub Thru off first" guard stops seeing Gear's setting.
9. Backup files made before Phase A contain `plugins.list` and Studio keys; the import must skip them or a 1.x backup re-creates dead keys.
10. The LUMI page's long safety texts ("EXPERIMENTAL / UNVERIFIED…") land on the Keys page. Phase A keeps today's look, so the section should stay collapsed by default.

## 8. Choices the roadmap leaves open (with a recommended answer)

1. **Does `App.addPage` go with the plug-in API?** Recommended: keep it as an internal/test surface in Phase A (one caller, `tests/remote.test.js:57`; it executes no stored code). Remove it later only together with a new test fixture.
2. **Where does the one-minute chord-change drill live?** Recommended: on the Plan page in Phase A (one collapsed "Free practice" section with the timer and the prompts), and as a real Exercises drill in Phase C. The alternative (Exercises › Topics now) costs four hooks in `js/quiz.js`.
3. **Keep the self-timed session log at all?** Recommended: yes, unchanged and still reading `tr.sessions`, clearly separate from the Plan's measured minutes. Dropping it would hide logged history; Phase D decides its future.
4. **Is the interval ear trainer really dropped?** Recommended: yes. Exercises › Intervals › All intervals › Ear is a superset (ascending, descending, harmonic, sprint, endless). Leave `tr.earBest` unread; do not convert it into an Exercises record.
5. **Keep `js/trainer.js` as a card library or move its code into `js/practiceplan.js`?** Recommended: keep the file (no `index.html` / `sw.js` churn, the Plan file stays readable); Phase C/D absorbs or rewrites it.
6. **Sound picker: only relabel `#pn-voice`, or also merge the four sampled piano tones into it?** Recommended: relabel only in Phase A; one merged list is a Phase B/C design decision.
7. **What happens to `pn.synthPreset`?** Recommended: keep it as "last synth sound" and use it for the Synth category's "Synth keyboard" entry (`js/learn-instruments.js:22`) through a small `App.keys.setVoice`; otherwise delete the write at `js/piano.js:1486`.
8. **LUMI fold shape: a section on the Keys page (A) or a hidden page behind a button (C)?** Recommended: A, collapsed by default, with "one owner at a time" between lessons/runner and a LUMI session. C is the fallback if A threatens the Phase A schedule.
9. **Who owns the pedal on the Keys page when the LUMI section is open?** Recommended: the open section owns NEXT / STOP (exactly what the page did), a closed section leaves everything to lessons and runner. This keeps `tests/remote-plan.test.js:69-213` meaningful.
10. **Where is the LUMI display output chosen after the fold?** Recommended: stay in the LUMI section (`#lp-output`) for Phase A and fix the hint at `js/midi.js:447`; a proper place in Lights & help is Phase B/E.
11. **Add old-page aliases to `App.switchTo`?** Recommended: yes (`trainer → practiceplan`, `synth → piano`, `lumipractice → piano`), three lines at `js/app.js:742`; today an unknown id shows a blank page and is saved as the last tab.
12. **Backup files:** should import accept 1.x backups (`guitarlab.*` keys) after the prefix change? Recommended: yes, through the same allow-list as the one-time import, always skipping `plugins.list`.
