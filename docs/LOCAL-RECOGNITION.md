# Local notation recognition (Beta)

Score review provides a deliberate **Notation recognition (Beta)** workflow for a
PDF or image already retained in the local Music Library. The original is never
sent to a recognition service. Finding staff regions does not initialize the
model. Bundled model/runtime assets (about21MB) are included in the app's offline
cache during an online app installation. Starting recognition initializes the
browser worker and inference session from same-origin bundled assets and reports
its progress; Cancel aborts that job. There is no runtime CDN, external account,
recognition backend or score upload.

The beta supports **exactly one selected, clearly engraved monophonic treble or
bass staff on one page at a time**. Correction and source comparison are required.
It does not support general piano scores, polyphonic chords, multistaff alignment,
scanned or handwritten scores, or whole-multipage recognition. Repeats,
overlapping voices and unusual notation may be missed. A page may contain
multiple candidate staves, but the radio selection includes only one of them;
other staves remain excluded. Recognition does not establish a full musical part
or a reliable whole song. Detection identifies five-line geometry, not calibrated
accuracy. Candidate boxes are displayed over the actual page raster.

Choose one staff from the current page, then confirm the single-voice support
limits before starting recognition. There is no passage-order or sequential-staff
merge in this beta, and `buildDraft` rejects multiple selections even if a caller
requests sequential processing. Recognize another page or staff as a separate
draft; the app does not infer cross-page timing or combine simultaneous parts.
After recognition, the staff choice and support confirmation stay locked until
Save or Discard, so the visible selection cannot differ from the captured result
being saved.

The recognition result contains actual automatically decoded pitch/rest events
where supported, plus visible warnings and the original raw token output.
Unknown pitches remain evidence rather than invented notes. Parsed beat/duration
predictions remain exactly editable, even when the model got them wrong; parsed
grammar does not establish verified rhythm. Unparsed or
overlapping rhythm uses an explicitly disclosed onset-order draft, with zero
held duration. Every automatic row is unverified and Wait-only until the user
checks the source and explicitly confirms its rhythm in the existing editor.
Raw model scores are diagnostic values; no accuracy percentage is presented.

**Save unverified draft for correction** creates a new immutable Library revision
and opens that exact revision in Score review. It preserves original item/hash,
engine version/source commit/model SHA-256, raw token scores/frames, events,
warnings, source page, region boxes and skew transform. A copy in `editor.recognition`
keeps the provenance available through later manual correction. Unsupported
results with no pitches can be saved as evidence-only drafts. Drafts never start
audio, send MIDI guidance, grade performance or award XP. Review remains explicit.

Worker work and unsaved results block a checkpoint. Save or explicitly discard
the result; export the raw evidence first when useful. Completed results are kept
by immutable original/hash/page across tab navigation and source changes. Return
to that page to save; other pending pages retain visible export/discard actions.
Leaving the source/page cancels owned in-flight recognition while keeping any
already completed staff results. A source-generation check prevents a late reply
from opening a draft against another original. A dispatched Library write cannot be
cancelled retroactively; existing revisions should be checked before retrying an
interrupted save.

Ordinary browser reload/navigation also requests confirmation while recognition
is busy or results remain unsaved. This browser guard cannot guarantee recovery
after tab crashes or forced closure; saving a draft is the durable path.

Implementation ownership is split between the ScoreReview source adapter,
`js/omr/review-recognition.js`, the geometry detector and the actual bundled
recognizer. Engine/model licensing, asset digests and supported-corpus evidence
are recorded by their manifests and benchmark documentation. UI lifecycle tests
that inject controlled engine replies validate safety and storage behavior; they
are not musical-accuracy measurements. Hardware behavior is unrelated and remains
unverified.
