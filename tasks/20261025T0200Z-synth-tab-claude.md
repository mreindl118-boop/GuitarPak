# 20261025T0200Z synth-tab (Claude)

- Objective: the Synth Deck as its own top-level **Synth** tab (Deck / Live / Hub pills),
  touch-first for the iPad, with full-snapshot presets, a preset builder/selector, Live sets in
  pages of 16, and user profiles. Plan: `docs/SYNTH-TAB-PLAN.md` (decisions agreed with Matt on
  2026-10-25: own tab; full snapshot; touch-first now, native iPad app later; MODX-style pages).
- Authorization: Matt, 2026-10-25 ("improve the soundlab synth control interface to be more
  user friendly ... make it its own tab ... working on the ipad too ... preset builder/selector
  ... user settings and presets for live set mode the works"). No pushes, no release stamps, no
  artifact publishing without his say-so.
- Owner / sole record writer: Claude. Branch `feat/synth-tab`, worktree
  `C:\Users\mrein\AppData\Local\Temp\sl-synthtab`, base `main` 358d204 (1.2.0).
- Claimed files: `js/synthdeck.js`, `js/midihub.js`, new `js/synthtab.js`, `js/app.js` (GROUPS,
  SUB_LABELS, ICONS only), `js/help.js` (two tours), `css/style.css` (touch sizes), `docs/
  SYNTH-DECK.md` or new `docs/SYNTH-TAB.md`, `CLAUDE.md`, new `tests/synthtab.test.js`, this
  record. Depends on nothing unmerged; `check/modx-maps-claude` and `check/lumi-claude` (PRs
  open) touch other files (`synthdeck-maps.js`, `midi.js`) — merge order free.
- Remote confirmation: main `358d204`; open PR branches `check/modx-maps-claude` (e6ce52c),
  `check/lumi-claude` (5cdc826); null's `codex/soundlab-1.1-workflow-20261023` touches
  score/OMR files only; Helix session's `release/1.2.0` is merged. No other claim on
  `js/synthdeck.js` / `js/midihub.js` known.
- Status 2026-10-25: steps 1-6 built on `feat/synth-tab` (a31394f step 1, 89e8ff1 step 2, 15aad10
  step 3, fa9e08f step 4, 67a45d1 step 5, step 6 = this commit): the Synth group, the Deck's
  perform face (strips, row picker, Assign names from the dump, chips, Scenes, Explain, Perform/Edit),
  the preset builder + full snapshot, key splits in the Hub (port match, LUMI thru guard, view
  renames), Live sets (pages of 16, MODX Live Set slots, stepping, foot switch, octave buttons, Go
  live, Lock, Panic), profiles (export/import), docs/SYNTH-TAB.md, help tours, tests/synthtab.test.js
  (48). Step 7 (A1 labels Train / LUMI, primer docs cherry-picked, One Open on the Songs page +
  tests/oneopen.test.js; js/songs.js and one line in js/woodshed.js added to the claim, agreed with
  the UI session). Left for the release: rebase on main (3890488), the UI session's phases A/B + C2 "One Open",
  the device test on the iPad (Matt), stamps on Matt's go.
- Design decisions on the way (Matt, 2026-10-25): strips not knobs; the knob-row picker; Assign
  knobs named by what they control; Explain mode (didactic); data-rich slots; zones later.
