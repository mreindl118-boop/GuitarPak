"""cv2 reference dump for the JS port's OpenCV wrapper (js/omr/cv.js, tests/omr-cv.test.js).

usage: python -I tools/omr/dump_cv.py FIXTURES [page ...]

For every page dir FIXTURES/<page>/ (made by dump_stages.py) writes 20-cv.json: a list of
cases {id, op, args, kw, out}. args/kw are a tiny spec language that BOTH this script and
the JS test evaluate, so the two sides run exactly the same cv2 calls on the same inputs:

  {"$": id}                       result of an earlier case
  {"png": name, "mode": m}        fixture image: m = color (cv2.imread) | gray | mask01 (> 0 -> 1)
  {"img": [h, w, c], "dtype": d, "z": b64(zlib(bytes))}   inline image (synthetic cases)
  {"zeros": [h, w(, c)], "dtype": d} / {"full": [...], "v": x, "dtype": d} / {"ones": [h, w], "dtype": d}
  {"arr": nested, "dtype": d, "as": img|nested}   np.array(nested, dtype) (points, kernels, images)
  {"shift": spec, "by": [x, y]}   contour - (x, y)
  {"slice": spec, "y": [a, b], "x": [a, b]}   spec[a:b, a:b].copy()
  {"item": spec, "i": k}          spec[k]
  {"mul": spec, "k": n} / {"rsub": spec, "k": n}   spec * n / n - spec (numpy dtype rules)
  {"list": [...]}                 a Python list (else JSON lists become tuples)
  {"each": op, "of": spec, ...}   op applied to every item of a list (per-contour geometry)

The real inputs are the pipeline's own images: 00-input, 02-resized, 03-clahe and the
05-filtered-* segmentation masks. The synthetic cases (seeded per page) cover the edge
cases: empty mask, single pixels, touching blobs, holes, border blobs, thin lines,
rotated rects at 0/45/90 and random angles, random ellipses and blobs.
"""
import base64
import hashlib
import json
import math
import os
import sys
import zlib

import cv2
import numpy as np

FIX = sys.argv[1]
PAGES = sys.argv[2:] or sorted(d for d in os.listdir(FIX) if os.path.isdir(os.path.join(FIX, d)) and not d.startswith('_'))
BIG = 256


def sha1(a):
    return hashlib.sha1(np.ascontiguousarray(a).tobytes()).hexdigest()


def num(x):
    x = float(x)
    if math.isnan(x):
        return 'nan'
    if math.isinf(x):
        return 'inf' if x > 0 else '-inf'
    return x


def enc(x):
    """Result encoding shared with the JS side (see encode() in tests/omr-cv.test.js)."""
    if x is None:
        return None
    if isinstance(x, np.ndarray):
        d = {'dtype': str(x.dtype), 'n': int(x.size), 'shape': list(x.shape)}
        if x.size > BIG:
            d['sha1'] = sha1(x)
            d['sum'] = num(x.astype(np.float64).sum())
        else:
            flat = x.ravel().tolist()
            d['v'] = [num(v) if isinstance(v, float) else v for v in flat]
        return d
    if isinstance(x, (list, tuple)):
        return [enc(v) for v in x]
    if isinstance(x, (bool, np.bool_)):
        return bool(x)
    if isinstance(x, (int, np.integer)):
        return int(x)
    if isinstance(x, (float, np.floating)):
        return num(x)
    raise TypeError(type(x))


def enc_contours(res):
    contours, hier = res
    lens = [int(len(c)) for c in contours]
    allpts = np.concatenate([c.reshape(-1) for c in contours]) if contours else np.zeros(0, np.int32)
    return {'n': len(contours), 'lens': lens, 'sha1': sha1(allpts.astype(np.int32)),
            'hier': None if hier is None else sha1(hier.astype(np.int32)),
            'first': [c.reshape(-1).tolist() for c in contours[:3]]}


PIXEL_OPS = {'resize', 'warpAffine', 'remap', 'GaussianBlur', 'addWeighted', 'blur', 'cvtColor', 'threshold',
             'adaptiveThreshold', 'dilate', 'erode', 'morphologyEx', 'filter2D', 'subtract', 'bitwise_and', 'clahe',
             'calcHist'}


def is_ipp(op, args, kw):
    """cv2 calls the x86 wheel routes through Intel IPP (ippicv): uint8 INTER_CUBIC resize."""
    return op == 'resize' and kw.get('interpolation') == cv2.INTER_CUBIC and args[0].dtype == np.uint8


def simd_diff(a, b):
    """None when equal, else {n, max} over the array results (threshold: the image part)."""
    if isinstance(a, tuple):
        a, b = a[-1], b[-1]
    if not isinstance(a, np.ndarray) or (a.shape == b.shape and np.array_equal(a, b)):
        return None
    dd = np.abs(a.astype(np.float64) - b.astype(np.float64))
    return {'n': int((dd > 0).sum()), 'of': int(dd.size), 'max': num(dd.max())}


