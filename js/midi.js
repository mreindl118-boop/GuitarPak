/* GuitarLab MIDI service — Web MIDI in/out for USB/Bluetooth keyboards
 * (ROLI LUMI, Launchkey, any class-compliant controller).
 *
 * Loaded right after app.js so every module can use it. Exposes App.midi and
 * broadcasts on the App bus:
 *   'midi:state'    {supported, ready, inputName, outputName}
 *   'midi:note'     {on, midi, vel, chan}      note on/off (vel 0-127)
 *   'midi:bend'     {chan, semis}              pitch bend in semitones
 *   'midi:pressure' {chan, val}                channel pressure 0-127
 *
 * Input niceties: MPE-style per-note expression works out of the box because
 * bend/pressure are reported per channel and consumers apply them to the
 * notes held on that channel (ROLI sends each key on its own channel).
 *
 * Output: light(midi, vel) / dark(midi) send note messages to the chosen
 * output — most LED keyboards (LUMI included) light incoming notes, with
 * velocity driving brightness/color intensity. lumiSync() additionally
 * pushes the app's current root + scale to a ROLI LUMI over SysEx (community
 * -documented protocol, EXPERIMENTAL — harmless no-op on other devices),
 * so the keyboard's own key lights follow the app's key.
 *
 * Everything is opt-in from Settings (browser permission prompt happens on
 * Enable). Web MIDI needs Chrome/Edge (desktop or Android); it does not
 * exist in iOS Safari or the APK's WebView — the UI says so instead of
 * breaking.
 */
(function () {
  'use strict';

  var access = null;
  var input = null, output = null;
  var held = {};            // midi -> vel (currently held notes, any channel)
  var bendRange = App.store.get('midi.bendRange', 2);
  if ([2, 12, 48].indexOf(bendRange) === -1) bendRange = 2;

  function supported() { return typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess; }

  function announce() {
    App.emit('midi:state', {
      supported: supported(),
      ready: !!access,
      inputName: input ? (input.name || 'input') : null,
      outputName: output ? (output.name || 'output') : null
    });
  }

  function listPorts(map) {
    var out = [];
    if (access) access[map].forEach(function (p) { out.push({ id: p.id, name: p.name || p.id }); });
    return out;
  }

  function onMsg(e) {
    var d = e.data;
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
    } else if (st === 0xa0) { // poly aftertouch -> treat as pressure for that channel
      App.emit('midi:pressure', { chan: chan, val: d[2] });
    }
  }

  function pickInput(id) {
    if (input) { try { input.onmidimessage = null; } catch (e) {} }
    input = null;
    if (access && id) {
      access.inputs.forEach(function (p) { if (p.id === id) input = p; });
    }
    if (!input && access) { // first available
      access.inputs.forEach(function (p) { if (!input) input = p; });
    }
    if (input) {
      input.onmidimessage = onMsg;
      App.store.set('midi.inputId', input.id);
    }
    announce();
  }

  function pickOutput(id) {
    output = null;
    if (access && id) {
      access.outputs.forEach(function (p) { if (p.id === id) output = p; });
    }
    if (!output && access) {
      access.outputs.forEach(function (p) { if (!output) output = p; });
    }
    if (output) App.store.set('midi.outputId', output.id);
    announce();
  }

  function enable() {
    if (!supported()) { announce(); return Promise.reject(new Error('no Web MIDI')); }
    if (access) { announce(); return Promise.resolve(access); }
    // sysex first (LUMI sync needs it); plain fallback if the user declines
    return navigator.requestMIDIAccess({ sysex: true }).catch(function () {
      return navigator.requestMIDIAccess();
    }).then(function (a) {
      access = a;
      a.onstatechange = function () {
        pickInput(App.store.get('midi.inputId', null));
        pickOutput(App.store.get('midi.outputId', null));
      };
      pickInput(App.store.get('midi.inputId', null));
      pickOutput(App.store.get('midi.outputId', null));
      return a;
    });
  }

  // ---- LED output (generic: devices light incoming notes) ----

  var lit = {};

  function light(midi, vel) {
    if (!output) return;
    midi = Math.max(0, Math.min(127, Math.round(midi)));
    try {
      output.send([0x90, midi, Math.max(1, Math.min(127, Math.round(vel == null ? 100 : vel)))]);
      lit[midi] = true;
    } catch (e) { /* port gone */ }
  }

  function dark(midi) {
    if (!output) return;
    midi = Math.max(0, Math.min(127, Math.round(midi)));
    try {
      output.send([0x80, midi, 0]);
      delete lit[midi];
    } catch (e) { /* port gone */ }
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
    if (!output) return;
    while (cmd.length < 8) cmd.push(0);
    var msg = [0xf0, 0x00, 0x21, 0x10, 0x77, 0x00].concat(cmd, [lumiChecksum(cmd), 0xf7]);
    try { output.send(msg); } catch (e) { /* sysex not granted / port gone */ }
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
    get ready() { return !!access; },
    get inputs() { return listPorts('inputs'); },
    get outputs() { return listPorts('outputs'); },
    get inputId() { return input ? input.id : null; },
    get outputId() { return output ? output.id : null; },
    get hasOutput() { return !!output; },
    get held() { return Object.keys(held).map(Number); },
    get bendRange() { return bendRange; },
    setBendRange: function (r) {
      bendRange = [2, 12, 48].indexOf(r) !== -1 ? r : 2;
      App.store.set('midi.bendRange', bendRange);
    },
    enable: enable,
    setInput: pickInput,
    setOutput: pickOutput,
    light: light,
    dark: dark,
    allDark: allDark,
    lumiSync: lumiSync
  };
})();
