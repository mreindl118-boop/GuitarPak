# Phase A map — Studio space, sequencer/arranger, sampler + database, and the sounds that survive

Tree mapped: `/home/user/GuitarPak`, branch `claude/verify-project-files-4bchk6-v2` = `origin/v2` at `5be2eab`.
Read-only pass: nothing in the repo was changed, no suite was run. Every "nothing else uses X" below was checked with grep over `*.js`, `*.html`, `*.css`, `tests/`, `tools/`, `android/`, `.github/`.

Files in scope and their size today:

| File | Lines | Fate |
|---|---|---|
| `js/studio.js` | 1268 | delete whole |
| `js/arrange.js` | 776 | delete whole |
| `js/daw/engine.js` | 836 | slim to the drum kit (about 135 lines) |
| `js/daw/synth.js` | 341 | keep whole |
| `js/pads.js` | 474 | keep, cut its loop/record half (section 4) |

---

## 1. What the Studio side exports and emits

### 1.1 `window.DAW`

| Member | Defined | Kind |
|---|---|---|
| `DAW.defaultSynth` | `js/daw/synth.js:71`, exported `:337` | sound |
| `DAW.SYNTH_PRESETS` (`saw`, `pad`, `keys`, `bass`) | `js/daw/synth.js:94-116`, exported `:338` | sound |
| `DAW.createSynth(ctx, params)` | `js/daw/synth.js:118-334`, exported `:339` | sound |
| `DAW.guardPitched(instrument, allowAudioClip)` | `js/daw/synth.js:28-55`, exported `:340`; listens to `scale:boundary` at `:56` | sound (Scale Lock admission) |
| `DAW.DRUM_LANES` | `js/daw/engine.js:26`, exported `:795` | sound |
| `DAW.createDrums(ctx, params)` | `js/daw/engine.js:35-148` (+ private `defaultDrums` `:28-33`), exported `:797` | sound |
| `DAW.samples` | `js/daw/engine.js:161`, exported `:796` | sampler |
| `DAW.createSampler` | `js/daw/engine.js:163-238` (+ `defaultSampler` `:152-157`), exported `:798` | sampler |
| `DAW.buildFx` | `js/daw/engine.js:285-323` (+ `wetDry` `:242`, `makeImpulse` `:260`, `distortionCurve` `:271`), exported `:799` | FX |
| `DAW.fxPlugins` | `js/daw/engine.js:282`, exported `:800` | plug-in FX registry |
| `DAW.audioBufferToWav` | `js/daw/engine.js:351` (+ `encodeWav` `:327`), exported `:801` | WAV |
| `DAW.downloadBlob` | `js/daw/engine.js:357`, exported `:802` | WAV |
| `DAW.engine` | `js/daw/engine.js:809-835` | sequencer |

`DAW.engine` members: `tracks` (get/set), `bars` (get/set), `playing`, `play`, `stop`, `applyMix`, `rebuildChannel`, `liveChannel`, `render`, `songPlaying`, `loopRegion` (get/set), `songPlay`, `songStop`, `freeRun` (get/set), `setPosition`, `position`, `songEnd`, `renderSong`, `channelAnalyser`, `stats`.

### 1.2 `App.*` members and shell pieces that exist only for the Studio

| Thing | Where |
|---|---|
| `SPACES.studio = ['arrange','tracks','song','ideas']` | `js/app.js:44` |
| `GROUPS.studio` (`gstudio`, `gsketch`) | `js/app.js:69-72` |
| labels for `song`, `arrange`, `tracks`, `ideas` | `js/app.js:50` (SPACE_LABELS), `:79` (SUB_LABELS) |
| `spaceOf`, `tabStoreKey` | `js/app.js:688-692` |
| cross-space hop in `switchTo` | `js/app.js:767-768` |
| `applySpace`, `setSpace`, the wipe | `js/app.js:1194-1255` |
| `App.space` getter, `App.setSpace` | `js/app.js:1755-1756` |
| `#space-btn` wiring and label | `js/app.js:1202-1208`, `:1625-1631`, `:1646-1650` |
| `html[data-space]` | set at `js/app.js:1201`, `:1645`; the only CSS reader is `js/studio.js:1162` |
| Studio branch of the `#cx-met` transport button | `js/app.js:1467-1470`, `:1477`, `:1483-1491`, `:1495-1497`, `:1505` |
| pages registered | `song`, `ideas`, `tracks` at `js/studio.js:1255-1267`; `arrange` at `js/arrange.js:756-775` |

### 1.3 Bus events

