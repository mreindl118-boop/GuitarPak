# Local notation recognition

Score review provides a deliberate **Recognize notation locally** workflow for a
PDF or image already retained in the local Music Library. The original is never
sent to a recognition service. Finding staff regions does not initialize the
model. Bundled model/runtime assets (about21MB) are included in the app's offline
cache during an online app installation. Starting recognition initializes the
browser worker and inference session from same-origin bundled assets and reports
its progress; Cancel aborts that job. There is no runtime CDN, external account,
recognition backend or score upload.

The first release supports selected clearly engraved, monophonic treble or bass
staff regions. Scans and handwriting are experimental. It does not promise piano grand-staff alignment, polyphonic chords,
overlapping voices, repeat expansion, unusual notation or arbitrary scans.
Detection identifies five-line geometry, not a musical part or calibrated
accuracy. Candidate boxes are displayed over the actual page raster.

Select at most four regions from the current page. Multiple regions require an
explicit sequential voice/order confirmation. Simultaneous accompaniment staves
must remain unselected. Recognize other pages separately; the app does not guess
cross-page timing or silently merge whole-song parts.
After recognition, staff choices, passage order and support confirmations stay
locked until Save or Discard, so the visible selection cannot differ from the
captured result being saved.

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
