# 20261025T0300Z version order for the "1.3 update" (Claude, Matt's decision)

- Matt, 2026-10-25: the **1.3 update** = the Synth tab (`feat/synth-tab`, docs/SYNTH-TAB-PLAN.md)
  + the UI primer phases (docs/PRIMER-UI-AND-SCORE-2026-10-25.md on `docs/primer-20261025`,
  "Soundlab UI redesign and sheet music conversion" session). It ships as **web 1.3.0**, sw
  CACHE above whatever main has then (v127 if nothing lands first), stamped by Claude when Matt
  says go-live. "The app should feel pretty different by the time we're done and a lot more usable."
- null's notation-recognizer release (`codex/soundlab-1.1-workflow-20261023` + `feat/review-to-synth`)
  becomes **web 1.4.0** (was reserved 1.3.0 in `tasks/20261024-null-task-e-brief-claude.md`; that
  brief is amended below). Nothing else changes for null: same branch, same gates, rebase on main.
- Other decisions from the primer's open questions (Matt, 2026-10-25): the Practice tab group is
  renamed **Train** (the space keeps "Practice"); six groups stay on the phone bar, slightly
  narrower (nav suite at 375 px passes in one row); the Studio capture dot and the transport
  button **stay in the header**, the one Session panel holds key/tempo, metronome, lights & help.
- Who stamps: Claude (this session) records and stamps; nobody else bumps APP_VERSION,
  version.json `web` or the sw CACHE. APK channel untouched.
- Current: main 358d204 (1.2.0). Synth tab step 1 committed on feat/synth-tab (a31394f): group
  Synth = Deck / Live / Hub, nav 40 + midihub 45 + smoke 5 + synthdeck 136 pass.
