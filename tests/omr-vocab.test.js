// OMR engine: the symbol language against homr (tools/omr/dump_lang.py recordings):
// js/omr/transformer_vocabulary.js, transformer_configs.js, circle_of_fifths.js and
// triplet_restoration.js, function by function, on the 7 fixture pages and synthetic cases.
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
const OMR = loadLanguage('triplet_restoration.js');
const V = OMR.transformer_vocabulary, TC = OMR.transformer_configs, C = OMR.circle_of_fifths, T = OMR.triplet_restoration;
const Fraction = V.Fraction;
const ES = V.EncodedSymbol;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sym = (s) => ES.fromString(s);
const syms = (l) => l.map(sym);
const chords = (l) => l.map(syms);
const measuresOf = (l) => l.map(chords);
const SL = (l) => l.map(String);
const CH = (l) => l.map(SL);
const ME = (l) => l.map(CH);
const frac = (s) => { const [n, d] = String(s).split('/'); return new Fraction(parseInt(n, 10), d === undefined ? 1 : parseInt(d, 10)); };
const DUR = (d) => ({ base_duration: String(d.baseDuration), dots: d.dots, actual_notes: d.actualNotes, normal_notes: d.normalNotes, fraction: String(d.fraction), kern: d.kern });
const TM = (m) => m.map((chord) => chord.map(([v, d, i]) => [v, String(d), i]));
const tm = (m) => m.map((chord) => chord.map(([v, d, i]) => [v, frac(d), i]));
const threesOut = (map) => Array.from(map.values()).map((t) => [t.places, t.value, t.indices, t.offBeat]);
const threesIn = (list) => new Map(list.map(([places, value, indices, offBeat]) => [T.threeKey(places, value), { places, value, indices, offBeat }]));
const errOf = (fn) => { try { fn(); return null; } catch (e) { return { error: e.name, message: e.message }; } };

