"""Reference recordings of homr's reading stage for the JS port (js/omr/staff_dewarping.js,
transformer_encoder_inference.js, transformer_decoder_inference.js, transformer_staff2score.js,
staff_parsing_tromr.js, staff_parsing.js; tests/omr-read.test.js).

usage: python -I tools/omr/dump_read.py [--models DIR] [--fp32-enc PATH] [--modes ship,fp16,fp32enc]
                                        [--ctx] [--no-synthetic] FIXTURES

Always runs every page of FIXTURES in sorted order in one process: the pages share cv::theRNG
through fitEllipse (see tools/omr/dump_staff.py), so a page's staffs only reproduce when the
pages before it ran first. Per page, FIXTURES/<page>/:

  40-read-staffs.json  the multi_staffs after repair_systems at FULL float precision (floats as
                       repr, NaN/inf as strings), with everything the JS test needs to rebuild the
                       model objects: staff grids, is_grandstaff, every symbol with its box state
                       (raw rect, normalised box, corners, polygon, contours, debug id), connections.
                       Rebuilt from the 05-filtered masks with main.detect_staffs_in_image (like
                       dump_staff.py) and asserted equal to 08-repaired.json (dump_stages'
                       4-decimal serialisation) first; the image parse_staffs reads is
                       03-clahe.png (asserted).
  40-read-prep.json    every prepare_staff_image call step by step: region, canvas size, scaling,
                       both crops, the transformed staff, the dewarping (span / optimal points,
                       the src/dst points, Subdiv2D's raw triangle list, the simplices, every
                       affine matrix), image sha1s after each step (resize, crop, dewarp, crop,
                       black contours, canvas == 09-staff-NN.png, asserted), and staff_to_page on
                       sample points.
  40-read-<mode>.json  parse_staffs with the transformer of <mode>: per Staff2Score.predict call
                       the encoder input sha1 (float32 bytes), the context sha1 + stats, the
                       tokens, and per decoder step the argmax and top-2 logit margin of the six
                       heads plus the attention output; then the voices (str + image_coordinates)
                       and the MusicXML generate_xml(XmlGeneratorArguments(False, None, None),
                       voices, '') writes to a path.
                       ship    = use_gpu_inference=False with the shipping int8 encoder + int8
                                 decoder from --models (what soundLAB runs)
                       fp16    = Config() as dump_stages.py ran it (no GPU here -> the *_fp16.onnx
                                 models); asserted equal to 10-tokens.json / 11-score.musicxml
                       fp32enc = use_gpu_inference=False, the fp32 encoder (--fp32-enc) + the
                                 int8 decoder
  41-read-ctx-<mode>-NN.bin  (--ctx) the encoder output of call NN, raw float32 little endian
                       [1, 1280, 512]: the JS test feeds it to its decoder to separate encoder
                       from decoder numerics.

FIXTURES/40-read-synthetic.json (no models): Subdiv2D / DelaunayTriangulation /
PiecewiseAffineTransform on random, lattice (cocircular), duplicate, collinear and float point
sets; calculate_span_and_optimal_points + dewarp on synthetic staffs and images; the canvas
helpers; remove_black_contours_at_edges_of_image on drawn images; _slots_in_layout and
_assign_parts on layouts; _measure_rests_like on token sequences; parse_staffs with a stub
transformer (recorded token lists) over regrouped systems of belle-p1 / no11-p1 (hidden staffs,
ambiguous layouts -> break_apart, selected_staff, empty results). Synthetic images are formulas
the test repeats. Expected values come only from running homr; nothing is written by hand.
"""
import argparse
import copy
import hashlib
import itertools
import json
import math
import os
import random
import sys
import tempfile
import time
import xml.etree.ElementTree as ET

import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('fixtures')
ap.add_argument('--models', help='dir with the shipping encoder/decoder (FilePaths names)')
ap.add_argument('--fp32-enc', help='the fp32 encoder .onnx for --modes fp32enc')
ap.add_argument('--modes', default='ship,fp16')
ap.add_argument('--ctx', action='store_true', help='write 41-read-ctx-<mode>-NN.bin')
ap.add_argument('--no-synthetic', action='store_true')
ap.add_argument('--only-synthetic', action='store_true')
A = ap.parse_args()
FIX = A.fixtures
MODES = [m for m in A.modes.split(',') if m]

import homr.transformer.configs as TC  # noqa: E402

MODEL_NAME = 'pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31'
SWAP = {'enc': None, 'dec': None}
_FP = TC.FilePaths.__init__


def _fp_init(self):
    _FP(self)
    if SWAP['enc']:
        self.encoder_path = SWAP['enc']
    if SWAP['dec']:
        self.decoder_path = SWAP['dec']


TC.FilePaths.__init__ = _fp_init

from homr import main as M  # noqa: E402
from homr import staff_dewarping as SDW  # noqa: E402
from homr import staff_parsing as SP  # noqa: E402
from homr import staff_parsing_tromr as SPT  # noqa: E402
from homr.debug import Debug  # noqa: E402
from homr.model import InputPredictions, MultiStaff, Staff, StaffPoint  # noqa: E402
from homr.music_xml_generator import XmlGeneratorArguments, generate_xml  # noqa: E402
from homr.point_mapping import identity  # noqa: E402
from homr.system_repair import repair_systems  # noqa: E402
from homr.transformer import staff2score as S2S  # noqa: E402
from homr.transformer.configs import Config  # noqa: E402
from homr.transformer.vocabulary import EncodedSymbol  # noqa: E402

