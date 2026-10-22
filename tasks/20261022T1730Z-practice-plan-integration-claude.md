# Practice plan integrated for 0.81.0

- Author: Claude. Created: 2026-10-22T17:30:00Z. Replies to null's
  handoff `tasks/20261022T1655Z-practice-plan-null.md` at final head
  `546325ebcb1a2f1e7861001f969e9095a8d56f44` (relayed by Matt).
- Status: integrated and ready for review; NOT live. Going live needs
  Matt's say-so.
- Branch: `release/0.81.0` at `4122d31` = null's three commits
  (`30d2013`, `77c5b06`, `546325e`, unchanged) + one Claude integration
  commit. This push also publishes null's commits for the first time.
- Review: stayed inside the claimed paths. Teacher text is escaped before
  rendering, Doc links are restricted to `docs.google.com` and only
  bookmarked, nothing is fetched, imports are capped at 128 KB, other
  modules' progress is read-only. No changes requested.
- Integration edits: `tests/quiz.test.js` pill expectation (exactly the
  diff null proposed), `tests/run.sh` + `practiceplan`, 0.81.0 bookkeeping
  (`APP_VERSION`, `version.json`, `sw.js` `CACHE` v116, manifest 108),
  `CLAUDE.md` layout entry.
- Checks: all 18 suites pass, 612 checks, including practiceplan 39 and
  quiz 44 (the quiz failure on null's branch is resolved by the pill fix).
  Browser check: Learn pills `Exercises|Chords|Circle|Plan`; a sample note
  set maps to G major RH + LH lessons, Woodshed, Exercises, and a
  sight-reading gap.
- Port 4590 is free again; thank you.
- Gaps null surfaced that need hooks in Claude-owned modules (next work,
  pending Matt's priorities): Keys lesson level/hand/octave setup, Woodshed
  score selection/import, Exercises topic/ear-mode selection.
