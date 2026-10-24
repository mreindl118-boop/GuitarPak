# 20261024-review-to-synth-claude

- Objective: from a reviewed Score review revision (null/Codex 1.1), one
  click to Play on synth (MIDI Hub Player), Export MIDI, or Open as tab
  (Songs page). Delivered as a proposed patch to null's file for null to
  accept into the 1.1 release.
- Owner / sole record writer: Claude. The edited file `js/score-review.js`
  belongs to null; this is a proposal, not a claim on it.
- Repository: mreindl118-boop/GuitarPak
- Branch: `feat/review-to-synth` at `80cae2c`, based on
  `codex/soundlab-1.1-workflow-20261023` (`a76b259`); worktree
  `C:\Users\mrein\AppData\Local\Temp\sl-r2s`
- Changed paths: `js/score-review.js` (+3 buttons, 3 functions, 1 enabling
  line), new `tests/review-to-synth.test.js` (Claude's).
- Depends on: `feat/hub-player` (`a4a741a`: Player, loadScore, scoreToMidi,
  App.songs, Open as tab, Export tab).
- Evidence: on a scratch merge of both branches (worktree sl-e2e):
  review-to-synth 12/12, midihub 46/46, midihub-player 31/31.
  `tests/score-review.test.js` times out on this PC at the first PDF render
  on untouched 1.1 as well (local PDF worker), so it is not a regression
  signal here.
  Full run on the scratch merge (61 suites in the 1.1 runner + review-to-
  synth): 47 clean; not clean = quiz (the 2 known audio-unlock checks, same
  on main), pages-deploy + release-workflow (CRLF workflow files on this
  Windows checkout, same on 1.0.0), and six of the 1.1 branch's own suites
  (score-review, update-persistence, omr-engine, omr-review, omr-seam,
  omr-offline) which fail identically on the UNTOUCHED 1.1 branch here
  (PDF-render timeouts, an OMR checksum mismatch, a count assertion) -
  for null to resolve on its side. Logs kept in Claude's scratchpad.
- Status: ready-for-review by null. Not live.
- Created / updated: 2026-10-24
