# Phase A map: tests and CI

Read-only map of `tests/` (62 suites, 15,447 lines) and `.github/workflows/` on
`claude/verify-project-files-4bchk6-v2` = `origin/v2` @ `5be2eab`. Nothing in the
repo was changed and no suite was run. Timings and check counts come from the
last green CI run of this exact commit (run 43066604479, job "test / test",
2026-11-11): 62 suites, 2,930 checks, 13 min 46 s.

Paths are relative to `/home/user/GuitarPak`. "gear" below means the pages
`deck`, `liveset`, `midihub`, `helix` (js/synthtab.js, synthlive.js, synthdeck*.js,
midihub.js, helix.js).

## 0. The ten things that will bite

1. **One hardcoded suite list.** `tests/run.sh:17` names all 62 suites; a new,
   renamed or deleted suite must be edited there. `tests/pages-deploy.test.js:53`
   fails if `tests.yml` calls `run.sh` with arguments or a skip variable, so
   new gear suites must be in the default list, not a second CI command.
2. **No second entry URL.** `tests/env.js:7` exports one `URL`
   (`SL_URL` or `http://127.0.0.1:4573/index.html`); `tests/run.sh:9` sets
   `SL_URL` to `index.html`. `tests/serve.py:12` serves the repo root, so a
   root-level `gear.html` is served with no server change.
3. **Every gear suite boots through the lesson app.** Eight suites that drive
   gear pages wait for
   `App.active === 'quiz'` before doing anything (list in section 3).
4. **Four main-app suites reach into gear code** (`oneopen`, `multiin`,
   `remote-runners`, `practice-router`) and one gear suite reaches into the
   lesson app (`midihub-lock.test.js:56-60`). The move is not a pure re-point.
5. **`js/daw/engine.js` holds both what is cut and what stays.**
   `DAW.createDrums` (kept: Jam, Woodshed) is exported from the same file as the
   sampler and the loop/song engine (`js/daw/engine.js:796-809`).
   `tests/sound-lock.test.js:42,60-61` loads that file by path.
6. **`App.switchTo` has no unknown-page guard** (`js/app.js:742-793`): a removed
   id becomes `App.active` with no panel shown. `tests/smoke.test.js:27` only
   checks for the string "undefined", so it would pass on a blank page.
7. **194 `guitarlab` occurrences in 49 suites**, three of them inside regular
   expressions that a plain text replace of `guitarlab.` will miss (section 4).
8. **Nothing tests `sw.js`.** A deleted file left in `ASSETS` makes
   `cache.addAll` reject (`sw.js:101-106`) and the offline app silently stops
   installing; no suite would fail.
9. **Pads and Jam have no suite of their own**, and `js/pads.js` is built on
   `DAW.engine` (20 `DAW.` uses on `js/pads.js:45-379`, plus `st.armed`, `App.space`, `st:step`, `st:state` at `:440-456`). Only `lights`, `colors` and
   `smoke` touch Pads; only `sound-lock` and `smoke` touch Jam.
10. **`taps` is a third of the run** (277 s of 826 s) and is not touched by
    Phase A. Leave it out of the per-step loops.

## 1. Suite table

Columns: CI seconds / checks; what it covers; which Phase A item touches it
(S = Studio/DAW/capture, P = plug-ins, T = Trainer, Y = Synth pill, L = LUMI pill,
G = gear move, K = storage prefix; K count = `guitarlab` occurrences); action.
Every browser suite carries K because it seeds storage; that is the only reason
for a row marked "K only".

### 1a. Suites that need real work

