/* GuitarLab music-theory core. Exposed as window.Theory. No dependencies, no DOM.
 *
 * API summary (everything a module may rely on):
 *   Theory.SHARP / Theory.FLAT              12 note names, index = pitch class (C = 0)
 *   Theory.INTERVAL_NAMES                   ['R','b2','2','b3','3','4','b5','5','b6','6','b7','7']
 *   Theory.FLAT_KEYS                        Set of pitch classes conventionally spelled flat
 *   Theory.SCALES                           { id: { name, steps:[semitones from root] } }
 *   Theory.SCALE_ORDER                      array of scale ids in display order
 *   Theory.TUNINGS                          { id: { name, midi:[6] low-string-first } }
 *   Theory.TUNING_ORDER                     array of tuning ids
 *   Theory.QUALITIES                        { id: { name, intervals, symbol } }
 *   Theory.QUALITY_ORDER                    chord qualities worth showing in a picker
 *   Theory.PROGRESSIONS                     preset progressions (see below)
 *   Theory.pcName(pc, preferFlat)           pitch-class -> display name
 *   Theory.midiName(midi, preferFlat)       e.g. 64 -> 'E4'
 *   Theory.noteFreq(midi, a4=440)           midi -> Hz
 *   Theory.freqToNote(freq, a4=440)         -> { midi, midiFloat, pc, name, octave, cents } or null
 *   Theory.scaleInfo(rootPc, scaleId, preferFlat)
 *       -> { pcs:[..], names:[..], intervals:[..names..], pcSet:Set, pcToStep:Map(pc->stepIndex) }
 *   Theory.diatonic(rootPc, scaleId, sevenths)  (7-note scales only)
 *       -> [ { deg:1..7, rootPc, quality, roman, name } ]
 *   Theory.resolveProgression(preset, keyPc)    -> [ { rootPc, quality, roman, name } ] (one per bar/step)
 *   Theory.chordShapes(rootPc, quality)     -> [ { frets:[6] (-1 mute, 0 open, else absolute fret),
 *                                                 baseFret, label } ]
 *   Theory.chordVoicing(frets, tuningMidi?) -> midi numbers for sounding strings (low first)
 *   Theory.chordName(rootPc, quality, preferFlat)
 *   Theory.fretMidi(stringIdx, fret, tuningId='standard')   stringIdx 0 = low E
 */
