# OMR port: systems -> TrOMR tokens -> voices (the reading stage)

Files (repo /home/user/GuitarPak): `js/omr/staff_dewarping.js`, `transformer_encoder_inference.js`,
`transformer_decoder_inference.js`, `transformer_staff2score.js`, `staff_parsing_tromr.js`,
`staff_parsing.js` (already in `OMR.FILES`, manifest order staff_regions -> staff_dewarping ->
transformer_encoder_inference -> transformer_decoder_inference -> transformer_staff2score ->
staff_parsing_tromr -> staff_parsing; runtime.js loads after them but is only used at call time).
Suite `tests/omr-read.test.js` (+ `tests/omr/rebuild.js`: dump JSON -> model objects). Reference dumps
`tools/omr/dump_read.py` (pages + synthetic) and `tools/omr/dump_read_delaunay.py` (Delaunay fuzz).

Run:
```
cd /home/user/GuitarPak
OMR=<your reference folder (tools/omr/README.md)>
# references (~6 min; ship = shipping int8 encoder+decoder, fp32enc = fp32 encoder + int8 decoder,
# fp16 = what dump_stages ran, asserted == 10-tokens.json / 11-score.musicxml; --ctx writes the
# encoder outputs 41-read-ctx-<mode>-NN.bin for the decoder-only check)
$OMR/venv/bin/python -I tools/omr/dump_read.py --models $OMR/shipmodels \
  --fp32-enc $OMR/models/encoder_pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31.onnx \
  --modes ship,fp32enc,fp16 --ctx $OMR/fixtures
$OMR/venv/bin/python -I tools/omr/dump_read.py --only-synthetic $OMR/fixtures       # 45 s
$OMR/venv/bin/python -I tools/omr/dump_read_delaunay.py $OMR/fixtures --n 700        # 5 s
$OMR/venv/bin/python -I tools/omr/dump_read_audit.py $OMR/fixtures                    # 5 s (audit edge cases)
# the suite: without SL_OMR_MODELS ~40 s (synthetic, prep, stub); with models ~15 min
SL_OMR_FIXTURES=$OMR/fixtures SL_OMR_MODELS=$OMR/shipmodels \
  NODE_PATH=$OMR/jsenv/node_modules:/opt/node22/lib/node_modules /opt/node22/bin/node tests/omr-read.test.js
# + SL_OMR_FP32_ENCODER=$OMR/models/encoder_..._509-....onnx  (fp32 encoder comparison, +~10 min)
# SL_OMR_READ_PAGES=belle-p1,no11-p1  limit pages;  SL_OMR_READ_SKIP=synthetic,audit,prep,stub,decoder,full
```

Result in one line: everything that is not a neural network is EXACT (staff images byte for byte, Delaunay
triangles in order, voices and MusicXML byte for byte from the same tokens); the transformer agrees with
Python onnxruntime on 39/42 staffs (2951/2954 tokens) with the shipping int8 encoder and 41/42 (2953/2954)
with the fp32 encoder - every divergence is a near tie of the model, and the MIDI stays byte-identical.

## Exports

`OMR.staff_dewarping` (sync)
- `DelaunayTriangulation(points)` -> `.points` ([[x, y]] float32 values), `.simplices` ([[i, j, k]], an
  empty list for collinear input), `findSimplex(points)` -> Int32Array (-1 = none), `_findPointIndex`,
  `_pointInTriangle`. Throws `ValueError('Need at least 3 points for triangulation')` like homr.
- `PiecewiseAffineTransform()`: `estimate(src, dst)`, `transformPoint([x, y])`,
  `inverseTransformPoint([x, y])`, `warpImage(image, fillColor = 1, order = 1)`,
  statics `_isDegenerateTriangle`, `_triangleArea`; fields `srcPoints, dstPoints, triangulation,
  affineMatrices` (nested 2x3 float64 or null).
- `StaffDewarping(tform | null)`: `dewarp(image, fillColor = 1, order = 1)`, `dewarpPoint(p)`,
  `undewarpPoint(p)`.
