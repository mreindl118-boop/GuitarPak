/* soundLAB 2.0 — CHORD CHART MAKER (page 'chart', Keys group pill "Charts").
 *
 * Matt's paper chord sheets, made in the app: rows of blank keyboards, tap
 * keys to drop dots, give each dot a finger number (1 = thumb … 5 = pinky),
 * name the chord, and build a whole song of chords or a bass line. Piano
 * first; a guitar neck version can reuse the same chart format later.
 *
 * - Dots use App.colors.forPitch, the SAME colors the LUMI keys light up in.
 * - The selected diagram lights on the LUMI through App.midi.guide(now, next)
 *   (the one lighting engine): this chord now, the next one blinking.
 * - Play it in: with "Play it in" on, notes played on a MIDI keyboard (the
 *   LUMI) drop dots into the selected diagram.
 * - Saved in App.store 'cc.charts' (list) + 'cc.active'. Export / Import
 *   .chart.json (keeps fingers + names), Export MIDI (one bar per diagram),
 *   "Practice with LUMI" = the MIDI into the Woodshed, which grades it and
 *   lights it on the LUMI. Print = the chart only, like the paper sheet.
 *
 * Chart format v1:
 *   { v: 1, id, title, lo (lowest MIDI note shown, a C), oct (2 | 3),
 *     cards: [{ id, name, hand: 'R'|'L'|'', kind: 'chord'|'line', text,
 *               notes: [{ m: midi, f: 0-5 }] }] }   (line = notes in order)
 * window.SLChart = test hook.
 */
