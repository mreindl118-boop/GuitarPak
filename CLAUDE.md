# soundLAB — agent guide

Guitar + keys practice PWA (vanilla HTML/CSS/JS, no build step) + Android
WebView wrapper. GitHub: https://github.com/mreindl118-boop/GuitarPak
Branded **soundLAB** (formerly GuitarLab) since v0.43.0 — the rename is
user-facing ONLY: the APK ships as soundLAB-alpha.apk (a GuitarLab-alpha.apk
copy keeps old links alive), and internal ids/comments are untouched.
STORAGE: the 1.x app (branch main) keeps its data under 'guitarlab.*'. 2.0
(branch v2, since Phase A4) keeps its own under 'soundlab2.*'
('soundlab2-next.*' on the beta under /next/). For 2.0 'guitarlab.*' is the
1.x store: copied across ONCE at the first start and never written, deleted
or changed (App.store in js/app.js; Phase A section, A4).
ANDROID (v0.70.2): the app is now
com.mreindl.soundlab signed with soundlab.keystore (new key) — the old
com.mreindl.guitarlab (old key) is retired; users installed the new app and
deleted the old one. The wordmark is a
custom SVG letterform set (stems = piano black keys: flat top, rounded
bottom): inline in index.html's header (theme-aware via currentColor +
--accent), standalone in icons/logo.svg, app icon icons/icon.svg (three
black keys on amber) rendered to icons/icon-192/512.png.

## soundLAB 2.0 (branch `v2`) — read first

2.0 is being built on branch `v2` and published to the BETA address
https://mreindl118-boop.github.io/GuitarPak/next/ by
`.github/workflows/pages-next.yml` (full suite first; replaces only `next/` on
gh-pages; `pages.yml` carries `next/` over on live deploys). The live 1.x app
stays on `main` until the 2.0 release. Plan: `docs/ROADMAP-2.0.md` (decisions +
phases). Look: `docs/DESIGN-SYSTEM.md` ("E · Stage"), tokens in `css/tokens.css`
(every new 2.0 component uses only `--sl-*`). Work = one phase per draft PR into
`v2`; the owner merges. Known Phase 0 caveats: beta + live share `localStorage`
(prefix `soundlab2.*` comes in Phase A) and the live service worker clears the
beta's `soundlab2-*` caches when it updates. 2.0 cuts the Studio/DAW, sampler and
plug-in API and splits gear control into `gear.html` (soundLAB Gear) — see the
roadmap before touching those areas.

## Layout

