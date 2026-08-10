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
 *
 * MPE-style per-note expression works out of the box because bend/pressure
 * are reported per channel and consumers apply them to the notes held on
 * that channel (ROLI sends each key on its own channel).
 *
 * Output: light(midi, vel) / dark(midi) send note messages — most LED
 * keyboards (LUMI included) light incoming notes, velocity as brightness.
 * lumiSync() additionally pushes the app's root + scale to a ROLI LUMI over
 * SysEx (community-documented protocol, EXPERIMENTAL — a harmless no-op on
 * other devices).
 *
 * Everything is opt-in from Settings. Where neither backend exists (iOS
 * Safari PWA, the Android APK's WebView), the UI says so instead of breaking.
 */
(function () {
  'use strict';

  var native = !!(window.webkit && window.webkit.messageHandlers &&
                  window.webkit.messageHandlers.midi);

  var access = null;                    // Web MIDI backend
  var input = null, output = null;
  var nativeReady = false;              // CoreMIDI bridge backend
  var nativePorts = { inputs: [], outputs: [] };
  var nativeInId = null, nativeOutId = null;
  var held = {};                        // midi -> vel (currently held notes)
  var bendRange = App.store.get('midi.bendRange', 2);
  if ([2, 12, 48].indexOf(bendRange) === -1) bendRange = 2;

  function post(msg) {
    try { window.webkit.messageHandlers.midi.postMessage(msg); } catch (e) { /* bridge gone */ }
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
      App.emit('midi:bend', { chan: chan, semis: (raw / 8192) * bendRange });
    } else if (st === 0xd0) {
      App.emit('midi:pressure', { chan: chan, val: d[1] });
    } else if (st === 0xa0) { // poly aftertouch -> pressure for that channel
      App.emit('midi:pressure', { chan: chan, val: d[2] });
    }
  }

  function onMsg(e) { dispatch(e.data); }

  // CoreMIDI packets can pack several messages (and use running status) in
  // one byte string — split into complete messages before dispatching
  var MSG_LEN = { 0x80: 3, 0x90: 3, 0xa0: 3, 0xb0: 3, 0xc0: 2, 0xd0: 2, 0xe0: 3 };

  function splitAndDispatch(bytes) {
    var i = 0, lastStatus = 0;
    while (i < bytes.length) {
      var b = bytes[i];
      if (b === 0xf0) {              // sysex: skip to F7 (we don't consume it)
        while (i < bytes.length && bytes[i] !== 0xf7) i++;
        i++;
        continue;
      }
      if (b >= 0xf8) { i++; continue; }        // realtime
      var status = b >= 0x80 ? b : lastStatus; // running status
      if (b >= 0x80) i++;
      var len = MSG_LEN[status & 0xf0];
      if (!status || !len) { i++; continue; }
      lastStatus = status;
      var msg = [status];
      for (var k = 1; k < len && i < bytes.length; k++, i++) msg.push(bytes[i]);
      if (msg.length === len) dispatch(msg);
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
    output = null;
    if (access && id) access.outputs.forEach(function (p) { if (p.id === id) output = p; });
    if (!output && access) access.outputs.forEach(function (p) { if (!output) output = p; });
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
      nativeOutId = portName(nativePorts.outputs, storedOut) !== null ? storedOut
        : (nativePorts.outputs.length ? nativePorts.outputs[0].id : null);
      if (nativeOutId !== null) post({ cmd: 'setOutput', id: nativeOutId });
      announce();
    },
    onmidi: function (srcId, bytes) {
      if (!nativeReady || !bytes) return;
      if (nativeInId !== null && srcId !== 0 && srcId !== nativeInId) return;
      splitAndDispatch(bytes);
    }
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
      nativeOutId = typeof id === 'string' ? parseInt(id, 10) : id;
      if (isNaN(nativeOutId)) nativeOutId = null;
      App.store.set('midi.outputId', nativeOutId);
      if (nativeOutId !== null) post({ cmd: 'setOutput', id: nativeOutId });
      announce();
      return;
    }
    pickWebOutput(id);
  }

  function hasOutput() {
    return native ? nativeOutId !== null : !!output;
  }

  function sendBytes(bytes) {
    if (native) { post({ cmd: 'send', data: bytes }); return; }
    if (!output) return;
    try { output.send(bytes); } catch (e) { /* port gone */ }
  }

  // ---- LED output (generic: devices light incoming notes) ----

  var lit = {};

  function light(midi, vel) {
    if (!hasOutput()) return;
    midi = Math.max(0, Math.min(127, Math.round(midi)));
    sendBytes([0x90, midi, Math.max(1, Math.min(127, Math.round(vel == null ? 100 : vel)))]);
    lit[midi] = true;
  }

  function dark(midi) {
    if (!hasOutput()) return;
    midi = Math.max(0, Math.min(127, Math.round(midi)));
    sendBytes([0x80, midi, 0]);
    delete lit[midi];
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
    if (!hasOutput()) return;
    while (cmd.length < 8) cmd.push(0);
    sendBytes([0xf0, 0x00, 0x21, 0x10, 0x77, 0x37].concat(cmd, [lumiChecksum(cmd), 0xf7]));
  }

  function lumiVal(type, v) { // <5-bit type><value> from byte 3 of the command
    return [(type | ((v & 3) << 5)) & 0x7f, (v >> 2) & 0x7f];
  }

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

  function lumiSync() {
    if (!App.store.get('midi.lumi', false) || !hasOutput()) return;
    var root = App.store.get('fb.root', 9);
    var scaleId = App.store.get('fb.scale', 'minorPent');
    var key = Theory.mod12(typeof root === 'number' ? root : 9);
    lumiCmd([0x10, 0x30].concat(lumiVal(0x03, key)));
    var sc = LUMI_SCALES[scaleId];
    if (sc !== undefined) lumiCmd([0x10, 0x60].concat(lumiVal(0x02, sc)));
    var mode = LUMI_MODES[App.store.get('midi.lumiMode', 'scale')];
    if (mode !== undefined) lumiCmd([0x10, 0x40].concat(lumiVal(0x02, mode)));
    lumiCmd([0x10, 0x40].concat(lumiVal(0x04, 100))); // full LED brightness
    var cols = App.store.get('fb.colors', null) || [];
    // overridable in Settings — LED color rendering differs from screens, so
    // the two hardware slots can be dialed by eye; defaults follow the palette
    var rootC = App.store.get('midi.lumiRoot', '') || cols[0] || '#ffab47';
    var scaleC = App.store.get('midi.lumiScale', '') || cols[4] || '#6ea8fe';
    lumiColor(0x30, rootC);  // root key slot
    lumiColor(0x20, scaleC); // in-scale key slot
  }

  // ---- key lights: degree-aware LED echo for ANY keyboard that lights
  // incoming notes (LUMI, Launchkey, most LED keybeds). midi.lights:
  //   'off'   nothing
  //   'echo'  light the keys you play, brightness graded by scale degree
  //   'scale' hold the whole in-scale layout lit (root brightest)
  // Opt-in only: these are note-on messages — aimed at controllers, which
  // light silently; a sound module on the output would play them.

  function lightsMode() { return App.store.get('midi.lights', 'off'); }

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

  function paintScaleLights() {
    allDark();
    // a LUMI paints its own keybed (scale colors via SysEx + native pressed
    // lights) — note-on lighting on top just fights it and looks broken
    if (App.store.get('midi.lumi', false) === true) return;
    if (lightsMode() !== 'scale' || !hasOutput()) return;
    for (var m = 24; m <= 108; m++) {
      var v = degVel(m);
      if (v) light(m, v);
    }
  }

  function setLights(mode) {
    mode = ['off', 'echo', 'scale'].indexOf(mode) !== -1 ? mode : 'off';
    App.store.set('midi.lights', mode);
    paintScaleLights(); // paints for 'scale', clears for the others
  }

  function echoNote(d) {
    if (App.store.get('midi.lumi', false) === true) return; // LUMI lights itself
    if (!d || lightsMode() !== 'echo') return;
    if (d.on) light(d.midi, degVel(d.midi) || 60); else dark(d.midi);
  }

  App.on('note:input', echoNote); // on-screen piano / QWERTY
  App.on('midi:note', echoNote);  // hardware keys, echoed back to the LEDs

  // follow the app's key/scale/colors live
  App.on('fb:set', function () { lumiSync(); paintScaleLights(); });
  App.on('fb:scale', function () { lumiSync(); paintScaleLights(); });
  App.on('midi:state', function () { lumiSync(); paintScaleLights(); });

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
    setBendRange: function (r) {
      bendRange = [2, 12, 48].indexOf(r) !== -1 ? r : 2;
      App.store.set('midi.bendRange', bendRange);
    },
    enable: enable,
    setInput: setInput,
    setOutput: setOutput,
    bluetooth: function () { if (native) post({ cmd: 'bluetooth' }); },
    light: light,
    dark: dark,
    allDark: allDark,
    lumiSync: lumiSync,
    setLights: setLights,
    get lights() { return lightsMode(); },
    // colors/scale need SysEx: the browser permission can be silently
    // declined, which made LUMI sync fail with no visible error
    get sysexOk() { return native ? true : !!(access && access.sysexEnabled); }
  };
})();
