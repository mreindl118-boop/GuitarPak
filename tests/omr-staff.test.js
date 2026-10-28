// OMR engine: homr's staff stage (staff_detection, note_detection, brace_dot_detection,
// system_repair, staff_regions) against the Python reference on every page.
//
// From the 05-filtered-* masks, exactly main.detect_staffs_in_image: predict_symbols,
// break_wide_fragments, combine_noteheads_with_stems, the note head height (median, or
// estimate_unit_size_from_clefs), the bar line candidates, detect_bar_lines, detect_staff,
// prepare_brace_dot_image + its boxes, add_notes_to_staffs, find_braces_brackets_and_grand_staff_lines;
// then system_repair.repair_systems. Compared field by field with 07-staff.json / 08-repaired.json
// (ints, enums, counts and order exact; floats within the fixtures' 4 decimals), 07-brace-dot.png
// and make_lines_stronger (14-staff-prestrong.png -> 05-filtered-staff.png) byte for byte.
// tools/omr/dump_staff.py adds full-precision intermediates of detect_staff (14-staff-trace.json),
// unit cases (14-staff-units.json: clumped noteheads, system_repair regroupings, StaffRegions)
// and the edge cases (14-staff-edge.json: blank / text / cover pages and pages without
// noteheads, clefs or staff lines, which must throw homr's messages).
// fitEllipse (predict_symbols) draws from cv::theRNG, which carries from page to page in the
// Python process: the pages run in sorted order from a fresh RNG, like omr-boxes.
'use strict';
const crypto = require('crypto');
const path = require('path');
const H = require('./omr/harness');
const OMR = H.load('model.js'); // the foundation (later engine files may be mid-port)
for (const f of ['bar_line_detection.js', 'staff_detection.js', 'note_detection.js', 'brace_dot_detection.js',
  'system_repair.js', 'staff_regions.js']) require(path.join(H.ROOT, 'js', 'omr', f));
const np = OMR.np, bbx = OMR.bounding_boxes, model = OMR.model;
const SD = OMR.staff_detection, ND = OMR.note_detection, BD = OMR.brace_dot_detection;
const SR = OMR.system_repair, BL = OMR.bar_line_detection;
const eprint = (...a) => OMR.simple_logging.eprint(...a);

const MASKS = ['staff', 'symbols', 'stems_rest', 'notehead', 'clefs_keys'];
const TOL4 = 0.6e-4; // the dump_stages fixtures keep 4 decimals
const TOLX = 1e-9; // full-precision dumps (relative)

// ---------------------------------------------------------------------------------------------
// main.py, as the SheetLab engine calls it (load_and_preprocess_predictions done by the caller)

// homr: main.py:149
function predictSymbols(debug, predictions) {
  eprint('Creating bounds for noteheads');
  const noteheads = bbx.createBoundingEllipses(predictions.notehead, { minSize: [4, 4] });
  eprint('Creating bounds for staff_fragments');
  const staffFragments = bbx.createRotatedBoundingBoxes(predictions.staff, { skipMerging: true, minSize: [5, 1], maxSize: [10000, 100] });
  eprint('Creating bounds for clefs_keys');
  const clefsKeys = bbx.createRotatedBoundingBoxes(predictions.clefsKeys, { minSize: [20, 40], maxSize: [1000, 1000] });
  eprint('Creating bounds for stems_rest');
  const stemsRest = bbx.createRotatedBoundingBoxes(predictions.stemsRest);
  eprint('Creating bounds for bar_lines');
  const barLineImg = BL.prepareBarLineImage(predictions.stemsRest);
  debug.writeThresholdImage('bar_line_img', barLineImg);
  const barLines = bbx.createRotatedBoundingBoxes(barLineImg, { skipMerging: true, minSize: [1, 5] });
  return { noteheads, staffFragments, clefsKeys, stemsRest, barLines };
}