```
index.html        soundLAB: tab shell; loads theory → app → modules →
                  App.boot(). 14 pages + the Settings overlay; since 2.0
                  Phase A3b it loads NONE of the seven soundLAB Gear files
gear.html         soundLAB Gear (2.0 Phase A3b): the second app over the same
                  scripts and the same store. <html data-app="gear">; the
                  SAME shell markup as index.html from <body> to <main>
                  (header, context bar, bottom tab bar, the two sheets; only
                  the brand tag reads "gear" instead of "alpha") — a COPY
                  until Phase B, so edit both files together
                  (tests/assets.test.js compares them); its own <title> and
                  footer; panels deck / liveset / midihub / helix, no Settings
                  panel, no css/lumi-practice.css; 18 scripts in this order:
                  theory, note-palette, app, midi, remote, midirules,
                  audioin, metronome, scoreplayer, midihub, synthtab,
                  synthlive, synthdeck-maps, synthdeck-scope, synthdeck,
                  helix, help, lights; then App.boot() and the same sw.js
                  registration; the same manifest.webmanifest. See the Phase
                  A section (A3b) for what differs between the two apps.
css/style.css     design system ("stage gear": #131114 ground, #ffab47 amber,
                  Bebas Neue display + Barlow body from fonts/; chord names
                  use --font-condensed — Bebas is caps-only)
js/theory.js      pure music-theory engine (scales, tunings, chords, diatonic
                  harmony, progressions) — no DOM
js/app.js         shell: module registry, tab switching, shared AudioContext +
                  App.pluck, App.store (JSON localStorage under the 2.0
                  prefix: STORAGE at the end of this entry), App.on/emit
                  event bus, APP_VERSION + auto-update checker. 2.0 Phase A3b
                  TWO APPS FROM ONE FILE: APPS = {main, gear}, each {url,
                  name, tabKey, pages, groups}; APP_ID ('gear' when <html
                  data-app="gear"> or window.SL_APP says so, else 'main')
                  picks PAGES / GROUPS / TAB_KEY / HOME. App.app = 'main'
                  (soundLAB) | 'gear' (soundLAB Gear); App.goApp(owner, page)
                  = leave for a page of the other app (location.href =
                  <url>#<page>); App.switchTo does it by itself for an id of
                  the other app (resolvePage's cross-app guard). #page in the
                  address (gear.html#midihub, index.html#settings) is read at
                  boot and on hashchange, then cleared. Details: Phase A
                  section, A3b.
                  2.0 Phase A4 STORAGE (App.store; the ONLY code in js/ that
                  touches localStorage). ONE PREFIX PER ADDRESS: App.store.
                  prefix = 'soundlab2-next.' when the path ends in
                  /next/<file> (the beta), else 'soundlab2.' (the live
                  address, the test server, file://, the artifact).
                  App.store.legacy = 'guitarlab.' = the 1.x store: READ by
                  the copy below, never written, deleted or changed (the
                  live 1.x app on the same origin still uses it). get(key,
                  fallback) / set(key, value) = JSON, as always (a refused
                  write is swallowed); keys() = this scope's keys WITHOUT
                  the prefix; raw(key) = the stored string as it is, or
                  null; setRaw(key, raw) = store a string as it is, true
                  when it read back (the Backup import). App.store.deny =
                  a RegExp tested against a key WITHOUT its prefix = the
                  keys of features Phase A removed, never copied and never
                  imported: st.*, ideas.*, song.*, sd.*, plugins.*,
                  app.space, app.tabStudio, app.click, pads.track,
                  app.gtab.gstudio / gsketch / gpl-*, tr.earBest,
                  tr.earHarm. A DENY list, not an allow list: everything
                  else travels, also a key nobody listed, and with it the
                  five one-time migration markers (fb.migr24,
                  midi.allIn.v1, midi.voiceAuto, lights.v1, jam2.migr),
                  which must arrive together with the settings they guard
                  or a 1.x migration runs again.
                  THE ONE-TIME COPY, importOnce(): once per scope, run
                  SYNCHRONOUSLY right where the store is defined (never in
                  boot(): js/midi.js writes to the store while it loads,
                  and a later copy would find those keys taken and leave
                  the user's values behind). Triggered by the MARKER key
                  'store.imported' (never by a version number) = {v, from,
                  at, copied, skipped, failed: [keys], kept: [keys]}. No
                  marker = copy from the source ('guitarlab.'; on the beta
                  'soundlab2.' once the live scope has its own marker),
                  copy-only, never over a key this scope already has, then
                  write the marker. COPY ORDER (every write on its own,
                  read back, a refused one listed in failed, never
                  thrown): 1 every value of at most 4,096 characters
                  (STORE_SMALL: settings, flags, the migration markers),
                  2 longer values of STORE_PROGRESS keys (practice.
                  progress.*, lesson.*, qz.*, kl.*, xp.*, pp.*, tr.*, the
                  ws.* progress keys: what cannot be made again), 3 longer
                  values of STORE_LIBS keys (ws.lib, sg.lib, cc.charts,
                  jam2.sections, midihub.*, synthtab.*, hx.*: what a file
                  can bring back), 4 any other longer value; smallest
                  first inside a group. HEADROOM: after the last write a
                  probe of 200,000 characters (STORE_ROOM) must still fit
                  (written, then removed under the key 'store.probe';
                  only tried when this run made a copy it could take
                  back). While it does not, the copy
                  takes back copies THIS RUN made, group 4 first, then 3,
                  then 2, largest first, and lists them as failed; never a
                  group-1 key, never a key that was there before the run.
                  RETRY: a marker with failed keys is tried again at every
                  start, with the same headroom check. A failed key that
                  2.0 has written itself by then moves to `kept` (never
                  overwritten, never tried again); one whose source is
                  gone is dropped; the marker is rewritten only when it
                  changed. A marker with an empty failed list returns at
                  once. START NOTICE: boot(), both apps, after the start
                  tab is shown, App.toast at EVERY start while failed is
                  not empty (8 s; joined with the other start notices when
                  there are any): "Some of your 1.x data did not fit in
                  this browser's storage (N items). soundLAB tries again
                  each time it starts. Details: soundLAB › Settings ›
                  Backup." ("data from the live app" on the beta when its
                  copy came from the live 2.0 scope.) It is the only place
                  boot() touches the copy.
                  importInfo() = the marker or null (a normalised copy;
                  from memory when the marker itself could not be
                  stored); copyAgain() = the same copy (same order, same
                  headroom) OVER what this scope has, then a fresh marker
                  (Settings › Backup, #set-copy-again); it returns
                  importInfo(). waiting(key) = true while the key is in
                  `failed`, i.e. still waits for its copy: a page that
                  fills an EMPTY key with a default asks first and keeps
                  the default in memory (js/chordchart.js cc.charts,
                  js/practiceplan.js pp.students + pp.sessions), because
                  a stored default would be "2.0's own data" at the next
                  start and end the retry. Blocked or full storage never
                  stops the app from starting. Rules for everything else:
                  Phase A section, A4. Suite tests/storage-import.test.js.
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
                  bytes|null run before dispatch (null drops it); the Hub's
                  rules are installed there while midihub.rulesIn is on (by
                  js/midirules.js since 2.0 Phase A3a, not by the Hub page).
                  1.4.1 PORTS BY NAME: Chrome on Windows ids are positional
                  (output-N) and reorder when another app (FL Studio) frees
                  a device. midi.outputName / lights.outputName are saved
                  with the ids; a restore re-finds the port by name
                  (webOutputByName) and a LUMI's second port (MIDIOUT2 (...))
                  is skipped for lights (secondPort); explicit setOutput
                  choices are kept. Suite tests/portnames.test.js.
                  1.4.0 VOICE MODE: midi.appSound 'auto' (default) | true |
                  false; Auto mutes only notes FROM a self-sounding synth
                  port (SELF_SOUND_RE: MODX/MONTAGE/Nord/...;
                  App.midi.selfSounding), so LUMI + MODX on All keyboards
                  need no switch; a stored false moved to 'auto' once
                  (midi.voiceAuto marker). App.midi.voice / setVoice,
                  'midi:voice' event; appSound/setAppSound kept.
                  v0.78.1 APP SOUND: midi:note carries mute:true when
                  midi.appSound is false (Settings > MIDI keyboard switch,
                  App.midi.setAppSound) or any App.midi.mute(owner, on) is
                  held (the Hub holds 'midihub' while open unless midihub.
                  hear; in soundLAB Gear that hold mutes nothing: there is
                  no app voice there) - only piano.js's voice honours it;
                  pads, lessons, quiz, range learning and lights still react
                  (unlike tone-in's silent:true). A synth that sounds itself
                  is never doubled.
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
                  2.0 Phase A3a SYNTH OUT: App.midi.synthOut {id(), name(),
                  has(), set(v)} = which output is the synth, moved here from
                  js/midihub.js so the score player needs no Hub; the Hub and
                  js/scoreplayer.js read this ONE copy. Still stored as
                  midihub.outId: a port id | 'shared' = the key-light output
                  | unset = auto (a synth-named port, port 1 first, never a
                  LUMI / Microsoft GS Wavetable). id() = a port id for
                  App.midi.sendTo / bindMusicalOutput, or null ('shared', a
                  native bridge = one route, no synth port found, MIDI not
                  ready), which both of them read as the selected (key-light)
                  output; name() = the name of the port that is used; has() =
                  MIDI ready and a synth port or a selected output exists;
                  set(v) stores v ('' / null = 'shared').
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
                  2.0 Phase A3b ONE WINDOW ROUTES HEAR INPUT: soundLAB and
                  soundLAB Gear both load this file and read the same
                  audio.monitor, so without a rule a synth on USB audio would
                  play twice. Only the document that holds the Web Lock
                  'soundlab-hear-input' (exclusive; every document asks at
                  load and keeps it for its lifetime, Hear input on or off)
                  connects the input to the speakers (`owner`; route() refuses
                  without it). One window open = it has the lock 3-50 ms
                  after load, long before the 500 ms launch restore, and every
                  path is as before. Not the owner = a fourth HOLD, why
                  'other' ("Your other soundLAB window has Hear input. Press
                  On to hear it here instead."): nothing is opened for Hear
                  input alone (applyMonitor, reopen, the return to visible,
                  the launch restore, setDevice); a hold(tag) still opens the
                  device, never routed. setMonitor(on) in a window that is
                  not the owner writes the store, takes the lock ({steal:
                  true}) and then does what it always did: On or Off pressed
                  in a window makes THAT window the owner. The window it was
                  taken from (its request rejects) drops consent + ack (a
                  microphone waits for a press again), re-reads audio.monitor
                  (still on = the 'other' hold, off = off there too) and
                  queues again, so it takes over when the owner closes (a
                  grant from the queue with audio.monitor on = the launch
                  restore, permission check first). ONE 'storage' listener
                  (key === App.store.prefix + 'audio.monitor', or null = a
                  cleared store) keeps the 'other' hold and the views in
                  step with a press made in the other window; it never
                  routes, opens or steals (Chromium can deliver the lock
                  news before the stored value). Since 2.0 Phase A4 only
                  THIS scope's key counts: the live 1.x app and the beta
                  keep the same switch under their own prefix on the same
                  origin, and a write there is not this app's. No Web
                  Locks, or a refused request (the claude.ai viewer, old
                  WebViews) = owner from the start, everything as before.
                  Nothing is stored. App.audioIn.mountSwitch(el) = "Hear
                  input" Off / On seg + a status line + a link to
                  index.html#settings, for a page without the Settings card
                  (Gear's Hub header, #mh-hearin); idempotent, repaints on
                  'audioin:state'. _t().owner = test hook. The two-window
                  cases are in tests/gear.test.js.
                  Loaded right after tonein.js (soundLAB) / midirules.js
                  (soundLAB Gear).
js/remote.js      CONTROLLER REMOTE (App.remote, 2.0 beta / v2; docs/CONTROLLER-
                  REMOTE.md): practice moves on from the instrument. Actions
                  next / back / stop, each bound in Settings › Hands-free
                  control (#set-remote-card, rows rendered by remote.js
                  mount) to a learned MIDI CC press / Program Change / note
                  (port name kept, any channel; an unconnected learned port =
                  any port; 'latching' = every change) and/or a learned key;
                  remote.pt = page-turner keys (PageDown/Right/Down = next,
                  PageUp/Left/Up = back; capture phase, preventDefault, never
                  while typing); remote.dbl = double-tap the lowest key
                  (range().lo; only the LUMI's when one is connected) = next,
                  on pages whose module declares remoteKey (that key is then
                  reserved: claimed, silent, never graded). Bound MIDI is
                  CLAIMED by midi.js setInputClaim BEFORE 'midi:raw' (no Thru,
                  no grading, no dispatch; 'midi:remote' instead; a release of
                  a note the app already got is never claimed). Fires through
                  App.remoteAction (app.js): help tour -> clef/sheets fold ->
                  Settings = a 'works' test -> the page's onRemote -> else an
                  App.toast 'Nothing to move on here'. #remote-hud confirms.
                  Store remote.map / remote.pt / remote.dbl; bus 'remote',
                  'remote:map'. Loaded right after midi.js. Suites
                  tests/remote.test.js (core) + tests/remote-<area>.test.js.
                  2.0 Phase A3b LOADED BY BOTH APPS: soundLAB and soundLAB
                  Gear read the same bindings and both CLAIM a bound message
                  (it never reaches Thru, the Deck or the Live page's foot
                  switch as data). THE SETTINGS CARD IS IN SOUNDLAB (mount is
                  only called there). WITH BOTH VISIBLE ONLY SOUNDLAB ACTS on
                  a MIDI press (Web Lock 'soundlab-remote-main'): soundLAB
                  holds it in shared mode while its document is visible
                  (asked at load, on return to visible and on pageshow; let
                  go on hide and pagehide) and fire() is unchanged there:
                  visible = it acts, focused or not (FL Studio may have the
                  focus). In Gear a press with a MIDI via (cc / pc / note /
                  dbltap) runs only inside locks.request(LOCK, {ifAvailable:
                  true}) = only while no soundLAB window is visible; ONE
                  question at a time (presses that arrive meanwhile join it
                  and act in order; one older than LOCK_MS 1000 never acts);
                  a press Gear did not take puts the debounce back; fire()
                  returns null for a MIDI via in Gear and acts a task later.
                  Keys and direct calls ('key', 'test') stay synchronous. No
                  Web Locks or a refused request: Gear acts on a MIDI press
                  only while document.hasFocus(). No sound hint in Gear (a
                  step sounds on the synth). App.remote.holdsMain (getter:
                  this document holds the shared lock; always false in Gear).
                  'remote:map' does not cross windows: Gear reads remote.map
                  on every message, but a pedal on a port Gear has not opened
                  is claimed only after its next port refresh. Suite
                  tests/remote-gear.test.js (gear.html: Live sets, the Deck,
                  the two-window cases).
                  ANSWER BY KEY (quiz.js keyAnswerable): a choice question with
                  no playable answer takes a WHITE key per choice (<= 7: C-B
                  any octave; more: white keys up from range().lo's C), badge
                  .kb on each choice while a keyboard is in; the right key
                  after a miss moves on; remoteKey is false there.
js/midirules.js   MIDI RULES (App.midiRules, 2.0 Phase A3a): the MIDI Hub's
                  rule engine + its input-filter install, cut out of
                  js/midihub.js so "Apply to what soundLAB hears (every page)"
                  needs no Hub. The Rules EDITOR, Learn and decode stay in
                  the Hub. apply(bytes, port) -> [bytes...]: one channel
                  message through midihub.rules (read on EVERY call): match
                  type / channel / number range / source port (m.port, a
                  substring of `port`: Thru passes the port name, the input
                  filter passes none), then block / convert / set ch / set
                  number / add / value %; [] = blocked, [bytes] = untouched;
                  0xF0 and up always pass. Its own small classifier (kind, ch,
                  num, val, on), not the Hub's decode (monitor text).
                  install(): App.midi.setInputFilter(fn) while midihub.rulesIn
                  is on, null while it is off (the ONE filter slot stays free;
                  tests/midihub.test.js asserts both). Runs at load, when the
                  tab becomes visible again and on a 'storage' event whose key
                  is App.store.prefix + 'midihub.rulesIn' (or null = a cleared
                  store): the box ticked in ANOTHER window of this app; the
                  window that ticks it calls install() itself (the Hub's
                  installFilter). Since 2.0 Phase A4 only THIS scope's key
                  counts (the live 1.x app and the beta keep the same box
                  under their own prefix on the same origin).
                  active() -> {on, rules} (rules = enabled count; soundLAB's
                  Settings line #set-midi-rules shows it). Bus
                  'midirules:state' {on, rules} when the installed state
                  changed (the Hub's box #mh-rulesin and that Settings line
                  listen, so each shows what THIS window has installed after
                  another window switched it; it fires on an on/off flip, not
                  when only the rule count changes). Reads midihub.rules /
                  midihub.rulesIn, never writes. Loaded by BOTH apps, right
                  after remote.js: since 2.0 Phase A3b the Hub and its Rules
                  editor are in soundLAB Gear, and this file is what keeps
                  "Apply to what soundLAB hears" working in soundLAB. Checks
                  live in tests/midihub.test.js (gear.html) and tests/
                  trim.test.js (a stored rule still shapes what the Piano
                  page receives).
js/metronome.js   ┐ feature modules; each registers (metronome = the corner
                  │  sheet, not a page — see OVERLAY SHEETS; loaded by both
                  │  apps, the rest of this block by soundLAB only)
js/fretboard.js   │ App.register(name, {init, onShow, onHide, onKey})
js/chords.js      │ DOM ids/CSS prefixed met-/fb-/ch-/jam-/tun-
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
                  │  SOUND PICKER (2.0 Phase A2; there is no 'synth' page any
                  │  more): the select #pn-voice, labelled "Sound" = Grand
                  │  piano or one DAW.SYNTH_PRESETS sound, stored in pn.voice;
                  │  pn.synthPreset = the last synth sound. applyVoice(id) is
                  │  the one place the sound changes; App.keys.setVoice(id)
                  │  picks it from outside the page ('piano' or a preset id;
                  │  false for an unknown id, nothing changes) — the Learn
                  │  bar's "Synth keyboard" entry calls it. The sampled piano
                  │  tones are not in this list (one merged list: Phase B/C).
                  │  App.keys.stopRunner() stops the scale runner. The page
                  │  also hosts the LUMI section #pn-lumi (lumi-practice.js).
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
js/chordchart.js  │ CHORD CHART MAKER (2.0, page 'chart', Keys pill "Charts",
                  │  prefix cc-, store cc.charts / cc.active / cc.lumi): Matt's
                  │  paper chord sheets in the app - rows of 2-3 octave keyboards,
                  │  tap = dot (App.colors.forPitch = LUMI colors), finger tool
                  │  1-5, Add fingers (teacher rules: 135 / 125 / 1245 / 1235,
                  │  L hand mirrored), chord names found from the dots (slash
                  │  chords), Chord or Line (bass line, in placed order), Undo,
                  │  Play it in (midi:note drops dots), Light the LUMI (App.midi.
                  │  guide now + next), Play all (1 bar per keyboard at met.bpm,
                  │  transport:claim 'chart'), Save file (.chart.json v1, clean()
                  │  on open), Save MIDI, Practice with LUMI (-> Woodshed
                  │  importMidi/addScore), Print (chart only). Hook window.SLChart,
                  │  suite tests/chordchart.test.js, docs/CHORD-CHARTS.md.
                  │  An empty cc.charts gets a blank "My first chart", stored at
                  │  once, except while App.store.waiting('cc.charts') (2.0 Phase
                  │  A4: the 1.x charts did not fit yet; then it stays in memory).
                  │  KEYS PAGE DOTS (2.0): pn.look 'dots' (default: one colored
                  │  .pn-sdot per scale key, tonic ringed, keys stay ivory) |
                  │  'keys' (the old whole-key paint); seg #pn-look.
js/songs.js       │ (songs: user-imported ASCII tab / MIDI parsed on-device,
                  │  bar-loop player at shared tempo, key detect → fb:set)
                  │  1.3 ONE OPEN: the "Open a score" card above Add a song
                  │  takes .mid/.midi/.musicxml/.xml/.mxl/.txt and routes it:
                  │  Play on synth (SLScorePlayer.loadFile/loadScore + show;
                  │  js/scoreplayer.js since 2.0 Phase A3a, the Hub is not
                  │  called; MusicXML reaches the other two as MIDI through
                  │  SLScorePlayer.toMidiBytes),
                  │  Practice (window.Woodshed.importMidi + addScore -> shed),
                  │  Open as tab (App.songs.fromMidi/load, text -> the paste
                  │  box). Suite tests/oneopen.test.js.
                  │  2.0 Phase A3b THE PLAYER CARD IS ON THIS PAGE (the Hub
                  │  went to soundLAB Gear): <div id="sg-player" hidden>, a
                  │  plain host right after the "Open a score" card (the
                  │  module renders its own .card inside), SLScorePlayer.mount
                  │  (el, {ports: true, noOut: 'No synth output yet. Connect
                  │  your keyboard in Settings › MIDI keyboard.', connect:
                  │  {label: 'Open Settings', run -> App.switchTo('settings')},
                  │  show -> switch to songs + unhide + scrollIntoView}).
                  │  Hidden until "Play on synth" sends it a file; #sg-openmsg
                  │  then reads "In the Player below: <title>. Press Play
                  │  there." onShow -> SLScorePlayer.paint() (the output and
                  │  the Part are stored settings a Gear window can change);
                  │  onHide and pagehide -> SLScorePlayer.pause(). "Open as
                  │  tab" on the card (#mh-pltab) lands on this same page, so
                  │  two click listeners scroll the tab card into view when
                  │  the song changed. CSS '#sg-player #mh-plports[hidden]
                  │  {display:none}' (.row's display:flex beats [hidden]).
                  │  The pedal (plRemote) drives the bar-loop player only.
js/lumi-practice.js LUMI note/triad practice (selectively recovered from
                  b8ccb55; see docs/LUMI-PRACTICE.md). Since 2.0 Phase A2 a
                  SECTION ON THE PIANO PAGE, not a page: piano.js init mounts
                  it into <details class="card" id="pn-lumi"> ("Notes and
                  triads on the LUMI", after #pn-lessons, closed by default;
                  body #pn-lumi-body) and drives it through App.lumiPractice
                  = {init, show, hide, close(msg), stop, remote, remoteKey,
                  open (getter), running (getter)}. `open` = the fold state
                  alone (true also while another page shows); the module's
                  `visible` = Piano page shown AND section open.
                  OPEN = OWNER, one owner at a time: opening the section or
                  starting a session stops a lesson run (App.keysLessons.
                  halt(): like stop, but keeps the entry instrument) and the
                  runner (App.keys.stopRunner); a lesson starting, a lesson
                  opened from the Plan or the Learn bar (keylessons start /
                  releaseRunner) and the runner starting (ppStart) call
                  close(msg) = fold the section + stop + disarm. While open
                  the section ALONE answers the pedal (piano.js onRemote
                  returns its answer, no fall-through to the lessons or the
                  runner), the lessons' lowest-key double-tap stands down (a
                  touch double-tap on the lesson card still starts a lesson,
                  which closes the section), and with remote.dbl in
                  simulated mode the lowest key is reserved
                  (the Piano module's remoteKey). Closed = nothing changes
                  for lessons, runner, pedal and double-tap. Leaving the
                  Piano page, folding the section, window blur and app hide
                  stop + disarm a session. Unchanged: the 42 lp- ids, the
                  window.SLLumiPractice hook, the lease owner tag
                  'lumipractice', the LUMI display output choice (#lp-output,
                  still only here). CSS scope #pn-lumi (css/lumi-practice.
                  css). Session-only simulated answers by default; optional
                  exact LUMI/MODX input and LUMI output through additive Web
                  MIDI subscriptions. App.midi.leaseKeybedOutput pauses the
                  shared LED painter on the same selected output during
                  test/armed guidance; cleanup restores its current layout.
                  Native independent routes unsupported. Tests:
                  lumi-practice, midi-ports, remote-plan, remote-keys, keys.
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
js/trainer.js     │ (NOT a page since 2.0 Phase A2: a CARD LIBRARY mounted by
                  │  the Plan page into #pp-tools-body, its "Free practice"
                  │  section. App.trainerCards = {mount, show, hide, key,
                  │  remote}. Cards: session log (tr.sessions), random
                  │  prompts ("Go" emits fb:practice), one-minute chord
                  │  changes (tr.ccA / tr.ccB / tr.best.<A>-<B>) and
                  │  #tr-ear-go -> Exercises › Intervals › All intervals ›
                  │  Ear. The interval ear trainer is gone: tr.earBest /
                  │  tr.earHarm are never read or written. Ids keep tr-, CSS
                  │  via App.injectCSS('trainer').)
js/theorytab.js   │ (theory: circle of fifths + key guide + degree ear quiz)
js/settings.js    ┘ (settings: app-level prefs — theme dark/light/auto; MIDI
                     ports + bend; lighting moved to Lights & help)
                     SOUNDLAB ONLY (2.0 Phase A3b): gear.html has no Settings
                     panel and does not load this file; the gear icon there
                     opens index.html#settings.
                     1.4.0 DEVICE CARDS (rebuilt, not patched): MIDI keyboard =
                     Connect -> "Found:" chips per device (what soundLAB does
                     with it) -> Keyboard / Key lights selects -> "soundLAB
                     plays my keys" Auto/Always/Never (#set-midi-voice ->
                     App.midi.voice/setVoice) -> details for Windows Bluetooth
                     (#set-midi-btnote) and More MIDI options (pitch bend,
                     Lights & help). Sound input & output = Find my gear ->
                     Input/Output -> ONE "Use the input to" seg #set-ain-mon
                     (data-mon off/on=Hear it/notes=Show notes/both) writing
                     audio.monitor + audio.tonein; level slider only while
                     heard; meter only while an input is in use; no Test
                     button, no tone-in checkbox. AUTO-PICK while Input is
                     System default: Steinberg/UR > other interfaces > Helix
                     > MODX (GEAR list); choosing System default by hand pins
                     it (audio.inDefault); the old audio.inPicked no longer
                     blocks it. Windows "Default"/"Communications" duplicates
                     are not listed.
                     2.0 Phase A3b: #set-midi-rules (MIDI keyboard card,
                     after the Connect row; hidden unless App.midiRules.
                     active() reports the box on AND >= 1 enabled rule) reads
                     "MIDI Hub rules are changing what soundLAB hears (N
                     rules). Edit them in soundLAB Gear." + #set-midi-rules-go
                     "Open the Hub" -> App.goApp('gear', 'midihub'); painted
                     at init, on show and on 'midirules:state'. The device
                     chip of a Helix reads "Helix (in soundLAB Gear)". The
                     Hands-free card names Live sets and the Deck as Gear
                     pages and says which app answers the pedal when both
                     are on screen. The Sound card paints the 'other' hold of
                     js/audioin.js like any hold; its 'audioin:state'
                     listener also lets the meter go (meterHeld) when the
                     last use of the input ended in ANOTHER window (Off
                     pressed on Gear's Hub while Settings is open here), or
                     the meter would keep the device open.
                     2.0 Phase A4 BACKUP CARD (all through App.store, no
                     localStorage here): #set-backup-info = what the
                     one-time copy did, from App.store.importInfo()
                     ("Copied your 1.x data on <date>: N items." + the
                     keys that did not fit and are tried again at each
                     start + the keys left alone because 2.0 has its own
                     data there; painted at init and on show).
                     #set-copy-again "Copy my 1.x data again" (on the beta
                     "Copy from the live app again"): TWO taps within 3 s,
                     the second labelled "Tap again: this overwrites 2.0
                     settings", then App.store.copyAgain() and a reload;
                     no confirm() (the artifact frame refuses it). EXPORT
                     = format 2: {app: 'soundLAB', format: 2, from:
                     App.version, scope: App.store.prefix, keys:
                     {'<prefix><key>': raw string}}, this scope's keys
                     only, without the copy's marker. IMPORT takes keys
                     that start with 'soundlab2.' or 'soundlab2-next.'
                     (a beta file restores on live and the other way
                     round) and old 'guitarlab.' keys (a 1.x file), strips
                     the prefix and writes under THIS scope with setRaw:
                     string values only, App.store.deny keys skipped,
                     never a 'guitarlab.' key written; it reports "N
                     settings restored, M from removed features skipped"
                     and reloads. A1's `DEAD` regex is gone (the deny
                     list replaced it).
js/lights.js      LIGHTS & HELP control center (sheet 'lights', header
                  #lights-btn): Help level + key lights (on/off, LUMI colors,
                  brightness, keyboard type, status/range, test) — the same
                  settings every page reads. Loaded by both apps; in soundLAB
                  Gear its two ways into Settings (App.switchTo('settings'))
                  leave for index.html#settings.
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
                  the transport (silences the metronome, Jam, a Keys lesson
                  run and chart playback).
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
                  tests/practiceplan.test.js. The two defaults (the starter
                  student when pp.students is empty, today's empty session in
                  pp.sessions) are stored at once, except while
                  App.store.waiting(key) (2.0 Phase A4: the 1.x value did not
                  fit yet; then they stay in memory until real progress is
                  saved).
                  FREE PRACTICE (2.0 Phase A2, the former Trainer page):
                  <details class="pp-tools" id="pp-tools"> ("Free practice:
                  timer, prompts, one-minute chord changes", closed by
                  default) is appended AFTER .pp-wrap — never inside it and
                  never class card: the Plan's .pp-wrap form rules would
                  restyle the cards. init calls App.trainerCards.mount
                  (#pp-tools-body); onShow / onHide call .show() / .hide();
                  onKey offers the key to .key(e) first (Space counts a
                  chord change during a run); remote() asks .remote(action)
                  first (NEXT = count a change, BACK = held while a run goes,
                  STOP = cancel the run or pause the timer), then launches
                  blocks as before. Folding #pp-tools cancels a chord run
                  (a 'toggle' listener in trainer.js). The timer is
                  self-timed (tr.sessions), pauses when the page is left and
                  never enters the plan's measured minutes.
js/help.js        (?) button + guided page tours (TOURS per page id, spotlight
                  ring + card overlay, first-run welcome; help.seen/help.done)
                  ONE FILE FOR BOTH APPS (2.0 Phase A3b): TOURS is keyed by
                  page id, so each app shows the tours of its own pages and
                  the two sheets' tours in both. The welcome is about
                  soundLAB's pages: soundLAB Gear never shows it and leaves
                  help.seen alone. The Hub tour has no App voice step and
                  says Thru runs while Gear is open; the Songs tour has a
                  step on #sg-player.
js/helix.js       soundLAB Gear — HELIX STADIUM page ('helix': Gear's own
                  "Helix" tab, group ghelix, one page so no pill strip; in
                  1.x the Guitar group's "Helix" pill;
                  0.82.0; prefix hx-, store hx.*; built in — it began as a
                  plug-in, before 2.0 removed the plug-in API).
                  NOTHING CONNECTS AT BOOT: init builds the
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
                  docs/HELIX-STADIUM.md, suite tests/helix.test.js (on
                  gear.html; fake MIDI ports + fake bridge, incl. port
                  isolation), hook window.SLHelix. 2.0 Phase A3b: the
                  footswitch-mode seg #hx-fsmode wraps like .hx-views (it
                  made the page scroll sideways on a phone).
js/scoreplayer.js SCORE PLAYER (window.SLScorePlayer, 2.0 Phase A3a): the
                  MIDI Hub's v1.1.0 Player, cut out of js/midihub.js so Songs'
                  "Open a score" needs no Hub. Logic MOVED, not rewritten:
                  ids stay mh-pl*, settings stay midihub.pl*. Opens .mid/
                  .midi (own reader: tempo map, running status; program/
                  other CC/SysEx dropped + reported), MusicXML (.musicxml/
                  .xml: parts -> channels skipping 10, chords, ties, rests,
                  backup/forward, tempo marks; grace/unpitched/repeats
                  reported) and .mxl (zip, stored or deflate-raw via
                  DecompressionStream). Plays through App.midi.
                  bindMusicalOutput(App.midi.synthOut.id()) - notes + CC64
                  only - so Pause / Stop, a host's pause() (the Hub: Panic,
                  onHide, pagehide; Songs: onHide, pagehide) and
                  flushMusicalOutputs release everything; 8 ms ticker.
                  midihub.plTempo (%), plVel (cap),
                  plRoute 'file' | 'part' (the Part = midihub.ch, its word
                  Part / Ch from midihub.profile, both read from the store),
                  plLoop, plTrans (-12..12), plShift {on, fr, fs, tr, ts} =
                  KEY SHIFTER by scale degree over ten 7-note Theory scales
                  (shiftMap; the source key is guessed by detectSongKey on
                  load); changing either while playing pauses/resumes so
                  every Note Off matches its Note On. Messages go to
                  App.toast (the Hub's #mh-toast shows only on the Hub page;
                  there a Hub message hides an older app-wide one, see the
                  Hub's toast()).
                  API: mount(el, opts) = render + wire + paint the card into
                  el. ONE MOUNT PER DOCUMENT, idempotent: song, transport and
                  the one ticker are module state, a remount only swaps the
                  DOM. opts {show = what show() calls; ports: true = own
                  "Synth out" + "Channel" selects writing midihub.outId /
                  midihub.ch, for a host with no Hub header (the row is
                  display:none until MIDI is ready, and its selects never
                  grow wider than the card: a Bluetooth LUMI's long port
                  name; with ports the tips line says "the Channel picked
                  above" instead of "the Part picked in Control"); noOut =
                  the line while there is no synth output (default "No synth
                  output yet — connect MIDI above"), also what Play toasts
                  then; connect {label, run} = a
                  .btn.sm after it}; the Hub passes only show, the Songs page
                  all four. paint() = the
                  REPAINT PATH: the host calls it when ports, Part or profile
                  change, the module calls it itself on 'midi:state' and
                  'lights' (what a mount without a Hub relies on); returns at
                  once while nothing is mounted. loadFile(name, ArrayBuffer),
                  loadScore(score = the 1.1 reviewed practice score {bpm,
                  len, notes:[{t, d, m, rest, partId, v}]}), play, pause,
                  stop, seek, shiftNote, key, openAsTab, toMidiBytes, state,
                  scoreToMidi(score) = format-1 MIDI (tempo track + one track
                  per part), show(). OPEN AS TAB: songToMidi (format 0 at the
                  song's own tempo, notes shifted as set) -> App.songs.
                  fromMidi -> load -> the Songs page (js/songs.js: App.songs
                  {fromMidi, load, toAscii, current} + an Export tab button);
                  where App.songs is absent (soundLAB Gear) one line stands
                  in for the button: "Open as tab is on the Songs page in
                  soundLAB." CSS App.injectCSS('scoreplayer') = the
                  .mh-pl* rules + the Hub classes the card uses (.mh-cv-head,
                  .mh-mono, .mh-chk, .mh-warn), so the card is styled where
                  the Hub's CSS is absent. TWO MOUNTS SINCE 2.0 Phase A3b,
                  one per document: soundLAB = the Songs page's #sg-player
                  (ports + noOut + connect + show; js/songs.js), soundLAB
                  Gear = the Hub's Player view #mh-player (show only).
                  Loaded after js/pads.js in index.html, before js/midihub.js
                  in gear.html. Suites tests/midihub-player.test.js (on
                  gear.html, through the SLMidiHub aliases; also the Hub's
                  mount, which passes no per-mount option, with MIDI
                  connected after boot) + tests/oneopen.test.js (on
                  index.html: the three "Open a score" routes and the Songs
                  mount with its per-mount options, MIDI connected after
                  boot through Settings).
                  Neither proves the REPAINT PATH; tests/midihub.test.js does:
                  the Hub's hook (a Part button and the header's Synth out
                  select reach the card) and, with that hook stubbed, the
                  module's own 'midi:state' / 'lights' listeners. NOT LANDED
                  YET: feat/review-to-synth (Score review, tests/review-to-
                  synth.test.js) calls SLMidiHub.player / SLMidiHub.scoreToMidi
                  and must call SLScorePlayer / SLScorePlayer.scoreToMidi
                  instead.
js/midihub.js     soundLAB Gear — MIDI HUB page ('midihub', the "Hub" pill of
                  Gear's Synth tab; v0.78.0 as "MIDI" under Keys, 1.3 under
                  Synth, 2.0 Phase A3b out of index.html;
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
                  (rulesApp); Learn = next incoming message fills a match;
                  since 2.0 Phase A3a the Hub is the EDITOR only: the ENGINE
                  is js/midirules.js (applyRules(bytes) = App.midiRules.apply
                  (bytes, rulePort), installFilter() = App.midiRules.install(),
                  which also runs at load, on return to the tab and on a
                  'storage' event for midihub.rulesIn; the box #mh-rulesin
                  follows 'midirules:state')),
                  SysEx (identity request + reply decode, profile builders:
                  Yamaha F0 43 1n 7F 1C mm addr(3) data F7 / 2n bulk,
                  Roland DT1/RQ1 with checksum; raw hex; last received),
                  Monitor ('midi:raw' + 'midi:out' rows, rAF-batched, 800
                  cap, clock/active-sensing filters, export), Learn (cheat
                  sheet + profile notes, export/import/reset). Keys played
                  here emit note:input {src:'midihub'}. Warns when
                  key lights are on for a non-LUMI output (a synth would
                  play the "lights"). Panic = 123/120/64/bend on 16 chans.
                  window.SLMidiHub = test hook (decode, applyRules,
                  PROFILES, parseHex, hex, rules). Suite tests/midihub.test.js
                  (on gear.html, like midihub-lock / -wheel / -player).
                  v0.80.0 SYNTH CONTROL: the Hub sends through its OWN output
                  (midihub.outId: a port id | 'shared' = the key-light
                  output | unset = auto: a synth-named port, port 1 first,
                  never LUMI / Microsoft GS Wavetable) via App.midi.sendTo
                  (portId, bytes) - Web MIDI only; native = send(). The
                  header's 'Synth out' select sets it. WHICH port that is =
                  App.midi.synthOut in js/midi.js since 2.0 Phase A3a
                  (hubOutId / hubOutName / hasOut, the names HUB_API hands
                  out, are one-line delegates). New first view
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
                  the SYNTH group (app.js APPS.gear.groups gsynth: deck,
                  liveset, midihub), no longer under Keys.
                  2.0 Phase A3b IN SOUNDLAB GEAR (a second document over the
                  same store; index.html does not load this file): THRU +
                  KEY SPLITS forward from THIS document only = only while a
                  Gear window is open; the Thru box's tooltip and
                  #mh-thruinfo say "Thru runs while soundLAB Gear is open."
                  (inGear()), soundLAB says it once at its start
                  (gear.thruTold). The Thru line still skips while
                  App.practiceRouter.active, but that module is not loaded
                  in Gear, so a practice route in a soundLAB window is not
                  seen here. The two still never run together: the route
                  refuses to start while midihub.thru is stored on, and it
                  stops when its window loses focus (a click into a Gear
                  window), before the Thru box can be ticked. RULES
                  ON INPUT still reach soundLAB (js/midirules.js). APP VOICE:
                  Gear has none (hasVoice() = !!App.keys), so #mh-hear and
                  its label #mh-hearlab are hidden (`.mh-chk[hidden]
                  {display:none}`: .mh-chk's inline-flex beats [hidden]), the
                  "voice is muted here" text is left out and the Learn
                  view's doubled-sound item points at soundLAB › Settings ›
                  MIDI keyboard; the mute calls stay (harmless). HEAR INPUT:
                  <span id="mh-hearin"> in the #mh-ports row, filled at the
                  end of render() by App.audioIn.mountSwitch (Gear only:
                  Gear has no Settings page); init (Gear only) shows ONE
                  App.toast per start when 'audioin:state' reports want +
                  held with why perm | mic | fell: "<msg> The switch is on
                  the Hub page." (8 s; why 'other' needs no word, and nothing
                  is said while the Hub page itself is open: the line beside
                  the switch says why). On, but held = the Settings card's
                  held look (`#mh-hearin button.held`). TRAP: #mh-ports is
                  `hidden` until MIDI is ready, but `.row`'s display:flex
                  beats the attribute, so the row (and the switch in it) is
                  on screen from the start, as on main. Whoever adds a
                  `.row[hidden]` rule must move #mh-hearin out of #mh-ports
                  first, or the toast points at a switch nobody can see.
                  v1.1.0 PLAYER view ('player', after Control). Since 2.0
                  Phase A3a the Player is js/scoreplayer.js (the entry above):
                  the view is only its host #mh-player, and render() calls
                  SLScorePlayer.mount(host, {show: switch to the Hub + its
                  Player view}) (render() re-runs on Import / Reset Hub; mount
                  is idempotent). The Hub REPAINTS the card through
                  SLScorePlayer.paint() in paintCvOut = ports changed
                  (midi:state / lights -> paintPorts), Hub shown, Part or
                  profile changed (renderControl), and pauses it
                  (SLScorePlayer.pause()) on Panic, onHide and pagehide.
                  SLMidiHub.player and SLMidiHub.scoreToMidi are ALIASES
                  (getters) of SLScorePlayer / SLScorePlayer.scoreToMidi,
                  kept so tests/midihub-player.test.js runs unchanged; new
                  code calls SLScorePlayer. No reader, key shifter, transport
                  or paint code of the Player is left in this file. In Gear
                  the card has no "Open as tab" button (no App.songs): one
                  line names the Songs page in soundLAB.
