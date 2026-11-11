# Chord charts (soundLAB 2.0, Keys › Charts)

Asked for by Matt on 2026-11-10, from his hand-drawn "Something About Us"
sheet: rows of blank keyboards with dots, finger numbers and chord names.

## What it does

- Rows of keyboards (2 or 3 octaves, from C1 to C5). Tap a keyboard to pick it.
- **Tap puts:** Dot (tap again to remove), finger 1-5 (1 = thumb), Erase. Undo.
- **Add fingers** numbers the dots the way teachers finger close chords
  (C E G = 1 3 5, F A D = 1 2 5, G C E = 1 3 5, A C E G = 1 2 4 5,
  G A B D = 1 2 3 5); the left hand counts from the pinky.
- **Chord names**: an empty name shows the chord soundLAB finds from the dots
  (including slash chords like Dm/F); **Name it** fills it in.
- **Chord / Line**: a Line plays its dots one after another, in the order they
  were placed (bass lines, melodies), and numbers them.
- **Play it in**: notes played on a MIDI keyboard (the LUMI) drop dots.
- **Light the LUMI**: the picked keyboard lights through the one lighting
  engine (`App.midi.guide`), the next keyboard blinks as "next".
- **Play all**: one bar per keyboard at the shared tempo, lighting as it goes.
- **Practice with LUMI**: the chart goes to the Woodshed as MIDI, which lights
  it on the LUMI and scores the playing.
- **Save file / Open file** (`.chart.json`, keeps names, fingers, notes),
  **Save MIDI**, **Print** (only the chart, two columns, like the paper sheet).

## Chart format v1

```json
{ "v": 1, "id": "…", "title": "Song", "lo": 48, "oct": 2,
  "cards": [{ "id": "…", "name": "Dm/F", "hand": "R", "kind": "chord",
              "text": "a note under the keyboard",
              "notes": [{ "m": 53, "f": 1 }, { "m": 57, "f": 2 }, { "m": 62, "f": 5 }] }] }
```

`lo` = the lowest MIDI note shown (a C); `hand` = `R` | `L` | `""`;
`kind` = `chord` | `line`; `f` = finger 0-5 (0 = none). Files are cleaned on
open (`SLChart.clean`). The format leaves room for a guitar-neck chart later
(a `neck` card kind with string/fret dots).

Private song charts (like Matt's) live in the project files, never in this repo.
