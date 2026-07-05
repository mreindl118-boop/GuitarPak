/* GuitarLab — Chords module.
 * Card 1: chord library — every known shape for a root+quality as clickable SVG
 *         diagrams (click = strum).
 * Card 2: progression player — diatonic palette / presets build a chord track,
 *         played in a loop with a Web-Audio lookahead scheduler.
 * Registers as 'chords'. All ids/classes prefixed ch-, store keys prefixed 'ch.'.
 */
(function () {
  'use strict';

  var els = {};

  // 7-note scales only (diatonic() returns [] for the others).
  var SEVEN_NOTE_SCALES = Theory.SCALE_ORDER.filter(function (id) {
    return Theory.SCALES[id].steps.length === 7;
  });

  // ---------------- state ----------------

  var lib = { rootPc: 0, quality: 'maj', shapes: [] };

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

    lib.rootPc = validPc(g('ch.libRoot', 0));
    var lq = g('ch.libQuality', 'maj');
    lib.quality = Theory.QUALITY_ORDER.indexOf(lq) !== -1 ? lq : 'maj';

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

  // ---------------- SVG chord diagram (reusable) ----------------
  // Vertical diagram: 6 strings as vertical lines (low E leftmost),
  // 5-fret window starting at shape.baseFret.

  function renderShapeSVG(shape) {
    var NS = 'http://www.w3.org/2000/svg';
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
    function circle(cx, cy, r, cls) {
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', cx); c.setAttribute('cy', cy);
      c.setAttribute('r', r); c.setAttribute('class', cls);
      svg.appendChild(c);
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
        circle(x, TOP - 10.5, 3.4, 'ch-open');
      } else {
        var row = fr - shape.baseFret;
        if (row < 0) row = 0;
        if (row > 4) row = 4;
        circle(x, TOP + (row + 0.5) * SP_Y, 4.6, 'ch-dot');
      }
    }
    return svg;
  }

  // ---------------- card 1: chord library ----------------

  function renderLibrary() {
    lib.shapes = [];
    els.libShapes.innerHTML = '';
    var name = Theory.chordName(lib.rootPc, lib.quality, Theory.FLAT_KEYS.has(lib.rootPc));
    try {
      lib.shapes = Theory.chordShapes(lib.rootPc, lib.quality);
    } catch (e) {
      els.libShapes.innerHTML = '<div class="error">Could not build shapes: ' + esc(e.message) + '</div>';
      return;
    }
    if (!lib.shapes.length) {
      els.libShapes.innerHTML = '<div class="muted">No diagram available for ' + esc(name) + '.</div>';
      return;
    }
    lib.shapes.forEach(function (shape, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ch-shape';
      btn.dataset.i = i;
      btn.title = 'Click to strum ' + name;
      btn.appendChild(renderShapeSVG(shape));
      var cap = document.createElement('div');
      cap.className = 'ch-cap';
      cap.innerHTML = '<div class="ch-cap-name">' + esc(name) + '</div>' +
                      '<div class="muted small">' + esc(shape.label) + '</div>';
      btn.appendChild(cap);
      els.libShapes.appendChild(btn);
    });
  }

  function strumShape(shape) {
    App.getAudio(); // ensure ctx exists / resumed inside the user gesture
    var v = Theory.chordVoicing(shape.frets);
    for (var i = 0; i < v.length; i++) App.pluck(v[i], i * 0.04, 1.4, 0.32);
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
    els.scale.value = st.scaleId;
    updateSegUI();
    renderPalette();
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
    for (var i = 0; i < voicing.length; i++) {
      App.pluck(voicing[i], base + i * 0.04, 1.4, 0.3);
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
      els.nowDia.innerHTML = '';
      if (cur.shape) {
        els.nowDia.appendChild(renderShapeSVG(cur.shape));
      } else {
        els.nowDia.innerHTML = '<div class="muted small">no diagram</div>';
      }
    } else {
      els.nowName.textContent = 'Count-in';
      els.nowRoman.textContent = '1 · 2 · 3 · 4';
      els.nowDia.innerHTML = '';
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
    els.nowDia.innerHTML = '';

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
    '.ch-shapes{display:flex;flex-wrap:wrap;gap:12px;margin-top:14px;}' +
    '.ch-shape{background:var(--card2);border:1px solid var(--line);border-radius:10px;' +
      'padding:8px 10px 9px;cursor:pointer;display:flex;flex-direction:column;align-items:center;' +
      'gap:2px;color:var(--text);font-family:inherit;}' +
    '.ch-shape:hover{border-color:var(--accent-dim);}' +
    '.ch-shape:active{transform:translateY(1px);}' +
    '.ch-cap{text-align:center;}' +
    '.ch-cap-name{font-weight:700;font-size:13.5px;}' +
    '.ch-line{stroke:var(--line);stroke-width:1;}' +
    '.ch-string{stroke:var(--muted);stroke-opacity:.55;stroke-width:1;}' +
    '.ch-nut{fill:var(--text);}' +
    '.ch-dot{fill:var(--accent);}' +
    '.ch-open{fill:none;stroke:var(--muted);stroke-width:1.2;}' +
    '.ch-xo{fill:var(--muted);font-size:9px;font-weight:700;}' +
    '.ch-fretnum{fill:var(--muted);font-size:9.5px;}' +
    '.ch-field{display:inline-flex;flex-direction:column;gap:4px;font-size:12.5px;' +
      'color:var(--muted);font-weight:600;}' +
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
        '<h2>Chord library</h2>' +
        '<div class="row">' +
          '<label class="field">Root<select id="ch-lib-root"></select></label>' +
          '<label class="field">Quality<select id="ch-lib-quality"></select></label>' +
          '<span class="muted small">Click a diagram to strum it.</span>' +
        '</div>' +
        '<div id="ch-lib-shapes" class="ch-shapes"></div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>Progression player</h2>' +
        '<div class="row">' +
          '<label class="field">Key<select id="ch-key"></select></label>' +
          '<label class="field">Scale<select id="ch-scale"></select></label>' +
          '<div class="ch-field"><span>Chords</span>' +
            '<span class="seg" id="ch-seg">' +
              '<button type="button" data-v="0">Triads</button>' +
              '<button type="button" data-v="1">7ths</button>' +
            '</span>' +
          '</div>' +
          '<label class="field">Preset<select id="ch-preset"></select></label>' +
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
            '<div id="ch-now-dia"></div>' +
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

    els.libRoot = document.getElementById('ch-lib-root');
    els.libQuality = document.getElementById('ch-lib-quality');
    els.libShapes = document.getElementById('ch-lib-shapes');
    els.key = document.getElementById('ch-key');
    els.scale = document.getElementById('ch-scale');
    els.seg = document.getElementById('ch-seg');
    els.preset = document.getElementById('ch-preset');
    els.palette = document.getElementById('ch-palette');
    els.track = document.getElementById('ch-track');
    els.clear = document.getElementById('ch-clear');
    els.now = document.getElementById('ch-now');
    els.nowName = document.getElementById('ch-now-name');
    els.nowRoman = document.getElementById('ch-now-roman');
    els.nowDia = document.getElementById('ch-now-dia');
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
      addOption(els.libRoot, String(i), nm);
      addOption(els.key, String(i), nm);
    }
    Theory.QUALITY_ORDER.forEach(function (q) {
      var qq = Theory.QUALITIES[q];
      addOption(els.libQuality, q, qq.name + (qq.symbol ? ' (' + qq.symbol + ')' : ''));
    });
    SEVEN_NOTE_SCALES.forEach(function (id) {
      addOption(els.scale, id, Theory.SCALES[id].name);
    });
    addOption(els.preset, '', '— choose preset —');
    Theory.PROGRESSIONS.forEach(function (p) {
      addOption(els.preset, p.id, p.name);
    });
  }

  function wire() {
    els.libRoot.addEventListener('change', function () {
      lib.rootPc = validPc(els.libRoot.value);
      App.store.set('ch.libRoot', lib.rootPc);
      renderLibrary();
    });
    els.libQuality.addEventListener('change', function () {
      lib.quality = els.libQuality.value;
      App.store.set('ch.libQuality', lib.quality);
      renderLibrary();
    });
    els.libShapes.addEventListener('click', function (e) {
      var b = e.target.closest('.ch-shape');
      if (!b) return;
      var shape = lib.shapes[Number(b.dataset.i)];
      if (shape) strumShape(shape);
    });

    els.key.addEventListener('change', function () {
      st.keyPc = validPc(els.key.value);
      App.store.set('ch.key', st.keyPc);
      renderPalette();
    });
    els.scale.addEventListener('change', function () {
      st.scaleId = els.scale.value;
      App.store.set('ch.scale', st.scaleId);
      renderPalette();
    });
    els.seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var v = b.getAttribute('data-v') === '1';
      if (v === st.sevenths) return;
      st.sevenths = v;
      App.store.set('ch.sevenths', v);
      updateSegUI();
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

    els.libRoot.value = String(lib.rootPc);
    els.libQuality.value = lib.quality;
    els.key.value = String(st.keyPc);
    els.scale.value = st.scaleId;
    els.bpm.value = st.bpm;
    els.bars.value = String(st.barsPerChord);
    updateSegUI();

    wire();
    renderLibrary();
    renderPalette();
    renderTrack();
    updatePlayBtn();
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

  App.register('chords', { init: init, onHide: onHide, onKey: onKey });
})();
