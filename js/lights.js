/* soundLAB LIGHTS & HELP — the control center (an overlay sheet, the
 * keyboard icon at the top of every page). The LUMI Display master is in
 * the treble-clef menu; this sheet provides:
 *   - the HELP LEVEL (App.help: Full / Colors / Target / Tonic / None) — the
 *     practice difficulty shared by the Keys page, scale lessons, Exercises
 *     answer lights and the keyboard's own lights
 *   - LIGHT APPEARANCE (App.midi keybed engine): the two
 *     LUMI colors (home key + scale), brightness, keyboard type, the range it
 *     is playing (follows its octave buttons), a light test
 *   - NOTE COLORS by Interval (scale degree) | Note (pitch class) — the
 *     App.colors mode the Fretboard editor sets too; the LUMI color row
 *     shows the palette in use
 * Everything here is the same setting the pages read — change it anywhere,
 * it changes everywhere.
 */
(function () {
  'use strict';

  var root = null, btMsg = '';
  var DESC = [
    'A bare keyboard: play from memory. Nothing lights up.',
    'Plain keys with the home key marked. Nothing else.',
    'Plain keys. Only the note to play now lights up, plus the answer after an Exercises question.',
    'The scale in color and the next note. No note names or finger numbers.',
    'The scale in color, note names, finger numbers and the next note.'
  ];

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function M() { return App.midi; }

  // the swatches the color row shows: 7 degree colors (R, 2..7) by interval,
  // 12 note colors (C..B) by note — App.colors, same as every page
  var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function swatches() {
    if (App.colors.mode() === 'note') {
      return App.colors.notes().map(function (col, i) { return { col: col, lab: NOTE_NAMES[i], title: NOTE_NAMES[i] }; });
    }
    return App.colors.degrees().map(function (col, i) { return { col: col, lab: i ? String(i + 1) : 'R', title: 'Degree ' + (i + 1) }; });
  }

  // "Color notes by" Interval | Note (the shared App.colors mode)
  function colModeRow() {
    var cm = App.colors.mode();
    return '<div class="lc-row"><span class="lc-lab">Color notes by</span><div class="seg" role="group" aria-label="Color notes by">' +
      [['interval', 'Interval'], ['note', 'Note']].map(function (o) {
        var on = o[0] === cm;
        return '<button type="button" data-lccolmode="' + o[0] + '" class="' + (on ? 'active' : '') + '" aria-pressed="' + on + '">' + o[1] + '</button>';
      }).join('') + '</div></div>';
  }

  function status() {
    var m = M();
    if (window.SL_ARTIFACT) return { kind: 'none', text: 'MIDI keyboards don’t work inside claude.ai. Open soundLAB in Chrome to use yours.' };
    if (!m || !m.supported) {
      return { kind: 'none', text: window.GuitarLabHost
        ? 'This version of the Android app can’t reach MIDI keyboards. Install the new one (the update banner offers it), or open soundLAB in Chrome.'
        : 'This browser can’t reach MIDI keyboards. Chrome or Edge can.' };
    }
    if (!m.ready) return { kind: 'connect', text: 'No keyboard connected.' };
    var display = m.displayState;
    if (display && display.configured && !display.connected) return { kind: 'noout', text: display.reason };
    if (!m.hasOutput && !(display && display.connected)) return { kind: 'noout', text: m.inputId != null ? 'Your keyboard plays the app; pick its output in Settings › MIDI to light its keys.' : 'Plug in your keyboard, or pick it in Settings › MIDI.' };
    var r = m.range();
    return { kind: 'ok', text: (m.lumi ? 'ROLI LUMI' : esc(m.outputName || 'LED keyboard')) + ' · playing ' +
      Theory.midiName(r.lo, false) + '–' + Theory.midiName(r.hi, false) };
  }

  function paint() {
    if (!root) return;
    var h = App.help.level(), m = M(), st = status(), on = m && m.lightsOn, lumi = m && m.lumi;
    var bright = parseInt(App.store.get('lights.bright', 80), 10) || 80;
    var lumiPref = App.store.get('midi.lumi', null);
    var octHand = App.store.get('lights.octHand', true) !== false;
    var lumiRows = st.kind === 'ok' && lumi, byNote = App.colors.mode() === 'note';
    var disp = m && m.display;
    root.innerHTML =
      '<div class="lc-sec">' +
        '<h3>Help level</h3>' +
        '<div class="seg lc-help" role="group" aria-label="Help level">' +
          App.help.NAMES.map(function (n, i) { return '<button type="button" data-lchelp="' + i + '" class="' + (i === h ? 'active' : '') + '" aria-pressed="' + (i === h) + '">' + n + '</button>'; }).reverse().join('') +
        '</div>' +
        '<p class="lc-desc">' + DESC[h] + '</p>' +
        '<p class="muted small">The same setting on the Keys page, in Scale lessons, in Exercises and on your keyboard’s lights. Less help is harder.</p>' +
        // with a LUMI the color seg sits by its color row (below)
        (lumiRows ? '' : colModeRow() +
          '<p class="muted small">Interval: each scale degree has its color. Note: each note has its own color in every key.</p>') +
      '</div>' +
      '<div class="lc-sec">' +
        '<h3>Keyboard lights</h3>' +
        '<p class="lc-status ' + st.kind + '">' + st.text + '</p>' +
        (st.kind === 'connect' ? '<button type="button" class="btn sm primary" id="lc-connect">Connect keyboard</button>' : '') +
        (m && m.native && st.kind !== 'none' ? '<div class="lc-acts"><button type="button" class="btn sm" id="lc-bt">Find a Bluetooth keyboard</button></div>' : '') +
        (btMsg ? '<p class="muted small" role="status">' + esc(btMsg) + '</p>' : '') +
        (st.kind === 'noout' ? '<button type="button" class="btn sm" id="lc-settings">Settings › MIDI</button>' : '') +
        (st.kind === 'ok' ?
          (lumi ? '<p class="muted small">LUMI Display has one master switch in the treble-clef menu. Brightness and color settings below change its appearance.</p>' : '<div class="lc-row"><span class="lc-lab">Other key lights</span><div class="seg" role="group" aria-label="Other keyboard lights">' +
            '<button type="button" data-lcon="1" class="' + (on ? 'active' : '') + '">On</button><button type="button" data-lcon="0" class="' + (!on ? 'active' : '') + '">Off</button></div></div>') +
          (lumi ?
            colModeRow() +
            '<div class="lc-row"><span class="lc-lab">Colors</span><span class="lc-degs' + (byNote ? ' lc-notes' : '') + '" aria-label="' + (byNote ? 'Note' : 'Scale degree') + ' colors on screen and on the LUMI">' +
              swatches().map(function (s) {
                return '<span class="lc-deg" title="' + s.title + '"><i style="background:' + s.col + '"></i><i style="background:' + m.lumiColor(s.col) + '"></i><b>' + s.lab + '</b></span>';
              }).join('') + '</span></div>' +
            '<p class="muted small">' + (byNote
              ? 'Every scale key lights in its note color, with the same mapped screen/program color (top: screen, bottom: emitted color); keys outside the scale stay dark.'
              : 'Every key lights in its scale-degree color, with the same mapped screen/program color (top: screen, bottom: emitted color).') +
              ' Active notes keep their shared pitch color; target focus uses timing and highlights.' +
              ' Answer feedback uses labels and highlights while retaining pitch identity. Edit natural-note colors in the Fretboard settings.</p>' +
            '<div class="lc-row"><label class="lc-lab" for="lc-bright">Brightness</label><input type="range" id="lc-bright" min="10" max="100" step="5" value="' + bright + '"><span class="lc-val" id="lc-brightv">' + bright + '%</span></div>' +
            '<div class="lc-row"><span class="lc-lab">Octave keys</span><div class="seg" role="group" aria-label="What the LUMI octave buttons do">' +
              '<button type="button" data-lcoct="1" class="' + (octHand ? 'active' : '') + '">Switch hands</button><button type="button" data-lcoct="0" class="' + (!octHand ? 'active' : '') + '">Octave only</button></div></div>' +
            '<p class="muted small">Press octave down below C3 for the left-hand view, back up for the right hand. The keys still play as normal. The switch happens on the first note you play after pressing.</p>' +
            '<div class="lc-row"><span class="lc-lab">Guide focus</span><div class="seg" role="group" aria-label="Legacy guide focus style">' +
              '<button type="button" data-lcdisp="1" class="' + (disp ? 'active' : '') + '" aria-pressed="' + !!disp + '">On</button><button type="button" data-lcdisp="0" class="' + (!disp ? 'active' : '') + '" aria-pressed="' + !disp + '">Off</button></div></div>' +
            '<p class="muted small">' + (disp
              ? 'Legacy guides focus the target; the next target blinks.'
              : 'Legacy guides keep the scale alongside the target.') +
              ' Pitch colors always follow Intervals or Note Names in the clef menu. Its LUMI Display master controls illumination and prioritizes active targets; brightness does not affect sound.</p>' +
            (m.sysexOk ? '' : '<p class="lc-warn">Brightness and the dark background need the MIDI permission the browser blocked (SysEx); colors still work. Reload and allow the MIDI prompt.</p>')
            : '<p class="muted small">Your keyboard lights the scale keys (home key brightest) and the keys to play.</p>') +
          '<div class="lc-row"><span class="lc-lab">Keyboard</span><div class="seg" role="group" aria-label="Keyboard type">' +
            [['', 'Auto'], ['1', 'LUMI'], ['0', 'Other']].map(function (o) {
              var act = (o[0] === '' && lumiPref == null) || (o[0] === '1' && lumiPref === true) || (o[0] === '0' && lumiPref === false);
              return '<button type="button" data-lctype="' + o[0] + '" class="' + (act ? 'active' : '') + '">' + o[1] + '</button>';
            }).join('') + '</div></div>' +
          '<div class="lc-acts"><button type="button" class="btn sm" id="lc-test"' + (lumi && m.displayEnabled === false ? ' disabled' : '') + '>Test lights</button><button type="button" class="btn sm" id="lc-resend">Re-send</button></div>'
          : '') +
      '</div>' +
      // the controller remote (js/remote.js): what is set, and the way to set it
      '<div class="lc-sec"><h3>Hands-free</h3>' +
        '<p class="muted small">' + (App.remote && App.remote.summary() ? escH(App.remote.summary()) : 'Move practice on from a pedal, a synth button or a page turner (Next / Back / Stop).') + '</p>' +
        '<div class="lc-acts"><button type="button" class="btn sm" id="lc-remote">Set up</button></div>' +
      '</div>';
  }
  function escH(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function onClick(e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    var a, m = M();
    if (b.id === 'lc-remote') { // Settings › Hands-free control
      App.closeSheet(); App.switchTo('settings');
      setTimeout(function () { var c = document.getElementById('set-remote-card'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'start' }); }, 60);
      return;
    }
    if ((a = b.getAttribute('data-lchelp')) != null) { App.help.set(+a); return; }
    if ((a = b.getAttribute('data-lcon')) != null) { if (m) m.setLightsOn(a === '1'); paint(); return; }
    if ((a = b.getAttribute('data-lcdisp')) != null) { if (m) m.setDisplay(a === '1'); paint(); return; }
    if ((a = b.getAttribute('data-lcoct')) != null) { App.store.set('lights.octHand', a === '1'); paint(); return; }
    if ((a = b.getAttribute('data-lccolmode')) != null) { App.colors.setMode(a); paint(); return; } // 'colors' repaints the pages + keybed
    if ((a = b.getAttribute('data-lctype')) != null) {
      App.store.set('midi.lumi', a === '' ? null : a === '1');
      if (m) m.repaint();
      paint();
      return;
    }
    switch (b.id) {
      case 'lc-connect': if (m) m.enable().then(paint, paint); break;
      case 'lc-settings': App.switchTo('settings'); break;
      case 'lc-test': if (m) m.test(); break;
      case 'lc-bt': if (m) { if (!m.ready) m.enable(); m.bluetooth(); btMsg = 'Looking for Bluetooth MIDI keyboards…'; paint(); } break;
      case 'lc-resend': if (m) m.repaint(); break;
    }
  }

  function onInput(e) {
    var t = e.target, m = M();
    if (t.id === 'lc-bright') {
      App.store.set('lights.bright', +t.value);
      var v = document.getElementById('lc-brightv');
      if (v) v.textContent = t.value + '%';
      clearTimeout(onInput.t);
      onInput.t = setTimeout(function () { if (m) m.repaint(); }, 120);
    }
  }

  App.register('lights', {
    init: function (el) {
      root = el;
      App.injectCSS('lights',
        '.lc-sec{display:grid;gap:10px;padding:4px 0 16px}.lc-sec+.lc-sec{border-top:1px solid var(--line);padding-top:16px}' +
        '.lc-sec h3{margin:0;font:600 11.5px/1.3 var(--font-body);letter-spacing:1.6px;text-transform:uppercase;color:var(--muted)}' +
        '.lc-sec>.btn{justify-self:start}' +
        '.lc-help{display:flex;width:100%}.lc-help button{flex:1;min-width:0}' +
        '.lc-desc{margin:0;font-size:14.5px}.lc-sec p{margin:0}' +
        '.lc-status{font-weight:600;font-size:14.5px}.lc-status.none,.lc-status.noout{font-weight:500;color:var(--muted)}' +
        '.lc-row{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap}.lc-lab{min-width:84px;font-size:13.5px;color:var(--muted);font-weight:600}' +
        '.lc-degs{display:flex;gap:6px;flex-wrap:wrap}.lc-deg{display:grid;justify-items:center;gap:2px}.lc-deg i{display:block;width:26px;height:12px;border-radius:3px}' +
        '.lc-deg i+i{border-radius:3px}.lc-deg b{font-size:11px;color:var(--muted);font-weight:600}' +
        '.lc-notes{gap:5px}.lc-notes .lc-deg i{width:21px}' + // 12 note colors fit one row on a phone

        '#lc-bright{flex:1;min-width:120px}.lc-val{font-variant-numeric:tabular-nums;font-size:13px;min-width:3em}' +
        '.lc-chk{display:flex;gap:8px;align-items:center;font-size:13.5px}' +
        '.lc-warn{font-size:13.5px;color:var(--warn)}.lc-acts{display:flex;gap:8px;flex-wrap:wrap}');
      el.addEventListener('click', onClick);
      el.addEventListener('input', onInput);
      el.addEventListener('change', onInput);
      ['help:level', 'midi:state', 'midi:range', 'colors', 'lights:display', 'lights:led', 'lights:master', 'remote:map'].forEach(function (ev) { App.on(ev, function () { if (App.sheet === 'lights') paint(); }); });
      App.on('midi:status', function (d) { btMsg = d && d.text || ''; if (App.sheet === 'lights') paint(); });
      paint();
    },
    onShow: paint
  });
})();
