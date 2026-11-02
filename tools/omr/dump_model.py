"""Reference dump of homr's data model for the JS port (js/omr/model.js, bounding_boxes.js,
find_peaks.js, image_utils.js, point_mapping.js, constants.js; tests/omr-model.test.js).

usage: python -I tools/omr/dump_model.py FIXTURES [page ...]

Rebuilds each page's symbols and staffs with homr itself from the 05-filtered-* masks (no
models needed: predict_symbols -> break_wide_fragments -> combine_noteheads_with_stems ->
detect_bar_lines -> detect_staff, brace/dot boxes) and records inputs and outputs of the model
methods in FIXTURES/<page>/22-model.json with full float precision (floats as repr), so the JS
test can rebuild the same objects and call the same methods:
  constants      every unit-size function at a few unit sizes
  peaks          every find_peaks call detect_staff makes (input signal, kwargs, peaks)
  boxes          rotated rects / ellipses (raw cv2 rect + contour) and their methods
  merge          merge_overlaying_bounding_boxes / _merge_groups_recursive group sizes
  points/staffs  StaffPoint / Staff methods on the detected staffs
  multi          MultiStaff brace scoring, grandstaff selection, merge, break_apart
  crops          image_utils.crop_image_and_return_new_top on the resized page
  symbols        Note / Rest / Clef / Accidental / BarLine construction + transform
"""
import hashlib
import json
import math
import os
import sys
import zlib

import cv2
import numpy as np

from homr import constants, find_peaks as fp_mod, staff_detection
from homr.bar_line_detection import detect_bar_lines, prepare_bar_line_image
from homr.bounding_boxes import (BoundingBox, BoundingEllipse, RotatedBoundingBox, UnionFind,
                                 _merge_groups_recursive, create_bounding_ellipses,
                                 create_rotated_bounding_boxes, merge_overlaying_bounding_boxes)
from homr.brace_dot_detection import prepare_brace_dot_image
from homr.debug import Debug
from homr.image_utils import crop_image_and_return_new_top
from homr.model import Accidental, BarLine, Clef, MultiStaff, Note, Rest, StaffPoint, StemDirection
from homr.note_detection import combine_noteheads_with_stems
from homr.point_mapping import chain, undo_crop, undo_resize
from homr.staff_detection import break_wide_fragments, detect_staff, estimate_unit_size_from_clefs

FIX = sys.argv[1]
PAGES = sys.argv[2:] or sorted(d for d in os.listdir(FIX) if os.path.isdir(os.path.join(FIX, d)))


def F(x):
    """A float with full precision (JSON keeps repr), None for None, NaN as a string."""
    if x is None:
        return None
    x = float(x)
    return 'nan' if math.isnan(x) else x


def rect(r):
    return [[F(r[0][0]), F(r[0][1])], [F(r[1][0]), F(r[1][1])], F(r[2])]


def sha(a):
    return hashlib.sha1(np.ascontiguousarray(a).tobytes()).hexdigest()


def box_state(b):
    """What an AngledBoundingBox / BoundingBox holds after construction."""
    d = {'type': type(b).__name__, 'center': [F(b.center[0]), F(b.center[1])], 'size': [F(b.size[0]), F(b.size[1])]}
    if isinstance(b, BoundingBox):
        d['box'] = [F(v) for v in b.box]
    else:
        d['box'] = rect(b.box)
        d['angle'] = F(b.angle)
        d['corners'] = [[F(c[0]), F(c[1])] for c in (b.top_left, b.bottom_left, b.top_right, b.bottom_right)]
    d['polygon'] = np.asarray(b.polygon).reshape(-1).astype(np.int64).tolist()
    d['debug_id'] = int(b.debug_id)
    return d


def load_mask(page, name):
    m = cv2.imread(os.path.join(FIX, page, '05-filtered-%s.png' % name), cv2.IMREAD_UNCHANGED)
    return (m > 0).astype(np.uint8)


