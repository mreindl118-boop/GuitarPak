/* LUMI practice: isolated answer input + opt-in, transient display output.
 * No global MIDI selection, lighting engine, Thru, SysEx, or note event bus.
 * Registers 'lumipractice'; all state is intentionally session-only.
 */
(function () {
  'use strict';
  var root, els = {}, visible = false, running = false, mode = 'simulated';
  var inputId = '', outputId = '', low = 48, channel = 0, kind = 'note';
  var held = {}, target = [], serial = 0, correct = 0, attempts = 0, answered = false;
  var unsubscribe = null, armed = false, tested = null, pending = [], outputTimer = null;
  var status = 'Ready for simulated practice. Device output is OFF.';
  var result = 'Start a session, then play or select the target notes and check your answer.';
  var outputStatus = 'OFF — no device messages sent by this page.';
  var mockStatus = 'Simulated display idle. No device ports are used.';
  var NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

  function midi() { return App.midi || {}; }
  function supportsPorts() {
    var m = midi();
    return m.explicitPortsSupported === true && typeof m.subscribeInput === 'function' && typeof m.sendToOutput === 'function';
  }
  function correctRole(type, p) {
    if (!p || p.state === 'disconnected' || typeof p.id !== 'string' || !p.id) return false;
    var name = p.name || '';
    if (/virtual|loopback|loopmidi|through|thru|midi mapper/i.test(name)) return false;
    return type === 'inputs' ? /modx/i.test(name) && !/lumi|roli|helix|stadium/i.test(name) :
      /lumi/i.test(name) && !/modx|montage|helix|stadium/i.test(name);
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
  function sendExact(id, bytes) {
    try { return supportsPorts() && hasPort('outputs', id) && midi().sendToOutput(id, bytes) === true; }
    catch (e) { return false; }
  }

  // Keep the original port/channel/note for cleanup, even after UI changes.
  // Never send a broad panic, CC, program, SysEx, or a global-output fallback.
  function releaseOutput() {
    clearTimeout(outputTimer); outputTimer = null;
    var notes = pending; pending = [];
    var ok = true;
    notes.forEach(function (n) { if (!sendExact(n.portId, [0x80 | n.channel, n.note, 0])) ok = false; });
    return ok;
  }
  function detachInput() {
    if (unsubscribe) { try { unsubscribe(); } catch (e) {} }
    unsubscribe = null;
  }
  function stop(reason) {
    var released = releaseOutput();
    running = false; armed = false; tested = null; held = {};
    detachInput();
    outputStatus = released ? 'OFF — output disarmed; pending notes released.' : 'OFF — note-off attempted; the disconnected device could not confirm delivery.';
    status = reason || 'Stopped. Start a fresh session to continue.';
    paint();
  }
  function receive(message) {
    if (!visible || !running || mode !== 'hardware' || !message || message.portId !== inputId || !hasPort('inputs', inputId)) return;
    var b = message.bytes;
    if (!b || b.length !== 3 || !Array.prototype.every.call(b, function (n) { return Number.isInteger(n) && n >= 0 && n <= 255; })) return;
    var type = b[0] & 0xf0;
    if ((type !== 0x90 && type !== 0x80) || b[1] > 127 || b[2] > 127) return;
    var key = (b[0] & 15) + ':' + b[1];
    if (type === 0x90 && b[2] > 0) held[key] = b[1];
    else delete held[key];
    paintAnswer();
  }
  function attachInput() {
    detachInput();
    if (!supportsPorts() || !hasPort('inputs', inputId)) return false;
    try { unsubscribe = midi().subscribeInput(inputId, receive); }
    catch (e) { unsubscribe = null; }
    return typeof unsubscribe === 'function';
  }
  function failOutput(message) {
    var released = releaseOutput(); armed = false; tested = null;
    outputStatus = 'OFF — ' + message + (released ? '' : ' Note-off delivery could not be confirmed.');
    paint();
  }
  function pulse(notes, isTest) {
    if (!visible || !running || mode !== 'hardware' || (!isTest && !armed)) return false;
    if (!supportsPorts() || !hasPort('outputs', outputId)) { failOutput('Selected output unavailable.'); return false; }
    if (!notes.length || notes.some(function (n) { return !Number.isInteger(n) || n < low || n >= low + 24 || n > 127; })) { failOutput('Target is outside the configured 24-key window.'); return false; }
    if (!releaseOutput()) { failOutput('Previous note-off failed. Test again before arming.'); return false; }
    var portId = outputId, pulseLow = low, pulseChannel = channel;
    for (var i = 0; i < notes.length; i++) {
      if (!sendExact(portId, [0x90 | pulseChannel, notes[i], 80])) { failOutput('Selected-port send failed.'); return false; }
      pending.push({ portId: portId, channel: pulseChannel, note: notes[i] });
    }
    outputStatus = (isTest ? 'TEST pulse' : 'ARMED — target pulse') + ' to selected output only: ' + names(notes) + '. Note-off follows within 650 ms.';
    outputTimer = setTimeout(function () {
      var released = releaseOutput();
      if (!released) { failOutput('Note-off failed.'); return; }
      if (isTest && visible && running && mode === 'hardware' && outputId === portId && low === pulseLow && channel === pulseChannel) {
        tested = { id: portId, low: pulseLow, channel: pulseChannel };
        outputStatus = 'OFF — test pulse ended. Observe the selected device before arming; lighting remains unverified.';
      } else if (armed) outputStatus = 'ARMED — target pulse ended; no notes held by this page.';
      paint();
    }, isTest ? 300 : 650);
    paint();
    return true;
  }
  function nextTarget() {
    if (!running) return;
    var intervals = kind === 'major' ? [0, 4, 7] : kind === 'minor' ? [0, 3, 7] : [0];
    var count = 24 - intervals[intervals.length - 1];
    var start = low + ((serial++ * 7) % count);
    target = intervals.map(function (n) { return start + n; });
    held = {}; answered = false;
    result = 'Hold exactly ' + target.length + (target.length === 1 ? ' note' : ' notes') + ', then check your answer. Octave matters.';
    if (mode === 'hardware' && armed) pulse(target, false);
    paint();
  }
  function start() {
    stop('Preparing a fresh session.');
    if (!visible) return;
    if (mode === 'hardware' && (!supportsPorts() || !attachInput())) {
      status = 'Choose an available MODX answer input. Independent ports require an enabled Web MIDI backend; native bridges are unsupported here.';
      paint(); return;
    }
    running = true; correct = 0; attempts = 0; serial = 0;
    status = mode === 'simulated' ? 'SIMULATED session — answer pads and display preview use no MIDI ports.' : 'Listening only to the selected MODX answer input. Display output is OFF.';
    outputStatus = mode === 'simulated' ? 'OFF — simulated mode never sends MIDI device messages.' : 'OFF — every fresh start requires a new selected-device test and explicit arm.';
    nextTarget();
  }
  function checkAnswer() {
    if (!running || answered) return;
    if (mode === 'hardware' && (!supportsPorts() || !hasPort('inputs', inputId))) { stop('MODX answer input is unavailable or its role changed. Session stopped; choose ports and start again.'); return; }
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
    paintAnswer();
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
    fillPorts('input', 'inputs', inputId, 'Choose MODX answer input…');
    fillPorts('output', 'outputs', outputId, 'None — display output OFF');
    text('ports-status', supportsPorts() ? 'Independent Web MIDI ports available. Only MODX-named inputs and LUMI-named outputs are offered; mixed and virtual names are excluded. Other ROLI devices do not qualify. Both choices apply only to this page.' :
      (midi().native ? 'Native MIDI bridge: independent port routing is unsupported. Simulated practice remains available.' : 'Independent ports unavailable. Enable Web MIDI in Settings, then refresh ports; simulated practice remains available.'));
    paint();
  }
  function buildKeys() {
    var display = '', answers = '';
    for (var n = low; n < low + 24; n++) {
      var cls = [1, 3, 6, 8, 10].indexOf(n % 12) >= 0 ? ' lp-black' : '';
      display += '<span class="lp-key' + cls + '" data-target-note="' + n + '"><b>' + noteName(n) + '</b><small>' + n + '</small></span>';
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
    text('status', status); text('result', result); text('output-status', outputStatus); text('mock-status', mockStatus);
    text('range', noteName(low) + '–' + noteName(low + 23) + ' · MIDI ' + low + '–' + (low + 23) + ' · exactly 24 keys');
    text('target', target.length ? noteName(target[0]) + (kind === 'major' ? ' major triad' : kind === 'minor' ? ' minor triad' : '') : 'Ready when you are');
    text('target-notes', target.length ? names(target) : 'Targets stay inside the configured window.');
    text('score', correct + ' correct / ' + attempts + ' checks');
    text('source', mode === 'simulated' ? 'Answer source: simulated pads below' : 'Answer source: selected MODX input only');
    els.start.textContent = running ? 'Restart session (output OFF)' : 'Start session (output OFF)';
    els.stop.disabled = !running && !pending.length;
    els.check.disabled = !running || answered;
    els.next.disabled = !running;
    els.clear.disabled = !running || mode !== 'simulated';
    els.preview.disabled = !running || mode !== 'simulated';
    els.test.disabled = !running || mode !== 'hardware' || !supportsPorts() || !hasPort('outputs', outputId) || !!pending.length;
    els.arm.disabled = !running || mode !== 'hardware' || !tested || tested.id !== outputId || tested.low !== low || tested.channel !== channel || !!pending.length || armed;
    els.disarm.disabled = !armed && !pending.length && !tested;
    els.input.disabled = els.output.disabled = !supportsPorts();
    els.display.querySelectorAll('[data-target-note]').forEach(function (key) {
      var on = target.indexOf(Number(key.dataset.targetNote)) >= 0;
      key.classList.toggle('lp-target-key', on);
      key.setAttribute('aria-label', noteName(Number(key.dataset.targetNote)) + (on ? ', target' : ''));
    });
    paintAnswer();
  }
  function changed(reason) { stop(reason + ' Start again; output remains OFF.'); target = []; paint(); }
  function init(el) {
    root = el;
    root.innerHTML = '<div class="lp-top"><div><h2>LUMI practice</h2><p>Read a target here, answer on MODX, and optionally preview it on a separate LUMI output.</p></div><strong id="lp-mode-badge" class="lp-badge"></strong></div>' +
      '<div class="card lp-setup"><div class="lp-controls"><label class="field">Practice mode<select id="lp-mode"><option value="simulated">Simulated — no device I/O</option><option value="hardware">Hardware — independent Web MIDI ports</option></select></label>' +
      '<label class="field">Exercise<select id="lp-kind"><option value="note">Single notes</option><option value="major">Major triads</option><option value="minor">Minor triads</option></select></label>' +
      '<label class="field">24-key window starts at MIDI<input id="lp-low" type="number" min="0" max="104" step="1" value="48" aria-describedby="lp-range lp-octave"></label>' +
      '<label class="field">Display channel<select id="lp-channel">' + Array.from({ length: 16 }, function (_, i) { return '<option value="' + i + '">' + (i + 1) + '</option>'; }).join('') + '</select></label></div>' +
      '<p id="lp-range" class="lp-range"></p><p id="lp-octave" class="small muted">Exact pitches: MIDI 60 = C4 here. Match the physical LUMI octave to this window yourself. Device octave labels can differ; targets and answers are never folded into another octave.</p>' +
      '<div id="lp-hardware" hidden><div class="lp-controls"><label class="field">MODX answer INPUT<select id="lp-input"></select></label><label class="field">LUMI display OUTPUT<select id="lp-output"></select></label><button id="lp-refresh" class="btn" type="button">Refresh ports</button></div>' +
      '<p id="lp-ports-status" class="small"></p><p class="lp-warning"><strong>EXPERIMENTAL / UNVERIFIED hardware lighting.</strong> A test sends one ordinary note to the exact output you choose and may make sound. This page sends only temporary Note On/Off messages; no SysEx, custom programs, patch changes, or persistent device writes.</p>' +
      '<div class="lp-actions"><button id="lp-test" class="btn" type="button">Test selected output (300 ms)</button><button id="lp-arm" class="btn" type="button">I observed the test — arm output</button><button id="lp-disarm" class="btn" type="button">Disarm output</button></div></div>' +
      '<p id="lp-output-status" class="lp-output" role="status"></p></div>' +
      '<div class="lp-actions"><button id="lp-start" class="btn primary" type="button"></button><button id="lp-stop" class="btn" type="button">Stop &amp; release notes</button><span id="lp-score" class="small"></span></div>' +
      '<p id="lp-status" role="status"></p><div class="card lp-question"><p class="lp-eyebrow">Target · on-screen reference</p><h3 id="lp-target"></h3><p id="lp-target-notes"></p><div id="lp-display" class="lp-keyboard" role="group" aria-label="24-key target display, reference only"></div><p class="small muted">Highlighted keys are the question. They never count as answer input.</p></div>' +
      '<div id="lp-simulated" class="card lp-mocks"><strong>SIMULATED DEVICES — no actual MIDI ports</strong><fieldset><legend>Simulated MODX answers · select notes to hold</legend><div id="lp-answers" class="lp-keyboard"></div><button id="lp-clear" class="btn sm" type="button">Release simulated answers</button></fieldset>' +
      '<div class="lp-mock-output"><b>Simulated LUMI display output</b><button id="lp-preview" class="btn sm" type="button">Preview simulated display</button><p id="lp-mock-status" class="small" role="status"></p></div></div>' +
      '<div class="card lp-answer"><p id="lp-source" class="lp-eyebrow"></p><p id="lp-heard"></p><div class="lp-actions"><button id="lp-check" class="btn primary" type="button">Check answer</button><button id="lp-next" class="btn" type="button">Next target</button></div><p id="lp-result" role="status" aria-live="polite"></p></div>';
    root.querySelectorAll('[id^="lp-"]').forEach(function (node) { els[node.id.slice(3)] = node; });
    els.mode.addEventListener('change', function () { changed('Mode changed.'); mode = els.mode.value === 'hardware' ? 'hardware' : 'simulated'; refreshPorts(); });
    els.kind.addEventListener('change', function () { changed('Exercise changed.'); kind = els.kind.value; paint(); });
    els.low.addEventListener('change', function () {
      var n = Number(els.low.value);
      if (!Number.isInteger(n) || n < 0 || n > 104 || els.low.value.trim() === '') { els.low.value = low; status = 'Choose a whole MIDI note from 0 to 104 so all 24 keys fit.'; paint(); return; }
      changed('Window changed.'); low = n; buildKeys(); paint();
    });
    els.channel.addEventListener('change', function () { changed('Display channel changed.'); channel = Number(els.channel.value); paint(); });
    els.input.addEventListener('change', function () { changed('Answer input changed.'); inputId = els.input.value; paint(); });
    els.output.addEventListener('change', function () { changed('Display output changed.'); outputId = els.output.value; paint(); });
    els.refresh.addEventListener('click', refreshPorts);
    els.start.addEventListener('click', start);
    els.stop.addEventListener('click', function () { stop('Stopped. Start again when ready.'); });
    els.check.addEventListener('click', checkAnswer);
    els.next.addEventListener('click', nextTarget);
    els.clear.addEventListener('click', function () { if (mode === 'simulated') { held = {}; paintAnswer(); } });
    els.preview.addEventListener('click', function () {
      if (!running || mode !== 'simulated') return;
      mockStatus = 'Last SIMULATED output only: ' + names(target) + '. No device messages sent; answers unchanged.'; text('mock-status', mockStatus);
    });
    els.test.addEventListener('click', function () { armed = false; tested = null; pulse([low], true); });
    els.arm.addEventListener('click', function () {
      if (!running || mode !== 'hardware' || !tested || tested.id !== outputId || tested.low !== low || tested.channel !== channel || pending.length) return;
      armed = true; pulse(target, false); paint();
    });
    els.disarm.addEventListener('click', function () { failOutput('Disarmed. A new test is required to arm again.'); });
    App.on('midi:state', refreshPorts);
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
      low: low, channel: channel, target: target.slice(), held: answerNotes(), armed: armed, tested: !!tested,
      activeOutputs: pending.length, correct: correct, attempts: attempts, answered: answered }; }
  };
})();
