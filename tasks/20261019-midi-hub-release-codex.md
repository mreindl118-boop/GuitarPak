# 20261019-midi-hub-release-codex

- Owner / sole writer: Codex StudioBook. Source contributor: Claude; Claude source approval/cross-review is required before publishing main. Status: claimed for integration/validation; production release pending review.
- Created / updated: 2026-10-19T18:59:36.072Z. Review at each changed remote head and before release.
- Authorization: Matt explicitly requests integrating Claude's MIDI Hub into SoundLab/GuitarPak and publishing the next minor release; later authorizes a separate safe LUMI-display/MODX-answer scaffold. This task's release is MIDI Hub only. No Score work, Pi access, device commands, firmware/patch writes, access/credential/signing changes or unrelated apps.
- Repository: mreindl118-boop/GuitarPak; owned branch codex/midi-hub-release-0.78.0-20261019; remote base 64be12efe20e87bc74c79cf7297902f6617bc213. Existing Pages/updater target only.
- Source: Claude's local feat/midi-hub at bf55d2819ef2cd1bb2c8d6d6f0b2c8db50b74a80, parent current main, source tree efecd847f77a9c8fb5b2430032e4de137c4a948b. Original checkout C:\Users\mrein\Creative-Workspace\GuitarPak remains untouched.
- Owned workspace: C:\Users\mrein\Documents\Codex\2026-10-19\task\soundlab-midi-release. Received tracked-source/index snapshot retains source history. Three received script mode differences (android/build.sh, ios/sync-web.sh, tests/run.sh) are preserved and excluded from source integration.
- Release version: next available web minor 0.78.0 from published 0.77.2. No GitHub Releases or tag refs were returned; original MIDI Hub commit already prepares 0.78.0. APK version remains the actual existing 0.75.0 unless a verified authorized build is separately necessary.
- Claimed paths: js/midihub.js and focused MIDI safety/platform fixes in js/midi.js; original MIDI Hub wiring in js/app.js,index.html,sw.js,css/style.css,js/help.js; tests/midihub.test.js and affected focused regressions; version.json and What's New; CLAUDE.md factual module instructions; own README Current work row; this task and docs/releases/0.78.0-codex.md. Preserve unrelated source, original author attribution, binaries, source branches and other contributor rows.
- Remote checks: six branches and open draft PR83 inspected; PR83 changes only the separate docs branch README pointer. main 64be12e; gh-pages e2012b8ed3a8ec2f132f7c159991c8d91dce46a8. GeneralStorage Claude acknowledgement has no active SoundLab source claim and is older than today's local feature work; therefore Claude review/approval of the exact feature/release remains pending, not assumed.
- Release flow: preserve .github/workflows/pages.yml and existing update behavior; focused mock browser suites plus required existing regressions; explicitly no claim of real MIDI hardware success. Do not merge/publish until exact review gate is met.
- Hardware: earlier enumeration exposed no LUMI/MODX ports. Matt will connect them at home. Do not poll. Hardware validation is separate and pending, and does not itself block a safe generic MIDI Hub release.
- Next: verify published claim, isolate clean source branch, review existing MIDI safeguards/fallback, run existing tests, publish a reviewable PR with exact evidence, obtain Claude review, then release to the existing channel only if gates permit. No self-check-in scheduled.

## Deadline lanes — 2026-10-19T19:03:10.195Z

Matt explicitly authorizes parallel local workers and final integration for the 20:30 UTC deadline. Root Codex is sole final integrator/release writer; no worker publishes remotely. These scopes are additive to the release claim and remain separate reviewable commits:

| Lane | Worktree / local branch | Sole writable source paths |
| --- | --- | --- |
| MIDI safety/UI | soundlab-midi-release/safety / codex/sl-safety-0780-20261019 | js/midi.js; js/midihub.js; tests/midihub.test.js; new tests/midi-ports.test.js |
| LUMI practice scaffold | soundlab-midi-release/lumi / codex/sl-lumi-0780-20261019 | new js/lumi-practice.js; css/lumi-practice.css; tests/lumi-practice.test.js; docs/LUMI-PRACTICE.md |
| Score MVP | soundlab-midi-release/score / codex/sl-score-0780-20261019 | new js/score.js; css/score.css; tests/score.test.js; docs/SCORE.md; tests/fixtures/score/ |
| Helix Stadium XL | soundlab-midi-release/helix / codex/sl-helix-0780-20261019 | new js/helix-stadium.js; css/helix-stadium.css; tests/helix-stadium.test.js; docs/HELIX-STADIUM.md |
| Final integration | soundlab-midi-release/integration / codex/sl-integration-0780-20261019 | shared app navigation/index/service-worker/version/What's New, own README/task/release docs; merge reviewed lane commits, resolve integration only |

All worktrees use the independently retained Claude source commit bf55d2819ef2cd1bb2c8d6d6f0b2c8db50b74a80. Original active checkout and dirty script mode state remain untouched. Independent Web MIDI port APIs are owned by the safety lane; other lanes use that agreed contract without editing shared MIDI source. Hardware actions are forbidden during development/tests. Score import limitations must reject unsupported constructs explicitly and preserve originals; PDF/photo/audio transcription is not part of this deadline slice. Helix profile is firmware-labeled, explicit output arm only, documented commands, no Showcase/patch/audio routing changes. LUMI is experimental with output off until explicit test/arm, isolated Yamaha answer input, and transient note cleanup; no SysEx/custom programs.

Pi pitendo64 is not authorized for tasks and will not be accessed. This does not block the independent SoundLab lanes. Contributor review and CI remain release gates; the deadline does not replace them. A smaller safe slice can ship while incomplete lanes remain staged separately.

## Public documentation and music-library scope — 2026-10-19T19:15:10.375Z

- Automatic review rejected publishing the changed full CLAUDE.md because it repeats private artifact references and signing-workflow details. That file will remain byte-for-byte equal to current main; it will not be uploaded through another route. Public usage instructions move to new docs/MIDI-HUB.md.
- Root additionally owns new js/release-notes.js, tests/release.test.js, .github/workflows/validate.yml and docs/releases/0.78.0-codex.md for nonblocking What's New/history, scoped cache/update checks and PR CI. Existing Pages and APK workflows are preserved. No signing or credential changes.
- Matt explicitly requests a private local music library inside existing SoundLab, not a new GitHub repository. The existing Score worker additionally owns new js/music-library.js, css/music-library.css, tests/music-library.test.js, docs/MUSIC-LIBRARY.md and may amend its own js/score.js/tests/score.test.js to mount it.
- Library originals (PDF/images/MusicXML/MXL/MIDI) and versioned derived outputs remain browser-local/private; no user scores or raw personal inputs enter Git or public fixtures. Metadata is explicit or unknown, with provenance/status; preview is not recognition. Recognition/transcription remain unavailable unless implemented and validated. Package export must preserve original bytes and expose only actually available outputs.
- Root wires only the new module/CSS/cache assets. No worker edits another worker's files. Incomplete library work can remain staged separately rather than compromise the smaller reviewed MIDI Hub release.
