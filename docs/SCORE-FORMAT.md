# Bounded structured score format

`js/score.js` selectively recovers parser/model/XML/MIDI export code from
`b8ccb55de28e4dd297e8d4b7ac4f8a4b3dfcfe4f:js/score.js`. The original page and its
independent oscillator player were omitted. The module performs no audio,
transport, MIDI I/O or automatic practice launch.

`SLScore.parseMusicXML(text)` supports UTF-8 score-partwise MusicXML with one
pitched part, one staff and one voice; G2 treble/F4 bass clefs; explicit pitch
spelling through double accidentals; supported regular whole–64th note values
with at most two dots; rests; same-duration chords up to eight pitches; adjacent
start/stop ties; numeric tempo and meter changes; traditional key signatures;
and explicitly bounded partial measures. Original bytes live in Music Library.

It rejects multiple parts/staves/voices, backup/forward, tuplets, grace/cue or
unpitched notes, transposition, repeats/endings/navigation, unsupported clefs,
hidden/timing-overridden notes, unmatched ties, and overlapping repeated pitches.
The parser rejects entities/internal DTDs and strips an external DOCTYPE before
DOM parsing. Limits: 2 MiB of UTF-8 text, 256 measures, 2,048 events and 4,096
quarter-note beats. Unsupported input returns an error, never a partial ready
score. Expression, lyrics and original layout remain in the untouched source.

The model contains `title`, `sourcePart`, `measures`, `tempos`, `notes`,
`totalBeats`, `eventCount` and `warnings`. Measure events retain spelled pitches,
ties, rests, meter/key/clef and written durations. `notes` is a sounding derivative
with explicit ties merged; its times are quarter-note beats. The full tempo map
is retained. Current constant-tempo performance practice is a separate adapter.

`createScore(tokens,options)` accepts original manual note tokens such as
`C4:q`, `F#4:e`, `R:h`, `[C4,E4,G4]:h`, optional dots and complete bar separators.
Options select title, BPM, clef and 4/4, 3/4 or 6/8. It is a limited composer,
not an automatic PDF/image recognizer.

`scoreXML(model)` exports the supported subset; `midiBytes(model)` returns SMF
format 0, 960 ticks/quarter, explicit paired notes and original tempo/meter/end
markers. `timeline`/`beatSeconds` are pure tempo-map conversions. `pitch`,
`pitchName`, `durationType`, `limits` and `provenance` support the review adapter.
Export preserves this supported subset, not omitted expression or page layout.
Always retain the original for faithful source recovery.