js/synthdeck.js   soundLAB Gear — SYNTH DECK (v1.2.0): the MIDI Hub's Control
                  view as a real
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
                  synthdeck-scope (both on gear.html).
                  2.0 Phase A3b: a preset's key restore (applyApp) writes
                  fb.root / fb.scale / fb.mode to the STORE before it emits
                  fb:set (root 0-11, a Theory.SCALES id, mode 1-7; anything
                  else is left alone): Gear loads no Fretboard to write them,
                  and the context bar, the key lights, Scale Lock and the
                  Hub's scale boundary read the key back from the store.
                  The factory names (map.nameFile, an XHR on first use) emit
                  'deck:factorynames' when they are in: js/synthtab.js
                  repaints the Deck page's Now bar on it. The Deck is Gear's
                  first page, on screen before the file has loaded; without
                  the event it kept "Program 1 · Bank 63/0" until some MIDI
                  arrived (in soundLAB the Deck was never the first page).
data/             app data files, used by soundLAB Gear: modx-performances.
                  json (2,143 MODX factory Performance names by LSB/PC, parsed
                  from a public Cakewalk .ins list; MSB 63 and 64 share the
                  layout) for the Deck's bank browser. In sw ASSETS, the
                  artifact build's asset list, the APK asset copy and (since
                  A3b) the iOS copy.
