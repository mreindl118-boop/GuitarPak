# SoundLab 1.1.0 candidate

This is a local, unpublished web candidate on
`codex/soundlab-1.1-workflow-20261023`, based on the published 1.0.0 merge
`2077f3bbe663d30ea228e7d3beebcedb4b2baf93`. Source branches and original files
are preserved. APK channel 0.75.0 and native binaries are unchanged.

## Implemented scope

- Instrument-focused Learn, Free Play, Library and Progress navigation over
  existing module IDs, saved routes, unique tools and Studio.
- One global Tuner utility beside Settings/clef, explicit listening only,
  shared capture ownership, accessible cents text and persisted calibration.
- Local PDF/image/MIDI/MusicXML originals in versioned IndexedDB, immutable
  target revisions, source hashes, named sections, part selections/mappings,
  practice history, section/setup resume and reversible removal.
- Offline PDF.js viewer, editable note/chord/rest targets and explicit review
  before guided practice. The existing strict structured importers are reused.
- Browser-local **notation recognition beta** for one selected monophonic
  treble or bass staff on one page at a time, with cancellation, raw model
  evidence, source anchors and correction drafts. Every target and its rhythm
  remain unverified until comparison, correction and explicit review.
- One material launch seam into the existing Wait/Tempo engine, palette, LUMI
  ownership and canonical instrument ledger. Unknown rhythm is Wait-only.
  An arpeggio adaptation has distinct provenance and is not original-chord
  completion. Resume starts a new attempt at the saved section start.
- Typed, acknowledged settings persistence with the existing key names,
  unknown-record preservation, visible save errors, pending exports, checked
  import previews, before-snapshots, journals, rollback and recovery. Sampler
  originals are included in settings archives; the Library has its own complete
  original/revision archive. Neither archive claims to include the other.
- Explicit save/checkpoint/update and import boundaries, retained previous
  app cache, separate user storage, and offline reopen. Worker activation
  never silently reloads over a running attempt or unrecorded score edit.
- Short, editable executable teacher-text plans, retained source/gaps,
  per-context drafts, actual lesson/material references and measured evidence.
  Opening, importing, reviewing or accepting content never awards XP.

## Gates

- [x] All local applicable suites against the earlier frozen application
      candidate; see [the exact source/test boundary and blocked cases](VALIDATION-1.1.md).
- [x] Independent reviews of that candidate complete; demonstrated blockers fixed.
- [x] Final beta UI/help and update changes independently reviewed and affected
      HTTP checks rerun; workflow fixtures and final commit review are recorded
      with the public PR before merge.
- [x] Desktop/phone, light/dark, keyboard/touch and offline/upgrade evidence.
- [x] Exact changed files, provenance, vendor licenses and secret review.
- [x] Actual automatic PDF notation recognition, review/correction and practice
      integration, with a hash-bound original-score corpus and explicit limits.
- [x] User approved the limited single-staff, single-page recognition beta on
      2026-10-23: message `Sentinel_0f701efdad1c8191bef53bd235fad469`, “yes ship beta”.
      General piano/polyphonic/multistaff/scanned/whole-multipage recognition is excluded.
- [x] Publication authorized for this approved beta scope, conditional on passing gates.
- [ ] Public review and full hosted CI against the exact release source.
- [ ] Exact final remote source, immutable version tag and public asset checks.

## Explicit limits and release decision

**Automatic optical music recognition is required for this release.** The
user confirmed this requirement on 2026-10-23. The bounded local recognition path
is integrated and evaluated. The user subsequently approved shipping its limited
single-staff, single-page beta scope on 2026-10-23. Final regression, independent
review and hosted/publication gates remain required. PDF.js renders pages;
it does not recognize notation. Manual targets and structured imports
are useful existing paths, but do not satisfy the recognition gate.

An eligible MIT-licensed, public-domain-trained staff-line model has run in a
local browser worker using ONNX Runtime Web. Only that model is eligible for
this candidate; the separately supplied noncommercial model is excluded.
The final selected-region run used 20 original compositions with clean and
synthetically degraded variants: 32 supported monophonic cases and eight
unsupported cases retained separately. All 312 expected pitched notes and
12 rests matched in the supported cases, but ten note durations and 37 onsets
were incorrect. Only 20/32 supported cases had an exact musical event sequence.
See [the hash-bound evaluation and all failures](OMR-VALIDATION.md); this is not
a general accuracy or independent-song generalization percentage.
All recognized targets remain unverified until the
user checks and corrects them. No arbitrary PDF, polyphonic piano score or
scan reliability claim is permitted without corresponding evidence.

Separate CPU evaluations of homr and Audiveris demonstrate another real
recognition path, but those Python/Java programs cannot run unchanged on the
existing static deployment. They are evaluation tools, not a deployed backend.
No private score upload, paid service, new hosting or credentials are included.
The shipped MIT model/runtime total approximately 21 MB, cached as same-origin
app assets during online installation. Actual inference starts deliberately and
works offline after a complete asset cache. No runtime CDN or external account
is required. The separate CPU engines are not bundled or deployed.

The released beta recognizes exactly one selected monophonic treble or bass
staff on one page at a time. It does not recognize a full piano score,
polyphony, simultaneous or sequential multiple staves, arbitrary scanned scores
or a whole multipage song. Repeats can be silently omitted by the model; block
chords can be rejected or misread.
Mandatory source comparison and explicit review prevent those raw predictions
from automatically becoming scored practice. General whole-score recognition
would need a substantially broader browser engine or a separately approved
companion/service with runtime, license, privacy and deployment decisions.

The MusicXML subset rejects unsupported multi-voice/repeat/tuplet notation
instead of inventing a score; MIDI uses the existing constant-tempo practice
policy with explicit omissions. A manually mapped part is distinct from an
automatically recognized source part. Direct Google Docs integration is deferred;
text/pasted instructions stay local and invoke only actual app capabilities.

Persistence applies to the same installation/browser origin while storage is
available. It is not cross-device sync or survival after site-data clearing,
uninstall or browser eviction. Existing Android HTTPS and bundled file origins
remain separate; no new native wrapper has been built or certified. Browser
permissions, Local Control and device handles are not restored as permissions
or running sessions. Desired route preferences are revalidated against live
ports and require deliberate practice/capture actions.

Hardware/perceptual LUMI behavior, external synth sound, Local Control and real
instrument capture remain unverified. Cloud tests use synthetic inputs. The
cloud proxy's public Pages CONNECT 403 is a separate transport limitation;
it is not public UI verification. Published 1.0 used its ordinary hosted
45-asset hash gate and successful Pages deployment.

## Publication and rollback

Do not publish this candidate merely because its metadata says 1.1.0. Finish
the gates and report remaining limits first. The approved 1.1 release must use
the reviewed version-guarded workflow, test its exact commit, preserve
source/deployment history, verify public runtime bytes and never move an existing tag or change credential scopes.
Rollback is a reviewed source revert followed by the same tests and an appended
deployment. User data is restored through validated backups/recovery; app
cache rollback must never delete song originals, settings or practice history.
