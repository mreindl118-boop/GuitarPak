/* soundLAB Synth Deck — SCOPE (window.SLSynthScope, prefix sdk-).
 *
 * Shows what the synth is DOING: the arpeggiator's / sequencer's notes against
 * a beat grid, the Super Knob / Assign / Motion-Sequencer-driven CC curves and
 * the MIDI clock. The evidence is the bytes the synth TRANSMITS ('midi:raw')
 * plus, with "Show what I send" on, what the Hub sends it ('midi:out' of kind
 * 'music' on the Hub's synth output only — key-light writes never count).
 *
 * Mounted by js/synthdeck.js into the deck's Scope tab with the Hub's HUB_API
 * (js/midihub.js). Buffers input only while setActive(true) (the deck: tab
 * 'scope' on the open MIDI Hub). The rAF loop (<= 30 fps) runs only while
 * active && !document.hidden && !frozen. This module sends NOTHING, ever.
 *
 * Clock model (state().source): >= 24 F8 in the last 2 s -> 'synth' (bpm from
 * the median tick interval of the last 48, beat phase = ticks since FA mod
 * 24); else outgoing F8 seen on midi:out in the last 2 s -> 'hub' (the Hub's
 * own clock at met.bpm); else 'app' (met.bpm, phase from met:beat while the
 * metronome runs, free-running otherwise). Beats per bar from met.sig.
 *
 * Interface (singleton):
 *   mount(container, api, opts)  opts {win, lanes:[cc], showOut, onChange(opts), notes?}
 *   unmount()  setActive(on)  start()  stop()  running (getter)
 *   feed(bytes, dir 'in'|'out', t, portId)   the test hook (t = performance.now() ms)
 *   frame()  state()  setWindow(bars)  setLanes([cc])  lanes()  freeze(on)  setShowOut(on)
 */
