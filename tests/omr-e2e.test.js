// OMR engine end to end: js/omr/engine.js (homr's main.py + the owner's SheetLab engine) and the Web
// Worker js/omr/worker.js (run here in worker_threads through a small Web Worker shim, with its pool of
// nested helper workers), against the Python engine:
//   units    (no models)  Python's str.title() (tests/fixtures/omr/e2e-titles.json), titles, XML 1.0
//                         characters, Path.stem, the skip rule, RGBA over white, the GM instrument in the
//                         part-list, spread splitting, the worker protocol without models
//   ci       (models: SL_OMR_MODELS or the repo's models/omr)  tests/fixtures/omr/e2e-brahms-vals3-let.*:
//                         one real page through translate() (single thread) and through the worker with
//                         its helper pool: MusicXML (minus the imgpos comments) and the MIDI against the
//                         Python engine (tools/omr/dump_e2e.py --repo-fixture). The Python engine FAILS this
//                         file (music21 ExpanderException); the JS engine must succeed (MIDI unexpanded).
//   pages    (SL_OMR_FIXTURES)  the 7 fixture pages 00-input.png -> analyzePage, in sorted order from one
//                         fresh cv::theRNG (dump_stages ran them in one process): voices against Python's
//                         shipping-model voices (12-lang-ship-voices.json), generate_xml against
//                         12-lang-ship-xml.json and 11-score.musicxml (fp16 models: INFO), the MIDI of both
//   prep     preprocessSheetImage / maybeSplitLandscapeSpread == sheetlab-prep/<case>/02-prep-*.png, split.json
//   files    every PDF page set (sheetlab-prep/pdf/<name>-pN.png) and synthetic scan (synth-in/*.png)
//                         through the worker (pool) against e2e-ref/<case>/summary.json (dump_e2e.py
//                         --contexts: the Python engine, one fresh process per file) and sheetlab-ref{,2}:
//                         success / title / summaries / progress, every transformer input (staff image
//                         sha1), tokens, merged MusicXML and the .mid
//   pool     the single-thread engine on files' cases == the worker pool's results, byte for byte
//   worker   cancel, a transparent page, a blank page among music, a file without music (pool)
// Token differences between the JS and Python transformers come from the int8 encoder's numerics
// (onnxruntime-web WASM vs CPU, notes/read.md): where a staff reads differently, the JS decoder is run on
// Python's own encoder output (ctx-NN.bin) and must read Python's tokens (or diverge only at a decoder
// near-tie, margin < 1.0); the counts are INFO, and the XML / MIDI checks of such a file are INFO too.
//   SL_OMR_E2E_ONLY=units,ci,...   sections;  SL_OMR_E2E_CASES=belle-let,spread   files' cases
//   SL_OMR_E2E_POOL=n (helpers, default 3);  SL_OMR_DIR (default: SL_OMR_FIXTURES/..) holds sheetlab-prep,
//   synth-in, e2e-ref, sheetlab-ref, sheetlab-ref2
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const H = require('./omr/harness');
const OMR = H.load();
const E = OMR.engine;

const FULL = !!process.env.SL_OMR_FIXTURES;
const OMRDIR = process.env.SL_OMR_DIR || (FULL ? path.dirname(path.resolve(H.FIX)) : '');
const REPO_FIX = path.join(H.ROOT, 'tests', 'fixtures', 'omr');
const ONLY = (process.env.SL_OMR_E2E_ONLY || '').split(',').filter(Boolean);
const want = (s) => !ONLY.length || ONLY.indexOf(s) >= 0;
const CASES = (process.env.SL_OMR_E2E_CASES || '').split(',').filter(Boolean);
const POOL = Number(process.env.SL_OMR_E2E_POOL || 3);
const info = (m) => console.log('INFO ' + m);
const strip = (s) => String(s).replace(/<!-- imgpos[^>]*-->/g, '');
const T = { pages: [], files: [] };

// ---------------------------------------------------------------------------------------- models
function modelsReadFile() {
  if (fs.existsSync(path.join(H.ROOT, 'models', 'omr', 'manifest.json')) && !H.MODELS) return (p) => fs.readFileSync(path.join(H.ROOT, p));
  if (!H.MODELS) return null;
  const files = {
    segnet: 'segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f.onnx',
    encoder: 'encoder_pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31.onnx',
    decoder: 'decoder_pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31.onnx'
  };
  const man = { version: 'omr-test', partMax: 0, models: {} };
  const parts = {};
  for (const k of Object.keys(files)) {
    const p = path.join(H.MODELS, files[k]);
    const b = fs.readFileSync(p);
    const sha = crypto.createHash('sha256').update(b).digest('hex');
    man.models[k] = { source: files[k], bytes: b.length, sha256: sha, parts: [{ file: k + '.onnx', bytes: b.length, sha256: sha }] };
    parts['models/omr/' + k + '.onnx'] = p;
  }
  return (p) => p === 'models/omr/manifest.json' ? Buffer.from(JSON.stringify(man)) : fs.readFileSync(parts[p]);
}
const READ = modelsReadFile();
const MODELS_FROM = H.MODELS ? 'SL_OMR_MODELS' : READ ? 'models/omr' : '';

