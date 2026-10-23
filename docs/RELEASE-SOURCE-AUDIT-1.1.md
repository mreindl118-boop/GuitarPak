# SoundLab 1.1 source audit

Read-only release-source checkpoint, **2026-10-23 18:09 UTC**, on `codex/soundlab-1.1-workflow-20261023`.

The comparison baseline is published 1.0 commit `2077f3bbe663d30ea228e7d3beebcedb4b2baf93`. The branch advanced from `f02d9ea6984f187348ec437e70e17871b6c82d3d` to `5c097ab4c14e6e4ec432bb2bd25b352725ef46c3` during the checkpoint; automatic-recognition additions were still in the working tree. This is an audit of observed source, not a frozen-release or hosted-CI approval.

## Checks

- Inspected 319 changed/new candidate files. All 67 JavaScript/MJS files present in that scan passed `node --check`. The subsequently added `tests/pending-recovery.test.js` also passed syntax checking; its owner's final source and regression result remain part of integration validation.
- All **50 scripts referenced by the app shell and five stylesheets** exist and appear in the **362 unique** current service-worker asset paths. Every path stays under a `/GuitarPak/` project prefix; none is missing or escapes the project directory.
- All **201 PDF.js** and **16 OMR** vendor-manifest entries match their recorded SHA-256 and exact byte count and are covered by the offline asset list. PDF.js Apache notices, the eligible OMR model/code MIT licenses, and ONNX Runtime MIT/third-party notices are present. The NC model is absent.
- No high-confidence plaintext private-key, GitHub-token or AWS-access-key match was found in candidate text. Candidate paths contain no accidental dependency caches, virtual environments, credential files, downloaded archives, native executables or APK changes. Original fixture and vendor provenance are documented separately; this pattern scan is not a claim to prove the absence of every possible secret.
- The app/feed web version is **1.1.0** and the APK feed channel remains **0.75.0**. Feed notes now describe limited local automatic recognition into unverified drafts and retain the unsupported/unvalidated scope.
- `.github/workflows` has **no diff from the published 1.0 baseline**. The immutable tag/release job exits unless `version.json.web` is exactly `1.0.0`, and its only tag is `v1.0.0`. It contains no automatic 1.1 tag/release path. The existing main-triggered Pages synchronization remains unchanged; keeping a candidate off remote main remains necessary while publication is held.
- After active runner processes finished, the integration owner added `omr-engine`, `omr-review`, `omr-seam`, `omr-staff-detection`, `omr-offline` and `pending-recovery` to the default `tests/run.sh` list. This audit did not edit the active runner.

## Validation boundaries

The actual project-scope service-worker/IndexedDB/local-model offline check separately passed 15 assertions; the engine suite passed 34. These results do not replace the integration owner's complete regression and exact-source hosted CI. Hosted CI for the final candidate was pending at this checkpoint. The unchanged push-trigger allowlist names the earlier consolidation branch; pull-request CI remains available for all source branches.

The managed cloud environment blocks the two original `file://` update cases: bundled-copy stale-APK download-loop prevention and bundled-copy newer-APK download offering. Supported HTTP checks do not cover those two cases, so they remain **not executed here**, not passed. The real HTTPS-style PWA offline model test uses an actual local HTTP project origin and installed service worker; it does not bypass the `file://` restriction.

No remote mutation, credential change, deployment, release creation or hardware validation was performed by this audit. Machine-readable checkpoint evidence is stored outside the repository at `soundlab-evidence/omr-lab/release-source-audit.json` in the saved cloud workspace.
