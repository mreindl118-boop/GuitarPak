/* Helix Stadium XL recall profile. No preset editing, SysEx or MIDI routing.
 * Shared service contract: App.midi explicitPortsSupported, inputs/outputs,
 * subscribeInput(id, fn), sendToOutput(id, bytes). See docs/HELIX-STADIUM.md.
 */
(function () {
  'use strict';

  var root, el = {}, visible = false, armed = false, outputId = '', inputId = '';
  var unsubscribe = null, editId = '', clockTicks = 0, rxCount = 0, rxTimer = null;
  var lastInput = 'No messages received.', status = 'Output is disarmed. Select firmware and a Helix output to continue.';
  var STORE = 'helixStadium.favorites';

  function midi() { return App.midi; }
  function integer(value, low, high) {
    if (!/^\d+$/.test(String(value))) return null;
    var n = Number(value);
    return n >= low && n <= high && Math.floor(n) === n ? n : null;
  }
  function acceptablePort(port) {
    return !!(port && port.state !== 'disconnected' && typeof port.id === 'string' && port.id &&
      /helix|stadium/i.test(port.name || '') &&
      !/modx|montage|lumi|roli|virtual|loopback|loopmidi|through|thru|midi mapper/i.test(port.name || ''));
  }
  function ports(kind) {
    var service = midi();
    if (!service || !service.explicitPortsSupported) return [];
    return (service[kind] || []).filter(acceptablePort);
  }
  function findPort(kind, id) {
    var list = ports(kind);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function hex(bytes) {
    return bytes.map(function (b) { return ('0' + b.toString(16).toUpperCase()).slice(-2); }).join(' ');
  }
  function presetBytes(channel, bank, program, snapshot) {
    if (integer(channel, 1, 16) === null || integer(bank, 0, 127) === null || integer(program, 0, 127) === null) return null;
    if (snapshot !== null && snapshot !== undefined && integer(snapshot, 1, 8) === null) return null;
    var bytes = [[0xB0 | (Number(channel) - 1), 32, Number(bank)], [0xC0 | (Number(channel) - 1), Number(program)]];
    if (snapshot !== null && snapshot !== undefined) bytes.push([0xB0 | (Number(channel) - 1), 69, Number(snapshot) - 1]);
    return bytes;
  }
  function snapshotBytes(channel, value) {
    if (integer(channel, 1, 16) === null || integer(value, 0, 9) === null) return null;
    return [[0xB0 | (Number(channel) - 1), 69, Number(value)]];
  }
  function favorites() {
    var saved = App.store.get(STORE, []);
    if (!Array.isArray(saved)) return [];
    return saved.slice(0, 32).filter(function (p) {
      return p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim() &&
        integer(p.bank, 0, 127) !== null && integer(p.program, 0, 127) !== null &&
        (p.snapshot === null || integer(p.snapshot, 1, 8) !== null);
    }).map(function (p) {
      return { id: p.id.slice(0, 100), name: p.name.trim().slice(0, 80), bank: Number(p.bank), program: Number(p.program), snapshot: p.snapshot === null ? null : Number(p.snapshot) };
    });
  }
  function canArm() {
    return !!(visible && document.visibilityState !== 'hidden' && midi() && midi().explicitPortsSupported &&
      typeof midi().sendToOutput === 'function' && el.firmware && el.firmware.value === '1.4' &&
      integer(el.channel.value, 1, 16) !== null && findPort('outputs', outputId));
  }
  function message(text) { status = text; paintSafety(); }
  function disarm(text) {
    armed = false;
    if (text) status = text;
    paintSafety();
  }
  function paintSafety() {
    if (!root) return;
    var allowed = canArm();
    if (!allowed) armed = false;
    el.arm.disabled = !allowed;
    el.arm.textContent = armed ? 'Disarm output' : 'Arm output';
    el.arm.setAttribute('aria-pressed', String(armed));
    el.arm.classList.toggle('danger', armed);
    el.armState.textContent = armed ? 'ARMED' : 'DISARMED';
    el.armState.classList.toggle('hs-armed', armed);
    el.status.textContent = status;
    var port = findPort('outputs', outputId);
    el.destination.textContent = port ? port.name + ' · Global channel ' + el.channel.value : 'No output selected';
    root.querySelectorAll('[data-hs-send]').forEach(function (button) { button.disabled = !armed || !allowed; });
  }
  function sendAction(messages, label) {
    if (!messages || !armed || !canArm()) { disarm('Nothing sent. Check firmware, destination and arm output first.'); return false; }
    var destination = outputId, destinationName = findPort('outputs', outputId).name, sent = [];
    for (var i = 0; i < messages.length; i++) {
      if (!armed || !canArm() || destination !== outputId || !midi().sendToOutput(destination, messages[i].slice())) {
        disarm(sent.length ? 'Command only partly sent. Output disarmed; check the device before retrying.' : 'Nothing sent. The selected output is unavailable; output disarmed.');
        return false;
      }
      sent.push(hex(messages[i]));
    }
    el.lastOut.textContent = label + ' · ' + sent.join(' / ');
    message('Sent ' + label + ' to ' + destinationName + '. Device state is not confirmed.');
    return true;
  }
  function formPreset() {
    var bank = integer(el.bank.value, 0, 127), program = integer(el.program.value, 0, 127);
    var snapshot = el.snapshot.value === '' ? null : integer(el.snapshot.value, 1, 8);
    if (bank === null || program === null || (el.snapshot.value !== '' && snapshot === null)) return null;
    return { bank: bank, program: program, snapshot: snapshot };
  }
  function preview() {
    var p = formPreset(), bytes = p && presetBytes(el.channel.value, p.bank, p.program, p.snapshot);
    el.preview.textContent = bytes ? bytes.map(hex).join(' / ') : 'Enter whole bank and program values from 0 to 127.';
  }
  function recall(p) {
    if (!p) { message('Nothing sent. Enter bank and program values from 0 to 127.'); return; }
    sendAction(presetBytes(el.channel.value, p.bank, p.program, p.snapshot), p.name || 'preset recall');
  }
  function resetEditor() {
    editId = ''; el.name.value = ''; el.save.textContent = 'Save favorite'; el.cancel.hidden = true;
  }
  function saveFavorite() {
    var p = formPreset(), name = el.name.value.trim();
    if (!p || !name) { message('Add a name and valid bank/program numbers before saving a favorite. Nothing sent.'); return; }
    var list = favorites(), found = false;
    p.id = editId || ('hs-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8));
    p.name = name.slice(0, 80);
    for (var i = 0; i < list.length; i++) if (list[i].id === editId) { list[i] = p; found = true; break; }
    if (!found) {
      if (list.length >= 32) { message('There are 32 favorites. Remove one before adding another.'); return; }
      list.push(p);
    }
    App.store.set(STORE, list); resetEditor(); paintFavorites(); message('Favorite saved on this device. Nothing sent.');
  }
  function button(text, callback, send) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.textContent = text;
    if (send) b.setAttribute('data-hs-send', '');
    b.addEventListener('click', callback); return b;
  }
  function paintFavorites() {
    el.favorites.replaceChildren();
    var list = favorites();
    el.empty.hidden = !!list.length;
    list.forEach(function (p) {
      var item = document.createElement('li'); item.className = 'hs-favorite';
      var info = document.createElement('div'), title = document.createElement('strong'), detail = document.createElement('span');
      title.textContent = p.name; detail.className = 'muted small';
      detail.textContent = 'CC32 ' + p.bank + ' · PC ' + p.program + (p.snapshot === null ? '' : ' · Snapshot ' + p.snapshot);
      info.append(title, detail); item.appendChild(info);
      var actions = document.createElement('div'); actions.className = 'hs-actions';
      actions.appendChild(button('Recall', function () { recall(p); }, true));
      actions.appendChild(button('Edit', function () {
        editId = p.id; el.name.value = p.name; el.bank.value = p.bank; el.program.value = p.program;
        el.snapshot.value = p.snapshot === null ? '' : p.snapshot; el.save.textContent = 'Update favorite';
        el.cancel.hidden = false; preview(); el.name.focus();
      }));
      actions.appendChild(button('Remove', function () {
        App.store.set(STORE, favorites().filter(function (entry) { return entry.id !== p.id; }));
        if (editId === p.id) resetEditor();
        paintFavorites(); message('Favorite removed locally. Nothing sent.');
      }));
      item.appendChild(actions); el.favorites.appendChild(item);
    });
    paintSafety();
  }
  function stopInput() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (rxTimer !== null) { clearTimeout(rxTimer); rxTimer = null; }
  }
  function paintActivity() {
    rxTimer = null;
    el.activity.textContent = rxCount + ' messages · ' + clockTicks + ' clock ticks · ' + lastInput;
  }
  function startInput() {
    stopInput();
    if (!visible || document.visibilityState === 'hidden' || !inputId || !findPort('inputs', inputId) || !midi() || typeof midi().subscribeInput !== 'function') return;
    var selected = inputId;
    unsubscribe = midi().subscribeInput(selected, function (event) {
      if (!visible || document.visibilityState === 'hidden' || selected !== inputId || !event || event.portId !== selected || !findPort('inputs', selected)) return;
      var bytes = Array.prototype.slice.call(event.bytes || []);
      if (!bytes.length) return;
      rxCount++;
      if (bytes[0] === 0xF8) clockTicks++;
      lastInput = bytes[0] === 0xF8 ? 'Clock received' : hex(bytes.slice(0, 16)) + (bytes.length > 16 ? ' …' : '');
      if (rxTimer === null) rxTimer = setTimeout(paintActivity, 100);
    });
    if (!unsubscribe) disarm('Input monitoring is unavailable for this port. Output disarmed.');
  }
  function paintPortSelect(select, kind, selected) {
    select.replaceChildren();
    var none = document.createElement('option'); none.value = ''; none.textContent = 'Select a Helix ' + (kind === 'outputs' ? 'output' : 'input (optional)'); select.appendChild(none);
    ports(kind).forEach(function (port) {
      var option = document.createElement('option'); option.value = port.id; option.textContent = port.name; select.appendChild(option);
    });
    select.value = selected;
  }
  function refreshPorts() {
    if (!root) return;
    if (!findPort('outputs', outputId)) outputId = '';
    if (!findPort('inputs', inputId)) inputId = '';
    if (!inputId) el.activity.textContent = 'No input selected.';
    paintPortSelect(el.output, 'outputs', outputId); paintPortSelect(el.input, 'inputs', inputId);
    var service = midi();
    el.connection.textContent = service && service.explicitPortsSupported ? 'Web MIDI ready. Only Helix/Stadium named ports are offered.' :
      service && service.ready ? 'This MIDI backend cannot isolate physical ports. Helix output is unavailable here.' : 'Enable Web MIDI to list connected ports.';
    el.enable.disabled = !!(service && service.ready);
    el.enable.textContent = service && service.ready ? 'MIDI enabled' : 'Enable Web MIDI';
    paintSafety();
  }
  function onMidiState() {
    disarm('MIDI connection changed. Verify the destination and arm again when ready.');
    refreshPorts(); startInput();
  }
  function init(container) {
    root = container;
    root.classList.add('hs-page');
    root.innerHTML =
      '<div class="hs-heading"><div><p class="hs-eyebrow">DEVICE PROFILE</p><h2>Helix Stadium XL</h2></div><span class="chip hs-untested">Hardware untested</span></div>' +
      '<p class="muted hs-intro">Recall your saved presets and snapshots. Favorites are names and MIDI addresses you enter here; the app does not read or edit tones.</p>' +
      '<section class="card hs-setup" aria-labelledby="hs-setup-title"><div class="row spread"><h3 id="hs-setup-title">1. Choose the destination</h3><button class="btn sm" type="button" id="hs-enable">Enable Web MIDI</button></div>' +
      '<p id="hs-connection" class="muted small"></p><div class="hs-setup-grid">' +
      '<label class="field">Installed firmware<select id="hs-firmware"><option value="">Select firmware on your device</option><option value="1.4">v1.4 · documented recall controls</option><option value="other">Other / older · output unavailable</option></select></label>' +
      '<label class="field">Helix output<select id="hs-output"></select></label>' +
      '<label class="field">Global MIDI channel<select id="hs-channel"></select></label>' +
      '<label class="field">Monitor input (optional)<select id="hs-input"></select></label></div>' +
      '<p class="muted small">Match the Global MIDI channel in Stadium’s Global Settings → MIDI (default 1). USB MIDI must be enabled on the device. Unnamed DIN interfaces and virtual ports are not offered.</p>' +
      '<div class="hs-arm-row"><span id="hs-arm-state" class="hs-state">DISARMED</span><span id="hs-destination" class="small"></span><button class="btn" type="button" id="hs-arm" aria-pressed="false">Arm output</button></div>' +
      '<p id="hs-status" role="status" aria-live="polite" class="hs-status"></p></section>' +
      '<div class="hs-columns"><section class="card" aria-labelledby="hs-recall-title"><h3 id="hs-recall-title">2. Preset favorites</h3>' +
      '<p class="muted small">Copy the CC32 bank and PC program shown in Stadium’s Preset List sidebar. Both values below are raw MIDI numbers (0–127). Changing presets can discard unsaved edits on the device.</p>' +
      '<form id="hs-form"><label class="field">Your preset name<input id="hs-name" maxlength="80" placeholder="Name a saved effects preset" autocomplete="off"></label>' +
      '<div class="hs-address"><label class="field">Bank · CC32<input id="hs-bank" type="number" min="0" max="127" step="1" value="1" required></label>' +
      '<label class="field">Program · PC<input id="hs-program" type="number" min="0" max="127" step="1" value="0" required></label>' +
      '<label class="field">Then snapshot<select id="hs-snapshot"><option value="">Keep preset default</option></select></label></div>' +
      '<p class="hs-bytes" id="hs-preview" aria-label="MIDI message preview"></p><div class="hs-actions"><button class="btn" type="submit" id="hs-save">Save favorite</button>' +
      '<button class="btn" type="button" id="hs-cancel" hidden>Cancel edit</button><button class="btn primary" type="button" id="hs-recall" data-hs-send>Recall address</button></div></form>' +
      '<p id="hs-empty" class="muted hs-empty">No favorites yet. Save a name and address above; saving sends nothing.</p><ul id="hs-favorites" class="hs-favorites"></ul></section>' +
      '<section class="card" aria-labelledby="hs-snapshot-title"><h3 id="hs-snapshot-title">3. Snapshot shortcuts</h3><p class="muted small">Applies to the currently loaded preset. These controls send CC69 on the selected Global channel.</p>' +
      '<div id="hs-snapshots" class="hs-snapshots"></div><div class="hs-actions hs-shortcuts"><button class="btn" type="button" id="hs-previous" data-hs-send>Previous snapshot</button>' +
      '<button class="btn" type="button" id="hs-next" data-hs-send>Next snapshot</button><button class="btn" type="button" id="hs-tap" data-hs-send>Tap tempo</button></div>' +
      '<p class="muted small">Tap sends CC64 = 127 once per click. This page does not send clock or transport messages.</p><div class="hs-monitor"><h4>Selected input activity</h4><p id="hs-activity" class="hs-bytes">No input selected.</p>' +
      '<p class="muted small">Read only. Footswitches send MIDI only when configured on Stadium; this is not a live mirror of its switches.</p><h4>Last output</h4><p id="hs-last-out" class="hs-bytes">Nothing sent from this profile.</p></div></section></div>' +
      '<details class="card hs-notes"><summary>Setup notes and limits</summary><p>Preserve your effects-only setup for the Fender Blues Deluxe. This profile has no amp, cab, IR, audio-routing, patch-write or firmware controls.</p>' +
      '<p>Output starts off and disarms when you change firmware, channel or destination, leave this page, hide the app, lose window focus, or reconnect MIDI. No port or arm state is saved.</p>' +
      '<p>Only v1.4 core recall mappings are enabled. Showcase, Matrix, block bypass and parameter control are outside this profile. Check your device firmware and its MIDI settings manually; no automatic version query is sent.</p>' +
      '<p><a href="https://manuals.line6.com/en/helix-stadium/live/midi" target="_blank" rel="noopener noreferrer">Line 6 MIDI reference</a> · <a href="https://manuals.line6.com/en/helix-stadium/live/global-settings" target="_blank" rel="noopener noreferrer">Global Settings</a></p></details>';
    var ids = ['enable', 'connection', 'firmware', 'output', 'channel', 'input', 'arm', 'arm-state', 'destination', 'status', 'form', 'name', 'bank', 'program', 'snapshot', 'preview', 'save', 'cancel', 'recall', 'empty', 'favorites', 'snapshots', 'previous', 'next', 'tap', 'activity', 'last-out'];
    ids.forEach(function (id) { el[id.replace(/-([a-z])/g, function (_, letter) { return letter.toUpperCase(); })] = root.querySelector('#hs-' + id); });
    for (var c = 1; c <= 16; c++) { var option = document.createElement('option'); option.value = c; option.textContent = c; el.channel.appendChild(option); }
    for (var s = 1; s <= 8; s++) {
      var snap = document.createElement('option'); snap.value = s; snap.textContent = 'Snapshot ' + s; el.snapshot.appendChild(snap);
      (function (number) { el.snapshots.appendChild(button(String(number), function () { sendAction(snapshotBytes(el.channel.value, number - 1), 'snapshot ' + number); }, true)); })(s);
    }
    el.enable.addEventListener('click', function () {
      if (!midi() || typeof midi().enable !== 'function') { message('Web MIDI is unavailable in this browser.'); return; }
      disarm('Enabling MIDI. Select your Helix ports after access is granted.');
      Promise.resolve().then(function () { return midi().enable(); }).then(refreshPorts).catch(function () { message('MIDI access was not granted. Output remains disarmed.'); });
    });
    el.output.addEventListener('change', function () { outputId = findPort('outputs', el.output.value) ? el.output.value : ''; disarm('Destination changed. Verify it, then arm output.'); });
    el.input.addEventListener('change', function () {
      inputId = findPort('inputs', el.input.value) ? el.input.value : ''; rxCount = 0; clockTicks = 0; lastInput = 'No messages received.';
      el.activity.textContent = inputId ? 'Listening to selected Helix input.' : 'No input selected.';
      startInput();
    });
    el.firmware.addEventListener('change', function () { disarm(el.firmware.value === '1.4' ? 'Firmware selected. Verify the destination, then arm output.' : 'Select documented v1.4 firmware to enable output.'); });
    el.channel.addEventListener('change', function () { disarm('Global channel changed. Match it on the device, then arm output.'); preview(); });
    el.arm.addEventListener('click', function () {
      if (armed) { disarm('Output disarmed.'); return; }
      if (!canArm()) { disarm('Select v1.4 firmware and a connected Helix output first.'); return; }
      armed = true; message('Output armed. Only clicking a recall, snapshot or tap control sends MIDI.');
    });
    el.form.addEventListener('submit', function (event) { event.preventDefault(); saveFavorite(); });
    el.cancel.addEventListener('click', function () { resetEditor(); });
    el.recall.addEventListener('click', function () { recall(formPreset()); });
    ['bank', 'program', 'snapshot'].forEach(function (key) { el[key].addEventListener('input', preview); el[key].addEventListener('change', preview); });
    el.previous.addEventListener('click', function () { sendAction(snapshotBytes(el.channel.value, 9), 'previous snapshot'); });
    el.next.addEventListener('click', function () { sendAction(snapshotBytes(el.channel.value, 8), 'next snapshot'); });
    el.tap.addEventListener('click', function () { sendAction([[0xB0 | (Number(el.channel.value) - 1), 64, 127]], 'tap tempo'); });
    App.on('midi:state', onMidiState);
    window.addEventListener('blur', function () { disarm('Window focus lost. Output disarmed.'); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { disarm('App hidden. Output disarmed.'); stopInput(); }
      else if (visible) startInput();
    });
    preview(); paintFavorites(); refreshPorts();
  }
  App.register('helix-stadium', {
    init: init,
    onShow: function () { visible = true; disarm('Output is disarmed. Select firmware and verify your Helix destination.'); refreshPorts(); startInput(); },
    onHide: function () { visible = false; disarm('Page closed. Output disarmed.'); stopInput(); }
  });
  window.SLHelixStadium = {
    acceptablePort: acceptablePort, presetBytes: presetBytes, snapshotBytes: snapshotBytes,
    get state() { return { armed: armed, visible: visible, outputId: outputId, inputId: inputId, subscribed: !!unsubscribe }; }
  };
})();
