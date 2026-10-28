"""Reference dump for tests/omr-segment.test.js: the shipping segnet on page SHAPES the seven
Mutopia fixtures never produce. Those pages are all US Letter (1920 x ~2485 after resize_image =
8 tile rows x 6 = 48 tiles = exactly six batches of 8), so with the real model they never run:
  - a partial last batch (the int8 net quantizes per batch tensor, so the 6-tile batch of an A4
    page is its own quantization case),
  - tiles that reach past the image (a page lower than one window: white padding),
  - few rows where the last tile row overlaps the previous one by most of a window.
Cases (all from FIXTURES/<page>/03-clahe.png, the segnet's real input):
  a4     cv2.resize to 1920 x 2715 (A4's ratio) -> 9 rows, 54 tiles, batches 8 x 6 + 6
  short  the top 700 rows -> 3 rows, 18 tiles, batches 8, 8, 2 (last row at y 380)
  strip  rows 400..700 (300 high) -> 1 row, 6 tiles at y -20, one batch of 6
Run exactly like homr's main.get_predictions: inference(img, use_gpu=False, batch 8, step 320,
win 320). Writes FIXTURES top-level FILES (a directory would be taken for a page):
  33-segnet-shapes.json, 33-segnet-<case>-input.png, 33-segnet-<case>-<mask>.png (0/255).

usage: python -I tools/omr/dump_segment_shapes.py FIXTURES SEGNET.onnx [page]
"""
import hashlib
import json
import os
import sys
import time

import cv2
import numpy as np

FIX, SEG = sys.argv[1], sys.argv[2]
PAGE = sys.argv[3] if len(sys.argv) > 3 else 'belle-p1'

import homr.segmentation.inference_segnet as S  # noqa: E402

S.segnet_path_onnx = SEG
S._segnet_inference = None


def sha1(a):
    return hashlib.sha1(np.ascontiguousarray(a).tobytes()).hexdigest()


class Counting:
    """the real Segnet, counting the batch size of every run"""

    def __init__(self, inner):
        self.inner, self.calls = inner, []

    def run(self, x):
        self.calls.append(int(x.shape[0]))
        return self.inner.run(x)


clahe = cv2.imread(os.path.join(FIX, PAGE, '03-clahe.png'), cv2.IMREAD_GRAYSCALE)
CASES = [
    ('a4', cv2.resize(clahe, (1920, 2715), interpolation=cv2.INTER_AREA)),
    ('short', np.ascontiguousarray(clahe[:700])),
    ('strip', np.ascontiguousarray(clahe[400:700])),
]
NAMES = ['staff', 'symbols', 'stems_rests', 'notehead', 'clefs_keys']
real = S.Segnet(False)
out = []
for name, img in CASES:
    stem = os.path.join(FIX, '33-segnet-%s' % name)
    cv2.imwrite(stem + '-input.png', img)
    S._segnet_inference = Counting(real)
    t = time.perf_counter()
    masks = S.inference(img, False, 8, 320, 320)
    secs = time.perf_counter() - t
    rec = {'name': name, 'shape': list(img.shape), 'calls': S._segnet_inference.calls, 'secs': round(secs, 2),
           'masks': {}}
    for n, m in zip(NAMES, masks):
        cv2.imwrite('%s-%s.png' % (stem, n), (m > 0).astype(np.uint8) * 255)
        rec['masks'][n] = {'sha1': sha1(m), 'dtype': str(m.dtype), 'count': int(m.sum())}
    out.append(rec)
    print(name, img.shape, rec['calls'], '%.1f s' % secs, file=sys.stderr)
S._segnet_inference = None
with open(os.path.join(FIX, '33-segnet-shapes.json'), 'w') as f:
    json.dump({'page': PAGE, 'model': os.path.basename(SEG), 'batch_size': 8, 'step_size': 320, 'win_size': 320,
               'cases': out}, f, indent=1)
