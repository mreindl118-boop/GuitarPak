"""Reference dump for the JS port of homr's page -> segmentation masks stage
(js/omr/autocrop.js, resize.js, color_adjust.js, inference_segnet.js, noise_filtering.js;
tests/omr-segment.test.js).

usage: python -I tools/omr/dump_segment.py FIXTURES [--seg SEGNET.onnx] [--prep SHEETLAB_PREP]
                                           [--no-segnet] [page ...]

Per page dir FIXTURES/<page>/ (made by dump_stages.py) writes
  30-filtered-staff-pre.png  the staff mask after filter_predictions and BEFORE
                             staff_detection.make_lines_stronger (0/255); 05-filtered-staff.png
                             is after it
  30-segment.json            noise grid (create_grid on 255 * the 04 staff mask), filtered /
                             total cells, the mask (null or sha1), sha1 + shape of every array
                             filter_predictions returns, the Python timings per stage and (with
                             --seg) segnet re-run on 03-clahe.png: tiles, batch size, whether
                             its masks equal the 04-mask-*.png files
Synthetic cases go to FIXTURES top-level FILES (a directory would be taken for a page by the
other suites):
  30-seg-synthetic.json + 30-seg-<case>-00-input.png / -02-resized.png / -03-clahe.png:
    autocrop_with_offset -> resize_image -> apply_clahe on SheetLab's preprocessed photo
    (--prep: sheetlab-prep/photo/02-prep-0.png, a rotated page on a desk), its other prep cases
    and generated photos (a sheet on a coloured desk, shadows, texture, tiny paper, blank).
  31-noise-synthetic.json + 31-noise-<case>-staff.png: filter_predictions with noise added to
    a page's staff mask (some cells filtered, an isolated noisy cell, > 50 % noisy, values that
    wrap the uint8 grid).
  32-segnet-synthetic.json: inference() on small random images with a stand-in model (see
    FakeSegnet): tile order, batch sizes per run (partial / never-full batches), padding of
    tiles beyond the image, argmax ties and the averaging merge of overlapping steps.
  34-seg-edges.json: what homr does with degenerate inputs (the exception class + message, or
    the result's shape + sha1): resize_image to a zero height or from a zero width, the noise
    grid of a mask lower or narrower than 20 px, empty, 3-D or float64, a 2-D gray or an empty
    page into autocrop / apply_clahe, a 3-channel page into inference() (stand-in model), and
    inference()'s arguments by Python type (None / float / str / bool / negative step, window and
    batch size: where it raises, whether the Segnet was made, the batch size of every run), and
    merge_patches with a bad step or too few patches.
--only pages,synthetic,noise,tiling,edges rewrites just those sections (e.g. --only tiling needs no
model and keeps the segnet results already in 30-segment.json).
The shipping segnet on page shapes the fixtures lack (A4, short, strip): dump_segment_shapes.py.
"""
import argparse
import hashlib
import json
import os
import sys
import time

import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('fixtures')
ap.add_argument('pages', nargs='*')
ap.add_argument('--seg', help='segnet .onnx to run (the shipping int8 model)')
ap.add_argument('--prep', help='sheetlab-prep dir (dump_sheetlab_prep.py output)')
ap.add_argument('--no-segnet', action='store_true')
ap.add_argument('--only', default='pages,synthetic,noise,tiling,edges',
                help='comma list of the sections to (re)write: pages, synthetic, noise, tiling, edges')
a = ap.parse_args()
ONLY = set(a.only.split(','))

import homr.segmentation.inference_segnet as S  # noqa: E402
if a.seg:
    S.segnet_path_onnx = a.seg
from homr import color_adjust  # noqa: E402
from homr import main as M  # noqa: E402
from homr.autocrop import autocrop_with_offset  # noqa: E402
from homr.debug import Debug  # noqa: E402
from homr.model import InputPredictions  # noqa: E402
from homr.noise_filtering import create_grid, filter_predictions  # noqa: E402
from homr.resize import resize_image  # noqa: E402

