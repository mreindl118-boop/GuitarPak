# 🎸 GuitarLab — Practice Companion (alpha)

A guitar practice tool that runs entirely in your browser. No install, no accounts, no internet needed — open `index.html` and play.

## Get it

- **Web (recommended):** https://mreindl118-boop.github.io/GuitarPak/ — installable as a PWA (browser menu → *Add to Home screen*), works offline after first visit, microphone tuner fully functional.
- **Android APK (sideload):** [Download GuitarLab-alpha.apk](https://github.com/mreindl118-boop/GuitarPak/raw/main/releases/GuitarLab-alpha.apk) — allow "install unknown apps" when prompted. Rebuilt by `android/build.ps1`.
- **iPad / iPhone:** open the web link in Safari → Share → *Add to Home Screen* — full-screen app with icon, offline, mic tuner works. (A native WKWebView wrapper lives in `ios/` for building with Xcode on a Mac — see `ios/README.md`.)
- **Local:** double-click `index.html` (Chrome/Edge allow mic from local files), or `python -m http.server 8000` in this folder.

Sound starts after your first click anywhere (browser autoplay policy). The Tuner tab will ask for microphone permission.

## The five tools

| Tab | What it does |
|---|---|
| **Metronome** | Sample-accurate Web Audio metronome: 30–280 BPM, tap tempo, 8 time signatures, per-beat accent/mute editing, subdivisions (8ths/triplets/16ths), and a tempo trainer that auto-ramps BPM every N bars. Space = start/stop. |
| **Fretboard** | Vertical 24-fret neck (nut at top, scrolls down) showing any of 13 scales/modes in any key, in 5 tunings. Labels as note names, intervals, or degrees; click any position to hear it; pinch/zoom, fullscreen mode, left-handed mode. Includes a **practice runner**: a glowing ring steps through the scale in time with a click — straight runs, groups of 3–6, thirds, or random-note drills, with a direction toggle (up/down/up-down), tempo and note-sound controls, plus 2nd–16th interval drills; a mode switcher re-anchors the practice window at any scale degree (dropdown, or swipe in fullscreen). |
| **Chords** | Chord diagram library (open + movable barre shapes for 11 qualities) plus a progression builder: pick a key and scale, get the diatonic chords with roman numerals, build or load preset progressions (12-bar blues, ii–V–I, Axis, Andalusian…), and play them back strummed in tempo with the active chord highlighted. |
| **Jam** | Backing track builder: pick a key, build or load a progression, choose a vibe (rock, pop, blues shuffle, funk, ballad, latin) and instruments — synthesized drums, bass, and guitar/pad/keys comping. Tracks are savable, tempo is shared app-wide, and it keeps playing while you use other tabs. On the Fretboard, the current chord's tones glow with smooth transitions and each chord suggests a mode to solo with (tap to apply, or auto-switch). |
| **Tuner** | Microphone tuner with autocorrelation pitch detection: note + cents needle + Hz, adjustable A4 calibration, per-string guide. Includes a **note finder game** — it names a string and fret, you play it, real pitch detection scores your streak. |
| **Trainer** | Practice session timer with a persistent log, random practice prompt generator, the classic one-minute chord-change drill with best scores, and an interval ear trainer. |

## The prompt that defines this app (refined spec)

> Build **GuitarLab**, a single-page guitar practice web app (vanilla HTML/CSS/JS, no build step, works offline from a local file) with five tools in a tabbed, dark, stage-friendly UI:
> 1. a sample-accurate Web Audio **metronome** with tap tempo, time signatures, per-beat accents, subdivisions, and a tempo trainer that ramps BPM;
> 2. an interactive SVG **fretboard** that visualizes 13 scales/modes in any key across selectable tunings, labeled by note/interval/degree, with click-to-hear;
> 3. a **chord tool** combining an open+barre diagram library with a diatonic progression builder/player that strums progressions in tempo with roman-numeral analysis;
> 4. a microphone **tuner** with a cents needle plus a note-finder game scored by real pitch detection;
> 5. a **practice trainer** with session logging, one-minute chord-change drills, an interval ear trainer, and random practice prompts.
>
> All settings persist locally. No external dependencies, no accounts. Alpha scope: 6-string, fixed shape library, single-voice pitch detection.

## Credits

Jam-tab instrument samples are per-note renders of the **FluidR3 GM soundfont**
(Frank Wen, MIT) from [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts)
(MIT) — details in [samples/CREDITS.md](samples/CREDITS.md). Drums are synthesized.

## Architecture

```
index.html          tab shell, loads everything
css/style.css       dark theme + shared component classes
js/theory.js        music theory engine (scales, tunings, chords, diatonic
                    harmony, progression presets) — pure data + functions
js/app.js           App shell: module registry, tab switching, shared
                    AudioContext + pluck synth, localStorage wrapper
js/metronome.js     ┐
js/fretboard.js     │
js/chords.js        ├ feature modules — each registers { init, onShow,
js/tuner.js         │ onHide, onKey } with the shell
js/trainer.js       ┘
android/            WebView wrapper APK project (no Gradle — build.ps1 runs
                    javac → d8 → aapt → zipalign → apksigner)
releases/           built, signed APK
```

## Roadmap ideas (beyond alpha)

- Chord detection from the mic (polyphonic — needs FFT chroma analysis)
- Scale-degree ear training and melodic dictation
- CAGED position overlays and 3-notes-per-string fingerings on the fretboard
- Strumming pattern editor for the progression player
- Practice streaks/goals and richer stats over the session log
- Export/import settings and progressions
- Custom tunings and 7-string support