MASKS = ('staff', 'symbols', 'stems_rest', 'notehead', 'clefs_keys')


# ---- serialisation ----
def F(x):
    """A float with full precision (JSON keeps repr), NaN / inf as strings."""
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


def sha(a):
    return hashlib.sha1(np.ascontiguousarray(a).tobytes()).hexdigest()


def img_info(a):
    return {'shape': list(a.shape), 'dtype': str(a.dtype), 'sha1': sha(a)}


def ser(o, depth=0, seen=None):  # dump_stages.py's serialisation (4 decimals), for the 08 check
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
        return {'__nd': list(o.shape), 'dtype': str(o.dtype), 'sha1': hashlib.sha1(np.ascontiguousarray(o).tobytes()).hexdigest()[:12]}
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


def rect_state(r):
    return [FL(r[0]), FL(r[1]), F(r[2])]


def box_state(b):
    """Everything a box carries, so the JS test can rebuild it without re-normalising."""
    if b is None:
        return None
    d = {'type': type(b).__name__, 'debug_id': int(b.debug_id)}
    c = b.contours
    d['contours'] = None if c is None else [int(v) for v in np.asarray(c).reshape(-1)]
    d['contours_dtype'] = None if c is None else str(np.asarray(c).dtype)
    if type(b).__name__ == 'BoundingBox':
        d['box'] = FL(b.box)
        d['center'] = FL(b.center)
        d['size'] = FL(b.size)
        return d
    d['box'] = rect_state(b.box)
    d['center'] = FL(b.center)
    d['size'] = FL(b.size)
    d['angle'] = F(b.angle)
    d['corners'] = [FL(b.top_left), FL(b.bottom_left), FL(b.top_right), FL(b.bottom_right)]
    p = np.asarray(b.polygon)
    d['polygon'] = [int(v) for v in p.reshape(-1)]
    d['polygon_dtype'] = str(p.dtype)
    return d


def symbol_state(s):
    t = type(s).__name__
    d = {'type': t, 'center': FL(s.center), 'box': box_state(s.box)}
    if t == 'Note':
        d['position'] = int(s.position)
        d['has_dot'] = bool(s.has_dot)
        d['stem'] = box_state(s.stem)
        d['stem_direction'] = None if s.stem_direction is None else s.stem_direction.name
        d['circle_of_fifth'] = int(s.circle_of_fifth)
        d['beams'] = [box_state(b) for b in s.beams]
        d['flags'] = [box_state(b) for b in s.flags]
    elif t == 'Accidental':
        d['position'] = int(s.position)
    elif t == 'Rest':
        d['has_dot'] = bool(s.has_dot)
    return d


def point_state(p):
    return {'x': F(p.x), 'y': FL(p.y), 'angle': F(p.angle), 'average_unit_size': F(p.average_unit_size)}


def staff_state(s, symbols=True):
    d = {'grid': [point_state(p) for p in s.grid], 'is_grandstaff': bool(s.is_grandstaff),
         'min_x': F(s.min_x), 'max_x': F(s.max_x), 'min_y': F(s.min_y), 'max_y': F(s.max_y),
         'average_unit_size': F(s.average_unit_size)}
    if symbols:
        d['symbols'] = [symbol_state(x) for x in s.symbols]
    else:
        d['symbol_centers'] = [FL(x.center) for x in s.symbols]
    return d


def multi_state(m):
    return {'staffs': [staff_state(s) for s in m.staffs], 'connections': [box_state(c) for c in m.connections]}


def wjson(path, obj):
    with open(path, 'w') as f:
        json.dump(obj, f, separators=(',', ':'))


def sym_out(s):
    ic = s.image_coordinates
    return [str(s), None if ic is None else FL(ic)]


def xml_text(voices):
    xml = generate_xml(XmlGeneratorArguments(False, None, None), voices, '')
    fd, p = tempfile.mkstemp(suffix='.musicxml')
    os.close(fd)
    try:
        ET.ElementTree(xml).write(p, encoding='unicode', xml_declaration=True)
        with open(p, encoding='utf-8') as f:
            return f.read()
    finally:
        os.unlink(p)


def mask_png(path):
    m = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    assert m is not None, path
    return (m > 0).astype(np.uint8)


def detect_page(od):
    """main.detect_staffs_in_image from the 05-filtered masks (dump_staff.py's way) + repair_systems."""
    masks = {n: mask_png(os.path.join(od, '05-filtered-%s.png' % n)) for n in MASKS}
    original = cv2.imread(os.path.join(od, '02-resized.png'))
    pre = cv2.imread(os.path.join(od, '03-clahe.png'), cv2.IMREAD_GRAYSCALE)
    assert pre.shape == masks['staff'].shape, (od, pre.shape, masks['staff'].shape)
    preds = InputPredictions(original=original, preprocessed=pre, notehead=masks['notehead'],
                             symbols=masks['symbols'], staff=masks['staff'], clefs_keys=masks['clefs_keys'],
                             stems_rest=masks['stems_rest'])
    debug = Debug(preds.original, os.path.join(od, 'page.png'), False)
    orig = M.load_and_preprocess_predictions
    M.load_and_preprocess_predictions = lambda *a, **k: (preds, debug, identity)
    try:
        cfg = M.ProcessingConfig(False, False, False, False, -1, False, False, False, False)
        ms, image, debug2, _tf, _n, _map = M.detect_staffs_in_image(os.path.join(od, 'page.png'), cfg)
    finally:
        M.load_and_preprocess_predictions = orig
    assert image is pre or np.array_equal(image, pre)
    ms = repair_systems(debug2, ms)
    with open(os.path.join(od, '08-repaired.json')) as f:
        assert roundtrip({'multi_staffs': ms}) == json.load(f), od + ' 08'
    return ms, image, debug2


