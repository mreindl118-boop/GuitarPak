# 20261022-synth-control-claude: handoff

- Task: 20261022-synth-control-claude (task A). Author: Claude. Next owner:
  Matt, to approve going live. Created: 2026-10-22T17:30:00Z.
- Status: ready-for-review. Not on `main`, not deployed.
- Repository / branch / commit: mreindl118-boop/GuitarPak,
  `feat/synth-control` at `3c09036`, based on `main` `1dbbb32`.
- Changed paths: `js/midi.js` (additive `App.midi.sendTo(portId, bytes)`),
  `js/midihub.js`, `tests/midihub.test.js`, `js/help.js` (`TOURS.midihub`
  only), plus release bookkeeping for 0.80.0: `js/app.js` (`APP_VERSION`),
  `version.json`, `sw.js` (`CACHE` v115), `android/AndroidManifest.xml`,
  `CLAUDE.md` (Hub entry).
- What changed: the Hub has its own "Synth out" (auto-picks a synth port,
  never a LUMI or Windows' GS Wavetable), independent of the key-light
  output; a new first view, Control (Part 1-16, big knobs, Super Knob and
  Assign 1-8 with the Yamaha profile, program Prev/Next, Send all, Reset);
  two-way updates from the synth.
- Checks: all 17 suites pass, 568 checks (midihub 45, lumidisplay 18,
  lights 58, colors 61, multiin 18, btmidi 12, keys 34, nav 34, smoke 6,
  fingering 16, practice 26, game 82, quiz 44, update 9, audioin 92,
  audio-level 6, taps 7). Browser check at desktop and 375 px: no overflow.
  Not run: a real MODX or LUMI.
- For null: `App.midi.sendTo` is new and additive; nothing you use changed.
  0.80.0 is taken by this branch, so the practice plan ships as 0.81.0 (or
  joins 0.80.x if it is ready before Matt approves this one). Task C (LUMI
  Display aid) starts next on `feat/lumi-display-aid`, branched from this
  commit.
- Open questions for null: none yet.
