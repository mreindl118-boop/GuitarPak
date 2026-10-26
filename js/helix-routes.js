/* soundLAB HELIX ROUTES — App.helix, the engine behind the Helix Stadium page.
 *
 * Phase 0 of the Helix deck (docs/HELIX-DECK-SPEC.md): everything js/helix.js
 * used to do besides painting moved here, byte for byte — the MIDI route (the
 * Stadium's own Web MIDI port pair, or soundLAB's shared output when THAT is
 * the Helix), null's SAFETY model (disarmed on every visit, a 90 s arm window
 * renewed per command, disarm on blur / app hidden / destination change /
 * bridge drop / failed send), the network BRIDGE (tools/helix-bridge.js) with
 * its reads, writes and change stream, favorites (an ADDRESS: CC32 + PC +
 * optional CC69 + bridge cid), the OBSERVED panel and the ledger.
 *
 * The engine owns the runtime state (st, dev, midi, br, arm, obs) and EMITS
 * events; it never touches the DOM. js/helix.js (the Edit face) and
 * js/helix-deck.js (the Perform face) subscribe and paint:
 *   'state'    {what:'arm'|'routes'|'fw'|'mode'|'safe'|'favs'|'address', flash?}
 *   'dev'      {what:'status'|'online'|'info'|'active'|'eb'|'defs'|'snapname'|
 *               'block'|'param'|'lists'|'list'|'setlists'|'tuner', ...}
 *   'value'    {key, v, src:'sent'|'echo'|'state'}   PROVENANCE: 'sent' = we
 *              sent it, 'echo' = the pedal said so over MIDI, 'state' = the
 *              bridge read it back. An echo is never promoted to 'state'.
 *   'stream'   {addr, args}        a 2001 change-stream frame (not heartbeats)
 *   'ledger'   {row}               {t, src:'midi'|'net', dir:'in'|'out', data}
 *   'io'       {dir, bytes}        every MIDI byte in/out (the LEDs)
 *   'observed'                     the observed table changed (debounced)
 *   'toast'    {msg}
 *
 * OPS (op(name, params, opts) -> Promise<{ok, route, sent, reason?}>): every
 * MIDI op runs synchronously inside op() (the gate, the send, the 'value'
 * emit) and resolves at once; net ops resolve with the device's reply; timed
 * plans (recallPreset: CC32, PC +30 ms, CC69 +300 ms; bridge load then
 * /activateSnapshot +700 ms; tapTempo: four taps) resolve after the last
 * step and can be cancel()led. Destructive ops (load, save) ask
 * App.helix.ui.confirm({title, body, ok, danger}) -> Promise<bool> when the
 * deck installed it, else window.confirm. Reads are never gated.
 *
 * Nothing connects at boot: init() only wires listeners. Web MIDI is asked
 * for by the page; the bridge connects only after Connect bridge once
 * (hx.bridgeAuto) and retries only while the page is visible. The bridge
 * reaches the pedal over Wi-Fi or, on firmware 1.4, the USB network link; its
 * status says which (transport) and what it found (transports) — routes.usb
 * / routes.net report it, routes.usb.connect() asks it to move to USB and
 * routes.usb.prefer('usb'|'net'|'auto') stores hx.transport.
 * Store keys hx.* (shared with js/helix.js). No DOM, no window.confirm except
 * as the fallback above.
 */