# ---- recorders around prepare_staff_image ----
class PrepRecorder:
    def __init__(self):
        self.calls = []
        self.cur = None
        self.orig = {}

    def install(self):
        o = self.orig
        for n in ('prepare_staff_image', '_calculate_region', 'get_tr_omr_canvas_size', 'crop_image_and_return_new_top',
                  '_dewarp_staff', 'dewarp_staff_image', 'remove_black_contours_at_edges_of_image',
                  'center_image_on_canvas'):
            o[n] = getattr(SP, n)
        for n in ('calculate_span_and_optimal_points', 'calculate_dewarp_transformation'):
            o['dw.' + n] = getattr(SDW, n)
        rec = self

        def prepare(debug, index, staff, staff_image, regions):
            rec.cur = {'index': int(index), 'crops': [], 'page_image': img_info(staff_image)}
            out = o['prepare_staff_image'](debug, index, staff, staff_image, regions)
            img, tstaff, to_page = out
            rec.cur['canvas'] = img_info(img)
            rec.cur['staff_t'] = staff_state(tstaff, symbols=False)
            pts = [(0.0, 0.0), (100.5, 64.25), (640.0, 128.0), (1279.0, 255.0), (17.25, 200.75),
                   (900.125, 30.5), (333.0, 133.0), (1200.0, 10.0)]
            rec.cur['to_page'] = [[FL(p), FL(to_page(p))] for p in pts]
            rec.calls.append(rec.cur)
            rec.cur['_img'] = img
            return out

        def region(staff, regions):
            r = o['_calculate_region'](staff, regions)
            if rec.cur is not None:
                rec.cur['region'] = [int(v) for v in r]
            return r

        def canvas_size(shape, *a, **k):
            r = o['get_tr_omr_canvas_size'](shape, *a, **k)
            if rec.cur is not None and 'image_dimensions' not in rec.cur:
                rec.cur['image_dimensions'] = [int(v) for v in r]
                rec.cur['canvas_size_arg'] = [int(v) for v in shape]
            return r

        def crop(image, x1, y1, x2, y2):
            img, tl = o['crop_image_and_return_new_top'](image, x1, y1, x2, y2)
            if rec.cur is not None:
                rec.cur['crops'].append({'input': img_info(image), 'args': FL([x1, y1, x2, y2]),
                                         'top_left': [int(v) for v in tl], 'output': img_info(img)})
            return img, tl

        def dewarp_staff(staff, dewarp, region, scaling):
            r = o['_dewarp_staff'](staff, dewarp, region, scaling)
            if rec.cur is not None and dewarp is None and 'dewarp_staff_args' not in rec.cur:
                rec.cur['dewarp_staff_args'] = {'region': FL(region), 'scaling': F(scaling)}
            return r

        def dewarp_staff_image(image, staff, index, debug):
            rec.cur['dewarp_in'] = img_info(image)
            d = o['dewarp_staff_image'](image, staff, index, debug)
            dw = {'ok': d.tform is not None}
            if d.tform is not None:
                t = d.tform
                dw['src'] = [FL(p) for p in t.src_points]
                dw['dst'] = [FL(p) for p in t.dst_points]
                dw['simplices'] = [[int(v) for v in s] for s in t.triangulation.simplices]
                dw['mats'] = [None if m is None else [FL(r) for r in m] for m in t.affine_matrices]
                dw['triangles'] = subdiv_triangles(t.src_points)
            rec.cur['dewarp'] = dw
            out = d.dewarp(image)
            rec.cur['dewarped'] = img_info(out)
            return d

        def span(staff, image):
            r = o['dw.calculate_span_and_optimal_points'](staff, image)
            if rec.cur is not None:
                rec.cur['span'] = [[[int(v) for v in p] for p in line] for line in r[0]]
                rec.cur['optimal'] = [[[int(v) for v in p] for p in line] for line in r[1]]
            return r

        def black(gray, unit):
            before = gray.copy()
            out = o['remove_black_contours_at_edges_of_image'](gray, unit)
            if rec.cur is not None:
                rec.cur['black'] = {'input': img_info(before), 'unit': F(unit), 'output': img_info(out),
                                    'changed': int(np.count_nonzero(before != out))}
            return out

        def center(image, canvas_size, *a, **k):
            out = o['center_image_on_canvas'](image, canvas_size, *a, **k)
            if rec.cur is not None:
                rec.cur['center_in'] = img_info(image)
            return out

        SP.prepare_staff_image = prepare
        SP._calculate_region = region
        SP.get_tr_omr_canvas_size = canvas_size
        SP.crop_image_and_return_new_top = crop
        SP._dewarp_staff = dewarp_staff
        SP.dewarp_staff_image = dewarp_staff_image
        SP.remove_black_contours_at_edges_of_image = black
        SP.center_image_on_canvas = center
        SDW.calculate_span_and_optimal_points = span

    def uninstall(self):
        for n, f in self.orig.items():
            if n.startswith('dw.'):
                setattr(SDW, n[3:], f)
            else:
                setattr(SP, n, f)


