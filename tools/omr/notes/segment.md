# OMR port: page image -> segmentation masks

Files (repo /home/user/GuitarPak): `js/omr/autocrop.js resize.js color_adjust.js inference_segnet.js
noise_filtering.js` (already in `js/omr/manifest.js`, in that order, after the language modules);
suite `tests/omr-segment.test.js`; reference dump `tools/omr/dump_segment.py`.

Run:
```
cd /home/user/GuitarPak
OMR=<your reference folder (tools/omr/README.md)>
SL_OMR_FIXTURES=$OMR/fixtures SL_OMR_MODELS=$OMR/shipmodels \
  NODE_PATH=$OMR/jsenv/node_modules:/opt/node22/lib/node_modules /opt/node22/bin/node tests/omr-segment.test.js
# (re)generate the references (pages ~70 s with --seg; --only tiling needs no model):
$OMR/venv/bin/python -I tools/omr/dump_segment.py $OMR/fixtures --prep $OMR/sheetlab-prep \
  --seg $OMR/shipmodels/segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f.onnx
```
Without SL_OMR_MODELS the segnet checks print SKIP and everything else runs (~35 s). The models come
through OMR.runtime: the repo's `models/omr/` parts when `tools/omr/split_models.py` made them, else the
suite serves a one-part-per-model manifest straight from SL_OMR_MODELS.

## Status (7 pages + synthetic cases): everything exact, 233 checks (after the audit below; 202 without models)

| stage | result |
|---|---|
| autocrop_with_offset | 7/7 pages == 01-crop.json (all (0,0): homr returns the input itself; JS returns the same object) + 14 synthetic photos byte-exact incl. 6 real crops (desk, rotated sheet, paper to the image edge, a shadow strip kept as paper, textured desk, blue desk) and the full-page/tiny-paper/blank/dark early returns. SheetLab's photo (`sheetlab-prep/photo/02-prep-0.png`) is NOT cropped by homr either (its dominant blue value is the desk's, the threshold makes everything paper) |
| resize_image | 02-resized.png byte-exact on 7 pages + all synthetic (down, up from 695 px wide, width already 1920) |
| apply_clahe | 03-clahe.png byte-exact on 7 pages + all synthetic |
| segnet (int8, WASM, batch 8) | **04-mask-*.png 100.0000 % on all 5 masks x 7 pages** (0 pixels differ); also after `OMR.runtime.release('segnet')` between pages |
| inference() tiling | 10 stand-in-model cases exact (tile order, partial and never-full batches, tiles beyond the image, argmax ties, averaging merge of overlapping steps), step 0 raises like range() |
| filter_predictions | noise grid exact on 7 pages + 6 noisy cases (incl. uint8 wrap of the grid, > 50 % noisy, isolated cell, edge cells); mask and all 7 output arrays byte-exact; 30-filtered-staff-pre.png exact |
| + make_lines_stronger | 05-filtered-*.png exact (from the 04 masks AND from the JS segnet masks) |

No page triggers the noise filter (max grid value 23 < 50), hence the synthetic noisy cases.

## Exports

