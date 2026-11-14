/* soundLAB CONTROLLER REMOTE (App.remote): move practice on from the
 * instrument — no touching the iPad or the computer.
 *
 * Three actions: NEXT (start / show answer / next question / next level),
 * BACK (retry / hear it again) and STOP (end the run). Each can be bound to:
 *   - a MIDI button or pedal: a CC (a MODX foot switch with FS Assign set to
 *     a CC, the Assign switches CC 86/87, any pedal box), a Program Change or
 *     a note (e.g. the top key of an 88-key board). Learned in Settings ›
 *     Hands-free control. The bound message is CLAIMED in midi.js before any
 *     listener (App.midi.setInputClaim): it never sustains, sounds, reaches
 *     Thru or gets graded — it only advances.
 *   - a key: a Bluetooth page-turner pedal types keys (Page Down / Up or
 *     arrows). Learnable per action, or the 'Page turner' switch maps Page
 *     Down / Right / Down = Next and Page Up / Left / Up = Back. The only
 *     hands-free path in Safari on an iPad (no Web MIDI there).
 *   - double-tap the lowest key (a LUMI's leftmost key, App.midi.range().lo):
 *     opt-in (remote.dbl). On pages that declare remoteKey (app.js contract)
 *     that key is reserved — claimed, silent, never graded — and two strikes
 *     within 350 ms = NEXT. The Keys page's scale lessons keep their own
 *     double-tap (kl.dbltap: start / stop) and are never claimed here.
 * Actions go to App.remoteAction (app.js): the help tour, then sheets fold
 * away, then the page's onRemote(action, info). The HUD (#remote-hud) shows
 * what happened; 'nothing to do here' is an App.toast.
 * Store: remote.map {next|back|stop: {midi: {t: 'cc'|'pc'|'note', n, ch,
 * port, latch?}|null, key: {code, key}|null}}, remote.pt (page turner keys),
 * remote.dbl (double-tap key). Bus: 'remote' {action, via, handled},
 * 'remote:map' after any change. Docs: docs/CONTROLLER-REMOTE.md.
 *
 * TWO APPS (2.0): index.html (soundLAB) and gear.html (soundLAB Gear) both
 * load this file, read the same bindings and both claim a bound message. The
 * Settings card (mount) is in soundLAB only. With both open, ONE APP acts
 * on a MIDI press: soundLAB while one of its windows is visible, Gear when
 * none is (Web Lock 'soundlab-remote-main' — see ONE WINDOW ACTS ON A PEDAL
 * near the end; App.remote.holdsMain). Within one app every visible window
 * acts, as two windows always did.
 */
