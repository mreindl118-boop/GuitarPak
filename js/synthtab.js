/* soundLAB SYNTH TAB (1.3) — the Synth Deck as its own top-level group:
 *   deck     PERFORM face (this file) over the Synth Deck's data, plus EDIT =
 *            the MIDI Hub's Control view (knob card + the deck's Knobs /
 *            Buttons / Sounds / Scope / Map), borrowed while this page is open
 *            and handed back on leave — one DOM, like the Keys page's 'synth'
 *            pill borrows the piano
 *   liveset  Live sets: pages of 16 presets (step 5)
 *   midihub  the MIDI Hub as it is (pill "Hub")
 * Plan: docs/SYNTH-TAB-PLAN.md. Decisions (Matt, 2026-10-25): STRIPS not
 * knobs (a 44 px slider you tap or drag anywhere along; drag off it for fine
 * steps); the four strips under the Super Knob follow a ROW PICKER that
 * mirrors the MODX's knob-function button (Favourites · Tone · Effects ·
 * Assign 1-4 · Assign 5-8 · Expression); "Assign knob n" = the Assignable
 * Knobs (CC 17-24), named by what they control when the Performance says so;
 * "Assign 1 / 2" = the two Assignable SWITCHES (chips); EXPLAIN mode = every
 * control captioned with the MODX panel control it mirrors and what it sends.
 * Everything the face sends goes through the deck / Hub funnels
 * (App.synthDeck.perform.*, HUB_API.turn), so Rules-on-app-controls, the
 * LUMI guard and the ledger apply; nothing is sent on show.
 */
