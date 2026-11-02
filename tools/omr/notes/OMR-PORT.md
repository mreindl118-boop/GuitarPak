# SheetLab in soundLAB: on-device port of homr (design + rules for every agent)

Repo: /home/user/GuitarPak (branch `claude/verify-project-files-4bchk6`). Read CLAUDE.md there first
(project conventions). Do NOT commit, push, reset, stash or checkout: several agents edit the working
tree at the same time; touch only the files your brief names.

## Goal

soundLAB 1.4.0 gets "Sheet music -> MIDI" (the owner's SheetLab app) running natively inside the PWA
on every device (iPad Safari, Android Chrome/WebView, desktop): PDF or photo/scan of sheet music ->
optical music recognition -> MusicXML -> MIDI, then play it on the synth, practise it in the Woodshed,
open it as tab, or download/save it. Nothing is sent to a server: all compute runs in a Web Worker.

The behaviour to reproduce is:
1. **homr** (Python OMR, AGPL-3.0; source in `$OMR/homr/homr/`, pinned clone) = the recognition
   pipeline. Inference path only (`homr/homr/**` minus training/validation/title OCR).
2. **The owner's SheetLab engine** (`$OMR/tools/sheetlab_engine.py`, the spec; adapted only to the
   current homr API) = the wrapper around homr: PDF rendering at 300 DPI, dark scan-frame stripping,
   low-res upscale + unsharp mask, 2-page landscape spread splitting, cover/blank page skipping,
   merging voices across pages, MusicXML 4.0, MIDI with tempo / GM instrument / transpose / title.

`$OMR` = <your reference folder (tools/omr/README.md)>

## Reference environment (already set up; use it, don't rebuild it)

- Python venv with homr installed editable: `$OMR/venv/bin/python -I ...` (numpy 2.4, opencv 5.0.0,
  onnxruntime 1.31, music21, mido, PyMuPDF, pypdfium2). Run your own probes in Python whenever the
  exact semantics of a numpy/cv2/PIL call are unclear: `$OMR/venv/bin/python -I -c '...'`.
- Node 22: `/opt/node22/bin/node`. JS deps for Node tests in `$OMR/jsenv/node_modules`:
  `onnxruntime-web@1.31.1`, `@techstark/opencv-js@5.0.0-release.1` (OpenCV 5.0.0 = the SAME version as
  the Python cv2, so cv results must match exactly). Run Node with
  `NODE_PATH=$OMR/jsenv/node_modules:/opt/node22/lib/node_modules`.
- Models (the shipping set, chosen after measuring 0.21% token difference vs fp32 on 7 pages):
  - segnet  `$OMR/qmodels/segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f.onnx` (int8, 14.4 MB)
  - encoder `$OMR/qmodels/encoder_pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31.onnx` (int8, 15.4 MB)
  - decoder `$OMR/models/decoder_pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31.onnx` (already int8, 47.4 MB)
  - tokenizers: `$OMR/homr/homr/transformer/tokenizer_{rhythm,lift,pitch,note}.json` (check which are used)
  All three run in onnxruntime-web 1.31.1 WASM (verified in Node). Use env SL_OMR_MODELS=<dir> in tests
  pointing to a dir with these files (create `$OMR/shipmodels/` with symlinks/copies named as above).
- Stage fixtures from the Python reference (generated with the shipping models) in `$OMR/fixtures/<page>/`
  for 7 public-domain Mutopia pages (02-entree-p1, ElCapitanMarch-p1, belle-p1, brahms-vals3-p1,
  bwv797-p1, carcassi-op60-07-p1, no11-p1). See `$OMR/tools/dump_stages.py` for exactly what each file
  is (00-input .. 11-score.musicxml). JSON dumps keep Python attribute names (snake_case); `contours`
  are dropped (only `contours_len`); big arrays are `{__nd: shape, dtype, sha1}`.
- `$OMR/samples/*.pdf|*.mid` the source PDFs and the composers' MIDI (ground truth for sanity only).
- `$OMR/sheetlab-ref/summary.json` (+ .mid/.musicxml/.mxl) = the SheetLab engine run end-to-end on
  the PDFs (when present).

## Architecture

