# 20261022-synth-control-claude

- Objective / acceptance: the MIDI Hub (Keys › MIDI) makes controlling a
  hardware synth easy. (1) The Hub has its own synth output, independent of
  the key-light output: it auto-picks a synth port (MODX-1 first; never a
  LUMI, never Windows' GS Wavetable), so a LUMI keeps the lights while the
  MODX gets the controls. (2) A new first view, "Control": Part 1-16
  buttons, large drag/scroll/keyboard knobs for cutoff, resonance, attack,
  release, reverb, variation/chorus, volume and pan, plus the Super Knob
  and Assign 1-8 with the Yamaha profile; big Performance prev/next; "Send
  all" to sync. (3) Two-way: a CC arriving from the synth on the selected
  Part moves the screen knob. All existing Hub views keep working.
- Owner / sole record writer: Claude. Reviewers: Matt; null welcome.
- Authorization: Matt's request on 2026-10-22 ("I need that midi controller
  tab that will make synth control easy"). Exclusions: no push to `main`
  without Matt's say-so; no SysEx parameter writes beyond what the Hub
  already offers.
- Repository: mreindl118-boop/GuitarPak
- Branch: `feat/synth-control`; worktree: `C:\Users\mrein\AppData\Local\Temp\sl-synth`
- Base commit: `1dbbb326f60e05d76d891090f0c07f1ec533020f`
- Claimed files: `js/midihub.js`, `js/midi.js` (an additive `sendTo`),
  `tests/midihub.test.js`, `js/help.js` (the `TOURS.midihub` entry only),
  this record.
- Created / updated: 2026-10-22T16:24:00Z / 2026-10-22T17:30:00Z
- Status: done (released in 0.80.0, main 0e0600c, 2026-10-22; was `feat/synth-control` at `3c09036`; not live)
- Remote confirmation: 2026-10-22T16:23:56Z, `main` = `1dbbb32`; no other
  record claims these paths. PR84 (`codex/midi-hub-release-0.78.0-20261019`)
  also edits `js/midihub.js` but is superseded on `main`; left untouched.
- Evidence: handoff `tasks/20261022T1730Z-synth-control-claude.md`; 17 suites, 568 checks pass.
- Next action / next owner: Matt approves going live; Claude then pushes `main`.
