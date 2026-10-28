// OMR engine: homr's data model and geometry helpers (model.js, bounding_boxes.js,
// find_peaks.js, image_utils.js, point_mapping.js, constants.js) against
// tools/omr/dump_model.py's recordings (FIXTURES/<page>/22-model.json): the same objects rebuilt
// from full-precision dumps, the same method calls, results compared exactly (the few values
// that go through tan() within 1e-12 relative: JS and glibc may differ in the last bit).
const crypto = require('crypto');
const H = require('./omr/harness');
// the foundation only (later engine files may be mid-port), then bar_line_detection.js
const OMR = H.load('model.js');
require(require('path').join(H.ROOT, 'js', 'omr', 'bar_line_detection.js'));
const np = OMR.np, py = OMR.py, bbx = OMR.bounding_boxes, M = OMR.model;

function sha1(ta) { return crypto.createHash('sha1').update(Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength)).digest('hex'); }
function fl(v) { return v === 'nan' ? NaN : v; }
const eq = (a, b) => (a !== a && b !== b) || a === b;
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function close(a, b, rel) { return Math.abs(a - b) <= (rel || 1e-12) * Math.max(1, Math.abs(a), Math.abs(b)); }

// the box state dump_model.py records
function state(b) {
  const d = { type: b.constructor.name, center: [b.center[0], b.center[1]], size: [b.size[0], b.size[1]] };
  if (b instanceof bbx.BoundingBox) d.box = Array.from(b.box);
  else {
    d.box = [[b.box[0][0], b.box[0][1]], [b.box[1][0], b.box[1][1]], b.box[2]];
    d.angle = b.angle;
    d.corners = [b.topLeft, b.bottomLeft, b.topRight, b.bottomRight].map((c) => [c[0], c[1]]);
  }
  d.polygon = Array.from(b.polygon);
  d.debug_id = b.debugId;
  return d;
}
function stateDiff(js, want) {
  const a = state(js), keys = Object.keys(want);
  for (const k of keys) if (!same(a[k], want[k])) return k + ': ' + JSON.stringify(a[k]).slice(0, 120) + ' vs ' + JSON.stringify(want[k]).slice(0, 120);
  return '';
}
function fromState(s) {
  const r = s.box;
  return new bbx.RotatedBoundingBox([[r[0][0], r[0][1]], [r[1][0], r[1][1]], r[2]], new Int32Array(0), s.debug_id);
}