| Suite | s / checks | Covers | Item | Action and exact places |
|---|---|---|---|---|
| `nav` | 15.1 / 41 | Tab bar, pills, metronome sheet, clef dropdown, phone bar, Studio space | S T Y L G K5 | **Adapt.** Tabs `:35` (`'Learn\|Guitar\|Keys\|Synth\|Play\|Train'`); Keys pills `:39`; Synth tab + borrowed Control view `:40-41`; click the Synth pill `:42-43`; Guitar pills incl. Helix `:45`; "Keys remembers Synth" `:46`; Train pills incl. Trainer `:47-48`; phone tab count `:136` (`m1.n === 6`); **delete** the whole `# studio space` block `:155-173` (`#space-btn`, `App.setSpace`, `#wipe`). Seeds `:9-10`, read `:120`. |
| `smoke` | 9.0 / 6 | Visits pages, native MIDI bridge into piano and quiz | S T Y K3 | **Adapt.** Page list `:22` (`'synth'`, `'trainer'`, `'arrange'`, `'tracks'`, `'song'`, `'ideas'` go); `:24` reads `App.space` and special-cases `'arrange'`; `:27` passes on anything without "undefined" - strengthen to "a panel is active for each id". |
| `context-global` | 14.4 / 154 | Clef/context on every page, 2 viewports | S T Y L G K1 | **Adapt, and add a gear variant.** `practice` list `:7` (22 ids), `studio` list `:8` (5 ids); the matrix `:60-61` must equal the set of `main > .panel` ids exactly (26 today, `index.html:91-116`); loop `:62`; "Studio shares Practice state" `:89-91` (uses `'arrange'`) delete; `space-wiping` wait `:11` becomes dead; header `:1-2`. |
| `lights` | 6.2 / 71 | Keybed engine, Help level, scale lock, Pads owning the keys | S K6 | **Adapt.** Delete the Studio block `:120-140` (`'tracks'`, `App.space`, `DAW.engine.tracks`, `st.armed`, `'ideas'`, `#sd-retro`, `#sd-toast`). Pads blocks `:213-232` and `:339-354` stay and are the main Pads regression check. Seeds `:14,17,18,418`; reads `:175,271`. |
| `colors` | 3.4 / 62 | App.colors on every page and the LUMI | S K7 | **Adapt.** Delete the Studio piano-roll block `:213-239` (`goTo('tracks')`, `DAW.engine.tracks`, `st:edit`, `.st-note`); keep a plain switch to `fretboard` in place of `:237` because `:241` onward expects that page. Header `:8`. Pads block `:299-316` stays. K: `:26,27,130,254,324,361` plus the regex at `:357`. |
| `sound-lock` | 0.9 / 65 | Scale-lock admission in synth, sampler, drums, Jam voices; offline renders | S | **Adapt (do not delete).** Paths `:42`, `:60-61` (`js/daw/synth.js`, `js/daw/engine.js`). Delete sampler checks `:68-74`, `:83`, `:85-86`, `:150-159` and the loop/song render checks `:87-101` with their names in `:104` and `:107`. Keep `guardPitched` `:116-139`, synth `:142-149`, drums `:160-162`, Jam `:164-175`. `:165` patches `js/jam.js` by replacing the literal line `"  App.register('jam', {"` - if that line changes the suite crashes. |
| `helix` | 7.1 / 55 | Helix page, safety, bridge, port isolation, old stored plug-in | G P K4 | **Move to gear.html + adapt.** Plug-in parts go: `OLD_PLUGIN` `:17-18`, seed `plugins.list` `:28`, arg `:64`, `oldPlugin: true` `:78`, checks `:80-87` (`SoundLab.plugins.list` at `:83` throws once the API is gone). Nav check `:93-98` (tab `/Guitar/`, pills `'Neck\|Tab\|Notation\|Helix'`). "Leave the page" uses `quiz` `:259`. Boot wait `:69`. |
| `midihub` | 3.1 / 46 | Hub: raw tap, rules, profiles, SysEx, clock, synth control | G K5 | **Move.** Boot waits `:28`, `:249` (`App.active === 'quiz'`); nav `:50` (group `'Synth'`, pills `'Deck\|Live\|Hub'`); needs `Help.TOURS.midihub` `:47`; "another page" is `piano` at `:65`, `:71`, `:75`, `:218`. Seeds `:15-16`, `:234-236`. |
| `midihub-lock` | 1.7 / 21 | Hub Thru under scale lock | G K2 | **Move + adapt.** Boot wait `:36`. `:56-60` switches to `quiz` and asserts Thru stays locked there - a lesson page that gear.html will not have. Seeds `:12-13`. |
| `midihub-player` | 7.7 / 31 | Hub Player (MIDI, MusicXML, .mxl, key shifter) | G K4 | **Move** (unless the Player stays in the lesson app for Songs, see open question 2). Boot wait `:29`; "leaving" uses `piano` `:122`, asserted `:131`. Seeds `:16-19`. |
| `midihub-wheel` | 2.5 / 5 | Wheel over knobs | G K2 | **Move.** Boot wait `:24`. Seeds `:13-14`. |
| `synthdeck` | 9.3 / 137 | Synth Deck | G K5 | **Move.** Boot wait `:54`; "leave" uses `piano` `:683`. Seeds `:25-29`. |
| `synthdeck-scope` | 2.1 / 42 | Deck scope | G K6 | **Move + adapt.** `:34-35` reads `index.html` and injects `js/synthdeck-scope.js` when the page does not load it - after the move it would inject into the lesson app and then fail on `App.switchTo('midihub')`; point both at gear.html. Boot wait `:39`; `piano` `:190`. Seeds `:19-24`. |
| `synthtab` | 15.0 / 49 | Deck/Live play faces, Go live, profiles, phone | G K5 | **Move + adapt.** Boot wait `:43`; nav `:54`, `:62` (group `'Synth'`, pills); phone `:317` (`ph.tabs === 6`); Go live reads `.topbar` and `#tabbar-m` `:222-240`. Seeds `:18-22`. |
| `synthconn` | 10.8 / 24 | Refused sends toast; Android one-output path | G K5 | **Move.** Boot wait `:56` (`App.active === 'quiz'`); uses `App.remoteAction` (the remote must exist in gear). Seeds `:20-24`. |
| `synthconnect` | 14.5 / 21 | Connect panel | G K5 | **Move.** Boot wait `:37` (no `quiz`). Seeds `:15-19`. |
| `remote-runners` | 21.4 / 86 | Remote on Neck/Tab/Notation, Songs, Trainer, Live sets, Deck | T G K5 | **Split three ways.** Keep `:78-195` (runner, Songs), `:358-384`, `:399-436`. Delete Trainer `:196-235`, `:385-388`, `:397` (`#tr-*` ids, `App.switchTo('trainer')` `:199`, `:385`). Move Live sets + Deck `:237-357` and `:438-479` to a gear suite. Boot wait `:65` needs `window.SLSynthLive`; seeds `:34-35` are gear keys; header `:1-14`. |
| `remote-keys` | 51.7 / 68 | Remote on Keys lessons and runner | Y K6 | **Adapt.** Delete or rewrite the Synth-page block `:313-340` (`App.switchTo('synth')` `:317`). Seeds `:35-40`. |
| `lumi-practice` | 24.2 / 98 | LUMI practice page: fixture half + real-app half | L K4 | **Adapt** (shape depends on how the fold is built). Fixture reads the two source files `:7-8`, builds `<section id="panel-lumipractice">` `:17`, calls `App.modules.lumipractice.init/onShow/onHide` `:94,99,150,523,655`. Real app: boot wait `:227`, `App.switchTo('lumipractice')` `:230,321,442`, `simulation.page === 'lumipractice'` `:236`, `#panel-lumipractice` `:444`. Everything else goes through `SLLumiPractice` and `#lp-*`. Seeds `:186-189`. |
| `display-master` | 3.1 / 21 | Display master and lock through the LUMI page + practice router | L K5 | **Adapt.** `#lp-*` helpers `:39-41`; `App.switchTo('lumipractice')` `:128`; `#lp-local-control` `:132`; `SLLumiPractice.snapshot()` `:135-169`. Seeds `:15-17`. |
| `remote-plan` | 12.3 / 57 | Remote on LUMI practice and the Plan | L K3 | **Adapt.** Boot wait `:54` needs `SLLumiPractice`; five LUMI sections `:69-213` (`App.switchTo('lumipractice')` `:73,146,184`; `#lp-start`, `#lp-status`, `#lp-flow`, `#lp-result`, `#lp-check`, `#lp-mode`, `#lp-input`). Plan sections `:215-345` unaffected. Seeds `:20-22`. |
| `oneopen` | 3.8 / 8 | Songs "Open a score": as tab / on synth / Practice | G K3 | **Adapt (cross-app).** Needs `window.SLMidiHub` in the lesson app: wait `:26`, `SLMidiHub.scoreToMidi` `:29`, "Play on synth" asserts `App.active === 'midihub'` `:43-44` and `:56-57`, MusicXML goes "through the Player's reader" `:53`. Source side: `js/songs.js:694-708`. Seed `midihub.profile` `:16`. |
| `multiin` | 4.9 / 26 | All keyboards, voice Auto | G K4 | **Adapt.** Move or drop `# MIDI Hub input picker` `:95-102` (`App.switchTo('midihub')` `:97`). Seeds `:13-14`; reads `:78,145`. |
| `practice-router` | 0.07 / 82 | VM test of js/practice-router.js | G | **Adapt if files move.** `:245-246` reads `../js/midihub.js` and asserts a regex on its Thru guard; `:47-49` drives the `midihub.thru` store key that `js/practice-router.js:172` reads. |
| `remote` | 19.5 / 58 | Remote core | P K3 | **Adapt or keep the seam.** `:54-57` registers its test page with `App.addPage` ("the plugin page API", `js/app.js:886`); eight `switchTo('rmtest')` depend on it. Seeds `:20-22`. |