js/synthtab.js    soundLAB Gear — SYNTH TAB (1.3, docs/SYNTH-TAB.md): pages
                  'deck' (Gear's HOME; the play face
                  over the Synth Deck: Now bar, STRIPS not knobs with a row
                  picker that mirrors the MODX knob-function button, Assign
                  knobs named from the Performance dump, chips + Scenes,
                  EXPLAIN captions, Perform <-> Edit = the Hub's borrowed
                  Control view, the preset builder sheet = full snapshot
                  {colour, app key/scale, fav strips, split}) - everything
                  through App.synthDeck.perform.* so the deck's funnel holds.
                  1.3.1 CONNECT PANEL (#st-conn, #st-lvconn on Live; SLSynthTab.
                  conn): the Synth tab asks for MIDI itself - unsupported (iPad
                  Safari/Chrome: names the Web MIDI browser apps) / off (Connect
                  button; never prompts by itself) / busy / denied / noout /
                  lumi (output picker); on show it reconnects silently when
                  midi.wanted or permissions.query says granted; controls dim
                  (.st-offline) and a tap nudges the panel. IN-PLACE PAINT:
                  chips, Scenes and slots go through morph() (same nodes, only
                  attributes/text change) and midi:raw repaints only on CC /
                  Program Change / SysEx - the MODX's MIDI clock (~36/s) used
                  to rebuild the buttons under a finger and eat taps. Suite
                  tests/synthconnect.test.js (on gear.html, like synthtab and
                  synthconn).
js/synthlive.js   soundLAB Gear — page 'liveset': Live sets in pages of 16
                  (presets or MODX
                  Live Set slots MSB 62), stepping (Next/Prev, foot switch CC
                  synthtab.fsCC, LUMI octave buttons option), GO LIVE (bars
                  fold away, keep-awake, Lock = press-and-hold, Panic),
                  PROFILES (whole setups: library + sets + settings; export /
                  import JSON). SLSynthLive hook; suite tests/synthtab.test.js.
                  2.0 Phase A3b: Go live holds the wake tag through
                  App.wake.acquire('synthlive') / release (before, it called
                  App.wake as a function, which threw into its try/catch and
                  never held anything). The foot switch (synthtab.fsCC, on
                  'midi:raw') is NOT the remote: it steps while a soundLAB
                  window is visible too, provided its CC is not bound to the
                  remote (a bound CC is claimed before 'midi:raw').
js/pads.js        drum pads page ('pads', Keys group pill "Pads"; prefix pd-).
                  PLAY-ONLY since 2.0 Phase A, until Phase C rebuilds it as
                  rhythm practice: Record, Play loop, Click, Clear and the
                  drum-track picker went with the Studio sequencer. 8 velocity
                  pads on the default kit (drumKit() = DAW.createDrums(ctx)
                  -> ctx.destination, built on the first hit: the Woodshed's
                  wiring); touch + ZXCV/ASDF + MIDI while the page is open
                  (pads.mode 'roli' = WHITE-KEY layout C..B->7 lanes +
                  black=crash, any octave, from pads.base | 'gm' drum map;
                  tone-in notes never drum), Remap (pads.map); the page
                  claims the keybed (App.midi.claim 'pads'), a LUMI lights
                  the 8 mapped keys and flashes them on every hit (pads.leds).
                  Stores pads.mode / base / leds / map ONLY: never st.*,
                  pads.track or app.click.
js/daw/engine.js  SOUND LIBRARY: DRUM KIT (2.0 Phase A slimmed the 1.x studio
                  engine to this; the sampler + its IndexedDB, FX slots, WAV
                  export, the loop engine, song mode and DAW.engine are gone
                  and live on main). DAW.DRUM_LANES (8 lanes: kick, snare,
                  clap, hat, open hat, low tom, hi tom, crash) and
                  DAW.createDrums(ctx, params?) = the synthesized 808/909 kit
                  ported from OpenStudio (no params = default kit): output
                  (GainNode), noteOn(lane, vel, time), allNotesOff, update,
                  dispose. For Jam (its kits), the Woodshed and Pads. Needs
                  only its ctx: no App, no store, no bus. The path and the
                  global window.DAW stay until Phase C.
js/daw/synth.js   SOUND LIBRARY: SYNTH VOICES. MPE poly synth ported from the
                  OpenStudio DAW repo (Sampler-DAW src/audio/synth.ts): 2 osc
                  + noise + filter/amp envelopes, unison, glide, LFO, per-
                  channel bend/pressure/timbre. window.DAW.createSynth/
                  defaultSynth/SYNTH_PRESETS (never reorder or remove a
                  preset: the Woodshed and the guided performance player pick
                  SYNTH_PRESETS[2] by index) + DAW.guardPitched (createSynth
                  returns its instrument behind Scale Lock). The synth voice
                  of Piano (pn.voice), the Woodshed and the guided
                  performance player.
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
                  Both scripts copy index.html AND gear.html (2.0 Phase A3b)
                  into the bundled offline assets; no APK was built for it
                  and gear.html inside the WebView is untested (Phase I).
ios/              WKWebView wrapper (XcodeGen project.yml + Swift; needs a Mac
                  to build — the PWA is the primary iPad install).
                  sync-web.sh copies index.html, gear.html, the manifest and
                  css js icons fonts samples data (gear.html and data/ since
                  A3b; data/ was missing before)
releases/         built signed APK (committed; raw URL = download link)
tools/helix-bridge.js  Helix Stadium bridge for soundLAB Gear's Helix page,
                  js/helix.js (run
                  `node tools/helix-bridge.js [host]`; finds p35x1.local / mDNS)
tools/helix-defs.json  Stadium model + parameter id table the bridge serves
tools/artifact_build.py  stages the multi-file claude.ai artifact: soundLAB
                  only, never gear.html (see below)
