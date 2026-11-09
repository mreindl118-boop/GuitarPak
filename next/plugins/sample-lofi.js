/* soundLAB sample plugin — "Lo-fi kit".
 * Load this file from Settings › Plugins to get:
 *   - a "Lo-fi" FX type in every Studio track's FX slot
 *     (crunchy downsampled color: lowpass + soft bitcrush behind wet/dry)
 *   - a "Glass bell" synth voice in the Tracks synth editor
 * It's also the template for writing your own — see PLUGINS.md.
 */

SoundLab.registerFx('lofi', {
  name: 'Lo-fi',
  build: function (ctx, fx) {
    var input = ctx.createGain();
    var output = ctx.createGain();
    var dry = ctx.createGain();
    var wet = ctx.createGain();
    dry.gain.value = 1 - fx.mix;
    wet.gain.value = fx.mix;

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.Q.value = 0.8;

    var crush = ctx.createWaveShaper();
    var n = 4096, steps = 24, curve = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i * 2) / n - 1;
      curve[i] = Math.round(x * steps) / steps;
    }
    crush.curve = curve;

    input.connect(dry); dry.connect(output);
    input.connect(lp); lp.connect(crush); crush.connect(wet); wet.connect(output);
    return {
      input: input,
      output: output,
      dispose: function () {
        try { input.disconnect(); dry.disconnect(); lp.disconnect(); crush.disconnect(); wet.disconnect(); output.disconnect(); } catch (e) { /* ok */ }
      }
    };
  }
});

var bell = SoundLab.daw.defaultSynth();
bell.osc1 = { wave: 'sine', octave: 0, detune: 0, level: 0.8 };
bell.osc2 = { wave: 'sine', octave: 2, detune: 4, level: 0.3 };
bell.ampEnv = { a: 0.002, d: 1.4, s: 0.0, r: 0.6 };
bell.filterEnv = { a: 0.002, d: 0.8, s: 0.1, r: 0.5 };
bell.filter = { type: 'lowpass', cutoff: 6500, q: 0.7, envAmount: 1200 };
SoundLab.registerSynthPreset({ id: 'bell', name: 'Glass bell', params: bell });
