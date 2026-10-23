# Feature coverage and independent review — 2026-10-23

This matrix describes the cloud integration on
`codex/soundlab-lumi-consolidation-20261023`, based on canonical GuitarPak
`main` `6a5891f401dcb0239d887fb515c26ec418a2c598` (web 0.82.0).
It identifies implementation paths and software evidence. It does not claim
physical illumination, audible instrument behavior, firmware compatibility or
native device acceptance. Final aggregate executions are recorded separately
in [VALIDATION-2026-10-23.md](VALIDATION-2026-10-23.md).

## Provenance and content consolidation

The [branch audit](BRANCH-AUDIT-2026-10-23.md) compares actual feature content
across all 18 accessible GuitarPak heads, release/default/deployment baselines,
and related Sampler-DAW/HealLicks refs. Source branches remain intact.

| Source | Finding and integration decision |
| --- | --- |
| GuitarPak `feat/lumi-display` `1dbbb326f60e05d76d891090f0c07f1ec533020f`; `feat/lumi-display-aid` `0e0600c3408e07e0e5b555c74f03219f9e84111f` | Current/next LUMI key lighting already exists in main. Preserve and extend its shared renderer rather than import a competing writer. |
| `codex/midi-hub-release-0.78.0-20261019` `b8ccb55de28e4dd297e8d4b7ac4f8a4b3dfcfe4f` | Selectively recover independent input/output scaffolding and note/triad practice; adapt ownership, cleanup, raw grading, guided display and three independent device roles. Its Score/MusicXML, Music Library and recall-only Helix pages remain unintegrated. |
| `codex/natural-notes-autonext-20261020` `7e8884f510e869bbd42d0513b4b797537036bf94` | Recover fresh correction after a missed quiz answer; extend held-note identity to actual ports and channels. |
| Sampler-DAW default/tag `a9d262713ff307b8125e7c53c370f6fcbf1d103d` | Separate React/TypeScript Studio application. Accessible feature branches contain no unique missing runtime implementation; its native bridge contract differs. No whole-tree merge. |
| HealLicks default `3e6512ad3b09cce8651608d6317fca33eced051b` | Stadium Deck protocol/mock/status-shell foundation; no LUMI renderer and no validated firmware entries. Keep separate. |
| GuitarPak `feat/helix-stadium` `0b39653d6998d0747fbaa1e76fdc119b0b447a98` | Substantive stranded GitHub plugin/bridge exists. It is not loaded by this integration; earlier local/native transport is not inferred. |

The located LUMI implementation treats the illuminated 24-key keyboard as the
instructional display: per-key velocity colors, ROLI/LUMI mode/brightness SysEx,
current and upcoming targets, shared background and feedback. No separate
pixel/text screen protocol was found. Actual board model, firmware and color
response remain hardware-unverified.

## Scale Lock: built-in musical producers and forwarders

The existing `fb.root` / `fb.scale` context is authoritative. The sole Scale
Lock master admits each final musical note without snapping it to another
pitch. Note releases survive policy changes; scale boundaries clear active and
future scheduled musical voices. Raw input remains available to grading.

