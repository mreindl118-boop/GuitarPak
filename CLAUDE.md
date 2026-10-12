# soundLAB — agent guide

Guitar + keys practice PWA (vanilla HTML/CSS/JS, no build step) + Android
WebView wrapper. GitHub: https://github.com/mreindl118-boop/GuitarPak
Branded **soundLAB** (formerly GuitarLab) since v0.43.0 — the rename is
user-facing ONLY: storage keys stay 'guitarlab.*', the APK ships as
soundLAB-alpha.apk (a GuitarLab-alpha.apk copy keeps old links alive), and
internal ids/comments are untouched. ANDROID (v0.70.2): the app is now
com.mreindl.soundlab signed with soundlab.keystore (new key) — the old
com.mreindl.guitarlab (old key) is retired; users installed the new app and
deleted the old one. The wordmark is a
custom SVG letterform set (stems = piano black keys: flat top, rounded
bottom): inline in index.html's header (theme-aware via currentColor +
--accent), standalone in icons/logo.svg, app icon icons/icon.svg (three
black keys on amber) rendered to icons/icon-192/512.png.

## Layout

```
index.html        tab shell; loads theory → app → modules → App.boot()
css/style.css     design system ("stage gear": #131114 ground, #ffab47 amber,
                  Bebas Neue display + Barlow body from fonts/; chord names
                  use --font-condensed — Bebas is caps-only)
js/theory.js      pure music-theory engine (scales, tunings, chords, diatonic
                  harmony, progressions) — no DOM
js/app.js         shell: module registry, tab switching, shared AudioContext +
                  App.pluck, App.store (localStorage 'guitarlab.*'), App.on/emit
                  event bus, APP_VERSION + auto-update checker
js/midi.js        MIDI service (App.midi: in/out ports, note/bend/pressure
                  events on the bus). Backends: Web MIDI, or the NATIVE
                  bridge protocol (window.__glMIDI.onports/onmidi/onstatus +
                  post({cmd: init|send|setOutput|bluetooth})) spoken by the
                  iOS CoreMIDI bridge AND (v0.75.0) the Android APK's
                  MidiBridge (window.SoundLabMidi.post(JSON)); App.midi.
                  platform 'web'|'ios'|'android'. + THE KEYBED (v0.74.0):
                  ONE lighting engine for every page. Layout by App.help
                  level: >=3 scale, 1-2 tonic keys, 0 dark. A LUMI is PAINTED
                  PER KEY (v0.75.0): its default LittleFoot program lights an
                  incoming note in colourLookup[velocity] (0 off, 1-126 hue
                  sweep, 127 white; table copied as LUMI_TABLE, lumiVel(hex)
                  = nearest), only inside its 24-key octave window — so each
                  scale key gets its fb.colors degree color, the note to play
                  white (127), answers green (60), over a night-mode (SysEx)
                  background + lights.bright. Lights off = lumiNative() (its
                  own scale mode, midi.lumiRoot/Scale). Other LED keyboards:
                  note-on brightness by degree.
                  Layers: guide(now, next) (Keys runner/Guide/lessons, chord
                  player; now at help>=2, next blinks at >=3), reveal(pcs, ms)
                  (Exercises answers, help>=2), hideLayout(owner, on) (quiz
                  run), claim/release(owner) (Pads owns the keys). paint()
                  composes + diffs note-ons. RANGE: learned from played notes
                  (a LUMI's octave buttons), midi.rangeLo, 'midi:range'; all
                  lights fold() into it. LUMI auto-detected by port name
                  (midi.lumi null|true|false); lights.on default on for a
                  LUMI, off for other outputs (a synth would play note-ons).
                  LUMI SysEx per benob/LUMI-lights (dev-id 0x37 + 0x00, values
                  <5-bit type><value>). Loaded right after app.js
js/tonein.js      1/4"/audio-in TONE-IN: pitch-detects the selected audio
                  input (audio.inId; toggle audio.tonein in Settings) and
                  emits midi:note {silent:true} — instrument pages show the
                  visuals (rings/presses/guide) but never re-sound; pauses on
                  'shed' (its own mic) — loaded right after midi.js
js/metronome.js   ┐ feature modules; each registers (metronome = the corner
                  │  sheet, not a page — see OVERLAY SHEETS)
js/fretboard.js   │ App.register(name, {init, onShow, onHide, onKey})
js/chords.js      │ DOM ids/CSS prefixed met-/fb-/ch-/jam-/tun-/tr-
                  │ (chords: chord-explorer neck + theory panel + progression
                  │  player; the neck follows the sounding chord live)
                  │ (fretboard.js also registers the 'tab' and 'notation'
                  │  PAGES — thin panels over the same state + runner; the
                  │  runner keeps playing across the fb/tab/notation trio,
                  │  pauses on leaving it)
js/piano.js       │ (piano: keyboard twin of the fretboard — degree-colored
                  │  keys, shared fb.colors palette, sampled piano voice,
                  │  follows fb:set/fb:scale + jam:chord; HELP LEVEL
                  │  pn.assist 4 Full/3 Colors/2 Target/1 Tonic/0 None gates
                  │  colors, labels, fingers, now/next rings + LEDs; pressed
                  │  keys flash data-dc (their degree color) at every level;
                  │  key-aware fingering cycleFingers/fingering, 1-2 octaves;
                  │  App.keys = the API keylessons.js drives)
js/keylessons.js  │ SCALE LESSONS on the Keys page (mounted into #pn-lessons
                  │  by piano.js init): LESSONS (25, tiers start/build/
                  │  stretch) x STEPS (10 speed levels, quarters@60 ->
                  │  16ths@72). A run: fb:set the lesson key, setHand, one
                  │  bar count-in, exerciseSeq updown x reps + tonic; click
                  │  on a 25ms lookahead timer; judge() matches midi:note /
                  │  note:input by pitch class within accept() of the beat,
                  │  minus outputLatency and ws.cal (Woodshed calibration);
                  │  WIN 35/70/120 ms. Score = acc x (0.6 + 0.4 timing);
                  │  85 levels up, 70 passes; App.xp.finishLevel counts it.
                  │  Focus mode html.kl-running folds the page controls.
                  │  Stores kl.prog/kl.sel/kl.tier/kl.reps; wake tag kl-run
                  │  (ledger area Keys); stops on transport:claim, page
                  │  hide, app hide; summary() feeds Exercises Progress.
js/songs.js       │ (songs: user-imported ASCII tab / MIDI parsed on-device,
                  │  bar-loop player at shared tempo, key detect → fb:set)
js/jam.js         │ (jam: auto-band — genre presets write an intro/A/B/ending
                  │  song of DEGREE tokens that re-harmonize live against the
                  │  context-bar key; section editor, energy/swing, per-
                  │  instrument mixer, palette/MIDI vamp override, Finish →
                  │  ending; store jam2.*, old jam.track migrates once; the
                  │  sample/voice layer is the only carried-over code;
                  │  v0.56.0: drum KITS via DAW.createDrums (Studio/808/909/
                  │  Lo-fi), comp banks incl piano2/epiano/organ, prebuilt
                  │  BANDS chips = kit+bass+comp combos, samples preload on
                  │  page show)
js/tuner.js       │
js/trainer.js     │
js/theorytab.js   │ (theory: circle of fifths + key guide + degree ear quiz)
js/settings.js    ┘ (settings: app-level prefs — theme dark/light/auto; MIDI
                     ports + bend; lighting moved to Lights & help)
js/lights.js      LIGHTS & HELP control center (sheet 'lights', header
                  #lights-btn): Help level + key lights (on/off, LUMI colors,
                  brightness, keyboard type, status/range, test) — the same
                  settings every page reads.
js/studio.js      STUDIO workspace (DAW phase one): registers 'song' (sketch-
                  book home) + 'ideas' (capture inbox) pages and the app-wide
                  capture service behind #cx-rec (header ● on every page).
                  Captures midi:note + note:input into ideas (notes tagged
                  key/bpm/date, store ideas.list, song.name); 30s retro buffer
                  ("keep what I just played"); playback via the studio synth.
js/quiz.js        EXERCISES ('quiz', the practice HOME since v0.69.0): Musicca-
                  style course — COURSE topic > unit > mode (treble/bass/staff,
                  piano, neck, ear, theory) > levels of 10 questions, 8 = pass,
                  9/10 = more stars. Generators (GEN.*) work on SPELLED notes
                  {L, acc, oct} so intervals/chords/scales/key signatures are
                  written correctly (never double accidentals on the staff).
                  Answers: tap, 1-9, or PLAY — midi:note (MIDI or tone-in
                  silent:true) and on-screen keys/neck feed inputNote. Staff
                  engraved with fonts/slmusic.woff2 (SLMusic = a Bravura subset,
                  renamed per its OFL Reserved Font Name; fonts/OFL-Bravura.txt).
                  Views: home / topic (collapsible unit cards, repaintUnit
                  re-renders ONE card) / run (a fixed shell — #qz-runshell —
                  whose question area #qz-q is swapped with a fade; one footer
                  action #qz-act: Show answer -> Next) / done. onShow claims
                  the transport (silences met/jam/loops).
                  Stores qz.prog / qz.items (weak items picked more) /
                  qz.sound / qz.landed (one-time landing) / qz.home (home tab).
                  GAME LAYER (v0.71.0, Duolingo-style): home = stats strip
                  (streak, goal ring, level, Continue) + tabs Path / Topics /
                  Progress. PATH = NODES (one per unit x mode, course order);
                  a node opens when the previous one has a passed level, or
                  by a JUMP TEST (its level 1, 9/10 -> xp.jump; a failed jump
                  saves nothing); currentNode skips jumped-over nodes. Node
                  card = levels + 60-SECOND SPRINT (highest passed level,
                  auto-advance, never writes qz.prog; record per node).
                  Progress = tiles, week strip, goal picker, SVG charts built
                  at container width (XP/day + goal line, minutes/day, weekly
                  answer speed; hover tips + table views) and topic speed
                  table. Results show XP/time/per-answer + streak/goal/speed
                  notes (speed note ignores sub-300ms test taps). v0.72.0:
                  node cards open with the unit's LEARN lesson; wrong picks
                  say "You chose X"; DRILL THESE re-asks only the missed
                  q.item keys (cur.drill, 5-10 questions, never writes
                  qz.prog); applyFor(unit) links lessons to the Fretboard
                  (fb:practice with the scale), Chords or the Circle.
                  window.SLQuiz = test hook (levels, gen, start, pick, q,
                  view, cur, nodes, node(i), current, sprint, finishSprint,
                  tab, theory).
js/xp.js          XP / streak service under the course (App.xp = window.SLXP,
                  no DOM except html.goal-due = the Learn-tab dot): 2 XP per
                  right answer, +1 under PAR ms, +1 at a run of 5; level
                  +5 pass, +5 perfect, +5 sprint record. Player level: 40 XP
                  to Lv 2, +20 per level. Streak day = a level finished that
                  day; a freeze is earned per 7-day multiple (max 2) and is
                  spent only when the banked freezes cover the whole gap.
                  Stores xp.total (seeded once from qz.prog), xp.days {day:
                  {x, s, q, k, l, u:{unit:[ok, ms, asked]}}} kept 180 days,
                  xp.goal, xp.freeze/frozen/fzAt/best, xp.sprint, xp.jump.
                  PRACTICE LEDGER (v0.72.0): playing anywhere counts — a 5 s
                  tick logs time while a practice App.wake tag is held
                  (PLAY_TAGS: fb-run, pn-run, ch-play, sg-run, jam-run,
                  ws-run, tr-*, met) or notes came in (midi:note /
                  note:input, 20 s), gated by a touch or note in the last
                  10 min; never on quiz/settings (answers log their own
                  time). day.p/a/pm: 2 XP per minute, a day with >= 300 s
                  playing counts for the streak; emits 'xp:practice' (quiz.js
                  shows the #xp-toast). Woodshed still keeps its own ws.xp.
                  Tests pin the clock with SLXP._now(fn) + SLXP._reload();
                  SLXP._tick() runs one ledger tick. Loaded right before
                  quiz.js.
js/help.js        (?) button + guided page tours (TOURS per page id, spotlight
                  ring + card overlay, first-run welcome; help.seen/help.done)
js/plugins.js     window.SoundLab plugin API v1: registerPage (App.addPage),
                  registerFx (DAW.fxPlugins, checked first by buildFx — must
                  work on OfflineAudioContext too), registerSynthPreset, bus +
                  app/daw/theory access. Stored plugins (plugins.list, 100KB
                  cap, per-plugin enable/error) run right after boot; loaded
                  from Settings > Plugins. Docs PLUGINS.md; sample plugin
                  plugins/sample-lofi.js (Lo-fi fx + Glass bell voice).
js/pads.js        drum-pad controller page ('pads', PRACTICE Instrument group
                  since v0.64.0; still records to st.tracks + studio-armed
                  MIDI works): 8 velocity pads on the pad drum track's live
                  channel; touch + ZXCV/ASDF + MIDI (pads.mode 'roli' =
                  WHITE-KEY layout C..B->7 lanes + black=crash, any octave |
                  'gm' drum map); auto-creates its drum track on open;
                  Record quantizes hits to nearest 1/16 vs st:step heartbeat;
                  LUMI lights the 8 mapped keys, flashes on every hit incl.
                  loop playback. Drums-armed MIDI is handled HERE, not by
                  studio.js liveRoute (which skips kind==='drums').
js/arrange.js     Arrange page ('arrange', studio) — the STUDIO HOME (v0.61.0):
                  lane timeline over song mode with per-lane ARM chips +
                  RECORD-TO-CLIP (rec captures midi:note/note:input at
                  DAW.engine.position(), commits a pattern clip; busy armed
                  tracks spawn 'Take n' lanes; engine.freeRun keeps the
                  transport rolling past songEnd while recording) — DOM clip divs, CSS-gradient grid, rAF-transform
                  playhead + follow, per-channel analyser meters (only while
                  playing), waveform peaks cached per buffer, ruler tap=seek /
                  drag=loop region, snap/zoom stores st.zoomX/st.snap/st.loop/
                  st.follow, Space/Delete via onKey. Perf pattern: never
                  rebuild DOM per frame; drags mutate style only, commit on up.
js/daw/engine.js  studio engine (OpenStudio ports): DrumKit (8-lane 808/909
                  synth kit), Sampler (pitch-shifted one-sample instrument,
                  buffers in DAW.samples — context-independent, raw bytes in
                  IndexedDB 'guitarlab-daw'), FX (reverb/delay/drive wet-dry),
                  WAV encode/download, and the LOOP ENGINE: DAW.engine —
                  groovebox session loop (bars 1/2/4, st.tracks store) —
                  scheduled per-16th in a ~150ms rolling window reading live
                  track data, so edits/preset swaps land mid-cycle (v0.55.0;
                  scheduleLoop whole-loop path kept for the offline render),
                  st:step/st:state bus events, live-play
                  channels (armed track st.armed), OfflineAudioContext render.
                  SONG MODE (OpenStudio transport port): beat-domain origin
                  rebase scheduler, t.clips [{start,len,src}] pattern/audio,
                  loop region, position()/setPosition, songPlay/songStop
                  ('st:tr' event), renderSong; stats.stalls counts scheduler
                  catch-ups; per-channel analyser for meters. ONE engine —
                  session loop + song share channels/mixer/FX.
                  The 'tracks' page in studio.js is its UI (step grid, piano
                  roll degree-colored via fb.colors, mixer rows, FX slot,
                  idea→track, Export WAV).
js/daw/synth.js   MPE poly synth ported from the OpenStudio DAW repo
                  (Sampler-DAW src/audio/synth.ts): 2 osc + noise + filter/amp
                  envelopes, unison, glide, LFO, per-channel bend/pressure/
                  timbre. window.DAW.createSynth/defaultSynth/SYNTH_PRESETS.
                  More of that engine lands here as the studio grows.
samples/          MIT FluidR3 instrument MP3s (see samples/CREDITS.md)
android/          APK project — build.ps1 (no Gradle: javac→d8→aapt→zipalign→
                  apksigner); keystore is gitignored, do NOT commit it.
                  MainActivity (src/com/mreindl/soundlab/) loads the LIVE
                  site (LIVE_URL) and falls back to the bundled assets offline;
                  the JS bridge GuitarLabHost = setKeepScreenOn + shellVersion;
                  MidiBridge.java (v0.75.0) = window.SoundLabMidi: Android
                  MidiManager (USB + any system MIDI device) + Bluetooth LE
                  MIDI scan/connect (BLUETOOTH_SCAN/CONNECT; location <= 11),
                  last BLE device reconnects at launch. Same protocol as iOS.
                  build.ps1 (PC) and build.sh (Linux/cloud: ANDROID_JAR,
                  BUILD_TOOLS, KEYSTORE, D8_JAR — build-tools-34 d8 crashes on
                  JDK 21, use r8 8.7.x from Google Maven) both write
                  releases/soundLAB-alpha.apk (+ GuitarLab copy) and set
                  version.json "version". The signing key soundlab.keystore
                  (passwordless PKCS12, SHA-256 5A:10:EC:B5:...:17:1A) is
                  NEVER in this repo; see APK NOTE below for where it lives.
ios/              WKWebView wrapper (XcodeGen project.yml + Swift; needs a Mac
                  to build — the PWA is the primary iPad install)
releases/         built signed APK (committed; raw URL = download link)
tools/artifact_build.py  stages the multi-file claude.ai artifact (see below)
version.json      auto-update feed (source of truth for latest version)
```

