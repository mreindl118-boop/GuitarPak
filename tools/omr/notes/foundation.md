# OMR port: the foundation (np, cv, pil, geometry, data model)

Files (repo /home/user/GuitarPak): `js/omr/np.js cv.js pil.js simple_logging.js constants.js
image_utils.js point_mapping.js find_peaks.js bounding_boxes.js debug.js model.js
bar_line_detection.js`; suites `tests/omr-cv|pil|boxes|model.test.js`; reference dumps
`tools/omr/dump_cv.py` (20-cv.json), `dump_cv_pil.py` (21-pil.json), `dump_model.py` (22-model.json).

Run: `cd /home/user/GuitarPak && SL_OMR_FIXTURES=$OMR/fixtures NODE_PATH=$OMR/jsenv/node_modules:/opt/node22/lib/node_modules /opt/node22/bin/node tests/omr-cv.test.js`
(regenerate a dump: `$OMR/venv/bin/python -I tools/omr/dump_cv.py $OMR/fixtures [page...]`).

## Status (7 pages)

| suite | result |
|---|---|
| omr-cv | 334 checks, every cv2 call bit-exact (thousands of contours / rects / ellipses / boxPoints per page, all morphology, CLAHE == 03-clahe.png, brace-dot == 07-brace-dot.png, warpAffine, remap, Hough, polygon tests, drawing), INTER_CUBIC within tolerance (see gotchas), no Mat leaks |
| omr-pil | `pil.resize` == 02-resized.png byte for byte on all pages + 48 synthetic cases/page (all filters, boxes, vertical-first) |
| omr-boxes | `predict_symbols` from the 05-filtered masks: 13142 boxes, 0 differ from 06-symbols.json (counts, order, debug ids, polygons exact; floats within the fixture's 4 decimals) |
| omr-model | model.py / bounding_boxes.py methods on rebuilt objects: all exact (incl. find_peaks on detect_staff's real signals and np.argsort tie order) |

## OMR.np (np.js)

Python builtins `OMR.py`: `round` (half even), `int` (trunc), `floorDiv`, `mod`, `sorted(arr, key, reverse)`
(stable; reverse keeps input order of ties like Python), `cmp` (tuples), `max/min(arr, key)` (first
wins, throws on empty like Python), `range`, `contains(list, x)` (`x in list`: identity or `.equals`),
`repr` (logging only).

numpy reductions: `sum`, `mean` (numpy's PAIRWISE summation, `0 + pairwise`; a Float32Array
accumulates in float32 like np.sum(float32)), `median`, `std` (population), `percentile` (linear),
`argmax/argmin` (first), `diff`, `argsort` (STABLE), `argsortQuick` (numpy 2.4's DEFAULT
np.argsort on AVX-512 x86: not stable, lane-exact port of x86-simd-sort; use it wherever homr calls
np.argsort() and ties can matter), `clip`, `linspace`, `sumAxis(img, axis)` (axis 1 pairwise per row,
axis 0 sequential like numpy), `max/min` (of a typed array / image).

Image type: `{h, w, c, data}` HWC row-major; the typed array IS the dtype (Uint8Array = uint8,
Float32Array, Float64Array, Int32Array, Int16Array, Uint16Array, Int8Array, Uint32Array). `c === 1`
means a 2-D numpy array. Helpers: `image(h, w, c, data|dtype)`, `zeros/ones/full(shape, [v], dtype)`
(shape `[h, w]` or `[h, w, c]`, dtype default float64 like numpy!), `zerosLike/fullLike`, `clone`,
`astype(img, dtype)` (numpy C casts: trunc toward 0, ints wrap; float64->float32 rounds),
`shape/ndim/size/dtypeOf/ctorOf/isImage`, `crop(img, y0, y1, x0, x1)` (numpy slice bounds incl.
negatives/None/clamp, **returns a COPY** - numpy returns a view), `assign(img, y0, y1, x0, x1, src|scalar|perChannel)`
(`a[y0:y1, x0:x1] = src`, mutates), `paste(img, y, x, src)` (clipped), `get/set(img, y, x, v, ch)`,
`channel(img, k)`, `merge([chs])`, `map(img, fn, dtype)`, `map2(a, b, fn, dtype)`, masks as uint8 0/1:
`gt/ge/lt/eq(img, v)`, `and/or(a, b)`, `where(mask, a, b, dtype)`, `countNonZero`, `nonzero(img)` ->
`[ys, xs]` row-major. Point lists: `ptsLen`, `toPts(nested, dtype)` (flat typed array), `pairs(flat)` ->
`[[x, y]...]`, `concat(list)` (np.concatenate of contours).

## OMR.cv2 (cv.js)

`OMR.setCv(cv)` (harness does it), `OMR.getCv()`. Constants: RETR_*, CHAIN_APPROX_*, MORPH_*,
THRESH_*, ADAPTIVE_THRESH_*, INTER_*, BORDER_*, COLOR_* (BGR2GRAY, GRAY2BGR, RGB2BGR, RGBA2BGR, ...),
INTERSECT_*, FILLED, LINE_4/8/AA, FONT_HERSHEY_SIMPLEX/PLAIN, CV_8U..CV_64F (re-read from opencv.js
in setCv; OpenCV 5's CV_8UC3 is 64, CN_SHIFT 5). `OMR.cv2.error` = the `cv2.error` class (opencv.js
exceptions are rethrown as it, so `catch (e) { if (e instanceof OMR.cv2.error) ... }`).

Calling conventions: Python positional args stay positional, keyword args become a trailing
options object; images in/out are OMR.np images; every Mat is deleted (try/finally; the suite counts
creations vs deletions).

- contours / point lists: flat Int32Array (or Float32Array) of x,y pairs = numpy (N,1,2) flattened;
  `len(contour)` = `c.length / 2`; nested `[[x,y],...]` accepted (all ints -> int32 else float32);
  Float64Array is narrowed to float32 (homr always casts to float32 first).
- rotated rect = `[[cx, cy], [w, h], angle]` (numbers are float32 values like cv2's tuples).
- `findContours(img, mode, method)` -> `[contours (array of Int32Array), hierarchy (Int32Array 4N) | null]`
- `minAreaRect(pts)` -> rect; `fitEllipse(pts)` -> rect (JS port, see gotchas); `boxPoints(rect)` ->
  `[[x,y] x4]` float32 values (JS port, OpenCV 5 formula); `boundingRect(pts|img)` -> `[x,y,w,h]`;
  `contourArea(c, oriented)`; `convexHull(pts, clockwise, returnPoints)` (same dtype; indices when
  returnPoints false); `pointPolygonTest(c, [x,y], measureDist)`; `intersectConvexConvex(p1, p2)` ->
  `[area, Float32Array|null]`; `rotatedRectangleIntersection(r1, r2)` -> `[flag, Float32Array|null]`;
  `ellipse2Poly(center, axes, angle, a0, a1, delta)` -> Int32Array; `HoughLinesP(img, rho, theta,
  thr, {minLineLength, maxLineGap})` -> `[[x1,y1,x2,y2], ...] | null` (OpenCV 5 shape (N,4)!);
  `findNonZero(img)` -> Int32Array pairs | null (JS).
- `getStructuringElement(shape, [kw, kh])` -> uint8 image kh x kw; `dilate/erode(img, kernel,
  {iterations, anchor, borderType, borderValue})`, `morphologyEx(img, op, kernel, {...})` (default
  border value = morphologyDefaultBorderValue like cv2); `blur(img, [kw,kh])`, `GaussianBlur(img,
  [kw,kh], sigmaX, {sigmaY, borderType})`, `filter2D(img, ddepth, kernel(image|nested), {anchor, delta,
  borderType})`.
- `resize(img, [w,h] | null, {fx, fy, interpolation})`, `warpAffine(img, M 2x3 nested, [w,h], {flags,
  borderMode, borderValue})`, `remap(img, mapx, mapy, interpolation, {borderMode, borderValue})`,
  `getAffineTransform(src3, dst3)` -> nested 2x3 float64, `invertAffineTransform(M)`.
- `cvtColor(img, code)`, `threshold(img, t, max, type)` -> `[retval, img]`, `adaptiveThreshold(img,
  max, method, type, block, C)`, `addWeighted(a, alpha, b, beta, gamma, {dtype})`, `subtract(a, b,
  {mask, dtype})` (saturating), `bitwise_and(a, b, {mask})` (0 outside the mask), `calcHist([imgs],
  [ch], mask, [bins], [lo, hi])` -> Float32Array(bins) (OpenCV 5 returns 1-D (bins,)),
  `createCLAHE({clipLimit, tileGridSize})` or `createCLAHE(clip, [8,8])` -> `{apply(img)}`.
- drawing mutates `img.data` in place and returns img: `fillPoly(img, [pts...], color)`,
  `fillConvexPoly(img, pts, color)`, `drawContours(img, contours, idx, color, thickness)`, `line`,
  `circle`, `rectangle`, `ellipse(img, rect, color, thickness)` (RotatedRect overload) or the
  center/axes form, `putText`. Colours: a number = Scalar(v,0,0,0) like Python, arrays padded with 0.
- RNG: `setRNGSeed(seed)` (cv2.setRNGSeed), `resetRNG()` (= a fresh Python process),
  `_rngState([lo, hi])` get/set.
- NOT available: `Subdiv2D` (dewarping must port Delaunay; homr maps triangles back to point
  indices, so only the triangle set matters, verify order dependence), `imread/imwrite`.

## The ported homr modules

`OMR.simple_logging.eprint(...)` -> `OMR.simple_logging.sink(msg)` if set (worker: forward as notes).
`OMR.constants.*` camelCase (`numberOfLinesOnAStaff`, `toleranceForStaffLineDetection(u)`,
`noteheadSizeRatio`, `minWidthForBraceDotCandidate`, ...). `OMR.image_utils.cropImage(img, x1, y1,
x2, y2)`, `cropImageAndReturnNewTop(...)` -> `[copy, [x, y]]`. `OMR.point_mapping.identity, undoCrop(x,
y), undoResize(shapeBefore, shapeAfter), chain(...)`; points are `[x, y]`. `OMR.find_peaks.findPeaks(x,
{height, distance, prominence})` -> `[peaks (plain array), {}]` (Python returns an int ndarray;
`centers -= 1` is the caller's map).

`OMR.bounding_boxes`: `DebugDrawable` (`drawOntoImage(img, color)`, `toDrawable(color)` ->
`[{type: 'polygon'|'polyline'|'ellipse'|'rect'|'text', ..., color [b,g,r], css}]`), `AnyPolygon`,
`BoundingBox(box [x1,y1,x2,y2], contours, debugId)` (`center, size, rotatedBox, polygon`,
`extract(img)`, `blankEverythingOutsideOfBox(img)`, `increaseSizeInEachDimension(n, shape)`),
`AngledBoundingBox` (`box` normalised to angle in [-45,45] with w/h swap, `center, size, angle,
topLeft, bottomLeft, topRight, bottomRight, polygon, contours, debugId`, `isOverlapping(other)`,
`isOverlappingWithAny(list)`, `_canShapesPossiblyTouch`, `equals(other)` (= Python __eq__), `key()`
(hash stand-in)), `RotatedBoundingBox(rect, contours, debugId)` (`isIntersecting, ensureMinDimension,
makeBoxThicker, moveToXHorizontalBy, makeBoxTaller, makeBoxTallerKeepCenter, getCenterExtrapolated,
isOverlappingExtrapolated, toBoundingBox`), `BoundingEllipse(rect, contours, debugId)`
(`makeBoxThicker`, `makeBoxTaller` -> RotatedBoundingBox), `createRotatedBoundingBoxes(img,
{skipMerging, minSize, maxSize, thickenBoxes})`, `createRotatedBoundingBox(contour, debugId)`,
`createBoundingEllipses(img, {skipMerging, minSize, maxSize})`, `createLines(img, {threshold,
minLineLength, maxLineGap, skipMerging})`, `mergeOverlayingBoundingBoxes(boxes)` (groups in the
order of their first member, dict semantics via Map), `UnionFind`, private helpers as `_name`.
Polygons are flat Int32Array (boxPoints().astype(int64) truncated / ellipse2Poly).

`OMR.model`: `InputPredictions(original, preprocessed, notehead, symbols, staff, clefsKeys,
stemsRest)`, `SymbolOnStaff` (`transformCoordinates(fn)`), `Accidental(box, position)`, `Rest(box)`,
`Note(box, position, stem, stemDirection)` (`hasDot, circleOfFifth, beams, flags`), `BarLine(box)`,
`Clef(box)`, enums `StemDirection.UP/DOWN`, `NoteHeadType.HOLLOW/SOLID` (frozen `{name, value}`,
String() = 'O' / '*'), `noteNames`, `StaffPoint(x, y[], angle)` (`averageUnitSize, merge,
findPositionInUnitSizes(box), transformCoordinates(fn), toBoundingBox`), `Staff(grid)` (`minX, maxX,
minY, maxY, averageUnitSize, symbols, isGrandstaff, _yTolerance`, `isOnStaffZone, merge, split (null
| [upper, lower]), addSymbol, getAt (null), yDistanceTo, getBarLines, getClefs, getNotes,
extendToXRange, getNumberOfNotes, getAllExceptNotes, copy, transformCoordinates`), `MultiStaff(staffs,
connections)` (sorted by minY; `merge, _scoreBraceWithStaffPair, _selectGrandstaffs (throws on an
empty brace list like Python's max()), _mergeSelectedPairs, createGrandstaffs, breakApart`),
`MultiStaff.GrandStaffPair`.

`OMR.debug.Debug(originalImage, filename, debug)`: same method names, all writes are no-ops;
`writeTeaser(filename, drawables)` records `{filename, width, height, items}` in `debug.teasers` (items
from `toDrawable`, colours = homr's alternating BGR list + css) for the page preview (homr calls it with
the MultiStaff list: staff lines as polylines + connection polygons). `OMR.debug.drawTeaser(img,
drawables)` = the Python picture via cv2 drawing (tests).

`OMR.bar_line_detection.prepareBarLineImage(img)`, `detectBarLines(barLines, unitSize)`.

`OMR.pil.resize(img, [w, h], {resample, box})` (uint8, 1-4 channels; default BICUBIC; `OMR.pil.Resampling`).
homr's resize.py target: `[1920, OMR.py.round(h * (1920 / w))]` (skip when equal).

## Gotchas found (read before porting more)

1. **cv::theRNG and fitEllipse.** cv2.fitEllipse jitters degenerate point sets (and 5-point sets
   via fitEllipseDirect always draw from it) with the process-global RNG; the result therefore depends
   on every earlier such call in the process, and on the compiler (GCC draws Point2f(y-arg) first).
   The JS port keeps the RNG in OMR.cv2: run pages in the same order as Python and call
   `OMR.cv2.resetRNG()` once per document (= one Python process). dump_stages ran all 7 pages in one
   process in sorted order, so 06-symbols of later pages only match when all pages run in that order
   (omr-boxes does). homr's only fitEllipse caller is create_bounding_ellipses (noteheads).
2. **Python `**` is libm pow:** `x ** 2` / `s ** 0.5` differ from `x*x` / `sqrt` in ~0.08% of inputs (1
   ulp). bounding_boxes' distance check uses `x*x` + sqrt (only compared against a threshold; all pair
   checks exact). If a port needs exact `**`, glibc pow must be ported - avoid relying on it.
3. **np.argsort is not stable** (SIMD networks; CPU dependent). Use `OMR.np.argsortQuick` where homr
   uses np.argsort and ties matter (find_peaks: full-width staff lines give equal row counts; bwv797
   had 31 equal peaks and a different kept line without it). Python `sorted` is stable (`OMR.py.sorted`).
4. **numpy sums are pairwise** (and float32 arrays accumulate in float32): use `OMR.np.sum/mean/std`,
   not a JS loop, for float data. `np.median` of an even count = mean of the two middle values.
5. **cv2 on x86 uses optimised kernels** that opencv.js doesn't: warpAffine INTER_LINEAR (OpenCV 5's
   float32 FMA kernel, 16-pixel chunks + scalar tail; JS port exact on 1500 random warps) and
   addWeighted uint8 (FMA; JS port) are handled; uint8 INTER_CUBIC resize goes through Intel IPP
   (not reproducible: +-1 in <=0.85% of values, only SheetLab's low-res upscale), float32 INTER_CUBIC
   resize differs <=2.4e-7 relative (only homr's training augmentation). Everything else homr uses
   (INTER_LINEAR/AREA/NEAREST resize, CLAHE, morphology, GaussianBlur, filter2D, threshold, remap,
   cvtColor, calcHist, contours, drawing) is bit-exact through opencv.js.
6. **OpenCV 5 shape changes:** HoughLinesP gives (N,4) (homr's create_lines `line[0]` would fail in
   Python 5.0.0 - only staff_position_save_load uses it); calcHist gives 1-D (bins,);
   `boxPoints` corners are computed independently (not mirrored through the centre as in 4.x);
   minAreaRect returns angles like -90 for axis-aligned rects (AngledBoundingBox normalises them).
7. **Masks:** the pipeline's masks are 0/1 uint8; 05-filtered-*.png are 0/255 (`OMR.np.gt(png, 0)`).
8. **crop is a copy.** homr writes into numpy views in places (e.g. `gray[y:y+h, x:x+w] = 255` in
   staff_parsing): use `OMR.np.assign` on the original.
9. Python `int(round(x))` = `OMR.py.int(OMR.py.round(x))`; `//` on floats = `OMR.py.floorDiv`.
10. Debug colours are BGR tuples (cv2); `toDrawable` adds `css` = rgb(r,g,b).

## Audit (adversarial review, 2026-10-28): changed behaviour every later port relies on

Each item was confirmed with the same input through the venv Python and the JS, fixed, and
is now a regression check: `tools/omr/dump_audit.py` writes `<page>/23-audit.json` (Python's
results, seeded per page); `tests/omr-model.test.js` (section "audit") and
`tests/omr-cv.test.js` (`auditCv`) compare. All 7 pages pass; the old code fails every group.

- **`OMR.py.int(x)` / `OMR.py.round(x)` raise like Python** on NaN (`ValueError`) and +-inf
  (`OverflowError`); the error's `name` is the Python type (`OMR.py.error(type, msg)` makes
  one). They used to return NaN / Infinity and let a page continue where Python (and so the
  SheetLab engine, which skips a page on any exception) stops. numpy's `astype(int)` does not
  raise: use `OMR.np.astype` / `OMR.np.castInt32` for those.
- **`OMR.py.round(x, nd)`** is Python's correctly rounded `float.__round__`
  (`round(2.675, 2) == 2.67`); **`OMR.np.round(x, nd)`** is numpy's multiply/rint/divide (2.68).
- **`OMR.py.floorDiv` / `mod` / `divmod`** follow CPython's float divmod (`1 // 0.1 == 9.0`,
  `-4.0 % 2.0 == 0.0`) and raise `ZeroDivisionError`; identical to `Math.floor(a / b)` for ints.
- **`OMR.py.max2(a, b)` / `min2(a, b)`** = Python's two-argument `max` / `min` (the first
  wins unless the second is greater / smaller, so `max(w, nan) == w`). Use them wherever homr
  writes `max(a, b)` on floats; `Math.max` returns NaN. `py.max/min(list, key)` raise ValueError.
- **`OMR.np.argsortQuick`** now ports libstdc++'s `std::sort` too: x86-simd-sort falls back to
  it when the quicksort makes no progress (many equal keys, > 256 values) and for arrays with a
  NaN (`std_argsort_withnan`); the old stable-sort stand-in gave a different tie order (12 of
  1500 random tie-heavy arrays). Exact on 4500 + 1120 arrays now.
- **`OMR.np.median` / `percentile`**: NaN in, NaN out; a Float32Array stays float32 like numpy
  (median = `f32(f32(a + b) / 2)`; percentile's lerp in float32 with float64 weight);
  percentile raises IndexError on empty input and ValueError for q outside [0, 100].
- **`OMR.np.linspace`** uses numpy's formula (`i * step + start`, last = stop); the old one
  differed in the last bit for 65% of calls.
- **`OMR.np.astype` / `assign` float -> int** follow numpy on x86: to int8/uint8/int16/uint16/
  int32 through a 32-bit truncation (NaN, inf and out-of-int32 values -> INT_MIN, then wrap):
  `np.int32(nan) == -2147483648`, `np.uint8(1e10 + 5) == 0`. uint32 follows numpy's scalar
  loop; numpy's own vectorised loop differs for out-of-range uint32 values (length-dependent).
- **NaN is truthy** in `countNonZero`, `nonzero`, `and`, `or`, `where` and `cv2.findNonZero`
  (numpy / C++ `!= 0`); JS truthiness used to drop it.
- **`OMR.np.tan(x)`: correctly rounded tan.** homr's `get_center_extrapolated` uses `np.tan`
  (numpy 2.4 on AVX-512 = Intel SVML) and `is_overlapping_extrapolated` `math.tan` (glibc); V8's
  `Math.tan` is 1 ulp off the correctly rounded value for ~3% of homr's angles, SVML for ~0.4%,
  glibc for ~0.2%. Both methods use `OMR.np.tan` now: bit-exact with numpy on 2818/2835 audit
  angles and 3657/3657 real boxes of 22-model.json (Math.tan: 2731/2835, 3652/3657). Use it
  for any homr `np.tan` / `math.tan`; exact parity would need ports of SVML and glibc's FMA tan.
- **cv2 on empty point sets** returns defaults where opencv.js asserts: `minAreaRect` ->
  `[[0,0],[0,0],-90]`, `boundingRect` -> zeros, `contourArea` -> 0, `convexHull` -> null,
  `pointPolygonTest` -> -1 (or -DBL_MAX with measureDist), `intersectConvexConvex` with < 2
  points -> `[0, null]`; the wrappers answer these themselves (`fillPoly([])` still raises, as
  in cv2).
- **`warpAffine` with a zero dsize** (or a zero width/height) uses the source size, like cv2.
- **The scalar code of cv2's AVX2 kernels is FMA-contracted** (GCC's C++ default
  `-ffp-contract=fast` in units built with `-mfma`): warpAffine 8U linear's last `width % 16`
  pixels of a row compute `fma(x, M0, y*M1) + M2` and FMA blends; `addWeighted` 8U below 16
  values computes `fma(a, alpha, b*beta) + gamma`. The ports did plain float math there (1 of
  400 random warps differed). Any further JS port of an x86 cv2 kernel must assume contraction
  of `a*b + c` in its scalar parts too. `addWeighted` also refuses mismatched shapes like cv2.

Refuted on probing (no change needed): pil.resize on 1-pixel and extreme-ratio images (220
cases), np.sum / mean / std (pairwise, float32) on 150 arrays up to 20000 values, addWeighted
>= 16 values, degenerate (zero-width) polygons in doPolygonsOverlap (300 pairs incl.
StaffPoint.to_bounding_box boxes), pointPolygonTest with fractional points, crop copies vs
numpy views in staff_parsing (both crops are per-staff arrays).

Remaining (documented, not fixed): `py.sorted` / `py.max` with NaN keys order NaN as "equal"
(Python's timsort with `<` only can differ); a NaN-sized box's polygon is 0 where numpy's
int64 cast gives INT64_MIN; addWeighted on a non-contiguous numpy view runs per row in cv2
(JS images are always contiguous); `toPts` turns integral nested floats into int32.

### Audit, part 2 (resumed after the restart)

New regression set: `tools/omr/dump_audit_fuzz.py` writes `<page>/24-audit-fuzz.json` (homr's
own functions on randomized synthetic inputs, seeded per page, plus an `errors` table of
exception types AND texts); `tests/omr-model.test.js` section "fuzz" compares (per page: 2400
box-method results, 4200 pair checks, 100 merges, 150 crops, ~2240 staff checks, 90 grand-staff
cases, 80 find_peaks, 61 constants, 125 error/cast cases, 117 repr cases, 200 degenerate
fitEllipse sets of < 25 points from a fresh theRNG, i.e. the jitter path). Everything below was
probed in the venv first; the first fuzz run failed the staff / grand groups on the old code.

- **Exceptions carry Python's type and text.** The SheetLab engine shows `str(exc)` as a page's
  skip reason ("OMR skipped page (list index out of range)") and `type(exc).__name__` for a
  failed file, so: `Staff([])` -> IndexError "list index out of range" (Staff.merge of two
  staffs without a common x lands here), `StaffPoint.merge` -> ValueError, a StaffPoint with a
  y count not divisible by 5 -> `Exception`, `_can_shapes_possibly_touch` on an unknown type ->
  ValueError, `undo_resize` with a zero-sized shape -> ZeroDivisionError.
- **numpy empties raise like numpy:** `np.max/min` ("zero-size array to reduction operation
  maximum which has no identity"), `np.argmax/argmin` ("attempt to get argmax of an empty
  sequence"; `StaffPoint([]).find_position_in_unit_sizes` raises exactly this in Python),
  `np.concat([])` ("need at least one array to concatenate"). They returned undefined / 0 / an
  empty Int32Array.
- **Slices take integers only:** `np.crop` / `np.assign` raise TypeError ("slice indices must be
  integers or None or have an __index__ method") for a fractional bound, like numpy (even
  `2.0` raises in Python; JS cannot tell 2.0 from 2). A port that computes a bound with `/`
  where Python used `//` now fails loudly instead of truncating.
- **Python scalars into integer arrays** (numpy 2): `np.assign(img, ..., x)` with a number
  takes `int(x)` and checks the dtype's range (`a[...] = 300.7` on uint8 -> OverflowError
  "Python integer 300 out of bounds for uint8"; NaN -> ValueError); `np.full(shape, v, dtype)`
  checks an integral v's range (Python int) and casts a fractional one (Python float:
  300.5 -> 44 on uint8). A numpy scalar would wrap instead; homr's scalars are all in range.
- **cv2.error texts match cv2's** (`str(cv2.error)`): opencv.js's build path is rewritten to the
  wheel's `/io/opencv/modules/...` (line numbers already agree), and the JS-raised errors use
  cv2's full text (fitEllipse < 5 points, findNonZero on 3 channels, addWeighted shape
  mismatch).
