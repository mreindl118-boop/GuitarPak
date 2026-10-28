/* soundLAB OMR: Pillow's Image.resize for the homr port (github.com/liebharc/homr, AGPL-3.0).
   homr/resize.py scales every page with PIL.Image.resize (default BICUBIC, reducing_gap None);
   this is a byte-exact port of Pillow 13.0.0 src/libImaging/Resample.c (MIT-CMU licence) for
   8-bit images: precompute_coeffs (filter support widened by the downscale factor),
   normalize_coeffs_8bpc (22-bit fixed point), the two separable passes in Pillow's order
   (vertical first when the height shrinks much more than the width) with its row trimming,
   rounding and clipping. Checked against PIL in tests/omr-pil.test.js. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  var fr = Math.fround;

  // ---- filters (Resample.c) ----
  function boxFilter(x) { return x > -0.5 && x <= 0.5 ? 1.0 : 0.0; }
  function bilinearFilter(x) { if (x < 0.0) x = -x; return x < 1.0 ? 1.0 - x : 0.0; }
  function hammingFilter(x) {
    if (x < 0.0) x = -x;
    if (x === 0.0) return 1.0;
    if (x >= 1.0) return 0.0;
    x = x * Math.PI;
    return Math.sin(x) / x * (fr(0.54) + fr(0.46) * Math.cos(x));
  }
  function bicubicFilter(x) {
    // https://en.wikipedia.org/wiki/Bicubic_interpolation#Bicubic_convolution_algorithm
    var a = -0.5;
    if (x < 0.0) x = -x;
    if (x < 1.0) return ((a + 2.0) * x - (a + 3.0)) * x * x + 1;
    if (x < 2.0) return (((x - 5) * x + 8) * x - 4) * a;
    return 0.0;
  }
  function sincFilter(x) { if (x === 0.0) return 1.0; x = x * Math.PI; return Math.sin(x) / x; }
  function lanczosFilter(x) { return -3.0 <= x && x < 3.0 ? sincFilter(x) * sincFilter(x / 3) : 0.0; } // truncated sinc
  // PIL.Image.Resampling values
  var NEAREST = 0, LANCZOS = 1, BILINEAR = 2, BICUBIC = 3, BOX = 4, HAMMING = 5;
  var FILTERS = {};
  FILTERS[BOX] = { fn: boxFilter, support: 0.5 };
  FILTERS[BILINEAR] = { fn: bilinearFilter, support: 1.0 };
  FILTERS[HAMMING] = { fn: hammingFilter, support: 1.0 };
  FILTERS[BICUBIC] = { fn: bicubicFilter, support: 2.0 };
  FILTERS[LANCZOS] = { fn: lanczosFilter, support: 3.0 };

  // 8 bits for the result; the filter can have negative areas, so two extra bits for overflow
  var PRECISION_BITS = 32 - 8 - 2;

  // precompute_coeffs: per output pixel the first input index, the count and the weights
  function precomputeCoeffs(inSize, in0, in1, outSize, filter) {
    var scale, filterscale, support, ksize, xx, x;
    // (double)(in1 - in0) / outSize, with in0 / in1 float
    filterscale = scale = fr(in1 - in0) / outSize;
    if (filterscale < 1.0) filterscale = 1.0;
    // determine support size (length of resampling filter)
    support = filter.support * filterscale;
    // maximum number of coeffs
    ksize = Math.ceil(support) * 2 + 1;
    var kk = new Float64Array(outSize * ksize), bounds = new Int32Array(outSize * 2);
    var invFilterscale = 1.0 / filterscale; // invariant over the loop
    for (xx = 0; xx < outSize; xx++) {
      var center = in0 + (xx + 0.5) * scale, ww = 0.0, k = xx * ksize;
      var xmin = Math.trunc(center - support + 0.5); // round the value
      if (xmin < 0) xmin = 0;
      var xmax = Math.trunc(center + support + 0.5);
      if (xmax > inSize) xmax = inSize;
      xmax -= xmin;
      for (x = 0; x < xmax; x++) {
        var w = filter.fn((x + xmin - center + 0.5) * invFilterscale);
        kk[k + x] = w;
        ww += w;
      }
      if (ww !== 0.0) for (x = 0; x < xmax; x++) kk[k + x] /= ww;
      // remaining values stay 0
      bounds[xx * 2] = xmin;
      bounds[xx * 2 + 1] = xmax;
    }
    return { ksize: ksize, bounds: bounds, kk: kk };
  }
  // normalize_coeffs_8bpc: doubles -> fixed point ints, rounded away from zero
  function normalizeCoeffs8bpc(kk) {
    var out = new Int32Array(kk.length), one = 1 << PRECISION_BITS;
    for (var x = 0; x < kk.length; x++) out[x] = Math.trunc(kk[x] < 0 ? -0.5 + kk[x] * one : 0.5 + kk[x] * one);
    return out;
  }
  // clip8: lookup of in >> PRECISION_BITS clamped to 0..255 (sums stay within int32)
  function clip8(v) { v = v >> PRECISION_BITS; return v < 0 ? 0 : v > 255 ? 255 : v; }

  // _ImagingResampleHorizontal_8bpc: out rows = input rows offset .. offset + h - 1
  function resampleHorizontal(src, sw, c, outW, outH, offset, co) {
    var k = normalizeCoeffs8bpc(co.kk), ks = co.ksize, b = co.bounds;
    var out = new Uint8Array(outW * outH * c), half = 1 << (PRECISION_BITS - 1);
    for (var yy = 0; yy < outH; yy++) {
      var row = (yy + offset) * sw * c, orow = yy * outW * c;
      for (var xx = 0; xx < outW; xx++) {
        var xmin = b[xx * 2], xmax = b[xx * 2 + 1], kx = xx * ks;
        for (var ch = 0; ch < c; ch++) {
          var ss = half;
          for (var x = 0; x < xmax; x++) ss += src[row + (x + xmin) * c + ch] * k[kx + x];
          out[orow + xx * c + ch] = clip8(ss);
        }
      }
    }
    return out;
  }
  // _ImagingResampleVertical_8bpc
  function resampleVertical(src, sw, c, outH, co) {
    var k = normalizeCoeffs8bpc(co.kk), ks = co.ksize, b = co.bounds;
    var out = new Uint8Array(sw * outH * c), half = 1 << (PRECISION_BITS - 1), stride = sw * c;
    for (var yy = 0; yy < outH; yy++) {
      var ymin = b[yy * 2], ymax = b[yy * 2 + 1], ky = yy * ks, orow = yy * stride;
      for (var xx = 0; xx < stride; xx++) {
        var ss = half;
        for (var y = 0; y < ymax; y++) ss += src[(y + ymin) * stride + xx] * k[ky + y];
        out[orow + xx] = clip8(ss);
      }
    }
    return out;
  }

  // PIL.Image.resize(img, (w, h), resample=BICUBIC, box=None) for uint8 images with 1 or 3
  // channels ('L' / 'RGB': each band is resampled on its own, so BGR / RGB order does not matter)
  function resize(img, size, o) {
    var resample = o && o.resample !== undefined ? o.resample : BICUBIC;
    var xsize = size[0], ysize = size[1], inW = img.w, inH = img.h, c = img.c;
    var box = o && o.box ? o.box : [0, 0, inW, inH];
    if (!(img.data instanceof Uint8Array)) throw new Error('OMR.pil.resize: uint8 images only');
    // Pillow resizes LA / RGBA with premultiplied alpha (not ported: homr resizes BGR pages)
    if (c !== 1 && c !== 3) throw new Error('OMR.pil.resize: 1- or 3-channel images only');
    if (inW === xsize && inH === ysize && box[0] === 0 && box[1] === 0 && box[2] === inW && box[3] === inH) {
      return { h: inH, w: inW, c: c, data: img.data.slice() }; // self.copy()
    }
    // _imaging.c _resize: "height and width must be > 0" (ValueError)
    if (!(xsize >= 1 && ysize >= 1)) throw OMR.py.error('ValueError', 'height and width must be > 0');
    var b0 = fr(box[0]), b1 = fr(box[1]), b2 = fr(box[2]), b3 = fr(box[3]); // float box[4]
    if (b0 < 0 || b1 < 0) throw OMR.py.error('ValueError', "box offset can't be negative");
    if (b2 > inW || b3 > inH) throw OMR.py.error('ValueError', "box can't exceed original image size");
    if (fr(b2 - b0) < 0 || fr(b3 - b1) < 0) throw OMR.py.error('ValueError', "box can't be empty");
    // an integer box of exactly the requested size is a plain crop (ImagingCrop)
    if (b0 === Math.trunc(b0) && fr(b2 - b0) === xsize && b1 === Math.trunc(b1) && fr(b3 - b1) === ysize) {
      return OMR.np.crop(img, b1, b1 + ysize, b0, b0 + xsize);
    }
    var filter = FILTERS[resample];
    if (!filter) throw new Error('OMR.pil.resize: unsupported resampling filter ' + resample);
    // ImagingResampleInner
    var needH = xsize !== inW || b0 !== 0 || b2 !== xsize;
    var needV = ysize !== inH || b1 !== 0 || b3 !== ysize;
    // if the height shrinks more than twice as much as the width, run the vertical pass first
    var hFirst = !((inH - ysize) > 0 && (inH - ysize) > (inW - xsize) * 2);
    var cv = null, ch = null, yFirst = 0, yLast = 0, i;
    if ((needH && hFirst) || needV) cv = precomputeCoeffs(inH, b1, b3, ysize, filter);
    if (needH) {
      if (hFirst) {
        yFirst = cv.bounds[0]; // first used row of the source
        yLast = cv.bounds[ysize * 2 - 2] + cv.bounds[ysize * 2 - 1]; // last used row
        if (yFirst !== 0) for (i = 0; i < ysize; i++) cv.bounds[i * 2] -= yFirst; // shift for the vertical pass
      }
      ch = precomputeCoeffs(inW, b0, b2, xsize, filter);
    }
    var data = img.data, w = inW, h = inH;
    if (hFirst) {
      if (needH) { data = resampleHorizontal(data, w, c, xsize, yLast - yFirst, yFirst, ch); w = xsize; h = yLast - yFirst; }
      if (needV) { data = resampleVertical(data, w, c, ysize, cv); h = ysize; }
    } else {
      if (needV) { data = resampleVertical(data, w, c, ysize, cv); h = ysize; }
      if (needH) { data = resampleHorizontal(data, w, c, xsize, ysize, 0, ch); w = xsize; }
    }
    if (data === img.data) data = data.slice(); // none of the passes ran: a copy
    return { h: h, w: w, c: c, data: data };
  }

  OMR.pil = {
    resize: resize,
    Resampling: { NEAREST: NEAREST, LANCZOS: LANCZOS, BILINEAR: BILINEAR, BICUBIC: BICUBIC, BOX: BOX, HAMMING: HAMMING },
    _precomputeCoeffs: precomputeCoeffs
  };
})(typeof self !== 'undefined' ? self : globalThis);
