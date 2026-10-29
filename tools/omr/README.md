# tools/omr: the Python reference for the SheetLab port

`js/omr/` is a JavaScript port of [homr](https://github.com/liebharc/homr) (AGPL-3.0) and of the owner's
SheetLab engine around it. The `tests/omr-*.test.js` suites compare each JS stage with homr itself. These
scripts produce the reference data the suites read.

## Setup (once)

1. Clone homr at the commit the port follows: `2d7e8c3b500ab9af10e579bebab8c0d9e551eb71`.
2. Make a Python 3.11+ venv and install the reference stack:

   ```
   pip install numpy==2.4.6 opencv-python-headless==5.0.0.93 onnxruntime==1.31.1 pillow==13.0.0 \
       pypdfium2 rapidocr music21==10.5.2 mido==1.3.3 pymupdf onnx
   pip install --no-deps -e <homr clone>
   ```

   Then put homr's ONNX models next to its code: `segnet_*.onnx` in `homr/segmentation/`, `encoder_*` and
   `decoder_*` in `homr/transformer/`. The download links are in homr's `main.py` `download_weights()`.
3. Make the shipping models (int8 segmentation and encoder; the decoder is homr's own int8 file):

   ```python
   from onnxruntime.quantization import quantize_dynamic, QuantType
   quantize_dynamic('segnet_308-….onnx', 'q/segnet_308-….onnx', op_types_to_quantize=['Conv'], weight_type=QuantType.QUInt8)
   quantize_dynamic('encoder_pytorch_model_509-….onnx', 'q/encoder_….onnx', op_types_to_quantize=['MatMul', 'Conv'], weight_type=QuantType.QUInt8)
   ```

   Put the three files in one directory, `$MODELS`. `split_models.py $MODELS` writes `models/omr/` (parts of
   at most 14 MB + `manifest.json` with SHA-256 sums).
4. Install the JS side for Node: `npm i onnxruntime-web@1.31.1 @techstark/opencv-js@5.0.0-release.1
   pdfjs-dist@4.10.38` in a scratch folder, plus playwright for the browser suites.

Always run the Python tools with `python -I`.

## Fixtures

The test pages are public-domain Mutopia Project scores. Render each PDF page at 300 dpi to a PNG, for
example `02-entree-p1.png` or `belle-p1.png`.

1. `dump_stages.py --seg <int8 segnet> --enc <int8 encoder> $FIX <pages…>` makes the base fixtures. They
   are `00-input` … `11-score.musicxml` per page.
   - Run all pages in **one** process, in sorted order: OpenCV's `cv::theRNG`, which `fitEllipse` draws
     from, carries over from page to page.
   - homr's `Config()` runs the fp16 transformer on a CPU, so `10-tokens.json` and `11-score.musicxml` are
     fp16 references. `dump_lang.py --ship` and `dump_read.py` record the shipping-model references.
2. The per-area tools add their numbered files to `$FIX/<page>/`. Each one's header says which suite reads
   what:

   | Tool | Area |
   |---|---|
   | `dump_cv.py`, `dump_cv_pil.py`, `dump_model.py`, `dump_audit*.py` | foundation |
   | `dump_lang.py` | vocabulary, MusicXML |
   | `midi_ref.py` | MIDI, MXL |
   | `dump_segment*.py` | segmentation |
   | `dump_staff*.py` | staff detection |
   | `dump_read*.py` | reading |
   | `dump_e2e.py`, `dump_sheetlab_prep.py` | the SheetLab engine |

3. `dump_e2e.py` and `dump_sheetlab_prep.py` run the owner's SheetLab engine (`sheetlab_engine.py`, adapted
   to the current homr API). Give its path with `--engine`.

## Running the suites

```
SL_OMR_FIXTURES=$FIX SL_OMR_MODELS=$MODELS SL_OMR_PYTHON=<venv>/bin/python \
NODE_PATH=<scratch>/node_modules:<playwright> node tests/omr-e2e.test.js
```

- **Without `SL_OMR_FIXTURES`:** the page checks print SKIP lines and pass. The small repo fixtures in
  `tests/fixtures/omr/` still run.
- **Without `SL_OMR_MODELS`:** `omr-e2e` (its ci page) and `sheetlab` load `models/omr/` through the
  manifest, and `OMR.runtime` verifies every part's and model's SHA-256 as it loads them; `omr-runtime`'s
  manifest and session checks, `omr-segment`'s segnet parity and `omr-read`'s model sections skip.
- **Without opencv.js / onnxruntime-web / pdfjs-dist on `NODE_PATH`:** the suites that need them print a
  SKIP line and exit 0 (`tests/run.sh` reports them as "skipped").
- **CI:** `tests/run.sh` runs every suite in this mode; it prints each suite's real checks and skips
  ("pass (N checks, M skipped)").

The full fixture run of `omr-read` and `omr-e2e` takes about 35 minutes on 4 cores (`omr-e2e` about
27–29 minutes, `omr-read` about 8; `omr-midi` under a minute).
