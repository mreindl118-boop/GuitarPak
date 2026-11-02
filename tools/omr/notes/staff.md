# OMR port: masks -> staffs, notes, systems

Files (repo /home/user/GuitarPak): `js/omr/staff_detection.js`, `note_detection.js`,
`brace_dot_detection.js`, `system_repair.js`, `staff_regions.js` (already in `OMR.FILES`, manifest
order bar_line_detection -> staff_detection -> note_detection -> brace_dot_detection -> system_repair ->
staff_regions); suite `tests/omr-staff.test.js`; reference dump `tools/omr/dump_staff.py`.

Run:
```
cd /home/user/GuitarPak
OMR=<your reference folder (tools/omr/README.md)>
$OMR/venv/bin/python -I tools/omr/dump_staff.py $OMR/fixtures                    # ~2 min, pages: 14-staff-*
$OMR/venv/bin/python -I tools/omr/dump_staff.py $OMR/fixtures --edge \
  --seg $OMR/shipmodels/segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f.onnx   # ~1 min, 14-staff-edge*
SL_OMR_FIXTURES=$OMR/fixtures NODE_PATH=$OMR/jsenv/node_modules:/opt/node22/lib/node_modules \
  /opt/node22/bin/node tests/omr-staff.test.js                                    # ~45 s
```
No models needed by the suite (it starts from the 05-filtered masks). dump_staff.py asserts that
its own run of `main.detect_staffs_in_image` from the 05 masks reproduces 06-symbols.json,
07-staff.json and 08-repaired.json exactly before writing anything.

## Status (7 pages + 8 edge cases): exact

- 07-staff.json, every field of every object (staff_fragments after break_wide_fragments,
  noteheads_with_stems, average_note_head_height, bar_lines_or_rests, bar_line_boxes, staffs with
  their grids and notes, brace_dot, notes, multi_staffs) and 08-repaired.json: all values equal
  within the fixtures' 4-decimal rounding (ints, enums, counts, order, polygons exact).
- 07-brace-dot.png and make_lines_stronger (14-staff-prestrong.png -> 05-filtered-staff.png): 0
  pixels differ.
- detect_staff step by step at FULL float precision (14-staff-trace.json: clef / other / bar-line
  anchors with their lines and fragments, the clef zones' five-line groups incl. find_peaks +
  filter_line_peaks (valid peaks and groups), raw staffs, duplicates, row merges, staffs without
  clef, resampled grids, both page filters, the split_clumps_of_noteheads calls, trimmed and tall
  brace candidates): max deviation 0 (bit-identical doubles).
- Units (14-staff-units.json): check_bbox_size on 600 boxes/page, _extrapolate_missing_staff_line
  (dead code in homr, ported), estimate_unit_size_from_clefs, StaffLineSegment ==/is_overlapping,
  prepare_staff_image, draw_onto_image pictures (sha1), system_repair on 12-15 regroupings per page
  (singles, one system, grand staffs, missed brace, voice+piano, random partitions; every helper's
  result plus the final systems), StaffRegions queries: all exact.
- Edge cases (FIXTURES/14-staff-edge.json): generated blank page and text page (through the shipping
  segnet) -> "No noteheads or clefs found"; a cover page with loose notes but no staff lines ->
  "No staffs found"; belle/no11 without noteheads (unit size from the clefs, then the whole stage,
  compared like 07/08); belle without noteheads and clefs -> "No noteheads or clefs found"; belle /
  02-entree without staff lines -> "No staffs found".
- Speed in Node (one core): detect_staffs_in_image + repair_systems 0.8-2.3 s per page (11 s for 7);
  the whole suite (incl. the traced second run and the units) ~45 s.
- The suite catches mutations (e.g. braceCoreWidthRatio 0.5 -> 0.45: 24 FAIL; staff line segment
  x tolerance 10 -> 11: 86 FAIL). Passes on the working tree with the in-flight
  foundation audit (np.tan in getCenterExtrapolated, py.max2/min2, exact floorDiv).

