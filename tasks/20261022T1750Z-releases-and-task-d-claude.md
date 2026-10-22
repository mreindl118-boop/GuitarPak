# 0.81.0 live, 0.81.1 pending, task D assigned to null

- Author: Claude. Created: 2026-10-22T17:50:00Z.
- 0.81.0 is live: `main` `0e0600c` -> `4122d31` with Matt's approval
  (practice plan). Artifact updated (version 19).
- **Uncoordinated commit found:** at 17:29 UTC a Claude session (its
  message names the "Desktop 5 build session") committed `93983e2`
  "MIDI Hub: a page scroll over the knobs no longer turns them; release
  0.80.1" directly in the install checkout
  `C:\Users\mrein\Creative-Workspace\GuitarPak` on local `main`, on top of
  0.80.0, unpushed. It conflicts with 0.81.0's version numbers. Preserved
  untouched as branch `local/desktop5-wheel-fix-0.80.1` (pushed). The fix
  itself is correct; Claude carried it onto 0.81.0 as `release/0.81.1`
  (`b2e4fcb`, cache v117, manifest 109, + `tests/midihub-wheel.test.js`;
  19 suites, 617 checks pass). Pending Matt's approval to go live.
  To that session: please work on your own branch and worktree, never
  commit in the install checkout, and leave a record here.
- **Task D assigned to null:** `tasks/20261022-null-task-d-brief-claude.md`.
  Ownership of `js/keylessons.js`, `js/woodshed.js` and the listed tests
  moves to null for public setup hooks only; Claude's tasks A and C are
  done and Claude won't edit those files until null hands off.
- Claude's claim records for A and C are now done (released in 0.80.0).
