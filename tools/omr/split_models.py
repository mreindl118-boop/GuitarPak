"""Split the shipping OMR models into <= 14,000,000-byte parts for soundLAB (js/omr/runtime.js).

usage: python -I tools/omr/split_models.py [SRC_DIR] [OUT_DIR]

SRC_DIR (default $SL_OMR_MODELS) holds the three shipping models under their homr file names:
  segnet_308-<sha>.onnx                        segmentation net (int8, dynamic quantization)
  encoder_pytorch_model_509-<sha>.onnx         TrOMR encoder (int8)
  decoder_pytorch_model_509-<sha>.onnx         TrOMR decoder (int8 as homr ships it)
OUT_DIR (default models/omr next to this repo's root) receives
  <name>.onnx.part00, part01, ...              raw byte slices, each at most PART_MAX bytes
  manifest.json                                {version, partMax, models: {segnet|encoder|decoder:
                                                 {source, bytes, sha256, parts: [{file, bytes, sha256}]}}}

Why parts: a claude.ai artifact file may be at most 14 MB and GitHub warns above 50 MB; runtime.js
fetches the parts, checks each part's and the whole model's sha256 and joins them. The version is
derived from the three model hashes, so a new model set gets a new version (and cache key).
The parts are generated files: they are not committed by this tool.
"""
import hashlib
import json
import os
import sys

PART_MAX = 14_000_000
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS = [  # key, file-name prefix (homr's names), what it is
    ('segnet', 'segnet_', 'segmentation net, int8'),
    ('encoder', 'encoder_', 'TrOMR encoder, int8'),
    ('decoder', 'decoder_', 'TrOMR decoder, int8'),
]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('SL_OMR_MODELS', '')
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'models', 'omr')
    if not src or not os.path.isdir(src):
        sys.exit('split_models: give the shipping model dir (arg 1 or SL_OMR_MODELS)')
    os.makedirs(out, exist_ok=True)
    names = sorted(os.listdir(src))
    manifest = {'version': '', 'partMax': PART_MAX, 'models': {}}
    for key, prefix, what in MODELS:
        cands = [n for n in names if n.startswith(prefix) and n.endswith('.onnx') and '_fp16' not in n]
        if len(cands) != 1:
            sys.exit('split_models: expected one %s*.onnx in %s, found %r' % (prefix, src, cands))
        source = cands[0]
        with open(os.path.join(src, source), 'rb') as f:
            data = f.read()
        # stale parts of an earlier, bigger model would be served next to the new ones
        for n in os.listdir(out):
            if n.startswith(key + '.onnx.part'):
                os.remove(os.path.join(out, n))
        parts = []
        for i, start in enumerate(range(0, len(data), PART_MAX)):
            chunk = data[start:start + PART_MAX]
            fname = '%s.onnx.part%02d' % (key, i)
            with open(os.path.join(out, fname), 'wb') as f:
                f.write(chunk)
            parts.append({'file': fname, 'bytes': len(chunk), 'sha256': sha256(chunk)})
        manifest['models'][key] = {'source': source, 'note': what, 'bytes': len(data),
                                   'sha256': sha256(data), 'parts': parts}
        print('%-8s %-70s %10d bytes, %d parts' % (key, source, len(data), len(parts)))
    joined = ''.join(manifest['models'][k]['sha256'] for k, _, _ in MODELS)
    manifest['version'] = 'omr-' + sha256(joined.encode())[:12]
    manifest['bytes'] = sum(m['bytes'] for m in manifest['models'].values())
    with open(os.path.join(out, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
        f.write('\n')
    print('manifest', manifest['version'], manifest['bytes'], 'bytes ->', os.path.join(out, 'manifest.json'))


if __name__ == '__main__':
    main()
