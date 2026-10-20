/* soundLAB tone-in — ¼" / audio-input note detection as an app-wide input.
 * A guitar (DI, Helix, any interface on the chosen audio input) is detected
 * by pitch and fed through the SAME bus event as a MIDI keyboard —
 * `midi:note` with {silent:true} — so every instrument page reacts exactly
 * like it does to MIDI (fretboard rings, key presses, guide checks) without
 * double-sounding a voice. Opt-in from Settings > Sound input & output
 * (audio.tonein); uses the selected input (audio.inId). Low-confidence
 * frames are discarded, never guessed. Pauses on the Woodshed page, which
 * runs its own scoring mic on the same input. Follows the chosen input: a
 * new pick in Settings ('audioin:device' from js/audioin.js) re-opens it.
 * The chosen input is opened EXACTLY: when it is missing tone-in waits (a
 * devicechange retries) instead of pitch-detecting the default mic — the
 * room, or soundLAB's own speakers. An unplugged input (track ended) stops
 * it; plugging back in restarts it.
 */
(function () {
  'use strict';

  var running = false;
  var req = 0; // open token: a getUserMedia that resolves after stop() is dropped
  var ctx = null, an = null, buf = null, stream = null, timer = null;
  var curMidi = -1, candMidi = -1, candCount = 0, quiet = 0;

  function enabled() { return App.store.get('audio.tonein', false) === true; }

  function detectPitch(d, sr) {
    var minLag = Math.floor(sr / 1000), maxLag = Math.floor(sr / 60);
    var bestLag = -1, bestR = 0, energy = 0;
    for (var i = 0; i < d.length; i++) energy += d[i] * d[i];
    if (energy === 0) return null;
    for (var lag = minLag; lag <= maxLag; lag++) {
      var r = 0;
      for (var j = 0; j + lag < d.length; j += 2) r += d[j] * d[j + lag];
      r = (2 * r * 2) / energy;
      if (r > bestR) { bestR = r; bestLag = lag; }
    }
    if (bestLag < 0) return null;
    return { freq: sr / bestLag, clarity: Math.min(1, bestR) };
  }

  function noteOff() {
    if (curMidi !== -1) {
      App.emit('midi:note', { on: false, midi: curMidi, vel: 0, chan: 15, silent: true });
      curMidi = -1;
    }
  }

  function tick() {
    if (!an) return;
    if (App.active === 'shed') { noteOff(); return; } // Woodshed owns the input there
    an.getFloatTimeDomainData(buf);
    var rms = 0;
    for (var i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    if (rms < 0.01) {
      if (++quiet >= 3) { noteOff(); candMidi = -1; candCount = 0; }
      return;
    }
    quiet = 0;
    var p = detectPitch(buf, ctx.sampleRate);
    if (!p || p.clarity < 0.9) return; // discard, never punish
    var midi = Math.round(69 + 12 * Math.log(p.freq / 440) / Math.LN2);
    if (midi < 24 || midi > 96) return;
    if (midi === curMidi) { candMidi = -1; candCount = 0; return; }
    if (midi === candMidi) candCount++; else { candMidi = midi; candCount = 1; }
    if (candCount >= 2) { // two agreeing frames = a real note change
      noteOff();
      curMidi = midi;
      App.emit('midi:note', { on: true, midi: midi, vel: 90, chan: 15, silent: true });
      candMidi = -1;
      candCount = 0;
    }
  }

  function start() {
    if (running || !enabled() || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    var token = ++req;
    var inId = App.store.get('audio.inId', null);
    var cs = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
    if (inId) cs.deviceId = { exact: inId };
    navigator.mediaDevices.getUserMedia({ audio: cs }).then(function (st) {
      if (token !== req || running || !enabled()) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = st;
      var tr = st.getAudioTracks()[0];
      if (tr) {
        tr.onended = function () { // unplugged: a devicechange restarts it
          if (stream !== st) return;
          stop();
          App.emit('tonein:state', { running: false, error: 'the input was disconnected' });
        };
      }
      var src;
      try {
        ctx = App.getAudio();
        src = ctx.createMediaStreamSource(st);
        an = ctx.createAnalyser();
      } catch (e) { // no graph: let the capture go instead of holding a dead one
        stream = null;
        an = null;
        st.getTracks().forEach(function (t) { t.onended = null; t.stop(); });
        App.emit('tonein:state', { running: false, error: 'input unavailable' });
        return;
      }
      an.fftSize = 2048;
      buf = new Float32Array(an.fftSize);
      src.connect(an); // analysis only — never routed to the speakers
      running = true;
      timer = setInterval(tick, 40);
      App.emit('tonein:state', { running: true });
    }).catch(function (err) {
      if (token !== req) return;
      var n = err && err.name;
      App.emit('tonein:state', { running: false, error: n === 'NotFoundError' || n === 'OverconstrainedError'
        ? 'the chosen input is not connected' : 'input unavailable or permission denied' });
    });
  }

  function stop() {
    req++;
    if (timer) { clearInterval(timer); timer = null; }
    noteOff();
    if (stream) { stream.getTracks().forEach(function (t) { t.onended = null; t.stop(); }); stream = null; }
    an = null;
    running = false;
    App.emit('tonein:state', { running: false });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else if (enabled()) start();
  });

  // the chosen input changed (Settings > Sound input): listen to the new one
  App.on('audioin:device', function () {
    if (!enabled()) return;
    stop();
    if (!document.hidden) start();
  });

  // plug / unplug: a missing or ended input gets another try
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', function () {
        if (!enabled() || document.hidden) return;
        if (running) {
          var tr = stream && stream.getAudioTracks()[0];
          if (tr && tr.readyState !== 'ended') return; // still listening
          stop();
        }
        start();
      });
    }
  } catch (e) { /* no device events here */ }

  // auto-start on launch when the user has it on
  setTimeout(function () { if (enabled()) start(); }, 400);

  App.tonein = {
    start: start,
    stop: stop,
    get running() { return running; },
    _t: function () { return { stream: stream }; } // test hook
  };
})();