// homr: main.py:263 detect_staffs_in_image, from the predictions on (no title detection).
// rec (optional) receives the intermediates dump_stages writes into 07-staff.json.
function detectStaffsInImage(predictions, debug, rec) {
  rec = rec || {};
  const symbols = predictSymbols(debug, predictions);
  rec.symbols = symbols;

  symbols.staffFragments = SD.breakWideFragments(symbols.staffFragments);
  rec.staffFragments = symbols.staffFragments;
  debug.writeBoundingBoxes('staff_fragments', symbols.staffFragments);
  eprint('Found ' + symbols.staffFragments.length + ' staff line fragments');

  const noteheadsWithStems = ND.combineNoteheadsWithStems(symbols.noteheads, symbols.stemsRest);
  rec.noteheadsWithStems = noteheadsWithStems;
  debug.writeBoundingBoxesAlternatingColors('notehead_with_stems', noteheadsWithStems);
  eprint('Found ' + noteheadsWithStems.length + ' noteheads');
  let averageNoteHeadHeight;
  if (noteheadsWithStems.length > 0) {
    averageNoteHeadHeight = np.median(noteheadsWithStems.map((notehead) => notehead.notehead.size[1]));
  } else {
    const unitSize = SD.estimateUnitSizeFromClefs(symbols.staffFragments, symbols.clefsKeys);
    rec.unitSizeFromClefs = unitSize;
    if (unitSize === null) throw OMR.py.error('Exception', 'No noteheads or clefs found');
    averageNoteHeadHeight = unitSize;
  }
  rec.averageNoteHeadHeight = averageNoteHeadHeight;
  eprint('Average note head height: ' + averageNoteHeadHeight);

  const allNoteheads = noteheadsWithStems.map((notehead) => notehead.notehead);
  const allStems = noteheadsWithStems.filter((note) => note.stem !== null).map((note) => note.stem);
  const barLinesOrRests = symbols.barLines.filter((line) =>
    !line.isOverlappingWithAny(allNoteheads) && !line.isOverlappingWithAny(allStems));
  rec.barLinesOrRests = barLinesOrRests;
  const barLineBoxes = BL.detectBarLines(barLinesOrRests, averageNoteHeadHeight);
  rec.barLineBoxes = barLineBoxes;
  debug.writeBoundingBoxesAlternatingColors('bar_lines', barLineBoxes);
  eprint('Found ' + barLineBoxes.length + ' bar lines');

  debug.writeBoundingBoxes('anchor_input', symbols.staffFragments.concat(barLineBoxes, symbols.clefsKeys));
  const staffs = SD.detectStaff(debug, predictions.staff, symbols.staffFragments, symbols.clefsKeys, barLineBoxes);
  rec.staffs = staffs;
  if (staffs.length === 0) throw OMR.py.error('Exception', 'No staffs found');
  // (title detection: off)
  debug.writeBoundingBoxesAlternatingColors('staffs', staffs);

  const braceDotImg = BD.prepareBraceDotImage(predictions.symbols, predictions.staff);
  rec.braceDotImg = braceDotImg;
  debug.writeThresholdImage('brace_dot', braceDotImg);
  const braceDot = bbx.createRotatedBoundingBoxes(braceDotImg, { skipMerging: true, maxSize: [100, -1] });
  rec.braceDot = braceDot;

  const notes = ND.addNotesToStaffs(staffs, noteheadsWithStems, predictions.symbols, predictions.notehead);
  rec.notes = notes;

  const multiStaffs = BD.findBracesBracketsAndGrandStaffLines(debug, staffs, braceDot);
  rec.multiStaffs = multiStaffs;
  eprint('Found', multiStaffs.length, 'connected staffs (after merging grand staffs, multiple voices): ',
    '[' + multiStaffs.map((staff) => staff.staffs.length).join(', ') + ']');

  debug.writeAllBoundingBoxesAlternatingColors('notes', multiStaffs, notes);
  return [multiStaffs, predictions.preprocessed, debug, staffs.length];
}

// ---------------------------------------------------------------------------------------------
// comparisons

class Cmp {
  constructor(tol, rel) { this.tol = tol; this.rel = !!rel; this.n = 0; this.bad = 0; this.near = 0; this.worst = 0; this.first = ''; }
  fail(where, why) { this.bad++; if (!this.first) this.first = where + ': ' + why; }
  same(a, b, where) { this.n++; if (a !== b) this.fail(where, a + ' vs ' + b); }
  num(a, b, where) {
    this.n++;
    if (typeof a !== 'number') return this.fail(where, 'number expected, got ' + a);
    if (Number.isNaN(a) && Number.isNaN(b)) return;
    const d = Math.abs(a - b), scale = this.rel ? Math.max(1, Math.abs(a), Math.abs(b)) : 1;
    if (d / scale > this.worst) this.worst = d / scale;
    if (d <= this.tol * scale) return;
    if (d <= 1e-3 * Math.max(1, Math.abs(a), Math.abs(b))) { this.near++; return; }
    this.fail(where, a + ' vs ' + b);
  }
  get ok() { return this.bad === 0; }
  report() { return (this.n - this.bad) + '/' + this.n + ' values (max deviation ' + this.worst.toExponential(1) + (this.near ? ', ' + this.near + ' within 1e-3 only' : '') + ')' + (this.first ? ' -- ' + this.first : ''); }
}