(function () {
  'use strict';

  var WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
  var W = 24, H = 104, BW = 15, BH = 64;
  var TOOLS = ['dot', '1', '2', '3', '4', '5', 'erase'];
  var EXTRA = { // chord types the shared Theory table does not carry
    add2: { intervals: [0, 2, 4, 7], symbol: 'add2' },
    madd2: { intervals: [0, 2, 3, 7], symbol: 'm(add2)' },
    six: { intervals: [0, 4, 7, 9], symbol: '6' },
    m6: { intervals: [0, 3, 7, 9], symbol: 'm6' },
    five: { intervals: [0, 7], symbol: '5' }
  };

  var root = null, sheetEl = null;
  var tool = 'dot', sel = 0, listen = false, lumiOn = true, visible = false;
  var undo = [], player = null;

  function uid() { return Math.random().toString(36).slice(2, 9); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function mod12(n) { return ((n % 12) + 12) % 12; }
  function isWhite(m) { return WHITE_PCS.indexOf(mod12(m)) !== -1; }
  function flat() { return Theory.FLAT_KEYS && Theory.FLAT_KEYS.has(App.store.get('fb.root', 0)); }

  function blankCard() { return { id: uid(), name: '', hand: 'R', kind: 'chord', text: '', notes: [] }; }
  function blankChart(title) {
    var c = { v: 1, id: uid(), title: title || 'New chart', lo: 48, oct: 2, cards: [] };
    for (var i = 0; i < 8; i++) c.cards.push(blankCard());
    return c;
  }

  // ---------- storage ----------
  function clean(c) { // trust nothing that came from a file
    if (!c || typeof c !== 'object' || !Array.isArray(c.cards)) return null;
    var lo = parseInt(c.lo, 10); if (!(lo >= 12 && lo <= 96)) lo = 48; lo -= mod12(lo);
    var out = { v: 1, id: typeof c.id === 'string' && c.id ? c.id.slice(0, 20) : uid(),
      title: String(c.title || 'Chart').slice(0, 80), lo: lo, oct: c.oct === 3 ? 3 : 2, cards: [] };
    c.cards.slice(0, 200).forEach(function (k) {
      if (!k || typeof k !== 'object') return;
      var notes = [];
      (Array.isArray(k.notes) ? k.notes : []).slice(0, 24).forEach(function (n) {
        var m = parseInt(n && n.m, 10), f = parseInt(n && n.f, 10);
        if (m >= 0 && m <= 127 && !notes.some(function (x) { return x.m === m; })) notes.push({ m: m, f: f >= 1 && f <= 5 ? f : 0 });
      });
      out.cards.push({ id: typeof k.id === 'string' && k.id ? k.id.slice(0, 20) : uid(), name: String(k.name || '').slice(0, 40),
        hand: k.hand === 'L' ? 'L' : k.hand === '' ? '' : 'R', kind: k.kind === 'line' ? 'line' : 'chord',
        text: String(k.text || '').slice(0, 120), notes: notes });
    });
    if (!out.cards.length) out.cards.push(blankCard());
    return out;
  }
  function charts() {
    var a = App.store.get('cc.charts', null);
    a = Array.isArray(a) ? a.map(clean).filter(Boolean) : [];
    if (!a.length) {
      a = [blankChart('My first chart')];
      // not while the 1.x charts still wait for their copy (they did not fit yet): a stored
      // default would count as 2.0's own charts, and the copy would stop trying (js/app.js)
      if (!App.store.waiting('cc.charts')) App.store.set('cc.charts', a);
    }
    return a;
  }
  var all = null, chart = null;
  function load() {
    all = charts();
    var id = App.store.get('cc.active', all[0].id);
    chart = all.filter(function (c) { return c.id === id; })[0] || all[0];
    sel = Math.min(sel, chart.cards.length - 1);
  }
  function save() {
    all = all.map(function (c) { return c.id === chart.id ? chart : c; });
    App.store.set('cc.charts', all);
    App.store.set('cc.active', chart.id);
  }
  function snapshot() { undo.push(JSON.stringify(chart)); if (undo.length > 40) undo.shift(); }
  function change(fn) { snapshot(); fn(); save(); paint(); }

  // ---------- chord names ----------
  function detect(midis) {
    if (!midis.length) return '';
    var sorted = midis.slice().sort(function (a, b) { return a - b; });
    var pcs = []; sorted.forEach(function (m) { if (pcs.indexOf(mod12(m)) === -1) pcs.push(mod12(m)); });
    var pf = flat(), bass = mod12(sorted[0]);
    if (pcs.length === 1) return Theory.pcName(pcs[0], pf);
    var types = [];
    Object.keys(Theory.QUALITIES || {}).forEach(function (q) { types.push({ iv: Theory.QUALITIES[q].intervals, sym: Theory.QUALITIES[q].symbol }); });
    Object.keys(EXTRA).forEach(function (q) { types.push({ iv: EXTRA[q].intervals, sym: EXTRA[q].symbol }); });
    var best = null;
    // try the bass note as the root first, so "C E G" is C, not Em/C-ish
    var order = [bass].concat(pcs.filter(function (p) { return p !== bass; }));
    order.forEach(function (r) {
      if (best) return;
      var set = pcs.map(function (p) { return mod12(p - r); }).sort(function (a, b) { return a - b; }).join(',');
      types.forEach(function (t) {
        if (!best && t.iv.slice().sort(function (a, b) { return a - b; }).join(',') === set) best = { r: r, sym: t.sym };
      });
    });
    if (!best) return '';
    return Theory.pcName(best.r, pf) + best.sym + (best.r !== bass ? '/' + Theory.pcName(bass, pf) : '');
  }

  // fingers in pitch order (right hand thumb up; the left hand mirrors it,
  // pinky up). Steps between fingers follow the gaps the way piano teachers
  // finger close chords: C E G = 1 3 5, F A D (first inversion) = 1 2 5,
  // G C E (second inversion) = 1 3 5,
  // A C E G = 1 2 4 5, G A B D = 1 2 3 5.
  function autoFingers(card) {
    var s = card.notes.slice().sort(function (a, b) { return a.m - b.m; });
    var n = s.length; if (!n) return;
    var gaps = []; for (var i = 1; i < n; i++) gaps.push(s[i].m - s[i - 1].m);
    var steps;
    if (n === 2) { var g = gaps[0]; steps = [g <= 2 ? 1 : g <= 4 ? 2 : g <= 6 ? 3 : 4]; }
    else if (n === 3) {
      steps = gaps.map(function (g) { return g <= 2 ? 1 : g <= 4 ? 2 : 3; });
      while (steps[0] + steps[1] > 4) steps[steps[0] > 1 ? 0 : 1]--; // the lower gap gives way
    } else if (n === 4) {
      steps = [1, 1, 1];
      var wide = gaps.every(function (g) { return g >= 3; }), at = 1;
      if (!wide) { at = 0; gaps.forEach(function (g, j) { if (g >= gaps[at]) at = j; }); }
      steps[at] = 2;
    } else steps = gaps.map(function () { return 1; });
    var f = 1;
    s.forEach(function (x, j) {
      if (j) f = Math.min(5, f + steps[j - 1]);
      x.f = card.hand === 'L' ? 6 - f : f;
    });
  }

  // ---------- drawing ----------
  function whiteIndex(m) { var n = 0; for (var k = chart.lo; k < m; k++) if (isWhite(k)) n++; return n; }
  function diagram(card, ci) {
    var lo = chart.lo, hi = lo + chart.oct * 12; // one extra C at the top
    var whites = '', blacks = '', dots = '', totalW = 0;
    var has = {}; card.notes.forEach(function (n, i) { has[n.m] = { f: n.f, i: i }; });
    for (var m = lo; m <= hi; m++) {
      var wh = isWhite(m), x;
      if (wh) {
        x = whiteIndex(m) * W; totalW = x + W;
        whites += '<rect class="cc-k cc-w" data-m="' + m + '" x="' + x + '" y="0" width="' + W + '" height="' + H + '" rx="3"/>';
      } else {
        x = whiteIndex(m) * W - BW / 2;
        blacks += '<rect class="cc-k cc-b" data-m="' + m + '" x="' + x + '" y="0" width="' + BW + '" height="' + BH + '" rx="2"/>';
      }
      if (has[m]) {
        var cx = wh ? x + W / 2 : x + BW / 2, cy = wh ? H - 21 : BH - 13, r = wh ? 8.5 : 6.5;
        var col = (App.colors && App.colors.forPitch(mod12(m))) || '#e5484d';
        dots += '<circle class="cc-dot" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + col + '"/>';
        if (card.kind === 'line') dots += '<text class="cc-ord" x="' + cx + '" y="' + (cy + 3.5) + '" text-anchor="middle">' + (has[m].i + 1) + '</text>';
        if (has[m].f) dots += '<text class="cc-fing' + (wh ? '' : ' cc-fingb') + '" x="' + cx + '" y="' + (cy - r - 4) + '" text-anchor="middle">' + has[m].f + '</text>';
      }
      if (mod12(m) === 0 && wh) dots += '<text class="cc-oct" x="' + (x + 3) + '" y="' + (H - 3) + '">C' + (Math.floor(m / 12) - 1) + '</text>';
    }
    return '<svg class="cc-svg" viewBox="-1 -1 ' + (totalW + 2) + ' ' + (H + 2) + '" data-ci="' + ci + '" role="img" aria-label="' +
      esc((card.name || 'Chord ' + (ci + 1)) + ': ' + card.notes.map(function (n) { return Theory.midiName(n.m, flat()); }).join(' ')) + '">' +
      whites + blacks + dots + '</svg>';
  }

  function cardHtml(card, ci) {
    var guess = detect(card.notes.map(function (n) { return n.m; }));
    return '<div class="cc-card' + (ci === sel ? ' sel' : '') + '" data-ci="' + ci + '">' +
      '<div class="cc-head">' +
        '<input class="cc-name" data-ci="' + ci + '" value="' + esc(card.name) + '" placeholder="' + esc(guess || 'Chord name') + '" aria-label="Chord name" maxlength="40">' +
        '<span class="cc-hand" title="Which hand">' + (card.hand === 'L' ? 'L hand' : card.hand === 'R' ? 'R hand' : '') + '</span>' +
      '</div>' +
      diagram(card, ci) +
      (card.text ? '<div class="cc-text">' + esc(card.text) + '</div>' : '') +
    '</div>';
  }

  function paint() {
    if (!root) return;
    document.getElementById('cc-title').value = chart.title;
    var pick = document.getElementById('cc-pick');
    pick.innerHTML = all.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === chart.id ? ' selected' : '') + '>' + esc(c.title) + '</option>'; }).join('');
    sheetEl.innerHTML = '<h2 class="cc-ptitle">' + esc(chart.title) + '</h2>' +
      chart.cards.map(cardHtml).join('') +
      '<button type="button" class="cc-add" id="cc-add">' + App.icon('plus', 18) + ' Add a keyboard</button>';
    paintTools();
    lightLumi();
  }

  function paintTools() {
    var card = chart.cards[sel] || chart.cards[0];
    root.querySelectorAll('[data-cctool]').forEach(function (b) {
      var on = b.getAttribute('data-cctool') === tool; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on));
    });
    root.querySelectorAll('[data-cchand]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-cchand') === card.hand); });
    root.querySelectorAll('[data-cckind]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-cckind') === card.kind); });
    root.querySelectorAll('[data-ccoct]').forEach(function (b) { b.classList.toggle('active', +b.getAttribute('data-ccoct') === chart.oct); });
    document.getElementById('cc-lo').value = String(chart.lo);
    document.getElementById('cc-note').value = card.text;
    document.getElementById('cc-selname').textContent = (card.name || detect(card.notes.map(function (n) { return n.m; })) || 'Keyboard ' + (sel + 1));
    var li = document.getElementById('cc-listen'); li.classList.toggle('on', listen); li.setAttribute('aria-pressed', String(listen));
    var lu = document.getElementById('cc-lumi'); lu.classList.toggle('on', lumiOn); lu.setAttribute('aria-pressed', String(lumiOn));
    document.getElementById('cc-undo').disabled = !undo.length;
    document.getElementById('cc-playall').innerHTML = player ? App.icon('stop', 14) + ' Stop' : App.icon('play', 14) + ' Play all';
  }

  // ---------- LUMI + sound ----------
  function notesOf(card) {
    if (!card) return [];
    return card.notes.map(function (n) { return n.m; });
  }
  function lightLumi(now, next) {
    if (!App.midi || typeof App.midi.guide !== 'function') return;
    if (!visible || !lumiOn) { App.midi.guide([], []); return; }
    if (now === undefined) {
      var card = chart.cards[sel];
      now = card && card.kind === 'line' ? notesOf(card).slice(0, 1) : notesOf(card);
      next = card && card.kind === 'line' ? notesOf(card).slice(1, 2) : notesOf(chart.cards[sel + 1]);
    }
    App.midi.guide(now, next || []);
  }
  function hear(card, when) {
    if (!App.keys || !card) return;
    var t = when || 0, ns = notesOf(card);
    if (card.kind === 'line') ns.forEach(function (m, i) { App.keys.play(m, t + i * 0.32, 0.3, 0.7); });
    else ns.forEach(function (m) { App.keys.play(m, t, 1.2, 0.55); });
  }

  // Play all: one bar (4 beats at the shared tempo) per keyboard that has notes
  function playAll() {
    if (player) { stopPlay(); return; }
    var idx = chart.cards.map(function (c, i) { return c.notes.length ? i : -1; }).filter(function (i) { return i >= 0; });
    if (!idx.length) return;
    App.emit('transport:claim', { owner: 'chart' });
    var bpm = App.store.get('met.bpm', 90) || 90, bar = 4 * 60 / bpm;
    var k = 0;
    function step() {
      if (!player) return;
      if (k >= idx.length) { stopPlay(); return; }
      var ci = idx[k], card = chart.cards[ci];
      sel = ci; paint();
      if (card.kind === 'line') {
        var ns = notesOf(card), dt = bar / Math.max(1, ns.length);
        ns.forEach(function (m, i) {
          App.keys && App.keys.play(m, i * dt, dt * 0.9, 0.7);
          player.timers.push(setTimeout(function () { if (player) lightLumi([m], ns[i + 1] != null ? [ns[i + 1]] : notesOf(chart.cards[idx[k]]).slice(0, 1)); }, i * dt * 1000));
        });
      } else {
        hear(card);
        lightLumi(notesOf(card), notesOf(chart.cards[idx[k + 1]]));
      }
      k++;
      player.timers.push(setTimeout(step, bar * 1000));
    }
    player = { timers: [] };
    step();
  }
  function stopPlay() {
    if (!player) return;
    player.timers.forEach(clearTimeout); player = null;
    if (root) { paintTools(); lightLumi(); }
  }
  App.on('transport:claim', function (d) { if (d && d.owner !== 'chart') stopPlay(); });

  // ---------- editing ----------
  function applyTool(ci, m) {
    var card = chart.cards[ci]; if (!card) return;
    change(function () {
      var at = -1; card.notes.forEach(function (n, i) { if (n.m === m) at = i; });
      if (tool === 'erase') { if (at >= 0) card.notes.splice(at, 1); return; }
      if (tool === 'dot') {
        if (at >= 0) card.notes.splice(at, 1);
        else card.notes.push({ m: m, f: 0 });
        return;
      }
      var f = +tool;
      if (at >= 0) card.notes[at].f = card.notes[at].f === f ? 0 : f;
      else card.notes.push({ m: m, f: f });
    });
    if (App.keys && chart.cards[ci].notes.some(function (n) { return n.m === m; })) App.keys.play(m, 0, 0.5, 0.6);
  }

  // ---------- files ----------
  function download(name, data, type) {
    var blob = new Blob([data], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function fileName(ext) { return (chart.title || 'chart').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + ext; }

  // a format-0 MIDI file: one bar per keyboard (4/4 at the shared tempo);
  // chords sound together, lines spread evenly over their bar
  function toMidi() {
    var tpq = 480, bar = tpq * 4, bpm = App.store.get('met.bpm', 90) || 90, ev = [], t = 0;
    chart.cards.forEach(function (card) {
      var ns = notesOf(card);
      if (!ns.length) return;
      if (card.kind === 'line') {
        var d = Math.floor(bar / ns.length);
        ns.forEach(function (m, i) { ev.push([t + i * d, 0x90, m, 90]); ev.push([t + i * d + d - 10, 0x80, m, 0]); });
      } else ns.forEach(function (m) { ev.push([t, 0x90, m, 80]); ev.push([t + bar - 20, 0x80, m, 0]); });
      t += bar;
    });
    ev.sort(function (a, b) { return a[0] - b[0] || (a[1] === 0x80 ? -1 : 1); });
    function vlq(n) { var out = [n & 0x7f]; while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80); return out; }
    var us = Math.round(60000000 / bpm), trk = [0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255, 0, 0xff, 0x58, 4, 4, 2, 24, 8];
    var name = Array.prototype.map.call(unescape(encodeURIComponent(chart.title.slice(0, 60))), function (c) { return c.charCodeAt(0); });
    trk = trk.concat([0, 0xff, 0x03], vlq(name.length), name);
    var last = 0;
    ev.forEach(function (e) { trk = trk.concat(vlq(e[0] - last), [e[1], e[2], e[3]]); last = e[0]; });
    trk = trk.concat([0, 0xff, 0x2f, 0]);
    var head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (tpq >> 8) & 255, tpq & 255];
    var len = trk.length;
    return new Uint8Array(head.concat([0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >> 16) & 255, (len >> 8) & 255, len & 255], trk));
  }

  function say(msg) { var s = document.getElementById('cc-say'); if (s) { s.textContent = msg; } }

  // ---------- page ----------
  function init(rootEl) {
    root = rootEl;
    App.injectCSS('chordchart', css());
    var los = ''; for (var m = 24; m <= 72; m += 12) los += '<option value="' + m + '">from C' + (m / 12 - 1) + '</option>';
    root.innerHTML =
      '<div class="card cc-top">' +
        '<div class="row tight spread">' +
          '<input id="cc-title" class="cc-titlein" maxlength="80" aria-label="Chart name" placeholder="Song name">' +
          '<span class="row tight">' +
            '<select id="cc-pick" aria-label="Your charts"></select>' +
            '<button type="button" class="btn sm" id="cc-new">' + App.icon('plus', 13) + ' New</button>' +
            '<button type="button" class="btn sm" id="cc-dup">Copy</button>' +
            '<button type="button" class="btn sm" id="cc-del">Delete</button>' +
          '</span>' +
        '</div>' +
        '<p class="hint cc-help">1. Tap a keyboard to pick it. 2. Tap keys to put dots on them. 3. Pick a finger (1 = thumb) and tap a dot to number it. 4. Type the chord name, or leave it blank and soundLAB names it for you.</p>' +
      '</div>' +
      '<div class="card cc-tools" id="cc-tools">' +
        '<div class="row tight">' +
          '<span class="ctl-label">Tap puts</span>' +
          '<div class="seg" id="cc-toolseg" role="group" aria-label="What a tap puts on a key">' +
            '<button type="button" data-cctool="dot">Dot</button>' +
            ['1', '2', '3', '4', '5'].map(function (f) { return '<button type="button" data-cctool="' + f + '" title="Finger ' + f + '">' + f + '</button>'; }).join('') +
            '<button type="button" data-cctool="erase">Erase</button>' +
          '</div>' +
          '<button type="button" class="btn sm" id="cc-undo">Undo</button>' +
        '</div>' +
        '<div class="row tight">' +
          '<span class="ctl-label">This keyboard</span><b id="cc-selname" class="cc-selname"></b>' +
          '<div class="seg" role="group" aria-label="Hand"><button type="button" data-cchand="R">R hand</button><button type="button" data-cchand="L">L hand</button><button type="button" data-cchand="">Both</button></div>' +
          '<div class="seg" role="group" aria-label="Chord or line"><button type="button" data-cckind="chord" title="All dots together">Chord</button><button type="button" data-cckind="line" title="Dots one after another, in the order you placed them (a bass line or melody)">Line</button></div>' +
          '<button type="button" class="btn sm" id="cc-fing" title="Number the dots for you">Add fingers</button>' +
          '<button type="button" class="btn sm" id="cc-nameit" title="Fill in the chord name soundLAB found">Name it</button>' +
          '<button type="button" class="btn sm" id="cc-hear">' + App.icon('play', 13) + ' Hear</button>' +
          '<button type="button" class="btn sm" id="cc-clear">Clear</button>' +
          '<button type="button" class="btn sm" id="cc-up" aria-label="Move earlier">' + App.icon('left', 13) + '</button>' +
          '<button type="button" class="btn sm" id="cc-down" aria-label="Move later">' + App.icon('right', 13) + '</button>' +
          '<button type="button" class="btn sm" id="cc-rm">Remove</button>' +
        '</div>' +
        '<div class="row tight">' +
          '<input id="cc-note" class="cc-notein" maxlength="120" placeholder="A note under this keyboard (like: Progression Bb A D G)" aria-label="Note under this keyboard">' +
        '</div>' +
        '<div class="row tight">' +
          '<button type="button" class="chip" id="cc-listen" title="Notes you play on your MIDI keyboard (LUMI) drop dots into the picked keyboard">Play it in</button>' +
          '<button type="button" class="chip" id="cc-lumi" title="Light the picked chord on the LUMI (the next one blinks)">Light the LUMI</button>' +
          '<button type="button" class="btn sm primary" id="cc-playall"></button>' +
          '<span class="ctl-label">Keys</span>' +
          '<select id="cc-lo" aria-label="Lowest key">' + los + '</select>' +
          '<div class="seg" role="group" aria-label="Octaves"><button type="button" data-ccoct="2">2 octaves</button><button type="button" data-ccoct="3">3 octaves</button></div>' +
        '</div>' +
        '<div class="row tight">' +
          '<button type="button" class="btn sm" id="cc-practice" title="Open this chart in the Woodshed: it lights each chord on the LUMI and scores you">Practice with LUMI</button>' +
          '<button type="button" class="btn sm" id="cc-print">Print</button>' +
          '<button type="button" class="btn sm" id="cc-export">Save file</button>' +
          '<button type="button" class="btn sm" id="cc-midi">Save MIDI</button>' +
          '<label class="btn sm" id="cc-importl">Open file<input type="file" id="cc-import" accept=".json,application/json" hidden></label>' +
          '<span class="hint" id="cc-say" role="status"></span>' +
        '</div>' +
      '</div>' +
      '<div class="cc-sheet" id="cc-sheet"></div>';
    sheetEl = document.getElementById('cc-sheet');
    load();
    wire();
    paint();
  }

  function wire() {
    var $ = function (id) { return document.getElementById(id); };
    $('cc-title').addEventListener('change', function () { var v = this.value.trim() || 'Chart'; change(function () { chart.title = v; }); });
    $('cc-pick').addEventListener('change', function () { stopPlay(); App.store.set('cc.active', this.value); undo = []; sel = 0; load(); paint(); });
    $('cc-new').addEventListener('click', function () { stopPlay(); chart = blankChart('New chart'); all.push(chart); undo = []; sel = 0; save(); paint(); $('cc-title').focus(); $('cc-title').select(); });
    $('cc-dup').addEventListener('click', function () { var c = clean(JSON.parse(JSON.stringify(chart))); c.id = uid(); c.title = chart.title + ' (copy)'; chart = c; all.push(c); undo = []; save(); paint(); });
    var delArm = 0;
    $('cc-del').addEventListener('click', function () {
      if (Date.now() - delArm > 4000) { delArm = Date.now(); this.textContent = 'Tap again to delete'; var b = this; setTimeout(function () { b.textContent = 'Delete'; }, 4000); return; }
      delArm = 0; this.textContent = 'Delete';
      all = all.filter(function (c) { return c.id !== chart.id; });
      App.store.set('cc.charts', all); App.store.set('cc.active', all[0] ? all[0].id : null); undo = []; sel = 0; load(); paint();
    });
    $('cc-tools').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var card = chart.cards[sel];
      if (b.hasAttribute('data-cctool')) { tool = b.getAttribute('data-cctool'); paintTools(); return; }
      if (b.hasAttribute('data-cchand')) { var h = b.getAttribute('data-cchand'); change(function () { card.hand = h; }); return; }
      if (b.hasAttribute('data-cckind')) { var k = b.getAttribute('data-cckind'); change(function () { card.kind = k; }); return; }
      if (b.hasAttribute('data-ccoct')) { var o = +b.getAttribute('data-ccoct'); change(function () { chart.oct = o; }); return; }
      switch (b.id) {
        case 'cc-undo': if (undo.length) { chart = clean(JSON.parse(undo.pop())); save(); sel = Math.min(sel, chart.cards.length - 1); paint(); } break;
        case 'cc-fing': change(function () { autoFingers(card); }); break;
        case 'cc-nameit': var g = detect(notesOf(card)); if (g) change(function () { card.name = g; }); else say('No chord name found for these dots. Type one in.'); break;
        case 'cc-hear': hear(card); lightLumi(); break;
        case 'cc-clear': change(function () { card.notes = []; card.name = ''; }); break;
        case 'cc-up': if (sel > 0) change(function () { chart.cards.splice(sel - 1, 0, chart.cards.splice(sel, 1)[0]); sel--; }); break;
        case 'cc-down': if (sel < chart.cards.length - 1) change(function () { chart.cards.splice(sel + 1, 0, chart.cards.splice(sel, 1)[0]); sel++; }); break;
        case 'cc-rm': change(function () { chart.cards.splice(sel, 1); if (!chart.cards.length) chart.cards.push(blankCard()); sel = Math.min(sel, chart.cards.length - 1); }); break;
        case 'cc-listen': listen = !listen; paintTools(); say(listen ? 'Play notes on your keyboard: each one drops a dot (play it again to take it off).' : ''); break;
        case 'cc-lumi': lumiOn = !lumiOn; App.store.set('cc.lumi', lumiOn); paintTools(); lightLumi(); break;
        case 'cc-playall': playAll(); break;
        case 'cc-print': window.print(); break;
        case 'cc-export': download(fileName('.chart.json'), JSON.stringify(chart, null, 1), 'application/json'); break;
        case 'cc-midi': download(fileName('.mid'), toMidi(), 'audio/midi'); break;
        case 'cc-practice': practice(); break;
      }
    });
    $('cc-note').addEventListener('change', function () { var v = this.value; change(function () { chart.cards[sel].text = v.trim(); }); });
    $('cc-lo').addEventListener('change', function () { var v = +this.value; change(function () { chart.lo = v; }); });
    $('cc-import').addEventListener('change', function () {
      var f = this.files && this.files[0]; this.value = '';
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var c = null; try { c = clean(JSON.parse(rd.result)); } catch (e) { c = null; }
        if (!c) { say('That file is not a soundLAB chart.'); return; }
        if (all.some(function (x) { return x.id === c.id; })) c.id = uid();
        all.push(c); chart = c; undo = []; sel = 0; save(); paint(); say('Opened ' + c.title + '.');
      };
      rd.readAsText(f);
    });
    sheetEl.addEventListener('click', function (e) {
      if (e.target.closest('#cc-add')) { change(function () { chart.cards.push(blankCard()); sel = chart.cards.length - 1; }); return; }
      var cardEl = e.target.closest('.cc-card'); if (!cardEl) return;
      var ci = +cardEl.getAttribute('data-ci');
      var key = e.target.closest('.cc-k');
      if (e.target.closest('.cc-name')) { if (ci !== sel) { sel = ci; markSel(); } return; }
      if (key && ci === sel) { applyTool(ci, +key.getAttribute('data-m')); return; }
      if (ci !== sel) { sel = ci; markSel(); if (key) applyTool(ci, +key.getAttribute('data-m')); }
    });
    sheetEl.addEventListener('change', function (e) {
      var inp = e.target.closest('.cc-name'); if (!inp) return;
      var ci = +inp.getAttribute('data-ci'), v = inp.value.trim();
      change(function () { chart.cards[ci].name = v; });
    });
  }
  function markSel() {
    sheetEl.querySelectorAll('.cc-card').forEach(function (c) { c.classList.toggle('sel', +c.getAttribute('data-ci') === sel); });
    paintTools(); lightLumi();
  }

  function practice() {
    var ws = window.Woodshed;
    if (!chart.cards.some(function (c) { return c.notes.length; })) { say('Put some dots on first.'); return; }
    if (!ws || typeof ws.importMidi !== 'function' || typeof ws.addScore !== 'function') { say('The Woodshed is not in this build. Use Save MIDI instead.'); return; }
    var bytes = toMidi(), sc = ws.importMidi(bytes.buffer, chart.title);
    if (!sc) { say('The Woodshed could not read this chart.'); return; }
    ws.addScore(sc); App.switchTo('shed');
  }

  // a MIDI keyboard drops dots into the picked keyboard
  App.on('midi:note', function (d) {
    if (!visible || !listen || !d || !d.on) return;
    var card = chart.cards[sel]; if (!card) return;
    change(function () {
      var at = -1; card.notes.forEach(function (n, i) { if (n.m === d.midi) at = i; });
      if (at >= 0) card.notes.splice(at, 1); else card.notes.push({ m: d.midi, f: /^[1-5]$/.test(tool) ? +tool : 0 });
      // keep the dot on screen: move the window if the note is outside it
      if (d.midi < chart.lo || d.midi > chart.lo + chart.oct * 12) chart.lo = Math.max(12, d.midi - mod12(d.midi) - (chart.oct === 3 ? 12 : 0));
    });
  });

  function css() {
    return '.cc-top .cc-titlein{font:400 26px/1.1 var(--font-display);letter-spacing:.02em;background:transparent;border:0;border-bottom:1px solid var(--line);color:var(--text);min-width:0;flex:1 1 220px;padding:4px 2px}' +
      '.cc-help{margin:10px 0 0}' +
      '.cc-tools{display:flex;flex-direction:column;gap:10px}' +
      '.cc-tools .row{flex-wrap:wrap}' +
      '.cc-tools .seg button{min-width:34px}' +
      '.cc-selname{color:var(--accent-ink,var(--accent));min-width:60px}' +
      '.cc-notein{flex:1 1 260px;min-width:0}' +
      '.chip.on{background:var(--accent-soft);border-color:var(--accent-line);color:var(--accent-ink,var(--accent))}' +
      '.cc-sheet{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;margin-top:14px}' +
      '.cc-ptitle{display:none}' +
      '.cc-card{background:var(--card);border:2px solid var(--line);border-radius:14px;padding:10px 12px 12px;cursor:pointer}' +
      '.cc-card.sel{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}' +
      '.cc-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}' +
      '.cc-name{flex:1;min-width:0;font:600 18px var(--font-condensed,var(--font-body));background:transparent;border:0;border-bottom:1px dashed var(--line);color:var(--text);padding:2px}' +
      '.cc-name::placeholder{color:var(--muted);opacity:.8}' +
      '.cc-hand{font-size:12px;color:var(--muted);font-weight:600;white-space:nowrap}' +
      '.cc-text{margin-top:6px;font-size:13px;color:var(--muted)}' +
      '.cc-svg{width:100%;height:auto;display:block;touch-action:manipulation}' +
      '.cc-w{fill:#f7f3ea;stroke:#6d655a;stroke-width:1}' +
      '.cc-b{fill:#221d20;stroke:#000;stroke-width:1}' +
      '.cc-card.sel .cc-k:hover{filter:brightness(.92)}' +
      '.cc-dot{stroke:rgba(0,0,0,.5);stroke-width:1;pointer-events:none}' +
      '.cc-fing{font:700 12px var(--font-body);fill:#1d4ed8;pointer-events:none}' +
      '.cc-fingb{fill:#9cc2ff}' +
      '.cc-ord{font:700 9px var(--font-body);fill:#1c1206;pointer-events:none}' +
      '.cc-oct{font:600 7.5px var(--font-body);fill:#8a8073;pointer-events:none}' +
      '.cc-add{display:flex;align-items:center;justify-content:center;gap:8px;min-height:130px;border:2px dashed var(--line);border-radius:14px;background:transparent;color:var(--muted);font:600 15px var(--font-body);cursor:pointer}' +
      '.cc-add:hover{color:var(--text);border-color:var(--accent-line)}' +
      '@media print{body *{visibility:hidden!important}#cc-sheet,#cc-sheet *{visibility:visible!important}' +
        '#cc-sheet{position:absolute;left:0;top:0;width:100%;grid-template-columns:1fr 1fr;gap:8px;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
        '.cc-ptitle{display:block!important;grid-column:1/-1;color:#000;font:400 28px var(--font-display);margin:0}' +
        '.cc-card{background:#fff;border:0;box-shadow:none;padding:4px;break-inside:avoid}.cc-name{color:#c0262d;border:0}.cc-name:placeholder-shown{color:transparent}' +
        '.cc-hand,.cc-text{color:#333}.cc-add{display:none!important}}';
  }

  App.register('chart', {
    init: init,
    onShow: function () {
      visible = true;
      lumiOn = App.store.get('cc.lumi', true) !== false;
      load(); paint();
    },
    onHide: function () { stopPlay(); visible = false; listen = false; lightLumi(); },
    onBack: function () { return false; }
  });

  window.SLChart = {
    detect: detect, clean: clean, toMidi: toMidi, autoFingers: autoFingers,
    chart: function () { return chart; }, sel: function () { return sel; },
    select: function (i) { sel = i; markSel(); }, tool: function (t) { tool = t; paintTools(); },
    tap: function (ci, m) { applyTool(ci, m); }
  };
})();
