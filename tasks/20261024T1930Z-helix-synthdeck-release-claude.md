# release/1.1.0: Helix Stadium merged + Synth Deck (Claude, 2026-10-24T19:30Z)

- Author / sole writer: Claude. Branch `release/1.1.0` (pushed), worktree
  `C:\Users\mrein\AppData\Local\Temp\sl-110`. NOT merged to `main`, not live, the
  claude.ai artifact untouched. Matt decides the merge order against null's
  `codex/soundlab-1.1-workflow-20261023` (also web 1.1.0; sw CACHE v126) and the peer
  session's `feat/hub-player`: first on `main` keeps 1.1.0, the other re-stamps 1.2.0
  with a higher CACHE (claim record 20261024T1800Z on coord/cowork-20261022-claude).

## What is on the branch

1. `feat/helix-stadium` merged (3951e6c): Guitar › Helix page. Its MIDI request now
   waits for `midi.wanted` (the Hub's rule; context-global's no-prompt check).
2. Synth Deck in the MIDI Hub's Control view: `js/synthdeck.js`, `js/synthdeck-scope.js`,
   `js/synthdeck-maps.js`, `data/modx-performances.json` (2,143 MODX names),
   `docs/SYNTH-DECK.md`, `docs/MODX-MIDI-REFERENCE.md` (research with sources +
   confidence), Hub hooks in `js/midihub.js`, help tour, README/CLAUDE.md, sw CACHE
   v125, APP_VERSION / version.json web 1.1.0 (APK channel untouched).

## Verification (PC, Playwright 1.49.1)

All suites in tests/run.sh pass except `pages-deploy` and `release-workflow`, which
fail identically on untouched `main` on this PC (CRLF checkout vs their LF regexes;
they pass in CI on Linux). New: synthdeck 137 checks, synthdeck-scope 42. Browser
check of every deck tab at laptop and 375 px width. An adversarial review (3 lenses,
2 skeptics per finding) confirmed two defects, both fixed: the native-platform LUMI
guard (the Hub now reports the service's single route on Android/iOS) and imported
Part keys with leading zeros. The full review output is in this session's scratchpad
only; remaining lower-severity items were not read before the session's usage limit.

## Not done / hardware

No MODX or LUMI session: every MODX number carries a confidence; `unverified` ones
never send; MIDI Learn fills them. Hardware gate listed in docs/SYNTH-DECK.md.
No artifact republish (needs its own authorization).
