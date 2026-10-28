// OMR engine: OpenCV wrapper parity (js/omr/cv.js against cv2 5.0.0).
// Replays tools/omr/dump_cv.py's cases (FIXTURES/<page>/20-cv.json): the same spec of inputs,
// the same cv2 calls, results compared exactly (contours + order + hierarchy, rect / ellipse
// floats, polygon tests, Hough lines, every output image byte for byte via sha1).
// Also checks that no cv.Mat / MatVector / PointVector / CLAHE outlives a wrapper call.
const crypto = require('crypto');
const zlib = require('zlib');
const H = require('./omr/harness');
const OMR = H.load('cv.js');
const np = OMR.np;

const BIG = 256;
function sha1(ta) { return crypto.createHash('sha1').update(Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength)).digest('hex'); }
function num(x) { return x !== x ? 'nan' : x === Infinity ? 'inf' : x === -Infinity ? '-inf' : x; }
function ND(data, shape) { return { __nd: shape, data: data }; }

// ---- the spec language of dump_cv.py ----
function makeEval(page, R) {
  const pngCache = {};
  function ev(s) {
    if (Array.isArray(s)) return s.map(ev);
    if (s === null || typeof s !== 'object') return s;
    if ('$' in s) { if (!(s.$ in R)) throw new Error('no result ' + s.$); return R[s.$]; }
    if ('png' in s) {
      const mode = s.mode || 'color', key = s.png + ':' + mode;
      if (!pngCache[key]) {
        let im = mode === 'color' ? H.readPng(H.fix(page, s.png)) : H.readPng(H.fix(page, s.png), { gray: true });
        if (mode === 'mask01') im = np.gt(im, 0);
        pngCache[key] = im;
      }
      return np.clone(pngCache[key]);
    }
    if ('img' in s) {
      const [h, w, c] = s.img, buf = zlib.inflateSync(Buffer.from(s.z, 'base64'));
      const C = np.ctorOf(s.dtype), data = new C(buf.byteLength / C.BYTES_PER_ELEMENT);
      new Uint8Array(data.buffer).set(buf);
      return np.image(h, w, c, data);
    }
    if ('zeros' in s) return np.zeros(s.zeros, s.dtype || 'uint8');
    if ('full' in s) return np.full(s.full, s.v, s.dtype || 'uint8');
    if ('ones' in s) return np.ones(s.ones, s.dtype || 'uint8');
    if ('arr' in s) {
      const dt = s.dtype === 'int64' ? (s.as === 'img' ? 'float64' : 'int32') : s.dtype;
      if (s.as === 'img') {
        const h = s.arr.length, w = s.arr[0].length, c = Array.isArray(s.arr[0][0]) ? s.arr[0][0].length : 1;
        return np.image(h, w, c, np.ctorOf(dt).from(s.arr.flat(2)));
      }
      if (s.as === 'nested') return s.arr;
      return np.toPts(s.arr, dt);
    }
    if ('shift' in s) {
      const a = ev(s.shift), out = new a.constructor(a.length);
      for (let i = 0; i < a.length; i += 2) { out[i] = a[i] - s.by[0]; out[i + 1] = a[i + 1] - s.by[1]; }
      return out;
    }
    if ('slice' in s) return np.crop(ev(s.slice), s.y[0], s.y[1], s.x[0], s.x[1]);
    if ('item' in s) return ev(s.item)[s.i];
    if ('mul' in s) return np.map(ev(s.mul), (v) => v * s.k);
    if ('rsub' in s) return np.map(ev(s.rsub), (v) => s.k - v);
    if ('list' in s) return s.list.map(ev);
    throw new Error('spec ' + JSON.stringify(s).slice(0, 80));
  }
  return ev;
}

