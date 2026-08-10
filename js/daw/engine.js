/* soundLAB studio engine — the OpenStudio DAW's audio layer, ported and
 * rebuilt around soundLAB's one clock / one key / one AudioContext rule.
 *
 * From the Sampler-DAW (OpenStudio) repo, carried over faithfully:
 *   - DrumKit  (src/audio/drums.ts): synthesized 808/909 kit, 8 lanes —
 *     kick, snare, clap, closed hat, open hat, low tom, high tom, crash
 *   - Sampler  (src/audio/sampler.ts): pitch-shifted one-sample instrument
 *     with ADSR, loop points and per-channel bend
 *   - FX       (src/audio/effects.ts): reverb (convolver impulse), delay
 *     (feedback + wet/dry), drive (waveshaper) — the chain builder pattern
 *   - WAV      (src/audio/wav.ts): 16-bit PCM encode + download
 *
 * New here: the LOOP ENGINE — a groovebox-style session loop (1/2/4 bars,
 * all tracks in sync) scheduled with soundLAB's 25 ms lookahead pattern on
 * the shared AudioContext at the shared met.bpm tempo. Tracks hold either a
 * step pattern (drums) or a note clip (synth / sampler). Also: offline
 * render of the loop to a WAV file, and a live-play channel so the armed
 * track's instrument is playable from MIDI / QWERTY with MPE expression.
 * Extends window.DAW (js/daw/synth.js loads first).
 */
