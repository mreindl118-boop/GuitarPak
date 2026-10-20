/* soundLAB Exercises — a Musicca-style theory and ear-training course.
 * Registers 'quiz' (nav label "Exercises"). Prefix qz-.
 *
 * Course: topic -> unit -> mode (Treble / Bass / Notation, Piano, Fretboard,
 * Ear training, Theory) -> levels. A level is 10 questions; 8 right passes
 * (9 = two stars, 10 = three). Questions come from small generators over a
 * SPELLED note model (letter + accidental + octave), so intervals, chords,
 * scales and key signatures are written the way theory books write them.
 *
 * Answering: tap a choice (or press 1-9), tap the on-screen keys or neck,
 * or PLAY it — MIDI keyboards (LUMI) and the guitar tone-in (midi:note with
 * silent:true) feed the same checker. Notation is engraved with SLMusic, a
 * subset of the SMuFL font Bravura (license: fonts/OFL-Bravura.txt).
 *
 * Stores: qz.prog {levelId: {b: best score, s: stars}}, qz.items
 * {itemKey: [right, asked]} (weak items come up more often), qz.sound
 * 'piano' | 'guitar', qz.landed (one-time landing on this page).
 */
(function () {
  'use strict';

  // ================= spelled notes =================

  var LET = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var NAT = [0, 2, 4, 5, 7, 9, 11];
  var SHARP_N = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  var FLAT_N = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  var CANON = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  var PC_LABEL = ['C', 'C♯/D♭', 'D', 'D♯/E♭', 'E', 'F', 'F♯/G♭', 'G', 'G♯/A♭', 'A', 'A♯/B♭', 'B'];
  var ROOT_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'B♭', 'E♭', 'A♭', 'D♭', 'F♯', 'C♯', 'G♭'];

  function mod(n, m) { return ((n % m) + m) % m; }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function pick(a) { return a[rnd(a.length)]; }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function isBlack(m) { var p = mod(m, 12); return p === 1 || p === 3 || p === 6 || p === 8 || p === 10; }
  function nt(L, acc, oct) { return { L: L, acc: acc, oct: oct }; }
  function midiOf(n) { return 12 * (n.oct + 1) + NAT[n.L] + n.acc; }
  function stepOf(n) { return n.oct * 7 + n.L; }
  function fromStep(step, acc) { return nt(mod(step, 7), acc || 0, Math.floor(step / 7)); }
  function accStr(a) { return a === 1 ? '♯' : a === -1 ? '♭' : a === 2 ? '♯♯' : a === -2 ? '♭♭' : ''; }
  function nm(n) { return LET[n.L] + accStr(n.acc); }
  function nmOct(n) { return nm(n) + n.oct; }
  function parseName(s) {
    var a = s.slice(1);
    return { L: LET.indexOf(s.charAt(0)), acc: a === '♯' ? 1 : a === '♭' ? -1 : 0 };
  }
  function okAcc(n) { return n.acc >= -1 && n.acc <= 1; }
  // E♯ B♯ C♭ F♭: correct in context, confusing as a reading drill
  function oddSpelling(n) {
    return (n.acc === 1 && (n.L === 2 || n.L === 6)) || (n.acc === -1 && (n.L === 0 || n.L === 3));
  }
  function shiftIv(n, iv, dir) {
    var r = fromStep(stepOf(n) + dir * (iv.n - 1), 0);
    r.acc = midiOf(n) + dir * iv.s - midiOf(r);
    return r;
  }
  function addIv(n, iv) { return shiftIv(n, iv, 1); }
  function subIv(n, iv) { return shiftIv(n, iv, -1); }
  function enharm(n) {
    var m = midiOf(n);
    for (var d = -1; d <= 1; d += 2) {
      var r = fromStep(stepOf(n) + d, 0);
      r.acc = m - midiOf(r);
      if (okAcc(r) && !oddSpelling(r)) return r;
    }
    return null;
  }
  function countAcc(ns) { var c = 0; ns.forEach(function (n) { if (n.acc) c++; }); return c; }
  function fold(m) { while (m < 60) m += 12; while (m > 83) m -= 12; return m; }
  function ordinal(i) { return i + (i === 1 ? 'st' : i === 2 ? 'nd' : i === 3 ? 'rd' : 'th'); }

  // ================= theory tables =================

  var IV = {
    m2: { n: 2, s: 1, w: 'minor 2nd' }, M2: { n: 2, s: 2, w: 'major 2nd' },
    m3: { n: 3, s: 3, w: 'minor 3rd' }, M3: { n: 3, s: 4, w: 'major 3rd' },
    P4: { n: 4, s: 5, w: 'perfect 4th' }, A4: { n: 4, s: 6, w: 'augmented 4th' },
    d5: { n: 5, s: 6, w: 'diminished 5th' }, TT: { n: 4, s: 6, w: 'tritone' },
    P5: { n: 5, s: 7, w: 'perfect 5th' }, A5: { n: 5, s: 8, w: 'augmented 5th' },
    m6: { n: 6, s: 8, w: 'minor 6th' }, M6: { n: 6, s: 9, w: 'major 6th' },
    d7: { n: 7, s: 9, w: 'diminished 7th' }, m7: { n: 7, s: 10, w: 'minor 7th' },
    M7: { n: 7, s: 11, w: 'major 7th' }, P8: { n: 8, s: 12, w: 'octave' }
  };
  // ascending ear hooks
  var IV_SONG = {
    m2: 'Jaws', M2: 'Happy Birthday', m3: 'Greensleeves', M3: 'When the Saints Go Marching In',
    P4: 'Here Comes the Bride', TT: 'The Simpsons', P5: 'Star Wars', m6: 'The Entertainer',
    M6: 'My Bonnie Lies over the Ocean', m7: 'Star Trek', M7: 'Take On Me',
    P8: 'Somewhere Over the Rainbow'
  };

  var CH = {
    maj: { iv: ['M3', 'P5'], w: 'major', sym: '' },
    min: { iv: ['m3', 'P5'], w: 'minor', sym: 'm' },
    dim: { iv: ['m3', 'd5'], w: 'diminished', sym: '°' },
    aug: { iv: ['M3', 'A5'], w: 'augmented', sym: '+' },
    sus2: { iv: ['M2', 'P5'], w: 'sus2', sym: 'sus2' },
    sus4: { iv: ['P4', 'P5'], w: 'sus4', sym: 'sus4' },
    maj7: { iv: ['M3', 'P5', 'M7'], w: 'major 7th', sym: 'maj7' },
    dom7: { iv: ['M3', 'P5', 'm7'], w: 'dominant 7th', sym: '7' },
    m7: { iv: ['m3', 'P5', 'm7'], w: 'minor 7th', sym: 'm7' },
    m7b5: { iv: ['m3', 'd5', 'm7'], w: 'half-diminished', sym: 'm7♭5' },
    dim7: { iv: ['m3', 'd5', 'd7'], w: 'diminished 7th', sym: '°7' },
    six: { iv: ['M3', 'P5', 'M6'], w: 'major 6th', sym: '6' },
    m6: { iv: ['m3', 'P5', 'M6'], w: 'minor 6th', sym: 'm6' },
    sus47: { iv: ['P4', 'P5', 'm7'], w: '7sus4', sym: '7sus4' }
  };
  var DEGL = { M2: '2', m3: '♭3', M3: '3', P4: '4', d5: '♭5', P5: '5', A5: '♯5', M6: '6', d7: '♭♭7', m7: '♭7', M7: '7' };

  function buildChord(root, q) {
    return [root].concat(CH[q].iv.map(function (id) { return addIv(root, IV[id]); }));
  }
  function chordLabel(root, q) {
    if (q === 'maj' || q === 'min' || q === 'dim' || q === 'aug') return nm(root) + ' ' + CH[q].w;
    return nm(root) + CH[q].sym;
  }
  function formula(q) { return ['1'].concat(CH[q].iv.map(function (i) { return DEGL[i]; })).join(' '); }
  function pcKey(rootPc, q) {
    return [0].concat(CH[q].iv.map(function (i) { return IV[i].s; }))
      .map(function (s) { return mod(rootPc + s, 12); })
      .sort(function (a, b) { return a - b; }).join(',');
  }

  var SC = {
    major: { d: [[1, 0], [2, 2], [3, 4], [4, 5], [5, 7], [6, 9], [7, 11]], w: 'major' },
    minor: { d: [[1, 0], [2, 2], [3, 3], [4, 5], [5, 7], [6, 8], [7, 10]], w: 'natural minor' },
    harm: { d: [[1, 0], [2, 2], [3, 3], [4, 5], [5, 7], [6, 8], [7, 11]], w: 'harmonic minor' },
    mel: { d: [[1, 0], [2, 2], [3, 3], [4, 5], [5, 7], [6, 9], [7, 11]], w: 'melodic minor' },
    majp: { d: [[1, 0], [2, 2], [3, 4], [5, 7], [6, 9]], w: 'major pentatonic' },
    minp: { d: [[1, 0], [3, 3], [4, 5], [5, 7], [7, 10]], w: 'minor pentatonic' },
    blues: { d: [[1, 0], [3, 3], [4, 5], [5, 6], [5, 7], [7, 10]], w: 'blues' },
    dorian: { d: [[1, 0], [2, 2], [3, 3], [4, 5], [5, 7], [6, 9], [7, 10]], w: 'dorian' },
    phryg: { d: [[1, 0], [2, 1], [3, 3], [4, 5], [5, 7], [6, 8], [7, 10]], w: 'phrygian' },
    lyd: { d: [[1, 0], [2, 2], [3, 4], [4, 6], [5, 7], [6, 9], [7, 11]], w: 'lydian' },
    mixo: { d: [[1, 0], [2, 2], [3, 4], [4, 5], [5, 7], [6, 9], [7, 10]], w: 'mixolydian' }
  };
  function buildScale(root, t) {
    return SC[t].d.map(function (x) {
      var r = fromStep(stepOf(root) + x[0] - 1, 0);
      r.acc = midiOf(root) + x[1] - midiOf(r);
      return r;
    });
  }
  function stepPattern(midis) {
    var out = [];
    for (var i = 1; i < midis.length; i++) {
      var d = Math.abs(midis[i] - midis[i - 1]);
      out.push(d === 1 ? 'H' : d === 2 ? 'W' : d === 3 ? 'W+H' : d + '');
    }
    return out.join(' ');
  }

  // key signatures: n = +sharps / -flats
  var KEYS = [
    { n: 0, maj: 'C', min: 'A' }, { n: 1, maj: 'G', min: 'E' }, { n: 2, maj: 'D', min: 'B' },
    { n: 3, maj: 'A', min: 'F♯' }, { n: 4, maj: 'E', min: 'C♯' }, { n: 5, maj: 'B', min: 'G♯' },
    { n: 6, maj: 'F♯', min: 'D♯' }, { n: 7, maj: 'C♯', min: 'A♯' },
    { n: -1, maj: 'F', min: 'D' }, { n: -2, maj: 'B♭', min: 'G' }, { n: -3, maj: 'E♭', min: 'C' },
    { n: -4, maj: 'A♭', min: 'F' }, { n: -5, maj: 'D♭', min: 'B♭' }, { n: -6, maj: 'G♭', min: 'E♭' },
    { n: -7, maj: 'C♭', min: 'A♭' }
  ];
  var SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  var FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
  function keyByN(n) { for (var i = 0; i < KEYS.length; i++) if (KEYS[i].n === n) return KEYS[i]; return null; }
  function keyByName(maj) { for (var i = 0; i < KEYS.length; i++) if (KEYS[i].maj === maj) return KEYS[i]; return null; }

  var MAJ_Q = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
  var MAJ_N = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
  var MIN_Q = ['min', 'dim', 'maj', 'min', 'maj', 'maj', 'dim'];
  var MIN_N = ['i', 'ii°', 'III', 'iv', 'V', 'VI', 'vii°'];
  var DS = [0, 2, 4, 5, 7, 9, 11];
  var TRI = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6] };
  var SOLF = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'];

  // diatonic triads of a key (minor uses the raised 7th: V and vii°)
  function keyChords(key, minor) {
    var tn = parseName(minor ? key.min : key.maj);
    var sc = buildScale(nt(tn.L, tn.acc, 4), minor ? 'minor' : 'major');
    return sc.map(function (deg, i) {
      var q = (minor ? MIN_Q : MAJ_Q)[i];
      var root = (minor && i === 6) ? nt(deg.L, deg.acc + 1, deg.oct) : deg;
      return { num: (minor ? MIN_N : MAJ_N)[i], root: root, q: q,
        name: nm(root) + (q === 'min' ? 'm' : q === 'dim' ? '°' : '') };
    });
  }

  // ================= adaptive item picking =================

  var items = null;
  function itemStats() {
    if (!items) {
      items = App.store.get('qz.items', {});
      if (!items || typeof items !== 'object') items = {};
    }
    return items;
  }
  // weak items (low accuracy so far) come up more often
  function pickW(list, prefix) {
    var st = itemStats(), tot = 0;
    var w = list.map(function (id) {
      var s = st[prefix + id] || [0, 0];
      var x = 1 + 2.5 * (1 - (s[0] + 1) / (s[1] + 2));
      tot += x;
      return x;
    });
    var r = Math.random() * tot;
    for (var i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  }
  function recordItem(key, ok) {
    if (!key) return;
    var st = itemStats(), s = st[key] || [0, 0];
    if (ok) s[0]++;
    s[1]++;
    st[key] = s;
    App.store.set('qz.items', st);
  }

  // ================= question generators =================
  // Each returns { kind: 'choice'|'single'|'set', prompt, show?, audio?,
  // choices/correct (choice), pc (single), pcs (set), board, reveal,
  // explain, item (stats key), miss (label for the summary), sig }.

  var GEN = {};
  var TOPL = { treble: 38, bass: 26 };

  function letterChoices() { return LET.map(function (l, i) { return { id: l, label: l, pc: NAT[i] }; }); }
  function pcChoices() { return PC_LABEL.map(function (l, i) { return { id: 'pc' + i, label: l, pc: i }; }); }

  function posText(clef, n) {
    var top = TOPL[clef], bot = top - 8, st = stepOf(n);
    var mn = clef === 'treble'
      ? ['E G B D F (Every Good Boy Does Fine)', 'F A C E']
      : ['G B D F A (Good Boys Do Fine Always)', 'A C E G (All Cows Eat Grass)'];
    if (midiOf(n) === 60 && n.L === 0) return ' — middle C, one ledger line ' + (clef === 'treble' ? 'below the treble' : 'above the bass') + ' staff.';
    if (st > top + 1 || st < bot - 1) {
      var on = (st > top ? st - top : bot - st) % 2 === 0;
      return ' — ' + (on ? 'on a ledger line ' : 'between ledger lines ') + (st > top ? 'above' : 'below') + ' the staff.';
    }
    if (st === bot - 1) return ' — just below the staff.';
    if (st === top + 1) return ' — just above the staff.';
    var d = st - bot;
    if (d % 2 === 0) return ' — line ' + (d / 2 + 1) + '. Lines from the bottom: ' + mn[0] + '.';
    return ' — space ' + ((d - 1) / 2 + 1) + '. Spaces from the bottom: ' + mn[1] + '.';
  }

  function spelledChoices(q, n) {
    var seen = {}, list = [], guard = 0;
    function add(x) {
      if (!x || !okAcc(x) || oddSpelling(x)) return;
      var k = nm(x);
      if (!seen[k]) { seen[k] = 1; list.push(x); }
    }
    add(n);
    add(enharm(n));
    add(nt(n.L, 0, n.oct));
    add(nt(n.L, n.acc ? -n.acc : 1, n.oct));
    add(fromStep(stepOf(n) + 1, n.acc));
    add(fromStep(stepOf(n) - 1, n.acc));
    while (list.length < 6 && guard++ < 60) add(nt(rnd(7), pick([-1, 0, 1]), n.oct));
    list = list.slice(0, 6).sort(function (a, b) { return a.L - b.L || a.acc - b.acc; });
    q.choices = list.map(function (x) { return { id: nm(x), label: nm(x), pc: mod(midiOf(x), 12) }; });
    q.correct = nm(n);
  }

  GEN.noteRead = function (o) {
    var n, tries = 0;
    do {
      n = fromStep(o.lo + rnd(o.hi - o.lo + 1), o.acc ? pick([-1, 1, -1, 1, 0]) : 0);
    } while (o.acc && oddSpelling(n) && tries++ < 30);
    if (oddSpelling(n)) n.acc = 0;
    var midi = midiOf(n);
    var q = {
      item: 'nr:' + o.clef + ':' + nm(n), miss: nmOct(n), sig: nmOct(n),
      show: { type: 'staff', clef: o.clef, cols: [[n]] },
      audio: [{ m: [midi], at: 0, d: 1 }],
      explain: 'That’s ' + nmOct(n) + posText(o.clef, n)
    };
    if (o.play) {
      q.kind = 'single'; q.pc = mod(midi, 12); q.board = 'keys';
      q.prompt = 'Play this note — any octave';
      q.reveal = { keys: [midi] };
      return q;
    }
    q.kind = 'choice'; q.prompt = 'Name this note'; q.pcAnswer = mod(midi, 12);
    if (o.acc) spelledChoices(q, n);
    else { q.choices = letterChoices(); q.correct = LET[n.L]; }
    return q;
  };

  GEN.keyName = function (o) {
    var midi;
    do { midi = 60 + rnd(24); } while (!o.black && isBlack(midi));
    var pc = mod(midi, 12);
    var q = {
      kind: 'choice', item: 'kn:' + pc, miss: PC_LABEL[pc], sig: String(midi),
      prompt: 'Name the marked key', pcAnswer: pc,
      show: { type: 'keys', marks: {} }, audio: [{ m: [midi], at: 0, d: 1 }],
      explain: 'That key is ' + PC_LABEL[pc] + '. C sits just left of each pair of black keys, F just left of each group of three.'
    };
    q.show.marks[midi] = 'a';
    if (o.black) { q.choices = pcChoices(); q.correct = 'pc' + pc; } else { q.choices = letterChoices(); q.correct = LET[NAT.indexOf(pc)]; }
    return q;
  };

  GEN.keyFind = function (o) {
    var midi;
    do { midi = 60 + rnd(12); } while (o.black ? !isBlack(midi) : isBlack(midi));
    var pc = mod(midi, 12);
    var name = o.black ? (Math.random() < 0.5 ? SHARP_N[pc] : FLAT_N[pc]) : LET[NAT.indexOf(pc)];
    return {
      kind: 'single', pc: pc, board: 'keys', item: 'kf:' + pc, miss: name, sig: name,
      prompt: 'Find ' + name + ' — tap it or play it',
      audio: [{ m: [midi], at: 0, d: 1 }], reveal: { keys: [midi, midi + 12] },
      explain: name + (o.black ? ' is the black key also called ' + PC_LABEL[pc] + '.' : ' — it’s marked in green.')
    };
  };

  var OPEN = [40, 45, 50, 55, 59, 64];
  var STR_NAME = ['low E (6th)', 'A (5th)', 'D (4th)', 'G (3rd)', 'B (2nd)', 'high E (1st)'];

  GEN.neckName = function (o) {
    var s, f, midi;
    do { s = rnd(6); f = rnd(o.max + 1); midi = OPEN[s] + f; } while (o.nat && isBlack(midi));
    var pc = mod(midi, 12);
    var q = {
      kind: 'choice', item: 'gn:' + s + ':' + f, miss: PC_LABEL[pc] + ' (' + STR_NAME[s] + ', fret ' + f + ')', sig: s + ':' + f,
      prompt: 'Name the note at the dot', pcAnswer: pc,
      show: { type: 'neck', frets: o.max <= 5 ? 5 : 12, marks: [{ s: s, f: f, c: 'a' }] },
      audio: [{ m: [midi], at: 0, d: 1.2, gtr: 1 }],
      explain: PC_LABEL[pc] + ' — ' + STR_NAME[s] + ' string, fret ' + f + '. Each fret is a half step up from the open string.'
    };
    if (o.nat) { q.choices = letterChoices(); q.correct = LET[NAT.indexOf(pc)]; } else { q.choices = pcChoices(); q.correct = 'pc' + pc; }
    return q;
  };

  GEN.neckFind = function (o) {
    var s = rnd(6), f = rnd(o.max + 1), midi = OPEN[s] + f, pc = mod(midi, 12);
    var name = isBlack(midi) ? (Math.random() < 0.5 ? SHARP_N[pc] : FLAT_N[pc]) : LET[NAT.indexOf(pc)];
    var spots = [];
    for (var ff = 0; ff <= 12; ff++) if (mod(OPEN[s] + ff, 12) === pc) spots.push({ s: s, f: ff });
    return {
      kind: 'single', pc: pc, string: s, board: 'neck', frets: 12,
      item: 'gf:' + s + ':' + pc, miss: name + ' on ' + STR_NAME[s], sig: s + name,
      prompt: 'Find ' + name + ' on the ' + STR_NAME[s] + ' string',
      audio: [{ m: [midi], at: 0, d: 1.2, gtr: 1 }], reveal: { neck: spots },
      explain: name + ' on the ' + STR_NAME[s] + ' string: fret ' + spots.map(function (p) { return p.f; }).join(' and ') + '.'
    };
  };

  GEN.pitch = function (o) {
    var a = 55 + rnd(18), d = o.min + rnd(o.max - o.min + 1), up = Math.random() < 0.5, b = a + (up ? d : -d);
    return {
      kind: 'choice', ear: 1, auto: 1, item: 'p:' + (up ? 'up' : 'down') + d, miss: (up ? 'up ' : 'down ') + d, sig: a + ':' + b,
      prompt: 'Is the second note higher or lower?',
      audio: [{ m: [a], at: 0, d: 0.9 }, { m: [b], at: 0.95, d: 1.2 }],
      choices: [{ id: 'lo', label: 'Lower' }, { id: 'hi', label: 'Higher' }], correct: up ? 'hi' : 'lo',
      explain: 'It went ' + (up ? 'up' : 'down') + ' ' + d + ' half step' + (d > 1 ? 's' : '') + '.'
    };
  };

  GEN.interval = function (o) {
    var id = pickW(o.set, 'iv:'), iv = IV[id], q, choices;
    choices = o.set.map(function (k) { return { id: k, label: IV[k].w }; });
    if (o.show === 'staff') {
      var lo, hi, tries = 0;
      do {
        lo = fromStep(28 + rnd(8), o.acc ? pick([0, 0, -1, 1]) : 0);
        hi = addIv(lo, iv);
        tries++;
      } while (tries < 120 && (!okAcc(hi) || oddSpelling(lo) || oddSpelling(hi) || (!o.acc && (lo.acc || hi.acc))));
      var harm = !o.play && Math.random() < 0.4;
      q = {
        item: 'iv:' + id, miss: iv.w, sig: nm(lo) + id,
        audio: harm ? [{ m: [midiOf(lo), midiOf(hi)], at: 0, d: 1.5 }]
          : [{ m: [midiOf(lo)], at: 0, d: 0.8 }, { m: [midiOf(hi)], at: 0.85, d: 1.2 }],
        explain: nm(lo) + ' to ' + nm(hi) + ': ' + iv.n + ' letter names, ' + iv.s + ' half step' + (iv.s === 1 ? '' : 's') + ' — a ' + iv.w + '.'
      };
      if (o.play) {
        q.kind = 'single'; q.pc = mod(midiOf(hi), 12); q.board = 'keys';
        q.show = { type: 'staff', clef: 'treble', cols: [[lo]] };
        q.prompt = 'Play a ' + iv.w + ' above ' + nm(lo);
        q.reveal = { staff: { cols: [[lo], [hi]], ok: 1 }, keys: [midiOf(lo), midiOf(hi)] };
      } else {
        q.kind = 'choice'; q.prompt = 'Name this interval';
        q.show = { type: 'staff', clef: 'treble', cols: harm ? [[lo, hi]] : [[lo], [hi]] };
        q.choices = choices; q.correct = id;
      }
      return q;
    }
    if (o.show === 'keys') {
      var r = 60 + rnd(12), t = r + iv.s;
      q = {
        item: 'ik:' + id, miss: iv.w, sig: r + id, board: 'keys',
        audio: [{ m: [r], at: 0, d: 0.8 }, { m: [t], at: 0.85, d: 1.2 }],
        explain: 'From ' + PC_LABEL[mod(r, 12)] + ' up ' + iv.s + ' half step' + (iv.s === 1 ? '' : 's') + ' to ' + PC_LABEL[mod(t, 12)] + ' — a ' + iv.w + '.',
        show: { type: 'keys', marks: {} }
      };
      q.show.marks[r] = 'a';
      if (o.play) {
        q.kind = 'single'; q.pc = mod(t, 12);
        q.prompt = 'Play a ' + iv.w + ' above the marked key';
        q.reveal = { keys: [t] };
      } else {
        q.show.marks[t] = 'b';
        q.kind = 'choice'; q.prompt = 'Name the interval between the marked keys';
        q.choices = choices; q.correct = id;
      }
      return q;
    }
    // ear
    var root = 50 + rnd(16), top = root + iv.s;
    var ev = o.dir === 'harm' ? [{ m: [root, top], at: 0, d: 1.7 }]
      : o.dir === 'down' ? [{ m: [top], at: 0, d: 0.9 }, { m: [root], at: 0.95, d: 1.3 }]
        : [{ m: [root], at: 0, d: 0.9 }, { m: [top], at: 0.95, d: 1.3 }];
    return {
      kind: 'choice', ear: 1, auto: 1, item: 'ie' + (o.dir || 'up') + ':' + id, miss: iv.w, sig: root + id,
      prompt: 'Which interval do you hear?', audio: ev, choices: choices, correct: id,
      explain: 'A ' + iv.w + ' — ' + iv.s + ' half step' + (iv.s === 1 ? '' : 's') + '.' + (IV_SONG[id] && o.dir !== 'down' && o.dir !== 'harm' ? ' Going up it sounds like “' + IV_SONG[id] + '”.' : '')
    };
  };

  // a playable register for chords heard but not shown
  function lowVoicing(midis) {
    var lo = Math.min.apply(null, midis);
    var sh = lo >= 60 ? -12 : 0;
    return midis.map(function (m) { return m + sh; });
  }

  function fitStaff(ns) {
    var hi = Math.max.apply(null, ns.map(stepOf));
    var lo = Math.min.apply(null, ns.map(stepOf));
    var sh = (hi > 42 && lo - 7 >= 24) ? -1 : 0;
    return ns.map(function (n) { return nt(n.L, n.acc, n.oct + sh); });
  }

  function chordChoices(root, qid, set, byPc) {
    var correctKey = pcKey(mod(midiOf(root), 12), qid);
    var seen = {}, list = [], guard = 0;
    function lab(r, q) { return byPc ? CANON[mod(midiOf(r), 12)] + (CH[q].sym && !(q === 'maj' || q === 'min' || q === 'dim' || q === 'aug') ? CH[q].sym : ' ' + CH[q].w) : chordLabel(r, q); }
    function add(r, q) {
      if (!r || !okAcc(r)) return;
      var l = lab(r, q);
      if (seen[l]) return;
      if (list.length && pcKey(mod(midiOf(r), 12), q) === correctKey) return; // sounds identical: not a fair distractor
      seen[l] = 1;
      list.push(l);
    }
    add(root, qid);
    set.forEach(function (q2) { add(root, q2); });
    if (!byPc) add(enharm(root), qid);
    add(addIv(root, IV.M2), qid);
    add(subIv(root, IV.m2), qid);
    ['maj', 'min', 'dim'].forEach(function (q3) { add(root, q3); });
    while (list.length < 6 && guard++ < 40) {
      var rn = parseName(pick(ROOT_NAMES));
      add(nt(rn.L, rn.acc, 4), pick(set));
    }
    return list.slice(0, 6).sort().map(function (l) { return { id: l, label: l }; });
  }

  function spellChoices(notes) {
    var correct = notes.map(nm).join(' '), seen = {}, list = [];
    seen[correct] = 1;
    function add(ns) {
      if (!ns.every(okAcc)) return;
      var k = ns.map(nm).join(' ');
      if (!seen[k]) { seen[k] = 1; list.push(k); }
    }
    for (var i = 1; i < notes.length; i++) {
      [-1, 1].forEach(function (d) {
        var c = notes.slice();
        c[i] = nt(c[i].L, c[i].acc + d, c[i].oct);
        add(c);
      });
    }
    for (var j = 0; j < notes.length; j++) {
      var e = enharm(notes[j]);
      if (e) { var c2 = notes.slice(); c2[j] = e; add(c2); }
    }
    return shuffle([correct].concat(shuffle(list).slice(0, 3))).map(function (l) { return { id: l, label: l }; });
  }

  GEN.chord = function (o) {
    var qid = pickW(o.set, 'ch:'), maxAcc = o.maxAcc == null ? 3 : o.maxAcc;
    var root, notes, t = 0;
    for (; t < 300; t++) {
      var rn = parseName(pick(o.white ? LET : ROOT_NAMES));
      root = nt(rn.L, rn.acc, 4);
      notes = buildChord(root, qid);
      if (notes.every(okAcc) && countAcc(notes) <= (t < 200 ? maxAcc : 4)) break;
    }
    var label = chordLabel(root, qid);
    var inv = (o.inv && !(qid === 'sus2' && o.set.indexOf('sus4') >= 0)) ? 1 + rnd(notes.length - 1) : 0;
    var voiced = notes.slice();
    for (var k = 0; k < inv; k++) { var b = voiced.shift(); voiced.push(nt(b.L, b.acc, b.oct + 1)); }
    voiced = fitStaff(voiced);
    var midis = voiced.map(midiOf);
    var q = {
      item: 'ch:' + qid, miss: CH[qid].w, sig: label + inv,
      explain: label + ' = ' + notes.map(nm).join(' ') + ' (' + formula(qid) + ')' + (inv ? ', here in ' + ordinal(inv) + ' inversion.' : '.')
    };
    if (o.show === 'ear') {
      var low = lowVoicing(midis);
      q.audio = o.arp
        ? [{ m: low, at: 0, d: 2.2, strum: 0.34 }, { m: low, at: low.length * 0.34 + 0.35, d: 1.6 }]
        : [{ m: low, at: 0, d: 1.9 }];
      q.kind = 'choice'; q.ear = 1; q.auto = 1;
      q.prompt = 'Which chord quality do you hear?';
      q.choices = o.set.map(function (s) { return { id: s, label: CH[s].w }; });
      q.correct = qid;
      return q;
    }
    q.audio = [{ m: midis, at: 0, d: 1.8 }];
    if (o.task === 'spell') {
      q.kind = 'choice'; q.prompt = 'Which notes spell ' + label + '?';
      q.choices = spellChoices(notes); q.correct = notes.map(nm).join(' ');
      q.reveal = { staff: { cols: [notes], clef: 'treble', ok: 1 } };
      return q;
    }
    if (o.task === 'play') {
      q.kind = 'set'; q.board = 'keys'; q.pcs = {};
      midis.forEach(function (m) { q.pcs[mod(m, 12)] = true; });
      q.prompt = 'Play ' + label;
      q.hint = 'Any inversion, any octave.';
      q.reveal = { keys: midis.map(fold) };
      return q;
    }
    if (o.show === 'keys') {
      q.kind = 'choice'; q.prompt = 'Name the chord on the keys';
      q.show = { type: 'keys', marks: {} };
      midis.forEach(function (m) { q.show.marks[fold(m)] = 'a'; });
      q.choices = chordChoices(root, qid, o.set, true);
      var cl = CANON[mod(midiOf(root), 12)];
      q.correct = cl + (qid === 'maj' || qid === 'min' || qid === 'dim' || qid === 'aug' ? ' ' + CH[qid].w : CH[qid].sym);
      q.explain = q.correct + ': ' + midis.map(function (m) { return PC_LABEL[mod(m, 12)]; }).join(' · ') + ' (' + formula(qid) + ').';
      return q;
    }
    q.kind = 'choice'; q.prompt = 'Name this chord';
    q.show = { type: 'staff', clef: 'treble', cols: [voiced] };
    q.choices = chordChoices(root, qid, o.set, false); q.correct = label;
    return q;
  };

  GEN.diatonic = function (o) {
    if (o.task === 'ear') {
      var ton = 55 + rnd(7);
      var di = +pickW(o.nums.map(String), 'de:');
      var chordAt = function (d) {
        var r = ton + DS[d];
        if (r > ton + 6) r -= 12;
        return TRI[MAJ_Q[d]].map(function (s) { return r + s; }).concat([r - 12]);
      };
      var why = ['home — the tonic', 'the ii chord, minor', 'the iii chord, minor', 'the subdominant IV', 'the dominant V — it pulls back home', 'the relative minor vi', 'the diminished vii°'];
      return {
        kind: 'choice', ear: 1, auto: 1, item: 'de:' + di, miss: MAJ_N[di], sig: ton + ':' + di,
        prompt: 'The key chord plays first. Which chord follows?',
        audio: [{ m: chordAt(0), at: 0, d: 1.0 }, { m: chordAt(di), at: 1.3, d: 1.6 }],
        choices: o.nums.map(function (d) { return { id: String(d), label: MAJ_N[d] }; }), correct: String(di),
        explain: 'That was ' + MAJ_N[di] + ' — ' + why[di] + '.'
      };
    }
    var minor = !!o.minor;
    var pool = KEYS.filter(function (k) { return Math.abs(k.n) <= (o.max || 3); });
    var key = keyByName(pickW(pool.map(function (k) { return k.maj; }), 'dk:'));
    var cs = keyChords(key, minor);
    var i = +pickW(['0', '1', '2', '3', '4', '5', '6'], (o.task === 'c2n' ? 'dc' : 'dn') + (minor ? 'm:' : 'M:'));
    var kname = minor ? key.min + ' minor' : key.maj + ' major';
    var c = cs[i];
    var q = {
      kind: 'choice', item: (o.task === 'c2n' ? 'dc' : 'dn') + (minor ? 'm:' : 'M:') + i, miss: c.num + ' in ' + kname, sig: kname + i,
      audio: [{ m: buildChord(c.root, c.q).map(midiOf), at: 0, d: 1.6 }],
      explain: kname + ': ' + cs.map(function (x) { return x.num + ' ' + x.name; }).join(' · ')
    };
    if (o.task === 'c2n') {
      q.prompt = 'In ' + kname + ', which numeral is ' + c.name + '?';
      q.choices = cs.map(function (x) { return { id: x.num, label: x.num }; });
      q.correct = c.num;
    } else {
      q.prompt = 'In ' + kname + ', which chord is ' + c.num + '?';
      q.choices = shuffle(cs.map(function (x) { return { id: x.name, label: x.name }; }));
      q.correct = c.name;
    }
    return q;
  };

  GEN.scale = function (o) {
    var t = pickW(o.set, 'sc:'), root, notes, k;
    for (k = 0; k < 200; k++) {
      var rn = parseName(pick(o.white ? LET : ROOT_NAMES));
      root = nt(rn.L, rn.acc, 4);
      notes = buildScale(root, t);
      if (notes.every(okAcc)) break;
    }
    var all = notes.concat([nt(root.L, root.acc, root.oct + 1)]);
    var midis = all.map(midiOf);
    var label = nm(root) + ' ' + SC[t].w;
    var seq = o.down ? midis.slice().reverse() : midis;
    var q = {
      item: 'sc:' + t, miss: SC[t].w, sig: label + (o.down ? 'd' : ''),
      audio: seq.map(function (m, i) { return { m: [m], at: i * 0.32, d: i === seq.length - 1 ? 1.1 : 0.4 }; }),
      explain: label + ': ' + notes.map(nm).join(' ') + ' — steps ' + stepPattern(midis) + '.'
    };
    var choices = o.set.map(function (s) { return { id: s, label: SC[s].w }; });
    if (o.task === 'play') {
      q.kind = 'set'; q.board = 'keys'; q.pcs = {};
      midis.forEach(function (m) { q.pcs[mod(m, 12)] = true; });
      q.prompt = 'Play the ' + label + ' scale';
      q.hint = 'Any order, any octave.';
      q.reveal = { keys: midis.map(fold) };
      return q;
    }
    q.kind = 'choice'; q.choices = choices; q.correct = t;
    if (o.show === 'ear') { q.ear = 1; q.auto = 1; q.prompt = 'Which scale do you hear?'; return q; }
    if (o.show === 'keys') {
      q.prompt = 'Which scale is marked, starting on ' + PC_LABEL[mod(midis[0], 12)] + '?';
      q.show = { type: 'keys', marks: {} };
      midis.forEach(function (m) { q.show.marks[m] = 'a'; });
      return q;
    }
    q.prompt = 'Which scale is this?';
    q.show = { type: 'staff', clef: 'treble', cols: all.map(function (n) { return [n]; }), tight: 1 };
    return q;
  };

  var MODE_IV = { dorian: 'M2', phryg: 'M3', lyd: 'P4', mixo: 'P5' };
  var MODE_DEG = { dorian: 2, phryg: 3, lyd: 4, mixo: 5 };
  GEN.modeParent = function () {
    var m = pickW(['dorian', 'phryg', 'lyd', 'mixo'], 'mp:'), root, parent, k = 0;
    do {
      var rn = parseName(pick(ROOT_NAMES));
      root = nt(rn.L, rn.acc, 4);
      parent = subIv(root, IV[MODE_IV[m]]);
    } while ((!okAcc(parent) || !keyByName(nm(parent))) && k++ < 80);
    var pk = keyByName(nm(parent));
    var labels = [nm(parent) + ' major', nm(root) + ' major'];
    [1, -1, 2, -2, 3, -3].forEach(function (d) { var kk = keyByN(pk.n + d); if (kk) labels.push(kk.maj + ' major'); });
    var seen = {}, list = [];
    labels.forEach(function (l) { if (!seen[l] && list.length < 6) { seen[l] = 1; list.push(l); } });
    return {
      kind: 'choice', item: 'mp:' + m, miss: SC[m].w, sig: nm(root) + m,
      prompt: nm(root) + ' ' + SC[m].w + ' uses the notes of which major scale?',
      choices: shuffle(list).map(function (l) { return { id: l, label: l }; }), correct: nm(parent) + ' major',
      explain: nm(root) + ' is the ' + ordinal(MODE_DEG[m]) + ' degree of ' + nm(parent) + ' major, so ' + nm(root) + ' ' + SC[m].w + ' = ' + buildScale(root, m).map(nm).join(' ') + '.'
    };
  };

  GEN.degree = function (o) {
    var ton = 55 + rnd(8);
    var d = +pickW(o.degs.map(String), 'dg:');
    var tri = function (r) { return [r, r + 4, r + 7]; };
    var cad = [tri(ton), [ton, ton + 5, ton + 9], [ton - 1, ton + 2, ton + 7], tri(ton)];
    var audio = cad.map(function (c, i) { return { m: c, at: i * 0.6, d: 0.6 }; });
    var target = ton + 12 + DS[d - 1];
    audio.push({ m: [target], at: 2.75, d: 1.4 });
    return {
      kind: 'choice', ear: 1, auto: 1, item: 'dg:' + d, miss: d + ' (' + SOLF[d - 1] + ')', sig: ton + ':' + d,
      prompt: 'Hear the key, then name the scale degree of the last note',
      audio: audio,
      choices: o.degs.map(function (x) { return { id: String(x), label: x + ' · ' + SOLF[x - 1] }; }), correct: String(d),
      explain: 'Degree ' + d + ' (' + SOLF[d - 1] + ').'
    };
  };

  function keyChoices(key, minor, withRel) {
    var lab = function (k) { return minor ? k.min + ' minor' : k.maj + ' major'; };
    var seen = {}, list = [];
    function add(l) { if (!seen[l] && list.length < 6) { seen[l] = 1; list.push(l); } }
    add(lab(key));
    if (withRel) add(minor ? key.maj + ' major' : key.min + ' minor');
    KEYS.slice().sort(function (a, b) { return Math.abs(a.n - key.n) - Math.abs(b.n - key.n); })
      .forEach(function (k) { add(lab(k)); });
    return shuffle(list).map(function (l) { return { id: l, label: l }; });
  }

  GEN.keySig = function (o) {
    var pool = KEYS.filter(function (k) {
      if (o.kind === 's' && k.n < 0) return false;
      if (o.kind === 'f' && k.n > 0) return false;
      return Math.abs(k.n) <= o.max;
    });
    var key = keyByName(pickW(pool.map(function (k) { return k.maj; }), 'ks:'));
    var minor = !!o.minor || (!!o.mix && Math.random() < 0.5);
    var clef = o.clef || 'treble';
    var n = Math.abs(key.n), type = key.n > 0 ? 'sharp' : 'flat';
    var accs = (key.n > 0 ? SHARP_ORDER : FLAT_ORDER).slice(0, n).map(function (l) { return l + (key.n > 0 ? '♯' : '♭'); }).join(' ');
    var kname = minor ? key.min + ' minor' : key.maj + ' major';
    var desc = n === 0 ? 'no sharps or flats' : n + ' ' + type + (n > 1 ? 's' : '') + ' (' + accs + ')';
    var q = {
      kind: 'choice', item: 'ks:' + key.maj + (minor ? 'm' : ''), miss: kname, sig: kname + clef + (o.task || ''),
      explain: kname + ' has ' + desc + '. Its relative ' + (minor ? 'major is ' + key.maj + ' major.' : 'minor is ' + key.min + ' minor.')
    };
    if (o.task === 'count') {
      var t2 = o.kind === 'f' ? 'flat' : 'sharp';
      q.prompt = 'How many ' + t2 + 's are in ' + key.maj + ' major?';
      q.choices = [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return { id: String(i), label: String(i) }; });
      q.correct = String(n);
      return q;
    }
    if (o.task === 'which') {
      q.prompt = n === 0 ? 'Which major key has no sharps or flats?' : 'Which major key has ' + n + ' ' + type + (n > 1 ? 's' : '') + '?';
      q.choices = keyChoices(key, false, false); q.correct = key.maj + ' major';
      return q;
    }
    q.prompt = 'Which ' + (minor ? 'minor' : 'major') + ' key is this?';
    q.show = { type: 'staff', clef: clef, ks: key.n, cols: [], minW: 13 };
    q.choices = keyChoices(key, minor, true); q.correct = kname;
    return q;
  };

  GEN.circle = function (o) {
    var mid = KEYS.filter(function (k) { return Math.abs(k.n) <= 5; });
    var k = keyByName(pickW(mid.map(function (x) { return x.maj; }), 'cf' + o.task + ':'));
    var labels, correct, prompt, expl;
    function uniq6(arr) {
      var seen = {}, out = [];
      arr.forEach(function (l) { if (l && !seen[l] && out.length < 6) { seen[l] = 1; out.push(l); } });
      return shuffle(out).map(function (l) { return { id: l, label: l }; });
    }
    if (o.task === 'fifth') {
      var up = Math.random() < 0.5, tgt = keyByN(k.n + (up ? 1 : -1));
      correct = tgt.maj + ' major';
      prompt = 'Which major key is a perfect 5th ' + (up ? 'above' : 'below') + ' ' + k.maj + '?';
      labels = [correct, keyByN(k.n + (up ? -1 : 1)).maj + ' major', keyByN(k.n + (up ? 2 : -2)).maj + ' major',
        k.maj + ' major', keyByN(k.n + (up ? -2 : 2)).maj + ' major'];
      mid.forEach(function (x) { labels.push(x.maj + ' major'); });
      expl = tgt.maj + ' major is one step ' + (up ? 'clockwise' : 'counterclockwise') + ' from ' + k.maj + ' on the circle of fifths.';
    } else if (o.task === 'rel') {
      var toMin = Math.random() < 0.5;
      correct = toMin ? k.min + ' minor' : k.maj + ' major';
      prompt = toMin ? 'What is the relative minor of ' + k.maj + ' major?' : 'What is the relative major of ' + k.min + ' minor?';
      labels = [correct];
      [1, -1, 2, -2, 3].forEach(function (d) { var kk = keyByN(k.n + d); if (kk) labels.push(toMin ? kk.min + ' minor' : kk.maj + ' major'); });
      expl = k.maj + ' major and ' + k.min + ' minor share a key signature; the minor is a minor 3rd lower.';
    } else {
      var a = keyByN(k.n - 1), b = keyByN(k.n + 1), a2 = keyByN(k.n - 2), b2 = keyByN(k.n + 2);
      correct = a.maj + ' and ' + b.maj;
      prompt = 'Which two keys sit next to ' + k.maj + ' major on the circle of fifths?';
      var L0 = parseName(k.maj).L;
      labels = [correct, a2.maj + ' and ' + b2.maj, a.maj + ' and ' + b2.maj, a2.maj + ' and ' + b.maj,
        LET[mod(L0 - 1, 7)] + ' and ' + LET[mod(L0 + 1, 7)]];
      expl = a.maj + ' → ' + k.maj + ' → ' + b.maj + ': each step is a perfect 5th.';
    }
    return { kind: 'choice', item: 'cf' + o.task + ':' + k.maj, miss: prompt.replace(/\?$/, ''), sig: prompt, prompt: prompt,
      choices: uniq6(labels), correct: correct, explain: expl };
  };

  // ================= notation (SMuFL / Bravura subset) =================

  var SP = 12; // staff space in SVG units; SMuFL glyphs are 4 spaces per em
  var GL = { g: '\uE050', f: '\uE062', w: '\uE0A2', fl: '\uE260', sh: '\uE262' };
  var KS = { treble: { s: [38, 35, 39, 36, 33, 37, 34], f: [34, 37, 33, 36, 32, 35, 31] } };
  KS.bass = {
    s: KS.treble.s.map(function (x) { return x - 14; }),
    f: KS.treble.f.map(function (x) { return x - 14; })
  };
  function gt(x, y, g, cls) { return '<text class="qz-mu' + (cls || '') + '" x="' + x.toFixed(1) + '" y="' + y + '">' + g + '</text>'; }
  function gl(x1, y1, x2, y2, cls) { return '<line class="' + cls + '" x1="' + x1.toFixed(1) + '" y1="' + y1 + '" x2="' + x2.toFixed(1) + '" y2="' + y2 + '"/>'; }

  function staffSVG(o) {
    var clef = o.clef || 'treble', top = TOPL[clef], y0 = SP * 3.6;
    var y = function (st) { return (y0 + (top - st) * SP / 2).toFixed(1); };
    var parts = [], x = SP * 0.7;
    parts.push(gt(x, y(clef === 'treble' ? 32 : 24), clef === 'treble' ? GL.g : GL.f));
    x += SP * 3.4;
    var ks = o.ks || 0;
    if (ks) {
      var pos = ks > 0 ? KS[clef].s : KS[clef].f;
      for (var i = 0; i < Math.abs(ks); i++) {
        parts.push(gt(x, y(pos[i]), ks > 0 ? GL.sh : GL.fl));
        x += SP * (ks > 0 ? 1.1 : 1.0);
      }
      x += SP * 0.5;
    }
    x += SP;
    var gap = o.tight ? 1.15 : 2.4;
    (o.cols || []).forEach(function (col, ci) {
      var ns = col.slice().sort(function (a, b) { return stepOf(a) - stepOf(b); });
      var shift = [], i2;
      for (i2 = 0; i2 < ns.length; i2++) shift[i2] = i2 > 0 && !shift[i2 - 1] && stepOf(ns[i2]) - stepOf(ns[i2 - 1]) === 1;
      var aCol = [], placed = [];
      for (i2 = ns.length - 1; i2 >= 0; i2--) {
        if (!ns[i2].acc) continue;
        var c = 0, st = stepOf(ns[i2]);
        while (placed.some(function (p) { return p.c === c && Math.abs(p.st - st) < 6; })) c++;
        placed.push({ c: c, st: st });
        aCol[i2] = c;
      }
      var nCols = placed.length ? Math.max.apply(null, placed.map(function (p) { return p.c; })) + 1 : 0;
      var nx = x + nCols * SP * 1.2;
      var any = shift.some(Boolean), wN = SP * 1.69, wAll = wN * (any ? 2 : 1);
      var lo = stepOf(ns[0]), hi = stepOf(ns[ns.length - 1]), ls;
      for (ls = top + 2; ls <= hi; ls += 2) parts.push(gl(nx - SP * 0.5, y(ls), nx + wAll + SP * 0.5, y(ls), 'qz-ledger'));
      for (ls = top - 10; ls >= lo; ls -= 2) parts.push(gl(nx - SP * 0.5, y(ls), nx + wAll + SP * 0.5, y(ls), 'qz-ledger'));
      var cls = o.okCol === ci || o.okAll ? ' qz-okn' : '';
      ns.forEach(function (n, k) {
        parts.push(gt(nx + (shift[k] ? wN : 0), y(stepOf(n)), GL.w, cls));
        if (n.acc) {
          var aw = (n.acc > 0 ? 1.0 : 0.9) * SP;
          parts.push(gt(nx - SP * 0.22 - aw - aCol[k] * SP * 1.2, y(stepOf(n)), n.acc > 0 ? GL.sh : GL.fl, cls));
        }
      });
      x = nx + wAll + SP * gap;
    });
    var W = Math.max(x + SP * 0.6, SP * (o.minW || 12));
    var lines = '';
    for (var k2 = 0; k2 < 5; k2++) lines += gl(0, y(top - 2 * k2), W, y(top - 2 * k2), 'qz-sl');
    var H = y0 * 2 + SP * 4;
    return '<svg class="qz-staff" viewBox="0 0 ' + W.toFixed(1) + ' ' + H.toFixed(1) + '" width="' + Math.round(W * 1.25) +
      '" aria-hidden="true">' + lines + parts.join('') + '</svg>';
  }

  function keysSVG(marks) {
    var lo = 60, hi = 83, WW = 26, WH = 104, BW = 16, BH = 64;
    var whites = [], s = [], b = [], idx = {}, m;
    for (m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
    whites.forEach(function (w, i) {
      idx[w] = i;
      s.push('<rect class="qz-key qz-kw' + (marks[w] ? ' mk-' + marks[w] : '') + '" data-m="' + w + '" x="' + (i * WW + 0.5) +
        '" y="0.5" width="' + (WW - 1) + '" height="' + WH + '" rx="3"/>');
      if (mod(w, 12) === 0) s.push('<text class="qz-kl" x="' + (i * WW + WW / 2) + '" y="' + (WH - 7) + '">C' + (w / 12 - 1) + '</text>');
    });
    for (m = lo; m <= hi; m++) {
      if (!isBlack(m)) continue;
      b.push('<rect class="qz-key qz-kb' + (marks[m] ? ' mk-' + marks[m] : '') + '" data-m="' + m + '" x="' + (idx[m - 1] * WW + WW - BW / 2) +
        '" y="0.5" width="' + BW + '" height="' + BH + '" rx="2"/>');
    }
    var W = whites.length * WW;
    return '<svg class="qz-keys" viewBox="0 0 ' + W + ' ' + (WH + 1) + '" width="' + W + '" role="group" aria-label="Piano keys, C4 to B5">' +
      s.join('') + b.join('') + '</svg>';
  }

  function neckSVG(o) {
    var F = o.frets || 12, FW = 36, X0 = 36, SG = 22, T = 14, LX = 14;
    var W = X0 + F * FW + 8, H = T + 5 * SG + 30, s = [], f, st;
    ['E', 'A', 'D', 'G', 'B', 'E'].forEach(function (n, i) {
      s.push('<text class="qz-sname' + (o.hi === i ? ' hi' : '') + '" x="' + (-LX / 2) + '" y="' + (T + (5 - i) * SG + 3.5) + '">' + n + '</text>');
    });
    [3, 5, 7, 9].forEach(function (ff) { if (ff <= F) s.push('<circle class="qz-inlay" cx="' + (X0 + (ff - 0.5) * FW) + '" cy="' + (T + 2.5 * SG) + '" r="4"/>'); });
    if (F >= 12) {
      s.push('<circle class="qz-inlay" cx="' + (X0 + 11.5 * FW) + '" cy="' + (T + 1.5 * SG) + '" r="4"/>');
      s.push('<circle class="qz-inlay" cx="' + (X0 + 11.5 * FW) + '" cy="' + (T + 3.5 * SG) + '" r="4"/>');
    }
    for (f = 0; f <= F; f++) s.push('<line class="' + (f ? 'qz-fret' : 'qz-nut') + '" x1="' + (X0 + f * FW) + '" y1="' + T + '" x2="' + (X0 + f * FW) + '" y2="' + (T + 5 * SG) + '"/>');
    for (st = 0; st < 6; st++) {
      var yy = T + (5 - st) * SG;
      s.push('<line class="qz-str' + (o.hi === st ? ' hi' : '') + '" stroke-width="' + (o.hi === st ? 2.6 : 0.9 + (5 - st) * 0.28).toFixed(2) +
        '" x1="4" y1="' + yy + '" x2="' + (X0 + F * FW) + '" y2="' + yy + '"/>');
    }
    [3, 5, 7, 9, 12].forEach(function (ff) { if (ff <= F) s.push('<text class="qz-fnum" x="' + (X0 + (ff - 0.5) * FW) + '" y="' + (H - 6) + '">' + ff + '</text>'); });
    (o.marks || []).forEach(function (mk) {
      var cx = mk.f === 0 ? X0 / 2 : X0 + (mk.f - 0.5) * FW;
      s.push('<circle class="qz-nm mk-' + (mk.c || 'a') + '" cx="' + cx + '" cy="' + (T + (5 - mk.s) * SG) + '" r="7.5"/>');
    });
    if (o.input) {
      for (st = 0; st < 6; st++) {
        for (f = 0; f <= F; f++) {
          s.push('<rect class="qz-fz" data-s="' + st + '" data-f="' + f + '" x="' + (f ? X0 + (f - 1) * FW : 0) + '" y="' + (T + (5 - st) * SG - SG / 2) +
            '" width="' + (f ? FW : X0) + '" height="' + SG + '"/>');
        }
      }
    }
    return '<svg class="qz-neck" viewBox="' + (-LX) + ' 0 ' + (W + LX) + ' ' + H + '" width="' + (W + LX) + '" role="group" aria-label="Guitar neck">' + s.join('') + '</svg>';
  }

  // ================= course =================

  var LEARN = {
    nat: '<p>Music uses seven letters, <b>A to G</b>, then starts again. Treble staff lines from the bottom: <b>E G B D F</b> (Every Good Boy Does Fine); spaces: <b>F A C E</b>. Bass staff lines: <b>G B D F A</b> (Good Boys Do Fine Always); spaces: <b>A C E G</b> (All Cows Eat Grass).</p><p>Middle C sits on one ledger line between the two staves. On the keys, C is the white key just left of each pair of black keys.</p>',
    acc: '<p>A <b>sharp ♯</b> raises a note a half step and a <b>flat ♭</b> lowers it. Every black key has two names: C♯ is D♭. E–F and B–C are half steps with no black key between them.</p><p>On the guitar each fret is a half step; fret 12 is the open string an octave up.</p>',
    pitch: '<p>Pitch is how high or low a note sounds. Listen to the second note: does it climb or fall? Singing both notes back helps.</p>',
    i23: '<p>An interval is the distance between two notes. Count letter names for the number (C to E is a 3rd), then half steps for the quality: <b>minor 2nd</b> 1 · <b>major 2nd</b> 2 · <b>minor 3rd</b> 3 · <b>major 3rd</b> 4.</p><p>Ear hooks, going up: minor 2nd “Jaws”, major 2nd “Happy Birthday”, minor 3rd “Greensleeves”, major 3rd “When the Saints Go Marching In”.</p>',
    i45: '<p><b>Perfect 4th</b>: 5 half steps (“Here Comes the Bride”). <b>Perfect 5th</b>: 7 (“Star Wars”). Six half steps is the <b>tritone</b> (“The Simpsons”), written as an <b>augmented 4th</b> (F to B) or a <b>diminished 5th</b> (B to F).</p>',
    i68: '<p><b>Minor 6th</b> 8 · <b>major 6th</b> 9 (“My Bonnie”) · <b>minor 7th</b> 10 (“Star Trek”) · <b>major 7th</b> 11 (“Take On Me”) · <b>octave</b> 12 (“Somewhere Over the Rainbow”). A 7th is an octave minus a 2nd.</p>',
    iall: '<p>Every interval up to the octave, mixed. Count letter names for the number and half steps for the quality.</p>',
    cmm: '<p>A triad stacks two thirds. <b>Major</b> = root, major 3rd, perfect 5th (C E G) and sounds bright. <b>Minor</b> lowers the 3rd (C E♭ G) and sounds darker.</p>',
    cdas: '<p><b>Diminished</b> = minor 3rd + diminished 5th (B D F), tense. <b>Augmented</b> = major 3rd + augmented 5th (C E G♯), unresolved. <b>sus2</b> and <b>sus4</b> replace the 3rd with a 2nd or a 4th (C D G, C F G), open and hanging.</p>',
    ctri: '<p>All five triads together. Listen for the 3rd first (major or minor), then the 5th (perfect, diminished or augmented).</p>',
    c7: '<p>Add a 7th to a triad. <b>maj7</b> = major triad + major 7th (C E G B). <b>7</b> (dominant) = major triad + minor 7th (C E G B♭). <b>m7</b> = minor triad + minor 7th (C E♭ G B♭). <b>m7♭5</b> = diminished triad + minor 7th (C E♭ G♭ B♭).</p>',
    c4x: '<p><b>°7</b> stacks three minor 3rds (B D F A♭). <b>6</b> adds a major 6th to a major triad (C E G A). <b>m6</b> adds a major 6th to a minor triad (C E♭ G A). <b>7sus4</b> = sus4 + minor 7th (C F G B♭).</p>',
    cdia: '<p>Every degree of a scale has its own chord. Major keys: <b>I ii iii IV V vi vii°</b>: capitals are major, lower case minor, ° diminished. In C that is C Dm Em F G Am B°. Minor keys, with the raised 7th: <b>i ii° III iv V VI vii°</b>.</p>',
    smm: '<p><b>Major</b>: W W H W W W H (whole and half steps). <b>Natural minor</b>: W H W W H W W. Same notes, different home: A minor uses C major’s notes.</p>',
    smin: '<p><b>Natural minor</b> has ♭3, ♭6 and ♭7. <b>Harmonic minor</b> raises the 7th, leaving a wide gap between 6 and 7. <b>Melodic minor</b> raises the 6th and the 7th.</p>',
    spent: '<p>Pentatonic scales skip the half steps. <b>Major pentatonic</b> = 1 2 3 5 6. <b>Minor pentatonic</b> = 1 ♭3 4 5 ♭7. The <b>blues</b> scale adds the ♭5 “blue note” to minor pentatonic.</p>',
    smod: '<p>A mode is a major scale started on another degree. <b>Dorian</b> is minor with a natural 6th, <b>Phrygian</b> minor with a ♭2, <b>Lydian</b> major with a ♯4, <b>Mixolydian</b> major with a ♭7.</p>',
    sdeg: '<p>First hear the key (a I–IV–V–I cadence), then name the scale degree of the note that follows: 1 do · 2 re · 3 mi · 4 fa · 5 sol · 6 la · 7 ti.</p>',
    ksh: '<p>Sharps always come in the same order: <b>F C G D A E B</b> (Father Charles Goes Down And Ends Battle). The major key is a half step above the last sharp: F♯ C♯ means D major.</p>',
    kfl: '<p>Flats come in the reverse order: <b>B E A D G C F</b>. The major key is the second-to-last flat: B♭ E♭ means B♭ major. One flat is F major.</p>',
    kall: '<p>Each key signature names a major key and its <b>relative minor</b>, a minor 3rd lower (G major and E minor). On the bass staff the same signature sits one line lower.</p>',
    kcirc: '<p>Clockwise round the circle of fifths adds a sharp: C G D A E B F♯ C♯. Counterclockwise adds a flat: C F B♭ E♭ A♭ D♭ G♭ C♭. Neighbors are a 5th apart; relative minors sit a minor 3rd below.</p>'
  };

  function ivUnit(id, name, staffSet, earSet) {
    return { id: id, name: name, learn: LEARN[id], modes: [
      ['staff', [
        ['Name the interval: natural notes', 'interval', { show: 'staff', set: staffSet }],
        ['Name the interval: with sharps and flats', 'interval', { show: 'staff', set: staffSet, acc: 1 }],
        ['Play the interval above the written note', 'interval', { show: 'staff', set: staffSet, acc: 1, play: 1 }]]],
      ['piano', [
        ['Name the interval on the keys', 'interval', { show: 'keys', set: earSet }],
        ['Play the interval above the marked key', 'interval', { show: 'keys', set: earSet, play: 1 }]]],
      ['ear', [
        ['Ascending: one note, then the next', 'interval', { show: 'ear', set: earSet, dir: 'up' }],
        ['Descending', 'interval', { show: 'ear', set: earSet, dir: 'down' }],
        ['Harmonic: both together', 'interval', { show: 'ear', set: earSet, dir: 'harm' }]]]
    ] };
  }

  function chUnit(id, name, set) {
    return { id: id, name: name, learn: LEARN[id], modes: [
      ['staff', [
        ['Name the chord: up to 1 accidental', 'chord', { show: 'staff', set: set, maxAcc: 1 }],
        ['Name the chord: up to 2 accidentals', 'chord', { show: 'staff', set: set, maxAcc: 2 }],
        ['Name the chord in inversion', 'chord', { show: 'staff', set: set, maxAcc: 2, inv: 1 }],
        ['Spell it: pick the right notes', 'chord', { task: 'spell', set: set, maxAcc: 3 }]]],
      ['piano', [
        ['Name the chord on the keys', 'chord', { show: 'keys', set: set }],
        ['Play the chord, any inversion', 'chord', { task: 'play', set: set, maxAcc: 2 }]]],
      ['ear', [
        ['Block chords', 'chord', { show: 'ear', set: set }],
        ['Broken chords (arpeggio)', 'chord', { show: 'ear', set: set, arp: 1 }],
        ['Block chords in inversion', 'chord', { show: 'ear', set: set, inv: 1 }]]]
    ] };
  }

  function scUnit(id, name, set, theory) {
    var modes = [
      ['staff', [
        ['Name the scale: white-key starting notes', 'scale', { show: 'staff', set: set, white: 1 }],
        ['Name the scale: any starting note', 'scale', { show: 'staff', set: set }]]],
      ['piano', [
        ['Name the scale on the keys', 'scale', { show: 'keys', set: set }],
        ['Play the scale: any order, any octave', 'scale', { task: 'play', set: set }]]],
      ['ear', [
        ['Ascending', 'scale', { show: 'ear', set: set }],
        ['Descending', 'scale', { show: 'ear', set: set, down: 1 }]]]
    ];
    if (theory) modes.push(['theory', theory]);
    return { id: id, name: name, learn: LEARN[id], modes: modes };
  }

  var COURSE = [
    { id: 'notes', name: 'Notes', blurb: 'Read notes on the treble and bass staff, then find them on the keys and the neck.', units: [
      { id: 'nat', name: 'Natural notes', learn: LEARN.nat, modes: [
        ['treble', [
          ['Name notes on the treble staff', 'noteRead', { clef: 'treble', lo: 29, hi: 39 }],
          ['Treble staff with ledger lines', 'noteRead', { clef: 'treble', lo: 26, hi: 42 }],
          ['Play the note you see, any octave', 'noteRead', { clef: 'treble', lo: 28, hi: 40, play: 1 }]]],
        ['bass', [
          ['Name notes on the bass staff', 'noteRead', { clef: 'bass', lo: 17, hi: 27 }],
          ['Bass staff with ledger lines', 'noteRead', { clef: 'bass', lo: 14, hi: 30 }],
          ['Play the note you see, any octave', 'noteRead', { clef: 'bass', lo: 16, hi: 28, play: 1 }]]],
        ['piano', [
          ['Name the white key', 'keyName', {}],
          ['Find the note on the keys', 'keyFind', {}]]],
        ['neck', [
          ['Name notes in open position (frets 0–3)', 'neckName', { max: 3, nat: 1 }],
          ['Name natural notes up to fret 12', 'neckName', { max: 12, nat: 1 }]]]
      ] },
      { id: 'acc', name: 'Sharps & flats', learn: LEARN.acc, modes: [
        ['treble', [['Name notes with sharps and flats', 'noteRead', { clef: 'treble', lo: 28, hi: 40, acc: 1 }]]],
        ['bass', [['Name notes with sharps and flats', 'noteRead', { clef: 'bass', lo: 16, hi: 28, acc: 1 }]]],
        ['piano', [
          ['Name any key, black keys too', 'keyName', { black: 1 }],
          ['Find sharps and flats on the keys', 'keyFind', { black: 1 }]]],
        ['neck', [
          ['Name any note up to fret 12', 'neckName', { max: 12 }],
          ['Find the note on the named string', 'neckFind', { max: 12 }]]]
      ] },
      { id: 'pitch', name: 'Pitch', learn: LEARN.pitch, modes: [
        ['ear', [
          ['Higher or lower: big steps', 'pitch', { min: 3, max: 12 }],
          ['Higher or lower: small steps', 'pitch', { min: 1, max: 2 }]]]
      ] }
    ] },
    { id: 'intervals', name: 'Intervals', blurb: 'Name, play and hear the distance between two notes.', units: [
      ivUnit('i23', 'Seconds & thirds', ['m2', 'M2', 'm3', 'M3'], ['m2', 'M2', 'm3', 'M3']),
      ivUnit('i45', 'Fourths & fifths', ['P4', 'A4', 'd5', 'P5'], ['P4', 'TT', 'P5']),
      ivUnit('i68', 'Sixths, sevenths & octave', ['m6', 'M6', 'm7', 'M7', 'P8'], ['m6', 'M6', 'm7', 'M7', 'P8']),
      ivUnit('iall', 'All intervals', ['m2', 'M2', 'm3', 'M3', 'P4', 'A4', 'd5', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'],
        ['m2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'])
    ] },
    { id: 'chords', name: 'Chords', blurb: 'Read, spell, play and hear triads and seventh chords, and the chords of a key.', units: [
      chUnit('cmm', 'Major & minor', ['maj', 'min']),
      chUnit('cdas', 'Diminished, augmented & sus', ['dim', 'aug', 'sus2', 'sus4']),
      chUnit('ctri', 'Triads recap', ['maj', 'min', 'dim', 'aug', 'sus4']),
      chUnit('c7', 'Seventh chords', ['maj7', 'dom7', 'm7', 'm7b5']),
      chUnit('c4x', 'More four-note chords', ['dim7', 'six', 'm6', 'sus47']),
      { id: 'cdia', name: 'Chords in a key', learn: LEARN.cdia, modes: [
        ['theory', [
          ['Numeral to chord: major keys', 'diatonic', { task: 'n2c', max: 3 }],
          ['Chord to numeral: major keys', 'diatonic', { task: 'c2n', max: 4 }],
          ['Numeral to chord: minor keys', 'diatonic', { task: 'n2c', minor: 1, max: 3 }]]],
        ['ear', [
          ['I, IV or V?', 'diatonic', { task: 'ear', nums: [0, 3, 4] }],
          ['I, ii, IV, V or vi?', 'diatonic', { task: 'ear', nums: [0, 1, 3, 4, 5] }]]]
      ] }
    ] },
    { id: 'scales', name: 'Scales', blurb: 'Recognize, play and hear major, minor, pentatonic and modal scales.', units: [
      scUnit('smm', 'Major & minor', ['major', 'minor']),
      scUnit('smin', 'Minor scales', ['minor', 'harm', 'mel']),
      scUnit('spent', 'Pentatonic & blues', ['majp', 'minp', 'blues']),
      scUnit('smod', 'Modes', ['dorian', 'phryg', 'lyd', 'mixo'],
        [['Which major scale does this mode come from?', 'modeParent', {}]]),
      { id: 'sdeg', name: 'Scale degrees', learn: LEARN.sdeg, modes: [
        ['ear', [
          ['Degrees 1, 3 and 5', 'degree', { degs: [1, 3, 5] }],
          ['All seven degrees', 'degree', { degs: [1, 2, 3, 4, 5, 6, 7] }]]]
      ] }
    ] },
    { id: 'keys', name: 'Key signatures', blurb: 'Read key signatures and find your way around the circle of fifths.', units: [
      { id: 'ksh', name: 'Sharp keys', learn: LEARN.ksh, modes: [
        ['staff', [
          ['Name the major key: up to 3 sharps', 'keySig', { kind: 's', max: 3 }],
          ['Name the major key: up to 7 sharps', 'keySig', { kind: 's', max: 7 }],
          ['Name the minor key', 'keySig', { kind: 's', max: 7, minor: 1 }]]],
        ['theory', [['How many sharps?', 'keySig', { kind: 's', max: 7, task: 'count' }]]]
      ] },
      { id: 'kfl', name: 'Flat keys', learn: LEARN.kfl, modes: [
        ['staff', [
          ['Name the major key: up to 3 flats', 'keySig', { kind: 'f', max: 3 }],
          ['Name the major key: up to 7 flats', 'keySig', { kind: 'f', max: 7 }],
          ['Name the minor key', 'keySig', { kind: 'f', max: 7, minor: 1 }]]],
        ['theory', [['How many flats?', 'keySig', { kind: 'f', max: 7, task: 'count' }]]]
      ] },
      { id: 'kall', name: 'All keys', learn: LEARN.kall, modes: [
        ['staff', [
          ['Treble staff: major keys', 'keySig', { kind: 'b', max: 7 }],
          ['Bass staff: major and minor keys', 'keySig', { kind: 'b', max: 7, clef: 'bass', mix: 1 }]]],
        ['theory', [['Which key has this many sharps or flats?', 'keySig', { kind: 'b', max: 7, task: 'which' }]]]
      ] },
      { id: 'kcirc', name: 'Circle of fifths', learn: LEARN.kcirc, modes: [
        ['theory', [
          ['A 5th up or down', 'circle', { task: 'fifth' }],
          ['Relative major and minor', 'circle', { task: 'rel' }],
          ['Neighbors on the circle', 'circle', { task: 'nbr' }]]]
      ] }
    ] }
  ];

  var MODE_NAME = { treble: 'Treble clef', bass: 'Bass clef', staff: 'Notation', piano: 'Piano', neck: 'Fretboard', ear: 'Ear training', theory: 'Theory' };

  var LEVELS = [], BY_ID = {}, TOPIC = {};
  COURSE.forEach(function (t) {
    TOPIC[t.id] = t;
    t.units.forEach(function (u) {
      u.modes = u.modes.map(function (m) {
        var md = { key: m[0], levels: [] };
        m[1].forEach(function (lv, i) {
          var L = { id: t.id + '/' + u.id + '/' + m[0] + '/' + (i + 1), text: lv[0], gen: lv[1], o: lv[2] || {},
            n: i + 1, topic: t, unit: u, mode: m[0] };
          md.levels.push(L);
          LEVELS.push(L);
          BY_ID[L.id] = L;
        });
        return md;
      });
    });
  });


  // ================= the path =================
  // One node per unit × practice mode, in course order. A node opens when the
  // node before it has a passed level (or a jump test reached it); its ring
  // fills as its levels are passed.
  var NODES = [], NODE_BY_ID = {}, UNIT_TOPIC = {};
  COURSE.forEach(function (t) {
    t.units.forEach(function (u) {
      UNIT_TOPIC[u.id] = t;
      u.modes.forEach(function (m) {
        var nd = { i: NODES.length, id: u.id + '|' + m.key, topic: t, unit: u, mode: m.key, levels: m.levels };
        m.levels.forEach(function (l) { l.node = nd; });
        NODES.push(nd);
        NODE_BY_ID[nd.id] = nd;
      });
    });
  });

  // ================= state + persistence =================

  var root = null, view = 'home', topicId = null, openMode = {}, cur = null, advT = 0;
  // Keep physical presses across questions: a held key (including layered MIDI
  // channels) must be released before it can answer the following question.
  var inputHeld = {}, inputRoute = null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function prog() { var p = App.store.get('qz.prog', {}); return (p && typeof p === 'object') ? p : {}; }
  function starsFor(n) { return n >= 10 ? 3 : n >= 9 ? 2 : n >= 8 ? 1 : 0; }
  function starStr(s) { return '★★★'.slice(0, s) + '☆☆☆'.slice(0, 3 - s); }
  function lvlTitle(l) { return l.topic.name + ' · ' + l.unit.name + ' · ' + MODE_NAME[l.mode] + ' ' + l.n; }
  function passed(p, l) { return !!(p[l.id] && p[l.id].s); }

  function nextLevel() {
    var p = prog();
    for (var i = 0; i < LEVELS.length; i++) if (!passed(p, LEVELS[i])) return LEVELS[i];
    return null;
  }
  function nextInCourse(l) {
    var i = LEVELS.indexOf(l);
    return i >= 0 && i + 1 < LEVELS.length ? LEVELS[i + 1] : null;
  }

  // ================= sound =================

  function sound(m, at, d, gain, gtr) {
    var inst = gtr ? 'guitar' : App.store.get('qz.sound', 'piano');
    try {
      if (inst === 'guitar' || !App.keys) App.pluck(m, at || 0, d || 1.1, gain || 0.5);
      else App.keys.play(m, at || 0, d || 1.1, gain || 0.5);
    } catch (e) { /* audio unavailable */ }
  }
  // the first ear question of a session can land before the piano samples
  // finish decoding — wait a moment (max ~1.2s) rather than play a stand-in
  function whenVoiceReady(fn) {
    var k = App.keys, waited = 0;
    if (!k || !k.ready || App.store.get('qz.sound', 'piano') !== 'piano') { fn(); return; }
    if (k.warm) k.warm();
    (function poll() {
      if (k.ready() || waited >= 1200) { fn(); return; }
      waited += 60;
      setTimeout(poll, 60);
    })();
  }
  function playQ(q) {
    if (!q || !q.audio) return;
    q.audio.forEach(function (ev) {
      var g = 0.62 / Math.sqrt(ev.m.length);
      ev.m.forEach(function (m, i) { sound(m, ev.at + (ev.strum ? i * ev.strum : 0), ev.d, g, ev.gtr); });
    });
  }

  // ================= views =================

  var CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="6 9 12 15 18 9"/></svg>';
  var openUnits = {}; // topicId -> { unitId: true } — expanded unit cards

  function render() {
    if (!root) return;
    clearTimeout(advT);
    // the keyboard's lights must not give answers away mid-question
    if (App.midi && App.midi.hideLayout) App.midi.hideLayout('quiz', view === 'run' && App.active === 'quiz');
    if (view === 'home') renderHome();
    else if (view === 'topic') renderTopic();
    else if (view === 'run') renderRun();
    else renderDone();
  }

  // keep the start of a view (or a unit) in sight, just below the top bar
  function reveal(elm) {
    if (!elm || !elm.getBoundingClientRect) return;
    var bar = document.querySelector('.topbar');
    var hb = bar ? bar.offsetHeight : 0;
    var r = elm.getBoundingClientRect();
    if (r.top >= hb && r.top < window.innerHeight * 0.45) return; // already in view
    window.scrollTo(0, Math.max(0, window.pageYOffset + r.top - hb - 10));
  }

  // keep a control clear of the fixed bottom tab bar on phones (and of the
  // bottom edge everywhere), scrolling only as far as needed
  function keepVisible(elm) {
    if (!elm || !elm.getBoundingClientRect) return;
    var tb = document.getElementById('tabbar-m');
    var bar = tb && getComputedStyle(tb).display !== 'none' ? tb.getBoundingClientRect().height : 0;
    var r = elm.getBoundingClientRect(), limit = window.innerHeight - bar - 12;
    if (r.bottom > limit) {
      try { window.scrollBy({ top: r.bottom - limit, behavior: 'smooth' }); } catch (e) { window.scrollBy(0, r.bottom - limit); }
    }
  }

  function renderHome() {
    var tabs = [['path', 'Path'], ['topics', 'Topics'], ['progress', 'Progress']];
    root.innerHTML = '<div class="qz-view">' + statsStrip() +
      '<div class="seg qz-hometabs" role="tablist" aria-label="Exercises">' + tabs.map(function (t) {
        return '<button type="button" role="tab" data-qzh="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</div><div id="qz-homebody"></div></div>';
    paintHomeBody();
  }

  function paintSound() {
    var s = App.store.get('qz.sound', 'piano');
    if (!root) return;
    root.querySelectorAll('[data-qzs]').forEach(function (b) {
      var on = b.getAttribute('data-qzs') === s;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function firstOpenMode(u, p) {
    for (var i = 0; i < u.modes.length; i++) {
      if (u.modes[i].levels.some(function (l) { return !passed(p, l); })) return u.modes[i].key;
    }
    return u.modes[0].key;
  }

  function firstOpenUnit(t, p) {
    for (var i = 0; i < t.units.length; i++) {
      var u = t.units[i];
      for (var j = 0; j < u.modes.length; j++) {
        if (u.modes[j].levels.some(function (l) { return !passed(p, l); })) return u.id;
      }
    }
    return t.units[0].id;
  }

  function renderTopic() {
    var t = TOPIC[topicId], p = prog(), h = '';
    if (!openUnits[t.id]) { openUnits[t.id] = {}; openUnits[t.id][firstOpenUnit(t, p)] = true; }
    t.units.forEach(function (u) {
      var uPass = 0, uTot = 0, open = !!openUnits[t.id][u.id];
      u.modes.forEach(function (m) { m.levels.forEach(function (l) { uTot++; if (passed(p, l)) uPass++; }); });
      h += '<section class="card qz-unit' + (open ? ' open' : '') + '" id="qz-unit-' + u.id + '">' +
        '<button type="button" class="qz-uhead" data-qzu="' + u.id + '" aria-expanded="' + open + '">' +
          '<span class="qz-uname">' + esc(u.name) + '</span>' +
          '<span class="qz-bar qz-ubar"><i style="width:' + Math.round(100 * uPass / uTot) + '%"></i></span>' +
          '<span class="qz-ucount">' + uPass + '/' + uTot + '</span>' +
          '<span class="qz-chev">' + CHEV + '</span></button>' +
        (open ? unitBody(u, p) : '') + '</section>';
    });
    root.innerHTML = '<div class="qz-view">' +
      '<div class="qz-tophead"><button type="button" class="qz-backlink" id="qz-home">' + App.icon('left', 14) + ' Exercises</button>' +
        '<h2 class="qz-ttl">' + esc(t.name) + '</h2></div>' +
      '<div class="qz-units">' + h + '</div></div>';
  }

  function unitBody(u, p) {
    var mode = openMode[u.id] || firstOpenMode(u, p), md = null, chips = '';
    u.modes.forEach(function (m) {
      if (m.key === mode) md = m;
      var done = m.levels.every(function (l) { return passed(p, l); });
      chips += '<button type="button" class="chip qz-mchip' + (m.key === mode ? ' active' : '') + '" data-qzm="' + u.id + '|' + m.key + '"' +
        ' aria-pressed="' + (m.key === mode) + '">' + esc(MODE_NAME[m.key]) +
        (done ? '<span class="qz-tick" aria-label="all passed">✓</span>' : '') + '</button>';
    });
    md = md || u.modes[0];
    var rows = md.levels.map(function (l) {
      var s = p[l.id];
      var right = !s ? '' : s.s ? '<span class="st" aria-label="' + s.s + ' of 3 stars">' + starStr(s.s) + '</span>'
        : '<span class="sc">' + s.b + '/10</span>';
      return '<button type="button" class="qz-lvl' + (s && s.s ? ' pass' : '') + '" data-qzl="' + l.id + '">' +
        '<span class="n">' + l.n + '</span><span class="t">' + esc(l.text) + '</span>' + right +
        '<span class="go">' + App.icon('right', 14) + '</span></button>';
    }).join('');
    return '<div class="qz-ubody">' +
      '<div class="qz-urow">' + (u.modes.length > 1 ? '<div class="qz-mchips">' + chips + '</div>' : '<div class="qz-mchips"></div>') +
        '<button type="button" class="qz-learnbtn" data-qzsprint="' + NODE_BY_ID[u.id + '|' + md.key].i + '">' + ico('bolt', 14) + ' Sprint</button>' +
        (u.learn ? '<button type="button" class="qz-learnbtn" data-qzlearn="' + u.id + '" aria-expanded="false">Learn</button>' : '') + '</div>' +
      (u.learn ? '<div class="qz-learn" id="qz-learn-' + u.id + '" hidden>' + u.learn + '</div>' : '') +
      '<div class="qz-lvls">' + rows + '</div></div>';
  }

  // re-render ONE unit card in place: no page-wide redraw, no scroll jump
  function repaintUnit(uid, animate) {
    var t = TOPIC[topicId], u = null, card = el('qz-unit-' + uid);
    t.units.forEach(function (x) { if (x.id === uid) u = x; });
    if (!u || !card) { render(); return; }
    var open = !!(openUnits[topicId] || {})[uid];
    var lb = el('qz-learn-' + uid), learnOpen = !!(lb && !lb.hidden);
    card.classList.toggle('open', open);
    var head = card.querySelector('.qz-uhead');
    if (head) head.setAttribute('aria-expanded', String(open));
    var body = card.querySelector('.qz-ubody');
    if (body) body.parentNode.removeChild(body);
    if (!open) return;
    card.insertAdjacentHTML('beforeend', unitBody(u, prog()));
    if (learnOpen) {
      var nl = el('qz-learn-' + uid), nb = card.querySelector('[data-qzlearn]');
      if (nl) nl.hidden = false;
      if (nb) nb.setAttribute('aria-expanded', 'true');
    }
    if (animate) { var b2 = card.querySelector('.qz-ubody'); if (b2) b2.classList.add('qz-in'); }
  }

  // The run view is a fixed shell (header, progress, card, footer); only the
  // question inside the card is swapped, with a short fade — no full redraw.
  function renderRun() {
    var l = cur.lvl, shell = el('qz-runshell'), sid = (cur.sprint ? (cur.sprint.endless ? 'endless:' : 'sprint:') : cur.jump != null ? 'jump:' : cur.drill ? 'drill:' : '') + l.id + (cur.clock ? '@' + cur.clock.base : '');
    if (!shell || shell.getAttribute('data-lvl') !== sid) {
      var tag = (cur.sprint ? (cur.sprint.endless ? 'Endless streak · ' : '60-second sprint · ') + MODE_NAME[l.mode] : cur.jump != null ? 'Jump test · ' + MODE_NAME[l.mode] : cur.drill ? 'Drill · your misses' : MODE_NAME[l.mode] + ' · Level ' + l.n) +
        (cur.clock ? ' · ' + cur.clock.base + ' s clock' : '');
      root.innerHTML =
        '<div class="qz-view qz-run" id="qz-runshell" data-lvl="' + esc(sid) + '">' +
          '<div class="qz-runhead"><button type="button" class="qz-backlink" id="qz-back">' + App.icon('left', 14) + ' ' + esc(cur.sprint ? (cur.sprint.endless ? 'End run' : 'End sprint') : l.unit.name) + '</button>' +
            '<span class="qz-lvltag">' + esc(tag) + '</span>' +
            '<span class="qz-xpp" id="qz-xpp" aria-live="polite"></span>' +
            '<span class="qz-count" id="qz-count"></span></div>' +
          (cur.sprint ? (cur.sprint.endless ? '' : '<div class="qz-timebar" aria-hidden="true"><i id="qz-timefill"></i></div>')
            : '<div class="qz-prog" id="qz-prog" aria-hidden="true"></div>') +
          (cur.clock ? '<div class="qz-timebar qz-clock" aria-hidden="true"><i id="qz-clockfill"></i></div>' : '') +
          '<div class="card qz-stage">' +
            '<div class="qz-q" id="qz-q"></div>' +
            '<div class="qz-foot"><div class="qz-fb" id="qz-fb" role="status" aria-live="polite"></div>' +
              '<button type="button" class="btn qz-act" id="qz-act"></button></div>' +
          '</div>' +
        '</div>';
    }
    paintQ();
    paintProg();
    paintFoot();
    paintRunXP();
  }

  function paintQ() {
    var q = cur.q, box = el('qz-q');
    if (!box) return;
    var hear = q.audio && !q.ear
      ? '<button type="button" class="qz-hear" id="qz-hear" aria-label="Hear it" title="Hear it (Space)">' + App.icon('play', 13) + '</button>' : '';
    box.innerHTML = '<div class="qz-prompt"><span>' + esc(q.prompt) + '</span>' + hear + '</div>' +
      '<div class="qz-vis" id="qz-vis"></div><div class="qz-ans" id="qz-ans"></div>';
    box.classList.remove('qz-in');
    void box.offsetWidth; // restart the entrance fade
    box.classList.add('qz-in');
    paintVis();
    paintAns();
  }

  function paintProg() {
    if (cur.sprint) { tickSprint(); return; }
    var segs = '';
    for (var i = 0; i < cur.n; i++) {
      segs += '<i class="' + (i < cur.res.length ? (cur.res[i] ? 'ok' : 'bad') : (i === cur.res.length && !cur.answered ? 'cur' : '')) + '"></i>';
    }
    var pe = el('qz-prog'), ce = el('qz-count');
    if (pe) pe.innerHTML = segs;
    if (ce) ce.textContent = Math.min(cur.n, cur.res.length + (cur.answered ? 0 : 1)) + ' / ' + cur.n;
  }

  // the visual (staff / keys / neck, or the big play button for ear
  // questions), unless the answer board below already shows it
  function paintVis() {
    var q = cur.q, box = el('qz-vis');
    if (!box) return;
    var sh = q.show;
    if (cur.answered && q.reveal && q.reveal.staff) {
      var rv = q.reveal.staff;
      box.innerHTML = staffSVG({ clef: rv.clef || (sh && sh.clef) || 'treble', cols: rv.cols, okCol: rv.ok ? rv.cols.length - 1 : -1, okAll: rv.cols.length === 1 });
      return;
    }
    if (q.ear) {
      if (!box.querySelector('.qz-earbtn')) {
        box.innerHTML = '<button type="button" class="qz-earbtn" id="qz-hear" aria-label="Play the sound again" title="Play again (Space)">' + App.icon('play', 30) + '</button>';
      }
      return;
    }
    if (!sh || (q.kind !== 'choice' && sh.type === q.board)) { box.innerHTML = ''; return; }
    if (sh.type === 'staff') box.innerHTML = staffSVG(sh);
    else if (sh.type === 'keys') box.innerHTML = keysSVG(sh.marks || {});
    else if (sh.type === 'neck') box.innerHTML = '<div class="qz-neckwrap">' + neckSVG({ frets: sh.frets, marks: sh.marks }) + '</div>';
  }

  function paintAns() {
    var q = cur.q, box = el('qz-ans');
    if (!box) return;
    if (q.kind === 'choice') {
      box.innerHTML = '<div class="qz-choices' + (q.choices.length <= 2 ? ' two' : '') + '">' + q.choices.map(function (c, i) {
        return '<button type="button" class="qz-ch" data-qzc="' + esc(c.id) + '">' +
          (i < 9 ? '<span class="k" aria-hidden="true">' + (i + 1) + '</span>' : '') + esc(c.label) + '</button>';
      }).join('') + '</div>';
      return;
    }
    var hint = cur.answered ? '' : '<div class="qz-hint">' + (q.hint ? q.hint + ' ' : '') + (q.kind === 'set'
      ? 'Tap the notes and press Check, or play them.'
      : 'Tap it, or play it on your keyboard or guitar.') + '</div>';
    if (q.board === 'neck') {
      var nmk = [];
      if (cur.answered) {
        ((q.reveal && q.reveal.neck) || []).forEach(function (pt) { nmk.push({ s: pt.s, f: pt.f, c: 'ok' }); });
        if (cur.playedPos && !cur.lastOk) nmk.push({ s: cur.playedPos.s, f: cur.playedPos.f, c: 'bad' });
      }
      box.innerHTML = '<div class="qz-board"><div class="qz-neckwrap">' + neckSVG({ frets: q.frets || 12, marks: nmk, input: !cur.answered, hi: q.string }) + '</div>' + hint + '</div>';
      return;
    }
    var marks = {}, m;
    if (q.show && q.show.type === 'keys') for (m in q.show.marks) marks[m] = q.show.marks[m];
    if (cur.answered) {
      ((q.reveal && q.reveal.keys) || []).forEach(function (k) { marks[fold(k)] = 'ok'; });
      (cur.played || []).forEach(function (k) { var f = fold(k); if (marks[f] !== 'ok') marks[f] = 'bad'; });
    } else {
      Object.keys(cur.got).forEach(function (k) { marks[fold(+k)] = 'on'; });
      Object.keys(cur.tap).forEach(function (k) { marks[+k] = 'on'; });
    }
    var setBtns = q.kind === 'set' && !cur.answered
      ? '<div class="qz-acts"><button type="button" class="btn sm" id="qz-clear">Clear</button>' +
        (Object.keys(cur.tap).length ? '<button type="button" class="btn sm primary" id="qz-check">Check</button>'
          : '<button type="button" class="btn sm" id="qz-check" disabled>Check</button>') + '</div>'
      : '';
    box.innerHTML = '<div class="qz-board">' + keysSVG(marks) + hint + setBtns + '</div>';
  }

  // footer: feedback on the left, ONE action on the right that changes in
  // place (Show answer -> Next), so nothing jumps when you answer
  function paintFoot() {
    var b = el('qz-act'), fb = el('qz-fb');
    if (!b) return;
    if (cur.answered) {
      b.className = 'btn primary qz-act';
      b.innerHTML = (cur.res.length >= cur.n || (cur.sprint && cur.sprint.endless && !cur.lastOk) ? 'Finish' : 'Next') + ' ' + App.icon('right', 14);
    } else {
      b.className = 'btn qz-act qz-quiet';
      b.textContent = cur.sprint && !cur.sprint.endless ? 'Skip' : 'Show answer';
      if (fb) { fb.className = 'qz-fb'; fb.textContent = ''; }
    }
  }

  function renderDone() {
    var l = cur.lvl, nd = l.node, html;
    if (cur.sprint) {
      var rec = cur.rec || { best: cur.score, old: 0, isBest: false }, endless = cur.sprint.endless;
      var ck = endless ? cur.sprint.clock : 0;
      html = '<div class="qz-lvltag">' + esc((endless ? 'Endless streak · ' + (ck ? ck + ' s clock · ' : '') : '60-second sprint · ') + l.unit.name + ' · ' + MODE_NAME[l.mode]) + '</div>' +
        '<div class="qz-big">' + cur.score + '<span>' + (endless ? ' in a row' : ' right') + '</span></div>' +
        '<div class="qz-verdict">' + (rec.isBest && cur.score ? (rec.old ? 'New record! Your best was ' + rec.old + '.' : 'First record set.') : 'Your record' + (ck ? ' with the ' + ck + ' s clock' : '') + ': ' + rec.best + '.') + '</div>' +
        doneStats() + doneNotes() +
        (endless && cur.endQ ? '<div class="qz-miss"><span class="muted">Ended on: </span>' + esc(cur.endQ) + '</div>' : '') +
        (endless ? clockPicker() : '') +
        '<div class="qz-acts">' + (endless ? '<button type="button" class="btn primary" data-qzendless="' + nd.i + '"><span class="qz-inf" aria-hidden="true">∞</span> Go again</button>'
          : '<button type="button" class="btn primary" data-qzsprint="' + nd.i + '">' + ico('bolt', 15) + ' Sprint again</button>') +
          '<button type="button" class="btn" id="qz-tohome">Back to the path</button></div>';
    } else {
      var pass = cur.stars > 0, best = prog()[l.id], jump = cur.jump != null, jumped = jump && cur.score >= 9;
      var misses = Object.keys(cur.miss).map(function (k) { return k + (cur.miss[k] > 1 ? ' ×' + cur.miss[k] : ''); });
      var nx = nextInCourse(l);
      var drill = !!cur.drill, ap = applyFor(l.unit.id);
      var verdict = jump ? (jumped ? 'Jumped ahead. The path is open up to here.' : 'Not quite: 9 right opens the path up to here.')
        : drill ? (cur.score === cur.n ? 'All fixed.' : 'Drill done')
        : pass ? (cur.stars === 3 ? 'Perfect!' : 'Level passed') : 'Not passed yet — 8 right to pass';
      var drillBtn = !drill && !jump && cur.drillPool.length ? '<button type="button" class="btn" id="qz-drill">Drill these</button>' : '';
      var acts = jump
        ? (jumped ? '<button type="button" class="btn primary" id="qz-tohome">Back to the path</button>'
          : '<button type="button" class="btn primary" data-qzjump="' + nd.i + '">Try the jump again</button><button type="button" class="btn" id="qz-tohome">Back to the path</button>')
        : drill ? '<button type="button" class="btn primary" data-qzl="' + l.id + '">Back to the level</button>' + (cur.drillPool.length ? '<button type="button" class="btn" id="qz-drill">Drill again</button>' : '')
        : (pass && nx
          ? '<button type="button" class="btn primary" data-qzl="' + nx.id + '">Next level ' + App.icon('right', 14) + '</button>' +
            '<button type="button" class="btn" id="qz-retry">Try again</button>'
          : '<button type="button" class="btn primary" id="qz-retry">Try again</button>' +
            (nx ? '<button type="button" class="btn" data-qzl="' + nx.id + '">Next level</button>' : '')) + drillBtn;
      html = '<div class="qz-lvltag">' + esc(lvlTitle(l)) + '</div>' +
        '<div class="qz-big">' + cur.score + '<span>/' + cur.n + '</span></div>' +
        (jump || drill ? '' : '<div class="qz-stars" aria-label="' + cur.stars + ' of 3 stars">' + starStr(cur.stars) + '</div>') +
        '<div class="qz-verdict">' + verdict + '</div>' +
        (best && best.b > cur.score && !jump && !drill ? '<div class="muted small">Your best: ' + best.b + '/10</div>' : '') +
        doneStats() + doneNotes() +
        (misses.length ? '<div class="qz-miss"><span class="muted">Practice: </span>' + esc(misses.join(', ')) + '</div>' : '') +
        '<div class="qz-acts">' + acts + '</div>' +
        (jump ? '' : '<div class="qz-donelinks"><button type="button" class="qz-backlink" id="qz-back">' + App.icon('left', 14) + ' ' + esc(cur.from === 'topic' ? l.unit.name : 'The path') + '</button>' +
          (ap ? '<button type="button" class="qz-backlink" data-qzapply="' + l.unit.id + '">' + esc(ap.label) + ' ' + App.icon('right', 14) + '</button>' : '') + '</div>');
    }
    root.innerHTML = '<div class="qz-view"><div class="card qz-done qz-in">' + html + '</div></div>';
  }

  // ================= flow =================

  // opt: { sprint: nodeIndex } for a 60-second sprint (+ endless: true = until
  // the first miss), { jump: nodeIndex } for a jump test
  function startLevel(lid, opt) {
    var l = BY_ID[lid];
    if (!l) return;
    clearTimeout(advT);
    stopSprint();
    stopClock();
    opt = opt || {};
    var from = view === 'topic' ? 'topic' : view === 'home' ? 'path' : (cur && cur.from) || 'path';
    cur = { lvl: l, n: 10, res: [], miss: {}, q: null, answered: false, tap: {}, got: {}, played: null, playedPos: null, lastSig: null,
      from: from, xp: 0, combo: 0, times: [], ms: 0, prevSpeed: XP().speed(l.unit.id), jump: opt.jump != null ? opt.jump : null, sprint: null,
      drill: opt.drill || null, drillPool: [] };
    if (cur.drill) cur.n = Math.min(10, Math.max(5, cur.drill.length * 2));
    if (opt.sprint != null) {
      cur.n = 1e9;
      var ck = opt.endless ? clockSetting() : 0, skey = opt.endless ? endKey(NODES[opt.sprint].id, ck) : NODES[opt.sprint].id;
      cur.sprint = { i: opt.sprint, key: skey, endless: !!opt.endless, clock: ck, best: XP().sprintBest(skey),
        end: opt.endless ? Infinity : Date.now() + 60000, timer: 0, done: false };
    }
    // the answer clock: Endless streaks and drills (levels and jump tests stay untimed)
    var cs = clockSetting();
    if (cs && ((cur.sprint && cur.sprint.endless) || cur.drill)) cur.clock = { base: cs, now: cs, timer: 0, end: 0, len: 0, q: null };
    view = 'run';
    newQ();
    if (cur.sprint && !cur.sprint.endless) cur.sprint.timer = setInterval(tickSprint, 100);
    reveal(root);
  }

  function newQ() {
    var q, tries = 0, again = !!(cur && cur.q);
    do { q = GEN[cur.lvl.gen](cur.lvl.o); }
    while ((q.sig === cur.lastSig || (cur.drill && cur.drill.indexOf(q.item) < 0)) && tries++ < (cur.drill ? 60 : 6));
    cur.lastSig = q.sig;
    cur.q = q;
    cur.answered = false;
    cur.lastOk = false;
    cur.tap = {};
    cur.got = {};
    cur.played = null;
    cur.playedPos = null;
    cur.timedOut = false;
    render();
    cur.t0 = (window.performance || Date).now();
    if (again) { var qb = el('qz-q'); if (qb && qb.getBoundingClientRect().top < 0) reveal(el('qz-runshell')); }
    if (q.auto) setTimeout(function () { whenVoiceReady(function () { if (cur && cur.q === q && view === 'run' && !covered()) { cur.autoPlayed = q; playQ(q); startClock(); } }); }, 280);
    else startClock();
  }

  function nextQ() {
    clearTimeout(advT);
    if (!cur) return;
    if (cur.sprint) { if (Date.now() >= cur.sprint.end || (cur.sprint.endless && !cur.lastOk)) finishSprint(); else newQ(); return; }
    if (cur.res.length >= cur.n) finish(); else newQ();
  }

  function resolve(ok, picked, note) {
    var q = cur.q;
    if (cur.answered) return;
    stopClock();
    cur.answered = true;
    cur.lastOk = ok;
    // endless + clock: every right answer takes 0.1 s off the clock, down to half
    if (ok && cur.clock && cur.sprint && cur.sprint.endless) cur.clock.now = Math.max(cur.clock.base / 2, Math.round(cur.clock.now * 10 - 1) / 10);
    cur.res.push(ok);
    recordItem(q.item, ok);
    var ms = Math.max(0, (window.performance || Date).now() - (cur.t0 || 0));
    cur.combo = ok ? cur.combo + 1 : 0;
    cur.ms += Math.min(ms, 45000);
    if (ok) cur.times.push(Math.min(ms, 30000));
    var xr = XP().answer({ unit: cur.lvl.unit.id, ok: ok, ms: ms, combo: cur.combo, kind: q.ear ? 'ear' : q.kind === 'choice' ? 'choice' : 'play' });
    cur.xp += xr.xp;
    if (!ok && q.miss) cur.miss[q.miss] = (cur.miss[q.miss] || 0) + 1;
    if (!ok && q.item && cur.drillPool.indexOf(q.item) < 0) cur.drillPool.push(q.item);
    if (q.kind === 'choice') {
      root.querySelectorAll('[data-qzc]').forEach(function (b) {
        var id = b.getAttribute('data-qzc');
        b.disabled = true;
        b.classList.add(id === q.correct ? 'ok' : id === picked ? 'bad' : 'dim');
      });
    } else {
      paintAns();
    }
    if (q.reveal && q.reveal.staff) paintVis();
    // the keyboard lights the answer (Help: Target and up)
    var apcs = q.kind === 'single' ? [q.pc] : q.kind === 'set' ? Object.keys(q.pcs || {}).map(Number) : q.pcAnswer != null ? [q.pcAnswer] : [];
    if (apcs.length && App.midi && App.midi.reveal) App.midi.reveal(apcs, cur.sprint ? 700 : 1800);
    var fb = el('qz-fb');
    if (fb) {
      fb.className = 'qz-fb ' + (ok ? 'ok' : 'bad');
      var pk = !ok && picked && q.choices ? q.choices.filter(function (c) { return c.id === picked; })[0] : null;
      fb.innerHTML = '<b>' + (ok ? 'Correct.' : cur.timedOut ? 'Time’s up.' : note != null ? 'You played ' + esc(PC_LABEL[mod(note, 12)]) + '.' : pk ? 'You chose ' + esc(pk.label) + '.' : 'Not quite.') + '</b> ' + esc(q.explain || '');
    }
    paintFoot();
    paintProg();
    paintRunXP();
    xpPop(xr);
    var nb = el('qz-act');
    if (cur.sprint) { // keep the pace: right answers move on fast, misses show the answer briefly
      if (!ok && cur.sprint.endless) cur.endQ = (cur.timedOut ? 'Time’s up. ' : '') + (q.explain || q.prompt);
      advT = setTimeout(function () { if (cur && cur.q === q) nextQ(); }, ok ? 380 : cur.sprint.endless ? 1800 : 1100);
      return;
    }
    if (nb && !ok) { try { nb.focus({ preventScroll: true }); } catch (e) { /* ok */ } }
    keepVisible(nb); // the feedback + Next must be on screen, not under the tab bar
    if (q.kind === 'choice' && !q.ear) playQ(q); // hear what you just read
    if (ok) advT = setTimeout(function () { if (cur && cur.q === q) nextQ(); }, q.ear ? 1200 : 1400);
  }

  function finish() {
    var score = cur.res.filter(Boolean).length, s = starsFor(score), p = prog(), old = p[cur.lvl.id];
    // a jump test only counts once it opens the path (9+), so a near miss can't unlock the step
    if ((!old || score > old.b) && (cur.jump == null || score >= 9) && !cur.drill) p[cur.lvl.id] = { b: score, s: Math.max(s, old ? old.s : 0) };
    App.store.set('qz.prog', p);
    cur.score = score;
    cur.stars = s;
    if (cur.jump != null && score >= 9) XP().setJump(cur.jump);
    cur.fin = XP().finishLevel({ passed: s > 0 && !cur.drill, perfect: score === 10 && !cur.drill });
    cur.xp += cur.fin.bonus;
    view = 'done';
    render();
    reveal(root);
  }

  function answerChoice(id) {
    if (!cur || cur.answered || cur.q.kind !== 'choice') return;
    resolve(id === cur.q.correct, id);
  }

  function choiceForPc(q, pc) {
    for (var i = 0; i < q.choices.length; i++) if (q.choices[i].pc === pc) return q.choices[i].id;
    return null;
  }

  function inputNote(midi, src, pos) {
    if (!cur || view !== 'run') return;
    var q = cur.q, pc = mod(midi, 12);
    if (cur.answered) {
      // A correction moves on without re-grading the miss or awarding XP twice.
      // Leave the wrong-answer explanation visible until that fresh correct press.
      if (!cur.lastOk && !cur.sprint &&
          ((q.kind === 'choice' && q.pcAnswer != null && src !== 'tap' && pc === q.pcAnswer) ||
           (q.kind === 'single' && pc === q.pc && (q.string == null || !pos || pos.s === q.string)))) nextQ();
      return;
    }
    if (q.kind === 'choice') {
      if (q.pcAnswer == null || src === 'tap') return;
      if (pc === q.pcAnswer) resolve(true, q.correct);
      else resolve(false, choiceForPc(q, pc), midi);
      return;
    }
    if (q.kind === 'single') {
      var ok = pc === q.pc;
      if (ok && q.string != null && pos && pos.s !== q.string) ok = false;
      cur.played = [midi];
      if (pos) cur.playedPos = pos;
      resolve(ok, null, ok ? null : midi);
      return;
    }
    if (src === 'tap') {
      if (cur.tap[midi]) delete cur.tap[midi]; else cur.tap[midi] = true;
      paintAns();
      return;
    }
    cur.got[midi] = true;
    if (!q.pcs[pc]) { cur.played = Object.keys(cur.got).map(Number); resolve(false, null, midi); return; }
    var have = {};
    Object.keys(cur.got).forEach(function (k) { have[mod(+k, 12)] = true; });
    if (Object.keys(q.pcs).every(function (p2) { return have[p2]; })) { cur.played = Object.keys(cur.got).map(Number); resolve(true); }
    else paintAns();
  }

  function checkTaps() {
    if (!cur || cur.answered || cur.q.kind !== 'set') return;
    var q = cur.q, have = {};
    Object.keys(cur.tap).forEach(function (k) { have[mod(+k, 12)] = true; });
    var hk = Object.keys(have);
    var ok = hk.length === Object.keys(q.pcs).length && hk.every(function (p2) { return q.pcs[p2]; });
    cur.played = Object.keys(cur.tap).map(Number);
    resolve(ok);
  }

  function toPath(nodeIdx) {
    view = 'home';
    if (homeTab !== 'path') { homeTab = 'path'; App.store.set('qz.home', 'path'); }
    selNode = nodeIdx == null ? -1 : nodeIdx;
    render();
    if (selNode >= 0) { var n = el('qz-node-' + selNode); if (n) reveal(n); } else reveal(root);
  }

  function back() {
    clearTimeout(advT);
    stopClock();
    if (view === 'run' && cur && cur.sprint && cur.sprint.endless && !cur.sprint.done) { finishSprint(); return; } // End run keeps the streak
    stopSprint();
    if ((view === 'run' || view === 'done') && cur && cur.from !== 'topic') { toPath(cur.lvl.node.i); return; }
    if (view === 'run' || view === 'done') {
      var l = cur.lvl;
      topicId = l.topic.id;
      if (!openUnits[topicId]) openUnits[topicId] = {};
      openUnits[topicId][l.unit.id] = true;
      openMode[l.unit.id] = l.mode;
      view = 'topic';
      render();
      reveal(el('qz-unit-' + l.unit.id));
    } else {
      view = 'home';
      render();
      reveal(root);
    }
  }

  // ================= game layer: path, XP, sprints, progress =================

  function XP() { return window.SLXP; }

  var ICO = {
    flame: '<path d="M12 2.5c.7 3 4.6 4.9 4.6 9.6a4.6 4.6 0 0 1-9.2 0c0-2.1.9-3.5 2-4.4.2 1.7.9 2.6 1.8 2.9-.4-2.7-.1-5.6.8-8.1z"/>',
    bolt: '<path d="M13 2.5 4.5 13.5H11L10 21.5l8.5-11H12z"/>',
    snow: '<path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6"/><path d="m9.2 4.3 2.8 1.9 2.8-1.9M9.2 19.7l2.8-1.9 2.8 1.9"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    check: '<polyline points="5 12.5 10 17.5 19 7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    ear: '<path d="M7.5 9.5a4.5 4.5 0 0 1 9 0c0 2.6-2.5 3.6-2.5 6.5a3 3 0 0 1-6 .5"/><path d="M10.5 9.5a1.5 1.5 0 0 1 3 0c0 1.2-1.5 1.5-1.5 3"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    faster: '<path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/>',
    slower: '<path d="M12 5v14"/><polyline points="19 12 12 19 5 12"/>'
  };
  function ico(n, s, cls) {
    if (!ICO[n]) return App.icon(n, s);
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + ICO[n] + '</svg>';
  }
  var MODE_ICON = { treble: 'note', bass: 'note', staff: 'note', piano: 'keys', neck: 'guitar', ear: 'ear', theory: 'learn' };

  var homeTab = App.store.get('qz.home', 'path'), selNode = -1, chartT = 0;
  if (['path', 'topics', 'progress'].indexOf(homeTab) < 0) homeTab = 'path';

  function nodeDone(nd, p) { var c = 0; nd.levels.forEach(function (l) { if (passed(p, l)) c++; }); return c; }
  function unlocked(i, p) {
    return i === 0 || nodeDone(NODES[i], p) > 0 || nodeDone(NODES[i - 1], p) > 0 || i <= XP().jump();
  }
  // "you are here": the newest open node not started yet, else the first unfinished one
  // (steps a jump test skipped over don't count as "not started")
  function currentNode(p) {
    var i, firstOpen = -1, jmp = XP().jump();
    for (i = 0; i < NODES.length; i++) {
      if (!unlocked(i, p)) break;
      var d = nodeDone(NODES[i], p);
      if (d === 0 && i < jmp) continue;
      if (d === 0) return i;
      if (firstOpen < 0 && d < NODES[i].levels.length) firstOpen = i;
    }
    return firstOpen >= 0 ? firstOpen : Math.min(i, NODES.length - 1);
  }
  function nodeLevel(nd, p) {
    for (var i = 0; i < nd.levels.length; i++) if (!passed(p, nd.levels[i])) return nd.levels[i];
    return nd.levels[nd.levels.length - 1];
  }
  function fmtTime(ms) { var s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function fmtDur(sec) {
    var m = Math.round(sec / 60);
    return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  }
  function secs(ms) { return (ms / 1000).toFixed(1) + ' s'; }

  // ---- the stats strip: streak · today's goal · player level · continue ----
  function goalRing(pct, size) {
    var r = (size - 6) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.min(1, pct / 100));
    return '<svg class="qz-ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="trk"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="val" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) +
      '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
  }

  function statsStrip() {
    var X = XP(), st = X.streak(), lv = X.level(), t = X.today(), g = X.goal(), p = prog();
    var pct = Math.round(100 * t.x / g), ci = currentNode(p), nl = nodeLevel(NODES[ci], p);
    var note;
    if (st.n > 0 && !st.today) note = 'Finish a level or play 5 minutes today to keep your ' + st.n + '-day streak' + (st.freezes ? ' (you have ' + st.freezes + ' streak freeze' + (st.freezes > 1 ? 's' : '') + ')' : '') + '.';
    else if (!st.today) note = X.total() ? 'Finish a level or play 5 minutes to start a new streak.' : 'Finish your first level to start a streak. Playing on any page counts too.';
    else if (t.x < g) note = 'Streak safe today. ' + (g - t.x) + ' XP to your daily goal.';
    else note = 'Daily goal reached. See you tomorrow.';
    return '<div class="card qz-strip">' +
      '<div class="qz-stat' + (st.today ? ' lit' : '') + '">' + ico('flame', 26) + '<div><b>' + st.n + '</b><span>day streak</span></div></div>' +
      '<div class="qz-stat">' + goalRing(pct, 40) + '<div><b>' + t.x + '<small>/' + g + '</small></b><span>XP today</span></div></div>' +
      '<div class="qz-stat qz-lvstat"><span class="qz-lvbadge" aria-hidden="true">' + lv.lv + '</span><div class="qz-lvtext"><b>Level ' + lv.lv + ' · ' + lv.title + '</b>' +
        '<span class="qz-bar"><i style="width:' + Math.round(100 * lv.into / lv.need) + '%"></i></span><span>' + (lv.need - lv.into) + ' XP to level ' + (lv.lv + 1) + '</span></div></div>' +
      '<button type="button" class="btn primary qz-go" id="qz-cont" data-qzl="' + nl.id + '">' + App.icon('play', 13) + ' ' + (X.total() ? 'Continue' : 'Start') + '</button>' +
      '<p class="qz-stripnote">' + esc(note) + '</p>' +
    '</div>';
  }

  // ---- path view ----
  var ZIG = [0, 1, 1.5, 1, 0, -1, -1.5, -1];

  function pathHTML() {
    var p = prog(), ci = currentNode(p), h = '', sec = null, k = 0, n = 0;
    NODES.forEach(function (nd, i) {
      if (nd.topic !== sec) {
        if (sec) h += '</div></section>';
        sec = nd.topic; k = 0; n++;
        var tp = 0, tt = 0;
        LEVELS.forEach(function (l) { if (l.topic === sec) { tt++; if (passed(p, l)) tp++; } });
        h += '<section class="qz-psec"><header class="qz-pban"><span class="qz-eyebrow">Section ' + n + '</span><h3>' + esc(sec.name) + '</h3>' +
          '<span class="qz-pmeta">' + tp + '/' + tt + ' levels</span></header><div class="qz-pnodes">';
      }
      var done = nodeDone(nd, p), all = nd.levels.length, open = unlocked(i, p);
      var state = !open ? 'locked' : done === all ? 'done' : i === ci ? 'cur' : done ? 'part' : 'open';
      h += '<div class="qz-nwrap" id="qz-node-' + i + '" style="--x:' + ZIG[k % 8] + '">' + nodeBtn(nd, i, state, done, all) +
        (i === selNode ? nodePop(nd, i, p) : '') + '</div>';
      k++;
    });
    return '<div class="qz-path">' + h + '</div></section></div>';
  }

  function nodeBtn(nd, i, state, done, all) {
    var lab = nd.unit.name + ', ' + MODE_NAME[nd.mode] + ': ' + (state === 'locked' ? 'locked' : done + ' of ' + all + ' levels passed');
    var face = state === 'locked' ? ico('lock', 22) : state === 'done' ? ico('check', 28) : ico(MODE_ICON[nd.mode], 26);
    return '<button type="button" class="qz-node ' + state + (i === selNode ? ' sel' : '') + '" data-qzn="' + i + '" aria-expanded="' + (i === selNode) + '" aria-label="' + esc(lab) + '">' +
      (state === 'cur' ? '<span class="qz-nstart" aria-hidden="true">Start</span>' : '') +
      '<span class="qz-ndisc" style="--p:' + Math.round(100 * done / all) + '%"><span class="qz-nface">' + face + '</span></span>' +
      '<span class="qz-nlbl" aria-hidden="true">' + esc(nd.unit.name) + '<small>' + esc(MODE_NAME[nd.mode]) + (done && done < all ? ' · ' + done + '/' + all : '') + '</small></span></button>';
  }

  function nodePop(nd, i, p) {
    var open = unlocked(i, p), nl = nodeLevel(nd, p), best = XP().sprintBest(nd.id);
    var rows = nd.levels.map(function (l) {
      var s = p[l.id];
      return '<button type="button" class="qz-lvl" data-qzl="' + l.id + '">' +
        '<span class="n">' + l.n + '</span><span class="t">' + esc(l.text) + '</span>' +
        (!s ? '' : s.s ? '<span class="st" aria-label="' + s.s + ' of 3 stars">' + starStr(s.s) + '</span>' : '<span class="sc">' + s.b + '/10</span>') +
        '<span class="go">' + App.icon('right', 14) + '</span></button>';
    }).join('');
    var acts = open
      ? '<button type="button" class="btn primary" data-qzl="' + nl.id + '">' + App.icon('play', 13) + ' ' + (nodeDone(nd, p) ? 'Level ' + nl.n : 'Start') + '</button>' +
        '<button type="button" class="btn" data-qzsprint="' + i + '">' + ico('bolt', 15) + ' 60-second sprint' + (best ? ' · best ' + best : '') + '</button>' +
        '<button type="button" class="btn" data-qzendless="' + i + '" title="Questions until your first miss">' + endlessLabel(nd) + '</button>'
      : '<button type="button" class="btn primary" data-qzjump="' + i + '">Jump here</button>';
    var ap = applyFor(nd.unit.id);
    if (open && ap) acts += '<button type="button" class="btn" data-qzapply="' + nd.unit.id + '">' + esc(ap.label) + '</button>';
    if (open) acts += clockPicker();
    return '<div class="card qz-npop qz-in" role="region" aria-label="' + esc(nd.unit.name + ', ' + MODE_NAME[nd.mode]) + '">' +
      '<div class="qz-npophead"><b>' + esc(nd.unit.name) + '</b><span>' + esc(nd.topic.name + ' · ' + MODE_NAME[nd.mode]) + '</span></div>' +
      (open && nd.unit.learn ? '<details class="qz-nlearn"' + (nodeDone(nd, p) ? '' : ' open') + '><summary>Lesson</summary><div class="qz-learn">' + nd.unit.learn + '</div></details>' : '') +
      (open ? '<div class="qz-lvls">' + rows + '</div>'
        : '<p class="qz-lockmsg">' + ico('lock', 15) + '<span>Pass a level in the step before this one to open it. Or jump ahead: score 9 out of 10 on its first level.</span></p>') +
      '<div class="qz-acts">' + acts + '</div></div>';
  }

  // "apply it": take a unit from the quiz to the instrument
  var SCALE_TO_THEORY = { major: 'major', minor: 'aeolian', harm: 'harmonicMinor', mel: 'melodicMinor', majp: 'majorPent', minp: 'minorPent',
    blues: 'blues', dorian: 'dorian', phryg: 'phrygian', lyd: 'lydian', mixo: 'mixolydian' };
  function applyFor(uid) {
    if (uid === 'nat' || uid === 'acc') return { label: 'See it on the Fretboard', go: function () { App.switchTo('fretboard'); } };
    if (/^s(mm|min|pent|mod)$/.test(uid)) {
      var l = null;
      LEVELS.forEach(function (x) { if (!l && x.unit.id === uid && x.o && x.o.set) l = x; });
      var sc = l && SCALE_TO_THEORY[l.o.set[0]];
      if (sc) return { label: 'Play it on the Fretboard', go: function () { App.emit('fb:practice', { scale: sc }); } };
    }
    if (/^c/.test(uid)) return { label: 'Open Chords', go: function () { App.switchTo('chords'); } };
    if (/^k/.test(uid) || uid === 'sdeg') return { label: 'Open the Circle', go: function () { App.switchTo('theory'); } };
    return null;
  }

  function selectNode(i) {
    selNode = selNode === i ? -1 : i;
    paintHomeBody();
    if (selNode >= 0) keepVisible(document.querySelector('.qz-npop'));
  }

  function showCurrentNode() {
    var p = prog(), ci = currentNode(p);
    if (ci < 3) return;
    var n = el('qz-node-' + ci);
    if (!n) return;
    var r = n.getBoundingClientRect();
    if (r.top > window.innerHeight * 0.7 || r.bottom < 0) window.scrollTo(0, Math.max(0, window.pageYOffset + r.top - window.innerHeight * 0.4));
  }

  // ---- topics view (free practice, nothing locked) ----
  function topicsHTML() {
    var p = prog(), h = '';
    COURSE.forEach(function (t) {
      var pass = 0, tot = 0;
      LEVELS.forEach(function (l) { if (l.topic === t) { tot++; if (passed(p, l)) pass++; } });
      h += '<button type="button" class="qz-topic" data-qzt="' + t.id + '">' +
        '<span class="qz-tname">' + esc(t.name) + '</span>' +
        '<span class="qz-tblurb">' + esc(t.blurb) + '</span>' +
        '<span class="qz-tfoot"><span class="qz-bar"><i style="width:' + Math.round(100 * pass / tot) + '%"></i></span>' +
        '<span class="qz-tmeta">' + pass + '/' + tot + '</span></span></button>';
    });
    return '<p class="qz-tabnote">Practice any topic, in any order. Everything here earns XP too.</p><div class="qz-topics">' + h + '</div>';
  }

  // ---- progress view ----
  function tile(icon, label, value, sub) {
    return '<div class="qz-tile">' + (icon ? '<span class="qz-tileic">' + ico(icon, 18) + '</span>' : '') +
      '<span class="qz-tilelab">' + esc(label) + '</span><b class="qz-tileval">' + value + '</b>' + (sub ? '<span class="qz-tilesub">' + sub + '</span>' : '') + '</div>';
  }

  function weekStrip() {
    var X = XP(), days = X.history(7), today = X.dayKey(), WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return '<div class="qz-week">' + days.map(function (d) {
      var dt = new Date(+d.key.slice(0, 4), +d.key.slice(5, 7) - 1, +d.key.slice(8, 10));
      var state = d.l > 0 ? 'done' : d.frozen ? 'frozen' : d.key === today ? 'today' : 'missed';
      var word = { done: 'practiced', frozen: 'covered by a streak freeze', today: 'not yet today', missed: 'missed' }[state];
      return '<div class="qz-wday ' + state + '" title="' + esc(WD[dt.getDay()] + ': ' + word) + '"><span class="qz-wdot">' +
        (state === 'done' ? ico('flame', 16) : state === 'frozen' ? ico('snow', 15) : '') + '</span><span>' + WD[dt.getDay()].charAt(0) + '</span>' +
        '<span class="sr">' + WD[dt.getDay()] + ' ' + word + '</span></div>';
    }).join('') + '</div>';
  }

  function topicSpeedRows() {
    var X = XP(), today = X.dayKey(), weekAgo = X.addDays(today, -6), monthAgo = X.addDays(today, -34), tomorrow = X.addDays(today, 1);
    var us = X.unitStats();
    return COURSE.map(function (t) {
      var ids = t.units.map(function (u) { return u.id; }), ok = 0, asked = 0;
      ids.forEach(function (id) { if (us[id]) { ok += us[id].ok; asked += us[id].asked; } });
      var recent = X.speed(ids, weekAgo, tomorrow), earlier = X.speed(ids, monthAgo, weekAgo);
      var change = '–';
      if (recent.n >= 3 && earlier.n >= 3) {
        var d = (earlier.avg - recent.avg) / 1000;
        change = Math.abs(d) < 0.1 ? 'Steady'
          : '<span class="qz-chg ' + (d > 0 ? 'up' : 'down') + '">' + ico(d > 0 ? 'faster' : 'slower', 13) + Math.abs(d).toFixed(1) + ' s<span class="qz-chgw"> ' + (d > 0 ? 'faster' : 'slower') + '</span></span>';
      }
      return '<tr><th scope="row">' + esc(t.name) + '</th><td>' + asked + '</td><td>' + (asked ? Math.round(100 * ok / asked) + '%' : '–') + '</td>' +
        '<td>' + (recent.n ? secs(recent.avg) : '–') + '</td><td>' + change + '</td></tr>';
    }).join('');
  }

  function areaRows() {
    var ar = XP().areas(7);
    if (!ar.length) return '';
    var max = ar[0].s;
    return '<div class="qz-areas"><span class="muted small">Last 7 days</span>' + ar.slice(0, 6).map(function (a) {
      return '<div class="qz-arow"><span>' + esc(a.area) + '</span><span class="qz-abar"><i style="width:' + Math.max(2, Math.round(100 * a.s / max)) + '%"></i></span><b>' + fmtDur(a.s) + '</b></div>';
    }).join('') + '</div>';
  }

  // Keys scale lessons (js/keylessons.js): level reached, best score, last timing
  function keysLessonsHTML() {
    var kl = App.keysLessons && App.keysLessons.summary ? App.keysLessons.summary() : [];
    var body = kl.length ? '<ul class="qz-recs">' + kl.map(function (x) {
      return '<li><button type="button" class="qz-rec" data-qzkeys="' + x.id + '"><span>' + esc(x.name) + '<small>' + esc(x.hand) + ' · level ' + x.level + ' of ' + x.levels +
        ' · last timing ±' + x.timing + ' ms' + (x.streak ? ' · ∞ streak ' + x.streak : '') + (x.mastered ? ' · mastered' : '') + '</small></span><span class="qz-klbar" title="' + x.passed + ' of ' + x.levels + ' levels passed"><i style="width:' +
        Math.round(100 * x.passed / x.levels) + '%"></i></span><b>' + x.best + '</b></button></li>';
    }).join('') + '</ul>'
      : '<p class="muted small">No lessons yet. On the Keys page, pick a scale lesson and play it with the click.</p>';
    return '<section class="card qz-pcard"><div class="qz-pchead"><h3>Keys lessons</h3><span class="muted small">Levels passed and best score per lesson</span></div>' + body + '</section>';
  }

  function progressHTML() {
    var X = XP(), lv = X.level(), st = X.streak(), tot = X.totals(), g = X.goal(), t = X.today();
    var sprints = X.sprints(), sk = Object.keys(sprints).filter(function (k) { return recKey(k).node; });
    sk.sort(function (a, b) { return recKey(a).node.i - recKey(b).node.i || (a < b ? -1 : 1); });
    var goalSeg = X.GOALS.map(function (v) {
      return '<button type="button" data-qzgoal="' + v + '" class="' + (v === g ? 'active' : '') + '" aria-pressed="' + (v === g) + '">' + X.GOAL_NAMES[v] + ' <small>' + v + '</small></button>';
    }).join('');
    return '<div class="qz-prog2">' +
      '<div class="qz-tiles">' +
        tile('star', 'Level', lv.lv + ' · ' + esc(lv.title), (lv.need - lv.into) + ' XP to level ' + (lv.lv + 1)) +
        tile('bolt', 'Total XP', X.total().toLocaleString(), t.x + ' today') +
        tile('flame', 'Streak', st.n + (st.n === 1 ? ' day' : ' days'), 'Best ' + st.best + ' · ' + st.freezes + ' freeze' + (st.freezes === 1 ? '' : 's') + ' saved') +
        tile('clock', 'Practice time', fmtDur(tot.s + tot.p), fmtDur(tot.p) + ' playing · ' + tot.l + ' levels') +
      '</div>' +
      '<section class="card qz-pcard"><div class="qz-pchead"><h3>This week</h3><span class="muted small">A day counts once you finish a level or play for 5 minutes on any page. Every 7 days in a row earns a streak freeze (up to 2), which covers one missed day.</span></div>' + weekStrip() + '</section>' +
      '<section class="card qz-pcard"><div class="qz-pchead"><h3>Daily goal</h3><span class="muted small">' + t.x + ' of ' + g + ' XP today</span></div>' +
        '<div class="seg qz-goals" role="group" aria-label="Daily XP goal">' + goalSeg + '</div>' +
        '<p class="muted small qz-xprules">You earn 2 XP per right answer, +1 for a quick one, +1 on a run of 5 or more, and +5 for passing a level (+5 more for 10/10). Playing on any page earns 2 XP a minute.</p></section>' +
      '<section class="card qz-pcard"><div class="qz-pchead"><h3>XP per day</h3><span class="muted small">Last 14 days · the line is your daily goal</span></div><div class="qz-chart" id="qz-ch-xp"></div></section>' +
      '<section class="card qz-pcard"><div class="qz-pchead"><h3>Practice time</h3><span class="muted small">Minutes per day, last 14 days · Exercises and playing on any page</span></div><div class="qz-chart" id="qz-ch-time"></div>' + areaRows() + '</section>' +
      '<section class="card qz-pcard"><div class="qz-pchead"><h3>Answer speed</h3><span class="muted small">Average seconds per right answer, by week · lower is faster</span></div><div class="qz-chart" id="qz-ch-speed"></div>' +
        '<div class="qz-tblwrap"><table class="qz-table qz-ttopic"><thead><tr><th scope="col">Topic</th><th scope="col">Answers</th><th scope="col">Right</th><th scope="col">Speed</th><th scope="col">Change</th></tr></thead><tbody>' +
        topicSpeedRows() + '</tbody></table></div><p class="muted small qz-tnote">Speed is your average over the last 7 days. Change compares it with the 4 weeks before: up means faster.</p></section>' +
      keysLessonsHTML() +
      '<section class="card qz-pcard"><div class="qz-pchead"><h3>Records</h3><span class="muted small">Most right answers in a 60-second sprint, and in a row on an endless streak</span></div>' +
        (sk.length ? '<ul class="qz-recs">' + sk.map(function (k) {
          var rk = recKey(k), end = rk.end, nd = rk.node;
          return '<li><button type="button" class="qz-rec" data-' + (end ? 'qzendless' : 'qzsprint') + '="' + nd.i + '"' + (end ? ' data-qzclk="' + rk.clock + '"' : '') + '><span>' + esc(nd.unit.name) + '<small>' + esc(MODE_NAME[nd.mode]) + ' · ' + (end ? 'endless streak' + (rk.clock ? ' · ' + rk.clock + ' s clock' : '') : 'sprint') + '</small></span><b>' + sprints[k] + '</b>' +
            (end ? '<span class="qz-inf" aria-hidden="true">∞</span>' : ico('bolt', 15)) + '</button></li>';
        }).join('') + '</ul>'
          : '<p class="muted small">No records yet. Open any step on the path and choose 60-second sprint or Endless streak.</p>') + '</section>' +
      '<section class="card qz-pcard"><div class="qz-pchead"><h3>Lesson sound</h3></div>' +
        '<div class="seg qz-sound" role="group" aria-label="Exercise sound"><button type="button" data-qzs="piano">Piano</button><button type="button" data-qzs="guitar">Guitar</button></div></section>' +
    '</div>';
  }

  // ---- charts: built at the container's real pixel width (no scaled text) ----
  function niceMax(v) {
    if (v <= 0) return 1;
    var e = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), f = v / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }
  function dayLabel(k, short) {
    var d = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
    var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    return short ? wd.charAt(0) : wd + ' ' + d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  }

  function barChart(box, rows, o) {
    var W = Math.max(260, box.clientWidth), H = 170, L = 34, R = 10, T = 14, B = 24, pw = W - L - R, ph = H - T - B;
    var max = niceMax(Math.max(o.goal || 0, Math.max.apply(null, rows.map(function (r) { return r.v; }))));
    var band = pw / rows.length, bw = Math.min(24, band * 0.62), s = '';
    [0, max / 2, max].forEach(function (v) {
      var y = T + ph - ph * v / max;
      s += '<line class="qz-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>' +
        '<text class="qz-axis" x="' + (L - 6) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + (Math.round(v * 10) / 10) + '</text>';
    });
    if (o.goal) {
      var gy = T + ph - ph * o.goal / max;
      s += '<line class="qz-goalline" x1="' + L + '" x2="' + (W - R) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '"/>' +
        '<text class="qz-axis qz-halo" x="' + (L + 4) + '" y="' + (gy - 5).toFixed(1) + '">Goal ' + o.goal + '</text>';
    }
    rows.forEach(function (r, i) {
      var cx = L + band * i + band / 2, h = ph * r.v / max, x0 = cx - bw / 2, x1 = cx + bw / 2, yb = T + ph, yt = yb - h, rr = Math.min(4, h, bw / 2);
      if (h > 0.5) {
        s += '<path class="qz-barm' + (i === rows.length - 1 ? ' last' : '') + '" d="M' + x0.toFixed(1) + ' ' + yb + 'V' + (yt + rr).toFixed(1) +
          'Q' + x0.toFixed(1) + ' ' + yt.toFixed(1) + ' ' + (x0 + rr).toFixed(1) + ' ' + yt.toFixed(1) + 'H' + (x1 - rr).toFixed(1) +
          'Q' + x1.toFixed(1) + ' ' + yt.toFixed(1) + ' ' + x1.toFixed(1) + ' ' + (yt + rr).toFixed(1) + 'V' + yb + 'Z"/>';
      }
      if (i === rows.length - 1 && r.v > 0) s += '<text class="qz-val qz-halo" x="' + cx.toFixed(1) + '" y="' + (yt - 5).toFixed(1) + '" text-anchor="middle">' + r.lab + '</text>';
      if (rows.length <= 8 || i % 2 === (rows.length - 1) % 2) s += '<text class="qz-axis" x="' + cx.toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + r.x + '</text>';
      s += '<rect class="qz-hit" x="' + (L + band * i).toFixed(1) + '" y="' + T + '" width="' + band.toFixed(1) + '" height="' + ph + '" data-tip="' + esc(r.tip) + '"/>';
    });
    box.innerHTML = '<svg class="qz-svg" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.label) + '">' + s + '</svg><div class="qz-tip" hidden></div>' + o.table;
  }

  function lineChart(box, rows, o) {
    var W = Math.max(260, box.clientWidth), H = 170, L = 38, R = 14, T = 16, B = 24, pw = W - L - R, ph = H - T - B;
    var vals = rows.filter(function (r) { return r.v != null; }).map(function (r) { return r.v; });
    var max = niceMax(Math.max.apply(null, vals.concat([1])) * 1.1), band = pw / rows.length, s = '', pts = [];
    [0, max / 2, max].forEach(function (v) {
      var y = T + ph - ph * v / max;
      s += '<line class="qz-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>' +
        '<text class="qz-axis" x="' + (L - 6) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + (Math.round(v * 10) / 10) + ' s</text>';
    });
    rows.forEach(function (r, i) {
      var cx = L + band * i + band / 2;
      if (r.v != null) pts.push([cx, T + ph - ph * r.v / max, r]);
      if (i % 2 === (rows.length - 1) % 2) s += '<text class="qz-axis" x="' + cx.toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + r.x + '</text>';
    });
    // a gap week breaks the line: draw runs of consecutive weeks
    var run = [], runs = [];
    rows.forEach(function (r, i) {
      var pt = null;
      pts.forEach(function (q) { if (q[2] === r) pt = q; });
      if (pt) run.push(pt); else { if (run.length) runs.push(run); run = []; }
    });
    if (run.length) runs.push(run);
    runs.forEach(function (rn) {
      if (rn.length > 1) {
        var d = rn.map(function (q, j) { return (j ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join('');
        s += '<path class="qz-area" d="' + d + 'L' + rn[rn.length - 1][0].toFixed(1) + ' ' + (T + ph) + 'L' + rn[0][0].toFixed(1) + ' ' + (T + ph) + 'Z"/>' +
          '<path class="qz-linem" d="' + d + '"/>';
      }
    });
    pts.forEach(function (q, j) {
      s += '<circle class="qz-dot" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="4"/>';
      if (j === pts.length - 1) {
        var below = j > 0 && pts[j - 1][1] < q[1] && q[1] + 20 < T + ph;
        s += '<text class="qz-val qz-halo" x="' + q[0].toFixed(1) + '" y="' + (below ? q[1] + 19 : q[1] - 9).toFixed(1) + '" text-anchor="middle">' + q[2].lab + '</text>';
      }
    });
    rows.forEach(function (r, i) {
      s += '<rect class="qz-hit" x="' + (L + band * i).toFixed(1) + '" y="' + T + '" width="' + band.toFixed(1) + '" height="' + ph + '" data-tip="' + esc(r.tip) + '"/>';
    });
    box.innerHTML = '<svg class="qz-svg" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.label) + '">' + s + '</svg><div class="qz-tip" hidden></div>' + o.table;
  }

  function tableHTML(head, rows) {
    return '<details class="qz-tbl"><summary>Show as a table</summary><div class="qz-tblwrap"><table class="qz-table"><thead><tr>' +
      head.map(function (h) { return '<th scope="col">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return i ? '<td>' + c + '</td>' : '<th scope="row">' + c + '</th>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div></details>';
  }

  function wireTips(box) {
    if (box.__tips) return;
    box.__tips = true;
    function hide() { var tip = box.querySelector('.qz-tip'); if (tip) tip.hidden = true; }
    function show(e) {
      var t = e.target.closest ? e.target.closest('[data-tip]') : null, tip = box.querySelector('.qz-tip');
      if (!t || !tip) { hide(); return; }
      tip.textContent = t.getAttribute('data-tip');
      tip.hidden = false;
      var br = box.getBoundingClientRect(), tr = t.getBoundingClientRect();
      var x = tr.left - br.left + tr.width / 2, w = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(br.width - w, x - w / 2)) + 'px';
      tip.style.top = '0px';
    }
    box.addEventListener('pointermove', show);
    box.addEventListener('pointerdown', show);
    box.addEventListener('pointerleave', hide);
  }

  function drawCharts() {
    var X = XP(), g = X.goal();
    var hx = el('qz-ch-xp'), ht = el('qz-ch-time'), hs = el('qz-ch-speed');
    if (!hx || !ht || !hs) return;
    var days = X.history(14), empty = '<p class="muted small qz-empty">Nothing yet in the last 14 days. Finish a level and it shows up here.</p>';
    if (days.some(function (d) { return d.x > 0; })) {
      barChart(hx, days.map(function (d, i) {
        return { v: d.x, x: dayLabel(d.key, true), lab: d.x + ' XP', tip: (i === days.length - 1 ? 'Today' : dayLabel(d.key)) + ': ' + d.x + ' XP · ' + d.l + ' level' + (d.l === 1 ? '' : 's') };
      }), { goal: g, label: 'XP per day over the last 14 days', table: tableHTML(['Day', 'XP', 'Levels'], days.map(function (d) { return [dayLabel(d.key), d.x, d.l]; })) });
    } else hx.innerHTML = empty;
    var mins = function (sec) { return Math.round(sec / 6) / 10; };
    if (days.some(function (d) { return d.s + d.p > 0; })) {
      barChart(ht, days.map(function (d, i) {
        var m = mins(d.s + d.p);
        return { v: m, x: dayLabel(d.key, true), lab: m + ' min', tip: (i === days.length - 1 ? 'Today' : dayLabel(d.key)) + ': ' + m + ' min · ' + mins(d.p) + ' playing, ' + mins(d.s) + ' Exercises' };
      }), { label: 'Practice minutes per day over the last 14 days', table: tableHTML(['Day', 'Minutes', 'Playing', 'Exercises'], days.map(function (d) { return [dayLabel(d.key), mins(d.s + d.p), mins(d.p), mins(d.s)]; })) });
    } else ht.innerHTML = empty;
    var wk = X.speedWeeks(8);
    if (wk.some(function (w) { return w.n > 0; })) {
      lineChart(hs, wk.map(function (w, i) {
        var v = w.n ? Math.round(w.avg / 100) / 10 : null;
        return { v: v, x: i === wk.length - 1 ? 'Now' : dayLabel(w.from).split(' ').slice(1).join(' '), lab: v != null ? v + ' s' : '',
          tip: 'Week of ' + dayLabel(w.from) + ': ' + (v != null ? v + ' s per right answer · ' + w.n + ' answers' : 'no practice') };
      }), { label: 'Average seconds per right answer, by week', table: tableHTML(['Week of', 'Seconds', 'Right answers'], wk.map(function (w) { return [dayLabel(w.from), w.n ? (w.avg / 1000).toFixed(1) : '–', w.n]; })) });
    } else hs.innerHTML = '<p class="muted small qz-empty">Answer speed appears after your first right answers.</p>';
    [hx, ht, hs].forEach(wireTips);
  }

  // ---- home ----
  function paintHomeBody() {
    var b = el('qz-homebody');
    if (!b) return;
    root.querySelectorAll('[data-qzh]').forEach(function (t) {
      var on = t.getAttribute('data-qzh') === homeTab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    if (homeTab === 'topics') b.innerHTML = topicsHTML();
    else if (homeTab === 'progress') { b.innerHTML = progressHTML(); drawCharts(); }
    else b.innerHTML = pathHTML();
    paintSound();
  }

  function setHomeTab(t) {
    homeTab = t;
    App.store.set('qz.home', t);
    selNode = -1;
    paintHomeBody();
    if (t === 'path') showCurrentNode();
  }

  // ---- sprints: 60 seconds, as many right answers as you can ----
  // endless: the same pick of level, questions until the first miss
  function startSprint(i, endless) {
    var nd = NODES[i], p = prog(), lvl = nd.levels[0];
    nd.levels.forEach(function (l) { if (passed(p, l)) lvl = l; });
    startLevel(lvl.id, { sprint: i, endless: !!endless });
  }

  function tickSprint() {
    if (!cur || !cur.sprint || cur.sprint.done) return;
    if (cur.sprint.endless) {
      var n = cur.res.filter(Boolean).length, ce = el('qz-count'), b = cur.sprint.best;
      if (ce) ce.textContent = 'Streak ' + n + (b ? (n > b ? ' · new record' : ' · best ' + b) : '') + (cur.clock ? ' · ' + cur.clock.now.toFixed(1) + ' s' : '');
      return;
    }
    var left = Math.max(0, cur.sprint.end - Date.now()), f = el('qz-timefill');
    if (f) f.style.width = (100 * left / 60000).toFixed(2) + '%';
    var c = el('qz-count');
    if (c) c.textContent = cur.res.filter(Boolean).length + ' right · ' + Math.ceil(left / 1000) + ' s';
    if (left <= 0) finishSprint();
  }

  function stopSprint() {
    if (cur && cur.sprint) { clearInterval(cur.sprint.timer); cur.sprint.timer = 0; }
  }

  // ---- the answer clock: a countdown per question (Endless streaks, drills) ----
  // trains instant recognition: no time to count lines or hunt for the key
  var CLOCKS = [0, 8, 5, 3];
  function clockSetting() { var c = +App.store.get('qz.clock', 5); return CLOCKS.indexOf(c) >= 0 ? c : 5; }
  function endKey(nodeId, clock) { return 'end:' + nodeId + (clock ? '@' + clock : ''); }
  function recKey(k) { // 'node' = sprint, 'end:node' / 'end:node@5' = endless (untimed / 5 s clock)
    var m = /^(end:)?(.*?)(?:@(\d+))?$/.exec(k);
    return { end: !!m[1], node: NODE_BY_ID[m[2]], clock: +m[3] || 0 };
  }
  // more time where the question takes longer to take in: listening, finding notes
  function clockExtra(q) { return q.ear ? 3 : q.kind === 'set' ? 5 : q.kind === 'choice' ? 0 : 3; }
  // nothing ticks while the question is out of sight: another page, the app
  // in the background, a sheet (Lights & help, metronome) or a help tour on top
  function covered() { return document.hidden || App.active !== 'quiz' || !!App.sheet || !!(window.Help && Help.isOpen && Help.isOpen()); }
  function startClock() {
    stopClock();
    var c = cur && cur.clock;
    if (!c || cur.answered || view !== 'run' || covered()) return;
    c.len = (c.now + clockExtra(cur.q)) * 1000;
    c.end = Date.now() + c.len;
    c.q = cur.q;
    c.timer = setInterval(tickClock, 100);
    tickClock();
  }
  function stopClock() { if (cur && cur.clock && cur.clock.timer) { clearInterval(cur.clock.timer); cur.clock.timer = 0; } }
  function tickClock() {
    var c = cur && cur.clock;
    if (!c || !c.timer) return;
    if (cur.answered || cur.q !== c.q || view !== 'run' || covered()) { stopClock(); return; }
    var left = Math.max(0, c.end - Date.now()), f = el('qz-clockfill');
    if (f) { f.style.width = (100 * left / c.len).toFixed(2) + '%'; f.classList.toggle('low', left < 1500); }
    if (left <= 0) { stopClock(); cur.timedOut = true; resolve(false, null); }
  }
  // back in sight: a fresh clock (and the sound, if it never got to play)
  function resumeQ() {
    if (!cur || view !== 'run' || cur.answered || covered()) return;
    if (cur.q.auto && cur.autoPlayed !== cur.q) { cur.autoPlayed = cur.q; playQ(cur.q); }
    startClock();
  }
  function endlessLabel(nd) {
    var eb = XP().sprintBest(endKey(nd.id, clockSetting()));
    return '<span class="qz-inf" aria-hidden="true">∞</span> Endless streak' + (eb ? ' · best ' + eb : '');
  }
  function clockPicker() {
    var c = clockSetting();
    return '<div class="qz-clockrow"><span class="qz-clocklab">Answer clock<small>Endless streak and drills · a miss when time runs out</small></span>' +
      '<div class="seg qz-clockseg" role="group" aria-label="Answer clock">' + CLOCKS.map(function (v) {
        return '<button type="button" data-qzclock="' + v + '" class="' + (v === c ? 'active' : '') + '" aria-pressed="' + (v === c) + '">' + (v ? v + ' s' : 'Off') + '</button>';
      }).join('') + '</div></div>';
  }

  function finishSprint() {
    if (!cur || !cur.sprint || cur.sprint.done) return;
    var sp = cur.sprint;
    sp.done = true;
    stopSprint();
    stopClock();
    clearTimeout(advT);
    var score = cur.res.filter(Boolean).length, rec = XP().sprintRecord(sp.key, score);
    cur.rec = rec;
    cur.fin = XP().finishLevel({ record: rec.isBest && score > 0 });
    cur.xp += cur.fin.bonus;
    cur.score = score;
    view = 'done';
    render();
    reveal(root);
  }

  // XP fly-up next to the footer on a right answer
  function xpPop(r) {
    var f = el('qz-act');
    if (!f || !r.xp) return;
    var s = document.createElement('span');
    s.className = 'qz-xppop';
    s.textContent = '+' + r.xp + ' XP' + (r.fast ? ' · quick' : '');
    f.parentNode.insertBefore(s, f);
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 1300);
  }

  function paintRunXP() {
    var e = el('qz-xpp');
    if (!e || !cur) return;
    e.innerHTML = (cur.combo >= 3 && !(cur.sprint && cur.sprint.endless) ? '<span class="qz-combo">' + ico('flame', 14) + cur.combo + ' in a row</span>' : '') +
      '<span class="qz-xpn">' + ico('bolt', 14) + cur.xp + ' XP</span>';
  }

  // ---- results ----
  function doneStats() {
    var avg = cur.times.length ? cur.times.reduce(function (a, b) { return a + b; }, 0) / cur.times.length : 0;
    return '<div class="qz-dstats">' +
      tile('bolt', 'XP earned', '+' + cur.xp) +
      (cur.sprint ? tile('star', 'Record', String((cur.rec || {}).best || cur.score)) : tile('clock', 'Time', fmtTime(cur.ms))) +
      tile('faster', 'Per right answer', avg ? secs(avg) : '–') + '</div>';
  }

  function doneNotes() {
    var X = XP(), f = cur.fin || {}, st = X.streak(), t = X.today(), g = X.goal(), out = [];
    if (f.extended && st.n) out.push([st.n === 1 ? 'Day 1 of a new streak.' : st.n + '-day streak. Keep it going tomorrow.', 'flame']);
    if (f.freezeEarned) out.push(['You earned a streak freeze. It covers one missed day.', 'snow']);
    if (f.goalHit) out.push(['Daily goal reached: ' + t.x + ' XP today.', 'check']);
    else if (t.x < g) out.push([t.x + ' of ' + g + ' XP toward today’s goal.', 'star']);
    var avg = cur.times.length ? cur.times.reduce(function (a, b) { return a + b; }, 0) / cur.times.length : 0;
    if (avg >= 300 && cur.times.length >= 3 && cur.prevSpeed && cur.prevSpeed.n >= 5) {
      var d = (cur.prevSpeed.avg - avg) / 1000;
      if (Math.abs(d) >= 0.1) out.push([Math.abs(d).toFixed(1) + ' s ' + (d > 0 ? 'faster' : 'slower') + ' than your usual on ' + cur.lvl.unit.name + '.', d > 0 ? 'faster' : 'slower']);
    }
    return '<ul class="qz-dnotes">' + out.map(function (o) { return '<li>' + ico(o[1], 16) + '<span>' + esc(o[0]) + '</span></li>'; }).join('') + '</ul>';
  }

  // ================= events =================

  function onClick(e) {
    var t = e.target.closest ? e.target.closest('button') : null;
    if (!t || t.disabled) return;
    var a;
    if ((a = t.getAttribute('data-qzt'))) { topicId = a; view = 'topic'; render(); reveal(root); return; }
    if ((a = t.getAttribute('data-qzu'))) {
      var o = openUnits[topicId] || (openUnits[topicId] = {});
      o[a] = !o[a];
      repaintUnit(a, true);
      return;
    }
    if ((a = t.getAttribute('data-qzm'))) { var pr = a.split('|'); openMode[pr[0]] = pr[1]; repaintUnit(pr[0], false); return; }
    if ((a = t.getAttribute('data-qzh'))) { setHomeTab(a); return; }
    if ((a = t.getAttribute('data-qzn'))) { selectNode(+a); return; }
    if ((a = t.getAttribute('data-qzsprint'))) { startSprint(+a); return; }
    if ((a = t.getAttribute('data-qzendless'))) { var ck = t.getAttribute('data-qzclk'); if (ck != null) App.store.set('qz.clock', +ck); startSprint(+a, true); return; }
    if ((a = t.getAttribute('data-qzclock'))) {
      App.store.set('qz.clock', +a);
      root.querySelectorAll('[data-qzclock]').forEach(function (b) { var on = b === t; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
      var eb = root.querySelector('.qz-npop [data-qzendless]');
      if (eb) eb.innerHTML = endlessLabel(NODES[+eb.getAttribute('data-qzendless')]); // its best is per clock
      return;
    }
    if ((a = t.getAttribute('data-qzkeys'))) { App.switchTo('piano'); if (App.keysLessons) App.keysLessons.open(a); var kc = document.querySelector('.kl-card'); if (kc) kc.scrollIntoView({ block: 'start' }); return; }
    if ((a = t.getAttribute('data-qzapply'))) { var ap = applyFor(a); if (ap) ap.go(); return; }
    if ((a = t.getAttribute('data-qzjump'))) { startLevel(NODES[+a].levels[0].id, { jump: +a }); return; }
    if ((a = t.getAttribute('data-qzgoal'))) { XP().setGoal(+a); paintHomeBody(); var sh = root.querySelector('.qz-strip'); if (sh) sh.outerHTML = statsStrip(); return; }
    if ((a = t.getAttribute('data-qzl'))) { startLevel(a); return; }
    if ((a = t.getAttribute('data-qzc'))) { answerChoice(a); return; }
    if ((a = t.getAttribute('data-qzs'))) { App.store.set('qz.sound', a); paintSound(); return; }
    if ((a = t.getAttribute('data-qzlearn'))) {
      var box = el('qz-learn-' + a);
      if (box) { box.hidden = !box.hidden; t.setAttribute('aria-expanded', String(!box.hidden)); }
      return;
    }
    switch (t.id) {
      case 'qz-home': view = 'home'; render(); reveal(root); break;
      case 'qz-tohome': stopSprint(); toPath(cur ? cur.lvl.node.i : null); break;
      case 'qz-cont': break; // carries data-qzl (path frontier)
      case 'qz-back': back(); break;
      case 'qz-hear': if (cur) playQ(cur.q); break;
      case 'qz-act': if (!cur) break; if (cur.answered) nextQ(); else resolve(false, null); break;
      case 'qz-check': checkTaps(); break;
      case 'qz-clear': if (cur) { cur.tap = {}; cur.got = {}; paintAns(); } break;
      case 'qz-retry': if (cur) startLevel(cur.lvl.id); break;
      case 'qz-drill': if (cur && cur.drillPool.length) startLevel(cur.lvl.id, { drill: cur.drillPool.slice() }); break;
    }
  }

  // keys and frets sound on PRESS, like every instrument in the app
  function onPointer(e) {
    if (view !== 'run' || !cur || cur.answered) return;
    var k = e.target.closest ? e.target.closest('.qz-key, .qz-fz') : null;
    if (!k) return;
    e.preventDefault();
    if (k.classList.contains('qz-key')) {
      var m = +k.getAttribute('data-m');
      sound(m, 0, 1.0, 0.5);
      inputNote(m, 'tap');
    } else {
      var s = +k.getAttribute('data-s'), f = +k.getAttribute('data-f');
      sound(OPEN[s] + f, 0, 1.1, 0.5, true);
      inputNote(OPEN[s] + f, 'tap', { s: s, f: f });
    }
  }

  function onKey(e) {
    if (view !== 'run' || !cur) {
      if (e.key === 'Escape' && view !== 'home') { back(); e.preventDefault(); }
      return;
    }
    if (e.key >= '1' && e.key <= '9') {
      var c = cur.q.choices && cur.q.choices[+e.key - 1];
      if (c) { answerChoice(c.id); e.preventDefault(); }
    } else if (e.key === ' ') {
      playQ(cur.q);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (cur.answered) nextQ(); else if (cur.q.kind === 'set') checkTaps();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      back();
      e.preventDefault();
    }
  }

  var CSS =
    '@font-face{font-family:SLMusic;src:url(fonts/slmusic.woff2) format("woff2");font-display:block}' +
    '.qz-view{max-width:880px;margin:0 auto}' +
    '.qz-in{animation:qz-in .18s ease-out}' +
    '@keyframes qz-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}' +
    '.qz-bar{display:block;height:5px;border-radius:3px;background:var(--card2);overflow:hidden}' +
    '.qz-bar i{display:block;height:100%;background:var(--accent);border-radius:3px}' +
    '.qz-backlink{display:inline-flex;align-items:center;gap:6px;padding:6px 8px;margin-left:-8px;border:0;border-radius:8px;background:transparent;color:var(--muted);font:600 14px var(--font-body);cursor:pointer}' +
    '.qz-backlink:hover,.qz-backlink:focus-visible{color:var(--text);background:var(--card2)}' +
    // home
    '.qz-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px 20px;align-items:center}' +
    '.qz-hero h2{margin:0 0 6px}' +
    '.qz-sub{margin:0;color:var(--muted);font-size:14px;line-height:1.45}' +
    '.qz-heroact{display:grid;justify-items:end;gap:6px}' +
    '.qz-go{padding:12px 26px;font-size:16px}' +
    '.qz-nextup{font-size:12.5px;color:var(--muted);text-align:right}' +
    '.qz-herofoot{grid-column:1/-1;display:flex;align-items:center;gap:12px;padding-top:12px;border-top:1px solid var(--line-soft)}' +
    '.qz-total{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}' +
    '.qz-sound{margin-left:auto}' +
    '.qz-sound button{padding:5px 12px;font-size:13px}' +
    '.qz-topics{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}' +
    '.qz-topic{display:grid;grid-template-rows:auto 1fr auto;gap:8px;text-align:left;padding:16px 18px;border-radius:var(--radius);border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;cursor:pointer;transition:border-color .12s ease}' +
    '.qz-topic:hover,.qz-topic:focus-visible{border-color:var(--accent)}' +
    '.qz-tname{font-family:var(--font-display);font-size:23px;letter-spacing:1px;text-transform:uppercase;line-height:1}' +
    '.qz-tblurb{font-size:13.5px;line-height:1.45;color:var(--muted)}' +
    '.qz-tfoot{display:flex;align-items:center;gap:10px}' +
    '.qz-tfoot .qz-bar{flex:1}' +
    '.qz-tmeta{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}' +
    // topic
    '.qz-tophead{display:flex;align-items:center;gap:12px;margin-bottom:14px}' +
    '.qz-ttl{margin:0;font-family:var(--font-display);font-size:26px;font-weight:600;letter-spacing:1px;text-transform:uppercase;line-height:1}' +
    '.qz-units{display:grid;gap:10px}' +
    '.qz-unit{padding:0;margin:0;overflow:hidden}' +
    '.qz-uhead{display:flex;align-items:center;gap:14px;width:100%;padding:16px 18px;border:0;background:transparent;color:var(--text);font:inherit;text-align:left;cursor:pointer}' +
    '.qz-uhead:hover .qz-uname,.qz-uhead:focus-visible .qz-uname{color:var(--accent)}' +
    '.qz-uname{flex:1;min-width:0;font-weight:600;font-size:16px}' +
    '.qz-ubar{width:72px;flex:none}' +
    '.qz-ucount{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums;min-width:32px;text-align:right}' +
    '.qz-chev{display:inline-flex;color:var(--muted);transition:transform .18s ease}' +
    '.qz-unit.open .qz-chev{transform:rotate(180deg)}' +
    '.qz-ubody{display:grid;gap:10px;padding:0 18px 18px}' +
    '.qz-urow{display:flex;align-items:center;gap:10px}' +
    '.qz-mchips{display:flex;flex-wrap:wrap;gap:6px;flex:1;min-width:0}' +
    '.qz-mchip{cursor:pointer;color:var(--label)}' +
    '.qz-tick{color:var(--green);font-weight:700}' +
    '.qz-learnbtn{flex:none;border:0;background:transparent;color:var(--accent);font:600 13.5px var(--font-body);padding:6px 4px;cursor:pointer}' +
    '.qz-learnbtn:hover,.qz-learnbtn:focus-visible{text-decoration:underline;text-underline-offset:3px}' +
    '.qz-learn{font-size:14px;line-height:1.55;background:var(--card2);border-radius:10px;padding:2px 14px}' +
    '.qz-lvls{display:grid;gap:6px}' +
    '.qz-lvl{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:11px 12px;border:1px solid transparent;border-radius:10px;background:var(--card2);color:var(--text);font:inherit;cursor:pointer;transition:border-color .12s ease}' +
    '.qz-lvl:hover,.qz-lvl:focus-visible{border-color:var(--accent)}' +
    '.qz-lvl .n{font-family:var(--font-display);font-size:19px;color:var(--accent);min-width:18px;text-align:center}' +
    '.qz-lvl .t{flex:1;min-width:0}' +
    '.qz-lvl .st{color:var(--accent);letter-spacing:1px;white-space:nowrap}' +
    '.qz-lvl .sc{color:var(--muted);font-size:12.5px;font-variant-numeric:tabular-nums}' +
    '.qz-lvl .go{display:inline-flex;color:var(--muted);opacity:.55}' +
    // run
    '.qz-runhead{display:flex;align-items:center;gap:10px}' +
    '.qz-lvltag{font-size:12.5px;color:var(--muted)}' +
    '.qz-count{margin-left:auto;font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}' +
    '.qz-prog{display:flex;gap:4px;margin:8px 0 12px}' +
    '.qz-prog i{flex:1;height:6px;border-radius:3px;background:var(--card2);transition:background-color .2s ease}' +
    '.qz-prog i.ok{background:var(--green)}.qz-prog i.bad{background:var(--red)}.qz-prog i.cur{background:var(--accent)}' +
    '.qz-stage{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;padding:24px 22px 16px}' +
    '.qz-q{display:grid;grid-template-columns:minmax(0,1fr);gap:18px;justify-items:center;text-align:center}' +
    '.qz-prompt{display:flex;align-items:center;justify-content:center;gap:10px;font-size:21px;font-weight:600;text-wrap:balance}' +
    '.qz-hear{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;flex:none;border-radius:50%;border:1px solid var(--ctl-border);background:var(--card2);color:var(--accent);cursor:pointer}' +
    '.qz-hear:hover,.qz-hear:focus-visible{border-color:var(--accent)}' +
    '.qz-earbtn{display:inline-flex;align-items:center;justify-content:center;width:84px;height:84px;border-radius:50%;border:2px solid var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--card2));color:var(--accent);cursor:pointer;transition:transform .1s ease}' +
    '.qz-earbtn:active{transform:scale(.96)}' +
    '.qz-earbtn .ic{margin-left:4px}' +
    '.qz-vis{width:100%;display:flex;justify-content:center;color:var(--text)}' +
    '.qz-vis:empty{display:none}' +
    '.qz-ans{width:100%;display:grid;grid-template-columns:minmax(0,1fr);justify-items:center}' +
    '.qz-choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(124px,40%),1fr));gap:8px;width:100%;max-width:640px}' +
    '.qz-choices.two{max-width:380px}' +
    '.qz-ch{position:relative;min-height:52px;padding:10px 14px;border-radius:12px;border:1px solid var(--ctl-border);background:var(--card2);color:var(--text);font:600 16px/1.25 var(--font-body);cursor:pointer;transition:border-color .12s ease,background-color .15s ease,opacity .15s ease}' +
    '.qz-ch:hover:not(:disabled),.qz-ch:focus-visible{border-color:var(--accent)}' +
    '.qz-ch .k{display:none}' +
    '@media (hover:hover) and (pointer:fine){.qz-ch .k{display:block;position:absolute;top:5px;left:8px;font-size:10px;font-weight:600;color:var(--muted);opacity:.7}}' +
    '.qz-ch.ok{border-color:var(--green);background:color-mix(in srgb,var(--green) 22%,var(--card2))}' +
    '.qz-ch.bad{border-color:var(--red);background:color-mix(in srgb,var(--red) 22%,var(--card2))}' +
    '.qz-ch.dim{opacity:.4}' +
    '.qz-ch:disabled{cursor:default}' +
    '.qz-foot{display:flex;align-items:center;gap:14px;min-height:52px;padding-top:14px;border-top:1px solid var(--line-soft)}' +
    '.qz-fb{flex:1;min-width:0;font-size:14.5px;line-height:1.45;text-align:left}' +
    '.qz-fb.ok{color:var(--green)}.qz-fb.bad{color:var(--red)}' +
    '.qz-act{flex:none;min-width:132px}' +
    '.qz-act.qz-quiet{background:transparent;box-shadow:none;color:var(--muted);border-color:transparent}' +
    '.qz-act.qz-quiet:hover{color:var(--text);border-color:var(--ctl-border)}' +
    '.qz-acts{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;align-items:center}' +
    '.qz-board{display:grid;gap:10px;grid-template-columns:minmax(0,1fr);justify-items:center;width:100%}' +
    '.qz-hint{font-size:13px;color:var(--muted)}' +
    // done
    '.qz-done{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;justify-items:center;text-align:center;padding:28px 22px 18px}' +
    '.qz-big{font-family:var(--font-display);font-size:68px;line-height:1;font-variant-numeric:tabular-nums;margin-top:6px}' +
    '.qz-big span{font-size:28px;color:var(--muted)}' +
    '.qz-stars{font-size:28px;color:var(--accent);letter-spacing:6px}' +
    '.qz-verdict{font-size:18px;font-weight:600}' +
    '.qz-miss{font-size:14px;max-width:520px;line-height:1.5}' +
    '.qz-done .qz-acts{margin-top:10px}' +
    '.qz-done .qz-backlink{margin:4px 0 0}' +
    // notation, keys, neck
    // the staff is a picture: its glyph boxes overflow the SVG (clef, ledger
    // notes) and must never swallow taps meant for the play button above it
    '.qz-staff{max-width:100%;height:auto;overflow:visible;pointer-events:none}' +
    '.qz-sl{stroke:currentColor;stroke-width:1.4}.qz-ledger{stroke:currentColor;stroke-width:1.9}' +
    '.qz-mu{font-family:SLMusic;font-size:48px;fill:currentColor}' +
    '.qz-mu.qz-okn{fill:var(--green)}' +
    '.qz-keys{max-width:100%;height:auto;touch-action:none;user-select:none;-webkit-user-select:none}' +
    '.qz-key{cursor:pointer}' +
    '.qz-kw{fill:#f7f3ea;stroke:#b9b0a2;stroke-width:1}.qz-kb{fill:#221d20;stroke:#000;stroke-width:1}' +
    '.qz-key.mk-a{fill:var(--accent)}.qz-key.mk-b{fill:var(--teal)}.qz-key.mk-on{fill:var(--blue)}' +
    '.qz-key.mk-ok{fill:var(--green)}.qz-key.mk-bad{fill:var(--red)}' +
    '.qz-kl{font:600 10px var(--font-body);fill:#8d8375;text-anchor:middle;pointer-events:none}' +
    '.qz-neckwrap{width:100%;overflow-x:auto;display:flex}.qz-neckwrap>svg{margin:0 auto}' +
    '.qz-neck{max-width:100%;height:auto;touch-action:none;user-select:none;-webkit-user-select:none}' +
    '.qz-fret{stroke:var(--muted);stroke-width:1.5}.qz-nut{stroke:var(--text);stroke-width:4}' +
    '.qz-str{stroke:var(--label,var(--muted))}.qz-str.hi{stroke:var(--accent)}' +
    '.qz-inlay{fill:var(--line)}' +
    '.qz-fnum{font:600 10px var(--font-body);fill:var(--muted);text-anchor:middle}' +
    '.qz-sname{font:600 10px var(--font-body);fill:var(--muted);text-anchor:middle}.qz-sname.hi{fill:var(--accent)}' +
    '.qz-fz{fill:transparent;cursor:pointer}' +
    '.qz-nm{stroke:var(--card);stroke-width:2;pointer-events:none}' +
    '.qz-nm.mk-a{fill:var(--accent)}.qz-nm.mk-ok{fill:var(--green)}.qz-nm.mk-bad{fill:var(--red)}' +
    // game layer: stats strip, home tabs, path, run XP, sprint, results, progress
    '.qz-strip{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;gap:10px 22px;align-items:center;padding:16px 20px}' +
    '.qz-stat{display:flex;align-items:center;gap:10px;min-width:0}' +
    '.qz-stat b{display:block;font:600 22px/1.1 var(--font-body);font-variant-numeric:tabular-nums}' +
    '.qz-stat b small{font-size:14px;color:var(--muted);font-weight:500}' +
    '.qz-stat span{font-size:12.5px;color:var(--muted)}' +
    '.qz-stat>.ic{color:var(--muted)}.qz-stat.lit>.ic{color:var(--accent);fill:color-mix(in srgb,var(--accent) 30%,transparent)}' +
    '.qz-ring .trk{fill:none;stroke:var(--card2);stroke-width:5}.qz-ring .val{fill:none;stroke:var(--accent);stroke-width:5;stroke-linecap:round;transition:stroke-dashoffset .4s ease}' +
    '.qz-stat .qz-lvbadge{display:grid;place-items:center;width:40px;height:40px;flex:none;border-radius:12px;background:var(--accent);color:#221302;font:400 24px/1 var(--font-display)}' +
    '.qz-lvtext{display:grid;gap:4px;min-width:0;flex:1}.qz-lvtext b{font-size:15px}' +
    '.qz-stripnote{grid-column:1/-1;margin:0;padding-top:10px;border-top:1px solid var(--line-soft);font-size:13.5px;color:var(--muted)}' +
    '.qz-hometabs{display:flex;width:100%;margin:2px 0 14px}.qz-hometabs button{flex:1}' +
    '.qz-tabnote{margin:0 0 12px;color:var(--muted);font-size:14px}' +
    '.qz-path{display:grid;gap:22px}' +
    '.qz-psec{display:grid;gap:8px}' +
    '.qz-pban{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:2px 12px;padding:14px 18px;border-radius:var(--radius);background:color-mix(in srgb,var(--accent) 14%,var(--card));border:1px solid color-mix(in srgb,var(--accent) 30%,var(--line))}' +
    '.qz-eyebrow{grid-column:1/-1;font-size:11.5px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:var(--accent)}' +
    '.qz-pban h3{margin:0;font:400 26px/1 var(--font-display);letter-spacing:1px;text-transform:uppercase}' +
    '.qz-pmeta{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}' +
    '.qz-pnodes{display:grid;gap:6px;padding:10px 0}' +
    '.qz-nwrap{display:grid;justify-items:center;gap:10px;--zz:min(54px,12vw)}' +
    '.qz-node{position:relative;display:grid;justify-items:center;gap:6px;padding:4px;border:0;background:transparent;color:var(--text);font:inherit;cursor:pointer;transform:translateX(calc(var(--x) * var(--zz)));-webkit-tap-highlight-color:transparent}' +
    '.qz-ndisc{display:grid;place-items:center;width:68px;height:68px;border-radius:50%;background:conic-gradient(var(--accent) var(--p),var(--card2) 0);transition:transform .12s ease}' +
    '.qz-nface{display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:var(--card);color:var(--accent);box-shadow:inset 0 -3px 0 color-mix(in srgb,var(--text) 10%,transparent)}' +
    '.qz-node:hover .qz-ndisc,.qz-node:focus-visible .qz-ndisc{transform:scale(1.06)}' +
    '.qz-node:active .qz-ndisc{transform:scale(.97)}' +
    '.qz-node.done .qz-nface{background:var(--accent);color:#221302}' +
    '.qz-node.cur .qz-ndisc{box-shadow:0 0 0 5px color-mix(in srgb,var(--accent) 25%,transparent)}' +
    '.qz-node.locked{cursor:pointer}.qz-node.locked .qz-ndisc{background:var(--card2)}.qz-node.locked .qz-nface{color:var(--muted);background:var(--card2);box-shadow:none}' +
    '.qz-node.locked .qz-nlbl{color:var(--muted)}' +
    '.qz-node.sel .qz-ndisc{outline:2px solid var(--accent);outline-offset:3px}' +
    '.qz-nlbl{display:grid;font-size:13px;font-weight:600;line-height:1.25;text-align:center;max-width:150px}.qz-nlbl small{font-weight:500;color:var(--muted);font-size:12px}' +
    '.qz-nstart{position:absolute;top:-24px;left:50%;transform:translateX(-50%);padding:3px 10px;border-radius:8px;background:var(--accent);color:#221302;font:600 11px/1.4 var(--font-body);letter-spacing:1px;text-transform:uppercase;white-space:nowrap;animation:qz-bob 1.6s ease-in-out infinite}' +
    '.qz-nstart::after{content:"";position:absolute;left:50%;bottom:-5px;margin-left:-5px;border:5px solid transparent;border-bottom:0;border-top-color:var(--accent)}' +
    '@keyframes qz-bob{0%,100%{transform:translate(-50%,0)}50%{transform:translate(-50%,-3px)}}' +
    '.qz-node.cur{margin-top:22px}' +
    '.qz-npop{width:min(440px,100%);margin:0;display:grid;gap:10px;padding:14px}' +
    '.qz-npophead{display:grid}.qz-npophead span{font-size:13px;color:var(--muted)}' +
    '.qz-lockmsg{display:flex;gap:8px;align-items:flex-start;margin:0;font-size:14px;color:var(--muted)}.qz-lockmsg .ic{flex:none;margin-top:2px}' +
    '.qz-npop .qz-acts{justify-content:flex-start}' +
    '.qz-xpp{display:flex;gap:8px;align-items:center;margin-left:auto;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}' +
    '.qz-xpp+.qz-count{margin-left:0}' +
    '.qz-xpn,.qz-combo{display:inline-flex;align-items:center;gap:3px}.qz-xpn{color:var(--accent)}.qz-combo{color:var(--text)}.qz-combo .ic{color:var(--accent)}' +
    '.qz-xppop{position:absolute;right:14px;bottom:100%;font:600 14px var(--font-body);color:var(--accent);pointer-events:none;animation:qz-pop 1.2s ease-out forwards}' +
    '.qz-foot{position:relative}' +
    '@keyframes qz-pop{0%{opacity:0;transform:translateY(6px)}15%{opacity:1}100%{opacity:0;transform:translateY(-22px)}}' +
    '.qz-timebar{height:8px;margin:8px 0 12px;border-radius:4px;background:var(--card2);overflow:hidden}' +
    '.qz-timebar i{display:block;height:100%;width:100%;background:var(--accent);border-radius:4px;transition:width .1s linear}' +
    '.qz-clock{height:6px;margin:6px 0 10px}.qz-clock i.low{background:var(--red)}' +
    '.qz-clockrow{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;width:100%;margin-top:4px}.qz-clocklab{display:grid;font-size:13.5px;font-weight:600}' +
    '.qz-clocklab small{font-weight:500;color:var(--muted);font-size:12px}.qz-done .qz-clockrow{justify-content:center;text-align:center}' +
    '.qz-dstats,.qz-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(150px,45%),1fr));gap:10px;width:100%;max-width:560px}' +
    '.qz-tiles{max-width:none;margin-bottom:12px}' +
    '.qz-tile{display:grid;gap:2px;padding:12px 14px;border-radius:12px;background:var(--card2);text-align:left;position:relative}' +
    '.qz-tileic{position:absolute;top:12px;right:12px;color:var(--accent)}' +
    '.qz-tilelab{font-size:12.5px;color:var(--muted)}.qz-tileval{font:600 20px/1.2 var(--font-body)}.qz-tilesub{font-size:12px;color:var(--muted)}' +
    '.qz-dnotes{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:6px;text-align:left;max-width:520px}' +
    '.qz-dnotes li{display:flex;gap:8px;align-items:flex-start;font-size:14.5px}.qz-dnotes .ic{flex:none;margin-top:2px;color:var(--accent)}' +
    '.qz-prog2{display:grid;gap:12px}' +
    '.qz-pcard{margin:0;display:grid;gap:12px}' +
    '.qz-pchead{display:grid;gap:2px}.qz-pchead h3{margin:0;font-size:16px;color:var(--text);letter-spacing:.3px;text-transform:none}' +
    '.qz-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;max-width:420px}' +
    '.qz-wday{display:grid;justify-items:center;gap:4px;font-size:12px;color:var(--muted)}' +
    '.qz-wdot{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--card2);color:var(--muted)}' +
    '.qz-wday.done .qz-wdot{background:var(--accent);color:#221302}' +
    '.qz-wday.frozen .qz-wdot{background:color-mix(in srgb,var(--blue) 30%,var(--card2));color:var(--text)}' +
    '.qz-wday.today .qz-wdot{box-shadow:inset 0 0 0 2px var(--accent)}' +
    '.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
    '.qz-goals{display:flex;flex-wrap:wrap;width:fit-content;max-width:100%}.qz-goals small{color:var(--muted);font-weight:500;margin-left:2px}' +
    '.qz-xprules{margin:0}' +
    '.qz-chart{position:relative;min-width:0}' +
    '.qz-svg{display:block;overflow:visible}' +
    '.qz-grid{stroke:var(--line);stroke-width:1}.qz-goalline{stroke:var(--muted);stroke-width:1}' +
    '.qz-axis{font:500 11px var(--font-body);fill:var(--muted)}.qz-val{font:600 12px var(--font-body);fill:var(--text)}' +
    '.qz-nlearn{margin:2px 0 10px;border:1px solid var(--line);border-radius:10px;padding:0 12px}.qz-nlearn summary{cursor:pointer;padding:9px 0;font-weight:600;font-size:14px}.qz-nlearn .qz-learn{padding:0 0 10px;font-size:14px}.qz-nlearn .qz-learn p{margin:0 0 8px}' +
    '.qz-donelinks{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 18px}' +
    '.qz-areas{display:grid;gap:6px;margin-top:12px}.qz-arow{display:grid;grid-template-columns:90px minmax(0,1fr) 62px;align-items:center;gap:10px;font-size:13.5px}.qz-arow b{font-weight:600;text-align:right;font-variant-numeric:tabular-nums}' +
    '.qz-abar{height:8px;border-radius:4px;background:var(--card2);overflow:hidden}.qz-abar i{display:block;height:100%;border-radius:4px;background:var(--accent)}' +
    '.qz-rec .qz-klbar{flex:none;display:block;width:70px;height:6px;border-radius:3px;background:var(--line);overflow:hidden}.qz-klbar i{display:block;height:100%;background:var(--accent);border-radius:3px}' +
    '.qz-halo{paint-order:stroke;stroke:var(--card);stroke-width:4px;stroke-linejoin:round}.qz-tnote{margin:8px 0 0}' +
    '.qz-barm{fill:var(--accent)}.qz-linem{fill:none;stroke:var(--accent);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}' +
    '.qz-area{fill:var(--accent);opacity:.1}.qz-dot{fill:var(--accent);stroke:var(--card);stroke-width:2}' +
    '.qz-hit{fill:transparent;cursor:default}.qz-hit:hover{fill:color-mix(in srgb,var(--text) 6%,transparent)}' +
    '.qz-tip{position:absolute;top:0;padding:5px 9px;border-radius:8px;background:var(--text);color:var(--card);font-size:12.5px;font-weight:600;white-space:nowrap;pointer-events:none;transform:translateY(-100%)}' +
    '.qz-empty{margin:0}' +
    '.qz-tbl summary{cursor:pointer;font-size:13px;color:var(--muted);margin-top:4px}' +
    '.qz-tblwrap{overflow-x:auto}' +
    '.qz-table{width:100%;border-collapse:collapse;font-size:13.5px;font-variant-numeric:tabular-nums}' +
    '.qz-table th,.qz-table td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}' +
    '.qz-table thead th{font-size:12px;color:var(--muted);font-weight:600}' +
    '.qz-chg{display:inline-flex;align-items:center;gap:3px;font-weight:600}.qz-chg.up{color:var(--green)}.qz-chg.down{color:var(--red)}' +
    '.qz-recs{list-style:none;margin:0;padding:0;display:grid;gap:6px}' +
    '.qz-rec{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border:1px solid transparent;border-radius:10px;background:var(--card2);color:var(--text);font:inherit;text-align:left;cursor:pointer}' +
    '.qz-rec:hover,.qz-rec:focus-visible{border-color:var(--accent)}' +
    '.qz-rec span{flex:1;display:grid}.qz-rec small{color:var(--muted)}.qz-rec b{font-size:18px;font-variant-numeric:tabular-nums}.qz-rec .ic{color:var(--accent)}' +
    '.qz-inf{font-weight:700;font-size:17px;line-height:1}.qz-rec .qz-inf{flex:none;display:inline;width:15px;text-align:center;color:var(--accent)}' +
    '@media (max-width:640px){' +
      '.qz-strip{grid-template-columns:auto minmax(0,1fr);gap:12px 14px;padding:14px}.qz-lvstat{grid-column:1/-1}.qz-strip .qz-go{grid-column:1/-1;justify-self:stretch}' +
      '.qz-ndisc{width:62px;height:62px}.qz-nface{width:50px;height:50px}' +
      '.qz-hero{grid-template-columns:minmax(0,1fr)}.qz-heroact{justify-items:stretch}.qz-nextup{text-align:left}' +
      '.qz-ubar{display:none}.qz-uhead{padding:14px 14px}.qz-ubody{padding:0 14px 14px}' +
      '.qz-lvltag{display:none}' +
      '.qz-stage{padding:18px 14px 14px}.qz-prompt{font-size:19px}' +
      '.qz-foot{flex-wrap:wrap}.qz-fb{flex-basis:100%}.qz-fb:empty{display:none}.qz-act{flex:1}' +
      '.qz-dstats{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.qz-dstats .qz-tile{padding:10px}.qz-dstats .qz-tileic{display:none}.qz-dstats .qz-tileval{font-size:18px}' +
      '.qz-ttopic th:nth-child(2),.qz-ttopic td:nth-child(2){display:none}.qz-table th,.qz-table td{padding:7px 6px}' +
      '.qz-chgw{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
    '}';

  function init(rootEl) {
    root = rootEl;
    App.injectCSS('quiz', CSS);
    // playing on other pages: say so when it makes the day count / hits the goal
    App.on('xp:practice', function (r) {
      var t = r.dayDone ? (r.streak > 1 ? 'Today counts: 5 minutes played. ' + r.streak + '-day streak.' : 'Today counts: 5 minutes played.')
        + (r.freezeEarned ? ' You earned a streak freeze.' : '') : 'Daily goal reached.';
      var e = document.getElementById('xp-toast');
      if (!e) { e = document.createElement('div'); e.id = 'xp-toast'; e.setAttribute('role', 'status'); document.body.appendChild(e); }
      e.textContent = t;
      clearTimeout(e._t);
      e._t = setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 4000);
    });
    root.addEventListener('click', onClick);
    document.addEventListener('visibilitychange', function () { if (document.hidden) stopClock(); else resumeQ(); });
    App.on('sheet', function (d) { if (d && d.open) stopClock(); else resumeQ(); });
    App.on('tour', function (d) { if (d && d.open) stopClock(); else resumeQ(); });
    root.addEventListener('pointerdown', onPointer);
    // decode the piano bank on the first touch here, ahead of the first question
    root.addEventListener('pointerdown', function () { if (App.keys && App.keys.warm) App.keys.warm(); }, true);
    inputRoute = App.midi ? App.midi.inputId : null;
    App.on('midi:state', function () {
      var route = App.midi ? App.midi.inputId : null;
      if (route === inputRoute) return; // output-only changes cannot re-arm a held key
      inputRoute = route;
      Object.keys(inputHeld).forEach(function (key) {
        if (key.indexOf('midi:') === 0) delete inputHeld[key];
      });
    });
    App.on('midi:note', function (d) {
      if (!d || !Number.isInteger(d.midi) || d.midi < 0 || d.midi > 127) return;
      var src = d.silent ? 'tone' : 'midi';
      var pitch = src + ':' + d.midi, channel = d.chan == null ? 0 : d.chan;
      var held = inputHeld[pitch];
      if (!d.on) {
        if (held) { delete held[channel]; if (!Object.keys(held).length) delete inputHeld[pitch]; }
        return; // releases never answer a question
      }
      var fresh = !held;
      if (!held) held = inputHeld[pitch] = {};
      held[channel] = true; // record before inputNote can advance to another question
      if (fresh && App.active === 'quiz') inputNote(d.midi, src);
    });
    if (document.fonts && document.fonts.load) {
      document.fonts.load('48px SLMusic').then(function () { if (view === 'run' && cur) paintVis(); }, function () { /* fallback glyphs */ });
    }
    render();
    // charts are drawn at their real pixel width — redraw when it changes
    window.addEventListener('resize', function () {
      clearTimeout(chartT);
      chartT = setTimeout(function () { if (App.active === 'quiz' && view === 'home' && homeTab === 'progress') drawCharts(); }, 150);
    });
    // new in 0.69: land here once so the course is the first thing seen
    if (!App.store.get('qz.landed', false)) {
      App.store.set('qz.landed', true);
      setTimeout(function () { if (App.space === 'practice' && App.active !== 'quiz') App.switchTo('quiz'); }, 0);
    }
  }

  // test + console hook
  window.SLQuiz = {
    levels: function () { return LEVELS.map(function (l) { return l.id; }); },
    gen: function (lid) { var l = BY_ID[lid]; return l ? GEN[l.gen](l.o) : null; },
    start: startLevel,
    pick: answerChoice,
    get q() { return cur ? cur.q : null; },
    get view() { return view; },
    get cur() { return cur; },
    nodes: function () { return NODES.map(function (n) { return n.id; }); },
    node: function (i) { var n = NODES[i], p = prog(); return n ? { id: n.id, first: n.levels[0].id, open: unlocked(i, p), done: nodeDone(n, p), levels: n.levels.length } : null; },
    current: function () { return currentNode(prog()); },
    sprint: startSprint,
    endless: function (i) { startSprint(i, true); },
    clock: function (s) { if (s != null) App.store.set('qz.clock', s); return clockSetting(); },
    tab: setHomeTab,
    finishSprint: finishSprint,
    theory: { nt: nt, midiOf: midiOf, nm: nm, addIv: addIv, IV: IV, buildChord: buildChord, buildScale: buildScale, keyChords: keyChords, KEYS: KEYS }
  };

  App.register('quiz', {
    init: init,
    onShow: function () {
      // a focused space: silence the metronome / jam / loops while here
      App.emit('transport:claim', { owner: 'quiz' });
      if (App.midi && App.midi.hideLayout) App.midi.hideLayout('quiz', view === 'run');
      if (view !== 'run') {
        render();
        if (view === 'home' && homeTab === 'path' && window.pageYOffset < 60) showCurrentNode();
      } else resumeQ(); // a fresh clock for the question you left
    },
    onHide: function () {
      clearTimeout(advT);
      stopClock();
      if (cur && cur.sprint && !cur.sprint.done && view === 'run') finishSprint();
      if (App.midi && App.midi.hideLayout) App.midi.hideLayout('quiz', false);
    },
    onBack: function () {
      if (view !== 'home') { back(); return true; }
      if (selNode >= 0) { selNode = -1; paintHomeBody(); return true; }
      if (homeTab !== 'path') { setHomeTab('path'); return true; }
      return false;
    },
    onKey: onKey
  });
})();
