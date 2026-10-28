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


GM_NAMES = {0: 'Acoustic Grand Piano', 24: 'Acoustic Guitar (Nylon)', 40: 'Violin'}


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
    import music21
    out, err = step4(xml_text, tempo, program, transpose, title, GM_NAMES[program], exports)
    case = {'input': inp, 'tempo': tempo, 'program': program, 'transpose': transpose, 'title': title}
    if not exports:
        case['exports'] = False
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


if __name__ == '__main__':
    with Pool(A.jobs) as pool:
        if not A.no_pages:
            run_pages(pool)
        if not A.no_synthetic:
            run_synthetic(pool)
