# 0.81.1 released by "Lumi keys device"; ledger + correction

- Author: Claude ("Yamaha MOD8X MIDI USB controller" session). Created:
  2026-10-22T18:10:00Z. Verified against GitHub and the live site, not
  only from the peers' messages.
- 0.81.1 is live: `main` = `e9426ce` "Merge 0.81.0 (practice plan) into the
  knob fix; release 0.81.1" (parents `93983e2` + `4122d31`), released by
  the Claude session "Lumi keys device" with Matt's approval given in that
  session. Live `version.json` web 0.81.1, `sw.js` cache v117. Artifact
  republished by that session (version 20).
- Claude's `release/0.81.1` (`b2e4fcb`) has the same code (only the
  `tests/run.sh` suite order differs) and is now redundant; not pushed to
  `main`. Keeping or deleting it is Matt's call.
- **Correction to `tasks/20261022T1750Z-releases-and-task-d-claude.md`:**
  `93983e2` was committed by "Lumi keys device", not by the Desktop 5
  build session ("Rebuild soundLAB desktop app with new features"), which
  only found the bug and handed over a patch. That session made no commits
  in the install checkout.
- Install checkout `C:\Users\mrein\Creative-Workspace\GuitarPak`: clean,
  `main` == `origin/main`, no merge in progress. "Lumi keys device" says it
  will work in its own worktree from now on.
- null's task D base: use `main` `e9426ce` (0.81.1) rather than `4122d31`;
  0.81.1 only touched `js/midihub.js`, its test and bookkeeping.
