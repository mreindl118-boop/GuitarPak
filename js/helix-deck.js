/* soundLAB HELIX DECK — the Perform face of the Helix Stadium page
 * (docs/HELIX-DECK-SPEC.md, "js/helix-deck.js"). window.SLHelixDeck.
 *
 * js/helix.js mounts it at the end of its render: SLHelixDeck.init(#hxd-top,
 * #hxd-perform, App.helix). The deck paints ONLY through App.helix (the engine
 * in js/helix-routes.js): every send is an op(), every value it shows comes
 * from values(key) / state() and arrives through the engine's events, so a
 * thumb moves only after a send resolved ok and a refused control snaps back.
 * The Synth Deck (js/synthtab.js) is the UI model — the strip gesture here is
 * its hxd- twin — but nothing from the Synth files is referenced at runtime.
 *
 *   #hxd-top      Explain (?) · Perform | Edit · route badges (midi / net / usb)
 *   #hxd-perform  the Now bar (name, snapshot, fw, routes, provenance dot,
 *                 Arm / Prev / Next / Pin / Save), the snapshots strip, the
 *                 pins grid (a pin = an ADDRESS on the pedal, never a value
 *                 dump), the strips card (hero strip + row picker + four
 *                 strips; the pedals row adds the XY pad), chips and the
 *                 footswitch-mode radio — every region with an Explain caption
 *                 from SLHelixMap.EXPLAIN when Explain is on
 *   #hxd-sheet    the page-owned sheet: pin / rename / confirm — installed as
 *                 App.helix.ui.confirm so no window.confirm/prompt runs here
 *
 * SAFETY (null's model, unchanged): the deck never arms by itself and sends
 * nothing on init / show / mode / row / Explain / pin save; the gate is
 * re-checked at pointerdown AND on every move of a strip, a lapse mid-drag
 * ends the drag, snaps the strip back to the last confirmed value and toasts
 * once; momentary chips flash and never latch; Mute all while disarmed becomes
 * 'Arm & mute' (one tap arms, then mutes) instead of a silent refusal.
 * PROVENANCE: data-src on strips, snapshots and the Now dot = values(key).src
 * ('sent' grey, 'echo' amber, 'state' green).
 * Store hx.mode / hx.explain / hx.row / hx.hero / hx.pinPage (hx.fwConfirmed
 * via the engine). DOM/CSS prefix hxd-.
 */
