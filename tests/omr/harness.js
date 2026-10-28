// soundLAB OMR parity harness for Node (no browser): loads js/omr/*.js into
// globalThis.OMR, initialises opencv.js / onnxruntime-web, reads the Python
// reference fixtures (PNG, JSON) and prints PASS/FAIL lines like the other suites.
//   SL_OMR_FIXTURES  dir with <page>/NN-*.{png,json} (default tests/fixtures/omr)
//   SL_OMR_MODELS    dir with the three .onnx models + tokenizers (model suites skip without it)
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const FIX = process.env.SL_OMR_FIXTURES || path.join(ROOT, 'tests', 'fixtures', 'omr');
const MODELS = process.env.SL_OMR_MODELS || '';

let fails = 0, passes = 0;
function ok(cond, msg) {
  if (cond) { passes++; console.log('PASS ' + msg); } else { fails++; console.log('FAIL ' + msg); }
  return !!cond;
}
function skip(msg) { console.log('SKIP ' + msg); }
function done() { console.log((fails ? 'FAILED ' : 'OK ') + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0); }

// load the engine files listed in js/omr/manifest.js (all, or up to and including `upTo`)
function load(upTo) {
  require(path.join(ROOT, 'js', 'omr', 'manifest.js'));
  const files = globalThis.OMR.FILES;
  // files not written yet are skipped, so each area's suite runs while others are in progress
  for (const f of files) {
    const p = path.join(ROOT, 'js', 'omr', f);
    if (fs.existsSync(p)) require(p);
    if (upTo && f === upTo) break;
  }
  return globalThis.OMR;
}

let cvPromise = null;
// opencv.js (@techstark/opencv-js) resolved from NODE_PATH; also handed to OMR.setCv when present
function cv() {
  if (!cvPromise) {
    cvPromise = new Promise((resolve) => {
      const m = require('@techstark/opencv-js');
      const fin = (c) => { if (globalThis.OMR && globalThis.OMR.setCv) globalThis.OMR.setCv(c); resolve(c); };
      if (m instanceof Promise) m.then(fin);
      else if (m.Mat) fin(m);
      else m.onRuntimeInitialized = () => fin(m);
    });
  }
  return cvPromise;
}

function ort() {
  const o = require('onnxruntime-web');
  o.env.wasm.numThreads = 1;
  if (globalThis.OMR && globalThis.OMR.setOrt) globalThis.OMR.setOrt(o);
  return o;
}

// ---- minimal PNG decoder (8-bit gray / gray+alpha / RGB / RGBA, non-interlaced: what cv2.imwrite writes)
function readPng(file, opts) {
  opts = opts || {};
  const buf = fs.readFileSync(file);
  let p = 8, w = 0, h = 0, depth = 0, ctype = 0, inter = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; inter = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || inter) throw new Error('readPng: only 8-bit non-interlaced PNG (' + file + ')');
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype];
  if (!ch) throw new Error('readPng: palette PNG not supported (' + file + ')');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, out = new Uint8Array(h * stride);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 255;
    }
    prev = cur;
  }
  let c = ch, data = out;
  if (opts.gray && ch !== 1) throw new Error('readPng: expected gray ' + file);
  // cv2.imread gives BGR for colour PNGs (alpha dropped); default here mirrors cv2.imread
  if (!opts.raw && (ch === 3 || ch === 4)) {
    data = new Uint8Array(w * h * 3); c = 3;
    for (let i = 0, j = 0; i < w * h; i++, j += ch) { data[i * 3] = out[j + 2]; data[i * 3 + 1] = out[j + 1]; data[i * 3 + 2] = out[j]; }
  } else if (!opts.raw && ch === 2) {
    data = new Uint8Array(w * h); c = 1;
    for (let i = 0; i < w * h; i++) data[i] = out[i * 2];
  }
  return { h: h, w: w, c: c, data: data };
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function pages() { return fs.existsSync(FIX) ? fs.readdirSync(FIX).filter((d) => fs.statSync(path.join(FIX, d)).isDirectory()).sort() : []; }
function fix(page, name) { return path.join(FIX, page, name); }
function has(page, name) { return fs.existsSync(fix(page, name)); }

// snake_case keys of the Python dumps -> camelCase like the port
function camel(o) {
  if (Array.isArray(o)) return o.map(camel);
  if (o && typeof o === 'object') {
    const r = {};
    for (const k of Object.keys(o)) r[k.startsWith('__') ? k : k.replace(/_([a-z0-9])/g, (m, c) => c.toUpperCase())] = camel(o[k]);
    return r;
  }
  return o;
}
function near(a, b, rel) {
  rel = rel === undefined ? 1e-3 : rel;
  return Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
}
// same image? returns {same, diff (count of differing values), total}
function cmpImg(a, b) {
  if (!a || !b || a.w !== b.w || a.h !== b.h || a.c !== b.c) return { same: false, diff: -1, total: 0, why: 'shape ' + (a && [a.h, a.w, a.c]) + ' vs ' + (b && [b.h, b.w, b.c]) };
  let d = 0;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) d++;
  return { same: d === 0, diff: d, total: a.data.length };
}

module.exports = { ROOT, FIX, MODELS, ok, skip, done, load, cv, ort, readPng, readJson, pages, fix, has, camel, near, cmpImg };