| Event | Emitted | Payload |
|---|---|---|
| `st:step` | `js/daw/engine.js:567` | `{step, bars}` |
| `st:state` | `js/daw/engine.js:583`, `:594` | `{playing}` |
| `st:tr` | `js/daw/engine.js:722`, `:734` | `{playing}` |
| `st:edit` | `js/arrange.js:428` | `{trackId}` |
| `transport:claim` owner `loop` | `js/daw/engine.js:572` | |
| `transport:claim` owner `song` | `js/daw/engine.js:709` | |
| `sd:prefs` | emitted by Settings, `js/settings.js:299`, `:315` | `{}` |
| `space` | `js/app.js:1213` | `{space}` |
| `fb:set` with `source:'studio'` | `js/studio.js:347` ("Use key" on an idea) | |

Listeners the Studio side adds to shared events: `midi:note` and `note:input` at the FRONT of the bus (`js/studio.js:1202-1209`, capture + live routing), `midi:bend` / `midi:pressure` (`js/studio.js:1210-1221`), `fb:scale` / `fb:set` / `tempo` / `colors` (`js/studio.js:1091-1093`, `:1233-1235`), `midi:note` / `note:input` (`js/arrange.js:698-699`), `transport:claim` (`js/daw/engine.js:803-807`), plus a `visibilitychange` handler (`js/studio.js:1250-1252`).

Other side effects: wake tags `st-run` (`js/daw/engine.js:580`, `:593`) and `st-song` (`:719`, `:733`); injected style blocks `studio` (`js/studio.js:1161-1198`) and `arrange` (`js/arrange.js:573`); a `#sd-toast` element created on demand (`js/studio.js:179-185`); class `rec` toggled on `#ctx-btn` (`js/studio.js:165-166`).

### 1.4 Stores (all under the `guitarlab.` prefix, `js/app.js:525-539`)

| Key | Written | Read |
|---|---|---|
| `st.tracks` | `js/studio.js:395`; `js/arrange.js:46`, `:296`; `js/pads.js:67`, `:125`, `:361`, `:379` | `js/studio.js:380` only |
| `st.bars` | `js/studio.js:396` | `js/studio.js:390` |
| `st.armed` | `js/studio.js:971`, `:987`; `js/arrange.js:228`, `:297`, `:524` | `js/studio.js:534`, `:1099`, `:1212`, `:1218`; `js/arrange.js:165`, `:211`; `js/piano.js:1766`; `js/pads.js:440` |
| `st.zoomX`, `st.snap`, `st.follow`, `st.loop` | `js/arrange.js:396`, `:706`, `:712`, `:719`, `:724`, `:729` | `js/arrange.js:663-667` |
| `ideas.list` | `js/studio.js:110`; `js/woodshed.js:727` | `js/studio.js:105`; `js/woodshed.js:715` |
| `song.name` | `js/studio.js:1149` | `js/studio.js:954`, `:1147`; `js/arrange.js:737` |
| `sd.retroSecs` | `js/settings.js:298` | `js/studio.js:23`; `js/settings.js:289` |
| `sd.playVoice` | `js/settings.js:314` | `js/studio.js:209`; `js/settings.js:306` |
| `app.space` | `js/app.js:1200` | never read (boot hard-codes practice, `js/app.js:1643`) |
| `app.tabStudio` | `js/app.js:792` via `tabStoreKey` | `js/app.js:915`, `:1210` (only while in the studio space) |
| `app.gtab.gstudio`, `app.gtab.gsketch` | `js/app.js:780` | `js/app.js:716` |
| `app.click` | `js/settings.js:283`; `js/pads.js:313`, `:318`, `:351` | `js/daw/engine.js:480`; `js/settings.js:281`, `:1010`; `js/pads.js:209`, `:312` |
| `pads.track` (an id inside `st.tracks`) | `js/pads.js:380`, `:385` | `js/pads.js:49` |

