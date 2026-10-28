/* soundLAB OMR: port of homr/find_peaks.py (AGPL-3.0, github.com/liebharc/homr). */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};

  // homr: find_peaks.py:6
  // Find peaks in a 1D array without using scipy.
  //   x           1D signal data (array or typed array)
  //   opts        {height, distance, prominence} (Python keyword arguments, all optional)
  // -> [peaks (array of indices), {}] (the dict is empty, kept for compatibility)
  function findPeaks(x, opts) {
    var height = opts && opts.height !== undefined ? opts.height : null;
    var distance = opts && opts.distance !== undefined ? opts.distance : null;
    var prominence = opts && opts.prominence !== undefined ? opts.prominence : null;
    var n = x.length;
    if (n < 3) return [[], {}];

    // find local maxima, handling flat regions
    var peaks = [], i = 1, j;
    while (i < n - 1) {
      if (x[i] > x[i - 1]) {
        // check if we're at a local maximum or the start of a plateau: find its end
        j = i;
        while (j < n - 1 && x[j] === x[j + 1]) j++;
        // the plateau ends with a descent: a peak at the midpoint of the plateau
        if (j < n - 1 && x[j] > x[j + 1]) peaks.push(Math.floor((i + j) / 2));
        i = j + 1;
      } else if (x[i] === x[i - 1]) {
        // start of a flat region from the left
        j = i;
        while (j < n - 1 && x[j] === x[j + 1]) j++;
        // a peak if higher than the left and either at the end or higher than the right
        if (j < n - 1 && x[j] > x[j + 1]) peaks.push(Math.floor((i + j) / 2));
        i = j + 1;
      } else {
        i += 1;
      }
    }
    if (!peaks.length) return [[], {}];

    // apply the height threshold
    if (height !== null) peaks = peaks.filter(function (p) { return x[p] >= height; });
    if (!peaks.length) return [[], {}];

    // apply the prominence filter
    if (prominence !== null) {
      var valid = [];
      for (var q = 0; q < peaks.length; q++) {
        var peak = peaks[q], k;
        // the lowest contour line around the peak: look left for the minimum until we hit a
        // higher peak or the boundary, then the same to the right
        var leftMin = x[peak];
        for (k = peak - 1; k >= 0; k--) { if (x[k] > x[peak]) break; leftMin = Math.min(leftMin, x[k]); }
        var rightMin = x[peak];
        for (k = peak + 1; k < n; k++) { if (x[k] > x[peak]) break; rightMin = Math.min(rightMin, x[k]); }
        // prominence is the height above the higher of the two minima
        if (x[peak] - Math.max(leftMin, rightMin) >= prominence) valid.push(peak);
      }
      peaks = valid;
    }
    if (!peaks.length) return [[], {}];

    // apply the distance constraint (keep the highest peaks)
    if (distance !== null && peaks.length > 1) {
      // sort peaks by height (descending): np.argsort(x[peaks])[::-1]. numpy's default argsort
      // is not stable: equal heights (common - full-width staff lines give identical row counts)
      // come in the order of its SIMD sorting network, which decides which of two equal peaks
      // closer than `distance` survives. OMR.np.argsortQuick reproduces numpy 2.4 on AVX-512.
      var order = OMR.np.argsortQuick(peaks.map(function (p) { return x[p]; }));
      order.reverse();
      var keep = [];
      for (var o = 0; o < order.length; o++) {
        var pk = peaks[order[o]], far = true;
        // this peak must be far enough from all kept peaks
        for (var m = 0; m < keep.length; m++) if (!(Math.abs(keep[m] - pk) >= distance)) { far = false; break; }
        if (!keep.length || far) keep.push(pk);
      }
      // sort back to the original order
      peaks = keep.sort(function (a, b) { return a - b; });
    }
    return [peaks, {}];
  }

  OMR.find_peaks = { findPeaks: findPeaks };
})(typeof self !== 'undefined' ? self : globalThis);
