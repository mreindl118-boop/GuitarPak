/* soundLAB OMR: port of homr/triplet_restoration.py (AGPL-3.0, github.com/liebharc/homr).

   Restores triplets which are printed without their "3".

   Many editions print the 3 only on the first triplets of a passage, or not at all. The
   transformer reads such a triplet as three plain notes, e.g. three eighths which take a
   beat and a half instead of one beat.

   The symbols of a measure tell which notes start together, and the MusicXML generator
   derives the timing from that: a chord starts when the earliest note which is still
   sounding ends. This makes it possible to check a measure without knowing the answer:
   in music a voice carries on where its previous note ended. If three triplet eighths
   are read as plain eighths while the other hand plays a quarter, then the quarter ends
   before the notes it should lead to have started.

   So for every measure which does not make sense in this way, three notes in a row with
   the same plain note value are taken as a triplet if that leaves fewer places in the
   measure where a voice does not carry on.

   JS shapes of the Python types:
     Note           [voice: str, duration: Fraction, index: int]
     Measure        Note[][] (a list of chords)
     frozenset[int] a sorted array of distinct ints (see fs* below)
     Three          [indices (sorted array), offBeat: bool]
     ThreesByPlace  Map: key 'p0,p1,p2|value' -> {places: int[], value: str, indices, offBeat}
                    in Python's dict order */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  const V = OMR.transformer_vocabulary;
  const Fraction = V.Fraction;  // OMR.fractions.Fraction, the class vocabulary.js uses
  const py = OMR.py;

  // Six eighths against a half note only meet it if both threes are triplets, so threes
  // which follow each other directly are also tried together, up to this many
  const _MAX_THREES_IN_A_ROW = 4;

  // One or two measures which make more sense with a triplet are usually misread in some
  // other way: music which has triplets has several. A page (one voice of it) which shows
  // triplets of a note value in fewer places than this shows none. Threes which were taken
  // together count as one place.
  const _MIN_TRIPLETS_ON_A_PAGE = 3;

  // A "measure" which is longer than this many whole notes is music without barlines, or
  // with barlines which were not recognized. There is no measure to make sense of.
  const _MAX_MEASURE_LENGTH = 2;

  // re.compile(r"(note|rest)_(4|8|16|32|64)$") used with .match: anchored at the start, and
  // Python's $ also matches before a trailing newline
  const _PLAIN = /^(note|rest)_(4|8|16|32|64)(?=\n?$)/;

  // ---- frozenset[int] as sorted arrays
  const EMPTY = Object.freeze([]);
  function fsOf(iterable) { return Array.from(new Set(iterable)).sort((a, b) => a - b); }
  function fsUnion(a, b) { return fsOf(a.concat(b)); }
  function fsIntersects(a, b) { const s = new Set(b); return a.some((x) => s.has(x)); }
  function fsKey(a) { return a.join(','); }

  function startsWithNoteOrRest(r) { return r.startsWith('note') || r.startsWith('rest'); }

  function _asTriplet(symbol) {
    // homr: triplet_restoration.py:53
    const match = _PLAIN.exec(symbol.rhythm);
    if (match === null) return symbol;
    const result = symbol.copy();
    result.rhythm = match[1] + '_' + Math.floor(parseInt(match[2], 10) * 3 / 2);
    result._duration = null;
    return result;
  }

  function _splitIntoMeasures(symbols) {
    // homr: triplet_restoration.py:63
    const indexOf = new Map();  // {id(symbol): i}: identity, the last index wins
    symbols.forEach((symbol, i) => indexOf.set(symbol, i));
    const measures = [[]];
    for (const chord of V.sortTokenChords(symbols)) {
      const rhythm = chord[0].rhythm;
      if (rhythm.includes('barline') || rhythm.includes('repeat')) {
        measures.push([]);
      } else if (startsWithNoteOrRest(rhythm) && !rhythm.endsWith('m')) {
        measures[measures.length - 1].push(chord
          .filter((symbol) => startsWithNoteOrRest(symbol.rhythm))
          .map((symbol) => [symbol.position, symbol.getDuration().fraction, indexOf.get(symbol)]));
      }
    }
    return measures;
  }

  function _play(measure, triplets) {
    // homr: triplet_restoration.py:81
    // Times the measure the way the MusicXML generator does it: a chord starts when the
    // earliest note which is still sounding ends. The notes in triplets are played as
    // members of a triplet.
    // Returns (Python yields) the start of every chord together with the voice and the end of
    // each of its notes: [[start, [[voice, end], ...]], ...]
    const inTriplet = new Set(triplets || EMPTY);
    let clock = new Fraction(0);
    let sounding = [];
    const out = [];
    for (const chord of measure) {
      const notes = [];
      for (const [voice, duration, index] of chord) {
        const played = inTriplet.has(index) ? duration.mul(2).div(3) : duration;
        if (played.gt(0)) notes.push([voice, clock.add(played)]);
      }
      out.push([clock, notes]);
      if (notes.length) {
        for (const note of notes) sounding.push(note[1]);
        const c = clock;
        clock = Fraction.min(sounding.filter((end) => end.gt(c)));
        sounding = sounding.filter((end) => end.gt(clock));
      }
    }
    return out;
  }

  function _countBreaks(measure, triplets) {
    // homr: triplet_restoration.py:106
    // Counts the places where a voice does not carry on exactly where its previous note
    // ended, and the voices which end before the measure does.
    // Returns the number of such places and their total size: [breaks, size].
    const endOfVoice = new Map();
    let breaks = 0;
    let size = new Fraction(0);
    for (const [start, notes] of _play(measure, triplets)) {
      const ends = new Map();
      for (const [voice, end] of notes) ends.set(voice, Fraction.max([ends.has(voice) ? ends.get(voice) : end, end]));
      for (const voice of ends.keys()) {
        if (endOfVoice.has(voice) && endOfVoice.get(voice).ne(start)) {
          breaks += 1;
          size = size.add(start.sub(endOfVoice.get(voice)).abs());
        }
      }
      for (const [voice, end] of ends) endOfVoice.set(voice, end);  // dict.update
    }
    if (endOfVoice.size) {
      const endOfMeasure = Fraction.max(Array.from(endOfVoice.values()));
      for (const end of endOfVoice.values()) {
        if (end.ne(endOfMeasure)) {
          breaks += 1;
          size = size.add(endOfMeasure.sub(end));
        }
      }
    }
    return [breaks, size];
  }

  function _getLength(measure) {
    // homr: triplet_restoration.py:134
    const ends = [];
    for (const [, notes] of _play(measure)) for (const [, end] of notes) ends.push(end);
    return ends.length ? Fraction.max(ends) : new Fraction(0);
  }

  function threeKey(places, value) { return places.join(',') + '|' + value; }

  function _findSingleThrees(measure, symbols) {
    // homr: triplet_restoration.py:138
    // Finds three chords in a row in one voice which all have the same plain note value.
    // Voices which go through the same three chords with the same value form one three.
    //
    // A three is off the beat if it does not start a whole number of threes into its run
    // of equal notes. Taking any three notes of a run as a triplet closes the same gap, so
    // the caller needs this to tell them apart.
    const found = new Map();  // key -> {places, value, indices: Set, offBeat}
    const voices = new Set();
    for (const chord of measure) for (const [voice] of chord) voices.add(voice);
    for (const voice of py.sorted(Array.from(voices))) {
      let chords = measure.map((chord, place) => [place, chord.filter((n) => n[0] === voice).map((n) => n[2])]);
      chords = chords.filter(([, notes]) => notes.length);
      const values = [];
      for (const [, notes] of chords) {
        const matches = notes.map((index) => _PLAIN.exec(symbols[index].rhythm));
        const plain = new Set(matches.filter((m) => m !== null).map((m) => m[2]));
        values.push(matches.every((m) => m !== null) && plain.size === 1 ? plain.values().next().value : null);
      }
      let startOfRun = 0;
      values.forEach((value, i) => {
        if (i > 0 && (value === null || value !== values[i - 1])) startOfRun = i;
        // values[i : i + 3] != [value] * 3
        if (value === null || !(i + 3 <= values.length && values[i + 1] === value && values[i + 2] === value)) return;
        const window = chords.slice(i, i + 3);
        const inVoice = [];
        for (const [, notes] of window) for (const index of notes) inVoice.push(index);
        if (!inVoice.some((index) => symbols[index].rhythm.startsWith('note'))) return;
        const places = window.map(([place]) => place);
        const key = threeKey(places, value);
        const entry = found.get(key) || { places: places, value: value, indices: new Set(), offBeat: false };
        for (const index of inVoice) entry.indices.add(index);
        entry.offBeat = entry.offBeat || py.mod(i - startOfRun, 3) !== 0;
        found.set(key, entry);
      });
    }
    const out = new Map();
    for (const [key, e] of found) out.set(key, { places: e.places, value: e.value, indices: fsOf(e.indices), offBeat: e.offBeat });
    return out;
  }

  function _findThrees(measure, symbols) {
    // homr: triplet_restoration.py:175
    // Finds the threes of a measure, and the threes which follow each other directly as one.
    const single = _findSingleThrees(measure, symbols);
    const threes = new Map();  // dict(single.values()): frozenset -> off_beat, a later duplicate wins
    for (const t of single.values()) threes.set(fsKey(t.indices), [t.indices, t.offBeat]);
    let inARow = single;
    for (let n = 0; n < _MAX_THREES_IN_A_ROW - 1; n++) {
      inARow = _addFollowingThree(inARow, single, measure, symbols);
      for (const t of inARow.values()) {
        const k = fsKey(t.indices);
        if (!threes.has(k)) threes.set(k, [t.indices, t.offBeat]);  // setdefault
      }
    }
    return py.sorted(Array.from(threes.values()), (three) => three[0]);
  }

  function _addFollowingThree(inARow, single, measure, symbols) {
    // homr: triplet_restoration.py:189
    // Extends each run of threes by the three which follows it directly in the same voices.
    const longer = new Map();
    for (const t of inARow.values()) {
      const voices = new Set(t.indices.map((index) => symbols[index].position));
      let nextPlace = null;
      for (let place = t.places[t.places.length - 1] + 1; place < measure.length; place++) {
        if (measure[place].some(([voice]) => voices.has(voice))) { nextPlace = place; break; }
      }
      for (const n of single.values()) {
        if (n.value === t.value && n.places[0] === nextPlace && !fsIntersects(t.indices, n.indices) &&
            setEquals(new Set(n.indices.map((index) => symbols[index].position)), voices)) {
          const places = t.places.concat(n.places);
          longer.set(threeKey(places, t.value),
            { places: places, value: t.value, indices: fsUnion(t.indices, n.indices), offBeat: t.offBeat });
        }
      }
    }
    return longer;
  }

  function setEquals(a, b) {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  }

  // trial[:3] = ((breaks, size), off_beat, sorted(indices)) compared like Python tuples
  function cmpTrial(a, b) {
    return (a[0][0] - b[0][0]) || a[0][1].cmp(b[0][1]) || ((a[1] ? 1 : 0) - (b[1] ? 1 : 0)) || py.cmp(a[2], b[2]);
  }

  function _chooseTriplets(measure, symbols) {
    // homr: triplet_restoration.py:217
    // Takes threes as triplets, the most helpful first, as long as each of them
    // leaves fewer places in the measure where a voice does not carry on.
    const chosen = [];
    let triplets = EMPTY;
    let breaks = _countBreaks(measure);
    if (breaks[0] === 0 || _getLength(measure).gt(_MAX_MEASURE_LENGTH)) return [];
    const threes = _findThrees(measure, symbols);
    for (;;) {
      const trials = threes
        .filter(([indices]) => !fsIntersects(indices, triplets))
        .map(([indices, offBeat]) => [_countBreaks(measure, fsUnion(triplets, indices)), offBeat, indices, indices]);
      if (!trials.length) break;
      let best = trials[0];  // min(): the first minimum wins
      for (const trial of trials) if (cmpTrial(trial, best) < 0) best = trial;
      const bestBreaks = best[0];
      if (bestBreaks[0] >= breaks[0]) break;
      chosen.push(best[3]);
      triplets = fsUnion(triplets, best[3]);
      breaks = bestBreaks;
    }
    return chosen;
  }

  function _noteValue(symbols, indices) {
    // homr: triplet_restoration.py:244
    return symbols[Math.min.apply(null, indices)].rhythm.split('_')[1];
  }

  function _countByNoteValue(symbols, chosen) {
    // homr: triplet_restoration.py:248
    // Counter: a Map note value -> count, in the order the values were first seen
    const counter = new Map();
    for (const inMeasure of chosen) {
      for (const indices of inMeasure) {
        const v = _noteValue(symbols, indices);
        counter.set(v, (counter.get(v) || 0) + 1);
      }
    }
    return counter;
  }

  function restoreUnmarkedTriplets(symbols) {
    // homr: triplet_restoration.py:254
    // Takes the symbols of one voice of a page and returns them with the triplets
    // which were read as plain notes restored.
    const measures = _splitIntoMeasures(symbols);
    const chosen = measures.map((measure) => _chooseTriplets(measure, symbols));
    const shown = _countByNoteValue(symbols, chosen);
    const triplets = new Set();
    for (const inMeasure of chosen) {
      for (const indices of inMeasure) {
        if ((shown.get(_noteValue(symbols, indices)) || 0) >= _MIN_TRIPLETS_ON_A_PAGE) {
          for (const index of indices) triplets.add(index);
        }
      }
    }
    return symbols.map((symbol, i) => (triplets.has(i) ? _asTriplet(symbol) : symbol));
  }

  OMR.triplet_restoration = {
    _MAX_THREES_IN_A_ROW: _MAX_THREES_IN_A_ROW, _MIN_TRIPLETS_ON_A_PAGE: _MIN_TRIPLETS_ON_A_PAGE,
    _MAX_MEASURE_LENGTH: _MAX_MEASURE_LENGTH, _PLAIN: _PLAIN,
    _asTriplet: _asTriplet, _splitIntoMeasures: _splitIntoMeasures, _play: _play, _countBreaks: _countBreaks,
    _getLength: _getLength, _findSingleThrees: _findSingleThrees, _findThrees: _findThrees,
    _addFollowingThree: _addFollowingThree, _chooseTriplets: _chooseTriplets, _noteValue: _noteValue,
    _countByNoteValue: _countByNoteValue, restoreUnmarkedTriplets: restoreUnmarkedTriplets,
    // JS only: the frozenset helpers
    fsOf: fsOf, fsUnion: fsUnion, fsIntersects: fsIntersects, fsKey: fsKey, threeKey: threeKey
  };
})(typeof self !== 'undefined' ? self : globalThis);
