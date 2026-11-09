/* LUMI practice: isolated answer input + opt-in, transient display output.
 * Recovered from b8ccb55 (origin/codex/midi-hub-release-0.78.0-20261019).
 * No global MIDI selection, Thru, SysEx, or note event bus. A temporary
 * exact-output keybed lease renders target/correct/wrong instructional frames.
 * Registers 'lumipractice'; all state is intentionally session-only.
 */
(function () {
  'use strict';
  var root, els = {}, visible = false, running = false, mode = 'simulated';
  var inputId = '', outputId = '', low = 48, channel = 0, kind = 'note', flow = 'guided';
  var synthOutputId = '', localControlOff = false;
  var advanceTimer = null, feedback = 'waiting', feedbackText = 'Waiting for an answer.';
  var held = {}, target = [], serial = 0, correct = 0, attempts = 0, answered = false;
  var unsubscribe = null, armed = false, tested = null, pending = [], outputTimer = null;
  var answerDecoder = null, answerGeneration = 0, attachedInputId = '', attachedFingerprint = '';
  var outputLease = null, leasedOutputId = '';
  var status = 'Ready for simulated practice. Device output is OFF.';
  var result = 'Start a session, then play or select the target notes and check your answer.';
  var outputStatus = 'OFF — no device messages sent by this page.';
  var mockStatus = 'Simulated display idle. No device ports are used.';
  var NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

  function midi() { return App.midi || {}; }
  function supportsPorts() {
    var m = midi();
    return m.explicitPortsSupported === true && typeof m.subscribeInput === 'function' && typeof m.sendToOutput === 'function' && typeof m.leaseKeybedOutput === 'function';
  }
  function correctRole(type, p) {
    if (!p || p.state === 'disconnected' || typeof p.id !== 'string' || !p.id) return false;
    var name = p.name || '';
    if (/virtual|loopback|loopmidi|through|thru|midi mapper/i.test(name)) return false;
    if (type === 'inputs') {
      if (/lumi/i.test(name)) return !/modx|montage|helix|stadium|seaboard|lightpad/i.test(name);
      return !!((App.practiceRouter && App.practiceRouter.validPort('inputs', p)) || (/modx/i.test(name) && !/roli|helix|stadium|seaboard|lightpad/i.test(name)));
    }
    return /lumi/i.test(name) && !/modx|montage|helix|stadium|seaboard|lightpad/i.test(name);
  }
  function ports(type) {
    try { return (midi()[type] || []).filter(function (p) { return correctRole(type, p); }); }
    catch (e) { return []; }
  }
  function hasPort(type, id) { return !!id && ports(type).some(function (p) { return p.id === id; }); }
  function noteName(n) { return NAMES[n % 12] + (Math.floor(n / 12) - 1); }
  function names(notes) { return notes.map(function (n) { return noteName(n) + ' (' + n + ')'; }).join(', '); }
  function distinct(notes) {
    return notes.filter(function (n, i, a) { return a.indexOf(n) === i; }).sort(function (a, b) { return a - b; });
  }
  function answerNotes() { return distinct(Object.keys(held).map(function (k) { return held[k]; })); }
  function compareNotes(wanted, actual) {
    wanted = distinct(wanted); actual = distinct(actual);
    return { correct: wanted.length > 0 && wanted.join(',') === actual.join(','),
      missing: wanted.filter(function (n) { return actual.indexOf(n) < 0; }),
      extra: actual.filter(function (n) { return wanted.indexOf(n) < 0; }) };
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function text(id, value) { if (els[id]) els[id].textContent = value; }
  // The service owns every frame note and its original output object.
  // A page never encodes colors or routes cleanup to a replacement port.
  function releaseOutput() {
    clearTimeout(outputTimer); outputTimer = null;
    pending = [];
    try { return !outputLease || outputLease.clear() !== false; }
    catch (e) { return false; }
  }
  function cancelAdvance() { clearTimeout(advanceTimer); advanceTimer = null; }
  function releaseLease() {
    var release = outputLease;
    outputLease = null; leasedOutputId = '';
    if (release) { try { return release() !== false; } catch (e) { return false; } }
    return true;
  }
  function acquireLease() {
    if (outputLease && leasedOutputId === outputId) return true;
    releaseLease();
    try { outputLease = midi().leaseKeybedOutput(outputId, 'lumipractice'); }
    catch (e) { outputLease = null; }
    if (typeof outputLease !== 'function' || typeof outputLease.frame !== 'function' || typeof outputLease.clear !== 'function') {
      if (typeof outputLease === 'function') outputLease();
      outputLease = null; return false;
    }
    leasedOutputId = outputId;
    return true;
  }
  function detachInput() {
    answerGeneration++; answerDecoder = null; attachedInputId = ''; attachedFingerprint = '';
    if (unsubscribe) { try { unsubscribe(); } catch (e) {} }
    unsubscribe = null;
  }
  function stop(reason) {
    cancelAdvance();
    if (App.practiceRouter) App.practiceRouter.stop(reason || 'Practice stopped.');
    var released = releaseOutput();
    releaseLease();
    running = false; armed = false; tested = null; held = {};
    detachInput();
    outputStatus = released ? 'OFF — output disarmed; pending notes released.' : 'OFF — note-off attempted; the disconnected device could not confirm delivery.';
    status = reason || 'Stopped. Start a fresh session to continue.';
    paint();
  }
  function answerFingerprint() {
    if (typeof midi().inputFingerprint === 'function') return midi().inputFingerprint(inputId);
    var port = ports('inputs').filter(function (p) { return p.id === inputId; })[0];
    return port ? inputId + ':' + (port.name || '') : '';
  }
  function decodeAnswer(bytes, decoder) {
    if (!bytes || typeof bytes.length !== 'number') return false;
    var changed = false, lengths = { 0x80: 3, 0x90: 3, 0xa0: 3, 0xb0: 3, 0xc0: 2, 0xd0: 2, 0xe0: 3 };
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i];
      if (!Number.isInteger(b) || b < 0 || b > 255) { decoder.status = decoder.running = 0; decoder.data = []; decoder.sysex = false; continue; }
      if (b >= 0xf8) continue; // realtime can interrupt any data byte
      if (decoder.sysex) {
        if (b === 0xf7) { decoder.sysex = false; continue; }
        if (b < 0x80) continue;
        decoder.sysex = false; // resync a malformed SysEx at the new status
      }
      if (b >= 0x80) {
        decoder.data = [];
        if (b < 0xf0) decoder.status = decoder.running = b;
        else {
          decoder.running = 0; decoder.status = b === 0xf1 || b === 0xf2 || b === 0xf3 ? b : 0;
          decoder.sysex = b === 0xf0;
        }
        continue;
      }
      if (!decoder.status) decoder.status = decoder.running;
      if (!decoder.status) continue;
      var length = decoder.status < 0xf0 ? lengths[decoder.status & 0xf0] : ({ 0xf1: 2, 0xf2: 3, 0xf3: 2 })[decoder.status];
      decoder.data.push(b);
      if (decoder.data.length !== length - 1) continue;
      var statusByte = decoder.status, data = decoder.data;
      decoder.data = []; decoder.status = statusByte < 0xf0 ? decoder.running : 0;
      var type = statusByte & 0xf0;
      if (type !== 0x90 && type !== 0x80) continue;
      var key = (statusByte & 15) + ':' + data[0];
      if (type === 0x90 && data[1] > 0) held[key] = data[0]; else delete held[key];
      changed = true;
    }
    return changed;
  }
  function receive(message, decoder, generation) {
    if (generation !== answerGeneration || decoder !== answerDecoder) return;
    if (!visible || !running || mode !== 'hardware' || !message || message.portId !== inputId || !hasPort('inputs', inputId)) return;
    if (answerFingerprint() !== attachedFingerprint) { stop('Answer input changed. Session stopped; release keys and start again.'); return; }
    if (decodeAnswer(message.bytes, decoder)) { updateFeedback(); paint(); }
  }
  function attachInput() {
    // A harmless port refresh keeps a live stream, including a partial frame.
    if (unsubscribe && attachedInputId === inputId && attachedFingerprint === answerFingerprint()) return true;
    if (unsubscribe && running) { stop('Answer input changed. Start a fresh session.'); return false; }
    detachInput();
    if (!supportsPorts() || !hasPort('inputs', inputId)) return false;
    attachedInputId = inputId; attachedFingerprint = answerFingerprint();
    answerDecoder = { status: 0, running: 0, data: [], sysex: false };
    var decoder = answerDecoder, generation = answerGeneration;
    try { unsubscribe = midi().subscribeInput(inputId, function (message) { receive(message, decoder, generation); }); }
    catch (e) { unsubscribe = null; }
    return typeof unsubscribe === 'function';
  }
  function failOutput(message) {
    var released = releaseOutput(); armed = false; tested = null;
    releaseLease();
    outputStatus = 'OFF — ' + message + (released ? '' : ' Note-off delivery could not be confirmed.');
    paint();
  }
  function frameRoles(notes) {
    var actual = answerNotes();
    return { target: notes.slice(),
      correct: actual.filter(function (n) { return notes.indexOf(n) >= 0; }),
      wrong: actual.filter(function (n) { return notes.indexOf(n) < 0 && n >= low && n < low + 24; }), channel: channel };
  }
  function renderOutput(isTest) {
    if (!visible || !running || mode !== 'hardware' || (!isTest && !armed)) return false;
    if (midi().displayEnabled === false) { failOutput('LUMI Display is off in the treble-clef menu.'); return false; }
    if (!supportsPorts() || !hasPort('outputs', outputId)) { failOutput('Selected output unavailable.'); return false; }
    if (!acquireLease()) { failOutput('Selected output is busy or its lights could not be released.'); return false; }
    var notes = isTest ? [low] : target;
    var frame = isTest ? { target: notes, channel: channel } : frameRoles(notes);
    if (!outputLease.frame(frame)) { failOutput('Display frame failed or its original output changed.'); return false; }
    pending = distinct(frame.target.concat(frame.correct || [], frame.wrong || [])).map(function (n) { return { note: n }; });
    outputStatus = isTest ? 'TEST target to selected output. Note-off follows in 300 ms.' :
      'ARMED — instructional target stays lit until it changes or you disarm. Targets and answers keep their shared pitch colors. Correct/wrong states use the labeled preview and outlines.';
    if (isTest) {
      var portId = outputId, testLow = low, testChannel = channel;
      clearTimeout(outputTimer);
      outputTimer = setTimeout(function () {
        var released = releaseOutput(); releaseLease();
        if (!released) { failOutput('Test note-off could not be delivered to its original device.'); return; }
        if (visible && running && mode === 'hardware' && outputId === portId && low === testLow && channel === testChannel) {
          tested = { id: portId, low: testLow, channel: testChannel };
          outputStatus = 'OFF — test ended. Observe the selected device before arming; hardware lighting remains unverified.';
        }
        paint();
      }, 300);
    }
    return true;
  }
  function updateFeedback() {
    if (!running || !target.length) { cancelAdvance(); feedback = 'waiting'; feedbackText = 'Start a session to see the target.'; return; }
    var judged = compareNotes(target, answerNotes());
    feedback = judged.extra.length ? 'wrong' : judged.correct ? 'correct' : 'waiting';
    feedbackText = judged.extra.length ? '× Wrong extra ' + (judged.extra.length === 1 ? 'note: ' : 'notes: ') + names(judged.extra) + '. Release these notes; the target stays here.' :
      judged.correct ? '✓ Correct — exact target matched.' + (flow === 'guided' ? ' Hold briefly to continue.' : '') :
      '◎ Waiting — still needed: ' + names(judged.missing) + '. Partial chords stay on this target.';
    if (flow === 'guided') {
      if (!judged.correct) cancelAdvance();
      else if (!advanceTimer) {
        advanceTimer = setTimeout(function () {
          advanceTimer = null;
          if (!visible || !running || flow !== 'guided' || !compareNotes(target, answerNotes()).correct) return;
          if (mode === 'hardware' && (!supportsPorts() || !hasPort('inputs', inputId))) { stop('Answer input changed during feedback. Start again.'); return; }
          correct++; attempts++; nextTarget();
        }, 700);
      }
    }
    if (mode === 'hardware' && armed) renderOutput(false);
  }
  function nextTarget() {
    if (!running) return;
    var intervals = kind === 'major' ? [0, 4, 7] : kind === 'minor' ? [0, 3, 7] : [0];
    var candidates = [], useScale = !!(App.scaleLock && typeof App.scaleLock.contains === 'function');
    for (var n = low; n + intervals[intervals.length - 1] < low + 24; n++) {
      if (!useScale || intervals.every(function (i) { return App.scaleLock && App.scaleLock.contains(n + i); })) candidates.push(n);
    }
    if (!candidates.length) {
      target = []; stop('No complete ' + (kind === 'note' ? 'note' : kind + ' triad') + ' fits this scale and window. Choose another exercise, scale or window.'); return;
    }
    var start = candidates[serial++ % candidates.length];
    target = intervals.map(function (n) { return start + n; });
    cancelAdvance();
    if (mode === 'simulated') held = {}; // virtual release; physical holds must keep their real note-offs
    answered = false;
    result = 'Hold exactly ' + target.length + (target.length === 1 ? ' note' : ' notes') + (flow === 'guided' ? ' to continue automatically.' : ', then check your answer.') + ' Octave matters.';
    updateFeedback(); paint();
  }
  function start() {
    stop('Preparing a fresh session.');
    if (!visible) return;
    if (mode === 'hardware' && (!supportsPorts() || !attachInput())) {
      status = 'Choose an available synth or LUMI answer input. Independent ports require an enabled Web MIDI backend; native bridges are unsupported here.';
      paint(); return;
    }
    running = true; correct = 0; attempts = 0; serial = 0;
    status = mode === 'simulated' ? 'SIMULATED session — answer pads and display preview use no MIDI ports.' : 'Listening only to the selected answer keyboard.';
    outputStatus = mode === 'simulated' ? 'OFF — simulated mode never sends MIDI device messages.' : 'OFF — every fresh start requires a new selected-device test and explicit arm.';
    nextTarget();
  }
  function checkAnswer() {
    if (!running || answered || flow === 'guided') return;
    if (mode === 'hardware' && (!supportsPorts() || !hasPort('inputs', inputId))) { stop('Answer input is unavailable or its role changed. Session stopped; choose ports and start again.'); return; }
    var actual = answerNotes(), judged = compareNotes(target, actual); attempts++;
    if (judged.correct) { correct++; answered = true; result = 'Correct — exact notes and octaves matched. Choose Next target.'; }
    else result = 'Try again.' + (judged.missing.length ? ' Missing: ' + names(judged.missing) + '.' : '') +
      (judged.extra.length ? ' Unexpected: ' + names(judged.extra) + '.' : '') + (!actual.length ? ' No answer notes held.' : '');
    paint();
  }
  function simulatedNote(n) {
    if (!visible || !running || mode !== 'simulated') return;
    var key = 'sim:' + n;
    if (held[key] === undefined) held[key] = n; else delete held[key];
    updateFeedback(); paint();
  }
  function fillPorts(id, type, selected, label) {
    var list = ports(type), html = '<option value="">' + label + '</option>';
    list.forEach(function (p) { html += '<option value="' + esc(p.id) + '">' + esc(p.name || p.id) + ' [' + esc(p.id) + ']</option>'; });
    if (els[id].innerHTML !== html) els[id].innerHTML = html;
    els[id].value = selected;
  }
  function refreshPorts() {
    if (!root) return;
    var lostInput = inputId && !hasPort('inputs', inputId), lostOutput = outputId && !hasPort('outputs', outputId);
    if (mode === 'hardware' && running && (!supportsPorts() || lostInput || lostOutput)) stop('Device connection changed. Session stopped and output disarmed; choose ports and start again.');
    else if (mode === 'hardware' && running && !attachInput()) stop('Answer input is unavailable. Session stopped and output disarmed.');
    if (lostInput) inputId = '';
    if (lostOutput) { outputId = ''; tested = null; armed = false; }
    fillPorts('input', 'inputs', inputId, 'Choose LUMI or MODX answer input…');
    fillPorts('output', 'outputs', outputId, 'None — display output OFF');
    text('ports-status', supportsPorts() ? 'Independent Web MIDI ports available. Synth answer inputs and LUMI display outputs are independent; LUMI input is optional; mixed and virtual names are excluded. Other ROLI devices do not qualify. Both choices apply only to this page.' :
      (midi().native ? 'Native MIDI bridge: independent port routing is unsupported. Simulated practice remains available.' : 'Independent ports unavailable. Enable Web MIDI in Settings, then refresh ports; simulated practice remains available.'));
    paint();
  }
  function paintSoundRoute() {
    if (!root || !els['sound-output']) return;
    var router = App.practiceRouter, list = router ? (midi().outputs || []).filter(function (p) { return router.validPort('outputs', p); }) : [];
    var html = '<option value="">None — synth sound routing OFF</option>';
    list.forEach(function (p) { html += '<option value="' + esc(p.id) + '">' + esc(p.name || p.id) + ' [' + esc(p.id) + ']</option>'; });
    if (els['sound-output'].innerHTML !== html) els['sound-output'].innerHTML = html;
    els['sound-output'].value = synthOutputId;
    var scale = App.store ? App.store.get('fb.scale', 'minorPent') : 'minorPent', key = App.store ? App.store.get('fb.root', 9) : 9;
    var scaleName = window.Theory && Theory.SCALES[scale] ? Theory.SCALES[scale].name : scale;
    text('scale', 'Selected scale: ' + NAMES[key % 12] + ' ' + scaleName + '. ' +
      (synthOutputId ? 'Targets follow this selected scale; sound admission follows Scale Lock in the clef menu.' : 'Targets and the display follow this scale. Sound routing remains independently selected.'));
    els['sound-output'].disabled = !router || !supportsPorts();
    var soundInput = router && (midi().inputs || []).some(function (p) { return p.id === inputId && router.validPort('inputs', p); });
    els['sound-start'].disabled = !router || !soundInput || !running || mode !== 'hardware' || !synthOutputId || !inputId || !localControlOff || router.active;
    els['sound-stop'].disabled = !router || !router.active;
    var state = router && router.state;
    text('sound-status', router && router.active ? 'ON — selected keyboard → selected synth output. Scale Lock ' + (App.scaleLock && App.scaleLock.on ? 'ON: allowed scale notes only.' : 'OFF: all notes allowed.') :
      'OFF — ' + (state && state.reason ? state.reason : 'choose separate sound output and acknowledge Local Control OFF.'));
  }
  function buildKeys() {
    var display = '', answers = '';
    for (var n = low; n < low + 24; n++) {
      var cls = [1, 3, 6, 8, 10].indexOf(n % 12) >= 0 ? ' lp-black' : '';
      display += '<span class="lp-key' + cls + '" data-target-note="' + n + '"><b>' + noteName(n) + '</b><small>' + n + '</small><em class="lp-role"></em></span>';
      answers += '<button type="button" class="lp-key' + cls + '" data-answer-note="' + n + '" aria-pressed="false" aria-label="Simulated answer ' + noteName(n) + ', MIDI ' + n + '"><b>' + noteName(n) + '</b><small>' + n + '</small></button>';
    }
    els.display.innerHTML = display; els.answers.innerHTML = answers;
    els.answers.querySelectorAll('[data-answer-note]').forEach(function (button) {
      button.addEventListener('click', function () { simulatedNote(Number(button.dataset.answerNote)); });
    });
  }
  function paintAnswer() {
    if (!root) return;
    var actual = answerNotes();
    text('heard', actual.length ? names(actual) : 'No answer notes held.');
    els.answers.querySelectorAll('[data-answer-note]').forEach(function (button) {
      var on = actual.indexOf(Number(button.dataset.answerNote)) >= 0;
      if (App.colors && App.colors.forPitch) { var color = App.colors.forPitch(Number(button.dataset.answerNote)); button.style.background = color; button.style.color = '#1c1206'; button.dataset.pitchColor = color; }
      button.classList.toggle('lp-held', on); button.setAttribute('aria-pressed', String(on));
      button.disabled = !running || mode !== 'simulated';
    });
  }
  function paint() {
    if (!root) return;
    text('mode-badge', mode === 'simulated' ? 'SIMULATED — NO DEVICE I/O' : 'HARDWARE — EXPERIMENTAL / UNVERIFIED');
    els['mode-badge'].classList.toggle('lp-live', mode === 'hardware');
    els.simulated.hidden = mode !== 'simulated';
    els.hardware.hidden = mode !== 'hardware';
    text('display-master', 'LUMI Display is ' + (midi().displayEnabled === false ? 'OFF' : 'ON') + ' — use its single toggle in the treble-clef menu.');
    text('status', status); text('result', result); text('output-status', outputStatus); text('mock-status', mockStatus);
    text('range', noteName(low) + '–' + noteName(low + 23) + ' · MIDI ' + low + '–' + (low + 23) + ' · exactly 24 keys');
    text('target', target.length ? noteName(target[0]) + (kind === 'major' ? ' major triad' : kind === 'minor' ? ' minor triad' : '') : 'Ready when you are');
    text('target-notes', target.length ? names(target) : 'Targets stay inside the configured window.');
    text('score', correct + ' correct / ' + attempts + ' checks');
    text('source', mode === 'simulated' ? 'Answer source: simulated answer pads' : 'Answer source: selected keyboard input only');
    els.start.textContent = running ? 'Restart session (output OFF)' : 'Start session (output OFF)';
    els.stop.disabled = !running && !pending.length;
    els.check.disabled = !running || answered || flow === 'guided';
    els.next.disabled = !running || flow === 'guided';
    els.clear.disabled = !running || mode !== 'simulated';
    els.preview.disabled = !running || mode !== 'simulated';
    var master = midi().displayEnabled !== false;
    els.test.disabled = !master || !running || mode !== 'hardware' || !supportsPorts() || !hasPort('outputs', outputId) || !!pending.length;
    els.arm.disabled = !master || !running || mode !== 'hardware' || !tested || tested.id !== outputId || tested.low !== low || tested.channel !== channel || !!pending.length || armed;
    els.disarm.disabled = !armed && !pending.length && !tested;
    els.input.disabled = els.output.disabled = !supportsPorts();
    paintSoundRoute();
    var actual = answerNotes();
    els.display.querySelectorAll('[data-target-note]').forEach(function (key) {
      var n = Number(key.dataset.targetNote), on = target.indexOf(n) >= 0, heldHere = actual.indexOf(n) >= 0;
      if (App.colors && App.colors.forPitch) { var pitchColor = App.colors.forPitch(n); key.style.background = pitchColor; key.style.color = '#1c1206'; key.dataset.pitchColor = pitchColor; }
      var role = heldHere ? (on ? '✓ Correct' : '× Wrong') : on ? '◎ Target' : '';
      key.classList.toggle('lp-target-key', on);
      key.classList.toggle('lp-correct-key', on && heldHere);
      key.classList.toggle('lp-wrong-key', !on && heldHere);
      key.querySelector('.lp-role').textContent = role;
      key.setAttribute('aria-label', noteName(n) + (role ? ', ' + role : ''));
    });
    text('feedback', running ? feedbackText : 'Start a session to see the target.');
    els.feedback.dataset.feedback = feedback;
    paintAnswer();
  }
  function changed(reason) {
    stop(reason + ' Start again; output remains OFF.'); target = [];
    localControlOff = false; if (els['local-control']) els['local-control'].checked = false;
    paint();
  }
  function init(el) {
    root = el;
    root.innerHTML = '<div class="lp-top"><div><h2>LUMI practice</h2><p>Follow the illuminated LUMI target while you play your separate synth. LUMI answer input is optional. Wait mode continues when the exact notes are correct.</p></div><strong id="lp-mode-badge" class="lp-badge"></strong></div>' +
      '<div class="card lp-setup"><div class="lp-controls"><label class="field">Practice mode<select id="lp-mode"><option value="simulated">Simulated — no device I/O</option><option value="hardware">Hardware — independent Web MIDI ports</option></select></label>' +
      '<label class="field">Progression<select id="lp-flow"><option value="guided">Wait until correct</option><option value="manual">Manual check and next</option></select></label>' +
      '<label class="field">Exercise<select id="lp-kind"><option value="note">Single notes</option><option value="major">Major triads</option><option value="minor">Minor triads</option></select></label>' +
      '<label class="field">24-key window starts at MIDI<input id="lp-low" type="number" min="0" max="104" step="1" value="48" aria-describedby="lp-range lp-octave"></label>' +
      '<label class="field">Display channel<select id="lp-channel">' + Array.from({ length: 16 }, function (_, i) { return '<option value="' + i + '">' + (i + 1) + '</option>'; }).join('') + '</select></label></div>' +
      '<p id="lp-range" class="lp-range"></p><p id="lp-octave" class="small muted">Exact pitches: MIDI 60 = C4 here. Match the physical LUMI octave to this window yourself. Device octave labels can differ; targets and answers are never folded into another octave.</p>' +
      '<div id="lp-hardware" hidden><div class="lp-controls"><label class="field">Synth answer INPUT (LUMI optional)<select id="lp-input"></select></label><label class="field">LUMI display OUTPUT<select id="lp-output"></select></label><button id="lp-refresh" class="btn" type="button">Refresh ports</button></div>' +
      '<p id="lp-ports-status" class="small"></p>' +
      '<fieldset class="lp-sound-route"><legend>Independent synth sound route</legend><label class="field">Synth SOUND OUTPUT<select id="lp-sound-output"></select></label><p id="lp-scale" class="small"></p><label class="lp-ack"><input id="lp-local-control" type="checkbox">I have set my synth Local Control OFF, disabled external MIDI Thru/loops, and released all keys and the sustain pedal.</label><p class="small muted">This app cannot mute the synth’s physical local sound. It never changes Local Control. Scale Lock in the treble-clef menu controls whether this sound route blocks notes outside the selected scale; LUMI Display is independent.</p><div class="lp-actions"><button id="lp-sound-start" class="btn" type="button">Start synth sound route</button><button id="lp-sound-stop" class="btn" type="button">Stop synth sound route</button></div><p id="lp-sound-status" role="status"></p></fieldset>' +
      '<p class="lp-warning"><strong>EXPERIMENTAL / UNVERIFIED hardware lighting.</strong> The keyboard is an instructional display: target notes stay lit in their shared pitch colors. The preview labels and outlines correct and wrong answers without changing pitch identity. Shared key lights pause on that output while armed, then return. A test may make sound; device behavior remains unverified.</p>' +
      '<div class="lp-actions"><button id="lp-test" class="btn" type="button">Test selected output (300 ms)</button><button id="lp-arm" class="btn" type="button">I observed the test — arm output</button><button id="lp-disarm" class="btn" type="button">Disarm output</button></div></div>' +
      '<p id="lp-display-master" class="small"></p><p id="lp-output-status" class="lp-output" role="status"></p></div>' +
      '<div class="lp-actions"><button id="lp-start" class="btn primary" type="button"></button><button id="lp-stop" class="btn" type="button">Stop &amp; release notes</button><span id="lp-score" class="small"></span></div>' +
      '<p id="lp-status" role="status"></p><div class="card lp-question"><p class="lp-eyebrow">Target · on-screen reference</p><h3 id="lp-target"></h3><p id="lp-target-notes"></p><div id="lp-display" class="lp-keyboard" role="group" aria-label="24-key target display, reference only"></div><p id="lp-feedback" class="lp-feedback" role="status" aria-live="polite"></p><p class="small muted">◎ Target · ✓ Correct · × Wrong. The preview never counts as answer input.</p></div>' +
      '<div id="lp-simulated" class="card lp-mocks"><strong>SIMULATED DEVICES — no actual MIDI ports</strong><fieldset><legend>Simulated keyboard answers · select notes to hold</legend><div id="lp-answers" class="lp-keyboard"></div><button id="lp-clear" class="btn sm" type="button">Release simulated answers</button></fieldset>' +
      '<div class="lp-mock-output"><b>Simulated LUMI display output</b><button id="lp-preview" class="btn sm" type="button">Preview simulated display</button><p id="lp-mock-status" class="small" role="status"></p></div></div>' +
      '<div class="card lp-answer"><p id="lp-source" class="lp-eyebrow"></p><p id="lp-heard"></p><div class="lp-actions"><button id="lp-check" class="btn primary" type="button">Check answer</button><button id="lp-next" class="btn" type="button">Next target</button></div><p id="lp-result" role="status" aria-live="polite"></p></div>';
    root.querySelectorAll('[id^="lp-"]').forEach(function (node) { els[node.id.slice(3)] = node; });
    els.mode.addEventListener('change', function () { changed('Mode changed.'); mode = els.mode.value === 'hardware' ? 'hardware' : 'simulated'; refreshPorts(); });
    els.flow.addEventListener('change', function () { changed('Progression changed.'); flow = els.flow.value === 'manual' ? 'manual' : 'guided'; paint(); });
    els.kind.addEventListener('change', function () { changed('Exercise changed.'); kind = els.kind.value; paint(); });
    els.low.addEventListener('change', function () {
      var n = Number(els.low.value);
      if (!Number.isInteger(n) || n < 0 || n > 104 || els.low.value.trim() === '') { els.low.value = low; status = 'Choose a whole MIDI note from 0 to 104 so all 24 keys fit.'; paint(); return; }
      changed('Window changed.'); low = n; buildKeys(); paint();
    });
    els.channel.addEventListener('change', function () { changed('Display channel changed.'); channel = Number(els.channel.value); paint(); });
    els.input.addEventListener('change', function () { changed('Answer input changed.'); inputId = els.input.value; paint(); });
    els.output.addEventListener('change', function () { var selected = els.output.value; changed('Display output changed.'); outputId = selected; if (midi().setDisplayOutput) midi().setDisplayOutput(outputId); paint(); });
    els['sound-output'].addEventListener('change', function () { var selected = els['sound-output'].value; changed('Synth sound output changed.'); synthOutputId = selected; localControlOff = false; els['local-control'].checked = false; paint(); });
    els['local-control'].addEventListener('change', function () {
      localControlOff = els['local-control'].checked;
      if (!localControlOff && App.practiceRouter) App.practiceRouter.stop('Local Control acknowledgement withdrawn.');
      paint();
    });
    els['sound-start'].addEventListener('click', function () {
      if (!running || mode !== 'hardware' || !App.practiceRouter || !localControlOff) return;
      App.practiceRouter.start({ inputId: inputId, outputId: synthOutputId, displayOutputId: outputId, localControlOff: true }); paint();
    });
    els['sound-stop'].addEventListener('click', function () { if (App.practiceRouter) App.practiceRouter.stop('Stopped from practice.'); paint(); });
    els.refresh.addEventListener('click', refreshPorts);
    els.start.addEventListener('click', start);
    els.stop.addEventListener('click', function () { stop('Stopped. Start again when ready.'); });
    els.check.addEventListener('click', checkAnswer);
    els.next.addEventListener('click', nextTarget);
    els.clear.addEventListener('click', function () { if (mode === 'simulated') { held = {}; updateFeedback(); paint(); } });
    els.preview.addEventListener('click', function () {
      if (!running || mode !== 'simulated') return;
      mockStatus = 'Last SIMULATED output only: ' + names(target) + '. No device messages sent; answers unchanged.'; text('mock-status', mockStatus);
    });
    els.test.addEventListener('click', function () { armed = false; tested = null; renderOutput(true); });
    els.arm.addEventListener('click', function () {
      if (!running || mode !== 'hardware' || !tested || tested.id !== outputId || tested.low !== low || tested.channel !== channel || pending.length) return;
      armed = true; renderOutput(false); paint();
    });
    els.disarm.addEventListener('click', function () { failOutput('Disarmed. A new test is required to arm again.'); });
    App.on('colors', function () { if (root) { updateFeedback(); paint(); } });
    App.on('lights:master', function (state) {
      if (state && state.enabled === false) {
        var clean = releaseOutput(); releaseLease(); armed = false; tested = null;
        outputStatus = clean ? 'OFF — LUMI Display disabled in the clef menu. Sound routing is unchanged.' : 'OFF — display disabled; original LED cleanup could not be confirmed.';
      }
      if (root) paint();
    });
    App.on('practice:route', function () { if (root) paintSoundRoute(); });
    ['fb:set', 'fb:scale'].forEach(function (event) { App.on(event, function () {
      if (running) stop('Selected scale changed. Start again for targets in the new scale.');
      if (root) paint(); // interval pitch colors must follow root even while stopped
    }); });
    App.on('midi:state', function () {
      // A same-id reconnect can look identical in inventory snapshots. Do
      // not carry an observed test or armed session across any route change.
      if (mode === 'hardware' && running) stop('MIDI connection changed. Session stopped and output disarmed; start again.');
      refreshPorts();
    });
    window.addEventListener('blur', function () { if (running || pending.length || armed) stop('Window lost focus. Session stopped and output disarmed.'); });
    window.addEventListener('pagehide', function () { stop('Page closed or hidden. Output disarmed.'); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop('App hidden. Session stopped and output disarmed.'); });
    buildKeys(); refreshPorts(); paint();
  }
  App.register('lumipractice', {
    init: init,
    onShow: function () { visible = true; refreshPorts(); },
    onHide: function () { stop('Practice page left. Session stopped and output disarmed.'); visible = false; }
  });
  window.SLLumiPractice = {
    noteName: noteName, compareNotes: compareNotes,
    snapshot: function () { return { mode: mode, visible: visible, running: running, inputId: inputId, outputId: outputId,
      low: low, channel: channel, flow: flow, synthOutputId: synthOutputId, localControlOff: localControlOff, feedback: feedback, advancing: !!advanceTimer, target: target.slice(), held: answerNotes(), armed: armed, tested: !!tested,
      activeOutputs: pending.length, leased: !!outputLease, correct: correct, attempts: attempts, answered: answered }; }
  };
})();
