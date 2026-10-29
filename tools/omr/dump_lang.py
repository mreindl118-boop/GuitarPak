"""Reference recordings of homr's symbol language, for the JS parity suites of
js/omr/transformer_vocabulary.js, transformer_configs.js, circle_of_fifths.js,
triplet_restoration.js and music_xml_generator.js (tests/omr-vocab.test.js, tests/omr-xml.test.js).

usage: python -I tools/omr/dump_lang.py [--seg P] [--enc P] [--dec P] [--ship] [--no-pages]
                                        FIXTURES [page ...]
       python -I tools/omr/dump_lang.py --audit FIXTURES

Per fixture page (FIXTURES/<page>/00-input.png) homr runs the way tools/ref.py and
dump_stages.py run it (detect_staffs_in_image -> repair_systems -> parse_staffs(Config())
-> generate_xml) with recorders monkeypatched over every function of
homr.transformer.vocabulary and homr.triplet_restoration (also where staff_parsing,
staff_parsing_tromr and music_xml_generator imported them by name), and writes:

  12-lang-voices.json  parse_staffs' voices and every _clean_up_voice input/output, each
                       symbol as [str(symbol), image_coordinates] (full float precision:
                       the MusicXML imgpos comments round them)
  12-lang-calls.json   {"calls": {function: [{"in": ..., "out": ...}]}, "tables": [...]}:
                       the input/output of every distinct call after the transformer. Triplet
                       functions receive the voice's whole symbol list: it is stored once in
                       "tables" and referenced as {"table": k}.
  12-lang-xml.json     generate_xml for argument/title variants: what
                       ET.ElementTree(root).write(path, encoding='unicode', xml_declaration=True)
                       writes, and ET.tostring(root, encoding='unicode')

MODELS: --seg/--enc/--dec swap the model paths exactly like ref.py/dump_stages.py do. Note that
Config() has use_gpu_inference=True, so on a machine without a GPU the transformer falls back to
FilePaths.encoder_path_fp16 / decoder_path_fp16 (the fp16 models in homr/transformer/) and the
--enc/--dec swaps have NO effect: that is how 10-tokens.json and 11-score.musicxml were made, and
this default reproduces them (checked below). --ship sets use_gpu_inference=False so the swapped
encoder/decoder (the shipping int8 models) really run; its files are named 12-lang-ship-*.json.

Then FIXTURES/12-lang-synthetic.json (no models needed): vocabularies, Config, kern durations,
EncodedSymbol methods on generated symbols, seeded random token sequences through
remove_duplicated_symbols / sort_token_chords / restore_unmarked_triplets / circle_of_fifths /
generate_xml (exceptions recorded by class name), triplet-heavy measures, a SheetLab-style
merge of all pages' voices, and the calls recorded while computing them.
--audit (no models, no pages) writes only FIXTURES/12-lang-audit.json: the regression cases of
the adversarial audit of the JS port (inputs the recordings above never reach: one measure of
exotic vocabulary tuplets whose sums leave 2^53 in intermediate products, imgpos rounding of
NaN / infinite / huge coordinates, str.strip whitespace in build_dict, kern bases beyond 2^31,
KeyError messages of string keys, exact Fraction arithmetic on such sums) plus a seeded sample
of random and triplet-heavy voices through the clean-up and generate_xml, and (key "boundary", the
second audit) what a JS caller may pass at the API boundary: NaN / inf / huge / tiny / bool / str
XmlGeneratorArguments, flags' truthiness, str / set / dict where a list is expected, non-str symbol
fields and element texts, digit strings past 2^53, lcm products past 2^53, astral characters.
Expected values come only from running homr; nothing is written by hand.
"""
import argparse
import copy
import json
import os
import random
import re
import sys
import xml.etree.ElementTree as ET
from fractions import Fraction

import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--seg')
ap.add_argument('--enc')
ap.add_argument('--dec')
ap.add_argument('--ship', action='store_true', help='really run the swapped encoder/decoder')
ap.add_argument('--no-pages', action='store_true',
                help='only write 12-lang-synthetic.json (its merged-pages case reads existing 12-lang-voices.json)')
ap.add_argument('--audit', action='store_true', help='only write 12-lang-audit.json (audit regression cases)')
ap.add_argument('fixtures')
ap.add_argument('pages', nargs='*')
A = ap.parse_args()

import homr.segmentation.inference_segnet as _seg  # noqa: E402

if A.seg:
    _seg.segnet_path_onnx = A.seg
import homr.transformer.configs as TC  # noqa: E402

_FP = TC.FilePaths.__init__


def _fp_init(self):
    _FP(self)
    if A.enc:
        self.encoder_path = A.enc
    if A.dec:
        self.decoder_path = A.dec


TC.FilePaths.__init__ = _fp_init

import homr.circle_of_fifths as C  # noqa: E402
import homr.music_xml_generator as MX  # noqa: E402
import homr.staff_parsing as SP  # noqa: E402
import homr.staff_parsing_tromr as SPT  # noqa: E402
import homr.transformer.vocabulary as V  # noqa: E402
import homr.triplet_restoration as T  # noqa: E402
from homr.main import ProcessingConfig, detect_staffs_in_image  # noqa: E402
from homr.system_repair import repair_systems  # noqa: E402

FIX = A.fixtures
SUFFIX = '12-lang-ship-' if A.ship else '12-lang-'

# ---------------------------------------------------------------- encoders (Python -> JSON)


def S(s):
    return str(s)


def SL(symbols):
    return [str(s) for s in symbols]


def CH(chords):
    return [[str(s) for s in c] for c in chords]


def ME(measures):
    return [[[str(s) for s in c] for c in m] for m in measures]


def F(f):
    return str(f)


def IC(s):
    ic = s.image_coordinates
    return None if ic is None else [float(ic[0]), float(ic[1])]


def SIC(symbols):
    return [[str(s), IC(s)] for s in symbols]


def DUR(d):
    return {'base_duration': F(d.base_duration), 'dots': d.dots, 'actual_notes': d.actual_notes,
            'normal_notes': d.normal_notes, 'fraction': F(d.fraction), 'kern': d.kern}


def TM(measure):  # triplet_restoration Measure: list of chords of (voice, duration, index)
    return [[[v, F(d), i] for v, d, i in chord] for chord in measure]


def FS(fs):  # frozenset[int] -> sorted list
    return sorted(fs)


def THREES_BY_PLACE(d):  # dict[(places, value)] = (frozenset, off_beat), in dict order
    return [[list(places), value, FS(indices), off_beat] for (places, value), (indices, off_beat) in d.items()]


def PLAY(items):
    return [[F(clock), [[v, F(end)] for v, end in notes]] for clock, notes in items]


TABLES = []
TABLE_IDS = {}


def TBL(symbols):
    k = TABLE_IDS.get(id(symbols))
    if k is None:
        k = len(TABLES)
        TABLES.append(symbols)  # keeps the list alive, so its id is not reused
        TABLE_IDS[id(symbols)] = k
    return {'table': k}


def ERR(e):
    return {'error': type(e).__name__, 'message': str(e)}


# ---------------------------------------------------------------- recorders

REC = {}
ON = [True]


def _store(name, rec_in, out):
    if not ON[0]:
        return
    key = json.dumps(rec_in, sort_keys=True)
    bucket = REC.setdefault(name, {})
    if key not in bucket:
        bucket[key] = {'in': rec_in, 'out': out}


def recorder(module, name, enc_in, enc_out, generator=False, also=()):
    orig = getattr(module, name)

    def wrapper(*args, **kwargs):
        rec_in = enc_in(*args, **kwargs) if ON[0] else None  # encoded BEFORE the call
        out = orig(*args, **kwargs)
        if generator:
            out = list(out)
        if ON[0]:
            _store(name, rec_in, enc_out(out, *args, **kwargs))
        return iter(out) if generator else out

    wrapper.__wrapped__ = orig
    setattr(module, name, wrapper)
    for other in also:  # modules which did `from ... import name`
        setattr(other, name, wrapper)
    return wrapper


def method_recorder(cls, name, enc_in, enc_out):
    orig = getattr(cls, name)

    def wrapper(self, *args, **kwargs):
        rec_in = enc_in(self, *args, **kwargs) if ON[0] else None
        out = orig(self, *args, **kwargs)
        if ON[0]:
            _store('EncodedSymbol.' + name, rec_in, enc_out(out, self, *args, **kwargs))
        return out

    setattr(cls, name, wrapper)


def same_out(out, self, *a, **k):
    return {'s': str(out), 'same': out is self}


