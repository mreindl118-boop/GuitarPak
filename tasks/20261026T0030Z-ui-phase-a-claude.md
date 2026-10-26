# 20261026T0030Z UI phase A (A2 + A3) claim and landing (Claude, UI session)

Owner / sole writer: Claude, the "Soundlab UI redesign and sheet music conversion" session.
Matt's go (his chat, 2026-10-26): "start phases A2 and A3 here now on a branch cut from
feat/synth-tab at 04b2963: the header button style and the copy diet. Commit per phase and
send each landing to the Synth tab session."

- Branch `feat/ui-phase-a`, cut from `feat/synth-tab` 04b2963 (= PR mreindl118-boop/GuitarPak#88),
  worktree `%TEMP%\sl-ui-a`. Not pushed; its own PR on Matt's go, after #88.
- A2 landed: 8952007 — `css/style.css` (#ctx-btn joins `.tb-tools .icon-btn`; caret + capture dot
  repositioned) and `tests/context-global.test.js` (contrast check resolves a transparent
  background through the top bar).
- A3 (same branch, next commit): `js/learn-instruments.js` (one-line card + tips disclosure, ids
  unchanged), `js/quiz.js` (#qz-category = "<Instrument> exercises"; strip note = goal + lifetime
  XP), `js/woodshed.js` (the score-scope paragraph leaves the guided card), `js/help.js` (Exercises
  tour gains "Your instrument"; "Your day" carries the consistency caveat; Woodshed "Feed it
  music" carries the score-scope note), `README.md` + `CLAUDE.md` (Train rename in copy),
  `docs/RELEASE-1.3-CHECKLIST.md` (2.2, 2.3 ticked).
- Claims while phase A/B run: the files above plus, for phase B, `index.html` (#ctxbar /
  #sheet-lights / #sheet-metronome), `js/app.js` sheet + ctx code (NOT the GROUPS/nav lines),
  `js/lights.js`, `js/metronome.js`, `js/piano.js` (#pn-assist + the practice strip),
  `js/practice-progress-ui.js` (instrument select only), `css/style.css`, and the suites
  nav / context-global / display-master / lights / keys / learn-instruments / quiz.
  NOT touched: `js/synthtab.js`, `js/synthdeck*.js`, `js/midihub.js`, `js/songs.js`, the Synth
  group lines in GROUPS, `js/omr/*`, release stamps.
- Suites run on the PC against the worktree (context-global, nav, smoke, quiz, learn-instruments,
  game, performance, practice, practice-progress-ui); results in the A3 commit message.

## Landed (2026-10-26)

- `feat/ui-phase-a` = 04b2963 + A2 8952007 + A3 26b0668 + tests 07011bd (context suite: matrix gains
  deck/liveset; clef assertions = at least 34 px and the same box as its neighbours; contrast
  helper resolves ghost/tinted backgrounds through the top bar). Not pushed; PR on Matt's go.
- Suites green on the PC against the branch: context-global 88, nav 40, smoke, quiz,
  learn-instruments, game, performance, practice, practice-progress-ui.
- Phase B not started; waits for Matt's go in the UI session's chat.