(function () {
  'use strict';

  // ---------------- drum kit (ported) ----------------

  var DRUM_LANES = ['Kick', 'Snare', 'Clap', 'Hat', 'Open hat', 'Low tom', 'Hi tom', 'Crash'];

  function defaultDrums() {
    return {
      gain: 0.9,
      lanes: DRUM_LANES.map(function (n) { return { name: n, tune: 0, decay: 0.5, level: 0.9 }; })
    };
  }

  function createDrums(ctx, params) {
    var p = params || defaultDrums();
    var output = ctx.createGain();
    output.gain.value = p.gain;
    var noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var nd = noise.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    function env(time, level, decay) {
      var g = ctx.createGain();
      g.gain.setValueAtTime(level, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + decay);
      g.connect(output);
      return g;
    }

    function noiseSrc(t) {
      var src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.start(t);
      return src;
    }

    function kick(t, level, tune, decay) {
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160 * tune, t);
      osc.frequency.exponentialRampToValueAtTime(45 * tune, t + 0.09);
      osc.connect(env(t, level * 1.2, decay));
      osc.start(t); osc.stop(t + decay + 0.05);
      var click = ctx.createOscillator();
      click.type = 'square';
      click.frequency.value = 900;
      click.connect(env(t, level * 0.3, 0.015));
      click.start(t); click.stop(t + 0.03);
    }

    function snare(t, level, tune, decay) {
      var body = ctx.createOscillator();
      body.type = 'triangle';
      body.frequency.setValueAtTime(220 * tune, t);
      body.frequency.exponentialRampToValueAtTime(140 * tune, t + 0.06);
      body.connect(env(t, level * 0.6, decay * 0.6));
      body.start(t); body.stop(t + decay + 0.05);
      var n = noiseSrc(t);
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 1800;
      n.connect(hp); hp.connect(env(t, level * 0.8, decay));
      n.stop(t + decay + 0.05);
    }

    function clap(t, level, decay) {
      for (var c = 0; c < 3; c++) {
        var at = t + c * 0.012;
        var n = noiseSrc(at);
        var bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.5;
        n.connect(bp); bp.connect(env(at, level * (c === 2 ? 1 : 0.5), c === 2 ? decay : 0.02));
        n.stop(at + decay + 0.05);
      }
    }

    function hat(t, level, tune, decay) {
      var n = noiseSrc(t);
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 7000 * tune;
      n.connect(hp); hp.connect(env(t, level * 0.7, decay));
      n.stop(t + decay + 0.05);
    }

    function tom(t, level, freq, decay) {
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 1.4, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
      osc.connect(env(t, level, decay));
      osc.start(t); osc.stop(t + decay + 0.05);
    }

    function crash(t, level, decay) {
      var n = noiseSrc(t);
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 5000;
      var bp = ctx.createBiquadFilter();
      bp.type = 'peaking'; bp.frequency.value = 9000; bp.gain.value = 6;
      n.connect(hp); hp.connect(bp); bp.connect(env(t, level * 0.6, decay));
      n.stop(t + decay + 0.1);
    }

    return {
      output: output,
      noteOn: function (lane, vel, time) {
        var l = p.lanes[lane];
        if (!l) return;
        var level = vel * l.level;
        if (level <= 0.001) return;
        var tune = Math.pow(2, l.tune / 12);
        var decay = 0.15 + l.decay * 1.5;
        if (lane === 0) kick(time, level, tune, decay);
        else if (lane === 1) snare(time, level, tune, decay * 0.5);
        else if (lane === 2) clap(time, level, decay * 0.4);
        else if (lane === 3) hat(time, level, tune, 0.02 + l.decay * 0.08);
        else if (lane === 4) hat(time, level, tune, 0.1 + l.decay * 0.5);
        else if (lane === 5) tom(time, level, 100 * tune, decay * 0.6);
        else if (lane === 6) tom(time, level, 180 * tune, decay * 0.5);
        else if (lane === 7) crash(time, level, decay * 1.6);
      },
      noteOff: function () { /* one-shots */ },
      allNotesOff: function () { /* one-shots decay on their own */ },
      update: function (next) { p = next; output.gain.value = p.gain; },
      dispose: function () { output.disconnect(); }
    };
  }

  // ---------------- sampler (ported) ----------------

  function defaultSampler() {
    return {
      sampleId: null, rootNote: 60, loop: false, start: 0, end: 1,
      env: { a: 0.003, d: 0.1, s: 0.9, r: 0.12 }, gain: 0.9
    };
  }

  // decoded AudioBuffers are context-independent — one registry serves both
  // the live context and offline renders
  var samples = {};   // sampleId -> AudioBuffer

  function createSampler(ctx, params) {
    var p = params || defaultSampler();
    var output = ctx.createGain();
    output.gain.value = p.gain;
    var voices = [];

    return {
      output: output,
      noteOn: function (pitch, vel, time, channel) {
        channel = channel || 0;
        var buffer = p.sampleId && samples[p.sampleId];
        if (!buffer) return;
        var src = ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = Math.pow(2, (pitch - p.rootNote) / 12);
        var startSec = p.start * buffer.duration;
        var endSec = p.end * buffer.duration;
        if (p.loop) {
          src.loop = true;
          src.loopStart = startSec;
          src.loopEnd = Math.max(startSec + 0.01, endSec);
        }
        var amp = ctx.createGain();
        var a = Math.max(0.001, p.env.a);
        var d = Math.max(0.001, p.env.d);
        amp.gain.setValueAtTime(0, time);
        amp.gain.linearRampToValueAtTime(vel, time + a);
        amp.gain.setTargetAtTime(vel * p.env.s, time + a, d / 3);
        src.connect(amp);
        amp.connect(output);
        src.start(time, startSec);
        if (!p.loop) src.stop(time + (endSec - startSec) / src.playbackRate.value + p.env.r + 0.1);
        var voice = { pitch: pitch, channel: channel, src: src, amp: amp, releaseAt: null };
        src.onended = function () {
          voices = voices.filter(function (v) { return v !== voice; });
          try { src.disconnect(); amp.disconnect(); } catch (e) { /* ok */ }
        };
        voices.push(voice);
      },
      noteOff: function (pitch, time, channel) {
        channel = channel || 0;
        var r = Math.max(0.005, p.env.r);
        for (var i = 0; i < voices.length; i++) {
          var v = voices[i];
          if (v.pitch === pitch && v.channel === channel && v.releaseAt === null) {
            v.releaseAt = time;
            v.amp.gain.cancelScheduledValues(time);
            v.amp.gain.setTargetAtTime(0, time, r / 3);
            try { v.src.stop(time + r * 4 + 0.05); } catch (e) { /* stopped */ }
            break;
          }
        }
      },
      allNotesOff: function () {
        var t = ctx.currentTime;
        voices.forEach(function (v) {
          v.amp.gain.cancelScheduledValues(t);
          v.amp.gain.setTargetAtTime(0, t, 0.01);
          try { v.src.stop(t + 0.08); } catch (e) { /* ok */ }
        });
        voices = [];
      },
      pitchBend: function (semis, channel) {
        voices.forEach(function (v) {
          if (channel !== 0 && v.channel !== channel) return;
          var base = Math.pow(2, (v.pitch - p.rootNote) / 12);
          v.src.playbackRate.setTargetAtTime(base * Math.pow(2, semis / 12), ctx.currentTime, 0.005);
        });
      },
      update: function (next) { p = next; output.gain.value = p.gain; },
      dispose: function () { this.allNotesOff(); output.disconnect(); }
    };
  }

  // ---------------- effects (ported subset) ----------------

  function wetDry(ctx, core, mix) {
    var input = ctx.createGain();
    var output = ctx.createGain();
    var dry = ctx.createGain();
    var wet = ctx.createGain();
    dry.gain.value = 1 - mix;
    wet.gain.value = mix;
    input.connect(dry); dry.connect(output);
    input.connect(core.input);
    core.output.connect(wet); wet.connect(output);
    return {
      input: input, output: output,
      dispose: function () {
        try { input.disconnect(); dry.disconnect(); core.output.disconnect(); wet.disconnect(); output.disconnect(); } catch (e) { /* ok */ }
      }
    };
  }

  function makeImpulse(ctx, seconds, decay) {
    var rate = ctx.sampleRate;
    var len = Math.max(1, Math.floor(rate * seconds));
    var buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var data = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function distortionCurve(drive) {
    var k = drive * 100 + 1;
    var n = 2048;
    var curve = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i * 2) / n - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  var fxPlugins = {};   // plugin FX types (SoundLab.registerFx): id -> {name, build}

  // fx: {type: 'none'|'reverb'|'delay'|'drive'|<plugin id>, mix: 0..1}
  function buildFx(ctx, fx) {
    var mix = Math.max(0, Math.min(1, fx.mix == null ? 0.3 : fx.mix));
    if (fxPlugins[fx.type]) {
      try {
        var built = fxPlugins[fx.type].build(ctx, { type: fx.type, mix: mix });
        if (built && built.input && built.output) return built;
      } catch (e) { console.error('plugin fx ' + fx.type, e); }
    }
    if (fx.type === 'reverb') {
      var conv = ctx.createConvolver();
      conv.buffer = makeImpulse(ctx, 2.2, 2.5);
      return wetDry(ctx, { input: conv, output: conv }, mix);
    }
    if (fx.type === 'delay') {
      var inNode = ctx.createGain();
      var delay = ctx.createDelay(4);
      delay.delayTime.value = 0.375;
      var fb = ctx.createGain();
      fb.gain.value = 0.35;
      inNode.connect(delay); delay.connect(fb); fb.connect(delay);
      return wetDry(ctx, { input: inNode, output: delay }, mix);
    }
    if (fx.type === 'drive') {
      var drive = 0.25 + mix * 0.6;
      var pre = ctx.createGain();
      pre.gain.value = 1 + drive * 2;
      var shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(drive);
      shaper.oversample = '4x';
      var post = ctx.createGain();
      post.gain.value = 1 / (1 + drive);
      pre.connect(shaper); shaper.connect(post);
      return wetDry(ctx, { input: pre, output: post }, 1);
    }
    var pass = ctx.createGain();
    return { input: pass, output: pass, dispose: function () { try { pass.disconnect(); } catch (e) { /* ok */ } } };
  }

  // ---------------- WAV (ported) ----------------

  function encodeWav(channels, sampleRate) {
    var numCh = channels.length;
    var numFrames = channels[0] ? channels[0].length : 0;
    var blockAlign = numCh * 2;
    var dataSize = numFrames * blockAlign;
    var buffer = new ArrayBuffer(44 + dataSize);
    var view = new DataView(buffer);
    function writeStr(off, s) { for (var i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); }
    writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); writeStr(36, 'data'); view.setUint32(40, dataSize, true);
    var offset = 44;
    for (var i = 0; i < numFrames; i++) {
      for (var ch = 0; ch < numCh; ch++) {
        var s = Math.max(-1, Math.min(1, channels[ch][i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  function audioBufferToWav(buf) {
    var chs = [];
    for (var i = 0; i < buf.numberOfChannels; i++) chs.push(buf.getChannelData(i));
    return encodeWav(chs, buf.sampleRate);
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  // ---------------- the loop engine ----------------
  // tracks: [{id, name, kind: 'drums'|'synth'|'sampler', voice (synth preset
  // id), sampler {rootNote, loop}, steps [lane][16*bars 0/1], notes [{m, v,
  // t beats, d beats}], fx {type, mix}, mix {vol 0..100, mute, solo}}]
  // One global loop length (bars); everything loops in sync at met.bpm.

  var tracks = [];
  var bars = 2;
  var playing = false;
  var timer = null;
  var vis = [];
  var channels = {};    // trackId -> {instrument, chain, gain, track}

  function ctxNow() { return App.getAudio(); }

  function bpm() {
    var v = parseInt(App.store.get('met.bpm', 100), 10);
    return (v >= 30 && v <= 280) ? v : 100;
  }

  function beatDur() { return 60 / bpm(); }

  function instrumentFor(ctx, track) {
    if (track.kind === 'drums') return createDrums(ctx, defaultDrums());
    if (track.kind === 'sampler') {
      var sp = defaultSampler();
      sp.sampleId = track.id;
      sp.rootNote = (track.sampler && track.sampler.rootNote) || 60;
      sp.loop = !!(track.sampler && track.sampler.loop);
      return createSampler(ctx, sp);
    }
    var preset = DAW.SYNTH_PRESETS[0];
    for (var i = 0; i < DAW.SYNTH_PRESETS.length; i++) {
      if (DAW.SYNTH_PRESETS[i].id === track.voice) preset = DAW.SYNTH_PRESETS[i];
    }
    var params = JSON.parse(JSON.stringify(preset.params));
    if (track.synth) {
      if (track.synth.cutoff) params.filter.cutoff = track.synth.cutoff;
      if (track.synth.attack != null) params.ampEnv.a = track.synth.attack;
      if (track.synth.release != null) params.ampEnv.r = track.synth.release;
      if (track.synth.glide != null) params.glide = track.synth.glide;
    }
    return DAW.createSynth(ctx, params);
  }

  function anySolo() {
    return tracks.some(function (t) { return t.mix.solo; });
  }

  function chanGain(track) {
    var solo = anySolo();
    var audible = !track.mix.mute && (!solo || track.mix.solo);
    return audible ? (track.mix.vol / 80) : 0;
  }

  function buildChannel(ctx, track, dest) {
    var inst = instrumentFor(ctx, track);
    var chain = buildFx(ctx, track.fx || { type: 'none' });
    var gain = ctx.createGain();
    gain.gain.value = chanGain(track);
    inst.output.connect(chain.input);
    chain.output.connect(gain);
    var analyser = null;
    if (ctx.createAnalyser && !(typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext)) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      gain.connect(analyser);
    }
    gain.connect(dest);
    return { instrument: inst, chain: chain, gain: gain, analyser: analyser, track: track };
  }

  function teardown() {
    Object.keys(channels).forEach(function (id) {
      var c = channels[id];
      try { c.instrument.dispose(); c.chain.dispose(); c.gain.disconnect(); } catch (e) { /* ok */ }
    });
    channels = {};
  }

  function ensureChannels() {
    var ctx = ctxNow();
    tracks.forEach(function (t) {
      if (!channels[t.id]) channels[t.id] = buildChannel(ctx, t, ctx.destination);
      channels[t.id].track = t;
    });
    Object.keys(channels).forEach(function (id) {
      if (!tracks.some(function (t) { return t.id === id; })) {
        var c = channels[id];
        try { c.instrument.dispose(); c.chain.dispose(); c.gain.disconnect(); } catch (e) { /* ok */ }
        delete channels[id];
      }
    });
    applyMix();
  }

  function applyMix() {
    var ctx = ctxNow();
    Object.keys(channels).forEach(function (id) {
      var c = channels[id];
      c.gain.gain.setTargetAtTime(chanGain(c.track), ctx.currentTime, 0.02);
    });
  }

  function rebuildChannel(id) {
    var c = channels[id];
    if (!c) return;
    try { c.instrument.dispose(); c.chain.dispose(); c.gain.disconnect(); } catch (e) { /* ok */ }
    delete channels[id];
    ensureChannels();
  }

  // global click track (app.click — a Settings toggle, mirrored on the Pads
  // page): a metronome blip on every beat of BOTH studio transports
  function clickOn() { return App.store.get('app.click', false) === true; }

  function clickBlip(ctx, t, strong) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = strong ? 1568 : 1046;
    g.gain.setValueAtTime(0.11, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.06);
  }

  function scheduleLoop(atT, ctx, chans) {
    var bd = beatDur();
    if (clickOn() && !(typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext)) {
      for (var cb = 0; cb < bars * 4; cb++) clickBlip(ctx, atT + cb * bd, cb % 4 === 0);
    }
    tracks.forEach(function (t) {
      var c = chans[t.id];
      if (!c) return;
      if (t.kind === 'drums') {
        var steps = t.steps || [];
        for (var lane = 0; lane < steps.length; lane++) {
          var row = steps[lane] || [];
          for (var s = 0; s < bars * 16; s++) {
            if (row[s]) c.instrument.noteOn(lane, 0.9, atT + s * bd / 4);
          }
        }
      } else {
        (t.notes || []).forEach(function (n) {
          if (n.t >= bars * 4) return; // beyond the loop
          var t0 = atT + n.t * bd;
          c.instrument.noteOn(n.m, (n.v / 127) * 0.85, t0, 0);
          c.instrument.noteOff(n.m, t0 + Math.max(0.05, n.d * bd), 0);
        });
      }
    });
  }

  // Live loop scheduling is per-STEP in a short rolling window (not whole
  // loops at a time) so every edit — painted steps, drawn notes, kit/voice
  // swaps via rebuildChannel — is audible within ~150 ms, mid-cycle, without
  // resetting the loop. scheduleLoop() above stays for the offline render.
  function scheduleStep(s, atT, ctx, chans) {
    if (s % 4 === 0 && clickOn()) clickBlip(ctx, atT, s % 16 === 0);
    var bd = beatDur(), sd = bd / 4;
    tracks.forEach(function (t) {
      var c = chans[t.id];
      if (!c) return;
      if (t.kind === 'drums') {
        var steps = t.steps || [];
        for (var lane = 0; lane < steps.length; lane++) {
          if ((steps[lane] || [])[s]) c.instrument.noteOn(lane, 0.9, atT);
        }
      } else {
        (t.notes || []).forEach(function (n) {
          if (Math.floor(n.t * 4 + 1e-6) !== s) return; // starts in this step?
          var t0 = atT + (n.t * 4 - s) * sd;
          c.instrument.noteOn(n.m, (n.v / 127) * 0.85, t0, 0);
          c.instrument.noteOff(n.m, t0 + Math.max(0.05, n.d * bd), 0);
        });
      }
    });
  }

  var nextStepI = 0; // continuous step counter; step index = nextStepI % (bars*16)
  var stepT = 0;     // audio-clock time of nextStepI

  function tick() {
    var ctx = ctxNow();
    var sd = beatDur() / 4;
    var total = bars * 16;
    if (stepT < ctx.currentTime - 0.02) { // stall: jump forward, never schedule the past
      var behind = Math.ceil((ctx.currentTime + 0.05 - stepT) / sd);
      nextStepI += behind;
      stepT += behind * sd;
    }
    while (stepT < ctx.currentTime + 0.15) {
      var s = nextStepI % total;
      scheduleStep(s, stepT, ctx, channels);
      vis.push({ t: stepT, step: s });
      if (vis.length > 400) vis.splice(0, vis.length - 400);
      nextStepI++;
      stepT += sd;
    }
    var hit = null;
    while (vis.length && vis[0].t <= ctx.currentTime) hit = vis.shift();
    if (hit) App.emit('st:step', { step: hit.step, bars: bars });
  }

  function play() {
    if (playing || !tracks.length) return;
    App.emit('transport:claim', { owner: 'loop' }); // stops met/jam/song app-wide
    if (songPlaying) songStop(); // one transport at a time
    var ctx = ctxNow();
    ensureChannels();
    vis.length = 0;
    nextStepI = 0;
    stepT = ctx.currentTime + 0.08;
    playing = true;
    App.wake.acquire('st-run');
    timer = setInterval(tick, 25);
    tick();
    App.emit('st:state', { playing: true });
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    playing = false;
    vis.length = 0;
    Object.keys(channels).forEach(function (id) {
      try { channels[id].instrument.allNotesOff(); } catch (e) { /* ok */ }
    });
    App.wake.release('st-run');
    App.emit('st:state', { playing: false });
  }

  // ---------------- SONG MODE: the arrangement transport ----------------
  // OpenStudio's Transport, ported ("A Tale of Two Clocks"): positions live
  // in the BEAT domain; origin(time,beat) maps beats to the audio clock; the
  // scheduler emits sample-accurate windows and loop-wraps by rebasing the
  // origin. Clips live on tracks: t.clips = [{id, start, len (beats),
  // src: 'pattern' | 'audio'}]. Pattern clips play the track's own steps or
  // notes from the clip start (truncated to len); audio clips fire the
  // sampler's buffer at natural pitch. Same channels, same mixer, same FX —
  // one engine, two ways to drive it (session loop / arrangement).

  var song = { loop: { on: false, start: 0, end: 16 } };
  var freeRun = false; // true while recording: no auto-stop at songEnd
  var songPlaying = false;
  var songTimer = null;
  var origin = { time: 0, beat: 0 };
  var schedBeat = 0;
  var stoppedAt = 0;
  var stats = { stalls: 0 };

  function beatToTime(b) { return origin.time + (b - origin.beat) * beatDur(); }

  function position() {
    if (!songPlaying) return stoppedAt;
    var ctx = ctxNow();
    return origin.beat + (ctx.currentTime - origin.time) / beatDur();
  }

  function songEnd() {
    var end = 0;
    tracks.forEach(function (t) {
      (t.clips || []).forEach(function (c) { end = Math.max(end, c.start + c.len); });
    });
    return end;
  }

  function scheduleClipWindow(from, to, chans, b2t) {
    if (clickOn() && chans === channels) { // live only — never in WAV renders
      var ctx = ctxNow();
      for (var cb = Math.ceil(from - 1e-9); cb < to; cb++) {
        if (cb >= from) clickBlip(ctx, b2t(cb), cb % 4 === 0);
      }
    }
    tracks.forEach(function (t) {
      var c = chans[t.id];
      if (!c) return;
      (t.clips || []).forEach(function (clip) {
        if (clip.start + clip.len <= from || clip.start >= to) return;
        if (clip.src === 'audio') {
          if (clip.start >= from && clip.start < to) {
            var root = (t.sampler && t.sampler.rootNote) || 60;
            c.instrument.noteOn(root, 0.9, b2t(clip.start), 0);
            c.instrument.noteOff(root, b2t(clip.start + clip.len), 0);
          }
          return;
        }
        if (t.kind === 'drums') {
          var steps = t.steps || [];
          var firstStep = Math.max(0, Math.ceil((from - clip.start) * 4));
          var lastStep = Math.min(clip.len * 4, (to - clip.start) * 4);
          for (var lane = 0; lane < steps.length; lane++) {
            var row = steps[lane] || [];
            for (var s = firstStep; s < lastStep; s++) {
              var b = clip.start + s / 4;
              if (b < from || b >= to) continue;
              if (row[s % row.length]) c.instrument.noteOn(lane, 0.9, b2t(b));
            }
          }
        } else {
          (t.notes || []).forEach(function (n) {
            var b = clip.start + n.t;
            if (n.t >= clip.len || b < from || b >= to) return;
            var t0 = b2t(b);
            c.instrument.noteOn(n.m, (n.v / 127) * 0.85, t0, 0);
            c.instrument.noteOff(n.m, t0 + Math.max(0.05, Math.min(n.d, clip.len - n.t) * beatDur()), 0);
          });
        }
      });
    });
  }

  function songTick() {
    if (!songPlaying) return;
    var ctx = ctxNow();
    if (beatToTime(schedBeat) < ctx.currentTime - 0.02) {
      stats.stalls++;
      origin.time = ctx.currentTime + 0.05;
      origin.beat = schedBeat;
    }
    var horizon = ctx.currentTime + 0.12;
    var guard = 0;
    while (beatToTime(schedBeat) < horizon && guard++ < 32) {
      var horizonBeat = origin.beat + (horizon - origin.time) / beatDur();
      var lp = song.loop;
      var loopValid = lp.on && lp.end > lp.start + 0.01;
      if (loopValid && schedBeat < lp.end && horizonBeat >= lp.end) {
        if (lp.end > schedBeat) scheduleClipWindow(schedBeat, lp.end, channels, beatToTime);
        var wrapTime = beatToTime(lp.end);
        origin.time = wrapTime;
        origin.beat = lp.start;
        schedBeat = lp.start;
      } else {
        scheduleClipWindow(schedBeat, horizonBeat, channels, beatToTime);
        schedBeat = horizonBeat;
        break;
      }
    }
    // freeRun (recording): keep rolling past the arrangement's end
    if (!freeRun && !song.loop.on && schedBeat > songEnd() + 1) songStop();
  }

  function songPlay(fromBeat) {
    if (songPlaying) return;
    App.emit('transport:claim', { owner: 'song' });
    if (playing) stop(); // one transport at a time — session loop yields
    var ctx = ctxNow();
    ensureChannels();
    var start = (fromBeat != null) ? fromBeat : stoppedAt;
    if (song.loop.on && song.loop.end > song.loop.start && start >= song.loop.end) start = song.loop.start;
    songPlaying = true;
    origin.time = ctx.currentTime + 0.06;
    origin.beat = start;
    schedBeat = start;
    App.wake.acquire('st-song');
    songTimer = setInterval(songTick, 25);
    songTick();
    App.emit('st:tr', { playing: true });
  }

  function songStop() {
    if (!songPlaying) return;
    stoppedAt = Math.max(0, position());
    songPlaying = false;
    if (songTimer) { clearInterval(songTimer); songTimer = null; }
    Object.keys(channels).forEach(function (id) {
      try { channels[id].instrument.allNotesOff(); } catch (e) { /* ok */ }
    });
    App.wake.release('st-song');
    App.emit('st:tr', { playing: false });
  }

  function setPosition(beat) {
    stoppedAt = Math.max(0, beat);
    if (songPlaying) {
      var ctx = ctxNow();
      Object.keys(channels).forEach(function (id) {
        try { channels[id].instrument.allNotesOff(); } catch (e) { /* ok */ }
      });
      origin.time = ctx.currentTime + 0.05;
      origin.beat = stoppedAt;
      schedBeat = stoppedAt;
    }
  }

  // offline render of the arrangement -> WAV blob
  function renderSong() {
    var bd = beatDur();
    var end = songEnd();
    if (end <= 0) return Promise.reject(new Error('empty song'));
    var len = end * bd + 1.5;
    var sr = 44100;
    var off = new OfflineAudioContext(2, Math.ceil(len * sr), sr);
    var chans = {};
    tracks.forEach(function (t) { chans[t.id] = buildChannel(off, t, off.destination); });
    scheduleClipWindow(0, end, chans, function (b) { return 0.05 + b * bd; });
    return off.startRendering().then(audioBufferToWav);
  }

  // live play: route an armed track's input through its real channel
  function liveChannel(trackId) {
    var t = null;
    tracks.forEach(function (x) { if (x.id === trackId) t = x; });
    if (!t) return null;
    ensureChannels();
    return channels[trackId] || null;
  }

  // offline render of one full loop -> WAV blob
  function render() {
    var bd = beatDur();
    var len = bars * 4 * bd + 1.5; // + tail
    var sr = 44100;
    var off = new OfflineAudioContext(2, Math.ceil(len * sr), sr);
    var chans = {};
    tracks.forEach(function (t) { chans[t.id] = buildChannel(off, t, off.destination); });
    scheduleLoop(0.02, off, chans);
    return off.startRendering().then(function (buf) {
      return audioBufferToWav(buf);
    });
  }

  window.DAW = window.DAW || {};
  DAW.DRUM_LANES = DRUM_LANES;
  DAW.samples = samples;
  DAW.createDrums = createDrums;
  DAW.createSampler = createSampler;
  DAW.buildFx = buildFx;
  DAW.fxPlugins = fxPlugins;
  DAW.audioBufferToWav = audioBufferToWav;
  DAW.downloadBlob = downloadBlob;
  App.on('transport:claim', function (d) {
    if (!d) return;
    if (d.owner !== 'loop' && playing) stop();
    if (d.owner !== 'song' && songPlaying) songStop();
  });

  DAW.engine = {
    get tracks() { return tracks; },
    set tracks(t) { tracks = t; if (playing) ensureChannels(); },
    get bars() { return bars; },
    set bars(b) { bars = (b === 1 || b === 2 || b === 4) ? b : 2; },
    get playing() { return playing; },
    play: play,
    stop: stop,
    applyMix: applyMix,
    rebuildChannel: rebuildChannel,
    liveChannel: liveChannel,
    render: render,
    // song mode (arrangement)
    get songPlaying() { return songPlaying; },
    get loopRegion() { return song.loop; },
    set loopRegion(l) { if (l && typeof l.start === 'number') song.loop = { on: !!l.on, start: Math.max(0, l.start), end: Math.max(l.start + 0.25, l.end) }; },
    songPlay: songPlay,
    songStop: songStop,
    get freeRun() { return freeRun; },
    set freeRun(v) { freeRun = !!v; },
    setPosition: setPosition,
    position: position,
    songEnd: songEnd,
    renderSong: renderSong,
    channelAnalyser: function (id) { return channels[id] ? channels[id].analyser : null; },
    stats: stats
  };
})();