// ---- audit: edge cases the page fixtures never reach, each one a divergence the port once
// had (tools/omr/dump_audit.py -> FIXTURES/<page>/23-audit.json: Python's results, NaN / inf as
// strings, a call that raised as {raises: type}) ----
function dec(v) {
  if (v === 'nan') return NaN;
  if (v === 'inf') return Infinity;
  if (v === '-inf') return -Infinity;
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === 'object' && !('raises' in v)) { const o = {}; for (const k of Object.keys(v)) o[k] = dec(v[k]); return o; }
  return v;
}
// run a call like dump_audit.py's call(): its value, or {raises: Python type name}
function res(f) {
  try { return f(); } catch (e) { return { raises: e && e.name === 'cv2.error' ? 'error' : (e && e.name) || String(e) }; }
}
// deep equality with NaN == NaN (typed arrays compare as arrays)
function eqv(a, b) {
  if (ArrayBuffer.isView(a)) a = Array.from(a);
  if (ArrayBuffer.isView(b)) b = Array.from(b);
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => eqv(x, b[i]));
  if (a && typeof a === 'object' && b && typeof b === 'object') return Object.keys(b).every((k) => eqv(a[k], b[k])) && Object.keys(a).length === Object.keys(b).length;
  return (a !== a && b !== b) || a === b;
}
function audit() {
  const pages = H.pages().filter((p) => H.has(p, '23-audit.json'));
  if (!pages.length) { H.skip('audit: no 23-audit.json fixtures (run tools/omr/dump_audit.py)'); return; }
  const show = (v) => JSON.stringify(v, (k, x) => (typeof x === 'number' && !isFinite(x) ? String(x) : x)).slice(0, 100);
  let tanN = 0, tanNp = 0, tanMath = 0, v8Np = 0;
  for (const page of pages) {
    const d = H.readJson(H.fix(page, '23-audit.json'));
    const tally = {};
    const check = (group, cond, what) => {
      const t = tally[group] = tally[group] || { n: 0, bad: 0, why: [] };
      t.n++;
      if (!cond) { t.bad++; if (t.why.length < 3) t.why.push(what); }
    };
    // np.argsort tie order: numpy 2.4's x86-simd-sort incl. its std::sort fallback and NaN path
    for (const c of d.argsort) {
      const a = dec(c.a), got = np.argsortQuick(a);
      check('argsort', eqv(got, c.order), 'n=' + a.length + ' differs at ' + got.findIndex((v, i) => v !== c.order[i]));
    }
    for (const c of d.find_peaks) {
      const got = OMR.find_peaks.findPeaks(Float64Array.from(c.x), { height: c.height, distance: c.distance, prominence: c.prominence })[0];
      check('find_peaks', eqv(got, c.peaks), got.length + ' peaks vs ' + c.peaks.length);
    }
    // Python builtins: round / int raise on NaN and inf; round(x, nd); // and % on floats
    for (const [v, want] of d.round) check('py', eqv(res(() => py.round(dec(v))), dec(want)), 'round(' + v + ') ' + show(res(() => py.round(dec(v)))) + ' vs ' + show(want));
    for (const [v, want] of d.int) check('py', eqv(res(() => py.int(dec(v))), dec(want)), 'int(' + v + ') ' + show(res(() => py.int(dec(v)))) + ' vs ' + show(want));
    for (const [x, nd, pyr, npr] of d.round_nd) {
      check('py', py.round(x, nd) === pyr, 'round(' + x + ', ' + nd + ') ' + py.round(x, nd) + ' vs ' + pyr);
      check('np', np.round(x, nd) === npr, 'np.round(' + x + ', ' + nd + ') ' + np.round(x, nd) + ' vs ' + npr);
    }
    for (const [a, b, fd, md] of d.floordiv) {
      const g1 = res(() => py.floorDiv(a, b)), g2 = res(() => py.mod(a, b));
      check('py', eqv(g1, dec(fd)) && eqv(g2, dec(md)), a + ' // ' + b + ' = ' + show(g1) + ', % = ' + show(g2) + ' vs ' + show(fd) + ', ' + show(md));
    }
    // numpy: median / percentile (float32 stays float32, NaN, empty), linspace, casts, NaN masks
    for (const c of d.median) {
      const v = dec(c.v), a64 = Float64Array.from(v), a32 = Float32Array.from(v);
      const got = { median64: res(() => np.median(a64)), median32: res(() => np.median(a32)), pct64: res(() => np.percentile(a64, c.q)), pct32: res(() => np.percentile(a32, c.q)) };
      for (const k of Object.keys(got)) check('np', eqv(got[k], dec(c[k])), k + ' n=' + v.length + ' q=' + c.q + ' ' + show(got[k]) + ' vs ' + show(c[k]));
    }
    for (const [a, b, n, want] of d.linspace) check('np', eqv(np.linspace(a, b, n), want), 'linspace(' + [a, b, n] + ')');
    const vals = dec(d.casts.vals);
    for (const key of Object.keys(d.casts)) {
      if (key === 'vals') continue;
      const [dt, rest] = key.split('<'), src = rest.split(' ')[0], C = src === 'float32' ? Float32Array : Float64Array;
      const im = np.image(1, vals.length, 1, C.from(vals));
      const got = rest.endsWith('setitem') ? np.assign(np.zeros([1, vals.length], dt), 0, 1, 0, vals.length, im).data : np.astype(im, dt).data;
      const bad = Array.from(got).findIndex((v, i) => v !== d.casts[key][i]);
      check('np casts', bad < 0, key + ' at ' + vals[bad] + ': ' + got[bad] + ' vs ' + d.casts[key][bad]);
    }
    const mk = d.masks, ma = np.image(2, 4, 1, Float64Array.from(dec(mk.a).flat())), mb = np.image(2, 4, 1, Float64Array.from(dec(mk.b).flat()));
    check('np masks', np.countNonZero(ma) === mk.count_nonzero, 'count_nonzero ' + np.countNonZero(ma));
    check('np masks', eqv(np.nonzero(ma), mk.nonzero), 'nonzero ' + show(np.nonzero(ma).map((x) => Array.from(x))));
    check('np masks', eqv(np.and(ma, mb).data, mk.and.flat()) && eqv(np.or(ma, mb).data, mk.or.flat()), 'logical_and / logical_or');
    check('np masks', eqv(np.where(ma, 7, -1).data, mk.where.flat()), 'where');
    // tan: OMR.np.tan is correctly rounded; numpy (SVML) and glibc are not always
    for (const [ang, npT, crN, mT, crM] of d.tan) {
      const tn = np.tan(ang / 180 * Math.PI), tm = np.tan(ang * Math.PI / 180.0);
      check('tan', tn === crN && tm === crM, 'tan(' + ang + ' deg) ' + tn + ' vs correctly rounded ' + crN);
      tanN++; if (tn === npT) tanNp++; if (tm === mT) tanMath++; if (Math.tan(ang / 180 * Math.PI) === npT) v8Np++;
    }
    // homr functions on NaN / zero sizes: Python's min / max, int() / round() raising
    const img = np.image(10, 10, 1, Uint8Array.from({ length: 100 }, (_, i) => i));
    for (const [c, want] of d.crop) {
      const got = res(() => np.shape(OMR.image_utils.cropImage(img, ...dec(c))));
      check('homr NaN', eqv(got, want), 'crop_image(' + show(c) + ') ' + show(got) + ' vs ' + show(want));
    }
    const e = new Int32Array(0), boxes = dec(d.touch.boxes);
    for (const [i, j, want] of d.touch.pairs) {
      const got = res(() => new bbx.RotatedBoundingBox(boxes[i], e)._canShapesPossiblyTouch(new bbx.RotatedBoundingBox(boxes[j], e)));
      check('homr NaN', eqv(got, want), '_can_shapes_possibly_touch ' + i + '/' + j + ' ' + show(got) + ' vs ' + show(want));
    }
    for (const [w, h, want] of d.ensure_min_dimension) {
      const got = res(() => new bbx.RotatedBoundingBox(boxes[0], e).ensureMinDimension(dec(w), dec(h)).box[1]);
      check('homr NaN', eqv(got, dec(want)), 'ensure_min_dimension(' + w + ', ' + h + ') ' + show(got) + ' vs ' + show(want));
    }
    const sp = new M.StaffPoint(10, [10, 10, 10, 10, 10], 0);
    const pos = [[10, 12], [10, 10]].map((c) => res(() => sp.findPositionInUnitSizes(new bbx.RotatedBoundingBox([c, [4, 4], 0], e))));
    check('homr NaN', eqv(pos, d.position_zero_unit), 'find_position_in_unit_sizes with unit size 0: ' + show(pos) + ' vs ' + show(d.position_zero_unit));
    const sOk = new M.Staff([0, 10].map((x) => new M.StaffPoint(x, [10, 20, 30, 40, 50], 0)));
    const sNan = new M.Staff([NaN, 10].map((x) => new M.StaffPoint(x, [110, 120, 130, 140, 150], 0)));
    const mg = res(() => sOk.merge(sNan).grid.length);
    check('homr NaN', eqv(mg, d.staff_merge_nan), 'Staff.merge with a NaN x: ' + show(mg) + ' vs ' + show(d.staff_merge_nan));
    for (const [g, t] of Object.entries(tally)) H.ok(!t.bad, page + ' audit ' + g + ': ' + (t.n - t.bad) + '/' + t.n + ' as Python' + (t.bad ? ' -- ' + t.why.join(' | ') : ''));
  }
  // not a parity check (numpy runs SVML, Python's math glibc; neither is always correctly
  // rounded): how often the correctly rounded tan meets them bit for bit, vs V8's Math.tan
  console.log('INFO tan bit-exact: OMR.np.tan == np.tan ' + tanNp + '/' + tanN + ', == math.tan ' + tanMath + '/' + tanN + ' (Math.tan == np.tan ' + v8Np + '/' + tanN + ')');
  H.ok(tanNp >= 0.99 * tanN && tanMath >= 0.99 * tanN, 'audit: OMR.np.tan meets numpy / glibc bit for bit on >= 99% of angles');
}