version.json      auto-update feed (source of truth for latest version)
```

## soundLAB 2.0 Phase A ("Trim") — state on `v2`

Plan: `docs/plans/phase-a/PLAN.md` (five draft PRs into `v2`: A1 Studio /
sequencer / sampler / plug-in API out, A2 the three folds, A3a + A3b
`gear.html`, A4 storage prefix; its section 1 = the rules for every Phase A PR,
Appendix C = words that look like a cut feature and are not). State per step:
`docs/ROADMAP-2.0.md` "Phase A status". Phase A is NOT a release: never touch
`APP_VERSION`, `version.json`, `android/AndroidManifest.xml` or `releases/`; in
`sw.js` only the `CACHE` number, `ASSETS` and (A1) the fetch lookup. Today's
look, no new
components.

A1 (Studio space, sequencer/arranger, sampler, plug-in API removed):

- ONE PAGE SET (js/app.js): `PAGES` = the one flat page list, `HOME =
  PAGES[0]`, `GROUPS` = a plain array of tab groups, the last page is stored
  under `TAB_KEY`. Since A3b there is one such set PER APP and all four come
  from `APPS[APP_ID]`: soundLAB 14 pages / five groups / HOME 'quiz' /
  `app.tab`, soundLAB Gear 4 pages / two groups / HOME 'deck' / `gear.tab`
  (see A3b). Gone: SPACES, App.space,
  App.setSpace, the `space` event, #space-btn, #wipe, <html data-space>,
  #cx-rec, the pages 'arrange' / 'tracks' / 'song' / 'ideas', js/studio.js,
  js/arrange.js. SPACE_LABELS keeps its name (page labels).
- MOVED + resolvePage(name) (js/app.js; the first step of App.switchTo and of
  the boot start tab): an id that is not a page of this app (an old link, a
  stored tab) goes to `MOVED[id].to`, else HOME, and `MOVED[id].say` is shown
  with App.toast — never a blank panel, never saved as the last tab. A page
  that leaves BOTH apps gets its MOVED row in the same commit (the four
  Studio ids and A2's three are in). A3b added no row: deck, liveset,
  midihub and helix are pages of the OTHER app, and resolvePage's cross-app
  guard carries such an id across before MOVED is looked at (see A3b).
- A PAGE IS THREE THINGS changed in ONE commit: its id in its app's page
  list in APPS (+ groups), its `<section class="panel" id="panel-…">` and
  its `<script>` tag in that app's HTML file (index.html or gear.html; boot
  writes `Module "<id>" failed to load` into a panel that has no module). A
  deleted file leaves sw.js ASSETS in the same commit: install is
  cache.addAll, one missing file fails the whole install.
- SOUND LIBRARY: window.DAW is only js/daw/synth.js (createSynth,
  defaultSynth, SYNTH_PRESETS, guardPitched) + js/daw/engine.js (DRUM_LANES,
  createDrums), for Piano, Jam, the Woodshed, the guided performance player
  and Pads. No DAW.engine, sampler, FX, WAV export, loop or song mode.
- PADS IS PLAY-ONLY until Phase C rebuilds it as rhythm practice: eight pads
  by touch, Z X C V / A S D F and MIDI, both MIDI maps, Remap, key lights. No
  Record, Play loop, Click, Clear or drum-track picker (see js/pads.js above).
  The Woodshed lost "+ From Studio track" and the run-into-Ideas capture;
  `Woodshed.importTrack` stays (tests/remote-shed.test.js).
- #cx-met drives ONLY the metronome (`met:toggle`); transport owners are met,
  jam, keys, quiz, chart.
- REMOVED-FEATURE DATA IS NEVER WRITTEN OR DELETED (the live 1.x app shares the
  origin and still uses it): st.*, ideas.list, song.name, sd.*, plugins.list,
  app.space, app.tabStudio, app.click, pads.track have no reader and no
  writer; the IndexedDB 'guitarlab-daw' is never opened. Settings › Backup
  import skips those keys, writes string values only and says how many it
  skipped. Since A4 they are also never COPIED into the 2.0 store, the one
  list of them is App.store.deny (A1's `DEAD` regex in js/settings.js is
  gone) and the export is format 2 (see A4).
- NO PLUG-IN API: js/plugins.js, plugins/, PLUGINS.md and the Settings card
  are gone, nothing runs stored code. `App.addPage(id, label, sp, mod)` stays
  as an INTERNAL test hook (tests/remote.test.js; `sp` is ignored).
- sw.js: A1 set `CACHE` to 'soundlab2-v5' (A2 v6, A3a v7, A3b v8, A4 v9 =
  the number now; v4 is skipped on purpose). The fetch handler looks ONLY in
  its own cache
  (`caches.open(CACHE)` then `match(req, {ignoreSearch: true})`), never the
  global `caches.match`: the live worker's cache on the same origin can hold
  older copies of the same URLs (read from the code, not measured).
- Suites added to the one list in tests/run.sh: `trim` (browser: what is gone
  stays gone, stored Studio data is byte-identical after a visit to every
  page, a stale stored space/tab boots to Exercises and App.switchTo('arrange')
  lands there with the toast, the kept sounds play, the Backup skip) and
  `assets` (pure Node: index.html scripts + stylesheets <-> disk <-> sw.js
  ASSETS; since A3b gear.html too, see A3b; since A4 the storage check, see
  A4). Since A4 `trim` seeds the removed features' keys where a 1.x profile
  has them, in the 1.x store ('guitarlab.*'): they stay byte-identical
  there and none of them arrives in the 2.0 store.
- NEVER DELETE BY PREFIX: `st-` ids and classes are also the Synth tab's
  (js/synthtab.js, js/synthlive.js); "Studio" in Jam is a drum kit id
  (jam2.kit = 'studio'); `addPage` in js/synthdeck.js is the Deck's own.

A2 (the three folds: the Trainer page, the Synth pill, the LUMI pill):

- 18 PAGES AFTER A2: Learn (quiz, chords, theory, practiceplan) · Guitar
  (fretboard, tab, notation, helix) · Keys (piano, chart, pads) · Synth
  (deck, liveset, midihub) · Play (songs, jam) · Train (shed, tuner). (A3b
  moved helix and the Synth group to soundLAB Gear: 14 + 4.) The ids 'trainer',
  'synth' and 'lumipractice' are in js/app.js ONLY as MOVED rows: no PAGES
  entry, no label, no panel in index.html. No file was deleted or added:
  js/trainer.js, js/lumi-practice.js, css/lumi-practice.css and
  js/practice-router.js keep their paths, their tags in index.html and their
  sw.js ASSETS rows.
- THREE MOVED REDIRECTS: trainer -> 'practiceplan' ("The Trainer cards are on
  the Plan page now, under Free practice."), synth -> 'piano' ("Synth sounds
  are in the Sound picker on the Piano page."), lumipractice -> 'piano'
  ("LUMI practice is on the Piano page now, under the lessons.").
  App.switchTo(<old id>) or a stored app.tab lands there with the sentence;
  a stored group member (app.gtab.gkeys = 'synth', app.gtab.gprac =
  'trainer') falls back to the group's first page (Piano, Woodshed). No new
  store keys, no migration.
- SYNTH PILL = THE SOUND PICKER on Piano (js/piano.js): #pn-voice is labelled
  "Sound"; App.keys.setVoice(id) ('piano' or a DAW.SYNTH_PRESETS id; false
  for an unknown id). pn.voice is unchanged, pn.synthPreset = the last synth
  sound. The Learn bar's "Synth keyboard" entry (js/learn-instruments.js,
  `voice: 'synth'`) opens Piano and calls setVoice with pn.synthPreset
  (default 'saw'). `synth` as a Learn instrument CATEGORY id stays. Keys
  lessons are credited to the entry instrument, else to Piano, never to a
  page id. The entry instrument is set only by the 'learn:lesson' event (the
  Learn bar's "Keys scale lessons" entry, Exercises' "Open Keys lessons") or
  App.keysLessons.open(id, instrument) (a Plan block), and is cleared on
  leaving the Piano page or changing the Learn instrument. "Synth keyboard"
  sets none: a lesson started after it is credited to Piano.
- TRAINER = FREE PRACTICE on the Plan page: js/trainer.js is a card library,
  App.trainerCards = {mount, show, hide, key, remote}. js/practiceplan.js
  appends <details class="pp-tools" id="pp-tools"> AFTER .pp-wrap, mounts
  the cards into #pp-tools-body and forwards show / hide / key / remote.
  Cards: session log, random prompts, one-minute chord changes; ids keep
  tr-, stores tr.sessions / tr.ccA / tr.ccB / tr.best.<A>-<B>. The interval
  ear trainer is GONE: #tr-ear-go opens Exercises › Intervals › All
  intervals › Ear (SLQuiz.start('intervals/iall/ear/1')) and says why when
  the selected Learn instrument has no ear mode (Drums). tr.earBest /
  tr.earHarm are never read, written or turned into Exercises records
  (xp.js forbids seeding history). Remote on the Plan page: the cards are
  asked first (NEXT counts a change during a run and answers "Time's up" for
  1.5 s after it; STOP cancels the run, else pauses the timer; BACK is HELD
  during a run, answering "Chord changes running", because the plan's BACK
  is "Again: <block>", which leaves the page and cancels the run; with no
  run BACK is false), then the plan's own blocks. Folding the section
  cancels a run, so a hidden run never takes the pedal or Space.
- LUMI PILL = A SECTION under the Keys lessons: <details id="pn-lumi">
  ("Notes and triads on the LUMI", closed by default, body #pn-lumi-body),
  driven through App.lumiPractice = {init, show, hide, close, stop, remote,
  remoteKey, open, running}. OPEN = OWNER, ONE OWNER AT A TIME: opening the
  section or starting a session stops a lesson run (App.keysLessons.halt(),
  which keeps the entry instrument) and the runner (App.keys.stopRunner);
  a lesson starting, a lesson opened from a Plan block or the Exercises
  Progress tab (App.keysLessons.open(id)) or from the Learn bar (the
  'learn:lesson' event; both go through keylessons releaseRunner), and the
  runner starting call App.lumiPractice.close(msg) (fold + stop + disarm).
  While it is open the section ALONE answers the pedal (piano.js onRemote:
  no fall-through to the lessons or the runner), the lessons' lowest-key
  double-tap stands down (a touch double-tap on the lesson card still starts
  a lesson, which closes the section), and with remote.dbl in simulated mode
  the lowest key is reserved (the Piano module's remoteKey). Closed, nothing
  changes for lessons, runner, pedal or double-tap. NEVER add a state in
  which the section is open while a lesson run or the runner is active.
  Guard every call across these modules (`if (App.lumiPractice) …`,
  `App.keysLessons && App.keysLessons.halt`): tests/lumi-practice.test.js
  loads the file alone into a mock App. css/lumi-practice.css is scoped to
  #pn-lumi; the focus mode html.kl-running hides the section.
- TEXTS name the new places: the Settings hands-free list, the help welcome
  and the Piano / Plan tours in js/help.js (the 'trainer' tour is gone), the
  js/midi.js status "Choose a LUMI display output on the Piano page, under
  Notes and triads on the LUMI".
- sw.js: A2 set `CACHE` to 'soundlab2-v6'; ASSETS unchanged.
- No new suite. `trim` also checks the three redirects, that no pill reads
  Trainer, Synth or LUMI, and #tr-ear-go (Piano and Drums); the fold checks
  are in nav, smoke, context-global, keys, learn-instruments, practiceplan,
  remote-keys, remote-runners, remote-plan, lumi-practice, display-master.
- NOT THE TRAINER (PLAN.md Appendix C): the metronome's tempo trainer
  (met.trainer) and the Circle page's degree ear quiz are other features.
  DEFERRED, do not build in Phase A (PLAN.md section 9): one merged sound
  list (piano tones + synths), LUMI targets as lesson types, the chord
  changes as a real Exercises drill, a home for the LUMI display-output
  choice in Lights & help.

A3a (the main app stops depending on the Hub; a refactor: every page, its
controls and what it sends are as before):

- END STATE: NOTHING OUTSIDE THE SEVEN GEAR FILES (js/midihub.js,
  js/synthtab.js, js/synthlive.js, js/synthdeck.js, js/synthdeck-maps.js,
  js/synthdeck-scope.js, js/helix.js) calls into js/midihub.js, or names
  SLMidiHub, SLSynthTab / Live / Deck / Scope, SLHelix or App.synthDeck (the
  grep in PLAN.md 6.8 has no hits). Keep it so: it is what made A3b a move
  instead of a rewrite, and soundLAB now runs without those files. At A3a
  everything still loaded in index.html, the 18 pages were unchanged and
  "Play on synth" still opened the Hub's Player view; A3b ended all three.
- THREE PIECES OF THE HUB ARE SHARED (layout entries above): the Player =
  js/scoreplayer.js, window.SLScorePlayer {mount(el, opts), paint(),
  loadFile, loadScore, play, pause, stop, seek, shiftNote, openAsTab,
  toMidiBytes, key, state, scoreToMidi, show()}, opts {show, ports, noOut,
  connect}; the rule engine + the input-filter install = js/midirules.js,
  App.midiRules {apply(bytes, port), install(), active()} + the
  'midirules:state' event; "which output is the synth" = App.midi.synthOut
  {id(), name(), has(), set(v)} in js/midi.js. The Hub uses all three like
  any other page: applyRules / installFilter / hubOutId / hubOutName / hasOut
  are one-line delegates, and SLMidiHub.player / SLMidiHub.scoreToMidi are
  aliases of SLScorePlayer / SLScorePlayer.scoreToMidi.
- CODE WAS MOVED, NOT REWRITTEN: the Player's ids stay mh-pl*, every store
  key stays (midihub.outId, midihub.ch, midihub.profile, midihub.pl*,
  midihub.rules, midihub.rulesIn), no migration. The Rules editor, Learn,
  decode, Thru and the key splits stay in js/midihub.js.
- THE PLAYER'S REPAINT PATH: the card is mounted at boot, before MIDI is
  ready, and it names the synth output and the Hub's Part. Two things keep
  that current: the Hub's paintCvOut calls SLScorePlayer.paint() (ports
  changed, Hub shown, Part or profile changed), and the module calls paint()
  itself on 'midi:state' and 'lights'. A new host must call paint() whenever
  something the card names changes. ONE mount per document (the Hub's
  #mh-player, which render() remounts on Import / Reset Hub; since A3b that
  is Gear's, and soundLAB's one mount is the Songs page's #sg-player, which
  calls paint() on show).
- THE INPUT FILTER FOLLOWS THE STORE: App.midiRules.install() runs at load,
  when the tab becomes visible again and on a 'storage' event for
  midihub.rulesIn (the box ticked in another window; since A4 the key must
  be this scope's, App.store.prefix + 'midihub.rulesIn', see A4: A3a
  matched it by suffix). The filter slot is null
  while the box is off: never install a filter that is always on. The Hub's
  box (#mh-rulesin) listens to 'midirules:state', so it shows what this
  window has installed and one click switches it off again.
- SONGS "Open a score" (js/songs.js) calls SLScorePlayer only; its missing-
  module text is "The score player is not loaded".
- ON SCREEN, THE TWO PLANNED DIFFERENCES: the Player's messages ("Ready:",
  "Finished:", "No synth output ...") show in the app-wide #app-toast, not in
  the Hub's #mh-toast, and the "Play on synth" tooltip on Songs no longer
  names the Hub. At 900 px and below the two toasts sit at the same place,
  so the Hub's toast() hides #app-toast first while the Hub page is on screen
  (one message at a time there, as before; never off the Hub page, where the
  Deck and Live pages call into the Hub and its toast is not shown). The
  other order needs nothing: #app-toast is drawn above #mh-toast. The Player
  card itself is pixel-identical (same markup, boxes and computed styles at
  1200 and 390 px, checked against the pre-A3a tree).
- index.html: js/midirules.js right after js/remote.js, js/scoreplayer.js
  right before js/midihub.js (since A3b: after js/pads.js there, and before
  js/midihub.js in gear.html). sw.js: A3a set `CACHE` to 'soundlab2-v7';
  ASSETS gained the two files.
- No new suite. `midihub` also checks App.midiRules.apply against
  SLMidiHub.applyRules, the 'storage' install (and the Hub's box following
  it), the one-message-at-a-time toast rule, App.midi.synthOut, and that
  Reset Hub (render() again = a second mount) leaves ONE Player card wired
  once (one click = one action);
  `oneopen` waits on SLScorePlayer and checks the per-mount options on a
  card mounted with ports / noOut / connect (the ports row is not on screen
  before MIDI is ready, the two texts that name the host, MIDI connected
  after boot; since A3b that card is the Songs page's own mount);
  `midihub-player` runs unchanged through the aliases. It is
  NOT the proof of the repaint path: its fake MIDI is ready before boot and
  its Part check clicks the Channels switch, which repaints the card itself.
  `midihub` proves it: #mh-plpartlab follows a Part button and #mh-plout the
  header's Synth out select (the Hub's hook), and with SLScorePlayer.paint
  stubbed the card still repaints on 'midi:state' and on 'lights' (the
  module's own listeners).
- LANDING feat/review-to-synth LATER: that branch calls SLMidiHub.player and
  SLMidiHub.scoreToMidi from Score review. It must call SLScorePlayer and
  SLScorePlayer.scoreToMidi instead: after A3b the Hub is not loaded in
  soundLAB, so the aliases do not exist there.

A3b (soundLAB Gear: the Deck, Live sets, the Hub and Helix leave index.html;
today's look and behaviour on both sides):

- TWO APPS FROM ONE CODEBASE, ONE STORE: index.html = soundLAB, 14 pages in
  five groups: Learn (quiz, chords, theory, practiceplan) · Guitar
  (fretboard, tab, notation) · Keys (piano, chart, pads) · Play (songs, jam)
  · Train (shed, tuner), plus the Settings overlay. gear.html = soundLAB
  Gear, 4 pages in two groups: Synth (deck, liveset, midihub; pills Deck |
  Live | Hub) · Helix (helix; one page, so no pill strip); HOME = the Deck;
  no Settings. Both have the context bar, the metronome sheet and the Lights
  & help sheet. js/app.js `APPS` holds both sets; `APP_ID` comes from
  `<html data-app="gear">` (or window.SL_APP, which also sets the attribute:
  the css keys on it); `App.app` = 'main' | 'gear'. SPACE_LABELS / SUB_LABELS
  stay one table for both. index.html loads NONE of the seven gear files;
  gear.html loads the 18 scripts listed at its layout entry and nothing of
  soundLAB's own (no SLQuiz, Woodshed, App.keys, App.keysLessons, SLXP,
  App.songs, js/settings.js). Keep in gear.html: note-palette before app,
  synthdeck-maps before synthdeck, synthdeck before App.boot(); deck,
  liveset and midihub must share one document.
- THE SHELL MARKUP EXISTS TWICE until Phase B builds it from JavaScript:
  gear.html's block from <body> to <main> is index.html's with `<span
  class="tag">gear</span>`. Change both files in the same commit;
  tests/assets.test.js compares head, shell, footer and the inline boot
  script.
- THE WAY ACROSS: `<a class="btn sm" id="app-switch">`, first in .tb-tools
  in both files, filled by boot: "Gear" -> gear.html in soundLAB, "soundLAB"
  -> index.html in Gear (title + aria-label "Open <name>"). A real link, so
  it also opens in a second window for side-by-side use; hidden when
  window.SL_ARTIFACT. css/style.css: `a.btn { text-decoration: none }`, the
  #app-switch rules (inline-flex; :empty and [hidden] = display none) and a
  phone rule under `html[data-app="gear"]` (<= 420 px: the longer word set
  tighter so the header stays on one row).
- CROSS-APP GUARD (resolvePage -> otherApp -> goApp): an id that belongs to
  the OTHER app (appOf: one of its pages; 'settings' counts as a soundLAB
  page; an old MOVED id whose target is over there) is never shown here:
  goApp(owner, id) sets location.href = <url>#<id>, resolvePage returns null
  and switchTo returns. So App.switchTo('midihub') in soundLAB leaves for
  gear.html#midihub, and in Gear App.switchTo('settings'), the gear icon
  (title "Settings (in soundLAB)") and the Lights sheet's two Settings links
  leave for index.html#settings. Never call App.switchTo with an id of the
  other app unless leaving the document is what you want (in a suite it
  destroys the test page). In the claude.ai preview goApp only toasts
  "<name> is not part of this preview."
- #PAGE (hashPage: [a-z][a-z0-9_-]*): AT BOOT a page of the other app ->
  location.replace(<url>#<page>) at the very top of boot(), before anything
  initialises; a page of this app or an old MOVED id = the start tab (it
  wins over the stored tab); #settings (soundLAB) opens Settings after the
  start tab, so the gear toggles back to it. A hash that was used is cleared
  (wireBack's history.replaceState gets the clean URL); any other hash is
  left in the address, unused. WHILE THE APP IS OPEN wireHash does the same
  on 'hashchange' (across: location.replace; here: clean the address, then
  switchTo). The popstate handler ignores an entry without our state ({sl}):
  a typed #page makes such an entry and is not a Back press. #back-hint
  names the app ("Press Back again to leave soundLAB Gear.").
- MOVED IDS IN GEAR: an old id whose target is a soundLAB page travels AS
  THE OLD ID (index.html#trainer / #synth / #lumipractice), so soundLAB says
  the sentence where the user lands. The four Studio ids have no target:
  Gear says the sentence and opens the Deck. There are no MOVED rows for
  deck, liveset, midihub or helix.
- STORED STATE, new keys: `gear.tab` = Gear's last page (`app.tab` stays
  soundLAB's; neither app writes the other's), `gear.told`, `gear.thruTold`
  = the two one-time notices, both soundLAB only. A STORED tab of the other
  app never navigates: boot tests otherApp before resolvePage and falls back
  to HOME; soundLAB then says once (gear.told) "Deck, Live sets, the MIDI
  Hub and Helix are in soundLAB Gear now: the Gear button at the top." With
  midihub.thru stored true it says once (gear.thruTold) "MIDI Hub Thru runs
  in soundLAB Gear now. Keep Gear open in a second window to pass your
  keyboard to the synth while you practise." Both go through App.toast,
  joined with each other and with a MOVED sentence just said, and stay up
  longer (5 s + 4 s per notice). app.gtab.gsynth is read by Gear (the group
  id is kept); app.gtab.ginst = 'helix' falls back to Neck. Everything else
  (midi.*, lights.*, remote.*, midihub.*, synthtab.*, hx.*, key, scale,
  tempo, theme, audio.*) is shared: a second window sees a change on its
  next read. TWO 'storage' listeners exist: js/midirules.js
  (midihub.rulesIn) and js/audioin.js (audio.monitor). No migration. (A4:
  both apps use the SAME prefix at one address, so all of this holds under
  'soundlab2.*'; each listener takes only its key with that prefix.)
- THE PLAYER IS IN BOTH APPS (js/scoreplayer.js, one mount per document):
  soundLAB = the Songs page, #sg-player under "Open a score" (js/songs.js
  entry above); Gear = the Hub's Player view, as before, without "Open as
  tab" ("Open as tab is on the Songs page in soundLAB.").
- THRU RUNS ONLY WHILE GEAR IS OPEN: Hub Thru and the key splits forward
  from the Hub's document. Said next to the Thru box, in the Hub tour and
  once in soundLAB (gear.thruTold). Rules on INPUT still shape soundLAB
  (js/midirules.js is loaded there; Settings shows #set-midi-rules). The
  practice route (js/practice-router.js) still refuses to start while
  midihub.thru is stored on ("Turn MIDI Hub Thru off in soundLAB Gear and
  release all keys/pedal before starting this route."). The two can no
  longer see each other while running (the Hub's App.practiceRouter.active
  test finds no route in Gear), and do not need to: the route stops when its
  window loses focus or is hidden, so it is over before the Thru box in a
  Gear window can be ticked. Thru without Gear open and one routing owner
  across windows are Phase E/F.
- SETTINGS EXISTS ONLY IN SOUNDLAB (js/settings.js needs the Keys page).
  Gear's gear icon opens index.html#settings; every Gear page has its own
  Connect and port pickers; the one Settings switch Gear needs, Hear input,
  is on its Hub page (#mh-hearin). Texts in Gear that say "Settings › MIDI"
  still lead somewhere for that reason.
- NO APP VOICE IN GEAR: the Hub's App voice box is hidden, app.js registers
  no "tap to turn on sound" hint on midi:note and prefetches no guitar
  samples, the remote shows no sound hint, help.js shows no welcome. The
  first-gesture audio warm-up stays (the metronome and Hear input need the
  AudioContext).
- NOTHING NEW CONNECTS OR SENDS AT BOOT: the Hub and Helix build their DOM
  only; the Deck (Gear's home) reconnects MIDI silently only for a returning
  user (midi.wanted / a granted permission) and still sends nothing by
  opening a page; the Deck's one send funnel with its LUMI guard and "Thru
  never forwards to a LUMI-named output" are unchanged.
- TWO-WINDOW RULES (Web Locks, nothing stored; details at the js/remote.js
  and js/audioin.js entries): (1) ONE WINDOW ACTS ON A PEDAL: lock
  'soundlab-remote-main'; both apps claim a bound message, soundLAB acts
  while one of its windows is visible (focused or not), Gear only when none
  is; without Web Locks Gear acts only while focused. With both visible the
  remote cannot step Live sets: use the Live page's own foot switch
  (synthtab.fsCC) with a CC that is not bound to the remote. (2) ONE WINDOW
  PLAYS HEAR INPUT: lock 'soundlab-hear-input'; the first window opened has
  it, On or Off pressed in another window moves it there, a waiting window
  takes over when the owner closes; the other window holds with why 'other'.
  NOT SETTLED (Phase E/F): two open windows both paint the LUMI and both
  receive the keyboard.
- ONE WORKER, ONE MANIFEST: gear.html registers the same sw.js and links
  the same manifest.webmanifest (no `shortcuts` entry, no separate install:
  Phase H). sw.js: A3b set `CACHE` to 'soundlab2-v8'; ASSETS gained
  'gear.html'; the
  gear js files and data/ stay listed (one worker serves both pages). Both
  Pages workflows publish the whole tree, so gear.html needs no workflow
  edit. android/build.sh, android/build.ps1 and ios/sync-web.sh copy
  gear.html too; no native build was run.
- FIXES THAT CAME ALONG: a Deck preset's key restore writes fb.* to the
  store before it emits (js/synthdeck.js applyApp); the App voice controls
  are hidden where there is no app voice (js/midihub.js); Go live really
  holds the wake tag 'synthlive' (js/synthlive.js); the Helix page no longer
  scrolls sideways on a phone (#hx-fsmode wraps, js/helix.js: the `gear`
  suite's phone check found it); the Deck's Now bar takes the factory sound
  names when they arrive after the page is up ('deck:factorynames',
  js/synthdeck.js -> js/synthtab.js: Gear opens on the Deck, so the names
  file is still loading at the first paint; `synthtab` failed on it under
  load). KNOWN AND LEFT (same on main): a port
  select with a long name (#mh-out on the Hub, #set-midi-out in Settings; a
  Bluetooth LUMI) is 3 px wider than a 360 px screen; the Player card's
  From / To key selects show while "Change key" is unticked and the Hub's
  Connect MIDI button shows while connected (`.row`'s display:flex beats the
  hidden attribute).
- SUITES: tests/env.js exports GEAR_URL (SL_GEAR_URL, else gear.html beside
  SL_URL's index.html; plain string work, never `new URL()`: three suites
  shadow the global URL). ON GEAR.HTML: midihub, midihub-wheel,
  midihub-lock, midihub-player, synthdeck, synthdeck-scope, synthtab,
  synthconn, synthconnect, helix (boot wait `App.active === 'deck'`;
  "another page" is a Gear page; a suite that emits fb:set by hand writes
  fb.* first, there is no Fretboard to do it). NEW, in the one list in
  tests/run.sh: `gear` (boots on the Deck with no error and no 404, exactly
  the four panels, tabs Synth | Helix, none of soundLAB's modules, no MIDI
  prompt and no byte at boot, the Hub's Hear input switch / Thru hint /
  input picker / Player without "Open as tab", the Deck's Now bar with a
  late names file, the Deck's key restore, Go
  live's wake tag, #app-switch and #page both ways, app.tab and gear.tab
  kept apart, phone width, the context-bar matrix of the four pages, Hear
  input with both apps open (one window plays, On moves it, Off in either
  stops both and also frees an input soundLAB's Settings meter held, the
  owner closing hands over), the one toast that names the Hub page) and
  `remote-gear` (the Live sets and Deck halves of remote-runners, moved as
  they were, plus the two-window pedal cases: both visible, soundLAB hidden,
  no Web Locks; it sets each page's visibility and focus itself). CHANGED on
  index.html: remote-runners (runner, Songs, Plan cards only), remote (a
  bound CC fires without the focus; holdsMain follows visibility), oneopen
  (the Songs mount of the Player), nav (five tabs), context-global (14
  pages), multiin (the Hub picker moved to `gear`), trim (the six gear
  globals are undefined, stored Hub rules still shape the Piano page and
  show #set-midi-rules, stored app.tab = a Gear page boots to Exercises
  with the notice, App.switchTo('midihub') leaves for gear.html#midihub),
  smoke (a Gear pass over its four pages) and assets (both HTML files <->
  disk <-> ASSETS, no gear module in index.html, the shell comparison).
- NOT CHECKED ON HARDWARE (the owner's Windows PC with the LUMI and the
  MODX; list in docs/CONTROLLER-REMOTE.md "Two windows"): Gear in a second
  window keeps receiving and sending MIDI while soundLAB is open; one pedal
  press with both visible moves the lesson on and leaves the MODX
  Performance alone; with soundLAB minimised the pedal steps the Live set;
  a MODX heard through Hear input sounds once and keeps sounding when the
  window that played it closes. Also untested: gear.html inside the Android
  WebView and the iOS bundle (Phase I).
- DEFERRED, do not build in Phase A (PLAN.md section 9): the shell built
  once from JavaScript (B); Hub Thru and key splits without Gear open, one
  lighting owner across both windows, handing the pedal to Gear while
  soundLAB is visible (E/F); the final home of the Player (G); the Gear
  design, Gear as its own installable app, Settings inside Gear, whether
  Gear keeps the metronome and the context bar (H); gear.html in the
  release probe, the claude.ai artifact and the native bundles (I).

A4 (storage: 2.0 has its own prefix and copies the 1.x data across once;
nothing on screen changes except the Backup card and one start notice):

- THE "READ FIRST" PARAGRAPH AT THE TOP IS OUT OF DATE ON THIS POINT: it
  still says beta + live share `localStorage` and that the prefix "comes in
  Phase A". It is left alone on purpose (PR #98 rewrites that paragraph);
  this block is what is true. The cache caveat there still holds.
- ONE PREFIX PER ADDRESS (js/app.js, App.store.prefix): 'soundlab2-next.'
  when the path ends in /next/<file> (the beta: /GuitarPak/next/,
  /next/index.html, /next/gear.html), 'soundlab2.' everywhere else (the
  live address, the test server, file://, the claude.ai artifact).
  'soundlab2-next.' does not start with 'soundlab2.', so a listing of the
  live scope never picks up beta keys. Key NAMES are unchanged (fb.root,
  met.bpm, kl.prog, ...): every store key named in this file lives under
  that prefix. soundLAB and soundLAB Gear use the SAME prefix at one
  address, so they are still one store (A3b), and the copy runs whichever
  page is opened first. The beta and the live app no longer share settings
  or progress: practice done in the beta does not flow into the live app,
  and the live address copies the then-current 1.x data when 2.0 is
  released there (Phase I).
- 'guitarlab.*' IS THE 1.X STORE, READ-ONLY FOR 2.0: no 2.0 code writes,
  removes or changes a 'guitarlab.*' key (removed feature or not), and none
  opens or deletes the IndexedDB 'guitarlab-daw'. The live 1.x app on the
  same origin still uses both. Deleting them is an explicit Settings action
  in a release after 2.0, never a side effect.
- EVERYTHING GOES THROUGH App.store: no file but js/app.js calls
  localStorage, and no file spells a storage prefix to build a key. Raw
  strings = App.store.raw(key) / setRaw(key, raw), a key listing =
  App.store.keys(), the 1.x prefix = App.store.legacy, "is this a removed
  feature's key" = App.store.deny.test(key), all with the key WITHOUT its
  prefix. The two exceptions, both for reading a file or an event, never
  for a write: the Backup card in js/settings.js names the two 2.0
  prefixes to read a backup file, and the two 'storage' listeners compare
  with App.store.prefix + '<key>'. A new store key needs nothing: it lives
  under the prefix by itself and is copied, exported and imported like any
  other.
- THE ONE-TIME COPY (importOnce in js/app.js; the full contract is at the
  js/app.js layout entry): once per scope, synchronously where the store is
  defined, marker 'store.imported' {v, from, at, copied, skipped, failed,
  kept}, copy-only, never over an existing key; source 'guitarlab.' (on the
  beta 'soundlab2.' once the live scope has its own marker). Order: small
  values (<= 4,096 characters) first, then large progress, then large
  libraries, then any other large value. Headroom: 200,000 characters stay
  free, kept by undoing this run's own lowest-priority copies. Keys that
  did not fit are in `failed` and are tried again at every start; a key 2.0
  wrote itself meanwhile moves to `kept` and is never overwritten. While
  `failed` is not empty both apps say so at every start (App.toast, 8 s)
  and Settings › Backup names the keys. A DEFAULT IS NOT "2.0's OWN DATA":
  a page that fills an EMPTY key with a default (the Charts page's blank
  first chart, the Plan page's starter student and today's empty session)
  asks App.store.waiting(key) first and does not store the default while
  the key still waits; otherwise the next start would move the key to
  `kept`, the retry and the notice would stop and the user's 1.x charts or
  plan would stay behind without a word. A new page that stores a default
  under a key a 1.x profile can hold does the same. Not covered: Jam saves
  its whole state on any change, so a change made in Jam while
  jam2.sections waits stores the default song there (a user action; the
  Settings line then names the key and Copy again brings the 1.x song
  back). NEVER: move the call into boot() or
  after another script; key it on a version number; let it overwrite; let
  it delete or "tidy" the source; write the marker before the copy; add a
  second migration beside it.
- THE DENY LIST (STORE_DENY = App.store.deny) IS THE ONE LIST OF REMOVED
  FEATURES' KEYS: st.*, ideas.*, song.*, sd.*, plugins.*, app.space,
  app.tabStudio, app.click, pads.track, app.gtab.gstudio / gsketch / gpl-*,
  tr.earBest, tr.earHarm. The copy and the Backup import both read it.
  Everything else is copied, on purpose: tr.sessions / tr.ccA / tr.ccB /
  tr.best.*, pn.synthPreset, midihub.*, synthtab.*, hx.*, the read-only
  history (xp.*, ws.xp, ws.streak), remote.*, gear.*, and the five
  migration markers (fb.migr24, midi.allIn.v1, midi.voiceAuto, lights.v1,
  jam2.migr): without them the fret count, the MIDI input and the voice
  mode would be reset by a 1.x migration running again. A large key (more
  than 4,096 characters) that is progress or a library belongs in
  STORE_PROGRESS or STORE_LIBS, or it is copied last and undone first
  (lesson.* of js/xp.js is in STORE_PROGRESS for that reason; the plan's
  list did not have it).
- 'storage' EVENTS: js/midirules.js (midihub.rulesIn) and js/audioin.js
  (audio.monitor) take a key only when it is App.store.prefix + that name
  (or null = the store was cleared). A3a / A3b matched by suffix; with
  three prefixes on one origin that would react to the live 1.x app's or
  the beta's switch. A new 'storage' listener matches the same way.
- BACKUP (js/settings.js, layout entry above): the EXPORT is format 2,
  {app: 'soundLAB', format: 2, from: <app version>, scope: <prefix>, keys:
  {'<prefix><key>': raw string}} with this scope's keys only and without
  the marker. The IMPORT reads format 2 files of either 2.0 scope and old
  1.x files (it goes by each key's prefix: 'soundlab2.', 'soundlab2-next.'
  or 'guitarlab.'; a 1.x file has no format field), writes every key under
  THIS scope, string values only, skips the deny list and
  reports "N settings restored, M from removed features skipped". It never
  writes a 'guitarlab.' key. #set-backup-info shows what the copy did
  (copied / did not fit / left alone); #set-copy-again = "Copy my 1.x data
  again" (beta: "Copy from the live app again"), two taps within 3 s, no
  confirm(), then App.store.copyAgain() (overwrites 2.0's values) and a
  reload. The other export files carry no prefix and are unchanged (the
  Hub, the Deck library, Live profiles, chord charts, practice progress).
- sw.js: A4 set `CACHE` to 'soundlab2-v9'; ASSETS unchanged (no file added
  or removed). Cache names ('soundlab2-v9') and storage keys
  ('soundlab2.fb.root') only look alike.
- SUITES: every browser suite seeds and reads back 'soundlab2.*' (index.html
  and gear.html on the test server are the live scope). Seed under the 2.0
  prefix BEFORE the app starts (the copy never overwrites, so such a seed
  survives); do not seed 'guitarlab.*' and lean on the copy: read-backs and
  mid-test writes would hit keys the app no longer reads, and the suite
  passes while testing nothing. NEW, in the one list in tests/run.sh:
  `storage-import` (a fresh browser context per case: an empty browser; a
  1.x profile copied byte for byte with the removed features' keys left
  out and a stored plug-in never run; the migration markers; the 1.x store
  untouched after a start, a key and tempo change, a visit to every page
  and a reload, with no 'guitarlab.*' setItem / removeItem and no
  indexedDB.open; runs once; never overwrites; the beta scope served under
  /next/; refused writes and a full store incl. the copy order, headroom,
  retry, `kept`, the start notice, a page's default under a key that still
  waits, and a fully blocked store; Backup format 2, a 1.x
  file, a beta file on live, Copy again; gear.html opened first). `assets`
  gained the STATIC CHECK: the old prefix is spelled ('guitarlab + dot' at
  the start of a string, or in a regular expression) on ONE line of code
  in js/, the STORE_LEGACY line of js/app.js, and in tests/ only by the
  suites on its OLD_STORE_SUITES list (`storage-import`, and `trim` for the
  removed features' 1.x keys and its 1.x backup file). A new suite that
  needs the 1.x store goes on that list with its reason.
- OTHER ORIGINS (read from the code, not run): the claude.ai artifact and
  a file:// copy have their own localStorage; the same code copies that
  origin's 'guitarlab.*' at the first 2.0 start. The Android app loads the
  live address, so its copy happens there at the flip, without a new APK.
- NOT SOLVED IN PHASE A: localStorage has ONE budget per origin and nothing
  here frees space ('guitarlab.*' is never deleted, the live 1.x app keeps
  writing it). An origin that is already full keeps an incomplete copy
  until the user frees space; the 1.x data is untouched throughout and the
  notice and the Settings line say so. After the flip the origin holds
  three copies of the kept data (1.x, beta, live). The sizes of a real 1.x
  profile were NOT measured: on the owner's profile note the total size of
  'guitarlab.*' once (DevTools › Application).
- DEFERRED, do not build in Phase A (PLAN.md section 9): whether the live
  copy may offer to remove the beta scope's data ('soundlab2-next.*') when
  the origin is short of room, service-worker cache names by scope and the
  removal of 'guitarlab-*' caches on the live scope (I); a Settings action
  that deletes 'guitarlab.*' and the 'guitarlab-daw' database (after 2.0).

## Cross-module conventions

- SECTION TAB BAR (v0.70.0; app.js GROUPS + populateNav): the main nav is a
  tab bar of GROUPS (icon + label), not a drop-down. GROUPS =
  APPS[APP_ID].groups since 2.0 Phase A3b. soundLAB (index.html): Learn
  (quiz=Exercises HOME/chords/theory/practiceplan), Guitar
  (fretboard/tab/notation), Keys (piano/chart/pads), Play (songs/jam), Train
  (shed/tuner; 1.3: the Practice tab became Train). soundLAB Gear
  (gear.html): Synth (deck=HOME/liveset/midihub; 1.3's SYNTH tab), Helix
  (helix).
  Rendered twice: #tabbar inside the top bar (> 900px) and #tabbar-m fixed
  along the bottom (<= 900px) — #tabbar-m sits OUTSIDE <header> because the
  header's backdrop-filter / auto-hide transform would trap a fixed child.
  Tapping the open tab scrolls to top. Members show as the pill strip
  (#subnav, .subtab); single-page groups hide it; each group remembers its
  last member (app.gtab.<gid>). NAVIGATION ONLY — page ids unchanged, so
  App.switchTo(pageId) and every bus cross-link still work inside one app;
  App.switchTo with an id of the OTHER app leaves the document for it
  (location.href = <its url>#<id>; Phase A section, A3b), and bus events
  never cross.
  App.addPage(id, label, sp, mod) = an INTERNAL test hook (tests/remote.test.js
  builds its test page with it; `sp` is ignored): the page gets its own
  gpl-<id> group (icon 'plus').
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
  ['metronome', 'lights', 'settings'] so they still init (soundLAB Gear has
  both sheets and no panel-settings: the init loop skips a panel that is not
  in the document). Bottom sheet on phones.
- QUIET CHROME (v0.69.1): the whole .topbar (nav + context bar + pill strip)
  auto-hides while the window scrolls DOWN and returns on any scroll up / at
  the top (app.js wireAutoHideBar; .bar-hidden; App.showBar() forces it back
  — help tours call it). There is no NO_CTX list any more (1.0): the context
  bar belongs to every page, Exercises and Settings included (paintChrome only
  clears the old html.noctx class). Show a control only when it does something
  (e.g. Keys: +Bass/Strum only with Triads/7ths, arp rate/dir/oct/Hold only
  with Arp on — paintPerf toggles `hidden`, scoped `#pn-perf [hidden]`).
