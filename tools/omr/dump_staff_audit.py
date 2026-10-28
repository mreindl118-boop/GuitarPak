"""Adversarial audit of the staff stage port (js/omr/staff_detection.js, note_detection.js,
brace_dot_detection.js, system_repair.js, staff_regions.js): differential cases the 7 printed
fixture pages never reach, run through homr's Python as the reference.

usage:
  python -I tools/omr/dump_staff_audit.py FIXTURES --seg SEGNET.onnx

Writes FIXTURES/15-staff-audit.json and FIXTURES/15-staff-audit-<case>-<mask>.png (0/255 masks).

Cases (each from a fresh cv::theRNG = cv2.setRNGSeed(0), like the JS test does):
  segnet:<name>   real segnet masks of photo-like inputs: the 30-seg photo / desk / low-res
                  pages, a page rotated by 6 degrees, a page curved like a book, a book photo
                  with a strip of the neighbor page, a two-page spread (shipping int8 segnet).
  <xform>:<page>  a fixture page's 05-filtered masks transformed alike: rotated, curved,
                  cropped (one staff, a third, cut staffs), flipped, scaled, noisy, thick lines,
                  clefs / bar lines removed (in part), staff lines interrupted, shine-through
                  duplicates, a neighbor page strip, pages stacked.
Per case: the error (if any), main.detect_staffs_in_image's stage values like 07-staff.json
(4 decimals), the staffs at full precision, repair_systems like 08-repaired.json, and
system_repair on random regroupings of the case's staffs (helpers and result).
Units (key 'units'): check_bbox_size on random boxes incl. negative / out-of-image corners and
unit sizes 0.8..40, find_horizontal_lines + filter_line_peaks on random column zones,
break_wide_fragments with other limits.
"""
import argparse
import hashlib
import json
import math
import os
import random
import sys

import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('fixtures')
ap.add_argument('--seg')
ap.add_argument('--only', help='comma separated case names: run only these and merge them into the existing JSON')
ap.add_argument('--units-only', action='store_true', help='recompute only the units (merge into the existing JSON)')
args = ap.parse_args()
FIX = args.fixtures

import homr.segmentation.inference_segnet as _seg  # noqa: E402
if args.seg:
    _seg.segnet_path_onnx = args.seg

from homr import color_adjust, constants  # noqa: E402
from homr import main as M  # noqa: E402
from homr import staff_detection as SD  # noqa: E402
from homr import note_detection as ND  # noqa: E402
from homr import system_repair as SR  # noqa: E402
from homr.autocrop import autocrop_with_offset  # noqa: E402
from homr.debug import Debug  # noqa: E402
from homr.model import InputPredictions, MultiStaff  # noqa: E402
from homr.noise_filtering import filter_predictions  # noqa: E402
from homr.point_mapping import identity  # noqa: E402
from homr.resize import resize_image  # noqa: E402

MASKS = ('staff', 'symbols', 'stems_rest', 'notehead', 'clefs_keys')
PAGES = ('02-entree-p1', 'ElCapitanMarch-p1', 'belle-p1', 'brahms-vals3-p1', 'bwv797-p1',
         'carcassi-op60-07-p1', 'no11-p1')


# ---- dump_stages.py's serialisation (4 decimals) ----
def ser(o, depth=0, seen=None):
    from enum import Enum
    if seen is None:
        seen = set()
    if depth > 12:
        return '<deep>'
    if o is None or isinstance(o, (bool, str)):
        return o
    if isinstance(o, (int, np.integer)):
        return int(o)
    if isinstance(o, (float, np.floating)):
        return round(float(o), 4)
    if isinstance(o, Enum):
        return o.name
    if isinstance(o, np.ndarray):
        if o.size <= 64:
            return ser(o.tolist(), depth + 1, seen)
        return {'__nd': list(o.shape), 'dtype': str(o.dtype),
                'sha1': hashlib.sha1(np.ascontiguousarray(o).tobytes()).hexdigest()[:12]}
    if isinstance(o, (list, tuple)):
        return [ser(x, depth + 1, seen) for x in o]
    if isinstance(o, dict):
        return {str(k): ser(v, depth + 1, seen) for k, v in o.items()}
    if id(o) in seen:
        return {'__ref': type(o).__name__}
    seen = seen | {id(o)}
    d = {'__type': type(o).__name__}
    for k, v in vars(o).items():
        if k in ('contours',):
            d[k + '_len'] = int(len(v)) if v is not None else 0
            continue
        if k.startswith('_') and k not in ('_y_tolerance',):
            continue
        d[k] = ser(v, depth + 1, seen)
    return d


