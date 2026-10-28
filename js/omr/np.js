/* soundLAB OMR: Python and numpy semantics the homr port relies on
   (homr, github.com/liebharc/homr, AGPL-3.0). OMR.py = builtins, OMR.np = numpy,
   including the image type every module passes around:

     image = { h, w, c, data }   HWC row-major, exactly numpy's memory layout.
     data is a typed array whose constructor IS the dtype (Uint8Array = uint8,
     Float32Array = float32, Float64Array = float64, Int32Array = int32, ...).
     c === 1 stands for a 2-D numpy array (h, w), which is what cv2 returns for
     single-channel images; shape(img) gives the numpy shape.

   numpy slicing returns VIEWS, the helpers here return COPIES (crop) and write
   regions back explicitly (assign), so a port must write what Python mutates. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};

  // ---- Python builtins ----
  // round(): half to even ("banker's"), like Python 3 and np.round
  function pyRound(x, nd) {
    if (nd) { var f = Math.pow(10, nd); return pyRound(x * f) / f; }
    var r = Math.round(x);
    if (Math.abs(x % 1) === 0.5 && r % 2 !== 0) r -= 1;
    return r;
  }
  // int(): truncate toward zero (also numpy astype(int))
  function pyInt(x) { return Math.trunc(x); }
  // a // b floors; a % b takes the divisor's sign
  function floorDiv(a, b) { return Math.floor(a / b); }
  function mod(a, b) { var m = a % b; return (m !== 0 && (m < 0) !== (b < 0)) ? m + b : m; }
  // sorted(arr, key=, reverse=): stable; reverse=True keeps the ORIGINAL order of ties
  // (Python sorts by key descending while preserving input order among equals)
  function sorted(arr, key, reverse) {
    var k = key || function (v) { return v; };
    var idx = arr.map(function (v, i) { return { v: v, k: k(v), i: i }; });
    idx.sort(function (a, b) {
      var c = cmp(a.k, b.k);
      if (reverse) c = -c;
      return c || a.i - b.i;
    });
    return idx.map(function (e) { return e.v; });
  }
  // Python comparison for numbers, strings and (nested) arrays = tuples
  function cmp(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
      for (var i = 0; i < Math.min(a.length, b.length); i++) { var c = cmp(a[i], b[i]); if (c) return c; }
      return a.length - b.length;
    }
    if (typeof a === 'boolean') a = +a;
    if (typeof b === 'boolean') b = +b;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  // max/min(iterable, key=): the FIRST extreme wins
  function maxBy(arr, key) {
    var best = null, bk;
    for (var i = 0; i < arr.length; i++) { var k = key ? key(arr[i]) : arr[i]; if (i === 0 || cmp(k, bk) > 0) { best = arr[i]; bk = k; } }
    if (!arr.length) throw new Error('max() arg is an empty sequence');
    return best;
  }
  function minBy(arr, key) {
    var best = null, bk;
    for (var i = 0; i < arr.length; i++) { var k = key ? key(arr[i]) : arr[i]; if (i === 0 || cmp(k, bk) < 0) { best = arr[i]; bk = k; } }
    if (!arr.length) throw new Error('min() arg is an empty sequence');
    return best;
  }
  function range(a, b, s) {
    if (b === undefined) { b = a; a = 0; }
    s = s || 1;
    var out = [];
    if (s > 0) for (var i = a; i < b; i += s) out.push(i);
    else for (var j = a; j > b; j += s) out.push(j);
    return out;
  }
  // `x in list`: identity, or Python __eq__ where the port defines it as equals()
  function contains(list, x) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e === x) return true;
      if (e && typeof e.equals === 'function' && e.equals(x)) return true;
    }
    return false;
  }
  // str()/repr() for logging: numbers, nested arrays as tuples, objects via toString
  function repr(v) {
    if (Array.isArray(v) || ArrayBuffer.isView(v)) return '(' + Array.prototype.map.call(v, repr).join(', ') + ')';
    if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) < 1e16 ? v.toFixed(1) : String(v);
    if (v === null || v === undefined) return 'None';
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    return String(v);
  }
  OMR.py = { round: pyRound, int: pyInt, floorDiv: floorDiv, mod: mod, sorted: sorted, cmp: cmp, max: maxBy, min: minBy, range: range, contains: contains, repr: repr };

  // ---- numpy reductions over plain arrays / typed arrays ----
  function toArr(a) { return Array.isArray(a) ? a : Array.prototype.slice.call(a); }
  var f32 = Math.fround;
  // numpy's pairwise summation (numpy/_core/src/umath/loops_utils.h.src): blocks of
  // <= 128 summed with 8 accumulators, larger ranges split in two. np.sum = 0 + that.
  // A Float32Array accumulates in float32 like np.sum(float32) does.
  function pairwise(a, lo, n, single) {
    var i, res;
    if (n < 8) {
      res = 0;
      for (i = 0; i < n; i++) res = single ? f32(res + a[lo + i]) : res + a[lo + i];
      return res;
    }
    if (n <= 128) {
      var r0 = a[lo], r1 = a[lo + 1], r2 = a[lo + 2], r3 = a[lo + 3], r4 = a[lo + 4], r5 = a[lo + 5], r6 = a[lo + 6], r7 = a[lo + 7];
      var end = n - (n % 8);
      if (single) {
        for (i = 8; i < end; i += 8) {
          r0 = f32(r0 + a[lo + i]); r1 = f32(r1 + a[lo + i + 1]); r2 = f32(r2 + a[lo + i + 2]); r3 = f32(r3 + a[lo + i + 3]);
          r4 = f32(r4 + a[lo + i + 4]); r5 = f32(r5 + a[lo + i + 5]); r6 = f32(r6 + a[lo + i + 6]); r7 = f32(r7 + a[lo + i + 7]);
        }
        res = f32(f32(f32(r0 + r1) + f32(r2 + r3)) + f32(f32(r4 + r5) + f32(r6 + r7)));
        for (; i < n; i++) res = f32(res + a[lo + i]);
        return res;
      }
      for (i = 8; i < end; i += 8) {
        r0 += a[lo + i]; r1 += a[lo + i + 1]; r2 += a[lo + i + 2]; r3 += a[lo + i + 3];
        r4 += a[lo + i + 4]; r5 += a[lo + i + 5]; r6 += a[lo + i + 6]; r7 += a[lo + i + 7];
      }
      res = ((r0 + r1) + (r2 + r3)) + ((r4 + r5) + (r6 + r7));
      for (; i < n; i++) res += a[lo + i];
      return res;
    }
    var n2 = Math.floor(n / 2);
    n2 -= n2 % 8;
    var s = pairwise(a, lo, n2, single) + pairwise(a, lo + n2, n - n2, single);
    return single ? f32(s) : s;
  }
  function isF32(a) { return a instanceof Float32Array; }
  // np.sum: pairwise for floats; integer typed arrays / int lists are exact anyway
  function sum(a) {
    if (a && a.data && a.h !== undefined) a = a.data;
    var single = isF32(a);
    return single ? f32(0 + pairwise(a, 0, a.length, true)) : 0 + pairwise(a, 0, a.length, false);
  }
  // np.mean: pairwise sum / n (a float32 array gives a float32 mean)
  function mean(a) {
    if (a && a.data && a.h !== undefined) a = a.data;
    if (!a.length) return NaN;
    return isF32(a) ? f32(sum(a) / a.length) : sum(a) / a.length;
  }
  // np.median: mean of the two middle values for an even count
  function median(a) {
    if (!a.length) return NaN;
    var s = toArr(a).slice().sort(function (x, y) { return x - y; }), n = s.length, h = n >> 1;
    return n % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
  }
  // np.std: population standard deviation (ddof=0), sqrt(sum(|x - mean|^2) / n) like numpy's
  // _var (pairwise sums; a Float32Array stays in float32 throughout)
  function std(a) {
    var m = mean(a), single = isF32(a), d = new (single ? Float32Array : Float64Array)(a.length);
    for (var i = 0; i < a.length; i++) { var x = single ? f32(a[i] - m) : a[i] - m; d[i] = x * x; }
    return single ? f32(Math.sqrt(f32(sum(d) / a.length))) : Math.sqrt(sum(d) / a.length);
  }
  // np.percentile, default 'linear' method: virtual index (n - 1) * (q / 100), numpy's _lerp
  // (which interpolates from the upper neighbour when the weight is >= 0.5)
  function percentile(a, q) {
    var s = toArr(a).slice().sort(function (x, y) { return x - y; }), n = s.length;
    if (!n) return NaN;
    var v = (n - 1) * (q / 100);
    if (v >= n - 1) return s[n - 1];
    if (v < 0) return s[0];
    var lo = Math.floor(v), g = v - lo, x0 = s[lo], x1 = s[lo + 1], d = x1 - x0;
    return g >= 0.5 ? x1 - d * (1 - g) : x0 + d * g;
  }
  // np.argmax / np.argmin: first occurrence; NaN wins like numpy
  function argmax(a) { var bi = 0; if (a[0] !== a[0]) return 0; for (var i = 1; i < a.length; i++) { if (a[i] !== a[i]) return i; if (a[i] > a[bi]) bi = i; } return bi; }
  function argmin(a) { var bi = 0; if (a[0] !== a[0]) return 0; for (var i = 1; i < a.length; i++) { if (a[i] !== a[i]) return i; if (a[i] < a[bi]) bi = i; } return bi; }
  function diff(a) { var out = []; for (var i = 1; i < a.length; i++) out.push(a[i] - a[i - 1]); return out; }
  function argsort(a) { return range(a.length).sort(function (i, j) { return a[i] - a[j] || i - j; }); }
  function clip(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function linspace(a, b, n) { var out = []; for (var i = 0; i < n; i++) out.push(n === 1 ? a : a + (b - a) * i / (n - 1)); return out; }

  // ---- np.argsort's default (kind='quicksort') as numpy 2.4 runs it on x86-64 with AVX-512 ----
  // numpy hands 32/64-bit argsorts to Intel's x86-simd-sort (BSD-3-Clause): bitonic sorting
  // networks on 8-lane registers for <= 256 values, a vectorised quicksort above. It is not
  // stable: the order of EQUAL values comes out of the network (and differs on CPUs without
  // AVX-512, where numpy takes the AVX2 networks). homr's find_peaks keeps the first of two
  // equal-height peaks in that order, so this is a lane-exact port of
  // xss-network-keyvaluesort.hpp / xss-reg-networks.hpp / xss-common-argsort.h (avx512, 64-bit).
  var SWAP2 = [1, 0, 3, 2, 5, 4, 7, 6], SWAP4 = [2, 3, 0, 1, 6, 7, 4, 5], SWAP8 = [4, 5, 6, 7, 0, 1, 2, 3];
  var REV2 = SWAP2, REV4 = [3, 2, 1, 0, 7, 6, 5, 4], REV8 = [7, 6, 5, 4, 3, 2, 1, 0];
  function perm(v, p) { return [v[p[0]], v[p[1]], v[p[2]], v[p[3]], v[p[4]], v[p[5]], v[p[6]], v[p[7]]]; }
  function vmin(a, b) { return a < b ? a : b; } // _mm512_min_pd(a, b)
  function vmax(a, b) { return a > b ? a : b; } // _mm512_max_pd(a, b)
  // cmp_merge(in1, in2 = in1 permuted, indexes, mask): mask lanes take the max, others the min;
  // a lane keeps its own index where the result equals its own key, else takes the partner's
  function cmpMerge(R, p, mask) {
    var k = R.k, ix = R.i, k2 = perm(k, p), i2 = perm(ix, p), nk = new Array(8), ni = new Array(8);
    for (var l = 0; l < 8; l++) {
      nk[l] = (mask >> l) & 1 ? vmax(k2[l], k[l]) : vmin(k2[l], k[l]);
      ni[l] = nk[l] === k[l] ? ix[l] : i2[l];
    }
    R.k = nk; R.i = ni;
  }
  function sortReg8(R) {
    cmpMerge(R, REV2, 0xAA); cmpMerge(R, REV4, 0xCC); cmpMerge(R, SWAP2, 0xAA);
    cmpMerge(R, REV8, 0xF0); cmpMerge(R, SWAP4, 0xCC); cmpMerge(R, SWAP2, 0xAA);
  }
  function mergeReg8(R) { cmpMerge(R, SWAP8, 0xF0); cmpMerge(R, SWAP4, 0xCC); cmpMerge(R, SWAP2, 0xAA); }
  function rev(R) { R.k = perm(R.k, REV8); R.i = perm(R.i, REV8); }
  // COEX on two registers: lane-wise min to the first, max to the second, indices follow
  function coex(A, B) {
    for (var l = 0; l < 8; l++) {
      var t1 = vmin(A.k[l], B.k[l]), t2 = vmax(A.k[l], B.k[l]), eq = t1 === A.k[l];
      var ia = eq ? A.i[l] : B.i[l], ib = eq ? B.i[l] : A.i[l];
      A.k[l] = t1; B.k[l] = t2; A.i[l] = ia; B.i[l] = ib;
    }
  }
  function bitonicMergeNVec(V, off, n) {
    var i, j, num;
    if (n === 2) { rev(V[off + 1]); coex(V[off], V[off + 1]); rev(V[off + 1]); }
    else for (i = 0; i < n / 2; i++) { rev(V[off + n - i - 1]); coex(V[off + i], V[off + n - i - 1]); rev(V[off + n - i - 1]); }
    for (num = n / 2; num >= 2; num /= 2) for (j = 0; j < n; j += num) for (i = 0; i < num / 2; i++) coex(V[off + i + j], V[off + i + j + num / 2]);
    for (i = 0; i < n; i++) mergeReg8(V[off + i]);
  }
  // argsort_n<zmm_vector<double>, zmm_vector<uint64_t>, 256>: N <= 256 values at arg[off ..]
  function argsortN(arr, arg, off, N) {
    var numVecs = 32, i, l;
    while (numVecs > 1 && N * 2 <= numVecs * 8) numVecs /= 2;
    var V = [], toRead = [];
    for (i = 0; i < numVecs; i++) {
      var R = { k: new Array(8), i: new Array(8) }, nr = i < (numVecs >> 1) ? 8 : Math.min(Math.max(0, N - i * 8), 8);
      toRead.push(nr);
      for (l = 0; l < 8; l++) {
        if (l < nr) { R.i[l] = arg[off + i * 8 + l]; R.k[l] = arr[R.i[l]]; }
        else { R.i[l] = -1; R.k[l] = Infinity; } // masked lanes: index max, key +inf
      }
      sortReg8(R);
      V.push(R);
    }
    for (var per = 2; per <= numVecs; per *= 2) for (i = 0; i < numVecs / per; i++) bitonicMergeNVec(V, i * per, per);
    for (i = 0; i < numVecs; i++) for (l = 0; l < toRead[i]; l++) arg[off + i * 8 + l] = V[i].i[l];
  }
  // partition_vec_avx512: lanes < pivot compress-stored to the left, >= pivot to the right
  function partitionVec(arg, left, right, argVec, vec, pivot, mm) {
    var gt = 0, l, a = left, b;
    for (l = 0; l < 8; l++) if (vec[l] >= pivot) gt++;
    b = right - gt;
    for (l = 0; l < 8; l++) {
      if (vec[l] >= pivot) arg[b++] = argVec[l]; else arg[a++] = argVec[l];
      mm.min[l] = vmin(vec[l], mm.min[l]); mm.max[l] = vmax(vec[l], mm.max[l]);
    }
    return gt;
  }
  function load8(arr, arg, at) { var v = [], a = []; for (var l = 0; l < 8; l++) { a.push(arg[at + l]); v.push(arr[arg[at + l]]); } return [a, v]; }
  function reduceMm(mm, st) { st.smallest = Math.min.apply(null, mm.min); st.biggest = Math.max.apply(null, mm.max); }
  // argpartition_unrolled<4> / argpartition: returns the first index of the >= pivot part
  function argpartition(arr, arg, left, right, pivot, st, unroll) {
    if (unroll > 1 && right - left <= 8 * unroll * 8) unroll = 1;
    var i, ii, x, chunk = unroll * 8;
    for (i = (right - left) % chunk; i > 0; --i) {
      x = arr[arg[left]];
      st.smallest = x < st.smallest ? x : st.smallest;
      st.biggest = st.biggest < x ? x : st.biggest;
      if (!(x < pivot)) { var t = arg[left]; arg[left] = arg[--right]; arg[right] = t; } else ++left;
    }
    if (left === right) return left;
    var mm = { min: new Array(8).fill(st.smallest), max: new Array(8).fill(st.biggest) }, gt;
    if (unroll === 1 && right - left === 8) {
      var one = load8(arr, arg, left);
      gt = partitionVec(arg, left, left + 8, one[0], one[1], pivot, mm);
      reduceMm(mm, st);
      return left + (8 - gt);
    }
    var vl = [], vr = [];
    for (ii = 0; ii < unroll; ii++) { vl.push(load8(arr, arg, left + 8 * ii)); vr.push(load8(arr, arg, right - 8 * (unroll - ii))); }
    var rStore = right - 8, lStore = left;
    left += chunk; right -= chunk;
    while (right - left !== 0) {
      var cur = [];
      if ((rStore + 8) - right < left - lStore) { right -= chunk; for (ii = 0; ii < unroll; ii++) cur.push(load8(arr, arg, right + ii * 8)); }
      else { for (ii = 0; ii < unroll; ii++) cur.push(load8(arr, arg, left + ii * 8)); left += chunk; }
      for (ii = 0; ii < unroll; ii++) {
        gt = partitionVec(arg, lStore, rStore + 8, cur[ii][0], cur[ii][1], pivot, mm);
        lStore += 8 - gt; rStore -= gt;
      }
    }
    for (ii = 0; ii < unroll; ii++) { gt = partitionVec(arg, lStore, rStore + 8, vl[ii][0], vl[ii][1], pivot, mm); lStore += 8 - gt; rStore -= gt; }
    for (ii = 0; ii < unroll; ii++) {
      // argpartition (unroll 1) puts the last vector right after the left part
      gt = unroll === 1 ? partitionVec(arg, lStore, lStore + 8, vr[ii][0], vr[ii][1], pivot, mm) : partitionVec(arg, lStore, rStore + 8, vr[ii][0], vr[ii][1], pivot, mm);
      lStore += 8 - gt; rStore -= gt;
    }
    reduceMm(mm, st);
    return lStore;
  }
  function argsortRec(arr, arg, left, right, maxIters) {
    if (maxIters <= 0) {
      // std::sort fallback (introsort) is not ported: a stable sort of the slice instead
      var part = arg.slice(left, right + 1).sort(function (a, b) { return arr[a] - arr[b] || 0; });
      for (var q = 0; q < part.length; q++) arg[left + q] = part[q];
      return;
    }
    if (right + 1 - left <= 256) { argsortN(arr, arg, left, right + 1 - left); return; }
    // median of 8 samples (only the values matter)
    var size = Math.floor((right - left) / 8), smp = [];
    for (var s = 1; s <= 8; s++) smp.push(arr[arg[left + s * size]]);
    smp.sort(function (a, b) { return a - b; });
    var pivot = smp[4], st = { smallest: Infinity, biggest: -Infinity };
    var pivotIndex = argpartition(arr, arg, left, right + 1, pivot, st, 4);
    if (pivot !== st.smallest) argsortRec(arr, arg, left, pivotIndex - 1, maxIters - 1);
    if (pivot !== st.biggest) argsortRec(arr, arg, pivotIndex, right, maxIters - 1);
  }
  function argsortQuick(values) {
    var n = values.length, arg = range(n), i;
    if (n <= 1) return arg;
    for (i = 0; i < n; i++) if (values[i] !== values[i]) return argsort(values); // NaN: numpy takes std::sort (not ported)
    // early exit for already sorted arrays
    var isSorted = true;
    for (i = 1; i < n; i++) if (values[i] < values[i - 1]) { isSorted = false; break; }
    if (isSorted) return arg;
    argsortRec(values, arg, 0, n - 1, 2 * Math.floor(Math.log2(n)));
    return arg;
  }

  // ---- the image type ----
  var CTORS = {
    uint8: Uint8Array, int8: Int8Array, uint16: Uint16Array, int16: Int16Array,
    int32: Int32Array, uint32: Uint32Array, float32: Float32Array, float64: Float64Array
  };
  // dtype name of a typed array / image ('uint8', 'float32', ...); plain arrays are float64
  function dtypeOf(x) {
    var d = x && x.data !== undefined && x.h !== undefined ? x.data : x;
    if (d instanceof Uint8Array || d instanceof Uint8ClampedArray) return 'uint8';
    if (d instanceof Float32Array) return 'float32';
    if (d instanceof Float64Array) return 'float64';
    if (d instanceof Int32Array) return 'int32';
    if (d instanceof Int16Array) return 'int16';
    if (d instanceof Uint16Array) return 'uint16';
    if (d instanceof Int8Array) return 'int8';
    if (d instanceof Uint32Array) return 'uint32';
    return 'float64';
  }
  function ctorOf(dtype) {
    var C = typeof dtype === 'function' ? dtype : CTORS[dtype || 'uint8'];
    if (!C) throw new Error('OMR.np: unknown dtype ' + dtype);
    return C;
  }
  // shape [h, w] or [h, w, c] (+ optional dtype) -> {h, w, c}
  function dims(shape) {
    return { h: shape[0], w: shape[1], c: shape.length > 2 ? shape[2] : 1 };
  }
  // image(h, w, c, data|dtype): wraps (does not copy) a typed array
  function image(h, w, c, data) {
    c = c || 1;
    if (!data || typeof data === 'string' || typeof data === 'function') data = new (ctorOf(data))(h * w * c);
    if (data.length !== h * w * c) throw new Error('OMR.np.image: ' + data.length + ' values for ' + [h, w, c]);
    return { h: h, w: w, c: c, data: data };
  }
  function isImage(x) { return !!(x && x.data && x.h !== undefined && x.w !== undefined); }
  function shape(img) { return img.c === 1 ? [img.h, img.w] : [img.h, img.w, img.c]; }
  function ndim(img) { return img.c === 1 ? 2 : 3; }
  function size(img) { return img.h * img.w * img.c; }
  // np.zeros(shape, dtype) / np.ones / np.full
  function zeros(shp, dtype) { var d = dims(shp); return image(d.h, d.w, d.c, dtype || 'float64'); }
  function ones(shp, dtype) { return full(shp, 1, dtype || 'float64'); }
  function full(shp, value, dtype) { var im = zeros(shp, dtype); im.data.fill(value); return im; }
  // np.zeros_like / np.full_like (dtype defaults to the source's)
  function zerosLike(img, dtype) { return image(img.h, img.w, img.c, dtype || dtypeOf(img)); }
  function fullLike(img, value, dtype) { var im = zerosLike(img, dtype); im.data.fill(value); return im; }
  // img.copy()
  function clone(img) { return { h: img.h, w: img.w, c: img.c, data: img.data.slice() }; }
  // .astype(dtype): numpy's C casts. Float -> int truncates toward zero and integers wrap
  // modulo 2^bits, which is exactly what typed-array assignment does (also for
  // np.uint8(-1.5) = 255). Float64 -> float32 rounds to nearest.
  function astype(img, dtype) {
    var C = ctorOf(dtype), out = new C(img.data.length), src = img.data;
    if (C === Float32Array || C === Float64Array) out.set(src);
    else for (var i = 0; i < src.length; i++) { var v = src[i]; out[i] = v !== v ? 0 : v; }
    return { h: img.h, w: img.w, c: img.c, data: out };
  }
  // numpy slice bounds: None -> default, negatives count from the end, then clamp
  function sliceBounds(a, b, n) {
    a = a === undefined || a === null ? 0 : a;
    b = b === undefined || b === null ? n : b;
    if (a < 0) a += n;
    if (b < 0) b += n;
    a = a < 0 ? 0 : a > n ? n : a;
    b = b < 0 ? 0 : b > n ? n : b;
    return b < a ? [a, a] : [a, b];
  }
  // img[y0:y1, x0:x1] as a COPY (numpy semantics for the bounds)
  function crop(img, y0, y1, x0, x1) {
    var ys = sliceBounds(y0, y1, img.h), xs = sliceBounds(x0, x1, img.w);
    var h = ys[1] - ys[0], w = xs[1] - xs[0], c = img.c;
    var out = new img.data.constructor(h * w * c), row = w * c;
    for (var y = 0; y < h; y++) {
      var s = ((ys[0] + y) * img.w + xs[0]) * c;
      out.set(img.data.subarray(s, s + row), y * row);
    }
    return { h: h, w: w, c: c, data: out };
  }
  // img[y0:y1, x0:x1] = src (an image of exactly the slice's shape, or a scalar /
  // per-channel array broadcast over it). Mutates and returns img.
  function assign(img, y0, y1, x0, x1, src) {
    var ys = sliceBounds(y0, y1, img.h), xs = sliceBounds(x0, x1, img.w);
    var h = ys[1] - ys[0], w = xs[1] - xs[0], c = img.c, d = img.data;
    if (isImage(src)) {
      if (src.h !== h || src.w !== w || src.c !== c) {
        throw new Error('OMR.np.assign: could not broadcast ' + shape(src) + ' into ' + [h, w, c]);
      }
      for (var y = 0; y < h; y++) {
        var s = y * w * c, t = ((ys[0] + y) * img.w + xs[0]) * c;
        if (src.data.constructor === d.constructor) d.set(src.data.subarray(s, s + w * c), t);
        else for (var i = 0; i < w * c; i++) { var v = src.data[s + i]; d[t + i] = v !== v ? 0 : v; }
      }
      return img;
    }
    var vals = Array.isArray(src) || ArrayBuffer.isView(src) ? src : null;
    for (var yy = 0; yy < h; yy++) {
      var tt = ((ys[0] + yy) * img.w + xs[0]) * c;
      if (!vals) { d.fill(src, tt, tt + w * c); continue; }
      for (var x = 0; x < w; x++) for (var k = 0; k < c; k++) d[tt + x * c + k] = vals[k];
    }
    return img;
  }
  // np.pad-free paste: copy src into img with its top-left at (y, x), clipped to img
  function paste(img, y, x, src) {
    var y0 = Math.max(0, y), x0 = Math.max(0, x);
    var y1 = Math.min(img.h, y + src.h), x1 = Math.min(img.w, x + src.w);
    if (y1 <= y0 || x1 <= x0) return img;
    return assign(img, y0, y1, x0, x1, crop(src, y0 - y, y1 - y, x0 - x, x1 - x));
  }
  function get(img, y, x, k) { return img.data[(y * img.w + x) * img.c + (k || 0)]; }
  function set(img, y, x, v, k) { img.data[(y * img.w + x) * img.c + (k || 0)] = v; return img; }
  // img[:, :, k] as a single-channel copy; merge = np.dstack
  function channel(img, k) {
    var n = img.h * img.w, out = new img.data.constructor(n);
    for (var i = 0; i < n; i++) out[i] = img.data[i * img.c + k];
    return { h: img.h, w: img.w, c: 1, data: out };
  }
  function merge(chs) {
    var h = chs[0].h, w = chs[0].w, c = chs.length, n = h * w, out = new chs[0].data.constructor(n * c);
    for (var k = 0; k < c; k++) for (var i = 0; i < n; i++) out[i * c + k] = chs[k].data[i];
    return { h: h, w: w, c: c, data: out };
  }
  // element-wise helpers (the result dtype is explicit, numpy's promotion rules vary)
  function map(img, fn, dtype) {
    var C = dtype ? ctorOf(dtype) : img.data.constructor, src = img.data, out = new C(src.length);
    for (var i = 0; i < src.length; i++) out[i] = fn(src[i], i);
    return { h: img.h, w: img.w, c: img.c, data: out };
  }
  function map2(a, b, fn, dtype) {
    if (a.data.length !== b.data.length) throw new Error('OMR.np.map2: shapes ' + shape(a) + ' and ' + shape(b));
    var C = dtype ? ctorOf(dtype) : a.data.constructor, out = new C(a.data.length);
    for (var i = 0; i < out.length; i++) out[i] = fn(a.data[i], b.data[i], i);
    return { h: a.h, w: a.w, c: a.c, data: out };
  }
  // boolean masks as uint8 0/1 images: (img > v), (img >= v), (img == v), a & b, a | b
  function gt(img, v) { return map(img, function (x) { return x > v ? 1 : 0; }, 'uint8'); }
  function ge(img, v) { return map(img, function (x) { return x >= v ? 1 : 0; }, 'uint8'); }
  function lt(img, v) { return map(img, function (x) { return x < v ? 1 : 0; }, 'uint8'); }
  function eq(img, v) { return map(img, function (x) { return x === v ? 1 : 0; }, 'uint8'); }
  function and(a, b) { return map2(a, b, function (x, y) { return x && y ? 1 : 0; }, 'uint8'); }
  function or(a, b) { return map2(a, b, function (x, y) { return x || y ? 1 : 0; }, 'uint8'); }
  // np.where(mask, a, b) with images or scalars for a / b
  function where(mask, a, b, dtype) {
    var C = ctorOf(dtype || (isImage(a) ? dtypeOf(a) : isImage(b) ? dtypeOf(b) : 'float64'));
    var n = mask.data.length, out = new C(n);
    for (var i = 0; i < n; i++) out[i] = mask.data[i] ? (isImage(a) ? a.data[i] : a) : (isImage(b) ? b.data[i] : b);
    return { h: mask.h, w: mask.w, c: mask.c, data: out };
  }
  function countNonZero(img) { var n = 0, d = img.data; for (var i = 0; i < d.length; i++) if (d[i]) n++; return n; }
  // np.nonzero / np.where(cond) for a 2-D image: [ys, xs] in row-major order
  function nonzero(img) {
    var ys = [], xs = [], d = img.data, w = img.w;
    for (var i = 0; i < d.length; i++) if (d[i]) { ys.push((i / w) | 0); xs.push(i % w); }
    return [Int32Array.from(ys), Int32Array.from(xs)];
  }
  // sum over one axis of a single-channel image: axis 0 = per column, 1 = per row
  // (numpy sums uint8 in uint64 and floats pairwise along the axis)
  function sumAxis(img, axis) {
    var h = img.h, w = img.w, d = img.data, single = isF32(d), tmp, i, j;
    var out = new (single ? Float32Array : Float64Array)(axis === 0 ? w : h);
    if (axis === 1) {
      for (i = 0; i < h; i++) out[i] = single ? f32(0 + pairwise(d, i * w, w, true)) : 0 + pairwise(d, i * w, w, false);
      return out;
    }
    // numpy reduces axis 0 of a C-contiguous array row by row (an outer loop), not pairwise
    for (i = 0; i < h; i++) for (j = 0; j < w; j++) { tmp = out[j] + d[i * w + j]; out[j] = single ? f32(tmp) : tmp; }
    return out;
  }
  function maxOf(a) { if (a && a.data && a.h !== undefined) a = a.data; var m = a[0]; for (var i = 1; i < a.length; i++) if (a[i] > m || a[i] !== a[i]) { m = a[i]; if (m !== m) break; } return m; }
  function minOf(a) { if (a && a.data && a.h !== undefined) a = a.data; var m = a[0]; for (var i = 1; i < a.length; i++) if (a[i] < m || a[i] !== a[i]) { m = a[i]; if (m !== m) break; } return m; }

  // ---- point lists (cv2 contours) ----
  // a contour is a flat typed array of x,y pairs = numpy (N, 1, 2) / (N, 2) flattened
  function ptsLen(p) { return p.length >> 1; }
  // nested [[x, y], ...] / [[[x, y]], ...] or a flat array -> flat typed array
  function toPts(p, dtype) {
    if (ArrayBuffer.isView(p) && (!dtype || dtypeOf(p) === dtype)) return p;
    var flat = [];
    (function walk(v) {
      if (ArrayBuffer.isView(v) || Array.isArray(v)) { for (var i = 0; i < v.length; i++) walk(v[i]); }
      else flat.push(v);
    })(p);
    if (!dtype) dtype = flat.every(function (v) { return v === Math.trunc(v); }) ? 'int32' : 'float32';
    return ctorOf(dtype).from(flat);
  }
  // flat pairs -> [[x, y], ...]
  function pairs(p) { var out = []; for (var i = 0; i + 1 < p.length; i += 2) out.push([p[i], p[i + 1]]); return out; }
  // np.concatenate(list of contours)
  function concat(list) {
    var n = 0, i;
    for (i = 0; i < list.length; i++) n += list[i].length;
    var out = new (list.length ? list[0].constructor : Int32Array)(n), o = 0;
    for (i = 0; i < list.length; i++) { out.set(list[i], o); o += list[i].length; }
    return out;
  }

  OMR.np = {
    sum: sum, mean: mean, median: median, std: std, percentile: percentile, argmax: argmax, argmin: argmin,
    diff: diff, argsort: argsort, argsortQuick: argsortQuick, clip: clip, linspace: linspace, pairwiseSum: function (a) { return sum(a); },
    // image type
    CTORS: CTORS, dtypeOf: dtypeOf, ctorOf: ctorOf, image: image, isImage: isImage, shape: shape, ndim: ndim, size: size,
    zeros: zeros, ones: ones, full: full, zerosLike: zerosLike, fullLike: fullLike, clone: clone, astype: astype,
    sliceBounds: sliceBounds, crop: crop, assign: assign, paste: paste, get: get, set: set, channel: channel, merge: merge,
    map: map, map2: map2, gt: gt, ge: ge, lt: lt, eq: eq, and: and, or: or, where: where,
    countNonZero: countNonZero, nonzero: nonzero, sumAxis: sumAxis, max: maxOf, min: minOf,
    // point lists
    ptsLen: ptsLen, toPts: toPts, pairs: pairs, concat: concat
  };
})(typeof self !== 'undefined' ? self : globalThis);