- BACK (v0.72.0; app.js wireBack/backStep): Android Back (MainActivity
  goBack) and browser Back walk back through the app: help tour, sheet,
  settings, module.onBack() (return true when handled — quiz: run -> path,
  node card, tab), the page stack (cleared on reaching the home page),
  the home page (HOME). One {sl:'top'} history guard is re-pushed after each
  handled Back; at the very start it stays down, #back-hint says the next
  Back leaves (it names the app: soundLAB / soundLAB Gear), and any
  pointerdown re-arms it. Pages with sub-views should implement onBack.
  A popstate WITHOUT our state ({sl}) is not a Back press: a #page typed
  into the address makes such an entry, and wireHash handles it (A3b).
- Context bar (#ctxbar in index.html and gear.html, wired in app.js): the
  single home for key/scale/mode/BPM/time signature. Since v0.78.0 it is a
  DROPDOWN behind the
  treble-clef header button #ctx-btn (Tabler icon, beside lights + metronome):
  html.ctx-open shows it; a tap outside, the clef again, Esc, Back, a page
  switch or the bar auto-hiding tuck it away (app.js setCtx/closeCtx,
  App.ctx(on)); the button's title/aria-label names the key + BPM; the clef
  is on every page and only disabled while a sheet, a help tour or a modal
  dialog is open (contextBlocked / syncContextAvailability). Its
  two toggles (v0.82.0): LED SCALE (#cx-led -> App.midi.setLedMode; midi.js
  ledMode() lights.led 'auto' = lights.on + Help level, 'scale' = the keybed
  always shows the selected scale (Display aid off, guides white on top),
  'off' = dark incl. a LUMI (night mode, no lumiNative); the Lights & help
  sheet's On/Off resets to 'auto') and SCALE LOCK (#cx-lock -> App.scaleLock
  {on, active, set, allows(midi), contains(midi)}, store scale.lock,
  'scale:lock' event): GLOBAL since 1.0 — no page pauses it (there is no
  LOCK_FREE list; active === on). Out-of-scale note-ONs never sound: midi.js
  dispatch marks them blocked + mute:true (midi:note still fires, so graders
  and visuals see the raw note); musical MIDI output, the Hub's thru, the Keys
  page touch/QWERTY, fretboard taps, Jam and the synth voices
  (DAW.guardPitched) drop them (note-offs always pass); the Hub checks it
  AFTER its rules; drums, clicks and recorded/live audio are outside it; a
  key or scale change while it is on, or switching it, emits 'scale:boundary'
  (sounding voices stop); html.scale-locked dims the unplayable on-screen
  keys. The bar reads the
  shared stores (fb.root/fb.scale/fb.mode, met.bpm, met.sig) and pushes changes
  over the bus; pages must NOT grow their own duplicate selects for these.
  WRITE THE STORE FIRST, THEN EMIT fb:set (the bar's pushMusic, the Deck's
  applyApp): soundLAB Gear loads no Fretboard to write fb.* when it hears
  the event, and everything that follows it reads the key from the store.
  Also hosts #cx-met (the metronome's start/stop).
- Settings is an OVERLAY page outside PAGES, in soundLAB ONLY: opened by
  #settings-btn (gear, header, on every page), toggles back to the previous
  tab, never in the nav. In soundLAB Gear the same button leaves for
  index.html#settings (resolvePage's cross-app guard; index.html#settings
  opens Settings over the start tab). App-level prefs live there and are
  stored for both apps: theme, accent (App.setAccent —
  inline --accent vars, amber default), master volume (App.setVolume — a
  master GainNode shadows ctx.destination so every module obeys), keep-awake
  (app.keepAwake gates App.wake).