(function () {
  'use strict';

  var WINS = [1, 2, 4, 8], MAX_LANES = 4;
  var NOTE_CAP = 1024, LANE_CAP = 512, TICK_CAP = 96, MARK_CAP = 64;
  var FRAME_MS = 1000 / 30, LIT_MS = 120, STRIP = 16;
  // one hue per channel, shuffled so neighbouring Parts never look alike
  var HUES = [28, 200, 120, 330, 58, 262, 0, 180, 92, 300, 150, 18, 232, 345, 76, 272];
  var wired = false; // bus / document listeners: registered once per page

  var S = {
    box: null, api: null,
    opts: { win: 4, lanes: [95, 17, 1, 74], showOut: true, onChange: null, notes: null },
    active: false, frozen: false, raf: 0, lastFrame: 0, lastText: 0, textDirty: true, lastSrc: '', lastBpm: 0, lastNoteN: 0,
    els: {}, canvas: null, cx: null, dpr: 1, w: 0, h: 0, ro: null, mo: null, adding: false,
    notes: [], lanes: {}, ticks: [], outTicks: [], tickN: 0, outTickN: 0, marks: [],
    counts: { 'in': 0, out: 0, clock: 0 }, sysexN: 0, lastOn: [], lit: [], lastT: 0,
    metBeat: null, metRunning: false, freeOrg: 0, colors: null, clock: null
  };

  // ---- helpers ----
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function pushCap(arr, item, cap) { arr.push(item); if (arr.length > cap) arr.splice(0, arr.length - cap); }
  function countSince(arr, t) { var n = 0; for (var i = arr.length - 1; i >= 0 && arr[i] >= t; i--) n++; return n; }
  function store(k, d) { try { return App.store.get(k, d); } catch (e) { return d; } }
  function nowMs() { var p = performance.now(); return S.lastT > p ? S.lastT : p; }
  function bpb() {
    var m = /^\s*(\d{1,2})\s*\//.exec(String(store('met.sig', '4/4') || ''));
    var n = m ? parseInt(m[1], 10) : 4;
    return n >= 1 && n <= 32 ? n : 4;
  }
  function appBpm() { var b = +store('met.bpm', 120); return b > 0 && isFinite(b) ? b : 120; }
  function partLabel() { try { return S.api && S.api.partLabel ? (S.api.partLabel() || 'Part') : 'Part'; } catch (e) { return 'Part'; } }
  function ccName(n) { try { return S.api && S.api.ccName ? (S.api.ccName(n) || '') : ''; } catch (e) { return ''; } }
  function laneLabel(cc) { var nm = ccName(cc); return 'CC ' + cc + (nm ? ' ' + nm : ''); }
  function clampCc(v) { v = parseInt(v, 10); return v >= 0 && v <= 127 ? v : null; }

  // ---- colours (tokens, re-read on theme / accent changes) ----
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    function tok(n, d) { var v = cs.getPropertyValue(n); v = v ? v.trim() : ''; return v || d; }
    S.colors = {
      text: tok('--text', '#ede8e0'), muted: tok('--muted', '#a29889'), line: tok('--line', '#342c2f'),
      lineSoft: tok('--line-soft', 'rgba(255,255,255,0.05)'), accent: tok('--accent', '#ffab47'), card2: tok('--card2', '#292328'),
      light: document.documentElement.getAttribute('data-theme') === 'light'
    };
  }
  function chColor(ch, a) { return 'hsla(' + HUES[ch & 15] + ',70%,' + (S.colors && S.colors.light ? 40 : 62) + '%,' + a + ')'; }

  // ---- data (ring buffers) ----
  function laneEntry(cc) {
    if (!S.lanes[cc]) S.lanes[cc] = { cc: cc, name: ccName(cc), pts: [], last: null, lastDir: null };
    return S.lanes[cc];
  }
  function closeNote(ch, n, dir, t) {
    var i, nt, any = -1;
    for (i = S.notes.length - 1; i >= 0; i--) {
      nt = S.notes[i];
      if (nt.ch !== ch || nt.n !== n || nt.t1 !== null) continue;
      if (nt.dir === dir) { nt.t1 = t < nt.t0 ? nt.t0 : t; return; }
      if (any < 0) any = i;
    }
    if (any >= 0) { nt = S.notes[any]; nt.t1 = t < nt.t0 ? nt.t0 : t; }
  }
  function feed(bytes, dir, t, portId) {
    if (!bytes || !bytes.length) return;
    dir = dir === 'out' ? 'out' : 'in';
    t = typeof t === 'number' && isFinite(t) ? t : performance.now();
    if (t > S.lastT) S.lastT = t;
    var st = bytes[0];
    if (st === 0xFE) return; // active sensing: not even counted
    if (st === 0xF8) {
      if (dir === 'in') { pushCap(S.ticks, t, TICK_CAP); S.tickN++; S.counts.clock++; }
      else { pushCap(S.outTicks, t, TICK_CAP); S.outTickN++; }
      return;
    }
    S.counts[dir]++;
    if (st === 0xFA || st === 0xFB || st === 0xFC) {
      if (st === 0xFA) { if (dir === 'in') S.tickN = 0; else S.outTickN = 0; } // phase reset
      pushCap(S.marks, { t: t, type: st === 0xFA ? 'start' : st === 0xFB ? 'cont' : 'stop', dir: dir }, MARK_CAP);
      return;
    }
    if (st === 0xF0) { S.sysexN++; return; }
    if (st >= 0xF1) return;
    var type = st & 0xF0, ch = st & 15, d1 = bytes[1] || 0, d2 = bytes[2] || 0;
    if (type === 0x90 && d2 > 0) {
      pushCap(S.notes, { ch: ch, n: d1, vel: d2, t0: t, t1: null, dir: dir }, NOTE_CAP);
      S.lastOn[ch] = t;
    } else if (type === 0x80 || type === 0x90) {
      closeNote(ch, d1, dir, t);
    } else if (type === 0xB0) {
      var ln = S.lanes[d1];
      if (ln) { pushCap(ln.pts, { t: t, v: d2, dir: dir }, LANE_CAP); ln.last = d2; ln.lastDir = dir; }
    }
  }
  function prune(edge) {
    var i, k, arr;
    for (i = S.notes.length - 1; i >= 0; i--) if (S.notes[i].t1 !== null && S.notes[i].t1 < edge) S.notes.splice(i, 1);
    for (k in S.lanes) {
      arr = S.lanes[k].pts;
      for (i = 0; i < arr.length && arr[i].t < edge; i++) { /* first point inside the window */ }
      if (i > 1) arr.splice(0, i - 1); // keep one point before the edge so the step line enters from the left
    }
    for (i = S.marks.length - 1; i >= 0; i--) if (S.marks[i].t < edge) S.marks.splice(i, 1);
  }

  // ---- clock model ----
  function median(arr) {
    if (!arr.length) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; }), m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function analyse(now) {
    var n = bpb(), src, bpm, org, beatLen, i, k;
    if (countSince(S.ticks, now - 2000) >= 24) {
      src = 'synth';
      k = S.ticks.length;
      var iv = [], m = Math.min(48, k);
      for (i = k - m + 1; i < k; i++) iv.push(S.ticks[i] - S.ticks[i - 1]);
      var med = median(iv);
      bpm = med > 0 ? 60000 / (24 * med) : appBpm();
      if (!(bpm >= 20 && bpm <= 400)) bpm = appBpm();
      beatLen = 60000 / bpm;
      var tick = med > 0 ? med : beatLen / 24, phase = (S.tickN - 1) % 24, beatIdx = Math.floor((S.tickN - 1) / 24) % n;
      org = S.ticks[k - 1] - phase * tick - beatIdx * beatLen;
    } else if (countSince(S.outTicks, now - 2000) > 0) {
      src = 'hub'; bpm = appBpm(); beatLen = 60000 / bpm;
      k = S.outTicks.length;
      org = S.outTicks[k - 1] - ((S.outTickN - 1) % 24) * (beatLen / 24) - (Math.floor((S.outTickN - 1) / 24) % n) * beatLen;
    } else {
      src = 'app'; bpm = appBpm(); beatLen = 60000 / bpm;
      if (S.metRunning && S.metBeat) org = S.metBeat.t - ((S.metBeat.beat || 0) % n) * beatLen;
      else org = S.freeOrg || 0;
    }
    var barLen = n * beatLen, since = now - org, barPos = ((since % barLen) + barLen) % barLen;
    S.clock = { source: src, bpm: bpm, bpb: n, org: org, beatLen: beatLen, bar: Math.floor(since / barLen), beat: Math.floor(barPos / beatLen) };
    return S.clock;
  }

  // ---- canvas ----
  function laneY(v, bottom, laneH) { return bottom - 3 - (v / 127) * (laneH - 18); }
  function ensureSize() {
    var c = S.canvas; if (!c) return;
    var cw = c.clientWidth, chh = c.clientHeight;
    if (!cw || !chh) return; // hidden: keep the last backing store
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cw !== S.w || chh !== S.h || dpr !== S.dpr) {
      S.w = cw; S.h = chh; S.dpr = dpr;
      c.width = Math.round(cw * dpr); c.height = Math.round(chh * dpr);
    }
  }
  function draw(now, ck, winMs) {
    var cx = S.cx, W = S.w || S.canvas.width, H = S.h || S.canvas.height, C = S.colors, i, k, x, y;
    if (!cx || !W || !H) return;
    cx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    cx.fillStyle = C.card2; cx.fillRect(0, 0, W, H);
    function X(t) { return W - (now - t) / winMs * W; }
    var showOut = S.opts.showOut, laneList = S.opts.lanes, nl = laneList.length;
    var rollTop = STRIP, rollH = nl ? Math.round((H - STRIP) * 0.6) : H - STRIP, laneTop = rollTop + rollH, laneH = nl ? (H - laneTop) / nl : 0;

    // grid: beat / bar lines over the whole height
    var k0 = Math.ceil((now - winMs - ck.org) / ck.beatLen), kMax = Math.floor((now - ck.org) / ck.beatLen), guard = 0;
    cx.lineWidth = 1;
    for (k = k0; k <= kMax && guard < 600; k++, guard++) {
      x = Math.round(X(ck.org + k * ck.beatLen)) + 0.5;
      var bar = ((k % ck.bpb) + ck.bpb) % ck.bpb === 0;
      cx.strokeStyle = bar ? C.line : C.lineSoft;
      cx.beginPath(); cx.moveTo(x, bar ? 0 : STRIP); cx.lineTo(x, H); cx.stroke();
    }
    // transport markers in the strip
    cx.font = '11px ' + 'Barlow, system-ui, sans-serif'; cx.textBaseline = 'alphabetic'; cx.textAlign = 'left';
    for (i = 0; i < S.marks.length; i++) {
      var mk = S.marks[i]; if (mk.dir === 'out' && !showOut) continue;
      x = Math.round(X(mk.t)) + 0.5;
      cx.strokeStyle = mk.dir === 'in' ? C.accent : C.muted;
      cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke();
      cx.fillStyle = mk.dir === 'in' ? C.text : C.muted;
      cx.fillText(mk.type === 'start' ? '▶' : mk.type === 'cont' ? '‖' : '■', x + 3, 12);
    }
    cx.strokeStyle = C.line; cx.beginPath(); cx.moveTo(0, STRIP + 0.5); cx.lineTo(W, STRIP + 0.5); cx.stroke();

    // note roll: rows = the pitch span seen (min two octaves)
    var lo = 128, hi = -1, nt;
    for (i = 0; i < S.notes.length; i++) { nt = S.notes[i]; if (nt.dir === 'out' && !showOut) continue; if (nt.n < lo) lo = nt.n; if (nt.n > hi) hi = nt.n; }
    if (hi < 0) { lo = 48; hi = 71; }
    if (hi - lo < 23) { var mid = Math.round((lo + hi) / 2); lo = mid - 12; hi = lo + 23; }
    if (lo < 0) { hi -= lo; lo = 0; } if (hi > 127) { lo -= hi - 127; hi = 127; if (lo < 0) lo = 0; }
    var rows = hi - lo + 1, rh = rollH / rows;
    cx.strokeStyle = C.lineSoft;
    for (k = lo; k <= hi; k++) if (k % 12 === 0) { y = Math.round(rollTop + (hi - k + 1) * rh) + 0.5; cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
    for (i = 0; i < S.notes.length; i++) {
      nt = S.notes[i]; if (nt.dir === 'out' && !showOut) continue;
      var x0 = X(nt.t0), x1 = nt.t1 === null ? W : X(nt.t1);
      if (x1 < 0) continue; if (x0 < 0) x0 = 0; if (x1 - x0 < 2) x1 = x0 + 2;
      y = rollTop + (hi - nt.n) * rh;
      var a = 0.35 + 0.65 * (nt.vel / 127);
      if (nt.dir === 'in') { cx.fillStyle = chColor(nt.ch, a); cx.fillRect(x0, y + 0.5, x1 - x0, Math.max(1, rh - 1)); }
      else { cx.strokeStyle = chColor(nt.ch, a); cx.strokeRect(x0 + 0.5, y + 1, Math.max(1, x1 - x0 - 1), Math.max(1, rh - 2)); }
    }

    // CC lanes: step lines 0-127, label + last value
    for (i = 0; i < nl; i++) {
      var cc = laneList[i], ln = S.lanes[cc], top = laneTop + i * laneH, bottom = top + laneH, pts = ln ? ln.pts : [];
      cx.strokeStyle = C.line; cx.beginPath(); cx.moveTo(0, Math.round(top) + 0.5); cx.lineTo(W, Math.round(top) + 0.5); cx.stroke();
      var prev = null, dashed = false, drawn = 0;
      cx.strokeStyle = C.accent; cx.lineWidth = 1.5; cx.setLineDash([]);
      cx.beginPath();
      for (k = 0; k < pts.length; k++) {
        var p = pts[k]; if (p.dir === 'out' && !showOut) continue;
        var px = X(p.t); if (px < 0) px = 0;
        var wantDash = p.dir === 'out', py = laneY(p.v, bottom, laneH);
        if (prev === null) { cx.moveTo(px, py); }
        else {
          if (wantDash !== dashed) { cx.stroke(); cx.beginPath(); cx.setLineDash(wantDash ? [3, 3] : []); dashed = wantDash; cx.moveTo(prev.x, prev.y); }
          cx.lineTo(px, prev.y); cx.lineTo(px, py);
        }
        prev = { x: px, y: py }; drawn++;
      }
      if (prev) { cx.lineTo(W, prev.y); cx.stroke(); }
      cx.setLineDash([]); cx.lineWidth = 1;
      cx.fillStyle = C.muted; cx.textAlign = 'left'; cx.fillText(laneLabel(cc), 6, top + 13);
      cx.fillStyle = C.text; cx.textAlign = 'right';
      cx.fillText(ln && ln.last !== null && drawn ? String(ln.last) : '—', W - 6, top + 13);
    }
    cx.textAlign = 'left';
  }
  function paintDots(now) {
    var dots = S.els.dots; if (!dots) return;
    for (var ch = 0; ch < 16; ch++) {
      var lit = S.lastOn[ch] != null && now - S.lastOn[ch] <= LIT_MS;
      if (lit !== !!S.lit[ch]) { S.lit[ch] = lit; if (dots[ch]) dots[ch].classList.toggle('lit', lit); }
    }
  }
  function clockText(ck) {
    if (ck.source === 'synth') return 'Clock: synth ' + ck.bpm.toFixed(1) + ' BPM';
    if (ck.source === 'hub') return 'Clock: Hub out ' + Math.round(ck.bpm);
    return 'No clock — grid from app tempo ' + Math.round(ck.bpm);
  }
  function statText(now) {
    var per = [], best = -1, bestN = 0, recent = 0, i, nt, total = S.counts['in'] + S.counts.out + S.counts.clock;
    if (!total) return 'Nothing received yet — play the synth, or start its arpeggio or sequencer.';
    for (i = 0; i < 16; i++) per.push(0);
    for (i = 0; i < S.notes.length; i++) {
      nt = S.notes[i]; if (nt.dir === 'out' && !S.opts.showOut) continue;
      per[nt.ch]++; if (nt.t0 >= now - 1000) recent++;
      if (per[nt.ch] > bestN) { bestN = per[nt.ch]; best = nt.ch; }
    }
    var s = recent + ' notes/s';
    if (best >= 0) s += ' · busiest ' + partLabel() + ' ' + (best + 1);
    s += ' · ' + countSince(S.ticks, now - 1000) + ' clocks/s';
    if (S.sysexN) s += ' · ' + S.sysexN + ' SysEx';
    return s;
  }
  function paintText(now, ck) {
    if (S.els.clock) S.els.clock.textContent = clockText(ck);
    if (S.els.stat) S.els.stat.textContent = statText(now);
    if (S.canvas) S.canvas.setAttribute('aria-label', 'Synth scope: ' + clockText(ck) + '. ' + statText(now));
  }
  function frame() {
    if (!S.canvas) return;
    ensureSize();
    var now = nowMs(), ck = analyse(now), winMs = S.opts.win * ck.bpb * ck.beatLen;
    prune(now - winMs);
    draw(now, ck, winMs);
    paintDots(now);
    // the two text lines: once per second, or at once when something they say changed
    if (S.textDirty || now - S.lastText >= 1000 || ck.source !== S.lastSrc || Math.abs(ck.bpm - S.lastBpm) >= 0.05 || S.notes.length !== S.lastNoteN) {
      S.lastText = now; S.textDirty = false; S.lastSrc = ck.source; S.lastBpm = ck.bpm; S.lastNoteN = S.notes.length;
      paintText(now, ck);
    }
  }

  // ---- rAF loop (<= 30 fps; only while active, visible, not frozen) ----
  function canRun() { return S.active && !S.frozen && !document.hidden && !!S.canvas; }
  function start() { if (S.raf || !canRun()) return; S.raf = requestAnimationFrame(tick); }
  function stop() { if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; }
  function tick(ts) {
    S.raf = 0;
    if (!canRun()) return;
    if (ts - S.lastFrame >= FRAME_MS - 1) { S.lastFrame = ts; frame(); }
    S.raf = requestAnimationFrame(tick);
  }
  function setActive(on) { S.active = !!on; if (S.active) start(); else stop(); }
  function freeze(on) {
    S.frozen = on === undefined ? !S.frozen : !!on;
    var b = S.els.freeze;
    if (b) { b.setAttribute('aria-pressed', S.frozen ? 'true' : 'false'); b.textContent = S.frozen ? 'Frozen' : 'Freeze'; }
    if (S.frozen) { stop(); if (S.canvas) frame(); } else start();
  }

  // ---- options ----
  function cleanLanes(list) {
    var out = [], i, v;
    if (!Array.isArray(list)) return out;
    for (i = 0; i < list.length && out.length < MAX_LANES; i++) { v = clampCc(list[i]); if (v !== null && out.indexOf(v) < 0) out.push(v); }
    return out;
  }
  function applyOpts(o) {
    if (!o || typeof o !== 'object') return;
    if (o.win !== undefined && WINS.indexOf(+o.win) >= 0) S.opts.win = +o.win;
    if (o.lanes !== undefined) S.opts.lanes = cleanLanes(o.lanes);
    if (o.showOut !== undefined) S.opts.showOut = !!o.showOut;
    if (typeof o.onChange === 'function') S.opts.onChange = o.onChange;
    if (Array.isArray(o.notes)) S.opts.notes = o.notes.slice();
    syncLanes();
  }
  function syncLanes() {
    var k, keep = {};
    S.opts.lanes.forEach(function (cc) { keep[cc] = true; laneEntry(cc).name = ccName(cc); });
    for (k in S.lanes) if (!keep[k]) delete S.lanes[k];
  }
  function emitChange() {
    if (typeof S.opts.onChange !== 'function') return;
    try { S.opts.onChange({ win: S.opts.win, lanes: S.opts.lanes.slice(), showOut: S.opts.showOut }); } catch (e) { console.error('synth scope onChange', e); }
  }
  function redraw() { S.textDirty = true; if (S.canvas && !S.raf) frame(); }
  function setWindow(bars) {
    if (WINS.indexOf(+bars) < 0) return;
    S.opts.win = +bars; paintWin(); emitChange(); redraw();
  }
  function setLanes(list) { S.opts.lanes = cleanLanes(list); syncLanes(); paintLanes(); emitChange(); redraw(); }
  function lanes() { return S.opts.lanes.slice(); }
  function setShowOut(on) {
    S.opts.showOut = !!on;
    if (S.els.sout) S.els.sout.checked = S.opts.showOut;
    emitChange(); redraw();
  }

  // ---- DOM ----
  var TIPS = [
    'Check on the synth: on a MODX the Scope sees arpeggio notes only with Utility › Settings › MIDI I/O › Arp MIDI Out = On — that switch also makes incoming MIDI bypass the arpeggiator.',
    'Check on the synth: the beat grid follows the synth only with Clock Out = On and MIDI Sync = Internal (same MIDI I/O screen); without a clock the grid runs at the app tempo.',
    'Check on the synth: the Motion Sequencer itself sends no MIDI — the Scope can only draw the Super Knob / Assign knob CC it drives, and only while that knob transmits its CC.',
    'Check on the synth: Part n arrives on channel n only in MIDI I/O Mode Multi (Utility › Settings › Advanced); in Single mode every Part shares one channel.'
  ];
  function tipsHTML() {
    var lines = TIPS.slice();
    (S.opts.notes || []).forEach(function (n) { n = String(n || '').trim(); if (!n) return; if (!/^check on the synth:/i.test(n)) n = 'Check on the synth: ' + n; if (lines.indexOf(n) < 0) lines.push(n); });
    return '<details class="tips" id="sdk-stips"><summary>What the Scope can see</summary>' +
      '<p>The Scope draws only what reaches soundLAB: the MIDI the synth transmits (notes, controller moves, clock) and, with “Show what I send” on, what the Hub sends to it. The right edge is now; tap the picture to freeze it. Nothing here sends MIDI.</p>' +
      '<ul>' + lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></details>';
  }
  function winHTML() {
    return WINS.map(function (w) { return '<button type="button" data-win="' + w + '"' + (w === S.opts.win ? ' class="active" aria-pressed="true"' : ' aria-pressed="false"') + '>' + w + (w === 1 ? ' bar' : w === 8 ? ' bars' : '') + '</button>'; }).join('');
  }
  function lanesHTML() {
    var h = S.opts.lanes.map(function (cc) {
      return '<button type="button" class="chip sdk-lane" data-lane="' + cc + '" title="Remove this lane">' + esc(laneLabel(cc)) + ' <span class="sdk-x" aria-hidden="true">×</span></button>';
    }).join('');
    if (S.adding) {
      var opts = '', n;
      for (n = 0; n < 128; n++) { var nm = ccName(n); if (nm) opts += '<option value="' + n + '" label="' + esc(nm) + '"></option>'; }
      h += '<span class="sdk-lanefrm" id="sdk-lanefrm"><input type="number" id="sdk-lanenum" min="0" max="127" step="1" inputmode="numeric" placeholder="CC" aria-label="CC number" list="sdk-lanelist"><datalist id="sdk-lanelist">' + opts + '</datalist>' +
        '<button type="button" class="btn sm" id="sdk-laneok">Add</button><button type="button" class="btn sm" id="sdk-lanecancel">Cancel</button></span>';
    }
    h += '<button type="button" class="chip" id="sdk-addlane"' + (S.adding || S.opts.lanes.length >= MAX_LANES ? ' hidden' : '') + '>+ lane</button>';
    return h;
  }
  function build() {
    var box = S.box, dots = '', i;
    for (i = 0; i < 16; i++) dots += '<i class="sdk-pd" data-part="' + i + '" title="' + esc(partLabel()) + ' ' + (i + 1) + '">' + (i + 1) + '</i>';
    box.innerHTML =
      '<div class="sdk-stool">' +
        '<span class="muted small sdk-slab">Bars</span><div class="seg" id="sdk-swin" role="group" aria-label="Window in bars">' + winHTML() + '</div>' +
        '<button type="button" class="btn sm" id="sdk-sfreeze" aria-pressed="' + (S.frozen ? 'true' : 'false') + '">' + (S.frozen ? 'Frozen' : 'Freeze') + '</button>' +
        '<label class="mh-chk"><input type="checkbox" id="sdk-sout"' + (S.opts.showOut ? ' checked' : '') + '> Show what I send</label>' +
        '<span id="sdk-sclock" class="sdk-sclock" aria-live="off"></span>' +
      '</div>' +
      '<div id="sdk-slanes" class="sdk-slanes" aria-label="CC lanes">' + lanesHTML() + '</div>' +
      '<canvas id="sdk-canvas" class="sdk-canvas" role="img" aria-label="Synth scope"></canvas>' +
      '<div id="sdk-parts" class="sdk-parts" aria-label="Activity per channel">' + dots + '</div>' +
      '<div id="sdk-sstat" class="sdk-sstat muted small" aria-live="off"></div>' +
      tipsHTML();
    S.els = {
      win: box.querySelector('#sdk-swin'), freeze: box.querySelector('#sdk-sfreeze'), sout: box.querySelector('#sdk-sout'),
      lanes: box.querySelector('#sdk-slanes'), clock: box.querySelector('#sdk-sclock'), stat: box.querySelector('#sdk-sstat'),
      dots: Array.prototype.slice.call(box.querySelectorAll('#sdk-parts .sdk-pd'))
    };
    S.canvas = box.querySelector('#sdk-canvas');
    S.cx = S.canvas.getContext('2d');
    S.w = S.h = 0; S.lit = [];
    wireDom();
  }
  function paintWin() {
    var b = S.els.win; if (!b) return;
    Array.prototype.forEach.call(b.querySelectorAll('button'), function (x) {
      var on = +x.getAttribute('data-win') === S.opts.win;
      x.classList.toggle('active', on); x.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function paintLanes() { if (S.els.lanes) S.els.lanes.innerHTML = lanesHTML(); }
  function addLaneFromForm() {
    var inp = S.box && S.box.querySelector('#sdk-lanenum'), v = inp ? clampCc(inp.value) : null;
    if (v === null) { if (inp) inp.focus(); return; }
    S.adding = false;
    if (S.opts.lanes.indexOf(v) >= 0 || S.opts.lanes.length >= MAX_LANES) { paintLanes(); return; }
    setLanes(S.opts.lanes.concat([v]));
  }
  function wireDom() {
    var box = S.box;
    box.addEventListener('click', function (e) {
      var t = e.target, b;
      b = t.closest ? t.closest('#sdk-swin button') : null;
      if (b) { setWindow(+b.getAttribute('data-win')); return; }
      b = t.closest ? t.closest('.sdk-lane') : null;
      if (b) { var cc = +b.getAttribute('data-lane'); setLanes(S.opts.lanes.filter(function (x) { return x !== cc; })); return; }
      if (t.closest && t.closest('#sdk-addlane')) { S.adding = true; paintLanes(); var inp = box.querySelector('#sdk-lanenum'); if (inp) inp.focus(); return; }
      if (t.closest && t.closest('#sdk-laneok')) { addLaneFromForm(); return; }
      if (t.closest && t.closest('#sdk-lanecancel')) { S.adding = false; paintLanes(); return; }
      if (t.closest && t.closest('#sdk-sfreeze')) { freeze(); return; }
      if (t === S.canvas) { freeze(); return; }
    });
    box.addEventListener('keydown', function (e) {
      if (!e.target || e.target.id !== 'sdk-lanenum') return;
      if (e.key === 'Enter') { e.preventDefault(); addLaneFromForm(); }
      else if (e.key === 'Escape') { e.preventDefault(); S.adding = false; paintLanes(); }
    });
    if (S.els.sout) S.els.sout.addEventListener('change', function () { setShowOut(S.els.sout.checked); });
  }
  function observe() {
    unobserve();
    if (window.ResizeObserver && S.canvas) {
      S.ro = new ResizeObserver(function () { ensureSize(); if (!S.raf) frame(); });
      S.ro.observe(S.canvas);
    }
    if (window.MutationObserver) {
      S.mo = new MutationObserver(function () { readColors(); if (!S.raf) frame(); });
      S.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] });
    }
  }
  function unobserve() {
    if (S.ro) { try { S.ro.disconnect(); } catch (e) { } S.ro = null; }
    if (S.mo) { try { S.mo.disconnect(); } catch (e) { } S.mo = null; }
  }

  // ---- bus (registered once; everything ignored unless active) ----
  function isSynthPort(portId) {
    var api = S.api, id = null;
    if (!api) return false;
    try { id = api.hubOutId(); if (id == null) { var m = api.midi(); id = m ? m.outputId : null; } } catch (e) { id = null; }
    return id != null && String(portId) === String(id);
  }
  function wireBus() {
    if (wired || !window.App || !App.on) return;
    wired = true;
    App.on('midi:raw', function (d) { if (!S.active || !d) return; feed(d.bytes, 'in', performance.now(), d.portId); });
    App.on('midi:out', function (d) {
      if (!S.active || !d || d.kind !== 'music' || !isSynthPort(d.portId)) return;
      feed(d.bytes, 'out', performance.now(), d.portId);
    });
    App.on('met:beat', function (d) { S.metBeat = { t: performance.now(), beat: (d && d.beat) || 0 }; });
    App.on('met:state', function (d) { S.metRunning = !!(d && d.running); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
    if (!window.ResizeObserver) window.addEventListener('resize', function () { if (S.canvas) { ensureSize(); if (!S.raf) frame(); } });
  }

  // ---- CSS ----
  function css() {
    if (!window.App || !App.injectCSS) return;
    App.injectCSS('synthscope',
      '.sdk-stool{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;margin-bottom:8px}' +
      '.sdk-stool .sdk-slab{margin-right:-4px}' +
      '.sdk-sclock{margin-left:auto;font-family:var(--font-condensed);font-size:14px;color:var(--muted);white-space:nowrap}' +
      '#sdk-sfreeze[aria-pressed="true"]{background:var(--accent-soft);border-color:var(--accent-line);color:var(--accent-ink)}' +
      '.sdk-slanes{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px}' +
      '.sdk-lane .sdk-x{opacity:.6;margin-left:2px}' +
      '.sdk-lanefrm{display:inline-flex;gap:4px;align-items:center}' +
      '.sdk-lanefrm input{width:72px;min-height:var(--h-ctl);padding:4px 8px;border-radius:9px;border:1px solid var(--line);background:var(--card2);color:var(--text);font:inherit}' +
      '.sdk-canvas{display:block;width:100%;max-width:100%;height:240px;border-radius:10px;background:var(--card2);touch-action:pan-y;cursor:pointer}' +
      '@media (max-width:700px){.sdk-canvas{height:200px}}' +
      '.sdk-parts{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}' +
      '.sdk-pd{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--card2);border:1px solid var(--line);color:var(--muted);font-style:normal;font-size:10.5px;font-family:var(--font-condensed);transition:background 120ms ease,color 120ms ease,border-color 120ms ease}' +
      '.sdk-pd.lit{background:var(--accent);border-color:var(--accent);color:var(--card)}' +
      '.sdk-sstat{margin-top:6px;min-height:1.4em}' +
      '@media (pointer:coarse){.sdk-stool .seg button{min-height:44px}.sdk-lane,#sdk-addlane,#sdk-sfreeze{min-height:44px}}'
    );
  }

  // ---- public ----
  function mount(container, api, opts) {
    if (!container) return;
    if (S.box && S.box !== container) teardownDom();
    if (api) S.api = api;
    css(); readColors();
    applyOpts(opts);
    if (!S.freeOrg) S.freeOrg = performance.now();
    var fresh = S.box !== container || !container.querySelector('#sdk-canvas');
    S.box = container;
    if (fresh) build(); else { paintWin(); paintLanes(); if (S.els.sout) S.els.sout.checked = S.opts.showOut; }
    observe(); wireBus();
    S.textDirty = true;
    frame();
    if (S.active) start();
  }
  function teardownDom() {
    stop(); unobserve();
    if (S.box) { try { S.box.innerHTML = ''; } catch (e) { } }
    S.box = null; S.els = {}; S.canvas = null; S.cx = null; S.w = S.h = 0; S.lit = []; S.adding = false;
  }
  function unmount() { teardownDom(); S.active = false; }
  function state() {
    var now = nowMs(), ck = analyse(now), lanesOut = {}, parts = [], i, l;
    for (i = 0; i < 16; i++) parts.push(false);
    for (i = 0; i < S.notes.length; i++) parts[S.notes[i].ch] = true;
    S.opts.lanes.forEach(function (cc) { l = S.lanes[cc]; lanesOut[String(cc)] = { cc: cc, name: l ? l.name : ccName(cc), last: l ? l.last : null, n: l ? l.pts.length : 0 }; });
    return {
      source: ck.source, bpm: ck.bpm, bar: ck.bar, beat: ck.beat, bpb: ck.bpb, running: S.raf !== 0,
      notes: S.notes.map(function (n) { return { ch: n.ch, n: n.n, vel: n.vel, t0: n.t0, t1: n.t1, dir: n.dir }; }),
      lanes: lanesOut, parts: parts, counts: { 'in': S.counts['in'], out: S.counts.out, clock: S.counts.clock },
      win: S.opts.win, showOut: S.opts.showOut, frozen: S.frozen, active: S.active
    };
  }

  window.SLSynthScope = {
    mount: mount, unmount: unmount, setActive: setActive, start: start, stop: stop,
    get running() { return S.raf !== 0; },
    feed: feed, frame: frame, state: state,
    setWindow: setWindow, setLanes: setLanes, lanes: lanes, freeze: freeze, setShowOut: setShowOut,
    get active() { return S.active; }, get frozen() { return S.frozen; }
  };
})();
