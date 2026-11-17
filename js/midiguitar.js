/* soundLAB — MIDI GUITAR (App.midiGuitar, 2.0 beta / v2; docs/MIDI-GUITAR.md)
 *
 * A MIDI guitar that sends each string on its own MIDI channel, built for
 * the Rock Band 3 Squier Stratocaster (its 5-pin MIDI OUT, three AA
 * batteries, into an interface's MIDI IN such as the Steinberg UR24C).
 *
 * Its notes already reach every page as plain 'midi:note' (Exercises,
 * the Woodshed, Jam, the fretboard rings). This module adds what a guitar
 * knows and a keyboard does not:
 *   - WHICH STRING AND FRET: 'guitar:note' {on, string 1-6 (1 = high E),
 *     fret, midi, vel, chan, portId}; the fretboard rings light that one
 *     spot instead of every place the pitch lives.
 *   - FOUND BY ITSELF: one strum on a port that is not a known keyboard
 *     picks it (watchStrum); the string order follows the outer strings
 *     (autoLayout) until a pluck pins it.
 *   - FIX STRINGS by one pluck: the open low E string tells which end channel 1
 *     is (mg.layout 'hi1' = channel 1 is the high E, the guitar-synth
 *     custom; 'lo1' = channel 1 is the low E) and where the guitar's octave
 *     buttons are (mg.oct).
 *   - The mono-string handling (a re-strum without a Note Off, a string
 *     that stops ringing) lives in midi.js's ingress (guitarSrc), keyed by
 *     the chosen port, mg.port.
 * Stores mg.port ('' = no guitar), mg.auto (false = picked None by hand),
 * mg.layout, mg.set ('auto' | 'pluck'), mg.oct, mg.ring (seconds).
 * Nothing here sends MIDI or asks for a permission.
 */