const cv2 = OMR.cv2;
// the extra ops dump_cv.py defines on top of cv2
const OPS = {
  load: (a) => a,
  clahe: (img, clip, grid) => cv2.createCLAHE({ clipLimit: clip, tileGridSize: grid }).apply(img),
  largest: (res) => {
    let best = null, area = 0;
    for (const c of res[0]) { const a = cv2.contourArea(c); if (a > area) { area = a; best = c; } }
    return best;
  },
  homr_ellipse2Poly: (box) => {
    if (box[1][0] !== box[1][0] || box[1][1] !== box[1][1]) return null;
    return cv2.ellipse2Poly([Math.trunc(box[0][0]), Math.trunc(box[0][1])], [Math.trunc(box[1][0] / 2), Math.trunc(box[1][1] / 2)], Math.trunc(box[2]), 0, 360, 1);
  },
  boxPoints_int64: (r) => Int32Array.from(cv2.boxPoints(r).flat(), Math.trunc),
  polys_overlap: (p1, p2) => {
    const f1 = Float32Array.from(p1), f2 = Float32Array.from(p2);
    const r = cv2.intersectConvexConvex(f1, f2);
    const t1 = [], t2 = [];
    for (let i = 0; i < p1.length; i += 2) t1.push(cv2.pointPolygonTest(p2, [p1[i], p1[i + 1]], false));
    for (let i = 0; i < p2.length; i += 2) t2.push(cv2.pointPolygonTest(p1, [p2[i], p2[i + 1]], false));
    return [r[0], r[1], t1, t2];
  }
};
function call(op, args, kw) {
  const fn = OPS[op] || cv2[op];
  if (!fn) throw new Error('no op ' + op);
  return Object.keys(kw || {}).length ? fn.apply(null, args.concat([kw])) : fn.apply(null, args);
}
// JS results -> the numpy shapes dump_cv.py encoded
function norm(op, r) {
  if (r === null || r === undefined) return null;
  switch (op) {
    case 'boxPoints': return ND(Float32Array.from(r.flat()), [4, 2]);
    case 'boxPoints_int64': return ND(r, [4, 2]);
    case 'getAffineTransform': case 'invertAffineTransform': return ND(Float64Array.from(r.flat()), [2, 3]);
    case 'HoughLinesP': return ND(Int32Array.from(r.flat()), [r.length, 4]);
    case 'calcHist': return ND(r, [r.length]);
    default: return r;
  }
}
function encode(x) {
  if (x === null || x === undefined) return null;
  let data = null, shape;
  if (x.__nd) { data = x.data; shape = x.__nd; }
  else if (np.isImage(x)) { data = x.data; shape = np.shape(x); }
  else if (ArrayBuffer.isView(x)) data = x;
  if (data) {
    const d = { dtype: np.dtypeOf(data), n: data.length };
    if (shape) d.shape = shape;
    if (data.length > BIG) {
      d.sha1 = sha1(data);
      let s = 0; for (let i = 0; i < data.length; i++) s += data[i];
      d.sum = num(s);
    } else d.v = Array.from(data, num);
    return d;
  }
  if (Array.isArray(x)) return x.map(encode);
  if (typeof x === 'boolean') return x;
  if (typeof x === 'number') return num(x);
  throw new Error('encode ' + typeof x);
}
function encContours(res) {
  const [cs, hier] = res;
  return { n: cs.length, lens: cs.map((c) => c.length / 2), sha1: sha1(np.concat(cs.length ? cs : [new Int32Array(0)])),
    hier: hier ? sha1(hier) : null, first: cs.slice(0, 3).map((c) => Array.from(c)) };
}
// expected (numpy encoding) vs actual; returns '' when equal, else a short reason
function diff(e, a, p) {
  p = p || '';
  if (e === null || a === null) return e === a ? '' : p + ': ' + JSON.stringify(e) + ' vs ' + JSON.stringify(a);
  if (typeof e !== 'object') return e === a ? '' : p + ': ' + e + ' vs ' + a;
  if (Array.isArray(e)) {
    if (!Array.isArray(a) || a.length !== e.length) return p + ': length ' + e.length + ' vs ' + (a && a.length);
    for (let i = 0; i < e.length; i++) { const r = diff(e[i], a[i], p + '[' + i + ']'); if (r) return r; }
    return '';
  }
  if (e.dtype !== undefined) {
    if (!a || a.dtype === undefined) return p + ': array vs ' + JSON.stringify(a).slice(0, 60);
    const dt = e.dtype === 'int64' ? 'int32' : e.dtype;
    if (dt !== a.dtype) return p + ': dtype ' + e.dtype + ' vs ' + a.dtype;
    if (e.n !== a.n) return p + ': size ' + e.n + ' vs ' + a.n;
    if (e.shape && a.shape && e.shape.join() !== a.shape.join()) return p + ': shape ' + e.shape + ' vs ' + a.shape;
    if (e.sha1) return e.sha1 === a.sha1 ? '' : p + ': bytes differ (sum ' + e.sum + ' vs ' + a.sum + ')';
    return diff(e.v, a.v, p + '.v');
  }
  for (const k of Object.keys(e)) { const r = diff(e[k], a[k], p + '.' + k); if (r) return r; }
  return '';
}

