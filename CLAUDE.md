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
                  platform 'web'|'ios'|'android'. Pitch bend is OFF by
                  default (midi.bendOn; Settings Pitch bend Off/±2/±12/±48):
                  dispatch drops 0xE0 unless on; setBendOn(false) emits
                  midi:bend semis 0 on all 16 channels. + THE KEYBED (v0.74.0):
                  ONE lighting engine for every page. Legacy layout follows
                  App.help (>=3 scale, 1-2 tonic, 0 dark); explicit LUMI Display
                  ON shows the selected scale at every Help level and gives
                  active practice targets priority. OFF releases owned notes
                  and display leases. The archived default LittleFoot program
                  uses colourLookup[velocity] inside its 24-key window
                  (0 off, 1-126 hue sweep, 127 white). js/note-palette.js owns
                  this shared profile: App.colors maps screen and LED pitch
                  identity together, including chromatic natural-anchor blends.
                  Target/correct/wrong states retain pitch hue; labels, icons
                  and outlines communicate feedback. Physical program/RGB
                  behavior remains unverified. Other LED keyboards retain
                  their note-on brightness behavior.
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
                  <5-bit type><value>). Loaded right after app.js.
                  v0.78.0 RAW TAP for the MIDI Hub: 'midi:raw' {bytes} for
                  EVERY incoming message (channel, SysEx, realtime; both
                  backends) before dispatch, 'midi:out' {bytes} after every
                  successful send, App.midi.send(bytes) (any bytes to the
                  output) and App.midi.setInputFilter(fn) — ONE fn(bytes) ->
                  bytes|null run before dispatch (null drops it); the Hub
                  installs its rules there when midihub.rulesIn is on.
                  v0.78.1 APP SOUND: midi:note carries mute:true when
                  midi.appSound is false (Settings > MIDI keyboard switch,
                  App.midi.setAppSound) or any App.midi.mute(owner, on) is
                  held (the Hub holds 'midihub' while open unless midihub.
                  hear) - only piano.js's voice honours it; pads, lessons,
                  quiz, range learning and lights still react (unlike
                  tone-in's silent:true). A synth that sounds itself is
                  never doubled.
                  v0.79.0 lights.display remains the legacy Guide focus style
                  (App.midi.display / setDisplay, 'lights:display'): target-only
                  versus scale-alongside-target, with steady current and
                  blinking next notes. Both retain mapped pitch colors,
                  including out-of-scale chromatic intervals. The sole master
                  is lights.displayEnabled (setDisplayEnabled), in the clef
                  dropdown; its explicit ON prioritizes guides/reveals at any
                  Help level. The old lesson/Lights sheet chips are Guide
                  focus, not another illumination master. See NOTE-PALETTE.md
                  and LUMI-PRACTICE.md under docs/ for protocol/ownership limits.
                  v0.80.0: every practice page lights keys ONLY through
                  App.midi.guide - Songs (plGuide: the sounding step + the
                  next, cleared on pause/hide) and the Woodshed (lightsUpdate
                  calls guide only when its now/next targets change, so the
                  blink keeps time; Wait mode lights the first note at Go).
                  Nothing calls App.midi.light/dark for practice any more.
js/tonein.js      1/4"/audio-in TONE-IN: pitch-detects the selected audio
                  input (audio.inId; toggle audio.tonein in Settings) and
                  emits midi:note {silent:true} — instrument pages show the
                  visuals (rings/presses/guide) but never re-sound; pauses on
                  'shed' (its own mic) — loaded right after midi.js
js/audioin.js     SOUND INPUT (App.audioIn): the ONE shared live-input service.
                  Opens audio.inId RAW (no echo cancel / noise suppression /
                  AGC, channelCount ideal 2, deviceId exact). HEAR INPUT
                  (audio.monitor, default off): source -> ONE GainNode
                  (audio.inGain 0-200 %) -> App.getAudio().destination (master
                  volume + soft clipper apply), never connected when off — how
                  a MODX/MONTAGE on USB audio ("Line (MODX)") plays through.
                  AnalyserNode tap after the gain = level() {peak, rms, clip}.
                  The stream is open only while needed: Hear input, or
                  hold(tag)/release(tag) (the Settings meter); tab switches
                  never close it; app hidden KEEPS Hear input sounding (a mixer
                  passthrough) but releases anything not heard. HOLDS
                  (state.held + why + msg, nothing routed, device released when
                  no meter holds it): 'mic' = a mic-like or loopback label
                  (isMic: MIC_RE incl. Mikrofon/Micrófono/Stereo Mix, minus
                  INSTR_RE interfaces like "Microphone (USB Audio CODEC)") that
                  is not a chosen input the user pressed On for; 'fell' = the
                  chosen input is missing — Hear input WAITS for it, the system
                  default stands in only for a meter or after On is pressed
                  again (ack); 'perm' = launch restore without a granted
                  permission (permissions.query; 'denied' or a declined prompt
                  switches audio.monitor off). A busy device (NotReadable) is an
                  error, never a fallback. devicechange: unplug closes + says
                  so, the chosen id newly listed re-opens, the mic check re-runs
                  (a new OS default). A suspended context = state.paused + the
                  #snd-hint "tap to start". audio.inLabel = the chosen input's
                  name for "is not connected" notes. Bus 'audioin:state',
                  'audioin:device' {id} (tone-in re-opens on it; tone-in opens
                  audio.inId EXACT and retries on devicechange / track end).
                  No getUserMedia or a frame without the microphone permission
                  policy = supported false, a message, never a throw. Settings
                  card "Sound input & output": Input/Output selects once device
                  names are readable (else List devices; the first Hear input
                  On only asks + lists), Hear input seg (aria-pressed, .held),
                  gain, meter (opens the device only while Hear input / tone-in
                  / a picked input is in use, else a Test input button), MODX/
                  MONTAGE hint + auto-pick only while no input was ever chosen
                  (audio.inPicked); a missing chosen input/output is kept, and
                  audio.outId is re-applied (setSinkId) when it is listed again.
                  Suite tests/audioin.test.js (Chromium fake media device).
                  Loaded right after tonein.js.
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
                  │  INFINITE (v0.76.0, kl.reps 0 = the ∞ seg): targets are
                  │  generated on the fly (genTarget, click per beat), the
                  │  pattern loops until End run / 8 s idle; a streak counts
                  │  clean notes ('off'/miss/wrong break it); kl.speedup
                  │  adds +4 bpm per clean loop (max +60); best streak per
                  │  level in kl.prog[id].inf[step] (runs get inf + bpm).
                  │  DOUBLE-TAP CONTROL (v0.79.0, kl.dbltap default on):
                  │  two strikes of the CONTROL KEY (App.midi.range().lo,
                  │  a LUMI's leftmost key) within 350 ms start the lesson
                  │  from list/done, and stop a run unless the 2nd strike
                  │  was a right note (R.wrong / R.lastHit unchanged-or-
                  │  wrong check, so turnarounds never stop); demo runs
                  │  stop on any double-tap; pointerup x2 on empty card
                  │  space does the same. Chips kl-disp / kl-dbltap.
                  │  Suite tests/lumidisplay.test.js.
                  │  Stores kl.prog/kl.sel/kl.tier/kl.reps; wake tag kl-run
                  │  (ledger area Keys); stops on transport:claim, page
                  │  hide, app hide; summary() feeds Exercises Progress.
js/songs.js       │ (songs: user-imported ASCII tab / MIDI parsed on-device,
                  │  bar-loop player at shared tempo, key detect → fb:set)
                  │  1.3 ONE OPEN: the "Open a score" card above Add a song
                  │  takes .mid/.midi/.musicxml/.xml/.mxl/.txt and routes it:
                  │  Play on synth (SLMidiHub.player.loadFile/loadScore + show),
                  │  Practice (window.Woodshed.importMidi + addScore -> shed),
                  │  Open as tab (App.songs.fromMidi/load, text -> the paste
                  │  box). Suite tests/oneopen.test.js.
js/lumi-practice.js LUMI note/triad practice under Keys (selectively recovered
                  from b8ccb55; see docs/LUMI-PRACTICE.md). Session-only
                  simulated answers by default; optional exact LUMI/MODX
                  input and LUMI output through additive Web MIDI subscriptions.
                  App.midi.leaseKeybedOutput pauses the shared LED painter
                  on the same selected output during test/armed guidance;
                  cleanup restores its current layout. Native independent
                  routes unsupported. Tests: lumi-practice, midi-ports.
js/practice-router.js Scale-locked external synth sound for LUMI practice:
                  explicit synth input/sound output, separate display output;
                  reuses App.scaleLock.contains, blocks out-of-scale notes,
                  tracks paired notes/pedal by channel, and uses pinned
                  output ownership. Requires manual Local Control OFF; never
                  changes hardware settings. Test: practice-router.
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
                  auto-advance, never writes qz.prog; record per node) +
                  ENDLESS STREAK (v0.76.0: the sprint path with
                  cur.sprint.endless — no clock, ends on the first miss or
                  End run, record in xp.sprint['end:'+nodeId]).
                  ANSWER CLOCK (v0.77.0, qz.clock 0/8/5/3, default 5):
                  per-question countdown for Endless + drills only (levels,
                  jumps, sprints untimed); clockExtra +3 s ear/play, +5 s
                  set; ear clocks start after playQ; endless takes 0.1 s
                  off per right answer (floor base/2); time out = a miss
                  ('Time’s up'); covered() = app hidden / another page /
                  a sheet / a help tour: nothing starts or ticks, and
                  resumeQ() gives a fresh clock (+ the unplayed ear sound)
                  on return — app.js emits 'sheet' {name, open}, help.js
                  'tour' {open}; timed endless records 'end:'+node+'@'+secs
                  (recKey parses).
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
                  view, cur, nodes, node(i), current, sprint, endless,
                  clock, finishSprint, tab, theory).