| Producer / forwarder | Production enforcement and cleanup | Relevant regression evidence |
| --- | --- | --- |
| Guitar samples and oscillator fallback | `js/app.js` `App.pluck` / `pluckSynth`, nearest nominal pitch for calibrated fractional references; tracked sources canceled at `scale:boundary` | `tests/pitch-lock.test.js` |
| Chords, Theory, Trainer, Tuner, Fretboard/Tab/Notation, Songs and Quiz auditions | Their actual note calls converge on guarded `App.pluck` or `App.keys.play`; former page-wide exemptions removed | `pitch-lock`, `practice`, `quiz`, `lumi-contexts` suites; individual caller behavior is also bounded by the shared sink |
| Piano live, touch/QWERTY, chord and arpeggiator notes | `js/piano.js` `noteOnRaw` gates each final expanded pitch; one-shot `play` independently gates; sample sources and synth voices clear on boundaries | `pitch-lock`, `keys`, `practice` |
| Piano / synth / pitched sampler bend | Piano `bendChan`, guarded DAW `pitchBend`; existing bend neutralized while locked; synth glide disabled while locked | `pitch-lock`, `sound-lock`, `midi-ports` |
| Studio/Tracks live performance, piano-roll audition, Ideas preview | `js/studio.js` calls shared `DAW.createSynth` / `createSampler`; `DAW.guardPitched` gates before voice creation | `tests/sound-lock.test.js` |
| DAW pattern scheduling and arrangement pattern clips | `js/daw/engine.js` routes through guarded instrument factories; registry cancels held and future sources, including already scheduled notes | `sound-lock` real OfflineAudioContext and graph checks |
| Offline loop and arrangement WAV export | The same synth/sampler guard applies in offline contexts; temporary instrument registrations disposed after render | `sound-lock`: blocked render energy zero, allowed render nonzero |
| Jam bass, keys, pad, sampled and oscillator fallback paths | `js/jam.js` gates each melodic pitch and tracks sources; blocked sample is handled without falling back to an unguarded synth; guitar comp uses guarded pluck | `sound-lock` direct path checks |
| Woodshed legacy and new performance virtual sound | Legacy piano/synth voices use guarded Keys/DAW sinks; `js/performance-player.js` scores first and then creates guarded synth notes | `performance-engine`, `performance`, `sound-lock` |
| Incoming external MIDI to app sound | `js/midi.js` marks rejected note-ons blocked/muted; raw taps and wrong-answer observations survive; channels and required offs preserved | `midi-ports`, `pitch-lock`, `performance` |
| Public MIDI `send`, `sendTo`, `sendToOutput`, generic lease sends, native shared send | Common output parser gates every complete musical note in packed/running-status buffers; shared ledger tracks notes, sustain and bends on exact original outputs | `midi-ports`, `btmidi`; native independent routing is unsupported |
| MIDI Hub Thru, virtual keys, QWERTY, rules and raw hex | `js/midihub.js` applies membership after remapping/transpose/conversion; source-to-actual-target ledger pairs releases across edits and MPE/source collisions | `tests/midihub-lock.test.js`, `midihub`, `midihub-wheel` |
| Hub Note→CC / CC→Note conversions | Converted notes use common admission; paired controller zeros are bound to the original output object/name, including disconnect and same-ID replacement | `midihub-lock`: original fallback/replacement cleanup regression cases |
| Optional selected synth practice route | `js/practice-router.js` obeys the same global toggle, with selected synth input, sound output and separate LUMI output, pinned lease and note/pedal ledger | `tests/practice-router.test.js`, full-app `lumi-practice` |
| Shared LED note writes | Visual exemption only for an identified LUMI output. A generic synth output remains musically gated even through public `light`/frame APIs | `midi-ports`, `display-master`, `lumi-practice` |
| Bundled lo-fi plugin | Preset uses the guarded shared DAW factory | Shared-factory coverage; arbitrary plugin code is excluded below |

Independent source review found and reported the generic-LED-to-synth bypass,
fractional tuner admission issue, unpinned Note→CC cleanup to fallback synth,
and same-ID replacement cleanup risk. The owning lanes fixed them and added
focused regressions. The comprehensive MIDI route matrix is in
[EXTERNAL-MIDI-COVERAGE.md](EXTERNAL-MIDI-COVERAGE.md).

## Independent Scale Lock and LUMI Display masters

Both switches belong to the existing treble-clef dropdown. Legacy “Guide
colors” changes a rendering style; it is not another display master.

| Scale Lock | LUMI Display | Intended software behavior |
| --- | --- | --- |
| Off | Off | Musical notes unrestricted; owned display notes/timers stay off; raw grading available. |
| On | Off | Musical admission follows selected scale; LEDs stay off; blocked wrong input remains gradable. |
| Off | On | Musical notes unrestricted; selected display shows shared context or active targets. |
| On | On | Musical admission guarded; practice target/feedback takes display priority. A wrong LED may light while its synth sound is blocked. |

