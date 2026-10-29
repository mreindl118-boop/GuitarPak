# 🎹 soundLAB — Practice Companion (alpha)

> Formerly **GuitarLab** — same app, new name and logo as the toolkit grew beyond the fretboard (piano, MIDI keyboards, songs, an auto-band).

A guitar practice tool that runs entirely in your browser. No install, no accounts, no internet needed — open `index.html` and play.

## Get it

- **Web (recommended):** https://mreindl118-boop.github.io/GuitarPak/ — installable as a PWA (browser menu → *Add to Home screen*), works offline after first visit, microphone tuner fully functional.
- **Android APK:** [Download soundLAB-alpha.apk](https://github.com/mreindl118-boop/GuitarPak/raw/main/releases/soundLAB-alpha.apk) — installs as **soundLAB** (allow "install unknown apps" when prompted). The app runs the live soundLAB inside it, so it updates itself with every release and keeps working offline; it only asks for a new APK if the Android wrapper itself changes. Since v0.70.2 it is a new app (`com.mreindl.soundlab`, new signing key): if you have the older soundLAB/GuitarLab APK, install this one and then delete the old app.
- **Windows desktop:** [Download soundLAB-windows.zip](https://github.com/mreindl118-boop/GuitarPak/raw/main/releases/soundLAB-windows.zip), unzip, and double-click `soundLAB-windows.bat` — creates Desktop + Start Menu shortcuts that open soundLAB in its own app window (Edge/Chrome app mode). **MIDI keyboards work out of the box**: Chromium's native Web MIDI is the bridge — plug in (or Bluetooth-pair in Windows Settings) and allow the MIDI prompt. Offline after first visit, auto-updates, a few KB.
- **iPad / iPhone:** open the web link in Safari → Share → *Add to Home Screen* — full-screen app with icon, offline, mic tuner works. (A native WKWebView wrapper lives in `ios/` for building with Xcode on a Mac — see `ios/README.md`.)
- **Local:** double-click `index.html` (Chrome/Edge allow mic from local files), or `python -m http.server 8000` in this folder.

Sound starts after your first click anywhere (browser autoplay policy). The Tuner tab will ask for microphone permission.

## The five tools

| Tab | What it does |
|---|---|
| **Metronome** | Always one tap away in the top corner — it opens over any page and keeps playing when closed. Sample-accurate Web Audio: 30–280 BPM, tap tempo, any time signature, per-beat accent/mute editing, subdivisions (8ths/triplets/16ths), and a tempo trainer that auto-ramps BPM every N bars. Space = start/stop. |
| **Fretboard** | Vertical 24-fret neck (nut at top, scrolls down) showing any of 13 scales/modes in any key, in 5 tunings. Labels as note names, intervals, or degrees; click any position to hear it; pinch/zoom, fullscreen mode, left-handed mode. Includes a **practice runner**: a glowing ring steps through the scale in time with a click — straight runs, groups of 3–6, thirds, or random-note drills, with a direction toggle (up/down/up-down), tempo and note-sound controls, plus 2nd–16th interval drills; a mode switcher re-anchors the practice window at any scale degree (bar dropdown, or swipe in fullscreen); a view dropdown swaps the board for degree-colored tablature or treble-clef sheet music, both playable with a live highlight. |
| **Chords** | Chord diagram library (open + movable barre shapes for 11 qualities) plus a progression builder: pick a key and scale, get the diatonic chords with roman numerals, build or load preset progressions (12-bar blues, ii–V–I, Axis, Andalusian…), and play them back strummed in tempo with the active chord highlighted. |
| **Jam** | Backing track builder: pick a key, build or load a progression, choose a vibe (rock, pop, blues shuffle, funk, ballad, latin) and instruments — synthesized drums, bass, and guitar/pad/keys comping. Tracks are savable, tempo is shared app-wide, and it keeps playing while you use other tabs. On the Fretboard, the current chord's tones glow with smooth transitions and each chord suggests a mode to solo with (tap to apply, or auto-switch). |
| **Tuner** | Microphone tuner with autocorrelation pitch detection: note + cents needle + Hz, adjustable A4 calibration, per-string guide. Includes a **note finder game** — it names a string and fret, you play it, real pitch detection scores your streak. |
| **MIDI Hub** (Keys › MIDI) | Read, write and reshape MIDI for any device on the cable — a hardware synth (Yamaha MODX, Roland…), a controller, a DAW port. On-screen keys and expression, bank/program select, a wall of CC sliders, transport + MIDI clock at the app tempo, **rules** (remap, transpose, force channel, convert, block — on Thru, on what soundLAB hears, with MIDI Learn), SysEx builders per device profile plus raw hex, and a live decoded monitor of everything in and out. Generic profile works with anything; profiles add names and templates. |
| **Synth Deck** (the Hub’s Control view) | Control the synth on the cable like a surface: a Now bar with the sound it is on, the big knobs plus pages of more, buttons for scenes, arpeggiator, Motion Sequencer, Part mute and pedals, a **Sounds** library you build, star and load with one tap (with the MODX factory names, a bank browser and *Read name from synth*), a **Scope** that draws what the arpeggiator and sequencer send against the clock, and a **Map** where every number is editable and MIDI-learnable. See [docs/SYNTH-DECK.md](docs/SYNTH-DECK.md). |
| **Helix Stadium** (Guitar › Helix) | Control a Line 6 Helix Stadium over USB MIDI — presets, snapshots, knobs, pedals, looper, Matrix mixer — and, with the helper on your computer, read and edit the loaded preset block by block. Disarmed until you press Arm. See [docs/HELIX-STADIUM.md](docs/HELIX-STADIUM.md). |
| **LUMI practice** (Keys › LUMI) | Guided single-note and major/minor triad practice: see what to play, get correct/wrong feedback, and advance when the exact notes match. An on-screen 24-key preview works with simulated answers; optional Web MIDI listens to a selected LUMI or MODX and uses the LUMI key LEDs as the display. Physical lighting remains unverified. See [the practice guide](docs/LUMI-PRACTICE.md). |
| **Guided performance** (Train › Woodshed) | **Wait for Me** follows exact notes/chords; **Play at Tempo** keeps time and reports accuracy, missed/wrong/extra notes, timing and hold measurements. Piano roll, target keyboard and upcoming notes work with touch/typing keys or MIDI, with optional shared LUMI cues. Includes original scale-based melody/chord exercises, MIDI/Studio/ASCII score sources, count-in, pause/resume, tempo, transpose and section looping. See [the player guide](docs/GUIDED-PERFORMANCE.md). |
| **SheetLab** (Play › Scan) | Turn a PDF, a scan or a photo of printed sheet music into MIDI and MusicXML, read on your device by a built-in port of the [homr](https://github.com/liebharc/homr) recognition engine (nothing is uploaded). Play it on your synth, practise it in the Woodshed, open it as tab or download it. The engine (about 107 MB) downloads once, after you agree, then works offline. See [docs/SHEETLAB.md](docs/SHEETLAB.md). |
| **My library** (Play › Library) | Your scans and the MIDI you play in the Studio, kept on the device and, with a GitHub key, on the `library` branch of this repository so every device sees the same library. See [docs/LIBRARY.md](docs/LIBRARY.md). |
| **Trainer** | Practice session timer with a persistent log, random practice prompt generator, the classic one-minute chord-change drill with best scores, and an interval ear trainer. |

For separate synth practice, LUMI targets and the synth's sound output are independently selected. The optional [scale-locked sound route](docs/PRACTICE-ROUTER.md) blocks out-of-scale MIDI notes without remapping and tracks note/pedal cleanup. The synth must have Local Control off for its own keyboard-to-engine sound to pass through the filter; soundLAB does not change that hardware setting. Physical lighting and audio behavior remain unverified.

The existing treble-clef dropdown contains the independent **Scale Lock** and **LUMI Display** switches, plus **Intervals / Note Names** colors. They share its root/scale across built-in pitched sound paths and instructional displays. Screen and LED pitch identities use the same [quantized LUMI program palette](docs/NOTE-PALETTE.md); physical color appearance depends on the board program/firmware and is unverified. [Coverage and explicit exclusions](docs/FEATURE-COVERAGE-2026-10-23.md) include recorded audio, arbitrary plugins, unsupported score formats and hardware Local Control.

Guitar and other pitched instruments can use [monophonic audio practice](docs/PRACTICE-INPUTS.md) through a deliberately enabled microphone, USB-audio or direct interface. MIDI pickups support chord input; audio chords require the clearly labeled arpeggio adaptation. Capture is local and does not mute direct instrument sound. [Per-instrument progress](docs/PRACTICE-PROGRESS.md) records measured engagement, accuracy and timing, daily goals/streaks, immutable earned XP and adjustable consistency decay, with charts and JSON export.

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

Music notation in Exercises is engraved with **SLMusic**, a subset of the SMuFL
font **Bravura** (Steinberg Media Technologies GmbH), used under the SIL Open
Font License 1.1 and renamed as that license requires for modified versions —
see [fonts/OFL-Bravura.txt](fonts/OFL-Bravura.txt).

## Architecture

The [2026-10-23 branch audit](docs/BRANCH-AUDIT-2026-10-23.md) records the related repositories, release baselines, recovered features and remaining candidates. Cloud checks and their hardware limits are recorded in [validation notes](docs/VALIDATION-2026-10-23.md).

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

## Licence

soundLAB is free software under the [GNU AGPL-3.0](LICENSE). It includes [homr](https://github.com/liebharc/homr) (AGPL-3.0) for SheetLab; the other parts it loads are listed with their licences in [docs/SHEETLAB.md](docs/SHEETLAB.md).
