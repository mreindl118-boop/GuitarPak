/* soundLAB OMR: port of homr/music_xml_generator.py (AGPL-3.0, github.com/liebharc/homr).
   Voices of EncodedSymbols -> a MusicXML 4.0 element tree (generate_xml), plus the subset of
   Python's xml.etree.ElementTree it needs (OMR.music_xml_generator.ET) and the serializers:
     toXmlString(root)  = what ET.ElementTree(root).write(path, encoding='unicode',
                          xml_declaration=True) writes (homr's main.py and SheetLab), byte for byte
     xmlToString(el)    = ET.tostring(el, encoding='unicode') (homr's xml_to_string)
     toBytes(root)      = toXmlString as UTF-8 bytes (a .musicxml file) */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  const V = OMR.transformer_vocabulary;
  const Fraction = V.Fraction;  // OMR.fractions.Fraction, the class vocabulary.js uses
  const py = OMR.py;
  const EncodedSymbol = V.EncodedSymbol, SymbolDuration = V.SymbolDuration;
  const empty = V.empty, nonote = V.nonote;

  function eprint() {  // homr.simple_logging.eprint, looked up when called
    const L = OMR.simple_logging;
    if (L && L.eprint) L.eprint.apply(null, arguments);
  }
  function pyError(name, message) { const e = new Error(message); e.name = name; e.pyType = name; return e; }
  function startsWithNoteOrRest(r) { return r.startsWith('note') || r.startsWith('rest'); }
  const pyTruthy = V.pyTruthy;  // bool(x): NaN is true in Python
  // str(x) of what a JS caller passes where homr takes an int (XmlGeneratorArguments): an
  // integral number is an int (every digit, String(1e21) would say '1e+21'), any other number
  // a float (repr: 'nan', 'inf', '1e-07', '120.5'), true/false/null 'True'/'False'/'None'.
  // A Python float like 120.0 ('120.0') has no JS twin: pass integers, as homr's callers do.
  function pyStr(x) {
    if (x === null || x === undefined) return 'None';
    if (typeof x === 'boolean') return x ? 'True' : 'False';
    if (typeof x === 'bigint') return x.toString();
    if (typeof x !== 'number') return String(x);
    if (Number.isNaN(x)) return 'nan';
    if (x === Infinity) return 'inf';
    if (x === -Infinity) return '-inf';
    if (Number.isInteger(x)) return BigInt(x).toString();
    return pyFloatRepr(x);
  }
  // repr(float) of a finite non-integral x: the shortest digits that round-trip (JS's and
  // Python's algorithms agree on them), laid out by Python's 'r' rule: exponent form when the
  // decimal point is <= -4 or > 16 places from the first digit ('1e-05', '3.5e-07')
  function pyFloatRepr(x) {
    const parts = String(Math.abs(x)).split('e');
    const mant = parts[0], exp = parts.length > 1 ? parseInt(parts[1], 10) : 0;
    const dot = mant.indexOf('.');
    const intPart = dot < 0 ? mant : mant.slice(0, dot), all = mant.replace('.', '');
    let lead = 0;
    while (lead < all.length - 1 && all[lead] === '0') lead++;
    const digits = all.slice(lead).replace(/0+$/, '') || '0';
    const decpt = intPart.length + exp - lead;  // |x| = 0.<digits> * 10^decpt
    let s;
    if (decpt <= -4 || decpt > 16) {
      const e = decpt - 1;
      s = digits[0] + (digits.length > 1 ? '.' + digits.slice(1) : '') + 'e' + (e < 0 ? '-' : '+') + String(Math.abs(e)).padStart(2, '0');
    } else if (decpt <= 0) {
      s = '0.' + '0'.repeat(-decpt) + digits;
    } else if (decpt >= digits.length) {
      s = digits + '0'.repeat(decpt - digits.length) + '.0';
    } else {
      s = digits.slice(0, decpt) + '.' + digits.slice(decpt);
    }
    return (x < 0 ? '-' : '') + s;
  }
  function getItem(dict, key) {  // dict[key]: KeyError when missing; str(KeyError(k)) = repr(k)
    if (!Object.prototype.hasOwnProperty.call(dict, key)) throw pyError('KeyError', typeof key === 'string' ? pyReprStr(key) : String(key));
    return dict[key];
  }
  // repr(str): single quotes unless the text has ' and no ", backslash escapes for the quote,
  // \\, \n \r \t and the characters str.isprintable() rejects
  const NOT_PRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;
  function pyReprStr(s) {
    const q = s.includes("'") && !s.includes('"') ? '"' : "'";
    let out = q;
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (ch === '\\' || ch === q) out += '\\' + ch;
      else if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else if (ch !== ' ' && NOT_PRINTABLE.test(ch)) {
        out += c < 0x100 ? '\\x' + c.toString(16).padStart(2, '0') : c < 0x10000 ? '\\u' + c.toString(16).padStart(4, '0') : '\\U' + c.toString(16).padStart(8, '0');
      } else out += ch;
    }
    return out + q;
  }

  // ======================================================================================
  // xml.etree.ElementTree, the parts homr uses. Attributes are a plain object: attribute
  // names are never array indices, so the object keeps Python's insertion order.

  class Element {
    constructor(tag, attrib, extra) {
      this.tag = tag;
      this.attrib = Object.assign({}, attrib || {}, extra || {});
      this.text = null;
      this.tail = null;
      this._children = [];
    }
    get length() { return this._children.length; }  // len(elem)
    [Symbol.iterator]() { return this._children[Symbol.iterator](); }  // for child in elem
    list() { return this._children.slice(); }  // list(elem)
    append(subelement) { this._children.push(subelement); }
    extend(elements) { for (const e of elements) this._children.push(e); }
    insert(index, subelement) {  // list.insert semantics
      const n = this._children.length;
      let i = index < 0 ? Math.max(0, n + index) : Math.min(index, n);
      this._children.splice(i, 0, subelement);
    }
    remove(subelement) {  // by identity (Element has no __eq__)
      const i = this._children.indexOf(subelement);
      if (i < 0) throw pyError('ValueError', 'list.remove(x): x not in list');
      this._children.splice(i, 1);
    }
    get(key, dflt) { return Object.prototype.hasOwnProperty.call(this.attrib, key) ? this.attrib[key] : (dflt === undefined ? null : dflt); }
    set(key, value) { this.attrib[key] = value; }
    keys() { return Object.keys(this.attrib); }
    items() { return Object.keys(this.attrib).map((k) => [k, this.attrib[k]]); }
    find(path) { const r = select(this, path); return r.length ? r[0] : null; }
    findall(path) { return select(this, path); }
    findtext(path, dflt) {
      const e = this.find(path);
      if (e === null) return dflt === undefined ? null : dflt;
      return e.text || '';
    }
    iter(tag) {  // depth first, the element itself first
      const out = [];
      (function walk(e) {
        if (!tag || tag === '*' || e.tag === tag) out.push(e);
        for (const c of e._children) walk(c);
      })(this);
      return out;
    }
  }

  // ElementPath for what homr uses: 'tag', 'a/b', '*', '.' steps (no predicates, no '//')
  function select(elem, path) {
    if (/[[\]@{}]|\/\//.test(path) || path.startsWith('/')) throw pyError('SyntaxError', 'unsupported path ' + path);
    let current = [elem];
    for (const step of path.split('/')) {
      const next = [];
      for (const e of current) {
        if (step === '.') next.push(e);
        else for (const c of e._children) if (step === '*' || c.tag === step) next.push(c);
      }
      current = next;
    }
    return current;
  }

  function SubElement(parent, tag, attrib, extra) {
    const element = new Element(tag, attrib, extra);
    parent.append(element);
    return element;
  }

  function Comment(text) {
    const element = new Element(Comment);
    element.text = text === undefined ? null : text;
    return element;
  }

  function ProcessingInstruction(target, text) {
    const element = new Element(ProcessingInstruction);
    element.text = pyTruthy(text) ? target + ' ' + text : target;
    return element;
  }

  // _raise_serialization_error: "cannot serialize %r (type %s)"
  function cannotSerialize(x) { return pyError('TypeError', 'cannot serialize ' + pyStr(x) + ' (type ' + V.pyTypeName(x) + ')'); }

  function escapeCdata(text) {
    if (typeof text !== 'string') throw cannotSerialize(text);
    if (text.includes('&')) text = text.split('&').join('&amp;');
    if (text.includes('<')) text = text.split('<').join('&lt;');
    if (text.includes('>')) text = text.split('>').join('&gt;');
    return text;
  }

  function escapeAttrib(text) {
    if (typeof text !== 'string') throw cannotSerialize(text);
    if (text.includes('&')) text = text.split('&').join('&amp;');
    if (text.includes('<')) text = text.split('<').join('&lt;');
    if (text.includes('>')) text = text.split('>').join('&gt;');
    if (text.includes('"')) text = text.split('"').join('&quot;');
    // Although section 2.11 of the XML specification states that CR or
    // CR LN should be replaced with just LN, it applies only to EOLNs
    // which take part of organizing file into lines. Within attributes,
    // we are replacing these with entity numbers, so they do not count.
    if (text.includes('\r')) text = text.split('\r').join('&#13;');
    if (text.includes('\n')) text = text.split('\n').join('&#10;');
    if (text.includes('\t')) text = text.split('\t').join('&#09;');
    return text;
  }

  // ElementTree._serialize_xml with short_empty_elements=True (no indentation: homr never
  // calls ET.indent)
  // (`if text:` is Python truthiness: a NaN text is serialized, i.e. refused, not skipped)
  function serializeXml(write, elem) {
    const tag = elem.tag, text = elem.text;
    if (tag === Comment) {
      write('<!--' + (typeof text === 'string' ? text : pyStr(text)) + '-->');  // "<!--%s-->" % text
    } else if (tag === ProcessingInstruction) {
      write('<?' + (typeof text === 'string' ? text : pyStr(text)) + '?>');
    } else if (tag === null) {
      if (pyTruthy(text)) write(escapeCdata(text));
      for (const e of elem._children) serializeXml(write, e);
    } else {
      if (typeof tag !== 'string') throw cannotSerialize(tag);
      // '{uri}name' would get an ns0: prefix and an xmlns declaration in Python; homr's tags are
      // plain names (a dynamic's name comes from the vocabulary), so the port does not do that
      if (tag.startsWith('{')) throw pyError('NotImplementedError', 'JS port: namespaced tag ' + tag);
      write('<' + tag);
      for (const k of Object.keys(elem.attrib)) write(' ' + k + '="' + escapeAttrib(elem.attrib[k]) + '"');
      if (pyTruthy(text) || elem._children.length) {
        write('>');
        if (pyTruthy(text)) write(escapeCdata(text));
        for (const e of elem._children) serializeXml(write, e);
        write('</' + tag + '>');
      } else {
        write(' />');
      }
    }
    if (pyTruthy(elem.tail)) write(escapeCdata(elem.tail));
  }

  function tostring(element) {  // ET.tostring(element, encoding='unicode')
    const parts = [];
    serializeXml((s) => parts.push(s), element);
    return parts.join('');
  }

  // The file is written with errors="xmlcharrefreplace": a lone surrogate (not encodable as
  // UTF-8) becomes a character reference
  // (a loop, not a lookbehind regex: older Safari cannot even parse those)
  function xmlCharRefReplace(s) {
    if (!/[\uD800-\uDFFF]/.test(s)) return s;
    let out = '', last = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) {
        const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
        if (d >= 0xDC00 && d <= 0xDFFF) { i++; continue; }  // a pair: one character
      } else if (c < 0xDC00 || c > 0xDFFF) {
        continue;
      }
      out += s.slice(last, i) + '&#' + c + ';';
      last = i + 1;
    }
    return out + s.slice(last);
  }

  // ET.ElementTree(root).write(path, encoding='unicode', xml_declaration=True): Python declares
  // the encoding of the file it opens, utf-8 (Linux; the text has '\n' line ends)
  function toXmlString(root) {
    return xmlCharRefReplace("<?xml version='1.0' encoding='utf-8'?>\n" + tostring(root));
  }

  function toBytes(root) { return new TextEncoder().encode(toXmlString(root)); }

  const ET = {
    Element: Element, SubElement: SubElement, Comment: Comment, ProcessingInstruction: ProcessingInstruction,
    tostring: tostring
  };

  // ======================================================================================
  // homr's generator

  function constants() {
    const c = OMR.constants;
    if (!c) throw pyError('ImportError', 'OMR.constants (js/omr/constants.js) is not loaded');
    return c;
  }

  class ConversionState {
    // homr: music_xml_generator.py:23
    constructor(division, nominator) {
      this.beats = 4 * constants().durationOfQuarter;
      this.division = division;
      this.nominator = nominator;
      this.tremoloState = 'stop';
      this.voltaNumber = 1;
      this.lastVoltaMeasure = -10;
    }

    startVolta(measureNo) {
      if (measureNo === this.lastVoltaMeasure + 1) this.voltaNumber += 1;
      else this.voltaNumber = 1;
      return this.voltaNumber;
    }

    stopVolta(measureNo) {
      this.lastVoltaMeasure = measureNo;
      return this.voltaNumber;
    }

    toggleTremoloState() {
      if (this.tremoloState === 'start') this.tremoloState = 'stop';
      else this.tremoloState = 'start';
      return this.tremoloState;
    }
  }

  class SymbolChord {
    // homr: music_xml_generator.py:51
    constructor(symbols, tupletMark) {
      this.symbols = symbols;
      this.tupletMark = tupletMark === undefined ? '' : tupletMark;
    }

    toString() { return this.symbols.map(String).join('&'); }

    isBarline() {
      if (this.symbols.length === 0) return false;
      const firstRhythm = this.symbols[0].rhythm;
      return firstRhythm.includes('barline') || firstRhythm.includes('repeat');
    }

    getDuration() {
      const notesRests = this.symbols.filter((s) => startsWithNoteOrRest(s.rhythm)).map((s) => s.getDuration().fraction);
      if (notesRests.length === 0) return new Fraction(0);
      return Fraction.min(notesRests);
    }

    intoPositions() {
      const buckets = new Map();  // defaultdict(list) by position
      for (const symbol of this.symbols) {
        if (!buckets.has(symbol.position)) buckets.set(symbol.position, []);
        buckets.get(symbol.position).push(symbol);
      }
      const chords = Array.from(buckets.values()).map((symbols) => new SymbolChord(symbols, this.tupletMark));
      // Voices of only rests go first, the last chord is the one which advances time.
      return py.sorted(chords, (chord) => chord.symbols.every((s) => s.rhythm.startsWith('rest')), true);
    }
  }

  class XmlGeneratorArguments {
    // homr: music_xml_generator.py:88
    constructor(largePage, metronome, tempo) {
      this.largePage = largePage === undefined ? null : largePage;
      this.metronome = metronome === undefined ? null : metronome;
      this.tempo = tempo === undefined ? null : tempo;
    }
  }

  function buildIdentification() {
    // homr: music_xml_generator.py:97
    const ident = new Element('identification');
    const enc = SubElement(ident, 'encoding');
    SubElement(enc, 'software').text = 'homr';
    return ident;
  }

  function generateXml(args, staffs, title) {
    // homr: music_xml_generator.py:104
    const root = new Element('score-partwise', { version: '4.0' });
    root.append(buildWork(title));
    root.append(buildIdentification());
    root.append(buildDefaults(args));
    const hasTwoStavesByPart = staffs.map(_voiceHasTwoStaves);
    root.append(buildPartList(hasTwoStavesByPart));
    staffs.forEach((staff, index) => root.append(buildPart(args, staff, index, hasTwoStavesByPart[index])));
    return root;
  }

  function xmlToString(element) {
    // homr: music_xml_generator.py:118
    return tostring(element);
  }

  function _voiceHasTwoStaves(voice) {
    // True if any symbol uses the lower staff (e.g. piano left hand / bass clef).
    return voice.some((s) => V.isLowerPosition(s.position));
  }

  function buildPart(args, voice, index, hasTwoStaves) {
    // homr: music_xml_generator.py:127
    const part = new Element('part', { id: getPartId(index) });
    const isFirstPart = index === 0;
    for (const measure of buildMeasures(args, voice, isFirstPart, hasTwoStaves)) part.append(measure);
    convertTies(part);
    return part;
  }

  function buildMeasures(args, voice, isFirstPart, hasTwoStaves) {
    // homr: music_xml_generator.py:138
    // Tokens say which notes start together, not when each group starts. A group starts
    // when the earliest still-sounding note ends (that is how training data is grouped),
    // so track the end times of sounding notes instead of only the last group's shortest note.
    let clock = new Fraction(0);
    let sounding = [];

    function closeCurrentMeasure() {
      rebalanceMeasureVoices(currentMeasure);
      measures.push(currentMeasure);
      clock = new Fraction(0);
      sounding = [];
    }

    let measureNumber = 1;
    const groups = splitMixedChords(addTupletStartStop(groupIntoChords(voice)));
    const [division, nominators] = findDivisionAndTimeSignatureNominators(groups);
    const state = new ConversionState(division, nominators[0]);
    let timeSignatureNo = 0;
    const measures = [];
    let currentMeasure = new Element('measure', { number: String(measureNumber) });
    const firstAttributes = buildOrGetAttributes(currentMeasure, null);
    SubElement(firstAttributes, 'divisions').text = String(py.floorDiv(division, 4));
    if (hasTwoStaves) {
      SubElement(firstAttributes, 'staves').text = '2';
      SubElement(firstAttributes, 'part-symbol').text = 'brace';
    }
    if (isFirstPart) {
      const direction = buildAddTimeDirection(args);
      if (direction !== null) currentMeasure.append(direction);
    }
    let attributes = firstAttributes;
    groups.forEach((group, groupNo) => {
      const symbol = group.symbols[0];
      const rhythm = symbol.rhythm;
      const lastAttributes = attributes;
      attributes = null;
      if (startsWithNoteOrRest(rhythm)) {
        if (group.symbols.length === 1 && rhythm.endsWith('m')) {
          attributes = buildOrGetAttributes(currentMeasure, lastAttributes);
          buildMultiMeasureRest(symbol, attributes);
        } else {
          const staffPositions = group.intoPositions();
          const advance = _advanceToNextGroup(group, clock, sounding);
          clock = clock.add(advance);
          sounding = sounding.filter((end) => end.gt(clock));
          staffPositions.forEach((staffPos, posNo) => {
            const chordDuration = posNo === staffPositions.length - 1 ? advance : new Fraction(0);
            for (const noteXml of buildNoteChord(staffPos, state, chordDuration)) currentMeasure.append(noteXml);
          });
        }
        return;  // continue
      }
      if (rhythm === 'measureRest') {
        py.sorted(group.symbols, getStaff).forEach((rest, staffNo) => {
          if (staffNo > 0) currentMeasure.append(buildBackup(state.nominator, state));
          currentMeasure.append(buildMeasureRest(rest, state));
        });
      } else if (rhythm === 'newline') {
        const isLastMeasure = groupNo === groups.length - 1;
        if (!isLastMeasure) SubElement(currentMeasure, 'print', { 'new-system': 'yes' });
      } else if (rhythm.startsWith('clef')) {
        attributes = buildOrGetAttributes(currentMeasure, lastAttributes, true);
        for (const shouldBeClef of group.symbols) {
          if (shouldBeClef.rhythm.startsWith('clef')) buildClef(shouldBeClef, attributes);
        }
      } else if (rhythm.startsWith('keySignature')) {
        attributes = buildOrGetAttributes(currentMeasure, lastAttributes);
        buildKey(symbol, attributes);
      } else if (rhythm.startsWith('timeSignature')) {
        attributes = buildOrGetAttributes(currentMeasure, lastAttributes);
        state.nominator = nominators[Math.min(timeSignatureNo, nominators.length - 1)];
        timeSignatureNo += 1;
        buildTimeSignature(symbol, attributes, state);
      } else if (rhythm.includes('barline')) {
        if (rhythm !== 'barline') {
          const barline = buildOrGetBarline(currentMeasure, 'right');
          buildBarlineStyle(symbol, barline);
        }

        closeCurrentMeasure();
        measureNumber += 1;
        currentMeasure = new Element('measure', { number: String(measureNumber) });
      } else if (rhythm === 'repeatStart') {
        closeCurrentMeasure();
        measureNumber += 1;
        currentMeasure = new Element('measure', { number: String(measureNumber) });

        const barline = buildOrGetBarline(currentMeasure, 'right');
        buildRepeat(symbol, barline);
      } else if (rhythm === 'repeatEnd') {
        const barline = buildOrGetBarline(currentMeasure, 'right');
        buildRepeat(symbol, barline);

        closeCurrentMeasure();
        measureNumber += 1;
        currentMeasure = new Element('measure', { number: String(measureNumber) });
      } else if (rhythm === 'repeatEndStart') {
        let barline = buildOrGetBarline(currentMeasure, 'right');
        buildRepeat(new EncodedSymbol('repeatEnd'), barline);

        closeCurrentMeasure();
        measureNumber += 1;
        currentMeasure = new Element('measure', { number: String(measureNumber) });
        barline = buildOrGetBarline(currentMeasure, 'right');
        buildRepeat(new EncodedSymbol('repeatStart'), barline);
      } else if (rhythm.startsWith('voltaStart')) {
        const voltaNumber = state.startVolta(measureNumber);
        const barline = buildOrGetBarline(currentMeasure, 'left');
        buildBarlineEnding(symbol, barline, voltaNumber);
      } else if (rhythm.startsWith('voltaStop') || rhythm.startsWith('voltaDiscontinue')) {
        const voltaNumber = state.stopVolta(measureNumber);
        const barline = buildOrGetBarline(currentMeasure, 'right');
        buildBarlineEnding(symbol, barline, voltaNumber);
      } else if (rhythm.startsWith('dynamic') || symbol.articulation.startsWith('dynamic')) {
        for (const dynamic of group.symbols) buildDynamic(dynamic, currentMeasure);
      } else {
        eprint("Symbol isn't supported yet ", symbol);
      }
    });

    if (currentMeasure.length > 0) closeCurrentMeasure();
    // A clef opens a second attributes element, so look at the whole first measure
    if (measures.length === 0) throw pyError('IndexError', 'list index out of range');
    if (measures[0].find('attributes/time') === null) {
      const timeEl = SubElement(firstAttributes, 'time');
      const beats = Math.max(state.nominator.mul(4).int(), 1);
      SubElement(timeEl, 'beats').text = String(beats);
      SubElement(timeEl, 'beat-type').text = '4';
    }
    return measures;
  }

  function _advanceToNextGroup(group, clock, sounding) {
    // homr: music_xml_generator.py:271
    // How far the next group starts after this one, updating the sounding notes in place.
    const durations = group.symbols.filter((s) => startsWithNoteOrRest(s.rhythm)).map((s) => s.getDuration().fraction);
    const timed = durations.filter((d) => d.gt(0));  // grace notes have no duration and take no time
    if (!timed.length) return new Fraction(0);
    for (const d of timed) sounding.push(clock.add(d));
    return Fraction.min(sounding.filter((end) => end.gt(clock))).sub(clock);
  }

  function buildWork(titleText) {
    // homr: music_xml_generator.py:285
    const work = new Element('work');
    SubElement(work, 'work-title').text = titleText;
    return work;
  }

  function buildDefaults(args) {
    // homr: music_xml_generator.py:291
    const defaults = new Element('defaults');
    if (pyTruthy(args.largePage)) {
      const pageLayout = SubElement(defaults, 'page-layout');
      SubElement(pageLayout, 'page-height').text = '300';
      SubElement(pageLayout, 'page-width').text = '110';
    }
    return defaults;
  }

  function getPartId(index) {
    return 'P' + (index + 1);
  }

  function _partMetadata(hasTwoStaves) {
    // homr: music_xml_generator.py:304
    // Return (part_name, instrument_name, instrument_sound, midi_program) for a part.
    // We classify by staff layout only:
    // - single-staff parts -> Voice
    // - two-staff parts -> Piano
    // midi_program is 1-based (MusicXML: 1-128; 1 = Acoustic Grand Piano, 54 = Voice Oohs).
    if (hasTwoStaves) return ['Piano', 'Piano', 'keyboard.piano', 1];
    return ['Voice', 'Voice', 'voice', 54];
  }

  function buildPartList(hasTwoStavesByPart) {
    // homr: music_xml_generator.py:317
    const partList = new Element('part-list');
    hasTwoStavesByPart.forEach((hasTwoStaves, part) => {
      const partId = getPartId(part);
      const [partNameStr, instrumentNameStr, instrumentSoundStr, midiProgram] = _partMetadata(hasTwoStaves);
      const scorePart = SubElement(partList, 'score-part', { id: partId });
      SubElement(scorePart, 'part-name').text = partNameStr;
      const scoreInstrument = SubElement(scorePart, 'score-instrument', { id: partId + '-I1' });
      SubElement(scoreInstrument, 'instrument-name').text = instrumentNameStr;
      SubElement(scoreInstrument, 'instrument-sound').text = instrumentSoundStr;
      const midiInstrument = SubElement(scorePart, 'midi-instrument', { id: partId + '-I1' });
      SubElement(midiInstrument, 'midi-channel').text = String(part + 1);
      SubElement(midiInstrument, 'midi-program').text = String(midiProgram);
      SubElement(midiInstrument, 'volume').text = '100';
      SubElement(midiInstrument, 'pan').text = '0';
    });
    return partList;
  }

  function buildOrGetAttributes(measure, lastAttributes, forceNew) {
    // homr: music_xml_generator.py:337
    if (lastAttributes !== null && lastAttributes !== undefined && !forceNew) return lastAttributes;
    return SubElement(measure, 'attributes');
  }

  function buildOrGetBarline(measure, location) {
    // homr: music_xml_generator.py:345
    for (const child of measure) {
      if (child.tag === 'barline' && child.get('location') === location) return child;
    }
    return SubElement(measure, 'barline', { location: location });
  }

  function buildDynamic(modelDynamic, measure) {
    // homr: music_xml_generator.py:352
    const marks = [];
    if (modelDynamic.rhythm.startsWith('dynamic')) {
      const dynamicName = splitOnce(modelDynamic.rhythm, '_');
      // `dynamic_empty` is the internal placeholder used for a modifier-only
      // marking (for example, "più"). It is not a MusicXML dynamics element.
      if (dynamicName !== 'empty') marks.push(new Element(dynamicName));
    }
    if (modelDynamic.articulation.startsWith('dynamic')) {
      const text = new Element('other-dynamics');
      text.text = splitOnce(modelDynamic.articulation, '_').split('piu').join('più');
      marks.push(text);
    }

    if (!marks.length) return;

    const direction = SubElement(measure, 'direction', { placement: 'below' });
    const directionType = SubElement(direction, 'direction-type');
    const dynamics = SubElement(directionType, 'dynamics');
    dynamics.extend(marks);

    SubElement(direction, 'staff').text = String(getStaff(modelDynamic));
  }

  // s.split(sep, 1)[1]
  function splitOnce(s, sep) {
    const i = s.indexOf(sep);
    if (i < 0) throw pyError('IndexError', 'list index out of range');
    return s.slice(i + sep.length);
  }
  // s.split(sep)[1]
  function secondField(s, sep) {
    const f = s.split(sep);
    if (f.length < 2) throw pyError('IndexError', 'list index out of range');
    return f[1];
  }

  function buildKey(modelKey, attributes) {
    // homr: music_xml_generator.py:376
    const key = SubElement(attributes, 'key');
    SubElement(key, 'fifths').text = secondField(modelKey.rhythm, '_');
  }

  function getStaff(symbol) {
    return V.isLowerPosition(symbol.position) ? 2 : 1;
  }

  function getXmlVoice(staffNum, rhythmicLayer) {
    // homr: music_xml_generator.py:385
    // Build a stable MusicXML voice number per staff and rhythmic layer.
    // Voice numbers are part-global in MusicXML, so using only the staff number can merge
    // independent layers on the same staff. Reserve 4 voices per staff:
    // staff 1 -> voices 1-4, staff 2 -> voices 5-8.
    return (staffNum - 1) * 4 + rhythmicLayer + 1;
  }

  class TimedNoteEvent {
    // homr: music_xml_generator.py:396 (dataclass)
    constructor(staffNum, start, end, notes) {
      this.staffNum = staffNum;
      this.start = start;
      this.end = end;
      this.notes = notes;
    }
  }

  function pyIntText(text) {  // int(el.text)
    const s = String(text).trim();
    if (!/^[+-]?[0-9]+$/.test(s)) throw pyError('ValueError', "invalid literal for int() with base 10: '" + text + "'");
    return parseInt(s, 10);
  }

  function rebalanceMeasureVoices(measure) {
    // homr: music_xml_generator.py:403
    // Assign stable non-overlapping voices per staff for a whole measure.
    const timedEvents = [];
    let currentTime = 0;
    let lastNoteStart = 0;
    for (const child of measure) {
      if (child.tag === 'backup') {
        const dur = child.find('duration');
        if (dur !== null) currentTime -= pyIntText(dur.text);
        continue;
      }
      if (child.tag === 'forward') {
        const dur = child.find('duration');
        if (dur !== null) currentTime += pyIntText(dur.text);
        continue;
      }
      if (child.tag !== 'note') continue;

      const durEl = child.find('duration');
      const duration = durEl !== null ? pyIntText(durEl.text) : 0;
      const staffEl = child.find('staff');
      const staffNum = staffEl !== null ? pyIntText(staffEl.text) : 1;
      const isChordTone = child.find('chord') !== null;
      const start = isChordTone ? lastNoteStart : currentTime;
      const end = start + duration;
      const last = timedEvents[timedEvents.length - 1];
      if (isChordTone && (timedEvents.length > 0 && last.staffNum === staffNum && last.start === start && last.end === end)) {
        last.notes.push(child);
      } else if (isChordTone) {
        timedEvents.push(new TimedNoteEvent(staffNum, start, end, [child]));
      } else {
        lastNoteStart = start;
        currentTime += duration;
        timedEvents.push(new TimedNoteEvent(staffNum, start, end, [child]));
      }
    }

    const byStaff = new Map();  // defaultdict(list), insertion order
    for (const event of timedEvents) {
      if (!byStaff.has(event.staffNum)) byStaff.set(event.staffNum, []);
      byStaff.get(event.staffNum).push(event);
    }

    for (const [staffNum, events] of byStaff) {
      const sortedEvents = py.sorted(events, (e) => [e.start, e.end]);
      let active = [];
      for (const event of sortedEvents) {
        active = active.filter(([activeEnd]) => activeEnd > event.start);
        const usedVoices = new Set(active.map(([, voiceNo]) => voiceNo));
        let voiceNo = 1;
        while (usedVoices.has(voiceNo)) voiceNo += 1;
        active.push([event.end, voiceNo]);
        const xmlVoice = String(getXmlVoice(staffNum, voiceNo - 1));
        for (const note of event.notes) {
          const voiceEl = note.find('voice');
          if (voiceEl !== null) voiceEl.text = xmlVoice;
        }
      }
    }
  }

  function getNotePitch(note) {
    // homr: music_xml_generator.py:468
    const pitch = note.find('pitch');
    if (pitch === null) return null;
    return ['step', 'alter', 'octave'].map((part) => pitch.findtext(part, '')).join('|');
  }

  function getSlur(note, slurType) {
    // homr: music_xml_generator.py:475
    // The note's slur of this type with the notations holding it, if any.
    // build_slurs writes at most one start and one stop per note, so there is
    // never a choice to make here.
    for (const notation of note.findall('notations')) {
      for (const slur of notation.findall('slur')) {
        if (slur.get('type') === slurType) return [slur, notation];
      }
    }
    return null;
  }

  function addTie(note, tieType, notation) {
    // homr: music_xml_generator.py:488
    // A tie needs both elements: <tie> for what sounds, <tied> for what is drawn.
    const tie = new Element('tie', { type: tieType });
    const duration = note.find('duration');
    const position = duration !== null ? note.list().indexOf(duration) + 1 : 0;
    note.insert(position, tie);
    notation.insert(0, new Element('tied', { type: tieType }));
  }

  function convertTies(part) {
    // homr: music_xml_generator.py:497
    // Rewrite slurs which are really ties, over a whole part.
    //
    // The model learns slurs and ties as one class on purpose, so a tie reaches
    // us as a slur. A slur is a tie when it joins a note to the very next note
    // of its own voice and both carry the same pitch.
    //
    // Deliberately no attempt to pair slur starts with slur stops. The slur
    // number is the staff number, so several slurs open on one staff share a
    // number and cannot be told apart by it — four at once on a test file — and
    // any pairing rule would be guessing. A tie needs no pairing: it is a
    // property of a note and its immediate successor.
    //
    // Run per part rather than per measure, because ties cross barlines. One
    // pass is enough: the last event seen in a voice is by definition the
    // predecessor of the next one in it.
    const previous = new Map();  // (staff, voice) -> event
    for (const measure of part.findall('measure')) {
      for (const event of groupIntoEvents(measure)) {
        const first = event[0];
        const key = first.findtext('staff', '1') + '\u0000' + first.findtext('voice', '1');
        const before = previous.has(key) ? previous.get(key) : null;
        previous.set(key, event);
        if (before === null) continue;
        tieEvent(before, event);
      }
    }
  }

  function groupIntoEvents(measure) {
    // homr: music_xml_generator.py:526
    // The measure's notes, with each chord kept together as one event.
    //
    // A chord is one moment of the music, not several: <chord> means "sounds
    // with the note before". Walking notes one at a time makes a chord's own
    // members each other's neighbours, so nothing in a chord ever finds the note
    // it is really adjacent to, and no tie between two chords is ever seen.
    const events = [];
    for (const note of measure.findall('note')) {
      if (note.find('chord') !== null && events.length) events[events.length - 1].push(note);
      else events.push([note]);
    }
    return events;
  }

  function tieEvent(before, after) {
    // homr: music_xml_generator.py:543
    // Convert every slur between two adjacent events that is really a tie.
    //
    // Matched by pitch, and led by the slurs: the model marks the notehead the
    // curve touches, which on a chord is one member and not the whole thing -
    // of the chords carrying a slur on my test material, 25 of 26 had it on
    // some members only. So each slurred note looks for its own pitch in the
    // next event rather than the chord being taken as a whole.
    for (const startNote of before) {
      const begins = getSlur(startNote, 'start');
      if (begins === null) continue;
      const pitch = getNotePitch(startNote);
      if (pitch === null) continue;
      for (const stopNote of after) {
        if (getNotePitch(stopNote) !== pitch) continue;
        const ends = getSlur(stopNote, 'stop');
        if (ends === null) continue;
        const [beginSlur, beginNotation] = begins;
        const [endSlur, endNotation] = ends;
        beginNotation.remove(beginSlur);
        endNotation.remove(endSlur);
        addTie(startNote, 'start', beginNotation);
        addTie(stopNote, 'stop', endNotation);
        break;
      }
    }
  }

  function buildClef(modelClef, attributes) {
    // homr: music_xml_generator.py:574
    const signAndLine = secondField(modelClef.rhythm, '_');
    const clef = SubElement(attributes, 'clef', { number: String(getStaff(modelClef)) });
    if (signAndLine.length < 2) throw pyError('IndexError', 'string index out of range');
    SubElement(clef, 'sign').text = signAndLine[0];
    SubElement(clef, 'line').text = signAndLine[1];
  }

  function buildTimeSignature(modelTimeSignature, attributes, state) {
    // homr: music_xml_generator.py:581
    const time = SubElement(attributes, 'time');
    const denominator = secondField(modelTimeSignature.rhythm, '/');
    const beats = Math.max(state.nominator.mul(pyIntText(denominator)).int(), 1);
    SubElement(time, 'beats').text = String(beats);
    SubElement(time, 'beat-type').text = denominator;
    state.beats = beats;
  }

  function buildBarlineStyle(barline, xml) {
    // homr: music_xml_generator.py:592
    const styleValue = barline.rhythm === 'bolddoublebarline' ? 'heavy-heavy' : 'light-light';
    SubElement(xml, 'bar-style').text = styleValue;
  }

  function buildBarlineEnding(volta, xml, voltaNumber) {
    // homr: music_xml_generator.py:597
    let type;
    if (volta.rhythm.startsWith('voltaStart')) type = 'start';
    else if (volta.rhythm.startsWith('voltaStop')) type = 'stop';
    else if (volta.rhythm.startsWith('voltaDiscontinue')) type = 'discontinue';
    else throw pyError('ValueError', 'Unknown ending ' + String(volta));
    SubElement(xml, 'ending', { type: type, number: String(voltaNumber) });
  }

  function buildRepeat(barline, xml) {
    // homr: music_xml_generator.py:609
    if (xml.find('repeat') !== null) {
      eprint('barline already has a repeat');
      return;
    }
    const direction = barline.rhythm === 'repeatStart' ? 'forward' : 'backward';
    SubElement(xml, 'repeat', { direction: direction });
  }

  const LIFT_TO_ALTER = { N: 0, '#': 1, '##': 2, b: -1, bb: -2 };

  const DURATION_NAMES = {
    0: 'breve', 1: 'whole', 2: 'half', 4: 'quarter', 8: 'eighth', 16: '16th', 32: '32nd', 64: '64th', 128: '128th'
  };

  function buildArticulations(note, articualations, tupletMark, state) {
    // homr: music_xml_generator.py:638
    const notation = SubElement(note, 'notations');

    const xmlArticulations = [];
    const xmlOrnaments = [];
    if (!articualations.startsWith('dynamic')) {
      for (const articulation of articualations.split('_')) {
        if (articulation === '') {
          continue;
        } else if (articulation === nonote) {
          eprint('WARNING note without valid articulation', articualations);
        } else if (articulation === 'fermata') {
          SubElement(notation, 'fermata');
        } else if (articulation === 'arpeggiate') {
          SubElement(notation, 'arpeggiate');
        } else if (articulation === 'accent') {
          xmlArticulations.push(new Element('accent'));
        } else if (articulation === 'accentStrong') {
          xmlArticulations.push(new Element('strong-accent'));
        } else if (articulation === 'mordent') {
          xmlArticulations.push(new Element('mordent'));
        } else if (articulation === 'staccato') {
          xmlArticulations.push(new Element('staccato'));
        } else if (articulation === 'staccatissimo') {
          xmlArticulations.push(new Element('staccatissimo'));
        } else if (articulation === 'tenuto') {
          xmlArticulations.push(new Element('tenuto'));
        } else if (articulation === 'tremolo') {
          const el = new Element('tremolo', { type: state.toggleTremoloState() });
          el.text = '3';
          xmlOrnaments.push(el);
        } else if (articulation === 'trill') {
          xmlOrnaments.push(new Element('trill-mark'));
        } else if (articulation === 'breathMark') {
          xmlArticulations.push(new Element('breath-mark'));
        } else if (articulation === 'turn') {
          xmlOrnaments.push(new Element('inverted-turn'));
        } else if (articulation === 'caesura') {
          xmlArticulations.push(new Element('caesura'));
        } else if (articulation === 'doit') {
          xmlArticulations.push(new Element('doit'));
        } else if (articulation === 'slurStart') {
          SubElement(notation, 'slur', { type: 'start' });
        } else if (articulation === 'slurStop') {
          SubElement(notation, 'slur', { type: 'stop' });
        } else if (articulation === 'tieStart') {
          SubElement(notation, 'tied', { type: 'start' });
        } else if (articulation === 'tieStop') {
          SubElement(notation, 'tied', { type: 'stop' });
        } else {
          throw pyError('ValueError', 'Unsupported articulation ' + articulation);
        }
      }
    }

    if (tupletMark !== '') SubElement(notation, 'tuplet', { type: tupletMark });

    if (xmlArticulations.length) {
      const parent = SubElement(notation, 'articulations');
      for (const child of xmlArticulations) parent.append(child);
    }

    if (xmlOrnaments.length) {
      const parent = SubElement(notation, 'ornaments');
      for (const child of xmlOrnaments) parent.append(child);
    }
  }

  function buildSlurs(note, slurs, slurNumber) {
    // homr: music_xml_generator.py:706
    let notation = note.find('notations');
    if (notation === null) notation = SubElement(note, 'notations');

    if (slurs === '_' || slurs === '') {
      // nothing
    } else if (slurs === nonote) {
      eprint('WARNING note without valid articulation', slurs);
    } else if (slurs === 'slurStart') {
      SubElement(notation, 'slur', { type: 'start', number: String(slurNumber) });
    } else if (slurs === 'slurStop') {
      SubElement(notation, 'slur', { type: 'stop', number: String(slurNumber) });
    } else if (slurs === 'slurStart_slurStop') {
      SubElement(notation, 'slur', { type: 'stop', number: String(slurNumber) });
      SubElement(notation, 'slur', { type: 'start', number: String(slurNumber) });
    } else {
      throw pyError('ValueError', 'Unsupported slur ' + slurs);
    }
  }

  function buildNoteOrRest(modelNote, rhythmicLayer, isChord, state, tupletMark) {
    // homr: music_xml_generator.py:726
    const note = new Element('note');
    if (isChord) SubElement(note, 'chord');
    const modelPitch = modelNote.pitch;
    const modelDuration = modelNote.getDuration();

    if (modelNote.rhythm.includes('G')) SubElement(note, 'grace');

    if (modelPitch === empty) {
      if (modelDuration.fraction.numerator === 0) SubElement(note, 'rest', { measure: 'yes' });
      else SubElement(note, 'rest');
    } else if (modelPitch === nonote) {
      eprint('WARNING note without pitch', modelNote);
      SubElement(note, 'rest');
    } else {
      const pitch = SubElement(note, 'pitch');
      if (modelPitch.length < 2) throw pyError('IndexError', 'string index out of range');
      SubElement(pitch, 'step').text = modelPitch[0];
      SubElement(pitch, 'octave').text = modelPitch[1];
      if (modelNote.lift === nonote) eprint('WARNING note with invalid lift', modelNote);
      else if (modelNote.lift !== empty) SubElement(pitch, 'alter').text = String(getItem(LIFT_TO_ALTER, modelNote.lift));
    }

    let baseDuration;
    if (modelNote.rhythm.includes('G')) {
      baseDuration = modelDuration.kern;
      SubElement(note, 'type').text = getItem(DURATION_NAMES, baseDuration);
    } else if (modelDuration.fraction.numerator > 0) {
      baseDuration = modelDuration.kern === 0 ? 1 : modelDuration.kern;
      SubElement(note, 'duration').text = String(Math.max(1, modelDuration.fraction.mul(state.division).int()));
      SubElement(note, 'type').text = getItem(DURATION_NAMES, baseDuration);
    } else {
      SubElement(note, 'duration').text = String(state.beats);
      SubElement(note, 'type').text = DURATION_NAMES[0];
    }

    for (let i = 0; i < modelDuration.dots; i++) SubElement(note, 'dot');

    if (modelDuration.actualNotes !== modelDuration.normalNotes) {
      const timeMod = SubElement(note, 'time-modification');
      SubElement(timeMod, 'actual-notes').text = String(modelDuration.actualNotes);
      SubElement(timeMod, 'normal-notes').text = String(modelDuration.normalNotes);
    }

    const staffNum = getStaff(modelNote);
    const slurNumber = staffNum;
    SubElement(note, 'voice').text = String(getXmlVoice(staffNum, rhythmicLayer));
    SubElement(note, 'staff').text = String(staffNum);

    buildArticulations(note, modelNote.articulation, tupletMark, state);
    buildSlurs(note, modelNote.slur, slurNumber);
    buildImagePosition(note, modelNote);

    return note;
  }

  function buildImagePosition(xml, symbol) {
    // homr: music_xml_generator.py:792
    // Adds the position of the symbol on the input image as comment. The position is estimated
    // from the attention of the transformer, it points roughly at the symbol but isn't precise.
    if (symbol.imageCoordinates === null || symbol.imageCoordinates === undefined) return;
    const ic = symbol.imageCoordinates;
    // x, y = symbol.image_coordinates: exactly two values
    if (ic.length > 2) throw pyError('ValueError', 'too many values to unpack (expected 2)');
    if (ic.length < 2) throw pyError('ValueError', 'not enough values to unpack (expected 2, got ' + ic.length + ')');
    const [x, y] = ic;
    const rx = roundToIntString(x), ry = roundToIntString(y);  // x first, as Python evaluates it
    xml.append(Comment(' imgpos: ' + rx + ', ' + ry + ' '));
  }

  // str(round(x)) of a float: half to even; NaN and infinities raise like Python's round(), a
  // huge value prints all its digits (String(1e21) would be '1e+21'), -0 prints '0' like an int
  function roundToIntString(x) {
    if (typeof x !== 'number') throw pyError('TypeError', 'type ' + (x === null ? 'NoneType' : typeof x) + " doesn't define __round__ method");
    if (Number.isNaN(x)) throw pyError('ValueError', 'cannot convert float NaN to integer');
    if (!Number.isFinite(x)) throw pyError('OverflowError', 'cannot convert float infinity to integer');
    const r = py.round(x);
    return Number.isSafeInteger(r) ? String(r) : BigInt(r).toString();
  }

  function buildMultiMeasureRest(symbol, attributes) {
    // homr: music_xml_generator.py:803
    if (attributes.find('measure-style') !== null) {
      eprint('Measure already has a multi rest');
      return;
    }
    const duration = pyIntText(secondField(symbol.rhythm, '_').split('m').join(''));
    const style = SubElement(attributes, 'measure-style');
    SubElement(style, 'multiple-rest').text = String(duration);
  }

  function buildMeasureRest(symbol, state) {
    // homr: music_xml_generator.py:812
    // A rest which fills the measure, e.g. in a staff which is hidden in a system.
    const note = new Element('note');
    SubElement(note, 'rest', { measure: 'yes' });
    const duration = Math.max(1, state.nominator.mul(state.division).int());
    SubElement(note, 'duration').text = String(duration);
    SubElement(note, 'voice').text = '1';
    SubElement(note, 'staff').text = String(getStaff(symbol));
    return note;
  }

  function buildBackup(duration, state) {
    // homr: music_xml_generator.py:823
    if (!duration.gt(0)) throw pyError('AssertionError', 'Backup duration must be positive');
    const backup = new Element('backup');
    SubElement(backup, 'duration').text = String(Math.max(1, duration.mul(state.division).int()));
    return backup;
  }

  function buildNoteChord(noteChord, state, chordDuration) {
    // homr: music_xml_generator.py:830
    const byDuration = _groupNotes(noteChord.symbols);
    const result = [];
    byDuration.forEach(([groupDuration, groupNotes], i) => {
      const notes = groupNotes.filter((n) => n.pitch !== empty && n.pitch !== nonote);
      const rests = groupNotes.filter((n) => n.pitch === empty || n.pitch === nonote);

      let isFirst = true;
      for (const note of notes) {
        result.push(buildNoteOrRest(note, i, !isFirst, state, noteChord.tupletMark));
        isFirst = false;
      }

      // A grace note without pitch would be a rest which takes no time
      if (rests.length && groupDuration.gt(0)) {
        if (notes.length) {
          // There are other notes, so to avoid rest being merged into chord, we emit a backup
          result.push(buildBackup(groupDuration, state));
        }
        // Ideally we expect len(rests) == 1, but in dataset we see cases where
        // there are multiple rests. So here we just take the first rest
        result.push(buildNoteOrRest(rests[0], i, false, state, noteChord.tupletMark));
      }

      if (i !== byDuration.length - 1 && groupDuration.gt(0)) result.push(buildBackup(groupDuration, state));
    });

    const maxDuration = Fraction.max(byDuration.map(([d]) => d));
    if (chordDuration.lt(maxDuration)) result.push(buildBackup(maxDuration.sub(chordDuration), state));

    return result;
  }

  // dict[Fraction, list] sorted by duration, as an array of [duration, notes] (dict.items())
  function _groupNotes(notes) {
    // homr: music_xml_generator.py:862
    const groupsByDuration = new Map();  // str(fraction) -> [fraction, notes]
    const maxDuration = Fraction.max(notes.map((n) => n.getDuration().fraction));
    for (const note of notes) {
      const duration = note.getDuration();
      const isGrace = note.rhythm.includes('G');
      let fraction;
      if (isGrace) fraction = new Fraction(0);
      else if (duration.fraction.numerator === 0) fraction = maxDuration;
      else fraction = duration.fraction;
      const key = fraction.toString();
      if (!groupsByDuration.has(key)) groupsByDuration.set(key, [fraction, []]);
      groupsByDuration.get(key)[1].push(note);
    }
    return Array.from(groupsByDuration.values()).sort((a, b) => a[0].cmp(b[0]));
  }

  function buildAddTimeDirection(args) {
    // homr: music_xml_generator.py:878
    if (!pyTruthy(args.metronome)) return null;
    const direction = new Element('direction');
    const directionType = SubElement(direction, 'direction-type');
    const metronome = SubElement(directionType, 'metronome');
    SubElement(metronome, 'beat-unit').text = 'quarter';
    SubElement(metronome, 'per-minute').text = pyStr(args.metronome);
    const tempo = pyTruthy(args.tempo) ? args.tempo : args.metronome;
    SubElement(direction, 'sound', { tempo: pyStr(tempo) });
    return direction;
  }

  function findCommonDivision(durations) {
    // homr: music_xml_generator.py:891
    // Find the smallest division (denominator) so that all durations
    // can be expressed as integer multiples.
    function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
    // abs(a * b) // gcd(a, b), without the product: a * b may pass 2^53 (and round) even when
    // the lcm does not. An lcm past 2^53 (never with vocabulary durations: <= 2^9*3^2*5*7*11*13*17)
    // raises instead of rounding, like the Fraction class.
    function lcm(a, b) {
      const r = Math.abs(a / gcd(a, b) * b);
      if (!Number.isSafeInteger(r)) throw pyError('OverflowError', 'common division lcm(' + a + ', ' + b + ') does not fit a JS number (2^53)');
      return r;
    }

    const denominators = durations.filter((d) => d.gt(0)).map((d) => d.denominator);
    if (!denominators.length) return 1;
    let common = denominators[0];
    for (const d of denominators.slice(1)) common = lcm(common, d);
    return common;
  }

  // np.median of a list of Fractions: the middle value, or the mean of the two middle values
  function medianFraction(values) {
    const s = Fraction.sorted(values);
    const n = s.length, h = Math.floor(n / 2);
    return n % 2 ? s[h] : s[h - 1].add(s[h]).div(2);
  }

  function findDivisionAndTimeSignatureNominators(voice) {
    // homr: music_xml_generator.py:909
    // Returns the division and one measure length per time signature, estimated from the
    // measures up to the next time signature. Measures before the first one count towards it.
    const durations = [new Fraction(1, 4)];
    let durationInMeasure = new Fraction(0);
    const segments = [[]];
    let hasTimeSignature = false;
    for (const chord of voice) {
      if (chord.symbols.length && chord.symbols[0].rhythm.startsWith('timeSignature')) {
        if (durationInMeasure.gt(0)) {
          segments[segments.length - 1].push(durationInMeasure);
          durationInMeasure = new Fraction(0);
        }
        if (hasTimeSignature) segments.push([]);
        hasTimeSignature = true;
      } else if (chord.isBarline() && durationInMeasure.gt(0)) {
        segments[segments.length - 1].push(durationInMeasure);
        durationInMeasure = new Fraction(0);
      } else {
        for (const symbol of chord.symbols) {
          if (startsWithNoteOrRest(symbol.rhythm)) {
            const frac = symbol.getDuration().fraction;
            if (frac.gt(0)) durations.push(frac);
          }
        }
        const duration = chord.getDuration();
        if (duration.gt(0)) durationInMeasure = durationInMeasure.add(duration);
      }
    }

    if (durationInMeasure.gt(0)) segments[segments.length - 1].push(durationInMeasure);

    const allMeasures = [];
    for (const segment of segments) for (const d of segment) allMeasures.push(d);
    if (allMeasures.length === 0) return [findCommonDivision(durations), segments.map(() => new Fraction(1))];

    // A time signature without measures after it, e.g. a courtesy one at the end of a
    // system, belongs to the measures of the next one
    const nominators = [];
    let following = medianFraction(allMeasures);
    for (const segment of segments.slice().reverse()) {
      if (segment.length) following = medianFraction(segment);
      nominators.push(following);
    }
    nominators.reverse();

    return [findCommonDivision(durations), nominators];
  }

  const _BEFORE_NOTES_ORDER = ['clef', 'keySignature', 'timeSignature'];

  function _splitMixedChord(symbols) {
    // homr: music_xml_generator.py:964
    // The transformer sometimes joins a clef, key, time signature or barline to a chord
    // of notes, e.g. a clef change in one staff on the beat where the other staff plays.
    // build_measures handles a group by its first symbol: if that is a note the extra
    // symbol becomes a zero-length rest (and fails an assertion), otherwise the notes
    // are dropped. Split it: clefs, keys and time signatures go before the notes (in
    // the order they have at the start of a line), barlines and repeats after them.
    const notes = symbols.filter((s) => startsWithNoteOrRest(s.rhythm));
    if (!notes.length || notes.length === symbols.length) return [symbols];
    const others = symbols.filter((s) => !startsWithNoteOrRest(s.rhythm));
    const after = others.filter((s) => s.rhythm.includes('barline') || s.rhythm.includes('repeat'));
    const before = new Map();  // defaultdict(list) by kind, insertion order
    for (const s of others) {
      if (!after.some((a) => a === s || a.equals(s))) {  // `s not in after` (==)
        const kind = s.rhythm.split('_')[0].split('/')[0];
        if (!before.has(kind)) before.set(kind, []);
        before.get(kind).push(s);
      }
    }
    const rank = new Map(_BEFORE_NOTES_ORDER.map((kind, i) => [kind, i]));
    const ordered = py.sorted(Array.from(before.keys()), (kind) => (rank.has(kind) ? rank.get(kind) : rank.size));
    return ordered.map((kind) => before.get(kind)).concat([notes], after.map((s) => [s]));
  }

  function splitMixedChords(groups) {
    // homr: music_xml_generator.py:987
    // Applies _split_mixed_chord to every group. Runs after the tuplet marks are set, so
    // the notes keep their mark and a split-off clef doesn't interrupt a tuplet.
    const result = [];
    let splitBarline = false;
    for (const group of groups) {
      const parts = _splitMixedChord(group.symbols);
      if (splitBarline && group.isBarline() && parts.length === 1) {
        // The barline split off the previous chord and this one are the same barline:
        // keep one, preferring a repeat or double barline over a plain barline.
        if (group.symbols[0].rhythm === 'barline' && result[result.length - 1].symbols[0].rhythm !== 'barline') {
          splitBarline = false;
          continue;
        }
        result.pop();
      }
      for (const part of parts) {
        const isNotes = startsWithNoteOrRest(part[0].rhythm);
        result.push(new SymbolChord(part, isNotes ? group.tupletMark : ''));
      }
      splitBarline = parts.length > 1 && result[result.length - 1].isBarline();
    }
    return result;
  }

  function groupIntoChords(voice) {
    // homr: music_xml_generator.py:1010
    return V.sortTokenChords(voice).map((s) => new SymbolChord(s));
  }

  const TupletParser = {
    // homr: music_xml_generator.py:1014
    parse(groups) {
      for (const measureGroups of TupletParser.splitIntoMeasures(groups)) {
        const savedMarks = measureGroups.map((group) => group.tupletMark);
        if (TupletParser.addTuplets(measureGroups)) continue;
        measureGroups.forEach((group, i) => { group.tupletMark = savedMarks[i]; });
      }
      return groups;
    },

    getTupletDuration(group) {
      for (const symbol of group.symbols) {
        if (startsWithNoteOrRest(symbol.rhythm)) {
          const duration = symbol.getDuration();
          if (duration.normalNotes !== duration.actualNotes) return duration;
        }
      }
      return null;
    },

    splitIntoMeasures(groups) {
      const measures = [];
      let currentMeasure = [];
      for (const group of groups) {
        currentMeasure.push(group);
        if (group.isBarline()) {
          measures.push(currentMeasure);
          currentMeasure = [];
        }
      }
      if (currentMeasure.length) measures.push(currentMeasure);
      return measures;
    },

    addTuplets(groups) {
      let cursor = 0;
      while (cursor < groups.length) {
        const duration = TupletParser.getTupletDuration(groups[cursor]);

        if (duration === null) {
          cursor += 1;
          continue;
        }

        const start = cursor;
        const tupletFormat = [duration.actualNotes, duration.normalNotes];
        const tupletSize = duration.actualNotes;

        while (cursor - start < tupletSize) {
          if (cursor >= groups.length) return false;
          const currentDuration = TupletParser.getTupletDuration(groups[cursor]);
          if (currentDuration === null) return false;
          if (currentDuration.actualNotes !== tupletFormat[0] || currentDuration.normalNotes !== tupletFormat[1]) return false;
          cursor += 1;
        }

        groups[start].tupletMark = 'start';
        groups[cursor - 1].tupletMark = 'stop';
      }

      return true;
    }
  };

  function addTupletStartStop(groups) {
    // homr: music_xml_generator.py:1078
    return TupletParser.parse(groups);
  }

  OMR.music_xml_generator = {
    // the element tree and its serializers
    ET: ET, Element: Element, SubElement: SubElement, Comment: Comment,
    toXmlString: toXmlString, toBytes: toBytes, xmlToString: xmlToString,
    // homr's generator
    ConversionState: ConversionState, SymbolChord: SymbolChord, XmlGeneratorArguments: XmlGeneratorArguments,
    buildIdentification: buildIdentification, generateXml: generateXml, _voiceHasTwoStaves: _voiceHasTwoStaves,
    buildPart: buildPart, buildMeasures: buildMeasures, _advanceToNextGroup: _advanceToNextGroup,
    buildWork: buildWork, buildDefaults: buildDefaults, getPartId: getPartId, _partMetadata: _partMetadata,
    buildPartList: buildPartList, buildOrGetAttributes: buildOrGetAttributes, buildOrGetBarline: buildOrGetBarline,
    buildDynamic: buildDynamic, buildKey: buildKey, getStaff: getStaff, getXmlVoice: getXmlVoice,
    TimedNoteEvent: TimedNoteEvent, rebalanceMeasureVoices: rebalanceMeasureVoices, getNotePitch: getNotePitch,
    getSlur: getSlur, addTie: addTie, convertTies: convertTies, groupIntoEvents: groupIntoEvents,
    tieEvent: tieEvent, buildClef: buildClef, buildTimeSignature: buildTimeSignature,
    buildBarlineStyle: buildBarlineStyle, buildBarlineEnding: buildBarlineEnding, buildRepeat: buildRepeat,
    LIFT_TO_ALTER: LIFT_TO_ALTER, DURATION_NAMES: DURATION_NAMES, buildArticulations: buildArticulations,
    buildSlurs: buildSlurs, buildNoteOrRest: buildNoteOrRest, buildImagePosition: buildImagePosition,
    buildMultiMeasureRest: buildMultiMeasureRest, buildMeasureRest: buildMeasureRest, buildBackup: buildBackup,
    buildNoteChord: buildNoteChord, _groupNotes: _groupNotes, buildAddTimeDirection: buildAddTimeDirection,
    findCommonDivision: findCommonDivision, findDivisionAndTimeSignatureNominators: findDivisionAndTimeSignatureNominators,
    _BEFORE_NOTES_ORDER: _BEFORE_NOTES_ORDER, _splitMixedChord: _splitMixedChord, splitMixedChords: splitMixedChords,
    groupIntoChords: groupIntoChords, TupletParser: TupletParser, addTupletStartStop: addTupletStartStop,
    // JS only
    medianFraction: medianFraction, SymbolDuration: SymbolDuration
  };
})(typeof self !== 'undefined' ? self : globalThis);
