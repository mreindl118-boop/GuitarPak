"""Reference MIDI / transposed MusicXML from the owner's SheetLab engine, for js/omr/midi.js
(tests/omr-midi.test.js).

usage: python -I tools/omr/midi_ref.py [--jobs N] [--no-pages] [--no-synthetic] FIXTURES [page ...]

The SheetLab engine's step 4 (tools/sheetlab_engine.py translate_file, copied below verbatim apart
from paths) turns homr's MusicXML into the outputs:
    score = music21.converter.parse(musicxml); score = score.transpose(n) if n;
    per part: insert instrumentFromMidiProgram(gm) (instrumentName set) + MetronomeMark(tempo) at 0;
    score.write('mxl'); score.write('musicxml') when transposed; score.write('midi');
    _polish_midi_file(mid, tempo, gm, title)   (mido: set_tempo + track_name, program changes)

Inputs per page FIXTURES/<page>/:
  fixture      11-score.musicxml as dump_stages.py wrote it (no metronome, empty title)
  engine-<T>   what the engine itself feeds step 4: generate_xml(XmlGeneratorArguments(False, T, T),
               [remove_duplicated_symbols(v) for v in voices if v], title) of the shipping-model
               voices in 12-lang-ship-voices.json (rebuilt with EncodedSymbol(*str.split(' ')) and
               their image coordinates), title = the engine's fallback from the file stem.
Options: tempo 112/80 x GM program 0/24/40 x transpose 0/+2/-3/+7 (engine-<T> uses tempo T), plus
title-encoding cases ('Für Elise' fits latin-1; 'Für Elise – più mosso' does not, and mido's save
fails inside _polish_midi_file, whose bare except leaves a truncated file).

Writes FIXTURES/<page>/13-midi-ref.json:
  {"inputs": {name: musicxml text}, "cases": [case], "scores": {"<input>|<transpose>": score}}
  case  = {input, tempo, program, transpose, title, error?: {stage, type, message},
           mid: base64 of the engine's .mid, midi: {type, ticks_per_beat, tracks: [[event...]]},
           notes: [[[start, dur, pitch, channel, velocity]...] per track], summary}
  event = [abs_tick, type, ...values] (mido message attributes in a fixed order)
  score = music21's view of the parsed (and transposed) score: per part (PartStaff) the notes
          [measure, offset, [[step, alter, octave] ...], is_grace] in recurse() order, key
          signatures [measure, offset, sharps], plus "xml" = score.write('musicxml') when transposed
And FIXTURES/13-midi-synthetic.json: the same for the synthetic generate_xml outputs of
12-lang-synthetic.json (tempo 112, program 0, transpose 0 and +2), which exercise every element homr
writes (grace notes, tuplets, voltas, multi-measure rests, tremolos, dynamics, two parts ...). Where
music21's own MusicXML export fails first (the engine then reports an error and writes no MIDI),
an extra case with "exports": false runs the same step 4 without the .mxl/.musicxml writes.

summary (soundLAB's definition; TranslationResult declares these fields but the engine never fills
them): measures = most measures in a part of the parsed score, notes = note heads (chord members
count; rests and grace notes included as written), chords = Chord objects, duration_seconds = last
MIDI event tick / ticks_per_beat * 60 / tempo, from the polished MIDI.
And FIXTURES/13-midi-edge.json: inputs made from the pages by small programmatic edits, for paths the
pages miss: generate_xml's own metronome (120; 96 with sound tempo 132) against the engine's tempo,
a key that transposes to 8 sharps, minor-mode keys, a bare <sound tempo>, a dotted-quarter beat unit.
--audit writes only FIXTURES/13-midi-audit.json, the regression cases of the adversarial audit of
js/omr/midi.js, for paths the pages and the synthetic scores never reach:
  numeric   music21's own numbers: float(Fraction) of huge fractions, common.opFrac of floats
            (limit_denominator(65535)), nearestMultiple(n, 1/16 | 1/12)[1] < 1e-6
  inputs/cases/scores  (the 13-midi-ref.json layout) seeded generate_xml scores full of exotic
            tuplets (divisions per quarter above 65535, where music21's float offsets are
            approximated), plus engine options at their limits on belle-p1: tempo 0 (music21
            raises ZeroDivisionError), under ~3.58 bpm (mido cannot store the set_tempo and the
            engine keeps music21's unpolished file), 112.5, 99999.
--audit2 writes only FIXTURES/13-midi-audit2.json, the second audit's cases (same layout, run_case with
  the whole engine GM table): random scores over the whole vocabulary x random options (tempo, every
  menu program, transpose -12..12, titles), 9-18 parts (channel 10/11/16), options at their limits,
  titles with characters XML 1.0 forbids (music21's expat parse fails: ParseError), dynamics whose
  volumeScalar raises IndexError, degenerate voices, and "lenient" cases (job[7]: repeats music21
  cannot expand, translated with the whole score unexpanded = midi.js's default, see _Lenient);
  plus "keys"/"pitches" (Stream.transpose of every key signature / spelled pitch) and "chars"
  ([text, expat's ParseError message or None]).
Nothing here is written by hand: every expectation is music21 / mido output.
"""
import argparse
import base64
import io
import json
import os
import shutil
import sys
import tempfile
import traceback
import xml.etree.ElementTree as ET
from multiprocessing import Pool
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('--jobs', type=int, default=3)
ap.add_argument('--no-pages', action='store_true')
ap.add_argument('--no-synthetic', action='store_true')
ap.add_argument('--no-edge', action='store_true')
ap.add_argument('--audit', action='store_true', help='only write FIXTURES/13-midi-audit.json (adversarial audit cases)')
ap.add_argument('--audit2', action='store_true', help='only write FIXTURES/13-midi-audit2.json (second audit: options, '
                'transposition tables, lenient repeats, not-well-formed XML, dynamics, channels)')
