"""Audit references for the reading stage (tests/omr-read.test.js, section "audit").

usage: python -I tools/omr/dump_read_audit.py FIXTURES      (writes FIXTURES/40-read-audit.json, ~5 s)

Edge cases the 7 pages and 40-read-synthetic.json do not reach, run through homr itself:
  prep         prepare_staff_image on a synthetic page for staffs at the page edges (top, bottom,
               left/right beyond the page, below the page), tiny unit sizes, a grand staff (10
               lines), a steep (rotated) and a strongly curved (photographed) staff, a sparse
               grid, overlapping staffs (a squeezed / negative region -> cv2.error), each with
               debug off and on: the canvas, the transformed staff, staff_to_page and every image
               homr hands to Debug.write_image_with_fixed_suffix (span points, input, annotated)
  parse_debug  parse_staffs with a stub transformer and debug on: the voices and the
               _staff-N_output.jpg images (circles + "i: rhythm" labels at the attention points)
  canvas       get_tr_omr_canvas_size / remove_black_contours_at_edges_of_image /
               center_image_on_canvas / add_image_into_tr_omr_canvas on empty and 1-pixel images
               (cv2.threshold returns None for an empty image -> TypeError in homr)
  convert      ConvertToArray (staff2score._transform) on uint8 / float32 / float64 / uint16 /
               int16 images (a float32 image is divided by 255 in float32 under NEP 50)
Staff grids are written with full precision (the JS rebuilds them, it does not recompute sin).
"""
import json
import math
import os
import sys

import numpy as np

from homr import staff_parsing as SP
from homr import staff_parsing_tromr as SPT
from homr.bounding_boxes import BoundingBox
from homr.debug import Debug
from homr.model import Clef, MultiStaff, Rest, Staff, StaffPoint
from homr.staff_regions import StaffRegions
from homr.transformer.configs import Config
from homr.transformer.staff2score import ConvertToArray
from homr.transformer.vocabulary import EncodedSymbol

import hashlib


def F(x):
    if x is None:
        return None
    x = float(x)
    if math.isnan(x):
        return 'nan'
    if math.isinf(x):
        return 'inf' if x > 0 else '-inf'
    return x


def FL(a):
    return [F(v) for v in a]


def img_info(a):
    return {'shape': list(a.shape), 'dtype': str(a.dtype), 'sha1': hashlib.sha1(np.ascontiguousarray(a).tobytes()).hexdigest()}


def syn_image(h, w, c=1, seed=0):
    """dump_read.py's test picture (the JS test repeats the integer formula)."""
    y, x = np.mgrid[0:h, 0:w].astype(np.int64)
    chans = [((x * 37 + y * 91 + ((x * y + seed + 11 * k) % 251)) % 256).astype(np.uint8) for k in range(c)]
    return chans[0] if c == 1 else np.dstack(chans)


def safe(fn):
    try:
        return {'value': fn()}
    except Exception as e:  # noqa: BLE001
        return {'raises': type(e).__name__, 'message': str(e)}


class Cap(Debug):
    """A Debug that records what homr writes (no files)."""

    def __init__(self, img, debug):
        super().__init__(img, 'x.png', debug)
        self.caps = []

    def write_image_with_fixed_suffix(self, suffix, image):
        self.caps.append([suffix, img_info(image)])


def make_staff(x0, x1, step, y0, unit, wave=0.0, slope=0.0, lines=5):
    grid = []
    for x in range(x0, x1 + 1, step):
        dy = wave * math.sin(x / 97.0) + slope * (x - x0)
        grid.append(StaffPoint(float(x), [y0 + dy + k * unit for k in range(lines)], slope))
    return Staff(grid)


