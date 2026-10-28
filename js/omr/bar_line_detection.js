/* soundLAB OMR: port of homr/bar_line_detection.py (AGPL-3.0, github.com/liebharc/homr). */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  var np = OMR.np, constants = OMR.constants;

  // homr: bar_line_detection.py:9
  function prepareBarLineImage(image) {
    var kernel = np.ones([5, 3], 'uint8');
    return OMR.cv2.dilate(image, kernel, { iterations: 1 });
  }

  // homr: bar_line_detection.py:15
  // Filters the bar line candidates based on their size.
  function detectBarLines(barLines, unitSize) {
    var result = [];
    for (var i = 0; i < barLines.length; i++) {
      var barLine = barLines[i];
      if (barLine.size[1] < constants.barLineMinHeight(unitSize)) continue;
      if (barLine.size[0] > constants.barLineMaxWidth(unitSize)) continue;
      result.push(barLine);
    }
    return result;
  }

  OMR.bar_line_detection = { prepareBarLineImage: prepareBarLineImage, detectBarLines: detectBarLines };
})(typeof self !== 'undefined' ? self : globalThis);