### 1b. Suites that only need the storage prefix (K), plus a rerun note

| Suite | s / checks | Covers | K | Note |
|---|---|---|---|---|
| `audio-level` | 10.8 / 6 | Piano decode + master graph, its own HTTP server | 5 (`:29-33`) | Hardcodes `origin + '/index.html'` `:65`. Rerun after the DAW split (piano voice). |
| `audioin` | 43.5 / 98 | Sound input service + Settings card | 2 (`:27-28`) | - |
| `btmidi` | 6.1 / 12 | Android MidiBridge, Settings MIDI, Lights sheet | 1 (`:22`) | - |
| `chordchart` | 1.8 / 16 | Charts page | 4 (`:14,52,99,101`) | `:26` needs a `[data-page="chart"]` pill: Keys must keep 2+ pages. |
| `game` | 32.4 / 78 | XP, path, sprints, Progress | 6 (`:14-17` + regex `:56,72`) | `:372` uses group id `gtheory`. |
| `instrument-session` | 2.3 / 38 | Session boundaries | 2 (`:17`, removeItem `:29`) | Uses instrument id `'synth'` (`:78-163`): the Learn category, not the Synth pill. Leave. |
| `instrument-xp` | 1.6 / 34 | XP ledger, legacy keys read-only | 5 (`:12,14,15,27,90`) | Same `'synth'` category (`:45-47,95-104`). Leave. |
| `keys` | 41.3 / 39 | Keys page, Help levels, lessons | 12 | Writes storage mid-test `:126,152,166,216`; reads `:45,136,157,171,206,214,256`. Rerun after the Synth/LUMI fold (piano.js). |
| `learn-instruments` | 3.1 / 39 | Learn category bar | 4 (`:12-15`) | Learn page list `:81`, `:161`. Source `js/learn-instruments.js:22` links category synth to page `'synth'` ("Synth keyboard"); no assertion covers it. |
| `lumi-contexts` | 6.2 / 37 | LUMI display on piano, neck, tab, notation, songs, quiz | 1 (`:23`) | Rerun after the LUMI fold. |
| `lumidisplay` | 12.7 / 23 | LUMI Display + lesson double-tap | 2 (`:15-16`) | Rerun after the LUMI fold. |
| `performance` | 2.1 / 32 | Guided performance | 6 (`:20-24`) | Rerun after the DAW split (`js/performance-player.js:19`). |
| `performance-progress` | 1.7 / 17 | Player + progress | 1 (`:14`) | - |
| `performance-safety` | 2.2 / 25 | Raw MIDI boundary | 7 (`:18-22`) | - |
| `pitch-lock` | 1.4 / 15 | Scale lock on pluck / keys voices | 1 (`:13`) | Rerun after the DAW split. |
| `portnames` | 3.7 / 8 | Ports by name | 5 (`:14,15,41,65`) | - |
| `practice` | 5.3 / 34 | Practice ownership, Back, drills | 3 (`:14,15,157`) | - |
| `practice-audio` | 2.0 / 24 | Audio adapter + scorer | 5 (`:15-17`) | - |
| `practice-progress-ui` | 5.5 / 38 | Progress UI | 2 (`:18,177`) | - |
| `practiceplan` | 7.7 / 46 | Practice Plan | 1 (`:13`) | `:349` needs 4+ Learn pills. Add checks if Trainer drills land in the Plan. |
| `quiz` | 8.7 / 44 | Exercises | 5 (`:25-27,59,146`) | Learn pills `:57-58`; stored tab `piano` `:377-379`. Add checks if Trainer drills land in Exercises. |
| `quiz-correction` | 4.9 / 33 | Corrections after a miss | 2 (`:16-17`) | - |
| `remote-quiz` | 18.3 / 90 | Remote on Exercises | 3 (`:27-29`) | - |
| `remote-shed` | 18.8 / 84 | Remote in the Woodshed | 5 (`:31-34,389`) | Rerun after the DAW split (`js/woodshed.js:493,497`). |
| `taps` | 277.4 / 7 | Every quiz control tappable, 3 devices | 3 (`:9`) | Reads the bottom bar height `:18`. |
| `update` | 11.3 / 9 | Update banner, web / shell / file:// | 3 (`:9`) | Builds `file://…/index.html` `:25`; reads `APP_VERSION` `:29`. |

