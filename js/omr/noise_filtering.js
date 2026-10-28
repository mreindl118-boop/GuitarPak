/* soundLAB OMR: port of homr/noise_filtering.py (AGPL-3.0, github.com/liebharc/homr).
   Pages with noisy regions (e.g. a photo's texture predicted as staff lines) get those
   regions blanked in every prediction: the staff mask is cut into a 20 x 20 grid, each
   cell's noise is estimated with a Laplacian-like filter and cells which are noisy next to
   a noisy neighbour are masked out (unless that would remove more than half the page). */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  var np = OMR.np, cv2 = OMR.cv2, constants = OMR.constants;
  var eprint = function () { OMR.simple_logging.eprint.apply(null, arguments); };

  var NOISE_KERNEL = [[1, -2, 1], [-2, 4, -2], [1, -2, 1]];

  // homr: noise_filtering.py:11
  // -> float64 (Python annotates int; the value is a float)
  function estimateNoise(gray) {
    var H = gray.h, W = gray.w;
    var M = NOISE_KERNEL;
    var f = cv2.filter2D(gray, cv2.CV_64F, M).data;
    // integer-valued doubles: the sum is exact in any order (numpy's pairwise sum included)
    var s = 0;
    for (var i = 0; i < f.length; i++) s += Math.abs(f[i]);
    var sigma = s / (H * W);
    return sigma;
  }

  // homr: noise_filtering.py:18
  // -> mask (uint8 image, 255 = keep) or null
  function createNoiseGrid(gray, debug) {
    var imgheight = gray.h, imgwidth = gray.w;
    var M = Math.floor(imgheight / 20), N = Math.floor(imgwidth / 20);

    // Python always draws the grid onto a colour copy for debug.write_image; the drawing has
    // no effect on the result and costs a full-page cv.Mat per putText call through
    // opencv.js, so it only happens when debugging
    var debugImage = debug && debug.debug ? cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR) : null;
    var mask = np.zeros([imgheight, imgwidth], 'uint8');

    var grid = createGrid(gray, M, N);
    var r = applyNoiseFilter(grid, mask, debugImage, M, N);
    var filteredCells = r[0], totalCells = r[1];

    if (debug && debug.debug) debug.writeImage('noise_crop', debugImage);

    return handleFilterResults(filteredCells, totalCells, mask);
  }

  // a Python exception: e.name = its class, e.message = Python's text
  function pyError(name, message) { var e = new Error(message); e.name = name; return e; }

  // range(0, n, step) like Python (a zero step raises)
  function steps(n, step) {
    if (step === 0) throw pyError('ValueError', 'range() arg 3 must not be zero');
    var out = [];
    for (var v = 0; v < n; v += step) out.push(v);
    return out;
  }

  // homr: noise_filtering.py:34
  // -> uint8 image of ceil(h / M) x ceil(w / N) noise values
  function createGrid(gray, M, N) {
    var imgheight = gray.h, imgwidth = gray.w;
    // np.zeros([int(np.ceil(imgheight / M)), ...]) comes first in Python: a mask lower or narrower
    // than 20 px (M or N == 0) raises ZeroDivisionError there, before range() could
    if (M === 0 || N === 0) throw pyError('ZeroDivisionError', 'division by zero');
    var grid = np.zeros([Math.ceil(imgheight / M), Math.ceil(imgwidth / N)], 'uint8');
    var ys = steps(imgheight, M), xs = steps(imgwidth, N);

    for (var i = 0; i < ys.length; i++) {
      var y1 = ys[i];
      for (var j = 0; j < xs.length; j++) {
        var x1 = xs[j];
        var y2 = y1 + M, x2 = x1 + N;
        var tile = np.crop(gray, y1, y2, x1, x2);
        var noise = estimateNoise(tile);
        // grid[i, j] = noise: numpy's unsafe float64 -> uint8 cast truncates and wraps
        grid.data[i * grid.w + j] = Math.trunc(noise) & 255;
      }
    }

    return grid;
  }

  // homr: noise_filtering.py:48
  // mask is written in place; debugImage may be null (no drawing). -> [filteredCells, totalCells]
  function applyNoiseFilter(grid, mask, debugImage, M, N) {
    var imgheight = mask.h, imgwidth = mask.w;
    var filteredCells = 0, totalCells = 0;
    var limit = constants.imageNoiseLimit;
    var ys = steps(imgheight, M), xs = steps(imgwidth, N);

    for (var i = 0; i < ys.length; i++) {
      var y1 = ys[i];
      for (var j = 0; j < xs.length; j++) {
        var x1 = xs[j];
        var y2 = y1 + M, x2 = x1 + N;
        var noise = grid.data[i * grid.w + j];
        var neighbors = getNeighbors(grid, i, j);
        var anyNeighborAboveLimit = neighbors.some(function (v) { return v > limit; });

        if (noise > limit && anyNeighborAboveLimit) {
          if (debugImage) cv2.rectangle(debugImage, [x1, y1], [x2, y2], [0, 255, 255]);
          filteredCells += 1;
        } else {
          np.assign(mask, y1, y2, x1, x2, 255);
          if (debugImage) cv2.rectangle(debugImage, [x1, y1], [x2, y2], [0, 255, 0]);
        }

        if (debugImage) {
          cv2.putText(debugImage, noise.toFixed(2), [x1 + Math.floor(N / 2), y1 + Math.floor(M / 2)],
            cv2.FONT_HERSHEY_PLAIN, 1, [0, 0, 255]);
        }
        totalCells += 1;
      }
    }

    return [filteredCells, totalCells];
  }

  // homr: noise_filtering.py:81
  function getNeighbors(grid, i, j) {
    var neighbors = [], g = grid.data, w = grid.w;
    if (i > 0) neighbors.push(g[(i - 1) * w + j]);
    if (j > 0) neighbors.push(g[i * w + j - 1]);
    if (i < grid.h - 1) neighbors.push(g[(i + 1) * w + j]);
    if (j < grid.w - 1) neighbors.push(g[i * w + j + 1]);
    return neighbors;
  }

  // homr: noise_filtering.py:94
  function handleFilterResults(filteredCells, totalCells, mask) {
    var half = 0.5;
    if (filteredCells / totalCells > half) {
      eprint('Would filter more than 50% of the image with ' + filteredCells + ' of ' + totalCells + ' ' +
        'cells, skipping noise filtering');
      return null;
    } else if (filteredCells > 0) {
      eprint('Filtered ' + filteredCells + ' of ' + totalCells + ' cells');
      return mask;
    }
    return null;
  }

  // homr: noise_filtering.py:108
  // -> the same InputPredictions when nothing is filtered, else a new one
  function filterPredictions(prediction, debug) {
    // 255 * staff: uint8 arithmetic (wraps like numpy)
    var mask = createNoiseGrid(np.map(prediction.staff, function (v) { return (255 * v) & 255; }, 'uint8'), debug);
    if (mask === null) return prediction;
    var and = function (img) { return cv2.bitwise_and(img, img, { mask: mask }); };
    return new OMR.model.InputPredictions(
      and(prediction.original),          // original
      and(prediction.preprocessed),      // preprocessed
      and(prediction.notehead),          // notehead
      and(prediction.symbols),           // symbols
      and(prediction.staff),             // staff
      and(prediction.clefsKeys),         // clefs_keys
      and(prediction.stemsRest)          // stems_rest
    );
  }

  OMR.noise_filtering = {
    estimateNoise: estimateNoise, createNoiseGrid: createNoiseGrid, createGrid: createGrid,
    applyNoiseFilter: applyNoiseFilter, getNeighbors: getNeighbors, handleFilterResults: handleFilterResults,
    filterPredictions: filterPredictions
  };
})(typeof self !== 'undefined' ? self : globalThis);