- `isPointOnImage(pt, image)`, `calculateSpanAndOptimalPoints(staff, image)` -> `[span, optimal]`,
  `calculateDewarpTransformation(image, source, destination)` (extends the line lists in place, like
  Python), `dewarpStaffImage(image, staff, index, debug)` (any exception -> `StaffDewarping(null)` +
  eprint, like homr).
- JS internals exported for tests: `_Subdiv2D` (OpenCV's Subdiv2D: `new _Subdiv2D([x, y, w, h])`,
  `insert([x, y])` -> vertex id, `getTriangleList()` -> `[[ax, ay, bx, by, cx, cy]]`), `_fma64`,
  `_applyMat`, `_isPointInTriangle`.
- Not ported (training only): `warp_image_randomly`, `warp_image_array_randomly(2)`.

`OMR.transformer_encoder_inference` (async)
- `Encoder.create(config, {session, ep = 'wasm', ort, onProgress, onRuntimeProgress})` ->
  `Promise<Encoder>`; `encoder.generate({data: Float32Array, dims: [1, 1, 256, 1280]})` ->
  `Promise<{data: Float32Array, dims: [1, 1280, 512]}>`. Without `session` it uses
  `OMR.runtime.session('encoder', {ep})` (re-asked on every generate, so a released session is
  recreated). `ep: 'auto'` = the runtime's choice. Eprints a warning if the runtime's encoder session
  is not on wasm.

`OMR.transformer_decoder_inference` (async)
- `getDecoder(config, {session, ort, onProgress, onRuntimeProgress})` -> `Promise<ScoreDecoder>`
  (always `OMR.runtime.session('decoder', {ep: 'wasm'})` unless a session is given).
- `ScoreDecoder(transformer, fp16, useGpu, config, ignoreIndex, ort, opts)`;
  `decoder.generate(startTokens [[1]], nonoteTokens [[0]], {context, onStep})` ->
  `Promise<EncodedSymbol[]>`. `onStep({step, arg: [rhythm, pitch, lift, articulation, slur,
  position], att: Float32Array(2), outputs})` is JS only (tests / diagnostics).
  `initCache(cacheLen = 0)` -> `[32 zero tensors [1, 8, len, 64], names in, names out]`.
- `detokenize(tokens, inverseVocab)`, `_lastArgmax(tensor)`.

`OMR.transformer_staff2score`
- `Staff2Score.create(config, {encoder: Encoder.create opts, decoder: getDecoder opts, onProgress,
  onRuntimeProgress})` -> `Promise<Staff2Score>`; `predict(image)` -> `Promise<EncodedSymbol[]>`
  (image = the 256 x 1280 uint8 canvas, an OMR.np image). JS extras after each predict:
  `lastEncoderSecs`, `lastDecoderSecs`, `lastSteps` (decoder runs incl. the EOS step).
- `ConvertToArray` / `_transform.transform(image)` (sync) -> `{data: Float32Array, dims}`: homr's
  `(img / 255 - 0.7931) / 0.1738` in float64 then float32 (a 256-entry LUT of exactly those doubles;
  verified: the encoder input's sha1 equals Python's float32 bytes on all 42 staffs).

`OMR.staff_parsing_tromr` (async)
- `parseStaffTromr(staff, staffImage, config)`, `predictBest(orgImage, staff, config)`: like
  Python's module global, ONE Staff2Score is created on first use (through OMR.runtime) and kept.
  JS only: `configure(opts)` = Staff2Score.create options for that creation (progress callbacks);
  `_setInference(x)` / `_getInference()` (inject a stand-in with `predict(image)`, or null to drop
  it; a failed creation is retried on the next call).

`OMR.staff_parsing`
- sync: `trOmrMaxHeight` (256), `trOmrMaxWidth` (1280), `getTrOmrCanvasSize(shape, mt, mb)` ->
  `[w, h]`, `_canvasYOffset`, `centerImageOnCanvas(image, [w, h], mt, mb)`, `addImageIntoTrOmrCanvas`,
  `removeBlackContoursAtEdgesOfImage(gray, unitSize)` (mutates `gray`, returns it),
  `_calculateRegion`, `prepareStaffImage(debug, index, staff, pageImage, regions)` ->
  `[canvas, transformedStaff, toPage]`, `_dewarpStaff`, `_getSymbolCenter`, `_slotsInLayout(row,
  layout)` (arrays of booleans -> slots | null), `_assignParts(multiStaffs)`, `_measureRestsLike`,
  `_cleanUpVoice`, `_combinations`.