def subdiv_triangles(points):
    """cv2.Subdiv2D's raw getTriangleList for the points, as DelaunayTriangulation builds it."""
    points = np.array(points, dtype=np.float32)
    rect = cv2.boundingRect(points.reshape(-1, 1, 2))
    rect = (rect[0] - 10, rect[1] - 10, rect[2] + 20, rect[3] + 20)
    subdiv = cv2.Subdiv2D(rect)
    ids = [int(subdiv.insert((float(p[0]), float(p[1])))) for p in points]
    return {'rect': [int(v) for v in rect], 'ids': ids, 'list': [FL(t) for t in subdiv.getTriangleList()]}


# ---- recorders around the transformer ----
CUR = {'rec': None}  # the page's recorder: the Staff2Score instance (and its wrappers) lives across pages


class TransformerRecorder:
    def __init__(self, ctx_prefix=None):
        self.calls = []
        self.ctx_prefix = ctx_prefix

    def install(self):
        CUR['rec'] = self

    def uninstall(self):
        CUR['rec'] = None


_ORIG_INIT = S2S.Staff2Score.__init__
_ORIG_PREDICT = S2S.Staff2Score.predict


def _s2s_init(self2, config):
    _ORIG_INIT(self2, config)
    enc = self2.encoder
    orig_gen = enc.generate

    def gen(x):
        out = orig_gen(x)
        rec = CUR['rec']
        c = rec.calls[-1]
        c['x'] = {'shape': list(x.shape), 'dtype': str(x.dtype), 'sha1': sha(x.astype(np.float32))}
        c['ctx'] = {'shape': list(out.shape), 'dtype': str(out.dtype), 'sha1': sha(out),
                    'mean': F(np.mean(out, dtype=np.float64)), 'absmax': F(np.max(np.abs(out)))}
        if rec.ctx_prefix:
            out.astype('<f4').tofile(rec.ctx_prefix % (len(rec.calls) - 1))
        return out
    enc.generate = gen
    dec = self2.decoder
    net = dec.net

    class NetProxy:
        def io_binding(self3):
            return net.io_binding()

        def run_with_iobinding(self3, iobinding):
            net.run_with_iobinding(iobinding)
            outs = iobinding.get_outputs()
            step = {'arg': [], 'margin': []}
            # token order of the symbol: rhythm, pitch, lift, articulation, slur, position
            for k in (0, 1, 2, 4, 5, 3):
                v = outs[k].numpy()[0, -1, :].astype(np.float64)
                i1 = int(np.argmax(v))
                rest = np.delete(v, i1)
                step['arg'].append(i1)
                step['margin'].append(F(v[i1] - np.max(rest)))
            step['att'] = FL(outs[6].numpy().reshape(-1))
            CUR['rec'].calls[-1]['steps'].append(step)
    dec.net = NetProxy()
    dec.io_binding = dec.net.io_binding()


def _s2s_predict(self2, image):
    rec = CUR['rec']
    rec.calls.append({'image': img_info(image), 'steps': []})
    t0 = time.time()
    out = _ORIG_PREDICT(self2, image)
    c = rec.calls[-1]
    c['secs'] = round(time.time() - t0, 3)
    c['tokens'] = [str(s) for s in out]
    c['coords'] = [None if s.coordinates is None else FL(np.asarray(s.coordinates).reshape(-1)) for s in out]
    return out


S2S.Staff2Score.__init__ = _s2s_init
S2S.Staff2Score.predict = _s2s_predict


def mode_config(mode):
    cfg = Config()
    if mode == 'fp16':
        SWAP['enc'] = SWAP['dec'] = None
        return Config()
    assert A.models, '--models is needed for mode ' + mode
    SWAP['dec'] = os.path.join(A.models, 'decoder_%s.onnx' % MODEL_NAME)
    if mode == 'ship':
        SWAP['enc'] = os.path.join(A.models, 'encoder_%s.onnx' % MODEL_NAME)
    elif mode == 'fp32enc':
        assert A.fp32_enc, '--fp32-enc is needed for mode fp32enc'
        SWAP['enc'] = A.fp32_enc
    else:
        raise SystemExit('unknown mode ' + mode)
    cfg = Config()
    cfg.use_gpu_inference = False
    return cfg