// ---------------------------------------------------------------------------------------- the Web Worker shim
// js/omr/worker.js in a worker_thread: self / importScripts / postMessage / onmessage / nested Worker as in
// a browser's dedicated worker; OMR.runtime runs in its Node mode (require'd opencv.js / onnxruntime-web,
// models from disk like the other suites)
const { Worker: NodeWorker } = require('worker_threads');
const BOOT = `
const { parentPort, workerData: D, Worker: NodeWorker } = require('worker_threads');
const path = require('path'), fs = require('fs'), crypto = require('crypto');
globalThis.self = globalThis;
self.name = D.name || '';
self.location = { href: D.href };
const dir = path.dirname(D.file);
self.importScripts = function () { for (const u of arguments) require(path.resolve(dir, String(u))); };
self.postMessage = (m, transfer) => parentPort.postMessage(m, transfer || []);
class ShimWorker {
  constructor(url, opts) {
    this.onmessage = null; this.onerror = null; this.onmessageerror = null;
    this._w = new NodeWorker(D.boot, { eval: true, workerData: Object.assign({}, D, { name: opts && opts.name || '' }) });
    this._w.on('message', (data) => { if (this.onmessage) this.onmessage({ data }); });
    this._w.on('error', (e) => { if (this.onerror) this.onerror({ message: e.message, preventDefault() {} }); });
    this._w.on('exit', (code) => { if (code && !this._killed && this.onerror) this.onerror({ message: 'exit ' + code, preventDefault() {} }); });
  }
  postMessage(m, t) { this._w.postMessage(m, t || []); }
  terminate() { this._killed = true; this._w.terminate(); }
}
self.Worker = D.noNested ? undefined : ShimWorker;
parentPort.on('message', (data) => { if (self.onmessage) self.onmessage({ data }); });
require(D.file);
if (D.models || D.repoModels) {
  let read;
  if (!D.models) read = (p) => fs.readFileSync(path.join(D.root, p));
  else {
    const files = { segnet: 'segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f.onnx',
      encoder: 'encoder_pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31.onnx',
      decoder: 'decoder_pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31.onnx' };
    const man = { version: 'omr-test', partMax: 0, models: {} }, parts = {};
    for (const k of Object.keys(files)) {
      const p = path.join(D.models, files[k]), b = fs.readFileSync(p);
      const sha = crypto.createHash('sha256').update(b).digest('hex');
      man.models[k] = { source: files[k], bytes: b.length, sha256: sha, parts: [{ file: k + '.onnx', bytes: b.length, sha256: sha }] };
      parts['models/omr/' + k + '.onnx'] = p;
    }
    read = (p) => p === 'models/omr/manifest.json' ? Buffer.from(JSON.stringify(man)) : fs.readFileSync(parts[p]);
  }
  self.OMR.runtime.configure({ readFile: read });
}
`;
class ShimWorker {
  constructor(opts) {
    opts = opts || {};
    const file = path.join(H.ROOT, 'js', 'omr', 'worker.js');
    this.messages = [];
    this.listeners = [];
    this._w = new NodeWorker(BOOT, {
      eval: true,
      workerData: { boot: BOOT, file: file, href: 'file://' + file, root: H.ROOT, models: H.MODELS || '', repoModels: !!READ && !H.MODELS, noNested: !!opts.noNested }
    });
    this._w.on('message', (m) => { this.messages.push(m); for (const l of this.listeners.slice()) l(m); });
    this._w.on('error', (e) => { this.messages.push({ type: 'crash', message: e.message }); for (const l of this.listeners.slice()) l({ type: 'crash', message: e.message }); });
  }
  post(m, t) { this._w.postMessage(m, t || []); }
  // resolves with the first message matching fn (also one that arrived before)
  wait(fn, ms) {
    const hit = this.messages.find(fn);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => { this.listeners = this.listeners.filter((x) => x !== l); reject(new Error('timeout waiting for a worker message')); }, ms || 600000);
      const l = (m) => { if (fn(m)) { clearTimeout(to); this.listeners = this.listeners.filter((x) => x !== l); resolve(m); } };
      this.listeners.push(l);
    });
  }
  terminate() { return this._w.terminate(); }
}
// a page image as the page module sends it: RGBA (from a BGR OMR.np image)
function rgbaOf(img) {
  const n = img.w * img.h, out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    if (img.c === 1) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = img.data[i]; } else {
      out[i * 4] = img.data[i * 3 + 2]; out[i * 4 + 1] = img.data[i * 3 + 1]; out[i * 4 + 2] = img.data[i * 3];
    }
    out[i * 4 + 3] = 255;
  }
  return out;
}
let docSeq = 0;
// one document through the worker: pages [{label, image (BGR)}] -> {result, msgs, progress, pages, ms}
async function workerTranslate(w, pages, opts) {
  const id = 'doc' + (++docSeq);
  const t0 = Date.now();
  const mark = w.messages.length;
  for (let i = 0; i < pages.length; i++) {
    const data = rgbaOf(pages[i].image);
    w.post({ cmd: 'page', id: id, label: pages[i].label, index: i, count: pages.length, image: { w: pages[i].image.w, h: pages[i].image.h, data: data }, opts: opts }, [data.buffer]);
    const m = await w.wait((x) => x.id === id && (x.type === 'pageDone' && x.index === i || x.type === 'error' || x.type === 'cancelled'));
    if (m.type !== 'pageDone') return { error: m, msgs: w.messages.slice(mark) };
  }
  w.post({ cmd: 'finish', id: id });
  const res = await w.wait((x) => x.id === id && (x.type === 'result' || x.type === 'error' || x.type === 'cancelled'));
  const msgs = w.messages.slice(mark).filter((x) => x.id === id);
  return {
    result: res.type === 'result' ? res : null, error: res.type === 'result' ? null : res, msgs: msgs,
    progress: msgs.filter((x) => x.type === 'progress' && x.stage === 'engine').map((x) => [x.fraction, x.message]),
    pages: msgs.filter((x) => x.type === 'page'), ms: Date.now() - t0
  };
}

// ---------------------------------------------------------------------------------------- comparisons
// token edit distance (Levenshtein over symbol strings)
function editDistance(a, b) {
  const n = a.length, m = b.length;
  let prev = new Uint32Array(m + 1), cur = new Uint32Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    for (let j = 1; j <= m; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    const t = prev; prev = cur; cur = t;
  }
  return prev[m];
}
function voiceStrings(voices) { return voices.map((v) => v.map((s) => String(s))); }
// per page: token edits between JS and Python voices
function voiceEdits(js, py) {
  let edits = 0, tokens = 0;
  const n = Math.max(js.length, py.length);
  for (let v = 0; v < n; v++) { const a = js[v] || [], b = py[v] || []; edits += editDistance(a, b); tokens += b.length; }
  return { edits, tokens, voicesSame: js.length === py.length };
}
function midiNotes(bytes) {
  const smf = OMR.midi.readSmf(bytes);
  return smf.tracks.map((t) => {
    const on = new Map(), out = [];
    for (const e of t) {
      if (e.type === 'note_on' && e.velocity > 0) {
        const k = e.channel + ':' + e.note;
        if (!on.has(k)) on.set(k, []);
        on.get(k).push([e.tick, e.velocity]);
      } else if (e.type === 'note_off' || e.type === 'note_on') {
        const q = on.get(e.channel + ':' + e.note);
        if (q && q.length) { const s = q.shift(); out.push([s[0], e.tick - s[0], e.note, e.channel - 1, s[1]]); }
      }
    }
    return out.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || x[3] - y[3] || x[4] - y[4]);
  });
}
function sameBytes(a, b) { return !!a && !!b && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0; }
function grayToBgr(img) {
  if (img.c === 3) return img;
  const out = new Uint8Array(img.w * img.h * 3);
  for (let i = 0; i < img.w * img.h; i++) out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = img.data[i];
  return { h: img.h, w: img.w, c: 3, data: out };
}
const secs = (ms) => (ms / 1000).toFixed(1) + ' s';
// every opencv.js Mat / MatVector / PointVector made and deleted (tests/omr-staff.test.js' accounting):
// the worker runs page after page, nothing may outlive a page
function trackLeaks(cv) {
  const st = { made: 0, gone: 0 };
  for (const name of ['Mat', 'MatVector', 'PointVector', 'CLAHE']) {
    const Real = cv[name];
    const del = Real.prototype.delete;
    Real.prototype.delete = function () { st.gone++; return del.call(this); };
    cv[name] = new Proxy(Real, { construct(Tc, args) { st.made++; return new Tc(...args); } });
  }
  for (const f of ['getStructuringElement', 'getAffineTransform']) {
    const g = cv[f];
    const w = function () { st.made++; return g.apply(this, arguments); };
    if (g.overloadTable) w.overloadTable = g.overloadTable;
    cv[f] = w;
  }
  const probe = new cv.MatVector(), MV = Object.getPrototypeOf(probe);
  probe.delete();
  const get = MV.get;
  MV.get = function (i) { st.made++; return get.call(this, i); };
  return st;
}