- async: `parseStaffImage(debug, index, staff, image, regions, config, pageToInputImage)`,
  `parseStaffs(debug, multiStaffs, image, config, selectedStaff = -1, pageToInputImage = identity,
  {onProgress(staffIndex, staffCount), signal})` -> `Promise<EncodedSymbol[][]>` (one list per voice).
  `onProgress` is called before each staff the transformer reads (`staffIndex` = how many are done)
  and once more at the end (`staffCount, staffCount`); `signal` (AbortSignal) is checked before each
  staff and throws its reason / an AbortError.

## How the engine calls it (main.py's order)

```js
// after detect_staffs_in_image + repair_systems (multiStaffs, image = predictions.preprocessed)
OMR.runtime.configure({ base, ep: 'wasm' });   // BEFORE any session exists (see gotcha 1)
OMR.staff_parsing_tromr.configure({ onProgress: modelBytesProgress });          // optional
const voices = await OMR.staff_parsing.parseStaffs(debug, multiStaffs, image, OMR.transformer_configs.defaultConfig,
  -1, toInputImage /* main.py: chain(undo_resize, undo_crop) */, { onProgress: (i, n) => post(...), signal });
const root = OMR.music_xml_generator.generateXml(new OMR.music_xml_generator.XmlGeneratorArguments(false, tempo, tempo), voices, title);
```
`image` is the CLAHE'd gray page (`predictions.preprocessed`, uint8 1920 wide) - 03-clahe.png in the
fixtures. `pageToInputImage` maps page coordinates back to the user's image (only used for the imgpos
comments).

## Gotchas

1. **Execution provider.** Configure `OMR.runtime` with `{ep: 'wasm'}` before `prepare()` / the first
   session: the runtime keeps ONE session per model whatever ep it was made with, so a session that
   `prepare()` created on WebGPU stays WebGPU even though `Encoder.create` asks for 'wasm' (it then
   eprints a warning). The decoder is always wasm.
