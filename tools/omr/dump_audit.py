"""Python reference for the foundation audit's regression checks (tests/omr-model.test.js and
tests/omr-cv.test.js, section "audit"): edge cases the page fixtures never reach, each one a
divergence the JS port once had.

usage: python -I tools/omr/dump_audit.py FIXTURES [page ...]

Writes FIXTURES/<page>/23-audit.json, seeded per page (crc32 of the page name). Floats that JSON
cannot hold are strings: 'nan', 'inf', '-inf'. A call that raises is {"raises": <type name>}.

- argsort: np.argsort (numpy 2.4 on AVX-512 = x86-simd-sort; std::sort when quicksort makes no
  progress or there is a NaN) on tie-heavy arrays up to 5000 values, sorted ones, NaN ones
- find_peaks: homr's find_peaks on signals with hundreds of equal-height peaks
- py: round(x) / int(x) of NaN and inf (raise), round(x, nd) (correctly rounded) vs np.round,
  // and % with fractional divisors and zero
- np: median / percentile of float32 and float64 (NaN, empty), linspace, the float -> int casts
  (astype and setitem, NaN / inf / out of range), NaN in count_nonzero / nonzero / logical_and /
  logical_or / where
- tan: np.tan (get_center_extrapolated) and math.tan (is_overlapping_extrapolated) of float32
  angles, with the exact (decimal) correctly rounded value
- homr: crop_image with a NaN corner, _can_shapes_possibly_touch / ensure_min_dimension with NaN
  sizes, find_position_in_unit_sizes with a zero unit size, Staff.merge with a NaN x
- cv: every point-set call on an empty set, findNonZero with NaN, warpAffine with a zero dsize,
  addWeighted with mismatched shapes, fillPoly with an empty polygon, and the FMA-contracted
  scalar code of the AVX2 kernels: warpAffine's per-row tail (random narrow warps + searched
  blend roundings) and addWeighted below 16 values (searched roundings), cv2's output recorded
"""
import hashlib
import json
import math
import os
import random
import sys
import warnings
import zlib
from decimal import Decimal, getcontext

import cv2
import numpy as np

from homr import find_peaks as fp
from homr.bounding_boxes import RotatedBoundingBox
from homr.image_utils import crop_image
from homr.model import Staff, StaffPoint

FIX = sys.argv[1]
PAGES = sys.argv[2:] or sorted(d for d in os.listdir(FIX) if os.path.isdir(os.path.join(FIX, d)))
warnings.simplefilter('ignore')
getcontext().prec = 70


def enc(v):
    """JSON-safe value: non-finite floats as strings, numpy scalars / arrays as Python values"""
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


def dtan(x):
    """tan of the exact binary value of x, correctly rounded (decimal Taylor series)"""
    X = Decimal(x)
    X2 = X * X
    s = c = Decimal(0)
    ts, tc, n = X, Decimal(1), 0
    while True:
        s += ts
        c += tc
        n += 1
        ts = -ts * X2 / ((2 * n) * (2 * n + 1))
        tc = -tc * X2 / ((2 * n - 1) * (2 * n))
        if abs(ts) < Decimal('1e-66') and abs(tc) < Decimal('1e-66'):
            break
    return float(s / c)