js/learn-instruments.js Shared explicit Learn category (piano/synth/guitar/bass/
                  drums/voice/other), instrument-appropriate course modes and
                  actual lesson/practice entry points. Selection is not credit.
                  Historical qz.prog stays Legacy/unassigned; new completion is
                  scoped by instrument. Loaded immediately after app.js.
js/xp.js          Compatible SLXP/App.xp question-stat facade over the ONE
                  canonical App.practiceProgress instrument XP ledger. Explicit
                  beginSession/answer/finish hooks snapshot instrument and ID;
                  bounded observed engagement is recorded once. Knowledge
                  questions never fabricate musical note/timing counters.
                  xp.* history is read-only Legacy/unassigned. No passive wake
                  ledger, per-answer bonus balance, history seeding or new
                  ws.xp balance. Pending failures support retry/export.
                  Consult docs/LEARN-INSTRUMENTS.md and PRACTICE-PROGRESS.md.
js/practiceplan.js PRACTICE PLAN ('practiceplan', Learn group pill "Plan",
                  v0.81.0, prefix pp-; built by null, see docs/PRACTICE-PLAN.md):
                  teacher notes (paste / .txt / .md / Google Docs JSON export;
                  the Doc link is only a bookmark, nothing is fetched) ->
                  RULES table -> timed blocks that launch existing modules
                  (Keys lessons via App.keysLessons.open, Fretboard via
                  fb:practice, Chords/Jam/Woodshed/Exercises/Tuner via
                  switchTo + shared key/tempo). Completion is MEASURED: a new
                  instrument-scoped lesson/course records or explicit canonical
                  practice sessions. Global legacy XP/history cannot complete
                  another instrument's block. Unmatched lines -> pp.gaps
                  (module-gap metric, exportable). Stores pp.students /
                  pp.active / pp.sessions (90 days) / pp.history / pp.running
                  / pp.gaps. App.practicePlan test hook. Suite
                  tests/practiceplan.test.js.
