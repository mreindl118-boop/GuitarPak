"""SheetLab engine preprocessing fixtures: synthetic scans + PyMuPDF-rendered PDF pages.
usage: python -I tools/omr/dump_sheetlab_prep.py --engine path/to/sheetlab_engine.py OUTDIR SAMPLES_DIR
Writes OUTDIR/<case>/: 00-source.png (input as the engine sees it, BGR), split.json (labels),
01-split-<i>.png (each half), 02-prep-<i>.png (preprocess_sheet_image output) and for PDFs
pdf-<name>-p<N>.png (fitz render at 300 dpi, alpha=False) + pdf.json (title metadata, page count)."""
import os, sys, json
import numpy as np, cv2, fitz
args = sys.argv[1:]
if args[:1] == ['--engine']:
    # the owner's SheetLab engine (sheetlab_engine.py, adapted to the current homr API)
    sys.path.insert(0, os.path.dirname(os.path.abspath(args[1])))
    args = args[2:]
out, samples = args[0], args[1]
from sheetlab_engine import preprocess_sheet_image, maybe_split_landscape_spread
os.makedirs(out, exist_ok=True)
page = cv2.imread(os.path.join(samples, 'bwv797-p1.png'))
page2 = cv2.imread(os.path.join(samples, 'carcassi-op60-07-p1.png'))
cases = {}
# 1) clean page as is
cases['clean'] = page
# 2) dark scan frame around the page (Vinyl booklet style)
h, w = page.shape[:2]
fr = np.full((h + 160, w + 120, 3), 30, np.uint8); fr[80:80 + h, 60:60 + w] = page
cases['dark-frame'] = fr
# 3) low resolution scan (needs upscale + unsharp)
cases['low-res'] = cv2.resize(page, (w * 900 // h, 900), interpolation=cv2.INTER_AREA)
# 4) two-page landscape spread
sp = np.concatenate([page, page2[:h, :w] if page2.shape[0] >= h else cv2.resize(page2, (w, h))], axis=1)
cases['spread'] = sp
# 5) photo-like: slight rotation, uneven light, on a wood-coloured desk
M = cv2.getRotationMatrix2D((w / 2, h / 2), 2.5, 0.85)
desk = np.full((h, w, 3), (60, 100, 140), np.uint8)
rot = cv2.warpAffine(page, M, (w, h), borderMode=cv2.BORDER_CONSTANT, borderValue=(60, 100, 140))
mask = cv2.warpAffine(np.full((h, w), 255, np.uint8), M, (w, h))
photo = np.where(mask[..., None] > 0, rot, desk).astype(np.float32)
grad = np.linspace(0.75, 1.0, w, dtype=np.float32)[None, :, None]
cases['photo'] = np.clip(photo * grad, 0, 255).astype(np.uint8)
for name, img in cases.items():
    d = os.path.join(out, name); os.makedirs(d, exist_ok=True)
    cv2.imwrite(os.path.join(d, '00-source.png'), img)
    splits = maybe_split_landscape_spread(img, True)
    json.dump({'labels': [s[0] for s in splits]}, open(os.path.join(d, 'split.json'), 'w'))
    for i, (lbl, sub) in enumerate(splits):
        cv2.imwrite(os.path.join(d, '01-split-%d.png' % i), sub)
        cv2.imwrite(os.path.join(d, '02-prep-%d.png' % i), preprocess_sheet_image(sub, True))
    print(name, img.shape, len(splits))
# PDF renders exactly as the engine does them
pd = os.path.join(out, 'pdf'); os.makedirs(pd, exist_ok=True)
meta = {}
for f in sorted(os.listdir(samples)):
    if not f.endswith('-let.pdf'):
        continue
    doc = fitz.open(os.path.join(samples, f))
    meta[f] = {'title': (doc.metadata or {}).get('title', ''), 'pages': len(doc)}
    for pno in range(len(doc)):
        pix = doc[pno].get_pixmap(dpi=300, alpha=False)
        rgb = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
        cv2.imwrite(os.path.join(pd, '%s-p%d.png' % (f[:-8], pno + 1)), cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    doc.close()
json.dump(meta, open(os.path.join(pd, 'pdf.json'), 'w'), indent=1)
print(meta)