function camelKey(k) {
  if (k.startsWith('__')) return k;
  const lead = k.startsWith('_') ? '_' : '';
  return lead + k.slice(lead.length).replace(/_([a-z0-9])/g, (m, c) => c.toUpperCase());
}
function sha12(typed) { return crypto.createHash('sha1').update(Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength)).digest('hex').slice(0, 12); }
function isEnum(v) { return v && typeof v === 'object' && typeof v.name === 'string' && v.enum; }

// a JS object graph against dump_stages' ser() output (snake_case attributes, 4 decimals)
function cmpPy(js, p, where, c) {
  if (p === null) { if (js !== null && js !== undefined) c.fail(where, 'None expected, got ' + js); return; }
  if (typeof p === 'string') {
    if (p === '<deep>') return;
    c.same(isEnum(js) ? js.name : js, p, where);
    return;
  }
  if (typeof p === 'boolean') { c.same(js, p, where); return; }
  if (typeof p === 'number') { c.num(js, p, where); return; }
  if (Array.isArray(p)) {
    if (ArrayBuffer.isView(js)) { // a small ndarray (polygon): exact
      const flat = p.flat(Infinity);
      if (flat.length !== js.length || flat.some((v, i) => v !== js[i])) c.fail(where, 'array ' + Array.from(js) + ' vs ' + flat);
      return;
    }
    if (!Array.isArray(js)) { c.fail(where, 'list expected, got ' + js); return; }
    if (js.length !== p.length) { c.fail(where, 'length ' + js.length + ' vs ' + p.length); return; }
    for (let i = 0; i < p.length; i++) cmpPy(js[i], p[i], where + '[' + i + ']', c);
    return;
  }
  if (p.__nd) {
    const n = p.__nd.reduce((a, b) => a * b, 1);
    if (!ArrayBuffer.isView(js) || js.length !== n || sha12(js) !== p.sha1) c.fail(where, 'ndarray ' + (js && js.length) + ' ' + (ArrayBuffer.isView(js) ? sha12(js) : '') + ' vs ' + n + ' ' + p.sha1);
    return;
  }
  if (p.__ref) return;
  if (js === null || js === undefined || typeof js !== 'object') { c.fail(where, 'object expected, got ' + js); return; }
  if (p.__type && js.constructor.name !== p.__type) { c.fail(where, 'type ' + js.constructor.name + ' vs ' + p.__type); return; }
  for (const k of Object.keys(p)) {
    if (k === '__type') continue;
    if (k === 'contours_len') {
      const n = js.contours ? js.contours.length / 2 : 0;
      if (n !== p[k]) c.fail(where + '.contours', 'length ' + n + ' vs ' + p[k]);
      continue;
    }
    const jk = camelKey(k);
    if (!(jk in js)) { c.fail(where + '.' + jk, 'missing'); continue; }
    cmpPy(js[jk], p[k], where + '.' + jk, c);
  }
}

// plain data (full precision dumps) against plain data
function deep(a, b, where, c) {
  if (b === null) { if (a !== null && a !== undefined) c.fail(where, 'None expected, got ' + JSON.stringify(a)); return; }
  if (typeof b === 'number') { c.num(a, b, where); return; }
  if (typeof b === 'string' || typeof b === 'boolean') { c.same(a, b, where); return; }
  if (Array.isArray(b)) {
    if (!(Array.isArray(a) || ArrayBuffer.isView(a))) { c.fail(where, 'list expected, got ' + JSON.stringify(a)); return; }
    if (a.length !== b.length) { c.fail(where, 'length ' + a.length + ' vs ' + b.length); return; }
    for (let i = 0; i < b.length; i++) deep(a[i], b[i], where + '[' + i + ']', c);
    return;
  }
  if (a === null || a === undefined || typeof a !== 'object') { c.fail(where, 'object expected, got ' + a); return; }
  for (const k of Object.keys(b)) deep(a[k], b[k], where + '.' + k, c);
}

