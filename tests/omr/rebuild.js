// soundLAB OMR tests: the Python dumps' JSON -> homr model objects (OMR.model), for the
// suites that start a stage from a recorded state instead of re-running the earlier stages.
//
// Input: tools/omr/dump_read.py's 40-read-staffs.json (full float precision; NaN / inf as the
// strings 'nan' / 'inf' / '-inf'): {multi_staffs: [{staffs: [{grid: [{x, y, angle, ...}],
// is_grandstaff, symbols: [...]}], connections: [box_state]}]}. A box_state carries the box as
// homr holds it (the normalised rect, centre, size, angle, corners, polygon, contours, debug
// id): the boxes are rebuilt with their constructors and then given the recorded polygon and
// contours, so nothing is re-derived from a different input than in Python.
'use strict';

function num(v) {
  if (v === 'nan') return NaN;
  if (v === 'inf') return Infinity;
  if (v === '-inf') return -Infinity;
  return v;
}
function nums(a) { return a.map(num); }

function typedOf(values, dtype) {
  if (values === null || values === undefined) return null;
  if (dtype === 'int32' || dtype === 'intc') return Int32Array.from(values);
  if (dtype === 'int64') return Int32Array.from(values); // homr's polygons: astype(int64) of small ints
  if (dtype === 'float32') return Float32Array.from(values);
  return Float64Array.from(values);
}

// box_state -> RotatedBoundingBox | BoundingEllipse | BoundingBox (null stays null)
function box(OMR, s) {
  if (s === null || s === undefined) return null;
  const bbx = OMR.bounding_boxes;
  const contours = typedOf(s.contours, s.contours_dtype) || new Int32Array(0);
  let b;
  if (s.type === 'BoundingBox') {
    b = new bbx.BoundingBox(nums(s.box), contours, s.debug_id);
    return b;
  }
  const r = s.box;
  const rect = [[num(r[0][0]), num(r[0][1])], [num(r[1][0]), num(r[1][1])], num(r[2])];
  if (s.type === 'RotatedBoundingBox') b = new bbx.RotatedBoundingBox(rect, contours, s.debug_id);
  else if (s.type === 'BoundingEllipse') b = new bbx.BoundingEllipse(rect, contours, s.debug_id);
  else throw new Error('rebuild: unknown box type ' + s.type);
  if (s.polygon) b.polygon = typedOf(s.polygon, s.polygon_dtype);
  return b;
}

function symbol(OMR, s) {
  const M = OMR.model;
  let sym;
  if (s.type === 'Note') {
    const dir = s.stem_direction === null || s.stem_direction === undefined ? null : M.StemDirection[s.stem_direction];
    sym = new M.Note(box(OMR, s.box), s.position, box(OMR, s.stem), dir);
    sym.hasDot = !!s.has_dot;
    sym.circleOfFifth = s.circle_of_fifth;
    sym.beams = (s.beams || []).map((b) => box(OMR, b));
    sym.flags = (s.flags || []).map((b) => box(OMR, b));
  } else if (s.type === 'Accidental') {
    sym = new M.Accidental(box(OMR, s.box), s.position);
  } else if (s.type === 'Rest') {
    sym = new M.Rest(box(OMR, s.box));
    sym.hasDot = !!s.has_dot;
  } else if (s.type === 'BarLine') {
    sym = new M.BarLine(box(OMR, s.box));
  } else if (s.type === 'Clef') {
    sym = new M.Clef(box(OMR, s.box));
  } else throw new Error('rebuild: unknown symbol type ' + s.type);
  sym.center = nums(s.center); // the symbol's own centre (a transformed copy keeps its box)
  return sym;
}

function staffPoint(OMR, p) {
  return new OMR.model.StaffPoint(num(p.x), nums(p.y), num(p.angle));
}

// staff_state -> Staff (grid, symbols, is_grandstaff)
function staff(OMR, s) {
  const st = new OMR.model.Staff(s.grid.map((p) => staffPoint(OMR, p)));
  st.isGrandstaff = !!s.is_grandstaff;
  st.symbols = (s.symbols || []).map((x) => symbol(OMR, x));
  return st;
}

function multiStaff(OMR, m) {
  return new OMR.model.MultiStaff(m.staffs.map((s) => staff(OMR, s)), (m.connections || []).map((c) => box(OMR, c)));
}

// 40-read-staffs.json -> MultiStaff[]
function multiStaffs(OMR, doc) {
  return doc.multi_staffs.map((m) => multiStaff(OMR, m));
}

// the derived values of a rebuilt staff vs the dump (they must come out identical)
function staffDiff(st, s) {
  const pairs = [['minX', 'min_x'], ['maxX', 'max_x'], ['minY', 'min_y'], ['maxY', 'max_y'], ['averageUnitSize', 'average_unit_size']];
  for (const [js, py] of pairs) {
    const a = st[js], b = num(s[py]);
    if (!(a === b || (a !== a && b !== b))) return js + ' ' + a + ' vs ' + b;
  }
  for (let i = 0; i < s.grid.length; i++) {
    const a = st.grid[i].averageUnitSize, b = num(s.grid[i].average_unit_size);
    if (!(a === b || (a !== a && b !== b))) return 'grid[' + i + '].averageUnitSize ' + a + ' vs ' + b;
  }
  return '';
}

module.exports = { num, nums, box, symbol, staffPoint, staff, multiStaff, multiStaffs, staffDiff };