// ---- one checker per recorded Python function: (record.in, tables) -> JS result in the record's encoding
function checkers(table) {
  const sameOut = (out, input) => ({ s: String(out), same: out === input });
  return {
    remove_duplicated_symbols: (i) => SL(V.removeDuplicatedSymbols(syms(i.symbols), i.cleanup_tuplets)),
    _group_into_chords: (i) => CH(V._groupIntoChords(syms(i))),
    _fix_over_eager_tuplets: (i) => CH(V._fixOverEagerTuplets(chords(i))),
    _group_into_measures: (i) => ME(V._groupIntoMeasures(chords(i))),
    _flatten_measures: (i) => CH(V._flattenMeasures(measuresOf(i))),
    _get_duration_of_measure: (i) => String(V._getDurationOfMeasure(chords(i))),
    _get_typical_duration_of_measures: (i) => String(V._getTypicalDurationOfMeasures(measuresOf(i))),
    _remove_tuplets: (i) => CH(V._removeTuplets(chords(i))),
    _only_keep_lower_staff_if_there_is_a_clef: (i) => CH(V._onlyKeepLowerStaffIfThereIsAClef(chords(i))),
    _remove_duplicated_piches: (i) => { const c = syms(i); const out = V._removeDuplicatedPiches(c); return { s: SL(out), pick: out.map((o) => c.indexOf(o)) }; },
    _remove_redudant_clefs_keys_and_time_signatures: (i) => CH(V._removeRedudantClefsKeysAndTimeSignatures(chords(i))),
    _flatten_chords: (i) => SL(V._flattenChords(chords(i))),
    sort_token_chords: (i) => CH(V.sortTokenChords(syms(i.symbols), i.keep_chord_symbol)),
    kern_to_symbol_duration: (i) => DUR(V.kernToSymbolDuration(i)),
    prior_power_of_two: (i) => V.priorPowerOfTwo(i),
    is_lower_position: (i) => V.isLowerPosition(i),
    is_upper_or_has_no_position: (i) => V.isUpperOrHasNoPosition(i),
    has_rhythm_symbol_a_position: (i) => V.hasRhythmSymbolAPosition(i),
    _split_articulations: (i) => V._splitArticulations(i),
    'EncodedSymbol.is_control_symbol': (i) => sym(i).isControlSymbol(),
    'EncodedSymbol.is_tuplet': (i) => sym(i).isTuplet(),
    'EncodedSymbol.is_valid': (i) => sym(i).isValid(),
    'EncodedSymbol.remove_tuplet': (i) => { const s = sym(i); return sameOut(s.removeTuplet(), s); },
    'EncodedSymbol.to_upper_position': (i) => { const s = sym(i); return sameOut(s.toUpperPosition(), s); },
    'EncodedSymbol.change_lift': (i) => { const s = sym(i[0]); return sameOut(s.changeLift(i[1]), s); },
    'EncodedSymbol.add_articulations': (i) => { const s = sym(i[0]); return sameOut(s.addArticulations(i[1]), s); },
    'EncodedSymbol.add_slurs': (i) => { const s = sym(i[0]); return sameOut(s.addSlurs(i[1]), s); },
    'EncodedSymbol.strip_articulations': (i) => { const [st, r] = sym(i[0]).stripArticulations(i[1], i[2]); return [st, String(r)]; },
    'EncodedSymbol.strip_slurs': (i) => { const [st, r] = sym(i[0]).stripSlurs(i[1], i[2]); return [st, String(r)]; },
    'EncodedSymbol.get_duration': (i) => DUR(sym(i).getDuration()),
    restore_unmarked_triplets: (i) => SL(T.restoreUnmarkedTriplets(table(i.table))),
    _split_into_measures: (i) => T._splitIntoMeasures(table(i.table)).map(TM),
    _play: (i) => T._play(tm(i.measure), i.triplets).map(([clock, notes]) => [String(clock), notes.map(([v, e]) => [v, String(e)])]),
    _count_breaks: (i) => { const [n, size] = T._countBreaks(tm(i.measure), i.triplets); return [n, String(size)]; },
    _get_length: (i) => String(T._getLength(tm(i))),
    _find_single_threes: (i) => threesOut(T._findSingleThrees(tm(i.measure), table(i.symbols.table))),
    _find_threes: (i) => T._findThrees(tm(i.measure), table(i.symbols.table)),
    _add_following_three: (i) => threesOut(T._addFollowingThree(threesIn(i.in_a_row), threesIn(i.single), tm(i.measure), table(i.symbols.table))),
    _choose_triplets: (i) => T._chooseTriplets(tm(i.measure), table(i.symbols.table)),
    _note_value: (i) => T._noteValue(table(i.symbols.table), i.indices),
    _count_by_note_value: (i) => Array.from(T._countByNoteValue(table(i.symbols.table), i.chosen)),
    _as_triplet: (i) => { const s = sym(i); return sameOut(T._asTriplet(s), s); }
  };
}

// every recorded call of a dump, function by function
function checkRecorded(label, rec) {
  const tables = rec.tables.map(syms);  // the same symbol objects for every call on one voice, like Python
  const check = checkers((k) => tables[k]);
  for (const name of Object.keys(rec.calls).sort()) {
    const fn = check[name];
    if (!fn) { H.ok(false, label + ' ' + name + ': no checker'); continue; }
    let good = 0, first = null;
    for (const r of rec.calls[name]) {
      let got;
      try { got = fn(r.in); } catch (e) { got = { threw: e.name + ': ' + e.message }; }
      if (same(got, r.out)) good++;
      else if (!first) first = { in: JSON.stringify(r.in).slice(0, 300), want: JSON.stringify(r.out).slice(0, 300), got: JSON.stringify(got).slice(0, 300) };
    }
    H.ok(good === rec.calls[name].length, label + ' ' + name + ' ' + good + '/' + rec.calls[name].length + ' exact' +
      (first ? '\n   in   ' + first.in + '\n   want ' + first.want + '\n   got  ' + first.got : ''));
  }
}

const roundTrip = new Set();

