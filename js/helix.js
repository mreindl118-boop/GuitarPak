/* soundLAB HELIX STADIUM page ('helix', Guitar group pill "Helix"): read, write
 * and control a Line 6 Helix Stadium / Stadium XL. Built in since 0.82.0; it
 * began as plugins/helix-stadium.js and outgrew the 100 KB plugin cap.
 *
 * SHELL (Helix deck phase 0, docs/HELIX-DECK-SPEC.md): this file is the page -
 * App.register('helix'), the DOM and the paint* functions. Everything that
 * talks to the pedal lives in js/helix-routes.js as App.helix (the MIDI route,
 * null's SAFETY model, the network bridge, favorites, observed, the ledger);
 * this file subscribes to its events ('state', 'dev', 'value', 'ledger', 'io',
 * 'observed', 'toast') and paints. The page has two faces:
 *   PERFORM  #hxd-top + #hxd-perform, mounted by js/helix-deck.js
 *            (window.SLHelixDeck) when it is loaded - the default face
 *   EDIT     #hxd-edit: the six views Rig / Blocks / Presets / Looper & Song /
 *            Mixer / Monitor (hx- ids), shown when hx.mode is 'edit' - or
 *            always, when no deck is loaded, so the page still works
 * Confirms go through App.helix.ui.confirm (the deck's sheet) and fall back
 * to window.confirm / prompt only when the deck is absent.
 *
 * NOTHING CONNECTS AT BOOT: init only builds the DOM. Web MIDI is requested
 * on a visit only once the user said yes to MIDI anywhere (midi.wanted); the
 * network bridge connects only after the user pressed Connect bridge once
 * (hx.bridgeAuto, default off) and retries only while the page is visible.
 * js/plugins.js skips an old stored copy of the plugin.
 *
 * Two ways in, used together when both are there:
 *
 *   MIDI (USB-C or 5-pin, no helper needed) — CONTROL: preset + setlist recall
 *   (CC32 + Program Change), snapshots (CC69), the eight knobs (CC38-45),
 *   EXP 1/2 (CC1/2), the XY pad (CC7/8), top-panel buttons incl. tuner (CC9),
 *   footswitch mode (CC37), tap tempo (CC64), looper (CC52-62), song transport
 *   (CC10/46-51/63), the Matrix mixer (CC11-29 level / 34-52 pan / 57-75 mute /
 *   80-98 solo on the layer's channel) and your own Bypass/Control CCs (channel
 *   2). READ-BACK: the Stadium sends PC + CC69 when Global Settings › MIDI ›
 *   Send MIDI PC / Send Snapshot CC are on. All numbers from the Helix Stadium
 *   manual's MIDI chapter.
 *
 *   BRIDGE (node tools/helix-bridge.js on this computer, the Stadium on the
 *   same Wi-Fi/LAN) — the editor's own protocol: product info, the ACTIVE
 *   preset, the EDIT BUFFER (every block, its model and parameters, named via
 *   tools/helix-defs.json), live parameter writes, block bypass, snapshot
 *   recall + rename, browsing Factory / User / Setlist presets and loading
 *   them, saving the edit buffer, and the device's own pitch detector as a
 *   tuner. The page follows what you do on the pedal (2001 change stream).
 *   Protocol notes: docs/HELIX-STADIUM.md.
 *
 * Built together with null (Codex): the SAFETY MODEL (output starts disarmed;
 * Arm opens a 90 s window every command renews; page exit, app hide, window
 * blur, port change, bridge drop or a failed send disarm), named FAVORITES
 * (CC32 + PC + optional snapshot, byte preview, saving never sends), the
 * PORT ALLOW-LIST (never MODX / MONTAGE / LUMI / virtual / thru ports, and
 * soundLAB's shared output only when it IS the Helix) and the OBSERVED panel
 * (newest value per CC / PC the pedal sent + counts) come from null's
 * recall profile (branch codex/sl-helix-0780-20261019) and its Stadium Local
 * Control tool (2026-10-22). Safe mode can be switched off (hx.safe false).
 *
 * Store keys hx.* ; DOM/CSS prefix hx- (deck: hxd-). Test hook: window.SLHelix.
 */