def roundtrip(o):
    return json.loads(json.dumps(ser(o)))


def F(x):
    if x is None:
        return None
    x = float(x)
    return 'nan' if math.isnan(x) else x


def stf(s):
    return {'grid': [[F(p.x), [F(y) for y in p.y], F(p.angle), F(p.average_unit_size)] for p in s.grid],
            'min_x': F(s.min_x), 'max_x': F(s.max_x), 'min_y': F(s.min_y), 'max_y': F(s.max_y),
            'avg': F(s.average_unit_size), 'grand': bool(s.is_grandstaff), 'n_symbols': len(s.symbols)}


def stf_short(s):
    return {'min_x': F(s.min_x), 'max_x': F(s.max_x), 'min_y': F(s.min_y), 'max_y': F(s.max_y),
            'avg': F(s.average_unit_size), 'grand': bool(s.is_grandstaff), 'n_grid': len(s.grid),
            'n_symbols': len(s.symbols), 'y0': [F(y) for y in s.grid[0].y], 'x0': F(s.grid[0].x)}


def rows(multi):
    return [[stf_short(s) for s in row.staffs] for row in multi]


def mask_png(path):
    m = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    assert m is not None, path
    return (m > 0).astype(np.uint8)


def wmask(path, m):
    cv2.imwrite(path, (m > 0).astype(np.uint8) * 255)


def predictions(masks):
    h, w = masks['staff'].shape
    return InputPredictions(original=np.zeros((h, w, 3), np.uint8), preprocessed=np.zeros((h, w), np.uint8),
                            notehead=masks['notehead'], symbols=masks['symbols'], staff=masks['staff'],
                            clefs_keys=masks['clefs_keys'], stems_rest=masks['stems_rest'])


def detect(preds, image_path='page.png'):
    """main.detect_staffs_in_image on these predictions -> (recorded values, multi_staffs, error, debug)"""
    debug = Debug(preds.original, image_path, False)
    names = ('load_and_preprocess_predictions', 'predict_symbols', 'break_wide_fragments',
             'combine_noteheads_with_stems', 'detect_bar_lines', 'detect_staff', 'prepare_brace_dot_image',
             'add_notes_to_staffs', 'find_braces_brackets_and_grand_staff_lines',
             'estimate_unit_size_from_clefs', 'create_rotated_bounding_boxes')
    orig = {n: getattr(M, n) for n in names}
    v = {}

    def record(name, key):
        def wrapped(*a, **kw):
            out = orig[name](*a, **kw)
            v[key] = out
            return out
        setattr(M, name, wrapped)

    M.load_and_preprocess_predictions = lambda *a, **k: (preds, debug, identity)
    record('predict_symbols', 'symbols')
    record('break_wide_fragments', 'staff_fragments')
    record('combine_noteheads_with_stems', 'noteheads_with_stems')
    record('detect_staff', 'staffs')
    record('prepare_brace_dot_image', 'brace_dot_img')
    record('add_notes_to_staffs', 'notes')
    record('find_braces_brackets_and_grand_staff_lines', 'multi_staffs')
    record('estimate_unit_size_from_clefs', 'unit_size_from_clefs')

    def dbl(lines, unit):
        v['bar_lines_or_rests'] = lines
        v['average_note_head_height'] = unit
        out = orig['detect_bar_lines'](lines, unit)
        v['bar_line_boxes'] = out
        return out
    M.detect_bar_lines = dbl

    def crbb(img, *a, **kw):
        out = orig['create_rotated_bounding_boxes'](img, *a, **kw)
        if 'brace_dot_img' in v and img is v['brace_dot_img']:
            v['brace_dot'] = out
        return out
    M.create_rotated_bounding_boxes = crbb
    cfg = M.ProcessingConfig(False, False, False, False, -1, False, False, False, False)
    err = None
    ms = None
    try:
        ms, _img, _debug, _tf, _n, _map = M.detect_staffs_in_image(image_path, cfg)
    except Exception as e:  # noqa: BLE001
        err = type(e).__name__ + ': ' + str(e)
    finally:
        for n, fn in orig.items():
            setattr(M, n, fn)
    return v, ms, err, debug