### 1c. Suites Phase A does not touch (pure Node or VM, no storage keys)

`fingering` (reads `js/piano.js`, `:4`), `midi-ingress` and `midi-ports` (VM over
`js/midi.js`; `'lumipractice'` at `midi-ports:210` and `'pads'` at `:227-229` are
just owner strings), `note-palette`, `performance-engine`,
`performance-import` (VM over the whole `js/woodshed.js`, `:7`),
`practice-input`, `practice-progress` (`:25` lists instrument ids incl. `'synth'`
= the Learn category), `pages-deploy`, `pages-next`, `release-workflow`.

`release-workflow` reads the real `index.html` to build its asset list
(`:15-18`) and uses `js/performance-engine.js` as the stale asset (`:131`): that
script must stay in `index.html`. The list shrinks by itself when scripts go.

There is **no `help` suite**. Help tours are only touched at
`midihub.test.js:47`, `nav.test.js:75-76`, `remote-keys.test.js:354`,
`remote-quiz.test.js:65-66`, `remote.test.js:163-168`,
`context-global.test.js:111-114`. The first-run welcome tour (which describes
two workspaces, `js/help.js:251`) is never run: every suite seeds `help.seen`.

## 2. Hardcoded lists and numbers

Today's source of truth is `js/app.js:42-45` (SPACES) and `:60-73` (GROUPS).

