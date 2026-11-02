/* soundLAB OMR: port of homr/circle_of_fifths.py (AGPL-3.0, github.com/liebharc/homr).
   Key signatures and the accidentals they imply. homr's inference pipeline does not call this
   module (its users are the training-data converters); it is ported for completeness and for
   code which needs the sounding accidental of a note in a key. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  const V = OMR.transformer_vocabulary;
  const empty = V.empty, nonote = V.nonote;

  function eprint() {  // homr.simple_logging.eprint, looked up when called
    const L = OMR.simple_logging;
    if (L && L.eprint) L.eprint.apply(null, arguments);
  }

  // dict[int, str] in Python's order (a Map: integer keys of a JS object would be reordered)
  const definition = new Map([
    [-7, 'CbM'], [-6, 'GbM'], [-5, 'DbM'], [-4, 'AbM'], [-3, 'EbM'], [-2, 'BbM'], [-1, 'FM'], [0, 'CM'],
    [1, 'GM'], [2, 'DM'], [3, 'AM'], [4, 'EM'], [5, 'BM'], [6, 'F#M'], [7, 'C#M']
  ]);

  const invDefinition = new Map();
  for (const [k, v] of definition) invDefinition.set(v, k);

  const circleOfFifthNotesPositive = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const circleOfFifthNotesNegative = circleOfFifthNotesPositive.slice().reverse();

  function keySignatureToCircleOfFifth(keySignature) {
    // homr: circle_of_fifths.py:31
    if (!invDefinition.has(keySignature)) {
      eprint('Warning: Unknown key signature', keySignature);
      return 0;
    }
    return invDefinition.get(keySignature);
  }

  function repeatNoteForAllOctaves(notes) {
    // homr: circle_of_fifths.py:38
    // Takes a list of notes and returns a list of notes that includes all octaves.
    const result = [];
    for (const note of notes) for (let octave = 0; octave < 11; octave++) result.push(note + octave);
    return result;
  }

  // AbstractKeyTransformation: add_accidental(note, accidental) -> str, reset_at_end_of_measure()

  class NoKeyTransformation {
    // homr: circle_of_fifths.py:62
    constructor() {
      this.currentAccidentals = new Map();  // dict[str, str]
    }

    addAccidental(note, accidental) {
      if (accidental !== '' && (!this.currentAccidentals.has(note) || this.currentAccidentals.get(note) !== accidental)) {
        this.currentAccidentals.set(note, accidental);
        return accidental;
      } else {
        return '';
      }
    }

    resetAtEndOfMeasure() { return new NoKeyTransformation(); }
  }

  class KeyTransformation {
    // homr: circle_of_fifths.py:80
    constructor(circleOfFifth) {
      this.circleOfFifth = circleOfFifth;
      this.sharps = new Set();
      this.flats = new Set();
      if (circleOfFifth > 0) {
        this.sharps = new Set(repeatNoteForAllOctaves(circleOfFifthNotesPositive.slice(0, circleOfFifth)));
      } else if (circleOfFifth < 0) {
        this.flats = new Set(repeatNoteForAllOctaves(circleOfFifthNotesNegative.slice(0, Math.abs(circleOfFifth))));
      }
    }

    addAccidental(note, accidental) {
      // homr: circle_of_fifths.py:97
      // Returns the accidental if it wasn't placed before.
      if (accidental === '#' || accidental === 'b' || accidental === 'N') {
        let previousAccidental = 'N';
        if (this.sharps.has(note)) {
          this.sharps.delete(note);
          previousAccidental = '#';
        }
        if (this.flats.has(note)) {
          this.flats.delete(note);
          previousAccidental = 'b';
        }
        if (accidental === '#') this.sharps.add(note);
        else if (accidental === 'b') this.flats.add(note);
        return accidental !== previousAccidental ? accidental : '';
      } else {
        if (this.sharps.has(note)) {
          this.sharps.delete(note);
          return 'N';
        }
        if (this.flats.has(note)) {
          this.flats.delete(note);
          return 'N';
        }
        return '';
      }
    }

    resetAtEndOfMeasure() { return new KeyTransformation(this.circleOfFifth); }
  }

  function maintainAccidentalsDuringMeasure(symbols) {
    // homr: circle_of_fifths.py:129
    // The PrIMuS datset doesn't maintain accidentals. Possibly
    // because it uses a different rule for accidentals as in music
    // there is no aggreement on this matter. However homr and the
    // other datasets maintain accidentals until the end of the measure,
    // so we adjust the PrIMus ground truth to match this.
    // Example: datasets/Corpus/000135772-1_2_1/000135772-1_2_1-pre.jpg
    const results = [];

    // Since PrIMuS treats keys as we expect, we don't
    // have to take the key into account and therefore just the
    // key of C as it has no accidentals
    let key = new KeyTransformation(0);

    for (const symbol of symbols) {
      if (symbol.rhythm.includes('barline')) {
        key = key.resetAtEndOfMeasure();
        results.push(symbol);
      } else if (symbol.lift !== nonote) {
        // In engraving, the lift may be empty (implied by key signature or previous accidental)
        // In sounding, we need the actual pitch: remove any previous
        // accidental tracking to force the current one
        const lift = symbol.lift !== empty ? symbol.lift : null;
        let actualAccidental = null;

        if (lift === '#' || lift === 'b' || lift === 'N') {
          actualAccidental = lift;
          // Update key state to reflect that this accidental has been
          // applied for future notes in the measure
          key.addAccidental(symbol.pitch, lift);
        } else if (key.sharps.has(symbol.pitch)) {  // Determine if note is sharp/flat by key signature
          actualAccidental = '#';
        } else if (key.flats.has(symbol.pitch)) {
          actualAccidental = 'b';
        } else {
          actualAccidental = empty;
        }

        results.push(symbol.changeLift(actualAccidental ? actualAccidental : empty));
      } else {
        results.push(symbol);
      }
    }

    return results;
  }

  function stripNaturals(symbols) {
    // homr: circle_of_fifths.py:178
    const results = [];
    for (const symbol of symbols) {
      if (symbol.lift === 'N') results.push(symbol.changeLift(empty));
      else results.push(symbol);
    }
    return results;
  }

  OMR.circle_of_fifths = {
    definition: definition, invDefinition: invDefinition,
    circleOfFifthNotesPositive: circleOfFifthNotesPositive, circleOfFifthNotesNegative: circleOfFifthNotesNegative,
    keySignatureToCircleOfFifth: keySignatureToCircleOfFifth, repeatNoteForAllOctaves: repeatNoteForAllOctaves,
    NoKeyTransformation: NoKeyTransformation, KeyTransformation: KeyTransformation,
    maintainAccidentalsDuringMeasure: maintainAccidentalsDuringMeasure, stripNaturals: stripNaturals
  };
})(typeof self !== 'undefined' ? self : globalThis);