// ---- fuzz: homr's foundation functions on randomized synthetic inputs the pages never produce
// (tools/omr/dump_audit_fuzz.py -> FIXTURES/<page>/24-audit-fuzz.json): zero and half-pixel box
// sizes, the angle-normalisation edges, touching / nested boxes, round() ties, negative and
// out-of-image crops, uneven staff grids, grand-staff brace candidates, find_peaks with every
// option, and the exceptions (type and text, which the SheetLab engine shows as a page's skip
// reason) and casts the port reproduces ----
function makeFuzz() {
  const pm = OMR.point_mapping;
  const dec = (v) => (v === 'nan' ? NaN : v === 'inf' ? Infinity : v === '-inf' ? -Infinity : Array.isArray(v) ? v.map(dec) : v && typeof v === 'object' && !('raises' in v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dec(x)])) : v);
  const res = (f) => { try { return f(); } catch (e) { return { raises: e && e.name === 'cv2.error' ? 'error' : (e && e.name) || String(e) }; } };
  const eqv = (a, b) => {
    if (ArrayBuffer.isView(a)) a = Array.from(a);
    if (ArrayBuffer.isView(b)) b = Array.from(b);
    if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => eqv(x, b[i]));
    if (a && typeof a === 'object' && b && typeof b === 'object') { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && kb.every((k) => eqv(a[k], b[k])); }
    if (a === undefined) a = null;
    if (b === undefined) b = null;
    return (a !== a && b !== b) || a === b;
  };
  const show = (v) => JSON.stringify(v, (k, x) => (ArrayBuffer.isView(x) ? Array.from(x) : typeof x === 'number' && !isFinite(x) ? String(x) : x)).slice(0, 160);
  const desc = (b) => {
    const d = { box: b.box, polygon: Array.from(b.polygon), center: b.center, size: b.size };
    if (b.topLeft) d.corners = [b.topLeft, b.bottomLeft, b.topRight, b.bottomRight];
    if (b.rotatedBox) d.rotated_box = b.rotatedBox;
    return d;
  };
  const contourOf = (r) => { const p = OMR.cv2.boxPoints(r), o = new Int32Array(8); for (let i = 0; i < 4; i++) { o[2 * i] = Math.trunc(p[i][0]); o[2 * i + 1] = Math.trunc(p[i][1]); } return o; };
  const e = new Int32Array(0);
  const sdesc = (s) => ({ min_x: s.minX, max_x: s.maxX, min_y: s.minY, max_y: s.maxY, unit: s.averageUnitSize, grandstaff: s.isGrandstaff,
    grid: s.grid.map((p) => [p.x, p.y, p.angle, p.averageUnitSize]), symbols: s.symbols.length });
  return function run(page, d, check) {
    // boxes
    const objs = [];
    d.boxes.forEach((rec, k) => {
      const r = dec(rec.raw), b = new bbx.RotatedBoundingBox(r, contourOf(r), k);
      objs.push(b);
      check('box', eqv(desc(b), dec(rec.desc)), k + ' desc ' + show(desc(b)) + ' vs ' + show(rec.desc));
      check('box', eqv(res(() => desc(b.ensureMinDimension(5, 3))), dec(rec.ensure_min)), k + ' ensure_min');
      [-1, 0, 3].forEach((t, j) => check('box', eqv(res(() => desc(b.makeBoxThicker(t))), dec(rec.thicker[j])), k + ' thicker ' + t));
      check('box', eqv(res(() => desc(b.makeBoxTaller(3))), dec(rec.taller)), k + ' taller');
      [3, 4, 5, -3].forEach((t, j) => check('box', eqv(res(() => desc(b.makeBoxTallerKeepCenter(t))), dec(rec.taller_keep[j])), k + ' taller_keep ' + t + ' ' + show(res(() => desc(b.makeBoxTallerKeepCenter(t)))) + ' vs ' + show(rec.taller_keep[j])));
      check('box', eqv(res(() => desc(b.moveToXHorizontalBy(-10))), dec(rec.move)), k + ' move');
      rec.extrapolated.forEach(([x, want]) => check('tan', eqv(res(() => b.getCenterExtrapolated(dec(x))), dec(want)), k + ' extrapolated ' + x + ' ' + b.getCenterExtrapolated(dec(x)) + ' vs ' + want));
      check('box', eqv(res(() => desc(b.toBoundingBox())), dec(rec.to_bb)), k + ' to_bb ' + show(res(() => desc(b.toBoundingBox()))) + ' vs ' + show(rec.to_bb));
      check('box', eqv(res(() => desc(new bbx.BoundingEllipse(r, e))), dec(rec.ellipse)), k + ' ellipse ' + show(res(() => desc(new bbx.BoundingEllipse(r, e)))) + ' vs ' + show(rec.ellipse));
      check('box', eqv(res(() => desc(new bbx.BoundingEllipse(r, e).makeBoxThicker(2))), dec(rec.ellipse_thicker)), k + ' ellipse_thicker');
      check('box', eqv(res(() => desc(new bbx.BoundingEllipse(r, e).makeBoxTaller(2))), dec(rec.ellipse_taller)), k + ' ellipse_taller');
    });
    d.pairs.forEach((p, k) => {
      const a = objs[p.i], r2 = dec(p.other), b = new bbx.RotatedBoundingBox(r2, contourOf(r2));
      const got = { touch: res(() => a._canShapesPossiblyTouch(b)), overlap: res(() => a.isOverlapping(b)), intersect: res(() => a.isIntersecting(b)),
        eq: a.equals(b), overlap_bb: res(() => a.isOverlapping(b.toBoundingBox())), ellipse_overlap: res(() => new bbx.BoundingEllipse(r2, e).isOverlapping(a)) };
      for (const key of Object.keys(got)) check('pair', eqv(got[key], dec(p[key])), k + ' ' + key + ' ' + show(got[key]) + ' vs ' + show(p[key]) + ' ' + show(a.box) + ' / ' + show(r2));
      const ex = res(() => a.isOverlappingExtrapolated(b, p.unit));
      check('tan', eqv(ex, dec(p.extrap)), k + ' extrapolated overlap ' + show(ex) + ' vs ' + show(p.extrap));
    });
    // merging
    d.merges.forEach((m, k) => {
      const bs = dec(m.raw).map((r, i) => new bbx.RotatedBoundingBox(r, contourOf(r), i));
      const groups = bbx.mergeOverlayingBoundingBoxes(bs);
      check('merge', eqv(groups.map((g) => g.map((x) => x.debugId)), m.groups), k + ' groups');
      check('merge', eqv(bbx._getBoxForWholeGroup(groups).map(desc), dec(m.boxes)), k + ' boxes');
      check('merge', eqv(res(() => bbx._getEllipseForWholeGroup(groups).map(desc)), dec(m.ellipses)), k + ' ellipses');
      check('merge', eqv(bbx._mergeGroupsRecursive(bs.map((x) => [x]), 0).map((g) => g.map((x) => x.debugId)), m.recursive), k + ' recursive');
    });
    // crops
    d.crops.forEach((c, k) => {
      const n = c.h * c.w * c.c, img = np.image(c.h, c.w, c.c, Uint8Array.from({ length: n }, (_, i) => i & 255));
      const got = res(() => { const r = OMR.image_utils.cropImageAndReturnNewTop(img, ...dec(c.cs)); return [np.shape(r[0]), r[1], np.sum(r[0].data)]; });
      check('crop', eqv(got, dec(c.res)), k + ' crop ' + show(c.cs) + ' ' + show(got) + ' vs ' + show(c.res));
    });
    // staffs
    const mapping = pm.chain(pm.undoCrop(3.5, -2.0), pm.undoResize([100, 200], [150, 240]));
    const mkStaff = (sd) => new M.Staff(sd.grid.map((g) => new M.StaffPoint(g[0], g[1], g[2])));
    d.staffs.forEach((rec, k) => {
      const want = dec(rec.staff), s = mkStaff(want);
      check('staff', eqv(sdesc(s), want), k + ' staff ' + show(sdesc(s)) + ' vs ' + show(rec.staff));
      rec.probes.forEach((p, j) => {
        const pb = new bbx.RotatedBoundingBox(dec(p.box), e), pt = dec(p.pt);
        check('staff', eqv(res(() => s.isOnStaffZone(pb)), dec(p.zone)), k + '/' + j + ' zone');
        check('staff', eqv(res(() => { const q = s.getAt(pt[0]); return q === null ? null : q.x; }), dec(p.get_at)), k + '/' + j + ' get_at');
        check('staff', eqv(res(() => s.yDistanceTo(pt)), dec(p.ydist)), k + '/' + j + ' ydist');
        check('staff', eqv(s.grid.slice(0, 2).map((q) => res(() => q.findPositionInUnitSizes(pb))), dec(p.pos)), k + '/' + j + ' pos ' + show(s.grid.slice(0, 2).map((q) => res(() => q.findPositionInUnitSizes(pb)))) + ' vs ' + show(p.pos));
      });
      [[-1, 500], [0, 10], [5, 300], [1000, -1]].forEach(([a, b], j) => check('staff', eqv(res(() => sdesc(s.extendToXRange(a, b))), dec(rec.extend[j])), k + ' extend ' + a + ',' + b));
      check('staff', eqv(res(() => sdesc(s.transformCoordinates(mapping))), dec(rec.transform)), k + ' transform ' + show(res(() => sdesc(s.transformCoordinates(mapping)))) + ' vs ' + show(rec.transform));
      check('staff', eqv(res(() => { const q = s.grid[0].transformCoordinates(mapping); return [q.x, q.y]; }), dec(rec.point_transform)), k + ' point transform');
      const lower = mkStaff(dec(rec.lower));
      const merged = res(() => sdesc(s.merge(lower)));
      check('staff', eqv(merged, dec(rec.merge)), k + ' merge ' + show(merged) + ' vs ' + show(rec.merge));
      if (rec.split !== null) {
        const sp = res(() => { const r = s.merge(lower).split(); return r === null ? null : r.map(sdesc); });
        check('staff', eqv(sp, dec(rec.split)), k + ' split');
      }
    });
    // grand staffs
    d.grands.forEach((g, k) => {
      let ss = dec(g.staffs).map((grid) => new M.Staff(grid.map((q) => new M.StaffPoint(q[0], q[1], q[2]))));
      if (g.reversed) ss = ss.slice().reverse();
      const ms = new M.MultiStaff(ss, []), bs = dec(g.braces).map((b) => new bbx.RotatedBoundingBox(b, e));
      const scores = bs.map((b) => ms.staffs.slice(0, -1).map((_, i) => res(() => ms._scoreBraceWithStaffPair(b, ms.staffs[i], ms.staffs[i + 1], i > 0 ? ms.staffs[i - 1] : null, i + 2 < ms.staffs.length ? ms.staffs[i + 2] : null))));
      check('grand', eqv(scores, dec(g.scores)), k + ' scores ' + show(scores) + ' vs ' + show(g.scores));
      check('grand', eqv(res(() => ms._selectGrandstaffs(bs).map((p) => [p.pairIndex, p.score])), dec(g.pairs)), k + ' pairs');
      { const gr = res(() => ms.createGrandstaffs(bs).staffs.map(sdesc)); check('grand', eqv(gr, dec(g.result)), k + ' result ' + show(gr) + ' vs ' + show(g.result)); }
    });
    // find_peaks
    d.peaks.forEach((p, k) => {
      const o = {}; for (const [kk, v] of Object.entries(p.opts)) if (v !== null) o[kk] = v;
      const got = res(() => OMR.find_peaks.findPeaks(Float64Array.from(p.x), o)[0]);
      check('peaks', eqv(got, dec(p.peaks)), k + ' n=' + p.x.length + ' ' + show(p.opts) + ' ' + show(got) + ' vs ' + show(p.peaks));
    });
    // constants and bar lines
    const C = OMR.constants;
    d.constants.forEach(([u, ...want]) => {
      const got = [C.toleranceForTouchingClefs(u), C.toleranceForStaffLineDetection(u), C.maxLineGapSize(u), C.barLineMaxWidth(u), C.barLineMinHeight(u)];
      check('constants', eqv(got, want), 'unit ' + u + ' ' + show(got) + ' vs ' + show(want));
    });
    const bl = dec(d.bar_lines.raw).map((r, i) => new bbx.RotatedBoundingBox(r, e, i));
    check('constants', eqv(OMR.bar_line_detection.detectBarLines(bl, d.bar_lines.unit).map((b) => b.debugId), d.bar_lines.kept), 'detect_bar_lines');
    if (d.errors) errors(dec(d.errors), check);
    // fitEllipse's jitter path (cv::theRNG, GCC's argument order) on degenerate sets, fresh RNG each
    for (const [k, f] of (d.fit_ellipse || []).entries()) {
      const a = f.dt === 'float32' ? Float32Array.from(f.pts) : Int32Array.from(f.pts);
      OMR.cv2.setRNGSeed(0);
      const got = res(() => OMR.cv2.fitEllipse(a));
      check('fitEllipse', eqv(got, dec(f.box)), k + ' n=' + a.length / 2 + ' ' + show(got) + ' vs ' + show(f.box));
    }
    OMR.cv2.resetRNG();
  };
  // exceptions with Python's type AND text (str(exc) is what the SheetLab engine shows), casts
  function errors(d, check) {
    const cv2 = OMR.cv2;
    const resm = (f) => { try { return f(); } catch (x) { return { raises: x && x.name === 'cv2.error' ? 'error' : (x && x.name) || String(x), msg: x && x.message }; } };
    const cmp = (g, got, want, what) => check(g, eqv(got, want), what + ' ' + show(got) + ' vs ' + show(want));
    const p64 = Float64Array.from([1, 2, 3, 4, 5, 1, 2, 7, 4, 4]), q = Int32Array.from([0, 0, 1, 0, 0, 1]), f32 = Float32Array.from([1, 2, 3, 4, 5, 1]);
    const z9 = () => np.zeros([9, 9], 'uint8');
    const got = {
      minAreaRect: resm(() => cv2.minAreaRect(p64)), boundingRect: resm(() => cv2.boundingRect(p64)), contourArea: resm(() => cv2.contourArea(p64)),
      convexHull: resm(() => cv2.convexHull(p64)), pointPolygonTest: resm(() => cv2.pointPolygonTest(p64, [1, 2], false)),
      fitEllipse5: resm(() => cv2.fitEllipse(p64)), fitEllipse6: resm(() => cv2.fitEllipse(Float64Array.from([...p64, 9, 9]))),
      fitEllipse4: resm(() => cv2.fitEllipse(Int32Array.from([0, 0, 1, 0, 1, 1, 0, 1]))),
      icc1: resm(() => cv2.intersectConvexConvex(p64, Float32Array.from(p64))), icc2: resm(() => cv2.intersectConvexConvex(Float32Array.from(p64), p64)),
      gat_int: resm(() => cv2.getAffineTransform(q, Float32Array.from(q))), gat_f64: resm(() => cv2.getAffineTransform(Float32Array.from(q), Float64Array.from(q))),
      gat_line: resm(() => cv2.getAffineTransform(Float32Array.from([0, 0, 1, 0, 2, 0]), Float32Array.from(q))),
      fillPoly_f32: resm(() => cv2.fillPoly(z9(), [f32], 255)), fillPoly_empty: resm(() => cv2.fillPoly(z9(), [new Int32Array(0)], 255)),
      fillConvexPoly_f32: resm(() => cv2.fillConvexPoly(z9(), f32, 255)), drawContours_f32: resm(() => cv2.drawContours(z9(), [f32], -1, 255, 1)),
      findNonZero_3ch: resm(() => cv2.findNonZero(np.zeros([3, 3, 3], 'uint8'))),
      addWeighted_shape: resm(() => cv2.addWeighted(np.zeros([2, 6], 'uint8'), 0.5, np.zeros([3, 4], 'uint8'), 0.5, 0)),
      resize_empty: resm(() => cv2.resize(np.zeros([0, 5], 'uint8'), [3, 3])),
      warpAffine_neg: [[-1, 3], [2, -3], [-2, -2], [0, 3]].map((ds) => resm(() => np.shape(cv2.warpAffine(np.zeros([4, 5], 'uint8'), [[1, 0, 0], [0, 1, 0]], ds))))
    };
    for (const k of Object.keys(d.cv)) cmp('errors', got[k], d.cv[k], 'cv2.' + k);
    const npGot = {
      max_empty: resm(() => np.max(new Float64Array(0))), min_empty: resm(() => np.min(new Float64Array(0))),
      argmax_empty: resm(() => np.argmax(new Float64Array(0))), argmin_empty: resm(() => np.argmin(new Float64Array(0))),
      concat_empty: resm(() => np.concat([])), slice_float: resm(() => np.shape(np.crop(np.zeros([3, 3]), 0, 1.5, 0, 2))),
      slice_float2: { raises: 'TypeError', msg: 'slice indices must be integers or None or have an __index__ method' } // 2.0 is 2 in JS
    };
    for (const k of Object.keys(d.np)) cmp('errors', npGot[k], d.np[k], 'np.' + k);
    for (const [key, want] of Object.entries(d.setitem)) {
      const parts = key.split(' '), isFull = parts[0] === 'full', dt = isFull ? parts[1] : parts[0], v = dec(parts[isFull ? 2 : 1]) === parts[isFull ? 2 : 1] ? Number(parts[isFull ? 2 : 1]) : dec(parts[isFull ? 2 : 1]);
      // np.full of a float with an integer value (1e10): numpy casts a Python float but checks a
      // Python int's bounds; a JS number cannot tell them apart and is taken as an int
      if (isFull && Number.isInteger(v) && /[.e]/.test(parts[2])) continue;
      const g = isFull ? resm(() => Array.from(np.full([1, 2], v, dt).data)) : resm(() => Array.from(np.assign(np.zeros([2, 3], dt), 0, 2, 1, 3, v).data));
      cmp('errors', g, want, key);
    }
    const Mm = OMR.model, ee = new Int32Array(0);
    const homrGot = {
      staff_empty: resm(() => new Mm.Staff([])),
      merge_far: resm(() => new Mm.StaffPoint(1.0, [1, 2, 3, 4, 5], 0).merge(new Mm.StaffPoint(2.0, [1, 2, 3, 4, 5], 0))),
      staff_point_4: resm(() => new Mm.StaffPoint(1.0, [1, 2, 3, 4], 0)),
      undo_resize_zero: resm(() => OMR.point_mapping.undoResize([10, 0], [5, 5])),
      position_no_lines: resm(() => new Mm.StaffPoint(1.0, [], 0).findPositionInUnitSizes(new bbx.RotatedBoundingBox([[1, 2], [3, 3], 0], ee)))
    };
    for (const k of Object.keys(d.homr)) cmp('errors', homrGot[k], d.homr[k], 'homr ' + k);
    const img = np.image(6, 8, 1, Uint8Array.from({ length: 48 }, (_, i) => i)), R = OMR.pil.resize;
    const pilGot = {
      zero_w: resm(() => np.shape(R(img, [0, 3]))), zero_h: resm(() => np.shape(R(img, [3, 0]))),
      box_neg: resm(() => np.shape(R(img, [3, 3], { box: [-1, 0, 4, 4] }))), box_big: resm(() => np.shape(R(img, [3, 3], { box: [0, 0, 9, 4] }))),
      box_empty: resm(() => np.shape(R(img, [3, 3], { box: [4, 0, 2, 4] }))),
      box_crop: resm(() => Array.from(R(img, [3, 2], { box: [2, 1, 5, 3] }).data)), box_frac: resm(() => Array.from(R(img, [3, 2], { box: [2.5, 1, 5.5, 3] }).data))
    };
    for (const k of Object.keys(d.pil)) cmp('errors', pilGot[k], d.pil[k], 'PIL ' + k);
    for (const [n, dir, base, files] of d.debug) {
      const dbg = new OMR.debug.Debug(null, n, true);
      cmp('errors', [dbg.dirName, dbg.baseFilename, [0, 1, 2].map(() => dbg._debugFileName('x'))], [dir, base, files], 'Debug(' + n + ')');
    }
    if (d.repr) {
      for (const [v, r, sg] of d.repr) cmp('repr', py.floatRepr(v === 0 && sg === '-' ? -0 : v), r, 'repr(' + v + ')');
      const st = d.str;
      cmp('repr', String(new bbx.RotatedBoundingBox(st.box_raw, ee)), st.box, 'str(box)');
      cmp('repr', String(new Mm.StaffPoint(10.0, [1.0, 2.5, 1e16, 4.0, 5.0], 0.0)), st.point, 'str(StaffPoint)');
      cmp('repr', String(new Mm.GrandStaffPair([2, 3], 0.1 + 0.2)), st.pair, 'str(GrandStaffPair)');
    }
  }
}