ap.add_argument('fixtures')
ap.add_argument('pages', nargs='*')
A = ap.parse_args()
FIX = A.fixtures

TEMPOS = [112, 80]
PROGRAMS = [0, 24, 40]
TRANSPOSES = [0, 2, -3, 7]
EXTRA_TITLES = ['Für Elise', 'Für Elise – più mosso']


# ---------------------------------------------------------------- the engine's step 4 (verbatim)

def _polish_midi_file(mid_path, tempo_bpm, gm_program, title):
    """Ensure clean tempo metadata and GM program change on all tracks."""
    import mido
    try:
        mid = mido.MidiFile(str(mid_path))
        tempo_us = mido.bpm2tempo(tempo_bpm)
        for idx, track in enumerate(mid.tracks):
            if idx == 0:
                track.insert(0, mido.MetaMessage("set_tempo", tempo=tempo_us, time=0))
                if title:
                    track.insert(0, mido.MetaMessage("track_name", name=title, time=0))
            has_prog = False
            for msg in track:
                if msg.type == "program_change":
                    msg.program = gm_program
                    has_prog = True
            if not has_prog:
                track.insert(
                    0, mido.Message("program_change", program=gm_program, channel=0, time=0)
                )
        mid.save(str(mid_path))
    except Exception:
        pass


def step4(musicxml_text, tempo_bpm, gm_prog, transpose_semitones, title, instrument_name, exports=True):
    """translate_file step 4 on a MusicXML string; returns the output files' bytes.
    exports=False skips the .mxl/.musicxml writes (only for synthetic scores whose music21 MusicXML
    export fails, so that their MIDI path is still covered)."""
    import music21
    work_dir = Path(tempfile.mkdtemp(prefix='midiref_'))
    out = {}
    stage = 'parse'
    try:
        temp_musicxml = work_dir / 'score.musicxml'
        temp_musicxml.write_text(musicxml_text, encoding='utf-8')
        score = music21.converter.parse(str(temp_musicxml))
        stage = 'transpose'
        if transpose_semitones != 0:
            score = score.transpose(transpose_semitones)
        stage = 'instrument'
        for part in score.parts:
            inst = music21.instrument.instrumentFromMidiProgram(gm_prog)
            inst.instrumentName = instrument_name
            part.insert(0, inst)
            part.insert(0, music21.tempo.MetronomeMark(number=tempo_bpm))
        stage = 'mxl'
        if exports:
            temp_mxl = work_dir / 'score_out.mxl'
            score.write('mxl', fp=str(temp_mxl))
            out['mxl'] = temp_mxl.read_bytes()
        stage = 'musicxml'
        if exports and transpose_semitones != 0:
            tx = work_dir / 'score_transposed.musicxml'
            score.write('musicxml', fp=str(tx))
            out['musicxml'] = tx.read_text(encoding='utf-8')
        stage = 'midi'
        temp_mid = work_dir / 'score_raw.mid'
        score.write('midi', fp=str(temp_mid))
        stage = 'polish'
        _polish_midi_file(temp_mid, tempo_bpm, gm_prog, title)
        out['mid'] = temp_mid.read_bytes()
        out['score'] = score
        return out, None
    except Exception as exc:  # noqa: BLE001 - the engine reports any failure as an error message
        return out, {'stage': stage, 'type': type(exc).__name__, 'message': str(exc)[:500]}
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


# the engine's GM_INSTRUMENTS (tools/sheetlab_engine.py), by program: the name step 4 gives the
# inserted instrument (it never reaches the MIDI bytes; other programs get a made-up name)
GM_INSTRUMENTS = {
    "Acoustic Grand Piano": 0, "Bright Acoustic Piano": 1, "Honky-tonk / Ragtime Piano": 3,
    "Electric Piano (Rhodes)": 4, "Harpsichord": 6, "Celesta": 8, "Music Box": 10, "Vibraphone": 11,
    "Marimba": 12, "Church Organ": 19, "Accordion": 21, "Acoustic Guitar (Nylon)": 24,
    "Acoustic Guitar (Steel)": 25, "Electric Guitar (Jazz)": 26, "Electric Guitar (Clean)": 27,
    "Acoustic Bass": 32, "Violin": 40, "Viola": 41, "Cello": 42, "String Ensemble": 48, "Choir Aahs": 52,
    "Trumpet": 56, "Trombone": 57, "French Horn": 60, "Alto Sax": 65, "Tenor Sax": 66, "Oboe": 68,
    "Clarinet": 71, "Flute": 73,
}
GM_NAMES = {v: k for k, v in GM_INSTRUMENTS.items()}


class _Lenient:
    """js/omr/midi.js's default for repeats music21 cannot expand: the whole score is translated
    unexpanded. Reproduced in music21 by letting Score.expandRepeats fall back to a copy of the
    score when its Expander raises (any part failing leaves every part unexpanded)."""
    def __enter__(self):
        import copy
        import music21
        from music21 import stream
        self.orig = orig = stream.Score.expandRepeats

        def expand(score, *a, **k):
            try:
                return orig(score, *a, **k)
            except music21.repeat.ExpanderException:
                return copy.deepcopy(score)
        stream.Score.expandRepeats = expand
        return self

    def __exit__(self, *exc):
        from music21 import stream
        stream.Score.expandRepeats = self.orig