// the summaries tools/omr/dump_staff.py writes (same keys)
const F = (x) => (x === null || x === undefined ? null : Number.isNaN(x) ? 'nan' : x);
const bx = (b) => [[b[0][0], b[0][1]], [b[1][0], b[1][1]], b[2]];
const seg = (l) => ({ id: l.debugId, frags: l.staffFragments.map((f) => bx(f.box)), min_x: l.minX, max_x: l.maxX, min_y: l.minY, max_y: l.maxY });
const anc = (a) => ({
  symbol: bx(a.symbol.box), unit_sizes: a.unitSizes, avg: a.averageUnitSize, min_y: a.minY, max_y: a.maxY,
  y_range: [a.yRange.start, a.yRange.stop], zone: [a.zone.start, a.zone.stop], lines: a.staffLines.map(seg)
});
const raw = (s) => ({
  box: bx(s.box), id: s.staffId, min_x: s.minX, max_x: s.maxX, min_y: s.minY, max_y: s.maxY,
  contours_len: s.contours.length / 2, lines: s.lines.map(seg), anchors: s.anchors.map((a) => bx(a.symbol.box))
});
const stf = (s) => ({
  grid: s.grid.map((p) => [p.x, p.y.slice(), p.angle, p.averageUnitSize]), min_x: s.minX, max_x: s.maxX,
  min_y: s.minY, max_y: s.maxY, avg: s.averageUnitSize, grand: s.isGrandstaff, n_symbols: s.symbols.length
});
const stfShort = (s) => ({
  min_x: s.minX, max_x: s.maxX, min_y: s.minY, max_y: s.maxY, avg: s.averageUnitSize, grand: s.isGrandstaff,
  n_grid: s.grid.length, n_symbols: s.symbols.length, y0: s.grid[0].y.slice(), x0: s.grid[0].x
});
const rows = (multi) => multi.map((row) => row.staffs.map(stfShort));

function check(name, js, want, tol, rel, cmp) {
  const c = new Cmp(tol, rel);
  (cmp || deep)(js, want, name, c);
  H.ok(c.ok, name + ': ' + c.report());
  return c.ok;
}

// ---------------------------------------------------------------------------------------------
// the trace of detect_staff (dump_staff.py trace_detect_staff / line_peaks / zone_trace)

// find_horizontal_lines up to filter_line_peaks (homr does not use the valid peaks)
function linePeaks(slice, unit) {
  const h = slice.h, w = slice.w, count = new Uint16Array(h + 2);
  for (let y = 0; y < h; y++) { let n = 0; for (let x = 0; x < w; x++) if (slice.data[y * w + x] > 0) n++; count[y + 1] = n; }
  if (np.std(count) === 0) return null;
  const mean = np.mean(count), std = np.std(count), norm = new Float64Array(count.length);
  for (let i = 0; i < count.length; i++) norm[i] = (count[i] - mean) / std;
  const centers = OMR.find_peaks.findPeaks(norm, { height: 0.0, distance: 0.7 * unit, prominence: 1 })[0].map((c) => c - 1);
  if (centers.length < 5) return { centers };
  const r = SD.filterLinePeaks(centers, norm.subarray(1, norm.length - 1));
  return { centers, valid: r[0], groups: r[1] };
}
function zoneTrace(image, zones, unit) {
  return zones.map((z) => {
    const sl = np.crop(image, null, null, z.start, z.stop);
    return { zone: [z.start, z.stop], unit, lines: SD.findHorizontalLines(sl, unit), peaks: linePeaks(sl, unit) };
  });
}
function traceDetectStaff(image, frags, clefs, bars) {
  const t = {};
  const clefAnchors = SD.findStaffAnchors(frags, clefs, true);
  t.clef_anchors = clefAnchors.map(anc);
  if (clefAnchors.length) t.clef_zones = zoneTrace(image, SD.initZone(clefAnchors, [image.h, image.w]), np.mean(clefAnchors.map((a) => a.averageUnitSize)));
  const possible = SD.predictOtherAnchorsFromClefs(clefAnchors, image);
  t.possible_other_clefs = possible.map((b) => bx(b.box));
  const other = SD.findStaffAnchors(frags, possible, true);
  t.other_anchors = other.map(anc);
  const barAnchors = SD.findStaffAnchors(frags, bars, false);
  t.bar_anchors = barAnchors.map(anc);
  const anchors = SD.filterUnusualAnchors(clefAnchors.concat(other, barAnchors));
  t.staff_anchors = anchors.map(anc);
  const dups = SD.findRawStaffsByConnectingLineFragments(anchors, frags);
  t.raw_with_duplicates = dups.map(raw);
  const raws = SD.removeDuplicateStaffs(dups);
  t.raw_staffs = raws.map(raw);
  const merged = SD.mergeStaffsInSameRow(raws);
  t.merged_rows = merged.map(raw);
  if (merged.length && clefAnchors.length) {
    const unit = np.mean(clefAnchors.map((a) => a.averageUnitSize));
    const width = image.w, sliceWidth = Math.max(10, Math.trunc(2 * unit));
    const zones = SD.slicesAcrossPage.map((f) => SD._pyRange(Math.trunc(f * width), Math.min(width, Math.trunc(f * width) + sliceWidth)));
    t.nc_zones = zoneTrace(image, zones, unit);
    const boxes = SD._findFiveLineGroups(image, zones, unit);
    t.nc_boxes = boxes.map((b) => bx(b.box));
    const ncAnchors = SD.filterUnusualAnchors(SD.findStaffAnchors(frags, boxes, true));
    t.nc_anchors = ncAnchors.map(anc);
    t.nc_candidates = SD.removeDuplicateStaffs(SD.findRawStaffsByConnectingLineFragments(ncAnchors, frags)).map(raw);
  }
  const without = SD.findStaffsWithoutClef(merged, clefAnchors, frags, image);
  t.staffs_without_clef = without.map(raw);
  const resampled = SD.resampleStaffs(merged.concat(without));
  t.resampled = resampled.map(stf);
  const edge = SD.filterEdgeOfVision(resampled, [image.h, image.w]);
  t.edge_kept = edge.map((s) => resampled.indexOf(s));
  const neighbor = SD.filterNeighborPage(edge);
  t.neighbor_kept = neighbor.map((s) => resampled.indexOf(s));
  const final = SD.sortStaffsTopToBottom(neighbor);
  t.final_order = final.map((s) => resampled.indexOf(s));
  return { t, clefAnchors, barAnchors, merged };
}