// ======================================================================================== units
async function units() {
  console.log('--- units (no models)');
  // str.title() exactly like Python's (the engine's title fallback)
  const tt = JSON.parse(fs.readFileSync(path.join(REPO_FIX, 'e2e-titles.json'), 'utf8'));
  // characters whose case properties changed after Python 3.11's Unicode 14 (the JS engine's ICU is newer)
  const NEWER = new Set([0x19b, 0x264, 0x295, 0xa7d1, 0xa7d3, 0xa7d5, 0xa7d7, 0xa7d9, 0x1c89, 0x1c8a, 0xa7cb, 0xa7cc, 0xa7cd, 0xa7da, 0xa7db, 0xa7dc]);
  let tBad = 0, tNewer = 0;
  for (const [s, py] of tt.cases) {
    const js = E._pyTitle(s);
    if (js === py) continue;
    const a = Array.from(js), b = Array.from(py), src = Array.from(s);
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    // the source character at (or right before) the difference
    const near = [src[i], src[i - 1]].filter(Boolean).map((c) => c.codePointAt(0));
    if (near.some((c) => NEWER.has(c))) tNewer++; else { tBad++; if (tBad < 4) console.log('  title ' + JSON.stringify(src.slice(Math.max(0, i - 2), i + 3).join('')) + ': js ' + JSON.stringify(a.slice(i, i + 3).join('')) + ' python ' + JSON.stringify(b.slice(i, i + 3).join(''))); }
  }
  H.ok(tBad === 0, 'str.title() == Python ' + tt.unicode + ' on ' + tt.cases.length + ' strings (every cased character, Final_Sigma, file names)' + (tNewer ? '; ' + tNewer + ' strings differ only at characters Unicode changed after 14.0' : ''));
  const titles = [['brahms-vals3-let.pdf', 'Brahms Vals3 Let'], ['ElCapitanMarch-let.pdf', 'Elcapitanmarch Let'], ['bwv797-let.pdf', 'Bwv797 Let'],
    ['02-entree-let.pdf', '02 Entree Let'], ['my_song.final.png', 'My Song.Final'], ['.hidden', '.Hidden'], ['dir/sub\\x_y-z.JPG', 'X Y Z'],
    ['photo.', 'Photo.'], ["they're_bill's.png", "They'Re Bill'S"], ['', '']];
  H.ok(titles.every(([f, t]) => E.titleFromName(f) === t), 'titleFromName = Path(src).stem.replace("-", " ").replace("_", " ").title(): ' +
    titles.filter(([f, t]) => E.titleFromName(f) !== t).map(([f, t]) => f + ' -> ' + E.titleFromName(f) + ' (want ' + t + ')').join('; '));
  const clean = [['  Vals no. 3 \n', 'Vals no. 3'], ['A\x01B\x7fC', 'AB\x7fC'], ['\x1c Title \x85', 'Title'], ['\ud800x\ufffe\uffff', 'x'],
    ['tab\there', 'tab\there'], ['\x0bT\x0c', 'T'], ['\x00\x01', ''], ['F\u00fcr Elise \u2013 pi\u00f9 mosso', 'F\u00fcr Elise \u2013 pi\u00f9 mosso'], ['\u{1d11e} G clef', '\u{1d11e} G clef']];
  H.ok(clean.every(([a, b]) => E.cleanTitle(a) === b), 'cleanTitle: Python str.strip() + characters XML 1.0 forbids removed: ' +
    clean.filter(([a, b]) => E.cleanTitle(a) !== b).map(([a]) => JSON.stringify(a) + ' -> ' + JSON.stringify(E.cleanTitle(a))).join('; '));
  // the engine's skip rule (and homr's newer message)
  const sk = [['No noteheads or clefs found', 'Non-music / cover page (No noteheads or clefs found)'],
    ['No noteheads found', 'Non-music / cover page (No noteheads found)'], ['No staffs found', 'Non-music / cover page (No staffs found)'],
    ['list index out of range', 'OMR skipped page (list index out of range)'], ['x No noteheads', 'OMR skipped page (x No noteheads)']];
  H.ok(sk.every(([m, r]) => E.skipReason(m) === r), 'skip rule: "No noteheads..." / "No staffs found" -> cover page, else "OMR skipped page (...)"');
  // RGBA over white -> BGR
  const rgba = new Uint8ClampedArray([10, 20, 30, 255, 0, 0, 0, 0, 0, 0, 0, 128, 200, 100, 50, 64]);
  const bgr = E.imageFromRgba(4, 1, rgba);
  const exp = [30, 20, 10, 255, 255, 255, 127, 127, 127, 204, 216, 241];
  H.ok(bgr.c === 3 && Array.from(bgr.data).every((v, i) => v === exp[i]), 'RGBA composited over white then RGB->BGR (a transparent page stays white): ' + Array.from(bgr.data));
  // spreads
  const z = (w, h) => ({ h: h, w: w, c: 3, data: new Uint8Array(w * h * 3) });
  const sp = E.maybeSplitLandscapeSpread(z(2000, 1500)), one = E.maybeSplitLandscapeSpread(z(1700, 1000)), off = E.maybeSplitLandscapeSpread(z(2000, 1500), false);
  H.ok(sp.length === 2 && sp[0][0] === 'Left' && sp[0][1].w === 1020 && sp[1][0] === 'Right' && sp[1][1].w === 1020 && one.length === 1 && one[0][0] === '' && off.length === 1 &&
    E.splitCount(2000, 1500) === 2 && E.splitCount(1981, 1500) === 2 && E.splitCount(1980, 1500) === 1 && E.splitCount(1799, 1000) === 1,
  'maybeSplitLandscapeSpread: w > 1.32 h and w >= 1800 -> Left / Right with 1 % overlap (2000 px -> 2 x 1020)');
  H.ok(E._medianU8(new Uint8Array([1, 9, 3, 4])) === 3.5 && E._medianU8(new Uint8Array([7])) === 7 && E._medianU8(new Uint8Array([0, 255, 64])) === 64, 'np.median of uint8 (mean of the middle two)');
  // the GM instrument in the part-list
  const xml = "<?xml version='1.0' encoding='utf-8'?>\n<score-partwise version=\"4.0\"><part-list><score-part id=\"P1\"><part-name>Voice</part-name><score-instrument id=\"P1-I1\"><instrument-name>Voice</instrument-name><instrument-sound>voice</instrument-sound></score-instrument><midi-instrument id=\"P1-I1\"><midi-channel>1</midi-channel><midi-program>54</midi-program><volume>100</volume><pan>0</pan></midi-instrument></score-part><score-part id=\"P2\"><part-name>Piano</part-name></score-part></part-list><part id=\"P1\" /></score-partwise>";
  const x1 = E.setPartInstrument(xml, 40, 'Violin');
  H.ok(x1.indexOf('<instrument-name>Violin</instrument-name><instrument-sound>strings.violin</instrument-sound>') > 0 && x1.indexOf('<midi-program>41</midi-program><volume>100</volume>') > 0 &&
    x1.indexOf('<score-part id="P2"><part-name>Piano</part-name><score-instrument id="P2-I1"><instrument-name>Violin</instrument-name><instrument-sound>strings.violin</instrument-sound></score-instrument><midi-instrument id="P2-I1"><midi-program>41</midi-program></midi-instrument></score-part>') > 0 &&
    x1.startsWith("<?xml version='1.0' encoding='utf-8'?>\n") && x1.indexOf('<part-name>Voice</part-name>') > 0,
  'setPartInstrument: instrument-name, instrument-sound and midi-program (1-based) of every score-part (missing elements added in MusicXML order)');
  const x2 = E.setPartInstrument(xml, 99, 'GM 99 <&>');
  H.ok(x2.indexOf('instrument-sound') < 0 && x2.indexOf('<instrument-name>GM 99 &lt;&amp;&gt;</instrument-name>') > 0 && x2.indexOf('<midi-program>100</midi-program>') > 0, 'setPartInstrument: a program outside the menu drops instrument-sound; names are escaped');
  // the pool helpers
  const order = [];
  await E._runLimited(7, 3, async (i) => { await new Promise((r) => setTimeout(r, (7 - i) * 3)); order.push(i); });
  H.ok(order.length === 7 && new Set(order).size === 7, 'runLimited runs every task once (3 at a time)');
  const V = OMR.transformer_vocabulary;
  const syms = [new V.EncodedSymbol('note_4', 'C4', '#', '_', '_', 'upper', Float32Array.of(1.5, 2.25)), new V.EncodedSymbol('barline')];
  const back = E.tasks.decodeSymbols(E.tasks.encodeSymbols(syms));
  H.ok(back.length === 2 && back[0].equals(syms[0]) && back[0].coordinates instanceof Float32Array && back[0].coordinates[1] === 2.25 && back[1].coordinates === null && String(back[1]) === String(syms[1]),
    'EncodedSymbols survive the helper message (fields + the attention Float32Array)');
  // options
  let threw = 0;
  for (const bad of [{ tempoBpm: 0 }, { tempoBpm: NaN }, { program: 128 }, { transposeSemitones: 1.5 }]) { try { new E.Translation(bad); } catch (e) { threw++; } }
  const tr = new E.Translation({ instrumentName: 'Violin', title: ' \x02Etude 7 ' });
  H.ok(threw === 4 && tr.options.program === 40 && tr.result.title === 'Etude 7' && new E.Translation({ instrumentName: 'Kazoo' }).options.program === 0,
    'options: GM_INSTRUMENTS.get(name, 0), bad tempo / program / transpose refused, the title cleaned');
  // a document without pages, and one without music
  const empty = await E.translate([], { sourceName: 'x.pdf' });
  H.ok(!empty.success && empty.errorMessage === 'No musical staves or noteheads could be detected in this file.', 'no pages -> the engine\'s "No musical staves..." error');
  const cancelled = await E.translate([{ image: z(100, 100) }], {}, { cancelled: () => true });
  H.ok(!cancelled.success && cancelled.cancelled, 'cancelled before the first page -> {success: false, cancelled: true}');

  // the worker protocol without models
  const w = new ShimWorker();
  try {
    w.post({ cmd: 'init', pool: 'auto', hints: { ios: true } });
    const r1 = await w.wait((m) => m.type === 'ready', 60000);
    w.post({ cmd: 'init', pool: 'auto', hints: { deviceMemory: 4, hardwareConcurrency: 8 } });
    const r2 = await w.wait((m) => m.type === 'ready' && m !== r1, 60000);
    w.post({ cmd: 'init', pool: 'auto', hints: { deviceMemory: 8, hardwareConcurrency: 8 } });
    const r3 = await w.wait((m) => m.type === 'ready' && m !== r1 && m !== r2, 60000);
    w.post({ cmd: 'init', pool: 'auto', hints: { hardwareConcurrency: 2 } });
    const r4 = await w.wait((m) => m.type === 'ready' && [r1, r2, r3].indexOf(m) < 0, 60000);
    w.post({ cmd: 'init', pool: 5 });
    const r5 = await w.wait((m) => m.type === 'ready' && [r1, r2, r3, r4].indexOf(m) < 0, 60000);
    H.ok(r1.pool === 1 && r2.pool === 1 && r3.pool === 3 && r4.pool === 1 && r5.pool === 5,
      'worker pool size: iOS 1, deviceMemory <= 4 -> 1, 8 cores -> 3, 2 cores -> 1, explicit 5 (got ' + [r1, r2, r3, r4, r5].map((r) => r.pool) + ')');
    const ua = {
      safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      webview: 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36',
      iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
    };
    const sizes = [];
    for (const [name, hints] of [['safariMac', { hardwareConcurrency: 10 }], ['chromeWin', { hardwareConcurrency: 8 }], ['webview', { hardwareConcurrency: 8, deviceMemory: 8 }], ['webview', { hardwareConcurrency: 8, deviceMemory: 4 }], ['iphone', { hardwareConcurrency: 6 }]]) {
      const before = w.messages.length;
      w.post({ cmd: 'init', pool: 'auto', hints: Object.assign({ userAgent: ua[name] }, hints) });
      sizes.push((await w.wait((m) => m.type === 'ready' && w.messages.indexOf(m) >= before, 60000)).pool);
    }
    H.ok(JSON.stringify(sizes) === '[1,3,3,1,1]', 'worker pool size by user agent: Safari on a Mac / iPad 1, Chrome 8 cores 3, Android WebView 8 GB 3 / 4 GB 1, iPhone 1 (got ' + sizes + ')');
    w.post({ cmd: 'size', id: 's1', cachedOnly: true });
    const s1 = await w.wait((m) => m.type === 'size' && m.id === 's1', 60000);
    H.ok(s1.known === false && s1.cacheAvailable === false, 'size {cachedOnly}: no Cache Storage here -> {known: false} without any request');
    w.post({ cmd: 'bogus', id: 'b1' });
    const b1 = await w.wait((m) => m.type === 'error' && m.id === 'b1', 60000);
    H.ok(/unknown command/.test(b1.message), 'an unknown command answers an error');
  } finally { await w.terminate(); }
  const w2 = new ShimWorker({ noNested: true });
  try {
    w2.post({ cmd: 'init', pool: 'auto', hints: { hardwareConcurrency: 8, deviceMemory: 8 } });
    const r = await w2.wait((m) => m.type === 'ready', 60000);
    H.ok(r.pool === 1, 'worker without nested Worker support -> pool 1 (no helpers)');
  } finally { await w2.terminate(); }
}