def b64img(a):
    a = np.ascontiguousarray(a)
    shp = list(a.shape) + ([1] if a.ndim == 2 else [])
    return {'img': shp, 'dtype': str(a.dtype), 'z': base64.b64encode(zlib.compress(a.tobytes(), 9)).decode()}


class Dump:
    def __init__(self, page_dir):
        self.dir = page_dir
        self.R = {}
        self.cases = []
        self.png_cache = {}
        self.contour_ids = set()

    # ---- the spec language ----
    def ev(self, s):
        if isinstance(s, list):
            return tuple(self.ev(v) for v in s)
        if not isinstance(s, dict):
            return s
        if '$' in s:
            return self.R[s['$']]
        if 'png' in s:
            key = (s['png'], s.get('mode', 'color'))
            if key not in self.png_cache:
                p = os.path.join(self.dir, s['png'])
                mode = s.get('mode', 'color')
                if mode == 'color':
                    im = cv2.imread(p)
                else:
                    im = cv2.imread(p, cv2.IMREAD_UNCHANGED)
                    if im.ndim == 3:
                        raise ValueError('gray png expected ' + p)
                    if mode == 'mask01':
                        im = (im > 0).astype(np.uint8)
                self.png_cache[key] = im
            return self.png_cache[key].copy()
        if 'img' in s:
            h, w, c = s['img']
            a = np.frombuffer(zlib.decompress(base64.b64decode(s['z'])), dtype=s['dtype']).copy()
            return a.reshape((h, w) if c == 1 else (h, w, c))
        if 'zeros' in s:
            return np.zeros(tuple(s['zeros']), dtype=s.get('dtype', 'uint8'))
        if 'full' in s:
            return np.full(tuple(s['full']), s['v'], dtype=s.get('dtype', 'uint8'))
        if 'ones' in s:
            return np.ones(tuple(s['ones']), dtype=s.get('dtype', 'uint8'))
        if 'arr' in s:
            # 'as': img = an image, nested = a plain list (JS), default = a point array
            return np.array(s['arr'], dtype=s['dtype'])
        if 'shift' in s:
            return self.ev(s['shift']) - tuple(s['by'])
        if 'slice' in s:
            a = self.ev(s['slice'])
            return a[s['y'][0]:s['y'][1], s['x'][0]:s['x'][1]].copy()
        if 'item' in s:
            return self.ev(s['item'])[s['i']]
        if 'mul' in s:
            return self.ev(s['mul']) * s['k']
        if 'rsub' in s:
            return s['k'] - self.ev(s['rsub'])
        if 'list' in s:
            return [self.ev(v) for v in s['list']]
        raise ValueError(s)

    def call(self, op, args, kw):
        if op == 'clahe':
            img, clip, grid = args
            return cv2.createCLAHE(clipLimit=clip, tileGridSize=tuple(grid)).apply(img)
        if op == 'load':
            return args[0]
        if op == 'largest':
            # autocrop: the first contour with the largest area
            cs = args[0][0]
            best, area = None, 0.0
            for c in cs:
                a = cv2.contourArea(c)
                if a > area:
                    area, best = a, c
            return best
        if op == 'homr_ellipse2Poly':
            # BoundingEllipse's polygon: ellipse2Poly((int(cx), int(cy)), (int(w/2), int(h/2)), int(angle), 0, 360, 1)
            box = args[0]
            if math.isnan(box[1][0]) or math.isnan(box[1][1]):
                return None
            return cv2.ellipse2Poly((int(box[0][0]), int(box[0][1])), (int(box[1][0] / 2), int(box[1][1] / 2)),
                                    int(box[2]), 0, 360, 1)
        if op == 'boxPoints_int64':
            return cv2.boxPoints(args[0]).astype(np.int64)
        if op == 'polys_overlap':
            # bounding_boxes.do_polygons_overlap, step by step
            p1, p2 = args
            area, pts = cv2.intersectConvexConvex(p1.astype(np.float32), p2.astype(np.float32))
            t1 = [cv2.pointPolygonTest(p2, (float(p[0]), float(p[1])), False) for p in p1]
            t2 = [cv2.pointPolygonTest(p1, (float(p[0]), float(p[1])), False) for p in p2]
            return [area, pts, t1, t2]
        fn = getattr(cv2, op)
        return fn(*args, **kw)

    def case(self, cid, op, args, kw=None, keep=True, encode=None):
        kw = kw or {}
        if op == 'findContours':
            self.contour_ids.add(cid)
        a = [self.ev(x) for x in args]
        k = {key: self.ev(v) for key, v in kw.items()}
        res = self.call(op, a, k)
        case = {'id': cid, 'op': op, 'args': args, 'kw': kw}
        if op in PIXEL_OPS:
            # cv2 with setUseOptimized(False) runs OpenCV's plain C++ kernels instead of its
            # optimised ones (Intel IPP, SIMD). Where the two differ, 'plain' records the plain
            # result too. The expected value stays the default (optimised) one, except where the
            # optimised kernel is IPP, which the browser cannot reproduce: then JS must equal the
            # plain kernel and later cases get that same input on both sides.
            cv2.setUseOptimized(False)
            try:
                plain = self.call(op, [self.ev(x) for x in args], {key: self.ev(v) for key, v in kw.items()})
            finally:
                cv2.setUseOptimized(True)
            d = simd_diff(res, plain)
            if d:
                case['simd'] = d
                case['plain'] = enc(plain)
                if is_ipp(op, a, k):
                    case['ipp'] = True
                    res = plain
        if op == 'resize' and k.get('interpolation') == cv2.INTER_CUBIC:
            # INTER_CUBIC is only used by SheetLab's low-res upscale (and homr's training-time
            # warp augmentation): the browser cannot reproduce IPP's / the SIMD float rounding,
            # so the test checks it within a tolerance against the full expected image
            case['known'] = 'cubic-' + str(res.dtype)
            case['full'] = b64img(res)
        if keep:
            self.R[cid] = res
        case['out'] = encode(res) if encode else enc(res)
        self.cases.append(case)
        return res

    def each(self, cid, op, of, extra=None, min_len=0, keep=False):
        """op applied to every contour of the list `of` (a contours case or a list result)."""
        items = self.R[of]
        is_contours = of in self.contour_ids
        if is_contours:
            items = items[0]  # findContours -> (contours, hierarchy)
        out = []
        res = []
        for it in items:
            if it is None or (min_len and len(it) < min_len):
                out.append(None)
                res.append(None)
                continue
            r = self.call(op, [it] + list(extra or []), {})
            res.append(r)
            out.append(enc(r))
        if keep:
            self.R[cid] = res
        self.cases.append({'id': cid, 'op': op, 'each': of, 'contours': is_contours, 'extra': extra or [], 'min_len': min_len, 'out': out})
        return res


