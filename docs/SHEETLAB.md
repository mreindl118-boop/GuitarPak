# SheetLab: sheet music to MIDI (Play › Scan)

Turn a PDF, a scan or a photo of printed sheet music into MIDI and MusicXML, on the device. Then play it on
your synth, practise it in the Woodshed, open it as tab, download it or keep it in your library.

Nothing is uploaded. The recognition runs inside soundLAB in a background worker, on an iPad, an Android
phone or a computer alike.

## Use it

1. **Play › Scan**, or **Songs › Open a score** with a PDF or a picture.
2. Choose a file, drop one on the page, or take a photo.
   - PDF: every page is read. Cover pages and pages without music are skipped, and the summary says why.
   - Pictures: PNG, JPG, WEBP, BMP, and TIFF where the browser can open it. Several pictures make
     several pages.
   - A landscape scan of two facing pages is split into a left and a right page.
3. Set the options if you want to.
   - **Tempo**: follows the app tempo until you change it.
   - **Instrument**: SheetLab's General MIDI list.
   - **Transpose**: −12 to +12.
   - **Split 2-page spreads** and **Enhance low-res scans**: both on.
   - **PDF quality**: 300 dpi, or 200 for speed.
4. The first time, soundLAB asks before it downloads the recognition engine: about 107 MB (77 MB of
   models, 28 MB of runtime, 2 MB of PDF reader). After that it works offline.
5. While it reads, the page shows each step in plain words. **Stop** ends it at once. The rest of the
   app keeps working.
6. The result shows:
   - each page with the systems it found outlined, and a per-page summary;
   - the measures, notes, chords and length;
   - the buttons **Play on synth**, **Practice**, **Open as tab** and **Download** (.mid, .musicxml,
     .mxl), plus **Save to my library** (on by default as "Also save to my library", see
     [LIBRARY.md](LIBRARY.md)).

Recognition is good on clean, printed scores and decent on photos taken straight on. It is not meant
for handwriting. Check the result before you rely on it.

### How long it takes

A page takes roughly 45–75 s on one processor core. The time is mostly the reading of each staff.

- **Computers and Android phones:** soundLAB starts up to 3 helper workers, and a page then takes about
  20–35 s.
- **iPad and iPhone (Safari):** one worker is used. Nested workers aren't reliable there, and memory is
  tighter.

### Where it works

| Where | Status |
|---|---|
| Browsers (iPad Safari, Chrome, Edge, Firefox, home-screen app) | Works. |
| Android app (APK) | Scan says the app can't open files yet: the WebView wrapper has no file picker or downloads. Use the site in Chrome until a new APK adds them. |
| claude.ai artifact | Untested: its frame may refuse the downloads and files. |

## How it works

SheetLab is the owner's app, built on [homr](https://github.com/liebharc/homr), an open-source optical
music recognition engine. soundLAB carries a JavaScript port of homr's recognition path and of SheetLab's
own steps around it.

| Step | What happens | Where |
|---|---|---|
| Page in | PDF pages are rendered with pdf.js, one at a time. Pictures are decoded by the browser. Transparent pictures are put on white. | `js/sheetlab.js` |
| SheetLab prep | Dark scan frames are stripped, low-resolution scans are upscaled and sharpened, two-page spreads are split. | `js/omr/engine.js` |
| homr prep | Crop to the paper, resize to 1920 px wide (Pillow's bicubic, byte-exact), contrast (CLAHE). | `js/omr/autocrop.js`, `resize.js`, `color_adjust.js` |
| Segmentation | A neural network marks staff lines, note heads, stems and rests, clefs and keys, and other symbols. | `js/omr/inference_segnet.js` |
| Structure | Staffs, bar lines, notes, braces, grand staffs and systems are found and repaired. | `js/omr/staff_detection.js` and the modules after it in `js/omr/manifest.js` |
| Reading | Each staff is straightened and read by a transformer (TrOMR) into music tokens. | `js/omr/staff_parsing.js`, `staff_dewarping.js`, `transformer_*.js` |
| Output | Voices from every page are merged. MusicXML 4.0 is written, then MIDI with your tempo, instrument and transpose. | `js/omr/music_xml_generator.js`, `midi.js`, `mxl.js` |

All of it runs in `js/omr/worker.js`, a classic Web Worker; its message protocol is documented in the
file. The page never blocks, because the app's audio runs on the main thread.

### Faithful to the original

The port is checked against the Python originals, stage by stage, on 7 public-domain pages and on
synthetic cases.

| Stage | Result against Python |
|---|---|
| Image steps, segmentation masks, staff detection, staff straightening, MusicXML writer | Byte-identical. |
| MIDI | Byte-identical to what SheetLab writes with music21 and mido (294 of 294 cases). |
| Reading model | 2,951 of 2,954 symbols agree; the MIDI is identical on all 7 pages. |

The reading model's few differences come from floating-point rounding in the browser's math, at places
where the model was nearly undecided.

The suites are `tests/omr-*.test.js`. The reference tools are in `tools/omr/` (see its README).

soundLAB also does better than the Python engine in a few places:

- **Repeats:** when music21 can't expand the repeats (Brahms, Vals no. 3), the Python engine fails the
  whole file. soundLAB writes the MIDI without expanding the repeats and says so.
- **Titles:** a title with non-Latin-1 characters gives a broken MIDI file in Python. soundLAB writes it
  correctly.
- **Transparent pictures:** these turn black in Python. soundLAB puts them on white.
- **Cover pages:** homr's newer "No noteheads or clefs found" message counts as a cover page, as the
  engine intended.
- **Instrument:** exported MusicXML carries the chosen instrument.

### Runtime and models

- The neural networks run with [ONNX Runtime Web](https://onnxruntime.ai/) 1.31.1 on WebAssembly.
  WebGPU is not used: the int8 models have no GPU kernels for their heavy operations, and it would change
  the results.
- Image processing uses [OpenCV.js](https://docs.opencv.org/) 5.0.0, the same version homr uses in Python.
  Where opencv.js differs from the x86 Python build, the kernel is ported (`js/omr/cv.js`).
- **Loading:** opencv.js, onnxruntime-web and pdf.js load from jsDelivr with pinned versions. Each file
  is checked against its SHA-256 before it runs, and is kept in Cache Storage (`soundlab-omr-v1`,
  `soundlab-omr-pdfjs-v1`).
- **Models:** the three models (segmentation, encoder, decoder) are in `models/omr/`. They are split into
  parts of at most 14 MB, with a `manifest.json` of SHA-256 sums, and are also kept in
  `soundlab-omr-v1`. App updates never clear these caches.
- **Model sizes:** segmentation and the encoder are int8-quantized versions of homr's float models. They
  are 14.4 MB and 15.4 MB instead of 57 MB and 53 MB. The decoder is homr's own int8 model (47.4 MB).

## Licences and credits

soundLAB is licensed under the GNU AGPL-3.0 (see `LICENSE`) because it includes homr's code and models.

| Part | Licence |
|---|---|
| homr code and model weights ([github.com/liebharc/homr](https://github.com/liebharc/homr)) | AGPL-3.0. For the licences of the data the models were trained on, see homr's LICENSE_FAQ.md. |
| ONNX Runtime Web | MIT |
| OpenCV.js | Apache-2.0 |
| pdf.js | Apache-2.0 |
| Test pages: Mutopia Project scores (Brahms, Bach, Handel, Arbeau, Carcassi, Mozart, Sousa) | Public domain |