def run_pages():
    pages = sorted(d for d in os.listdir(FIX) if os.path.isfile(os.path.join(FIX, d, '05-filtered-staff.png')))
    cv2.setRNGSeed(0)  # a fresh process
    detected = {}
    for page in pages:
        od = os.path.join(FIX, page)
        ms, image, debug = detect_page(od)
        detected[page] = (ms, image, debug)
        wjson(os.path.join(od, '40-read-staffs.json'), {
            'multi_staffs': [multi_state(m) for m in ms], 'image': img_info(image)})
        print(page, 'staffs ok', [len(m.staffs) for m in ms], file=sys.stderr)
    prep_written = set()
    for mode in MODES:
        cfg = mode_config(mode)
        SPT.inference = None  # a new Staff2Score with this mode's models
        for page in pages:
            od = os.path.join(FIX, page)
            ms, image, debug = detected[page]
            prep = PrepRecorder()
            tr = TransformerRecorder(os.path.join(od, '41-read-ctx-' + mode + '-%02d.bin') if A.ctx else None)
            prep.install()
            tr.install()
            t0 = time.time()
            try:
                voices = SP.parse_staffs(debug, ms, image, selected_staff=-1, config=cfg)
            finally:
                prep.uninstall()
                tr.uninstall()
            secs = time.time() - t0
            for k, c in enumerate(prep.calls):  # the transformer input == dump_stages' 09-staff-NN.png
                want = cv2.imread(os.path.join(od, '09-staff-%02d.png' % k), cv2.IMREAD_UNCHANGED)
                assert want is not None and np.array_equal(want, c['_img']), (page, k)
                del c['_img']
            if page not in prep_written:
                wjson(os.path.join(od, '40-read-prep.json'), {'calls': prep.calls})
                prep_written.add(page)
            xml = xml_text(voices)
            res = {'mode': mode, 'models': {'encoder': os.path.basename(cfg.filepaths.encoder_path_fp16 if mode == 'fp16' else cfg.filepaths.encoder_path),
                                            'decoder': os.path.basename(cfg.filepaths.decoder_path_fp16 if mode == 'fp16' else cfg.filepaths.decoder_path)},
                   'secs': round(secs, 2), 'calls': tr.calls, 'voices': [[sym_out(s) for s in v] for v in voices], 'xml': xml}
            with open(os.path.join(od, '10-tokens.json')) as f:
                t10 = json.load(f)
            with open(os.path.join(od, '11-score.musicxml'), encoding='utf-8') as f:
                x11 = f.read()
            res['matches_10_tokens'] = [c['tokens'] for c in tr.calls] == t10['calls'] and \
                [[str(s) for s in v] for v in voices] == t10['voices']
            res['matches_11_score'] = xml == x11
            if mode == 'fp16':
                assert res['matches_10_tokens'] and res['matches_11_score'], page + ': fp16 mode does not reproduce 10/11'
            wjson(os.path.join(od, '40-read-%s.json' % mode), res)
            print(page, mode, 'calls', len(tr.calls), 'tokens', sum(len(c['tokens']) for c in tr.calls),
                  '10:', res['matches_10_tokens'], '11:', res['matches_11_score'], '%.1fs' % secs, file=sys.stderr)
    return detected


# ---- synthetic cases (no models) ----
def syn_image(h, w, c=1, seed=0):
    """A deterministic test picture the JS test computes with the same integer formula."""
    y, x = np.mgrid[0:h, 0:w].astype(np.int64)
    chans = []
    for k in range(c):
        chans.append(((x * 37 + y * 91 + ((x * y + seed + 11 * k) % 251)) % 256).astype(np.uint8))
    return chans[0] if c == 1 else np.dstack(chans)


def safe(fn):
    try:
        return {'value': fn()}
    except Exception as e:  # noqa: BLE001
        return {'raises': type(e).__name__, 'message': str(e)}


