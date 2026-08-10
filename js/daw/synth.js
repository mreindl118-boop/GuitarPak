/* soundLAB studio synth — the OpenStudio PolySynth, ported.
 *
 * Origin: the Sampler-DAW (OpenStudio) project's src/audio/synth.ts, carried
 * over as the first piece of the studio engine. Same architecture: polyphonic
 * subtractive voices (2 osc + noise -> filter w/ envelope -> amp envelope),
 * unison stacking, glide, one shared LFO, and full MPE expression — per-channel
 * pitch bend, pressure (loudness) and timbre (CC74 slide -> filter brightness)
 * so ROLI-style controllers play it expressively.
 *
 * Exposed as window.DAW (extended by later studio modules):
 *   DAW.defaultSynth()                  -> params object
 *   DAW.SYNTH_PRESETS                   [{id, name, params}]
 *   DAW.createSynth(ctx, params)        -> instrument
 * Instrument surface: output (GainNode), noteOn(pitch, vel, time, chan?),
 * noteOff(pitch, time, chan?), allNotesOff(), update(params), pitchBend(),
 * pressure(), timbre(), dispose().
 */
(function () {
  'use strict';

  var MAX_VOICES = 16;
  var sharedNoise = null;

  function noiseBuffer(ctx) {
    if (sharedNoise && sharedNoise.sampleRate === ctx.sampleRate) return sharedNoise;
    var buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    sharedNoise = buf;
    return buf;
  }

  function defaultSynth() {
    return {
      osc1: { wave: 'sawtooth', octave: 0, detune: -7, level: 0.7 },
      osc2: { wave: 'sawtooth', octave: 0, detune: 7, level: 0.7 },
      noise: 0,
      filter: { type: 'lowpass', cutoff: 4000, q: 1, envAmount: 2000 },
      ampEnv: { a: 0.01, d: 0.2, s: 0.7, r: 0.3 },
      filterEnv: { a: 0.01, d: 0.25, s: 0.4, r: 0.3 },
      lfo: { rate: 5, depth: 0, target: 'pitch' },
      unison: 1,
      unisonSpread: 12,
      glide: 0,
      gain: 0.8,
      bendRange: 48
    };
  }

  function preset(over) {
    var p = defaultSynth();
    for (var k in over) p[k] = over[k];
    return p;
  }

  var SYNTH_PRESETS = [
    { id: 'saw', name: 'Super saw', params: preset({ unison: 3, unisonSpread: 18,
      filter: { type: 'lowpass', cutoff: 6000, q: 1, envAmount: 1500 } }) },
    { id: 'pad', name: 'Warm pad', params: preset({
      osc1: { wave: 'sawtooth', octave: 0, detune: -5, level: 0.5 },
      osc2: { wave: 'triangle', octave: -1, detune: 5, level: 0.6 },
      ampEnv: { a: 0.8, d: 0.5, s: 0.8, r: 1.5 },
      filterEnv: { a: 0.9, d: 0.6, s: 0.5, r: 1.2 },
      filter: { type: 'lowpass', cutoff: 1800, q: 0.7, envAmount: 900 },
      unison: 2, unisonSpread: 14 }) },
    { id: 'keys', name: 'Soft keys', params: preset({
      osc1: { wave: 'triangle', octave: 0, detune: -3, level: 0.8 },
      osc2: { wave: 'sine', octave: 1, detune: 3, level: 0.25 },
      ampEnv: { a: 0.004, d: 0.5, s: 0.25, r: 0.35 },
      filterEnv: { a: 0.004, d: 0.3, s: 0.2, r: 0.3 },
      filter: { type: 'lowpass', cutoff: 3200, q: 0.6, envAmount: 1600 } }) },
    { id: 'bass', name: 'Round bass', params: preset({
      osc1: { wave: 'sawtooth', octave: -1, detune: 0, level: 0.9 },
      osc2: { wave: 'square', octave: -2, detune: 0, level: 0.35 },
      ampEnv: { a: 0.004, d: 0.25, s: 0.6, r: 0.15 },
      filter: { type: 'lowpass', cutoff: 900, q: 1.1, envAmount: 1400 },
      glide: 0.03 }) }
  ];

  function createSynth(ctx, params) {
    var p = params || defaultSynth();
    var voices = [];
    var lastFreq = null;

    var output = ctx.createGain();
    output.gain.value = p.gain;

    var lfo = ctx.createOscillator();
    lfo.frequency.value = p.lfo.rate;
    var lfoPitch = ctx.createGain();
    var lfoFilter = ctx.createGain();
    var lfoAmp = ctx.createGain();
    lfo.connect(lfoPitch);
    lfo.connect(lfoFilter);
    lfo.connect(lfoAmp);
    lfoAmp.connect(output.gain);
    lfo.start();

    function applyLfoDepth() {
      lfoPitch.gain.value = p.lfo.target === 'pitch' ? p.lfo.depth : 0;       // cents
      lfoFilter.gain.value = p.lfo.target === 'filter' ? p.lfo.depth * 40 : 0; // Hz
      lfoAmp.gain.value = p.lfo.target === 'amp' ? p.lfo.depth / 40 : 0;
    }
    applyLfoDepth();

    function disconnectVoice(v) {
      try {
        v.oscs.forEach(function (o) { o.disconnect(); });
        if (v.noise) v.noise.disconnect();
        v.filter.disconnect();
        v.amp.disconnect();
        v.pressGain.disconnect();
      } catch (e) { /* nodes may already be gone */ }
    }

    function killVoice(v, time) {
      v.amp.gain.cancelScheduledValues(time);
      v.amp.gain.setTargetAtTime(0, time, 0.01);
      var stopAt = time + 0.08;
      v.oscs.forEach(function (o) { try { o.stop(stopAt); } catch (e) { /* not started */ } });
      if (v.noise) { try { v.noise.stop(stopAt); } catch (e) { /* not started */ } }
    }

    function reap() {
      var now = ctx.currentTime;
      voices = voices.filter(function (v) {
        if (v.releaseAt !== null && now > v.releaseAt + p.ampEnv.r * 4 + 0.05) {
          disconnectVoice(v);
          return false;
        }
        return true;
      });
    }

    return {
      output: output,

      noteOn: function (pitch, vel, time, channel) {
        channel = channel || 0;
        if (voices.length >= MAX_VOICES) {
          // steal: oldest releasing voice first, then oldest
          var idx = -1;
          for (var s = 0; s < voices.length; s++) if (voices[s].releaseAt !== null) { idx = s; break; }
          var steal = idx >= 0 ? voices.splice(idx, 1)[0] : voices.shift();
          if (steal) killVoice(steal, time);
        }

        var filter = ctx.createBiquadFilter();
        filter.type = p.filter.type;
        filter.Q.value = p.filter.q;
        var baseCutoff = p.filter.cutoff;
        var fa = Math.max(0.001, p.filterEnv.a);
        var fd = Math.max(0.001, p.filterEnv.d);
        var peak = Math.min(18000, baseCutoff + p.filter.envAmount);
        var sus = Math.min(18000, baseCutoff + p.filter.envAmount * p.filterEnv.s);
        filter.frequency.setValueAtTime(Math.max(30, baseCutoff), time);
        filter.frequency.linearRampToValueAtTime(Math.max(30, peak), time + fa);
        filter.frequency.setTargetAtTime(Math.max(30, sus), time + fa, fd / 3);
        lfoFilter.connect(filter.frequency);

        var amp = ctx.createGain();
        var pressGain = ctx.createGain();
        pressGain.gain.value = 1;
        var aa = Math.max(0.001, p.ampEnv.a);
        var ad = Math.max(0.001, p.ampEnv.d);
        amp.gain.setValueAtTime(0, time);
        amp.gain.linearRampToValueAtTime(vel, time + aa);
        amp.gain.setTargetAtTime(vel * p.ampEnv.s, time + aa, ad / 3);

        filter.connect(amp);
        amp.connect(pressGain);
        pressGain.connect(output);

        var freq = Theory.noteFreq(pitch);
        var oscs = [];
        var baseDetunes = [];
        var unison = Math.max(1, Math.min(4, Math.round(p.unison)));
        for (var u = 0; u < unison; u++) {
          var spread = unison > 1 ? (u / (unison - 1) - 0.5) * 2 * p.unisonSpread : 0;
          [p.osc1, p.osc2].forEach(function (oc) {
            if (oc.level <= 0.001) return;
            var osc = ctx.createOscillator();
            osc.type = oc.wave;
            var det = oc.detune + spread;
            osc.detune.value = det;
            if (p.glide > 0 && lastFreq) {
              osc.frequency.setValueAtTime(lastFreq * Math.pow(2, oc.octave), time);
              osc.frequency.exponentialRampToValueAtTime(
                Math.max(1, freq * Math.pow(2, oc.octave)), time + p.glide);
            } else {
              osc.frequency.setValueAtTime(freq * Math.pow(2, oc.octave), time);
            }
            var g = ctx.createGain();
            g.gain.value = oc.level / unison;
            osc.connect(g);
            g.connect(filter);
            lfoPitch.connect(osc.detune);
            osc.start(time);
            oscs.push(osc);
            baseDetunes.push(det);
          });
        }

        var noise = null;
        if (p.noise > 0.001) {
          noise = ctx.createBufferSource();
          noise.buffer = noiseBuffer(ctx);
          noise.loop = true;
          var ng = ctx.createGain();
          ng.gain.value = p.noise;
          noise.connect(ng);
          ng.connect(filter);
          noise.start(time);
        }

        lastFreq = freq;
        voices.push({
          pitch: pitch, channel: channel, oscs: oscs, baseDetunes: baseDetunes,
          noise: noise, filter: filter, amp: amp, pressGain: pressGain,
          vel: vel, baseCutoff: baseCutoff, releaseAt: null
        });
      },

      noteOff: function (pitch, time, channel) {
        channel = channel || 0;
        for (var i = 0; i < voices.length; i++) {
          var v = voices[i];
          if (v.pitch === pitch && v.channel === channel && v.releaseAt === null) {
            v.releaseAt = time;
            var r = Math.max(0.005, p.ampEnv.r);
            v.amp.gain.cancelScheduledValues(time);
            v.amp.gain.setTargetAtTime(0, time, r / 3);
            v.filter.frequency.cancelScheduledValues(time);
            v.filter.frequency.setTargetAtTime(
              Math.max(30, v.baseCutoff), time, Math.max(0.005, p.filterEnv.r) / 3);
            var stopAt = time + r * 4 + 0.05;
            v.oscs.forEach(function (o) { o.stop(stopAt); });
            if (v.noise) v.noise.stop(stopAt);
            setTimeout(reap, (stopAt - ctx.currentTime) * 1000 + 100);
            break;
          }
        }
      },

      allNotesOff: function () {
        var t = ctx.currentTime;
        voices.forEach(function (v) { killVoice(v, t); });
        voices = [];
      },

      update: function (next) {
        p = next;
        output.gain.value = p.gain;
        lfo.frequency.value = p.lfo.rate;
        applyLfoDepth();
        voices.forEach(function (v) {
          v.filter.type = p.filter.type;
          v.filter.Q.value = p.filter.q;
        });
      },

      /* MPE per-channel pitch bend, in semitones. */
      pitchBend: function (semis, channel) {
        voices.forEach(function (v) {
          if (channel !== 0 && v.channel !== channel) return;
          v.oscs.forEach(function (o, i) {
            o.detune.setTargetAtTime(v.baseDetunes[i] + semis * 100, ctx.currentTime, 0.005);
          });
        });
      },

      /* MPE channel pressure 0..1 -> voice loudness. */
      pressure: function (value, channel) {
        voices.forEach(function (v) {
          if (channel !== 0 && v.channel !== channel) return;
          v.pressGain.gain.setTargetAtTime(0.3 + 0.7 * value, ctx.currentTime, 0.02);
        });
      },

      /* MPE timbre (CC74 slide) 0..1 -> filter brightness. */
      timbre: function (value, channel) {
        voices.forEach(function (v) {
          if (channel !== 0 && v.channel !== channel) return;
          var f = v.baseCutoff * Math.pow(4, value - 0.5);
          v.filter.frequency.setTargetAtTime(Math.min(18000, Math.max(60, f)), ctx.currentTime, 0.02);
        });
      },

      dispose: function () {
        this.allNotesOff();
        try { lfo.stop(); } catch (e) { /* already stopped */ }
        output.disconnect();
      }
    };
  }

  window.DAW = window.DAW || {};
  DAW.defaultSynth = defaultSynth;
  DAW.SYNTH_PRESETS = SYNTH_PRESETS;
  DAW.createSynth = createSynth;
})();
