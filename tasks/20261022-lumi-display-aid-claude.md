# 20261022-lumi-display-aid-claude

- Objective / acceptance: the LUMI Keys work as a practice display
  wherever soundLAB guides playing, not only in scale lessons (0.79.0).
  Keys show what to play, in the "Color notes by" colors; the octave
  buttons still switch right/left hand; the LUMI stays a normal MIDI
  controller (see Matt's goal in the project notes). Scope to confirm in
  the first handoff: Songs and Woodshed play-along light the upcoming notes;
  chord players light the chord tones; a "wait for me" mode holds until the
  lit note is played; Display settings stay in Lights & help.
- Owner / sole record writer: Claude. Reviewers: Matt; null welcome.
- Authorization: Matt's request on 2026-10-22 ("the lumi keys 'display'
  practice aide"). Exclusions: no LUMI firmware or LittleFoot program
  writes; no push to `main` without Matt's say-so.
- Repository: mreindl118-boop/GuitarPak
- Branch: `feat/lumi-display-aid` (created when work starts, from the
  then-current `main`); worktree: a separate path under
  `C:\Users\mrein\AppData\Local\Temp\`
- Base commit: `1dbbb326f60e05d76d891090f0c07f1ec533020f`
- Claimed files: `js/midi.js` (keybed), `js/keylessons.js`, `js/lights.js`,
  `js/piano.js`, `js/songs.js`, `js/woodshed.js`, `js/chords.js` (its
  `App.midi.guide` calls only), `tests/lumidisplay.test.js`,
  `tests/lights.test.js`, `tests/colors.test.js`, this record.
- Created / updated: 2026-10-22T16:24:00Z
- Status: claimed (starts after synth control)
- Remote confirmation: 2026-10-22T16:23:56Z, `main` = `1dbbb32`; no
  competing claims.
- Evidence: pending.
- Next action / next owner: Claude.
