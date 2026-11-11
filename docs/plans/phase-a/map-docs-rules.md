# Phase A map: documents, rules and the other sessions

Read-only mapping for soundLAB 2.0 Phase A ("Trim"). Repo `/home/user/GuitarPak`, branch
`claude/verify-project-files-4bchk6-v2` = `origin/v2` at `5be2eab`. Nothing in the repo was
changed and no suite was run. Every `file:line` below is from that commit.

Contents: 0 snapshot · 1 binding rules · 2 decisions and readings · 3 doc edits · 4 remote and
chord charts · 5 PR #98 · 6 proposed status section · 7 open questions · 8 grep traps.

---

## 0. Snapshot

| Thing | State (2026-11-11) | Evidence |
|---|---|---|
| `origin/v2` | `5be2eab`, 9 commits ahead of `main`; `main` has 1 commit v2 lacks (the #94 merge commit `02523a6`, same content) | `git rev-list --count origin/main..origin/v2` = 9, reverse = 1 |
| v2 version | `APP_VERSION = '1.4.1'`, `version.json` web 1.4.1, APK channel 0.75.0 | `js/app.js:101`, `version.json` |
| v2 service worker | `CACHE = 'soundlab2-v3'`; activate deletes only other `soundlab2-*` caches | `sw.js:4`, `sw.js:113` |
| live service worker (main) | `CACHE = 'guitarlab-v130'`; activate deletes EVERY other cache on the origin, the beta's included | `git show origin/main:sw.js` lines 2 and 108 |
| Storage | one prefix, `guitarlab.`, in 6 places | `js/app.js:528,536,1024,1031`, `js/settings.js:966,986` |
| Other storage | one IndexedDB, `guitarlab-daw` (the sampler) | `js/studio.js:447` (the only `indexedDB` hit in `js/`) |
| Beta deploy | whole v2 tree copied to `next/` plus `next/beta.json`; full suite first | `.github/workflows/pages-next.yml:23-31,58,70-71` |
| CI on PRs | `tests.yml` runs on every `pull_request` | `.github/workflows/tests.yml:3-4` |
| PR #98 | OPEN, DRAFT, base `main`, head `claude/project-thread-rhqjuv` (`c875605`), mergeable clean. v2 + 4 files changed | section 5 |
| PR #90 | OPEN (not draft), base `main`, head `claude/verify-project-files-4bchk6` (`756cdeb`), last touched 2026-11-02: "1.4.0: hands-free practice, SheetLab, My library", PR diff 159 files / +45,628. Not in v2 | section 5.4 |

Docs read in full: `docs/ROADMAP-2.0.md`, `docs/DESIGN-SYSTEM.md`, `CLAUDE.md`, `README.md`,
`PLUGINS.md`, `docs/CONTROLLER-REMOTE.md`, `docs/CHORD-CHARTS.md`, `docs/LUMI-PRACTICE.md`,
`docs/PRACTICE-PLAN.md`, `docs/SYNTH-TAB.md`. All other files in `docs/` and `tasks/` were read by
title and grepped for every cut or moved feature (table in section 3.4).

---

## 1. Binding rules for Phase A work (checklist)

### 1.1 From `docs/ROADMAP-2.0.md` "Rules for the build" (lines 68-77)

- [ ] **Draft PRs into `v2` only; the owner merges.** "One phase = one or more draft pull requests
      into `v2`; the owner merges." (`ROADMAP-2.0.md:70`). `CLAUDE.md:25-26` says "one phase per
      draft PR": the roadmap is the plan file and is wider, so Phase A may be several draft PRs.
      Never self-merge, never push to `v2` directly.
- [ ] **Nothing lands on `main` before Phase I** "except the deployment plumbing"
      (`ROADMAP-2.0.md:71`). Phase A never targets `main`. (PR #98 is the owner's call, section 5.)
- [ ] **Tests green before every merge; add suites for new features** (`ROADMAP-2.0.md:72`).
      The default suite list is one line, `tests/run.sh:17`: a removed feature's suite must leave
      that list in the same PR, and `gear.html` needs its own suites or a second target URL
      (`tests/run.sh:9` fixes `SL_URL` to `index.html`).
- [ ] **Private songs, teacher material and signing keys never enter the repo**
      (`ROADMAP-2.0.md:73`; `CLAUDE.md:916-923,949-951`; `docs/CHORD-CHARTS.md:40`).
- [ ] **The two Phase 0 caveats end or stay as written**: shared `localStorage` "until Phase A adds
      the `soundlab2.*` prefix" (`ROADMAP-2.0.md:74-75`); the live worker clearing the beta cache
      (`ROADMAP-2.0.md:76-77`) is NOT fixed by Phase A (it is fixed by main's worker changing,
      which is what PR #98 does).

### 1.2 From `CLAUDE.md` "soundLAB 2.0" (lines 17-30)

- [ ] Read the roadmap before touching Studio/DAW, sampler, plug-in API and gear control
      (`CLAUDE.md:28-30`).
- [ ] **Tokens:** "every new 2.0 component uses only `--sl-*`" (`CLAUDE.md:24-25`;
      `css/tokens.css:5-8`; `docs/DESIGN-SYSTEM.md:6,40`). Phase A keeps today's look, so
      existing pages keep `css/style.css` variables untouched. Anything NEW that Phase A draws
      (a link between the two apps, an import notice, the `gear.html` shell's own chrome) uses
      `--sl-*` only, never a raw colour. Today nothing reads the tokens
      (`grep -c "var(--sl-" css/style.css js/*.js` = 0 everywhere).
- [ ] Phase B work is out: no new home, nav, components or re-skin (`ROADMAP-2.0.md:56`).

### 1.3 From `CLAUDE.md` "Release checklist" and "Dev loop"

- [ ] **Phase A is not a release.** Do not change `APP_VERSION` (`js/app.js:101`),
      `version.json` (`web`, `notes`, and never `version`: `CLAUDE.md:871-877`), or
      `android/AndroidManifest.xml`. The update checker reads `version.json` from `main`
      (`js/app.js:102`), so a number changed on `v2` does nothing useful.
- [ ] **Bump `CACHE` in `sw.js` on every PR that changes a shipped file, and keep `ASSETS` true**
      (`CLAUDE.md:852-854,879`). Phase A removes entries (`sw.js:36,39-42,58,64` at least) and adds
      `gear.html`. Change only the number and the list (section 5.3).
- [ ] No APK, no artifact republish, no force push (`CLAUDE.md:883-887,889-907,939`).
- [ ] Run the suites before the PR and add a suite or checks for new features
      (`CLAUDE.md:843-844`).
- [ ] After editing in a preview: unregister the worker, clear caches, reload twice
      (`CLAUDE.md:852-854`).

### 1.4 Conventions that bind code written in Phase A

- [ ] **Module contract and page ids.** `App.register(name, {init, onShow, onHide, onKey})`
      (`CLAUDE.md:198`); page ids never change for kept pages ("NAVIGATION ONLY", `CLAUDE.md:699-700`).
      Pages with sub-views implement `onBack` (`CLAUDE.md:729-730`).
- [ ] **`onRemote` / `remoteKey`** (`CLAUDE.md:769-774`): "must act exactly like the on-screen
      button and never prompt, change ports, or arm hardware". A page that gains a folded-in
      feature keeps one `onRemote` that covers it.
- [ ] **`App.toast`** is "the ONE app-wide status toast" (`CLAUDE.md:775-779`). No new toast
      element inside a page. `gear.html` needs `#app-toast` too (the Deck routes refusals there:
      `docs/SYNTH-TAB.md:66-67`).
- [ ] **Transport exclusivity** (`CLAUDE.md:783-787`): every transport emits `transport:claim`
      and stops on a foreign claim. Owners in code today: `met` (`js/metronome.js:464`), `jam`
      (`js/jam.js:761`), `keys` (`js/keylessons.js:270`), `quiz` (`js/quiz.js:2986`), `chart`
      (`js/chordchart.js:244`), `loop` (`js/daw/engine.js:572`), `song` (`js/daw/engine.js:709`).
      Phase A removes `loop` and `song`; the other five must keep working, and `#cx-met` then
      drives only the metronome.
- [ ] **Audio schedulers**: 25 ms interval + lookahead + catch-up guard (`CLAUDE.md:808-811`).
- [ ] **Latency rules**: no compressor on the master path; sound listeners register first
      (`CLAUDE.md:760-768`).
- [ ] **Context bar is the single home** for key, scale, mode, BPM, signature: "pages must NOT grow
      their own duplicate selects" (`CLAUDE.md:731,749-751`). **Help level**: "never add a per-page
      copy" (`CLAUDE.md:702-706`).
- [ ] **Nothing connects at boot** for Helix and the Hub (`CLAUDE.md:417-421`); **one tx funnel**
      and the LUMI guard for the Deck (`CLAUDE.md:554-558`); **Thru never forwards to a LUMI-named
      output** (`CLAUDE.md:495-496`). These must survive the move to `gear.html` unchanged.
- [ ] **Icons** from Lucide, accent via `--accent-*` in old pages, sentence case
      (`CLAUDE.md:817-826`).
- [ ] **Storage only through `App.store`** (`CLAUDE.md:41-43`).

### 1.5 Rules this report recommends adding for Phase A (not yet written anywhere)

- [ ] **Cut exactly what the roadmap lists.** Code that becomes orphaned but is not on the cut
      list (for example `js/practice-router.js`, section 2 D8) is parked and listed in the status
      section, not deleted on a guess.
- [ ] **Never delete or write `guitarlab.*` keys or the `guitarlab-daw` database from v2 code.**
      The live app shares the origin and still uses them (`ROADMAP-2.0.md:74-77`;
      `docs/ROADMAP-AFTER-1.0.md:46-47`: "App/service-worker updates must not delete songs or
      progress. Storage code must never clear all origin data").
- [ ] **The storage prefix belongs to the code, not to the URL.** The same v2 code later runs at
      the live address; a prefix chosen by `/next/` would break at that release.

---

## 2. Roadmap decisions Phase A must implement

Phase A's own line (`ROADMAP-2.0.md:55`):

> A | Trim | remove the Studio space, sequencer, sampler, plug-in API; fold Trainer, Synth pill,
> LUMI pill; move Synth tab + Helix behind `gear.html`; storage prefix for 2.0 (`soundlab2.*`,
> one-time import of `guitarlab.*` at the flip)

### D1. Two apps from one codebase

> **Two apps from one codebase.** `soundLAB` = lessons, practice, consistency, LUMI lights.
> `soundLAB Gear` (working name, `gear.html`) = MODX live control (knobs, scenes, Live sets), the
> Helix page and the MIDI Hub tools (rules, SysEx, monitor). (`ROADMAP-2.0.md:9-12`)

- **Ambiguity:** how much of Gear is Phase A and how much is Phase H ("`gear.html`: MODX live
  control, Helix page, Hub tools; same design system", needs A and B: `ROADMAP-2.0.md:64`).
- **Recommended reading:** Phase A = a second HTML shell `gear.html` at the repo root that shows
  today's pages `deck`, `liveset`, `midihub`, `helix` with today's look, and `index.html` stops
  loading them. Phase H = the redesign. Concretely for Phase A:
  - the four pages leave `SPACES.practice` and `GROUPS` (`js/app.js:43,63,65`) and the script list
    (`index.html:153-158,163`); the Synth tab is three pills, so "Synth tab" includes the Hub
    (`docs/SYNTH-TAB.md:3-12`);
  - one codebase means one `js/app.js` driven by a page set per shell, not a forked copy;
  - both shells sit in one service-worker scope and one manifest scope (`manifest.webmanifest:5-6`),
    so `sw.js` `ASSETS` lists `gear.html` and the Gear scripts stay cached;
  - both shells use the same storage prefix, so MIDI ports (`midi.*`), key lights (`lights.*`),
    the remote (`remote.*`), `midihub.*`, `synthtab.*` and `hx.*` carry across;
  - one plain link each way (Settings in soundLAB, a header link in Gear). No new nav design.
- **Naming trap for docs:** "gear" already means the Settings icon (`CLAUDE.md:753`) and the
  "1.4.0 GEAR CARDS" in Settings (`CLAUDE.md:296`). Write "soundLAB Gear" or "`gear.html`" for the
  app every time.
- **Not Phase A:** a second PWA manifest/installable Gear, the Android app opening Gear
  (`android/src/com/mreindl/soundlab/MainActivity.java:40,125` keeps any URL under the live address inside the WebView, so
  `gear.html` will open there, untested), the claude.ai artifact (`tools/artifact_build.py:25,51`
  stages `index.html` only).

### D2. Which Hub views move, and the Player

Roadmap names only "the MIDI Hub tools (rules, SysEx, monitor)" (`ROADMAP-2.0.md:11-12`). The Hub
has eight views (`js/help.js:115`; names since 1.3 at `CLAUDE.md:496-497`): Deck, Player, Keys, CCs, Rules, SysEx, Monitor, Learn.

- **Ambiguity:** the Player is not named, and two kept features lean on it:
  - Songs' "One Open" card calls `SLMidiHub.player` for **Play on synth** (`js/songs.js:537,706-708`)
    and for **reading MusicXML** on the way to Practice and Open as tab
    (`js/songs.js:692-694,702-703`). Without `js/midihub.js` in `index.html`, MusicXML import into
    the Woodshed and Songs fails with "The MIDI Hub is not loaded" (`js/songs.js:694`).
  - The Player's **Open as tab** calls `App.songs` (`js/midihub.js:1456-1460`), which Gear will not have.
- **Recommended reading:** the whole Hub page, Player included, moves to Gear (the Player sends to
  the synth; that is gear control). The file READER (MIDI + MusicXML + `.mxl` to a score, and
  `songToMidi`) is shared library code that `index.html` must still load, because the roadmap keeps
  "Songs (full library incl. PDF, MusicXML…)" (`ROADMAP-2.0.md:20`) and Phase G is "MusicXML/MIDI →
  Woodshed" (`ROADMAP-2.0.md:62`). In Phase A: split the reader out of `js/midihub.js` (or load the
  Hub file headless), keep Songs → Practice and Songs → Open as tab working, turn "Play on synth"
  into a link to Gear or remove the button, and hide the Player's "Open as tab" in Gear.
  Owner should confirm the Player's home (question Q2).

### D3. Helix leaves the Guitar group

> move Synth tab + Helix behind `gear.html` (`ROADMAP-2.0.md:55`); Gear = "… the Helix page …" (`:11`)

- **Reading (no real ambiguity):** Helix leaves the main app entirely. Guitar becomes
  Neck / Tab / Notation (`js/app.js:63` loses `'helix'`).
- **Residue to fix:** Settings text "Helix (use the Helix page)" (`js/settings.js:899`); the help
  tour (`js/help.js:120-125`); `README.md:28`; `docs/HELIX-STADIUM.md:3`. `tools/helix-bridge.js`
  and `tools/helix-defs.json` stay (the bridge allows any origin: `tools/helix-bridge.js:438`).
  The Helix audio-input auto-pick in Settings stays, it is about sound input
  (`js/settings.js:205,362,401`).
- The stub `plugins/helix-stadium.js` and the "skip an old stored copy" logic (`CLAUDE.md:415-417`)
  go with the plug-in API (D5).

### D4. Cut the Studio space, the sequencer/arranger, the sampler and its database

> **Cut:** the Studio space (Timeline, Editor, Song, Ideas, capture), the sequencer/arranger, the
> sampler and its browser database, … The synth and drum SOUNDS stay as a library for Piano, Jam
> and Woodshed. (`ROADMAP-2.0.md:13-17`)

- **Reading:** remove pages `arrange`, `tracks`, `song`, `ideas` (`js/app.js:44,69-72`), the space
  switch (`index.html:40,85`), capture (`index.html:54-55`), the Settings Studio card and the
  Studio click option (`js/settings.js:77,113-133`), and the files `js/studio.js`, `js/arrange.js`.
- **"SOUNDS stay as a library" means these exact factories stay:** `DAW.createSynth`,
  `DAW.SYNTH_PRESETS`, `DAW.guardPitched` (`js/daw/synth.js:94,118,338-340`) and `DAW.createDrums`,
  `DAW.DRUM_LANES` (`js/daw/engine.js:26,35,795-797`). Callers that stay: `js/piano.js:277-285`,
  `js/jam.js:363-372`, `js/woodshed.js:493-497`, `js/performance-player.js:19`, `js/pads.js`.
- **Ambiguity 1, "sampler":** it is the one-sample pitch-shifted instrument
  (`DAW.createSampler`, `js/daw/engine.js:163`) and its IndexedDB `guitarlab-daw`
  (`js/studio.js:447`; `CLAUDE.md:616-618`). It is NOT Jam's sampled instruments (the FluidR3 MP3s
  in `samples/`, `README.md:52-54`, `CLAUDE.md:640`) and not the Keys page's sampled piano
  (`App.keys.play`, `CLAUDE.md:767-768`). Those stay.
- **Ambiguity 2, "its browser database":** recommended: 2.0 never opens `guitarlab-daw` and does
  not delete it while the live 1.x app shares the origin. Deleting it belongs to Phase I.
- **Ambiguity 3, capture:** the Woodshed writes every run into `ideas.list`
  (`js/woodshed.js:713-727`) and imports "From Studio track" (`js/woodshed.js:1180,1428-1431`).
  Both are Studio features and go; the Woodshed's own bests, XP and progress stay.
- **Also cut with it:** WAV export, FX slots (`DAW.fxPlugins`), `st.*`, `ideas.list`, `song.name`,
  `sd.*`, `app.space`, `app.tabStudio`. The separate React app "soundLAB Studio" (repo Sampler-DAW)
  keeps the DAW idea alive outside this repo (`docs/BRANCH-AUDIT-2026-10-23.md:60,71`).

### D5. Cut the JS plug-in API

> **Cut:** … the JS plug-in API … (`ROADMAP-2.0.md:14`)

- **Reading:** remove `js/plugins.js` (`index.html:165`, `sw.js:64`), the `plugins/` folder (two
  files), `PLUGINS.md`, the Settings card (`js/settings.js:235-243,680-723`), `window.SoundLab`,
  `DAW.fxPlugins` (`js/daw/engine.js:282-289,800`).
- **`App.addPage`** (`js/app.js:886-899`, exported at `:1758`) exists only for plug-in pages: the
  only other `addPage` in `js/` is the Deck's private knob-page function
  (`js/synthdeck.js:308,745`). Recommended: remove it with the API.
- **Stored plug-in code must stop running and must not be imported:** `plugins.list` is skipped by
  the storage import (D10). This is a safety gain worth one line in the PR text.
- **Word trap:** "plugin" in `ROADMAP-2.0.md:35,66` and `docs/DESIGN-SYSTEM.md:53` is the future FL
  Studio VST/CLAP plugin, not this API.

### D6. Trainer page "folded into Plan + Exercises"

> the Trainer page (folded into Plan + Exercises) (`ROADMAP-2.0.md:15`)

The page has four cards (`js/trainer.js:1-4,17-40`):

| Trainer card | Store | Already in the kept app? |
|---|---|---|
| Session timer + log | `tr.sessions` (`js/trainer.js:68,118`) | Yes: Plan times blocks and measures practice (`docs/PRACTICE-PLAN.md:96-109`); per-instrument progress (`docs/PRACTICE-PROGRESS.md`) |
| Random practice prompt, "Go" → `fb:practice` | none (`js/trainer.js:554`) | Yes: Plan launches the Fretboard with `fb:practice` (`docs/PRACTICE-PLAN.md:55`) and has starter blocks (`js/practiceplan.js:116-119`) |
| One-minute chord changes | `tr.best.*`, `tr.ccA`, `tr.ccB` (`js/trainer.js:234,272,524-525`) | **No equivalent anywhere** |
| Interval ear trainer | `tr.earBest`, `tr.earHarm` (`js/trainer.js:358,528-529`) | Yes: Exercises › Intervals has ascending, descending and harmonic ear levels (`js/quiz.js:914-916,987-991`) |

- **Ambiguity:** "folded" can mean "rebuilt inside Plan and Exercises" or "removed because Plan and
  Exercises already do it".
- **Recommended reading for Phase A:** remove the page, its pill and `js/trainer.js`
  (`js/app.js:43,49,67,78`; `index.html:104,141`; `sw.js:36`); three of four cards are already covered;
  import `tr.*` so nothing is lost (`docs/ROADMAP-AFTER-1.0.md:63-64` asks to "Preserve … `tr.*`");
  record the one-minute chord-change drill as a named Phase C item (guitar, B0 matrix). Building a
  new drill UI now would be Phase B/C work. Owner should confirm (Q3).
- **Trap:** "trainer" in `js/metronome.js` (`met.trainer`, `saveTrainer`, `:235-686`) is the
  metronome's tempo trainer and stays.

### D7. Synth pill = "a sound picker on Piano"

> the Synth pill (a sound picker on Piano) (`ROADMAP-2.0.md:15-16`)

- **Fact:** the picker already exists. The Piano page has `#pn-voice` (`js/piano.js:1341`) listing
  Grand piano plus every `DAW.SYNTH_PRESETS` entry (`js/piano.js:294-301`), stored as `pn.voice`
  (`:1480-1486`). The `synth` page is the same DOM borrowed, with the voice forced to a synth preset
  and the lesson card hidden (`js/piano.js:1909-1944`; `CLAUDE.md:680-682`).
- **Phase A (now):** unregister `synth`, drop it from `js/app.js:43,49,64,79`, delete
  `#panel-synth` (`index.html:100`), keep `pn.voice` and `pn.synthPreset`. Repoint the Learn entry
  link `{ label: 'Synth keyboard', page: 'synth' }` (`js/learn-instruments.js:22`) to `piano`.
  Reword the picker's title, which says "the Studio's MPE synth presets" (`js/piano.js:1340`).
  Stored nav memory that says `synth` needs no fix: boot and the group tab already fall back when a
  stored page is no longer in the set (`js/app.js:717,1653`).
- **Later (B/C):** restyle the picker so it is visible in the new Keys page (an earlier note asked
  for "Voice" to stay visible: `docs/UI-LOGIC-SWEEP-1.3.md:13,40`).
- **Not Phase A:** "Synth" as a Learn instrument category (`js/learn-instruments.js:5-6`,
  `js/practiceplan.js:22`) stays; progress is scoped by that id. It is a B0 question.

### D8. LUMI pill "folded into Keys lessons"

> the LUMI pill (folded into Keys lessons) (`ROADMAP-2.0.md:16`)

- **What the page is:** note / major-triad / minor-triad targets with wait-until-correct, a
  simulated keyboard, and three explicit hardware routes: a synth answer input, a scale-locked synth
  sound output (`js/practice-router.js`) and a LUMI display lease (`docs/LUMI-PRACTICE.md:3-15,57-84`).
  It is page-bound in four hooks only (`js/lumi-practice.js:485-492`).
- **What already exists elsewhere:** Keys lessons light now + next on the LUMI through the one
  engine (`CLAUDE.md:67-69,117-122`); Exercises asks "Play the note you see" and chord questions with
  answer lights (`js/quiz.js:959,963`). What exists NOWHERE else: triad targets held until correct,
  a separate answer keyboard by exact port, the scale-locked sound route.
- **Ambiguity:** fold now (re-home the module under the Keys lesson card) or cut now and rebuild as
  lesson types in Phase C ("Keys + Exercises upgrades, next-chord lights", `ROADMAP-2.0.md:58`) on
  the single lighting engine of Phase E (`ROADMAP-2.0.md:60`).
- **Recommended reading:** Phase A removes the pill and the page (`js/app.js:43,51,64,80`;
  `index.html:17,115,159`; `sw.js:10,58`; `css/lumi-practice.css`; `js/lumi-practice.js`), because
  the page keeps a second lighting path (its own lease frames) that Phase E replaces, and Phase A is
  a trim. Keep the MIDI service APIs (`subscribeInput`, `leaseKeybedOutput`, the display master) in
  `js/midi.js`. Record "note and triad targets with a separate answer keyboard" as a Phase C item
  and "one lighting path for them" as Phase E. Owner should confirm, because the beta loses a
  working feature until then (Q4). Alternative if he wants no gap: mount the existing module as a
  collapsed card under Scale lessons on the Keys page (no redesign; its suites keep running with a
  new mount point).
- **Side effects of removing it:**
  - `js/practice-router.js` loses its only caller (`App.practiceRouter.start` is called only at
    `js/lumi-practice.js:442`; `js/midihub.js:568` only reads `.active`). Recommended: park it
    (file and suite stay, no UI), list it in the status section, decide in Phase E/H.
  - The status text "Choose a LUMI display output in Keys → LUMI" (`js/midi.js:447`) must point to
    Settings › MIDI keyboard › Key lights: the display output is the same store key
    `lights.outputId` (`js/midi.js:443-444`), so no setting is lost.

### D9. Pads stays; does it keep recording?

> Pads (rebuilt as rhythm practice: drum rudiments) (`ROADMAP-2.0.md:21-22`), Phase C (`:58`)

- **Fact:** today's Pads is a front end to the Studio loop: it creates a drum TRACK in
  `DAW.engine.tracks`, plays on that track's live channel, records hits into the track's pattern
  against `st:step`, and "Play loop" starts `DAW.engine` (`js/pads.js:45-67,104-125,303-316,361-379`;
  `CLAUDE.md:594-603`). Its help says "Fine-tune the steps afterwards on the Tracks page"
  (`js/help.js:128`) and "Arm the drum track Live on the Tracks page" (`js/pads.js:285`).
- **Ambiguity:** Record and Play loop ARE the sequencer that Phase A cuts, but Pads "stays" until
  Phase C.
- **Recommended reading:** in Phase A Pads keeps the eight pads, the kits (`DAW.createDrums`), touch
  + keys + MIDI maps and the LUMI lights, and loses Record, Play loop and the drum-track coupling.
  It then owns its kit directly. Phase C rebuilds it as rudiment practice with grading. Owner should
  confirm (Q5); the alternative is to keep a slim one-pattern loop inside `js/pads.js`, which keeps
  part of `DAW.engine` alive.
- Scale Lock's rule "paused … while a Studio drum track is armed" (`CLAUDE.md:746-748`) becomes
  simply "paused on the Pads page" (Pads is already LOCK_FREE).

### D10. Storage prefix `soundlab2.*` and the one-time import

> storage prefix for 2.0 (`soundlab2.*`, one-time import of `guitarlab.*` at the flip)
> (`ROADMAP-2.0.md:55`); "they share `localStorage` until Phase A adds the `soundlab2.*` prefix"
> (`:74-75`)

- **Ambiguity 1, "at the flip":** written when the flip meant Phase I. If PR #98 merges, the main
  address already runs 2.0.0 on `guitarlab.*` keys, and the prefix change reaches live users at the
  NEXT v2 → main release.
  **Reading:** the import runs once per browser profile, on the first start of any build that uses
  `soundlab2.*` and finds no import marker. That is correct on the beta today, at a later live
  release, and in the Android app (which loads the live site).
- **Ambiguity 2, what happens to the old keys:** **Reading:** copy, never move. `guitarlab.*` is
  left untouched (rule 1.5). The beta and the live app then hold separate data; that is the purpose
  of the prefix.
- **Ambiguity 3, which keys:** **Reading:** copy everything except the cut features' namespaces:
  `st.*`, `ideas.list`, `song.name`, `sd.*`, `plugins.list`, `app.space`, `app.tabStudio`. Stored
  nav memory (`app.tab`, `app.gtab.*`) naming a removed page is safe as it is (`js/app.js:717,1653`). Keep `tr.*` (D6),
  `midihub.*`, `synthtab.*`, `hx.*` (Gear reads them), `remote.*`, `cc.*`, `pp.*`, `kl.*`, `qz.*`,
  `xp.*`, `ws.*`, `sg.lib`, `jam2.*`, `tun.*`. The exact list is the code mappers' job.
- **Ambiguity 4, Backup:** Settings › Backup filters on the literal prefix
  (`js/settings.js:966,986`). **Reading:** export writes `soundlab2.*`; import accepts both, mapping
  an old `guitarlab.*` backup through the same rules. `docs/CONTROLLER-REMOTE.md:77` promises the
  remote's keys are in the backup.
- **Ambiguity 5, Gear:** **Reading:** same prefix in both shells (D1).
- **Cost to note:** 49 test files contain the literal `guitarlab.` (191 hits), and the palette
  cache reads the raw key (`js/app.js:1024,1031`).
- **Second import for beta testers (optional):** a Settings button "Import again from the live
  app", explicit and replacing, for a tester whose live data moved on. Not required by the roadmap.

### D11. What Phase A must not break (the "Keep and upgrade" list)

> Exercises, Keys lessons, Chords …, Circle, Plan …, Neck/Tab/Notation, Woodshed, Songs …, Jam …,
> Pads …, Tuner, Metronome, Lights & help, Settings. (`ROADMAP-2.0.md:18-22`)

After Phase A the main app's groups are exactly five: Learn (quiz, chords, theory, practiceplan),
Guitar (fretboard, tab, notation), Keys (piano, chart, pads), Play (songs, jam), Train (shed,
tuner). That matches the "5 tabs" header of the design system (`docs/DESIGN-SYSTEM.md:44`) without
doing Phase B.

---

## 3. Doc edits Phase A needs

### 3.1 `CLAUDE.md`

| Lines | What it says now | Action |
|---|---|---|
| 5-8 | "storage keys stay 'guitarlab.*'" | Reword: 2.0 uses `soundlab2.*`; `guitarlab.*` is the 1.x store, imported once, never written |
| 17-30 | 2.0 section | Do NOT rewrite this paragraph (PR #98 rewrites the same lines, section 5.3). Add a new paragraph after line 30: Phase A status pointer, the two shells, the prefix |
| 35 | `index.html` tab shell | Add a `gear.html` line under it |
| 41-43 | `App.store (localStorage 'guitarlab.*')` | New prefix + the import |
| 84, 99-104 | Hub installs the input filter; the Hub holds the `midihub` mute | Add "(soundLAB Gear)"; say what the main app does when the Hub is absent |
| 114-116 | "See NOTE-PALETTE.md and LUMI-PRACTICE.md" | Drop the LUMI-PRACTICE pointer if the page goes (D8) |
| 169-195 | `js/remote.js` | Add: loaded by both shells; Settings card is in soundLAB |
| 196-199 | module block, prefixes "met-/fb-/ch-/jam-/tun-/tr-" | Drop `tr-` |
| 206-213 | `js/piano.js` | Add: the sound picker `#pn-voice` is the former Synth pill |
| 259-266 | Songs ONE OPEN, "Play on synth (SLMidiHub.player…)" | Rewrite per D2 |
| 267-274 | `js/lumi-practice.js` | Delete the entry (or "mounted in the Keys page" if the owner picks the alternative) |
| 275-280 | `js/practice-router.js` "for LUMI practice" | Mark parked: no caller in 2.0 |
| 281-290 | `js/jam.js` | Keep. Line 287 "Studio" is the name of a drum kit, not the Studio space |
| 292 | `js/trainer.js` | Delete |
| 294-312 | `js/settings.js`, "1.4.0 GEAR CARDS" | Keep; rename the heading words to "device cards" to avoid the Gear clash; drop Studio and Plugins cards from the description |
| 317-322 | `js/studio.js` | Delete |
| 389-403 | `js/practiceplan.js` | Keep; add what it took from the Trainer, if anything |
| 404-405 | `js/help.js` | Add: tours for Gear pages live with Gear |
| 406-412 | `js/plugins.js` | Delete |
| 413-447 | `js/helix.js`, "Guitar group pill" | Retitle "soundLAB Gear page"; drop the plugin-stub sentences (415-417) |
| 448-526 | `js/midihub.js`, "Keys group", "(capture)" at 470, SYNTH group at 497-499, Player at 500-526 | Retitle "soundLAB Gear"; fix the nav words; rewrite Open as tab per D2 |
| 527-563 | `js/synthdeck.js` | Retitle "soundLAB Gear"; no content change |
| 564-567 | `data/` "In sw ASSETS, the artifact build and the APK asset copy" | Add: used by Gear |
| 568-593 | `js/synthtab.js`, `js/synthlive.js` | Retitle "soundLAB Gear" |
| 594-603 | `js/pads.js` "still records to st.tracks + studio-armed MIDI" | Rewrite per D9 |
| 604-614 | `js/arrange.js` | Delete |
| 615-634 | `js/daw/engine.js` | Rewrite as "sound library: drum kits" (only `createDrums`, `DRUM_LANES` and what they need) |
| 635-639 | `js/daw/synth.js` "as the studio grows" | Retitle "sound library: synth voices" |
| 672 | `tools/artifact_build.py` | Note: stages `index.html` only |
| 678-682 | BACK TO BASICS: practice space, capture dot, `synth` page | Delete |
| 683-688 | WORKSPACES | Delete |
| 689-701 | SECTION TAB BAR: groups list, studio groups (693), plugin pages (700-701) | Rewrite with the five groups; drop 693 and 700-701 |
| 714-715 | `PANEL_ORDER` | Keep, check wording |
| 723-730 | BACK: "the space's home", "the practice home" | "the home page" |
| 737 | "a red dot on it = Studio capture running" | Delete the clause |
| 746-748 | Scale Lock "while a Studio drum track is armed" | Delete the clause |
| 752 | "#cx-rec (studio capture ●)" | Delete |
| 753-759 | Settings "in both spaces", "studio prefs (sd.retroSecs, sd.playVoice — 'sd:prefs')" | Delete those parts |
| 775-779 | `App.toast` "(the Hub's #mh-toast …)" | Add "(Gear)". The "main 1.3.1-1.4.1" clause goes stale if #98 merges; leave it to that PR |
| 780-782 | "capture listens alongside midi:note", `space` event | Delete both clauses |
| 783-787 | transport owners `'met'|'jam'|'loop'|'song'`, "in studio", "Studio/jam are 4/4-hardcoded" | Owners become met, jam, keys, quiz, chart (section 1.4); drop studio |
| 793 | `fb:practice` "(Trainer prompt "Go" …)" | "(Practice plan block …)" |
| 801-807 | drag: piano roll, step grid, track rows, sampler file drop | Keep only the Jam palette sentence and the pointer rules |
| 835-851 | suites list | Add how Gear pages are tested |
| 879 | "`sw.js` CACHE bump (guitarlab-vN+1)" | Already wrong on v2 (`soundlab2-vN`): write "bump the number in `CACHE`" so it is right under either naming (section 5.3) |
| 889-907 | claude.ai artifact, "WAV export" at 905 | Drop WAV export; say the artifact is the main app only |
| 935-943 | Gotcha: the 1.0.0 release candidate on `codex/soundlab-lumi-consolidation-20261023` | Stale since 1.0.0 shipped. Delete or move under a "history" line (owner's call; not strictly Phase A) |

### 3.2 `README.md`

| Lines | Action |
|---|---|
| 1-5 | Keep (the "alpha" and "guitar practice tool" wording is older than Phase A; a full README rewrite is Phase I "docs") |
| 17-31 | "The five tools" table. Delete row 31 (Trainer). Move rows 26-28 (MIDI Hub, Synth Deck, Helix Stadium) under a new heading "soundLAB Gear (`gear.html`)". Row 26 already says "Keys › MIDI", which has been wrong since 1.3. Delete or reword row 29 (LUMI practice, D8). Row 30: drop "Studio" from "MIDI/Studio/ASCII score sources". Row 24: fine |
| 33 | Scale-locked sound route paragraph: mark as not reachable in the 2.0 beta if D8 is confirmed |
| 35 | "arbitrary plugins" exclusion: drop the word once the API is gone |
| 39-48 | "The prompt that defines this app": history. Leave; item 5 (trainer) is part of the record |
| 65-80 | Architecture block lists `js/trainer.js` (76): delete that line; add `gear.html` |
| 82-90 | "Roadmap ideas": replace with one line pointing to `docs/ROADMAP-2.0.md` |

### 3.3 `PLUGINS.md` and `plugins/`

`PLUGINS.md:1-77` documents an API that Phase A removes. References to it: `CLAUDE.md:411`,
`js/plugins.js:2`, `js/settings.js:237`, `plugins/sample-lofi.js:6`; all four go in the same cut.
**Recommended:** delete `PLUGINS.md` and `plugins/` on `v2` (git history and `main` keep them) and
record "removed in 2.0 Phase A" in the roadmap status section.

### 3.4 `docs/*.md` and `tasks/*.md`

Do not move or rename doc files in Phase A: about 40 cross-links exist between them, and two are
load-bearing: `docs/RELEASE-NOTES-1.0.0.md` is read by `.github/workflows/pages.yml:139` and by
`tests/release-workflow.test.js:13`. Use a one-line banner at the top instead.

Banner texts:
- **Gear:** `> 2.0: this page lives in soundLAB Gear (gear.html) since Phase A. Menu paths below are from 1.x.`
- **Removed:** `> 2.0: removed in Phase A (docs/ROADMAP-2.0.md). Kept as the 1.x record.`
- **Record:** no banner; the date in the file name already says it.

| File | Mentions | Action |
|---|---|---|
| `docs/ROADMAP-2.0.md` | the plan | Add the status section (section 6). Fix nothing else |
| `docs/DESIGN-SYSTEM.md` | none of the cut pages | No edit |
| `docs/CONTROLLER-REMOTE.md` | Trainer `:58`, Live sets + Deck `:59`, Synth page `:53`, LUMI practice `:40,55`, Hub `:27-28` | Edit, section 4.1 |
| `docs/CHORD-CHARTS.md` | none | No edit |
| `docs/LUMI-PRACTICE.md` | the page itself, "Keys → LUMI" `:22` | Banner **Removed** (or rewrite the first section if re-homed). Keep the file: `docs/CI-DEPLOYMENT.md:135`, `docs/GUIDED-PERFORMANCE.md:73`, `README.md:29`, `CLAUDE.md:116,268` link to it |
| `docs/PRACTICE-ROUTER.md` | "The LUMI practice page has three independent routes" `:3`, Hub Thru `:18,60-63` | Banner: parked, no page starts this route in 2.0 |
| `docs/GUIDED-PERFORMANCE.md` | "Studio tracks" `:6`, "XP/Ideas export" `:50`, "Keys → LUMI" `:73-74,142`, the Studio source `:96-97` | Edit those five places |
| `docs/PRACTICE-PLAN.md` | none of the cut pages (`:51-62` routes to tuner, piano, fretboard, shed, chords, jam, quiz) | Add one line if Plan takes anything from the Trainer; otherwise no edit |
| `docs/LEARN-INSTRUMENTS.md` | categories incl. Synth `:3` | No doc edit; the code link is `js/learn-instruments.js:22` |
| `docs/NOTE-PALETTE.md` | suite list names `lumi-practice` `:80,84` | Edit if that suite is removed |
| `docs/EXTERNAL-MIDI-COVERAGE.md` | Hub rows `:12-15,22`, plugins `:35-39` | Banner **Gear** for the Hub rows; plugin lines: "plug-in API removed in 2.0" |
| `docs/SYNTH-DECK.md` | "Keys › MIDI" `:7`, Synth tab `:3` | Banner **Gear** |
| `docs/SYNTH-TAB.md` | the three pills `:3-12` | Banner **Gear** |
| `docs/SYNTH-TAB-PLAN.md` | 1.3 plan | Banner **Gear** (it is cited from `js/synthtab.js:9`, `js/synthdeck.js:119`, `js/midihub.js:581`, `js/synthlive.js:13`) |
| `docs/MODX-MIDI-REFERENCE.md` | synth reference | Banner **Gear** |
| `docs/HELIX-STADIUM.md` | "Guitar › Helix" `:3`, plugin history `:5-6,140` | Banner **Gear**; fix `:3` |
| `docs/PRACTICE-INPUTS.md`, `docs/PRACTICE-PROGRESS.md`, `docs/FUTURE-LESSON-AIDE.md`, `docs/CI-DEPLOYMENT.md` | no cut page ("capture" in PRACTICE-INPUTS is audio capture) | No edit. CI-DEPLOYMENT's "Current publication hold" (`:7-11`) is old; not Phase A |
| `docs/ROADMAP-AFTER-1.0.md` | Trainer in a nav discussion `:54-64` | Record. Its storage rules `:46-47,63-64` still bind (section 1.5, D6) |
| `docs/FEATURE-COVERAGE-2026-10-23.md` | Studio/DAW/sampler Scale Lock rows `:44-47,56,108,192-197` | Record, no edit. It is the reason `tests/sound-lock.test.js` covers the DAW paths; that suite needs trimming with the cut |
| `docs/BRANCH-AUDIT-2026-10-23.md`, `docs/VALIDATION-2026-10-23.md`, `docs/RELEASE-1.0.0-CHECKLIST.md`, `docs/RELEASE-NOTES-1.0.0.md`, `docs/RELEASE-1.3-CHECKLIST.md`, `docs/PRIMER-UI-AND-SCORE-2026-10-25.md`, `docs/UI-LOGIC-SWEEP-1.3.md` | dated records | No edit. `RELEASE-NOTES-1.0.0.md` must not be deleted or emptied (workflow + test) |
| `tasks/*.md` (6 files) | handoffs from October: practice plan, Helix built-in, guided performance, 1.2.0 release, Synth tab | Records, no edit |

### 3.5 In-app help text (`js/help.js`)

| Lines | Text | Action |
|---|---|---|
| 21 | Metronome: "…the practice runners and the Studio all follow it" | Drop "and the Studio" |
| 27 | Fretboard: "The Piano and the Studio's note editor use the same colors" | Drop the Studio part |
| 42-47 | Piano tour | Add the sound picker step (`#pn-voice`) |
| 59 | Woodshed: "Every run is captured as a take in your Studio Ideas" | Delete the sentence |
| 61 | Woodshed: "or pull in any Studio track … MIDI, Studio and generated scores" | Drop Studio twice |
| 66-68 | `trainer` tour | Delete |
| 80-84, 85-90, 91-96, 131-135 | `song`, `arrange`, `tracks`, `ideas` tours | Delete |
| 97-102, 103-108, 109-119, 120-125 | `deck`, `liveset`, `midihub`, `helix` tours | Move with the pages to Gear |
| 126-130 | Pads: "your drum track's kit" (127), "Record a beat … on the Tracks page" (128) | Rewrite per D9 |
| 143 | Settings: "studio capture options … and plugins for advanced workflows" | Drop both |
| 251-253 | Welcome: "two workspaces: Practice … and the Studio … The Studio button in the top corner switches between them" (251), "and the Studio follows" (252), "The tabs — Learn, Guitar, Keys, Play, Practice" (253, already wrong since 1.3) | Rewrite: one app, five tabs Learn / Guitar / Keys / Play / Train |

There is no tour for `synth`, `lumipractice` or `chart` (`js/help.js` keys at lines 15-142), so
nothing to delete for the first two.

Other user-visible strings outside help that name a removed or moved page:
`js/settings.js:75,77,123,133,139` (Studio), `:199` (the hands-free page list), `:236-237` (Plugins),
`:899` ("use the Helix page"); `js/midi.js:447` ("Keys → LUMI"); `js/songs.js:537,694` (Hub Player);
`js/woodshed.js:1169,1180,1429,1431` (Studio); `js/piano.js:1340` (Studio's synth presets);
`js/pads.js:285` (Tracks page).

---

## 4. The remote (#96) and the chord chart maker (#97)

### 4.1 Hands-free remote

What it assumes about pages Phase A removes or moves:

| Assumption | Where | After Phase A |
|---|---|---|
| The Trainer answers Next / Back / Stop and reserves the lowest key | `js/trainer.js:611-651`; doc `docs/CONTROLLER-REMOTE.md:58`; test `tests/remote-runners.test.js:196-226,358-397` | Gone with the page. Delete the doc row and the test sections. Exercises already has "Hear the question again" for ear questions (`docs/CONTROLLER-REMOTE.md:50`) |
| Live sets and the Deck step slots / programs | `js/synthlive.js:133-164,368-369`, `js/synthtab.js:488-492,604-605`; doc `:59`; test `tests/remote-runners.test.js:237-356` | Move to Gear. Works there only if `gear.html` loads `js/remote.js` (today `index.html:126`, right after `js/midi.js`) and `App.remoteAction` (`js/app.js:1116-1135`) |
| A bound message is claimed before any listener, so it "never … goes through the Hub's Thru" and "The Hub Monitor doesn't list it" | doc `:26-29`; `js/synthlive.js:130-131` relies on it | True in Gear only with `js/remote.js` loaded there. If Gear did not load it, a pedal bound in soundLAB (for example CC 86) would reach the Deck and Thru as a normal message. **Load the remote in both shells** |
| Bindings are learned in Settings › Hands-free control and shown in Lights & help | doc `:11`; card `#set-remote-card` rendered by `mount` (`js/remote.js:343`); the "works" test at `js/remote.js:162`, and `js/app.js:1131` | Gear may have no Settings page in Phase A. With one storage prefix the `remote.*` keys carry over; Gear needs one status line and a link back to soundLAB's Settings |
| The Synth page has a runner and hides the lesson card | `js/piano.js:1942-1944`; `js/keylessons.js:38-46`; doc `:53` "Keys / Synth page runner"; test `tests/remote-keys.test.js:313-340` | Page gone (D7). Doc row becomes "Keys page runner"; delete the test section and the comment |
| LUMI practice answers Next / Stop and releases the key in hardware mode | `js/lumi-practice.js:261,489-492`; doc `:40,55`; test `tests/remote-plan.test.js:69-180` | Gone if D8 is confirmed: delete the doc row, the clause in `:40`, and the LUMI half of that suite. The Practice plan half stays |
| The Settings blurb lists the pages | `js/settings.js:199` "…LUMI practice, …, the Trainer, Live sets and the Deck." | Reword to the kept pages; mention Gear in one clause |
| Live sets has its own foot switch besides the remote | `synthtab.fsCC`, `js/synthlive.js:338-343` | Unchanged; moves with the page |
| Arrow keys stay with sliders ("the Deck's strips, the Hub's knobs") | `js/remote.js:222-227` | Still true in Gear |

Doc changes for `docs/CONTROLLER-REMOTE.md`: split the "What each page does" table (`:48-59`) into
"soundLAB" and "soundLAB Gear"; delete the Trainer row; fix rows 53 and 55; in `:11` say where
Gear users set it up; in `:77` name the new backup prefix. The remote's core rules need no change.

### 4.2 Chord chart maker

What it uses, and whether Phase A touches it:

| Dependency | Where | After Phase A |
|---|---|---|
| Page `chart` in the Keys group | `js/app.js:43,64,80` | Stays. Keys pills become Piano, Charts, Pads; `tests/nav.test.js:39` expects `Piano|Charts|Synth|Pads|LUMI` and `:46` expects Keys to remember `synth` |
| The Keys page's sampled piano, `App.keys.play` | `js/chordchart.js:233-236,255,290` | Stays (it is `js/piano.js`, not the sampler) |
| The Woodshed, `importMidi` + `addScore`, for "Practice with LUMI" | `js/chordchart.js:471-476` | Stays. The chart already degrades with a message if the Woodshed is absent (`:473`) |
| The one lighting engine, `App.midi.guide` | `docs/CHORD-CHARTS.md:18-19` | Stays |
| `transport:claim` owner `chart` | `js/chordchart.js:244,273` | Stays; one fewer foreign transport to stop |
| Shared tempo and key | `js/chordchart.js:46,245,306` | Stays |
| Stores `cc.charts`, `cc.active`, `cc.lumi` | `js/chordchart.js:76-91,428,531` | Must be in the storage import (D10) |
| Its own MIDI writer | `js/chordchart.js:306` | Independent of the Hub's `scoreToMidi`; unaffected by D2 |

It has no reference to the Studio, the DAW, the Hub, the Trainer or the Synth page (grep of
`js/chordchart.js` for `DAW|studio|SLMidiHub|midihub|trainer|synth`: no hits). `docs/CHORD-CHARTS.md`
needs no edit. `CLAUDE.md:243-258` stays as is.

---

## 5. PR #98 and staying compatible either way

### 5.1 What it is

Draft PR #98, "soundLAB 2.0.0 goes live (v2 into main)", base `main`, head
`claude/project-thread-rhqjuv` at `c875605`, opened 2026-11-11 17:45 UTC by another session. The
branch is `origin/v2` (`5be2eab`) + a merge of `main` (`fe02497`) + one commit. Against v2 it
changes four files (`git diff --stat origin/v2 origin/claude/project-thread-rhqjuv`: 24 insertions,
15 deletions):

| File | Change |
|---|---|
| `sw.js` | `var BETA = /\/next\/$/.test(self.registration.scope); var PREFIX = BETA ? 'sl2-next-' : 'sl2-live-'; var CACHE = PREFIX + 'v4';` The activate step deletes other caches with its own prefix, any `soundlab2-*`, and, on the live scope only, `guitarlab-*` |
| `js/app.js` | `APP_VERSION = '2.0.0'` |
| `version.json` | `web` 2.0.0 and new notes; `version` (APK) unchanged |
| `CLAUDE.md` | lines 19-30 rewritten: "2.0.0 WENT LIVE (2026-11-11)", "a later live release = a PR v2 -> main", "Phase A and later not started at the flip", caches "named by scope (`sl2-live-*` / `sl2-next-*`)", "Beta + live share `localStorage` (same `guitarlab.*` keys, so progress carries over; prefix `soundlab2.*` comes in Phase A)" |

Its text says nothing is removed and storage keys stay `guitarlab.*`. It runs against
`ROADMAP-2.0.md:71` ("Nothing lands on `main` before Phase I"); that is the owner's decision, not
Phase A's.

### 5.2 What changes for Phase A if it merges

1. **v2 does not receive it.** The PR merges into `main`. `v2` keeps `soundlab2-v3`, 1.4.1 and the
   old CLAUDE.md paragraph until someone merges `main` back into `v2`.
2. **The beta would show an update banner forever.** The checker compares `APP_VERSION` with
   `version.json` on `main` (`js/app.js:102,129-130`). With `main` at web 2.0.0 and `v2` at 1.4.1,
   every beta visit shows "soundLAB v2.0.0 is available", and "Update now" cannot clear it. So the
   first v2 PR after #98 merges must bring `main` into `v2`.
3. **The live worker stops wiping the beta's cache.** Until then the Phase 0 caveat stands
   (`git show origin/main:sw.js` line 108 deletes every other cache).
4. **"The flip" has then happened on `guitarlab.*`.** D10's reading (import on first run of a
   `soundlab2.*` build, copy and never move) is the one that works in both worlds. After Phase A
   the sentence "so progress carries over" becomes "copied once into the beta".
5. **The next v2 → main PR carries Phase A to every live user.** Phase A work should therefore be
   written as if it ships: no beta-only shortcuts in the import, the removed pages, or the worker.

### 5.3 How to write Phase A so it merges cleanly with or without #98

- **`sw.js`:** edit only two things: the number inside `CACHE` and the `ASSETS` list. Do not touch
  the comment at lines 1-3 or the activate filter at line 113; #98 rewrites exactly those. Keep the
  number rising across both namings: v2 is at 3 and #98 uses 4, so Phase A's first bump should be 5
  (`'soundlab2-v5'`), which later becomes `PREFIX + 'v5'` with a one-token conflict. Under #98's
  worker the beta also deletes old `soundlab2-*` caches, so nothing is stranded.
- **`gear.html` and the worker:** #98 detects the beta by the registration scope ending in
  `/next/`. `gear.html` sits in the same folder and the same scope, so that test stays right. Do not
  register a second worker or a narrower scope for Gear.
- **`js/app.js:101` and `version.json`:** do not touch in Phase A PRs (rule 1.3). They then merge
  without conflict.
- **`CLAUDE.md:17-30`:** do not edit inside that paragraph. Both versions contain "prefix
  `soundlab2.*` comes in Phase A"; rewriting it on v2 guarantees a conflict. Add a NEW paragraph
  below line 30 for Phase A facts, and fold the two together after #98 is merged or closed.
  `CLAUDE.md:879` can be fixed now in a way both accept ("bump the number in `CACHE`").
- **Wording to respect if #98 merges:** "a later live release = a PR v2 -> main". Phase A PRs still
  go into `v2` as drafts; they never open a v2 → main PR themselves.
- **If #98 merges while Phase A is in flight:** the next Phase A PR starts with a merge of `main`
  into the working branch (ordinary merge, no force), resolving `sw.js` to `PREFIX + 'v<next>'`,
  taking `APP_VERSION` and `version.json` from `main`, and taking #98's CLAUDE.md paragraph.
- **If #98 is closed unmerged:** nothing to do; `soundlab2-vN` continues.
- **Storage is independent of both cache namings.** Cache Storage names (`soundlab2-*`, `sl2-*`)
  and `localStorage` keys (`soundlab2.*`) are different stores. Docs should say "caches" and
  "storage keys" and never just "the soundlab2 prefix".
- **`next/beta.json`** exists on the beta (`pages-next.yml:58,71`) but no app code reads it
  (`grep beta.json js/ index.html sw.js`: no hits). Do not build Phase A logic on it.

### 5.4 Other sessions to account for

- **PR #90** (open, base `main`): SheetLab, "My library" and a 1.4.0 remote, +45,628 lines across
  159 files in the PR diff, untouched since 2026-11-02, not in `v2`. The roadmap puts sheet-music
  recognition last ("G2 … never blocks 2.0", `ROADMAP-2.0.md:63`). If it ever merged to `main` it
  would collide with every Phase A cut at the next v2 → main release. Do not act on it; list it for
  the owner (Q7).
- **Branches ahead of v2 and not merged:** `feat/review-to-synth` (10 commits; `CLAUDE.md:525-526`
  cites its suite), `check/lumi-claude` (2), `check/modx-maps-claude` (1). The four
  `claude/project-thread-*` branches other than `rhqjuv` are fully contained in v2.
- **Coordination records** are on `coord/cowork-20261022-claude` (cited in
  `tasks/20261024T1930Z-helix-synthdeck-release-claude.md:8`, `docs/RELEASE-1.3-CHECKLIST.md:5-6` and `docs/BRANCH-AUDIT-2026-10-23.md:16`),
  not on `v2`.
- `tests.yml` still lists the old `codex/soundlab-lumi-consolidation-20261023` branch as its push
  trigger (`.github/workflows/tests.yml:6`); harmless, PRs trigger it anyway.

---

## 6. Proposed "Phase A status" section for `docs/ROADMAP-2.0.md`

Insert after the Phases table (after line 66), before "Rules for the build". The PR that finishes a
step updates its row in the same commit.

```markdown
## Phase A status (Trim)

Update this table in the pull request that finishes a step. "Done" means merged into `v2`
with the full suite green.

| Step | What | State | PR |
|---|---|---|---|
| A0 | Map of everything the trim touches, and the plan | in progress | — |
| A1 | Studio space removed: Timeline, Editor, Song, Ideas, capture, workspace switch | not started | — |
| A2 | Sequencer/arranger and sampler removed; sampler database no longer opened; synth and drum sounds kept as a library | not started | — |
| A3 | Plug-in API removed (`js/plugins.js`, `plugins/`, `PLUGINS.md`, Settings card) | not started | — |
| A4 | Trainer page removed; covered by Plan and Exercises | not started | — |
| A5 | Synth pill removed; the sound picker stays on Piano | not started | — |
| A6 | LUMI pill removed | not started | — |
| A7 | `gear.html` (soundLAB Gear): Deck, Live sets, MIDI Hub, Helix leave the main app | not started | — |
| A8 | Storage prefix `soundlab2.*` with the one-time copy from `guitarlab.*` | not started | — |
| A9 | Docs, help tours and tests match the trimmed app | not started | — |

Decisions taken while trimming (each needs Matt's yes; until then the recommended reading is used):

- Pads keeps its pads, kits, MIDI maps and lights; Record and Play loop go with the sequencer
  until Phase C rebuilds Pads as rhythm practice.
- The MIDI Hub's Player goes to Gear. Reading MIDI and MusicXML files stays in soundLAB for
  Songs and the Woodshed.
- The copy from `guitarlab.*` runs once per browser, on the first start of a 2.0 build. It never
  changes or deletes the 1.x data. Studio, sampler and plug-in data is not copied.
- One-minute chord changes (Trainer) and note/triad targets with a separate answer keyboard
  (LUMI page) have no home yet: Phase C.

Parked, not deleted: `js/practice-router.js` (scale-locked synth sound; no page starts it now).
Removed in 2.0: `PLUGINS.md`, `plugins/`.
```

---

## 7. Open questions, each with a recommended answer

| # | Question | Recommended answer |
|---|---|---|
| Q1 | Is `gear.html` in Phase A a second shell over the same code with today's look, with the redesign left to Phase H? | Yes (D1) |
| Q2 | Does the MIDI Hub's Player stay in the main app? | No: it goes to Gear with the Hub. The MIDI/MusicXML reader stays loadable by the main app so Songs → Practice and Open as tab keep working (D2) |
| Q3 | Trainer: rebuild its cards inside Plan and Exercises now, or remove and rely on what exists? | Remove now; three of four cards are already covered; keep `tr.*`; chord-change drill becomes a Phase C item (D6) |
| Q4 | LUMI pill: remove the page now, or re-home it under Keys lessons until Phase C/E? | Remove now and record the gap; re-home only if Matt wants no gap in the beta (D8) |
| Q5 | Does Pads keep Record and Play loop? | No: they are the sequencer. Pads stays playable; Phase C rebuilds it (D9) |
| Q6 | When does the `guitarlab.*` import run, and does it move or copy? | Once per browser on first start of a `soundlab2.*` build; copy, never move or delete (D10) |
| Q7 | PR #98 and PR #90: wait for them? | No. Write Phase A to merge cleanly either way (5.3). Ask Matt to merge or close #98 before the first Phase A PR is merged, so the version and cache lines settle once; treat #90 as not part of 2.0 |
| Q8 | Is `js/practice-router.js` cut with the LUMI page? | Park it; it is not on the roadmap's cut list (rule 1.5) |
| Q9 | Does Gear load the remote? | Yes, `js/remote.js` in both shells, same `remote.*` keys (4.1) |
| Q10 | Delete the sampler database `guitarlab-daw`? | Not in Phase A: the live app on the same origin still uses it. Stop opening it; delete in Phase I |

---

## 8. Grep traps (words that look like a cut feature and are not)

| Word | Not the cut feature here | Evidence |
|---|---|---|
| "trainer" | the metronome's tempo trainer, `met.trainer` | `js/metronome.js:235-686`; `js/help.js:24` |
| "Studio" | "FL Studio" (the host app) | `docs/ROADMAP-2.0.md:4,34`; `CLAUDE.md:86` |
| "Studio" | a drum KIT name in Jam ("Studio/808/909/Lo-fi") | `js/jam.js:351,1090`; `CLAUDE.md:287` |
| "plugin" | the future FL VST3/CLAP plugin | `docs/ROADMAP-2.0.md:35,66`; `docs/DESIGN-SYSTEM.md:53` |
| "sampled" / "samples" | Jam's FluidR3 MP3s and the Keys page's sampled piano | `README.md:52-54`; `CLAUDE.md:640,767-768` |
| "capture" | audio-input capture for practice | `docs/PRACTICE-INPUTS.md:28-47`; `js/settings.js:580` |
| "capture phase" | DOM event capture in the remote | `CLAUDE.md:177` |
| "gear" | the Settings icon, and the "GEAR CARDS" in Settings | `CLAUDE.md:296,753` |
| "addPage" | the Deck's own knob-page function | `js/synthdeck.js:308,745` |
| "synth" | a Learn instrument category id | `js/learn-instruments.js:5-6`; `js/practiceplan.js:22` |
| "Sequencer" | the MODX Motion Sequencer in Gear docs | `docs/SYNTH-DECK.md:30,42-43,80` |
| "soundlab2-" vs "soundlab2." | cache names vs storage keys | `sw.js:4` vs `ROADMAP-2.0.md:55` |
