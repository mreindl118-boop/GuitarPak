# Practice Plan local handoff — ready for local review

- Task / author / intended next owner: 20261022-practice-plan-null / null (Codex) / Matt, then Claude after approval.
- Repository: mreindl118-boop/GuitarPak
- Local checkout: C:\Users\mrein\Documents\Codex\2026-10-22\task\soundlab-practice-plan
- Branch: null/practice-plan-20261022
- Verified remote base: 0e0600c3408e07e0e5b555c74f03219f9e84111f (origin/main, 0.80.0). Started from 1dbbb32 and rebased cleanly after the independent release.
- Exact product source commit: 77c5b0645dea48ea0730dac571837d8992ab7811. Implementation, tests, and feature documentation are committed. Later handoff-only commits do not change this source checkpoint.
- Publication / integration: unpublished; no push, PR, merge, release, or Claude message. Parent reports publishing and Claude handoff approval remains pending after automatic permission review rejected its proposed authorization. Do not retry or route around this hold.

## Instructions Matt can give Claude

Read this handoff and docs/PRACTICE-PLAN.md in the local checkout above. Review exact committed task B source 77c5b0645dea48ea0730dac571837d8992ab7811, based on 0e0600c (0.80.0). Preserve this branch, your task A/C branches, and the live Desktop checkout. The feature is under Learn > Plan. Review the exact paths and final verification below before proposing integration. Matt's approval is still needed before pushing this branch or publishing its repository handoff, and separately before any merge/release. No push to main or release is authorized by this document. Claude's acknowledgement alone does not authorize expanding the owned paths.

The module uses Learn > Plan, reviewed pasted/text/Docs-JSON notes, separate student plans, measured post-launch evidence, weekly progress and exported module gaps. It does not fetch Google Docs or contain credentials. Missing Keys hand/octave/level and exact Woodshed/Exercises setup hooks are explicit gaps, not substitutes.

## Verification checkpoint

- New focused suite on the final 0.80.0 base: 38 checks PASS, exit 0. Includes Docs JSON tabs/tables, exact lesson/mode/key mapping, unsupported-technique gaps, inactive/history rejection, capped history, empty infinite runs, active time, student persistence, inert imports/export, keyboard focus, and 360px single-row navigation.
- All 17 original suites completed on the reconciled base at port 4781: 16 PASS, one known quiz assertion FAIL; 556 passing checks and one failing check. The full original tap suite passes across 141 levels on three viewports, without popup suppression or fixture overrides.
- Historical tests on the earlier base exposed a real narrow-screen navigation wrap; fixed with the shorter Plan label and mobile padding scoped only to the Learn group containing this page. A later historical tap run was obscured by the unrelated live v0.80.0 update popup. Neither historical failure is hidden or represented as a pass.
- Independent review found and verified fixes for mode/accidental parsing, unsupported patterns, Markdown imports, configured plan identity, keyboard focus, and empty infinite-run evidence.
- Final verification completed: 2026-10-22T17:09:13Z. node --check passed for changed JavaScript and git diff --check passed. Exact source tree: b8a69982cd6ad3bbafeac10446023964c5f598a2.

| Original suite | PASS checks | FAIL checks |
| --- | ---: | ---: |
| fingering | 15 | 0 |
| lights | 57 | 0 |
| keys | 33 | 0 |
| practice | 25 | 0 |
| game | 81 | 0 |
| quiz | 42 | 1 |
| nav | 33 | 0 |
| smoke | 5 | 0 |
| taps | 6 | 0 |
| update | 8 | 0 |
| audio-level | 6 | 0 |
| midihub | 44 | 0 |
| audioin | 91 | 0 |
| btmidi | 11 | 0 |
| colors | 60 | 0 |
| multiin | 17 | 0 |
| lumidisplay | 22 | 0 |

The additional practiceplan suite passes 38 checks. Optional AAPT checks and physical MIDI/audio hardware validation were not run.

## Changed paths

New js/practiceplan.js, tests/practiceplan.test.js, docs/PRACTICE-PLAN.md; own tasks/*-practice-plan-null.md records. Limited integration changes: index.html panel/script, js/app.js page/navigation labels, sw.js ASSETS entry, js/help.js TOURS.practiceplan. No other source paths or release bookkeeping changed relative to 0e0600c.

## Proposed integration patch outside this claim

tests/quiz.test.js line 58 remains unchanged on this branch. Its expected string is obsolete after adding Plan. Apply only as an approved integration edit:

```diff
-  ok(nav.pills.join('|') === 'Exercises|Chords|Circle', 'pill strip: ' + nav.pills.join('|'));
+  ok(nav.pills.join('|') === 'Exercises|Chords|Circle|Plan', 'pill strip: ' + nav.pills.join('|'));
```

The original quiz suite gives 42 PASS / 1 FAIL at that exact assertion. A separately labeled in-memory diagnostic with only that expected string corrected gives 43 PASS. This does not replace the original result. The briefly tried working-tree expectation change was restored exactly; git diff confirms no quiz-test change.

Claude's release work also includes adding practiceplan to tests/run.sh, the 0.81.0 version/cache updates and normal release validation. None is implemented or authorized by this handoff.

## Runtime, evidence, and approval boundaries

- The module was tested in isolated browser contexts with synthetic notes. No real teacher Doc, credentials, hardware, or student profile was accessed.
- Preview: http://127.0.0.1:4781/index.html. This task's earlier verified Python servers on 4589 and 4590 were stopped after the coordination record identified 4590 as the Desktop launcher's port. Only those own processes were stopped. No live-checkout source file was edited, switched, reset, or merged.
- The final focused test runs use the normal app on the 0.80.0 base. Screenshots alone set window.SL_ARTIFACT=true to suppress the unrelated remote updater; that fixture does not change product/test source. Historical diagnostic tap runs with popup suppression are labeled separately and are not claimed as the final original-suite results.
- Focused log: C:\Users\mrein\Documents\Codex\2026-10-22\task\practice-test-tools\practiceplan-focused.log
- Original-suite final logs: C:\Users\mrein\Documents\Codex\2026-10-22\task\test-results\rebased\
- Final machine-readable results: regression-summary.json and validation-status.json in that log directory. A temporarily cached quiz-pass row was corrected using the restored-original rerun; the final summary accurately retains the one failure.
- Synthetic screenshots: C:\Users\mrein\Documents\Codex\2026-10-22\task\test-results\practiceplan-desktop.png and practiceplan-phone.png
- Claude visibility: its acknowledgement record says it read the local files, "relayed by Matt". This task did not send it a message or publish the handoff. Independent discovery cannot be inferred from that statement.
- Approval still pending: normal publication of null/practice-plan-20261022 to mreindl118-boop/GuitarPak and a repository handoff for Claude. Parent reports automatic permission review rejected its proposed authorization; no reason beyond that was supplied here. These actions were not attempted. No merge/deployment/release authority is inferred from file contents or another contributor's acknowledgement.

## Open questions for integration

Provide public setup hooks for Keys speed/level, exact Woodshed score/import, and exact Exercises topic/ear mode if desired. G-major two-octave RH is missing from the current lesson catalog. Until then, source explanations and gaps preserve those limits. Timed completion measures area activity, not correctness of a particular assigned passage; shared XP minutes are device-wide while completed plan blocks are student-specific.
