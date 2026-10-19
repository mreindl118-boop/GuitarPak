/* GuitarLab MIDI service — MIDI in/out for USB/Bluetooth keyboards
 * (ROLI LUMI, Launchkey, any class-compliant controller).
 *
 * Two backends behind one App.midi surface:
 *   - Web MIDI API (Chrome/Edge desktop + Android)
 *   - the iOS wrapper's CoreMIDI bridge (window.webkit.messageHandlers.midi
 *     + window.__glMIDI callbacks) — Bluetooth MIDI on iPad included, with a
 *     native pairing sheet via App.midi.bluetooth()
 *
 * Loaded right after app.js so every module can use it. Broadcasts on the bus:
 *   'midi:state'    {supported, ready, inputName, outputName}
 *   'midi:note'     {on, midi, vel, chan}      note on/off (vel 0-127)
 *   'midi:bend'     {chan, semis}              pitch bend in semitones
 *   'midi:pressure' {chan, val}                channel pressure 0-127
 *   'midi:raw'      {bytes}                    every incoming message, untouched
 *   'midi:out'      {bytes}                    every message sent to the output
 *
 * MPE-style per-note expression works out of the box because bend/pressure
 * are reported per channel and consumers apply them to the notes held on
 * that channel (ROLI sends each key on its own channel).
 *
 * Output: THE KEYBED engine (below) decides what the keyboard's own lights
 * show — the scale by the app-wide Help level, plus guide / reveal layers —
 * with note messages (most LED keyboards light incoming notes, velocity as
 * brightness) and, for a ROLI LUMI, its SysEx scale mode (community-
 * documented protocol — a harmless no-op on other devices). Controls live in
 * Lights & help (js/lights.js).
 *
 * Connecting is opt-in (Settings / Lights & help). Where neither backend
 * exists (iOS Safari PWA, the Android APK's WebView), the UI says so.
 */
