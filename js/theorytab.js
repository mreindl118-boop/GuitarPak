/* GuitarLab — Theory tab. Registers as 'theory'. Prefix th-.
 * Three cards, all LINKED to the app-wide key in the context bar:
 *   1. Interactive circle of fifths — tap any major (outer ring) or relative
 *      minor (inner ring) and the WHOLE APP changes key (fb:set on the bus:
 *      bar, fretboard, chords, jam palette all follow).
 *   2. Key guide — the current key spelled out: degree-colored notes with
 *      interval names, the diatonic chords (tap to hear), related keys
 *      (relative / parallel, one tap to switch), and jumps to the Chords tab
 *      and the fretboard practice runner.
 *   3. Degree ear trainer — hear the root then a scale note, name the degree.
 *      Uses the same degree colors as the fretboard so ears and eyes bind.
 */
(function () {
  'use strict';

  var els = {};

  // order of fifths, clockwise from C at 12 o'clock; inner ring = relative minors
  var FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
  var KEYSIG = ['', '1♯', '2♯', '3♯', '4♯', '5♯', '6♯', '5♭', '4♭', '3♭', '2♭', '1♭'];

  var FUNC_SHORT = ['tonic', 'supertonic', 'mediant', 'subdominant', 'dominant', 'submediant', 'leading tone'];

  var DEG_DEFAULTS = ['#ffab47', '#e8d44d', '#7ad97a', '#4cc9b0', '#6ea8fe', '#b48ef0', '#ff85b3'];

  function degPalette() {
    var c = App.store.get('fb.colors', null);
    return (Array.isArray(c) && c.length === 7 &&
      c.every(function (x) { return /^#[0-9a-fA-F]{6}$/.test(x); })) ? c : DEG_DEFAULTS;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function curRoot() {
    var v = App.store.get('fb.root', 9);
    return (typeof v === 'number' && v >= 0 && v < 12) ? Math.floor(v) : 9;
  }

  function curScale() {
    var v = App.store.get('fb.scale', 'minorPent');
    return Theory.SCALES[v] ? v : 'minorPent';
  }

  function keyName() {
    var pf = Theory.FLAT_KEYS.has(curRoot());
    return Theory.pcName(curRoot(), pf) + ' ' + Theory.SCALES[curScale()].name;
  }

  // change the whole app's key (the same bus path the context bar uses)
  function setKey(root, scale) {
    App.store.set('fb.root', root);
    App.store.set('fb.scale', scale);
    App.store.set('fb.mode', 1);
    App.emit('fb:set', { source: 'th', root: root, scale: scale, mode: 1 });
    render();
  }

  // ---------------- card 1: circle of fifths ----------------

  function polar(cx, cy, r, deg) {
    var a = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  function wedge(cx, cy, r0, r1, a0, a1) {
    var p0 = polar(cx, cy, r1, a0), p1 = polar(cx, cy, r1, a1);
    var p2 = polar(cx, cy, r0, a1), p3 = polar(cx, cy, r0, a0);
    return 'M' + p0[0].toFixed(1) + ' ' + p0[1].toFixed(1) +
      ' A' + r1 + ' ' + r1 + ' 0 0 1 ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) +
      ' L' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1) +
      ' A' + r0 + ' ' + r0 + ' 0 0 0 ' + p3[0].toFixed(1) + ' ' + p3[1].toFixed(1) + ' Z';
  }

  function renderCircle() {
    var root = curRoot(), scale = curScale();
    var isMajor = scale === 'major';
    var isMinor = scale === 'aeolian';
    var C = 170, R2 = 160, R1 = 116, R0 = 74;
    var s = '<svg viewBox="0 0 340 340" class="th-circle" role="img" aria-label="Circle of fifths">';
    for (var i = 0; i < 12; i++) {
      var a0 = i * 30 - 15, a1 = i * 30 + 15;
      var majPc = FIFTHS[i];
      var minPc = Theory.mod12(majPc + 9); // relative minor
      var majOn = isMajor && majPc === root;
      var minOn = isMinor && minPc === root;
      var otherOn = !isMajor && !isMinor && majPc === root;
      s += '<path d="' + wedge(C, C, R1, R2, a0, a1) + '" class="th-wg th-wg-maj' +
        (majOn || otherOn ? ' th-on' : '') + '" data-th-maj="' + majPc + '"></path>';
      s += '<path d="' + wedge(C, C, R0, R1, a0, a1) + '" class="th-wg th-wg-min' +
        (minOn ? ' th-on' : '') + '" data-th-min="' + minPc + '"></path>';
      var pM = polar(C, C, (R1 + R2) / 2, i * 30);
      var pm = polar(C, C, (R0 + R1) / 2, i * 30);
      var pS = polar(C, C, R2 + 11, i * 30);
      var pfM = Theory.FLAT_KEYS.has(majPc);
      s += '<text x="' + pM[0].toFixed(1) + '" y="' + (pM[1] + 6).toFixed(1) +
        '" class="th-lb th-lb-maj">' + esc(Theory.pcName(majPc, pfM)) + '</text>';
      s += '<text x="' + pm[0].toFixed(1) + '" y="' + (pm[1] + 4).toFixed(1) +
        '" class="th-lb th-lb-min">' + esc(Theory.pcName(minPc, Theory.FLAT_KEYS.has(minPc))) + 'm</text>';
      if (KEYSIG[i]) {
        s += '<text x="' + pS[0].toFixed(1) + '" y="' + (pS[1] + 4).toFixed(1) +
          '" class="th-lb th-lb-sig">' + KEYSIG[i] + '</text>';
      }
    }
    var pf = Theory.FLAT_KEYS.has(root);
    s += '<text x="170" y="164" class="th-center">' + esc(Theory.pcName(root, pf)) + '</text>';
    s += '<text x="170" y="188" class="th-center-sub">' +
      esc(Theory.SCALES[scale].name.replace(/\s*\(.*\)$/, '')) + '</text>';
    s += '</svg>';
    els.circle.innerHTML = s;
  }

  // ---------------- card 2: key guide ----------------

  function renderGuide() {
    var root = curRoot(), scale = curScale();
    var pal = degPalette();
    var info = Theory.scaleInfo(root, scale, Theory.FLAT_KEYS.has(root));
    els.guideTitle.textContent = keyName();

    // notes with interval names
    var h = '';
    info.names.forEach(function (n, i) {
      h += '<span class="chip th-note" style="--deg-c:' + pal[i % 7] + '">' +
        '<b>' + (i + 1) + '</b>' + esc(n) +
        '<span class="th-iv">' + esc(info.intervals[i] || '') + '</span></span>';
    });
    els.notes.innerHTML = h;

    // diatonic chords (7-note scales)
    var dia = [];
    try { dia = Theory.diatonic(root, scale, false); } catch (e) { /* non-diatonic scale */ }
    if (dia.length) {
      h = '';
      dia.forEach(function (d, i) {
        h += '<button type="button" class="chip th-chord" data-th-ch="' + i + '" ' +
          'style="--deg-c:' + pal[i % 7] + '" title="' + esc(d.name) + ' — ' +
          esc(FUNC_SHORT[i] || '') + '. Tap to hear.">' +
          '<b>' + esc(d.roman) + '</b>' + esc(d.name) + '</button>';
      });
      els.chords.innerHTML = h;
      els.chords._dia = dia;
      els.chordsRow.style.display = '';
    } else {
      els.chordsRow.style.display = 'none';
    }

    // related keys
    var rel = '';
    if (scale === 'major') {
      var rm = Theory.mod12(root + 9);
      rel += relBtn(rm, 'aeolian', 'Relative minor: ' + Theory.pcName(rm, Theory.FLAT_KEYS.has(rm)) + 'm');
      rel += relBtn(root, 'aeolian', 'Parallel minor: ' + Theory.pcName(root, Theory.FLAT_KEYS.has(root)) + 'm');
    } else if (scale === 'aeolian') {
      var rM = Theory.mod12(root + 3);
      rel += relBtn(rM, 'major', 'Relative major: ' + Theory.pcName(rM, Theory.FLAT_KEYS.has(rM)));
      rel += relBtn(root, 'major', 'Parallel major: ' + Theory.pcName(root, Theory.FLAT_KEYS.has(root)));
    } else {
      rel += relBtn(root, 'major', Theory.pcName(root, Theory.FLAT_KEYS.has(root)) + ' Major');
      rel += relBtn(root, 'aeolian', Theory.pcName(root, Theory.FLAT_KEYS.has(root)) + ' Minor');
    }
    els.related.innerHTML = rel;
  }

  function relBtn(root, scale, label) {
    return '<button type="button" class="btn sm th-rel" data-th-root="' + root +
      '" data-th-scale="' + scale + '">' + esc(label) + '</button>';
  }

  function strumDia(d, when) {
    App.getAudio(); // inside the user gesture (or with a running ctx)
    when = when || 0;
    var shapes = [];
    try { shapes = Theory.chordShapes(d.rootPc, d.quality); } catch (e) { /* fall through */ }
    var v;
    if (shapes.length) {
      v = Theory.chordVoicing(shapes[0].frets);
    } else {
      var r = 48 + d.rootPc; if (d.rootPc > 6) r -= 12;
      v = Theory.QUALITIES[d.quality].intervals.map(function (iv) { return r + iv; });
    }
    var gap = 0.028 + Math.random() * 0.015;
    for (var i = 0; i < v.length; i++) App.pluck(v[i], when + i * gap, 1.5, 0.3);
  }

  // hear the key you just landed on: tonic chord for diatonic scales, the
  // bare root for everything else
  function strumTonic() {
    var dia = [];
    try { dia = Theory.diatonic(curRoot(), curScale(), false); } catch (e) { /* not 7-note */ }
    if (dia.length) strumDia(dia[0]);
    else App.pluck(quizRootMidi(), 0, 1.3, 0.35);
  }

  // ---------------- circle practice: the metronome walks the circle ----------------
  // While running, every N bars of the metronome the WHOLE APP advances one
  // step around the circle (clockwise = up a fifth, counter = up a fourth)
  // and the new tonic is strummed. Sit on the Fretboard tab and practice each
  // key as it lands — the theory module keeps counting in the background.

  // dir: 1 = up a fifth, -1 = up a fourth, 0 = random key each step
  // cue: what announces the new key — tonic strum, or a cadence that
  // establishes it (I-IV-V-I, or the jazz ii-V-I), timed to the beat
  var cp = { on: false, dir: 1, bars: 2, count: 0, cue: 'tonic' };
  var metRunning = false;

  function playCue() {
    var dia = [];
    try { dia = Theory.diatonic(curRoot(), curScale(), false); } catch (e) { /* not 7-note */ }
    if (!dia.length || cp.cue === 'tonic') { strumTonic(); return; }
    var beat = 60 / Math.max(30, Math.min(280, parseInt(App.store.get('met.bpm', 120), 10) || 120));
    var degs = cp.cue === '251' ? [1, 4, 0] : [0, 3, 4, 0];
    for (var i = 0; i < degs.length; i++) strumDia(dia[degs[i]], i * beat);
  }

  function cpPaint() {
    if (!els.cpGo) return;
    els.cpGo.textContent = cp.on ? 'Stop circle practice' : 'Start circle practice';
    els.cpGo.classList.toggle('danger', cp.on);
    els.cpGo.classList.toggle('primary', !cp.on);
    els.cpDir.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', parseInt(b.getAttribute('data-thdir'), 10) === cp.dir);
    });
    if (!cp.on) {
      els.cpStatus.textContent = 'The metronome walks the whole app around the circle — practice each key as it lands.';
    }
  }

  function cpStatusNow() {
    var root = curRoot();
    var nextTxt;
    if (cp.dir === 0) {
      nextTxt = 'a surprise key';
    } else {
      var nxt = Theory.mod12(root + (cp.dir > 0 ? 7 : 5));
      nextTxt = Theory.pcName(nxt, Theory.FLAT_KEYS.has(nxt));
    }
    els.cpStatus.textContent = 'Now ' + Theory.pcName(root, Theory.FLAT_KEYS.has(root)) +
      ' — next ' + nextTxt + ' in ' + cp.bars + (cp.bars === 1 ? ' bar' : ' bars') + '.';
  }

  function cpToggle() {
    if (cp.on) {
      cp.on = false;
      cpPaint();
      return;
    }
    cp.on = true;
    cp.count = 0;
    if (!metRunning) App.emit('met:toggle', {}); // synchronous — still inside the click
    cpPaint();
    cpStatusNow();
  }

  function cpAdvance() {
    // move the root a fifth / a fourth / anywhere (random), KEEPING the
    // current scale type — the circle highlight follows for major/minor
    var root;
    if (cp.dir === 0) {
      do { root = Math.floor(Math.random() * 12); } while (root === curRoot());
    } else {
      root = Theory.mod12(curRoot() + (cp.dir > 0 ? 7 : 5));
    }
    setKey(root, curScale());
    playCue(); // audio ctx is already running (metronome) — no gesture needed
    cpStatusNow();
  }

  // ---------------- card 3: degree ear trainer ----------------

  var quiz = { active: false, deg: -1, streak: 0, best: 0 };

  function quizRootMidi() {
    return 52 + Theory.mod12(curRoot() - 4); // E3..D#4 — comfortable register
  }

  function quizSteps() {
    return Theory.SCALES[curScale()].steps;
  }

  function quizNew() {
    var steps = quizSteps();
    quiz.active = true;
    quiz.deg = Math.floor(Math.random() * steps.length);
    quizPlay();
    renderQuizButtons(true);
    els.qFeedback.textContent = 'Root… then the mystery note. Which degree is it?';
    els.qPlay.textContent = 'Replay';
    els.qNext.style.display = 'none';
  }

  function quizPlay() {
    App.getAudio();
    var m0 = quizRootMidi();
    App.pluck(m0, 0, 0.8, 0.35);
    App.pluck(m0 + quizSteps()[quiz.deg], 0.85, 1.2, 0.35);
  }

  function quizAnswer(k) {
    if (!quiz.active) return;
    quiz.active = false;
    var info = Theory.scaleInfo(curRoot(), curScale(), Theory.FLAT_KEYS.has(curRoot()));
    var right = k === quiz.deg;
    if (right) {
      quiz.streak++;
      if (quiz.streak > quiz.best) quiz.best = quiz.streak;
      els.qFeedback.textContent = '✓ Yes — degree ' + (quiz.deg + 1) + ' (' +
        (info.names[quiz.deg] || '?') + ', ' + (info.intervals[quiz.deg] || '') + ').';
    } else {
      quiz.streak = 0;
      els.qFeedback.textContent = '✗ That was degree ' + (quiz.deg + 1) + ' (' +
        (info.names[quiz.deg] || '?') + ', ' + (info.intervals[quiz.deg] || '') + ').';
    }
    els.qStreak.textContent = 'streak ' + quiz.streak + ' · best ' + quiz.best;
    renderQuizButtons(false, k, quiz.deg);
    els.qNext.style.display = '';
  }

  function renderQuizButtons(enabled, picked, answer) {
    var steps = quizSteps();
    var pal = degPalette();
    var h = '';
    for (var i = 0; i < steps.length; i++) {
      var cls = 'th-qbtn';
      if (!enabled && answer !== undefined) {
        if (i === answer) cls += ' th-q-right';
        else if (i === picked) cls += ' th-q-wrong';
      }
      h += '<button type="button" class="' + cls + '" data-th-q="' + i + '" ' +
        (enabled ? '' : 'disabled ') + 'style="--deg-c:' + pal[i % 7] + '">' + (i + 1) + '</button>';
    }
    els.qBtns.innerHTML = h;
  }

  // ---------------- render / wiring ----------------

  function render() {
    renderCircle();
    renderGuide();
    if (!quiz.active) renderQuizButtons(false);
  }

  var CSS = '' +
    '.th-circlewrap{display:flex;justify-content:center;margin-top:6px;}' +
    '.th-circle{width:100%;max-width:380px;height:auto;}' +
    '.th-wg{cursor:pointer;stroke:var(--bg);stroke-width:1.5;transition:opacity 100ms ease;}' +
    '.th-wg-maj{fill:var(--card2);}' +
    '.th-wg-min{fill:var(--panel);}' +
    '.th-wg:hover{opacity:0.8;}' +
    '.th-wg.th-on{fill:var(--accent);}' +
    '.th-lb{fill:var(--text);font-family:var(--font-body);font-weight:600;text-anchor:middle;pointer-events:none;}' +
    '.th-lb-maj{font-size:17px;}' +
    '.th-lb-min{font-size:12px;fill:var(--muted);}' +
    '.th-lb-sig{font-size:10px;fill:var(--muted);}' +
    '.th-wg.th-on + .th-wg-min{}' +
    '.th-center{fill:var(--accent);font-family:var(--font-display);font-size:44px;text-anchor:middle;pointer-events:none;}' +
    '.th-center-sub{fill:var(--muted);font-size:13px;font-weight:600;text-anchor:middle;pointer-events:none;}' +
    '.th-noterow,.th-chordrow{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}' +
    '.th-note{border-color:var(--deg-c,var(--line));gap:7px;}' +
    '.th-note b{color:var(--deg-c,var(--accent));}' +
    '.th-iv{color:var(--muted);font-size:11.5px;}' +
    '.th-chord{cursor:pointer;font-family:inherit;color:var(--text);gap:7px;border-color:var(--deg-c,var(--line));}' +
    '.th-chord b{color:var(--deg-c,var(--accent));}' +
    '.th-qrow{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;}' +
    '.th-qbtn{width:52px;height:52px;border-radius:12px;border:2px solid var(--deg-c,var(--line));' +
      'background:var(--card2);color:var(--deg-c,var(--text));font-size:21px;font-weight:700;' +
      'font-family:var(--font-body);cursor:pointer;}' +
    '.th-qbtn[disabled]{opacity:0.55;cursor:default;}' +
    '.th-qbtn.th-q-right{background:var(--deg-c);color:#1c1206;opacity:1;}' +
    '.th-qbtn.th-q-wrong{border-style:dashed;opacity:0.8;}' +
    '.th-mt{margin-top:14px;}';

  function init(rootEl) {
    App.injectCSS('theorytab', CSS);
    rootEl.innerHTML =
      '<div class="card">' +
        '<h2>Circle of fifths</h2>' +
        '<div class="muted small">Tap any key to hear it and move the whole app there &mdash; outer ring majors, inner ring their relative minors. Neighbors share all but one note.</div>' +
        '<div class="th-circlewrap" id="th-circle"></div>' +
        '<h3 class="th-mt">Circle practice</h3>' +
        '<div class="row tight">' +
          '<button type="button" class="btn primary" id="th-cp-go">Start circle practice</button>' +
          '<span class="seg" id="th-cp-dir">' +
            '<button type="button" data-thdir="1" title="Clockwise — up a fifth each step">5ths ' + App.icon('right', 13) + '</button>' +
            '<button type="button" data-thdir="-1" title="Counter-clockwise — up a fourth each step">' + App.icon('left', 13) + ' 4ths</button>' +
            '<button type="button" data-thdir="0" title="Jump to a random key each step — the real test">Random</button>' +
          '</span>' +
          '<label class="field">Bars / key<select id="th-cp-bars">' +
            '<option value="1">1</option><option value="2">2</option>' +
            '<option value="4">4</option><option value="8">8</option></select></label>' +
          '<label class="field">On change<select id="th-cp-cue">' +
            '<option value="tonic">Tonic chord</option>' +
            '<option value="cadence">I&ndash;IV&ndash;V&ndash;I</option>' +
            '<option value="251">ii&ndash;V&ndash;I</option></select></label>' +
        '</div>' +
        '<div class="muted small th-mt" id="th-cp-status"></div>' +
      '</div>' +
      '<div class="card">' +
        '<h2 id="th-guide-title"></h2>' +
        '<h3>Notes &amp; intervals</h3>' +
        '<div class="th-noterow" id="th-notes"></div>' +
        '<div id="th-chordwrap"><h3 class="th-mt">Chords in the key &mdash; tap to hear</h3>' +
          '<div class="th-chordrow" id="th-chords"></div></div>' +
        '<h3 class="th-mt">Related keys</h3>' +
        '<div class="row tight" id="th-related"></div>' +
        '<div class="row tight th-mt">' +
          '<button type="button" class="btn" id="th-open-chords">Open in Chords ' + App.icon('right', 14) + '</button>' +
          '<button type="button" class="btn primary" id="th-practice">Practice this scale ' + App.icon('right', 14) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>Degree ear trainer</h2>' +
        '<div class="muted small">Hear the root, then a scale note &mdash; name the degree. Same colors as the fretboard, so your ears learn the same map as your eyes.</div>' +
        '<div class="th-qrow" id="th-qbtns"></div>' +
        '<div class="row tight th-mt">' +
          '<button type="button" class="btn primary" id="th-qplay">Start</button>' +
          '<button type="button" class="btn" id="th-qnext" style="display:none">Next note</button>' +
          '<span class="muted small" id="th-qstreak">streak 0 · best 0</span>' +
        '</div>' +
        '<div class="th-mt" id="th-qfeedback"></div>' +
      '</div>';

    els.circle = document.getElementById('th-circle');
    els.guideTitle = document.getElementById('th-guide-title');
    els.notes = document.getElementById('th-notes');
    els.chords = document.getElementById('th-chords');
    els.chordsRow = document.getElementById('th-chordwrap');
    els.related = document.getElementById('th-related');
    els.cpGo = document.getElementById('th-cp-go');
    els.cpDir = document.getElementById('th-cp-dir');
    els.cpBars = document.getElementById('th-cp-bars');
    els.cpCue = document.getElementById('th-cp-cue');
    els.cpStatus = document.getElementById('th-cp-status');
    els.qBtns = document.getElementById('th-qbtns');
    els.qPlay = document.getElementById('th-qplay');
    els.qNext = document.getElementById('th-qnext');
    els.qStreak = document.getElementById('th-qstreak');
    els.qFeedback = document.getElementById('th-qfeedback');

    els.circle.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-th-maj],[data-th-min]') : null;
      if (!t) return;
      if (t.hasAttribute('data-th-maj')) setKey(parseInt(t.getAttribute('data-th-maj'), 10), 'major');
      else setKey(parseInt(t.getAttribute('data-th-min'), 10), 'aeolian');
      strumTonic(); // hear where you landed (inside the tap gesture)
      if (cp.on) cpStatusNow();
    });

    // circle practice wiring
    var sd = App.store.get('th.cpDir', 1);
    cp.dir = (sd === -1 || sd === 0) ? sd : 1;
    cp.bars = [1, 2, 4, 8].indexOf(App.store.get('th.cpBars', 2)) !== -1 ? App.store.get('th.cpBars', 2) : 2;
    var sc = App.store.get('th.cpCue', 'tonic');
    cp.cue = ['tonic', 'cadence', '251'].indexOf(sc) !== -1 ? sc : 'tonic';
    els.cpBars.value = String(cp.bars);
    els.cpCue.value = cp.cue;
    els.cpGo.addEventListener('click', cpToggle);
    els.cpDir.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-thdir]');
      if (!b) return;
      var v = parseInt(b.getAttribute('data-thdir'), 10);
      cp.dir = (v === -1 || v === 0) ? v : 1;
      App.store.set('th.cpDir', cp.dir);
      cpPaint();
      if (cp.on) cpStatusNow();
    });
    els.cpCue.addEventListener('change', function () {
      cp.cue = ['tonic', 'cadence', '251'].indexOf(this.value) !== -1 ? this.value : 'tonic';
      App.store.set('th.cpCue', cp.cue);
    });
    els.cpBars.addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      cp.bars = [1, 2, 4, 8].indexOf(v) !== -1 ? v : 2;
      App.store.set('th.cpBars', cp.bars);
      if (cp.on) cpStatusNow();
    });
    App.on('met:state', function (d) {
      metRunning = !!(d && d.running);
      if (!metRunning && cp.on) { cp.on = false; cpPaint(); } // metronome stopped = drill over
    });
    App.on('met:beat', function (d) {
      if (!cp.on || !d || d.beat !== 0) return; // count bar starts only
      cp.count++;
      if (cp.count > cp.bars) { cpAdvance(); cp.count = 1; }
    });
    cpPaint();

    els.chords.addEventListener('click', function (e) {
      var b = e.target.closest('.th-chord');
      if (!b || !els.chords._dia) return;
      var d = els.chords._dia[parseInt(b.getAttribute('data-th-ch'), 10)];
      if (d) strumDia(d);
    });

    els.related.addEventListener('click', function (e) {
      var b = e.target.closest('.th-rel');
      if (!b) return;
      setKey(parseInt(b.getAttribute('data-th-root'), 10), b.getAttribute('data-th-scale'));
    });

    document.getElementById('th-open-chords').addEventListener('click', function () {
      App.switchTo('chords'); // chords already follows the shared key
    });
    document.getElementById('th-practice').addEventListener('click', function () {
      App.emit('fb:practice', { root: curRoot(), scale: curScale() });
    });

    els.qPlay.addEventListener('click', function () {
      if (quiz.active) quizPlay(); else quizNew();
    });
    els.qNext.addEventListener('click', quizNew);
    els.qBtns.addEventListener('click', function (e) {
      var b = e.target.closest('.th-qbtn');
      if (b && !b.disabled) quizAnswer(parseInt(b.getAttribute('data-th-q'), 10));
    });

    // stay in lockstep with the shared key, however it changes
    App.on('fb:set', function (d) { if (!d || d.source !== 'th') render(); });
    App.on('fb:scale', function () { render(); });

    render();
  }

  App.register('theory', {
    init: init,
    onShow: function () { render(); } // key or colors may have changed while away
  });
})();
