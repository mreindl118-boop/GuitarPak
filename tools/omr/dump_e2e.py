"""End-to-end references for js/omr/engine.js (tests/omr-e2e.test.js): the owner's SheetLab engine
(sheetlab_engine.py SheetMusicTranslator.translate_file) run on whole files with the SHIPPING models,
ONE FRESH PROCESS PER FILE (cv::theRNG, which fitEllipse draws from, carries from page to page and
from file to file inside a Python process; the JS engine resets it once per document).

usage:
  python -I tools/omr/dump_e2e.py --engine SHEETLAB_ENGINE.py --models SHIPMODELS [--jobs N] [--contexts] OUTDIR CASE...
  python -I tools/omr/dump_e2e.py ... [--jobs N] [--contexts] --docs DOCS.json OUTDIR   (documents of page images)
  python -I tools/omr/dump_e2e.py ... --repo-fixture CASE TESTS_FIXTURES_DIR   (the small CI set)
  python -I tools/omr/dump_e2e.py --titles tests/fixtures/omr/e2e-titles.json   (Python's str.title())
CASE = a .pdf or an image file (the engine renders a PDF itself with PyMuPDF at 300 dpi; an image goes
through PIL convert('RGB')). Each case writes OUTDIR/<stem>/:
  summary.json   success, error, title, pages_processed, pages_skipped, page_summaries, progress
                 [[fraction, message]...], log, pages [{page_number, label, staff_count, voice_count,
                 skipped_reason, voices: [[[str(symbol), image_coordinates]...] per voice]}],
                 staffs [{shape, sha1, tokens, margins}] per transformer call: its input image, the
                 symbols it read and per decoder step the top-2 logit margin of each head (rhythm,
                 pitch, lift, position, articulation, slur),
                 musicxml (homr's merged MusicXML as the engine wrote it), mid (base64), midi
                 (tracks of events, as tools/omr/midi_ref.py dumps them), notes (per track [start, dur, pitch,
                 channel, velocity]), lenient (True when music21 could not expand the repeats: the
                 engine itself reports `error` then; the MIDI here is what music21 writes with the
                 whole score unexpanded = js/omr/midi.js's default, like midi_ref.py's _Lenient), seconds.
  ctx-NN.bin     (--contexts) the encoder output of transformer call NN, float32 1 x 1280 x 512:
                 tests/omr-e2e.test.js runs the JS decoder on it wherever the JS tokens differ.
Models: --models DIR holds the three shipping files (segnet int8, encoder int8, decoder) under
homr's file names; the engine runs on the CPU (transformer_use_gpu False -> encoder_path /
decoder_path, which are pointed at DIR).

--docs DOCS.json OUTDIR: documents made of page images, each run like a PDF of those pages (the
engine's own PDF path, translate_file unchanged: PyMuPDF's fitz.open answers with the given pictures as
the rendered pages, PIL convert('RGB') each, and the metadata title), one fresh process per document,
into OUTDIR/<key>/ (as above). DOCS.json = {"docs": [{"key", "title", "pages": [png, ...]}]}, page
paths relative to DOCS.json. tests/omr-e2e.test.js runs SL_OMR_DIR/e2e-ref/docs.json's documents too:
multi-page merges with different part counts, a cover page between music, documents without music,
tiny / 600 dpi / gray pages.

--repo-fixture: runs CASE (a one-page PDF) and writes TESTS_FIXTURES_DIR/e2e-<stem>-p1.png (the page
as homr read it, i.e. after preprocess_sheet_image, which must leave a CI page unchanged; 8-bit gray
when R == G == B, else RGB; lossless) and
TESTS_FIXTURES_DIR/e2e-<stem>.json (title, source name, the engine's summary fields, musicxml, the
MIDI note list and events, and the page's voices) for the CI run of tests/omr-e2e.test.js.
Top-level FILES only: the other omr suites take every directory under tests/fixtures/omr for a page.
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
SEG = 'segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f.onnx'
ENC = 'encoder_pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31.onnx'
DEC = 'decoder_pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31.onnx'


def setup_models(models):
    import homr.segmentation.inference_segnet as seg
    seg.segnet_path_onnx = os.path.join(models, SEG)
    import homr.transformer.configs as tc
    orig = tc.FilePaths.__init__

    def init(self):
        orig(self)
        self.encoder_path = os.path.join(models, ENC)
        self.decoder_path = os.path.join(models, DEC)
    tc.FilePaths.__init__ = init


def midi_events(mid_bytes):
    """tools/omr/midi_ref.py's midi_events (that module parses its arguments on import)."""
    import io
    import mido
    mid = mido.MidiFile(file=io.BytesIO(mid_bytes))
    tracks, notes = [], []
    for t in mid.tracks:
        tick, ev, on, nl = 0, [], {}, []
        for m in t:
            tick += m.time
            if m.type in ('note_on', 'note_off'):
                ev.append([tick, m.type, m.channel, m.note, m.velocity])
                if m.type == 'note_on' and m.velocity > 0:
                    on.setdefault((m.channel, m.note), []).append((tick, m.velocity))
                else:
                    k = (m.channel, m.note)
                    if on.get(k):
                        st, v = on[k].pop(0)
                        nl.append([st, tick - st, m.note, m.channel, v])
            elif m.type == 'program_change':
                ev.append([tick, m.type, m.channel, m.program])
            elif m.type == 'pitchwheel':
                ev.append([tick, m.type, m.channel, m.pitch])
            elif m.type == 'control_change':
                ev.append([tick, m.type, m.channel, m.control, m.value])
            elif m.type == 'set_tempo':
                ev.append([tick, m.type, m.tempo])
            elif m.type == 'time_signature':
                ev.append([tick, m.type, m.numerator, m.denominator, m.clocks_per_click, m.notated_32nd_notes_per_beat])
            elif m.type == 'key_signature':
                ev.append([tick, m.type, m.key])
            elif m.type in ('track_name', 'instrument_name', 'text', 'lyrics', 'marker'):
                txt = m.name if hasattr(m, 'name') else m.text
                ev.append([tick, m.type, base64.b64encode(txt.encode('latin-1')).decode()])
            elif m.type == 'end_of_track':
                ev.append([tick, m.type])
            else:
                ev.append([tick, m.type, str(m)])
        nl.sort()
        tracks.append(ev)
        notes.append(nl)
    return {'type': mid.type, 'ticks_per_beat': mid.ticks_per_beat, 'tracks': tracks}, notes


