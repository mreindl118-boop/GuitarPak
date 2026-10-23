# Practice input capabilities

Woodshed's guided player accepts MIDI/virtual keys or explicitly started
monophonic instrument audio. Both feed the same structured performance
engine. Root/scale, score, timing, current/upcoming notes and optional LUMI
guidance remain shared. Audio pitch analysis runs locally; it uploads no PCM
and the detector connects no signal to speakers.

| Input | Supported behavior | Explicit limits |
| --- | --- | --- |
| USB/Bluetooth/native MIDI keyboard or MIDI pickup | Exact MIDI note attacks/releases, channels, repeated articulation, chords and sustain through the selected MIDI route | MIDI interface/driver/OS behavior is hardware-unverified. External synth local sound requires manual Local Control OFF for sound lockout. |
| On-screen / QWERTY keys | Pitched attacks/releases, simultaneous held chords and fresh repeated notes | Uses the selected keyboard view; it does not simulate acoustic recognition. |
| Guitar/bass or another clean monophonic instrument via selected USB audio/DI interface | Stable sounding pitch, paired envelope-based release, fresh pluck after silence or a clear decay/rise, user range/reference/transpose and delay settings | One note at a time. Distortion, very weak fundamentals, competing octaves, noise, bends and fast attacks may be rejected. The detector never shifts an octave toward the expected answer. |
| Voice / monophonic microphone | A stable single sung/played pitch uses the same adapter | Room sound, backing tracks, speakers and another performer can contaminate capture. Use a clean input/headphones; no polyphonic separation or automatic transcription is claimed. |
| Polyphonic score with audio input | Explicitly unavailable; choose MIDI/pickup or the visible arpeggio adaptation | Arpeggiation changes chord onsets to sequential half-beat attacks and labels that adapted timing. It is not the original chord performance. |
| PDF, image, prose or arbitrary recording | No inferred performance targets | A real parsed/generated note model is required. Selecting audio is not an audio-to-score importer. |

Selecting Audio makes its stable detected notes the sole graded input. The
on-screen keyboard stays a disabled target preview; MIDI and QWERTY answers
are ignored. Choose MIDI / virtual keys to perform through those inputs.

USB-MIDI sends note messages. USB audio carries the instrument's sound. An
instrument may expose either or both; connecting its audio interface does not
create MIDI notes. Scale Lock controls built-in pitched note producers and
musical MIDI output. It cannot mute an acoustic instrument, the synth's direct
local engine, or opaque monitored/recorded audio.

## Capture and consent

Opening a page, choosing Audio, listing already available devices or changing
display controls does not open capture. **Start listening** or a deliberate
audio Start acquires the selected input through `App.audioIn.hold` using an
exact-device hold. A missing chosen device does not become a default
microphone. Permission denial is reported; cancelling while permission is
pending closes a late stream and does not start practice.

`App.audioIn` remains the stream owner. Its public `tap(tag)` returns
`{source, context, deviceId}` only for a live held tag. The practice adapter
adds one analyser edge to that source. Stop/pause/navigation, track end,
hidden-page events and device changes disconnect its own edge and release its
hold. Another existing monitor/meter consumer retains its own stream; the
last consumer release stops capture tracks. The analyser itself has no
destination/speaker connection. Existing **Hear input** is a separate explicit
monitor setting, not enabled by this detector.

Legacy ToneIn previously kept an independent capture open even while its
Woodshed tick was paused. `App.tonein.suspend(owner,on)` now stops that capture
before practice opens the shared stream. Releasing suspension preserves the
saved ToneIn preference but does not reopen it, including on later device or
visibility callbacks. An explicit Settings/API start is required to resume it
(turn Tone input off and on in Settings). Pending old ToneIn streams close on
resolution. No automatic permission request is added on practice stop/resume.

## Detection and calibration

`js/pitch-detector.js` extracts the Tuner's normalized square-difference
autocorrelation (NSDF), first trustworthy periodic peak and parabolic
refinement into one pure helper. The Tuner, ToneIn and legacy Woodshed pitch
functions now delegate to it. It removes DC, gates low energy, reports
periodicity confidence and flags a competing octave instead of guessing.

`js/practice-input.js` requires agreeing stable frames, a noise threshold and
cents tolerance before emitting a new note. Held-note hysteresis tolerates
vibrato. A moving bend does not become a new answer until its pitch settles.
Repeated notes require confirmed quiet or a distinct envelope trough/rise;
a sustained signal cannot repeatedly satisfy the same target. Physical
finger release is not measurable from PCM: audio release and hold duration
are envelope estimates, unlike direct MIDI releases.

Set A4 reference, sounding instrument range and manual input transposition
explicitly. Written-score transposition and input transposition are separate.
The default detection delay is an estimate, not a hardware measurement.
Use a reference click and consistent timing results to adjust the input's
manual delay. Timestamped attacks retain their first candidate-frame time;
release debounce retains its first quiet-frame time. The engine uses a
bounded delayed-input window; confirmation processing and measured delay
must fit that window. Very fast or ambiguous notes may not yield a reliable
attack, and real interface/microphone latency remains unvalidated.

## Adapter contract

Browser global `PracticeInput` supports `new PracticeInput(options)` and
`PracticeInput.create(options)`. Constructor callbacks:

```js
const input = new PracticeInput({
  clock: () => App.getAudio().currentTime,
  expectedNotes: () => currentTarget.notes,
  onNote: event => engine.input(event),
  onState: state => showAudioStatus(state)
});
await input.start({
  deviceId: selectedAudioId,
  referenceA4: 440, minMidi: 36, maxMidi: 96, transpose: 0,
  confidence: 0.92, noiseFloor: 0.008, centsTolerance: 35, latencyMs: 100
});
```

Events have `{midi,on,velocity,source:'audio',portId:'audio:<device>',channel:0,
silent:true,at,confidence,cents}`. `at` uses the supplied audio clock minus
manual delay; it is not wall time. `stop(reason)`, `reset()` and `dispose()`
release paired notes; stop/dispose release capture. `state` returns a copy.
The test-only explicit `start({simulation:true})` plus
`feed(samples,sampleRate,time)` processes synthetic PCM without any media
request. Stopped adapters ignore feed calls. No simulation is hardware proof.

## Software evidence

`tests/practice-input.test.js` covers synthetic sine ranges, guitar harmonics,
ambiguous octaves, noise, silence/DC, 44.1/48 kHz, reference tuning, vibrato,
moving bends, range/transposition, repeated plucks, latency timestamps,
reentrant completion cleanup, selected shared capture, no speaker edge,
permission denial/pending cancellation, missing-device rejection, disconnect,
source change and ToneIn suspension/manual restart. It uses fake stream
graphs and synthetic PCM only.

`tests/practice-audio.test.js` exercises the actual app/player/adapter/engine
with fake MIDI, synthetic PCM, injected clock and synthetic MediaStreams.
Existing `tests/audioin.test.js` guards shared monitoring/device behavior.
Final executed results belong in
[VALIDATION-2026-10-23.md](VALIDATION-2026-10-23.md). No microphone, instrument,
driver, audible pitch, native build or physical LUMI was validated.
