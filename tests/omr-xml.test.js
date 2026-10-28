// OMR engine: MusicXML generation (js/omr/music_xml_generator.js) against homr:
// the fixture pages' voices -> generate_xml -> the file Python writes (11-score.musicxml),
// argument / title variants and synthetic token sequences (tools/omr/dump_lang.py), and the
// ElementTree serializer on its own.
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./omr/harness');
// only the files the symbol language needs (np.js + its own modules, simple_logging.js and
// constants.js when written), in manifest order: the other engine files are not its business
function loadLanguage(upTo) {
  const wanted = ['np.js', 'simple_logging.js', 'constants.js', 'transformer_vocabulary.js', 'transformer_configs.js',
    'circle_of_fifths.js', 'triplet_restoration.js', 'music_xml_generator.js'];
  require(path.join(H.ROOT, 'js', 'omr', 'manifest.js'));
  for (const f of globalThis.OMR.FILES) {
    if (!wanted.includes(f)) continue;
    const p = path.join(H.ROOT, 'js', 'omr', f);
    if (fs.existsSync(p)) require(p);
    if (f === upTo) break;
  }
  return globalThis.OMR;
}
const OMR = loadLanguage('music_xml_generator.js');
const V = OMR.transformer_vocabulary, MX = OMR.music_xml_generator;
const Fraction = V.Fraction;
const ES = V.EncodedSymbol;

if (!OMR.constants) {
  H.ok(false, 'OMR.constants is loaded (js/omr/constants.js: ConversionState reads duration_of_quarter from it)');
  H.done();
}

const sym = (s) => ES.fromString(s);
const withIc = ([s, ic]) => { const x = sym(s); x.imageCoordinates = ic; return x; };
const args = (a) => new MX.XmlGeneratorArguments(a[0], a[1], a[2]);
// first differing position, for a readable FAIL line
function diffAt(a, b) {
  if (a === b) return '';
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return ' first difference at ' + i + ':\n   want ' + JSON.stringify(b.slice(Math.max(0, i - 80), i + 80)) + '\n   got  ' + JSON.stringify(a.slice(Math.max(0, i - 80), i + 80));
}
function generate(a, voices, title) {
  try { const root = MX.generateXml(a, voices, title); return { root }; } catch (e) { return { error: e.name, message: e.message, stack: e.stack }; }
}

// ---- the fixture pages: voices from 10-tokens.json (+ image coordinates) -> 11-score.musicxml
const pages = H.pages().filter((p) => H.has(p, '11-score.musicxml') && H.has(p, '10-tokens.json'));
if (!pages.length) H.skip('pages (no 10-tokens.json / 11-score.musicxml fixtures)');
for (const page of pages) {
  const tokens = H.readJson(H.fix(page, '10-tokens.json'));
  const fileBytes = fs.readFileSync(H.fix(page, '11-score.musicxml'));
  const want = fileBytes.toString('utf8');
  let voices;
  if (H.has(page, '12-lang-voices.json')) {
    // the strings alone lose the imgpos comments: take the coordinates from the same run
    const info = H.readJson(H.fix(page, '12-lang-voices.json'));
    const match = JSON.stringify(info.voices.map((v) => v.map(([s]) => s))) === JSON.stringify(tokens.voices);
    H.ok(match, page + ' 12-lang-voices strings = 10-tokens.json voices');
    voices = tokens.voices.map((v, i) => v.map((s, j) => withIc([s, info.voices[i][j][1]])));
  } else {
    H.skip(page + ' no 12-lang-voices.json: comparing without imgpos comments');
    voices = tokens.voices.map((v) => v.map(sym));
  }
  const g = generate(args([false, null, null]), voices, '');
  if (g.error) { H.ok(false, page + ' generate_xml threw ' + g.stack); continue; }
  const got = MX.toXmlString(g.root);
  const ref = H.has(page, '12-lang-voices.json') ? want : want.replace(/<!-- imgpos: [^>]*-->/g, '');
  H.ok(got === ref, page + ' generate_xml -> toXmlString = 11-score.musicxml (' + want.length + ' chars)' + diffAt(got, ref));
  H.ok(Buffer.compare(Buffer.from(MX.toBytes(g.root)), fileBytes) === 0 || !H.has(page, '12-lang-voices.json'), page + ' toBytes = the file\'s bytes');

  // argument / title variants (and the shipping models' voices when dumped)
  for (const prefix of ['12-lang-', '12-lang-ship-']) {
    if (!H.has(page, prefix + 'xml.json') || !H.has(page, prefix + 'voices.json')) continue;
    const label = page + (prefix === '12-lang-ship-' ? ' [ship]' : '');
    const vs = H.readJson(H.fix(page, prefix + 'voices.json')).voices;
    const cases = H.readJson(H.fix(page, prefix + 'xml.json'));
    let good = 0, first = '';
    for (const c of cases) {
      const r = generate(args(c.args), vs.map((v) => v.map(withIc)), c.title);
      let ok;
      if (c.error) ok = r.error === c.error;
      else ok = !r.error && MX.toXmlString(r.root) === c.write && MX.xmlToString(r.root) === c.tostring;
      if (ok) good++;
      else if (!first) first = ' first bad: ' + JSON.stringify(c.args) + ' ' + JSON.stringify(c.title) + (r.error ? ' threw ' + r.stack : diffAt(MX.toXmlString(r.root), c.write || ''));
    }
    H.ok(good === cases.length, label + ' XmlGeneratorArguments(large_page, metronome, tempo) / title variants ' + good + '/' + cases.length + ' exact (write + tostring)' + first);
  }
}