IndexedDB: database `guitarlab-daw`, version 1, object store `samples` (key = track id, value = the audio file's ArrayBuffer). Opened only at `js/studio.js:447`; put `:454`, get `:465`, delete `:475`. No other file names it.

---

## 2. Consumers outside `studio.js`, `arrange.js` and the sequencer part of `engine.js`

### 2.1 Sounds — these consumers survive, so the code must stay

| Export | Consumer | What it does |
|---|---|---|
| `DAW.createSynth`, `DAW.SYNTH_PRESETS` | `js/piano.js:277`, `:283`, `:285`, `:296-300` | Keys page synth voice and the `#pn-voice` sound picker; uses `noteOn`, `allNotesOff`, `output`, `pitchBend` (`:523`), `pressure` (`:531`) |
| `DAW.createSynth`, `DAW.SYNTH_PRESETS[2]` | `js/woodshed.js:497` | Woodshed melodic playback voice |
| `DAW.createSynth`, `DAW.SYNTH_PRESETS[2]` | `js/performance-player.js:19` | guided performance voice (`allNotesOff` `:24`, `:316`; `dispose` `:170`; `noteOff` `:290`) |
| `DAW.createDrums(ctx)` (default kit) | `js/woodshed.js:493` | Woodshed drum voice (`noteOn(1, …)` at `:515`) |
| `DAW.createDrums(ctx, {gain, lanes})` | `js/jam.js:363`, `:372` | Jam drum kits (Studio / 808 / 909 / Lo-fi, `js/jam.js:350-359`) |
| `DAW.DRUM_LANES` | `js/pads.js:171`, `:333` | pad names |
| `DAW.guardPitched`, `DAW.defaultSynth`, `DAW.createDrums` | `tests/sound-lock.test.js:120`, `:132`, `:137`, `:143`, `:160` | Scale Lock admission tests |

Note: `SYNTH_PRESETS[2]` is used by index in Woodshed and the performance player, so the preset order must not change.

Exercises (`js/quiz.js`), the metronome (`js/metronome.js`), Trainer, Chords and the Fretboard do not touch `DAW` at all (grep: no hit). They sound through `App.pluck` / `App.keys.play`, which live in `js/app.js` and `js/piano.js`. The sample decode helpers `App.sampleLead` / `App.sampleNorm` are in `js/app.js:335-341` and are used by `js/jam.js:260`, `:322`, `:329` and `js/piano.js:244`, `:342`, `:351`, `:561`, `:573`; they are not part of the Studio and need no change.

### 2.2 Sampler, FX, WAV — no surviving consumer

| Export | Consumers outside the cut | Verdict |
|---|---|---|
| `DAW.samples` | `tests/sound-lock.test.js:71`, `:95`, `:150` only | cut |
| `DAW.createSampler` | `tests/sound-lock.test.js:72`, `:151` only | cut |
| `DAW.buildFx` | none (only `js/daw/engine.js:423` calls it) | cut |
| `DAW.fxPlugins` | `js/plugins.js:79` (`SoundLab.registerFx`) | cut together with the plug-in API |
| `DAW.audioBufferToWav` | none (internal to `render` / `renderSong`) | cut |
| `DAW.downloadBlob` | none (`js/studio.js:954`, `js/arrange.js:737` only) | cut |

### 2.3 Sequencer (`DAW.engine`)

| Member | Consumers outside the cut |
|---|---|
| `tracks` | `js/pads.js:45`, `:60`, `:67`, `:125`, `:361`, `:378-379`; `js/woodshed.js:1428`; `tests/lights.test.js:125-128`; `tests/colors.test.js:228`, `:234`; `tests/sound-lock.test.js:91-100` |
| `bars` | `js/pads.js:121`, `:193` |
| `playing`, `play`, `stop` | `js/pads.js:107`, `:207`, `:303`, `:316`; `js/app.js:1469`, `:1486`, `:1488` |
| `liveChannel` | `js/pads.js:104` |
| `songPlaying`, `songPlay`, `songStop` | `js/app.js:1469`, `:1485`, `:1487` |
| `render`, `renderSong` | `tests/sound-lock.test.js:91-101` |
| `applyMix`, `rebuildChannel`, `loopRegion`, `freeRun`, `setPosition`, `position`, `songEnd`, `channelAnalyser`, `stats` | none |

Matches that are NOT this engine (checked): `renderSong` in `js/songs.js:410` is that file's own function; `engine.stop` in `js/performance-player.js:111` and `tests/performance-engine.test.js:210` is the PerformanceEngine; `songStop` in `tests/lumi-contexts.test.js:247` is a local variable.

### 2.4 Events

| Event | Consumers outside the cut |
|---|---|
| `st:step` | `js/app.js:1505` (transport pulse); `js/pads.js:448` (quantize reference + pad flash) |
| `st:state` | `js/app.js:1495`; `js/pads.js:456` |
| `st:tr` | `js/app.js:1496` |
| `st:edit` | `tests/colors.test.js:229` only |
| `sd:prefs` | none (only `js/studio.js:1245` listens) |
| `space` | `js/app.js:1497` only |
| `transport:claim` from `loop` / `song` | `js/metronome.js:501`, `js/jam.js:1420`, `js/chordchart.js:273`, `js/keylessons.js:846` — all compare against their OWN owner name, none names `loop` or `song`, so nothing changes for them |
| `note:input` (emitted by `js/piano.js:1185`, `:1194`, `:1756` and `js/midihub.js:277-278`) | still consumed by `js/woodshed.js:1593`, `js/fretboard.js:2026`, `js/keylessons.js:845`, `js/midi.js:1185` — keep the emits |

### 2.5 `App.space`, `App.setSpace`

| Consumer | Line | Effect of removing the getter without editing the consumer |
|---|---|---|
| `js/quiz.js:2951` | `if (App.space === 'practice' && App.active !== 'quiz') App.switchTo('quiz')` | the one-time landing on Exercises for a new install silently stops happening |
| `js/piano.js:1766` | `App.space === 'studio' && App.store.get('st.armed', null)` | harmless, dead code |
| `js/pads.js:441` | `App.active !== 'pads' && !(App.space === 'studio' && armed)` | harmless, dead code |
| tests | `tests/nav.test.js:158-171`, `tests/lights.test.js:124`, `tests/smoke.test.js:24` | fail |

`App.setSpace` is called only from `js/app.js` itself and `tests/nav.test.js:164`, `:167`.

### 2.6 Stores

| Key | Consumers outside the cut |
|---|---|
| `st.tracks` | `js/pads.js:67`, `:125`, `:361`, `:379` (writes only) |
| `st.armed` | `js/piano.js:1766`; `js/pads.js:440`; `tests/lights.test.js:127` |
| `ideas.list` | `js/woodshed.js:715`, `:727` (`captureRun`, called at `:709`) |
| `sd.retroSecs`, `sd.playVoice` | `js/settings.js:289`, `:298`, `:306`, `:314` |
| `app.click` | `js/settings.js:281-283`, `:1010`; `js/pads.js:209`, `:312-318`, `:351` |
| `st.bars`, `st.zoomX`, `st.snap`, `st.follow`, `st.loop`, `song.name` | none |
| IndexedDB `guitarlab-daw` | none |

---

## 3. The cut line

### 3.1 Delete whole

- `js/studio.js` — pages `song`, `ideas`, `tracks`, the capture service, the IndexedDB sample store, the live routing of an armed track.
- `js/arrange.js` — page `arrange`.

Both also go from `index.html` (`:145`, `:151`) and `sw.js` ASSETS (`:41`, `:42`).

### 3.2 Keep whole: `js/daw/synth.js`

Every part has a surviving consumer: `guardPitched` (Scale Lock admission, used by `createSynth` at `:173`), `defaultSynth`, `SYNTH_PRESETS`, `createSynth`. It needs `App.on`, `App.scaleLock` and `Theory.noteFreq`, all of which stay. Only the header comment (`:1-17`, "soundLAB studio synth") needs rewording. The `allowAudioClip` argument of `guardPitched` (`:28`, `:35`) was only for the sampler; it can stay as is (harmless) to keep the diff small.

### 3.3 Slim `js/daw/engine.js`

| Lines | Content | Action |
|---|---|---|
| `1-20` | header comment | rewrite (it describes things that will be gone) |
| `24-148` | `DRUM_LANES`, `defaultDrums`, `createDrums` | KEEP |
| `150-238` | sampler | delete |
| `240-323` | FX | delete |
| `325-364` | WAV | delete |
| `366-595` | loop engine (tracks, channels, mixer, click, `scheduleLoop`, `scheduleStep`, `tick`, `play`, `stop`) | delete |
| `597-769` | song mode and `renderSong` | delete |
| `771-792` | `liveChannel`, `render` | delete |
| `794-795`, `797` | `window.DAW = window.DAW \|\| {}`, `DAW.DRUM_LANES`, `DAW.createDrums` | KEEP |
| `796`, `798-835` | the other exports, the `transport:claim` listener, `DAW.engine` | delete |

`createDrums` is self-contained (it only uses its `ctx` argument and `defaultDrums`), so the slimmed file no longer needs `App` and no longer depends on load order.

### 3.4 Where the kept code should live — recommendation

Keep `js/daw/synth.js` and the slimmed `js/daw/engine.js` at their current paths and keep the global name `window.DAW`. Do not create `js/sounds.js` in Phase A.

Reasons:
- Five consumers keep working with zero edits: `js/piano.js:277-300`, `js/jam.js:363-372`, `js/woodshed.js:493-497`, `js/performance-player.js:19`, `js/pads.js:171`.
- `tests/sound-lock.test.js:42`, `:60-61` loads the two files by path; only the sampler and render checks have to go, not the harness.
- `index.html:143-144` and `sw.js:39-40` stay as they are, so the Phase A diff in those files is deletions only. That merges cleanly with PR #98, which edits `sw.js` lines 1-4 and the `activate` filter.
- The change is a pure deletion, which is easy to review and easy to recover from `main` if a cut piece (reverb, WAV) is wanted later.
- Phase C rebuilds Pads and the Woodshed drums and adds the sound picker; that is the natural moment to rename to something like `js/sounds/` because those consumers get touched anyway.

Cost of this choice: a file called `engine.js` in a folder called `daw` that holds a drum kit. A one-line comment at the top covers it until Phase C.

### 3.5 Coupling with the plug-in API (other area, same PR)

`js/plugins.js:79` writes `DAW.fxPlugins` and `js/plugins.js:68` hands plugins `DAW` (and so `DAW.engine`). If the engine is slimmed while `js/plugins.js` stays, `SoundLab.registerFx` throws on `DAW.fxPlugins[id] = def` and any stored plugin that reads `SoundLab.daw.engine` breaks. The shipped sample `plugins/sample-lofi.js:9` calls `registerFx`. So the plug-in API removal must land in the same commit as the engine slim, or `js/plugins.js:77-81` must be neutralised first.

---

## 4. Pads with no Studio

### 4.1 What Pads uses today

| Need | Today | Line |
|---|---|---|
| a drum track to play | `DAW.engine.tracks` filtered by `kind === 'drums'`; creates one if missing and writes `st.tracks` | `js/pads.js:44-68` |
| the sound | `DAW.engine.liveChannel(t.id).instrument.noteOn(lane, vel, now)` | `js/pads.js:104-105` |
| Play loop | `DAW.engine.play()` / `stop()` / `playing` | `js/pads.js:207`, `:303` |
| Record hits | quantizes into `t.steps` against the last `st:step`, writes `st.tracks` | `js/pads.js:107`, `:117-127`, `:307-322` |
| loop heartbeat | `st:step`, `st:state` | `js/pads.js:448-456` |
| Click | `app.click`, read by the loop engine | `js/pads.js:208-209`, `:312-318`, `:350-354` |
| Clear, drum-track picker, "+ Drum track" | edit `st.tracks`, `pads.track` | `js/pads.js:355-387` |
| MIDI from anywhere in the Studio | `st.armed` + `App.space === 'studio'` | `js/pads.js:440-441` |

Two facts that decide the design:
- `DAW.engine.tracks` is filled ONLY by `loadTracks()` in `js/studio.js:379-392`, called from the Tracks page init at `js/studio.js:931`. With `studio.js` gone the list is empty at every boot.
- `js/pads.js:67` then writes that near-empty list to `guitarlab.st.tracks`. The beta and the live app share `localStorage`, so an unchanged Pads on a Studio-less beta would overwrite the user's live Studio tracks the first time the Pads page opens.

### 4.2 Recommended: play-only pads (smallest change that removes every Studio dependency)

Pads keeps: the eight pads by touch, Z X C V / A S D F, MIDI in ROLI or GM mapping, Remap, the LUMI key lights and the keybed claim. Pads loses until Phase C: Play loop, Record hits, Click, Clear, the drum-track picker.

The sound is unchanged. Today's path is `liveChannel` (`js/daw/engine.js:772-778`) → `buildChannel` (`:421-436`) → `createDrums(ctx, defaultDrums())` (`:389`) → FX `none` → gain `vol / 80` = 1 at the default 80 → `ctx.destination`. `DAW.createDrums(ctx)` with no params builds the same default kit (`js/daw/engine.js:36`), the same way `js/woodshed.js:493` already does.

Replacement for `js/pads.js:44-68` and `:99-115`:

```js
var kit = null, kitCtx = null;
function drumKit() {
  var ctx = App.getAudio();
  if (!kit || kitCtx !== ctx) { kit = DAW.createDrums(ctx); kit.output.connect(ctx.destination); kitCtx = ctx; }
  return kit;
}
function hit(lane, vel) {
  try { drumKit().noteOn(lane, vel, App.getAudio().currentTime); } catch (e) { /* audio unavailable */ }
  flashPad(lane);
  /* LED block unchanged: js/pads.js:110-114 */
}
```

Edits in `js/pads.js`:

| Lines | Edit |
|---|---|
| `1-20` | header comment: no Studio, no Record |
| `25-26` | drop `rec`, `lastStep` |
| `44-68` | drop `drumTracks`, `padTrack`, `ensureTrack`; add `drumKit()` |
| `99-115` | `hit(lane, vel)` as above |
| `117-132` | drop `recordHit`, `bpmNow` |
| `156-196` | `render()` always draws the eight pads; drop the no-track branch, `paintTrackSel`, `paintRecCount` |
| `198-210` | `paintControls()`: drop the rec / play / click lines (`:205-209`) |
| `232-236` | drop the `#pd-play`, `#pd-rec` CSS |
| `250-262` | drop `#pd-play`, `#pd-rec`, `#pd-click`, `#pd-clear`, `#pd-recinfo`, `#pd-track`, `#pd-mk`; keep `#pd-remap`, `#pd-mapreset`, `#pd-maphint` |
| `265-266`, `285` | reword (they point at the Tracks page and the Studio) |
| `289-293`, `302-322`, `350-387` | drop the element refs and listeners for the removed controls |
| `399`, `444`, `471` | call `hit(lane, vel)` without the third argument |
| `436-441` | replace with `if (App.active !== 'pads') return;` |
| `448-456` | drop the `st:step` and `st:state` listeners |
| `464-465` | `onShow` without `ensureTrack()`; `onHide` without `rec = false` |

Nothing else needs Pads to change: `js/piano.js:1767` (`padsOwn`) keeps the piano voice silent on the Pads page, `js/learn-instruments.js:25` and `js/quiz.js:1972` only link to the page, and the tests that open Pads (`tests/lights.test.js:213`, `:340`; `tests/colors.test.js:304`) or use its keybed claim (`tests/midi-ports.test.js:227`) check the claim and the lights, not the drum track (no test references a `pd-` id).

With this, `app.click`, `pads.track`, `st.tracks` and `st.armed` have no reader or writer left in the app.

### 4.3 Alternative, not recommended

Keep Record and Play loop by giving Pads a private one-track step sequencer (about 60 lines copied from `js/daw/engine.js:523-595`) and a new store key such as `pads.steps`. It keeps a feature Phase C replaces, keeps "a sequencer" the roadmap cuts, and still must never touch `st.tracks`.

---

## 5. Edits the removal forces

### 5.1 `js/app.js`

| Lines | Edit |
|---|---|
| `37-45` | comment + `SPACES`: drop `studio` |
| `50`, `79` | drop the `song`, `arrange`, `tracks`, `ideas` labels |
| `55` | `PANEL_ORDER = SPACES.practice.concat(['metronome','lights','settings'])` |
| `58` | comment mentions `st:edit` |
| `69-72` | drop `GROUPS.studio` |
| `84` | `groupOf`: `GROUPS.practice` only |
| `292` | comment ("the studio stack") |
| `688-692` | drop `spaceOf`; `tabStoreKey` becomes the constant `'app.tab'` |
| `745`, `767-768` | drop the cross-workspace hop in `switchTo` |
| `792` | `store.set('app.tab', name)` |
| `914-916` | `toggleSettings`: `'app.tab'` |
| `1105` | `SPACES[spaceOf(p)]` is always truthy; drop that term |
| `1107` | drop the "leave the studio" Back step |
| `1194-1255` | delete `applySpace`, `setSpace`, the wipe |
| `1460-1463`, `1471-1473` | comments |
| `1467-1470` | `anyRunning()` = `metRuns` |
| `1477` | always the metronome glyph |
| `1483-1491` | delete the Studio branch; the click is always `emit('met:toggle', {})` |
| `1495-1497`, `1505` | drop the `st:state`, `st:tr`, `space`, `st:step` listeners |
| `1625-1631` | drop the `#space-btn` click wiring |
| `1641-1650` | drop `startSpace` and the button label; keep `populateNav()` and the start-tab guard at `:1652-1653` |
| `1201`, `1645` | drop `data-space` (no CSS reads it once `js/studio.js:1162` is gone) |
| `1755-1756` | drop `get space` and `setSpace` AFTER fixing `js/quiz.js:2951`, `js/piano.js:1766`, `js/pads.js:441` |
| `219` | icon `idea` loses its only user (`:71`); optional cleanup |

`addPage` (`js/app.js:886-910`) takes a space argument and is the plug-in page surface; it goes with the plug-in API.

Boot detail to respect: `boot()` (`js/app.js:1555-1569`) inits every id in `PANEL_ORDER`; it skips an id with no `#panel-…` element and prints "Module failed to load" for a panel with no module. So the `SPACES` entry, the `<section>` and the `<script>` of a removed page must go in the same commit.

### 5.2 `index.html`

| Line | Edit |
|---|---|
| `40` | remove `#space-btn` |
| `54-55` | remove `#cx-rec` and `#cx-rec-msg` |
| `85-89` | remove `#wipe` |
| `108`, `109`, `110`, `116` | remove the `song`, `arrange`, `tracks`, `ideas` panels |
| `145`, `151` | remove the `studio.js`, `arrange.js` script tags |
| `143-144` | keep |

`#cx-rec` is hidden in the practice space only by a rule that `js/studio.js:1162` injects. If `studio.js` is deleted and `index.html:54` stays, an empty button appears in the key dropdown.

### 5.3 `css/style.css`

| Lines | Edit |
|---|---|
| `219-230` | delete `#wipe` |
| `304` | delete `#space-btn` |
| `432-443` | delete `#ctx-btn.rec::after` (the red capture dot on the clef) |
| `465-466` | comment |
| `649` | delete `.chip.ar-mini` |
| `889`, `906`, `973` | take `#sd-toast` out of the selector lists |
| `983`, `988` | delete the two `#space-btn` rules; keep `.tb-tools { gap: 2px; }` at `:982` and the icon-button rule at `:987` |
| `981`, `985` | comments ("logo + workspace + four icons", "six corner controls" becomes five) |
| `997` | comment |
| `1013-1014` | delete the `#space-btn .ic` rule |

All `.st-*`, `.sd-*` and `.ar-*` rules of the Studio pages are injected by `js/studio.js:1161-1198` and `js/arrange.js:573` and disappear with those files. Careful with greps: the Synth tab also uses the `st-` prefix (`js/synthtab.js:124-126`, `:425`, `:534-546`; help tours `js/help.js:98-100`). It defines its own rules and does not rely on anything the Studio injects, but a blanket "delete every `st-`" would break it.

### 5.4 `js/help.js`

| Lines | Edit |
|---|---|
| `80-84`, `85-90`, `91-96`, `131-135` | delete the `song`, `arrange`, `tracks`, `ideas` tours |
| `21` | "…and the Studio all follow it" |
| `27` | "…and the Studio's note editor use the same colors" |
| `59` | "Every run is captured as a take in your Studio Ideas" |
| `61` | "or pull in any Studio track … MIDI, Studio and generated scores" |
| `126-130` | Pads tour: `:127` "your drum track's kit"; `:128` is the `#pd-rec` step — delete it |
| `143` | "studio capture options … and plugins" |
| `251-252` | welcome: "two workspaces … The Studio button in the top corner", "and the Studio follows" |

A tour step whose selector is missing does not crash (`js/help.js:177-193` just hides the ring), so leftovers show wrong text rather than break.

### 5.5 `js/settings.js`

| Lines | Edit |
|---|---|
| `75` | "…the Jam band, the Studio" |
| `76-79` | delete the `#set-click` row ("Metronome click during Studio playback") |
| `112-134` | delete the whole Studio card (`#set-retro`, `#set-voice`); `:123` carries the 4/4 note about Jam — move that sentence if it should stay |
| `139` | "…jam songs, studio tracks" |
| `279-284` | delete the click wiring |
| `286-318` | delete the retro and playback-voice wiring (`sd.retroSecs`, `sd.playVoice`, `sd:prefs`) |
| `1007-1010` | delete the `#set-click` refresh in `onShow` |

The Plugins card (`:235-243`, `:680-723`) belongs to the plug-in API removal. The Backup export / import (`:962-995`) copies every `guitarlab.*` key and so keeps carrying `st.tracks` and `ideas.list`; see section 6.

### 5.6 Other files the removal forces

| File | Lines | Edit |
|---|---|---|
| `js/piano.js` | `1764-1766`, `1769` | drop `studioArmed` |
| `js/piano.js` | `268-270`, `287`, `1340`, `1755`, `1910` | comments and one tooltip that say "Studio" |
| `js/quiz.js` | `2951` | drop the `App.space === 'practice' &&` condition |
| `js/woodshed.js` | `709`, `713-728` | delete `captureRun()` and its call |
| `js/woodshed.js` | `1169` | "…and lands as a take in your Studio Ideas" |
| `js/woodshed.js` | `1180`, `1427-1432` | delete the "+ From Studio track" button and handler |
| `js/woodshed.js` | `18-19`, `28-29`, `697` | comments |
| `js/woodshed.js` | `393-397`, `1609` | KEEP `importTrack`: `tests/remote-shed.test.js:60` uses it as a generic "notes → score" helper |
| `js/jam.js` | `346-347` | comment only; the kit id `studio` (`:351`, store `jam2.kit`) is a kit name, not the Studio space — leave it |
| `js/midihub.js` | `29-30` | comment ("the Studio capture dot records them") |
| `sw.js` | `41`, `42` | remove from ASSETS; bump `CACHE` (`:4`) |
| `PLUGINS.md` | `26`, `30` | goes with the plug-in API |
| `CLAUDE.md`, `docs/*` | | the layout table, WORKSPACES, context-bar and transport sections |

Build tooling needs no edit: `tools/artifact_build.py:55` walks the folders and `android/build.sh:33` copies `js/` whole.

### 5.7 Tests that must change

| Test | Lines | Why |
|---|---|---|
| `tests/sound-lock.test.js` | `64-74`, `83`, `85-101`, `104-108`, `150-159` | sampler and `engine.render` / `renderSong` checks; the synth, `guardPitched`, drum and Jam checks stay |
| `tests/nav.test.js` | `155-172` | the "studio space" block (`#space-btn`, `App.setSpace`, `#wipe`) |
| `tests/lights.test.js` | `120-140` | switches to `tracks` and `ideas`, sets `st.armed`, reads `#sd-toast` |
| `tests/colors.test.js` | `213-239` | the Studio piano-roll colors (`st:edit`, `.st-note`) |
| `tests/context-global.test.js` | `8`, `61-62`, `89-91` | the studio page list and "Studio shares Practice key…" |
| `tests/smoke.test.js` | `22-24` | visits `arrange`, `tracks`, `song`, `ideas` and reads `App.space` |

---

## 6. Stored state that points at removed things

| Key | After the cut | Boot / import rule |
|---|---|---|
| `app.space` | no reader, no writer | ignore; it was already ignored at launch (`js/app.js:1643`) |
| `app.tabStudio` | no reader | ignore |
| `app.tab` | only ever holds a practice page id (`js/app.js:792` writes per space) | already safe: an unknown id falls back to the first practice page (`js/app.js:1652-1653`). This guard also covers the practice pages other parts of Phase A remove |
| `app.gtab.gstudio`, `app.gtab.gsketch` | no reader (`js/app.js:716-717` only reads groups that exist) | ignore |
| `st.tracks`, `st.bars`, `st.armed`, `st.zoomX`, `st.snap`, `st.follow`, `st.loop` | no reader once `js/piano.js:1766` and `js/pads.js` are edited | never write, never delete during the beta |
| `ideas.list` | no reader; `js/woodshed.js:727` would keep appending up to 100 runs of up to 800 notes each (megabytes of quota) to a list nobody can open | remove the write in Phase A |
| `song.name`, `sd.retroSecs`, `sd.playVoice` | no reader | ignore |
| `app.click`, `pads.track` | no reader with play-only Pads | ignore |
| `pn.voice`, `pn.synthPreset` | may hold a preset id a plugin registered (for example `bell` from `plugins/sample-lofi.js:50`) | already safe: `js/piano.js:283-284` returns no synth and the sampled piano plays; `js/piano.js:303` resets the picker to `piano` |
| `jam2.kit = 'studio'` | a Jam kit id | keep |
| IndexedDB `guitarlab-daw` | no reader | leave it alone in Phase A |

Rules for boot:
1. No migration code is needed for the Studio keys. Stale values cannot change behaviour once the three readers named above are edited.
2. While the beta and the live app share an origin, the beta must not delete or rewrite `guitarlab.st.*`, `guitarlab.ideas.list`, `guitarlab.song.name`, `guitarlab.sd.*` or the IndexedDB database: the live app (1.4.1 today, 2.0.0 if PR #98 merges) still has a Studio that reads them.
3. The one-time `guitarlab.*` → `soundlab2.*` import should skip these keys so the 2.0 store starts without dead weight. Pattern: `^(st\.|sd\.|ideas\.list$|song\.name$|app\.space$|app\.tabStudio$|app\.gtab\.(gstudio|gsketch)$|app\.click$|pads\.track$)`. The Backup import (`js/settings.js:985-987`) should apply the same skip list.
4. Sampler audio lives only in IndexedDB and is not part of the Backup export (`js/settings.js:962-967` copies `localStorage` only). After the cut there is no screen that reaches it.

---

## 7. PR #98 (`origin/claude/project-thread-rhqjuv`, one commit `c875605` on top of `5be2eab`)

It changes four files: `CLAUDE.md`, `js/app.js` (`APP_VERSION` only), `sw.js` (cache naming by scope, `sl2-live-*` / `sl2-next-*`, and the `activate` filter), `version.json`. Nothing in it touches the Studio.

What it means for this area:
- If it merges, the live app is 2.0.0 WITH the Studio, and the beta after Phase A is without it, on one origin with shared `guitarlab.*` keys and one shared IndexedDB. Rules 2 and 3 of section 6 then matter for real user data, not only for testers.
- `sw.js`: Phase A removes ASSETS lines `41-42`; PR #98 rewrites lines `1-4` and `113`. Different hunks, so the merge is clean, but both bump the cache: `soundlab2-v3` → v4 on v2, `PREFIX + 'v4'` in PR #98. Whichever lands second bumps again.
- `CLAUDE.md`: both rewrite the "soundLAB 2.0" paragraph; expect a text conflict there.
- PR #98's notes say "Everything you used in 1.4 is still in place". A later v2 → main release that carries Phase A removes the Studio from a released 2.0; the release notes of that release have to say so.

---

## 8. Suggested order inside the Phase A pull request

Each step leaves the app bootable.

1. Consumers first, Studio still present: Pads play-only (section 4.2), `js/woodshed.js` (`captureRun`, the Studio-track button), `js/piano.js:1764-1769`, `js/quiz.js:2951`.
2. Delete `js/studio.js` and `js/arrange.js` together with `js/app.js` (5.1), `index.html` (5.2), `css/style.css` (5.3), `js/help.js` (5.4), `js/settings.js` (5.5) and `sw.js`.
3. Slim `js/daw/engine.js` (3.3) in the same commit as the plug-in API removal (3.5).
4. Tests (5.7) and docs.
