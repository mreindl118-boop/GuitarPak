/* soundLAB OMR: OpenCV with cv2-Python-shaped calls (OMR.cv2) over opencv.js 5.0.0
   (@techstark/opencv-js, the same OpenCV version as the Python reference), for the
   homr port (github.com/liebharc/homr, AGPL-3.0).

   Conventions (see notes/foundation.md):
   - images are OMR.np images {h, w, c, data}; every wrapper copies into a cv.Mat,
     calls opencv.js, copies the result out and deletes every Mat it made.
   - a contour / point list is a flat typed array of x,y pairs (numpy (N,1,2)
     flattened): Int32Array = int32, Float32Array = float32. Nested [[x, y], ...]
     arrays are accepted too (all-integer -> int32, else float32).
   - a rotated rect is [[cx, cy], [w, h], angle] exactly like cv2's tuples.
   - Python keyword arguments become a trailing options object.
   - functions that draw into an image (fillPoly, line, ...) mutate img.data in place
     like cv2 does with a numpy array, and return img.
   - "None" results stay null (no contours -> hierarchy null, HoughLinesP / findNonZero
     with nothing found -> null).
   - cv2.Subdiv2D is not in opencv.js: staff_dewarping reimplements the triangulation.

   Where opencv.js would not give cv2's numbers, the call is ported to JS instead (each
   checked bit for bit against cv2 in tests/omr-cv.test.js):
   - boxPoints (OpenCV 5's corner formula, float32 math)
   - fitEllipse (degenerate point sets are jittered with cv::theRNG(): its state is kept here
     and carries over like in a Python process; resetRNG() = a fresh process; GCC's argument
     evaluation order; OpenCV's Jacobi SVD and JAMA eigen solver)
   - warpAffine for 8-bit INTER_LINEAR + BORDER_CONSTANT and addWeighted for two uint8 images
     (the float32 FMA kernels cv2 dispatches on x86 with AVX2)
   - findNonZero (missing from opencv.js)
   INTER_CUBIC resize stays on opencv.js: the x86 cv2 wheel hands uint8 INTER_CUBIC to Intel
   IPP, which differs by 1 grey level in <1% of values (only SheetLab's low-res upscale uses it). */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  var np = OMR.np;
  var cv = null;
  var CN_SHIFT = 5; // OpenCV 5: CV_8UC3 = 64 (OpenCV 4 used 3); read from opencv.js in setCv

  // cv2.error: opencv.js throws a number (C++ exception pointer); we rethrow this
  function CvError(msg) { this.name = 'cv2.error'; this.message = msg; this.stack = (new Error(msg)).stack; }
  CvError.prototype = Object.create(Error.prototype);
  CvError.prototype.constructor = CvError;
  // str(cv2.error) is OpenCV's message with the wheel's source path (/io/opencv/...); opencv.js
  // was built elsewhere: the path is rewritten so the text matches Python (the SheetLab engine
  // shows str(exc) as a page's skip reason)
  var CV_SRC = /OpenCV\(([^)]*)\) \S*?\/opencv\/modules\//;
  function cvMessage(m) { return String(m).replace(CV_SRC, 'OpenCV($1) /io/opencv/modules/'); }
  // the message cv2 gives for a CV_Assert / CV_Error raised in the C++ code at file:line
  function cvAssertText(file, line, code, kind, what, fn) {
    return 'OpenCV(5.0.0) /io/opencv/modules/' + file + ':' + line + ': error: (' + code + ':' + kind + ') ' + what + " in function '" + fn + "'\n";
  }
  function wrapErr(e) {
    if (e instanceof CvError) return e;
    if (typeof e === 'number' && cv && cv.exceptionFromPtr) {
      var m = '';
      try { m = cv.exceptionFromPtr(e).msg; } catch (x) { m = 'OpenCV exception ' + e; }
      return new CvError(cvMessage(m));
    }
    return e;
  }

  OMR.setCv = function (c) {
    cv = c;
    if (cv.CV_8UC2) CN_SHIFT = Math.round(Math.log(cv.CV_8UC2) / Math.LN2);
    // numeric constants as the loaded opencv.js defines them (they match cv2 5.0.0)
    for (var k in CONST) if (typeof cv[k] === 'number') C2[k] = cv[k];
  };
  OMR.getCv = function () { return need(); };
  function need() {
    if (!cv) throw new Error('OMR.cv2: opencv.js is not loaded (call OMR.setCv(cv) first)');
    return cv;
  }

  // ---- Mat <-> image ----
  var DEPTH = { uint8: 0, int8: 1, uint16: 2, int16: 3, int32: 4, float32: 5, float64: 6 };
  var DEPTH_NAME = ['uint8', 'int8', 'uint16', 'int16', 'int32', 'float32', 'float64'];
  function matType(depth, c) { return depth + ((c - 1) << CN_SHIFT); }
  function view(m, depth) {
    switch (depth) {
      case 0: return m.data;
      case 1: return m.data8S;
      case 2: return m.data16U;
      case 3: return m.data16S;
      case 4: return m.data32S;
      case 5: return m.data32F;
      case 6: return m.data64F;
    }
    throw new Error('OMR.cv2: unsupported Mat depth ' + depth);
  }
  function toMat(img) {
    var dt = np.dtypeOf(img), d = DEPTH[dt];
    if (d === undefined) throw new Error('OMR.cv2: unsupported dtype ' + dt);
    var m = new cv.Mat(img.h, img.w, matType(d, img.c || 1));
    view(m, d).set(img.data);
    return m;
  }
  function fromMat(m) {
    if (!m.isContinuous()) { var cl = m.clone(); try { return fromMat(cl); } finally { cl.delete(); } }
    var d = m.depth();
    return { h: m.rows, w: m.cols, c: m.channels(), data: view(m, d).slice() };
  }
  // copy a Mat's pixels back into an image (in-place drawing)
  function writeBack(img, m) { img.data.set(view(m, m.depth())); return img; }

  // where cv2 5.0.0 asserts the point dtype (file, line, condition, function), for its message
  var PTS_ASSERT = {
    minAreaRect: ['geometry/src/convhull.cpp', 147, 'total >= 0 && (depth == CV_32F || depth == CV_32S)', 'convexHull'],
    convexHull: ['geometry/src/convhull.cpp', 147, 'total >= 0 && (depth == CV_32F || depth == CV_32S)', 'convexHull'],
    boundingRect: ['geometry/src/geometry.cpp', 599, 'npoints >= 0 && (depth == CV_32F || depth == CV_32S)', 'pointSetBoundingRect'],
    contourArea: ['geometry/src/geometry.cpp', 445, 'npoints >= 0 && (depth == CV_32F || depth == CV_32S)', 'contourArea'],
    pointPolygonTest: ['geometry/src/geometry.cpp', 55, 'total >= 0 && (depth == CV_32S || depth == CV_32F)', 'pointPolygonTest'],
    fitEllipseDirect: ['geometry/src/shapedescr.cpp', 620, 'n >= 0 && (depth == CV_32F || depth == CV_32S)', 'fitEllipseDirect'],
    fitEllipse: ['geometry/src/shapedescr.cpp', 256, 'n >= 0 && (depth == CV_32F || depth == CV_32S)', 'fitEllipseNoDirect'],
    intersectConvexConvex1: ['geometry/src/geometry.cpp', 917, 'p1.depth() == CV_32S || p1.depth() == CV_32F', 'intersectConvexConvex'],
    intersectConvexConvex2: ['geometry/src/geometry.cpp', 918, 'p2.depth() == CV_32S || p2.depth() == CV_32F', 'intersectConvexConvex'],
    getAffineTransform: ['geometry/src/geometry.cpp', 908, 'src.checkVector(2, CV_32F) == 3 && dst.checkVector(2, CV_32F) == 3', 'getAffineTransform'],
    // the drawing functions take int32 points only
    fillPoly: ['imgproc/src/drawing.cpp', 2121, 'p.checkVector(2, CV_32S) > 0', 'fillPoly'],
    fillConvexPoly: ['imgproc/src/drawing.cpp', 2099, 'points.checkVector(2, CV_32S) >= 0', 'fillConvexPoly'],
    drawContours: ['imgproc/src/drawing.cpp', 2242, 'npoints > 0', 'drawContours']
  };
  // cv2's point functions take int32 / float32 arrays only (int64 is converted by the bindings,
  // but there is no int64 typed array here): a typed array of another dtype raises cv2.error with
  // cv2's (-215) depth assertion, e.g. a Float64Array = a float64 numpy array, which homr always
  // casts with .astype(np.float32) first. Nested JS arrays are untyped and pass. `dtype` = the one
  // dtype the function requires (getAffineTransform: float32; drawing: int32).
  function checkPts(p, dtype, fn) {
    if (!ArrayBuffer.isView(p)) return;
    var dt = np.dtypeOf(p);
    if (dtype ? dt !== dtype : dt !== 'int32' && dt !== 'float32') {
      var a = PTS_ASSERT[fn] || ['geometry/src/geometry.cpp', 0, 'depth == CV_32F || depth == CV_32S', fn || 'points'];
      throw new CvError(cvAssertText(a[0], a[1], -215, 'Assertion failed', a[2], a[3]));
    }
  }
  // flat x,y pairs -> CV_32SC2 / CV_32FC2 Mat (nested JS arrays: all-integer -> int32, else
  // float32, or the required dtype)
  function ptsMat(p, dtype, fn) {
    checkPts(p, dtype, fn);
    var a = np.toPts(p, dtype), n = a.length >> 1, m;
    if (a instanceof Int32Array) { m = new cv.Mat(n, 1, cv.CV_32SC2); m.data32S.set(a); }
    else if (a instanceof Float32Array || a instanceof Float64Array) { m = new cv.Mat(n, 1, cv.CV_32FC2); m.data32F.set(a); }
    else { m = new cv.Mat(n, 1, cv.CV_32SC2); m.data32S.set(Int32Array.from(a)); }
    return m;
  }
  function ptsOf(m) {
    if (!m.rows || !m.cols) return m.depth() === 5 ? new Float32Array(0) : new Int32Array(0);
    var d = m.depth();
    if (d === 4) return m.data32S.slice();
    if (d === 5) return m.data32F.slice();
    return Float32Array.from(view(m, d));
  }
  function rrect(r) {
    return { center: { x: r[0][0], y: r[0][1] }, size: { width: r[1][0], height: r[1][1] }, angle: r[2] };
  }
  function unrrect(r) { return [[r.center.x, r.center.y], [r.size.width, r.size.height], r.angle]; }
  // Python scalars: a number is Scalar(v, 0, 0, 0); a tuple is padded with zeros
  function scalar(v) {
    if (v === undefined || v === null) return [0, 0, 0, 0];
    if (typeof v === 'number') return [v, 0, 0, 0];
    var s = [0, 0, 0, 0];
    for (var i = 0; i < v.length && i < 4; i++) s[i] = v[i];
    return s;
  }
  function size2(s) { return new cv.Size(s[0], s[1]); }
  function pt(p) { return new cv.Point(p[0], p[1]); }
  function kernelMat(k) {
    if (!k) return new cv.Mat();
    if (np.isImage(k)) return toMat(k);
    throw new Error('OMR.cv2: kernel must be an image');
  }
  function opt(o, k, d) { return o && o[k] !== undefined && o[k] !== null ? o[k] : d; }
  // run fn(mats) and always delete the Mats registered with track()
  function run(fn) {
    need();
    var made = [];
    function track(m) { made.push(m); return m; }
    try { return fn(track); }
    catch (e) { throw wrapErr(e); }
    finally { for (var i = made.length - 1; i >= 0; i--) { try { made[i].delete(); } catch (x) { /* already gone */ } } }
  }

  // ---- contours and geometry ----
  // cv2.findContours(img, mode, method) -> [contours, hierarchy]
  // contours: Int32Array per contour (x,y pairs); hierarchy: Int32Array of N*4
  // [next, previous, first_child, parent] (numpy (1,N,4) flattened) or null when empty
  function findContours(img, mode, method) {
    return run(function (t) {
      var src = t(toMat(img)), cs = t(new cv.MatVector()), hier = t(new cv.Mat());
      cv.findContours(src, cs, hier, mode, method);
      var n = cs.size(), out = new Array(n);
      for (var i = 0; i < n; i++) { var m = cs.get(i); try { out[i] = m.data32S.slice(); } finally { m.delete(); } }
      return [out, n ? hier.data32S.slice() : null];
    });
  }
  // cv2.minAreaRect(points) -> [[cx, cy], [w, h], angle]
  // An empty point set: cv2 returns defaults where opencv.js asserts (its empty Mat fails
  // checkVector), so the point-set wrappers answer those cases themselves.
  function isEmptyPts(p, fn) { checkPts(p, null, fn); return np.toPts(p).length < 2; }
  function minAreaRect(points) {
    if (isEmptyPts(points, 'minAreaRect')) return [[0, 0], [0, 0], -90];
    return run(function (t) { return unrrect(cv.minAreaRect(t(ptsMat(points)))); });
  }
  // opencv.js's own fitEllipse, kept for comparison: it differs from cv2 on degenerate
  // contours (see the fitEllipse port below)
  function fitEllipseCv(points) {
    return run(function (t) { return unrrect(cv.fitEllipse(t(ptsMat(points)))); });
  }
  // cv2.boxPoints(rect) -> [[x, y] x 4] float32 values. Pure JS port of
  // cv::RotatedRect::points (OpenCV 5.0.0 modules/core/src/types.cpp): float math on the
  // float32 rect fields, cos/sin in double. OpenCV 5 computes all four corners from the
  // centre (4.x mirrored pt[2], pt[3] through it, which rounds differently).
  // Checked against cv2 in tests/omr-cv.test.js.
  var fr = Math.fround;
  function boxPoints(r) {
    var cx = fr(r[0][0]), cy = fr(r[0][1]), w = fr(r[1][0]), h = fr(r[1][1]), ang = fr(r[2]);
    var rad = ang * Math.PI / 180;
    var b = fr(fr(Math.cos(rad)) * 0.5), a = fr(fr(Math.sin(rad)) * 0.5);
    var ah = fr(a * h), aw = fr(a * w), bh = fr(b * h), bw = fr(b * w);
    return [
      [fr(fr(cx - ah) - bw), fr(fr(cy + bh) - aw)],
      [fr(fr(cx + ah) - bw), fr(fr(cy - bh) - aw)],
      [fr(fr(cx + ah) + bw), fr(fr(cy - bh) + aw)],
      [fr(fr(cx - ah) + bw), fr(fr(cy + bh) + aw)]
    ];
  }
  // ---- fitEllipse: JS port of OpenCV 5.0.0 modules/geometry/src/shapedescr.cpp ----
  // Why a port and not opencv.js: fitEllipse jitters degenerate point sets with the
  // process-wide cv::theRNG(), so a result depends on (1) every earlier jittering
  // fitEllipse call of the process and (2) the order the compiler evaluates
  // Point2f(rng.uniform(..), rng.uniform(..)): GCC (the Python wheel) draws y before x,
  // clang (opencv.js) x before y. Here theRNG's state lives in OMR.cv2 and carries over
  // from page to page like the Python process does (resetRNG() = a fresh process), and
  // the draws follow GCC's order. The linear algebra is OpenCV's own: the Jacobi SVD and
  // back substitution of core/src/lapack.cpp and the JAMA eigen solver of core/src/lda.cpp.
  // One known difference: the Python wheel hands SVDs with >= 25 rows
  // (contours of >= 25 points) to LAPACK dgesdd (OpenBLAS), whose last bits differ from the
  // Jacobi SVD; after the float32 rounding of the result that is very rarely visible.
  var DBL_EPSILON = 2.220446049250313e-16, DBL_MIN = 2.2250738585072014e-308, FLT_EPSILON = 1.1920928955078125e-7;
  var U32 = 4294967296;

  // cv::RNG (core/operations.hpp): multiply-with-carry on a uint64 state, kept as two uint32
  // halves: state = (uint64)(unsigned)state * 4164903690U + (unsigned)(state >> 32)
  var RNG_COEFF = 4164903690, RNG_CH = Math.floor(RNG_COEFF / 65536), RNG_CL = RNG_COEFF - RNG_CH * 65536;
  function rngNext(st) {
    var lo = st.lo, a = lo * RNG_CL, b = lo * RNG_CH; // exact: both products < 2^48
    var aLo = a % U32, aHi = Math.floor(a / U32), bLo = b % 65536, bHi = Math.floor(b / 65536);
    var t = aLo + bLo * 65536 + st.hi;
    st.lo = t % U32;
    st.hi = (aHi + bHi + Math.floor(t / U32)) % U32;
    return st.lo;
  }
  // RNG::uniform(float a, float b) = ((float)*this)*(b - a) + a, (float)*this = next()*2^-32f
  function rngUniformF(st, a, b) {
    var f = fr(rngNext(st)) * 2.3283064365386962890625e-10;
    return fr(fr(f * fr(b - a)) + a);
  }
  // cv::theRNG() of the calling thread: RNG() starts at state 0xffffffff
  var theRNG = { lo: 0xffffffff, hi: 0 };
  function resetRNG() { theRNG.lo = 0xffffffff; theRNG.hi = 0; }
  // cv2.setRNGSeed(seed): theRNG() = RNG((uint64)seed); RNG(0) means 0xffffffff
  function setRNGSeed(seed) {
    seed = seed | 0;
    if (seed === 0) { resetRNG(); return; }
    theRNG.lo = seed >>> 0;
    theRNG.hi = seed < 0 ? 0xffffffff : 0;
  }
  // shapedescr.cpp getOfs(eps): Point2f(rng.uniform(-eps, eps), rng.uniform(-eps, eps)),
  // arguments evaluated right to left as GCC does -> [x, y]
  function getOfs(eps) {
    var ne = fr(-eps);
    var y = rngUniformF(theRNG, ne, eps);
    var x = rngUniformF(theRNG, ne, eps);
    return [x, y];
  }

  // lapack.cpp's own hypot (the Jacobi SVD does not call libm's)
  function hypot(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    if (a > b) { b /= a; return a * Math.sqrt(1 + b * b); }
    if (b > 0) { a /= b; return b * Math.sqrt(1 + a * a); }
    return 0;
  }

  // JacobiSVDImpl_<double> (lapack.cpp). At: n rows of length m (= A transposed), changed in
  // place into the left singular vectors; W gets the n singular values (descending), Vt the
  // n x n right singular vectors. n1 = how many left vectors to complete (0 = none).
  function jacobiSVD(At, W, Vt, m, n, n1) {
    var minval = DBL_MIN, eps = DBL_EPSILON * 10;
    var Wd = new Float64Array(n), i, j, k, iter, maxIter = Math.max(m, 30), c, s, sd, t;
    for (i = 0; i < n; i++) {
      for (k = 0, sd = 0; k < m; k++) { t = At[i][k]; sd += t * t; }
      Wd[i] = sd;
      if (Vt) { for (k = 0; k < n; k++) Vt[i][k] = 0; Vt[i][i] = 1; }
    }
    for (iter = 0; iter < maxIter; iter++) {
      var changed = false;
      for (i = 0; i < n - 1; i++) {
        for (j = i + 1; j < n; j++) {
          var Ai = At[i], Aj = At[j], a = Wd[i], p = 0, b = Wd[j];
          for (k = 0; k < m; k++) p += Ai[k] * Aj[k];
          if (Math.abs(p) <= eps * Math.sqrt(a * b)) continue;
          p *= 2;
          var beta = a - b, gamma = hypot(p, beta);
          if (beta < 0) {
            var delta = (gamma - beta) * 0.5;
            s = Math.sqrt(delta / gamma);
            c = p / (gamma * s * 2);
          } else {
            c = Math.sqrt((gamma + beta) / (gamma * 2));
            s = p / (gamma * c * 2);
          }
          a = b = 0;
          for (k = 0; k < m; k++) {
            var t0 = c * Ai[k] + s * Aj[k], t1 = -s * Ai[k] + c * Aj[k];
            Ai[k] = t0; Aj[k] = t1;
            a += t0 * t0; b += t1 * t1;
          }
          Wd[i] = a; Wd[j] = b;
          changed = true;
          if (Vt) {
            var Vi = Vt[i], Vj = Vt[j];
            for (k = 0; k < n; k++) {
              var v0 = c * Vi[k] + s * Vj[k], v1 = -s * Vi[k] + c * Vj[k];
              Vi[k] = v0; Vj[k] = v1;
            }
          }
        }
      }
      if (!changed) break;
    }
    for (i = 0; i < n; i++) {
      for (k = 0, sd = 0; k < m; k++) { t = At[i][k]; sd += t * t; }
      Wd[i] = Math.sqrt(sd);
    }
    for (i = 0; i < n - 1; i++) {
      j = i;
      for (k = i + 1; k < n; k++) if (Wd[j] < Wd[k]) j = k;
      if (i !== j) {
        t = Wd[i]; Wd[i] = Wd[j]; Wd[j] = t;
        if (Vt) {
          t = At[i]; At[i] = At[j]; At[j] = t;
          t = Vt[i]; Vt[i] = Vt[j]; Vt[j] = t;
        }
      }
    }
    for (i = 0; i < n; i++) W[i] = Wd[i];
    if (!Vt) return;
    var rng = { lo: 0x12345678, hi: 0 };
    for (i = 0; i < n1; i++) {
      sd = i < n ? Wd[i] : 0;
      for (var ii = 0; ii < 100 && sd <= minval; ii++) {
        // a zero singular value: make the left vector a random one orthogonal to the others
        var val0 = 1 / m;
        for (k = 0; k < m; k++) At[i][k] = (rngNext(rng) & 256) !== 0 ? val0 : -val0;
        for (iter = 0; iter < 2; iter++) {
          for (j = 0; j < i; j++) {
            sd = 0;
            for (k = 0; k < m; k++) sd += At[i][k] * At[j][k];
            var asum = 0;
            for (k = 0; k < m; k++) { t = At[i][k] - sd * At[j][k]; At[i][k] = t; asum += Math.abs(t); }
            asum = asum > eps * 100 ? 1 / asum : 0;
            for (k = 0; k < m; k++) At[i][k] *= asum;
          }
        }
        sd = 0;
        for (k = 0; k < m; k++) { t = At[i][k]; sd += t * t; }
        sd = Math.sqrt(sd);
      }
      s = sd > minval ? 1 / sd : 0;
      for (k = 0; k < m; k++) At[i][k] *= s;
    }
  }
  // SVBkSbImpl_<double> for one right-hand side: x = V diag(1/w) U^T b, dropping singular
  // values <= sum(w) * 2 DBL_EPSILON. Ut[i] = left singular vector i, Vt[i] = right one.
  function svBackSubst(w, Ut, Vt, b, m, n) {
    var nm = Math.min(m, n), threshold = 0, i, j, x = new Float64Array(n);
    for (i = 0; i < nm; i++) threshold += w[i];
    threshold *= DBL_EPSILON * 2;
    for (i = 0; i < nm; i++) {
      var wi = w[i];
      if (Math.abs(wi) <= threshold) continue;
      wi = 1 / wi;
      var s = 0;
      for (j = 0; j < m; j++) s += Ut[i][j] * b[j];
      s *= wi;
      for (j = 0; j < n; j++) x[j] = x[j] + s * Vt[i][j];
    }
    return x;
  }
  function rowsOf(n, m) { var r = []; for (var i = 0; i < n; i++) r.push(new Float64Array(m)); return r; }
  // cv::SVDecomp(A) for an m x n matrix (m >= n) given as rows -> {w, Ut, Vt}
  function svdDecomp(A, m, n) {
    var At = rowsOf(n, m), Vt = rowsOf(n, n), w = new Float64Array(n);
    for (var i = 0; i < n; i++) for (var k = 0; k < m; k++) At[i][k] = A[k][i];
    jacobiSVD(At, w, Vt, m, n, n);
    return { w: w, Ut: At, Vt: Vt };
  }
  // cv::solve(A, b, x, DECOMP_SVD) for m x n rows A (m >= n) and one right-hand side
  function solveSVD(A, b, m, n) {
    var d = svdDecomp(A, m, n);
    return svBackSubst(d.w, d.Ut, d.Vt, b, m, n);
  }

  // EigenvalueDecomposition (lda.cpp, a port of JAMA's): orthes + hqr2 on a general matrix
  // -> {d (real parts), e (imaginary parts), V (eigenvectors as columns)}
  function eigenJAMA(A) {
    var n = A.length, H = A.map(function (r) { return Float64Array.from(r); });
    var V = rowsOf(n, n), d = new Float64Array(n), e = new Float64Array(n), ort = new Float64Array(n);
    var i, j, k, m, low = 0, high = n - 1, f, g, h, scale;
    // orthes: Householder reduction to Hessenberg form
    for (m = low + 1; m < high; m++) {
      scale = 0.0;
      for (i = m; i <= high; i++) scale = scale + Math.abs(H[i][m - 1]);
      if (scale !== 0.0) {
        h = 0.0;
        for (i = high; i >= m; i--) { ort[i] = H[i][m - 1] / scale; h += ort[i] * ort[i]; }
        g = Math.sqrt(h);
        if (ort[m] > 0) g = -g;
        h = h - ort[m] * g;
        ort[m] = ort[m] - g;
        for (j = m; j < n; j++) {
          f = 0.0;
          for (i = high; i >= m; i--) f += ort[i] * H[i][j];
          f = f / h;
          for (i = m; i <= high; i++) H[i][j] -= f * ort[i];
        }
        for (i = 0; i <= high; i++) {
          f = 0.0;
          for (j = high; j >= m; j--) f += ort[j] * H[i][j];
          f = f / h;
          for (j = m; j <= high; j++) H[i][j] -= f * ort[j];
        }
        ort[m] = scale * ort[m];
        H[m][m - 1] = scale * g;
      }
    }
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) V[i][j] = (i === j ? 1.0 : 0.0);
    for (m = high - 1; m > low; m--) {
      if (H[m][m - 1] !== 0.0) {
        for (i = m + 1; i <= high; i++) ort[i] = H[i][m - 1];
        for (j = m; j <= high; j++) {
          g = 0.0;
          for (i = m; i <= high; i++) g += ort[i] * V[i][j];
          g = (g / ort[m]) / H[m][m - 1]; // double division avoids possible underflow
          for (i = m; i <= high; i++) V[i][j] += g * ort[i];
        }
      }
    }
    hqr2(n, H, V, d, e);
    return { d: d, e: e, V: V };
  }
  function cdiv(xr, xi, yr, yi) {
    var r, dv;
    if (Math.abs(yr) > Math.abs(yi)) { r = yi / yr; dv = yr + r * yi; return [(xr + r * xi) / dv, (xi - r * xr) / dv]; }
    r = yr / yi; dv = yi + r * yr;
    return [(r * xr + xi) / dv, (r * xi - xr) / dv];
  }
  // hqr2: Hessenberg -> real Schur form, then eigenvectors (Algol hqr2 / EISPACK via JAMA)
  function hqr2(nn, H, V, d, e) {
    var maxIters = 1000 * nn, n1 = nn - 1, low = 0, high = nn - 1, eps = DBL_EPSILON, exshift = 0.0;
    var i, j, k, l, m, norm = 0.0, iter = 0, p, q, r, s, w, x, y, z, t, c2;
    for (i = 0; i < nn; i++) for (j = Math.max(i - 1, 0); j < nn; j++) norm += Math.abs(H[i][j]);
    while (n1 >= low) {
      // look for a single small sub-diagonal element
      l = n1;
      while (l > low) {
        if (norm < FLT_EPSILON) break;
        s = Math.abs(H[l - 1][l - 1]) + Math.abs(H[l][l]);
        if (s === 0.0) s = norm;
        if (Math.abs(H[l][l - 1]) < eps * s) break;
        l--;
      }
      if (l === n1) {
        // one root found
        H[n1][n1] = H[n1][n1] + exshift;
        d[n1] = H[n1][n1];
        e[n1] = 0.0;
        n1--;
        iter = 0;
      } else if (l === n1 - 1) {
        // two roots found
        w = H[n1][n1 - 1] * H[n1 - 1][n1];
        p = (H[n1 - 1][n1 - 1] - H[n1][n1]) * 0.5;
        q = p * p + w;
        z = Math.sqrt(Math.abs(q));
        H[n1][n1] = H[n1][n1] + exshift;
        H[n1 - 1][n1 - 1] = H[n1 - 1][n1 - 1] + exshift;
        x = H[n1][n1];
        if (q >= 0) {
          // real pair
          if (p >= 0) z = p + z; else z = p - z;
          d[n1 - 1] = x + z;
          d[n1] = d[n1 - 1];
          if (z !== 0.0) d[n1] = x - w / z;
          e[n1 - 1] = 0.0;
          e[n1] = 0.0;
          x = H[n1][n1 - 1];
          s = Math.abs(x) + Math.abs(z);
          p = x / s;
          q = z / s;
          r = Math.sqrt(p * p + q * q);
          p = p / r;
          q = q / r;
          for (j = n1 - 1; j < nn; j++) { z = H[n1 - 1][j]; H[n1 - 1][j] = q * z + p * H[n1][j]; H[n1][j] = q * H[n1][j] - p * z; }
          for (i = 0; i <= n1; i++) { z = H[i][n1 - 1]; H[i][n1 - 1] = q * z + p * H[i][n1]; H[i][n1] = q * H[i][n1] - p * z; }
          for (i = low; i <= high; i++) { z = V[i][n1 - 1]; V[i][n1 - 1] = q * z + p * V[i][n1]; V[i][n1] = q * V[i][n1] - p * z; }
        } else {
          // complex pair
          d[n1 - 1] = x + p;
          d[n1] = x + p;
          e[n1 - 1] = z;
          e[n1] = -z;
        }
        n1 = n1 - 2;
        iter = 0;
      } else {
        // no convergence yet: form the shift
        x = H[n1][n1];
        y = 0.0;
        w = 0.0;
        if (l < n1) { y = H[n1 - 1][n1 - 1]; w = H[n1][n1 - 1] * H[n1 - 1][n1]; }
        // Wilkinson's original ad hoc shift
        if (iter === 10) {
          exshift += x;
          for (i = low; i <= n1; i++) H[i][i] -= x;
          s = Math.abs(H[n1][n1 - 1]) + Math.abs(H[n1 - 1][n1 - 2]);
          x = y = 0.75 * s;
          w = -0.4375 * s * s;
        }
        // MATLAB's new ad hoc shift
        if (iter === 30) {
          s = (y - x) * 0.5;
          s = s * s + w;
          if (s > 0) {
            s = Math.sqrt(s);
            if (y < x) s = -s;
            s = x - w / ((y - x) * 0.5 + s);
            for (i = low; i <= n1; i++) H[i][i] -= s;
            exshift += s;
            x = y = w = 0.964;
          }
        }
        iter = iter + 1;
        if (iter > maxIters) throw new CvError('Algorithm doesn\'t converge (complex eigen values?)');
        p = NaN; q = NaN; r = NaN;
        // look for two consecutive small sub-diagonal elements
        m = n1 - 2;
        while (m >= l) {
          z = H[m][m];
          r = x - z;
          s = y - z;
          p = (r * s - w) / H[m + 1][m] + H[m][m + 1];
          q = H[m + 1][m + 1] - z - r - s;
          r = H[m + 2][m + 1];
          s = Math.abs(p) + Math.abs(q) + Math.abs(r);
          p = p / s;
          q = q / s;
          r = r / s;
          if (m === l) break;
          if (Math.abs(H[m][m - 1]) * (Math.abs(q) + Math.abs(r)) < eps * (Math.abs(p) * (Math.abs(H[m - 1][m - 1]) + Math.abs(z) + Math.abs(H[m + 1][m + 1])))) break;
          m--;
        }
        for (i = m + 2; i <= n1; i++) {
          H[i][i - 2] = 0.0;
          if (i > m + 2) H[i][i - 3] = 0.0;
        }
        // double QR step involving rows l:n and columns m:n
        for (k = m; k < n1; k++) {
          var notlast = (k !== n1 - 1);
          if (k !== m) {
            p = H[k][k - 1];
            q = H[k + 1][k - 1];
            r = (notlast ? H[k + 2][k - 1] : 0.0);
            x = Math.abs(p) + Math.abs(q) + Math.abs(r);
            if (x !== 0.0) { p = p / x; q = q / x; r = r / x; }
          }
          if (x === 0.0) break;
          s = Math.sqrt(p * p + q * q + r * r);
          if (p < 0) s = -s;
          if (s !== 0) {
            if (k !== m) H[k][k - 1] = -s * x;
            else if (l !== m) H[k][k - 1] = -H[k][k - 1];
            p = p + s;
            x = p / s;
            y = q / s;
            z = r / s;
            q = q / p;
            r = r / p;
            for (j = k; j < nn; j++) {
              p = H[k][j] + q * H[k + 1][j];
              if (notlast) { p = p + r * H[k + 2][j]; H[k + 2][j] = H[k + 2][j] - p * z; }
              H[k][j] -= p * x;
              H[k + 1][j] -= p * y;
            }
            for (i = 0; i <= Math.min(n1, k + 3); i++) {
              p = x * H[i][k] + y * H[i][k + 1];
              if (notlast) { p = p + z * H[i][k + 2]; H[i][k + 2] = H[i][k + 2] - p * r; }
              H[i][k] -= p;
              H[i][k + 1] -= p * q;
            }
            for (i = low; i <= high; i++) {
              p = x * V[i][k] + y * V[i][k + 1];
              if (notlast) { p = p + z * V[i][k + 2]; V[i][k + 2] = V[i][k + 2] - p * r; }
              V[i][k] = V[i][k] - p;
              V[i][k + 1] = V[i][k + 1] - p * q;
            }
          }
        }
      }
    }
    // back-substitute to find the vectors of the upper triangular form
    if (norm < FLT_EPSILON) return;
    for (n1 = nn - 1; n1 >= 0; n1--) {
      p = d[n1];
      q = e[n1];
      if (q === 0) {
        // real vector
        z = NaN; s = NaN;
        l = n1;
        H[n1][n1] = 1.0;
        for (i = n1 - 1; i >= 0; i--) {
          w = H[i][i] - p;
          r = 0.0;
          for (j = l; j <= n1; j++) r = r + H[i][j] * H[j][n1];
          if (e[i] < 0.0) {
            z = w;
            s = r;
          } else {
            l = i;
            if (e[i] === 0.0) {
              if (w !== 0.0) H[i][n1] = -r / w;
              else H[i][n1] = -r / (eps * norm);
            } else {
              // solve real equations
              x = H[i][i + 1];
              y = H[i + 1][i];
              q = (d[i] - p) * (d[i] - p) + e[i] * e[i];
              t = (x * s - z * r) / q;
              H[i][n1] = t;
              if (Math.abs(x) > Math.abs(z)) H[i + 1][n1] = (-r - w * t) / x;
              else H[i + 1][n1] = (-s - y * t) / z;
            }
            // overflow control
            t = Math.abs(H[i][n1]);
            if ((eps * t) * t > 1) {
              var invT = 1.0 / t;
              for (j = i; j <= n1; j++) H[j][n1] *= invT;
            }
          }
        }
      } else if (q < 0) {
        // complex vector
        z = NaN; r = NaN; s = NaN;
        l = n1 - 1;
        // last vector component imaginary so the matrix is triangular
        if (Math.abs(H[n1][n1 - 1]) > Math.abs(H[n1 - 1][n1])) {
          H[n1 - 1][n1 - 1] = q / H[n1][n1 - 1];
          H[n1 - 1][n1] = -(H[n1][n1] - p) / H[n1][n1 - 1];
        } else {
          c2 = cdiv(0.0, -H[n1 - 1][n1], H[n1 - 1][n1 - 1] - p, q);
          H[n1 - 1][n1 - 1] = c2[0]; H[n1 - 1][n1] = c2[1];
        }
        H[n1][n1 - 1] = 0.0;
        H[n1][n1] = 1.0;
        for (i = n1 - 2; i >= 0; i--) {
          var ra = 0.0, sa = 0.0, vr, vi;
          for (j = l; j <= n1; j++) { ra = ra + H[i][j] * H[j][n1 - 1]; sa = sa + H[i][j] * H[j][n1]; }
          w = H[i][i] - p;
          if (e[i] < 0.0) {
            z = w; r = ra; s = sa;
          } else {
            l = i;
            if (e[i] === 0) {
              c2 = cdiv(-ra, -sa, w, q);
              H[i][n1 - 1] = c2[0]; H[i][n1] = c2[1];
            } else {
              // solve complex equations
              x = H[i][i + 1];
              y = H[i + 1][i];
              vr = (d[i] - p) * (d[i] - p) + e[i] * e[i] - q * q;
              vi = (d[i] - p) * 2.0 * q;
              if (vr === 0.0 && vi === 0.0) vr = eps * norm * (Math.abs(w) + Math.abs(q) + Math.abs(x) + Math.abs(y) + Math.abs(z));
              c2 = cdiv(x * r - z * ra + q * sa, x * s - z * sa - q * ra, vr, vi);
              H[i][n1 - 1] = c2[0]; H[i][n1] = c2[1];
              if (Math.abs(x) > (Math.abs(z) + Math.abs(q))) {
                H[i + 1][n1 - 1] = (-ra - w * H[i][n1 - 1] + q * H[i][n1]) / x;
                H[i + 1][n1] = (-sa - w * H[i][n1] - q * H[i][n1 - 1]) / x;
              } else {
                c2 = cdiv(-r - y * H[i][n1 - 1], -s - y * H[i][n1], z, q);
                H[i + 1][n1 - 1] = c2[0]; H[i + 1][n1] = c2[1];
              }
            }
            // overflow control
            t = Math.max(Math.abs(H[i][n1 - 1]), Math.abs(H[i][n1]));
            if ((eps * t) * t > 1) {
              for (j = i; j <= n1; j++) { H[j][n1 - 1] = H[j][n1 - 1] / t; H[j][n1] = H[j][n1] / t; }
            }
          }
        }
      }
    }
    // back transformation to get the eigenvectors of the original matrix
    for (j = nn - 1; j >= low; j--) {
      for (i = low; i <= high; i++) {
        z = 0.0;
        for (k = low; k <= Math.min(j, high); k++) z += V[i][k] * H[k][j];
        V[i][j] = z;
      }
    }
  }
  // cv::eigenNonSymmetric: eigenvalues sorted descending (sortIdx: stable ascending, then
  // reversed) and the matching eigenvectors as ROWS (not normalised)
  function eigenNonSymmetric(A) {
    var r = eigenJAMA(A), n = A.length, idx = [], i, k;
    for (i = 0; i < n; i++) idx.push(i);
    idx.sort(function (a, b) { return r.d[a] - r.d[b] || a - b; });
    idx.reverse();
    var vals = idx.map(function (j) { return r.d[j]; }), vecs = [];
    for (i = 0; i < n; i++) { var row = new Float64Array(n); for (k = 0; k < n; k++) row[k] = r.V[k][idx[i]]; vecs.push(row); }
    return { values: vals, vectors: vecs };
  }

  // the point set as float32 pairs, the way fitEllipse reads CV_32S / CV_32F input
  function ellipsePts(points) {
    // 5 points go to fitEllipseDirect, which asserts the dtype at its own line
    checkPts(points, null, ArrayBuffer.isView(points) && points.length === 10 ? 'fitEllipseDirect' : 'fitEllipse');
    var a = np.toPts(points), n = a.length >> 1, f = new Float32Array(2 * n);
    for (var i = 0; i < 2 * n; i++) f[i] = a[i]; // (float)int is exact for image coordinates
    return f;
  }
  // cv2.fitEllipse(points) -> [[cx, cy], [w, h], angle]; exactly 5 points take
  // fitEllipseDirect, more take fitEllipseNoDirect (OpenCV 5)
  function fitEllipse(points) {
    var p = ellipsePts(points), n = p.length >> 1;
    if (n < 5) throw new CvError(cvAssertText('geometry/src/shapedescr.cpp', 261, -201, 'Incorrect size of input array', 'There should be at least 5 points to fit the ellipse', 'fitEllipseNoDirect'));
    return n === 5 ? fitEllipseDirect(p, n) : fitEllipseNoDirect(p, n);
  }
  function fitEllipseNoDirect(pts, n) {
    var i, cx = 0, cy = 0, s = 0, min_eps = 1e-8;
    var P = Float32Array.from(pts); // ptsf_copy
    for (i = 0; i < n; i++) { cx = fr(cx + P[2 * i]); cy = fr(cy + P[2 * i + 1]); }
    cx = fr(cx / n); cy = fr(cy / n);
    for (i = 0; i < n; i++) {
      // fabs(float) + fabs(float) is float arithmetic in C++
      s += fr(Math.abs(fr(P[2 * i] - cx)) + Math.abs(fr(P[2 * i + 1] - cy)));
    }
    var scale = 100 / (s > FLT_EPSILON ? s : FLT_EPSILON);
    function rows5() {
      var A = [];
      for (var k = 0; k < n; k++) {
        var px = fr(P[2 * k] - cx) * scale, py = fr(P[2 * k + 1] - cy) * scale;
        A.push([-px * px, -py * py, -px * py, px, py]);
      }
      return A;
    }
    var bd = new Float64Array(n).fill(10000.0);
    var svd = svdDecomp(rows5(), n, 5);
    if (svd.w[0] * FLT_EPSILON > svd.w[4]) {
      // degenerate (e.g. collinear) points: jitter them with theRNG and fit again
      var eps = fr(s / (n * 2) * 1e-3);
      for (i = 0; i < n; i++) {
        var o = getOfs(eps);
        P[2 * i] = fr(P[2 * i] + o[0]);
        P[2 * i + 1] = fr(P[2 * i + 1] + o[1]);
      }
      svd = svdDecomp(rows5(), n, 5);
    }
    var gfp = svBackSubst(svd.w, svd.Ut, svd.Vt, bd, n, 5);
    // general-form parameters A - E -> the centre: differentiate wrt x / y
    var rp = new Float64Array(5);
    var c2 = solveSVD([[2 * gfp[0], gfp[2]], [gfp[2], 2 * gfp[1]]], [gfp[3], gfp[4]], 2, 2);
    rp[0] = c2[0]; rp[1] = c2[1];
    // re-fit A - C with that centre
    var A3 = [], b3 = new Float64Array(n).fill(1.0);
    for (i = 0; i < n; i++) {
      var px = fr(P[2 * i] - cx) * scale, py = fr(P[2 * i + 1] - cy) * scale;
      A3.push([(px - rp[0]) * (px - rp[0]), (py - rp[1]) * (py - rp[1]), (px - rp[0]) * (py - rp[1])]);
    }
    var g3 = solveSVD(A3, b3, n, 3);
    gfp[0] = g3[0]; gfp[1] = g3[1]; gfp[2] = g3[2];
    // angle and radii
    var t;
    rp[4] = -0.5 * Math.atan2(gfp[2], gfp[1] - gfp[0]); // convert from APP angle usage
    if (Math.abs(gfp[2]) > min_eps) t = gfp[2] / Math.sin(-2.0 * rp[4]);
    else t = gfp[1] - gfp[0]; // rotated by an integer multiple of pi/2
    rp[2] = Math.abs(gfp[0] + gfp[1] - t);
    if (rp[2] > min_eps) rp[2] = Math.sqrt(2.0 / rp[2]);
    rp[3] = Math.abs(gfp[0] + gfp[1] + t);
    if (rp[3] > min_eps) rp[3] = Math.sqrt(2.0 / rp[3]);
    var bx = fr(fr(rp[0] / scale) + cx), by = fr(fr(rp[1] / scale) + cy);
    var bw = fr(rp[2] * 2 / scale), bh = fr(rp[3] * 2 / scale), angle = 0;
    if (bw > bh) {
      var tmp = bw; bw = bh; bh = tmp;
      angle = fr(90 + rp[4] * 180 / Math.PI);
    }
    if (angle < -180) angle = fr(angle + 360);
    if (angle > 360) angle = fr(angle - 360);
    return [[bx, by], [bw, bh], angle];
  }
  function fitEllipseDirect(pts, n) {
    var i, k, j, iter, cx = 0, cy = 0, s = 0, eps = 0, idx = 0;
    for (i = 0; i < n; i++) { cx += pts[2 * i]; cy += pts[2 * i + 1]; }
    cx /= n; cy /= n;
    for (i = 0; i < n; i++) s += Math.abs(pts[2 * i] - cx) + Math.abs(pts[2 * i + 1] - cy);
    var scale = 100 / (s > FLT_EPSILON ? s : FLT_EPSILON);
    var TM = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Ts = 0, eVec = null;
    // first try the original point set; if it is singular, shift the points a bit
    for (iter = 0; iter < 2; iter++) {
      var A = [];
      for (i = 0; i < n; i++) {
        var dl = getOfs(eps);
        var px = (fr(pts[2 * i] + dl[0]) - cx) * scale, py = (fr(pts[2 * i + 1] + dl[1]) - cy) * scale;
        A.push([px * px, px * py, py * py, px, py, 1.0]);
      }
      // cv::mulTransposed(A, DM, true): DM = A^T A, each entry summed over the rows in order
      var DM = [];
      for (i = 0; i < 6; i++) DM.push(new Float64Array(6));
      for (i = 0; i < 6; i++) {
        for (j = i; j < 6; j++) {
          var s0 = 0;
          for (k = 0; k < n; k++) s0 += A[k][i] * A[k][j];
          DM[i][j] = DM[j][i] = s0;
        }
      }
      var inv = 1.0 / n;
      for (i = 0; i < 6; i++) for (j = 0; j < 6; j++) DM[i][j] *= inv;
      var D = function (a, b) { return DM[a][b]; };
      TM[0][0] = D(0, 5) * D(3, 5) * D(4, 4) - D(0, 5) * D(3, 4) * D(4, 5) - D(0, 4) * D(3, 5) * D(5, 4) +
        D(0, 3) * D(4, 5) * D(5, 4) + D(0, 4) * D(3, 4) * D(5, 5) - D(0, 3) * D(4, 4) * D(5, 5);
      TM[0][1] = D(1, 5) * D(3, 5) * D(4, 4) - D(1, 5) * D(3, 4) * D(4, 5) - D(1, 4) * D(3, 5) * D(5, 4) +
        D(1, 3) * D(4, 5) * D(5, 4) + D(1, 4) * D(3, 4) * D(5, 5) - D(1, 3) * D(4, 4) * D(5, 5);
      TM[0][2] = D(2, 5) * D(3, 5) * D(4, 4) - D(2, 5) * D(3, 4) * D(4, 5) - D(2, 4) * D(3, 5) * D(5, 4) +
        D(2, 3) * D(4, 5) * D(5, 4) + D(2, 4) * D(3, 4) * D(5, 5) - D(2, 3) * D(4, 4) * D(5, 5);
      TM[1][0] = D(0, 5) * D(3, 3) * D(4, 5) - D(0, 5) * D(3, 5) * D(4, 3) + D(0, 4) * D(3, 5) * D(5, 3) -
        D(0, 3) * D(4, 5) * D(5, 3) - D(0, 4) * D(3, 3) * D(5, 5) + D(0, 3) * D(4, 3) * D(5, 5);
      TM[1][1] = D(1, 5) * D(3, 3) * D(4, 5) - D(1, 5) * D(3, 5) * D(4, 3) + D(1, 4) * D(3, 5) * D(5, 3) -
        D(1, 3) * D(4, 5) * D(5, 3) - D(1, 4) * D(3, 3) * D(5, 5) + D(1, 3) * D(4, 3) * D(5, 5);
      TM[1][2] = D(2, 5) * D(3, 3) * D(4, 5) - D(2, 5) * D(3, 5) * D(4, 3) + D(2, 4) * D(3, 5) * D(5, 3) -
        D(2, 3) * D(4, 5) * D(5, 3) - D(2, 4) * D(3, 3) * D(5, 5) + D(2, 3) * D(4, 3) * D(5, 5);
      TM[2][0] = D(0, 5) * D(3, 4) * D(4, 3) - D(0, 5) * D(3, 3) * D(4, 4) - D(0, 4) * D(3, 4) * D(5, 3) +
        D(0, 3) * D(4, 4) * D(5, 3) + D(0, 4) * D(3, 3) * D(5, 4) - D(0, 3) * D(4, 3) * D(5, 4);
      TM[2][1] = D(1, 5) * D(3, 4) * D(4, 3) - D(1, 5) * D(3, 3) * D(4, 4) - D(1, 4) * D(3, 4) * D(5, 3) +
        D(1, 3) * D(4, 4) * D(5, 3) + D(1, 4) * D(3, 3) * D(5, 4) - D(1, 3) * D(4, 3) * D(5, 4);
      TM[2][2] = D(2, 5) * D(3, 4) * D(4, 3) - D(2, 5) * D(3, 3) * D(4, 4) - D(2, 4) * D(3, 4) * D(5, 3) +
        D(2, 3) * D(4, 4) * D(5, 3) + D(2, 4) * D(3, 3) * D(5, 4) - D(2, 3) * D(4, 3) * D(5, 4);
      Ts = (-(D(3, 5) * D(4, 4) * D(5, 3)) + D(3, 4) * D(4, 5) * D(5, 3) + D(3, 5) * D(4, 3) * D(5, 4) -
        D(3, 3) * D(4, 5) * D(5, 4) - D(3, 4) * D(4, 3) * D(5, 5) + D(3, 3) * D(4, 4) * D(5, 5));
      if (Math.abs(Ts) < DBL_EPSILON) {
        eps = fr(s / (n * 2) * 1e-2);
        continue;
      }
      M[0][0] = (D(2, 0) + (D(2, 3) * TM[0][0] + D(2, 4) * TM[1][0] + D(2, 5) * TM[2][0]) / Ts) / 2.;
      M[0][1] = (D(2, 1) + (D(2, 3) * TM[0][1] + D(2, 4) * TM[1][1] + D(2, 5) * TM[2][1]) / Ts) / 2.;
      M[0][2] = (D(2, 2) + (D(2, 3) * TM[0][2] + D(2, 4) * TM[1][2] + D(2, 5) * TM[2][2]) / Ts) / 2.;
      M[1][0] = -D(1, 0) - (D(1, 3) * TM[0][0] + D(1, 4) * TM[1][0] + D(1, 5) * TM[2][0]) / Ts;
      M[1][1] = -D(1, 1) - (D(1, 3) * TM[0][1] + D(1, 4) * TM[1][1] + D(1, 5) * TM[2][1]) / Ts;
      M[1][2] = -D(1, 2) - (D(1, 3) * TM[0][2] + D(1, 4) * TM[1][2] + D(1, 5) * TM[2][2]) / Ts;
      M[2][0] = (D(0, 0) + (D(0, 3) * TM[0][0] + D(0, 4) * TM[1][0] + D(0, 5) * TM[2][0]) / Ts) / 2.;
      M[2][1] = (D(0, 1) + (D(0, 3) * TM[0][1] + D(0, 4) * TM[1][1] + D(0, 5) * TM[2][1]) / Ts) / 2.;
      M[2][2] = (D(0, 2) + (D(0, 3) * TM[0][2] + D(0, 4) * TM[1][2] + D(0, 5) * TM[2][2]) / Ts) / 2.;
      eVec = eigenNonSymmetric(M).vectors;
      // select the eigen vector {a,b,c} which satisfies 4ac-b^2 > 0
      var cond = [0, 1, 2].map(function (q) { return 4.0 * eVec[q][0] * eVec[q][2] - eVec[q][1] * eVec[q][1]; });
      if (cond[0] < cond[1]) idx = (cond[1] < cond[2]) ? 2 : 1;
      else idx = (cond[0] < cond[2]) ? 2 : 0;
      // the ellipse condition must be meaningfully positive, not noise of complex eigenvalues
      var v0 = eVec[idx][0], v1 = eVec[idx][1], v2 = eVec[idx][2];
      if (cond[idx] > 1e-6 * (v0 * v0 + v1 * v1 + v2 * v2)) break;
      eps = fr(s / (n * 2) * 1e-2);
    }
    if (iter >= 2) return fitEllipseNoDirect(pts, n);
    var e = eVec[idx];
    var norm = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
    if (((e[0] < 0.0 ? -1 : 1) * (e[1] < 0.0 ? -1 : 1) * (e[2] < 0.0 ? -1 : 1)) <= 0.0) norm = -1.0 * norm;
    var pv0 = e[0] / norm, pv1 = e[1] / norm, pv2 = e[2] / norm;
    // Q = (TM . pVec) / Ts
    var Q0 = (TM[0][0] * pv0 + TM[0][1] * pv1 + TM[0][2] * pv2) / Ts;
    var Q1 = (TM[1][0] * pv0 + TM[1][1] * pv1 + TM[1][2] * pv2) / Ts;
    var Q2 = (TM[2][0] * pv0 + TM[2][1] * pv1 + TM[2][2] * pv2) / Ts;
    // the ellipse properties in the shifted coordinates (more accurate)
    var u1 = pv2 * Q0 * Q0 - pv1 * Q0 * Q1 + pv0 * Q1 * Q1 + pv1 * pv1 * Q2;
    var u2 = pv0 * pv2 * Q2;
    var l1 = Math.sqrt(pv1 * pv1 + (pv0 - pv2) * (pv0 - pv2));
    var l2 = pv0 + pv2;
    var l3 = pv1 * pv1 - 4 * pv0 * pv2;
    var p1 = 2 * pv2 * Q0 - pv1 * Q1;
    var p2 = 2 * pv0 * Q1 - pv1 * Q0;
    var x0 = (p1 / l3 / scale) + cx, y0 = (p2 / l3 / scale) + cy;
    var a = Math.sqrt(2.) * Math.sqrt((u1 - 4.0 * u2) / ((l1 - l2) * l3)) / scale;
    var b = Math.sqrt(2.) * Math.sqrt(-1.0 * ((u1 - 4.0 * u2) / ((l1 + l2) * l3))) / scale;
    var theta;
    if (pv1 === 0) theta = pv0 < pv2 ? 0 : Math.PI / 2.;
    else theta = Math.PI / 2. + 0.5 * Math.atan2(pv1, (pv0 - pv2));
    var bw = fr(2.0 * a), bh = fr(2.0 * b), angle;
    if (bw > bh) {
      var tmp = bw; bw = bh; bh = tmp;
      angle = fr((90 + theta * 180 / Math.PI) % 180.0);
    } else {
      angle = fr((theta * 180 / Math.PI) % 180.0);
    }
    return [[fr(x0), fr(y0)], [bw, bh], angle];
  }

  // cv2.boundingRect(points or image) -> [x, y, w, h]
  function boundingRect(p) {
    if (!np.isImage(p) && isEmptyPts(p, 'boundingRect')) return [0, 0, 0, 0];
    return run(function (t) {
      var r = cv.boundingRect(t(np.isImage(p) ? toMat(p) : ptsMat(p)));
      return [r.x, r.y, r.width, r.height];
    });
  }
  // cv2.contourArea(contour, oriented=False)
  function contourArea(c, oriented) {
    if (isEmptyPts(c, 'contourArea')) return 0;
    return run(function (t) { return cv.contourArea(t(ptsMat(c)), !!oriented); });
  }
  // cv2.convexHull(points, clockwise=False, returnPoints=True) -> same dtype as the input
  // (indices Int32Array when returnPoints is false)
  function convexHull(p, clockwise, returnPoints) {
    if (isEmptyPts(p, 'convexHull')) return null;
    return run(function (t) {
      var src = t(ptsMat(p)), hull = t(new cv.Mat());
      cv.convexHull(src, hull, !!clockwise, returnPoints === undefined ? true : !!returnPoints);
      return returnPoints === false ? hull.data32S.slice() : ptsOf(hull);
    });
  }
  // cv2.pointPolygonTest(contour, (x, y), measureDist)
  function pointPolygonTest(c, p, measureDist) {
    if (isEmptyPts(c, 'pointPolygonTest')) return measureDist ? -Number.MAX_VALUE : -1;
    return run(function (t) { return cv.pointPolygonTest(t(ptsMat(c)), new cv.Point(p[0], p[1]), !!measureDist); });
  }
  // cv2.intersectConvexConvex(p1, p2, handleNested=True) -> [area, Float32Array | null]
  function intersectConvexConvex(p1, p2, handleNested) {
    checkPts(p1, null, 'intersectConvexConvex1'); checkPts(p2, null, 'intersectConvexConvex2');
    if (np.toPts(p1).length < 4 || np.toPts(p2).length < 4) return [0, null]; // n < 2 || m < 2
    return run(function (t) {
      var out = t(new cv.Mat());
      var area = cv.intersectConvexConvex(t(ptsMat(p1)), t(ptsMat(p2)), out, handleNested === undefined ? true : !!handleNested);
      return [area, out.rows ? ptsOf(out) : null];
    });
  }
  // cv2.rotatedRectangleIntersection(r1, r2) -> [flag, Float32Array | null]
  function rotatedRectangleIntersection(r1, r2) {
    return run(function (t) {
      var out = t(new cv.Mat());
      var flag = cv.rotatedRectangleIntersection(rrect(r1), rrect(r2), out);
      return [flag, out.rows ? ptsOf(out) : null];
    });
  }
  // cv2.ellipse2Poly(center, axes, angle, arcStart, arcEnd, delta) -> Int32Array pairs
  function ellipse2Poly(center, axes, angle, arcStart, arcEnd, delta) {
    return run(function (t) {
      var pv = t(new cv.PointVector());
      cv.ellipse2Poly(pt(center), size2(axes), angle, arcStart, arcEnd, delta, pv);
      var n = pv.size(), out = new Int32Array(n * 2);
      for (var i = 0; i < n; i++) { var q = pv.get(i); out[2 * i] = q.x; out[2 * i + 1] = q.y; }
      return out;
    });
  }
  // cv2.HoughLinesP(img, rho, theta, threshold, minLineLength=, maxLineGap=)
  // -> [[x1, y1, x2, y2], ...] or null. OpenCV 5 returns shape (N, 4); 4.x gave (N, 1, 4),
  // which is what homr's create_lines (line[0]) was written for.
  function HoughLinesP(img, rho, theta, threshold, o) {
    return run(function (t) {
      var src = t(toMat(img)), lines = t(new cv.Mat());
      cv.HoughLinesP(src, lines, rho, theta, threshold, opt(o, 'minLineLength', 0), opt(o, 'maxLineGap', 0));
      var n = lines.total();
      if (!n) return null;
      var d = lines.data32S, out = [];
      for (var i = 0; i < n; i++) out.push([d[4 * i], d[4 * i + 1], d[4 * i + 2], d[4 * i + 3]]);
      return out;
    });
  }
  // cv2.findNonZero(img) is not in opencv.js: row-major scan like OpenCV's
  // -> Int32Array of x,y pairs (numpy (N,1,2)) or null when there is none
  function findNonZero(img) {
    if (img.c !== 1) throw new CvError(cvAssertText('core/src/count_non_zero.dispatch.cpp', 156, -215, 'Assertion failed', 'src.channels() == 1 && src.dims == 2', 'findNonZero'));
    var d = img.data, w = img.w, n = 0, i;
    // != 0 like C++ (NaN counts; JS truthiness would drop it)
    for (i = 0; i < d.length; i++) if (d[i] !== 0) n++;
    if (!n) return null;
    var out = new Int32Array(2 * n), k = 0;
    for (i = 0; i < d.length; i++) if (d[i] !== 0) { out[k++] = i % w; out[k++] = (i / w) | 0; }
    return out;
  }

  // ---- morphology and filters ----
  // cv2.getStructuringElement(shape, (kw, kh), anchor=(-1,-1)) -> uint8 image kh x kw
  function getStructuringElement(shape, ksize, anchor) {
    return run(function (t) {
      var a = anchor || [-1, -1];
      return fromMat(t(cv.getStructuringElement(shape, size2(ksize), new cv.Point(a[0], a[1]))));
    });
  }
  function morphArgs(o) {
    var a = opt(o, 'anchor', [-1, -1]);
    return {
      anchor: new cv.Point(a[0], a[1]), iterations: opt(o, 'iterations', 1),
      borderType: opt(o, 'borderType', C2.BORDER_CONSTANT),
      // cv2's default border value = morphologyDefaultBorderValue() (border never wins)
      borderValue: o && o.borderValue !== undefined ? scalar(o.borderValue) : cv.morphologyDefaultBorderValue()
    };
  }
  // cv2.dilate(img, kernel, iterations=1, ...) / cv2.erode
  function dilate(img, kernel, o) {
    return run(function (t) {
      var src = t(toMat(img)), dst = t(new cv.Mat()), k = t(kernelMat(kernel)), a = morphArgs(o);
      cv.dilate(src, dst, k, a.anchor, a.iterations, a.borderType, a.borderValue);
      return fromMat(dst);
    });
  }
  function erode(img, kernel, o) {
    return run(function (t) {
      var src = t(toMat(img)), dst = t(new cv.Mat()), k = t(kernelMat(kernel)), a = morphArgs(o);
      cv.erode(src, dst, k, a.anchor, a.iterations, a.borderType, a.borderValue);
      return fromMat(dst);
    });
  }
  // cv2.morphologyEx(img, op, kernel, ...)
  function morphologyEx(img, op, kernel, o) {
    return run(function (t) {
      var src = t(toMat(img)), dst = t(new cv.Mat()), k = t(kernelMat(kernel)), a = morphArgs(o);
      cv.morphologyEx(src, dst, op, k, a.anchor, a.iterations, a.borderType, a.borderValue);
      return fromMat(dst);
    });
  }
  // cv2.blur(img, (kw, kh), anchor=(-1,-1), borderType=BORDER_DEFAULT)
  function blur(img, ksize, o) {
    return run(function (t) {
      var src = t(toMat(img)), dst = t(new cv.Mat()), a = opt(o, 'anchor', [-1, -1]);
      cv.blur(src, dst, size2(ksize), new cv.Point(a[0], a[1]), opt(o, 'borderType', C2.BORDER_DEFAULT));
      return fromMat(dst);
    });
  }
  // cv2.GaussianBlur(img, (kw, kh), sigmaX, sigmaY=0, borderType=BORDER_DEFAULT)
  function GaussianBlur(img, ksize, sigmaX, o) {
    return run(function (t) {
      var src = t(toMat(img)), dst = t(new cv.Mat());
      cv.GaussianBlur(src, dst, size2(ksize), sigmaX, opt(o, 'sigmaY', 0), opt(o, 'borderType', C2.BORDER_DEFAULT));
      return fromMat(dst);
    });
  }
  // cv2.filter2D(img, ddepth, kernel, anchor=(-1,-1), delta=0, borderType=BORDER_DEFAULT)
  // the kernel may be a float image or a nested array (cv2 converts it to float)
  function filter2D(img, ddepth, kernel, o) {
    return run(function (t) {
      var k = kernel;
      if (!np.isImage(k)) {
        var rows = k.length, cols = k[0].length, kd = new Float64Array(rows * cols);
        for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) kd[y * cols + x] = k[y][x];
        k = { h: rows, w: cols, c: 1, data: kd };
      }
      var src = t(toMat(img)), dst = t(new cv.Mat()), km = t(toMat(k)), a = opt(o, 'anchor', [-1, -1]);
      cv.filter2D(src, dst, ddepth, km, new cv.Point(a[0], a[1]), opt(o, 'delta', 0), opt(o, 'borderType', C2.BORDER_DEFAULT));
      return fromMat(dst);
    });
  }

  // ---- geometric transforms ----
  // cv2.resize(img, (w, h), fx=0, fy=0, interpolation=INTER_LINEAR); dsize null / [0,0] uses fx, fy
  function resize(img, dsize, o) {
    return run(function (t) {
      var src = t(toMat(img)), dst = t(new cv.Mat()), ds = dsize || [0, 0];
      cv.resize(src, dst, size2(ds), opt(o, 'fx', 0), opt(o, 'fy', 0), opt(o, 'interpolation', C2.INTER_LINEAR));
      return fromMat(dst);
    });
  }
  // a 2x3 matrix as nested arrays <-> CV_64F Mat
  function m23(M) {
    var m = new cv.Mat(2, 3, cv.CV_64F);
    m.data64F.set([M[0][0], M[0][1], M[0][2], M[1][0], M[1][1], M[1][2]]);
    return m;
  }
  function un23(m) {
    var d = m.depth() === 6 ? m.data64F : m.data32F;
    return [[d[0], d[1], d[2]], [d[3], d[4], d[5]]];
  }
  // ---- float32 helpers for the SIMD kernels cv2 runs on x86 (AVX2 dispatch: real FMA) ----
  var F32B = new Float32Array(1), U32B = new Uint32Array(F32B.buffer);
  function nextUpF(f) {
    F32B[0] = f;
    if (f === 0) { U32B[0] = 1; return F32B[0]; }
    if (f > 0) U32B[0]++; else U32B[0]--;
    return F32B[0];
  }
  // correctly rounded float32 fma(a, b, c) for float32 a, b, c: a*b is exact in double, the
  // sum is rounded once to double and once to float, which only differs from a single
  // rounding at an exact float tie; the exact remainder decides those
  function fmaF(a, b, c) {
    var p = a * b, s = p + c, bb = s - p, err = (p - (s - bb)) + (c - bb), r = fr(s);
    if (err === 0 || r === s) return r;
    var other = r < s ? nextUpF(r) : -nextUpF(-r);
    if ((r + other) / 2 !== s) return r;
    return err > 0 ? Math.max(r, other) : Math.min(r, other);
  }
  // cvRound: round half to even, then saturate to uint8
  function rintSat8(v) {
    var r = Math.round(v);
    if (r - v === 0.5 && r % 2 !== 0) r -= 1;
    return r < 0 ? 0 : r > 255 ? 255 : r;
  }

  // cv2.warpAffine(img, M, (w, h), flags=INTER_LINEAR, borderMode=BORDER_CONSTANT, borderValue=0)
  // 8-bit INTER_LINEAR + BORDER_CONSTANT (staff dewarping) runs the JS port below; the rest
  // goes to opencv.js
  function warpAffine(img, M, dsize, o) {
    var flags = opt(o, 'flags', C2.INTER_LINEAR), border = opt(o, 'borderMode', C2.BORDER_CONSTANT);
    // dst.create(dsize.empty() ? src.size() : dsize): Size::empty() is width <= 0 || height <= 0,
    // so a zero or negative width or height means the source size
    if (!dsize || !(dsize[0] > 0) || !(dsize[1] > 0)) dsize = [img.w, img.h];
    if (img.data instanceof Uint8Array && (flags & 7) === C2.INTER_LINEAR && border === C2.BORDER_CONSTANT && img.c <= 4) {
      return warpAffineLinear8u(img, M, dsize, flags, scalar(opt(o, 'borderValue', 0)));
    }
    return run(function (t) {
      var src = t(toMat(img)), dst = t(new cv.Mat()), mm = t(m23(M));
      cv.warpAffine(src, dst, mm, size2(dsize), flags, border, scalar(opt(o, 'borderValue', 0)));
      return fromMat(dst);
    });
  }
  // OpenCV 5.0.0 warpAffine (imgproc/src/imgwarp.cpp) -> warpAffineLinearInvoker_8UC1/3/4
  // (warp_kernels.simd.hpp), as dispatched on x86 with AVX2: the source position and the
  // bilinear blend are float32 FMAs over chunks of 16 output pixels (row constant
  // y*M1 + M2 rounded twice); the remaining pixels of a row take the scalar code
  // `sx = x*M[0] + y*M[1] + M[2]`, `v0 = p00 + sx*(p01 - p00)`, `v0 += sy*(v1 - v0)`, which GCC
  // contracts (C++ default -ffp-contract=fast, -mfma in that unit) to fma(x, M0, y*M1) + M2 and
  // FMA blends; y*M1 is shared with the row constant, so that one stays a plain product.
  // Checked on 1900 random warps and constructed rounding cases against cv2.
  // opencv.js runs other code paths whose float rounding differs in rare pixels.
  var WARP_INVERSE_MAP = 16, WARP_UF = 16;
  function warpAffineLinear8u(img, M, dsize, flags, bvalue) {
    var Md = [M[0][0], M[0][1], M[0][2], M[1][0], M[1][1], M[1][2]];
    if (!(flags & WARP_INVERSE_MAP)) {
      var D = Md[0] * Md[4] - Md[1] * Md[3];
      D = D !== 0 ? 1. / D : 0;
      var A11 = Md[4] * D, A22 = Md[0] * D;
      Md[0] = A11; Md[1] *= -D;
      Md[3] *= -D; Md[4] = A22;
      var b1 = -Md[0] * Md[2] - Md[1] * Md[5], b2 = -Md[3] * Md[2] - Md[4] * Md[5];
      Md[2] = b1; Md[5] = b2;
    }
    var M0 = fr(Md[0]), M1 = fr(Md[1]), M2 = fr(Md[2]), M3 = fr(Md[3]), M4 = fr(Md[4]), M5 = fr(Md[5]);
    var cn = img.c, sc = img.w, sr = img.h, src = img.data, w = dsize[0], h = dsize[1];
    var out = new Uint8Array(w * h * cn), bval = [], k;
    for (k = 0; k < 4; k++) bval.push(rintSat8(bvalue[k]));
    var vecEnd = w - w % WARP_UF, p = [0, 0, 0, 0];
    function tap(ix, iy, ch) { return (ix >>> 0) < sc && (iy >>> 0) < sr ? src[(iy * sc + ix) * cn + ch] : bval[ch]; }
    for (var y = 0; y < h; y++) {
      var Mx = fr(fr(y * M1) + M2), My = fr(fr(y * M4) + M5);
      for (var x = 0; x < w; x++) {
        var o0 = (y * w + x) * cn, vec = x < vecEnd, sx, sy;
        if (vec) { sx = fmaF(M0, x, Mx); sy = fmaF(M3, x, My); }
        else { sx = fr(fmaF(x, M0, fr(y * M1)) + M2); sy = fr(fmaF(x, M3, fr(y * M4)) + M5); }
        var ix = Math.floor(sx), iy = Math.floor(sy), fx = fr(sx - ix), fy = fr(sy - iy);
        if ((ix + 1 >>> 0) >= sc + 1 || (iy + 1 >>> 0) >= sr + 1) {
          for (k = 0; k < cn; k++) out[o0 + k] = bval[k]; // the whole 2x2 block is outside
          continue;
        }
        for (k = 0; k < cn; k++) {
          var p00 = tap(ix, iy, k), p01 = tap(ix + 1, iy, k), p10 = tap(ix, iy + 1, k), p11 = tap(ix + 1, iy + 1, k);
          // the same fused blend in the vector and the (contracted) scalar code
          var v0 = fmaF(fx, p01 - p00, p00), v1 = fmaF(fx, p11 - p10, p10);
          out[o0 + k] = rintSat8(fmaF(fy, fr(v1 - v0), v0));
        }
      }
    }
    return { h: h, w: w, c: cn, data: out };
  }
  // cv2.remap(img, map1, map2, interpolation, borderMode=BORDER_CONSTANT, borderValue=0)
  function remap(img, map1, map2, interpolation, o) {
    return run(function (t) {
      var src = t(toMat(img)), dst = t(new cv.Mat()), a = t(toMat(map1)), b = map2 ? t(toMat(map2)) : t(new cv.Mat());
      cv.remap(src, dst, a, b, interpolation, opt(o, 'borderMode', C2.BORDER_CONSTANT), scalar(opt(o, 'borderValue', 0)));
      return fromMat(dst);
    });
  }
  // cv2.getAffineTransform(src3, dst3) -> [[a, b, c], [d, e, f]] (float64)
  function getAffineTransform(src, dst) {
    // cv2 asserts src.checkVector(2, CV_32F) == 3: a typed array must be float32 (an int32 or
    // float64 numpy array raises); nested arrays are taken as float32
    return run(function (t) { return un23(t(cv.getAffineTransform(t(ptsMat(src, 'float32', 'getAffineTransform')), t(ptsMat(dst, 'float32', 'getAffineTransform'))))); });
  }
  // cv2.invertAffineTransform(M) -> 2x3
  function invertAffineTransform(M) {
    return run(function (t) {
      var out = t(new cv.Mat());
      cv.invertAffineTransform(t(m23(M)), out);
      return un23(out);
    });
  }

  // ---- colour, thresholds, arithmetic ----
  function cvtColor(img, code, dstCn) {
    return run(function (t) {
      var src = t(toMat(img)), dst = t(new cv.Mat());
      cv.cvtColor(src, dst, code, dstCn || 0);
      return fromMat(dst);
    });
  }
  // cv2.threshold(img, thresh, maxval, type) -> [retval, img]
  function threshold(img, thresh, maxval, type) {
    return run(function (t) {
      var src = t(toMat(img)), dst = t(new cv.Mat());
      var r = cv.threshold(src, dst, thresh, maxval, type);
      return [r, fromMat(dst)];
    });
  }
  // cv2.adaptiveThreshold(img, maxValue, adaptiveMethod, thresholdType, blockSize, C)
  function adaptiveThreshold(img, maxValue, method, type, blockSize, Cc) {
    return run(function (t) {
      var src = t(toMat(img)), dst = t(new cv.Mat());
      cv.adaptiveThreshold(src, dst, maxValue, method, type, blockSize, Cc);
      return fromMat(dst);
    });
  }
  // cv2.addWeighted(a, alpha, b, beta, gamma, dtype=-1). Two uint8 images run OpenCV 5's
  // addWeighted8u (core/src/arithm.simd.hpp) as dispatched with AVX2: per value
  // fma(a, alpha, fma(b, beta, gamma)) in float32, rounded half to even (the vector loop
  // covers a tail by re-running the last 16 values); fewer than 16 values take the scalar
  // a*alpha + b*beta + gamma, which GCC compiles (C++ default -ffp-contract=fast, FMA in that
  // translation unit) as fma(a, alpha, b*beta) + gamma. Other types go to opencv.js.
  function addWeighted(a, alpha, b, beta, gamma, o) {
    var dtype = opt(o, 'dtype', -1);
    // cv2: "Sizes of input arguments do not match" unless both have the same size and channels
    if (np.isImage(a) && np.isImage(b) && (a.h !== b.h || a.w !== b.w || a.c !== b.c)) {
      throw new CvError(cvAssertText('core/src/arithm.cpp', 688, -209, 'Sizes of input arguments do not match',
        "The operation is neither 'array op array' (where arrays have the same size and the same number of channels), nor 'array op scalar', nor 'scalar op array'", 'arithm_op'));
    }
    if (a.data instanceof Uint8Array && b.data instanceof Uint8Array && (dtype === -1 || dtype === 0)) {
      var w1 = fr(alpha), w2 = fr(beta), dl = fr(gamma), n = a.data.length, out = new Uint8Array(n), i;
      for (i = 0; i < n; i++) {
        var f1 = a.data[i], f2 = b.data[i];
        out[i] = rintSat8(n >= 16 ? fmaF(f1, w1, fmaF(f2, w2, dl)) : fr(fmaF(f1, w1, fr(f2 * w2)) + dl));
      }
      return { h: a.h, w: a.w, c: a.c, data: out };
    }
    return run(function (t) {
      var ma = t(toMat(a)), mb = t(toMat(b)), dst = t(new cv.Mat());
      cv.addWeighted(ma, alpha, mb, beta, gamma, dst, dtype);
      return fromMat(dst);
    });
  }
  // cv2.subtract(a, b, mask=None, dtype=-1): saturating
  function subtract(a, b, o) {
    return run(function (t) {
      var ma = t(toMat(a)), mb = t(toMat(b)), dst = t(new cv.Mat());
      var mask = o && o.mask ? t(toMat(o.mask)) : t(new cv.Mat());
      cv.subtract(ma, mb, dst, mask, opt(o, 'dtype', -1));
      return fromMat(dst);
    });
  }
  // cv2.bitwise_and(a, b, mask=None): zeros where the mask is 0 (a fresh dst is cleared)
  function bitwise_and(a, b, o) {
    return run(function (t) {
      var ma = t(toMat(a)), mb = t(toMat(b)), dst = t(new cv.Mat());
      var mask = o && o.mask ? t(toMat(o.mask)) : t(new cv.Mat());
      cv.bitwise_and(ma, mb, dst, mask);
      return fromMat(dst);
    });
  }
  // cv2.calcHist([img], [ch], mask, [bins], [lo, hi]) -> Float32Array(bins): OpenCV 5
  // returns a 1-D histogram, shape (bins,) (4.x gave (bins, 1)); homr flattens it anyway
  function calcHist(images, channels, mask, histSize, ranges, accumulate) {
    return run(function (t) {
      var mv = t(new cv.MatVector());
      for (var i = 0; i < images.length; i++) { var m = t(toMat(images[i])); mv.push_back(m); }
      var hist = t(new cv.Mat()), mk = mask ? t(toMat(mask)) : t(new cv.Mat());
      cv.calcHist(mv, channels, mk, hist, histSize, ranges, !!accumulate);
      return hist.data32F.slice();
    });
  }
  // cv2.createCLAHE(clipLimit=40.0, tileGridSize=(8, 8)) -> {apply(img)}; also takes
  // ({clipLimit, tileGridSize}). Each apply makes and deletes its own cv.CLAHE.
  function createCLAHE(clipLimit, tileGridSize) {
    if (clipLimit && typeof clipLimit === 'object') { tileGridSize = clipLimit.tileGridSize; clipLimit = clipLimit.clipLimit; }
    var st = { clipLimit: clipLimit === undefined ? 40.0 : clipLimit, tileGridSize: tileGridSize || [8, 8] };
    return {
      apply: function (img) {
        return run(function (t) {
          var c = t(new cv.CLAHE(st.clipLimit, size2(st.tileGridSize)));
          var src = t(toMat(img)), dst = t(new cv.Mat());
          c.apply(src, dst);
          return fromMat(dst);
        });
      },
      setClipLimit: function (v) { st.clipLimit = v; },
      getClipLimit: function () { return st.clipLimit; },
      setTilesGridSize: function (s) { st.tileGridSize = s; },
      getTilesGridSize: function () { return st.tileGridSize; }
    };
  }

  // ---- drawing (in place) ----
  function polysVec(t, pts, fn) {
    var mv = t(new cv.MatVector());
    for (var i = 0; i < pts.length; i++) { var m = t(ptsMat(pts[i], 'int32', fn)); mv.push_back(m); }
    return mv;
  }
  // cv2.fillPoly(img, [pts, ...], color, lineType=LINE_8, shift=0, offset=(0,0))
  function fillPoly(img, pts, color, o) {
    return run(function (t) {
      var m = t(toMat(img)), off = opt(o, 'offset', [0, 0]);
      cv.fillPoly(m, polysVec(t, pts, 'fillPoly'), scalar(color), opt(o, 'lineType', C2.LINE_8), opt(o, 'shift', 0), new cv.Point(off[0], off[1]));
      return writeBack(img, m);
    });
  }
  // cv2.fillConvexPoly(img, pts, color, lineType=LINE_8, shift=0)
  function fillConvexPoly(img, p, color, o) {
    return run(function (t) {
      var m = t(toMat(img));
      cv.fillConvexPoly(m, t(ptsMat(p, 'int32', 'fillConvexPoly')), scalar(color), opt(o, 'lineType', C2.LINE_8), opt(o, 'shift', 0));
      return writeBack(img, m);
    });
  }
  // cv2.drawContours(img, contours, contourIdx, color, thickness=1, lineType=LINE_8, ...)
  function drawContours(img, contours, idx, color, thickness, o) {
    return run(function (t) {
      var m = t(toMat(img)), off = opt(o, 'offset', [0, 0]);
      var hier = o && o.hierarchy ? t(ptsMatHier(o.hierarchy)) : t(new cv.Mat());
      cv.drawContours(m, polysVec(t, contours, 'drawContours'), idx, scalar(color), thickness === undefined ? 1 : thickness,
        opt(o, 'lineType', C2.LINE_8), hier, opt(o, 'maxLevel', 2147483647), new cv.Point(off[0], off[1]));
      return writeBack(img, m);
    });
  }
  function ptsMatHier(h) { var m = new cv.Mat(1, h.length >> 2, cv.CV_32SC4); m.data32S.set(h); return m; }
  // cv2.line(img, p1, p2, color, thickness=1, lineType=LINE_8, shift=0)
  function line(img, p1, p2, color, thickness, lineType, shift) {
    return run(function (t) {
      var m = t(toMat(img));
      cv.line(m, pt(p1), pt(p2), scalar(color), thickness === undefined ? 1 : thickness, lineType || C2.LINE_8, shift || 0);
      return writeBack(img, m);
    });
  }
  // cv2.circle(img, center, radius, color, thickness=1, lineType=LINE_8, shift=0)
  function circle(img, center, radius, color, thickness, lineType, shift) {
    return run(function (t) {
      var m = t(toMat(img));
      cv.circle(m, pt(center), radius, scalar(color), thickness === undefined ? 1 : thickness, lineType || C2.LINE_8, shift || 0);
      return writeBack(img, m);
    });
  }
  // cv2.rectangle(img, p1, p2, color, thickness=1, lineType=LINE_8, shift=0)
  function rectangle(img, p1, p2, color, thickness, lineType, shift) {
    return run(function (t) {
      var m = t(toMat(img));
      cv.rectangle(m, pt(p1), pt(p2), scalar(color), thickness === undefined ? 1 : thickness, lineType || C2.LINE_8, shift || 0);
      return writeBack(img, m);
    });
  }
  // cv2.ellipse(img, box, color, thickness=1, lineType=LINE_8)  (RotatedRect overload) or
  // cv2.ellipse(img, center, axes, angle, startAngle, endAngle, color, thickness=1, lineType, shift)
  function ellipse(img, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
    var isBox = Array.isArray(a1) && Array.isArray(a1[0]);
    return run(function (t) {
      var m = t(toMat(img));
      if (isBox) cv.ellipse1(m, rrect(a1), scalar(a2), a3 === undefined ? 1 : a3, a4 || C2.LINE_8);
      else cv.ellipse(m, pt(a1), size2(a2), a3, a4, a5, scalar(a6), a7 === undefined ? 1 : a7, a8 || C2.LINE_8, a9 || 0);
      return writeBack(img, m);
    });
  }
  // cv2.putText(img, text, org, fontFace, fontScale, color, thickness=1, lineType=LINE_8)
  function putText(img, text, org, fontFace, fontScale, color, thickness, lineType, bottomLeftOrigin) {
    return run(function (t) {
      var m = t(toMat(img));
      cv.putText(m, String(text), pt(org), fontFace, fontScale, scalar(color), thickness === undefined ? 1 : thickness, lineType || C2.LINE_8, !!bottomLeftOrigin);
      return writeBack(img, m);
    });
  }

  // ---- constants (cv2 5.0.0 values; setCv re-reads them from opencv.js) ----
  var CONST = {
    RETR_EXTERNAL: 0, RETR_LIST: 1, RETR_CCOMP: 2, RETR_TREE: 3,
    CHAIN_APPROX_NONE: 1, CHAIN_APPROX_SIMPLE: 2,
    MORPH_RECT: 0, MORPH_CROSS: 1, MORPH_ELLIPSE: 2,
    MORPH_ERODE: 0, MORPH_DILATE: 1, MORPH_OPEN: 2, MORPH_CLOSE: 3, MORPH_GRADIENT: 4, MORPH_TOPHAT: 5, MORPH_BLACKHAT: 6,
    THRESH_BINARY: 0, THRESH_BINARY_INV: 1, THRESH_TRUNC: 2, THRESH_TOZERO: 3, THRESH_TOZERO_INV: 4, THRESH_OTSU: 8,
    ADAPTIVE_THRESH_MEAN_C: 0, ADAPTIVE_THRESH_GAUSSIAN_C: 1,
    INTER_NEAREST: 0, INTER_LINEAR: 1, INTER_CUBIC: 2, INTER_AREA: 3, INTER_LANCZOS4: 4,
    BORDER_CONSTANT: 0, BORDER_REPLICATE: 1, BORDER_REFLECT: 2, BORDER_REFLECT_101: 4, BORDER_DEFAULT: 4,
    COLOR_BGR2GRAY: 6, COLOR_RGB2GRAY: 7, COLOR_GRAY2BGR: 8, COLOR_GRAY2RGB: 8, COLOR_BGR2RGB: 4, COLOR_RGB2BGR: 4,
    COLOR_RGBA2BGR: 3, COLOR_RGBA2RGB: 1, COLOR_BGRA2BGR: 1, COLOR_RGBA2GRAY: 11, COLOR_BGRA2GRAY: 10,
    INTERSECT_NONE: 0, INTERSECT_PARTIAL: 1, INTERSECT_FULL: 2,
    FILLED: -1, LINE_4: 4, LINE_8: 8, LINE_AA: 16,
    FONT_HERSHEY_SIMPLEX: 0, FONT_HERSHEY_PLAIN: 1,
    CV_8U: 0, CV_8S: 1, CV_16U: 2, CV_16S: 3, CV_32S: 4, CV_32F: 5, CV_64F: 6
  };
  var C2 = {};
  for (var k in CONST) C2[k] = CONST[k];

  var fns = {
    error: CvError,
    findContours: findContours, minAreaRect: minAreaRect, fitEllipse: fitEllipse, boxPoints: boxPoints,
    setRNGSeed: setRNGSeed, resetRNG: resetRNG,
    boundingRect: boundingRect, contourArea: contourArea, convexHull: convexHull, pointPolygonTest: pointPolygonTest,
    intersectConvexConvex: intersectConvexConvex, rotatedRectangleIntersection: rotatedRectangleIntersection,
    ellipse2Poly: ellipse2Poly, HoughLinesP: HoughLinesP, findNonZero: findNonZero,
    getStructuringElement: getStructuringElement, dilate: dilate, erode: erode, morphologyEx: morphologyEx,
    blur: blur, GaussianBlur: GaussianBlur, filter2D: filter2D,
    resize: resize, warpAffine: warpAffine, remap: remap, getAffineTransform: getAffineTransform,
    invertAffineTransform: invertAffineTransform,
    cvtColor: cvtColor, threshold: threshold, adaptiveThreshold: adaptiveThreshold, addWeighted: addWeighted,
    subtract: subtract, bitwise_and: bitwise_and, calcHist: calcHist, createCLAHE: createCLAHE,
    fillPoly: fillPoly, fillConvexPoly: fillConvexPoly, drawContours: drawContours, line: line, circle: circle,
    rectangle: rectangle, ellipse: ellipse, putText: putText
  };
  for (var f in fns) C2[f] = fns[f];
  // internals for tests / other wrappers
  C2._toMat = function (img) { need(); return toMat(img); };
  C2._fromMat = fromMat;
  C2._ptsMat = function (p, dt) { need(); return ptsMat(p, dt); };
  C2._fitEllipseCv = fitEllipseCv;
  // theRNG state as [lo, hi] uint32 halves (tests; a worker may save / restore it)
  C2._rngState = function (st) { if (st) { theRNG.lo = st[0]; theRNG.hi = st[1]; } return [theRNG.lo, theRNG.hi]; };
  C2._linalg = { jacobiSVD: jacobiSVD, svdDecomp: svdDecomp, solveSVD: solveSVD, eigenNonSymmetric: eigenNonSymmetric, hypot: hypot };
  OMR.cv2 = C2;
})(typeof self !== 'undefined' ? self : globalThis);