def contour_suite(d, cid, src_spec, external=False, max_each=None):
    """findContours + per-contour geometry exactly as bounding_boxes.py uses it."""
    mode = cv2.RETR_EXTERNAL if external else cv2.RETR_TREE
    d.case(cid, 'findContours', [src_spec, mode, cv2.CHAIN_APPROX_SIMPLE], encode=enc_contours)
    d.each(cid + ':mar', 'minAreaRect', cid, keep=True)
    d.each(cid + ':box', 'boxPoints', cid + ':mar')
    d.each(cid + ':boxi', 'boxPoints_int64', cid + ':mar')
    d.each(cid + ':br', 'boundingRect', cid)
    d.each(cid + ':area', 'contourArea', cid)
    d.each(cid + ':hull', 'convexHull', cid)
    d.each(cid + ':ell', 'fitEllipse', cid, min_len=5, keep=True)
    # ellipse2Poly of the fitted ellipses the way BoundingEllipse builds its polygon
    d.each(cid + ':e2p', 'homr_ellipse2Poly', cid + ':ell')


def page_cases(d, page_index):
    masks = ['staff', 'symbols', 'stems_rest', 'notehead', 'clefs_keys']
    for m in masks:
        d.case('m_' + m, 'load', [{'png': '05-filtered-%s.png' % m, 'mode': 'mask01'}])
        contour_suite(d, 'c_' + m, {'$': 'm_' + m})
    contour_suite(d, 'cx_symbols', {'$': 'm_symbols'}, external=True)

    # ---- morphology as homr uses it ----
    d.case('k53', 'getStructuringElement', [cv2.MORPH_ELLIPSE, [5, 3]])
    d.case('k93', 'getStructuringElement', [cv2.MORPH_ELLIPSE, [9, 3]])
    d.case('k12', 'getStructuringElement', [cv2.MORPH_ELLIPSE, [1, 2]])
    d.case('k15', 'getStructuringElement', [cv2.MORPH_ELLIPSE, [1, 5]])
    d.case('k535', 'getStructuringElement', [cv2.MORPH_ELLIPSE, [5, 35]])
    d.case('krect', 'getStructuringElement', [cv2.MORPH_RECT, [3, 7]])
    d.case('kcross', 'getStructuringElement', [cv2.MORPH_CROSS, [5, 5]])
    # bar_line_detection.prepare_bar_line_image
    d.case('bar', 'dilate', [{'$': 'm_stems_rest'}, {'ones': [5, 3], 'dtype': 'uint8'}], {'iterations': 1})
    contour_suite(d, 'c_bar', {'$': 'bar'})
    # staff_detection.prepare_staff_image
    d.case('st_er', 'erode', [{'$': 'm_staff'}, {'$': 'k53'}])
    d.case('st_di', 'dilate', [{'$': 'st_er'}, {'$': 'k93'}])
    # staff_detection.make_lines_stronger
    d.case('mls_di', 'dilate', [{'$': 'm_staff'}, {'$': 'k12'}])
    d.case('mls_th', 'threshold', [{'$': 'mls_di'}, 0.1, 1, cv2.THRESH_BINARY])
    # brace_dot_detection.prepare_brace_dot_image
    d.case('bd_sub', 'subtract', [{'$': 'm_symbols'}, {'$': 'm_staff'}])
    d.case('bd_er', 'erode', [{'$': 'bd_sub'}, {'$': 'k15'}])
    d.case('bd_di', 'dilate', [{'$': 'bd_er'}, {'$': 'k535'}])
    contour_suite(d, 'c_bd', {'$': 'bd_di'})
    d.case('dil2', 'dilate', [{'$': 'm_notehead'}, {'$': 'krect'}], {'iterations': 2})
    d.case('ero_rep', 'erode', [{'$': 'm_clefs_keys'}, {'$': 'kcross'}], {'borderType': cv2.BORDER_REPLICATE})

    # ---- autocrop.autocrop_with_offset on the input page ----
    d.case('in_gray', 'cvtColor', [{'png': '00-input.png'}, cv2.COLOR_BGR2GRAY])
    d.case('in_hist', 'calcHist', [{'list': [{'png': '00-input.png'}]}, [0], None, [256], [0, 256]])
    dom = int(np.argmax(d.R['in_hist'].flatten()))
    d.case('ac_th', 'threshold', [{'$': 'in_gray'}, dom - 30, 255, cv2.THRESH_BINARY])
    d.case('ac_close', 'morphologyEx', [{'item': {'$': 'ac_th'}, 'i': 1}, cv2.MORPH_CLOSE, {'ones': [7, 7], 'dtype': 'uint8'}])
    d.case('ac_erode', 'morphologyEx', [{'$': 'ac_close'}, cv2.MORPH_ERODE, {'ones': [9, 9], 'dtype': 'uint8'}])
    contour_suite(d, 'c_ac', {'$': 'ac_erode'}, external=True)
    d.case('ac_big', 'largest', [{'$': 'c_ac'}])
    if d.R['ac_big'] is not None:
        d.case('ac_hull', 'convexHull', [{'$': 'ac_big'}])
        d.case('ac_fill', 'fillPoly', [{'full': [400, 300], 'v': 1, 'dtype': 'uint8'}, {'list': [{'$': 'ac_hull'}]}, 0])
    d.case('ac_blur', 'blur', [{'slice': {'png': '02-resized.png'}, 'y': [0, 300], 'x': [100, 500]}, [7, 7]])
    d.case('ac_dil', 'dilate', [{'$': 'm_symbols'}, {'ones': [5, 5], 'dtype': 'uint8'}])

    # ---- colour / CLAHE / resize ----
    d.case('rs_gray', 'cvtColor', [{'png': '02-resized.png'}, cv2.COLOR_BGR2GRAY])
    d.case('clahe', 'clahe', [{'$': 'rs_gray'}, 1.0, [8, 8]])
    d.case('gray2bgr', 'cvtColor', [{'$': 'clahe'}, cv2.COLOR_GRAY2BGR])
    d.case('rgb2bgr', 'cvtColor', [{'slice': {'png': '02-resized.png'}, 'y': [0, 200], 'x': [0, 300]}, cv2.COLOR_RGB2BGR])
    d.case('rs_same', 'resize', [{'png': '02-resized.png'}, [1920, 2485]])
    d.case('rs_small', 'resize', [{'$': 'clahe'}, [1373, 1777]])
    d.case('rs_up', 'resize', [{'slice': {'$': 'clahe'}, 'y': [500, 800], 'x': [0, 1920]}, [2304, 360]])
    d.case('rs_canvas', 'resize', [{'slice': {'png': '02-resized.png'}, 'y': [300, 520], 'x': [50, 1900]}, [1280, 152]])
    d.case('rs_cubic', 'resize', [{'slice': {'png': '00-input.png'}, 'y': [0, 400], 'x': [0, 600]}, [900, 600]], {'interpolation': cv2.INTER_CUBIC})
    d.case('rs_area', 'resize', [{'png': '02-resized.png'}, [640, 828]], {'interpolation': cv2.INTER_AREA})
    d.case('rs_near', 'resize', [{'$': 'm_staff'}, [960, 1243]], {'interpolation': cv2.INTER_NEAREST})
    d.case('rs_fx', 'resize', [{'slice': {'$': 'clahe'}, 'y': [0, 100], 'x': [0, 100]}, None], {'fx': 0.37, 'fy': 0.81})
    d.case('rs_f32', 'resize', [{'arr': [[0, 0.3, -0.7, 0.9, 0], [0, 0.3, -0.7, 0.9, 0]], 'dtype': 'float32', 'as': 'img'}, [300, 120]], {'interpolation': cv2.INTER_CUBIC})
    # SheetLab low-res upscale + unsharp mask
    d.case('sl_up', 'resize', [{'slice': {'png': '00-input.png'}, 'y': [1000, 1300], 'x': [200, 700]}, [800, 480]], {'interpolation': cv2.INTER_CUBIC})
    d.case('sl_blur', 'GaussianBlur', [{'$': 'sl_up'}, [0, 0], 1.2])
    d.case('sl_sharp', 'addWeighted', [{'$': 'sl_up'}, 1.35, {'$': 'sl_blur'}, -0.35, 0])
    d.case('gb_k', 'GaussianBlur', [{'$': 'rs_gray'}, [5, 5], 0])
    d.case('sl_gray', 'cvtColor', [{'$': 'sl_sharp'}, cv2.COLOR_BGR2GRAY])
    d.case('sl_light', 'threshold', [{'$': 'sl_gray'}, 110, 255, cv2.THRESH_BINARY])
    d.case('sl_nz', 'findNonZero', [{'item': {'$': 'sl_light'}, 'i': 1}])
    if d.R['sl_nz'] is not None:
        d.case('sl_nzbr', 'boundingRect', [{'$': 'sl_nz'}])
    d.case('nz_empty', 'findNonZero', [{'zeros': [20, 30], 'dtype': 'uint8'}])
    d.case('ad_g', 'adaptiveThreshold', [{'$': 'rs_gray'}, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2])
    d.case('ad_m', 'adaptiveThreshold', [{'$': 'rs_gray'}, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 15, 5])

    # ---- staff_parsing.remove_black_contours_at_edges_of_image ----
    d.case('sp_crop', 'cvtColor', [{'slice': {'png': '02-resized.png'}, 'y': [250, 480], 'x': [0, 1920]}, cv2.COLOR_BGR2GRAY])
    d.case('sp_th', 'threshold', [{'$': 'sp_crop'}, 97, 255, cv2.THRESH_BINARY])
    contour_suite(d, 'c_sp', {'rsub': {'item': {'$': 'sp_th'}, 'i': 1}, 'k': 255})

    # ---- noise_filtering.estimate_noise ----
    d.case('nf_f2d', 'filter2D', [{'slice': {'mul': {'$': 'm_staff'}, 'k': 255}, 'y': [0, 124], 'x': [0, 96]}, cv2.CV_64F,
                                   {'arr': [[1, -2, 1], [-2, 4, -2], [1, -2, 1]], 'dtype': 'int64', 'as': 'img'}])
    d.case('nf_f2d_g', 'filter2D', [{'slice': {'$': 'rs_gray'}, 'y': [124, 248], 'x': [96, 192]}, cv2.CV_64F,
                                     {'arr': [[1, -2, 1], [-2, 4, -2], [1, -2, 1]], 'dtype': 'int64', 'as': 'img'}])
    grid = np.full(d.R['m_staff'].shape, 255, np.uint8)
    grid[0:124, 0:96] = 0
    grid[1000:1124, 960:1056] = 0
    d.case('nf_mask', 'load', [b64img(grid)])
    d.case('nf_and', 'bitwise_and', [{'png': '02-resized.png'}, {'png': '02-resized.png'}], {'mask': {'$': 'nf_mask'}})
    d.case('nf_and1', 'bitwise_and', [{'$': 'm_notehead'}, {'$': 'm_notehead'}], {'mask': {'$': 'nf_mask'}})

    # ---- staff_dewarping: affine pieces, warpAffine, fillConvexPoly ----
    rng = np.random.default_rng(1000 + page_index)
    tri_cases = []
    for t in range(12):
        src = rng.uniform(0, 120, (3, 2)).astype(np.float32)
        dst = (src + rng.uniform(-6, 6, (3, 2))).astype(np.float32)
        tri_cases.append((src.tolist(), dst.tolist()))
    for t, (src, dst) in enumerate(tri_cases):
        d.case('aff%d' % t, 'getAffineTransform', [{'arr': src, 'dtype': 'float32'}, {'arr': dst, 'dtype': 'float32'}])
        d.case('inv%d' % t, 'invertAffineTransform', [{'$': 'aff%d' % t}])
    d.case('aff_degen', 'getAffineTransform', [{'arr': [[0, 0], [1, 1], [2, 2]], 'dtype': 'float32'}, {'arr': [[0, 0], [1, 1], [2, 2]], 'dtype': 'float32'}])
    crop = {'slice': {'$': 'clahe'}, 'y': [300, 420], 'x': [400, 530]}
    d.case('wa_lin', 'warpAffine', [crop, {'$': 'aff0'}, [125, 118]], {'flags': cv2.INTER_LINEAR, 'borderMode': cv2.BORDER_CONSTANT, 'borderValue': 1})
    d.case('wa_near', 'warpAffine', [crop, {'$': 'aff1'}, [131, 122]], {'flags': cv2.INTER_NEAREST, 'borderMode': cv2.BORDER_CONSTANT, 'borderValue': 1})
    d.case('wa_col', 'warpAffine', [{'slice': {'png': '02-resized.png'}, 'y': [300, 420], 'x': [400, 530]}, {'$': 'aff2'}, [120, 120]], {'borderValue': 255})
    for t in range(4):
        tri = np.round(rng.uniform(0, 60, (3, 2))).astype(np.int32)
        d.case('fcp%d' % t, 'fillConvexPoly', [{'zeros': [64, 64], 'dtype': 'uint8'}, {'arr': tri.tolist(), 'dtype': 'int32'}, 255])
    # remap with a smooth displacement (warp_image_array_randomly2's shape of maps)
    h, w = 140, 200
    xx, yy = np.meshgrid(np.arange(w), np.arange(h))
    mx = (xx + 3.3 * np.sin(yy / 17.0)).astype(np.float32)
    my = (yy + 7.7 * np.sin(xx / 23.0 + page_index)).astype(np.float32)
    d.case('map_x', 'load', [b64img(mx)])
    d.case('map_y', 'load', [b64img(my)])
    d.case('remap_c', 'remap', [{'slice': {'png': '02-resized.png'}, 'y': [600, 740], 'x': [300, 500]}, {'$': 'map_x'}, {'$': 'map_y'}, cv2.INTER_LINEAR],
           {'borderMode': cv2.BORDER_CONSTANT, 'borderValue': [255, 255, 255]})
    d.case('remap_g', 'remap', [{'slice': {'$': 'clahe'}, 'y': [600, 740], 'x': [300, 500]}, {'$': 'map_x'}, {'$': 'map_y'}, cv2.INTER_LINEAR])

    # ---- HoughLinesP (bounding_boxes.create_lines) ----
    d.case('hough', 'HoughLinesP', [{'mul': {'$': 'm_staff'}, 'k': 255}, 1, np.pi / 180, 30], {'minLineLength': 30, 'maxLineGap': 10})
    d.case('hough2', 'HoughLinesP', [{'mul': {'$': 'm_stems_rest'}, 'k': 255}, 1, np.pi / 180, 20], {'minLineLength': 20, 'maxLineGap': 15})
    d.case('hough0', 'HoughLinesP', [{'zeros': [50, 50], 'dtype': 'uint8'}, 1, np.pi / 180, 10], {'minLineLength': 10, 'maxLineGap': 2})

    # ---- polygon tests on real neighbouring boxes (do_polygons_overlap, is_intersecting) ----
    rects = [r for r in d.R['c_stems_rest:mar']] + [r for r in d.R['c_notehead:mar']]
    pairs = []
    for i in range(len(rects)):
        for j in range(i + 1, len(rects)):
            a, b = rects[i], rects[j]
            if abs(a[0][0] - b[0][0]) + abs(a[0][1] - b[0][1]) < 40:
                pairs.append((i, j))
    pairs = pairs[:400]
    for k, (i, j) in enumerate(pairs):
        a, b = rects[i], rects[j]
        ra, rb = [list(a[0]), list(a[1]), a[2]], [list(b[0]), list(b[1]), b[2]]
        d.case('pp_a%d' % k, 'boxPoints_int64', [ra])
        d.case('pp_b%d' % k, 'boxPoints_int64', [rb])
        d.case('pp%d' % k, 'polys_overlap', [{'$': 'pp_a%d' % k}, {'$': 'pp_b%d' % k}], keep=False)
        d.case('rri%d' % k, 'rotatedRectangleIntersection', [ra, rb], keep=False)

    # ---- drawing (debug drawables, brace trimming) ----
    if d.R['c_bd'][0]:
        # brace_dot_detection._trim_symbol_to_core_span: the contour drawn filled into its own bounding box
        c0 = d.R['c_bd'][0][0]
        x, y, w, h = cv2.boundingRect(c0)
        d.case('dr_cnt', 'drawContours', [{'zeros': [h, w], 'dtype': 'uint8'}, {'list': [{'shift': {'item': {'item': {'$': 'c_bd'}, 'i': 0}, 'i': 0}, 'by': [x, y]}]}, -1, 255, cv2.FILLED])
    canvas = {'zeros': [300, 400, 3], 'dtype': 'uint8'}
    d.case('dr_line', 'line', [canvas, [10, 20], [390, 250], [0, 0, 255], 2])
    d.case('dr_circle', 'circle', [canvas, [200, 150], 37, [255, 0, 0], 2])
    d.case('dr_circle_f', 'circle', [canvas, [100, 100], 9, [0, 255, 0], -1])
    d.case('dr_rect', 'rectangle', [canvas, [30, 40], [250, 180], [0, 255, 255], 2])
    d.case('dr_ell', 'ellipse', [canvas, [[200.5, 150.25], [80.0, 31.5], 23.7], [255, 0, 255], 2])
    d.case('dr_box', 'drawContours', [canvas, {'list': [{'arr': [[50, 60], [120, 30], [150, 100], [80, 130]], 'dtype': 'int32'}]}, 0, [0, 0, 255], 2])
    d.case('dr_scalar', 'rectangle', [canvas, [5, 5], [50, 50], 255, -1])

    # ---- synthetic edge cases ----
    synth(d, page_index)


