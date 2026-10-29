"""Python reference for the foundation audit's randomized checks (tests/omr-model.test.js,
section "fuzz"): homr's own box / staff / peak / crop functions on synthetic inputs the seven
pages never produce - zero and half-pixel sizes, the angle-normalisation edges (+-45, +-90,
+-135, +-180), touching and nested boxes, ties for round(), negative and out-of-image crop
corners, staffs with uneven grids, brace candidates around grand staffs.

usage: python -I tools/omr/dump_audit_fuzz.py FIXTURES [page ...]

Writes FIXTURES/<page>/24-audit-fuzz.json, seeded per page (crc32 of the page name + 1). Floats
that JSON cannot hold are strings ('nan', 'inf', '-inf'); a call that raised is
{"raises": <type name>}.
"""
import json
import math
import os
import random
import sys
import warnings
import zlib

import numpy as np

from homr import constants
from homr import find_peaks as fp
from homr import point_mapping as pm
from homr.bar_line_detection import detect_bar_lines
from homr.bounding_boxes import (
    BoundingEllipse,
    RotatedBoundingBox,
    _get_box_for_whole_group,
    _get_ellipse_for_whole_group,
    _merge_groups_recursive,
    merge_overlaying_bounding_boxes,
)
from homr.image_utils import crop_image_and_return_new_top
from homr.model import MultiStaff, Staff, StaffPoint

FIX = sys.argv[1]
PAGES = sys.argv[2:] or sorted(d for d in os.listdir(FIX) if os.path.isdir(os.path.join(FIX, d)))
warnings.simplefilter('ignore')


def enc(v):
    if isinstance(v, np.ndarray):
        return enc(v.tolist())
    if isinstance(v, (np.floating, np.integer, np.bool_)):
        return enc(v.item())
    if isinstance(v, float):
        if v != v:
            return 'nan'
        if v in (math.inf, -math.inf):
            return 'inf' if v > 0 else '-inf'
        return v
    if isinstance(v, (list, tuple)):
        return [enc(x) for x in v]
    if isinstance(v, dict):
        return {k: enc(x) for k, x in v.items()}
    return v


def call(f):
    try:
        return enc(f())
    except Exception as e:  # noqa: BLE001 - the exception type is the expectation
        return {'raises': type(e).__name__}


def call_msg(f):
    """like call(), with str(exc): the SheetLab engine shows it as a page's skip reason"""
    try:
        return enc(f())
    except Exception as e:  # noqa: BLE001
        return {'raises': type(e).__name__, 'msg': str(e)}