def run_one(engine_path, models, case, outdir, page_png=None, contexts=False, doc=None):
    """In a fresh process: translate_file(case) like the owner's app, record everything.
    doc = {'title', 'pages': [png paths]}: case is a PDF of those pages (see --docs)."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(engine_path)))
    sys.path.insert(0, HERE)
    setup_models(models)
    if doc is not None:
        case = fake_pdf(case, doc)
    from pathlib import Path
    import music21
    import sheetlab_engine as E

    rec = {'case': os.path.basename(case), 'pages': [], 'progress': [], 'log': []}
    orig_analyze = E.SheetMusicTranslator._analyze_single_page_image

    def analyze(self, image_path, page_num, label, config):
        a = orig_analyze(self, image_path, page_num, label, config)
        rec['pages'].append({
            'page_number': a.page_number, 'label': a.label, 'staff_count': a.staff_count,
            'voice_count': a.voice_count, 'skipped_reason': a.skipped_reason,
            'voices': [[[str(s), [float(c) for c in s.image_coordinates] if s.image_coordinates is not None else None]
                        for s in v] for v in a.voices]})
        if page_png is not None and page_num == 1:  # the page exactly as homr read it
            import shutil
            shutil.copyfile(image_path, page_png)
        return a
    E.SheetMusicTranslator._analyze_single_page_image = analyze

    # music21 cannot expand some repeats (ExpanderException: the engine fails the whole file).
    # Record that, and let the run go on unexpanded like js/omr/midi.js's default.
    lenient = {'used': False}
    from music21 import stream
    orig_expand = stream.Score.expandRepeats

    def expand(score, *a, **k):
        try:
            return orig_expand(score, *a, **k)
        except music21.repeat.ExpanderException as exc:
            lenient['used'] = True
            lenient['error'] = 'ExpanderException: ' + str(exc)
            import copy
            return copy.deepcopy(score)
    stream.Score.expandRepeats = expand

    # every transformer call: the staff image's sha1 (the input) and the symbols it read, so a token
    # difference can be told apart from a difference in the staff images
    import hashlib
    from homr.transformer import staff2score as s2s
    orig_predict = s2s.Staff2Score.predict
    rec['staffs'] = []

    # and per decoder step the top-2 logit margin of each head (rhythm, pitch, lift, position,
    # articulation, slur: the decoder's output order), so a token difference can be shown to be a
    # near-tie of the model
    import numpy as np
    from onnxruntime.capi.onnxruntime_inference_collection import IOBinding
    orig_outputs = IOBinding.get_outputs
    margins = []

    def get_outputs(self):
        outs = orig_outputs(self)
        if len(outs) > 7:  # the decoder (the encoder has one output)
            row = []
            for h in range(6):
                v = np.sort(outs[h].numpy()[0, -1, :].astype(np.float64))
                row.append(round(float(v[-1] - v[-2]), 4))
            margins.append(row)
        return outs
    IOBinding.get_outputs = get_outputs

    if contexts:  # the encoder's output per transformer call: OUTDIR/ctx-NN.bin (float32 1 x 1280 x 512)
        from homr.transformer import encoder_inference as ei
        orig_generate = ei.Encoder.generate

        def generate(self, x):
            out = orig_generate(self, x)
            np.ascontiguousarray(out, dtype=np.float32).tofile(os.path.join(outdir, 'ctx-%02d.bin' % len(rec['staffs'])))
            return out
        ei.Encoder.generate = generate
        os.makedirs(outdir, exist_ok=True)

    def predict(self, image, *a, **k):
        margins.clear()
        out_symbols = orig_predict(self, image, *a, **k)
        arr = np.ascontiguousarray(image)
        rec['staffs'].append({'shape': list(arr.shape), 'sha1': hashlib.sha1(arr.tobytes()).hexdigest(),
                              'tokens': [str(x) for x in out_symbols], 'margins': list(margins)})
        return out_symbols
    s2s.Staff2Score.predict = predict

    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    tr = E.SheetMusicTranslator()
    tr._weights_ready = True
    t0 = time.time()
    r = tr.translate_file(case, E.TranslationOptions(output_dir=out / 'files'),
                          log_fn=lambda m: rec['log'].append(m),
                          progress_fn=lambda p, m: rec['progress'].append([p, m]))
    rec['seconds'] = time.time() - t0
    rec.update({'success': r.success, 'error': r.error_message, 'title': r.title,
                'pages_processed': r.pages_processed, 'pages_skipped': r.pages_skipped,
                'page_summaries': r.page_summaries, 'files': sorted(r.output_files)})
    rec['lenient'] = lenient['used']
    if lenient['used']:
        rec['engine_error'] = lenient['error']  # what the unmodified engine reports (no MIDI)
    if 'musicxml' in r.output_files:
        rec['musicxml'] = Path(r.output_files['musicxml']).read_text(encoding='utf-8')
    if 'mid' in r.output_files:
        mid = Path(r.output_files['mid']).read_bytes()
        rec['mid'] = base64.b64encode(mid).decode()
        rec['midi'], rec['notes'] = midi_events(mid)
    with open(out / 'summary.json', 'w') as f:
        json.dump(rec, f, indent=1)
    return rec


def fake_pdf(case, doc):
    """PyMuPDF answers translate_file's fitz.open(src) with doc's pictures as the pages it renders
    (get_pixmap(dpi, alpha=False).samples = the RGB pixels) and doc's title as the metadata title; the
    engine checks that src exists, so an empty <key>.pdf is made for it. -> that path"""
    import tempfile
    import fitz
    from PIL import Image

    class Pix:
        def __init__(self, path):
            im = Image.open(path).convert('RGB')
            self.width, self.height = im.size
            self.samples = im.tobytes()

    class Page:
        def __init__(self, path):
            self.path = path

        def get_pixmap(self, dpi=300, alpha=False):
            return Pix(self.path)

    class Doc:
        metadata = {'title': doc.get('title', '')}

        def __len__(self):
            return len(doc['pages'])

        def __getitem__(self, i):
            return Page(doc['pages'][i])

        def close(self):
            pass

    fitz.open = lambda *a, **k: Doc()
    path = os.path.join(tempfile.mkdtemp(prefix='e2e_doc_'), os.path.basename(case))
    open(path, 'wb').close()
    return path


def read_docs(docs_json):
    """--docs: {key: {'title', 'pages': [absolute png paths]}} in file order"""
    with open(docs_json) as f:
        spec = json.load(f)
    base = os.path.dirname(os.path.abspath(docs_json))
    out = {}
    for d in spec['docs']:
        out[d['key']] = {'title': d.get('title', ''), 'pages': [os.path.normpath(os.path.join(base, p)) for p in d['pages']]}
    return out


def write_titles(out):
    """Python's str.title() (the engine's title fallback: Path(src).stem with - and _ as spaces) on
    strings that cover every cased character Python knows: each alone after a space (its full
    titlecase mapping), each after a cased 'a' (its full lowercase mapping) followed by 'a' (whether
    it is cased), Final_Sigma contexts and file-name-like strings."""
    import unicodedata
    cased = [cp for cp in range(0x110000) if not 0xD800 <= cp <= 0xDFFF
             and (chr(cp).isupper() or chr(cp).islower() or chr(cp).istitle())]
    mapped = [cp for cp in range(0x110000) if not 0xD800 <= cp <= 0xDFFF and cp not in set(cased)
              and (chr(cp).lower() != chr(cp) or chr(cp).title() != chr(cp))]
    chars = [chr(c) for c in cased + mapped]
    strings = []
    for i in range(0, len(chars), 64):
        chunk = chars[i:i + 64]
        strings.append(' '.join(chunk))
        strings.append('a' + 'a'.join(chunk) + 'a')
    strings += ['\u03a3', 'A\u03a3', 'A\u03a3 B', 'A\u03a3\u0301', 'A\u0301\u03a3', 'A\u03a3\u0301B', '\u03a3\u03a3\u03a3',
                'AB\u03a3.', "A'\u03a3", 'A\u03a3\u00ad', 'x\u0130y', 'brahms vals3 let', 'ElCapitanMarch let',
                "they're bill's friends", '02 entree let', 'BWV 797  (copy)', 'f\u00fcr elise \u2013 pi\u00f9 mosso',
                '\u00e9tude no 1', '\u01c6emal', '\ufb01ne \ufb02ow', '\u10d0\u10d1 \u1c90', 'stra\u00dfe', 'i\u0307x']
    table = {'unicode': unicodedata.unidata_version, 'cases': [[t, t.title()] for t in strings]}
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(table, f, ensure_ascii=False, separators=(',', ':'))
    print('wrote', out, len(table['cases']), 'strings', os.path.getsize(out), 'bytes')


def stem(case):
    return os.path.splitext(os.path.basename(case))[0]


def spawn(args, case, outdir, extra=()):
    cmd = [sys.executable, '-I', os.path.abspath(__file__), '--engine', args.engine, '--models', args.models,
           '--one', case, outdir] + list(extra)
    t0 = time.time()
    p = subprocess.run(cmd, capture_output=True, text=True)
    tail = (p.stderr or '').strip().splitlines()[-3:]
    print('%-28s rc=%d %.0fs %s' % (stem(case), p.returncode, time.time() - t0, ' | '.join(tail) if p.returncode else ''), flush=True)
    return p.returncode


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--engine', help="the owner's sheetlab_engine.py (tools/sheetlab_engine.py of the SheetLab app)")
    ap.add_argument('--models', help='dir with the shipping segnet / encoder / decoder')
    ap.add_argument('--jobs', type=int, default=1)
    ap.add_argument('--one', help=argparse.SUPPRESS)
    ap.add_argument('--page-png', help=argparse.SUPPRESS)
    ap.add_argument('--contexts', action='store_true', help="also write each staff's encoder output (ctx-NN.bin, 2.6 MB each)")
    ap.add_argument('--repo-fixture', nargs=2, metavar=('CASE', 'DIR'))
    ap.add_argument('--titles', metavar='OUT', help="write Python's str.title() of test strings (no engine run)")
    ap.add_argument('--docs', metavar='DOCS_JSON', help='documents made of page images (see the module notes); OUTDIR follows')
    ap.add_argument('--doc-key', help=argparse.SUPPRESS)
    ap.add_argument('out', nargs='?')
    ap.add_argument('cases', nargs='*')
    args = ap.parse_args()
    if args.one:
        try:
            doc = read_docs(args.docs)[args.doc_key] if args.doc_key else None
            run_one(args.engine, args.models, args.one, args.out, args.page_png, args.contexts, doc)
        except Exception:
            traceback.print_exc()
            sys.exit(1)
        return
    if args.titles:
        write_titles(args.titles)
        return
    if not args.engine or not args.models:
        ap.error('--engine and --models are needed')
    if args.repo_fixture:
        case, fixdir = args.repo_fixture
        import tempfile
        tmp = tempfile.mkdtemp(prefix='e2e_fix_')
        png = os.path.join(tmp, 'page.png')
        if spawn(args, case, os.path.join(tmp, 'out'), ['--page-png', png]):
            sys.exit(1)
        import cv2
        import numpy as np
        rec = json.load(open(os.path.join(tmp, 'out', 'summary.json')))
        img = cv2.imread(png)
        name = 'e2e-' + stem(case)
        os.makedirs(fixdir, exist_ok=True)
        gray = (img[..., 0] == img[..., 1]).all() and (img[..., 1] == img[..., 2]).all()
        cv2.imwrite(os.path.join(fixdir, name + '-p1.png'), img[..., 0] if gray else img,
                    [cv2.IMWRITE_PNG_COMPRESSION, 9])
        keep = ('success', 'error', 'engine_error', 'lenient', 'title', 'pages_processed', 'pages_skipped',
                'page_summaries', 'progress', 'musicxml', 'notes', 'midi', 'pages')
        fx = {k: rec[k] for k in keep if k in rec}
        fx['source'] = os.path.basename(case)
        fx['image'] = name + '-p1.png'
        fx['image_gray'] = bool(gray)
        fx['note'] = ("the owner's SheetLab engine (shipping int8 segnet/encoder + decoder, CPU, fresh process) on "
                      + os.path.basename(case) + '; tools/omr/dump_e2e.py --repo-fixture')
        with open(os.path.join(fixdir, name + '.json'), 'w') as f:
            json.dump(fx, f, separators=(',', ':'))
        print('wrote', name + '-p1.png', os.path.getsize(os.path.join(fixdir, name + '-p1.png')), 'bytes,',
              name + '.json', os.path.getsize(os.path.join(fixdir, name + '.json')), 'bytes')
        return
    if args.docs:
        if not args.out:
            ap.error('--docs DOCS_JSON OUTDIR')
        docs = read_docs(args.docs)
        extra = ['--contexts'] if args.contexts else []
        with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as ex:
            rcs = list(ex.map(lambda k: spawn(args, k + '.pdf', os.path.join(args.out, k),
                                              extra + ['--docs', os.path.abspath(args.docs), '--doc-key', k]), docs))
        sys.exit(1 if any(rcs) else 0)
    if not args.out or not args.cases:
        ap.error('OUTDIR and at least one CASE are needed')
    with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as ex:
        rcs = list(ex.map(lambda c: spawn(args, c, os.path.join(args.out, stem(c)), ['--contexts'] if args.contexts else []), args.cases))
    sys.exit(1 if any(rcs) else 0)


if __name__ == '__main__':
    main()
