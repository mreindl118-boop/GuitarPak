/* GuitarLab fretboard module — interactive SVG scale/mode explorer.
 * Registers as 'fretboard'. Uses only App.* and Theory.* public APIs.
 * Persists settings under fb.* store keys.
 */
(function () {
  'use strict';

  // ---------------- state ----------------

  var state = {
    root: 9,              // pitch class, default A
    scale: 'minorPent',
    tuning: 'standard',
    frets: 24,            // 12 | 15 | 22 | 24
    display: 'notes',     // notes | intervals | degrees
    lefty: false,
    pos: 0,               // pentatonic box: 0 = All, 1..5 = box N (not persisted)
    mode: 1,              // 7-note scales: degree anchoring the practice window
    orient: 'v',          // 'v' nut-at-top (default) | 'h' classic left-to-right neck
    view: 'board',        // board | tab | sheet — one page, three linked views
    tabOri: 'h',          // tab view: 'h' classic lines | 'v' time flows down
    vFit: 'fit',          // tab+sheet: wrap to screen | one scrolling line
    vSize: 'm'            // tab+sheet text/notation size
  };

  var els = {};
  var flashTimer = null;
  var flashEl = null;

  // ---------------- geometry (equal fret spacing for readability) ----------------

  var LABEL_W = 30;   // string-name column
  var OPEN_W = 40;    // open-string (fret 0) column, left of the nut
  var FRET_W = 46;    // width of each fret column
  var TOP = 26;       // y of the top string (high E)
  var GAP = 30;       // string spacing
  var NUM_H = 34;     // room for fret numbers under the board

  // one bright, unique color per SCALE DEGREE (index = step in the scale) —
  // all light enough for dark label text, none of them dark/black. DEG_COLORS
  // is the live palette; users can recolor each degree in the settings panel
  // (persisted as fb.colors, reset restores DEG_DEFAULTS).
  var DEG_DEFAULTS = ['#ffab47', '#e8d44d', '#7ad97a', '#4cc9b0', '#6ea8fe', '#b48ef0', '#ff85b3'];
  var DEG_COLORS = DEG_DEFAULTS.slice();
  var DEG_TEXT = '#1c1206';

  var STRING_WIDTHS = [2.6, 2.3, 2.0, 1.5, 1.2, 1.0]; // index = stringIdx (0 = low E, wound = thicker)

  // ---------------- persistence ----------------

  function loadState() {
    var r = App.store.get('fb.root', 9);
    if (typeof r === 'number' && isFinite(r) && r >= 0 && r < 12) state.root = Math.floor(r);
    var sc = App.store.get('fb.scale', 'minorPent');
    if (Theory.SCALES[sc]) state.scale = sc;
    var tu = App.store.get('fb.tuning', 'standard');
    if (Theory.TUNINGS[tu]) state.tuning = tu;
    var fr = App.store.get('fb.frets', 24);
    if (fr === 12 || fr === 15 || fr === 22 || fr === 24) state.frets = fr;
    // one-time migration: settings saved before 24 frets existed stay pinned
    // at the old maximum — bump everyone to the full neck once
    if (!App.store.get('fb.migr24', false)) {
      state.frets = 24;
      App.store.set('fb.frets', 24);
      App.store.set('fb.migr24', true);
    }
    var d = App.store.get('fb.display', 'notes');
    if (d === 'notes' || d === 'intervals' || d === 'degrees') state.display = d;
    state.lefty = !!App.store.get('fb.lefty', false);
    var ori = App.store.get('fb.orient', 'v');
    if (ori === 'v' || ori === 'h') state.orient = ori;
    var vw = App.store.get('fb.view', 'board');
    if (vw === 'board' || vw === 'tab' || vw === 'sheet') state.view = vw;
    var to = App.store.get('tab.orient', 'h');
    if (to === 'h' || to === 'v') state.tabOri = to;
    var vf = App.store.get('tab.fit', 'fit');
    if (vf === 'fit' || vf === 'scroll') state.vFit = vf;
    var vs = App.store.get('tab.size', 'm');
    if (vs === 's' || vs === 'm' || vs === 'l') state.vSize = vs;
    var m = App.store.get('fb.mode', 1);
    if (typeof m === 'number' && m >= 1 && m <= 7) state.mode = Math.floor(m);
    var cols = App.store.get('fb.colors', null);
    if (Array.isArray(cols) && cols.length === 7 &&
        cols.every(function (c) { return /^#[0-9a-fA-F]{6}$/.test(c); })) {
      DEG_COLORS = cols.slice();
    }
  }

  function saveState() {
    App.store.set('fb.root', state.root);
    App.store.set('fb.scale', state.scale);
    App.store.set('fb.tuning', state.tuning);
    App.store.set('fb.frets', state.frets);
    App.store.set('fb.display', state.display);
    App.store.set('fb.lefty', state.lefty);
  }

  // ---------------- helpers ----------------

  function preferFlat() {
    return Theory.FLAT_KEYS.has(Theory.mod12(state.root));
  }

  function isPent() {
    var sc = Theory.SCALES[state.scale];
    return !!sc && sc.steps.length === 5;
  }

  function isHept() {
    var sc = Theory.SCALES[state.scale];
    return !!sc && sc.steps.length === 7;
  }

  // Mode k window (7-note scales): a 5-fret practice window anchored where the
  // k-th scale degree sits on the low string, walking up the neck from the
  // lowest root — G major: G(1) fr.3, A(2) fr.5, B(3) fr.7 ... F#(7) fr.14.
  // The SCALE itself never changes (roots stay put); only the window moves.
  function modeWindow(k) {
    var steps = Theory.SCALES[state.scale].steps;
    var t0 = Theory.TUNINGS[state.tuning].midi[0];
    var rootFret = 0, f;
    for (f = 0; f < 12; f++) {
      if (Theory.mod12(t0 + f) === Theory.mod12(state.root)) { rootFret = f; break; }
    }
    var a = rootFret + steps[(k - 1) % steps.length];
    if (a + 4 > state.frets && a - 12 >= 0) a -= 12;
    return [a, a + 4];
  }

  // "A Dorian · fr 5" — the shared label for the dropdown and the swipe flash
  function modeLabel(info, k) {
    var name = modeName(k);
    return info.names[k - 1] + (name ? ' ' + name : '') + ' · fr ' + modeWindow(k)[0];
  }

  // Change the active mode from anywhere (dropdown, fullscreen swipe): moves
  // the window band, scrolls to it, and — if an exercise was running — restarts
  // it from the new position so the practice follows the switch.
  function setMode(k) {
    k = ((k - 1) % 7 + 7) % 7 + 1; // wrap around for swipe cycling
    if (k === state.mode) return;
    state.mode = k;
    App.store.set('fb.mode', k);
    var wasRunning = pr.running;
    renderPosRow();
    renderBoard();               // redraws the band (this stops the runner)
    scrollToFret(modeWindow(k)[0]);
    if (wasRunning) prStart();   // pick the exercise back up in the new window
    App.emit('fb:set', { source: 'fb', mode: k }); // context bar follows the swipe
  }

  // Name the k-th rotation of the current scale by matching its step pattern
  // against the known 7-note scales ("Dorian", "Mixolydian", ...). Rotations
  // with no named match (most harmonic/melodic-minor modes) fall back to ''.
  function modeName(k) {
    var steps = Theory.SCALES[state.scale].steps;
    var base = steps[(k - 1) % 7];
    var rot = [];
    for (var i = 0; i < 7; i++) rot.push(Theory.mod12(steps[(k - 1 + i) % 7] - base));
    var key = rot.join(',');
    for (var id in Theory.SCALES) {
      var sc = Theory.SCALES[id];
      if (sc.steps.length === 7 && sc.steps.join(',') === key) {
        var paren = sc.name.match(/\(([^)]+)\)/);
        return paren ? paren[1] : sc.name;
      }
    }
    return '';
  }

  // Box N window: anchored at the Nth scale tone on the low E string (box 1 = root).
  // Returns [loFret, hiFret] (5-fret window), shifted down an octave if it would
  // fall entirely past the last drawn fret.
  function boxWindow(n, pcSet) {
    var t0 = Theory.TUNINGS[state.tuning].midi[0];
    var rootFret = 0;
    var f;
    for (f = 0; f < 12; f++) {
      if (Theory.mod12(t0 + f) === Theory.mod12(state.root)) { rootFret = f; break; }
    }
    var anchors = [rootFret];
    f = rootFret + 1;
    while (anchors.length < 5 && f < rootFret + 13) {
      if (pcSet.has(Theory.mod12(t0 + f))) anchors.push(f);
      f++;
    }
    var a = anchors[Math.min(n, anchors.length) - 1];
    if (a + 4 > state.frets && a - 12 >= 0) a -= 12;
    return [a, a + 4];
  }

  // ---------------- rendering ----------------

  function renderAll() {
    renderPosRow();
    renderBoard();
    renderInfo();
    renderLegend(); // legend colors are per-degree, so it changes with the scale
    renderAltView(); // tab/sheet views follow every board-state change
  }

  function renderPosRow() {
    if (state.view !== 'board') {
      els.posrow.style.display = 'none';
      els.posrow.innerHTML = '';
      return;
    }
    if (isPent()) {
      els.posrow.style.display = '';
      var h = '<span class="muted small">Position:</span>';
      for (var i = 0; i <= 5; i++) {
        h += '<button type="button" class="chip fb-chip' + (state.pos === i ? ' active' : '') +
          '" data-fbpos="' + i + '">' + (i === 0 ? 'All' : 'Box ' + i) + '</button>';
      }
      els.posrow.innerHTML = h;
      return;
    }
    state.pos = 0;
    els.posrow.style.display = 'none';
    els.posrow.innerHTML = '';
  }

  function renderColorInputs() {
    if (!els.colors) return;
    var h = '';
    for (var i = 0; i < 7; i++) {
      h += '<label class="fb-colpick" title="Color for scale degree ' + (i + 1) + '">' + (i + 1) +
        '<input type="color" value="' + DEG_COLORS[i] + '" data-fbcol="' + i + '"></label>';
    }
    h += '<button type="button" class="chip fb-chip" id="fb-col-reset">Reset</button>';
    els.colors.innerHTML = h;
  }

  function renderBoard() {
    try {
      renderBoardInner();
    } catch (e) {
      els.scroll.innerHTML = '<div class="error">Could not draw the fretboard: ' + e.message + '</div>';
    }
  }

  function renderBoardInner() {
    prStop(); // board geometry is changing — any running exercise is invalid
    var N = state.frets;
    var tun = Theory.TUNINGS[state.tuning];
    var pf = preferFlat();
    var info = Theory.scaleInfo(state.root, state.scale, pf);
    if (!info) {
      els.scroll.innerHTML = '<div class="error">Unknown scale "' + state.scale + '".</div>';
      return;
    }

    var nutX = LABEL_W + OPEN_W;
    var W = nutX + N * FRET_W + 12;
    var H = TOP + 5 * GAP + NUM_H;
    var lefty = state.lefty;

    // The board is laid out in "horizontal neck" coordinates (x = along the
    // neck, y = across the strings) and then the WHOLE group — letters
    // included — is rotated 90° clockwise, so on screen the nut sits at the
    // top, the neck runs down, low E lands on the left, and labels read
    // along the neck from the low-string side up to the high strings.
    function fx(x) { return x; }
    function colCX(f) { return f === 0 ? LABEL_W + OPEN_W / 2 : nutX + (f - 0.5) * FRET_W; }
    // left-handed mirrors the STRING order (across the neck), keeping text readable
    function rowY(r) { return TOP + (lefty ? 5 - r : r) * GAP; }

    var win = null;
    if (isPent() && state.pos > 0) win = boxWindow(state.pos, info.pcSet);

    var boardTop = TOP - 15;
    var boardBot = TOP + 5 * GAP + 15;
    var s = [];
    var r, f, i, x;

    // vertical: the whole group is rotated 90° cw (viewBox H x W, neck runs
    // down). Horizontal: no rotation — the board reads left to right and every
    // label sits upright. All child coordinates are identical either way.
    var horiz = state.orient === 'h';
    s.push('<svg id="fb-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
      (horiz ? W + ' ' + H : H + ' ' + W) +
      '" role="img" aria-label="Fretboard diagram">');
    s.push(horiz ? '<g id="fb-rot">'
                 : '<g id="fb-rot" transform="rotate(90) translate(0,-' + H + ')">');

    // board background
    s.push('<rect x="' + nutX + '" y="' + boardTop + '" width="' + (N * FRET_W) +
      '" height="' + (boardBot - boardTop) + '" rx="4" fill="var(--panel)"/>');

    // mode practice window (7-note scales): a soft band marking where the
    // exercise runs — the notes themselves never change or hide
    if (isHept()) {
      var mwin = modeWindow(state.mode);
      var bx0 = mwin[0] === 0 ? LABEL_W : nutX + (mwin[0] - 1) * FRET_W;
      var bx1 = nutX + Math.min(mwin[1], N) * FRET_W;
      s.push('<rect x="' + bx0 + '" y="' + boardTop + '" width="' + (bx1 - bx0) +
        '" height="' + (boardBot - boardTop) + '" fill="var(--accent)" opacity="0.09" pointer-events="none"/>');
      s.push('<line x1="' + bx0 + '" y1="' + boardTop + '" x2="' + bx0 + '" y2="' + boardBot +
        '" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4" opacity="0.6" pointer-events="none"/>');
      s.push('<line x1="' + bx1 + '" y1="' + boardTop + '" x2="' + bx1 + '" y2="' + boardBot +
        '" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4" opacity="0.6" pointer-events="none"/>');
    }

    // inlay markers
    var inlayY = TOP + 2.5 * GAP;
    var singles = [3, 5, 7, 9, 15, 17, 19, 21];
    for (i = 0; i < singles.length; i++) {
      f = singles[i];
      if (f <= N) s.push('<circle cx="' + fx(colCX(f)) + '" cy="' + inlayY + '" r="5" fill="var(--line)"/>');
    }
    var doubles = [12, 24];
    for (i = 0; i < doubles.length; i++) {
      f = doubles[i];
      if (f <= N) {
        s.push('<circle cx="' + fx(colCX(f)) + '" cy="' + (TOP + 1.5 * GAP) + '" r="5" fill="var(--line)"/>');
        s.push('<circle cx="' + fx(colCX(f)) + '" cy="' + (TOP + 3.5 * GAP) + '" r="5" fill="var(--line)"/>');
      }
    }

    // fret wires + nut
    for (f = 1; f <= N; f++) {
      x = fx(nutX + f * FRET_W);
      s.push('<line x1="' + x + '" y1="' + boardTop + '" x2="' + x + '" y2="' + boardBot +
        '" stroke="var(--line)" stroke-width="2"/>');
    }
    x = fx(nutX);
    s.push('<line x1="' + x + '" y1="' + boardTop + '" x2="' + x + '" y2="' + boardBot +
      '" stroke="#cfd6e4" stroke-width="6"/>');

    // strings (row 0 = high E on top) + open-note labels at the nut
    for (r = 0; r < 6; r++) {
      var sIdx = 5 - r;
      var y = rowY(r);
      s.push('<line x1="' + fx(nutX) + '" y1="' + y + '" x2="' + fx(nutX + N * FRET_W) + '" y2="' + y +
        '" stroke="var(--muted)" stroke-width="' + STRING_WIDTHS[sIdx] + '"/>');
      s.push('<text x="' + fx(LABEL_W / 2) + '" y="' + (y + 4) +
        '" text-anchor="middle" font-size="11.5" font-weight="700" fill="var(--muted)">' +
        Theory.pcName(Theory.mod12(tun.midi[sIdx]), pf) + '</text>');
    }

    // fret numbers
    for (f = 1; f <= N; f++) {
      s.push('<text x="' + fx(colCX(f)) + '" y="' + (TOP + 5 * GAP + 27) +
        '" text-anchor="middle" font-size="10.5" fill="var(--muted)">' + f + '</text>');
    }

    // scale-tone dots
    for (r = 0; r < 6; r++) {
      var si = 5 - r;
      var cy = rowY(r);
      for (f = 0; f <= N; f++) {
        var pc = Theory.mod12(tun.midi[si] + f);
        if (!info.pcSet.has(pc)) continue;
        if (win && (f < win[0] || f > win[1])) continue;
        var step = info.pcToStep.get(pc);
        var fill = DEG_COLORS[step % 7];
        var label;
        if (state.display === 'intervals') label = info.intervals[step];
        else if (state.display === 'degrees') label = String(step + 1);
        else label = Theory.pcName(pc, pf);
        var cx = fx(colCX(f));
        s.push('<circle cx="' + cx + '" cy="' + cy + '" r="11.5" fill="' + fill + '"' +
          (step === 0 ? ' stroke="#ffffff" stroke-width="1.6"' : '') + '/>');
        s.push('<text x="' + cx + '" y="' + (cy + 3.5) +
          '" text-anchor="middle" font-size="10.5" font-weight="700" fill="' + DEG_TEXT + '">' +
          label + '</text>');
      }
    }

    // jam chord-tone rings — one per position, faded in/out per chord by CSS
    // transition (this is what makes the chord changes morph smoothly)
    for (r = 0; r < 6; r++) {
      var js = 5 - r;
      var jy = rowY(r);
      for (f = 0; f <= N; f++) {
        s.push('<circle class="fb-jam-ring" data-pc="' + Theory.mod12(tun.midi[js] + f) +
          '" cx="' + fx(colCX(f)) + '" cy="' + jy + '" r="15" fill="none" ' +
          'stroke="rgba(255,255,255,0.85)" stroke-width="2.5" pointer-events="none"/>');
      }
    }

    // invisible hit rects on top — every position is clickable/playable
    for (r = 0; r < 6; r++) {
      var hs = 5 - r;
      var hy = rowY(r);
      for (f = 0; f <= N; f++) {
        var x0 = f === 0 ? LABEL_W : nutX + (f - 1) * FRET_W;
        var w0 = f === 0 ? OPEN_W : FRET_W;
        var rx = lefty ? W - (x0 + w0) : x0;
        s.push('<rect class="fb-hit" x="' + rx + '" y="' + (hy - GAP / 2) + '" width="' + w0 +
          '" height="' + GAP + '" fill="transparent" data-fb-s="' + hs + '" data-fb-f="' + f +
          '" data-fb-cx="' + fx(colCX(f)) + '" data-fb-cy="' + hy + '"/>');
      }
    }

    s.push('</g></svg>');
    vb.w = horiz ? W : H;  // on-screen width  (h: along the neck, v: across it)
    vb.h = horiz ? H : W;  // on-screen height (h: across the strings, v: along the neck)
    var keepX = els.scroll.scrollLeft;
    var keepY = els.scroll.scrollTop;
    els.scroll.innerHTML = s.join('');
    applyZoom();
    els.scroll.scrollLeft = keepX;
    els.scroll.scrollTop = keepY;
    if (jamLast) jamPaint(jamLast); // fresh svg — reapply the live chord overlay
  }

  // ---------------- jam follow (scale-over-chord visualization) ----------------

  var jamLast = null;
  var autoMode = false;

  function jamPaint(ev) {
    var svg = document.getElementById('fb-svg');
    if (svg) {
      var rings = svg.querySelectorAll('.fb-jam-ring');
      var tones = ev ? ev.tones : [];
      for (var i = 0; i < rings.length; i++) {
        var pc = parseInt(rings[i].getAttribute('data-pc'), 10);
        var on = !!ev && tones.indexOf(pc) !== -1;
        rings[i].classList.toggle('on', on);
        rings[i].classList.toggle('root', on && pc === ev.rootPc);
      }
    }
    var chip = document.getElementById('fb-jamchip');
    if (chip) {
      if (ev) {
        chip.style.display = '';
        chip.textContent = '♫ ' + ev.name + ' → ' + ev.suggestedName;
      } else {
        chip.style.display = 'none';
      }
    }
  }

  // re-root the board to the suggested chord scale, with a quick crossfade
  function jamApplySuggestion(ev) {
    if (!ev || !Theory.SCALES[ev.suggestedScale]) return;
    if (state.root === ev.rootPc && state.scale === ev.suggestedScale) return;
    state.root = ev.rootPc;
    state.scale = ev.suggestedScale;
    state.pos = 0;
    els.scroll.classList.add('fb-fade');
    setTimeout(function () {
      renderPosRow();
      renderBoard();
      renderInfo();
      els.scroll.classList.remove('fb-fade');
    }, 130);
  }

  // ---- fluid pan/zoom viewport ----
  // The stage is a fixed-height 2D scroll container. zoom = 1 sizes the SVG so
  // the strings FILL the stage height (the neck extends past the right edge and
  // scrolls); minZoom shrinks until the whole neck fits the width. Native
  // scrolling supplies panning + momentum in both axes.

  var vb = { w: 0, h: 0 };  // current SVG viewBox size
  var zoom = 1;
  var ZMAX = 3.5;
  var suppressClick = false; // true briefly after pan / pinch / double-tap

  var BASE_MAX_W = 520; // cap so wide desktop stages don't blow the board up

  function baseWidth(wrap) {
    // vertical: zoom 1 = the six strings span the stage width (capped); the
    // neck runs past the bottom edge and scrolls vertically.
    // horizontal: zoom 1 = the whole neck spans the stage width; zooming in
    // scrolls sideways along the neck.
    if (!vb.w || !wrap || !wrap.clientWidth) return 0;
    if (state.orient === 'h') return wrap.clientWidth;
    return Math.min(wrap.clientWidth, BASE_MAX_W);
  }

  function minZoom(wrap) {
    // smallest zoom = the whole neck visible (in the height when vertical;
    // horizontal zoom 1 already fits the neck to the width)
    if (state.orient === 'h') return 1;
    var bw = baseWidth(wrap);
    if (bw <= 0 || !vb.h) return 1;
    return Math.min(1, ((wrap.clientHeight - 8) * vb.w / vb.h) / bw);
  }

  function applyZoom() {
    var svg = document.getElementById('fb-svg');
    var wrap = els.scroll;
    if (!svg || !wrap) return;
    var bw = baseWidth(wrap);
    if (bw <= 0) return; // panel hidden — onShow re-applies
    var mz = minZoom(wrap);
    if (zoom < mz) zoom = mz;
    svg.style.width = Math.round(bw * zoom) + 'px';
    var lbl = document.getElementById('fb-zlabel');
    if (lbl) lbl.textContent = Math.round(zoom * 100) + '%';
  }

  // Zoom keeping the content point under (anchorClientX, anchorClientY) fixed.
  function setZoom(z, anchorClientX, anchorClientY) {
    var wrap = els.scroll;
    z = Math.max(minZoom(wrap), Math.min(ZMAX, z));
    var rect = wrap.getBoundingClientRect();
    var mx = anchorClientX == null ? rect.width / 2 : anchorClientX - rect.left;
    var my = anchorClientY == null ? rect.height / 2 : anchorClientY - rect.top;
    var cx = wrap.scrollLeft + mx;
    var cy = wrap.scrollTop + my;
    var k = z / zoom;
    zoom = z;
    applyZoom();
    wrap.scrollLeft = cx * k - mx;
    wrap.scrollTop = cy * k - my;
  }

  function endGesture() {
    suppressClick = true;
    setTimeout(function () { suppressClick = false; }, 350);
  }

  // transient "2 · A Dorian · fr 5" pill after a fullscreen mode swipe
  function flashMode() {
    var info = Theory.scaleInfo(state.root, state.scale, preferFlat());
    if (!info) return;
    var el = document.getElementById('fb-modeflash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fb-modeflash';
      els.board.appendChild(el);
    }
    el.textContent = state.mode + ' · ' + modeLabel(info, state.mode);
    el.classList.remove('show');
    void el.offsetWidth; // restart the fade animation
    el.classList.add('show');
  }

  function wireViewport() {
    var wrap = els.scroll;
    var pinch = null;
    var lastTap = { t: 0, x: 0 };
    var swipe = null; // fullscreen mode-switch flick (7-note scales only)

    wrap.addEventListener('touchstart', function (e) {
      swipe = e.touches.length === 1
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), sl: wrap.scrollLeft }
        : null;
      if (e.touches.length === 2) {
        pinch = {
          d0: Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                         e.touches[0].clientY - e.touches[1].clientY),
          z0: zoom
        };
      }
    }, { passive: true });

    wrap.addEventListener('touchmove', function (e) {
      if (pinch && e.touches.length === 2) {
        e.preventDefault(); // our zoom, not the browser's page zoom
        var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                           e.touches[0].clientY - e.touches[1].clientY);
        var midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        var midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        if (pinch.d0 > 0) setZoom(pinch.z0 * d / pinch.d0, midX, midY);
      }
    }, { passive: false });

    wrap.addEventListener('touchend', function (e) {
      if (pinch) {
        if (e.touches.length === 0) { pinch = null; endGesture(); }
        return;
      }
      // fullscreen mode swipe: a fast, mostly-horizontal flick that didn't pan
      // the board sideways cycles the practice-window mode (wraps 7 -> 1)
      if (swipe && maxMode && isHept() &&
          e.changedTouches.length === 1 && e.touches.length === 0) {
        var sdx = e.changedTouches[0].clientX - swipe.x;
        var sdy = e.changedTouches[0].clientY - swipe.y;
        var panned = Math.abs(wrap.scrollLeft - swipe.sl) > 5;
        if (Date.now() - swipe.t < 400 && Math.abs(sdx) >= 60 &&
            Math.abs(sdx) > 2 * Math.abs(sdy) && !panned) {
          swipe = null;
          lastTap.t = 0; // a flick is not half of a double-tap
          endGesture();
          setMode(state.mode + (sdx < 0 ? 1 : -1)); // swipe left = next mode
          flashMode();
          return;
        }
      }
      // double-tap toggles whole-neck fit <-> fill-height, centred on the tap
      if (e.changedTouches.length === 1 && e.touches.length === 0) {
        var x = e.changedTouches[0].clientX;
        var y = e.changedTouches[0].clientY;
        var now = Date.now();
        if (now - lastTap.t < 320 && Math.abs(x - lastTap.x) < 44) {
          e.preventDefault();
          endGesture();
          var fitZ = minZoom(wrap);
          if (fitZ >= 0.999) setZoom(zoom > 1.05 ? 1 : 2.2, x, y);
          else setZoom(zoom > fitZ * 1.05 ? fitZ : 1, x, y);
          lastTap.t = 0;
        } else {
          lastTap.t = now;
          lastTap.x = x;
        }
      }
    }, { passive: false });

    // trackpad pinch / Ctrl+wheel on desktop
    wrap.addEventListener('wheel', function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(zoom * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
    }, { passive: false });

    // mouse drag to pan (click-to-pluck still works via the moved threshold)
    var drag = null;
    wrap.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, sl: wrap.scrollLeft, st: wrap.scrollTop, moved: false };
    });
    window.addEventListener('mousemove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      var dy = e.clientY - drag.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) drag.moved = true;
      if (drag.moved) {
        wrap.scrollLeft = drag.sl - dx;
        wrap.scrollTop = drag.st - dy;
      }
    });
    window.addEventListener('mouseup', function () {
      if (drag && drag.moved) endGesture();
      drag = null;
    });

    // keep the fill-height sizing correct across rotations / window resizes
    var rsTimer = null;
    window.addEventListener('resize', function () {
      if (rsTimer) clearTimeout(rsTimer);
      rsTimer = setTimeout(applyZoom, 120);
    });
  }

  // ---------------- practice runner ----------------
  // Steps through the current scale (in the active position window) in time
  // with its own click: a glowing ring marks the note to play NOW, a dashed
  // ring previews the next one. Patterns: the straight scale or sliding groups
  // of 3-7, each playable up, down, or up-and-down.

  var pr = {
    running: false, idx: 0, seq: null, path: [],
    pattern: 'scale', dir: 'up', bpm: 80, rate: 1, sound: true, click: true,
    timer: null, raf: 0, nextT: 0, vis: [], ctx: null
  };

  function colCX2(f) {
    var nutX = LABEL_W + OPEN_W;
    return f === 0 ? LABEL_W + OPEN_W / 2 : nutX + (f - 0.5) * FRET_W;
  }

  // bring a fret into view (vertical: neck-x -> scrollTop; horizontal -> scrollLeft)
  function scrollToFret(f) {
    var svg = els.scroll && els.scroll.querySelector('svg');
    if (!svg || !vb.h) return;
    var nutX = LABEL_W + OPEN_W;
    var x = f <= 0 ? 0 : nutX + (f - 1) * FRET_W;
    if (state.orient === 'h') {
      var lt = (x / vb.w) * svg.getBoundingClientRect().width - 30;
      els.scroll.scrollTo({ left: Math.max(0, lt), behavior: 'smooth' });
    } else {
      var target = (x / vb.h) * svg.getBoundingClientRect().height - 30;
      els.scroll.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
  }

  function rowY2(s) { return TOP + (state.lefty ? s : 5 - s) * GAP; }

  // playable positions come from the shared exercise engine (Theory), plus
  // this board's screen coordinates for the runner's rings
  function prPath() {
    var ss = /^ss([0-5])$/.exec(pr.pattern);
    var im = /^i[0-9]+m([0-9]+)$/.exec(pr.pattern);
    return Theory.exercisePath({
      rootPc: state.root, scaleId: state.scale, tuningId: state.tuning,
      maxFret: state.frets, mode: state.mode, pentBox: isPent() ? state.pos : 0,
      singleString: ss ? parseInt(ss[1], 10) : undefined,
      stringMask: im ? parseInt(im[1], 10) : undefined
    }).map(function (n) {
      return { s: n.s, f: n.f, midi: n.midi, cx: colCX2(n.f), cy: rowY2(n.s) };
    });
  }

  function prSeq(path, pattern, dir) {
    return Theory.exerciseSeq(path, pattern, dir);
  }

  function prRings() {
    var g = document.getElementById('fb-rot');
    if (!g) return null;
    var cur = document.getElementById('fb-pr-ring');
    if (!cur) {
      var next = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      next.setAttribute('id', 'fb-pr-ring2');
      next.setAttribute('r', '13');
      next.setAttribute('fill', 'none');
      next.setAttribute('stroke', 'var(--accent)');
      next.setAttribute('stroke-width', '1.6');
      next.setAttribute('stroke-dasharray', '4 4');
      next.setAttribute('opacity', '0.55');
      next.setAttribute('pointer-events', 'none');
      g.appendChild(next);
      cur = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      cur.setAttribute('id', 'fb-pr-ring');
      cur.setAttribute('r', '15.5');
      cur.setAttribute('fill', 'rgba(255,171,71,0.16)');
      cur.setAttribute('stroke', 'var(--accent)');
      cur.setAttribute('stroke-width', '3');
      cur.setAttribute('pointer-events', 'none');
      g.appendChild(cur);
    }
    return { cur: cur, next: document.getElementById('fb-pr-ring2') };
  }

  function prClearRings() {
    var a = document.getElementById('fb-pr-ring');
    var b = document.getElementById('fb-pr-ring2');
    if (a && a.parentNode) a.parentNode.removeChild(a);
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  function prNodeAt(step) {
    return pr.path[pr.seq[step % pr.seq.length]];
  }

  function prTick() {
    // if a main-thread stall left us behind the audio clock, jump forward —
    // a short gap beats a burst of silent past-dated notes
    if (pr.nextT < pr.ctx.currentTime + 0.01) pr.nextT = pr.ctx.currentTime + 0.05;
    var horizon = pr.ctx.currentTime + 0.25;
    while (pr.nextT < horizon) {
      var node = pr.path[pr.seq[pr.idx % pr.seq.length]];
      var nextNode = pr.path[pr.seq[(pr.idx + 1) % pr.seq.length]];
      var when = pr.nextT - pr.ctx.currentTime;
      if (pr.sound) App.pluck(node.midi, when, 0.55, 0.32);
      if (pr.click) {
        var o = pr.ctx.createOscillator(), gn = pr.ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 1150;
        gn.gain.setValueAtTime(0.22, pr.nextT);
        gn.gain.exponentialRampToValueAtTime(0.0001, pr.nextT + 0.03);
        o.connect(gn);
        gn.connect(pr.ctx.destination);
        o.start(pr.nextT);
        o.stop(pr.nextT + 0.05);
      }
      pr.vis.push({ t: pr.nextT, node: node, next: nextNode, step: pr.idx });
      if (pr.vis.length > 64) pr.vis.shift();
      pr.idx++;
      pr.nextT += 60 / pr.bpm / pr.rate;
    }
  }

  function prDraw() {
    if (!pr.running) return;
    var now = pr.ctx.currentTime;
    var hit = null;
    while (pr.vis.length && pr.vis[0].t <= now) hit = pr.vis.shift();
    if (hit) {
      var rings = state.view === 'board' ? prRings() : null;
      if (rings) {
        rings.cur.setAttribute('cx', hit.node.cx);
        rings.cur.setAttribute('cy', hit.node.cy);
        if (hit.next) {
          rings.next.setAttribute('cx', hit.next.cx);
          rings.next.setAttribute('cy', hit.next.cy);
          rings.next.setAttribute('opacity', '0.55');
        } else {
          rings.next.setAttribute('opacity', '0');
        }
      }
      var total = pr.seq.length;
      if (state.view === 'board') {
        prScrollTo(hit.node);
      } else {
        var cont = state.view === 'tab' ? els.tabout : els.sheetwrap;
        var prev = cont.querySelector('.now');
        if (prev) prev.classList.remove('now');
        var cur = cont.querySelector('[data-step="' + (hit.step % total) + '"]');
        if (cur) {
          cur.classList.add('now');
          if (cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }
      prStatus((hit.step % total) + 1 + ' / ' + total);
    }
    pr.raf = requestAnimationFrame(prDraw);
  }

  // keep the active ring inside the middle band of the stage
  function prScrollTo(node) {
    var wrap = els.scroll;
    var svg = document.getElementById('fb-svg');
    if (!wrap || !svg) return;
    var scale = svg.getBoundingClientRect().width / vb.w;
    var along = node.cx * scale; // screen distance along the neck
    if (state.orient === 'h') {
      var lt = Math.max(0, along - wrap.clientWidth * 0.45);
      if (Math.abs(wrap.scrollLeft - lt) > wrap.clientWidth * 0.22) {
        wrap.scrollTo({ left: lt, behavior: 'smooth' });
      }
    } else {
      var target = Math.max(0, along - wrap.clientHeight * 0.45);
      if (Math.abs(wrap.scrollTop - target) > wrap.clientHeight * 0.22) {
        wrap.scrollTo({ top: target, behavior: 'smooth' });
      }
    }
  }

  function prStatus(text) {
    var el = document.getElementById('fb-pr-status');
    if (el) el.textContent = text;
  }

  // ---------------- alternate views: tab + sheet (linked to everything) ----
  var VSIZES = { s: 11, m: 13.5, l: 17 };

  function altExercise() {
    var path = prPath();
    return { path: path, seq: prSeq(path, pr.pattern, pr.dir) };
  }

  function noteColor(info, pc) {
    var step = info.pcToStep.get(pc);
    return DEG_COLORS[(step || 0) % 7];
  }

  function tabCellHTML(n, i, info) {
    var pc = Theory.mod12(n.midi);
    var root = info.pcToStep.get(pc) === 0;
    return '<span class="fbv-n' + (root ? ' fbv-root' : '') + '" data-step="' + i +
      '" style="color:' + noteColor(info, pc) + '">-' + n.f + '-</span>';
  }

  function tabSystemHTML(ex, labels, info, from, to) {
    var rows = [], s, i, r, lw = 0;
    for (s = 0; s < 6; s++) if (labels[s].length > lw) lw = labels[s].length;
    for (s = 5; s >= 0; s--) {
      rows.push({ s: s, html: labels[s] + new Array(lw - labels[s].length + 1).join(' ') + '|' });
    }
    for (i = from; i < to; i++) {
      var n = ex.path[ex.seq[i]];
      var w = String(n.f).length + 2;
      for (r = 0; r < rows.length; r++) {
        rows[r].html += rows[r].s === n.s ? tabCellHTML(n, i, info) : new Array(w + 1).join('-');
      }
    }
    return rows.map(function (row) { return row.html + '|'; }).join('\n');
  }

  function renderTabView() {
    var out = els.tabout;
    if (!out || state.view !== 'tab') return;
    var ex = altExercise();
    var info = Theory.scaleInfo(state.root, state.scale, preferFlat());
    out.style.fontSize = VSIZES[state.vSize] + 'px';
    if (!ex.seq.length) { out.textContent = '(no notes in this window)'; return; }
    var tun = Theory.TUNINGS[state.tuning];
    var pf = preferFlat();
    var labels = [];
    for (var s = 0; s < 6; s++) labels.push(Theory.pcName(Theory.mod12(tun.midi[s]), pf));

    if (state.tabOri === 'v') {
      var head = '', i;
      for (i = 0; i < 6; i++) head += (labels[i] + '   ').slice(0, 3);
      var lines = [head.replace(/\s+$/, '')];
      for (i = 0; i < ex.seq.length; i++) {
        var n = ex.path[ex.seq[i]];
        var line = '';
        for (var s2 = 0; s2 < 6; s2++) {
          if (s2 === n.s) {
            var pc = Theory.mod12(n.midi);
            var cell = (String(n.f) + '   ').slice(0, 3);
            line += '<span class="fbv-n' + (info.pcToStep.get(pc) === 0 ? ' fbv-root' : '') +
              '" data-step="' + i + '" style="color:' + noteColor(info, pc) + '">' + cell + '</span>';
          } else {
            line += '\u00b7  ';
          }
        }
        lines.push(line);
      }
      out.innerHTML = lines.join('\n');
      return;
    }

    if (state.vFit === 'scroll') {
      out.innerHTML = tabSystemHTML(ex, labels, info, 0, ex.seq.length);
      return;
    }
    var charW = VSIZES[state.vSize] * 0.602;
    var usable = Math.max(160, out.clientWidth - 34);
    var lw = Math.max.apply(null, labels.map(function (l) { return l.length; }));
    var budget = Math.floor(usable / charW) - lw - 2;
    var htmls = [], i2 = 0;
    while (i2 < ex.seq.length) {
      var used = 0, j = i2;
      while (j < ex.seq.length) {
        var cw = String(ex.path[ex.seq[j]].f).length + 2;
        if (used + cw > budget && j > i2) break;
        used += cw; j++;
      }
      htmls.push(tabSystemHTML(ex, labels, info, i2, j));
      i2 = j;
    }
    out.innerHTML = htmls.join('\n\n');
  }

  // sheet music: treble clef (guitar written an octave above sounding pitch),
  // uniform noteheads colored by degree, accidentals from the key's spelling
  var SHEET_LETTER_POS = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

  function sheetNoteInfo(midi, pf) {
    var written = midi + 12; // 8vb clef convention
    var name = Theory.pcName(Theory.mod12(written), pf); // e.g. 'F#' or 'Bb'
    var letter = name[0];
    var acc = name.length > 1 ? name[1] : '';
    var pcOfLetter = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter];
    // octave of the WRITTEN pitch for this letter spelling
    var oct = Math.floor((written - (Theory.mod12(written) - pcOfLetter >= 0 ? 0 : 0)) / 12) - 1;
    // adjust octave when the spelling crosses C (e.g. B# / Cb) — our scales
    // never produce those, so the simple floor is fine
    var pos = SHEET_LETTER_POS[letter] + 7 * oct;
    return { pos: pos, acc: acc };
  }

  function renderSheetView() {
    var wrap = els.sheetwrap;
    if (!wrap || state.view !== 'sheet') return;
    var ex = altExercise();
    var info = Theory.scaleInfo(state.root, state.scale, preferFlat());
    if (!ex.seq.length) { wrap.textContent = '(no notes in this window)'; return; }
    var pf = preferFlat();
    var SC = { s: 0.8, m: 1, l: 1.3 }[state.vSize];
    var GAP = 9 * SC;            // half-step between staff positions
    var NOTE_W = 30 * SC;
    var LEFT = 46 * SC;
    var topPad = 5 * GAP;        // headroom for ledger lines
    var staffH = 8 * GAP;        // 5 lines, 4 gaps... (4 gaps * 2 half-gaps)
    var perRow = ex.seq.length;
    if (state.vFit === 'fit') {
      var usable = Math.max(220, wrap.clientWidth - 40);
      perRow = Math.max(4, Math.floor((usable - LEFT) / NOTE_W));
    }
    var rows = Math.ceil(ex.seq.length / perRow);
    var rowH = staffH + topPad * 2;
    var W = LEFT + Math.min(perRow, ex.seq.length) * NOTE_W + 16;
    var H = rows * rowH;
    var E4POS = 30;              // bottom staff line
    var svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">'];
    for (var rIdx = 0; rIdx < rows; rIdx++) {
      var oy = rIdx * rowH + topPad;
      var l;
      for (l = 0; l < 5; l++) {
        var ly = oy + staffH - l * 2 * GAP;
        svg.push('<line x1="8" y1="' + ly + '" x2="' + (W - 8) + '" y2="' + ly +
          '" stroke="var(--muted)" stroke-width="1" opacity="0.75"/>');
      }
      svg.push('<text x="10" y="' + (oy + staffH - GAP) + '" font-size="' + (staffH * 0.95) +
        '" fill="var(--text)" font-family="serif">\ud834\udd1e</text>');
      var from = rIdx * perRow, to = Math.min(ex.seq.length, from + perRow);
      for (var i = from; i < to; i++) {
        var n = ex.path[ex.seq[i]];
        var pc = Theory.mod12(n.midi);
        var sn = sheetNoteInfo(n.midi, pf);
        var x = LEFT + (i - from) * NOTE_W + NOTE_W / 2;
        var y = oy + staffH - (sn.pos - E4POS) * GAP;
        var col = noteColor(info, pc);
        var isRoot = info.pcToStep.get(pc) === 0;
        var g = '<g class="fbv-sn" data-step="' + i + '">';
        // ledger lines
        var lp;
        for (lp = E4POS - 2; lp >= sn.pos - (sn.pos % 2); lp -= 2) {
          if (lp < E4POS) g += '<line x1="' + (x - 10 * SC) + '" y1="' + (oy + staffH - (lp - E4POS) * GAP) +
            '" x2="' + (x + 10 * SC) + '" y2="' + (oy + staffH - (lp - E4POS) * GAP) +
            '" stroke="var(--muted)" stroke-width="1"/>';
        }
        for (lp = E4POS + 10; lp <= sn.pos + (sn.pos % 2 === 0 ? 0 : 1); lp += 2) {
          g += '<line x1="' + (x - 10 * SC) + '" y1="' + (oy + staffH - (lp - E4POS) * GAP) +
            '" x2="' + (x + 10 * SC) + '" y2="' + (oy + staffH - (lp - E4POS) * GAP) +
            '" stroke="var(--muted)" stroke-width="1"/>';
        }
        g += '<circle class="fbv-halo" cx="' + x + '" cy="' + y + '" r="' + (10 * SC) +
          '" fill="none" stroke="var(--accent)" stroke-width="3"/>';
        g += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (6.4 * SC) + '" ry="' + (4.8 * SC) +
          '" fill="' + col + '"' + (isRoot ? ' stroke="#ffffff" stroke-width="1.5"' : '') + '/>';
        var stemUp = sn.pos < E4POS + 4;
        g += '<line x1="' + (x + (stemUp ? 6 * SC : -6 * SC)) + '" y1="' + y +
          '" x2="' + (x + (stemUp ? 6 * SC : -6 * SC)) + '" y2="' + (y + (stemUp ? -1 : 1) * 26 * SC) +
          '" stroke="' + col + '" stroke-width="' + (1.4 * SC) + '"/>';
        if (sn.acc) {
          g += '<text x="' + (x - 15 * SC) + '" y="' + (y + 4 * SC) + '" font-size="' + (13 * SC) +
            '" fill="' + col + '" font-weight="700">' + (sn.acc === '#' ? '\u266f' : '\u266d') + '</text>';
        }
        g += '</g>';
        svg.push(g);
      }
    }
    svg.push('</svg>');
    wrap.innerHTML = svg.join('');
  }

  function renderAltView() {
    if (state.view === 'tab') renderTabView();
    else if (state.view === 'sheet') renderSheetView();
  }

  function paintViewOpts() {
    var vo = document.getElementById('fb-viewopts');
    if (!vo) return;
    vo.style.display = state.view === 'board' ? 'none' : '';
    document.getElementById('fb-vo-ori').style.display = state.view === 'tab' ? '' : 'none';
    document.getElementById('fb-vo-fit').style.display =
      (state.view === 'tab' && state.tabOri === 'v') ? 'none' : '';
    vo.querySelectorAll('[data-fbvori]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-fbvori') === state.tabOri);
    });
    vo.querySelectorAll('[data-fbvfit]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-fbvfit') === state.vFit);
    });
    vo.querySelectorAll('[data-fbvsize]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-fbvsize') === state.vSize);
    });
  }

  function applyView() {
    var board = state.view === 'board';
    els.scroll.style.display = board ? '' : 'none';
    els.tabout.style.display = state.view === 'tab' ? '' : 'none';
    els.sheetwrap.style.display = state.view === 'sheet' ? '' : 'none';
    document.getElementById('fb-boardctl').style.display = board ? '' : 'none';
    renderPosRow();          // pent boxes are board-pertinent
    if (!board) els.posrow.style.display = 'none';
    paintViewOpts();
    if (board) applyZoom();
    renderAltView();
  }

  function setView(v) {
    if (v !== 'board' && v !== 'tab' && v !== 'sheet') return;
    state.view = v;
    App.store.set('fb.view', v);
    applyView();             // the runner keeps playing across view switches
  }

  function prPlayBtn(running) {
    var b = document.getElementById('fb-pr-play');
    if (b) b.innerHTML = running ? '&#10074;&#10074; Pause' : '&#9654; Play';
    var m = document.getElementById('fb-playmax'); // fullscreen twin
    if (m) {
      m.innerHTML = running ? '&#10074;&#10074;' : '&#9654;';
      m.classList.toggle('on', !!running);
    }
  }

  function prStart() {
    pr.path = prPath();
    if (!pr.path.length) { prStatus('no notes in this position'); return; }
    pr.seq = prSeq(pr.path, pr.pattern, pr.dir);
    try { pr.ctx = App.getAudio(); } catch (e) { prStatus('audio unavailable'); return; }
    pr.vis.length = 0;
    pr.nextT = pr.ctx.currentTime + 0.15;
    pr.running = true;
    App.wake.acquire('fb-run');
    pr.timer = setInterval(prTick, 25);
    prTick();
    pr.raf = requestAnimationFrame(prDraw);
    prPlayBtn(true);
  }

  function prPause() {
    if (!pr.running) return;
    if (pr.timer) { clearInterval(pr.timer); pr.timer = null; }
    if (pr.raf) { cancelAnimationFrame(pr.raf); pr.raf = 0; }
    pr.running = false;
    App.wake.release('fb-run');
    pr.vis.length = 0;
    prPlayBtn(false);
  }

  function prStop() {
    prPause();
    pr.idx = 0;
    prClearRings();
    prStatus('');
  }

  function prToggle() {
    if (pr.running) prPause();
    else prStart(); // resumes from pr.idx after a pause
  }

  var PAT_RE = /^(scale|g[3-7]|i([2-9]|1[0-6])(m([1-9]|[1-5][0-9]|6[0-2]))?|ss[0-5])$/;

  function prWire() {
    // migrate pre-0.9 stored patterns: up/updown/thirds/random -> scale (+dir)
    var storedPat = String(App.store.get('fb.pr.pattern', 'scale'));
    storedPat = storedPat.replace(/^(i[0-9]+)s[2-5]$/, '$1'); // 0.15.0 span tokens
    pr.pattern = PAT_RE.test(storedPat) ? storedPat : 'scale';
    pr.dir = App.store.get('fb.pr.dir', storedPat === 'updown' ? 'updown' : 'up');
    if (!/^(up|down|updown)$/.test(pr.dir)) pr.dir = 'up';
    // tempo is SHARED with the metronome — met.bpm is the single source of truth
    pr.bpm = Math.max(30, Math.min(280, parseInt(App.store.get('met.bpm', 100), 10) || 100));
    pr.rate = App.store.get('fb.pr.rate', 1);
    pr.sound = !!App.store.get('fb.pr.sound', true);
    pr.click = !!App.store.get('fb.pr.click', true);

    var typeSel = document.getElementById('fb-pr-type');
    var groupSel = document.getElementById('fb-pr-group');
    var ivSel = document.getElementById('fb-pr-iv');
    var stripEl = document.getElementById('fb-pr-strings');
    var strSel = document.getElementById('fb-pr-string');
    var strMask = 63; // intervals: bit s = string s enabled (low E = bit 0)
    var IVL = { 2: '2nds', 3: '3rds', 4: '4ths', 5: '5ths', 6: '6ths', 7: '7ths', 8: 'Octaves',
      9: '9ths', 10: '10ths', 11: '11ths', 12: '12ths', 13: '13ths', 14: '14ths', 15: '15ths', 16: '16ths' };
    var ivh = '', ivn;
    for (ivn = 2; ivn <= 16; ivn++) ivh += '<option value="' + ivn + '">' + IVL[ivn] + '</option>';
    ivSel.innerHTML = ivh;

    function fillStringSel() {
      var tun = Theory.TUNINGS[state.tuning];
      var pf = preferFlat();
      var h = '', s;
      for (s = 5; s >= 0; s--) { // high e first, labeled 1st..6th + note
        h += '<option value="' + s + '">' + (6 - s) + ' \u00b7 ' +
          Theory.pcName(Theory.mod12(tun.midi[s]), pf) + '</option>';
      }
      strSel.innerHTML = h;
      // interval string chips: low E .. high e, tap to toggle
      var c = '';
      for (s = 0; s < 6; s++) {
        c += '<button type="button" class="chip fb-chip fb-strchip' +
          ((strMask & (1 << s)) ? ' active' : '') + '" data-fbstr="' + s + '">' +
          Theory.pcName(Theory.mod12(tun.midi[s]), pf) + '</button>';
      }
      stripEl.innerHTML = c;
    }
    fillStringSel();

    stripEl.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-fbstr]');
      if (!b) return;
      var bit = 1 << parseInt(b.getAttribute('data-fbstr'), 10);
      var next = strMask ^ bit;
      if (!next) return;         // keep at least one string on
      strMask = next;
      b.classList.toggle('active', !!(strMask & bit));
      patternChanged();
    });

    // decompose the stored token into the type + sub-selects
    function decompose() {
      var p = pr.pattern, mm;
      if ((mm = /^g([3-7])$/.exec(p))) {
        typeSel.value = 'group'; groupSel.value = mm[1];
      } else if ((mm = /^i([0-9]+)(?:m([0-9]+))?$/.exec(p))) {
        typeSel.value = 'interval'; ivSel.value = mm[1];
        strMask = mm[2] ? (parseInt(mm[2], 10) & 63) || 63 : 63;
        fillStringSel(); // repaint chips to the mask
      } else if ((mm = /^ss([0-5])$/.exec(p))) {
        typeSel.value = 'string'; strSel.value = mm[1];
      } else {
        typeSel.value = 'scale';
      }
      paintPatternUI();
    }

    // only the pertinent sub-dropdowns are visible for the chosen type
    function paintPatternUI() {
      var t = typeSel.value;
      groupSel.style.display = t === 'group' ? '' : 'none';
      ivSel.style.display = t === 'interval' ? '' : 'none';
      stripEl.style.display = t === 'interval' ? '' : 'none';
      strSel.style.display = t === 'string' ? '' : 'none';
    }

    function compose() {
      var t = typeSel.value;
      if (t === 'group') return 'g' + groupSel.value;
      if (t === 'interval') return 'i' + ivSel.value + (strMask !== 63 ? 'm' + strMask : '');
      if (t === 'string') return 'ss' + strSel.value;
      return 'scale';
    }

    function patternChanged() {
      pr.pattern = compose();
      App.store.set('fb.pr.pattern', pr.pattern);
      paintPatternUI();
      pr.idx = 0;
      if (pr.running) { pr.path = prPath(); pr.seq = prSeq(pr.path, pr.pattern, pr.dir); }
      renderAltView();
      if (/^ss/.test(pr.pattern) && state.view === 'board') scrollToFret(0);
    }
    typeSel.addEventListener('change', patternChanged);
    groupSel.addEventListener('change', patternChanged);
    ivSel.addEventListener('change', patternChanged);
    strSel.addEventListener('change', patternChanged);
    decompose();

    var bpm = document.getElementById('fb-pr-bpm');
    var rate = document.getElementById('fb-pr-rate');
    var sound = document.getElementById('fb-pr-sound');
    var click = document.getElementById('fb-pr-click');
    bpm.value = String(pr.bpm);
    rate.value = String(pr.rate);
    sound.checked = pr.sound;
    click.checked = pr.click;

    document.getElementById('fb-pr-play').addEventListener('click', prToggle);
    document.getElementById('fb-playmax').addEventListener('click', prToggle);
    document.getElementById('fb-pr-reset').addEventListener('click', function () { prStop(); });
    var dirSeg = document.getElementById('fb-pr-dir');
    function paintDir() {
      dirSeg.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-fbdir') === pr.dir);
      });
    }
    paintDir();
    dirSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-fbdir]');
      if (!b) return;
      pr.dir = b.getAttribute('data-fbdir');
      App.store.set('fb.pr.dir', pr.dir);
      paintDir();
      pr.idx = 0;
      if (pr.running) { pr.path = prPath(); pr.seq = prSeq(pr.path, pr.pattern, pr.dir); }
      renderAltView();
    });
    bpm.addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      if (isNaN(v)) v = 100;
      pr.bpm = Math.max(30, Math.min(280, v));
      this.value = String(pr.bpm);
      App.store.set('met.bpm', pr.bpm); // shared tempo — metronome follows
      App.emit('tempo', { bpm: pr.bpm, source: 'fb' });
    });

    // follow tempo changes made on the metronome tab (incl. its tempo trainer)
    App.on('tempo', function (d) {
      if (d.source === 'fb') return;
      pr.bpm = Math.max(30, Math.min(280, d.bpm)); // next scheduled note uses it
      bpm.value = String(pr.bpm);
    });
    rate.addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      if (v >= 1 && v <= 4) pr.rate = v;
      App.store.set('fb.pr.rate', pr.rate);
    });
    sound.addEventListener('change', function () {
      pr.sound = !!this.checked;
      App.store.set('fb.pr.sound', pr.sound);
    });
    click.addEventListener('change', function () {
      pr.click = !!this.checked;
      App.store.set('fb.pr.click', pr.click);
    });

    // pause (keep position) when the whole app goes to the background
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) prPause();
    });
  }

  // legend follows the current scale: one colored chip per degree
  function renderLegend() {
    var pf = preferFlat();
    var info = Theory.scaleInfo(state.root, state.scale, pf);
    if (!info) { els.legend.innerHTML = ''; return; }
    var h = '';
    for (var i = 0; i < info.intervals.length; i++) {
      h += '<span class="fb-legend-item"><span class="legend-dot" style="background:' +
        DEG_COLORS[i % 7] + '"></span>' + info.intervals[i] + ' &middot; ' + info.names[i] + '</span>';
    }
    els.legend.innerHTML = h;
  }

  function renderInfo() {
    var pf = preferFlat();
    var info = Theory.scaleInfo(state.root, state.scale, pf);
    if (!info) {
      els.infoTitle.textContent = 'Scale';
      els.infoNotes.innerHTML = '<div class="error">Unknown scale.</div>';
      return;
    }
    els.infoTitle.textContent = Theory.pcName(state.root, pf) + ' ' + Theory.SCALES[state.scale].name + ':';
    if (els.title) els.title.textContent = Theory.pcName(state.root, pf) + ' ' + Theory.SCALES[state.scale].name;
    var h = '';
    for (var i = 0; i < info.names.length; i++) {
      h += '<span class="fb-note' + (i === 0 ? ' fb-note-root' : '') +
        '" style="border-color:' + DEG_COLORS[i % 7] + '"><b>' + info.names[i] +
        '</b><span>' + info.intervals[i] + '</span></span>';
    }
    els.infoNotes.innerHTML = h;
  }

  function updateSeg() {
    var btns = els.display.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-fbmode') === state.display);
    }
  }

  // ---------------- click feedback ----------------

  function clearFlash() {
    if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
    if (flashEl && flashEl.parentNode) flashEl.parentNode.removeChild(flashEl);
    flashEl = null;
  }

  function flashAt(cx, cy) {
    var svg = document.getElementById('fb-svg');
    if (!svg || isNaN(cx) || isNaN(cy)) return;
    clearFlash();
    flashEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    flashEl.setAttribute('cx', cx);
    flashEl.setAttribute('cy', cy);
    flashEl.setAttribute('r', '14.5');
    flashEl.setAttribute('fill', 'none');
    flashEl.setAttribute('stroke', 'var(--accent)');
    flashEl.setAttribute('stroke-width', '2.5');
    flashEl.setAttribute('class', 'fb-flash');
    // coordinates are in pre-rotation space — attach inside the rotated group
    (document.getElementById('fb-rot') || svg).appendChild(flashEl);
    flashTimer = setTimeout(clearFlash, 400);
  }

  // ---------------- init ----------------

  function buildOptions(pairs, selected) {
    var h = '';
    for (var i = 0; i < pairs.length; i++) {
      h += '<option value="' + pairs[i][0] + '"' +
        (String(pairs[i][0]) === String(selected) ? ' selected' : '') + '>' + pairs[i][1] + '</option>';
    }
    return h;
  }

  function init(rootEl) {
    App.injectCSS('fretboard',
      '.fb-field{display:inline-flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--muted);font-weight:600}' +
      '.fb-board{position:relative;display:flex;flex-direction:column;gap:10px}' +
      '.fb-board.fb-max{position:fixed;inset:0;z-index:200;margin:0;border-radius:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)}' +
      // truly fullscreen: board only — every control row disappears, one floating
      // exit button remains
      '.fb-board.fb-max .fb-toolbar,.fb-board.fb-max .fb-practice,.fb-board.fb-max .fb-posrow{display:none}' +
      '.fb-exitmax{display:none;position:absolute;top:calc(12px + env(safe-area-inset-top,0px));right:calc(12px + env(safe-area-inset-right,0px));z-index:210;width:44px;height:44px;' +
        'align-items:center;justify-content:center;border-radius:50%;border:1px solid var(--line);' +
        'background:rgba(19,17,20,0.72);color:#ede8e0;font-size:19px;line-height:1;cursor:pointer;' + // fixed dark chip: keep light glyph in BOTH themes
        'opacity:0.85}' +
      '.fb-exitmax:hover{opacity:1;border-color:var(--accent)}' +
      '.fb-board.fb-max .fb-exitmax{display:flex}' +
      '.fb-playmax{top:calc(66px + env(safe-area-inset-top,0px));color:var(--accent);font-size:16px}' + // sits under the x; same base style
      '.fb-playmax.on{border-color:var(--accent)}' +
      '#fb-modeflash{position:absolute;top:calc(70px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:205;' +
        'background:rgba(19,17,20,0.85);border:1px solid var(--accent);color:#ede8e0;' +
        'border-radius:999px;padding:8px 18px;font-family:var(--font-display);font-size:17px;' +
        'letter-spacing:1px;white-space:nowrap;opacity:0;pointer-events:none}' +
      '#fb-modeflash.show{animation:fb-modeflash 1.4s ease forwards}' +
      '@keyframes fb-modeflash{0%{opacity:0}12%{opacity:1}70%{opacity:1}100%{opacity:0}}' +
      '.fb-toolbar{flex:0 0 auto}' +
      '.fb-practice{flex:0 0 auto}' +
      '.fb-practice select,.fb-practice input[type=number]{padding:6px 8px;font-size:13px}' +
      '.fb-title{font-family:var(--font-display);font-size:19px;font-weight:600;letter-spacing:1px;' +
        'text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42vw}' +
      '.fb-gearbtn{font-size:17px;line-height:1;padding:6px 10px}' +
      '.fb-scroll{flex:1 1 auto;min-height:0;display:flex;overflow:auto;overscroll-behavior:contain;' +
        'touch-action:pan-x pan-y;cursor:grab;scrollbar-width:thin;-webkit-overflow-scrolling:touch;' +
        'height:calc(100vh - 340px);height:calc(100dvh - 340px);min-height:240px}' +
      '.fb-board.fb-max .fb-scroll{height:auto;min-height:0}' +
      '.fb-scroll:active{cursor:grabbing}' +
      '.fb-scroll{transition:opacity 0.18s ease}' +
      '.fb-scroll.fb-fade{opacity:0.25}' +
      '.fb-scroll svg{width:100%;height:auto;display:block;margin:auto;flex:0 0 auto}' +
      '.fb-jam-ring{opacity:0;transition:opacity 0.28s ease,stroke 0.28s ease}' +
      '.fb-jam-ring.on{opacity:0.92}' +
      '.fb-jam-ring.root{stroke:var(--accent);stroke-width:3.5}' +
      '.fb-settings{display:none;position:absolute;z-index:6;top:52px;left:10px;right:10px;max-width:760px;' +
        'margin:0 auto;background:var(--card);border:1px solid var(--line);' +
        'border-radius:12px;padding:16px 18px;box-shadow:0 18px 50px rgba(0,0,0,0.55);' +
        'max-height:calc(100% - 66px);overflow:auto}' +
      '.fb-colpick{display:inline-flex;flex-direction:column;align-items:center;gap:3px;' +
        'font-size:11px;color:var(--muted);font-weight:600}' +
      '.fb-colpick input[type=color]{width:36px;height:27px;border:1px solid var(--line);' +
        'border-radius:6px;padding:1px;background:var(--card2);cursor:pointer}' +
      '[data-theme=light] .fb-jam-ring{stroke:rgba(0,0,0,0.6)}' +
      '.fb-settings.open{display:block}' +
      '.fb-settings h3{margin-top:14px}' +
      '.fb-hit{cursor:pointer}' +
      '.fb-hit:hover{fill:rgba(255,255,255,0.05)}' +
      '.fb-flash{animation:fb-flash .4s ease-out forwards;pointer-events:none}' +
      '@keyframes fb-flash{0%{opacity:.95}100%{opacity:0}}' +
      '.fb-posrow{margin-bottom:12px}' +
      '.fb-strchip{padding:4px 9px;font-size:12px;opacity:0.45}' +
      '.fb-strchip.active{opacity:1;color:var(--accent);border-color:rgba(255,171,71,0.7)}' +
      '.fb-tabout{font-family:ui-monospace,Consolas,Menlo,monospace;line-height:1.6;overflow-x:auto;' +
        'background:var(--card2);border:1px solid var(--line);border-radius:10px;' +
        'padding:14px 16px;color:var(--text);white-space:pre;min-height:120px}' +
      '.fbv-n{font-weight:700;border-radius:4px}' +
      '.fbv-n.fbv-root{text-decoration:underline}' +
      '.fbv-n.now{background:var(--accent);color:#1c1206 !important;box-shadow:0 0 10px var(--accent-glow)}' +
      '.fb-sheetwrap{overflow-x:auto;background:var(--card2);border:1px solid var(--line);' +
        'border-radius:10px;padding:12px 14px;min-height:140px}' +
      '.fb-sheetwrap svg{display:block}' +
      '.fbv-sn .fbv-halo{opacity:0;transition:opacity 0.1s}' +
      '.fbv-sn.now .fbv-halo{opacity:0.95}' +
      '.fb-legend{margin-top:12px}' +
      '.fb-legend-item{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);font-weight:600}' +
      '.fb-chip{cursor:pointer;font-family:inherit}' +
      '.fb-note{display:inline-flex;flex-direction:column;align-items:center;gap:1px;background:var(--card2);' +
        'border:1px solid var(--line);border-radius:10px;padding:7px 13px;min-width:52px}' +
      '.fb-note b{font-size:16px;line-height:1.2}' +
      '.fb-note span{font-size:11px;color:var(--muted);font-weight:600}' +
      '.fb-note.fb-note-root{border-color:var(--accent)}' +
      '.fb-note.fb-note-root b{color:var(--accent)}'
    );

    loadState();

    var tuningOpts = Theory.TUNING_ORDER.map(function (id) { return [id, Theory.TUNINGS[id].name]; });
    var fretOpts = [[12, '12'], [15, '15'], [22, '22'], [24, '24']];

    rootEl.innerHTML =
      '<div class="card fb-board" id="fb-board">' +
        '<div class="row tight spread fb-toolbar">' +
          '<span class="row tight">' +
            '<button type="button" class="btn sm fb-gearbtn" id="fb-gear" title="Scale &amp; board settings" aria-label="Settings">&#9881;</button>' +
            '<span class="fb-title" id="fb-title"></span>' +
            '<button type="button" class="chip" id="fb-jamchip" style="display:none" title="Tap to switch the board to this mode"></button>' +
          '</span>' +
          '<span class="row tight">' +
            '<select id="fb-view" title="How to see the exercise">' +
              '<option value="board">Fretboard</option>' +
              '<option value="tab">Tab</option>' +
              '<option value="sheet">Sheet</option>' +
            '</select>' +
            '<span class="row tight" id="fb-boardctl">' +
            '<button type="button" class="btn sm" id="fb-zout" aria-label="Zoom out">&minus;</button>' +
            '<span class="chip" id="fb-zlabel">100%</span>' +
            '<button type="button" class="btn sm" id="fb-zin" aria-label="Zoom in">+</button>' +
            '<button type="button" class="btn sm" id="fb-zfit">Fit</button>' +
            '<button type="button" class="btn sm" id="fb-rotate" title="Rotate the board (vertical / horizontal neck)" aria-label="Rotate the fretboard">&#8635;</button>' +
            '<button type="button" class="btn sm" id="fb-max" title="Fullscreen" aria-label="Fullscreen">&#x26F6;</button>' +
            '</span>' +
          '</span>' +
        '</div>' +
        '<div class="row tight fb-posrow" id="fb-posrow" style="display:none"></div>' +
        '<div class="row tight fb-practice">' +
          '<button type="button" class="btn sm primary" id="fb-pr-play">&#9654; Play</button>' +
          '<button type="button" class="btn sm" id="fb-pr-reset" title="Back to the first note">&#8634;</button>' +
          '<select id="fb-pr-type" title="Pattern type">' +
            '<option value="scale">Scale</option>' +
            '<option value="group">Groups</option>' +
            '<option value="interval">Intervals</option>' +
            '<option value="string">One string</option>' +
          '</select>' +
          '<select id="fb-pr-group" title="Notes per group" style="display:none">' +
            '<option value="3">3s</option><option value="4">4s</option>' +
            '<option value="5">5s</option><option value="6">6s</option>' +
            '<option value="7">7s</option>' +
          '</select>' +
          '<select id="fb-pr-iv" title="Interval" style="display:none"></select>' +
          '<span class="row tight" id="fb-pr-strings" title="Tap strings on or off" style="display:none"></span>' +
          '<select id="fb-pr-string" title="Which string" style="display:none"></select>' +
          '<div class="seg" id="fb-pr-dir" title="Direction — applies to every pattern">' +
            '<button type="button" data-fbdir="up" title="Ascending">&#8593;</button>' +
            '<button type="button" data-fbdir="down" title="Descending">&#8595;</button>' +
            '<button type="button" data-fbdir="updown" title="Up, then back down">&#8597;</button>' +
          '</div>' +
          '<input type="number" id="fb-pr-bpm" min="30" max="280" step="1" title="Tempo (BPM) — linked to the metronome" style="width:70px">' +
          '<select id="fb-pr-rate" title="Notes per beat">' +
            '<option value="1">1 / beat</option>' +
            '<option value="2">8ths</option>' +
            '<option value="3">Triplets</option>' +
            '<option value="4">16ths</option>' +
          '</select>' +
          '<label class="row tight small muted" style="gap:5px"><input type="checkbox" id="fb-pr-sound">Notes</label>' +
          '<label class="row tight small muted" style="gap:5px"><input type="checkbox" id="fb-pr-click">Click</label>' +
          '<span class="muted small" id="fb-pr-status"></span>' +
        '</div>' +
        '<div class="row tight" id="fb-viewopts" style="display:none">' +
          '<div class="fb-field" id="fb-vo-ori">View' +
            '<div class="seg"><button type="button" data-fbvori="h">Horizontal</button>' +
            '<button type="button" data-fbvori="v">Vertical</button></div>' +
          '</div>' +
          '<div class="fb-field">Layout' +
            '<div class="seg" id="fb-vo-fit"><button type="button" data-fbvfit="fit">Fit</button>' +
            '<button type="button" data-fbvfit="scroll">Scroll</button></div>' +
          '</div>' +
          '<div class="fb-field">Size' +
            '<div class="seg" id="fb-vo-size"><button type="button" data-fbvsize="s">S</button>' +
            '<button type="button" data-fbvsize="m">M</button>' +
            '<button type="button" data-fbvsize="l">L</button></div>' +
          '</div>' +
        '</div>' +
        '<div class="fb-scroll" id="fb-scroll"></div>' +
        '<div class="fb-tabout" id="fb-tabout" style="display:none"></div>' +
        '<div class="fb-sheetwrap" id="fb-sheetwrap" style="display:none"></div>' +
        '<button type="button" class="fb-exitmax" id="fb-exitmax" title="Exit fullscreen" aria-label="Exit fullscreen">&#10005;</button>' +
        '<button type="button" class="fb-exitmax fb-playmax" id="fb-playmax" title="Play / pause the exercise" aria-label="Play or pause the practice exercise">&#9654;</button>' +
        '<div class="fb-settings" id="fb-settings">' +
          '<div class="row">' +
            '<label class="field">Tuning<select id="fb-tuning">' + buildOptions(tuningOpts, state.tuning) + '</select></label>' +
            '<label class="field">Frets<select id="fb-frets">' + buildOptions(fretOpts, state.frets) + '</select></label>' +
            '<div class="fb-field">Display' +
              '<div class="seg" id="fb-display">' +
                '<button type="button" data-fbmode="notes">Notes</button>' +
                '<button type="button" data-fbmode="intervals">Intervals</button>' +
                '<button type="button" data-fbmode="degrees">Degrees</button>' +
              '</div>' +
            '</div>' +
            '<label class="field">Left-handed<input type="checkbox" id="fb-lefty"' + (state.lefty ? ' checked' : '') + '></label>' +
            '<label class="field">Jam: auto-switch mode<input type="checkbox" id="fb-automode"></label>' +
          '</div>' +
          '<div class="fb-field" style="margin-top:12px">Degree colors' +
            '<div class="row tight" id="fb-colors"></div>' +
          '</div>' +
          '<div class="row tight fb-legend" id="fb-legend"></div>' +
          '<h3 id="fb-info-title"></h3>' +
          '<div class="row tight" id="fb-info-notes"></div>' +
          '<div class="muted small" style="margin-top:12px">Scroll down the neck &middot; pinch or Ctrl+scroll to zoom &middot; double-tap toggles whole-neck view</div>' +
        '</div>' +
      '</div>';

    els.board = document.getElementById('fb-board');
    els.settings = document.getElementById('fb-settings');
    els.gear = document.getElementById('fb-gear');
    els.maxBtn = document.getElementById('fb-max');
    els.title = document.getElementById('fb-title');
    els.tuningSel = document.getElementById('fb-tuning');
    els.fretsSel = document.getElementById('fb-frets');
    els.display = document.getElementById('fb-display');
    els.lefty = document.getElementById('fb-lefty');
    els.posrow = document.getElementById('fb-posrow');
    els.tabout = document.getElementById('fb-tabout');
    els.sheetwrap = document.getElementById('fb-sheetwrap');
    els.scroll = document.getElementById('fb-scroll');
    els.legend = document.getElementById('fb-legend');
    els.infoTitle = document.getElementById('fb-info-title');
    els.infoNotes = document.getElementById('fb-info-notes');

    updateSeg();

    els.tuningSel.addEventListener('change', function () {
      if (Theory.TUNINGS[this.value]) state.tuning = this.value;
      saveState();
      renderAll();
    });
    els.fretsSel.addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      if (v === 12 || v === 15 || v === 22 || v === 24) state.frets = v;
      saveState();
      renderBoard();
    });
    els.display.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-fbmode]');
      if (!btn) return;
      state.display = btn.getAttribute('data-fbmode');
      updateSeg();
      saveState();
      renderBoard();
    });
    els.lefty.addEventListener('change', function () {
      state.lefty = !!this.checked;
      saveState();
      renderBoard();
    });
    els.posrow.addEventListener('click', function (e) {
      var chip = e.target.closest('button[data-fbpos]');
      if (!chip) return;
      var p = parseInt(chip.getAttribute('data-fbpos'), 10);
      if (isNaN(p) || p < 0 || p > 5) return;
      state.pos = p;
      renderPosRow();
      renderBoard();
    });

    els.colors = document.getElementById('fb-colors');
    renderColorInputs();
    els.colors.addEventListener('change', function (e) {
      var inp = e.target.closest('input[data-fbcol]');
      if (!inp || !/^#[0-9a-fA-F]{6}$/.test(inp.value)) return;
      var ci = parseInt(inp.getAttribute('data-fbcol'), 10);
      if (isNaN(ci) || ci < 0 || ci > 6) return;
      DEG_COLORS[ci] = inp.value;
      App.store.set('fb.colors', DEG_COLORS);
      renderBoard(); renderInfo(); renderLegend();
    });
    els.colors.addEventListener('click', function (e) {
      if (!e.target.closest('#fb-col-reset')) return;
      DEG_COLORS = DEG_DEFAULTS.slice();
      App.store.set('fb.colors', null);
      renderColorInputs();
      renderBoard(); renderInfo(); renderLegend();
    });

    document.getElementById('fb-view').value = state.view;
    document.getElementById('fb-view').addEventListener('change', function () {
      setView(this.value);
    });
    document.getElementById('fb-viewopts').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-fbvori')) {
        state.tabOri = b.getAttribute('data-fbvori');
        App.store.set('tab.orient', state.tabOri);
      } else if (b.hasAttribute('data-fbvfit')) {
        state.vFit = b.getAttribute('data-fbvfit');
        App.store.set('tab.fit', state.vFit);
      } else if (b.hasAttribute('data-fbvsize')) {
        state.vSize = b.getAttribute('data-fbvsize');
        App.store.set('tab.size', state.vSize);
      } else {
        return;
      }
      paintViewOpts();
      renderAltView();
    });
    window.addEventListener('resize', function () {
      if (state.view !== 'board' && state.vFit === 'fit') renderAltView();
    });

    document.getElementById('fb-zout').addEventListener('click', function () { setZoom(zoom / 1.3); });
    document.getElementById('fb-zin').addEventListener('click', function () { setZoom(zoom * 1.3); });
    document.getElementById('fb-zfit').addEventListener('click', function () { setZoom(minZoom(els.scroll)); });
    document.getElementById('fb-rotate').addEventListener('click', function () {
      state.orient = state.orient === 'h' ? 'v' : 'h';
      App.store.set('fb.orient', state.orient);
      renderAll();
      setZoom(minZoom(els.scroll)); // zoom means something new — refit
      scrollToFret(isHept() ? modeWindow(state.mode)[0] : 0);
    });
    els.gear.addEventListener('click', function () {
      els.settings.classList.toggle('open');
    });
    els.maxBtn.addEventListener('click', function () { setMax(!maxMode); });
    document.getElementById('fb-exitmax').addEventListener('click', function () { setMax(false); });
    prWire();

    // follow the Jam tab's backing track
    autoMode = !!App.store.get('fb.automode', false);
    var autoChk = document.getElementById('fb-automode');
    autoChk.checked = autoMode;
    autoChk.addEventListener('change', function () {
      autoMode = !!this.checked;
      App.store.set('fb.automode', autoMode);
      if (autoMode && jamLast) jamApplySuggestion(jamLast);
    });
    document.getElementById('fb-jamchip').addEventListener('click', function () {
      if (jamLast) jamApplySuggestion(jamLast);
    });
    App.on('jam:chord', function (ev) {
      jamLast = ev;
      jamPaint(ev);
      if (autoMode) jamApplySuggestion(ev);
    });
    App.on('jam:stopped', function () {
      jamLast = null;
      jamPaint(null);
    });
    // linked state pushed from the Tab page: apply root/scale/mode/pattern/
    // direction, refresh this board and its widgets — stay on whatever tab
    // the user is on, don't start anything
    App.on('fb:set', function (d) {
      if (!d || d.source === 'fb') return;
      if (typeof d.root === 'number' && isFinite(d.root) && d.root >= 0 && d.root < 12) {
        state.root = Math.floor(d.root);
      }
      if (d.scale && Theory.SCALES[d.scale]) {
        state.scale = d.scale;
        state.pos = 0;
      }
      if (typeof d.mode === 'number' && d.mode >= 1 && d.mode <= 7) state.mode = Math.floor(d.mode);
      if (d.pattern && PAT_RE.test(d.pattern)) {
        pr.pattern = d.pattern;
      }
      if (d.dir && /^(up|down|updown)$/.test(d.dir)) {
        pr.dir = d.dir;
        var ds = document.getElementById('fb-pr-dir');
        if (ds) ds.querySelectorAll('button').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-fbdir') === pr.dir);
        });
      }
      saveState();
      pr.idx = 0;
      if (pr.running) { pr.path = prPath(); pr.seq = prSeq(pr.path, pr.pattern, pr.dir); }
      renderAll();
      // the scale really did change — downstream followers (chords) get the
      // same announcement as for a change made on this page
      App.emit('fb:scale', { root: state.root, scale: state.scale });
    });
    // one-click practice from a Trainer prompt: apply root/scale/tempo, jump
    // to this tab, and start the runner (emitted inside the click gesture, so
    // the AudioContext is allowed to start)
    App.on('fb:practice', function (d) {
      if (!d) return;
      if (typeof d.root === 'number' && isFinite(d.root) && d.root >= 0 && d.root < 12) {
        state.root = Math.floor(d.root);
      }
      if (d.scale && Theory.SCALES[d.scale]) {
        state.scale = d.scale;
      }
      saveState();
      renderAll();
      if (typeof d.bpm === 'number' && isFinite(d.bpm)) {
        pr.bpm = Math.max(30, Math.min(280, Math.round(d.bpm)));
        var bpmEl = document.getElementById('fb-pr-bpm');
        if (bpmEl) bpmEl.value = String(pr.bpm);
        App.store.set('met.bpm', pr.bpm);
        App.emit('tempo', { bpm: pr.bpm, source: 'fb' }); // metronome follows
      }
      App.emit('fb:scale', { root: state.root, scale: state.scale });
      App.switchTo('fretboard');
      prStart();
    });
    document.addEventListener('fullscreenchange', function () {
      // system back / Esc exits native fullscreen — drop the overlay with it
      if (!document.fullscreenElement && maxMode && usedNativeFs) setMax(false);
      applyZoom();
    });
    wireViewport();

    // one delegated listener survives every board re-render
    els.scroll.addEventListener('click', function (e) {
      if (els.settings.classList.contains('open')) { els.settings.classList.remove('open'); return; }
      if (suppressClick) return; // tail end of a pan / pinch / double-tap
      var hit = e.target.closest ? e.target.closest('.fb-hit') : null;
      if (!hit) return;
      var sIdx = parseInt(hit.getAttribute('data-fb-s'), 10);
      var f = parseInt(hit.getAttribute('data-fb-f'), 10);
      if (isNaN(sIdx) || sIdx < 0 || sIdx > 5 || isNaN(f) || f < 0) return;
      try {
        App.getAudio(); // inside the user gesture
        App.pluck(Theory.fretMidi(sIdx, f, state.tuning));
      } catch (err) { /* audio unavailable — keep UI responsive */ }
      flashAt(parseFloat(hit.getAttribute('data-fb-cx')), parseFloat(hit.getAttribute('data-fb-cy')));
    });

    renderLegend();
    renderAll();
    applyView();
  }

  // ---------------- fullscreen ("theater") mode ----------------
  // CSS overlay always works (WebView, artifact, desktop); native fullscreen +
  // landscape orientation lock are attempted on top where supported.

  var maxMode = false;
  var usedNativeFs = false;

  function setMax(on) {
    maxMode = on;
    els.board.classList.toggle('fb-max', on);
    els.maxBtn.innerHTML = on ? '&#10005;' : '&#x26F6;';
    els.maxBtn.title = on ? 'Exit fullscreen' : 'Fullscreen';
    document.body.style.overflow = on ? 'hidden' : '';
    if (on) {
      els.settings.classList.remove('open'); // its gear toggle is hidden in max mode
      if (els.board.requestFullscreen) {
        els.board.requestFullscreen().then(function () {
          usedNativeFs = true;
          if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(function () {});
          }
        }).catch(function () { usedNativeFs = false; });
      }
    } else {
      usedNativeFs = false;
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      }
      if (screen.orientation && screen.orientation.unlock) {
        try { screen.orientation.unlock(); } catch (e) { /* not locked */ }
      }
    }
    applyZoom();
  }

  function onShow() {
    applyZoom(); // stage had zero size while the tab was hidden
  }

  function onHide() {
    clearFlash(); // plucked notes decay on their own (~1.2 s envelope in App.pluck)
    prPause();    // exercise pauses (keeps its place) when leaving the tab
    if (maxMode) setMax(false);
    if (els.settings) els.settings.classList.remove('open');
  }

  App.register('fretboard', {
    init: init,
    onShow: onShow,
    onHide: onHide
  });
})();