`tests/display-master.test.js` covers independent persistence, no-device state,
no permission request merely from toggling, explicit missing-output behavior,
current-target restoration, master-off timer suppression and reconnect.
`lumi-contexts`, `lumi-practice` and `performance` check active practice use.
Disconnect cannot prove delivery of Note Off to absent hardware; replacement
ports must never receive cleanup belonging to an old physical output.

## Instructional contexts and actual target sources

| Context | Structured target/timing source | Implemented progression and cleanup | Evidence / limits |
| --- | --- | --- | --- |
| Scale practice | `js/piano.js` `practicePath`, `pp.seq`, wait `pp.target` or timed `pp.vis` | First target before sounding; exact requested synth octave in Guide; explicit wrong-note/wrong-octave feedback, repeat, hand/root rebuild, pause/resume/reset/navigation | `lumi-contexts`, `practice`, `keys`. Folded LEDs indicate pitch class; UI names required synth octave. |
| Keys lessons | `js/keylessons.js` actual generated `R.targets[].midi/at` and count-in | Shared ring→guide; actual timed judgments and feedback; repeats; stop/finish/navigation clears | `lumi-contexts`, `lumidisplay`. Existing timed lessons use pitch-class/onset judging and are distinct from the new exact-register player. |
| Sheet music / notation, Fretboard and Tab | `js/fretboard.js` actual exercise path/sequence and audio-clock `pr.vis` | Immediate first/next; clock-driven step changes; moving among the three views preserves exercise; synchronous old-guide release prevents destination erasure; rebuild purges queued old visuals | `lumi-contexts`. This generated exercise view does not import MusicXML/PDF and does not score played-note timing. |
| Exercises / Quiz | `js/quiz.js` actual `q.pc`, `pcAnswer`, `pcs`, pitch-bearing audio/reveal or written chord data | Actual current target; correct/wrong text; answer feedback; fresh correction; next question cancels old timers; covered sheet/home/finish/navigation clears | `lumi-contexts`, `quiz-correction`, `quiz`. Word-only/context-only questions explicitly have no pitch target. |
| Songs | `js/songs.js` parsed `cur.steps[].notes` and loop sequence | First chord before audio; clock-driven advance/repeat; loop changes restart; tapped actual step auditions/guides; pause/stop/hide clears even an already paused audition | `lumi-contexts`. Educational tab-step timing is not the original SMF tempo/duration model. |
| New guided performance | `js/performance-engine.js` groups same-onset exact MIDI pitches from structured notes; `performance-player.js` uses its current/upcoming state for screen and shared LEDs | Wait for Me / Play at Tempo, raw MIDI/virtual or explicit monophonic audio input, source/channel ledger, repeated attack, count-in, pause/resume, tempo, transpose, sections/loops, completion report | `performance-engine`, `performance`, `performance-import`, `practice-input`, `practice-audio`. Physical latency and colors remain unverified. |

The independent review executed all **36 full-app checks** in
`tests/lumi-contexts.test.js`,
using fake EventTarget ports, the real shared LED renderer and reconstructed
note-on/off frames. Coverage includes first/current/next, target priority at
Help None, wrong/correct, repeat, pause/resume/stop, navigation ownership, root
replacement, folded-octave feedback, empty/unsupported data, independent synth
input, display master off/on, disconnect/reconnect and no page errors.

## Performance sources, timing and scoring limits

