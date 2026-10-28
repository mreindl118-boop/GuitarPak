// OMR engine: page image -> segmentation masks (js/omr/autocrop.js, resize.js, color_adjust.js,
// inference_segnet.js, noise_filtering.js) against the Python reference, on every page:
//   00-input -> autocrop_with_offset (01-crop.json) -> resize_image (02-resized.png, byte-exact)
//   -> apply_clahe (03-clahe.png, byte-exact) -> segnet with the shipping int8 model through
//   OMR.runtime (04-mask-*.png, pixel agreement per mask; needs SL_OMR_MODELS) ->
//   filter_predictions from the 04 masks (noise grid + outputs of 30-segment.json, the staff
//   mask before make_lines_stronger = 30-filtered-staff-pre.png) -> make_lines_stronger on the
//   staff (05-filtered-*.png). Plus tools/omr/dump_segment.py's synthetic cases: photos on a
//   desk through autocrop/resize/CLAHE (30-seg-synthetic.json), noisy staff masks through
//   filter_predictions (31-noise-synthetic.json) and inference()'s tiling / batching / merge
//   with a stand-in model (32-segnet-synthetic.json). Timings per stage are printed.
//   SL_OMR_BATCH=<n> runs the page segnet with another batch size (parity needs homr's 8).
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const H = require('./omr/harness');
// the engine up to this stage (later files may be mid-port), then the runtime
const OMR = H.load('noise_filtering.js');
require(path.join(H.ROOT, 'js', 'omr', 'runtime.js'));
const np = OMR.np, cv2 = () => OMR.cv2;
const seg = OMR.inference_segnet;

const NAMES = ['staff', 'symbols', 'stems_rest', 'notehead', 'clefs_keys'];
const ALL = ['original', 'preprocessed', 'notehead', 'symbols', 'staff', 'clefs_keys', 'stems_rest'];
const camel = (s) => s.replace(/_([a-z])/g, (m, c) => c.toUpperCase());
function sha1(img) { const d = img.data || img; return crypto.createHash('sha1').update(Buffer.from(d.buffer, d.byteOffset, d.byteLength)).digest('hex'); }
function ms(t0) { return Date.now() - t0; }
function readMask(file) { return np.gt(H.readPng(file, { gray: true }), 0); }
function same(a, b) { const c = H.cmpImg(a, b); return c; }

// ---- leak tracking (the worker runs many pages): count the opencv.js objects made and deleted
// inside this area's calls (watch / watchAsync); make_lines_stronger, another area's, is not counted
const leaks = { made: 0, gone: 0, inMade: 0, inGone: 0, ops: new Set() };
function trackLeaks(cv) {
  for (const name of ['Mat', 'MatVector', 'PointVector', 'CLAHE']) {
    const Real = cv[name];
    const del = Real.prototype.delete;
    Real.prototype.delete = function () { leaks.gone++; return del.call(this); };
    cv[name] = new Proxy(Real, { construct(T, args) { leaks.made++; return new T(...args); } });
  }
  for (const f of ['getStructuringElement', 'getAffineTransform']) {
    const g = cv[f];
    const w = function () { leaks.made++; return g.apply(this, arguments); };
    if (g.overloadTable) w.overloadTable = g.overloadTable; // embind dispatches through cv[f].overloadTable
    cv[f] = w;
  }
  const probe = new cv.MatVector(), MV = Object.getPrototypeOf(probe);
  probe.delete();
  const get = MV.get;
  MV.get = function (i) { leaks.made++; return get.call(this, i); };
}
function watch(label, fn) {
  const m0 = leaks.made, g0 = leaks.gone;
  try { return fn(); } finally {
    leaks.inMade += leaks.made - m0; leaks.inGone += leaks.gone - g0;
    if (leaks.made - m0 !== leaks.gone - g0) leaks.ops.add(label);
  }
}
async function watchAsync(label, fn) {
  const m0 = leaks.made, g0 = leaks.gone;
  try { return await fn(); } finally {
    leaks.inMade += leaks.made - m0; leaks.inGone += leaks.gone - g0;
    if (leaks.made - m0 !== leaks.gone - g0) leaks.ops.add(label);
  }
}