// ======================================================================================== ci
async function ci() {
  console.log('--- ci: tests/fixtures/omr/e2e-brahms-vals3-let (one real page, the Python engine fails it)');
  const fx = JSON.parse(fs.readFileSync(path.join(REPO_FIX, 'e2e-brahms-vals3-let.json'), 'utf8'));
  const page = grayToBgr(H.readPng(path.join(REPO_FIX, fx.image), { raw: true }));
  const progress = [];
  const leaks = trackLeaks(await H.cv());
  const t0 = Date.now();
  let pageInfo = null, analysisVoices = null;
  const r = await E.translate([{ label: 'Page 1', image: page }], { title: fx.title, sourceName: fx.source }, {
    progress: (p, m) => progress.push([p, m]),
    page: (inf, a) => { pageInfo = inf; analysisVoices = voiceStrings(a.voices); }
  });
  const ms = Date.now() - t0;
  T.ci = { single: ms, page: pageInfo && pageInfo.timings };
  H.ok(leaks.made > 0 && leaks.made === leaks.gone, 'brahms-vals3: no opencv.js object outlives the translation (' + leaks.made + ' made, ' + leaks.gone + ' deleted)');
  H.ok(r.success && fx.lenient && /ExpanderException/.test(fx.engine_error),
    'brahms-vals3: the Python engine fails the file (' + fx.engine_error + '); the JS engine succeeds (' + (r.errorMessage || 'ok') + ')');
  H.ok(r.warnings.some((w) => /repeats could not be expanded/.test(w)) && r.repeatsExpanded === false, 'brahms-vals3: the summary says the repeats were not expanded: ' + JSON.stringify(r.warnings));
  H.ok(r.title === fx.title && r.pagesProcessed === fx.pages_processed && r.pagesSkipped === fx.pages_skipped && JSON.stringify(r.pageSummaries) === JSON.stringify(fx.page_summaries),
    'brahms-vals3: title, pages, page summaries == Python (' + JSON.stringify(r.pageSummaries) + ')');
  H.ok(JSON.stringify(progress) === JSON.stringify(fx.progress), 'brahms-vals3: progress fractions and messages == Python (' + progress.length + ')');
  const ed = voiceEdits(analysisVoices || [], fx.pages[0].voices.map((v) => v.map((s) => s[0])));
  H.ok(ed.edits === 0 && ed.voicesSame, 'brahms-vals3: voices == Python (' + ed.tokens + ' tokens, ' + ed.edits + ' edits)');
  H.ok(strip(r.xmlRaw) === strip(fx.musicxml), 'brahms-vals3: MusicXML == Python apart from the <!-- imgpos --> comments (' + r.xmlRaw.length + ' chars)');
  const notes = midiNotes(r.midi);
  H.ok(JSON.stringify(notes) === JSON.stringify(fx.notes), 'brahms-vals3: MIDI notes == the engine\'s with the repeats left unexpanded (' + notes.map((t) => t.length) + ')');
  const ev = OMR.midi.readSmf(r.midi).tracks.map((t) => t.length);
  H.ok(JSON.stringify(ev) === JSON.stringify(fx.midi.tracks.map((t) => t.length)) && OMR.midi.readSmf(r.midi).ticksPerBeat === fx.midi.ticks_per_beat, 'brahms-vals3: MIDI tracks / events / ticks per beat == Python');
  const mx = await OMR.mxl.read(r.mxl);
  H.ok(mx.xml === r.musicxml && /<instrument-name>Acoustic Grand Piano<\/instrument-name>/.test(r.musicxml) && /<midi-program>1<\/midi-program>/.test(r.musicxml) && strip(r.musicxml).replace(/<score-instrument[\s\S]*?<\/midi-instrument>/g, '') === strip(r.xmlRaw).replace(/<score-instrument[\s\S]*?<\/midi-instrument>/g, ''),
    'brahms-vals3: .musicxml / .mxl = homr\'s MusicXML with the GM instrument in the part-list');
  H.ok(r.totalMeasures > 0 && r.totalNotes > 0 && r.durationSeconds > 0 && r.noteEvents.length > 0, 'brahms-vals3: summary ' + r.totalMeasures + ' measures, ' + r.totalNotes + ' notes, ' + r.totalChords + ' chords, ' + r.durationSeconds.toFixed(1) + ' s');
  info('ci single thread: ' + secs(ms) + ' (detect ' + secs(pageInfo.timings.detect) + ', read ' + secs(pageInfo.timings.read) + ')');

  // the same through the worker, with helper workers
  const nh = Math.max(2, Math.min(POOL, 3));
  const w = new ShimWorker();
  try {
    w.post({ cmd: 'init', pool: nh });
    await w.wait((m) => m.type === 'ready');
    w.post({ cmd: 'prepare', id: 'p' });
    const pr = await w.wait((m) => (m.type === 'prepared' || m.type === 'error') && m.id === 'p');
    H.ok(pr.type === 'prepared' && pr.info.pool === nh, 'worker prepare: ' + nh + ' helper workers ready (' + (pr.info ? pr.info.readyMs + ' ms' : pr.message) + ')');
    const out = await workerTranslate(w, [{ label: 'Page 1', image: page }], { title: fx.title, sourceName: fx.source, withVoices: true });
    const res = out.result;
    T.ci.pool = out.ms;
    H.ok(res && res.success && res.musicxml === r.musicxml && sameBytes(new Uint8Array(res.midi), r.midi),
      'worker with ' + nh + ' helpers == single thread: MusicXML (imgpos included) and MIDI bytes identical (' + secs(out.ms) + ' vs ' + secs(ms) + ')');
    H.ok(JSON.stringify(out.progress) === JSON.stringify(fx.progress) && out.pages.length === 1 && out.pages[0].summary === fx.page_summaries[0] &&
      out.pages[0].preview && out.pages[0].preview.items.length > 0 && out.msgs.some((m) => m.type === 'staffs' && m.staffCount === 3),
    'worker messages: engine progress == Python, staffs (3) + page summary + preview (' + (out.pages[0] && out.pages[0].preview ? out.pages[0].preview.items.length + ' drawables' : 'none') + ')');
    const stages = new Set(out.msgs.filter((m) => m.type === 'progress').map((m) => m.stage));
    const fr = out.msgs.filter((m) => m.type === 'progress' && typeof m.fraction === 'number').map((m) => m.fraction);
    H.ok(['engine', 'segment', 'staffs', 'read'].every((s) => stages.has(s)) && fr.every((f, i) => i === 0 || f >= fr[i - 1] - 1e-9) && fr.every((f) => f >= 0 && f <= 1),
      'worker progress: stages ' + Array.from(stages).join(', ') + ', fractions rise monotonically');
    H.ok(res && res.summary.warnings.length === r.warnings.length && res.title === r.title && res.mxl instanceof ArrayBuffer && res.summary.pages[0].teaser.length > 0, 'worker result: summary, warnings, .mxl ArrayBuffer');
  } finally { await w.terminate(); }
}

