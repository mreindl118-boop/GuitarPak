/* soundLAB OMR: port of homr/image_utils.py (AGPL-3.0, github.com/liebharc/homr). */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  var py = OMR.py, np = OMR.np;

  // homr: image_utils.py:6
  function limitX(image, x) { return Math.max(0, Math.min(py.int(image.w - 1), py.int(py.round(x)))); }
  // homr: image_utils.py:10
  function limitY(image, y) { return Math.max(0, Math.min(py.int(image.h - 1), py.int(py.round(y)))); }

  // homr: image_utils.py:14
  function cropImage(image, x1, y1, x2, y2) {
    return cropImageAndReturnNewTop(image, x1, y1, x2, y2)[0];
  }

  // homr: image_utils.py:19
  // -> [image[y1:y2, x1:x2] (a copy, numpy gives a view), [x1, y1] of the crop's top left]
  function cropImageAndReturnNewTop(image, x1, y1, x2, y2) {
    var xMin = Math.min(x1, x2), xMax = Math.max(x1, x2);
    var yMin = Math.min(y1, y2), yMax = Math.max(y1, y2);
    var x1Limited = limitX(image, xMin), y1Limited = limitY(image, yMin);
    var x2Limited = limitX(image, xMax), y2Limited = limitY(image, yMax);
    var newTopX = [x1Limited, y1Limited];
    return [np.crop(image, y1Limited, y2Limited, x1Limited, x2Limited), newTopX];
  }

  OMR.image_utils = { cropImage: cropImage, cropImageAndReturnNewTop: cropImageAndReturnNewTop, _limitX: limitX, _limitY: limitY };
})(typeof self !== 'undefined' ? self : globalThis);