def errors():
    """exceptions (type and text) and casts the port must reproduce; not seeded"""
    import cv2
    from PIL import Image

    from homr.debug import Debug
    out = {}
    p64 = np.array([[1, 2], [3, 4], [5, 1], [2, 7], [4, 4]], np.float64)
    p5 = p64[:5]
    q = np.array([[0, 0], [1, 0], [0, 1]], np.int32)
    f32 = np.array([[1, 2], [3, 4], [5, 1]], np.float32).reshape(-1, 1, 2)
    out['cv'] = {
        'minAreaRect': call_msg(lambda: cv2.minAreaRect(p64)),
        'boundingRect': call_msg(lambda: cv2.boundingRect(p64)),
        'contourArea': call_msg(lambda: cv2.contourArea(p64)),
        'convexHull': call_msg(lambda: cv2.convexHull(p64)),
        'pointPolygonTest': call_msg(lambda: cv2.pointPolygonTest(p64, (1.0, 2.0), False)),
        'fitEllipse5': call_msg(lambda: cv2.fitEllipse(p5)),
        'fitEllipse6': call_msg(lambda: cv2.fitEllipse(np.vstack([p64, [[9.0, 9.0]]]))),
        'fitEllipse4': call_msg(lambda: cv2.fitEllipse(np.array([[0, 0], [1, 0], [1, 1], [0, 1]], np.int32))),
        'icc1': call_msg(lambda: cv2.intersectConvexConvex(p64, p64.astype(np.float32))),
        'icc2': call_msg(lambda: cv2.intersectConvexConvex(p64.astype(np.float32), p64)),
        'gat_int': call_msg(lambda: cv2.getAffineTransform(q, q.astype(np.float32))),
        'gat_f64': call_msg(lambda: cv2.getAffineTransform(q.astype(np.float32), q.astype(np.float64))),
        'gat_line': call_msg(lambda: cv2.getAffineTransform(np.array([[0, 0], [1, 0], [2, 0]], np.float32), q.astype(np.float32))),
        'fillPoly_f32': call_msg(lambda: cv2.fillPoly(np.zeros((9, 9), np.uint8), [f32], 255)),
        'fillPoly_empty': call_msg(lambda: cv2.fillPoly(np.zeros((9, 9), np.uint8), [np.zeros((0, 1, 2), np.int32)], 255)),
        'fillConvexPoly_f32': call_msg(lambda: cv2.fillConvexPoly(np.zeros((9, 9), np.uint8), f32, 255)),
        'drawContours_f32': call_msg(lambda: cv2.drawContours(np.zeros((9, 9), np.uint8), [f32], -1, 255, 1)),
        'findNonZero_3ch': call_msg(lambda: cv2.findNonZero(np.zeros((3, 3, 3), np.uint8))),
        'addWeighted_shape': call_msg(lambda: cv2.addWeighted(np.zeros((2, 6), np.uint8), 0.5, np.zeros((3, 4), np.uint8), 0.5, 0)),
        'resize_empty': call_msg(lambda: cv2.resize(np.zeros((0, 5), np.uint8), (3, 3))),
        'warpAffine_neg': [call_msg(lambda ds=ds: list(cv2.warpAffine(np.zeros((4, 5), np.uint8), np.eye(2, 3), ds).shape))
                           for ds in ((-1, 3), (2, -3), (-2, -2), (0, 3))],
    }
    out['np'] = {
        'max_empty': call_msg(lambda: np.max(np.array([]))),
        'min_empty': call_msg(lambda: np.min(np.array([]))),
        'argmax_empty': call_msg(lambda: np.argmax(np.array([]))),
        'argmin_empty': call_msg(lambda: np.argmin(np.array([]))),
        'concat_empty': call_msg(lambda: np.concatenate([])),
        'slice_float': call_msg(lambda: np.zeros((3, 3))[0:1.5, 0:2].shape),
        'slice_float2': call_msg(lambda: np.zeros((3, 3))[0:2.0, 0:2].shape),
    }
    vals = [math.nan, math.inf, -math.inf, 1e10, 300.7, -1.5, 255.9, 256, -1, 70000]
    sets = {}
    for dt in ('uint8', 'int16', 'int32', 'float32'):
        for v in vals:
            def setit(dt=dt, v=v):
                a = np.zeros((2, 3), dt)
                a[0:2, 1:3] = v
                return a
            sets[dt + ' ' + repr(v)] = call_msg(lambda f=setit: f().ravel().tolist())
            sets['full ' + dt + ' ' + repr(v)] = call_msg(lambda dt=dt, v=v: np.full((1, 2), v, dt).ravel().tolist())
    out['setitem'] = sets
    e = np.zeros((0, 1, 2), np.int32)
    out['homr'] = {
        'staff_empty': call_msg(lambda: Staff([])),
        'merge_far': call_msg(lambda: StaffPoint(1.0, [1.0, 2.0, 3.0, 4.0, 5.0], 0.0).merge(StaffPoint(2.0, [1.0, 2.0, 3.0, 4.0, 5.0], 0.0))),
        'staff_point_4': call_msg(lambda: StaffPoint(1.0, [1.0, 2.0, 3.0, 4.0], 0.0)),
        'undo_resize_zero': call_msg(lambda: pm.undo_resize((10, 0), (5, 5))),
        'position_no_lines': call_msg(lambda: StaffPoint(1.0, [], 0.0).find_position_in_unit_sizes(RotatedBoundingBox(((1.0, 2.0), (3.0, 3.0), 0.0), e))),
    }
    img = Image.fromarray(np.arange(48, dtype=np.uint8).reshape(6, 8))
    out['pil'] = {
        'zero_w': call_msg(lambda: np.array(img.resize((0, 3))).shape),
        'zero_h': call_msg(lambda: np.array(img.resize((3, 0))).shape),
        'box_neg': call_msg(lambda: np.array(img.resize((3, 3), box=(-1, 0, 4, 4))).shape),
        'box_big': call_msg(lambda: np.array(img.resize((3, 3), box=(0, 0, 9, 4))).shape),
        'box_empty': call_msg(lambda: np.array(img.resize((3, 3), box=(4, 0, 2, 4))).shape),
        'box_crop': call_msg(lambda: np.array(img.resize((3, 2), box=(2, 1, 5, 3))).ravel().tolist()),
        'box_frac': call_msg(lambda: np.array(img.resize((3, 2), box=(2.5, 1, 5.5, 3))).ravel().tolist()),
    }
    names = ['a/b/c.png', '/c.png', 'c.png', 'a//b.png', '//x.png', 'a\\b\\c.d.png', '', '.hidden', 'dir/.x']
    dbg = []
    for n in names:
        d = Debug(None, n, True)
        written = []
        for _ in range(3):
            written.append(d._debug_file_name('x'))
        dbg.append([n, d.dir_name, d.base_filename, written])
    out['debug'] = dbg
    # str() / repr() of floats and of the model objects (logging, eprint, skip reasons)
    rnd = random.Random(2)
    vals = [0.0, -0.0, 1.0, -3.0, 0.5, 1e16, 1e15, 9999999999999998.0, 123456789012345678.0, 1e21, 1e22, 1e-4, 1e-5,
            1.5e-7, 0.00012345, 2.5e-300, 5e-324, 1.7976931348623157e308, 100.0, 12345.678, 0.1, 1 / 3, -2.5e-5, 1e100]
    vals += [rnd.uniform(-1e6, 1e6) for _ in range(30)] + [10 ** rnd.uniform(-20, 25) for _ in range(60)]
    out['repr'] = [[v, repr(v), '-' if math.copysign(1, v) < 0 else '+'] for v in vals]
    box = ((12.5, 3.0), (1e-5, 40.0), -45.0)
    out['str'] = {'box': str(RotatedBoundingBox(box, np.zeros((0, 1, 2), np.int32))), 'box_raw': box,
                  'point': str(StaffPoint(10.0, [1.0, 2.5, 1e16, 4.0, 5.0], 0.0)),
                  'pair': str(MultiStaff.GrandStaffPair([2, 3], 0.1 + 0.2))}
    return out