def synth(d, page_index):
    rng = np.random.default_rng(page_index)
    imgs = []
    imgs.append(('empty', np.zeros((40, 50), np.uint8)))
    for name, (y, x) in [('px_tl', (0, 0)), ('px_br', (39, 49)), ('px_mid', (20, 25))]:
        a = np.zeros((40, 50), np.uint8)
        a[y, x] = 1
        imgs.append((name, a))
    a = np.zeros((60, 60), np.uint8)
    a[10:20, 10:20] = 1
    a[20:30, 20:30] = 1  # touches diagonally
    a[10:20, 35:45] = 1
    a[20:30, 35:45] = 1  # touches along an edge
    imgs.append(('touching', a))
    a = np.zeros((80, 80), np.uint8)
    cv2.circle(a, (40, 40), 30, 1, -1)
    cv2.circle(a, (40, 40), 18, 0, -1)
    cv2.circle(a, (40, 40), 7, 1, -1)
    a[5:12, 60:75] = 1
    a[8, 63:72] = 0
    imgs.append(('holes', a))
    a = np.zeros((50, 70), np.uint8)
    a[0:10, 0:70] = 1
    a[20:50, 0:5] = 1
    a[45:50, 30:60] = 1
    a[25:35, 65:70] = 1
    imgs.append(('border', a))
    a = np.zeros((60, 80), np.uint8)
    a[10, 5:75] = 1
    a[15:55, 40] = 1
    cv2.line(a, (5, 55), (60, 20), 1, 1)
    cv2.line(a, (70, 5), (75, 58), 1, 1)
    a[30, 10] = 1
    a[50:52, 10:12] = 1
    imgs.append(('thin', a))
    a = np.zeros((120, 160), np.uint8)
    for k, (cx, cy, w, h, ang) in enumerate([(30, 30, 30, 10, 0), (80, 30, 30, 10, 45), (130, 30, 30, 10, 90),
                                             (30, 85, 20, 20, 45), (80, 85, 40, 6, 30), (130, 85, 6, 40, -20)]):
        cv2.fillPoly(a, [cv2.boxPoints(((cx, cy), (w, h), ang)).astype(np.int32)], 1)
    imgs.append(('rotrects', a))
    a = np.zeros((100, 140), np.uint8)
    for k in range(6):
        cx, cy = rng.uniform(15, 125), rng.uniform(15, 85)
        cv2.ellipse(a, ((float(cx), float(cy)), (float(rng.uniform(4, 30)), float(rng.uniform(3, 18))), float(rng.uniform(0, 180))), 1, -1)
    imgs.append(('ellipses', a))
    a = (rng.uniform(0, 1, (64, 96)) > 0.82).astype(np.uint8)
    a = cv2.dilate(a, np.ones((2, 2), np.uint8))
    imgs.append(('noise', a))
    a = (rng.uniform(0, 1, (48, 48)) > 0.5).astype(np.uint8) * 255
    imgs.append(('checker', a))

    for name, a in imgs:
        sid = 's_' + name
        d.case(sid, 'load', [b64img(a)])
        contour_suite(d, 'sc_' + name, {'$': sid})
        contour_suite(d, 'sx_' + name, {'$': sid}, external=True)
        d.case('snz_' + name, 'findNonZero', [{'$': sid}], keep=False)
        d.case('sdil_' + name, 'dilate', [{'$': sid}, {'ones': [5, 3], 'dtype': 'uint8'}], keep=False)
        d.case('sero_' + name, 'erode', [{'$': sid}, {'ones': [3, 3], 'dtype': 'uint8'}], keep=False)

    # random rotated rects: boxPoints (the JS port is pure JS), pair intersections
    rects = []
    for k in range(60):
        cx, cy = rng.uniform(-50, 2000), rng.uniform(-50, 2500)
        w, h = rng.uniform(0, 200), rng.uniform(0, 60)
        ang = float(rng.choice([0.0, 45.0, 90.0, -90.0, 180.0, -45.0, rng.uniform(-180, 180)]))
        rects.append([[float(cx), float(cy)], [float(w), float(h)], ang])
    d.case('rnd_rects', 'load', [{'list': rects}])
    d.each('rnd_box', 'boxPoints', 'rnd_rects')
    for k in range(40):
        a = rects[k]
        b = [[a[0][0] + float(rng.uniform(-30, 30)), a[0][1] + float(rng.uniform(-30, 30))],
             [float(rng.uniform(1, 120)), float(rng.uniform(1, 40))], float(rng.uniform(-90, 90))]
        if k % 7 == 0:
            b = [list(a[0]), list(a[1]), a[2]]  # identical
        if k % 7 == 1:
            b = [[a[0][0] + 500, a[0][1]], list(a[1]), a[2]]  # far apart
        d.case('srri%d' % k, 'rotatedRectangleIntersection', [a, b], keep=False)
        d.case('sicc_a%d' % k, 'boxPoints', [a])
        d.case('sicc_b%d' % k, 'boxPoints', [b])
        d.case('sicc%d' % k, 'intersectConvexConvex', [{'$': 'sicc_a%d' % k}, {'$': 'sicc_b%d' % k}], keep=False)
        d.case('spp_a%d' % k, 'boxPoints_int64', [a])
        d.case('spp_b%d' % k, 'boxPoints_int64', [b])
        d.case('spp%d' % k, 'polys_overlap', [{'$': 'spp_a%d' % k}, {'$': 'spp_b%d' % k}], keep=False)
    for k in range(30):
        c = [int(rng.integers(-5, 300)), int(rng.integers(-5, 300))]
        ax = [int(rng.integers(0, 40)), int(rng.integers(0, 40))]
        ang = int(rng.integers(-400, 400))
        d.case('se2p%d' % k, 'ellipse2Poly', [c, ax, ang, 0, 360, 1], keep=False)
    d.case('se2p_arc', 'ellipse2Poly', [[50, 50], [20, 10], 30, 45, 200, 5], keep=False)
    for k in range(30):
        x, y = float(rng.uniform(-10, 70)), float(rng.uniform(-10, 70))
        d.case('sppt%d' % k, 'pointPolygonTest', [{'arr': [[[5, 5]], [[60, 8]], [[50, 55]], [[3, 40]]], 'dtype': 'int32'}, [x, y], bool(k % 2)], keep=False)
    d.case('sppt_v', 'pointPolygonTest', [{'arr': [[5, 5], [60, 8], [50, 55], [3, 40]], 'dtype': 'int32'}, [60.0, 8.0], False], keep=False)
    d.case('sppt_e', 'pointPolygonTest', [{'arr': [[5, 5], [60, 5], [60, 55], [5, 55]], 'dtype': 'int32'}, [30.0, 5.0], False], keep=False)
    d.case('sppt_f', 'pointPolygonTest', [{'arr': [[5.5, 5.25], [60.5, 8], [50, 55.75]], 'dtype': 'float32'}, [30.0, 20.0], True], keep=False)


