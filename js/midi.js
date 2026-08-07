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

  // ---- ROLI LUMI scale sync (EXPERIMENTAL, community-documented SysEx) ----
  // Pushes root key + scale so the LUMI's own per-key lights follow the app.
  // Wrong bytes are simply ignored by non-LUMI devices.

  var LUMI_SCALES = { // app scale id -> LUMI scale index (best documented set)
    major: 0, aeolian: 1, harmonicMinor: 2, majorPent: 4, minorPent: 5,
    blues: 6, dorian: 7, phrygian: 8, lydian: 9, mixolydian: 10, locrian: 11
  };

  function lumiChecksum(bytes) {
    var c = bytes.length;
    for (var i = 0; i < bytes.length; i++) c = (c * 3 + bytes[i]) & 0xff;
    return c & 0x7f;
  }

  function lumiCmd(cmd) {
    if (!hasOutput()) return;
    while (cmd.length < 8) cmd.push(0);
    sendBytes([0xf0, 0x00, 0x21, 0x10, 0x77, 0x00].concat(cmd, [lumiChecksum(cmd), 0xf7]));
  }

  function lumiSync() {
    if (!App.store.get('midi.lumi', false)) return;
    var root = App.store.get('fb.root', 9);
    var scaleId = App.store.get('fb.scale', 'minorPent');
    var key = Theory.mod12(typeof root === 'number' ? root : 9);
    // LUMI keys are C-based 0..11
    lumiCmd([0x10, 0x30, 0x03, key * 2, 0x00]);
    var sc = LUMI_SCALES[scaleId];
    if (sc !== undefined) lumiCmd([0x10, 0x60, 0x02, sc * 2, 0x00]);
  }

  // follow the app's key/scale live
  App.on('fb:set', function () { lumiSync(); });
  App.on('fb:scale', function () { lumiSync(); });

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
    lumiSync: lumiSync
  };
})();
