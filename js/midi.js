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
 *   'midi:note'     {on, midi, vel, chan, portId, mute, blocked} note on/off; raw grading remains available
 *   'midi:bend'     {chan, semis}              pitch bend in semitones
 *   'midi:pressure' {chan, val}                channel pressure 0-127
 *   'midi:raw'      {bytes, portId}            every incoming message, untouched
 *   'midi:out'      {bytes, portId, kind}      successful music, LED or cleanup writes
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
  // ALL KEYBOARDS (midi.inputId 'all', the default): every connected input
  // plays the app at once (a MODX for playing + a LUMI as the lit display);
  // the key LIGHTS still go to the one output. inputs[] = the ports heard.
  var ALL = 'all', allIn = false, inputs = [];
  var srcId = null;                     // exact input port, independent of display name
  var srcName = '';                     // input port of the message being dispatched
  // v0.79: hear every keyboard by default — once, older single-input choices
  // (usually just "the first port") become All keyboards; a single input can
  // still be picked in Settings / the MIDI Hub
  if (!App.store.get('midi.allIn.v1', false)) {
    App.store.set('midi.inputId', ALL);
    App.store.set('midi.allIn.v1', true);
  }
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
      inputName: inputLabel(),
      outputName: native ? portName(nativePorts.outputs, nativeOutId)
                         : (output ? (output.name || 'output') : null)
    });
  }

  function inputLabel() {
    if (native) return nativeInId === ALL ? 'All keyboards' : portName(nativePorts.inputs, nativeInId);
    if (allIn) return inputs.length ? 'All keyboards (' + inputs.map(function (p) { return p.name || 'input'; }).join(', ') + ')' : null;
    return input ? (input.name || 'input') : null;
  }

  function listPorts(map) {
    if (native) return nativePorts[map].slice();
    var out = [];
    if (access) access[map].forEach(function (p) { if (p.state !== 'disconnected') out.push({ id: p.id, name: p.name || p.id }); });
    return out;
  }

  // APP SOUND (v0.78.1): a hardware synth makes its own sound, so soundLAB
  // must not double it. midi.appSound false (Settings), or any mute owner
  // (the MIDI Hub page while open), tags midi:note with mute:true - the
  // visuals, pads, lessons and the keybed still react, only the Keys page
  // voice stays quiet. Distinct from tone-in's silent:true (not a keyboard).
  var muteOwners = {};
  function muted() { return App.store.get('midi.appSound', true) === false || Object.keys(muteOwners).length > 0; }

  // one complete channel message -> app events
  function dispatch(d) {
    if (!d || d.length < 2) return;
    var st = d[0] & 0xf0, chan = d[0] & 0x0f, mute = muted();
    if (st === 0x90 && d[2] > 0) {
      var blocked = !!(App.scaleLock && App.scaleLock.on && !App.scaleLock.contains(d[1]));
      held[d[1]] = d[2];
      App.emit('midi:note', { on: true, midi: d[1], vel: d[2], chan: chan, port: srcName, portId: srcId, mute: mute || blocked, blocked: blocked });
    } else if (st === 0x80 || (st === 0x90 && d[2] === 0)) {
      delete held[d[1]];
      App.emit('midi:note', { on: false, midi: d[1], vel: 0, chan: chan, port: srcName, portId: srcId, mute: mute });
    } else if (st === 0xe0) {
      var raw = ((d[2] << 7) | d[1]) - 8192;
      if (bendOn()) App.emit('midi:bend', { chan: chan, semis: lockEnabled() ? 0 : (raw / 8192) * bendRange });
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

  function onMsg(e, port) {
    port = port || input;
    if (!e || !e.data || !port || webPort('inputs', port.id) !== port || inputs.indexOf(port) === -1) return;
    var previousId = srcId, previousName = srcName;
    srcName = port.name || ''; srcId = port.id;
    try {
      splitAndDispatch(e.data, port);
    } finally { srcName = previousName; srcId = previousId; }
  }

  // Both backends can pack or fragment messages, including realtime bytes
  // BETWEEN a note and its velocity. Decoder state belongs to the exact
  // input source, never the last selected port or another keyboard's status.
  var MSG_LEN = { 0x80: 3, 0x90: 3, 0xa0: 3, 0xb0: 3, 0xc0: 2, 0xd0: 2, 0xe0: 3 };
  var ingressStates = new Map(), MAX_INGRESS_SYSEX = 65536;
  function ingressSelection() { return native ? nativeInId : (allIn ? ALL : input ? input.id : null); }
  function ingressPort(id) {
    if (!native) return webPort('inputs', id);
    for (var i = 0; i < nativePorts.inputs.length; i++) if (nativePorts.inputs[i].id === id) return nativePorts.inputs[i];
    return id === 0 ? nativePorts.inputs : null; // legacy native aggregate source
  }
  function withIngressSource(state, fn) {
    var oldId = srcId, oldName = srcName;
    srcId = state.id; srcName = state.name;
    try { return fn(); } finally { srcId = oldId; srcName = oldName; }
  }
  function dispatchIngress(state, message) { return withIngressSource(state, function () { dispatch(message); }); }
  function rebuildIngressHeld() {
    held = {};
    ingressStates.forEach(function (state) { Object.keys(state.notes).forEach(function (key) { var n = state.notes[key]; held[n.midi] = n.vel; }); });
  }
  function releaseIngress(state) {
    state.disposed = true;
    var notes = state.notes; state.notes = {};
    // These are app releases, not new physical/raw input or MIDI-output sends.
    // Keep the original source/channel even if another device now has its ID.
    Object.keys(notes).forEach(function (key) { var n = notes[key]; dispatchIngress(state, [0x80 | n.chan, n.midi, 0]); });
    rebuildIngressHeld();
  }
  function pruneIngress() {
    var selected = ingressSelection();
    ingressStates.forEach(function (state, key) {
      var current = ingressPort(state.id), selectedHere = selected === ALL || selected === state.id || native && state.id === 0;
      if (!selectedHere || state.selection !== selected || current !== state.port || (current && !Array.isArray(current) && (current.name || '') !== state.name)) {
        ingressStates.delete(key); releaseIngress(state);
      }
    });
  }
  App.on('midi:state', pruneIngress);
  function validIngressChannel(message) {
    return message && message[0] >= 0x80 && message[0] < 0xf0 && message.length === MSG_LEN[message[0] & 0xf0] &&
      Array.prototype.every.call(message, function (b, i) { return Number.isInteger(b) && b >= 0 && b <= (i ? 127 : 239); });
  }
  function ingressMessage(state, message) {
    withIngressSource(state, function () {
      // Complete logical frames retain the pre-rule pitches/channels. One tap
      // per frame lets Hub learn/Thru and performance grading share raw input.
      App.emit('midi:raw', { bytes: message.slice(), portId: state.id, port: state.name });
      if (state.disposed || message[0] >= 0xf0) return;
      var filtered = message.slice();
      if (inputFilter) { try { filtered = inputFilter(filtered) || null; } catch (e) { filtered = message.slice(); } }
      if (state.disposed) return;
      var rawType = message[0] & 0xf0;
      var rawKey = (rawType === 0x80 || rawType === 0x90 ? 'note' : rawType) + ':' + (message[0] & 15) + ':' + message[1], paired = state.notes[rawKey];
      var rawOff = rawType === 0x80 || rawType === 0x90 && message[2] === 0;
      if (rawOff && paired) {
        // A changed input rule cannot strand an already delivered note.
        filtered = [0x80 | paired.chan, paired.midi, 0]; delete state.notes[rawKey];
      }
      if (!validIngressChannel(filtered)) return;
      filtered = Array.prototype.slice.call(filtered);
      var type = filtered[0] & 0xf0;
      if (type === 0x90 && filtered[2] > 0) {
        if (paired && (paired.chan !== (filtered[0] & 15) || paired.midi !== filtered[1])) dispatchIngress(state, [0x80 | paired.chan, paired.midi, 0]);
        state.notes[rawKey] = { chan: filtered[0] & 15, midi: filtered[1], vel: filtered[2] };
      } else if (type === 0x80 || type === 0x90 && filtered[2] === 0) {
        if (paired && (paired.chan !== (filtered[0] & 15) || paired.midi !== filtered[1])) dispatchIngress(state, [0x80 | paired.chan, paired.midi, 0]);
        delete state.notes[rawKey];
      }
      dispatchIngress(state, filtered); rebuildIngressHeld();
    });
  }
  function splitAndDispatch(bytes, port) {
    var id = srcId, identity = port || ingressPort(id);
    if (!bytes || !identity) return;
    var key = (native ? 'native:' : 'web:') + typeof id + ':' + String(id), state = ingressStates.get(key), selected = ingressSelection();
    if (state && (state.port !== identity || state.name !== srcName || state.selection !== selected)) {
      ingressStates.delete(key); releaseIngress(state); state = null;
    }
    if (!state) {
      state = { id: id, name: srcName, port: identity, selection: selected, status: 0, running: 0, data: [], sysex: null, overflow: false, notes: {} };
      ingressStates.set(key, state);
    }
    for (var i = 0; i < bytes.length && !state.disposed; i++) {
      var b = bytes[i];
      if (!Number.isInteger(b) || b < 0 || b > 255) { state.status = state.running = 0; state.data = []; state.sysex = null; state.overflow = false; continue; }
      if (b >= 0xf8) { ingressMessage(state, [b]); continue; }
      if (state.sysex || state.overflow) {
        if (b === 0xf7) {
          if (state.sysex) { state.sysex.push(b); ingressMessage(state, state.sysex); }
          state.sysex = null; state.overflow = false; continue;
        }
        if (b < 0x80) {
          if (state.sysex && state.sysex.length < MAX_INGRESS_SYSEX) state.sysex.push(b);
          else { state.sysex = null; state.overflow = true; }
          continue;
        }
        state.sysex = null; state.overflow = false; // malformed SysEx: resync at a new status
      }
      if (b >= 0x80) {
        state.data = []; state.status = b;
        if (b < 0xf0) state.running = b;
        else {
          state.running = 0;
          if (b === 0xf0) { state.sysex = [b]; state.status = 0; continue; }
          if (b !== 0xf1 && b !== 0xf2 && b !== 0xf3) { ingressMessage(state, [b]); state.status = 0; }
        }
        continue;
      }
      if (!state.status) state.status = state.running;
      if (!state.status) continue;
      var length = state.status < 0xf0 ? MSG_LEN[state.status & 0xf0] : ({ 0xf1: 2, 0xf2: 3, 0xf3: 2 })[state.status];
      if (!length) { state.status = state.running = 0; state.data = []; continue; }
      state.data.push(b);
      if (state.data.length === length - 1) {
        var message = [state.status].concat(state.data); state.data = [];
        state.status = state.status < 0xf0 ? state.running : 0;
        ingressMessage(state, message);
      }
    }
  }

  // ---- Web MIDI backend ----

  // Recovered from b8ccb55 (codex/midi-hub-release-0.78.0-20261019),
  // adapted additively: preserve main's All keyboards and selected handlers.
  function webPort(kind, id) {
    if (native || !access || typeof id !== 'string' || !id) return null;
    var found = null;
    access[kind].forEach(function (p) { if (p.id === id && p.state !== 'disconnected') found = p; });
    return found;
  }
  var inputObjectIds = new WeakMap(), nextInputObjectId = 1;
  function inputFingerprint(id) {
    var all = id == null || id === 'all', wanted = all ? 'all' : String(id);
    if (native) {
      // The native bridge exposes IDs/names, not underlying object identity.
      return 'native:' + wanted + ':' + JSON.stringify(nativePorts.inputs.filter(function (p) { return all || String(p.id) === wanted; }).map(function (p) { return [String(p.id), p.name || '']; }).sort());
    }
    var parts = [];
    if (access) access.inputs.forEach(function (p) {
      if (p.state === 'disconnected' || (!all && String(p.id) !== wanted)) return;
      if (!inputObjectIds.has(p)) inputObjectIds.set(p, nextInputObjectId++);
      parts.push([String(p.id), inputObjectIds.get(p), p.name || '']);
    });
    parts.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
    return 'web:' + wanted + ':' + JSON.stringify(parts);
  }
  function subscribeInput(portId, fn) {
    var port = webPort('inputs', portId);
    if (!port || typeof fn !== 'function' || !port.addEventListener || !port.removeEventListener) return null;
    var active = true;
    function listener(e) {
      if (!active || webPort('inputs', portId) !== port || !e || !e.data) return;
      fn({ bytes: Array.prototype.slice.call(e.data), portId: port.id });
    }
    try { port.addEventListener('midimessage', listener); } catch (e) { return null; }
    return function () {
      if (!active) return;
      active = false;
      try { port.removeEventListener('midimessage', listener); } catch (e) {}
    };
  }
  function sendToOutputKind(portId, bytes, kind) {
    var port = webPort('outputs', portId);
    return !!port && writeOutput({ port: port, id: port.id, name: port.name || '', native: false }, bytes, kind || 'music');
  }
  function sendToOutput(portId, bytes) { return sendToOutputKind(portId, bytes, 'music'); }

  function knownLumi(name) { return /lumi/i.test(name || '') && !/modx|montage|helix|stadium|seaboard|lightpad|virtual|loopback|loopmidi|thru|through/i.test(name || ''); }
  function configuredLumiRoute() {
    var id = App.store.get('lights.outputId', null);
    if (id != null) {
      if (native) {
        var nr = selectedOutputRoute();
        return nr && String(nr.id) === String(id) && knownLumi(nr.name) ? nr : null;
      }
      var p = webPort('outputs', id);
      return p && knownLumi(p.name) ? { port: p, id: p.id, name: p.name || '', native: false } : null;
    }
    var route = selectedOutputRoute();
    return route && knownLumi(route.name) ? route : null;
  }
  function lightOutputRoute() {
    return App.store.get('lights.outputId', null) != null ? configuredLumiRoute() : selectedOutputRoute();
  }
  function hasLightOutput() { return !!lightOutputRoute(); }
  function displayEnabled() {
    var pref = App.store.get('lights.displayEnabled', null);
    if (pref === true || pref === false) return pref;
    var lm = App.store.get('lights.led', 'auto');
    if (lm === 'off') return false;
    if (lm === 'scale') return true;
    var old = App.store.get('lights.on', null);
    return old === true || old === false ? old : !!configuredLumiRoute();
  }
  var displayCleanupOk = true;
  function displayState() {
    var route = configuredLumiRoute(), saved = App.store.get('lights.outputId', null);
    var configured = saved != null && saved !== '' || !!route, enabled = displayEnabled();
    return { enabled: enabled, configured: configured, connected: !!route,
      outputId: saved != null ? saved : route ? route.id : '', name: route ? route.name : '', cleanupOk: displayCleanupOk,
      reason: !configured ? 'Choose a LUMI display output in Keys → LUMI (MIDI must be connected).' :
        !route ? 'The configured LUMI display is disconnected or unavailable; no fallback is used.' :
        !enabled ? 'LUMI Display is off.' : 'LUMI Display is on: ' + route.name + '.' };
  }
  function setDisplayEnabled(on) {
    var current = configuredLumiRoute();
    if (on !== false && current && App.store.get('lights.outputId', null) == null) App.store.set('lights.outputId', String(current.id));
    App.store.set('lights.displayEnabled', on !== false);
    displayCleanupOk = true;
    if (on === false) {
      Object.keys(keybedLeases).forEach(function (id) {
        var token = keybedLeases[id];
        if (knownLumi(token.name) && token.release && token.release({ restore: false }) === false) displayCleanupOk = false;
      });
      allDark();
      if (!flushMusicalOutputs('LUMI Display switched off.', true)) displayCleanupOk = false;
      if (Object.keys(lit).length) displayCleanupOk = false;
      if (configuredLumiRoute()) lumiLayout(true);
    } else repaintAll(true);
    App.emit('lights:master', displayState());
    App.emit('lights:display-enabled', displayState());
    return displayState();
  }
  function setDisplayOutput(id) {
    allDark();
    App.store.set('lights.outputId', typeof id === 'string' ? id : id == null ? '' : String(id));
    resetOutputLights(); repaintAll(true);
    App.emit('lights:master', displayState());
    App.emit('lights:display-enabled', displayState());
    return displayState();
  }

  // A temporary exact-output lease suspends only the shared keybed engine.
  // No port choice or saved lighting preference changes. It also blocks an
  // early statechange repaint if the leased port is unplugged/replaced.
  var keybedLeases = Object.create(null);
  function keybedLeased() { var route = lightOutputRoute(); return !!(route && !route.native && keybedLeases[route.id]); }
  function leaseKeybedOutput(portId, owner) {
    var leasedPort = webPort('outputs', portId);
    if (!leasedPort || typeof owner !== 'string' || !owner || keybedLeases[portId] || claimedBy) return null;
    var lightRoute = lightOutputRoute();
    if (lightRoute && !lightRoute.native && lightRoute.id === portId) {
      allDark();
      // A failed note-off cannot safely hand this route to another painter.
      if (Object.keys(lit).length) return null;
      resetOutputLights();
    }
    var token = { owner: owner, port: leasedPort, name: leasedPort.name };
    keybedLeases[portId] = token;
    var frameLit = Object.create(null), broken = false, releaseResult = true;
    function originalPort() {
      return webPort('outputs', portId) === token.port && token.port.name === token.name;
    }
    function clearFrame() {
      var keys = Object.keys(frameLit), ok = true;
      keys.forEach(function (k) {
        var n = frameLit[k];
        if (!originalPort() || !sendToOutputKind(portId, [0x80 | n.channel, n.note, 0], 'led')) ok = false;
        else delete frameLit[k]; // failed releases stay tracked for a retry
      });
      return ok;
    }
    function release(options) {
      if (keybedLeases[portId] !== token) return releaseResult;
      var cleared = clearFrame(); releaseResult = cleared;
      delete keybedLeases[portId];
      // Cleanup cannot replay a saved route onto a same-id replacement or
      // a renamed device. Later app inventory events follow normal policy.
      var lightRoute = lightOutputRoute();
      if (cleared && !(options && options.restore === false) && lightRoute && lightRoute.port === token.port && originalPort()) {
        repaintAll(true);
        if (!claimedBy && !lightsOn() && ledMode() !== 'off' && isLumi()) lumiNative();
      }
      return cleared;
    }
    release.clear = clearFrame;
    // Synth routing uses the same pinned ownership without LUMI frame
    // semantics. A same-id replacement can never receive old route cleanup.
    release.send = function (bytes) {
      return keybedLeases[portId] === token && originalPort() && sendToOutput(portId, bytes);
    };
    // One semantic frame writer owns the instructional display. Palette
    // indices remain here with the shared LUMI renderer, never in a page.
    release.frame = function (frame) {
      var configured = configuredLumiRoute();
      if (!displayEnabled() || !configured || configured.port !== token.port || keybedLeases[portId] !== token || broken || !originalPort() ||
          !/lumi/i.test(token.name || '') || /modx|montage|helix|stadium|virtual|loopback|loopmidi|thru|through/i.test(token.name || '')) return false;
      frame = frame || {};
      var channel = frame.channel == null ? 0 : frame.channel;
      var roles = ['target', 'correct', 'wrong'];
      if (!Number.isInteger(channel) || channel < 0 || channel > 15 || roles.some(function (role) {
        return frame[role] != null && (!Array.isArray(frame[role]) || frame[role].some(function (n) { return !Number.isInteger(n) || n < 0 || n > 127; }));
      })) { broken = true; clearFrame(); return false; }
      var want = Object.create(null), ok = true;
      roles.forEach(function (role) {
        (frame[role] || []).forEach(function (n) {
          want[channel + ':' + n] = { channel: channel, note: n,
            vel: App.colors.lumiVelocity ? App.colors.lumiVelocity(n) : guideColorVel(n) };
        });
      });
      Object.keys(frameLit).forEach(function (k) {
        if (!ok || want[k]) return;
        var n = frameLit[k];
        if (sendToOutputKind(portId, [0x80 | n.channel, n.note, 0], 'led')) delete frameLit[k]; else ok = false;
      });
      Object.keys(want).forEach(function (k) {
        if (!ok || (frameLit[k] && frameLit[k].vel === want[k].vel)) return;
        var n = want[k];
        if (sendToOutputKind(portId, [0x90 | n.channel, n.note, n.vel], 'led')) frameLit[k] = n; else ok = false;
      });
      if (!ok) { broken = true; clearFrame(); }
      return ok;
    };
    token.release = release;
    return release;
  }

  function listen(p) { p.onmidimessage = function (e) { onMsg(e, p); }; }
  function pickWebInput(id) {
    inputs.forEach(function (p) { try { p.onmidimessage = null; } catch (e) {} });
    if (input) { try { input.onmidimessage = null; } catch (e) {} }
    input = null;
    inputs = [];
    allIn = id == null || id === ALL;
    if (allIn) {
      if (access) access.inputs.forEach(function (p) { if (p.state !== 'disconnected') inputs.push(p); });
      inputs.forEach(listen);
      input = inputs[0] || null;
      App.store.set('midi.inputId', ALL);
      announce();
      return;
    }
    if (access && id) access.inputs.forEach(function (p) { if (p.id === id) input = p; });
    if (!input && access) access.inputs.forEach(function (p) { if (!input) input = p; });
    if (input) {
      inputs = [input];
      listen(input);
      App.store.set('midi.inputId', input.id);
    }
    announce();
  }

  function pickWebOutput(id) {
    var nextOutput = null;
    if (access && id) access.outputs.forEach(function (port) {
      if (port.id === id && port.state !== 'disconnected') nextOutput = port;
    });
    // nothing chosen yet: prefer an LED keyboard (a LUMI) for the lights
    if (!nextOutput && access && !id) access.outputs.forEach(function (port) {
      if (!nextOutput && port.state !== 'disconnected' && /lumi/i.test(port.name || '')) nextOutput = port;
    });
    if (!nextOutput && access && !id) access.outputs.forEach(function (port) {
      if (!nextOutput && port.state !== 'disconnected') nextOutput = port;
    });
    if (nextOutput !== output) {
      App.emit('midi:beforeoutput', { outputId: output ? output.id : null });
      flushMusicalOutputs('Selected output changed.');
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
      flushMusicalOutputs('Native MIDI inventory changed.');
      nativePorts.inputs = (p.inputs || []).map(function (x) { return { id: x.id, name: x.name }; });
      nativePorts.outputs = (p.outputs || []).map(function (x) { return { id: x.id, name: x.name }; });
      // restore / default picks
      var storedIn = App.store.get('midi.inputId', null);
      nativeInId = storedIn == null || storedIn === ALL ? ALL
        : portName(nativePorts.inputs, storedIn) !== null ? storedIn
        : (nativePorts.inputs.length ? nativePorts.inputs[0].id : null);
      var storedOut = App.store.get('midi.outputId', null);
      var nextOutputId = portName(nativePorts.outputs, storedOut) !== null ? storedOut
        : (storedOut == null && nativePorts.outputs.length ? nativePorts.outputs[0].id : null);
      if (nextOutputId !== nativeOutId) {
        App.emit('midi:beforeoutput', { outputId: nativeOutId });
        allDark();
        resetOutputLights();
      }
      nativeOutId = nextOutputId;
      if (nativeOutId !== null) post({ cmd: 'setOutput', id: nativeOutId });
      announce();
    },
    onmidi: function (inputPortId, bytes) {
      if (!nativeReady || !bytes) return;
      if (nativeInId !== null && nativeInId !== ALL && inputPortId !== 0 && inputPortId !== nativeInId) return;
      srcName = portName(nativePorts.inputs, inputPortId) || '';
      srcId = inputPortId;
      try { splitAndDispatch(bytes); } finally { srcId = null; srcName = ''; }
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
        flushMusicalOutputs('MIDI inventory changed.');
        pickWebInput(App.store.get('midi.inputId', null));
        pickWebOutput(App.store.get('midi.outputId', null));
      };
      pickWebInput(App.store.get('midi.inputId', null));
      pickWebOutput(App.store.get('midi.outputId', null));
      return a;
    });
  }

  function setInput(id) {
    flushMusicalOutputs('Selected input changed.');
    if (native) {
      nativeInId = id === ALL || id == null ? ALL : (typeof id === 'string' ? parseInt(id, 10) : id);
      if (typeof nativeInId === 'number' && isNaN(nativeInId)) nativeInId = ALL;
      App.store.set('midi.inputId', nativeInId);
      announce();
      return;
    }
    pickWebInput(id);
  }

  function setOutput(id) {
    flushMusicalOutputs('Selected output changed.');
    if (native) {
      var requestedOutputId = typeof id === 'string' ? parseInt(id, 10) : id;
      if (isNaN(requestedOutputId)) requestedOutputId = null;
      var nextOutputId = portName(nativePorts.outputs, requestedOutputId) !== null ? requestedOutputId : null;
      if (nextOutputId !== nativeOutId) {
        App.emit('midi:beforeoutput', { outputId: nativeOutId });
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

  // Public output is musical; internal keybed/frame writes alone carry the
  // private LED exemption. Every emitted musical note-on shares the same gate,
  // including raw packets, native output, transformed Hub notes and MPE.
  var musicalOutputs = [], musicCleanupOk = true;
  function parseOutput(bytes) {
    var messages = [], i = 0, status = 0;
    while (i < bytes.length) {
      var b = bytes[i];
      if (b >= 0xf8) { messages.push([b]); i++; continue; }
      if (b === 0xf0) {
        var sx = [bytes[i++]];
        while (i < bytes.length && bytes[i] !== 0xf7) {
          if (bytes[i] >= 0x80 && bytes[i] < 0xf8) return null;
          sx.push(bytes[i++]);
        }
        if (i === bytes.length) return null;
        sx.push(bytes[i++]); messages.push(sx); status = 0; continue;
      }
      if (b >= 0x80) { status = b; i++; }
      if (!status) return null;
      var len = status < 0xf0 ? MSG_LEN[status & 0xf0] : ({ 0xf1: 2, 0xf2: 3, 0xf3: 2, 0xf6: 1, 0xf7: 1 })[status];
      if (!len) return null;
      var msg = [status];
      while (msg.length < len && i < bytes.length) {
        if (bytes[i] >= 0xf8) { messages.push([bytes[i++]]); continue; }
        if (bytes[i] >= 0x80) return null;
        msg.push(bytes[i++]);
      }
      if (msg.length !== len) return null;
      messages.push(msg);
      if (status >= 0xf0) status = 0;
    }
    return messages;
  }
  function lockEnabled() { return !!(App.scaleLock && App.scaleLock.on); }
  function prepareMusical(bytes) {
    if (!bytes || !bytes.length) return null;
    var copy = Array.prototype.slice.call(bytes);
    if (copy.some(function (n) { return !Number.isInteger(n) || n < 0 || n > 255; })) return null;
    var messages = parseOutput(copy);
    if (!messages) return lockEnabled() ? null : { bytes: copy, messages: [] };
    var allowed = [], dropped = false;
    messages.forEach(function (b) {
      var type = b[0] & 0xf0;
      if (lockEnabled() && ((type === 0x90 && b[2] > 0 && !App.scaleLock.contains(b[1])) || (type === 0xe0 && (b[1] !== 0 || b[2] !== 64)))) dropped = true;
      else allowed.push(b);
    });
    if (!allowed.length) return null;
    return { bytes: dropped ? [].concat.apply([], allowed) : copy, messages: allowed };
  }
  function selectedOutputRoute() {
    if (!hasOutput()) return null;
    return native ? { native: true, id: nativeOutId, name: portName(nativePorts.outputs, nativeOutId), port: null }
      : { native: false, id: output.id, name: output.name || '', port: output };
  }
  function originalOutput(route) {
    return route.native ? nativeOutId === route.id && portName(nativePorts.outputs, route.id) === route.name
      : webPort('outputs', route.id) === route.port && (route.port.name || '') === route.name;
  }
  function rememberMusical(route, messages) {
    var entry = null;
    musicalOutputs.forEach(function (e) { if (e.native === route.native && e.id === route.id && e.port === route.port && e.name === route.name) entry = e; });
    messages.forEach(function (b) {
      var type = b[0] & 0xf0, channel = b[0] & 15, key = channel + ':' + b[1];
      if (type !== 0x90 && type !== 0x80 && type !== 0xe0 && !(type === 0xb0 && b[1] === 64)) return;
      if (!entry) { entry = { native: route.native, id: route.id, name: route.name, port: route.port, notes: {}, used: {}, bends: {} }; musicalOutputs.push(entry); }
      if (type === 0x90 && b[2] > 0) {
        if (!entry.notes[key]) entry.notes[key] = { channel: channel, note: b[1], count: 0 };
        entry.notes[key].count++; entry.used[channel] = true;
      } else if (type === 0x80 || (type === 0x90 && b[2] === 0)) {
        if (entry.notes[key] && --entry.notes[key].count <= 0) delete entry.notes[key];
      } else if (type === 0xe0) {
        if (b[1] === 0 && b[2] === 64) delete entry.bends[channel]; else entry.bends[channel] = true;
      } else entry.used[channel] = true;
    });
  }
  function rawOutput(route, bytes, kind) {
    if (!route || !originalOutput(route)) return false;
    if (route.native) { if (!post({ cmd: 'send', data: bytes })) return false; }
    else { try { route.port.send(bytes); } catch (e) { return false; } }
    App.emit('midi:out', { bytes: bytes, portId: route.id, port: route.name || '', kind: kind });
    return true;
  }
  function writeOutput(route, bytes, kind) {
    if (!route) return false;
    // A generic keyboard's incoming "light" notes can be real synth sound.
    // Only an identified LUMI display gets the non-musical note exemption.
    var display = kind === 'led' && knownLumi(route.name);
    if (knownLumi(route.name) && !displayEnabled()) {
      var offPacket = parseOutput(Array.prototype.slice.call(bytes || []));
      if (!offPacket) return false;
      var offOnly = offPacket.filter(function (b) { return !((b[0] & 0xf0) === 0x90 && b[2] > 0); });
      if (!offOnly.length) return false;
      if (offOnly.length !== offPacket.length) bytes = [].concat.apply([], offOnly);
    }
    var effectiveKind = display ? 'led' : 'music';
    var prepared = display ? { bytes: Array.prototype.slice.call(bytes || []), messages: [] } : prepareMusical(bytes);
    if (!prepared || !prepared.bytes.length || !rawOutput(route, prepared.bytes, effectiveKind)) return false;
    if (!display) rememberMusical(route, prepared.messages);
    return true;
  }
  function flushMusicalOutputs(reason, lumiOnly) {
    var ok = true;
    musicalOutputs.forEach(function (entry) {
      if (lumiOnly === true && !knownLumi(entry.name)) return;
      Object.keys(entry.notes).forEach(function (key) {
        var n = entry.notes[key], sent = true;
        for (var i = 0; i < n.count; i++) if (!rawOutput(entry, [0x80 | n.channel, n.note, 0], 'music-cleanup')) sent = false;
        if (sent) delete entry.notes[key]; else ok = false;
      });
      Object.keys(entry.bends).forEach(function (channel) {
        if (rawOutput(entry, [0xe0 | +channel, 0, 64], 'music-cleanup')) delete entry.bends[channel]; else ok = false;
      });
      Object.keys(entry.used).forEach(function (channel) {
        if (rawOutput(entry, [0xb0 | +channel, 64, 0], 'music-cleanup')) delete entry.used[channel]; else ok = false;
      });
    });
    musicalOutputs = musicalOutputs.filter(function (e) { return Object.keys(e.notes).length || Object.keys(e.used).length || Object.keys(e.bends).length; });
    musicCleanupOk = ok;
    App.emit('midi:cleanup', { reason: reason || 'Musical routes stopped.', ok: ok });
    return ok;
  }
  function sendBytes(bytes, kind) { return writeOutput(kind === 'led' ? lightOutputRoute() : selectedOutputRoute(), bytes, kind || 'music'); }
  // Preserve the existing selected-output fallback for the legacy Hub API;
  // independent sendToOutput and lease.send continue to require exact ports.
  function sendTo(id, bytes) {
    if (id == null || id === '' || native) return sendBytes(bytes);
    var port = null;
    if (access) access.outputs.forEach(function (p) { if (String(p.id) === String(id) && p.state !== 'disconnected') port = p; });
    return !!port && writeOutput({ port: port, id: port.id, name: port.name || '', native: false }, bytes, 'music');
  }

  function bindMusicalOutput(id) {
    var route = null;
    if (id == null || id === '' || native) route = selectedOutputRoute();
    else {
      var port = webPort('outputs', String(id));
      if (port) route = { port: port, id: port.id, name: port.name || '', native: false };
    }
    if (!route) return null;
    return function (bytes) { return writeOutput(route, bytes, 'music'); };
  }

  // ---- LED output (generic: devices light incoming notes) ----

  var lit = {};

  function resetOutputLights() {
    lit = {};
    lumiShown = null;
  }

  function light(midi, vel) {
    if (!hasLightOutput() || keybedLeased()) return;
    midi = Math.max(0, Math.min(127, Math.round(midi)));
    var v = Math.max(1, Math.min(127, Math.round(vel == null ? 100 : vel)));
    if (sendBytes([0x90, midi, v], 'led')) lit[midi] = v;
  }

  function dark(midi) {
    if (!hasLightOutput() || keybedLeased()) return;
    midi = Math.max(0, Math.min(127, Math.round(midi)));
    if (sendBytes([0x80, midi, 0], 'led')) delete lit[midi];
  }

  function allDark() {
    Object.keys(lit).forEach(function (m) { dark(Number(m)); });
  }

  // ---- ROLI LUMI sync (community-documented SysEx: benob/LUMI-lights) ----
  // Pushes root key, scale, light mode and the app's degree COLORS to a LUMI
  // (USB or Bluetooth — same bytes either way). Native User-mode config has
  // two color slots (not a hardware RGB limitation); we map degree 1 and
  // degree 5 of the app's palette (App.colors). Values pack as a 5-bit type +
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
    if (!hasLightOutput() || keybedLeased() || !sysexOk()) return false;
    while (cmd.length < 8) cmd.push(0);
    // device id is topology-dependent (0x37 on the documented unit, 0x00 =
    // broadcast per the same doc's own uncertainty) — send BOTH; the config
    // frames are idempotent, so whichever id this LUMI answers to wins
    var tail = cmd.concat([lumiChecksum(cmd), 0xf7]);
    var sentSpecific = sendBytes([0xf0, 0x00, 0x21, 0x10, 0x77, 0x37].concat(tail), 'led');
    var sentBroadcast = sendBytes([0xf0, 0x00, 0x21, 0x10, 0x77, 0x00].concat(tail), 'led');
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
    if (!isLumi() || !hasLightOutput()) return;
    if (!displayEnabled()) { lumiLayout(true); return; }
    var root = App.store.get('fb.root', 9);
    var scaleId = App.store.get('fb.scale', 'minorPent');
    var key = Theory.mod12(typeof root === 'number' ? root : 9);
    lumiCmd([0x10, 0x30].concat(lumiVal(0x03, key)));
    var sc = LUMI_SCALES[scaleId];
    if (sc !== undefined) lumiCmd([0x10, 0x60].concat(lumiVal(0x02, sc)));
    lumiCmd([0x10, 0x40].concat(lumiVal(0x02, LUMI_MODES.scale)));
    lumiCmd([0x10, 0x40].concat(lumiVal(0x04, brightness())));
    // overridable in Settings — LED color rendering differs from screens, so
    // the two hardware slots can be dialed by eye; defaults follow the app's
    // colors (App.colors): degree 1 + degree 5 by interval, or by note the
    // key's root note + the note on degree 5 of this scale
    var info = Theory.scaleInfo(key, Theory.SCALES[scaleId] ? scaleId : 'minorPent');
    var fifth = info.pcs.length > 4 ? info.pcs[4] : key + 7;
    var rootC = App.store.get('midi.lumiRoot', '') || App.colors.forNote(key, 0);
    var scaleC = App.store.get('midi.lumiScale', '') || App.colors.forNote(fifth, 4);
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

  // The archived LUMI default program colors EACH KEY by note velocity.
  // Physical firmware/program behavior is not verified here. That program lights an incoming note in colourLookup[velocity] (0 off,
  // 1-126 a hue sweep red > yellow > green > cyan > blue > violet, 127 white),
  // only within its current 24-key octave window. So the app's degree colors
  // go to the keybed one key at a time, matched to the nearest table color.
  var LUMI_TABLE = window.SLNotePalette.table;
  function lumiVel(hex) {
    var value = window.SLNotePalette.nearest(hex);
    return value == null ? window.SLNotePalette.nearest('#ffab47') : value;
  }
  // the LUMI velocity (= color) of a note's screen color (App.colors: by
  // degree, or by note); step 0 = the root color in interval mode
  function noteVel(pc, step) { return lumiVel(App.colors.forNote(pc, step)); }
  // the LUMI velocity (= color) for a key in the current scale, 0 = not in it
  // (in note mode too: the layout is still the scale, only its colors change)
  function lumiKeyVel(m) {
    var root = App.store.get('fb.root', 9), rootPc = Theory.mod12(typeof root === 'number' ? root : 9);
    var info = Theory.scaleInfo(rootPc, App.store.get('fb.scale', 'minorPent'));
    var pc = Theory.mod12(m), step = info.pcToStep.get(pc);
    return step === undefined ? 0 : noteVel(pc, step);
  }
  // Legacy guide-color style (v0.79.0 'LUMI Display', lights.display): while a lesson /
  // runner / guide is showing what to play, the keybed shows ONLY that -
  // the note to play now steady in ITS color, the next one blinking in its
  // color (App.colors: Interval = scale degree, Note = pitch class) - and
  // the scale layout steps aside so the keys read as "play this". With no
  // guide the normal layout is back. Off keeps the legacy layout alongside
  // the target; both styles retain mapped pitch identity.
  function displayOn() { return App.store.get('lights.display', true) !== false; }
  function guideColorVel(n) {
    var root = App.store.get('fb.root', 9), rootPc = Theory.mod12(typeof root === 'number' ? root : 9);
    var info = Theory.scaleInfo(rootPc, App.store.get('fb.scale', 'minorPent'));
    var pc = Theory.mod12(n), step = info.pcToStep.get(pc);
    var col = App.colors.forNote(pc, step === undefined ? undefined : step) || App.colors.forNote(rootPc, 0);
    return lumiVel(col);
  }
  var guideNow = [], guideNext = [], blinkOn = false, blinkT = null;
  var revealSet = [], revealT = null, hidden = {}, claimedBy = null;
  var lumiShown = null; // last LUMI mode pushed: 'scale' | 'night'

  // on by default for a LUMI (SysEx scale colors are safe); other outputs stay
  // opt-in — a sound module there would PLAY note-on lights (old midi.lights)
  function lightsOn() {
    if (isLumi() && !displayEnabled()) return false;
    if (isLumi() && App.store.get('lights.displayEnabled', null) === true) return true;
    var lm = ledMode();
    if (lm === 'scale') return true;
    if (lm === 'off') return false;
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
  // LED SCALE (v0.82.0, the clef dropdown's toggle): 'scale' = the keybed
  // always shows the selected scale (whatever the Help level or Display
  // aid; current targets retain their mapped pitch color), 'off' = dark, 'auto' =
  // lights.on + the Help level (the Lights & help sheet sets auto)
  function ledMode() { var v = App.store.get('lights.led', 'auto'); return v === 'scale' || v === 'off' ? v : 'auto'; }
  function outName() {
    return native ? (portName(nativePorts.outputs, nativeOutId) || '') : (output ? (output.name || '') : '');
  }
  function isLumi() {
    if (App.store.get('lights.outputId', null) != null) return !!configuredLumiRoute();
    var m = App.store.get('midi.lumi', null);
    if (m === true || m === false) return m;
    if (/lumi/i.test(outName())) return true;
    if (native ? nativeInId === ALL : allIn) return false; // many inputs: the output decides
    return /lumi/i.test(native ? (portName(nativePorts.inputs, nativeInId) || '') : (input ? input.name || '' : ''));
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
    var prev = rangeLo;
    rangeLo = Math.max(0, Math.min(108, lo));
    App.store.set('midi.rangeLo', rangeLo);
    var ev = range();
    ev.prev = prev; // set only when PLAYING moved it (a LUMI octave button)
    App.emit('midi:range', ev);
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
    if (ledMode() === 'scale' || (isLumi() && App.store.get('lights.displayEnabled', null) === true)) return 'scale';
    var h = helpLvl();
    return h >= 3 ? 'scale' : h >= 1 ? 'tonic' : 'none';
  }

  // the note-on lights wanted now: layout + reveals + guide. A LUMI gets
  // COLORS (velocity = palette index): every scale key in its degree color,
  // the note to play white, answers green. Other keyboards get brightness.
  function wanted() {
    var want = {}, kind = layoutKind(), r = range(), lumi = isLumi();
    var lo = Math.max(LIGHT_LO, r.lo), hi = Math.min(LIGHT_HI, r.hi), m, v;
    var explicit = lumi && App.store.get('lights.displayEnabled', null) === true;
    var h0 = explicit ? 4 : helpLvl(), guiding = (explicit || (ledMode() !== 'scale' && displayOn())) && h0 >= 2 && (list(guideNow).length > 0 || (h0 >= 3 && list(guideNext).length > 0));
    if (guiding) kind = 'none'; // Display: only the notes to play
    var root = App.store.get('fb.root', 9), rootPc = Theory.mod12(typeof root === 'number' ? root : 9);
    if (kind === 'scale') {
      for (m = lo; m <= hi; m++) { v = lumi ? lumiKeyVel(m) : degVel(m); if (v) want[m] = v; }
    } else if (kind === 'tonic') {
      for (m = lo; m <= hi; m++) if (Theory.mod12(m) === rootPc) want[m] = lumi ? noteVel(rootPc, 0) : 70;
    }
    revealSet.forEach(function (pc) { for (var x = lo; x <= hi; x++) if (Theory.mod12(x) === pc) want[x] = lumi ? guideColorVel(x) : 127; });
    var h = explicit ? 4 : helpLvl();
    if (h >= 2) list(guideNow).forEach(function (n) { want[fold(n)] = lumi ? guideColorVel(n) : 127; });
    if (h >= 3) list(guideNext).forEach(function (n) {
      var f = fold(n);
      if (list(guideNow).some(function (x) { return fold(x) === f; })) return; // it's also the note to play now
      if (!blinkOn) delete want[f];                          // the next note blinks
      else want[f] = lumi ? guideColorVel(f) : 45; // off-scale: root color / its note color
    });
    return want;
  }

  // compose + diff: only changed keys are sent
  function paint(force) {
    if (!hasLightOutput() || keybedLeased()) return;
    if (claimedBy) {
      if (force === true) {
        if (isLumi()) lumiLayout();
        Object.keys(lit).forEach(function (note) { light(Number(note), lit[note]); });
      }
      return;
    }
    if (!lightsOn()) { allDark(); if ((ledMode() === 'off' || !displayEnabled()) && isLumi()) lumiLayout(); return; } // off: a dark LUMI
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
  // the range follows the LIT keyboard's octave buttons: when a LUMI is one of
  // several inputs, only its own notes move the window (a MODX played in its
  // low octaves must not drag the LUMI display or switch hands)
  function lumiInputs() {
    var names = native ? nativePorts.inputs.map(function (p) { return p.name || ''; })
      : inputs.map(function (p) { return p.name || ''; });
    return names.some(function (n) { return /lumi/i.test(n); });
  }
  App.on('midi:note', function (d) {
    if (!d || !d.on || d.silent) return;
    if (d.port && lumiInputs() && !/lumi/i.test(d.port)) return;
    learnRange(d.midi);
  });

  // follow the app's key/scale/colors/help live
  function repaintAll(force) { lumiShown = null; paint(force === true); }
  App.on('fb:set', repaintAll);
  App.on('fb:scale', repaintAll);
  App.on('midi:state', repaintAll);
  App.on('help:level', function () { paint(); });
  // Interval | Note + palette edits (App.colors): repaint the keybed; with
  // the app's lights off the LUMI's own two colors follow — not while a page
  // owns the keybed (Pads: night mode + its own key lights)
  App.on('colors', function () {
    repaintAll();
    if (!claimedBy && !lightsOn() && ledMode() !== 'off' && isLumi() && hasLightOutput()) lumiNative();
  });

  var musicalBoundary = [App.store.get('fb.root', 9), App.store.get('fb.scale', 'minorPent'), lockEnabled()];
  function boundaryCleanup() {
    var next = [App.store.get('fb.root', 9), App.store.get('fb.scale', 'minorPent'), lockEnabled()];
    if (JSON.stringify(next) !== JSON.stringify(musicalBoundary) && (next[2] || musicalBoundary[2])) flushMusicalOutputs('Selected scale or lock changed.');
    musicalBoundary = next;
  }
  ['fb:set', 'fb:scale', 'scale:lock', 'scale:boundary'].forEach(function (event) { App.on(event, boundaryCleanup); });
  window.addEventListener && window.addEventListener('blur', function () { flushMusicalOutputs('Window lost focus.'); });
  window.addEventListener && window.addEventListener('pagehide', function () { flushMusicalOutputs('Page hidden.'); });

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
    get inputId() { return native ? nativeInId : (allIn ? ALL : (input ? input.id : null)); },
    get inputsHeard() { return native ? [] : inputs.map(function (p) { return { id: p.id, name: p.name || p.id }; }); },
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
    sendTo: sendTo, // (portId, bytes): one chosen output, not the light output
    get explicitPortsSupported() { return !native && !!access; },
    subscribeInput: subscribeInput,
    inputFingerprint: inputFingerprint,
    sendToOutput: sendToOutput,
    leaseKeybedOutput: leaseKeybedOutput,
    get displayEnabled() { return displayEnabled(); },
    get displayState() { return displayState(); },
    setDisplayEnabled: setDisplayEnabled,
    setDisplayOutput: setDisplayOutput,
    flushMusicalOutputs: flushMusicalOutputs,
    bindMusicalOutput: bindMusicalOutput,
    get musicCleanupOk() { return musicCleanupOk; },
    // app sound for MIDI notes: the Settings switch + per-owner mutes (Hub)
    get appSound() { return App.store.get('midi.appSound', true) !== false; },
    setAppSound: function (on) { App.store.set('midi.appSound', on !== false); },
    mute: function (owner, on) { if (on) muteOwners[owner] = true; else delete muteOwners[owner]; },
    get muted() { return muted(); },
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
      revealSet = (helpLvl() >= 2 || (isLumi() && App.store.get('lights.displayEnabled', null) === true)) ? list(pcs).map(function (n) { return Theory.mod12(n); }) : [];
      paint();
      if (revealSet.length) revealT = setTimeout(function () { revealSet = []; paint(); }, ms || 1500);
    },
    hideLayout: function (owner, on) { hidden[owner] = !!on; paint(); },
    claim: function (owner) { if (claimedBy !== owner) { allDark(); claimedBy = owner; if (isLumi()) { lumiShown = null; lumiCmd([0x10, 0x40].concat(lumiVal(0x02, LUMI_MODES.night))); } } },
    lumiColor: function (hex) { return '#' + ('00000' + LUMI_TABLE[lumiVel(hex)].toString(16)).slice(-6); }, // mapped default-program RGB; physical color remains unverified
    get platform() { return iosMidi ? 'ios' : androidMidi ? 'android' : 'web'; },
    release: function (owner) { if (claimedBy === owner) { allDark(); claimedBy = null; repaintAll(); } },
    repaint: function () { repaintAll(true); },
    lumiSync: function () { repaintAll(true); },
    range: range,
    fold: fold,
    get lumi() { return isLumi(); },
    get outputName() { return outName(); },
    get lightsOn() { return lightsOn(); },
    // LUMI Display (lessons light only the keys to play, in their colors)
    get display() { return displayOn(); },
    setDisplay: function (on) { App.store.set('lights.display', on !== false); App.emit('lights:display', { on: on !== false }); paint(); },
    setLightsOn: function (on) {
      App.store.set('lights.led', 'auto'); // the sheet's On/Off: back to the Help level
      App.store.set('lights.on', !!on);
      if (!on) { allDark(); if (isLumi() && hasLightOutput()) { lumiShown = null; lumiNative(); } }
      repaintAll();
    },
    // LED scale (the clef dropdown): 'scale' | 'off' | 'auto'
    get ledMode() { return ledMode(); },
    // is the keybed showing the scale right now (what the toggle displays)
    get ledScale() { var m = ledMode(); return m === 'scale' || (m === 'auto' && lightsOn() && helpLvl() >= 3); },
    setLedMode: function (m) {
      App.store.set('lights.led', m === 'scale' || m === 'off' ? m : 'auto');
      lumiShown = null;
      if (m === 'off') allDark();
      repaintAll();
      App.emit('lights:led', { mode: ledMode() });
    },
    test: function () { // a C major arpeggio across the range, then back to normal
      if (!hasLightOutput() || (isLumi() && !displayEnabled())) return false;
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
