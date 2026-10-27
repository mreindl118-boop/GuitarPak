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
 */
(function () {
  'use strict';

  var ACTIONS = ['next', 'back', 'stop'];
  var NAMES = { next: 'Next', back: 'Back', stop: 'Stop' };
  var HINTS = { next: 'start · show answer · next question · next level', back: 'retry · hear it again', stop: 'end the run' };
  var ICON = { next: 'right', back: 'left', stop: 'stop' };
  var NOTHING = { next: 'Nothing to move on here', back: 'Nothing to go back to here', stop: 'Nothing to stop here' };
  var NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var DBL_MS = 350, DEBOUNCE_MS = 250, LEARN_MS = 20000;

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
        var key = held, last = ccLast[key] == null ? 0 : ccLast[key], v = bytes[2];
        ccLast[key] = v;
        if (b.latch ? (v >= 64) !== (last >= 64) : (last < 64 && v >= 64)) fire(a, 'cc');
      } else if (b.t === 'pc') fire(a, 'pc');
      else if (on) { notesHeld[held] = true; fire(a, 'note'); }
      else if (off) return false; // not ours (the press went through before it was learned)
      return true;
    }
    // the reserved double-tap key (opt-in, pages that allow it)
    if ((on || off) && bytes[1] === ctrlKey() && dblActive() && (!lumiIn() || /lumi/i.test((src && src.port) || ''))) {
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
    var now = Date.now();
    if (now - (lastFire[action] || 0) < DEBOUNCE_MS) return null;
    lastFire[action] = now;
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
    var role = t.getAttribute && t.getAttribute('role');
    return t.tagName === 'SELECT' || t.tagName === 'INPUT' || role === 'slider' || role === 'spinbutton';
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
    if (!b) return t === 0xb0 && bytes[2] < 64 && bytes[1] !== 0 && bytes[1] !== 32; // a release before the press: swallow it too
    b.ch = ch; b.port = (src && src.port) || '';
    var a = learning.action, m = map();
    ACTIONS.forEach(function (x) { if (x !== a && m[x].midi && m[x].midi.t === b.t && m[x].midi.n === b.n && m[x].midi.ch === b.ch) m[x].midi = null; });
    m[a].midi = cleanMidi(b);
    if (b.t === 'note') notesHeld[(src && src.portId) + ':' + ch + ':' + b.n] = true;
    if (b.t === 'cc') ccLast[(src && src.portId) + ':' + ch + ':' + b.n] = bytes[2];
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
      '<label class="set-check"><input type="checkbox" id="rm-pt"' + (ptOn() ? ' checked' : '') + '><span>Page turner pedal<small>Page Down, Right or Down = Next; Page Up, Left or Up = Back. For a Bluetooth page turner; on a computer keyboard these keys stop scrolling the page.</small></span></label>' +
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
    '#remote-hud{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%) scale(.96);z-index:450;pointer-events:none;display:flex;align-items:center;gap:10px;' +
      'padding:14px 26px;border-radius:999px;background:var(--card);border:2px solid var(--accent);color:var(--text);box-shadow:0 12px 40px rgba(0,0,0,.45);' +
      'font:400 30px/1 var(--font-display,inherit);letter-spacing:.04em;opacity:0;transition:opacity .18s ease,transform .18s ease;max-width:calc(100vw - 32px)}' +
    '#remote-hud.show{opacity:1;transform:translate(-50%,-50%) scale(1)}#remote-hud .ic{color:var(--accent-ink);flex:0 0 auto}#remote-hud span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
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
    fire: fire, // (action, via) — tests and on-screen equivalents
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