```
OMR.autocrop.autocropWithOffset(img) -> [img | crop, [x, y]]      img: BGR uint8 OMR.np image
OMR.autocrop.autocrop(img) -> image
OMR.resize.calcTargetImageSize(w, h) -> [1920, round(h * 1920 / w)]
OMR.resize.resizeImage(img) -> image (the same object when already 1920 wide)
OMR.color_adjust.applyClahe(bgr) -> gray uint8 (cvtColor + CLAHE clip 1.0, 8x8)
OMR.segmentation_config = {modelName, segnetPathOnnx, segnetPathOnnxFp16, segnetVersion, segmentationVersion}
OMR.inference_segnet:
  Segnet.create(useGpuInference, {onProgress, onRuntimeProgress}) -> Promise<Segnet>; segnet.run({data, dims}) -> Promise<{data, dims}>
  ExtractResult(filename, original, staff, symbols, stemsRests, notehead, clefsKeys)
  extractPatch(img, y, x, win[, out, offset]) -> CHW {c, h, w, data: Float32Array}
  mergePatches(patches, [h, w], win, step) -> {h, w, c: 1, data} (patches' typed array, Uint8Array here)
  inference(gray, {useGpuInference, batchSize, stepSize, winSize, onProgress, signal, onModelProgress})
      -> Promise<[staff, symbols, stemsRests, notehead, clefsKeys]>   (0/1 uint8 images)
  extract(gray, imgPath, {useCache, useGpuInference = true, batchSize = 8, stepSize = -1, winSize = 320,
          onProgress, signal, onModelProgress}) -> Promise<ExtractResult>
  _reset(), _inject(fakeSegnet)   tests only
OMR.noise_filtering.filterPredictions(predictions, debug) -> InputPredictions (the same object when nothing is filtered)
  (+ estimateNoise, createNoiseGrid, createGrid, applyNoiseFilter, getNeighbors, handleFilterResults)
```

### main.py's two call sites, as JS (the engine/main port owns them; the suite mirrors get_predictions)

```js
// homr: main.py:85 get_predictions  (async: it runs the segnet)
async function getPredictions(original, preprocessed, imgPath, enableCache, segnetUseGpu, extra) {
  const result = await OMR.inference_segnet.extract(preprocessed, imgPath,
    Object.assign({ stepSize: 320, useCache: enableCache, useGpuInference: segnetUseGpu }, extra)); // extra: {onProgress, signal}
  const originalImage = OMR.cv2.resize(original, [result.staff.w, result.staff.h]);
  const preprocessedImage = OMR.cv2.resize(preprocessed, [result.staff.w, result.staff.h]);
  return new OMR.model.InputPredictions(originalImage, preprocessedImage, result.notehead, result.symbols,
    result.staff, result.clefsKeys, result.stemsRests);
}
// homr: main.py:116 load_and_preprocess_predictions (image = the decoded page, BGR uint8; no cv2.imread)
const [cropped, cropTopLeft] = OMR.autocrop.autocropWithOffset(image);
const croppedShape = OMR.np.shape(cropped);
const resized = OMR.resize.resizeImage(cropped);
const preprocessed = OMR.color_adjust.applyClahe(resized);
let predictions = await getPredictions(resized, preprocessed, imagePath, false, false, {onProgress, signal});
const toInputImage = OMR.point_mapping.chain(OMR.point_mapping.undoResize(croppedShape, OMR.np.shape(predictions.preprocessed)),
  OMR.point_mapping.undoCrop(cropTopLeft[0], cropTopLeft[1]));
const debug = new OMR.debug.Debug(predictions.original, imagePath, false);
predictions = OMR.noise_filtering.filterPredictions(predictions, debug);
predictions.staff = OMR.staff_detection.makeLinesStronger(predictions.staff, [1, 2]);
```
Mask attribute names: ExtractResult has `stemsRests` (Python `stems_rests`), InputPredictions has
`stemsRest` (Python `stems_rest`) - homr's own inconsistency, kept.

## Async boundaries

Only the ONNX path is async: `Segnet.create`, `Segnet.run`, `inference`, `extract` (and so main's
get_predictions / load_and_preprocess_predictions / detect_staffs_in_image). autocrop, resize, CLAHE,
extractPatch, mergePatches and the whole noise filter are synchronous. opencv.js must be loaded
(OMR.setCv) before any of them; the segnet needs `OMR.runtime.configure({ep: 'wasm', ...})`.

## Gotchas

