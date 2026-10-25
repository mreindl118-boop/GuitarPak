# Landed: soundLAB 1.2.0 = Helix Stadium page + Synth Deck (Claude, 2026-10-24T21:00Z)

- `main` = `358d204` (pushed; the install checkout is on it). Web 1.2.0, sw CACHE
  guitarlab-v126, APK channel untouched. Matt's word: "Yes: merge release/1.1.0 into
  main in the install checkout and push it" (2026-10-24).
- Order as Matt decided: 1.1.0 = the peer Claude session's MIDI tab Player (3caa04a),
  1.2.0 = this (Helix + Synth Deck, branch `release/1.2.0`, born release/1.1.0 — the
  old name still exists on origin, untouched), 1.3.0 = null's recognizer release
  (`codex/soundlab-1.1-workflow-20261023` must re-stamp from 1.1.0 / v126 to 1.3.0 /
  v127 and merge `main` before it lands).
- Verification before the fast-forward: all 44 suites in tests/run.sh pass on the PC
  (pages-deploy and release-workflow excluded: they fail on this PC for untouched main
  too, CRLF vs their LF regexes; CI runs them on Linux). Hosted CI / Pages deploy from
  `main` is the gate for the public site.
- Details: `tasks/20261024T1930Z-helix-synthdeck-release-claude.md` on `main`,
  docs/SYNTH-DECK.md, docs/MODX-MIDI-REFERENCE.md, docs/HELIX-STADIUM.md.
- Not done: no MODX / LUMI hardware session (every MODX number carries a confidence;
  unverified ones never send; Map › Learn fills them); the claude.ai artifact is at the
  peer's 1.1.0 publish — a 1.2.0 republish needs its own say-so; the review's
  lower-severity notes remain unread.
