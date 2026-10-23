# Frozen original OMR test corpus

This directory adds forty PNG cases, twenty original MusicXML compositions and twenty separately authored truth JSON files to the existing raster-only PDF smoke fixture. `README.md` continues to document that existing PDF fixture. No private files, copyrighted songs, installed engines, model weights, tooling packages or large benchmark outputs are included here.

The original immutable `manifest.json` SHA-256 is:

```text
22a4115cd19e126cd69125b1a9f93ee7e4032cfd2fd087d388e0ccbeb2b5e4f6
```

All PNGs and authored source/truth files are byte-identical to frozen corpus v1. `portable-inputs.json` is the runnable PNG-only input list for this minimal repository copy. `manifest.json`, `images-only.json` and `freeze.json` preserve the full original archival metadata unchanged; they also reference SVG and PDF variants deliberately omitted from this minimal copy. Use `portable-inputs.json` to enumerate present recognition inputs. The one retained raster-only PDF remains at this directory's top level and is documented by the original README.

The complete evidence archive outside the repository was `frozen-v1.zip`, SHA-256 `b0e29ade0fef6d57665a8a89044d143aae02132d8f3bfbf1c9a0393e50fa54f8`. `portable-files.json` records the hashes of files present in this portable copy, rather than implying that every archival artifact was copied.

## Coverage and limits

There are twenty compositions, each with clean engraving and a related, deterministic synthetic scan-degradation variant. Cases 01–04 are short treble/bass lines. Cases 05–13 add rests, whole/half/quarter/eighth/dotted durations, beams, accidentals, sharp/flat keys, chords and ties. Cases 14–16 exercise repeat, multipart and tuplet limitations. Cases 17–20 are eight-measure pages at 1800-pixel width with normal 20-pixel staff spacing. Short examples remain separate failures where a detector or model cannot process them.

These are original synthetic scores and simulated degradation, not camera/scanner/handwriting validation. Clean and degraded variants of one composition are related cases. Forty images do not establish general accuracy. No tempo is printed; the truth correctly leaves `tempoBpm` null. Playback truth merges ties but does not silently expand repeats.

Only PNG or rendered PDF **pixels** may enter recognition code. Do not pass source MusicXML, truth JSON, metadata, filenames or this manifest as recognition hints. Truth is loaded only after inference to evaluate predictions. Browser test fixtures assert that separation. A written MusicXML result does not itself prove correct transcription or authorize acceptance.

## Reproduce engraving separately

`generate.py` is the original composition/engraving source, unchanged from the evidence revision. Copy it to a scratch directory before running it; do not overwrite the frozen fixtures. Use an isolated Python environment with Verovio 6.3.0, CairoSVG 2.8.2, Pillow 13.0.0, NumPy and PyMuPDF. The script first authors the composition events, engraves with Verovio's default Leipzig music font, then rasterizes SVG glyphs with CairoSVG. It never obtains truth from a recognition engine.

Verovio's supplied distribution metadata declares LGPL-3.0-only; its supplied COPYING/COPYING.LESSER texts are retained in `licenses/`. Additional CairoSVG/Pillow supplied license texts are also retained. The original composition/generator declaration in the archival manifest is CC0-1.0; that declaration does not replace third-party library/font licenses. No engraving package is an application runtime dependency. See [official Verovio source and licensing](https://github.com/rism-digital/verovio) and [official Python package](https://pypi.org/project/verovio/).

## Independent post-inference evaluation

`evaluate.py` is an optional Python evaluator; it never calls an engine. It requires `defusedxml` for bounded, non-external XML parsing. Its `--selftest` checks all twenty authored source/truth pairs and deliberate dropped-tie/rest mistakes. Example, from a scratch working directory:

```sh
python /path/to/corpus/evaluate.py --selftest --output /tmp/omr-selftest.json
python /path/to/corpus/evaluate.py --lab-root /path/to/external-benchmark \
  --results /path/to/external-benchmark/results --output /tmp/omr-evaluation.json
```

The result-file contract is `{engine,input,inputSha256,copiedInput?,outputs,seconds,peakRssKiB,timeout,returncode,truthReadDuringInference:false}`. Output and copied-input paths are relative to `--lab-root`. The evaluator verifies the actual copied-image hash against the frozen manifest, retains all attempts and selects the latest same-image attempt, including failure. It uses edit alignment and checks pitches/spelling, onset, duration, rests, parts, clef, key, meter, complete measures, ties and repeat marks. PDF smoke metrics remain separate from PNG metrics.

Earlier interim case 05/07 images changed before this frozen revision. Results without matching image hashes must remain provisional/stale; never score them against the final truth. Portable browser validation summaries are maintained separately in `../validation/`.