// tools/omr/dump_segment.py's FakeSegnet: integer-valued float32 scores that depend on the tile's
// place in its batch and often tie channels (argmax takes the first)
function fakeSegnet(calls) {
  return {
    run: async (x) => {
      const [n, ch, wh, ww] = x.dims, plane = wh * ww, out = new Float32Array(n * 6 * plane);
      calls.push(n);
      for (let b = 0; b < n; b++) for (let k = 0; k < 6; k++) for (let p = 0; p < plane; p++) {
        const x0 = x.data[(b * ch) * plane + p], x2 = x.data[(b * ch + 2) * plane + p];
        out[(b * 6 + k) * plane + p] = (x0 * (k + 1) * 7 + b * 13 + k * 31 + x2) % 11;
      }
      return { data: out, dims: [n, 6, wh, ww] };
    }
  };
}

// 34-seg-edges.json: homr's outcome {raises, message} | {value: null} | {shape, dtype, sha1}
async function outcome(fn) {
  try {
    let r = await fn();
    if (r === null) return { value: null };
    if (Array.isArray(r)) r = r[0];
    return { shape: np.shape(r), dtype: np.dtypeOf(r), sha1: sha1(r) };
  } catch (e) {
    return { raises: e instanceof OMR.cv2.error ? 'error' : e.name, message: String(e.message) };
  }
}
// cv2.error texts name the build's source path and the compiler's function signature: compare
// OpenCV's (code:description) instead
const cvCode = (m) => (String(m).match(/error: \((-?\d+:[^)]*)\)/) || [])[1];
function sameOutcome(w, g) {
  if (w.raises) {
    if (g.raises !== w.raises) return false;
    return w.raises === 'error' ? cvCode(g.message) !== undefined && cvCode(g.message) === cvCode(w.message) : g.message === w.message;
  }
  if ('value' in w) return !g.raises && g.value === w.value;
  return !g.raises && JSON.stringify(g.shape) === JSON.stringify(w.shape) && g.dtype === w.dtype && g.sha1 === w.sha1;
}
function leakCheck() {
  H.ok(!leaks.ops.size && leaks.inMade === leaks.inGone, 'no opencv.js object outlives autocrop / resize_image / apply_clahe / inference / ' +
    'extract / filter_predictions (' + leaks.inMade + ' made, ' + leaks.inGone + ' deleted' + (leaks.ops.size ? '; leaking: ' + [...leaks.ops].join(', ') : '') + ')');
}
const showOutcome = (o) => o.raises ? o.raises + ': ' + (o.raises === 'error' ? cvCode(o.message) : o.message) : 'value' in o ? String(o.value) : o.shape.join('x') + ' ' + o.dtype;

// homr: staff_detection.py:29 make_lines_stronger - OMR.staff_detection's when it is loaded
// (another area's file), else this copy of the three lines
function makeLinesStronger(img, kernelSize) {
  const cv = OMR.cv2;
  const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, kernelSize);
  img = cv.dilate(np.astype(img, 'uint8'), kernel);
  img = np.astype(cv.threshold(img, 0.1, 1, cv.THRESH_BINARY)[1], 'uint8');
  return img;
}
let mlsFrom = 'local copy of staff_detection.make_lines_stronger';
function loadStaffDetection() {
  try {
    require(path.join(H.ROOT, 'js', 'omr', 'bar_line_detection.js'));
    const p = path.join(H.ROOT, 'js', 'omr', 'staff_detection.js');
    if (fs.existsSync(p)) require(p);
  } catch (e) { mlsFrom += ' (staff_detection.js did not load: ' + String(e.message).slice(0, 80) + ')'; }
  if (OMR.staff_detection && typeof OMR.staff_detection.makeLinesStronger === 'function') {
    mlsFrom = 'OMR.staff_detection.makeLinesStronger';
    return OMR.staff_detection.makeLinesStronger;
  }
  return makeLinesStronger;
}

