// OMR engine: MusicXML -> MIDI / transposed MusicXML exactly as the SheetLab engine (music21 10.5 +
// mido 1.3) makes them (js/omr/midi.js), against tools/omr/midi_ref.py's references:
//   SL_OMR_FIXTURES/<page>/13-midi-ref.json   the 7 pages x {fixture, engine-112, engine-80} inputs
//                                             x tempo / GM program / transpose (+ title encodings)
//   SL_OMR_FIXTURES/13-midi-synthetic.json     153 synthetic generate_xml scores (every element homr writes)
//   SL_OMR_FIXTURES/13-midi-audit.json / 13-midi-audit2.json   the adversarial audits (midi_ref.py --audit / --audit2):
//                                             exotic tuplets, option limits, random options, lenient repeats, forbidden
//                                             XML characters, key/pitch transposition tables, expat's character errors
// Checks per case: the .mid bytes are identical; when they are not, the first differing event;
// the error cases fail the same way; the summary; music21's note spellings and key signatures of
// the (transposed) score. Plus the XML parser, the SMF reader and the GM table.
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./omr/harness');

require(path.join(H.ROOT, 'js', 'omr', 'midi.js'));
require(path.join(H.ROOT, 'js', 'omr', 'mxl.js'));
const OMR = globalThis.OMR;
const M = OMR.midi, X = OMR.xml;

