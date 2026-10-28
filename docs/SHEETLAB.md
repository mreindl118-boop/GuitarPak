# SheetLab: sheet music to MIDI (Play › Scan)

Turn a PDF, a scan or a photo of printed sheet music into MIDI and MusicXML, on the device. Then play it on
your synth, practise it in the Woodshed, open it as tab, download it or keep it in your library.

Nothing is uploaded. The recognition runs inside soundLAB in a background worker, on an iPad, an Android
phone or a computer alike.

## Use it

1. **Play › Scan** (or **Songs › Open a score** with a PDF or an image).
2. Choose a file, drop one on the page, or take a photo.
   - PDF: every page is read. Cover pages and pages without music are skipped and the summary says why.
   - Images: PNG, JPG, WEBP, BMP (and TIFF where the browser can open it).
   - A landscape scan of two facing pages is split into a left and a right page.
3. Set the options if you want: tempo, instrument (General MIDI), transpose, PDF quality.
4. The first time, soundLAB asks before it downloads the recognition engine (the models and the runtime).
   After that it works offline.
5. When it's done you see each page with the staffs it found outlined, a summary, and the buttons:
   **Play on synth**, **Practice**, **Open as tab**, **Download** (.mid, .musicxml, .mxl) and
   **Save to my library**.

Recognition is good on clean, printed scores and decent on photos taken straight on. It is not meant
for handwriting. Check the result before you rely on it.

## How it works

SheetLab is the owner's app built on [homr](https://github.com/liebharc/homr), an open-source optical
music recognition engine. soundLAB carries a JavaScript port of homr's recognition path and of
SheetLab's own steps around it:

| Step | What happens | Where |
|---|---|---|
| Page in | PDF pages are rendered with pdf.js; images are decoded by the browser. Transparent images are put on white. | `js/sheetlab.js` |
| SheetLab prep | Dark scan frames are stripped, low-resolution scans are upscaled and sharpened, two-page spreads are split. | `js/omr/engine.js` |
| homr prep | Crop to the paper, resize to 1920 px wide (Pillow's bicubic, byte-exact), contrast (CLAHE). | `js/omr/autocrop.js`, `resize.js`, `color_adjust.js` |
| Segmentation | A neural network marks staff lines, note heads, stems and rests, clefs and keys, other symbols. | `js/omr/inference_segnet.js` |
| Structure | Staffs, bar lines, notes, braces, grand staffs and systems are found and repaired. | `js/omr/staff_detection.js` and friends |
| Reading | Each staff is straightened and read by a transformer (TrOMR) into music tokens. | `js/omr/staff_parsing.js`, `transformer_*.js` |
| Output | Voices from every page are merged; MusicXML 4.0, then MIDI with your tempo, instrument and transpose. | `js/omr/music_xml_generator.js`, `midi.js`, `mxl.js` |

The port is checked against the Python originals stage by stage (`tests/omr-*.test.js`, reference
tools in `tools/omr/`).

### Runtime and models

- The neural networks run with [ONNX Runtime Web](https://onnxruntime.ai/) (WebGPU where the browser
  has it, WebAssembly otherwise); image processing uses [OpenCV.js](https://docs.opencv.org/) 5.0.0, the
  same version homr uses in Python. Both load from jsDelivr when you first convert something and are kept
  for offline use.
- The three models (segmentation, encoder, decoder) are in `models/omr/`, split into parts of at most 14 MB
  with a `manifest.json` of SHA-256 sums. The segmentation and encoder models are int8-quantized versions of
  homr's float models: on the 7 reference pages their output differs from the float models in 6 of 2,897
  symbols (0.21 %).
- The downloaded engine lives in the browser's Cache Storage (`soundlab-omr-v1`); app updates don't
  remove it.

## Licences and credits

soundLAB is licensed under the GNU AGPL-3.0 (see `LICENSE`), because it includes homr's code and models.

| Part | Licence |
|---|---|
| homr (code and model weights), github.com/liebharc/homr | AGPL-3.0. Training data licences: see homr's LICENSE_FAQ.md |
| ONNX Runtime Web | MIT |
| OpenCV.js | Apache-2.0 |
| pdf.js | Apache-2.0 |
| Test pages: Mutopia Project scores (Brahms, Bach, Handel, Arbeau, Carcassi, Mozart, Sousa) | Public domain |