// ======================================================================================== pages
async function pages() {
  const list = H.pages().filter((p) => H.has(p, '00-input.png') && H.has(p, '12-lang-ship-voices.json'));
  console.log('--- pages: ' + list.length + ' fixture pages, analyzePage in sorted order from one fresh theRNG (single thread)');
  OMR.cv2.resetRNG();
  let edTot = 0, tokTot = 0, identical = 0;
  for (const page of list) {
    const img = H.readPng(H.fix(page, '00-input.png'));
    const t0 = Date.now();
    const a = await E.analyzePage(img, { pageNumber: 1, label: 'Page 1' });
    const ms = Date.now() - t0;
    T.pages.push([page, ms, a.timings.detect, a.timings.read, a.staffCount]);
    const ship = H.readJson(H.fix(page, '12-lang-ship-voices.json'));
    const nStaffs = H.readJson(H.fix(page, '08-repaired.json')).multi_staffs.reduce((s, ms) => s + ms.staffs.length, 0);
    H.ok(!a.skippedReason && a.staffCount === nStaffs, page + ': ' + a.staffCount + ' staffs == 08-repaired (' + nStaffs + ')' + (a.skippedReason ? ' -- ' + a.skippedReason : ''));
    const js = voiceStrings(a.voices), py = ship.voices.map((v) => v.map((s) => s[0]));
    const ed = voiceEdits(js, py);
    edTot += ed.edits; tokTot += ed.tokens;
    const xmlJs = OMR.music_xml_generator.toXmlString(OMR.music_xml_generator.generateXml(new OMR.music_xml_generator.XmlGeneratorArguments(false, null, null), a.voices, ''));
    const shipXml = H.readJson(H.fix(page, '12-lang-ship-xml.json'))[0].write;
    const fp16 = fs.readFileSync(H.fix(page, '11-score.musicxml'), 'utf8');
    const mJs = OMR.midi.convert(xmlJs, {}).midi, mPy = OMR.midi.convert(shipXml, {}).midi;
    if (ed.edits === 0 && ed.voicesSame) {
      identical++;
      H.ok(true, page + ': voices == Python shipping-model voices (' + ed.tokens + ' tokens)');
      H.ok(strip(xmlJs) === strip(shipXml), page + ': generate_xml == 12-lang-ship-xml (Python, shipping models) apart from imgpos comments');
      H.ok(sameBytes(mJs, mPy), page + ': MIDI of the JS MusicXML == MIDI of Python\'s (byte for byte)');
    } else {
      info(page + ': ' + ed.edits + ' token edit(s) in ' + ed.tokens + ' vs Python (model near-ties, see notes/read.md); MusicXML ' + (strip(xmlJs) === strip(shipXml) ? 'equal' : 'differs') + ', MIDI ' + (sameBytes(mJs, mPy) ? 'byte-identical' : 'differs'));
    }
    info(page + ': vs 11-score.musicxml (fp16 models) apart from imgpos: ' + (strip(xmlJs) === strip(fp16) ? 'equal' : 'differs') + '; ' + secs(ms) + ' (detect ' + secs(a.timings.detect) + ', read ' + secs(a.timings.read) + ', ' + a.staffCount + ' staffs)');
  }
  info('pages: ' + identical + '/' + list.length + ' token-identical, ' + edTot + ' token edits in ' + tokTot + ' tokens');
}

