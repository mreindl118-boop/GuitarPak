/* soundLAB OMR: port of homr/resize.py (AGPL-3.0, github.com/liebharc/homr).
   Every page is scaled to a fixed width with Pillow's Image.resize (default BICUBIC), which
   OMR.pil.resize reproduces byte for byte. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  var py = OMR.py;

  // a Python exception: e.name = its class, e.message = Python's text
  function pyError(name, message) { var e = new Error(message); e.name = name; return e; }

  // homr: resize.py:7
  /**
   * Target a fixed width while preserving aspect ratio.
   */
  function calcTargetImageSize(width, height) {
    var targetWidth = 1920;

    if (width === targetWidth) return [width, height];

    var ratio = targetWidth / width;
    var tarW = targetWidth;
    var tarH = py.round(height * ratio);

    return [tarW, tarH];
  }

  // homr: resize.py:23
  // imageArr: an OMR.np uint8 image (h, w) or (h, w, 3) - Image.fromarray gives 'L' / 'RGB'
  // (the channel order does not matter, Pillow resizes every channel alike). Returns imageArr
  // itself when the size does not change, like Python.
  function resizeImage(imageArr) {
    var size = calcTargetImageSize(imageArr.w, imageArr.h), tarW = size[0], tarH = size[1];
    if (tarW === imageArr.w && tarH === imageArr.h) return imageArr;
    // Pillow's resize (its C core, ImagingResample) refuses a side < 1: an image more than
    // 3840 times wider than high rounds to 1920 x 0 and raises instead of giving an empty page
    if (tarW < 1 || tarH < 1) throw pyError('ValueError', 'height and width must be > 0');
    return OMR.pil.resize(imageArr, [tarW, tarH]);
  }

  OMR.resize = { calcTargetImageSize: calcTargetImageSize, resizeImage: resizeImage };
})(typeof self !== 'undefined' ? self : globalThis);
