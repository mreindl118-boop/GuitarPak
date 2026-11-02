"""Pillow reference dump for the JS port's Image.resize (js/omr/pil.js, tests/omr-pil.test.js).

usage: python -I tools/omr/dump_cv_pil.py FIXTURES [page ...]

For every page dir writes 21-pil.json: cases {crop: [y0, y1, x0, x1], gray, size: [w, h],
resample, box, shape, sha1} where the input is FIXTURES/<page>/00-input.png (as cv2.imread
reads it, BGR) cropped (and converted to gray when `gray`), then
np.array(Image.fromarray(crop).resize(size, resample, box)). Seeded per page: downscales,
upscales, one axis only, a vertical-first case (height shrinks > 2x the width's shrink),
tiny outputs and boxes.
"""
import hashlib
import json
import os
import sys
import zlib

import cv2
import numpy as np
import PIL
from PIL import Image

FIX = sys.argv[1]
PAGES = sys.argv[2:] or sorted(d for d in os.listdir(FIX) if os.path.isdir(os.path.join(FIX, d)))


def one(img, crop, gray, size, resample, box=None):
    y0, y1, x0, x1 = crop
    a = img[y0:y1, x0:x1]
    if gray:
        a = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY)
    a = np.ascontiguousarray(a)
    out = np.array(Image.fromarray(a).resize(tuple(size), resample, box))
    return {'crop': crop, 'gray': gray, 'size': list(size), 'resample': int(resample), 'box': box,
            'shape': list(out.shape), 'sha1': hashlib.sha1(np.ascontiguousarray(out).tobytes()).hexdigest()}


for page in PAGES:
    img = cv2.imread(os.path.join(FIX, page, '00-input.png'))
    H, W = img.shape[:2]
    rng = np.random.default_rng(zlib.crc32(page.encode()))
    cases = []
    B = Image.Resampling
    for t in range(40):
        h, w = int(rng.integers(1, 400)), int(rng.integers(1, 400))
        y0, x0 = int(rng.integers(0, H - h)), int(rng.integers(0, W - w))
        crop = [y0, y0 + h, x0, x0 + w]
        kind = t % 8
        if kind == 0:
            size = (max(1, w // 3), max(1, h // 3))          # downscale
        elif kind == 1:
            size = (w * 2 + 1, h * 3 // 2 + 1)               # upscale
        elif kind == 2:
            size = (w, max(1, h // 5))                       # height only: vertical first
        elif kind == 3:
            size = (max(1, w // 2), h)                       # width only
        elif kind == 4:
            size = (int(rng.integers(1, 300)), int(rng.integers(1, 300)))
        elif kind == 5:
            size = (1, 1)
        elif kind == 6:
            size = (max(1, w - 1), max(1, h // 7))           # both, vertical-first condition
        else:
            size = (w * 7 // 10 + 1, h * 13 // 10 + 1)
        resample = [B.BICUBIC, B.BICUBIC, B.BICUBIC, B.BILINEAR, B.LANCZOS, B.BOX, B.HAMMING, B.BICUBIC][t % 8]
        cases.append(one(img, crop, bool(t % 3 == 0), size, resample))
    # boxes (sub-region resampling)
    for t in range(6):
        h, w = int(rng.integers(20, 300)), int(rng.integers(20, 300))
        y0, x0 = int(rng.integers(0, H - h)), int(rng.integers(0, W - w))
        bx0, by0 = float(rng.uniform(0, w / 3)), float(rng.uniform(0, h / 3))
        box = (round(bx0, 2), round(by0, 2), round(float(rng.uniform(w / 2, w)), 2), round(float(rng.uniform(h / 2, h)), 2))
        cases.append(one(img, [y0, y0 + h, x0, x0 + w], bool(t % 2), (int(rng.integers(5, 200)), int(rng.integers(5, 200))), B.BICUBIC, box))
    # homr's own page resize at other sizes: width 1920 from a wider and a narrower scan
    for scale in (1.37, 0.61):
        w = min(W, int(1920 * scale)) if scale > 1 else int(1920 * scale)
        h = min(H, int(w * 1.3))
        cases.append(one(img, [0, h, 0, w], False, (1920, round(h * 1920 / w)), B.BICUBIC))
    with open(os.path.join(FIX, page, '21-pil.json'), 'w') as f:
        json.dump({'page': page, 'pillow': PIL.__version__, 'cases': cases}, f, indent=0)
    print(page, len(cases), 'cases', file=sys.stderr)