(function () {
  'use strict';

  var ACTIONS = ['next', 'back', 'stop'];
  var NAMES = { next: 'Next', back: 'Back', stop: 'Stop' };
  var HINTS = { next: 'start · show answer · next question · next level', back: 'retry · hear it again', stop: 'end the run' };
  var ICON = { next: 'right', back: 'left', stop: 'stop' };
  var NOTHING = { next: 'Nothing to move on here', back: 'Nothing to go back to here', stop: 'Nothing to stop here' };
  var NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var DBL_MS = 350, DEBOUNCE_MS = 250, LEARN_MS = 20000, TRIGGER_GAP_MS = 400;
  // which app this document is (js/app.js APPS): no App.app = soundLAB
  var GEAR = App.app === 'gear';
  var LOCK = 'soundlab-remote-main', LOCK_MS = 1000; // the Web Lock both apps ask; the longest a press waits for its answer
  var MIDI_VIA = ['cc', 'pc', 'note', 'dbltap']; // a press that came from MIDI (every window hears it)

  function g(k, d) { return App.store.get('remote.' + k, d); }
  function set(k, v) { App.store.set('remote.' + k, v); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function noteName(n) { return NOTE[n % 12] + (Math.floor(n / 12) - 1); }

  // ---- the map ----
  function cleanMidi(b) {
    if (!b || typeof b !== 'object' || ['cc', 'pc', 'note'].indexOf(b.t) < 0) return null;
    var n = parseInt(b.n, 10); if (!(n >= 0 && n <= 127)) return null;
    var ch = b.ch == null ? null : parseInt(b.ch, 10);
    return { t: b.t, n: n, ch: ch >= 0 && ch <= 15 ? ch : null, port: typeof b.port === 'string' ? b.port.slice(0, 80) : '', latch: b.t === 'cc' && !!b.latch };
  }
  function cleanKey(k) {
    if (!k || typeof k !== 'object' || (typeof k.code !== 'string' && typeof k.key !== 'string')) return null;
    return { code: String(k.code || '').slice(0, 40), key: String(k.key || '').slice(0, 40) };
  }
  function map() {
    var m = g('map', null), out = {};
    ACTIONS.forEach(function (a) {
      var e = m && m[a] && typeof m[a] === 'object' ? m[a] : {};
      out[a] = { midi: cleanMidi(e.midi), key: cleanKey(e.key) };
    });
    return out;
  }
  function saveMap(m) { set('map', m); App.emit('remote:map', {}); paint(); }

  function midiLabel(b) {
    if (!b) return '';
    var what = b.t === 'cc' ? 'CC ' + b.n + (b.n === 64 ? ' (sustain)' : '') : b.t === 'pc' ? 'Program ' + (b.n + 1) : 'Key ' + noteName(b.n);
    return what + (b.ch != null ? ' · ch ' + (b.ch + 1) : '') + (b.port ? ' · ' + b.port : '') + (b.latch ? ' · latching' : '');
  }
  var KEY_NAMES = { PageDown: 'Page Down', PageUp: 'Page Up', ArrowRight: 'Right arrow', ArrowLeft: 'Left arrow', ArrowDown: 'Down arrow', ArrowUp: 'Up arrow', ' ': 'Space', Enter: 'Enter' };
  function keyLabel(k) {
    if (!k) return '';
    var n = KEY_NAMES[k.key] || KEY_NAMES[k.code] || (k.key && k.key.length === 1 ? k.key.toUpperCase() : k.key || k.code);
    return 'Key: ' + n;
  }
  function bindingText(a, m) {
    m = m || map();
    var parts = [];
    if (m[a].midi) parts.push(midiLabel(m[a].midi));
    if (m[a].key) parts.push(keyLabel(m[a].key));
    if (ptOn() && PT[a]) parts.push('page turner');
    if (a === 'next' && g('dbl', false)) parts.push('double-tap the lowest key');
    return parts.join(' / ');
  }

  // ---- MIDI gestures (claimed in midi.js before every listener) ----
  function inputNames() { var mi = App.midi; return mi && mi.ready ? (mi.inputs || []).map(function (p) { return p.name || ''; }) : []; }
  function portOk(b, src) {
    if (!b.port) return true;
    var name = (src && src.port) || '';
    if (name.toLowerCase() === b.port.toLowerCase()) return true;
    // the learned port is not connected (another computer, the Android app
    // names it differently): any port may press it
    return !inputNames().some(function (n) { return n.toLowerCase() === b.port.toLowerCase(); });
  }
  var ccLast = {}, notesHeld = {}, lastFire = {}, taps = { t: 0 }, dblHeld = {};
  function matches(b, bytes, src) {
    var t = bytes[0] & 0xf0, ch = bytes[0] & 15;
    if (b.ch != null && b.ch !== ch) return false;
    if (b.t === 'cc') return t === 0xb0 && bytes[1] === b.n && portOk(b, src);
    if (b.t === 'pc') return t === 0xc0 && bytes[1] === b.n && portOk(b, src);
    if (b.t === 'note') return (t === 0x90 || t === 0x80) && bytes[1] === b.n && portOk(b, src);
    return false;
  }
  function lumiIn() { return inputNames().some(function (n) { return /lumi/i.test(n); }); }
  function ctrlKey() { var r = App.midi && App.midi.range ? App.midi.range() : null; return r ? r.lo : 48; }
  function dblActive() { return g('dbl', false) === true && !!(App.remoteKeyPage && App.remoteKeyPage()); }

  function claim(bytes, src) {
    var t = bytes[0] & 0xf0, ch = bytes[0] & 15, on = t === 0x90 && bytes[2] > 0, off = t === 0x80 || (t === 0x90 && bytes[2] === 0);
    var held = (src && src.portId) + ':' + ch + ':' + bytes[1];
    // the release of a note this remote took
    if (off && notesHeld[held]) { delete notesHeld[held]; return true; }
    if (off && dblHeld[held]) { delete dblHeld[held]; return true; }
    if (learning) return learnMidi(bytes, src);
    var m = map();
    for (var i = 0; i < ACTIONS.length; i++) {
      var a = ACTIONS[i], b = m[a].midi;
      if (!b || !matches(b, bytes, src)) continue;
      if (b.t === 'cc') {
        // a press: on after off; the first message after a reload; or, for a
        // pedal that only ever sends 'on' (trigger / instant-command modes),
        // 'on' again after a quiet gap. Latching = every switch on or off.
        var key = held, last = ccLast[key], v = bytes[2], now = Date.now();
        ccLast[key] = { v: v, t: now };
        var press = b.latch ? (!last || (v >= 64) !== (last.v >= 64))
          : v >= 64 && (!last || last.v < 64 || now - last.t > TRIGGER_GAP_MS);
        if (press) fire(a, 'cc');
      } else if (b.t === 'pc') fire(a, 'pc');
      else if (on) { notesHeld[held] = true; fire(a, 'note'); }
      else if (off) return false; // not ours (the press went through before it was learned)
      return true;
    }
    // the reserved double-tap key (opt-in, pages that allow it). After the
    // LUMI's octave-down button its lowest key sends a note below the window:
    // that strike moves the window first (as a played note would), so it is
    // the remote key at once. (After octave-up the app learns the new window
    // from the first note played in the new top octave.)
    var fromKeys = !lumiIn() || /lumi/i.test((src && src.port) || '');
    if (on && fromKeys && App.midi && App.midi.learnRange && dblActive()) {
      var rg = App.midi.range();
      if (bytes[1] < rg.lo || bytes[1] > rg.hi) App.midi.learnRange(bytes[1]);
    }
    if ((on || off) && bytes[1] === ctrlKey() && fromKeys && dblActive()) {
      if (off) return false; // its press went through (the page changed between)
      dblHeld[held] = true;
      var now = Date.now();
      if (now - taps.t < DBL_MS) { taps.t = 0; fire('next', 'dbltap'); } else taps.t = now;
      return true;
    }
    return false;
  }

  // ---- firing ----
  function fire(action, via) {
    if (document.hidden) return null;
    var now = Date.now(), before = lastFire[action] || 0;
    if (now - before < DEBOUNCE_MS) return null;
    lastFire[action] = now;
    // soundLAB Gear, a press from MIDI: only while no soundLAB window is
    // visible (ONE WINDOW ACTS ON A PEDAL, below). The lock answers a task
    // later, so this returns null; a press that was not Gear's to take leaves
    // the debounce as it found it
    if (GEAR && MIDI_VIA.indexOf(via) >= 0) {
      gearTurn(function () { act(action, via); }, function () { if (lastFire[action] === now) lastFire[action] = before; });
      return null;
    }
    return act(action, via);
  }
  function act(action, via) {
    var r = false;
    if (App.active === 'settings' && !(window.Help && Help.isOpen && Help.isOpen())) {
      hud(NAMES[action] + ' works', action); flashRow(action);
      App.emit('remote', { action: action, via: via, handled: false, test: true });
      return 'settings';
    }
    var told = App.toast ? App.toast.n || 0 : 0;
    try { r = App.remoteAction(action, { via: via }); } catch (e) { console.error('remote', e); r = false; }
    // a page that toasted its own reason ('Load a song first') keeps it
    told = !!App.toast && (App.toast.n || 0) !== told;
    if (r) {
      hud(typeof r === 'string' ? r : NAMES[action], action);
      if (!told) soundHint();
    } else if (App.toast && !told) App.toast(NOTHING[action]);
    App.emit('remote', { action: action, via: via, handled: !!r, label: typeof r === 'string' ? r : '' });
    return r;
  }
  // MIDI is not a user gesture: a run started from a pedal while the audio
  // device sleeps would stay silent — one tap wakes it
  var hinted = 0;
  function soundHint() {
    if (GEAR) return; // no app voice there: a step sounds on the synth
    var ctx = null; try { ctx = App.getAudio ? App.getAudio() : null; } catch (e) { ctx = null; }
    if (!ctx || ctx.state === 'running' || Date.now() - hinted < 15000) return;
    hinted = Date.now();
    if (App.toast) App.toast('Tap the screen once to turn the sound on', 4000);
  }

  // ---- HUD: a big, brief confirmation the player can read from the bench ----
  var hudEl = null, hudT = 0;
  function hud(text, action) {
    if (!hudEl) {
      hudEl = document.createElement('div');
      hudEl.id = 'remote-hud';
      hudEl.setAttribute('role', 'status');
      hudEl.setAttribute('aria-live', 'polite');
      hudEl.setAttribute('aria-atomic', 'true');
      document.body.appendChild(hudEl);
    }
    hudEl.textContent = '';
    hudEl.innerHTML = (App.icon ? App.icon(ICON[action] || 'right', 22) : '') + '<span>' + esc(text) + '</span>';
    hudEl.dataset.action = action;
    hudEl.classList.remove('show'); void hudEl.offsetWidth; hudEl.classList.add('show');
    clearTimeout(hudT); hudT = setTimeout(function () { hudEl.classList.remove('show'); }, 1100);
  }

  // ---- keys: learned keys and the page-turner switch ----
  var PT = { next: ['PageDown', 'ArrowRight', 'ArrowDown'], back: ['PageUp', 'ArrowLeft', 'ArrowUp'] };
  function ptOn() { return g('pt', false) === true; }
  // a text field keeps every key; a picker (a select, a slider, a number
  // box) left focused after a tap would otherwise turn a page-turner press
  // into a changed instrument or tempo — there the pedal wins and the
  // control lets go of focus
  var TEXT_INPUT = /^(text|search|email|url|tel|password)$/i;
  function typing(t) {
    if (!t || !t.tagName) return false;
    return !!(t.isContentEditable || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && TEXT_INPUT.test(t.type || 'text')));
  }
  function picker(t) {
    if (!t || !t.tagName) return false;
    return t.tagName === 'SELECT' || t.tagName === 'INPUT' || stepper(t);
  }
  // a slider / knob / number box steps itself with the arrow keys: it keeps
  // them (the Deck's strips, the Hub's knobs); Page Up / Down still advance
  function stepper(t) {
    var role = t.getAttribute && t.getAttribute('role');
    return role === 'slider' || role === 'spinbutton' || (t.tagName === 'INPUT' && /^(range|number)$/i.test(t.type || ''));
  }
  function keyAction(e) {
    var m = map();
    for (var i = 0; i < ACTIONS.length; i++) {
      var k = m[ACTIONS[i]].key;
      if (k && ((k.code && k.code === e.code) || (!k.code && k.key && k.key === e.key))) return ACTIONS[i];
    }
    if (ptOn()) for (var a in PT) if (PT[a].indexOf(e.key) >= 0 || PT[a].indexOf(e.code) >= 0) return a;
    return null;
  }
  function onKeyDown(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (learning) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); learnOff('Learn cancelled'); return; }
      if (e.key === 'Tab' || e.key === 'Shift' || e.repeat) return;
      e.preventDefault(); e.stopPropagation();
      learnKey(e);
      return;
    }
    if (typing(e.target)) return;
    if (/^Arrow/.test(e.key) && e.target && e.target.tagName && stepper(e.target)) return;
    var a = keyAction(e);
    if (!a) return;
    e.preventDefault(); e.stopPropagation(); // a page turner must not also scroll or press a focused button
    if (picker(e.target) && e.target.blur) e.target.blur();
    if (e.repeat) return;
    fire(a, 'key');
  }

  // ---- LEARN (Settings): the next button, pedal, key or keyboard key ----
  var learning = null, learnT = 0;
  function learn(action) {
    if (ACTIONS.indexOf(action) < 0) return;
    if (learning && learning.action === action) { learnOff('Learn cancelled'); return; }
    learning = { action: action };
    clearTimeout(learnT); learnT = setTimeout(function () { learnOff('Learn timed out'); }, LEARN_MS);
    refreshPorts(); // a first Learn hears every port, not only the chosen keyboard
    paint();
  }
  function learnOff(msg) {
    if (!learning) return;
    learning = null; clearTimeout(learnT);
    refreshPorts();
    if (msg && App.toast) App.toast(msg);
    paint();
  }
  // the first PRESS: a CC at 64 or more (not bank select or channel mode),
  // a Program Change, or a note-on. Clock, SysEx, bend and pressure are
  // not buttons. Claimed, so learning never also plays or advances.
  function learnMidi(bytes, src) {
    var t = bytes[0] & 0xf0, ch = bytes[0] & 15, b = null;
    if (t === 0xb0 && bytes[2] >= 64 && bytes[1] !== 0 && bytes[1] !== 32 && bytes[1] < 120) b = { t: 'cc', n: bytes[1] };
    else if (t === 0xc0) b = { t: 'pc', n: bytes[1] };
    else if (t === 0x90 && bytes[2] > 0) b = { t: 'note', n: bytes[1] };
    if (!b) return false; // releases, knobs below the middle, the sustain pedal letting go: they carry on as usual
    b.ch = null; b.port = (src && src.port) || ''; // any channel: a synth may send it on the Part's channel; the port tells devices apart
    var a = learning.action, m = map();
    ACTIONS.forEach(function (x) { if (x !== a && m[x].midi && m[x].midi.t === b.t && m[x].midi.n === b.n) m[x].midi = null; });
    m[a].midi = cleanMidi(b);
    if (b.t === 'note') notesHeld[(src && src.portId) + ':' + ch + ':' + b.n] = true;
    if (b.t === 'cc') ccLast[(src && src.portId) + ':' + ch + ':' + b.n] = { v: bytes[2], t: Date.now() };
    lastFire[a] = Date.now(); // the learning press does not also fire
    learning = null; clearTimeout(learnT);
    saveMap(m);
    if (App.toast) App.toast(NAMES[a] + ' = ' + midiLabel(m[a].midi) + (b.n === 64 && b.t === 'cc' ? ' — the app will not sustain with it' : ''));
    return true;
  }
  function learnKey(e) {
    var a = learning.action, m = map(), k = { code: e.code || '', key: e.key || '' };
    ACTIONS.forEach(function (x) { if (x !== a && m[x].key && ((k.code && m[x].key.code === k.code) || (!k.code && m[x].key.key === k.key))) m[x].key = null; });
    m[a].key = cleanKey(k);
    learning = null; clearTimeout(learnT);
    saveMap(m);
    if (App.toast) App.toast(NAMES[a] + ' = ' + keyLabel(m[a].key).replace('Key: ', '') + (k.key === ' ' || k.key === 'Enter' ? ' (it may also press a focused button)' : ''));
  }
  function clear(action) {
    var m = map(); if (!m[action]) return;
    m[action] = { midi: null, key: null };
    saveMap(m);
  }
  function setLatch(action, on) {
    var m = map(); if (!m[action] || !m[action].midi || m[action].midi.t !== 'cc') return;
    m[action].midi.latch = !!on; saveMap(m);
  }

  // ---- the Settings card (mounted by js/settings.js) ----
  var host = null;
  function paint() {
    if (!host) return;
    var m = map(), mi = App.midi, h = '';
    var midiNote = !mi || !mi.supported ? 'No MIDI in this browser: a page-turner pedal (it types Page Down / Up) still works. MIDI pedals and buttons work in Chrome or Edge on a computer, the Android app, or a Web MIDI browser app on an iPad.'
      : !mi.ready ? 'MIDI is off: connect it in the MIDI keyboard card above to learn a pedal or a button. Keys and page turners work now.' : '';
    if (midiNote) h += '<p class="muted small rm-note">' + esc(midiNote) + '</p>';
    h += '<div class="rm-list" role="group" aria-label="Controller remote">';
    ACTIONS.forEach(function (a) {
      var txt = bindingText(a, m), lr = learning && learning.action === a;
      h += '<div class="rm-row" data-rm="' + a + '">' +
        '<span class="rm-name">' + NAMES[a] + '<small class="muted">' + esc(HINTS[a]) + '</small></span>' +
        '<span class="rm-what muted small">' + esc(lr ? 'Listening… press the pedal, button or key (Esc cancels)' : txt || 'Not set') + '</span>' +
        '<button type="button" class="btn sm' + (lr ? ' active' : '') + '" data-rmlearn="' + a + '" aria-pressed="' + !!lr + '">' + (lr ? 'Listening…' : 'Learn') + '</button>' +
        '<button type="button" class="btn sm" data-rmclear="' + a + '"' + (m[a].midi || m[a].key ? '' : ' hidden') + '>Clear</button>' +
        (m[a].midi && m[a].midi.t === 'cc' ? '<label class="rm-latch small muted"><input type="checkbox" data-rmlatch="' + a + '"' + (m[a].midi.latch ? ' checked' : '') + '> Latching button (every press switches on / off)</label>' : '') +
      '</div>';
    });
    h += '</div>' +
      '<label class="set-check"><input type="checkbox" id="rm-pt"' + (ptOn() ? ' checked' : '') + '><span>Page turner pedal<small>Page Down, Right or Down = Next; Page Up, Left or Up = Back. For a Bluetooth page turner; on a computer keyboard these keys then stop scrolling the page and changing lists (sliders keep their arrows).</small></span></label>' +
      '<label class="set-check"><input type="checkbox" id="rm-dbl"' + (g('dbl', false) ? ' checked' : '') + '><span>Double-tap the lowest key = Next<small>For a LUMI with no pedal: the leftmost key (it moves with the octave buttons) becomes the remote key on practice pages — it does not play or count as an answer there. Keys lessons have their own double-tap (start / stop).</small></span></label>' +
      '<details class="tips"><summary>Which buttons work?</summary><p class="muted small">Any button or pedal that sends MIDI: a foot switch on the synth (Yamaha MODX / MONTAGE: UTILITY › Settings › Controller › FS Assign set to a free CC number), the MODX Assign switches 1 / 2 (CC 86 / 87 — they also do what the Performance assigns them), a MIDI pedal box, or a key you never play (the top key of an 88). A Bluetooth page turner works as keys. Press Learn, then the button: it is ready at once, and it only advances — it never sustains, sounds or answers.</p></details>';
    host.innerHTML = h;
  }
  var flashT = 0;
  function flashRow(action) {
    if (!host) return;
    var r = host.querySelector('.rm-row[data-rm="' + action + '"]'); if (!r) return;
    r.classList.add('fired'); clearTimeout(flashT); flashT = setTimeout(function () { r.classList.remove('fired'); }, 700);
  }
  function mount(el) {
    host = el;
    if (!host) return;
    host.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.rmlearn) learn(b.dataset.rmlearn);
      else if (b.dataset.rmclear) { clear(b.dataset.rmclear); if (App.toast) App.toast(NAMES[b.dataset.rmclear] + ' cleared'); }
    });
    host.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'rm-pt') { set('pt', !!t.checked); App.emit('remote:map', {}); paint(); }
      else if (t.id === 'rm-dbl') { set('dbl', !!t.checked); App.emit('remote:map', {}); paint(); }
      else if (t.dataset.rmlatch) setLatch(t.dataset.rmlatch, t.checked);
    });
    paint();
  }

  App.injectCSS('remote',
    '#remote-hud{position:fixed;left:16px;right:16px;margin:0 auto;width:fit-content;top:38%;transform:translateY(-50%) scale(.96);z-index:450;pointer-events:none;display:flex;align-items:center;gap:10px;' +
      'padding:14px 26px;border-radius:999px;background:var(--card);border:2px solid var(--accent);color:var(--text);box-shadow:0 12px 40px rgba(0,0,0,.45);' +
      'font:400 clamp(22px,6.4vw,30px)/1.15 var(--font-display,inherit);letter-spacing:.04em;opacity:0;transition:opacity .18s ease,transform .18s ease;max-width:calc(100vw - 32px);box-sizing:border-box}' +
    '#remote-hud.show{opacity:1;transform:translateY(-50%) scale(1)}#remote-hud .ic{color:var(--accent-ink);flex:0 0 auto}#remote-hud span{overflow-wrap:anywhere;text-align:center;max-height:2.4em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}@media (max-width:520px){#remote-hud{border-radius:22px;padding:12px 20px}}' +
    '.rm-list{display:grid;gap:8px;margin:10px 0 12px}' +
    '.rm-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px 8px;align-items:center;padding:8px 10px;border:1px solid var(--line);border-radius:10px;transition:border-color .2s,background .2s}' +
    '.rm-row.fired{border-color:var(--accent-line);background:var(--accent-soft)}' +
    '.rm-name{display:flex;flex-direction:column;font-weight:600}.rm-name small{font-weight:400;font-size:11.5px}' +
    '.rm-what{grid-column:1/-1;grid-row:2;overflow-wrap:anywhere}.rm-row .btn{min-height:var(--h-ctl,40px)}.rm-row .btn[hidden]{display:none}' +
    '.rm-latch{grid-column:1/-1;display:flex;gap:6px;align-items:center}.rm-note{margin:6px 0 0}');

  // the claim also hears ports that are not the chosen input, but only while
  // something is bound there to hear
  function wantsPorts() { var m = map(); return !!learning || g('dbl', false) === true || ACTIONS.some(function (a) { return !!m[a].midi; }); }
  if (App.midi && App.midi.setInputClaim) App.midi.setInputClaim(claim, { allPorts: wantsPorts });
  function refreshPorts() { if (App.midi && App.midi.refreshClaim) App.midi.refreshClaim(); }
  App.on('remote:map', refreshPorts);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('visibilitychange', function () { if (document.hidden) learnOff(); });
  App.on('midi:state', function () { paint(); });

  // ---- ONE WINDOW ACTS ON A PEDAL (soundLAB + soundLAB Gear side by side) ----
  // Both apps claim a bound MIDI message (claim() above is the same in both),
  // so it never reaches Thru, the Deck or the Live page's foot switch as
  // data. Without a rule one press would move the lesson on AND step the
  // Live set (Bank Select + Program Change to the synth). The rule: the pedal
  // belongs to soundLAB while a soundLAB window is visible; Gear answers it
  // when none is. A Web Lock (LOCK) says which:
  //  - soundLAB holds it in SHARED mode while its document is visible: asked
  //    at load and on every return to visible, let go when hidden. fire() is
  //    the same as ever there: visible = it acts, focused or not (it has to
  //    keep answering while another program has the focus). Two soundLAB
  //    windows share the lock and both act, as before.
  //  - Gear never takes it: per MIDI press it ASKS whether the lock is held
  //    (locks.query()) and acts when it is not = no soundLAB window is
  //    visible. So every visible Gear window acts, as every visible soundLAB
  //    window does (taking the lock, even for an instant, made two Gear
  //    windows shut each other out). Keys (a page turner types into the
  //    focused window only) and direct calls stay synchronous.
  //  - no Web Locks, or the question is refused (the claude.ai viewer frame):
  //    Gear acts on a MIDI press only while it has the focus.
  // Nothing is stored; a window that closes frees its lock.
  function lockApi() { try { var l = navigator.locks; return l && typeof l.request === 'function' ? l : null; } catch (e) { return null; } }
  function focused() { try { return !!document.hasFocus(); } catch (e) { return false; } }

  // soundLAB: hold = the request this window made last, {held, free} —
  // free() ends the promise that keeps the lock
  var hold = null;
  function holdMain() {
    if (GEAR || hold || document.hidden) return;
    var api = lockApi(); if (!api) return;
    var h = hold = { held: false, free: null }, p = null;
    function over() { if (hold === h) hold = null; }
    try {
      p = api.request(LOCK, { mode: 'shared' }, function () {
        // hidden again while the request waited: never hold it there
        if (hold !== h || document.hidden) { over(); return; }
        h.held = true;
        return new Promise(function (free) { h.free = free; });
      });
    } catch (e) { over(); return; }
    if (p && typeof p.then === 'function') p.then(over, over); else over(); // refused, or the lock is gone: the next return to visible asks again
  }
  function dropMain() {
    var h = hold; if (!h) return;
    hold = null; // a request still waiting finds this and lets the lock go at once
    if (h.free) h.free();
  }
  if (!GEAR) {
    holdMain();
    document.addEventListener('visibilitychange', function () { if (document.hidden) dropMain(); else holdMain(); });
    // a page kept for Back / Forward is nobody's window: no lock there either
    window.addEventListener('pagehide', dropMain);
    window.addEventListener('pageshow', holdMain);
  }

  // Gear: ONE question to the lock at a time. turn = the presses waiting for
  // its answer {t, list} — two bound presses in one MIDI packet take the
  // same answer and both act, in order. go() acts, no() puts the debounce
  // back. A turn older than LOCK_MS never got its answer: the next press
  // asks again instead of waiting with it.
  var turn = null;
  function gearTurn(go, no) {
    var t = Date.now(), press = { go: go, no: no, t: t };
    if (turn && t - turn.t < LOCK_MS) { turn.list.push(press); return; }
    var mine = turn = { t: t, list: [press] }, api = lockApi(), p = null;
    function answer(yes) {
      var list = mine.list; if (!list) return; // answered once
      yes = yes && !document.hidden; // hidden since the press: not this window's to take
      while (list.length) {
        var x = list.shift();
        // never a press from long ago (an answer that hung); an error in one
        // press must not keep the lock or stop the next
        try { (yes && Date.now() - x.t < LOCK_MS ? x.go : x.no)(); } catch (e) { console.error('remote', e); }
      }
      mine.list = null;
      if (turn === mine) turn = null;
    }
    function byFocus() { answer(focused()); }
    // held = a visible soundLAB window has it (nothing else ever takes it)
    function free(s) { return !((s && s.held) || []).some(function (l) { return !!l && l.name === LOCK; }); }
    if (!api || typeof api.query !== 'function') { byFocus(); return; }
    try { p = api.query(); } catch (e) { byFocus(); return; }
    if (p && typeof p.then === 'function') p.then(function (s) { answer(free(s)); }, byFocus); else byFocus();
  }

  App.remote = {
    ACTIONS: ACTIONS, NAMES: NAMES,
    get map() { return map(); },
    get learning() { return learning ? learning.action : null; },
    learn: learn, cancelLearn: function () { learnOff(); }, clear: clear, setLatch: setLatch,
    setPageTurner: function (on) { set('pt', !!on); App.emit('remote:map', {}); paint(); },
    setDoubleTap: function (on) { set('dbl', !!on); App.emit('remote:map', {}); paint(); },
    get pageTurner() { return ptOn(); }, get doubleTap() { return g('dbl', false) === true; },
    bindingText: bindingText,
    // what the Lights & help sheet and page hints say: '' when nothing is set
    summary: function () { var m = map(), out = []; ACTIONS.forEach(function (a) { var t = bindingText(a, m); if (t) out.push(NAMES[a] + ': ' + t); }); return out.join(' · '); },
    fire: fire, // (action, via) — tests and on-screen equivalents. In Gear a MIDI via (cc / pc / note / dbltap) answers null and acts a task later
    // does this document hold the shared lock (a visible soundLAB window)? Always false in Gear
    get holdsMain() { return !!(hold && hold.held); },
    mount: mount, paint: paint,
    claim: claim, // the midi.js claim fn (tests)
    // is this message one of the remote's bound gestures? For a page that
    // reads a port itself (App.midi.subscribeInput bypasses the claim)
    owns: function (bytes, src) {
      if (!bytes || bytes.length < 2) return false;
      var m = map();
      return ACTIONS.some(function (a) { return !!m[a].midi && matches(m[a].midi, bytes, src || {}); });
    }
  };
})();
