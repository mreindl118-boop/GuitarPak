# 20261024-hub-player-claude

- Objective / acceptance: a "Player" view in the MIDI Hub (Keys > MIDI)
  that opens a .mid/.midi or MusicXML (.musicxml/.xml/.mxl) file and plays
  it on the Hub's synth output (e.g. MODX-1). Notes + sustain only (no
  program/bank/other CC/SysEx), tempo %, velocity cap, file channels or one
  Part, play/pause/stop/loop, everything released on stop/leave through the
  MIDI service's musical-output ledger (bindMusicalOutput /
  flushMusicalOutputs). A public `SLMidiHub.player.load(...)` hook so the
  1.1 Music Library / Score review can hand reviewed material to it later.
- Owner / sole record writer: Claude. Reviewers: Matt; null/Codex welcome.
- Authorization: Matt, 2026-10-24 ("lets get that converter up running and
  built into soundlab"). Recognition (PDF -> notes) is NOT in scope: it is
  Codex's unreleased 1.1 work (`codex/soundlab-1.1-workflow-20261023`,
  docs/OMR-ENGINE.md, single-staff beta). This task adds the missing
  device writer only. No push to `main` without Matt's say-so.
- Repository: mreindl118-boop/GuitarPak
- Branch: `feat/hub-player`; worktree `C:\Users\mrein\AppData\Local\Temp\sl-player`
- Base commit: `2077f3b` (main, 1.0.0)
- Claimed files: `js/midihub.js`, `js/songs.js` (App.songs + Export tab), new `tests/midihub-player.test.js`, this
  record. Deliberately NOT touching `tests/midihub.test.js`, `index.html`,
  `js/app.js`, `js/help.js`, `sw.js`, `tests/run.sh` (edited on the 1.1 and
  Helix branches); release bookkeeping waits for integration.
- Created: 2026-10-24
- Status: ready-for-review: `feat/hub-player` at `a4a741a`, not live.
  Since `6c99335`: `player.loadScore` (the 1.1 reviewed practice score),
  `SLMidiHub.scoreToMidi`, transpose + key shifter (by scale degree, source
  key guessed), the song's own tempo kept, `Open as tab` -> Songs page
  (`js/songs.js` gains `App.songs` {fromMidi, load, toAscii} + Export tab;
  added to this claim). midihub-player 31 checks.
- Evidence: `tests/midihub-player.test.js` 20 checks; 45 of 46 suites pass
  locally (pages-deploy and release-workflow fail identically on untouched
  1.0.0 here: CRLF workflow files on this Windows checkout).
- Scope change: `tests/midihub.test.js` needed one line (the view list now
  includes Player). The 1.1 branch also edits that file; expect a trivial
  merge there.
- For Codex / null: `SLMidiHub.player.loadFile(name, ArrayBuffer)` plays
  .mid / MusicXML / .mxl on the Hub's synth output. A reviewed 1.1 draft
  could reach it as an exported MusicXML or MIDI buffer. Matt asked on
  2026-10-24 whether soundLAB can have its own PDF -> MIDI feature; the
  1.1 recognizer is that feature's base, so that question is routed to
  Matt's decision and to you, not built here.
- Remote confirmation: main `2077f3b`; active branches checked:
  `codex/soundlab-1.1-workflow-20261023` (touches tests/midihub.test.js,
  index.html, app.js, help.js, sw.js - not midihub.js/midi.js),
  `feat/helix-stadium` (index.html, app.js, sw.js, run.sh). No other claim
  on js/midihub.js.
