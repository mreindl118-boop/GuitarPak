# Plan: piano (two-staff, chord) recognition for soundLAB

- Author: Claude. Created: 2026-10-24. Status: proposal for Matt; no code.
- Context: the 1.1 recognizer (Codex, `codex/soundlab-1.1-workflow-20261023`,
  `docs/OMR-ENGINE.md`) reads ONE monophonic treble or bass staff on one
  page, from clear engraving, into an unverified draft that Score review
  corrects and marks reviewed. From a reviewed draft, `feat/hub-player` +
  `feat/review-to-synth` now give Play on synth, Export MIDI and Open as
  tab. Matt's scores (e.g. a MuseScore piano export) are two-staff piano
  with chords, so recognition is the gap, not playback.

## What "piano" needs that the 1.1 engine lacks

1. **Grand-staff pairing**: find brace-joined treble + bass staves and keep
   them as one system; today each staff is a separate monophonic line.
2. **Chords**: several noteheads on one stem / one beat. The pinned model
   (`satb-line-omr`, kern vocabulary) emits one pitch per time step, so
   chords are silently reduced or dropped. This is the hard part.
3. **Voices**: two voices on one staff (stems up / down), ties across
   voices, rests per voice.
4. **Rhythm trust**: 1.1 marks every draft `rhythmKnown: false`; piano
   practice (Tempo mode, Woodshed grading) and tab need confirmed beats.
5. **Whole pieces**: several pages, system breaks, repeats, D.S./coda.

## Options

A. **Extend the 1.1 pipeline, staff by staff** (lowest risk, weeks):
   pair staves by brace/vertical alignment; run the existing line model per
   staff per voice; merge results on a shared beat grid in Score review
   (new "system" editor rows with a part per staff). Chords stay a gap
   unless the model is replaced. Gives usable left-hand + right-hand drafts
   for simple pieces.
B. **Swap the model for a polyphonic OMR model** (medium risk): a sequence
   model trained on piano systems (e.g. the Polyphonic-TrOMR / "TrOMR"
   family or a PrIMuS-style transformer with chord tokens) running in the
   same WASM worker. Needs a license check, an fp16 ONNX export under
   ~30 MB, a new vocabulary parser, and the same review loop. This is the
   path to real chords.
C. **Hybrid, offline helper**: ship a tiny local desktop helper that runs
   Audiveris (Java, AGPL) on the PDF and returns MusicXML, which Score
   review already imports. Fastest route to full piano scores today, but
   it is not "in app", needs Java, and AGPL must stay a separate process.

## Recommendation

Do A now inside the 1.1 release train (it reuses everything Codex built),
and start B as research in parallel: pick a model, prove it on Matt's
MuseScore PDFs (clean engraving) offline, measure chord accuracy on ten
real pages before any UI. Keep C documented as the manual fallback and
put a one-click "Import MusicXML from Audiveris" hint in Score review.

## Hand-off and ownership (proposal)

- Codex / null: A (OMR + Score review are theirs), after 1.1 ships.
- Claude: B's model research + a `docs/PIANO-OMR-RESEARCH.md` with
  measured results, and the Player/Songs side: multi-part MIDI export,
  left/right hand channel split (done in `scoreToMidi`), and a hands-split
  tab option (bass staff -> lower strings) if Matt wants it.
- Gates: a reviewed piano draft must round-trip Score review -> Play on
  synth -> Export MIDI -> Open as tab with every note accounted for; the
  review step stays mandatory.