def consts():
    names = ['RETR_EXTERNAL', 'RETR_LIST', 'RETR_CCOMP', 'RETR_TREE', 'CHAIN_APPROX_NONE', 'CHAIN_APPROX_SIMPLE',
             'MORPH_RECT', 'MORPH_CROSS', 'MORPH_ELLIPSE', 'MORPH_ERODE', 'MORPH_DILATE', 'MORPH_OPEN', 'MORPH_CLOSE',
             'MORPH_GRADIENT', 'MORPH_TOPHAT', 'MORPH_BLACKHAT', 'THRESH_BINARY', 'THRESH_BINARY_INV', 'THRESH_TRUNC',
             'THRESH_TOZERO', 'THRESH_TOZERO_INV', 'THRESH_OTSU', 'ADAPTIVE_THRESH_MEAN_C', 'ADAPTIVE_THRESH_GAUSSIAN_C',
             'INTER_NEAREST', 'INTER_LINEAR', 'INTER_CUBIC', 'INTER_AREA', 'INTER_LANCZOS4', 'BORDER_CONSTANT',
             'BORDER_REPLICATE', 'BORDER_REFLECT', 'BORDER_REFLECT_101', 'BORDER_DEFAULT', 'COLOR_BGR2GRAY',
             'COLOR_RGB2GRAY', 'COLOR_GRAY2BGR', 'COLOR_GRAY2RGB', 'COLOR_BGR2RGB', 'COLOR_RGB2BGR', 'COLOR_RGBA2BGR',
             'COLOR_RGBA2RGB', 'COLOR_BGRA2BGR', 'COLOR_RGBA2GRAY', 'COLOR_BGRA2GRAY', 'INTERSECT_NONE',
             'INTERSECT_PARTIAL', 'INTERSECT_FULL', 'FILLED', 'LINE_4', 'LINE_8', 'LINE_AA', 'FONT_HERSHEY_SIMPLEX',
             'FONT_HERSHEY_PLAIN', 'CV_8U', 'CV_8S', 'CV_16U', 'CV_16S', 'CV_32S', 'CV_32F', 'CV_64F']
    return {n: int(getattr(cv2, n)) for n in names}


for page in PAGES:
    d = Dump(os.path.join(FIX, page))
    # fitEllipse jitters degenerate point sets with cv::theRNG(), whose state carries over
    # from call to call: every page starts from its own seed so pages can be replayed alone
    seed = zlib.crc32(page.encode()) & 0x7fffffff
    cv2.setRNGSeed(seed)
    page_cases(d, zlib.crc32(page.encode()) % 1000)  # the synthetic cases differ per page, stably
    out = {'page': page, 'cv2': cv2.__version__, 'numpy': np.__version__, 'rng_seed': seed, 'consts': consts(), 'cases': d.cases}
    with open(os.path.join(FIX, page, '20-cv.json'), 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(page, len(d.cases), 'cases', file=sys.stderr)
