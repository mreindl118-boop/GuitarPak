// OMR engine: homr's reading stage - systems -> TrOMR tokens -> voices (js/omr/staff_dewarping.js,
// transformer_encoder_inference.js, transformer_decoder_inference.js, transformer_staff2score.js,
// staff_parsing_tromr.js, staff_parsing.js) against the Python reference on every page.
//
// Fixtures (tools/omr/dump_read.py, dump_read_delaunay.py; dump_stages.py's 03 / 09 / 10 / 11):
//   40-read-staffs.json   the multi_staffs after repair_systems at full precision -> rebuilt into
//                         model objects (tests/omr/rebuild.js); the image is 03-clahe.png
//   40-read-prep.json     every prepare_staff_image step (region, crops, the dewarping's points,
//                         Subdiv2D triangles, simplices, affine matrices, image sha1s, staff_to_page)
//   09-staff-NN.png       the transformer input of staff NN (byte-exact)
//   40-read-<mode>.json   parse_staffs with Python onnxruntime: tokens, per-step argmax / margins /
//                         attention, voices with image_coordinates, the MusicXML
//                           ship    = the shipping int8 encoder + int8 decoder (what soundLAB runs)
//                           fp32enc = the fp32 encoder + the int8 decoder
//                           fp16    = what dump_stages ran (== 10-tokens.json / 11-score.musicxml)
//   41-read-ctx-<mode>-NN.bin  Python's encoder output of call NN (decoder-only checks)
//   40-read-synthetic.json, 40-read-delaunay-fuzz.json  Subdiv2D / Delaunay / piecewise affine /
//                         dewarp / canvas / black contours / layouts / measure rests / parse_staffs with
//                         a stub transformer; 700 fuzz point sets
//   40-read-audit.json    (tools/omr/dump_read_audit.py) the adversarial audit's edge cases:
//                         prepare_staff_image at the page edges / below the page / overlapping staffs
//                         (cv2.error) / grand / steep / curved / sparse / short staffs, debug off and on
//                         (every image homr hands to Debug), parse_staffs with debug on, the canvas
//                         helpers on empty images, ConvertToArray on non-uint8 images
//
// Sections (all exact unless said otherwise):
//   synthetic   always (no models)
//   audit       always (no models): 40-read-audit.json
//   prep        every staff: each step vs 40-read-prep.json, canvas == 09-staff-NN.png
//   stub        parse_staffs with Python's own tokens + attention (a stub Staff2Score): voices
//               (strings + image_coordinates) and MusicXML byte for byte, for ship and fp16 (= 10 / 11)
//   models      (SL_OMR_MODELS) through OMR.runtime ('wasm'), the shipping int8 models:
//               - the JS decoder fed with Python's encoder output: tokens and every head's argmax at
//                 every step identical (logit / attention noise reported)
//               - parse_staffs with the JS Staff2Score: encoder input sha1 exact; tokens vs Python
//                 ship must be identical OR start to diverge at a model near tie (Python's top-2 logit
//                 margin < NEAR_TIE): the int8 encoder's output in onnxruntime-web differs from
//                 onnxruntime CPU by ~0.04 (DynamicQuantizeLinear amplifies kernel float noise; see
//                 notes/read.md); pages with identical tokens: voices exact, MusicXML equal apart from
//                 the imgpos comments (attention positions); token agreement vs 10-tokens.json,
//                 encoder-output distance, imgpos statistics, MIDI impact and timings are INFO lines
//               - staff_parsing_tromr's own Staff2Score creation path
//   fp32        (SL_OMR_FP32_ENCODER=<encoder fp32 .onnx>) the same with the fp32 encoder vs
//               40-read-fp32enc.json (the size-vs-fidelity comparison for the owner)
// Run time (Node, 1 thread): ~40 s without models, ~10 min with, ~18 min with the fp32 comparison.
// Env: SL_OMR_READ_PAGES=a,b limits the pages; SL_OMR_READ_SKIP=synthetic,audit,prep,stub,decoder,full
// skips sections.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const H = require('./omr/harness');
const R = require('./omr/rebuild');
const OMR = H.load('staff_parsing.js');
require(path.join(H.ROOT, 'js', 'omr', 'runtime.js'));
require(path.join(H.ROOT, 'js', 'omr', 'midi.js')); // impact of a token divergence on the MIDI (INFO only)
const np = OMR.np, py = OMR.py;
const DW = OMR.staff_dewarping, SP = OMR.staff_parsing, SPT = OMR.staff_parsing_tromr;
const V = OMR.transformer_vocabulary, MX = OMR.music_xml_generator, PM = OMR.point_mapping;
const S2S = OMR.transformer_staff2score, DEC = OMR.transformer_decoder_inference;
const ENC = OMR.transformer_encoder_inference;
const cv2 = () => OMR.cv2;

const SKIP = new Set((process.env.SL_OMR_READ_SKIP || '').split(',').filter(Boolean));
const ONLY = (process.env.SL_OMR_READ_PAGES || '').split(',').filter(Boolean);
const MODEL_NAME = 'pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31';

function sha1(img) { const d = img.data || img; return crypto.createHash('sha1').update(Buffer.from(d.buffer, d.byteOffset, d.byteLength)).digest('hex'); }
const num = R.num;
const eqf = (a, b) => a === b || (a !== a && b !== b);
function eqArr(a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return a === b || (a == null && b == null);
  if (ArrayBuffer.isView(a)) a = Array.from(a);
  if (ArrayBuffer.isView(b)) b = Array.from(b);
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => eqArr(x, b[i]));
  return eqf(typeof a === 'number' ? a : a, typeof b === 'string' ? num(b) : b);
}
const show = (v) => JSON.stringify(v, (k, x) => (ArrayBuffer.isView(x) ? Array.from(x) : x));
const imgInfo = (img) => ({ shape: img.c === 1 ? [img.h, img.w] : [img.h, img.w, img.c], sha1: sha1(img) });
function sameInfo(img, want) { const a = imgInfo(img); return show(a.shape) === show(want.shape) && a.sha1 === want.sha1; }
function msNow() { return Number(process.hrtime.bigint()) / 1e6; }

// dump_read.py's synthetic picture: ((x*37 + y*91 + ((x*y + seed + 11k) % 251)) % 256) per channel
function synImage(h, w, c, seed) {
  const img = np.zeros(c === 1 ? [h, w] : [h, w, c], 'uint8');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < c; k++) img.data[(y * w + x) * c + k] = (x * 37 + y * 91 + ((x * y + seed + 11 * k) % 251)) % 256;
    }
  }
  return img;
}
function debugFor(img) { return new OMR.debug.Debug(img, 'x.png', false); }
function raises(fn) {
  try { return { value: fn() }; } catch (e) { return { raises: (e && (e.pyType || e.name)) || String(e), message: e && e.message }; }
}

