/* soundLAB MIDI Hub — read, write and reshape everything on the MIDI cable.
 * Registers 'midihub' (Keys group, pill "MIDI"). Prefix mh-.
 *
 * Device-AGNOSTIC: it speaks plain MIDI to whatever is on App.midi's ports —
 * a hardware synth (Yamaha MODX, a Roland, a Korg…), a controller, a LUMI, a
 * DAW's virtual port. A device PROFILE (midihub.profile) only adds names and
 * SysEx templates on top; "Generic" is the default and works with anything.
 *
 * Views (one page, a seg switcher):
 *   Play      on-screen keys (touch / QWERTY), velocity, bend, mod, pressure,
 *             bank + program select — everything goes OUT on the Hub channel
 *   Controls  CC sliders (add any number), switch CCs, realtime transport +
 *             MIDI clock at the app's ONE shared tempo (met.bpm)
 *   Rules     "when <message> do <change>": remap number/channel, transpose,
 *             scale values, convert types, block. Applied to THRU (in → out),
 *             optionally to what soundLAB itself hears (App.midi.
 *             setInputFilter) and to the Hub's own controls. Learn fills a
 *             rule from the next incoming message.
 *   SysEx     identity request, profile-driven parameter change / bulk
 *             request builders, raw hex send, last received dump
 *   Monitor   every byte in ('midi:raw') and out ('midi:out'), decoded
 *   Learn     cheat sheet + the selected profile's own notes
 *
 * Ports come from the shared MIDI service (Settings / Lights & help pick
 * them too); the Hub adds quick pickers of its own. Sends go through
 * App.midi.send — the keybed lights share the same output, so a synth output
 * should keep key lights OFF (the Hub warns when they're on). Stores
 * midihub.* (ch, oct, vel, thru, rulesIn, rulesApp, profile, dev, model,
 * ccs, rules, hex, view, naming). Notes played here also emit note:input so
 * the Studio capture dot records them.
 */