def dump_page(page, page_index):
    out = {'page': page}
    rng = np.random.default_rng(zlib.crc32(page.encode()))
    m = {n: load_mask(page, n) for n in ('staff', 'symbols', 'stems_rest', 'notehead', 'clefs_keys')}
    resized = cv2.imread(os.path.join(FIX, page, '02-resized.png'))

    # ---- constants ----
    names = ['tolerance_for_staff_line_detection', 'max_line_gap_size', 'is_short_line', 'is_short_connected_line',
             'min_height_for_brace_rough', 'max_width_for_brace_rough', 'min_height_for_brace',
             'tolerance_for_touching_clefs', 'tolerance_for_staff_at_any_point', 'tolerance_note_grouping',
             'bar_line_max_width', 'bar_line_min_height', 'black_spot_removal_threshold']
    units = [7.3, 12.5, 18.0, 16.25, 0.25, 1.25, 2.75]
    out['constants'] = {n: [[u, F(getattr(constants, n)(u))] for u in units] for n in names}

    # ---- the pipeline objects (main.predict_symbols ... detect_staff), recording find_peaks ----
    cv2.setRNGSeed(zlib.crc32(page.encode()) & 0x7fffffff)
    peaks = []
    orig_fp = fp_mod.find_peaks

    def rec(x, height=None, distance=None, prominence=None):
        r = orig_fp(x, height=height, distance=distance, prominence=prominence)
        peaks.append({'x': [F(v) for v in np.asarray(x)], 'height': F(height), 'distance': F(distance),
                      'prominence': F(prominence), 'peaks': [int(v) for v in r[0]]})
        return r
    fp_mod.find_peaks = rec
    try:
        noteheads = create_bounding_ellipses(m['notehead'], min_size=(4, 4))
        fragments = create_rotated_bounding_boxes(m['staff'], skip_merging=True, min_size=(5, 1), max_size=(10000, 100))
        clefs_keys = create_rotated_bounding_boxes(m['clefs_keys'], min_size=(20, 40), max_size=(1000, 1000))
        stems_rest = create_rotated_bounding_boxes(m['stems_rest'])
        bar_lines = create_rotated_bounding_boxes(prepare_bar_line_image(m['stems_rest']), skip_merging=True, min_size=(1, 5))
        fragments = break_wide_fragments(fragments)
        nws = combine_noteheads_with_stems(noteheads, stems_rest)
        unit = float(np.median([n.notehead.size[1] for n in nws])) if nws else estimate_unit_size_from_clefs(fragments, clefs_keys)
        all_nh = [n.notehead for n in nws]
        all_stems = [n.stem for n in nws if n.stem is not None]
        blr = [b for b in bar_lines if not b.is_overlapping_with_any(all_nh) and not b.is_overlapping_with_any(all_stems)]
        blb = detect_bar_lines(blr, unit)
        debug = Debug(resized, page + '.png', False)
        staffs = detect_staff(debug, m['staff'], fragments, clefs_keys, blb)
    finally:
        fp_mod.find_peaks = orig_fp
    out['unit_size'] = F(unit)
    out['peaks'] = peaks
    out['bar_line_boxes'] = [box_state(b) for b in blb]

    # ---- boxes from raw cv2 rects (what the constructors receive) ----
    boxes = []
    for name, kind in (('stems_rest', 'rot'), ('staff', 'rot'), ('notehead', 'ell'), ('clefs_keys', 'rot')):
        cs, _ = cv2.findContours(m[name], cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
        picked = [i for i in range(len(cs)) if len(cs[i]) >= 5]
        picked = sorted(rng.choice(picked, size=min(60, len(picked)), replace=False).tolist())
        for i in picked:
            c = cs[i]
            r = cv2.fitEllipse(c) if kind == 'ell' else cv2.minAreaRect(c)
            if not (r[1][0] > 0 and r[1][1] > 0):
                continue
            boxes.append({'kind': kind, 'mask': name, 'i': i, 'rect': rect(r), 'contour': c.reshape(-1).tolist()})
    objs = []
    for b in boxes:
        c = np.array(b['contour'], np.int32).reshape(-1, 1, 2)
        r = (tuple(b['rect'][0]), tuple(b['rect'][1]), b['rect'][2])
        o = RotatedBoundingBox(r, c, b['i']) if b['kind'] == 'rot' else BoundingEllipse(r, c, b['i'])
        objs.append(o)
        b['state'] = box_state(o)
        res = {}
        res['thicker'] = box_state(o.make_box_thicker(3))
        res['taller'] = box_state(o.make_box_taller(4))
        if b['kind'] == 'rot':
            res['thicker0'] = box_state(o.make_box_thicker(0))
            res['min_dim'] = box_state(o.ensure_min_dimension(3, 9))
            res['taller_center'] = box_state(o.make_box_taller_keep_center(5))
            res['taller_center_odd'] = box_state(o.make_box_taller_keep_center(7.5))
            res['move_x'] = box_state(o.move_to_x_horizontal_by(7))
            res['extrapolated'] = [[F(x), F(o.get_center_extrapolated(x))] for x in (0.0, o.center[0] + 13.5, 1919.0)]
            bb = o.to_bounding_box()
            res['to_bb'] = box_state(bb)
            res['to_bb_rotated'] = rect(bb.rotated_box)
            crop = bb.extract(resized)
            res['extract'] = [list(crop.shape), sha(crop)]
            bb2 = bb.increase_size_in_each_dimension(3, resized.shape)
            res['increase'] = box_state(bb2)
            if bb.box[2] > bb.box[0] and bb.box[3] > bb.box[1] and min(bb.box) >= 0:
                res['blank'] = sha(bb.blank_everything_outside_of_box(resized[:, :, 0]))
        b['res'] = res
    # pairwise relations between boxes that are near each other
    pairs = []
    for i in range(len(objs)):
        for j in range(len(objs)):
            if i == j:
                continue
            a, b = objs[i], objs[j]
            if abs(a.center[0] - b.center[0]) + abs(a.center[1] - b.center[1]) > 160:
                continue
            p = {'a': i, 'b': j, 'overlap': bool(a.is_overlapping(b)), 'touch': bool(a._can_shapes_possibly_touch(b)),
                 'eq': bool(a == b)}
            if isinstance(a, RotatedBoundingBox) and isinstance(b, RotatedBoundingBox):
                p['intersect'] = bool(a.is_intersecting(b))
                p['extrap'] = [bool(a.is_overlapping_extrapolated(b, u)) for u in (unit, 2.0, 40.0)]
            p['overlap_bb'] = bool(a.is_overlapping(objs[j].to_bounding_box())) if isinstance(b, RotatedBoundingBox) else None
            pairs.append(p)
    out['boxes'] = boxes
    out['pairs'] = pairs[:3000]

    # ---- merging ----
    rot = [o for o in objs if isinstance(o, RotatedBoundingBox)]
    groups = merge_overlaying_bounding_boxes(rot)
    thick = [o.make_box_thicker(9) for o in rot]
    out['merge'] = {
        'optimized': [[rot.index(x) for x in g] for g in groups],
        'thick': [[thick.index(x) for x in g] for g in merge_overlaying_bounding_boxes(thick)],
        'recursive': [[thick.index(x) for x in g] for g in _merge_groups_recursive([[x] for x in thick], 0)],
    }
    uf = UnionFind(12)
    for a, b in [(0, 1), (2, 3), (1, 3), (5, 6), (7, 5), (9, 9), (10, 11), (11, 4)]:
        uf.union(a, b)
    out['union_find'] = {'parent': list(uf.parent), 'rank': list(uf.rank), 'find': [uf.find(i) for i in range(12)]}

    # ---- staffs ----
    def mapping(p):
        return (p[0] * 1.37 + 5.25, p[1] * 0.71 - 2.5)
    xs = [float(v) for v in rng.uniform(-80, 2000, 25)] + [0.0, 1919.0]
    items = [o for o in objs][:80]
    sdump = []
    for k, s in enumerate(staffs):
        d = {'grid': [[F(p.x), [F(y) for y in p.y], F(p.angle)] for p in s.grid]}
        d['state'] = {'min_x': F(s.min_x), 'max_x': F(s.max_x), 'min_y': F(s.min_y), 'max_y': F(s.max_y),
                      'average_unit_size': F(s.average_unit_size), 'y_tolerance': F(s._y_tolerance),
                      'point_units': [F(p.average_unit_size) for p in s.grid]}
        d['get_at'] = [[x, None if s.get_at(x) is None else s.grid.index(s.get_at(x))] for x in xs]
        d['y_distance'] = [[x, y, F(s.y_distance_to((x, y)))] for x in xs[:10] for y in (s.min_y - 30.5, s.min_y + 7.25, s.max_y + 40.0)]
        d['on_zone'] = [bool(s.is_on_staff_zone(o)) for o in items]
        pos = []
        for o in items:
            p = s.get_at(o.center[0])
            pos.append(None if p is None else int(p.find_position_in_unit_sizes(o)))
        d['positions'] = pos
        ext = s.extend_to_x_range(int(s.min_x) - 33, int(s.max_x) + 21)
        d['extend'] = [[F(p.x), [F(y) for y in p.y]] for p in (ext.grid[0], ext.grid[-1])] + [len(ext.grid)]
        ext2 = s.extend_to_x_range(-1, int(s.max_x) - 5)
        d['extend_none'] = len(ext2.grid)
        t = s.transform_coordinates(mapping)
        d['transform'] = [[F(p.x), [F(y) for y in p.y], F(p.average_unit_size)] for p in t.grid[:6]] + [F(t.average_unit_size), F(t.min_y)]
        bbp = s.grid[len(s.grid) // 2].to_bounding_box()
        d['point_bb'] = box_state(bbp)
        sdump.append(d)
    out['staffs'] = sdump
    merges = []
    for k in range(len(staffs) - 1):
        a, b = staffs[k], staffs[k + 1]
        for sym in items[:6]:
            a.add_symbol(Note(sym, 3, None, None) if k % 2 else Clef(sym.to_bounding_box() if isinstance(sym, RotatedBoundingBox) else BoundingBox((1, 2, 30, 40), np.array([]))))
        mg = a.merge(b)
        sp = mg.split()
        merges.append({'a': k, 'b': k + 1, 'grid': [[F(p.x), [F(y) for y in p.y], F(p.angle)] for p in mg.grid[:5]] + [len(mg.grid)],
                       'unit': F(mg.average_unit_size), 'grand': mg.is_grandstaff, 'nsym': len(mg.symbols),
                       'split': None if sp is None else [[len(sp[0].grid), len(sp[1].grid)], [len(sp[0].symbols), len(sp[1].symbols)],
                                                         F(sp[0].average_unit_size), F(sp[1].average_unit_size)]})
    out['staff_merges'] = merges

    # ---- multi staffs and grandstaffs ----
    bd_img = prepare_brace_dot_image(m['symbols'], m['staff'])
    brace_dot = create_rotated_bounding_boxes(bd_img, skip_merging=True, max_size=(100, -1))
    out['brace_dot'] = [{'rect_in': None, 'state': box_state(b)} for b in brace_dot]
    fresh = detect_staff(Debug(resized, page + '.png', False), m['staff'], fragments, clefs_keys, blb)
    ms = MultiStaff(list(reversed(fresh)), blb[:3])
    mo = {'order': [fresh.index(s) for s in ms.staffs]}
    scores = []
    for i in range(len(ms.staffs) - 1):
        above = ms.staffs[i - 1] if i > 0 else None
        below = ms.staffs[i + 2] if i + 2 < len(ms.staffs) else None
        scores.append([F(ms._score_brace_with_staff_pair(b, ms.staffs[i], ms.staffs[i + 1], above, below)) for b in brace_dot])
        scores.append([F(ms._score_brace_with_staff_pair(b, ms.staffs[i], ms.staffs[i + 1], None, None)) for b in brace_dot])
    mo['scores'] = scores
    if brace_dot and len(ms.staffs) >= 2:
        sel = ms._select_grandstaffs(brace_dot)
        mo['selected'] = [[p.get_index(), F(p.get_score())] for p in sel]
        g = ms.create_grandstaffs(brace_dot)
        mo['grand'] = [[F(s.min_y), F(s.max_y), s.is_grandstaff, len(s.grid)] for s in g.staffs]
    mo['break_apart'] = [len(x.staffs) for x in ms.break_apart()]
    other = MultiStaff(fresh[:2], blb[1:4])
    mm = ms.merge(other)
    mo['merge'] = [len(mm.staffs), len(mm.connections), [fresh.index(s) for s in mm.staffs]]
    out['multi'] = mo

    # ---- debug drawing: Debug.write_teaser's picture (draw_onto_image of each drawable in turn) ----
    dbg = Debug(resized, page + '.png', False)
    teaser_objs = [ms] + objs[:12] + [Note(objs[0], 4, objs[1] if isinstance(objs[1], RotatedBoundingBox) else None, StemDirection.DOWN)]
    img = resized.copy()
    for i, o in enumerate(teaser_objs):
        o.draw_onto_image(img, dbg.colors[i % len(dbg.colors)])
    out['teaser'] = {'n': len(teaser_objs), 'sha1': sha(img)}

    # ---- image_utils ----
    crops = []
    for t in range(25):
        x1, y1, x2, y2 = [float(v) for v in rng.uniform(-60, 2600, 4)]
        if t % 5 == 0:
            x1, x2 = x1 + 0.5 - (x1 % 1), x2 - (x2 % 1) + 0.5  # .5 ties: round half to even
        img, top = crop_image_and_return_new_top(resized, x1, y1, x2, y2)
        crops.append([[x1, y1, x2, y2], list(img.shape), sha(img), [int(top[0]), int(top[1])]])
    out['crops'] = crops

    # ---- np.argsort's default order (find_peaks' tie breaking) ----
    arrs = []
    for t in range(80):
        n = int(rng.choice([2, 3, 5, 8, 9, 16, 17, 33, 40, 64, 65, 129, 255, 256, 257, 600, 2100]))
        x = [rng.integers(0, 4, n).astype(np.float64), rng.standard_normal(n), np.round(rng.standard_normal(n), 1),
             rng.integers(0, 40, n) * 0.25 - 3][t % 4]
        arrs.append({'x': [F(v) for v in x], 'idx': np.argsort(x).tolist()})
    out['argsort'] = arrs

    # ---- point_mapping ----
    to_input = chain(undo_resize((3301, 2550, 3), (2485, 1920)), undo_crop(17, -4))
    out['mapping'] = [[x, y, [F(v) for v in to_input((x, y))]] for x, y in [(0.0, 0.0), (100.5, 2000.25), (1919.0, 2484.0)]]

    # ---- symbols ----
    sym = []
    for o in items[:20]:
        if isinstance(o, RotatedBoundingBox):
            bbx = o.to_bounding_box()
            n = Note(o, 5, o, StemDirection.UP)
            tr = [x.transform_coordinates(mapping) for x in (n, Rest(bbx), Clef(bbx), Accidental(bbx, 2), BarLine(o))]
            sym.append({'i': objs.index(o), 'centers': [[F(t.center[0]), F(t.center[1])] for t in tr],
                        'str': [str(n), str(Rest(bbx)), str(BarLine(o))]})
    out['symbols'] = sym
    return out


for idx, page in enumerate(PAGES):
    doc = dump_page(page, idx)
    with open(os.path.join(FIX, page, '22-model.json'), 'w') as f:
        json.dump(doc, f, separators=(',', ':'))
    print(page, 'staffs', len(doc['staffs']), 'boxes', len(doc['boxes']), 'peaks calls', len(doc['peaks']), file=sys.stderr)