| Source | Preserved structured content | Explicit limitations |
| --- | --- | --- |
| Original generated melody/chord exercises | Selected root/scale, MIDI pitches, chord onsets, durations and rests | Original demonstration material; no claim of imported copyrighted repertoire. |
| Woodshed SMF0/1 MIDI import | Exact beat positions including leading/internal/trailing rests, independent attack/release durations and velocities, simultaneous chords, channel identity; initial tempo selected explicitly | Constant initial practice tempo; later tempo changes are warned and not followed. SMPTE and asynchronous SMF2 reject. Controllers including sustain, bend/program/pressure, SysEx and unsupported metadata are warned, not applied. Unclosed notes are omitted, overlaps pair FIFO without inferred ties; cap 1500 is explicit. Mixed channel-10 percussion is excluded from pitched scores; pure drums retain the legacy drum workflow. |
| Studio note track | One selected/imported note-pattern track's pitches, beats and durations at the shared metronome tempo | Not the full arranger: clip offsets/repeats/audio/automation are not reconstructed by this importer. |
| ASCII guitar tab | Parsed fret/string pitches and simultaneous columns; multi-digit frets consume only their own string columns, including initial notes and consecutive six-string systems | Standard tuning assumed; no reliable rhythm, rests, note-off duration, ties or technique semantics. Timed results use assumed even-eighth beats. Invalid frets are reported, not split into invented notes. |
| PDF, image, arbitrary audio, prose or unsupported score file | No parsed note model | No invented score notes or claimed transcription; stranded Score/MusicXML was not integrated. |

`tests/performance-import.test.js` independently passes **55 synthetic-file
and ASCII checks** against the production importers. `performance-engine`
independently passes **100 deterministic checks** and uses a
deterministic monotonic clock; `performance` uses the real app/player with fake
ports and injected time. These are cloud simulations. Timing statistics are
onset-based; hold duration is reported separately, and Wait does not grade
timing or hold length. Wait requires target chord pitches physically together;
Play at Tempo admits individual chord onsets within ±120 ms, so a rolled chord
may qualify. New attacks during a rest count as extras. Ties must be
represented as one sustained structured note. A 24-key
display folds full-score register; the screen names exact notes. The new
player accepts monophonic instrument/voice audio through the shared input
service, detailed below. It does not claim polyphonic microphone transcription
or automatic hardware latency calibration.

The independent review also ran the complete **31-check browser performance
suite**, plus a separate five-case probe against the real app/player/MIDI
service: changed input clears old holds; same-ID/name Web MIDI input
replacement pauses, clears old physical/parser state and accepts a fresh
correct attack; running-status fragments and realtime interleaving grade and
release correctly; sustained current notes retain the actual next target;
output-only inventory changes preserve running practice. All five passed with
zero page errors. Evidence JSON is saved outside the repository at
`/workspace/soundlab-evidence/performance-independent-review.json`, explicitly
labelled as cloud simulation. Native input fingerprints expose IDs/names,
rather than underlying Web MIDI object identity.

## Monophonic instrument and voice practice

The later audio milestone adds `js/practice-input.js` and the pure shared
`js/pitch-detector.js`. The Tuner, ToneIn and legacy Woodshed detection
functions delegate to the same NSDF helper. Audio remains distinct from
USB-MIDI: it supplies detected sounding notes to the same raw scorer, not
invented score data. See [PRACTICE-INPUTS.md](PRACTICE-INPUTS.md) for API,
capture, calibration and capability details.

| Audio path | Implemented behavior | Software evidence |
| --- | --- | --- |
| Shared selected microphone/USB audio capture | Explicit start, `App.audioIn.hold(tag,{exact:true})`, held-only `tap(tag)`, one own analyser edge, no detector speaker connection or upload | `practice-input` shared-graph ownership; `practice-audio` real synthetic MediaStreams; existing `audioin` suite |
| Monophonic normalized notes | Stable confidence/noise/cents checks, vibrato hysteresis, silence/envelope rearticulation, exact observed octave, explicit range/A4/input transpose, no expected-note octave correction | Synthetic sine/harmonics/noise/bends/vibrato/low-bass/high-range rejection tests |
| Timing and holds | First candidate/quiet-frame timestamps, manual delay plus bounded confirmation grace, onset and separate envelope-based duration results | Actual browser known80ms delayed input has zero timing error and correct hold sample; deterministic engine delay/history checks |
| Pause/stop/disconnect/source change/cancel | Paired note release, own edge/hold release, last-consumer tracks stop, stale permission resolution closes, no automatic capture retry | Pure/shared-graph and full browser audio checks |
| Existing ToneIn capture | Owner suspension closes old/pending capture before practice; saved preference remains; visibility/device events cannot reopen until explicit later start | `practice-input` preexisting/pending capture and manual restart cases; existing `audioin` regressions |
| Polyphonic audio target | Start disabled with visible labelled arpeggio adaptation or MIDI alternative | Full browser chord→single-note adaptation case; no polyphonic recognition claim |