// the models through OMR.runtime: the repo's models/omr parts when generated
// (tools/omr/split_models.py), else a one-part-per-model manifest over SL_OMR_MODELS
function runtimeReadFile() {
  if (fs.existsSync(path.join(H.ROOT, 'models', 'omr', 'manifest.json'))) return (p) => fs.readFileSync(path.join(H.ROOT, p));
  const files = {
    segnet: 'segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f.onnx',
    encoder: 'encoder_pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31.onnx',
    decoder: 'decoder_pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31.onnx'
  };
  const man = { version: 'omr-test', partMax: 0, models: {} };
  const parts = {};
  for (const k of Object.keys(files)) {
    const p = path.join(H.MODELS, files[k]);
    const st = fs.statSync(p);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    man.models[k] = { source: files[k], bytes: st.size, sha256: sha, parts: [{ file: k + '.onnx', bytes: st.size, sha256: sha }] };
    parts['models/omr/' + k + '.onnx'] = p;
  }
  return (p) => p === 'models/omr/manifest.json' ? Buffer.from(JSON.stringify(man)) : fs.readFileSync(parts[p]);
}

// homr: main.py get_predictions (the engine's port of main.py will own it; mirrored here)
async function getPredictions(original, preprocessed, imgPath, enableCache, segnetUseGpu, extra) {
  const result = await seg.extract(preprocessed, imgPath, Object.assign({ stepSize: 320, useCache: enableCache, useGpuInference: segnetUseGpu }, extra));
  const cv = OMR.cv2;
  const originalImage = cv.resize(original, [result.staff.w, result.staff.h]);
  const preprocessedImage = cv.resize(preprocessed, [result.staff.w, result.staff.h]);
  return new OMR.model.InputPredictions(originalImage, preprocessedImage, result.notehead, result.symbols, result.staff,
    result.clefsKeys, result.stemsRests);
}

function predsFromFixtures(page, staff) {
  const m = {};
  for (const n of NAMES) m[n] = readMask(H.fix(page, '04-mask-' + n + '.png'));
  if (staff) m.staff = staff;
  return new OMR.model.InputPredictions(H.readPng(H.fix(page, '02-resized.png')), H.readPng(H.fix(page, '03-clahe.png'), { gray: true }),
    m.notehead, m.symbols, m.staff, m.clefs_keys, m.stems_rest);
}

// filter_predictions against a 30-segment.json / 31-noise case report
function checkFilter(label, preds, rep, debug) {
  const nf = OMR.noise_filtering;
  const gray = np.map(preds.staff, (v) => (255 * v) & 255, 'uint8');
  const grid = nf.createGrid(gray, Math.floor(gray.h / 20), Math.floor(gray.w / 20));
  const want = rep.grid.flat();
  let gd = 0;
  for (let i = 0; i < want.length; i++) if (grid.data[i] !== want[i]) gd++;
  H.ok(grid.h === rep.grid.length && grid.w === rep.grid[0].length && gd === 0,
    label + ' noise grid ' + grid.h + 'x' + grid.w + ' exact (max ' + np.max(grid) + (gd ? ', ' + gd + ' cells differ' : '') + ')');
  const t0 = Date.now();
  const out = watch('filter_predictions', () => nf.filterPredictions(preds, debug));
  const t = ms(t0);
  H.ok((out === preds) === rep.unchanged, label + ' filter_predictions ' + (rep.unchanged ? 'returns the predictions unchanged' : 'filters ' + rep.filtered_cells + ' of ' + rep.total_cells + ' cells') + ' (' + t + ' ms)');
  if (rep.mask) {
    const mask = np.zeros([gray.h, gray.w], 'uint8');
    const r = nf.applyNoiseFilter(grid, mask, null, Math.floor(gray.h / 20), Math.floor(gray.w / 20));
    H.ok(r[0] === rep.filtered_cells && r[1] === rep.total_cells && sha1(mask) === rep.mask, label + ' noise mask exact (' + r[0] + ' of ' + r[1] + ' cells)');
  }
  const bad = [];
  for (const n of ALL) {
    const a = out[camel(n)], w = rep.outputs[n];
    if (np.shape(a).join() !== w.shape.join() || np.dtypeOf(a) !== w.dtype || sha1(a) !== w.sha1) bad.push(n);
  }
  H.ok(!bad.length, label + ' filter_predictions outputs (7 arrays) byte-exact' + (bad.length ? ' -- differ: ' + bad.join(', ') : ''));
  return { out, ms: t };
}

