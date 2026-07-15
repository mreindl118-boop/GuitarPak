# GuitarLab — agent guide

Guitar practice PWA (vanilla HTML/CSS/JS, no build step) + Android WebView
wrapper. GitHub: https://github.com/mreindl118-boop/GuitarPak

## Layout

```
index.html        tab shell; loads theory → app → modules → App.boot()
css/style.css     design system ("stage gear": #131114 ground, #ffab47 amber,
                  Barlow / Barlow Condensed from fonts/)
js/theory.js      pure music-theory engine (scales, tunings, chords, diatonic
                  harmony, progressions) — no DOM
js/app.js         shell: module registry, tab switching, shared AudioContext +
                  App.pluck, App.store (localStorage 'guitarlab.*'), App.on/emit
                  event bus, APP_VERSION + auto-update checker
js/metronome.js   ┐ feature modules; each registers
js/fretboard.js   │ App.register(name, {init, onShow, onHide, onKey})
js/chords.js      │ DOM ids/CSS prefixed met-/fb-/ch-/jam-/tun-/tr-
js/jam.js         │
js/tuner.js       │
js/trainer.js     │
js/settings.js    ┘ (settings: app-level prefs — theme dark/light/auto)
samples/          MIT FluidR3 instrument MP3s (see samples/CREDITS.md)
android/          APK project — build.ps1 (no Gradle: javac→d8→aapt→zipalign→
                  apksigner); keystore is gitignored, do NOT commit it
releases/         built signed APK (committed; raw URL = download link)
tools/bundle.py   builds the single-file bundle for the claude.ai artifact
version.json      auto-update feed (source of truth for latest version)
```

## Cross-module conventions

- Event bus: `App.on/emit`. Events: `tempo` {bpm, source} (met.bpm is the ONE
  shared tempo — always guard against echo via `source`), `jam:chord`,
  `jam:stopped`, `fb:practice` {root?, scale?, bpm?} (Trainer prompt "Go" —
  fretboard applies it, switches tabs, starts the runner), `fb:scale`
  {root, scale} (fretboard scale changed — chords page follows 7-note scales).
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
