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

(async () => {
  await H.cv();
  const pages = H.pages().filter((p) => H.has(p, '22-model.json'));
  if (!pages.length) { H.skip('model parity: no 22-model.json fixtures (run tools/omr/dump_model.py)'); H.done(); return; }
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
  H.done();
})().catch((e) => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