// ---- leak tracking: the opencv.js objects made and deleted inside this stage's calls ----
const leaks = { made: 0, gone: 0, inMade: 0, inGone: 0, ops: new Set() };
function trackLeaks(cv) {
  for (const name of ['Mat', 'MatVector']) {
    const Real = cv[name];
    const del = Real.prototype.delete;
    Real.prototype.delete = function () { leaks.gone++; return del.call(this); };
    cv[name] = new Proxy(Real, { construct(T, args) { leaks.made++; return new T(...args); } });
  }
  for (const f of ['getAffineTransform']) {
    const g = cv[f];
    const w = function () { leaks.made++; return g.apply(this, arguments); };
    if (g.overloadTable) w.overloadTable = g.overloadTable;
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

// =============================================================================================
// synthetic: 40-read-synthetic.json
function synthetic() {
  const file = path.join(H.FIX, '40-read-synthetic.json');
  if (!fs.existsSync(file)) { H.skip('no 40-read-synthetic.json (run tools/omr/dump_read.py)'); return; }
  const doc = H.readJson(file);

  // -- Subdiv2D / DelaunayTriangulation / PiecewiseAffineTransform --
  const nearest = { n: 0, ok: 0 };
  for (const c of doc.delaunay) {
    const pts = c.points.map((p) => p.map(num));
    if (c.raises) {
      const r = raises(() => new DW.DelaunayTriangulation(pts));
      H.ok(r.raises === c.raises && r.message === c.message, 'delaunay ' + c.name + ': raises ' + c.raises + ' "' + c.message + '" (' + (r.raises ? r.raises + ' "' + r.message + '"' : 'no exception') + ')');
      continue;
    }
    const bad = [];
    const tri = watch('DelaunayTriangulation', () => new DW.DelaunayTriangulation(pts));
    // the raw Subdiv2D run (rect, insert ids, getTriangleList in order)
    let rect = cv2().boundingRect(Float32Array.from(tri.points.flat()));
    rect = [rect[0] - 10, rect[1] - 10, rect[2] + 20, rect[3] + 20];
    const sub = new DW._Subdiv2D(rect);
    const ids = tri.points.map((p) => sub.insert(p));
    const list = sub.getTriangleList();
    if (!eqArr(rect, c.triangles.rect)) bad.push('rect ' + show(rect) + ' vs ' + show(c.triangles.rect));
    if (!eqArr(ids, c.triangles.ids)) bad.push('insert ids ' + show(ids) + ' vs ' + show(c.triangles.ids));
    if (!eqArr(list, c.triangles.list)) bad.push('triangle list (' + list.length + ' vs ' + c.triangles.list.length + ')');
    if (!eqArr(tri.simplices, c.simplices)) bad.push('simplices ' + show(tri.simplices).slice(0, 80) + ' vs ' + show(c.simplices).slice(0, 80));
    const t = new DW.PiecewiseAffineTransform();
    watch('PiecewiseAffineTransform.estimate', () => t.estimate(pts, c.dst.map((p) => p.map(num))));
    if (!eqArr(t.affineMatrices, c.mats)) bad.push('affine matrices');
    const probes = c.probes.map((p) => p.map(num));
    const fs1 = Array.from(tri.findSimplex(probes));
    if (!eqArr(fs1, c.find_simplex)) bad.push('find_simplex ' + show(fs1) + ' vs ' + show(c.find_simplex));
    const tr = probes.map((p) => t.transformPoint(p));
    const nTr = tr.filter((p, i) => eqArr(p, c.transform[i])).length;
    if (nTr !== probes.length) bad.push('transform_point ' + nTr + '/' + probes.length);
    const inv = probes.map((p) => watch('inverseTransformPoint', () => t.inverseTransformPoint(p)));
    const nInv = inv.filter((p, i) => eqArr(p, c.inverse[i])).length;
    if (nInv !== probes.length) bad.push('inverse_transform_point ' + nInv + '/' + probes.length);
    let warps = 0, warpsOk = 0;
    if (c.warp) {
      for (const k of Object.keys(c.warp.images)) {
        const m = /^c(\d)-o(\d)-f(\d+)$/.exec(k);
        const im = synImage(c.warp.h, c.warp.w, +m[1], c.warp.seed);
        const out = watch('warpImage', () => t.warpImage(im, +m[3], +m[2]));
        if (+m[2] === 0) { // order 0 = cv2.INTER_NEAREST: a known cv.js limitation, see nearestNote
          nearest.n++;
          if (sameInfo(out, c.warp.images[k])) nearest.ok++;
          continue;
        }
        warps++;
        if (sameInfo(out, c.warp.images[k])) warpsOk++; else bad.push('warp ' + k);
      }
    }
    H.ok(!bad.length, 'delaunay ' + c.name + ' (' + pts.length + ' points): Subdiv2D triangle list ' + list.length + ' in order, ' +
      tri.simplices.length + ' simplices, matrices, find_simplex, transform/inverse ' + probes.length + ' probes' +
      (warps ? ', warp_image (order 1) ' + warpsOk + '/' + warps : '') + (bad.length ? ' -- ' + bad.slice(0, 3).join('; ') : ''));
  }
  // warp_image(order=0) uses cv2.INTER_NEAREST, which OMR.cv2.warpAffine hands to opencv.js; its
  // scalar nearest-neighbour rounding differs from cv2's x86 SIMD path in a few pixels (probed:
  // 125 of 3.8e6 pixels of these warps, 2 of 1e6 on 60 random single warps). homr's inference only
  // ever warps with order 1 (StaffDewarping.dewarp's
  // default); order 3 (training) is also INTER_LINEAR. So this is reported, not failed.
  console.log('INFO warp_image order 0 (INTER_NEAREST, not used by homr inference): ' + nearest.ok + '/' + nearest.n +
    ' images identical' + (nearest.ok < nearest.n ? ' (cv.js warpAffine INTER_NEAREST goes through opencv.js, whose rounding differs from cv2 on x86 in a few pixels)' : ''));

  // -- fuzz (tools/omr/dump_read_delaunay.py): dewarp grids, jittered lattices, random sets --
  const fuzzFile = path.join(H.FIX, '40-read-delaunay-fuzz.json');
  if (fs.existsSync(fuzzFile)) {
    const fz = H.readJson(fuzzFile).cases;
    let okN = 0, tris = 0, inv = 0, invOk = 0, first = '';
    const kinds = {};
    for (const c of fz) {
      kinds[c.kind] = (kinds[c.kind] || 0) + 1;
      const pts = c.points, bad = [];
      if (c.raises) {
        const r = raises(() => { const t = new DW.PiecewiseAffineTransform(); t.estimate(pts, c.dst); });
        if (r.raises !== c.raises) bad.push('raises ' + r.raises + ' vs ' + c.raises);
      } else {
        const t = new DW.PiecewiseAffineTransform();
        watch('PiecewiseAffineTransform.estimate', () => t.estimate(pts, c.dst));
        let rect = cv2().boundingRect(Float32Array.from(t.srcPoints.flat()));
        rect = [rect[0] - 10, rect[1] - 10, rect[2] + 20, rect[3] + 20];
        const sub = new DW._Subdiv2D(rect);
        const ids = t.srcPoints.map((p) => sub.insert(p));
        if (!eqArr(rect, c.triangles.rect) || !eqArr(ids, c.triangles.ids)) bad.push('rect / ids');
        if (!eqArr(sub.getTriangleList(), c.triangles.list)) bad.push('triangle list');
        if (!eqArr(t.triangulation.simplices, c.simplices)) bad.push('simplices');
        if (!eqArr(t.affineMatrices, c.mats)) bad.push('matrices');
        tris += c.simplices.length;
        c.probes.forEach((p, i) => { inv++; if (eqArr(watch('inverseTransformPoint', () => t.inverseTransformPoint(p)), c.inverse[i])) invOk++; else bad.push('inverse ' + i); });
      }
      if (!bad.length) okN++; else if (!first) first = c.kind + ' (' + pts.length + ' points): ' + bad.slice(0, 3).join(', ');
    }
    H.ok(okN === fz.length && invOk === inv, 'delaunay fuzz ' + okN + '/' + fz.length + ' point sets (' + Object.keys(kinds).map((k) => kinds[k] + ' ' + k).join(', ') +
      '): Subdiv2D triangle lists in order, ' + tris + ' simplices, affine matrices, inverse_transform_point ' + invOk + '/' + inv + (first ? ' -- ' + first : ''));
  } else H.skip('no 40-read-delaunay-fuzz.json (run tools/omr/dump_read_delaunay.py)');

  // -- calculate_span_and_optimal_points + dewarp_staff_image on synthetic staffs --
  for (const c of doc.dewarp) {
    const staff = new OMR.model.Staff(c.grid.map((p) => R.staffPoint(OMR, p)));
    if (c.spec === 'nan') {
      const img = synImage(c.h, c.w, 1, c.seed);
      const d = DW.dewarpStaffImage(img, staff, 99, debugFor(img));
      H.ok((d.tform !== null) === c.ok, 'dewarp: a NaN staff line -> ' + (c.ok ? 'a transformation' : 'no transformation (int(nan) raises inside, caught like Python)'));
      continue;
    }
    const [h, w] = c.spec;
    const img = synImage(h, w, 1, c.seed);
    const bad = [];
    const so = DW.calculateSpanAndOptimalPoints(staff, img);
    if (!eqArr(so[0], c.span)) bad.push('span');
    if (!eqArr(so[1], c.optimal)) bad.push('optimal');
    const d = watch('dewarpStaffImage', () => DW.dewarpStaffImage(np.clone(img), staff, c.seed, debugFor(img)));
    if ((d.tform !== null) !== c.ok) bad.push('ok ' + (d.tform !== null));
    if (d.tform && c.ok) {
      if (!eqArr(d.tform.triangulation.simplices, c.simplices)) bad.push('simplices');
      if (!sameInfo(watch('dewarp', () => d.dewarp(img)), c.dewarped)) bad.push('dewarped image');
      for (const [p, want] of c.undewarp) {
        const got = d.undewarpPoint(p.map(num));
        if (!eqArr(got, want)) bad.push('undewarp ' + show(p) + ' ' + show(got) + ' vs ' + show(want));
      }
    }
    H.ok(!bad.length, 'dewarp ' + show(c.spec) + ': span / optimal points (' + c.span.length + ' lines), simplices, dewarped image, undewarp_point' + (bad.length ? ' -- ' + bad.join('; ') : ''));
  }

  // -- the canvas helpers --
  const cv = doc.canvas;
  let n = 0, okc = 0, first = '';
  for (const s of cv.size) {
    n++;
    const got = SP.getTrOmrCanvasSize(s.shape, s.mt, s.mb);
    if (eqArr(got, s.value)) okc++; else if (!first) first = show(s) + ' -> ' + show(got);
  }
  for (const s of cv.offset) {
    n++;
    const got = SP._canvasYOffset(s.h, s.mt, s.mb);
    if (got === s.value) okc++; else if (!first) first = show(s) + ' -> ' + got;
  }
  for (const s of cv.center) {
    n++;
    const img = synImage(s.h, s.w, s.c, s.h);
    const out = s.add ? SP.addImageIntoTrOmrCanvas(img) : SP.centerImageOnCanvas(img, s.size, s.mt, s.mb);
    if (sameInfo(out, s.out)) okc++; else if (!first) first = 'center ' + show([s.h, s.w, s.c, s.mt, s.mb, s.add]);
  }
  H.ok(okc === n, 'get_tr_omr_canvas_size / _canvas_y_offset / center_image_on_canvas / add_image_into_tr_omr_canvas: ' + okc + '/' + n + (first ? ' -- ' + first : ''));

  // -- remove_black_contours_at_edges_of_image on drawn pictures --
  n = 0; okc = 0; first = '';
  for (const s of cv.black) {
    n++;
    const pic = H.readPng(path.join(H.FIX, '40-read-black-' + s.name + '.png'), { gray: true });
    if (!sameInfo(pic, s.input)) { if (!first) first = s.name + ' input png'; continue; }
    const before = np.clone(pic);
    const out = watch('removeBlackContoursAtEdgesOfImage', () => SP.removeBlackContoursAtEdgesOfImage(pic, s.unit));
    let changed = 0;
    for (let i = 0; i < out.data.length; i++) if (out.data[i] !== before.data[i]) changed++;
    if (out === pic && sameInfo(out, s.output) && changed === s.changed) okc++; else if (!first) first = s.name + ' unit ' + s.unit;
  }
  H.ok(okc === n, 'remove_black_contours_at_edges_of_image (in place): ' + okc + '/' + n + ' pictures x unit sizes' + (first ? ' -- ' + first : ''));

  // -- _slots_in_layout / _assign_parts --
  n = 0; okc = 0; first = '';
  for (const [row, layout, want] of doc.layout.slots) {
    n++;
    const got = SP._slotsInLayout(row, layout);
    if (eqArr(got, want)) okc++; else if (!first) first = show([row, layout]) + ' -> ' + show(got) + ' vs ' + show(want);
  }
  H.ok(okc === n, '_slots_in_layout: ' + okc + '/' + n + ' (row, layout) pairs' + (first ? ' -- ' + first : ''));
  n = 0; okc = 0; first = '';
  for (const c of doc.layout.assign) {
    n++;
    const rows = c.rows.map((r) => ({ staffs: r.map((g) => ({ isGrandstaff: g })) }));
    const r = raises(() => SP._assignParts(rows));
    const good = c.raises ? r.raises === c.raises : !r.raises && eqArr(r.value, c.result);
    if (good) okc++; else if (!first) first = show(c.rows) + ' -> ' + show(r) + ' vs ' + show(c.result);
  }
  H.ok(okc === n, '_assign_parts: ' + okc + '/' + n + ' page layouts' + (first ? ' -- ' + first : ''));

  // -- _measure_rests_like --
  n = 0; okc = 0; first = '';
  for (const c of doc.measure_rests) {
    n++;
    const syms = c.in.map((s) => V.EncodedSymbol.fromString(s));
    const got = SP._measureRestsLike(syms, c.grand).map(String);
    if (eqArr(got, c.out)) okc++; else if (!first) first = show(c.in).slice(0, 80);
  }
  H.ok(okc === n, '_measure_rests_like: ' + okc + '/' + n + ' token sequences' + (first ? ' -- ' + first : ''));
  return doc;
}

// a stand-in for the module global Staff2Score: call k returns stubs[k % len] as EncodedSymbols
// with float32 attention coordinates (null / NaN as recorded), like dump_read.py's StubInference
class StubInference {
  constructor(stubs, empty) { this.stubs = stubs; this.empty = new Set(empty || []); this.k = 0; this.images = []; }
  predict(image) {
    const k = this.k++;
    this.images.push(image);
    if (this.empty.has(k)) return [];
    const [toks, coords] = this.stubs[k % this.stubs.length];
    return toks.map((t, j) => {
      const s = V.EncodedSymbol.fromString(t);
      const c = coords[j];
      s.coordinates = c === null || c === undefined ? null : Float32Array.from(c.map(num));
      return s;
    });
  }
}
const symOut = (s) => [String(s), s.imageCoordinates === null ? null : [s.imageCoordinates[0], s.imageCoordinates[1]]];
function voicesDiff(voices, want) {
  if (voices.length !== want.length) return 'voice count ' + voices.length + ' vs ' + want.length;
  for (let v = 0; v < want.length; v++) {
    if (voices[v].length !== want[v].length) return 'voice ' + v + ' length ' + voices[v].length + ' vs ' + want[v].length;
    for (let i = 0; i < want[v].length; i++) {
      const a = symOut(voices[v][i]), b = want[v][i];
      if (a[0] !== b[0]) return 'voice ' + v + ' #' + i + ' ' + a[0] + ' vs ' + b[0];
      if (!eqArr(a[1], b[1])) return 'voice ' + v + ' #' + i + ' image_coordinates ' + show(a[1]) + ' vs ' + show(b[1]);
    }
  }
  return '';
}
function xmlOf(voices) { return MX.toXmlString(MX.generateXml(new MX.XmlGeneratorArguments(false, null, null), voices, '')); }

async function syntheticParse(doc, pagesData) {
  for (const c of doc.parse) {
    const pd = pagesData[c.page];
    if (!pd) { H.skip('parse ' + c.name + ': page ' + c.page + ' not loaded'); continue; }
    const pool = pd.multi.flatMap((m) => m.staffs);
    const multi = c.systems.map((row) => new OMR.model.MultiStaff(row.map(([idx, g]) => {
      const s = Object.assign(Object.create(Object.getPrototypeOf(pool[idx])), pool[idx]); // copy.copy
      s.isGrandstaff = g;
      return s;
    }), []));
    const stub = new StubInference(c.stubs, c.empty);
    SPT._setInference(stub);
    let mapping;
    if (c.mapping) mapping = PM.chain(PM.undoResize(c.mapping.before, c.mapping.after), PM.undoCrop(c.mapping.crop[0], c.mapping.crop[1]));
    let r;
    try {
      r = await SP.parseStaffs(debugFor(pd.image), multi, pd.image, OMR.transformer_configs.defaultConfig, c.selected, mapping);
      r = { value: r };
    } catch (e) { r = { raises: e.pyType || e.name, message: e.message }; }
    SPT._setInference(null);
    const imgsOk = stub.images.length === c.images.length && stub.images.every((im, i) => sameInfo(im, c.images[i]));
    let why = '';
    if (c.raises) why = r.raises === c.raises ? '' : 'expected ' + c.raises + ', got ' + (r.raises || 'voices');
    else if (r.raises) why = r.raises + ': ' + r.message;
    else why = voicesDiff(r.value, c.voices);
    H.ok(!why && imgsOk, 'parse_staffs (stub transformer) ' + c.name + ': ' + stub.images.length + ' staff images' + (imgsOk ? '' : ' DIFFER') + ', ' +
      (c.voices ? c.voices.length + ' voices [' + c.voices.map((v) => v.length).join(', ') + '] incl. image_coordinates' : c.raises) + (why ? ' -- ' + why : ''));
  }
}

// =============================================================================================
// audit: 40-read-audit.json (tools/omr/dump_read_audit.py), the adversarial audit's regression set.
// Each group failed on the code before the audit: the debug drawing of prepare_staff_image used the
// first crop's corner instead of the second (Python rebinds top_left), remove_black_contours on an
// empty image did not raise homr's TypeError (cv2.threshold returns None), and ConvertToArray did
// the float32 image's division by 255 in float64.
const pyErr = (r, want) => !!r.raises && (r.raises === want.raises || (r.raises === 'cv2.error' && want.raises === 'error')) && r.message === want.message;
async function audit() {
  const file = path.join(H.FIX, '40-read-audit.json');
  if (!fs.existsSync(file)) { H.skip('no 40-read-audit.json (run tools/omr/dump_read_audit.py)'); return; }
  const doc = H.readJson(file);
  const M = OMR.model, BB = OMR.bounding_boxes;
  const page = synImage(doc.page.h, doc.page.w, 1, doc.page.seed);
  const staffs = {};
  for (const k of Object.keys(doc.staffs)) {
    const s = doc.staffs[k];
    const st = new M.Staff(s.grid.map((p) => R.staffPoint(OMR, p)));
    st.symbols = s.symbols.map((x) => new M[x.type](new BB.BoundingBox(x.box, new Int32Array(0), -1)));
    staffs[k] = st;
  }
  // dump_read_audit.py's img_info, keys in its order (the debug image lists are compared as JSON)
  const info = (img) => ({ shape: imgInfo(img).shape, dtype: np.dtypeOf(img), sha1: sha1(img) });
  const capDebug = (on) => {
    const d = new OMR.debug.Debug(page, 'x.png', on);
    d.caps = [];
    d.writeImageWithFixedSuffix = (suffix, image) => d.caps.push([suffix, info(image)]);
    return d;
  };
  const capShow = (caps) => show(caps.map((x) => [x[0], x[1].sha1.slice(0, 8)]));

  // -- prepare_staff_image --
  let n = 0, okN = 0, first = '', capN = 0, capOk = 0, raisesN = 0;
  for (const c of doc.prep) {
    n++;
    const regions = new OMR.staff_regions.StaffRegions(c.names.map((nm) => new M.MultiStaff([staffs[nm]], [])));
    const d = capDebug(c.debug);
    const r = raises(() => watch('prepareStaffImage', () => SP.prepareStaffImage(d, c.index, staffs[c.staff], page, regions)));
    const bad = [];
    if (c.raises) {
      raisesN++;
      if (!pyErr(r, c)) bad.push('raises ' + (r.raises || 'nothing') + ' "' + String(r.message).slice(0, 80) + '" vs ' + c.raises + ' "' + c.message.slice(0, 80) + '"');
    } else if (r.raises) bad.push('JS raises ' + r.raises + ': ' + r.message);
    else {
      const [img, t, toPage] = r.value;
      if (!sameInfo(img, c.canvas)) bad.push('canvas');
      if (!eqArr(t.grid.map((p) => [p.x, p.y]), c.t_grid)) bad.push('transformed staff grid');
      if (!eqf(t.averageUnitSize, num(c.t_unit)) || t.isGrandstaff !== c.t_grand) bad.push('transformed staff unit size / is_grandstaff');
      for (const [p, want] of c.to_page) { const got = toPage(p.map(num)); if (!eqArr(got, want)) bad.push('to_page ' + show(p) + ' ' + show(got) + ' vs ' + show(want)); }
    }
    capN += c.caps.length;
    d.caps.forEach((x, i) => { if (c.caps[i] && show(x) === show(c.caps[i])) capOk++; });
    if (show(d.caps) !== show(c.caps)) bad.push('debug images ' + capShow(d.caps) + ' vs ' + capShow(c.caps));
    if (!bad.length) okN++; else if (!first) first = c.layout + '/' + c.staff + (c.debug ? ' (debug)' : '') + ': ' + bad.join('; ').slice(0, 300);
  }
  H.ok(okN === n && capOk === capN, 'audit prepare_staff_image on a synthetic page (edges, below the page, overlapping staffs, grand / steep / curved / sparse / short staffs; ' +
    'debug off and on): ' + okN + '/' + n + ' calls exact (canvas, transformed staff, staff_to_page; ' + raisesN + ' raise cv2.error like homr), ' +
    capOk + '/' + capN + ' debug images identical' + (first ? ' -- ' + first : ''));

  // -- parse_staffs with debug on (the _output images: circles + "i: rhythm" at the attention points) --
  {
    const pd = doc.parse_debug;
    let k = 0;
    SPT._setInference({
      predict: () => {
        const [toks, coords] = pd.calls[k++ % pd.calls.length];
        return toks.map((t, j) => { const s = V.EncodedSymbol.fromString(t); s.coordinates = coords[j] === null ? null : Float32Array.from(coords[j].map(num)); return s; });
      }
    });
    const multi = pd.systems.map((row) => new M.MultiStaff(row.map((nm) => staffs[nm]), []));
    for (const g of pd.grand) staffs[g].isGrandstaff = true;
    const d = capDebug(true);
    let voices = null, err = '';
    try { voices = await SP.parseStaffs(d, multi, page, OMR.transformer_configs.defaultConfig, -1); } catch (e) { err = (e.pyType || e.name) + ': ' + e.message; } finally {
      SPT._setInference(null);
      for (const g of pd.grand) staffs[g].isGrandstaff = false;
    }
    const why = err || voicesDiff(voices, pd.voices);
    const capsOk = show(d.caps) === show(pd.caps);
    H.ok(!why && capsOk, 'audit parse_staffs with debug on (stub transformer, a hidden staff, a grand staff): voices exact, ' + d.caps.length + ' debug images ' +
      (capsOk ? 'identical' : 'DIFFER') + (why ? ' -- ' + why : '') + (capsOk ? '' : ' -- ' + capShow(d.caps) + ' vs ' + capShow(pd.caps)));
  }

  // -- the canvas helpers on empty / 1-pixel images --
  {
    let m = 0, ok = 0, f = '';
    for (const c of doc.canvas) {
      const img = np.full([c.h, c.w], 77, 'uint8');
      const got = {
        size: raises(() => SP.getTrOmrCanvasSize([c.h, c.w])),
        black: raises(() => info(watch('removeBlackContoursAtEdgesOfImage', () => SP.removeBlackContoursAtEdgesOfImage(np.clone(img), 2.0)))),
        center: raises(() => info(watch('centerImageOnCanvas', () => SP.centerImageOnCanvas(img, [1280, 256])))),
        add: raises(() => info(watch('addImageIntoTrOmrCanvas', () => SP.addImageIntoTrOmrCanvas(img))))
      };
      for (const k of Object.keys(got)) {
        m++;
        const g = got[k], w = c[k];
        if (w.raises ? pyErr(g, w) : (!g.raises && show(g.value) === show(w.value))) ok++;
        else if (!f) f = c.h + 'x' + c.w + ' ' + k + ': ' + show(g).slice(0, 120) + ' vs ' + show(w).slice(0, 120);
      }
    }
    H.ok(ok === m, 'audit get_tr_omr_canvas_size / remove_black_contours / center_image_on_canvas / add_image_into_tr_omr_canvas on empty and 1-pixel images ' +
      '(homr\'s TypeError / ZeroDivisionError / cv2.error or the image): ' + ok + '/' + m + (f ? ' -- ' + f : ''));
  }

  // -- ConvertToArray on non-uint8 images --
  {
    let ok = 0, f = '';
    const ctor = { uint8: Uint8Array, float32: Float32Array, float64: Float64Array, uint16: Uint16Array, int16: Int16Array };
    for (const c of doc.convert) {
      const x = S2S._transform.transform({ h: 4, w: 9, c: 1, data: ctor[c.dtype].from(c.in.map(num)) });
      if (x.data instanceof Float32Array && eqArr(x.dims, c.shape) && eqArr(x.data, c.out)) ok++; else if (!f) f = c.dtype;
    }
    H.ok(ok === doc.convert.length, 'audit ConvertToArray (staff2score._transform) on ' + doc.convert.map((c) => c.dtype).join(' / ') + ' images: ' + ok + '/' + doc.convert.length +
      ' exact' + (f ? ' -- differs: ' + f : ''));
  }
}

// =============================================================================================
// pages: rebuild the systems; prepare_staff_image step by step
function loadPage(page) {
  const doc = H.readJson(H.fix(page, '40-read-staffs.json'));
  const multi = R.multiStaffs(OMR, doc);
  const image = H.readPng(H.fix(page, '03-clahe.png'), { gray: true });
  return { doc, multi, image };
}

function checkRebuild(page, pd) {
  let n = 0, bad = '';
  pd.doc.multi_staffs.forEach((m, i) => m.staffs.forEach((s, j) => {
    n++;
    const d = R.staffDiff(pd.multi[i].staffs[j], s);
    if (d && !bad) bad = 'system ' + i + ' staff ' + j + ': ' + d;
  }));
  const imgOk = sameInfo(pd.image, pd.doc.image);
  H.ok(!bad && imgOk, page + ' rebuilt ' + pd.multi.length + ' systems / ' + n + ' staffs (min/max x/y, unit sizes identical), 03-clahe.png == the image parse_staffs reads' + (bad ? ' -- ' + bad : '') + (imgOk ? '' : ' -- image differs'));
}

// the staffs in parse_staffs' order (voice-major), with homr's running index i
function staffOrder(multi) {
  const n = py.max(multi.map((m) => m.staffs.length));
  const out = [];
  for (let voice = 0; voice < n; voice++) multi.forEach((row) => { if (voice < row.staffs.length) out.push(row.staffs[voice]); });
  return out;
}

function prepPage(page, pd) {
  const prep = H.readJson(H.fix(page, '40-read-prep.json')).calls;
  const staffs = staffOrder(pd.multi);
  const regions = new OMR.staff_regions.StaffRegions(pd.multi);
  const debug = debugFor(pd.image);
  const canvases = [];
  let stepsOk = 0, stepsN = 0, firstBad = '';
  let pngOk = 0, mapOk = 0, mapN = 0;
  const t0 = msNow();
  prep.forEach((rec, k) => {
    const staff = staffs[k];
    const bad = [];
    const chk = (cond, what) => { stepsN++; if (cond) stepsOk++; else bad.push(what); };
    // -- step by step (the same calls prepare_staff_image makes) --
    let region = SP._calculateRegion(staff, regions);
    chk(eqArr(region, rec.region), 'region ' + show(region) + ' vs ' + show(rec.region));
    const dims = SP.getTrOmrCanvasSize([region[3] - region[1], region[2] - region[0]]);
    chk(eqArr(dims, rec.image_dimensions), 'image_dimensions');
    let sf = dims[1] / (region[3] - region[1]);
    let img = watch('resize', () => cv2().resize(pd.image, [py.int(pd.image.w * sf), py.int(pd.image.h * sf)]));
    chk(sameInfo(img, rec.crops[0].input), 'resized page');
    region = region.map((v) => py.round(v * sf));
    const step1 = [region[0] - 10, region[1] - 50, region[2] + 10, region[3] + 50];
    chk(eqArr(step1, rec.crops[0].args), 'crop 1 args');
    let cr = OMR.image_utils.cropImageAndReturnNewTop(img, ...step1);
    chk(eqArr(cr[1], rec.crops[0].top_left) && sameInfo(cr[0], rec.crops[0].output), 'crop 1');
    img = cr[0];
    const step2 = [region[0] - cr[1][0], region[1] - cr[1][1], region[2] - cr[1][0], region[3] - cr[1][1]];
    const topLeft = [cr[1][0] / sf, cr[1][1] / sf];
    chk(eqArr(topLeft, rec.dewarp_staff_args.region) && sf === rec.dewarp_staff_args.scaling, '_dewarp_staff args');
    const st = SP._dewarpStaff(staff, null, topLeft, sf);
    chk(sameInfo(img, rec.dewarp_in), 'dewarp input');
    const so = DW.calculateSpanAndOptimalPoints(st, img);
    chk(eqArr(so[0], rec.span) && eqArr(so[1], rec.optimal), 'span / optimal points');
    const dw = watch('dewarpStaffImage', () => DW.dewarpStaffImage(img, st, k, debug));
    chk((dw.tform !== null) === rec.dewarp.ok, 'dewarp ok');
    if (dw.tform && rec.dewarp.ok) {
      const t = dw.tform;
      chk(eqArr(t.srcPoints, rec.dewarp.src) && eqArr(t.dstPoints, rec.dewarp.dst), 'src / dst points');
      let rect = cv2().boundingRect(Float32Array.from(t.srcPoints.flat()));
      rect = [rect[0] - 10, rect[1] - 10, rect[2] + 20, rect[3] + 20];
      const sub = new DW._Subdiv2D(rect);
      const ids = t.srcPoints.map((p) => sub.insert(p));
      chk(eqArr(rect, rec.dewarp.triangles.rect) && eqArr(ids, rec.dewarp.triangles.ids), 'Subdiv2D rect / insert ids');
      chk(eqArr(sub.getTriangleList(), rec.dewarp.triangles.list), 'Subdiv2D getTriangleList (' + rec.dewarp.triangles.list.length + ' triangles, in order)');
      chk(eqArr(t.triangulation.simplices, rec.dewarp.simplices), 'simplices');
      chk(eqArr(t.affineMatrices, rec.dewarp.mats), 'affine matrices');
    }
    img = watch('dewarp', () => dw.dewarp(img));
    chk(sameInfo(img, rec.dewarped), 'dewarped image');
    cr = OMR.image_utils.cropImageAndReturnNewTop(img, ...step2);
    chk(eqArr(step2, rec.crops[1].args) && eqArr(cr[1], rec.crops[1].top_left) && sameInfo(cr[0], rec.crops[1].output), 'crop 2');
    img = cr[0];
    chk(sameInfo(img, rec.black.input), 'black contours input');
    img = watch('removeBlackContoursAtEdgesOfImage', () => SP.removeBlackContoursAtEdgesOfImage(img, st.averageUnitSize));
    chk(st.averageUnitSize === rec.black.unit && sameInfo(img, rec.black.output), 'black contours output (' + rec.black.changed + ' pixels changed)');
    // -- the real function --
    const out = watch('prepareStaffImage', () => SP.prepareStaffImage(debug, k, staff, pd.image, regions));
    const canvas = out[0];
    chk(sameInfo(canvas, rec.canvas), 'canvas');
    const want = H.readPng(H.fix(page, '09-staff-' + String(k).padStart(2, '0') + '.png'), { gray: true });
    const pngSame = H.cmpImg(canvas, want).same;
    if (pngSame) pngOk++;
    chk(pngSame, '09-staff png');
    // the returned staff (the transformed one parse_staff_tromr receives)
    const tg = out[1].grid, wg = rec.staff_t.grid;
    chk(tg.length === wg.length && tg.every((p, i) => eqf(p.x, num(wg[i].x)) && eqArr(p.y, wg[i].y) && eqf(p.angle, num(wg[i].angle))) &&
      out[1].isGrandstaff === rec.staff_t.is_grandstaff && eqf(out[1].averageUnitSize, num(rec.staff_t.average_unit_size)), 'transformed staff');
    for (const [p, want2] of rec.to_page) {
      mapN++;
      const got = out[2](p.map(num));
      if (eqArr(got, want2)) mapOk++; else bad.push('to_page ' + show(p) + ' ' + show(got) + ' vs ' + show(want2));
    }
    canvases.push(canvas);
    if (bad.length && !firstBad) firstBad = 'staff ' + k + ': ' + bad.slice(0, 3).join('; ');
  });
  H.ok(stepsOk === stepsN && mapOk === mapN, page + ' prepare_staff_image x ' + prep.length + ': ' + stepsOk + '/' + stepsN + ' steps exact (region, resize, crops, ' +
    'span/optimal points, Subdiv2D triangles in order, simplices, affine matrices, dewarped image, black contours, transformed staff), ' +
    'staff_to_page ' + mapOk + '/' + mapN + ' points (' + Math.round(msNow() - t0) + ' ms)' + (firstBad ? ' -- ' + firstBad : ''));
  H.ok(pngOk === prep.length, page + ' transformer input == 09-staff-NN.png byte for byte: ' + pngOk + '/' + prep.length);
  return canvases;
}

// parse_staffs with a stub transformer that answers Python's own tokens + attention
async function stubPage(page, pd, mode, want) {
  const calls = want.calls;
  const stubs = calls.map((c) => [c.tokens, c.coords]);
  const stub = new StubInference(stubs, []);
  SPT._setInference(stub);
  const progress = [];
  let voices;
  try {
    voices = await SP.parseStaffs(debugFor(pd.image), pd.multi, pd.image, OMR.transformer_configs.defaultConfig, -1, PM.identity,
      { onProgress: (i, n) => progress.push([i, n]) });
  } finally { SPT._setInference(null); }
  const why = voicesDiff(voices, want.voices);
  const xml = xmlOf(voices);
  const progOk = progress.length === calls.length + 1 && progress.every((p, i) => p[0] === i && p[1] === calls.length);
  H.ok(!why && stub.k === calls.length && progOk, page + ' parse_staffs with Python\'s ' + mode + ' tokens: ' + voices.length + ' voices [' +
    voices.map((v) => v.length).join(', ') + '] strings + image_coordinates exact, onProgress ' + progress.length + ' calls' + (why ? ' -- ' + why : '') + (progOk ? '' : ' -- progress ' + show(progress).slice(0, 80)));
  H.ok(xml === want.xml, page + ' generate_xml of those voices == ' + mode + ' MusicXML (' + xml.length + ' chars)' + (xml === want.xml ? '' : ' -- first diff at ' + firstDiff(xml, want.xml)));
  return voices;
}
function firstDiff(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i + ': ' + JSON.stringify(a.slice(Math.max(0, i - 40), i + 40)) + ' vs ' + JSON.stringify(b.slice(Math.max(0, i - 40), i + 40));
}

// =============================================================================================
// models

// the models through OMR.runtime: the repo's models/omr parts when generated
// (tools/omr/split_models.py), else a one-part-per-model manifest over SL_OMR_MODELS
function runtimeReadFile() {
  if (fs.existsSync(path.join(H.ROOT, 'models', 'omr', 'manifest.json'))) return (p) => fs.readFileSync(path.join(H.ROOT, p));
  const files = { segnet: 'segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f.onnx', encoder: 'encoder_' + MODEL_NAME + '.onnx', decoder: 'decoder_' + MODEL_NAME + '.onnx' };
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

// the shipping models in SL_OMR_MODELS must be what OMR.runtime serves (repo parts or the dir)
function checkModelSource() {
  const mf = path.join(H.ROOT, 'models', 'omr', 'manifest.json');
  if (!fs.existsSync(mf)) return 'SL_OMR_MODELS';
  const man = H.readJson(mf);
  const bad = [];
  for (const k of ['encoder', 'decoder']) {
    const p = path.join(H.MODELS, k + '_' + MODEL_NAME + '.onnx');
    if (!fs.existsSync(p)) continue;
    const sha = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    if (!man.models[k] || man.models[k].sha256 !== sha) bad.push(k);
  }
  H.ok(!bad.length, 'models/omr/manifest.json serves the same encoder / decoder as SL_OMR_MODELS' + (bad.length ? ' -- differ: ' + bad.join(', ') : ''));
  return 'models/omr parts';
}

// token agreement of two staffs: positional (same index) and by edit distance (Levenshtein over
// whole tokens; agreement = n - edits), plus the first index where they differ
function tokenAgreement(js, py) {
  const n = Math.max(js.length, py.length);
  let same = 0, firstDiv = -1;
  for (let i = 0; i < n; i++) {
    if (js[i] === py[i]) same++;
    else if (firstDiv < 0) firstDiv = i;
  }
  let prev = Array.from({ length: py.length + 1 }, (x, j) => j);
  for (let i = 1; i <= js.length; i++) {
    const cur = [i];
    for (let j = 1; j <= py.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (js[i - 1] === py[j - 1] ? 0 : 1));
    prev = cur;
  }
  return { same, n, firstDiv, edits: prev[py.length] };
}
const FIELDS = ['rhythm', 'pitch', 'lift', 'articulation', 'slur', 'position'];
// A divergence is a NEAR TIE when, at the first differing token, every head whose token differs
// had a top-2 logit margin below this in Python's own run: float noise of the int8 kernels (WASM
// vs MLAS) can flip it. A divergence at a confident step would point to a port bug.
const NEAR_TIE = 1.0;

// a recording wrapper around a Staff2Score: per predict the image, input sha1, tokens, attention,
// per-step argmax / margins (through the decoder's onStep) and timings
class Recorder {
  // ctxFile(k): Python's encoder output of call k (41-read-ctx-*.bin) to measure the JS encoder against
  constructor(inner, ctxFile) { this.inner = inner; this.calls = []; this.ctxFile = ctxFile; }
  async predict(image) {
    const x = S2S._transform.transform(image);
    const rec = { image, x: sha1(x.data), steps: [] };
    const k = this.calls.length;
    this.calls.push(rec);
    const dec = this.inner.decoder, gen = dec.generate;
    dec.generate = function (a, b, kw) { return gen.call(this, a, b, Object.assign({}, kw, { onStep: (o) => rec.steps.push(stepInfo(o)) })); };
    const enc = this.inner.encoder, egen = enc.generate, file = this.ctxFile && this.ctxFile(k);
    enc.generate = async function (xx) {
      const out = await egen.call(this, xx);
      if (file && fs.existsSync(file)) {
        const want = readCtx(file).data;
        let maxd = 0, sum = 0, same = 0;
        for (let i = 0; i < want.length; i++) { const d = Math.abs(out.data[i] - want[i]); if (d > maxd) maxd = d; sum += d; if (d === 0) same++; }
        rec.ctx = { maxd, mean: sum / want.length, same: same / want.length };
      }
      return out;
    };
    let out;
    try { out = await this.inner.predict(image); } finally { delete dec.generate; delete enc.generate; }
    rec.tokens = out.map(String);
    rec.coords = out.map((s) => s.coordinates === null ? null : Array.from(s.coordinates));
    rec.encMs = this.inner.lastEncoderSecs * 1000;
    rec.decMs = this.inner.lastDecoderSecs * 1000;
    rec.nSteps = this.inner.lastSteps;
    return out;
  }
}

function readCtx(file) {
  const b = fs.readFileSync(file);
  const f = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  return { data: f, dims: [1, f.length / 512, 512] };
}

function quantiles(v) {
  if (!v.length) return 'n/a';
  const s = Float64Array.from(v).sort();
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return 'median ' + q(0.5).toFixed(2) + ', p95 ' + q(0.95).toFixed(2) + ', max ' + s[s.length - 1].toFixed(2);
}

// a decoder step's argmax (symbol order), top-2 margin per head (dump_read.py's order) and attention
const HEADS = ['out_rhythms', 'out_pitchs', 'out_lifts', 'out_articulations', 'out_slurs', 'out_positions'];
function stepInfo(o) {
  const margin = HEADS.map((name) => {
    const t = o.outputs[name], v = t.dims[t.dims.length - 1], d = t.data.subarray(t.data.length - v);
    const i1 = np.argmax(d);
    let m2 = -Infinity;
    for (let i = 0; i < d.length; i++) if (i !== i1 && d[i] > m2) m2 = d[i];
    return d[i1] - m2;
  });
  return { arg: o.arg, att: Array.from(o.att), margin };
}

async function modelsSection(pagesList, pagesData, opts) {
  const tag = opts.tag;
  const want = (page) => H.readJson(H.fix(page, '40-read-' + opts.mode + '.json'));
  const config = OMR.transformer_configs.defaultConfig;
  let s2s;
  const tc = msNow();
  if (opts.encoderSession) s2s = await S2S.Staff2Score.create(config, { encoder: { session: opts.encoderSession, ort: opts.ort } });
  else s2s = await S2S.Staff2Score.create(config, { encoder: { ep: 'wasm' } });
  const createMs = msNow() - tc;
  const T = { staffs: 0, staffsSame: 0, tok: 0, tokSame: 0, edits: 0, tok10: 0, edits10: 0, staffs10Same: 0, encMs: 0, decMs: 0, steps: 0,
    divergences: [], pagesExact: 0, pages: 0, imgposDiff: 0, imgposN: 0, coordPx: [] };
  for (const page of pagesList) {
    const pd = pagesData[page];
    const w = want(page);
    const t10 = H.readJson(H.fix(page, '10-tokens.json'));
    // ---- the decoder alone, fed with Python's encoder output ----
    // The decoder port must reproduce Python's tokens and every head's argmax at every step; the
    // logits / attention carry float noise of the int8 kernels (onnxruntime-web WASM vs onnxruntime
    // CPU MLAS: ~1e-6 per step on identical inputs, accumulated through the KV cache).
    if (!SKIP.has('decoder') && opts.decoderCheck) {
      let same = 0, n = 0, argOk = 0, argN = 0, marginAbs = 0, minMargin = Infinity, firstBad = '';
      const attPx = [];
      for (let k = 0; k < w.calls.length; k++) {
        const ctxFile = H.fix(page, '41-read-ctx-' + opts.mode + '-' + String(k).padStart(2, '0') + '.bin');
        if (!fs.existsSync(ctxFile)) continue;
        const ctx = readCtx(ctxFile);
        const steps = [];
        const symbols = await s2s.decoder.generate([[1]], [[0]], { context: ctx, onStep: (o) => steps.push(stepInfo(o)) });
        const toks = symbols.map(String);
        n++;
        const c = w.calls[k];
        if (show(toks) === show(c.tokens)) same++;
        else if (!firstBad) firstBad = 'call ' + k + ' token ' + tokenAgreement(toks, c.tokens).firstDiv;
        for (let i = 0; i < Math.min(steps.length, c.steps.length); i++) {
          argN++;
          if (show(steps[i].arg) === show(c.steps[i].arg)) argOk++;
          const att = steps[i].att, watt = c.steps[i].att;
          attPx.push(Math.hypot(att[0] - watt[0], att[1] - watt[1]));
          for (let j = 0; j < 6; j++) {
            marginAbs = Math.max(marginAbs, Math.abs(steps[i].margin[j] - c.steps[i].margin[j]));
            minMargin = Math.min(minMargin, c.steps[i].margin[j]);
          }
        }
      }
      if (n) {
        H.ok(same === n && argOk === argN, page + ' ' + tag + ' decoder alone on Python\'s ' + opts.mode + ' encoder output: ' + same + '/' + n +
          ' staffs identical tokens, ' + argOk + '/' + argN + ' steps identical argmax x 6 heads (smallest Python top-2 margin ' + minMargin.toFixed(3) + ')' + (firstBad ? ' -- ' + firstBad : ''));
        console.log('INFO ' + page + ' ' + tag + ' decoder alone: top-2 logit margins max |diff| ' + marginAbs.toFixed(3) + ', attention distance to Python\'s (canvas px) ' + quantiles(attPx));
      }
    }
    if (SKIP.has('full')) continue;
    // ---- the whole stage: parse_staffs with the JS Staff2Score ----
    const recd = new Recorder(s2s, (k) => H.fix(page, '41-read-ctx-' + opts.mode + '-' + String(k).padStart(2, '0') + '.bin'));
    SPT._setInference(recd);
    let voices;
    const t0 = msNow();
    try {
      voices = await SP.parseStaffs(debugFor(pd.image), pd.multi, pd.image, config, -1, PM.identity);
    } finally { SPT._setInference(null); }
    const secs = (msNow() - t0) / 1000;
    let xOk = 0, staffsSame = 0, tok = 0, tokSame = 0, edits = 0, staffs10 = 0, tok10 = 0, edits10 = 0, confident = '';
    const lines = [];
    recd.calls.forEach((r, k) => {
      const c = w.calls[k] || { tokens: [], steps: [], x: {} };
      if (r.x === c.x.sha1) xOk++;
      const a = tokenAgreement(r.tokens, c.tokens);
      tok += c.tokens.length; tokSame += a.same; edits += a.edits;
      if (a.edits === 0 && r.tokens.length === c.tokens.length) staffsSame++;
      else {
        // the first divergence: which heads differ, Python's and the JS run's margins there
        const i = a.firstDiv, jt = (r.tokens[i] || '').split(' '), pt = (c.tokens[i] || '').split(' ');
        const heads = FIELDS.map((f, h) => h).filter((h) => jt[h] !== pt[h]);
        const pm = c.steps[i] ? heads.map((h) => c.steps[i].margin[h]) : [];
        const jm = r.steps[i] ? heads.map((h) => r.steps[i].margin[h]) : [];
        const nearTie = pm.length > 0 && pm.every((m) => m < NEAR_TIE);
        const d = { page, staff: k, index: i, js: r.tokens[i] || '(end)', py: c.tokens[i] || '(end)', heads: heads.map((h) => FIELDS[h]), pyMargin: pm, jsMargin: jm, edits: a.edits, tokens: c.tokens.length, nearTie };
        T.divergences.push(d);
        if (!nearTie && !confident) confident = 'staff ' + k + ' token ' + i + ' ' + d.js + ' vs ' + d.py + ' (Python margin ' + pm.map((m) => m.toFixed(3)).join('/') + ')';
      }
      const b = tokenAgreement(r.tokens, t10.calls[k] || []);
      tok10 += (t10.calls[k] || []).length; edits10 += b.edits;
      if (b.edits === 0 && r.tokens.length === (t10.calls[k] || []).length) staffs10++;
      const perTok = r.decMs / Math.max(1, r.nSteps);
      T.encMs += r.encMs; T.decMs += r.decMs; T.steps += r.nSteps;
      lines.push('#' + k + ' enc ' + Math.round(r.encMs) + ' ms, dec ' + perTok.toFixed(1) + ' ms/token x ' + r.nSteps +
        (a.edits === 0 ? '' : ', ' + a.edits + ' token edit(s) vs Python, first at ' + a.firstDiv + ': ' + (r.tokens[a.firstDiv] || '(end)') + ' vs ' + (c.tokens[a.firstDiv] || '(end)')));
    });
    T.staffs += recd.calls.length; T.staffsSame += staffsSame; T.tok += tok; T.tokSame += tokSame; T.edits += edits;
    T.tok10 += tok10; T.edits10 += edits10; T.staffs10Same += staffs10; T.pages++;
    H.ok(xOk === w.calls.length && recd.calls.length === w.calls.length, page + ' ' + tag + ' encoder input (ConvertToArray, float32) sha1 == Python\'s: ' + xOk + '/' + w.calls.length);
    console.log('INFO ' + page + ' ' + tag + ' per staff: ' + lines.join('; '));
    const cs = recd.calls.filter((r) => r.ctx);
    if (cs.length) {
      const mx = Math.max(...cs.map((r) => r.ctx.maxd)), mean = cs.reduce((a, r) => a + r.ctx.mean, 0) / cs.length;
      const eq = cs.reduce((a, r) => a + r.ctx.same, 0) / cs.length;
      T.ctxMax = Math.max(T.ctxMax || 0, mx); (T.ctxMeans = T.ctxMeans || []).push(mean);
      console.log('INFO ' + page + ' ' + tag + ' encoder output vs Python\'s (' + cs.length + ' staffs, 655360 floats each): max |diff| ' + mx.toExponential(2) +
        ', mean |diff| ' + mean.toExponential(2) + ', bit-equal ' + (100 * eq).toFixed(1) + ' %');
    }
    const allSame = staffsSame === recd.calls.length;
    H.ok(!confident, page + ' ' + tag + ' tokens vs Python ' + opts.mode + ' (onnxruntime CPU): ' + staffsSame + '/' + recd.calls.length + ' staffs identical, ' +
      (tok - edits) + '/' + tok + ' tokens (edit distance ' + edits + ')' + (allSame ? '' : '; every divergence starts at a near tie (Python top-2 margin < ' + NEAR_TIE + ')') +
      ' (' + secs.toFixed(1) + ' s)' + (confident ? ' -- divergence at a confident step: ' + confident : ''));
    console.log('INFO ' + page + ' ' + tag + ' tokens vs 10-tokens.json (Python fp16 models, dump_stages): ' + staffs10 + '/' + recd.calls.length + ' staffs identical, ' + (tok10 - edits10) + '/' + tok10 + ' tokens');
    const strSame = voices.length === w.voices.length && voices.every((v, i) => show(v.map(String)) === show(w.voices[i].map((x) => x[0])));
    if (allSame) {
      T.pagesExact++;
      // same tokens -> the same voices; the image coordinates come from the attention, which moves
      // with the encoder's float noise: reported in page pixels, and the XML must be equal apart
      // from the imgpos comments
      const px = [];
      let nullBad = '';
      voices.forEach((v, i) => v.forEach((s, j) => {
        const a = s.imageCoordinates, b = w.voices[i] && w.voices[i][j] ? w.voices[i][j][1] : null;
        if ((a === null) !== (b === null)) { nullBad = nullBad || 'voice ' + i + ' #' + j; return; }
        if (a) px.push(Math.hypot(a[0] - b[0], a[1] - b[1]));
      }));
      T.coordPx.push(...px);
      H.ok(strSame && !nullBad, page + ' ' + tag + ' voices == Python ' + opts.mode + ' voices (' + voices.map((v) => v.length).join(', ') + ' symbols, strings exact; ' +
        'image_coordinates distance in page px ' + quantiles(px) + ')' + (nullBad ? ' -- image_coordinates presence differs at ' + nullBad : ''));
      const xml = xmlOf(voices);
      const strip = (x) => x.replace(/<!-- imgpos: [^>]*-->/g, '<!-- imgpos -->');
      const ia = xml.match(/<!-- imgpos: [^>]*-->/g) || [], ib = w.xml.match(/<!-- imgpos: [^>]*-->/g) || [];
      const nDiff = ia.filter((x, i) => x !== ib[i]).length;
      T.imgposDiff += nDiff; T.imgposN += ib.length;
      H.ok(strip(xml) === strip(w.xml), page + ' ' + tag + ' MusicXML == Python ' + opts.mode + (xml === w.xml ? ' byte for byte' : ' apart from ' + nDiff + ' of ' + ib.length + ' imgpos comments (rounded attention positions)'));
    } else {
      let nd = 0;
      voices.forEach((v, i) => { nd += tokenAgreement(v.map(String), (w.voices[i] || []).map((x) => x[0])).edits; });
      // what the divergence changes downstream: the MusicXML (without the imgpos comments) and the
      // MIDI the SheetLab engine writes from it (OMR.midi, tempo 112)
      const xml = xmlOf(voices), strip = (x) => x.replace(/<!--[^>]*-->/g, '');
      let midiNote = '';
      if (OMR.midi && OMR.midi.fromMusicXml) {
        try {
          const ma = OMR.midi.fromMusicXml(xml, { tempo: 112 }), mb = OMR.midi.fromMusicXml(w.xml, { tempo: 112 });
          midiNote = ', MIDI ' + (ma.length === mb.length && ma.every((v, i) => v === mb[i]) ? 'byte-identical' : 'differs');
        } catch (e) { midiNote = ', MIDI: ' + e.message; }
      }
      console.log('INFO ' + page + ' ' + tag + ' voices: ' + (strSame ? 'strings identical to Python ' + opts.mode : 'differ from Python ' + opts.mode + ' after the token divergence (edit distance ' + nd + ')') +
        '; MusicXML apart from imgpos comments ' + (strip(xml) === strip(w.xml) ? 'identical' : 'differs') + midiNote);
    }
  }
  return { totals: T, createMs, s2s };
}

// staff_parsing_tromr's own path: no injected Staff2Score -> predict_best creates one through
// OMR.runtime (Encoder.create defaults to 'wasm', get_decoder), keeps it, filters the positions
async function defaultPath(pagesList, pagesData) {
  if (SKIP.has('full') || !pagesList.length) return;
  const page = pagesList.includes('belle-p1') ? 'belle-p1' : pagesList[0];
  const pd = pagesData[page], w = H.readJson(H.fix(page, '40-read-ship.json'));
  const staffs = staffOrder(pd.multi), k = staffs.findIndex((s) => !s.isGrandstaff) >= 0 ? staffs.findIndex((s) => !s.isGrandstaff) : 0;
  const prep = SP.prepareStaffImage(debugFor(pd.image), k, staffs[k], pd.image, new OMR.staff_regions.StaffRegions(pd.multi));
  SPT._setInference(null);
  SPT.configure({});
  const t0 = msNow();
  const r1 = await SPT.parseStaffTromr(prep[1], prep[0], OMR.transformer_configs.defaultConfig);
  const made = SPT._getInference();
  const r2 = await SPT.predictBest(prep[0], prep[1], OMR.transformer_configs.defaultConfig);
  const want = w.calls[k].tokens.filter((t) => prep[1].isGrandstaff || V.isUpperOrHasNoPosition(t.split(' ')[5]));
  H.ok(made instanceof S2S.Staff2Score && SPT._getInference() === made && show(r1.map(String)) === show(want) && show(r2.map(String)) === show(want),
    page + ' staff ' + k + ' through staff_parsing_tromr\'s own Staff2Score (created once via OMR.runtime, wasm): ' + r1.length + ' symbols == Python\'s, ' +
    (prep[1].isGrandstaff ? 'grand staff (all positions)' : 'single staff (upper / no position only: ' + (w.calls[k].tokens.length - want.length) + ' dropped)') + ' (' + Math.round(msNow() - t0) + ' ms for 2 calls)');
  SPT._setInference(null);
}

function report(label, r) {
  const t = r.totals;
  if (!t.staffs) return;
  console.log('INFO ' + label + ': ' + t.staffsSame + '/' + t.staffs + ' staffs token-identical to Python, ' + (t.tok - t.edits) + '/' + t.tok +
    ' tokens (' + (100 * (t.tok - t.edits) / t.tok).toFixed(3) + ' %, edit distance ' + t.edits + '); pages with identical voices ' + t.pagesExact + '/' + t.pages +
    '; vs 10-tokens.json (fp16) ' + t.staffs10Same + '/' + t.staffs + ' staffs, ' + (t.tok10 - t.edits10) + '/' + t.tok10 + ' tokens');
  if (t.divergences.length) {
    console.log('INFO ' + label + ' divergences: ' + t.divergences.map((d) => d.page + ' staff ' + d.staff + ' token ' + d.index + ' ' + d.heads.join('+') + ' ' +
      d.js + ' vs ' + d.py + ' (Python margin ' + d.pyMargin.map((m) => m.toFixed(3)).join('/') + ', JS margin ' + d.jsMargin.map((m) => m.toFixed(3)).join('/') + ', ' +
      d.edits + ' edit(s) in ' + d.tokens + ' tokens)').join('; '));
  }
  if (t.ctxMeans) console.log('INFO ' + label + ' encoder output vs Python onnxruntime CPU: max |diff| ' + t.ctxMax.toExponential(2) + ', mean |diff| per page ' + t.ctxMeans.map((m) => m.toExponential(1)).join(' / '));
  if (t.imgposN) console.log('INFO ' + label + ' imgpos comments (pages with identical tokens): ' + t.imgposDiff + '/' + t.imgposN + ' differ; image_coordinates distance in page px ' + quantiles(t.coordPx));
  console.log('INFO ' + label + ' timing (Node, onnxruntime-web wasm, 1 thread): encoder ' + Math.round(t.encMs / t.staffs) + ' ms/staff, decoder ' + (t.decMs / t.steps).toFixed(1) +
    ' ms/token (' + t.steps + ' steps incl. EOS), sessions ' + Math.round(r.createMs) + ' ms');
}

// =============================================================================================
async function main() {
  const cv = await H.cv();
  trackLeaks(cv);
  OMR.simple_logging.sink = null;
  let synDoc = null;
  if (!SKIP.has('synthetic')) synDoc = synthetic();
  if (!SKIP.has('audit')) await audit();

  let pagesList = H.pages().filter((p) => H.has(p, '40-read-staffs.json') && H.has(p, '40-read-prep.json'));
  if (ONLY.length) pagesList = pagesList.filter((p) => ONLY.includes(p));
  if (!pagesList.length) { H.skip('read parity: no page fixtures (run tools/omr/dump_read.py)'); finish(); return; }
  const pagesData = {};
  for (const page of pagesList) {
    pagesData[page] = loadPage(page);
    checkRebuild(page, pagesData[page]);
  }
  if (synDoc && !SKIP.has('stub')) {
    for (const p of ['belle-p1', 'no11-p1']) if (!pagesData[p] && H.has(p, '40-read-staffs.json')) pagesData[p] = loadPage(p);
    await syntheticParse(synDoc, pagesData);
  }
  for (const page of pagesList) {
    if (!SKIP.has('prep')) prepPage(page, pagesData[page]);
    if (!SKIP.has('stub')) {
      for (const mode of ['ship', 'fp16']) {
        if (H.has(page, '40-read-' + mode + '.json')) await stubPage(page, pagesData[page], mode, H.readJson(H.fix(page, '40-read-' + mode + '.json')));
      }
      // the fp16 run is dump_stages' own: its voices / XML are 10-tokens.json / 11-score.musicxml
      const t10 = H.readJson(H.fix(page, '10-tokens.json'));
      const w16 = H.has(page, '40-read-fp16.json') ? H.readJson(H.fix(page, '40-read-fp16.json')) : null;
      if (w16) {
        const x11 = fs.readFileSync(H.fix(page, '11-score.musicxml'), 'utf8');
        H.ok(show(w16.calls.map((c) => c.tokens)) === show(t10.calls) && show(w16.voices.map((v) => v.map((x) => x[0]))) === show(t10.voices) && w16.xml === x11,
          page + ' 40-read-fp16.json reproduces 10-tokens.json and 11-score.musicxml (so the stub run above == 10 / 11)');
      }
    }
  }

  // ---- models ----
  const haveModels = !!H.MODELS && fs.existsSync(H.MODELS);
  if (!haveModels) { H.skip('(no models) set SL_OMR_MODELS for the transformer checks'); finish(); return; }
  let ort;
  try { ort = H.ort(); } catch (e) { H.skip('onnxruntime-web not on NODE_PATH: ' + e.message); finish(); return; }
  OMR.runtime.configure({ readFile: runtimeReadFile(), ep: 'wasm' });
  const source = checkModelSource();
  const shipPages = pagesList.filter((p) => H.has(p, '40-read-ship.json'));
  const ship = await modelsSection(shipPages, pagesData, { tag: 'int8', mode: 'ship', decoderCheck: true });
  report('int8 encoder (shipping, ' + source + ')', ship);
  await defaultPath(shipPages, pagesData);

  const fp32 = process.env.SL_OMR_FP32_ENCODER;
  if (fp32 && fs.existsSync(fp32)) {
    const bytes = fs.readFileSync(fp32);
    const sess = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
    const r = await modelsSection(shipPages.filter((p) => H.has(p, '40-read-fp32enc.json')), pagesData,
      { tag: 'fp32enc', mode: 'fp32enc', decoderCheck: false, encoderSession: sess, ort });
    report('fp32 encoder (' + (bytes.length / 1e6).toFixed(1) + ' MB) + int8 decoder', r);
    if (sess.release) await sess.release();
  } else H.skip('fp32 encoder comparison: set SL_OMR_FP32_ENCODER=<encoder fp32 .onnx>');
  await OMR.runtime.release();
  finish();
}

function finish() {
  H.ok(!leaks.ops.size && leaks.inMade === leaks.inGone, 'no opencv.js object outlives the reading stage\'s calls (' + leaks.inMade + ' made, ' + leaks.inGone + ' deleted' +
    (leaks.ops.size ? '; leaking: ' + [...leaks.ops].join(', ') : '') + ')');
  H.done();
}

main().catch((e) => { console.log('FAIL exception: ' + (e && e.stack || e)); process.exit(1); });
