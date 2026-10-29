"""Stage-by-stage reference dump of the homr pipeline for parity tests of the JS port
(the base fixtures every tests/omr-*.test.js suite starts from; see tools/omr/README.md).

usage: python -I tools/omr/dump_stages.py [--seg P] [--enc P] [--dec P] OUTDIR page.png [page2.png ...]
Run all pages in ONE process, in sorted order: cv::theRNG carries from page to page.
For each page writes OUTDIR/<stem>/:
  00-input.png            the page exactly as homr reads it
  01-crop.json            autocrop offset + cropped shape
  02-resized.png          after resize_image (RGB as BGR file)
  03-clahe.png            CLAHE gray = segnet input
  04-mask-<name>.png      raw segnet masks (0/255): staff symbols stems_rest notehead clefs_keys
  05-filtered-<name>.png  after filter_predictions (+ make_lines_stronger on staff)
  06-symbols.json         predict_symbols boxes
  07-staff.json           fragments after break_wide_fragments, noteheads_with_stems, bar_line boxes,
                          average_note_head_height, staffs, brace_dot boxes, notes, multi_staffs
  08-repaired.json        multi_staffs after repair_systems
  09-staff-<k>.png        each transformer input image (after prepare_staff_image)
  10-tokens.json          per transformer call: tokens; plus final voices
  11-score.musicxml       generate_xml output
"""
import json, os, sys, hashlib
from enum import Enum
import numpy as np
import cv2
import xml.etree.ElementTree as ET

import argparse
_ap = argparse.ArgumentParser()
_ap.add_argument('--seg'); _ap.add_argument('--enc'); _ap.add_argument('--dec')
_ap.add_argument('out'); _ap.add_argument('pages', nargs='+')
_a = _ap.parse_args()
out_root = _a.out
pages = _a.pages
import homr.segmentation.inference_segnet as _seg
if _a.seg: _seg.segnet_path_onnx = _a.seg
import homr.transformer.configs as _tc
_FP = _tc.FilePaths.__init__
def _fp_init(self):
    _FP(self)
    if _a.enc: self.encoder_path = _a.enc
    if _a.dec: self.decoder_path = _a.dec
_tc.FilePaths.__init__ = _fp_init

from homr import color_adjust
from homr.autocrop import autocrop_with_offset
from homr.resize import resize_image
from homr import main as M
from homr.noise_filtering import filter_predictions
from homr.staff_detection import make_lines_stronger, break_wide_fragments, detect_staff, estimate_unit_size_from_clefs
from homr.note_detection import combine_noteheads_with_stems, add_notes_to_staffs
from homr.bar_line_detection import detect_bar_lines
from homr.brace_dot_detection import find_braces_brackets_and_grand_staff_lines, prepare_brace_dot_image
from homr.bounding_boxes import create_rotated_bounding_boxes
from homr.system_repair import repair_systems
from homr.staff_parsing import parse_staffs
from homr.music_xml_generator import XmlGeneratorArguments, generate_xml
from homr.transformer.configs import Config
from homr.transformer import staff2score
from homr.debug import Debug


def ser(o, depth=0, seen=None):
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


def wjson(path, obj):
    with open(path, 'w') as f:
        json.dump(ser(obj), f, indent=1)


def wmask(path, m):
    cv2.imwrite(path, (m > 0).astype(np.uint8) * 255)


