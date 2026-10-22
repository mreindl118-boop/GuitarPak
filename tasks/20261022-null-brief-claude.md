# Brief for null: soundLAB Practice Plan (task B), 2026-10-22

Written by Claude at Matt's request; this is the text Matt pastes to null.

---

You're working with Claude on soundLAB (GitHub `mreindl118-boop/GuitarPak`,
live at https://mreindl118-boop.github.io/GuitarPak/, currently 0.79.0).
Matt has split today's work between us through records in the repository.

**Read first, in this order:**
1. Branch `coord/cowork-20261022-claude`: `tasks/20261022-cowork-split-claude.md`
   (the split, the path ownership and how we talk), then this brief.
2. `CLAUDE.md` on `main` (architecture, module contract, event bus, test
   recipe, release rules).
3. The coworking convention: `mreindl118-boop/GeneralStorage`, branch
   `docs/coworking-20261018`, `projects/repository-handoff-20261016/coworking/README.md`.
4. Fetch all remote branches and read any newer `tasks/*-claude.md` records
   before you start and before every push.

**Your task (B): the Practice Plan.** Matt wants lesson-plan help that is a
meaningful integration of the app's existing features, making practice
regimented and clear. Not a wall of text: a set of guides that use his
teacher's lesson Google Doc to decide which practice modules to use. Where
the doc asks for something the app can't do yet, record it as a "module
gap", an app-improvement metric that says what to build next.

What "done" looks like:
- A new page (suggested id `practiceplan`; propose its nav home in your
  record, e.g. a pill under Learn or Practice) built as a standard module:
  `App.register('practiceplan', {init, onShow, onHide, onKey})`, DOM ids
  and CSS prefixed `pp-`, styles via `App.injectCSS`, storage via
  `App.store` under `pp.*`.
- **Today's session:** an ordered checklist of short, timed blocks
  (warm-up, technique, repertoire, ear or theory), each one button that
  opens the right module already set up. Use existing hooks:
  `App.keysLessons.open(id)` for Keys scale lessons,
  `App.emit('fb:practice', {root, scale, bpm})` for the Fretboard runner,
  `App.switchTo(page)` for Chords, Jam, Woodshed, Tuner and Exercises, the
  shared tempo `met.bpm`, the Help level `App.help`.
- **Done is measured, not ticked by hand** where the app already knows:
  read `kl.prog` (lesson runs and levels), `qz.prog` and `App.xp`
  (Exercises and practice minutes), `ws.*` (Woodshed) to mark blocks
  complete and show the week's progress.
- **From the Google Doc:** Matt pastes or imports the teacher's lesson
  notes. Each plan item shows why it was chosen ("Doc: 'G major scale, two
  octaves, hands separate' → Keys lesson G major, RH then LH, level 3").
  Keep the mapping rules in one readable table in your module. No OAuth
  client secrets or API keys in this public repo. If you want live Docs
  reading, design it as a pasted share link or exported text first, and
  write any credentialed option up as a proposal for Matt.
- **Module gaps:** every doc item with no matching module is logged with a
  count and the doc text (`pp.gaps`), shown as a short "What soundLAB can't
  do yet" list with an export, so Matt and Claude can pick what to build.
- Existing work to reuse: the 0.77.1 "Desktop 4" build has a Practice plan
  with per-student Google Docs links and accepted plans. It's under
  `%LOCALAPPDATA%\Programs\soundLAB\0.77.1-desktop.4\` (`README.txt`,
  `GOOGLE-CONNECTION-SETUP.md`, `WebAssets\`). It is NOT in the repo; port
  what's useful.
- A test suite `tests/practiceplan.test.js` in the style of the existing
  suites (Playwright, `tests/env.js`), and `docs/PRACTICE-PLAN.md`.

**Files you own:** new `js/practiceplan.js`, `tests/practiceplan.test.js`,
`docs/PRACTICE-PLAN.md`, your `tasks/*-null.md` records, plus one-line
integration touches: a panel section and script tag in `index.html`, your
page id and labels in `js/app.js` `SPACES`/`GROUPS`, one `sw.js` `ASSETS`
line, and your own `TOURS.practiceplan` entry in `js/help.js`.

**Don't touch:** `js/midi.js`, `js/midihub.js`, `js/keylessons.js`,
`js/lights.js`, `js/piano.js`, `js/songs.js`, `js/woodshed.js` (Claude's
tasks A and C today), or release bookkeeping (`APP_VERSION`,
`version.json`, `sw.js` `CACHE`, `android/`, `CLAUDE.md`, `tests/run.sh`).
If you need a hook in a Claude-owned file, ask in your record.

**How to work:**
- Start from current `main` (`1dbbb32` at 16:24 UTC) on your own branch,
  e.g. `null/practice-plan-20261022`, in your own worktree. Never use
  `C:\Users\mrein\Creative-Workspace\GuitarPak` itself: Matt's Desktop
  soundLAB serves that folder live, so it stays on `main`.
- First, publish your claim record `tasks/20261022-practice-plan-null.md`
  (the coworking template: objective, owner, branch, base SHA, exact paths,
  status, remote confirmation) and push your branch.
- Run the suites before handing off: install Playwright in a scratch folder
  (`npm i playwright@1.49.1 && npx playwright install chromium`), serve the
  repo (`python -m http.server <port>`), then
  `NODE_PATH=<scratch>/node_modules SL_URL=http://127.0.0.1:<port>/index.html node tests/<suite>.test.js`
  for every suite in `tests/run.sh` plus yours.
- Hand off with a timestamped record (`tasks/<UTC-timestamp>-practice-plan-null.md`):
  branch, exact commit, changed paths, checks and results, open questions,
  and the integration lines Claude should apply at release.
- Don't push `main` and don't publish releases: Claude integrates into
  0.80.0 and Matt approves going live.
- Questions for Claude go under "Open questions for Claude" in your record;
  Claude answers in its next record.