// ---- synthetic: random / triplet / edge / merged sequences through generate_xml
const synPath = path.join(H.FIX, '12-lang-synthetic.json');
if (!fs.existsSync(synPath)) {
  H.skip('synthetic (no ' + synPath + ')');
} else {
  const syn = H.readJson(synPath);
  const byKind = {};
  for (const c of syn.sequences) {
    const k = c.kind + (c.xml.error ? ' (' + c.xml.error + ')' : '');
    const b = byKind[k] = byKind[k] || { n: 0, good: 0, first: '' };
    b.n++;
    const [a, title] = syn.xml_variants[c.xml.variant];
    // parts as [str(symbol), image_coordinates]: the merged pages carry imgpos comments
    const r = generate(args(a), c.xml.parts.map((p) => p.map(withIc)), title);
    let ok;
    if (c.xml.error) ok = r.error === c.xml.error && r.message === c.xml.message;
    else ok = !r.error && MX.toXmlString(r.root) === c.xml.write;
    if (ok) b.good++;
    else if (!b.first) b.first = r.error ? ' threw ' + r.stack : diffAt(MX.toXmlString(r.root), c.xml.write);
  }
  for (const k of Object.keys(byKind)) {
    const b = byKind[k];
    H.ok(b.good === b.n, 'synthetic ' + k + ' sequences -> generate_xml ' + b.good + '/' + b.n + ' exact' + b.first);
  }
  const hx = syn.xml_helpers;
  const frac = (s) => { const [n, d] = s.split('/'); return new Fraction(+n, d === undefined ? 1 : +d); };
  H.ok(hx.find_common_division.every(([d, r]) => MX.findCommonDivision(d.map(frac)) === r), 'find_common_division ' + hx.find_common_division.length + ' cases');
  H.ok(hx.get_xml_voice.every(([s, l, r]) => MX.getXmlVoice(s, l) === r), 'get_xml_voice');
  H.ok(hx.part_metadata.every(([b, r]) => JSON.stringify(MX._partMetadata(b)) === JSON.stringify(r)), '_part_metadata');

  // the ElementTree serializer: trees described as JSON, built the same way Python built them
  function build(d) {
    let e;
    if ('comment' in d) e = MX.ET.Comment(d.comment);
    else if ('pi' in d) e = MX.ET.ProcessingInstruction(d.pi[0], d.pi[1]);
    else {
      e = new MX.Element(d.tag, Object.fromEntries(d.attrib || []));
      if ('text' in d) e.text = d.text;
      for (const c of d.children || []) e.append(build(c));
    }
    if ('tail' in d) e.tail = d.tail;
    return e;
  }
  let etGood = 0, etFirst = '';
  for (const c of hx.et) {
    const root = build(c.tree);
    const bytes = Buffer.from(MX.toBytes(root));
    const ok = MX.xmlToString(root) === c.tostring && Buffer.compare(bytes, Buffer.from(c.write_bytes)) === 0;
    if (ok) etGood++;
    else if (!etFirst) etFirst = diffAt(MX.xmlToString(root), c.tostring) + diffAt(bytes.toString('latin1'), Buffer.from(c.write_bytes).toString('latin1'));
  }
  H.ok(etGood === hx.et.length, 'ElementTree serializer (escaping, empty elements, comments, PI, tail, UTF-8, lone surrogate) ' + etGood + '/' + hx.et.length + etFirst);
}