| Where | Today | After Phase A (lesson app) |
|---|---|---|
| `context-global.test.js:7` | 22 ids: quiz, practiceplan, fretboard, tab, notation, helix, chords, piano, chart, synth, pads, deck, liveset, midihub, lumipractice, songs, jam, shed, tuner, trainer, theory, settings | drop helix, synth, deck, liveset, midihub, lumipractice, trainer = 15 |
| `context-global.test.js:8` | arrange, tracks, song, ideas, settings | delete the list and the `Studio` half of the loop at `:62` |
| `context-global.test.js:60-61` | sorted `main > .panel` ids must equal the two lists | must equal the new panel set exactly |
| `nav.test.js:35` | `Learn\|Guitar\|Keys\|Synth\|Play\|Train` | `Learn\|Guitar\|Keys\|Play\|Train` |
| `nav.test.js:39` | `Piano\|Charts\|Synth\|Pads\|LUMI` | `Piano\|Charts\|Pads` |
| `nav.test.js:40-41` | Synth tab opens `deck`, pills `Deck\|Live\|Hub` | gone from this suite (gear) |
| `nav.test.js:45` | `Neck\|Tab\|Notation\|Helix` | `Neck\|Tab\|Notation` |
| `nav.test.js:46` | Keys remembers `synth` | pick another member (e.g. Charts) |
| `nav.test.js:48` | `Woodshed\|Trainer\|Tuner` | `Woodshed\|Tuner` |
| `nav.test.js:136` | 6 bottom tabs | 5 |
| `nav.test.js:155-173` | Studio tabs `Studio\|Sketch`, quick space switch | delete |
| `smoke.test.js:22` | 19 visits incl. synth, trainer, arrange, tracks, song, ideas | 12 kept ids + quiz |
| `smoke.test.js:24` | 900 ms wait for `'arrange'`; pushes `App.space` | drop both if `App.space` goes |
| `synthtab.test.js:62` | group `Synth`, pills `Deck\|Live\|Hub` | gear nav |
| `synthtab.test.js:317` | 6 bottom tabs | gear's count |
| `midihub.test.js:50` | group `Synth`, pills `Deck\|Live\|Hub` | gear nav |
| `helix.test.js:98` | tab `/Guitar/`, pills `Neck\|Tab\|Notation\|Helix` | gear nav |
| `quiz.test.js:58` | `Exercises\|Chords\|Circle\|Plan` | unchanged |
| `practiceplan.test.js:349` | 4+ Learn pills | unchanged |
| `learn-instruments.test.js:81,161` | Learn pages quiz, chords, theory, practiceplan | unchanged |
| `tests/run.sh:17` | 62 suite names | add / remove / rename here |

Not asserted anywhere: the per-suite check counts that `run.sh:19` prints.
`context-global` drops from 154 to about 104 checks; that is expected.

`taps`, `update`, `pages-deploy`, `pages-next` hold no page lists.
`pages-deploy.test.js:47-53` and `pages-next.test.js:46-51` pin workflow text
instead (section 5).

## 3. How suites open pages, and what a gear suite needs

**Entry.** 48 suites open `env.URL` with `page.goto`. `audio-level` starts its
own server and opens `origin + '/index.html'` (`:10-19`, `:65`). `sound-lock` and
the first half of `lumi-practice` use `page.setContent` + injected source. 12
suites are pure Node. `update.test.js:25` also opens `file://<root>/index.html`.

**Navigation.** `App.switchTo('<id>')` inside `page.evaluate`: 277 calls in 46
suites (piano 39, quiz 38, shed 28, deck 22, practiceplan 20, settings 18,
fretboard 17, midihub 16, songs 11, lights 9, lumipractice 8, liveset 8, rmtest
8, chords 6, metronome 4, pads 3, notation 3, helix 3, trainer 2, tab 2, tracks
1, synth 1, ideas 1, chart 1, arrange 1). Real tab clicks exist only in `nav`
(`:37-52`, `:145`, `#space-btn` `:157`). Sheets: `#met-btn`, `App.openSheet`
(`context-global:101`, `remote:160`), `#lights-btn` (`game:272`), `#settings-btn`
(`practice:112`).

**Boot waits that name the lesson home.** Gear suites that wait for
`App.active === 'quiz'`: `midihub:28,249`, `midihub-player:29`,
`midihub-wheel:24`, `synthdeck:54`, `synthdeck-scope:39`, `synthtab:43`,
`synthconn:56`, `remote-runners:65`. (`helix:69`, `synthconnect:37`,
`midihub-lock:36` do not.)

