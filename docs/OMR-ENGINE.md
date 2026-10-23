# Local notation recognition engine

`js/omr/recognizer.js` exposes `SLRecognition.recognize(options)`. Loading the script performs no recognition, device request or model download. A deliberate call processes rendered pixels in a dedicated local browser worker. It sends no score, image, filename, source text or expected notes to a server.

```js
const result = await SLRecognition.recognize({
  imageData,                 // ImageData or {data, width, height}; grayscale/RGBA bytes
  region,                    // optional original-page rectangle from SLStaffDetection
  page: 1,                   // actual source page, 1–500
  signal: controller.signal,
  onProgress: ({stage, completed, total, message}) => {}
});
```

The result includes model/runtime provenance, raw subtokens and their uncalibrated scores, parsed note/rest events, original-page source boxes, warnings, unsupported notation and diagnostics. Event fields include `midi`, `rest`, `beat`, `duration`, `partId`, `clef`, `keyFifths`, `meter`, `tie`, `sourceAnchor`, `confidence: null` and `verified: false`. `rhythmParsed: true` means the predicted beat/duration grammar is complete and must remain in the draft. Recognition always returns `rhythmKnown: false` and `rhythmVerified: false`: parsed grammar does not verify musical rhythm. An editor must preserve the actual predicted timing, retain the original, save an unverified draft and require review before graded practice.

The API permits one active job. Abort or `SLRecognition.cancel()` terminates its worker, including pending model initialization. A later job uses a fresh worker. Input is bounded to 16 million pixels, dimensions at most 8,192, at most 64 detected staff lines, 32,768 decoded subtokens and a two-minute job deadline. Errors reject honestly; blank/unsupported output contains no invented targets. Mild vertical-shear rectification requires the shared detector's `cropStaff` helper; source boxes map back to the original pixels.

## Pinned assets

The eligible model is [satb-line-omr/model-public-domain](https://github.com/alexanderalber/satb-line-omr/tree/c60823117a5c92b0c29f921dbca023e94026d279/model-public-domain), source commit `c60823117a5c92b0c29f921dbca023e94026d279`, under MIT. Its fp16 ONNX file is 6,422,567 bytes with SHA-256 `0edeb8f9a8103405239d7edbf48aa372158eb3e0cbbe696ec7dbaf768a75c39d`. Runtime loading verifies that hash and the matching vocabulary hash. The separately licensed CC BY-NC-SA model is absent.

ONNX Runtime Web is pinned to the official MIT-licensed npm package `onnxruntime-web@1.30.0`. Its downloaded archive's SHA-512 integrity was checked before extracting the WASM-only runtime. MIT notices, upstream model/code provenance and ONNX Runtime third-party notices are retained. [vendor/omr/manifest.json](../vendor/omr/manifest.json) records each shipped asset's exact byte count and SHA-256.

Inference uses one WASM thread, no GPU, no runtime CDN and `graphOptimizationLevel: 'disabled'`, as required by the model's fp16 LSTM guidance. It works without `SharedArrayBuffer` or COOP/COEP headers. Model/runtime assets total about 21 MB and must be included in the app's offline asset lifecycle before offline recognition is claimed.

## Supported grammar and limits

The model is for engraved single-voice staff lines. Its [upstream vocabulary](https://github.com/alexanderalber/satb-line-omr/blob/c60823117a5c92b0c29f921dbca023e94026d279/docs/vocabulary.md) predicts kern-derived absolute pitches, explicit accidentals, reciprocal durations, rests, clefs, key signatures, meters, ties, beam marks and simple barlines. The local strict parser uses `<b>` token boundaries, never guesses unknown tokens and merges only adjacent matching tied pitches. Kern accidentals already express sounding pitch; key signatures and octave-down clefs are retained without applying a second pitch shift.

Piano/polyphonic staves, chords, multiple voices, repeat expansion, lyrics, dynamics, chord symbols, tempo recognition, scans and handwriting are not established capabilities. A model can omit unsupported notation without emitting a detectable token error. An apparently plausible monophonic result therefore does not prove the source was eligible. Whole-page closed-score detection is conservative; selecting a region does not establish that it contains only one voice. Truncated or ambiguous token records, broken ties and unknown navigation remain explicit unsupported evidence.

Actual cloud inference has misread durations even on simple original engraving. Raw token scores are not calibrated accuracy. Synthetic scan degradation is not validation on a physical scanner, camera or arbitrary PDF collection.

## Checks

```sh
CHROMIUM=/usr/bin/chromium SL_URL=http://127.0.0.1:4593/index.html node tests/omr-engine.test.js
CHROMIUM=/usr/bin/chromium node tests/omr-offline.test.js
```

The engine suite validates strict grammar, uncertainty, source geometry, asset hashes and licenses, then runs the real local ONNX model in Chromium on original generated treble/bass image pixels. Actual chord and repeat fixtures verify that unsupported results stay unverified and retain scope warnings. The repeat fixture demonstrates that a model can omit navigation without emitting an unsupported-token error. Cancellation, resource rejection and blank input are exercised too.

The offline suite uses the actual service worker under `/GuitarPak/`, fully caches the current asset graph, retains an original in real IndexedDB, reloads with networking disabled and runs actual inference. It compares online/offline predictions and hashes, verifies zero HTTP-server requests during offline reload/inference, and checks cancellation and zero practice credit. These tests neither request hardware nor award practice credit. Authored fixture pixels in `tests/fixtures/omr` are original CC0 compositions rendered by the corpus tooling; they contain no purchased or private score.
