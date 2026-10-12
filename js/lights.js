/* soundLAB LIGHTS & HELP — the control center (an overlay sheet, the
 * keyboard icon at the top of every page). One place for:
 *   - the HELP LEVEL (App.help: Full / Colors / Target / Tonic / None) — the
 *     practice difficulty shared by the Keys page, scale lessons, Exercises
 *     answer lights and the keyboard's own lights
 *   - KEY LIGHTS on a MIDI keyboard (App.midi keybed engine): on/off, the two
 *     LUMI colors (home key + scale), brightness, keyboard type, the range it
 *     is playing (follows its octave buttons), a light test
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

  function palette() {
    var cols = App.store.get('fb.colors', null);
    return Array.isArray(cols) && cols.length === 7 ? cols : ['#ffab47', '#e8d44d', '#7ad97a', '#4cc9b0', '#6ea8fe', '#b48ef0', '#ff85b3'];
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
    if (!m.hasOutput) return { kind: 'noout', text: m.inputId != null ? 'Your keyboard plays the app; pick its output in Settings › MIDI to light its keys.' : 'Plug in your keyboard, or pick it in Settings › MIDI.' };
    var r = m.range();
    return { kind: 'ok', text: (m.lumi ? 'ROLI LUMI' : esc(m.outputName || 'LED keyboard')) + ' · playing ' +
      Theory.midiName(r.lo, false) + '–' + Theory.midiName(r.hi, false) };
  }

  function paint() {
    if (!root) return;
    var h = App.help.level(), m = M(), st = status(), on = m && m.lightsOn, lumi = m && m.lumi;
    var bright = parseInt(App.store.get('lights.bright', 80), 10) || 80;
    var lumiPref = App.store.get('midi.lumi', null);
    root.innerHTML =
      '<div class="lc-sec">' +
        '<h3>Help level</h3>' +
        '<div class="seg lc-help" role="group" aria-label="Help level">' +
          App.help.NAMES.map(function (n, i) { return '<button type="button" data-lchelp="' + i + '" class="' + (i === h ? 'active' : '') + '" aria-pressed="' + (i === h) + '">' + n + '</button>'; }).reverse().join('') +
        '</div>' +
        '<p class="lc-desc">' + DESC[h] + '</p>' +
        '<p class="muted small">The same setting on the Keys page, in Scale lessons, in Exercises and on your keyboard’s lights. Less help is harder.</p>' +
      '</div>' +
      '<div class="lc-sec">' +
        '<h3>Keyboard lights</h3>' +
        '<p class="lc-status ' + st.kind + '">' + st.text + '</p>' +
        (st.kind === 'connect' ? '<button type="button" class="btn sm primary" id="lc-connect">Connect keyboard</button>' : '') +
        (m && m.native && st.kind !== 'none' ? '<div class="lc-acts"><button type="button" class="btn sm" id="lc-bt">Find a Bluetooth keyboard</button></div>' : '') +
        (btMsg ? '<p class="muted small" role="status">' + esc(btMsg) + '</p>' : '') +
        (st.kind === 'noout' ? '<button type="button" class="btn sm" id="lc-settings">Settings › MIDI</button>' : '') +
        (st.kind === 'ok' ?
          '<div class="lc-row"><span class="lc-lab">Lights</span><div class="seg" role="group" aria-label="Key lights">' +
            '<button type="button" data-lcon="1" class="' + (on ? 'active' : '') + '">On</button><button type="button" data-lcon="0" class="' + (!on ? 'active' : '') + '">Off</button></div></div>' +
          (lumi ?
            '<div class="lc-row"><span class="lc-lab">Colors</span><span class="lc-degs" aria-label="Scale degree colors on screen and on the LUMI">' +
              palette().map(function (col, i) {
                return '<span class="lc-deg" title="Degree ' + (i + 1) + '"><i style="background:' + col + '"></i><i style="background:' + m.lumiColor(col) + '"></i><b>' + (i ? i + 1 : 'R') + '</b></span>';
              }).join('') + '</span></div>' +
            '<p class="muted small">Every key lights in its scale-degree color, like the screen (top: screen, bottom: the LUMI’s nearest color). The note to play glows white, answers green. Edit the colors in the Fretboard settings.</p>' +
            '<div class="lc-row"><label class="lc-lab" for="lc-bright">Brightness</label><input type="range" id="lc-bright" min="10" max="100" step="5" value="' + bright + '"><span class="lc-val" id="lc-brightv">' + bright + '%</span></div>' +
            (m.sysexOk ? '' : '<p class="lc-warn">Brightness and the dark background need the MIDI permission the browser blocked (SysEx); colors still work. Reload and allow the MIDI prompt.</p>')
            : '<p class="muted small">Your keyboard lights the scale keys (home key brightest) and the keys to play.</p>') +
          '<div class="lc-row"><span class="lc-lab">Keyboard</span><div class="seg" role="group" aria-label="Keyboard type">' +
            [['', 'Auto'], ['1', 'LUMI'], ['0', 'Other']].map(function (o) {
              var act = (o[0] === '' && lumiPref == null) || (o[0] === '1' && lumiPref === true) || (o[0] === '0' && lumiPref === false);
              return '<button type="button" data-lctype="' + o[0] + '" class="' + (act ? 'active' : '') + '">' + o[1] + '</button>';
            }).join('') + '</div></div>' +
          '<div class="lc-acts"><button type="button" class="btn sm" id="lc-test">Test lights</button><button type="button" class="btn sm" id="lc-resend">Re-send</button></div>'
          : '') +
      '</div>';
  }

  function onClick(e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    var a, m = M();
    if ((a = b.getAttribute('data-lchelp')) != null) { App.help.set(+a); return; }
    if ((a = b.getAttribute('data-lcon')) != null) { if (m) m.setLightsOn(a === '1'); paint(); return; }
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
        '.lc-sec h3{margin:0;font:400 20px/1 var(--font-display);letter-spacing:1px;text-transform:uppercase}' +
        '.lc-help{display:flex;width:100%}.lc-help button{flex:1;min-width:0}' +
        '.lc-desc{margin:0;font-size:14.5px}.lc-sec p{margin:0}' +
        '.lc-status{font-weight:600;font-size:14.5px}.lc-status.none,.lc-status.noout{font-weight:500;color:var(--muted)}' +
        '.lc-row{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap}.lc-lab{min-width:84px;font-size:13.5px;color:var(--muted);font-weight:600}' +
        '.lc-degs{display:flex;gap:6px;flex-wrap:wrap}.lc-deg{display:grid;justify-items:center;gap:2px}.lc-deg i{display:block;width:26px;height:12px;border-radius:3px}' +
        '.lc-deg i+i{border-radius:3px}.lc-deg b{font-size:11px;color:var(--muted);font-weight:600}' +
        '#lc-bright{flex:1;min-width:120px}.lc-val{font-variant-numeric:tabular-nums;font-size:13px;min-width:3em}' +
        '.lc-chk{display:flex;gap:8px;align-items:center;font-size:13.5px}' +
        '.lc-warn{font-size:13.5px;color:#ffb36b}.lc-acts{display:flex;gap:8px}');
      el.addEventListener('click', onClick);
      el.addEventListener('input', onInput);
      el.addEventListener('change', onInput);
      ['help:level', 'midi:state', 'midi:range'].forEach(function (ev) { App.on(ev, function () { if (App.sheet === 'lights') paint(); }); });
      App.on('midi:status', function (d) { btMsg = d && d.text || ''; if (App.sheet === 'lights') paint(); });
      paint();
    },
    onShow: paint
  });
})();
