"""Reference dumps of homr's staff stage for the JS port (js/omr/staff_detection.js,
note_detection.js, brace_dot_detection.js, system_repair.js, staff_regions.js;
tests/omr-staff.test.js).

usage:
  python -I tools/omr/dump_staff.py FIXTURES             the pages (all of them, sorted: see theRNG)
  python -I tools/omr/dump_staff.py FIXTURES --edge [--seg SEGNET.onnx]
                                                          the edge cases (cover pages, edited masks)

Per page, FIXTURES/<page>/:
  14-staff-prestrong.png  the staff mask after filter_predictions and before make_lines_stronger,
                          rebuilt from 04-mask-*.png (asserted: make_lines_stronger of it is
                          05-filtered-staff.png, the other masks equal 05-filtered-*.png)
  14-staff-trace.json     main.detect_staffs_in_image from the 05-filtered masks, every step of
                          detect_staff with its intermediates (anchors, raw staffs, five-line
                          groups, filter_line_peaks, resampled grids), full float precision.
                          Asserted first: the same run reproduces 06-symbols.json, 07-staff.json
                          and 08-repaired.json exactly (dump_stages' serialisation).
  14-staff-units.json     functions on their own: check_bbox_size variants on the notehead mask,
                          _extrapolate_missing_staff_line (dead code in homr, ported anyway),
                          estimate_unit_size_from_clefs, StaffLineSegment.is_overlapping,
                          prepare_staff_image, system_repair scenarios (regroupings of the
                          page's staffs) with its helpers, StaffRegions queries.

--edge writes FIXTURES/14-staff-edge.json (+ 14-staff-edge-<case>-<mask>.png): pages that must
raise homr's "No staffs found" / "No noteheads or clefs found" (the SheetLab engine skips cover
pages by these messages) and pages without noteheads (unit size from the clefs):
  blank, text       generated pages run through the shipping segnet (--seg), masks dumped
  <page>:<edit>     a fixture page's 05 masks with masks blanked (the JS test repeats the edit)
Every case starts from a fresh cv::theRNG (cv2.setRNGSeed(0) == a new process), as the test does.

The pages share cv::theRNG through fitEllipse (create_bounding_ellipses), so 06/07 of a page only
reproduce when every page before it ran in the same process: always run all pages.
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
ap.add_argument('--edge', action='store_true')
ap.add_argument('--seg')
args = ap.parse_args()
FIX = args.fixtures

import homr.segmentation.inference_segnet as _seg  # noqa: E402
if args.seg:
    _seg.segnet_path_onnx = args.seg

from homr import color_adjust, constants  # noqa: E402
from homr import main as M  # noqa: E402
from homr import staff_detection as SD  # noqa: E402
from homr import note_detection as ND  # noqa: E402
from homr import brace_dot_detection as BD  # noqa: E402
from homr import system_repair as SR  # noqa: E402
from homr.autocrop import autocrop_with_offset  # noqa: E402
from homr.bounding_boxes import create_rotated_bounding_boxes  # noqa: E402
from homr.debug import Debug  # noqa: E402
from homr.model import InputPredictions, MultiStaff  # noqa: E402
from homr.noise_filtering import filter_predictions  # noqa: E402
from homr.point_mapping import identity  # noqa: E402
from homr.resize import resize_image  # noqa: E402
from homr.staff_regions import StaffRegions  # noqa: E402

MASKS = ('staff', 'symbols', 'stems_rest', 'notehead', 'clefs_keys')


# ---- dump_stages.py's serialisation (4 decimals), to check the fixtures are reproduced ----
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


# ---- full precision summaries for the trace ----
def F(x):
    if x is None:
        return None
    x = float(x)
    return 'nan' if math.isnan(x) else x


def bx(b):
    return [[F(b[0][0]), F(b[0][1])], [F(b[1][0]), F(b[1][1])], F(b[2])]


def seg(line):
    return {'id': int(line.debug_id), 'frags': [bx(f.box) for f in line.staff_fragments],
            'min_x': F(line.min_x), 'max_x': F(line.max_x), 'min_y': F(line.min_y), 'max_y': F(line.max_y)}


def anc(a):
    return {'symbol': bx(a.symbol.box), 'unit_sizes': [F(u) for u in a.unit_sizes],
            'avg': F(a.average_unit_size), 'min_y': F(a.min_y), 'max_y': F(a.max_y),
            'y_range': [a.y_range.start, a.y_range.stop], 'zone': [a.zone.start, a.zone.stop],
            'lines': [seg(line) for line in a.staff_lines]}


def raw(s):
    return {'box': bx(s.box), 'id': int(s.staff_id), 'min_x': F(s.min_x), 'max_x': F(s.max_x),
            'min_y': F(s.min_y), 'max_y': F(s.max_y), 'contours_len': int(len(s.contours)),
            'lines': [seg(line) for line in s.lines], 'anchors': [bx(a.symbol.box) for a in s.anchors]}


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
    """main.detect_staffs_in_image on these predictions; -> (recorded values, multi_staffs, error, debug)"""
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
            if name == 'predict_symbols':  # main.py replaces staff_fragments right after
                v['symbols06'] = roundtrip({'noteheads': out.noteheads, 'staff_fragments': out.staff_fragments,
                                            'clefs_keys': out.clefs_keys, 'stems_rest': out.stems_rest,
                                            'bar_lines': out.bar_lines})
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

    def dbl(lines, unit):  # bar_lines_or_rests and the unit size are its arguments
        v['bar_lines_or_rests'] = lines
        v['average_note_head_height'] = unit
        out = orig['detect_bar_lines'](lines, unit)
        v['bar_line_boxes'] = out
        return out
    M.detect_bar_lines = dbl

    def crbb(img, *a, **kw):  # the brace/dot boxes: the call on brace_dot_img
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
        err = str(e)
    finally:
        for n, fn in orig.items():
            setattr(M, n, fn)
    return v, ms, err, debug


def stage07(v):
    return {k: v[k] for k in ('staff_fragments', 'noteheads_with_stems', 'average_note_head_height',
                              'bar_lines_or_rests', 'bar_line_boxes', 'staffs', 'brace_dot', 'notes',
                              'multi_staffs')}


def line_peaks(vertical_slice, unit_size):
    """find_horizontal_lines up to filter_line_peaks (its valid peaks are not used by homr)."""
    count = np.zeros(len(vertical_slice), dtype=np.uint16)
    sub_ys, _ = np.where(vertical_slice > 0)
    for y in sub_ys:
        count[y] += 1
    count = np.insert(count, [0, len(count)], [0, 0])
    if np.std(count) == 0:
        return None
    norm = (count - np.mean(count)) / np.std(count)
    centers, _ = SD.find_peaks.find_peaks(norm, height=0.0, distance=0.7 * unit_size, prominence=1)
    centers -= 1
    if len(centers) < constants.number_of_lines_on_a_staff:
        return {'centers': [int(c) for c in centers]}
    valid, groups = SD.filter_line_peaks(centers, norm[1:-1])
    return {'centers': [int(c) for c in centers], 'valid': [bool(x) for x in valid],
            'groups': [int(g) for g in groups]}


def zone_trace(image, zones, unit_size):
    out = []
    for z in zones:
        sl = image[:, z]
        out.append({'zone': [z.start, z.stop], 'unit': F(unit_size), 'lines': SD.find_horizontal_lines(sl, unit_size),
                    'peaks': line_peaks(sl, unit_size)})
    return out


def trace_detect_staff(image, frags, clefs, bars):
    """detect_staff step by step (the same calls in the same order)."""
    t = {}
    clef_anchors = SD.find_staff_anchors(frags, clefs, are_clefs=True)
    t['clef_anchors'] = [anc(a) for a in clef_anchors]
    if clef_anchors:
        avg = float(np.mean([a.average_unit_size for a in clef_anchors]))
        t['clef_zones'] = zone_trace(image, SD.init_zone(clef_anchors, image.shape), avg)
    possible = SD.predict_other_anchors_from_clefs(clef_anchors, image)
    t['possible_other_clefs'] = [bx(b.box) for b in possible]
    other = SD.find_staff_anchors(frags, possible, are_clefs=True)
    t['other_anchors'] = [anc(a) for a in other]
    bar_anchors = SD.find_staff_anchors(frags, bars, are_clefs=False)
    t['bar_anchors'] = [anc(a) for a in bar_anchors]
    anchors = SD.filter_unusual_anchors(clef_anchors + other + bar_anchors)
    t['staff_anchors'] = [anc(a) for a in anchors]
    dups = SD.find_raw_staffs_by_connecting_line_fragments(anchors, frags)
    t['raw_with_duplicates'] = [raw(s) for s in dups]
    raws = SD.remove_duplicate_staffs(dups)
    t['raw_staffs'] = [raw(s) for s in raws]
    merged = SD.merge_staffs_in_same_row(raws)
    t['merged_rows'] = [raw(s) for s in merged]
    # find_staffs_without_clef, inside
    if len(merged) and len(clef_anchors):
        unit = float(np.mean([a.average_unit_size for a in clef_anchors]))
        width = image.shape[1]
        slice_width = max(10, int(2 * unit))
        zones = [range(int(f * width), min(width, int(f * width) + slice_width)) for f in SD.slices_across_page]
        t['nc_zones'] = zone_trace(image, zones, unit)
        boxes = SD._find_five_line_groups(image, zones, unit)
        t['nc_boxes'] = [bx(b.box) for b in boxes]
        nc_anchors = SD.filter_unusual_anchors(SD.find_staff_anchors(frags, boxes, are_clefs=True))
        t['nc_anchors'] = [anc(a) for a in nc_anchors]
        cands = SD.remove_duplicate_staffs(SD.find_raw_staffs_by_connecting_line_fragments(nc_anchors, frags))
        t['nc_candidates'] = [raw(s) for s in cands]
    without = SD.find_staffs_without_clef(merged, clef_anchors, frags, image)
    t['staffs_without_clef'] = [raw(s) for s in without]
    all_raw = merged + without
    resampled = SD.resample_staffs(all_raw)
    t['resampled'] = [stf(s) for s in resampled]
    edge = SD.filter_edge_of_vision(resampled, image.shape)
    t['edge_kept'] = [resampled.index(s) for s in edge]
    neighbor = SD.filter_neighbor_page(edge)
    t['neighbor_kept'] = [resampled.index(s) for s in neighbor]
    final = SD.sort_staffs_top_to_bottom(neighbor)
    t['final_order'] = [resampled.index(s) for s in final]
    real = SD.detect_staff(Debug(None, 'x.png', False), image, frags, clefs, bars)
    assert [stf(s) for s in real] == [stf(s) for s in final], 'traced detect_staff differs from detect_staff'
    return t, clef_anchors, bar_anchors, merged


def bbox_variants(masks, noteheads, unit_sizes):
    out = []
    for n in noteheads[:40]:
        b = [int(n.top_left[0]), int(n.top_left[1]), int(n.bottom_right[0]), int(n.bottom_right[1])]
        w, h = b[2] - b[0], b[3] - b[1]
        variants = [b, [b[0], b[1], b[2] + w, b[3]], [b[0], b[1], b[2], b[3] + 2 * h],
                    [b[0] - w, b[1] - h, b[2] + w, b[3] + h], [b[0], b[1] - 3, b[2] + 2 * w, b[3] + 3]]
        for v in variants:
            for u in unit_sizes:
                out.append({'bbox': v, 'unit': F(u),
                            'out': [list(map(int, r)) for r in ND.check_bbox_size(tuple(v), masks['notehead'], u)]})
    return out


DRAW_COLORS = [(0, 255, 0), (0, 0, 255), (255, 0, 0), (255, 0, 255)]


def drawing(shape, clef_anchors, bar_anchors, raw_staffs, noteheads_with_stems):
    """draw_onto_image of the stage's own classes (Debug's pictures): sha1 of each picture."""
    out = {}
    for name, items in (('anchors', clef_anchors[:6] + bar_anchors[:6]), ('raw_staffs', raw_staffs[:4]),
                        ('noteheads', noteheads_with_stems[:40])):
        img = np.zeros((shape[0], shape[1], 3), np.uint8)
        for i, item in enumerate(items):
            item.draw_onto_image(img, DRAW_COLORS[i % len(DRAW_COLORS)])
        out[name] = hashlib.sha1(img.tobytes()).hexdigest()
    return out


def extrapolate_cases(anchors):
    out = []
    for a in anchors[:12]:
        ordered = sorted(a.staff_lines, key=lambda line: line.staff_fragments[0].center[1])
        unit = round(a.symbol.size[1] / (constants.number_of_lines_on_a_staff - 1))
        for drop in (None, 0, 4, 2):
            lines = list(ordered) if drop is None else [line for i, line in enumerate(ordered) if i != drop]
            for u in (unit, int(round(a.average_unit_size))):
                res = SD._extrapolate_missing_staff_line(lines, a.symbol, u)
                out.append({'anchor_symbol': bx(a.symbol.box), 'drop': drop, 'unit': u,
                            'out': None if res is None else [seg(line) for line in res]})
    return out


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


def scenarios(staffs, seed):
    """Regroupings of the page's single staffs: [[item, ...] per system], item = i (staff i)
    or [i, i + 1] (staffs i and i + 1 merged into a grand staff)."""
    n = len(staffs)
    rnd = random.Random(seed)
    sc = [('singles', [[i] for i in range(n)]), ('one-system', [list(range(n))])]
    if n >= 2:
        pairs = [[[i, i + 1]] for i in range(0, n - 1, 2)] + ([[n - 1]] if n % 2 else [])
        sc.append(('grand', pairs))
        sc.append(('pairs-as-systems', [[i, i + 1] if i + 1 < n else [i] for i in range(0, n, 2)]))
        if len(pairs) >= 3:
            missed = [p for p in pairs]
            k = 1
            missed = missed[:k] + [[missed[k][0][0]], [missed[k][0][1]]] + missed[k + 1:]
            sc.append(('grand-missed-brace', missed))
            sc.append(('grand-plus-single', pairs + ([] if n % 2 else [])))
            sc.append(('grand-two-per-system', [sum(pairs[i:i + 2], []) for i in range(0, len(pairs), 2)]))
        if n >= 3:
            voice_piano = []
            i = 0
            while i + 2 < n:
                voice_piano.append([i, [i + 1, i + 2]])
                i += 3
            voice_piano += [[j] for j in range(i, n)]
            sc.append(('voice-piano', voice_piano))
            sc.append(('voice-piano-flat', [[it] for row in voice_piano for it in row]))
    for r in range(6):
        systems, row, i = [], [], 0
        while i < n:
            if i + 1 < n and rnd.random() < 0.35:
                row.append([i, i + 1])
                i += 2
            else:
                row.append(i)
                i += 1
            if rnd.random() < 0.55:
                systems.append(row)
                row = []
        if row:
            systems.append(row)
        sc.append(('random-%d' % r, systems))
    return sc


def build(staffs, systems):
    multi = []
    for row in systems:
        items = []
        for it in row:
            if isinstance(it, list):
                items.append(staffs[it[0]].merge(staffs[it[1]]))
            else:
                items.append(staffs[it])
        multi.append(MultiStaff(items, []))
    return multi


def repair_cases(staffs, seed):
    out = []
    for name, systems in scenarios(staffs, seed):
        try:
            multi = build(staffs, systems)
        except IndexError:  # a merge without common x positions: Staff([])
            out.append({'name': name, 'systems': systems, 'build_error': 'IndexError'})
            continue
        case = {'name': name, 'systems': systems, 'input': rows(multi), 'info': repair_info(multi)}
        try:
            case['repaired'] = rows(SR.repair_systems(Debug(None, 'x.png', False), multi))
        except Exception as e:  # noqa: BLE001
            case['error'] = type(e).__name__ + ': ' + str(e)
        out.append(case)
    return out


def regions(multi):
    r = StaffRegions(multi)
    ys = [0, -5, 1e6]
    for c in r.centers:
        ys += [c[0] - 1, c[0], (c[0] + c[1]) / 2, c[1], c[1] + 1]
    return {'centers': [[F(a), F(b)] for a, b in r.centers],
            'queries': [[F(y), F(r.get_start_of_closest_staff_above(y)), F(r.get_start_of_closest_staff_below(y))] for y in ys]}


def _np_default(o):
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return F(o)
    if isinstance(o, np.bool_):
        return bool(o)
    raise TypeError(type(o).__name__)


def wjson(path, obj):
    with open(path, 'w') as f:
        json.dump(obj, f, indent=None, separators=(',', ':'), default=_np_default)


def run_pages():
    pages = sorted(d for d in os.listdir(FIX) if os.path.isfile(os.path.join(FIX, d, '05-filtered-staff.png')))
    cv2.setRNGSeed(0)  # a fresh process
    for pi, page in enumerate(pages):
        od = os.path.join(FIX, page)
        # 1. the staff mask before make_lines_stronger
        raw_masks = {n: mask_png(os.path.join(od, '04-mask-%s.png' % n)) for n in MASKS}
        filtered = filter_predictions(predictions(raw_masks), Debug(None, 'x.png', False))
        filt05 = {n: mask_png(os.path.join(od, '05-filtered-%s.png' % n)) for n in MASKS}
        for n in MASKS:
            if n != 'staff':
                assert np.array_equal(getattr(filtered, n) > 0, filt05[n] > 0), (page, n)
        assert np.array_equal(SD.make_lines_stronger(filtered.staff, (1, 2)) > 0, filt05['staff'] > 0), page
        wmask(os.path.join(od, '14-staff-prestrong.png'), filtered.staff)
        # 2. detect_staffs_in_image from the 05 masks reproduces the fixtures
        v, ms, err, debug = detect(predictions(filt05))
        assert err is None, (page, err)
        with open(os.path.join(od, '06-symbols.json')) as f:
            want06 = json.load(f)
        s = v['symbols']
        assert v['symbols06'] == want06, page + ' 06'
        with open(os.path.join(od, '07-staff.json')) as f:
            want07 = json.load(f)
        assert roundtrip(stage07(v)) == want07, page + ' 07'
        repaired = SR.repair_systems(debug, ms)
        with open(os.path.join(od, '08-repaired.json')) as f:
            assert roundtrip({'multi_staffs': repaired}) == json.load(f), page + ' 08'
        # 3. the trace of detect_staff (on the same inputs)
        image = filt05['staff']
        trace, clef_anchors, bar_anchors, merged = trace_detect_staff(image, v['staff_fragments'], s.clefs_keys,
                                                              v['bar_line_boxes'])
        trace['average_note_head_height'] = F(v['average_note_head_height'])
        split_calls = []
        orig_split = ND.split_clumps_of_noteheads

        def split(nh, pred, staff, _calls=split_calls):
            out = orig_split(nh, pred, staff)
            _calls.append(len(out))
            return out
        ND.split_clumps_of_noteheads = split
        try:
            # add_notes_to_staffs again on fresh staffs (the run above already added its notes)
            fresh = SD.detect_staff(Debug(None, 'x.png', False), image, v['staff_fragments'], s.clefs_keys,
                                    v['bar_line_boxes'])
            ND.add_notes_to_staffs(fresh, v['noteheads_with_stems'], filt05['symbols'], filt05['notehead'])
        finally:
            ND.split_clumps_of_noteheads = orig_split
        trace['split_clumps'] = split_calls
        filtered_tall = BD._filter_for_tall_elements([BD._trim_symbol_to_core_span(b) for b in v['brace_dot']],
                                                     v['staffs'])
        trace['tall_braces'] = [bx(b.box) for b in filtered_tall]
        trace['trimmed_braces'] = [bx(BD._trim_symbol_to_core_span(b).box) for b in v['brace_dot']]
        wjson(os.path.join(od, '14-staff-trace.json'), trace)
        # 4. units
        units = {
            'bbox': bbox_variants(filt05, s.noteheads, [v['staffs'][0].average_unit_size, 12.0, 20.0]),
            'extrapolate': extrapolate_cases(bar_anchors) + extrapolate_cases(clef_anchors),
            'unit_from_clefs': F(SD.estimate_unit_size_from_clefs(v['staff_fragments'], s.clefs_keys)),
            'segment_overlap': [[a_i, i, bool(a.staff_lines[i].is_overlapping(a.staff_lines[i + 1])),
                                 bool(a.staff_lines[i] == a.staff_lines[i]), bool(a.staff_lines[i] == a.staff_lines[i + 1])]
                                for a_i, a in enumerate(clef_anchors[:5]) for i in range(4)],
            'draw': drawing(image.shape, clef_anchors, bar_anchors, merged, v['noteheads_with_stems']),
            'prepare_staff_image': hashlib.sha1(np.ascontiguousarray(SD.prepare_staff_image(image)).tobytes()).hexdigest(),
            'repair': repair_cases(v['staffs'], 1000 + pi),
            'regions': regions(repaired),
            'regions_raw': regions(ms),
        }
        wjson(os.path.join(od, '14-staff-units.json'), units)
        print(page, 'ok: staffs', len(v['staffs']), 'anchors', len(trace['staff_anchors']),
              'splits', sum(1 for c in split_calls if c > 1), 'repair cases', len(units['repair']), file=sys.stderr)


# ---- edge cases ----
def text_page():
    img = np.full((2200, 1700, 3), 255, np.uint8)
    cv2.putText(img, 'SONATA No. 3', (380, 260), cv2.FONT_HERSHEY_TRIPLEX, 3.2, (0, 0, 0), 5, cv2.LINE_AA)
    cv2.putText(img, 'for piano solo', (560, 380), cv2.FONT_HERSHEY_COMPLEX, 1.6, (0, 0, 0), 2, cv2.LINE_AA)
    words = ('the quick brown fox jumps over the lazy dog while a choir sings in the old church '
             'nave and the organist turns the pages of the score').split()
    rnd = random.Random(7)
    y = 560
    while y < 2000:
        line = ' '.join(rnd.choice(words) for _ in range(9))
        cv2.putText(img, line, (140, y), cv2.FONT_HERSHEY_COMPLEX, 1.1, (0, 0, 0), 2, cv2.LINE_AA)
        y += 58
    cv2.putText(img, 'Edition 2026 - public domain', (560, 2120), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 2, cv2.LINE_AA)
    return img


def cover_page():
    """A title page with a decoration of loose notes (heads and stems, no staff lines)."""
    img = np.full((2200, 1700, 3), 255, np.uint8)
    cv2.putText(img, 'SONGS OF THE SEA', (260, 420), cv2.FONT_HERSHEY_TRIPLEX, 3.0, (0, 0, 0), 5, cv2.LINE_AA)
    cv2.putText(img, 'for voice and piano', (520, 560), cv2.FONT_HERSHEY_COMPLEX, 1.6, (0, 0, 0), 2, cv2.LINE_AA)
    for k in range(10):
        x, y = 330 + k * 115, 1000 + int(60 * math.sin(k / 1.5))
        cv2.ellipse(img, (x, y), (13, 9), -25, 0, 360, (0, 0, 0), -1, cv2.LINE_AA)
        cv2.line(img, (x + 11, y - 3), (x + 11, y - 70), (0, 0, 0), 3, cv2.LINE_AA)
    cv2.putText(img, 'Edition 2026', (680, 1900), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 2, cv2.LINE_AA)
    return img


def segnet_masks(image):
    cropped, _ = autocrop_with_offset(image)
    resized = resize_image(cropped)
    pre = color_adjust.apply_clahe(resized)
    preds = M.get_predictions(resized, pre, 'edge.png', False, False)
    preds = filter_predictions(preds, Debug(preds.original, 'edge.png', False))
    preds.staff = SD.make_lines_stronger(preds.staff, (1, 2))
    return {n: (getattr(preds, n) > 0).astype(np.uint8) for n in MASKS}


def result_of(v, ms, err, debug):
    out = {'error': err, 'stages': sorted(k for k in v.keys() if k != 'symbols06')}
    if 'average_note_head_height' in v:
        out['average_note_head_height'] = F(v['average_note_head_height'])
    if 'unit_size_from_clefs' in v:
        out['unit_size_from_clefs'] = F(v['unit_size_from_clefs'])
    if 'noteheads_with_stems' in v:
        out['n_noteheads'] = len(v['noteheads_with_stems'])
    if 'staffs' in v:
        out['staffs'] = [stf(s) for s in v['staffs']]
    if err is None:
        out['stage07'] = roundtrip(stage07(v))
        out['repaired'] = roundtrip({'multi_staffs': SR.repair_systems(debug, ms)})
    return out


def run_edge():
    cases = []
    for name, image in (('blank', np.full((2200, 1700, 3), 255, np.uint8)), ('text', text_page()),
                        ('cover', cover_page())):
        masks = segnet_masks(image)
        for n in MASKS:
            wmask(os.path.join(FIX, '14-staff-edge-%s-%s.png' % (name, n)), masks[n])
        cv2.imwrite(os.path.join(FIX, '14-staff-edge-%s-input.png' % name), image)
        cv2.setRNGSeed(0)
        v, ms, err, debug = detect(predictions(masks))
        cases.append({'name': name, 'masks': '14-staff-edge-%s' % name, 'edit': None, **result_of(v, ms, err, debug)})
        print(name, '->', err, file=sys.stderr)
    edits = [('belle-p1', ['notehead']), ('no11-p1', ['notehead']), ('belle-p1', ['notehead', 'clefs_keys']),
             ('belle-p1', ['staff']), ('02-entree-p1', ['staff'])]
    for page, blank in edits:
        od = os.path.join(FIX, page)
        if not os.path.isdir(od):
            continue
        masks = {n: mask_png(os.path.join(od, '05-filtered-%s.png' % n)) for n in MASKS}
        for n in blank:
            masks[n] = np.zeros_like(masks[n])
        cv2.setRNGSeed(0)
        v, ms, err, debug = detect(predictions(masks))
        name = page + ':no-' + '+'.join(blank)
        cases.append({'name': name, 'masks': None, 'page': page, 'edit': blank, **result_of(v, ms, err, debug)})
        print(name, '->', err, file=sys.stderr)
    wjson(os.path.join(FIX, '14-staff-edge.json'), {'cases': cases})


if args.edge:
    run_edge()
else:
    run_pages()