(function () {
  'use strict';

  // native backends speak one protocol: the iOS wrapper's CoreMIDI bridge
  // and the Android APK's MidiBridge (USB + Bluetooth LE MIDI)
  var iosMidi = !!(window.webkit && window.webkit.messageHandlers &&
                   window.webkit.messageHandlers.midi);
  var androidMidi = !!(window.SoundLabMidi && window.SoundLabMidi.post);
  var native = iosMidi || androidMidi;

  var access = null;                    // Web MIDI backend
  var input = null, output = null;
  var nativeReady = false;              // CoreMIDI bridge backend
  var nativePorts = { inputs: [], outputs: [] };
  var nativeInId = null, nativeOutId = null;
  var held = {};                        // midi -> vel (currently held notes)
  var bendRange = App.store.get('midi.bendRange', 2);
  if ([2, 12, 48].indexOf(bendRange) === -1) bendRange = 2;
  // pitch bend is OFF unless switched on in Settings (midi.bendOn): a LUMI's
  // key-wiggle bends every note out of tune while you practice
  function bendOn() { return App.store.get('midi.bendOn', false) === true; }

  function post(msg) {
    try {
      if (iosMidi) window.webkit.messageHandlers.midi.postMessage(msg);
      else if (androidMidi) window.SoundLabMidi.post(JSON.stringify(msg));
      return true;
    } catch (e) { return false; }
  }

  function supported() { return native || (typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess); }
  function ready() { return native ? nativeReady : !!access; }

  function portName(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
    return null;
  }

  function announce() {
    App.emit('midi:state', {
      supported: supported(),
      ready: ready(),
      inputName: native ? portName(nativePorts.inputs, nativeInId)
                        : (input ? (input.name || 'input') : null),
      outputName: native ? portName(nativePorts.outputs, nativeOutId)
                         : (output ? (output.name || 'output') : null)
    });
  }

  function listPorts(map) {
    if (native) return nativePorts[map].slice();
    var out = [];
    if (access) access[map].forEach(function (p) { out.push({ id: p.id, name: p.name || p.id }); });
    return out;
  }

  // one complete channel message -> app events
  function dispatch(d) {
    if (!d || d.length < 2) return;
    var st = d[0] & 0xf0, chan = d[0] & 0x0f;
    if (st === 0x90 && d[2] > 0) {
      held[d[1]] = d[2];
      App.emit('midi:note', { on: true, midi: d[1], vel: d[2], chan: chan });
    } else if (st === 0x80 || (st === 0x90 && d[2] === 0)) {
      delete held[d[1]];
      App.emit('midi:note', { on: false, midi: d[1], vel: 0, chan: chan });
    } else if (st === 0xe0) {
      var raw = ((d[2] << 7) | d[1]) - 8192;
      if (bendOn()) App.emit('midi:bend', { chan: chan, semis: (raw / 8192) * bendRange });
    } else if (st === 0xd0) {
      App.emit('midi:pressure', { chan: chan, val: d[1] });
    } else if (st === 0xa0) { // poly aftertouch -> pressure for that channel
      App.emit('midi:pressure', { chan: chan, val: d[2] });
    }
  }

  // RAW TAP + INPUT FILTER (the MIDI Hub page, js/midihub.js): every incoming
  // message — channel, SysEx and realtime alike — is broadcast as 'midi:raw'
  // {bytes} before anything else happens, and a registered input filter
  // (App.midi.setInputFilter) may rewrite or drop a channel message before
  // the app hears it (the Hub's rules: transpose, remap, block…).
  var inputFilter = null;
  function hear(bytes) {
    App.emit('midi:raw', { bytes: bytes });
    if (!inputFilter) return bytes;
    try { return inputFilter(bytes) || null; } catch (e) { return bytes; }
  }

  function onMsg(e) {
    var d = hear(Array.prototype.slice.call(e.data));
    if (d) dispatch(d);
  }

  // CoreMIDI packets can pack several messages (and use running status) in
  // one byte string — split into complete messages before dispatching
  var MSG_LEN = { 0x80: 3, 0x90: 3, 0xa0: 3, 0xb0: 3, 0xc0: 2, 0xd0: 2, 0xe0: 3 };

  function splitAndDispatch(bytes) {
    var i = 0, lastStatus = 0;
    while (i < bytes.length) {
      var b = bytes[i];
      if (b === 0xf0) {              // sysex: tapped for the Hub, never dispatched
        var sx = [];
        while (i < bytes.length && bytes[i] !== 0xf7) sx.push(bytes[i++]);
        if (i < bytes.length) sx.push(bytes[i++]);
        App.emit('midi:raw', { bytes: sx });
        continue;
      }
      if (b >= 0xf8) { App.emit('midi:raw', { bytes: [b] }); i++; continue; } // realtime
      var status = b >= 0x80 ? b : lastStatus; // running status
      if (b >= 0x80) i++;
      var len = MSG_LEN[status & 0xf0];
      if (!status || !len) { i++; continue; }
      lastStatus = status;
      var msg = [status];
      for (var k = 1; k < len && i < bytes.length; k++, i++) msg.push(bytes[i]);
      if (msg.length === len) { msg = hear(msg); if (msg) dispatch(msg); }
    }
  }

  // ---- Web MIDI backend ----

  function pickWebInput(id) {
    if (input) { try { input.onmidimessage = null; } catch (e) {} }
    input = null;
    if (access && id) access.inputs.forEach(function (p) { if (p.id === id) input = p; });
    if (!input && access) access.inputs.forEach(function (p) { if (!input) input = p; });
    if (input) {
      input.onmidimessage = onMsg;
      App.store.set('midi.inputId', input.id);
    }
    announce();
  }

  function pickWebOutput(id) {
    var nextOutput = null;
    if (access && id) access.outputs.forEach(function (port) {
      if (port.id === id && port.state !== 'disconnected') nextOutput = port;
    });
    if (!nextOutput && access && !id) access.outputs.forEach(function (port) {
      if (!nextOutput && port.state !== 'disconnected') nextOutput = port;
    });
    if (nextOutput !== output) {
      allDark();
      resetOutputLights();
    }
    output = nextOutput;
    if (output) App.store.set('midi.outputId', output.id);
    announce();
  }

  // ---- native (CoreMIDI bridge) backend ----

  window.__glMIDI = {
    onports: function (p) {
      if (!p) return;
      nativePorts.inputs = (p.inputs || []).map(function (x) { return { id: x.id, name: x.name }; });
      nativePorts.outputs = (p.outputs || []).map(function (x) { return { id: x.id, name: x.name }; });
      // restore / default picks
      var storedIn = App.store.get('midi.inputId', null);
      nativeInId = portName(nativePorts.inputs, storedIn) !== null ? storedIn
        : (nativePorts.inputs.length ? nativePorts.inputs[0].id : null);
      var storedOut = App.store.get('midi.outputId', null);
      var nextOutputId = portName(nativePorts.outputs, storedOut) !== null ? storedOut
        : (storedOut == null && nativePorts.outputs.length ? nativePorts.outputs[0].id : null);
      if (nextOutputId !== nativeOutId) {
        allDark();
        resetOutputLights();
      }
      nativeOutId = nextOutputId;
      if (nativeOutId !== null) post({ cmd: 'setOutput', id: nativeOutId });
      announce();
    },
    onmidi: function (srcId, bytes) {
      if (!nativeReady || !bytes) return;
      if (nativeInId !== null && srcId !== 0 && srcId !== nativeInId) return;
      splitAndDispatch(bytes);
    },
    // Bluetooth progress from the Android bridge ("Looking…", "Connected: LUMI")
    onstatus: function (text) { App.emit('midi:status', { text: String(text || '') }); }
  };

  function enable() {
    if (native) {
      nativeReady = true;
      post({ cmd: 'init' });
      announce();
      return Promise.resolve();
    }
    if (!supported()) { announce(); return Promise.reject(new Error('no Web MIDI')); }
    if (access) { announce(); return Promise.resolve(access); }
    // sysex first (LUMI sync needs it); plain fallback if the user declines
    return navigator.requestMIDIAccess({ sysex: true }).catch(function () {
      return navigator.requestMIDIAccess();
    }).then(function (a) {
      access = a;
      a.onstatechange = function () {
        pickWebInput(App.store.get('midi.inputId', null));
        pickWebOutput(App.store.get('midi.outputId', null));
      };
      pickWebInput(App.store.get('midi.inputId', null));
      pickWebOutput(App.store.get('midi.outputId', null));
      return a;
    });
  }

  function setInput(id) {
    if (native) {
      nativeInId = typeof id === 'string' ? parseInt(id, 10) : id;
      if (isNaN(nativeInId)) nativeInId = null;
      App.store.set('midi.inputId', nativeInId);
      announce();
      return;
    }
    pickWebInput(id);
  }

  function setOutput(id) {
    if (native) {
      var requestedOutputId = typeof id === 'string' ? parseInt(id, 10) : id;
      if (isNaN(requestedOutputId)) requestedOutputId = null;
      var nextOutputId = portName(nativePorts.outputs, requestedOutputId) !== null ? requestedOutputId : null;
      if (nextOutputId !== nativeOutId) {
        allDark();
        resetOutputLights();
      }
      nativeOutId = nextOutputId;
      App.store.set('midi.outputId', requestedOutputId);
      if (nativeOutId !== null) post({ cmd: 'setOutput', id: nativeOutId });
      announce();
      return;
    }
    pickWebOutput(id);
  }

  function hasOutput() {
    return native ? nativeOutId !== null : !!(output && output.state !== 'disconnected');
  }

  function sendBytes(bytes) {
    if (!hasOutput()) return false;
    // the Hub's monitor sees every outgoing byte ('midi:out'); the bridge's
    // post() swallows errors, so there it is reported as sent
    if (native) { var r = post({ cmd: 'send', data: bytes }); App.emit('midi:out', { bytes: bytes }); return r; }
    try { output.send(bytes); } catch (e) { return false; }
    App.emit('midi:out', { bytes: bytes });
    return true;
  }

  // ---- LED output (generic: devices light incoming notes) ----

  var lit = {};

  function resetOutputLights() {
    lit = {};
    lumiShown = null;
  }

  function light(midi, vel) {
    if (!hasOutput()) return;
    midi = Math.max(0, Math.min(127, Math.round(midi)));
    var v = Math.max(1, Math.min(127, Math.round(vel == null ? 100 : vel)));
    if (sendBytes([0x90, midi, v])) lit[midi] = v;
  }

  function dark(midi) {
    if (!hasOutput()) return;
    midi = Math.max(0, Math.min(127, Math.round(midi)));
    if (sendBytes([0x80, midi, 0])) delete lit[midi];
  }

  function allDark() {
    Object.keys(lit).forEach(function (m) { dark(Number(m)); });
  }

  // ---- ROLI LUMI sync (community-documented SysEx: benob/LUMI-lights) ----
  // Pushes root key, scale, light mode and the app's degree COLORS to a LUMI
  // (USB or Bluetooth — same bytes either way). The hardware supports exactly
  // TWO colors: the root color and the in-scale color; we map degree 1 and
  // degree 5 of the app's palette (fb.colors). Values pack as a 5-bit type +
  // value spread over 7-bit bytes; frame device id 0x37 = LUMI. Wrong bytes
  // are simply ignored by non-LUMI devices.

  var LUMI_SCALES = { // app scale id -> LUMI scale index (documented set)
    major: 0, aeolian: 1, harmonicMinor: 2, majorPent: 4, minorPent: 5,
    blues: 6, dorian: 7, phrygian: 8, lydian: 9, mixolydian: 10, locrian: 11
  };
  var LUMI_MODES = { rainbow: 0, scale: 1, piano: 2, night: 3 };

  function lumiChecksum(bytes) {
    var c = bytes.length;
    for (var i = 0; i < bytes.length; i++) c = (c * 3 + bytes[i]) & 0xff;
    return c & 0x7f;
  }

  function lumiCmd(cmd) {
    if (!hasOutput() || !sysexOk()) return false;
    while (cmd.length < 8) cmd.push(0);
    // device id is topology-dependent (0x37 on the documented unit, 0x00 =
    // broadcast per the same doc's own uncertainty) — send BOTH; the config
    // frames are idempotent, so whichever id this LUMI answers to wins
    var tail = cmd.concat([lumiChecksum(cmd), 0xf7]);
    var sentSpecific = sendBytes([0xf0, 0x00, 0x21, 0x10, 0x77, 0x37].concat(tail));
    var sentBroadcast = sendBytes([0xf0, 0x00, 0x21, 0x10, 0x77, 0x00].concat(tail));
    return sentSpecific && sentBroadcast;
  }

  function lumiVal(type, v) { // <5-bit type><value> from byte 3 of the command
    return [(type | ((v & 3) << 5)) & 0x7f, (v >> 2) & 0x7f];
  }

  function brightness() { var b = parseInt(App.store.get('lights.bright', 80), 10); return b >= 5 && b <= 100 ? b : 80; }

  function hexRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    var n = m ? parseInt(m[1], 16) : 0xffab47;
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }

  function lumiColor(reg, hex) { // reg 0x20 = in-scale color, 0x30 = root color
    var c = hexRgb(hex);
    lumiCmd([0x10, reg,
      ((c.b & 0x03) << 5) | 0x04,
      ((c.b >> 2) & 0x3f) | ((c.g & 1) << 6),
      (c.g >> 1) & 0x7f,
      c.r & 0x7f,
      ((c.r >> 7) & 1) | 0x7e,
      0x03]);
  }

  function sysexOk() { return native ? true : !!(access && access.sysexEnabled); }

  // the LUMI's OWN scale display (key, scale, two colors) — what it shows
  // when the app's lights are off
  function lumiNative() {
    if (!isLumi() || !hasOutput()) return;
    var root = App.store.get('fb.root', 9);
    var scaleId = App.store.get('fb.scale', 'minorPent');
    var key = Theory.mod12(typeof root === 'number' ? root : 9);
    lumiCmd([0x10, 0x30].concat(lumiVal(0x03, key)));
    var sc = LUMI_SCALES[scaleId];
    if (sc !== undefined) lumiCmd([0x10, 0x60].concat(lumiVal(0x02, sc)));
    lumiCmd([0x10, 0x40].concat(lumiVal(0x02, LUMI_MODES.scale)));
    lumiCmd([0x10, 0x40].concat(lumiVal(0x04, brightness())));
    var cols = App.store.get('fb.colors', null) || [];
    // overridable in Settings — LED color rendering differs from screens, so
    // the two hardware slots can be dialed by eye; defaults follow the palette
    var rootC = App.store.get('midi.lumiRoot', '') || cols[0] || '#ffab47';
    var scaleC = App.store.get('midi.lumiScale', '') || cols[4] || '#6ea8fe';
    lumiColor(0x30, rootC);  // root key slot
    lumiColor(0x20, scaleC); // in-scale key slot
  }

  // ---- THE KEYBED: one lighting engine for every page ----
  // What the keyboard's own lights show follows the app-wide HELP LEVEL
  // (App.help — the same knob that sets what the on-screen keys show):
  //   Full / Colors  the scale in color — on a LUMI every key in its own
  //                  degree color, exactly like the screen (per-key note-on
  //                  colors over a dark night-mode background); other LED
  //                  keyboards get the in-scale keys lit, the root brightest
  //   Target / Tonic only the home keys glow
  //   None           dark: play from memory
  // On top, pages add a GUIDE (guide(now, next): the key to play now, the
  // next one blinking — Keys runner, Guide mode, scale lessons, the chord
  // player) and REVEALS (reveal(pcs, ms): Exercises shows the answer after
  // you play). hideLayout(owner, on) darkens the layout while it would give
  // answers away (an Exercises question); claim(owner) hands the whole keybed
  // to one page (Pads paints its own 8 keys). Everything folds into the
  // RANGE the keyboard is playing — learned from the notes you play, so a
  // LUMI's octave buttons are followed (range(), 'midi:range').
  // Settings: lights.on (false = leave the keyboard's lights alone),
  // lights.bright, midi.lumi (null = detect a LUMI by its port name),
  // midi.lumiRoot / midi.lumiScale = the LUMI's own two colors when the app's
  // lights are off (lumiNative). Note-on lighting is for
  // controllers (they light silently); a sound module on the output would
  // play the notes, so lights stay off until a keyboard output is chosen.

  var LIGHT_LO = 24, LIGHT_HI = 108;

  // A LUMI colors EACH KEY by the velocity of the note sent to it: its
  // default program lights an incoming note in colourLookup[velocity] (0 off,
  // 1-126 a hue sweep red > yellow > green > cyan > blue > violet, 127 white),
  // only within its current 24-key octave window. So the app's degree colors
  // go to the keybed one key at a time, matched to the nearest table color.
  var LUMI_TABLE = (function () {
    var hex = '000000ff506fff546cff5869ff5c66ff6063ff6460ff695cff6d59ff7156ff7553ff7950ff7d4dff814aff8547ff8944ff8d41ff923dff963aff9a37ff9e34ffa231ffa62effaa2effae2dffb12dffb52cffb92cffbd2bffc12bffc42bffc82affcc2affd029ffd429ffd828ffdb28ffdf28ffe327ffe727ffeb26ffee26fff225fff625f7f62af0f72ee8f733e1f837d9f83cd1f841caf945c2f94abaf94fb3fa53abfa58a4fb5c9cfb6194fb668dfc6a85fc6f7dfc7476fd786efd7d67fe815ffe865cfc8b59fa8f56f89453f69850f49d4df2a24af0a647eeab44ecb041eab43ee9b93be7bd38e5c235e3c732e1cb2fdfd02cddd529dbd926d9de23d7e220d5e723d0e826cbe929c6ea2cc1ec2fbced32b7ee35b2ef38adf03ba8f13ea3f2409ff4439af54695f64990f74c8bf84f86f95281fa557cfc5877fd5b72fe5e6dff616bfe6469fd6767fc6b64fb6e62fa7160f9745ef8775cf77a5af67e58f58155f38453f28751f18a4ff08d4def904bee9448ed9746ec9a44eb9d42eaffffff', out = [];
    for (var i = 0; i < 128; i++) out.push(parseInt(hex.substr(i * 6, 6), 16));
    return out;
  })();
  var lumiVelCache = {};
  function lumiVel(hex) { // nearest LUMI palette entry (1-126) to a CSS hex color
    if (lumiVelCache[hex]) return lumiVelCache[hex];
    var c = parseInt(String(hex).replace('#', ''), 16) || 0;
    var r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, best = 1, bd = 1e12;
    for (var i = 1; i < 127; i++) {
      var t = LUMI_TABLE[i], r2 = (t >> 16) & 255, g2 = (t >> 8) & 255, b2 = t & 255, rm = (r + r2) / 2;
      var d = (2 + rm / 256) * (r - r2) * (r - r2) + 4 * (g - g2) * (g - g2) + (2 + (255 - rm) / 256) * (b - b2) * (b - b2);
      if (d < bd) { bd = d; best = i; }
    }
    lumiVelCache[hex] = best;
    return best;
  }
  function palette() {
    var cols = App.store.get('fb.colors', null);
    return Array.isArray(cols) && cols.length === 7 ? cols : ['#ffab47', '#e8d44d', '#7ad97a', '#4cc9b0', '#6ea8fe', '#b48ef0', '#ff85b3'];
  }
  // the LUMI velocity (= color) for a key in the current scale, 0 = not in it
  function lumiKeyVel(m) {
    var root = App.store.get('fb.root', 9), rootPc = Theory.mod12(typeof root === 'number' ? root : 9);
    var info = Theory.scaleInfo(rootPc, App.store.get('fb.scale', 'minorPent'));
    var step = info.pcToStep.get(Theory.mod12(m));
    return step === undefined ? 0 : lumiVel(palette()[step % 7]);
  }
  var LUMI_WHITE = 127, LUMI_GREEN = 60;
  var guideNow = [], guideNext = [], blinkOn = false, blinkT = null;
  var revealSet = [], revealT = null, hidden = {}, claimedBy = null;
  var lumiShown = null; // last LUMI mode pushed: 'scale' | 'night'

  // on by default for a LUMI (SysEx scale colors are safe); other outputs stay
  // opt-in — a sound module there would PLAY note-on lights (old midi.lights)
  function lightsOn() {
    var v = App.store.get('lights.on', null);
    if (v === true || v === false) return v;
    return isLumi() || App.store.get('midi.lights', 'off') !== 'off';
  }
  // v0.74: the old opt-in "LUMI sync" checkbox becomes auto-detect
  if (!App.store.get('lights.v1', false)) {
    if (App.store.get('midi.lumi', null) === false) App.store.set('midi.lumi', null);
    App.store.set('lights.v1', true);
  }
  function helpLvl() { return App.help ? App.help.level() : 4; }
  function outName() {
    return native ? (portName(nativePorts.outputs, nativeOutId) || '') : (output ? (output.name || '') : '');
  }
  function isLumi() {
    var m = App.store.get('midi.lumi', null);
    if (m === true || m === false) return m;
    return /lumi/i.test(outName()) || /lumi/i.test(native ? (portName(nativePorts.inputs, nativeInId) || '') : (input ? input.name || '' : ''));
  }

  // ---- the playing range (a LUMI = 24 keys; its octave buttons move it) ----
  function rangeSize() { return isLumi() ? 24 : 61; }
  var rangeLo = parseInt(App.store.get('midi.rangeLo', 48), 10);
  if (!(rangeLo >= 0 && rangeLo <= 108)) rangeLo = 48;
  function range() { return { lo: rangeLo, hi: rangeLo + rangeSize() - 1, keys: rangeSize(), lumi: isLumi() }; }
  function learnRange(midi) {
    var r = range(), lo = rangeLo;
    if (midi < r.lo) lo -= 12 * Math.ceil((r.lo - midi) / 12);
    else if (midi > r.hi) lo += 12 * Math.ceil((midi - r.hi) / 12);
    if (lo === rangeLo) return;
    rangeLo = Math.max(0, Math.min(108, lo));
    App.store.set('midi.rangeLo', rangeLo);
    App.emit('midi:range', range());
    paint();
  }
  function fold(m) { // the same note, moved by octaves onto keys the keyboard has
    var r = range();
    if (r.keys < 12) return m;
    while (m < r.lo) m += 12;
    while (m > r.hi) m -= 12;
    return m;
  }
  function list(v) { return v == null || v === -1 ? [] : (Array.isArray(v) ? v : [v]); }

  function degVel(midi) {
    var root = App.store.get('fb.root', 9);
    var rootPc = Theory.mod12(typeof root === 'number' ? root : 9);
    var info = Theory.scaleInfo(rootPc, App.store.get('fb.scale', 'minorPent'));
    if (info.pcToStep.get(Theory.mod12(midi)) === undefined) return 0; // out of scale
    var semi = Theory.mod12(midi - rootPc);
    if (semi === 0) return 127;                          // the root, brightest
    return (semi === 3 || semi === 4 || semi === 7)      // 3rd (either) + 5th:
      ? 100 : 72;                                        // chord tones, any scale
  }

  // which layout the keybed shows right now: 'scale' | 'tonic' | 'none'
  function layoutKind() {
    if (claimedBy) return 'none';
    for (var k in hidden) if (hidden[k]) return 'none';
    var h = helpLvl();
    return h >= 3 ? 'scale' : h >= 1 ? 'tonic' : 'none';
  }

  // the note-on lights wanted now: layout + reveals + guide. A LUMI gets
  // COLORS (velocity = palette index): every scale key in its degree color,
  // the note to play white, answers green. Other keyboards get brightness.
  function wanted() {
    var want = {}, kind = layoutKind(), r = range(), lumi = isLumi();
    var lo = Math.max(LIGHT_LO, r.lo), hi = Math.min(LIGHT_HI, r.hi), m, v;
    var root = App.store.get('fb.root', 9), rootPc = Theory.mod12(typeof root === 'number' ? root : 9);
    if (kind === 'scale') {
      for (m = lo; m <= hi; m++) { v = lumi ? lumiKeyVel(m) : degVel(m); if (v) want[m] = v; }
    } else if (kind === 'tonic') {
      for (m = lo; m <= hi; m++) if (Theory.mod12(m) === rootPc) want[m] = lumi ? lumiVel(palette()[0]) : 70;
    }
    revealSet.forEach(function (pc) { for (var x = lo; x <= hi; x++) if (Theory.mod12(x) === pc) want[x] = lumi ? LUMI_GREEN : 127; });
    var h = helpLvl();
    if (h >= 2) list(guideNow).forEach(function (n) { want[fold(n)] = lumi ? LUMI_WHITE : 127; });
    if (h >= 3) list(guideNext).forEach(function (n) {
      var f = fold(n);
      if (want[f] === LUMI_WHITE || want[f] === 127) return; // it's also the note to play now
      if (!blinkOn) delete want[f];                          // the next note blinks
      else want[f] = lumi ? (lumiKeyVel(f) || lumiVel(palette()[0])) : 45;
    });
    return want;
  }

  // compose + diff: only changed keys are sent
  function paint(force) {
    if (!hasOutput()) return;
    if (claimedBy) {
      if (force === true) {
        if (isLumi()) lumiLayout();
        Object.keys(lit).forEach(function (note) { light(Number(note), lit[note]); });
      }
      return;
    }
    if (!lightsOn()) { allDark(); return; }
    if (isLumi()) lumiLayout();
    var want = wanted(), m;
    for (m in lit) if (!want[m]) dark(Number(m));
    for (m in want) if (force === true || lit[m] !== want[m]) light(Number(m), want[m]);
  }

  // the app paints a LUMI key by key, so its own background goes dark (night
  // mode) — then only the app's colors show; brightness rides along
  function lumiLayout(force) {
    if (lumiShown === 'night' && !force) return;
    var sentMode = lumiCmd([0x10, 0x40].concat(lumiVal(0x02, LUMI_MODES.night)));
    var sentBrightness = lumiCmd([0x10, 0x40].concat(lumiVal(0x04, brightness())));
    lumiShown = sentMode && sentBrightness ? 'night' : null;
  }

  function setGuide(now, next) {
    guideNow = list(now);
    guideNext = list(next);
    if (blinkT) { clearInterval(blinkT); blinkT = null; }
    blinkOn = true;
    if (guideNext.length) blinkT = setInterval(function () { blinkOn = !blinkOn; paint(); }, 320);
    paint();
  }

  App.on('note:input', function () { /* on-screen notes: the screen shows them */ });
  App.on('midi:note', function (d) { if (d && d.on && !d.silent) learnRange(d.midi); });

  // follow the app's key/scale/colors/help live
  function repaintAll(force) { lumiShown = null; paint(force === true); }
  App.on('fb:set', repaintAll);
  App.on('fb:scale', repaintAll);
  App.on('midi:state', repaintAll);
  App.on('help:level', function () { paint(); });

  // auto-reconnect: once MIDI was enabled and the permission granted, later
  // sessions (and app updates) reconnect silently — the LUMI is just there
  if (App.store.get('midi.wanted', false) === true) {
    setTimeout(function () { enable().catch(function () { /* prompt needed again */ }); }, 50);
  }

  App.midi = {
    get supported() { return supported(); },
    get native() { return native; },
    get ready() { return ready(); },
    get inputs() { return listPorts('inputs'); },
    get outputs() { return listPorts('outputs'); },
    get inputId() { return native ? nativeInId : (input ? input.id : null); },
    get outputId() { return native ? nativeOutId : (output ? output.id : null); },
    get hasOutput() { return hasOutput(); },
    get held() { return Object.keys(held).map(Number); },
    get bendRange() { return bendRange; },
    get bendOn() { return bendOn(); },
    setBendOn: function (on) {
      App.store.set('midi.bendOn', !!on);
      // switching off lets go of any bend still applied, on every channel
      if (!on) for (var c = 0; c < 16; c++) App.emit('midi:bend', { chan: c, semis: 0 });
    },
    setBendRange: function (r) {
      bendRange = [2, 12, 48].indexOf(r) !== -1 ? r : 2;
      App.store.set('midi.bendRange', bendRange);
    },
    enable: function () { App.store.set('midi.wanted', true); return enable(); },
    // raw access for the MIDI Hub page: send any bytes to the output (channel
    // messages, SysEx, realtime) and install ONE input filter fn(bytes) ->
    // bytes | null that runs before dispatch (null drops the message)
    send: function (bytes) { return sendBytes(bytes); },
    setInputFilter: function (fn) { inputFilter = typeof fn === 'function' ? fn : null; },
    get inputFilter() { return inputFilter; },
    setInput: setInput,
    setOutput: setOutput,
    bluetooth: function () { if (native) post({ cmd: 'bluetooth' }); },
    light: light,
    dark: dark,
    allDark: allDark,
    // the keybed engine (see THE KEYBED above)
    guide: setGuide,
    reveal: function (pcs, ms) {
      clearTimeout(revealT);
      revealSet = helpLvl() >= 2 ? list(pcs).map(function (n) { return Theory.mod12(n); }) : [];
      paint();
      if (revealSet.length) revealT = setTimeout(function () { revealSet = []; paint(); }, ms || 1500);
    },
    hideLayout: function (owner, on) { hidden[owner] = !!on; paint(); },
    claim: function (owner) { if (claimedBy !== owner) { allDark(); claimedBy = owner; if (isLumi()) { lumiShown = null; lumiCmd([0x10, 0x40].concat(lumiVal(0x02, LUMI_MODES.night))); } } },
    lumiColor: function (hex) { return '#' + ('00000' + LUMI_TABLE[lumiVel(hex)].toString(16)).slice(-6); }, // what a LUMI shows for a screen color
    get platform() { return iosMidi ? 'ios' : androidMidi ? 'android' : 'web'; },
    release: function (owner) { if (claimedBy === owner) { allDark(); claimedBy = null; repaintAll(); } },
    repaint: function () { repaintAll(true); },
    lumiSync: function () { repaintAll(true); },
    range: range,
    fold: fold,
    get lumi() { return isLumi(); },
    get outputName() { return outName(); },
    get lightsOn() { return lightsOn(); },
    setLightsOn: function (on) {
      App.store.set('lights.on', !!on);
      if (!on) { allDark(); if (isLumi() && hasOutput()) { lumiShown = null; lumiNative(); } }
      repaintAll();
    },
    test: function () { // a C major arpeggio across the range, then back to normal
      if (!hasOutput()) return false;
      var r = range(), base = r.lo - Theory.mod12(r.lo) + 12 * Math.floor((r.keys - 12) / 24);
      [0, 4, 7, 12].forEach(function (o, i) {
        setTimeout(function () { light(fold(base + o), 127); }, i * 180);
        setTimeout(function () { dark(fold(base + o)); if (i === 3) repaintAll(); }, i * 180 + 600);
      });
      return true;
    },
    // colors/scale need SysEx: the browser permission can be silently
    // declined, which made LUMI sync fail with no visible error
    get sysexOk() { return sysexOk(); }
  };
})();