def one_page(page):
    rnd = random.Random(zlib.crc32(page.encode()))
    out = {'page': page, 'numpy': np.__version__, 'cv2': cv2.__version__}

    # ---- np.argsort ----
    arrs = []
    for t in range(160):
        n = rnd.choice([2, 9, 17, 64, 200, 256, 257, 300, 513, 700, 1024, 1500, 3000, 5000])
        k = rnd.choice([1, 2, 3, 5, 10, 1000])
        kind = t % 6
        if kind <= 1:
            a = [float(rnd.randint(0, k)) for _ in range(n)]
        elif kind == 2:
            a = sorted(float(rnd.randint(0, k)) for _ in range(n))
        elif kind == 3:
            a = sorted((float(rnd.randint(0, k)) for _ in range(n)), reverse=True)
        elif kind == 4:
            a = [float(rnd.randint(0, k)) for _ in range(n)]
            for _ in range(rnd.randint(1, 4)):
                a[rnd.randrange(n)] = math.nan
        else:
            a = [rnd.randint(0, k) / 7.0 - 3 for _ in range(n)]
        arrs.append({'a': enc(a), 'order': enc(np.argsort(np.array(a)))})
    out['argsort'] = arrs

    # ---- find_peaks: many equal peaks, closer than `distance` ----
    peaks = []
    for t in range(12):
        n = rnd.choice([600, 1500, 3000])
        x = np.zeros(n)
        pos = 2
        while pos < n - 2:
            x[pos] = rnd.choice([3.0, 3.0, 3.0, 2.0])
            pos += rnd.randint(2, 5)
        height, distance = 1.0, float(rnd.choice([2.5, 4.0, 6.3]))
        peaks.append({'x': enc(x), 'height': height, 'distance': distance, 'prominence': 1,
                      'peaks': enc(fp.find_peaks(x, height=height, distance=distance, prominence=1)[0])})
    out['find_peaks'] = peaks

    # ---- Python builtins ----
    specials = [math.nan, math.inf, -math.inf, 2.5, -2.5, 3.5, 0.5, -0.5, 1e300, 123.4999]
    out['round'] = [[enc(v), call(lambda v=v: round(v))] for v in specials]
    out['int'] = [[enc(v), call(lambda v=v: int(v))] for v in specials]
    nd = []
    for _ in range(80):
        x = rnd.choice([rnd.uniform(-1000, 1000), rnd.randint(-5000, 5000) / 1000, rnd.randint(-99, 99) / 8])
        d = rnd.choice([0, 1, 2, 3, -1, -2])
        nd.append([x, d, round(x, d), float(np.round(np.float64(x), d))])
    for _ in range(40):  # decimal ties such as 2.675: inexact in binary, where round() and np.round differ
        d = rnd.choice([1, 2, 3])
        x = (rnd.randint(-3000, 3000) + 0.5) / 10 ** d
        nd.append([x, d, round(x, d), float(np.round(np.float64(x), d))])
    nd.append([2.675, 2, round(2.675, 2), float(np.round(np.float64(2.675), 2))])
    out['round_nd'] = nd
    div = []
    for _ in range(80):
        a = rnd.choice([rnd.uniform(-100, 100), float(rnd.randint(-50, 50)), 1.0, -1.0])
        b = rnd.choice([0.1, -0.1, 0.3, 0.7, 2.0, -3.0, 10.0, rnd.uniform(-5, 5), 0.0])
        div.append([a, b, call(lambda a=a, b=b: a // b), call(lambda a=a, b=b: a % b)])
    out['floordiv'] = div

    # ---- numpy helpers ----
    med = []
    for _ in range(60):
        n = rnd.randint(0, 40)
        v = [rnd.uniform(-100, 100) for _ in range(n)]
        if n and rnd.random() < 0.15:
            v[rnd.randrange(n)] = math.nan
        q = rnd.choice([0, 25, 50, 90, 100, rnd.uniform(0, 100)])
        a32 = np.array(v, dtype=np.float32)
        med.append({'v': enc(v), 'q': q,
                    'median64': call(lambda v=v: np.median(np.array(v, dtype=np.float64))),
                    'median32': call(lambda a32=a32: np.median(a32)),
                    'pct64': call(lambda v=v, q=q: np.percentile(np.array(v, dtype=np.float64), q)),
                    'pct32': call(lambda a32=a32, q=q: np.percentile(a32, q))})
    out['median'] = med
    lin = []
    for _ in range(40):
        a, b, n = rnd.uniform(-500, 500), rnd.uniform(-500, 500), rnd.randint(1, 30)
        if rnd.random() < 0.3:
            a, b = float(rnd.randint(-20, 20)), float(rnd.randint(-20, 20))
        lin.append([a, b, n, enc(np.linspace(a, b, n))])
    out['linspace'] = lin
    vals = [math.nan, math.inf, -math.inf, 3e9, -3e9, 1e10 + 5, 2147483647.9, -2147483648.9, 65536.7,
            -32769.2, 40000.5, 256.5, -129.7, 255.99, -0.99, 127.5, -128.5]
    vals += [rnd.choice([rnd.uniform(-5e9, 5e9), rnd.uniform(-70000, 70000), rnd.uniform(-300, 300)]) for _ in range(60)]
    casts = {'vals': enc(vals)}
    for dt in ['int8', 'uint8', 'int16', 'uint16', 'int32']:
        for src in ['float64', 'float32']:
            a = np.array(vals, dtype=src)
            casts[dt + '<' + src] = enc(a.astype(dt))
            dst = np.zeros(len(vals), dtype=dt)
            dst[:] = a
            casts[dt + '<' + src + ' setitem'] = enc(dst)
    out['casts'] = casts
    m = np.array([[math.nan, 0.0, -0.0, 1.0], [2.0, math.nan, 0.0, 0.0]])
    m2 = np.array([[1.0, math.nan, 0.0, 0.0], [math.nan, 0.0, 0.0, 3.0]])
    out['masks'] = {'a': enc(m), 'b': enc(m2), 'count_nonzero': enc(np.count_nonzero(m)),
                    'nonzero': enc(np.nonzero(m)), 'and': enc(np.logical_and(m, m2).astype(np.uint8)),
                    'or': enc(np.logical_or(m, m2).astype(np.uint8)), 'where': enc(np.where(m, 7.0, -1.0))}

    # ---- tan ----
    angles = [float(np.float32(rnd.uniform(-45, 45))) for _ in range(400)] + [0.0, 45.0, -45.0, 30.0, 1.0]
    out['tan'] = [[a, float(np.tan(a / 180 * np.pi)), dtan(a / 180 * np.pi),
                   math.tan(a * math.pi / 180.0), dtan(a * math.pi / 180.0)] for a in angles]

    # ---- homr functions on NaN / zero sizes ----
    img = np.arange(100, dtype=np.uint8).reshape(10, 10)
    nan = math.nan
    out['crop'] = [[enc(c), call(lambda c=c: crop_image(img, *c).shape)]
                   for c in ([2, 3, nan, 7], [nan, 3, 5, 7], [2, nan, 5, 7], [2, 3, 5, nan], [2.5, 3.5, 7.5, 8.5], [8, 9, 2, 1])]
    e = np.zeros((0, 1, 2), np.int32)
    boxes = [((50.0, 50.0), (10.0, 4.0), 0.0), ((80.0, 50.0), (10.0, 4.0), 0.0), ((50.0, 50.0), (10.0, nan), 0.0),
             ((50.0, 50.0), (nan, 4.0), 0.0), ((60.0, 50.0), (nan, nan), 0.0)]
    touch = []
    for i, a in enumerate(boxes):
        for j, b in enumerate(boxes):
            touch.append([i, j, call(lambda a=a, b=b: RotatedBoundingBox(a, e)._can_shapes_possibly_touch(RotatedBoundingBox(b, e)))])
    out['touch'] = {'boxes': enc(boxes), 'pairs': touch}
    out['ensure_min_dimension'] = [[enc(w), enc(h), call(lambda w=w, h=h: RotatedBoundingBox(boxes[0], e).ensure_min_dimension(w, h).box[1])]
                                   for w, h in ([nan, 5], [12, nan], [3, 3], [nan, nan])]
    sp = StaffPoint(10.0, [10.0, 10.0, 10.0, 10.0, 10.0], 0.0)  # unit size 0
    probe = RotatedBoundingBox(((10.0, 12.0), (4.0, 4.0), 0.0), e)
    probe0 = RotatedBoundingBox(((10.0, 10.0), (4.0, 4.0), 0.0), e)
    out['position_zero_unit'] = [call(lambda: sp.find_position_in_unit_sizes(probe)), call(lambda: sp.find_position_in_unit_sizes(probe0))]
    s_ok = Staff([StaffPoint(float(x), [10.0, 20.0, 30.0, 40.0, 50.0], 0.0) for x in (0, 10)])
    s_nan = Staff([StaffPoint(nan, [110.0, 120.0, 130.0, 140.0, 150.0], 0.0), StaffPoint(10.0, [110.0, 120.0, 130.0, 140.0, 150.0], 0.0)])
    out['staff_merge_nan'] = call(lambda: len(s_ok.merge(s_nan).grid))

    # ---- cv2 ----
    cvd = {}
    for dt in ('int32', 'float32'):
        z = np.zeros((0, 1, 2), dt)
        sq = np.array([[0, 0], [4, 0], [4, 4], [0, 4]], np.float32)
        cvd[dt] = {
            'minAreaRect': call(lambda z=z: cv2.minAreaRect(z)),
            'boundingRect': call(lambda z=z: cv2.boundingRect(z)),
            'contourArea': call(lambda z=z: cv2.contourArea(z)),
            'convexHull': call(lambda z=z: cv2.convexHull(z)),
            'convexHullIdx': call(lambda z=z: cv2.convexHull(z, returnPoints=False)),
            'pointPolygonTest': call(lambda z=z: cv2.pointPolygonTest(z, (1.0, 2.0), False)),
            'pointPolygonTestDist': call(lambda z=z: cv2.pointPolygonTest(z, (1.0, 2.0), True)),
            'intersectConvexConvex': call(lambda z=z, sq=sq: cv2.intersectConvexConvex(z.astype(np.float32), sq)),
            'intersectConvexConvex1': call(lambda sq=sq: cv2.intersectConvexConvex(np.array([[[1, 1]]], np.float32), sq)),
            'drawContours': call(lambda z=z: int(cv2.drawContours(np.zeros((5, 5), np.uint8), [z.astype(np.int32)], -1, 255, 1).sum())),
            'fillPoly': call(lambda z=z: int(cv2.fillPoly(np.zeros((5, 5), np.uint8), [z.astype(np.int32)], 255).sum())),
        }
    cvd['findNonZero_nan'] = call(lambda: cv2.findNonZero(np.array([[math.nan, 0], [0, 1]], np.float32)))
    h, w = rnd.randint(5, 40), rnd.randint(5, 40)
    src = np.array([rnd.randint(0, 255) for _ in range(h * w * 3)], np.uint8).reshape(h, w, 3)
    M = np.array([[1.0 + rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), rnd.uniform(-2, 2)],
                  [rnd.uniform(-0.05, 0.05), 1.0 + rnd.uniform(-0.05, 0.05), rnd.uniform(-2, 2)]])
    warps = []
    for ds in ((0, 0), (0, h + 3), (w + 2, 0), (w + 2, h + 3)):
        r = cv2.warpAffine(src, M, ds)
        warps.append({'dsize': list(ds), 'shape': list(r.shape), 'sha1': hashlib.sha1(np.ascontiguousarray(r).tobytes()).hexdigest()})
    cvd['warpAffine'] = {'src': enc(src.ravel()), 'h': h, 'w': w, 'M': enc(M), 'cases': warps}
    # the scalar code of the AVX2 kernels (a row's last width % 16 pixels of warpAffine, all of
    # addWeighted below 16 values) is FMA-contracted by GCC. Random warps with narrow outputs
    # exercise the contracted coordinates; for the contracted blends (rarely visible) a search
    # proposes inputs where plain and fused float32 math would round to different bytes, and
    # cv2's own output is the expectation.
    f32 = lambda v: float(np.float32(v))  # noqa: E731
    tails = []
    for _ in range(300):
        c = rnd.choice([1, 3])
        sh, sw = rnd.randint(4, 40), rnd.randint(4, 40)
        a = np.array([rnd.randint(0, 255) for _ in range(sh * sw * c)], np.uint8).reshape((sh, sw) if c == 1 else (sh, sw, c))
        ang, sc = rnd.uniform(-0.3, 0.3), rnd.uniform(0.7, 1.4)
        MM = np.array([[sc * math.cos(ang), -sc * math.sin(ang), rnd.uniform(-5, 5)], [sc * math.sin(ang), sc * math.cos(ang), rnd.uniform(-5, 5)]])
        ds = (rnd.randint(1, 15), rnd.randint(10, 60))
        r = cv2.warpAffine(a, MM, ds)
        tails.append({'src': enc(a.ravel()), 'h': sh, 'w': sw, 'c': c, 'M': enc(MM), 'dsize': list(ds),
                      'sha1': hashlib.sha1(np.ascontiguousarray(r).tobytes()).hexdigest()})
    cvd['warpAffine_tails'] = tails
    blends = []
    while len(blends) < 6:
        p00, p01 = rnd.randint(1, 255), rnd.randint(0, 255)
        d = p01 - p00
        if not d:
            continue
        m = rnd.randint(min(p00, p01), max(p00, p01) - 1)
        k0 = round((m + 0.5 - p00) / d * 4194304)
        for k in range(k0 - 4, k0 + 5):
            if not 0 < k < 4194304:
                continue
            fx = k / 4194304
            if round(f32(p00 + f32(fx * d))) != round(f32(p00 + fx * d)):
                a = np.zeros((6, 6), np.uint8)
                a[2, 2], a[2, 3] = p00, p01
                MM = np.array([[1.0, 0.0, 2 + fx], [0.0, 1.0, 2.0]])
                r = cv2.warpAffine(a, MM, (3, 3), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
                blends.append({'p00': p00, 'p01': p01, 'fx': fx, 'out': enc(r)})
                break
    cvd['warpAffine_blends'] = blends
    addw = []
    while len(addw) < 6:
        al, be, ga = rnd.uniform(-1, 2), rnd.uniform(-1.5, 1.5), rnd.uniform(-40, 40)
        w1, w2, dl = f32(al), f32(be), f32(ga)
        x1, x2 = rnd.randint(0, 255), rnd.randint(0, 255)
        if round(f32(f32(f32(x1 * w1) + f32(x2 * w2)) + dl)) != round(f32(f32(x1 * w1 + f32(x2 * w2)) + dl)):
            n = rnd.randint(1, 15)
            A, B = np.full((1, n), x1, np.uint8), np.full((1, n), x2, np.uint8)
            addw.append({'a': x1, 'b': x2, 'n': n, 'alpha': al, 'beta': be, 'gamma': ga,
                         'out': enc(cv2.addWeighted(A, al, B, be, ga)), 'out40': enc(cv2.addWeighted(np.full((1, 40), x1, np.uint8), al, np.full((1, 40), x2, np.uint8), be, ga))})
    cvd['addWeighted_scalar'] = addw
    cvd['addWeighted_mismatch'] = call(lambda: cv2.addWeighted(np.zeros((2, 6), np.uint8), 0.5, np.zeros((3, 4), np.uint8), 0.5, 0).shape)
    cvd['addWeighted_channels'] = call(lambda: cv2.addWeighted(np.zeros((2, 6), np.uint8), 0.5, np.zeros((2, 2, 3), np.uint8), 0.5, 0).shape)
    out['cv'] = cvd
    return out


for page in PAGES:
    with open(os.path.join(FIX, page, '23-audit.json'), 'w') as f:
        json.dump(one_page(page), f)
    print(page, 'ok')
