# Claim: Helix merge + Synth Deck release branch (Claude, 2026-10-24T18:00Z)

- Author / sole writer: Claude (the session Matt opened with "merge helix controls
  and fix the sound lab to be able to actually control sound parameters easily …
  presets, dials buttons knobs everything", then "understand what the sequencer is
  doing visually … arpeggiator … motion seq … full suite of controls that the
  MODX has … build store presets … access/load presets").
- Branch: `release/1.1.0` (pushed, `e90cc7b` + the Synth Deck commits that follow),
  worktree `C:\Users\mrein\AppData\Local\Temp\sl-110`. Never the install checkout.
- Status: IN PROGRESS. `feat/helix-stadium` is merged (3951e6c; all suites green,
  the Helix isolation check updated for the 1.0.0 lighting engine). The Synth Deck
  (js/synthdeck.js, js/synthdeck-scope.js, js/synthdeck-maps.js, data/
  modx-performances.json, docs/SYNTH-DECK.md, docs/MODX-MIDI-REFERENCE.md, suites
  synthdeck + synthdeck-scope) is being written now; js/midihub.js already carries
  the additive hooks (HUB_API, mount points, knobSet/wireKnobs/paintKnob widenings,
  sendProgram(pg, msb, lsb), kv cache). Nothing is merged to `main`; nothing is
  live; the claude.ai artifact is untouched. Going live needs Matt's say-so.

## Path claims (Claude, until this record says done)

`js/midihub.js`, `js/synthdeck*.js`, `data/`, `docs/SYNTH-DECK.md`,
`docs/MODX-MIDI-REFERENCE.md`, `tests/synthdeck*.test.js`, `tests/helix.test.js`,
and release bookkeeping on this branch (`js/app.js` APP_VERSION, `version.json`
web/notes, `sw.js` CACHE, `index.html` script tags, `tests/run.sh`, `js/help.js`
TOURS.midihub, README/CLAUDE.md entries, the artifact + APK asset lists).

## Version collision (raised by the "Yamaha MOD8X MIDI USB controller" session)

Two candidates both say web 1.1.0: null's `codex/soundlab-1.1-workflow-20261023`
(recognition release; Matt asked null to finish and ship it) and this branch
(Helix + Synth Deck; CACHE guitarlab-v125, null's branch says v126). Rule
proposed and accepted: **whichever lands on `main` first is 1.1.0; the other
re-stamps to 1.2.0 and bumps its sw CACHE above the landed one** (three stamps:
`APP_VERSION`, `version.json` `web` + notes, `sw.js` CACHE; never `version`, the
APK channel). Matt picks the order. If null lands first, Claude re-stamps this
branch to 1.2.0 / guitarlab-v127 before merging.

## File collision: `feat/hub-player` (6c99335, the peer Claude session)

Adds a Player view to `js/midihub.js` (+ tests/midihub-player.test.js, one line
in tests/midihub.test.js). This branch reworks `knobSet`, `wireKnobs`,
`paintKnob`, `sendProgram`, the kv store and `render()` in the same file. Both
are mergeable; the peer offered to rebase the Player onto this branch if it
lands first — accepted. The Synth Deck does not touch the `#mh-views` list, so a
Player view slots in beside it; the Player should route its sends through the
Hub's `send()` / `HUB_API` like the deck does.

## Hardware

No hardware session. Every MODX number in the deck's map carries a confidence
from `docs/MODX-MIDI-REFERENCE.md`; unverified ones never send; MIDI Learn fills
them from the real synth. Hardware checks listed in docs/SYNTH-DECK.md.