// ---------------------------------------------------------------------------------------------
// units (dump_staff.py bbox_variants / extrapolate_cases / repair_cases / regions)

function bboxVariants(notehead, noteheads, unitSizes) {
  const out = [];
  for (const n of noteheads.slice(0, 40)) {
    const b = [Math.trunc(n.topLeft[0]), Math.trunc(n.topLeft[1]), Math.trunc(n.bottomRight[0]), Math.trunc(n.bottomRight[1])];
    const w = b[2] - b[0], h = b[3] - b[1];
    const variants = [b, [b[0], b[1], b[2] + w, b[3]], [b[0], b[1], b[2], b[3] + 2 * h],
      [b[0] - w, b[1] - h, b[2] + w, b[3] + h], [b[0], b[1] - 3, b[2] + 2 * w, b[3] + 3]];
    for (const v of variants) for (const u of unitSizes) out.push({ bbox: v, unit: u, out: ND.checkBboxSize(v, notehead, u) });
  }
  return out;
}
function extrapolateCases(anchors) {
  const out = [];
  for (const a of anchors.slice(0, 12)) {
    const ordered = OMR.py.sorted(a.staffLines, (line) => line.staffFragments[0].center[1]);
    const unit = OMR.py.round(a.symbol.size[1] / 4);
    for (const drop of [null, 0, 4, 2]) {
      const lines = drop === null ? ordered.slice() : ordered.filter((l, i) => i !== drop);
      for (const u of [unit, Math.trunc(OMR.py.round(a.averageUnitSize))]) {
        const res = SD._extrapolateMissingStaffLine(lines, a.symbol, u);
        out.push({ anchor_symbol: bx(a.symbol.box), drop, unit: u, out: res === null ? null : res.map(seg) });
      }
    }
  }
  return out;
}
// draw_onto_image of the stage's classes (what Debug pictures show): sha1 per picture
const DRAW_COLORS = [[0, 255, 0], [0, 0, 255], [255, 0, 0], [255, 0, 255]];
function drawing(shape, clefAnchors, barAnchors, rawStaffs, noteheadsWithStems) {
  const out = {};
  for (const [name, items] of [['anchors', clefAnchors.slice(0, 6).concat(barAnchors.slice(0, 6))], ['raw_staffs', rawStaffs.slice(0, 4)],
    ['noteheads', noteheadsWithStems.slice(0, 40)]]) {
    const img = np.zeros([shape[0], shape[1], 3], 'uint8');
    items.forEach((item, i) => item.drawOntoImage(img, DRAW_COLORS[i % DRAW_COLORS.length]));
    out[name] = crypto.createHash('sha1').update(Buffer.from(img.data)).digest('hex');
  }
  return out;
}
function build(staffs, systems) {
  return systems.map((row) => new model.MultiStaff(row.map((it) => (Array.isArray(it) ? staffs[it[0]].merge(staffs[it[1]]) : staffs[it])), []));
}
function repairInfo(multi) {
  const flat = SR._flattenStaffs(multi);
  const info = { flat: flat.length };
  for (const strict of [false, true]) {
    const set = SR._possibleGrandstaffs(multi, strict), pairs = [];
    for (let i = 0; i + 1 < flat.length; i++) if (set.has(SR.pairKey(flat[i], flat[i + 1]))) pairs.push([i, i + 1]);
    if (set.size !== pairs.length) pairs.push(['unexpected pairs', set.size]);
    info[strict ? 'grandstaffs_strict' : 'grandstaffs'] = pairs;
  }
  info.vertical_gaps = flat.slice(1).map((lo, i) => F(SR._verticalGap(flat[i], lo)));
  const layout = SR._commonLayout(multi);
  info.common_layout = layout;
  info.periodic_core = SR._findPeriodicCore(flat);
  const regrouped = SR._regroupByPattern(multi);
  info.regrouped = regrouped === null ? null : rows(regrouped);
  info.unified = rows(SR._unifyGrandStaffs(multi));
  if (layout !== null) {
    info.repaired_layout = rows(SR._repairSystems(multi, layout));
    info.repair_score = SR._repairScore(multi, layout);
  }
  return info;
}
function regions(multi) {
  const r = new OMR.staff_regions.StaffRegions(multi);
  const ys = [0, -5, 1e6];
  for (const c of r.centers) ys.push(c[0] - 1, c[0], (c[0] + c[1]) / 2, c[1], c[1] + 1);
  return { centers: r.centers, queries: ys.map((y) => [y, r.getStartOfClosestStaffAbove(y), r.getStartOfClosestStaffBelow(y)]) };
}