# ---------------------------------------------------------------- dumps

def midi_events(mid_bytes):
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
                ev.append([tick, m.type, base64.b64encode(m.name.encode('latin-1') if hasattr(m, 'name') else m.text.encode('latin-1')).decode()])
            elif m.type == 'end_of_track':
                ev.append([tick, m.type])
            else:
                ev.append([tick, m.type, str(m)])
        nl.sort()
        tracks.append(ev)
        notes.append(nl)
    return {'type': mid.type, 'ticks_per_beat': mid.ticks_per_beat, 'tracks': tracks}, notes


def score_view(score):
    from music21 import note as m21note, key as m21key
    parts = []
    for p in score.parts:
        ns, ks = [], []
        for n in p.recurse().notes:
            m = n.getContextByClass('Measure')
            ps = n.pitches
            ns.append([m.number if m is not None else None, str(n.getOffsetInHierarchy(m) if m is not None else n.offset),
                       [[q.step, q.accidental.alter if q.accidental is not None else 0, q.octave] for q in ps],
                       bool(n.duration.isGrace)])
        for k in p.recurse().getElementsByClass(m21key.KeySignature):
            m = k.getContextByClass('Measure')
            ks.append([m.number if m is not None else None, str(k.getOffsetInHierarchy(m) if m is not None else k.offset), k.sharps])
        parts.append({'id': p.id, 'class': type(p).__name__, 'notes': ns, 'keys': ks})
    return parts


def summary(score, midi, tempo):
    from music21 import chord as m21chord
    measures = max((len(p.getElementsByClass('Measure')) for p in score.parts), default=0)
    notes = sum(len(n.pitches) for n in score.recurse().notes)
    chords = len(list(score.recurse().getElementsByClass(m21chord.Chord)))
    last = 0
    for t in midi['tracks']:
        for e in t:
            if e[1] in ('note_on', 'note_off'):
                last = max(last, e[0])
    return {'measures': measures, 'notes': notes, 'chords': chords,
            'duration_seconds': last / midi['ticks_per_beat'] * 60.0 / tempo}


def run_case(job):
    xml_text, inp, tempo, program, transpose, title = job[:6]
    exports = job[6] if len(job) > 6 else True
    lenient = job[7] if len(job) > 7 else False
    import music21
    name = GM_NAMES.get(program, 'GM program %s' % program)
    if lenient:
        with _Lenient():
            out, err = step4(xml_text, tempo, program, transpose, title, name, exports)
    else:
        out, err = step4(xml_text, tempo, program, transpose, title, name, exports)
    case = {'input': inp, 'tempo': tempo, 'program': program, 'transpose': transpose, 'title': title}
    if not exports:
        case['exports'] = False
    if lenient:
        case['lenient'] = True
    if err:
        case['error'] = err
    if 'mid' in out:
        case['mid'] = base64.b64encode(out['mid']).decode()
        try:
            midi, notes = midi_events(out['mid'])
        except Exception as e:  # noqa: BLE001 - e.g. the truncated file a failed polish leaves
            case['midi'] = {'unreadable': type(e).__name__, 'bytes': len(out['mid'])}
            return case
        case['midi'] = midi
        case['notes'] = notes
        try:
            case['summary'] = summary(music21.converter.parse(xml_text, format='musicxml'), midi, tempo)
        except Exception as e:  # noqa: BLE001
            case['summary'] = {'error': type(e).__name__}
    return case


def run_score(job):
    """music21's parsed (transposed) score: note spellings + key signatures (+ the written XML)."""
    xml_text, key, transpose = job
    import music21
    res = {}
    try:
        score = music21.converter.parse(xml_text, format='musicxml')
        if transpose:
            score = score.transpose(transpose)
        res['parts'] = score_view(score)
        if transpose:
            fp = tempfile.mktemp(suffix='.musicxml')
            score.write('musicxml', fp=fp)
            with open(fp, encoding='utf-8') as f:
                res['xml'] = f.read()
            os.remove(fp)
    except Exception as e:  # noqa: BLE001
        res['error'] = {'type': type(e).__name__, 'message': str(e)[:300]}
    return key, res


def engine_xml(page_dir, tempo, title):
    from homr.music_xml_generator import XmlGeneratorArguments, generate_xml
    from homr.transformer import vocabulary as V
    with open(os.path.join(page_dir, '12-lang-ship-voices.json'), encoding='utf-8') as f:
        info = json.load(f)
    voices = []
    for v in info['voices']:
        symbols = []
        for s, ic in v:
            sym = V.EncodedSymbol(*s.split(' '))
            sym.image_coordinates = None if ic is None else (ic[0], ic[1])
            symbols.append(sym)
        voices.append(symbols)
    cleaned = [V.remove_duplicated_symbols(v) for v in voices if len(v) > 0]
    root = generate_xml(XmlGeneratorArguments(large_page=False, metronome=tempo, tempo=tempo), cleaned, title)
    fd, path = tempfile.mkstemp(suffix='.musicxml')
    os.close(fd)
    ET.ElementTree(root).write(path, encoding='unicode', xml_declaration=True)
    with open(path, encoding='utf-8', newline='') as f:
        text = f.read()
    os.remove(path)
    return text