// ---- leak tracking: count every opencv.js object made and deleted ----
function trackLeaks(cv) {
  const st = { made: 0, gone: 0 };
  for (const name of ['Mat', 'MatVector', 'PointVector', 'CLAHE']) {
    const Real = cv[name];
    const del = Real.prototype.delete;
    Real.prototype.delete = function () { st.gone++; return del.call(this); };
    cv[name] = new Proxy(Real, { construct(T, args) { st.made++; return new T(...args); } });
  }
  // Mats made inside opencv.js and handed back
  for (const f of ['getStructuringElement', 'getAffineTransform']) {
    const g = cv[f];
    const w = function () { st.made++; return g.apply(this, arguments); };
    if (g.overloadTable) w.overloadTable = g.overloadTable; // embind dispatches through cv[f].overloadTable
    cv[f] = w;
  }
  const probe = new cv.MatVector(), MV = Object.getPrototypeOf(probe);
  probe.delete();
  const get = MV.get;
  MV.get = function (i) { st.made++; return get.call(this, i); };
  return st;
}

(async () => {
  const cv = await H.cv();
  const leaks = trackLeaks(cv);
  const pages = H.pages().filter((p) => H.has(p, '20-cv.json'));
  if (!pages.length) { H.skip('cv parity: no 20-cv.json fixtures (run tools/omr/dump_cv.py)'); H.done(); return; }
  let consts = null;
  const simd = []; // cases where cv2's SIMD kernel rounds differently from its plain C++ one
  const leakOps = [];
  const known = []; // INTER_CUBIC: documented tolerance instead of bit equality
  for (const page of pages) {
    const doc = H.readJson(H.fix(page, '20-cv.json'));
    if (!consts) {
      consts = doc.consts;
      const bad = Object.keys(consts).filter((k) => cv2[k] !== consts[k]);
      H.ok(!bad.length, 'cv2 constants match cv2 ' + doc.cv2 + (bad.length ? ': ' + bad.join(', ') : ''));
    }
    const R = {}, ev = makeEval(page, R), stats = {};
    if (doc.rng_seed !== undefined) cv2.setRNGSeed(doc.rng_seed); // cv::theRNG() as the dump had it
    const t0 = Date.now();
    for (const c of doc.cases) {
      const st = stats[c.op] = stats[c.op] || { n: 0, bad: 0, why: [] };
      const live0 = leaks.made - leaks.gone;
      let reason = '';
      try {
        if (c.each) {
          let items = R[c.each];
          if (c.contours) items = items[0];
          const extra = ev(c.extra);
          const res = items.map((it) => (it === null || (c.min_len && it.length / 2 < c.min_len)) ? null : call(c.op, [it].concat(extra), {}));
          R[c.id] = res;
          const enc = res.map((r) => encode(norm(c.op, r)));
          let nbad = 0, first = '';
          if (enc.length !== c.out.length) { nbad = 1; first = 'count ' + c.out.length + ' vs ' + enc.length; }
          else for (let i = 0; i < enc.length; i++) { const r = diff(c.out[i], enc[i], '[' + i + ']'); if (r) { nbad++; if (!first) first = r; } }
          st.n += c.out.length; st.bad += nbad;
          if (nbad && st.why.length < (process.env.SL_OMR_WHY || 3)) st.why.push(c.id + ' ' + nbad + 'x ' + first);
          continue;
        }
        const res = call(c.op, ev(c.args), Object.fromEntries(Object.entries(c.kw || {}).map(([k, v]) => [k, ev(v)])));
        R[c.id] = res;
        const got = c.op === 'findContours' ? encContours(res) : encode(norm(c.op, res));
        reason = diff(c.out, got);
        // equal to cv2's plain C++ kernel but not to its default optimised one: say so
        if (reason && c.plain && !diff(c.plain, got)) reason = 'matches only cv2 setUseOptimized(False): ' + reason;
        // INTER_CUBIC (SheetLab's low-res upscale only): within 1 grey level on <= 1% of values,
        // float32 within 1e-5 relative
        if (reason && c.known && c.full) {
          const want = ev(c.full);
          let n = 0, worst = 0;
          for (let i = 0; i < want.data.length; i++) {
            const d = Math.abs(want.data[i] - res.data[i]);
            if (d) { n++; worst = Math.max(worst, c.known === 'cubic-uint8' ? d : d / Math.max(1e-6, Math.abs(want.data[i]))); }
          }
          const within = c.known === 'cubic-uint8' ? worst <= 1 && n <= 0.01 * want.data.length : worst <= 1e-5;
          if (within) { known.push(page + ' ' + c.id + ' (' + c.known + '): ' + n + '/' + want.data.length + ' values differ, max ' + worst.toPrecision(3)); reason = ''; }
          else reason += ' (' + n + ' values, max ' + worst + ')';
        }
      } catch (e) {
        reason = 'threw ' + (e && e.message ? e.message.split('\n')[0] : e);
      }
      st.n++;
      if (leaks.made - leaks.gone !== live0 && leakOps.indexOf(c.op) < 0) leakOps.push(c.op);
      if (reason) { st.bad++; if (st.why.length < (process.env.SL_OMR_WHY || 3)) st.why.push(c.id + ' ' + reason); }
      else if (c.ipp) simd.push(page + ' ' + c.id + ' (' + c.op + '): ' + c.simd.n + '/' + c.simd.of + ' values, max ' + c.simd.max);
    }
    for (const op of Object.keys(stats)) {
      const s = stats[op];
      H.ok(!s.bad, page + ' ' + op + ': ' + (s.n - s.bad) + '/' + s.n + ' exact' + (s.bad ? ' -- ' + s.why.join(' | ') : ''));
    }
    // the stage fixtures themselves: CLAHE input of segnet, brace/dot image
    if (R.clahe && H.has(page, '03-clahe.png')) H.ok(H.cmpImg(R.clahe, H.readPng(H.fix(page, '03-clahe.png'), { gray: true })).same, page + ' CLAHE(1.0, 8x8) == 03-clahe.png');
    if (R.bd_di && H.has(page, '07-brace-dot.png')) H.ok(H.cmpImg(np.map(np.gt(R.bd_di, 0), (v) => v * 255), H.readPng(H.fix(page, '07-brace-dot.png'), { gray: true })).same, page + ' prepare_brace_dot_image == 07-brace-dot.png');
    console.log('  ' + page + ': ' + doc.cases.length + ' cases in ' + (Date.now() - t0) + ' ms');
  }
  // known, verified differences: uint8 INTER_CUBIC resize, which the x86 cv2 wheel hands to
  // Intel IPP; JS equals cv2's own C++ kernel (setUseOptimized(False)) exactly, IPP rounds
  // these values differently by 1
  if (simd.length) console.log('INFO equals cv2 plain kernel; cv2+IPP differs in:\n  ' + simd.join('\n  '));
  if (known.length) console.log('INFO INTER_CUBIC within tolerance (IPP / SIMD float rounding, see notes):\n  ' + known.join('\n  '));
  // synthetic API behaviour not covered by the dump
  const e = cv2.findContours(np.zeros([5, 5], 'uint8'), cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE);
  H.ok(e[0].length === 0 && e[1] === null, 'findContours on an empty mask -> [[], null] like ((), None)');
  let threw = null;
  try { cv2.minAreaRect(new Int32Array(0)); } catch (err) { threw = err; }
  H.ok(threw instanceof cv2.error, 'opencv.js exceptions surface as OMR.cv2.error (' + (threw && threw.message.split('\n')[0].slice(0, 60)) + ')');
  const img = np.zeros([10, 10, 3], 'uint8');
  const same = cv2.circle(img, [5, 5], 3, [1, 2, 3], -1);
  H.ok(same === img && img.data[(5 * 10 + 5) * 3 + 2] === 3, 'drawing mutates the image in place and returns it');
  H.ok(leaks.made === leaks.gone, 'no opencv.js object outlives a call (' + leaks.made + ' made, ' + leaks.gone + ' deleted' + (leakOps.length ? '; leaking: ' + leakOps.join(', ') : '') + ')');
  H.done();
})().catch((e) => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