window.Theory = (function () {
  'use strict';

  var SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var FLAT_KEYS = new Set([1, 3, 5, 6, 8, 10]); // Db Eb F Gb Ab Bb
  var INTERVAL_NAMES = ['R', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

  var SCALES = {
    major:         { name: 'Major (Ionian)',            steps: [0, 2, 4, 5, 7, 9, 11] },
    dorian:        { name: 'Dorian',                    steps: [0, 2, 3, 5, 7, 9, 10] },
    phrygian:      { name: 'Phrygian',                  steps: [0, 1, 3, 5, 7, 8, 10] },
    lydian:        { name: 'Lydian',                    steps: [0, 2, 4, 6, 7, 9, 11] },
    mixolydian:    { name: 'Mixolydian',                steps: [0, 2, 4, 5, 7, 9, 10] },
    aeolian:       { name: 'Natural Minor (Aeolian)',   steps: [0, 2, 3, 5, 7, 8, 10] },
    locrian:       { name: 'Locrian',                   steps: [0, 1, 3, 5, 6, 8, 10] },
    majorPent:     { name: 'Major Pentatonic',          steps: [0, 2, 4, 7, 9] },
    minorPent:     { name: 'Minor Pentatonic',          steps: [0, 3, 5, 7, 10] },
    blues:         { name: 'Blues (minor)',             steps: [0, 3, 5, 6, 7, 10] },
    harmonicMinor: { name: 'Harmonic Minor',            steps: [0, 2, 3, 5, 7, 8, 11] },
    melodicMinor:  { name: 'Melodic Minor',             steps: [0, 2, 3, 5, 7, 9, 11] },
    phrygDom:      { name: 'Phrygian Dominant',         steps: [0, 1, 4, 5, 7, 8, 10] }
  };
  var SCALE_ORDER = ['major', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian',
    'majorPent', 'minorPent', 'blues', 'harmonicMinor', 'melodicMinor', 'phrygDom'];

  var TUNINGS = {
    standard: { name: 'Standard (E A D G B E)',   midi: [40, 45, 50, 55, 59, 64] },
    dropD:    { name: 'Drop D (D A D G B E)',     midi: [38, 45, 50, 55, 59, 64] },
    halfDown: { name: 'Half-step down (Eb std)',  midi: [39, 44, 49, 54, 58, 63] },
    dadgad:   { name: 'DADGAD',                   midi: [38, 45, 50, 55, 57, 62] },
    openG:    { name: 'Open G (D G D G B D)',     midi: [38, 43, 50, 55, 59, 62] }
  };
  var TUNING_ORDER = ['standard', 'dropD', 'halfDown', 'dadgad', 'openG'];

  var QUALITIES = {
    maj:     { name: 'Major',           intervals: [0, 4, 7],      symbol: '' },
    min:     { name: 'Minor',           intervals: [0, 3, 7],      symbol: 'm' },
    dim:     { name: 'Diminished',      intervals: [0, 3, 6],      symbol: '°' },
    aug:     { name: 'Augmented',       intervals: [0, 4, 8],      symbol: '+' },
    sus2:    { name: 'Sus2',            intervals: [0, 2, 7],      symbol: 'sus2' },
    sus4:    { name: 'Sus4',            intervals: [0, 5, 7],      symbol: 'sus4' },
    '7':     { name: 'Dominant 7',      intervals: [0, 4, 7, 10],  symbol: '7' },
    maj7:    { name: 'Major 7',         intervals: [0, 4, 7, 11],  symbol: 'maj7' },
    m7:      { name: 'Minor 7',         intervals: [0, 3, 7, 10],  symbol: 'm7' },
    m7b5:    { name: 'Half-diminished', intervals: [0, 3, 6, 10],  symbol: 'm7♭5' },
    dim7:    { name: 'Diminished 7',    intervals: [0, 3, 6, 9],   symbol: '°7' },
    mMaj7:   { name: 'Minor-major 7',   intervals: [0, 3, 7, 11],  symbol: 'm(maj7)' },
    augMaj7: { name: 'Aug-major 7',     intervals: [0, 4, 8, 11],  symbol: '+maj7' }
  };
  var QUALITY_ORDER = ['maj', 'min', '7', 'maj7', 'm7', 'sus2', 'sus4', 'dim', 'm7b5', 'dim7', 'aug'];

  // ------- open chord shapes, keyed 'pc:quality'. Frets low-E-first, -1 = muted. -------
  var OPEN_SHAPES = {
    '0:maj':  [-1, 3, 2, 0, 1, 0],   // C
    '0:7':    [-1, 3, 2, 3, 1, 0],   // C7
    '0:maj7': [-1, 3, 2, 0, 0, 0],   // Cmaj7
    '9:maj':  [-1, 0, 2, 2, 2, 0],   // A
    '9:min':  [-1, 0, 2, 2, 1, 0],   // Am
    '9:7':    [-1, 0, 2, 0, 2, 0],   // A7
    '9:m7':   [-1, 0, 2, 0, 1, 0],   // Am7
    '9:maj7': [-1, 0, 2, 1, 2, 0],   // Amaj7
    '9:sus2': [-1, 0, 2, 2, 0, 0],   // Asus2
    '9:sus4': [-1, 0, 2, 2, 3, 0],   // Asus4
    '7:maj':  [3, 2, 0, 0, 0, 3],    // G
    '7:7':    [3, 2, 0, 0, 0, 1],    // G7
    '4:maj':  [0, 2, 2, 1, 0, 0],    // E
    '4:min':  [0, 2, 2, 0, 0, 0],    // Em
    '4:7':    [0, 2, 0, 1, 0, 0],    // E7
    '4:m7':   [0, 2, 0, 0, 0, 0],    // Em7
    '4:sus4': [0, 2, 2, 2, 0, 0],    // Esus4
    '2:maj':  [-1, -1, 0, 2, 3, 2],  // D
    '2:min':  [-1, -1, 0, 2, 3, 1],  // Dm
    '2:7':    [-1, -1, 0, 2, 1, 2],  // D7
    '2:m7':   [-1, -1, 0, 2, 1, 1],  // Dm7
    '2:maj7': [-1, -1, 0, 2, 2, 2],  // Dmaj7
    '2:sus2': [-1, -1, 0, 2, 3, 0],  // Dsus2
    '2:sus4': [-1, -1, 0, 2, 3, 3],  // Dsus4
    '11:7':   [-1, 2, 1, 2, 0, 2],   // B7
    '5:maj7': [-1, -1, 3, 2, 1, 0]   // Fmaj7
  };

  // Movable (barre) shape templates. offsets relative to the root fret; rootString indexes
  // the string carrying the root (0 = low E). Open-string pitch classes: E A D G B E.
  var MOVABLE = [
    { quality: 'maj',  rootString: 0, offsets: [0, 2, 2, 1, 0, 0],    label: 'E-shape barre' },
    { quality: 'maj',  rootString: 1, offsets: [-1, 0, 2, 2, 2, 0],   label: 'A-shape barre' },
    { quality: 'min',  rootString: 0, offsets: [0, 2, 2, 0, 0, 0],    label: 'Em-shape barre' },
    { quality: 'min',  rootString: 1, offsets: [-1, 0, 2, 2, 1, 0],   label: 'Am-shape barre' },
    { quality: '7',    rootString: 0, offsets: [0, 2, 0, 1, 0, 0],    label: 'E7-shape barre' },
    { quality: '7',    rootString: 1, offsets: [-1, 0, 2, 0, 2, 0],   label: 'A7-shape barre' },
    { quality: 'm7',   rootString: 0, offsets: [0, 2, 0, 0, 0, 0],    label: 'Em7-shape barre' },
    { quality: 'm7',   rootString: 1, offsets: [-1, 0, 2, 0, 1, 0],   label: 'Am7-shape barre' },
    { quality: 'maj7', rootString: 1, offsets: [-1, 0, 2, 1, 2, 0],   label: 'Amaj7-shape barre' },
    { quality: 'sus2', rootString: 1, offsets: [-1, 0, 2, 2, 0, 0],   label: 'Asus2 shape' },
    { quality: 'sus4', rootString: 0, offsets: [0, 2, 2, 2, 0, 0],    label: 'Esus4 shape' },
    { quality: 'sus4', rootString: 1, offsets: [-1, 0, 2, 2, 3, 0],   label: 'Asus4 shape' },
    { quality: 'dim',  rootString: 1, offsets: [-1, 0, 1, 2, 1, -1],  label: 'dim shape' },
    { quality: 'm7b5', rootString: 1, offsets: [-1, 0, 1, 0, 1, -1],  label: 'm7♭5 shape' },
    { quality: 'dim7', rootString: 3, offsets: [-1, -1, 0, 1, 0, 1],  label: 'dim7 shape' },
    { quality: 'aug',  rootString: 0, offsets: [0, 3, 2, 1, 1, 0],    label: 'aug shape' }
  ];
  var OPEN_STRING_PCS = [4, 9, 2, 7, 11, 4];

  // ------- preset progressions -------
  // steps: { deg: 1-based scale degree, quality: optional override (else diatonic) }
  var PROGRESSIONS = [
    { id: 'axis',    name: 'I – V – vi – IV  (Axis of Awesome)', scale: 'major', sevenths: false,
      steps: [{ deg: 1 }, { deg: 5 }, { deg: 6 }, { deg: 4 }] },
    { id: 'pop',     name: 'vi – IV – I – V  (pop / punk)', scale: 'major', sevenths: false,
      steps: [{ deg: 6 }, { deg: 4 }, { deg: 1 }, { deg: 5 }] },
    { id: 'fifties', name: 'I – vi – IV – V  (50s doo-wop)', scale: 'major', sevenths: false,
      steps: [{ deg: 1 }, { deg: 6 }, { deg: 4 }, { deg: 5 }] },
    { id: 'canon',   name: 'I – V – vi – iii – IV – I – IV – V  (Canon)', scale: 'major', sevenths: false,
      steps: [{ deg: 1 }, { deg: 5 }, { deg: 6 }, { deg: 3 }, { deg: 4 }, { deg: 1 }, { deg: 4 }, { deg: 5 }] },
    { id: 'jazz251', name: 'ii – V – I  (jazz, 7th chords)', scale: 'major', sevenths: true,
      steps: [{ deg: 2 }, { deg: 5 }, { deg: 1 }, { deg: 1 }] },
    { id: 'blues12', name: '12-Bar Blues (all dominant 7)', scale: 'major', sevenths: true,
      steps: [{ deg: 1, quality: '7' }, { deg: 1, quality: '7' }, { deg: 1, quality: '7' }, { deg: 1, quality: '7' },
              { deg: 4, quality: '7' }, { deg: 4, quality: '7' }, { deg: 1, quality: '7' }, { deg: 1, quality: '7' },
              { deg: 5, quality: '7' }, { deg: 4, quality: '7' }, { deg: 1, quality: '7' }, { deg: 5, quality: '7' }] },
    { id: 'andalusian', name: 'i – bVII – bVI – V  (Andalusian)', scale: 'aeolian', sevenths: false,
      steps: [{ deg: 1 }, { deg: 7 }, { deg: 6 }, { deg: 5, quality: 'maj' }] },
    { id: 'epicMinor', name: 'i – bVI – bIII – bVII  (epic minor)', scale: 'aeolian', sevenths: false,
      steps: [{ deg: 1 }, { deg: 6 }, { deg: 3 }, { deg: 7 }] },
    { id: 'minor251', name: 'iiø – V7 – i  (minor jazz)', scale: 'aeolian', sevenths: true,
      steps: [{ deg: 2 }, { deg: 5, quality: '7' }, { deg: 1 }, { deg: 1 }] }
  ];

  // ------- helpers -------

  function mod12(n) { return ((n % 12) + 12) % 12; }

  function pcName(pc, preferFlat) {
    pc = mod12(pc);
    return preferFlat ? FLAT[pc] : SHARP[pc];
  }

  function midiName(midi, preferFlat) {
    var pc = mod12(midi);
    var octave = Math.floor(midi / 12) - 1;
    return pcName(pc, preferFlat) + octave;
  }

  function noteFreq(midi, a4) {
    a4 = a4 || 440;
    return a4 * Math.pow(2, (midi - 69) / 12);
  }

  function freqToNote(freq, a4) {
    a4 = a4 || 440;
    if (!freq || freq <= 0 || !isFinite(freq)) return null;
    var midiFloat = 69 + 12 * Math.log2(freq / a4);
    var midi = Math.round(midiFloat);
    if (midi < 0 || midi > 127) return null;
    var cents = (midiFloat - midi) * 100;
    var pc = mod12(midi);
    return {
      midi: midi,
      midiFloat: midiFloat,
      pc: pc,
      name: SHARP[pc],
      octave: Math.floor(midi / 12) - 1,
      cents: cents
    };
  }

  function scaleInfo(rootPc, scaleId, preferFlat) {
    var scale = SCALES[scaleId];
    if (!scale) return null;
    if (preferFlat === undefined) preferFlat = FLAT_KEYS.has(mod12(rootPc));
    var pcs = scale.steps.map(function (s) { return mod12(rootPc + s); });
    var pcToStep = new Map();
    scale.steps.forEach(function (s, i) { pcToStep.set(mod12(rootPc + s), i); });
    return {
      pcs: pcs,
      names: pcs.map(function (pc) { return pcName(pc, preferFlat); }),
      intervals: scale.steps.map(function (s) { return INTERVAL_NAMES[s]; }),
      pcSet: new Set(pcs),
      pcToStep: pcToStep,
      steps: scale.steps.slice()
    };
  }

  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  var MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

  function matchQuality(pattern) {
    var key = pattern.join(',');
    for (var id in QUALITIES) {
      if (QUALITIES[id].intervals.join(',') === key) return id;
    }
    return null;
  }

  function romanFor(degIdx, scaleSteps, quality) {
    var acc = '';
    var diff = mod12(scaleSteps[degIdx] - MAJOR_STEPS[degIdx]);
    if (diff === 11) acc = '♭';
    else if (diff === 1) acc = '♯';
    var q = QUALITIES[quality] || QUALITIES.maj;
    var minorish = /^(min|m7|dim|dim7|m7b5|mMaj7)$/.test(quality);
    var numeral = minorish ? ROMAN[degIdx].toLowerCase() : ROMAN[degIdx];
    var suffix = '';
    if (quality === 'dim') suffix = '°';
    else if (quality === 'aug') suffix = '+';
    else if (quality === 'm7b5') suffix = 'ø7';
    else if (quality === 'dim7') suffix = '°7';
    else if (quality === '7') suffix = '7';
    else if (quality === 'maj7') suffix = 'maj7';
    else if (quality === 'm7') suffix = '7';
    else if (quality === 'mMaj7') suffix = '(maj7)';
    else if (quality === 'augMaj7') suffix = '+maj7';
    return acc + numeral + suffix;
  }

  // Diatonic chords of any 7-note scale (returns [] for pentatonic/blues).
  function diatonic(rootPc, scaleId, sevenths) {
    var scale = SCALES[scaleId];
    if (!scale || scale.steps.length !== 7) return [];
    var preferFlat = FLAT_KEYS.has(mod12(rootPc));
    var S = scale.steps;
    var out = [];
    for (var i = 0; i < 7; i++) {
      var t1 = mod12(S[(i + 2) % 7] - S[i]);
      var t2 = mod12(S[(i + 4) % 7] - S[i]);
      var pattern = [0, t1, t2];
      if (sevenths) pattern.push(mod12(S[(i + 6) % 7] - S[i]));
      var quality = matchQuality(pattern);
      if (!quality && sevenths) quality = matchQuality([0, t1, t2]); // fall back to triad
      if (!quality) quality = 'maj';
      var chordRoot = mod12(rootPc + S[i]);
      out.push({
        deg: i + 1,
        rootPc: chordRoot,
        quality: quality,
        roman: romanFor(i, S, quality),
        name: pcName(chordRoot, preferFlat) + QUALITIES[quality].symbol
      });
    }
    return out;
  }

  // Resolve a PROGRESSIONS preset in a key -> one chord object per step.
  function resolveProgression(preset, keyPc) {
    var scale = SCALES[preset.scale];
    var dia = diatonic(keyPc, preset.scale, !!preset.sevenths);
    var preferFlat = FLAT_KEYS.has(mod12(keyPc));
    return preset.steps.map(function (st) {
      var base = dia[st.deg - 1];
      var quality = st.quality || (base ? base.quality : 'maj');
      var rootPc = mod12(keyPc + scale.steps[st.deg - 1]);
      return {
        rootPc: rootPc,
        quality: quality,
        roman: romanFor(st.deg - 1, scale.steps, quality),
        name: pcName(rootPc, preferFlat) + QUALITIES[quality].symbol
      };
    });
  }

  function chordShapes(rootPc, quality) {
    rootPc = mod12(rootPc);
    var out = [];
    var open = OPEN_SHAPES[rootPc + ':' + quality];
    if (open) out.push(makeShape(open.slice(), 'Open'));
    for (var i = 0; i < MOVABLE.length; i++) {
      var t = MOVABLE[i];
      if (t.quality !== quality) continue;
      var rootFret = mod12(rootPc - OPEN_STRING_PCS[t.rootString]);
      if (rootFret === 0) rootFret = 12;
      var frets = t.offsets.map(function (o) { return o < 0 ? -1 : o + rootFret; });
      if (open && frets.join(',') === open.join(',')) continue;
      out.push(makeShape(frets, t.label));
    }
    out.sort(function (a, b) { return minPositive(a.frets) - minPositive(b.frets); });
    return out;
  }

  function minPositive(frets) {
    var m = 99;
    for (var i = 0; i < frets.length; i++) if (frets[i] > 0 && frets[i] < m) m = frets[i];
    return m === 99 ? 0 : m;
  }

  function makeShape(frets, label) {
    var pos = frets.filter(function (f) { return f > 0; });
    var maxF = pos.length ? Math.max.apply(null, pos) : 0;
    var baseFret = maxF <= 5 ? 1 : Math.min.apply(null, pos);
    return { frets: frets, baseFret: baseFret, label: label };
  }

  function chordVoicing(frets, tuningMidi) {
    tuningMidi = tuningMidi || TUNINGS.standard.midi;
    var out = [];
    for (var i = 0; i < frets.length; i++) {
      if (frets[i] >= 0) out.push(tuningMidi[i] + frets[i]);
    }
    return out;
  }

  function chordName(rootPc, quality, preferFlat) {
    return pcName(rootPc, preferFlat) + (QUALITIES[quality] ? QUALITIES[quality].symbol : '');
  }

  function fretMidi(stringIdx, fret, tuningId) {
    var t = TUNINGS[tuningId || 'standard'];
    return t.midi[stringIdx] + fret;
  }

  // ---------------- practice exercises (pure geometry, shared by the ----
  // ---------------- Fretboard runner and the Tab page) ------------------

  // The playable positions for an exercise: scale tones inside a 5-fret
  // window. 7-note scales anchor the window at the `mode`-th degree on the
  // low string (walking up the neck from the lowest root); pentatonics use
  // box N when pentBox > 0; everything else anchors at the lowest root.
  // Returns [{ s, f, midi }] sorted by pitch, one position per pitch.
  function exercisePath(opts) {
    var scale = SCALES[opts.scaleId];
    var tun = TUNINGS[opts.tuningId];
    if (!scale || !tun) return [];
    var info = scaleInfo(opts.rootPc, opts.scaleId);
    var steps = scale.steps;
    var maxFret = opts.maxFret || 24;
    var t0 = tun.midi[0], rootFret = 0, f;
    for (f = 0; f < 12; f++) {
      if (mod12(t0 + f) === mod12(opts.rootPc)) { rootFret = f; break; }
    }
    var win;
    if (steps.length === 5 && opts.pentBox > 0) {
      var anchors = [rootFret];
      f = rootFret + 1;
      while (anchors.length < 5 && f < rootFret + 13) {
        if (info.pcSet.has(mod12(t0 + f))) anchors.push(f);
        f++;
      }
      var a = anchors[Math.min(opts.pentBox, anchors.length) - 1];
      if (a + 4 > maxFret && a - 12 >= 0) a -= 12;
      win = [a, a + 4];
    } else if (steps.length === 7) {
      var k = opts.mode || 1;
      var a2 = rootFret + steps[(k - 1) % steps.length];
      if (a2 + 4 > maxFret && a2 - 12 >= 0) a2 -= 12;
      win = [a2, a2 + 4];
    } else {
      if (rootFret + 4 > maxFret) rootFret = Math.max(0, rootFret - 12);
      win = [rootFret, rootFret + 4];
    }
    var path = [];
    for (var s = 0; s < 6; s++) {
      for (var fr = Math.max(0, win[0]); fr <= Math.min(maxFret, win[1]); fr++) {
        var midi = tun.midi[s] + fr;
        if (info.pcSet.has(mod12(midi))) path.push({ s: s, f: fr, midi: midi });
      }
    }
    path.sort(function (a, b) { return a.midi - b.midi || a.s - b.s; });
    return path.filter(function (n, i) { return i === 0 || n.midi !== path[i - 1].midi; });
  }

  // Index sequence for a pattern: the pattern builds the ascending run
  // (straight scale, sliding groups g3-g7, or interval pairs i2-i16), the
  // direction plays it up, down (exact reverse), or up-then-down (skipping
  // the repeated apex).
  function exerciseSeq(n, pattern, dir) {
    var up = [], i, j, k;
    if (!n) return up;
    var iv = /^i([0-9]+)$/.exec(pattern);
    if (/^g[3-7]$/.test(pattern)) {
      k = parseInt(pattern.slice(1), 10);
      if (n < k) { for (i = 0; i < n; i++) up.push(i); }
      else { for (i = 0; i + k <= n; i++) for (j = 0; j < k; j++) up.push(i + j); }
    } else if (iv) {
      k = parseInt(iv[1], 10) - 1;
      if (n > k) { for (i = 0; i + k < n; i++) { up.push(i); up.push(i + k); } }
      else { for (i = 0; i < n; i++) up.push(i); }
    } else { // 'scale'
      for (i = 0; i < n; i++) up.push(i);
    }
    if (dir === 'down') return up.slice().reverse();
    if (dir === 'updown') {
      var down = up.slice().reverse();
      return up.concat(down.slice(1, Math.max(1, down.length - 1)));
    }
    return up;
  }

  return {
    SHARP: SHARP,
    FLAT: FLAT,
    FLAT_KEYS: FLAT_KEYS,
    INTERVAL_NAMES: INTERVAL_NAMES,
    SCALES: SCALES,
    SCALE_ORDER: SCALE_ORDER,
    TUNINGS: TUNINGS,
    TUNING_ORDER: TUNING_ORDER,
    QUALITIES: QUALITIES,
    QUALITY_ORDER: QUALITY_ORDER,
    PROGRESSIONS: PROGRESSIONS,
    mod12: mod12,
    pcName: pcName,
    midiName: midiName,
    noteFreq: noteFreq,
    freqToNote: freqToNote,
    scaleInfo: scaleInfo,
    diatonic: diatonic,
    resolveProgression: resolveProgression,
    chordShapes: chordShapes,
    chordVoicing: chordVoicing,
    chordName: chordName,
    fretMidi: fretMidi,
    exercisePath: exercisePath,
    exerciseSeq: exerciseSeq
  };
})();