// ======================================================================================== prep
function prep() {
  const dir = path.join(OMRDIR, 'sheetlab-prep');
  const cases = fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'split.json'))).sort();
  console.log('--- prep: preprocessSheetImage / maybeSplitLandscapeSpread on ' + cases.length + ' cases');
  for (const c of cases) {
    const src = H.readPng(path.join(dir, c, '00-source.png'));
    const split = H.readJson(path.join(dir, c, 'split.json'));
    const s = E.maybeSplitLandscapeSpread(src, true);
    H.ok(JSON.stringify(s.map((x) => x[0])) === JSON.stringify(split.labels), c + ': split labels ' + JSON.stringify(s.map((x) => x[0])));
    s.forEach((x, i) => {
      const half = H.cmpImg(x[1], H.readPng(path.join(dir, c, '01-split-' + i + '.png')));
      const ref = H.readPng(path.join(dir, c, '02-prep-' + i + '.png'));
      const out = E.preprocessSheetImage(x[1], true);
      const cmp = H.cmpImg(out, ref);
      H.ok(half.same, c + ' #' + i + ': split image == 01-split (' + x[1].w + 'x' + x[1].h + ')');
      if (c === 'low-res' && !cmp.same && cmp.diff > 0) {
        // cv2.resize INTER_CUBIC on uint8 goes through Intel IPP in the Python wheel (foundation notes, gotcha 5)
        let maxd = 0;
        for (let k = 0; k < out.data.length; k++) maxd = Math.max(maxd, Math.abs(out.data[k] - ref.data[k]));
        // cv2 hands the uint8 INTER_CUBIC upscale to Intel IPP on x86 (floating point); engine.js'
        // resizeCubicU8 follows it to all but its near-ties at .5 (opencv.js' fixed point: ~1 % of the values)
        info(c + ' #' + i + ': preprocess differs from 02-prep in ' + cmp.diff + '/' + cmp.total + ' values (max ' + maxd + '): IPP\'s float rounding at .5 near-ties in the INTER_CUBIC upscale');
        H.ok(out.w === ref.w && out.h === ref.h && maxd <= 1 && cmp.diff <= cmp.total * 1e-5, c + ' #' + i + ': upscale + unsharp mask == 02-prep (' + out.w + 'x' + out.h + ') but ' + cmp.diff + ' values off by 1 (< 0.001 %)');
      } else H.ok(cmp.same, c + ' #' + i + ': preprocessSheetImage == 02-prep (' + (cmp.same ? 'byte-exact' : cmp.diff + ' values differ ' + (cmp.why || '')) + ')');
    });
  }
}

// ======================================================================================== files
function fileCases() {
  const pdfDir = path.join(OMRDIR, 'sheetlab-prep', 'pdf'), synth = path.join(OMRDIR, 'synth-in');
  const meta = H.readJson(path.join(pdfDir, 'pdf.json'));
  const out = [];
  for (const f of Object.keys(meta).sort()) {
    const name = f.replace(/-let\.pdf$/, '');
    const pages = [];
    for (let i = 1; i <= meta[f].pages; i++) pages.push({ label: 'Page ' + i, file: path.join(pdfDir, name + '-p' + i + '.png') });
    out.push({ key: f.replace(/\.pdf$/, ''), source: f, title: meta[f].title, pages: pages });
  }
  if (fs.existsSync(synth)) {
    for (const f of fs.readdirSync(synth).filter((x) => x.endsWith('.png')).sort()) {
      out.push({ key: f.replace(/\.png$/, ''), source: f, title: '', pages: [{ label: 'Page 1', file: path.join(synth, f) }] });
    }
  }
  return out.filter((c) => !CASES.length || CASES.indexOf(c.key) >= 0);
}
function loadPages(c) { return c.pages.map((p) => ({ label: p.label, image: H.readPng(p.file) })); }

let decoderP = null;
// the JS decoder on a context Python's encoder made (ctx-NN.bin) -> the symbol strings
async function decodeContext(file) {
  if (!decoderP) decoderP = OMR.transformer_decoder_inference.getDecoder(OMR.transformer_configs.defaultConfig);
  const dec = await decoderP;
  const b = fs.readFileSync(file);
  const data = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  return (await dec.generate([[1]], [[0]], { context: { data: data, dims: [1, 1280, 512] } })).map(String);
}
const HEADS = { rhythm: 0, pitch: 1, lift: 2, position: 3, articulation: 4, slur: 5 };
const FIELDS = ['rhythm', 'pitch', 'lift', 'articulation', 'slur', 'position'];
async function staffsCheck(key, js, py) {
  const imgBad = [], diffs = [];
  for (let i = 0; i < Math.max(js.length, py.length); i++) {
    const a = js[i], b = py[i];
    if (!a || !b || a.sha1 !== b.sha1) { imgBad.push(i); continue; }
    if (JSON.stringify(a.tokens) === JSON.stringify(b.tokens)) continue;
    let k = 0;
    while (k < a.tokens.length && k < b.tokens.length && a.tokens[k] === b.tokens[k]) k++;
    // (a missing / extra symbol: the EOS decision of the rhythm head)
    const at = (toks, kk) => {
      let f = 'rhythm';
      if (kk < toks.length && kk < b.tokens.length) {
        const fa = toks[kk].split(' '), fb = b.tokens[kk].split(' ');
        f = FIELDS[fa.findIndex((v, j) => v !== fb[j])] || 'rhythm';
      }
      return { field: f, margin: b.margins && b.margins[kk] ? b.margins[kk][HEADS[f]] : null };
    };
    const first = at(a.tokens, k);
    const ctx = path.join(OMRDIR, 'e2e-ref', key, 'ctx-' + String(i).padStart(2, '0') + '.bin');
    const viaPy = fs.existsSync(ctx) ? await decodeContext(ctx) : null;
    // the JS decoder on Python's context: Python's tokens, or a first divergence at a near tie of the
    // decoder itself (Python's top-2 margin < 1.0, like tests/omr-read.test.js' gate: the decoder's
    // logits differ from Python's by ~1e-6 per step, which the KV cache grows to ~0.2)
    let decoderOk = null, dec = '';
    if (viaPy) {
      let k2 = 0;
      while (k2 < viaPy.length && k2 < b.tokens.length && viaPy[k2] === b.tokens[k2]) k2++;
      if (k2 === viaPy.length && k2 === b.tokens.length) { decoderOk = true; dec = 'Python\'s tokens'; } else {
        const d2 = at(viaPy, k2);
        decoderOk = d2.margin !== null && d2.margin < 1.0;
        dec = 'first differs at symbol ' + k2 + ' (' + d2.field + ', Python\'s margin ' + d2.margin + ')';
      }
    }
    diffs.push({ i, k, field: first.field, margin: first.margin, js: a.tokens[k], py: b.tokens[k], decoderOk, dec });
  }
  H.ok(js.length === py.length && imgBad.length === 0, key + ': ' + js.length + ' transformer inputs (staff images) == Python\'s (sha1)' + (imgBad.length ? ' -- differ: ' + imgBad : ''));
  if (!diffs.length) { H.ok(true, key + ': every staff read the same tokens as Python (' + js.length + ' staffs)'); return; }
  for (const d of diffs) info(key + ' staff ' + d.i + ': first difference at symbol ' + d.k + ' (' + d.field + '): js "' + d.js + '" python "' + d.py + '"; Python\'s top-2 margin there ' + d.margin + '; the JS decoder on Python\'s encoder output: ' + (d.dec || 'no context file'));
  H.ok(diffs.every((d) => d.decoderOk === true), key + ': ' + diffs.length + ' staff(s) read differently; fed with Python\'s encoder output the JS decoder reads Python\'s tokens (or parts at a near tie of the decoder, margin < 1.0): ' +
    diffs.map((d) => 'staff ' + d.i + ' ' + (d.decoderOk ? 'ok' : 'NO')).join(', ') + ' -- the difference is the int8 encoder\'s numerics (onnxruntime-web WASM vs CPU, notes/read.md), not the port');
}