2. **Subdiv2D** (not in opencv.js) is a line-by-line port of OpenCV 5.0.0
   geometry/src/subdivision2d.cpp (quad-edge Delaunay, double predicates on float32 points,
   FLT_EPSILON tests, the free lists, getTriangleList's edge mask + Rect2f.contains). homr DOES depend
   on the order: `warp_image` paints the triangles in list order (shared edges keep the last
   triangle's pixels) and `inverse_transform_point` / `find_simplex` take the first triangle that
   contains the point. The port gives the identical list in identical order (raw lists compared on 42
   real dewarp grids, 20 synthetic sets incl. cocircular lattices / duplicates / collinear, and 700
   fuzz sets with 39666 triangles). subdivision2d.cpp is compiled with the SSE baseline (no FMA
   contraction), so plain double arithmetic matches.
3. **numpy matmul = OpenBLAS dgemv.** `mat @ np.array([x, y, 1.0], dtype=np.float32)` (2x3 float64
   matrix) evaluates each row as `fma(m0, x, m1*y) + m2` on the reference machine (OpenBLAS 0.3.31
   Haswell kernel): 20000/20000 random cases; the plain sum differs in ~25 % of them by an ulp.
   `_applyMat` reproduces it with an exact BigInt fma. Only `transform_point` (debug drawing) and
   `inverse_transform_point` (image_coordinates -> imgpos comments) use it.
4. **Point types in `_is_point_in_triangle`**: the point reaching `undewarp_point` is np.float64 (the
   chain adds np.int64 crop offsets), so `point[1] - a[1]` is float64 while `b[0] - a[0]` is a float32
   difference; ported that way.
5. **The point of `inverse_transform_point` is cast to float32** before the matmul
   (`np.array([...], dtype=np.float32)`) - `_applyMat` does `Math.fround` on x and y.
6. **float32 everywhere numpy has float32**: `_find_point_index` (np.linalg.norm in float32),
   `_point_in_triangle` (float32 arithmetic, `1e-10` thresholds compared as float32 under NEP 50),
   `_is_degenerate_triangle`.
7. **`if not first_y_offset`**: 0.0 resets it (Python falsy), NaN does not; `int(nan)` inside raises,
   which dewarp_staff_image catches -> no dewarping (a synthetic case covers it).
8. **Views vs copies**: homr crops with numpy views and `remove_black_contours_at_edges_of_image`
   writes `255` into the view (the dewarped image); JS crops are copies, written in place - the canvas is
   the same (checked byte for byte).
9. **Decoder**: the rhythm vocabulary spells its specials `PAD`/`BOS`/`EOS` without brackets, so
   homr's detokenize filter (`[BOS]` ...) never drops anything; EOS is detected on the id (2) before the
   symbol is built. Context on step 0 = the full `[1, 1280, 512]`, afterwards `context[:, :1]` (the
   first 512 floats); `cache_len = step` as int64 `[1]`; the 32 cache outputs feed the next step by
   name. Only the LAST token of each branch is ever fed back, so the JS keeps scalars instead of the
   growing arrays.
10. **Attention coordinates** (`EncodedSymbol.coordinates`, a Float32Array of 2) only feed
    `image_coordinates`, which only feed the `<!-- imgpos: x, y -->` comments of the MusicXML. They
    carry the model's float noise (see Parity), so imgpos comments may differ by a pixel or a few from
    homr's; nothing musical depends on them.
11. **cv2.warpAffine INTER_NEAREST** (only `warp_image(order=0)`, never used by homr's inference)
    goes through opencv.js in OMR.cv2 and differs from cv2 on x86 in ~3e-5 of the pixels; order 1 (the
    pipeline) uses OMR.cv2's exact INTER_LINEAR port.
12. `selected_staff` / hidden-staff layouts (`_assign_parts`, `_measure_rests_like`) and
    `break_apart` for ambiguous layouts are covered by the stub-transformer cases of
    40-read-synthetic.json (the 7 pages all have uniform systems).

## Parity (7 pages, 42 staffs; last full run: `OK 158 passed, 0 failed`, 17.8 min incl. fp32)

Exact (no tolerance), all 7 pages:
- rebuild of 08-repaired's systems from 40-read-staffs.json (min/max x/y, unit sizes identical);
  03-clahe.png is the image parse_staffs reads.
- prepare_staff_image, every step of all 42 staffs (882 steps): region, canvas size, page resize, both
  crops, the transformed staff, span / optimal points, src / dst points, Subdiv2D rect + insert ids +
  raw triangle LIST IN ORDER, simplices, affine matrices, dewarped image, black contours, canvas;
  staff_to_page on 336 sample points (incl. the OpenBLAS fma matmul). Transformer input ==
  09-staff-NN.png byte for byte: 42/42.
- ConvertToArray: the encoder input's float32 bytes == Python's (sha1) on 42/42 staffs.
- parse_staffs with Python's own tokens + attention (stub Staff2Score): voices (strings AND
  image_coordinates as doubles) and the MusicXML byte for byte, for the ship run AND the fp16 run (=
  10-tokens.json / 11-score.musicxml, which 40-read-fp16.json reproduces), all 7 pages; onProgress.
- synthetic (40-read-synthetic.json): 20 Delaunay sets (random / lattices / duplicates / collinear /
  float / negative / too few -> ValueError), 700 fuzz sets (40-read-delaunay-fuzz.json: 39666 triangles,
  8400 inverse_transform_point probes), PiecewiseAffineTransform matrices / find_simplex /
  transform_point / inverse_transform_point, warp_image order 1 (1 and 3 channels, fill 1 / 255), 7
  dewarp_staff_image cases (incl. no span points, staff off the image, first offset 0.0, a NaN line),
  64 canvas cases, 12 black-contour pictures, 1408 _slots_in_layout + 160 _assign_parts layouts, 108
  _measure_rests_like sequences, 11 parse_staffs cases with a stub transformer (hidden voices, two
  layouts -> break_apart, ambiguous, selected_staff, empty staffs, grand staffs, a page_to_input mapping).
- no opencv.js object leaks (390611 made / deleted in the full run).
- staff_parsing_tromr's own path (Staff2Score created once through OMR.runtime): tokens == Python.

The transformer (onnxruntime-web 1.31.1 'wasm' in Node vs Python onnxruntime 1.31 CPU, same models):

| | int8 encoder (shipping) | fp32 encoder |
|---|---|---|
| download | 15.4 MB | 52.9 MB (+37.5 MB) |
| encoder output vs Python's | max abs diff 0.47, mean 0.040, 0 % bit-equal | max 6.2e-6, mean 2.9e-7, 9 % bit-equal |
| staffs token-identical to Python (same models) | 39/42 | 41/42 |
| tokens (edit distance) | 2951/2954 = 99.90 % (3 edits) | 2953/2954 = 99.97 % (1 edit) |
| vs 10-tokens.json (dump_stages, fp16 models) | 38/42 staffs, 2950/2954 tokens | 42/42, 2954/2954 |
| pages with identical voices | 4/7 | 6/7 |
| divergences (Python's top-2 logit margin there) | ElCapitan #3 t84 position lower2/lower (0.296); bwv797 #3 t39 slur (0.171); no11 #1 t23 an extra `dynamic_f` (rhythm, 0.287) | brahms #2 t68 position upper/upper2 (0.061) |
| MIDI (OMR.midi, tempo 112) of the diverged pages | byte-identical on all 3 | byte-identical |
| MusicXML apart from imgpos comments | ElCapitan identical; bwv797 loses a slur; no11 gains an `f` marking | identical |
| image_coordinates vs Python (page px; identical-token pages) | median 1.6, p95 5.8, max 44; 890/1035 imgpos comments differ | median 0.07, p95 0.4, max 9.5; 191/1694 differ |
| encoder time per staff (Node, 1 thread, loaded 4-core Xeon 2.1 GHz) | 1.9-2.0 s | 3.2-3.9 s |
| decoder time per token | 63-100 ms (70 ms median run; same decoder in both) | same |

Root cause, verified step by step:
1. The decoder port is exact: fed with Python's encoder output (41-read-ctx-ship-NN.bin) the JS decoder
   gives Python's tokens on 42/42 staffs and every head's argmax at all 2996 steps (smallest Python
   margin 0.171); also on the fp32enc context of the one fp32 divergence. On identical inputs a single
   step differs from Python only by ~1e-6 in the logits (step probe, incl. Python's own cache fed back);
   through the KV cache that grows to top-2 margin differences <= 0.22 and attention <= 7.6 canvas px
   (median 0.04 px).
2. The int8 encoder is numerically chaotic at the 4 % level in ANY runtime change: Python onnxruntime on
   the same CPU with ORT_ENABLE_BASIC instead of ALL already differs by max 0.27 / mean 0.036 from its own
   default (DynamicQuantizeLinear turns float noise into whole quantisation steps); WASM vs CPU is 0.040.
   No graph optimization level in onnxruntime-web brings it closer (disabled/basic 0.043, extended/all
   0.042). Not fixable in the port.
3. Every divergence starts at a near tie (Python top-2 margin 0.061-0.296; the suite FAILs a divergence
   at a margin >= 1.0). Python's own model variants disagree at such ties too (fp16 vs int8 differ on
   brahms #2).
4. image_coordinates come only from the decoder's attention and only feed the `<!-- imgpos -->`
   comments; nothing musical depends on them.

=> For the owner: int8 keeps the 15 MB download, costs ~0.1 % tokens at model near-ties (none changed a
MIDI file on the 7 pages; 2 notation details in the MusicXML) and ~1.6 px median imgpos noise. fp32
costs +37.5 MB and ~1.6x encoder time, matches Python to 0.03 % (one 0.061-margin coin flip) and imgpos
to ~0.1 px. The fp32 decoder check was not needed (no divergence traces to the decoder; an fp32 decoder
would be ~188 MB). The shipping model set was not changed.

Gate in the suite: tokens identical OR the first divergence of a staff is a near tie (< 1.0); voices
exact and MusicXML equal apart from imgpos comments on pages with identical tokens; the stub / prep /
synthetic sections are exact. Python's references: 40-read-ship.json (int8), 40-read-fp32enc.json.

## Audit (adversarial review, 2026-10-28)

Read side by side with the Python, function by function; every suspicion was probed with the same
input through the venv's homr and the JS in Node. Regression set: `tools/omr/dump_read_audit.py` writes
`$OMR/fixtures/40-read-audit.json`; `tests/omr-read.test.js` section `audit` (no models, ~2 s) compares.
Each of its four groups failed on the code before the fixes (checked by loading the pre-fix files).
After the fixes: `OK 136 passed, 0 failed` with the shipping models (no fp32 comparison; the transformer
results are unchanged: 39/42 staffs, 2951/2954 tokens, the same 3 near-tie edits), every other omr-* suite green.

Fixed:
- **prepare_staff_image, debug on**: Python rebinds `top_left` to the SECOND crop's corner
  (`staff_image, top_left = crop_image_and_return_new_top(staff_image, *region_step2)`) and the debug
  drawing (`_dewarp_staff(staff, dewarp, top_left, 1)`) uses it; the JS kept the first crop's corner
  / scaling factor, so every `_staff-N_debug_annotated.jpg` differed (symbol marks off the canvas).
  No effect on the canvas, tokens or voices; the worker's Debug writes nothing, but Debug is the hook
  for the page preview and a developer run with debug on must see what homr sees.
- **remove_black_contours_at_edges_of_image on an empty image**: `cv2.threshold` returns `(97.0,
  None)` for an empty array, so homr raises `TypeError: unsupported operand type(s) for -: 'int' and
  'NoneType'`; OMR.cv2.threshold returns an empty image and the JS went on (then a different
  cv2.error from the canvas resize). Now raises homr's TypeError (the SheetLab engine shows str(exc)
  as the page's skip reason). Only reachable with a staff region outside the page.
- **ConvertToArray on a float32 image**: numpy divides a float32 array by the Python int 255 in
  float32 (NEP 50) before the float64 mean / std; the JS divided in float64 (1 ulp in the encoder
  input). homr's canvas is uint8 (LUT path, unchanged), so only direct callers saw it.

Probed and refuted (identical to homr): prepare_staff_image for staffs at the top / bottom page edge,
beyond the left / right edge, entirely below the page, tiny unit sizes, a grand staff (10 lines), a
steep (~7 degrees) and a strongly curved staff, a sparse grid (get_at misses), a short fragment, and
overlapping staffs whose squeezed region raises cv2.error (same type and text); staff_to_page on all of
them; parse_staffs with debug on (the `_output` images: circles + labels at the attention points, a
hidden staff, a grand staff); the canvas helpers on 0-row / 0-column / 1-pixel images (ZeroDivisionError,
cv2.error texts); parse_staffs leaves the caller's staffs and page image unchanged (numpy views vs JS
copies); the Python types reaching staff_parsing on all 7 pages are float64 / int (no float32
arithmetic hidden in `_calculate_region` or the transforms); numpy compares float32 scalars with Python
floats in float32 (`np.float32(1e-6) < 1e-6` is False), as `_is_degenerate_triangle` /
`_point_in_triangle` assume; `np.argmax` of a NaN row; no opencv.js Mat survives the exception paths
(resize / threshold / getAffineTransform raising inside the stage).

Remaining (documented, not changed):
- Subdiv2D's own errors (point outside the rect, PTLOC_ERROR) carry short JS texts instead of cv2's
  `subdivision2d.cpp:298 ... (-211:...)`; they are only ever caught by dewarp_staff_image and printed
  (no dewarping, like homr), and cannot occur for homr's grids (the rect is the points' bounding box
  plus 10 px).
- `find_simplex([])`: numpy's atleast_2d gives a (1, 0) array and the unpack raises ValueError; the JS
  answers [-1]. homr only calls it with one point.
- OMR.cv2.threshold on an empty image returns an empty image where cv2 returns None (foundation;
  worked around here).
- The AbortSignal of parseStaffs is checked between staffs only; one dense staff can decode for ~40 s
  (600 tokens x 70 ms) before a cancel takes effect, so the worker's cancel should terminate the worker
  if it must be immediate. (Two decoder.generate calls on the one wasm session at the same time both
  finish with the sequential tokens: probed; onnxruntime-web serialises the runs.)