// ---- pages
const pages = H.pages().filter((p) => H.has(p, '12-lang-calls.json'));
if (!pages.length) H.skip('pages (no 12-lang-*.json fixtures: run tools/omr/dump_lang.py)');
for (const page of pages) {
  for (const prefix of ['12-lang-', '12-lang-ship-']) {
    if (!H.has(page, prefix + 'calls.json')) continue;
    const label = page + (prefix === '12-lang-ship-' ? ' [ship]' : '');
    const info = H.readJson(H.fix(page, prefix + 'voices.json'));
    checkRecorded(label, H.readJson(H.fix(page, prefix + 'calls.json')));
    // parse_staffs' _clean_up_voice end to end, image coordinates carried along
    let good = 0;
    info.clean_up.forEach((c) => {
      const input = c.in.map(([s, ic]) => { const x = sym(s); x.imageCoordinates = ic; return x; });
      const out = T.restoreUnmarkedTriplets(V.removeDuplicatedSymbols(input));
      if (same(out.map((s) => [String(s), s.imageCoordinates]), c.out)) good++;
      for (const [s] of c.in.concat(c.out)) roundTrip.add(s);
    });
    H.ok(good === info.clean_up.length, label + ' _clean_up_voice (remove_duplicated_symbols + restore_unmarked_triplets) ' + good + '/' + info.clean_up.length + ' voices exact incl. image coordinates');
    H.ok(same(info.voices, info.clean_up.map((c) => c.out)), label + ' parse_staffs voices are the cleaned voices');
    if (prefix === '12-lang-' && H.has(page, '10-tokens.json')) {
      const tok = H.readJson(H.fix(page, '10-tokens.json'));
      H.ok(same(tok.voices, info.voices.map((v) => v.map(([s]) => s))), label + ' 12-lang voices = 10-tokens.json voices');
      for (const call of tok.calls) for (const s of call) roundTrip.add(s);
      for (const v of tok.voices) for (const s of v) roundTrip.add(s);
    }
  }
}