**What gear suites need from the page they open** (from their calls):
`App.store`, `App.on/emit`, `App.switchTo`, `App.midi` (incl. the key-light
engine: all of them seed `lights.on=false` so a LUMI gets no note-ons),
`App.scaleLock` (`midihub`, `midihub-lock`), `App.toast` (`#app-toast`),
`App.wake` (`synthtab:222`), `App.remoteAction` and `#remote-hud`
(`synthconn`, the Live/Deck half of `remote-runners`), `Help.TOURS.midihub`
(`midihub:47`), the `.topbar` and `#tabbar-m` chrome (`synthtab:222-240`), and a
second page to "leave to" (`piano` or `quiz` today).

**Does env.js allow another entry URL? No.** Smallest change: add
`GEAR_URL: process.env.SL_GEAR_URL || new URL('gear.html', <URL>).href` to
`tests/env.js`, and have gear suites `goto(env.GEAR_URL)`. Three suites shadow
the global `URL` class with `const URL = env.URL` (`nav:3`, `quiz:3`, `game:5`);
do not call `new URL()` inside those. `run.sh:15` polls only `index.html`; fine.

## 4. Storage seeding patterns (for the prefix step)

194 occurrences of `guitarlab` in 49 suites; 13 suites have none (the 12 pure
Node suites and `sound-lock`). All are one of six forms:

| Form | Count | Example |
|---|---|---|
| `setItem('guitarlab.' + k, …)` seed loop | 63 | `nav.test.js:10` |
| `setItem('guitarlab.<key>', …)` literal seed | 96 | `helix.test.js:26` |
| `getItem('guitarlab.<key>')` literal read-back | 28 | `chordchart.test.js:52` |
| `getItem('guitarlab.' + k)` read-back | 3 | `instrument-xp.test.js:15,27,90` |
| `removeItem('guitarlab.' + …)` | 1 | `instrument-session.test.js:29` |
| inside a regex: `guitarlab\.` | 3 | `game.test.js:56,72`, `colors.test.js:357` |

Seeding runs in `addInitScript` (54 calls in 49 suites), so it fires on every
navigation; five suites guard with `sessionStorage` to seed once (`chordchart:12`,
`game:12`, `keys:13`, `practice:12`, `practiceplan:11`). A further 103
`App.store.set` and 110 `App.store.get` calls in 26 suites need no change.

Literal keys seeded (times): lights.on 14, midihub.profile 8, midi.outputId 8,
help.seen 7, help.done 7, qz.landed 5, kl.prog 5, fb.scale 5, fb.root 5,
remote.map 3, lights.displayEnabled 3, midihub.outId 2, midi.wanted 2,
midi.voiceAuto 2, midi.appSound 2, lights.display 2, and once each: xp.total,
xp.days, ws.performance.input, remote.dbl, qz.prog, pn.voice, pn.perf,
plugins.list, met.sig, met.bpm, lights.led, kl.sel, kl.reps, hx.bridgeAuto,
app.vol, app.pianoTone.

Doing it mechanically and safely:

1. Replace the literal `'guitarlab.` with the new prefix in `tests/*.test.js`
   (191 hits), then the regex form `guitarlab\.` (3 hits). Afterwards
   `grep -c guitarlab tests/*.test.js` must be 0 everywhere except the new
   import suite.
2. The three regex hits matter: `game.test.js:56,72` assert that no legacy
   `xp.*` key is written, and `colors.test.js:357` makes storage throw for
   `fb.*` writes. Left alone they keep passing while testing nothing.
3. Do **not** rely on the one-time import to carry the old seeds. It would make
   first-load seeds work, but the 31 read-backs and the mid-test writes
   (`keys.test.js:126,152,166,216`) would hit keys the app no longer reads.
4. `plugins.list` (`helix.test.js:28`) disappears with the plug-in API.
5. App side, for reference: the prefix lives in `js/app.js:528,536,1024,1031`;
   Settings backup hardcodes it at `js/settings.js:966,986` and has **no test**;
   the sampler database is `indexedDB.open('guitarlab-daw')` at
   `js/studio.js:447`.

## 5. Workflows

**`tests.yml`** - triggers: every `pull_request` (`:4`, so each draft PR into
`v2` runs the full suite), push to one old branch (`:7`), manual, and
`workflow_call` (`:9`). One job, `timeout-minutes: 30` (`:28`). Node 24
(`:38`), Playwright 1.62.1 + Chromium (`:49-50`), then `bash tests/run.sh`
(`:55`) = all 62 suites, serially. On failure it prints the last 100 lines of
each failing log (`:56-66`). Last run: 35 s install + 13 min 46 s suites, so
about 15 minutes of headroom.

