/* soundLAB OMR: port of homr/autocrop.py (AGPL-3.0, github.com/liebharc/homr).
   Finds the sheet of paper on a photo, crops to it and paints what is beside a rotated
   sheet (e.g. a desk) in the paper's colour. Images are OMR.np images (BGR uint8, HWC).

   numpy semantics kept here: _chromaticity is float32 (pixels.astype(np.float32) + 1, a
   float32 channel sum and division); np.median of float32 values gives the float32 mean of
   the two middle values; the 0.07 limit is compared as float32 (NumPy 2's weak Python
   scalars: np.float32(x) <= 0.07 casts 0.07 to float32). Medians of uint8 pixels and
   smooth.mean(axis=2) are float64 like numpy. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  var np = OMR.np, cv2 = OMR.cv2;
  var f32 = Math.fround;
  // a Python exception: e.name = its class, e.message = Python's text
  function pyError(name, message) { var e = new Error(message); e.name = name; return e; }

  // homr: autocrop.py:7
  /**
   * Find the largest contour on the image, which is expected to be the paper of sheet music
   * and extracts it from the image. If no contour is found, then the image is assumed to be
   * a full page view of sheet music and is returned as is. Areas beside the paper which
   * have another color than the paper, e.g. a desk, are painted in the paper color.
   */
  function autocrop(img) {
    var r = autocropWithOffset(img);
    return r[0];
  }

  // Light and shadows change the brightness of paper but hardly its color.
  // Mixed daylight and lamp light change it at most by this much.
  var maxChromaticityDifference = 0.07;
  // the limit as numpy compares it with float32 values
  var MAX_CHROMA_F32 = f32(maxChromaticityDifference);

  // homr: autocrop.py:23
  // Color without brightness: every channel divided by the sum of the channels.
  // pixels: a flat uint8 array of BGR triples (numpy (N, 3) or (h, w, 3); `ch` values per pixel
  // for another channel count, default 3) -> Float32Array of the same length (float32 like
  // numpy: (v + 1) / sum, the sum taken left to right)
  function _chromaticity(pixels, ch) {
    ch = ch || 3;
    var n = pixels.length, out = new Float32Array(n), k;
    for (var i = 0; i < n; i += ch) {
      var s = 0;
      for (k = 0; k < ch; k++) s += pixels[i + k] + 1; // integers: exact in float32 as in numpy's float32 sum
      for (k = 0; k < ch; k++) out[i + k] = (pixels[i + k] + 1) / s; // Float32Array rounds = float32 division
    }
    return out;
  }

  // np.median(a, axis=0) of an (N, 3) array given flat (N, ch with ch given): per channel, the
  // middle value or the mean of the two middle values (float32 for float32 input, float64 for uint8)
  function _medianAxis0(flat, nch) {
    nch = nch || 3;
    var n = flat.length / nch, out = [], single = flat instanceof Float32Array;
    if (!n) { for (var e = 0; e < nch; e++) out.push(NaN); return out; }
    var col = single ? new Float32Array(n) : new Float64Array(n), h = n >> 1;
    for (var ch = 0; ch < nch; ch++) {
      for (var i = 0; i < n; i++) col[i] = flat[i * nch + ch];
      col.sort(); // typed-array sort is numeric
      if (n % 2) out.push(col[h]);
      else out.push(single ? f32(f32(col[h - 1] + col[h]) / 2) : (col[h - 1] + col[h]) / 2);
    }
    return out;
  }

  // np.abs(chromaticity - paper_chromaticity).sum() of one float32 triple (float32, left to right)
  function _chromaDistance(c0, c1, c2, paper) {
    var d0 = Math.abs(f32(c0 - paper[0])), d1 = Math.abs(f32(c1 - paper[1])), d2 = Math.abs(f32(c2 - paper[2]));
    return f32(f32(d0 + d1) + d2);
  }

  // homr: autocrop.py:29
  function _isPaper(pixels, paperChromaticity) {
    var size = pixels.data.length;
    if (size === 0) return true;
    // pixels.reshape(-1, 3) and the (3,) - (k,) subtraction: a page that is not 3-channel
    // (BGRA: homr gets BGR from cv2.imread) raises at one of them, like Python
    if (size % 3) throw pyError('ValueError', 'cannot reshape array of size ' + size + ' into shape (3)');
    if (paperChromaticity.length !== 3) {
      throw pyError('ValueError', 'operands could not be broadcast together with shapes (3,) (' + paperChromaticity.length + ',) ');
    }
    var chromaticity = _medianAxis0(_chromaticity(pixels.data));
    return _chromaDistance(chromaticity[0], chromaticity[1], chromaticity[2], paperChromaticity) <= MAX_CHROMA_F32;
  }

  // homr: autocrop.py:36
  /**
   * Extends the box to the image border on every side where the strip beside it is
   * paper, e.g. in a shadow.
   */
  function _keepSidesWithPaper(img, box, paperChromaticity) {
    var x = box[0], y = box[1], w = box[2], h = box[3];
    var height = img.h, width = img.w;
    // Only the strips beside the box, the corners can contain e.g. a desk at another side
    var keepLeft = _isPaper(np.crop(img, y, y + h, null, x), paperChromaticity);
    var keepRight = _isPaper(np.crop(img, y, y + h, x + w, null), paperChromaticity);
    var keepTop = _isPaper(np.crop(img, null, y, x, x + w), paperChromaticity);
    var keepBottom = _isPaper(np.crop(img, y + h, null, x, x + w), paperChromaticity);
    var left = keepLeft ? 0 : x;
    var top = keepTop ? 0 : y;
    var right = keepRight ? width : x + w;
    var bottom = keepBottom ? height : y + h;
    return [left, top, right - left, bottom - top];
  }

  // homr: autocrop.py:57
  /**
   * Removes what is beside the sheet, e.g. the corners of a desk beside a rotated
   * sheet, by filling it with the color of the paper. The sheet itself is unchanged.
   * crop: BGR image, sheet: the paper's contour in crop coordinates (Int32Array x,y pairs),
   * paper: flat uint8 BGR triples sampled from the paper.
   */
  function _removeSurroundings(crop, sheet, paper) {
    var h = crop.h, w = crop.w, n = h * w, i;
    var besideSheet = np.full([h, w], 1, 'uint8');
    cv2.fillPoly(besideSheet, [cv2.convexHull(sheet)], 0);
    var paperColor = _medianAxis0(paper); // float64 (uint8 input)
    var paperChromaticity = _medianAxis0(_chromaticity(paper));
    // Single pixels are too noisy to compare their color
    var smooth = cv2.blur(crop, [7, 7]);
    // paper_color.mean(): float64 mean of three values
    var brightLimit = 0.25 * ((paperColor[0] + paperColor[1] + paperColor[2]) / 3);
    var background = np.zeros([h, w], 'uint8'), bs = besideSheet.data, sd = smooth.data, bd = background.data;
    for (i = 0; i < n; i++) {
      var k = i * 3;
      // _chromaticity(smooth) per pixel with _chromaticity's float32 arithmetic: the whole
      // (h, w, 3) float32 array would cost ~145 MB at peak for a 12 MP photo in the worker
      var cb = sd[k] + 1, cg = sd[k + 1] + 1, cr = sd[k + 2] + 1, cs = cb + cg + cr;
      var difference = _chromaDistance(f32(cb / cs), f32(cg / cs), f32(cr / cs), paperChromaticity);
      // The color of dark pixels is noise, e.g. ink in a shadow must stay
      var bright = (sd[k] + sd[k + 1] + sd[k + 2]) / 3 > brightLimit;
      bd[i] = bs[i] & (bright ? 1 : 0) & (difference > MAX_CHROMA_F32 ? 1 : 0);
    }
    // Also the pixels at the edge of the paper, which mix paper and background
    background = cv2.dilate(background, np.ones([5, 5], 'uint8'));
    var result = np.clone(crop), rd = result.data;
    bd = background.data;
    // paper_color.astype(np.uint8): truncation
    var c0 = Math.trunc(paperColor[0]) & 255, c1 = Math.trunc(paperColor[1]) & 255, c2 = Math.trunc(paperColor[2]) & 255;
    for (i = 0; i < n; i++) {
      if ((bd[i] & bs[i]) > 0) { rd[i * 3] = c0; rd[i * 3 + 1] = c1; rd[i * 3 + 2] = c2; }
    }
    return result;
  }

  // homr: autocrop.py:79
  /**
   * Same as autocrop, but also returns the top left corner of the crop in img.
   * -> [image, [x, y]]; the image is img itself (not a copy) when nothing is cropped.
   */
  function autocropWithOffset(img) {
    // convert to grayscale
    var gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY);
    var hist = cv2.calcHist([img], [0], null, [256], [0, 256]);
    var dominantColorGrayScale = np.argmax(hist);

    // threshold
    var thresh = cv2.threshold(gray, dominantColorGrayScale - 30, 255, cv2.THRESH_BINARY)[1];

    // apply morphology
    var kernel = np.ones([7, 7], 'uint8');
    var morph = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel);
    kernel = np.ones([9, 9], 'uint8');
    morph = cv2.morphologyEx(morph, cv2.MORPH_ERODE, kernel);

    // get largest contour
    // (OpenCV 4+ returns (contours, hierarchy): homr's len() == 2 check takes contours[0])
    var contours = cv2.findContours(morph, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0];
    var areaThresh = 0.0;
    var bigContour = null;
    for (var ci = 0; ci < contours.length; ci++) {
      var area = cv2.contourArea(contours[ci]);
      if (area > areaThresh) {
        areaThresh = area;
        bigContour = contours[ci];
      }
    }

    if (bigContour === null) return [img, [0, 0]];

    // get bounding box
    var rect = cv2.boundingRect(bigContour);
    var x = rect[0], y = rect[1], w = rect[2], h = rect[3];
    var pageWidth = img.w;
    var pageHeight = img.h;
    // If we can't find a large contour, then we assume that the picture doesn't have page borders
    var isFullPageView = w < pageWidth * 0.25 || h < pageHeight * 0.25;
    if (isFullPageView) return [img, [0, 0]];
    // A sample of the paper is enough to know its color
    // img[y:y+h, x:x+w][thresh[y:y+h, x:x+w] > 0][::10]: the paper pixels row by row, every 10th
    // (all img.c channels of each: homr's pages are BGR, a BGRA page raises in _isPaper)
    var nch = img.c, paperList = [], seen = 0, yy, xx, k;
    for (yy = y; yy < y + h; yy++) {
      for (xx = x; xx < x + w; xx++) {
        if (thresh.data[yy * thresh.w + xx] > 0) {
          if (seen % 10 === 0) { var s = (yy * img.w + xx) * nch; for (k = 0; k < nch; k++) paperList.push(img.data[s + k]); }
          seen++;
        }
      }
    }
    var paper = Uint8Array.from(paperList);
    if (paper.length === 0) return [img, [0, 0]];
    var paperChromaticity = _medianAxis0(_chromaticity(paper, nch), nch);
    // The contour was eroded, keep a margin so that staffs at the edge of the paper stay
    var margin = Math.max(5, Math.floor(Math.max(pageWidth, pageHeight) / 100));
    var x0 = Math.max(0, x - margin), y0 = Math.max(0, y - margin);
    var x1 = Math.min(pageWidth, x + w + margin), y1 = Math.min(pageHeight, y + h + margin);
    var kept = _keepSidesWithPaper(img, [x0, y0, x1 - x0, y1 - y0], paperChromaticity);
    x = kept[0]; y = kept[1]; w = kept[2]; h = kept[3];
    if (x === 0 && y === 0 && w === pageWidth && h === pageHeight) return [img, [0, 0]];

    var crop = np.crop(img, y, y + h, x, x + w);
    // big_contour - (x, y): the contour in crop coordinates (int32 like numpy)
    var sheet = new Int32Array(bigContour.length);
    for (var p = 0; p < bigContour.length; p += 2) { sheet[p] = bigContour[p] - x; sheet[p + 1] = bigContour[p + 1] - y; }
    return [_removeSurroundings(crop, sheet, paper), [x, y]];
  }

  OMR.autocrop = {
    autocrop: autocrop, autocropWithOffset: autocropWithOffset, maxChromaticityDifference: maxChromaticityDifference,
    _chromaticity: _chromaticity, _isPaper: _isPaper, _keepSidesWithPaper: _keepSidesWithPaper,
    _removeSurroundings: _removeSurroundings, _medianAxis0: _medianAxis0
  };
})(typeof self !== 'undefined' ? self : globalThis);