def run_pages(pool):
    pages = A.pages or sorted(d for d in os.listdir(FIX) if os.path.isdir(os.path.join(FIX, d)))
    for page in pages:
        pd = os.path.join(FIX, page)
        with open(os.path.join(pd, '11-score.musicxml'), encoding='utf-8', newline='') as f:
            inputs = {'fixture': f.read()}
        title = page.replace('-', ' ').replace('_', ' ').title()
        if os.path.exists(os.path.join(pd, '12-lang-ship-voices.json')):
            for t in TEMPOS:
                inputs['engine-%d' % t] = engine_xml(pd, t, title)
        jobs = []
        for inp, xml_text in inputs.items():
            tempos = TEMPOS if inp == 'fixture' else [int(inp.split('-')[1])]
            for tempo in tempos:
                for program in PROGRAMS:
                    for tr in TRANSPOSES:
                        jobs.append((xml_text, inp, tempo, program, tr, title))
        for t in EXTRA_TITLES:
            jobs.append((inputs['fixture'], 'fixture', 112, 0, 0, t))
        cases = pool.map(run_case, jobs)
        sjobs = [(inputs[inp], inp + '|' + str(tr), tr) for inp in inputs for tr in TRANSPOSES]
        scores = dict(pool.map(run_score, sjobs))
        with open(os.path.join(pd, '13-midi-ref.json'), 'w', encoding='utf-8') as f:
            json.dump({'inputs': inputs, 'cases': cases, 'scores': scores}, f)
        errs = sum(1 for c in cases if 'error' in c)
        print(page, len(cases), 'cases', errs, 'errors', file=sys.stderr)


def run_synthetic(pool):
    with open(os.path.join(FIX, '12-lang-synthetic.json'), encoding='utf-8') as f:
        syn = json.load(f)
    inputs, jobs = {}, []
    for i, seq in enumerate(syn['sequences']):
        x = seq.get('xml') or {}
        if 'write' not in x:
            continue
        name = 'syn-%03d-%s' % (i, seq['kind'])
        inputs[name] = x['write']
        for tr in (0, 2):
            jobs.append((x['write'], name, 112, 0, tr, 'Synthetic'))
    cases = pool.map(run_case, jobs)
    # the engine stops at music21's MusicXML export for some random scores; their MIDI path alone
    redo = [(inputs[c['input']], c['input'], c['tempo'], c['program'], c['transpose'], c['title'], False)
            for c in cases if c.get('error', {}).get('stage') in ('mxl', 'musicxml')]
    cases += pool.map(run_case, redo)
    sjobs = [(inputs[n], n + '|' + str(tr), tr) for n in inputs for tr in (0, 2)]
    scores = dict(pool.map(run_score, sjobs))
    with open(os.path.join(FIX, '13-midi-synthetic.json'), 'w', encoding='utf-8') as f:
        json.dump({'inputs': inputs, 'cases': cases, 'scores': scores}, f)
    errs = sum(1 for c in cases if 'error' in c)
    print('synthetic', len(cases), 'cases', errs, 'errors', file=sys.stderr)


def run_edge(pool):
    """Inputs made from the page inputs by small programmatic edits, for paths the pages miss."""
    import re
    inputs = {}
    pages = sorted(d for d in os.listdir(FIX) if os.path.isdir(os.path.join(FIX, d)))
    for page in pages:
        pd = os.path.join(FIX, page)
        lang = os.path.join(pd, '12-lang-ship-xml.json')
        if os.path.exists(lang):
            with open(lang, encoding='utf-8') as f:
                variants = json.load(f)
            # generate_xml variants with their own metronome (120; 96 + sound tempo 132)
            for k in (2, 3):
                if 'write' in variants[k]:
                    inputs['%s|lang-v%d' % (page, k)] = variants[k]['write']
    with open(os.path.join(FIX, 'belle-p1', '11-score.musicxml'), encoding='utf-8', newline='') as f:
        belle = f.read()
    ref = json.load(open(os.path.join(FIX, 'belle-p1', '13-midi-ref.json'), encoding='utf-8'))
    eng = ref['inputs']['engine-112']
    # a key that transposes to 8 sharps (mido cannot read it: the engine keeps music21's raw file)
    inputs['belle|key6'] = belle.replace('<fifths>-1</fifths>', '<fifths>6</fifths>')
    # minor mode keys
    inputs['belle|minor'] = belle.replace('<fifths>-1</fifths>', '<fifths>-1</fifths><mode>minor</mode>')
    # a <sound tempo> without a metronome mark
    inputs['belle|sound-only'] = re.sub(r'<direction-type><metronome>.*?</metronome></direction-type>', '', eng)
    # a dotted-quarter metronome mark
    inputs['belle|dotted'] = eng.replace('<beat-unit>quarter</beat-unit>', '<beat-unit>quarter</beat-unit><beat-unit-dot />')
    jobs = []
    for name, x in inputs.items():
        trs = (0, 2, 1) if name.endswith('key6') else (0, 2) if name.endswith('minor') else (0,)
        for tr in trs:
            jobs.append((x, name, 80, 0, tr, 'Edge'))
    cases = pool.map(run_case, jobs)
    sjobs = [(inputs[n], n + '|' + str(tr), tr) for n in inputs for tr in ((0, 2) if n.endswith(('key6', 'minor')) else (0,))]
    scores = dict(pool.map(run_score, sjobs))
    with open(os.path.join(FIX, '13-midi-edge.json'), 'w', encoding='utf-8') as f:
        json.dump({'inputs': inputs, 'cases': cases, 'scores': scores}, f)
    print('edge', len(cases), 'cases', sum(1 for c in cases if 'error' in c), 'errors', file=sys.stderr)


# ---------------------------------------------------------------- --audit