**`pages-next.yml`** - on push to `v2` (`:9-11`). Runs `tests.yml` on `v2`
(`:23-28`); deploys only on success (`:29-31`) at the tested commit (`:39`).
The deploy removes everything under `next/` (`:69`) and writes **the whole v2
tree** there (`:70`), plus `next/beta.json` (`:58,71`). There is no file
allowlist: `gear.html` and any new file appear at `/GuitarPak/next/…`
automatically, and deleted files vanish. `concurrency: pages-next` with
`cancel-in-progress` (`:17-20`): a second merge into `v2` cancels the first
run.

**`pages.yml`** - on push to `main` (`:8-9`). Same test gate (`:20-25`). The
deploy tree is the whole `main` tree (`:60`) with the current `next/` carried
over (`:57,61-63`). No allowlist either: `gear.html` goes live at
`/GuitarPak/gear.html` when it reaches `main`. The `release` job only acts when
`version.json` web is `1.0.0` (`:131-135`); its public-asset probe is built from
`index.html` alone (`:180-189`).

**`ios.yml`** - only on `main` pushes under `ios/**`; not part of the gate.

Packaging lists that are *not* workflows and would not carry `gear.html`:
`android/build.sh:32-33`, `ios/sync-web.sh:8-9`, `tools/artifact_build.py:25`.
No suite checks any of them.

**Text pinned by tests** (change the workflow and these fail):
`pages-deploy.test.js:51` (PR trigger, no secrets), `:52` (Playwright 1.62.1,
Node 24), `:53` (`run: bash tests/run.sh` with nothing after it);
`pages-next.test.js:46-51`; `release-workflow.test.js:9` (step name).

**PR #98** (`origin/claude/project-thread-rhqjuv`) = v2 plus one commit that
changes `CLAUDE.md`, `js/app.js` (APP_VERSION 2.0.0), `sw.js` (cache names
`sl2-live-*` / `sl2-next-*`, read from `self.registration.scope`) and
`version.json`. It touches **no test and no workflow**. `update.test.js:29`
reads the version from the source, so it passes either way. Two consequences
for Phase A: (a) `sw.js` lines 1-8 and the activate handler will conflict if
Phase A edits anything there besides `ASSETS` entries; (b) once #98 is merged,
the live app is 2.0.0 on `guitarlab.*` keys while the beta moves to
`soundlab2.*` on the same origin, so the import must copy, never move.

## 6. Timing, and what to run when

Slowest suites (CI seconds): taps 277, remote-keys 52, audioin 44, keys 41,
game 32, release-workflow 27, lumi-practice 24, remote-runners 21, remote 20,
remote-shed 19, remote-quiz 18, nav 15, synthtab 15, synthconnect 15,
context-global 14, lumidisplay 13, remote-plan 12, update 11, synthconn 11,
audio-level 11. Everything else is under 10 s; the 12 pure Node suites total
about 30 s (27 of that is `release-workflow`).

Local run in this container: `NODE_PATH=/opt/node22/lib/node_modules
SL_LOG_DIR=<scratchpad>/logs tests/run.sh <names>` (Playwright 1.63.0, Node 22,
Chromium at `/opt/pw-browsers/chromium`; CI uses 1.62.1 on Node 24).
`SL_PORT=4574` runs a second copy side by side (`run.sh:8-9`).

| After sub-step | Fast loop | CI s | Then, before the PR |
|---|---|---|---|
| 1. Studio, sequencer, sampler, plug-ins out | `nav smoke context-global lights colors sound-lock helix pitch-lock performance chordchart` | 61 | `remote keys audio-level remote-shed practice-audio performance-safety lumidisplay release-workflow` (134) |
| 2. Trainer, Synth pill, LUMI pill folded | `nav smoke context-global remote-runners remote-keys lumi-practice display-master remote-plan learn-instruments lumi-contexts midi-ports practice-router` | 161 | `keys lumidisplay practiceplan quiz game` (103) |
| 3. gear.html | the ten gear suites: `helix midihub midihub-lock midihub-player midihub-wheel synthdeck synthdeck-scope synthtab synthconn synthconnect` | 74 | `nav smoke context-global remote-runners oneopen multiin portnames practice-router remote lights btmidi` (104) + the new gear suite |
| 4. Storage prefix | new import suite + `quiz chordchart colors game instrument-xp learn-instruments instrument-session practice-progress practice-progress-ui multiin portnames keys` | 109 | **full run** - every browser suite seeds storage |

Full run (all 62 + the new suites) once per sub-step before opening its draft
PR and again on the merged result; CI repeats it on the PR and on the push to
`v2`. Everything except `taps` is about 9 minutes; `taps` alone is 4.6.

## 7. New suites Phase A should add

