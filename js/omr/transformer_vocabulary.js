/* soundLAB OMR: port of homr/transformer/vocabulary.py (AGPL-3.0, github.com/liebharc/homr).
   The token vocabularies of the TrOMR decoder branches, EncodedSymbol (one decoded symbol) and
   the clean-up of a voice's symbols (remove_duplicated_symbols, sort_token_chords).
   Also OMR.fractions.Fraction: Python's fractions.Fraction (exact note durations), which every
   module of the symbol language needs and vocabulary.py is the first of them to load. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  const py = OMR.py;

  function eprint() {  // homr.simple_logging.eprint, looked up when called
    const L = OMR.simple_logging;
    if (L && L.eprint) L.eprint.apply(null, arguments);
  }
  function pyError(name, message) { const e = new Error(message); e.name = name; return e; }
  function startsWithAny(s, prefixes) { for (const p of prefixes) if (s.startsWith(p)) return true; return false; }

  // ---- fractions.Fraction --------------------------------------------------------------
  // numerator / denominator are JS integers, reduced, denominator > 0. Python's Fraction is
  // unbounded; here the REDUCED parts must stay below 2^53, which they do for music: every
  // denominator divides 2^10 * 3^2 * 5 * 7 * 11 * 13 * 17 (~8e8: the vocabulary's durations,
  // dots, the 2/3 of a triplet, a median's /2), so a numerator would only leave the range past
  // millions of whole notes. Intermediate products do NOT stay small: one measure of tuplets
  // like note_11.. note_13.. note_34.. note_96.. note_128.. sums to a denominator of ~4e8 and
  // comparing two such sums multiplies to ~1e17. So add/mul/cmp compute in Numbers while every
  // product is exact (a safe integer) and switch to BigInt otherwise; only a reduced result
  // beyond 2^53 throws (OverflowError) instead of silently losing precision.
  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { const t = a % b; a = b; b = t; }
    return a;
  }
  function safe(x) {
    if (!Number.isSafeInteger(x)) throw pyError(Number.isInteger(x) ? 'OverflowError' : 'TypeError', 'Fraction: not a safe integer: ' + x);
    return x;
  }
  const isSafe = Number.isSafeInteger;
  // (no BigInt literals: the file still parses where BigInt is missing; only this rare path needs it)
  function bigGcd(a, b) {
    const zero = BigInt(0);
    if (a < zero) a = -a;
    if (b < zero) b = -b;
    while (b) { const t = a % b; a = b; b = t; }
    return a;
  }
  function bigToSafe(b) {
    const x = Number(b);  // |b| >= 2^53 never maps to a safe integer
    if (!isSafe(x)) throw pyError('OverflowError', 'Fraction: ' + b + ' does not fit a JS number (2^53)');
    return x;
  }
  // the exact n/d of two BigInts, reduced, as a Fraction of JS numbers
  function fromBig(n, d) {
    const g = bigGcd(n, d) || BigInt(1);
    n /= g; d /= g;
    if (d < BigInt(0)) { n = -n; d = -d; }
    return new Fraction(bigToSafe(n), bigToSafe(d));
  }
  class Fraction {
    constructor(numerator, denominator) {
      if (numerator instanceof Fraction && denominator === undefined) {
        this.numerator = numerator.numerator; this.denominator = numerator.denominator; return;
      }
      let n = numerator === undefined ? 0 : numerator, d = denominator === undefined ? 1 : denominator;
      safe(n); safe(d);
      if (d === 0) throw pyError('ZeroDivisionError', 'Fraction(' + n + ', 0)');
      const g = gcd(n, d);
      n /= g; d /= g;
      if (d < 0) { n = -n; d = -d; }
      if (n === 0) n = 0;  // no negative zero
      this.numerator = n; this.denominator = d;
    }
    static from(x) { return x instanceof Fraction ? x : new Fraction(x); }
    add(o) {
      o = Fraction.from(o);
      const g = gcd(this.denominator, o.denominator);
      const a = this.numerator * (o.denominator / g), b = o.numerator * (this.denominator / g);
      const d = this.denominator * (o.denominator / g);
      // a product of integers is exact exactly when it comes out as a safe integer
      if (isSafe(a) && isSafe(b) && isSafe(a + b) && isSafe(d)) return new Fraction(a + b, d);
      const G = BigInt(g);
      return fromBig(BigInt(this.numerator) * (BigInt(o.denominator) / G) + BigInt(o.numerator) * (BigInt(this.denominator) / G),
        BigInt(this.denominator) * (BigInt(o.denominator) / G));
    }
    sub(o) { return this.add(Fraction.from(o).neg()); }
    mul(o) {
      o = Fraction.from(o);
      const g1 = gcd(this.numerator, o.denominator) || 1, g2 = gcd(o.numerator, this.denominator) || 1;
      const n = (this.numerator / g1) * (o.numerator / g2), d = (this.denominator / g2) * (o.denominator / g1);
      if (isSafe(n) && isSafe(d)) return new Fraction(n, d);
      // already reduced by the cross gcds: fromBig throws OverflowError past 2^53
      return fromBig(BigInt(this.numerator / g1) * BigInt(o.numerator / g2), BigInt(this.denominator / g2) * BigInt(o.denominator / g1));
    }
    div(o) {  // Python's /, true division
      o = Fraction.from(o);
      if (o.numerator === 0) throw pyError('ZeroDivisionError', 'Fraction(' + this + ', 0)');
      return this.mul(new Fraction(o.denominator, o.numerator));
    }
    neg() { return new Fraction(-this.numerator, this.denominator); }
    abs() { return this.numerator < 0 ? this.neg() : this; }
    cmp(o) {
      o = Fraction.from(o);
      const a = this.numerator * o.denominator, b = o.numerator * this.denominator;
      if (isSafe(a) && isSafe(b)) return a < b ? -1 : a > b ? 1 : 0;
      const A = BigInt(this.numerator) * BigInt(o.denominator), B = BigInt(o.numerator) * BigInt(this.denominator);
      return A < B ? -1 : A > B ? 1 : 0;
    }
    eq(o) { return this.cmp(o) === 0; }
    ne(o) { return this.cmp(o) !== 0; }
    lt(o) { return this.cmp(o) < 0; }
    le(o) { return this.cmp(o) <= 0; }
    gt(o) { return this.cmp(o) > 0; }
    ge(o) { return this.cmp(o) >= 0; }
    // int(f): truncates toward zero
    int() {
      const q = (Math.abs(this.numerator) - Math.abs(this.numerator) % this.denominator) / this.denominator;
      return this.numerator < 0 ? -q : q;
    }
    toNumber() { return this.numerator / this.denominator; }
    // str(f): '3/4', '2', '0', '-1/2'
    toString() { return this.denominator === 1 ? String(this.numerator) : this.numerator + '/' + this.denominator; }
  }
  // max()/min() over Fractions (or ints): the first extreme wins, like Python's
  Fraction.max = function (list) {
    if (!list.length) throw pyError('ValueError', 'max() arg is an empty sequence');
    let best = Fraction.from(list[0]);
    for (let i = 1; i < list.length; i++) { const f = Fraction.from(list[i]); if (f.gt(best)) best = f; }
    return best;
  };
  Fraction.min = function (list) {
    if (!list.length) throw pyError('ValueError', 'min() arg is an empty sequence');
    let best = Fraction.from(list[0]);
    for (let i = 1; i < list.length; i++) { const f = Fraction.from(list[i]); if (f.lt(best)) best = f; }
    return best;
  };
  // sorted(list_of_fractions): stable ascending
  Fraction.sorted = function (list) { return list.slice().sort((a, b) => a.cmp(b)); };
  OMR.fractions = OMR.fractions || { Fraction: Fraction };

  // ---- vocabularies ----------------------------------------------------------------------
  const nonote = '.';
  const empty = '_';  // used for decorations on note, if there is no decoration

  const VALID_TIME_SIGNATURE_DENOMINATORS = [1, 2, 3, 4, 6, 8, 12, 16, 32, 48];
  const DYNAMICS = ['pppp', 'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sfz', 'sffz', 'fp', 'sf', 'fz',
    'rf', 'rfz', 'sfp', 'empty'];
  const DYNAMICS_MODIFIER = ['piu', 'dolce', 'poco', 'espress', 'subito', 'atempo', 'leggiero', 'pocopiu', 'sempre'];

  // str.strip(): Python's whitespace (str.isspace) is not String.prototype.trim's: it includes
  // \x1c-\x1f and \x85 but not
  const PY_SPACE = '\t\n\x0b\x0c\r\x1c\x1d\x1e\x1f \x85\xa0        ' +
    '        　';
  function pyStrip(s) {
    let a = 0, b = s.length;
    while (a < b && PY_SPACE.includes(s[a])) a++;
    while (b > a && PY_SPACE.includes(s[b - 1])) b--;
    return s.slice(a, b);
  }

  // A dict[str, int] is a null-prototype object: its keys keep insertion order because no token
  // is an array index ("0", "17", ...), which build_dict checks.
  function buildDict(tokens) {
    // homr: transformer/vocabulary.py:47
    const result = Object.create(null);
    let i = 0;
    for (const t of tokens) {
      if (t in result) throw pyError('ValueError', 'Duplicated entry for ' + t);
      if (!pyStrip(t)) throw pyError('ValueError', 'Tokens must not be a whitespace, this makes parsing easier');
      if (pyStrip(t) !== t) throw pyError('ValueError', 'Tokens must not contain a whitespace, this makes parsing easier');
      if (t.includes('&')) throw pyError('ValueError', '& is reserved as alternatives for chords');
      if (/^(0|[1-9][0-9]*)$/.test(t)) throw pyError('ValueError', 'JS port: an integer token would break the key order: ' + t);
      result[t] = i++;
    }
    return result;
  }

  function buildRhythm() {
    // homr: transformer/vocabulary.py:62
    const rhythm = [];

    // sequence symbols
    rhythm.push('PAD', 'BOS', 'EOS');
    rhythm.push('chord');

    // bar lines
    rhythm.push('barline', 'doublebarline', 'bolddoublebarline');
    rhythm.push('repeatStart', 'repeatEnd', 'repeatEndStart');  // , "daCapo", "daSegno", "segno", "coda"
    rhythm.push('voltaStart', 'voltaStop', 'voltaDiscontinue');

    // clefs
    for (let c = 3; c < 6; c++) rhythm.push('clef_F' + c);
    for (let c = 1; c < 6; c++) rhythm.push('clef_C' + c);
    for (let c = 1; c < 3; c++) rhythm.push('clef_G' + c);
    rhythm.push('clef_TAB5');

    // signatures
    for (let c = -7; c < 8; c++) rhythm.push('keySignature_' + c);
    for (const c of VALID_TIME_SIGNATURE_DENOMINATORS) rhythm.push('timeSignature/' + c);

    // rhythm, kern durations are based on https://www.humdrum.org/rep/kern/
    for (let c = 2; c < 11; c++) rhythm.push('rest_' + c + 'm');  // multirests
    const kernBaseDurations = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 32, 64, 128];  // 128, 256, 512
    const dots = ['', '.', '..'];
    const grace = ['', 'G'];
    const kernValues = [];  // itertools.product(kern_base_durations, grace, dots)
    for (const d of kernBaseDurations) for (const g of grace) for (const dot of dots) kernValues.push('' + d + g + dot);

    // Durations coming from tuplets
    const irregularDurations = [7, 11, 13, 18, 20, 21, 22, 24, 26, 28, 30, 34, 36, 40, 48, 56, 96];

    for (const d of kernValues) rhythm.push('note_' + d);
    for (const d of irregularDurations) rhythm.push('note_' + d);
    for (const d of kernValues) rhythm.push('rest_' + d);
    for (const d of irregularDurations) rhythm.push('rest_' + d);

    // Dynamics
    for (const d of DYNAMICS) rhythm.push('dynamic_' + d);

    return buildDict(rhythm);
  }

  function buildLift() {
    // homr: transformer/vocabulary.py:109
    return buildDict([nonote, empty, '#', '##', 'N', 'b', 'bb']);
  }

  function buildPosition() {
    // homr: transformer/vocabulary.py:114
    // The staff position, applies to notes, rests and clefs
    return buildDict([nonote, 'upper', 'upper2', 'lower', 'lower2']);
  }

  function isLowerPosition(position) {
    // homr: transformer/vocabulary.py:122
    return position.startsWith('lower');
  }

  function isUpperOrHasNoPosition(position) {
    // homr: transformer/vocabulary.py:126
    return !isLowerPosition(position);
  }

  function _splitArticulations(articulation) {
    // homr: transformer/vocabulary.py:130
    // Split combined articulations while keeping dynamic modifiers intact.
    // Dynamic modifiers use the ``dynamic_`` prefix as part of their vocabulary
    // token (for example ``dynamic_dolce``), so that underscore is not a separator.
    const parts = articulation.split('_').filter((part) => part);
    const result = [];
    let index = 0;
    while (index < parts.length) {
      if (parts[index] === 'dynamic' && index + 1 < parts.length && DYNAMICS_MODIFIER.includes(parts[index + 1])) {
        result.push('dynamic_' + parts[index + 1]);
        index += 2;
      } else {
        result.push(parts[index]);
        index += 1;
      }
    }
    return result;
  }

  function buildArticulation() {
    // homr: transformer/vocabulary.py:154
    const articulation = [nonote, empty];

    // The lieder dataset has the superset of articulations
    // so we use it to define this list
    const articulationsLieder = [
      'accent', 'accent_accentStrong', 'accent_arpeggiate', 'accent_arpeggiate_fermata',
      'accent_arpeggiate_staccato', 'accent_arpeggiate_tenuto', 'accent_breathMark', 'accent_breathMark_fermata',
      'accent_fermata', 'accent_fermata_tremolo', 'accent_staccatissimo', 'accent_staccato',
      'accent_staccato_tenuto', 'accent_staccato_tremolo', 'accent_staccato_trill', 'accent_tenuto',
      'accent_tremolo', 'accent_trill', 'accentStrong', 'accentStrong_arpeggiate', 'accentStrong_arpeggiate_fermata',
      'accentStrong_arpeggiate_staccato', 'accentStrong_arpeggiate_tenuto', 'accentStrong_breathMark',
      'accentStrong_breathMark_fermata', 'accentStrong_fermata', 'accentStrong_fermata_tremolo',
      'accentStrong_staccatissimo', 'accentStrong_staccato', 'accentStrong_staccato_tenuto',
      'accentStrong_staccato_tremolo', 'accentStrong_staccato_trill', 'accentStrong_tenuto', 'accentStrong_tremolo',
      'accentStrong_trill', 'arpeggiate', 'arpeggiate_breathMark', 'arpeggiate_fermata', 'arpeggiate_fermata_staccato',
      'arpeggiate_fermata_tenuto', 'arpeggiate_staccatissimo', 'arpeggiate_staccatissimo_staccato',
      'arpeggiate_staccato', 'arpeggiate_staccato_tenuto', 'arpeggiate_tenuto', 'arpeggiate_tremolo',
      'arpeggiate_trill', 'breathMark', 'breathMark_fermata', 'breathMark_fermata_tenuto', 'breathMark_staccato',
      'breathMark_tenuto', 'breathMark_tremolo', 'breathMark_trill', 'fermata', 'fermata_staccato', 'fermata_tenuto',
      'fermata_tremolo', 'fermata_trill', 'fermata_turn', 'mordent', 'staccatissimo', 'staccatissimo_staccato',
      'staccatissimo_staccato_tenuto', 'staccatissimo_staccato_tenuto_trill', 'staccatissimo_tenuto', 'staccato',
      'staccato_tenuto', 'staccato_tremolo', 'staccato_trill', 'staccato_turn', 'tenuto', 'tenuto_tremolo',
      'tenuto_trill', 'tremolo', 'trill', 'trill_turn', 'turn'
    ];

    articulation.push.apply(articulation, articulationsLieder);
    for (const d of DYNAMICS_MODIFIER) articulation.push('dynamic_' + d);

    return buildDict(articulation);
  }

  function buildSlur() {
    // homr: transformer/vocabulary.py:246
    return buildDict([nonote, empty, 'slurStart_slurStop', 'slurStart', 'slurStop']);
  }

  function buildPitch() {
    // homr: transformer/vocabulary.py:252
    const pitch = [nonote, empty];
    const noteNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const names = [];  // itertools.product(range(10), note_names), then reversed: B9 A9 ... D0 C0
    for (let octave = 0; octave < 10; octave++) for (const n of noteNames) names.push(n + octave);
    names.reverse();
    return buildDict(pitch.concat(names));
  }

  function hasRhythmSymbolAPosition(rhythm) {
    // homr: transformer/vocabulary.py:260
    return startsWithAny(rhythm, ['note', 'rest', 'clef', 'dynamic']);
  }

  // JS only: {v: k for k, v in vocab.items()} as an array (the values are 0..n-1), what the
  // decoder's detokenize needs
  function invert(dict) {
    const out = [];
    for (const k of Object.keys(dict)) out[dict[k]] = k;
    return out;
  }

  class Vocabulary {
    // homr: transformer/vocabulary.py:264
    constructor() {
      this.rhythm = buildRhythm();
      this.lift = buildLift();
      this.articulation = buildArticulation();
      this.pitch = buildPitch();
      this.slur = buildSlur();
      this.position = buildPosition();
    }
  }

  class SymbolDuration {
    // homr: transformer/vocabulary.py:274
    // baseDuration: Fraction; dots, actualNotes, normalNotes, kern: int
    constructor(baseDuration, dots, actualNotes, normalNotes, kern) {
      this.baseDuration = baseDuration;
      this.dots = dots;
      const actionNormal = new Fraction(actualNotes, normalNotes);
      this.actualNotes = actionNormal.numerator;
      this.normalNotes = actionNormal.denominator;
      this.fraction = this._toFraction();
      this.kern = kern;
    }

    _toFraction() {
      // Convert to a final Fraction duration (relative to whole note).
      let dur = this.baseDuration;

      // Apply dots
      let add = dur.div(2);
      for (let i = 0; i < this.dots; i++) {
        dur = dur.add(add);
        add = add.div(2);
      }

      // Apply tuplet scaling
      if (this.actualNotes !== this.normalNotes) dur = dur.mul(new Fraction(this.normalNotes, this.actualNotes));

      return dur;
    }
  }

  function priorPowerOfTwo(n) {
    // homr: transformer/vocabulary.py:305
    // Return the next power of two <= n.
    if (n < 1) {
      // This produces wrong rhythms, but at least it produces something
      return 1;
    }
    let p = 1;  // 1 << (n.bit_length() - 1)
    while (p * 2 <= n) p *= 2;
    return p;
  }

  // base & (base - 1) == 0 for base >= 1 (base 0 is handled before it is asked)
  function isPowerOfTwo(n) {
    while (n > 1 && n % 2 === 0) n /= 2;
    return n === 1;
  }

  function kernToSymbolDuration(kern) {
    // homr: transformer/vocabulary.py:313
    // Parse a Humdrum **kern duration string into a SymbolDuration object.
    if (kern.endsWith('m')) {
      // Multirest
      return new SymbolDuration(new Fraction(1), 0, 1, 1, 4);
    }

    // Extract numeric prefix (can be > 1 digit)
    let i = 0;
    while (i < kern.length && kern[i] >= '0' && kern[i] <= '9') i += 1;
    const baseStr = kern.slice(0, i);
    const rest = kern.slice(i);

    const base = baseStr ? parseInt(baseStr, 10) : 4;  // default quarter
    const dots = rest.split('.').length - 1;

    if (kern.includes('G')) {
      // Grace note
      return new SymbolDuration(new Fraction(0), dots, 1, 1, base);
    }
    if (base === 0) {
      // Special: Whoe measure rest
      return new SymbolDuration(new Fraction(1), dots, 1, 1, base);
    }

    // If base is a power of two, it's a normal note ((base & (base - 1)) == 0 in Python's precedence;
    // JS's & works on 32 bits, so the test is spelled out: right for any base, not only < 2^31)
    if (isPowerOfTwo(base)) {
      return new SymbolDuration(new Fraction(1, base), dots, 1, 1, base);
    } else {
      // Tuplet case: find next higher power of two
      const normalNotes = priorPowerOfTwo(base);
      const baseDuration = new Fraction(1, normalNotes);
      const actualNotes = base;
      return new SymbolDuration(baseDuration, dots, actualNotes, normalNotes, normalNotes);
    }
  }

  class EncodedSymbol {
    // homr: transformer/vocabulary.py:351
    // A musical symbol split into the different decoder branches.
    // new EncodedSymbol(rhythm, pitch, lift, articulation, slur, position, coordinates), or with
    // Python's keyword form: new EncodedSymbol('measureRest', {position: 'upper'}).
    constructor(rhythm, pitch, lift, articulation, slur, position, coordinates) {
      if (pitch !== null && typeof pitch === 'object') {
        const kw = pitch;
        pitch = kw.pitch; lift = kw.lift; articulation = kw.articulation; slur = kw.slur;
        position = kw.position; coordinates = kw.coordinates;
      }
      this.rhythm = rhythm;
      this.pitch = pitch === undefined ? nonote : pitch;
      this.lift = lift === undefined ? nonote : lift;
      this.articulation = articulation === undefined ? nonote : articulation;
      this.slur = slur === undefined ? nonote : slur;
      this.position = position === undefined ? nonote : position;

      // These coordinates are derived from transformer attention and are inherently imprecise,
      // since the model is optimized for predictive accuracy rather than spatial localization.
      // Because patch tokens are processed in raster order (top-to-bottom, left-to-right),
      // this ordering can be used to reject cases where attention-based coordinates
      // violate monotonic scan constraints and are therefore unreliable.
      this.coordinates = coordinates === undefined ? null : coordinates;
      // The coordinates mapped back to the image which was given to homr as input ([x, y] or null)
      this.imageCoordinates = null;
      this._duration = null;
    }

    // JS only: str(symbol) back into a symbol (tests, fixtures). Coordinates are not part of it.
    static fromString(s) {
      const f = s.split(' ');
      if (f.length !== 6) throw pyError('ValueError', 'not an EncodedSymbol string: ' + JSON.stringify(s));
      return new EncodedSymbol(f[0], f[1], f[2], f[3], f[4], f[5]);
    }

    // copy.copy(self): a shallow copy which keeps every attribute (coordinates, _duration cache)
    copy() { return Object.assign(Object.create(Object.getPrototypeOf(this)), this); }

    isControlSymbol() {
      return this.rhythm === 'BOS' || this.rhythm === 'EOS' || this.rhythm === 'PAD';
    }

    isTuplet() {
      const noTuplet = this.removeTuplet();
      return noTuplet.rhythm !== this.rhythm;
    }

    removeTuplet() {
      // homr: transformer/vocabulary.py:390
      const match = /^(note|rest)_([0-9]+)([^\n]*)/.exec(this.rhythm);
      if (!match) return this;
      let duration = parseInt(match[2], 10);
      if (duration % 3 === 0) duration = Math.floor(duration / 3) * 2;
      else if (duration % 5 === 0) duration = Math.floor(duration / 5) * 4;
      else if (duration % 7 === 0) duration = Math.floor(duration / 7) * 4;
      else return this;

      const result = this.copy();
      result.rhythm = match[1] + '_' + duration + match[3];
      result._duration = null;
      return result;
    }

    changeLift(lift) {
      const result = this.copy();
      result.lift = lift;
      return result;
    }

    toUpperPosition() {
      if (isUpperOrHasNoPosition(this.position)) return this;
      const result = this.copy();
      result.position = this.position.split('lower').join('upper');  // str.replace: every occurrence
      return result;
    }

    isValid() {
      const hasPosition = hasRhythmSymbolAPosition(this.rhythm);
      const isNote = [this.lift, this.articulation, this.pitch, this.slur, this.position].map((s) => s !== nonote);
      return isNote.every((item) => item === hasPosition);
    }

    addArticulations(articulations) {
      const all = [].concat(articulations, _splitArticulations(this.articulation));
      const result = this.copy();
      result.articulation = py.sorted(all).join('_');
      return result;
    }

    addSlurs(slurs) {
      const all = [].concat(slurs, this.slur.split('_').filter((a) => a));
      const result = this.copy();
      result.slur = py.sorted(all).join('_');
      return result;
    }

    // returns [stripped, result] (Python's tuple)
    stripArticulations(toBeRemoved, removeAll) {
      if (this.articulation === nonote && !hasRhythmSymbolAPosition(this.rhythm)) return [[], this.copy()];
      const stripped = [];
      const remaining = [];
      for (const articulation of _splitArticulations(this.articulation)) {
        if (removeAll || toBeRemoved.includes(articulation)) stripped.push(articulation);
        else remaining.push(articulation);
      }
      const result = this.copy();
      result.articulation = remaining.length ? remaining.join('_') : empty;
      return [stripped, result];
    }

    stripSlurs(toBeRemoved, removeAll) {
      if (this.slur === nonote && !hasRhythmSymbolAPosition(this.rhythm)) return [[], this.copy()];
      const stripped = [];
      const remaining = [];
      for (const slur of this.slur.split('_')) {
        if (!slur) continue;
        if (removeAll || toBeRemoved.includes(slur)) stripped.push(slur);
        else remaining.push(slur);
      }
      const result = this.copy();
      result.slur = remaining.length ? remaining.join('_') : empty;
      return [stripped, result];
    }

    getDuration() {
      // homr: transformer/vocabulary.py:487
      // Convert a Humdrum **kern duration into a Fraction (relative to a whole note).
      if (this._duration !== null) return this._duration;

      const rhythm = this.rhythm;
      if (!startsWithAny(rhythm, ['note', 'rest'])) {
        eprint('Warning, invalid symbol in group: Only notes and rests have durations');
        return new SymbolDuration(new Fraction(0), 0, 1, 1, 1);
      }
      const kern = rhythm.split('_')[1];
      if (kern === undefined) throw pyError('IndexError', 'list index out of range');

      const duration = kernToSymbolDuration(kern);
      this._duration = duration;
      return duration;
    }

    toString() {
      return [this.rhythm, this.pitch, this.lift, this.articulation, this.slur, this.position].join(' ');
    }

    // __eq__: the six token fields (not the coordinates)
    equals(other) {
      return other instanceof EncodedSymbol && this.rhythm === other.rhythm && this.pitch === other.pitch &&
        this.lift === other.lift && this.articulation === other.articulation && this.slur === other.slur &&
        this.position === other.position;
    }

    // __hash__ as a string key: equal symbols have equal keys
    hashKey() { return this.toString(); }

    // __lt__ is reversed on purpose in homr: sorted(chord) orders by str() DESCENDING
    lt(other) { return this.toString() > other.toString(); }
  }

  // sorted(list_of_symbols): stable, by __lt__ = str() descending
  function sortSymbols(symbols) {
    const keyed = symbols.map((s, i) => ({ s: s, k: s.toString(), i: i }));
    keyed.sort((a, b) => (a.k > b.k ? -1 : a.k < b.k ? 1 : a.i - b.i));
    return keyed.map((e) => e.s);
  }

  function _removeRedudantClefsKeysAndTimeSignatures(chords) {
    // homr: transformer/vocabulary.py:536
    let clefUpper = '';
    let clefLower = '';
    let key = '';
    let time = '';
    const resultChords = [];
    for (const chord of chords) {
      const result = [];
      for (const symbol of chord) {
        if (symbol.rhythm.startsWith('clef')) {
          if (isUpperOrHasNoPosition(symbol.position)) {
            if (symbol.rhythm !== clefUpper) {
              clefUpper = symbol.rhythm;
              result.push(symbol);
            }
          } else if (symbol.rhythm !== clefLower) {
            clefLower = symbol.rhythm;
            result.push(symbol);
          }
        } else if (symbol.rhythm.startsWith('keySignature')) {
          if (symbol.rhythm !== key) {
            key = symbol.rhythm;
            result.push(symbol);
          }
        } else if (symbol.rhythm.startsWith('timeSignature')) {
          if (symbol.rhythm !== time) {
            time = symbol.rhythm;
            result.push(symbol);
          }
        } else {
          result.push(symbol);
        }
      }
      resultChords.push(result);
    }
    return resultChords;
  }

  function _removeDuplicatedPiches(chord) {
    // homr: transformer/vocabulary.py:569
    if (chord.length <= 1 || !startsWithAny(chord[0].rhythm, ['note', 'rest'])) return chord;
    const byPitch = new Map();
    const orderOfAppearance = [];
    for (const symbol of chord) {
      const key = symbol.pitch + ' ' + symbol.position;
      if (byPitch.has(key)) {
        if (symbol.getDuration().fraction.gt(byPitch.get(key).getDuration().fraction)) {
          // homr stores the longer note under symbol.pitch, not under key: it never replaces
          // the first note of that pitch, so the first one is kept (kept as is for parity)
          byPitch.set(symbol.pitch, symbol);
        }
      } else {
        byPitch.set(key, symbol);
        orderOfAppearance.push(key);
      }
    }
    return orderOfAppearance.map((s) => byPitch.get(s));
  }

  function _groupIntoChords(symbols) {
    // homr: transformer/vocabulary.py:586
    const chords = [];
    let isInChord = false;
    for (const symbol of symbols) {
      if (symbol.rhythm === 'chord') {
        isInChord = true;
      } else if (isInChord && chords.length > 0) {
        chords[chords.length - 1].push(symbol);
        isInChord = false;
      } else {
        chords.push([symbol]);
      }
    }
    return chords;
  }

  function _flattenChords(chords) {
    // homr: transformer/vocabulary.py:600
    const result = [];
    for (const chord of chords) {
      let isInChord = false;
      for (const symbol of chord) {
        if (isInChord) result.push(new EncodedSymbol('chord'));
        result.push(symbol);
        isInChord = true;
      }
    }
    return result;
  }

  function _groupIntoMeasures(chords) {
    // homr: transformer/vocabulary.py:615
    const measures = [];
    let currentMeasure = [];
    for (const chord of chords) {
      currentMeasure.push(chord);
      if (chord.length > 0 && (chord[0].rhythm.includes('barline') || chord[0].rhythm.includes('repeat'))) {
        measures.push(currentMeasure);
        currentMeasure = [];
      }
    }
    if (currentMeasure.length > 0) measures.push(currentMeasure);
    return measures;
  }

  function _flattenMeasures(measures) {
    // homr: transformer/vocabulary.py:628
    const out = [];
    for (const measure of measures) for (const chord of measure) out.push(chord);
    return out;
  }

  function _getDurationOfMeasure(measure) {
    // homr: transformer/vocabulary.py:632
    let totalDuration = new Fraction(0);
    for (const chord of measure) {
      let duration = new Fraction(0);
      for (const symbol of chord) {
        if (startsWithAny(symbol.rhythm, ['note', 'rest'])) {
          const fraction = symbol.getDuration().fraction;
          if (fraction.gt(0) && (fraction.lt(duration) || duration.eq(0))) duration = fraction;
        }
      }
      totalDuration = totalDuration.add(duration);
    }
    return totalDuration;
  }

  function _getTypicalDurationOfMeasures(measures) {
    // homr: transformer/vocabulary.py:645
    const durations = measures.map(_getDurationOfMeasure);
    if (durations.length === 0) return new Fraction(0);
    return Fraction.sorted(durations)[Math.floor(durations.length / 2)];
  }

  function _removeTuplets(measure) {
    // homr: transformer/vocabulary.py:652
    return measure.map((chord) => chord.map((symbol) => symbol.removeTuplet()));
  }

  function _fixOverEagerTuplets(chords) {
    // homr: transformer/vocabulary.py:656
    // The transformer tends to add too many tuplets, so we remove them
    // based on the length of a measurement.
    const measures = _groupIntoMeasures(chords);
    const mean = _getTypicalDurationOfMeasures(measures);
    const result = [];
    measures.forEach((measure, i) => {
      if (_getDurationOfMeasure(measure).lt(mean)) {
        eprint('Removing tuplets from measure #', i + 1);
        result.push(_removeTuplets(measure));
      } else {
        result.push(measure);
      }
    });
    return _flattenMeasures(result);
  }

  function _onlyKeepLowerStaffIfThereIsAClef(chords) {
    // homr: transformer/vocabulary.py:673
    let hasLowerClef = false;
    const allResults = [];
    chords.forEach((chord, i) => {
      const result = [];
      for (const symbol of chord) {
        if (hasLowerClef) {
          result.push(symbol);
        } else if (i < 5 && symbol.rhythm.startsWith('clef') && isLowerPosition(symbol.position)) {
          hasLowerClef = true;
          result.push(symbol);
        } else {
          result.push(symbol.toUpperPosition());
        }
      }
      allResults.push(result);
    });
    const delta = chords.length - allResults.length;
    if (delta > 0) eprint('Removed', delta, 'results as there was no matching clef');
    return allResults;
  }

  function removeDuplicatedSymbols(symbols, cleanupTuplets) {
    // homr: transformer/vocabulary.py:695
    if (cleanupTuplets === undefined) cleanupTuplets = true;
    let chords = _groupIntoChords(symbols);
    if (cleanupTuplets) {
      chords = _fixOverEagerTuplets(chords);
      chords = _onlyKeepLowerStaffIfThereIsAClef(chords);
    }
    chords = chords.map(_removeDuplicatedPiches);
    chords = _removeRedudantClefsKeysAndTimeSignatures(chords);
    return _flattenChords(chords);
  }

  function sortTokenChords(symbols, keepChordSymbol) {
    // homr: transformer/vocabulary.py:707
    const chords = [];
    let isInChord = false;
    for (const symbol of symbols) {
      if (symbol.rhythm === 'chord') {
        isInChord = true;
      } else if (isInChord && chords.length > 0) {
        if (keepChordSymbol) chords[chords.length - 1].push(new EncodedSymbol('chord'));
        chords[chords.length - 1].push(symbol);
        isInChord = false;
      } else {
        chords.push([symbol]);
      }
    }
    return chords.map(sortSymbols);
  }

  OMR.transformer_vocabulary = {
    nonote: nonote, empty: empty,
    VALID_TIME_SIGNATURE_DENOMINATORS: VALID_TIME_SIGNATURE_DENOMINATORS,
    DYNAMICS: DYNAMICS, DYNAMICS_MODIFIER: DYNAMICS_MODIFIER,
    buildDict: buildDict, buildRhythm: buildRhythm, buildLift: buildLift, buildPosition: buildPosition,
    buildArticulation: buildArticulation, buildSlur: buildSlur, buildPitch: buildPitch,
    isLowerPosition: isLowerPosition, isUpperOrHasNoPosition: isUpperOrHasNoPosition,
    _splitArticulations: _splitArticulations, hasRhythmSymbolAPosition: hasRhythmSymbolAPosition,
    Vocabulary: Vocabulary, SymbolDuration: SymbolDuration, priorPowerOfTwo: priorPowerOfTwo,
    kernToSymbolDuration: kernToSymbolDuration, EncodedSymbol: EncodedSymbol,
    _removeRedudantClefsKeysAndTimeSignatures: _removeRedudantClefsKeysAndTimeSignatures,
    _removeDuplicatedPiches: _removeDuplicatedPiches, _groupIntoChords: _groupIntoChords,
    _flattenChords: _flattenChords, _groupIntoMeasures: _groupIntoMeasures, _flattenMeasures: _flattenMeasures,
    _getDurationOfMeasure: _getDurationOfMeasure, _getTypicalDurationOfMeasures: _getTypicalDurationOfMeasures,
    _removeTuplets: _removeTuplets, _fixOverEagerTuplets: _fixOverEagerTuplets,
    _onlyKeepLowerStaffIfThereIsAClef: _onlyKeepLowerStaffIfThereIsAClef,
    removeDuplicatedSymbols: removeDuplicatedSymbols, sortTokenChords: sortTokenChords,
    // JS only
    sortSymbols: sortSymbols, invert: invert, Fraction: Fraction
  };
})(typeof self !== 'undefined' ? self : globalThis);