## Cross-module conventions

- BACK TO BASICS (v0.68.0): the app ALWAYS boots into the practice space
  (stored app.space is ignored at launch); the capture dot #cx-rec is CSS-
  hidden outside the studio. 'synth' is a page registered by piano.js: it
  BORROWS the Keys page's DOM (children reparented on show/hide) with the
  voice forced to a synth preset (pn.synthPreset) — one keyboard, two pills.
- WORKSPACES (app.js): two page sets over one app — SPACES.practice (the 12
  original tabs) and SPACES.studio ('song', 'ideas' — the DAW side). #space-btn
  in the header switches via a screen-wipe (#wipe overlay); App.setSpace/
  App.switchTo cross spaces automatically; per-space last tab in app.tab /
  app.tabStudio, current space in app.space, <html data-space>. The context
  bar, clock, key and MIDI service are shared across both — that's the point.
- SECTION TAB BAR (v0.70.0; app.js GROUPS + populateNav): the main nav is a
  tab bar of GROUPS (icon + label), not a drop-down — practice: Learn
  (quiz=Exercises HOME/chords/theory), Guitar (fretboard/tab/notation), Keys
  (piano/synth/pads), Play (songs/jam), Practice (shed/trainer/tuner);
  studio: Studio (arrange=Timeline HOME / tracks=Editor), Sketch (song/ideas).
  Rendered twice: #tabbar inside the top bar (> 900px) and #tabbar-m fixed
  along the bottom (<= 900px) — #tabbar-m sits OUTSIDE <header> because the
  header's backdrop-filter / auto-hide transform would trap a fixed child.
  Tapping the open tab scrolls to top. Members show as the pill strip
  (#subnav, .subtab); single-page groups hide it; each group remembers its
  last member (app.gtab.<gid>). NAVIGATION ONLY — page ids unchanged, so
  App.switchTo(pageId) and every bus cross-link still work, and
  App.addPage wraps plugin pages in their own gpl-<id> group (icon 'plus').
- HELP LEVEL (v0.74.0; app.js App.help {NAMES, level, set}, store
  help.level, falls back to v0.73 pn.assist; 'help:level' event): the one
  practice difficulty — Keys page colors/labels/rings, scale lessons,
  Exercises answer lights, the keybed. Set on the Keys page or in Lights &
  help; never add a per-page copy.
- OVERLAY SHEETS (v0.70.0; app.js SHEETS/openSheet/closeSheet; v0.74.0 adds
  'lights' = Lights & help): the METRONOME
  is not a page — #met-btn (top-right corner) opens #sheet-metronome OVER the
  current page (App.active unchanged, so runners keep going); X, backdrop,
  Esc or the icon close it; Tab is trapped inside; the click keeps running
  after closing and #met-btn shows .on / pulses .tick. App.switchTo
  ('metronome') opens the sheet; switching to any page closes it; keys go to
  the sheet's module while open (App.sheet). PANEL_ORDER appends
  ['metronome', 'settings'] so both still init. Bottom sheet on phones.
- QUIET CHROME (v0.69.1): the whole .topbar (nav + context bar + pill strip)
  auto-hides while the window scrolls DOWN and returns on any scroll up / at
  the top (app.js wireAutoHideBar; .bar-hidden; App.showBar() forces it back
  — help tours call it). Pages in app.js NO_CTX (quiz, settings) hide the
  context bar via html.noctx. Show a control only when it does something
  (e.g. Keys: +Bass/Strum only with Triads/7ths, arp rate/dir/oct/Hold only
  with Arp on — paintPerf toggles `hidden`, scoped `#pn-perf [hidden]`).
- BACK (v0.72.0; app.js wireBack/backStep): Android Back (MainActivity
  goBack) and browser Back walk back through the app: help tour, sheet,
  settings, module.onBack() (return true when handled — quiz: run -> path,
  node card, tab), the page stack (cleared on reaching the space's home),
  the practice home. One {sl:'top'} history guard is re-pushed after each
  handled Back; at the very start it stays down, #back-hint says the next
  Back leaves, and any pointerdown re-arms it. Pages with sub-views should
  implement onBack.
- Context bar (index.html #ctxbar, wired in app.js): the single home for key/
  scale/mode/BPM/time signature, visible under the tabs (except NO_CTX pages). It reads the
  shared stores (fb.root/fb.scale/fb.mode, met.bpm, met.sig) and pushes changes
  over the bus; pages must NOT grow their own duplicate selects for these.
  Also hosts #cx-met (transport) and #cx-rec (studio capture ●).
- Settings is a SPACELESS overlay page: opened by #settings-btn (gear, header,
  ever-present in both spaces), toggles back to the previous tab, never in the
  nav select. App-level prefs live there: theme, accent (App.setAccent —
  inline --accent vars, amber default), master volume (App.setVolume — a
  master GainNode shadows ctx.destination so every module obeys), keep-awake
  (app.keepAwake gates App.wake), studio prefs (sd.retroSecs, sd.playVoice —
  'sd:prefs' bus event).
- LATENCY RULES (v0.69.0): the master chain is masterGain -> 0.5 pre-gain ->
  WaveShaper soft clipper (oversample 'none' = zero delay) -> speakers; do NOT
  put a DynamicsCompressor on the master path (fixed ~6ms lookahead). Sample
  lead-in/peak analysis (App.sampleLead/sampleNorm) runs at DECODE time, never
  on the first hit. wireAudioWarmup starts the device on the first pointer/key
  gesture and shows #snd-hint if MIDI plays into a locked context. Bus
  listeners that make SOUND register with App.on(evt, fn, true) — the third
  arg puts them first, ahead of visual listeners. App.keys.play(midi, when,
  dur, gain) = the Keys page's sampled piano for other modules (quiz).
- New bus events: `note:input` {on, midi, vel, src, dur?} — user played a note
  on an on-screen instrument (piano QWERTY/touch emit it; capture listens
  alongside midi:note), `space` {space} after a workspace switch.
- TRANSPORT EXCLUSIVITY (v0.65.0): `transport:claim` {owner: 'met'|'jam'|
  'loop'|'song'} — every transport emits it before starting and stops itself
  on any foreign claim; #cx-met drives the space's transport (met in
  practice; loop, or the song on arrange, in studio) and pulses on met:beat
  + st:step. Studio/jam are 4/4-hardcoded (noted in Settings).
- Event bus: `App.on/emit`. New: `sig` {sig, source} (time signature changed —
  metronome and the bar mirror each other), `met:toggle` (request start/stop
  from anywhere), `met:state` {running}, `met:beat` {beat} (context-bar
  transport button + pulse). Events: `tempo` {bpm, source} (met.bpm is the ONE
  shared tempo — always guard against echo via `source`), `jam:chord`,
  `jam:stopped`, `fb:practice` {root?, scale?, bpm?} (Trainer prompt "Go" —
  fretboard applies it, switches tabs, starts the runner), `fb:scale`
  {root, scale} (fretboard scale changed — chords page follows 7-note scales),
  `fb:set` {source, root?, scale?, mode?, pattern?, dir?} (Tab page pushes
  linked practice state; fretboard applies without switching tabs). The
  exercise engine (path/sequence math) lives in theory.js as
  Theory.exercisePath / Theory.exerciseSeq / Theory.pickDirs (pick strokes:
  alt | eco | down | up), shared by fretboard and tab.
- Drag interactions are POINTER-EVENT based (no HTML5 dnd except the file
  drop): piano roll draw/move/resize/right-erase, step-grid painting, track
  row reorder (.st-drag handle), jam palette->section + chord reorder (ghost
  chip, click suppressed after a real drag). Synthetic-event friendly: every
  setPointerCapture is try/caught; hit-testing via elementFromPoint. Audio
  file drop on #panel-tracks -> sampler (loadSampleFile shared with the
  file input).
- Audio schedulers (metronome/practice/jam): 25 ms setInterval + lookahead on
  the AudioContext clock, with a catch-up guard (`if nextT < currentTime →
  jump forward`) so stalls never schedule past-dated (silent) notes. Keep this
  pattern for any new scheduled audio.
- Metronome and Jam keep playing across in-app tab switches; `visibilitychange`
  (app hidden) stops them. Practice runner pauses on tab leave.
- Fretboard is drawn in horizontal-neck coordinates and rotated 90° cw as one
  SVG group (nut at top, low E left). Practice-runner paths dedupe identical
  pitches at string crossings.
- Note colors: one bright color per scale degree (DEG_COLORS in fretboard.js);
  user-customizable in the fretboard settings (stored as fb.colors, DEG_DEFAULTS
  restores). Light/dark theme: data-theme attr on <html>, app.theme in storage.

## Dev loop

- Serve: launch config "guitarlab" (`python -m http.server 4573`). No Node on
  this machine; Python 3.12 is on PATH.
- TESTS (tests/, v0.72.0): headless Playwright suites — `tests/run.sh`
  (all) or `tests/run.sh game quiz` — serves the repo on 4573 itself
  (tests/serve.py). Needs Node + playwright + Chromium (cloud: NODE_PATH=
  /opt/node22/lib/node_modules, Chromium at /opt/pw-browsers; env.js reads
  SL_URL / CHROMIUM / AAPT). Suites: fingering (pure Node), lights (a fake
  LUMI via a stubbed requestMIDIAccess), keys, practice,
  game, quiz, nav, smoke, taps, update. Run them before every release and add a
  suite or checks for new features.
- The service worker is cache-first: after editing, bump `CACHE` in sw.js and,
  in the preview, unregister SW + clear caches + reload twice — otherwise you
  WILL verify stale files (this has bitten repeatedly).
- Headless preview quirks: page reports hidden → rAF never fires (shim with
  setTimeout when testing animations) and `preview_click` may not deliver
  events — drive the DOM with `preview_eval` + `.click()`.

## Release checklist (all five, every release)

1. `APP_VERSION` in js/app.js
2. `version.json`: bump `web` + `notes` (drives the web / PWA / Android-app
   update banner). NEVER bump `version` by hand: it is the APK channel = the
   versionName of releases/soundLAB-alpha.apk, and android\build.ps1 sets it
   after a successful build. Running it ahead of the real APK made Android
   users download the same old APK in a loop (fixed v0.70.1; app.js
   checkForUpdate reads `web` for web builds, `version` vs
   GuitarLabHost.shellVersion() inside the Android app).
3. `android/AndroidManifest.xml` versionCode (+1) and versionName
4. `sw.js` CACHE bump (guitarlab-vN+1); add any new files to ASSETS
5. Build APK: `android\build.ps1` (outputs to releases/; sets JAVA_HOME itself;
   toolchain lives in C:\Users\mrein\AndroidBuildTools)

Then: verify in preview, commit + push (credential is stored), and republish
the artifact (below).

## claude.ai Artifact (the app, hosted in claude.ai)

URL: https://claude.ai/artifact/R2c52cb7YA8xur86NNqpHs (owner's account; private
until shared from its Share menu). Multi-file: the page plus every js/css/
font/icon/sample file at its real path. Build + publish from any session:

1. `python3 tools/artifact_build.py <scratchpad>/artifact` — stages the page
   (viewer-adapted: no doctype/head/body tags, title "soundLAB", no service
   worker or manifest, `window.SL_ARTIFACT=true` turns off the GitHub update
   checker) and prints the asset list.
2. Artifact tool publish with `url` = the URL above, `file_path` =
   `<staged>/index.html`, `root` = `<staged>`, `files` = ONLY the assets that
   changed (the artifact keeps the rest; samples never need resending).
   A session that didn't create it must `action: "read"` the URL first.

Inside the viewer: mic (tuner, tone-in, Woodshed audio), Web MIDI, file
downloads (backup export, WAV export), offline/service worker and confirm()
dialogs are refused by the frame — everything else runs. `tools/bundle.py`
(old single-file build) is superseded.

## Cloud / mobile sessions (claude.ai/code, PC off)

APK NOTE (2026-10-12, v0.70.2; v0.75.0 = the MIDI bridge APK, also built
in the cloud the same way): re-keyed at the owner's request. The app is
now com.mreindl.soundlab, signed with a NEW key (soundlab.keystore,
cert SHA-256 5A:10:EC:B5:D5:CE:F1:42:...:D0:FD:17:1A), built in the cloud
with android/build.sh. Because the app loads the live site, web releases
need NO new APK — only changes to MainActivity/manifest do. To build one,
the session needs the KEY: it lives in the owner's PRIVATE claude.ai artifact
https://claude.ai/artifact/VWL2AAhC1JQe6XXBPnNLKr ("soundLAB Signing Key"),
published file soundlab.keystore.b64 (base64 of the passwordless PKCS12) —
fetch it with the Artifact tool (action read, path soundlab.keystore.b64),
base64 -d into the scratchpad, pass it as KEYSTORE to android/build.sh.
Never copy it into this public repo, never share that artifact. Plus the SDK
pieces: dl.google.com platform-34 + build-tools 34, and r8 8.7.x.

All web work is possible (js/css/html, sw.js, version.json, README), and so
is republishing the claude.ai artifact (see that section). NOT possible:
building/signing the APK (the keystore and Android toolchain exist only on
the owner's PC). For a release from the cloud: do checklist steps 1–4 only, note
in the commit that releases/GuitarLab-alpha.apk is stale until the next PC
session runs android\build.ps1, and open a pull request instead of pushing
to main so the owner can review from their phone.

## Gotchas

- PowerShell 5.1: no `&&`; embedded double quotes split native args (use
  single quotes in commit messages).
- APK: mic + update checks need the WebView flags already set in
  MainActivity.java; fetch() fails on file:// — use XHR for local assets.
- Same signature = in-place APK update. Losing soundlab.keystore (the
  current key; guitarlab.keystore signed the retired com.mreindl.guitarlab)
  means users must reinstall — keep it safe, never commit it.