**`trim`** (lesson app after the cut, browser):
- `main > .panel` ids are exactly the kept set; tabs and pills as in section 2.
- Gone: `#space-btn`, `#cx-rec`, `#wipe`, `window.SoundLab`, `DAW.engine`,
  `DAW.createSampler`, `DAW.samples`, `#set-plugin-file`; no tab or pill reads
  Studio, Sketch, Trainer, Synth, LUMI, Helix, Deck, Live or Hub;
  `indexedDB.open` is never called with `guitarlab-daw`.
- A stored old plug-in (`plugins.list` with code) is never executed.
- Stale stored state: `app.tab` = each removed id boots to `quiz` with a visible
  panel (the fallback exists at `js/app.js:1652-1653`; `nav.test.js:26` already
  does this for `metronome`); `app.space='studio'` + `app.tabStudio='arrange'`
  boots to the practice home; `app.gtab.gkeys='synth'` opens `piano`,
  `app.gtab.gprac='trainer'` opens `shed`, `app.gtab.ginst='helix'` opens
  `fretboard` (fallback at `js/app.js:716-717`).
- `App.switchTo('<removed id>')` lands on the home, not a blank page (needs the
  guard that does not exist today).
- The sounds that stay still sound with no engine: a Piano synth voice from the
  picker, a Jam drum kit, a Woodshed drum exercise, a Pads hit. The Woodshed
  "from Studio track" button (`#ws-track`, `js/woodshed.js:1427-1432`) is gone or
  harmless - it is untested today and would throw once `DAW.engine` is removed.

**`gear`** (gear.html, browser):
- Boots with no page error and no 404; `main > .panel` ids are exactly the gear
  pages; its tabs and pills; none of `SLQuiz`, `Woodshed`, `App.keysLessons`,
  `SLXP` is loaded.
- Sends nothing and asks for no MIDI permission at boot.
- A stored lesson tab (`app.tab='piano'`) opens the gear home, and visiting gear
  does not change the page the lesson app reopens on (and the reverse).
- The link from the lesson app to gear and back.
- Phone width: no sideways scroll.

**`storage-import`** (browser, fresh profile per case):
- Only `guitarlab.*` present: after boot the same values exist under
  `soundlab2.*`, the app reads them (scale, lesson progress, XP), a marker is
  set, and the `guitarlab.*` keys are byte-identical to before.
- Second boot after a legacy change: nothing is re-imported.
- Existing `soundlab2.*` values are never overwritten.
- Keys of cut features are skipped or harmless: `st.*`, `sd.*`, `ideas.list`,
  `song.name`, `plugins.list`, `app.space`, `app.tabStudio`, `pn.synthPreset`.
- Storage that throws (quota, private window): the app still boots.
- After visiting every page no `guitarlab.*` key was written.
- Settings backup: the export holds the new keys and a 1.x backup file still
  imports (`js/settings.js:962-986`, no coverage today).
- The same import holds when gear.html is the first page opened.

**`assets`** (pure Node, under a second):
- Every `<script src>` and stylesheet in `index.html` and `gear.html` exists.
- Every `sw.js` `ASSETS` entry exists, and every file the two pages load is in
  `ASSETS`.
- No `<script>` for a removed module is left in `index.html`.

Also strengthen `smoke`: for each visited id assert `#panel-<id>` is the active
panel.

## 8. Decisions the plan has to make (they change the test work)

1. **Shell for gear.html.** If it reuses `js/app.js` with its own page set, the
   ten gear suites change one URL, one boot wait and one nav assertion each. A
   separate shell means rewriting their setup.
2. **Hub Player and One Open.** `js/songs.js:694-708` calls
   `SLMidiHub.player` for MusicXML reading and "Play on synth". Either the
   file readers move to a shared module, or `midihub.js` stays loaded in the
   lesson app, or "Play on synth" becomes a hand-off to gear.
   `oneopen.test.js:43-44,53,56-57` follow that choice.
3. **Shape of the LUMI fold.** Keeping `js/lumi-practice.js`, `SLLumiPractice`
   and the `#lp-*` ids and mounting them on the Keys page keeps about 180 lines
   of assertions alive in `lumi-practice`, `display-master` and `remote-plan`.
4. **Trainer drills.** If none survive Phase A, the Trainer block of
   `remote-runners` is deleted; if some move into Exercises or the Plan, they
   need `onRemote` checks there.
5. **`App.addPage`.** Keep it as an internal seam (`remote.test.js:57`) or give
   that suite another way to register a test page.
6. **Remote and Settings in gear.** The Live-set and Deck remote checks need
   `js/remote.js` and its Settings card on the gear page.
7. **Last-tab key.** Both apps would share `app.tab` on one origin; gear needs
   its own key or the two keep resetting each other.