FIX = a.fixtures
PAGES = a.pages or sorted(d for d in os.listdir(FIX) if os.path.isdir(os.path.join(FIX, d)))
NAMES = ['staff', 'symbols', 'stems_rest', 'notehead', 'clefs_keys']
ALL = ['original', 'preprocessed', 'notehead', 'symbols', 'staff', 'clefs_keys', 'stems_rest']


def sha1(arr):
    return hashlib.sha1(np.ascontiguousarray(arr).tobytes()).hexdigest()


def desc(arr):
    return {'shape': list(arr.shape), 'dtype': str(arr.dtype), 'sha1': sha1(arr)}


def mask_png(path, m):
    cv2.imwrite(path, (m > 0).astype(np.uint8) * 255)


def load_preds(pdir, staff=None):
    original = cv2.imread(os.path.join(pdir, '02-resized.png'))
    pre = cv2.imread(os.path.join(pdir, '03-clahe.png'), cv2.IMREAD_GRAYSCALE)
    m = {n: (cv2.imread(os.path.join(pdir, '04-mask-%s.png' % n), cv2.IMREAD_GRAYSCALE) > 0).astype(np.uint8) for n in NAMES}
    if staff is not None:
        m['staff'] = staff
    # get_predictions: cv2.resize to the masks' (equal) shape is a copy
    return InputPredictions(original=original, preprocessed=pre, notehead=m['notehead'], symbols=m['symbols'],
                            staff=m['staff'], clefs_keys=m['clefs_keys'], stems_rest=m['stems_rest'])