def stage07(v):
    return {k: v[k] for k in ('staff_fragments', 'noteheads_with_stems', 'average_note_head_height',
                              'bar_lines_or_rests', 'bar_line_boxes', 'staffs', 'brace_dot', 'notes',
                              'multi_staffs') if k in v}


# ---- system_repair on regroupings of the staffs (as dump_staff.py) ----
def repair_info(multi):
    flat = SR._flatten_staffs(multi)
    index = {id(s): i for i, s in enumerate(flat)}
    info = {'flat': len(flat)}
    for strict in (False, True):
        pairs = SR._possible_grandstaffs(multi, strict)
        info['grandstaffs_strict' if strict else 'grandstaffs'] = sorted([index[a], index[b]] for a, b in pairs)
    info['vertical_gaps'] = [F(SR._vertical_gap(u, lo)) for u, lo in zip(flat, flat[1:])]
    layout = SR._common_layout(multi)
    info['common_layout'] = None if layout is None else list(layout)
    core = SR._find_periodic_core(flat)
    info['periodic_core'] = None if core is None else list(core)
    regrouped = SR._regroup_by_pattern(multi)
    info['regrouped'] = None if regrouped is None else rows(regrouped)
    info['unified'] = rows(SR._unify_grand_staffs(multi))
    if layout is not None:
        info['repaired_layout'] = rows(SR._repair_systems(multi, layout))
        info['repair_score'] = F(SR._repair_score(multi, layout))
    return info


def random_systems(n, rnd):
    systems, row, i = [], [], 0
    while i < n:
        if i + 1 < n and rnd.random() < 0.4:
            row.append([i, i + 1])
            i += 2
        else:
            row.append(i)
            i += 1
        if rnd.random() < 0.5:
            systems.append(row)
            row = []
    if row:
        systems.append(row)
    return systems


def build(staffs, systems):
    multi = []
    for row in systems:
        items = []
        for it in row:
            items.append(staffs[it[0]].merge(staffs[it[1]]) if isinstance(it, list) else staffs[it])
        multi.append(MultiStaff(items, []))
    return multi


def repair_cases(staffs, seed, count):
    rnd = random.Random(seed)
    out = []
    for r in range(count):
        systems = random_systems(len(staffs), rnd)
        try:
            multi = build(staffs, systems)
        except IndexError:
            out.append({'systems': systems, 'build_error': 'IndexError'})
            continue
        case = {'systems': systems, 'input': rows(multi), 'info': repair_info(multi)}
        try:
            case['repaired'] = rows(SR.repair_systems(Debug(None, 'x.png', False), multi))
        except Exception as e:  # noqa: BLE001
            case['error'] = type(e).__name__ + ': ' + str(e)
        out.append(case)
    return out


# ---- the cases ----
def segnet_masks(image):
    cropped, _ = autocrop_with_offset(image)
    resized = resize_image(cropped)
    pre = color_adjust.apply_clahe(resized)
    preds = M.get_predictions(resized, pre, 'audit.png', False, False)
    preds = filter_predictions(preds, Debug(preds.original, 'audit.png', False))
    preds.staff = SD.make_lines_stronger(preds.staff, (1, 2))
    return {n: (getattr(preds, n) > 0).astype(np.uint8) for n in MASKS}


def page_masks(page):
    return {n: mask_png(os.path.join(FIX, page, '05-filtered-%s.png' % n)) for n in MASKS}


def each(masks, fn):
    return {n: np.ascontiguousarray(fn(m)) for n, m in masks.items()}


def rotate(m, deg):
    h, w = m.shape
    rot = cv2.getRotationMatrix2D((w / 2, h / 2), deg, 1.0)
    return cv2.warpAffine(m, rot, (w, h), flags=cv2.INTER_NEAREST, borderValue=0)