(function () {
  'use strict';

  var A = App, E = A.helix, visible = false;
  if (!E) { console.error('helix: js/helix-routes.js must load first'); return; }
  var ID = 'helix';
  var I = E.internals(), st = I.st, dev = I.dev, midi = I.midi, br = I.br;
  var T = E.tables, CC = T.CC, BUTTONS = T.BUTTONS, FSMODES = T.FSMODES, MIX = T.MIX, LAYERS = T.LAYERS;
  var F = E.fmt, slotLabel = F.slotLabel, hex = F.hex, addrLabel = F.addrLabel, favDetail = F.favDetail, ago = F.ago, ccName = F.ccName;
  var NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  function g(k, d) { return A.store.get('hx.' + k, d); }
  function set(k, v) { A.store.set('hx.' + k, v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function int(v, lo, hi) { if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) v = +v; return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi ? v : null; }
  function $(sel, el) { return (el || root).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || root).querySelectorAll(sel)); }
  function hasMidiOut() { return E.hasMidiOut(); }
  function devOnline() { return E.devOnline(); }
  function gate(quiet) { return E.gate('write', quiet); }
  function chGlobal() { return clamp(parseInt(g('ch', 1), 10) || 1, 1, 16); }
  function chCtl() { return clamp(parseInt(g('ctlCh', 2), 10) || 2, 1, 16); }
  function deck() { return window.SLHelixDeck || null; }

  var root = null, els = {}, view = g('view', 'rig');
  var toastT = 0;
  function toast(msg) { if (!els.toast) return; els.toast.textContent = msg; els.toast.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { els.toast.hidden = true; }, 2200); }
  // a confirm: the deck's sheet (App.helix.ui.confirm, async) when installed,
  // else window.confirm - synchronous, so the fallback keeps today's flow
  function confirmThen(opts, fn) {
    var c = E.ui && E.ui.confirm;
    if (typeof c === 'function') { try { Promise.resolve(c(opts)).then(function (ok) { if (ok) fn(); }, function () { /* declined */ }); } catch (e) { /* declined */ } return; }
    var yes = false; try { yes = typeof window.confirm === 'function' && window.confirm(opts.body); } catch (e) { yes = false; }
    if (yes) fn();
  }

  // ---- mode: Perform (the deck) | Edit (the six views) ---------------------------------
  function mode(name) {
    if (name === undefined) return deck() ? E.mode() : 'edit';
    if (name === 'perform' || name === 'edit') E.mode(name);
    return mode();
  }
  function applyMode() { if (els.edit) els.edit.hidden = mode() !== 'edit'; }

  // ---- safety paint (the engine owns the arm state) -----------------------------------
  function flashArm() { var r = els.armRow; if (!r) return; r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash'); }
  function destText() {
    var s = E.state(), p = [];
    if (s.routes.midi.dest) p.push(s.routes.midi.dest + ' · ch ' + s.channels.global);
    if (s.routes.net.status === 'online') p.push('network ' + (s.routes.net.ip || s.routes.net.host));
    return p.length ? '→ ' + p.join(' + ') : 'no destination yet';
  }
  function paintArm() {
    if (!els.arm) return;
    var s = E.state(), sf = s.safe, on = sf && s.on && Date.now() < s.until;
    els.armSt.textContent = !sf ? 'SAFE MODE OFF' : on ? 'ARMED' : 'DISARMED';
    els.armSt.className = 'hx-armst' + (!sf ? ' unsafe' : on ? ' on' : '');
    els.arm.hidden = !sf;
    els.arm.disabled = !s.on && !E.canArm();
    els.arm.textContent = s.on ? 'Disarm' : 'Arm output';
    els.arm.setAttribute('aria-pressed', String(!!s.on));
    els.dest.textContent = destText();
    els.armMsg.textContent = s.msg;
    els.safe.checked = sf;
  }

  // ---- FAVORITES: the Edit face's form over App.helix.favs / saveFav ------------------
  var favEdit = '';
  function keepExtras(f, old) { if (!old) return f; if (old.bank === f.bank && old.prog === f.prog && old.cid != null) f.cid = old.cid; if (old.colour) f.colour = old.colour; if (old.tags) f.tags = old.tags; if (old.app) f.app = old.app; return f; }
  function saveFromForm(f) { // saving never sends; an edit in progress is replaced in place
    if (favEdit) { f.id = favEdit; keepExtras(f, E.favById(favEdit)); }
    if (!E.saveFav(f)) return false;
    favEdit = ''; els.favName.value = ''; paintFavEdit(); return true;
  }
  function favFromForm() {
    var name = (els.favName.value || '').trim().slice(0, 40);
    if (!name) { toast('Name the favorite first. Nothing sent.'); els.favName.focus(); return; }
    var a = E.address();
    saveFromForm({ name: name, bank: a.setlist, prog: a.prog, snap: a.snapAfter });
  }
  function favFromItem(it) { var f = E.favFromItem(it); if (f) saveFromForm(f); }
  function favActive() { E.favActive().then(function (f) { if (f) saveFromForm(f); }); }
  function editFav(f) {
    favEdit = f.id; E.address({ setlist: f.bank, prog: f.prog, snapAfter: f.snap });
    els.favName.value = f.name; els.snapafter.value = f.snap == null ? '' : String(f.snap);
    paintFavEdit(); els.favName.focus();
  }
  function paintFavEdit() { if (!els.favsave) return; els.favsave.textContent = favEdit ? '★ Update favorite' : '★ Save favorite'; els.favcancel.hidden = !favEdit; }
  function paintFavs() {
    if (!els.favs) return;
    var h = '';
    E.favs().forEach(function (f) {
      h += '<li class="hx-fav"><div><b>' + esc(f.name) + '</b><span class="muted small">' + esc(favDetail(f)) + '</span></div><div class="hx-favact">' +
        '<button type="button" class="btn sm primary" data-fav="' + f.id + '" data-act="recall">Recall</button><button type="button" class="btn sm" data-fav="' + f.id + '" data-act="edit">Edit</button>' +
        '<button type="button" class="btn sm" data-fav="' + f.id + '" data-act="del" aria-label="Remove ' + esc(f.name) + '">×</button></div></li>';
    });
    els.favs.innerHTML = h || '<li class="muted small">No favorites yet. Saving one sends nothing.</li>';
  }

  // ---- OBSERVED paint ---------------------------------------------------------------------
  function paintObs() {
    if (!els.obs) return;
    var o = E.observed(), obs = o.items, now = Date.now(), h = '';
    Object.keys(obs).sort(function (a, b) { return obs[b].t - obs[a].t; }).forEach(function (k) {
      var r = obs[k];
      h += '<div class="hx-orow"><span class="hx-mono">' + esc(k) + '</span><span>' + esc(r.cc == null ? 'Preset' : ccName(r.cc)) + '</span><b class="hx-mono">' + (r.cc == null ? r.v + ' (' + slotLabel(r.v) + ')' : r.v) + '</b><span class="muted">' + ago(now - r.t) + '</span></div>';
    });
    els.obs.innerHTML = h || '<div class="muted small">Nothing received yet. A quiet pedal sends nothing; switch on Send MIDI PC / Send Snapshot CC on the Helix to see its changes.</div>';
    els.obsCount.textContent = o.n + ' message' + (o.n === 1 ? '' : 's') + ' received · ' + o.clock + ' clock ticks';
  }
  function blink(led) { if (!led) return; led.classList.add('lit'); clearTimeout(led._t); led._t = setTimeout(function () { led.classList.remove('lit'); }, 90); }

  // ---- snapshots / blocks / presets (bridge) ------------------------------------------------
  function renameSnapshot(i) {
    var d = deck();
    if (d && typeof d.openSheet === 'function') { d.openSheet('rename', { i: i, name: dev.snapNames[i] || '' }); return; }
    if (!gate()) return;
    var name = null; try { name = window.prompt('Snapshot ' + (i + 1) + ' name', dev.snapNames[i] || ''); } catch (e) { name = null; }
    if (name == null) return;
    E.op('renameSnapshot', { i: i, name: name });
  }
  function saveActive() { E.op('save'); }
  var openKey = '';
  function openBlock() { if (!openKey) return null; var k = openKey.split(':'); return E.defs.blockAt(+k[0], +k[1]); }

  // ---- presets browser ---------------------------------------------------------------
  var curContainer = -2;
  function showContainer(cid) {
    curContainer = cid;
    paintContainers();
    if (!els.plist) return;
    if (!devOnline()) { els.plist.innerHTML = '<div class="muted small">Start the bridge to browse the Helix’s presets.</div>'; return; }
    els.plist.innerHTML = '<div class="muted small">Reading…</div>';
    E.op('listContainer', { cid: cid }).then(function (r) { if (r.ok) paintPresetList(); else els.plist.innerHTML = '<div class="error">' + esc(r.reason) + '</div>'; });
  }

  // ---- monitor: the engine's ledger, filtered and formatted here -------------------------
  var mon = [], monPaused = false, monRaf = 0, MON_CAP = 600;
  function logRow(row) {
    if (!els.mon || monPaused) return;
    if (row.src === 'midi' && !g('monMidi', true)) return;
    if (row.src === 'net' && !g('monNet', true)) return;
    var text = typeof row.data === 'string' ? row.data : (g('monHex', false) ? hex(row.data) : midiText(row.data));
    mon.push({ t: row.t, src: row.src, dir: row.dir, text: text });
    if (mon.length > MON_CAP) mon.splice(0, mon.length - MON_CAP);
    if (!monRaf) monRaf = requestAnimationFrame(paintMon);
  }
  function midiText(b) {
    var s = b[0] & 0xF0, ch = (b[0] & 15) + 1;
    if (b[0] === 0xF0) return 'SysEx ' + b.length + ' B ' + hex(b.slice(0, 12)) + (b.length > 12 ? ' …' : '');
    if (b[0] >= 0xF8) return { 0xF8: 'Clock', 0xFA: 'Start', 0xFB: 'Continue', 0xFC: 'Stop', 0xFE: 'Active sensing' }[b[0]] || ('System ' + hex(b));
    if (s === 0xB0) return 'ch' + ch + ' CC ' + b[1] + ' = ' + b[2];
    if (s === 0xC0) return 'ch' + ch + ' Program ' + b[1] + ' (' + slotLabel(b[1]) + ')';
    if (s === 0x90 || s === 0x80) return 'ch' + ch + ' Note ' + (s === 0x90 && b[2] ? 'on ' : 'off ') + b[1] + ' v' + b[2];
    if (s === 0xE0) return 'ch' + ch + ' Bend ' + (((b[2] << 7) | b[1]) - 8192);
    return hex(b);
  }
  function paintMon() {
    monRaf = 0; if (!els.mon) return;
    var h = '';
    for (var i = Math.max(0, mon.length - 200); i < mon.length; i++) {
      var r = mon[i];
      h += '<div class="hx-mrow ' + r.src + ' ' + r.dir + '"><span class="hx-mt">' + r.t.toTimeString().slice(0, 8) + '</span><span class="hx-msrc">' + (r.src === 'midi' ? 'MIDI' : 'NET') + ' ' + (r.dir === 'in' ? '←' : '→') + '</span><span class="hx-mtx">' + esc(r.text) + '</span></div>';
    }
    els.mon.innerHTML = h || '<div class="muted small">nothing yet</div>';
    els.mon.scrollTop = els.mon.scrollHeight;
  }

  // ---- knobs (SVG dial, drag / wheel when focused / arrows / double-tap resets) ------
  var ARC0 = -135, ARC1 = 135, dragging = false;
  function arcPath(v, max) {
    max = max || 127;
    var a = (ARC0 + (ARC1 - ARC0) * v / max) * Math.PI / 180, a0 = ARC0 * Math.PI / 180, r = 25;
    var x0 = 32 + r * Math.sin(a0), y0 = 32 - r * Math.cos(a0), x1 = 32 + r * Math.sin(a), y1 = 32 - r * Math.cos(a), big = (a - a0) > Math.PI ? 1 : 0;
    return v <= 0 ? '' : 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + big + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
  }
  function knobHTML(i) {
    var v = kv(i), a = (ARC0 + (ARC1 - ARC0) * v / 127) * Math.PI / 180;
    return '<div class="hx-knob" role="slider" tabindex="0" data-k="' + i + '" aria-label="Knob ' + (i + 1) + '" aria-valuemin="0" aria-valuemax="127" aria-valuenow="' + v + '" title="Knob ' + (i + 1) + ' · CC ' + (CC.KNOB1 + i) + ' — drag up/down, arrows, double-tap = 64">' +
      '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="hx-ktrack" d="' + arcPath(127) + '"/><path class="hx-karc" d="' + arcPath(v) + '"/><line class="hx-kptr" x1="32" y1="32" x2="' + (32 + 17 * Math.sin(a)).toFixed(2) + '" y2="' + (32 - 17 * Math.cos(a)).toFixed(2) + '"/></svg>' +
      '<b class="hx-kv">' + v + '</b><span class="hx-kn">Knob ' + (i + 1) + '</span><small class="muted">CC ' + (CC.KNOB1 + i) + '</small></div>';
  }
  function kv(i) { var v = st.kv[i]; return typeof v === 'number' ? v : 64; }
  function paintKnob(i) {
    var el = $('.hx-knob[data-k="' + i + '"]'); if (!el) return;
    var v = kv(i), a = (ARC0 + (ARC1 - ARC0) * v / 127) * Math.PI / 180;
    el.setAttribute('aria-valuenow', v);
    el.querySelector('.hx-karc').setAttribute('d', arcPath(v));
    var p = el.querySelector('.hx-kptr'); p.setAttribute('x2', (32 + 17 * Math.sin(a)).toFixed(2)); p.setAttribute('y2', (32 - 17 * Math.cos(a)).toFixed(2));
    el.querySelector('.hx-kv').textContent = v;
  }
  // the engine sends and, on success, emits 'value' knob:i -> paintKnob; a refusal leaves the dial where it was
  function turn(i, v) { v = clamp(Math.round(v), 0, 127); if (v === kv(i)) return; E.op('knob', { i: i, v: v }); }
  function bindKnobs(wrap) {
    wrap.addEventListener('pointerdown', function (e) {
      var k = e.target.closest('.hx-knob'); if (!k) return;
      if (!hasMidiOut() || !gate()) { k.focus(); e.preventDefault(); if (!hasMidiOut()) toast('No MIDI output to the Helix'); return; }
      var i = +k.getAttribute('data-k'), y0 = e.clientY, v0 = kv(i), moved = false;
      k.focus(); try { k.setPointerCapture(e.pointerId); } catch (er) { /* synthetic */ } dragging = true;
      function mv(ev) { var d = y0 - ev.clientY; if (Math.abs(d) > 2) moved = true; turn(i, v0 + d * (ev.shiftKey ? 0.2 : 0.7)); }
      function up() { k.removeEventListener('pointermove', mv); k.removeEventListener('pointerup', up); k.removeEventListener('pointercancel', up); dragging = false; if (!moved) { var now = performance.now(); if (k._tap && now - k._tap < 350) { turn(i, 64); k._tap = 0; } else k._tap = now; } }
      k.addEventListener('pointermove', mv); k.addEventListener('pointerup', up); k.addEventListener('pointercancel', up);
      e.preventDefault();
    });
    wrap.addEventListener('wheel', function (e) { var k = e.target.closest('.hx-knob'); if (!k || document.activeElement !== k) return; e.preventDefault(); turn(+k.getAttribute('data-k'), kv(+k.getAttribute('data-k')) + (e.deltaY < 0 ? 2 : -2)); }, { passive: false });
    wrap.addEventListener('keydown', function (e) {
      var k = e.target.closest('.hx-knob'); if (!k) return;
      var i = +k.getAttribute('data-k'), d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
      if (d) { turn(i, kv(i) + d * (e.shiftKey ? 10 : 1)); e.preventDefault(); } else if (e.key === 'Home') turn(i, 0); else if (e.key === 'End') turn(i, 127);
    });
  }

  // ---- paint -----------------------------------------------------------------------------
  function paintStatus() {
    if (!els.midiSt) return;
    var s = E.state(), rm = s.routes.midi, rn = s.routes.net, mtxt, mcls = '';
    if (rm.mode === 'web' && (rm.out || rm.inp)) { mtxt = (rm.out || rm.inp) + (rm.out && rm.inp ? ' (in + out)' : rm.out ? ' (out only)' : ' (in only)'); mcls = 'ok'; }
    else if (rm.mode === 'app') { mtxt = 'via soundLAB’s MIDI output (Settings › MIDI)'; mcls = 'ok'; }
    else if (rm.err) { mtxt = rm.err; mcls = 'bad'; }
    else if (rm.requested) { mtxt = 'no Helix Stadium MIDI port listed'; mcls = 'bad'; }
    else mtxt = 'not connected';
    els.midiSt.textContent = mtxt; els.midiSt.className = 'hx-st ' + mcls;
    var btxt, bcls = '';
    if (!rn.want && !rn.open) btxt = 'off';
    else if (!rn.open) btxt = 'connecting to ' + rn.url + ' … (run: node tools/helix-bridge.js)';
    else if (rn.status === 'online') { btxt = 'Helix at ' + (rn.ip || rn.host) + (rn.defs ? '' : ' · no model names (tools/helix-defs.json missing)'); bcls = 'ok'; }
    else { btxt = 'bridge up, looking for the Helix (' + (rn.host || '?') + ')'; bcls = 'bad'; }
    els.brSt.textContent = btxt; els.brSt.className = 'hx-st ' + bcls;
    els.brBtn.textContent = rn.want ? 'Disconnect' : 'Connect bridge';
    var d = dev.info, act = dev.active, h = '';
    if (d) h += '<b>' + esc(d.name) + '</b>' + (d.fw ? ' · fw ' + esc(d.fw) + (d.build ? ' (' + esc(d.build) + ')' : '') : '') + (d.serial ? ' · ' + esc(d.serial) : '');
    if (act) h += (h ? '<br>' : '') + 'Active: <b>' + esc(slotLabel(act.posi)) + ' ' + esc(act.name) + '</b>';
    els.devSt.innerHTML = h || '<span class="muted">device details appear once the bridge finds the Helix</span>';
    $$('.hx-needbr').forEach(function (el) { el.classList.toggle('off', !devOnline()); });
    paintArm();
  }
  function paintPreset() {
    if (!els.prog) return;
    els.prog.value = st.prog + 1; els.progLab.textContent = addrLabel(st.setlist, st.prog);
    if (els.setlist && String(els.setlist.value) !== String(st.setlist)) els.setlist.value = String(st.setlist);
    if (els.snapafter) els.snapafter.value = st.snapAfter == null ? '' : String(st.snapAfter);
    if (els.bytes) els.bytes.textContent = 'sends ' + E.recallBytes(st.setlist, st.prog, st.snapAfter).map(hex).join(' / ');
  }
  function paintSetlistSelect() {
    if (!els.setlist) return;
    var h = '<option value="0">Factory presets</option>';
    for (var i = 1; i <= 4; i++) h += '<option value="' + i + '">User presets ' + i + ' (' + ((i - 1) * 32 + 1) + 'A–' + (i * 32) + 'D)</option>';
    var names = dev.setlists.map(function (s) { return s.name; });
    for (var k = 5; k <= 36; k++) h += '<option value="' + k + '">Setlist ' + (k - 4) + (names[k - 5] ? ' — ' + esc(names[k - 5]) : '') + '</option>';
    els.setlist.innerHTML = h; els.setlist.value = String(st.setlist);
  }
  function paintSnaps() {
    if (!els.snaps) return;
    var h = '';
    for (var i = 0; i < 8; i++) h += '<button type="button" class="hx-snap' + (i === st.snap ? ' active' : '') + '" data-snap="' + i + '" title="Snapshot ' + (i + 1) + ' · CC69 = ' + i + (devOnline() ? ' · long-press to rename' : '') + '"><b>' + (i + 1) + '</b><span>' + esc(dev.snapNames[i] || '') + '</span></button>';
    els.snaps.innerHTML = h;
  }
  function paintExp() { if (els.exp1) { els.exp1.value = st.exp[0]; els.exp2.value = st.exp[1]; els.exp1v.textContent = st.exp[0]; els.exp2v.textContent = st.exp[1]; } }
  function paintXYAt(x, y) { if (!els.xyDot) return; els.xyDot.style.left = (x / 127 * 100) + '%'; els.xyDot.style.bottom = (y / 127 * 100) + '%'; els.xyv.textContent = x + ' × ' + y; }
  function paintXY() { paintXYAt(st.xy[0], st.xy[1]); }
  function paintFsmode() { $$('#hx-fsmode button').forEach(function (x) { x.classList.toggle('active', +x.getAttribute('data-fs') === st.fsmode); }); }
  function paintTuner() {
    if (!els.tuner) return;
    var v = dev.tuner;
    if (v == null || v < 0 || br.tele !== 'tuner') { els.tunerNote.textContent = '—'; els.tunerCents.textContent = br.tele === 'tuner' ? 'play a note' : 'off'; els.tunerBar.style.left = '50%'; els.tunerBar.className = 'hx-tbar'; return; }
    var n = Math.round(v), cents = Math.round((v - n) * 100);
    els.tunerNote.textContent = NOTES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
    els.tunerCents.textContent = (cents > 0 ? '+' : '') + cents + ' ¢';
    els.tunerBar.style.left = (50 + clamp(cents, -50, 50)) + '%';
    els.tunerBar.className = 'hx-tbar' + (Math.abs(cents) <= 3 ? ' ok' : Math.abs(cents) <= 10 ? ' near' : '');
  }
  function paintBlocks() {
    if (!els.blocks) return;
    if (!devOnline()) { els.blocks.innerHTML = '<div class="muted small">Start <code>node tools/helix-bridge.js</code> on this computer (the Helix on the same network) to see and edit the preset’s blocks here.</div>'; els.params.innerHTML = ''; return; }
    if (!dev.blocks.length) { els.blocks.innerHTML = '<div class="muted small">Reading the edit buffer…</div>'; return; }
    var h = '', path = -1;
    dev.blocks.forEach(function (b) {
      if (b.path !== path) { path = b.path; h += '<div class="hx-path">Path ' + (path + 1) + '</div>'; }
      var open = openKey === b.path + ':' + b.slot;
      h += '<div class="hx-block' + (b.enabled ? '' : ' byp') + (open ? ' open' : '') + '" data-b="' + b.path + ':' + b.slot + '">' +
        '<button type="button" class="hx-bypass" data-byp="' + b.path + ':' + b.slot + '" title="Bypass / enable" aria-pressed="' + b.enabled + '"></button>' +
        '<span class="hx-cat">' + esc(E.defs.catLabel(b)) + '</span><span class="hx-bname">' + esc(E.defs.modelLabel(b.mid)) + '</span><small class="muted">' + esc(E.defs.modelName(b.mid)) + ' · slot ' + b.slot + '</small></div>';
    });
    els.blocks.innerHTML = h;
    paintParams();
  }
  var fmt = E.defs.fmt, paramDefs = E.defs.paramDefs;
  function paintParams() {
    if (!els.params) return;
    var b = openBlock();
    if (!b) { els.params.innerHTML = '<div class="muted small">Tap a block to edit its parameters live. Changes go straight to the pedal (nothing is saved until you press Save).</div>'; return; }
    var ps = paramDefs(b), h = '<div class="hx-phead"><b>' + esc(E.defs.modelLabel(b.mid)) + '</b> <span class="muted small">' + esc(E.defs.modelName(b.mid)) + ' · path ' + (b.path + 1) + ' slot ' + b.slot + '</span></div>';
    if (!ps.length) h += '<div class="muted small">No parameter table for this model' + (br.status && !br.status.defs ? ' (tools/helix-defs.json not loaded by the bridge)' : '') + '.</div>';
    ps.forEach(function (p) {
      var v = b.vals[p.id], has = typeof p.min === 'number' && typeof p.max === 'number' && p.max > p.min;
      h += '<div class="hx-param" data-pid="' + p.id + '"><span class="hx-pname">' + esc(p.name) + '</span>';
      if (p.type === 'b') h += '<button type="button" class="hx-ptog' + (v ? ' on' : '') + '" data-ptog="' + p.id + '" aria-pressed="' + !!v + '">' + fmt(!!v, p) + '</button>';
      else if (has) h += '<input type="range" data-prange="' + p.id + '" min="' + p.min + '" max="' + p.max + '" step="' + (p.type === 'i' ? 1 : (p.max - p.min) / 200) + '" value="' + (typeof v === 'number' ? v : (p.def || p.min)) + '"><b class="hx-pv">' + fmt(v, p) + '</b>';
      else h += '<input type="number" data-pnum="' + p.id + '" step="any" value="' + (typeof v === 'number' ? v : '') + '"><b class="hx-pv">' + fmt(v, p) + '</b>';
      h += '</div>';
    });
    els.params.innerHTML = h;
  }
  function paintParamValue(pid, value) {
    var row = els.params && els.params.querySelector('.hx-param[data-pid="' + pid + '"]'); if (!row) return;
    var b = openBlock(), p = b && paramDefs(b).filter(function (x) { return x.id === pid; })[0];
    var r = row.querySelector('input'); if (r && typeof value === 'number') r.value = value;
    var t = row.querySelector('.hx-ptog'); if (t) { t.classList.toggle('on', !!value); t.textContent = value ? 'On' : 'Off'; t.setAttribute('aria-pressed', String(!!value)); }
    var pv = row.querySelector('.hx-pv'); if (pv) pv.textContent = fmt(value, p);
  }
  function paintContainers() {
    if (!els.conts) return;
    var h = '<button type="button" class="chip' + (curContainer === -1 ? ' active' : '') + '" data-cont="-1">Factory</button><button type="button" class="chip' + (curContainer === -2 ? ' active' : '') + '" data-cont="-2">User</button>';
    dev.setlists.forEach(function (s) { h += '<button type="button" class="chip' + (curContainer === s.cid_ ? ' active' : '') + '" data-cont="' + s.cid_ + '">' + esc(s.name || ('setlist ' + s.cid_)) + '</button>'; });
    els.conts.innerHTML = h;
  }
  function paintPresetList() {
    if (!els.plist || view !== 'presets') return;
    var items = dev.lists[curContainer]; if (!items) return;
    var q = (els.pfilter.value || '').toLowerCase(), h = '', n = 0;
    items.forEach(function (it) {
      if (q && String(it.name || '').toLowerCase().indexOf(q) === -1) return;
      n++;
      var act = dev.active && (dev.active.cid === it.cid_ || (it.rcid !== undefined && dev.active.cid === it.rcid));
      h += '<div class="hx-prow"><button type="button" class="hx-preset' + (act ? ' active' : '') + '" data-cid="' + it.cid_ + '"><span class="hx-slot">' + esc(slotLabel(it.posi)) + '</span><span class="hx-pname2">' + esc(it.name || '(unnamed)') + '</span>' + (it.blck > 0 ? '<small class="muted">' + it.blck + ' blocks</small>' : '') + '</button>' +
        (E.addrOf(it) ? '<button type="button" class="hx-star" data-star="' + it.cid_ + '" title="Save as a favorite (its MIDI address)" aria-label="Save ' + esc(it.name || 'preset') + ' as a favorite">★</button>' : '') + '</div>';
    });
    els.plist.innerHTML = h || '<div class="muted small">' + (items.length ? 'No match.' : 'Empty.') + '</div>';
    els.pcount.textContent = n + ' preset' + (n === 1 ? '' : 's');
  }
  function stomps() { var l = g('ccs', []); return Array.isArray(l) ? l : []; }
  function paintStomps() {
    if (!els.stomps) return;
    var l = stomps(), h = '';
    l.forEach(function (s, i) {
      h += '<div class="hx-stomp" data-scc="' + s.cc + '"><span class="hx-sname">' + esc(s.name) + '<small class="muted"> CC ' + s.cc + '</small></span>';
      if (s.kind === 'knob') h += '<input type="range" min="0" max="127" value="' + (s.v || 0) + '" data-sknob="' + i + '"><b>' + (s.v || 0) + '</b>';
      else h += '<button type="button" class="hx-ptog' + (s.v ? ' on' : '') + '" data-stog="' + i + '">' + (s.v ? 'On' : 'Off') + '</button>';
      h += '<button type="button" class="btn sm" data-sdel="' + i + '" title="Remove">×</button></div>';
    });
    els.stomps.innerHTML = h || '<div class="muted small">None yet. Add the CC numbers you assigned on the Helix (Bypass/Control screen, channel ' + chCtl() + ').</div>';
  }
  // a stomp's CC went out (or a value event named it): store + paint in place, never rebuilding a slider mid-drag
  function stompSent(n, v) {
    var l = stomps(), hit = false;
    l.forEach(function (s) { if (s.cc === n) { s.v = v; hit = true; } });
    if (!hit) return;
    set('ccs', l);
    $$('.hx-stomp[data-scc="' + n + '"]').forEach(function (row) {
      var t = row.querySelector('.hx-ptog'); if (t) { t.classList.toggle('on', !!v); t.textContent = v ? 'On' : 'Off'; }
      var r = row.querySelector('input[type=range]'); if (r) { if (+r.value !== v) r.value = v; r.nextElementSibling.textContent = v; }
    });
  }
  function paintMixer() {
    if (!els.mixer) return;
    var lay = g('mixLayer', 'qtr'), m = g('mix', {}), vals = m[lay] || {}, h = '';
    MIX.forEach(function (r) {
      var lv = vals['l' + r[1]], pn = vals['p' + r[1]], mu = vals['m' + r[1]], so = vals['s' + r[1]];
      h += '<div class="hx-mixrow"><span class="hx-mixn">' + esc(r[0]) + '</span>' +
        '<label>Lvl <input type="range" min="0" max="127" value="' + (typeof lv === 'number' ? lv : 100) + '" data-mix="l' + r[1] + '"></label>' +
        '<label>Pan <input type="range" min="0" max="127" value="' + (typeof pn === 'number' ? pn : 64) + '" data-mix="p' + r[1] + '"></label>' +
        '<button type="button" class="hx-ptog' + (mu ? ' on' : '') + '" data-mixt="m' + r[1] + '">M</button><button type="button" class="hx-ptog solo' + (so ? ' on' : '') + '" data-mixt="s' + r[1] + '">S</button></div>';
    });
    els.mixer.innerHTML = h;
  }
  function showView(name) {
    view = name; set('view', name);
    $$('.hx-view').forEach(function (v) { v.hidden = v.getAttribute('data-view') !== name; });
    $$('#hx-views button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === name); });
    if (name === 'presets') { if (devOnline() && !dev.setlists.length) E.op('loadSetlists'); showContainer(curContainer); }
    if (name === 'blocks') paintBlocks();
    if (name === 'monitor') paintMon();
    E.routes.net.telemetry(name === 'rig' && g('netTuner', false) ? 'tuner' : 'off');
  }

  // ---- the engine's events -> paint ---------------------------------------------------------
  function subscribe() {
    E.on('state', function (d) {
      var w = d && d.what;
      if (w === 'arm' || w === 'safe') { paintArm(); if (d.flash) flashArm(); }
      else if (w === 'routes' || w === 'fw') paintStatus();
      else if (w === 'favs') paintFavs();
      else if (w === 'address') paintPreset();
      else if (w === 'mode') applyMode();
    });
    E.on('dev', function (d) {
      var w = d && d.what;
      if (w === 'status' || w === 'info') paintStatus();
      else if (w === 'online') { paintStatus(); if (view === 'presets' && !dev.setlists.length) E.op('loadSetlists'); }
      else if (w === 'active') { paintStatus(); paintPresetList(); }
      else if (w === 'eb') { paintSnaps(); paintBlocks(); }
      else if (w === 'defs' || w === 'block') paintBlocks();
      else if (w === 'snapname') paintSnaps();
      else if (w === 'param') { var b = openBlock(); if (b && b.path === d.path && b.slot === d.slot && !dragging) paintParamValue(d.pid, d.v); }
      else if (w === 'lists') { if (view === 'presets') showContainer(curContainer); }
      else if (w === 'setlists') { paintSetlistSelect(); paintContainers(); }
      else if (w === 'tuner') paintTuner();
    });
    E.on('value', function (d) {
      var k = d.key, i = k.indexOf(':'), head = i < 0 ? k : k.slice(0, i), tail = i < 0 ? '' : k.slice(i + 1);
      if (head === 'setlist' || head === 'prog') paintPreset();
      else if (head === 'snap') paintSnaps();
      else if (head === 'knob') paintKnob(+tail);
      else if (head === 'exp') paintExp();
      else if (head === 'xy') paintXY();
      else if (head === 'fsmode') paintFsmode();
      else if (head === 'stomp' && d.src === 'sent') stompSent(+tail, d.v);
      else if (head === 'param' && d.src === 'sent') { var p = tail.split(':'), b = openBlock(); if (b && b.path === +p[0] && b.slot === +p[1]) paintParamValue(+p[2], d.v); }
    });
    E.on('ledger', function (d) { logRow(d.row); });
    E.on('io', function (d) { blink(d.dir === 'in' ? els.ledIn : els.ledOut); });
    E.on('observed', paintObs);
    E.on('toast', function (d) { toast(d.msg); });
  }

  // ---- DOM ---------------------------------------------------------------------------------
  function build() {
    root.innerHTML =
      '<div class="hx-wrap">' +
      '<div class="card hx-head" id="hx-head"><h2>Helix Stadium</h2>' +
        '<div class="hx-strip"><span class="hx-led in" id="hx-ledin"></span><span class="hx-led out" id="hx-ledout"></span><span class="hx-lab">MIDI</span><span class="hx-st" id="hx-midist">…</span><button type="button" class="btn sm" id="hx-midibtn">Connect MIDI</button></div>' +
        '<div class="hx-strip"><span class="hx-lab">Bridge</span><span class="hx-st" id="hx-brst">off</span><input type="text" id="hx-brurl" value="' + esc(E.routes.net.url()) + '" size="22" aria-label="Bridge address"><button type="button" class="btn sm" id="hx-brbtn">Connect bridge</button></div>' +
        '<div class="hx-strip hx-armrow" id="hx-armrow"><span class="hx-armst" id="hx-armst">DISARMED</span><span class="hx-dest" id="hx-dest"></span><button type="button" class="btn sm" id="hx-arm" aria-pressed="false">Arm output</button><label class="chip" title="Off = every control sends the moment you touch it"><input type="checkbox" id="hx-safe"> safe mode</label></div>' +
        '<div class="hx-armmsg muted small" id="hx-armmsg" role="status" aria-live="polite"></div>' +
        '<div class="hx-dev" id="hx-devst"></div>' +
      '</div>' +

      // PERFORM face: mounted by js/helix-deck.js (window.SLHelixDeck) when present
      '<div id="hxd-top"></div><div id="hxd-perform"></div>' +

      // EDIT face: the six views
      '<div id="hxd-edit">' +
      '<div class="seg hx-views" id="hx-views"><button type="button" data-view="rig">Rig</button><button type="button" data-view="blocks">Blocks</button><button type="button" data-view="presets">Presets</button><button type="button" data-view="looper">Looper &amp; Song</button><button type="button" data-view="mixer">Mixer</button><button type="button" data-view="monitor">Monitor</button></div>' +

      // RIG: preset / snapshots / knobs / pedals / buttons
      '<div class="hx-view" data-view="rig">' +
        '<div class="card"><h2>Preset</h2><div class="row hx-row">' +
          '<label>Setlist <select id="hx-setlist"></select></label>' +
          '<label>Preset <input type="number" id="hx-prog" min="1" max="128" value="1"> <b id="hx-proglab" class="hx-mono"></b></label>' +
          '<button type="button" class="btn" id="hx-prev" title="CC9 = 12">◀ Prev</button><button type="button" class="btn" id="hx-next" title="CC9 = 13">Next ▶</button>' +
          '<button type="button" class="btn primary" id="hx-go" title="CC32 then Program Change">Recall</button>' +
          '<button type="button" class="btn hx-needbr" id="hx-save" title="/SavePresetWithCID on the active preset">Save edit buffer</button></div>' +
          '<div class="row hx-row"><label>then snapshot <select id="hx-snapafter"><option value="">keep</option>' + [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return '<option value="' + i + '">' + (i + 1) + '</option>'; }).join('') + '</select></label><span class="hx-bytes hx-mono" id="hx-bytes" aria-label="MIDI bytes Recall sends"></span></div>' +
          '<div class="muted small">Over MIDI: CC32 picks the setlist (0 Factory, 1–4 User banks, 5+ your setlists), the Program Change the preset. The Helix reports its own changes here when <i>Global Settings › MIDI › Send MIDI PC / Send Snapshot CC</i> are on. Loading a preset discards unsaved edits on the pedal.</div>' +
          '<h3 class="hx-h3">Favorites</h3><div class="row hx-row"><input type="text" id="hx-favname" maxlength="40" placeholder="name this address" autocomplete="off" aria-label="Favorite name"><button type="button" class="btn sm" id="hx-favsave">★ Save favorite</button><button type="button" class="btn sm hx-needbr" id="hx-favactive" title="Fill the address from the preset loaded on the Helix">★ Active preset</button><button type="button" class="btn sm" id="hx-favcancel" hidden>Cancel edit</button></div>' +
          '<ul class="hx-favs" id="hx-favs"></ul></div>' +
        '<div class="card"><h2>Snapshots</h2><div class="hx-snaps" id="hx-snaps"></div><div class="row hx-row"><button type="button" class="btn sm" id="hx-snprev" title="CC69 = 9">◀ Previous</button><button type="button" class="btn sm" id="hx-snnext" title="CC69 = 8">Next ▶</button><span class="muted small">Keys 1–8 recall, [ ] step presets, T taps tempo.</span></div></div>' +
        '<div class="card"><h2>Knobs</h2><div class="hx-knobs" id="hx-knobs">' + [0, 1, 2, 3, 4, 5, 6, 7].map(knobHTML).join('') + '</div><div class="muted small">The eight top-panel knobs (CC38–45): what each turns depends on the screen the Helix is showing.</div></div>' +
        '<div class="card"><h2>Pedals &amp; XY</h2><div class="hx-peds">' +
          '<label class="hx-exp">EXP 1 <input type="range" id="hx-exp1" min="0" max="127" value="0"><b id="hx-exp1v">0</b></label>' +
          '<label class="hx-exp">EXP 2 <input type="range" id="hx-exp2" min="0" max="127" value="0"><b id="hx-exp2v">0</b></label>' +
          '<button type="button" class="btn sm" id="hx-toe" title="CC36 toggles the toe switch">Toe switch</button>' +
          '<div class="hx-xy" id="hx-xy" title="XY controller: CC7 across, CC8 up"><div class="hx-xydot" id="hx-xydot"></div><span class="hx-xyv" id="hx-xyv"></span></div></div></div>' +
        '<div class="card"><h2>Tempo &amp; tuner</h2><div class="row hx-row">' +
          '<button type="button" class="btn" id="hx-tap" title="CC64">Tap</button><button type="button" class="btn" id="hx-taps" title="four taps at soundLAB’s tempo">Send app tempo</button>' +
          '<label class="chip" id="hx-follow"><input type="checkbox"> follow tempo changes</label>' +
          '<button type="button" class="btn" id="hx-tunerbtn" title="CC9 = 34">Tuner on/off</button>' +
          '<label class="chip hx-needbr" id="hx-nettuner"><input type="checkbox"> network tuner</label></div>' +
          '<div class="hx-tuner" id="hx-tuner"><b id="hx-tnote">—</b><div class="hx-ttrack"><i class="hx-tbar" id="hx-tbar"></i></div><span id="hx-tcents" class="muted">off</span></div></div>' +
        '<div class="card"><h2>Footswitch mode &amp; buttons</h2><div class="seg" id="hx-fsmode">' + FSMODES.map(function (n, i) { return '<button type="button" data-fs="' + i + '" title="CC37 = ' + i + '">' + n + '</button>'; }).join('') + '</div>' +
          '<div class="hx-btns" id="hx-btns">' + BUTTONS.map(function (b) { return '<button type="button" class="chip" data-btn="' + b[0] + '" title="CC9 = ' + b[0] + '">' + esc(b[1]) + '</button>'; }).join('') + '</div></div>' +
        '<div class="card"><h2>Stomps (Bypass/Control CCs, channel <span id="hx-ctlch"></span>)</h2><div id="hx-stomps"></div><div class="row hx-row"><input type="text" id="hx-sname" placeholder="name" size="10"><input type="number" id="hx-scc" placeholder="CC" min="0" max="127" style="width:5em"><select id="hx-skind"><option value="toggle">switch</option><option value="knob">knob</option></select><button type="button" class="btn sm" id="hx-sadd">Add</button></div></div>' +
        '<div class="card"><h2>MIDI channels</h2><div class="row hx-row"><label>Global <input type="number" id="hx-ch" min="1" max="16" value="' + chGlobal() + '"></label><label>Bypass/Control <input type="number" id="hx-ctlchin" min="1" max="16" value="' + chCtl() + '"></label><span class="muted small">Match Global Settings › MIDI on the Helix (defaults 1 and 2).</span></div></div>' +
      '</div>' +

      // BLOCKS
      '<div class="hx-view" data-view="blocks" hidden><div class="card"><h2>Edit buffer</h2><div class="row hx-row"><button type="button" class="btn sm hx-needbr" id="hx-ebrefresh">Re-read</button><button type="button" class="btn sm hx-needbr" id="hx-save2">Save edit buffer</button><span class="muted small">Live view of the loaded preset. Tap the dot to bypass a block, the name to edit it.</span></div>' +
        '<div class="hx-blocks" id="hx-blocks"></div></div><div class="card"><h2>Parameters</h2><div class="hx-params" id="hx-params"></div></div></div>' +

      // PRESETS
      '<div class="hx-view" data-view="presets" hidden><div class="card"><h2>Presets on the Helix</h2><div class="hx-conts" id="hx-conts"></div><div class="row hx-row"><input type="search" id="hx-pfilter" placeholder="filter by name"><span class="muted small" id="hx-pcount"></span><button type="button" class="btn sm" id="hx-prefresh">Re-read</button></div><div class="hx-plist" id="hx-plist"></div></div></div>' +

      // LOOPER & SONG
      '<div class="hx-view" data-view="looper" hidden>' +
        '<div class="card"><h2>Looper</h2><div class="hx-btns">' +
          '<button type="button" class="btn" data-lp="58:127">● Record</button><button type="button" class="btn" data-lp="58:0">Overdub</button><button type="button" class="btn" data-lp="59:127">▶ Play</button><button type="button" class="btn" data-lp="59:0">■ Stop</button><button type="button" class="btn" data-lp="60:127">Play once</button>' +
          '<button type="button" class="btn" data-lp="53:127">Undo / Redo</button><button type="button" class="btn" data-lp="54:127">½ speed</button><button type="button" class="btn" data-lp="54:0">Full speed</button><button type="button" class="btn" data-lp="55:127">Reverse</button><button type="button" class="btn" data-lp="55:0">Forward</button>' +
          '<button type="button" class="btn" data-lp="62:127">Looper block on</button><button type="button" class="btn" data-lp="62:0">Looper block off</button><button type="button" class="btn danger" data-lp="52:127">Clear</button></div></div>' +
        '<div class="card"><h2>Song transport</h2><div class="row hx-row">' +
          '<label>Playlist <input type="number" id="hx-playlist" min="0" max="127" value="0"></label><button type="button" class="btn sm" id="hx-playlistgo" title="CC63">Open</button>' +
          '<label>Song <input type="number" id="hx-song" min="1" max="128" value="1"></label><button type="button" class="btn sm" id="hx-songgo" title="CC10">Cue</button>' +
          '<label>Marker <input type="number" id="hx-marker" min="0" max="127" value="0"></label><button type="button" class="btn sm" id="hx-markergo" title="CC46">Cue</button></div>' +
          '<div class="hx-btns"><button type="button" class="btn" data-lp="51:127">▶‖ Play / Pause</button><button type="button" class="btn" data-lp="47:127">⏮ Return to zero</button><button type="button" class="btn" data-lp="49:0">◀ Song</button><button type="button" class="btn" data-lp="49:127">Song ▶</button><button type="button" class="btn" data-lp="50:0">◀ Marker</button><button type="button" class="btn" data-lp="50:127">Marker ▶</button><button type="button" class="btn" data-lp="48:127">Cycle on/off</button><button type="button" class="btn" data-lp="48:0">Cycle between markers</button></div>' +
          '<div class="muted small">Playlist 0 = Song Library. The Song List’s MIDI Recall info on the Helix shows each song’s numbers.</div></div>' +
      '</div>' +

      // MIXER
      '<div class="hx-view" data-view="mixer" hidden><div class="card"><h2>Matrix mixer</h2><div class="row hx-row"><div class="seg" id="hx-layers">' + LAYERS.map(function (l) { return '<button type="button" data-layer="' + l[0] + '">' + l[1] + ' (ch ' + l[2] + ')</button>'; }).join('') + '</div><button type="button" class="btn sm" id="hx-clearsolo" title="CC103">Clear solos</button></div>' +
        '<div class="hx-mixer" id="hx-mixer"></div><div class="muted small">Level 0–127, pan 64 = centre; M/S toggle on the Helix (values ≥ 64). Each output layer listens on its own MIDI channel (Matrix MIDI Ch options).</div></div></div>' +

      // MONITOR
      '<div class="hx-view" data-view="monitor" hidden><div class="card"><h2>Monitor</h2><div class="row hx-row">' +
        '<label class="chip"><input type="checkbox" id="hx-monmidi"> MIDI</label><label class="chip"><input type="checkbox" id="hx-monnet"> network</label><label class="chip"><input type="checkbox" id="hx-monhex"> hex</label>' +
        '<button type="button" class="btn sm" id="hx-monpause">Pause</button><button type="button" class="btn sm" id="hx-monclear">Clear</button><button type="button" class="btn sm" id="hx-idreq" title="F0 7E 7F 06 01 F7">Identity request</button></div>' +
        '<div class="hx-mon" id="hx-mon"></div>' +
        '<div class="row hx-row"><input type="text" id="hx-rawmidi" placeholder="raw MIDI hex, e.g. B0 45 02" size="24"><button type="button" class="btn sm" id="hx-rawsend">Send MIDI</button></div>' +
        '<div class="row hx-row"><input type="text" id="hx-oscaddr" placeholder="/ProductInfoGet" size="22"><input type="text" id="hx-oscargs" placeholder=\'args JSON, e.g. [["i",-2]] (request id is added)\' size="34"><button type="button" class="btn sm hx-needbr" id="hx-oscsend">Send to Helix</button></div></div>' +
        '<div class="card"><h2>Observed from the pedal</h2><div class="muted small" id="hx-obscount"></div><div class="hx-obs" id="hx-obs"></div>' +
          '<div class="row hx-row"><button type="button" class="btn sm" id="hx-obsclear">Clear</button><span class="muted small">The newest value of each message the Helix sent over MIDI. An echo is not proof a command was applied; the network read-back is.</span></div></div></div>' +
      '</div>' + // /#hxd-edit
      '<div class="hx-toast" id="hx-toast" hidden></div></div>';

    ['ledin', 'ledout', 'midist', 'midibtn', 'brst', 'brurl', 'brbtn', 'devst', 'setlist', 'prog', 'proglab', 'snaps', 'exp1', 'exp2', 'exp1v', 'exp2v', 'xy', 'xydot', 'xyv', 'tuner', 'tnote', 'tbar', 'tcents', 'blocks', 'params', 'conts', 'pfilter', 'pcount', 'plist', 'stomps', 'mixer', 'mon', 'toast',
      'armrow', 'armst', 'dest', 'arm', 'safe', 'armmsg', 'snapafter', 'bytes', 'favname', 'favsave', 'favactive', 'favcancel', 'favs', 'obs', 'obscount'].forEach(function (k) { els[k] = $('#hx-' + k); });
    els.ledIn = els.ledin; els.ledOut = els.ledout; els.midiSt = els.midist; els.brSt = els.brst; els.brBtn = els.brbtn; els.devSt = els.devst; els.progLab = els.proglab;
    els.armRow = els.armrow; els.armSt = els.armst; els.armMsg = els.armmsg; els.favName = els.favname; els.obsCount = els.obscount;
    els.tunerNote = els.tnote; els.tunerBar = els.tbar; els.tunerCents = els.tcents;
    els.edit = $('#hxd-edit'); els.top = $('#hxd-top'); els.perform = $('#hxd-perform');
    $('#hx-ctlch').textContent = chCtl();
    $('#hx-monmidi').checked = g('monMidi', true); $('#hx-monnet').checked = g('monNet', true); $('#hx-monhex').checked = g('monHex', false);
    $('#hx-follow input').checked = !!g('followTempo', false); $('#hx-nettuner input').checked = !!g('netTuner', false);

    // header
    $('#hx-midibtn').addEventListener('click', function () { E.routes.midi.connect(false); });
    $('#hx-brbtn').addEventListener('click', function () { if (br.want) E.routes.net.disconnect(); else { E.routes.net.setUrl(els.brurl.value); E.routes.net.connect(); } });
    els.brurl.addEventListener('change', function () { E.routes.net.setUrl(els.brurl.value); });
    $('#hx-views').addEventListener('click', function (e) { var b = e.target.closest('button[data-view]'); if (b) showView(b.getAttribute('data-view')); });
    // safety
    els.arm.addEventListener('click', function () { var s = E.state(); E.arm(!s.on, s.on ? 'Output disarmed.' : undefined); });
    els.safe.addEventListener('change', function () {
      if (els.safe.checked) { E.setSafe(true); return; }
      els.safe.checked = true; // stays on until confirmed
      confirmThen({ title: 'Safe mode off', body: 'Turn safe mode off? Every control will send to the Helix the moment you touch it.', ok: 'Turn off', danger: true }, function () { E.setSafe(false); });
    });
    // preset (the address being composed; the engine keeps it with the live state)
    els.setlist.addEventListener('change', function () { E.address({ setlist: parseInt(els.setlist.value, 10) || 0 }); });
    els.prog.addEventListener('change', function () { E.address({ prog: clamp((parseInt(els.prog.value, 10) || 1) - 1, 0, 127) }); });
    els.snapafter.addEventListener('change', function () { E.address({ snapAfter: els.snapafter.value === '' ? null : int(els.snapafter.value, 0, 7) }); });
    // favorites
    els.favsave.addEventListener('click', favFromForm);
    els.favactive.addEventListener('click', favActive);
    els.favcancel.addEventListener('click', function () { favEdit = ''; els.favName.value = ''; paintFavEdit(); });
    els.favs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-fav]'); if (!b) return;
      var id = b.getAttribute('data-fav'), act = b.getAttribute('data-act'), f = E.favById(id);
      if (!f) return;
      if (act === 'recall') E.recallFav(id);
      else if (act === 'edit') editFav(f);
      else if (act === 'del') { E.removeFav(id); if (favEdit === id) { favEdit = ''; paintFavEdit(); } }
    });
    $('#hx-go').addEventListener('click', function () { var a = E.address(); E.op('recallPreset', { bank: a.setlist, prog: a.prog, snap: a.snapAfter }); });
    $('#hx-prev').addEventListener('click', function () { E.op('prevPreset'); });
    $('#hx-next').addEventListener('click', function () { E.op('nextPreset'); });
    $('#hx-save').addEventListener('click', saveActive); $('#hx-save2').addEventListener('click', saveActive);
    // snapshots (tap = recall, long-press = rename)
    var pressT = 0, pressed = null;
    els.snaps.addEventListener('pointerdown', function (e) { var b = e.target.closest('[data-snap]'); if (!b) return; pressed = b; clearTimeout(pressT); pressT = setTimeout(function () { pressed = null; if (devOnline()) renameSnapshot(+b.getAttribute('data-snap')); }, 650); });
    els.snaps.addEventListener('pointerup', function (e) { clearTimeout(pressT); var b = e.target.closest('[data-snap]'); if (b && pressed === b) E.op('snapshot', { i: +b.getAttribute('data-snap') }); pressed = null; });
    els.snaps.addEventListener('pointercancel', function () { clearTimeout(pressT); pressed = null; });
    $('#hx-snprev').addEventListener('click', function () { E.op('snapPrev'); });
    $('#hx-snnext').addEventListener('click', function () { E.op('snapNext'); });
    bindKnobs($('#hx-knobs'));
    // pedals (a slider the gate refuses snaps back: the screen never shows a value that was not sent)
    els.exp1.addEventListener('input', function () { E.op('exp', { i: 0, v: +els.exp1.value }).then(function (r) { if (!r.ok) paintExp(); }); });
    els.exp2.addEventListener('input', function () { E.op('exp', { i: 1, v: +els.exp2.value }).then(function (r) { if (!r.ok) paintExp(); }); });
    $('#hx-toe').addEventListener('click', function () { E.op('toe'); });
    (function () {
      var xy = els.xy, lastT = 0, cur = null;
      function at(e) {
        var r = xy.getBoundingClientRect(), x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
        var nx = Math.round(x * 127), ny = Math.round(y * 127), now = performance.now();
        if (nx !== cur[0] || ny !== cur[1]) { cur = [nx, ny]; paintXYAt(nx, ny); if (now - lastT > 25) { lastT = now; E.op('xy', { x: nx, y: ny }); } }
      }
      xy.addEventListener('pointerdown', function (e) {
        if (!hasMidiOut()) { toast('No MIDI output to the Helix'); return; }
        if (!gate()) return;
        try { xy.setPointerCapture(e.pointerId); } catch (er) { /* synthetic */ }
        cur = [st.xy[0], st.xy[1]]; at(e);
        function mv(ev) { at(ev); }
        function up() { xy.removeEventListener('pointermove', mv); xy.removeEventListener('pointerup', up); E.op('xy', { x: cur[0], y: cur[1] }).then(paintXY); }
        xy.addEventListener('pointermove', mv); xy.addEventListener('pointerup', up); e.preventDefault();
      });
    })();
    // tempo / tuner
    $('#hx-tap').addEventListener('click', function () { E.op('tap'); });
    $('#hx-taps').addEventListener('click', function () { var bpm = parseInt(A.store.get('met.bpm', 120), 10) || 120; E.op('tapTempo', { bpm: bpm }); toast('Tapping at ' + (A.store.get('met.bpm', 120)) + ' bpm'); });
    $('#hx-follow input').addEventListener('change', function (e) { set('followTempo', e.target.checked); });
    $('#hx-tunerbtn').addEventListener('click', function () { E.op('tuner'); });
    $('#hx-nettuner input').addEventListener('change', function (e) { set('netTuner', e.target.checked); E.routes.net.telemetry(e.target.checked ? 'tuner' : 'off'); paintTuner(); });
    // footswitch mode / buttons
    $('#hx-fsmode').addEventListener('click', function (e) { var b = e.target.closest('[data-fs]'); if (b) E.op('fsmode', { m: +b.getAttribute('data-fs') }); });
    $('#hx-btns').addEventListener('click', function (e) { var b = e.target.closest('[data-btn]'); if (b) E.op('button', { n: +b.getAttribute('data-btn') }); });
    // stomps (your Bypass/Control CCs on the control channel)
    $('#hx-sadd').addEventListener('click', function () {
      var n = $('#hx-sname').value.trim(), c = parseInt($('#hx-scc').value, 10);
      if (isNaN(c) || c < 0 || c > 127) return toast('CC 0–127');
      var l = stomps(); l.push({ name: n || ('CC ' + c), cc: c, kind: $('#hx-skind').value, v: 0 }); set('ccs', l); $('#hx-sname').value = ''; $('#hx-scc').value = ''; paintStomps();
    });
    els.stomps.addEventListener('click', function (e) {
      var t = e.target.closest('[data-stog]'), d = e.target.closest('[data-sdel]'), l = stomps();
      if (t) { var i = +t.getAttribute('data-stog'); if (l[i]) E.op('stomp', { cc: l[i].cc, v: l[i].v ? 0 : 127 }); }
      if (d) { l.splice(+d.getAttribute('data-sdel'), 1); set('ccs', l); paintStomps(); }
    });
    els.stomps.addEventListener('input', function (e) { var r = e.target.closest('[data-sknob]'); if (!r) return; var l = stomps(), s = l[+r.getAttribute('data-sknob')]; if (!s) return; E.op('stomp', { cc: s.cc, v: +r.value }).then(function (res) { if (!res.ok) { r.value = s.v || 0; r.nextElementSibling.textContent = r.value; } }); });
    $('#hx-ch').addEventListener('change', function (e) { set('ch', clamp(parseInt(e.target.value, 10) || 1, 1, 16)); E.disarm('Global channel changed. Match it on the Helix, then arm again.'); paintPreset(); paintArm(); });
    $('#hx-ctlchin').addEventListener('change', function (e) { set('ctlCh', clamp(parseInt(e.target.value, 10) || 2, 1, 16)); $('#hx-ctlch').textContent = chCtl(); paintStomps(); });
    // blocks
    $('#hx-ebrefresh').addEventListener('click', function () { E.op('readEditBuffer'); E.op('readSnapshot'); E.op('readActive'); });
    els.blocks.addEventListener('click', function (e) {
      var byp = e.target.closest('[data-byp]'), bl = e.target.closest('[data-b]');
      if (byp) { var k = byp.getAttribute('data-byp').split(':'), b = E.defs.blockAt(+k[0], +k[1]); if (b) E.op('bypass', { path: b.path, slot: b.slot, on: !b.enabled }); return; }
      if (bl) { var key = bl.getAttribute('data-b'); openKey = openKey === key ? '' : key; paintBlocks(); }
    });
    els.params.addEventListener('input', function (e) {
      var r = e.target.closest('[data-prange],[data-pnum]'), b = openBlock(); if (!r || !b) return;
      var pid = +(r.getAttribute('data-prange') || r.getAttribute('data-pnum')), v = parseFloat(r.value); if (isNaN(v)) return;
      E.op('param', { path: b.path, slot: b.slot, pid: pid, v: v }).then(function (res) { if (!res.ok) paintParamValue(pid, b.vals[pid]); });
    });
    els.params.addEventListener('pointerdown', function () { dragging = true; });
    els.params.addEventListener('pointerup', function () { dragging = false; });
    els.params.addEventListener('click', function (e) {
      var t = e.target.closest('[data-ptog]'), b = openBlock(); if (!t || !b) return;
      var pid = +t.getAttribute('data-ptog');
      E.op('param', { path: b.path, slot: b.slot, pid: pid, v: b.vals[pid] ? 0 : 1 });
    });
    // presets
    els.conts.addEventListener('click', function (e) { var c = e.target.closest('[data-cont]'); if (c) showContainer(parseInt(c.getAttribute('data-cont'), 10)); });
    els.pfilter.addEventListener('input', paintPresetList);
    $('#hx-prefresh').addEventListener('click', function () { E.op('loadSetlists', { force: true }).then(function () { showContainer(curContainer); }); });
    els.plist.addEventListener('click', function (e) {
      var s = e.target.closest('[data-star]'), b = s || e.target.closest('[data-cid]'); if (!b) return;
      var cid = +b.getAttribute(s ? 'data-star' : 'data-cid'), it = (dev.lists[curContainer] || []).filter(function (x) { return x.cid_ === cid; })[0];
      if (it) { if (s) favFromItem(it); else E.op('load', { cid: it.cid_, name: it.name }); }
    });
    // looper & song (CC 52-62 = looper, the rest song transport)
    root.addEventListener('click', function (e) { var b = e.target.closest('[data-lp]'); if (!b) return; var p = b.getAttribute('data-lp').split(':'), n = +p[0]; E.op(n >= 52 && n <= 62 ? 'looper' : 'song', { cc: n, val: +p[1] }); });
    $('#hx-playlistgo').addEventListener('click', function () { E.op('songPlaylist', { n: +$('#hx-playlist').value || 0 }); });
    $('#hx-songgo').addEventListener('click', function () { E.op('songCue', { n: (+$('#hx-song').value || 1) - 1 }); });
    $('#hx-markergo').addEventListener('click', function () { E.op('songMarker', { n: +$('#hx-marker').value || 0 }); });
    // mixer
    $('#hx-layers').addEventListener('click', function (e) { var b = e.target.closest('[data-layer]'); if (!b) return; set('mixLayer', b.getAttribute('data-layer')); paintLayerSeg(); paintMixer(); });
    $('#hx-clearsolo').addEventListener('click', function () { E.op('clearSolo', { layer: g('mixLayer', 'qtr') }).then(function (r) { if (!r.ok) return; var m = g('mix', {}), lay = g('mixLayer', 'qtr'); if (m[lay]) Object.keys(m[lay]).forEach(function (k) { if (k[0] === 's') m[lay][k] = 0; }); set('mix', m); paintMixer(); }); });
    els.mixer.addEventListener('input', function (e) { var r = e.target.closest('[data-mix]'); if (!r) return; var k = r.getAttribute('data-mix'); E.op('mix', { layer: g('mixLayer', 'qtr'), cc: mixCC(k), v: +r.value }).then(function (res) { if (!res.ok) r.value = mixVal(k); else r._sent = true; }); });
    els.mixer.addEventListener('change', function (e) { var r = e.target.closest('[data-mix]'); if (!r || !r._sent) return; r._sent = false; mixStore(r.getAttribute('data-mix'), +r.value); });
    els.mixer.addEventListener('click', function (e) { var t = e.target.closest('[data-mixt]'); if (!t) return; var k = t.getAttribute('data-mixt'), m = g('mix', {}), lay = g('mixLayer', 'qtr'), on = !((m[lay] || {})[k]); E.op('mix', { layer: lay, cc: mixCC(k), v: 127 }).then(function (r) { if (!r.ok) return; mixStore(k, on ? 1 : 0); paintMixer(); }); });
    // monitor
    $('#hx-monmidi').addEventListener('change', function (e) { set('monMidi', e.target.checked); });
    $('#hx-monnet').addEventListener('change', function (e) { set('monNet', e.target.checked); });
    $('#hx-monhex').addEventListener('change', function (e) { set('monHex', e.target.checked); });
    $('#hx-monpause').addEventListener('click', function (e) { monPaused = !monPaused; e.target.textContent = monPaused ? 'Resume' : 'Pause'; });
    $('#hx-monclear').addEventListener('click', function () { mon = []; paintMon(); });
    $('#hx-obsclear').addEventListener('click', E.clearObserved);
    $('#hx-idreq').addEventListener('click', function () { E.op('rawMidi', { bytes: [0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7] }); });
    $('#hx-rawsend').addEventListener('click', function () {
      var s = $('#hx-rawmidi').value.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, ' ').trim().split(/\s+/).filter(Boolean).map(function (h) { return parseInt(h, 16); });
      if (!s.length || s.some(isNaN)) return toast('Hex bytes, e.g. B0 45 02');
      E.op('rawMidi', { bytes: s });
    });
    $('#hx-oscsend').addEventListener('click', function () {
      var addr = $('#hx-oscaddr').value.trim(), args = [];
      if (!addr) return toast('Address needed, e.g. /ProductInfoGet');
      try { if ($('#hx-oscargs').value.trim()) args = JSON.parse($('#hx-oscargs').value); } catch (e) { return toast('Args must be JSON like [["i",-2],["s","key"]]'); }
      E.op('rawOsc', { addr: addr, args: args }).then(function (r) { if (r.ok) toast(r.frames.length + ' reply frame' + (r.frames.length === 1 ? '' : 's') + ' (see monitor)'); else if (r.reason !== 'disarmed') toast(r.reason); });
    });

    paintSetlistSelect(); paintPreset(); paintSnaps(); paintExp(); paintXY(); paintStomps(); paintLayerSeg(); paintMixer(); paintTuner(); paintFavs(); paintFavEdit(); paintObs(); paintStatus(); paintBlocks();
    showView(view);
    applyMode();
    // the Perform face
    var d = deck();
    if (d && typeof d.init === 'function') { try { d.init(els.top, els.perform, E); } catch (e) { console.error('helix deck', e); } }
    applyMode();
  }
  function mixVal(k) { var v = (g('mix', {})[g('mixLayer', 'qtr')] || {})[k]; return typeof v === 'number' ? v : k[0] === 'p' ? 64 : 100; }
  function mixCC(k) { var base = parseInt(k.slice(1), 10); return k[0] === 'l' ? base : k[0] === 'p' ? base + 23 : k[0] === 'm' ? base + 46 : base + 69; }
  function mixStore(k, v) { var m = g('mix', {}), lay = g('mixLayer', 'qtr'); m[lay] = m[lay] || {}; m[lay][k] = v; set('mix', m); }
  function paintLayerSeg() { var lay = g('mixLayer', 'qtr'); $$('#hx-layers button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-layer') === lay); }); }

  A.injectCSS('helix', [
    '.hx-wrap{position:relative}.hx-head h2{margin-bottom:6px}#hxd-edit[hidden]{display:none}#hxd-edit>.hx-views{margin:0 0 10px}',
    '.hx-strip{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0;font-size:13px}.hx-lab{font-weight:700;min-width:48px}.hx-st{flex:1;min-width:120px}.hx-st.ok{color:var(--green)}.hx-st.bad{color:var(--red)}',
    '.hx-led{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--line);transition:background .08s}.hx-led.in.lit{background:var(--accent)}.hx-led.out.lit{background:var(--green)}',
    '.hx-dev{margin:8px 0;font-size:13px;line-height:1.5}.hx-views{margin-top:10px;flex-wrap:wrap}.hx-views button{flex:1 1 auto}',
    '.hx-row{flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}.hx-row label{display:inline-flex;align-items:center;gap:6px;font-size:13px}.hx-row input[type=number]{width:5em}.hx-mono{font-family:ui-monospace,Consolas,Menlo,monospace}',
    '.hx-needbr.off{opacity:.45;pointer-events:none}',
    '.hx-armrow{padding:6px 8px;border-radius:10px;border:1px solid var(--line);background:var(--card2)}.hx-armrow.flash{animation:hxflash .5s 2}@keyframes hxflash{50%{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-glow)}}',
    '.hx-armst{padding:3px 8px;border-radius:6px;border:1px solid var(--line);font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--muted,#999)}.hx-armst.on{color:var(--accent);border-color:var(--accent)}.hx-armst.unsafe{color:var(--red);border-color:var(--red)}',
    '.hx-dest{flex:1;min-width:140px;font-size:12.5px;overflow-wrap:anywhere}.hx-armmsg{min-height:1.2em;margin:2px 0 4px}.hx-bytes{font-size:12px;color:var(--muted,#999);overflow-wrap:anywhere}.hx-h3{margin:14px 0 2px}',
    '.hx-favs{list-style:none;padding:0;margin:4px 0 0;display:flex;flex-direction:column;gap:4px}.hx-fav{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;padding:6px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card2)}.hx-fav>div:first-child{display:grid;gap:2px;min-width:0;overflow-wrap:anywhere}.hx-favact{display:flex;gap:6px}',
    '.hx-prow{display:flex;gap:4px}.hx-prow .hx-preset{flex:1;min-width:0}.hx-star{width:40px;flex:none;border-radius:9px;border:1px solid var(--line);background:var(--card2);color:var(--accent);cursor:pointer;font-size:16px}',
    '.hx-obs{display:flex;flex-direction:column;gap:2px;margin:6px 0;font-size:12.5px}.hx-orow{display:grid;grid-template-columns:100px 1fr 80px 80px;gap:8px;padding:3px 0;border-bottom:1px solid var(--line)}',
    '.hx-snaps{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px}.hx-snap{display:grid;justify-items:center;gap:2px;padding:8px 2px;border-radius:10px;border:1px solid var(--line);background:var(--card2);color:var(--text);cursor:pointer;min-height:54px}.hx-snap b{font:400 22px/1 var(--font-display)}.hx-snap span{font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}.hx-snap.active{background:var(--accent);color:#1c1206;border-color:var(--accent)}',
    '.hx-knobs{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px}.hx-knob{display:grid;justify-items:center;gap:2px;padding:10px 6px 8px;border-radius:12px;background:var(--card2);border:1px solid var(--line);cursor:ns-resize;touch-action:none;user-select:none;outline:none}.hx-knob:focus-visible{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-glow)}.hx-knob svg{width:64px;height:64px}',
    '.hx-ktrack{fill:none;stroke:var(--line);stroke-width:6;stroke-linecap:round}.hx-karc{fill:none;stroke:var(--accent);stroke-width:6;stroke-linecap:round}.hx-kptr{stroke:var(--text);stroke-width:4;stroke-linecap:round}.hx-kv{font:400 24px/1 var(--font-display);font-variant-numeric:tabular-nums}.hx-kn{font-size:12.5px;font-weight:600}.hx-knob small{font-size:11px}',
    '.hx-peds{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:center}.hx-exp{display:flex;align-items:center;gap:8px;font-size:13px}.hx-exp input{flex:1}.hx-exp b{width:2.5em;text-align:right;font-variant-numeric:tabular-nums}',
    '.hx-xy{grid-column:1/-1;position:relative;height:180px;border-radius:12px;border:1px solid var(--line);background:linear-gradient(var(--line) 1px,transparent 1px) 0 0/25% 25%,linear-gradient(90deg,var(--line) 1px,transparent 1px) 0 0/25% 25%,var(--card2);touch-action:none;cursor:crosshair;overflow:hidden}.hx-xydot{position:absolute;width:18px;height:18px;margin:0 0 -9px -9px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--accent-glow)}.hx-xyv{position:absolute;right:8px;top:6px;font-size:12px;color:var(--muted,#999)}',
    '.hx-tuner{display:flex;align-items:center;gap:12px;margin-top:8px}.hx-tuner b{font:400 34px/1 var(--font-display);min-width:2.2em}.hx-ttrack{position:relative;flex:1;height:10px;border-radius:5px;background:var(--card2);border:1px solid var(--line)}.hx-ttrack::before{content:"";position:absolute;left:50%;top:-4px;bottom:-4px;width:2px;background:var(--line)}.hx-tbar{position:absolute;top:-3px;width:6px;height:14px;margin-left:-3px;border-radius:3px;background:var(--red);transition:left .08s}.hx-tbar.near{background:var(--accent)}.hx-tbar.ok{background:var(--green)}',
    '.hx-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
    '.hx-stomp{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)}.hx-sname{flex:1;font-size:13px}.hx-stomp input[type=range]{flex:2}',
    '.hx-ptog{min-width:46px;height:30px;border-radius:8px;border:1px solid var(--line);background:var(--card2);color:var(--text);font-weight:600;cursor:pointer}.hx-ptog.on{background:var(--accent);color:#1c1206;border-color:var(--accent)}.hx-ptog.solo.on{background:var(--green);border-color:var(--green)}',
    '.hx-path{font:400 15px/1 var(--font-display);letter-spacing:.04em;margin:10px 0 4px;color:var(--accent)}.hx-blocks{display:flex;flex-direction:column;gap:4px}',
    '.hx-block{display:grid;grid-template-columns:auto auto 1fr;grid-template-areas:"dot cat name" "dot cat sub";column-gap:10px;align-items:center;padding:6px 10px;border-radius:10px;border:1px solid var(--line);background:var(--card2);cursor:pointer}.hx-block.open{border-color:var(--accent)}.hx-block.byp .hx-bname,.hx-block.byp .hx-cat{opacity:.45}',
    '.hx-bypass{grid-area:dot;width:18px;height:18px;border-radius:50%;border:2px solid var(--accent);background:var(--accent);cursor:pointer;padding:0}.hx-block.byp .hx-bypass{background:transparent}.hx-cat{grid-area:cat;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;min-width:52px;color:var(--muted,#999)}.hx-bname{grid-area:name;font-weight:600;font-size:14px}.hx-block small{grid-area:sub;font-size:11px}',
    '.hx-params{display:flex;flex-direction:column;gap:6px}.hx-phead{margin-bottom:4px}.hx-param{display:grid;grid-template-columns:minmax(90px,.8fr) 2fr 3.5em;gap:10px;align-items:center;font-size:13px}.hx-param input[type=range]{width:100%}.hx-param input[type=number]{width:6em}.hx-pv{text-align:right;font-variant-numeric:tabular-nums}',
    '.hx-conts{display:flex;flex-wrap:wrap;gap:6px}.hx-plist{display:flex;flex-direction:column;gap:3px;max-height:60vh;overflow:auto}.hx-preset{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:9px;border:1px solid var(--line);background:var(--card2);color:var(--text);cursor:pointer;text-align:left}.hx-preset.active{border-color:var(--accent);box-shadow:inset 3px 0 0 var(--accent)}.hx-slot{font-family:ui-monospace,Consolas,Menlo,monospace;font-size:12px;min-width:3em;color:var(--accent)}.hx-pname2{flex:1;font-weight:600}',
    '.hx-mixrow{display:grid;grid-template-columns:minmax(90px,1fr) 2fr 2fr auto auto;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid var(--line);font-size:12.5px}.hx-mixrow label{display:flex;align-items:center;gap:6px}.hx-mixrow input{width:100%}',
    '.hx-mon{height:300px;overflow:auto;background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:6px 8px;font-family:ui-monospace,Consolas,Menlo,monospace;font-size:11.5px}.hx-mrow{display:grid;grid-template-columns:62px 60px 1fr;gap:8px;padding:1px 0}.hx-mt{opacity:.6}.hx-msrc{font-weight:700}.hx-mrow.in .hx-msrc{color:var(--accent)}.hx-mrow.out .hx-msrc{color:var(--green)}.hx-mtx{white-space:pre-wrap;word-break:break-all}',
    '.hx-toast{position:fixed;left:50%;bottom:76px;transform:translateX(-50%);background:var(--text);color:var(--bg,#131114);padding:8px 14px;border-radius:10px;font-size:13px;z-index:50;box-shadow:0 6px 24px rgba(0,0,0,.3)}',
    '@media (max-width:640px){.hx-snaps{grid-template-columns:repeat(4,minmax(0,1fr))}.hx-peds{grid-template-columns:1fr}.hx-mixrow{grid-template-columns:1fr 1fr auto auto}.hx-mixrow label:first-of-type{grid-column:1}.hx-mixn{grid-column:1/-1}}'
  ].join('\n'));

  App.register(ID, {
    init: function (el) {
      root = el;
      E.init(); // listeners only: lifecycle disarms, the app's MIDI state, follow-tempo - nothing connects
      subscribe();
      build();
    },
    onShow: function () {
      // disarmed on every visit (null's model)
      E.arm(false, E.safe() ? 'Output is disarmed. Press Arm before sending anything to the Helix.' : 'Safe mode is off: controls send immediately.');
      visible = true; E.visible(true);
      // the page's own Web MIDI access on the first visit (the boot-time midi:state can
      // already have settled on the app's shared output, which gives no input to listen to)
      // ask for Web MIDI on show only once the user has said yes to MIDI
      // anywhere in the app (midi.wanted, the Hub's rule): a first visit never
      // raises a permission prompt by itself - Connect MIDI does
      if (!E.routes.midi.requested() && A.store.get('midi.wanted', false)) E.routes.midi.connect(true);
      if (g('bridgeAuto', false)) E.routes.net.connect();
      if (devOnline()) E.op('refresh');
      showView(view);
      applyMode();
    },
    onHide: function () { visible = false; E.visible(false); E.routes.net.telemetry('off'); E.disarm('Page closed. Output disarmed.'); },
    onKey: function (e) {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key >= '1' && e.key <= '8') { E.op('snapshot', { i: +e.key - 1 }); e.preventDefault(); }
      else if (e.key === '[') E.op('prevPreset'); else if (e.key === ']') E.op('nextPreset');
      else if (e.key === 't' || e.key === 'T') E.op('tap');
    },
    // Back: the deck's sheet first, then Edit -> Perform, else let the app unwind
    onBack: function () {
      var d = deck();
      if (d && typeof d.onBack === 'function') { try { if (d.onBack()) return true; } catch (e) { /* ok */ } }
      if (d && mode() === 'edit') { mode('perform'); return true; }
      return false;
    }
  });

  window.SLHelix = { builtIn: true, CC: CC, MIX: MIX, cc: I.cc, pc: I.pc, rpc: I.rpc, get dev() { return dev; }, get st() { return st; }, get midi() { return midi; }, get bridge() { return br; }, useEditBuffer: I.useEditBuffer, slotLabel: slotLabel, onMidiIn: I.onMidiIn, showView: showView,
    get armed() { return E.armed(); }, arm: function (on) { E.arm(on !== false); }, favs: E.favs, recallBytes: E.recallBytes, addrOf: E.addrOf, isHelix: E.isHelix, shortName: E.defs.shortName, get obs() { return E.internals().obs; }, get rx() { return E.internals().rx; },
    mode: mode, get deck() { return deck(); }, get routes() { return E.routes; }, get engine() { return E; } };
})();
