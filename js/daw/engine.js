/* soundLAB sound library: the drum kit (DAW.createDrums, DAW.DRUM_LANES) for
 * Jam, Woodshed and Pads.
 *
 * Origin: the Sampler-DAW (OpenStudio) repo's DrumKit (src/audio/drums.ts),
 * carried over faithfully: a synthesized 808/909 kit, 8 lanes — kick, snare,
 * clap, closed hat, open hat, low tom, high tom, crash.
 *
 * The file keeps its 1.x path and the global name window.DAW until Phase C
 * rebuilds Pads and the Woodshed drums (docs/ROADMAP-2.0.md). The Studio
 * parts that lived here in 1.x (sampler, FX slots, WAV export, the session
 * and song sequencer) are not part of soundLAB 2.0; they are on main.
 *
 * Exposed on window.DAW (js/daw/synth.js adds the synth; either may load first):
 *   DAW.DRUM_LANES                      the 8 lane names
 *   DAW.createDrums(ctx, params?)       -> instrument (no params = default kit)
 * Instrument surface: output (GainNode), noteOn(lane, vel, time), noteOff(),
 * allNotesOff(), update(params), dispose(). It needs nothing but its ctx.
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

  window.DAW = window.DAW || {};
  DAW.DRUM_LANES = DRUM_LANES;
  DAW.createDrums = createDrums;
})();
