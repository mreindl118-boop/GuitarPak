/* soundLAB OMR: port of homr/color_adjust.py (AGPL-3.0, github.com/liebharc/homr).
   The segmentation input: the page in gray with contrast limited adaptive histogram
   equalization (bit-exact through opencv.js, checked against 03-clahe.png). */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  var cv2 = OMR.cv2;

  // homr: color_adjust.py:6
  function applyClahe(image) {
    image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY);
    var clahe = cv2.createCLAHE({ clipLimit: 1.0, tileGridSize: [8, 8] });
    return clahe.apply(image);
  }

  OMR.color_adjust = { applyClahe: applyClahe };
})(typeof self !== 'undefined' ? self : globalThis);