// ---- synthetic
const synPath = path.join(H.FIX, '12-lang-synthetic.json');
if (!fs.existsSync(synPath)) {
  H.skip('synthetic (no ' + synPath + ')');
} else {
  const syn = H.readJson(synPath);
  const vocab = new V.Vocabulary();
  for (const name of Object.keys(syn.vocab)) {
    H.ok(same(Object.entries(vocab[name]), syn.vocab[name]), 'Vocabulary.' + name + ': ' + syn.vocab[name].length + ' tokens, same ids and order');
  }
  const cfg = new TC.Config();
  const attrs = H.camel(syn.config.attrs);
  const badAttrs = Object.keys(attrs).filter((k) => !same(cfg[k], attrs[k]));
  H.ok(badAttrs.length === 0, 'Config attributes (' + Object.keys(attrs).length + ') ' + (badAttrs.length ? 'differ: ' + badAttrs.join(',') : 'equal'));
  H.ok(same(Object.keys(cfg.toDict()), syn.config.to_dict_keys), 'Config.toDict keys in order');
  H.ok(cfg.toJsonString() === syn.config.to_json_string_names, 'Config.toJsonString = json.dumps(indent=2) (file names)');
  H.ok(cfg.filepaths.toJsonString() === syn.config.filepaths_json_names, 'FilePaths.toJsonString (file names)');
  H.ok(same(H.camel(syn.config.filepaths), Object.assign({}, cfg.filepaths)), 'FilePaths file names');
  H.ok(same(cfg.decoderArgs.toDict(), syn.config.decoder_args) && cfg.decoderArgs.toJsonString() === syn.config.decoder_args_json, 'DecoderArgs.toDict / toJsonString');
  H.ok(cfg.maxSeqLen === 608 && cfg.eosToken === 2 && TC.defaultConfig.maxHeight === syn.config.attrs.max_height, 'defaultConfig');
  H.ok(same({ nonote: V.nonote, empty: V.empty, VALID_TIME_SIGNATURE_DENOMINATORS: V.VALID_TIME_SIGNATURE_DENOMINATORS, DYNAMICS: V.DYNAMICS, DYNAMICS_MODIFIER: V.DYNAMICS_MODIFIER }, syn.constants), 'module constants');
  H.ok(syn.build_dict_errors.every(([tokens, err]) => same(errOf(() => V.buildDict(tokens)), err)), 'build_dict errors (' + syn.build_dict_errors.length + ')');
  const inv = V.invert(vocab.rhythm);
  H.ok(inv.length === syn.vocab.rhythm.length && syn.vocab.rhythm.every(([k, v]) => inv[v] === k), 'invert(vocab) = {v: k}');

  const count = (list, fn) => { let good = 0, bad = null; for (const x of list) { if (fn(x)) good++; else if (!bad) bad = x; } return [good, bad]; };
  const report = (label, list, fn) => { const [good, bad] = count(list, fn); H.ok(good === list.length, label + ' ' + good + '/' + list.length + (bad ? ' first bad: ' + JSON.stringify(bad).slice(0, 400) : '')); };
  report('kern_to_symbol_duration', syn.kern, ([k, d]) => same(DUR(V.kernToSymbolDuration(k)), d));
  report('prior_power_of_two', syn.prior_power_of_two, ([n, p]) => V.priorPowerOfTwo(n) === p);
  report('_split_articulations', syn.split_articulations, ([a, r]) => same(V._splitArticulations(a), r));
  report('has_rhythm_symbol_a_position', syn.has_position, ([n, r]) => V.hasRhythmSymbolAPosition(n) === r);
  report('is_lower_position / is_upper_or_has_no_position', syn.positions, ([p, lo, up]) => V.isLowerPosition(p) === lo && V.isUpperOrHasNoPosition(p) === up);

  // every EncodedSymbol method on generated symbols
  const methodFails = {};
  for (const c of syn.symbols) {
    roundTrip.add(c.s); roundTrip.add(c.other);
    const s = sym(c.s), other = sym(c.other);
    const rt = s.removeTuplet(), up = s.toUpperPosition();
    const checks = {
      str: String(s) === c.s, control: s.isControlSymbol() === c.control, tuplet: s.isTuplet() === c.tuplet, valid: s.isValid() === c.valid,
      remove_tuplet: same([String(rt), rt === s], c.remove_tuplet), to_upper: same([String(up), up === s], c.to_upper),
      change_lift: String(s.changeLift('#')) === c.change_lift,
      add_articulations: String(s.addArticulations(c.add_articulations[0])) === c.add_articulations[1],
      add_slurs: String(s.addSlurs(c.add_slurs[0])) === c.add_slurs[1],
      eq: s.equals(other) === c.eq, lt: s.lt(other) === c.lt, gt: other.lt(s) === c.gt, hash: (s.hashKey() === other.hashKey()) === c.hash_eq
    };
    for (const [key, method] of [['strip_articulations', 'stripArticulations'], ['strip_slurs', 'stripSlurs']]) {
      const [rm, st, res, stAll, resAll] = c[key];
      const [a, b] = s[method](rm), [a2, b2] = s[method](rm, true);
      checks[key] = same([a, String(b), a2, String(b2)], [st, res, stAll, resAll]);
    }
    let dur;
    try { dur = DUR(s.getDuration()); } catch (e) { dur = { error: e.name }; }
    checks.duration = c.duration.error ? dur.error === c.duration.error : same(dur, c.duration);
    for (const k of Object.keys(checks)) if (!checks[k]) (methodFails[k] = methodFails[k] || []).push(c.s);
  }
  H.ok(Object.keys(methodFails).length === 0, 'EncodedSymbol methods on ' + syn.symbols.length + ' symbols' +
    (Object.keys(methodFails).length ? ' FAILED: ' + JSON.stringify(Object.fromEntries(Object.entries(methodFails).map(([k, v]) => [k, v.length + ' e.g. ' + v[0]]))) : ' exact'));
  const copy = sym('note_4 C4 # _ _ lower');
  copy.imageCoordinates = [1.5, 2.5]; copy.coordinates = [0.1, 0.2];
  const moved = copy.toUpperPosition();
  H.ok(moved !== copy && moved.imageCoordinates === copy.imageCoordinates && moved.coordinates === copy.coordinates && copy.position === 'lower', 'copy.copy keeps coordinates, leaves the original alone');
  const kw = new ES('measureRest', { position: 'upper' });
  H.ok(String(kw) === 'measureRest . . . . upper', 'keyword constructor form');

  // token sequences through the clean-up functions and circle_of_fifths
  const seqFails = {};
  for (const c of syn.sequences) {
    for (const s of c.symbols) roundTrip.add(s);
    const seq = () => syms(c.symbols);
    const got = {
      remove_duplicated: (() => { try { return SL(V.removeDuplicatedSymbols(seq(), true)); } catch (e) { return { error: e.name }; } })(),
      remove_duplicated_no_tuplets: (() => { try { return SL(V.removeDuplicatedSymbols(seq(), false)); } catch (e) { return { error: e.name }; } })(),
      sort_token_chords: CH(V.sortTokenChords(seq())),
      sort_token_chords_keep: CH(V.sortTokenChords(seq(), true)),
      restore_triplets: (() => { try { return SL(T.restoreUnmarkedTriplets(seq())); } catch (e) { return { error: e.name }; } })(),
      maintain_accidentals: SL(C.maintainAccidentalsDuringMeasure(seq())),
      strip_naturals: SL(C.stripNaturals(seq()))
    };
    for (const k of Object.keys(got)) {
      const want = c[k] && c[k].error ? { error: c[k].error } : c[k];
      if (!same(got[k], want)) (seqFails[k] = seqFails[k] || []).push(c.kind);
    }
  }
  const kinds = {};
  for (const c of syn.sequences) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
  const changed = syn.sequences.filter((c) => !same(c.restore_triplets, c.symbols)).length;
  H.ok(Object.keys(seqFails).length === 0, 'token sequences ' + JSON.stringify(kinds) + ' (' + changed + ' with restored triplets): remove_duplicated_symbols x2, sort_token_chords x2, restore_unmarked_triplets, maintain_accidentals_during_measure, strip_naturals' +
    (Object.keys(seqFails).length ? ' FAILED: ' + JSON.stringify(seqFails) : ' exact'));
  checkRecorded('synthetic', syn.recorded);

  // circle_of_fifths
  const ci = syn.circle;
  H.ok(same(Array.from(C.definition), ci.definition) && same(Array.from(C.invDefinition), ci.inv_definition), 'circle_of_fifths definition / inv_definition');
  report('key_signature_to_circle_of_fifth', ci.key_signature_to_circle_of_fifth, ([k, v]) => C.keySignatureToCircleOfFifth(k) === v);
  report('repeat_note_for_all_octaves', ci.repeat_note_for_all_octaves, ([n, r]) => same(C.repeatNoteForAllOctaves(n), r));
  report('KeyTransformation / NoKeyTransformation step by step', ci.transformations, (t) => {
    let kt = t.kind === 'key' ? new C.KeyTransformation(t.circle) : new C.NoKeyTransformation();
    const state = () => (t.kind === 'key' ? { sharps: Array.from(kt.sharps).sort(), flats: Array.from(kt.flats).sort() } : { current: Array.from(kt.currentAccidentals) });
    if (t.kind === 'key' && !same(state(), t.init)) return false;
    for (const step of t.steps) {
      if (step[0] === 'reset') { kt = kt.resetAtEndOfMeasure(); continue; }
      const [note, acc, res, st] = step;
      if (kt.addAccidental(note, acc) !== res || !same(state(), st)) return false;
    }
    return true;
  });
}