// ---------------------------------------------------------------------------------------------

function mask(file) { return np.gt(H.readPng(file, { gray: true }), 0); }
function predictionsOf(m) {
  const h = m.staff.h, w = m.staff.w;
  return new model.InputPredictions(np.zeros([h, w, 3], 'uint8'), np.zeros([h, w], 'uint8'), m.notehead, m.symbols, m.staff, m.clefs_keys, m.stems_rest);
}
function sameMask(a, b) {
  if (!a || a.h !== b.h || a.w !== b.w) return 'shape';
  let d = 0;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) d++;
  return d;
}
const camelRec = (rec, key) => rec[camelKey(key)];

async function pagesSuite() {
  const pages = H.pages().filter((p) => H.has(p, '07-staff.json') && H.has(p, '05-filtered-staff.png'));
  if (!pages.length) { H.skip('staff parity: no 07-staff.json fixtures'); return; }
  if (pages.length < 7) H.skip('only ' + pages.length + ' pages: degenerate noteheads of later pages may differ (theRNG carries over from the missing pages)');
  OMR.cv2.resetRNG(); // a fresh Python process
  let totalMs = 0;
  for (const page of pages) {
    const m = {};
    for (const n of MASKS) m[n] = mask(H.fix(page, '05-filtered-' + n + '.png'));
    const debug = new OMR.debug.Debug(null, page + '.png', false);
    const rec = {};
    const t0 = Date.now();
    let multi;
    try { multi = detectStaffsInImage(predictionsOf(m), debug, rec)[0]; } catch (e) { H.ok(false, page + ': detect_staffs_in_image threw ' + (e && e.stack || e)); continue; }
    const repaired = SR.repairSystems(debug, multi);
    const ms = Date.now() - t0;
    totalMs += ms;

    // 07-staff.json, field by field
    const want07 = H.readJson(H.fix(page, '07-staff.json'));
    for (const key of Object.keys(want07)) check(page + ' 07 ' + key, camelRec(rec, key), want07[key], TOL4, false, cmpPy);
    // 08-repaired.json
    check(page + ' 08 multi_staffs', repaired, H.readJson(H.fix(page, '08-repaired.json')).multi_staffs, TOL4, false, cmpPy);
    // prepare_brace_dot_image == 07-brace-dot.png
    let d = sameMask(rec.braceDotImg, mask(H.fix(page, '07-brace-dot.png')));
    H.ok(d === 0, page + ' prepare_brace_dot_image == 07-brace-dot.png (' + d + ' pixels differ)');
    // make_lines_stronger(staff before it) == 05-filtered-staff.png
    if (H.has(page, '14-staff-prestrong.png')) {
      const strong = SD.makeLinesStronger(mask(H.fix(page, '14-staff-prestrong.png')), [1, 2]);
      d = sameMask(strong, m.staff);
      H.ok(d === 0 && strong.data.every((v) => v === 0 || v === 1), page + ' make_lines_stronger == 05-filtered-staff.png (' + d + ' pixels differ)');
    } else H.skip(page + ' make_lines_stronger: no 14-staff-prestrong.png (run tools/omr/dump_staff.py)');

    // detect_staff's intermediates
    if (H.has(page, '14-staff-trace.json')) {
      const want = H.readJson(H.fix(page, '14-staff-trace.json'));
      const t1 = Date.now();
      const tr = traceDetectStaff(m.staff, rec.staffFragments, rec.symbols.clefsKeys, rec.barLineBoxes);
      const t = tr.t;
      t.average_note_head_height = rec.averageNoteHeadHeight;
      // the split_clumps_of_noteheads calls add_notes_to_staffs makes (on fresh staffs)
      const fresh = SD.detectStaff(new OMR.debug.Debug(null, 'x.png', false), m.staff, rec.staffFragments, rec.symbols.clefsKeys, rec.barLineBoxes);
      t.split_clumps = [];
      for (const staff of fresh) {
        for (const chunk of rec.noteheadsWithStems) {
          if (!staff.isOnStaffZone(chunk.notehead)) continue;
          const point = staff.getAt(chunk.notehead.center[0]);
          if (point === null) continue;
          if (chunk.notehead.size[0] < 0.5 * point.averageUnitSize || chunk.notehead.size[1] < 0.5 * point.averageUnitSize) continue;
          t.split_clumps.push(ND.splitClumpsOfNoteheads(chunk, m.notehead, staff).length);
        }
      }
      t.tall_braces = BD._filterForTallElements(rec.braceDot.map(BD._trimSymbolToCoreSpan), rec.staffs).map((b) => bx(b.box));
      t.trimmed_braces = rec.braceDot.map((b) => bx(BD._trimSymbolToCoreSpan(b).box));
      for (const key of Object.keys(want)) check(page + ' trace ' + key, t[key], want[key], TOLX, true);
      console.log('  ' + page + ': trace in ' + (Date.now() - t1) + ' ms');

      if (H.has(page, '14-staff-units.json')) {
        const u = H.readJson(H.fix(page, '14-staff-units.json'));
        check(page + ' check_bbox_size', bboxVariants(m.notehead, rec.symbols.noteheads, [rec.staffs[0].averageUnitSize, 12.0, 20.0]), u.bbox, TOLX, true);
        check(page + ' _extrapolate_missing_staff_line', extrapolateCases(tr.barAnchors).concat(extrapolateCases(tr.clefAnchors)), u.extrapolate, TOLX, true);
        check(page + ' estimate_unit_size_from_clefs', SD.estimateUnitSizeFromClefs(rec.staffFragments, rec.symbols.clefsKeys), u.unit_from_clefs, TOLX, true);
        const ov = [];
        tr.clefAnchors.slice(0, 5).forEach((a, ai) => { for (let i = 0; i < 4; i++) ov.push([ai, i, a.staffLines[i].isOverlapping(a.staffLines[i + 1]), a.staffLines[i].equals(a.staffLines[i]), a.staffLines[i].equals(a.staffLines[i + 1])]); });
        check(page + ' StaffLineSegment is_overlapping / ==', ov, u.segment_overlap, 0);
        if (u.draw) check(page + ' draw_onto_image (sha1 of the pictures)', drawing([m.staff.h, m.staff.w], tr.clefAnchors, tr.barAnchors, tr.merged, rec.noteheadsWithStems), u.draw, 0);
        const psi = SD.prepareStaffImage(m.staff);
        H.ok(crypto.createHash('sha1').update(Buffer.from(psi.data)).digest('hex') === u.prepare_staff_image, page + ' prepare_staff_image (sha1)');
        let rOk = 0;
        for (const cse of u.repair) {
          if (cse.build_error) continue;
          const multiIn = build(rec.staffs, cse.systems);
          const got = { input: rows(multiIn), info: repairInfo(multiIn) };
          try { got.repaired = rows(SR.repairSystems(debug, multiIn)); } catch (e) { got.error = e.name + ': ' + e.message; }
          const want1 = { input: cse.input, info: cse.info };
          if (cse.repaired) want1.repaired = cse.repaired;
          if (check(page + ' repair_systems ' + cse.name + ' -> ' + JSON.stringify((cse.repaired || []).map((r) => r.map((s) => (s.grand ? 'G' : 'S')).join(''))), got, want1, TOLX, true)) rOk++;
          if (cse.error) H.ok(got.error === cse.error, page + ' repair ' + cse.name + ' raises ' + cse.error);
        }
        check(page + ' StaffRegions (repaired)', regions(repaired), u.regions, TOLX, true);
        check(page + ' StaffRegions (detected)', regions(multi), u.regions_raw, TOLX, true);
      }
    } else H.skip(page + ' trace: no 14-staff-trace.json (run tools/omr/dump_staff.py)');
    console.log('  ' + page + ': detect_staffs_in_image + repair_systems in ' + ms + ' ms');
  }
  console.log('  pages: ' + totalMs + ' ms in total');
}

