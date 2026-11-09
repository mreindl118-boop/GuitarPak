# Guided performance milestone plan — 2026-10-23

## Release addendum — 16:11 UTC

Hold publication for instrument-organized Learn/Lessons, fixed session instrument
attribution and a readable global treble-clef control. Separate implementation
owners cover Learn filtering, XP lifecycle and shell/icon accessibility; a fourth
worker adds independent session tests and a fifth reviews attribution. Integration
will rerun affected suites, mobile/offline checks and the full release gate on the
new exact commit. Historical global XP stays explicitly legacy/unassigned.
Conditional release authorization exists, but automatic review rejected public
PR creation; explicit clarification is pending and no release was published.

Authorized scope: cloud coding only, no hardware dependency, remote writes or publication. Preserve the branch audit, independent treble-clef Scale Lock/LUMI Display controls, comprehensive built-in pitched-note guard and exact output cleanup.

1. **Verify reusable sources and engines.** Inspect Woodshed, Songs, Keys lessons, notation, MIDI/ASCII import and available exercise data. Define one structured sequence contract with real note/chord/rest/duration semantics; document unsupported PDF/image/plain prose and unsupported import semantics honestly.
2. **Implement the performance core.** Wait for Me and Play at Tempo share source/target normalization, raw-input grading, repeated-note release/rearticulation, chord/rest rules, count-in, tempo/pause clock, restart/section loop state and final accuracy/error/timing breakdown. Reuse established timing/source engines where compatible. Keep scoring ahead of scale-locked sound output.
3. **Integrate the first-class player.** Clean desktop/mobile controls, current/upcoming note/score view, MIDI and virtual input, selected source/exercise, optional shared LUMI targets. Use existing root/scale and independent dropdown toggles. Include original generated demo material and actual supported structured imports.
4. **Verify and review.** Deterministic clock/sequence tests; complete browser flows for both modes, pause/resume/restart/tempo/loop, repeated notes/chords/rests and blocked wrong notes; per-context LUMI/cleanup checks; independent review; affected regressions and local reviewable commit/patch.

## Checkpoint before expansion

Canonical source verified: mreindl118-boop/GuitarPak main 6a5891f (web 0.82.0). All 18 related GuitarPak heads plus Sampler-DAW/HealLicks refs audited; source branches preserved. Working branch codex/soundlab-lumi-consolidation-20261023.

Completed earlier slice: guided LUMI note/triad page, independent synth input/sound output/display output, raw grading, exact output ownership, paired note/pedal cleanup and quiz-correction recovery. Initial 22 permitted regression suites and independent three-device simulation passed. Existing update suite's two file:// cases are policy-blocked (six HTTP cases passed); no bypass attempted.

Expanded global lock: admission/cleanup implemented in guitar/Piano, DAW synth/sampler/Jam and public MIDI/Hub; 14 root audio checks, 64 DAW/audio checks, additional MIDI checks passing. New master Display API and shared dropdown controls are under verification. Four-context LUMI wiring/tests are in progress. These earlier counts are not represented as validation of the new performance feature.