(function () {
  'use strict';

  // standard tuning, string 1 (high E) .. string 6 (low E); the Squier
  // reads the frets, not the pitch, so its notes are always this tuning
  var OPEN = [64, 59, 55, 50, 45, 40];
  var MAX_FRET = 24; // the Squier has 22; leave room for other guitars
  var NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var STRING_NAMES = ['high E', 'B', 'G', 'D', 'A', 'low E'];

  function g(k, d) { return App.store.get('mg.' + k, d); }
  function s(k, v) { App.store.set('mg.' + k, v); }
  function port() { return String(g('port', '') || ''); }
  function layout() { return g('layout', 'hi1') === 'lo1' ? 'lo1' : 'hi1'; }
  function oct() { var o = Math.round(Number(g('oct', 0))); return isFinite(o) ? Math.max(-3, Math.min(3, o)) : 0; }

  var held = {};        // string -> {fret, midi}
  var last = null;      // the last guitar:note on
  var setupWait = false;
  var setupT = 0;

  function stringOf(chan) { return layout() === 'hi1' ? chan + 1 : 6 - chan; }
  function position(chan, midi) {
    var st = stringOf(chan), fret = midi - (OPEN[st - 1] + 12 * oct());
    return { string: st, fret: fret, valid: fret >= 0 && fret <= MAX_FRET };
  }
  function fromGuitar(d) {
    return !!d && !d.silent && !!port() && Number.isInteger(d.chan) && d.chan >= 0 && d.chan <= 5 && String(d.port || '') === port();
  }
  function noteName(m) { return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }

  // the one-pluck set up: the open low E string, no fingers on the neck
  function setupFrom(d) {
    var lay = d.chan === 5 ? 'hi1' : d.chan === 0 ? 'lo1' : null;
    if (!lay) {
      done('That came from string channel ' + (d.chan + 1) + '. Pluck the THICKEST string with no fingers on the neck.', false);
      return;
    }
    s('layout', lay); s('set', 'pluck');
    s('oct', Math.max(-3, Math.min(3, Math.round((d.midi - 40) / 12))));
    done('Set up. Channel 1 is the ' + (lay === 'hi1' ? 'high E' : 'low E') + ' string' +
      (oct() ? ', octave buttons at ' + (oct() > 0 ? '+' : '') + oct() : '') + '.', true);
  }
  function done(msg, ok) {
    setupWait = !ok && setupWait;
    if (ok) { setupWait = false; clearTimeout(setupT); }
    App.emit('guitar:setup', { ok: !!ok, msg: msg, waiting: setupWait });
    paint(msg);
  }
  function startSetup() {
    if (!port()) { paint('Strum the guitar once first.'); return false; }
    setupWait = true; clearTimeout(setupT);
    setupT = setTimeout(function () { if (setupWait) { setupWait = false; paint('No note came in. Check the cable and the batteries, then press Set up again.'); App.emit('guitar:setup', { ok: false, waiting: false }); } }, 20000);
    App.emit('guitar:setup', { ok: false, waiting: true });
    paint();
    return true;
  }

  // FOUND BY ITSELF: with no guitar chosen (and not turned off by hand,
  // mg.auto false), a strum = notes on 3+ of channels 1-6 within 1.5 s
  // from one port that is not a keyboard soundLAB knows (LUMI, ROLI, a
  // synth that sounds itself) picks that port. A keyboard plays on one
  // channel; an MPE keyboard is ruled out by name or by channels above 6.
  var KEYBOARD_RE = /lumi|roli|seaboard|lightpad|block|linnstrument|osmose|continuum|keys/i;
  var strum = {}; // port -> {t, chans, wide}
  function watchStrum(d) {
    if (!d || !d.on || d.silent || port() || g('auto', true) === false || !Number.isInteger(d.chan)) return;
    var name = String(d.port || '');
    if (!name || KEYBOARD_RE.test(name) || (App.midi && App.midi.selfSounding && App.midi.selfSounding(name))) return;
    var now = Date.now(), w = strum[name];
    if (!w || now - w.t > 1500) w = strum[name] = { t: now, chans: {}, wide: false };
    if (d.chan > 5) w.wide = true; else w.chans[d.chan] = true;
    if (!w.wide && Object.keys(w.chans).length >= 3) {
      strum = {};
      s('port', name); held = {}; last = null;
      App.emit('guitar:port', { port: name, auto: true });
      if (App.toast) App.toast('MIDI guitar found on ' + name);
      paint('Found your guitar on ' + name + '. Play away.');
    }
  }
  // STRING ORDER BY ITSELF (until a Set up pluck pins it, mg.set 'pluck'):
  // with the octave buttons in the middle the two outer strings cannot be
  // mixed up - channel 1 plays 64 and up as the high E, 62 and down as the
  // low E (and channel 6 the other way round)
  function autoLayout(d) {
    if (g('set', '') === 'pluck' || oct() !== 0 || (d.chan !== 0 && d.chan !== 5)) return;
    var hi = d.chan === 0 ? d.midi >= 64 : d.midi <= 62;
    var lay = hi ? 'hi1' : 'lo1';
    if (lay !== layout()) { s('layout', lay); held = {}; }
    s('set', 'auto');
  }

  App.on('midi:note', function (d) {
    watchStrum(d);
    if (!fromGuitar(d)) return;
    if (d.on && !setupWait) autoLayout(d);
    if (d.on && setupWait) setupFrom(d);
    var p = position(d.chan, d.midi);
    if (d.on) {
      held[p.string] = { fret: p.fret, midi: d.midi };
      last = { string: p.string, fret: p.fret, midi: d.midi, valid: p.valid };
    } else if (held[p.string] && held[p.string].midi === d.midi) delete held[p.string];
    App.emit('guitar:note', { on: !!d.on, string: p.string, fret: p.fret, valid: p.valid, midi: d.midi, vel: d.vel, chan: d.chan, portId: d.portId });
    if (d.on) paint();
  });
  // a port change or a reconnect: forget what was held
  App.on('midi:state', function () { held = {}; paint(); });

  // ---- the Settings card (mounted by js/settings.js into #set-guitar) ----
  var host = null;
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lastText() {
    if (!last) return 'Nothing played yet.';
    return 'Last note: string ' + last.string + ' (' + STRING_NAMES[last.string - 1] + '), ' +
      (last.valid ? (last.fret === 0 ? 'open' : 'fret ' + last.fret) : 'off the neck - press Set up') + ' = ' + noteName(last.midi);
  }
  function portSelect(cur, ports) {
    var h = '<label class="field">Guitar comes in on<select id="mg-port"><option value="">No MIDI guitar</option>', listed = false;
    ports.forEach(function (p) { if (p.name === cur) listed = true; h += '<option value="' + esc(p.name) + '"' + (p.name === cur ? ' selected' : '') + '>' + esc(p.name) + '</option>'; });
    if (cur && !listed) h += '<option value="' + esc(cur) + '" selected>' + esc(cur) + ' (not plugged in)</option>';
    return h + '</select></label>';
  }
  function paint(msg) {
    if (!host) return;
    var mi = App.midi, ports = mi && mi.ready ? mi.inputs : [], cur = port(), h = '';
    h += '<div class="set-sub">MIDI guitar</div>';
    if (!cur) {
      h += '<p class="muted small mg-line">' + esc(msg || 'Strum your MIDI guitar once: soundLAB finds it by itself.') + '</p>' +
        '<details class="tips"><summary>Pick it by hand or hook it up</summary>' +
        '<div class="row tight">' + portSelect(cur, ports) + '</div>' +
        '<ol class="muted small">' +
        '<li>Put 3 AA batteries in the back of the guitar.</li>' +
        '<li>Run a 5-pin MIDI cable from the guitar&rsquo;s MIDI OUT to MIDI IN on the back of the UR24C.</li>' +
        '<li>Close FL Studio (it holds the MIDI ports).</li>' +
        '<li>Strum once.</li></ol></details>';
      host.innerHTML = h; return;
    }
    var heard = !mi || !mi.ready || mi.inputId === 'all' || mi.inputsHeard.some(function (p) { return p.name === cur; });
    if (!heard) h += '<p class="small set-ain-hint">soundLAB is not listening to ' + esc(cur) + '. Set Keyboard (above) to All keyboards.</p>';
    h += '<div class="row tight mg-row">' +
      '<span class="small" id="mg-msg" role="status">' + esc(setupWait ? 'Pluck the thickest string (low E) once, no fingers on the neck.' : (msg || lastText())) + '</span>' +
      '<button type="button" class="btn sm' + (setupWait ? ' active' : '') + '" id="mg-setup" aria-pressed="' + setupWait + '">' + (setupWait ? 'Listening…' : 'Fix strings') + '</button>' +
      '</div>' +
      '<details class="tips"><summary>Guitar options</summary>' +
      '<div class="row tight">' + portSelect(cur, ports) +
      '<label class="field">Notes let go after<select id="mg-ring">';
    [[2, '2 seconds'], [3, '3 seconds'], [5, '5 seconds'], [0, 'I move my finger']].forEach(function (o) {
      h += '<option value="' + o[0] + '"' + (Number(g('ring', 3)) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    });
    h += '</select></label></div>' +
      '<label class="set-check"><input type="checkbox" id="mg-flip"' + (layout() === 'lo1' ? ' checked' : '') + '><span>Strings are upside down<small>soundLAB works this out as you play. If the neck still lights the wrong string, press Fix strings and pluck the low E.</small></span></label>' +
      '</details>';
    host.innerHTML = h;
  }
  function mount(el) {
    host = el; if (!host) return;
    host.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'mg-port') { s('port', t.value); s('auto', !!t.value); held = {}; last = null; App.emit('guitar:port', { port: t.value }); paint(); }
      else if (t.id === 'mg-ring') { s('ring', Number(t.value)); paint(); }
      else if (t.id === 'mg-flip') { s('layout', t.checked ? 'lo1' : 'hi1'); s('set', 'pluck'); paint('Channel 1 is now the ' + (t.checked ? 'low E' : 'high E') + ' string.'); }
    });
    host.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.id === 'mg-setup') { if (setupWait) { setupWait = false; clearTimeout(setupT); paint(); } else startSetup(); }
    });
    paint();
  }

  App.midiGuitar = {
    OPEN: OPEN.slice(),
    get port() { return port(); },
    get layout() { return layout(); },
    get oct() { return oct(); },
    get last() { return last; },
    get waiting() { return setupWait; },
    // string -> {fret, midi}: the spots the fretboard lights
    get held() { var out = {}; Object.keys(held).forEach(function (k) { out[k] = { fret: held[k].fret, midi: held[k].midi }; }); return out; },
    setPort: function (name) { s('port', String(name || '')); held = {}; last = null; App.emit('guitar:port', { port: port() }); paint(); },
    setLayout: function (l) { s('layout', l === 'lo1' ? 'lo1' : 'hi1'); s('set', 'pluck'); paint(); },
    setRing: function (sec) { s('ring', Number(sec) || 0); paint(); },
    setup: startSetup,
    position: position,
    isGuitar: function (d) { return fromGuitar(d); },
    mount: mount, paint: paint
  };
})();