async function edgeSuite() {
  if (!require('fs').existsSync(path.join(H.FIX, '14-staff-edge.json'))) { H.skip('edge cases: no 14-staff-edge.json (run tools/omr/dump_staff.py --edge)'); return; }
  const edge = H.readJson(path.join(H.FIX, '14-staff-edge.json'));
  for (const cse of edge.cases) {
    const m = {};
    if (cse.masks) {
      for (const n of MASKS) m[n] = mask(path.join(H.FIX, cse.masks + '-' + n + '.png'));
    } else {
      if (!H.has(cse.page, '05-filtered-staff.png')) { H.skip(cse.name + ': page missing'); continue; }
      for (const n of MASKS) m[n] = mask(H.fix(cse.page, '05-filtered-' + n + '.png'));
      for (const n of cse.edit) m[n] = np.zerosLike(m[n]);
    }
    OMR.cv2.resetRNG();
    const debug = new OMR.debug.Debug(null, 'edge.png', false);
    const rec = {};
    let err = null, multi = null;
    try { multi = detectStaffsInImage(predictionsOf(m), debug, rec)[0]; } catch (e) { err = e.message; if (!(e instanceof Error) || e.pyType !== 'Exception') err = 'not a Python Exception: ' + e; }
    H.ok(err === cse.error, 'edge ' + cse.name + ': ' + (cse.error === null ? 'no exception' : 'throws "' + cse.error + '"') + (err !== cse.error ? ' -- got ' + err : ''));
    const got = {};
    if ('average_note_head_height' in cse) got.average_note_head_height = rec.averageNoteHeadHeight;
    if ('unit_size_from_clefs' in cse) got.unit_size_from_clefs = rec.unitSizeFromClefs;
    if ('n_noteheads' in cse) got.n_noteheads = rec.noteheadsWithStems.length;
    if ('staffs' in cse) got.staffs = rec.staffs.map(stf);
    const want = {};
    for (const k of Object.keys(got)) want[k] = cse[k];
    check('edge ' + cse.name + ' values', got, want, TOLX, true);
    if (cse.error === null && multi) {
      for (const key of Object.keys(cse.stage07)) check('edge ' + cse.name + ' 07 ' + key, camelRec(rec, key), cse.stage07[key], TOL4, false, cmpPy);
      check('edge ' + cse.name + ' 08', SR.repairSystems(debug, multi), cse.repaired.multi_staffs, TOL4, false, cmpPy);
    }
  }
}