- LATENCY RULES (v0.69.0): the master chain is masterGain -> 0.5 pre-gain ->
  WaveShaper soft clipper (oversample 'none' = zero delay) -> speakers; do NOT
  put a DynamicsCompressor on the master path (fixed ~6ms lookahead). Sample
  lead-in/peak analysis (App.sampleLead/sampleNorm) runs at DECODE time, never
  on the first hit. wireAudioWarmup starts the device on the first pointer/key
  gesture and shows #snd-hint if MIDI plays into a locked context (the hint
  only in soundLAB: Gear has no app voice for a played key to wake). Bus
  listeners that make SOUND register with App.on(evt, fn, true) — the third
  arg puts them first, ahead of visual listeners. App.keys.play(midi, when,
  dur, gain) = the Keys page's sampled piano for other modules (quiz).
- onRemote(action, info) + remoteKey (2.0 beta / v2, js/remote.js): a page with
  something to start / advance / retry / stop implements onRemote ('next' |
  'back' | 'stop'; info.via cc|pc|note|key|dbltap|test) and returns false
  (nothing here), true or a short HUD label; it must act exactly like the
  on-screen button and never prompt, change ports, or arm hardware.
  remoteKey (true / fn) only where losing the lowest key costs nothing.
  In soundLAB Gear a press that came from MIDI reaches onRemote a task later
  and only while no soundLAB window is visible (js/remote.js, ONE WINDOW
  ACTS ON A PEDAL); a Gear page's onRemote must not assume it runs inside
  the MIDI message.
