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
    pos: 0                // pentatonic box: 0 = All, 1..5 = box N (not persisted)
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
  // all light enough for dark label text, none of them dark/black
  var DEG_COLORS = ['#ffab47', '#e8d44d', '#7ad97a', '#4cc9b0', '#6ea8fe', '#b48ef0', '#ff85b3'];
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
  }

  function renderPosRow() {
    if (!isPent()) {
      state.pos = 0;
      els.posrow.style.display = 'none';
      els.posrow.innerHTML = '';
      return;
    }
    els.posrow.style.display = '';
    var h = '<span class="muted small">Position:</span>';
    for (var i = 0; i <= 5; i++) {
      h += '<button type="button" class="chip fb-chip' + (state.pos === i ? ' active' : '') +
        '" data-fbpos="' + i + '">' + (i === 0 ? 'All' : 'Box ' + i) + '</button>';
    }
    els.posrow.innerHTML = h;
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

    // rotated 90° cw: the on-screen viewBox is H wide and W tall (neck runs down)
    s.push('<svg id="fb-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + H + ' ' + W +
      '" role="img" aria-label="Fretboard diagram">');
    s.push('<g id="fb-rot" transform="rotate(90) translate(0,-' + H + ')">');

    // board background
    s.push('<rect x="' + nutX + '" y="' + boardTop + '" width="' + (N * FRET_W) +
      '" height="' + (boardBot - boardTop) + '" rx="4" fill="var(--panel)"/>');

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
    vb.w = H;  // on-screen width  = across the strings
    vb.h = W;  // on-screen height = along the neck
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
    if (els.root) els.root.value = String(state.root);
    if (els.scaleSel) els.scaleSel.value = state.scale;
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
    // zoom 1 = the six strings span the stage width; the neck runs past the
    // bottom edge and scrolls vertically
    if (!vb.w || !wrap || !wrap.clientWidth) return 0;
    return Math.min(wrap.clientWidth, BASE_MAX_W);
  }

  function minZoom(wrap) {
    // smallest zoom = the whole neck visible inside the stage height
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

  function wireViewport() {
    var wrap = els.scroll;
    var pinch = null;
    var lastTap = { t: 0, x: 0 };

    wrap.addEventListener('touchstart', function (e) {
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
  // ring previews the next one. Patterns: straight runs, groups of 3-6,
  // thirds, and random-note drills.

  var pr = {
    running: false, idx: 0, seq: null, path: [],
    pattern: 'up', bpm: 80, rate: 1, sound: true, click: true,
    timer: null, raf: 0, nextT: 0, vis: [], ctx: null
  };

  function colCX2(f) {
    var nutX = LABEL_W + OPEN_W;
    return f === 0 ? LABEL_W + OPEN_W / 2 : nutX + (f - 0.5) * FRET_W;
  }

  function rowY2(s) { return TOP + (state.lefty ? s : 5 - s) * GAP; }

  // playable positions: scale tones inside a 5-fret window (pentatonic box if
  // one is selected, otherwise anchored at the lowest root on the low string)
  function prPath() {
    var tun = Theory.TUNINGS[state.tuning];
    var info = Theory.scaleInfo(state.root, state.scale, preferFlat());
    if (!info) return [];
    var win;
    if (isPent() && state.pos > 0) {
      win = boxWindow(state.pos, info.pcSet);
    } else {
      var t0 = tun.midi[0], rootFret = 0, f;
      for (f = 0; f < 12; f++) {
        if (Theory.mod12(t0 + f) === Theory.mod12(state.root)) { rootFret = f; break; }
      }
      if (rootFret + 4 > state.frets) rootFret = Math.max(0, rootFret - 12);
      win = [rootFret, rootFret + 4];
    }
    var path = [];
    for (var s = 0; s < 6; s++) {
      for (var fr = Math.max(0, win[0]); fr <= Math.min(state.frets, win[1]); fr++) {
        var midi = tun.midi[s] + fr;
        if (info.pcSet.has(Theory.mod12(midi))) {
          path.push({ s: s, f: fr, midi: midi, cx: colCX2(fr), cy: rowY2(s) });
        }
      }
    }
    // Adjacent strings overlap inside the window, so the same PITCH can appear
    // twice (e.g. the 5th of G major: G-string fret 7 and B-string fret 3).
    // Sort by pitch and keep one position per pitch — the lower-string
    // fingering, which keeps the hand moving string to string.
    path.sort(function (a, b) { return a.midi - b.midi || a.s - b.s; });
    return path.filter(function (n, i) { return i === 0 || n.midi !== path[i - 1].midi; });
  }

  // expand the path into an index sequence for the chosen pattern
  function prSeq(n, pattern) {
    var out = [], i, j, k;
    if (!n) return out;
    if (pattern === 'updown') {
      for (i = 0; i < n; i++) out.push(i);
      for (i = n - 2; i >= 1; i--) out.push(i);
    } else if (/^g[3-6]$/.test(pattern)) {
      k = parseInt(pattern.slice(1), 10);
      if (n < k) { for (i = 0; i < n; i++) out.push(i); }
      else { for (i = 0; i + k <= n; i++) for (j = 0; j < k; j++) out.push(i + j); }
    } else if (pattern === 'thirds') {
      if (n < 3) { for (i = 0; i < n; i++) out.push(i); }
      else { for (i = 0; i + 2 < n; i++) { out.push(i); out.push(i + 2); } }
    } else if (pattern === 'random') {
      return null; // pick at schedule time
    } else { // 'up'
      for (i = 0; i < n; i++) out.push(i);
    }
    return out;
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
    if (pr.seq === null) return pr.path[step % pr.path.length]; // random resolved in tick
    return pr.path[pr.seq[step % pr.seq.length]];
  }

  function prTick() {
    // if a main-thread stall left us behind the audio clock, jump forward —
    // a short gap beats a burst of silent past-dated notes
    if (pr.nextT < pr.ctx.currentTime + 0.01) pr.nextT = pr.ctx.currentTime + 0.05;
    var horizon = pr.ctx.currentTime + 0.25;
    while (pr.nextT < horizon) {
      var node;
      if (pr.seq === null) node = pr.path[Math.floor(Math.random() * pr.path.length)];
      else node = pr.path[pr.seq[pr.idx % pr.seq.length]];
      var nextNode;
      if (pr.seq === null) nextNode = null;
      else nextNode = pr.path[pr.seq[(pr.idx + 1) % pr.seq.length]];
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
      var rings = prRings();
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
      prScrollTo(hit.node);
      var total = pr.seq === null ? pr.path.length : pr.seq.length;
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
    var yPost = node.cx * scale; // post-rotation y = pre-rotation x (along the neck)
    var target = Math.max(0, yPost - wrap.clientHeight * 0.45);
    if (Math.abs(wrap.scrollTop - target) > wrap.clientHeight * 0.22) {
      wrap.scrollTo({ top: target, behavior: 'smooth' });
    }
  }

  function prStatus(text) {
    var el = document.getElementById('fb-pr-status');
    if (el) el.textContent = text;
  }

  function prPlayBtn(running) {
    var b = document.getElementById('fb-pr-play');
    if (b) b.innerHTML = running ? '&#10074;&#10074; Pause' : '&#9654; Play';
  }

  function prStart() {
    pr.path = prPath();
    if (!pr.path.length) { prStatus('no notes in this position'); return; }
    pr.seq = prSeq(pr.path.length, pr.pattern);
    try { pr.ctx = App.getAudio(); } catch (e) { prStatus('audio unavailable'); return; }
    pr.vis.length = 0;
    pr.nextT = pr.ctx.currentTime + 0.15;
    pr.running = true;
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

  function prWire() {
    pr.pattern = App.store.get('fb.pr.pattern', 'up');
    // tempo is SHARED with the metronome — met.bpm is the single source of truth
    pr.bpm = Math.max(30, Math.min(280, parseInt(App.store.get('met.bpm', 100), 10) || 100));
    pr.rate = App.store.get('fb.pr.rate', 1);
    pr.sound = !!App.store.get('fb.pr.sound', true);
    pr.click = !!App.store.get('fb.pr.click', true);

    var pat = document.getElementById('fb-pr-pattern');
    var bpm = document.getElementById('fb-pr-bpm');
    var rate = document.getElementById('fb-pr-rate');
    var sound = document.getElementById('fb-pr-sound');
    var click = document.getElementById('fb-pr-click');
    pat.value = pr.pattern;
    bpm.value = String(pr.bpm);
    rate.value = String(pr.rate);
    sound.checked = pr.sound;
    click.checked = pr.click;

    document.getElementById('fb-pr-play').addEventListener('click', prToggle);
    document.getElementById('fb-pr-reset').addEventListener('click', function () { prStop(); });
    pat.addEventListener('change', function () {
      pr.pattern = this.value;
      App.store.set('fb.pr.pattern', pr.pattern);
      pr.idx = 0;
      if (pr.running) { pr.path = prPath(); pr.seq = prSeq(pr.path.length, pr.pattern); }
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
      '.fb-board.fb-max{position:fixed;inset:0;z-index:200;margin:0;border-radius:0;padding:10px 14px}' +
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
        'margin:0 auto;background:linear-gradient(180deg,#241e22 0%,#1b1619 100%);border:1px solid var(--line);' +
        'border-radius:12px;padding:16px 18px;box-shadow:0 18px 50px rgba(0,0,0,0.55);' +
        'max-height:calc(100% - 66px);overflow:auto}' +
      '.fb-settings.open{display:block}' +
      '.fb-settings h3{margin-top:14px}' +
      '.fb-hit{cursor:pointer}' +
      '.fb-hit:hover{fill:rgba(255,255,255,0.05)}' +
      '.fb-flash{animation:fb-flash .4s ease-out forwards;pointer-events:none}' +
      '@keyframes fb-flash{0%{opacity:.95}100%{opacity:0}}' +
      '.fb-posrow{margin-bottom:12px}' +
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

    var rootOpts = [];
    for (var pc = 0; pc < 12; pc++) {
      rootOpts.push([pc, Theory.pcName(pc, Theory.FLAT_KEYS.has(pc))]);
    }
    var scaleOpts = Theory.SCALE_ORDER.map(function (id) { return [id, Theory.SCALES[id].name]; });
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
            '<button type="button" class="btn sm" id="fb-zout" aria-label="Zoom out">&minus;</button>' +
            '<span class="chip" id="fb-zlabel">100%</span>' +
            '<button type="button" class="btn sm" id="fb-zin" aria-label="Zoom in">+</button>' +
            '<button type="button" class="btn sm" id="fb-zfit">Fit</button>' +
            '<button type="button" class="btn sm" id="fb-max" title="Fullscreen" aria-label="Fullscreen">&#x26F6;</button>' +
          '</span>' +
        '</div>' +
        '<div class="row tight fb-posrow" id="fb-posrow" style="display:none"></div>' +
        '<div class="row tight fb-practice">' +
          '<button type="button" class="btn sm primary" id="fb-pr-play">&#9654; Play</button>' +
          '<button type="button" class="btn sm" id="fb-pr-reset" title="Back to the first note">&#8634;</button>' +
          '<select id="fb-pr-pattern" title="Exercise pattern">' +
            '<option value="up">Straight up</option>' +
            '<option value="updown">Up &amp; down</option>' +
            '<option value="g3">In 3s</option>' +
            '<option value="g4">In 4s</option>' +
            '<option value="g5">In 5s</option>' +
            '<option value="g6">In 6s</option>' +
            '<option value="thirds">Thirds</option>' +
            '<option value="random">Random note</option>' +
          '</select>' +
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
        '<div class="fb-scroll" id="fb-scroll"></div>' +
        '<div class="fb-settings" id="fb-settings">' +
          '<div class="row">' +
            '<label class="field">Root<select id="fb-root">' + buildOptions(rootOpts, state.root) + '</select></label>' +
            '<label class="field">Scale<select id="fb-scale">' + buildOptions(scaleOpts, state.scale) + '</select></label>' +
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
    els.root = document.getElementById('fb-root');
    els.scaleSel = document.getElementById('fb-scale');
    els.tuningSel = document.getElementById('fb-tuning');
    els.fretsSel = document.getElementById('fb-frets');
    els.display = document.getElementById('fb-display');
    els.lefty = document.getElementById('fb-lefty');
    els.posrow = document.getElementById('fb-posrow');
    els.scroll = document.getElementById('fb-scroll');
    els.legend = document.getElementById('fb-legend');
    els.infoTitle = document.getElementById('fb-info-title');
    els.infoNotes = document.getElementById('fb-info-notes');

    updateSeg();

    els.root.addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      if (!isNaN(v)) state.root = Theory.mod12(v);
      saveState();
      renderAll();
    });
    els.scaleSel.addEventListener('change', function () {
      if (Theory.SCALES[this.value]) state.scale = this.value;
      state.pos = 0;
      saveState();
      renderAll();
    });
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

    document.getElementById('fb-zout').addEventListener('click', function () { setZoom(zoom / 1.3); });
    document.getElementById('fb-zin').addEventListener('click', function () { setZoom(zoom * 1.3); });
    document.getElementById('fb-zfit').addEventListener('click', function () { setZoom(minZoom(els.scroll)); });
    els.gear.addEventListener('click', function () {
      els.settings.classList.toggle('open');
    });
    els.maxBtn.addEventListener('click', function () { setMax(!maxMode); });
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