async function files(poolResults) {
  const cases = fileCases().filter((c) => fs.existsSync(path.join(OMRDIR, 'e2e-ref', c.key, 'summary.json')));
  console.log('--- files: ' + cases.length + ' files through the worker (' + POOL + ' helpers) vs the Python engine (e2e-ref)');
  const w = new ShimWorker();
  try {
    w.post({ cmd: 'init', pool: POOL });
    await w.wait((m) => m.type === 'ready');
    for (const c of cases) {
      const ref = H.readJson(path.join(OMRDIR, 'e2e-ref', c.key, 'summary.json'));
      const out = await workerTranslate(w, loadPages(c), { title: c.title, sourceName: c.source, withVoices: true, recordStaffs: true });
      const r = out.result;
      poolResults[c.key] = r;
      T.files.push([c.key, c.pages.length, out.ms]);
      if (!r) { H.ok(false, c.key + ': worker error ' + JSON.stringify(out.error)); continue; }
      const nPages = out.pages.length;
      H.ok(r.success === true && (ref.success || ref.lenient), c.key + ': success (Python: ' + (ref.lenient ? 'fails the file: ' + ref.engine_error + '; the JS engine writes the MIDI unexpanded' : 'success') + ')');
      H.ok(r.title === ref.title && r.summary.pagesProcessed === ref.pages_processed && r.summary.pagesSkipped === ref.pages_skipped &&
        JSON.stringify(r.summary.pageSummaries) === JSON.stringify(ref.page_summaries),
      c.key + ': title "' + r.title + '", ' + nPages + ' page(s), summaries == Python ' + JSON.stringify(r.summary.pageSummaries));
      H.ok(JSON.stringify(out.progress) === JSON.stringify(ref.progress), c.key + ': progress fractions + messages == Python (' + out.progress.length + ')');
      // every transformer call: the same staff image (sha1) and, where the tokens differ, proof that
      // the JS decoder reads Python's tokens from Python's encoder output (dump_e2e.py --contexts)
      await staffsCheck(c.key, [].concat.apply([], out.pages.map((p) => p.staffs || [])), ref.staffs || []);
      // voices per page
      let edits = 0, tokens = 0;
      out.pages.forEach((p, i) => {
        const pv = ref.pages[i] ? ref.pages[i].voices.map((v) => v.map((s) => s[0])) : [];
        const e = voiceEdits(p.voices || [], pv);
        edits += e.edits + (e.voicesSame ? 0 : 1000); tokens += e.tokens;
      });
      const raw = r.xmlRaw;
      if (edits === 0) {
        H.ok(true, c.key + ': voices == Python on every page (' + tokens + ' tokens)');
        H.ok(strip(raw) === strip(ref.musicxml), c.key + ': merged MusicXML == Python apart from imgpos comments');
        if (ref.mid) H.ok(sameBytes(new Uint8Array(r.midi), Buffer.from(ref.mid, 'base64')), c.key + ': MIDI == the engine\'s .mid byte for byte' + (ref.lenient ? ' (with music21 left unexpanded)' : ''));
      } else {
        const midiSame = ref.mid ? sameBytes(new Uint8Array(r.midi), Buffer.from(ref.mid, 'base64')) : null;
        info(c.key + ': ' + edits + ' token edit(s) in ' + tokens + ' vs Python (transformer near-ties); MusicXML apart from imgpos ' + (strip(raw) === strip(ref.musicxml) ? 'equal' : 'differs') + ', MIDI ' + (midiSame === null ? 'n/a' : midiSame ? 'byte-identical' : 'differs'));
      }
      for (const old of ['sheetlab-ref', 'sheetlab-ref2']) {
        const f = path.join(OMRDIR, old, c.key + '.musicxml');
        if (fs.existsSync(f)) H.ok(fs.readFileSync(f, 'utf8') === ref.musicxml, c.key + ': e2e-ref (fresh process) == ' + old + '/' + c.key + '.musicxml');
      }
      info(c.key + ': worker ' + secs(out.ms) + ' for ' + nPages + ' page(s) (' + out.pages.map((p) => p.label + ' ' + secs(p.timings.total)).join(', ') + ')');
    }
  } finally { await w.terminate(); }
}

// ======================================================================================== pool
async function pool(poolResults) {
  const keys = (process.env.SL_OMR_E2E_POOLCASES || 'spread,belle-let').split(',').filter((k) => poolResults[k]);
  console.log('--- pool: single-thread engine == the worker pool on ' + keys.join(', '));
  for (const k of keys) {
    const c = fileCases().find((x) => x.key === k);
    const t0 = Date.now();
    const r = await E.translate(loadPages(c), { title: c.title, sourceName: c.source });
    const ms = Date.now() - t0;
    const p = poolResults[k];
    H.ok(r.success && r.musicxml === p.musicxml && r.xmlRaw === p.xmlRaw && sameBytes(r.midi, new Uint8Array(p.midi)) &&
      JSON.stringify(r.pageSummaries) === JSON.stringify(p.summary.pageSummaries),
    k + ': single thread == ' + POOL + '-helper pool: MusicXML (imgpos included), MIDI bytes, summaries (' + secs(ms) + ' vs ' + secs(T.files.find((f) => f[0] === k)[2]) + ')');
    T.files.find((f) => f[0] === k).push(ms);
    info(k + ': single thread per page ' + r.timings.pages.map((x) => x.label + ' ' + secs(x.total) + ' (detect ' + secs(x.detect) + ', read ' + secs(x.read) + ')').join(', '));
  }
}