// ---- audit regressions (tools/omr/dump_lang.py --audit): inputs the page recordings never reach
// a voice of the audit fixture: [str, image_coordinates] pairs, or {s, ic} / {alias: i} (the same object again)
function auditVoice(entries) {
  const out = [];
  for (const e of entries) {
    if (!Array.isArray(e) && 'alias' in e) { out.push(out[e.alias]); continue; }
    const [s, ic] = Array.isArray(e) ? e : [e.s, e.ic];
    const x = sym(s);
    if (ic !== null) x.imageCoordinates = ic.slice();
    out.push(x);
  }
  return out;
}
const T = OMR.triplet_restoration;
const errOf = (fn) => { try { fn(); return null; } catch (e) { return { error: e.name, message: e.message }; } };
const auditPath = path.join(H.FIX, '12-lang-audit.json');
if (!fs.existsSync(auditPath)) {
  H.skip('audit regressions (no ' + auditPath + ': run tools/omr/dump_lang.py --audit)');
} else {
  const au = H.readJson(auditPath);
  // _clean_up_voice per voice, then generate_xml: ET.tostring (toXmlString is the declaration + it)
  function pipeline(c) {
    let cleaned;
    try { cleaned = c.voices.map((v) => T.restoreUnmarkedTriplets(V.removeDuplicatedSymbols(auditVoice(v)))); } catch (e) { return { clean: e.name }; }
    const r = generate(args(c.args), cleaned, c.title);
    return r.error ? { error: r.error, message: r.message } : MX.xmlToString(r.root);
  }
  const want = (c) => (c.clean.error ? { clean: c.clean.error } : c.tostring.error ? { error: c.tostring.error, message: c.tostring.message } : c.tostring);
  function report(label, cases) {
    let good = 0, first = '';
    for (const c of cases) {
      const got = pipeline(c), w = want(c);
      if (JSON.stringify(got) === JSON.stringify(w)) good++;
      else if (!first) first = typeof got === 'string' && typeof w === 'string' ? diffAt(got, w) : ' got ' + JSON.stringify(got).slice(0, 300) + ' want ' + JSON.stringify(w).slice(0, 300);
    }
    H.ok(good === cases.length, label + ' ' + good + '/' + cases.length + ' exact' + first);
  }
  report('audit: exotic tuplets (sums past 2^53 in comparisons) -> generate_xml', au.tuplets);
  report('audit: random voices (any vocabulary symbol, aliased objects, image coordinates) -> generate_xml', au.fuzz.filter((c) => c.kind === 'random'));
  report('audit: triplet-heavy voices -> generate_xml', au.fuzz.filter((c) => c.kind === 'triplets'));
  const fr = (s) => { const [n, d] = s.split('/'); return new Fraction(+n, d === undefined ? 1 : +d); };
  H.ok(errOf(() => { if (!au.fraction_ops.every(([a, b, , , , med]) => String(MX.medianFraction([fr(a), fr(b)])) === med)) throw new Error('differs'); }) === null, 'audit: medianFraction = np.median on big sums');
  // imgpos comments: round() raises on NaN / infinities, prints every digit of a huge value; x, y unpack two values
  const num = (r) => (r === 'nan' ? NaN : r === 'inf' ? Infinity : r === '-inf' ? -Infinity : Number(r));
  let bad = null, good = 0;
  for (const c of au.imgpos) {
    const s = sym('note_4 C4 _ _ _ upper');
    s.imageCoordinates = c.in.map(num);
    const e = new MX.Element('note');
    const err = errOf(() => MX.buildImagePosition(e, s));
    const ok = c.error ? err && err.error === c.error && err.message === c.message : !err && MX.xmlToString(e) === c.xml;
    if (ok) good++; else if (!bad) bad = { want: c, got: err || MX.xmlToString(e) };
  }
  H.ok(good === au.imgpos.length, 'audit: build_image_position (NaN, infinities, huge, half-way, unpacking) ' + good + '/' + au.imgpos.length + (bad ? ' first bad ' + JSON.stringify(bad) : ''));
  // KeyError messages: str(KeyError(k)) = repr(k)
  const keyBad = au.keyerrors.filter(([s, w]) => JSON.stringify((() => { const e = errOf(() => MX.buildNoteOrRest(sym(s), 0, false, new MX.ConversionState(16, new Fraction(1)), '')); return e && [e.error, e.message]; })()) !== JSON.stringify(w));
  H.ok(keyBad.length === 0, 'audit: KeyError messages (repr of a string key) ' + (au.keyerrors.length - keyBad.length) + '/' + au.keyerrors.length + (keyBad.length ? ' first bad ' + JSON.stringify(keyBad[0]) : ''));
}
// fixture-free invariants: an imgpos comment never says NaN / Infinity / 1e+21
{
  const s = sym('note_4 C4 _ _ _ upper');
  const comment = (ic) => { s.imageCoordinates = ic; const e = new MX.Element('n'); const err = errOf(() => MX.buildImagePosition(e, s)); return err ? err.error : MX.xmlToString(e); };
  const outs = [[NaN, 1], [1, Infinity], [1e21, 2], [-1e22, 3]].map(comment);
  H.ok(outs.every((o) => !/NaN|Infinity|e\+/.test(o)), 'imgpos comments never print NaN / Infinity / exponent notation: ' + outs.join(' | '));
}

// ---- the element API homr uses
const e = new MX.Element('note');
const d = MX.SubElement(e, 'duration'); d.text = '4';
MX.SubElement(e, 'voice').text = '1';
e.insert(e.list().indexOf(d) + 1, new MX.Element('tie', { type: 'start' }));
const n = MX.SubElement(e, 'notations');
const s = MX.SubElement(n, 'slur', { type: 'start', number: '1' });
n.insert(0, new MX.Element('tied', { type: 'start' }));
n.remove(s);
H.ok(MX.xmlToString(e) === '<note><duration>4</duration><tie type="start" /><voice>1</voice><notations><tied type="start" /></notations></note>' &&
  e.findtext('voice', 'x') === '1' && e.findtext('pitch', 'x') === 'x' && e.find('notations/tied').get('type') === 'start' && e.findall('*').length === 4,
  'Element insert / remove / find / findtext / findall');

H.done();