def desc(b):
    """what a box looks like from outside: its tuple, polygon, corners"""
    d = {'box': b.box, 'polygon': np.asarray(b.polygon).reshape(-1).tolist(), 'center': b.center, 'size': b.size}
    if hasattr(b, 'top_left'):
        d['corners'] = [b.top_left, b.bottom_left, b.top_right, b.bottom_right]
    if hasattr(b, 'rotated_box'):
        d['rotated_box'] = b.rotated_box
    return d


def rand_box(rnd):
    half = rnd.random() < 0.3
    cx = rnd.randint(0, 120) + (0.5 if half else 0.0) if rnd.random() < 0.6 else rnd.uniform(0, 120)
    cy = rnd.randint(0, 120) + (0.5 if half else 0.0) if rnd.random() < 0.6 else rnd.uniform(0, 120)
    def side():
        r = rnd.random()
        if r < 0.1:
            return 0.0
        if r < 0.5:
            return rnd.randint(1, 40) / 2.0
        return rnd.uniform(0.1, 60)
    angle = rnd.choice([0.0, 45.0, -45.0, 90.0, -90.0, 135.0, -135.0, 180.0, -180.0, 30.0, -60.0,
                        rnd.uniform(-180, 180), rnd.uniform(-10, 10), float(np.float32(rnd.uniform(-90, 0)))])
    return ((cx, cy), (side(), side()), angle)


def contour_of(box):
    import cv2
    return np.asarray(cv2.boxPoints(box)).astype(np.int32).reshape(-1, 1, 2)