```
js/omr/                    the engine (classic scripts; run in the worker AND in Node tests)
  np.js                    numpy/Python semantics helpers + image type (OMR.np, OMR.py)
  cv.js                    OpenCV wrapper with cv2-Python-shaped calls (OMR.cv2)
  pil.js                   Pillow-exact resize (OMR.pil.resize)
  <homr module>.js         one JS file per homr Python module, same name (bounding_boxes.js,
                           model.js, staff_detection.js, ...). transformer/* -> js/omr/transformer_*.js
                           segmentation/inference_segnet.py -> js/omr/inference_segnet.js
  engine.js                the owner's SheetLab engine (preprocess, spreads, page loop, merge, options)
  midi.js                  MusicXML (as homr writes it) -> Standard MIDI File, tempo/program/transpose/title
  mxl.js                   .mxl zip writer (+ tiny zip reader if needed)
  runtime.js               loads opencv.js + onnxruntime-web + models (fetch, sha256, Cache Storage, progress),
                           picks the execution provider (WebGPU for segnet/encoder when usable, WASM otherwise)
  worker.js                Web Worker entry: importScripts(...) the above; message protocol below
js/sheetlab.js             the soundLAB page module ('sheetlab'): UI, pdf.js rendering, worker driver,
                           exports, routing to Hub player / Woodshed / Songs, library save
tests/omr-*.test.js        Node parity suites (no browser) + tests/sheetlab.test.js (Playwright, page)
tools/omr/                 the Python reference tools (dump_stages.py, run_sheetlab.py, cmp.py) + README
models/omr/                the three .onnx models, split into <= 14 MB parts + manifest.json (sha256)
```

### Module pattern (every js/omr file)

```js
/* soundLAB OMR: port of homr/<module>.py (AGPL-3.0, github.com/liebharc/homr). */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  ...
  OMR.bounding_boxes = { createRotatedBoundingBoxes: createRotatedBoundingBoxes, RotatedBoundingBox: RotatedBoundingBox };
})(typeof self !== 'undefined' ? self : globalThis);
```

- Classic script (no import/export): the worker loads them with importScripts, Node tests with require.
- ES2017 is fine inside js/omr (class, const/let, arrow functions, async/await, typed arrays) since it
  mirrors Python classes; 2-space indent, semicolons, single quotes. Keep homr's comments that explain
  WHY (they are part of the port); add `// homr: <file>.py:<line>` anchors at function heads.
- Naming: `OMR.<python_module_name>` holds the module's exports. Python `snake_case` functions,
  methods AND attributes become `camelCase`; classes keep `PascalCase`; module constants in
  constants.py become `OMR.constants.camelCase`. Same argument order, same defaults. Python keyword
  args become a trailing options object only where the Python call sites use keywords.
- Dependency order = Python import order. A module only uses what an earlier-loaded module exports.
  The load order list lives in `js/omr/manifest.js` as `OMR.FILES = [...]` (one place; worker,
  tests and sw.js read it).

### Python semantics that MUST be reproduced (OMR.py / OMR.np, in np.js)

- `round(x)` = banker's rounding (round half to even) -> `OMR.py.round`. `int(x)` truncates toward 0.
  `//` floors, `%` takes the divisor's sign -> `OMR.py.floorDiv`, `OMR.py.mod`. `.astype(np.int64)` /
  `astype(int)` truncate toward 0. `np.round` = half to even too.
- `sorted`/`list.sort` are stable (JS sort is stable too); `key=` + `reverse=True` keeps stability
  semantics of Python (reverse=True is NOT the same as reversing a stable ascending sort when keys tie!).
- `np.median` (mean of the two middle values), `np.mean`, `np.std` (population), `np.percentile`
  (linear), `np.argmax/argmin` (first occurrence), `np.diff`, `max(list, key=)` first max wins.
- float32 vs float64: numpy arrays created from cv2 float32 data stay float32 in arithmetic (e.g.
  `np.float32` image math). Mirror with Float32Array / Math.fround where results feed comparisons.
- Truthiness: empty list/array is falsy, `if arr:` on numpy raises; 0.0 falsy.
- dict iteration order = insertion order (JS Map / object with non-integer keys).

