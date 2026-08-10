/* soundLAB drum pads — a finger-drumming controller surface for the Studio.
 * Registers as 'pads'. Prefix pd-.
 *
 * Eight velocity-sensitive pads wired to a DRUM track's real channel (so the
 * track's FX slot and mixer settings apply), playable three ways at once:
 *   - touch/click on the pads
 *   - QWERTY while the page is open: Z X C V (kick snare clap hat) and
 *     A S D F (open hat, low tom, hi tom, crash)
 *   - MIDI, everywhere in the Studio when the drum track is armed Live, in
 *     one of two mappings:
 *       ROLI octave — eight chromatic keys from a base note (default C3),
 *                     one per lane, true velocity
 *       GM drums    — the General MIDI drum map (36 kick, 38 snare, 39 clap,
 *                     42/46 hats, 45/50 toms, 49 crash) for pad controllers
 *
 * RECORD quantizes hits into the drum track's step pattern live while the
 * loop plays (nearest 1/16, timed against st:step). ROLI key lights: the
 * eight mapped keys stay dimly lit while the page is open, flash bright on
 * every hit — including the loop's own hits, so the LUMI shows the beat.
 */
(function () {
  'use strict';

  var els = {};
  var rec = false;
  var lastStep = { step: -1, at: 0 };
  var LANE_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyA', 'KeyS', 'KeyD', 'KeyF'];
  var KEY_HINTS = ['Z', 'X', 'C', 'V', 'A', 'S', 'D', 'F'];
  var GM_MAP = { 36: 0, 35: 0, 38: 1, 40: 1, 39: 2, 42: 3, 44: 3, 46: 4, 45: 5, 41: 5, 47: 6, 48: 6, 50: 6, 49: 7, 51: 7, 57: 7 };

  function padColors() {
    var c = App.store.get('fb.colors', null);
    if (Object.prototype.toString.call(c) !== '[object Array]' || c.length !== 7) {
      c = ['#ffab47', '#ffd166', '#8bd450', '#4cc9b0', '#5aa9ff', '#b18cff', '#ff6b9d'];
    }
    return c.concat(['#c8c2b8']);
  }

  function mode() { return App.store.get('pads.mode', 'roli') === 'gm' ? 'gm' : 'roli'; }
  function base() {
    var b = parseInt(App.store.get('pads.base', 48), 10);
    return (b >= 24 && b <= 96) ? b : 48;
  }
  function ledsOn() { return App.store.get('pads.leds', true) !== false; }

  function drumTracks() {
    return DAW.engine.tracks.filter(function (t) { return t.kind === 'drums'; });
  }

  function padTrack() {
    var id = App.store.get('pads.track', null);
    var list = drumTracks();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0] || null;
  }

  function laneForMidi(midi) {
    if (mode() === 'gm') {
      var l = GM_MAP[midi];
      return l == null ? null : l;
    }
    var d = midi - base();
    return (d >= 0 && d < 8) ? d : null;
  }

  function midiForLane(lane) {
    return mode() === 'gm' ? [36, 38, 39, 42, 46, 45, 50, 49][lane] : base() + lane;
  }

  // ---------------- triggering ----------------

  function hit(lane, vel, fromLoop) {
    var t = padTrack();
    if (!t) return;
    if (!fromLoop) {
      try {
        var c = DAW.engine.liveChannel(t.id);
        if (c) c.instrument.noteOn(lane, vel, App.getAudio().currentTime);
      } catch (e) { /* audio unavailable */ }
      if (rec && DAW.engine.playing) recordHit(t, lane);
    }
    flashPad(lane);
    if (ledsOn() && App.midi && App.midi.hasOutput) {
      var m = midiForLane(lane);
      App.midi.light(m, 127);
      setTimeout(function () { App.midi.light(m, App.active === 'pads' ? 20 : 0); }, 120);
    }
  }

  function recordHit(t, lane) {
    // quantize against the last st:step heartbeat: nearest 1/16
    var stepDur = 60 / bpmNow() / 4;
    var elapsed = (performance.now() - lastStep.at) / 1000;
    var q = (lastStep.step + Math.round(elapsed / stepDur)) % (DAW.engine.bars * 16);
    if (q < 0) q = 0;
    if (!t.steps[lane]) t.steps[lane] = [];
    t.steps[lane][q] = 1;
    App.store.set('st.tracks', DAW.engine.tracks);
    paintRecCount(t);
  }

  function bpmNow() {
    var v = parseInt(App.store.get('met.bpm', 100), 10);
    return (v >= 30 && v <= 280) ? v : 100;
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
    var t = padTrack();
    var cs = padColors();
    if (!t) {
      els.grid.innerHTML = '<div class="muted" style="padding:16px 4px">No drum track yet.</div>';
      els.mkbtn.style.display = '';
      els.recbtn.disabled = true;
      return;
    }
    els.mkbtn.style.display = 'none';
    els.recbtn.disabled = false;
    var h = '';
    for (var l = 0; l < 8; l++) {
      h += '<button type="button" class="pd-pad" data-lane="' + l + '" style="--pd:' + cs[l] + '">' +
        '<span class="pd-name">' + DAW.DRUM_LANES[l] + '</span>' +
        '<span class="pd-sub">' + KEY_HINTS[l] + ' · ' + Theory.midiName(midiForLane(l)) + '</span>' +
        '</button>';
    }
    els.grid.innerHTML = h;
    paintTrackSel();
    paintRecCount(t);
  }

  function paintTrackSel() {
    var list = drumTracks();
    var t = padTrack();
    els.tsel.innerHTML = list.map(function (x) {
      return '<option value="' + x.id + '"' + (t && x.id === t.id ? ' selected' : '') + '>' + x.name.replace(/</g, '&lt;') + '</option>';
    }).join('');
    els.tsel.style.display = list.length > 1 ? '' : 'none';
  }

  function paintRecCount(t) {
    if (!els.recinfo) return;
    var n = 0;
    (t.steps || []).forEach(function (row) {
      (row || []).forEach(function (v, i) { if (v && i < DAW.engine.bars * 16) n++; });
    });
    els.recinfo.textContent = t.name + ' · ' + n + ' hits in the loop';
  }

  function paintControls() {
    els.modeSeg.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-pdm') === mode());
    });
    els.baseWrap.style.display = mode() === 'roli' ? '' : 'none';
    els.baseSel.value = String(base());
    els.leds.checked = ledsOn();
    els.recbtn.classList.toggle('active', rec);
    els.recbtn.innerHTML = (rec ? App.icon('stop', 14) : App.icon('play', 14)) + (rec ? ' Recording' : ' Record hits');
    els.play.innerHTML = DAW.engine.playing ? App.icon('stop', 15) + ' Stop' : App.icon('play', 15) + ' Play loop';
  }

  function init(rootEl) {
    App.injectCSS('pads',
      '.pd-grid{display:grid;grid-template-columns:repeat(4,minmax(84px,1fr));gap:12px;max-width:640px}' +
      '.pd-pad{position:relative;aspect-ratio:1.15;border-radius:16px;border:1px solid var(--line);cursor:pointer;' +
        'background:linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.18)),var(--card2);' +
        'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;' +
        'box-shadow:inset 0 -3px 0 rgba(0,0,0,0.25);touch-action:manipulation;padding:6px}' +
      '.pd-pad::before{content:"";position:absolute;left:10px;right:10px;top:8px;height:5px;border-radius:3px;' +
        'background:var(--pd);opacity:0.8}' +
      '.pd-pad.pd-hit{background:var(--pd);box-shadow:0 0 18px var(--pd);border-color:var(--pd)}' +
      '.pd-pad.pd-hit .pd-name,.pd-pad.pd-hit .pd-sub{color:#141216}' +
      '.pd-name{font-weight:700;font-size:14px;color:var(--text)}' +
      '.pd-sub{font-size:11px;color:var(--muted)}' +
      '#pd-rec.active{border-color:#d9484a;color:#ffd7d7;background:rgba(217,72,74,0.14)}'
    );

    rootEl.innerHTML =
      '<div class="card">' +
        '<div class="row spread">' +
          '<span class="row tight">' +
            '<button type="button" class="btn big primary" id="pd-play"></button>' +
            '<button type="button" class="btn" id="pd-rec"></button>' +
            '<span class="muted small" id="pd-recinfo"></span>' +
          '</span>' +
          '<span class="row tight">' +
            '<select id="pd-track" title="Which drum track the pads play"></select>' +
            '<button type="button" class="btn sm" id="pd-mk">' + App.icon('plus', 13) + ' Drum track</button>' +
          '</span>' +
        '</div>' +
        '<div class="pd-grid" id="pd-grid" style="margin-top:16px"></div>' +
        '<div class="muted small" style="margin-top:12px">Play the pads with touch, the Z X C V / A S D F keys, or your MIDI keys. ' +
          'With Record on and the loop playing, every hit lands on the nearest 1/16 of the pattern — fix details on the Tracks page.</div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>MIDI &amp; ROLI</h2>' +
        '<div class="row">' +
          '<div class="fb-field">Pads follow<div class="seg" id="pd-mode">' +
            '<button type="button" data-pdm="roli">ROLI octave</button>' +
            '<button type="button" data-pdm="gm">GM drums</button></div></div>' +
          '<label class="field" id="pd-basewrap">From key<select id="pd-base">' +
            (function () {
              var h = '';
              for (var m = 36; m <= 72; m += 12) h += '<option value="' + m + '">' + Theory.midiName(m) + '</option>';
              return h;
            })() + '</select></label>' +
          '<label class="row tight small muted" style="gap:6px"><input type="checkbox" id="pd-leds">Key lights: keep the eight pad keys lit on the ROLI and flash them with every hit — including the loop&rsquo;s own beat</label>' +
        '</div>' +
        '<div class="muted small" style="margin-top:10px">ROLI octave = eight keys up from the base note, one pad each, full velocity. ' +
          'GM drums = the standard drum map (kick 36, snare 38&hellip;) for hardware pad controllers. ' +
          'Arm the drum track <b>Live</b> on the Tracks page and your MIDI pads work from anywhere in the Studio.</div>' +
      '</div>';

    els.grid = document.getElementById('pd-grid');
    els.play = document.getElementById('pd-play');
    els.recbtn = document.getElementById('pd-rec');
    els.recinfo = document.getElementById('pd-recinfo');
    els.tsel = document.getElementById('pd-track');
    els.mkbtn = document.getElementById('pd-mk');
    els.modeSeg = document.getElementById('pd-mode');
    els.baseWrap = document.getElementById('pd-basewrap');
    els.baseSel = document.getElementById('pd-base');
    els.leds = document.getElementById('pd-leds');

    render();
    paintControls();

    els.play.addEventListener('click', function () {
      if (DAW.engine.playing) DAW.engine.stop(); else if (padTrack()) DAW.engine.play();
      paintControls();
    });
    els.recbtn.addEventListener('click', function () {
      rec = !rec;
      if (rec && !DAW.engine.playing && padTrack()) DAW.engine.play();
      paintControls();
    });
    els.mkbtn.addEventListener('click', function () {
      // a fresh, EMPTY kit — the pads are for playing your own beat in
      var t = {
        id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: 'Drums', kind: 'drums', voice: 'keys',
        synth: {}, sampler: { rootNote: 60, loop: false, name: '' },
        steps: (function () {
          var s = [];
          for (var l = 0; l < 8; l++) { var r = []; for (var i = 0; i < 64; i++) r.push(0); s.push(r); }
          return s;
        })(),
        notes: null, fx: { type: 'none', mix: 0.3 },
        mix: { vol: 80, mute: false, solo: false }
      };
      DAW.engine.tracks.push(t);
      App.store.set('st.tracks', DAW.engine.tracks);
      App.store.set('pads.track', t.id);
      render();
      paintControls();
    });
    els.tsel.addEventListener('change', function () {
      App.store.set('pads.track', this.value);
      render();
    });

    els.grid.addEventListener('pointerdown', function (e) {
      var pad = e.target.closest('.pd-pad');
      if (!pad) return;
      e.preventDefault();
      hit(parseInt(pad.getAttribute('data-lane'), 10), 0.9, false);
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

    // MIDI: pads page open, or the pad drum track armed Live (anywhere in Studio)
    App.on('midi:note', function (d) {
      if (!d || !d.on || App.space !== 'studio') return;
      var t = padTrack();
      if (!t) return;
      var armed = App.store.get('st.armed', null) === t.id;
      if (App.active !== 'pads' && !armed) return;
      var lane = laneForMidi(d.midi);
      if (lane == null) return;
      hit(lane, Math.max(0.15, (d.vel || 90) / 127), false);
    });

    // loop heartbeat: quantize reference + light the beat on the keys/pads
    App.on('st:step', function (d) {
      lastStep = { step: d.step, at: performance.now() };
      var t = padTrack();
      if (!t || App.active !== 'pads') return;
      for (var l = 0; l < 8; l++) {
        if (t.steps[l] && t.steps[l][d.step]) hit(l, 0, true);
      }
    });
    App.on('st:state', paintControls);
    App.on('midi:state', function () { if (App.active === 'pads') lightBase(); });
  }

  App.register('pads', {
    init: init,
    onShow: function () { render(); paintControls(); lightBase(); },
    onHide: function () { rec = false; darkBase(); paintControls(); },
    onKey: function (e) {
      if (e.repeat || e.type !== 'keydown') return;
      var lane = LANE_KEYS.indexOf(e.code);
      if (lane === -1) return;
      e.preventDefault();
      hit(lane, 0.85, false);
    }
  });
})();