(function () {
  'use strict';

  var A = window.App;
  if (!A) return;
  var VERSION = '1.0.0';
  var M = window.SLHelixMap || null;
  var PAGE_SIZE = 16, LONG_MS = 650, DBL_MS = 350;
  var COLOURS = { amber: 'var(--accent)', teal: '#2fb8a0', blue: '#4f8df5', pink: '#e06aa0', green: 'var(--green)', grey: 'var(--muted)' };
  var COLOUR_IDS = M && M.COLOURS ? M.COLOURS : ['amber', 'teal', 'blue', 'pink', 'green', 'grey'];
  var FSMODES = M && M.FSMODES ? M.FSMODES : ['Stomp A', 'Stomp B', 'Preset', 'Snapshot', 'Combo', 'Unassigned', 'Transport'];
  var ROWS = M && M.ROWS ? M.ROWS : [{ id: 'knobs14', name: 'Knobs 1–4', ctl: ['knob:0', 'knob:1', 'knob:2', 'knob:3'] }];
  // the chip strip: the map's list (+ App tempo after Tap) and the song transport (fw 1.3, disabled until the pedal reports it)
  var CHIPS = (M && M.CHIPS ? M.CHIPS.slice() : ['tuner', 'toe', 'tap', 'click', 'muteall']);
  if (CHIPS.indexOf('apptempo') < 0) CHIPS.splice(Math.max(0, CHIPS.indexOf('tap') + 1), 0, 'apptempo');
  var SONG_CHIPS = ['songplay', 'rtz', 'songprev', 'songnext', 'markprev', 'marknext'];
  var MIX_STRIPS = [[11, 'level', 'Home level'], [34, 'pan', 'Home pan'], [12, 'level', 'Path 1A level'], [13, 'level', 'Path 1B level']];
  var LAYERS = M && M.LAYERS ? M.LAYERS : [{ id: 'qtr', name: '¼" out', ch: 3 }, { id: 'xlr', name: 'XLR out', ch: 4 }, { id: 'pho', name: 'Phones', ch: 5 }];

  function g(k, d) { return A.store.get('hx.' + k, d); }
  function set(k, v) { A.store.set('hx.' + k, v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function int(v, lo, hi) { if (typeof v === 'string' && /^\s*-?\d+\s*$/.test(v)) v = +v; return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi ? v : null; }
  function explainOf(key) { return M && M.EXPLAIN && M.EXPLAIN[key] ? M.EXPLAIN[key] : ''; }
  function ctl(id) { return M && M.byId ? M.byId(id) : null; }

  var E = null, top = null, box = null, root = null, els = {}, wired = false, panelObs = null;
  var drag = null, turnT = 0, turnQ = {}, padDrag = null, toastT = 0;
  var sheet = { kind: '', data: null, resolve: null };
  var sending = {}, press = { el: null, t: 0, long: false }, tapped = { el: null, t: 0 };
  var blockKey = '', routeCap = '';

  function $(sel, el) { return (el || box || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || box || document).querySelectorAll(sel)); }
  function S() { return E.state(); }
  function toast(msg) {
    var t = root ? root.querySelector('#hx-toast') : null; if (!t) return;
    t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function explainOn() { return !!g('explain', false); }
  function cap(key, extra) { return explainOn() && (explainOf(key) || extra) ? '<p class="hxd-cap" data-cap="' + esc(key) + '">' + esc(explainOf(key) || extra) + '</p>' : ''; }
  function rowId() { var r = g('row', 'knobs14'); return ROWS.some(function (x) { return x.id === r; }) ? r : 'knobs14'; }
  function heroKey() { var h = g('hero', 'exp:0'); return /^(knob:[0-7]|exp:[01])$/.test(h) ? h : 'exp:0'; }
  function stomps() { var l = g('ccs', []); return Array.isArray(l) ? l : []; }
  function mixLayer() { var l = g('mixLayer', 'qtr'); return LAYERS.some(function (x) { return x.id === l; }) ? l : 'qtr'; }

  // ---- values: every number on screen comes from the engine --------------------------
  function paramDef(key) {
    var p = key.split(':'), b = E.defs.blockAt(+p[1], +p[2]); if (!b) return null;
    var d = E.defs.paramDefs(b).filter(function (x) { return x.id === +p[3]; })[0] || null;
    return d ? { b: b, p: d } : null;
  }
  function paramSpan(p) { var has = p && typeof p.min === 'number' && typeof p.max === 'number' && p.max > p.min; return has ? [p.min, p.max] : [0, 1]; }
  function toStrip(key, raw) {
    if (key.indexOf('param:') !== 0) return typeof raw === 'number' ? clamp(Math.round(raw), 0, 127) : null;
    if (typeof raw === 'boolean') raw = raw ? 1 : 0;
    if (typeof raw !== 'number') return null;
    var d = paramDef(key), sp = paramSpan(d && d.p);
    return clamp(Math.round((raw - sp[0]) / (sp[1] - sp[0]) * 127), 0, 127);
  }
  function fromStrip(key, v) {
    var d = paramDef(key), sp = paramSpan(d && d.p), raw = sp[0] + v / 127 * (sp[1] - sp[0]);
    return d && d.p && d.p.type === 'i' ? Math.round(raw) : +raw.toFixed(4);
  }
  function defOf(key) {
    var p = key.split(':');
    if (p[0] === 'mix') { var c = +p[2]; return c >= 34 && c <= 52 ? 64 : 100; }
    if (p[0] === 'param') { var d = paramDef(key); return d && d.p && typeof d.p.def === 'number' ? toStrip(key, d.p.def) : 64; }
    if (p[0] === 'stomp') return 0;
    var c0 = ctl(key); return c0 && typeof c0.def === 'number' ? c0.def : 64;
  }
  // the last confirmed value (0–127): what the engine sent, heard or read — else the stored state, else the control's default
  function valOf(key) {
    var r = E.values(key), v;
    if (r && r.v != null) { v = toStrip(key, r.v); if (v != null) return v; }
    var p = key.split(':'), st = S().st;
    if (p[0] === 'knob') v = st.kv && st.kv[+p[1]];
    else if (p[0] === 'exp') v = st.exp && st.exp[+p[1]];
    else if (p[0] === 'xy') v = st.xy && st.xy[+p[1]];
    else if (p[0] === 'stomp') { stomps().forEach(function (s) { if (s.cc === +p[1]) v = s.v; }); }
    else if (p[0] === 'param') { var d = paramDef(key); if (d) v = toStrip(key, d.b.vals[d.p.id]); }
    return typeof v === 'number' ? clamp(Math.round(v), 0, 127) : defOf(key);
  }
  function srcOf(key) { var r = E.values(key); return r && r.src ? r.src : 'none'; }
  function labelOf(key) {
    var p = key.split(':'), c = ctl(key);
    if (c) return c.name;
    if (p[0] === 'stomp') { var n = 'CC ' + p[1]; stomps().forEach(function (s) { if (s.cc === +p[1]) n = s.name; }); return n; }
    if (p[0] === 'mix') { var m = MIX_STRIPS.filter(function (x) { return x[0] === +p[2]; })[0]; return m ? m[2] : 'CC ' + p[2]; }
    if (p[0] === 'param') { var d = paramDef(key); return d ? d.p.name : 'param ' + p[3]; }
    return key;
  }
  function textOf(key, v) {
    if (key.indexOf('param:') === 0) { var d = paramDef(key); return d ? E.defs.fmt(d.b.vals[d.p.id], d.p) : String(v); }
    return String(v);
  }
  function routeOk(key) { return key.indexOf('param:') === 0 ? E.devOnline() : E.hasMidiOut(); }
  // the op a strip value goes out as
  function sendStrip(key, v) {
    var p = key.split(':');
    if (p[0] === 'knob') return E.op('knob', { i: +p[1], v: v });
    if (p[0] === 'exp') return E.op('exp', { i: +p[1], v: v });
    if (p[0] === 'stomp') return E.op('stomp', { cc: +p[1], v: v });
    if (p[0] === 'mix') return E.op('mix', { layer: p[1], cc: +p[2], v: v });
    if (p[0] === 'param') return E.op('param', { path: +p[1], slot: +p[2], pid: +p[3], v: fromStrip(key, v) });
    return Promise.resolve({ ok: false, reason: 'unknown control' });
  }

  // ---- mode: Perform (this face) | Edit (helix.js's six views) -----------------------
  function mode(name) {
    if (name === undefined) return E ? E.mode() : (g('mode', 'perform') === 'edit' ? 'edit' : 'perform');
    if (E && (name === 'perform' || name === 'edit')) E.mode(name); // emits 'state' mode -> applyMode here + helix.js
    applyMode();
    return mode();
  }
  function applyMode() {
    if (!box) return;
    var m = mode();
    box.hidden = m !== 'perform';
    $$('#hxd-mode button', top).forEach(function (b) { var on = b.getAttribute('data-mode') === m; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  }

  // ---- DOM ---------------------------------------------------------------------------------
  function stripHTML(key, cls, label) {
    return '<div class="hxd-strip' + (cls ? ' ' + cls : '') + '" data-key="' + esc(key) + '" role="slider" tabindex="0" aria-label="' + esc(label || labelOf(key)) + '" aria-valuemin="0" aria-valuemax="127" aria-valuenow="0" title="' + esc(explainOf(ctlKeyOf(key))) + '"><i class="hxd-fill"></i><i class="hxd-thumb"></i></div>';
  }
  function ctlKeyOf(key) { var p = key.split(':'); return p[0] === 'mix' ? (+p[2] >= 34 ? 'mix:pan' : 'mix:level') : p[0] === 'stomp' || p[0] === 'param' ? p[0] : key; }
  function oneHTML(key) {
    return '<div class="hxd-one" data-one="' + esc(key) + '"><div class="hxd-head"><span class="hxd-lab">' + esc(labelOf(key)) + '</span><b class="hxd-val" data-val="' + esc(key) + '">0</b></div>' + stripHTML(key) + '</div>';
  }
  function chipHTML(id) {
    var c = ctl(id); if (!c) return '';
    var unsure = c.conf !== 'verified';
    return '<button type="button" class="chip hxd-chip' + (unsure ? ' unsure' : '') + '" data-chip="' + esc(id) + '" title="' + esc(c.explain) + '"><span class="hxd-chipname">' + esc(c.name) + '</span>' + (unsure ? '<i class="hxd-q" aria-hidden="true">?</i>' : '') + '</button>';
  }
  function render() {
    if (!top || !box) return;
    if (sheet.kind) closeSheet(); // the sheet's DOM is about to be rebuilt
    pinSig = ''; pinPageShown = '';
    var m = mode();
    top.innerHTML =
      '<div class="hxd-top">' +
        '<button type="button" class="btn sm icon-btn hxd-explain' + (explainOn() ? ' active' : '') + '" id="hxd-explain" aria-pressed="' + explainOn() + '" aria-label="Explain the controls" title="Explain: one line under every region saying what it sends">?</button>' +
        '<div class="seg hxd-mode" id="hxd-mode" role="group" aria-label="Perform or edit">' +
          '<button type="button" data-mode="perform" class="' + (m === 'perform' ? 'active' : '') + '" aria-pressed="' + (m === 'perform') + '">Perform</button>' +
          '<button type="button" data-mode="edit" class="' + (m === 'edit' ? 'active' : '') + '" aria-pressed="' + (m === 'edit') + '">Edit</button>' +
        '</div>' +
        '<div class="hxd-routes" id="hxd-routes" role="group" aria-label="Routes">' +
          ['midi', 'net', 'usb'].map(function (r) { return '<span class="hxd-rbadge" role="button" tabindex="0" data-route="' + r + '" data-status="absent"><i class="hxd-rdot" aria-hidden="true"></i><span class="hxd-rname"></span></span>'; }).join('') +
        '</div>' +
      '</div>' +
      '<p class="hxd-cap hxd-routecap" id="hxd-routecap" hidden></p>' +
      (explainOn() ? cap('mode') + cap('routes') : '') +
      // the page-owned sheet lives in the top box (never hidden with the Perform face: Edit's confirms use it too)
      '<div class="hxd-sheet" id="hxd-sheet" role="dialog" aria-modal="true" aria-labelledby="hxd-sheettitle" hidden><div class="hxd-sheetcard">' +
        '<div class="hxd-sheethead"><h2 id="hxd-sheettitle"></h2><button type="button" class="btn sm icon-btn" id="hxd-sheetclose" aria-label="Close">×</button></div>' +
        '<div class="hxd-sheetbody" id="hxd-sheetbody"></div>' +
      '</div></div>';

    box.innerHTML =
      '<div class="card hxd-now" id="hxd-now">' +
        '<div class="hxd-nowhead"><i class="hxd-prov" id="hxd-prov" data-src="none" title="Provenance"></i><b id="hxd-nowname" class="hxd-nowname"></b></div>' +
        '<span id="hxd-nowsub" class="muted small hxd-nowsub"></span>' +
        '<div class="hxd-nowacts" id="hxd-nowacts">' +
          '<span id="hxd-armst" class="hxd-armst" role="status">DISARMED</span>' +
          '<button type="button" class="btn hxd-big hxd-armbtn" id="hxd-arm" aria-pressed="false" aria-describedby="hxd-armst"><span id="hxd-armlab">Arm</span></button>' +
          '<button type="button" class="btn hxd-big" id="hxd-prev" aria-label="Previous preset" title="CC 9 = 12">' + A.icon('left', 18) + '<span>Prev</span></button>' +
          '<button type="button" class="btn hxd-big" id="hxd-next" aria-label="Next preset" title="CC 9 = 13"><span>Next</span>' + A.icon('right', 18) + '</button>' +
          '<button type="button" class="btn hxd-big" id="hxd-pin" title="Pin this address on this device — nothing is sent">' + A.icon('star', 18) + '<span>Pin</span></button>' +
          '<button type="button" class="btn hxd-big primary" id="hxd-save" hidden title="/SavePresetWithCID on the active preset (after a confirm)">Save</button>' +
        '</div>' +
        '<div class="muted small hxd-armmsg" id="hxd-armmsg" role="status" aria-live="polite"></div>' +
        cap('now') + cap('arm') +
      '</div>' +
      '<div class="hxd-snaps" id="hxd-snaps" role="group" aria-label="Snapshots">' +
        '<button type="button" class="btn hxd-snstep" id="hxd-snprev" aria-label="Previous snapshot" title="CC 69 = 9">' + A.icon('left', 18) + '</button>' +
        [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return '<button type="button" class="hxd-snap" data-snap="' + i + '" data-src="none" aria-label="Snapshot ' + (i + 1) + '"><b>' + (i + 1) + '</b><span></span></button>'; }).join('') +
        '<button type="button" class="btn hxd-snstep" id="hxd-snnext" aria-label="Next snapshot" title="CC 69 = 8">' + A.icon('right', 18) + '</button>' +
      '</div>' + cap('snaps') +
      '<div class="hxd-pins" id="hxd-pins" role="group" aria-label="Pins"><div class="hxd-pingrid"></div><button type="button" class="hxd-pinempty" id="hxd-pinempty" hidden>' + A.icon('star', 18) + ' Pin the loaded preset</button><div class="hxd-pinpager" id="hxd-pinpager" hidden></div></div>' + cap('pins') +
      '<div class="card hxd-strips" id="hxd-strips">' +
        '<div class="hxd-hero" id="hxd-hero"></div>' + cap('hero') +
        '<div class="seg hxd-rows" id="hxd-rows" role="group" aria-label="Which four strips">' + ROWS.map(function (r) { return '<button type="button" data-row="' + r.id + '">' + esc(r.name) + '</button>'; }).join('') + '</div>' + cap('rows') +
        '<div class="hxd-rowbox" id="hxd-rowbox"></div>' + cap('strips') +
      '</div>' +
      '<div class="hxd-chips" id="hxd-chips" role="group" aria-label="Chips">' + CHIPS.map(chipHTML).join('') + '</div>' + cap('chips') +
      '<div class="hxd-chips hxd-songchips" id="hxd-songchips" role="group" aria-label="Song transport (firmware 1.3)"><span class="ctl-label hxd-songlab">Song</span>' + SONG_CHIPS.map(chipHTML).join('') + '</div>' +
      '<p class="muted small hxd-fwcap" id="hxd-fwcap" hidden></p>' +
      '<div class="hxd-fsrow"><span class="ctl-label">Footswitch mode</span><div class="seg hxd-fsmode" id="hxd-fsmode" role="group" aria-label="Footswitch mode">' + FSMODES.map(function (n, i) { return '<button type="button" data-fs="' + i + '" title="CC 37 = ' + i + '">' + esc(n) + '</button>'; }).join('') + '</div></div>' + cap('fsmode');

    els = {};
    ['explain', 'mode', 'routes', 'routecap', 'sheet', 'sheettitle', 'sheetclose', 'sheetbody'].forEach(function (k) { els[k] = top.querySelector('#hxd-' + k); });
    ['now', 'prov', 'nowname', 'nowsub', 'arm', 'armst', 'armlab', 'prev', 'next', 'pin', 'save', 'armmsg', 'snaps', 'pins', 'pinempty', 'pinpager', 'hero', 'rows', 'rowbox', 'chips', 'fwcap', 'fsmode'].forEach(function (k) { els[k] = box.querySelector('#hxd-' + k); });
    els.pingrid = els.pins.querySelector('.hxd-pingrid');
    paintAll();
  }
  function paintAll() {
    applyMode(); paintRoutes(); paintNow(); paintArm(); paintSnaps(); paintPins(); paintHero(); renderFour(); paintChips(); paintFs();
  }
  // every row can be picked; one that cannot work yet says so in its place (Block needs the
  // bridge, Mixer firmware 1.4: its strips stay inert with the caption) — the picker never hides a row
  function paintRows() {
    if (!els.rows) return;
    var id = rowId(), fw = S().fw.str;
    $$('button[data-row]', els.rows).forEach(function (b) {
      var r = b.getAttribute('data-row'), on = r === id;
      b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('needs', (r === 'block' && !E.devOnline()) || (r === 'mix' && !E.fwOk('1.4')));
      b.title = r === 'block' && !E.devOnline() ? 'Needs the bridge (node tools/helix-bridge.js).' : r === 'mix' && !E.fwOk('1.4') ? 'Needs firmware 1.4 on the pedal. This pedal: fw ' + (fw || 'unknown') + '.' : explainOf(r);
    });
  }

  // ---- paint: the Now bar ------------------------------------------------------------------
  function matchingPin(st) { return E.favs().filter(function (f) { return f.bank === st.setlist && f.prog === st.prog; })[0] || null; }
  function addrText(st) { var bn = E.fmt.bankName(st.setlist), sl = E.fmt.addrLabel(st.setlist, st.prog); return /^Setlist/.test(bn) ? bn + ' · ' + sl : bn + ' ' + sl; }
  function paintNow() {
    if (!els.nowname) return;
    var s = S(), st = s.st, dev = s.dev, act = dev.active, name, src;
    if (act && act.name) { name = act.name; src = 'state'; }
    else { var pin = matchingPin(st); name = pin ? pin.name : addrText(st); src = srcOf('prog') !== 'none' ? srcOf('prog') : srcOf('setlist'); }
    els.nowname.textContent = name;
    els.prov.setAttribute('data-src', src || 'none');
    els.prov.title = { sent: 'Grey: what soundLAB sent', echo: 'Amber: the pedal’s MIDI echo', state: 'Green: read back over the bridge', none: 'Nothing known yet' }[src || 'none'];
    var sn = dev.snapNames && dev.snapNames[st.snap], parts = ['Snapshot ' + (st.snap + 1) + (sn ? ' “' + sn + '”' : '')];
    if (s.fw && s.fw.str) parts.push('fw ' + s.fw.str + (s.fw.src === 'confirmed' ? ' (you said)' : ''));
    var via = []; if (s.routes.midi.status === 'online') via.push('MIDI'); if (s.routes.net.status === 'online') via.push('net');
    parts.push(via.length ? 'via ' + via.join(' + ') : 'no route — connect the Helix');
    els.nowsub.textContent = parts.join(' · ');
    els.nowsub.classList.toggle('bad', !via.length);
    var online = E.devOnline();
    els.save.hidden = !online; els.save.classList.toggle('hxd-big', online); // a hidden Save is not one of the big targets
  }
  function paintArm() {
    if (!els.arm) return;
    var s = S(), sf = s.safe, on = sf && s.on && Date.now() < s.until;
    els.armst.textContent = !sf ? 'SAFE MODE OFF' : on ? 'ARMED' : 'DISARMED';
    els.armst.className = 'hxd-armst' + (!sf ? ' unsafe' : on ? ' on' : '');
    els.armlab.textContent = !sf ? 'Arm (safe mode off)' : on ? 'Disarm' : 'Arm';
    els.arm.disabled = !sf || (!s.on && !E.canArm()); // safe mode off: nothing to arm, the pill says so
    els.arm.classList.toggle('on', !!on);
    els.arm.setAttribute('aria-pressed', String(!!s.on));
    els.armmsg.textContent = s.msg || '';
    paintMute();
  }
  function paintRoutes() {
    if (!els.routes) return;
    var s = S(), r = s.routes;
    $$('.hxd-rbadge', els.routes).forEach(function (b) {
      var id = b.getAttribute('data-route'), st = r[id].status, label;
      if (id === 'midi') label = st === 'online' ? 'MIDI' : st === 'available' ? 'MIDI port only' : r.midi.requested ? 'No MIDI' : 'MIDI';
      else if (id === 'net') label = st === 'online' ? 'Bridge' : st === 'connecting' ? 'Bridge…' : st === 'available' ? 'Bridge up' : 'Bridge';
      else label = 'USB';
      b.setAttribute('data-status', st);
      b.querySelector('.hxd-rname').textContent = label;
      b.title = routeDetail(id);
      b.setAttribute('aria-label', label + ': ' + st);
    });
    if (routeCap) { els.routecap.textContent = routeDetail(routeCap); els.routecap.hidden = false; } else els.routecap.hidden = true;
  }
  function routeDetail(id) {
    var s = S(), r = s.routes;
    if (id === 'midi') return r.midi.status === 'online' ? 'MIDI to ' + r.midi.dest + ' on channel ' + s.channels.global + (r.midi.mode === 'app' ? ' (soundLAB’s shared output)' : '') : r.midi.err ? r.midi.err : r.midi.requested ? 'No "Helix Stadium MIDI" port listed. Check the USB-C cable and USB MIDI in Global Settings › MIDI.' : 'Tap to connect over MIDI (the Helix’s own USB or 5-pin port).';
    if (id === 'net') return r.net.status === 'online' ? 'Bridge at ' + r.net.url + ' · Helix at ' + (r.net.ip || r.net.host) : r.net.status === 'available' ? 'Bridge up at ' + r.net.url + ', looking for the Helix' : r.net.status === 'connecting' ? 'Connecting to ' + r.net.url + ' … (run: node tools/helix-bridge.js)' : 'Tap to connect the bridge (node tools/helix-bridge.js on this computer).';
    return r.usb.caption;
  }

  // ---- paint: snapshots ------------------------------------------------------------------------
  function paintSnaps() {
    if (!els.snaps) return;
    var s = S(), st = s.st, names = s.dev.snapNames || [], src = srcOf('snap'), online = E.devOnline();
    $$('.hxd-snap', els.snaps).forEach(function (b) {
      var i = +b.getAttribute('data-snap'), on = i === st.snap && src !== 'none'; // nothing known yet: no snapshot is "the" one
      b.classList.toggle('active', on);
      b.setAttribute('data-src', on ? src : 'none');
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('span').textContent = names[i] || '';
      b.title = 'Snapshot ' + (i + 1) + ' · CC 69 = ' + i + (online ? ' · long-press to rename' : '');
    });
  }

  // ---- paint: pins (favorites as tiles) --------------------------------------------------------
  function pinPage(n) { var pages = Math.max(1, Math.ceil(n / PAGE_SIZE)), p = int(g('pinPage', 0), 0, 999) || 0; return clamp(p, 0, pages - 1); }
  var pinSig = '', pinPageShown = '';
  function tileHTML(f) {
    var badges = [E.fmt.bankName(f.bank) + ' ' + E.fmt.addrLabel(f.bank, f.prog)];
    if (f.snap != null) badges.push('snap ' + (f.snap + 1));
    if (f.app) badges.push('key & tempo');
    var col = COLOURS[f.colour] || '';
    return '<button type="button" class="hxd-tile" data-fav="' + esc(f.id) + '"' + (col ? ' style="border-left-color:' + col + '"' : '') + ' title="' + esc(E.fmt.favDetail(f)) + (f.tags ? ' · ' + esc(String(f.tags)) : '') + '"><span class="hxd-tilename">' + esc(f.name) + '</span><span class="hxd-tilesub">' + esc(badges.join(' · ')) + '</span></button>';
  }
  // every pin is a tile (16 per page: the others carry hidden); the grid is rebuilt only when the pins
  // themselves change, and state (.active / .drift / .sending) paints in place, so a tile stays the
  // node you tapped while its recall runs
  function paintPins() {
    if (!els.pingrid) return;
    var s = S(), st = s.st, act = s.dev.active, favs = E.favs(), page = pinPage(favs.length), pages = Math.ceil(favs.length / PAGE_SIZE), byId = {};
    var sig = favs.map(function (f) { return [f.id, f.name, f.bank, f.prog, f.snap, f.colour, f.tags, !!f.app].join('\u0001'); }).join('\u0002');
    if (sig !== pinSig) {
      pinSig = sig;
      els.pingrid.innerHTML = favs.map(tileHTML).join('');
    }
    if (pinPageShown !== page + '/' + pages) {
      pinPageShown = page + '/' + pages;
      $$('.hxd-tile', els.pingrid).forEach(function (t, i) { t.hidden = i < page * PAGE_SIZE || i >= (page + 1) * PAGE_SIZE; });
      if (pages > 1) {
        els.pinpager.innerHTML = '<button type="button" class="btn sm" data-pinpage="-1" aria-label="Previous pins"' + (page === 0 ? ' disabled' : '') + '>' + A.icon('left', 16) + '</button><span class="muted small">' + (page + 1) + ' / ' + pages + '</span><button type="button" class="btn sm" data-pinpage="1" aria-label="More pins"' + (page >= pages - 1 ? ' disabled' : '') + '>' + A.icon('right', 16) + '</button>';
        els.pinpager.hidden = false;
      } else { els.pinpager.innerHTML = ''; els.pinpager.hidden = true; }
    }
    els.pingrid.hidden = !favs.length;
    els.pinempty.hidden = !!favs.length;
    favs.forEach(function (f) { byId[f.id] = f; });
    $$('.hxd-tile', els.pingrid).forEach(function (t) {
      var f = byId[t.getAttribute('data-fav')]; if (!f) return;
      var here = f.bank === st.setlist && f.prog === st.prog;
      var drift = here && ((f.snap != null && f.snap !== st.snap) || (typeof f.cid === 'number' && act && act.cid !== f.cid));
      t.classList.toggle('active', here); t.classList.toggle('drift', !!drift); t.classList.toggle('sending', !!sending[f.id]);
    });
  }

  // ---- paint: strips -------------------------------------------------------------------------------
  function paintHero() {
    if (!els.hero) return;
    var key = heroKey(), opts = ['exp:0', 'exp:1', 'knob:0', 'knob:1', 'knob:2', 'knob:3', 'knob:4', 'knob:5', 'knob:6', 'knob:7'];
    // the hero is the control you reach for most: a 44 px picker, never a send
    els.hero.innerHTML = '<div class="hxd-head"><label class="hxd-herolab" id="hxd-herolab"><span class="ctl-label">Hero</span><select id="hxd-herosel" aria-label="Hero strip">' + opts.map(function (k) { return '<option value="' + k + '"' + (k === key ? ' selected' : '') + '>' + esc(labelOf(k)) + '</option>'; }).join('') + '</select></label><b class="hxd-heroval" id="hxd-heroval" data-val="' + esc(key) + '">0</b></div>' + stripHTML(key, 'hxd-herostrip');
    paintStrip(key);
  }
  function numericParams(b) { return E.defs.paramDefs(b).filter(function (p) { return p.type !== 'b' && typeof b.vals[p.id] !== 'boolean'; }); }
  function pickBlock() {
    var s = S(), blocks = s.dev.blocks || [], open = root ? root.querySelector('.hx-block.open') : null;
    if (open && open.getAttribute('data-b')) blockKey = open.getAttribute('data-b');
    var cur = blocks.filter(function (b) { return b.path + ':' + b.slot === blockKey; })[0];
    if (cur) return cur;
    cur = blocks.filter(function (b) { return b.type !== 8 && b.type !== 9 && numericParams(b).length; })[0] || blocks[0] || null;
    blockKey = cur ? cur.path + ':' + cur.slot : '';
    return cur;
  }
  // the four strips of the picked row (rebuilt on a row change, never on a stream frame)
  function renderFour() {
    if (!els.rowbox) return;
    var id = rowId(), row = ROWS.filter(function (r) { return r.id === id; })[0] || ROWS[0], h = '', keys = [], s;
    paintRows();
    if (id === 'knobs14' || id === 'knobs58') { keys = row.ctl.slice(); h = '<div class="hxd-four">' + keys.map(oneHTML).join('') + '</div>'; }
    else if (id === 'pedals') {
      keys = ['exp:0', 'exp:1'];
      h = '<div class="hxd-four">' + keys.map(oneHTML).join('') + '</div>' +
        '<div class="hxd-xy" id="hxd-xy" role="application" aria-label="XY pad: CC 7 across, CC 8 up" title="' + esc(explainOf('xy')) + '"><div class="hxd-xydot"></div><span class="hxd-xyv"></span></div>' +
        '<div class="hxd-rowchips">' + chipHTML('toe') + '</div>';
    }
    else if (id === 'stomps') {
      var l = stomps();
      if (!l.length) h = '<p class="muted small hxd-rowcap">No stomps yet. Add the CC numbers you assigned on the Helix (Bypass/Control screen, channel ' + S().channels.ctl + ') under Edit › Rig › Stomps.</p>';
      else {
        var ks = l.filter(function (x) { return x.kind === 'knob'; }).slice(0, 4), tg = l.filter(function (x) { return x.kind !== 'knob'; });
        keys = ks.map(function (x) { return 'stomp:' + x.cc; });
        h = (keys.length ? '<div class="hxd-four">' + keys.map(oneHTML).join('') + '</div>' : '') +
          (tg.length ? '<div class="hxd-rowchips">' + tg.map(function (x) { return '<button type="button" class="chip hxd-chip hxd-stomp" data-stomp="' + x.cc + '" title="CC ' + x.cc + ' on channel ' + S().channels.ctl + '"><span class="hxd-chipname">' + esc(x.name) + '</span></button>'; }).join('') + '</div>' : '');
      }
    }
    else if (id === 'block') {
      if (!E.devOnline()) h = '<p class="muted small hxd-rowcap">Start the bridge (node tools/helix-bridge.js) to edit the open block’s parameters here.</p>';
      else {
        s = S();
        var b = pickBlock(), blocks = s.dev.blocks || [];
        if (!b) h = '<p class="muted small hxd-rowcap">Reading the edit buffer…</p>';
        else {
          var ps = numericParams(b).slice(0, 4);
          keys = ps.map(function (p) { return 'param:' + b.path + ':' + b.slot + ':' + p.id; });
          h = '<div class="hxd-blockpick"><label class="field">Block<select id="hxd-blocksel">' + blocks.map(function (x) { var k = x.path + ':' + x.slot; return '<option value="' + k + '"' + (k === blockKey ? ' selected' : '') + '>' + esc(E.defs.catLabel(x) + ' · ' + E.defs.modelLabel(x.mid) + ' (' + (x.path + 1) + '/' + x.slot + ')') + '</option>'; }).join('') + '</select></label></div>' +
            (keys.length ? '<div class="hxd-four">' + keys.map(oneHTML).join('') + '</div>' : '<p class="muted small hxd-rowcap">No numeric parameters on this block' + (s.routes.net.defs ? '' : ' (tools/helix-defs.json not loaded by the bridge)') + '.</p>');
        }
      }
    }
    else if (id === 'mix') {
      var ok = E.fwOk('1.4'), lay = mixLayer(), fw = S().fw.str;
      keys = MIX_STRIPS.map(function (m) { return 'mix:' + lay + ':' + m[0]; });
      h = '<div class="hxd-blockpick"><div class="seg hxd-mixlayer" id="hxd-mixlayer" role="group" aria-label="Output layer">' + LAYERS.map(function (x) { return '<button type="button" data-layer="' + x.id + '" class="' + (x.id === lay ? 'active' : '') + '">' + esc(x.name) + ' (ch ' + x.ch + ')</button>'; }).join('') + '</div></div>' +
        '<div class="hxd-four' + (ok ? '' : ' off') + '"' + (ok ? '' : ' aria-disabled="true"') + '>' + keys.map(oneHTML).join('') + '</div>' +
        (ok ? '' : '<p class="muted small hxd-rowcap hxd-fwrow">The Matrix mixer needs firmware 1.4 on the pedal. This pedal: fw ' + esc(fw || 'unknown') + '.</p>');
    }
    els.rowbox.innerHTML = h + cap(id);
    keys.forEach(paintStrip);
    paintXY();
  }
  function paintStrip(key) {
    var v = valOf(key), src = srcOf(key), pct = Math.round(v / 127 * 1000) / 10, text = textOf(key, v);
    $$('.hxd-strip[data-key="' + key + '"]').forEach(function (s) {
      s.querySelector('.hxd-fill').style.width = pct + '%';
      s.querySelector('.hxd-thumb').style.left = 'calc(' + pct + '% - 4px)';
      s.setAttribute('aria-valuenow', v); s.setAttribute('aria-valuetext', text); s.setAttribute('data-src', src);
    });
    $$('[data-val="' + key + '"]').forEach(function (b) { b.textContent = text; });
  }
  function paintXY() {
    var xy = $('#hxd-xy'); if (!xy) return;
    var x = valOf('xy:0'), y = valOf('xy:1');
    xy.querySelector('.hxd-xydot').style.left = (x / 127 * 100) + '%';
    xy.querySelector('.hxd-xydot').style.bottom = (y / 127 * 100) + '%';
    xy.querySelector('.hxd-xyv').textContent = x + ' × ' + y;
    xy.setAttribute('data-src', srcOf('xy:0'));
  }

  // ---- paint: chips + footswitch mode ------------------------------------------------------------------
  function paintChips() {
    if (!els.chips) return;
    var off = [], fw = S().fw.str;
    $$('.hxd-chip[data-chip]').forEach(function (b) {
      var c = ctl(b.getAttribute('data-chip')); if (!c) return;
      var dis = !!(c.minFw && !E.fwOk(c.minFw));
      b.disabled = dis;
      if (dis && off.indexOf(c.minFw) < 0) off.push(c.minFw);
    });
    if (off.length) { els.fwcap.textContent = 'Greyed chips need firmware ' + off.sort().join(' / ') + ' on the pedal (song transport 1.3, Matrix mixer 1.4). This pedal: fw ' + (fw || 'unknown') + '.'; els.fwcap.hidden = false; }
    else els.fwcap.hidden = true;
    paintMute();
  }
  function paintMute() {
    $$('.hxd-chip[data-chip="muteall"]').forEach(function (b) {
      var two = !E.armed();
      b.querySelector('.hxd-chipname').textContent = two ? 'Arm & mute' : 'Mute all';
      b.classList.toggle('twostep', two);
      b.title = two ? 'Disarmed: one tap arms the output, then sends CC 9 = 24 (Mute all).' : (ctl('muteall') || {}).explain || '';
    });
  }
  function paintFs() {
    if (!els.fsmode) return;
    var m = S().st.fsmode;
    $$('button', els.fsmode).forEach(function (b) { var on = +b.getAttribute('data-fs') === m; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
  }
  function flash(b) { if (!b) return; b.classList.add('sent'); clearTimeout(b._flashT); b._flashT = setTimeout(function () { b.classList.remove('sent'); }, 150); }

  // ---- STRIPS: the synthtab gesture as an hxd- twin -------------------------------------------
  // tap or drag anywhere along; drag off it (>= 1.5 x its height) for quarter-speed
  // fine steps; one send per animation frame; the gate is checked at pointerdown
  // and on every move; a refusal ends the drag and the strip snaps back.
  function stripVal(s, e) { var r = s.getBoundingClientRect(), x = clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1); return Math.round(x * 127); }
  function onStripDown(e) {
    var s = e.target.closest ? e.target.closest('.hxd-strip') : null; if (!s) return;
    if (s.closest('.off')) { e.preventDefault(); return; }
    var key = s.getAttribute('data-key');
    e.preventDefault();
    try { s.focus(); } catch (x) { /* ok */ }
    if (!routeOk(key)) { toast(key.indexOf('param:') === 0 ? 'Bridge not connected' : 'No MIDI output to the Helix'); return; }
    if (!E.gate('write', false)) return; // the engine toasts once and flashes the arm row
    try { s.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ }
    drag = { s: s, key: key, id: e.pointerId, x0: e.clientX, y0: e.clientY, v0: valOf(key), fine: false, moved: false };
    box.classList.add('hxd-dragging');
    turn(key, stripVal(s, e));
  }
  function onStripMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!E.armed()) { lapsed(drag.key); return; } // the window lapsed under the finger
    E.gate('write', true); // renews the window; cannot refuse here (checked above)
    var s = drag.s, r = s.getBoundingClientRect();
    if (Math.abs(e.clientX - drag.x0) > 2 || Math.abs(e.clientY - drag.y0) > 2) drag.moved = true;
    var dy = Math.abs(e.clientY - (r.top + r.height / 2)), fine = dy > r.height * 1.5;
    if (fine && !drag.fine) { drag.fine = true; drag.x0 = e.clientX; drag.v0 = valOf(drag.key); }
    if (!fine && drag.fine) drag.fine = false;
    var v = drag.fine ? clamp(Math.round(drag.v0 + (e.clientX - drag.x0) / Math.max(1, r.width) * 127 * 0.25), 0, 127) : stripVal(s, e);
    turn(drag.key, v);
  }
  function onStripUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var s = drag.s, key = drag.key, moved = drag.moved;
    endDrag(false);
    if (!moved) { var now = performance.now(); if (s._tap && now - s._tap < DBL_MS) { s._tap = 0; turn(key, defOf(key)); } else s._tap = now; }
  }
  // the arm window ran out under a finger: the drag ends, the strip (or pad) snaps back to the last
  // confirmed value, the engine learns it is disarmed (quiet: the pill and message follow) and ONE toast says so
  function lapsed(key) {
    var held = !!(drag || padDrag);
    if (drag) endDrag(true);
    if (padDrag) { padDrag = null; box.classList.remove('hxd-dragging'); paintXY(); }
    if (!held) return;
    E.gate('write', true);
    toast('Output is disarmed: ' + (key ? labelOf(key) + ' snapped back to ' + textOf(key, valOf(key)) : 'the pad snapped back') + '. Nothing more was sent. Arm again to continue.');
  }
  function endDrag(refused) {
    if (!drag) return;
    var key = drag.key, s = drag.s, id = drag.id;
    drag = null;
    if (refused) delete turnQ[key]; // a refusal drops what was queued; a normal end lets the frame flush it
    box.classList.remove('hxd-dragging');
    try { if (s.hasPointerCapture && s.hasPointerCapture(id)) s.releasePointerCapture(id); } catch (x) { /* ok */ }
    if (refused) paintStrip(key); // back to the last confirmed value; the caller lets the engine toast why
  }
  function turn(key, v) { // coalesced: one send per animation frame per strip; the thumb follows the engine's 'value' event
    turnQ[key] = v;
    if (turnT) return;
    turnT = requestAnimationFrame(flushTurns);
  }
  function flushTurns() {
    turnT = 0; var q = turnQ; turnQ = {};
    Object.keys(q).forEach(function (key) {
      var v = q[key];
      if (key === 'xy') { E.op('xy', { x: v[0], y: v[1] }).then(function (r) { if (!r.ok) { padDrag = null; paintXY(); } }); return; }
      if (key.indexOf('param:') !== 0 && valOf(key) === v && srcOf(key) === 'sent') return; // the same value again: nothing new to send
      sendStrip(key, v).then(function (r) { if (!r.ok) { if (drag && drag.key === key) endDrag(false); paintStrip(key); } });
    });
  }
  function onStripKey(e) {
    var s = e.target.closest ? e.target.closest('.hxd-strip') : null; if (!s || s.closest('.off')) return;
    var key = s.getAttribute('data-key'), v = valOf(key), step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v += step; else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v -= step; else if (e.key === 'Home') v = 0; else if (e.key === 'End') v = 127; else return;
    e.preventDefault();
    if (!routeOk(key)) { toast(key.indexOf('param:') === 0 ? 'Bridge not connected' : 'No MIDI output to the Helix'); return; }
    sendStrip(key, clamp(v, 0, 127)); // one key = one send; op() gates (and toasts) when disarmed, so the thumb stays
  }
  function onWheel(e) {
    var s = e.target.closest ? e.target.closest('.hxd-strip') : null;
    if (!s || document.activeElement !== s || s.closest('.off')) return; // a page scroll over a strip never turns it
    e.preventDefault();
    var key = s.getAttribute('data-key');
    if (!routeOk(key)) return;
    turn(key, clamp(valOf(key) + (e.deltaY < 0 ? 2 : -2), 0, 127));
  }
  // the XY pad: CC 7 across, CC 8 up, one pair per frame
  function padAt(xy, e) { var r = xy.getBoundingClientRect(); return [Math.round(clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1) * 127), Math.round(clamp(1 - (e.clientY - r.top) / Math.max(1, r.height), 0, 1) * 127)]; }
  function onPadDown(e) {
    var xy = e.target.closest ? e.target.closest('#hxd-xy') : null; if (!xy) return;
    e.preventDefault();
    if (!E.hasMidiOut()) { toast('No MIDI output to the Helix'); return; }
    if (!E.gate('write', false)) return;
    try { xy.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ }
    padDrag = { xy: xy, id: e.pointerId, last: null };
    box.classList.add('hxd-dragging');
    padMove(e);
  }
  function padMove(e) {
    if (!padDrag || e.pointerId !== padDrag.id) return;
    if (!E.armed()) { lapsed(''); return; }
    E.gate('write', true);
    var p = padAt(padDrag.xy, e);
    if (padDrag.last && padDrag.last[0] === p[0] && padDrag.last[1] === p[1]) return;
    padDrag.last = p; turn('xy', p);
  }
  function onPadUp(e) { if (!padDrag || e.pointerId !== padDrag.id) return; padDrag = null; box.classList.remove('hxd-dragging'); }

  // ---- taps and long-presses (tiles, snapshots) -------------------------------------------------
  function pressTarget(e) { return e.target.closest ? e.target.closest('.hxd-tile, .hxd-snap') : null; }
  function onPressDown(e) {
    var el = pressTarget(e); if (!el) return;
    clearTimeout(press.t); press = { el: el, long: false, t: 0 };
    press.t = setTimeout(function () { if (press.el !== el) return; press.long = true; longPress(el); }, LONG_MS);
  }
  function onPressUp(e) {
    var el = pressTarget(e); clearTimeout(press.t);
    if (el && press.el === el) { if (!press.long) tap(el); tapped = { el: el, t: performance.now() }; }
    press = { el: null, t: 0, long: false };
  }
  function onPressCancel() { clearTimeout(press.t); press = { el: null, t: 0, long: false }; }
  function onPressClick(e) {
    var el = pressTarget(e); if (!el) return;
    if (tapped.el === el && performance.now() - tapped.t < 400) return; // the pointer pair handled it
    tap(el);
  }
  function tap(el) {
    if (el.classList.contains('hxd-snap')) { E.op('snapshot', { i: +el.getAttribute('data-snap') }); return; }
    var id = el.getAttribute('data-fav'); if (!id) return;
    if (sending[id]) { E.cancel(); return; } // a second tap cancels the plan
    sending[id] = true; el.classList.add('sending');
    E.recallFav(id).then(function (r) {
      delete sending[id];
      paintPins();
      if (r.ok) toast('Recalled ' + ((E.favById(id) || {}).name || 'pin'));
      else if (r.reason === 'cancelled') toast('Recall cancelled after ' + r.sent + ' of its messages.');
    });
  }
  function longPress(el) {
    if (el.classList.contains('hxd-snap')) { var i = +el.getAttribute('data-snap'); if (E.devOnline()) openSheet('rename', { i: i, name: (S().dev.snapNames || [])[i] || '' }); else toast('Start the bridge to rename snapshots.'); return; }
    var f = E.favById(el.getAttribute('data-fav')); if (f) openSheet('pin', { fav: f });
  }

  // ---- clicks -------------------------------------------------------------------------------------
  function onClick(e) {
    var t = e.target, b;
    if (pressTarget(e)) { onPressClick(e); return; } // tiles and snapshots: tap unless the pointer pair already did
    if (t.closest('#hxd-explain')) { set('explain', !explainOn()); render(); return; }
    if ((b = t.closest('#hxd-mode [data-mode]'))) { mode(b.getAttribute('data-mode')); return; }
    if ((b = t.closest('.hxd-rbadge'))) { routeTap(b.getAttribute('data-route')); return; }
    if (t.closest('#hxd-sheetclose') || t.id === 'hxd-sheet') { closeSheet(); return; }
    if (t.closest('#hxd-confirmok')) { answerSheet(true); return; }
    if (t.closest('#hxd-confirmcancel')) { answerSheet(false); return; }
    if (t.closest('#hxd-psave')) { savePin(); return; }
    if (t.closest('#hxd-premove')) { if (sheet.data && sheet.data.fav) { E.removeFav(sheet.data.fav.id); } closeSheet(); return; }
    if (t.closest('#hxd-srename')) { renameSnap(); return; }
    if ((b = t.closest('#hxd-paddr [data-addr]'))) { sheet.data.addr = b.getAttribute('data-addr'); paintPinSheet(); return; }
    if ((b = t.closest('.hxd-swatch'))) { sheet.data.colour = b.getAttribute('data-colour'); paintPinSheet(); return; }
    if (t.closest('#hxd-arm')) { var s = S(); E.arm(!s.on, s.on ? 'Output disarmed.' : undefined); return; }
    if (t.closest('#hxd-prev')) { E.op('prevPreset'); return; }
    if (t.closest('#hxd-next')) { E.op('nextPreset'); return; }
    if (t.closest('#hxd-pin') || t.closest('#hxd-pinempty')) { openSheet('pin', { fav: null }); return; }
    if (t.closest('#hxd-save')) { E.op('save'); return; }
    if (t.closest('#hxd-snprev')) { E.op('snapPrev'); return; }
    if (t.closest('#hxd-snnext')) { E.op('snapNext'); return; }
    if ((b = t.closest('[data-pinpage]'))) { var favs = E.favs(); set('pinPage', clamp(pinPage(favs.length) + (+b.getAttribute('data-pinpage')), 0, Math.max(0, Math.ceil(favs.length / PAGE_SIZE) - 1))); paintPins(); return; }
    if ((b = t.closest('#hxd-rows [data-row]'))) { set('row', b.getAttribute('data-row')); renderFour(); return; }
    if ((b = t.closest('#hxd-mixlayer [data-layer]'))) { set('mixLayer', b.getAttribute('data-layer')); renderFour(); return; }
    if ((b = t.closest('.hxd-stomp[data-stomp]'))) { var cc = +b.getAttribute('data-stomp'), cur = 0; stomps().forEach(function (x) { if (x.cc === cc) cur = x.v || 0; }); E.op('stomp', { cc: cc, v: cur ? 0 : 127 }).then(function (r) { if (r.ok) flash(b); }); return; }
    if ((b = t.closest('.hxd-chip[data-chip]'))) { chipTap(b); return; }
    if ((b = t.closest('#hxd-fsmode [data-fs]'))) { E.op('fsmode', { m: +b.getAttribute('data-fs') }); return; }
  }
  function routeTap(id) {
    var s = S();
    if (id === 'midi' && s.routes.midi.status !== 'online') { E.routes.midi.connect(false); routeCap = 'midi'; }
    else if (id === 'net' && s.routes.net.status === 'absent') { E.routes.net.connect(); routeCap = 'net'; }
    else routeCap = routeCap === id ? '' : id; // the Connections details
    paintRoutes();
  }
  // chips are momentary: one message, a 150 ms flash, never an "on" state
  function chipTap(b) {
    var id = b.getAttribute('data-chip'), c = ctl(id); if (!c || b.disabled) return;
    var p;
    if (id === 'muteall' && !E.armed()) { // two steps in one tap: arm, then mute — never a silent refusal
      if (!E.arm(true, 'Armed by Mute all. Each command renews 90 s.')) { toast(S().msg || 'Nothing to arm yet.'); return; }
      p = E.op('muteAll');
    }
    else if (id === 'tuner') p = E.op('tuner');
    else if (id === 'click') p = E.op('click');
    else if (id === 'muteall') p = E.op('muteAll');
    else if (id === 'toe') p = E.op('toe');
    else if (id === 'tap') p = E.op('tap');
    else if (id === 'apptempo') { var bpm = parseInt(A.store.get('met.bpm', 120), 10) || 120; p = E.op('tapTempo', { bpm: bpm }); toast('Tapping at ' + bpm + ' bpm'); }
    else if (c.num >= 52 && c.num <= 62) p = E.op('looper', { cc: c.num, val: c.val });
    else if (c.minFw === '1.3' && typeof c.val === 'number') p = E.op('song', { cc: c.num, val: c.val });
    else if (c.num === 9 && typeof c.val === 'number') p = E.op('button', { n: c.val });
    else return;
    p.then(function (r) { if (r.ok || r.sent) flash(b); });
  }

  // ---- the sheet: pin / rename / confirm ----------------------------------------------------------
  function openSheet(kind, data) {
    if (!els.sheet) return;
    if (sheet.kind) closeSheet();
    sheet = { kind: kind, data: data || {}, resolve: null };
    var d = sheet.data, h = '';
    if (kind === 'confirm') {
      sheet.resolve = d.resolve || null;
      els.sheettitle.hidden = true;
      h = '<h3 id="hxd-ctitle">' + esc(d.title || 'Are you sure?') + '</h3><p id="hxd-cbody">' + esc(d.body || '') + '</p>' +
        '<div class="hxd-sheetacts"><button type="button" class="btn hxd-big" id="hxd-confirmcancel">Cancel</button><button type="button" class="btn hxd-big ' + (d.danger ? 'danger' : 'primary') + '" id="hxd-confirmok">' + esc(d.ok || 'OK') + '</button></div>';
    } else if (kind === 'rename') {
      els.sheettitle.hidden = false; els.sheettitle.textContent = 'Rename snapshot ' + (d.i + 1);
      h = '<label class="field">Name<input type="text" id="hxd-sname" maxlength="16" value="' + esc(d.name || '') + '" placeholder="16 characters at most" autocomplete="off"></label>' +
        '<div class="hxd-sheetacts"><button type="button" class="btn hxd-big primary" id="hxd-srename">Rename</button></div>' +
        '<p class="muted small">/SetSnapshotName over the bridge, after Arm.</p>';
    } else {
      var f = d.fav, st = S().st;
      els.sheettitle.hidden = false; els.sheettitle.textContent = f ? 'Edit pin' : 'Pin this preset';
      d.colour = f && f.colour ? f.colour : 'amber';
      d.addr = f ? 'typed' : 'current';
      d.bank = f ? f.bank : st.setlist; d.prog = f ? f.prog : st.prog;
      var act = S().dev.active;
      h = '<label class="field">Name<input type="text" id="hxd-pname" maxlength="40" value="' + esc(f ? f.name : (act && act.name ? act.name : addrText(st))) + '" autocomplete="off" required></label>' +
        '<div class="hxd-formrow"><label class="field hxd-grow">Tags<input type="text" id="hxd-ptags" maxlength="80" value="' + esc(f && f.tags ? String(f.tags) : '') + '" placeholder="lead, verse"></label>' +
          '<div class="field"><span class="ctl-label">Colour</span><div class="hxd-swatches" role="group" aria-label="Colour">' + COLOUR_IDS.map(function (k) { return '<button type="button" class="hxd-swatch" data-colour="' + k + '" aria-label="' + k + '" style="background:' + (COLOURS[k] || k) + '"></button>'; }).join('') + '</div></div></div>' +
        '<div class="ctl-label">Address</div><div class="seg hxd-paddr" id="hxd-paddr" role="group" aria-label="Which address"><button type="button" data-addr="current">Current</button><button type="button" data-addr="typed">Typed</button>' + (E.devOnline() ? '<button type="button" data-addr="active">★ Active</button>' : '') + '</div>' +
        '<div class="hxd-formrow" id="hxd-ptyped"><label class="field">Setlist (CC 32)<input type="number" id="hxd-pbank" min="0" max="127" value="' + d.bank + '"></label><label class="field">Preset (1–128)<input type="number" id="hxd-pprog" min="1" max="128" value="' + (d.prog + 1) + '"></label></div>' +
        '<p class="muted small" id="hxd-paddrtext"></p>' +
        '<div class="hxd-formrow"><label class="field">Then snapshot<select id="hxd-psnap"><option value="">keep</option>' + [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return '<option value="' + i + '"' + (f && f.snap === i ? ' selected' : '') + '>' + (i + 1) + '</option>'; }).join('') + '</select></label>' +
          '<label class="chip hxd-papp"><input type="checkbox" id="hxd-papp"' + (f && f.app ? ' checked' : '') + '> soundLAB key &amp; tempo</label></div>' +
        '<div class="hxd-sheetacts">' + (f ? '<button type="button" class="btn hxd-big danger" id="hxd-premove">Remove</button>' : '') + '<button type="button" class="btn hxd-big primary" id="hxd-psave">' + (f ? 'Update' : 'Pin') + '</button></div>' +
        '<p class="muted small">A pin is an address on the pedal: setlist, preset and snapshot. Saving never sends.</p>';
    }
    els.sheetbody.innerHTML = h;
    els.sheet.hidden = false;
    els.sheet.setAttribute('data-mode', kind);
    if (kind === 'pin') { paintPinSheet(); var pb = $('#hxd-pbank', els.sheet), pp = $('#hxd-pprog', els.sheet); if (pb) pb.addEventListener('input', paintPinSheet); if (pp) pp.addEventListener('input', paintPinSheet); }
    var first = els.sheet.querySelector(kind === 'confirm' ? '#hxd-confirmcancel' : 'input[type=text]');
    try { if (first) { first.focus(); if (first.select) first.select(); } } catch (x) { /* no focus */ }
  }
  function closeSheet() {
    if (!els.sheet) return;
    var r = sheet.resolve; sheet = { kind: '', data: null, resolve: null };
    els.sheet.hidden = true; els.sheet.removeAttribute('data-mode'); els.sheetbody.innerHTML = '';
    if (r) { try { r(false); } catch (x) { /* ok */ } }
  }
  function answerSheet(yes) {
    var r = sheet.resolve; sheet.resolve = null;
    closeSheet();
    if (r) { try { r(!!yes); } catch (x) { /* ok */ } }
  }
  function sheetOpen() { return !!(els.sheet && !els.sheet.hidden); }
  function paintPinSheet() {
    if (sheet.kind !== 'pin') return;
    var d = sheet.data;
    $$('.hxd-swatch', els.sheet).forEach(function (b) { var on = b.getAttribute('data-colour') === d.colour; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    $$('#hxd-paddr button', els.sheet).forEach(function (b) { var on = b.getAttribute('data-addr') === d.addr; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    var typed = $('#hxd-ptyped', els.sheet); if (typed) typed.hidden = d.addr !== 'typed';
    var txt = $('#hxd-paddrtext', els.sheet), a = pinAddress();
    if (txt) txt.textContent = d.addr === 'active' ? 'The preset loaded on the Helix, read over the bridge when you save.' : a ? 'CC 32 ' + a.bank + ' · PC ' + a.prog + ' = ' + addrText({ setlist: a.bank, prog: a.prog }) + (d.addr === 'current' ? ' (the address the page is on)' : '') : 'Setlist 0–127 and preset 1–128.';
  }
  function pinAddress() {
    var d = sheet.data, st = S().st;
    if (d.addr === 'current') return { bank: st.setlist, prog: st.prog };
    var b = int($('#hxd-pbank', els.sheet) ? $('#hxd-pbank', els.sheet).value : '', 0, 127), p = int($('#hxd-pprog', els.sheet) ? $('#hxd-pprog', els.sheet).value : '', 1, 128);
    return b === null || p === null ? null : { bank: b, prog: p - 1 };
  }
  // saving a pin never sends: an address on this device, with soundLAB's key & tempo when asked
  function savePin() {
    var d = sheet.data, f = d.fav, name = ($('#hxd-pname', els.sheet).value || '').trim().slice(0, 40);
    if (!name) { toast('Name the pin first. Nothing sent.'); $('#hxd-pname', els.sheet).focus(); return; }
    var snapV = $('#hxd-psnap', els.sheet).value, snap = snapV === '' ? null : int(snapV, 0, 7);
    var tags = ($('#hxd-ptags', els.sheet).value || '').trim(), app = $('#hxd-papp', els.sheet).checked;
    function finish(a) {
      if (!a) { toast('No MIDI address for that preset.'); return; }
      var o = { id: f ? f.id : '', name: name, bank: a.bank, prog: a.prog, snap: snap, colour: d.colour };
      if (typeof a.cid === 'number') o.cid = a.cid; else if (f && f.cid != null && f.bank === a.bank && f.prog === a.prog) o.cid = f.cid;
      if (tags) o.tags = tags;
      if (app) o.app = { root: A.store.get('fb.root', 9), scale: A.store.get('fb.scale', 'minorPent'), mode: A.store.get('fb.mode', 0), bpm: parseInt(A.store.get('met.bpm', 120), 10) || 120 };
      if (E.saveFav(o)) closeSheet();
    }
    if (d.addr === 'active') { E.favActive().then(function (fa) { finish(fa ? { bank: fa.bank, prog: fa.prog, cid: fa.cid } : null); }); return; }
    var a = pinAddress();
    if (a && d.addr === 'current') { var act = S().dev.active, aa = act ? E.addrOf({ posi: act.posi, ccid: act.ccid }) : null; if (aa && aa.bank === a.bank && aa.prog === a.prog) a.cid = act.cid; }
    finish(a);
  }
  function renameSnap() {
    var d = sheet.data, nm = ($('#hxd-sname', els.sheet).value || '').slice(0, 16);
    E.op('renameSnapshot', { i: d.i, name: nm }).then(function (r) { if (r.ok) closeSheet(); });
  }
  function onSheetKey(e) {
    if (!sheetOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
    if (e.key === 'Enter' && e.target && e.target.id === 'hxd-pname') { e.preventDefault(); savePin(); return; }
    if (e.key === 'Enter' && e.target && e.target.id === 'hxd-sname') { e.preventDefault(); renameSnap(); return; }
    if (e.key !== 'Tab') return; // the focus stays inside the sheet
    var f = $$('button:not([disabled]), input:not([disabled]), select:not([disabled])', els.sheet).filter(function (x) { return !x.hidden && x.offsetParent !== null; });
    if (!f.length) return;
    var i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  }

  // ---- the engine's events -> paint in place -----------------------------------------------------------
  function subscribe() {
    E.on('state', function (d) {
      var w = d && d.what;
      if (w === 'arm' || w === 'safe') { paintArm(); if (!E.armed()) lapsed(drag ? drag.key : ''); } // a disarm (blur, hidden, a failed send) under a finger ends the drag too
      else if (w === 'routes') { paintRoutes(); paintNow(); paintArm(); paintRows(); if (g('row', '') === 'block') renderFour(); }
      else if (w === 'fw') { paintRoutes(); paintNow(); paintChips(); paintRows(); if (g('row', '') === 'mix') renderFour(); }
      else if (w === 'favs') paintPins();
      else if (w === 'mode') applyMode();
      else if (w === 'address') { paintNow(); paintPins(); }
    });
    E.on('dev', function (d) {
      var w = d && d.what;
      if (w === 'active' || w === 'info' || w === 'status' || w === 'online') { paintNow(); paintRoutes(); paintPins(); paintArm(); paintRows(); if ((w === 'online' || w === 'status') && g('row', '') === 'block') renderFour(); }
      else if (w === 'eb') { paintSnaps(); paintNow(); if (rowId() === 'block') renderFour(); }
      else if (w === 'snapname') { paintSnaps(); paintNow(); }
      else if (w === 'defs' || w === 'block') { if (rowId() === 'block') renderFour(); }
    });
    E.on('value', function (d) {
      var k = d.key, i = k.indexOf(':'), head = i < 0 ? k : k.slice(0, i);
      if (head === 'snap') { paintSnaps(); paintNow(); paintPins(); } // pins drift when the snapshot differs
      else if (head === 'prog' || head === 'setlist') { paintNow(); paintPins(); }
      else if (head === 'fsmode') paintFs();
      else if (head === 'xy') { if (!padDrag || d.src === 'sent') paintXY(); }
      else if (head === 'snapname') paintSnaps();
      else if (head === 'knob' || head === 'exp' || head === 'stomp' || head === 'mix' || head === 'param') { if (drag && drag.key === k && d.src !== 'sent') return; paintStrip(k); } // never fight the finger
    });
    E.on('stream', function () { /* the engine's dev/value events carry every frame the deck shows; nothing is rebuilt here */ });
    E.on('observed', function () { /* the Edit face's table; the deck reads provenance from values() */ });
  }

  // ---- lifecycle ------------------------------------------------------------------------------------------
  function init(topBox, performBox, helix) {
    if (!topBox || !performBox || !helix) return;
    E = helix; top = topBox; box = performBox; root = top.parentNode || document;
    injectCSS();
    E.ui.confirm = function (o) { return new Promise(function (resolve) { openSheet('confirm', { title: o && o.title, body: o && o.body, ok: o && o.ok, danger: !!(o && o.danger), resolve: resolve }); }); };
    render();
    if (!wired) {
      wired = true;
      subscribe();
      // one set of listeners on the boxes (their children are rebuilt per render)
      [top, box].forEach(function (el) {
        el.addEventListener('click', onClick);
        el.addEventListener('keydown', function (e) { onSheetKey(e); if (e.target.closest && e.target.closest('.hxd-rbadge') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); routeTap(e.target.closest('.hxd-rbadge').getAttribute('data-route')); } });
        el.addEventListener('contextmenu', function (e) { if (e.target.closest && e.target.closest('.hxd-tile, .hxd-snap, .hxd-strip, #hxd-xy')) e.preventDefault(); });
      });
      box.addEventListener('pointerdown', function (e) { onStripDown(e); onPadDown(e); onPressDown(e); });
      box.addEventListener('pointermove', function (e) { onStripMove(e); padMove(e); });
      box.addEventListener('pointerup', function (e) { onStripUp(e); onPadUp(e); onPressUp(e); });
      box.addEventListener('pointercancel', function (e) { if (drag && e.pointerId === drag.id) endDrag(false); onPadUp(e); onPressCancel(); });
      box.addEventListener('keydown', onStripKey);
      box.addEventListener('wheel', onWheel, { passive: false });
      box.addEventListener('change', function (e) {
        if (!e.target) return;
        if (e.target.id === 'hxd-blocksel') { blockKey = e.target.value; renderFour(); }
        else if (e.target.id === 'hxd-herosel') { var k = e.target.value; if (/^(knob:[0-7]|exp:[01])$/.test(k)) { set('hero', k); paintHero(); toast(labelOf(k) + ' is the hero strip now. Nothing sent.'); } }
      });
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') stop(); });
      var panel = top.closest ? top.closest('.panel') : null;
      if (panel && typeof MutationObserver !== 'undefined') {
        panelObs = new MutationObserver(function () { if (!panel.classList.contains('active')) stop(); });
        panelObs.observe(panel, { attributes: true, attributeFilter: ['class'] });
      }
    }
  }
  // leaving the page / the app hidden: sheets close (a pending confirm answers no), plans and drags end
  function stop() {
    closeSheet();
    if (E) E.cancel();
    if (drag) endDrag(false);
    padDrag = null; turnQ = {}; if (turnT) { cancelAnimationFrame(turnT); turnT = 0; }
    clearTimeout(press.t); press = { el: null, t: 0, long: false };
    if (box) box.classList.remove('hxd-dragging');
  }
  function onBack() {
    if (sheetOpen()) { closeSheet(); return true; }
    if (mode() === 'edit') { mode('perform'); return true; }
    return false;
  }
  function row(id) {
    if (id === undefined) return rowId();
    if (ROWS.some(function (r) { return r.id === id; })) { set('row', id); renderFour(); }
    return rowId();
  }

  function injectCSS() {
    A.injectCSS('helixdeck', [
      '#hxd-top{display:grid;gap:8px;margin:0 0 10px}.hxd-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}',
      '.hxd-explain{width:44px;height:44px;min-height:44px;min-width:44px;padding:0;font:700 17px/1 var(--font-body)}.hxd-explain.active{background:var(--accent-soft);border-color:var(--accent-line);color:var(--accent-ink)}',
      '.hxd-mode button{min-height:44px;padding:0 16px}',
      '.hxd-routes{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}.hxd-rbadge{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--card2);font-size:13px;font-weight:600;cursor:pointer;user-select:none;color:var(--muted)}',
      '.hxd-rbadge:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.hxd-rdot{width:8px;height:8px;border-radius:50%;background:var(--line)}',
      '.hxd-rbadge[data-status=online]{color:var(--text);border-color:var(--accent-line)}.hxd-rbadge[data-status=online] .hxd-rdot{background:var(--green)}.hxd-rbadge[data-status=available] .hxd-rdot,.hxd-rbadge[data-status=connecting] .hxd-rdot{background:var(--warn)}.hxd-rbadge[data-status=needs-setup] .hxd-rdot{background:transparent;border:1px dashed var(--muted)}',
      '@media (hover:hover){.hxd-rbadge:hover{border-color:var(--accent-line);color:var(--text)}}',
      '.hxd-cap{margin:6px 0 0;padding:8px 10px;border-radius:10px;background:var(--accent-soft);color:var(--accent-ink);font-size:13px;line-height:1.4}.hxd-cap[hidden]{display:none}',
      '#hxd-perform{display:grid;gap:12px}#hxd-perform[hidden]{display:none}#hxd-perform.hxd-dragging{touch-action:none;user-select:none;cursor:grabbing}',
      '.hxd-now{display:grid;gap:8px;padding:16px 18px}.hxd-nowhead{display:flex;align-items:center;gap:10px;min-width:0}.hxd-nowname{font:600 32px/1.1 var(--font-condensed);letter-spacing:.3px;overflow-wrap:anywhere;min-width:0}.hxd-nowsub.bad{color:var(--red)}',
      '.hxd-prov{flex:none;width:12px;height:12px;border-radius:50%;background:var(--line);border:1px solid var(--line)}.hxd-prov[data-src=sent]{background:var(--muted)}.hxd-prov[data-src=echo]{background:var(--warn)}.hxd-prov[data-src=state]{background:var(--green)}',
      '.hxd-nowacts{display:flex;gap:8px;margin-top:4px;flex-wrap:wrap;align-items:center}.hxd-big{flex:1 1 auto;min-height:48px;font-size:15px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 12px}.hxd-big[hidden],#hxd-save[hidden]{display:none}',
      '.hxd-armbtn{flex:1.4 1 auto}.hxd-armbtn.on{border-color:var(--accent-line);background:var(--accent-soft);color:var(--accent-ink)}',
      '.hxd-armst{display:inline-flex;align-items:center;min-height:48px;padding:0 9px;border-radius:9px;border:1px solid var(--line);font-size:10.5px;font-weight:700;letter-spacing:.1em;color:var(--muted);white-space:nowrap}.hxd-armst.on{color:var(--accent-ink);border-color:var(--accent-line);background:var(--accent-soft)}.hxd-armst.unsafe{color:var(--red);border-color:var(--red)}',
      '.hxd-armmsg{min-height:1.2em}',
      '.hxd-snaps{display:grid;grid-template-columns:44px repeat(8,minmax(0,1fr)) 44px;gap:6px}.hxd-snap{display:grid;justify-items:center;align-content:center;gap:2px;min-height:56px;padding:6px 2px;border-radius:10px;border:1px solid var(--line);background:var(--card2);color:var(--text);cursor:pointer;user-select:none;font:inherit}',
      '.hxd-snap b{font:400 22px/1 var(--font-display)}.hxd-snap span{font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;min-height:1.2em}.hxd-snap.active{border-color:var(--accent-line);background:var(--accent-soft);color:var(--accent-ink)}',
      '.hxd-snap.active[data-src=state]{border-color:var(--green);box-shadow:inset 0 -3px 0 var(--green)}.hxd-snap.active[data-src=echo]{box-shadow:inset 0 -3px 0 var(--warn)}.hxd-snap.active[data-src=sent]{box-shadow:inset 0 -3px 0 var(--muted)}',
      '.hxd-snstep{min-height:56px;padding:0;min-width:44px}@media (hover:hover){.hxd-snap:hover{border-color:var(--accent-line)}}',
      '.hxd-pins{display:grid;gap:6px}.hxd-pingrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.hxd-pingrid[hidden]{display:none}',
      '.hxd-tile{min-height:60px;padding:8px 8px 8px 10px;border-radius:12px;border:1px solid var(--line);border-left:4px solid var(--line);background:var(--card2);color:var(--text);text-align:left;display:grid;gap:2px;align-content:start;font:inherit;cursor:pointer;user-select:none;min-width:0;position:relative}',
      '.hxd-tile.active{border-color:var(--accent-line);background:var(--accent-soft)}.hxd-tile.drift{border-style:dashed}.hxd-tile.sending{opacity:.7;animation:hxdpulse .9s infinite}@keyframes hxdpulse{50%{box-shadow:0 0 0 3px var(--accent-soft)}}',
      '.hxd-tilename{font-weight:600;font-size:13px;overflow-wrap:anywhere}.hxd-tilesub{font-size:11px;color:var(--muted);overflow-wrap:anywhere}',
      '.hxd-pinempty{min-height:48px;border-radius:12px;border:1px dashed var(--line);background:transparent;color:var(--muted);font:inherit;font-weight:600;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}.hxd-pinempty[hidden]{display:none}',
      '.hxd-pinpager{display:flex;align-items:center;justify-content:center;gap:10px}.hxd-pinpager[hidden]{display:none}.hxd-pinpager .btn{min-height:40px;min-width:44px}',
      '@media (hover:hover){.hxd-tile:hover{border-color:var(--accent-line)}.hxd-pinempty:hover{border-color:var(--accent-line);color:var(--text)}}',
      '.hxd-strips{display:grid;gap:10px;padding:14px 16px}.hxd-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.hxd-lab{font-size:13px;font-weight:600;color:var(--muted)}',
      '.hxd-val{font:600 15px/1 var(--font-body);font-variant-numeric:tabular-nums}.hxd-heroval{font:600 26px/1 var(--font-condensed);color:var(--accent-ink)}',
      '.hxd-herolab{display:inline-flex;align-items:center;gap:8px}.hxd-herolab select{min-height:44px;font-size:16px;font-weight:600;max-width:60vw}.hxd-hero .hxd-head{align-items:center}',
      '.hxd-strip{position:relative;height:44px;border-radius:10px;border:1px solid var(--line);background:var(--card2);overflow:hidden;touch-action:none;cursor:pointer;user-select:none;-webkit-user-select:none}.hxd-strip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.hxd-herostrip{height:52px}',
      '.hxd-fill{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--accent-soft)}.hxd-thumb{position:absolute;top:4px;bottom:4px;left:0;width:8px;border-radius:4px;background:var(--accent)}',
      '.hxd-strip[data-src=sent] .hxd-thumb{background:var(--muted)}.hxd-strip[data-src=echo] .hxd-thumb{background:var(--warn)}.hxd-strip[data-src=state] .hxd-thumb{background:var(--green)}',
      '.hxd-rows{display:flex;flex-wrap:wrap;gap:4px;max-width:100%}.hxd-rows button{flex:1 0 auto;min-height:40px;white-space:nowrap}.hxd-rows button.needs:not(.active){opacity:.6}',
      '.hxd-rowbox{display:grid;gap:10px}.hxd-four{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px}.hxd-one{display:grid;gap:4px;min-width:0}.hxd-one .hxd-strip{height:44px}.hxd-four.off{opacity:.45;pointer-events:none}',
      '.hxd-rowcap{margin:0}.hxd-rowchips{display:flex;gap:8px;flex-wrap:wrap}.hxd-blockpick{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}.hxd-blockpick select{min-height:44px;font-size:16px;max-width:100%}.hxd-mixlayer{flex-wrap:wrap}.hxd-mixlayer button{min-height:40px}',
      '.hxd-xy{position:relative;height:180px;border-radius:12px;border:1px solid var(--line);background:linear-gradient(var(--line) 1px,transparent 1px) 0 0/25% 25%,linear-gradient(90deg,var(--line) 1px,transparent 1px) 0 0/25% 25%,var(--card2);touch-action:none;cursor:crosshair;overflow:hidden;user-select:none}',
      '.hxd-xydot{position:absolute;width:18px;height:18px;margin:0 0 -9px -9px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}.hxd-xy[data-src=sent] .hxd-xydot{background:var(--muted)}.hxd-xy[data-src=echo] .hxd-xydot{background:var(--warn)}.hxd-xy[data-src=state] .hxd-xydot{background:var(--green)}.hxd-xyv{position:absolute;right:8px;top:6px;font-size:12px;color:var(--muted)}',
      '.hxd-chips{display:flex;gap:8px;flex-wrap:wrap}.hxd-chip{min-height:44px;padding:0 14px;font-size:14px;font-weight:600;position:relative;cursor:pointer;transition:none}.hxd-chip.unsure{opacity:.85}.hxd-chip[disabled]{opacity:.4;cursor:default}',
      '.hxd-q{font-style:normal;font-size:10px;font-weight:700;line-height:14px;width:14px;height:14px;border-radius:50%;text-align:center;border:1px solid var(--line);color:var(--muted)}',
      '.hxd-chip.sent{background:var(--accent-soft);border-color:var(--accent-line);color:var(--accent-ink)}.hxd-chip.twostep{border-style:dashed;border-color:var(--warn);color:var(--warn)}',
      '.hxd-songchips{align-items:center}.hxd-songlab{margin-right:2px}.hxd-fwcap{margin:-4px 0 0}.hxd-fwcap[hidden]{display:none}.hxd-fsrow{display:grid;gap:6px}.hxd-fsmode{display:flex;flex-wrap:wrap;max-width:100%}.hxd-fsmode button{flex:1 0 auto;min-height:44px;white-space:nowrap}',
      '.hxd-sheet{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}.hxd-sheet[hidden]{display:none}#hxd-sheetclose{width:44px;height:44px;min-height:44px;min-width:44px;padding:0;font-size:20px}',
      '.hxd-sheetcard{width:100%;max-width:560px;max-height:92vh;overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:20px 20px 0 0;padding:14px 16px 20px;display:grid;gap:12px}',
      '@media (min-width:700px){.hxd-sheet{align-items:center}.hxd-sheetcard{border-radius:16px}}',
      '.hxd-sheethead{display:flex;align-items:center;justify-content:space-between;gap:8px}.hxd-sheethead h2{margin:0}.hxd-sheethead h2[hidden]{display:none}.hxd-sheetbody{display:grid;gap:12px}.hxd-sheetbody h3{margin:0;font:400 24px/1.1 var(--font-display)}.hxd-sheetbody p{margin:0}',
      '.hxd-formrow{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}.hxd-formrow[hidden]{display:none}.hxd-grow{flex:1}.hxd-sheetbody input[type=text],.hxd-sheetbody input[type=number],.hxd-sheetbody select{min-height:44px;font-size:16px;width:100%;box-sizing:border-box}.hxd-sheetbody input[type=number]{width:7em}',
      '.hxd-swatches{display:flex;gap:6px;align-items:center;min-height:44px}.hxd-swatch{width:32px;height:32px;border-radius:50%;border:3px solid transparent;padding:0;cursor:pointer}.hxd-swatch.active{border-color:var(--text)}.hxd-paddr button{min-height:44px}.hxd-papp{min-height:44px;cursor:pointer}',
      '.hxd-sheetacts{display:flex;gap:8px;flex-wrap:wrap}.hxd-sheetacts .hxd-big{flex:1}',
      '@media (min-width:900px){.hxd-four{grid-template-columns:repeat(4,minmax(0,1fr))}.hxd-pingrid{grid-template-columns:repeat(8,minmax(0,1fr))}}',
      '@media (max-width:699px){.hxd-snaps{grid-template-columns:repeat(4,minmax(0,1fr))}.hxd-snstep{grid-column:span 2;min-height:44px}.hxd-nowname{font-size:28px}}'
    ].join('\n'));
  }

  window.SLHelixDeck = {
    version: VERSION, init: init, stop: stop, onBack: onBack, mode: mode, openSheet: openSheet, closeSheet: closeSheet, row: row,
    hero: function (k) { if (k !== undefined && /^(knob:[0-7]|exp:[01])$/.test(k)) { set('hero', k); paintHero(); } return heroKey(); },
    explain: function (on) { if (on !== undefined) { set('explain', !!on); render(); } return explainOn(); },
    valOf: function (k) { return E ? valOf(k) : null; }, sheet: function () { return sheet.kind; }, dragging: function () { return !!(drag || padDrag); },
    paint: function () { if (E) paintAll(); }, render: function () { if (E) render(); }
  };
})();
