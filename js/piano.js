/* GuitarLab piano module — a keyboard twin of the fretboard.
 *
 * Keys are colored by scale degree with the SAME palette the fretboard uses
 * (fb.colors, customizable there), the key/scale follow the shared context
 * bar exactly like every other page (fb:set / fb:scale on the bus), labels
 * switch between note names / intervals / degrees, every key is playable
 * with a real sampled piano voice, a scale player runs at the shared tempo
 * (met.bpm), and the Jam tab's sounding chord lights up the keys live
 * (jam:chord / jam:stopped), mirroring the fretboard's chord rings.
 * DOM ids / CSS classes are prefixed pn-.
 */
(function () {
  'use strict';

  var els = {};
  var state = { display: 'notes' }; // notes | intervals | degrees (pn.display)
  var jamLast = null;

  // keyboard range: C2..C6 — brackets the guitar's practical range
  var LO = 36, HI = 84;
  var WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
  var W = 44, H = 190, BW = 27, BH = 118;

  // same defaults as the fretboard; live values come from the shared store so
  // a palette customized in the fretboard settings recolors this page too
  var DEG_DEFAULTS = ['#ffab47', '#e8d44d', '#7ad97a', '#4cc9b0', '#6ea8fe', '#b48ef0', '#ff85b3'];

  function degColors() {
    var cols = App.store.get('fb.colors', null);
    return (Array.isArray(cols) && cols.length === 7 &&
      cols.every(function (c) { return /^#[0-9a-fA-F]{6}$/.test(c); })) ? cols : DEG_DEFAULTS;
  }

  function curRoot() { var v = App.store.get('fb.root', 9); return (typeof v === 'number' && v >= 0 && v < 12) ? Math.floor(v) : 9; }
  function curScale() { var v = App.store.get('fb.scale', 'minorPent'); return Theory.SCALES[v] ? v : 'minorPent'; }
  function preferFlat() { return Theory.FLAT_KEYS.has(curRoot()); }

  // ---------------- sampled piano voice ----------------
  // FluidR3 piano anchors (samples/CREDITS.md), nearest-anchor pitch shift —
  // the same approach as App.pluck, with a synth fallback until decoded.
  var ANCHORS = { 48: 'C3', 52: 'E3', 57: 'A3', 60: 'C4', 64: 'E4', 69: 'A4', 72: 'C5' };
  var raw = {}, buf = {}, fetched = false;

  function prefetch() {
    if (fetched) return;
    fetched = true;
    Object.keys(ANCHORS).forEach(function (m) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'samples/keys/' + ANCHORS[m] + '.mp3', true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = function () {
        if ((xhr.status === 200 || xhr.status === 0) && xhr.response) raw[m] = xhr.response;
      };
      try { xhr.send(); } catch (e) { /* blocked — synth fallback */ }
    });
  }

  function decodeAll(ctx) {
    Object.keys(raw).forEach(function (m) {
      var bytes = raw[m];
      delete raw[m]; // decodeAudioData detaches the buffer
      ctx.decodeAudioData(bytes, function (b) { buf[m] = b; }, function () { /* fallback */ });
    });
  }

  function play(midi, when, dur, gain) {
    var ctx;
    try { ctx = App.getAudio(); } catch (e) { return; }
    decodeAll(ctx);
    when = Math.max(0, when || 0);
    dur = dur || 1.6;
    gain = gain == null ? 0.5 : gain;
    var t = ctx.currentTime + when;
    var best = null, bd = 99;
    for (var m in buf) {
      var d = Math.abs(midi - m);
      if (d < bd) { bd = d; best = Number(m); }
    }
    if (best === null) { App.pluckSynth(midi, when, dur, gain * 0.8); return; }
    var src = ctx.createBufferSource();
    src.buffer = buf[best];
    src.playbackRate.value = Math.pow(2, (midi - best) / 12);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    var rel = Math.min(0.4, Math.max(0.15, dur * 0.3));
    g.gain.setValueAtTime(gain, t + Math.max(0.02, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    src.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  // ---------------- keyboard rendering ----------------

  function whiteIndex(midi) { // count of white keys strictly below midi (from LO)
    var n = 0;
    for (var m = LO; m < midi; m++) if (WHITE_PCS.indexOf(Theory.mod12(m)) !== -1) n++;
    return n;
  }

  function keyLabel(midi, info, pf) {
    var pc = Theory.mod12(midi);
    var step = info.pcToStep.get(pc);
    if (step === undefined) return null;
    if (state.display === 'intervals') return info.intervals[step];
    if (state.display === 'degrees') return String(step + 1);
    return Theory.pcName(pc, pf);
  }

  function render() {
    var root = curRoot(), scaleId = curScale();
    var pf = preferFlat();
    var info = Theory.scaleInfo(root, scaleId, pf);
    var cols = degColors();

    els.title.textContent = Theory.pcName(root, pf) + ' ' + Theory.SCALES[scaleId].name;

    var whites = '', blacks = '', dots = '', labels = '';
    var totalW = 0;
    for (var midi = LO; midi <= HI; midi++) {
      var pc = Theory.mod12(midi);
      var isWhite = WHITE_PCS.indexOf(pc) !== -1;
      var step = info.pcToStep.get(pc);
      var inScale = step !== undefined;
      var isRoot = pc === Theory.mod12(root);
      var x, cx, cy;
      if (isWhite) {
        x = whiteIndex(midi) * W;
        totalW = Math.max(totalW, x + W);
        whites += '<rect class="pn-key pn-w" data-midi="' + midi + '" data-pc="' + pc + '" x="' + x +
          '" y="0" width="' + W + '" height="' + H + '" rx="4"/>';
        cx = x + W / 2; cy = H - 26;
        if (pc === 0) { // octave marker under every C
          labels += '<text class="pn-oct" x="' + cx + '" y="' + (H + 16) + '" text-anchor="middle">C' +
            (Math.floor(midi / 12) - 1) + '</text>';
        }
      } else {
        x = whiteIndex(midi) * W - BW / 2;
        blacks += '<rect class="pn-key pn-b" data-midi="' + midi + '" data-pc="' + pc + '" x="' + x +
          '" y="0" width="' + BW + '" height="' + BH + '" rx="3"/>';
        cx = x + BW / 2; cy = BH - 18;
      }
      if (inScale) {
        var col = cols[step % 7];
        dots += '<g class="pn-dotg" data-midi="' + midi + '" data-pc="' + pc + '">' +
          '<circle class="pn-jamring" data-pc="' + pc + '" cx="' + cx + '" cy="' + cy + '" r="15.5" fill="none"/>' +
          '<circle cx="' + cx + '" cy="' + cy + '" r="11.5" fill="' + col + '"' +
          (isRoot ? ' stroke="#ffffff" stroke-width="2"' : '') + '/>' +
          '<text class="pn-dott" x="' + cx + '" y="' + (cy + 3.5) + '" text-anchor="middle">' +
          keyLabel(midi, info, pf) + '</text></g>';
      }
    }

    els.stage.innerHTML =
      '<svg id="pn-svg" viewBox="0 0 ' + totalW + ' ' + (H + 24) + '" width="' + totalW +
      '" height="' + (H + 24) + '" xmlns="http://www.w3.org/2000/svg">' +
      whites + blacks + dots + labels + '</svg>';

    if (jamLast) jamPaint(jamLast); // fresh svg — reapply the live chord overlay

    // legend: one colored chip per degree, same shape as the fretboard's
    var lg = '';
    for (var i = 0; i < info.pcs.length; i++) {
      lg += '<span class="pn-leg"><span class="legend-dot" style="background:' + cols[i % 7] +
        '"></span>' + info.intervals[i] + ' &middot; ' + info.names[i] + '</span>';
    }
    els.legend.innerHTML = lg;
  }

  function scrollToRoot() {
    // land the view on the octave around middle C where the scale player lives
    var rootMidi = 48 + Theory.mod12(curRoot());
    var x = whiteIndex(rootMidi) * W;
    els.stage.scrollLeft = Math.max(0, x - els.stage.clientWidth / 4);
  }

  // ---------------- interaction ----------------

  function pressKey(midi, dur) {
    var svg = document.getElementById('pn-svg');
    if (!svg) return;
    var k = svg.querySelector('.pn-key[data-midi="' + midi + '"]');
    if (!k) return;
    k.classList.add('pn-down');
    setTimeout(function () { k.classList.remove('pn-down'); }, dur || 180);
  }

  // scale player: root octave up and back down at the shared tempo
  var ps = { timers: [], playing: false };

  function psStop() {
    ps.timers.forEach(clearTimeout);
    ps.timers.length = 0;
    ps.playing = false;
    App.wake.release('pn-run');
    els.playBtn.innerHTML = App.icon('play', 14) + ' Play scale';
  }

  function psPlay() {
    if (ps.playing) { psStop(); return; }
    var info = Theory.scaleInfo(curRoot(), curScale(), preferFlat());
    var rootMidi = 48 + Theory.mod12(curRoot());
    var up = info.steps.map(function (s) { return rootMidi + s; });
    up.push(rootMidi + 12);
    var seq = up.concat(up.slice(0, up.length - 1).reverse());
    var bpm = Math.max(30, Math.min(280, parseInt(App.store.get('met.bpm', 120), 10) || 120));
    var spb = 60 / bpm;
    try { App.getAudio(); } catch (e) { return; }
    ps.playing = true;
    App.wake.acquire('pn-run');
    els.playBtn.innerHTML = App.icon('stop', 14) + ' Stop';
    seq.forEach(function (midi, i) {
      play(midi, i * spb, Math.max(0.5, spb * 1.5), 0.5);
      ps.timers.push(setTimeout(function () { pressKey(midi, Math.max(140, spb * 700)); }, i * spb * 1000));
    });
    ps.timers.push(setTimeout(psStop, seq.length * spb * 1000 + 400));
  }

  // ---------------- jam follow (chord-over-keys, like the fretboard rings) ----------------

  function jamPaint(ev) {
    var svg = document.getElementById('pn-svg');
    if (!svg) return;
    var rings = svg.querySelectorAll('.pn-jamring');
    var tones = ev ? ev.tones : [];
    for (var i = 0; i < rings.length; i++) {
      var pc = parseInt(rings[i].getAttribute('data-pc'), 10);
      var on = !!ev && tones.indexOf(pc) !== -1;
      rings[i].classList.toggle('on', on);
      rings[i].classList.toggle('root', on && pc === ev.rootPc);
    }
  }

  // ---------------- init ----------------

  function init(rootEl) {
    App.injectCSS('piano',
      '.pn-title{font-family:var(--font-display);font-size:19px;font-weight:600;letter-spacing:1px;text-transform:uppercase}' +
      '.pn-stage{overflow-x:auto;-webkit-overflow-scrolling:touch;padding:6px 2px 2px;touch-action:pan-x}' +
      '.pn-stage svg{display:block}' +
      '.pn-key{cursor:pointer;transition:filter 80ms ease}' +
      // ivory + ebony in both themes — this is the instrument, not chrome
      '.pn-w{fill:#f7f3ea;stroke:#b9b0a2;stroke-width:1}' +
      '.pn-b{fill:#221d20;stroke:#000;stroke-width:1}' +
      '.pn-key.pn-down{filter:brightness(0.82)}' +
      '.pn-b.pn-down{filter:brightness(1.7)}' +
      '.pn-dotg{pointer-events:none}' +
      '.pn-dott{font:700 11px var(--font-body);fill:#1c1206}' +
      '.pn-oct{font:600 11px var(--font-body);fill:var(--muted)}' +
      '.pn-jamring{opacity:0;stroke:rgba(0,0,0,0.65);stroke-width:2.5;transition:opacity 0.25s ease}' +
      '.pn-jamring.on{opacity:0.95}' +
      '.pn-jamring.root{stroke:var(--accent);stroke-width:3.5}' +
      '.pn-leg{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);font-weight:600}' +
      '.pn-legend{margin-top:12px}'
    );

    rootEl.innerHTML =
      '<div class="card">' +
        '<div class="row tight spread">' +
          '<span class="pn-title" id="pn-title"></span>' +
          '<span class="row tight">' +
            '<div class="seg" id="pn-display">' +
              '<button type="button" data-pnmode="notes">Notes</button>' +
              '<button type="button" data-pnmode="intervals">Intervals</button>' +
              '<button type="button" data-pnmode="degrees">Degrees</button>' +
            '</div>' +
            '<button type="button" class="btn sm primary" id="pn-play"></button>' +
          '</span>' +
        '</div>' +
        '<div class="pn-stage" id="pn-stage"></div>' +
        '<div class="row tight pn-legend" id="pn-legend"></div>' +
        '<div class="muted small" style="margin-top:10px">Tap a key to hear it. Colors, key and scale are shared with the fretboard ' +
          '&mdash; change them in the bar above, and customize the degree colors in the fretboard settings. ' +
          'The Play button runs the scale at the shared tempo, and the Jam tab&#39;s chords light up here live.</div>' +
      '</div>';

    els.title = document.getElementById('pn-title');
    els.stage = document.getElementById('pn-stage');
    els.legend = document.getElementById('pn-legend');
    els.playBtn = document.getElementById('pn-play');
    els.playBtn.innerHTML = App.icon('play', 14) + ' Play scale';

    state.display = String(App.store.get('pn.display', 'notes'));
    if (!/^(notes|intervals|degrees)$/.test(state.display)) state.display = 'notes';
    var seg = document.getElementById('pn-display');
    function paintSeg() {
      seg.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-pnmode') === state.display);
      });
    }
    paintSeg();
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-pnmode]');
      if (!b) return;
      state.display = b.getAttribute('data-pnmode');
      App.store.set('pn.display', state.display);
      paintSeg();
      render();
    });

    els.playBtn.addEventListener('click', psPlay);

    // pointerdown (not click) so keys feel instant, like the tap pads
    els.stage.addEventListener('pointerdown', function (e) {
      var k = e.target.closest ? e.target.closest('.pn-key') : null;
      if (!k) return;
      var midi = parseInt(k.getAttribute('data-midi'), 10);
      if (isNaN(midi)) return;
      play(midi, 0, 1.6, 0.55);
      pressKey(midi);
    });

    // shared context: follow key/scale changes from the bar, fretboard, theory…
    App.on('fb:set', function () { render(); });
    App.on('fb:scale', function () { render(); });
    App.on('jam:chord', function (ev) { jamLast = ev; jamPaint(ev); });
    App.on('jam:stopped', function () { jamLast = null; jamPaint(null); });

    prefetch();
    render();
  }

  function onShow() {
    render();       // palette may have been customized in the fretboard settings
    scrollToRoot();
  }

  function onHide() {
    psStop();
  }

  App.register('piano', {
    init: init,
    onShow: onShow,
    onHide: onHide
  });
})();
