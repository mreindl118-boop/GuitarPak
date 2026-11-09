# 20261022-practice-plan-null

- Objective / acceptance: task B from the Desktop brief: guided timed practice from teacher notes, measured module progress, weekly totals, source explanations, and exported module gaps.
- Owner / sole record writer: null (Codex); reviewers / participants: Matt, then Claude for release integration.
- Authorization reference / exclusions: Matt's 2026-10-22 request, "find nulk breif on desktop read and enact", and follow-up to continue implementation and testing in a separate checkout. Local implementation/testing authorized. Remote publication requires confirmation; no merge, deployment, main push, credentials, or VTT work.
- Repository: mreindl118-boop/GuitarPak
- Branch: null/practice-plan-20261022; checkout: C:\Users\mrein\Documents\Codex\2026-10-22\task\soundlab-practice-plan
- Base commit: current 0e0600c3408e07e0e5b555c74f03219f9e84111f (0.80.0); started from 1dbbb326f60e05d76d891090f0c07f1ec533020f (0.79.0).
- Claimed files / path prefixes: js/practiceplan.js; tests/practiceplan.test.js; docs/PRACTICE-PLAN.md; tasks/*-practice-plan-null.md; index.html (panel/script only); js/app.js (practiceplan page/nav labels only); sw.js (ASSETS entry only); js/help.js (TOURS.practiceplan only).
- Created / updated: 2026-10-22T16:37:06Z
- Status: ready-for-review locally; claim and feature branch unpublished pending publishing approval.
- Remote confirmation: fetch all origin branches completed 2026-10-22T16:36Z. origin/main = 1dbbb326f60e05d76d891090f0c07f1ec533020f; origin/coord/cowork-20261022-claude = 2eae52a4d2527fa03de790d51f1a17ae5aa844f9. All current branch task paths checked; read split/synth-control/lumi-display-aid records. No new practice-plan claim found. PR check recorded in handoff.
- Claim review time / blockers: recheck before any publication. The coworking convention asks for publication before edits; the parent explicitly authorized separate-checkout implementation/testing while requiring separate reporting of publication. This unpublished local draft does not claim a remote lock or acknowledgement.
- Evidence: Desktop 20261022-null-brief-claude.md; coordination split on origin/coord/cowork-20261022-claude; main CLAUDE.md; GeneralStorage docs/coworking-20261018 coworking README.
- Next action / next owner; transfer acknowledgement: implement and test locally, prepare exact-commit handoff for Matt. Claude transfer acknowledgement pending.

## Navigation and integration

Use Learn > Plan (page title Practice plan), retaining Exercises as Learn's home and all existing group defaults. The short pill avoids a second header row at 360px. Only the bounded integration lines listed above are changed. Release bookkeeping and tests/run.sh remain with Claude.

## Open questions for Claude

Tracked in the final handoff after implementation and verification.

## Local checkpoint, 2026-10-22T16:54Z

Implementation, focused tests, and documentation are complete locally. Publication and repository handoff to Claude remain pending Matt's approval. The parent reported that automatic permission review rejected its proposed authorization for those steps and instructed no retry or workaround; no push or external message has been attempted in this task.

Refetched all remote branches at 2026-10-22T16:52Z. Remote main remains 1dbbb326f60e05d76d891090f0c07f1ec533020f. Coordination is now 21c8533; read the new synth/LUMI handoffs (feat/synth-control 3c09036, feat/lumi-display-aid 0e0600c), including their revised release sequencing: tasks A+C reserve 0.80.0 and Practice Plan ships afterward. No overlapping Practice Plan claim was found. Earlier open-PR check found PR83/84/85; their files/branches were preserved.

Read-only observation of the live install checkout: it is clean on local main at 3c09036a047b4a21ef4fcaf0dbc0f2773528f16d, advanced independently from the initial 1dbbb32 observation. This task did not modify, switch, reset, or merge in that checkout.

## Reconciled local checkpoint, 2026-10-22T17:04Z

Origin/main advanced independently to 0e0600c (0.80.0). Read the new release and acknowledgement records on coordination b858e48. Rebased this unpublished task branch cleanly onto that base; product source commit is 77c5b0645dea48ea0730dac571837d8992ab7811. No conflict resolution or live-checkout write was needed.

The acknowledgement says Claude read the local handoff, "relayed by Matt". This task sent no direct message, pushed no branch, and did not publish the handoff. Claude's acceptance of a quiz-test expectation edit is not treated as Matt's authorization to expand the brief: tests/quiz.test.js is restored unchanged, and the one-line update is only proposed in the handoff.

Port correction: stopped this task's verified Python preview processes on 4589 and 4590 after learning that the Desktop launcher uses 4590. No other process was stopped. The isolated quiet preview is now on checked alternate loopback port 4781; do not use 4590 for this task again. This corrected a preview routing collision; no source file in the live checkout was changed.

Focused verification on the reconciled base: 38 checks pass. Final original-suite results are recorded in the separate handoff. Screenshots use synthetic notes and suppress the unrelated remote-update popup only in the screenshot fixture. Publication and Claude communication remain pending Matt's approval.

Final checkpoint 2026-10-22T17:09Z: all 17 original suites completed on the updated base, 16 passing suites and one obsolete quiz-label expectation failure (556 passing checks, one failing). Full original taps passes all three viewports without suppression or fixture overrides. The precise proposed quiz expectation update is in tasks/20261022T1655Z-practice-plan-null.md; the quiz source remains unchanged. Product source 77c5b0645dea48ea0730dac571837d8992ab7811 is ready for local review, with publication and integration approvals still pending.