Current audio lane executions: **62 synthetic/shared-graph checks** in
`tests/practice-input.test.js`, **23 actual-browser audio checks** in
`tests/practice-audio.test.js`, and the existing audio-input regression checks pass.
All PCM, ports and capture streams are synthetic. The browser suite verifies
explicit Resume reacquires capture before clock progress, source changes
pause without opening the new device, pending cancellation, denied permission,
same-source MIDI/audio targets, wrong/repeated notes, final results and phone
layout. Actual instruments, driver latency, acoustic envelope reliability,
firmware and physical illumination remain unverified. Scale Lock does not
mute acoustic/direct audio; uncertain notes and chords are not guessed.
Audio mode disables virtual-key answers and ignores MIDI/QWERTY grading;
the keyboard remains a visual target preview. MIDI/virtual mode remains
available for those instruments without audio capture.

## Instrument organization and credit

Learn uses explicit Piano, Synth, Guitar, Bass, Drums, Voice and Other categories.
Keyboard/fretboard modes are filtered; Bass uses actual four-string EADG notes.
Shared content is labeled and each new completion remains in its captured
instrument. Learn, Keys lessons and both Woodshed players award the same
canonical instrument XP ledger. Legacy global XP and completion stay unassigned.
There is no passive page/wake XP timer. Plan blocks use exact, fresh instrument
session evidence; unsupported casual-tool timers are labeled rather than inferred.

The readable vector clef remains accessible in every built-in page/workspace,
including Exercises and Settings. One shared root/scale and the same independent
Scale Lock/LUMI/color controls serve every consumer. Modal sheets temporarily
block the disclosure. See [instrument behavior and tests](LEARN-INSTRUMENTS.md).

## Intentional exclusions and remaining validation

- Typed drums/percussion and metronome/count-in clicks are unpitched functional
  producers. There is no whole-page, armed-track or channel-10 blanket escape
  for pitched MIDI.
- Opaque live monitoring and recorded/imported audio waveforms can contain any
  pitch. An explicitly typed arrangement audio clip is preserved; requested
  pitched sampler notes remain guarded. This is not polyphonic pitch removal.
- Local Control OFF and external MIDI Thru OFF are user hardware prerequisites
  for synth sound lockout. The app does not alter those settings, and cloud
  tests cannot validate them or arbitrary delayed hardware feedback loops.
- Arbitrary user JavaScript plugins can create their own AudioContext or MIDI
  access. Shared guarded APIs are covered; bypassing them is outside the
  built-in routing contract. Timbre/FX/harmonics are not spectral confinement.
- Native shared MIDI send/ingress is covered by existing bridge simulations;
  independent three-port practice routes remain Web MIDI only. No native
  build/signing, physical driver, board firmware or LED response was tested.
- The managed environment denies the update suite's two `file://` navigation
  cases; the original full suite passed in hosted CI at `c783524`. The final
  addendum commit still requires its own full hosted gate. HTTP/PWA checks do
  not substitute for that protocol branch. Sampler-DAW's separate integration test needs missing
  `esbuild`; its other 22 MIDI tests passed without modifying that repository.

Final palette appearance, end-to-end latency, instrument local sound and
disconnect persistence remain unverified. The review branch has been published
for CI; main/tag/release/deployment remain held for final gates and the explicit
approval clarification described in [validation](VALIDATION-2026-10-23.md).
Source branches are preserved.