const b64 = (u) => Buffer.from(u).toString('base64');
const KEYS = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const KEYS_M = ['Abm', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm', 'Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m'];
// readSmf events in midi_ref.py's [tick, type, ...] form
function events(smf) {
  return smf.tracks.map((t) => t.map((e) => {
    switch (e.type) {
      case 'note_on': case 'note_off': return [e.tick, e.type, e.channel - 1, e.note, e.velocity];
      case 'program_change': return [e.tick, e.type, e.channel - 1, e.program];
      case 'pitchwheel': return [e.tick, e.type, e.channel - 1, e.pitch];
      case 'set_tempo': return [e.tick, e.type, e.tempo];
      case 'time_signature': return [e.tick, e.type, e.num, e.den, e.clocks, e.n32];
      case 'key_signature': return [e.tick, e.type, (e.minor ? KEYS_M : KEYS)[e.sharps + 7]];
      case 'track_name': return [e.tick, e.type, Buffer.from(e.name).toString('base64')];
      case 'end_of_track': return [e.tick, e.type];
      default: return [e.tick, e.type];
    }
  }));
}
function firstDiff(mine, ref) {
  for (let t = 0; t < Math.max(mine.length, ref.length); t++) {
    const a = mine[t] || [], b = ref[t] || [];
    let k = 0;
    while (k < a.length && k < b.length && JSON.stringify(a[k]) === JSON.stringify(b[k])) k++;
    if (k < a.length || k < b.length) return 'track ' + t + ' event ' + k + ': js ' + JSON.stringify(a[k]) + ' ref ' + JSON.stringify(b[k]);
  }
  return 'events equal (bytes differ)';
}
// music21's view of a score (midi_ref.py score_view): per part the notes in recurse() order
// [measure, offset in measure, [[step, alter, octave]...], isGrace] and the key signatures
function offStr(q) { // q: an exact fraction with BigInt parts (js/omr/midi.js Q)
  if ((q.d & (q.d - 1n)) === 0n) { const v = Number(q.n) / Number(q.d); return Number.isInteger(v) ? v.toFixed(1) : String(v); }
  return q.n + '/' + q.d;
}
const CSO = { clef: 0, key: 2, time: 4, voice: 5, metronome: 1, dynamic: 10, note: 20, chord: 20, rest: 20 };
function view(score) {
  const I = M._internal;
  return score.parts.map((p) => {
    const notes = [], keys = [];
    for (const m of p.measures) {
      const items = m.items.map((e, i) => ({ e: e, kind: e.kind, offset: e.offset, grace: e.grace, i: i }));
      m.voices.forEach((v, j) => items.push({ v: v, kind: 'voice', offset: I.Q(0), grace: false, i: m.items.length + j }));
      items.sort((a, b) => I.qcmp(a.offset, b.offset) || (CSO[a.kind] - CSO[b.kind]) || ((a.grace ? 0 : 1) - (b.grace ? 0 : 1)) || a.i - b.i);
      const emit = (e) => {
        if (e.kind === 'note' || e.kind === 'chord') notes.push([m.number, offStr(e.offset), e.pitches.map((q) => [q.step, q.alter || 0, q.octave]), !!e.grace]);
        else if (e.kind === 'key') keys.push([m.number, offStr(e.offset), e.sharps]);
      };
      for (const it of items) {
        if (!it.v) { emit(it.e); continue; }
        const vi = it.v.items.map((e, i) => ({ e: e, kind: e.kind, offset: e.offset, grace: e.grace, i: i }))
          .sort((a, b) => I.qcmp(a.offset, b.offset) || (CSO[a.kind] - CSO[b.kind]) || ((a.grace ? 0 : 1) - (b.grace ? 0 : 1)) || a.i - b.i);
        for (const x of vi) emit(x.e);
      }
    }
    return { id: p.id, notes: notes, keys: keys };
  });
}
function sameView(js, py) {
  if (js.length !== py.length) return 'parts ' + js.length + ' vs ' + py.length;
  for (let k = 0; k < js.length; k++) {
    const a = js[k], b = py[k];
    if (a.id !== b.id) return 'part id ' + a.id + ' vs ' + b.id;
    if (a.notes.length !== b.notes.length) return a.id + ' notes ' + a.notes.length + ' vs ' + b.notes.length;
    for (let i = 0; i < a.notes.length; i++) if (JSON.stringify(a.notes[i]) !== JSON.stringify(b.notes[i])) return a.id + ' note ' + i + ': ' + JSON.stringify(a.notes[i]) + ' vs ' + JSON.stringify(b.notes[i]);
    if (JSON.stringify(a.keys) !== JSON.stringify(b.keys)) return a.id + ' keys ' + JSON.stringify(a.keys) + ' vs ' + JSON.stringify(b.keys);
  }
  return null;
}

// ---------------------------------------------------------------- the XML parser
{
  const src = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd" [ <!ENTITY x "y"> ]>\n' +
    "<a k='1' j=\"&lt;&amp;&#65;&#x42;\"><!-- c --><b>t&amp;u &unknown; &#233;</b><![CDATA[<raw>]]><c/><d x=\"1\"\n/></a>";
  const doc = X.parse(src);
  const a = doc.root;
  H.ok(a.name === 'a' && a.attrs.k === '1' && a.attrs.j === '<&AB', 'xml: attributes with both quotes and entities');
  H.ok(X.text(X.find(a, 'b')) === 't&u &unknown; é', 'xml: text entities (unknown ones kept)');
  H.ok(a.children[0].type === 'comment' && a.children[2].type === 'cdata' && X.findAll(a, 'c').length === 1 && X.find(a, 'd').attrs.x === '1',
    'xml: comments, CDATA, self-closing tags');
  H.ok(doc.children.some((n) => n.type === 'doctype') && doc.children[0].type === 'pi', 'xml: declaration and DOCTYPE with an internal subset');
  let threw = false;
  try { X.parse('just text'); } catch (e) { threw = true; }
  H.ok(threw, 'xml: no root element throws');
}

// ---------------------------------------------------------------- fixture-free checks of the second audit
// (the parity versions run on 13-midi-audit2.json; these guard the same behaviour without fixtures;
// the expected messages are expat's / music21's own output for these exact strings)
{
  const score = (title, dyn) => '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><work><work-title>' + title +
    '</work-title></work><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1"><measure number="1">' +
    '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>' +
    (dyn ? '<direction><direction-type><dynamics>' + dyn + '</dynamics></direction-type></direction>' : '') +
    '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>';
  const x = score('T', null);
  H.ok(Buffer.compare(Buffer.from(M.convert(x, { program: '24' }).midi), Buffer.from(M.convert(x, { program: 24 }).midi)) === 0 &&
    Buffer.compare(Buffer.from(M.convert(x, { program: '24' }).midi), Buffer.from(M.convert(x, { program: 0 }).midi)) !== 0,
  'convert: program "24" = 24 (a string of digits is a program number, not a GM name)');
  let n = 0;
  for (const t of [1.5, 'x', NaN, Infinity]) { try { M.transposeMusicXml(x, t); } catch (e) { if (e instanceof RangeError) n++; } }
  H.ok(n === 4 && /<step>D<\/step>/.test(M.transposeMusicXml(x, '2')), 'transposeMusicXml: non-whole transposes refused like convert');
  const ctl = score('Seite\u000c1', null);
  let pe = null;
  try { M.convert(ctl, { strict: true }); } catch (e) { pe = e; }
  const lw = M.convert(ctl, {});
  H.ok(pe && pe.name === 'ParseError' && pe.message === 'not well-formed (invalid token): line 2, column 53' && X.charError(x) === null &&
    lw.warnings.some((w) => w.indexOf(pe.message) >= 0), 'convert: a control character in <work-title> = expat\'s ParseError (strict) / a warning');
  H.ok(X.charError('<a>\n<!-- &#1; -->&#x41;\u{1F600}\u0001</a>') === 'not well-formed (invalid token): line 2, column 20' &&
    X.charError('<a b="x&#xFFFE;"/>') === 'reference to invalid character number: line 1, column 7', 'charError: positions in code points, no references inside comments');
  let ie = 0;
  for (const st of [true, false]) { try { M.convert(score('T', '<s />'), { strict: st }); } catch (e) { if (e.name === 'IndexError') ie++; } }
  H.ok(ie === 2 && M.convert(score('T', '<other-dynamic />'), {}).midi.length > 14,
    'dynamics: <s/> raises IndexError like music21\'s volumeScalar; an empty <other-dynamic/> is 0.5');
}

// ---------------------------------------------------------------- GM table == the engine's
{
  const eng = path.join(H.FIX, '..', 'tools', 'sheetlab_engine.py');
  if (fs.existsSync(eng)) {
    const src = fs.readFileSync(eng, 'utf8');
    const block = src.slice(src.indexOf('GM_INSTRUMENTS'), src.indexOf('}', src.indexOf('GM_INSTRUMENTS')));
    const py = {};
    for (const m of block.matchAll(/"([^"]+)":\s*(\d+)/g)) py[m[1]] = +m[2];
    H.ok(Object.keys(py).length === 29 && JSON.stringify(py) === JSON.stringify(M.GM_INSTRUMENTS), 'GM_INSTRUMENTS = the engine\'s 29 programs');
  } else H.skip('(no tools/sheetlab_engine.py next to the fixtures) GM table');
}

// ---------------------------------------------------------------- reference cases
function runFile(file, label) {
  const ref = JSON.parse(fs.readFileSync(file, 'utf8'));
  const st = { bytes: 0, cases: 0, errors: 0, errorsOk: 0, deviation: 0, deviationOk: 0, summary: 0, summaryOk: 0, reader: 0, readerOk: 0, fails: [] };
  // inputs round-trip through the parser/serializer unchanged (ElementTree's output style)
  let rt = 0;
  let notWf = 0;
  for (const k of Object.keys(ref.inputs)) {
    const x = ref.inputs[k];
    if (X.charError(x)) { notWf++; continue; } // not well-formed XML (a control character in the title): nothing to keep
    const body = x.replace(/^<\?xml[^>]*\?>\n?/, '');
    if (X.serialize(X.parse(x)).replace(/^<\?xml[^>]*\?>\n?/, '') === body) rt++;
  }
  H.ok(rt + notWf === Object.keys(ref.inputs).length, label + ': ' + rt + '/' + (Object.keys(ref.inputs).length - notWf) + ' inputs parse + serialize back to the same text' + (notWf ? ' (' + notWf + ' not well-formed XML left out)' : ''));
  for (const c of ref.cases) {
    if (c.error && (c.error.stage === 'mxl' || c.error.stage === 'musicxml')) continue; // the engine stopped at its music21 MusicXML export
    st.cases++;
    const opts = { tempo: c.tempo, program: c.program, transpose: c.transpose, title: c.title };
    const tag = c.input + ' t' + c.tempo + ' p' + c.program + ' tr' + c.transpose + (c.exports === false ? ' midi-only' : '') + (c.lenient ? ' lenient' : '');
    if (c.lenient) opts.strict = false; // the reference = music21 translating the score unexpanded (midi_ref.py _Lenient)
    if (c.error) {
      st.errors++;
      let err = null;
      try { M.convert(ref.inputs[c.input], Object.assign({ strict: true }, opts)); } catch (e) { err = e; }
      const same = err && err.name === c.error.type && err.message === c.error.message;
      if (c.error.type === 'ParseError') { // a character XML forbids: the engine's parse fails; the default still makes the MIDI and says why
        let r2 = null;
        try { r2 = M.convert(ref.inputs[c.input], opts); } catch (e) { /* r2 stays null */ }
        if (same && r2 && r2.midi.length > 14 && r2.warnings.some((w) => w.indexOf(c.error.message) >= 0)) st.errorsOk++;
        else st.fails.push(tag + ': ParseError ' + (err && err.name + ' ' + err.message) + ' vs ' + c.error.message);
        continue;
      }
      if (c.error.type !== 'ExpanderException') { // e.g. a tempo of 0: no MIDI in either mode
        let err2 = null;
        try { M.convert(ref.inputs[c.input], opts); } catch (e) { err2 = e; }
        if (same && err2 && err2.name === err.name && err2.message === err.message) st.errorsOk++;
        else st.fails.push(tag + ': error ' + (err && err.name + ' ' + err.message) + ' vs ' + c.error.type + ' ' + c.error.message);
        continue;
      }
      const lenient = M.convert(ref.inputs[c.input], opts);
      if (same && !lenient.repeatsExpanded &&
        lenient.warnings[0] === 'repeats not expanded: ' + c.error.message && M.readSmf(lenient.midi).tracks.length > 1) st.errorsOk++;
      else st.fails.push(tag + ': error ' + (err && err.name + ' ' + err.message) + ' vs ' + c.error.type);
      continue;
    }
    const r = M.convert(ref.inputs[c.input], opts);
    if (c.lenient) { // repeatsExpanded says whether music21 could expand them (strict throws exactly when it cannot)
      let ex = false;
      try { M.convert(ref.inputs[c.input], Object.assign({}, opts, { strict: true })); } catch (e) { ex = e.name === 'ExpanderException'; }
      st.lenient = (st.lenient || 0) + 1;
      if (r.repeatsExpanded === !ex) st.lenientOk = (st.lenientOk || 0) + 1;
      if (ex) st.unexpanded = (st.unexpanded || 0) + 1;
    }
    if (c.midi && c.midi.unreadable && c.midi.bytes === 14) {
      // the engine's file is a 14-byte header (mido could not encode the title in latin-1); ours
      // is the same MIDI as with a latin-1 title, with the title as UTF-8
      st.deviation++;
      const other = M.convert(ref.inputs[c.input], Object.assign({}, opts, { title: 'Für Elise' }));
      const a = events(M.readSmf(r.midi)), b = events(M.readSmf(other.midi));
      const nameA = Buffer.from(a[0][1][2], 'base64').toString('utf8');
      a[0][1] = b[0][1] = null;
      if (c.midi.bytes === 14 && nameA === c.title && JSON.stringify(a) === JSON.stringify(b) && r.warnings.some((w) => /UTF-8/.test(w))) st.deviationOk++;
      else st.fails.push(tag + ': title deviation');
      continue;
    }
    if (b64(r.midi) === c.mid) st.bytes++;
    else st.fails.push(tag + ': ' + (c.midi.tracks ? firstDiff(events(M.readSmf(r.midi)), c.midi.tracks) : 'bytes differ'));
    if (c.midi.unreadable) { // mido cannot read it either (a key of 8 sharps): the engine kept music21's raw file
      st.raw = (st.raw || 0) + 1;
      if (!r.polished && r.warnings.some((w) => /music21/.test(w))) st.rawOk = (st.rawOk || 0) + 1;
      continue;
    }
    // SMF reader vs mido on the reference file
    st.reader++;
    const smf = M.readSmf(Buffer.from(c.mid, 'base64'));
    if (JSON.stringify(events(smf)) === JSON.stringify(c.midi.tracks) && smf.ticksPerBeat === c.midi.ticks_per_beat) st.readerOk++;
    if (c.summary && !c.summary.error) {
      st.summary++;
      const s = r.summary;
      if (s.measures === c.summary.measures && s.notes === c.summary.notes && s.chords === c.summary.chords &&
        H.near(s.durationSeconds, c.summary.duration_seconds, 1e-9)) st.summaryOk++;
      else st.fails.push(tag + ': summary ' + JSON.stringify([s.measures, s.notes, s.chords, s.durationSeconds]) + ' vs ' + JSON.stringify(c.summary));
    }
  }
  H.ok(st.bytes === st.cases - st.errors - st.deviation, label + ': ' + st.bytes + '/' + (st.cases - st.errors - st.deviation) + ' MIDI files byte-identical to the engine\'s');
  if (st.errors) H.ok(st.errorsOk === st.errors, label + ': ' + st.errorsOk + '/' + st.errors + ' engine errors reproduced (badly formed repeats: strict throws like music21, the default plays them unexpanded)');
  if (st.lenient) H.ok(st.lenientOk === st.lenient && st.unexpanded > 0, label + ': default mode on scores with repeats: ' + (st.lenientOk || 0) + '/' + st.lenient + ' report repeatsExpanded right (' + (st.unexpanded || 0) + ' badly formed, played unexpanded = music21 with expansion skipped, byte for byte)');
  if (st.raw) H.ok(st.rawOk === st.raw, label + ': ' + (st.rawOk || 0) + '/' + st.raw + ' files mido cannot read stay unpolished, like the engine\'s');
  if (st.deviation) H.ok(st.deviationOk === st.deviation, label + ': ' + st.deviationOk + '/' + st.deviation + ' non-latin-1 titles: UTF-8 title instead of the engine\'s truncated file');
  H.ok(st.readerOk === st.reader, label + ': readSmf reads ' + st.readerOk + '/' + st.reader + ' engine files like mido');
  if (st.summary) H.ok(st.summaryOk === st.summary, label + ': summary (measures, notes, chords, seconds) ' + st.summaryOk + '/' + st.summary);
  // transposed MusicXML: music21's spellings and key signatures
  let sv = 0, svOk = 0, xmlOk = 0, xmlN = 0;
  for (const key of Object.keys(ref.scores)) {
    const sc = ref.scores[key];
    const cut = key.lastIndexOf('|'), inp = key.slice(0, cut), tr = key.slice(cut + 1);
    if (!sc.parts) { // music21 could not even parse/transpose it: nothing to compare
      st.fails.push(label + ' ' + key + ': no music21 view (' + sc.error.type + ')');
      continue;
    }
    sv++;
    const tx = M.transposeMusicXml(ref.inputs[inp], +tr);
    const why = sameView(view(M.importScore(tx)), sc.parts);
    if (!why) svOk++; else st.fails.push(key + ': ' + why);
    if (+tr === 0) { xmlN++; if (tx === X.serialize(X.parse(ref.inputs[inp]))) xmlOk++; }
  }
  H.ok(svOk === sv, label + ': transposed MusicXML has music21\'s spellings + key signatures in ' + svOk + '/' + sv + ' scores');
  if (xmlN) H.ok(xmlOk === xmlN, label + ': transpose 0 leaves the MusicXML as it is');
  for (const f of st.fails.slice(0, 8)) console.log('  ' + f);
  return st;
}

const pages = H.pages().filter((p) => H.has(p, '13-midi-ref.json'));
if (!pages.length) H.skip('(no 13-midi-ref.json fixtures): run python -I tools/omr/midi_ref.py $SL_OMR_FIXTURES');
for (const p of pages) runFile(H.fix(p, '13-midi-ref.json'), p);
for (const [f, label] of [['13-midi-synthetic.json', 'synthetic'], ['13-midi-edge.json', 'edge'], ['13-midi-audit.json', 'audit'], ['13-midi-audit2.json', 'audit2']]) {
  const file = path.join(H.FIX, f);
  if (fs.existsSync(file)) runFile(file, label);
  else H.skip('(no ' + f + ')');
}

// ---------------------------------------------------------------- the engine's own outputs
// $OMR/sheetlab-ref: the SheetLab engine run end to end on the PDFs (multi-page, merged voices);
// its .musicxml is the homr XML step 4 parsed (transpose 0), its .mid what step 4 made of it
{
  const R = path.join(H.FIX, '..', 'sheetlab-ref');
  if (fs.existsSync(path.join(R, 'summary.json'))) {
    const sum = JSON.parse(fs.readFileSync(path.join(R, 'summary.json'), 'utf8'));
    for (const pdf of Object.keys(sum)) {
      const rec = sum[pdf], stem = pdf.replace(/\.pdf$/, '');
      if (!fs.existsSync(path.join(R, stem + '.musicxml'))) continue;
      const x = fs.readFileSync(path.join(R, stem + '.musicxml'), 'utf8');
      if (!rec.success) {
        let err = null;
        try { M.convert(x, { tempo: 112, program: 0, title: rec.title, strict: true }); } catch (e) { err = e; }
        H.ok(err && rec.error === err.name + ': ' + err.message, 'sheetlab-ref ' + stem + ': fails like the engine (' + rec.error.slice(0, 60) + ')');
        continue;
      }
      const r = M.convert(x, { tempo: 112, program: 0, title: rec.title });
      H.ok(Buffer.compare(Buffer.from(r.midi), fs.readFileSync(path.join(R, stem + '.mid'))) === 0,
        'sheetlab-ref ' + stem + ': .mid byte-identical to the engine\'s end-to-end run (' + r.midi.length + ' bytes)');
    }
  } else H.skip('(no sheetlab-ref next to the fixtures) end-to-end engine outputs');
}

// ---------------------------------------------------------------- music21's numbers (audit)
// float(Fraction) of huge fractions, common.opFrac(float) = limit_denominator(65535) and
// nearestMultiple(n, unit)[1] < 1e-6, against music21 itself (13-midi-audit.json "numeric")
{
  const file = path.join(H.FIX, '13-midi-audit.json');
  if (fs.existsSync(file)) {
    const num = JSON.parse(fs.readFileSync(file, 'utf8')).numeric;
    const I = M._internal;
    const hex = (h) => { // float.hex() -> double
      const m = /^(-?)0x([01])\.([0-9a-f]*)p([+-]\d+)$/.exec(h);
      if (!m) return h === '0x0.0p+0' ? 0 : NaN;
      return (m[1] ? -1 : 1) * (parseInt(m[2] + m[3], 16) / Math.pow(16, m[3].length)) * Math.pow(2, +m[4]);
    };
    let ok1 = 0, ok2 = 0, ok3 = 0;
    for (const [n, d, f] of num.fractions) if (Object.is(I.qnum(I.Q(BigInt(n), BigInt(d))), hex(f))) ok1++;
    for (const [x, n, d] of num.floats) { const q = I.opFracF(hex(x)); if (q.n === BigInt(n) && q.d === BigInt(d)) ok2++; }
    for (const [n, d, u, close] of num.nearest_multiple) if (I.nearestMultipleClose(I.pv(I.Q(BigInt(n), BigInt(d))), hex(u)) === close) ok3++;
    H.ok(ok1 === num.fractions.length, 'numbers: float(Fraction) correctly rounded like Python in ' + ok1 + '/' + num.fractions.length);
    H.ok(ok2 === num.floats.length, 'numbers: common.opFrac(float) like music21 in ' + ok2 + '/' + num.floats.length);
    H.ok(ok3 === num.nearest_multiple.length, 'numbers: nearestMultiple(n, 1/16 | 1/12)[1] < 1e-6 like music21 in ' + ok3 + '/' + num.nearest_multiple.length);
  } else H.skip('(no 13-midi-audit.json) music21 number checks');
}

// ---------------------------------------------------------------- second audit: tables (13-midi-audit2.json)
// Stream.transpose(n) of all 15 key signatures for n = -24..24 and of spelled pitches (incl. double
// accidentals, octaves 0-9, MIDI folding above 127), and expat's error for characters XML 1.0
// forbids (a PDF title in <work-title> can carry them; the engine's music21 parse then fails)
{
  const file = path.join(H.FIX, '13-midi-audit2.json');
  if (fs.existsSync(file)) {
    const a2 = JSON.parse(fs.readFileSync(file, 'utf8'));
    const I = M._internal;
    let k1 = 0, k2 = 0, k3 = 0;
    for (const [k, n, sharps] of a2.keys) if (I.transposeSharps(k, n) === sharps) k1++;
    for (const [step, alt, oct, n, s2, a2_, o2, midi] of a2.pitches) {
      const q = I.spellPs(I.pitchPs({ step: step, alter: alt, octave: oct }) + n);
      if (q.step === s2 && (q.alter || 0) === (a2_ || 0) && (q.alter === null) === (a2_ === null || a2_ === 0) && q.octave === o2 && I.pitchMidi(q) === midi) k2++;
    }
    for (const [x, msg] of a2.chars) if (X.charError(x) === msg) k3++;
    H.ok(k1 === a2.keys.length, 'audit2: key signatures transposed like Stream.transpose in ' + k1 + '/' + a2.keys.length + ' (15 keys x -24..24)');
    H.ok(k2 === a2.pitches.length, 'audit2: pitches transposed (spelling, octave, MIDI number) like music21 in ' + k2 + '/' + a2.pitches.length);
    H.ok(k3 === a2.chars.length, 'audit2: OMR.xml.charError = expat\'s error (or none) in ' + k3 + '/' + a2.chars.length + ' texts');
  } else H.skip('(no 13-midi-audit2.json: python -I tools/omr/midi_ref.py --audit2 $SL_OMR_FIXTURES) second audit tables');
}

// ---------------------------------------------------------------- API
if (pages.length) {
  const ref = JSON.parse(fs.readFileSync(H.fix(pages[0], '13-midi-ref.json'), 'utf8'));
  const xml = ref.inputs.fixture;
  const c = ref.cases.find((x) => x.input === 'fixture' && x.tempo === 112 && x.program === 24 && x.transpose === 0);
  const warned = [];
  const a = M.fromMusicXml(xml, { tempo: 112, program: 'Acoustic Guitar (Nylon)', title: c.title, onWarning: (w) => warned.push(w) });
  H.ok(a instanceof Uint8Array && b64(a) === c.mid && !warned.length, 'fromMusicXml: GM instrument by name, Uint8Array');
  const d = M.convert(xml, { title: c.title });
  const c0 = ref.cases.find((x) => x.input === 'fixture' && x.tempo === 112 && x.program === 0 && x.transpose === 0 && x.title === c.title);
  H.ok(b64(d.midi) === c0.mid && d.polished && d.repeatsExpanded, 'convert defaults = the engine\'s TranslationOptions (112 bpm, piano, no transpose)');
  const s = M.summary(xml, { tempo: 80 });
  H.ok(s.noteEvents.length > 0 && s.noteEvents.every((e) => e.durationBeats >= 0 && e.pitchName && e.partIndex >= 0), 'summary: note events (pitch, start/duration in beats, part)');
  // options given as undefined / null take the engine's defaults (an undefined tempo used to write
  // a set_tempo of 0 and give a NaN length); GM_INSTRUMENTS.get(name, 0) never reads inherited keys
  const u = M.convert(xml, { title: c.title, tempo: undefined, program: null, transpose: undefined });
  H.ok(b64(u.midi) === c0.mid && Number.isFinite(u.summary.durationSeconds), 'convert: undefined / null options = the defaults');
  const proto = M.convert(xml, { title: c.title, program: 'constructor' });
  H.ok(b64(proto.midi) === c0.mid, 'convert: an unknown instrument name (even "constructor") is program 0, like dict.get');
  let bad = 0;
  for (const o of [{ program: 128 }, { program: -1 }, { program: 2.5 }, { tempo: NaN }, { tempo: 'fast' }, { transpose: 1.5 }]) {
    try { M.convert(xml, o); } catch (e) { if (e instanceof RangeError || e instanceof TypeError) bad++; }
  }
  H.ok(bad === 6, 'convert: a program outside 0..127, a non-numeric tempo or a fractional transpose is refused (' + bad + '/6), never a corrupt file');
  // a program number given as a string (a <select> value) used to be looked up as a GM NAME and
  // silently become the piano
  const c24 = ref.cases.find((x) => x.input === 'fixture' && x.tempo === 112 && x.program === 24 && x.transpose === 0 && x.title === c.title);
  H.ok(b64(M.convert(xml, { title: c.title, program: '24' }).midi) === c24.mid && b64(M.convert(xml, { title: c.title, program: ' 24 ' }).midi) === c24.mid,
    'convert: program "24" (a string of digits) is program 24, not an unknown name');
  // transposeMusicXml follows convert's whole-number rule (it truncated 1.5 to 1 while convert refused it)
  let txBad = 0;
  for (const n of [1.5, 'x', NaN]) { try { M.transposeMusicXml(xml, n); } catch (e) { if (e instanceof RangeError) txBad++; } }
  H.ok(txBad === 3 && M.transposeMusicXml(xml, '2') === M.transposeMusicXml(xml, 2) && M.transposeMusicXml(xml, null) === M.transposeMusicXml(xml, 0),
    'transposeMusicXml: a fractional / non-numeric transpose is refused like convert; "2" = 2, null = 0');
  // a forbidden character: strict = the engine's error, the default makes the MIDI and warns
  const ctl = xml.replace(/<work-title>[^<]*<\/work-title>|<work-title \/>/, '<work-title>Seite\u000c1</work-title>');
  let pe = null;
  try { M.convert(ctl, { strict: true }); } catch (e) { pe = e; }
  const lw = ctl === xml ? null : M.convert(ctl, {});
  H.ok(ctl !== xml && pe && pe.name === 'ParseError' && /^not well-formed \(invalid token\): line \d+, column \d+$/.test(pe.message) &&
    lw && lw.warnings.some((w) => w.indexOf(pe.message) >= 0) && lw.midi.length > 14, 'convert: a control character in the title: strict ParseError like music21, default MIDI + warning');
}

// ---------------------------------------------------------------- .mxl (js/omr/mxl.js)
(async () => {
  const Z = OMR.mxl;
  H.ok(Z.crc32(new TextEncoder().encode('123456789')) === 0xcbf43926, 'mxl: CRC-32 check value');
  const xml = pages.length ? JSON.parse(fs.readFileSync(H.fix(pages[0], '13-midi-ref.json'), 'utf8')).inputs.fixture
    : '<?xml version="1.0"?><score-partwise version="4.0"><part-list /></score-partwise>';
  const date = new Date(2026, 9, 28, 12, 0, 0);
  const a = await Z.write(xml, 'Für Elise.musicxml', { date: date });
  const ra = await Z.read(a);
  const dv = new DataView(a.buffer, a.byteOffset);
  H.ok(ra.xml === xml && ra.rootfile === 'Für Elise.musicxml' && Object.keys(ra.files).join() === 'Für Elise.musicxml,META-INF/container.xml' &&
    dv.getUint16(8, true) === 8 && (xml.length < 10000 || a.length < xml.length / 4), 'mxl: deflated zip, score first then META-INF/container.xml, reads back (' + a.length + ' bytes)');
  // container.xml escapes the name; read() must unescape it (it used to look the score up as
  // "A &amp; B ..." and return no XML)
  const amp = await Z.read(await Z.write(xml, 'A & B "x" <y>.musicxml', { date: date }));
  H.ok(amp.rootfile === 'A & B "x" <y>.musicxml' && amp.xml === xml, 'mxl: a name with & " < reads back (escaped in container.xml)');
  const b = Z.writeStored(xml, 'score.musicxml', { date: date });
  const rb = await Z.read(b);
  H.ok(rb.xml === xml && new DataView(b.buffer).getUint16(8, true) === 0, 'mxl: stored zip (sync)');
  const cs = globalThis.CompressionStream;
  delete globalThis.CompressionStream;
  const c = await Z.write(xml, 'score.musicxml', { date: date });
  globalThis.CompressionStream = cs;
  H.ok(Buffer.compare(Buffer.from(c), Buffer.from(b)) === 0, 'mxl: without CompressionStream the entries are stored');
  const ref = path.join(H.FIX, '..', 'sheetlab-ref', 'belle-let.mxl');
  if (fs.existsSync(ref)) {
    const r = await Z.read(fs.readFileSync(ref));
    H.ok(r.rootfile === 'belle-let_out.musicxml' && /<score-partwise/.test(r.xml) &&
      new TextDecoder().decode(r.files['META-INF/container.xml']) === Z.containerXml('belle-let_out.musicxml'),
    'mxl: reads the engine\'s music21 .mxl; container.xml text identical to music21\'s');
  } else H.skip('(no sheetlab-ref/belle-let.mxl) music21 container check');
  // Python's zipfile and music21 open what we write (SL_OMR_PYTHON = a python with music21)
  const py = process.env.SL_OMR_PYTHON;
  if (py) {
    const os = require('os'), cp = require('child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omr-mxl-'));
    fs.writeFileSync(path.join(dir, 'a.mxl'), a); fs.writeFileSync(path.join(dir, 'b.mxl'), b);
    fs.writeFileSync(path.join(dir, 'x.musicxml'), xml);
    const code = 'import sys, zipfile, music21\n' +
      'out = []\n' +
      'for f in sys.argv[1:3]:\n' +
      '    z = zipfile.ZipFile(f); assert z.testzip() is None\n' +
      '    out.append(len(music21.converter.parse(f).recurse().notes))\n' +
      'out.append(len(music21.converter.parse(sys.argv[3]).recurse().notes))\n' +
      'print(out)\n';
    const res = cp.spawnSync(py, ['-I', '-c', code, path.join(dir, 'a.mxl'), path.join(dir, 'b.mxl'), path.join(dir, 'x.musicxml')], { encoding: 'utf8' });
    const m = /\[(\d+), (\d+), (\d+)\]/.exec(res.stdout || '');
    H.ok(m && m[1] === m[3] && m[2] === m[3], 'mxl: Python zipfile.testzip() passes and music21 parses both zips like the plain MusicXML (' + (m ? m[3] : res.stderr.slice(-200)) + ' notes)');
    fs.rmSync(dir, { recursive: true, force: true });
  } else H.skip('(SL_OMR_PYTHON unset) Python zipfile + music21 check of the written .mxl');
  H.done();
})().catch((e) => { console.log('FAIL exception ' + (e && e.stack || e)); process.exit(1); });
