# Brief for null: task E, finish and ship the 1.1 recognition release (2026-10-24)

Written by Claude at Matt's request; this is the text Matt pastes to null.

---

Matt wants to upload a sheet-music PDF and have soundLAB turn it into
MIDI it can play on his synth, with tempo and a key shifter, and into
guitar tab. The recognizer on your branch `codex/soundlab-1.1-workflow-20261023`
is the base; the playback and tab side is done on two Claude branches.
Your task: finish and ship 1.1, and take in Claude's three Score review
buttons.

**Read first:** branch `coord/cowork-20261022-claude`:
`tasks/20261024-hub-player-claude.md`, `tasks/20261024-review-to-synth-claude.md`,
`tasks/20261024T1800Z-synth-deck-release-claim-claude.md` (another Claude
session's Synth Deck, also aimed at 1.1), `tasks/20261024-piano-recognition-plan-claude.md`.

**What exists now**
- `feat/hub-player` (Claude, released as 1.1.0, `main` `3caa04a`): a Player view in
  Keys > MIDI that opens .mid / MusicXML / .mxl and plays it on the synth
  output (notes + sustain only), with tempo 50-150 %, a loudest-note cap,
  transpose -12..+12 and a key shifter (any key/scale to any other, by scale
  degree), loop, seek. `SLMidiHub.player.loadScore(score)` takes YOUR
  reviewed practice score as is; `SLMidiHub.scoreToMidi(score)` writes it as
  a MIDI file; "Open as tab" sends it to the Songs page (`App.songs` API,
  "Export tab" there).
- `feat/review-to-synth` (Claude, `80cae2c`, on YOUR branch): three buttons
  in Score review under "Practice reviewed targets": Play on synth, Export
  MIDI, Open as tab. Same enabling rule as practice (saved reviewed
  revision, no unsaved edits), selected parts honoured, revision untouched.
  `tests/review-to-synth.test.js` drives the whole path from a MusicXML
  fixture: 12 checks pass on a merge of both branches.

**Your task E**
1. Finish 1.1's gates on your branch (`docs/RELEASE-1.1.0-CHECKLIST.md`),
   rebased on current `main`.
2. Accept `feat/review-to-synth` into it (it is your file,
   `js/score-review.js`; take it as is, or rewrite it your way, keeping the
   three ids `sr-synth`, `sr-export-midi`, `sr-tab` so the test holds) and
   the test. Take `feat/hub-player` too (`js/midihub.js`, `js/songs.js`,
   `tests/midihub*.test.js`); its only overlap with you is one line in
   `tests/midihub.test.js` (the view list gains `player`) and two adjacent
   lines in `js/songs.js`, both already resolved on the scratch merge
   Claude tested. `feat/hub-player` is already on `main`, so a rebase
   brings it in; only `feat/review-to-synth` still needs taking.
3. Version (settled by Matt, 2026-10-24): `feat/hub-player` IS 1.1.0 and
   is on `main` (`3caa04a`, sw CACHE guitarlab-v125). The Synth Deck
   lands next as 1.2.0 (CACHE v126). Your recognizer release is **1.3.0**:
   APP_VERSION 1.3.0, version.json `web` 1.3.0, sw CACHE above whatever
   `main` has when you rebase (v127 if 1.2.0 landed), APK channel
   untouched. Rebase on current `main`, not on 1.0.0.
4. Run every suite in `tests/run.sh` plus `review-to-synth` and the
   `midihub*` ones before handing off. Note: `tests/score-review.test.js`
   times out on Matt's PC at the first PDF render even on your untouched
   branch (local PDF worker here), so run it where it passes for you and
   say where.
5. Hand off with a timestamped record: exact commit, changed paths,
   results, the version/cache you used, and anything left for the piano
   plan (two-staff, chords) which comes next.

**Ownership:** you keep `js/score-review.js`, `js/music-library.js`,
`js/practice-material.js`, `js/omr/**`, `js/score.js`, your docs and
tests. Claude keeps `js/midihub.js`, `js/songs.js`, `js/midi.js`,
`tests/midihub*.test.js`, `tests/review-to-synth.test.js`. Going live
needs Matt's say-so, as before. Questions under "Open questions for
Claude" in your record.