// ---- audit regressions (tools/omr/dump_lang.py --audit): inputs the recordings above never reach
// a voice of the audit fixture: [str, image_coordinates] pairs, or {s, ic} / {alias: i} (the same
// object again: restore_unmarked_triplets maps symbols to indices by identity)
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
const SIC = (l) => l.map((s) => [String(s), s.imageCoordinates]);
const cleanUp = (v) => T.restoreUnmarkedTriplets(V.removeDuplicatedSymbols(v));
const auditPath = path.join(H.FIX, '12-lang-audit.json');
if (!fs.existsSync(auditPath)) {
  H.skip('audit regressions (no ' + auditPath + ': run tools/omr/dump_lang.py --audit)');
} else {
  const au = H.readJson(auditPath);
  const tryClean = (voices) => { try { return voices.map((v) => SIC(cleanUp(auditVoice(v)))); } catch (e) { return { error: e.name, message: e.message }; } };
  const cleanWant = (c) => (c.clean.error ? { error: c.clean.error, message: c.clean.message } : c.clean);
  // one measure of exotic vocabulary tuplets: its sums compare past 2^53 (JS used to throw OverflowError)
  let good = au.tuplets.filter((c) => same(tryClean(c.voices), cleanWant(c))).length;
  H.ok(good === au.tuplets.length, 'audit: exotic tuplets (sums past 2^53 in comparisons) through _clean_up_voice ' + good + '/' + au.tuplets.length + ' exact');
  // the Fraction arithmetic homr does on such sums: + - cmp, (a + b) / 2 (= np.median([a, b]); omr-xml
  // checks medianFraction itself), int(a * 1000), a * int, a / int
  const opsBad = au.fraction_ops.filter(([a, b, sum, diff, c, med, i1000, muls, divs]) => {
    const x = frac(a), y = frac(b);
    let got;
    try {
      got = [String(x.add(y)), String(x.sub(y)), x.cmp(y), String(x.add(y).div(2)), x.mul(1000).int(),
        au.fraction_muls.map((k) => String(x.mul(k))), au.fraction_divs.map((k) => String(x.div(k)))];
    } catch (e) { got = e.name + ': ' + e.message; }
    return !same(got, [sum, diff, c, med, i1000, muls, divs]);
  });
  H.ok(opsBad.length === 0, 'audit: Fraction + - * / cmp median int on big sums ' + (au.fraction_ops.length - opsBad.length) + '/' + au.fraction_ops.length + ' exact' + (opsBad.length ? ' first bad ' + JSON.stringify(opsBad[0]) : ''));
  // build_dict: str.strip's whitespace (\x1c-\x1f, \x85; not ﻿)
  const dictBad = au.build_dict.filter(([t, items, err]) => {
    let got;
    try { got = [t, Object.entries(V.buildDict([t])), null]; } catch (e) { got = [t, null, [e.name, e.message]]; }
    return !same(got, [t, items, err]);
  });
  H.ok(dictBad.length === 0, 'audit: build_dict whitespace = str.strip ' + (au.build_dict.length - dictBad.length) + '/' + au.build_dict.length + (dictBad.length ? ' first bad ' + JSON.stringify(dictBad[0]) : ''));
  // kern bases beyond 32 bits: the power-of-two test is not JS's 32-bit &
  const kernBad = au.kern_big.filter(([k, d]) => !same(DUR(V.kernToSymbolDuration(k)), d));
  H.ok(kernBad.length === 0, 'audit: kern_to_symbol_duration with bases beyond 2^31 ' + (au.kern_big.length - kernBad.length) + '/' + au.kern_big.length + (kernBad.length ? ' first bad ' + JSON.stringify(kernBad[0]) : ''));
  // a seeded sample of the audit's differential fuzz (random voices incl. aliased objects, triplet-heavy voices)
  for (const kind of ['random', 'triplets']) {
    const cases = au.fuzz.filter((c) => c.kind === kind);
    good = cases.filter((c) => same(tryClean(c.voices), cleanWant(c))).length;
    H.ok(good === cases.length, 'audit: ' + kind + ' voices through _clean_up_voice ' + good + '/' + cases.length + ' exact incl. image coordinates');
  }

  // second audit, the API boundary (dump_lang.py audit_boundary): what a JS caller may pass that
  // homr's own calls never do. Values arrive tagged ({int}, {float}, {str}, {set}, {dict}, {list}).
  const bd = au.boundary;
  if (!bd) H.skip('audit boundary cases (12-lang-audit.json predates them: run tools/omr/dump_lang.py --audit)');
  else {
    const untag = (v) => {
      if (v === null || typeof v === 'boolean') return v;
      if ('int' in v) return Number(v.int);
      if ('float' in v) return v.float === 'nan' ? NaN : v.float === 'inf' ? Infinity : v.float === '-inf' ? -Infinity : Number(v.float);
      if ('str' in v) return v.str;
      if ('set' in v) return new Set(v.set);
      if ('dict' in v) return Object.fromEntries(v.dict.map((k) => [k, 0]));
      if ('list' in v) return v.list.map(untag);
      throw new Error('bad tag ' + JSON.stringify(v));
    };
    const TRY = (fn) => { try { return { ok: fn() }; } catch (e) { return { error: e.name, message: e.message }; } };
    const firstBad = (list, fn) => { const bad = list.filter((c) => !fn(c)); return [list.length - bad.length, bad[0]]; };
    const rep = (label, list, fn) => { const [n, bad] = firstBad(list, fn); H.ok(n === list.length, label + ' ' + n + '/' + list.length + (bad ? ' first bad ' + JSON.stringify(bad).slice(0, 400) : '')); };
    // These two used to loop forever on Infinity (prior_power_of_two(inf), a 309+ digit kern):
    // they run in a child process with a time limit, so a regression FAILs instead of hanging.
    const child = (cases, body) => {
      const lib = ['np.js', 'transformer_vocabulary.js'].map((f) => 'require(' + JSON.stringify(path.join(H.ROOT, 'js', 'omr', f)) + ');').join('');
      const code = lib + 'const V = globalThis.OMR.transformer_vocabulary; const cases = ' + JSON.stringify(cases) + ';' +
        'const out = cases.map((c) => { try { return { ok: (' + body + ')(c) }; } catch (e) { return { error: e.name, message: e.message }; } });' +
        'process.stdout.write(JSON.stringify(out));';
      const r = require('child_process').spawnSync(process.execPath, ['-e', code], { timeout: 20000, encoding: 'utf8' });
      if (r.error || r.status !== 0) return cases.map(() => ({ error: r.error && r.error.code === 'ETIMEDOUT' ? 'HANG (killed after 20 s)' : 'child failed: ' + (r.stderr || '').slice(0, 200) }));
      return JSON.parse(r.stdout);
    };
    // n.bit_length() is int-only: a float (also NaN / inf, where the loop never ended) raises AttributeError
    const ppGot = child(bd.prior_power_of_two.map(([n]) => n), "(n) => { const v = n === null || typeof n === 'boolean' ? n : 'int' in n ? Number(n.int) : n.float === 'nan' ? NaN : n.float === 'inf' ? Infinity : n.float === '-inf' ? -Infinity : Number(n.float); return V.priorPowerOfTwo(v); }");
    rep('audit2: prior_power_of_two of floats / NaN / infinities / big ints (no hang)', bd.prior_power_of_two.map((c, i) => c.concat([ppGot[i]])), ([, want, got]) =>
      (want.error ? got.error === want.error && got.message === want.message : got.ok === untag(want.ok)));
    // Python's int is exact; past 2^53 the port raises OverflowError (309+ digits used to hang the page)
    const kGot = child(bd.kern_huge.map(([k]) => k), '(k) => { const d = V.kernToSymbolDuration(k); return { base_duration: String(d.baseDuration), dots: d.dots, actual_notes: d.actualNotes, normal_notes: d.normalNotes, fraction: String(d.fraction), kern: d.kern }; }');
    rep('audit2: kern_to_symbol_duration past 2^53 raises OverflowError (no hang), below it is exact', bd.kern_huge.map((c, i) => c.concat([kGot[i]])), ([, want, fits, got]) => {
      if (!fits) return got.error === 'OverflowError';
      return same(got.ok, Object.assign({}, want.ok, { actual_notes: Number(want.ok.actual_notes), normal_notes: Number(want.ok.normal_notes), kern: Number(want.ok.kern) }));
    });
    // remove_tuplet of a digit string past 2^53: string in, string out, exact (BigInt)
    rep('audit2: remove_tuplet / is_tuplet on duration digits past 2^53', bd.remove_tuplet_big, ([rh, out, isSame, isTuplet]) => {
      const s = new ES(rh, 'C4', '_', '_', '_', 'upper');
      const r = s.removeTuplet();
      return r.rhythm === out && (r === s) === isSame && s.isTuplet() === isTuplet;
    });
    // list.extend(str / set / dict) and `x in str / set / dict` in the training-side helpers
    const ex = sym('note_4 C4 _ staccato_tenuto slurStart upper');
    rep('audit2: add_articulations / add_slurs extend any iterable, strip_* use Python\'s `in`', bd.extend_in, ([kind, a, w1, w2]) => {
      const arg = untag(a);
      const eq = (got, want) => (want.error ? got.error === want.error && got.message === want.message : same(got, want));
      if (kind === 'add') return eq(TRY(() => String(ex.addArticulations(arg))), w1) && eq(TRY(() => String(ex.addSlurs(arg))), w2);
      const strip = (m) => TRY(() => { const [st, r] = ex[m](arg); return [st, String(r)]; });
      return eq(strip('stripArticulations'), w1) && eq(strip('stripSlurs'), w2);
    });
    // bool() of the flags: NaN, non-empty strings and lists are True in Python
    const flagSeq = () => syms(['note_12 C4 _ _ _ lower', 'barline . . . . .', 'note_4 C4 _ _ _ lower', 'chord . . . . .', 'note_4 E4 _ _ _ lower', 'barline . . . . .']);
    rep('audit2: cleanup_tuplets / keep_chord_symbol / remove_all flags are Python truthiness (NaN is true)', bd.flags, ([f, rds, stc, sa, ss]) => {
      const flag = untag(f);
      return same(SL(V.removeDuplicatedSymbols(flagSeq(), flag)), rds) && same(CH(V.sortTokenChords(flagSeq(), flag)), stc) &&
        same(ex.stripArticulations(['tenuto'], flag)[0], sa) && same(ex.stripSlurs([], flag)[0], ss);
    });
    // str() of a symbol with a non-str field raises TypeError (str.join); hash() does not
    rep('audit2: str(EncodedSymbol) with a None / int / float / bool field raises like str.join, hash does not', bd.str_fields, ([fields, want, hashOk]) => {
      const s = new ES(...fields.map(untag));
      const got = TRY(() => String(s));
      return got.error === want.error && got.message === want.message && same(TRY(() => typeof s.hashKey() === 'string'), hashOk);
    });
    rep('audit2: _note_value of no indices / a rhythm without "_" raises like Python', bd.note_value, ([ix, want]) => {
      const tbl = syms(['note_8 C4 _ _ _ upper', 'barline . . . . .']);
      const got = TRY(() => T._noteValue(tbl, ix));
      return want.error ? got.error === want.error && got.message === want.message : got.ok === want.ok;
    });
  }
}
// fixture-free: comparisons and sums whose products leave 2^53 stay exact (invariants only)
{
  const tuplets = ['note_7..', 'note_11..', 'note_13..', 'note_34..', 'note_96..', 'note_128..', 'note_36', 'note_40', 'note_7'];
  let a = new Fraction(0);
  for (const t of tuplets) a = a.add(V.kernToSymbolDuration(t.split('_')[1]).fraction);
  const tiny = new Fraction(1, 392071680);
  const exact = errOf(() => {
    const b = a.add(tiny);
    if (!(a.denominator > 1e8 && a.lt(b) && b.gt(a) && b.sub(a).eq(tiny) && a.mul(4).div(4).eq(a) && Fraction.max([a, b]) === b)) throw new Error('not exact');
  });
  H.ok(exact === null, 'Fraction: comparisons / sums of one measure of exotic tuplets stay exact (products past 2^53)' + (exact ? ': ' + exact.error + ' ' + exact.message : ''));
  const voice = [sym('clef_G2 . . . . upper')].concat(tuplets.map((t) => sym(t + ' C4 _ _ _ upper')));
  H.ok(errOf(() => cleanUp(voice)) === null, 'one measure of exotic tuplets goes through _clean_up_voice without an OverflowError');
}

