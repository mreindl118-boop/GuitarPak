/* GuitarLab — Chords module, rebuilt around a real fretboard.
 * Card 1: chord explorer — a big horizontal neck (its own instance, separate
 *         from the practice fretboard) showing the selected chord voicing.
 *         Root/quality dropdowns + voicing chips + in-key chips select the
 *         chord; the app plays it (tap the neck = strum, tap a dot = that
 *         note). A theory panel spells the chord, names its function in the
 *         current key, and suggests a scale to solo with (one tap jumps to
 *         the Fretboard tab and starts practicing it).
 * Card 2: progression player — diatonic palette / presets build a chord
 *         track, played in a loop; the explorer neck follows the sounding
 *         chord live.
 * Registers as 'chords'. All ids/classes prefixed ch-, store keys 'ch.'.
 */
(function () {
  'use strict';

  var els = {};

  // 7-note scales only (diatonic() returns [] for the others).
  var SEVEN_NOTE_SCALES = Theory.SCALE_ORDER.filter(function (id) {
    return Theory.SCALES[id].steps.length === 7;
  });

  // ---------------- music-theory reference data ----------------

  // semitones-from-root -> chord-degree label (chord-tone context)
  var IV_LABELS = { 0: 'R', 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4',
    6: '♭5', 7: '5', 8: '♯5', 9: '6', 10: '♭7', 11: '7' };

  // scale-degree (0-based) -> harmonic function, worded for practice
  var FUNC_NAMES = [
    'tonic — home base',
    'supertonic — often sets up the dominant',
    'mediant — colors the tonic',
    'subdominant — moves away from home',
    'dominant — pulls back home',
    'submediant — the relative minor spot',
    'leading tone — tense, wants to resolve up'
  ];

  // quality -> scale that sings over it (same map the Jam page uses)
  var CHORD_SCALE = {
    maj: 'major', maj7: 'major', sus2: 'mixolydian', sus4: 'mixolydian',
    min: 'dorian', m7: 'dorian', mMaj7: 'melodicMinor',
    '7': 'mixolydian', m7b5: 'locrian', dim: 'locrian',
    dim7: 'harmonicMinor', aug: 'melodicMinor', augMaj7: 'melodicMinor'
  };

  // ---------------- state ----------------

  // explorer: the chord on the big neck (ch.libRoot/ch.libQuality keys kept
  // from the old library so users' last chord carries over)
  var ex = { rootPc: 0, quality: 'maj', shapes: [], shapeIdx: 0 };

  var st = {
    keyPc: 0,
    scaleId: 'major',
    sevenths: false,
    bpm: 90,
    barsPerChord: 1,
    track: []               // [{ rootPc, quality, roman }]
  };

  var play = {
    on: false,
    timer: null,            // setInterval id (25 ms scheduler)
    raf: null,              // requestAnimationFrame id (UI sync)
    nextTime: 0,            // audio-clock time of next beat
    chordIdx: 0,
    beat: 0,                // beat index within current chord (0-based)
    countLeft: 0,           // count-in beats remaining
    seq: [],                // snapshot: [{ chord, shape, voicing, bass, name }]
    queue: [],              // scheduled UI events: [{ time, idx }] (idx -1 = count-in)
    clickBus: null          // gain node so pending clicks die instantly on stop
  };

  var LOOKAHEAD = 0.15;     // seconds
  var TICK_MS = 25;

  // ---------------- helpers ----------------

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function clampBpm(v) {
    v = Math.round(Number(v));
    if (!isFinite(v)) v = 90;
    if (v < 40) v = 40;
    if (v > 240) v = 240;
    return v;
  }

  function validPc(v) {
    v = Number(v);
    return isFinite(v) ? Theory.mod12(Math.round(v)) : 0;
  }

  function chordLabel(c) {
    // Prefer the name computed by Theory in the key context the chord came from
    // (palette / preset), so "F#m" in E major doesn't turn into "Gbm" here.
    if (c.name) return c.name;
    return Theory.chordName(c.rootPc, c.quality, Theory.FLAT_KEYS.has(c.rootPc));
  }

  function showError(msg) {
    els.status.className = 'ch-status error';
    els.status.textContent = msg;
  }

  function clearStatus() {
    els.status.className = 'ch-status';
    els.status.textContent = '';
  }

  // ---------------- persistence ----------------

  function loadState() {
    var g = App.store.get;

    ex.rootPc = validPc(g('ch.libRoot', 0));
    var lq = g('ch.libQuality', 'maj');
    ex.quality = Theory.QUALITY_ORDER.indexOf(lq) !== -1 ? lq : 'maj';

    st.keyPc = validPc(g('ch.key', 0));
    var sc = g('ch.scale', 'major');
    st.scaleId = SEVEN_NOTE_SCALES.indexOf(sc) !== -1 ? sc : 'major';
    st.sevenths = !!g('ch.sevenths', false);
    st.bpm = clampBpm(g('ch.bpm', 90));
    st.barsPerChord = Number(g('ch.barsPerChord', 1)) === 2 ? 2 : 1;

    st.track = [];
    var tr = g('ch.track', []);
    if (Object.prototype.toString.call(tr) === '[object Array]') {
      tr.forEach(function (c) {
        if (c && typeof c.rootPc === 'number' && isFinite(c.rootPc) && Theory.QUALITIES[c.quality]) {
          st.track.push({
            rootPc: Theory.mod12(Math.round(c.rootPc)),
            quality: c.quality,
            roman: typeof c.roman === 'string' ? c.roman : '',
            name: typeof c.name === 'string' ? c.name : ''
          });
        }
      });
    }
  }

  function saveTrack() { App.store.set('ch.track', st.track); }

  // ---------------- key-degree coloring (shared language with the fretboard) ----------------

  var DEG_DEFAULTS = ['#ffab47', '#e8d44d', '#7ad97a', '#4cc9b0', '#6ea8fe', '#b48ef0', '#ff85b3'];
  var NON_KEY = '#8f867c';

  function degPalette() {
    var c = App.store.get('fb.colors', null);
    return (Array.isArray(c) && c.length === 7 &&
      c.every(function (x) { return /^#[0-9a-fA-F]{6}$/.test(x); })) ? c : DEG_DEFAULTS;
  }

  function keyInfo() {
    return Theory.scaleInfo(st.keyPc, st.scaleId, Theory.FLAT_KEYS.has(st.keyPc));
  }

  // { color, isKeyRoot, deg (1-based or 0 if outside the key) } for a pitch class
  function keyTone(info, pal, pc) {
    var step = info.pcToStep.get(pc);
    if (step === undefined) return { color: NON_KEY, isKeyRoot: false, deg: 0 };
    return { color: pal[step % 7], isKeyRoot: step === 0, deg: step + 1 };
  }

  // ---------------- small vertical diagram (the "now playing" box) ----------------

  function renderShapeSVG(shape) {
    var NS = 'http://www.w3.org/2000/svg';
    var kinfo = keyInfo();
    var pal = degPalette();
    var pf = Theory.FLAT_KEYS.has(st.keyPc);
    var tunMidi = Theory.TUNINGS.standard.midi;
    var SP_X = 13, SP_Y = 17, LEFT = 24, TOP = 30;
    var gw = SP_X * 5, gh = SP_Y * 5;
    var W = LEFT + gw + 12, H = TOP + gh + 8;

    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('class', 'ch-svg');

    function line(x1, y1, x2, y2, cls) {
      var l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1);
      l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      l.setAttribute('class', cls);
      svg.appendChild(l);
    }
    function text(x, y, str, cls, anchor) {
      var t = document.createElementNS(NS, 'text');
      t.setAttribute('x', x); t.setAttribute('y', y);
      t.setAttribute('class', cls);
      t.setAttribute('text-anchor', anchor || 'middle');
      t.textContent = str;
      svg.appendChild(t);
    }

    function noteDot(cx, cy, r, pc) {
      var tone = keyTone(kinfo, pal, pc);
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
      c.setAttribute('fill', tone.color);
      if (tone.isKeyRoot) {
        c.setAttribute('stroke', '#ffffff');
        c.setAttribute('stroke-width', '1.3');
      }
      svg.appendChild(c);
      var t = document.createElementNS(NS, 'text');
      t.setAttribute('x', cx); t.setAttribute('y', cy + 2.4);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('font-size', '6.6');
      t.setAttribute('font-weight', '700');
      t.setAttribute('fill', '#1c1206');
      t.textContent = Theory.pcName(pc, pf);
      svg.appendChild(t);
    }

    var f, s;
    for (f = 0; f <= 5; f++) line(LEFT, TOP + f * SP_Y, LEFT + gw, TOP + f * SP_Y, 'ch-line');
    for (s = 0; s < 6; s++) line(LEFT + s * SP_X, TOP, LEFT + s * SP_X, TOP + gh, 'ch-string');

    if (shape.baseFret === 1) {
      var nut = document.createElementNS(NS, 'rect');
      nut.setAttribute('x', LEFT - 1);
      nut.setAttribute('y', TOP - 3.5);
      nut.setAttribute('width', gw + 2);
      nut.setAttribute('height', 4);
      nut.setAttribute('class', 'ch-nut');
      svg.appendChild(nut);
    } else {
      text(LEFT - 6, TOP + SP_Y * 0.5 + 3.5, String(shape.baseFret), 'ch-fretnum', 'end');
    }

    for (s = 0; s < 6; s++) {
      var fr = shape.frets[s];
      var x = LEFT + s * SP_X;
      if (fr === -1) {
        text(x, TOP - 8, 'X', 'ch-xo', 'middle');
      } else if (fr === 0) {
        noteDot(x, TOP - 10.5, 4.6, Theory.mod12(tunMidi[s]));
      } else {
        var row = fr - shape.baseFret;
        if (row < 0) row = 0;
        if (row > 4) row = 4;
        noteDot(x, TOP + (row + 0.5) * SP_Y, 5.6, Theory.mod12(tunMidi[s] + fr));
      }
    }
    return svg;
  }

  // ---------------- card 1: chord explorer ----------------

  function curShape() {
    return ex.shapes.length ? ex.shapes[Math.min(ex.shapeIdx, ex.shapes.length - 1)] : null;
  }

  function exName() {
    return Theory.chordName(ex.rootPc, ex.quality, Theory.FLAT_KEYS.has(st.keyPc));
  }

  // the big horizontal neck: high e on top (tab orientation), 5-fret window
  function renderBoard() {
    els.board.innerHTML = '';
    var shape = curShape();
    if (!shape) {
      els.board.innerHTML = '<div class="muted small">No voicing available for ' + esc(exName()) + '.</div>';
      return;
    }
    var NS = 'http://www.w3.org/2000/svg';
    var kinfo = keyInfo();
    var pal = degPalette();
    var pf = Theory.FLAT_KEYS.has(st.keyPc);
    var tun = Theory.TUNINGS.standard.midi;
    var LEFT = 74, TOP = 24, ROW = 36, COLW = 100, COLS = 5;
    var gw = COLS * COLW, gh = 5 * ROW;
    var W = LEFT + gw + 16, H = TOP + gh + 40;
    var base = shape.baseFret;

    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'ch-bsvg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    function el(tag, attrs, txt) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      if (txt != null) e.textContent = txt;
      svg.appendChild(e);
      return e;
    }

    // neck
    el('rect', { x: LEFT, y: TOP - 8, width: gw, height: gh + 16, rx: 5, fill: 'var(--panel)',
                 stroke: 'var(--line)', 'stroke-width': 1 });

    // inlay markers on real fret numbers inside the window
    [3, 5, 7, 9, 12, 15, 17, 19].forEach(function (fN) {
      var c = fN - base;
      if (c < 0 || c >= COLS) return;
      var x = LEFT + (c + 0.5) * COLW;
      if (fN === 12) {
        el('circle', { cx: x, cy: TOP + gh * 0.32, r: 5, fill: 'var(--line)' });
        el('circle', { cx: x, cy: TOP + gh * 0.68, r: 5, fill: 'var(--line)' });
      } else {
        el('circle', { cx: x, cy: TOP + gh * 0.5, r: 5, fill: 'var(--line)' });
      }
    });

    // frets (vertical) + fret numbers underneath
    var c;
    for (c = 0; c <= COLS; c++) {
      el('line', { x1: LEFT + c * COLW, y1: TOP - 8, x2: LEFT + c * COLW, y2: TOP + gh + 8,
                   stroke: 'var(--line)', 'stroke-width': c === 0 && base === 1 ? 0 : 2 });
    }
    if (base === 1) { // nut
      el('rect', { x: LEFT - 4, y: TOP - 8, width: 6, height: gh + 16, rx: 2, fill: '#cfd6e4' });
    }
    for (c = 0; c < COLS; c++) {
      el('text', { x: LEFT + (c + 0.5) * COLW, y: TOP + gh + 30, 'text-anchor': 'middle',
                   'font-size': 13, 'font-weight': 700, fill: 'var(--muted)' }, String(base + c));
    }

    // strings: display row r=0 (top) = high e (s=5) ... r=5 (bottom) = low E (s=0)
    var names = ['e', 'B', 'G', 'D', 'A', 'E'];
    var r, s;
    for (r = 0; r < 6; r++) {
      s = 5 - r;
      var y = TOP + r * ROW;
      el('line', { x1: LEFT, y1: y, x2: LEFT + gw, y2: y,
                   stroke: 'var(--muted)', 'stroke-opacity': 0.75,
                   'stroke-width': (1 + s * 0.35).toFixed(2) });
      el('text', { x: 16, y: y + 4, 'text-anchor': 'middle', 'font-size': 12,
                   'font-weight': 700, fill: 'var(--muted)' }, names[r]);
    }

    // fingered / open / muted per string
    for (r = 0; r < 6; r++) {
      s = 5 - r;
      var fr = shape.frets[s];
      var y2 = TOP + r * ROW;
      if (fr === -1) {
        el('text', { x: 42, y: y2 + 5, 'text-anchor': 'middle', 'font-size': 15,
                     'font-weight': 700, fill: 'var(--muted)' }, '×');
        continue;
      }
      var midi = tun[s] + fr;
      var pc = Theory.mod12(midi);
      var tone = keyTone(kinfo, pal, pc);
      var cx = fr === 0 ? 42 : LEFT + (fr - base + 0.5) * COLW;
      var rad = fr === 0 ? 11 : 14;
      var dot = el('circle', { cx: cx, cy: y2, r: rad, fill: tone.color,
                               stroke: tone.isKeyRoot ? '#ffffff' : 'rgba(0,0,0,0.35)',
                               'stroke-width': tone.isKeyRoot ? 2 : 1 });
      dot.setAttribute('class', 'ch-bdot');
      dot.setAttribute('data-midi', midi);
      el('text', { x: cx, y: y2 + 3.8, 'text-anchor': 'middle', 'font-size': fr === 0 ? 9 : 10.5,
                   'font-weight': 700, fill: '#1c1206', 'pointer-events': 'none' },
         Theory.pcName(pc, pf));
    }
    els.board.appendChild(svg);
  }

  function renderShapeChips() {
    els.shapeSel.innerHTML = '';
    ex.shapes.forEach(function (shape, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip ch-shapechip' + (i === Math.min(ex.shapeIdx, ex.shapes.length - 1) ? ' active' : '');
      b.dataset.i = i;
      b.textContent = shape.label;
      els.shapeSel.appendChild(b);
    });
  }

  // in-key chips: the diatonic chords of the context-bar key
  function renderInKey() {
    els.inkey.innerHTML = '';
    var dia;
    try { dia = Theory.diatonic(st.keyPc, st.scaleId, st.sevenths); } catch (e) { dia = []; }
    if (!dia.length) {
      els.inkey.innerHTML = '<span class="muted small">Pick a 7-note scale in the bar above for in-key chords.</span>';
      return;
    }
    var pal = degPalette();
    dia.forEach(function (d, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip ch-inkeychip' +
        (d.rootPc === ex.rootPc && d.quality === ex.quality ? ' active' : '');
      b.dataset.root = d.rootPc;
      b.dataset.quality = d.quality;
      b.style.setProperty('--deg-c', pal[i % 7]);
      b.innerHTML = '<b>' + esc(d.roman) + '</b>' + esc(d.name);
      b.title = 'Load ' + d.name + ' onto the neck';
      els.inkey.appendChild(b);
    });
  }

  // find the chord's place in the current key (roman + function), if any
  function keyFunction() {
    var info = keyInfo();
    var deg = info.pcToStep.get(ex.rootPc);
    var keyName = Theory.pcName(st.keyPc, Theory.FLAT_KEYS.has(st.keyPc)) + ' ' +
      (Theory.SCALES[st.scaleId] ? Theory.SCALES[st.scaleId].name.replace(/\s*\(.*\)$/, '') : '');
    if (deg === undefined) {
      return { html: esc(exName()) + '’s root isn’t in ' + esc(keyName) +
        ' — this chord lives outside the key (borrowed or chromatic).', roman: '' };
    }
    var tri = [], sev = [];
    try { tri = Theory.diatonic(st.keyPc, st.scaleId, false); } catch (e) { /* non-diatonic scale */ }
    try { sev = Theory.diatonic(st.keyPc, st.scaleId, true); } catch (e2) { /* ditto */ }
    var t = tri[deg], v = sev[deg];
    var fn = FUNC_NAMES[deg] || '';
    if (t && t.quality === ex.quality) {
      return { html: 'In ' + esc(keyName) + ': <b>' + esc(t.roman) + '</b> — ' + esc(fn) + '.', roman: t.roman };
    }
    if (v && v.quality === ex.quality) {
      return { html: 'In ' + esc(keyName) + ': <b>' + esc(v.roman) + '</b> — ' + esc(fn) + '.', roman: v.roman };
    }
    var native = t ? t.name + (v ? ' / ' + v.name : '') : '';
    return { html: 'Root is degree ' + (deg + 1) + ' of ' + esc(keyName) + ', but this quality isn’t diatonic' +
      (native ? ' (the key’s own chord there is ' + esc(native) + ')' : '') + '.', roman: '' };
  }

  function renderTheory() {
    var q = Theory.QUALITIES[ex.quality];
    var kinfo = keyInfo();
    var pal = degPalette();
    var pf = Theory.FLAT_KEYS.has(st.keyPc);

    // spelled tones: interval label + note name, colored by key degree
    var tones = '';
    var formula = [];
    q.intervals.forEach(function (iv) {
      var lbl = IV_LABELS[Theory.mod12(iv)] || String(iv);
      formula.push(lbl);
      var pc = Theory.mod12(ex.rootPc + iv);
      var tone = keyTone(kinfo, pal, pc);
      tones += '<span class="chip ch-tonechip" style="--deg-c:' + tone.color + '">' +
        '<b>' + esc(lbl) + '</b>' + esc(Theory.pcName(pc, pf)) + '</span>';
    });
    els.tones.innerHTML = tones;
    els.formula.textContent = q.name + (q.symbol ? ' (' + q.symbol + ')' : '') +
      ' · formula ' + formula.join(' – ');

    els.fn.innerHTML = keyFunction().html;

    var sc = CHORD_SCALE[ex.quality] || 'major';
    var scName = Theory.pcName(ex.rootPc, pf) + ' ' +
      Theory.SCALES[sc].name.replace(/\s*\(.*\)$/, '');
    els.suggestName.textContent = scName;
    els.practice.dataset.scale = sc;
  }

  function exRender() {
    els.exName.textContent = exName();
    renderShapeChips();
    renderBoard();
    renderTheory();
    renderInKey();
  }

  // load a chord onto the neck. opts: {persist, strum}
  function exLoad(rootPc, quality, opts) {
    opts = opts || {};
    ex.rootPc = validPc(rootPc);
    ex.quality = Theory.QUALITIES[quality] ? quality : 'maj';
    try { ex.shapes = Theory.chordShapes(ex.rootPc, ex.quality); } catch (e) { ex.shapes = []; }
    ex.shapeIdx = 0;
    els.exRoot.value = String(ex.rootPc);
    els.exQuality.value = ex.quality;
    if (opts.persist !== false) {
      App.store.set('ch.libRoot', ex.rootPc);
      App.store.set('ch.libQuality', ex.quality);
    }
    exRender();
    if (opts.strum) strumShape(curShape());
  }

  function strumShape(shape) {
    if (!shape) return;
    App.getAudio(); // ensure ctx exists / resumed inside the user gesture
    var v = Theory.chordVoicing(shape.frets);
    var gap = 0.025 + Math.random() * 0.02; // a hand, not a machine
    for (var i = 0; i < v.length; i++) {
      App.pluck(v[i], i * gap, 1.6, 0.32 * (0.9 + Math.random() * 0.2));
    }
  }

  // ---------------- card 2: palette / track ----------------

  function renderPalette() {
    els.palette.innerHTML = '';
    var dia = Theory.diatonic(st.keyPc, st.scaleId, st.sevenths);
    if (!dia.length) {
      els.palette.innerHTML = '<div class="muted small">No diatonic chords for this scale.</div>';
      return;
    }
    dia.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip ch-pal';
      b.title = 'Add ' + d.name + ' to the progression';
      b.innerHTML = '<span class="ch-pal-roman">' + esc(d.roman) + '</span>' + esc(d.name);
      b.addEventListener('click', function () {
        appendChord({ rootPc: d.rootPc, quality: d.quality, roman: d.roman, name: d.name });
      });
      els.palette.appendChild(b);
    });
  }

  function renderTrack() {
    els.track.innerHTML = '';
    if (!st.track.length) {
      els.track.innerHTML = '<div class="muted small">Empty — click palette chords above or pick a preset, then press Play.</div>';
      return;
    }
    st.track.forEach(function (c, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ch-bar';
      b.dataset.i = i;
      b.title = 'Click to remove';
      b.innerHTML = '<div class="ch-bar-name">' + esc(chordLabel(c)) + '</div>' +
                    '<div class="ch-bar-roman">' + esc(c.roman || '') + '</div>';
      els.track.appendChild(b);
    });
  }

  function setTrack(arr) {
    if (play.on) stopPlayback();
    st.track = arr;
    saveTrack();
    renderTrack();
    updatePlayBtn();
    clearStatus();
  }

  function appendChord(c) {
    setTrack(st.track.concat([c]));
  }

  function renderKeyLabel() {
    if (!els.keyLabel) return;
    els.keyLabel.textContent = Theory.pcName(st.keyPc, Theory.FLAT_KEYS.has(st.keyPc)) +
      ' ' + (Theory.SCALES[st.scaleId] ? Theory.SCALES[st.scaleId].name : st.scaleId);
  }

  function updateSegUI() {
    var btns = els.seg.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', (btns[i].getAttribute('data-v') === '1') === st.sevenths);
    }
  }

  function applyPreset(preset) {
    // Switch scale (and chord depth) to match the preset, then replace the track.
    st.scaleId = preset.scale;
    st.sevenths = !!preset.sevenths;
    App.store.set('ch.scale', st.scaleId);
    App.store.set('ch.sevenths', st.sevenths);
    App.store.set('fb.scale', st.scaleId);
    App.emit('fb:set', { source: 'ch', root: st.keyPc, scale: st.scaleId }); // whole app follows the preset
    renderKeyLabel();
    updateSegUI();
    renderPalette();
    exRender();
    var resolved;
    try {
      resolved = Theory.resolveProgression(preset, st.keyPc);
    } catch (e) {
      showError('Could not resolve preset: ' + e.message);
      return;
    }
    setTrack(resolved.map(function (r) {
      return { rootPc: r.rootPc, quality: r.quality, roman: r.roman, name: r.name };
    }));
  }

  // ---------------- playback ----------------

  function buildChordPlayData(c) {
    var shapes = Theory.chordShapes(c.rootPc, c.quality);
    var shape = shapes.length ? shapes[0] : null;
    var voicing;
    if (shape) {
      voicing = Theory.chordVoicing(shape.frets);
    } else {
      // No shape known: build a plain voicing near midi 48 from the quality intervals.
      var r = 48 + c.rootPc;
      if (c.rootPc > 6) r -= 12;
      voicing = Theory.QUALITIES[c.quality].intervals.map(function (iv) { return r + iv; });
    }
    return {
      chord: c,
      shape: shape,
      voicing: voicing,
      bass: voicing.length ? voicing[0] : 48 + c.rootPc,
      name: chordLabel(c)
    };
  }

  function scheduleClick(t, accent) {
    var ctx = App.getAudio();
    if (!play.clickBus) return;
    var t0 = Math.max(t, ctx.currentTime);
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 900;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(accent ? 0.11 : 0.055, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.035);
    osc.connect(g);
    g.connect(play.clickBus);
    osc.start(t0);
    osc.stop(t0 + 0.05);
  }

  function scheduleStrum(voicing, t) {
    var ctx = App.getAudio();
    var base = Math.max(0, t - ctx.currentTime);
    var gap = 0.028 + Math.random() * 0.018;
    for (var i = 0; i < voicing.length; i++) {
      App.pluck(voicing[i], base + i * gap, 1.4, 0.3 * (0.9 + Math.random() * 0.2));
    }
  }

  function scheduler() {
    var ctx = App.getAudio();
    var horizon = ctx.currentTime + LOOKAHEAD;
    while (play.on && play.nextTime < horizon) {
      var t = play.nextTime;
      var spb = 60 / st.bpm;

      if (play.countLeft > 0) {
        scheduleClick(t, play.countLeft === 4);
        if (play.countLeft === 4) play.queue.push({ time: t, idx: -1 });
        play.countLeft--;
      } else {
        if (!play.seq.length) { stopPlayback(); return; }
        var cur = play.seq[play.chordIdx];
        if (play.beat === 0) {
          scheduleStrum(cur.voicing, t);
          play.queue.push({ time: t, idx: play.chordIdx });
        } else if (play.beat % 4 === 2) {
          // beat 3 of each bar: bass note alone
          App.pluck(cur.bass, Math.max(0, t - ctx.currentTime), 0.9, 0.3);
        }
        scheduleClick(t, false);
        var beatsPerChord = st.barsPerChord * 4;
        play.beat++;
        if (play.beat >= beatsPerChord) {
          play.beat = 0;
          play.chordIdx = (play.chordIdx + 1) % play.seq.length;
        }
      }
      play.nextTime = t + spb;
    }
  }

  function clearActiveBars() {
    var act = els.track.querySelectorAll('.ch-bar.ch-active');
    for (var i = 0; i < act.length; i++) act[i].classList.remove('ch-active');
  }

  function setNow(idx) {
    clearActiveBars();
    if (idx >= 0 && play.seq[idx]) {
      var bars = els.track.querySelectorAll('.ch-bar');
      if (bars[idx]) bars[idx].classList.add('ch-active');
      var cur = play.seq[idx];
      els.nowName.textContent = cur.name;
      els.nowRoman.textContent = cur.chord.roman || '';
      // the explorer neck follows the sounding chord (not persisted — the
      // user's own selection comes back on the next manual pick)
      exLoad(cur.chord.rootPc, cur.chord.quality, { persist: false });
    } else {
      els.nowName.textContent = 'Count-in';
      els.nowRoman.textContent = '1 · 2 · 3 · 4';
    }
  }

  function frame() {
    if (!play.on) return;
    var ctx = App.getAudio();
    while (play.queue.length && play.queue[0].time <= ctx.currentTime + 0.02) {
      setNow(play.queue.shift().idx);
    }
    play.raf = requestAnimationFrame(frame);
  }

  function startPlayback() {
    if (!st.track.length) {
      showError('Add chords to the progression first.');
      return;
    }
    clearStatus();
    var ctx;
    try {
      ctx = App.getAudio();
    } catch (e) {
      showError('Audio is unavailable in this browser: ' + e.message);
      return;
    }
    try {
      play.seq = st.track.map(buildChordPlayData);
    } catch (e2) {
      showError('Could not build chord voicings: ' + e2.message);
      return;
    }
    play.on = true;
    App.wake.acquire('ch-play');
    play.chordIdx = 0;
    play.beat = 0;
    play.countLeft = els.countin.checked ? 4 : 0;
    play.queue = [];
    play.clickBus = ctx.createGain();
    play.clickBus.gain.value = 1;
    play.clickBus.connect(ctx.destination);
    play.nextTime = ctx.currentTime + 0.12;

    els.now.classList.add('ch-on');
    els.nowName.textContent = '';
    els.nowRoman.textContent = '';

    play.timer = setInterval(scheduler, TICK_MS);
    scheduler(); // fill the first lookahead window immediately
    play.raf = requestAnimationFrame(frame);
    updatePlayBtn();
  }

  function stopPlayback() {
    if (play.timer !== null) { clearInterval(play.timer); play.timer = null; }
    if (play.raf !== null) { cancelAnimationFrame(play.raf); play.raf = null; }
    if (play.clickBus) {
      try { play.clickBus.disconnect(); } catch (e) { /* already gone */ }
      play.clickBus = null;
    }
    play.on = false;
    App.wake.release('ch-play');
    play.queue = [];
    play.seq = [];
    if (els.now) els.now.classList.remove('ch-on');
    if (els.track) clearActiveBars();
    if (els.play) updatePlayBtn();
  }

  function togglePlay() {
    if (play.on) stopPlayback();
    else startPlayback();
  }

  function updatePlayBtn() {
    var b = els.play;
    b.disabled = !play.on && st.track.length === 0;
    b.textContent = play.on ? 'Stop' : 'Play';
    b.classList.toggle('primary', !play.on);
    b.classList.toggle('danger', play.on);
  }

  // ---------------- init ----------------

  var CSS = '' +
    '.ch-exname{font-family:var(--font-display);font-size:34px;font-weight:700;' +
      'letter-spacing:1px;line-height:1;min-width:90px;}' +
    '.ch-boardwrap{overflow-x:auto;margin-top:12px;}' +
    '.ch-bsvg{display:block;width:100%;min-width:540px;max-width:760px;height:auto;cursor:pointer;}' +
    '.ch-bdot{cursor:pointer;}' +
    '.ch-bdot:hover{stroke:#ffffff;stroke-width:2;}' +
    '.ch-shapesel{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}' +
    '.ch-shapechip{cursor:pointer;font-family:inherit;color:var(--text);}' +
    '.ch-inkeyrow{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px;}' +
    '.ch-inkeychip{cursor:pointer;font-family:inherit;color:var(--text);gap:7px;' +
      'border-color:var(--deg-c,var(--line));}' +
    '.ch-inkeychip b{color:var(--deg-c,var(--accent));}' +
    '.ch-inkeychip.active{box-shadow:0 0 10px var(--deg-c,var(--accent-glow));color:var(--text);}' +
    '.ch-theory{margin-top:14px;display:flex;flex-direction:column;gap:9px;}' +
    '.ch-tones{display:flex;flex-wrap:wrap;gap:8px;}' +
    '.ch-tonechip{border-color:var(--deg-c,var(--line));gap:7px;}' +
    '.ch-tonechip b{color:var(--deg-c,var(--accent));font-size:14px;}' +
    '.ch-fnline{font-size:14px;}' +
    '.ch-field{display:inline-flex;flex-direction:column;gap:4px;font-size:12.5px;' +
      'color:var(--label,var(--muted));font-weight:600;}' +
    '.ch-line{stroke:var(--line);stroke-width:1;}' +
    '.ch-string{stroke:var(--muted);stroke-opacity:.55;stroke-width:1;}' +
    '.ch-nut{fill:var(--text);}' +
    '.ch-xo{fill:var(--muted);font-size:9px;font-weight:700;}' +
    '.ch-fretnum{fill:var(--muted);font-size:9.5px;}' +
    '.ch-palette{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 14px;}' +
    '.chip.ch-pal{cursor:pointer;font-family:inherit;color:var(--text);gap:7px;}' +
    '.chip.ch-pal:hover{border-color:var(--accent-dim);}' +
    '.ch-pal-roman{color:var(--accent);}' +
    '.ch-trackwrap{display:flex;gap:16px;align-items:stretch;flex-wrap:wrap;}' +
    '.ch-trackbox{flex:1 1 320px;min-width:0;}' +
    '.ch-trackbox h3{margin:0;}' +
    '.ch-track{display:flex;flex-wrap:wrap;gap:8px;min-height:56px;align-items:center;margin-top:8px;}' +
    '.ch-bar{background:var(--card2);border:1px solid var(--line);border-radius:10px;' +
      'padding:7px 12px;cursor:pointer;text-align:center;color:var(--text);font-family:inherit;}' +
    '.ch-bar:hover{border-color:var(--red);}' +
    '.ch-bar-name{font-size:17px;font-weight:700;line-height:1.15;}' +
    '.ch-bar-roman{font-size:11.5px;color:var(--muted);}' +
    '.ch-bar.ch-active{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent);}' +
    '.ch-bar.ch-active .ch-bar-name{color:var(--accent);}' +
    '.ch-now{display:none;flex-direction:column;align-items:center;justify-content:center;gap:2px;' +
      'background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:12px 20px;}' +
    '.ch-now.ch-on{display:flex;}' +
    '.ch-now-name{font-size:40px;font-weight:800;line-height:1.1;}' +
    '.ch-check{display:inline-flex;align-items:center;gap:7px;font-size:13px;' +
      'color:var(--muted);font-weight:600;cursor:pointer;}' +
    '.ch-status{margin-top:10px;}' +
    '.ch-status:empty{display:none;}';

  function buildDOM(root) {
    root.innerHTML =
      '<div class="card">' +
        '<h2>Chord explorer</h2>' +
        '<div class="row">' +
          '<span class="ch-exname" id="ch-ex-name"></span>' +
          '<label class="field">Root<select id="ch-ex-root"></select></label>' +
          '<label class="field">Chord<select id="ch-ex-quality"></select></label>' +
          '<button type="button" class="btn primary" id="ch-ex-strum">Strum</button>' +
          '<button type="button" class="btn" id="ch-ex-add" title="Append this chord to the progression below">+ Progression</button>' +
        '</div>' +
        '<div class="ch-inkeyrow"><span class="ch-field"><span>In the key</span></span>' +
          '<span class="chip" id="ch-key-label" title="Key and scale come from the bar at the top"></span>' +
          '<span class="seg" id="ch-seg">' +
            '<button type="button" data-v="0">Triads</button>' +
            '<button type="button" data-v="1">7ths</button>' +
          '</span>' +
          '<span id="ch-inkey" class="ch-inkeyrow" style="margin-top:0"></span>' +
        '</div>' +
        '<div class="ch-boardwrap" id="ch-board" title="Tap the neck to strum; tap a note to hear it"></div>' +
        '<div class="ch-shapesel" id="ch-shapesel"></div>' +
        '<div class="ch-theory">' +
          '<div class="ch-tones" id="ch-tones"></div>' +
          '<div class="muted small" id="ch-formula"></div>' +
          '<div class="ch-fnline" id="ch-fn"></div>' +
          '<div class="row tight"><span class="muted small">Solo over it with</span>' +
            '<span class="chip" id="ch-suggest-name"></span>' +
            '<button type="button" class="btn sm" id="ch-practice" title="Set up the fretboard with this scale and start the practice runner">Practice it &#8594;</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>Progression player</h2>' +
        '<div class="row">' +
          '<label class="field">Preset<select id="ch-preset"></select></label>' +
          '<span class="muted small">Tap palette chords to build; the neck above follows the chord as it plays.</span>' +
        '</div>' +
        '<div id="ch-palette" class="ch-palette"></div>' +
        '<div class="ch-trackwrap">' +
          '<div class="ch-trackbox">' +
            '<div class="row spread">' +
              '<h3>Progression</h3>' +
              '<button id="ch-clear" class="btn sm danger" type="button">Clear</button>' +
            '</div>' +
            '<div id="ch-track" class="ch-track"></div>' +
          '</div>' +
          '<div id="ch-now" class="ch-now">' +
            '<div id="ch-now-name" class="ch-now-name"></div>' +
            '<div id="ch-now-roman" class="muted"></div>' +
          '</div>' +
        '</div>' +
        '<div class="row" style="margin-top:14px">' +
          '<label class="field">BPM<input id="ch-bpm" type="number" min="40" max="240" step="1"></label>' +
          '<label class="field">Bars / chord<select id="ch-bars">' +
            '<option value="1">1</option><option value="2">2</option></select></label>' +
          '<label class="ch-check"><input id="ch-countin" type="checkbox"> Count-in</label>' +
          '<button id="ch-play" class="btn big primary" type="button">Play</button>' +
          '<span class="muted small">Space toggles play</span>' +
        '</div>' +
        '<div id="ch-status" class="ch-status"></div>' +
      '</div>';

    els.exName = document.getElementById('ch-ex-name');
    els.exRoot = document.getElementById('ch-ex-root');
    els.exQuality = document.getElementById('ch-ex-quality');
    els.exStrum = document.getElementById('ch-ex-strum');
    els.exAdd = document.getElementById('ch-ex-add');
    els.inkey = document.getElementById('ch-inkey');
    els.board = document.getElementById('ch-board');
    els.shapeSel = document.getElementById('ch-shapesel');
    els.tones = document.getElementById('ch-tones');
    els.formula = document.getElementById('ch-formula');
    els.fn = document.getElementById('ch-fn');
    els.suggestName = document.getElementById('ch-suggest-name');
    els.practice = document.getElementById('ch-practice');
    els.keyLabel = document.getElementById('ch-key-label');
    els.seg = document.getElementById('ch-seg');
    els.preset = document.getElementById('ch-preset');
    els.palette = document.getElementById('ch-palette');
    els.track = document.getElementById('ch-track');
    els.clear = document.getElementById('ch-clear');
    els.now = document.getElementById('ch-now');
    els.nowName = document.getElementById('ch-now-name');
    els.nowRoman = document.getElementById('ch-now-roman');
    els.bpm = document.getElementById('ch-bpm');
    els.bars = document.getElementById('ch-bars');
    els.countin = document.getElementById('ch-countin');
    els.play = document.getElementById('ch-play');
    els.status = document.getElementById('ch-status');
  }

  function addOption(sel, value, label) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    sel.appendChild(o);
  }

  function fillSelects() {
    var i;
    for (i = 0; i < 12; i++) {
      var nm = Theory.pcName(i, Theory.FLAT_KEYS.has(i));
      addOption(els.exRoot, String(i), nm);
    }
    Theory.QUALITY_ORDER.forEach(function (q) {
      var qq = Theory.QUALITIES[q];
      addOption(els.exQuality, q, qq.name + (qq.symbol ? ' (' + qq.symbol + ')' : ''));
    });
    addOption(els.preset, '', '— choose preset —');
    Theory.PROGRESSIONS.forEach(function (p) {
      addOption(els.preset, p.id, p.name);
    });
  }

  function wire() {
    els.exRoot.addEventListener('change', function () {
      exLoad(els.exRoot.value, ex.quality, { strum: true });
    });
    els.exQuality.addEventListener('change', function () {
      exLoad(ex.rootPc, els.exQuality.value, { strum: true });
    });
    els.exStrum.addEventListener('click', function () { strumShape(curShape()); });
    els.exAdd.addEventListener('click', function () {
      appendChord({ rootPc: ex.rootPc, quality: ex.quality,
        roman: keyFunction().roman, name: exName() });
    });
    els.shapeSel.addEventListener('click', function (e) {
      var b = e.target.closest('.ch-shapechip');
      if (!b) return;
      ex.shapeIdx = Number(b.dataset.i) || 0;
      renderShapeChips();
      renderBoard();
      strumShape(curShape());
    });
    els.inkey.addEventListener('click', function (e) {
      var b = e.target.closest('.ch-inkeychip');
      if (!b) return;
      exLoad(b.dataset.root, b.dataset.quality, { strum: true });
    });
    els.board.addEventListener('click', function (e) {
      var dot = e.target.closest && e.target.closest('[data-midi]');
      if (dot) {
        App.getAudio();
        App.pluck(Number(dot.getAttribute('data-midi')), 0, 1.4, 0.4);
      } else {
        strumShape(curShape());
      }
    });
    els.practice.addEventListener('click', function () {
      // the fretboard applies root+scale, switches tabs and starts the runner
      App.emit('fb:practice', { root: ex.rootPc, scale: els.practice.dataset.scale });
    });

    els.seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var v = b.getAttribute('data-v') === '1';
      if (v === st.sevenths) return;
      st.sevenths = v;
      App.store.set('ch.sevenths', v);
      updateSegUI();
      renderInKey();
      renderPalette();
    });
    els.preset.addEventListener('change', function () {
      var id = els.preset.value;
      els.preset.value = ''; // reset so the same preset can be re-applied later
      if (!id) return;
      for (var i = 0; i < Theory.PROGRESSIONS.length; i++) {
        if (Theory.PROGRESSIONS[i].id === id) { applyPreset(Theory.PROGRESSIONS[i]); return; }
      }
    });

    els.track.addEventListener('click', function (e) {
      var b = e.target.closest('.ch-bar');
      if (!b) return;
      var i = Number(b.dataset.i);
      var next = st.track.slice();
      next.splice(i, 1);
      setTrack(next);
    });
    els.clear.addEventListener('click', function () { setTrack([]); });

    els.bpm.addEventListener('change', function () {
      st.bpm = clampBpm(els.bpm.value);
      els.bpm.value = st.bpm;
      App.store.set('ch.bpm', st.bpm);
    });
    els.bars.addEventListener('change', function () {
      st.barsPerChord = els.bars.value === '2' ? 2 : 1;
      App.store.set('ch.barsPerChord', st.barsPerChord);
    });
    els.play.addEventListener('click', togglePlay);
  }

  function init(rootEl) {
    App.injectCSS('chords', CSS);
    loadState();
    buildDOM(rootEl);
    fillSelects();

    els.bpm.value = st.bpm;
    els.bars.value = String(st.barsPerChord);
    updateSegUI();

    wire();
    renderKeyLabel();

    // stay linked to the fretboard's scale: seed from its saved state now,
    // follow its changes live (7-note scales only - the palette is diatonic)
    applyFbScale(App.store.get('fb.root', null), App.store.get('fb.scale', null), true);
    App.on('fb:scale', function (d) {
      if (d) applyFbScale(d.root, d.scale, false);
    });

    exLoad(ex.rootPc, ex.quality, { persist: false });
    renderPalette();
    renderTrack();
    updatePlayBtn();
  }

  function applyFbScale(root, scale, quiet) {
    if (typeof root !== 'number' || !isFinite(root)) return;
    if (!scale || !Theory.SCALES[scale] || Theory.SCALES[scale].steps.length !== 7) return;
    st.keyPc = validPc(root);
    st.scaleId = scale;
    App.store.set('ch.key', st.keyPc);
    App.store.set('ch.scale', st.scaleId);
    renderKeyLabel();
    if (!quiet) {           // live change: refresh what is on screen
      renderPalette();
      exRender();           // board colors + in-key chips + function line follow the key
    }
  }

  function onHide() {
    stopPlayback();
  }

  function onKey(e) {
    if (e.repeat) return;
    if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
      if (play.on || st.track.length) {
        e.preventDefault();
        togglePlay(); // keydown is a user gesture, so getAudio() inside is fine
      }
    }
  }

  function onShow() {
    renderKeyLabel();
    exRender(); // key or degree palette may have changed while away
  }

  App.register('chords', { init: init, onShow: onShow, onHide: onHide, onKey: onKey });
})();