(function () {
  'use strict';

  var A = App;
  function g(k, d) { return A.store.get('hx.' + k, d); }
  function set(k, v) { A.store.set('hx.' + k, v); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function hex(b) { var o = []; for (var i = 0; i < b.length; i++) o.push(('0' + (b[i] & 0xFF).toString(16).toUpperCase()).slice(-2)); return o.join(' '); }
  function slotLabel(posi) { return posi == null || posi < 0 ? '' : (Math.floor(posi / 4) + 1) + 'ABCD'[posi % 4]; }
  function int(v, lo, hi) { if (typeof v === 'string' && /^\s*-?\d+\s*$/.test(v)) v = +v; return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi ? v : null; }

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

  // ---- the engine's own bus -------------------------------------------------------
  var L = {};
  function on(evt, fn) { if (typeof fn !== 'function') return; (L[evt] = L[evt] || []).push(fn); }
  function off(evt, fn) { var l = L[evt]; if (!l) return; var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
  function emit(evt, d) { var l = L[evt]; if (!l) return; l = l.slice(); for (var i = 0; i < l.length; i++) { try { l[i](d); } catch (e) { console.error('helix:' + evt, e); } } }
  function toast(msg) { emit('toast', { msg: msg }); }

  // ---- state ----------------------------------------------------------------------
  var visible = false, inited = false;
  var st = { setlist: g('setlist', 1), prog: g('prog', 0), snap: 0, snapAfter: null, kv: g('kv', {}), exp: g('exp', [0, 0]), xy: g('xy', [64, 64]), fsmode: null, lastIn: 0, lastOut: 0 };
  var dev = { info: null, active: null, eb: null, blocks: [], defs: {}, snapNames: [], lists: {}, setlists: [], alive: 0, tuner: null };
  if (!Array.isArray(st.exp) || st.exp.length < 2) st.exp = [0, 0];
  if (!Array.isArray(st.xy) || st.xy.length < 2) st.xy = [64, 64];
  if (!st.kv || typeof st.kv !== 'object') st.kv = {};
  // PROVENANCE: the newest value per control key and where it came from
  var vals = {};
  function value(key, v, src) { vals[key] = { v: v, src: src, t: Date.now() }; emit('value', { key: key, v: v, src: src }); }
  function values(key) { return vals[key] || null; }
  // LEDGER: every MIDI / network message in and out (the monitor's feed)
  var ledgerRows = [], LEDGER_CAP = 600;
  function logRow(src, dir, data) {
    var row = { t: new Date(), src: src, dir: dir, data: data };
    ledgerRows.push(row); if (ledgerRows.length > LEDGER_CAP) ledgerRows.splice(0, ledgerRows.length - LEDGER_CAP);
    emit('ledger', { row: row });
  }
  var why = ''; // why the last send was refused: 'no-output' | 'disarmed' | 'send-failed'

  // ---- MIDI: the Stadium's own port when the browser lists one, else the app's output
  // PORT ALLOW-LIST (null's recall profile): a Helix/Stadium name and never a
  // MODX / MONTAGE / LUMI / ROLI / virtual / loopback / thru port. soundLAB's
  // shared output is used only when IT is the Helix, so Helix CCs can never
  // land on a synth or a LUMI. Checked again before every send.
  var midi = { access: null, inp: null, out: null, mode: 'none', err: '' };
  var NOT_HELIX = /modx|montage|lumi|roli|virtual|loopback|loopmidi|through|thru|midi mapper|wavetable/i;
  function isHelix(p) { var n = p && p.name || ''; return /helix|stadium/i.test(n) && !NOT_HELIX.test(n); }
  function appOk() { return !!(A.midi && A.midi.send && A.midi.hasOutput && isHelix({ name: A.midi.outputName || '' })); }
  function routesChanged() { emit('state', { what: 'routes' }); }
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
    routesChanged();
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
  var learnFn = null;
  function onMidiIn(b) {
    if (!b || !b.length) return;
    st.lastIn = performance.now(); emit('io', { dir: 'in', bytes: b });
    observe(b);
    if (b[0] >= 0xF8) return; // clock / active sensing: counted in Observed, kept out of the monitor
    var s = b[0] & 0xF0, ch = (b[0] & 15) + 1;
    if (learnFn && ((s === 0xB0 && b.length > 2) || (s === 0xC0 && b.length > 1))) { // Learn: the next CC / PC fills a match
      var fn = learnFn; learnFn = null;
      try { fn({ ch: ch, type: s === 0xB0 ? 'cc' : 'pc', num: b[1], v: s === 0xB0 ? b[2] : null, bytes: b }); } catch (e) { console.error('helix learn', e); }
    }
    if (ch === chGlobal()) {
      if (s === 0xC0) { st.prog = b[1]; set('prog', st.prog); value('prog', st.prog, 'echo'); }
      else if (s === 0xB0) {
        if (b[1] === CC.SNAP && b[2] <= 7) { st.snap = b[2]; value('snap', st.snap, 'echo'); }
        else if (b[1] === CC.SETLIST) { st.setlist = b[2]; set('setlist', st.setlist); value('setlist', st.setlist, 'echo'); }
        else if (b[1] >= CC.KNOB1 && b[1] < CC.KNOB1 + 8) { st.kv[b[1] - CC.KNOB1] = b[2]; set('kv', st.kv); value('knob:' + (b[1] - CC.KNOB1), b[2], 'echo'); }
        else if (b[1] === CC.EXP1 || b[1] === CC.EXP2) { st.exp[b[1] - 1] = b[2]; value('exp:' + (b[1] - 1), b[2], 'echo'); }
      }
    }
    logRow('midi', 'in', b);
  }
  function hasMidiOut() { return !!((midi.mode === 'web' && midi.out && midi.out.state !== 'disconnected' && isHelix(midi.out)) || (midi.mode === 'app' && appOk())); }
  function tx(b, quiet) {
    if (!hasMidiOut()) { why = 'no-output'; if (!midi.access && midi.mode !== 'app') midiConnect(true); if (!quiet) toast('No MIDI output to the Helix'); return false; }
    if (!gate(quiet)) return false;
    var ok = false;
    if (midi.mode === 'web') { try { midi.out.send(b); ok = true; } catch (e) { ok = false; } if (ok) A.emit('midi:out', { bytes: b, port: midi.out.name || 'Helix' }); }
    else ok = !!A.midi.send(b);
    if (!ok) { why = 'send-failed'; disarm('A send failed, so output is disarmed. Check the connection before trying again.'); if (!quiet) toast('MIDI send failed'); return false; }
    st.lastOut = performance.now(); emit('io', { dir: 'out', bytes: b });
    logRow('midi', 'out', b);
    return true;
  }
  function chGlobal() { return clamp(parseInt(g('ch', 1), 10) || 1, 1, 16); }
  function chCtl() { return clamp(parseInt(g('ctlCh', 2), 10) || 2, 1, 16); }
  function ccBytes(n, v, ch) { return [0xB0 | ((ch || chGlobal()) - 1), n & 127, clamp(Math.round(v), 0, 127)]; }
  function cc(n, v, ch, quiet) { return tx(ccBytes(n, v, ch), quiet); }
  function pc(n, ch) { return tx([0xC0 | ((ch || chGlobal()) - 1), clamp(Math.round(n), 0, 127)]); }
  function midiStatus() { return hasMidiOut() ? 'online' : midi.mode === 'web' ? 'available' : 'absent'; }
  function midiDest() { return midi.mode === 'web' && midi.out ? midi.out.name : midi.mode === 'app' && appOk() ? (A.midi.outputName || '') : ''; }

  // ---- SAFETY (null's model): output starts DISARMED. Arm opens a 90-second
  // window that every command renews. Leaving the page, hiding the app,
  // switching windows, a destination change, a bridge drop or a failed send
  // disarm it. Reads never need arming. Safe mode off (hx.safe false) = armed.
  var ARM_MS = 90000, arm = { on: false, until: 0, t: 0 }, armMsg = '';
  function safe() { return g('safe', true) !== false; }
  function armed() { return !safe() || (arm.on && Date.now() < arm.until); }
  function armTimer() { clearTimeout(arm.t); arm.t = setTimeout(function () { if (arm.on) setArmed(false, 'Disarmed after 90 s without a command.'); }, Math.max(0, arm.until - Date.now())); }
  function paintArm(flash) { emit('state', { what: 'arm', flash: !!flash }); }
  function setArmed(on, why) { arm.on = !!on; arm.until = on ? Date.now() + ARM_MS : 0; if (on) armTimer(); else clearTimeout(arm.t); if (why) armMsg = why; paintArm(); }
  function disarm(why) { if (arm.on) setArmed(false, why); }
  function gate(quiet) {
    if (!safe()) return true;
    if (arm.on && Date.now() < arm.until) { arm.until = Date.now() + ARM_MS; armTimer(); return true; }
    if (arm.on) setArmed(false, 'Disarmed after 90 s without a command.');
    why = 'disarmed';
    if (!quiet) { toast('Output is disarmed: press Arm first. Nothing was sent.'); paintArm(true); }
    return false;
  }
  function canArm() { return hasMidiOut() || devOnline(); }
  // public: arm(true) refuses with a message when nothing is connected
  function armApi(on, why) {
    if (on === false) { setArmed(false, why); return false; }
    if (!canArm()) { armMsg = 'Nothing to arm yet: connect the Helix over MIDI or start the bridge.'; paintArm(); return false; }
    setArmed(true, why || 'Armed. Each command renews 90 s; leaving the page, hiding the app or switching windows disarms.');
    return true;
  }
  function setSafe(on) {
    set('safe', !!on);
    if (on) setArmed(false, 'Safe mode on: output disarmed.'); else { arm.on = false; clearTimeout(arm.t); armMsg = 'Safe mode off: controls send immediately.'; paintArm(); }
    emit('state', { what: 'safe' });
  }
  function gateApi(kind, quiet) { return kind === 'read' ? true : gate(quiet); }
  function armMessage(msg) { armMsg = String(msg || ''); paintArm(); }

  // ---- FAVORITES (null's recall profile): named MIDI addresses = setlist
  // (CC32) + preset (PC) + optional snapshot (CC69), on this device only
  // (hx.favs, 48 max). Saving, editing and removing never send; Recall does.
  // With the bridge up, the Helix's own numbering fills the address (addrOf).
  var FAV_MAX = 48;
  function favs() {
    var l = g('favs', []); if (!Array.isArray(l)) return [];
    return l.filter(function (f) { return f && typeof f.id === 'string' && typeof f.name === 'string' && f.name.trim() && int(f.bank, 0, 127) !== null && int(f.prog, 0, 127) !== null && (f.snap == null || int(f.snap, 0, 7) !== null); }).slice(0, FAV_MAX);
  }
  function saveFavs(l) { set('favs', l.slice(0, FAV_MAX)); emit('state', { what: 'favs' }); }
  // add (no id / unknown id) or replace (id of a listed favorite); never sends
  function saveFav(f) {
    f = f || {};
    var name = String(f.name == null ? '' : f.name).trim().slice(0, 40);
    if (!name) { toast('Name the favorite first. Nothing sent.'); return null; }
    var bank = int(f.bank, 0, 127), prog = int(f.prog, 0, 127);
    if (bank === null || prog === null) { toast('No MIDI address for that preset.'); return null; }
    var o = { id: typeof f.id === 'string' ? f.id : '', name: name, bank: bank, prog: prog, snap: f.snap == null ? null : int(f.snap, 0, 7) };
    if (typeof f.cid === 'number') o.cid = f.cid;
    if (typeof f.colour === 'string') o.colour = f.colour;
    if (f.tags != null) o.tags = f.tags;
    if (f.app && typeof f.app === 'object') o.app = f.app;
    var l = favs(), idx = -1;
    if (o.id) l.forEach(function (x, i) { if (x.id === o.id) idx = i; });
    if (idx >= 0) l[idx] = o;
    else {
      if (l.length >= FAV_MAX) { toast(FAV_MAX + ' favorites already: remove one first.'); return null; }
      o.id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); l.push(o);
    }
    saveFavs(l); toast('Saved "' + o.name + '" on this device. Nothing sent.'); return o;
  }
  function removeFav(id) {
    var l = favs(), n = l.length; l = l.filter(function (x) { return x.id !== id; });
    if (l.length === n) return false;
    saveFavs(l); toast('Removed on this device. Nothing sent.'); return true;
  }
  function favById(id) { return favs().filter(function (x) { return x.id === id; })[0] || null; }
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
  // a favorite-shaped address for a listed preset (never saves it)
  function favFromItem(it) {
    var a = addrOf(it);
    if (!a) { toast('No MIDI address for that preset.'); return null; }
    return { name: String(it.name || 'preset').slice(0, 40), bank: a.bank, prog: a.prog, snap: null, cid: it.rcid != null ? it.rcid : it.cid_ };
  }
  // the address of the preset loaded on the Helix (bridge), listing what it
  // takes to resolve it; resolves null (with a toast) when there is none
  function favActive() {
    if (!devOnline()) { toast('Start the bridge to read the active preset.'); return Promise.resolve(null); }
    function go() { var a = dev.active; if (!a || a.posi == null) { toast('The loaded preset has no saved slot to point at (unsaved edits?).'); return null; } return favFromItem({ name: a.name, posi: a.posi, ccid: a.ccid, cid_: a.cid }); }
    if (dev.active && dev.active.posi != null) return Promise.resolve(go());
    function none() { return []; }
    return Promise.all([listContainer(-2).catch(none), listContainer(-1).catch(none), loadSetlists()])
      .then(function () { return Promise.all(dev.setlists.map(function (s) { return listContainer(s.cid_).catch(none); })); })
      .then(readActive).then(go);
  }
  function recallBytes(bank, prog, snap) { var c = chGlobal() - 1, o = [[0xB0 | c, 32, bank], [0xC0 | c, prog]]; if (snap != null) o.push([0xB0 | c, 69, snap]); return o; }
  function recallFav(id) {
    var f = typeof id === 'object' ? id : favById(id);
    if (!f) return Promise.resolve(res(false, 'none', 0, 'no such favorite'));
    return op('recallPreset', { bank: f.bank, prog: f.prog, snap: f.snap, cid: f.cid, name: f.name, app: f.app });
  }
  // a favorite that carries soundLAB's key & tempo applies them AFTER the last byte
  function applyApp(app) {
    if (!app || typeof app !== 'object') return;
    var d = { source: 'helix' }, any = false;
    if (typeof app.root === 'number') { d.root = app.root; any = true; }
    if (typeof app.scale === 'string') { d.scale = app.scale; any = true; }
    if (typeof app.mode === 'number') { d.mode = app.mode; any = true; }
    if (any) A.emit('fb:set', d);
    if (typeof app.bpm === 'number' && app.bpm > 0) A.emit('tempo', { bpm: app.bpm, source: 'helix' });
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
    if (!obsT) obsT = setTimeout(function () { obsT = 0; emit('observed'); }, 150);
  }
  function clearObs() { obs = {}; rx = { n: 0, clock: 0 }; emit('observed'); }
  function observed() { return { items: obs, n: rx.n, clock: rx.clock }; }
  function ago(ms) { var s = Math.round(ms / 1000); return s < 2 ? 'just now' : s < 60 ? s + ' s ago' : Math.round(s / 60) + ' min ago'; }

  // ---- BRIDGE: WebSocket to tools/helix-bridge.js ------------------------------------
  // TRANSPORTS (phase 4): the bridge's status carries transport 'usb' | 'net' |
  // 'manual' | null (how it reaches the pedal right now) and transports {usb:
  // {present, adapter:{name, description}|null, local, candidate, reachable}
  // | null, net:{host, ip}} (what it found). On firmware 1.4 the pedal's "USB
  // editing" is a network link over the cable (CDC-NCM): the SAME services at
  // the link's <prefix>::1. {op:'transport', want:'usb'|'net'|'auto'} asks the
  // bridge to move; hx.transport ('auto') is sent on every (re)connect.
  var br = { ws: null, open: false, status: null, rid: 1000, pend: {}, retry: null, want: false, tele: 'off', sw: null };
  var SWITCH_MS = 20000; // a transport request shows 'connecting' at most this long
  function brUrl() { return String(g('bridge', 'ws://127.0.0.1:4575')).trim() || 'ws://127.0.0.1:4575'; }
  function brConnect() {
    br.want = true;
    if (br.ws && (br.ws.readyState === 0 || br.ws.readyState === 1)) return;
    if (typeof WebSocket === 'undefined') return;
    var ws;
    try { ws = new WebSocket(brUrl()); } catch (e) { routesChanged(); return brRetry(); }
    br.ws = ws;
    ws.onopen = function () { br.open = true; routesChanged(); brTele(br.tele, true); brTransport(transportPref()); }; // the reads start once its status says the pedal is reachable
    ws.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (e) { return; } onBridge(m); };
    ws.onclose = function () { var was = br.open; br.open = false; br.status = null; br.ws = null; br.sw = null; if (was) { disarm('The bridge disconnected, so output is disarmed.'); toast('Bridge disconnected'); } routesChanged(); brRetry(); };
    ws.onerror = function () { /* close follows */ };
  }
  function brRetry() { if (!br.want || br.retry || !visible) return; br.retry = setTimeout(function () { br.retry = null; if (br.want && !br.open) brConnect(); }, 4000); }
  function brClose() { br.want = false; if (br.ws) { try { br.ws.close(); } catch (e) { /* ok */ } } br.ws = null; br.open = false; br.status = null; br.sw = null; routesChanged(); }
  function brSend(o) { if (!br.open) return false; try { br.ws.send(JSON.stringify(o)); return true; } catch (e) { return false; } }
  function brTele(level, force) { if (level !== br.tele || force) { br.tele = level; brSend({ op: 'telemetry', level: level }); } }
  function devOnline() { return !!(br.open && br.status && br.status.ports && br.status.ports['2002']); }
  // which link the bridge is on: 'usb' | 'net' | 'manual' | null (an older bridge names none = Wi-Fi)
  function transport() { return br.open && br.status && typeof br.status.transport === 'string' ? br.status.transport : null; }
  function usbT() { var t = br.open && br.status && br.status.transports; return t && t.usb && typeof t.usb === 'object' ? t.usb : null; }
  function usbSwitching() { return !!(br.open && br.sw && br.sw.want === 'usb' && Date.now() - br.sw.t < SWITCH_MS); }
  function netStatus() {
    if (devOnline()) return transport() === 'usb' ? 'available' : 'online'; // over USB the bridge is up but Wi-Fi is not in use
    return br.open ? 'available' : br.want ? 'connecting' : 'absent';
  }
  function usbStatus() {
    if (!br.open) return 'absent';
    var u = usbT();
    if (transport() === 'usb' && devOnline()) return 'online';
    if (usbSwitching()) return 'connecting';
    if (u && u.present && u.reachable) return 'available';
    return 'needs-setup';
  }
  function transportPref() { var w = g('transport', 'auto'); return w === 'usb' || w === 'net' ? w : 'auto'; }
  // ask the bridge to move; a non-auto wish is remembered as a pending switch (-> 'connecting')
  function brTransport(want) {
    if (want !== 'usb' && want !== 'net' && want !== 'auto') return false;
    if (!brSend({ op: 'transport', want: want })) return false;
    br.sw = want === 'auto' ? null : { want: want, t: Date.now() };
    logRow('net', 'out', 'transport ' + want);
    routesChanged();
    return true;
  }
  function switchDone(m) {
    var w = br.sw && br.sw.want, u = m.transports && m.transports.usb;
    if (!w) return true;
    if (w === 'usb') return m.transport === 'usb' || !(u && u.present); // moved, or there is no link to move to
    return m.transport === 'net' || m.transport === 'manual';
  }
  function usbPrefer(want) {
    if (want === undefined) return transportPref();
    if (want !== 'usb' && want !== 'net' && want !== 'auto') return transportPref();
    set('transport', want);
    if (br.open) brTransport(want);
    return want;
  }
  // tap on the USB badge: move the bridge to the link when it can, else start the bridge (as the net badge does)
  function usbConnect() {
    if (!br.open) { set('bridgeAuto', true); brConnect(); return true; }
    var st = usbStatus();
    if (st === 'online' || st === 'connecting') return true;
    if (st === 'available') return brTransport('usb');
    return false; // needs-setup: nothing to connect to (the caption says what is missing)
  }
  // the routes a command would travel: ['MIDI'] + ['USB' | 'net']
  function via() { var v = []; if (hasMidiOut()) v.push('MIDI'); if (usbStatus() === 'online') v.push('USB'); else if (netStatus() === 'online') v.push('net'); return v; }
  function netHost() { var s = br.status || {}, n = s.transports && s.transports.net || {}; return s.host || n.host || ''; }
  function netIp() { var s = br.status || {}, n = s.transports && s.transports.net || {}; return s.ip || n.ip || ''; }
  // where a command goes, as one line: the MIDI port + channel, the USB link's address or the network address
  function destText() {
    var p = [];
    if (hasMidiOut()) p.push(midiDest() + ' · ch ' + chGlobal());
    if (usbStatus() === 'online') { var u = usbT() || {}; p.push('USB link ' + (u.candidate || netIp() || netHost())); }
    else if (netStatus() === 'online') p.push('network ' + (netIp() || netHost()));
    return p.join(' + ');
  }
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
    if (m.op === 'status') { // every status repaints the routes ('state' routes); a finished transport switch clears its 'connecting'
      var wasOn = devOnline(); br.status = m;
      if (br.sw && switchDone(m)) br.sw = null;
      routesChanged(); emit('dev', { what: 'status' });
      if (!wasOn && devOnline()) { emit('dev', { what: 'online' }); devRefresh(); }
      return;
    }
    if (m.op === 'defs') { Object.keys(m.models || {}).forEach(function (k) { dev.defs[k] = m.models[k]; }); emit('dev', { what: 'defs' }); return; }
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
    if (m.addr === '/setParamValue' && a.length >= 7) paramEcho(a[2], a[3], a[5], a[6]);
    else if (m.addr === '/setBlockEnable' && a.length >= 5) { var bl = blockAt(a[2], a[3]); if (bl) { bl.enabled = !!a[4]; value('bypass:' + bl.path + ':' + bl.slot, bl.enabled, 'state'); emit('dev', { what: 'block', path: bl.path, slot: bl.slot }); } }
    else if (m.addr === '/setEditBuffer') { var d = blobOf(a); if (d && d.body) { useEditBuffer(d.body); } else later('eb', readEditBuffer, 400); later('active', readActive, 300); }
    else if (m.addr === '/loadContentRef') { later('active', readActive, 200); later('eb', readEditBuffer, 500); }
    else if (/snapshot/i.test(m.addr)) later('snap', readSnapshot, 150);
    else if (m.addr === '/setSnapshotName' && a.length >= 4) { dev.snapNames[a[2]] = a[3]; value('snapname:' + a[2], a[3], 'state'); emit('dev', { what: 'snapname', i: a[2] }); }
    else if (/^\/(addContent|updateContainerContent|removeContent|setContentAttrs)/i.test(m.addr)) { dev.lists = {}; later('list', function () { emit('dev', { what: 'lists' }); }, 400); }
    emit('stream', { addr: m.addr, args: a });
  }
  function onTelemetry(m) {
    if (m.addr !== '/dspEvent' || m.kind !== 'tuner') return;
    var d = blobOf(m.args), v = d && d.vals && d.vals[0];
    dev.tuner = typeof v === 'number' ? v : null;
    emit('dev', { what: 'tuner' });
  }

  // ---- device reads (never gated) -----------------------------------------------------
  function devRefresh() {
    if (!devOnline()) return Promise.resolve();
    return Promise.all([readInfo(), readActive(), readEditBuffer(), readSnapshot()]);
  }
  function readInfo() {
    return rpc('/ProductInfoGet').then(function (m) {
      var d = blobOf(m.args) || {}, h = d.host || d, v = h.vers || {};
      dev.info = { name: h.name || 'Helix Stadium', serial: h.snum, fw: v.majo != null ? v.majo + '.' + v.mino + '.' + v.patc : '', build: v.buld, raw: d };
      emit('dev', { what: 'info' }); emit('state', { what: 'fw' });
    }).catch(function (e) { logRow('net', 'in', 'ProductInfoGet: ' + e.message); });
  }
  function readActive() {
    return rpc('/PropertyValueGet', [['s', 'server.active.preset.id']]).then(function (m) {
      var d = blobOf(m.args), cid = typeof d === 'number' ? d : d && (d.val_ !== undefined ? d.val_ : d.body && d.body.val_);
      if (typeof cid !== 'number') { dev.active = null; emit('dev', { what: 'active' }); return; }
      return rpc('/GetContentRef', [['i', cid]]).then(function (r) {
        var ref = blobOf(r.args) || {};
        if (!ref.name) { // fw 1.1 answers {} for the loaded buffer's own id: look it up in what we listed
          Object.keys(dev.lists).forEach(function (k) { dev.lists[k].forEach(function (it) { if (it.cid_ === cid || it.rcid === cid) ref = it; }); });
        }
        dev.active = { cid: cid, name: ref.name || ('edit buffer #' + cid + ' (unsaved or unlisted)'), posi: ref.posi, ccid: ref.ccid };
        emit('dev', { what: 'active' });
      });
    }).catch(function (e) { logRow('net', 'in', 'active preset: ' + e.message); });
  }
  function readEditBuffer() {
    return rpc('/EditBufferStateGet', [], { timeout: 8000 }).then(function (m) {
      var d = blobOf(m.args);
      if (d && d.body) useEditBuffer(d.body); else toast('Edit buffer: unexpected reply');
    }).catch(function (e) { logRow('net', 'in', 'edit buffer: ' + e.message); });
  }
  function readSnapshot() {
    return rpc('/ActiveSnapshotIndexGet').then(function (m) { if (typeof m.args[1] === 'number') { st.snap = m.args[1]; value('snap', st.snap, 'state'); } }).catch(function () { /* older firmware */ });
  }
  function useEditBuffer(body) {
    dev.eb = body;
    var cg = body.cg__ || {}, entt = cg.entt || {}, snps = entt.snps;
    if (typeof cg.asnp === 'number') { st.snap = cg.asnp; value('snap', st.snap, 'state'); }
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
        var vls = {};
        (m0.parm || []).forEach(function (p) { if (p && typeof p.pid_ === 'number') vls[p.pid_] = p.valu; });
        blocks.push({ path: path, slot: slot, mid: mid, type: b.type, enabled: b.enbl !== 0 && b.enbl !== false, vals: vls });
        if (!dev.defs[mid]) ids[mid] = 1;
      }
    });
    dev.blocks = blocks;
    var need = Object.keys(ids); if (need.length) brSend({ op: 'lookup', models: need.map(Number) });
    emit('dev', { what: 'eb' });
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
    if (typeof name === 'number') { var dm = dev.defs[name]; return dm && dm.name ? shortName(dm.name) : 'Model ' + name; }
    name = String(name || '');
    var vend = /^(HD2|HX2|VIC|Agoura|P35)_/.test(name), s = name.replace(/^(HD2|HX2|VIC|Agoura|P35)_/, '').replace(/_Victoria$/, '').replace(/(Mono|Stereo)$/, '');
    if (LABEL_FIX[s]) return LABEL_FIX[s];
    if (vend) { s = s.replace(CAT_PREFIX, '') || s; s = s.replace(FAMILY, '') || s; }
    s = s.replace(/(\d)_(\d)/g, '$1/$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/(\d?)([a-z])(\d+)(?=[A-Z/_]|$)/g, function (m, d0, l, d) { return d0 && l === 'x' ? m : d0 + l + ' ' + d; }) // Inst1 -> Inst 1, never 1x10
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    return s || name;
  }
  function modelLabel(mid) { var d = dev.defs[mid]; return d && d.name ? shortName(d.name) : 'Model ' + mid; }
  function paramDefs(b) {
    var d = dev.defs[b.mid], ps = d && d.params || {}, out = [];
    Object.keys(ps).forEach(function (name) { var p = ps[name]; if (p && typeof p.id === 'number') out.push({ name: name, id: p.id, type: p.type || 'f', min: p.min, max: p.max, def: p.def }); });
    Object.keys(b.vals || {}).forEach(function (pid) { if (!out.some(function (p) { return p.id === +pid; })) out.push({ name: 'param ' + pid, id: +pid, type: typeof b.vals[pid] === 'boolean' ? 'b' : 'f', min: null, max: null }); });
    out.sort(function (x, y) { return x.id - y.id; });
    return out;
  }
  function fmtParam(v, p) {
    if (typeof v === 'boolean') return v ? 'On' : 'Off';
    if (typeof v !== 'number') return '—';
    if (p && p.type === 'i') return String(Math.round(v));
    if (p && p.type === 'b') return v ? 'On' : 'Off';
    var span = p && typeof p.max === 'number' && typeof p.min === 'number' ? p.max - p.min : 1;
    return span <= 2 ? Math.round(v * 100) + '%' : (Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(2)) + '';
  }
  function listContainer(cid) {
    if (dev.lists[cid]) return Promise.resolve(dev.lists[cid]);
    return rpc('/GetContainerContents', [['i', cid]], { collect: true, timeout: 8000 }).then(function (frames) {
      var items = [];
      frames.forEach(function (m) { (m.args || []).forEach(function (a) { if (a && Array.isArray(a.dec)) a.dec.forEach(function (x) { if (x && typeof x === 'object' && (x.cid_ !== undefined || x.name)) items.push(x); }); }); });
      items.sort(function (x, y) { return (x.posi || 0) - (y.posi || 0); });
      dev.lists[cid] = items;
      emit('dev', { what: 'list', cid: cid });
      return items;
    });
  }
  function loadSetlists() {
    return listContainer(-5).then(function (items) { dev.setlists = items.filter(function (x) { return x.cctp === 1001 || x.cctp === 1003 || x.type === 1003; }); emit('dev', { what: 'setlists' }); }).catch(function (e) { logRow('net', 'in', 'setlists: ' + e.message); });
  }

  // ---- device writes ----------------------------------------------------------------
  var pendParam = {}, pendT = 0;
  function writeParam(path, slot, pid, v) { // coalesced: the last value per param every 40 ms
    pendParam[path + ':' + slot + ':' + pid] = [path, slot, pid, v];
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
  function paramEcho(path, slot, pid, v) {
    var b = blockAt(path, slot); if (!b) return;
    b.vals[pid] = v;
    value('param:' + path + ':' + slot + ':' + pid, v, 'state');
    emit('dev', { what: 'param', path: path, slot: slot, pid: pid, v: v });
  }

  // ---- firmware gate ---------------------------------------------------------------------
  function fwInfo() {
    if (dev.info && dev.info.fw) return { str: dev.info.fw, build: dev.info.build, src: 'read' };
    var c = g('fwConfirmed', '');
    if (c) return { str: String(c), build: null, src: 'confirmed' };
    return { str: '', build: null, src: null };
  }
  function verNum(s) { var p = String(s || '').split('.'); return (parseInt(p[0], 10) || 0) * 1e6 + (parseInt(p[1], 10) || 0) * 1e3 + (parseInt(p[2], 10) || 0); }
  function fwOk(minFw) { if (!minFw) return true; var f = fwInfo().str; return !!f && verNum(f) >= verNum(minFw); }
  function setFwConfirmed(s) { set('fwConfirmed', s ? String(s) : ''); emit('state', { what: 'fw' }); }
  // the USB badge's honest line for its status (the deck's title + caption line)
  function usbCaption() {
    var st = usbStatus(), u = usbT(), f = fwInfo().str, fwNote = f ? ' This pedal: fw ' + f + '.' : '';
    var name = u && u.adapter && u.adapter.name ? u.adapter.name : u && u.iface ? u.iface : 'USB network adapter', at = u && u.candidate ? ' at ' + u.candidate : '';
    if (st === 'absent') return 'Start the bridge on this computer; it finds the pedal over Wi-Fi or the USB link. USB editing needs firmware 1.4 on the pedal.';
    if (st === 'online') return 'Helix over the USB link' + at + ' (' + name + ').';
    if (st === 'connecting') return 'Switching the bridge to the USB link' + at + ' …';
    if (st === 'available') return 'USB link found (' + name + '): the pedal answers' + at + ', but the bridge is on Wi-Fi. Tap to use USB.';
    if (u && u.present) return 'USB link found (' + name + ') but the pedal did not answer on it — is it on firmware 1.4 with Remote Access on?' + fwNote;
    return 'USB editing needs firmware 1.4 on the pedal; it adds a USB network link the bridge can use. No USB link found yet.' + fwNote;
  }
  function usbInfo() {
    var u = usbT() || {};
    return { status: usbStatus(), caption: usbCaption(), adapter: u.adapter && typeof u.adapter === 'object' ? { name: u.adapter.name || '', description: u.adapter.description || '' } : null,
      candidate: u.candidate || '', local: u.local || '', present: !!u.present, reachable: !!u.reachable, prefer: transportPref(), switching: usbSwitching() };
  }

  // ---- confirm (destructive ops): the deck's sheet, else window.confirm ------------------
  var ui = { confirm: null };
  function askConfirm(o) {
    if (typeof ui.confirm === 'function') {
      try { return Promise.resolve(ui.confirm(o)).then(function (v) { return !!v; }, function () { return false; }); } catch (e) { return Promise.resolve(false); }
    }
    var yes = false;
    try { yes = typeof window.confirm === 'function' ? !!window.confirm(o.body) : false; } catch (e) { yes = false; }
    return Promise.resolve(yes);
  }

  // ---- OPS -------------------------------------------------------------------------------
  function res(ok, route, sent, reason, extra) {
    var r = { ok: !!ok, route: route || 'none', sent: sent || 0 };
    if (!ok) r.reason = reason || why || 'refused';
    if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
    return r;
  }
  // one CC: spec(p) -> [num, val, ch?, key?, after?]; a successful send records
  // values[key] = {v, src:'sent'} and runs after(v) for the engine's own state
  function ccOp(spec, meta) {
    var o = { gate: 'write', route: 'midi', spec: spec };
    if (meta) Object.keys(meta).forEach(function (k) { o[k] = meta[k]; });
    o.run = function (p, opts) {
      var s = spec(p || {});
      if (!s || typeof s[1] !== 'number' && isNaN(parseFloat(s[1]))) return res(false, 'midi', 0, 'bad params');
      var v = clamp(Math.round(+s[1]), 0, 127), ok = cc(s[0], v, s[2], opts.quiet);
      if (ok) { if (s[4]) s[4](v); if (s[3]) value(s[3], v, 'sent'); } // state first, then the event the painters read it through
      return res(ok, 'midi', ok ? 1 : 0);
    };
    return o;
  }
  var plan = null, tapRun = null;
  function finishPlan(run, ok, reason, p) {
    if (plan === run) plan = null;
    if (ok && p && p.app) applyApp(p.app);
    run.resolve(res(ok, run.route, run.sent, reason));
  }
  function cancelPlan(reason) {
    var run = plan, any = false;
    if (run) { plan = null; run.timers.forEach(clearTimeout); run.resolve(res(false, run.route, run.sent, reason || 'cancelled')); any = true; }
    if (tapRun) { var t = tapRun; tapRun = null; t.timers.forEach(clearTimeout); t.resolve(res(false, 'midi', t.n, reason || 'cancelled')); any = true; }
    return any;
  }
  // CC32, PC 30 ms later, the snapshot 300 ms after that (a CC that beats the
  // preset change is ignored by the pedal)
  function midiRecall(bank, prog, snap, p, opts) {
    if (!gate(opts.quiet)) return res(false, 'midi', 0, 'disarmed');
    var b = recallBytes(bank, prog, snap);
    cancelPlan('replaced');
    if (!tx(b[0], opts.quiet)) return res(false, 'midi', 0);
    st.setlist = bank; set('setlist', bank); value('setlist', bank, 'sent');
    return new Promise(function (resolve) {
      var run = plan = { name: 'recallPreset', route: 'midi', timers: [], sent: 1, resolve: resolve };
      run.timers.push(setTimeout(function () {
        if (!tx(b[1], opts.quiet)) return finishPlan(run, false, why);
        run.sent++; st.prog = prog; set('prog', prog); value('prog', prog, 'sent');
        if (!b[2]) return finishPlan(run, true, '', p);
        run.timers.push(setTimeout(function () {
          if (!tx(b[2], opts.quiet)) return finishPlan(run, false, why);
          run.sent++; st.snap = snap; value('snap', snap, 'sent');
          finishPlan(run, true, '', p);
        }, 300));
      }, 30));
    });
  }
  // the bridge loads by cid after a confirm; the snapshot follows 700 ms later
  function netLoad(item, snap, p, opts) {
    if (!devOnline()) { if (!opts.quiet) toast('Bridge not connected'); return res(false, 'net', 0, 'no-device'); }
    if (!gate(opts.quiet)) return res(false, 'net', 0, 'disarmed');
    var label = item.name || item.cid_;
    return askConfirm({ title: 'Load preset', body: 'Load "' + label + '" on the Helix? Unsaved edits to the current preset are lost.', ok: 'Load', danger: true }).then(function (yes) {
      if (!yes) return res(false, 'net', 0, 'declined');
      cancelPlan('replaced');
      return new Promise(function (resolve) {
        var run = plan = { name: 'load', route: 'net', timers: [], sent: 0, resolve: resolve };
        rpc('/LoadPresetWithCID', [['i', item.cid_]]).then(function () {
          run.sent = 1; toast('Loaded ' + label); later('active', readActive, 300); later('eb', readEditBuffer, 600);
          if (snap == null) return finishPlan(run, true, '', p);
          run.timers.push(setTimeout(function () {
            rpc('/activateSnapshot', [['i', snap]], { timeout: 3000 }).then(function () { run.sent = 2; st.snap = snap; value('snap', snap, 'sent'); finishPlan(run, true, '', p); })
              .catch(function (e) { finishPlan(run, false, e.message); });
          }, 700));
        }).catch(function (e) { toast('Load: ' + e.message); finishPlan(run, false, e.message); });
      });
    });
  }
  function runRecall(p, opts) {
    var bank = int(p.bank, 0, 127), prog = int(p.prog, 0, 127), snap = p.snap == null ? null : int(p.snap, 0, 7);
    if (bank === null || prog === null) return res(false, 'none', 0, 'bad address');
    if (hasMidiOut()) return midiRecall(bank, prog, snap, p, opts);
    if (devOnline() && p.cid != null) return netLoad({ cid_: p.cid, name: p.name }, snap, p, opts);
    why = 'no-output'; if (!opts.quiet) toast('No MIDI output to the Helix');
    return res(false, 'none', 0, 'no-output');
  }
  function runSnapshot(p, opts) {
    var i = int(p.i, 0, 7);
    if (i === null) return res(false, 'none', 0, 'bad index');
    if (devOnline()) {
      if (!gate(opts.quiet)) return res(false, 'net', 0, 'disarmed');
      st.snap = i; value('snap', i, 'sent');
      return rpc('/activateSnapshot', [['i', i]], { timeout: 3000 }).then(function () { later('eb', readEditBuffer, 300); return res(true, 'net', 1); })
        .catch(function () { var ok = cc(CC.SNAP, i, null, opts.quiet); return res(ok, 'midi', ok ? 1 : 0); });
    }
    var ok = cc(CC.SNAP, i, null, opts.quiet);
    if (ok) { st.snap = i; value('snap', i, 'sent'); }
    return res(ok, 'midi', ok ? 1 : 0);
  }
  function sendTaps(bpm, quiet) {
    cancelPlan('replaced');
    var ms = 60000 / clamp(bpm || 120, 30, 280);
    return new Promise(function (resolve) {
      var run = tapRun = { timers: [], n: 0, resolve: resolve };
      for (var i = 0; i < 4; i++) (function (i) {
        run.timers.push(setTimeout(function () {
          if (cc(CC.TAP, 127, null, quiet)) { run.n++; value('tap', 127, 'sent'); }
          if (i === 3) { if (tapRun === run) tapRun = null; resolve(res(run.n > 0, 'midi', run.n)); }
        }, Math.round(i * ms)));
      })(i);
    });
  }
  function mixCh(layer) { var l = LAYERS.filter(function (x) { return x[0] === layer; })[0], o = g('mixCh', {}); return clamp(parseInt(o[layer], 10) || (l ? l[2] : 3), 1, 16); }
  function netRead(fn) { return { gate: 'read', route: 'net', run: function (p) { return Promise.resolve(fn(p || {})).then(function (data) { return res(true, 'net', 0, '', { data: data }); }); } }; }

  var OPS = {
    recallPreset: { gate: 'write', route: 'midi', run: runRecall },
    prevPreset: ccOp(function () { return [CC.BTN, 12, null, 'button:12']; }),
    nextPreset: ccOp(function () { return [CC.BTN, 13, null, 'button:13']; }),
    snapshot: { gate: 'write', route: 'midi', run: runSnapshot },
    snapPrev: ccOp(function () { return [CC.SNAP, 9, null, null, function () { st.snap = (st.snap + 7) % 8; value('snap', st.snap, 'sent'); }]; }),
    snapNext: ccOp(function () { return [CC.SNAP, 8, null, null, function () { st.snap = (st.snap + 1) % 8; value('snap', st.snap, 'sent'); }]; }),
    renameSnapshot: { gate: 'write', route: 'net', run: function (p, opts) {
      var i = int(p.i, 0, 7), nm = String(p.name == null ? '' : p.name).slice(0, 16);
      if (i === null) return res(false, 'net', 0, 'bad index');
      if (!devOnline()) return res(false, 'net', 0, 'no-device');
      if (!gate(opts.quiet)) return res(false, 'net', 0, 'disarmed');
      return rpc('/SetSnapshotName', [['i', i], ['s', nm]]).then(function () { dev.snapNames[i] = nm; value('snapname:' + i, nm, 'sent'); emit('dev', { what: 'snapname', i: i }); toast('Renamed'); return res(true, 'net', 1); })
        .catch(function (e) { toast('Rename: ' + e.message); return res(false, 'net', 0, e.message); });
    } },
    knob: ccOp(function (p) { var i = int(p.i, 0, 7); return i === null ? null : [CC.KNOB1 + i, p.v, null, 'knob:' + i, function (v) { st.kv[i] = v; set('kv', st.kv); }]; }),
    exp: ccOp(function (p) { var i = int(p.i, 0, 1); return i === null ? null : [i ? CC.EXP2 : CC.EXP1, p.v, null, 'exp:' + i, function (v) { st.exp[i] = v; set('exp', st.exp); }]; }),
    xy: { gate: 'write', route: 'midi', run: function (p, opts) {
      var x = clamp(Math.round(+p.x || 0), 0, 127), y = clamp(Math.round(+p.y || 0), 0, 127), n = 0;
      if (cc(CC.XYX, x, null, opts.quiet)) { n++; st.xy[0] = x; value('xy:0', x, 'sent'); }
      if (n && cc(CC.XYY, y, null, opts.quiet)) { n++; st.xy[1] = y; value('xy:1', y, 'sent'); }
      if (n) set('xy', st.xy);
      return res(n === 2, 'midi', n);
    } },
    toe: ccOp(function () { return [CC.TOE, 127, null, 'toe']; }),
    fsmode: ccOp(function (p) { var m = int(p.m, 0, 6); return m === null ? null : [CC.FSMODE, m, null, 'fsmode', function (v) { st.fsmode = v; }]; }),
    button: ccOp(function (p) { var n = int(p.n, 0, 127); return n === null ? null : [CC.BTN, n, null, 'button:' + n]; }),
    tap: ccOp(function () { return [CC.TAP, 127, null, 'tap']; }),
    tapTempo: { gate: 'write', route: 'midi', run: function (p, opts) { return sendTaps(+p.bpm || 120, opts.quiet); } },
    tuner: ccOp(function () { return [CC.BTN, 34, null, 'button:34']; }),
    click: ccOp(function () { return [CC.BTN, 23, null, 'button:23']; }),
    muteAll: ccOp(function () { return [CC.BTN, 24, null, 'button:24']; }),
    looper: ccOp(function (p) { var n = int(p.cc, 52, 62); return n === null ? null : [n, p.val, null, 'cc:' + n]; }),
    song: ccOp(function (p) { var n = int(p.cc, 0, 127); return n === null ? null : [n, p.val, null, 'cc:' + n]; }, { minFw: '1.3' }),
    songPlaylist: ccOp(function (p) { return [CC.PLAYLIST, +p.n || 0, null, 'cc:' + CC.PLAYLIST]; }, { minFw: '1.3' }),
    songCue: ccOp(function (p) { return [CC.SONGCUE, +p.n || 0, null, 'cc:' + CC.SONGCUE]; }, { minFw: '1.3' }),
    songMarker: ccOp(function (p) { return [CC.MARKER, +p.n || 0, null, 'cc:' + CC.MARKER]; }, { minFw: '1.3' }),
    stomp: ccOp(function (p) { var n = int(p.cc, 0, 127); return n === null ? null : [n, p.v, chCtl(), 'stomp:' + n]; }),
    param: { gate: 'write', route: 'net', run: function (p, opts) {
      var v = parseFloat(p.v); if (isNaN(v)) return res(false, 'net', 0, 'bad value');
      if (!gate(opts.quiet)) return res(false, 'net', 0, 'disarmed');
      var b = blockAt(p.path, p.slot); if (b) b.vals[p.pid] = v;
      value('param:' + p.path + ':' + p.slot + ':' + p.pid, v, 'sent');
      writeParam(p.path, p.slot, p.pid, v);
      return res(true, 'net', 1);
    } },
    bypass: { gate: 'write', route: 'net', run: function (p, opts) {
      var b = blockAt(p.path, p.slot); if (!b) return res(false, 'net', 0, 'no such block');
      if (!gate(opts.quiet)) return res(false, 'net', 0, 'disarmed');
      b.enabled = !!p.on; value('bypass:' + b.path + ':' + b.slot, b.enabled, 'sent'); emit('dev', { what: 'block', path: b.path, slot: b.slot });
      return rpc('/BlockEnableSet', [['i', b.path], ['i', b.slot], ['i', b.enabled ? 1 : 0]], { timeout: 3000 }).then(function () { return res(true, 'net', 1); })
        .catch(function (e) { toast('Bypass: ' + e.message); return res(false, 'net', 0, e.message); });
    } },
    save: { gate: 'destructive', route: 'net', run: function (p, opts) {
      if (!dev.active) { toast('No active preset known yet'); return res(false, 'net', 0, 'no-active'); }
      if (!gate(opts.quiet)) return res(false, 'net', 0, 'disarmed');
      var act = dev.active;
      return askConfirm({ title: 'Save preset', body: 'Save the edit buffer into "' + act.name + '" on the Helix? This overwrites that preset.', ok: 'Save', danger: true }).then(function (yes) {
        if (!yes) return res(false, 'net', 0, 'declined');
        return rpc('/SavePresetWithCID', [['i', act.cid], ['i', 0], ['i', 0]]).then(function (m) { toast(m.addr === '/status' && m.args[1] === 0 ? 'Saved' : 'Save: device said ' + argsText(m.args)); return res(true, 'net', 1); })
          .catch(function (e) { toast('Save: ' + e.message); return res(false, 'net', 0, e.message); });
      });
    } },
    load: { gate: 'destructive', route: 'net', run: function (p, opts) { return netLoad({ cid_: p.cid, name: p.name }, p.snap == null ? null : int(p.snap, 0, 7), p, opts); } },
    mix: ccOp(function (p) { var n = int(p.cc, 0, 127); return n === null ? null : [n, p.v, mixCh(p.layer), 'mix:' + p.layer + ':' + n]; }, { minFw: '1.4' }),
    clearSolo: ccOp(function (p) { return [CC.CLEARSOLO, 127, mixCh(p.layer), 'mix:' + p.layer + ':' + CC.CLEARSOLO]; }, { minFw: '1.4' }),
    rawMidi: { gate: 'write', route: 'midi', run: function (p, opts) {
      var b = Array.isArray(p.bytes) ? p.bytes.map(Number) : null;
      if (!b || !b.length || b.some(isNaN)) return res(false, 'midi', 0, 'bad bytes');
      var ok = tx(b, opts.quiet); return res(ok, 'midi', ok ? 1 : 0);
    } },
    rawOsc: { gate: 'write', route: 'net', run: function (p, opts) {
      if (!p.addr) return res(false, 'net', 0, 'no address');
      if (!gate(opts.quiet)) return res(false, 'net', 0, 'disarmed'); // a raw command may write
      return rpc(p.addr, p.args || [], { collect: true, timeout: 4000 }).then(function (rs) { return res(true, 'net', 1, '', { frames: rs }); })
        .catch(function (e) { return res(false, 'net', 0, e.message); });
    } },
    readInfo: netRead(function () { return readInfo().then(function () { return dev.info; }); }),
    readActive: netRead(function () { return readActive().then(function () { return dev.active; }); }),
    readEditBuffer: netRead(function () { return readEditBuffer().then(function () { return dev.blocks; }); }),
    readSnapshot: netRead(function () { return readSnapshot().then(function () { return st.snap; }); }),
    refresh: netRead(function () { return devRefresh(); }),
    listContainer: { gate: 'read', route: 'net', run: function (p) {
      var cid = parseInt(p.cid, 10); if (isNaN(cid)) return res(false, 'net', 0, 'bad container');
      return listContainer(cid).then(function (items) { return res(true, 'net', 0, '', { data: items }); }, function (e) { return res(false, 'net', 0, e.message); });
    } },
    loadSetlists: netRead(function (p) { if (p.force) { dev.lists = {}; dev.setlists = []; } return loadSetlists().then(function () { return dev.setlists; }); })
  };
  function op(name, params, opts) {
    var o = OPS[name]; params = params || {}; opts = opts || {};
    if (!o) return Promise.resolve(res(false, 'none', 0, 'unknown op ' + name));
    var r;
    try { r = o.run(params, opts); } catch (e) { console.error('helix op ' + name, e); r = res(false, o.route, 0, e && e.message || 'error'); }
    if (r && typeof r.then === 'function') return r.then(null, function (e) { return res(false, o.route, 0, e && e.message || String(e)); });
    return Promise.resolve(r);
  }
  // the steps an op would take: [{at (ms after the previous step), bytes | rpc:[addr, args]}]
  function planOf(name, p) {
    p = p || {};
    var o = OPS[name]; if (!o) return [];
    if (name === 'recallPreset') {
      var bank = int(p.bank, 0, 127), prog = int(p.prog, 0, 127), snap = p.snap == null ? null : int(p.snap, 0, 7);
      if (bank === null || prog === null) return [];
      if (!hasMidiOut() && devOnline() && p.cid != null) { var n = [{ at: 0, rpc: ['/LoadPresetWithCID', [['i', p.cid]]] }]; if (snap != null) n.push({ at: 700, rpc: ['/activateSnapshot', [['i', snap]]] }); return n; }
      var b = recallBytes(bank, prog, snap), m = [{ at: 0, bytes: b[0] }, { at: 30, bytes: b[1] }]; if (b[2]) m.push({ at: 300, bytes: b[2] }); return m;
    }
    if (name === 'tapTempo') { var ms = Math.round(60000 / clamp(+p.bpm || 120, 30, 280)), t = []; for (var i = 0; i < 4; i++) t.push({ at: i ? ms : 0, bytes: ccBytes(CC.TAP, 127) }); return t; }
    if (name === 'xy') return [{ at: 0, bytes: ccBytes(CC.XYX, +p.x || 0) }, { at: 0, bytes: ccBytes(CC.XYY, +p.y || 0) }];
    if (name === 'snapshot') { var si = int(p.i, 0, 7); return si === null ? [] : devOnline() ? [{ at: 0, rpc: ['/activateSnapshot', [['i', si]]] }] : [{ at: 0, bytes: ccBytes(CC.SNAP, si) }]; }
    if (name === 'rawMidi') return Array.isArray(p.bytes) ? [{ at: 0, bytes: p.bytes.map(Number) }] : [];
    if (o.spec) { var s = o.spec(p); return s ? [{ at: 0, bytes: ccBytes(s[0], s[1], s[2]) }] : []; }
    return [];
  }
  function opInfo(name) { var o = OPS[name]; return o ? { name: name, gate: o.gate, route: o.route, minFw: o.minFw || null } : null; }

  // ---- state snapshot --------------------------------------------------------------------
  function state() {
    return {
      armed: armed(), safe: safe(), on: arm.on, until: arm.until, msg: armMsg, mode: modeApi(), fw: fwInfo(),
      routes: {
        midi: { status: midiStatus(), dest: midiDest(), mode: midi.mode, inp: midi.inp ? midi.inp.name : '', out: midi.out ? midi.out.name : '', err: midi.err, requested: !!midi.access },
        net: { status: netStatus(), host: netHost(), ip: netIp(), ports: br.status && br.status.ports || null, want: br.want, open: br.open, url: brUrl(), defs: !!(br.status && br.status.defs), transport: transport() },
        usb: usbInfo()
      },
      via: via(), dest: destText(),
      dev: { product: dev.info, name: dev.info ? dev.info.name : '', active: dev.active, snap: st.snap, snapNames: dev.snapNames, blocks: dev.blocks, setlists: dev.setlists, lists: dev.lists, tuner: dev.tuner, alive: dev.alive },
      st: { setlist: st.setlist, prog: st.prog, snap: st.snap, snapAfter: st.snapAfter, kv: st.kv, exp: st.exp, xy: st.xy, fsmode: st.fsmode, lastIn: st.lastIn, lastOut: st.lastOut },
      channels: { global: chGlobal(), ctl: chCtl() }
    };
  }
  function modeApi(name) {
    if (name === undefined) { var m = g('mode', 'perform'); return m === 'edit' ? 'edit' : 'perform'; }
    if (name !== 'perform' && name !== 'edit') return modeApi();
    if (g('mode', 'perform') !== name) { set('mode', name); emit('state', { what: 'mode' }); }
    return name;
  }
  // the address the Edit face composes (setlist / preset / snapshot after)
  function address(o) {
    if (o && typeof o === 'object') {
      if (o.setlist !== undefined) { st.setlist = int(o.setlist, 0, 127); if (st.setlist === null) st.setlist = 0; set('setlist', st.setlist); }
      if (o.prog !== undefined) { st.prog = int(o.prog, 0, 127); if (st.prog === null) st.prog = 0; set('prog', st.prog); }
      if (o.snapAfter !== undefined) st.snapAfter = o.snapAfter == null ? null : int(o.snapAfter, 0, 7);
      emit('state', { what: 'address' });
    }
    return { setlist: st.setlist, prog: st.prog, snapAfter: st.snapAfter };
  }

  // ---- lifecycle --------------------------------------------------------------------------
  var tempoT = 0;
  function init() {
    if (inited) return; inited = true;
    // lifecycle disarms (null): another window, a hidden app, the app's own MIDI changing
    window.addEventListener('blur', function () { disarm('Window focus lost. Output disarmed.'); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') disarm('App hidden. Output disarmed.'); });
    A.on('midi:state', function () { midiPick(); });
    // in 'app' mode the shared service owns the Helix port: its raw tap feeds Observed + echoes
    A.on('midi:raw', function (d) { if (midi.mode === 'app' && d && d.bytes && isHelix({ name: d.port || '' })) onMidiIn(Array.prototype.slice.call(d.bytes)); });
    // follow-tempo taps stay quiet when disarmed (the page may be hidden)
    A.on('tempo', function (d) { if (g('followTempo', false) && d && d.bpm && d.source !== 'helix') { clearTimeout(tempoT); tempoT = setTimeout(function () { sendTaps(d.bpm, true); }, 600); } });
  }
  function setVisible(on) {
    if (on === undefined) return visible;
    visible = !!on;
    if (!visible && br.retry) { clearTimeout(br.retry); br.retry = null; }
    return visible;
  }

  A.helix = {
    v: 1,
    init: init, state: state, on: on, off: off,
    arm: armApi, disarm: disarm, armed: armed, safe: safe, setSafe: setSafe, gate: gateApi, canArm: canArm, armMessage: armMessage,
    routes: {
      midi: { status: midiStatus, connect: midiConnect, dest: midiDest, mode: function () { return midi.mode; }, requested: function () { return !!midi.access; } },
      net: { status: netStatus, connect: function () { set('bridgeAuto', true); brConnect(); }, disconnect: function () { set('bridgeAuto', false); brClose(); }, url: brUrl,
        setUrl: function (u) { set('bridge', String(u == null ? '' : u)); if (br.want) { brClose(); brConnect(); } }, telemetry: brTele, online: devOnline },
      usb: { status: usbStatus, caption: usbCaption, connect: usbConnect, prefer: usbPrefer, info: usbInfo, transport: transport }
    },
    via: via, dest: destText,
    ui: ui,
    op: op, plan: planOf, cancel: function () { return cancelPlan('cancelled'); }, opInfo: opInfo, values: values,
    favs: favs, saveFav: saveFav, removeFav: removeFav, favById: favById, addrOf: addrOf, favFromItem: favFromItem, favActive: favActive, recallFav: recallFav, recallBytes: recallBytes,
    observed: observed, clearObserved: clearObs, ledger: function () { return ledgerRows; },
    isHelix: isHelix, hasMidiOut: hasMidiOut, devOnline: devOnline, fwOk: fwOk, setFwConfirmed: setFwConfirmed,
    defs: { shortName: shortName, modelName: modelName, modelLabel: modelLabel, paramDefs: paramDefs, catLabel: catLabel, cat: function (t) { return CATS[t] || ''; }, fmt: fmtParam, blockAt: blockAt },
    mode: modeApi, address: address, visible: setVisible, learn: function (fn) { learnFn = typeof fn === 'function' ? fn : null; },
    tables: { CC: CC, BUTTONS: BUTTONS, FSMODES: FSMODES, MIX: MIX, LAYERS: LAYERS, CATS: CATS },
    fmt: { slotLabel: slotLabel, bankName: bankName, addrLabel: addrLabel, favDetail: favDetail, hex: hex, ago: ago, ccName: ccName, argsText: argsText },
    // the test hook's window: live objects, read-only for callers
    internals: function () { return { st: st, dev: dev, midi: midi, br: br, arm: arm, obs: obs, rx: rx, cc: cc, pc: pc, tx: tx, rpc: rpc, onMidiIn: onMidiIn, useEditBuffer: useEditBuffer }; }
  };
})();
