# Staff-region detection

`js/omr/staff-detection.js` locates **five-line staff geometry** in raster pixels. It does not recognize notes, clefs, parts, time signatures or musical rhythm. A high geometry score is not recognition accuracy or permission to grade an exercise. Recognized targets remain unverified drafts under the separate recognition/review workflow.

The module is dependency-free UMD: `SLStaffDetection` in a browser/worker, or `require('./js/omr/staff-detection.js')` in Node. It uses no DOM, network, storage, filenames or notation metadata.

```js
const geometry = SLStaffDetection.detectStaffRegions({
  data: pixels, width, height,
  channels: 4                // 1 for grayscale; omitted infers 1 or 4
});
for (const region of geometry.regions) {
  const crop = SLStaffDetection.cropStaff({data: pixels, width, height}, region);
  // crop.data is straightened grayscale Uint8Array (white=255).
  // Normalize using the model's own normalizer, its actual target spacing/height,
  // crop.lineSpacing and crop.staffOffset. Do not infer musical timing here.
}
```

Grayscale/RGBA byte arrays and normalized 0…1 float arrays are supported. Transparent RGBA pixels are composited on white. Invalid dimensions, truncated buffers, NaN/out-of-range pixels and excessive resources fail explicitly. Source pixels are never modified.

## Geometry and coordinates

`detectStaffRegions` (alias `detect`) returns:

- `regions`: usable geometric candidates, visually ordered top-to-bottom then left-to-right.
- `rejectedRegions`: scored diagnostic candidates that need a different crop or manual review.
- `warnings`, optional `skew`, and bounded-resource/timing `stats`.

Each region has `bbox: {x,y,width,height}` in the **original raster**, five `lineYs`, `spacing`, `lineCoverage`, a heuristic `confidence`, `warnings`, `sourceSize`, `readingOrder`, `geometryOnly:true`, `clef:null` and `system:null`. Visual order does not establish a song's voice order, part alignment or simultaneous timing. Separate columns are kept separate. User selection/review must establish the intended staff and part order.

A mild detected skew up to one degree can be rectified with an explicit vertical shear. Such a region also includes `transform`, `workingBox` and `lineSegments`. `lineYs` are the rectified horizontal anchors, equivalent to original coordinates at the page's center X. `lineSegments` show the slanted anchors on the original. `bbox` still encloses the original source pixels.

For a transform with `slope` and `centerX`, the inverse map is:

```
xOriginal = xRectified
yOriginal = yRectified + slope * (xRectified - centerX)
```

**Always call `cropStaff` for detected regions.** Cropping the raw original `bbox` directly loses rectification. The helper returns `{data,width,height,channels:1,sourceBox,sourceTransform,staffOffset,lineSpacing}`. `staffOffset` locates the top line in the returned crop. Its source box/transform allow the recognizer to map evidence back onto the original image. Region dimensions and the shear's finite bounds are validated before cropping.

## Quality gates

Horizontal run/projection candidates must form five regularly spaced lines with strong support across a shared horizontal extent. Local beams are separated from full-width staff peaks. Ledger/clef context is included without crossing neighboring staves. Six-line, long continuous line grids and staff boundaries with competing regular continuations remain ambiguous. Dense neighbors with insufficient crop margins, source-clipped context, faint/broken lines and very low-resolution spacing are declined rather than supplied to a model as reliable crops.

Larger detected rotations are declined with a rotation warning. This is not a general camera-perspective, page-curvature or handwriting rectifier. A five-line ruled table or blank music paper can share staff geometry; no note claim follows from its detection. Confidence is a deterministic geometric quality score, not a calibrated probability.

Limits: 12 million source pixels, 8,192 pixels per dimension, 1,024 horizontal line bands, 128 accepted/diagnostic regions, and a finite candidate/pixel-work budget. Failures instruct the caller to crop or downscale a copy while retaining the original. Run large-page processing in a worker; the module also works there without DOM APIs.

## Provenance and evaluation

The design was informed by the horizontal-run, staff-spacing and crop-anchor conventions in `satb-line-omr` commit `c60823117a5c92b0c29f921dbca023e94026d279`, `omr-preprocess.js`. The detector adds independent candidate grouping, shared-column validation, explicit geometry scores, bounded resources, ambiguity gates and reversible mild-skew geometry. The model's normalization remains in the pinned upstream implementation; this module does not replace its trained input conventions. The upstream MIT notice is retained in [vendor/omr/satb-line-omr/LICENSE](../vendor/omr/satb-line-omr/LICENSE).

Run:

```sh
node tests/omr-staff-detection.test.js
```

The focused suite checks geometry, multiple systems/columns, beam interference, blank/noise/dark images, six-line and dense ambiguity, source clipping, mild/larger rotation, byte/float/RGBA input, crop bounds/transforms, metadata independence and worker-global export.

Cloud evaluation artifacts are in `/workspace/soundlab-evidence/omr-lab/staff-detection/`. Inference read only the 40 image cases from `corpus/images-only.json` and their raw pixel planes. **After inference**, a separate scorer extracted staff paths from the authored renderer's SVG into `geometry-truth-evaluation-only.json`; this sidecar was never an input to the detector. It matched 48 of 48 staff regions across 40 cases, with a maximum staff-line anchor error of about 0.542 source pixels. These are 20 authored engraved compositions and their related synthetic degraded variants, including 1,800-pixel multi-system pages. They are not 40 independent musical samples, real scanner/camera tests, or a note-recognition accuracy estimate. A real browser Web Worker separately detected/cropped a synthetic staff without changing its source buffer.
