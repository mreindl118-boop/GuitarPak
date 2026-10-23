# SoundLab 1.1 local validation

Local, unpublished candidate, 2026-10-23. The published 1.0 baseline is
`2077f3bbe663d30ea228e7d3beebcedb4b2baf93`.

## Source and test boundary

The final application implementation is commit
`a31abf942fda9ed53cea34f8ad6919b7d7a4de7f`. Commit
`152cbd478d74b9f2d821ab5dd41a093952ce9f49` changes only the offline test;
application JavaScript, CSS, index, service worker, vendor assets and version
metadata are identical. This report/checklist is a documentation follow-up.
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

## Unmet release conditions

This is not a 1.1 publication or hosted-CI success claim. No 1.1 branch push,
PR, merge, tag, GitHub release or deployment was performed. Hosted full CI must
test the final approved source, including the original bundled-file cases.
The existing release workflow remains limited to web 1.0.0.

The actual browser recognizer supports selected monophonic staff regions, one
page at a time. It does not provide general piano/polyphonic/multistaff/scanned
or whole-multipage-song recognition. Repeats can be omitted without reliable
automatic detection. Parent/user agreement on that material scope remains a
publication gate. See [all measured cases and failures](OMR-VALIDATION.md) and
[the release checklist](RELEASE-1.1.0-CHECKLIST.md).

Physical LUMI appearance/protocol behavior, external synth Local Control,
real instrument capture, native wrappers and cross-device persistence remain
unverified. Tests use cloud simulations, original generated scores and synthetic
audio/MIDI. Browser storage does not survive every eviction or site-data clear.