def audit_numeric():
    import random
    from fractions import Fraction
    from music21.common.numberTools import opFrac, nearestMultiple
    r = random.Random(20261028)
    fractions, floats, multiples = [], [], []
    for _ in range(400):
        n = r.randint(-10 ** r.randint(1, 40), 10 ** r.randint(1, 40))
        d = r.randint(1, 10 ** r.randint(1, 40))
        fractions.append([str(n), str(d), float(Fraction(n, d)).hex()])
    for _ in range(400):
        k = r.random()
        if k < 0.3:
            x = r.random() * 10 ** r.randint(-3, 6)
        elif k < 0.7:
            x = r.randint(0, 10 ** 6) / r.choice([3, 7, 11, 13, 17, 65536, 65537, 1000003, 2 ** 20, 3 * 2 ** 18])
        else:
            x = r.randint(0, 10 ** 9) / r.randint(1, 10 ** 9)
        o = Fraction(opFrac(x))
        floats.append([x.hex(), str(o.numerator), str(o.denominator)])
    for _ in range(300):
        if r.random() < 0.5:
            n = Fraction(r.randint(0, 10 ** 8), r.randint(1, 10 ** 7))
        else:
            n = abs(Fraction(r.randint(0, 64), 16) + Fraction(r.choice([0, 1, -1]),
                                                              r.choice([10 ** 6, 10 ** 7, 2 * 10 ** 6, 1052632, 1052631])))
        for unit in (0.0625, 1 / 12):
            multiples.append([str(n.numerator), str(n.denominator), unit.hex(), nearestMultiple(n, unit)[1] < 1e-6])
    return {'fractions': fractions, 'floats': floats, 'nearest_multiple': multiples}


def audit_sequence(r, V):
    """A homr voice with many exotic tuplets (11-, 13-, 17-tuplets ...), the way a misread page
    can come out: measures whose lengths and offsets need huge denominators."""
    E = V.EncodedSymbol
    seq = [E('clef_G2', '_', '_', '_', '_', 'upper')]
    two = r.random() < 0.5
    if two:
        seq += [E('chord'), E('clef_F4', '_', '_', '_', '_', 'lower')]
    seq += [E('keySignature_%d' % r.randint(-7, 7)), E('timeSignature/4')]
    pitches = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'G5', 'C6']
    tuplets = ['12', '6', '10', '20', '7', '14', '28', '9', '18', '11', '22', '13', '26', '34', '5', '3', '56', '96']
    for _m in range(r.randint(3, 12)):
        if r.random() < 0.25:
            seq.append(E('dynamic_' + r.choice(['p', 'mf', 'f', 'ff', 'sfz', 'pp', 'fp']), '_', '_', '_', '_', 'upper'))
        for _b in range(r.randint(2, 6)):
            if r.random() < 0.6:
                tv = r.choice(tuplets)
                for _k in range(r.randint(1, 4)):
                    seq.append(E('note_' + tv, r.choice(pitches), r.choice(['_'] * 5 + ['#', 'b']), '_',
                                 r.choice(['_'] * 4 + ['slurStart', 'slurStop']), 'upper'))
                    if r.random() < 0.2:
                        seq += [E('chord'), E('note_' + r.choice(tuplets), r.choice(pitches), '_', '_', '_', 'upper2')]
            else:
                seq.append(E('note_' + r.choice(['4', '8', '16', '2', '4.']), r.choice(pitches), '_', '_', '_', 'upper'))
            if two and r.random() < 0.5:
                seq += [E('chord'), E('note_' + r.choice(['4', '2', '12', '10']), r.choice(['C3', 'G3', 'E3']), '_', '_', '_', 'lower')]
        seq.append(E(r.choice(['barline'] * 6 + ['repeatEnd', 'repeatStart'])))
    return seq


