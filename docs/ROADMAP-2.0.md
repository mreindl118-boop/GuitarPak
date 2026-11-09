# soundLAB 2.0 — roadmap

Decided 2026-11-09. soundLAB stops being a DAW or sampler and becomes a lesson,
practice and consistency tool for guitar, bass, keys and drums that runs on its
own and next to FL Studio. The design system is `docs/DESIGN-SYSTEM.md`.

## Decisions

- **Two apps from one codebase.** `soundLAB` = lessons, practice, consistency,
  LUMI lights. `soundLAB Gear` (working name, `gear.html`) = MODX live control
  (knobs, scenes, Live sets), the Helix page and the MIDI Hub tools (rules,
  SysEx, monitor). Deep synth editing stays with the makers' editors.
- **Cut:** the Studio space (Timeline, Editor, Song, Ideas, capture), the
  sequencer/arranger, the sampler and its browser database, the JS plug-in API,
  the Trainer page (folded into Plan + Exercises), the Synth pill (a sound
  picker on Piano), the LUMI pill (folded into Keys lessons). The synth and
  drum SOUNDS stay as a library for Piano, Jam and Woodshed.
- **Keep and upgrade:** Exercises, Keys lessons, Chords (now + next chord on the
  LUMI), Circle, Plan (teacher homework → weekly plan), Neck/Tab/Notation,
  Woodshed, Songs (full library incl. PDF, MusicXML; sheet-music recognition
  researched last), Jam (slim backing band), Pads (rebuilt as rhythm practice:
  drum rudiments), Tuner, Metronome, Lights & help, Settings.
- **Four instruments, one kit.** Guitar, bass (incl. 5-string fretless), keys and
  drums each get lessons, exercises, Woodshed, Help levels, plan blocks and
  progress. Note input on every practice page: audio interface direct input
  (pitch detection), any MIDI source (incl. a MIDI guitar), and later the FL
  track's audio.
- **Note colors:** by scale degree (default; the 1 is always the 1 color in
  every key) or by note name; the same on screen and on the LUMI. Switch in
  the key bar.
- **Consistency:** streaks, daily goal and weekly review in the app; practice
  blocks as a calendar feed; the weekly plan + progress exported to a Drive
  folder.
- **FL Studio:** side by side over MIDI first (loopback port; Windows MIDI
  Services makes ports shareable), a real VST3/CLAP plugin window after 2.0.
- **Look:** "E · Stage" (dark stage, amber, Bebas headlines, one thing on
  screen, instrument hero, shared key bar).
- **Shipping:** 2.0 grows on branch `v2`, published to the beta address
  `https://mreindl118-boop.github.io/GuitarPak/next/` by
  `.github/workflows/pages-next.yml` after the full test suite passes. The live
  app stays on `main`. The main address flips at the release.

## Phases

| # | Phase | Scope | Needs |
|---|---|---|---|
| 0 | Set up | `v2` branch, beta workflow, design tokens, this roadmap | — |
| A | Trim | remove the Studio space, sequencer, sampler, plug-in API; fold Trainer, Synth pill, LUMI pill; move Synth tab + Helix behind `gear.html`; storage prefix for 2.0 (`soundlab2.*`, one-time import of `guitarlab.*` at the flip) | 0 |
| B | Design system + shell | components, key bar, new home, nav, sheets; every kept page re-skinned; light theme | A |
| B0 | Instrument matrix | gap list per instrument × kit item; each gap becomes a Phase C task | A |
| C | Education core | bass lessons, drum rudiments (Pads + Woodshed drums), Keys + Exercises upgrades, next-chord lights, slim Jam, degree colors default | B, B0 |
| D | Consistency | Plan upgrade, streak/goal/review on home, calendar feed, Drive export | B |
| E | LUMI | one lighting engine everywhere; now + next chord; scale from the key bar or FL | A, C |
| F | FL side by side | loopback MIDI in; FL MIDI Out → soundLAB; controller-script spike; setup guide | E |
| G | Songs library | library schema, PDF viewer, MusicXML/MIDI → Woodshed, per-song progress | C |
| G2 | Sheet-music recognition | research prototype; never blocks 2.0 | G |
| H | Gear app | `gear.html`: MODX live control, Helix page, Hub tools; same design system | A, B |
| I | 2.0 release | tests, docs, main address flips; Android app follows (no new APK) | all |
| J | After 2.0 | FL plugin shell (VST3 + CLAP, web view), G2 if proven | I |

## Rules for the build

- One phase = one or more draft pull requests into `v2`; the owner merges.
- Nothing lands on `main` before Phase I except the deployment plumbing.
- Tests green before every merge; add suites for new features.
- Private songs, teacher material and signing keys never enter the repo.
- Phase 0 beta caveats: the beta and the live app share the browser origin, so
  they share `localStorage` until Phase A adds the `soundlab2.*` prefix, and
  the live service worker clears the beta's cache whenever the live app
  updates (the beta refills on the next visit).
