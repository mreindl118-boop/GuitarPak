# Voice trainer (page `vocal`, Train > Voice)

Plan and research: Music-Studio/soundlab/VOCAL-TRAINER-PLAN.md (project files).
Built: **part A, Sing & see** (2.x beta). Parts B (range + warm-ups), C (harmony
finder), D (band three-part), E (progress) are planned, not built.

## What it does

1. **Start listening** opens the shared input (`App.audioIn.hold('vocal')`), the
   device picked in Settings. Nothing opens by itself.
2. **My voice is on**: Left (input 1) / Right (input 2, default) / Both. A UR24C
   arrives as one stereo input; the L/R meters show which side moves.
3. **Sing to**: 5-note scale (1-2-3-4-5-4-3-2-1 of the context bar's key and scale,
   from the Low/Mid/High octave, one beat each at the shared tempo, 50-140 bpm),
   Hold a note (4 beats), or Free (the held notes are found afterwards).
   Guide notes: play along, or only the first note in the count-in.
4. **Pitch line** (`#vx-graph`): your voice over the target bars; green within
   25 cents, yellow within 50, red past that. After a take the graph shows the take
   (tap it to go back to live).
5. **Record** (Space): one-bar count-in, then the pattern; stops by itself. Free
   takes stop on Stop (max 90 s).
6. **Score card** (`js/vocal-analysis.js`, pure): grade 0-100, in tune % (vibrato
   centre within 25 c), average off, landing time, steadiness, drift, vibrato rate
   and width, timing (scale), notes sung, loudness + spread, clipping, noise under
   the voice, clear vs breathy (NSDF clarity), and one tip.
7. **Takes**: last 8 in memory (kept ones stay), play alone or with the notes, keep,
   save WAV, delete. Scores (no audio) go to `vx.hist` (cap 200).
8. **Hear myself**: chosen side -> level (`vx.stGain`) + small room (`vx.stVerb`) ->
   master. Off on every visit; shows the delay soundLAB adds and points to the
   UR24C MIX knob for zero delay.

## Fits the rest of soundLAB (no separate corner)

- **Same input** as Settings > Sound input, same key/scale/tempo as the context bar,
  guide notes in the Keys page's piano voice.
- **Key lights / LUMI**: during a scale or hold take, the sounding target and the next
  one light through the one keybed guide (`App.midi.guide`), like Songs and Woodshed.
- **Practice progress**: every take with at least 1 s of singing is a `voice` session
  (`mode: 'voice'`, sung seconds, in-tune notes as matched) in `App.practiceProgress`,
  so streaks, the daily goal and XP count singing.
- **Practice Plan**: a teacher line with sing / singing / vocal / lip trills / sirens /
  pitch matching becomes a "Sing with the pitch line" block that opens Voice. It is
  shared (shows for any Learn category); it completes on a finished take with notes in
  tune or the block's minutes of singing. Sight-singing stays a listed gap.
- **Controller remote**: NEXT = Record / Stop.

Stops on: page leave, app hidden, a foreign `transport:claim`. Remote: NEXT = Record/Stop.

## Tests

- `tests/vocal-analysis.test.js` (pure Node): metrics on synthetic frames.
- `tests/vocal.test.js`: the page on Chromium's fake device (no open by itself,
  side pick, sidetone only while On, take + card + WAV, scale targets, release on leave).
- `tests/vocal-sung.test.js`: a generated stereo WAV (guitar left, sung A3 +10 c with
  vibrato right) played as the fake capture; the score must find +10 c, the vibrato,
  and the guitar an octave down on Left.