### Images and cv2 (OMR.np image type + OMR.cv2 in cv.js)

- Image = `{ h, w, c, data }` with HWC row-major `Uint8Array` (or `Float32Array` for float images),
  exactly numpy's memory layout. Helpers: zeros/full/clone, crop (copy, numpy slicing semantics incl.
  clamping), get/set, channel ops, threshold, boolean masks, sum, nonzero bbox, etc.
- OMR.cv2 exposes the cv2 calls homr uses with Python-shaped arguments and return values:
  `findContours(img, mode, method) -> [contours, hierarchy]` (contour = Int32Array of x,y pairs, i.e.
  numpy (N,1,2) flattened), `minAreaRect(contour) -> [[cx,cy],[w,h],angle]`, `boxPoints(rect) ->
  [[x,y]x4]` (float), `fitEllipse`, `boundingRect`, `contourArea`, `convexHull`, `pointPolygonTest`,
  `intersectConvexConvex(p1,p2) -> [area, poly]`, `rotatedRectangleIntersection(r1, r2) -> [flag, pts]`,
  `HoughLinesP`, `morphologyEx`, `getStructuringElement`, `dilate`, `erode`, `resize`, `remap`,
  `warpAffine`, `getAffineTransform`, `invertAffineTransform`, `cvtColor`, `threshold`,
  `adaptiveThreshold`, `GaussianBlur`, `addWeighted`, `blur`, `calcHist`, `CLAHE apply`, `fillPoly`,
  `fillConvexPoly`, drawing (`line`, `circle`, `ellipse`, `rectangle`, `drawContours`) and constants
  (`cv2.RETR_TREE`, ...). Every wrapper converts to cv.Mat, calls opencv.js, converts back and
  `.delete()`s every Mat it created (no leaks: the worker runs many pages).
- `cv2.Subdiv2D` is NOT in opencv.js: staff_dewarping's DelaunayTriangulation must be reimplemented so
  it returns the same triangle SET (order may differ; document if homr depends on order).
- `cv2.findNonZero` is missing in opencv.js: use a JS scan.
- Pillow: `resize_image` uses `PIL.Image.resize` (default BICUBIC with antialias support scaled by the
  downscale factor, fixed-point 8-bit arithmetic). Port Pillow's Resample.c exactly
  (precompute_coeffs, normalize_coeffs_8bpc, horizontal then vertical pass, rounding, clip) so the
  output is byte-identical. Verify against `02-resized.png`.

### Data model

Port homr's classes 1:1 (BoundingBox, AngledBoundingBox, RotatedBoundingBox, BoundingEllipse,
Note, Rest, Accidental, BarLine, Clef, StaffPoint, Staff, MultiStaff, EncodedSymbol, ...).
Attributes camelCase (`average_unit_size` -> `averageUnitSize`). Parity helpers in tests convert the
Python dump's snake_case keys to camelCase before comparing. Floats compare with a tolerance of 1e-3
relative (float32 noise); integer coordinates, counts, enums and token strings must match exactly.

### Execution: worker protocol (worker.js)

```
main -> worker  {cmd:'init', base:'<url of app root>', models:{...urls}, ep:'auto'|'wasm'}
                {cmd:'page', id, label, image:{w,h,data:Uint8ClampedArray RGBA (transferred)}, opts}
                {cmd:'finish', id, opts} -> merge pages, MusicXML, MIDI, MXL
                {cmd:'cancel'}
worker -> main  {type:'progress', id, stage:'download'|'load'|'segment'|'staffs'|'read'|'write', done, total, note}
                {type:'page', id, label, staffCount, voiceCount, skipped:null|'reason', preview:{w,h,boxes:[...]}}
                {type:'result', id, title, musicxml:string, midi:ArrayBuffer, mxl:ArrayBuffer, summary:{...}}
                {type:'error', id, message}
```
The worker keeps sessions alive between pages. Inference is single-threaded WASM unless
crossOriginIsolated (then ort threads); WebGPU when `navigator.gpu` gives an adapter (segnet + encoder;
the decoder stays on WASM: it uses int8 MatMulInteger + contrib ops). Never block the main thread:
audio runs there.

### Runtime and model loading (runtime.js)