(function () {
  'use strict';

  var root = null, els = {};
  var held = {}, sustain = false, clockTimer = null, clockNext = 0, learning = null;
  var monQ = [], monRaf = 0, monPaused = false, monCount = 0, t0 = 0;
  var sw = {}; // switch CC states
  // Incoming identities retain the notes actually sent after Rules. Releases
  // never re-run edited transpose/channel rules or release a blocked source.
  var sentSources = Object.create(null), sentTargets = Object.create(null);
  var hubSending = false, hubEchoes = [];
  var hubScaleState = null;

  var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var CC_NAMES = {
    0: 'Bank MSB', 1: 'Mod Wheel', 2: 'Breath', 4: 'Foot', 5: 'Porta Time', 6: 'Data MSB', 7: 'Volume', 8: 'Balance', 10: 'Pan', 11: 'Expression',
    32: 'Bank LSB', 38: 'Data LSB', 64: 'Sustain', 65: 'Portamento', 66: 'Sostenuto', 67: 'Soft', 68: 'Legato', 71: 'Resonance', 72: 'Release', 73: 'Attack', 74: 'Cutoff',
    75: 'Decay', 76: 'Vib Rate', 77: 'Vib Depth', 78: 'Vib Delay', 84: 'Porta Ctrl', 91: 'Reverb', 93: 'Chorus', 96: 'Data +', 97: 'Data −',
    98: 'NRPN LSB', 99: 'NRPN MSB', 100: 'RPN LSB', 101: 'RPN MSB', 120: 'All Sound Off', 121: 'Reset Ctrls', 122: 'Local Ctrl', 123: 'All Notes Off',
    124: 'Omni Off', 125: 'Omni On', 126: 'Mono', 127: 'Poly'
  };
  var DEFAULT_CCS = [
    { cc: 1, name: 'Mod Wheel' }, { cc: 7, name: 'Volume' }, { cc: 10, name: 'Pan' }, { cc: 11, name: 'Expression' },
    { cc: 74, name: 'Cutoff' }, { cc: 71, name: 'Resonance' }, { cc: 73, name: 'Attack' }, { cc: 72, name: 'Release' },
    { cc: 91, name: 'Reverb' }, { cc: 93, name: 'Chorus' }, { cc: 5, name: 'Porta Time' }, { cc: 2, name: 'Breath' }
  ];
  var SWITCHES = [{ cc: 64, name: 'Sustain' }, { cc: 65, name: 'Portamento' }, { cc: 66, name: 'Sostenuto' }, { cc: 67, name: 'Soft' }, { cc: 68, name: 'Legato' }];
  var KB_KEYS = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16 };

  // ---- device profiles: names + SysEx templates layered over plain MIDI ----
  function yamahaHdr(sub, o) { return [0xF0, 0x43, (sub << 4) | (o.dev & 15), 0x7F, 0x1C].concat(o.model); }
  function rolandSum(body) { var s = 0; for (var i = 0; i < body.length; i++) s += body[i]; return (128 - (s % 128)) % 128; }
  var PROFILES = {
    generic: {
      name: 'Generic (any MIDI device)',
      cc: {}, bankMsb: 0,
      bankHint: 'Bank Select MSB (CC0) + LSB (CC32), then Program Change. Your device’s manual lists its bank numbers; many ignore banks entirely.',
      sysex: null,
      notes: [
        'Any class-compliant USB or Bluetooth MIDI device works here: pick its port above. On Windows only one program can hold a MIDI port at a time, so close your DAW if a port is missing.',
        'If the same device is both In and Out and plays its own keys (Local Control on), Thru will double every note. Turn Local Control off on the device, or leave Thru off.',
        'Deep parameters are usually SysEx. The SysEx view can send any bytes: copy the message format from the device’s MIDI implementation chart.'
      ]
    },
    yamaha: {
      name: 'Yamaha MODX / MONTAGE',
      cc: { 95: 'Super Knob', 17: 'Assign 1', 18: 'Assign 2', 19: 'Assign 3', 20: 'Assign 4', 21: 'Assign 5', 22: 'Assign 6', 23: 'Assign 7', 24: 'Assign 8' },
      extraCcs: [{ cc: 95, name: 'Super Knob' }, { cc: 17, name: 'Assign 1' }, { cc: 18, name: 'Assign 2' }, { cc: 19, name: 'Assign 3' }, { cc: 20, name: 'Assign 4' }],
      knobs: { hero: { cc: 95, name: 'Super Knob', def: 0 }, extraTitle: 'Assign knobs',
        extra: [17, 18, 19, 20, 21, 22, 23, 24].map(function (n, i) { return { cc: n, name: 'Assign ' + (i + 1), def: 64 }; }) },
      bankMsb: 63,
      bankHint: 'Performances: Bank MSB 63, LSB = the bank page from the Data List (Preset / User / Library), Program 1–128.',
      sysex: {
        model: [0x07], devMax: 15, addrLen: 3,
        paramChange: function (o) { return yamahaHdr(1, o).concat(o.addr, o.data, [0xF7]); },
        bulkRequest: function (o) { return yamahaHdr(2, o).concat(o.addr, [0xF7]); },
        paramHint: 'F0 43 1n 7F 1C mm aH aM aL dd… F7 — n = device number, mm = model ID (07 = MONTAGE/MODX family). Addresses and data ranges: the "MIDI Data Format" chapter of the MODX+ / MONTAGE Data List PDF.',
        bulkHint: 'F0 43 2n 7F 1C mm aH aM aL F7 — the reply is a SysEx bulk dump (shows in the monitor and under Last received).'
      },
      notes: [
        'On the synth: UTILITY → Settings → MIDI I/O → MIDI IN/OUT = USB. Install the Yamaha Steinberg USB Driver on the PC. Pick the port named MODX-1 (or MONTAGE-1): Port 1 is the tone generator.',
        'A Performance has up to 16 Parts. In MIDI I/O mode Multi, Part 1 = channel 1, Part 2 = channel 2 …; in Single mode everything is on one channel.',
        'Super Knob sends and receives CC 95 by default; the Assignable Knobs use CC 17–24 (both changeable under MIDI I/O → Control Number).',
        'Playing the synth’s own keys into the Hub with Thru on and Local Control ON doubles notes — switch Local Control off (UTILITY → Settings → MIDI I/O) when routing through here.',
        'MIDI Sync = MIDI makes the arpeggiator and motion sequencer follow the clock the Hub sends from the Controls view.'
      ]
    },
    roland: {
      name: 'Roland (DT1 / RQ1)',
      cc: {}, bankMsb: 0,
      bankHint: 'Roland synths select tones with Bank MSB + LSB + Program; the pairs are listed per bank in the MIDI implementation.',
      sysex: {
        model: [0x00, 0x00, 0x00, 0x0A], devMax: 31, addrLen: 4, hasSize: true,
        paramChange: function (o) { var body = o.addr.concat(o.data); return [0xF0, 0x41, o.dev & 0x7F].concat(o.model, [0x12], body, [rolandSum(body), 0xF7]); },
        bulkRequest: function (o) { var body = o.addr.concat(o.size); return [0xF0, 0x41, o.dev & 0x7F].concat(o.model, [0x11], body, [rolandSum(body), 0xF7]); },
        paramHint: 'F0 41 dev model… 12 a1 a2 a3 a4 dd… ck F7 (DT1) — dev = device ID (usually 10 = 16), model = the device’s model ID bytes, ck = Roland checksum (computed for you).',
        bulkHint: 'F0 41 dev model… 11 a1 a2 a3 a4 s1 s2 s3 s4 ck F7 (RQ1) — asks for size bytes starting at the address.'
      },
      notes: [
        'Set the model ID to your instrument’s (from its MIDI implementation PDF); the default is only a placeholder.',
        'Device ID defaults to 17 (10 hex) on most Roland gear.'
      ]
    }
  };

  // ---- state (persisted under midihub.*) ----
  function g(k, d) { return App.store.get('midihub.' + k, d); }
  function set(k, v) {
    if (['rules', 'rulesApp', 'ch', 'outId', 'profile'].indexOf(k) >= 0 || (k === 'thru' && !v)) flushHub('MIDI Hub routing/rules changed');
    App.store.set('midihub.' + k, v);
  }
  function profile() { return PROFILES[g('profile', 'generic')] || PROFILES.generic; }
  function ch() { var c = parseInt(g('ch', 0), 10); return (c >= 0 && c < 16) ? c : 0; }
  function octave() { var o = parseInt(g('oct', 4), 10); return (o >= -1 && o <= 8) ? o : 4; }
  function velocity() { var v = parseInt(g('vel', 100), 10); return (v >= 1 && v <= 127) ? v : 100; }
  function ccs() { var l = g('ccs', null); return Object.prototype.toString.call(l) === '[object Array]' ? l : null; }
  function rules() { var l = g('rules', null); return Object.prototype.toString.call(l) === '[object Array]' ? l : []; }
  function rulesList() { var l = g('rules', null); if (Object.prototype.toString.call(l) !== '[object Array]') { l = []; set('rules', l); } return l; }

  // ---- helpers ----
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function hex(b) { var o = []; for (var i = 0; i < b.length; i++) o.push(('0' + (b[i] & 0xFF).toString(16).toUpperCase()).slice(-2)); return o.join(' '); }
  function parseHex(s) {
    var parts = String(s || '').replace(/0x/gi, '').replace(/[,;]/g, ' ').trim().split(/\s+/), out = [];
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      if (!/^[0-9a-f]{1,2}$/i.test(parts[i])) throw new Error('bad byte "' + parts[i] + '"');
      out.push(parseInt(parts[i], 16));
    }
    return out;
  }
  function noteName(n) { var o = Math.floor(n / 12) - 1 - (g('naming', 0) ? 1 : 0); return NOTE_NAMES[((n % 12) + 12) % 12] + o; }
  function ccName(n) { var p = profile(); return p.cc[n] || CC_NAMES[n] || ''; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toast(msg) {
    if (!els.toast) return;
    els.toast.textContent = msg; els.toast.hidden = false;
    clearTimeout(els.toast._t); els.toast._t = setTimeout(function () { els.toast.hidden = true; }, 2200);
  }

  // ---- decode (for the monitor, rules and learn) ----
  function decode(b) {
    var st = b[0];
    if (st === 0xF0) {
      var extra = '';
      if (b[1] === 0x7E && b[3] === 0x06 && b[4] === 0x02) extra = ' Identity Reply';
      else if (b[1] === 0x43) extra = ' Yamaha'; else if (b[1] === 0x41) extra = ' Roland'; else if (b[1] === 0x42) extra = ' Korg';
      return { kind: 'sysex', text: 'SysEx' + extra + ' (' + b.length + ' bytes)' };
    }
    if (st >= 0xF1) {
      var n = { 0xF1: 'MTC Quarter', 0xF2: 'Song Position', 0xF3: 'Song Select', 0xF6: 'Tune Request', 0xF8: 'Clock', 0xFA: 'Start', 0xFB: 'Continue', 0xFC: 'Stop', 0xFE: 'Active Sensing', 0xFF: 'Reset' }[st] || ('System ' + hex([st]));
      return { kind: st === 0xF8 ? 'clock' : st === 0xFE ? 'as' : 'sys', text: n + (b.length > 1 ? ' ' + hex(b.slice(1)) : '') };
    }
    var t = st >> 4, c = st & 15, d1 = b[1] || 0, d2 = b[2] || 0;
    switch (t) {
      case 8: return { kind: 'note', ch: c, num: d1, val: d2, on: false, text: 'Note Off ' + noteName(d1) + ' (' + d1 + ') vel ' + d2 };
      case 9: return d2 === 0 ? { kind: 'note', ch: c, num: d1, val: 0, on: false, text: 'Note Off ' + noteName(d1) + ' (' + d1 + ') vel 0' }
                              : { kind: 'note', ch: c, num: d1, val: d2, on: true, text: 'Note On ' + noteName(d1) + ' (' + d1 + ') vel ' + d2 };
      case 10: return { kind: 'pat', ch: c, num: d1, val: d2, text: 'Poly Pressure ' + noteName(d1) + ' ' + d2 };
      case 11: return { kind: 'cc', ch: c, num: d1, val: d2, text: 'CC ' + d1 + (ccName(d1) ? ' ' + ccName(d1) : '') + ' = ' + d2 };
      case 12: return { kind: 'pc', ch: c, num: d1, val: d1, text: 'Program ' + (d1 + 1) + ' (0-based ' + d1 + ')' };
      case 13: return { kind: 'at', ch: c, num: 0, val: d1, text: 'Channel Pressure ' + d1 };
      case 14: var v = (d1 | (d2 << 7)) - 8192; return { kind: 'pb', ch: c, num: 0, val: v, text: 'Pitch Bend ' + (v > 0 ? '+' : '') + v };
    }
    return { kind: 'other', text: hex(b) };
  }

  // ---- sending ----
  function midi() { return App.midi; }
  function hasOut() { var m = midi(); return !!(m && m.ready && (hubOutId() != null || m.hasOutput)); }
  function sourceKey(bytes, origin, portId) {
    var type = bytes[0] & 0xF0;
    return JSON.stringify([origin || 'app', portId == null ? '' : String(portId), type === 0x80 ? 0x90 : type, bytes[0] & 15, bytes[1]]);
  }
  function releaseSource(key, releaseVelocity) {
    var list = sentSources[key];
    if (!list) return false;
    delete sentSources[key];
    var ok = false;
    list.forEach(function (target) {
      if (target.key) {
        if (--sentTargets[target.key] > 0) return;
        delete sentTargets[target.key];
      }
      var off = target.off.slice();
      if (target.key && Number.isInteger(releaseVelocity) && releaseVelocity >= 0 && releaseVelocity <= 127) off[2] = releaseVelocity;
      var released = sendOut(off, target.sender);
      if (!released) toast('Original mapped MIDI output unavailable; release delivery could not be confirmed.');
      ok = released || ok;
    });
    return ok;
  }
  function flushHub(reason) {
    var m = midi();
    if (m && typeof m.flushMusicalOutputs === 'function') {
      // Note→CC rules also have a paired zero release. The shared musical
      // ledger knows sustain, while this mapping retains any other CC target.
      Object.keys(sentSources).forEach(function (key) { sentSources[key].forEach(function (target) {
        if (!target.key && !sendOut(target.off, target.sender)) toast('Original mapped MIDI output unavailable; controller release could not be confirmed.');
      }); });
      m.flushMusicalOutputs(reason);
    }
    else Object.keys(sentSources).forEach(function (key) { releaseSource(key); });
    sentSources = Object.create(null); sentTargets = Object.create(null);
  }
  function scaleBoundary() {
    var next = [App.store.get('fb.root', 9), App.store.get('fb.scale', 'minorPent'), !!(App.scaleLock && App.scaleLock.on)];
    if (hubScaleState && JSON.stringify(next) !== JSON.stringify(hubScaleState) && (next[2] || hubScaleState[2])) flushHub('Scale or lock changed');
    hubScaleState = next;
  }
  function send(bytes, origin, portId) {
    // Raw editor streams may contain multiple/running-status messages. The
    // shared MIDI service parses and owns their musical ledger; interpreting
    // only the first message here would lose later note releases or hide a
    // disallowed Note On behind an allowed clock/configuration prefix.
    if (origin === 'raw' && midi() && typeof midi().flushMusicalOutputs === 'function') return hasOut() && sendOut(bytes);
    var type = bytes[0] & 0xF0, source = sourceKey(bytes, origin, portId);
    var off = type === 0x80 || (type === 0x90 && bytes[2] === 0);
    if (off && Object.prototype.hasOwnProperty.call(sentSources, source)) return releaseSource(source, bytes[2]);
    // The same physical source/channel/pitch is held until release. This also
    // prevents reflected Note Ons from repeatedly re-triggering the output.
    if (type === 0x90 && bytes[2] > 0 && sentSources[source]) return true;
    if (type === 0xB0 && bytes[2] === 0 && sentSources[source]) return releaseSource(source);
    var msgs = [bytes];
    if ((origin === 'thru') || (origin !== 'raw' && g('rulesApp', false))) msgs = applyRules(bytes);
    var generatesNote = msgs.some(function (b) { return (b[0] & 0xF0) === 0x90 && b[2] > 0; });
    // Every musical origin, including on-screen keys and raw hex Note Ons,
    // obeys the scale AFTER Rules. Protocol/configuration messages keep working.
    if (App.scaleLock) msgs = msgs.filter(function (m) { return !((m[0] & 0xF0) === 0x90 && m[2] > 0 && !App.scaleLock.allows(m[1])); });
    if ((type === 0x90 && bytes[2] > 0) || generatesNote) {
      if (!sentSources[source]) sentSources[source] = [];
    }
    var ok = false;
    for (var i = 0; i < msgs.length; i++) {
      if (!hasOut()) continue;
      var b = msgs[i], isOn = (b[0] & 0xF0) === 0x90 && b[2] > 0;
      var sender = midi().bindMusicalOutput ? midi().bindMusicalOutput(hubOutId()) : null;
      if (isOn) {
        var targetKey = JSON.stringify([hubOutId(), b[0] & 15, b[1]]);
        if (!sentSources[source]) sentSources[source] = [];
        // A rule can collapse independent inputs onto one output note. Only
        // its final source release may stop that shared sounding note.
        if (sentSources[source].some(function (t) { return t.key === targetKey; })) continue;
        var existing = sentTargets[targetKey] || 0;
        if (existing || sendOut(b, sender)) {
          sentTargets[targetKey] = existing + 1;
          sentSources[source].push({ key: targetKey, off: [0x80 | (b[0] & 15), b[1], 0], sender: sender });
          ok = true;
        }
      } else if ((b[0] & 0xF0) !== 0x80 && !((b[0] & 0xF0) === 0x90 && b[2] === 0)) {
        var didSend = sendOut(b, sender); ok = didSend || ok;
        if (didSend && type === 0x90 && bytes[2] > 0 && (b[0] & 0xF0) === 0xB0) {
          sentSources[source].push({ off: [b[0], b[1], 0], sender: sender });
        }
      }
      // Unowned note-offs cannot release another input's mapped voice.
    }
    if (!hasOut() && origin !== 'thru') toast('No MIDI output — pick one above');
    return ok;
  }
  function sendCh(status, d1, d2) { var b = [(status << 4) | ch(), d1 & 127]; if (d2 !== undefined) b.push(d2 & 127); send(b); }
  function cc(n, v) { sendCh(11, n, v); }
  function noteOn(n, v) { sendCh(9, n, v); App.emit('note:input', { on: true, midi: n, vel: v, src: 'midihub' }); }
  function noteOff(n) { sendCh(8, n, 0); App.emit('note:input', { on: false, midi: n, vel: 0, src: 'midihub' }); }

  // ---- SYNTH OUT (v0.80.0): the Hub's own output, independent of the key-
  // light output, so a LUMI keeps the lights while a MODX gets the controls.
  // midihub.outId = a port id, 'shared' (the light output), or unset = auto:
  // a synth-named port (port 1 of a multi-port synth first), never a LUMI or
  // Windows' built-in GS Wavetable.
  var SYNTH_RE = /modx|montage|motif|yamaha|roland|korg|nord|kronos|fantom|juno|jupiter|moog|sequential|prophet|arturia|novation|waldorf|elektron|kawai|casio|synth/i;
  var NOT_SYNTH_RE = /lumi|wavetable|microsoft/i;
  function autoOut() {
    var m = midi(); if (!m || !m.ready) return null;
    var c = m.outputs.filter(function (p) { return !NOT_SYNTH_RE.test(p.name || ''); });
    var named = c.filter(function (p) { return SYNTH_RE.test(p.name || ''); });
    var pool = named.length ? named : c;
    var first = pool.filter(function (p) { return /(-|port\s*)1\b|\s1$/i.test(p.name || ''); })[0] || pool[0];
    return first ? first.id : null;
  }
  function hubOutId() {
    var m = midi(); if (!m || !m.ready) return null;
    var id = g('outId', null);
    if (id === 'shared') return null;
    if (id != null && m.outputs.some(function (p) { return String(p.id) === String(id); })) return id;
    return autoOut();
  }
  function portName(id) { var m = midi(); var p = m && m.outputs.filter(function (x) { return String(x.id) === String(id); })[0]; return p ? p.name || '' : ''; }
  function hubOutName() { var id = hubOutId(), m = midi(); return id == null ? (m && m.outputName) || '' : portName(id); }
  function sendOut(b, sender) {
    var m = midi(), id = hubOutId();
    hubSending = true;
    hubEchoes.push({ key: b.join(','), until: performance.now() + (b[0] === 0xF8 ? 4 : 40) });
    if (hubEchoes.length > 256) hubEchoes.shift();
    try {
      if (typeof sender === 'function') return sender(b);
      if (arguments.length > 1 && m.bindMusicalOutput) return false;
      return id != null && m.sendTo ? m.sendTo(id, b) : m.send(b);
    }
    finally { hubSending = false; }
  }

  // ---- CONTROL view (v0.80.0): big knobs for the sound of one Part ----
  var BASE_KNOBS = [
    { cc: 74, name: 'Cutoff', def: 64 }, { cc: 71, name: 'Resonance', def: 64 },
    { cc: 73, name: 'Attack', def: 64 }, { cc: 72, name: 'Release', def: 64 },
    { cc: 91, name: 'Reverb', def: 40 }, { cc: 93, name: 'Chorus', def: 0 },
    { cc: 7, name: 'Volume', def: 100 }, { cc: 10, name: 'Pan', def: 64 }
  ];
  function knobSet() {
    var k = profile().knobs || {};
    return { hero: k.hero || null, main: BASE_KNOBS, extra: k.extra || [] };
  }
  function allKnobs() { var s = knobSet(); return (s.hero ? [s.hero] : []).concat(s.main, s.extra); }
  function knobDef(cc) { var k = allKnobs().filter(function (x) { return x.cc === cc; })[0]; return k ? k.def : 64; }
  function kvAll() { var o = g('kv', null); return o && typeof o === 'object' ? o : {}; }
  function kv(cc, c) { var a = kvAll()[c == null ? ch() : c]; var v = a && a[cc]; return typeof v === 'number' ? v : knobDef(cc); }
  function setKv(cc, v, c) { var a = kvAll(), k = String(c == null ? ch() : c); a[k] = a[k] || {}; a[k][cc] = v; set('kv', a); }
  var ARC0 = -135, ARC1 = 135;
  function arcPath(v) {
    var a = (ARC0 + (ARC1 - ARC0) * v / 127) * Math.PI / 180, a0 = ARC0 * Math.PI / 180, r = 25;
    var x0 = 32 + r * Math.sin(a0), y0 = 32 - r * Math.cos(a0), x1 = 32 + r * Math.sin(a), y1 = 32 - r * Math.cos(a);
    var big = (a - a0) > Math.PI ? 1 : 0;
    return v <= 0 ? '' : 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + big + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
  }
  function knobHTML(k, hero) {
    var v = kv(k.cc), a = (ARC0 + (ARC1 - ARC0) * v / 127) * Math.PI / 180;
    return '<div class="mh-knob' + (hero ? ' hero' : '') + '" role="slider" tabindex="0" data-cc="' + k.cc + '" aria-label="' + esc(k.name) + '" aria-valuemin="0" aria-valuemax="127" aria-valuenow="' + v + '" title="' + esc(k.name) + ' \u00b7 CC ' + k.cc + ' \u2014 drag up/down or arrow keys (click it first to scroll it); double-tap resets">' +
      '<svg viewBox="0 0 64 64" aria-hidden="true"><path class="mh-ktrack" d="' + arcPath(127) + '"/><path class="mh-karc" d="' + arcPath(v) + '"/>' +
      '<line class="mh-kptr" x1="32" y1="32" x2="' + (32 + 17 * Math.sin(a)).toFixed(2) + '" y2="' + (32 - 17 * Math.cos(a)).toFixed(2) + '"/></svg>' +
      '<b class="mh-kv">' + v + '</b><span class="mh-kn">' + esc(k.name) + '</span><small class="muted">CC ' + k.cc + '</small></div>';
  }
  function paintKnob(cc) {
    if (!els.knobs) return;
    var el = els.knobs.parentNode.querySelector('.mh-knob[data-cc="' + cc + '"]');
    if (!el) return;
    var v = kv(cc), a = (ARC0 + (ARC1 - ARC0) * v / 127) * Math.PI / 180;
    el.setAttribute('aria-valuenow', v);
    el.querySelector('.mh-karc').setAttribute('d', arcPath(v));
    var p = el.querySelector('.mh-kptr'); p.setAttribute('x2', (32 + 17 * Math.sin(a)).toFixed(2)); p.setAttribute('y2', (32 - 17 * Math.cos(a)).toFixed(2));
    el.querySelector('.mh-kv').textContent = v;
  }
  function turn(n, v, quiet) {
    v = clamp(Math.round(v), 0, 127);
    if (v === kv(n)) return;
    setKv(n, v);
    paintKnob(n);
    if (!quiet) cc(n, v);
  }
  function partLabel() { return profile() === PROFILES.yamaha ? 'Part' : 'Ch'; }
  function renderControl() {
    if (!els.knobs) return;
    var s = knobSet();
    var parts = '';
    for (var c = 0; c < 16; c++) parts += '<button type="button" data-part="' + c + '" class="' + (c === ch() ? 'active' : '') + '" aria-pressed="' + (c === ch()) + '">' + (c + 1) + '</button>';
    els.parts.innerHTML = '<span class="mh-plab">' + partLabel() + '</span>' + parts;
    els.hero.innerHTML = s.hero ? knobHTML(s.hero, true) : '';
    els.hero.hidden = !s.hero;
    els.knobs.innerHTML = s.main.map(function (k) { return knobHTML(k); }).join('');
    els.extra.innerHTML = s.extra.length ? '<h3>' + esc(profile().knobs.extraTitle || 'More') + '</h3><div class="mh-knobs">' + s.extra.map(function (k) { return knobHTML(k); }).join('') + '</div>' : '';
    paintProg();
    paintCvOut();
  }
  function paintCvOut() {
    if (!els.cvout) return;
    var n = hubOutName();
    els.cvout.textContent = n ? partLabel() + ' ' + (ch() + 1) + ' \u2192 ' + n : 'No synth output yet \u2014 connect MIDI above';
  }
  function progNum() { return clamp(parseInt(g('prog', 1), 10) || 1, 1, 128); }
  function paintProg() {
    if (!els.cvpnum) return;
    els.cvpnum.textContent = progNum();
    els.cvbank.textContent = 'Bank ' + g('msb', profile().bankMsb) + '/' + g('lsb', 0);
  }
  function sendProgram(pg) {
    var msb = clamp(parseInt(g('msb', profile().bankMsb), 10) || 0, 0, 127), lsb = clamp(parseInt(g('lsb', 0), 10) || 0, 0, 127);
    pg = clamp(pg, 1, 128);
    set('msb', msb); set('lsb', lsb); set('prog', pg);
    cc(0, msb); cc(32, lsb); sendCh(12, pg - 1);
    if (els.prog) els.prog.value = pg;
    paintProg();
    toast('Bank ' + msb + '/' + lsb + ' \u00b7 program ' + pg);
  }
  function wireKnobs(box) {
    var drag = null;
    box.addEventListener('pointerdown', function (e) {
      var k = e.target.closest && e.target.closest('.mh-knob'); if (!k) return;
      e.preventDefault();
      var c = +k.dataset.cc;
      drag = { cc: c, y: e.clientY, v: kv(c), el: k };
      try { k.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ }
      k.focus();
    });
    box.addEventListener('pointermove', function (e) {
      if (!drag) return;
      turn(drag.cc, drag.v + (drag.y - e.clientY) / (e.shiftKey ? 6 : 1.5));
    });
    var end = function () { drag = null; };
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
    // the wheel turns only a knob that was clicked or tabbed to: a page scroll
    // passing over the knobs must never turn the synth down (Volume / Cutoff)
    box.addEventListener('wheel', function (e) {
      var k = e.target.closest && e.target.closest('.mh-knob'); if (!k || document.activeElement !== k) return;
      e.preventDefault();
      var c = +k.dataset.cc; turn(c, kv(c) + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 1 : 4));
    }, { passive: false });
    box.addEventListener('keydown', function (e) {
      var k = e.target.closest && e.target.closest('.mh-knob'); if (!k) return;
      var c = +k.dataset.cc, v = kv(c), n = null;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') n = v + 1;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') n = v - 1;
      else if (e.key === 'PageUp') n = v + 10; else if (e.key === 'PageDown') n = v - 10;
      else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = 127;
      if (n == null) return;
      e.preventDefault(); e.stopPropagation(); turn(c, n);
    });
    box.addEventListener('dblclick', function (e) {
      var k = e.target.closest && e.target.closest('.mh-knob'); if (!k) return;
      var c = +k.dataset.cc; turn(c, knobDef(c));
    });
  }
  function pickPart(c) {
    releaseAll();
    set('ch', c);
    if (els.ch) els.ch.value = String(c);
    if (els.chlabel) els.chlabel.textContent = c + 1;
    renderCcs(); renderControl();
  }

  function panic() {
    releaseAll();
    flushHub('MIDI Hub panic');
    for (var c = 0; c < 16; c++) {
      send([0xB0 | c, 123, 0], 'raw'); send([0xB0 | c, 120, 0], 'raw'); send([0xB0 | c, 64, 0], 'raw'); send([0xE0 | c, 0, 64], 'raw');
    }
    toast('Panic: all notes & sound off on 16 channels');
  }

  // ---- rules ----
  function newRule(o) {
    var r = { id: 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), on: true, name: '', m: { type: 'cc', ch: 0, lo: 0, hi: 127 }, a: { block: false, ch: 0, num: '', add: 0, scale: 100, to: 'same' } };
    if (o) { if (o.name) r.name = o.name; if (o.m) for (var k in o.m) r.m[k] = o.m[k]; if (o.a) for (var j in o.a) r.a[j] = o.a[j]; }
    return r;
  }
  function matches(r, d) {
    var m = r.m;
    if (m.type !== 'any' && m.type !== d.kind && !(m.type === 'at' && d.kind === 'pat')) return false;
    if (m.ch && m.ch !== d.ch + 1) return false;
    if (d.kind === 'note' || d.kind === 'cc' || d.kind === 'pc' || d.kind === 'pat') { if (d.num < m.lo || d.num > m.hi) return false; }
    return true;
  }
  function applyRules(bytes) {
    var list = rules();
    if (!list.length || bytes[0] >= 0xF0) return [bytes];
    var d = decode(bytes);
    if (['note', 'cc', 'pc', 'pb', 'at', 'pat'].indexOf(d.kind) === -1) return [bytes];
    var kind = d.kind, c = d.ch, num = d.num, val = d.val, on = d.on, touched = false;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r.on || !matches(r, { kind: kind, ch: c, num: num, val: val })) continue;
      var a = r.a;
      touched = true;
      if (a.block) return [];
      if (a.ch) c = a.ch - 1;
      if (a.to && a.to !== 'same' && a.to !== kind) {
        if (a.to === 'cc') { val = kind === 'note' ? (on ? val : 0) : kind === 'pb' ? clamp(Math.round((val + 8192) / 128), 0, 127) : val; kind = 'cc'; }
        else if (a.to === 'note') { on = val > 0; kind = 'note'; }
        else if (a.to === 'pc') { if (kind === 'cc' || kind === 'at') num = val; kind = 'pc'; }
      }
      if (a.num !== '' && a.num !== null && a.num !== undefined) num = parseInt(a.num, 10);
      if (a.add) num += parseInt(a.add, 10) || 0;
      if (a.scale !== undefined && a.scale !== '' && parseInt(a.scale, 10) !== 100) val = Math.round(val * (parseInt(a.scale, 10) || 0) / 100);
      num = clamp(num, 0, 127);
    }
    if (!touched) return [bytes];
    if (kind === 'pb') { val = clamp(val, -8192, 8191) + 8192; return [[0xE0 | c, val & 127, (val >> 7) & 127]]; }
    val = clamp(val, 0, 127);
    if (kind === 'note') return [[(on ? 0x90 : 0x80) | c, num, val]];
    if (kind === 'cc') return [[0xB0 | c, num, val]];
    if (kind === 'pc') return [[0xC0 | c, num]];
    if (kind === 'at') return [[0xD0 | c, val]];
    if (kind === 'pat') return [[0xA0 | c, num, val]];
    return [bytes];
  }
  function installFilter() {
    if (!midi() || !midi().setInputFilter) return;
    midi().setInputFilter(g('rulesIn', false) ? function (b) { var r = applyRules(b); return r.length ? r[0] : null; } : null);
  }

  // ---- incoming ----
  function onRaw(d) {
    var b = d && d.bytes; if (!b || !b.length) return;
    logMsg('in', b);
    // two-way: the synth's own knobs / program changes on this Part move the screen
    if ((b[0] & 0xF0) === 0xB0 && (b[0] & 15) === ch() && b.length > 2 && allKnobs().some(function (k) { return k.cc === b[1]; })) { setKv(b[1], b[2]); paintKnob(b[1]); }
    if ((b[0] & 0xF0) === 0xC0 && (b[0] & 15) === ch() && b.length > 1) { set('prog', b[1] + 1); if (els.prog) els.prog.value = b[1] + 1; paintProg(); }
    if (b[0] === 0xF0 && els.rx) {
      els.rx.value = hex(b); els.rxInfo.textContent = b.length + ' bytes';
      if (b[1] === 0x7E && b[3] === 0x06 && b[4] === 0x02 && els.idReply) els.idReply.textContent = identity(b);
    }
    if (learning) {
      var dd = decode(b);
      if (['note', 'cc', 'pc', 'pb', 'at', 'pat'].indexOf(dd.kind) !== -1) {
        learning.m.type = dd.kind === 'pat' ? 'at' : dd.kind; learning.m.ch = dd.ch + 1; learning.m.lo = learning.m.hi = dd.num;
        set('rules', rules().map(function (r) { return r.id === learning.id ? learning : r; }));
        learning = null; renderRules(); toast('Learned: ' + dd.text);
      }
    }
    // The explicit scale-locked practice route owns forwarding while active.
    // A saved Hub Thru setting must not duplicate or bypass its note filter.
    var t = b[0] & 0xF0, source = sourceKey(b, 'thru', d.portId);
    var ownsRelease = (t === 0x80 || (t === 0x90 && b[2] === 0)) && Object.prototype.hasOwnProperty.call(sentSources, source);
    hubEchoes = hubEchoes.filter(function (x) { return x.until > performance.now(); });
    var echoIndex = hubEchoes.findIndex(function (x) { return x.key === b.join(','); });
    var reflected = !ownsRelease && t !== 0x90 && echoIndex >= 0;
    if (reflected) hubEchoes.splice(echoIndex, 1);
    if (!hubSending && !reflected && !(App.practiceRouter && App.practiceRouter.active) && g('thru', false) && b[0] !== 0xFE && hasOut()) send(b, 'thru', d.portId);
  }
  function identity(b) {
    var mf = { 0x43: 'Yamaha', 0x41: 'Roland', 0x42: 'Korg', 0x47: 'Akai', 0x00: 'extended id' }[b[5]] || ('mfr ' + hex([b[5]]));
    return mf + ' · family ' + hex(b.slice(6, 8)) + ' · model ' + hex(b.slice(8, 10)) + ' · version ' + hex(b.slice(10, 14)) + '  [' + hex(b) + ']';
  }

  // ---- monitor ----
  function logMsg(dir, b) {
    var d = decode(b);
    if (els.ledIn) {
      var led = dir === 'in' ? els.ledIn : els.ledOut, lab = dir === 'in' ? els.lastIn : els.lastOut;
      led.classList.add('lit'); clearTimeout(led._t); led._t = setTimeout(function () { led.classList.remove('lit'); }, 90);
      lab.textContent = (d.ch !== undefined ? 'ch' + (d.ch + 1) + ' ' : '') + d.text;
    }
    if (!els.mon || monPaused) return;
    if (d.kind === 'clock' && !els.monClock.checked) return;
    if (d.kind === 'as' && !els.monAS.checked) return;
    if (dir === 'in' && !els.monIn.checked) return;
    if (dir === 'out' && !els.monOut.checked) return;
    monQ.push({ dir: dir, b: b, d: d, t: performance.now() });
    if (!monRaf) monRaf = requestAnimationFrame(flushMon);
  }
  function flushMon() {
    monRaf = 0;
    if (!els.mon) { monQ = []; return; }
    var frag = document.createDocumentFragment(), showHex = g('hex', false);
    for (var i = 0; i < monQ.length; i++) {
      var q = monQ[i], r = document.createElement('div');
      r.className = 'mh-r ' + q.dir;
      var hx = (showHex || q.d.kind === 'sysex') ? hex(q.b.length > 24 ? q.b.slice(0, 24) : q.b) + (q.b.length > 24 ? ' …' : '') : '';
      r.innerHTML = '<span class="mh-t">' + ((q.t - t0) / 1000).toFixed(3) + '</span><span class="mh-dir">' + (q.dir === 'in' ? 'IN' : 'OUT') + '</span>' +
        '<span class="mh-t">' + (q.d.ch !== undefined ? 'ch' + (q.d.ch + 1) : '') + '</span><span>' + esc(q.d.text) + '</span><span class="mh-hex">' + hx + '</span>';
      frag.appendChild(r); monCount++;
    }
    monQ = [];
    var atBottom = els.mon.scrollTop + els.mon.clientHeight >= els.mon.scrollHeight - 30;
    els.mon.appendChild(frag);
    while (els.mon.children.length > 800) els.mon.removeChild(els.mon.firstChild);
    if (atBottom) els.mon.scrollTop = els.mon.scrollHeight;
    els.monCount.textContent = monCount + ' messages';
  }

  // ---- keyboard ----
  function base() { return (octave() + 1) * 12; }
  function buildKeyboard() {
    var kb = els.kb; if (!kb) return;
    kb.innerHTML = '';
    var b = base();
    els.octLabel.textContent = 'Octave ' + octave() + ' · ' + noteName(b) + '–' + noteName(b + 24);
    var whites = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24], blacks = [1, 3, 6, 8, 10, 13, 15, 18, 20, 22], ww = 100 / whites.length;
    whites.forEach(function (semi, i) {
      var k = document.createElement('div'); k.className = 'mh-wk'; k.style.left = (i * ww) + '%'; k.style.width = ww + '%';
      k.dataset.note = b + semi; k.textContent = noteName(b + semi); kb.appendChild(k);
    });
    blacks.forEach(function (semi) {
      var idx = 0; while (whites[idx] < semi) idx++;
      var k = document.createElement('div'); k.className = 'mh-bk'; k.style.left = (idx * ww - ww * 0.3) + '%'; k.style.width = (ww * 0.6) + '%';
      k.dataset.note = b + semi; kb.appendChild(k);
    });
    for (var n in held) { var el = keyEl(n); if (el) el.classList.add('on'); }
  }
  function keyEl(n) { return els.kb ? els.kb.querySelector('[data-note="' + n + '"]') : null; }
  function press(n) { if (held[n]) return; held[n] = 1; noteOn(n, velocity()); var el = keyEl(n); if (el) el.classList.add('on'); }
  function release(n) { if (!held[n]) return; delete held[n]; noteOff(n); var el = keyEl(n); if (el) el.classList.remove('on'); }
  function releaseAll() { for (var n in held) release(+n); }
  function shiftOct(d) { releaseAll(); set('oct', clamp(octave() + d, -1, 8)); buildKeyboard(); }
  function setSustain(v) { if (sustain === v) return; sustain = v; cc(64, v ? 127 : 0); els.sus.classList.toggle('active', v); }

  // ---- clock at the shared tempo ----
  function bpm() { var b = parseFloat(App.store.get('met.bpm', 120)); return (b >= 20 && b <= 300) ? b : 120; }
  function clockTick() {
    var ms = 60000 / bpm() / 24, now = performance.now();
    if (clockNext < now - 200) clockNext = now; // stall: never burst catch-up ticks
    while (clockNext <= now) { send([0xF8], 'raw'); clockNext += ms; }
  }
  function setClock(on) {
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    if (on) { clockNext = performance.now(); clockTimer = setInterval(clockTick, 5); }
    paintClock();
  }
  function paintClock() { if (els.clockBtn) { els.clockBtn.textContent = clockTimer ? 'Clock out: on · ' + Math.round(bpm()) + ' BPM' : 'Clock out: off'; els.clockBtn.classList.toggle('active', !!clockTimer); } }

  // the app's own piano stays quiet while the Hub is open (a synth already
  // sounds its notes) unless 'App voice' is ticked; other pages follow the
  // Settings switch (midi.appSound)
  function applyMute() { if (midi() && midi().mute) midi().mute('midihub', App.active === 'midihub' && !g('hear', false)); }

  // ---- views ----
  function view(name) {
    set('view', name);
    root.querySelectorAll('.mh-view').forEach(function (v) { v.hidden = v.dataset.view !== name; });
    root.querySelectorAll('#mh-views button').forEach(function (b) { b.classList.toggle('active', b.dataset.view === name); });
    if (name === 'monitor' && els.mon) els.mon.scrollTop = els.mon.scrollHeight;
    if (name === 'sysex') updatePreviews();
  }

  function paintPorts() {
    var m = midi(), sup = m && m.supported, ready = sup && m.ready;
    els.connect.hidden = !!ready;
    els.ports.hidden = !ready;
    if (!sup) { els.status.textContent = 'MIDI is not available here — use Chrome or Edge (desktop or Android).'; els.status.className = 'mh-status bad'; return; }
    if (!ready) { els.status.textContent = 'Not connected: the browser will ask for permission (allow SysEx too).'; els.status.className = 'mh-status'; return; }
    var fill = function (sel, list, cur, all) {
      sel.innerHTML = all ? '<option value="all">All keyboards</option>' : '<option value="">— none —</option>';
      list.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.appendChild(o); });
      sel.value = cur == null ? (all ? 'all' : '') : String(cur);
    };
    fill(els.inSel, m.inputs, m.inputId, true);
    els.outSel.innerHTML = '<option value="shared">Same as key lights</option>';
    m.outputs.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; els.outSel.appendChild(o); });
    var hid = hubOutId(); els.outSel.value = hid == null ? 'shared' : String(hid);
    var inN = m.inputId === 'all' ? { name: 'All keyboards' } : m.inputs.filter(function (p) { return String(p.id) === String(m.inputId); })[0], outN = m.outputs.filter(function (p) { return String(p.id) === String(m.outputId); })[0];
    var so = hubOutName();
    els.status.textContent = (inN ? 'In: ' + inN.name : 'In: none') + ' · ' + (so ? 'Synth out: ' + so : 'Synth out: none') + (outN && outN.name !== so ? ' · Key lights: ' + outN.name : '');
    els.status.className = 'mh-status ' + (inN || so ? 'ok' : 'bad');
    paintCvOut();
    var warnLights = outN && m.lightsOn && !/lumi/i.test(outN.name || ''); // by the OUTPUT's name: a LUMI input + synth output must not paint the synth
    els.lightsWarn.hidden = !warnLights;
    els.thruInfo.textContent = (g('thru', false) ? 'Thru on: In → Rules → Out. ' : '') + (g('hear', false) ? '' : 'soundLAB\u2019s voice is muted here: the device makes the sound.');
  }

  function render() {
    var p = profile();
    var profOpts = ''; for (var k in PROFILES) profOpts += '<option value="' + k + '"' + (profile() === PROFILES[k] ? ' selected' : '') + '>' + PROFILES[k].name + '</option>';
    var chOpts = ''; for (var c = 0; c < 16; c++) chOpts += '<option value="' + c + '"' + (c === ch() ? ' selected' : '') + '>' + (c + 1) + '</option>';
    root.innerHTML =
      '<div class="card mh-top">' +
        '<h2>MIDI Hub <span class="muted small">read · write · reshape — any MIDI device</span></h2>' +
        '<div class="row tight" id="mh-connect"><button type="button" class="btn sm primary" id="mh-enable">Connect MIDI</button></div>' +
        '<div class="row tight" id="mh-ports">' +
          '<label class="field">In<select id="mh-in"></select></label>' +
          '<label class="field" title="Where the Hub sends: your synth. The key lights keep their own output (Lights & help).">Synth out<select id="mh-out"></select></label>' +
          '<label class="field">Channel<select id="mh-ch">' + chOpts + '</select></label>' +
          '<label class="field">Device<select id="mh-profile">' + profOpts + '</select></label>' +
          '<label class="mh-chk" title="Pass everything from In to Out, through the Rules"><input type="checkbox" id="mh-thru"' + (g('thru', false) ? ' checked' : '') + '> Thru</label>' +
          '<label class="mh-chk" title="Also play soundLAB\u2019s own piano for the notes coming in. Off = only the device sounds (no doubled notes)."><input type="checkbox" id="mh-hear"' + (g('hear', false) ? ' checked' : '') + '> App voice</label>' +
          '<button type="button" class="btn sm danger" id="mh-panic" title="All notes off + all sound off on every channel">Panic</button>' +
        '</div>' +
        '<div class="row tight small" style="margin-top:8px"><span id="mh-status" class="mh-status"></span><span class="muted" id="mh-thruinfo"></span></div>' +
        '<div class="mh-warn small" id="mh-lightswarn" hidden>Key lights are ON and the output is not a LUMI — soundLAB will send note-ons to it as "lights" and a synth will play them. Turn lights off in Lights &amp; help.</div>' +
        '<div class="row tight small mh-act"><span><i class="mh-led in" id="mh-ledin"></i>In <span class="mh-mono" id="mh-lastin">—</span></span><span><i class="mh-led out" id="mh-ledout"></i>Out <span class="mh-mono" id="mh-lastout">—</span></span></div>' +
      '</div>' +
      '<div class="seg mh-seg" id="mh-views" role="group" aria-label="Hub views">' +
        '<button type="button" data-view="control">Control</button><button type="button" data-view="play">Play</button><button type="button" data-view="controls">Controls</button><button type="button" data-view="rules">Rules</button>' +
        '<button type="button" data-view="sysex">SysEx</button><button type="button" data-view="monitor">Monitor</button><button type="button" data-view="learn">Learn</button>' +
      '</div>' +

      // CONTROL (v0.80.0)
      '<div class="mh-view" data-view="control" hidden>' +
        '<div class="card mh-cv">' +
          '<div class="mh-cv-head"><h2>Synth control</h2><span class="muted small" id="mh-cvout"></span></div>' +
          '<div class="mh-parts" id="mh-parts" role="group" aria-label="Part"></div>' +
          '<div class="mh-hero" id="mh-hero"></div>' +
          '<div class="mh-knobs" id="mh-knobs"></div>' +
          '<div id="mh-extra"></div>' +
          '<div class="mh-cv-prog"><button type="button" class="btn" id="mh-cvprev" aria-label="Previous program">' + App.icon('left', 16) + ' Prev</button>' +
            '<div class="mh-cv-pnum"><span class="muted small">Program</span><b id="mh-cvpnum"></b><span class="muted small" id="mh-cvbank"></span></div>' +
            '<button type="button" class="btn" id="mh-cvnext" aria-label="Next program">Next ' + App.icon('right', 16) + '</button></div>' +
          '<div class="row tight mh-cv-acts"><button type="button" class="btn sm" id="mh-cvsend" title="Send every knob on this Part to the synth">Send all</button>' +
            '<button type="button" class="btn sm" id="mh-cvreset" title="Every knob back to its start value, sent">Reset knobs</button></div>' +
          '<p class="muted small">Drag a knob up or down (Shift = fine), scroll on it, or use the arrow keys; double-tap puts it back. Turn a knob on the synth and the one here follows. Bank and program numbers live in Play.</p>' +
        '</div>' +
      '</div>' +

      // PLAY
      '<div class="mh-view" data-view="play" hidden>' +
        '<div class="card"><h2>Keys</h2>' +
          '<div class="row tight" style="margin-bottom:8px">' +
            '<button type="button" class="btn sm" id="mh-octdn">Octave −</button><span class="chip" id="mh-octlabel"></span><button type="button" class="btn sm" id="mh-octup">Octave +</button>' +
            '<label class="field">Velocity <input type="range" id="mh-vel" min="1" max="127" value="' + velocity() + '" style="width:120px"> <span class="mh-mono" id="mh-velval">' + velocity() + '</span></label>' +
            '<button type="button" class="btn sm" id="mh-sus">Sustain (hold)</button>' +
            '<button type="button" class="btn sm" id="mh-alloff">All notes off</button>' +
          '</div>' +
          '<div class="mh-kb" id="mh-kb"></div>' +
          '<div class="muted small" style="margin-top:6px">Tap or drag the keys, or type: A–K white keys, W E T Y U black keys, Z / X octave, Space sustain. Everything goes out on channel <b id="mh-chlabel">' + (ch() + 1) + '</b>.</div>' +
        '</div>' +
        '<div class="card"><h2>Expression &amp; program</h2>' +
          '<div class="row" style="align-items:flex-start;gap:22px">' +
            '<div class="mh-vs"><div class="muted small">Pitch bend</div><input type="range" id="mh-pb" min="-8192" max="8191" value="0"><div class="mh-mono" id="mh-pbv">0</div></div>' +
            '<div class="mh-vs"><div class="muted small">Mod (CC1)</div><input type="range" id="mh-mod" min="0" max="127" value="0"><div class="mh-mono" id="mh-modv">0</div></div>' +
            '<div class="mh-vs"><div class="muted small">Pressure</div><input type="range" id="mh-at" min="0" max="127" value="0"><div class="mh-mono" id="mh-atv">0</div></div>' +
            '<div style="flex:1;min-width:240px"><h3>Bank &amp; program</h3>' +
              '<div class="row tight">' +
                '<label class="field">Bank MSB<input type="number" id="mh-msb" min="0" max="127" value="' + g('msb', p.bankMsb) + '"></label>' +
                '<label class="field">LSB<input type="number" id="mh-lsb" min="0" max="127" value="' + g('lsb', 0) + '"></label>' +
                '<label class="field">Program<input type="number" id="mh-prog" min="1" max="128" value="' + g('prog', 1) + '"></label>' +
                '<button type="button" class="btn sm primary" id="mh-sendprog">Send</button>' +
                '<button type="button" class="btn sm" id="mh-progprev">◀</button><button type="button" class="btn sm" id="mh-prognext">▶</button>' +
              '</div><div class="muted small" style="margin-top:6px" id="mh-bankhint">' + esc(p.bankHint) + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // CONTROLS
      '<div class="mh-view" data-view="controls" hidden>' +
        '<div class="card"><h2>Controllers (CC)</h2>' +
          '<div class="row tight" style="margin-bottom:10px">' +
            '<label class="field">Add CC<input type="number" id="mh-newcc" min="0" max="127" value="16"></label>' +
            '<input type="text" id="mh-newccname" placeholder="name (optional)" style="width:150px">' +
            '<button type="button" class="btn sm" id="mh-addcc">Add slider</button><button type="button" class="btn sm" id="mh-resetcc">Reset list</button>' +
            '<span class="muted small">Double-tap a slider to zero it. Hover one for the bytes it sends.</span>' +
          '</div>' +
          '<div class="mh-grid" id="mh-ccgrid"></div>' +
        '</div>' +
        '<div class="card"><h2>Switches</h2><div class="row tight" id="mh-switches"></div><div class="muted small">0 = off, 127 = on.</div></div>' +
        '<div class="card"><h2>Transport &amp; clock</h2>' +
          '<div class="row tight">' +
            '<button type="button" class="btn sm" id="mh-start">' + App.icon('play', 14) + ' Start</button><button type="button" class="btn sm" id="mh-cont">Continue</button><button type="button" class="btn sm" id="mh-stop">' + App.icon('stop', 14) + ' Stop</button>' +
            '<button type="button" class="btn sm" id="mh-clock"></button>' +
            '<span class="muted small">MIDI clock runs at the app tempo in the top bar (24 ticks per beat) — arpeggiators and sequencers on the device can follow it.</span>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // RULES
      '<div class="mh-view" data-view="rules" hidden>' +
        '<div class="card"><h2>Rules — reshape messages</h2>' +
          '<p class="muted small" style="margin:0 0 8px">Checked top to bottom. Each matching rule changes the message; <b>Block</b> drops it. <b>Learn</b> fills the match from the next thing you play or turn on the device.</p>' +
          '<div class="row tight" style="margin-bottom:8px">' +
            '<label class="mh-chk"><input type="checkbox" id="mh-rulesin"' + (g('rulesIn', false) ? ' checked' : '') + '> Apply to what soundLAB hears (every page)</label>' +
            '<label class="mh-chk"><input type="checkbox" id="mh-rulesapp"' + (g('rulesApp', false) ? ' checked' : '') + '> Apply to the Hub’s own keys &amp; sliders</label>' +
            '<span class="muted small">Thru (In → Out) always goes through the rules.</span>' +
          '</div>' +
          '<div class="row tight">' +
            '<button type="button" class="btn sm primary" id="mh-addrule">+ Add rule</button>' +
            '<button type="button" class="btn sm" data-preset="remap">Example: CC 74 → CC 1</button>' +
            '<button type="button" class="btn sm" data-preset="transpose">Example: transpose +12</button>' +
            '<button type="button" class="btn sm" data-preset="chan">Example: force channel 2</button>' +
            '<button type="button" class="btn sm" data-preset="block">Example: block aftertouch</button>' +
          '</div>' +
        '</div>' +
        '<div id="mh-rules"></div>' +
      '</div>' +

      // SYSEX
      '<div class="mh-view" data-view="sysex" hidden>' +
        '<div class="card"><h2>Device</h2><div class="row tight"><button type="button" class="btn sm" id="mh-idreq">Identity request</button><span class="mh-mono muted small" id="mh-idreply">no reply yet</span></div>' +
          '<div class="muted small" style="margin-top:6px">Sends F0 7E 7F 06 01 F7 — every modern device answers with its maker, model and firmware.</div></div>' +
        '<div class="card" id="mh-sxcard"></div>' +
        '<div class="card"><h2>Raw hex</h2><textarea id="mh-raw" placeholder="F0 … F7 or any MIDI bytes in hex (spaces optional)"></textarea>' +
          '<div class="row tight" style="margin-top:6px"><button type="button" class="btn sm primary" id="mh-rawsend">Send bytes</button><span class="mh-err small" id="mh-rawerr"></span></div></div>' +
        '<div class="card"><h2>Last received SysEx</h2><textarea id="mh-rx" readonly placeholder="nothing yet"></textarea>' +
          '<div class="row tight" style="margin-top:6px"><button type="button" class="btn sm" id="mh-rxcopy">Copy</button><button type="button" class="btn sm" id="mh-rxraw">Put in Raw hex</button><span class="muted small" id="mh-rxinfo"></span></div></div>' +
      '</div>' +

      // MONITOR
      '<div class="mh-view" data-view="monitor" hidden>' +
        '<div class="card"><h2>Monitor</h2>' +
          '<div class="row tight" style="margin-bottom:8px">' +
            '<label class="mh-chk"><input type="checkbox" id="mh-monin" checked> In</label><label class="mh-chk"><input type="checkbox" id="mh-monout" checked> Out</label>' +
            '<label class="mh-chk"><input type="checkbox" id="mh-monclock"> Clock</label><label class="mh-chk"><input type="checkbox" id="mh-monas"> Active sensing</label>' +
            '<label class="mh-chk"><input type="checkbox" id="mh-monhex"' + (g('hex', false) ? ' checked' : '') + '> Hex</label>' +
            '<label class="mh-chk"><input type="checkbox" id="mh-monpause"> Pause</label>' +
            '<button type="button" class="btn sm" id="mh-monclear">Clear</button><button type="button" class="btn sm" id="mh-monexport">Export log</button>' +
            '<span class="muted small" id="mh-moncount"></span>' +
          '</div><div class="mh-mon" id="mh-mon"></div>' +
        '</div>' +
      '</div>' +

      // LEARN
      '<div class="mh-view mh-learn" data-view="learn" hidden>' +
        '<div class="card"><h2>Quick start</h2><ol>' +
          '<li>Plug the device in over USB (or pair it over Bluetooth) and press <b>Connect MIDI</b> — allow the prompt, including SysEx.</li>' +
          '<li>Pick its port as <b>In</b> and <b>Out</b>. Many synths show one port per function; the one named after the device (often “-1” or “Port 1”) is the sound engine.</li>' +
          '<li>Open <b>Monitor</b>, play the device and turn its knobs: every message is decoded live. That is the fastest way to learn what anything sends.</li>' +
          '<li>Go to <b>Play</b> and send notes back. If nothing sounds, check the channel (the device listens on specific channels) and that Out is the right port.</li>' +
          '<li>Hearing two sounds per note on other pages? Your synth plays itself AND soundLAB plays its piano. Here the app voice is muted unless you tick <b>App voice</b>; for every page, turn off \u201cPlay soundLAB\u2019s voice\u201d in Settings \u203a MIDI keyboard.</li>' +
          '<li>Pick a <b>Device</b> profile for named knobs and ready-made SysEx builders; Generic works everywhere.</li>' +
        '</ol>' +
        '<h3>About this device</h3><ul id="mh-devnotes"></ul>' +
        '<h3>MIDI messages</h3><table class="mh-table">' +
          '<tr><th>Message</th><th>Bytes (hex)</th><th>Meaning</th></tr>' +
          '<tr><td>Note On</td><td class="mh-mono">9n nn vv</td><td>n = channel 0–F, nn = note (60 = middle C), vv = velocity 1–127; velocity 0 means note off</td></tr>' +
          '<tr><td>Note Off</td><td class="mh-mono">8n nn vv</td><td>release velocity vv</td></tr>' +
          '<tr><td>Control Change</td><td class="mh-mono">Bn cc vv</td><td>knobs, wheels, pedals, switches — cc = controller number</td></tr>' +
          '<tr><td>Program Change</td><td class="mh-mono">Cn pp</td><td>pp = program 0–127 (shown 1–128 on most gear)</td></tr>' +
          '<tr><td>Pitch Bend</td><td class="mh-mono">En ll hh</td><td>14-bit value, 2000h = centre</td></tr>' +
          '<tr><td>Channel / Poly Pressure</td><td class="mh-mono">Dn vv / An nn vv</td><td>aftertouch for the channel / per note</td></tr>' +
          '<tr><td>SysEx</td><td class="mh-mono">F0 … F7</td><td>maker-specific: deep parameters, dumps. Yamaha 43, Roland 41, Korg 42</td></tr>' +
          '<tr><td>Clock / Start / Stop</td><td class="mh-mono">F8 / FA / FC</td><td>24 clocks per quarter note</td></tr>' +
        '</table>' +
        '<h3>Useful controllers</h3><table class="mh-table">' +
          '<tr><th>CC</th><th>Name</th><th>CC</th><th>Name</th></tr>' +
          '<tr><td>0 / 32</td><td>Bank Select MSB / LSB</td><td>64</td><td>Sustain pedal (≥ 64 on)</td></tr>' +
          '<tr><td>1</td><td>Modulation wheel</td><td>71 / 74</td><td>Filter resonance / cutoff</td></tr>' +
          '<tr><td>7 / 11</td><td>Volume / Expression</td><td>72 / 73</td><td>Release / Attack</td></tr>' +
          '<tr><td>10</td><td>Pan</td><td>91 / 93</td><td>Reverb / Chorus send</td></tr>' +
          '<tr><td>120 / 123</td><td>All sound off / All notes off</td><td>121</td><td>Reset all controllers</td></tr>' +
        '</table>' +
        '<h3>Things to try</h3><ul>' +
          '<li>Rule <i>CC 74 → CC 1</i>: a knob on any controller drives the device’s mod destination.</li>' +
          '<li>Rule <i>Note, any channel → set channel 2, add 12</i>: layer a second part an octave up from one keyboard (Thru on).</li>' +
          '<li>Rule <i>Aftertouch → Block</i> with “Apply to what soundLAB hears” when a squishy keybed gets in the way of practice.</li>' +
          '<li>Monitor first, then build a rule with Learn from whatever the pedal or knob actually sends.</li>' +
        '</ul>' +
        '<div class="row tight" style="margin-top:10px"><label class="field">Note names<select id="mh-naming"><option value="0"' + (g('naming', 0) ? '' : ' selected') + '>General (C4 = 60)</option><option value="1"' + (g('naming', 0) ? ' selected' : '') + '>Yamaha (C3 = 60)</option></select></label>' +
          '<button type="button" class="btn sm" id="mh-export">Export Hub setup</button><button type="button" class="btn sm" id="mh-import">Import</button><input type="file" id="mh-importfile" accept="application/json" hidden>' +
          '<button type="button" class="btn sm danger" id="mh-reset">Reset Hub</button></div>' +
        '</div>' +
      '</div>' +
      '<div class="mh-toast" id="mh-toast" hidden></div>';

    var ids = ['connect', 'ports', 'in', 'out', 'ch', 'profile', 'thru', 'hear', 'panic', 'status', 'thruinfo', 'lightswarn', 'ledin', 'ledout', 'lastin', 'lastout',
      'octdn', 'octup', 'octlabel', 'vel', 'velval', 'sus', 'alloff', 'kb', 'chlabel', 'pb', 'pbv', 'mod', 'modv', 'at', 'atv', 'msb', 'lsb', 'prog', 'sendprog', 'progprev', 'prognext', 'bankhint',
      'newcc', 'newccname', 'addcc', 'resetcc', 'ccgrid', 'switches', 'start', 'cont', 'stop', 'clock',
      'rulesin', 'rulesapp', 'addrule', 'rules', 'idreq', 'idreply', 'sxcard', 'raw', 'rawsend', 'rawerr', 'rx', 'rxcopy', 'rxraw', 'rxinfo',
      'monin', 'monout', 'monclock', 'monas', 'monhex', 'monpause', 'monclear', 'monexport', 'moncount', 'mon', 'devnotes', 'naming', 'export', 'import', 'importfile', 'reset', 'toast', 'enable',
      'cvout', 'parts', 'hero', 'knobs', 'extra', 'cvprev', 'cvnext', 'cvpnum', 'cvbank', 'cvsend', 'cvreset'];
    ids.forEach(function (id) { els[id] = root.querySelector('#mh-' + id); });
    // friendlier aliases used above
    els.inSel = els['in']; els.outSel = els.out; els.ledIn = els.ledin; els.ledOut = els.ledout; els.lastIn = els.lastin; els.lastOut = els.lastout;
    els.lightsWarn = els.lightswarn; els.thruInfo = els.thruinfo; els.monIn = els.monin; els.monOut = els.monout; els.monClock = els.monclock; els.monAS = els.monas;
    els.monCount = els.moncount; els.clockBtn = els.clock; els.idReply = els.idreply; els.rxInfo = els.rxinfo; els.octLabel = els.octlabel;

    wire();
    buildKeyboard(); renderCcs(); renderSwitches(); renderRules(); renderSysex(); renderNotes(); renderControl(); paintClock(); paintPorts();
    view(g('view', 'control'));
  }

  function wire() {
    els.enable.addEventListener('click', function () {
      midi().enable().then(paintPorts).catch(function () { els.status.textContent = 'MIDI access was declined or failed.'; els.status.className = 'mh-status bad'; });
    });
    els.inSel.addEventListener('change', function () { midi().setInput(this.value); });
    els.outSel.addEventListener('change', function () { set('outId', this.value || 'shared'); paintPorts(); toast('Synth out: ' + (hubOutName() || 'none')); });
    els.ch.addEventListener('change', function () { pickPart(parseInt(this.value, 10)); });
    // control view
    wireKnobs(root.querySelector('.mh-cv'));
    els.parts.addEventListener('click', function (e) { var b = e.target.closest('[data-part]'); if (b) pickPart(+b.dataset.part); });
    els.cvprev.addEventListener('click', function () { sendProgram(progNum() - 1); });
    els.cvnext.addEventListener('click', function () { sendProgram(progNum() + 1); });
    els.cvsend.addEventListener('click', function () { allKnobs().forEach(function (k) { cc(k.cc, kv(k.cc)); }); toast('Sent ' + allKnobs().length + ' knobs on ' + partLabel() + ' ' + (ch() + 1)); });
    els.cvreset.addEventListener('click', function () { allKnobs().forEach(function (k) { setKv(k.cc, k.def); cc(k.cc, k.def); }); renderControl(); });
    els.profile.addEventListener('change', function () {
      set('profile', this.value); var p = profile();
      els.bankhint.textContent = p.bankHint; els.msb.value = p.bankMsb; set('msb', p.bankMsb);
      if (p.extraCcs) { var l = ccs() || DEFAULT_CCS.slice(); p.extraCcs.forEach(function (c) { if (!l.some(function (x) { return x.cc === c.cc; })) l.unshift({ cc: c.cc, name: c.name, val: 0 }); }); set('ccs', l); }
      renderCcs(); renderSysex(); renderNotes(); renderControl(); toast('Profile: ' + p.name);
    });
    els.thru.addEventListener('change', function () { set('thru', this.checked); paintPorts(); });
    els.hear.addEventListener('change', function () { set('hear', this.checked); applyMute(); paintPorts(); });
    els.panic.addEventListener('click', panic);

    // play
    els.octdn.addEventListener('click', function () { shiftOct(-1); });
    els.octup.addEventListener('click', function () { shiftOct(1); });
    els.vel.addEventListener('input', function () { set('vel', parseInt(this.value, 10)); els.velval.textContent = this.value; });
    els.sus.addEventListener('pointerdown', function () { setSustain(true); });
    els.sus.addEventListener('pointerup', function () { setSustain(false); });
    els.sus.addEventListener('pointerleave', function () { setSustain(false); });
    els.alloff.addEventListener('click', function () { releaseAll(); cc(123, 0); });
    var mouseNote = null, down = false;
    els.kb.addEventListener('pointerdown', function (e) { var n = e.target.dataset.note; if (!n) return; e.preventDefault(); down = true; mouseNote = +n; press(+n); });
    els.kb.addEventListener('pointermove', function (e) {
      if (!down) return; var el = document.elementFromPoint(e.clientX, e.clientY); var n = el && el.dataset && el.dataset.note ? +el.dataset.note : null;
      if (n !== mouseNote) { if (mouseNote !== null) release(mouseNote); mouseNote = n; if (n !== null) press(n); }
    });
    window.addEventListener('pointerup', function () { if (down) { down = false; if (mouseNote !== null) release(mouseNote); mouseNote = null; } });
    var slider = function (el, lab, fn, snap) {
      el.addEventListener('input', function () { lab.textContent = this.value; fn(parseInt(this.value, 10)); });
      if (snap !== undefined) el.addEventListener('pointerup', function () { el.value = snap; lab.textContent = snap; fn(snap); });
    };
    slider(els.pb, els.pbv, function (v) { var u = v + 8192; sendCh(14, u & 127, (u >> 7) & 127); }, 0);
    slider(els.mod, els.modv, function (v) { cc(1, v); });
    slider(els.at, els.atv, function (v) { sendCh(13, v); });
    var sendProg = function () {
      var msb = clamp(parseInt(els.msb.value, 10) || 0, 0, 127), lsb = clamp(parseInt(els.lsb.value, 10) || 0, 0, 127), pg = clamp(parseInt(els.prog.value, 10) || 1, 1, 128);
      set('msb', msb); set('lsb', lsb); set('prog', pg);
      cc(0, msb); cc(32, lsb); sendCh(12, pg - 1); paintProg(); toast('Bank ' + msb + '/' + lsb + ' · program ' + pg);
    };
    els.sendprog.addEventListener('click', sendProg);
    els.progprev.addEventListener('click', function () { els.prog.value = clamp((parseInt(els.prog.value, 10) || 1) - 1, 1, 128); sendProg(); });
    els.prognext.addEventListener('click', function () { els.prog.value = clamp((parseInt(els.prog.value, 10) || 1) + 1, 1, 128); sendProg(); });

    // controls
    els.addcc.addEventListener('click', function () {
      var n = clamp(parseInt(els.newcc.value, 10) || 0, 0, 127), l = ccs() || DEFAULT_CCS.map(function (c) { return { cc: c.cc, name: c.name, val: 0 }; });
      l.push({ cc: n, name: els.newccname.value || ccName(n) || ('CC ' + n), val: 0 }); els.newccname.value = ''; set('ccs', l); renderCcs();
    });
    els.resetcc.addEventListener('click', function () { set('ccs', null); renderCcs(); });
    els.start.addEventListener('click', function () { send([0xFA], 'raw'); });
    els.cont.addEventListener('click', function () { send([0xFB], 'raw'); });
    els.stop.addEventListener('click', function () { flushHub('MIDI Hub Stop'); send([0xFC], 'raw'); });
    els.clock.addEventListener('click', function () { setClock(!clockTimer); });

    // rules
    els.rulesin.addEventListener('change', function () { set('rulesIn', this.checked); installFilter(); });
    els.rulesapp.addEventListener('change', function () { set('rulesApp', this.checked); });
    els.addrule.addEventListener('click', function () { var l = rulesList(); l.push(newRule()); set('rules', l); renderRules(); });
    root.querySelectorAll('[data-preset]').forEach(function (b) {
      b.addEventListener('click', function () {
        var P = {
          remap: { name: 'CC 74 → CC 1', m: { type: 'cc', lo: 74, hi: 74 }, a: { num: 1 } },
          transpose: { name: 'Transpose +12', m: { type: 'note' }, a: { add: 12 } },
          chan: { name: 'Everything → channel 2', m: { type: 'any' }, a: { ch: 2 } },
          block: { name: 'Block aftertouch', m: { type: 'at' }, a: { block: true } }
        }[this.dataset.preset];
        var l = rulesList(); l.push(newRule(P)); set('rules', l); renderRules();
      });
    });

    // sysex
    els.idreq.addEventListener('click', function () { els.idReply.textContent = 'waiting…'; send([0xF0, 0x7E, 0x7F, 0x06, 0x01, 0xF7], 'raw'); });
    els.rawsend.addEventListener('click', function () {
      try {
        var b = parseHex(els.raw.value);
        if (!b.length) throw new Error('nothing to send');
        if (b[0] < 0x80) throw new Error('first byte must be a status byte (80–FF)');
        if (b[0] === 0xF0 && b[b.length - 1] !== 0xF7) throw new Error('SysEx must end with F7');
        els.rawerr.textContent = ''; send(b, 'raw'); toast('Sent ' + b.length + ' bytes');
      } catch (e) { els.rawerr.textContent = e.message; }
    });
    els.rxcopy.addEventListener('click', function () { if (navigator.clipboard) navigator.clipboard.writeText(els.rx.value); toast('Copied'); });
    els.rxraw.addEventListener('click', function () { els.raw.value = els.rx.value; });

    // monitor
    els.monhex.addEventListener('change', function () { set('hex', this.checked); });
    els.monpause.addEventListener('change', function () { monPaused = this.checked; });
    els.monclear.addEventListener('click', function () {
      // rows still waiting for the next frame go too (a Panic just before Clear)
      monQ = []; if (monRaf) { cancelAnimationFrame(monRaf); monRaf = 0; }
      els.mon.innerHTML = ''; monCount = 0; els.monCount.textContent = '';
    });
    els.monexport.addEventListener('click', function () {
      var txt = Array.prototype.map.call(els.mon.children, function (r) { return Array.prototype.map.call(r.children, function (c) { return c.textContent; }).join('\t'); }).join('\n');
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = 'midi-log.txt'; a.click();
    });

    // learn / housekeeping
    els.naming.addEventListener('change', function () { set('naming', parseInt(this.value, 10)); buildKeyboard(); });
    els.export.addEventListener('click', function () {
      var o = {}; ['ch', 'oct', 'vel', 'thru', 'rulesIn', 'rulesApp', 'profile', 'dev', 'model', 'ccs', 'rules', 'hex', 'naming', 'msb', 'lsb', 'prog'].forEach(function (k) { o[k] = g(k, null); });
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(o, null, 1)], { type: 'application/json' })); a.download = 'soundlab-midi-hub.json'; a.click();
    });
    els['import'].addEventListener('click', function () { els.importfile.click(); });
    els.importfile.addEventListener('change', function () {
      var f = this.files[0]; if (!f) return;
      f.text().then(function (t) { var o = JSON.parse(t); for (var k in o) if (o[k] !== null) set(k, o[k]); render(); installFilter(); toast('Hub setup imported'); })
        .catch(function () { toast('Not a Hub setup file'); });
    });
    els.reset.addEventListener('click', function () {
      ['ch', 'oct', 'vel', 'thru', 'rulesIn', 'rulesApp', 'profile', 'dev', 'model', 'ccs', 'rules', 'hex', 'naming', 'msb', 'lsb', 'prog', 'view'].forEach(function (k) { set(k, null); });
      setClock(false); render(); installFilter(); toast('Hub reset');
    });

    root.querySelector('#mh-views').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) view(b.dataset.view); });
  }

  function renderCcs() {
    var l = ccs() || DEFAULT_CCS.map(function (c) { return { cc: c.cc, name: c.name, val: 0 }; });
    els.ccgrid.innerHTML = '';
    l.forEach(function (c, i) {
      var el = document.createElement('div'); el.className = 'mh-ctl';
      el.title = 'Sends B' + ch().toString(16).toUpperCase() + ' ' + hex([c.cc]) + ' vv';
      el.innerHTML = '<div class="mh-ctl-top"><b>' + esc(c.name || ('CC ' + c.cc)) + '</b><span class="muted small">CC ' + c.cc + '</span><span class="mh-mono mh-val">' + (c.val || 0) + '</span><button type="button" class="btn sm" title="remove">' + App.icon('close', 12) + '</button></div>' +
        '<input type="range" min="0" max="127" value="' + (c.val || 0) + '">';
      var r = el.querySelector('input');
      r.addEventListener('input', function () { c.val = parseInt(r.value, 10); el.querySelector('.mh-val').textContent = c.val; cc(c.cc, c.val); set('ccs', l); });
      r.addEventListener('dblclick', function () { r.value = 0; r.dispatchEvent(new Event('input')); });
      el.querySelector('button').addEventListener('click', function () { l.splice(i, 1); set('ccs', l); renderCcs(); });
      els.ccgrid.appendChild(el);
    });
  }
  function renderSwitches() {
    els.switches.innerHTML = '';
    SWITCHES.forEach(function (s) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm' + (sw[s.cc] ? ' active' : ''); b.textContent = s.name + ' (CC' + s.cc + ')';
      b.addEventListener('click', function () { sw[s.cc] = !sw[s.cc]; b.classList.toggle('active', !!sw[s.cc]); cc(s.cc, sw[s.cc] ? 127 : 0); });
      els.switches.appendChild(b);
    });
  }

  function renderRules() {
    var list = rules(), host = els.rules; host.innerHTML = '';
    if (!list.length) { host.innerHTML = '<div class="card muted small">No rules yet. Add one, or load an example above.</div>'; return; }
    var chOpts = function (sel, any) { var h = '<option value="0">' + any + '</option>'; for (var k = 1; k <= 16; k++) h += '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + k + '</option>'; return h; };
    var TYPES = { any: 'Any', note: 'Note', cc: 'CC', pc: 'Program', pb: 'Pitch bend', at: 'Aftertouch' }, TO = { same: 'keep type', cc: '→ CC', note: '→ Note', pc: '→ Program' };
    list.forEach(function (r, i) {
      var el = document.createElement('div'); el.className = 'mh-rule card' + (r.on ? '' : ' off');
      var tOpts = '', toOpts = ''; for (var t in TYPES) tOpts += '<option value="' + t + '"' + (r.m.type === t ? ' selected' : '') + '>' + TYPES[t] + '</option>';
      for (var o in TO) toOpts += '<option value="' + o + '"' + (r.a.to === o ? ' selected' : '') + '>' + TO[o] + '</option>';
      el.innerHTML =
        '<div class="row tight"><label class="mh-chk"><input type="checkbox" data-k="on"' + (r.on ? ' checked' : '') + '> On</label>' +
          '<input type="text" data-k="name" placeholder="rule name" value="' + esc(r.name || '') + '" style="width:150px">' +
          '<button type="button" class="btn sm' + (learning === r || (learning && learning.id === r.id) ? ' active' : '') + '" data-act="learn">' + ((learning && learning.id === r.id) ? 'Listening… play something' : 'Learn') + '</button>' +
          '<span style="flex:1"></span><button type="button" class="btn sm" data-act="up"' + (i === 0 ? ' disabled' : '') + '>' + App.icon('up', 12) + '</button><button type="button" class="btn sm" data-act="down"' + (i === list.length - 1 ? ' disabled' : '') + '>' + App.icon('down', 12) + '</button><button type="button" class="btn sm" data-act="del">' + App.icon('close', 12) + '</button></div>' +
        '<div class="row tight"><b class="mh-w">When</b><label class="field">type<select data-k="m.type">' + tOpts + '</select></label><label class="field">channel<select data-k="m.ch">' + chOpts(r.m.ch, 'any') + '</select></label>' +
          '<label class="field">number<input type="number" data-k="m.lo" min="0" max="127" value="' + r.m.lo + '"></label><label class="field">to<input type="number" data-k="m.hi" min="0" max="127" value="' + r.m.hi + '"></label></div>' +
        '<div class="row tight"><b class="mh-w">Do</b><label class="mh-chk"><input type="checkbox" data-k="a.block"' + (r.a.block ? ' checked' : '') + '> Block</label>' +
          '<label class="field">convert<select data-k="a.to">' + toOpts + '</select></label><label class="field">channel<select data-k="a.ch">' + chOpts(r.a.ch, 'keep') + '</select></label>' +
          '<label class="field">number<input type="number" data-k="a.num" min="0" max="127" placeholder="keep" value="' + (r.a.num === '' || r.a.num == null ? '' : r.a.num) + '"></label>' +
          '<label class="field">add<input type="number" data-k="a.add" min="-127" max="127" value="' + (r.a.add || 0) + '"></label>' +
          '<label class="field">value %<input type="number" data-k="a.scale" min="0" max="400" value="' + (r.a.scale == null ? 100 : r.a.scale) + '"></label></div>';
      el.addEventListener('change', function (ev) {
        var k = ev.target.dataset.k; if (!k) return;
        var v = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value, path = k.split('.'), o = r;
        for (var j = 0; j < path.length - 1; j++) o = o[path[j]];
        var leaf = path[path.length - 1];
        if (leaf === 'num') o[leaf] = v === '' ? '' : parseInt(v, 10);
        else if (['ch', 'lo', 'hi', 'add', 'scale'].indexOf(leaf) !== -1) o[leaf] = parseInt(v, 10) || 0;
        else o[leaf] = v;
        if (r.m.lo > r.m.hi) r.m.hi = r.m.lo;
        set('rules', list); el.classList.toggle('off', !r.on);
      });
      el.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-act]'); if (!b) return;
        var act = b.dataset.act;
        if (act === 'del') list.splice(i, 1);
        else if (act === 'up') { var tmp = list[i - 1]; list[i - 1] = list[i]; list[i] = tmp; }
        else if (act === 'down') { var tm2 = list[i + 1]; list[i + 1] = list[i]; list[i] = tm2; }
        else if (act === 'learn') { learning = (learning && learning.id === r.id) ? null : r; if (learning && !(midi() && midi().ready)) toast('Connect MIDI and pick an In port first'); }
        set('rules', list); renderRules();
      });
      host.appendChild(el);
    });
  }

  // ---- SysEx builders (profile-driven) ----
  function renderSysex() {
    var p = profile(), sx = p.sysex, card = els.sxcard;
    if (!sx) {
      card.innerHTML = '<h2>Parameter change / bulk request</h2><div class="muted small">The Generic profile has no SysEx template — pick a device profile, or send any message from Raw hex below using the format in your device’s MIDI implementation chart.</div>';
      return;
    }
    var addrFields = function (pref) { var h = ''; for (var i = 0; i < sx.addrLen; i++) h += '<input type="text" class="mh-mono mh-hexin" id="mh-' + pref + 'a' + i + '" value="00" maxlength="2">'; return h; };
    card.innerHTML =
      '<h2>' + esc(p.name) + ' SysEx</h2>' +
      '<div class="row tight"><label class="field">Device no.<input type="number" id="mh-sxdev" min="0" max="' + sx.devMax + '" value="' + clamp(parseInt(g('dev', 0), 10) || 0, 0, sx.devMax) + '"></label>' +
        '<label class="field">Model ID (hex)<input type="text" class="mh-mono" id="mh-sxmodel" value="' + esc(g('model', hex(sx.model))) + '" style="width:120px"></label></div>' +
      '<h3>Parameter change</h3>' +
      '<div class="row tight"><label class="field">Address<span class="row tight">' + addrFields('pc') + '</span></label><label class="field">Data (hex)<input type="text" class="mh-mono" id="mh-pcd" value="00" style="width:130px"></label><button type="button" class="btn sm primary" id="mh-pcsend">Send</button></div>' +
      '<div class="mh-mono muted small" id="mh-pcprev" style="margin-top:6px"></div><div class="muted small">' + esc(sx.paramHint) + '</div>' +
      '<h3>Bulk / dump request</h3>' +
      '<div class="row tight"><label class="field">Address<span class="row tight">' + addrFields('bd') + '</span></label>' +
        (sx.hasSize ? '<label class="field">Size (hex)<input type="text" class="mh-mono" id="mh-bdsize" value="00 00 00 01" style="width:110px"></label>' : '') +
        '<button type="button" class="btn sm" id="mh-bdsend">Request</button></div>' +
      '<div class="mh-mono muted small" id="mh-bdprev" style="margin-top:6px"></div><div class="muted small">' + esc(sx.bulkHint) + '</div>';
    card.querySelector('#mh-sxdev').addEventListener('change', function () { set('dev', clamp(parseInt(this.value, 10) || 0, 0, sx.devMax)); updatePreviews(); });
    card.querySelector('#mh-sxmodel').addEventListener('change', function () { try { var m = parseHex(this.value); set('model', hex(m)); } catch (e) { } this.value = g('model', hex(sx.model)); updatePreviews(); });
    card.querySelectorAll('input').forEach(function (i) { i.addEventListener('input', updatePreviews); });
    card.querySelector('#mh-pcsend').addEventListener('click', function () { var b = sxBytes('pc'); if (!b) return toast('Invalid hex'); send(b, 'raw'); toast('Sent ' + b.length + ' bytes'); });
    card.querySelector('#mh-bdsend').addEventListener('click', function () { var b = sxBytes('bd'); if (!b) return toast('Invalid hex'); send(b, 'raw'); toast('Requested'); });
    updatePreviews();
  }
  function sxBytes(which) {
    var sx = profile().sysex; if (!sx) return null;
    try {
      var o = { dev: clamp(parseInt(g('dev', 0), 10) || 0, 0, sx.devMax), model: parseHex(g('model', hex(sx.model))), addr: [], data: [], size: [] };
      for (var i = 0; i < sx.addrLen; i++) { var a = parseHex(els.sxcard.querySelector('#mh-' + which + 'a' + i).value); if (a.length !== 1) return null; o.addr.push(a[0] & 0x7F); }
      if (which === 'pc') { o.data = parseHex(els.sxcard.querySelector('#mh-pcd').value); if (!o.data.length) return null; return sx.paramChange(o); }
      if (sx.hasSize) { o.size = parseHex(els.sxcard.querySelector('#mh-bdsize').value); if (o.size.length !== sx.addrLen) return null; }
      return sx.bulkRequest(o);
    } catch (e) { return null; }
  }
  function updatePreviews() {
    if (!els.sxcard || !profile().sysex) return;
    var p = sxBytes('pc'), b = sxBytes('bd'), pp = els.sxcard.querySelector('#mh-pcprev'), bp = els.sxcard.querySelector('#mh-bdprev');
    if (pp) pp.textContent = p ? 'Will send: ' + hex(p) : '(invalid hex)';
    if (bp) bp.textContent = b ? 'Will send: ' + hex(b) : '(invalid hex)';
  }
  function renderNotes() {
    els.devnotes.innerHTML = profile().notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('');
  }

  // ---- module ----
  function init(el) {
    root = el;
    App.injectCSS('midihub',
      '.mh-top h2 .small{font-weight:400;margin-left:8px;letter-spacing:0}' +
      '.mh-status{font-size:12.5px}.mh-status.ok{color:var(--green)}.mh-status.bad{color:var(--red)}' +
      '.mh-warn{color:var(--red);margin-top:6px}' +
      '.mh-chk{display:inline-flex;gap:6px;align-items:center;font-size:12.5px;color:var(--muted)}' +
      '.mh-act{margin-top:6px;color:var(--muted)}.mh-act>span{display:inline-flex;align-items:center;gap:4px}' +
      '.mh-led{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--line);transition:background .08s}.mh-led.in.lit{background:var(--accent)}.mh-led.out.lit{background:var(--green)}' +
      '.mh-mono{font-family:ui-monospace,Consolas,Menlo,monospace;font-size:12px;color:var(--text)}' +
      '.mh-seg{margin:0 0 12px;flex-wrap:wrap}' +
      '.mh-kb{position:relative;height:150px;user-select:none;touch-action:none}' +
      '.mh-wk{position:absolute;top:0;bottom:0;background:#f4f1ea;border:1px solid #8a8378;border-radius:0 0 5px 5px;color:#5a5248;font-size:10px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:4px;cursor:pointer}' +
      '.mh-bk{position:absolute;top:0;height:60%;background:#1b1719;border:1px solid #000;border-radius:0 0 4px 4px;z-index:2;cursor:pointer}' +
      '.mh-wk.on{background:var(--accent)}.mh-bk.on{background:var(--accent-dim)}' +
      '.mh-vs{text-align:center}.mh-vs input[type=range]{writing-mode:vertical-lr;direction:rtl;height:120px;width:30px}' +
      '.mh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}' +
      '.mh-ctl{background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:8px 10px}.mh-ctl-top{display:flex;gap:8px;align-items:center;font-size:12.5px}.mh-ctl-top b{flex:1}.mh-ctl input[type=range]{width:100%}' +
      '.mh-val{min-width:26px;text-align:right}' +
      '.mh-rule{padding:10px 14px;margin-bottom:8px}.mh-rule.off{opacity:.55}.mh-rule .row{margin-bottom:6px}.mh-rule .row:last-child{margin-bottom:0}.mh-w{width:44px}' +
      '.mh-rule input[type=number],.mh-sxcard input[type=number]{width:68px}' +
      '.mh-hexin{width:40px;text-align:center}' +
      '#mh-raw,#mh-rx{width:100%;min-height:64px;font-family:ui-monospace,Consolas,Menlo,monospace;font-size:12px;background:var(--card2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px}' +
      '.mh-err{color:var(--red)}' +
      '.mh-mon{height:420px;overflow:auto;background:var(--card2);border:1px solid var(--line);border-radius:8px;font-family:ui-monospace,Consolas,Menlo,monospace;font-size:12px}' +
      '.mh-r{display:grid;grid-template-columns:64px 34px 34px 1fr 1fr;gap:8px;padding:2px 8px;border-bottom:1px solid var(--line-soft)}.mh-r.in .mh-dir{color:var(--accent)}.mh-r.out .mh-dir{color:var(--green)}.mh-t,.mh-hex{color:var(--muted)}' +
      '.mh-learn ol,.mh-learn ul{padding-left:20px;line-height:1.5}.mh-learn h3{margin-top:16px}' +
      '.mh-table{border-collapse:collapse;width:100%;font-size:13px}.mh-table td,.mh-table th{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}.mh-table th{background:var(--card2)}' +
      '.mh-toast{position:fixed;left:50%;bottom:76px;transform:translateX(-50%);background:var(--card);border:1px solid var(--accent);padding:8px 14px;border-radius:9px;z-index:50;font-size:13px}' +
      '.mh-cv-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.mh-cv-head h2{margin:0}' +
      '.mh-parts{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:12px 0}.mh-plab{font-size:12.5px;color:var(--muted);font-weight:600;margin-right:4px}' +
      '.mh-parts button{min-width:40px;height:38px;border-radius:9px;border:1px solid var(--line);background:var(--card2);color:var(--text);font-weight:600;cursor:pointer}' +
      '.mh-parts button.active{background:var(--accent);color:#1c1206;border-color:var(--accent)}' +
      '.mh-hero{display:flex;justify-content:center;margin:4px 0 8px}' +
      '.mh-knobs{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:12px}' +
      '.mh-knob{display:grid;justify-items:center;gap:2px;padding:10px 6px 8px;border-radius:12px;background:var(--card2);border:1px solid var(--line);cursor:ns-resize;touch-action:none;user-select:none;outline:none}' +
      '.mh-knob:focus-visible{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-glow)}' +
      '.mh-knob svg{width:72px;height:72px}.mh-knob.hero svg{width:132px;height:132px}.mh-knob.hero{padding:14px 28px 12px}' +
      '.mh-ktrack{fill:none;stroke:var(--line);stroke-width:6;stroke-linecap:round}.mh-karc{fill:none;stroke:var(--accent);stroke-width:6;stroke-linecap:round}' +
      '.mh-kptr{stroke:var(--text);stroke-width:4;stroke-linecap:round}' +
      '.mh-kv{font:400 26px/1 var(--font-display);font-variant-numeric:tabular-nums}.mh-knob.hero .mh-kv{font-size:40px}.mh-kn{font-size:13px;font-weight:600}.mh-knob small{font-size:11px}' +
      '.mh-cv h3{margin:16px 0 8px}' +
      '.mh-cv-prog{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin-top:16px}.mh-cv-prog .btn{min-height:52px;font-size:16px}' +
      '.mh-cv-pnum{display:grid;justify-items:center;gap:2px;min-width:110px}.mh-cv-pnum b{font:400 44px/1 var(--font-display)}' +
      '.mh-cv-acts{justify-content:center;margin-top:12px}' +
      '@media (max-width:700px){.mh-r{grid-template-columns:56px 30px 30px 1fr}.mh-hex{display:none}.mh-knobs{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.mh-knob svg{width:60px;height:60px}.mh-knob.hero svg{width:110px;height:110px}.mh-parts button{min-width:34px;height:36px}}'
    );
    t0 = performance.now();
    render();
    installFilter();
    App.on('midi:raw', onRaw);
    App.on('midi:out', function (d) { if (d && d.bytes) logMsg('out', d.bytes); });
    App.on('midi:state', function () { flushHub('MIDI inventory changed'); paintPorts(); });
    App.on('midi:beforeoutput', function () { flushHub('Selected MIDI output changing'); });
    scaleBoundary();
    ['scale:lock', 'scale:boundary', 'fb:set', 'fb:scale'].forEach(function (name) { App.on(name, scaleBoundary); });
    App.on('tempo', paintClock);
    App.on('lights', paintPorts);
    document.addEventListener('keyup', function (e) {
      if (App.active !== 'midihub') return;
      if (e.code in KB_KEYS) release(base() + KB_KEYS[e.code]);
      else if (e.code === 'Space') setSustain(false);
    });
    window.addEventListener('blur', function () { releaseAll(); flushHub('Window lost focus'); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) { releaseAll(); flushHub('App hidden'); } });
    window.addEventListener('pagehide', function () { releaseAll(); flushHub('Page closed'); });
  }

  App.register('midihub', {
    init: init,
    onShow: function () { applyMute(); paintPorts(); paintClock(); if (midi() && midi().supported && !midi().ready && App.store.get('midi.wanted', false)) midi().enable().then(paintPorts).catch(function () { }); },
    onHide: function () { releaseAll(); if (sustain) setSustain(false); flushHub('MIDI Hub left'); if (midi() && midi().mute) midi().mute('midihub', false); },
    onKey: function (e) {
      if (e.repeat) return;
      if (e.code in KB_KEYS) { press(base() + KB_KEYS[e.code]); e.preventDefault(); }
      else if (e.code === 'KeyZ') shiftOct(-1);
      else if (e.code === 'KeyX') shiftOct(1);
      else if (e.code === 'Space') { setSustain(true); e.preventDefault(); }
    }
  });

  // test / plugin hook
  window.SLMidiHub = { decode: decode, applyRules: applyRules, PROFILES: PROFILES, parseHex: parseHex, hex: hex, get rules() { return rules(); }, get outId() { return hubOutId(); }, knob: function (cc) { return kv(cc); }, turn: turn };
})();
