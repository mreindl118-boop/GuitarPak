/* soundLAB OMR: MusicXML (as homr writes it) -> Standard MIDI File, exactly as the owner's SheetLab
   engine makes it (tools/sheetlab_engine.py translate_file step 4 + _polish_midi_file), plus a small
   XML parser for Web Workers, the engine's transposition and a result summary.
   homr (github.com/liebharc/homr) is AGPL-3.0; the behaviour reproduced here is music21 10.5.2
   (BSD) and mido 1.3.3 (MIT), ported for the subset of MusicXML homr's generate_xml writes and
   checked against them on the 7 fixture pages and 153 synthetic scores (tests/omr-midi.test.js).
   Contains code ported from music21 10.5.2 and mido 1.3.3; their copyright and licences are in
   THIRD-PARTY-NOTICES.md.

   The engine: score = music21.converter.parse(musicxml); score.transpose(n) when n != 0; per part
   insert instrumentFromMidiProgram(gm) and MetronomeMark(tempo) at offset 0; score.write('midi');
   then mido re-reads the file and inserts set_tempo + track_name(title) at the start of track 0,
   sets every program_change to gm (adds one on channel 0 to a track without any) and saves it.
   So the port follows, in order:
     xmlToM21 (musicxml/xmlToM21.py)      importScore()  parts, PartStaffs, voices, chords, ties...
     Stream.transpose(int)                transposeScore() chromatic: default spelling of the new ps
     midi/translate.py streamToMidiFile   scoreToTracks()  expandRepeats, conductor track, volumes,
                                                           stripTies, packets, channels
     mido MidiFile read + polish + save   polish() + writeMido()  (running status like mido)
   Python semantics that matter here: offsets and durations are Python numbers as music21 keeps
   them (opFrac: floats when the denominator is a power of two, else Fractions; float + Fraction is
   a rounded float; opFrac of a float is limit_denominator(65535)), computed with the same
   operations in the same places, so offsets that need a denominator above 65535 (exotic tuplets)
   come out approximated exactly like music21's; ticks = int(round(quarterLength * 10080)) with
   round half to even, velocities int(round(realized * 127)) on the same doubles, stable sorts on
   music21's sort keys.

   Deliberate deviations (see notes/runtime-midi.md):
   - A title that latin-1 cannot encode makes mido's save raise inside _polish_midi_file, whose bare
     except leaves a 14-byte header-only (unreadable) file. Here the title is written as UTF-8.
   - Badly formed repeats make music21 raise ExpanderException and the engine report an error with
     no MIDI. Here (unless opts.strict) the MIDI is written without expanding repeats, and the
     warning is reported (convert().warnings). The result is byte for byte what music21 writes
     when the whole score is left unexpanded (tools/omr/midi_ref.py --audit2, _Lenient).
   - A character XML 1.0 forbids (e.g. a control character of a PDF title that generate_xml copies
     into <work-title>) makes music21's expat parse fail, so the engine writes no MIDI. Here
     (unless opts.strict, which throws expat's ParseError message) the MIDI is made and the
     warning names expat's error: the MusicXML itself is not well-formed for other readers.
   Everything else matches byte for byte, including the engine's quirks (a key of 8 sharps after
   transposing makes mido fail to read the file, so the engine keeps music21's raw, unpolished file).

   OMR.xml  = { parse, serialize, find, findAll, text, childElements, charError }
   OMR.midi = { fromMusicXml, convert, transposeMusicXml, summary, importScore, readSmf,
                GM_INSTRUMENTS, TICKS_PER_QUARTER } */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};

  // ======================================================================================
  // XML: a small, forgiving parser (DOMParser does not exist in Web Workers)
  // ======================================================================================
  // Nodes: {type:'element', name, attrs:{} (source order), children:[]}, {type:'text', text},
  // {type:'comment', text}, {type:'pi', text} (<?...?>), {type:'doctype', text}, {type:'cdata', text}.
  // parse() returns {type:'document', children:[...]}; .root is the first element.
  const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  function decodeEntities(s) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (m, e) => {
      if (e[0] === '#') {
        const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      }
      return Object.prototype.hasOwnProperty.call(ENT, e) ? ENT[e] : m; // unknown entity: keep as written
    });
  }
  // XML 1.0 Char: #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
  const xmlChar = (c) => c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) ||
    (c >= 0xe000 && c <= 0xfffd) || (c >= 0x10000 && c <= 0x10ffff);
  const CHAR_REF = /&#(?:x([0-9a-fA-F]+)|([0-9]+));/y;
  // The error expat (music21's parser) stops at for the first character XML 1.0 forbids, or null:
  // 'not well-formed (invalid token)' at the character, 'reference to invalid character number'
  // at a &#...; reference to one (not inside comments, CDATA or <?...?>, where nothing is a
  // reference). line is 1-based, column the 0-based code-point index in the line (\r\n, \r and \n
  // end a line), as expat counts them. A lone surrogate is reported as a reference: ElementTree
  // writes one as &#55296; (xmlcharrefreplace). This parser itself accepts such characters; the
  // engine's music21 step fails on them (e.g. a control character in a PDF's metadata title,
  // which generate_xml copies into <work-title>).
  function charError(src) {
    src = String(src);
    let line = 1, col = 0, close = null;
    for (let i = 0; i < src.length;) {
      const c = src.codePointAt(i);
      if (c === 0xa || c === 0xd) {
        i += c === 0xd && src.charCodeAt(i + 1) === 0xa ? 2 : 1;
        line++; col = 0;
        continue;
      }
      const at = ': line ' + line + ', column ' + col;
      if (c >= 0xd800 && c <= 0xdfff) return 'reference to invalid character number' + at;
      if (!xmlChar(c)) return 'not well-formed (invalid token)' + at;
      if (close) { if (src.startsWith(close, i)) close = null; }
      else if (c === 0x3c) close = src.startsWith('<!--', i) ? '-->' : src.startsWith('<![CDATA[', i) ? ']]>' : src.startsWith('<?', i) ? '?>' : null;
      else if (c === 0x26) {
        CHAR_REF.lastIndex = i;
        const m = CHAR_REF.exec(src);
        if (m && !xmlChar(m[1] != null ? parseInt(m[1], 16) : parseInt(m[2], 10))) return 'reference to invalid character number' + at;
      }
      col++;
      i += c > 0xffff ? 2 : 1;
    }
    return null;
  }
  function xmlParse(src) {
    src = String(src);
    if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
    const doc = { type: 'document', children: [], root: null };
    const stack = [doc];
    let i = 0;
    const n = src.length;
    const top = () => stack[stack.length - 1];
    function pushText(t) {
      if (!t) return;
      const kids = top().children;
      const last = kids[kids.length - 1];
      if (last && last.type === 'text') last.text += t; else kids.push({ type: 'text', text: t });
    }
    while (i < n) {
      const lt = src.indexOf('<', i);
      if (lt < 0) { pushText(decodeEntities(src.slice(i))); break; }
      if (lt > i) pushText(decodeEntities(src.slice(i, lt)));
      if (src.startsWith('<!--', lt)) {
        let e = src.indexOf('-->', lt + 4);
        if (e < 0) e = n;
        top().children.push({ type: 'comment', text: src.slice(lt + 4, e) });
        i = e + 3;
      } else if (src.startsWith('<![CDATA[', lt)) {
        let e = src.indexOf(']]>', lt + 9);
        if (e < 0) e = n;
        top().children.push({ type: 'cdata', text: src.slice(lt + 9, e) });
        i = e + 3;
      } else if (src.startsWith('<?', lt)) {
        let e = src.indexOf('?>', lt + 2);
        if (e < 0) e = n;
        top().children.push({ type: 'pi', text: src.slice(lt + 2, e) });
        i = e + 2;
      } else if (src.startsWith('<!', lt)) { // <!DOCTYPE ...> possibly with an internal subset [...]
        let j = lt + 2, depth = 0;
        while (j < n) {
          const c = src[j];
          if (c === '[') depth++;
          else if (c === ']') depth--;
          else if (c === '>' && depth <= 0) break;
          j++;
        }
        top().children.push({ type: 'doctype', text: src.slice(lt + 2, j) });
        i = j + 1;
      } else if (src[lt + 1] === '/') {
        const e = src.indexOf('>', lt + 2);
        const name = src.slice(lt + 2, e < 0 ? n : e).trim();
        // close up to the matching element (tolerates unclosed children)
        for (let k = stack.length - 1; k > 0; k--) {
          if (stack[k].name === name) { stack.length = k; break; }
        }
        i = e < 0 ? n : e + 1;
      } else {
        // start tag: name, attributes (quoted with ' or "), optional /
        let j = lt + 1;
        while (j < n && !/[\s/>]/.test(src[j])) j++;
        const el = { type: 'element', name: src.slice(lt + 1, j), attrs: {}, children: [] };
        let selfClose = false;
        for (;;) {
          while (j < n && /\s/.test(src[j])) j++;
          if (j >= n) break;
          if (src[j] === '>') { j++; break; }
          if (src[j] === '/' && src[j + 1] === '>') { selfClose = true; j += 2; break; }
          let k = j;
          while (k < n && !/[\s=/>]/.test(src[k])) k++;
          const an = src.slice(j, k);
          j = k;
          while (j < n && /\s/.test(src[j])) j++;
          let val = '';
          if (src[j] === '=') {
            j++;
            while (j < n && /\s/.test(src[j])) j++;
            const q = src[j];
            if (q === '"' || q === "'") {
              const e = src.indexOf(q, j + 1);
              val = src.slice(j + 1, e < 0 ? n : e);
              j = e < 0 ? n : e + 1;
            } else {
              let e = j;
              while (e < n && !/[\s>]/.test(src[e])) e++;
              val = src.slice(j, e);
              j = e;
            }
          }
          if (an) el.attrs[an] = decodeEntities(val.replace(/[\t\n\r]/g, ' '));
          else j++; // stray character
        }
        top().children.push(el);
        if (!doc.root && stack.length === 1) doc.root = el;
        if (!selfClose) stack.push(el);
        i = j;
      }
    }
    if (!doc.root) throw new Error('OMR.xml.parse: no root element');
    return doc;
  }
  // ElementTree-style output (what homr's ET.write produced): empty elements as <a />
  function escText(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#09;');
  }
  function xmlSerialize(node) {
    const out = [];
    (function w(nd) {
      switch (nd.type) {
        case 'document': for (const c of nd.children) w(c); break;
        case 'text': out.push(escText(nd.text)); break;
        case 'comment': out.push('<!--' + nd.text + '-->'); break;
        case 'cdata': out.push('<![CDATA[' + nd.text + ']]>'); break;
        case 'pi': out.push('<?' + nd.text + '?>'); break;
        case 'doctype': out.push('<!' + nd.text + '>'); break;
        default: {
          let s = '<' + nd.name;
          for (const k of Object.keys(nd.attrs)) s += ' ' + k + '="' + escAttr(nd.attrs[k]) + '"';
          if (!nd.children.length) { out.push(s + ' />'); break; }
          out.push(s + '>');
          for (const c of nd.children) w(c);
          out.push('</' + nd.name + '>');
        }
      }
    })(node);
    return out.join('');
  }
  function childElements(el, name) {
    const r = [];
    if (!el) return r;
    for (const c of el.children) if (c.type === 'element' && (!name || c.name === name)) r.push(c);
    return r;
  }
  // ElementTree find/findall with 'a/b' paths (direct children per step)
  function findAll(el, path) {
    let cur = [el];
    for (const step of path.split('/')) {
      const next = [];
      for (const e of cur) for (const c of childElements(e, step === '*' ? null : step)) next.push(c);
      cur = next;
    }
    return cur;
  }
  function find(el, path) { const r = findAll(el, path); return r.length ? r[0] : null; }
  // ElementTree .text: the text before the first child element
  function elText(el) {
    if (!el) return null;
    let s = null;
    for (const c of el.children) {
      if (c.type === 'element') break;
      if (c.type === 'text' || c.type === 'cdata') s = (s || '') + c.text;
    }
    return s;
  }
  function stripped(el) { const t = elText(el); return t == null ? '' : t.trim(); }

  OMR.xml = { parse: xmlParse, serialize: xmlSerialize, find: find, findAll: findAll, text: elText, childElements: childElements, charError: charError };

  // ======================================================================================
  // Python numbers as music21 uses them. Offsets and durations are opFrac'd: a value whose
  // denominator is a power of two is a float, anything else a Fraction. Arithmetic follows
  // Python: Fraction + Fraction is exact (BigInt parts: sums of exotic tuplets outgrow 2^53),
  // anything with a float is a ROUNDED float, and opFrac of a float whose ratio needs a
  // denominator above 65535 is limit_denominator(65535) (common.numberTools). music21 adds
  // 0.0 or a float in many places (flatten, getOffsetInHierarchy, the voice wrapper, backups,
  // directions, measure offsets), so offsets whose exact denominator exceeds 65535 come out
  // approximated; the port must make the same approximations to give the same ticks, the same
  // order and the same dynamics.
  // ======================================================================================
  const babs = (x) => (x < 0n ? -x : x);
  function bgcd(a, b) { a = babs(a); b = babs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
  // Fraction(n, d): BigInt parts, reduced, positive denominator
  function Q(n, d) {
    n = BigInt(n);
    d = d === undefined ? 1n : BigInt(d);
    if (d === 0n) throw new Error('OMR.midi: zero denominator');
    if (d < 0n) { n = -n; d = -d; }
    const g = bgcd(n, d);
    return g > 1n ? { n: n / g, d: d / g } : { n: n, d: d };
  }
  const Q0 = Q(0);
  const qadd = (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d);
  const qsub = (a, b) => Q(a.n * b.d - b.n * a.d, a.d * b.d);
  const qmul = (a, b) => Q(a.n * b.n, a.d * b.d);
  const qdiv = (a, b) => Q(a.n * b.d, a.d * b.n);
  const qcmp = (a, b) => { const l = a.n * b.d, r = b.n * a.d; return l < r ? -1 : l > r ? 1 : 0; };
  const qmax = (a, b) => (qcmp(a, b) >= 0 ? a : b);
  const isPow2 = (d) => (d & (d - 1n)) === 0n;
  const isDyadic = (q) => isPow2(q.d);
  const floorDivBig = (a, b) => { const q = a / b; return (a % b !== 0n && ((a < 0n) !== (b < 0n))) ? q - 1n : q; };
  const bitLen = (x) => x.toString(2).length;
  // float(Fraction): n / d correctly rounded (Python's int true division), round half to even
  const TWO53 = 9007199254740992n;
  function qnum(q) {
    const n = q.n, d = q.d;
    if (babs(n) <= TWO53 && d <= TWO53) return Number(n) / Number(d); // both exact: IEEE division rounds once
    if (n === 0n) return 0;
    const neg = n < 0n, a = babs(n);
    const e = bitLen(a) - bitLen(d) - 55;      // a / (d * 2^e) has 54..56 bits
    const num = e < 0 ? a << BigInt(-e) : a, den = e > 0 ? d << BigInt(e) : d;
    let m = num / den;
    const sticky = num % den !== 0n;
    const extra = bitLen(m) - 53;
    const low = m & ((1n << BigInt(extra)) - 1n), half = 1n << BigInt(extra - 1);
    m >>= BigInt(extra);
    if (low > half || (low === half && (sticky || (m & 1n)))) m += 1n;
    const v = Number(m) * Math.pow(2, e + extra);
    return neg ? -v : v;
  }
  // float.as_integer_ratio(): the exact value of a double
  function doubleRatio(x) {
    if (!Number.isFinite(x)) throw new Error('OMR.midi: cannot convert ' + x + ' to a fraction');
    const dv = new DataView(new ArrayBuffer(8));
    dv.setFloat64(0, x);
    const hi = dv.getUint32(0), lo = dv.getUint32(4);
    const neg = (hi >>> 31) === 1, ex = (hi >>> 20) & 0x7ff;
    let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
    let e;
    if (ex === 0) e = -1074; else { mant |= 1n << 52n; e = ex - 1075; }
    if (mant === 0n) return Q0;
    while ((mant & 1n) === 0n && e < 0) { mant >>= 1n; e++; }
    const num = neg ? -mant : mant;
    return e >= 0 ? { n: num << BigInt(e), d: 1n } : { n: num, d: 1n << BigInt(-e) };
  }
  // music21 common.numberTools._preFracLimitDenominator (= Fraction.limit_denominator(65535))
  const DENOM_LIMIT = 65535n;
  function limitDenominator(n, d) {
    if (d <= DENOM_LIMIT) return [n, d];
    const nOrg = n, dOrg = d;
    let p0 = 0n, q0 = 1n, p1 = 1n, q1 = 0n;
    for (;;) {
      const a = floorDivBig(n, d);
      const q2 = q0 + a * q1;
      if (q2 > DENOM_LIMIT) break;
      [p0, q0, p1, q1] = [p1, q1, p0 + a * p1, q2];
      [n, d] = [d, n - a * d];
    }
    const k = floorDivBig(DENOM_LIMIT - q0, q1);
    const b1n = p0 + k * p1, b1d = q0 + k * q1, b2n = p1, b2d = q1;
    const d1n = babs(b1n * dOrg - nOrg * b1d), d1d = dOrg * b1d;
    const d2n = babs(b2n * dOrg - nOrg * b2d), d2d = dOrg * b2d;
    return (d1n * d2d - d2n * d1d >= 0n) ? [b2n, b2d] : [b1n, b1d];
  }
  // common.opFrac(float)
  function opFracF(x) {
    const r = doubleRatio(x);
    if (r.d <= DENOM_LIMIT) return r;
    const [n, d] = limitDenominator(r.n, r.d);
    if (isPow2(d)) return doubleRatio(Number(n) / Number(d)); // f_out._numerator / (d + 0.0)
    return Q(n, d);
  }
  // common.opFrac(Fraction): power-of-two denominators become floats
  const opFracQ = (q) => (isPow2(q.d) ? doubleRatio(Number(q.n) / Number(q.d)) : q);
  // A Python value is {f: double} (a float) or {q: Fraction} (a Fraction or an int: int + float
  // is a float and int + Fraction a Fraction, like a Fraction). pv() gives a stored (opFrac'd)
  // value its Python type.
  const F0 = { f: 0 };                                   // 0.0, e.g. a Voice's offset, a clef's duration
  const pv = (q) => (isDyadic(q) ? { f: qnum(q) } : { q: q });
  const fval = (a) => (a.q ? qnum(a.q) : a.f);
  const pyAdd = (a, b) => (a.q && b.q ? { q: qadd(a.q, b.q) } : { f: fval(a) + fval(b) });
  const pySub = (a, b) => (a.q && b.q ? { q: qsub(a.q, b.q) } : { f: fval(a) - fval(b) });
  const exact = (a) => (a.q ? a.q : doubleRatio(a.f));
  const pyCmp = (a, b) => qcmp(exact(a), exact(b));      // Python compares float and Fraction exactly
  const opFrac = (a) => (a.q ? opFracQ(a.q) : opFracF(a.f));
  // Python float(str) for MusicXML numbers (ValueError like Python's for anything else)
  function pyFloat(s) {
    const t = String(s).trim();
    if (!/^[+-]?(\d(_?\d)*(\.(\d(_?\d)*)?)?|\.\d(_?\d)*)([eE][+-]?\d(_?\d)*)?$/.test(t)) {
      if (/^[+-]?(inf|infinity|nan)$/i.test(t)) return Number(t.replace(/inf(inity)?/i, 'Infinity').replace(/nan/i, 'NaN'));
      throw new ImportException('could not convert string to float: ' + pyRepr(String(s)));
    }
    return Number(t.replace(/_/g, ''));
  }
  function pyRepr(s) { return "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
  // Python round() of an exact fraction: half to even
  function qRound(a) {
    const f = floorDivBig(a.n, a.d);
    const twice = 2n * (a.n - f * a.d);          // 2 * remainder vs the denominator
    if (twice < a.d) return f;
    if (twice > a.d) return f + 1n;
    return f % 2n === 0n ? f : f + 1n;
  }
  // Python round() of a double: half to even
  function pyRound(x) {
    const r = Math.round(x);
    return (Math.abs(x % 1) === 0.5 && r % 2 !== 0) ? r - 1 : r;
  }
  const TPQ = 10080; // music21 defaults.ticksPerQuarter
  // midi.translate.offsetToMidiTicks / durationToMidiTicks: int(round(o * 10080)). A float o is
  // dyadic, so o * 10080 is exact in a double here and rounding the exact product is the same.
  const ticks = (q) => Number(qRound(qmul(q, Q(TPQ))));

  // ======================================================================================
  // music21 constants
  // ======================================================================================
  const STEP_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  // Pitch.ps setter's spelling (pitch._convertPsToStep): the one used after Stream.transpose(int)
  const PS_SPELL = [['C', 0], ['C', 1], ['D', 0], ['E', -1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['B', -1], ['B', 0]];
  // key.pitchToSharps for the major tonic of each pitch class (as spelled above)
  const PC_SHARPS = [0, 7, 2, -3, 4, -1, 6, 1, 8, 3, -2, 5];
  // classSortOrder of the classes that reach the MIDI translation
  const CSO = { instrument: -25, metronome: 1, key: 2, time: 4, clef: 0, dynamic: 10, note: 20, chord: 20, rest: 20 };
  // articulations.*.volumeShift for musicxml/xmlObjects.ARTICULATION_MARKS
  const ART_SHIFT = { accent: 0.1, 'strong-accent': 0.15, staccato: 0.05, staccatissimo: 0.05, spiccato: 0.1,
    tenuto: -0.05, 'detached-legato': 0, scoop: 0, plop: 0, doit: 0, falloff: 0, 'breath-mark': 0, caesura: 0,
    stress: 0.05, unstress: -0.05, 'other-articulation': 0 };
  // dynamics.dynamicStrToScalar + Dynamic.volumeScalar's fallbacks
  const DYN = { pppp: 0.1, ppp: 0.15, pp: 0.25, p: 0.35, mp: 0.45, mf: 0.55, f: 0.7, fp: 0.75, sf: 0.85, ff: 0.85, fff: 0.9, ffff: 0.95, n: 0.0 };
  function dynamicScalar(v) {
    if (Object.prototype.hasOwnProperty.call(DYN, v)) return DYN[v];
    let t = v;
    if (t.indexOf('s') >= 0) t = t.slice(1);     // "ignore leading s like in sf" (any s: drops char 0)
    // thisDynamic[-1] of '' (a value 's', or an empty / blank <other-dynamic>): music21 raises
    if (!t.length) throw pyError('IndexError', 'string index out of range');
    if (t[t.length - 1] === 'z') t = t.slice(0, -1);
    return Object.prototype.hasOwnProperty.call(DYN, t) ? DYN[t] : 0.5;
  }
  const TYPE_QL = { maxima: 32, longa: 16, breve: 8, whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25,
    '32nd': 0.125, '64th': 0.0625, '128th': 0.03125, '256th': 0.015625, '512th': 1 / 128, '1024th': 1 / 256 };
  const NO_STAFF = 0; // xmlToM21 NO_STAFF_ASSIGNED

  // the GM programs of the SheetLab engine's instrument menu
  const GM_INSTRUMENTS = {
    'Acoustic Grand Piano': 0, 'Bright Acoustic Piano': 1, 'Honky-tonk / Ragtime Piano': 3, 'Electric Piano (Rhodes)': 4,
    Harpsichord: 6, Celesta: 8, 'Music Box': 10, Vibraphone: 11, Marimba: 12, 'Church Organ': 19, Accordion: 21,
    'Acoustic Guitar (Nylon)': 24, 'Acoustic Guitar (Steel)': 25, 'Electric Guitar (Jazz)': 26, 'Electric Guitar (Clean)': 27,
    'Acoustic Bass': 32, Violin: 40, Viola: 41, Cello: 42, 'String Ensemble': 48, 'Choir Aahs': 52, Trumpet: 56,
    Trombone: 57, 'French Horn': 60, 'Alto Sax': 65, 'Tenor Sax': 66, Oboe: 68, Clarinet: 71, Flute: 73
  };

  class ExpanderException extends Error { constructor(m) { super(m); this.name = 'ExpanderException'; } }
  // an Error named like the Python exception the engine would report ("<name>: <message>")
  function pyError(name, message) { const e = new Error(message); e.name = name; return e; }
  class ImportException extends Error { constructor(m) { super(m); this.name = 'MusicXMLImportException'; } }

  // ======================================================================================
  // import: musicxml/xmlToM21.py, for what generate_xml writes (and tolerant of more)
  // ======================================================================================
  // an element: {kind, offset (in its measure or voice), ql, ...}; arrays keep insertion order,
  // which breaks ties of music21's sort key (its insertIndex)
  function el(kind, offset, extra) { return Object.assign({ kind: kind, offset: offset, ql: Q0 }, extra || {}); }

  function pitchPs(p) { return (p.octave + 1) * 12 + STEP_PC[p.step] + (p.alter || 0); }
  // pitch.Pitch.midi: schoolyard rounding, folded into 0..127 by octaves
  function pitchMidi(p) {
    const r = Math.floor(pitchPs(p) + 0.5);
    if (r > 127) { let v = 108 + (((r % 12) + 12) % 12); if (v < 115) v += 12; return v; }
    if (r < 0) return ((r % 12) + 12) % 12;
    return r;
  }

  function importScore(xmlText) {
    const doc = typeof xmlText === 'string' ? xmlParse(xmlText) : xmlText;
    const root = doc.root;
    if (root.name === 'score-timewise') throw new ImportException('score-timewise MusicXML is not supported');
    const scoreParts = {};
    for (const sp of findAll(root, 'part-list/score-part')) scoreParts[sp.attrs.id] = sp;
    const title = stripped(find(root, 'work/work-title')) || stripped(find(root, 'movement-title'));
    const parts = [];
    let firstId = null;
    for (const k of Object.keys(scoreParts)) { firstId = k; break; }
    // the importer's spannerBundle is shared by all parts: an ending left open in one part is
    // continued by the next part's first <ending>; only completed brackets reach a part
    const bundle = { open: null, list: [] };
    for (const mxPart of childElements(root, 'part')) {
      const id = mxPart.attrs.id != null ? mxPart.attrs.id : firstId;
      for (const p of parsePart(mxPart, scoreParts[id] || null, id, bundle)) parts.push(p);
    }
    return { parts: parts, title: title };
  }

  // PartParser.getDefaultInstrument (+ reclassifyInstrumentFromName for the name only)
  function defaultInstrument(mxScorePart, partName) {
    const inst = { kind: 'instrument', program: null, channel: null, partName: partName, instrumentName: null };
    if (mxScorePart) {
      const mi = find(mxScorePart, 'midi-instrument');
      if (mi) {
        const prog = stripped(find(mi, 'midi-program'));
        if (prog && !stripped(find(mi, 'midi-unpitched'))) {
          let v = parseInt(prog, 10) - 1;
          if (v === -1) v = 0; // "a lot of zero indexed pianos"
          inst.program = v;
          const ch = stripped(find(mi, 'midi-channel'));
          if (ch) { let c = parseInt(ch, 10) - 1; if (c === -1) c = 0; inst.channel = c; }
        }
      }
      const si = find(mxScorePart, 'score-instrument');
      if (si) { const nm = elText(find(si, 'instrument-name')); if (nm != null) inst.instrumentName = nm.trim(); }
    }
    return inst;
  }
  function bestName(inst) {
    return inst.partName != null ? inst.partName : inst.instrumentName != null ? inst.instrumentName : null;
  }

  function parsePart(mxPart, mxScorePart, partId, bundle) {
    let partName = null;
    if (mxScorePart) { const pn = find(mxScorePart, 'part-name'); if (pn) partName = (elText(pn) || '').trim(); }
    const inst = defaultInstrument(mxScorePart, partName);
    inst.offset = Q0;
    const P = {
      // lastMeasureOffset is a raw Python float: 0.0, then += each measure's shift (never opFrac'd)
      lastDivisions: Q(10080), lastTimeSignature: null, lastMeasureOffset: 0,
      maxStaves: 1, measures: [], staffRefs: [], bundle: bundle || { open: null, list: [] }
    };
    for (const mxMeasure of childElements(mxPart, 'measure')) parseMeasure(mxMeasure, P);
    // PartParser.parse: the completed spanners move into the part (creation order)
    P.brackets = P.bundle.list.filter((rb) => rb.complete);
    P.bundle.list = P.bundle.list.filter((rb) => !rb.complete);
    const base = { id: partId, partName: partName, instruments: [inst], extra: [], measures: P.measures, brackets: P.brackets };
    if (P.maxStaves <= 1) {
      base.staffKey = null;
      const bn = bestName(inst);
      if (bn != null) base.id = bn; // parseXmlScorePart: part.id = instrument.bestName()
      return [base];
    }
    return separateOutPartStaves(base, P);
  }

  // MeasureParser.parse + PartParser.xmlMeasureToMeasure
  function parseMeasure(mx, P) {
    // the measure being built (RepeatBrackets keep a reference to it)
    const m = { number: 0, offset: Q0, items: [], voices: [], leftBarline: null, rightBarline: null, staffRef: {} };
    const M = {
      m: m, number: 0, items: m.items, voices: m.voices, staves: 1, divisions: P.lastDivisions, pos: Q0,
      useVoices: false, voicesById: {}, lastVoice: null, noteList: [], restCount: 0, noteCount: 0,
      fullMeasureRest: false, staffRef: m.staffRef
    };
    const num = mx.attrs.number;
    if (num != null) { const mm = /^\s*(\d+)/.exec(num); if (mm) M.number = parseInt(mm[1], 10); }
    // updateVoiceInformation: one Voice per distinct <voice> of notes/forwards, sorted as strings
    const vIdx = new Set();
    for (const tag of ['note', 'forward']) {
      for (const n of childElements(mx, tag)) { const v = stripped(find(n, 'voice')); if (v) vIdx.add(v); }
    }
    if (vIdx.size > 1) {
      for (const v of Array.from(vIdx).sort()) { const vo = { id: v, items: [] }; M.voices.push(vo); M.voicesById[v] = vo; }
      M.useVoices = true;
    }
    const kids = childElements(mx);
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      switch (c.name) {
        case 'note': xmlToNote(c, kids[i + 1], M); break;
        case 'backup': { // MeasureParser.xmlBackup
          const t = stripped(find(c, 'duration'));
          if (t) {
            // opFrac(offsetMeasureNote - float(duration) / divisions): float arithmetic
            M.pos = opFracF(fval(pv(M.pos)) - pyDivF(pyFloat(t), M.divisions));
            // "negative offsets produced by musicxml durations with float rounding issues"
            if (qcmp(M.pos, Q0) < 0) M.pos = Q0;
          }
          break;
        }
        case 'forward': { // MeasureParser.xmlForward
          const t = stripped(find(c, 'duration'));
          if (t) {
            const change = opFracF(pyDivF(pyFloat(t), M.divisions));
            // MusicXMLImporter.applyFinaleWorkarounds: a hidden rest fills the gap
            const r = el('rest', M.pos, { ql: change, hidden: true, fullMeasure: false, typeName: null, dots: 0, tuplets: false });
            addStaffRef(M, staffOf(c), r);
            insertInMeasureOrVoice(M, c, r);
            M.pos = opFrac(pyAdd(pv(M.pos), pv(change)));
          }
          break;
        }
        case 'direction': xmlDirection(c, M); break;
        case 'attributes': parseAttributes(c, M, P); break;
        case 'sound': soundTempo(c, null, M); break;
        case 'barline': xmlBarline(c, M, P); break;
        default: break; // print, harmony, figured-bass, ...: nothing that sounds
      }
    }
    if (M.restCount === 1 && M.noteCount === 0) M.fullMeasureRest = true;
    // xmlMeasureToMeasure
    P.maxStaves = Math.max(P.maxStaves, M.staves);
    P.staffRefs.push(M.staffRef);
    const ts = measureTimeSignature(M);
    if (ts) P.lastTimeSignature = ts;
    else if (!P.lastTimeSignature) P.lastTimeSignature = { num: 4, den: 4, barQl: Q(4) };
    if (M.fullMeasureRest) {
      const r1 = firstRest(M);
      const lastTSQl = P.lastTimeSignature ? P.lastTimeSignature.barQl : Q(4);
      if (r1 && (r1.fullMeasure || (qcmp(r1.ql, lastTSQl) !== 0 && (r1.typeName === 'whole' || r1.typeName === 'breve') &&
        r1.dots === 0 && !r1.tuplets))) {
        r1.ql = lastTSQl;
        r1.fullMeasure = true;
      }
    }
    m.number = M.number;
    m.offset = opFracF(P.lastMeasureOffset); // stream.insert(self.lastMeasureOffset, m)
    P.measures.push(m);
    adjustTimeAttributes(m, P);
  }
  // Measure.timeSignature: the TimeSignature at offset 0
  function measureTimeSignature(M) {
    for (const e of M.items) if (e.kind === 'time' && qcmp(e.offset, Q0) === 0) return e;
    return null;
  }
  // m[note.Rest].first(): recursion in sort order (measure-level elements, then the voices)
  function firstRest(M) {
    const all = M.items.filter((e) => e.kind === 'rest').sort(sortKeyCmp);
    if (all.length) return all[0];
    for (const v of M.voices) {
      const vs = v.items.filter((e) => e.kind === 'rest').sort(sortKeyCmp);
      if (vs.length) return vs[0];
    }
    return null;
  }
  // Stream.highestTime: opFrac(max(elementOffset + duration.quarterLength)) in Python arithmetic,
  // from highestTimeSoFar = 0.0. Clefs, keys, dynamics ... last 0.0 (a float), and a Voice is an
  // element at 0.0 lasting its own highestTime, so both turn a Fraction offset into a float.
  const ZERO_LENGTH = { clef: 1, key: 1, time: 1, dynamic: 1, metronome: 1, instrument: 1 };
  const qlOf = (e) => (ZERO_LENGTH[e.kind] || !e.ql ? F0 : pv(e.ql));
  function highestTime(entries, voices) { // entries: [{offset, e}]
    let best = F0;
    for (const x of entries) { const c = pyAdd(pv(x.offset), qlOf(x.e)); if (pyCmp(c, best) > 0) best = c; }
    if (voices) for (const v of voices) { const c = pyAdd(F0, pv(measureHighestTime({ items: v.items }))); if (pyCmp(c, best) > 0) best = c; }
    return opFrac(best);
  }
  function measureHighestTime(m) {
    return highestTime(m.items.map((e) => ({ offset: e.offset, e: e })), m.voices);
  }
  function hasNotesOrRests(m) {
    for (const e of m.items) if (e.kind === 'note' || e.kind === 'chord' || e.kind === 'rest') return true;
    for (const v of m.voices) for (const e of v.items) if (e.kind === 'note' || e.kind === 'chord' || e.kind === 'rest') return true;
    return false;
  }
  // PartParser.adjustTimeAttributesFromMeasure: the next measure starts after this one's highest
  // time, except an overfull measure within tolerance (the time signature's length) and an empty
  // one (a rest of the time signature's length is put in). Short measures only get padding.
  function adjustTimeAttributes(m, P) {
    const h = measureHighestTime(m);
    const tsQl = P.lastTimeSignature ? P.lastTimeSignature.barQl : Q(4);
    let shift = h;
    const c = qcmp(h, tsQl);
    if (c > 0) {
      const diff = pySub(pv(h), pv(tsQl));
      // "If the measure is overfull by a 'round' amount, assume that it was intended":
      // diff > 0.5, or nearestMultiple(diff, 0.0625)[1] < 1e-6, or the same for 1 / 12
      if (!(pyCmp(diff, { f: 0.5 }) > 0 || nearestMultipleClose(diff, 0.0625) || nearestMultipleClose(diff, 1 / 12))) shift = tsQl;
    } else if (c < 0 && qcmp(h, Q0) === 0 && !hasNotesOrRests(m)) {
      m.items.push(el('rest', Q0, { ql: tsQl, fullMeasure: false, typeName: null, dots: 0, tuplets: false }));
      shift = tsQl;
    }
    P.lastMeasureOffset = P.lastMeasureOffset + fval(pv(shift)); // a float += float or Fraction
  }
  // common.numberTools.nearestMultiple(n, unit)[1] < 1e-6, in its float arithmetic: the error is
  // round(n - matchLow, 7) or round(matchHigh - n, 7), which is below 1e-6 exactly when the
  // unrounded double is below 9.5e-7 (a decimal tie cannot be a double)
  const NM_TOL = Q(95, 100000000);
  function nearestMultipleClose(n, unit) {
    const mult = Math.floor(fval(n) / unit);
    const matchLow = unit * mult, matchHigh = unit * (mult + 1), half = unit / 2.0;
    const err = (pyCmp(n, { f: matchLow }) >= 0 && pyCmp(n, { f: matchLow + half }) <= 0)
      ? fval(n) - matchLow : matchHigh - fval(n);
    return qcmp(doubleRatio(err), NM_TOL) < 0;
  }

  function staffOf(mx) { // getStaffNumber for note/forward/direction/harmony
    const s = find(mx, 'staff');
    if (s) { const t = elText(s); if (t != null && /^\s*-?\d+\s*$/.test(t)) return parseInt(t, 10); }
    return NO_STAFF;
  }
  function staffOfAttr(mx, defaultOne) { // clef/key/time/...: number attribute
    const n = mx.attrs.number;
    if (n != null && /^\s*-?\d+\s*$/.test(n)) return parseInt(n, 10);
    return defaultOne ? 1 : NO_STAFF;
  }
  function addStaffRef(M, key, obj) { (M.staffRef[key] = M.staffRef[key] || []).push(obj); }
  function insertInMeasureOrVoice(M, mxEl, e) {
    if (!M.useVoices) { M.items.push(e); return; }
    const t = stripped(find(mxEl, 'voice'));
    let use;
    if (t) use = M.lastVoice = t;
    else { use = M.lastVoice; if (use == null) use = '1'; }
    const v = M.voicesById[use]; // (the int(useVoice) lookup never matches the str keys)
    if (!v && !/^\s*[+-]?\d+\s*$/.test(use)) throw new ImportException("invalid literal for int() with base 10: '" + use + "'");
    if (v) v.items.push(e); else M.items.push(e); // "putting outside of voices"
  }

  // MeasureParser.xmlToDuration: qLen = opFrac(float(duration) / divisions). (Its "cooked" value
  // from <type>, dots and tuplets replaces qLen only when the two are within 1e-7 but unequal,
  // which a single note's exact duration never is.)
  function noteDuration(mxNote, M) {
    const d = find(mxNote, 'duration');
    if (!d) return Q0;
    return opFracF(pyDivF(pyFloat(elText(d) == null ? '' : elText(d)), M.divisions));
  }
  // float(x) / divisions, where divisions is the opFrac'd float (or Fraction) of <divisions>
  function pyDivF(x, div) {
    const y = fval(pv(div));
    if (y === 0) throw pyError('ZeroDivisionError', 'float division by zero');
    return x / y;
  }
  // MeasureParser.xmlToOffset: float(<offset>) / divisions, 0.0 without a valid <offset>
  function xmlToOffset(mx, M) {
    const o = find(mx, 'offset');
    const t = o ? elText(o) : null;
    if (t == null) return 0;
    let v;
    try { v = pyFloat(t); } catch (e) { return 0; }
    return pyDivF(v, M.divisions);
  }
  function readPitch(mxNote) {
    const mp = find(mxNote, 'pitch');
    if (!mp) return { step: 'C', alter: null, octave: 4 }; // music21's default Pitch for a note without one
    const step = (stripped(find(mp, 'step')) || 'C').toUpperCase();
    const oct = stripped(find(mp, 'octave'));
    const alt = stripped(find(mp, 'alter'));
    let alter = null; // null = no accidental; 0 = a natural (they differ for Pitch.__eq__)
    if (alt) { const a = parseFloat(alt); if (!Number.isNaN(a)) alter = a; }
    return { step: STEP_PC[step] === undefined ? 'C' : step, alter: alter, octave: oct ? parseInt(oct, 10) : 4 };
  }
  function readArticulations(mxNote) {
    const arts = [];
    for (const nt of childElements(mxNote, 'notations')) {
      for (const a of childElements(nt, 'articulations')) {
        for (const x of childElements(a)) if (Object.prototype.hasOwnProperty.call(ART_SHIFT, x.name)) arts.push(x.name);
      }
    }
    return arts;
  }
  function readTie(mxNote) {
    const ties = childElements(mxNote, 'tie');
    if (!ties.length) return null;
    const types = ties.map((t) => t.attrs.type).filter((t) => t != null);
    if (types.length === 1) return types[0];
    if (types.indexOf('stop') >= 0 && types.indexOf('start') >= 0) return 'continue';
    return 'start'; // tie.Tie() default type with an unexpected arrangement
  }
  function simpleNote(mxNote, M) {
    const grace = !!find(mxNote, 'grace');
    const ql = grace ? Q0 : noteDuration(mxNote, M);
    return {
      pitch: readPitch(mxNote), ql: ql, grace: grace, tie: readTie(mxNote), arts: readArticulations(mxNote),
      typeName: stripped(find(mxNote, 'type')) || null, dots: childElements(mxNote, 'dot').length,
      tuplets: !!find(mxNote, 'time-modification')
    };
  }
  // MeasureParser.xmlToNote
  function xmlToNote(mxNote, next, M) {
    const nextIsChord = !!(next && next.name === 'note' && find(next, 'chord'));
    const isRest = !!find(mxNote, 'rest');
    let isChord = !!find(mxNote, 'chord');
    if (nextIsChord) {
      isChord = true;
      const v = find(mxNote, 'voice');
      if (v) { const t = elText(v); if (t != null) M.lastVoice = t.trim(); }
    }
    let incr = F0; // offsetIncrement = 0.0: a chord's notes before its last turn the offset into a float
    if (isChord) {
      M.noteList.push(mxNote);
    } else if (!isRest) {
      M.noteCount++;
      const s = simpleNote(mxNote, M);
      const n = el('note', M.pos, { ql: s.ql, grace: s.grace, pitches: [s.pitch], ties: [s.tie], arts: s.arts });
      addStaffRef(M, staffOf(mxNote), n);
      insertInMeasureOrVoice(M, mxNote, n);
      incr = pv(n.ql);
    } else {
      M.restCount++;
      const grace = !!find(mxNote, 'grace');
      const restTag = find(mxNote, 'rest');
      const typeName = stripped(find(mxNote, 'type')) || null;
      const r = el('rest', M.pos, {
        ql: grace ? Q0 : noteDuration(mxNote, M), grace: grace, fullMeasure: false, typeName: typeName,
        dots: childElements(mxNote, 'dot').length, tuplets: !!find(mxNote, 'time-modification')
      });
      if (restTag.attrs.measure === 'yes' && (!typeName || typeName === 'whole' || typeName === 'breve')) {
        M.fullMeasureRest = true; r.fullMeasure = true;
      }
      addStaffRef(M, staffOf(mxNote), r);
      insertInMeasureOrVoice(M, mxNote, r);
      incr = pv(r.ql);
    }
    if (M.noteList.length && !nextIsChord) {
      const notes = M.noteList.map((x) => simpleNote(x, M));
      // xmlToChord: the chord takes the first note's duration; articulations once per type,
      // gathered over the notes sorted by pitch
      const order = notes.map((x, i) => i).sort((a, b) => pitchPs(notes[a].pitch) - pitchPs(notes[b].pitch));
      const seen = new Set(), arts = [];
      for (const i of order) for (const a of notes[i].arts) { if (!seen.has(a)) { seen.add(a); arts.push(a); } }
      const c = el('chord', M.pos, {
        ql: notes[0].ql, grace: notes[0].grace, pitches: notes.map((x) => x.pitch), ties: notes.map((x) => x.tie), arts: arts
      });
      addStaffRef(M, staffOf(M.noteList[0]), c);
      let target = mxNote;
      for (const x of M.noteList) if (find(x, 'voice')) { target = x; break; }
      insertInMeasureOrVoice(M, target, c);
      M.noteList = [];
      incr = pv(c.ql);
    }
    M.pos = opFrac(pyAdd(pv(M.pos), incr)); // offsetMeasureNote = opFrac(offsetMeasureNote + offsetIncrement)
  }

  function xmlDirection(mx, M) {
    // totalOffset = float(offsetDirection + offsetMeasureNote), inserted with opFrac
    const total = opFracF(xmlToOffset(mx, M) + fval(pv(M.pos)));
    const staff = staffOf(mx);
    let metronomeAdded = false;
    for (const dt of childElements(mx, 'direction-type')) {
      for (const d of childElements(dt)) {
        if (d.name === 'dynamics') {
          for (const dy of childElements(d)) {
            let txt = dy.name;
            if (txt === 'other-dynamic' && elText(dy)) txt = elText(dy).trim(); // (homr writes other-dynamics)
            const e = el('dynamic', total, { value: txt }); // volumeScalar: computed where music21 reads it
            addStaffRef(M, staff, e); M.items.push(e);
          }
        } else if (d.name === 'metronome') {
          metronomeAdded = true;
          const units = [], nums = [];
          for (const x of childElements(d)) {
            if (x.name === 'beat-unit') units.push({ ql: TYPE_QL[stripped(x)] || 1, dots: 0 });
            else if (x.name === 'beat-unit-dot' && units.length) units[units.length - 1].dots++;
            else if (x.name === 'per-minute') { const t = stripped(x); const v = parseFloat(t); if (t !== '' && !Number.isNaN(v)) nums.push(v); }
          }
          if (units.length > 1) continue; // MetricModulation: no MetronomeMark number
          const ref = units.length ? units[0].ql * (2 - Math.pow(0.5, units[0].dots)) : 1;
          const e = el('metronome', total, { number: nums.length ? nums[0] : null, sounding: null, referent: ref });
          addStaffRef(M, staff, e); M.items.push(e);
        }
      }
    }
    if (!metronomeAdded) {
      for (const s of childElements(mx, 'sound')) { if ('tempo' in s.attrs) { soundTempo(s, total, M, staff); break; } }
    }
  }
  function soundTempo(mxSound, total, M, staff) {
    if (!('tempo' in mxSound.attrs)) return;
    if (total == null) { // xmlSound: totalOffset = offsetDirection + offsetMeasureNote (a float)
      total = opFracF(xmlToOffset(mxSound, M) + fval(pv(M.pos)));
      staff = NO_STAFF;
    }
    const qpm = pyFloat(mxSound.attrs.tempo);
    if (qpm === 0) return; // "0 qpm tempo tag found, skipping."
    const e = el('metronome', total, { number: null, sounding: qpm, referent: 1 });
    addStaffRef(M, staff, e); M.items.push(e);
  }

  function parseAttributes(mx, M, P) {
    for (const c of childElements(mx)) {
      if (c.name === 'divisions') M.divisions = opFracF(pyFloat(elText(c) == null ? '' : elText(c))); // opFrac(float(text))
      else if (c.name === 'staves') { const v = parseInt(stripped(c), 10); if (v) M.staves = v; }
      else if (c.name === 'time') {
        if (find(c, 'senza-misura')) continue;
        const nums = [], dens = [];
        for (const x of childElements(c)) {
          if (x.name === 'beats') nums.push(stripped(x));
          else if (x.name === 'beat-type') dens.push(stripped(x));
          else if (x.name === 'interchangeable') break;
        }
        if (!nums.length || !dens.length) continue;
        let num = 0, barQl = Q0;
        const den = parseInt(dens[0], 10);
        for (let k = 0; k < Math.min(nums.length, dens.length); k++) {
          const nk = String(nums[k]).split('+').reduce((s, x) => s + parseInt(x, 10), 0);
          const dk = parseInt(dens[k], 10);
          num += nk;
          barQl = qadd(barQl, Q(4 * nk, dk));
        }
        if (!(num > 0) || !(den > 0)) throw new ImportException('Cannot process time signature ' + nums[0] + '/' + dens[0]);
        const e = el('time', M.pos, { num: num, den: den, barQl: barQl });
        addStaffRef(M, staffOfAttr(c, false), e); M.items.push(e);
      } else if (c.name === 'clef') {
        const e = el('clef', M.pos, {});
        addStaffRef(M, staffOfAttr(c, true), e); M.items.push(e);
      } else if (c.name === 'key') {
        const f = find(c, 'fifths');
        if (!f) continue; // non-traditional keys: no MIDI key signature from them here
        const mode = stripped(find(c, 'mode'));
        const e = el('key', M.pos, { sharps: parseInt(stripped(f), 10) || 0, minor: mode === 'minor' });
        addStaffRef(M, staffOfAttr(c, false), e); M.items.push(e);
      }
    }
    P.lastDivisions = M.divisions;
  }

  // MeasureParser.xmlBarline: left/right Barline or Repeat; <ending> builds RepeatBrackets
  function xmlBarline(mx, M, P) {
    const rep = find(mx, 'repeat');
    const loc = mx.attrs.location || 'right';
    const b = { repeat: !!rep, direction: null, times: null, location: loc };
    if (rep) {
      const d = (rep.attrs.direction || '').toLowerCase();
      if (d === 'forward') b.direction = 'start';
      else if (d === 'backward') b.direction = 'end';
      else throw new ImportException('Repeat sign direction is required');
      if (rep.attrs.times != null) { const t = parseInt(rep.attrs.times, 10); if (!Number.isNaN(t)) b.times = t; }
    }
    const ending = find(mx, 'ending');
    if (ending) {
      let rb = P.bundle.open;
      if (!rb) { rb = { measures: [], number: [0], complete: false }; P.bundle.open = rb; P.bundle.list.push(rb); } // RepeatBracket(number=0)
      if (rb.measures.indexOf(M.m) < 0) rb.measures.push(M.m); // RepeatBracket.addSpannedElements
      if (ending.attrs.type === 'start') {
        rb.number = bracketNumber(ending.attrs.number);
        const tx = elText(ending);
        if (tx != null) { const mm = /^(\d+)\.?$/.exec(tx); if (mm) rb.number = [parseInt(mm[1], 10)]; }
      }
      if (ending.attrs.type === 'stop' || ending.attrs.type === 'discontinue') { rb.complete = true; P.bundle.open = null; }
    }
    if (loc === 'left') M.m.leftBarline = b;
    else if (loc === 'right') {
      // Measure._setRightBarline: a right Repeat is always an end repeat ('start' or None -> 'end');
      // homr writes its repeatStart as <repeat direction="forward"/> in a right barline
      if (b.repeat && (b.direction === 'start' || b.direction == null)) b.direction = 'end';
      M.m.rightBarline = b;
    }
    // middle barlines do not affect playback
  }
  // RepeatBracket._setNumber -> numberRange; xmlBarline turns a SpannerException into number 1
  function bracketNumber(s) {
    const int = (x) => { // Python int(): surrounding whitespace allowed, else ValueError
      if (!/^\s*[+-]?\d+\s*$/.test(x)) throw new ImportException('invalid literal for int() with base 10: ' + JSON.stringify(x));
      return parseInt(x, 10);
    };
    if (s == null) return [1];
    if (s === '') return [0];
    if (s.indexOf('-') >= 0) {
      const parts = s.split('-');
      if (parts.length !== 2) throw new ImportException('too many values to unpack');
      const r = [];
      for (let k = int(parts[0]); k <= int(parts[1]); k++) r.push(k);
      return r;
    }
    if (s.indexOf(',') >= 0) return s.split(',').map(int);
    if (/^\d+$/.test(s)) return [parseInt(s, 10)];
    return [1];
  }

  // PartParser.separateOutPartStaves: one PartStaff per staff number; elements without a staff go
  // to every staff (copies after the first); voices that end up alone are flattened
  function separateOutPartStaves(base, P) {
    const keys = [];
    for (const ref of P.staffRefs) for (const k of Object.keys(ref).map(Number)) if (k !== NO_STAFF && keys.indexOf(k) < 0) keys.push(k);
    keys.sort((a, b) => a - b);
    const seen = new Set();
    const out = [];
    keys.forEach((staffKey, si) => {
      const exclude = new Set();
      for (const ref of P.staffRefs) for (const k of Object.keys(ref).map(Number)) {
        if (k !== NO_STAFF && k !== staffKey) for (const e of ref[k]) exclude.add(e);
      }
      const take = (e) => {
        if (exclude.has(e)) return null;
        if (seen.has(e)) return Object.assign({}, e); // deepcopy
        seen.add(e);
        return e;
      };
      const measures = base.measures.map((m) => {
        const cm = { number: m.number, offset: m.offset, items: [], voices: [], leftBarline: m.leftBarline, rightBarline: m.rightBarline };
        for (const e of m.items.slice().sort(sortKeyCmp)) { const t = take(e); if (t) cm.items.push(t); }
        for (const v of m.voices) {
          const cv = { id: v.id, items: [] };
          for (const e of v.items.slice().sort(sortKeyCmp)) { const t = take(e); if (t) cv.items.push(t); }
          cm.voices.push(cv);
        }
        flattenUnnecessaryVoices(cm);
        return cm;
      });
      const insts = base.instruments.map((x) => (si === 0 ? x : Object.assign({}, x)));
      const brackets = base.brackets.map((rb) => ({
        // the template re-links the part's own measures; a measure of another part stays as it was
        measures: rb.measures.map((mm) => { const k = base.measures.indexOf(mm); return k >= 0 ? measures[k] : mm; }), number: rb.number, complete: rb.complete
      }));
      out.push({ id: base.id + '-Staff' + staffKey, partName: base.partName, instruments: insts, extra: [], measures: measures, brackets: brackets, staffKey: staffKey });
    });
    return out;
  }
  // Measure.flattenUnnecessaryVoices(force=False): a single voice with content joins the measure
  // (empty voices are removed; a lone voice's elements go to coreInsert(shiftOffset + offset),
  // shiftOffset being the voice's 0.0, so a Fraction offset passes through a float)
  function flattenUnnecessaryVoices(m) {
    if (!m.voices.length) return;
    const used = m.voices.filter((v) => v.items.length);
    m.voices = used;
    if (used.length !== 1) return;
    for (const e of used[0].items) {
      const off = opFrac(pyAdd(F0, pv(e.offset)));
      m.items.push(qcmp(off, e.offset) === 0 ? e : Object.assign({}, e, { offset: off }));
    }
    m.voices = [];
  }

  // ======================================================================================
  // sorting: music21 sortTuple (offset, priority, classSortOrder, isNotGrace, insertIndex)
  // ======================================================================================
  function sortKeyCmp(a, b) {
    const c = qcmp(a.offset, b.offset);
    if (c) return c;
    const ca = CSO[a.kind] !== undefined ? CSO[a.kind] : 20, cb = CSO[b.kind] !== undefined ? CSO[b.kind] : 20;
    if (ca !== cb) return ca - cb;
    const ga = a.grace ? 0 : 1, gb = b.grace ? 0 : 1;
    if (ga !== gb) return ga - gb;
    return 0; // stable: insertion order
  }

  // ======================================================================================
  // Stream.transpose(int): Interval(int) is implicitDiatonic, so every pitch takes the Pitch.ps
  // setter's default spelling of ps + n; KeySignature.transpose moves the major tonic the same way
  // ======================================================================================
  function spellPs(ps) {
    const pc = ((ps % 12) + 12) % 12;
    const sp = PS_SPELL[pc];
    return { step: sp[0], alter: sp[1] || null, octave: Math.floor(ps / 12) - 1 }; // naturals: no accidental
  }
  function transposeSharps(sharps, n) {
    const tonic = (((7 * sharps) % 12) + 12) % 12;
    return PC_SHARPS[(((tonic + n) % 12) + 12) % 12];
  }
  function eachElement(part, fn) {
    for (const m of part.measures) {
      for (const e of m.items) fn(e);
      for (const v of m.voices) for (const e of v.items) fn(e);
    }
  }
  function transposeScore(score, n) {
    if (!n) return score;
    for (const p of score.parts) {
      eachElement(p, (e) => {
        if (e.kind === 'note' || e.kind === 'chord') {
          e.pitches = e.pitches.map((q) => (Number.isInteger(q.alter || 0) ? spellPs(pitchPs(q) + n) : q));
        } else if (e.kind === 'key') {
          e.sharps = transposeSharps(e.sharps, n);
        }
      });
    }
    return score;
  }

  // ======================================================================================
  // copies (music21 deep-copies the score before the MIDI translation)
  // ======================================================================================
  function copyEl(e) {
    const c = Object.assign({}, e);
    if (e.pitches) c.pitches = e.pitches.slice();
    if (e.ties) c.ties = e.ties.slice();
    if (e.arts) c.arts = e.arts.slice();
    return c;
  }
  function copyMeasure(m) {
    return {
      number: m.number, offset: m.offset, items: m.items.map(copyEl),
      voices: m.voices.map((v) => ({ id: v.id, items: v.items.map(copyEl) })),
      leftBarline: m.leftBarline, rightBarline: m.rightBarline
    };
  }
  function copyPart(p) {
    const measures = p.measures.map(copyMeasure);
    return {
      id: p.id, partName: p.partName, staffKey: p.staffKey,
      instruments: p.instruments.map(copyEl), extra: p.extra.map(copyEl), measures: measures,
      brackets: p.brackets.map((rb) => ({ number: rb.number, complete: rb.complete, measures: rb.measures.map((x) => { const k = p.measures.indexOf(x); return k >= 0 ? measures[k] : x; }) }))
    };
  }

  // ======================================================================================
  // repeat.Expander (bar repeats and RepeatBrackets; homr writes no D.C./segno/coda)
  // ======================================================================================
  const isRepeat = (b) => !!(b && b.repeat);
  function hasRepeat(ms) {
    for (const m of ms) {
      if (isRepeat(m.leftBarline)) return true;
      if (isRepeat(m.rightBarline) && m.rightBarline.direction === 'end') return true;
    }
    return false;
  }
  function repeatBarsAreCoherent(ms) {
    let startCount = 0, endCount = 0, balance = 0;
    for (const m of ms) {
      const lb = m.leftBarline, rb = m.rightBarline;
      if (isRepeat(lb)) {
        if (lb.direction === 'start') { startCount++; balance++; }
        else if (lb.direction === 'end') { if (balance === 0) { startCount++; balance++; } endCount++; balance--; }
      }
      if (isRepeat(rb)) {
        if (rb.direction === 'end') { if (balance === 0) { startCount++; balance++; } endCount++; balance--; }
        else throw new ExpanderException('a right barline is found that cannot be processed: <music21.stream.Measure ' + m.number + '>');
      }
    }
    if (balance !== 0 && balance !== 1) return false;
    if (startCount !== endCount && startCount !== endCount - 1) return false;
    return true;
  }
  // Expander._groupRepeatBracketIndices
  function groupRepeatBracketIndices(ms, brackets) {
    const groups = [];
    let found = [];
    let group = { brackets: [], indices: [] };
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      for (const rb of brackets) {
        if (rb.measures[0] === m) {
          if (found.indexOf(rb.number[0]) >= 0) { groups.push(group); found = []; group = { brackets: [], indices: [] }; }
          found = found.concat(rb.number);
          group.brackets.push(rb);
          const last = rb.measures[rb.measures.length - 1];
          for (let j = 0; j < ms.length; j++) {
            if (j >= i && ms[j] !== last) group.indices.push(j);
            else if (ms[j] === last) { group.indices.push(j); break; }
          }
        }
      }
    }
    groups.push(group); // `if groupIndices:` is always true for the dict
    return groups;
  }
  function repeatBracketsAreCoherent(ms, brackets) {
    for (const g of groupRepeatBracketIndices(ms, brackets)) {
      const rbs = g.brackets;
      if (!rbs.length) return true;
      if (rbs.length > 1) {
        const target = [];
        for (const rb of rbs) for (const x of rb.number) target.push(x);
        const max = Math.max.apply(null, target);
        const match = [];
        for (let k = 1; k <= max; k++) match.push(k);
        if (match.join() !== target.join()) return false;
      }
      const spanned = new Set();
      for (let c = 0; c < rbs.length; c++) {
        const rb = rbs[c];
        let m = rb.measures[rb.measures.length - 1];
        for (const x of rb.measures) { if (spanned.has(x)) return false; spanned.add(x); m = x; }
        if (!isRepeat(m.rightBarline)) {
          if (rbs.length === 1 || c < rbs.length - 1) return false;
        }
      }
    }
    return true;
  }
  function findInnermostRepeatIndices(ms) {
    const starts = [];
    for (let i = 0; i < ms.length; i++) {
      const lb = ms[i].leftBarline, rb = ms[i].rightBarline;
      if (isRepeat(lb)) {
        if (lb.direction === 'start') starts.push(i);
        else if (lb.direction === 'end') return range(starts.length ? starts[starts.length - 1] : 0, i);
      }
      if (isRepeat(rb) && rb.direction === 'end') return range(starts.length ? starts[starts.length - 1] : 0, i + 1);
    }
    return [];
  }
  function range(a, b) { const r = []; for (let k = a; k < b; k++) r.push(k); return r; }
  function getEndRepeatBar(ms, index) {
    const mLast = ms[index];
    const rb = mLast.rightBarline;
    let mEnd, times;
    if (isRepeat(rb) && rb.direction === 'end') { mEnd = mLast; times = rb.times; }
    else {
      if (index >= ms.length - 1) throw new ExpanderException('cannot find an end Repeat bar after the given end: ' + index);
      mEnd = ms[index + 1];
      const lb = mEnd.leftBarline;
      if (isRepeat(lb) && lb.direction === 'end') times = lb.times;
      else throw new ExpanderException('cannot find an end Repeat bar in the expected position');
    }
    if (times == null) times = 2;
    return [mLast, mEnd, times];
  }
  function stripRepeatBarlines(m) {
    if (isRepeat(m.leftBarline)) m.leftBarline = { repeat: false, location: 'left' };
    if (isRepeat(m.rightBarline)) m.rightBarline = { repeat: false, location: 'right' };
  }
  function processInnermostRepeatBars(ms, repeatIndices, repeatTimes, expansionOnly) {
    const out = [];
    let forced = true;
    if (repeatIndices == null) { repeatIndices = findInnermostRepeatIndices(ms); forced = false; }
    let stripNext = false;
    let i = 0;
    while (i < ms.length) {
      if (!repeatIndices.length) break;
      if (i === repeatIndices[0]) {
        let mLast = null, mEnd = null, found = null;
        try { [mLast, mEnd, found] = getEndRepeatBar(ms, repeatIndices[repeatIndices.length - 1]); }
        catch (e) { if (!forced) throw e; }
        if (repeatTimes == null) repeatTimes = found;
        for (let t = 0; t < repeatTimes; t++) {
          for (const j of repeatIndices) {
            const sub = copyMeasure(ms[j]);
            if (j === repeatIndices[0] || j === repeatIndices[repeatIndices.length - 1]) stripRepeatBarlines(sub);
            out.push(sub);
          }
        }
        if (mLast !== mEnd) stripNext = true;
        i = repeatIndices[repeatIndices.length - 1] + 1;
      } else {
        if (!expansionOnly) {
          const m = ms[i];
          if (stripNext) { stripRepeatBarlines(m); stripNext = false; }
          out.push(m);
        }
        i++;
      }
    }
    return out;
  }
  function processInnermostRepeatsAndBrackets(ms, brackets, memo) {
    const groups = groupRepeatBracketIndices(ms, brackets);
    const innermost = findInnermostRepeatIndices(ms);
    let focus = null;
    for (const g of groups) {
      if (!innermost.length) continue;
      const mStart = ms[innermost[0]], mEnd = ms[innermost[innermost.length - 1]];
      for (const rb of g.brackets) {
        if (memo.has(rb)) break;
        if (rb.measures.indexOf(mStart) >= 0 || rb.measures.indexOf(mEnd) >= 0) { focus = g; break; }
      }
      if (focus) break;
    }
    if (!focus) return processInnermostRepeatBars(ms, null, null, false);
    const pre = ms.slice(0, innermost[0]);
    const repeats = [];
    let highest = null;
    const boundaries = [];
    for (const rb of focus.brackets) {
      memo.add(rb);
      const startIndex = innermost[0];
      const mFirst = rb.measures[0], mLast = rb.measures[rb.measures.length - 1];
      let endIndex = null, bracketStart = null;
      ms.forEach((m, k) => { if (m === mLast) endIndex = k; if (m === mFirst) bracketStart = k; });
      if (endIndex === null || bracketStart === null) throw new ExpanderException('failed to find start or end index of bracket expansion');
      const indices = range(startIndex, endIndex + 1);
      const bracketIndices = range(bracketStart, endIndex + 1);
      for (const d of boundaries) for (const q of d.bracketIndices) { const at = indices.indexOf(q); if (at >= 0) indices.splice(at, 1); }
      boundaries.push({ rb: rb, valid: indices, bracketIndices: bracketIndices });
    }
    for (const d of boundaries) {
      repeats.push(processInnermostRepeatBars(ms, d.valid, d.rb.number.length, true));
      highest = Math.max.apply(null, d.valid);
    }
    const out = pre.slice();
    for (const sub of repeats) for (const m of sub) { stripRepeatBarlines(m); out.push(m); }
    for (const m of ms.slice(highest + 1)) out.push(m);
    return out;
  }
  // Stream.expandRepeats on one part: the measures with their new offsets (or null: nothing to do)
  function expandRepeats(part) {
    const src = part.measures;
    if (!hasRepeat(src)) return null; // isExpandable() is None: the copy keeps its offsets
    if (!repeatBarsAreCoherent(src) || !repeatBracketsAreCoherent(src, part.brackets)) {
      throw new ExpanderException('cannot expand Stream: badly formed repeats or repeat expressions');
    }
    let ms = src.slice();
    const memo = new Set();
    for (let k = 0; k < 100; k++) {
      ms = processInnermostRepeatsAndBrackets(ms, part.brackets, memo);
      if (!hasRepeat(ms)) break;
    }
    // Stream.append: each measure goes to the stream's highestTime so far, which then becomes
    // opFrac(highestTime + the measure's duration) (a measure lasts its own highestTime)
    let off = Q0;
    for (const m of ms) {
      m.offset = off;
      const ql = measureHighestTime(m);
      if (qcmp(ql, Q0) !== 0) off = opFrac(pyAdd(pv(off), pv(ql)));
    }
    return ms;
  }

  // ======================================================================================
  // midi/translate.py: streamToMidiFile
  // ======================================================================================
  // Stream.flatten(): every element with its offset in the part, sorted by music21's sort key.
  // The RecursiveIterator starts at 0.0 and adds each container's offset (a float sum), and the
  // element goes in at opFrac(start + offset): flatOffset(m.offset, e.offset).
  const flatOffset = (mOff, eOff) => opFracF(fval(pv(mOff)) + fval(pv(eOff)));
  function flattenPart(part, kinds) {
    const all = [];
    const add = (e, off) => { if (!e.removed && (!kinds || kinds[e.kind])) all.push({ e: e, offset: off, kind: e.kind, grace: e.grace }); };
    for (const e of part.instruments) add(e, flatOffset(Q0, e.offset || Q0));
    for (const e of part.extra) add(e, flatOffset(Q0, e.offset || Q0));
    for (const m of part.measures) {
      for (const e of m.items) add(e, flatOffset(m.offset, e.offset));
      for (const v of m.voices) for (const e of v.items) add(e, flatOffset(m.offset, e.offset)); // + the voice's 0.0
    }
    // stable sort = (offset, classSortOrder, isNotGrace, insertion order)
    return all.map((x, i) => (x.i = i, x)).sort((a, b) => sortKeyCmp(a, b) || a.i - b.i);
  }
  // Music21Object.getOffsetInHierarchy(score) through contextSites: opFrac(offsetInSite +
  // offsetAppend) at each level, from the element (offsetAppend 0.0) up through its voice (at
  // 0.0), measure and part (at 0.0)
  const up = (siteOff, acc) => opFrac(pyAdd(siteOff, pv(acc)));
  function hierarchyOffset(mOff, eOff, inVoice) {
    let o = up(pv(eOff), Q0);            // in its measure or voice: opFrac(offset + 0.0)
    if (inVoice) o = up(F0, o);          // the voice in the measure
    if (mOff) o = up(pv(mOff), o);       // the measure in the part
    return up(F0, o);                    // the part in the score
  }
  // the sorted recursion of Stream.recurse() for one class: part-level elements and measures merge
  // by (offset, classSortOrder) with Measure = -20; inside a measure, its own sorted elements
  function recurseClass(part, kind) {
    const out = [];
    const top = [];
    part.instruments.concat(part.extra).forEach((e) => top.push({ offset: e.offset || Q0, cso: CSO[e.kind], e: e }));
    part.measures.forEach((m) => top.push({ offset: m.offset, cso: -20, m: m }));
    top.forEach((x, i) => { x.i = i; });
    top.sort((a, b) => qcmp(a.offset, b.offset) || a.cso - b.cso || a.i - b.i);
    for (const x of top) {
      if (x.e) { if (x.e.kind === kind && !x.e.removed) out.push({ e: x.e, offset: hierarchyOffset(null, x.offset, false) }); continue; }
      const items = x.m.items.map((e, i) => ({ e: e, offset: e.offset, kind: e.kind, grace: e.grace, i: i }))
        .sort((a, b) => sortKeyCmp(a, b) || a.i - b.i);
      for (const it of items) if (it.kind === kind && !it.e.removed) out.push({ e: it.e, offset: hierarchyOffset(x.m.offset, it.offset, false) });
      for (const v of x.m.voices) {
        const vi = v.items.map((e, i) => ({ e: e, offset: e.offset, kind: e.kind, grace: e.grace, i: i }))
          .sort((a, b) => sortKeyCmp(a, b) || a.i - b.i);
        for (const it of vi) if (it.kind === kind && !it.e.removed) out.push({ e: it.e, offset: hierarchyOffset(x.m.offset, it.offset, true) });
      }
    }
    return out;
  }
  // midi.translate.conductorStream: tempo, time and key signatures move to a conductor part;
  // one per offset, in recursion order ("don't overwrite an event of the same class at this offset")
  function conductorStream(parts) {
    const cond = [];
    for (const kind of ['metronome', 'time', 'key']) {
      let last = null;
      for (const p of parts) {
        for (const x of recurseClass(p, kind)) {
          if (last === null || qcmp(x.offset, last) > 0) cond.push({ e: x.e, offset: x.offset });
          last = x.offset;
        }
      }
      for (const p of parts) {
        p.extra = p.extra.filter((e) => e.kind !== kind);
        for (const m of p.measures) { m.items = m.items.filter((e) => e.kind !== kind); for (const v of m.voices) v.items = v.items.filter((e) => e.kind !== kind); }
      }
    }
    if (!cond.some((x) => x.e.kind === 'metronome')) cond.push({ e: { kind: 'metronome', number: 120, sounding: null, referent: 1 }, offset: Q0 });
    if (!cond.some((x) => x.e.kind === 'time')) cond.push({ e: { kind: 'time', num: 4, den: 4 }, offset: Q0 });
    return cond.map((x, i) => ({ e: x.e, offset: x.offset, kind: x.e.kind, i: i })).sort((a, b) => sortKeyCmp(a, b) || a.i - b.i);
  }
  // volume.realizeVolume: dynamics hold until the next one (extendDuration); velocity scalar
  // 0.5 + 0.20866, times 2 * dynamic, plus each articulation's volumeShift, clipped to [0, 1]
  function realizeVolume(part) {
    const flat = flattenPart(part);
    const dyns = flat.filter((x) => x.kind === 'dynamic');
    // boundaries[(start, end)] = dynamic: a later dynamic with the same key replaces the earlier
    // one in its place (Python dict). The end is NOT opFrac'd: a dynamic on a float offset lasting
    // a Fraction can end a rounding error after the next one starts.
    const bounds = new Map();
    if (dyns.length) {
      const total = highestTime(flat, null); // the flat stream's duration before the dynamics are stretched
      dyns.forEach((x, k) => {
        const next = k + 1 < dyns.length ? dyns[k + 1].offset : total;
        const span = opFrac(pySub(pv(next), pv(x.offset)));   // extendDuration: opFrac(next - this)
        const end = exact(pyAdd(pv(x.offset), pv(span)));      // start + duration.quarterLength
        const key = x.offset.n + '/' + x.offset.d + '|' + end.n + '/' + end.d;
        if (bounds.has(key)) bounds.get(key).dyn = x.e; else bounds.set(key, { start: x.offset, end: end, dyn: x.e });
      });
    }
    const keys = Array.from(bounds.values()).sort((a, b) => qcmp(a.start, b.start) || qcmp(a.end, b.end));
    let lastIdx = 0;
    for (const x of flat) {
      if (x.kind !== 'note' && x.kind !== 'chord') continue;
      let dm = null;
      if (keys.length) {
        const st = x.offset;
        for (let k = lastIdx; k < keys.length; k++) {
          if (qcmp(keys[k].end, st) > 0 && qcmp(st, keys[k].start) >= 0) { lastIdx = k; dm = keys[k].dyn; break; }
        }
      }
      let val = 0.5;
      val += 0.20866;
      if (dm) val = val * (dynamicScalar(dm.value) * 2.0); // Dynamic.volumeScalar, only for a note in its span
      for (const a of x.e.arts) val += ART_SHIFT[a];
      if (val > 1) val = 1.0; else if (val < 0) val = 0.0;
      x.e.velocity = pyRound(val * 127);
    }
  }
  // Stream.stripTies(matchByPitch=True) on a part: tie chains in the flat notes-and-rests order
  function stripTies(part) {
    const nr = flattenPart(part, { note: 1, chord: 1, rest: 1 }).filter((x) => qcmp(x.e.ql, Q0) > 0).map((x) => x.e);
    const tieOf = (n) => { if (n.kind === 'rest') return null; for (const t of n.ties) if (t != null) return t; return null; };
    // Pitch.__eq__: step, octave and accidental (no accidental != a natural)
    const pitchEq = (a, b) => a.step === b.step && a.octave === b.octave && a.alter === b.alter;
    const pitchesOf = (x) => (x.kind === 'rest' ? [] : x.pitches); // GeneralNote.pitches: () for a rest
    let pos = [];
    const del = [];
    let nLast = null, iLast = null;
    // updateEndMatch (matchByPitch=True)
    function endMatch(n) {
      if (n.kind === 'note' && n.ties[0] === 'stop') return true;
      if (nLast && pos.indexOf(iLast) >= 0 && nLast.kind === 'note' && n.kind === 'note' && pitchEq(nLast.pitches[0], n.pitches[0])) return true;
      if (nLast && n.kind !== 'note' && pos.indexOf(iLast) >= 0) {
        const pl = pitchesOf(nLast), pi = pitchesOf(n);
        if (pl.length !== pi.length) return false;
        for (let k = 0; k < pl.length; k++) if (pl[k].step !== pi[k].step || pitchPs(pl[k]) !== pitchPs(pi[k])) return false;
        return true;
      }
      return false;
    }
    for (let i = 0; i < nr.length; i++) {
      let em = null;
      const n = nr[i];
      if (i > 0) { iLast = i - 1; nLast = nr[iLast]; } else { iLast = null; nLast = null; }
      const tt = tieOf(n);
      if (tt === 'start') {
        if (iLast === null || pos.indexOf(iLast) < 0) pos = [i]; else pos.push(i);
        em = false;
      } else if (tt === 'continue') {
        if (!pos.length) { pos.push(i); em = false; }
        else if (endMatch(n)) { pos.push(i); em = false; }
        else { pos = [i]; em = false; }
      }
      if (em === null) em = endMatch(n);
      if (em) {
        pos.push(i);
        if (pos.length < 2) { pos = []; continue; }
        let sum = { q: Q0 }; // durSum = 0 (an int), += quarterLength
        for (const q of pos.slice(1)) { sum = pyAdd(sum, pv(nr[q].ql)); del.push(q); }
        if (pyCmp(sum, { q: Q0 }) === 0) throw pyError('StreamException', 'aggregated ties have a zero duration sum');
        const first = nr[pos[0]];
        first.ql = opFrac(pyAdd(pv(first.ql), sum)); // opFrac(qLen + durSum)
        if (first.ties) first.ties = first.ties.map(() => null);
        pos = [];
      }
    }
    for (const q of del) nr[q].removed = true;
  }

  // channelInstrumentData: programs -> channels (1-based), honouring the parts' midi-channel
  function channelInstrumentData(parts) {
    const acceptable = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16];
    const all = [];
    const byProg = new Map();
    const assigned = new Set();
    for (const p of parts) {
      const insts = flattenPart(p, { instrument: 1 }).map((x) => x.e);
      for (const inst of insts) {
        if (inst.channel != null && !byProg.has(inst.program)) {
          let ch = inst.channel + 1;
          const at = acceptable.indexOf(ch);
          if (at >= 0) acceptable.splice(at, 1);
          else if (ch !== 10) ch = 1;
          assigned.add(ch);
          byProg.set(inst.program, ch);
        }
        if (all.indexOf(inst.program) < 0) all.push(inst.program);
      }
      if (!insts.length && all.indexOf(null) < 0) all.push(null);
    }
    const still = all.filter((x) => !byProg.has(x));
    still.forEach((prog, i) => {
      const ch = i < acceptable.length - 1 ? acceptable[i] : acceptable[0];
      byProg.set(prog, ch); assigned.add(ch);
    });
    return byProg;
  }

  // the whole translation: parts (already transposed, with the engine's inserts) -> MIDI tracks
  // of events {tick, type, ...}; type: 'track_name' | 'program_change' | 'pitchwheel' | 'note_on'
  // | 'note_off' | 'set_tempo' | 'key_signature' | 'time_signature' | 'end_of_track'
  function scoreToTracks(scoreParts, opts) {
    opts = opts || {};
    const warnings = [];
    let parts = scoreParts.map(copyPart);
    // 1. expandRepeats (on every part; any failure fails the whole score in music21)
    let expanded = true;
    try {
      const ex = parts.map(expandRepeats);
      parts.forEach((p, k) => { if (ex[k]) p.measures = ex[k]; });
    } catch (e) {
      if (!(e instanceof ExpanderException) || opts.strict) throw e;
      expanded = false;
      warnings.push('repeats not expanded: ' + e.message);
      parts = scoreParts.map(copyPart);
    }
    // 2. conductor (removes tempo/time/key from the parts), 3. volumes per part
    const cond = conductorStream(parts);
    for (const p of parts) realizeVolume(p);
    const byProg = channelInstrumentData(parts);
    // 4. ties
    for (const p of parts) stripTies(p);
    // 5. packets per track
    const tracks = [];
    const t0 = [];
    for (const x of cond) {
      const tk = ticks(flatOffset(Q0, x.offset)), e = x.e; // the conductor Part flattened: opFrac(0.0 + offset)
      if (e.kind === 'metronome') {
        const num = e.sounding != null ? e.sounding : e.number;
        if (num == null) continue;
        const bpm = num * e.referent;
        // tempoToMidiEvents: int(round(60_000_000 / bpm)); a mark of 0 fails music21's MIDI writer
        // (the engine then reports the error and writes no MIDI)
        if (bpm === 0) throw pyError('ZeroDivisionError', 'division by zero');
        t0.push({ tick: tk, so: 0, type: 'set_tempo', tempo: pyRound(60000000 / bpm) });
      } else if (e.kind === 'key') t0.push({ tick: tk, so: 0, type: 'key_signature', sharps: e.sharps, minor: !!e.minor });
      else if (e.kind === 'time') { if (e.num <= 255) t0.push({ tick: tk, so: 0, type: 'time_signature', num: e.num, den: e.den }); }
    }
    tracks.push(finishTrack([], t0));
    parts.forEach((p) => {
      const flat = flattenPart(p);
      const insts = flat.filter((x) => x.kind === 'instrument');
      const init = insts.length ? insts[0].e : null;
      const ch = init ? byProg.get(init.program) : (byProg.has(null) ? byProg.get(null) : 1);
      const pk = [];
      for (const x of flat) {
        const e = x.e, tk = ticks(x.offset);
        if (e.kind === 'instrument') pk.push({ tick: tk, so: 0, type: 'program_change', channel: ch, program: e.program == null ? 0 : e.program });
        else if (e.kind === 'note' || e.kind === 'chord') {
          const off = tk + ticks(e.ql);
          const midis = e.pitches.map(pitchMidi);
          for (const mi of midis) pk.push({ tick: tk, so: 0, type: 'note_on', channel: ch, note: mi, velocity: e.velocity });
          for (const mi of midis) pk.push({ tick: off, so: -20, type: 'note_off', channel: ch, note: mi, velocity: 0 });
        }
      }
      pk.forEach((x, i) => { x.i = i; });
      pk.sort((a, b) => a.tick - b.tick || a.so - b.so || a.i - b.i);
      // assignPacketsToChannels: a zero pitch bend at 0 for the track's channel, then the same sort
      pk.push({ tick: 0, so: -10, type: 'pitchwheel', channel: ch, pitch: 0 });
      pk.forEach((x, i) => { x.i = i; });
      pk.sort((a, b) => a.tick - b.tick || a.so - b.so || a.i - b.i);
      const start = [{ tick: 0, type: 'track_name', name: utf8(init ? (bestName(init) || '') : '') }];
      if (init && init.program != null) start.push({ tick: 0, type: 'program_change', channel: ch, program: init.program });
      tracks.push(finishTrack(start, pk));
    });
    return { tracks: tracks, warnings: warnings, expanded: expanded };
  }
  function finishTrack(start, packets) {
    const ev = start.slice();
    let last = 0;
    for (const p of packets) { ev.push(p); last = p.tick; }
    ev.push({ tick: last + TPQ, type: 'end_of_track' }); // getEndEvents: a quarter of silence
    return ev;
  }
  function utf8(s) { return Array.from(new TextEncoder().encode(s)); }
  function latin1(s) {
    const out = [];
    for (const ch of s) { const c = ch.codePointAt(0); if (c > 255) return null; out.push(c); }
    return out;
  }

  // ======================================================================================
  // SMF bytes: music21's writer (no running status) and mido's (running status, meta resets it)
  // ======================================================================================
  function varLen(n) {
    const b = [n & 0x7f];
    n = Math.floor(n / 128);
    while (n > 0) { b.unshift((n & 0x7f) | 0x80); n = Math.floor(n / 128); }
    return b;
  }
  function eventBytes(e) {
    switch (e.type) {
      case 'note_on': return [0x90 | (e.channel - 1), e.note, e.velocity];
      case 'note_off': return [0x80 | (e.channel - 1), e.note, e.velocity];
      case 'program_change': return [0xc0 | (e.channel - 1), e.program];
      case 'pitchwheel': { const v = e.pitch + 8192; return [0xe0 | (e.channel - 1), v & 0x7f, v >> 7]; }
      case 'track_name': return [0xff, 0x03].concat(varLen(e.name.length), e.name);
      case 'set_tempo': return [0xff, 0x51, 3, (e.tempo >> 16) & 255, (e.tempo >> 8) & 255, e.tempo & 255];
      case 'key_signature': return [0xff, 0x59, 2, e.sharps & 255, e.minor ? 1 : 0];
      case 'time_signature': return [0xff, 0x58, 4, e.num, Math.floor(Math.log2(e.den)), 24, 8];
      case 'end_of_track': return [0xff, 0x2f, 0];
      default: throw new Error('OMR.midi: unknown event ' + e.type);
    }
  }
  function chunk(id, body) {
    const n = body.length;
    return [id.charCodeAt(0), id.charCodeAt(1), id.charCodeAt(2), id.charCodeAt(3), (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].concat(body);
  }
  function header(ntracks) { return chunk('MThd', [0, 1, (ntracks >> 8) & 255, ntracks & 255, (TPQ >> 8) & 255, TPQ & 255]); }
  function writeMusic21(tracks) {
    let out = header(tracks.length);
    for (const t of tracks) {
      const body = [];
      let last = 0;
      for (const e of t) { for (const b of varLen(e.tick - last)) body.push(b); last = e.tick; for (const b of eventBytes(e)) body.push(b); }
      out = out.concat(chunk('MTrk', body));
    }
    return new Uint8Array(out);
  }
  function writeMido(tracks) {
    let out = header(tracks.length);
    for (const t of tracks) {
      const body = [];
      let last = 0, running = null;
      // fix_end_of_track: one end_of_track, last, keeping the time of the removed ones
      const evs = t.filter((e) => e.type !== 'end_of_track');
      const eotTick = t.reduce((m, e) => (e.type === 'end_of_track' ? Math.max(m, e.tick) : m), evs.length ? evs[evs.length - 1].tick : 0);
      evs.push({ tick: eotTick, type: 'end_of_track' });
      for (const e of evs) {
        for (const b of varLen(e.tick - last)) body.push(b);
        last = e.tick;
        const bytes = eventBytes(e);
        if (bytes[0] === 0xff) { running = null; for (const b of bytes) body.push(b); continue; }
        if (bytes[0] === running) for (let k = 1; k < bytes.length; k++) body.push(bytes[k]);
        else for (const b of bytes) body.push(b);
        running = bytes[0] < 0xf0 ? bytes[0] : null;
      }
      out = out.concat(chunk('MTrk', body));
    }
    return new Uint8Array(out);
  }
  // SheetLab's _polish_midi_file on mido's view of the music21 file
  function polish(tracks, tempo, program, title) {
    // mido cannot read a key signature beyond 7 sharps/flats (KeySignatureError): the engine's bare
    // except then keeps music21's file as it is
    for (const t of tracks) for (const e of t) if (e.type === 'key_signature' && (e.sharps > 7 || e.sharps < -7)) return { bytes: writeMusic21(tracks), polished: false, why: 'key signature of ' + e.sharps + ' sharps' };
    // mido.bpm2tempo(tempo): a set_tempo outside 0..0xFFFFFF (under ~3.58 bpm) makes mido raise
    // before anything is saved: again the bare except keeps music21's file
    const tempoUs = pyRound(60 * 1e6 / tempo);
    if (!(tempoUs >= 0 && tempoUs <= 0xffffff)) return { bytes: writeMusic21(tracks), polished: false, why: 'a tempo of ' + tempo + ' bpm does not fit a MIDI set_tempo' };
    const out = tracks.map((t) => t.map((e) => Object.assign({}, e)));
    let titleBytes = null, titleUtf8 = false;
    if (title) { titleBytes = latin1(title); if (!titleBytes) { titleBytes = utf8(title); titleUtf8 = true; } }
    out.forEach((t, idx) => {
      if (idx === 0) {
        t.unshift({ tick: 0, type: 'set_tempo', tempo: tempoUs });
        if (titleBytes) t.unshift({ tick: 0, type: 'track_name', name: titleBytes });
      }
      let has = false;
      for (const e of t) if (e.type === 'program_change') { e.program = program; has = true; }
      if (!has) t.unshift({ tick: 0, type: 'program_change', channel: 1, program: program });
    });
    return { bytes: writeMido(out), polished: true, tracks: out, titleUtf8: titleUtf8 };
  }

  // ======================================================================================
  // public API
  // ======================================================================================
  function engineScore(xml, opts) {
    const score = importScore(xml);
    const n = opts.transpose | 0;
    if (n) transposeScore(score, n);
    const program = opts.program == null ? 0 : opts.program;
    const tempo = opts.tempo == null ? 112 : opts.tempo;
    for (const p of score.parts) {
      // part.insert(0, instrumentFromMidiProgram(gm)); inst.instrumentName = options.instrument_name;
      // part.insert(0, MetronomeMark(number=tempo)). (The part's own instrument stays first, so the
      // track name never comes from this one.)
      p.extra.push({ kind: 'instrument', offset: Q0, program: program, channel: null, partName: null, instrumentName: opts.instrumentName || null });
      p.extra.push({ kind: 'metronome', offset: Q0, number: tempo, sounding: null, referent: 1 });
    }
    return score;
  }
  // -> {midi: Uint8Array, warnings, repeatsExpanded, polished, summary}
  function convert(xml, opts) {
    opts = Object.assign({}, opts || {});
    // TranslationOptions' defaults; an option given as undefined/null takes its default too (an
    // undefined tempo used to give a set_tempo of 0 and a NaN length)
    if (opts.tempo == null) opts.tempo = 112;
    if (opts.program == null) opts.program = 0;
    if (opts.transpose == null) opts.transpose = 0;
    if (opts.title == null) opts.title = '';
    if (typeof opts.program === 'string' && /^\s*\d+\s*$/.test(opts.program)) {
      // a program NUMBER as a string (e.g. a <select> value): no GM name is all digits, and
      // GM_INSTRUMENTS.get('24', 0) would silently give the piano
      opts.program = Number(opts.program);
    } else if (typeof opts.program === 'string') { // GM_INSTRUMENTS.get(options.instrument_name, 0)
      if (opts.instrumentName == null) opts.instrumentName = opts.program;
      opts.program = Object.prototype.hasOwnProperty.call(GM_INSTRUMENTS, opts.program) ? GM_INSTRUMENTS[opts.program] : 0;
    }
    // the engine only takes a menu name; a number outside the GM range would corrupt the file
    if (!Number.isInteger(opts.program) || opts.program < 0 || opts.program > 127) throw new RangeError('OMR.midi: program must be 0..127 or a GM_INSTRUMENTS name, not ' + opts.program);
    opts.tempo = Number(opts.tempo);
    if (!Number.isFinite(opts.tempo)) throw new TypeError('OMR.midi: tempo must be a number of beats per minute');
    if (!Number.isInteger(Number(opts.transpose))) throw new RangeError('OMR.midi: transpose must be a whole number of semitones, not ' + opts.transpose);
    opts.transpose = Number(opts.transpose);
    opts.title = String(opts.title);
    // step 4 starts with music21.converter.parse (expat): a character XML 1.0 forbids (in practice a
    // control character of a PDF title in <work-title>) makes the engine fail with no MIDI at all.
    // strict reproduces that error; otherwise the MIDI is made and the warning says the MusicXML
    // is not well-formed (other readers will refuse it too).
    const bad = typeof xml === 'string' ? charError(xml) : null;
    if (bad && opts.strict) throw pyError('ParseError', bad);
    const score = engineScore(xml, opts);
    const counts = scoreCounts(score);
    const res = scoreToTracks(score.parts, { strict: opts.strict });
    const pol = polish(res.tracks, opts.tempo, opts.program, opts.title);
    const warnings = (bad ? ['MusicXML is not well-formed (' + bad + '): music21 cannot read it, so the engine writes no MIDI'] : []).concat(res.warnings);
    if (!pol.polished) warnings.push('MIDI left as music21 wrote it (' + pol.why + '), like the engine');
    if (pol.titleUtf8) warnings.push('title written as UTF-8 (latin-1 cannot encode it)');
    const sm = midiSummary(readSmf(pol.bytes), opts.tempo);
    return {
      midi: pol.bytes, warnings: warnings, repeatsExpanded: res.expanded, polished: pol.polished,
      summary: { measures: counts.measures, notes: counts.notes, chords: counts.chords, durationSeconds: sm.durationSeconds, noteEvents: sm.noteEvents }
    };
  }
  function fromMusicXml(xml, opts) {
    const r = convert(xml, opts);
    if (opts && typeof opts.onWarning === 'function') for (const w of r.warnings) opts.onWarning(w);
    return r.midi;
  }

  // the engine's transposed .musicxml: homr's XML with music21's new spellings and keys
  // (music21 rewrites the whole document; this keeps homr's and only changes pitches and keys)
  function transposeMusicXml(xml, semitones) {
    const n = semitones == null ? 0 : Number(semitones);
    if (!Number.isInteger(n)) throw new RangeError('OMR.midi: transpose must be a whole number of semitones, not ' + semitones);
    const doc = xmlParse(xml);
    if (!n) return xmlSerialize(doc);
    const visit = (node) => {
      for (const c of node.children) {
        if (c.type !== 'element') continue;
        if (c.name === 'note') {
          const p = find(c, 'pitch');
          if (p) {
            const step = (stripped(find(p, 'step')) || 'C').toUpperCase();
            const altEl = find(p, 'alter');
            const alter = altEl ? parseFloat(stripped(altEl)) || 0 : 0;
            const octEl = find(p, 'octave');
            const oct = octEl ? parseInt(stripped(octEl), 10) : 4;
            if (Number.isInteger(alter) && STEP_PC[step] !== undefined) {
              const np = spellPs(pitchPs({ step: step, alter: alter, octave: oct }) + n);
              setText(find(p, 'step'), np.step);
              if (octEl) setText(octEl, String(np.octave));
              if (np.alter) {
                if (altEl) setText(altEl, String(np.alter));
                else p.children.push({ type: 'element', name: 'alter', attrs: {}, children: [{ type: 'text', text: String(np.alter) }] });
              } else if (altEl) p.children.splice(p.children.indexOf(altEl), 1);
              const acc = find(c, 'accidental');
              if (acc) setText(acc, ACC_NAME[np.alter] || 'natural');
            }
          }
        } else if (c.name === 'key') {
          const f = find(c, 'fifths');
          if (f) setText(f, String(transposeSharps(parseInt(stripped(f), 10) || 0, n)));
        } else visit(c);
      }
    };
    visit(doc);
    return xmlSerialize(doc);
  }
  const ACC_NAME = { '-2': 'flat-flat', '-1': 'flat', 0: 'natural', 1: 'sharp', 2: 'double-sharp' };
  function setText(elm, t) { if (elm) elm.children = [{ type: 'text', text: t }]; }

  // counts on the parsed score (TranslationResult declares them; the engine never filled them)
  function scoreCounts(score) {
    let measures = 0, notes = 0, chords = 0;
    for (const p of score.parts) {
      measures = Math.max(measures, p.measures.length);
      eachElement(p, (e) => {
        if (e.kind === 'note') notes += 1;
        else if (e.kind === 'chord') { notes += e.pitches.length; chords += 1; }
      });
    }
    return { measures: measures, notes: notes, chords: chords };
  }
  const NAMES = ['C', 'C#', 'D', 'E-', 'E', 'F', 'F#', 'G', 'G#', 'A', 'B-', 'B'];
  // seconds = last note event / ticks per quarter * 60 / tempo; note events like SheetLab's NoteEvent
  function midiSummary(smf, tempo) {
    let last = 0;
    const events = [];
    smf.tracks.forEach((t, ti) => {
      const on = {};
      for (const e of t) {
        if (e.type !== 'note_on' && e.type !== 'note_off') continue;
        last = Math.max(last, e.tick);
        const k = e.channel + ':' + e.note;
        if (e.type === 'note_on' && e.velocity > 0) (on[k] = on[k] || []).push(e.tick);
        else if (on[k] && on[k].length) {
          const st = on[k].shift();
          events.push({ pitchMidi: e.note, pitchName: NAMES[e.note % 12] + (Math.floor(e.note / 12) - 1), startBeat: st / smf.ticksPerBeat,
            durationBeats: (e.tick - st) / smf.ticksPerBeat, partIndex: ti - 1 });
        }
      }
    });
    events.sort((a, b) => a.startBeat - b.startBeat || a.partIndex - b.partIndex || a.pitchMidi - b.pitchMidi);
    return { durationSeconds: last / smf.ticksPerBeat * 60 / tempo, noteEvents: events };
  }
  function summary(xml, opts) {
    return convert(xml, opts).summary;
  }

  // a Standard MIDI File reader (running status, meta, sysex) for tests and the summary
  function readSmf(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const u32 = (p) => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
    if (String.fromCharCode(b[0], b[1], b[2], b[3]) !== 'MThd') throw new Error('readSmf: not a MIDI file');
    const format = (b[8] << 8) | b[9], ntracks = (b[10] << 8) | b[11], division = (b[12] << 8) | b[13];
    let p = 8 + u32(4);
    const tracks = [];
    for (let k = 0; k < ntracks && p + 8 <= b.length; k++) {
      const len = u32(p + 4), end = Math.min(b.length, p + 8 + len);
      let q = p + 8, tick = 0, running = null;
      const ev = [];
      const vl = () => { let v = 0, c; do { c = b[q++]; v = v * 128 + (c & 0x7f); } while (c & 0x80 && q < end); return v; };
      while (q < end) {
        tick += vl();
        let st = b[q];
        if (st < 0x80) st = running; else q++;
        if (st === 0xff) {
          const type = b[q++], ln = vl(), data = Array.from(b.subarray(q, q + ln));
          q += ln;
          running = null;
          const e = { tick: tick, meta: type, data: data };
          if (type === 0x03) { e.type = 'track_name'; e.name = data; }
          else if (type === 0x51) { e.type = 'set_tempo'; e.tempo = (data[0] << 16) | (data[1] << 8) | data[2]; }
          else if (type === 0x58) { e.type = 'time_signature'; e.num = data[0]; e.den = Math.pow(2, data[1]); e.clocks = data[2]; e.n32 = data[3]; }
          else if (type === 0x59) { e.type = 'key_signature'; e.sharps = data[0] > 127 ? data[0] - 256 : data[0]; e.minor = data[1] === 1; }
          else if (type === 0x2f) e.type = 'end_of_track';
          else e.type = 'meta';
          ev.push(e);
        } else if (st === 0xf0 || st === 0xf7) {
          const ln = vl(); ev.push({ tick: tick, type: 'sysex', data: Array.from(b.subarray(q, q + ln)) }); q += ln; running = null;
        } else {
          running = st;
          const hi = st & 0xf0, ch = (st & 0x0f) + 1;
          if (hi === 0xc0 || hi === 0xd0) { const d = b[q++]; ev.push(hi === 0xc0 ? { tick: tick, type: 'program_change', channel: ch, program: d } : { tick: tick, type: 'aftertouch', channel: ch, value: d }); }
          else {
            const d1 = b[q++], d2 = b[q++];
            if (hi === 0x90) ev.push({ tick: tick, type: 'note_on', channel: ch, note: d1, velocity: d2 });
            else if (hi === 0x80) ev.push({ tick: tick, type: 'note_off', channel: ch, note: d1, velocity: d2 });
            else if (hi === 0xe0) ev.push({ tick: tick, type: 'pitchwheel', channel: ch, pitch: ((d2 << 7) | d1) - 8192 });
            else if (hi === 0xb0) ev.push({ tick: tick, type: 'control_change', channel: ch, control: d1, value: d2 });
            else ev.push({ tick: tick, type: 'polytouch', channel: ch, note: d1, value: d2 });
          }
        }
      }
      tracks.push(ev);
      p = 8 + p + len;
    }
    return { format: format, ticksPerBeat: division, tracks: tracks };
  }

  OMR.midi = {
    fromMusicXml: fromMusicXml, convert: convert, transposeMusicXml: transposeMusicXml, summary: summary,
    importScore: importScore, transposeScore: transposeScore, readSmf: readSmf,
    GM_INSTRUMENTS: GM_INSTRUMENTS, TICKS_PER_QUARTER: TPQ,
    _internal: {
      Q: Q, qcmp: qcmp, qnum: qnum, pyFloat: pyFloat, opFracF: opFracF, opFracQ: opFracQ, opFrac: opFrac, pv: pv, pyAdd: pyAdd,
      pySub: pySub, doubleRatio: doubleRatio, limitDenominator: limitDenominator, nearestMultipleClose: nearestMultipleClose,
      highestTime: highestTime, flatOffset: flatOffset, hierarchyOffset: hierarchyOffset, qRound: qRound, pyRound: pyRound, ticks: ticks, pitchPs: pitchPs,
      pitchMidi: pitchMidi, spellPs: spellPs, transposeSharps: transposeSharps, engineScore: engineScore,
      scoreToTracks: scoreToTracks, polish: polish, writeMido: writeMido, writeMusic21: writeMusic21,
      expandRepeats: expandRepeats, flattenPart: flattenPart, dynamicScalar: dynamicScalar, scoreCounts: scoreCounts,
      ExpanderException: ExpanderException, ImportException: ImportException
    }
  };
})(typeof self !== 'undefined' ? self : globalThis);
