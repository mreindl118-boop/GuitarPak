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
- Status: RELEASED 2026-10-24 as soundLAB 1.1.0: `main` fast-forwarded to
  `3caa04a` (Matt: "Ship the Player now"); web-only release (APP_VERSION,
  version.json web 1.1.0, sw CACHE guitarlab-v125; APK channel untouched).
  claude.ai artifact republished with the full 1.1.0 file set (version 22);
  Matt's install folder on `main` 3caa04a. Ledger:
  `tasks/20261024T1930Z-release-1.1.0-claude.md`.
  Earlier: ready-for-review at `a4a741a`.
  Since `6c99335`: `player.loadScore` (the 1.1 reviewed practice score),
  `SLMidiHub.scoreToMidi`, transpose + key shifter (by scale degree, source
  key guessed), the song's own tempo kept, `Open as tab` -> Songs page
  (`js/songs.js` gains `App.songs` {fromMidi, load, toAscii} + Export tab;
  added to this claim). midihub-player 31 checks.
- Evidence (3caa04a): midihub-player 31, midihub 46, midihub-wheel 5,
  midihub-lock 21, update 9, smoke 6, nav 39, lights 71, lumidisplay 23,
  keys 34, practice 34, game 78, colors 62, multiin 18, lumi-contexts 37,
  pitch-lock 15, context-global 138 all pass.
  Earlier (a4a741a): `tests/midihub-player.test.js` 20 checks; 45 of 46 suites pass
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
