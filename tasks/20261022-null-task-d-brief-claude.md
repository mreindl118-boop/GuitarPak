# Brief for null: task D, close the Practice Plan's module gaps (2026-10-22)

Written by Claude at Matt's request ("give null a task"); this is the text
Matt pastes to null.

---

Thanks for the Practice Plan: it is live in soundLAB 0.81.0 (`main`
`4122d31`). Your next task follows from your own gap list.

**Task D: setup hooks so a Plan block opens exactly what the teacher
asked for.** Today a block can open the right page but not configure it,
so these lines become gaps:
- "Exact lesson speed/level needs selection in Keys; no public setup hook
  exists." (also: reps, and the infinite/∞ option)
- "Direct selection/import of this score needs a Woodshed setup hook."
- "Exact Exercises topic/ear-mode selection needs a public setup hook."

Done means:
1. **Keys lessons** (`js/keylessons.js`): a public
   `App.keysLessons.setup({id, step, reps})` (or an extended `open`) that
   selects a lesson, sets its speed level (`kl.prog[id].step`, clamped to
   the unlocked range or explicitly allowed by the teacher; your call,
   documented) and reps (`kl.reps`: 1, 2, 4 or 0 = infinite), and shows the
   list view ready to Start. Never starts a run by itself.
2. **Woodshed** (`js/woodshed.js`): a public hook (e.g. on the existing
   `window.Woodshed` handle) to open a generated exercise (scale in the
   given key, Hanon, pentatonic fours, a rudiment) or an existing library
   score by title, in a chosen mode (run | phrase | wait | ladder), ending
   on the session screen with Go ready. Never starts a run by itself.
3. **Exercises** (`js/quiz.js`): a public hook (e.g. on `window.SLQuiz`)
   to open a topic/unit/mode node card (intervals, key signatures, ear
   mode, and so on) so the student lands one tap from the right level.
4. **Practice Plan** (`js/practiceplan.js`): map teacher lines onto those
   hooks (level, reps, BPM, mode, topic), remove each gap the hooks now
   cover, keep a gap wherever a request still can't be honoured exactly,
   and keep explaining why each block was chosen.
5. Tests: extend `tests/practiceplan.test.js`; add focused checks for each
   hook in the owning module's suite (`tests/keys.test.js`,
   `tests/game.test.js` for the Woodshed, `tests/quiz.test.js`).

**Path ownership for task D (Claude transfers these to you now):**
`js/keylessons.js`, `js/woodshed.js` (public hooks only; leave their key-
light code, the double-tap control and `lightsUpdate`/`App.midi.guide`
calls as they are), `js/quiz.js` (public hook only), `js/practiceplan.js`,
`tests/practiceplan.test.js`, `tests/keys.test.js`, `tests/game.test.js`,
`tests/quiz.test.js`, `docs/PRACTICE-PLAN.md`, your `tasks/*-null.md`.
Claude will not edit those files until your handoff. Release bookkeeping
stays with Claude (`APP_VERSION`, `version.json`, `sw.js`, `android/`,
`CLAUDE.md`, `tests/run.sh`, artifact).

**How (same as task B):**
- Base: current `main` (0.81.1, `e9426ce` at 18:10 UTC), your own branch,
  e.g. `null/plan-setup-hooks-20261022`, in your own folder. 0.81.1 only
  touched `js/midihub.js`, its test and bookkeeping, so it won't conflict
  with you.
- Publish your claim record first: `tasks/20261022-plan-setup-hooks-null.md`.
- Preview on any port except 4590 (Matt's Desktop soundLAB).
- Never work inside `C:\Users\mrein\Creative-Workspace\GuitarPak` itself.
- Run all suites before handing off (now 19, listed in `tests/run.sh` on
  `main`; `midihub-wheel` is new). Hand off with a timestamped
  record: exact commit, changed paths, results.
- Claude integrates as 0.82.0 and Matt approves going live.
- Questions go under "Open questions for Claude" in your record.

Reference: Claude's records are on branch `coord/cowork-20261022-claude`,
incl. `tasks/20261022T1730Z-practice-plan-integration-claude.md`.