def install():
    # vocabulary.py
    recorder(V, 'remove_duplicated_symbols',
             lambda symbols, cleanup_tuplets=True: {'symbols': SL(symbols), 'cleanup_tuplets': cleanup_tuplets},
             lambda out, *a, **k: SL(out), also=(SP,))
    recorder(V, '_group_into_chords', lambda symbols: SL(symbols), lambda out, *a: CH(out))
    recorder(V, '_fix_over_eager_tuplets', lambda chords: CH(chords), lambda out, *a: CH(out))
    recorder(V, '_group_into_measures', lambda chords: CH(chords), lambda out, *a: ME(out))
    recorder(V, '_flatten_measures', lambda measures: ME(measures), lambda out, *a: CH(out))
    recorder(V, '_get_duration_of_measure', lambda measure: CH(measure), lambda out, *a: F(out))
    recorder(V, '_get_typical_duration_of_measures', lambda measures: ME(measures), lambda out, *a: F(out))
    recorder(V, '_remove_tuplets', lambda measure: CH(measure), lambda out, *a: CH(out))
    recorder(V, '_only_keep_lower_staff_if_there_is_a_clef', lambda chords: CH(chords), lambda out, *a: CH(out))
    # out: the kept symbols and which input object each one is (identity)
    recorder(V, '_remove_duplicated_piches', lambda chord: SL(chord),
             lambda out, chord: {'s': SL(out), 'pick': [next(i for i, c in enumerate(chord) if c is o) for o in out]})
    recorder(V, '_remove_redudant_clefs_keys_and_time_signatures', lambda chords: CH(chords),
             lambda out, *a: CH(out))
    recorder(V, '_flatten_chords', lambda chords: CH(chords), lambda out, *a: SL(out))
    recorder(V, 'sort_token_chords',
             lambda symbols, keep_chord_symbol=False: {'symbols': SL(symbols), 'keep_chord_symbol': keep_chord_symbol},
             lambda out, *a, **k: CH(out), also=(T, MX))
    recorder(V, 'kern_to_symbol_duration', lambda kern: kern, lambda out, *a: DUR(out))
    recorder(V, 'prior_power_of_two', lambda n: n, lambda out, *a: out)
    recorder(V, 'is_lower_position', lambda p: p, lambda out, *a: out, also=(MX,))
    recorder(V, 'is_upper_or_has_no_position', lambda p: p, lambda out, *a: out, also=(SPT,))
    recorder(V, 'has_rhythm_symbol_a_position', lambda r: r, lambda out, *a: out)
    recorder(V, '_split_articulations', lambda a: a, lambda out, *a: out)
    E = V.EncodedSymbol
    method_recorder(E, 'is_control_symbol', lambda s: S(s), lambda out, *a: out)
    method_recorder(E, 'is_tuplet', lambda s: S(s), lambda out, *a: out)
    method_recorder(E, 'remove_tuplet', lambda s: S(s), same_out)
    method_recorder(E, 'change_lift', lambda s, lift: [S(s), lift], same_out)
    method_recorder(E, 'to_upper_position', lambda s: S(s), same_out)
    method_recorder(E, 'is_valid', lambda s: S(s), lambda out, *a: out)
    method_recorder(E, 'add_articulations', lambda s, arts: [S(s), list(arts)], same_out)
    method_recorder(E, 'add_slurs', lambda s, slurs: [S(s), list(slurs)], same_out)
    method_recorder(E, 'strip_articulations', lambda s, rm, remove_all=False: [S(s), list(rm), remove_all],
                    lambda out, *a, **k: [out[0], str(out[1])])
    method_recorder(E, 'strip_slurs', lambda s, rm, remove_all=False: [S(s), list(rm), remove_all],
                    lambda out, *a, **k: [out[0], str(out[1])])
    method_recorder(E, 'get_duration', lambda s: S(s), lambda out, *a: DUR(out))
    # triplet_restoration.py
    recorder(T, 'restore_unmarked_triplets', lambda symbols: TBL(symbols), lambda out, *a: SL(out), also=(SP,))
    recorder(T, '_split_into_measures', lambda symbols: TBL(symbols), lambda out, *a: [TM(m) for m in out])
    recorder(T, '_play', lambda measure, triplets=frozenset(): {'measure': TM(measure), 'triplets': FS(triplets)},
             lambda out, *a, **k: PLAY(out), generator=True)
    recorder(T, '_count_breaks',
             lambda measure, triplets=frozenset(): {'measure': TM(measure), 'triplets': FS(triplets)},
             lambda out, *a, **k: [out[0], F(out[1])])
    recorder(T, '_get_length', lambda measure: TM(measure), lambda out, *a: F(out))
    recorder(T, '_find_single_threes', lambda measure, symbols: {'measure': TM(measure), 'symbols': TBL(symbols)},
             lambda out, *a: THREES_BY_PLACE(out))
    recorder(T, '_find_threes', lambda measure, symbols: {'measure': TM(measure), 'symbols': TBL(symbols)},
             lambda out, *a: [[FS(i), o] for i, o in out])
    recorder(T, '_add_following_three',
             lambda in_a_row, single, measure, symbols: {
                 'in_a_row': THREES_BY_PLACE(in_a_row), 'single': THREES_BY_PLACE(single),
                 'measure': TM(measure), 'symbols': TBL(symbols)},
             lambda out, *a: THREES_BY_PLACE(out))
    recorder(T, '_choose_triplets', lambda measure, symbols: {'measure': TM(measure), 'symbols': TBL(symbols)},
             lambda out, *a: [FS(x) for x in out])
    recorder(T, '_note_value', lambda symbols, indices: {'symbols': TBL(symbols), 'indices': FS(indices)},
             lambda out, *a: out)
    recorder(T, '_count_by_note_value',
             lambda symbols, chosen: {'symbols': TBL(symbols), 'chosen': [[FS(x) for x in m] for m in chosen]},
             lambda out, *a: [[k, v] for k, v in out.items()])
    recorder(T, '_as_triplet', lambda symbol: S(symbol), lambda out, symbol: {'s': str(out), 'same': out is symbol})


def take_recordings():
    calls = {name: list(bucket.values()) for name, bucket in REC.items()}
    tables = [SL(t) for t in TABLES]
    REC.clear()
    TABLES.clear()
    TABLE_IDS.clear()
    return {'calls': calls, 'tables': tables}


def wjson(path, obj):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, separators=(',', ':'))
    print('wrote', path, os.path.getsize(path), 'bytes', file=sys.stderr)


def xml_written(root):
    """Exactly what ET.ElementTree(root).write(path, encoding='unicode', xml_declaration=True)
    puts in a file (as homr's main.py and SheetLab do), read back without newline translation."""
    path = os.path.join(FIX, '.dump_lang_tmp.musicxml')
    ET.ElementTree(root).write(path, encoding='unicode', xml_declaration=True)
    with open(path, encoding='utf-8', newline='') as f:
        text = f.read()
    os.remove(path)
    return text


XML_VARIANTS = [  # (large_page, metronome, tempo), title
    ((False, None, None), ''),
    ((True, None, None), 'Entrée & <Suite> "No. 1"'),
    ((False, 120, None), 'SheetLab'),
    ((None, 96, 132), 'Für Elise – più mosso'),
    ((False, 0, 100), "it's a title\twith\ttabs"),
    ((True, 112, 112), 'Merged pages'),
]


def xml_cases(voices):
    out = []
    for (large_page, metronome, tempo), title in XML_VARIANTS:
        args = MX.XmlGeneratorArguments(large_page, metronome, tempo)
        try:
            root = MX.generate_xml(args, voices, title)
            out.append({'args': [large_page, metronome, tempo], 'title': title,
                        'write': xml_written(root), 'tostring': ET.tostring(root, encoding='unicode')})
        except Exception as e:  # noqa: BLE001
            out.append({'args': [large_page, metronome, tempo], 'title': title, **ERR(e)})
    return out


# ---------------------------------------------------------------- pages


