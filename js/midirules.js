/* soundLAB MIDI RULES (App.midiRules, 2.0 Phase A3a): the MIDI Hub's rule
 * engine and its input-filter install, as a shared file. The Rules EDITOR
 * stays on the Hub page (js/midihub.js); this is only the part every page
 * needs, so "Apply to what soundLAB hears (every page)" keeps working where
 * the Hub is not loaded.
 *
 *   apply(bytes, port) -> [bytes...]   one channel message through the stored
 *       rules (midihub.rules, read on every call): match type / channel /
 *       number range / source port (m.port, a substring of `port`), then
 *       block / convert / set channel / set number / add / value %. [] = the
 *       message is blocked; [bytes] = no rule touched it. Key splits are
 *       ordinary rules tagged split. `port` is the name of the port a Thru
 *       message came from; without it a rule for one keyboard never matches.
 *   install()   App.midi.setInputFilter(fn) while midihub.rulesIn is on, null
 *       while it is off (the ONE filter slot stays free). Runs at load, when
 *       the tab becomes visible and on a 'storage' event for midihub.rulesIn
 *       (the box was ticked in another window); the window that ticks the
 *       box calls it directly.
 *   active() -> { on, rules }   is the filter switched on, and how many
 *       enabled rules can change what the app hears (for a status line). A
 *       rule for one keyboard (m.port) is Thru's only and is not counted.
 * Bus: 'midirules:state' { on, rules } when the installed state changed.
 * Store: midihub.rules, midihub.rulesIn (the Hub writes them).
 * Loaded right after js/remote.js (needs App.midi.setInputFilter).
 */
(function () {
  'use strict';

  // a stored null (Reset Hub writes null) counts as absent: the fallback wins
  function g(k, d) { var v = App.store.get('midihub.' + k, d); return v === null ? d : v; }
  function rules() { var l = g('rules', null); return Object.prototype.toString.call(l) === '[object Array]' ? l : []; }
  function rulesIn() { return !!g('rulesIn', false); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // what a channel message is, for the rules: the Hub's decode() without the
  // monitor text. null = not a channel message, the rules leave it alone
  function classify(b) {
    var st = b[0], t = st >> 4, c = st & 15, d1 = b[1] || 0, d2 = b[2] || 0;
    switch (t) {
      case 8: return { kind: 'note', ch: c, num: d1, val: d2, on: false };
      case 9: return { kind: 'note', ch: c, num: d1, val: d2, on: d2 !== 0 };
      case 10: return { kind: 'pat', ch: c, num: d1, val: d2 };
      case 11: return { kind: 'cc', ch: c, num: d1, val: d2 };
      case 12: return { kind: 'pc', ch: c, num: d1, val: d1 };
      case 13: return { kind: 'at', ch: c, num: 0, val: d1 };
      case 14: return { kind: 'pb', ch: c, num: 0, val: (d1 | (d2 << 7)) - 8192 };
    }
    return null;
  }

  function matches(r, d) {
    var m = r.m;
    if (m.type !== 'any' && m.type !== d.kind && !(m.type === 'at' && d.kind === 'pat')) return false;
    if (m.ch && m.ch !== d.ch + 1) return false;
    if (m.port && String(d.port || '').toLowerCase().indexOf(String(m.port).toLowerCase()) < 0) return false; // 1.3: a rule for one keyboard only
    if (d.kind === 'note' || d.kind === 'cc' || d.kind === 'pc' || d.kind === 'pat') { if (d.num < m.lo || d.num > m.hi) return false; }
    return true;
  }
  function apply(bytes, port) {
    var list = rules();
    if (!list.length || bytes[0] >= 0xF0) return [bytes];
    var d = classify(bytes);
    if (!d) return [bytes];
    var kind = d.kind, c = d.ch, num = d.num, val = d.val, on = d.on, touched = false;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r.on || !matches(r, { kind: kind, ch: c, num: num, val: val, port: port })) continue;
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

  // ---- the input filter: what the app hears goes through the rules first ----
  // midi.js hands the filter one message and no port name, so a rule for one
  // keyboard (m.port) never applies to what the app hears, as it never did in
  // the Hub; a blocked message is dropped
  function filter(b) { var r = apply(b); return r.length ? r[0] : null; }
  var installed = false;
  // rules = the enabled ones the filter above can match (matches(): no port
  // name here, so a rule with m.port never does)
  function active() {
    return { on: rulesIn(), rules: rules().filter(function (r) { return !!(r && r.on && !(r.m && r.m.port)); }).length };
  }
  function install() {
    var m = App.midi;
    if (!m || !m.setInputFilter) return;
    var on = rulesIn();
    m.setInputFilter(on ? filter : null);
    if (on !== installed) { installed = on; App.emit('midirules:state', active()); }
  }

  App.midiRules = { apply: apply, install: install, active: active };

  install();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) install(); });
  // another window of this app ticked or cleared the box (or the store was
  // cleared: key null). Only this scope's key counts (App.store.prefix): the
  // 1.x app and the beta share the origin and keep the same switch under
  // their own prefix, and a write there is not this app's business
  window.addEventListener('storage', function (e) {
    var k = e ? e.key : null;
    if (k == null || k === App.store.prefix + 'midihub.rulesIn') install();
  });
})();
