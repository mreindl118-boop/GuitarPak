/* Scale-locked synth practice route. Uses the shared scale predicate and exact
 * MIDI subscriptions; never remaps a note or changes the app's port choices.
 * The sent-note ledger follows the cleanup pattern stranded in b8ccb55's Hub,
 * adapted to current independent ports, shared keybed leases and MPE channels.
 */
(function () {
  'use strict';
  var active = false, input = null, output = null, unsubscribe = null, lease = null;
  var physical = {}, voices = {}, used = {}, pedals = {}, expression = {};
  var recent = [], sending = false, stopping = false, burstAt = 0, burst = 0;
  // Additive Web MIDI subscriptions receive byte chunks, not necessarily one
  // complete message. Keep only a status and at most two pending data bytes.
  var decode = { status: 0, running: 0, data: [], sysex: false };
  var reason = 'Synth sound route OFF.', cleanupFailed = false, blocked = 0, forwarded = 0, scaleKey = '';
  var SYNTH = /modx|montage|motif|yamaha|roland|korg|nord|kronos|fantom|juno|jupiter|moog|sequential|prophet|arturia|novation|waldorf|elektron|kawai|casio|synth/i;
  var EXCLUDE = /lumi|roli|helix|stadium|virtual|loopback|loopmidi|through|thru|midi mapper|microsoft|wavetable/i;
  function midi() { return App.midi || {}; }
  function now() { return performance.now(); }
  function validPort(type, p) {
    return (type === 'inputs' || type === 'outputs') && !!p && typeof p.id === 'string' && !!p.id &&
      p.state !== 'disconnected' && SYNTH.test(p.name || '') && !EXCLUDE.test(p.name || '');
  }
  function find(type, id) {
    return (midi()[type] || []).filter(function (p) { return p.id === id && validPort(type, p); })[0] || null;
  }
  function unchanged(type, saved) {
    var current = saved && find(type, saved.id);
    return !!current && current.name === saved.name;
  }
  function selectedScale() { return JSON.stringify([App.store.get('fb.root', 9), App.store.get('fb.scale', 'minorPent'), !!(App.scaleLock && App.scaleLock.on)]); }
  function allows(note) {
    return Number.isInteger(note) && note >= 0 && note <= 127 && !!(App.scaleLock &&
      typeof App.scaleLock.contains === 'function' && (!App.scaleLock.on || App.scaleLock.contains(note)));
  }
  function snapshot() {
    return { active: active, inputId: input ? input.id : '', outputId: output ? output.id : '',
      held: Object.keys(voices).length, blocked: blocked, forwarded: forwarded,
      reason: reason, cleanupFailed: cleanupFailed };
  }
  function announce() { App.emit('practice:route', snapshot()); }
  function send(bytes) {
    if (!unchanged('outputs', output)) return false;
    // Install the fingerprint before send: MIDI doubles can echo synchronously.
    // Matching async echoes are consumed once within 40 ms; held-note and
    // controller-state guards also stop duplicates beyond that short window.
    recent = recent.filter(function (r) { return r.until > now(); });
    recent.push({ key: bytes.join(','), until: now() + 40 });
    if (recent.length > 256) recent.shift();
    sending = true;
    try { return !!lease && typeof lease.send === 'function' && lease.send(bytes) === true; }
    catch (e) { return false; }
    finally { sending = false; }
  }
  function echo(bytes) {
    var t = now(), key = bytes.join(',');
    recent = recent.filter(function (r) { return r.until > t; });
    for (var i = 0; i < recent.length; i++) {
      if (recent[i].key === key) { recent.splice(i, 1); return true; }
    }
    return false;
  }
  function flush() {
    var ok = true;
    Object.keys(voices).forEach(function (key) {
      var n = voices[key];
      delete voices[key];
      if (!send([0x80 | n.channel, n.note, 0])) ok = false;
    });
    // Reset sustain only on channels used by this route, on its original output.
    Object.keys(used).forEach(function (channel) { if (!send([0xB0 | +channel, 64, 0])) ok = false; });
    physical = {}; voices = {}; used = {}; pedals = {}; expression = {};
    return ok;
  }
  function stop(message) {
    if (stopping) return false;
    stopping = true;
    decode = { status: 0, running: 0, data: [], sysex: false };
    if (unsubscribe) { try { unsubscribe(); } catch (e) {} unsubscribe = null; }
    // Remain active during cleanup so legacy Hub Thru cannot echo cleanup back.
    var clean = flush();
    active = false;
    if (midi().mute) midi().mute('practice-router', false);
    if (lease) { try { if (lease({ restore: false }) === false) clean = false; } catch (e) { clean = false; } lease = null; }
    cleanupFailed = cleanupFailed || !clean;
    reason = message || 'Synth sound route stopped.';
    if (cleanupFailed) reason += ' Original-output cleanup could not be confirmed; release notes/pedal on the synth.';
    input = null; output = null; recent = []; stopping = false;
    announce();
    return clean;
  }
  function receive(message) {
    if (!active || stopping || sending || !message || !input || message.portId !== input.id) return;
    if (!unchanged('inputs', input) || !unchanged('outputs', output)) { stop('Selected synth port changed. Start again.'); return; }
    if (selectedScale() !== scaleKey) { stop('Selected scale or lock changed. Start again.'); return; }
    var bytes = message.bytes;
    if (!bytes || !Number.isInteger(bytes.length) || bytes.length < 0) return;
    if (bytes.length > 16384) { stop('Excessive MIDI input or feedback loop detected. Disable external MIDI Thru and start again.'); return; }
    for (var i = 0; i < bytes.length && active && !stopping; i++) {
      var value = bytes[i];
      if (!Number.isInteger(value) || value < 0 || value > 255) {
        decode = { status: 0, running: 0, data: [], sysex: false }; continue;
      }
      if (value >= 0xF8) continue; // realtime may interrupt any message
      if (decode.sysex) {
        if (value === 0xF7) { decode.sysex = false; continue; }
        if (value < 0x80) continue;
        decode.sysex = false; // malformed SysEx: resync at a new status
      }
      if (value >= 0x80) {
        decode.data = [];
        if (value >= 0xF0) {
          decode.status = decode.running = 0;
          decode.sysex = value === 0xF0;
        } else decode.status = decode.running = value;
        continue;
      }
      if (!decode.status) decode.status = decode.running;
      if (!decode.status) continue;
      decode.data.push(value);
      var length = (decode.status & 0xF0) === 0xC0 || (decode.status & 0xF0) === 0xD0 ? 2 : 3;
      if (decode.data.length === length - 1) {
        var complete = [decode.status].concat(decode.data);
        decode.data = []; decode.status = decode.running;
        // a learned remote gesture (a key or the sustain pedal bound in
        // Settings › Hands-free control) only advances: never routed to the synth
        if (App.remote && App.remote.owns && App.remote.owns(complete, { port: input.name || '' })) continue;
        routeMessage(complete);
      }
    }
  }
  function routeMessage(b) {
    var type = b[0] & 0xF0, channel = b[0] & 15, key = channel + ':' + b[1];
    if (now() - burstAt >= 1000) { burstAt = now(); burst = 0; }
    if (++burst > 1000) { stop('Excessive MIDI input or feedback loop detected. Disable external MIDI Thru and start again.'); return; }
    var noteOn = type === 0x90 && b[2] > 0;
    var noteOff = type === 0x80 || (type === 0x90 && b[2] === 0);
    // A new press/release pair can repeat identical bytes faster than an echo
    // guard expires. The physical/voice ledger governs notes, never a stale
    // byte fingerprint: otherwise a rapid retrigger can lose its Note Off.
    if (sending || (!noteOn && !(noteOff && voices[key]) && echo(b))) return;
    if (type === 0x90 && b[2] > 0) {
      if (physical[key]) return;
      physical[key] = true;
      if (!allows(b[1])) { blocked++; announce(); return; }
      used[channel] = true;
      voices[key] = { channel: channel, note: b[1] }; // retain even on an uncertain send failure
      if (!send(b)) { stop('Synth note send failed. Route disarmed.'); return; }
      forwarded++;
    } else if (type === 0x80 || (type === 0x90 && b[2] === 0)) {
      delete physical[key];
      if (!voices[key]) return; // never let an unsent/blocked note release another voice
      delete voices[key];
      if (!send(b)) { voices[key] = { channel: channel, note: b[1] }; stop('Synth note-off failed. Route disarmed.'); return; }
    } else if (type === 0xB0 && b[1] === 64) {
      if (pedals[channel] === b[2]) return;
      pedals[channel] = b[2]; used[channel] = true;
      if (!send(b)) { stop('Synth sustain send failed. Route disarmed.'); return; }
    } else if (type === 0xA0 || type === 0xD0) {
      if (type === 0xA0 && !voices[key]) return;
      if (type === 0xD0 && !Object.keys(voices).some(function (k) { return voices[k].channel === channel; })) return;
      var expressionKey = type + ':' + channel + (type === 0xA0 ? ':' + b[1] : '');
      if (expression[expressionKey] === b.join(',')) return;
      expression[expressionKey] = b.join(',');
      if (!send(b)) { stop('Synth pressure send failed. Route disarmed.'); return; }
    } else return; // no pitch bend, other CCs, programs, SysEx or realtime
    announce();
  }
  function start(options) {
    stop('Preparing scale-locked synth sound.');
    var o = options || {}, m = midi();
    if (o.localControlOff !== true) { reason = 'Confirm synth Local Control OFF and external MIDI Thru disabled before starting.'; announce(); return false; }
    if (App.store.get('midihub.thru', false) === true) {
      reason = 'Turn MIDI Hub Thru off and release all keys/pedal before starting this route.'; announce(); return false;
    }
    if (m.explicitPortsSupported !== true || typeof m.subscribeInput !== 'function' ||
        typeof m.sendToOutput !== 'function' || typeof m.leaseKeybedOutput !== 'function' ||
        !App.scaleLock || typeof App.scaleLock.contains !== 'function') {
      reason = 'Independent Web MIDI and the shared scale predicate are required.'; announce(); return false;
    }
    var chosenInput = find('inputs', o.inputId), chosenOutput = find('outputs', o.outputId);
    if (!chosenInput || !chosenOutput || (o.displayOutputId && o.displayOutputId === o.outputId)) {
      reason = 'Choose explicit synth input and sound output, separate from the LUMI display; virtual/mixed ports are excluded.'; announce(); return false;
    }
    if (m.outputId === chosenOutput.id && m.lightsOn) {
      reason = 'Select the LUMI as the shared key-light output, or turn shared key lights off, before routing sound to this synth.'; announce(); return false;
    }
    input = { id: chosenInput.id, name: chosenInput.name }; output = { id: chosenOutput.id, name: chosenOutput.name };
    try { lease = m.leaseKeybedOutput(output.id, 'practice-router'); } catch (e) { lease = null; }
    if (typeof lease !== 'function' || typeof lease.send !== 'function') {
      if (typeof lease === 'function') { try { lease({ restore: false }); } catch (e) {} }
      lease = null; input = null; output = null; reason = 'Synth output is busy or pinned output ownership is unavailable.'; announce(); return false;
    }
    active = true; scaleKey = selectedScale(); blocked = 0; forwarded = 0; cleanupFailed = false; burstAt = now(); burst = 0;
    if (m.mute) m.mute('practice-router', true);
    try { unsubscribe = m.subscribeInput(input.id, receive); } catch (e) { unsubscribe = null; }
    if (typeof unsubscribe !== 'function') { unsubscribe = null; stop('Could not subscribe to the selected synth input.'); return false; }
    reason = App.scaleLock.on ? 'Synth sound ON with Scale lock. Out-of-scale note-ons are blocked; allowed notes keep their pitches and channels.' :
      'Synth sound ON. Scale lock is off; original pitches and channels pass unchanged.';
    announce(); return true;
  }
  App.practiceRouter = { start: start, stop: stop, allows: allows, validPort: validPort,
    get active() { return active; }, get state() { return snapshot(); } };
  ['fb:set', 'fb:scale', 'scale:lock', 'scale:boundary'].forEach(function (name) {
    App.on(name, function () { if (active && selectedScale() !== scaleKey) stop('Selected scale or lock changed. Start again.'); });
  });
  App.on('midi:state', function () { if (active) stop('MIDI routing or connection changed. Start again.'); });
  window.addEventListener('blur', function () { if (active) stop('Window lost focus. Synth route stopped.'); });
  window.addEventListener('pagehide', function () { if (active) stop('Page closed. Synth route stopped.'); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && active) stop('App hidden. Synth route stopped.'); });
})();