for page in pages:
    stem = os.path.splitext(os.path.basename(page))[0]
    od = os.path.join(out_root, stem)
    os.makedirs(od, exist_ok=True)
    image = cv2.imread(page)
    cv2.imwrite(os.path.join(od, '00-input.png'), image)
    cropped, top_left = autocrop_with_offset(image)
    wjson(os.path.join(od, '01-crop.json'), {'top_left': top_left, 'shape': cropped.shape})
    resized = resize_image(cropped)
    cv2.imwrite(os.path.join(od, '02-resized.png'), resized)
    pre = color_adjust.apply_clahe(resized)
    cv2.imwrite(os.path.join(od, '03-clahe.png'), pre)
    preds = M.get_predictions(resized, pre, page, False, False)
    for n in ('staff', 'symbols', 'stems_rest', 'notehead', 'clefs_keys'):
        wmask(os.path.join(od, '04-mask-%s.png' % n), getattr(preds, n))
    debug = Debug(preds.original, page, False)
    preds = filter_predictions(preds, debug)
    preds.staff = make_lines_stronger(preds.staff, (1, 2))
    for n in ('staff', 'symbols', 'stems_rest', 'notehead', 'clefs_keys'):
        wmask(os.path.join(od, '05-filtered-%s.png' % n), getattr(preds, n))
    sym = M.predict_symbols(debug, preds)
    wjson(os.path.join(od, '06-symbols.json'), {'noteheads': sym.noteheads, 'staff_fragments': sym.staff_fragments,
          'clefs_keys': sym.clefs_keys, 'stems_rest': sym.stems_rest, 'bar_lines': sym.bar_lines})
    st = {}
    sym.staff_fragments = break_wide_fragments(sym.staff_fragments)
    st['staff_fragments'] = sym.staff_fragments
    nws = combine_noteheads_with_stems(sym.noteheads, sym.stems_rest)
    st['noteheads_with_stems'] = nws
    if len(nws) > 0:
        avg = float(np.median([n.notehead.size[1] for n in nws]))
    else:
        avg = estimate_unit_size_from_clefs(sym.staff_fragments, sym.clefs_keys)
    st['average_note_head_height'] = avg
    all_nh = [n.notehead for n in nws]
    all_stems = [n.stem for n in nws if n.stem is not None]
    blr = [l for l in sym.bar_lines if not l.is_overlapping_with_any(all_nh) and not l.is_overlapping_with_any(all_stems)]
    st['bar_lines_or_rests'] = blr
    blb = detect_bar_lines(blr, avg)
    st['bar_line_boxes'] = blb
    staffs = detect_staff(debug, preds.staff, sym.staff_fragments, sym.clefs_keys, blb)
    st['staffs'] = staffs
    bd_img = prepare_brace_dot_image(preds.symbols, preds.staff)
    wmask(os.path.join(od, '07-brace-dot.png'), bd_img)
    bd = create_rotated_bounding_boxes(bd_img, skip_merging=True, max_size=(100, -1))
    st['brace_dot'] = bd
    notes = add_notes_to_staffs(staffs, nws, preds.symbols, preds.notehead)
    st['notes'] = notes
    ms = find_braces_brackets_and_grand_staff_lines(debug, staffs, bd)
    st['multi_staffs'] = ms
    wjson(os.path.join(od, '07-staff.json'), st)
    ms = repair_systems(debug, ms)
    wjson(os.path.join(od, '08-repaired.json'), {'multi_staffs': ms})
    calls = []
    orig_predict = staff2score.Staff2Score.predict

    def predict(self, img, _calls=calls, _od=od):
        k = len(_calls)
        cv2.imwrite(os.path.join(_od, '09-staff-%02d.png' % k), img)
        out = orig_predict(self, img)
        _calls.append([str(s) for s in out])
        return out
    staff2score.Staff2Score.predict = predict
    try:
        # NOTE: homr's Config() defaults to use_gpu_inference=True, which on a CPU falls back to the fp16
        # encoder/decoder: 10-tokens.json / 11-score.musicxml are fp16 references (the suites know this;
        # shipping-model references come from dump_lang.py --ship and dump_read.py)
        voices = parse_staffs(debug, ms, preds.preprocessed, selected_staff=-1, config=Config())
    finally:
        staff2score.Staff2Score.predict = orig_predict
    with open(os.path.join(od, '10-tokens.json'), 'w') as f:
        json.dump({'calls': calls, 'voices': [[str(s) for s in v] for v in voices]}, f, indent=1)
    xml = generate_xml(XmlGeneratorArguments(False, None, None), voices, '')
    ET.ElementTree(xml).write(os.path.join(od, '11-score.musicxml'), encoding='unicode', xml_declaration=True)
    print(stem, 'staffs', len(staffs), 'calls', len(calls), file=sys.stderr)