def run_pages():
    from homr.transformer.configs import Config

    pages = A.pages or sorted(d for d in os.listdir(FIX) if os.path.isdir(os.path.join(FIX, d)))
    cfg = ProcessingConfig(False, False, False, False, -1, False, False, False, False)
    clean_ups = []
    orig_clean_up = SP._clean_up_voice

    def clean_up(symbols):
        rec = {'in': SIC(symbols)}
        out = orig_clean_up(symbols)
        rec['out'] = SIC(out)
        clean_ups.append(rec)
        return out

    SP._clean_up_voice = clean_up
    all_voices = {}
    for page in pages:
        od = os.path.join(FIX, page)
        img = os.path.join(od, '00-input.png')
        clean_ups.clear()
        take_recordings()
        ON[0] = False  # nothing before the transformer is recorded
        ms, image, debug, _tf, _n, _map = detect_staffs_in_image(img, cfg)
        ms = repair_systems(debug, ms)
        config = Config()
        if A.ship:
            config.use_gpu_inference = False
        ON[0] = True
        voices = SP.parse_staffs(debug, ms, image, selected_staff=-1, config=config)
        ic_types = sorted({type(c).__name__ for v in voices for s in v if s.image_coordinates is not None
                           for c in s.image_coordinates})
        xml = xml_cases(voices)
        rec = take_recordings()
        info = {'mode': 'ship' if A.ship else 'fixture',
                'models': {'seg': os.path.basename(_seg.segnet_path_onnx),
                           'encoder': os.path.basename(config.filepaths.encoder_path if A.ship
                                                       else config.filepaths.encoder_path_fp16),
                           'decoder': os.path.basename(config.filepaths.decoder_path if A.ship
                                                       else config.filepaths.decoder_path_fp16)},
                'ic_types': ic_types, 'voices': [SIC(v) for v in voices], 'clean_up': list(clean_ups)}
        tok = os.path.join(od, '10-tokens.json')
        if os.path.exists(tok):
            with open(tok) as f:
                info['matches_10_tokens'] = json.load(f)['voices'] == [SL(v) for v in voices]
        score = os.path.join(od, '11-score.musicxml')
        if os.path.exists(score):
            with open(score, encoding='utf-8', newline='') as f:
                info['matches_11_score'] = f.read() == xml[0].get('write')
        wjson(os.path.join(od, SUFFIX + 'voices.json'), info)
        wjson(os.path.join(od, SUFFIX + 'calls.json'), rec)
        wjson(os.path.join(od, SUFFIX + 'xml.json'), xml)
        print(page, info['mode'], 'voices', [len(v) for v in voices], '10-tokens:', info.get('matches_10_tokens'),
              '11-score:', info.get('matches_11_score'), 'calls',
              {k: len(v) for k, v in rec['calls'].items()}, file=sys.stderr)
        all_voices[page] = voices
    SP._clean_up_voice = orig_clean_up
    return all_voices


# ---------------------------------------------------------------- synthetic


def load_page_voices():
    """The voices of an earlier page run (12-lang-voices.json), for --no-pages."""
    out = {}
    for page in sorted(d for d in os.listdir(FIX) if os.path.isdir(os.path.join(FIX, d))):
        path = os.path.join(FIX, page, '12-lang-voices.json')
        if not os.path.exists(path):
            continue
        with open(path, encoding='utf-8') as f:
            info = json.load(f)
        voices = []
        for v in info['voices']:
            symbols = []
            for s, ic in v:
                symbol = V.EncodedSymbol(*s.split(' '))
                symbol.image_coordinates = None if ic is None else (ic[0], ic[1])
                symbols.append(symbol)
            voices.append(symbols)
        out[page] = voices
    return out


