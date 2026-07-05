/* GuitarLab metronome module.
 *
 * Sound engine: classic lookahead scheduler. A setInterval fires every 25 ms
 * and schedules every click due within the next 0.12 s directly on the
 * AudioContext clock (never setTimeout for the clicks themselves), so timing
 * is sample-accurate and immune to main-thread jitter.
 *
 * Beat-unit interpretation (documented per spec):
 *   - x/4 signatures: each beat dot is a quarter note.
 *   - x/8 signatures (6/8, 7/8, 9/8, 12/8): each EIGHTH note gets its own
 *     beat dot and the BPM readout means eighth-notes-per-minute.
 *   - Subdivision always divides the current beat unit: "Quarter" = beat
 *     clicks only, "Eighth" = 2 clicks per beat (in x/8 time that sounds as
 *     sixteenths), "Triplet" = 3, "Sixteenth" = 4. Simple and consistent.
 *
 * Visual sync: every scheduled beat pushes { t: audioTime, beat } onto a
 * queue; a requestAnimationFrame loop lights the matching dot once the
 * audio clock passes that time.
 *
 * Persisted keys: met.bpm, met.sig, met.subdiv, met.vol, met.levels,
 * met.trainer.
 */
(function () {
  'use strict';

  var SIGS = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'];
  var SUBDIVS = [
    { id: 'quarter',   label: 'Quarter (beats only)' },
    { id: 'eighth',    label: 'Eighth' },
    { id: 'triplet',   label: 'Triplet' },
    { id: 'sixteenth', label: 'Sixteenth' }
  ];
  var SUBN = { quarter: 1, eighth: 2, triplet: 3, sixteenth: 4 };

  var LOOKAHEAD = 0.12;   // seconds of audio scheduled ahead
  var TICK_MS = 25;       // scheduler interval
  var CLICK_DECAY = 0.03; // sharp exponential decay
  var FREQ_ACCENT = 1600, FREQ_NORMAL = 1050, FREQ_SUB = 700;
  var GAIN_ACCENT = 1.0, GAIN_NORMAL = 0.65, GAIN_SUB = 0.3;

  // ---- settings (persisted) ----
  var bpm = 120;
  var sig = '4/4';
  var subdiv = 'quarter';
  var vol = 80;
  var trainer = { on: false, inc: 5, bars: 4, target: 160 };
  var levels = []; // per beat dot: 2 = accent, 1 = normal, 0 = muted

  // ---- runtime state ----
  var running = false;
  var ctx = null;
  var masterGain = null;
  var timer = null;
  var raf = 0;
  var nextTime = 0;   // AudioContext time of the next click to schedule
  var curBeat = 0;    // beat index about to be scheduled
  var curSub = 0;     // subdivision index within the current beat
  var barCount = 0;   // completed bars since start (for the trainer)
  var visQueue = [];  // { t: audioTime, beat: index }
  var litIndex = -1;
  var taps = [];

  var els = {};

  var CSS = [
    '.met-dots{display:flex;gap:10px;align-items:center;flex-wrap:wrap;min-height:34px;}',
    '.met-dot{width:26px;height:26px;border-radius:50%;background:var(--card2);border:2px solid var(--line);cursor:pointer;padding:0;transition:transform 60ms ease,background 90ms ease,border-color 90ms ease,box-shadow 90ms ease;}',
    '.met-dot.met-acc{border-color:var(--accent);background:rgba(255,180,84,0.18);}',
    '.met-dot.met-mute{opacity:0.35;background:transparent;border-style:dashed;}',
    '.met-dot.met-on{background:var(--accent);border-color:var(--accent);transform:scale(1.22);box-shadow:0 0 12px rgba(255,180,84,0.55);}',
    '.met-dot.met-mute.met-on{background:var(--muted);border-color:var(--muted);box-shadow:none;}',
    '.met-wide{width:100%;margin-top:12px;}',
    '.met-mt{margin-top:14px;}',
    '.met-num{width:80px;}',
    '#met-vol{width:200px;max-width:60vw;}',
    '.met-check{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;cursor:pointer;}'
  ].join('\n');

  var HTML = [
    '<div class="card">',
    '  <h2>Metronome</h2>',
    '  <div class="row spread">',
    '    <div>',
    '      <div class="big-display" id="met-bpm-display">120</div>',
    '      <div class="muted small">BPM</div>',
    '    </div>',
    '    <div class="row tight">',
    '      <button class="btn" id="met-m5" type="button">-5</button>',
    '      <button class="btn" id="met-m1" type="button">-1</button>',
    '      <button class="btn" id="met-p1" type="button">+1</button>',
    '      <button class="btn" id="met-p5" type="button">+5</button>',
    '      <button class="btn" id="met-tap" type="button">Tap Tempo</button>',
    '    </div>',
    '  </div>',
    '  <input type="range" id="met-bpm-slider" class="met-wide" min="30" max="280" step="1">',
    '  <div class="row met-mt">',
    '    <label class="field">Time signature',
    '      <select id="met-sig"></select>',
    '    </label>',
    '    <div class="met-dots" id="met-dots"></div>',
    '  </div>',
    '  <div class="row met-mt">',
    '    <label class="field">Subdivision',
    '      <select id="met-subdiv"></select>',
    '    </label>',
    '    <label class="field">Volume (<span id="met-vol-val">80</span>%)',
    '      <input type="range" id="met-vol" min="0" max="100" step="1">',
    '    </label>',
    '  </div>',
    '  <div class="row met-mt">',
    '    <button class="btn big primary" id="met-startstop" type="button">Start</button>',
    '    <span class="muted small">Space toggles start/stop. Click a beat dot to cycle accent / normal / muted.</span>',
    '  </div>',
    '  <div class="error met-mt" id="met-err" hidden></div>',
    '</div>',
    '<div class="card">',
    '  <h2>Tempo trainer</h2>',
    '  <div class="row">',
    '    <label class="met-check"><input type="checkbox" id="met-tr-on"> Enable</label>',
    '    <label class="field">+N BPM',
    '      <input type="number" id="met-tr-inc" class="met-num" min="1" max="20" step="1">',
    '    </label>',
    '    <label class="field">Every M bars',
    '      <input type="number" id="met-tr-bars" class="met-num" min="1" max="16" step="1">',
    '    </label>',
    '    <label class="field">Target BPM',
    '      <input type="number" id="met-tr-target" class="met-num" min="30" max="280" step="1">',
    '    </label>',
    '  </div>',
    '  <div class="muted small met-mt" id="met-tr-status"></div>',
    '</div>'
  ].join('\n');

  // ---- helpers ----

  function $(id) { return document.getElementById(id); }

  function clampInt(v, min, max, fallback) {
    v = parseInt(v, 10);
    if (isNaN(v)) return fallback;
    if (v < min) return min;
    if (v > max) return max;
    return v;
  }

  function numBeats() {
    return parseInt(sig.split('/')[0], 10);
  }

  function defaultLevels() {
    var nb = numBeats();
    var out = [];
    for (var i = 0; i < nb; i++) out.push(i === 0 ? 2 : 1);
    return out;
  }

  function load() {
    bpm = clampInt(App.store.get('met.bpm', 120), 30, 280, 120);
    sig = App.store.get('met.sig', '4/4');
    if (SIGS.indexOf(sig) === -1) sig = '4/4';
    subdiv = App.store.get('met.subdiv', 'quarter');
    if (!SUBN[subdiv]) subdiv = 'quarter';
    vol = clampInt(App.store.get('met.vol', 80), 0, 100, 80);
    var tr = App.store.get('met.trainer', null);
    if (tr && typeof tr === 'object') {
      trainer.on = !!tr.on;
      trainer.inc = clampInt(tr.inc, 1, 20, 5);
      trainer.bars = clampInt(tr.bars, 1, 16, 4);
      trainer.target = clampInt(tr.target, 30, 280, 160);
    }
    levels = defaultLevels();
    var lv = App.store.get('met.levels', null);
    if (Object.prototype.toString.call(lv) === '[object Array]' && lv.length === numBeats()) {
      var ok = true;
      for (var i = 0; i < lv.length; i++) {
        if (lv[i] !== 0 && lv[i] !== 1 && lv[i] !== 2) { ok = false; break; }
      }
      if (ok) levels = lv;
    }
  }

  function saveLevels() { App.store.set('met.levels', levels); }
  function saveTrainer() { App.store.set('met.trainer', trainer); }

  function showErr(msg) {
    els.err.textContent = msg;
    els.err.hidden = false;
  }
  function hideErr() { els.err.hidden = true; }

  // ---- BPM ----

  function setBpm(v) {
    v = parseInt(v, 10);
    if (isNaN(v)) return;
    if (v < 30) v = 30;
    if (v > 280) v = 280;
    bpm = v;
    els.bpmDisplay.textContent = String(v);
    els.slider.value = String(v);
    App.store.set('met.bpm', v);
  }

  function tap() {
    var now = Date.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = []; // 2 s gap resets
    taps.push(now);
    if (taps.length > 4) taps.shift(); // average over the last 4 taps
    if (taps.length >= 2) {
      var avgMs = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      setBpm(Math.round(60000 / avgMs));
    }
  }

  // ---- beat dots ----

  function buildDots() {
    var nb = numBeats();
    if (levels.length !== nb) levels = defaultLevels();
    var h = '';
    for (var i = 0; i < nb; i++) {
      h += '<button type="button" class="met-dot" title="Beat ' + (i + 1) +
           ' &mdash; click to cycle accent / normal / muted"></button>';
    }
    els.dots.innerHTML = h;
    paintDots();
  }

  function paintDots() {
    var kids = els.dots.children;
    for (var i = 0; i < kids.length; i++) {
      var cls = 'met-dot';
      if (levels[i] === 2) cls += ' met-acc';
      else if (levels[i] === 0) cls += ' met-mute';
      if (i === litIndex) cls += ' met-on';
      kids[i].className = cls;
    }
  }

  // ---- audio engine ----

  function click(t, freq, gain) {
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + CLICK_DECAY);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(t);
    osc.stop(t + CLICK_DECAY + 0.02);
  }

  function barDone() {
    barCount++;
    if (trainer.on && barCount % trainer.bars === 0 && bpm < trainer.target) {
      setBpm(Math.min(bpm + trainer.inc, trainer.target)); // readout updates live
    }
    updateTrainerStatus();
  }

  // Lookahead scheduler body — schedules every click due in the next
  // LOOKAHEAD seconds. bpm/subdiv/levels are re-read on every step, so
  // changes take effect on the next scheduled click without stopping.
  function tick() {
    var horizon = ctx.currentTime + LOOKAHEAD;
    while (nextTime < horizon) {
      var nb = numBeats();
      if (curBeat >= nb) { curBeat = 0; curSub = 0; } // signature shrank mid-bar
      var n = SUBN[subdiv];
      if (curSub === 0) {
        var lvl = levels[curBeat];
        if (lvl === 2) click(nextTime, FREQ_ACCENT, GAIN_ACCENT);
        else if (lvl === 1) click(nextTime, FREQ_NORMAL, GAIN_NORMAL);
        // muted (0): schedule no sound, but still advance and light the dot
        visQueue.push({ t: nextTime, beat: curBeat });
        if (visQueue.length > 128) visQueue.shift(); // background-tab safety
      } else {
        click(nextTime, FREQ_SUB, GAIN_SUB);
      }
      nextTime += (60 / bpm) / n;
      curSub++;
      if (curSub >= n) {
        curSub = 0;
        curBeat++;
        if (curBeat >= nb) { curBeat = 0; barDone(); }
      }
    }
  }

  function draw() {
    if (!running) return;
    var now = ctx.currentTime;
    var hit = null;
    while (visQueue.length && visQueue[0].t <= now) hit = visQueue.shift();
    if (hit) { litIndex = hit.beat; paintDots(); }
    raf = requestAnimationFrame(draw);
  }

  function start() {
    if (running) return;
    try {
      ctx = App.getAudio(); // only ever called from click / keydown handlers
    } catch (err) {
      showErr('Could not start audio: ' + (err && err.message ? err.message : err));
      return;
    }
    if (!ctx) {
      showErr('Web Audio is not available in this browser.');
      return;
    }
    hideErr();
    if (!masterGain) {
      masterGain = ctx.createGain();
      masterGain.connect(ctx.destination);
    }
    masterGain.gain.value = vol / 100;
    curBeat = 0;
    curSub = 0;
    barCount = 0;
    visQueue.length = 0;
    litIndex = -1;
    nextTime = ctx.currentTime + 0.08;
    running = true;
    timer = setInterval(tick, TICK_MS);
    tick();
    raf = requestAnimationFrame(draw);
    els.startStop.textContent = 'Stop';
    setTrainerDisabled(true);
    updateTrainerStatus();
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    running = false;
    visQueue.length = 0;
    litIndex = -1;
    if (els.dots) paintDots();
    if (els.startStop) els.startStop.textContent = 'Start';
    setTrainerDisabled(false);
    updateTrainerStatus();
  }

  function toggle() { if (running) stop(); else start(); }

  // ---- tempo trainer UI ----

  function setTrainerDisabled(dis) {
    if (!els.trInc) return;
    els.trInc.disabled = dis;
    els.trBars.disabled = dis;
    els.trTarget.disabled = dis;
  }

  function updateTrainerStatus() {
    if (!els.trStatus) return;
    var text;
    var barWord = trainer.bars === 1 ? 'bar' : 'bars';
    if (!trainer.on) {
      text = 'Off — enable to raise the tempo automatically while the metronome runs.';
    } else if (running) {
      if (bpm >= trainer.target) {
        text = 'Target reached — holding at ' + bpm + ' BPM.';
      } else {
        var left = trainer.bars - (barCount % trainer.bars);
        text = 'Running: +' + trainer.inc + ' BPM in ' + left + (left === 1 ? ' bar' : ' bars') +
               ' (target ' + trainer.target + ' BPM).';
      }
    } else {
      text = '+' + trainer.inc + ' BPM every ' + trainer.bars + ' ' + barWord +
             ' until ' + trainer.target + ' BPM.';
    }
    els.trStatus.textContent = text;
  }

  function trainerNumChanged() {
    trainer.inc = clampInt(els.trInc.value, 1, 20, trainer.inc);
    trainer.bars = clampInt(els.trBars.value, 1, 16, trainer.bars);
    trainer.target = clampInt(els.trTarget.value, 30, 280, trainer.target);
    els.trInc.value = String(trainer.inc);
    els.trBars.value = String(trainer.bars);
    els.trTarget.value = String(trainer.target);
    saveTrainer();
    updateTrainerStatus();
  }

  // ---- module ----

  function init(rootEl) {
    App.injectCSS('met', CSS);
    load();
    rootEl.innerHTML = HTML;

    els.bpmDisplay = $('met-bpm-display');
    els.slider = $('met-bpm-slider');
    els.sig = $('met-sig');
    els.dots = $('met-dots');
    els.subdiv = $('met-subdiv');
    els.vol = $('met-vol');
    els.volVal = $('met-vol-val');
    els.startStop = $('met-startstop');
    els.err = $('met-err');
    els.trOn = $('met-tr-on');
    els.trInc = $('met-tr-inc');
    els.trBars = $('met-tr-bars');
    els.trTarget = $('met-tr-target');
    els.trStatus = $('met-tr-status');

    // populate selects
    var i, opts = '';
    for (i = 0; i < SIGS.length; i++) {
      opts += '<option value="' + SIGS[i] + '">' + SIGS[i] + '</option>';
    }
    els.sig.innerHTML = opts;
    opts = '';
    for (i = 0; i < SUBDIVS.length; i++) {
      opts += '<option value="' + SUBDIVS[i].id + '">' + SUBDIVS[i].label + '</option>';
    }
    els.subdiv.innerHTML = opts;

    // initial values from persisted settings
    els.bpmDisplay.textContent = String(bpm);
    els.slider.value = String(bpm);
    els.sig.value = sig;
    els.subdiv.value = subdiv;
    els.vol.value = String(vol);
    els.volVal.textContent = String(vol);
    els.trOn.checked = trainer.on;
    els.trInc.value = String(trainer.inc);
    els.trBars.value = String(trainer.bars);
    els.trTarget.value = String(trainer.target);

    // BPM controls
    $('met-m5').addEventListener('click', function () { setBpm(bpm - 5); });
    $('met-m1').addEventListener('click', function () { setBpm(bpm - 1); });
    $('met-p1').addEventListener('click', function () { setBpm(bpm + 1); });
    $('met-p5').addEventListener('click', function () { setBpm(bpm + 5); });
    $('met-tap').addEventListener('click', tap);
    els.slider.addEventListener('input', function () { setBpm(els.slider.value); });

    // signature + dots
    els.sig.addEventListener('change', function () {
      sig = els.sig.value;
      if (SIGS.indexOf(sig) === -1) sig = '4/4';
      App.store.set('met.sig', sig);
      levels = defaultLevels(); // rebuild with beat 1 accented
      litIndex = -1;
      buildDots();
      saveLevels();
      if (running) { curBeat = 0; curSub = 0; barCount = 0; }
      updateTrainerStatus();
    });

    els.dots.addEventListener('click', function (e) {
      var b = e.target.closest('.met-dot');
      if (!b) return;
      var idx = Array.prototype.indexOf.call(els.dots.children, b);
      if (idx < 0) return;
      levels[idx] = (levels[idx] + 2) % 3; // accent(2) -> normal(1) -> muted(0) -> accent
      paintDots();
      saveLevels();
    });

    // subdivision + volume
    els.subdiv.addEventListener('change', function () {
      subdiv = SUBN[els.subdiv.value] ? els.subdiv.value : 'quarter';
      App.store.set('met.subdiv', subdiv);
    });

    els.vol.addEventListener('input', function () {
      vol = clampInt(els.vol.value, 0, 100, vol);
      els.volVal.textContent = String(vol);
      if (masterGain) masterGain.gain.value = vol / 100;
      App.store.set('met.vol', vol);
    });

    // transport
    els.startStop.addEventListener('click', toggle);

    // trainer
    els.trOn.addEventListener('change', function () {
      trainer.on = els.trOn.checked;
      saveTrainer();
      updateTrainerStatus();
    });
    els.trInc.addEventListener('change', trainerNumChanged);
    els.trBars.addEventListener('change', trainerNumChanged);
    els.trTarget.addEventListener('change', trainerNumChanged);

    buildDots();
    updateTrainerStatus();
  }

  App.register('metronome', {
    init: init,
    onHide: function () { stop(); }, // kills interval, RAF, and pending visuals
    onKey: function (e) {
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        toggle();
      }
    }
  });
})();
