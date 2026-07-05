# 🎸 GuitarLab — Practice Companion (alpha)

A guitar practice tool that runs entirely in your browser. No install, no accounts, no internet needed — open `index.html` and play.

## How to run

- **Easiest:** double-click `index.html` (Chrome or Edge recommended — both allow microphone access from local files).
- **Or serve it:** `python -m http.server 8000` inside this folder, then open http://localhost:8000.

Sound starts after your first click anywhere (browser autoplay policy). The Tuner tab will ask for microphone permission.

## The five tools

| Tab | What it does |
|---|---|
| **Metronome** | Sample-accurate Web Audio metronome: 30–280 BPM, tap tempo, 8 time signatures, per-beat accent/mute editing, subdivisions (8ths/triplets/16ths), and a tempo trainer that auto-ramps BPM every N bars. Space = start/stop. |
| **Fretboard** | Interactive SVG neck showing any of 13 scales/modes in any key, in 5 tunings, up to 22 frets. Labels as note names, intervals, or degrees; roots and interval classes are color-coded; click any position to hear it. Left-handed mode included. |
| **Chords** | Chord diagram library (open + movable barre shapes for 11 qualities) plus a progression builder: pick a key and scale, get the diatonic chords with roman numerals, build or load preset progressions (12-bar blues, ii–V–I, Axis, Andalusian…), and play them back strummed in tempo with the active chord highlighted. |
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
```

## Roadmap ideas (beyond alpha)

- Chord detection from the mic (polyphonic — needs FFT chroma analysis)
- Scale-degree ear training and melodic dictation
- CAGED position overlays and 3-notes-per-string fingerings on the fretboard
- Strumming pattern editor for the progression player
- Practice streaks/goals and richer stats over the session log
- Export/import settings and progressions
- Custom tunings and 7-string support