def add_symbols(s):
    p = s.grid[len(s.grid) // 2]
    q = s.grid[0]
    s.symbols = [Rest(BoundingBox([int(p.x) - 5, int(p.y[1]), int(p.x) + 5, int(p.y[3])], np.array([]), -1)),
                 Clef(BoundingBox([int(q.x) + 3, int(q.y[0]) - 6, int(q.x) + 20, int(q.y[4]) + 6], np.array([]), -1))]


def staff_state(s):
    return {'grid': [{'x': F(p.x), 'y': FL(p.y), 'angle': F(p.angle)} for p in s.grid],
            'symbols': [{'type': type(x).__name__, 'box': [int(v) for v in x.box.box]} for x in s.symbols]}


SPECS = {  # name: (x0, x1, step, y0, unit, wave, slope, lines)
    'top': (0, 1300, 10, 12.0, 11.0, 4.0, 0.0, 5),
    'mid': (40, 1350, 10, 250.0, 12.0, 8.0, 0.0, 5),
    'bottom': (60, 1380, 10, 560.0, 12.0, 3.0, 0.0, 5),
    'left-right': (-80, 1500, 10, 380.0, 10.5, 2.0, 0.0, 5),
    'tiny-unit': (100, 900, 10, 470.0, 1.25, 0.0, 0.0, 5),
    'inside': (200, 600, 10, 255.0, 3.0, 0.0, 0.0, 5),      # overlaps 'mid': squeezed region
    'below-page': (100, 1300, 10, 640.0, 12.0, 0.0, 0.0, 5),  # entirely below the 600 px page
    'grand': (30, 1330, 10, 150.0, 11.0, 5.0, 0.0, 10),
    'steep': (50, 1350, 10, 120.0, 12.0, 0.0, 0.12, 5),     # a rotated staff (~7 degrees)
    'curved': (20, 1380, 10, 330.0, 12.5, 30.0, 0.0, 5),    # a photographed page's bend
    'sparse': (0, 1400, 200, 300.0, 12.0, 6.0, 0.0, 5),     # get_at() misses most columns
    'short': (600, 700, 10, 480.0, 12.0, 0.0, 0.0, 5),      # a staff fragment
}
LAYOUTS = [
    ('all', ['top', 'mid', 'bottom', 'left-right', 'tiny-unit']),
    ('overlap', ['mid', 'inside', 'bottom']),
    ('below', ['top', 'below-page']),
    ('single', ['mid']),
    ('grand', ['top', 'grand', 'bottom']),
    ('photo', ['steep', 'curved']),
    ('odd', ['sparse', 'short']),
]
TO_PAGE = [(0.0, 0.0), (100.5, 64.25), (640.0, 128.0), (1279.0, 255.0), (17.25, 200.75), (900.125, 30.5)]


def prep_cases(page, staffs):
    out = []
    for lname, names in LAYOUTS:
        regions = StaffRegions([MultiStaff([staffs[n]], []) for n in names])
        for dbg in (False, True):
            for idx, n in enumerate(names):
                d = Cap(page, dbg)
                r = safe(lambda: SP.prepare_staff_image(d, idx, staffs[n], page, regions))
                case = {'layout': lname, 'names': names, 'staff': n, 'index': idx, 'debug': dbg}
                if 'raises' in r:
                    case['raises'] = r['raises']
                    case['message'] = r['message']
                else:
                    img, t, to_page = r['value']
                    case['canvas'] = img_info(img)
                    case['t_grid'] = [[F(p.x), FL(p.y)] for p in t.grid]
                    case['t_unit'] = F(t.average_unit_size)
                    case['t_grand'] = bool(t.is_grandstaff)
                    case['to_page'] = [[FL(p), FL(to_page(p))] for p in TO_PAGE]
                case['caps'] = d.caps
                out.append(case)
    return out


class Stub:
    def __init__(self, calls):
        self.calls = calls
        self.k = 0

    def predict(self, image):
        toks, coords = self.calls[self.k % len(self.calls)]
        self.k += 1
        return [EncodedSymbol(*t.split(' '), coordinates=None if c is None else np.array(c, dtype=np.float32))
                for t, c in zip(toks, coords)]


def parse_debug_case(page, staffs):
    toks = ['clef_G2 _ _ _ _ upper', 'keySignature_1 . . . . .', 'note_4 C4 _ _ _ upper', 'chord . . . . .',
            'note_4 E4 _ _ _ upper', 'barline . . . . .', 'rest_8 . . . . upper', 'note_8 G5 # _ _ lower']
    coords = [[30.5, 120.25], None, [140.0, 100.0], [150.0, 101.0], [160.75, 140.5], [400.0, 128.0], ['nan', 3.0], [1250.5, 250.0]]
    coords = [None if c is None else [float('nan') if v == 'nan' else v for v in c] for c in coords]
    calls = [[toks, coords], [toks[2:], coords[2:]]]
    multi = [MultiStaff([staffs['top']], []), MultiStaff([staffs['mid'], staffs['grand']], [])]
    staffs['grand'].is_grandstaff = True
    try:
        d = Cap(page, True)
        old = SPT.inference
        SPT.inference = Stub(calls)
        try:
            voices = SP.parse_staffs(d, multi, page, Config(), -1)
        finally:
            SPT.inference = old
    finally:
        staffs['grand'].is_grandstaff = False
    return {'calls': [[t, [None if c is None else FL(c) for c in cs]] for t, cs in calls],
            'systems': [['top'], ['mid', 'grand']], 'grand': ['grand'],
            'voices': [[[str(s), None if s.image_coordinates is None else FL(s.image_coordinates)] for s in v] for v in voices],
            'caps': d.caps}


def canvas_cases():
    out = []
    for (h, w) in ((0, 10), (10, 0), (1, 1), (2, 3)):
        img = np.full((h, w), 77, np.uint8)
        out.append({'h': h, 'w': w,
                    'size': safe(lambda: [int(v) for v in SP.get_tr_omr_canvas_size(img.shape)]),
                    'black': safe(lambda: img_info(SP.remove_black_contours_at_edges_of_image(img.copy(), 2.0))),
                    'center': safe(lambda: img_info(SP.center_image_on_canvas(img, np.array([1280, 256])))),
                    'add': safe(lambda: img_info(SP.add_image_into_tr_omr_canvas(img)))})
    return out


def convert_cases():
    conv = ConvertToArray()
    base = syn_image(4, 9, 1, seed=3)
    out = []
    for dt in ('uint8', 'float32', 'float64', 'uint16', 'int16'):
        a = base.astype(dt)
        if dt == 'float32':
            a = (a * np.float32(1.37)).astype(np.float32)
        elif dt == 'float64':
            a = a * 0.731
        x = conv(a)
        out.append({'dtype': dt, 'in': [F(v) for v in a.reshape(-1)], 'shape': list(x.shape), 'out_dtype': str(x.dtype),
                    'out': [F(v) for v in x.reshape(-1)]})
    return out


def main():
    fix = sys.argv[1]
    page = syn_image(600, 1400, 1, seed=5)
    staffs = {}
    for k, v in SPECS.items():
        s = make_staff(*v)
        add_symbols(s)
        staffs[k] = s
    res = {'page': {'h': 600, 'w': 1400, 'seed': 5}, 'staffs': {k: staff_state(s) for k, s in staffs.items()},
           'prep': prep_cases(page, staffs), 'parse_debug': parse_debug_case(page, staffs),
           'canvas': canvas_cases(), 'convert': convert_cases()}
    with open(os.path.join(fix, '40-read-audit.json'), 'w') as f:
        json.dump(res, f, separators=(',', ':'))
    print('audit: prep', len(res['prep']), '(raise', sum('raises' in c for c in res['prep']), ')', file=sys.stderr)


if __name__ == '__main__':
    main()