- **Point dtypes are checked like cv2:** a typed array that is not int32 / float32 raises
  cv2.error with cv2's (-215) depth assertion for minAreaRect, boundingRect, contourArea,
  convexHull, pointPolygonTest, fitEllipse, intersectConvexConvex (a float64 numpy array raises
  in Python; the wrappers used to narrow it silently); getAffineTransform takes float32 only
  (int32 raises in cv2); fillPoly / fillConvexPoly / drawContours take int32 only. Nested JS
  arrays stay untyped (all-integer -> int32, else float32). An empty Float64Array raises too
  (cv2 checks the dtype before the empty-set defaults).
- **warpAffine dsize:** any width or height <= 0 (not only 0) means the source size
  (`Size::empty()`).
- **PIL resize:** size < 1 raises ValueError "height and width must be > 0" (after the
  same-size copy shortcut, as in Pillow); the box is validated like `_imaging.c` (negative /
  too large / empty -> ValueError) and an integer box of exactly the output size is a plain
  crop (ImagingCrop), as in Pillow.
- **Debug bookkeeping:** with `debug` on, the no-op writers still advance the file counter and
  remember the name as Python does (later teaser names carry the counter), and
  `dirName` / `baseFilename` follow `os.path.dirname` / `os.path.join` ('/c.png' -> '/c').