def curve(m, amp, period, phase=0.0):
    h, w = m.shape
    xs, ys = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    my = ys + amp * np.sin(2 * np.pi * xs / period + phase).astype(np.float32)
    return cv2.remap(m, xs, my, cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=0)


def staff_rows(page):
    with open(os.path.join(FIX, page, '07-staff.json')) as f:
        staffs = json.load(f)['staffs']
    return [(s['min_y'], s['max_y']) for s in staffs]


def mask_cases():
    cases = []
    rng = np.random.default_rng(11)

    def add(name, masks):
        cases.append((name, masks))

    add('rot+2:bwv797-p1', each(page_masks('bwv797-p1'), lambda m: rotate(m, 2.0)))
    add('rot-5:ElCapitanMarch-p1', each(page_masks('ElCapitanMarch-p1'), lambda m: rotate(m, -5.0)))
    add('rot+9:carcassi-op60-07-p1', each(page_masks('carcassi-op60-07-p1'), lambda m: rotate(m, 9.0)))
    add('curve:brahms-vals3-p1', each(page_masks('brahms-vals3-p1'), lambda m: curve(m, 14, 1900)))
    add('wave:no11-p1', each(page_masks('no11-p1'), lambda m: curve(m, 6, 520, 0.7)))
    rows_ = staff_rows('carcassi-op60-07-p1')
    y0, y1 = rows_[0]
    add('single:carcassi-op60-07-p1', each(page_masks('carcassi-op60-07-p1'),
                                           lambda m: m[max(0, int(y0) - 120):int(y1) + 120]))
    rows_ = staff_rows('bwv797-p1')
    add('grand-only:bwv797-p1', each(page_masks('bwv797-p1'),
                                     lambda m: m[max(0, int(rows_[0][0]) - 150):int(rows_[1][1]) + 150]))
    add('third:belle-p1', each(page_masks('belle-p1'), lambda m: m[: m.shape[0] // 3]))
    rows_ = staff_rows('02-entree-p1')
    cut = int((rows_[1][0] + rows_[1][1]) / 2)
    add('cut-bottom:02-entree-p1', each(page_masks('02-entree-p1'), lambda m: m[:cut]))
    cut2 = int((rows_[2][0] + rows_[2][1]) / 2)
    add('cut-top:02-entree-p1', each(page_masks('02-entree-p1'), lambda m: m[cut2:]))
    add('narrow:ElCapitanMarch-p1', each(page_masks('ElCapitanMarch-p1'), lambda m: m[:, : int(m.shape[1] * 0.45)]))
    add('flip:belle-p1', each(page_masks('belle-p1'), lambda m: m[:, ::-1]))
    add('half:no11-p1', each(page_masks('no11-p1'), lambda m: cv2.resize(m, None, fx=0.5, fy=0.5,
                                                                         interpolation=cv2.INTER_NEAREST)))
    add('big:bwv797-p1', each(page_masks('bwv797-p1'), lambda m: cv2.resize(m, None, fx=1.6, fy=1.6,
                                                                            interpolation=cv2.INTER_NEAREST)))
    m = page_masks('brahms-vals3-p1')
    m['clefs_keys'] = np.zeros_like(m['clefs_keys'])
    add('noclefs:brahms-vals3-p1', m)
    m = page_masks('02-entree-p1')
    m['stems_rest'] = np.zeros_like(m['stems_rest'])
    add('nobars:02-entree-p1', m)
    m = page_masks('ElCapitanMarch-p1')
    h = m['staff'].shape[0]
    for n in ('clefs_keys', 'stems_rest'):
        m[n] = m[n].copy()
        m[n][h // 2:] = 0
    add('lower-unanchored:ElCapitanMarch-p1', m)
    m = page_masks('no11-p1')
    h = m['staff'].shape[0]
    m['clefs_keys'] = m['clefs_keys'].copy()
    m['clefs_keys'][h // 3:] = 0
    m['stems_rest'] = np.zeros_like(m['stems_rest'])
    add('clefs-top-only:no11-p1', m)
    m = page_masks('belle-p1')
    for n in ('staff', 'symbols'):
        noise = rng.random(m[n].shape) < 0.002
        holes = rng.random(m[n].shape) < 0.04
        m[n] = ((m[n] > 0) & ~holes | noise).astype(np.uint8)
    add('noise:belle-p1', m)
    m = page_masks('carcassi-op60-07-p1')
    m['staff'] = cv2.dilate(m['staff'], np.ones((3, 3), np.uint8))
    add('thick:carcassi-op60-07-p1', m)
    m = page_masks('bwv797-p1')
    m['staff'] = m['staff'].copy()
    m['staff'][:, 880:1010] = 0
    add('gap:bwv797-p1', m)
    m = page_masks('02-entree-p1')
    m['staff'] = m['staff'].copy()
    m['staff'][:, 700:760] = 0
    m['staff'][:, 1300:1330] = 0
    add('gaps:02-entree-p1', m)
    m = page_masks('ElCapitanMarch-p1')
    sh = np.zeros_like(m['staff'])
    sh[9:, 4:] = m['staff'][:-9, :-4]
    m['staff'] = np.maximum(m['staff'], sh)
    add('shine:ElCapitanMarch-p1', m)
    a, b = page_masks('belle-p1'), page_masks('bwv797-p1')
    add('neighbor:belle-p1+bwv797-p1', {n: np.hstack([a[n][:, -480:], b[n]]) for n in MASKS})
    a, b = page_masks('no11-p1'), page_masks('carcassi-op60-07-p1')
    add('spread:no11-p1+carcassi-op60-07-p1', {n: np.hstack([a[n], b[n]]) for n in MASKS})
    a = page_masks('brahms-vals3-p1')
    add('stacked:brahms-vals3-p1', {n: np.vstack([a[n], a[n]]) for n in MASKS})
    m = page_masks('belle-p1')
    m['notehead'] = np.zeros_like(m['notehead'])
    m['stems_rest'] = np.zeros_like(m['stems_rest'])
    add('clefs-only:belle-p1', m)
    # rotated, the last / first staff's outer line leaves the page half way: its grid is
    # extrapolated beyond the image and filter_edge_of_vision drops it (rows found with homr)
    add('edge-bottom:bwv797-p1', each(page_masks('bwv797-p1'), lambda m: rotate(m, 1.5)[:2272]))
    add('edge-top:ElCapitanMarch-p1', each(page_masks('ElCapitanMarch-p1'), lambda m: rotate(m, 1.5)[338:]))
    return cases


def segnet_cases():
    out = []
    for name in ('photo', 'desk-shadow', 'low-res', 'dark-frame'):
        p = os.path.join(FIX, '30-seg-%s-00-input.png' % name)
        if os.path.isfile(p):
            out.append(('segnet:' + name, cv2.imread(p)))
    page = cv2.imread(os.path.join(FIX, 'bwv797-p1', '00-input.png'))
    other = cv2.imread(os.path.join(FIX, 'no11-p1', '00-input.png'))
    if page is not None:
        h, w = page.shape[:2]
        rot = cv2.getRotationMatrix2D((w / 2, h / 2), 6.0, 1.0)
        out.append(('segnet:rot6', cv2.warpAffine(page, rot, (w, h), flags=cv2.INTER_LINEAR,
                                                  borderValue=(255, 255, 255))))
        xs, ys = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
        bend = (40 * np.sin(np.pi * xs / w)).astype(np.float32)
        out.append(('segnet:curved', cv2.remap(page, xs, ys - bend + 20, cv2.INTER_LINEAR,
                                               borderMode=cv2.BORDER_CONSTANT, borderValue=(255, 255, 255))))
        if other is not None:
            strip = other[:, -int(other.shape[1] * 0.3):]
            strip = cv2.resize(strip, (strip.shape[1], h))
            book = np.hstack([strip, np.full((h, 40, 3), 90, np.uint8), page])
            rot = cv2.getRotationMatrix2D((book.shape[1] / 2, h / 2), -1.5, 1.0)
            out.append(('segnet:book', cv2.warpAffine(book, rot, (book.shape[1], h), flags=cv2.INTER_LINEAR,
                                                      borderValue=(255, 255, 255))))
            out.append(('segnet:spread', np.hstack([other, page])))
    return out


def run_case(name, masks, seed):
    safe = name.replace(':', '_').replace('+', '_')
    for n in MASKS:
        wmask(os.path.join(FIX, '15-staff-audit-%s-%s.png' % (safe, n)), masks[n])
    masks = {n: mask_png(os.path.join(FIX, '15-staff-audit-%s-%s.png' % (safe, n))) for n in MASKS}
    cv2.setRNGSeed(0)
    v, ms, err, debug = detect(predictions(masks))
    out = {'name': name, 'masks': '15-staff-audit-%s' % safe, 'error': err,
           'shape': list(masks['staff'].shape)}
    if 'average_note_head_height' in v:
        out['average_note_head_height'] = F(v['average_note_head_height'])
    if 'unit_size_from_clefs' in v:
        out['unit_size_from_clefs'] = F(v['unit_size_from_clefs'])
    if 'staffs' in v:
        out['staffs'] = [stf(s) for s in v['staffs']]
    out['stage07'] = roundtrip(stage07(v))
    if err is None:
        out['repaired'] = roundtrip({'multi_staffs': SR.repair_systems(debug, ms)})
        out['repair'] = repair_cases(v['staffs'], seed, 10)
    print(name, '->', err, 'staffs', len(v.get('staffs') or []),
          'systems', None if ms is None else [len(r.staffs) for r in ms], file=sys.stderr)
    return out


# ---- units ----
def unit_bbox(rnd):
    out = []
    for page in PAGES[:4]:
        nh = mask_png(os.path.join(FIX, page, '05-filtered-notehead.png'))
        h, w = nh.shape
        ys, xs = np.nonzero(nh)
        for _ in range(250):
            k = rnd.randrange(len(ys))
            cy, cx = int(ys[k]), int(xs[k])
            bw, bh = rnd.randint(0, 90), rnd.randint(0, 90)
            if rnd.random() < 0.25:  # near / beyond the image edges
                cx = rnd.choice([rnd.randint(-30, 20), rnd.randint(w - 20, w + 30)])
                cy = rnd.choice([rnd.randint(-30, 20), rnd.randint(h - 20, h + 30), cy])
            b = [cx - bw // 2, cy - bh // 2, cx + (bw + 1) // 2, cy + (bh + 1) // 2]
            u = rnd.choice([0.8, 1.5, 3.0, 7.5, 12.0, 16.3, 21.0, 40.0, rnd.uniform(0.8, 40)])
            out.append({'page': page, 'bbox': b, 'unit': u,
                        'out': [list(map(int, r)) for r in ND.check_bbox_size(tuple(b), nh, u)]})
    return out


def unit_lines(rnd):
    out = []
    for page in PAGES:
        staff = mask_png(os.path.join(FIX, page, '05-filtered-staff.png'))
        h, w = staff.shape
        for _ in range(40):
            a = rnd.randint(-5, w)
            zone = range(max(a, 0), min(w, max(a, 0) + rnd.choice([1, 3, 10, 25, 60, 200, 900])))
            unit = rnd.choice([3.0, 8.0, 12.5, 17.0, 25.0, 60.0, rnd.uniform(2, 40)])
            sl = staff[:, zone]
            lines = SD.find_horizontal_lines(sl, unit)
            entry = {'page': page, 'zone': [zone.start, zone.stop], 'unit': unit, 'lines': lines}
            out.append(entry)
    return out


def unit_peaks(rnd):
    out = []
    for _ in range(300):
        n = rnd.randint(5, 40)
        peaks = np.array(sorted(rnd.sample(range(0, 400), n)), dtype=np.int64)
        norm = np.array([rnd.uniform(-1, 20) for _ in range(401)])
        ratio = rnd.choice([1.5, 1.5, 1.1, 3.0])
        valid, groups = SD.filter_line_peaks(peaks, norm, ratio)
        out.append({'peaks': peaks.tolist(), 'norm': norm.tolist(), 'ratio': ratio,
                    'valid': [bool(x) for x in valid], 'groups': [int(g) for g in groups]})
    return out


def unit_break(rnd):
    from homr.bounding_boxes import create_rotated_bounding_boxes
    out = []
    for page in PAGES[:3]:
        staff = mask_png(os.path.join(FIX, page, '05-filtered-staff.png'))
        frags = create_rotated_bounding_boxes(staff, skip_merging=True, min_size=(5, 1), max_size=(10000, 100))
        for limit in (7, 30, 64, 250):
            res = SD.break_wide_fragments(frags, limit)
            out.append({'page': page, 'limit': limit, 'n': len(res),
                        'boxes': [[[F(b.box[0][0]), F(b.box[0][1])], [F(b.box[1][0]), F(b.box[1][1])], F(b.box[2])]
                                  for b in res],
                        'contours_len': [int(len(b.contours)) for b in res]})
    return out


def anc(a):
    return {'symbol': bx(a.symbol.box), 'unit_sizes': [F(u) for u in a.unit_sizes], 'avg': F(a.average_unit_size),
            'min_y': F(a.min_y), 'max_y': F(a.max_y), 'y_range': [a.y_range.start, a.y_range.stop],
            'zone': [a.zone.start, a.zone.stop], 'lines': [[bx(f.box) for f in line.staff_fragments] for line in a.staff_lines]}


def bx(b):
    return [[F(b[0][0]), F(b[0][1])], [F(b[1][0]), F(b[1][1])], F(b[2])]


def shifted_symbols(boxes, fractions):
    from homr.bounding_boxes import RotatedBoundingBox
    out = []
    for b in boxes:
        u = b.size[1] / 4
        for k in fractions:
            out.append(RotatedBoundingBox(((b.center[0], b.center[1] + k * u), b.box[1], b.box[2]), b.contours, b.debug_id))
    return out


def raw_summary(s):
    return {'box': bx(s.box), 'id': int(s.staff_id), 'min_x': F(s.min_x), 'max_x': F(s.max_x), 'min_y': F(s.min_y),
            'max_y': F(s.max_y), 'contours_len': int(len(s.contours)),
            'lines': [[bx(f.box) for f in line.staff_fragments] for line in s.lines],
            'anchors': [bx(a.symbol.box) for a in s.anchors]}


def unit_dups():
    """remove_duplicate_staffs / merge_staffs_in_same_row on lists of a page's raw staffs and their
    merges (a merged staff overlaps both parts: the 2+ duplicates branch, replacement by anchors)."""
    from homr.bounding_boxes import create_rotated_bounding_boxes
    out = []
    for page in PAGES[:3]:
        m = {n: mask_png(os.path.join(FIX, page, '05-filtered-%s.png' % n)) for n in ('staff', 'clefs_keys')}
        frags = SD.break_wide_fragments(create_rotated_bounding_boxes(m['staff'], skip_merging=True, min_size=(5, 1),
                                                                      max_size=(10000, 100)))
        clefs = create_rotated_bounding_boxes(m['clefs_keys'], min_size=(20, 40), max_size=(1000, 1000))
        raws = SD.find_raw_staffs_by_connecting_line_fragments(SD.find_staff_anchors(frags, clefs, are_clefs=True), frags)
        r = raws[:4]
        if len(r) < 3:
            continue
        m01, m12 = r[0].merge(r[1]), r[1].merge(r[2])
        lists = {'a-b-ab': [r[0], r[1], m01], 'ab-a-b': [m01, r[0], r[1]], 'a-ab': [r[0], m01], 'ab-a': [m01, r[0]],
                 'a-b-c-ab-bc': [r[0], r[1], r[2], m01, m12], 'ab-bc-b': [m01, m12, r[1]], 'all': list(raws),
                 'rev': list(reversed(raws)), 'a-a': [r[0], r[0]]}
        for name, lst in lists.items():
            dedup = SD.remove_duplicate_staffs(lst)
            out.append({'page': page, 'name': name, 'dedup': [raw_summary(s) for s in dedup],
                        'rows': [raw_summary(s) for s in SD.merge_staffs_in_same_row(dedup)]})
    return out


def unit_raises():
    """What homr raises on degenerate direct calls (the pipeline raises 'No staffs found' before)."""
    from homr import brace_dot_detection as BD
    out = []
    for name, fn in (('_filter_for_tall_elements([], [])', lambda: BD._filter_for_tall_elements([], [])),
                     ('find_braces_brackets_and_grand_staff_lines(debug, [], [])',
                      lambda: BD.find_braces_brackets_and_grand_staff_lines(Debug(None, 'x.png', False), [], []))):
        try:
            fn()
            out.append({'call': name, 'error': None})
        except Exception as e:  # noqa: BLE001
            out.append({'call': name, 'error': type(e).__name__ + ': ' + str(e)})
    return out


def unit_anchors(rnd):
    """find_staff_anchors on vertically shifted bar line / clef candidates (anchors that fail
    begins_or_ends_on_one_staff_line) and begins_or_ends_on_one_staff_line itself."""
    from homr.bar_line_detection import prepare_bar_line_image
    from homr.bounding_boxes import create_rotated_bounding_boxes
    out = []
    for page in PAGES[:3]:
        m = {n: mask_png(os.path.join(FIX, page, '05-filtered-%s.png' % n)) for n in ('staff', 'stems_rest', 'clefs_keys')}
        frags = SD.break_wide_fragments(create_rotated_bounding_boxes(m['staff'], skip_merging=True, min_size=(5, 1),
                                                                      max_size=(10000, 100)))
        bars = create_rotated_bounding_boxes(prepare_bar_line_image(m['stems_rest']), skip_merging=True, min_size=(1, 5))
        bars = [b for b in bars if b.size[1] > 40][:30]
        clefs = create_rotated_bounding_boxes(m['clefs_keys'], min_size=(20, 40), max_size=(1000, 1000))
        fr = (-3.0, -1.6, -0.7, 0.0, 0.9, 2.2, 3.5)
        sym = shifted_symbols(bars, fr)
        bar_anchors = SD.find_staff_anchors(frags, sym, are_clefs=False)
        clef_anchors = SD.find_staff_anchors(frags, shifted_symbols(clefs[:12], (-2.0, 0.0, 1.3)), are_clefs=True)
        begins = []
        for a in clef_anchors[:8]:
            for s in sym[:120]:
                begins.append(bool(SD.begins_or_ends_on_one_staff_line(s, a.staff_lines, a.average_unit_size)))
        out.append({'page': page, 'n_bars': len(bars), 'n_clefs': min(len(clefs), 12), 'fractions': fr,
                    'bar_anchors': [anc(a) for a in bar_anchors], 'clef_anchors': [anc(a) for a in clef_anchors],
                    'begins': begins})
    return out


def _np_default(o):
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return F(o)
    if isinstance(o, np.bool_):
        return bool(o)
    raise TypeError(type(o).__name__)


def main():
    path = os.path.join(FIX, '15-staff-audit.json')
    only = set(args.only.split(',')) if args.only else None
    merge = (only is not None or args.units_only) and os.path.isfile(path)
    old = {'cases': [], 'units': None}
    if merge:
        with open(path) as f:
            old = json.load(f)
    cases = []
    seed = 500
    if not args.units_only:
        for name, image in segnet_cases():
            if not only or name in only:
                cases.append(run_case(name, segnet_masks(image), seed))
            seed += 1
        for name, masks in mask_cases():
            if not only or name in only:
                cases.append(run_case(name, masks, seed))
            seed += 1
    if merge:
        done = {c['name']: c for c in cases}
        cases = [done.pop(c['name'], c) for c in old['cases']] + list(done.values())
    units = old['units']
    if units is None or not merge or args.units_only:
        rnd = random.Random(15)
        units = {'bbox': unit_bbox(rnd), 'lines': unit_lines(rnd), 'peaks': unit_peaks(rnd), 'break': unit_break(rnd),
                 'anchors': unit_anchors(random.Random(16)), 'dups': unit_dups(), 'raises': unit_raises()}
    with open(path, 'w') as f:
        json.dump({'cases': cases, 'units': units}, f, separators=(',', ':'), default=_np_default)
    print('wrote', path, len(cases), 'cases', file=sys.stderr)


main()