function fuzz() {
  const pages = H.pages().filter((p) => H.has(p, '24-audit-fuzz.json'));
  if (!pages.length) { H.skip('fuzz: no 24-audit-fuzz.json fixtures (run tools/omr/dump_audit_fuzz.py)'); return; }
  const run = makeFuzz();
  for (const page of pages) {
    const tally = {};
    const check = (g, cond, what) => { const t = tally[g] = tally[g] || { n: 0, bad: 0, why: [] }; t.n++; if (!cond) { t.bad++; if (t.why.length < 4) t.why.push(what); } };
    run(page, H.readJson(H.fix(page, '24-audit-fuzz.json')), check);
    for (const [g, t] of Object.entries(tally)) H.ok(!t.bad, page + ' fuzz ' + g + ': ' + (t.n - t.bad) + '/' + t.n + ' as Python' + (t.bad ? ' -- ' + t.why.join(' | ') : ''));
  }
}

(async () => {
  await H.cv();
  const pages = H.pages().filter((p) => H.has(p, '22-model.json'));
  if (!pages.length) { H.skip('model parity: no 22-model.json fixtures (run tools/omr/dump_model.py)'); audit(); fuzz(); H.done(); return; }
  for (const page of pages) {
    const doc = H.readJson(H.fix(page, '22-model.json'));
    const tally = {};
    const check = (group, cond, what) => {
      const t = tally[group] = tally[group] || { n: 0, bad: 0, why: [] };
      t.n++;
      if (!cond) { t.bad++; if (t.why.length < 3) t.why.push(what); }
    };

    // constants
    const camel = (s) => s.replace(/_([a-z])/g, (m, c) => c.toUpperCase());
    for (const [name, rows] of Object.entries(doc.constants)) {
      for (const [u, v] of rows) check('constants', OMR.constants[camel(name)](u) === v, name + '(' + u + ') ' + OMR.constants[camel(name)](u) + ' vs ' + v);
    }

    // find_peaks, on the signals detect_staff fed it
    for (const c of doc.peaks) {
      const r = OMR.find_peaks.findPeaks(c.x, { height: c.height, distance: c.distance, prominence: c.prominence });
      check('find_peaks', same(r[0], c.peaks), 'peaks ' + JSON.stringify(r[0]).slice(0, 80) + ' vs ' + JSON.stringify(c.peaks).slice(0, 80));
    }

    // numpy's default argsort (x86-simd-sort on AVX-512), whose tie order find_peaks depends on
    for (const a of doc.argsort || []) {
      const r = np.argsortQuick(a.x);
      check('np.argsort', same(r, a.idx), 'n=' + a.x.length + ' ' + JSON.stringify(r).slice(0, 60));
    }

    // boxes and their methods
    const resized = H.readPng(H.fix(page, '02-resized.png'));
    const plane0 = np.channel(resized, 0);
    const objs = [];
    for (const b of doc.boxes) {
      const c = Int32Array.from(b.contour), r = b.rect;
      const o = b.kind === 'rot' ? new bbx.RotatedBoundingBox(r, c, b.i) : new bbx.BoundingEllipse(r, c, b.i);
      objs.push(o);
      let d = stateDiff(o, b.state);
      check('box construct', !d, b.mask + '#' + b.i + ' ' + d);
      const res = b.res;
      d = stateDiff(o.makeBoxThicker(3), res.thicker); check('box methods', !d, 'thicker ' + d);
      d = stateDiff(o.makeBoxTaller(4), res.taller); check('box methods', !d, 'taller ' + d);
      if (b.kind !== 'rot') continue;
      check('box methods', o.makeBoxThicker(0) === o && !stateDiff(o.makeBoxThicker(0), res.thicker0), 'thicker0');
      d = stateDiff(o.ensureMinDimension(3, 9), res.min_dim); check('box methods', !d, 'min_dim ' + d);
      d = stateDiff(o.makeBoxTallerKeepCenter(5), res.taller_center); check('box methods', !d, 'taller_center ' + d);
      d = stateDiff(o.makeBoxTallerKeepCenter(7.5), res.taller_center_odd); check('box methods', !d, 'taller_center_odd ' + d);
      d = stateDiff(o.moveToXHorizontalBy(7), res.move_x); check('box methods', !d, 'move_x ' + d);
      for (const [x, y] of res.extrapolated) check('box tan()', close(o.getCenterExtrapolated(x), y), 'extrapolated ' + o.getCenterExtrapolated(x) + ' vs ' + y);
      const bb = o.toBoundingBox();
      d = stateDiff(bb, res.to_bb); check('box methods', !d, 'to_bb ' + d);
      check('box methods', same(bb.rotatedBox, res.to_bb_rotated), 'rotated_box ' + JSON.stringify(bb.rotatedBox) + ' vs ' + JSON.stringify(res.to_bb_rotated));
      const crop = bb.extract(resized);
      check('box methods', same(np.shape(crop), res.extract[0]) && sha1(crop.data) === res.extract[1], 'extract ' + np.shape(crop));
      d = stateDiff(bb.increaseSizeInEachDimension(3, np.shape(resized)), res.increase); check('box methods', !d, 'increase ' + d);
      if (res.blank) check('box methods', sha1(bb.blankEverythingOutsideOfBox(plane0).data) === res.blank, 'blank_everything_outside_of_box');
    }
    for (const p of doc.pairs) {
      const a = objs[p.a], b = objs[p.b];
      check('box pairs', a.isOverlapping(b) === p.overlap, p.a + '/' + p.b + ' is_overlapping');
      check('box pairs', a._canShapesPossiblyTouch(b) === p.touch, p.a + '/' + p.b + ' touch');
      check('box pairs', a.equals(b) === p.eq, p.a + '/' + p.b + ' ==');
      if (p.intersect !== undefined) {
        check('box pairs', a.isIntersecting(b) === p.intersect, p.a + '/' + p.b + ' is_intersecting');
        const ex = [doc.unit_size, 2.0, 40.0].map((u) => a.isOverlappingExtrapolated(b, u));
        check('box pairs', same(ex, p.extrap), p.a + '/' + p.b + ' is_overlapping_extrapolated ' + ex + ' vs ' + p.extrap);
      }
      if (p.overlap_bb !== null) check('box pairs', a.isOverlapping(b.toBoundingBox()) === p.overlap_bb, p.a + '/' + p.b + ' overlap BoundingBox');
    }

    // merging
    const rot = objs.filter((o) => o instanceof bbx.RotatedBoundingBox);
    const groups = bbx.mergeOverlayingBoundingBoxes(rot).map((g) => g.map((x) => rot.indexOf(x)));
    check('merge', same(groups, doc.merge.optimized), 'merge_overlaying_bounding_boxes');
    const thick = rot.map((o) => o.makeBoxThicker(9));
    check('merge', same(bbx.mergeOverlayingBoundingBoxes(thick).map((g) => g.map((x) => thick.indexOf(x))), doc.merge.thick), 'merge thick');
    check('merge', same(bbx._mergeGroupsRecursive(thick.map((x) => [x]), 0).map((g) => g.map((x) => thick.indexOf(x))), doc.merge.recursive), 'merge recursive');
    const uf = new bbx.UnionFind(12);
    for (const [a, b] of [[0, 1], [2, 3], [1, 3], [5, 6], [7, 5], [9, 9], [10, 11], [11, 4]]) uf.union(a, b);
    const ufr = { parent: uf.parent.slice(), rank: uf.rank.slice() };
    ufr.find = py.range(12).map((i) => uf.find(i));
    check('merge', same(ufr, doc.union_find), 'UnionFind ' + JSON.stringify(ufr));

    // staffs
    const mapping = (p) => [p[0] * 1.37 + 5.25, p[1] * 0.71 - 2.5];
    const mkStaff = (s) => new M.Staff(s.grid.map((g) => new M.StaffPoint(g[0], g[1], g[2])));
    const staffs = doc.staffs.map(mkStaff);
    const items = objs.slice(0, 80);
    doc.staffs.forEach((sd, k) => {
      const s = staffs[k], st = sd.state;
      const got = { min_x: s.minX, max_x: s.maxX, min_y: s.minY, max_y: s.maxY, average_unit_size: s.averageUnitSize, y_tolerance: s._yTolerance, point_units: s.grid.map((p) => p.averageUnitSize) };
      check('staff', same(got, st), 'state ' + JSON.stringify(got).slice(0, 160));
      for (const [x, idx] of sd.get_at) { const p = s.getAt(x); check('staff', (p === null ? null : s.grid.indexOf(p)) === idx, 'get_at ' + x); }
      for (const [x, y, v] of sd.y_distance) check('staff', s.yDistanceTo([x, y]) === v, 'y_distance_to ' + x + ',' + y + ' ' + s.yDistanceTo([x, y]) + ' vs ' + v);
      check('staff', same(items.map((o) => s.isOnStaffZone(o)), sd.on_zone), 'is_on_staff_zone');
      const pos = items.map((o) => { const p = s.getAt(o.center[0]); return p === null ? null : p.findPositionInUnitSizes(o); });
      check('staff', same(pos, sd.positions), 'find_position_in_unit_sizes ' + JSON.stringify(pos).slice(0, 80));
      const ext = s.extendToXRange(py.int(s.minX) - 33, py.int(s.maxX) + 21);
      const ge = [ext.grid[0], ext.grid[ext.grid.length - 1]].map((p) => [p.x, p.y]).concat([ext.grid.length]);
      check('staff', same(ge, sd.extend), 'extend_to_x_range');
      check('staff', s.extendToXRange(-1, py.int(s.maxX) - 5).grid.length === sd.extend_none, 'extend_to_x_range (no change)');
      const t = s.transformCoordinates(mapping);
      const gt = t.grid.slice(0, 6).map((p) => [p.x, p.y, p.averageUnitSize]).concat([t.averageUnitSize, t.minY]);
      check('staff', same(gt, sd.transform), 'transform_coordinates ' + JSON.stringify(gt[0]).slice(0, 100) + ' vs ' + JSON.stringify(sd.transform[0]).slice(0, 100));
      const d = stateDiff(s.grid[Math.floor(s.grid.length / 2)].toBoundingBox(), sd.point_bb);
      check('staff', !d, 'StaffPoint.to_bounding_box ' + d);
    });
    doc.staff_merges.forEach((mg) => {
      const k = mg.a, a = staffs[k], b = staffs[k + 1];
      for (const sym of items.slice(0, 6)) {
        a.addSymbol(k % 2 ? new M.Note(sym, 3, null, null) : new M.Clef(sym instanceof bbx.RotatedBoundingBox ? sym.toBoundingBox() : new bbx.BoundingBox([1, 2, 30, 40], new Float64Array(0))));
      }
      const m = a.merge(b), sp = m.split();
      const got = { grid: m.grid.slice(0, 5).map((p) => [p.x, p.y, p.angle]).concat([m.grid.length]), unit: m.averageUnitSize, grand: m.isGrandstaff, nsym: m.symbols.length,
        split: sp === null ? null : [[sp[0].grid.length, sp[1].grid.length], [sp[0].symbols.length, sp[1].symbols.length], sp[0].averageUnitSize, sp[1].averageUnitSize] };
      const want = { grid: mg.grid, unit: mg.unit, grand: mg.grand, nsym: mg.nsym, split: mg.split };
      check('staff merge/split', same(got, want), 'merge ' + k + ' ' + JSON.stringify(got).slice(0, 160));
    });

    // multi staffs
    const fresh = doc.staffs.map(mkStaff);
    const blb = doc.bar_line_boxes.map(fromState);
    const braceDot = doc.brace_dot.map((b) => fromState(b.state));
    const ms = new M.MultiStaff(fresh.slice().reverse(), blb.slice(0, 3));
    const mo = doc.multi;
    check('multi', same(ms.staffs.map((s) => fresh.indexOf(s)), mo.order), 'sorted by min_y');
    const scores = [];
    for (let i = 0; i < ms.staffs.length - 1; i++) {
      const above = i > 0 ? ms.staffs[i - 1] : null, below = i + 2 < ms.staffs.length ? ms.staffs[i + 2] : null;
      scores.push(braceDot.map((b) => ms._scoreBraceWithStaffPair(b, ms.staffs[i], ms.staffs[i + 1], above, below)));
      scores.push(braceDot.map((b) => ms._scoreBraceWithStaffPair(b, ms.staffs[i], ms.staffs[i + 1], null, null)));
    }
    check('multi', same(scores, mo.scores), '_score_brace_with_staff_pair');
    if (mo.selected) {
      const sel = ms._selectGrandstaffs(braceDot).map((p) => [p.getIndex(), p.getScore()]);
      check('multi', same(sel, mo.selected), '_select_grandstaffs ' + JSON.stringify(sel));
      const g = ms.createGrandstaffs(braceDot).staffs.map((s) => [s.minY, s.maxY, s.isGrandstaff, s.grid.length]);
      check('multi', same(g, mo.grand), 'create_grandstaffs ' + JSON.stringify(g).slice(0, 120));
    }
    check('multi', same(ms.breakApart().map((x) => x.staffs.length), mo.break_apart), 'break_apart');
    const mm = ms.merge(new M.MultiStaff(fresh.slice(0, 2), blb.slice(1, 4)));
    check('multi', same([mm.staffs.length, mm.connections.length, mm.staffs.map((s) => fresh.indexOf(s))], mo.merge), 'merge');

    // debug: the teaser picture (draw_onto_image of each drawable in the debug colours) and
    // the shapes writeTeaser records for the UI instead
    if (doc.teaser) {
      const objs13 = [ms].concat(objs.slice(0, 12), [new M.Note(objs[0], 4, objs[1] instanceof bbx.RotatedBoundingBox ? objs[1] : null, M.StemDirection.DOWN)]);
      const pic = OMR.debug.drawTeaser(resized, objs13);
      check('debug', sha1(pic.data) === doc.teaser.sha1, 'teaser picture differs');
      const dbg = new OMR.debug.Debug(resized, page + '.png', false);
      const t = dbg.writeTeaser('x_teaser.png', objs13);
      const want = objs13.reduce((n, o) => n + o.toDrawable([0, 0, 0]).length, 0);
      check('debug', t.items.length === want && t.width === resized.w && dbg.teasers.length === 1 && t.items[0].css === 'rgb(0,255,0)', 'writeTeaser records ' + t.items.length + ' shapes');
    }

    // image_utils, point_mapping
    for (const [coords, shape, sha, top] of doc.crops) {
      const r = OMR.image_utils.cropImageAndReturnNewTop(resized, coords[0], coords[1], coords[2], coords[3]);
      check('image_utils', same(np.shape(r[0]), shape) && sha1(r[0].data) === sha && same(r[1], top), 'crop ' + coords + ' -> ' + np.shape(r[0]) + ' ' + r[1]);
    }
    const pm = OMR.point_mapping, toInput = pm.chain(pm.undoResize([3301, 2550, 3], [2485, 1920]), pm.undoCrop(17, -4));
    for (const [x, y, want] of doc.mapping) check('point_mapping', same(toInput([x, y]), want), 'chain ' + toInput([x, y]) + ' vs ' + want);

    // symbols
    for (const s of doc.symbols) {
      const o = objs[s.i], bb = o.toBoundingBox();
      const n = new M.Note(o, 5, o, M.StemDirection.UP);
      const tr = [n, new M.Rest(bb), new M.Clef(bb), new M.Accidental(bb, 2), new M.BarLine(o)].map((x) => x.transformCoordinates(mapping));
      check('symbols', same(tr.map((t) => t.center), s.centers), 'transform_coordinates');
      check('symbols', same([String(n), String(new M.Rest(bb)), String(new M.BarLine(o))], s.str), 'str ' + String(n) + ' vs ' + s.str[0]);
    }

    for (const [g, t] of Object.entries(tally)) H.ok(!t.bad, page + ' ' + g + ': ' + (t.n - t.bad) + '/' + t.n + ' exact' + (t.bad ? ' -- ' + t.why.join(' | ') : ''));
  }
  audit();
  fuzz();
  H.done();
})().catch((e) => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