- App.toast(msg, ms?) (2.0 beta / v2, with the remote; main 1.3.1-1.4.1 only
  call it behind if (App.toast)): the ONE app-wide status toast (#app-toast,
  role=status) for a tap that did nothing visible elsewhere — use it instead of
  a toast element inside a page that may be hidden (the Hub's #mh-toast only
  shows on the Hub page; the Synth Deck routes its refusals here off it).
- New bus events: `note:input` {on, midi, vel, src, dur?} — user played a note
  on an on-screen instrument (piano QWERTY/touch emit it; the Keys lessons,
  the Woodshed and the fretboard listen alongside midi:note).
- TRANSPORT EXCLUSIVITY (v0.65.0): `transport:claim` {owner: 'met'|'jam'|
  'keys'|'quiz'|'chart'} — every transport emits it before starting and stops
  itself on any foreign claim (each listener compares only its own owner
  name); #cx-met drives the metronome (`met:toggle`) and pulses on met:beat.
  Jam is 4/4-hardcoded (noted in Settings).
- Event bus: `App.on/emit`. New: `sig` {sig, source} (time signature changed —
  metronome and the bar mirror each other), `met:toggle` (request start/stop
  from anywhere), `met:state` {running}, `met:beat` {beat} (context-bar
  transport button + pulse). Events: `tempo` {bpm, source} (met.bpm is the ONE
  shared tempo — always guard against echo via `source`), `jam:chord`,
  `jam:stopped`, `fb:practice` {root?, scale?, bpm?} (a Practice plan block,
  a Free practice prompt's "Go" — fretboard applies it, switches tabs, starts
  the runner), `fb:scale`
  {root, scale} (fretboard scale changed — chords page follows 7-note scales),
  `fb:set` {source, root?, scale?, mode?, pattern?, dir?} (Tab page pushes
  linked practice state; fretboard applies without switching tabs). The
  exercise engine (path/sequence math) lives in theory.js as
  Theory.exercisePath / Theory.exerciseSeq / Theory.pickDirs (pick strokes:
  alt | eco | down | up), shared by fretboard and tab.
- Drag interactions are POINTER-EVENT based (no HTML5 dnd): jam
  palette->section + chord reorder (ghost chip, click suppressed after a real
  drag). Synthetic-event friendly: every setPointerCapture is try/caught;
  hit-testing via elementFromPoint.
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
  SL_URL / SL_GEAR_URL / CHROMIUM / AAPT and exports URL = soundLAB
  (index.html) and GEAR_URL = soundLAB Gear (gear.html, by default the page
  beside SL_URL's index.html). Suites: fingering (pure Node), lights (a fake
  LUMI via a stubbed requestMIDIAccess), keys, practice,
  game, quiz, nav, smoke, taps, update, midihub (a fake synth port: raw tap,
  rules on Thru / input filter, profiles + SysEx builders, clock), audioin
  (fake media device), btmidi (a fake Android MidiBridge), trim (2.0 Phase
  A: what left the app stays gone, 1.x data untouched), assets (pure Node:
  the scripts + stylesheets of index.html and gear.html <-> disk <-> sw.js
  ASSETS, the shell markup the two files share, and since 2.0 Phase A4 that
  the 1.x storage prefix is spelled on one line of js/ and only by the
  listed suites), storage-import (2.0 Phase A4: the one-time copy of the
  1.x store, the beta scope, a full store, Backup format 2),
  gear (soundLAB Gear:
  boot, its four pages, the links and #page both ways, Hear input with both
  apps open), remote-gear (the remote on Live sets and the Deck, the
  two-window pedal cases). TEN SUITES RUN ON GEAR_URL since 2.0 Phase A3b:
  midihub, midihub-wheel, midihub-lock, midihub-player, synthdeck,
  synthdeck-scope, synthtab, synthconn, synthconnect, helix: they wait for
  `App.active === 'deck'`, and "another page" there must be a Gear page
  (App.switchTo('piano') would leave the document). A two-app case opens
  two pages in ONE browser context (same store, same Web Locks) and sets
  each page's visibility / focus itself: headless Chromium reports every
  page visible and focused. STORAGE IN A SUITE (2.0 Phase A4): seed and
  read back 'soundlab2.<key>' (the test server is the live scope), written
  before the app starts; 'guitarlab.<key>' is the 1.x store, which the app
  only copies from once (Phase A section, A4). Run them
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
4. `sw.js`: bump the number in `CACHE`; add any new files to ASSETS (and take
   deleted files out)
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
downloads (backup export), offline/service worker and confirm()
dialogs are refused by the frame — everything else runs. `tools/bundle.py`
(old single-file build) is superseded.

SOUNDLAB ONLY (2.0 Phase A3b): the artifact is index.html. `tools/
artifact_build.py` is unchanged and never stages gear.html: soundLAB Gear
controls hardware over Web MIDI, which the viewer refuses. With
`window.SL_ARTIFACT` set, js/app.js hides the #app-switch link, and anything
that would cross to Gear (App.goApp, App.switchTo with a Gear page id, a
#page of Gear) only toasts "soundLAB Gear is not part of this preview."; the
one-time notice for a stored Gear tab ends "Gear is not part of this
preview." and the Thru notice is not shown. The asset list the script prints
still names the gear js files and data/ (it walks whole folders); the staged
page loads none of them. Web Locks may be refused in the viewer frame: Hear
input then behaves as before 2.0 (js/audioin.js).

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
