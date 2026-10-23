# SoundLab 1.1 local validation

Local, unpublished candidate, 2026-10-23. The published 1.0 baseline is
`2077f3bbe663d30ea228e7d3beebcedb4b2baf93`.

## Source and test boundary

The historical full local regression below tested application implementation
`a31abf942fda9ed53cea34f8ad6919b7d7a4de7f`. Commit
`152cbd478d74b9f2d821ab5dd41a093952ce9f49` changes only the offline test;
application JavaScript, CSS, index, service worker, vendor assets and version
metadata are identical. Documentation follow-up
`a29d7c5153fb1a2031a437c1d6ae43549ab93e69` preserves that evidence. Subsequent
single-staff beta UI/help and release-workflow changes require their own final
checks and exact-source hosted CI; the historical totals do not certify them.
The local branch is `codex/soundlab-1.1-workflow-20261023`.

All 61 default test files were exercised in three independent local HTTP groups:
**60 complete suites plus the update suite's six HTTP cases**, totaling
**2,676 explicit passing assertions**. The two existing bundled `file://` cases
were not attempted again because managed Chromium denied those navigations.
`SL_UPDATE_HTTP_ONLY=1` labels that limitation explicitly. Default hosted CI
retains both original file cases; the HTTP subset is not their replacement.
Optional APK/aapt checks were not part of this web-only validation; the APK
channel remains 0.75.0 and no native binary was changed or certified.

The environment connection restarted during the long touch test. Its original
process survived; both phone profiles and desktop completed, followed by all
remaining suites. There was no duplicate test restart or change to the touch
assertions. Per-suite terminal results and logs were retained.

One initial offline test failed because Chromium's browser-owned service-worker
update check reached `/GuitarPak/sw.js` after Playwright's context offline flag.
Actual cached recognition succeeded. Request timestamps reproduced that
behavior. The test now closes the isolated HTTP origin and its connections
before reloading, retains its zero-server-hit assertion, and proves that deleting
the cached model makes inference fail honestly. The strengthened test passed
17 checks standalone and in three simultaneous copies. The original failed
log and timing evidence remain retained; no application workaround was added.

## Focused evidence

- Persistence: supported retries, failed writes, denied/quota storage,
  interrupted imports/recovery, stale tabs and exact unknown-record preservation.
- Future-format recovery: 26 checks retain unsupported pending/history/setup
  bytes and exports while refusing unsafe checkpoint/import/replacement.
- Real old-worker upgrade: 20 checks preserve active-session observations,
  preferences, original PDF bytes, late edits and offline PDF rendering.
- Automatic recognition: 34 engine, 50 review-flow, 15 source-seam,
  35 staff-geometry and 17 physical-origin-offline checks. Controlled UI replies
  are explicitly separate from actual model inference and accuracy evidence.
- Actual PNG/PDF pixels pass through detection, inference, unverified Library
  revisions, correction, explicit pitch/rhythm review, Wait/Tempo practice,
  simulated raw MIDI, instrument-specific canonical history and reload.
- Independent review reproduced and verified fixes for hidden-page reactivation,
  parsed-versus-verified timing, pending-result selection mismatch and recovery
  format loss. A separate quota/category-switch probe retained the original
  instrument/session ID without duplicate XP or material history.
- Light/dark layouts were inspected at 360, 390 and 1440 pixels. Shared clef,
  tuner and settings controls remain visible; target tables scroll deliberately
  on narrow screens. Keyboard/touch, focus, cancellation and modal ownership
  were checked without physical devices.
- 311 vendor/corpus size and SHA-256 checks passed. A source/asset/license audit
  found no missing runtime assets, accidental native/tool-package additions or
  high-confidence secret matches. Binary review patches reconstruct the exact
  candidate tree from the published baseline in a temporary Git index.

## Approved beta follow-up checks

The follow-up help/feed/documentation update labels the approved single-staff,
single-page beta and records the user scope decision without claiming release.
`node --check js/help.js`, version-feed JSON parsing and `git diff --check`
passed. A focused HTTP Chromium probe passed 28 assertions at 1,440 and 390
pixels: real Library/Score review help cards fit, expose beta limits and correction
steps, preserve the separate rhythm-review gate, close with Escape and never
request microphone capture. These are additional UI checks, not recognition
accuracy measurements or a replacement for final exact-source hosted CI.

The frozen beta UI follow-up passed 62 HTTP Chromium assertions, including
real PNG/PDF inference, single-staff selection, correction and Wait/Tempo flows.
An independent UI reviewer passed 60 further assertions across 360/390/1440px,
light/dark, keyboard/touch, source retention and no automatic XP or device I/O.
The SW126 upgrade/offline flow passed 20 assertions after the cache-name update.
Independent recovery/material/session/XP suites and the normal-history deployment
fixture also passed. These local follow-ups do not claim the two blocked
`file://` cases; the full default hosted suite remains a release requirement.

## First full hosted follow-up

Hosted [run 40005857032](https://github.com/mreindl118-boop/GuitarPak/actions/runs/40005857032)
tested exact `83bb83aaa57f5a61f263ea1667ec9ecb923962f9` with all 61 default suites.
It completed **failure** at 19:00 UTC on 2026-10-23: 59 suites passed; `score-review`
and `omr-review` aborted on `ENOENT` while saving screenshots to a cloud-only
`/workspace/soundlab-evidence` path. No additional failure was found in the
terminal logs. The default `update` suite passed all eight assertions, including
both bundled `file://` cases that remained unexecuted in the managed local browser.
Optional native APK/aapt checks and physical devices remain separate.

The test-only correction creates a portable per-suite screenshot directory
under `EVIDENCE_DIR`, `SL_LOG_DIR` or the OS temporary directory. Both complete
affected HTTP suites then passed locally (42 and 62 assertions), including
real model/PDF review and practice. Independent review confirmed no assertions
or runtime code changed. A fresh full hosted run on the correction commit is
still required. PR creation was denied by automatic approval review citing the
earlier publication restriction; no PR, merge, tag or 1.1 release was created.
No denied action was retried while explicit public-PR authorization was pending.

## Unmet release conditions

This is not a 1.1 publication or hosted-CI success claim. At the historical
source boundary above, no 1.1 branch push, PR, merge, tag, GitHub release or
deployment had been performed. Final hosted CI, independent review, immutable
tag and public asset verification remain pending and must use the final approved
source, including the original bundled-file cases. The release-workflow update
requires separate verification; the historical run used the earlier workflow.

On 2026-10-23 the user approved shipping notation recognition as a limited beta
(message `Sentinel_0f701efdad1c8191bef53bd235fad469`: “yes ship beta”). Its released
scope is one selected monophonic treble or bass staff on one page at a time,
with source comparison, correction and explicit review required. General piano,
polyphonic, multistaff, scanned and whole-multipage recognition are excluded.
Repeats can be omitted without reliable automatic detection. Scope approval is
complete; software and publication gates remain open. See
[all measured cases and failures](OMR-VALIDATION.md) and
[the release checklist](RELEASE-1.1.0-CHECKLIST.md).

Physical LUMI appearance/protocol behavior, external synth Local Control,
real instrument capture, native wrappers and cross-device persistence remain
unverified. Tests use cloud simulations, original generated scores and synthetic
audio/MIDI. Browser storage does not survive every eviction or site-data clear.
