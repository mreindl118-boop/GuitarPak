/* soundLAB HELIX STADIUM page ('helix', Guitar group pill "Helix"): read, write
 * and control a Line 6 Helix Stadium / Stadium XL. Built in since 0.82.0; it
 * began as plugins/helix-stadium.js and outgrew the 100 KB plugin cap.
 *
 * NOTHING CONNECTS AT BOOT: init only builds the DOM. Web MIDI is requested on
 * the first visit; the network bridge connects only after the user pressed
 * Connect bridge once (hx.bridgeAuto, default off) and retries only while the
 * page is visible. js/plugins.js skips an old stored copy of the plugin.
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
 * (CC32 + PC + optional snapshot, byte preview, 32 max, saving never sends),
 * the PORT ALLOW-LIST (never MODX / MONTAGE / LUMI / virtual / thru ports, and
 * soundLAB's shared output only when it IS the Helix) and the OBSERVED panel
 * (newest value per CC / PC the pedal sent + counts) come from null's
 * recall profile (branch codex/sl-helix-0780-20261019) and its Stadium Local
 * Control tool (2026-10-22). Safe mode can be switched off (hx.safe false).
 *
 * Store keys hx.* ; DOM/CSS prefix hx-. Test hook: window.SLHelix.
 */
(function () {
  'use strict';

  var A = App, visible = false;
  var ID = 'helix';
  function g(k, d) { return A.store.get('hx.' + k, d); }
  function set(k, v) { A.store.set('hx.' + k, v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function hex(b) { var o = []; for (var i = 0; i < b.length; i++) o.push(('0' + (b[i] & 0xFF).toString(16).toUpperCase()).slice(-2)); return o.join(' '); }
  function $(sel, el) { return (el || root).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || root).querySelectorAll(sel)); }
  function slotLabel(posi) { return posi == null || posi < 0 ? '' : (Math.floor(posi / 4) + 1) + 'ABCD'[posi % 4]; }

  // ---- the Stadium's MIDI map (Helix Stadium manual, "MIDI") ----------------
  var CC = { EXP1: 1, EXP2: 2, XYX: 7, XYY: 8, BTN: 9, SONGCUE: 10, SETLIST: 32, TOE: 36, FSMODE: 37, KNOB1: 38, MARKER: 46, RTZ: 47, CYCLE: 48, SONGPN: 49, MARKPN: 50, PLAY: 51,
    LCLEAR: 52, LUNDO: 53, LSPEED: 54, LDIR: 55, LREC: 58, LPLAY: 59, LONCE: 60, LBLOCK: 62, PLAYLIST: 63, TAP: 64, SNAP: 69, CLEARSOLO: 103 };
  var BUTTONS = [[0, 'Home'], [1, 'Song'], [2, 'Amp'], [3, 'Save'], [4, 'XY'], [5, '‹ Page'], [6, 'Page ›'], [7, 'Matrix ¼"'], [8, 'Matrix XLR'], [9, 'Matrix Phones'], [10, 'Undo'], [11, 'Redo'],
    [14, 'Preset list'], [15, 'Preset info'], [16, 'Info ▲'], [17, 'Info ▼'], [18, 'Zoom +'], [19, 'Zoom −'], [20, 'Preset clip'], [21, 'Stopwatch'], [22, 'Stopwatch reset'], [23, 'Click'], [24, 'Mute all'], [25, 'Focus'], [26, 'Song list'], [27, 'Flag list'], [33, 'Song settings']];
  var FSMODES = ['Stomp A', 'Stomp B', 'Preset', 'Snapshot', 'Combo', 'Unassigned', 'Transport'];
  // Matrix mixer rows: [name, level CC]; pan = +23, mute = +46, solo = +69
  var MIX = [['Home (all paths)', 11], ['Path 1A', 12], ['Path 1B', 13], ['Path 2A', 14], ['Path 2B', 15], ['Song (all tracks)', 16], ['Track 1', 17], ['Track 2', 18], ['Track 3', 19], ['Track 4', 20],
    ['Track 5', 21], ['Track 6', 22], ['Track 7', 23], ['Track 8', 24], ['Click', 25], ['Count in', 26], ['USB in 1/2', 27], ['Bluetooth in', 28], ['Aux in', 29]];
  var LAYERS = [['qtr', '¼" out', 3], ['xlr', 'XLR out', 4], ['pho', 'Phones', 5]];
  var CATS = { 0: 'None', 1: 'Fav', 2: 'Amp', 3: 'Preamp', 5: 'Cab', 6: 'Dist', 7: 'Delay', 8: 'Reverb', 9: 'Mod', 10: 'Dyn', 11: 'EQ', 12: 'Pitch', 13: 'Wah', 14: 'Vol', 15: 'FX loop', 16: 'Looper', 17: 'Input', 18: 'Output', 19: 'Split', 20: 'Merge' };
  var NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  var root = null, els = {}, view = g('view', 'rig');
  var toastT = 0;
  function toast(msg) { if (!els.toast) return; els.toast.textContent = msg; els.toast.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { els.toast.hidden = true; }, 2200); }

  // ---- state ----------------------------------------------------------------------
  var st = { setlist: g('setlist', 1), prog: g('prog', 0), snap: 0, snapAfter: null, kv: g('kv', {}), exp: g('exp', [0, 0]), xy: g('xy', [64, 64]), fsmode: null, lastIn: 0, lastOut: 0 };
  var dev = { info: null, active: null, eb: null, blocks: [], defs: {}, snapNames: [], lists: {}, setlists: [], openBlock: null, alive: 0, tuner: null };

  // ---- MIDI: the Stadium's own port when the browser lists one, else the app's output
  // PORT ALLOW-LIST (null's recall profile): a Helix/Stadium name and never a
  // MODX / MONTAGE / LUMI / ROLI / virtual / loopback / thru port. soundLAB's
  // shared output is used only when IT is the Helix, so Helix CCs can never
  // land on a synth or a LUMI. Checked again before every send.
  var midi = { access: null, inp: null, out: null, mode: 'none', err: '' };
  var NOT_HELIX = /modx|montage|lumi|roli|virtual|loopback|loopmidi|through|thru|midi mapper|wavetable/i;
  function isHelix(p) { var n = p && p.name || ''; return /helix|stadium/i.test(n) && !NOT_HELIX.test(n); }
  function appOk() { return !!(A.midi && A.midi.send && A.midi.hasOutput && isHelix({ name: A.midi.outputName || '' })); }
  function midiPick() {
    var acc = midi.access, inp = null, out = null, was = midi.mode + '|' + (midi.inp && midi.inp.id) + '|' + (midi.out && midi.out.id);
    if (acc) {
      acc.inputs.forEach(function (p) { if (!inp && isHelix(p) && p.state !== 'disconnected') inp = p; });
      acc.outputs.forEach(function (p) { if (!out && isHelix(p) && p.state !== 'disconnected') out = p; });
    }
    if (midi.inp && midi.inp !== inp) { try { midi.inp.removeEventListener('midimessage', onMidiEvent); } catch (e) { /* ok */ } }
    if (inp && inp !== midi.inp) inp.addEventListener('midimessage', onMidiEvent);
    midi.inp = inp; midi.out = out;
    midi.mode = out || inp ? 'web' : appOk() ? 'app' : 'none';
    if (was !== midi.mode + '|' + (inp && inp.id) + '|' + (out && out.id)) { disarm('MIDI destination changed. Check it, then arm again.'); clearObs(); }
    paintStatus();
  }
  function midiConnect(quiet) {
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) { // native backends: only through the app's output, and only if it is the Helix
      if (A.midi && A.midi.enable && !A.midi.ready) A.midi.enable();
      midiPick(); return Promise.resolve();
    }
    if (midi.access) { midiPick(); return Promise.resolve(); }
    return navigator.requestMIDIAccess({ sysex: true }).catch(function () { return navigator.requestMIDIAccess(); }).then(function (acc) {
      midi.access = acc; midi.err = '';
      acc.addEventListener('statechange', midiPick);
      midiPick();
      if (!midi.out && !quiet) toast('No "Helix Stadium MIDI" port listed. Check the USB-C cable and USB MIDI in Global Settings › MIDI.');
    }).catch(function (e) { midi.err = e && e.message || 'MIDI permission refused'; midiPick(); });
  }
  function onMidiEvent(ev) { onMidiIn(Array.prototype.slice.call(ev.data)); }
  function onMidiIn(b) {
    if (!b || !b.length) return;
    st.lastIn = performance.now(); blink(els.ledIn);
    observe(b);
    if (b[0] >= 0xF8) return; // clock / active sensing: counted in Observed, kept out of the monitor
    var s = b[0] & 0xF0, ch = (b[0] & 15) + 1;
    if (ch === chGlobal()) {
      if (s === 0xC0) { st.prog = b[1]; set('prog', st.prog); paintPreset(); }
      else if (s === 0xB0) {
        if (b[1] === CC.SNAP && b[2] <= 7) { st.snap = b[2]; paintSnaps(); }
        else if (b[1] === CC.SETLIST) { st.setlist = b[2]; set('setlist', st.setlist); paintPreset(); }
        else if (b[1] >= CC.KNOB1 && b[1] < CC.KNOB1 + 8) { st.kv[b[1] - CC.KNOB1] = b[2]; set('kv', st.kv); paintKnob(b[1] - CC.KNOB1); }
        else if (b[1] === CC.EXP1 || b[1] === CC.EXP2) { st.exp[b[1] - 1] = b[2]; paintExp(); }
      }
    }
    logRow('midi', 'in', b);
  }
  function hasMidiOut() { return !!((midi.mode === 'web' && midi.out && midi.out.state !== 'disconnected' && isHelix(midi.out)) || (midi.mode === 'app' && appOk())); }
  function tx(b, quiet) {
    if (!hasMidiOut()) { if (!midi.access && midi.mode !== 'app') midiConnect(true); if (!quiet) toast('No MIDI output to the Helix'); return false; }
    if (!gate(quiet)) return false;
    var ok = false;
    if (midi.mode === 'web') { try { midi.out.send(b); ok = true; } catch (e) { ok = false; } if (ok) A.emit('midi:out', { bytes: b, port: midi.out.name || 'Helix' }); }
    else ok = !!A.midi.send(b);
    if (!ok) { disarm('A send failed, so output is disarmed. Check the connection before trying again.'); if (!quiet) toast('MIDI send failed'); return false; }
    st.lastOut = performance.now(); blink(els.ledOut);
    logRow('midi', 'out', b);
    return true;
  }
  function chGlobal() { return clamp(parseInt(g('ch', 1), 10) || 1, 1, 16); }
  function chCtl() { return clamp(parseInt(g('ctlCh', 2), 10) || 2, 1, 16); }
  function cc(n, v, ch, quiet) { return tx([0xB0 | ((ch || chGlobal()) - 1), n & 127, clamp(Math.round(v), 0, 127)], quiet); }
  function pc(n, ch) { return tx([0xC0 | ((ch || chGlobal()) - 1), clamp(Math.round(n), 0, 127)]); }
  function blink(led) { if (!led) return; led.classList.add('lit'); clearTimeout(led._t); led._t = setTimeout(function () { led.classList.remove('lit'); }, 90); }

  // ---- SAFETY (null's model): output starts DISARMED. Arm opens a 90-second
  // window that every command renews. Leaving the page, hiding the app,
  // switching windows, a destination change, a bridge drop or a failed send
  // disarm it. Reads never need arming. Safe mode off (hx.safe false) = armed.
  var ARM_MS = 90000, arm = { on: false, until: 0, t: 0 }, armMsg = '';
  function safe() { return g('safe', true) !== false; }
  function armed() { return !safe() || (arm.on && Date.now() < arm.until); }
  function armTimer() { clearTimeout(arm.t); arm.t = setTimeout(function () { if (arm.on) setArmed(false, 'Disarmed after 90 s without a command.'); }, Math.max(0, arm.until - Date.now())); }
  function setArmed(on, why) { arm.on = !!on; arm.until = on ? Date.now() + ARM_MS : 0; if (on) armTimer(); else clearTimeout(arm.t); if (why) armMsg = why; paintArm(); }
  function disarm(why) { if (arm.on) setArmed(false, why); }
  function gate(quiet) {
    if (!safe()) return true;
    if (arm.on && Date.now() < arm.until) { arm.until = Date.now() + ARM_MS; armTimer(); return true; }
    if (arm.on) setArmed(false, 'Disarmed after 90 s without a command.');
    if (!quiet) { toast('Output is disarmed: press Arm first. Nothing was sent.'); flashArm(); }
    return false;
  }
  function canArm() { return hasMidiOut() || devOnline(); }
  function flashArm() { var r = els.armRow; if (!r) return; r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash'); }
  function destText() {
    var p = [];
    if (midi.mode === 'web' && midi.out) p.push(midi.out.name + ' · ch ' + chGlobal());
    else if (midi.mode === 'app' && appOk()) p.push(A.midi.outputName + ' · ch ' + chGlobal());
    if (devOnline()) p.push('network ' + (br.status.ip || br.status.host));
    return p.length ? '→ ' + p.join(' + ') : 'no destination yet';
  }
  function paintArm() {
    if (!els.arm) return;
    var s = safe(), on = s && arm.on && Date.now() < arm.until;
    els.armSt.textContent = !s ? 'SAFE MODE OFF' : on ? 'ARMED' : 'DISARMED';
    els.armSt.className = 'hx-armst' + (!s ? ' unsafe' : on ? ' on' : '');
    els.arm.hidden = !s;
    els.arm.disabled = !arm.on && !canArm();
    els.arm.textContent = arm.on ? 'Disarm' : 'Arm output';
    els.arm.setAttribute('aria-pressed', String(!!arm.on));
    els.dest.textContent = destText();
    els.armMsg.textContent = armMsg;
    els.safe.checked = s;
  }

  // ---- FAVORITES (null's recall profile): named MIDI addresses = setlist
  // (CC32) + preset (PC) + optional snapshot (CC69), on this device only
  // (hx.favs, 32 max). Saving, editing and removing never send; Recall does.
  // With the bridge up, ★ in Presets and "★ Active preset" fill the address
  // from the Helix's own numbering instead of copying it from its screen.
  var FAV_MAX = 32, favEdit = '';
  function int(v, lo, hi) { if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) v = +v; return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi ? v : null; }
  function favs() {
    var l = g('favs', []); if (!Array.isArray(l)) return [];
    return l.filter(function (f) { return f && typeof f.id === 'string' && typeof f.name === 'string' && f.name.trim() && int(f.bank, 0, 127) !== null && int(f.prog, 0, 127) !== null && (f.snap == null || int(f.snap, 0, 7) !== null); }).slice(0, FAV_MAX);
  }
  function saveFavs(l) { set('favs', l.slice(0, FAV_MAX)); paintFavs(); }
  function addFav(f) {
    var l = favs();
    if (favEdit) { var id = favEdit; l = l.map(function (x) { if (x.id !== id) return x; f.id = id; return f; }); favEdit = ''; }
    else { if (l.length >= FAV_MAX) { toast('32 favorites already: remove one first.'); return false; } f.id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); l.push(f); }
    saveFavs(l); paintFavEdit(); toast('Saved "' + f.name + '" on this device. Nothing sent.'); return true;
  }
  function favFromForm() {
    var name = (els.favName.value || '').trim().slice(0, 40);
    if (!name) { toast('Name the favorite first. Nothing sent.'); els.favName.focus(); return; }
    var f = { name: name, bank: st.setlist, prog: st.prog, snap: st.snapAfter }, old = favEdit && favs().filter(function (x) { return x.id === favEdit; })[0];
    if (old && old.bank === f.bank && old.prog === f.prog && old.cid != null) f.cid = old.cid;
    if (addFav(f)) els.favName.value = '';
  }
  function bankName(b) { return b === 0 ? 'Factory' : b <= 4 ? 'User' : 'Setlist ' + (b - 4); }
  function addrLabel(bank, prog) { return slotLabel(bank >= 1 && bank <= 4 ? (bank - 1) * 128 + prog : prog); }
  function favDetail(f) { return 'CC32 ' + f.bank + ' · PC ' + f.prog + ' = ' + bankName(f.bank) + ' ' + addrLabel(f.bank, f.prog) + (f.snap != null ? ' · then snapshot ' + (f.snap + 1) : ''); }
  // the MIDI address of a listed preset, from the Helix's own numbering
  function addrOf(it) {
    if (!it || typeof it.posi !== 'number') return null;
    if (it.ccid === -1) return it.posi < 128 ? { bank: 0, prog: it.posi } : null;
    if (it.ccid === -2) return { bank: 1 + Math.floor(it.posi / 128), prog: it.posi % 128 };
    var sl = dev.setlists.filter(function (s) { return s.cid_ === it.ccid; })[0];
    return sl && typeof sl.posi === 'number' && it.posi < 128 ? { bank: 5 + sl.posi, prog: it.posi } : null;
  }
  function favFromItem(it) {
    var a = addrOf(it);
    if (!a) return toast('No MIDI address for that preset.');
    addFav({ name: String(it.name || 'preset').slice(0, 40), bank: a.bank, prog: a.prog, snap: null, cid: it.rcid != null ? it.rcid : it.cid_ });
  }
  function favActive() {
    if (!devOnline()) return toast('Start the bridge to read the active preset.');
    function go() { var a = dev.active; if (!a || a.posi == null) return toast('The loaded preset has no saved slot to point at (unsaved edits?).'); favFromItem({ name: a.name, posi: a.posi, ccid: a.ccid, cid_: a.cid }); }
    if (dev.active && dev.active.posi != null) return go();
    function none() { return []; }
    Promise.all([listContainer(-2).catch(none), listContainer(-1).catch(none), loadSetlists()])
      .then(function () { return Promise.all(dev.setlists.map(function (s) { return listContainer(s.cid_).catch(none); })); })
      .then(readActive).then(go);
  }
  function recallBytes(bank, prog, snap) { var c = chGlobal() - 1, o = [[0xB0 | c, 32, bank], [0xC0 | c, prog]]; if (snap != null) o.push([0xB0 | c, 69, snap]); return o; }
  // CC32, PC 30 ms later, the snapshot 300 ms after that (a CC that beats the
  // preset change is ignored by the pedal)
  function sendRecall(bank, prog, snap) {
    if (!hasMidiOut()) { toast('No MIDI output to the Helix'); return false; }
    if (!gate()) return false;
    var b = recallBytes(bank, prog, snap);
    if (!tx(b[0])) return false;
    st.setlist = bank; st.prog = prog; set('setlist', bank); set('prog', prog); paintPreset();
    setTimeout(function () { if (tx(b[1]) && b[2]) setTimeout(function () { if (tx(b[2])) { st.snap = snap; paintSnaps(); } }, 300); }, 30);
    return true;
  }
  function recallFav(f) {
    if (hasMidiOut()) return sendRecall(f.bank, f.prog, f.snap);
    if (devOnline() && f.cid != null) return loadPreset({ cid_: f.cid, name: f.name }, f.snap != null ? function () { rpc('/activateSnapshot', [['i', f.snap]]).catch(function () { /* ok */ }); } : null);
    toast('No MIDI output to the Helix');
  }
  function editFav(f) {
    favEdit = f.id; st.setlist = f.bank; st.prog = f.prog; st.snapAfter = f.snap;
    els.favName.value = f.name; els.snapafter.value = f.snap == null ? '' : String(f.snap);
    paintPreset(); paintFavEdit(); els.favName.focus();
  }
  function paintFavEdit() { if (!els.favsave) return; els.favsave.textContent = favEdit ? '★ Update favorite' : '★ Save favorite'; els.favcancel.hidden = !favEdit; }
  function paintFavs() {
    if (!els.favs) return;
    var h = '';
    favs().forEach(function (f) {
      h += '<li class="hx-fav"><div><b>' + esc(f.name) + '</b><span class="muted small">' + esc(favDetail(f)) + '</span></div><div class="hx-favact">' +
        '<button type="button" class="btn sm primary" data-fav="' + f.id + '" data-act="recall">Recall</button><button type="button" class="btn sm" data-fav="' + f.id + '" data-act="edit">Edit</button>' +
        '<button type="button" class="btn sm" data-fav="' + f.id + '" data-act="del" aria-label="Remove ' + esc(f.name) + '">×</button></div></li>';
    });
    els.favs.innerHTML = h || '<li class="muted small">No favorites yet. Saving one sends nothing.</li>';
  }

  // ---- OBSERVED (null's Stadium Local Control): the newest value of every CC /
  // Program Change the pedal sent, with its time, plus counts. What the Helix
  // SAID - never proof a command landed; the network read-back is that.
  var obs = {}, rx = { n: 0, clock: 0 }, obsT = 0;
  var CC_NAMES = { 1: 'EXP 1', 2: 'EXP 2', 7: 'XY across', 8: 'XY up', 9: 'Button', 32: 'Setlist', 36: 'Toe switch', 37: 'Footswitch mode', 64: 'Tap tempo', 69: 'Snapshot' };
  function ccName(n) { return CC_NAMES[n] || (n >= 38 && n <= 45 ? 'Knob ' + (n - 37) : ''); }
  function observe(b) {
    rx.n++;
    if (b[0] === 0xF8) rx.clock++;
    var s = b[0] & 0xF0, ch = (b[0] & 15) + 1;
    if ((s === 0xB0 && b.length > 2) || (s === 0xC0 && b.length > 1)) {
      var k = 'ch' + ch + (s === 0xB0 ? ' CC ' + b[1] : ' PC');
      obs[k] = { k: k, cc: s === 0xB0 ? b[1] : null, v: s === 0xB0 ? b[2] : b[1], t: Date.now() };
    }
    if (!obsT) obsT = setTimeout(paintObs, 150);
  }
  function clearObs() { obs = {}; rx = { n: 0, clock: 0 }; paintObs(); }
  function ago(ms) { var s = Math.round(ms / 1000); return s < 2 ? 'just now' : s < 60 ? s + ' s ago' : Math.round(s / 60) + ' min ago'; }
  function paintObs() {
    obsT = 0; if (!els.obs) return;
    var now = Date.now(), h = '';
    Object.keys(obs).sort(function (a, b) { return obs[b].t - obs[a].t; }).forEach(function (k) {
      var o = obs[k];
      h += '<div class="hx-orow"><span class="hx-mono">' + esc(k) + '</span><span>' + esc(o.cc == null ? 'Preset' : ccName(o.cc)) + '</span><b class="hx-mono">' + (o.cc == null ? o.v + ' (' + slotLabel(o.v) + ')' : o.v) + '</b><span class="muted">' + ago(now - o.t) + '</span></div>';
    });
    els.obs.innerHTML = h || '<div class="muted small">Nothing received yet. A quiet pedal sends nothing; switch on Send MIDI PC / Send Snapshot CC on the Helix to see its changes.</div>';
    els.obsCount.textContent = rx.n + ' message' + (rx.n === 1 ? '' : 's') + ' received · ' + rx.clock + ' clock ticks';
  }

  // ---- BRIDGE: WebSocket to tools/helix-bridge.js ------------------------------------
  var br = { ws: null, open: false, status: null, rid: 1000, pend: {}, retry: null, want: false, tele: 'off' };
  function brUrl() { return String(g('bridge', 'ws://127.0.0.1:4575')).trim() || 'ws://127.0.0.1:4575'; }
  function brConnect() {
    br.want = true;
    if (br.ws && (br.ws.readyState === 0 || br.ws.readyState === 1)) return;
    if (typeof WebSocket === 'undefined') return;
    var ws;
    try { ws = new WebSocket(brUrl()); } catch (e) { paintStatus(); return brRetry(); }
    br.ws = ws;
    ws.onopen = function () { br.open = true; paintStatus(); brTele(br.tele, true); }; // the reads start once its status says the pedal is reachable
    ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (e) { return; } onBridge(m); };
    ws.onclose = function () { var was = br.open; br.open = false; br.status = null; br.ws = null; if (was) { disarm('The bridge disconnected, so output is disarmed.'); toast('Bridge disconnected'); } paintStatus(); brRetry(); };
    ws.onerror = function () { /* close follows */ };
  }
  function brRetry() { if (!br.want || br.retry || !visible) return; br.retry = setTimeout(function () { br.retry = null; if (br.want && !br.open) brConnect(); }, 4000); }
  function brClose() { br.want = false; if (br.ws) { try { br.ws.close(); } catch (e) { /* ok */ } } br.ws = null; br.open = false; br.status = null; paintStatus(); }
  function brSend(o) { if (!br.open) return false; try { br.ws.send(JSON.stringify(o)); return true; } catch (e) { return false; } }
  function brTele(level, force) { if (level !== br.tele || force) { br.tele = level; brSend({ op: 'telemetry', level: level }); } }
  function devOnline() { return !!(br.open && br.status && br.status.ports && br.status.ports['2002']); }
  // one RPC = one reply correlated by the request id we put first; collect=true
  // keeps gathering frames (chunked listings) until they stop for 300 ms
  function rpc(addr, args, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      if (!devOnline()) return reject(new Error('device not connected'));
      var id = br.rid++;
      var p = br.pend[id] = { all: [], collect: !!opts.collect, resolve: resolve, reject: reject, settle: null, timer: null, addr: addr };
      p.timer = setTimeout(function () { delete br.pend[id]; if (p.all.length) resolve(p.collect ? p.all : p.all[0]); else reject(new Error('no reply to ' + addr)); }, opts.timeout || 5000);
      if (!brSend({ op: 'rpc', addr: addr, args: [['i', id]].concat(args || []) })) { clearTimeout(p.timer); delete br.pend[id]; reject(new Error('bridge send failed')); }
      logRow('net', 'out', addr + ' ' + JSON.stringify((args || []).map(function (a) { return a[1] && a[1].msgpack ? a[1].msgpack : a[1]; })));
    });
  }
  function onBridge(m) {
    if (m.op === 'status') { var wasOn = devOnline(); br.status = m; paintStatus(); if (!wasOn && devOnline()) devRefresh(); return; }
    if (m.op === 'defs') { Object.keys(m.models || {}).forEach(function (k) { dev.defs[k] = m.models[k]; }); paintBlocks(); return; }
    if (m.op === 'error') { logRow('net', 'in', 'bridge error: ' + m.text + (m.addr ? ' (' + m.addr + ')' : '')); toast('Bridge: ' + m.text); return; }
    if (m.op !== 'msg') return;
    if (m.port === 2003) { onTelemetry(m); return; }
    if (m.port === 2002) {
      var id = m.args && m.args[0], p = typeof id === 'number' && br.pend[id];
      if (p) {
        p.all.push(m);
        if (m.addr === '/error') { clearTimeout(p.timer); delete br.pend[id]; p.reject(new Error(String(m.args[2] || 'device error'))); }
        else if (!p.collect) { clearTimeout(p.timer); delete br.pend[id]; p.resolve(m); }
        else { clearTimeout(p.settle); p.settle = setTimeout(function () { clearTimeout(p.timer); delete br.pend[id]; p.resolve(p.all); }, 300); }
      }
      logRow('net', 'in', m.addr + ' ' + argsText(m.args));
      return;
    }
    if (m.port === 2001) onStream(m);
  }
  function argsText(args) {
    return JSON.stringify((args || []).map(function (a) { return a && a.b64 !== undefined ? (a.dec && a.dec.magic ? '<' + a.dec.magic + ' ' + a.size + ' B>' : (a.dec != null ? a.dec : '<blob ' + a.size + ' B>')) : (typeof a === 'number' && !Number.isInteger(a) ? +a.toFixed(4) : a); }));
  }
  function blobOf(args) { for (var i = 0; i < (args || []).length; i++) if (args[i] && args[i].b64 !== undefined) return args[i].dec; return null; }
  var streamT = {};
  function later(key, fn, ms) { clearTimeout(streamT[key]); streamT[key] = setTimeout(fn, ms || 250); }
  // the change stream: what the pedal (or its editor) just did
  function onStream(m) {
    var a = m.args || [];
    if (m.addr === '/heartbeat') { dev.alive = performance.now(); return; }
    logRow('net', 'in', '[2001] ' + m.addr + ' ' + argsText(a));
    if (m.addr === '/setParamValue' && a.length >= 7) { paramEcho(a[2], a[3], a[5], a[6]); return; }
    if (m.addr === '/setBlockEnable' && a.length >= 5) { var bl = blockAt(a[2], a[3]); if (bl) { bl.enabled = !!a[4]; paintBlocks(); } return; }
    if (m.addr === '/setEditBuffer') { var d = blobOf(a); if (d && d.body) { useEditBuffer(d.body); } else later('eb', readEditBuffer, 400); later('active', readActive, 300); return; }
    if (m.addr === '/loadContentRef') { later('active', readActive, 200); later('eb', readEditBuffer, 500); return; }
    if (/snapshot/i.test(m.addr)) { later('snap', readSnapshot, 150); return; }
    if (m.addr === '/setSnapshotName' && a.length >= 4) { dev.snapNames[a[2]] = a[3]; paintSnaps(); return; }
    if (/^\/(addContent|updateContainerContent|removeContent|setContentAttrs)/i.test(m.addr)) { dev.lists = {}; if (view === 'presets') later('list', function () { showContainer(curContainer); }, 400); }
  }
  function onTelemetry(m) {
    if (m.addr !== '/dspEvent' || m.kind !== 'tuner') return;
    var d = blobOf(m.args), v = d && d.vals && d.vals[0];
    dev.tuner = typeof v === 'number' ? v : null;
    paintTuner();
  }

  // ---- device reads -----------------------------------------------------------------
  function devRefresh() {
    if (!devOnline()) return;
    readInfo(); readActive(); readEditBuffer(); readSnapshot();
    if (view === 'presets' && !dev.setlists.length) loadSetlists();
  }
  function readInfo() {
    rpc('/ProductInfoGet').then(function (m) {
      var d = blobOf(m.args) || {}, h = d.host || d, v = h.vers || {};
      dev.info = { name: h.name || 'Helix Stadium', serial: h.snum, fw: v.majo != null ? v.majo + '.' + v.mino + '.' + v.patc : '', build: v.buld, raw: d };
      paintStatus();
    }).catch(function (e) { logRow('net', 'in', 'ProductInfoGet: ' + e.message); });
  }
  function readActive() {
    return rpc('/PropertyValueGet', [['s', 'server.active.preset.id']]).then(function (m) {
      var d = blobOf(m.args), cid = typeof d === 'number' ? d : d && (d.val_ !== undefined ? d.val_ : d.body && d.body.val_);
      if (typeof cid !== 'number') { dev.active = null; paintStatus(); return; }
      return rpc('/GetContentRef', [['i', cid]]).then(function (r) {
        var ref = blobOf(r.args) || {};
        if (!ref.name) { // fw 1.1 answers {} for the loaded buffer's own id: look it up in what we listed
          Object.keys(dev.lists).forEach(function (k) { dev.lists[k].forEach(function (it) { if (it.cid_ === cid || it.rcid === cid) ref = it; }); });
        }
        dev.active = { cid: cid, name: ref.name || ('edit buffer #' + cid + ' (unsaved or unlisted)'), posi: ref.posi, ccid: ref.ccid };
        paintStatus(); paintPresetList();
      });
    }).catch(function (e) { logRow('net', 'in', 'active preset: ' + e.message); });
  }
  function readEditBuffer() {
    rpc('/EditBufferStateGet', [], { timeout: 8000 }).then(function (m) {
      var d = blobOf(m.args);
      if (d && d.body) useEditBuffer(d.body); else toast('Edit buffer: unexpected reply');
    }).catch(function (e) { logRow('net', 'in', 'edit buffer: ' + e.message); });
  }
  function readSnapshot() {
    rpc('/ActiveSnapshotIndexGet').then(function (m) { if (typeof m.args[1] === 'number') { st.snap = m.args[1]; paintSnaps(); } }).catch(function () { /* older firmware */ });
  }
  function useEditBuffer(body) {
    dev.eb = body;
    var cg = body.cg__ || {}, entt = cg.entt || {}, snps = entt.snps;
    if (typeof cg.asnp === 'number') st.snap = cg.asnp;
    dev.snapNames = [];
    // the device lists them 8..1; each carries its own index (si__) and a name only once used
    if (Array.isArray(snps)) snps.forEach(function (sn, i) { var k = sn && typeof sn.si__ === 'number' ? sn.si__ : i; if (k >= 0 && k < 8) dev.snapNames[k] = snapName(sn); });
    var flow = body.sfg_ && body.sfg_.flow, blocks = [], ids = {};
    (Array.isArray(flow) ? flow : []).forEach(function (f, path) {
      var bl = f && f.blks;
      if (!Array.isArray(bl)) return;
      for (var i = 0; i + 1 < bl.length; i += 2) {
        var slot = bl[i], b = bl[i + 1];
        if (typeof slot !== 'number' || !b || typeof b !== 'object') continue;
        var m0 = Array.isArray(b.mdls) && b.mdls[0] || {}, mid = m0.id__;
        if (typeof mid !== 'number') continue;
        var vals = {};
        (m0.parm || []).forEach(function (p) { if (p && typeof p.pid_ === 'number') vals[p.pid_] = p.valu; });
        blocks.push({ path: path, slot: slot, mid: mid, type: b.type, enabled: b.enbl !== 0 && b.enbl !== false, vals: vals });
        if (!dev.defs[mid]) ids[mid] = 1;
      }
    });
    dev.blocks = blocks;
    var need = Object.keys(ids); if (need.length) brSend({ op: 'lookup', models: need.map(Number) });
    paintSnaps(); paintBlocks();
  }
  function snapName(sn) {
    if (typeof sn === 'string') return sn;
    if (!sn || typeof sn !== 'object') return '';
    if (typeof sn.name === 'string') return sn.name;
    var keys = Object.keys(sn);
    for (var i = 0; i < keys.length; i++) if (typeof sn[keys[i]] === 'string') return sn[keys[i]];
    return '';
  }
  // the defs know the category; the block's own type field only separates
  // input (8) / output (9) / everything else (1) on firmware 1.1
  function catLabel(b) {
    var d = dev.defs[b.mid], c = d && d.category;
    if (c) return c === 'Dynamics' ? 'Dyn' : c === 'Distortion' ? 'Dist' : c === 'Modulation' ? 'Mod' : c === 'Pitch/Synth' ? 'Pitch' : c === 'Wah/Filter' ? 'Wah' : c === 'Volume/Pan' ? 'Vol' : c;
    return b.type === 8 ? 'Input' : b.type === 9 ? 'Output' : (CATS[b.type] && b.type > 1 ? CATS[b.type] : 'Block');
  }
  function blockAt(path, slot) { for (var i = 0; i < dev.blocks.length; i++) if (dev.blocks[i].path === path && dev.blocks[i].slot === slot) return dev.blocks[i]; return null; }
  function modelName(mid) { var d = dev.defs[mid]; return d && d.name || ('model ' + mid); }
  // model id string -> a readable name: drop the vendor tag, Mono/Stereo and the
  // category word (whole camel words only), then a repeated family word
  // (ChorusTrinityChorus -> Trinity Chorus); the Volume/Pan family needs names
  var LABEL_FIX = { VolPanVol: 'Volume Pedal', VolPanPan: 'Pan', VolPanGain: 'Gain' };
  var CAT_PREFIX = /^(Preamp|Amp|Cab|Dist|Delay|Reverb|Mod|Dyn|Compressor|EQ|Pitch|Synth|Wah|Filter|VolPan|FXLoop|Looper|Input|Output|Split|Merge|Gate)(?=[A-Z0-9])/;
  var FAMILY = /^(Chorus|Tremolo|Phaser|Flanger|Vibrato|RingModulator|Rotary)(?=[A-Z0-9])/;
  function shortName(name) {
    var vend = /^(HD2|HX2|VIC|Agoura|P35)_/.test(name), s = name.replace(/^(HD2|HX2|VIC|Agoura|P35)_/, '').replace(/_Victoria$/, '').replace(/(Mono|Stereo)$/, '');
    if (LABEL_FIX[s]) return LABEL_FIX[s];
    if (vend) { s = s.replace(CAT_PREFIX, '') || s; s = s.replace(FAMILY, '') || s; }
    s = s.replace(/(\d)_(\d)/g, '$1/$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/(\d?)([a-z])(\d+)(?=[A-Z/_]|$)/g, function (m, d0, l, d) { return d0 && l === 'x' ? m : d0 + l + ' ' + d; }) // Inst1 -> Inst 1, never 1x10
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    return s || name;
  }
  function modelLabel(mid) { var d = dev.defs[mid]; return d && d.name ? shortName(d.name) : 'Model ' + mid; }

  // ---- device writes ----------------------------------------------------------------
  var pendParam = {}, pendT = 0;
  function writeParam(path, slot, pid, value) { // coalesced: the last value per param every 40 ms
    pendParam[path + ':' + slot + ':' + pid] = [path, slot, pid, value];
    if (!pendT) pendT = setTimeout(flushParams, 40);
  }
  function flushParams() {
    pendT = 0;
    Object.keys(pendParam).forEach(function (k) {
      var p = pendParam[k];
      rpc('/ParamValueSet', [['i', p[0]], ['i', p[1]], ['i', 0], ['i', p[2]], ['f', p[3]], ['i', -1]], { timeout: 3000 }).catch(function (e) { toast('Param write: ' + e.message); });
    });
    pendParam = {};
  }
  function paramEcho(path, slot, pid, value) {
    var b = blockAt(path, slot); if (!b) return;
    b.vals[pid] = value;
    if (dev.openBlock === b && !dragging) paintParamValue(pid, value);
  }
  function setEnabled(b, on) {
    if (!gate()) return;
    b.enabled = on; paintBlocks();
    rpc('/BlockEnableSet', [['i', b.path], ['i', b.slot], ['i', on ? 1 : 0]], { timeout: 3000 }).catch(function (e) { toast('Bypass: ' + e.message); });
  }
  function gotoSnapshot(i) {
    if (devOnline()) {
      if (!gate()) return;
      st.snap = i; paintSnaps();
      rpc('/activateSnapshot', [['i', i]], { timeout: 3000 }).then(function () { later('eb', readEditBuffer, 300); }).catch(function () { cc(CC.SNAP, i); });
    } else if (cc(CC.SNAP, i)) { st.snap = i; paintSnaps(); }
  }
  function renameSnapshot(i) {
    if (!gate()) return;
    var name = window.prompt('Snapshot ' + (i + 1) + ' name', dev.snapNames[i] || '');
    if (name == null) return;
    rpc('/SetSnapshotName', [['i', i], ['s', name.slice(0, 16)]]).then(function () { dev.snapNames[i] = name.slice(0, 16); paintSnaps(); toast('Renamed'); }).catch(function (e) { toast('Rename: ' + e.message); });
  }
  function saveActive() {
    if (!dev.active) return toast('No active preset known yet');
    if (!gate()) return;
    if (!window.confirm('Save the edit buffer into "' + dev.active.name + '" on the Helix? This overwrites that preset.')) return;
    rpc('/SavePresetWithCID', [['i', dev.active.cid], ['i', 0], ['i', 0]]).then(function (m) { toast(m.addr === '/status' && m.args[1] === 0 ? 'Saved' : 'Save: device said ' + argsText(m.args)); }).catch(function (e) { toast('Save: ' + e.message); });
  }
  function loadPreset(item, then) {
    if (!devOnline()) return toast('Bridge not connected');
    if (!gate()) return;
    if (!window.confirm('Load "' + (item.name || item.cid_) + '" on the Helix? Unsaved edits to the current preset are lost.')) return;
    rpc('/LoadPresetWithCID', [['i', item.cid_]]).then(function () { toast('Loaded ' + (item.name || item.cid_)); later('active', readActive, 300); later('eb', readEditBuffer, 600); if (then) setTimeout(then, 700); }).catch(function (e) { toast('Load: ' + e.message); });
  }
  // MIDI preset recall from the form: CC32 setlist, the program, the optional snapshot
  function recallMidi() { sendRecall(st.setlist, st.prog, st.snapAfter); }

  // ---- presets browser ---------------------------------------------------------------
  var curContainer = -2;
  function listContainer(cid) {
    if (dev.lists[cid]) return Promise.resolve(dev.lists[cid]);
    return rpc('/GetContainerContents', [['i', cid]], { collect: true, timeout: 8000 }).then(function (frames) {
      var items = [];
      frames.forEach(function (m) { (m.args || []).forEach(function (a) { if (a && Array.isArray(a.dec)) a.dec.forEach(function (x) { if (x && typeof x === 'object' && (x.cid_ !== undefined || x.name)) items.push(x); }); }); });
      items.sort(function (x, y) { return (x.posi || 0) - (y.posi || 0); });
      dev.lists[cid] = items;
      return items;
    });
  }
  function loadSetlists() {
    return listContainer(-5).then(function (items) { dev.setlists = items.filter(function (x) { return x.cctp === 1001 || x.cctp === 1003 || x.type === 1003; }); paintSetlistSelect(); paintContainers(); }).catch(function (e) { logRow('net', 'in', 'setlists: ' + e.message); });
  }
  function showContainer(cid) {
    curContainer = cid;
    paintContainers();
    if (!els.plist) return;
    if (!devOnline()) { els.plist.innerHTML = '<div class="muted small">Start the bridge to browse the Helix’s presets.</div>'; return; }
    els.plist.innerHTML = '<div class="muted small">Reading…</div>';
    listContainer(cid).then(function () { paintPresetList(); }).catch(function (e) { els.plist.innerHTML = '<div class="error">' + esc(e.message) + '</div>'; });
  }

  // ---- monitor --------------------------------------------------------------------------
  var mon = [], monPaused = false, monRaf = 0, MON_CAP = 600;
  function logRow(src, dir, data) {
    if (!els.mon || monPaused) return;
    if (src === 'midi' && !g('monMidi', true)) return;
    if (src === 'net' && !g('monNet', true)) return;
    var text = typeof data === 'string' ? data : (g('monHex', false) ? hex(data) : midiText(data));
    mon.push({ t: new Date(), src: src, dir: dir, text: text });
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

  // ---- tempo helpers --------------------------------------------------------------------
  var tapT = [];
  function sendTaps(bpm, quiet) {
    tapT.forEach(clearTimeout); tapT = [];
    var ms = 60000 / clamp(bpm || 120, 30, 280);
    for (var i = 0; i < 4; i++) tapT.push(setTimeout(function () { cc(CC.TAP, 127, null, quiet); }, Math.round(i * ms)));
  }
  var tempoT = 0; // follow-tempo taps stay quiet when disarmed (the page may be hidden)
  A.on('tempo', function (d) { if (g('followTempo', false) && d && d.bpm) { clearTimeout(tempoT); tempoT = setTimeout(function () { sendTaps(d.bpm, true); }, 600); } });

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
  function turn(i, v) { v = clamp(Math.round(v), 0, 127); if (v === kv(i) || !cc(CC.KNOB1 + i, v)) return; st.kv[i] = v; set('kv', st.kv); paintKnob(i); }
  function bindKnobs(wrap) {
    wrap.addEventListener('pointerdown', function (e) {
      var k = e.target.closest('.hx-knob'); if (!k) return;
      if (!hasMidiOut() || !gate()) { k.focus(); e.preventDefault(); if (!hasMidiOut()) toast('No MIDI output to the Helix'); return; }
      var i = +k.getAttribute('data-k'), y0 = e.clientY, v0 = kv(i), moved = false;
      k.focus(); k.setPointerCapture(e.pointerId); dragging = true;
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
    var mtxt, mcls = '';
    if (midi.mode === 'web' && (midi.out || midi.inp)) { mtxt = (midi.out ? midi.out.name : midi.inp.name) + (midi.out && midi.inp ? ' (in + out)' : midi.out ? ' (out only)' : ' (in only)'); mcls = 'ok'; }
    else if (midi.mode === 'app') { mtxt = 'via soundLAB’s MIDI output (Settings › MIDI)'; mcls = 'ok'; }
    else if (midi.err) { mtxt = midi.err; mcls = 'bad'; }
    else if (midi.access) { mtxt = 'no Helix Stadium MIDI port listed'; mcls = 'bad'; }
    else mtxt = 'not connected';
    els.midiSt.textContent = mtxt; els.midiSt.className = 'hx-st ' + mcls;
    var btxt, bcls = '';
    if (!br.want && !br.open) btxt = 'off';
    else if (!br.open) btxt = 'connecting to ' + brUrl() + ' … (run: node tools/helix-bridge.js)';
    else if (devOnline()) { btxt = 'Helix at ' + (br.status.ip || br.status.host) + (br.status.defs ? '' : ' · no model names (tools/helix-defs.json missing)'); bcls = 'ok'; }
    else { btxt = 'bridge up, looking for the Helix (' + (br.status && br.status.host || '?') + ')'; bcls = 'bad'; }
    els.brSt.textContent = btxt; els.brSt.className = 'hx-st ' + bcls;
    els.brBtn.textContent = br.want ? 'Disconnect' : 'Connect bridge';
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
    if (els.bytes) els.bytes.textContent = 'sends ' + recallBytes(st.setlist, st.prog, st.snapAfter).map(hex).join(' / ');
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
  function paintXY() { if (!els.xyDot) return; els.xyDot.style.left = (st.xy[0] / 127 * 100) + '%'; els.xyDot.style.bottom = (st.xy[1] / 127 * 100) + '%'; els.xyv.textContent = st.xy[0] + ' × ' + st.xy[1]; }
  function paintTuner() {
    if (!els.tuner) return;
    var v = dev.tuner;
    if (v == null || v < 0) { els.tunerNote.textContent = '—'; els.tunerCents.textContent = br.tele === 'tuner' ? 'play a note' : 'off'; els.tunerBar.style.left = '50%'; els.tunerBar.className = 'hx-tbar'; return; }
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
      var open = dev.openBlock === b;
      h += '<div class="hx-block' + (b.enabled ? '' : ' byp') + (open ? ' open' : '') + '" data-b="' + b.path + ':' + b.slot + '">' +
        '<button type="button" class="hx-bypass" data-byp="' + b.path + ':' + b.slot + '" title="Bypass / enable" aria-pressed="' + b.enabled + '"></button>' +
        '<span class="hx-cat">' + esc(catLabel(b)) + '</span><span class="hx-bname">' + esc(modelLabel(b.mid)) + '</span><small class="muted">' + esc(modelName(b.mid)) + ' · slot ' + b.slot + '</small></div>';
    });
    els.blocks.innerHTML = h;
    paintParams();
  }
  function paramDefs(b) {
    var d = dev.defs[b.mid], ps = d && d.params || {}, out = [];
    Object.keys(ps).forEach(function (name) { var p = ps[name]; if (p && typeof p.id === 'number') out.push({ name: name, id: p.id, type: p.type || 'f', min: p.min, max: p.max, def: p.def }); });
    Object.keys(b.vals).forEach(function (pid) { if (!out.some(function (p) { return p.id === +pid; })) out.push({ name: 'param ' + pid, id: +pid, type: typeof b.vals[pid] === 'boolean' ? 'b' : 'f', min: null, max: null }); });
    out.sort(function (x, y) { return x.id - y.id; });
    return out;
  }
  function fmt(v, p) {
    if (typeof v === 'boolean') return v ? 'On' : 'Off';
    if (typeof v !== 'number') return '—';
    if (p && p.type === 'i') return String(Math.round(v));
    if (p && p.type === 'b') return v ? 'On' : 'Off';
    var span = p && typeof p.max === 'number' && typeof p.min === 'number' ? p.max - p.min : 1;
    return span <= 2 ? Math.round(v * 100) + '%' : (Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(2)) + '';
  }
  function paintParams() {
    if (!els.params) return;
    var b = dev.openBlock;
    if (!b) { els.params.innerHTML = '<div class="muted small">Tap a block to edit its parameters live. Changes go straight to the pedal (nothing is saved until you press Save).</div>'; return; }
    var ps = paramDefs(b), h = '<div class="hx-phead"><b>' + esc(modelLabel(b.mid)) + '</b> <span class="muted small">' + esc(modelName(b.mid)) + ' · path ' + (b.path + 1) + ' slot ' + b.slot + '</span></div>';
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
    var b = dev.openBlock, p = paramDefs(b).filter(function (x) { return x.id === pid; })[0];
    var r = row.querySelector('input'); if (r && typeof value === 'number') r.value = value;
    var t = row.querySelector('.hx-ptog'); if (t) { t.classList.toggle('on', !!value); t.textContent = value ? 'On' : 'Off'; }
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
        (addrOf(it) ? '<button type="button" class="hx-star" data-star="' + it.cid_ + '" title="Save as a favorite (its MIDI address)" aria-label="Save ' + esc(it.name || 'preset') + ' as a favorite">★</button>' : '') + '</div>';
    });
    els.plist.innerHTML = h || '<div class="muted small">' + (items.length ? 'No match.' : 'Empty.') + '</div>';
    els.pcount.textContent = n + ' preset' + (n === 1 ? '' : 's');
  }
  function paintStomps() {
    if (!els.stomps) return;
    var l = stomps(), h = '';
    l.forEach(function (s, i) {
      h += '<div class="hx-stomp"><span class="hx-sname">' + esc(s.name) + '<small class="muted"> CC ' + s.cc + '</small></span>';
      if (s.kind === 'knob') h += '<input type="range" min="0" max="127" value="' + (s.v || 0) + '" data-sknob="' + i + '"><b>' + (s.v || 0) + '</b>';
      else h += '<button type="button" class="hx-ptog' + (s.v ? ' on' : '') + '" data-stog="' + i + '">' + (s.v ? 'On' : 'Off') + '</button>';
      h += '<button type="button" class="btn sm" data-sdel="' + i + '" title="Remove">×</button></div>';
    });
    els.stomps.innerHTML = h || '<div class="muted small">None yet. Add the CC numbers you assigned on the Helix (Bypass/Control screen, channel ' + chCtl() + ').</div>';
  }
  function stomps() { var l = g('ccs', []); return Array.isArray(l) ? l : []; }
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
    if (name === 'presets') { if (devOnline() && !dev.setlists.length) loadSetlists(); showContainer(curContainer); }
    if (name === 'blocks') paintBlocks();
    if (name === 'monitor') paintMon();
    brTele(name === 'rig' && g('netTuner', false) ? 'tuner' : 'off');
  }

  // ---- DOM ---------------------------------------------------------------------------------
  function build() {
    root.innerHTML =
      '<div class="hx-wrap">' +
      '<div class="card hx-head"><h2>Helix Stadium</h2>' +
        '<div class="hx-strip"><span class="hx-led in" id="hx-ledin"></span><span class="hx-led out" id="hx-ledout"></span><span class="hx-lab">MIDI</span><span class="hx-st" id="hx-midist">…</span><button type="button" class="btn sm" id="hx-midibtn">Connect MIDI</button></div>' +
        '<div class="hx-strip"><span class="hx-lab">Bridge</span><span class="hx-st" id="hx-brst">off</span><input type="text" id="hx-brurl" value="' + esc(brUrl()) + '" size="22" aria-label="Bridge address"><button type="button" class="btn sm" id="hx-brbtn">Connect bridge</button></div>' +
        '<div class="hx-strip hx-armrow" id="hx-armrow"><span class="hx-armst" id="hx-armst">DISARMED</span><span class="hx-dest" id="hx-dest"></span><button type="button" class="btn sm" id="hx-arm" aria-pressed="false">Arm output</button><label class="chip" title="Off = every control sends the moment you touch it"><input type="checkbox" id="hx-safe"> safe mode</label></div>' +
        '<div class="hx-armmsg muted small" id="hx-armmsg" role="status" aria-live="polite"></div>' +
        '<div class="hx-dev" id="hx-devst"></div>' +
        '<div class="seg hx-views" id="hx-views"><button type="button" data-view="rig">Rig</button><button type="button" data-view="blocks">Blocks</button><button type="button" data-view="presets">Presets</button><button type="button" data-view="looper">Looper &amp; Song</button><button type="button" data-view="mixer">Mixer</button><button type="button" data-view="monitor">Monitor</button></div>' +
      '</div>' +

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
      '<div class="hx-toast" id="hx-toast" hidden></div></div>';

    ['ledin', 'ledout', 'midist', 'midibtn', 'brst', 'brurl', 'brbtn', 'devst', 'setlist', 'prog', 'proglab', 'snaps', 'exp1', 'exp2', 'exp1v', 'exp2v', 'xy', 'xydot', 'xyv', 'tuner', 'tnote', 'tbar', 'tcents', 'blocks', 'params', 'conts', 'pfilter', 'pcount', 'plist', 'stomps', 'mixer', 'mon', 'toast',
      'armrow', 'armst', 'dest', 'arm', 'safe', 'armmsg', 'snapafter', 'bytes', 'favname', 'favsave', 'favactive', 'favcancel', 'favs', 'obs', 'obscount'].forEach(function (k) { els[k] = $('#hx-' + k); });
    els.ledIn = els.ledin; els.ledOut = els.ledout; els.midiSt = els.midist; els.brSt = els.brst; els.brBtn = els.brbtn; els.devSt = els.devst; els.progLab = els.proglab;
    els.armRow = els.armrow; els.armSt = els.armst; els.armMsg = els.armmsg; els.favName = els.favname; els.obsCount = els.obscount;
    els.tunerNote = els.tnote; els.tunerBar = els.tbar; els.tunerCents = els.tcents;
    $('#hx-ctlch').textContent = chCtl();
    $('#hx-monmidi').checked = g('monMidi', true); $('#hx-monnet').checked = g('monNet', true); $('#hx-monhex').checked = g('monHex', false);
    $('#hx-follow input').checked = !!g('followTempo', false); $('#hx-nettuner input').checked = !!g('netTuner', false);

    // header
    $('#hx-midibtn').addEventListener('click', function () { midiConnect(false); });
    $('#hx-brbtn').addEventListener('click', function () { if (br.want) { set('bridgeAuto', false); brClose(); } else { set('bridge', els.brurl.value); set('bridgeAuto', true); brConnect(); } });
    els.brurl.addEventListener('change', function () { set('bridge', els.brurl.value); if (br.want) { brClose(); brConnect(); } });
    $('#hx-views').addEventListener('click', function (e) { var b = e.target.closest('button[data-view]'); if (b) showView(b.getAttribute('data-view')); });
    // safety
    els.arm.addEventListener('click', function () {
      if (arm.on) return setArmed(false, 'Output disarmed.');
      if (!canArm()) { armMsg = 'Nothing to arm yet: connect the Helix over MIDI or start the bridge.'; return paintArm(); }
      setArmed(true, 'Armed. Each command renews 90 s; leaving the page, hiding the app or switching windows disarms.');
    });
    els.safe.addEventListener('change', function () {
      if (!els.safe.checked && !window.confirm('Turn safe mode off? Every control will send to the Helix the moment you touch it.')) { els.safe.checked = true; return; }
      set('safe', els.safe.checked);
      if (els.safe.checked) setArmed(false, 'Safe mode on: output disarmed.'); else { arm.on = false; clearTimeout(arm.t); armMsg = 'Safe mode off: controls send immediately.'; paintArm(); }
    });
    // preset
    els.setlist.addEventListener('change', function () { st.setlist = parseInt(els.setlist.value, 10) || 0; set('setlist', st.setlist); paintPreset(); });
    els.prog.addEventListener('change', function () { st.prog = clamp((parseInt(els.prog.value, 10) || 1) - 1, 0, 127); set('prog', st.prog); paintPreset(); });
    els.snapafter.addEventListener('change', function () { st.snapAfter = els.snapafter.value === '' ? null : int(els.snapafter.value, 0, 7); paintPreset(); });
    // favorites
    els.favsave.addEventListener('click', favFromForm);
    els.favactive.addEventListener('click', favActive);
    els.favcancel.addEventListener('click', function () { favEdit = ''; els.favName.value = ''; paintFavEdit(); });
    els.favs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-fav]'); if (!b) return;
      var id = b.getAttribute('data-fav'), act = b.getAttribute('data-act'), f = favs().filter(function (x) { return x.id === id; })[0];
      if (!f) return;
      if (act === 'recall') recallFav(f);
      else if (act === 'edit') editFav(f);
      else if (act === 'del') { saveFavs(favs().filter(function (x) { return x.id !== id; })); if (favEdit === id) { favEdit = ''; paintFavEdit(); } toast('Removed on this device. Nothing sent.'); }
    });
    $('#hx-go').addEventListener('click', recallMidi);
    $('#hx-prev').addEventListener('click', function () { cc(CC.BTN, 12); });
    $('#hx-next').addEventListener('click', function () { cc(CC.BTN, 13); });
    $('#hx-save').addEventListener('click', saveActive); $('#hx-save2').addEventListener('click', saveActive);
    // snapshots (tap = recall, long-press = rename)
    var pressT = 0, pressed = null;
    els.snaps.addEventListener('pointerdown', function (e) { var b = e.target.closest('[data-snap]'); if (!b) return; pressed = b; clearTimeout(pressT); pressT = setTimeout(function () { pressed = null; if (devOnline()) renameSnapshot(+b.getAttribute('data-snap')); }, 650); });
    els.snaps.addEventListener('pointerup', function (e) { clearTimeout(pressT); var b = e.target.closest('[data-snap]'); if (b && pressed === b) gotoSnapshot(+b.getAttribute('data-snap')); pressed = null; });
    els.snaps.addEventListener('pointercancel', function () { clearTimeout(pressT); pressed = null; });
    $('#hx-snprev').addEventListener('click', function () { if (cc(CC.SNAP, 9)) { st.snap = (st.snap + 7) % 8; paintSnaps(); } });
    $('#hx-snnext').addEventListener('click', function () { if (cc(CC.SNAP, 8)) { st.snap = (st.snap + 1) % 8; paintSnaps(); } });
    bindKnobs($('#hx-knobs'));
    // pedals (a slider the gate refuses snaps back: the screen never shows a value that was not sent)
    els.exp1.addEventListener('input', function () { var v = +els.exp1.value; if (!cc(CC.EXP1, v)) { els.exp1.value = st.exp[0]; return; } st.exp[0] = v; els.exp1v.textContent = v; set('exp', st.exp); });
    els.exp2.addEventListener('input', function () { var v = +els.exp2.value; if (!cc(CC.EXP2, v)) { els.exp2.value = st.exp[1]; return; } st.exp[1] = v; els.exp2v.textContent = v; set('exp', st.exp); });
    $('#hx-toe').addEventListener('click', function () { cc(CC.TOE, 127); });
    (function () {
      var xy = els.xy, lastT = 0;
      function at(e) {
        var r = xy.getBoundingClientRect(), x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
        var nx = Math.round(x * 127), ny = Math.round(y * 127), now = performance.now();
        if (nx !== st.xy[0] || ny !== st.xy[1]) { st.xy = [nx, ny]; paintXY(); if (now - lastT > 25) { lastT = now; cc(CC.XYX, nx); cc(CC.XYY, ny); } }
      }
      xy.addEventListener('pointerdown', function (e) { if (!hasMidiOut()) { toast('No MIDI output to the Helix'); return; } if (!gate()) return; try { xy.setPointerCapture(e.pointerId); } catch (er) { /* synthetic */ } at(e); function mv(ev) { at(ev); } function up() { xy.removeEventListener('pointermove', mv); xy.removeEventListener('pointerup', up); cc(CC.XYX, st.xy[0]); cc(CC.XYY, st.xy[1]); set('xy', st.xy); } xy.addEventListener('pointermove', mv); xy.addEventListener('pointerup', up); e.preventDefault(); });
    })();
    // tempo / tuner
    $('#hx-tap').addEventListener('click', function () { cc(CC.TAP, 127); });
    $('#hx-taps').addEventListener('click', function () { sendTaps(parseInt(A.store.get('met.bpm', 120), 10) || 120); toast('Tapping at ' + (A.store.get('met.bpm', 120)) + ' bpm'); });
    $('#hx-follow input').addEventListener('change', function (e) { set('followTempo', e.target.checked); });
    $('#hx-tunerbtn').addEventListener('click', function () { cc(CC.BTN, 34); });
    $('#hx-nettuner input').addEventListener('change', function (e) { set('netTuner', e.target.checked); brTele(e.target.checked ? 'tuner' : 'off'); dev.tuner = null; paintTuner(); });
    // footswitch mode / buttons
    $('#hx-fsmode').addEventListener('click', function (e) { var b = e.target.closest('[data-fs]'); if (!b || !cc(CC.FSMODE, +b.getAttribute('data-fs'))) return; st.fsmode = +b.getAttribute('data-fs'); $$('#hx-fsmode button').forEach(function (x) { x.classList.toggle('active', x === b); }); });
    $('#hx-btns').addEventListener('click', function (e) { var b = e.target.closest('[data-btn]'); if (b) cc(CC.BTN, +b.getAttribute('data-btn')); });
    // stomps
    $('#hx-sadd').addEventListener('click', function () {
      var n = $('#hx-sname').value.trim(), c = parseInt($('#hx-scc').value, 10);
      if (isNaN(c) || c < 0 || c > 127) return toast('CC 0–127');
      var l = stomps(); l.push({ name: n || ('CC ' + c), cc: c, kind: $('#hx-skind').value, v: 0 }); set('ccs', l); $('#hx-sname').value = ''; $('#hx-scc').value = ''; paintStomps();
    });
    els.stomps.addEventListener('click', function (e) {
      var t = e.target.closest('[data-stog]'), d = e.target.closest('[data-sdel]'), l = stomps();
      if (t) { var i = +t.getAttribute('data-stog'), nv = l[i].v ? 0 : 127; if (!cc(l[i].cc, nv, chCtl())) return; l[i].v = nv; set('ccs', l); paintStomps(); }
      if (d) { l.splice(+d.getAttribute('data-sdel'), 1); set('ccs', l); paintStomps(); }
    });
    els.stomps.addEventListener('input', function (e) { var r = e.target.closest('[data-sknob]'); if (!r) return; var l = stomps(), i = +r.getAttribute('data-sknob'); if (!cc(l[i].cc, +r.value, chCtl())) { r.value = l[i].v || 0; return; } l[i].v = +r.value; r.nextElementSibling.textContent = r.value; });
    els.stomps.addEventListener('change', function (e) { if (e.target.closest('[data-sknob]')) { var l = stomps(); l[+e.target.getAttribute('data-sknob')].v = +e.target.value; set('ccs', l); } });
    $('#hx-ch').addEventListener('change', function (e) { set('ch', clamp(parseInt(e.target.value, 10) || 1, 1, 16)); disarm('Global channel changed. Match it on the Helix, then arm again.'); paintPreset(); paintArm(); });
    $('#hx-ctlchin').addEventListener('change', function (e) { set('ctlCh', clamp(parseInt(e.target.value, 10) || 2, 1, 16)); $('#hx-ctlch').textContent = chCtl(); paintStomps(); });
    // blocks
    $('#hx-ebrefresh').addEventListener('click', function () { readEditBuffer(); readSnapshot(); readActive(); });
    els.blocks.addEventListener('click', function (e) {
      var byp = e.target.closest('[data-byp]'), bl = e.target.closest('[data-b]');
      if (byp) { var k = byp.getAttribute('data-byp').split(':'), b = blockAt(+k[0], +k[1]); if (b) setEnabled(b, !b.enabled); return; }
      if (bl) { var k2 = bl.getAttribute('data-b').split(':'), b2 = blockAt(+k2[0], +k2[1]); dev.openBlock = dev.openBlock === b2 ? null : b2; paintBlocks(); }
    });
    els.params.addEventListener('input', function (e) {
      var r = e.target.closest('[data-prange],[data-pnum]'), b = dev.openBlock; if (!r || !b) return;
      var pid = +(r.getAttribute('data-prange') || r.getAttribute('data-pnum')), v = parseFloat(r.value); if (isNaN(v)) return;
      if (!gate()) { paintParamValue(pid, b.vals[pid]); return; }
      var p = paramDefs(b).filter(function (x) { return x.id === pid; })[0];
      b.vals[pid] = v; r.parentNode.querySelector('.hx-pv').textContent = fmt(v, p);
      writeParam(b.path, b.slot, pid, v);
    });
    els.params.addEventListener('pointerdown', function () { dragging = true; });
    els.params.addEventListener('pointerup', function () { dragging = false; });
    els.params.addEventListener('click', function (e) {
      var t = e.target.closest('[data-ptog]'), b = dev.openBlock; if (!t || !b || !gate()) return;
      var pid = +t.getAttribute('data-ptog'), v = !b.vals[pid];
      b.vals[pid] = v; paintParamValue(pid, v); writeParam(b.path, b.slot, pid, v ? 1 : 0);
    });
    // presets
    els.conts.addEventListener('click', function (e) { var c = e.target.closest('[data-cont]'); if (c) showContainer(parseInt(c.getAttribute('data-cont'), 10)); });
    els.pfilter.addEventListener('input', paintPresetList);
    $('#hx-prefresh').addEventListener('click', function () { dev.lists = {}; dev.setlists = []; loadSetlists().then(function () { showContainer(curContainer); }); });
    els.plist.addEventListener('click', function (e) {
      var s = e.target.closest('[data-star]'), b = s || e.target.closest('[data-cid]'); if (!b) return;
      var cid = +b.getAttribute(s ? 'data-star' : 'data-cid'), it = (dev.lists[curContainer] || []).filter(function (x) { return x.cid_ === cid; })[0];
      if (it) { if (s) favFromItem(it); else loadPreset(it); }
    });
    // looper & song
    root.addEventListener('click', function (e) { var b = e.target.closest('[data-lp]'); if (!b) return; var p = b.getAttribute('data-lp').split(':'); cc(+p[0], +p[1]); });
    $('#hx-playlistgo').addEventListener('click', function () { cc(CC.PLAYLIST, +$('#hx-playlist').value || 0); });
    $('#hx-songgo').addEventListener('click', function () { cc(CC.SONGCUE, (+$('#hx-song').value || 1) - 1); });
    $('#hx-markergo').addEventListener('click', function () { cc(CC.MARKER, +$('#hx-marker').value || 0); });
    // mixer
    $('#hx-layers').addEventListener('click', function (e) { var b = e.target.closest('[data-layer]'); if (!b) return; set('mixLayer', b.getAttribute('data-layer')); paintLayerSeg(); paintMixer(); });
    $('#hx-clearsolo').addEventListener('click', function () { cc(CC.CLEARSOLO, 127, mixCh()); var m = g('mix', {}), lay = g('mixLayer', 'qtr'); if (m[lay]) Object.keys(m[lay]).forEach(function (k) { if (k[0] === 's') m[lay][k] = 0; }); set('mix', m); paintMixer(); });
    els.mixer.addEventListener('input', function (e) { var r = e.target.closest('[data-mix]'); if (!r) return; var k = r.getAttribute('data-mix'); if (!cc(mixCC(k), +r.value, mixCh())) { r.value = mixVal(k); return; } r._sent = true; });
    els.mixer.addEventListener('change', function (e) { var r = e.target.closest('[data-mix]'); if (!r || !r._sent) return; r._sent = false; mixStore(r.getAttribute('data-mix'), +r.value); });
    els.mixer.addEventListener('click', function (e) { var t = e.target.closest('[data-mixt]'); if (!t) return; var k = t.getAttribute('data-mixt'), m = g('mix', {}), lay = g('mixLayer', 'qtr'), on = !((m[lay] || {})[k]); if (!cc(mixCC(k), 127, mixCh())) return; mixStore(k, on ? 1 : 0); paintMixer(); });
    // monitor
    $('#hx-monmidi').addEventListener('change', function (e) { set('monMidi', e.target.checked); });
    $('#hx-monnet').addEventListener('change', function (e) { set('monNet', e.target.checked); });
    $('#hx-monhex').addEventListener('change', function (e) { set('monHex', e.target.checked); });
    $('#hx-monpause').addEventListener('click', function (e) { monPaused = !monPaused; e.target.textContent = monPaused ? 'Resume' : 'Pause'; });
    $('#hx-monclear').addEventListener('click', function () { mon = []; paintMon(); });
    $('#hx-obsclear').addEventListener('click', clearObs);
    $('#hx-idreq').addEventListener('click', function () { tx([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7]); });
    $('#hx-rawsend').addEventListener('click', function () {
      var s = $('#hx-rawmidi').value.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, ' ').trim().split(/\s+/).filter(Boolean).map(function (h) { return parseInt(h, 16); });
      if (!s.length || s.some(isNaN)) return toast('Hex bytes, e.g. B0 45 02');
      tx(s);
    });
    $('#hx-oscsend').addEventListener('click', function () {
      var addr = $('#hx-oscaddr').value.trim(), args = [];
      if (!addr) return toast('Address needed, e.g. /ProductInfoGet');
      try { if ($('#hx-oscargs').value.trim()) args = JSON.parse($('#hx-oscargs').value); } catch (e) { return toast('Args must be JSON like [["i",-2],["s","key"]]'); }
      if (!gate()) return; // a raw command may write
      rpc(addr, args, { collect: true, timeout: 4000 }).then(function (rs) { toast(rs.length + ' reply frame' + (rs.length === 1 ? '' : 's') + ' (see monitor)'); }).catch(function (e) { toast(e.message); });
    });

    armMsg = safe() ? 'Output is disarmed. Press Arm before sending anything to the Helix.' : 'Safe mode is off: controls send immediately.';
    paintSetlistSelect(); paintPreset(); paintSnaps(); paintExp(); paintXY(); paintStomps(); paintLayerSeg(); paintMixer(); paintTuner(); paintFavs(); paintFavEdit(); paintObs(); paintStatus(); paintBlocks();
    showView(view);
  }
  function mixVal(k) { var v = (g('mix', {})[g('mixLayer', 'qtr')] || {})[k]; return typeof v === 'number' ? v : k[0] === 'p' ? 64 : 100; }
  function mixCh() { var lay = g('mixLayer', 'qtr'), l = LAYERS.filter(function (x) { return x[0] === lay; })[0]; var o = g('mixCh', {}); return clamp(parseInt(o[lay], 10) || (l ? l[2] : 3), 1, 16); }
  function mixCC(k) { var base = parseInt(k.slice(1), 10); return k[0] === 'l' ? base : k[0] === 'p' ? base + 23 : k[0] === 'm' ? base + 46 : base + 69; }
  function mixStore(k, v) { var m = g('mix', {}), lay = g('mixLayer', 'qtr'); m[lay] = m[lay] || {}; m[lay][k] = v; set('mix', m); }
  function paintLayerSeg() { var lay = g('mixLayer', 'qtr'); $$('#hx-layers button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-layer') === lay); }); }

  A.injectCSS('helix', [
    '.hx-wrap{position:relative}.hx-head h2{margin-bottom:6px}',
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
      root = el; build();
      // lifecycle disarms (null): another window, a hidden app, the app's own MIDI changing
      window.addEventListener('blur', function () { disarm('Window focus lost. Output disarmed.'); });
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') disarm('App hidden. Output disarmed.'); });
      A.on('midi:state', function () { midiPick(); });
    },
    onShow: function () {
      if (arm.on) setArmed(false);
      armMsg = safe() ? 'Output is disarmed. Press Arm before sending anything to the Helix.' : 'Safe mode is off: controls send immediately.';
      paintArm();
      visible = true;
      // the page's own Web MIDI access on the first visit (the boot-time midi:state can
      // already have settled on the app's shared output, which gives no input to listen to)
      if (!midi.access) midiConnect(true);
      if (g('bridgeAuto', false)) brConnect();
      if (devOnline()) devRefresh();
      showView(view);
    },
    onHide: function () { visible = false; brTele('off'); disarm('Page closed. Output disarmed.'); if (br.retry) { clearTimeout(br.retry); br.retry = null; } },
    onKey: function (e) {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key >= '1' && e.key <= '8') { gotoSnapshot(+e.key - 1); e.preventDefault(); }
      else if (e.key === '[') cc(CC.BTN, 12); else if (e.key === ']') cc(CC.BTN, 13);
      else if (e.key === 't' || e.key === 'T') cc(CC.TAP, 127);
    }
  });

  window.SLHelix = { builtIn: true, CC: CC, MIX: MIX, cc: cc, pc: pc, rpc: rpc, get dev() { return dev; }, get st() { return st; }, get midi() { return midi; }, get bridge() { return br; }, useEditBuffer: useEditBuffer, slotLabel: slotLabel, onMidiIn: onMidiIn, showView: showView,
    get armed() { return armed(); }, arm: function (on) { setArmed(on !== false); }, favs: favs, recallBytes: recallBytes, addrOf: addrOf, isHelix: isHelix, shortName: shortName, get obs() { return obs; }, get rx() { return rx; } };
})();