// ======================================================================================== worker behaviour
async function workerBehaviour() {
  console.log('--- worker: cancel, a transparent page, a blank page among music, a file without music');
  const fx = JSON.parse(fs.readFileSync(path.join(REPO_FIX, 'e2e-brahms-vals3-let.json'), 'utf8'));
  const page = grayToBgr(H.readPng(path.join(REPO_FIX, fx.image), { raw: true }));
  const white = { h: page.h, w: page.w, c: 3, data: new Uint8Array(page.w * page.h * 3).fill(255) };
  const opts = { title: fx.title, sourceName: fx.source };
  const w = new ShimWorker();
  try {
    w.post({ cmd: 'init', pool: Math.max(2, Math.min(POOL, 3)) });
    await w.wait((m) => m.type === 'ready');
    // cancel while the first page is segmented: the worker stops at its next check and drops the rest
    const data = rgbaOf(page);
    w.post({ cmd: 'page', id: 'c1', label: 'Page 1', index: 0, count: 2, image: { w: page.w, h: page.h, data: data }, opts: {} }, [data.buffer]);
    await w.wait((m) => m.id === 'c1' && m.type === 'progress' && m.stage === 'segment' && m.done > 0);
    w.post({ cmd: 'cancel', id: 'c1' });
    const d2 = rgbaOf(page);
    w.post({ cmd: 'page', id: 'c1', label: 'Page 2', index: 1, count: 2, image: { w: page.w, h: page.h, data: d2 }, opts: {} }, [d2.buffer]);
    w.post({ cmd: 'finish', id: 'c1' });
    const c = await w.wait((m) => m.id === 'c1' && (m.type === 'cancelled' || m.type === 'result' || m.type === 'error'));
    await w.wait((m) => m.id === 'c1' && m.type === 'cancelled' && m !== c, 120000).catch(() => null);
    const after = w.messages.filter((m) => m.id === 'c1');
    H.ok(c.type === 'cancelled' && !after.some((m) => m.type === 'page' || m.type === 'result' || m.type === 'pageDone'),
      'cancel during segmentation: "cancelled", no page / result afterwards (' + after.map((m) => m.type).filter((t, i, a) => a.indexOf(t) === i) + ')');
    // a transparent picture (ink as alpha, RGB 0 everywhere): composited over white it reads like the opaque page
    const tp = new Uint8ClampedArray(page.w * page.h * 4);
    for (let i = 0; i < page.w * page.h; i++) tp[i * 4 + 3] = 255 - page.data[i * 3];
    w.post({ cmd: 'page', id: 't1', label: 'Page 1', index: 0, count: 1, image: { w: page.w, h: page.h, data: tp }, opts: opts }, [tp.buffer]);
    const pd = await w.wait((m) => m.id === 't1' && (m.type === 'pageDone' || m.type === 'error'));
    w.post({ cmd: 'finish', id: 't1' });
    const tr = await w.wait((m) => m.id === 't1' && (m.type === 'result' || m.type === 'error'));
    H.ok(pd.type === 'pageDone' && tr.type === 'result' && tr.success && strip(tr.xmlRaw || '') === strip(fx.musicxml),
      'after a cancelled document: a transparent page (ink as alpha) composited over white == the opaque page\'s MusicXML (PIL\'s convert would make it black)');
    // a blank page among music: skipped as a cover page, the music merged as before
    const mixed = await workerTranslate(w, [{ label: 'Page 1', image: white }, { label: 'Page 2', image: page }], opts);
    const ms = mixed.result && mixed.result.summary;
    H.ok(mixed.result && mixed.result.success && ms.pagesSkipped === 1 && ms.pagesProcessed === 1 &&
      ms.pageSummaries[0] === 'Page 1: Skipped \u2014 Non-music / cover page (No noteheads or clefs found)' &&
      ms.pageSummaries[1] === 'Page 2: Detected 3 staff(s), 1 part(s)' && strip(mixed.result.xmlRaw) === strip(fx.musicxml) &&
      JSON.stringify(mixed.progress.map((p) => p[1])) === JSON.stringify(['Loading brahms-vals3-let.pdf...', 'Recognizing musical notation on Page 1 (1/2)...',
        'Recognizing musical notation on Page 2 (2/2)...', 'Merging staves and generating MusicXML 4.0...', 'Synthesizing MIDI & MusicXML formats...']),
    'a blank page + music: ' + JSON.stringify(ms && ms.pageSummaries) + ' (the Python engine says "OMR skipped page (No noteheads or clefs found)": homr renamed the message it looks for)');
    // a file without music
    const none = await workerTranslate(w, [{ label: 'Page 1', image: white }], opts);
    H.ok(none.result && !none.result.success && none.result.errorMessage === 'No musical staves or noteheads could be detected in this file.' &&
      none.result.midi === null && none.result.summary.pagesSkipped === 1, 'a file without music: success false, "No musical staves or noteheads could be detected in this file."');
  } finally { await w.terminate(); }
}

(async () => {
  const t0 = Date.now();
  if (want('units')) await units();
  let haveModels = !!READ;
  if (haveModels) {
    try { await H.cv(); H.ort(); } catch (e) { haveModels = false; H.skip('opencv.js / onnxruntime-web not on NODE_PATH: ' + e.message); }
  }
  if (haveModels) {
    OMR.runtime.configure({ readFile: READ, ep: 'wasm' });
    console.log('models: ' + MODELS_FROM);
  }
  if (want('ci')) { if (haveModels) await ci(); else H.skip('ci: no models (set SL_OMR_MODELS or run tools/omr/split_models.py)'); }
  if (want('pages')) { if (FULL && haveModels) await pages(); else H.skip('pages: needs SL_OMR_FIXTURES and models'); }
  if (want('prep')) { if (OMRDIR && fs.existsSync(path.join(OMRDIR, 'sheetlab-prep'))) { await H.cv(); prep(); } else H.skip('prep: needs SL_OMR_FIXTURES / SL_OMR_DIR (sheetlab-prep)'); }
  const poolResults = {};
  if (want('files')) { if (OMRDIR && haveModels && fs.existsSync(path.join(OMRDIR, 'e2e-ref'))) await files(poolResults); else H.skip('files: needs SL_OMR_DIR (e2e-ref) and models'); }
  if (want('pool')) { if (Object.keys(poolResults).length) await pool(poolResults); else H.skip('pool: runs on the files section\'s results'); }
  if (want('worker')) { if (haveModels) await workerBehaviour(); else H.skip('worker: no models'); }
  console.log('timings (Node 22, onnxruntime-web WASM, 1 thread per worker; ' + require('os').cpus().length + ' cores):');
  if (T.ci) console.log('  ci brahms-vals3 (3 staffs): single ' + secs(T.ci.single) + (T.ci.pool ? ', worker pool ' + secs(T.ci.pool) : ''));
  for (const p of T.pages) console.log('  ' + p[0] + ': ' + secs(p[1]) + ' (detect incl. segnet ' + secs(p[2]) + ', transformer ' + secs(p[3]) + ' for ' + p[4] + ' staffs)');
  for (const f of T.files) console.log('  ' + f[0] + ' (' + f[1] + ' page' + (f[1] > 1 ? 's' : '') + '): worker pool ' + secs(f[2]) + (f[3] ? ', single thread ' + secs(f[3]) : ''));
  console.log('  total ' + secs(Date.now() - t0));
  H.done();
})().catch((e) => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