(async () => {
  trackLeaks(await H.cv());
  const timings = [];

  // ---- inference(): tiling, batches, padding, argmax ties and merge with a stand-in model ----
  if (fs.existsSync(path.join(H.FIX, '32-segnet-synthetic.json'))) {
    const doc = H.readJson(path.join(H.FIX, '32-segnet-synthetic.json'));
    let okCases = 0;
    const why = [];
    for (const c of doc.cases) {
      const calls = [];
      seg._inject(fakeSegnet(calls));
      const raw = zlib.inflateSync(Buffer.from(c.input, 'base64'));
      const img = np.image(c.h, c.w, 1, new Uint8Array(raw));
      const prog = [];
      const r = await watchAsync('inference', () => seg.inference(img, { useGpuInference: false, batchSize: c.batch, stepSize: c.step, winSize: c.win, onProgress: (d, t) => prog.push(d + '/' + t) }));
      const got = { staff: r[0], symbols: r[1], stems_rests: r[2], notehead: r[3], clefs_keys: r[4] };
      const bad = Object.keys(c.masks).filter((k) => sha1(got[k]) !== c.masks[k]);
      const total = calls.reduce((s, v) => s + v, 0);
      const progOk = prog[0] === '0/' + total && prog[prog.length - 1] === total + '/' + total && prog.length === calls.length + 1;
      if (!bad.length && calls.join() === c.calls.join() && progOk) okCases++;
      else if (why.length < 3) why.push(JSON.stringify([c.h, c.w, c.win, c.step, c.batch]) + ' masks ' + bad.join('/') + ' calls ' + calls + ' vs ' + c.calls + (progOk ? '' : ' progress ' + prog));
    }
    seg._reset();
    H.ok(okCases === doc.cases.length, 'inference() tiling/batches/merge with a stand-in model: ' + okCases + '/' + doc.cases.length +
      ' cases exact (5 masks, batch sizes per run, onProgress; incl. h or w < win where merge_patches reads fewer tiles than' +
      ' inference made, a step larger than the window, an odd window, a batch larger than the page, a 1 x 1 page)' + (why.length ? ' -- ' + why.join(' | ') : ''));
  } else H.skip('no 32-segnet-synthetic.json (run tools/omr/dump_segment.py)');

  // ---- degenerate inputs: homr's exceptions (and the order they come in) are behaviour too ----
  if (fs.existsSync(path.join(H.FIX, '34-seg-edges.json'))) {
    const doc = H.readJson(path.join(H.FIX, '34-seg-edges.json'));
    const arg = (v) => typeof v === 'string' ? '\'' + v + '\'' : String(v === null ? 'None' : v === true ? 'True' : v === false ? 'False' : v);
    for (const c of doc.cases) {
      let input = null;
      if (c.fn === 'autocrop_bgra') {
        // the synthetic photo, cut by c.sub rows / columns, with an alpha channel of 255
        const src = H.readPng(path.join(H.FIX, c.source));
        const [dy, dx] = c.sub, hh = src.h - dy, ww = src.w - dx;
        input = np.zeros([hh, ww, 4], 'uint8');
        for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) {
          const s = ((y + dy) * src.w + x + dx) * 3, d = (y * ww + x) * 4;
          input.data[d] = src.data[s]; input.data[d + 1] = src.data[s + 1]; input.data[d + 2] = src.data[s + 2]; input.data[d + 3] = 255;
        }
      } else if (c.shape) {
        input = np.full(c.shape, c.fill === 'arange' ? 0 : c.fill, c.dtype || 'uint8');
        if (c.fill === 'arange') for (let i = 0; i < input.data.length; i++) input.data[i] = i % 251;
      }
      let got, extra = '', extraOk = true;
      if (c.fn === 'resize_image') got = await outcome(() => watch('resize_image', () => OMR.resize.resizeImage(input)));
      else if (c.fn === 'create_noise_grid') got = await outcome(() => watch('create_noise_grid', () => OMR.noise_filtering.createNoiseGrid(input, new OMR.debug.Debug(null, 'edges', false))));
      else if (c.fn === 'estimate_noise') got = await outcome(() => watch('estimate_noise', () => OMR.np.full([1], OMR.noise_filtering.estimateNoise(input))));
      else if (c.fn === 'autocrop_with_offset') got = await outcome(() => watch('autocrop', () => OMR.autocrop.autocropWithOffset(input)));
      else if (c.fn === 'autocrop_bgra') {
        got = await outcome(() => watch('autocrop', () => OMR.autocrop.autocropWithOffset(input)));
        extra = ' BGRA of ' + c.source.replace(/^30-seg-|-00-input\.png$/g, '') + ' from row ' + c.sub[0] + ', column ' + c.sub[1];
      }
      else if (c.fn === 'apply_clahe') got = await outcome(() => watch('apply_clahe', () => OMR.color_adjust.applyClahe(input)));
      else if (c.fn === 'inference') {
        // a stand-in Segnet.create: was the Segnet made (homr raises for a None step before)?
        const calls = [], realCreate = seg.Segnet.create;
        let made = false;
        seg._reset();
        seg.Segnet.create = async () => { made = true; return fakeSegnet(calls); };
        try {
          got = await outcome(() => watchAsync('inference', () => seg.inference(input, { useGpuInference: false, batchSize: c.batch, stepSize: c.step, winSize: c.win })));
        } finally { seg.Segnet.create = realCreate; seg._reset(); }
        extraOk = made === c.segnet_made && calls.join() === c.calls.join();
        extra = ', batch ' + arg(c.batch) + ', step ' + arg(c.step) + ', win ' + arg(c.win);
        if (!extraOk) extra += ' -- JS Segnet made ' + made + ' (homr ' + c.segnet_made + '), runs ' + calls + ' (homr ' + c.calls + ')';
      } else if (c.fn === 'merge_patches') {
        const pats = [];
        for (let k = 0; k < c.patches; k++) { const p = new Uint8Array(32 * 32); for (let i = 0; i < p.length; i++) p[i] = i % 6; pats.push(p); }
        got = await outcome(() => seg.mergePatches(pats, c.image_shape, c.win, c.step));
        extra = ' ' + c.patches + ' patches, step ' + arg(c.step);
      }
      const shape = c.shape || c.image_shape;
      H.ok(got && sameOutcome(c.out, got) && extraOk, 'edge ' + c.fn + '(' + shape.join('x') + (c.dtype && c.dtype !== 'uint8' ? ' ' + c.dtype : '') + extra + ') -> ' +
        showOutcome(c.out) + ' like homr' + (got && !sameOutcome(c.out, got) ? ' -- JS: ' + showOutcome(got) : ''));
    }
  } else H.skip('no 34-seg-edges.json (run tools/omr/dump_segment.py --only edges)');

  // ---- synthetic photos: autocrop -> resize -> CLAHE ----
  if (fs.existsSync(path.join(H.FIX, '30-seg-synthetic.json'))) {
    const doc = H.readJson(path.join(H.FIX, '30-seg-synthetic.json'));
    for (const c of doc.cases) {
      const input = H.readPng(path.join(H.FIX, '30-seg-' + c.name + '-00-input.png'));
      let t0 = Date.now();
      const [cropped, tl] = watch('autocrop', () => OMR.autocrop.autocropWithOffset(input));
      const ta = ms(t0);
      t0 = Date.now();
      const resized = watch('resize_image', () => OMR.resize.resizeImage(cropped));
      const tr = ms(t0);
      t0 = Date.now();
      const pre = watch('apply_clahe', () => OMR.color_adjust.applyClahe(resized));
      const tc = ms(t0);
      H.ok(tl[0] === c.top_left[0] && tl[1] === c.top_left[1] && np.shape(cropped).join() === c.shape.join() &&
        (cropped === input) === c.cropped_is_input && sha1(cropped) === c.crop_sha1,
        'synthetic ' + c.name + ' ' + c.input.slice(0, 2).join('x') + ': autocrop -> top_left ' + tl + ', ' + np.shape(cropped).join('x') +
        (c.cropped_is_input ? ' (the input itself)' : ' (cropped, surroundings painted)') + ' byte-exact (' + ta + ' ms, Python ' + Math.round(c.autocrop_secs * 1000) + ' ms)');
      H.ok(np.shape(resized).join() === c.resized.shape.join() && sha1(resized) === c.resized.sha1 && sha1(pre) === c.clahe.sha1 && np.shape(pre).join() === c.clahe.shape.join(),
        'synthetic ' + c.name + ': resize_image ' + np.shape(resized).join('x') + ' + apply_clahe byte-exact (' + tr + ' + ' + tc + ' ms)');
    }
  } else H.skip('no 30-seg-synthetic.json (run tools/omr/dump_segment.py --prep ...)');

  // ---- synthetic noise: filter_predictions ----
  if (fs.existsSync(path.join(H.FIX, '31-noise-synthetic.json'))) {
    const doc = H.readJson(path.join(H.FIX, '31-noise-synthetic.json'));
    const debug = new OMR.debug.Debug(null, doc.page, false);
    for (const c of doc.cases) {
      const staff = readMask(path.join(H.FIX, '31-noise-' + c.name + '-staff.png'));
      checkFilter('noise ' + c.name, predsFromFixtures(doc.page, staff), c, debug);
    }
  } else H.skip('no 31-noise-synthetic.json (run tools/omr/dump_segment.py)');

  // ---- the pages ----
  const pages = H.pages().filter((p) => H.has(p, '00-input.png') && H.has(p, '04-mask-staff.png'));
  if (!pages.length) { H.skip('segment parity: no page fixtures'); leakCheck(); H.done(); return; }
  const haveModels = !!H.MODELS && fs.existsSync(H.MODELS);
  let ortOk = false;
  if (haveModels) {
    try { H.ort(); ortOk = true; } catch (e) { H.skip('onnxruntime-web not on NODE_PATH: ' + e.message); }
  } else H.skip('(no models) set SL_OMR_MODELS for the segnet parity checks');
  if (ortOk) OMR.runtime.configure({ readFile: runtimeReadFile(), ep: 'wasm' });
  const mls = loadStaffDetection();
  const batch = process.env.SL_OMR_BATCH ? parseInt(process.env.SL_OMR_BATCH, 10) : 8;

  for (const [pi, page] of pages.entries()) {
    const T = { page };
    const input = H.readPng(H.fix(page, '00-input.png'));
    const crop = H.readJson(H.fix(page, '01-crop.json'));
    let t0 = Date.now();
    const [cropped, tl] = watch('autocrop', () => OMR.autocrop.autocropWithOffset(input));
    T.autocrop = ms(t0);
    H.ok(tl[0] === crop.top_left[0] && tl[1] === crop.top_left[1] && np.shape(cropped).join() === crop.shape.join(),
      page + ' autocrop_with_offset: top_left ' + tl + ', shape ' + np.shape(cropped).join('x') + ' == 01-crop.json (' + T.autocrop + ' ms)');
    t0 = Date.now();
    const resized = watch('resize_image', () => OMR.resize.resizeImage(cropped));
    T.resize = ms(t0);
    let c = same(resized, H.readPng(H.fix(page, '02-resized.png')));
    H.ok(c.same, page + ' resize_image -> ' + np.shape(resized).join('x') + ' == 02-resized.png byte-exact' + (c.same ? '' : ' (' + c.diff + '/' + c.total + ' differ ' + (c.why || '') + ')') + ' (' + T.resize + ' ms)');
    t0 = Date.now();
    const pre = watch('apply_clahe', () => OMR.color_adjust.applyClahe(resized));
    T.clahe = ms(t0);
    c = same(pre, H.readPng(H.fix(page, '03-clahe.png'), { gray: true }));
    H.ok(c.same, page + ' apply_clahe == 03-clahe.png byte-exact' + (c.same ? '' : ' (' + c.diff + '/' + c.total + ' differ)') + ' (' + T.clahe + ' ms)');

    const rep = H.has(page, '30-segment.json') ? H.readJson(H.fix(page, '30-segment.json')) : null;
    let jsPreds = null;
    if (ortOk) {
      const prog = [];
      t0 = Date.now();
      const first = !OMR.runtime.info().sessions.segnet;
      // a worker may free the session between pages: the kept Segnet must reopen it
      const released = pi === 1;
      if (released) await OMR.runtime.release('segnet');
      jsPreds = await watchAsync('extract', () => getPredictions(resized, pre, H.fix(page, '00-input.png'), false, false, { batchSize: batch, onProgress: (d, t) => prog.push([d, t]) }));
      T.segnet = ms(t0);
      if (first) T.session = OMR.runtime.info().sessions.segnet.createMs;
      const total = prog.length ? prog[0][1] : 0;
      T.tiles = total;
      const parts = [];
      let allSame = true;
      for (const n of NAMES) {
        const want = readMask(H.fix(page, '04-mask-' + n + '.png'));
        const cc = same(jsPreds[camel(n)], want);
        if (!cc.same) allSame = false;
        parts.push(n + ' ' + (cc.same ? '100%' : (100 * (1 - cc.diff / cc.total)).toFixed(4) + '% (' + cc.diff + ' px)'));
      }
      H.ok(allSame, page + ' segnet (int8, wasm, batch ' + batch + ', ' + total + ' tiles) masks == 04-mask-*.png: ' + parts.join(', ') + ' (' + T.segnet + ' ms' + (T.session ? ', session ' + T.session + ' ms' : '') + (released ? ', after OMR.runtime.release(\'segnet\')' : '') + ')');
      H.ok(prog.length === Math.ceil(total / batch) + 1 && prog[prog.length - 1][0] === total, page + ' onProgress(tiles done, total) after every batch: ' + prog.map((p) => p[0]).join(','));
      H.ok(jsPreds.original.c === 3 && H.cmpImg(jsPreds.original, resized).same && H.cmpImg(jsPreds.preprocessed, pre).same,
        page + ' get_predictions: original / preprocessed resized to the masks\' (equal) shape = copies');
    }

    if (!rep) { H.skip(page + ' no 30-segment.json (run tools/omr/dump_segment.py)'); continue; }
    const debug = new OMR.debug.Debug(resized, H.fix(page, '00-input.png'), false);
    const f = checkFilter(page, predsFromFixtures(page), rep.filter, debug);
    T.filter = f.ms;
    const out = f.out;
    c = same(out.staff, readMask(H.fix(page, '30-filtered-staff-pre.png')));
    H.ok(c.same, page + ' staff after filter_predictions == 30-filtered-staff-pre.png');
    t0 = Date.now();
    out.staff = mls(out.staff, [1, 2]);
    T.makeLinesStronger = ms(t0);
    const bad = [];
    for (const n of NAMES) {
      const cc = same(out[camel(n)], readMask(H.fix(page, '05-filtered-' + n + '.png')));
      if (!cc.same) bad.push(n + ' ' + cc.diff + ' px');
    }
    H.ok(!bad.length, page + ' filter_predictions + make_lines_stronger (' + mlsFrom + ') == 05-filtered-*.png' + (bad.length ? ' -- ' + bad.join(', ') : '') + ' (' + T.makeLinesStronger + ' ms)');
    if (jsPreds) {
      // the whole stage from the JS masks (what the engine will run)
      let p2 = watch('filter_predictions', () => OMR.noise_filtering.filterPredictions(jsPreds, debug));
      p2.staff = mls(p2.staff, [1, 2]);
      const bad2 = NAMES.filter((n) => !same(p2[camel(n)], readMask(H.fix(page, '05-filtered-' + n + '.png'))).same);
      H.ok(!bad2.length, page + ' JS segnet masks -> filter_predictions -> make_lines_stronger == 05-filtered-*.png' + (bad2.length ? ' -- differ: ' + bad2.join(', ') : ''));
    }
    T.python = rep.timings;
    timings.push(T);
  }

  // ---- the shipping segnet on page shapes the 7 Letter pages never make (dump_segment_shapes.py):
  // A4 = 54 tiles (a partial last batch of 6: the int8 net quantizes per batch tensor), a short
  // page (batches 8, 8, 2; the last tile row overlaps the one before), a strip lower than a window
  // (white-padded tiles) ----
  if (ortOk && fs.existsSync(path.join(H.FIX, '33-segnet-shapes.json'))) {
    const doc = H.readJson(path.join(H.FIX, '33-segnet-shapes.json'));
    for (const c of doc.cases) {
      const img = H.readPng(path.join(H.FIX, '33-segnet-' + c.name + '-input.png'), { gray: true });
      const prog = [];
      const t0 = Date.now();
      const r = await watchAsync('inference', () => seg.inference(img, { useGpuInference: false, batchSize: doc.batch_size, stepSize: doc.step_size,
        winSize: doc.win_size, onProgress: (d) => prog.push(d) }));
      const t = ms(t0);
      const got = { staff: r[0], symbols: r[1], stems_rests: r[2], notehead: r[3], clefs_keys: r[4] };
      const parts = [];
      let exact = true;
      for (const n of Object.keys(c.masks)) {
        const cc = same(got[n], readMask(path.join(H.FIX, '33-segnet-' + c.name + '-' + n + '.png')));
        const ok1 = sha1(got[n]) === c.masks[n].sha1 && np.dtypeOf(got[n]) === c.masks[n].dtype;
        if (!ok1) exact = false;
        parts.push(n + ' ' + (ok1 ? '100%' : (100 * (1 - cc.diff / cc.total)).toFixed(4) + '% (' + cc.diff + ' px)'));
      }
      const runs = prog.slice(1).map((d, i) => d - prog[i]);
      H.ok(exact && runs.join() === c.calls.join(), 'segnet on a ' + c.name + ' page ' + c.shape.join('x') + ' (batches ' + runs.join('+') +
        (runs.join() === c.calls.join() ? '' : ' vs Python ' + c.calls.join('+')) + '): ' + parts.join(', ') + ' (' + t + ' ms, Python ' + c.secs + ' s)');
    }
  } else if (ortOk) H.skip('no 33-segnet-shapes.json (run tools/omr/dump_segment_shapes.py)');

  console.log('timings (ms; Python s from 30-segment.json, 4-thread onnxruntime):');
  for (const T of timings) {
    console.log('  ' + T.page + ': autocrop ' + T.autocrop + ', resize ' + T.resize + ', clahe ' + T.clahe +
      (T.segnet !== undefined ? ', segnet ' + T.segnet + ' (' + T.tiles + ' tiles, ' + Math.round(T.segnet / T.tiles) + '/tile' + (T.session ? ', +session ' + T.session : '') + ')' : '') +
      ', filter ' + T.filter + ', make_lines_stronger ' + T.makeLinesStronger + ' | Python ' + JSON.stringify(T.python));
  }
  await OMR.runtime.release();
  leakCheck();
  H.done();
})().catch((e) => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