// ---- str() <-> EncodedSymbol.fromString on every symbol string of the fixtures
let rtGood = 0, rtBad = null;
for (const s of roundTrip) { if (String(ES.fromString(s)) === s) rtGood++; else if (!rtBad) rtBad = s; }
if (roundTrip.size) H.ok(rtGood === roundTrip.size, 'EncodedSymbol.fromString round-trips ' + rtGood + '/' + roundTrip.size + ' distinct symbol strings' + (rtBad ? ' first bad ' + rtBad : ''));
else H.skip('fromString round trip (no fixtures)');
H.ok(String(ES.fromString('note_4 C4 _ _ _ upper')) === 'note_4 C4 _ _ _ upper' && errOf(() => ES.fromString('note_4 C4')).error === 'ValueError', 'fromString needs the six fields');

// ---- Fraction basics (Python semantics)
const f = (n, d) => new Fraction(n, d);
H.ok(String(f(6, -4)) === '-3/2' && String(f(0, -5)) === '0' && String(f(8, 4)) === '2' && f(-7, 2).int() === -3 && f(7, 2).int() === 3, 'Fraction normalises like Python, int() truncates');
H.ok(f(1, 3).add(f(1, 6)).eq(f(1, 2)) && f(3, 4).mul(2).div(3).eq(f(1, 2)) && f(1, 2).sub(1).eq(f(-1, 2)) && f(2, 3).cmp(f(3, 4)) < 0, 'Fraction arithmetic');
H.ok(errOf(() => f(1, 0)).error === 'ZeroDivisionError', 'Fraction(1, 0) raises ZeroDivisionError');

H.done();
