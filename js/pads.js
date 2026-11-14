/* soundLAB drum pads — a finger-drumming surface (Keys tab, pill "Pads").
 * Registers as 'pads'. Prefix pd-.
 *
 * Eight velocity-sensitive pads on the default drum kit (DAW.createDrums in
 * js/daw/engine.js, wired like the Woodshed's drums), playable three ways at
 * once while the page is open:
 *   - touch/click on the pads
 *   - QWERTY: Z X C V (kick snare clap hat) and A S D F (open hat, low tom,
 *     hi tom, crash)
 *   - MIDI, in one of two mappings:
 *       ROLI octave — the white keys C D E F G A B from a base note
 *                     (default C3) carry seven lanes, any black key is the
 *                     crash; any octave, true velocity
 *       GM drums    — the General MIDI drum map (36 kick, 38 snare, 39 clap,
 *                     42/46 hats, 45/50 toms, 49 crash) for pad controllers
 *
 * Remap: tap a pad, then press the key that should trigger it (pads.map).
 * ROLI key lights: the eight mapped keys stay dimly lit while the page is
 * open and flash bright on every hit.
 *
 * PLAY-ONLY until Phase C rebuilds Pads as rhythm practice
 * (docs/ROADMAP-2.0.md): the 1.x step recording and playback went with the
 * Studio sequencer. This page reads and writes only pads.mode / pads.base /
 * pads.leds / pads.map — never a Studio key.
 */