def one_page(page):
    rnd = random.Random(zlib.crc32(page.encode()) + 1)
    out = {'page': page}
    e = np.zeros((0, 1, 2), np.int32)

    # ---- boxes and their methods ----
    raw = [rand_box(rnd) for _ in range(160)]
    boxes = []
    for r in raw:
        b = RotatedBoundingBox(r, contour_of(r), debug_id=len(boxes))
        x1, x2 = rnd.uniform(-50, 200), float(rnd.randint(-20, 150))
        rec = {'raw': r, 'desc': desc(b),
               'ensure_min': call(lambda b=b: desc(b.ensure_min_dimension(5, 3))),
               'thicker': [call(lambda b=b, t=t: desc(b.make_box_thicker(t))) for t in (-1, 0, 3)],
               'taller': call(lambda b=b: desc(b.make_box_taller(3))),
               'taller_keep': [call(lambda b=b, t=t: desc(b.make_box_taller_keep_center(t))) for t in (3, 4, 5, -3)],
               'move': call(lambda b=b: desc(b.move_to_x_horizontal_by(-10))),
               'extrapolated': [[x, call(lambda b=b, x=x: b.get_center_extrapolated(x))] for x in (x1, x2)],
               'to_bb': call(lambda b=b: desc(b.to_bounding_box())),
               'ellipse': call(lambda r=r: desc(BoundingEllipse(r, e))),
               'ellipse_thicker': call(lambda r=r: desc(BoundingEllipse(r, e).make_box_thicker(2))),
               'ellipse_taller': call(lambda r=r: desc(BoundingEllipse(r, e).make_box_taller(2)))}
        boxes.append(rec)
    out['boxes'] = boxes
    objs = [RotatedBoundingBox(r, contour_of(r), debug_id=i) for i, r in enumerate(raw)]
    pairs = []
    for _ in range(700):
        i = rnd.randrange(len(objs))
        if rnd.random() < 0.5:
            # a neighbour: same box moved a little, so touching / overlapping cases are common
            (cx, cy), (w, h), a = raw[i]
            r2 = ((cx + rnd.choice([0.0, w, -w, w / 2, 0.5, rnd.uniform(-5, 5)]), cy + rnd.choice([0.0, h, -h, 0.5, rnd.uniform(-3, 3)])),
                  (rnd.choice([w, h, rnd.uniform(0, 20)]), rnd.choice([h, w, rnd.uniform(0, 20)])),
                  rnd.choice([a, -a, a + 90, 0.0, rnd.uniform(-20, 20)]))
        else:
            r2 = raw[rnd.randrange(len(raw))]
        a, b = objs[i], RotatedBoundingBox(r2, contour_of(r2))
        unit = rnd.choice([5.0, 10.0, 12.5, rnd.uniform(3, 20)])
        pairs.append({'i': i, 'other': r2, 'unit': unit,
                      'touch': call(lambda: a._can_shapes_possibly_touch(b)),
                      'overlap': call(lambda: a.is_overlapping(b)),
                      'intersect': call(lambda: a.is_intersecting(b)),
                      'extrap': call(lambda: a.is_overlapping_extrapolated(b, unit)),
                      'eq': a == b,
                      'overlap_bb': call(lambda: a.is_overlapping(b.to_bounding_box())),
                      'ellipse_overlap': call(lambda: BoundingEllipse(r2, e).is_overlapping(a))})
    out['pairs'] = pairs

    # ---- merging groups ----
    merges = []
    for _ in range(25):
        n = rnd.randint(1, 40)
        base = (rnd.uniform(10, 100), rnd.uniform(10, 100))
        rs = [((base[0] + rnd.uniform(-30, 30), base[1] + rnd.uniform(-30, 30)), (rnd.uniform(1, 15), rnd.uniform(1, 15)),
               rnd.choice([0.0, 90.0, rnd.uniform(-90, 90)])) for _ in range(n)]
        bs = [RotatedBoundingBox(r, contour_of(r), debug_id=k) for k, r in enumerate(rs)]
        groups = merge_overlaying_bounding_boxes(bs)
        rec = {'raw': rs, 'groups': [[g.debug_id for g in grp] for grp in groups],
               'boxes': [desc(x) for x in _get_box_for_whole_group(groups)],
               'ellipses': call(lambda groups=groups: [desc(x) for x in _get_ellipse_for_whole_group(groups)]),
               'recursive': [[g.debug_id for g in grp] for grp in _merge_groups_recursive([[x] for x in bs], 0)]}
        merges.append(rec)
    out['merges'] = merges

    # ---- crop_image_and_return_new_top ----
    crops = []
    for _ in range(150):
        h, w, c = rnd.randint(1, 30), rnd.randint(1, 30), rnd.choice([1, 3])
        img = np.arange(h * w * c, dtype=np.int64).astype(np.uint8).reshape((h, w) if c == 1 else (h, w, c))
        def coord(n):
            r = rnd.random()
            if r < 0.3:
                return rnd.randint(-5, n + 5) + 0.5
            if r < 0.6:
                return float(rnd.randint(-5, n + 5))
            return rnd.uniform(-10, n + 10)
        cs = [coord(w), coord(h), coord(w), coord(h)]
        res = call(lambda img=img, cs=cs: (lambda r: [list(r[0].shape), r[1].tolist(), int(r[0].astype(np.int64).sum())])(crop_image_and_return_new_top(img, *cs)))
        crops.append({'h': h, 'w': w, 'c': c, 'cs': cs, 'res': res})
    out['crops'] = crops

    # ---- staffs ----
    def rand_staff(y0, lines=5):
        n = rnd.randint(1, 8)
        xs = sorted(rnd.sample(range(0, 400, 7), n))
        grid = []
        unit = rnd.uniform(6, 14)
        for x in xs:
            ys, y = [], y0 + rnd.uniform(-2, 2)
            for _ in range(lines):
                ys.append(y)
                y += unit + rnd.choice([0.0, 0.5, rnd.uniform(-1, 1)])
            grid.append(StaffPoint(float(x) + rnd.choice([0.0, 0.4, 0.5, -0.5]), ys, rnd.uniform(-2, 2)))
        return Staff(grid)

    def sdesc(s):
        return {'min_x': s.min_x, 'max_x': s.max_x, 'min_y': s.min_y, 'max_y': s.max_y, 'unit': s.average_unit_size,
                'grandstaff': s.is_grandstaff, 'grid': [[p.x, p.y, p.angle, p.average_unit_size] for p in s.grid],
                'symbols': len(s.symbols)}

    staffs = []
    mapping = pm.chain(pm.undo_crop(3.5, -2.0), pm.undo_resize((100, 200), (150, 240)))
    for _ in range(40):
        s = rand_staff(rnd.uniform(20, 300))
        probes = []
        for _ in range(12):
            r = ((rnd.uniform(-60, 460), rnd.uniform(s.min_y - 80, s.max_y + 80)), (4.0, 4.0), 0.0)
            pb = RotatedBoundingBox(r, e)
            pt = (rnd.uniform(-60, 460), rnd.uniform(0, 400))
            probes.append({'box': r, 'pt': pt,
                           'zone': call(lambda pb=pb: s.is_on_staff_zone(pb)),
                           'get_at': call(lambda pt=pt: (lambda p: None if p is None else p.x)(s.get_at(pt[0]))),
                           'ydist': call(lambda pt=pt: s.y_distance_to(pt)),
                           'pos': [call(lambda p=p, pb=pb: p.find_position_in_unit_sizes(pb)) for p in s.grid[:2]]})
        rec = {'staff': sdesc(s), 'probes': probes,
               'extend': [call(lambda a=a, b=b: sdesc(s.extend_to_x_range(a, b))) for a, b in ((-1, 500), (0, 10), (5, 300), (1000, -1))],
               'transform': call(lambda: sdesc(s.transform_coordinates(mapping))),
               'point_transform': call(lambda: [s.grid[0].transform_coordinates(mapping).x, s.grid[0].transform_coordinates(mapping).y])}
        lower = rand_staff(s.max_y + rnd.uniform(10, 60))
        lower.grid = [StaffPoint(p.x + rnd.choice([0.0, 0.0, 0.3, 7.0]), p.y, p.angle) for p in lower.grid]
        lower = Staff(lower.grid)
        merged = call(lambda: s.merge(lower))
        rec['lower'] = sdesc(lower)
        rec['merge'] = merged if isinstance(merged, dict) and 'raises' in merged else sdesc(s.merge(lower))
        sp = None if isinstance(merged, dict) and 'raises' in merged else s.merge(lower).split()
        rec['split'] = None if sp is None else [sdesc(sp[0]), sdesc(sp[1])]
        staffs.append(rec)
    out['staffs'] = staffs

    # ---- grand staffs ----
    grands = []
    for _ in range(30):
        n = rnd.randint(1, 5)
        ss, y = [], rnd.uniform(10, 50)
        for _ in range(n):
            st = rand_staff(y)
            ss.append(st)
            y = st.max_y + rnd.uniform(20, 120)
        braces = []
        for _ in range(rnd.randint(1, 4)):
            k = rnd.randrange(n)
            k2 = min(n - 1, k + rnd.choice([0, 1, 1, 2]))
            top, bot = ss[k].min_y + rnd.uniform(-10, 10), ss[k2].max_y + rnd.uniform(-10, 10)
            braces.append(((ss[k].min_x + rnd.uniform(-40, 10), (top + bot) / 2), (rnd.uniform(2, 8), max(1.0, bot - top)), 0.0))
        ms = MultiStaff(list(reversed(ss)) if rnd.random() < 0.3 else ss, [])
        bs = [RotatedBoundingBox(b, e) for b in braces]
        scores = [[call(lambda b=b, i=i: ms._score_brace_with_staff_pair(b, ms.staffs[i], ms.staffs[i + 1],
                                                                           ms.staffs[i - 1] if i > 0 else None,
                                                                           ms.staffs[i + 2] if i + 2 < len(ms.staffs) else None))
                   for i in range(len(ms.staffs) - 1)] for b in bs]
        res = call(lambda: [sdesc(x) for x in ms.create_grandstaffs(bs).staffs])
        grands.append({'staffs': [[[p.x, p.y, p.angle] for p in st.grid] for st in ss], 'reversed': ms.staffs[0] is not ss[0],
                       'braces': braces, 'scores': scores, 'pairs': call(lambda: [[p.pair_index, p.score] for p in ms._select_grandstaffs(bs)]),
                       'result': res})
    out['grands'] = grands

    # ---- find_peaks with every option combination ----
    peaks = []
    for _ in range(80):
        n = rnd.choice([0, 1, 2, 3, 4, 10, 50, 200])
        kind = rnd.random()
        if kind < 0.4:
            x = [float(rnd.randint(0, 4)) for _ in range(n)]
        elif kind < 0.7:
            x = [rnd.uniform(-2, 3) for _ in range(n)]
        else:
            x = [float(v) for v in np.repeat([rnd.randint(0, 3) for _ in range(max(1, n // 4))], 4)[:n]]
        opts = {'height': rnd.choice([None, 0.0, 1.0, 2.5]), 'distance': rnd.choice([None, 1, 2.5, 7.0]),
                'prominence': rnd.choice([None, 0, 1, 1.5])}
        peaks.append({'x': x, 'opts': opts, 'peaks': call(lambda x=x, o=opts: fp.find_peaks(np.array(x), **o)[0])})
    out['peaks'] = peaks

    # ---- constants (round ties) and bar line filtering ----
    units = [rnd.randint(1, 40) / 4 for _ in range(40)] + [rnd.uniform(0, 30) for _ in range(20)]
    out['constants'] = [[u, constants.tolerance_for_touching_clefs(u), constants.tolerance_for_staff_line_detection(u),
                         constants.max_line_gap_size(u), constants.bar_line_max_width(u), constants.bar_line_min_height(u)] for u in units]
    bl_raw = [rand_box(rnd) for _ in range(60)]
    unit = rnd.uniform(5, 15)
    bl = [RotatedBoundingBox(r, e, debug_id=k) for k, r in enumerate(bl_raw)]
    out['bar_lines'] = {'raw': bl_raw, 'unit': unit, 'kept': [b.debug_id for b in detect_bar_lines(bl, unit)]}
    out['errors'] = errors()

    # ---- fitEllipse on degenerate point sets (< 25 points: cv2's own Jacobi SVD; >= 25 go to
    # LAPACK dgesdd, which the port does not reproduce bit for bit), each from a fresh theRNG
    # (setRNGSeed(0) = a new process) so the jitter path is compared in isolation ----
    import cv2
    fits = []
    for t in range(200):
        n, kind = rnd.choice([5, 6, 7, 9, 12, 16, 20, 24]), t % 8
        if kind == 0:
            y = rnd.randint(0, 100); pts = [[rnd.randint(0, 100), y] for _ in range(n)]
        elif kind == 1:
            x = rnd.randint(0, 100); pts = [[x, rnd.randint(0, 100)] for _ in range(n)]
        elif kind == 2:
            a = rnd.randint(0, 50); pts = [[a + k, a + rnd.choice([1, 2, 3]) * k] for k in range(n)]
        elif kind == 3:
            q = [rnd.randint(0, 100), rnd.randint(0, 100)]; pts = [q[:] for _ in range(n)]
        elif kind == 4:
            q, r = [rnd.randint(0, 100), rnd.randint(0, 100)], [rnd.randint(0, 100), rnd.randint(0, 100)]
            pts = [rnd.choice([q, r])[:] for _ in range(n)]
        elif kind == 5:
            pts = [[50 + rnd.randint(0, 1), 50 + rnd.randint(0, 2)] for _ in range(n)]
        elif kind == 6:
            pts = [[k * 3, 10 + (1 if k == n // 2 else 0)] for k in range(n)]
        else:
            pts = [[rnd.uniform(0, 50), rnd.uniform(0, 20)] for _ in range(n)]
        dt = np.float32 if kind == 7 else np.int32
        arr = np.array(pts, dt).reshape(-1, 1, 2)
        cv2.setRNGSeed(0)
        fits.append({'dt': 'float32' if kind == 7 else 'int32', 'pts': arr.ravel().tolist(), 'box': call(lambda arr=arr: cv2.fitEllipse(arr))})
    out['fit_ellipse'] = fits
    return out


for page in PAGES:
    with open(os.path.join(FIX, page, '24-audit-fuzz.json'), 'w') as f:
        json.dump(enc(one_page(page)), f)
    print(page, 'ok')
