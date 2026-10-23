# SoundLab 1.0.0 release gates

Publication is conditionally authorized only after the agreed software features
are functional and independently reviewed. This file is a working checklist,
not evidence of a release. Source branches must be preserved. No force pushes,
credential changes, paid services, hardware settings or unrelated repositories.

## Implementation and review

- [x] Verify GuitarPak main `6a5891f` as the canonical 0.82.0 baseline; inventory
  all accessible related heads, tags/releases and feature content. Preserve
  provenance and stranded feature candidates in the branch audit.
- [x] Independent clef Scale Lock / LUMI Display switches and shared root/scale.
- [x] Comprehensive built-in pitched sound/output guards, paired cleanup and
  explicit opaque-audio/custom-plugin/hardware Local Control exclusions.
- [x] Actual target guidance in lessons, sheet exercises, Exercises and scale
  practice; no invented pitches for unsupported sources.
- [x] In-app piano roll, target keyboard, upcoming notes and accessible feedback.
- [x] Wait for Me and Play at Tempo, scoring, transport, transpose and loops.
- [x] Shared quantized palette, Intervals / Note Names, natural-anchor blends,
  protocol provenance and explicit firmware/perceptual limitations.
- [x] Stateful Web/native MIDI ingress and independent input-replacement review.
- [x] Configurable per-instrument XP, consistency decay, daily goals/history and
  observed metrics; deterministic calendar/anti-duplicate tests and UI review.
- [x] Shared monophonic audio input adapter, calibration, onset/silence gating,
  incompatible-chord handling, synthetic signal tests and full practice flows.
- [x] Independent feature review, including adversarial XP and pending audio capture lifecycle.
- [ ] Exact release-commit regression and offline/mobile/color-mode evidence.

## Intended release surface and process

1. Complete staged local commits and final changelog. Inspect the entire diff
   for accidental data/secrets, generated artifacts and unrelated changes.
2. Update **web** `App.version` and `version.json.web` to 1.0.0; advance the
   service-worker cache. Keep `version.json.version` at APK 0.75.0 and preserve
   APK/native binaries: this is a web/PWA release, not a newly built wrapper.
3. Fetch remote refs and verify current main can be advanced without overwriting
   others' changes. Reconcile/retest if it changed. Publish the review branch
   and use the repository's normal review/main workflow with ordinary pushes.
   A review-branch push is permitted to run hosted CI after the local feature
   gates pass. Main/tag/release publication waits for the complete hosted gate;
   any unmet condition is reported to the parent thread first.
4. Main triggers the existing GitHub Pages workflow. Replace its previous
   forced gh-pages rewrite with an append-only deployment commit and ordinary
   push, preserving both source and deployment histories. Test this exact
   workflow locally before relying on it. A workflow GITHUB_TOKEN push does not
   trigger Pages: the already-connected GitHub app must append the publishing
   snapshot through its existing access. No new token/scope or Pages setting
   is authorized. Public assets must match the tested source before release.
5. Create annotated `v1.0.0` at the verified release main commit and a GitHub
   release with changelog and capability limits. Source archives are the release
   artifacts; do not relabel the existing APK as a new 1.0.0 native build.
6. Verify remote main/tag SHAs, release metadata, workflow status, deployed
   version/assets and an actual HTTP/PWA load. Record URLs and exact commit.

## Known validation boundaries

The managed cloud Chromium denies two existing update tests using `file://`
with `ERR_BLOCKED_BY_ADMINISTRATOR`; six HTTP/shell cases passed, and PWA/offline
behavior is tested separately. HTTP cannot prove the denied protocol branch.
No security-policy bypass is authorized. Report this exact unresolved check
before publication. The optional AAPT/native wrapper inspection is unavailable.

MIDI/audio/LED checks use simulations and rendered synthetic signals. Hardware
LED response, installed board program/firmware, instrument Local Control, real
input latency/noise and drivers are unverified. Mono audio must be described as
mono; arbitrary polyphonic audio is unsupported. These limitations belong in
release notes and capability UI, not in hidden assumptions.

## Rollback

Record pre-release main and gh-pages SHAs. Roll back web source through a normal
revert commit (no history rewrite), increment the cache revision, and let the
append-only Pages workflow deploy the reverted tree. Keep `v1.0.0` immutable;
mark the release withdrawn or publish a corrective patch version. Keep progress
storage versioned and exportable; no destructive migration is part of 1.0.0.
Do not roll back by deleting source branches, force-pushing or replacing keys.
