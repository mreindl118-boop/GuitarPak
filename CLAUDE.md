# soundLAB — agent guide

Guitar + keys practice PWA (vanilla HTML/CSS/JS, no build step) + Android
WebView wrapper. GitHub: https://github.com/mreindl118-boop/GuitarPak
Branded **soundLAB** (formerly GuitarLab) since v0.43.0 — the rename is
user-facing ONLY: storage keys stay 'guitarlab.*', the Android package stays
com.mreindl.guitarlab, the APK filename stays GuitarLab-alpha.apk (update
URL compat), and internal ids/comments are untouched. The wordmark is a
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
js/midi.js        Web MIDI service (App.midi: in/out ports, note/bend/pressure
                  events on the bus, LED note lighting, experimental LUMI
                  SysEx key sync) — loaded right after app.js
js/metronome.js   ┐ feature modules; each registers
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
                  │  follows fb:set/fb:scale + jam:chord)
js/songs.js       │ (songs: user-imported ASCII tab / MIDI parsed on-device,
                  │  bar-loop player at shared tempo, key detect → fb:set)
js/jam.js         │ (jam: auto-band — genre presets write an intro/A/B/ending
                  │  song of DEGREE tokens that re-harmonize live against the
                  │  context-bar key; section editor, energy/swing, per-
                  │  instrument mixer, palette/MIDI vamp override, Finish →
                  │  ending; store jam2.*, old jam.track migrates once; the
                  │  sample/voice layer is the only carried-over code)
js/tuner.js       │
js/trainer.js     │
js/theorytab.js   │ (theory: circle of fifths + key guide + degree ear quiz)
js/settings.js    ┘ (settings: app-level prefs — theme dark/light/auto)
js/studio.js      STUDIO workspace (DAW phase one): registers 'song' (sketch-
                  book home) + 'ideas' (capture inbox) pages and the app-wide
                  capture service behind #cx-rec (header ● on every page).
                  Captures midi:note + note:input into ideas (notes tagged
                  key/bpm/date, store ideas.list, song.name); 30s retro buffer
                  ("keep what I just played"); playback via the studio synth.
js/help.js        (?) button + guided page tours (TOURS per page id, spotlight
                  ring + card overlay, first-run welcome; help.seen/help.done)
js/plugins.js     window.SoundLab plugin API v1: registerPage (App.addPage),
                  registerFx (DAW.fxPlugins, checked first by buildFx — must
                  work on OfflineAudioContext too), registerSynthPreset, bus +
                  app/daw/theory access. Stored plugins (plugins.list, 100KB
                  cap, per-plugin enable/error) run right after boot; loaded
                  from Settings > Plugins. Docs PLUGINS.md; sample plugin
                  plugins/sample-lofi.js (Lo-fi fx + Glass bell voice).
js/pads.js        drum-pad controller page ('pads', studio): 8 velocity pads
                  on the pad drum track's live channel; touch + ZXCV/ASDF +
                  MIDI (pads.mode 'roli' chromatic-from-base | 'gm' drum map);
                  Record quantizes hits to nearest 1/16 vs st:step heartbeat;
                  LUMI lights the 8 mapped keys, flashes on every hit incl.
                  loop playback. Drums-armed MIDI is handled HERE, not by
                  studio.js liveRoute (which skips kind==='drums').
js/daw/engine.js  studio engine (OpenStudio ports): DrumKit (8-lane 808/909
                  synth kit), Sampler (pitch-shifted one-sample instrument,
                  buffers in DAW.samples — context-independent, raw bytes in
                  IndexedDB 'guitarlab-daw'), FX (reverb/delay/drive wet-dry),
                  WAV encode/download, and the LOOP ENGINE: DAW.engine —
                  groovebox session loop (bars 1/2/4, st.tracks store), 25ms
                  lookahead at met.bpm, st:step/st:state bus events, live-play
                  channels (armed track st.armed), OfflineAudioContext render.
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
                  apksigner); keystore is gitignored, do NOT commit it
ios/              WKWebView wrapper (XcodeGen project.yml + Swift; needs a Mac
                  to build — the PWA is the primary iPad install)
releases/         built signed APK (committed; raw URL = download link)
tools/bundle.py   builds the single-file bundle for the claude.ai artifact
version.json      auto-update feed (source of truth for latest version)
```

## Cross-module conventions

- WORKSPACES (app.js): two page sets over one app — SPACES.practice (the 12
  original tabs) and SPACES.studio ('song', 'ideas' — the DAW side). #space-btn
  in the header switches via a screen-wipe (#wipe overlay); App.setSpace/
  App.switchTo cross spaces automatically; per-space last tab in app.tab /
  app.tabStudio, current space in app.space, <html data-space>. The context
  bar, clock, key and MIDI service are shared across both — that's the point.
- Context bar (index.html #ctxbar, wired in app.js): the single home for key/
  scale/mode/BPM/time signature, always visible under the tabs. It reads the
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
- New bus events: `note:input` {on, midi, vel, src, dur?} — user played a note
  on an on-screen instrument (piano QWERTY/touch emit it; capture listens
  alongside midi:note), `space` {space} after a workspace switch.
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
- The service worker is cache-first: after editing, bump `CACHE` in sw.js and,
  in the preview, unregister SW + clear caches + reload twice — otherwise you
  WILL verify stale files (this has bitten repeatedly).
- Headless preview quirks: page reports hidden → rAF never fires (shim with
  setTimeout when testing animations) and `preview_click` may not deliver
  events — drive the DOM with `preview_eval` + `.click()`.

## Release checklist (all five, every release)

1. `APP_VERSION` in js/app.js
2. `version.json` (version + notes — this drives everyone's update banner)
3. `android/AndroidManifest.xml` versionCode (+1) and versionName
4. `sw.js` CACHE bump (guitarlab-vN+1); add any new files to ASSETS
5. Build APK: `android\build.ps1` (outputs to releases/; sets JAVA_HOME itself;
   toolchain lives in C:\Users\mrein\AndroidBuildTools)

Then: verify in preview, commit + push (credential is stored), and rebuild/
republish the artifact via `python tools/bundle.py <out.html>` if that session
owns the artifact URL.

## Cloud / mobile sessions (claude.ai/code, PC off)

All web work is possible (js/css/html, sw.js, version.json, README). NOT
possible: building/signing the APK (the keystore and Android toolchain exist
only on the owner's PC) and republishing the claude.ai artifact (owned by a
PC session). For a release from the cloud: do checklist steps 1–4 only, note
in the commit that releases/GuitarLab-alpha.apk is stale until the next PC
session runs android\build.ps1, and open a pull request instead of pushing
to main so the owner can review from their phone.

## Gotchas

- PowerShell 5.1: no `&&`; embedded double quotes split native args (use
  single quotes in commit messages).
- APK: mic + update checks need the WebView flags already set in
  MainActivity.java; fetch() fails on file:// — use XHR for local assets.
- Same signature = in-place APK update. Losing android/guitarlab.keystore
  means users must uninstall/reinstall — keep it safe, never commit it.