def synthetic(page_voices):
    r = random.Random(20261028)
    vocab = V.Vocabulary()
    syn = {}
    syn['vocab'] = {name: list(getattr(vocab, name).items())
                    for name in ('rhythm', 'lift', 'articulation', 'pitch', 'slur', 'position')}
    cfg = TC.Config()
    syn['config'] = {
        'to_dict_keys': list(cfg.to_dict().keys()),
        # FilePaths are absolute paths in Python; the port keeps the file names only
        'to_json_string_names': json.dumps({**cfg.to_dict(), 'filepaths': {
            k: os.path.basename(v) for k, v in cfg.filepaths.to_dict().items()}}, indent=2),
        'filepaths_json_names': json.dumps({k: os.path.basename(v) for k, v in cfg.filepaths.to_dict().items()},
                                           indent=2),
        'decoder_args': cfg.decoder_args.to_dict(),
        'decoder_args_json': cfg.decoder_args.to_json_string(),
        'filepaths': {k: os.path.basename(v) for k, v in vars(cfg.filepaths).items()},
        'attrs': {k: v for k, v in vars(cfg).items() if isinstance(v, (int, float, str, bool, list))},
    }
    syn['constants'] = {'nonote': V.nonote, 'empty': V.empty,
                        'VALID_TIME_SIGNATURE_DENOMINATORS': V.VALID_TIME_SIGNATURE_DENOMINATORS,
                        'DYNAMICS': V.DYNAMICS, 'DYNAMICS_MODIFIER': V.DYNAMICS_MODIFIER}
    errs = []
    for tokens in (['a', 'a'], [' '], ['a b'], [' a'], ['a&b'], ['ok', 'x\t']):
        try:
            V.build_dict(tokens)
            errs.append([tokens, None])
        except ValueError as e:
            errs.append([tokens, ERR(e)])
    syn['build_dict_errors'] = errs

    ON[0] = False  # direct results below, the recorders only run for the sequences
    kerns = sorted({r_.split('_', 1)[1] for r_ in vocab.rhythm if r_.startswith(('note_', 'rest_'))})
    kerns += ['', 'G', '.', '0', '3..', '7G', '96', '2m', '05', '6G..', '128..', '1000']
    syn['kern'] = [[k, DUR(V.kern_to_symbol_duration(k))] for k in kerns]
    syn['prior_power_of_two'] = [[n, V.prior_power_of_two(n)] for n in range(-3, 300)]
    arts = list(vocab.articulation)
    combos = ['', '_', 'accent__staccato', 'dynamic_piu_accent', 'accent_dynamic_dolce', 'dynamic',
              'dynamic_', 'dynamic_ff', 'staccato_dynamic', 'dynamic_dynamic_poco']
    combos += ['_'.join(r.sample(arts, r.randint(2, 3))) for _ in range(60)]
    syn['split_articulations'] = [[a, V._split_articulations(a)] for a in arts + combos]
    names = list(vocab.rhythm) + ['newline', 'measureRest', 'chord', 'notes', 'clefX', 'dynamicY', 'Rest']
    syn['has_position'] = [[n, V.has_rhythm_symbol_a_position(n)] for n in names]
    syn['positions'] = [[p, V.is_lower_position(p), V.is_upper_or_has_no_position(p)]
                        for p in list(vocab.position) + ['', 'lowerX', 'Lower', 'up']]

    # EncodedSymbol methods on symbols built from the vocabulary
    rh = list(vocab.rhythm)
    pi = list(vocab.pitch)
    li = list(vocab.lift)
    ar = arts + ['accent_dynamic_dolce', 'staccato_tenuto_accent', '']
    sl = list(vocab.slur) + ['slurStop_slurStart', '']
    po = list(vocab.position)
    symbols = []
    for rhythm in rh:
        symbols.append(V.EncodedSymbol(rhythm, r.choice(pi), r.choice(li), r.choice(ar), r.choice(sl), r.choice(po)))
        symbols.append(V.EncodedSymbol(rhythm))
    for _ in range(600):
        symbols.append(V.EncodedSymbol(r.choice(rh), r.choice(pi), r.choice(li), r.choice(ar), r.choice(sl),
                                       r.choice(po)))
    for rhythm in ('note_4', 'rest_8', 'note_4.', 'clef_G2', 'dynamic_p'):
        for pos in po:
            symbols.append(V.EncodedSymbol(rhythm, 'C4' if rhythm.startswith('note') else '_', '_', '_', '_', pos))
    cases = []
    for i, s in enumerate(symbols):
        other = symbols[(i * 7 + 3) % len(symbols)] if i % 5 else copy.copy(s)
        rm_arts = r.sample(arts, 2) + ['staccato', 'dynamic_piu']
        rm_slurs = r.sample(sl, 1) + ['slurStart']
        add_arts = r.sample(arts[2:], r.randint(0, 2))
        add_slurs = r.sample(['slurStart', 'slurStop'], r.randint(0, 2))
        c = {'s': str(s), 'control': s.is_control_symbol(), 'tuplet': s.is_tuplet(), 'valid': s.is_valid()}
        rt = s.remove_tuplet()
        c['remove_tuplet'] = [str(rt), rt is s]
        up = s.to_upper_position()
        c['to_upper'] = [str(up), up is s]
        c['change_lift'] = str(s.change_lift('#'))
        c['add_articulations'] = [add_arts, str(s.add_articulations(add_arts))]
        c['add_slurs'] = [add_slurs, str(s.add_slurs(add_slurs))]
        for key, fn, rm in (('strip_articulations', s.strip_articulations, rm_arts),
                            ('strip_slurs', s.strip_slurs, rm_slurs)):
            st, res = fn(rm)
            st_all, res_all = fn(rm, remove_all=True)
            c[key] = [rm, st, str(res), st_all, str(res_all)]
        try:
            c['duration'] = DUR(s.get_duration())
        except Exception as e:  # noqa: BLE001
            c['duration'] = ERR(e)
        c['other'] = str(other)
        c['eq'] = s == other
        c['lt'] = s < other
        c['gt'] = other < s
        c['hash_eq'] = hash(s) == hash(other)
        cases.append(c)
    syn['symbols'] = cases

    # token sequences: random, triplet-heavy, and the SheetLab merge of all pages
    ON[0] = True
    seqs = [('random', random_sequence(r, vocab, r.randint(10, 120), safe=i % 4 != 0)) for i in range(100)]
    seqs += [('triplets', triplet_sequence(r)) for _ in range(60)]
    seqs += [('edge', [V.EncodedSymbol(*t.split(' ')) for t in tokens]) for tokens in EDGE_SEQUENCES]
    if page_voices:
        # SheetLab merges the pages' voices and runs remove_duplicated_symbols over the result
        merged = [[], []]
        for voices in page_voices.values():
            for v_idx in range(2):
                if v_idx < len(voices):
                    merged[v_idx].extend(voices[v_idx])
                elif len(voices) == 1 and v_idx == 0:
                    merged[0].extend(voices[0])
        seqs += [('merged', [copy.copy(s) for s in m]) for m in merged if m]
    out = []
    for kind, seq in seqs:
        case = {'kind': kind, 'symbols': SL(seq)}
        for flag in (True, False):
            key = 'remove_duplicated' if flag else 'remove_duplicated_no_tuplets'
            try:
                case[key] = SL(V.remove_duplicated_symbols(seq, flag))
            except Exception as e:  # noqa: BLE001
                case[key] = ERR(e)
        case['sort_token_chords'] = CH(V.sort_token_chords(seq))
        case['sort_token_chords_keep'] = CH(V.sort_token_chords(seq, keep_chord_symbol=True))
        try:
            case['restore_triplets'] = SL(T.restore_unmarked_triplets(seq))
        except Exception as e:  # noqa: BLE001
            case['restore_triplets'] = ERR(e)
        case['maintain_accidentals'] = SL(C.maintain_accidentals_during_measure(seq))
        case['strip_naturals'] = SL(C.strip_naturals(seq))
        cleaned = case['remove_duplicated'] if isinstance(case['remove_duplicated'], list) else None
        xml_in = [seq] if kind != 'merged' else [V.remove_duplicated_symbols(seq)]
        if kind == 'random' and cleaned is not None and r.random() < 0.5:
            xml_in = [V.remove_duplicated_symbols(seq), seq]  # two parts
        variant = r.randrange(len(XML_VARIANTS))
        (large_page, metronome, tempo), title = XML_VARIANTS[variant]
        try:
            root = MX.generate_xml(MX.XmlGeneratorArguments(large_page, metronome, tempo), xml_in, title)
            case['xml'] = {'parts': [SIC(p) for p in xml_in], 'variant': variant, 'write': xml_written(root)}
        except Exception as e:  # noqa: BLE001
            case['xml'] = {'parts': [SIC(p) for p in xml_in], 'variant': variant, **ERR(e)}
        out.append(case)
    syn['sequences'] = out
    syn['xml_variants'] = [[list(a), t] for a, t in XML_VARIANTS]
    rec = take_recordings()
    # the sequences' own results cover the top-level functions; keep a sample of the inner calls
    rec['calls'] = {name: calls[::-(-len(calls) // 300)] for name, calls in rec['calls'].items()}  # <= 300, spread
    syn['recorded'] = rec
    ON[0] = False
    syn['circle'] = circle_cases(r)
    syn['xml_helpers'] = xml_helper_cases(r)
    wjson(os.path.join(FIX, '12-lang-synthetic.json'), syn)
    n_err = sum(1 for c in out if 'error' in c['xml'])
    print('synthetic: sequences', len(out), 'xml errors', n_err,
          sorted({c['xml']['error'] for c in out if 'error' in c['xml']}), file=sys.stderr)


EDGE_SEQUENCES = [
    # multirest, measure rests on both staves, volta endings, repeats, dynamics with a modifier
    ['clef_G2 _ _ _ _ upper', 'chord . . . . .', 'clef_F4 _ _ _ _ lower', 'keySignature_3 . . . . .',
     'timeSignature/4 . . . . .', 'rest_4m _ _ _ _ upper', 'barline . . . . .',
     'measureRest . . . . upper', 'chord . . . . .', 'measureRest . . . . lower', 'barline . . . . .',
     'voltaStart . . . . .', 'note_4 C5 _ accent _ upper', 'note_4 D5 # staccato_tenuto slurStart upper',
     'note_2 D5 # _ slurStop upper', 'voltaStop . . . . .', 'repeatEnd . . . . .', 'voltaStart . . . . .',
     'note_1 E5 _ fermata _ upper', 'voltaDiscontinue . . . . .', 'bolddoublebarline . . . . .',
     'dynamic_pp _ _ _ _ lower', 'dynamic_empty _ _ dynamic_piu _ upper', 'note_4 C4 N _ _ lower',
     'repeatStart . . . . .', 'note_2. F4 bb tremolo _ upper', 'note_4 G4 ## tremolo _ upper',
     'repeatEndStart . . . . .', 'note_8 A4 _ trill_turn _ upper', 'note_8 A4 _ mordent _ upper',
     'note_4 B4 _ breathMark_arpeggiate _ upper', 'doublebarline . . . . .', 'newline . . . . .'],
    # ties: a slur between equal pitches in the same voice, across a barline and inside chords
    ['clef_G2 _ _ _ _ upper', 'timeSignature/4 . . . . .', 'note_2 C5 _ _ slurStart upper', 'chord . . . . .',
     'note_2 E5 _ _ _ upper', 'note_2 C5 _ _ slurStart_slurStop upper', 'chord . . . . .',
     'note_2 G5 _ _ slurStart upper', 'barline . . . . .', 'note_1 C5 _ _ slurStop upper', 'chord . . . . .',
     'note_1 G5 _ _ slurStop upper', 'barline . . . . .', 'note_4 D5 _ _ slurStart upper',
     'note_4 E5 _ _ slurStop upper', 'note_2 E5 _ _ slurStart upper', 'barline . . . . .',
     'note_2 E5 _ _ slurStop upper', 'rest_2 _ _ _ _ upper', 'barline . . . . .'],
    # grace notes, chords of different lengths with rests (backups), tuplets and dotted notes
    ['clef_G2 _ _ _ _ upper', 'chord . . . . .', 'clef_F4 _ _ _ _ lower', 'timeSignature/8 . . . . .',
     'note_8G D5 _ _ _ upper', 'note_4. C5 _ _ _ upper', 'chord . . . . .', 'note_8 E4 _ _ _ upper',
     'chord . . . . .', 'rest_4 _ _ _ _ lower', 'chord . . . . .', 'note_2 C3 _ _ _ lower',
     'note_12 D5 _ _ _ upper', 'note_12 E5 _ _ _ upper', 'note_12 F5 _ _ _ upper', 'barline . . . . .',
     'note_6 G5 _ _ _ upper', 'note_6 A5 _ _ _ upper', 'note_6 B5 _ _ _ upper', 'chord . . . . .',
     'note_2 C3 _ _ _ lower', 'barline . . . . .', 'note_16.. C5 _ _ _ upper', 'note_64 D5 _ _ _ upper',
     'note_0 C5 _ _ _ upper', 'rest_0 _ _ _ _ lower', 'barline . . . . .'],
    # mixed chords: clef / key / time / barline joined to notes, clef changes mid-measure
    ['clef_G2 _ _ _ _ upper', 'note_4 C5 _ _ _ upper', 'chord . . . . .', 'clef_F4 _ _ _ _ lower',
     'chord . . . . .', 'note_4 C3 _ _ _ lower', 'note_4 D5 _ _ _ upper', 'chord . . . . .',
     'barline . . . . .', 'barline . . . . .', 'keySignature_-3 . . . . .', 'chord . . . . .',
     'note_2 E5 b _ _ upper', 'chord . . . . .', 'timeSignature/2 . . . . .', 'note_2 F5 _ _ _ upper',
     'chord . . . . .', 'repeatEnd . . . . .', 'barline . . . . .', 'note_1 G5 _ _ _ upper',
     'clef_C3 _ _ _ _ upper', 'note_1 A4 _ _ _ upper', 'barline . . . . .'],
    # tremolo pairs, accents, unusual sequences: chord marker first, nothing but signatures
    ['chord . . . . .', 'keySignature_0 . . . . .', 'timeSignature/4 . . . . .', 'timeSignature/4 . . . . .',
     'note_8 C5 _ tremolo _ upper', 'note_8 C5 _ tremolo _ upper', 'note_8 C5 _ accentStrong_tremolo _ upper',
     'note_8 C5 _ tremolo _ upper', 'note_2 C5 _ _ _ upper2', 'chord . . . . .', 'note_2 E4 _ _ _ lower2',
     'barline . . . . .', 'timeSignature/4 . . . . .'],
    ['keySignature_2 . . . . .', 'timeSignature/4 . . . . .'],
    ['newline . . . . .'],
]


def random_sequence(r, vocab, n, safe=True):
    rh = list(vocab.rhythm)
    notes = [x for x in rh if x.startswith('note_')]
    rests = [x for x in rh if x.startswith('rest_')]
    if safe:  # grace notes of a non power-of-two value have no MusicXML type (KeyError in homr)
        notes = [x for x in notes if 'G' not in x or x.split('_')[1].split('G')[0] in ('0', '1', '2', '4', '8', '16', '32',
                                                                                         '64', '128')]
        rests = [x for x in rests if 'G' not in x and not x.endswith('m')] + ['rest_3m']
    plain = ['note_4', 'note_8', 'note_2', 'note_16', 'note_4.', 'note_1', 'note_12', 'note_6']
    pitches = list(vocab.pitch)[2:]
    lifts = ['_'] * 12 + ['#', 'b', 'N', '##', 'bb']
    arts = ['_'] * 30 + list(vocab.articulation)[2:]
    slurs = ['_'] * 10 + ['slurStart', 'slurStop', 'slurStart_slurStop']
    positions = ['upper'] * 6 + ['lower'] * 4 + ['upper2', 'lower2']
    others = (['barline'] * 12 + ['clef_G2', 'clef_F4', 'clef_C3', 'keySignature_-2', 'keySignature_4',
              'timeSignature/4', 'timeSignature/8', 'doublebarline', 'bolddoublebarline', 'repeatStart',
              'repeatEnd', 'repeatEndStart', 'voltaStart', 'voltaStop', 'voltaDiscontinue', 'newline',
              'dynamic_mf', 'dynamic_sfz', 'dynamic_empty'])
    seq = []
    for _ in range(n):
        x = r.random()
        if x < 0.55:
            rhythm = r.choice(plain) if r.random() < 0.7 else r.choice(notes)
            s = V.EncodedSymbol(rhythm, r.choice(pitches), r.choice(lifts), r.choice(arts), r.choice(slurs),
                                r.choice(positions))
        elif x < 0.68:
            s = V.EncodedSymbol(r.choice(rests), '_', '_', '_', '_', r.choice(positions))
        else:
            rhythm = r.choice(others)
            if rhythm.startswith(('clef', 'dynamic')):
                art = 'dynamic_poco' if rhythm == 'dynamic_empty' else '_'
                s = V.EncodedSymbol(rhythm, '_', '_', art, '_', r.choice(positions))
            else:
                s = V.EncodedSymbol(rhythm)
        seq.append(s)
        if seq and seq[-1].rhythm.startswith(('note', 'rest')) and r.random() < 0.3:
            seq.append(V.EncodedSymbol('chord'))
    return seq


def triplet_sequence(r):
    """Measures where triplets were read as plain notes against other voices."""
    seq = [V.EncodedSymbol('clef_G2', '_', '_', '_', '_', 'upper'), V.EncodedSymbol('chord'),
           V.EncodedSymbol('clef_F4', '_', '_', '_', '_', 'lower')]
    pitches = ['C5', 'D5', 'E5', 'F5', 'G5', 'A4', 'B4']
    beats = r.choice([2, 3, 4])
    seq.append(V.EncodedSymbol('timeSignature/4'))
    for _m in range(r.randint(2, 8)):
        for _b in range(beats):
            kind = r.random()
            value = r.choice(['8', '8', '8', '16', '4'])
            lower = V.EncodedSymbol('note_%s' % ('4' if value != '4' else '2'), r.choice(['C3', 'G3']), '_', '_', '_',
                                    'lower')
            if kind < 0.6:  # a triplet read as plain notes
                n_notes = 3
            elif kind < 0.85:
                n_notes = 2 if value == '8' else (4 if value == '16' else 1)
            else:
                n_notes = r.choice([1, 2, 3, 4, 6])
            # a second voice in the same chords, which may join a beat later (its run of equal
            # notes then starts elsewhere: the three is off the beat in one voice only)
            parallel = r.random() < 0.3
            joins = r.randint(0, 1) if parallel else 0
            for k in range(n_notes):
                rest = r.random() < 0.1
                if rest:
                    s = V.EncodedSymbol('rest_' + value, '_', '_', '_', '_', 'upper')
                else:
                    s = V.EncodedSymbol('note_' + value, r.choice(pitches), '_', '_', '_',
                                        'upper' if r.random() < 0.9 else 'upper2')
                seq.append(s)
                if parallel and k >= joins and s.position == 'upper':
                    seq.append(V.EncodedSymbol('chord'))
                    seq.append(V.EncodedSymbol('note_' + value, r.choice(pitches), '_', '_', '_', 'upper2'))
                if k == 0 and r.random() < 0.8:
                    seq.append(V.EncodedSymbol('chord'))
                    seq.append(lower)
        seq.append(V.EncodedSymbol('barline'))
    return seq


def circle_cases(r):
    out = {'definition': [[k, v] for k, v in C.definition.items()],
           'inv_definition': [[k, v] for k, v in C.inv_definition.items()]}
    keys = list(C.inv_definition) + ['', 'CM ', 'cM', 'Hm', 'C#m']
    out['key_signature_to_circle_of_fifth'] = [[k, C.key_signature_to_circle_of_fifth(k)] for k in keys]
    out['repeat_note_for_all_octaves'] = [[notes, C.repeat_note_for_all_octaves(notes)]
                                          for notes in (['F'], ['C', 'G#'], [], ['Bb', 'E'])]
    notes = ['%s%d' % (n, o) for n in 'CDEFGAB' for o in (2, 3, 4, 5)]
    accs = ['#', 'b', 'N', '', None, '_', '##', 'bb', '.']
    seqs = []
    for c in list(range(-7, 8)) + [-9, 8]:
        for kind in ('key', 'nokey'):
            kt = C.KeyTransformation(c) if kind == 'key' else C.NoKeyTransformation()
            init = ({'sharps': sorted(kt.sharps), 'flats': sorted(kt.flats)} if kind == 'key' else {})
            steps = []
            for i in range(60):
                if i % 17 == 16:
                    kt = kt.reset_at_end_of_measure()
                    steps.append(['reset'])
                    continue
                note, acc = r.choice(notes), r.choice(accs)
                res = kt.add_accidental(note, acc)
                state = ({'sharps': sorted(kt.sharps), 'flats': sorted(kt.flats)} if kind == 'key'
                         else {'current': [[k, v] for k, v in kt.current_accidentals.items()]})
                steps.append([note, acc, res, state])
            seqs.append({'circle': c, 'kind': kind, 'init': init, 'steps': steps})
    out['transformations'] = seqs
    return out


def xml_helper_cases(r):
    """Small helpers of music_xml_generator with their own inputs."""
    out = {}
    fr = [Fraction(1, 4), Fraction(1, 6), Fraction(3, 8), Fraction(1, 12), Fraction(0), Fraction(5, 7),
          Fraction(1, 96), Fraction(3, 2), Fraction(1, 5), Fraction(1, 11), Fraction(2, 13)]
    cases = []
    for _ in range(80):
        d = r.sample(fr, r.randint(0, 6))
        cases.append([[str(x) for x in d], MX.find_common_division(d)])
    out['find_common_division'] = cases
    out['get_xml_voice'] = [[s, l, MX.get_xml_voice(s, l)] for s in (1, 2) for l in range(5)]
    out['part_metadata'] = [[b, list(MX._part_metadata(b))] for b in (False, True)]
    out['et'] = [et_case(d) for d in ET_TREES]
    return out


# Element trees described as JSON, built the same way by the JS suite, to pin the serializer:
# {"tag", "attrib": [[k, v]], "text", "tail", "children": [...]}, {"comment": text}, {"pi": [target, text]}
ET_TREES = [
    {'tag': 'a', 'attrib': [['z', '1'], ['b', 'x&y<z>"q"'], ['ws', 'line\nbreak\r\ttab']], 'text': 'T & <t> "q"',
     'children': [{'tag': 'e'}, {'tag': 'f', 'text': ''}, {'tag': 'g', 'text': '0'},
                  {'comment': ' imgpos: 1, 2 '}, {'comment': 'a -- b & <c>'}, {'pi': ['xml-stylesheet', 'href="s.css"']},
                  {'tag': 'h', 'tail': 'after & <tail>', 'children': [{'tag': 'i', 'attrib': [['k', '']]}]}]},
    {'tag': 'score-partwise', 'attrib': [['version', '4.0']], 'children': [
        {'tag': 'work', 'children': [{'tag': 'work-title', 'text': 'Entr\u00e9e \u2013 pi\u00f9 \U0001d11e'}]}]},
    {'tag': 'empty'},
    {'tag': 'x', 'text': '\ud834 lone surrogate'},
]


def et_build(d):
    if 'comment' in d:
        e = ET.Comment(d['comment'])
    elif 'pi' in d:
        e = ET.ProcessingInstruction(*d['pi'])
    else:
        e = ET.Element(d['tag'], dict(d.get('attrib', [])))
        if 'text' in d:
            e.text = d['text']
        for c in d.get('children', []):
            e.append(et_build(c))
    if 'tail' in d:
        e.tail = d['tail']
    return e


def et_case(d):
    root = et_build(d)
    case = {'tree': d, 'tostring': ET.tostring(root, encoding='unicode')}
    path = os.path.join(FIX, '.dump_lang_tmp.xml')
    ET.ElementTree(root).write(path, encoding='unicode', xml_declaration=True)
    with open(path, 'rb') as f:
        case['write_bytes'] = list(f.read())
    os.remove(path)
    return case


# ---------------------------------------------------------------- audit (12-lang-audit.json)
# Regression cases of the adversarial audit of the JS port, each pinned to what homr does.

AUDIT_TUPLETS = ['note_7..', 'note_11..', 'note_13..', 'note_34..', 'note_96..', 'note_128..', 'note_36', 'note_40',
                 'note_7', 'rest_26.', 'note_22..', 'note_56.']


AUDIT_MULS = [2, 3, 4, 16, 1000, 392071680, 784143360]
AUDIT_DIVS = [2, 3, 7]


def audit_tuplet_voice(n, barline_every=0, chords=False):
    """One clef, then n notes of the vocabulary's most exotic durations; a measure of them sums to a
    denominator near 4e8, so comparing two sums multiplies past 2^53."""
    v = [V.EncodedSymbol('clef_G2', '.', '.', '.', '.', 'upper')]
    for i in range(n):
        rhythm = AUDIT_TUPLETS[i % len(AUDIT_TUPLETS)]
        pitch = '_' if rhythm.startswith('rest') else 'C4'
        if chords and i % 3 == 1:
            v.append(V.EncodedSymbol('chord'))
            v.append(V.EncodedSymbol(rhythm, pitch, '_', '_', '_', 'lower'))
        else:
            v.append(V.EncodedSymbol(rhythm, pitch, '_', '_', '_', 'upper'))
        if barline_every and (i + 1) % barline_every == 0:
            v.append(V.EncodedSymbol('barline'))
    return v


def audit_pipeline(voices, args=(False, None, None), title=''):
    """[str(symbol), image_coordinates] of every _clean_up_voice and what generate_xml writes."""
    out = {'voices': [SIC(v) for v in voices]}
    cleaned = []
    try:
        for v in voices:
            cleaned.append(T.restore_unmarked_triplets(V.remove_duplicated_symbols(v)))
        out['clean'] = [SIC(c) for c in cleaned]
    except Exception as e:  # noqa: BLE001
        out['clean'] = ERR(e)
        return out
    out['args'], out['title'] = list(args), title
    try:
        out['tostring'] = ET.tostring(MX.generate_xml(MX.XmlGeneratorArguments(*args), cleaned, title), encoding='unicode')
    except Exception as e:  # noqa: BLE001
        out['tostring'] = ERR(e)
    return out


def audit_random_voice(r, vocab, maxlen):
    """Any vocabulary symbol (grace notes of a non power-of-two value rarely: they raise KeyError),
    chord markers, the same symbol object twice now and then, image coordinates incl. .5 values."""
    def bad_grace(k):
        m = re.match(r'(note|rest)_(\d+)G', k)
        return m is not None and int(m[2]) not in (0, 1, 2, 4, 8, 16, 32, 64, 128)
    rh = [k for k in vocab.rhythm if k not in ('PAD', 'BOS', 'EOS')] + ['newline', 'measureRest', 'chord']
    notes = [k for k in vocab.rhythm if k.startswith(('note', 'rest'))]
    plain = ['note_4', 'note_8', 'note_16', 'note_8', 'rest_8', 'note_2', 'note_4.', 'note_12', 'note_24', 'note_6']
    pitches = [k for k in vocab.pitch if k not in ('.', '_')]
    arts = ['_', '_', '_', 'accent', 'staccato', 'tenuto', 'fermata', 'accent_staccato', 'trill', 'tremolo',
            'breathMark', 'turn', 'mordent', 'arpeggiate', 'accentStrong', 'dynamic_piu', '.']
    slurs = ['_', '_', '_', 'slurStart', 'slurStop', 'slurStart_slurStop', '.']
    positions = ['upper', 'upper', 'upper', 'lower', 'lower', 'upper2', 'lower2']
    out = []
    for i in range(r.randint(0, maxlen)):
        if out and r.random() < 0.05:
            out.append(out[r.randrange(len(out))])  # the same object again (identity matters)
            continue
        x = r.random()
        rhythm = (r.choice(plain) if r.random() < 0.6 else r.choice(notes)) if x < 0.55 else 'barline' if x < 0.62 else r.choice(rh)
        while bad_grace(rhythm) and r.random() < 0.995:
            rhythm = r.choice(notes)
        if rhythm.startswith(('note', 'rest', 'clef', 'dynamic')):
            if rhythm.startswith('rest'):
                pitch = '_' if r.random() < 0.9 else r.choice(pitches)
            elif rhythm.startswith('note'):
                pitch = r.choice(pitches) if r.random() < 0.95 else r.choice(['_', '.'])
            else:
                pitch = '_'
            lift = r.choice(['_', '_', '#', 'b', 'N', '##', 'bb', '.']) if rhythm.startswith('note') else '_'
            art = r.choice(arts) if rhythm.startswith(('note', 'rest')) else r.choice(['_', 'dynamic_poco'])
            slur = r.choice(slurs) if rhythm.startswith('note') else '_'
            s = V.EncodedSymbol(rhythm, pitch, lift, art, slur, r.choice(positions))
        elif rhythm == 'measureRest':
            s = V.EncodedSymbol(rhythm, position=r.choice(positions))
        else:
            s = V.EncodedSymbol(rhythm)
        k = r.random()
        if k < 0.6:
            s.image_coordinates = (r.uniform(-5, 2500), r.uniform(-5, 2500)) if k < 0.5 else \
                (r.randint(0, 2500) + 0.5, r.randint(0, 2500) - 0.5)
        out.append(s)
        if rhythm.startswith(('note', 'rest')) and r.random() < 0.35:
            out.append(V.EncodedSymbol('chord'))
    return out


def audit_triplet_voice(r):
    """Measures where unmarked triplet eighths (read as plain note_8) run against a steady lower voice."""
    def figure():
        k = r.random()
        if k < 0.35:
            return [('note_8', Fraction(1, 12))] * 3
        if k < 0.45:
            return [('note_12', Fraction(1, 12))] * 3
        if k < 0.6:
            return [('note_8', Fraction(1, 8))] * 2
        if k < 0.7:
            return [('note_16', Fraction(1, 24))] * 6 if r.random() < 0.5 else [('note_16', Fraction(1, 16))] * 4
        if k < 0.8:
            return [('note_8.', Fraction(3, 16)), ('note_16', Fraction(1, 16))]
        return [('note_4', Fraction(1, 4))] if k < 0.9 else [('rest_4', Fraction(1, 4))]
    beats = r.choice([2, 3, 4])
    seq = [V.EncodedSymbol('clef_G2', '.', '.', '.', '.', 'upper'), V.EncodedSymbol('clef_F4', '.', '.', '.', '.', 'lower'),
           V.EncodedSymbol('keySignature_%d' % r.randint(-3, 3)), V.EncodedSymbol('timeSignature/4')]
    for _ in range(r.randint(1, 10)):
        up, t = [], Fraction(0)
        for _ in range(beats):
            for rhythm, d in figure():
                up.append((t, rhythm))
                t += d
        low = [(Fraction(b, 4), 'note_4') for b in range(beats)]
        for onset in sorted({t for t, _ in up} | {t for t, _ in low}):
            chord = [V.EncodedSymbol(rhythm, '_' if rhythm.startswith('rest') else r.choice(['C5', 'E5', 'G5', 'A4']),
                                     '_', '_', '_', 'upper') for t, rhythm in up if t == onset]
            chord += [V.EncodedSymbol(rhythm, r.choice(['C3', 'G2', 'E3']), '_', '_', '_', 'lower')
                      for t, rhythm in low if t == onset and r.random() < 0.97]
            if chord and r.random() < 0.05:
                chord.pop()  # a lost note
            r.shuffle(chord)
            for i, s in enumerate(chord):
                if i:
                    seq.append(V.EncodedSymbol('chord'))
                if r.random() < 0.5:
                    s.image_coordinates = (r.uniform(0, 2000), r.uniform(0, 2000))
                seq.append(s)
        seq.append(V.EncodedSymbol(r.choice(['barline'] * 8 + ['repeatEnd', 'doublebarline'])))
        if r.random() < 0.15:
            seq.append(V.EncodedSymbol('newline'))
    return seq


def audit_seq_json(symbols):
    """A voice as JSON keeping object identity: a repeated object is {"alias": its first index}."""
    first, out = {}, []
    for i, s in enumerate(symbols):
        if id(s) in first:
            out.append({'alias': first[id(s)]})
        else:
            first[id(s)] = i
            out.append({'s': str(s), 'ic': IC(s)})
    return out


def audit():
    r = random.Random(20261029)
    vocab = V.Vocabulary()
    out = {}

    # one measure (and longer stretches) of exotic tuplets: exact Fractions past 2^53 in between
    tuplets = []
    for n, every, chords in [(9, 0, False), (12, 0, True), (50, 0, False), (60, 12, True), (300, 0, True), (240, 9, False)]:
        case = audit_pipeline([audit_tuplet_voice(n, every, chords)])
        case['n'], case['barline_every'], case['chords'] = n, every, chords
        tuplets.append(case)
    out['tuplets'] = tuplets
    # the Fraction arithmetic homr does on such sums: [a, b, a+b, a-b, cmp, np.median([a, b]),
    # int(a * 1000), [a * k for k in MULS], [a / k for k in DIVS]]. homr multiplies and divides
    # durations only by ints (division, 4, a time signature's denominator, 2/3, a median's /2),
    # never one sum by another (whose reduced product could pass 2^53, which the JS port refuses)
    sums = []
    for n in (5, 9, 12, 40):
        acc = Fraction(0)
        for i in range(n):
            acc += V.kern_to_symbol_duration(AUDIT_TUPLETS[i % len(AUDIT_TUPLETS)].split('_')[1]).fraction
        sums.append(acc)
    sums += [Fraction(1, 392071680), Fraction(392071679, 392071680), Fraction(7, 512) * 3 / 13]
    ops = []
    for a in sums:
        for b in sums:
            ops.append([F(a), F(b), F(a + b), F(a - b), (a > b) - (a < b), F(np.median([a, b])), int(a * 1000),
                        [F(a * k) for k in AUDIT_MULS], [F(a / k) for k in AUDIT_DIVS]])
    out['fraction_ops'] = ops
    out['fraction_muls'], out['fraction_divs'] = AUDIT_MULS, AUDIT_DIVS

    # build_image_position: NaN / infinities raise like round(), huge values print every digit
    imgpos = []
    for x, y in [('nan', '1.0'), ('1.0', 'nan'), ('inf', '1.0'), ('1.0', '-inf'), ('1e+21', '2.5'), ('-1e+22', '3.5'),
                 ('9007199254740994.0', '-0.5'), ('1.2345678901234569e+23', '0.49999999999999994'), ('-2.5', '-0.4'),
                 ('4503599627370494.5', '1234.5')]:
        s = V.EncodedSymbol('note_4', 'C4', '_', '_', '_', 'upper')
        s.image_coordinates = (np.float64(float(x)), np.float64(float(y)))
        e = ET.Element('note')
        try:
            MX.build_image_position(e, s)
            imgpos.append({'in': [x, y], 'xml': ET.tostring(e, encoding='unicode')})
        except Exception as ex:  # noqa: BLE001
            imgpos.append({'in': [x, y], **ERR(ex)})
    for ic in [(1.0,), (1.0, 2.0, 3.0)]:  # x, y = image_coordinates unpacks exactly two
        s = V.EncodedSymbol('note_4', 'C4', '_', '_', '_', 'upper')
        s.image_coordinates = ic
        try:
            MX.build_image_position(ET.Element('note'), s)
            imgpos.append({'in': [repr(v) for v in ic], 'xml': None})
        except Exception as ex:  # noqa: BLE001
            imgpos.append({'in': [repr(v) for v in ic], **ERR(ex)})
    out['imgpos'] = imgpos

    # build_dict: str.strip's whitespace is not String.trim's (\x1c-\x1f, \x85 vs ﻿)
    dicts = []
    for t in ['\x1c', 'a\x1d', '\x1e', 'b\x1f', '\x85', 'c\x85', '﻿', '﻿a', 'a᠎', '​', ' a', '\xa0', '　x', 'ok', '']:
        try:
            dicts.append([t, list(V.build_dict([t]).items()), None])
        except Exception as e:  # noqa: BLE001
            dicts.append([t, None, [type(e).__name__, str(e)]])
    out['build_dict'] = dicts

    # kern_to_symbol_duration with bases beyond 32 bits (JS's & is 32-bit)
    out['kern_big'] = [[k, DUR(V.kern_to_symbol_duration(k))] for k in
                       ['2147483648', '6442450944', '3221225472', '4294967296', '12884901888', '1099511627776',
                        '1099511627777', '2147483647', '4294967295.', '6442450945']]

    # KeyError messages: str(KeyError(k)) is repr(k) for a string key
    keyerrors = []
    for sym in ['note_4 C4 x _ _ upper', "note_4 C4 it's _ _ upper", 'note_4 C4 a"b _ _ upper', 'note_4 C4 q\'" _ _ upper',
                'note_4 C4 a\\b _ _ upper', 'note_4 C4 \x85 　 _ _ upper', 'note_3G C4 _ _ _ upper', 'note_6G. C4 _ _ _ upper']:
        try:
            MX.build_note_or_rest(V.EncodedSymbol(*sym.split(' ')), 0, False, MX.ConversionState(16, Fraction(1)), '')
            keyerrors.append([sym, None])
        except Exception as e:  # noqa: BLE001
            keyerrors.append([sym, [type(e).__name__, str(e)]])
    out['keyerrors'] = keyerrors

    # a seeded sample of the audit's differential fuzz
    fuzz = []
    for i in range(160):
        voices = [audit_random_voice(r, vocab, 70) for _ in range(r.choice([1, 1, 1, 2, 3]))]
        case = audit_pipeline(voices, (r.choice([None, False, True]), r.choice([None, 0, 96, 120]), r.choice([None, 0, 60])),
                              r.choice(['', 'T', 'A & B <c>']))
        case['voices'] = [audit_seq_json(v) for v in voices]
        case['kind'] = 'random'
        fuzz.append(case)
    for i in range(60):
        voices = [audit_triplet_voice(r) for _ in range(r.choice([1, 1, 2]))]
        case = audit_pipeline(voices, (False, r.choice([None, 100]), None), '')
        case['voices'] = [audit_seq_json(v) for v in voices]
        case['kind'] = 'triplets'
        fuzz.append(case)
    out['fuzz'] = fuzz
    out['boundary'] = audit_boundary()
    return out


# ---------------------------------------------------------------- second audit: the API boundary
# What a JS caller can pass that the recordings never do: NaN / infinities / huge ints / tiny
# floats / bools / strings where homr takes an int or a flag, str / set / dict where it takes a
# list, non-str element texts, digit strings past 2^53, astral characters in tokens. Values go
# through JSON tagged: {"int": "123"}, {"float": repr}, {"str": s}, {"set": [...]}, {"dict": [...]},
# {"list": [...]}; None / bools stay plain.

def TAG(v):
    if v is None or isinstance(v, bool):
        return v
    if isinstance(v, int):
        return {'int': str(v)}
    if isinstance(v, float):
        return {'float': repr(v)}
    if isinstance(v, str):
        return {'str': v}
    if isinstance(v, (set, frozenset)):
        return {'set': sorted(v)}
    if isinstance(v, dict):
        return {'dict': list(v)}
    if isinstance(v, list):
        return {'list': [TAG(x) for x in v]}
    raise TypeError(v)


def TRY(fn):
    try:
        return {'ok': fn()}
    except Exception as e:  # noqa: BLE001
        return ERR(e)


def audit_boundary():
    nan, inf = float('nan'), float('inf')
    out = {}
    voice = [V.EncodedSymbol('clef_G2', '_', '_', '_', '_', 'upper'), V.EncodedSymbol('note_4', 'C4', '_', '_', '_', 'upper'),
             V.EncodedSymbol('chord'), V.EncodedSymbol('note_4', 'E4', '#', '_', '_', 'upper'), V.EncodedSymbol('barline')]
    vals = [nan, inf, -inf, 10 ** 21, 1e-7, 1.5e-5, 120.5, 0.0001, 1 / 30000, 2.5e-300, 123456.789, -3.5, -0.0, 0, 0.0, 1, 7,
            True, False, None, '', 'x', 96]
    cases = []
    for m in vals:
        for a in [(False, m, None), (False, 120, m), (m, None, None)]:
            # bool(x) and str(x) only: the generated part does not depend on the arguments
            cases.append({'args': [TAG(x) for x in a],
                          **TRY(lambda a=a: ET.tostring(MX.generate_xml(MX.XmlGeneratorArguments(*a), [voice], ''),
                                                        encoding='unicode'))})
    out['xml_args'] = cases
    out['prior_power_of_two'] = [[TAG(n), TRY(lambda n=n: TAG(V.prior_power_of_two(n)))] for n in
                                 [5.5, nan, inf, -inf, 0.5, 0, -3, 1, 3, 2 ** 52 + 1, 2 ** 60, 2 ** 60 + 2 ** 10]]
    # kern bases past 2^53 (Python's int is exact; the JS port refuses them with OverflowError)
    def fits(d):  # every int of the SymbolDuration within a JS number's exact range
        f = [d.base_duration.numerator, d.base_duration.denominator, d.fraction.numerator, d.fraction.denominator,
             d.actual_notes, d.normal_notes, d.kern]
        return all(abs(x) <= 2 ** 53 - 1 for x in f)
    out['kern_huge'] = [[k, TRY(lambda k=k: DUR(V.kern_to_symbol_duration(k))), fits(V.kern_to_symbol_duration(k))] for k in
                        ['9' * 400, '9007199254740993', '18014398509481984', '4' * 30 + 'G', '12345678901234567890.',
                         '9007199254740991', '4503599627370496']]
    out['remove_tuplet_big'] = []
    for rh in ['note_999999999999999999', 'note_' + '9' * 30 + '.', 'rest_123456789012345678', 'note_9007199254740993',
               'note_' + '7' * 40 + 'G..', 'rest_' + '5' * 25, 'note_' + '1' * 17, 'note_000000000000000000021']:
        s = V.EncodedSymbol(rh, 'C4', '_', '_', '_', 'upper')
        r = s.remove_tuplet()
        out['remove_tuplet_big'].append([rh, r.rhythm, r is s, s.is_tuplet()])
    out['common_division'] = [[[F(Fraction(1, d)) for d in ds], MX.find_common_division([Fraction(1, d) for d in ds])] for ds in
                              [[299999967, 699999923], [299999955, 499999925], [299999949, 499999915, 7, 9],
                               [99999989, 99999971], [392071680, 512, 17], [3, 5, 7, 11, 13, 17, 512, 9]]]
    # list.extend(iterable) and `x in container` of the training-side EncodedSymbol helpers
    s = V.EncodedSymbol('note_4', 'C4', '_', 'staccato_tenuto', 'slurStart', 'upper')
    ext = []
    for arg in ['ab', {'accent', 'fermata'}, {'trill': 1, 'accent': 2}, ['tenuto', 'accent'], '', []]:
        ext.append(['add', TAG(arg), TRY(lambda arg=arg: str(s.add_articulations(arg))), TRY(lambda arg=arg: str(s.add_slurs(arg)))])
    for cont in ['staccatissimo', 'staccato_x', {'staccato'}, {'tenuto': 0}, ['tenuto'], 'slurStartX', '']:
        ext.append(['strip', TAG(cont), TRY(lambda c=cont: [s.strip_articulations(c)[0], str(s.strip_articulations(c)[1])]),
                    TRY(lambda c=cont: [s.strip_slurs(c)[0], str(s.strip_slurs(c)[1])])])
    out['extend_in'] = ext
    # bool() of the flags
    seq = [V.EncodedSymbol('note_12', 'C4', '_', '_', '_', 'lower'), V.EncodedSymbol('barline'),
           V.EncodedSymbol('note_4', 'C4', '_', '_', '_', 'lower'), V.EncodedSymbol('chord'),
           V.EncodedSymbol('note_4', 'E4', '_', '_', '_', 'lower'), V.EncodedSymbol('barline')]
    flags = []
    for f in [nan, 0, 0.0, -0.0, 1, '', 'x', [], ['a'], None, True, False, inf]:
        flags.append([TAG(f), SL(V.remove_duplicated_symbols(seq, f)),
                      [SL(c) for c in V.sort_token_chords(seq, f)],
                      s.strip_articulations(['tenuto'], f)[0], s.strip_slurs([], f)[0]])
    out['flags'] = flags
    # str() of a symbol with a non-str field raises (str.join); hash() does not
    strs = []
    for fields in [('note_4', None), ('note_4', 'C4', '_', 3), ('note_4', 'C4', '_', '_', 1.5), (None,),
                   ('note_4', 'C4', '_', '_', '_', True)]:
        sym = V.EncodedSymbol(*fields)
        strs.append([[TAG(x) for x in fields], TRY(lambda sym=sym: str(sym)), TRY(lambda sym=sym: hash(sym) is not None)])
    out['str_fields'] = strs
    # the ElementTree serializer with non-str texts (NaN is truthy: refused, not skipped)
    ser = []
    for v in [nan, 5, 0, 1.5, True, False, None, -0.0, inf]:
        rec = {'v': TAG(v)}
        for where in ['text', 'tail', 'attrib', 'comment', 'pi', 'nulltag']:
            def build(where=where, v=v):
                if where == 'comment':
                    return ET.tostring(ET.Comment(v), encoding='unicode')
                if where == 'pi':
                    return ET.tostring(ET.ProcessingInstruction('t', v), encoding='unicode')
                e = ET.Element(None if where == 'nulltag' else 'a', **({'b': v} if where == 'attrib' else {}))
                if where in ('text', 'nulltag'):
                    e.text = v
                if where == 'tail':
                    e.tail = v
                return ET.tostring(e, encoding='unicode')
            rec[where] = TRY(build)
        ser.append(rec)
    out['serializer'] = ser
    out['serializer_tag'] = TRY(lambda: ET.tostring(ET.Element(5), encoding='unicode'))
    # int() of token texts: repr in the message; str[i] counts code points
    texts = []
    for rh in ["timeSignature/4'", 'timeSignature/4"', 'timeSignature/a\\b', 'timeSignature/ 8 ', 'timeSignature/-4']:
        def ts(rh=rh):
            attributes = ET.Element('attributes')
            MX.build_time_signature(V.EncodedSymbol(rh), attributes, MX.ConversionState(16, Fraction(1)))
            return ET.tostring(attributes, encoding='unicode')
        texts.append([rh, TRY(ts)])
    for rh in ["rest_4'm", 'rest_ 3 m', 'rest_xm']:
        def mm(rh=rh):
            attributes = ET.Element('attributes')
            MX.build_multi_measure_rest(V.EncodedSymbol(rh), attributes)
            return ET.tostring(attributes, encoding='unicode')
        texts.append([rh, TRY(mm)])
    out['int_texts'] = texts
    astral = []
    for rh, pitch in [('clef_\U0001D11E2', None), ('clef_G\U0001D7DA', None), ('note_4', '\U0001D11E4'), ('note_4', 'C\U0001D7DC')]:
        if pitch is None:
            def b(rh=rh):
                attributes = ET.Element('attributes')
                MX.build_clef(V.EncodedSymbol(rh, '_', '_', '_', '_', 'upper'), attributes)
                return ET.tostring(attributes, encoding='unicode')
        else:
            def b(rh=rh, pitch=pitch):
                return ET.tostring(MX.build_note_or_rest(V.EncodedSymbol(rh, pitch, '_', '_', '_', 'upper'), 0, False,
                                                         MX.ConversionState(16, Fraction(1)), ''), encoding='unicode')
        astral.append([rh, pitch, TRY(b)])
    out['astral'] = astral
    tbl = [V.EncodedSymbol('note_8', 'C4', '_', '_', '_', 'upper'), V.EncodedSymbol('barline')]
    out['note_value'] = [[ix, TRY(lambda ix=ix: T._note_value(tbl, frozenset(ix)))] for ix in [[0], [], [1], [1, 0]]]
    return out


if A.audit:
    wjson(os.path.join(FIX, '12-lang-audit.json'), audit())
    sys.exit(0)


install()
page_voices = load_page_voices() if A.no_pages else run_pages()
if not A.ship:
    synthetic(page_voices)
