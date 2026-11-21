/* soundLAB 2.0 Phase B, step B1b: the instrument drawings of docs/design/phase-b/.
 * The first draft of js/hero.js (docs/plans/phase-b/PLAN.md, decision D29; table B3.1).
 * Read the headers of mock.css and mock.js first.
 *
 * Three drawing functions and ONE lighting model. The functions return markup (a string).
 * They read no DOM, no store and no App, and they hold no colour: every colour in the
 * markup is one that was passed in (a note's colour, set inline as --c on its element) or
 * comes from a token in CSS, through the classes below. Under Node the file is a module
 * (require), in a page it is window.SLHero.
 *
 *     <script src="mock.js"></script>
 *     <script src="mock-hero.js"></script>
 *     var m = SLHero.sample({ root: 9, steps: Mock.DATA.SCALES.dorian.steps, help: 3,
 *               intervals: Mock.DATA.COLORS.INTERVALS, notes: Mock.DATA.COLORS.NOTES });
 *     el.innerHTML = '<div class="sl-hero">' + SLHero.keyboard(m, { from: 57, octaves: 2 }) + '</div>';
 *   The box with class sl-hero is the stage (--sl-stage) and gives the instrument its size:
 *   a keyboard and the pads fill its width and height, a neck fills its width and keeps
 *   its own proportions.
 *
 * THE LIGHTING MODEL: SLHero.model(input)
 *   input, all optional:
 *     root     the pitch class of the key's root, 0 = C … 11 = B
 *     scale    the pitch classes that are in the scale, e.g. [9, 11, 0, 2, 4, 6, 7]
 *     help     the Help level: 4 Full, 3 Colors, 2 Target, 1 Tonic, 0 None (left out: 4)
 *     mode     'interval' (on screen: Degree) or 'note' (Note name). It names what the
 *              colours and labels were made for; the functions only pass it on (data-mode)
 *     color    function (pitchClass) -> '#rrggbb': the note's colour, in the app
 *              App.colors.forPitch (so it is already the colour a LUMI shows)
 *     label    function (pitchClass) -> what stands inside a lit note, in the app
 *              App.colors.label: 'R', '2', '♭3' … in Degree mode, the note's name otherwise
 *     name     function (pitchClass) -> the note's name ('F#', 'Bb'), for the words a
 *              screen reader gets, the string names and nothing else
 *     now, next, press, right, wrong     lists of places. A place is
 *              a MIDI note number           the key with that number; on a neck every spot
 *                                           of the drawn part that has this pitch; on the
 *                                           pads the lane whose midi it is
 *              { string: i, fret: f }       one spot of a neck (string 0 = the lowest)
 *              { lane: i }                  one pad (0 … 7)
 *     labelsFrom, nextFrom   see "the Help level" below (left out: 4 and 3)
 *   The model answers two questions, and that is all the drawing functions ask it:
 *     model.stateOf(place)  ->  '' | 'now' | 'next' | 'press' | 'right' | 'wrong'
 *                               (one state: wrong, right, now, press, next, in this order)
 *     model.at(place)       ->  { pc, inScale, root, dot, state, color, label, ink, name }
 *                               place = { midi, string, fret }; root = the root's mark is
 *                               drawn; dot = a scale dot is drawn; ink = 'dark' | 'light'
 *
 * THE HELP LEVEL decides what a drawing shows, the same on screen and on a LUMI
 *   (js/midi.js wanted(): the scale from Colors up, the root at Tonic and Target, "now"
 *   from Target up, "next" from Colors up; js/piano.js: labels at Full only):
 *     4 Full     the scale's dots with their labels, the root, now, next
 *     3 Colors   the scale's dots, the root, now, next
 *     2 Target   the root, and the note to play now
 *     1 Tonic    the root
 *     0 None     nothing
 *   Pressed, right and wrong show at every level. Two numbers can be passed to the model
 *   to draw another reading: labelsFrom (3 = labels from Colors up, as the letter of D30
 *   says) and nextFrom (2 = "next" at Target too, as D32 says). A page that wants its
 *   instrument never empty (the home, D21) passes help: Math.max(3, level).
 *
 * THE VOCABULARY (decision D30) is classes; the rules are in the drawings' CSS
 *   (instruments.html, under "for mock.css") and go into css/components.css in B3:
 *     .is-scale   in the scale: a dot in the note's colour with a dark ring
 *     .is-root    the root: a thicker ring
 *     .is-now     play this now: the key or the pad is filled with its colour and has an
 *                 ink ring; on a neck the dot gets an ink ring around it
 *     .is-next    next: an empty ring in the note's colour
 *     .is-press   a key, a spot or a pad that is held down
 *     .is-right, .is-wrong   the judgement colour (--sl-ok, --sl-bad) with its mark
 *     .is-ink-light   the label takes --sl-ink-on-color-light (the colour is dark)
 *   No ring, outline or glow in the accent inside an instrument.
 *
 * SLHero.keyboard(model, opts) -> HTML: <div class="sl-kbd"> with one .sl-key per key
 *     from      the first key, a MIDI number (60 = C4). A black key becomes the white one below
 *     octaves   how many octaves follow; the key that closes the last one is drawn too
 *               (from 57, octaves 2: A3 … A5). Left out: 2
 *     to        the last key instead of octaves (a black key becomes the white one above)
 *     names     false: no octave names ("C4") under the keys
 *     label     the words for a screen reader, instead of the ones the function writes
 *   Parts: .sl-key (ivory), .sl-key.sl-key-b (ebony, written after the ivory keys so they
 *   lie on top without a layer number), .sl-dot (the dot, its label inside),
 *   .sl-mark (the mark of right and wrong), .sl-kbd-name (an octave's name).
 *   The grid has three columns per ivory key; the function sets each key's columns inline.
 *
 * SLHero.neck(model, opts) -> SVG: <svg class="sl-neck">, drawn lying flat (the nut on the
 *   left, the highest string on top, as tab is written) and turned as one group for upright
 *     strings   the open strings' MIDI numbers, lowest first: 6, 5 or 4 of them.
 *               Left out: a guitar, [40, 45, 50, 55, 59, 64]
 *     frets     how many frets are drawn (left out: 12)
 *     first     0 = from the nut, with a column for the open strings (left out);
 *               n = the drawn part starts at fret n (a position, without nut)
 *     fretless  true: no fret wires; a note then sits where the wire would be
 *     upright   true: the nut on top, the lowest string on the left (the app's phone view)
 *     lefty     true: the strings in the other order
 *     names, numbers   false: no string names, no fret numbers
 *     fretW, gap       the width of a fret and the distance of two strings in the drawing's
 *                      own units (46 and 30, the numbers of js/fretboard.js)
 *     label     as above
 *   Parts: .sl-neck-string, .sl-neck-fret, .sl-neck-nut, .sl-neck-inlay, .sl-neck-name,
 *   .sl-neck-num; a lit spot is <g class="sl-pos is-…" style="--c:…"> with .sl-pos-ring (the
 *   ring of "now"), .sl-pos-rim (the root's fine line), .sl-pos-dot, .sl-pos-label and
 *   .sl-pos-mark inside.
 *
 * SLHero.pads(model, opts) -> HTML: <div class="sl-pads"> with one .sl-pad per lane
 *     lanes     [{ name, hint, midi, color }]: SLHero.LANES holds the app's eight lanes
 *               without colours (the caller adds them: a lane's colour is data)
 *     cols      columns of the grid (left out: 4, which makes the app's 4 x 2)
 *     label     as above
 *   A pad is a drum, not a note: it has no root, and its colour is its lane's. Its colour
 *   mark shows from Colors up, like a scale dot. Parts: .sl-pad, .sl-pad-dot,
 *   .sl-pad-name, .sl-pad-hint, .sl-mark.
 *
 * SLHero.inkOn('#rrggbb') -> 'dark' | 'light': which of the two inks of css/tokens.css
 *   (--sl-ink-on-color, --sl-ink-on-color-light) has the better contrast on that colour.
 *
 * DRAWING-ONLY (does not go into js/hero.js; the app builds its model from Theory and
 *   App.colors): SLHero.sample(spec) makes a model from a key and a palette:
 *     spec = { root, steps, help, mode, intervals, notes, now, next, press, right, wrong }
 *     steps      the scale's semitones above the root (Mock.DATA.SCALES[id].steps)
 *     intervals  twelve colours, by semitone above the root (Mock.DATA.COLORS.INTERVALS)
 *     notes      twelve colours, C … B (Mock.DATA.COLORS.NOTES)
 */