## Exports

`OMR.staff_detection`: `prepareStaffImage(img)`, `makeLinesStronger(img, [kw, kh])`,
`StaffLineSegment`, `StaffAnchor`, `RawStaff`, `getStaffForAnchor`, `findRawStaffsByConnectingLineFragments`,
`removeDuplicateStaffs`, `mergeStaffsInSameRow`, `connectStaffLines`, `areLinesCrossing`,
`areLinesParallel`, `beginsOrEndsOnOneStaffLine`, `findStaffAnchors(lines, symbols, areClefs)`,
`resampleStaffSegment` (returns a list; Python's generator is always consumed whole),
`resampleStaff`, `resampleStaffs`, `filterEdgeOfVision(staffs, [h, w])`, `filterNeighborPage`,
`sortStaffsTopToBottom`, `filterUnusualAnchors`, `initZone(anchors, [h, w])`, `filterLinePeaks`,
`findHorizontalLines`, `predictOtherAnchorsFromClefs`, `slicesAcrossPage`, `findStaffsWithoutClef`,
`breakWideFragments(fragments, limit = 100)`, `estimateUnitSizeFromClefs(fragments, clefs)` (null =
None), `detectStaff(debug, staffMask, fragments, clefsKeys, barLineBoxes)`; privates `_continues`,
`_mainColumn`, `_shareInColumn`, `_findFiveLineGroups`, `_extrapolateMissingStaffLine`, ... and the
Python stand-ins `_pyRange(start, stop)` (a range = `{start, stop}`; StaffAnchor.zone / yRange,
initZone's ranges) and `_removeFirst(list, x)` (list.remove: identity, then `equals`).

`OMR.note_detection`: `NoteheadWithStem(notehead, stem, stemDirection)` (stem / direction null =
None), `adjustBbox`, `getCenter`, `checkBboxSize(bbox [x1,y1,x2,y2], noteheadMask, unitSize)`,
`splitClumpsOfNoteheads`, `combineNoteheadsWithStems(noteheads, stems)`,
`addNotesToStaffs(staffs, noteheadsWithStems, symbolsMask, noteheadMask)` (adds the notes to the
staffs, returns all notes; a note can be on two staffs, like homr).

`OMR.brace_dot_detection`: `prepareBraceDotImage(symbolsMask, staffMask)`,
`findBracesBracketsAndGrandStaffLines(debug, staffs, braceDotBoxes)` -> MultiStaff list; privates
`_trimSymbolToCoreSpan`, `_filterForTallElements`, `_getConnectionsBetweenStaffs*`,
`_mergeMultiStaffIfTheyShareAStaff`, `_createGrandstaffs`.

`OMR.system_repair`: `repairSystems(debug, multiStaffs)`; privates with homr's names (`_layout(row)`
-> array of booleans, `_possibleGrandstaffs` -> a Set of `pairKey(upper, lower)`, `_commonLayout`,
`_findPeriodicCore` -> `[period, front, back]` | null, ...). Python tuples / ids: a layout is an
array of booleans; **`layoutKey(layout)`** ('F'/'T' per staff) is the stand-in for the tuple as a Set /
Map key and sorts exactly like the tuple; `keyLayout(key)` inverts it; `counter(layouts)` = Counter
(Map key -> count, insertion order). staff_parsing's `{_layout(row) for row in staffs}` is
`new Set(staffs.map((row) => SR.layoutKey(SR._layout(row))))`.

`OMR.staff_regions`: `StaffRegions(multiStaffs)` (`centers`, `getStartOfClosestStaffAbove(y)` -> 0 when
none, `getStartOfClosestStaffBelow(y)` -> 1e12 when none), `getCenterMinMaxY(staff)`.

## Async boundaries

None. The whole stage is synchronous (no ONNX session): opencv.js must be initialised
(`OMR.setCv(cv)`) before the first call, nothing else.

## main.py for the engine (not ported yet: it belongs to whoever ports main.py / engine.js)

`tests/omr-staff.test.js` holds `predictSymbols(debug, predictions)` and
`detectStaffsInImage(predictions, debug, rec)`: line-by-line ports of main.py:149 and main.py:263
(everything after `load_and_preprocess_predictions`; title detection off), verified by the suite
including the exceptions. Lift them into the engine as they are:
- `throw OMR.py.error('Exception', 'No noteheads or clefs found')` when there are no noteheads and
  estimate_unit_size_from_clefs finds no clef anchor, `throw OMR.py.error('Exception', 'No staffs
  found')` when detect_staff returns none (homr raises plain `Exception(msg)`; `e.message` == Python
  `str(exc)`, `e.pyType` == 'Exception'; the suite checks both).
- **SheetLab gotcha:** `sheetlab_engine.py` treats a page as a cover page only when the message
  contains "No noteheads found" or "No staffs found". homr now says "No noteheads or clefs found",
  so a blank/text page gets `skipped_reason = "OMR skipped page (No noteheads or clefs found)"`
  instead of "Non-music / cover page (...)". Reproduce that literally, or decide to match
  "No noteheads" (a deliberate deviation to document).
- Then `repair_systems(debug, multi_staffs)` (the engine calls it right after detect).
- predictions: `new OMR.model.InputPredictions(original, preprocessed, notehead, symbols, staff,
  clefsKeys, stemsRest)`, masks 0/1 uint8 (after filter_predictions and
  `staff = makeLinesStronger(staff, [1, 2])`).

## Gotchas

1. **theRNG:** predict_symbols' fitEllipse draws from cv::theRNG (foundation gotcha 1). Nothing in
   this stage draws from it, but its results depend on noteheads, so run pages in Python's order from
   `OMR.cv2.resetRNG()` (the suite does; cv2.setRNGSeed(0) == a fresh Python process, verified).
2. **Boxes compare by value**: `fragment in list`, `set(fragments)`, `list.remove(raw_staff)` and
   `s != overlapping[0]` (RawStaff is a RotatedBoundingBox) use the box tuple (`equals` / `key()`);
   Staff and MultiStaff have no `__eq__` (identity). The port keeps both.
3. homr's quirks are kept on purpose: resample_staff_segment marks non-parallel lines by indices of
   the *compacted* list; its fill loop keeps `prev_center` across the forward and backward pass;
   `init_zone` may shrink a merged range (`range(last.start, r.stop)`); `check_bbox_size` re-checks
   boxes a second time; add_notes_to_staffs takes the staff point at the clump's centre for every
   split note; `break_wide_fragments` appends the right side's first point to both halves.
4. `Staff([])` (an anchor with no complete grid point) raises IndexError in Python; resampleStaff
   throws `Error('list index out of range')` before model.Staff would hit a TypeError.
5. Python semantics from np.js used here: `py.max2/min2` wherever homr calls two-argument `max` /
   `min` (first argument wins over NaN, like Python), `py.floorDiv` (now Python's exact float `//`),
   `py.round` (banker's, raises on NaN), and Python-typed exceptions via `py.error(type, msg)`
   (`e.name` / `e.pyType`): IndexError for `Staff([])`, ValueError for list.remove / strict zip,
   StopIteration in _convert_to_layout (unreachable on consistent input, as in homr).
6. Debug: with `debug = true` the stage records teasers for notehead_with_stems, bar_lines,
   staff_anchors, raw_staffs, staffs, notes and systems (every class of the stage has `toDrawable`;
   `drawOntoImage` matches Python's pictures byte for byte). Python also counts write_threshold_image
   files in its numbering; the browser's no-op writes don't, so teaser file numbers differ.

## Audit (adversarial review, 2026-10-28)

Differential runs against homr's Python on inputs the 7 printed pages never reach, all now
regression checks in `tests/omr-staff.test.js` (`SL_OMR_STAFF_ONLY=audit` runs only these,
`=base` only the pages / edge cases / debug pictures; unset = everything, ~2.5 min):

- `tools/omr/dump_staff_audit.py FIXTURES --seg SEGNET` (~4-12 min; `--only a,b` / `--units-only`
  merge into the existing JSON) -> `15-staff-audit.json` + `15-staff-audit-<case>-<mask>.png`:
  37 cases through main.detect_staffs_in_image + repair_systems, compared like 07/08 plus the
  staffs at full precision, homr's eprint log line by line, and 10 random regroupings each:
  real shipping-segnet masks of photos (30-seg photo / desk-shadow / low-res / dark-frame, a page
  rotated 6 degrees, a book-curved page, a book photo with a strip of the neighbour page, a
  two-page spread) and transformed fixture masks (rotated +2/-5/+9 degrees, curved, wavy, one
  staff, one grand staff, a third, staffs cut at the top / bottom, narrow, flipped, half / 1.6x
  scale, clefs or bar lines removed (in part), noise, thick lines, interrupted lines,
  shine-through duplicates, neighbour page, spread, stacked pages, clefs only, rotated so the
  outer line leaves the image (filter_edge_of_vision)). Units: check_bbox_size on 1000 random
  boxes (negative / out-of-image corners, unit 0.8..40), find_horizontal_lines on 280 random
  zones, filter_line_peaks on 300 random peak sets, break_wide_fragments limits 7/30/64/250,
  find_staff_anchors on vertically shifted candidates + begins_or_ends_on_one_staff_line (2880
  calls), remove_duplicate_staffs / merge_staffs_in_same_row on raw staffs and their merges (the
  2+ duplicates and replace-by-anchors branches), exceptions of degenerate direct calls.
- `tools/omr/dump_staff_repair_fuzz.py FIXTURES` (4 s) -> `15-staff-repair-fuzz.json`: 1200
  random groupings of 200 synthetic pages (voice + piano, quartets, trios, grand staffs, shifted /
  shorter / disjoint x ranges, x on .5, tilted, numpy float64 y like detect_staff) through every
  system_repair helper and repair_systems (all lines of system_repair.py except the unreachable
  `split() is None` / `_vertical_gap is None` returns of _convert_to_layout).
- Leak check: the whole stage on a page creates and deletes the same number of opencv.js objects.

Results: every value equal (staffs bit-identical at full precision, 07/08 within the 4-decimal
rounding, logs identical). Line coverage of homr's four files (sys.settrace): the audit adds 113
lines the pages never execute (merging rows, duplicate replacement, edge-of-vision, staffs
without clef, estimate_unit_size_from_clefs, all repair paths). Mutation check: with
filter_edge_of_vision's top/bottom test removed, remove_duplicate_staffs' `>= 2` as `> 2`,
_continues' 15 units as 10, or begins_or_ends_on_one_staff_line returning on a missing fragment,
the base suite still passes; the audit fails (20 / 1 / 25 / 1 FAIL).

Fixed:
- `brace_dot_detection._filterForTallElements` (and so find_braces_brackets_and_grand_staff_lines)
  without staffs threw a JS TypeError; homr raises `IndexError: list index out of range`
  (staffs[0]). Unreachable from main (it raises "No staffs found" first), now Python-typed.
- The test's detectStaffsInImage (the engine's reference for main.py) logged
  `Average note head height: 14` where homr logs `14.0` (str(float)): it uses OMR.py.floatRepr
  now. Lift it into the engine with that.

Refuted (probed, no change): -0 from py.round (get_center((-1,0,0,0)) gives [-0, 0]: equal
everywhere, JSON '0', Map keys equal); check_bbox_size's endless recursion for unit sizes below
~0.52 px (Python RecursionError, JS RangeError: both throw; unreachable, a staff's unit size is
at least 2 px since its lines are separate contours); every NaN / empty-list path of the stage is
unreachable from detect_staffs_in_image (5-line anchors, non-empty staffs) and otherwise
mirrors numpy (np.mean/median of [] = NaN, py.min/max raise ValueError).