js/help.js        (?) button + guided page tours (TOURS per page id, spotlight
                  ring + card overlay, first-run welcome; help.seen/help.done)
js/plugins.js     window.SoundLab plugin API v1: registerPage (App.addPage),
                  registerFx (DAW.fxPlugins, checked first by buildFx — must
                  work on OfflineAudioContext too), registerSynthPreset, bus +
                  app/daw/theory access. Stored plugins (plugins.list, 100KB
                  cap, per-plugin enable/error) run right after boot; loaded
                  from Settings > Plugins. Docs PLUGINS.md; sample plugin
                  plugins/sample-lofi.js (Lo-fi fx + Glass bell voice).
js/helix.js       HELIX STADIUM page ('helix', Guitar group pill "Helix",
                  0.82.0; prefix hx-, store hx.*; built in from the former
                  plugin, plugins/helix-stadium.js is now a stub and
                  js/plugins.js skips an old stored copy whose code sets
                  window.SLHelix). NOTHING CONNECTS AT BOOT: init builds the
                  DOM only; Web MIDI on show only once midi.wanted is set
                  (the Hub's rule: no permission prompt by itself); the bridge only
                  after Connect bridge was pressed once (hx.bridgeAuto,
                  default off) and retries only while visible. Read / write /
                  control a Line 6 Helix
                  Stadium (XL). MIDI (its own Web MIDI port when the browser
                  lists one, else App.midi.send; the manual's CC map: CC32+PC
                  presets, CC69 snapshots, CC38-45 knobs, CC9 buttons, looper
                  52-62, song 10/46-51/63, Matrix mixer 11-29/+23/+46/+69 on
                  the layer's channel) + BRIDGE = tools/helix-bridge.js (Node,
                  zero deps: the pedal's editor protocol over the LAN, NOT USB
                  — ZMTP 3 / OSC / msgpack on 2002 RPC, 2001 change stream,
                  2003 telemetry — relayed as JSON on ws://127.0.0.1:4575;
                  model/param names from tools/helix-defs.json, MIT from
                  helixgen-core). Views Rig / Blocks (edit buffer: live
                  /ParamValueSet + /BlockEnableSet, echoes from 2001) /
                  Presets (containers -1 -2 -5, /LoadPresetWithCID after a
                  confirm) / Looper & Song / Mixer / Monitor. Verified live on
                  a Stadium XL fw 1.1.0. Built WITH null (Codex): SAFETY =
                  output starts disarmed, Arm = 90 s window renewed per
                  command, page exit / app hide / window blur / port or
                  channel change / bridge drop / failed send disarm (hx.safe
                  false = always armed); PORT ALLOW-LIST (Helix|Stadium, never
                  MODX/MONTAGE/LUMI/ROLI/virtual/loopMIDI/thru; App.midi's
                  shared output only when IT is the Helix); FAVORITES hx.favs
                  (CC32+PC+snapshot, byte preview, ★ fills from the bridge's
                  numbering); OBSERVED panel. Docs
                  docs/HELIX-STADIUM.md, suite tests/helix.test.js (fake MIDI
                  ports + fake bridge, incl. port isolation), hook
                  window.SLHelix.
js/midihub.js     MIDI HUB page ('midihub', Keys group, pill "MIDI", v0.78.0;
                  prefix mh-): read / write / reshape plain MIDI for ANY
                  device on App.midi's ports — device-AGNOSTIC by design,
                  PROFILES (generic default / yamaha MODX-MONTAGE / roland)
                  only add CC names, bank hints, SysEx builders and notes.
                  Views (seg, midihub.view): Play (2-octave keys touch +
                  QWERTY via onKey/keyup, velocity, bend/mod/pressure, bank
                  MSB/LSB + program), Controls (CC slider list midihub.ccs,
                  switch CCs, FA/FB/FC + MIDI clock at met.bpm, 5 ms ticker
                  with stall guard), Rules (midihub.rules: match type/ch/
                  number range -> block / convert / set ch / set number /
                  add / value %; applyRules(bytes) -> [bytes]; always on
                  Thru (midihub.thru: 'midi:raw' -> rules -> App.midi.send,
                  never 0xFE), optionally on what the app hears (rulesIn ->
                  App.midi.setInputFilter) and on the Hub's own controls
                  (rulesApp); Learn = next incoming message fills a match),
                  SysEx (identity request + reply decode, profile builders:
                  Yamaha F0 43 1n 7F 1C mm addr(3) data F7 / 2n bulk,
                  Roland DT1/RQ1 with checksum; raw hex; last received),
                  Monitor ('midi:raw' + 'midi:out' rows, rAF-batched, 800
                  cap, clock/active-sensing filters, export), Learn (cheat
                  sheet + profile notes, export/import/reset). Keys played
                  here emit note:input {src:'midihub'} (capture). Warns when
                  key lights are on for a non-LUMI output (a synth would
                  play the "lights"). Panic = 123/120/64/bend on 16 chans.
                  window.SLMidiHub = test hook (decode, applyRules,
                  PROFILES, parseHex, hex, rules). Suite tests/midihub.test.js.
                  v0.80.0 SYNTH CONTROL: the Hub sends through its OWN output
                  (midihub.outId: a port id | 'shared' = the key-light
                  output | unset = auto: a synth-named port, port 1 first,
                  never LUMI / Microsoft GS Wavetable) via App.midi.sendTo
                  (portId, bytes) - Web MIDI only; native = send(). The
                  header's 'Synth out' select sets it. New first view
                  'control' (default): Part 1-16 buttons (= midihub.ch),
                  big SVG knobs (drag / wheel ONLY when focused - a page scroll
                  over a knob never turns it (v0.81.1) / arrows / dblclick = start
                  value) for BASE_KNOBS + profile.knobs {hero, extra}
                  (Yamaha: Super Knob 95 + Assign 1-8 = CC 17-24), values
                  per Part in midihub.kv; program Prev/Next (bank
                  midihub.msb/lsb), Send all, Reset knobs. TWO-WAY: onRaw
                  moves a knob / the program number when the synth sends
                  that CC / Program Change on the selected Part.
                  v1.3.0 KEY SPLITS + PORT MATCH: a rule can match the source
                  port (m.port substring; Thru carries the port through
                  applyRules); SLMidiHub.split {get,set,enable,text,rules}
                  makes rules tagged split ("notes below C4 on the LUMI ->
                  Part 2", only note on/off, the hold pedal copied to every
                  zone's Part); the Rules view has a Split row; Thru never
                  forwards to a LUMI-named output; views renamed Deck / Keys
                  / CCs (ids unchanged). The MIDI Hub is the 'Hub' pill of
                  the SYNTH group (app.js GROUPS gsynth: deck, liveset,
                  midihub), no longer under Keys.
                  v1.1.0 PLAYER view ('player', after Control): opens .mid/
                  .midi (own reader: tempo map, running status; program/
                  other CC/SysEx dropped + reported), MusicXML (.musicxml/
                  .xml: parts -> channels skipping 10, chords, ties, rests,
                  backup/forward, tempo marks; grace/unpitched/repeats
                  reported) and .mxl (zip, stored or deflate-raw via
                  DecompressionStream). Plays through App.midi.
                  bindMusicalOutput(hubOutId()) - notes + CC64 only - so
                  Pause/Stop/Panic/onHide/pagehide/flushMusicalOutputs
                  release everything; 8 ms ticker. midihub.plTempo (%),
                  plVel (cap), plRoute 'file' | 'part', plLoop, plTrans
                  (-12..12), plShift {on, fr, fs, tr, ts} = KEY SHIFTER by
                  scale degree over ten 7-note Theory scales (shiftMap; the
                  source key is guessed by detectSongKey on load); changing
                  either while playing pauses/resumes so every Note Off
                  matches its Note On. SLMidiHub.player {loadFile(name,
                  ArrayBuffer), loadScore(score = the 1.1 reviewed practice
                  score {bpm, len, notes:[{t, d, m, rest, partId, v}]}),
                  show, play, pause, stop, seek, shiftNote, key, openAsTab,
                  toMidiBytes, state}; SLMidiHub.scoreToMidi(score) = format-1
                  MIDI (tempo track + one track per part). OPEN AS TAB:
                  songToMidi (format 0 at the song's own tempo, notes
                  shifted as set) -> App.songs.fromMidi -> load -> the Songs
                  page (js/songs.js: App.songs {fromMidi, load, toAscii,
                  current} + an Export tab button). Suite
                  tests/midihub-player.test.js; tests/review-to-synth.test.js
                  (on feat/review-to-synth) drives Score review -> all three.
js/synthdeck.js   SYNTH DECK (v1.2.0): the MIDI Hub's Control view as a real
                  control surface for the synth on the cable (built around the
                  owner's MODX8+, device-agnostic by design). Mounted by
                  midihub.js render() into #mh-deck (Now bar + sub-tabs) and
                  #mh-deck2 (panels) with HUB_API (= SLMidiHub.api); App.
                  synthDeck / window.SLSynthDeck; init is idempotent (render()
                  re-runs on Import / Reset Hub). Sub-tabs: Knobs (the Hub card
                  + knob PAGES via api.wireKnobs handlers), Buttons (toggle /
                  momentary / radio / trigger from the MAP; held momentaries
                  drained on blur / hide / Part change / midi:beforeoutput),
                  Sounds (library midihub.decklib cap 200: save/edit/star/
                  search/duplicate/two-step delete/export/import; LOAD =
                  Bank MSB, LSB, PC back to back, settle (deck.settleMs 250),
                  then paced values; recallPlan(id) feeds the byte preview and
                  the tests; bank browser with MSB 63 'Into this Part' /
                  64 'Whole performance' and the MODX factory names from
                  data/modx-performances.json; Read name from synth = Yamaha
                  bulk request 0E 25 00, name block 30 40 00), Scope
                  (js/synthdeck-scope.js, window.SLSynthScope: canvas note
                  roll per channel + CC lanes + clock from incoming F8 / the
                  Hub clock / met.bpm; feed()/frame()/state() test hooks, rAF
                  only while the tab is visible), Map (every control's kind /
                  channel scope / number or SysEx address / on-off / conf
                  badge; MIDI Learn + Learn 2 moves; Reset map). Maps are
                  DATA in js/synthdeck-maps.js (generic / yamaha / roland;
                  conf verified | documented | unverified | learned per entry;
                  num null never sends) from docs/MODX-MIDI-REFERENCE.md.
                  ONE tx funnel: api.send (Rules-on-app-controls, ledger,
                  echo suppression) after refusing a LUMI-named resolved
                  output; nothing sends on load/show/tab/Part/profile/Import/
                  Reset/Learn/save; UI state moves only for bytes actually
                  sent. Stores midihub.deck (settings + per-profile map
                  overrides) / decklib / deckvals / names; Hub Export covers
                  them, Reset Hub keeps decklib + names. hubKnobs(profile)
                  lets the map redefine the Hub card's own knobs (null =
                  built-ins). Docs docs/SYNTH-DECK.md; suites synthdeck +
                  synthdeck-scope.
data/             app data files: modx-performances.json (2,143 MODX factory
                  Performance names by LSB/PC, parsed from a public Cakewalk
                  .ins list; MSB 63 and 64 share the layout). In sw ASSETS,
                  the artifact build and the APK asset copy.
js/synthtab.js    SYNTH TAB (1.3, docs/SYNTH-TAB.md): pages 'deck' (the play face
                  over the Synth Deck: Now bar, STRIPS not knobs with a row
                  picker that mirrors the MODX knob-function button, Assign
                  knobs named from the Performance dump, chips + Scenes,
                  EXPLAIN captions, Perform <-> Edit = the Hub's borrowed
                  Control view, the preset builder sheet = full snapshot
                  {colour, app key/scale, fav strips, split}) - everything
                  through App.synthDeck.perform.* so the deck's funnel holds.
js/synthlive.js   page 'liveset': Live sets in pages of 16 (presets or MODX
                  Live Set slots MSB 62), stepping (Next/Prev, foot switch CC
                  synthtab.fsCC, LUMI octave buttons option), GO LIVE (bars
                  fold away, keep-awake, Lock = press-and-hold, Panic),
                  PROFILES (whole setups: library + sets + settings; export /
                  import JSON). SLSynthLive hook; suite tests/synthtab.test.js.
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
                  Settings › MIDI shows the bridge's midi:status text too
                  (tests/btmidi.test.js fakes the bridge). WINDOWS BLUETOOTH
                  MIDI: Chromium's default Windows MIDI (WinMM) lists no BLE
                  ports; --enable-features=MidiManagerWinrt (chrome://flags
                  use-winrt-midi-api; WebView2 via WEBVIEW2_ADDITIONAL_BROWSER_
                  ARGUMENTS) does. releases/soundLAB-windows.bat shortcuts pass
                  it; Settings › MIDI shows a hint until a Bluetooth port is
                  listed. A BLE keyboard stays connected only while an app
                  holds its port (a LUMI searches again when soundLAB closes).
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
tools/helix-bridge.js  Helix Stadium bridge for the Helix page, js/helix.js (run
                  `node tools/helix-bridge.js [host]`; finds p35x1.local / mDNS)
tools/helix-defs.json  Stadium model + parameter id table the bridge serves
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
  (quiz=Exercises HOME/chords/theory), Guitar (fretboard/tab/notation/helix), Keys
  (piano/synth/pads/lumipractice), SYNTH (1.3: deck/liveset/midihub), Play (songs/jam), Train (shed/trainer/tuner; 1.3: the Practice tab became Train, the space keeps the name);
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
  scale/mode/BPM/time signature. Since v0.78.0 it is a DROPDOWN behind the
  treble-clef header button #ctx-btn (Tabler icon, beside lights + metronome):
  html.ctx-open shows it; a tap outside, the clef again, Esc, Back, a page
  switch or the bar auto-hiding tuck it away (app.js setCtx/closeCtx,
  App.ctx(on)); the button's title/aria-label names the key + BPM; the clef
  is hidden on NO_CTX pages; a red dot on it = Studio capture running. Its
  two toggles (v0.82.0): LED SCALE (#cx-led -> App.midi.setLedMode; midi.js
  ledMode() lights.led 'auto' = lights.on + Help level, 'scale' = the keybed
  always shows the selected scale (Display aid off, guides white on top),
  'off' = dark incl. a LUMI (night mode, no lumiNative); the Lights & help
  sheet's On/Off resets to 'auto') and SCALE LOCK (#cx-lock -> App.scaleLock
  {on, active, set, allows(midi)}, store scale.lock, 'scale:lock' event):
  out-of-scale note-ONs are dropped in midi.js dispatch, the Hub's thru, the
  Keys page touch/QWERTY and fretboard taps (note-offs always pass); the Hub
  checks it AFTER its rules; paused on LOCK_FREE pages (quiz, settings, pads,
  shed, songs: they judge their own material) and while a Studio drum track
  is armed; html.scale-locked dims the
  unplayable on-screen keys. It reads the
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
- App.toast(msg, ms?) (v1.3.1): the ONE app-wide status toast (#app-toast,
  role=status) for a tap that did nothing visible elsewhere — use it instead of
  a toast element inside a page that may be hidden (the Hub's #mh-toast only
  shows on the Hub page; the Synth Deck routes its refusals here off it).
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
- VISUAL SYSTEM (v0.78.0): icons = Lucide (ISC, icons/LUCIDE-LICENSE.txt)
  in app.js ICONS — add new ones from lucide-static, never hand-draw (the
  one exception, the clef, is Tabler: MIT, icons/TABLER-LICENSE.txt).
  Tokens: --accent-soft / --accent-line (tints) and --accent-ink (accent as
  TEXT, deepened in light) — never hardcode rgba(255,171,71,…); --h-ctl =
  the one toolbar control height; --warn; light theme re-inks the status
  colors. Casing: uppercase only for Bebas headings and small field labels
  (label.field, .cx-field, .ctl-label); everything else title/sentence case.
  details.tips = the quiet disclosure for long page hints. SVG text inside a
  rotated group (vertical neck, portrait keyboard) is counter-rotated.
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
  game, quiz, nav, smoke, taps, update, midihub (a fake synth port: raw tap,
  rules on Thru / input filter, profiles + SysEx builders, clock), audioin
  (fake media device), btmidi (a fake Android MidiBridge). Run them
  before every release and add a suite or checks for new features.
  `SL_LOG_DIR` keeps concurrent baseline/feature test logs separate. The
  quiz-correction suite covers fresh corrections after a miss and held-note
  identity across input ports and layered channels.
  PC (2026-10-19): Node 24 IS on this machine now; install playwright into a
  scratch folder (`npm i playwright@1.49.1 && npx playwright install chromium`)
  and run suites with NODE_PATH=<that>/node_modules SL_URL=http://127.0.0.1:4573/index.html
  against the preview server (tests/run.sh expects python3 + a free 4573).
- The service worker is cache-first: after editing, bump `CACHE` in sw.js and,
  in the preview, unregister SW + clear caches + reload twice — otherwise you
  WILL verify stale files (this has bitten repeatedly).
- Headless preview quirks: page reports hidden → rAF never fires (shim with
  setTimeout when testing animations) and `preview_click` may not deliver
  events — drive the DOM with `preview_eval` + `.click()`.

## Release checklist (separate web and APK channels)

For a web/PWA-only release, update `APP_VERSION`, `version.json.web`/`notes`,
and the service-worker assets/cache, then complete the review and full CI gate.
Keep the APK feed channel, native manifest and binaries unchanged unless a new
wrapper is actually built. The current candidate is web 1.0.0 with the existing
APK channel 0.75.0; candidate metadata is not evidence of publication. See
`docs/RELEASE-1.0.0-CHECKLIST.md` and `docs/CI-DEPLOYMENT.md`.

When rebuilding a native wrapper, also complete the native release checklist:

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

Publish only within current authorization and after the applicable gates pass.
Use normal reviewed commits and ordinary pushes. The Pages workflow requires
the full reusable test job, checks out its exact passing SHA and appends a
deployment commit without rewriting gh-pages history. Artifact publication
below is a separate destination and requires its own authorization.

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

- The cloud integration on `codex/soundlab-lumi-consolidation-20261023` is a
  web 1.0.0 release candidate. Publication is conditional on completed features,
  independent review and software gates. A normal review-branch push may run
  hosted CI after the local feature freeze; main/tag/release/deployment wait
  for the agreed gates and reporting of unresolved conditions. No force push,
  hardware, credential, billing or unrelated-repository change is authorized.
  Preserve APK channel/binaries and all source branches. Read the release
  checklist, branch audit, coverage and validation notes under `docs/` before
  extending the shared Scale Lock, instructional MIDI or performance player.

- PowerShell 5.1: no `&&`; embedded double quotes split native args (use
  single quotes in commit messages).
- APK: mic + update checks need the WebView flags already set in
  MainActivity.java; fetch() fails on file:// — use XHR for local assets.
- Same signature = in-place APK update. Losing soundlab.keystore (the
  current key; guitarlab.keystore signed the retired com.mreindl.guitarlab)
  means users must reinstall — keep it safe, never commit it.