(function () {
  'use strict';

  // ---- notes ------------------------------------------------------------------------
  var WHITE = [0, 2, 4, 5, 7, 9, 11];
  // js/theory.js:35-37: a key whose root is one of the six flat keys names its notes flat
  var SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var FLAT_KEYS = [1, 3, 5, 6, 8, 10];
  // js/note-palette.js:15: what App.colors.label gives in Degree mode
  var INTERVAL_LABELS = ['R', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];
  // the Help level from which each thing shows (see the header)
  var HELP = { ROOT: 1, NOW: 2, SCALE: 3, NEXT: 3, LABELS: 4 };
  // js/daw/engine.js:24 (DAW.DRUM_LANES) and js/pads.js:30-31, :80, :124: a pad's name, the
  // computer key that plays it, and its key on a keyboard in the white-key layout from C3
  var LANES = [
    { name: 'Kick', hint: 'Z · C3', midi: 48 }, { name: 'Snare', hint: 'X · D3', midi: 50 },
    { name: 'Clap', hint: 'C · E3', midi: 52 }, { name: 'Hat', hint: 'V · F3', midi: 53 },
    { name: 'Open hat', hint: 'A · G3', midi: 55 }, { name: 'Low tom', hint: 'S · A3', midi: 57 },
    { name: 'Hi tom', hint: 'D · B3', midi: 59 }, { name: 'Crash', hint: 'F · C#3', midi: 49 }
  ];

  function mod12(n) { return ((n % 12) + 12) % 12; }
  function isWhite(midi) { return WHITE.indexOf(mod12(midi)) !== -1; }
  function pcName(pc, flat) { return (flat ? FLAT : SHARP)[mod12(pc)]; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return String(Math.round(n * 100) / 100); }
  function list(v) { return v == null ? [] : (Object.prototype.toString.call(v) === '[object Array]' ? v.slice() : [v]); }

  // ---- which ink reads on a colour -----------------------------------------------------
  // The relative luminance (WCAG 2) of the two inks of css/tokens.css: --sl-ink-on-color
  // (#1a1206) and --sl-ink-on-color-light (#ffffff). Numbers, not colours: the suite of B3
  // keeps them equal to the tokens.
  var INK_L = { dark: 0.00666, light: 1 };
  function luminance(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return null;
    var lin = function (v) { v = parseInt(v, 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
  }
  function inkOn(hex) {
    var L = luminance(hex);
    if (L == null) return 'dark';
    return (INK_L.light + 0.05) / (L + 0.05) > (L + 0.05) / (INK_L.dark + 0.05) ? 'light' : 'dark';
  }

  // ---- the lighting model ----------------------------------------------------------------
  function model(input) {
    input = input || {};
    var root = input.root == null ? null : mod12(input.root);
    var flat = root != null && FLAT_KEYS.indexOf(root) !== -1;
    var help = parseInt(input.help, 10);
    var fn = function (f, fallback) { return typeof f === 'function' ? f : fallback; };
    var m = {
      root: root,
      scale: list(input.scale).map(mod12),
      help: help >= 0 && help <= 4 ? help : 4,
      mode: input.mode === 'note' ? 'note' : 'interval',
      labelsFrom: input.labelsFrom == null ? HELP.LABELS : +input.labelsFrom,
      nextFrom: input.nextFrom == null ? HELP.NEXT : +input.nextFrom,
      now: list(input.now), next: list(input.next), press: list(input.press), right: list(input.right), wrong: list(input.wrong),
      color: fn(input.color, function () { return null; }),
      label: fn(input.label, function () { return ''; }),
      name: fn(input.name, function (pc) { return pcName(pc, flat); })
    };
    var has = function (places, at) {
      return places.some(function (p) {
        if (typeof p === 'number') return at.midi != null && p === at.midi;
        if (p && p.lane != null) return at.lane != null && p.lane === at.lane;
        return !!p && at.string != null && p.string === at.string && p.fret === at.fret;
      });
    };
    m.stateOf = function (at) {
      if (has(m.wrong, at)) return 'wrong';
      if (has(m.right, at)) return 'right';
      if (m.help >= HELP.NOW && has(m.now, at)) return 'now';
      if (has(m.press, at)) return 'press';
      if (m.help >= m.nextFrom && has(m.next, at)) return 'next';
      return '';
    };
    m.at = function (at) {
      var pc = mod12(at.midi), inScale = m.scale.indexOf(pc) !== -1, isRoot = m.root != null && pc === m.root;
      var state = m.stateOf(at);
      var rootMark = isRoot && m.help >= HELP.ROOT;
      var dot = inScale && (m.help >= HELP.SCALE || rootMark);
      // a held key takes its colour only when it is in the scale, as today (js/piano.js:659-660)
      var lit = dot || state === 'now' || state === 'next' || (state === 'press' && inScale);
      var color = lit ? m.color(pc) : null;
      var label = color && m.help >= m.labelsFrom ? String(m.label(pc) || '') : '';
      return { pc: pc, inScale: inScale, root: rootMark && (dot || !!state), dot: dot, state: state, color: color || null, label: label,
        ink: color ? inkOn(color) : 'dark', name: m.name(pc) };
    };
    return m;
  }

  // the words a screen reader gets: what the lights say, in the order a player needs it
  function midiName(m, midi) { return m.name(mod12(midi)) + (Math.floor(midi / 12) - 1); }
  function describe(m, what, places) {
    var parts = [what];
    var names = function (ps, each) { return ps.map(each).filter(function (t) { return t; }).join(', '); };
    var place = places || function (p) { return typeof p === 'number' ? midiName(m, p) : ''; };
    if (m.help >= HELP.SCALE && m.scale.length) parts.push('In the scale: ' + m.scale.map(function (pc) { return m.name(pc); }).join(', '));
    if (m.help >= HELP.ROOT && m.root != null) parts.push('The root is ' + m.name(m.root));
    [['now', 'Play now', m.help >= HELP.NOW], ['next', 'Next', m.help >= m.nextFrom], ['press', 'Held', true], ['right', 'Right', true], ['wrong', 'Wrong', true]].forEach(function (s) {
      var t = s[2] ? names(m[s[0]], place) : '';
      if (t) parts.push(s[1] + ': ' + t);
    });
    return parts.join('. ') + '.';
  }
  function head(cls, m, label) {
    return ' class="' + cls + '" role="img" aria-label="' + esc(label) + '" data-help="' + m.help + '" data-mode="' + m.mode + '"';
  }
  function stateClasses(s) {
    return (s.dot ? ' is-scale' : '') + (s.root ? ' is-root' : '') + (s.state ? ' is-' + s.state : '');
  }

  // ---- the keyboard ------------------------------------------------------------------------
  function keyboard(m, opts) {
    opts = opts || {};
    var from = opts.from == null ? 48 : Math.round(opts.from);
    if (!isWhite(from)) from -= 1;
    var to = opts.to == null ? from + 12 * (opts.octaves == null ? 2 : Math.max(0, opts.octaves)) : Math.round(opts.to);
    if (to < from) to = from;
    if (!isWhite(to)) to += 1;
    var whites = '', blacks = '', names = '', n = 0;
    for (var midi = from; midi <= to; midi++) {
      var white = isWhite(midi), s = m.at({ midi: midi });
      // the label's ink follows the colour it stands on; inside an empty ring it stands on the key
      var filled = s.color && s.state !== 'next' && s.state !== 'right' && s.state !== 'wrong';
      var inner = s.state === 'right' || s.state === 'wrong' ? '<span class="sl-mark"></span>'
        : s.color ? '<span class="sl-dot' + (filled && s.ink === 'light' ? ' is-ink-light' : '') + '">' + esc(s.label) + '</span>' : '';
      var col = white ? (3 * n + 1) + ' / span 3' : (3 * n) + ' / span 2';
      var key = '<div class="sl-key' + (white ? '' : ' sl-key-b') + stateClasses(s) + '" data-midi="' + midi + '" style="' +
        (s.color ? '--c:' + s.color + ';' : '') + 'grid-column:' + col + '">' + inner + '</div>';
      if (white) {
        whites += key;
        if (opts.names !== false && mod12(midi) === 0) names += '<span class="sl-kbd-name" style="grid-column:' + col + '">C' + (Math.floor(midi / 12) - 1) + '</span>';
        n++;
      } else blacks += key;
    }
    var label = opts.label || describe(m, 'A keyboard from ' + midiName(m, from) + ' to ' + midiName(m, to));
    return '<div' + head('sl-kbd', m, label) + ' style="grid-template-columns:repeat(' + (3 * n) + ', minmax(0, 1fr))">' + whites + blacks + names + '</div>';
  }

  // ---- the neck ------------------------------------------------------------------------------
  // Laid out lying flat, in the numbers of js/fretboard.js (:32-37, :46): a column for the
  // string names, one for the open strings, then one per fret; the highest string on top.
  // Upright turns the whole group a quarter clockwise (the nut on top, the lowest string
  // on the left) and turns every text back.
  function neck(m, opts) {
    opts = opts || {};
    var strings = (opts.strings && opts.strings.length ? opts.strings : [40, 45, 50, 55, 59, 64]).slice();
    var S = strings.length, N = Math.max(1, opts.frets == null ? 12 : Math.round(opts.frets)), first = Math.max(0, Math.round(opts.first || 0));
    var fretless = !!opts.fretless, upright = !!opts.upright, lefty = !!opts.lefty;
    var showNames = opts.names !== false, showNums = opts.numbers !== false;
    var FRET_W = opts.fretW || 46, GAP = opts.gap || 30;
    var LABEL_W = showNames ? 30 : 20, OPEN_W = first ? 0 : 40, TOP = 26, NUM_H = showNums ? 34 : 26, END = fretless ? 24 : 16;
    var nutX = LABEL_W + OPEN_W, endX = nutX + N * FRET_W, W = endX + END, H = TOP + (S - 1) * GAP + NUM_H;
    var boardTop = TOP - 15, boardBot = TOP + (S - 1) * GAP + 15;
    var fretOf = function (col) { return col === 0 ? 0 : first ? first + col - 1 : col; };
    // a fretted note lies between two wires; without wires it lies where the wire would be
    var colX = function (col) { return col === 0 ? LABEL_W + OPEN_W / 2 : nutX + (fretless ? col : col - 0.5) * FRET_W; };
    var rowY = function (r) { return TOP + (lefty ? S - 1 - r : r) * GAP; };
    var up = function (x, y) { return upright ? ' transform="rotate(-90 ' + num(x) + ' ' + num(y) + ')"' : ''; };
    var line = function (cls, x1, y1, x2, y2, extra) {
      return '<line class="' + cls + '" x1="' + num(x1) + '" y1="' + num(y1) + '" x2="' + num(x2) + '" y2="' + num(y2) + '"' + (extra || '') + '/>';
    };
    var text = function (cls, x, y, t) {
      return '<text class="' + cls + '" x="' + num(x) + '" y="' + num(y) + '" dy="0.35em" text-anchor="middle"' + up(x, y) + '>' + esc(t) + '</text>';
    };
    var s = '', col, r, i;

    // inlays: one at frets 3, 5, 7, 9, 15, 17, 19, 21, two at 12 and 24, between two strings.
    // An inlay that a lit spot on a neighbouring string would cover in part is left out: half
    // an inlay beside a dot reads as a fault of the dot
    var mid = (S - 1) / 2, odd = S % 2 === 1;
    var reach = function (v, c) {      // how far a lit spot in the v-th row from the top reaches at this fret (its
      if (v < 0 || v > S - 1) return 0;      // radius below plus half its line); 0 = nothing is lit there
      var si = lefty ? v : S - 1 - v, fr = fretOf(c), q = m.at({ midi: strings[si] + fr, string: si, fret: fr });
      if (!q.dot && !q.state) return 0;
      return q.state === 'now' ? 20.5 : q.root && !q.state ? 16 : q.state === 'press' ? 14 : q.state ? 13.5 : 12.5;
    };
    var covered = function (yv, c) {
      var a = Math.floor(yv), b = Math.ceil(yv), ra = reach(a, c), rb = reach(b, c);
      return (ra && (yv - a) * GAP - 5 < ra) || (rb && (b - yv) * GAP - 5 < rb);
    };
    for (col = 1; col <= N; col++) {
      var f = fretOf(col), ys = [3, 5, 7, 9, 15, 17, 19, 21].indexOf(f) !== -1 ? [odd ? mid - 0.5 : mid]
        : f === 12 || f === 24 ? (odd ? [mid - 1.5, mid + 1.5] : [mid - 1, mid + 1]) : [];
      for (i = 0; i < ys.length; i++) {
        if (!covered(ys[i], col)) s += '<circle class="sl-neck-inlay" cx="' + num(colX(col)) + '" cy="' + num(TOP + ys[i] * GAP) + '" r="5"/>';
      }
    }
    // fret wires; the nut, or at a position the wire the drawn part starts at
    if (!fretless) {
      for (col = first ? 0 : 1; col <= N; col++) s += line('sl-neck-fret', nutX + col * FRET_W, boardTop, nutX + col * FRET_W, boardBot);
    }
    if (!first) s += line('sl-neck-nut', nutX, boardTop, nutX, boardBot);
    // strings (row 0 = the highest, on top), thicker the lower they sound, and their names
    for (r = 0; r < S; r++) {
      var si = S - 1 - r, y = rowY(r);
      s += line('sl-neck-string', nutX, y, endX + (fretless ? END - 8 : 0), y, ' stroke-width="' + num(Math.max(1, Math.min(3.8, 1 + (64 - strings[si]) / 15))) + '"');
      if (showNames) s += text('sl-neck-name', LABEL_W / 2, y, m.name(mod12(strings[si])));
    }
    if (showNums) for (col = 1; col <= N; col++) s += text('sl-neck-num', colX(col), boardBot + 14, fretOf(col));
    // the lit spots; the note to play now is written last, so its ring lies over its neighbours
    var spots = '', onTop = '';
    for (r = 0; r < S; r++) {
      var sIdx = S - 1 - r, cy = rowY(r);
      for (col = first ? 1 : 0; col <= N; col++) {
        var fret = fretOf(col), p = m.at({ midi: strings[sIdx] + fret, string: sIdx, fret: fret });
        var judged = p.state === 'right' || p.state === 'wrong';
        if (!p.dot && !p.state) continue;
        var cx = colX(col), at = ' cx="' + num(cx) + '" cy="' + num(cy) + '"';
        // the root's rim: a fine line in its colour that hugs the thicker dark ring. The ring of
        // "now" stands off the dot, so the two are told apart without colour
        var rim = p.root && (!p.state || p.state === 'now');
        var rDot = p.state === 'press' ? 14 : judged ? 12.5 : p.state === 'next' ? 11 : rim ? 12 : p.state === 'now' ? 12.5 : 11.5;
        var g = '<g class="sl-pos' + stateClasses(p) + '" data-string="' + sIdx + '" data-fret="' + fret + '"' + (p.color ? ' style="--c:' + p.color + '"' : '') + '>';
        if (p.state === 'now') g += '<circle class="sl-pos-ring"' + at + ' r="19"/>';
        if (rim) g += '<circle class="sl-pos-rim"' + at + ' r="15"/>';
        g += '<circle class="sl-pos-dot"' + at + ' r="' + rDot + '"/>';
        if (judged) {
          g += '<path class="sl-pos-mark"' + up(cx, cy) + ' d="' + (p.state === 'right'
            ? 'M' + num(cx - 5.5) + ' ' + num(cy + 0.5) + 'l3.6 3.8l7 -8'
            : 'M' + num(cx - 4.5) + ' ' + num(cy - 4.5) + 'l9 9M' + num(cx + 4.5) + ' ' + num(cy - 4.5) + 'l-9 9') + '"/>';
        } else if (p.label) {
          g += '<text class="sl-pos-label' + (p.state !== 'next' && p.ink === 'light' ? ' is-ink-light' : '') + '" x="' + num(cx) + '" y="' + num(cy) + '" dy="0.35em" text-anchor="middle"' + up(cx, cy) + '>' + esc(p.label) + '</text>';
        }
        if (p.state === 'now') onTop += g + '</g>'; else spots += g + '</g>';
      }
    }
    var where = function (p) {
      if (typeof p === 'number') return midiName(m, p);
      if (!p || p.string == null || p.string < 0 || p.string >= S) return '';
      return midiName(m, strings[p.string] + p.fret) + ' (' + m.name(mod12(strings[p.string])) + ' string, ' + (p.fret ? 'fret ' + p.fret : 'open') + ')';
    };
    var label = opts.label || describe(m, 'A neck with ' + S + ' strings' + (fretless ? ', without fret wires' : '') + ', ' +
      (first ? 'frets ' + first + ' to ' + (first + N - 1) : 'from the nut to fret ' + N), where);
    return '<svg' + head('sl-neck' + (upright ? ' is-upright' : '') + (fretless ? ' is-fretless' : ''), m, label) + ' viewBox="0 0 ' + (upright ? num(H) + ' ' + num(W) : num(W) + ' ' + num(H)) +
      '" data-strings="' + S + '" xmlns="http://www.w3.org/2000/svg">' +
      '<g' + (upright ? ' transform="rotate(90) translate(0 ' + num(-H) + ')"' : '') + '>' + s + spots + onTop + '</g></svg>';
  }

  // ---- the pads ------------------------------------------------------------------------------
  function pads(m, opts) {
    opts = opts || {};
    var lanes = opts.lanes || [], cols = Math.max(1, opts.cols || 4), h = '';
    lanes.forEach(function (lane, i) {
      var state = m.stateOf({ lane: i, midi: lane.midi });
      var judged = state === 'right' || state === 'wrong', shown = m.help >= HELP.SCALE;
      var color = lane.color && (shown || state === 'now' || state === 'next' || state === 'press') ? lane.color : null;
      var filled = color && (state === 'now' || state === 'press');
      h += '<div class="sl-pad' + (shown && color ? ' is-scale' : '') + (state ? ' is-' + state : '') + (filled && inkOn(color) === 'light' ? ' is-ink-light' : '') + '" data-lane="' + i + '"' +
        (color && !judged ? ' style="--c:' + color + '"' : '') + '>' +
        (judged ? '<span class="sl-mark"></span>' : shown && color && !state ? '<span class="sl-pad-dot"></span>' : '') +
        '<span class="sl-pad-name">' + esc(lane.name) + '</span>' +
        (lane.hint ? '<span class="sl-pad-hint">' + esc(lane.hint) + '</span>' : '') + '</div>';
    });
    var padName = function (p) {
      var i = typeof p === 'number' ? -1 : p && p.lane, k;
      if (typeof p === 'number') for (k = 0; k < lanes.length; k++) if (lanes[k].midi === p) i = k;
      return lanes[i] ? lanes[i].name : '';
    };
    var parts = [lanes.length + ' pads: ' + lanes.map(function (l) { return l.name; }).join(', ')];
    [['now', 'Hit now', m.help >= HELP.NOW], ['next', 'Next', m.help >= m.nextFrom], ['press', 'Held', true], ['right', 'Right', true], ['wrong', 'Wrong', true]].forEach(function (st) {
      var t = st[2] ? m[st[0]].map(padName).filter(function (x) { return x; }).join(', ') : '';
      if (t) parts.push(st[1] + ': ' + t);
    });
    return '<div' + head('sl-pads', m, opts.label || parts.join('. ') + '.') + ' style="grid-template-columns:repeat(' + cols + ', minmax(0, 1fr))">' + h + '</div>';
  }

  // ---- drawing-only: a model from a key and a palette -----------------------------------------
  function sample(spec) {
    spec = spec || {};
    var root = mod12(spec.root == null ? 9 : spec.root), steps = spec.steps || [0, 2, 3, 5, 7, 9, 10];      // A Dorian
    var flat = FLAT_KEYS.indexOf(root) !== -1, byNote = spec.mode === 'note';
    var intervals = spec.intervals || [], notes = spec.notes || [];
    return model({
      root: root, scale: steps.map(function (st) { return root + st; }), help: spec.help, mode: spec.mode,
      labelsFrom: spec.labelsFrom, nextFrom: spec.nextFrom,
      now: spec.now, next: spec.next, press: spec.press, right: spec.right, wrong: spec.wrong,
      color: function (pc) { return (byNote ? notes[mod12(pc)] : intervals[mod12(pc - root)]) || null; },
      label: function (pc) { return byNote ? pcName(pc, flat) : INTERVAL_LABELS[mod12(pc - root)]; },
      name: function (pc) { return pcName(pc, flat); }
    });
  }

  var api = { model: model, keyboard: keyboard, neck: neck, pads: pads, inkOn: inkOn, luminance: luminance,
    HELP: HELP, INK_L: INK_L, LANES: LANES, INTERVAL_LABELS: INTERVAL_LABELS, sample: sample };
  if (typeof window !== 'undefined') window.SLHero = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