- **`OMR.py.repr` / `OMR.py.floatRepr` = Python's float repr** ('1e-05', '1e+16', '-0.0',
  '3.0'); `GrandStaffPair` prints `[0, 1]` like Python's list.

Confirmed, not fixable here (remaining risks):
- **fitEllipse on >= 25 points** (cv2 hands the SVD to OpenBLAS dgesdd): on 519 synthetic
  near-degenerate point sets (lines, two points, tiny blobs) 86 differ (fresh RNG per call), by up to a few float32
  ulps on well-shaped ones and visibly on degenerate ones (axis 97.59 vs 97.61), and 26 flip
  between width 0 and ~1e-15 (`_has_box_valid_size`). All such boxes are < 4 px wide, and the
  only caller (`create_bounding_ellipses(notehead, min_size=(4, 4))`) drops them; all 2731
  real >= 25-point contours of the 7 pages are exact. The RNG stream stays aligned (the jitter
  decision did not flip once), so later fits are unaffected.
- **fitEllipse < 25 points:** exact on 1414 synthetic sets with a fresh RNG; in a 1500-call
  sequence 3 jittered near-collinear sets differ by 1 float32 ulp in the long axis. Two of them
  are V8's `Math.atan2` vs glibc's `atan2` (1 ulp, amplified by the ill-conditioned fit), one is
  unexplained; the RNG stays aligned (checked by advancing Python's theRNG with cv2.randu).
- **`OMR.np.tan`** meets numpy (SVML) on 2825/2835 and glibc on 2830/2835 audit angles.
- `np.full` cannot tell a Python float with an integral value (1e10: cast) from a Python int
  (OverflowError): integral JS numbers are taken as ints.