def run_audit(pool):
    import random
    import re
    from homr.music_xml_generator import XmlGeneratorArguments, generate_xml
    from homr.transformer import vocabulary as V
    r = random.Random(1028)
    inputs, jobs = {}, []
    with open(os.path.join(FIX, 'belle-p1', '11-score.musicxml'), encoding='utf-8', newline='') as f:
        inputs['belle'] = f.read()
    for tempo in (0, 1, 3, 4, 112.5, 99999):
        jobs.append((inputs['belle'], 'belle', tempo, 0, 0, 'Belle'))
    k = 0
    while k < 40:
        voices = [audit_sequence(r, V)] + ([audit_sequence(r, V)] if r.random() < 0.3 else [])
        tempo = r.choice([60, 80, 112, 132])
        try:
            root = generate_xml(XmlGeneratorArguments(large_page=False, metronome=tempo, tempo=tempo),
                                [V.remove_duplicated_symbols(v) for v in voices], 'Audit')
        except Exception:  # noqa: BLE001 - random voices homr cannot write
            continue
        fd, path = tempfile.mkstemp(suffix='.musicxml')
        os.close(fd)
        ET.ElementTree(root).write(path, encoding='unicode', xml_declaration=True)
        with open(path, encoding='utf-8', newline='') as f:
            text = f.read()
        os.remove(path)
        divs = [int(x) for x in re.findall(r'<divisions>(\d+)</divisions>', text)]
        if k < 30 and not any(d > 65535 for d in divs):
            continue  # most cases: huge denominators; the rest: whatever comes
        name = 'tuplets-%02d' % k
        inputs[name] = text
        for tr in (0, r.choice([2, -3, 7])):
            jobs.append((text, name, tempo, r.choice([0, 24, 40]), tr, 'Audit', False))
        k += 1
    cases = pool.map(run_case, jobs)
    sjobs = [(inputs[n], n + '|' + str(tr), tr) for n in inputs if n != 'belle' for tr in (0, 2)][:20]
    scores = dict(pool.map(run_score, sjobs))
    out = {'numeric': audit_numeric(), 'inputs': inputs, 'cases': cases, 'scores': scores}
    with open(os.path.join(FIX, '13-midi-audit.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f)
    print('audit', len(cases), 'cases', sum(1 for c in cases if 'error' in c), 'errors', file=sys.stderr)


# ---------------------------------------------------------------- --audit2

def audit2_voice(r, V, vocab):
    """A random homr voice over the WHOLE vocabulary: every clef, key and time signature, extreme
    pitches, all articulations and dynamics, grand staffs, and (in some voices) repeats/voltas."""
    E = V.EncodedSymbol
    rh = list(vocab.rhythm)
    notes = [x for x in rh if x.startswith('note_') and ('G' not in x or x.split('_')[1].split('G')[0] in
                                                          ('0', '1', '2', '4', '8', '16', '32', '64', '128'))]
    rests = [x for x in rh if x.startswith('rest_') and 'G' not in x and not x.endswith('m')] + ['rest_3m', 'rest_2m']
    plain = ['note_4', 'note_8', 'note_2', 'note_16', 'note_4.', 'note_1', 'note_12', 'note_6', 'note_8.', 'note_2.']
    pitches = list(vocab.pitch)[2:]
    mid = [p for p in pitches if p[-1] in '3456']
    lifts = ['_'] * 12 + ['#', 'b', 'N', '##', 'bb']
    arts = ['_'] * 20 + list(vocab.articulation)[2:]
    slurs = ['_'] * 8 + ['slurStart', 'slurStop', 'slurStart_slurStop']
    two = r.random() < 0.4
    pos = (['upper'] * 5 + ['lower'] * 4 + ['upper2', 'lower2']) if two else (['upper'] * 8 + ['upper2'])
    clefs = [x for x in rh if x.startswith('clef_') and 'TAB' not in x]
    keys = [x for x in rh if x.startswith('keySignature')]
    times = [x for x in rh if x.startswith('timeSignature')]
    seq = [E(r.choice(clefs), '_', '_', '_', '_', 'upper')]
    if two:
        seq += [E('chord'), E(r.choice(clefs), '_', '_', '_', '_', 'lower')]
    if r.random() < 0.9:
        seq.append(E(r.choice(keys)))
    if r.random() < 0.9:
        seq.append(E(r.choice(times)))
    rep_ = ['repeatStart', 'repeatEnd', 'repeatEndStart', 'voltaStart', 'voltaStop', 'voltaDiscontinue'] if r.random() < 0.3 else []
    others = (['barline'] * 14 + ['doublebarline', 'bolddoublebarline', 'newline'] + rep_ +
              [r.choice(keys), r.choice(times), r.choice(clefs)] + ['dynamic_' + d for d in V.DYNAMICS])
    for _ in range(r.randint(5, 140)):
        x = r.random()
        if x < 0.58:
            rhythm = r.choice(plain) if r.random() < 0.7 else r.choice(notes)
            s = E(rhythm, r.choice(mid if r.random() < 0.85 else pitches), r.choice(lifts), r.choice(arts),
                  r.choice(slurs), r.choice(pos))
        elif x < 0.7:
            s = E(r.choice(rests), '_', '_', '_', '_', r.choice(pos))
        else:
            rhythm = r.choice(others)
            if rhythm.startswith(('clef', 'dynamic')):
                art = r.choice(['_', '_', 'dynamic_poco', 'dynamic_piu']) if rhythm != 'dynamic_empty' else 'dynamic_dolce'
                s = E(rhythm, '_', '_', art, '_', r.choice(pos))
            else:
                s = E(rhythm)
        seq.append(s)
        if seq[-1].rhythm.startswith(('note', 'rest')) and r.random() < 0.3:
            seq.append(E('chord'))
    return seq


def xml_text(voices, args, title):
    from homr.music_xml_generator import generate_xml
    from homr.transformer import vocabulary as V
    root = generate_xml(args, [V.remove_duplicated_symbols(v) for v in voices], title)
    fd, path = tempfile.mkstemp(suffix='.musicxml')
    os.close(fd)
    ET.ElementTree(root).write(path, encoding='unicode', xml_declaration=True)
    with open(path, encoding='utf-8', newline='') as f:
        text = f.read()
    os.remove(path)
    return text


def audit2_tables():
    """Stream.transpose(n) of every key signature and of spelled pitches (score.transpose is what
    the engine calls; KeySignature.transpose(int) alone would respell keys beyond 6 sharps/flats)."""
    from music21 import key, note, pitch, stream
    keys = []
    for k in range(-7, 8):
        for n in range(-24, 25):
            sc, pa, m = stream.Score(), stream.Part(), stream.Measure()
            m.insert(0, key.KeySignature(k))
            m.append(note.Note('C4'))
            pa.append(m)
            sc.insert(0, pa)
            t = sc.transpose(n)
            keys.append([k, n, t.recurse().getElementsByClass(key.KeySignature).first().sharps])
    pitches = []
    for step in 'CDEFGAB':
        for alt in (-2, -1, 0, 1, 2, None):
            for octv in (0, 1, 4, 7, 8, 9):
                for n in (-24, -13, -12, -7, -3, -1, 1, 2, 5, 7, 11, 12, 13, 24):
                    sc, pa, m = stream.Score(), stream.Part(), stream.Measure()
                    nn = note.Note(step + str(octv))
                    if alt is not None:
                        nn.pitch.accidental = pitch.Accidental(alt)
                    m.append(nn)
                    pa.append(m)
                    sc.insert(0, pa)
                    q = sc.transpose(n).recurse().notes.first().pitch
                    pitches.append([step, alt, octv, n, q.step, q.accidental.alter if q.accidental is not None else None,
                                    q.octave, q.midi])
    return keys, pitches


def audit2_chars(r):
    """[text, expat's error or None]: characters XML 1.0 forbids, raw or as references, in text,
    attributes and comments (music21 parses MusicXML with expat)."""
    pool = ['a', 'Ü', 'é', '\U0001F600', '\n', '\r', '\r\n', '\t', ' ', '\x7f', '\x85', '\u2028', '\ufffd',
            '&amp;', '&#65;', '&#x1F600;']
    bad = ['\x00', '\x01', '\x08', '\x0b', '\x0c', '\x0e', '\x1f', '\ufffe', '\uffff', '&#1;', '&#x0;', '&#xFFFE;',
           '&#55296;', '&#xDFFF;', '&#x110000;', '&#11;']
    out = []
    for _ in range(300):
        def seg(k, allow_bad):
            toks = [r.choice(pool) for _ in range(r.randint(0, k))]
            if allow_bad and r.random() < 0.5:  # (inside a comment "&#1;" is plain text, no error)
                toks.insert(r.randint(0, len(toks)), r.choice(bad))
            return ''.join(toks)
        where = r.choice(['text', 'attr', 'comment', 'multi'])
        if where == 'text':
            x = '<?xml version="1.0"?>\n<a>' + seg(8, False) + '<b>' + seg(10, True) + '</b>' + seg(5, True) + '</a>'
        elif where == 'attr':
            x = '<a x="' + seg(8, True) + '">' + seg(5, False) + '</a>'
        elif where == 'comment':
            x = '<a>' + seg(4, False) + '<!--' + seg(8, True) + '-->' + seg(5, True) + '</a>'
        else:
            x = '<a>\n' + seg(8, False) + '\r\n<c>' + seg(9, True) + '</c>\r' + seg(9, True) + '\n</a>'
        try:
            ET.fromstring(x)
            msg = None
        except ET.ParseError as e:
            msg = str(e)
        out.append([x, msg])
    return out


def run_audit2(pool):
    """Second adversarial audit of js/omr/midi.js: what the first references never vary."""
    import random
    from homr.music_xml_generator import XmlGeneratorArguments
    from homr.transformer import vocabulary as V
    r = random.Random(20261028)
    vocab = V.Vocabulary()
    noargs = XmlGeneratorArguments(large_page=False, metronome=None, tempo=None)
    inputs, jobs, sjobs = {}, [], []
    E = lambda t: V.EncodedSymbol(*t.split(' '))  # noqa: E731
    # 1. random scores over the whole vocabulary x random engine options (any tempo, all GM menu
    #    programs, transpose -12..12, titles); 1-3 parts or 9-13 (channel assignment)
    gm = sorted(GM_NAMES)
    titles = ['', 'Belle', 'Für Elise', 'A & B <c>', '0', 'x' * 200, 'Été']
    k = 0
    while k < 70:
        kk = r.random()
        nv = 1 if kk < 0.55 else 2 if kk < 0.8 else 3 if kk < 0.9 else r.randint(9, 13)
        voices = [audit2_voice(r, V, vocab) for _ in range(nv)]
        tempo = r.choice([r.randint(20, 300)] * 6 + [112.5, 60.25, 99.9, 33.3])
        meta = r.choice([None, tempo, r.randint(40, 200)])
        try:
            text = xml_text(voices, XmlGeneratorArguments(large_page=False, metronome=meta, tempo=meta), 'Audit %d' % k)
        except Exception:  # noqa: BLE001 - random voices homr cannot write
            continue
        name = 'fuzz-%02d' % k
        inputs[name] = text
        tr = r.randint(-12, 12) if r.random() < 0.8 else 0
        jobs.append((text, name, tempo, r.choice(gm), tr, r.choice(titles), False))
        if tr:
            sjobs.append((text, name + '|' + str(tr), tr))
        k += 1
    # 2. channels: a piano (2 staves, program 0) first seen in part 10 gets channel 10 (drums),
    #    in part 11 channel 11, after 15 voice parts channel 16 ...
    single = ['clef_G2 _ _ _ _ upper', 'keySignature_1', 'timeSignature/4', 'note_4 C5 _ _ _ upper',
              'note_4 C5 # _ _ upper', 'note_2 C5 _ _ _ upper', 'barline']
    double = ['clef_G2 _ _ _ _ upper', 'chord', 'clef_F4 _ _ _ _ lower', 'keySignature_1', 'timeSignature/4',
              'note_2 G4 _ _ _ upper', 'chord', 'note_2 C3 _ _ _ lower', 'note_2 E4 _ _ _ upper', 'barline']
    for layout in ('0000000001', '00000000011', '1000000000000', '000000000010000', '0000000000000001',
                   '010101010101010101'):
        name = 'parts-' + layout
        inputs[name] = xml_text([[E(t) for t in (double if c == '1' else single)] for c in layout], noargs, 'Parts')
        for prog in (0, 24, 52):
            jobs.append((inputs[name], name, 112, prog, 0, 'Parts', False))
    # 3. options at their limits on a page (programs outside the menu, negative / huge tempos,
    #    transposes far beyond +-12)
    with open(os.path.join(FIX, 'belle-p1', '11-score.musicxml'), encoding='utf-8', newline='') as f:
        inputs['belle'] = f.read()
    for prog in (1, 47, 112, 115, 118, 119, 127):
        jobs.append((inputs['belle'], 'belle', 112, prog, 0, 'Belle', False))
    for tempo in (-60, -0.5, 3.5763, 0.0001, 5e7, 2 ** 31, 1e300):
        jobs.append((inputs['belle'], 'belle', tempo, 0, 0, 'Belle', False))
    for tr in (-60, -48, 48, 60, 100):
        jobs.append((inputs['belle'], 'belle', 112, 24, tr, 'Belle', False))
    # 4. a title with a character XML 1.0 forbids (PDF metadata): music21 cannot parse the file
    for i, title in enumerate(['A\x01B', 'Seite\x0c1', 'A\x00B', 'A\ufffeB', 'A\ud800B', 'A\r\nB']):
        name = 'title-%d' % i
        inputs[name] = xml_text([[E('clef_G2 _ _ _ _ upper'), E('note_4 C4 _ _ _ upper')]], noargs, title)
        jobs.append((inputs[name], name, 112, 0, 0, title, False))
    # 5. dynamics music21 cannot scale (thisDynamic[-1] of ''): IndexError only for a note in its span
    first = inputs['belle'].index('<note>')
    last = inputs['belle'].rindex('</measure>')
    def dyn(mark):
        return ('<direction placement="below"><direction-type><dynamics>' + mark +
                '</dynamics></direction-type><staff>1</staff></direction>')
    variants = [('s', first, dyn('<s />')), ('blank-other', first, dyn('<other-dynamic> </other-dynamic>')),
                ('empty-other', first, dyn('<other-dynamic />')), ('z', first, dyn('<z />')),
                ('other-s', first, dyn('<other-dynamic>s</other-dynamic>')), ('ss', first, dyn('<ss />')),
                ('s-at-end', last, dyn('<s />')), ('s-then-p', first, dyn('<s />') + dyn('<p />'))]
    for name, at, d in variants:
        inputs['dyn-' + name] = inputs['belle'][:at] + d + inputs['belle'][at:]
        jobs.append((inputs['dyn-' + name], 'dyn-' + name, 112, 0, 0, 'Dyn', False))
    # 6. degenerate voices
    degenerate = {
        'empty-voice': [[]], 'clef-only': [['clef_G2 _ _ _ _ upper']], 'barline-only': [['barline']],
        'grace-only': [['note_8G C4 _ _ _ upper']], 'rest-only': [['rest_4 _ _ _ _ upper']], 'two-empty': [[], []],
        'measure-rest': [['clef_G2 _ _ _ _ upper', 'timeSignature/4', 'rest_3m _ _ _ _ upper', 'barline']],
        'repeat-only': [['repeatEnd']], 'volta-only': [['voltaStart', 'note_4 C4 _ _ _ upper', 'voltaStop']],
        'zero-dur': [['note_0 C4 _ _ _ upper']], 'extremes': [['note_4 B9 ## _ _ upper', 'note_4 C0 bb _ _ upper']],
        'ts48': [['timeSignature/48', 'note_1 C4 _ _ _ upper', 'barline', 'note_1 C4 _ _ _ upper']],
    }
    for name, vs in degenerate.items():
        inputs['degen-' + name] = xml_text([[E(t) for t in v] for v in vs], noargs, 'Degenerate')
        for tr in (0, 5):
            jobs.append((inputs['degen-' + name], 'degen-' + name, 112, 0, tr, 'Degenerate', False))
    # 7. repeats music21 cannot expand, translated unexpanded (midi.js's default, see _Lenient)
    lenient = []
    with open(os.path.join(FIX, 'brahms-vals3-p1', '13-midi-ref.json'), encoding='utf-8') as f:
        brahms = json.load(f)['inputs']
    for name, text in brahms.items():
        inputs['brahms-' + name] = text
        lenient += [(text, 'brahms-' + name, 112, 0, 0, 'Brahms', False, True),
                    (text, 'brahms-' + name, 80, 24, -3, 'Brahms', False, True)]
    for name in [n for n in inputs if n.startswith('fuzz-')]:
        if '<repeat ' in inputs[name] or '<ending ' in inputs[name]:
            lenient.append((inputs[name], name, 112, 0, 2, 'Fuzz', False, True))
    cases = pool.map(run_case, jobs + lenient)
    scores = dict(pool.map(run_score, sjobs))
    keys, pitches = audit2_tables()
    out = {'inputs': inputs, 'cases': cases, 'scores': scores, 'keys': keys, 'pitches': pitches,
           'chars': audit2_chars(r)}
    with open(os.path.join(FIX, '13-midi-audit2.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f)
    print('audit2', len(cases), 'cases', sum(1 for c in cases if 'error' in c), 'errors,',
          sum(1 for c in cases if c.get('lenient')), 'lenient', file=sys.stderr)


if __name__ == '__main__':
    if A.audit2:
        with Pool(A.jobs) as pool:
            run_audit2(pool)
        sys.exit(0)
    if A.audit:
        with Pool(A.jobs) as pool:
            run_audit(pool)
        sys.exit(0)
    with Pool(A.jobs) as pool:
        if not A.no_pages:
            run_pages(pool)
        if not A.no_synthetic:
            run_synthetic(pool)
        if not A.no_edge:
            run_edge(pool)