// Debug with debug=True: the write_* calls of the stage record their shapes (toDrawable)
async function debugSuite() {
  const page = H.pages().filter((p) => H.has(p, '05-filtered-staff.png'))[0];
  if (!page) return;
  const m = {};
  for (const n of MASKS) m[n] = mask(H.fix(page, '05-filtered-' + n + '.png'));
  OMR.cv2.resetRNG();
  const debug = new OMR.debug.Debug({ h: m.staff.h, w: m.staff.w, c: 3 }, page + '.png', true);
  let multi;
  try {
    multi = detectStaffsInImage(predictionsOf(m), debug, {})[0];
    SR.repairSystems(debug, multi);
  } catch (e) { H.ok(false, 'debug run threw ' + (e && e.stack || e)); return; }
  const names = debug.teasers.map((t) => t.filename.replace(/^.*_debug_\d+_/, '').replace('.png', ''));
  const want = ['notehead_with_stems', 'bar_lines', 'staff_anchors', 'raw_staffs', 'staffs', 'notes', 'systems'];
  H.ok(JSON.stringify(names) === JSON.stringify(want), 'debug pictures of the stage in homr\'s order: ' + names.join(', '));
  const kinds = new Set();
  debug.teasers.forEach((t) => t.items.forEach((it) => kinds.add(it.type)));
  H.ok(debug.teasers.every((t) => t.items.length > 0 && t.items.every((it) => it.css && it.color)) && kinds.has('text') && kinds.has('polygon') && kinds.has('polyline'),
    'debug pictures have shapes (' + Array.from(kinds).join(', ') + ')');
}

(async () => {
  await H.cv();
  await pagesSuite();
  await edgeSuite();
  await debugSuite();
  H.done();
})().catch((e) => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
