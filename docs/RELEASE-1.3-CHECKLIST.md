# soundLAB 1.3 — the checklist (agreed with Matt, 2026-10-25)

1.3.0 = the Synth tab + the UI primer's phases A, B and C2 (+ the score helper if it is ready).
Owners: "mine" = the Synth tab session (Claude, feat/synth-tab); "UI" = the "Soundlab UI redesign and
sheet music conversion" session (docs/PRIMER-UI-AND-SCORE-2026-10-25.md). Version order and the
primer's open questions: tasks/20261025T0300Z-version-order-1.3-claude.md on the coord branch.
Tick items here as they land (commit in brackets).

## 1. Synth tab (Deck / Live / Hub) — mine, docs/SYNTH-TAB-PLAN.md
- [x] 1.1 Navigation: Synth group after Keys, Hub = the MIDI Hub, Keys keeps Piano/Synth/Pads/LUMI,
      six phone tabs slightly narrower (a31394f)
- [ ] 1.2 Deck, Perform face: Now bar (sound, Part, Prev/Next, Save preset), Super Knob STRIP, four
      strips with a row picker (Favourites / Tone / Envelope / Effects / Assign 1-4 / 5-8), chips
      Arp / Motion seq / Split / Assign 1 / Assign 2 / Scenes 1-8, Perform <-> Edit, EXPLAIN mode
      (captions + Try this + long-press to Learn)
- [ ] 1.3 Touch: 44 px targets, knob drag with readout, no page scroll while a knob is held, no
      hover-only controls
- [ ] 1.4 Presets: full snapshot (sound, knobs, buttons, Scene, key split, soundLAB key/scale, LUMI
      layout); builder sheet (name, tags, colour, include checkboxes, Capture now); restore order
      program -> settle -> values -> split -> app state
- [ ] 1.5 Hub: Rules gain a port match + Split presets (below split -> Part 2; three zones); Thru
      never reaches a LUMI output; views renamed "Play" -> Keys, "Controls" -> CCs
- [ ] 1.6 Live: named sets, pages of 16 (4 x 4), slot editor (preset / MODX Live Set slot / empty),
      prev/next page, step by foot-switch CC or (option) LUMI octave buttons, Go live page; MODX Live
      Set slot recall (MSB 62)
- [ ] 1.7 Profiles: named bundles of settings + presets + sets, switcher on Live, export/import
- [ ] 1.8 iPad: 768 x 1024 touch layout in Playwright; device test in Web MIDI Browser; native
      wrapper later (needs a Mac)
- [ ] 1.9 Help tours (Deck, Live), docs (SYNTH-DECK.md or SYNTH-TAB.md, CLAUDE.md),
      tests/synthtab.test.js; synthdeck / synthdeck-scope / midihub* / nav / smoke green

## 2. UI phase A — navigation and copy — UI session
- [ ] 2.1 One vocabulary: Practice tab -> Train; "LUMI practice" -> LUMI; Learn home reads Learn;
      page ids unchanged; help tours, README, tests/nav.test.js labels
- [ ] 2.2 One header button style (#ctx-btn like its neighbours; capture dot + key/BPM title kept)
- [ ] 2.3 Copy diet: audit sentences into tours/tips; Exercises home = stats strip + Start + path

## 3. UI phase B — one Session panel — UI session
- [ ] 3.1 One right-side panel: Key & tempo / Metronome / Lights & help; one header button showing
      key + BPM, pulsing on the beat; capture dot and transport stay in the header
- [ ] 3.2 "Color notes by" and Help level exist once; Keys page stops drawing #pn-assist
- [ ] 3.3 One app-level instrument (chip in the panel; `instrument` bus event); Exercises, Woodshed
      card, Progress read it
- [ ] 3.4 Page toolbar pattern (one row + More): Keys first (keyboard above the fold at 375 px),
      then the Woodshed generators

## 4. One Open (phase C2) — mine
- [ ] 4.1 "Open a score" under Play: .mid / .musicxml / .mxl / tab text (.pdf via the helper) ->
      Play on synth / Practice (Woodshed) / Tab (Songs); Songs, Player and Woodshed inputs route
      through it; Studio keeps its own

## 5. Sheet music -> MIDI helper — UI session (1.3 if ready, else 1.4)
- [ ] 5.1 tools/score-helper.py (Matt's vector OMR, hardened) on 127.0.0.1:4576; Connect helper
      button, never auto-connects; tests/score-helper.test.js; docs/SCORE-HELPER.md

## 6. Hardware checks already done — mine, PRs open
- [x] 6.1 MODX maps checked on the MODX8+ (check/modx-maps-claude e6ce52c)
- [x] 6.2 LUMI: relight, no config-frame storms, stale-output stand-in (check/lumi-claude 5cdc826)

## 7. Release 1.3.0 — mine, on Matt's go
- [x] 7.1 Version order on the coord branch (ce8fefe): 1.3.0 = this; null's recognizer = 1.4.0
- [ ] 7.2 Stamps: APP_VERSION 1.3.0, version.json web + notes, sw.js CACHE bump + new assets; APK
      channel untouched
- [ ] 7.3 Full tests/run.sh, PR against main, Matt's go-live, artifact republish, install update
