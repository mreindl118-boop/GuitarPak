# Local optical music recognition validation

The shipping browser path performs **actual local inference on selected staff
pixels**, then opens an unverified draft for correction. The measured boundary is
clear, engraved, monophonic treble/bass notation. This evidence does not establish
general piano/polyphonic, real scanned/camera, handwritten or whole-song recognition.

The portable [hash-bound case report](../tests/fixtures/omr/validation/browser-corpus-v1.json)
retains all 40 cases, including every failure and eight unsupported cases.
The [portable original corpus](../tests/fixtures/omr/corpus/PORTABLE-CORPUS.md) has 20 authored
compositions, each clean and synthetically degraded. Paired variants are not 40
independent songs. The originals/generator are CC0; engraving tools retain their
own licenses. No private score, recording or user-computer file entered this test.

## Provenance

| Shipped component | Exact source | License / integrity |
|---|---|---|
| SATB preprocessing/decoder/rejection code | `alexanderalber/satb-line-omr` at `c60823117a5c92b0c29f921dbca023e94026d279` | MIT; unchanged copied code |
| `model-public-domain/omr-line.fp16.onnx` | Same source commit, PDMX-only variant | MIT; SHA-256 `0edeb8f9a8103405239d7edbf48aa372158eb3e0cbbe696ec7dbaf768a75c39d` |
| Model vocabulary | Same variant/commit | SHA-256 `7e0139c90b0572aaf7f679c7fd1d127ae9b02f9bd33bb9b7ac971ac0482061ca` |
| ONNX Runtime Web | npm `onnxruntime-web@1.30.0` | MIT; package SHA-512 and shipped asset hashes pinned |