def delaunay_cases():
    rng = random.Random(4242)
    sets = []
    for n in (3, 4, 5, 8, 13, 21, 34, 60, 90):  # random integer points like the dewarp grids
        sets.append(('rand-int-%d' % n, [[rng.randint(0, 1300), rng.randint(0, 300)] for _ in range(n)]))
    for nx, ny in ((3, 3), (5, 4), (17, 7), (2, 2)):  # lattices: every cell is cocircular
        sets.append(('lattice-%dx%d' % (nx, ny), [[x * 80, y * 50] for y in range(ny) for x in range(nx)]))
    # a dewarp-like grid: edges + lines with first/last points, optimal = straight
    sets.append(('dewarp-like', [[0, 0], [1300, 0]] + [[x, y + (x // 160) % 3] for y in (52, 102, 152)
                                                      for x in [0] + list(range(82, 1300, 80)) + [1300]] + [[0, 300], [1300, 300]]))
    sets.append(('duplicates', [[0, 0], [10, 0], [0, 10], [10, 10], [5, 5], [5, 5], [10, 0], [3, 7]]))
    sets.append(('collinear', [[0, 0], [10, 10], [20, 20], [30, 30]]))
    sets.append(('collinear-plus-one', [[0, 0], [10, 10], [20, 20], [30, 30], [0, 30]]))
    sets.append(('float', [[rng.uniform(0, 500), rng.uniform(0, 200)] for _ in range(25)]))
    sets.append(('negative', [[rng.randint(-200, 200), rng.randint(-100, 100)] for _ in range(15)]))
    sets.append(('too-few', [[0, 0], [5, 5]]))
    out = []
    for name, pts in sets:
        case = {'name': name, 'points': [FL(p) for p in pts]}
        r = safe(lambda: SDW.DelaunayTriangulation(np.array(pts)))
        if 'raises' in r:
            case['raises'] = r['raises']
            case['message'] = r['message']
            out.append(case)
            continue
        tri = r['value']
        case['triangles'] = subdiv_triangles(pts)
        case['simplices'] = [[int(v) for v in s] for s in tri.simplices]
        case['simplices_shape'] = list(tri.simplices.shape)
        # a piecewise affine transform onto displaced points
        dst = [[p[0] + rng.randint(-6, 6), p[1] + rng.randint(-6, 6)] for p in pts]
        t = SDW.PiecewiseAffineTransform()
        t.estimate(np.array(pts), np.array(dst))
        case['dst'] = [FL(p) for p in dst]
        case['mats'] = [None if m is None else [FL(r) for r in m] for m in t.affine_matrices]
        arr = np.array(pts, dtype=np.float64)
        lo, hi = arr.min(axis=0), arr.max(axis=0)
        probes = [[float(lo[0] + (hi[0] - lo[0]) * a), float(lo[1] + (hi[1] - lo[1]) * b)]
                  for a in (0.0, 0.13, 0.5, 0.77, 1.0) for b in (0.0, 0.31, 0.5, 1.0)]
        probes += [[float(p[0]), float(p[1])] for p in pts[:6]]  # vertices
        probes += [[(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2]]
        case['probes'] = [FL(p) for p in probes]
        case['find_simplex'] = [int(v) for v in tri.find_simplex(np.array(probes, dtype=np.float32))]
        case['transform'] = [FL(t.transform_point((p[0], p[1]))) for p in probes]
        case['inverse'] = [FL(t.inverse_transform_point((np.float64(p[0]), np.float64(p[1])))) for p in probes]
        if hi[0] - lo[0] > 0 and hi[1] - lo[1] > 0 and lo[0] >= 0 and lo[1] >= 0:
            h, w = int(hi[1]) + 3, int(hi[0]) + 3
            warps = {}
            for c in (1, 3):
                im = syn_image(h, w, c, seed=len(pts))
                for order in (1, 0):
                    for fill in (1, 255):
                        warps['c%d-o%d-f%d' % (c, order, fill)] = img_info(t.warp_image(im, fill, order))
            case['warp'] = {'h': h, 'w': w, 'seed': len(pts), 'images': warps}
        out.append(case)
    return out


def make_staff(x0, x1, step, y0, unit, wave, angle=0.0, lines=5):
    grid = []
    for x in range(x0, x1 + 1, step):
        dy = wave * math.sin(x / 97.0)
        grid.append(StaffPoint(float(x), [y0 + dy + k * unit for k in range(lines)], angle))
    return Staff(grid)


def dewarp_cases():
    out = []
    specs = [  # (image h, w, staff x0, x1, step, y0, unit, wave)
        (220, 1300, 30, 1250, 10, 80.0, 12.5, 6.0),
        (180, 900, 0, 900, 15, 60.25, 11.0, 0.0),
        (300, 1400, 100, 1100, 20, 120.5, 14.0, 12.0),
        (5, 400, 0, 400, 10, 1.0, 0.5, 0.0),         # int(h / 6) == 0: no span points
        (200, 1000, 3000, 3500, 10, 80.0, 12.0, 0.0),  # staff off the image: get_at None everywhere
        (240, 1200, 0, 1200, 10, 0.0, 12.0, 0.0),      # first y offset 0.0 resets (`not first_y_offset`)
    ]
    for k, (h, w, x0, x1, step, y0, unit, wave) in enumerate(specs):
        staff = make_staff(x0, x1, step, y0, unit, wave)
        img = syn_image(h, w, 1, seed=k)
        span, opt = SDW.calculate_span_and_optimal_points(staff, img)
        d = SDW.dewarp_staff_image(img.copy(), staff, k, Debug(img, 'x.png', False))
        case = {'spec': [h, w, x0, x1, step, F(y0), F(unit), F(wave)], 'seed': k,
                'grid': [point_state(p) for p in staff.grid], 'span': [[list(map(int, p)) for p in l] for l in span],
                'optimal': [[list(map(int, p)) for p in l] for l in opt], 'ok': d.tform is not None}
        if d.tform is not None:
            case['simplices'] = [[int(v) for v in s] for s in d.tform.triangulation.simplices]
            case['dewarped'] = img_info(d.dewarp(img))
            pts = [(0.0, 0.0), (w / 3.0, h / 2.0), (w - 1.5, h - 2.25), (w / 2.0, 3.0)]
            case['undewarp'] = [[FL(p), FL(d.undewarp_point((np.float64(p[0]), np.float64(p[1]))))] for p in pts]
        out.append(case)
    # a staff with a NaN line: int(nan) raises inside dewarp_staff_image -> no transformation
    staff = make_staff(0, 1000, 10, 50.0, 12.0, 0.0)
    staff.grid[8] = StaffPoint(staff.grid[8].x, [50.0, 62.0, float('nan'), 86.0, 98.0], 0.0)
    img = syn_image(200, 1000, 1, seed=9)
    d = SDW.dewarp_staff_image(img.copy(), staff, 99, Debug(img, 'x.png', False))
    out.append({'spec': 'nan', 'grid': [point_state(p) for p in staff.grid], 'h': 200, 'w': 1000, 'seed': 9,
                'ok': d.tform is not None})
    return out


def canvas_cases():
    out = {'size': [], 'offset': [], 'center': [], 'black': []}
    for shape in ((256, 1280), (100, 1280), (300, 1000), (50, 2000), (256, 100), (1, 1), (37, 913), (500, 2560)):
        for mt, mb in ((0, 0), (10, 0), (0, 12), (8, 8)):
            out['size'].append({'shape': list(shape), 'mt': mt, 'mb': mb,
                                'value': [int(v) for v in SP.get_tr_omr_canvas_size(shape, mt, mb)]})
    for rh in (256, 255, 100, 1, 37):
        for mt, mb in ((0, 0), (10, 0), (0, 12), (8, 8)):
            out['offset'].append({'h': rh, 'mt': mt, 'mb': mb, 'value': int(SP._canvas_y_offset(rh, mt, mb))})
    for (h, w, c) in ((120, 700, 1), (90, 1500, 1), (300, 900, 3), (64, 64, 1)):
        img = syn_image(h, w, c, seed=h)
        size = SP.get_tr_omr_canvas_size(img.shape)
        for mt, mb in ((0, 0), (6, 4)):
            size2 = SP.get_tr_omr_canvas_size(img.shape, mt, mb)
            out['center'].append({'h': h, 'w': w, 'c': c, 'mt': mt, 'mb': mb, 'size': [int(v) for v in size2],
                                  'out': img_info(SP.center_image_on_canvas(img, size2, mt, mb))})
        out['center'].append({'h': h, 'w': w, 'c': c, 'add': True, 'size': [int(v) for v in size],
                              'out': img_info(SP.add_image_into_tr_omr_canvas(img))})
    # black contours: drawn pictures (white page, black frames / blobs at the edges)
    pics = []
    a = np.full((120, 600), 230, np.uint8)
    a[:, :14] = 0  # a dark bar on the left edge (mostly dark -> kept)
    a[40:80, 300:310] = 10
    pics.append(('bar-left', a))
    b = np.full((120, 600), 230, np.uint8)
    cv2.rectangle(b, (0, 0), (599, 119), 0, 3)  # a thin frame (its box is mostly light -> blanked)
    cv2.circle(b, (300, 60), 20, 0, -1)
    pics.append(('frame', b))
    c = np.full((150, 700), 200, np.uint8)
    cv2.line(c, (0, 75), (120, 140), 40, 4)  # a stroke from the edge
    cv2.ellipse(c, (690, 20), (40, 25), 0, 0, 360, 30, 5)
    cv2.rectangle(c, (650, 100), (699, 149), 0, -1)
    pics.append(('strokes', c))
    d = syn_image(140, 640, 1, seed=3)
    pics.append(('texture', d))
    for name, pic in pics:
        cv2.imwrite(os.path.join(FIX, '40-read-black-%s.png' % name), pic)
        for unit in (2.0, 6.5, 13.0):
            g = pic.copy()
            r = SP.remove_black_contours_at_edges_of_image(g, unit)
            out['black'].append({'name': name, 'unit': unit, 'input': img_info(pic), 'output': img_info(r),
                                 'changed': int(np.count_nonzero(pic != r))})
    return out, pics


def layout_cases():
    out = {'slots': [], 'assign': []}
    for n in range(1, 6):
        for layout in itertools.product((False, True), repeat=n):
            for m in range(1, n + 1):
                for row in itertools.product((False, True), repeat=m):
                    if (n, m) in ((5, 4), (5, 5), (5, 3)) and (sum(row) + sum(layout)) % 3:
                        continue  # keep the file small
                    s = SP._slots_in_layout(row, layout)
                    out['slots'].append([list(row), list(layout), None if s is None else list(s)])

    class FakeStaff:
        def __init__(self, g):
            self.is_grandstaff = g

    class FakeMulti:
        def __init__(self, layout):
            self.staffs = [FakeStaff(g) for g in layout]
    rng = random.Random(77)
    systems = [(False, True), (True,), (False,), (True, True), (False, False), (False, True, True), (True, False),
               (False, True, False), (True, False, True)]
    for k in range(160):
        rows = [rng.choice(systems) for _ in range(rng.randint(1, 6))]
        if k % 4 == 0:
            rows = [systems[0]] * rng.randint(1, 3) + [systems[1]] * rng.randint(1, 3)
        r = safe(lambda: SP._assign_parts([FakeMulti(x) for x in rows]))
        out['assign'].append({'rows': [list(x) for x in rows], 'result': None if r.get('value') is None else [list(s) for s in r['value']],
                              'raises': r.get('raises')})
    return out


def measure_rest_cases(pages):
    out = []
    rng = random.Random(5)
    seqs = []
    for page in pages:
        with open(os.path.join(FIX, page, '10-tokens.json')) as f:
            seqs.extend(json.load(f)['calls'][:2])
    vocab = ['note_4 C4 _ _ _ upper', 'rest_8 . . . . upper', 'barline . . . . .', 'repeatStart . . . . .',
             'repeatEnd . . . . .', 'chord . . . . .', 'clef_G2 _ _ _ _ upper', 'note_8 E5 # _ _ lower',
             'rest_4 . . . . lower', 'repeatEndStart . . . . .', 'keySignature_2 . . . . .', 'timeSignature/4 . . . . .',
             'bolddoublebarline . . . . .', 'measureRest . . . . upper']
    for _ in range(40):
        seqs.append([rng.choice(vocab) for _ in range(rng.randint(0, 30))])
    for seq in seqs:
        syms = [EncodedSymbol(*s.split(' ')) for s in seq]
        for g in (False, True):
            out.append({'in': seq, 'grand': g, 'out': [str(s) for s in SP._measure_rests_like(syms, g)]})
    return out


class StubInference:
    """Staff2Score stand-in: call k returns the recorded token list stubs[k % len(stubs)], with
    coordinates from the case (None / NaN / [x, y] float32)."""

    def __init__(self, stubs, empty):
        self.stubs = stubs
        self.empty = set(empty)
        self.k = 0
        self.images = []

    def predict(self, image):
        k = self.k
        self.k += 1
        self.images.append(img_info(image))
        if k in self.empty:
            return []
        toks, coords = self.stubs[k % len(self.stubs)]
        out = []
        for t, c in zip(toks, coords):
            if c is None:
                cc = None
            else:
                cc = np.array([float('nan') if v == 'nan' else v for v in c], dtype=np.float32)
            out.append(EncodedSymbol(*t.split(' '), coordinates=cc))
        return out


def parse_cases(detected):
    rng = random.Random(99)
    out = []

    def stub_list(page, n):
        with open(os.path.join(FIX, page, '10-tokens.json')) as f:
            calls = json.load(f)['calls']
        stubs = []
        for toks in calls[:n]:
            coords = []
            for j, t in enumerate(toks):
                r = rng.random()
                if r < 0.05:
                    coords.append(None)
                elif r < 0.08:
                    coords.append(['nan', 10.0])
                else:
                    coords.append([float(np.float32(13.5 + 9.25 * j + rng.random())), float(np.float32(40 + (j % 7) * 23.5))])
            stubs.append([toks, coords])
        return stubs

    belle = [s for m in detected['belle-p1'][0] for s in m.staffs]
    no11 = [s for m in detected['no11-p1'][0] for s in m.staffs]
    cases = [
        # (name, page, systems [[staff index, is_grandstaff]], selected_staff, empty calls, stub page)
        ('hidden-voice', 'belle-p1', [[[0, False], [1, True]], [[2, True]], [[3, False], [4, True]], [[5, True]]], -1, [], 'no11-p1'),
        ('hidden-voice-2', 'belle-p1', [[[0, False], [1, True], [2, False]], [[3, True]], [[4, False], [5, True], [6, False]], [[7, False], [8, True]]], -1, [], 'no11-p1'),
        ('ambiguous', 'belle-p1', [[[0, False], [1, False]], [[2, False]], [[3, False], [4, False]]], -1, [], 'belle-p1'),
        ('two-layouts', 'belle-p1', [[[0, False], [1, True]], [[2, True], [3, False]], [[4, True]]], -1, [], 'no11-p1'),
        ('uniform-3', 'belle-p1', [[[0, False], [1, False], [2, False]], [[3, False], [4, False], [5, False]]], -1, [1, 4], 'belle-p1'),
        ('selected', 'belle-p1', [[[0, False], [1, True]], [[2, True]], [[3, False], [4, True]]], 2, [], 'no11-p1'),
        ('selected-0', 'belle-p1', [[[0, False]], [[1, False]], [[2, False]]], 0, [], 'belle-p1'),
        ('grand', 'no11-p1', [[[0, True]], [[1, True]], [[2, True]]], -1, [0], 'no11-p1'),
        ('grand-hidden', 'no11-p1', [[[0, False], [1, True]], [[2, True]], [[3, False], [4, True]]], -1, [], 'no11-p1'),
        ('all-empty', 'belle-p1', [[[0, False]], [[1, False]]], -1, [0, 1], 'belle-p1'),
    ]
    for name, page, systems, sel, empty, stub_page in cases:
        pool = belle if page == 'belle-p1' else no11
        image = detected[page][1]
        multi = []
        for row in systems:
            staffs = []
            for idx, g in row:
                s = copy.copy(pool[idx])
                s.is_grandstaff = g
                staffs.append(s)
            multi.append(MultiStaff(staffs, []))
        stubs = stub_list(stub_page, 5)
        stub = StubInference(stubs, empty)
        old = SPT.inference
        SPT.inference = stub
        try:
            r = safe(lambda: SP.parse_staffs(Debug(image, 'x.png', False), multi, image, Config(), sel))
        finally:
            SPT.inference = old
        case = {'name': name, 'page': page, 'systems': systems, 'selected': sel, 'empty': empty, 'stubs': stubs,
                'images': stub.images}
        if 'raises' in r:
            case['raises'] = r['raises']
            case['message'] = r['message']
        else:
            case['voices'] = [[sym_out(s) for s in v] for v in r['value']]
        out.append(case)
    # page_to_input_image: a non-identity mapping (main.py passes undo_resize + undo_crop)
    from homr.point_mapping import chain, undo_crop, undo_resize
    m = chain(undo_resize((2339, 1654, 3), (2716, 1920)), undo_crop(17, 5))
    multi = [MultiStaff([copy.copy(belle[0])], []), MultiStaff([copy.copy(belle[1])], [])]
    stub = StubInference(stub_list('belle-p1', 2), [])
    old = SPT.inference
    SPT.inference = stub
    try:
        voices = SP.parse_staffs(Debug(detected['belle-p1'][1], 'x.png', False), multi, detected['belle-p1'][1], Config(), -1, m)
    finally:
        SPT.inference = old
    out.append({'name': 'page-to-input', 'page': 'belle-p1', 'systems': [[[0, False]], [[1, False]]], 'selected': -1, 'empty': [],
                'stubs': stub.stubs, 'images': stub.images, 'mapping': {'before': [2339, 1654, 3], 'after': [2716, 1920], 'crop': [17, 5]},
                'voices': [[sym_out(s) for s in v] for v in voices]})
    return out


def run_synthetic(detected):
    pages = sorted(detected)
    canv, _pics = canvas_cases()
    res = {
        'delaunay': delaunay_cases(),
        'dewarp': dewarp_cases(),
        'canvas': canv,
        'layout': layout_cases(),
        'measure_rests': measure_rest_cases(pages),
        'parse': parse_cases(detected),
    }
    wjson(os.path.join(FIX, '40-read-synthetic.json'), res)
    print('synthetic: delaunay', len(res['delaunay']), 'dewarp', len(res['dewarp']), 'parse', len(res['parse']), file=sys.stderr)


if __name__ == '__main__':
    if A.only_synthetic:
        MODES = []
    detected = run_pages()
    if not A.no_synthetic:
        run_synthetic(detected)
