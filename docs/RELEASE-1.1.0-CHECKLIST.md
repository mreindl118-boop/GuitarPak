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

- [ ] All final local applicable suites against the frozen candidate.
- [ ] Independent reviews complete; all demonstrated blockers fixed and rerun.
- [ ] Desktop/phone, light/dark, keyboard/touch and offline/upgrade evidence.
- [ ] Exact changed files, provenance, vendor licenses and secret review.
- [ ] Actual automatic PDF notation recognition, review/correction and practice
      integration, with a hash-bound original-score corpus and explicit limits.
- [ ] Public review/hosted CI and final publication authorization verified.
- [ ] Exact final remote source, immutable version tag and public asset checks.

## Explicit limits and release decision

**Automatic optical music recognition is required for this release.** The
user confirmed this requirement on 2026-10-23. The release remains held while
the actual local recognition path is integrated and evaluated. PDF.js renders
pages; it does not recognize notation. Manual targets and structured imports
are useful existing paths, but do not satisfy the recognition gate.

An eligible MIT-licensed, public-domain-trained staff-line model has run in a
local browser worker using ONNX Runtime Web. Only that model is eligible for
this candidate; the separately supplied noncommercial model is excluded.
Initial trials found pitch/duration errors and unsupported layouts. These
trials are development evidence, not final accuracy claims. The frozen corpus
must be rerun with exact image/model hashes and separate supported and
unsupported cases. All recognized targets must remain unverified until the
user checks and corrects them. No arbitrary PDF, polyphonic piano score or
scan reliability claim is permitted without corresponding evidence.

Separate CPU evaluations of homr and Audiveris demonstrate another real
recognition path, but those Python/Java programs cannot run unchanged on the
existing static deployment. They are evaluation tools, not a deployed backend.
No private score upload, paid service, new hosting or credentials are included.

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
the gates and report remaining limits first. Existing workflows automatically
release only web 1.0.0; they do not silently create a 1.1 tag. Any approved 1.1
release must test its exact commit, preserve source/deployment history, verify
public runtime bytes and never move an existing tag or change credential scopes.
Rollback is a reviewed source revert followed by the same tests and an appended
deployment. User data is restored through validated backups/recovery; app
cache rollback must never delete song originals, settings or practice history.
