/* Shared monophonic NSDF detector, extracted from the Tuner's McLeod-style
 * detector. Pure PCM analysis: no microphone, timer, speaker or score guesses. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SLPitchDetector = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  function finite(v, fallback) { return Number.isFinite(Number(v)) ? Number(v) : fallback; }
  function detect(samples, sampleRate, options) {
    options = options || {};
    var rate = finite(sampleRate, 0), length = samples && samples.length;
    if (!length || length < 128 || rate < 1000) return null;
    var stride = Math.max(1, Math.floor(rate / 24000)), n = Math.min(4096, Math.floor(length / stride));
    if (n < 128) return null;
    var x = new Float32Array(n), mean = 0, rms = 0, i;
    for (i = 0; i < n; i++) {
      var value = Number(samples[i * stride]);
      if (!Number.isFinite(value)) return null;
      x[i] = value; mean += value;
    }
    mean /= n;
    for (i = 0; i < n; i++) { x[i] -= mean; rms += x[i] * x[i]; }
    rms = Math.sqrt(rms / n);
    if (rms < Math.max(0.00001, finite(options.noiseFloor, 0.008))) return null;
    rate /= stride;
    var minHz = Math.max(20, finite(options.minFrequency, 40));
    var maxHz = Math.min(rate / 3, finite(options.maxFrequency, 4000));
    var minLag = Math.max(2, Math.floor(rate / maxHz));
    var maxLag = Math.min(Math.floor(rate / minHz), Math.floor(n / 2));
    if (minLag >= maxLag) return null;
    var width = n - maxLag, nsdf = new Float32Array(maxLag + 2), lag;
    for (lag = 2; lag <= maxLag; lag++) {
      var correlation = 0, energy = 0;
      for (i = 0; i < width; i++) {
        var a = x[i], b = x[i + lag]; correlation += a * b; energy += a * a + b * b;
      }
      nsdf[lag] = energy > 0 ? 2 * correlation / energy : 0;
    }
    // Search the first physical period even outside the accepted range, then
    // reject it below. Starting only at minLag can misread an out-of-range
    // high note's second period as an in-range octave-down answer.
    var searchLo = 2, crossed = false;
    for (lag = 2; lag <= maxLag; lag++) {
      if (nsdf[lag] < 0) { searchLo = lag + 1; crossed = true; break; }
    }
    if (!crossed) return null;
    function peak(at) {
      var left = nsdf[at - 1], center = nsdf[at], right = nsdf[at + 1];
      var denom = left - 2 * center + right;
      var shift = denom ? Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denom)) : 0;
      return { lag: at + shift, clarity: Math.min(1, center - 0.25 * (left - right) * shift) };
    }
    var peaks = [], best = 0;
    for (lag = searchLo + 1; lag < maxLag; lag++) {
      if (nsdf[lag] >= nsdf[lag - 1] && nsdf[lag] >= nsdf[lag + 1]) {
        var p = peak(lag); peaks.push(p); best = Math.max(best, p.clarity);
      }
    }
    if (!peaks.length || best < 0.5) return null;
    var chosen = peaks.filter(function (p) { return p.clarity >= best * 0.9; })[0];
    if (!chosen) return null;
    var frequency = rate / chosen.lag;
    if (frequency < minHz || frequency > maxHz) return null;
    // A stronger octave-down periodicity competing with a plausible first
    // peak is uncertain. Reject it rather than pulling toward a score target.
    var ambiguous = peaks.some(function (p) {
      return Math.abs(p.lag / chosen.lag - 2) < 0.04 && p.clarity > chosen.clarity + 0.012;
    });
    var reference = Math.max(400, Math.min(480, finite(options.referenceA4, 440)));
    var midiFloat = 69 + 12 * Math.log(frequency / reference) / Math.LN2;
    var midi = Math.round(midiFloat);
    return { frequency: frequency, freq: frequency, confidence: chosen.clarity, clarity: chosen.clarity,
      rms: rms, midiFloat: midiFloat, midi: midi, cents: (midiFloat - midi) * 100, ambiguous: ambiguous };
  }
  return { detect: detect };
});
