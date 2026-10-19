# Score preview MVP

Score is an offline, bounded MusicXML pitch/rhythm reader and small melody
composer. It is not a full engraving editor or a transcription engine. No
network service, dependency, new font, MIDI port, or external device is used.

## Useful workflow

1. Open a UTF-8, uncompressed `.musicxml` or `.xml` file, paste XML, or load
   the included original demo melody.
2. Read the simplified staff and the exact note table. Table positions and
   durations use **quarter-note beats**, including compound meters.
3. Play the written pitches through a local triangle-wave synth. Preview speed
   scales playback only. Export retains the score's tempo map.
4. Download the original imported MusicXML, unchanged byte for byte, or export
   written pitches/rhythm as MIDI. Download a created melody as MusicXML/MIDI.

Creation uses tokens such as `C4:q D4:e F#4:e R:h` or `[C4,E4,G4]:h`.
`w/h/q/e/s` mean whole/half/quarter/eighth/sixteenth. One or two dots extend
the value. Bars fill automatically in 4/4, 3/4 or 6/8. An optional `|` is a
bar check. Notes crossing a barline must be written as shorter values; the
composer does not insert invisible ties. A final incomplete bar is allowed.

## Supported import subset

- `score-partwise`, exactly one pitched part, one staff, one voice.
- Treble G2 and bass F4 clefs; clef/meter/divisions changes at measure starts.
- Written pitches C0–B8 within MIDI 0–127; explicit alterations through double
  flats/sharps. Pitch alteration comes from `<pitch><alter>`, as required by
  MusicXML. Staff preview writes every accidental explicitly, including naturals.
- Whole through 64th notes/rests, zero to two dots, consistent numeric durations,
  measure rests, up to eight pitches in a chord with equal durations.
- Adjacent matching pitched tie chains, including across measures. Ties merge
  into one sounding/MIDI note; spelling and segments remain in the note table.
- Numeric `<sound tempo>` or conventional metronome markings, including dotted
  beat units; mid-score tempo changes and meter changes. Tempo defaults to
  120 quarter notes/minute with a visible warning when absent.
- Pickup/final partial bars; other partial bars require `implicit="yes"`.
- Maximum 2 MB input, 256 measures, 2,048 note/rest events and 4,096 quarter
  beats. Compressed MXL, PDF/images, audio and MIDI input are not imported.

Unsupported structures are rejected with an actionable message: multiple
parts/voices/staves, backup/forward timing, tuplets, grace/cue/unpitched notes,
transposing parts/clefs, repeats/endings/navigation (including recognized text
instructions), measure-style shorthand, swing, fermatas, ornaments, tremolo,
octave shifts, hidden notes or timing overrides, malformed/unmatched ties, overlapping repeated
MIDI pitches and inconsistent durations. XML external DTD declarations are
ignored for parsing and retained in the original; entity declarations/internal
DTD subsets are rejected. There is no network DTD retrieval.

Lyrics, text directions, chord symbols, dynamics, articulation, instrument
programs, slurs, beams, page layout and expression are omitted from the
pitch/rhythm preview and MIDI. A persistent notice says so. Text and chord
symbols cause additional notices. Text-only tempo and navigation directions
are not interpreted; recognized repeat/navigation words are rejected. The original import remains intact even when importing a
new unsupported file fails; the last valid preview stays visible.

## Export contract

**Imported MusicXML:** the selected file's original UTF-8 bytes are retained in
memory and downloaded under its original name. Pasted source is retained as its
UTF-8 encoding. No regeneration or silent rewriting occurs. Nothing is saved
to browser storage; download before closing/reloading.

**Created MusicXML:** generated score-partwise 4.0 with divisions 960, explicit
pitch spellings, note values, meter, clef and numeric tempo. Parse/export/parse
is covered by tests.

**MIDI:** Standard MIDI File format 0, one track/channel, 960 ticks/quarter,
velocity 88, explicit note on/off, quarter-note tempo meta events and meter
meta events. Tie chains become one note. Note-offs precede note-ons at the same
tick. Rests, final duration and tempo changes are retained. It carries no
notation spelling, dynamics, articulations, instrument sound or lyrics. Tempo
microseconds are rounded to the nearest MIDI integer; rhythms that cannot be
represented exactly at 960 ticks/quarter are rejected rather than quantized.

## App integration and sound ownership

Load `css/score.css` and `js/score.js` before `App.boot()`, add `score` to the
shell's panel/navigation arrays and `<section id="panel-score" class="panel">`.
The script registers `App.register('score', SLScore.module)`.

`SLScore.toggle()`, `.play()`, `.stop()`, `.playing` and the `score:state`
bus event support optional context transport wiring. Playback claims
`transport:claim` with owner `score`, and stops when another owner claims it,
on leaving the page, opening a utility sheet, hiding/unloading the document,
speed changes, replacement or export. Space toggles; Escape stops outside
text fields. The app's ordinary focus/keyboard dispatcher handles text fields.

Each oscillator and gain is owned by Score and cancelled immediately on Stop.
Voices connect only to `App.getAudio().destination`, which the app shadows with
its master gain; there is no raw output bypass. Scheduler lookahead is 100 ms;
an interrupted/stalled context stops rather than bursting overdue notes.
There are no `App.midi`, key-light, note-input or MIDI-output calls, so preview
does not route notes to hardware or the Studio capture input.

## Validation

Run `node tests/score.test.js` with the existing app served at `SL_URL`,
`NODE_PATH` pointing at Playwright and `CHROMIUM` pointing at Chrome. Tests
inject the lane script/page only when the app shell has not been wired yet.
Fixture checks cover ties, source spelling, tempo/meter, chords/rests,
MusicXML creation roundtrip, independent MIDI decoding, original byte download,
unsupported/malformed imports, voice ownership/cancellation, navigation,
transport and narrow touch layout. Browser simulation is not hardware proof.