- opencv.js and onnxruntime-web are NOT vendored: loaded from jsDelivr with pinned versions
  (`https://cdn.jsdelivr.net/npm/@techstark/opencv-js@5.0.0-release.1/dist/opencv.js`,
  `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/` + `ort.all.min.js` or the wasm bundle).
  A same-origin `vendor/omr/` override is honoured when present (tests, offline dev).
- Models: `models/omr/manifest.json` lists each model's parts, byte size and sha256. The loader
  fetches parts (same origin), verifies sha256 (crypto.subtle), concatenates, and keeps the bytes in
  Cache Storage `soundlab-omr-v1` so the second run and offline runs need no network.
- Everything is downloaded only after the user presses the button that says how big the first
  download is (about 77 MB of models + ~45 MB of runtime) - never on page show, never on boot.
- The service worker must NOT precache any of it (sw ASSETS gets only js/omr/*.js + js/sheetlab.js);
  it may pass through to the network for models/omr/* (cache-first by our own cache).

### MusicXML -> MIDI (midi.js) and exports

- homr's generate_xml output is the MusicXML (title in work-title, tempo/metronome from options).
- MIDI must match what the SheetLab engine produces via music21 + mido polish: same note pitches,
  start times and durations (ticks scaled to a common PPQ), one track per part, tempo meta, track
  name = title, program change = GM program on each track. Transpose shifts sounding pitches by
  semitones (MusicXML: spelled transposition with the key signature moved; music21 deviations are
  OK if documented). Reference: `$OMR/sheetlab-ref/` (music21 output) and music21 in the venv.
- .musicxml / .xml (same bytes) and .mxl (zip: META-INF/container.xml + score.musicxml; deflate via
  CompressionStream when available, else stored).

### UI (js/sheetlab.js) - page 'sheetlab', pill "Scan" in the Play group (songs, jam, sheetlab)

- Pick a file (PDF, PNG, JPG, WEBP, BMP; TIFF where the browser decodes it), drop it, or take a photo
  (`capture="environment"` input on phones/tablets). Songs' "Open a score" card also accepts PDF and
  images and hands them to this page.
- Options (SheetLab's): tempo (default the shared met.bpm), GM instrument (SheetLab's list), transpose
  (-12..+12), split 2-page spreads (on), enhance low-res scans (on), PDF quality 300 dpi (200 = faster).
- Progress per page with plain words, a Stop button, elapsed time; the app stays usable meanwhile.
- Result: title, per-page summary (staffs / parts or why skipped), preview of the page with the found
  staffs outlined, counts (measures, notes, chords, length), actions: Play on synth
  (SLMidiHub.player.loadFile(name, midiBytes) + show), Practice (Woodshed importMidi + addScore),
  Open as tab (App.songs.fromMidi + load), Download .mid / .musicxml / .mxl, Save to library.
- Help tour entry, onRemote only if there is a natural Next (otherwise none), App.toast for errors.
- Licence: soundLAB becomes AGPL-3.0 (owner approved). LICENSE at the repo root, credits for homr
  (AGPL-3.0), OpenCV (Apache-2.0), ONNX Runtime (MIT), pdf.js (Apache-2.0) and the Mutopia fixtures
  (public domain) in docs/SHEETLAB.md and the About/Settings credits.

## Testing rules

- Every ported module ships with a Node parity suite `tests/omr-<area>.test.js` in the repo's test
  style (`ok(cond, msg)` printing PASS/FAIL lines, exit 1 on any FAIL) that feeds the Python fixture of
  the stage's INPUT into the JS port and compares with the fixture of its OUTPUT, for all 7 pages.
  Where a fixture is missing, generate it with the venv (extend `tools/omr/dump_stages.py`, don't
  hand-write expectations).
- Report exact-match rates; anything short of exact needs a written root cause (e.g. float32 noise
  at a threshold) and must not change downstream results on the 7 pages.
- Fixtures that go into the repo (tests/fixtures/omr/) stay small: 2-3 pages, PNG masks, JSON. The
  full 7-page set stays in $OMR and runs when SL_OMR_FIXTURES points to it.
- Model-dependent suites skip with a clear "SKIP (no models)" line when SL_OMR_MODELS is unset.
