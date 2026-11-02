# Runtime loading, MIDI and MXL (js/omr/runtime.js, midi.js, mxl.js)

Files (repo /home/user/GuitarPak):
- `js/omr/runtime.js` - OMR.runtime + OMR.setOrt
- `js/omr/midi.js` - OMR.xml (XML parser/serializer) + OMR.midi (MusicXML -> MIDI, transposition, summary, SMF reader)
- `js/omr/mxl.js` - OMR.mxl (.mxl zip writer/reader)
- `tools/omr/split_models.py` - models/omr/*.partNN + manifest.json (generated, not committed)
- `tools/omr/midi_ref.py` - references: FIXTURES/<page>/13-midi-ref.json, FIXTURES/13-midi-synthetic.json, FIXTURES/13-midi-edge.json
- `tests/omr-runtime.test.js` (34 checks with models + NODE_PATH; 13 without), `tests/omr-midi.test.js` (82 checks with fixtures, sheetlab-ref and SL_OMR_PYTHON; 9 without fixtures)

Run:
```
cd /home/user/GuitarPak
OMR=<your reference folder (tools/omr/README.md)>
$OMR/venv/bin/python -I tools/omr/split_models.py $OMR/shipmodels           # models/omr (needed once)
$OMR/venv/bin/python -I tools/omr/midi_ref.py --jobs 3 $OMR/fixtures         # ~10 min (pages) + ~8 (synthetic)
$OMR/venv/bin/python -I tools/omr/midi_ref.py --audit --jobs 4 $OMR/fixtures # ~30 s: 13-midi-audit.json
SL_OMR_FIXTURES=$OMR/fixtures SL_OMR_MODELS=$OMR/shipmodels SL_OMR_PYTHON=$OMR/venv/bin/python \
  NODE_PATH=$OMR/jsenv/node_modules:/opt/node22/lib/node_modules /opt/node22/bin/node tests/omr-midi.test.js
... same for tests/omr-runtime.test.js
```

## Results

MIDI: **byte-identical .mid files** to the SheetLab engine (music21 10.5.2 + mido 1.3.3 polish) in every
case that has an engine MIDI:
- 7 pages x {fixture `11-score.musicxml`, engine-112, engine-80 (generate_xml with metronome=tempo and
  the title, as translate_file builds it, from the shipping-model voices)} x tempo 112/80 x program
  0/24/40 x transpose 0/+2/-3/+7, plus title cases: 294/294 identical; brahms (repeats music21 cannot
  expand): 50/50 fail the same way (strict) and play unexpanded (default); 6 non-latin-1 title cases =
  the documented deviation below.
- synthetic (153 random/edge/triplet/merged generate_xml scores, transpose 0/+2, plus "exports: false"
  cases where music21's own MusicXML export failed first): 230/230 identical, 76/76 ExpanderException
  cases identical in type and message.
- edge (programmatic variants: generate_xml's own metronome 120 / 96+sound 132 against the engine's
  tempo 80, a key that transposes to 8 sharps, minor keys, a bare `<sound tempo>`, a dotted-quarter
  beat unit): 19/19 identical, 1/1 raw (unpolished) file like the engine's, 2/2 ExpanderException.
- End to end: the engine's own outputs in `$OMR/sheetlab-ref` (PDFs, multi-page merged voices):
  belle-let, carcassi-op60-07-let, 02-entree-let .mid byte-identical from their .musicxml;
  brahms-vals3-let fails with the identical "ExpanderException: ..." message (strict).
- Summary (measures, notes, chords, seconds): 100% equal to the music21-computed reference.
- readSmf reads every engine file exactly like mido.
- Transposed MusicXML: music21's spellings + key signatures (per PartStaff, per measure/offset, in
  recurse() order) in 84/84 page views and 306/306 synthetic + 20/20 edge views.
- XML parser: all 174 inputs parse and serialize back to the identical text.
- .mxl: Python zipfile.testzip() passes, music21.converter.parse reads both deflated and stored
  zips like the plain MusicXML; container.xml identical to music21's.

Runtime: manifest/parts integrity, sha256 (subtle + a JS fallback for non-secure contexts), Cache
Storage path, vendor override, offline second run, tamper refusal, EP/bundle choice - all in Node
with a worker-like vm context and fake fetch/caches; plus real ORT 'wasm' sessions for the three models
in Node. Also verified by hand (scratch, not in the suite) in headless Chromium (Playwright build 1194) in a real Web
Worker: opencv.js + ort.wasm.min.js via importScripts(blob:), .mjs via import(blob:), all three
models run, cached in Cache Storage (second run downloadSize = 0), WebGPU path with SwiftShader.

## OMR.runtime API

```
OMR.runtime.configure({base, models:'models/omr/', vendor:null, ep:'auto'|'wasm'|'webgpu', readFile, cache:true, numThreads})
OMR.runtime.loadCv(onProgress?)        -> Promise<cv>   (calls OMR.setCv when cv.js is loaded)
OMR.runtime.loadOrt(onProgress?)       -> Promise<ort>  (OMR.setOrt(ort) injects one instead)
OMR.runtime.manifest()                 -> Promise<manifest.json>  (network, else the cached copy)
OMR.runtime.modelBytes(name, onProgress?) -> Promise<Uint8Array>  name: segnet|encoder|decoder or homr's file name
OMR.runtime.session(name, {ep, onProgress, onRuntimeProgress}) -> Promise<InferenceSession> (kept; one per model)
OMR.runtime.release(name?)             frees one / all sessions
OMR.runtime.prepare(onProgress?)       runtime + all three sessions, one progress stream of downloaded bytes
OMR.runtime.downloadSize()             -> {total, models, runtime, files:[{name, kind, bytes, cached}], cacheAvailable}
OMR.runtime.cachedNames()              -> ['segnet', ..., 'opencv.js', ...]
OMR.runtime.clearCache()               -> Promise<bool>  (deletes Cache Storage 'soundlab-omr-v1')
OMR.runtime.info()                     -> {platform, ortVersion, bundle, numThreads, crossOriginIsolated, webgpu, gpu, cvLoaded, manifestVersion, sessions:{name:{ep, wanted, fallback, createMs, bytes}}, source, log}
```
Progress callbacks: `(bytesDone, bytesTotal, {name, file, cached, fileDone, fileTotal})`.
- `base` must be the app root (the worker passes it: the worker's own URL is js/omr/worker.js). The
  worker protocol's `models:{...urls}` maps to `configure({models: '<dir>/'})` (a directory).
- Every runtime file is fetched by runtime.js, checked against the pinned sha256 (the npm tarball
  bytes; checked equal to what jsDelivr serves with curl), cached by sha256 and run from a `blob:`
  URL; `ort.env.wasm.wasmPaths = {mjs: blob, wasm: blob}`. A tampered CDN file is never executed.
  Without Blob/URL.createObjectURL it falls back to the plain CDN URL (unverified, uncached).
- Models: fetched part by part (same origin), each part's sha256, then the whole model's sha256,
  stored whole in Cache Storage under `omr-cache/<sha256>/<name>.onnx`; the manifest is cached too,
  so an offline run works. A new manifest prunes entries it no longer names.
- ORT env: `numThreads = crossOriginIsolated ? min(4, hardwareConcurrency) : 1`, `proxy = false`,
  `logLevel = 'error'`. Without COOP/COEP headers (GitHub Pages has none) it is single-threaded.
- Sessions are created from bytes with default options (graphOptimizationLevel 'all').

## Download sizes (first run)

| file | bytes | over the wire (jsDelivr br) |
|---|---:|---:|
| models: segnet (int8) | 14,389,494 | ~same (GitHub Pages: no compression for .partNN; gzip would save ~25%) |
| models: encoder (int8) | 15,428,359 | ~same |
| models: decoder (int8) | 47,356,003 | ~same |
| **models total** | **77,173,856** | ~77 MB |
| opencv.js 5.0.0-release.1 | 13,298,869 | 3,500,927 |
| WASM bundle: ort.wasm.min.js + ort-wasm-simd-threaded.mjs + .wasm | 53,796 + 24,738 + 14,848,852 | 15,371 + 9,397 + 3,195,270 |
| WebGPU bundle: ort.webgpu.min.js + .asyncify.mjs + .asyncify.wasm | 70,811 + 53,457 + 28,747,738 | 22,223 + 19,649 + 5,983,404 |

So: wasm path 105.4 MB uncompressed (models 77.2 + runtime 28.2), ~84 MB over the wire; WebGPU path
119.3 MB (runtime 42.2), ~87 MB over the wire. Cache Storage keeps uncompressed bytes (~105-120 MB).
ort.min.js / ort.all.min.js would load the JSEP build (29.5 MB wasm); not used.

## Execution providers - what was verified, what was not

- All three shipping models run on 'wasm' in Node (onnxruntime-web 1.31.1, ort.node build) and in
  headless Chromium's worker (ort.wasm.min.js and ort.webgpu.min.js builds both run 'wasm').
  Node's and the browser's 'wasm' outputs are bit-identical (segnet and encoder on the same input).
- The decoder always uses 'wasm' (com.microsoft MultiHeadAttention/SkipLayerNormalization + int8
  MatMulInteger), regardless of the requested EP.
- 'auto' = 'webgpu' bundle + webgpu sessions for segnet/encoder when navigator.gpu gives an adapter
  (falls back to 'wasm' if session creation fails; info().sessions[name].fallback says why).
  Verified functionally only with Chromium's SwiftShader (software) WebGPU: sessions are created
  and run. Findings that matter for the choice:
  1. The int8 segnet/encoder consist of ConvInteger / MatMulInteger / DynamicQuantizeLinear; neither
     the JSEP op list nor the native WebGPU EP (asyncify build) has kernels for them, so ORT runs the
     heavy ops on its CPU EP anyway and only glue ops (Add/Mul/Relu/LayerNorm/Erf...) go to the GPU,
     with GPU<->CPU copies in between. A speed-up is not expected; the WebGPU path also downloads
     ~14 MB more (asyncify wasm).
  2. Numerics: segnet on SwiftShader WebGPU is bit-identical to 'wasm'; the encoder is NOT (max
     |diff| 0.25, mean 0.033 on a 1x1280x512 output for a deterministic input), because the GPU's
     float results feed DynamicQuantizeLinear and flip quantization steps. That changes decoder
     inputs, so token parity with the Python (CPU) reference is lost on WebGPU.
  Also measured: even 'wasm' is not bit-identical to Python onnxruntime CPU for the encoder (max
  |diff| 0.24 on the same input; segnet is identical) - different MLAS kernels (x86 AVX vs WASM SIMD)
  plus dynamic quantization. The transformer port's parity suite will show whether tokens change.
  **Recommendation**: the worker passes `ep: 'wasm'` until WebGPU is measured on real devices
  (faster? same tokens?). runtime.js keeps the brief's 'auto' as its default.
- Not verifiable here: real GPUs (Chrome/Edge desktop, Android Chrome, Safari 26 WebGPU), Safari's
  classic-worker `import()` of a blob: module and blob: wasm instantiation (expected to work: Safari
  15+ supports dynamic import in workers), multi-threaded ORT (needs crossOriginIsolated; pthread
  workers would be spawned from the blob: .mjs), iOS memory limits with ~105 MB cached + ~150 MB of
  wasm heap, CDN fetches from a browser here (the sandbox's TLS proxy is not trusted by Chromium; the
  same bytes were served through the vendor path).
- Timings here (1 thread, x86 server): Node segnet 320x320 tile ~0.6-0.9 s, encoder tile ~2.3-2.6 s,
  decoder ~55 ms/step; browser worker: segnet session 0.5 s + run 0.6 s, encoder run 2.3 s.

## OMR.midi API

```
OMR.midi.fromMusicXml(xml, {tempo=112, program=0 | 'GM name', transpose=0, title='', strict=false, onWarning}) -> Uint8Array
  (undefined/null options take these defaults; program must be 0..127 or a name (unknown name = 0, like
  dict.get), tempo a finite number, transpose a whole number - else RangeError/TypeError. tempo 0 throws
  ZeroDivisionError like music21; a tempo under ~3.58 bpm leaves music21's unpolished file, like the engine)
OMR.midi.convert(xml, opts) -> {midi, warnings, repeatsExpanded, polished, summary}
OMR.midi.transposeMusicXml(xml, semitones) -> string   (homr's XML with music21's spellings + keys)
OMR.midi.summary(xml, opts) -> {measures, notes, chords, durationSeconds, noteEvents:[{pitchMidi, pitchName, startBeat, durationBeats, partIndex}]}
OMR.midi.importScore(xml) / transposeScore(score, n) / readSmf(bytes) / GM_INSTRUMENTS / TICKS_PER_QUARTER (10080)
OMR.xml.parse(str) -> {type:'document', children, root}; serialize(node); find/findAll(el, 'a/b'); text(el); childElements(el, name?)
```
summary: TranslationResult declares total_measures/notes/chords/duration_seconds but the engine never
fills them; defined here (and computed identically with music21 in midi_ref.py) as: measures = most
measures of a (Part)Staff, notes = note heads incl. chord members and grace notes, chords = chord
objects, seconds = last MIDI note event / 10080 * 60 / tempo (repeats expanded). noteEvents follow
SheetLab's NoteEvent (pitch_midi, pitch_name in music21's default spelling, start/duration in beats,
part index = MIDI track - 1).

### What midi.js reproduces (music21's MusicXML import -> MIDI, then mido's polish)

- Import (xmlToM21): part-list instruments (midi-program-1, midi-channel-1, names; bestName for the
  track name), measures with divisions, backup/forward (forward = hidden rest, Finale workaround),
  voices (one Voice per distinct voice when a measure has >1, string-sorted), chords (first note's
  duration, articulations once per type over pitch-sorted notes), grace notes (duration 0), ties
  (`<tie>` start/stop -> continue), full-measure rests (measure="yes" / whole-breve rests take the
  time signature's length), empty measures (a rest of the bar's length), overfull measures (the
  1/16 / 1/12 tolerance rule), measure offsets from highestTime, PartStaff splitting by staff number
  (no-staff elements copied to every staff, lone voices flattened), right-barline repeats always
  "end" (homr writes its repeatStart as a forward repeat in a RIGHT barline; music21 turns it into an
  end repeat), RepeatBrackets from `<ending>` (shared spanner bundle across parts; only completed
  brackets reach a part; number ranges), dynamics (incl. homr's `<other-dynamics>`, which music21
  treats as a Dynamic named "other-dynamics" = 0.5), metronome marks (beat-unit + dots) and
  `<sound tempo>`, key (fifths, mode) and time signatures.
- Transposition (Score.transpose(int)): Interval(int) is implicitDiatonic -> every pitch gets the
  Pitch.ps setter's default spelling (C C# D E- E F F# G G# A B- B) regardless of its old spelling;
  keys move their major tonic the same way (so 6 sharps + 2 = G# = 8 sharps).
- streamToMidiFile: expandRepeats (Expander: repeat bars, innermost first, RepeatBracket groups,
  coherence checks -> ExpanderException; expanded measures re-appended by highestTime), conductor
  track (MetronomeMark/TimeSignature/KeySignature in recurse() order, one per offset rule, defaults
  120 bpm and 4/4), realizeVolume (dynamics extended to the next one; 0.5 + 0.20866, x 2*scalar,
  + articulation volumeShift, clip), stripTies(matchByPitch) over the flat notes-and-rests, channel
  assignment (channelInstrumentData; all homr parts share program 53 -> channel 1), packets sorted by
  (tick, NOTE_OFF < PITCH_BEND < others), a zero pitch bend per track, start events (track name,
  program change), end-of-track a quarter after the last event.
- Python numerics (reworked by the adversarial audit): offsets/durations are Python values as
  music21 keeps them - opFrac'd (a power-of-two denominator = a float, else a Fraction with BigInt
  parts), and every place music21 adds them is reproduced with Python's types: Fraction + Fraction
  exact, anything with a float a rounded double, opFrac(float) = limit_denominator(65535). The
  places: xmlToDuration (float(duration) / divisions), offsetMeasureNote (a chord's inner notes add
  0.0), backup (float subtraction), forward, directions/sound (float(offset + position)), the raw
  float lastMeasureOffset, Stream.highestTime (0.0-length clefs/keys/dynamics and the Voice wrapper
  turn Fractions into floats), the overfull-measure nearestMultiple test in floats,
  flattenUnnecessaryVoices (0.0 + offset), Stream.append in the repeat expansion, flatten (0.0 +
  measure offset + offset), getOffsetInHierarchy for the conductor track (opFrac at each level),
  extendDuration/realizeVolume, stripTies' durSum. Exact rationals were right only while every
  denominator stays <= 65535; with exotic tuplets (divisions per quarter above 65535, e.g. 11-, 13-,
  17-tuplets together) music21 approximates offsets and the old port gave other velocities, missing
  conductor events and shifted notes (27 of 1240 random fuzz scores). Now 2040/2040 fuzz scores
  (576 with divisions > 65535) are byte-identical; regression set: FIXTURES/13-midi-audit.json
  (midi_ref.py --audit). ticks = int(round(ql*10080)) half to even, velocities int(round(x*127)).
- Polish (_polish_midi_file on mido's view): set_tempo(mido.bpm2tempo(tempo)) + track_name(title) at
  the start of track 0, every program_change -> the GM program, a program_change on channel 0 for a
  track without one (the conductor track); mido's writer (running status, fix_end_of_track).
  A key signature beyond +-7 makes mido fail to READ music21's file -> the bare except keeps the raw
  music21 file (music21 writer: no running status) - reproduced.

### Deviations (deliberate, documented in code)

1. Title that latin-1 cannot encode (e.g. "Für Elise – più mosso"): mido's save raises inside the
   polish after writing the MThd header; the bare except leaves a 14-byte, unreadable .mid. Here the
   title is written as UTF-8 and everything else is identical (checked against the same input with a
   latin-1 title). `convert().warnings` says so.
2. Repeats music21 cannot expand (brahms-vals3-p1, 76 synthetic cases): the engine reports
   "ExpanderException: cannot expand Stream: badly formed repeats or repeat expressions" and writes no
   MIDI at all. Here the MIDI is written without repeat expansion (warning 'repeats not expanded: ...',
   `repeatsExpanded: false`); `strict: true` throws the same ExpanderException as music21.
3. The engine also fails when music21's MusicXML export (score.write('mxl')) fails (36 KeyError,
   34 StreamException, 28 MusicXMLExportException, 2 MeterException among the random synthetic
   scores; none on the 7 pages). We never call music21's exporter, so those succeed here (their MIDI
   path alone was checked byte-identical via the "exports: false" references).
4. transposeMusicXml keeps homr's document and only changes `<step>/<alter>/<octave>` (an `<alter>`
   is added after `<octave>` like homr writes it, removed for naturals; an existing `<accidental>`
   is renamed) and `<fifths>`; music21 re-exports the whole score (different layout, `<accidental>`
   display marks, its inserted instrument and tempo). Pitches and keys are what music21 gives.
5. .mxl content: the engine's .mxl holds music21's re-export (with the GM instrument and tempo
   inserted); ours holds homr's MusicXML (or the transposed one). The zip layout and container.xml
   are music21's.
6. Inputs outside homr's subset that music21 handles more fully and midi.js only approximately (never
   produced by generate_xml): instruments named without `<midi-program>` (music21 maps names to
   programs), `<transpose>` (transposing instruments), percussion/unpitched, D.C./segno/coda
   words, ottavas, microtones in transposition, score-timewise.

## OMR.mxl API

```
OMR.mxl.write(xml, innerName='score.musicxml', {date}) -> Promise<Uint8Array>  (deflate-raw via CompressionStream, else stored)
OMR.mxl.writeStored(xml, innerName, {date}) -> Uint8Array
OMR.mxl.read(bytes) -> Promise<{files:{name: Uint8Array}, rootfile, xml}>
OMR.mxl.crc32(bytes), OMR.mxl.containerXml(name)
```
Entries: the score first, then META-INF/container.xml (music21's text, byte for byte); UTF-8 names
flagged (bit 11); version made by Unix 2.0; external attributes 0644. No `mimetype` entry (music21
writes none; MusicXML 4 readers accept that).

## Notes for the worker / page

- Worker init: `OMR.runtime.configure({base, ep: 'wasm', vendor?})`, then show `downloadSize()`
  before the button, `prepare(progress)` on the button.
- Finish: xml = generate_xml(...) string -> `OMR.midi.convert(xml, {tempo, program, transpose, title})`
  -> midi + summary; `.musicxml` = transpose ? `transposeMusicXml(xml, n)` : xml (the engine copies
  homr's XML when not transposed); `.mxl` = `await OMR.mxl.write(thatXml, stem + '.musicxml')`.
- midi.js / mxl.js need nothing else loaded (no cv, no ort).

## Second adversarial audit (midi.js / mxl.js / runtime.js)

New references: `python -I tools/omr/midi_ref.py --audit2 --jobs 2 $OMR/fixtures` (about 45 s) writes
`FIXTURES/13-midi-audit2.json`; `tests/omr-midi.test.js` runs it as "audit2" plus three tables.
Everything in it is music21 / mido / expat output:
- 70 random generate_xml scores over the WHOLE vocabulary (every clef, key, time signature, pitches C0..B9
  with double accidentals, all articulations/dynamics, grand staffs, 1-3 or 9-13 parts, repeats in some)
  x random engine options (tempo 20..300 or fractional, every GM menu program, transpose -12..+12, titles);
  part layouts that put the piano on channel 10 / 11 / 16; programs outside the menu; tempos -60, 1e-4,
  3.5763, 5e7, 2^31, 1e300; transposes +-48, 60, 100; degenerate voices (empty, clef only, grace only,
  repeat only, ...); 33 "lenient" cases (repeats music21 cannot expand, translated unexpanded).
- tables: Stream.transpose of all 15 key signatures for n = -24..24 (735) and of 504 spelled pitches x
  14 intervals (3528, incl. MIDI folding above 127); 300 texts with characters XML 1.0 forbids (raw or
  as references, in text, attributes, comments) and expat's error for each.
Out of the suite (scratch): 1100 more random scores x random options byte-identical (0 differences),
all 128 GM programs identical, music21 reading OUR transposed MusicXML gives the same pitches/keys as
its own transposition (200/200 scores, transposes -12..+12).

Fixed (each has a regression check that fails on the previous midi.js):
1. A character XML 1.0 forbids (e.g. a control character in a PDF metadata title, which generate_xml
   writes into `<work-title>`) makes the engine's `music21.converter.parse` fail ("ParseError: not
   well-formed (invalid token): line 2, column 49"), so the engine writes no MIDI. midi.js parsed it
   silently. Now `strict` throws the same ParseError (expat's message, line and code-point column:
   `OMR.xml.charError`), and the default makes the MIDI with a warning that the MusicXML is not
   well-formed. The .musicxml/.mxl exports would still carry the character: the worker should strip
   such characters from the title before generate_xml (not in this area).
2. Dynamics: music21's Dynamic.volumeScalar fallback reads `thisDynamic[-1]` after dropping a leading
   character when the value contains an 's', an IndexError for `<s/>`, `<other-dynamic>s</other-dynamic>`
   or a blank `<other-dynamic>`, raised only when a note falls in the dynamic's span. midi.js returned 0.5.
   Now the scalar is computed where music21 reads it and raises the same IndexError (not reachable from
   homr's vocabulary, which only has pppp..sfp + other-dynamics).
3. `convert({program: '24'})`: a program NUMBER given as a string (a `<select>` value) was looked up as a
   GM name and silently became the piano (0). Now a string of digits is that program.
4. `transposeMusicXml(xml, 1.5)` truncated to 1 (`| 0`) while `convert` refuses a fractional transpose, so
   the .musicxml and the .mid could disagree. Now it throws the same RangeError; '2' = 2, null = 0.

Checked and refuted (no change): KeySignature transposition (KeySignature.transpose(int) alone respells
keys beyond 6 accidentals, but Score.transpose passes an Interval, which does not: midi.js matches the
Stream path in 735/735); tempo via convertTempoByReferent (60 / ((60 / n) / ql)) vs n * ql: identical
set_tempo for 41,901 tempos x 11 referents; channel assignment with 9-18 parts (the piano can land on
channel 10 = GM drums, exactly like the engine); MIDI folding of pitches above 127; set_tempo beyond
24 bits / negative tempos (unpolished like the engine); time signatures with numerators > 255 or
denominators that are not powers of two; mxl container/CRC/stored fallback; runtime sha256 fallback,
cache keys, prune, progress.

Remaining (documented, unchanged): ep 'auto' picks WebGPU for segnet/encoder when there is an adapter,
which per the measurements above changes the encoder's numbers (parity needs 'wasm'); `release()` while
a session is still being created does not free that session (it is kept and reused by the next call);
`configure({base})` must be the app root with a trailing slash or a file URL in it (a bare
'https://host/app' resolves models to https://host/models/omr/); a tempo of +-Infinity is refused with a
TypeError where Python raises OverflowError; RepeatBracket number ranges like "3-1" (never written by
homr) give an empty range where music21's max([]) raises.