(function () {
  'use strict';

  var els = {};
  var LANE_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyA', 'KeyS', 'KeyD', 'KeyF'];
  var KEY_HINTS = ['Z', 'X', 'C', 'V', 'A', 'S', 'D', 'F'];
  var GM_MAP = { 36: 0, 35: 0, 38: 1, 40: 1, 39: 2, 42: 3, 44: 3, 46: 4, 45: 5, 41: 5, 47: 6, 48: 6, 50: 6, 49: 7, 51: 7, 57: 7 };

  // lane tints: the 7 degree colors (App.colors — a lane is a drum, not a
  // pitch, so Interval | Note doesn't apply) + a neutral 8th for the crash
  function padColors() {
    return App.colors.degrees().concat(['#c8c2b8']);
  }

  function mode() { return App.store.get('pads.mode', 'roli') === 'gm' ? 'gm' : 'roli'; }
  function base() {
    var b = parseInt(App.store.get('pads.base', 48), 10);
    return (b >= 24 && b <= 96) ? b : 48;
  }
  function ledsOn() { return App.store.get('pads.leds', true) !== false; }

  // the pads' own drum kit: the default kit straight into the master output
  // (the same wiring the Woodshed uses), built on the first hit
  var kit = null, kitCtx = null;
  function drumKit() {
    var ctx = App.getAudio();
    if (!kit || kitCtx !== ctx) { kit = DAW.createDrums(ctx); kit.output.connect(ctx.destination); kitCtx = ctx; }
    return kit;
  }

  function customMap() {
    var m = App.store.get('pads.map', null);
    return (m && typeof m === 'object') ? m : {};
  }

  function laneForMidi(midi) {
    var cm = customMap();
    for (var l in cm) { if (cm[l] === midi) return parseInt(l, 10); }
    if (mode() === 'gm') {
      var l = GM_MAP[midi];
      return l == null ? null : l;
    }
    // WHITE-KEY layout, octave-agnostic: drummers on a keyboard play the
    // naturals — C D E F G A B carry the seven main lanes, ANY black key
    // is the crash. (The old chromatic layout hid the snare on C#.)
    var pc = ((midi - base()) % 12 + 12) % 12;
    var W = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
    return W[pc] !== undefined ? W[pc] : 7;
  }

  function midiForLane(lane) {
    var cm = customMap();
    if (cm[lane] != null) return cm[lane];
    if (mode() === 'gm') return [36, 38, 39, 42, 46, 45, 50, 49][lane];
    return lane < 7 ? base() + [0, 2, 4, 5, 7, 9, 11][lane] : base() + 1; // crash: any black key
  }

  // ---------------- triggering ----------------

  function hit(lane, vel) {
    try { drumKit().noteOn(lane, vel, App.getAudio().currentTime); } catch (e) { /* audio unavailable */ }
    flashPad(lane);
    if (ledsOn() && App.midi && App.midi.hasOutput) {
      var m = midiForLane(lane);
      App.midi.light(m, 127);
      setTimeout(function () { App.midi.light(m, App.active === 'pads' ? 20 : 0); }, 120);
    }
  }

  function flashPad(lane) {
    if (!els.grid) return;
    var pad = els.grid.querySelector('.pd-pad[data-lane="' + lane + '"]');
    if (!pad) return;
    pad.classList.add('pd-hit');
    setTimeout(function () { pad.classList.remove('pd-hit'); }, 110);
  }

  // ---------------- ROLI key lights ----------------

  function lightBase() {
    if (!ledsOn() || !App.midi || !App.midi.hasOutput) return;
    for (var l = 0; l < 8; l++) App.midi.light(midiForLane(l), 20);
  }

  function darkBase() {
    if (!App.midi || !App.midi.hasOutput) return;
    for (var l = 0; l < 8; l++) App.midi.dark(midiForLane(l));
  }

  // ---------------- UI ----------------

  function render() {
    if (!els.grid) return;
    var cs = padColors();
    var h = '';
    for (var l = 0; l < 8; l++) {
      h += '<button type="button" class="pd-pad" data-lane="' + l + '" style="--pd:' + cs[l] + '">' +
        '<span class="pd-name">' + DAW.DRUM_LANES[l] + '</span>' +
        '<span class="pd-sub">' + KEY_HINTS[l] + ' · ' + Theory.midiName(midiForLane(l)) + '</span>' +
        '</button>';
    }
    els.grid.innerHTML = h;
  }

  function paintControls() {
    els.modeSeg.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-pdm') === mode());
    });
    els.baseWrap.style.display = mode() === 'roli' ? '' : 'none';
    els.baseSel.value = String(base());
    els.leds.checked = ledsOn();
  }

  function init(rootEl) {
    App.injectCSS('pads',
      '.pd-pad.pd-learn{outline:3px dashed var(--accent);outline-offset:2px}' +
      // minmax(0,1fr): four pads always fit the card (390px phone = 77px pads)
      '.pd-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;max-width:720px}' +
      '.pd-pad{position:relative;aspect-ratio:1.15;border-radius:16px;border:1px solid var(--line);cursor:pointer;' +
        'font-family:var(--font-body);color:var(--text);' +
        'background:linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.18)),var(--card2);' +
        'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;' +
        'box-shadow:inset 0 -3px 0 rgba(0,0,0,0.25);touch-action:manipulation;padding:6px}' +
      '.pd-pad::before{content:"";position:absolute;left:10px;right:10px;top:8px;height:5px;border-radius:3px;' +
        'background:var(--pd);opacity:0.8}' +
      '.pd-pad.pd-hit{background:var(--pd);box-shadow:0 0 18px var(--pd);border-color:var(--pd)}' +
      '.pd-pad.pd-hit .pd-name,.pd-pad.pd-hit .pd-sub{color:#141216}' +
      '.pd-name{font-weight:700;font-size:15px;line-height:1.15;text-align:center;color:var(--text)}' +
      '.pd-sub{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}' +
      // light theme: a clean raised pad (the dark gradient stop turned it
      // muddy); :not(.pd-hit) keeps the hit flash winning
      ':root[data-theme="light"] .pd-pad:not(.pd-hit){background:linear-gradient(180deg,#fff,var(--card2));' +
        'box-shadow:inset 0 -3px 0 rgba(0,0,0,0.08)}' +
      // 'Pads follow' reads like the 'From key' field label beside it
      '.pd-lbl{display:inline-flex;flex-direction:column;gap:5px;font-size:11.5px;font-weight:600;letter-spacing:1.4px;' +
        'text-transform:uppercase;color:var(--label)}' +
      // phones: square pads with room under the color bar, so a two-word
      // name ('Open hat' at 360px) wraps without running into it
      '@media (max-width:640px){.pd-grid{gap:8px}.pd-pad{aspect-ratio:1;padding:17px 4px 6px;gap:3px}' +
        '.pd-name{font-size:14px;line-height:1.1}}'
    );

    rootEl.innerHTML =
      '<div class="card">' +
        '<div class="row tight">' +
          '<button type="button" class="chip fb-chip" id="pd-remap" title="Remap: tap a pad, then press the key that should trigger it">Remap</button>' +
          '<button type="button" class="btn sm" id="pd-mapreset" title="Back to the standard mapping" style="display:none">Reset map</button>' +
          '<span class="muted small" id="pd-maphint" style="display:none"></span>' +
        '</div>' +
        '<div class="pd-grid" id="pd-grid" style="margin-top:16px"></div>' +
        '<div class="muted small" style="margin-top:12px">Play the pads with touch, the Z X C V / A S D F keys, or your MIDI keys. ' +
          'Recording a beat comes back when Pads becomes rhythm practice.</div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>MIDI &amp; ROLI</h2>' +
        '<div class="row">' +
          '<div class="pd-lbl">Pads follow<div class="seg" id="pd-mode">' +
            '<button type="button" data-pdm="roli">ROLI octave</button>' +
            '<button type="button" data-pdm="gm">GM drums</button></div></div>' +
          '<label class="field" id="pd-basewrap">From key<select id="pd-base">' +
            (function () {
              var h = '';
              for (var m = 36; m <= 72; m += 12) h += '<option value="' + m + '">' + Theory.midiName(m) + '</option>';
              return h;
            })() + '</select></label>' +
          '<label class="row tight small" style="gap:6px"><input type="checkbox" id="pd-leds">Key lights</label>' +
        '</div>' +
        '<div class="muted small" style="margin-top:10px">Key lights keep the eight pad keys lit on the ROLI and flash them with every hit. ' +
          'ROLI octave = eight keys up from the base note, one pad each, full velocity. ' +
          'GM drums = the standard drum map (kick 36, snare 38&hellip;) for hardware pad controllers.</div>' +
      '</div>';

    els.grid = document.getElementById('pd-grid');
    els.modeSeg = document.getElementById('pd-mode');
    els.baseWrap = document.getElementById('pd-basewrap');
    els.baseSel = document.getElementById('pd-base');
    els.leds = document.getElementById('pd-leds');

    render();
    paintControls();

    var learn = { on: false, lane: null };
    function paintLearn() {
      var chip = document.getElementById('pd-remap');
      var hint = document.getElementById('pd-maphint');
      var rst = document.getElementById('pd-mapreset');
      chip.classList.toggle('active', learn.on);
      rst.style.display = learn.on ? '' : 'none';
      hint.style.display = learn.on ? '' : 'none';
      hint.textContent = !learn.on ? ''
        : learn.lane == null ? 'tap a pad to remap it'
        : 'press the key for ' + DAW.DRUM_LANES[learn.lane] + '…';
      if (els.grid) els.grid.querySelectorAll('.pd-pad').forEach(function (p) {
        p.classList.toggle('pd-learn', learn.on && parseInt(p.getAttribute('data-lane'), 10) === learn.lane);
      });
    }
    document.getElementById('pd-remap').addEventListener('click', function () {
      learn.on = !learn.on;
      learn.lane = null;
      paintLearn();
    });
    document.getElementById('pd-mapreset').addEventListener('click', function () {
      App.store.set('pads.map', null);
      learn.lane = null;
      render();
      paintLearn();
    });

    els.grid.addEventListener('pointerdown', function (e) {
      var padl = e.target.closest ? e.target.closest('.pd-pad') : null;
      if (learn.on && padl) {
        learn.lane = parseInt(padl.getAttribute('data-lane'), 10);
        paintLearn();
        return;
      }
      var pad = e.target.closest('.pd-pad');
      if (!pad) return;
      e.preventDefault();
      hit(parseInt(pad.getAttribute('data-lane'), 10), 0.9);
    });

    els.modeSeg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pdm]');
      if (!b) return;
      darkBase();
      App.store.set('pads.mode', b.getAttribute('data-pdm'));
      paintControls();
      render();
      if (App.active === 'pads') lightBase();
    });
    els.baseSel.addEventListener('change', function () {
      darkBase();
      App.store.set('pads.base', parseInt(this.value, 10));
      render();
      if (App.active === 'pads') lightBase();
    });
    els.leds.addEventListener('change', function () {
      App.store.set('pads.leds', !!this.checked);
      if (this.checked && App.active === 'pads') lightBase(); else darkBase();
    });

    // MIDI plays the pads while the Pads page is open
    App.on('midi:note', function (d) {
      if (!d || !d.on || d.silent) return; // tone-in notes never drum
      if (learn.on && App.active === 'pads') {
        if (learn.lane != null) {
          var cm = customMap();
          cm[learn.lane] = d.midi;
          App.store.set('pads.map', cm);
          learn.lane = null;
          render();
          paintLearn();
        }
        return; // learning: keys assign, they don't play
      }
      if (App.active !== 'pads') return;
      var lane = laneForMidi(d.midi);
      if (lane == null) return;
      hit(lane, Math.max(0.15, (d.vel || 90) / 127));
    }, true); // sound first

    App.on('midi:state', function () { if (App.active === 'pads') lightBase(); });
    App.on('colors', function (d) { if (d && d.what === 'degrees') render(); }); // lane tints = degree colors
  }

  App.register('pads', {
    init: init,
    // the pads own the keybed while open (the scale layout steps aside)
    onShow: function () { render(); paintControls(); if (App.midi && App.midi.claim) App.midi.claim('pads'); lightBase(); },
    onHide: function () { darkBase(); paintControls(); if (App.midi && App.midi.release) App.midi.release('pads'); },
    onKey: function (e) {
      if (e.repeat || e.type !== 'keydown') return;
      var lane = LANE_KEYS.indexOf(e.code);
      if (lane === -1) return;
      e.preventDefault();
      hit(lane, 0.85);
    }
  });
})();