1. **Batch size 8 is required for parity.** The int8 segnet quantizes activations with
   DynamicQuantizeLinear (28 of them), whose scale/zero point come from the min/max of the WHOLE batch
   tensor, so a tile's labels depend on its batchmates. homr's default batch_size=8 (row-major tile order,
   a partial last batch) reproduces Python bit for bit; any other size changes ~2,000 mask pixels per page
   (belle-p1, vs 04: batch 1: staff 1323 symbols 43 stems 296 notehead 223 clefs 80 px; batch 4: 1238 / 40 /
   301 / 230 / 63; batch 16: 1295 / 49 / 295 / 227 / 74). Python with batch 1 or 4 differs from its own
   batch-8 masks by the same amounts, so this is the model, not the port. Keep `batchSize` 8 (extract's
   default); the suite can be run with SL_OMR_BATCH=n to see the effect.
2. **Batch size cost (Node 22, onnxruntime-web 1.31.1 WASM, 1 thread, belle-p1, 48 tiles):** speed is
   the same for every size (~470 ms/tile, ~22.5 s/page: the CPU kernels dominate); the ORT wasm heap
   (WebAssembly.Memory, never shrinks) is 47 MiB after the session, then after the run: batch 1 = 82 MiB,
   2 = 98, 4 = 160, **8 = 246 MiB**, 16 ~ 420 (process peak RSS ~620 / 580 / 715 / 745 / 1030 MB incl.
   opencv.js' 128 MiB heap, the page images and V8). 246 MiB is fine for an iPad worker; the heap is shared
   with the encoder/decoder sessions (one ORT wasm instance), so the run's high-water mark is the max of the
   stages, not the sum. Session creation 0.4-1 s.
3. The per-tile output is 6 x 320 x 320 float32 (2.4 MB): argmax happens per batch, only the Uint8 class
   maps (100 KB per tile) are kept; Python keeps int64 maps. Python transposes the whole page to (3, h, w)
   float32 (57 MB); here patches are read straight from the GRAY2BGR uint8 page (same values).
4. `extract`'s `.npy` disk cache is not ported (no disk): `useCache` is accepted and ignored. The Segnet is
   kept per worker like Python's module global; it re-asks OMR.runtime for the session on every run, so
   `OMR.runtime.release('segnet')` between pages is safe (verified in the suite).
5. `useGpuInference: false` (what homr's main passes: `segnet_use_gpu`) forces WASM; `true` lets the
   runtime's configured EP decide. The worker must configure `ep: 'wasm'` (WebGPU has no int8 kernels and
   changes numerics, see runtime-midi.md); then both values give WASM.
6. Progress / cancel: `onProgress(done, total)` in tiles, called with (0, total) first and after every
   batch (every 8 tiles = ~3.7 s here). `signal` (AbortSignal) is checked before each batch and throws its
   reason (or an Error named 'AbortError'). A batch in flight cannot be interrupted (session.run blocks
   the worker for its duration).
7. Noise filter: Python draws the grid + values onto a debug copy of the page on every call (420 cells x
   rectangle + putText); through opencv.js each putText would copy the whole page into a cv.Mat, so the
   drawing only happens when `debug.debug` is true (it never changes the result, and Debug.writeImage is a
   no-op in the browser). The grid stores `noise` (a float) into uint8: numpy's unsafe cast truncates and
   wraps (600.7 -> 88), reproduced with `Math.trunc(v) & 255`.
8. autocrop numerics: `_chromaticity` is float32 (`(v + 1) / sum` with float32 sums), `np.median` of
   float32 gives float32 (mean of the two middle values), and the 0.07 limit is compared AS float32
   (NumPy 2's weak Python scalars: `np.float32(0.07) <= 0.07` is True). `paper_color` / `smooth.mean`
   are float64; `paper_color.astype(np.uint8)` truncates. The paper sample is every 10th thresholded
   pixel in row-major order. Medians use typed-array sorts (photos can have ~1M paper pixels).
9. Timings in Node (ms, single thread) per page: autocrop 400-750, resize (Pillow port) 470-750, CLAHE
   ~60, segnet ~22,000-24,000, filter_predictions ~90, make_lines_stronger 25-55. Python (4 ORT threads):
   autocrop 340-830, resize ~140, CLAHE ~10, segnet 4,500-12,900, filter ~30.
10. Synthetic fixture files live as top-level FILES in `$OMR/fixtures` (`30-seg-*`, `31-noise-*`,
    `32-segnet-synthetic.json`), never as directories: the other suites take every directory for a page.

## Audit (adversarial review, 2026-10-28): what changed, what callers can rely on

Every item was reproduced with the same input through the venv Python and the JS, fixed, and is
now a check in `tests/omr-segment.test.js` against `34-seg-edges.json` (written by
`tools/omr/dump_segment.py --only edges`; 94 cases). The pre-audit code fails 44 of them and never
returns from 5 more (the tile loop runs until the heap is exhausted).

- **`inference()` / `extract()` arguments behave like homr's by Python type.** A `null` step
  used to hang the worker (`yLoop += null` never advances, out of memory); `false` or a negative
  window (step -1 -> win // 2 < 0) did the same. A fractional step or window ran with
  fractional tile coordinates, a fractional / bool / string batch size broke the batch buffer
  (tensor size mismatch). Now: `step_size < 0` raises TypeError for None/str BEFORE the Segnet is
  made (as in Python), `win // 2` for None/str too; after the Segnet and cvtColor, max()/range()/
  np.full raise TypeError for a float or None window or a float step, ValueError for a zero step
  or a negative window, a negative step gives no tiles (IndexError in merge_patches); a batch
  size that is not a whole number >= 1 runs every tile in ONE batch, `true` = batches of 1.
  `undefined` still means "omitted" (extract's defaults). JS cannot tell 32.0 from 32: integral
  floats are accepted where Python would raise.
- **`mergePatches`** raises like Python: TypeError / ValueError for the step (range), IndexError
  for too few or no patches; a negative step merges nothing (zeros).
- **`resizeImage`** of an image 0 px wide raises ZeroDivisionError (was OverflowError/ValueError).
- **`createNoiseGrid` / `createGrid` / `applyNoiseFilter` / `estimateNoise`** refuse a non-2-D
  input with Python's ValueError (`h, w = gray.shape`), and `createNoiseGrid` always runs the
  GRAY2BGR cvtColor Python makes for its debug picture (~20 ms a page, 14 MB transient): it is
  what raises cv2.error for an empty or float64 mask. Drawing still only happens when debugging.
- **`autocropWithOffset` on a 4-channel (BGRA) page** raises Python's ValueError ("cannot
  reshape array of size N into shape (3)" or "operands could not be broadcast together with
  shapes (3,) (4,) ") whenever homr would crop; it used to read the pixels with a stride of 3 and
  return a corrupted crop. Pages homr does not crop come back unchanged (BGRA) as in Python.
  `_chromaticity(pixels, ch)` / `_medianAxis0(flat, ch)` take a channel count (default 3).
  **The engine must hand autocrop a 3-channel BGR page** (what cv2.imread gives homr): canvas
  ImageData is RGBA; convert (and composite or drop alpha deliberately) before calling.

Refuted on probing (no change): the float32 chromaticity / median / distance arithmetic
(4000 random paper decisions near the 0.07 limit: medians, distances and decisions bit-exact;
no pixel colour lands exactly on f32(0.07), where a float64 compare would differ), 150 random
_remove_surroundings crops, 60 random rotated/shaded small photos through autocrop_with_offset
(23 cropped) and 80 random noise masks of random sizes (11 filtered): all byte-exact (scratch
sweep, `audit-seg/sweep.py` + `sweep.js`). Concurrent inference() calls (two pages at once) do
not mix batches (each call has its own buffer; ORT's wasm run is synchronous). cv2.blur's float
scale vs opencv.js scalar path cannot differ for a 7x7 box (no s/49 is within float error of .5).

Deliberate (kept): `filterPredictions(preds)` without a Debug runs (Python raises
AttributeError on `debug.debug`); `extract()` accepts a null image path (Python's Path(None)
raises): the browser has no file path. `useCache` is ignored.