The upstream [component manifest](https://github.com/alexanderalber/satb-line-omr/blob/c60823117a5c92b0c29f921dbca023e94026d279/MANIFEST.md)
explicitly distinguishes the MIT model from its **separate noncommercial model**.
The latter is absent from the shipped assets. The original MIT notices,
[model card](https://github.com/alexanderalber/satb-line-omr/blob/c60823117a5c92b0c29f921dbca023e94026d279/model-public-domain/MODEL-CARD.md)
and Microsoft [license](https://github.com/microsoft/onnxruntime/blob/v1.30.0/LICENSE)
and ThirdPartyNotices are retained. Training pedigree is the publisher's stated
PDMX-only recipe; this audit did not reconstruct its training set or training run.

All 16 files in [the vendor manifest](../vendor/omr/manifest.json) matched their
byte lengths and SHA-256 digests. The four shipped ORT package/runtime files also
matched the cached npm tarball byte for byte, with its declared SHA-512 integrity.
The model's Git blob SHA-1 is `1fe32f92c939fa1f91fc74d3a0b668cd6f0704df`.
The portable report pins the four measured application source hashes, model,
vocabulary, runtime assets, every input PNG and every authored truth record.

One additional independent GitHub API tree read was blocked by the cloud proxy
with HTTP 403 and was not bypassed or retried. Primary pinned license pages were
read separately; local source-copy/blob hashes and npm integrity were verified.
This audit does not claim a fresh independent remote Git tree-to-blob read.

## Pixel/truth separation and fixed inputs

The recognizer received pixels, dimensions, crop/rectification information and a
page number. It did not receive expected notes, truth JSON, MusicXML, source text
or a filename. Authored truth was read **after inference** by a separate evaluator.
The frozen corpus manifest SHA-256 is:

```
22a4115cd19e126cd69125b1a9f93ee7e4032cfd2fd087d388e0ccbeb2b5e4f6
```

Every final result matched its frozen input PNG hash and recorded the actual
worker pixel hash. All 40 cases remained in the denominator. The selected-region
run had 48 region results; its four runtime source files had unchanged hashes
before and after the run. Eight independent evaluator checks covered omitted and
inserted notes, substitutions, rests, onset errors and duration errors.

Early 32-case results used a corpus that was subsequently corrected. For example,
a previous rest fixture had different notes and dimensions. Those provisional
aggregates were rejected; they are not this report's accuracy evidence. Earlier
failed outputs remain in the cloud audit history. No model was trained here, and
no development/test-split or generalization percentage is claimed.

## Measured browser results

The path below uses actual staff detection, optional skew rectification, local
WASM inference and strict token parsing. Consecutive staves are joined only under
the explicit single-voice reading-order contract. Missing timing is never filled
from truth. Multipart cases remain separate.

| Selected-region stratum | Cases | MIDI pitch matches / expected | Correct note durations | Correct note onsets | Exact musical event cases |
|---|---:|---:|---:|---:|---:|
| All supported monophonic | 32 | 312 / 312 | 302 / 312 | 275 / 312 | 20 / 32 |
| Clean originals | 16 | 156 / 156 | 149 / 156 | 123 / 156 | 8 / 16 |
| Synthetic degradation | 16 | 156 / 156 | 153 / 156 | 152 / 156 | 12 / 16 |
| Printable-page layouts | 8 | 218 / 218 | 217 / 218 | 188 / 218 | 5 / 8 |
| Short staff strips | 24 | 94 / 94 | 85 / 94 | 87 / 94 | 15 / 24 |

Duration/onset numerators count correctly aligned pitch matches; their denominator
is **all expected notes in that stratum**. The report separately records pitch
substitutions, omitted notes and extra notes. There were none in the final supported
selected-region stratum. It correctly retained all 12 reference rests with their
onsets/durations, and all 32 initial clef, key and meter values. Jointly correct
pitch/onset/duration was **265 / 312**. Full note/rest/onset/duration edit distance
was **47**. A single wrong duration can shift many following onsets; those errors
are retained rather than hidden behind the original symbol error.

“Exact musical event case” means zero edits in note/rest MIDI pitch, onset and
duration plus correct initial clef/key/meter and part count. It does not certify
articulation, source enharmonic spelling, later attribute changes or complete
written-score structure. Unsupported source cases never count as supported exact
successes, even when their visible notes happen to match.

The same upstream model used directly on whole-page pixels was weaker:
**200 / 312** pitch matches and **16 / 32** exact supported cases, with 110 pitch
deletions, two substitutions and one insertion. Four degraded long pages produced
no staves. Those failures remain recorded; they are not substituted for the
selected-region path or for the independent CPU results below.

### Failures retained in the supported stratum

| Case(s) | Full note/rest/onset/duration edits | Observed limit |
|---|---:|---|
| `01-treble-quarters-clean` | 1 | Last predicted duration differs from the source |
| `03-bass-quarters-clean` | 4 | Duration error shifts subsequent onsets |
| `08-treble-dotted-{clean,scan}` | 1 each | Duration mismatch |
| `09-treble-accidentals-{clean,scan}` | 3 each | Duration/onset mismatch despite correct pitches |
| `11-bass-key-eb-clean` | 1 | Duration mismatch |
| `13-treble-tie-{clean,scan}` | 1 each | Duration mismatch after tie-aware normalization |
| `18-page-bass-quarters-clean` | 27 | Earlier rhythm error propagates through the page |
| `20-page-bass-key-eb-{clean,scan}` | 2 each | Ambiguous raw tokens leave later timing unparsed |

The JSON preserves all individual edit operations, source hashes, warnings and
unsupported codes, including these 12 non-exact supported cases.

### Eight unsupported cases retained

The clean/degraded variants of each source below remain outside the supported
quality stratum:

- `12-treble-chords`: block triads, outside the single-voice model.
- `14-repeat-bars`: playback repeat expansion is unsupported.
- `15-two-parts`: simultaneous parts require explicit selection; no automatic
  whole-page voice alignment is inferred.
- `16-treble-triplet`: tuplets are outside this initial source-support envelope.

**Eligibility cannot always be detected automatically from pixels.** A model may
omit a chord/voice or misread a repeat without producing a reliable rejection.
The explicit monophonic selection acknowledgement, source comparison and correction
remain necessary. Successful grammar parsing or an apparently certain raw token
is not proof of correct notation or complete support.

## Draft and practice gates

`rhythmParsed` describes grammar interpretation; it does not mean verified musical
truth. `rhythmKnown` and `rhythmVerified` remain false for every automatic result.
The review adapter retains parsed beat/duration predictions for correction while
leaving all targets unchecked and Tempo/held-duration scoring disabled. For the
first original quarter-note fixture, the real model predicts durations
`1, 1, 1, 0.5`; the last prediction is wrong. It is retained as `0.5` for the user
to correct, rather than silently changed to the truth or discarded as zero.

Completed staff/order/support selections remain locked while a result is pending;
explicit Discard unlocks them so a saved draft cannot silently refer to an earlier
selection. The actual-model adapter probe verifies the rhythm separation. The browser integration
suite in [omr-review.test.js](../tests/omr-review.test.js) additionally exercises
local Library save/readback, manual correction, explicit pitch review, Wait launch,
explicit rhythm confirmation, Tempo launch and reload with original/model
provenance and canonical per-instrument sessions. Its controlled reply fixtures
check lifecycle/failure behavior; they are separate from model-quality evidence.
The final focused browser suite passed 50 checks, including the selection-lock
regressions. All performance input in these tests is explicitly simulated cloud MIDI.

## Local processing and capability limits

The final selected-region test logged **483 local requests**, zero external
requests, zero truth/source/manifest requests and zero browser exceptions. Model
and vocabulary checksums are checked inside the worker. The model uses WASM with
one thread and graph optimization disabled and ran without cross-origin isolation.
Loading the API alone performs no inference or device access. Cancellation terminates
the owned worker. The original score is stored locally and is not sent to an OMR
service. Generated drafts start neither audio nor MIDI guidance and earn no XP.

This is observed local-browser evidence, not mobile/native performance, arbitrary
scan support or physical LUMI validation. No paid service, account, tunnel,
production recognition backend, private upload or native build was created.

## Separately measured CPU alternatives

These measurements used whole-raster-to-MusicXML CLI paths and a stricter
written-score metric, not the selected-region browser task. They are separate
evidence and are not deployed SoundLab features.

| Engine | Current PNG cases | Exact written scores | Incorrect generated scores | Detection/runtime failures |
|---|---:|---:|---:|---:|
| Audiveris 5.11.0 | 40 | 8 | 0 | 32 |
| homr, pinned code/models | 40 | 8 | 3 | 29 |

Both were exact on eight long-page variants containing **218 notes and four
rests**, including written spelling, timing, clef/key/meter, parts and complete
measures. Short strips and deliberate unsupported inputs remain counted. homr's
11 generated PNG outputs had 234 expected notes, 229 recognized notes, 224 correct
aligned pitches, 219 onsets and 228 durations; failures are not excluded by calling
all parseable XML correct. A separate raster-only PDF was exact with homr; Audiveris
made three pitch substitutions and introduced an extra whole-rest voice. Those two
PDF attempts are outside the 40-PNG denominator.

[Audiveris 5.11.0](https://github.com/Audiveris/audiveris/releases/tag/5.11.0)
is [AGPL-3.0](https://github.com/Audiveris/audiveris/blob/5.11.0/LICENSE);
its tested package SHA-256 is
`ae714594f40e54b1a4951fc3f914f08ae38fe5d07b7f2283b1a904fdb6e0a318`.
homr was pinned to `b549203bb030cb031d8b73ae3918f35638713cc2`, with three hashed
models totaling 157,482,318 bytes. Its
[official license FAQ](https://github.com/liebharc/homr/blob/b549203bb030cb031d8b73ae3918f35638713cc2/LICENSE_FAQ.md)
states AGPL code/weights and flags unclear/noncommercial PrIMuS training pedigree;
this work makes no commercially unrestricted weight-redistribution claim.
Neither engine/model set is bundled. Their Python/Java/native implementations do
not run unchanged on static GitHub Pages, and no backend was authorized or deployed.
The portable JSON records their exact engine/model identities and all failure IDs.