def filter_report(preds, page):
    gray = 255 * preds.staff
    H, W = gray.shape
    grid = create_grid(gray, H // 20, W // 20)
    t = time.perf_counter()
    out = filter_predictions(preds, Debug(preds.original, page, False))
    secs = time.perf_counter() - t
    rep = {'grid': grid.tolist(), 'unchanged': out is preds, 'filter_secs': round(secs, 3),
           'outputs': {n: desc(getattr(out, n)) for n in ALL}}
    # the mask create_noise_grid builds (returned only when 0 < filtered <= 50 %)
    mask = np.zeros(gray.shape, np.uint8)
    from homr.noise_filtering import apply_noise_filter
    f, tot = apply_noise_filter(grid, mask, cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR), H // 20, W // 20)
    rep['filtered_cells'], rep['total_cells'] = f, tot
    rep['mask'] = None if out is preds else sha1(mask)
    return out, rep


# ---- the 7 pages ----
for page in PAGES:
    pdir = os.path.join(FIX, page)
    if 'pages' not in ONLY or not os.path.exists(os.path.join(pdir, '04-mask-staff.png')):
        continue
    rep = {'page': page, 'timings': {}}
    img = cv2.imread(os.path.join(pdir, '00-input.png'))
    t = time.perf_counter(); cropped, tl = autocrop_with_offset(img); rep['timings']['autocrop'] = round(time.perf_counter() - t, 3)
    t = time.perf_counter(); resized = resize_image(cropped); rep['timings']['resize'] = round(time.perf_counter() - t, 3)
    t = time.perf_counter(); pre = color_adjust.apply_clahe(resized); rep['timings']['clahe'] = round(time.perf_counter() - t, 3)
    rep['chain_matches_fixtures'] = bool(np.array_equal(resized, cv2.imread(os.path.join(pdir, '02-resized.png'))) and
                                         np.array_equal(pre, cv2.imread(os.path.join(pdir, '03-clahe.png'), cv2.IMREAD_GRAYSCALE)))
    if a.seg and not a.no_segnet:
        t = time.perf_counter()
        preds = M.get_predictions(resized, pre, os.path.join(pdir, '00-input.png'), False, False)
        rep['timings']['segnet'] = round(time.perf_counter() - t, 3)
        h, w = pre.shape
        rep['segnet'] = {'model': os.path.basename(a.seg), 'batch_size': 8, 'step_size': 320, 'win_size': 320,
                         'tiles': len(range(0, max(h, 320), 320)) * len(range(0, max(w, 320), 320)),
                         'masks_equal_04': {n: bool(np.array_equal(getattr(preds, n) > 0,
                                                                     cv2.imread(os.path.join(pdir, '04-mask-%s.png' % n), cv2.IMREAD_GRAYSCALE) > 0))
                                            for n in NAMES}}
    preds = load_preds(pdir)
    out, frep = filter_report(preds, page)
    rep['filter'] = frep
    rep['timings']['filter_predictions'] = frep.pop('filter_secs')
    mask_png(os.path.join(pdir, '30-filtered-staff-pre.png'), out.staff)
    with open(os.path.join(pdir, '30-segment.json'), 'w') as f:
        json.dump(rep, f, indent=1)
    print(page, rep['timings'], 'segnet==04' if rep.get('segnet') and all(rep['segnet']['masks_equal_04'].values()) else '', file=sys.stderr)


# ---- synthetic photos: autocrop -> resize -> CLAHE ----
def desk_photo(page, scale, angle, canvas, at, desk, shadow=None, texture=0, seed=0):
    """page scaled + rotated onto a desk of colour `desk` (BGR) at `at` (x, y of the page centre)"""
    h, w = page.shape[:2]
    pw, ph = int(w * scale), int(h * scale)
    small = cv2.resize(page, (pw, ph), interpolation=cv2.INTER_AREA)
    cw, ch = canvas
    M = cv2.getRotationMatrix2D((pw / 2, ph / 2), angle, 1.0)
    M[0, 2] += at[0] - pw / 2
    M[1, 2] += at[1] - ph / 2
    rot = cv2.warpAffine(small, M, (cw, ch), borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
    m = cv2.warpAffine(np.full((ph, pw), 255, np.uint8), M, (cw, ch))
    bg = np.empty((ch, cw, 3), np.uint8)
    bg[:] = desk
    if texture:
        rng = np.random.default_rng(seed)
        bg = np.clip(bg.astype(np.int16) + rng.integers(-texture, texture + 1, bg.shape), 0, 255).astype(np.uint8)
    if shadow is not None:  # (x0, colour): everything right of x0 is paper in a shadow
        bg[:, shadow[0]:] = shadow[1]
    return np.where(m[..., None] > 0, rot, bg).astype(np.uint8)


synthetic = []
if a.prep and 'synthetic' in ONLY:
    for name, rel in [('photo', 'photo/02-prep-0.png'), ('photo-source', 'photo/00-source.png'),
                      ('dark-frame', 'dark-frame/00-source.png'), ('low-res', 'low-res/01-split-0.png'),
                      ('spread-0', 'spread/02-prep-0.png')]:
        p = os.path.join(a.prep, rel)
        if os.path.exists(p):
            synthetic.append((name, cv2.imread(p)))
base = cv2.imread(os.path.join(FIX, PAGES[0], '00-input.png')) if PAGES else None
if base is not None and 'synthetic' in ONLY:
    synthetic += [
        ('desk', desk_photo(base, 0.55, 3.0, (1800, 2300), (900, 1150), (60, 100, 140))),
        ('desk-left', desk_photo(base, 0.6, -2.0, (1700, 2200), (760, 1100), (40, 90, 170))),
        ('desk-shadow', desk_photo(base, 0.55, 1.5, (1800, 2300), (850, 1150), (70, 110, 150), shadow=(1500, (190, 190, 190)))),
        ('desk-texture', desk_photo(base, 0.5, -4.0, (1600, 2100), (800, 1050), (50, 95, 135), texture=25, seed=7)),
        ('desk-blue', desk_photo(base, 0.45, 6.0, (1500, 1900), (760, 960), (150, 90, 40))),
        ('tiny-paper', desk_photo(base, 0.15, 0.0, (1600, 2000), (800, 1000), (60, 100, 140))),
        ('blank', np.full((900, 700, 3), 255, np.uint8)),
        ('dark', np.full((640, 480, 3), 12, np.uint8)),
        ('width-1920', cv2.resize(base, (1920, 2400), interpolation=cv2.INTER_AREA)),
    ]
cases = []
for name, img in synthetic:
    stem = os.path.join(FIX, '30-seg-%s' % name)
    cv2.imwrite(stem + '-00-input.png', img)
    t = time.perf_counter(); cropped, tl = autocrop_with_offset(img); tc = time.perf_counter() - t
    resized = resize_image(cropped)
    pre = color_adjust.apply_clahe(resized)
    cv2.imwrite(stem + '-02-resized.png', resized)
    cv2.imwrite(stem + '-03-clahe.png', pre)
    cases.append({'name': name, 'input': list(img.shape), 'top_left': [int(tl[0]), int(tl[1])], 'shape': list(cropped.shape),
                  'cropped_is_input': cropped is img, 'crop_sha1': sha1(cropped), 'resized': desc(resized), 'clahe': desc(pre),
                  'autocrop_secs': round(tc, 3)})
    print('synthetic', name, img.shape, '->', tl, cropped.shape, file=sys.stderr)
if cases:
    with open(os.path.join(FIX, '30-seg-synthetic.json'), 'w') as f:
        json.dump({'cases': cases}, f, indent=1)


# ---- synthetic noise: filter_predictions ----
if 'noise' in ONLY and PAGES and os.path.exists(os.path.join(FIX, PAGES[0], '04-mask-staff.png')):
    page = 'belle-p1' if 'belle-p1' in PAGES else PAGES[0]
    pdir = os.path.join(FIX, page)
    st = (cv2.imread(os.path.join(pdir, '04-mask-staff.png'), cv2.IMREAD_GRAYSCALE) > 0).astype(np.uint8)
    H, W = st.shape
    rng = np.random.default_rng(31)

    def noisy(regions):
        s = st.copy()
        for (y0, y1, x0, x1, p) in regions:
            s[y0:y1, x0:x1] |= (rng.random((y1 - y0, x1 - x0)) < p).astype(np.uint8)
        return s
    ncases = [
        ('block', noisy([(400, 900, 300, 900, 0.05)])),
        ('two-blocks', noisy([(100, 500, 1300, 1800, 0.03), (1700, 2300, 0, 700, 0.08)])),
        ('isolated', noisy([(1000, 1124, 960, 1056, 0.1)])),
        ('most', noisy([(0, H, 0, int(W * 0.7), 0.06)])),
        ('wrap', noisy([(600, 1100, 400, 1000, 0.5)])),
        ('edges', noisy([(H - 400, H, W - 400, W, 0.1), (0, 300, 0, 300, 0.1)])),
    ]
    out_cases = []
    for name, s in ncases:
        cv2.imwrite(os.path.join(FIX, '31-noise-%s-staff.png' % name), s * 255)
        preds = load_preds(pdir, staff=s)
        _, rep = filter_report(preds, page)
        rep.pop('filter_secs')
        rep['name'] = name
        out_cases.append(rep)
        print('noise', name, 'unchanged' if rep['unchanged'] else '%d of %d cells' % (rep['filtered_cells'], rep['total_cells']), file=sys.stderr)
    with open(os.path.join(FIX, '31-noise-synthetic.json'), 'w') as f:
        json.dump({'page': page, 'cases': out_cases}, f, indent=1)


# ---- synthetic tiling: inference() with a stand-in model (tile order, batches, padding, merge) ----
# out[b, k] = (x[b, 0] * (k + 1) * 7 + b * 13 + k * 31 + x[b, 2]) % 11: integer valued float32 (exact
# in both languages), depends on the tile's place in its batch, and ties channels often (argmax
# takes the first). Small windows so the inputs fit into the JSON.
class FakeSegnet:
    def __init__(self):
        self.calls = []

    def run(self, x):
        self.calls.append(int(x.shape[0]))
        k = np.arange(6, dtype=np.float32)[None, :, None, None]
        b = np.arange(x.shape[0], dtype=np.float32)[:, None, None, None]
        return np.remainder(x[:, :1] * (k + 1) * 7 + b * 13 + k * 31 + x[:, 2:3], np.float32(11)).astype(np.float32)


import base64  # noqa: E402
import zlib  # noqa: E402
rng = np.random.default_rng(32)
tcases = []
saved = S._segnet_inference
TILING = [] if 'tiling' not in ONLY else [
    (70, 45, 32, -1, 8), (70, 45, 32, 32, 3), (20, 50, 32, 16, 1), (64, 64, 32, -1, 4), (33, 100, 32, 10, 5),
    (100, 33, 16, 7, 2), (31, 31, 32, -1, 8), (96, 128, 32, 32, 8), (50, 70, 24, 16, 6), (40, 70, 32, 16, 0),
    # (audit) inference() loops range(0, max(h, win), step) but merge_patches range(0, h, step): when
    # h or w < win they make different tile counts and merge_patches reads the patches list
    # misaligned (homr's behaviour, kept); a step larger than the window leaves unweighted gaps
    # (weight 0 -> 1, class 0); an odd window; a batch larger than the page; a 1 x 1 image
    (10, 100, 32, 16, 3), (10, 10, 32, 16, 3), (100, 10, 32, 16, 3), (100, 100, 16, 40, 2), (65, 65, 33, -1, 4),
    (40, 40, 32, 16, 100), (1, 1, 32, -1, 8)]
for (h, w, win, step, batch) in TILING:
    img = rng.integers(0, 256, (h, w), dtype=np.uint8)
    fake = FakeSegnet()
    S._segnet_inference = fake
    masks = S.inference(img, False, batch, step, win)
    tcases.append({'h': h, 'w': w, 'win': win, 'step': step, 'batch': batch, 'calls': fake.calls,
                   'input': base64.b64encode(zlib.compress(img.tobytes())).decode(),
                   'masks': {n: sha1(m) for n, m in zip(['staff', 'symbols', 'stems_rests', 'notehead', 'clefs_keys'], masks)},
                   'counts': {n: int(m.sum()) for n, m in zip(['staff', 'symbols', 'stems_rests', 'notehead', 'clefs_keys'], masks)}})
S._segnet_inference = saved
if tcases:
    with open(os.path.join(FIX, '32-segnet-synthetic.json'), 'w') as f:
        json.dump({'cases': tcases}, f, indent=1)
    print('tiling cases', len(tcases), file=sys.stderr)


# ---- edges: degenerate inputs (homr's exceptions are part of the behaviour) ----
def outcome(fn):
    try:
        r = fn()
    except Exception as e:  # noqa: BLE001
        return {'raises': type(e).__name__, 'message': str(e)}
    if r is None:
        return {'value': None}
    if isinstance(r, tuple):
        r = r[0]
    return {'shape': list(r.shape), 'dtype': str(r.dtype), 'sha1': sha1(r)}


if 'edges' in ONLY:
    from homr.noise_filtering import create_noise_grid, estimate_noise  # noqa: E402
    from homr.segmentation.inference_segnet import merge_patches  # noqa: E402
    ecases = []
    # (audit 2) + an image 0 px wide (ZeroDivisionError in calc_target_image_size), 0 px high,
    # 1 x 1 and 2 x 1 pixels
    for shp in [(1, 3841, 3), (1, 4000, 3), (1, 3839, 3), (3, 7681, 3), (10, 0, 3), (0, 10, 3), (0, 0, 3),
                (10, 0), (1, 1, 3), (2, 1, 3), (1, 2, 3)]:
        ecases.append({'fn': 'resize_image', 'shape': list(shp), 'fill': 200,
                       'out': outcome(lambda: resize_image(np.full(shp, 200, np.uint8)))})
    # (audit 2) + an empty mask (cvtColor raises before the grid divides by zero), a 3-D one
    # (`h, w = gray.shape`), a float64 one (cvtColor's depth check)
    for shp, dt in [((15, 100), 'uint8'), ((100, 15), 'uint8'), ((19, 19), 'uint8'), ((20, 20), 'uint8'),
                    ((21, 400), 'uint8'), ((0, 100), 'uint8'), ((100, 0), 'uint8'), ((40, 40, 3), 'uint8'),
                    ((40, 40), 'float64')]:
        ecases.append({'fn': 'create_noise_grid', 'shape': list(shp), 'fill': 0, 'dtype': dt,
                       'out': outcome(lambda: create_noise_grid(np.zeros(shp, dt), Debug(None, 'edges', False)))})
    ecases.append({'fn': 'estimate_noise', 'shape': [5, 5, 3], 'fill': 0,
                   'out': outcome(lambda: estimate_noise(np.zeros((5, 5, 3), np.uint8)))})
    for fn, call in [('autocrop_with_offset', autocrop_with_offset), ('apply_clahe', color_adjust.apply_clahe)]:
        for shp in [(50, 40), (10, 0, 3), (0, 10, 3), (1, 1, 3), (3, 3, 3)]:
            ecases.append({'fn': fn, 'shape': list(shp), 'fill': 200, 'out': outcome(lambda: call(np.full(shp, 200, np.uint8)))})
    # inference(): the arguments' Python types decide where (and whether) it raises - a None step
    # before the Segnet is made, a float or None window or a float step in max() / range() /
    # np.full after it; batch sizes that never equal len(batch) run every tile in one batch (a
    # bool is 0 / 1); a negative window makes both loops empty (IndexError in merge_patches).
    # JSON null = None, true = True; JS cannot tell 32.0 from 32, so floats are fractional.
    saved, saved_cls = S._segnet_inference, S.Segnet
    INF = [((40, 40, 3), 8, 16, 32), ((40, 40, 3), 8, 0, 32), ((40, 40), 8, 0, 32),
           ((40, 70), 8, None, 32), ((40, 70, 3), 8, None, 32), ((40, 70), 8, 16.5, 32), ((40, 70, 3), 8, 16.5, 32),
           ((40, 70), 8, -1, None), ((40, 70), 8, 16, None), ((40, 70), 8, -1, 33.5), ((40, 70), 8, 16, 33.5),
           ((40, 70), 8, 16, 50.5), ((40, 70), 8, 16, 100.5), ((40, 70), 8, 0, 33.5), ((40, 70), 8, 0, 50.5),
           ((40, 70), 8, '16', 32), ((40, 70), 8, 16, '32'), ((40, 70), 8, -1, '32'), ((40, 70), 8, False, 32),
           ((40, 70), 8, 16, True), ((40, 70), 8, -1, True), ((40, 70), 8, 16, -32), ((40, 70), 8, -1, -32),
           ((40, 70), 8, -5, -31), ((40, 70), 8, 16, 0), ((40, 70), 8, -1, 0), ((40, 70), 8, -1, 1),
           ((40, 70), 2.5, 16, 32), ((40, 70), None, 16, 32), ((40, 70), True, 16, 32), ((40, 70), False, 16, 32),
           ((40, 70), 0, 16, 32), ((40, 70), -3, 16, 32), ((40, 70), '8', 16, 32), ((12, 9), 8, True, 4)]
    for shp, batch, step, win in INF:
        made = []

        def factory(use_gpu, made=made):
            made.append(1)
            return FakeSegnet()
        S._segnet_inference, S.Segnet = None, factory
        img = (np.arange(int(np.prod(shp))) % 251).astype(np.uint8).reshape(shp)
        rec = {'fn': 'inference', 'shape': list(shp), 'fill': 'arange', 'step': step, 'win': win, 'batch': batch,
               'out': outcome(lambda: S.inference(img, False, batch, step, win))}
        rec['segnet_made'] = bool(made)
        rec['calls'] = S._segnet_inference.calls if S._segnet_inference is not None else []
        ecases.append(rec)
    S._segnet_inference, S.Segnet = saved, saved_cls
    # merge_patches on its own: range() of a bad step, too few / no patches (uint8 patches, so
    # the result keeps the dtype the JS port gives)
    for n, shape, step in [(1, (40, 40), 0), (1, (40, 40), None), (9, (40, 40), 16.5), (1, (40, 40), 16), (0, (40, 40), 16),
                           (0, (0, 40), 16), (1, (40, 40), -16), (4, (40, 40), 16)]:
        pats = [(np.arange(32 * 32) % 6).astype(np.uint8).reshape(32, 32) for _ in range(n)]
        ecases.append({'fn': 'merge_patches', 'patches': n, 'image_shape': list(shape), 'step': step, 'win': 32,
                       'out': outcome(lambda: merge_patches(pats, shape, 32, step))})
    with open(os.path.join(FIX, '34-seg-edges.json'), 'w') as f:
        json.dump({'cases': ecases}, f, indent=1)
    print('edge cases', [(c['fn'], c.get('shape', c.get('image_shape')), c['out'].get('raises') or c['out'].get('shape')) for c in ecases], file=sys.stderr)