(function () {
  'use strict';

  var deckRoot = null, liveRoot = null, face = null, els = {};
  var borrowed = null, home = null, homeNext = null; // the Hub's Control view + where it came from
  var tick = 0, drag = null;

  function hub() { return document.getElementById('panel-midihub'); }
  function controlView() { var h = hub(); return h ? h.querySelector('.mh-view[data-view="control"]') : null; }
  function midi() { return App.midi; }
  function deck() { return App.synthDeck && App.synthDeck.perform ? App.synthDeck : null; }
  function P() { var d = deck(); return d && d.perform.ready() ? d.perform : null; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function q(sel, r) { return (r || face).querySelector(sel); }
  function qa(sel, r) { return Array.prototype.slice.call((r || face).querySelectorAll(sel)); }
  function g(k, d) { return App.store.get('synthtab.' + k, d); }
  function set(k, v) { App.store.set('synthtab.' + k, v); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  var NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function noteName(n) { return NOTE[n % 12] + (Math.floor(n / 12) - 1); }

  // the Hub mutes the app's own voice while it is open (a synth plays itself)
  // unless the user asked to hear the app too — same rule here
  function applyMute(on) {
    if (!midi() || !midi().mute) return;
    midi().mute('synthtab', on && App.store.get('midihub.hear', false) !== true);
  }

  // ---- the Hub's Control view, borrowed for Edit ----
  function borrow() {
    var v = controlView();
    if (!v || borrowed) return;
    home = v.parentNode; homeNext = v.nextSibling;
    els.edit.appendChild(v);
    borrowed = v;
    v.hidden = mode() !== 'edit';
  }
  function giveBack() {
    if (!borrowed) return;
    var v = borrowed; borrowed = null;
    if (home) home.insertBefore(v, homeNext && homeNext.parentNode === home ? homeNext : null);
    v.hidden = App.store.get('midihub.view', 'control') !== 'control';
    home = homeNext = null;
  }

  // ---- the strip rows (the MODX knob-function button, on glass) ----
  var ROWS = [
    { id: 'fav', name: 'Favourites' },
    { id: 'tone', name: 'Tone', cc: [74, 71, 73, 72] },
    { id: 'fx', name: 'Effects', cc: [91, 93, 7, 10] },
    { id: 'as1', name: 'Assign 1-4', cc: [17, 18, 19, 20] },
    { id: 'as2', name: 'Assign 5-8', cc: [21, 22, 23, 24] },
    { id: 'expr', name: 'Expression', cc: [1, 2, 11, 5] }
  ];
  var CC_NAMES = { 1: 'Mod wheel', 2: 'Breath', 5: 'Portamento time', 7: 'Volume', 10: 'Pan', 11: 'Expression', 71: 'Resonance', 72: 'Release', 73: 'Attack', 74: 'Cutoff', 75: 'Decay', 91: 'Reverb', 93: 'Chorus', 95: 'Super Knob' };
  function favs() { var f = g('fav', null); return Array.isArray(f) && f.length === 4 ? f : [74, 91, 73, 17]; }
  function rowCCs(id) { var r = ROWS.filter(function (x) { return x.id === id; })[0]; return !r || r.id === 'fav' ? favs() : r.cc; }
  function mode() { return g('mode', 'perform') === 'edit' ? 'edit' : 'perform'; }
  function explainOn() { return g('explain', false) === true; }

  // what a strip is called: the Performance's own Assign knob name when the
  // synth gave one (Read name from synth, block 30 50 00), else the CC's name
  function ccLabel(cc) {
    var p = P();
    if (cc >= 17 && cc <= 24) {
      var n = p && p.assignNames ? p.assignNames() : null, s = n && n[cc - 17];
      return 'Assign knob ' + (cc - 16) + (s ? ' · ' + s : '');
    }
    var hubName = p && p.ccName ? p.ccName(cc) : null;
    return CC_NAMES[cc] || hubName || ('CC ' + cc);
  }

  // ---- EXPLAIN: one line per control, the MODX panel control it mirrors ----
  var EXPLAIN = {
    super: 'The big blue SUPER KNOB. One move turns every knob linked to it in this Performance (CC 95). Try: hold a chord and sweep it.',
    rows: 'The row picker = the knob-function button beside the four knobs (TONE, EG/FX, ARP/MS, ASSIGN). Assign knobs 1-8 are the ones a Performance’s designer wired to its sweet spots (CC 17-24); Favourites is your own row.',
    arpMaster: 'Arp = ARP ON/OFF: the Performance’s arpeggio patterns play from the chord you hold (SysEx 30 47 03, read back from the synth).',
    msMaster: 'Motion seq = MOTION SEQ ON/OFF: automated knob movement stored in the Performance (SysEx 30 48 00).',
    asw1: 'Assign 1 = the ASSIGN 1 switch by the Super Knob (CC 86); what it does is set per Performance.',
    asw2: 'Assign 2 = the ASSIGN 2 switch by the Super Knob (CC 87).',
    sus: 'Sustain = the hold pedal (CC 64).',
    split: 'Split = a key range that plays a different Part (soundLAB routes the keyboard; set up in the preset builder, step 4).',
    scenes: 'Scenes = the eight SCENE buttons: each stores a snapshot of knobs, arp and motion settings inside this Performance; the synth switches on CC 92 (Scene 3 = value 32).',
    now: 'The sound the synth is on. Prev / Next step the program (Bank Select + Program Change); Save preset keeps the sound, the knobs, the buttons, the Scene and the split as one preset.',
    strips: 'Tap or drag anywhere along a strip; drag up or down away from it for fine steps. Values go to the selected Part on its channel.'
  };
  function cap(key) { return explainOn() ? '<p class="st-cap">' + esc(EXPLAIN[key] || '') + '</p>' : ''; }

  // ---- render ----
  function render() {
    if (!face) return;
    var p = P();
    var rowId = g('row', 'fav'), ccs = rowCCs(rowId);
    face.innerHTML =
      '<div class="st-top">' +
        '<button type="button" class="btn sm icon-btn st-explain' + (explainOn() ? ' active' : '') + '" id="st-explain" aria-pressed="' + explainOn() + '" aria-label="Explain the controls" title="Explain: what each control does on the synth">?</button>' +
        '<div class="seg st-mode" role="group" aria-label="Perform or edit">' +
          '<button type="button" data-mode="perform" class="' + (mode() === 'perform' ? 'active' : '') + '" aria-pressed="' + (mode() === 'perform') + '">Perform</button>' +
          '<button type="button" data-mode="edit" class="' + (mode() === 'edit' ? 'active' : '') + '" aria-pressed="' + (mode() === 'edit') + '">Edit</button>' +
        '</div>' +
      '</div>' +
      '<div class="card st-conn" id="st-conn" role="status" aria-live="polite" hidden></div>' +
      '<div class="st-perform" id="st-perform"' + (mode() === 'perform' ? '' : ' hidden') + '>' +
        '<div class="card st-now" id="st-now">' +
          '<div class="st-nowname" id="st-nowname"></div><div class="muted small" id="st-nowsub"></div>' +
          '<div class="st-nowacts">' +
            '<button type="button" class="btn st-big" id="st-prev" aria-label="Previous program">‹ Prev</button>' +
            '<button type="button" class="btn st-big" id="st-next" aria-label="Next program">Next ›</button>' +
            '<button type="button" class="btn st-big primary" id="st-save">Save preset</button>' +
          '</div>' + cap('now') +
          '<div class="st-pins" id="st-pins" role="group" aria-label="Your sounds"></div>' +
        '</div>' +
        '<div class="card st-strips">' +
          '<div class="st-striphead"><span class="st-lab">' + esc(ccLabel(95)) + '</span><b class="st-val" id="st-superval"></b></div>' +
          '<div class="st-strip st-hero" data-cc="95" role="slider" tabindex="0" aria-label="Super Knob" aria-valuemin="0" aria-valuemax="127"><i class="st-fill"></i><i class="st-thumb"></i></div>' + cap('super') +
          '<div class="seg st-rows" role="group" aria-label="Which four strips">' + ROWS.map(function (r) { return '<button type="button" data-row="' + r.id + '" class="' + (r.id === rowId ? 'active' : '') + '" aria-pressed="' + (r.id === rowId) + '">' + esc(r.name) + '</button>'; }).join('') + '</div>' +
          cap('rows') +
          '<div class="st-four">' + ccs.map(function (cc) {
            return '<div class="st-one"><div class="st-striphead"><span class="st-lab">' + esc(ccLabel(cc)) + '</span><b class="st-val" data-val="' + cc + '"></b></div>' +
              '<div class="st-strip" data-cc="' + cc + '" role="slider" tabindex="0" aria-label="' + esc(ccLabel(cc)) + '" aria-valuemin="0" aria-valuemax="127"><i class="st-fill"></i><i class="st-thumb"></i></div></div>';
          }).join('') + '</div>' +
          (rowId === 'fav' ? '<button type="button" class="btn sm st-pickfav" id="st-pickfav">Choose these four</button>' : '') + cap('strips') +
        '</div>' +
        '<div class="st-chips" id="st-chips"></div>' + (explainOn() ? '<p class="st-cap">' + esc(EXPLAIN.arpMaster) + ' ' + esc(EXPLAIN.msMaster) + ' ' + esc(EXPLAIN.asw1) + '</p>' : '') +
        '<div class="st-scenes" id="st-scenes" role="group" aria-label="Scenes"></div><div class="muted small st-scenelab">Scenes 1–8</div>' + cap('scenes') +
      '</div>' +
      '<div class="st-edit" id="st-edit"' + (mode() === 'edit' ? '' : ' hidden') + '></div>' +
      '<div class="st-sheet" id="st-sheet" hidden><div class="st-sheetcard" role="dialog" aria-modal="true" aria-labelledby="st-sheet-t">' +
        '<div class="st-sheethead"><h2 id="st-sheet-t">Save preset</h2><button type="button" class="btn sm icon-btn" id="st-sheetclose" aria-label="Close">×</button></div>' +
        '<form id="st-form" autocomplete="off">' +
          '<input type="hidden" id="st-pid" value="">' +
          '<label class="field">Name<input type="text" id="st-pname" maxlength="48" required placeholder="Warm EP"></label>' +
          '<div class="st-formrow"><label class="field st-grow">Tags<input type="text" id="st-ptags" maxlength="80" placeholder="ep, soft"></label>' +
            '<div class="field">Colour<div class="st-colours" id="st-colours" role="group" aria-label="Colour"></div></div></div>' +
          '<div class="ctl-label">This preset remembers</div>' +
          '<div class="st-incs" id="st-incs"></div>' +
          '<div class="st-splitbox" id="st-splitbox"><div class="st-splithead"><b>Key split</b><span class="muted small" id="st-splittext"></span></div>' +
            '<div class="st-splitrow"><div class="seg" role="group" aria-label="Split"><button type="button" data-split="off">Off</button><button type="button" data-split="two">Two zones</button></div>' +
            '<label class="field">keys below<select id="st-splitat"></select></label><label class="field">play Part<select id="st-splitpart"></select></label>' +
            '<button type="button" class="btn sm" id="st-splitlearn">Play the split key</button></div></div>' +
          '<div class="st-formacts"><button type="button" class="btn st-big" id="st-capture">Capture now</button><button type="submit" class="btn st-big primary" id="st-psave">Save</button></div>' +
          '<p class="muted small" id="st-pnote"></p>' +
        '</form>' +
      '</div></div>';
    ['conn', 'perform', 'edit', 'nowname', 'nowsub', 'prev', 'next', 'save', 'pins', 'superval', 'chips', 'scenes', 'sheet', 'sheetclose', 'form', 'pid', 'pname', 'ptags', 'colours', 'incs', 'capture', 'psave', 'pnote', 'splitbox', 'splittext', 'splitat', 'splitpart', 'splitlearn'].forEach(function (id) { els[id] = q('#st-' + id); });
    var h = ''; for (var n = 36; n <= 84; n++) h += '<option value="' + n + '"' + (n === 60 ? ' selected' : '') + '>' + noteName(n) + '</option>'; els.splitat.innerHTML = h;
    h = ''; for (var k = 1; k <= 16; k++) h += '<option value="' + k + '"' + (k === 2 ? ' selected' : '') + '>' + k + '</option>'; els.splitpart.innerHTML = h;
    els.form.addEventListener('submit', function (e) { e.preventDefault(); submitSheet(); });
    if (borrowed) { els.edit.appendChild(borrowed); borrowed.hidden = mode() !== 'edit'; }
    paint();
  }

  function paint() {
    if (face && els.conn) paintConn(els.conn);
    var p = P(); if (!face || !p) return;
    var now = p.now();
    els.nowname.textContent = now.name;
    els.nowsub.textContent = now.sub + (now.out && now.sub.indexOf(now.out) === -1 ? ' → ' + now.out : '');
    els.nowsub.classList.toggle('bad', !!now.bad);
    // the active Live set's page as one-tap slots; without a set, the pinned sounds
    var lv = window.SLSynthLive, lset = lv ? lv.active() : null;
    if (lset) {
      var page = lv.page(), cur = lv.slot();
      morph(els.pins, '<div class="st-pinhead muted small"><span>' + esc(lset.name) + ' · page ' + (lv.pageIndex() + 1) + '</span><button type="button" class="btn sm" data-golive="1">Go live</button></div>' +
        '<div class="st-pingrid">' + page.map(function (sl, i) {
          var col = sl ? COLOURS[(function () { var it = sl.preset ? p.find(sl.preset) : null; return it && it.snap ? it.snap.colour : ''; })()] || '' : '';
          return '<button type="button" class="st-slot' + (sl ? '' : ' empty') + (i === cur ? ' active' : '') + '" data-lvslot="' + i + '"' + (col ? ' style="border-left:4px solid ' + col + '"' : '') + ' aria-label="Slot ' + (i + 1) + '"><span class="st-slotname">' + (i + 1) + ' ' + esc(lv.slotName(sl)) + '</span><span class="st-slotsub">' + esc(lv.slotBadges(sl)) + '</span></button>';
        }).join('') + '</div>');
      els.pins.hidden = false;
    } else {
      var pins = p.presets().filter(function (it) { return it.star; }).sort(function (a, b) { return (b.used || 0) - (a.used || 0); }).slice(0, 8);
      morph(els.pins, '<div class="st-pingrid">' + pins.map(function (it) { return slotHTML(it, now.match && now.match.id === it.id); }).join('') + '</div>');
      els.pins.hidden = !pins.length;
    }
    paintStrips();
    paintChips();
  }
  // one preset as a slot: name, colour, and what it brings back (badges)
  var COLOURS = { amber: '#ffab47', teal: '#2fb8a0', blue: '#4f8df5', pink: '#e06aa0', green: '#7dc45a', grey: '#8a8580' };
  function slotHTML(it, active) {
    var sn = it.snap || {}, badges = [];
    if (it.prog) badges.push(it.prog.msb + '/' + it.prog.lsb + '/' + it.prog.pc);
    var scene = sceneOf(it); if (scene) badges.push('Scene ' + scene);
    if (sn.app && typeof sn.app.root === 'number') badges.push(NOTE[sn.app.root % 12] + ' ' + (sn.app.scale || ''));
    if (sn.split) badges.push(sn.split.off ? 'no split' : 'split ' + noteName(sn.split.at));
    var parts = Object.keys(it.parts || {}).length; if (parts) badges.push(parts === 1 ? 'knobs' : parts + ' Parts');
    var col = COLOURS[sn.colour] || '';
    return '<button type="button" class="st-slot' + (active ? ' active' : '') + '" data-preset="' + esc(it.id) + '" title="' + esc(it.name) + (it.tags && it.tags.length ? ' · ' + esc(it.tags.join(', ')) : '') + '"' + (col ? ' style="border-left:4px solid ' + col + '"' : '') + '>' +
      '<span class="st-slotname">' + esc(it.name) + '</span><span class="st-slotsub">' + esc(badges.slice(0, 3).join(' · ')) + '</span></button>';
  }
  function sceneOf(it) {
    var parts = it.parts || {};
    for (var k in parts) { var c = parts[k].ctl || {}; if (typeof c.scene === 'number') return Math.floor(c.scene / 16) + 1; }
    return 0;
  }

  // ---- the preset builder sheet ----
  var sheet = { id: null, colour: 'amber', inc: { prog: true, knobs: true, btns: true, app: true, split: true } };
  var splitLearning = false;
  var INCS = [['prog', 'Sound', function (p) { var n = p.now(); return n.msb + ' / ' + n.lsb + ' / ' + n.pc + ' · ' + n.name; }],
    ['knobs', 'Knobs', function () { return 'Super Knob, the strips, Assign 1-8 on this Part'; }],
    ['btns', 'Buttons & Scene', function (p) { var s = p.ctl('scene1'); var on = []; ['arpMaster', 'msMaster', 'asw1', 'asw2', 'sus'].forEach(function (id) { var c = p.ctl(id); if (c && c.on) on.push(c.name); }); return (on.length ? on.join(', ') : 'all off') + sceneNow(p); }],
    ['app', 'Key & scale', function () { var r = App.store.get('fb.root', 9), s = App.store.get('fb.scale', 'minorPent'); return NOTE[((typeof r === 'number' ? r : 9) % 12 + 12) % 12] + ' ' + s + ' · LUMI layout'; }],
    ['split', 'Split', function () { return hubSplit() ? hubSplit().text() : 'the Hub is not open'; }]];
  function hubSplit() { return window.SLMidiHub && SLMidiHub.split ? SLMidiHub.split : null; }
  function sceneNow(p) { for (var i = 1; i <= 8; i++) { var c = p.ctl('scene' + i); if (c && c.on) return ' · Scene ' + i; } return ''; }
  function openSheet(id) {
    var p = P(); if (!p || !els.sheet) return;
    var it = id ? p.find(id) : null, m = p.now().match;
    sheet.id = it ? it.id : null; sheet.colour = it && it.snap && it.snap.colour ? it.snap.colour : 'amber';
    sheet.inc = { prog: it ? !!it.prog : true, knobs: true, btns: true, app: it ? !!(it.snap && it.snap.app) : true, split: it ? !!(it.snap && it.snap.split) : true };
    els.pid.value = sheet.id || '';
    els.pname.value = it ? it.name : (m ? m.name + ' 2' : p.now().name);
    els.ptags.value = it ? it.tags.join(', ') : '';
    els.psave.textContent = it ? 'Update' : 'Save';
    paintSheet();
    els.sheet.hidden = false;
    try { els.pname.focus(); els.pname.select(); } catch (e) { /* no focus */ }
  }
  function closeSheet() { if (els.sheet) els.sheet.hidden = true; sheet.id = null; }
  function paintSheet() {
    var p = P(); if (!p) return;
    els.colours.innerHTML = Object.keys(COLOURS).map(function (k) { return '<button type="button" class="st-swatch' + (k === sheet.colour ? ' active' : '') + '" data-colour="' + k + '" aria-label="' + k + '" aria-pressed="' + (k === sheet.colour) + '" style="background:' + COLOURS[k] + '"></button>'; }).join('');
    els.incs.innerHTML = INCS.map(function (r) {
      var on = !!sheet.inc[r[0]], sub = ''; try { sub = r[2](p); } catch (e) { sub = ''; }
      return '<button type="button" class="st-inc' + (on ? ' active' : '') + '" data-inc="' + r[0] + '" aria-pressed="' + on + '"><span class="st-incname">' + (on ? '✓' : '○') + ' ' + r[1] + '</span><span class="st-incsub">' + esc(sub) + '</span></button>';
    }).join('');
    els.pnote.textContent = 'Capture re-reads the synth and the app. Save keeps it in your Sounds' + (sheet.id ? '.' : ' and pins it to the Deck.');
    paintSplitBox();
  }
  // the split box edits the Hub's split directly (it is the live routing); the preset remembers it when Split is included
  function paintSplitBox() {
    var hs = hubSplit(), s = hs ? hs.get() : null;
    if (els.splittext) els.splittext.textContent = hs ? hs.text() : '';
    qa('[data-split]', els.splitbox).forEach(function (b) { var on = (b.dataset.split === 'off') === !s; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    if (s) { els.splitat.value = String(s.at); els.splitpart.value = String(s.parts[0]); }
    els.splitlearn.classList.toggle('active', splitLearning); els.splitlearn.textContent = splitLearning ? 'Listening… play the split key' : 'Play the split key';
  }
  function setSplitFromBox(on) {
    var hs = hubSplit(); if (!hs) return;
    if (!on) hs.set(null); else hs.set({ at: parseInt(els.splitat.value, 10), at2: null, parts: [parseInt(els.splitpart.value, 10)], port: hs.defaultPort(), sus: true, on: true });
    paintSplitBox(); paintChips();
  }
  function submitSheet() {
    var p = P(); if (!p) return;
    var it = p.save({ id: sheet.id, name: els.pname.value, tags: els.ptags.value, scope: 'part', incProg: sheet.inc.prog, incKnobs: sheet.inc.knobs, incBtns: sheet.inc.btns, incApp: sheet.inc.app, incSplit: sheet.inc.split, colour: sheet.colour, fav: favs() });
    if (!it) return;
    if (!sheet.id && !it.star) { it.star = true; p.persist(); } // a new preset shows up on the Deck at once
    closeSheet(); paint();
  }

  function paintStrips() {
    var p = P(); if (!p) return;
    qa('.st-strip').forEach(function (s) {
      var cc = +s.dataset.cc, v = p.kv(cc);
      var pct = Math.round(v / 127 * 1000) / 10;
      s.querySelector('.st-fill').style.width = pct + '%';
      s.querySelector('.st-thumb').style.left = 'calc(' + pct + '% - 4px)';
      s.setAttribute('aria-valuenow', v);
      var vb = cc === 95 ? els.superval : q('[data-val="' + cc + '"]');
      if (vb) vb.textContent = cc === 95 ? Math.round(v / 127 * 100) + ' %' : v;
    });
  }
  var CHIPS = ['arpMaster', 'msMaster', 'split', 'asw1', 'asw2', 'sus'];
  // Update markup IN PLACE (1.3.1). The MODX sends a MIDI clock tick ~36 times a second; the
  // Deck used to rebuild its chips, Scenes and slots on every incoming message, so the button
  // under a finger was replaced between press and release and the tap was lost. Same structure
  // = same nodes, only attributes and text change.
  function keyOf(n) { return n.nodeType === 1 ? n.nodeName + '|' + (n.getAttribute('data-chip') || n.getAttribute('data-preset') || n.getAttribute('data-lvslot') || n.getAttribute('data-golive') || '') : '#' + n.nodeType; }
  function syncKids(cur, next) {
    var a = cur.childNodes, b = next.childNodes, same = a.length === b.length;
    for (var i = 0; same && i < b.length; i++) if (keyOf(a[i]) !== keyOf(b[i])) same = false;
    if (!same) { while (cur.firstChild) cur.removeChild(cur.firstChild); while (next.firstChild) cur.appendChild(next.firstChild); return; }
    for (var j = 0; j < b.length; j++) {
      var x = a[j], y = b[j];
      if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
      var k, at;
      for (k = x.attributes.length - 1; k >= 0; k--) { at = x.attributes[k].name; if (!y.hasAttribute(at)) x.removeAttribute(at); }
      for (k = 0; k < y.attributes.length; k++) { at = y.attributes[k]; if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value); }
      syncKids(x, y);
    }
  }
  function morph(el, html) {
    if (!el || el.__stHtml === html) return;
    var tpl = document.createElement('template'); tpl.innerHTML = html;
    syncKids(el, tpl.content); el.__stHtml = html;
  }
  function paintChips() {
    var p = P(); if (!p) return;
    morph(els.chips, CHIPS.map(function (id) {
      if (id === 'split') { var hs = hubSplit(), s = hs ? hs.get() : null; return '<button type="button" class="chip st-chip' + (s && s.on !== false ? ' active' : '') + '" data-chip="split" aria-pressed="' + !!(s && s.on !== false) + '" title="' + esc(hs ? hs.text() : 'Key split') + '">' + (s ? 'Split ' + esc(noteName(s.at)) : 'Split') + '</button>'; }
      var st = p.ctl(id); if (!st) return '';
      return '<button type="button" class="chip st-chip' + (st.on ? ' active' : '') + (st.unsure ? ' unsure' : '') + '" data-chip="' + id + '" aria-pressed="' + !!st.on + '">' + esc(st.name) + '</button>';
    }).join(''));
    var scenes = [];
    for (var i = 1; i <= 8; i++) { var s = p.ctl('scene' + i); scenes.push('<button type="button" class="st-scene' + (s && s.on ? ' active' : '') + '" data-chip="scene' + i + '" aria-label="Scene ' + i + '" aria-pressed="' + !!(s && s.on) + '">' + i + '</button>'); }
    morph(els.scenes, scenes.join(''));
  }

  // ---- connection (1.3.1): the Synth tab connects by itself ----
  // Before, only the Hub or Settings ever asked the browser for MIDI, so a first visit to the
  // Synth tab showed live-looking controls that silently refused every tap. Now the tab says
  // what is missing and offers the one step that fixes it.
  var conn = { busy: false, denied: false, probed: false };
  function isAppleTouch() { var n = navigator; return /iPad|iPhone|iPod/.test(n.userAgent || '') || (n.platform === 'MacIntel' && n.maxTouchPoints > 1); }
  function connState() {
    var m = midi();
    if (!m || !m.supported) return { k: 'unsupported' };
    if (!m.ready) return { k: conn.busy ? 'busy' : conn.denied ? 'denied' : 'off' };
    var api = window.SLMidiHub && SLMidiHub.api;
    var name = api && api.hubOutName ? api.hubOutName() || '' : (m.outputName || '');
    var has = api && api.hasOut ? !!api.hasOut() : !!m.hasOutput;
    if (!has) return { k: 'noout' };
    if (/lumi/i.test(name)) return { k: 'lumi', out: name };
    return { k: 'ok', out: name };
  }
  function connected() { return connState().k === 'ok'; }
  function connect() {
    var m = midi(); if (!m || !m.supported || m.ready || conn.busy) return Promise.resolve(m && m.ready);
    conn.busy = true; conn.denied = false; repaintConn();
    return m.enable().then(function () { conn.busy = false; repaintConn(); return true; },
      function () { conn.busy = false; conn.denied = true; repaintConn(); return false; });
  }
  // on show: reconnect without a prompt when the browser already allows MIDI for this site
  function autoConnect() {
    var m = midi(); if (!m || !m.supported || m.ready || conn.busy) return;
    if (App.store.get('midi.wanted', false) || m.native) { connect(); return; }
    if (!navigator.permissions || !navigator.permissions.query) return;
    navigator.permissions.query({ name: 'midi', sysex: true }).then(function (s) {
      if (s.state === 'granted') connect(); else if (s.state === 'denied') { conn.denied = true; repaintConn(); }
    }).catch(function () { /* the query is optional */ });
  }
  function outOptions(cur) {
    var outs = (midi() && midi().outputs) || [];
    return outs.map(function (o) { var nm = o.name || o.id; return '<option value="' + esc(o.id) + '"' + (nm === cur ? ' selected' : '') + '>' + esc(nm) + (/lumi/i.test(nm) ? ' (key lights)' : '') + '</option>'; }).join('');
  }
  var CONN = {
    unsupported: function () {
      return ['This browser can’t reach MIDI devices', isAppleTouch()
        ? 'Safari and Chrome on iPad and iPhone have no Web MIDI, so nothing here can reach the synth. Open soundLAB in a browser app that adds MIDI (MIDIWeb Browser or Web MIDI Browser in the App Store), with the synth on a USB camera adapter.'
        : 'Open soundLAB in Chrome or Edge to control your synth from here.', ''];
    },
    off: function () { return ['Connect your synth', 'Plug the synth in by USB and switch it on. The browser asks once for permission to use MIDI devices.', '<button type="button" class="btn primary st-big" data-conn="go">Connect</button>']; },
    busy: function () { return ['Waiting for the browser', 'Allow MIDI devices in the browser’s prompt by the address bar.', '']; },
    denied: function () { return ['MIDI is blocked for this site', 'Open the site settings from the icon left of the address, allow MIDI devices, then try again.', '<button type="button" class="btn primary st-big" data-conn="go">Try again</button>']; },
    noout: function () {
      var outs = (midi() && midi().outputs) || [];
      return ['No synth output', outs.length ? 'MIDI is on. Choose where the Synth tab sends:' : 'MIDI is on, but no output is listed. Plug the synth in by USB and switch it on; it appears here by itself.',
        outs.length ? '<select class="st-connout" data-conn="out" aria-label="Synth output"><option value="">Choose…</option>' + outOptions('') + '</select>' : ''];
    },
    lumi: function (s) { return ['Sending to the LUMI', 'The synth output is the LUMI key lights, which never get synth messages. Choose your synth:', '<select class="st-connout" data-conn="out" aria-label="Synth output">' + outOptions(s.out) + '</select>']; }
  };
  var connEls = [];
  function paintConn(el) {
    if (!el) return;
    if (connEls.indexOf(el) === -1) {
      connEls.push(el);
      el.addEventListener('click', function (e) { var b = e.target.closest('[data-conn="go"]'); if (b) connect(); });
      el.addEventListener('change', function (e) {
        var s = e.target.closest('[data-conn="out"]'); if (!s || !s.value || !window.SLMidiHub) return;
        SLMidiHub.api.set('outId', s.value); App.emit('midi:state', {}); repaintConn();
        if (App.toast) App.toast('Synth out: ' + (SLMidiHub.api.hubOutName() || s.value));
      });
    }
    var s = connState(), key = s.k + '|' + (s.out || '') + '|' + (((midi() && midi().outputs) || []).length);
    var root = el.closest('.st-face') || el.parentElement;
    if (root) root.classList.toggle('st-offline', s.k !== 'ok');
    if (s.k === 'ok') { el.hidden = true; el.dataset.k = 'ok'; return; }
    if (el.dataset.key === key && !el.hidden) return; // keep an open select steady
    var c = CONN[s.k](s);
    el.dataset.key = key; el.dataset.k = s.k;
    el.innerHTML = '<div class="st-connhead">' + esc(c[0]) + '</div><p class="st-connbody">' + esc(c[1]) + '</p>' + (c[2] ? '<div class="st-connact">' + c[2] + '</div>' : '');
    el.hidden = false;
  }
  function repaintConn() { connEls = connEls.filter(function (e) { return document.body.contains(e); }); connEls.forEach(paintConn); }
  // a tap on a control while not connected points at the panel instead of doing nothing
  function nudgeConn() {
    var el = els.conn; if (!el || el.hidden) return;
    el.classList.remove('st-nudge'); void el.offsetWidth; el.classList.add('st-nudge');
    try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { }
    var b = el.querySelector('button,select'); if (b) try { b.focus({ preventScroll: true }); } catch (e) { }
  }

  // ---- strips: pointer anywhere along, drag off for fine steps ----
  function stripVal(s, e) {
    var r = s.getBoundingClientRect(), x = clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1);
    return Math.round(x * 127);
  }
  function onStripDown(e) {
    var s = e.target.closest ? e.target.closest('.st-strip') : null; if (!s) return;
    var p = P(); if (!p) return;
    e.preventDefault();
    if (!connected()) { nudgeConn(); return; }
    try { s.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ }
    var cc = +s.dataset.cc, v = stripVal(s, e);
    drag = { s: s, cc: cc, id: e.pointerId, x0: e.clientX, y0: e.clientY, v0: p.kv(cc), fine: false, lastSent: null };
    face.classList.add('st-dragging');
    turn(cc, v);
  }
  function onStripMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var s = drag.s, r = s.getBoundingClientRect();
    var dy = Math.abs(e.clientY - (r.top + r.height / 2));
    var fine = dy > r.height * 1.5; // well off the strip: fine steps
    if (fine && !drag.fine) { drag.fine = true; drag.x0 = e.clientX; drag.v0 = P().kv(drag.cc); }
    if (!fine && drag.fine) { drag.fine = false; }
    var v = drag.fine ? clamp(Math.round(drag.v0 + (e.clientX - drag.x0) / Math.max(1, r.width) * 127 * 0.25), 0, 127) : stripVal(s, e);
    turn(drag.cc, v);
  }
  function onStripUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null; face.classList.remove('st-dragging');
  }
  var turnT = 0, turnQ = null;
  function turn(cc, v) { // coalesced: one send per animation frame at most
    turnQ = { cc: cc, v: v };
    if (turnT) return;
    turnT = requestAnimationFrame(function () {
      turnT = 0; var t = turnQ; turnQ = null; if (!t) return;
      var p = P(); if (!p) return;
      p.turn(t.cc, t.v);
      paintStrips();
    });
  }
  function onStripKey(e) {
    var s = e.target.closest ? e.target.closest('.st-strip') : null; if (!s) return;
    var cc = +s.dataset.cc, p = P(); if (!p) return;
    if (!connected()) { if (/^Arrow|^Home$|^End$/.test(e.key)) { e.preventDefault(); nudgeConn(); } return; }
    var v = p.kv(cc), step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v += step; else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v -= step; else if (e.key === 'Home') v = 0; else if (e.key === 'End') v = 127; else return;
    e.preventDefault(); turn(cc, clamp(v, 0, 127));
  }

  function onClick(e) {
    var t = e.target, b, p = P();
    if ((b = t.closest('#st-explain'))) { set('explain', !explainOn()); render(); return; }
    if ((b = t.closest('[data-mode]'))) { set('mode', b.dataset.mode); render(); return; }
    if ((b = t.closest('[data-row]'))) { set('row', b.dataset.row); render(); return; }
    if (!p) return;
    if (!connected() && t.closest('#st-prev,#st-next,[data-chip],[data-preset],[data-lvslot]')) { nudgeConn(); return; }
    if (t.closest('#st-prev')) { p.step(-1); paint(); return; }
    if (t.closest('#st-next')) { p.step(1); paint(); return; }
    if (t.closest('#st-save')) { openSheet(null); return; }
    if (t.closest('#st-sheetclose') || (t.id === 'st-sheet')) { closeSheet(); return; }
    if ((b = t.closest('[data-colour]'))) { sheet.colour = b.dataset.colour; paintSheet(); return; }
    if ((b = t.closest('[data-inc]'))) { sheet.inc[b.dataset.inc] = !sheet.inc[b.dataset.inc]; paintSheet(); return; }
    if (t.closest('#st-capture')) { paintSheet(); if (App.toast) App.toast('Captured what the synth and the app are on now'); return; }
    if ((b = t.closest('[data-split]'))) { setSplitFromBox(b.dataset.split === 'two'); return; }
    if (t.closest('#st-splitlearn')) { splitLearning = !splitLearning; paintSplitBox(); return; }
    if (t.closest('#st-pickfav')) { pickFavs(); return; }
    if ((b = t.closest('[data-lvslot]'))) { if (window.SLSynthLive) { var pg = SLSynthLive.page(); if (pg && pg[+b.dataset.lvslot]) SLSynthLive.go(+b.dataset.lvslot); else App.switchTo('liveset'); } return; }
    if (t.closest('[data-golive]')) { App.switchTo('liveset'); if (window.SLSynthLive) SLSynthLive.setLive(true); return; }
    if ((b = t.closest('[data-preset]'))) { var it = p.find(b.dataset.preset); p.load(b.dataset.preset).then(function () { if (it && it.snap && Array.isArray(it.snap.fav) && it.snap.fav.length === 4) { set('fav', it.snap.fav); render(); } else paint(); }); return; }
    if ((b = t.closest('[data-chip]'))) {
      var id = b.dataset.chip;
      if (id === 'split') { var hs = hubSplit(), s = hs ? hs.get() : null; if (s) { hs.enable(s.on === false); paintChips(); } else { openSheet(null); try { els.splitbox.scrollIntoView({ block: 'center' }); } catch (e) { } } return; }
      p.tap(id); paintChips(); return;
    }
  }
  // Favourites: cycle a strip's CC through the Hub's knobs with a small sheet-less picker
  function pickFavs() {
    var all = P().knobs(), cur = favs();
    var opts = all.map(function (k) { return k.cc; });
    var names = all.map(function (k) { return ccLabel(k.cc); });
    var txt = 'Favourite strips, by number (' + names.map(function (n, i) { return opts[i] + ' ' + n; }).join(', ') + ')';
    var ans = window.prompt(txt, cur.join(', '));
    if (ans == null) return;
    var next = ans.split(/[,\s]+/).map(Number).filter(function (n) { return n >= 0 && n <= 127; }).slice(0, 4);
    if (next.length !== 4) return;
    set('fav', next); render();
  }

  // ---- page registration ----
  App.register('deck', {
    init: function (el) {
      deckRoot = el;
      App.injectCSS('synthtab',
        '#panel-deck .mh-view[data-view=control]{display:block}' +
        '.st-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 10px}.st-explain{width:44px;height:44px;min-height:44px;padding:0;font:700 17px/1 var(--font-body)}' +
        '.st-explain.active{background:var(--accent-soft);border-color:var(--accent-line);color:var(--accent-ink)}' +
        '.st-mode button{min-height:44px;padding:0 16px}' +
        '.st-conn{display:grid;gap:6px;padding:14px 16px;margin:0 0 12px;border-color:var(--accent-line);background:var(--accent-soft)}.st-conn[hidden]{display:none}' +
        '.st-connhead{font:600 20px/1.2 var(--font-condensed);letter-spacing:.3px;color:var(--accent-ink)}.st-connbody{margin:0;font-size:14px;line-height:1.45}' +
        '.st-connact{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}.st-connact .st-big{flex:0 1 220px}.st-connout{min-height:44px;font-size:16px;min-width:220px;max-width:100%}' +
        '.st-offline .st-strips,.st-offline .st-chips,.st-offline .st-scenes,.st-offline #st-prev,.st-offline #st-next,.st-offline .st-pins,.st-offline .st-lvgrid,.st-offline .st-lvnav{opacity:.45}' +
        '@keyframes st-nudge{0%,100%{transform:none}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}.st-nudge{animation:st-nudge .3s ease 2}' +
        '@media (prefers-reduced-motion:reduce){.st-nudge{animation:none;outline:2px solid var(--accent)}}' +
        '.st-perform{display:grid;gap:12px}.st-now{display:grid;gap:8px;padding:16px 18px}' +
        '.st-nowname{font:600 32px/1.1 var(--font-condensed);letter-spacing:.3px;overflow-wrap:anywhere}.st-nowacts{display:flex;gap:8px;margin-top:4px}' +
        '.st-big{flex:1;min-height:48px;font-size:15px;font-weight:600}.st-big.primary{flex:1.4}' +
        '.st-cap{margin:6px 0 0;padding:8px 10px;border-radius:10px;background:var(--accent-soft);color:var(--accent-ink);font-size:13px;line-height:1.4}' +
        '.st-pins{margin-top:6px;display:grid;gap:6px}.st-pingrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.st-pinhead{display:flex;justify-content:space-between;align-items:center}.st-pinhead .btn{min-height:40px}.st-slot.empty{border-style:dashed;color:var(--muted)}' +
        '.st-slot{min-height:58px;padding:8px;border-radius:12px;border:1px solid var(--line);background:var(--card-2,rgba(255,255,255,.04));color:var(--text);text-align:left;display:grid;gap:2px;align-content:start;font:inherit}' +
        '.st-slot.active{border-color:var(--accent-line);background:var(--accent-soft)}.st-slotname{font-weight:600;font-size:13px;overflow-wrap:anywhere}.st-slotsub{font-size:11px;color:var(--muted)}' +
        '.st-strips{display:grid;gap:10px;padding:14px 16px}.st-striphead{display:flex;justify-content:space-between;align-items:baseline;gap:8px}.st-lab{font-size:13px;font-weight:600;color:var(--muted)}' +
        '.st-val{font:600 15px/1 var(--font-body);font-variant-numeric:tabular-nums}.st-hero+.st-striphead .st-val,#st-superval{font:600 26px/1 var(--font-condensed);color:var(--accent-ink)}' +
        '.st-strip{position:relative;height:44px;border-radius:10px;border:1px solid var(--line);background:var(--card-2,rgba(255,255,255,.05));overflow:hidden;touch-action:none;cursor:pointer;user-select:none}' +
        '.st-strip:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.st-hero{height:52px}' +
        '.st-fill{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--accent-soft)}.st-thumb{position:absolute;top:4px;bottom:4px;left:0;width:8px;border-radius:4px;background:var(--accent)}' +
        '.st-dragging{cursor:grabbing}.st-rows{display:flex;overflow-x:auto;gap:4px;padding-bottom:2px}.st-rows button{flex:0 0 auto;min-height:40px;white-space:nowrap}' +
        '.st-four{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px}.st-one{display:grid;gap:4px}.st-one .st-strip{height:40px}.st-pickfav{justify-self:start;height:44px;min-height:44px}' +
        '.st-chips{display:flex;gap:8px;flex-wrap:wrap}.st-chip{min-height:44px;padding:0 16px;font-size:14px;font-weight:600}.st-chip.unsure{opacity:.6}' +
        '.st-scenes{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px}.st-scene{min-height:44px;border-radius:10px;border:1px solid var(--line);background:var(--card-2,rgba(255,255,255,.04));color:var(--text);font:600 15px/1 var(--font-body)}' +
        '.st-scene.active{background:var(--accent-soft);border-color:var(--accent-line);color:var(--accent-ink)}.st-scenelab{margin:-4px 0 0}' +
        '.st-sheet{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}.st-sheet[hidden]{display:none}#st-sheetclose{width:44px;height:44px;min-height:44px;padding:0;font-size:20px}' +
        '.st-sheetcard{width:100%;max-width:560px;max-height:92vh;overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:20px 20px 0 0;padding:14px 16px 20px;display:grid;gap:12px}' +
        '@media (min-width:700px){.st-sheet{align-items:center}.st-sheetcard{border-radius:16px}}' +
        '.st-sheethead{display:flex;align-items:center;justify-content:space-between}.st-sheethead h2{margin:0}' +
        '#st-form{display:grid;gap:12px}.st-formrow{display:flex;gap:8px;align-items:flex-end}.st-grow{flex:1}#st-form input[type=text]{min-height:44px;font-size:16px;width:100%;box-sizing:border-box}' +
        '.st-colours{display:flex;gap:6px;align-items:center;min-height:44px}.st-swatch{width:32px;height:32px;border-radius:50%;border:3px solid transparent;padding:0}.st-swatch.active{border-color:var(--text)}' +
        '.st-incs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.st-inc{min-height:52px;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--text);text-align:left;display:grid;gap:2px;font:inherit}' +
        '.st-inc.active{border-color:var(--accent-line);background:var(--accent-soft);color:var(--accent-ink)}.st-incname{font-weight:600;font-size:14px}.st-incsub{font-size:11px;color:var(--muted);overflow-wrap:anywhere}' +
        '.st-splitbox{padding:10px 12px;border-radius:10px;border:1px dashed var(--line);display:grid;gap:8px}.st-splithead{display:flex;justify-content:space-between;gap:8px;align-items:baseline}' +
        '.st-splitrow{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}.st-splitrow .seg button,.st-splitrow .btn{min-height:44px}.st-splitrow select{min-height:44px}.st-formacts{display:flex;gap:8px}' +
        '@media (min-width:900px){.st-four{grid-template-columns:repeat(4,minmax(0,1fr))}.st-pingrid{grid-template-columns:repeat(8,minmax(0,1fr))}}');
      face = document.createElement('div'); face.className = 'st-face'; el.appendChild(face);
      face.addEventListener('click', onClick);
      face.addEventListener('pointerdown', onStripDown);
      face.addEventListener('pointermove', onStripMove);
      face.addEventListener('pointerup', onStripUp);
      face.addEventListener('pointercancel', onStripUp);
      face.addEventListener('keydown', onStripKey);
      render();
      // values the synth changes (two-way knobs, program changes) show up without a tap
      // only messages that can change what the Deck shows: controllers, program changes and
      // SysEx replies - never the clock (F8), active sensing (FE) or notes, which arrive constantly
      App.on('midi:raw', function (d) {
        var s = d && d.bytes && d.bytes[0]; if (s == null || App.active !== 'deck' || drag) return;
        var t = s & 0xF0; if (t === 0xB0 || t === 0xC0 || s === 0xF0) schedulePaint();
      });
      App.on('midi:state', function () { if (App.active === 'deck') schedulePaint(); repaintConn(); });
      App.on('deck:assignnames', function () { if (App.active === 'deck') render(); }); // the strips take the Performance's knob names
      App.on('midihub:split', function () { if (App.active === 'deck') { paintChips(); if (els.sheet && !els.sheet.hidden) paintSplitBox(); } });
      App.on('synthlive:slot', function () { if (App.active === 'deck') schedulePaint(); });
      App.on('midi:note', function (d) { if (!splitLearning || !d || !d.on || !els.splitat) return; splitLearning = false; els.splitat.value = String(Math.max(36, Math.min(84, d.midi))); paintSplitBox(); });
    },
    onShow: function () {
      render();
      borrow();
      applyMute(true);
      autoConnect();
      if (App.synthDeck && App.synthDeck.onShow) { try { App.synthDeck.onShow(); } catch (e) { /* the deck repaints itself */ } }
      tick = setInterval(function () { if (!drag) paintStrips(); }, 400);
    },
    onHide: function () {
      clearInterval(tick); tick = 0; drag = null;
      if (App.synthDeck && App.synthDeck.stop) App.synthDeck.stop();
      applyMute(false);
      giveBack();
    },
    onBack: function () {
      if (els.sheet && !els.sheet.hidden) { closeSheet(); return true; }
      if (mode() === 'edit') { set('mode', 'perform'); render(); return true; }
      return !!(App.synthDeck && App.synthDeck.onBack && App.synthDeck.onBack());
    }
  });
  var paintT = 0;
  function schedulePaint() { if (paintT) return; paintT = setTimeout(function () { paintT = 0; paint(); }, 60); }

  // the Live page lives in js/synthlive.js (SLSynthLive); the Deck's grid shows its active page

  window.SLSynthTab = { // test hook
    borrowed: function () { return !!borrowed; }, mode: mode, row: function () { return g('row', 'fav'); }, favs: favs, rows: ROWS,
    ccLabel: ccLabel, explain: explainOn, render: render, paint: paint,
    conn: { state: connState, connected: connected, connect: connect, autoConnect: autoConnect, paint: paintConn, repaint: repaintConn }
  };
})();
