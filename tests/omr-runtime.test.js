// OMR engine: runtime loading (js/omr/runtime.js) - model manifest + parts, sha256, Cache Storage,
// runtime-file pinning, and a real onnxruntime-web 'wasm' session per shipping model.
//   SL_OMR_MODELS  dir with the three shipping .onnx models (model checks skip without it)
// The worker path (fetch + Cache Storage + blob: URLs + importScripts) runs in a vm context that
// looks like a Web Worker, with fake fetch/caches serving files from disk; it needs no models.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { resolveObjectURL } = require('buffer');
const H = require('./omr/harness');

const RT_SRC = fs.readFileSync(path.join(H.ROOT, 'js', 'omr', 'runtime.js'), 'utf8');
const MODELS_DIR = path.join(H.ROOT, 'models', 'omr');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// ---- a fresh runtime in a Web-Worker-like vm context ----
function workerRuntime(files, opts) {
  opts = opts || {};
  const log = { fetches: [], imports: [] };
  const store = new Map();
  const caches = opts.noCaches ? undefined : {
    async open(name) {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name);
      return {
        async match(req) { const r = m.get(typeof req === 'string' ? req : req.url); return r ? r.clone() : undefined; },
        async put(req, res) { m.set(typeof req === 'string' ? req : req.url, res); },
        async delete(req) { return m.delete(typeof req === 'string' ? req : req.url); },
        async keys() { return [...m.keys()].map((url) => ({ url })); }
      };
    },
    async delete(name) { return store.delete(name); }
  };
  const sb = {
    console, setTimeout, clearTimeout, TextDecoder, TextEncoder, Blob, URL, Response, Uint8Array, DataView,
    crypto: opts.noSubtle ? {} : globalThis.crypto,
    caches,
    navigator: { hardwareConcurrency: 8 },
    location: { href: 'https://soundlab.test/js/omr/worker.js' },
    crossOriginIsolated: false,
    WorkerGlobalScope: function WorkerGlobalScope() {},
    async fetch(url) {
      log.fetches.push(url);
      if (opts.offline) throw new TypeError('Failed to fetch');
      const b = files[url];
      if (b === undefined) return new Response('not found', { status: 404 });
      // stream in small chunks so progress is exercised
      let i = 0;
      const body = new ReadableStream({ pull(c) { if (i >= b.length) c.close(); else { c.enqueue(b.subarray(i, i + 65536)); i += 65536; } } });
      return new Response(body, { status: 200 });
    },
    importScripts(u) {
      log.imports.push(u);
      const blob = resolveObjectURL(u);
      if (!blob) throw new Error('importScripts: not a blob url ' + u);
      sb.ort = { InferenceSession: {}, env: { wasm: {}, versions: { web: 'fake' } } };  // stands in for ort.wasm.min.js
    }
  };
  sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(RT_SRC, sb, { filename: 'runtime.js' });
  return { OMR: sb.OMR, sb, log, store };
}

(async () => {
  // ---- sha256: JS fallback == node crypto at block boundaries ----
  {
    const { OMR } = workerRuntime({});
    let same = true;
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 128, 1000, 100003]) {
      const b = crypto.randomBytes(n);
      if (OMR.runtime._sha256js(new Uint8Array(b)) !== sha(b)) { same = false; console.log('  sha256js differs at', n); }
    }
    H.ok(same, 'sha256 JS fallback matches crypto at block boundaries');
    const b = crypto.randomBytes(3000);
    H.ok(await OMR.runtime.sha256(new Uint8Array(b)) === sha(b), 'sha256 via crypto.subtle');
  }

  // ---- runtime file table == the npm packages (= what jsDelivr serves for the pinned versions) ----
  {
    const { OMR } = workerRuntime({});
    const RF = OMR.runtime.RUNTIME_FILES;
    let all = true, checked = 0;
    for (const n of Object.keys(RF)) {
      const p = RF[n].pkg === 'cv' ? require.resolve('@techstark/opencv-js/dist/opencv.js')
        : path.join(path.dirname(require.resolve('onnxruntime-web')), n);
      if (!fs.existsSync(p)) { all = false; console.log('  missing', p); continue; }
      const b = fs.readFileSync(p);
      if (b.length !== RF[n].bytes || sha(b) !== RF[n].sha256) { all = false; console.log('  differs', n); }
      checked++;
    }
    H.ok(all && checked === 7, 'pinned runtime files: bytes + sha256 match the npm packages (' + checked + ' files)');
    const ortPkg = JSON.parse(fs.readFileSync(path.join(path.dirname(require.resolve('onnxruntime-web')), '..', 'package.json'), 'utf8'));
    H.ok(ortPkg.version === '1.31.1' && OMR.runtime.CDN.ort.includes('onnxruntime-web@1.31.1'), 'onnxruntime-web 1.31.1 pinned');
    // each bundle's script names the .mjs it imports
    const dist = path.dirname(require.resolve('onnxruntime-web'));
    let bundlesOk = true;
    for (const [k, b] of Object.entries(OMR.runtime.BUNDLES)) {
      const src = fs.readFileSync(path.join(dist, b.script), 'utf8');
      if (!src.includes(b.mjs) || !b.wasm.startsWith(b.mjs.replace(/\.mjs$/, ''))) { bundlesOk = false; console.log('  bundle', k); }
    }
    H.ok(bundlesOk, 'bundle script -> .mjs -> .wasm names agree with the dist files');
  }

  // ---- worker path with a synthetic manifest (no models needed) ----
  {
    const base = 'https://soundlab.test/app/';
    const files = {};
    const models = {};
    const manifest = { version: 'test', partMax: 1000, models: {} };
    for (const [k, n] of [['segnet', 2500], ['encoder', 1000], ['decoder', 3001]]) {
      const whole = crypto.randomBytes(n);
      models[k] = whole;
      const parts = [];
      for (let i = 0; i * 1000 < n; i++) {
        const c = whole.subarray(i * 1000, (i + 1) * 1000);
        const file = k + '.onnx.part' + String(i).padStart(2, '0');
        files[base + 'models/omr/' + file] = new Uint8Array(c);
        parts.push({ file, bytes: c.length, sha256: sha(c) });
      }
      manifest.models[k] = { source: k + '_x.onnx', bytes: n, sha256: sha(whole), parts };
    }
    files[base + 'models/omr/manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest));
    // runtime files served from the npm packages at their CDN URLs
    const dist = path.dirname(require.resolve('onnxruntime-web'));
    const W = workerRuntime(files);
    for (const [n, f] of Object.entries(W.OMR.runtime.RUNTIME_FILES)) {
      if (f.pkg === 'ort' && /wasm/.test(n) && !/asyncify/.test(n)) files[W.OMR.runtime.CDN.ort + n] = new Uint8Array(fs.readFileSync(path.join(dist, n)));
    }
    const rt = W.OMR.runtime;
    rt.configure({ base, ep: 'wasm' });
    const size = await rt.downloadSize();
    const rtBytes = ['opencv.js', 'ort.wasm.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'].reduce((s, n) => s + rt.RUNTIME_FILES[n].bytes, 0);
    H.ok(size.models === 6501 && size.runtime === rtBytes && size.total === 6501 + rtBytes && size.cacheAvailable,
      'downloadSize before the first run: models ' + size.models + ' + runtime ' + size.runtime + ' (wasm bundle)');
    const prog = [];
    const seg = await rt.modelBytes('segnet', (d, t, i) => prog.push([d, t, i.cached]));
    H.ok(sha(seg) === manifest.models.segnet.sha256 && seg.length === 2500, 'modelBytes joins verified parts');
    H.ok(prog.length >= 3 && prog.every((p, i) => p[1] === 2500 && (i === 0 || p[0] >= prog[i - 1][0])) && prog[prog.length - 1][0] === 2500,
      'progress is monotonic bytes done/total and ends at the model size (' + prog.length + ' calls)');
    const nFetch = W.log.fetches.length;
    const prog2 = [];
    const seg2 = await rt.modelBytes('segnet_x.onnx', (d, t, i) => prog2.push([d, t, i.cached]));
    H.ok(sha(seg2) === sha(seg) && W.log.fetches.length === nFetch && prog2.length === 1 && prog2[0][2] === true,
      'second load comes from Cache Storage (no fetch), also by homr file name');
    H.ok(JSON.stringify(await rt.cachedNames()) === '["segnet"]', 'cachedNames lists the cached model');
    // a tampered part is refused
    const bad = new Uint8Array(files[base + 'models/omr/encoder.onnx.part00']); bad[7] ^= 1;
    const W2 = workerRuntime(Object.assign({}, files, { [base + 'models/omr/encoder.onnx.part00']: bad }));
    W2.OMR.runtime.configure({ base, ep: 'wasm' });
    let err = '';
    try { await W2.OMR.runtime.modelBytes('encoder'); } catch (e) { err = e.message; }
    H.ok(/encoder\.onnx\.part00 failed its sha256 check/.test(err), 'a tampered part fails its sha256 check');
    // loadOrt: fetch + verify + cache the runtime files, importScripts a blob:, name .mjs/.wasm for ORT
    let rtProg = 0, rtTotal = 0;
    const ort = await rt.loadOrt((d, t) => { rtProg = d; rtTotal = t; });
    const inf = rt.info();
    H.ok(W.log.imports.length === 1 && /^blob:/.test(W.log.imports[0]) && /^blob:/.test(ort.env.wasm.wasmPaths.mjs) &&
      /^blob:/.test(ort.env.wasm.wasmPaths.wasm) && W.log.fetches.includes(rt.CDN.ort + 'ort.wasm.min.js'),
    'loadOrt: ort.wasm.min.js from jsDelivr via a verified blob, wasmPaths {mjs, wasm} set');
    H.ok(ort.env.wasm.numThreads === 1 && ort.env.wasm.proxy === false && inf.bundle === 'wasm' && inf.platform === 'worker',
      'single thread without crossOriginIsolated, proxy off, wasm bundle');
    H.ok(rtProg === rtTotal && rtTotal === rtBytes - rt.RUNTIME_FILES['opencv.js'].bytes, 'runtime progress covers the bundle files');
    const names = await rt.cachedNames();
    H.ok(names.includes('ort-wasm-simd-threaded.wasm') && names.includes('ort.wasm.min.js'), 'runtime files cached by sha256');
    // a wrong CDN file is refused
    const W3 = workerRuntime(Object.assign({}, files, { [rt.CDN.ort + 'ort.wasm.min.js']: new Uint8Array([1, 2, 3]) }));
    W3.OMR.runtime.configure({ base, ep: 'wasm' });
    err = '';
    try { await W3.OMR.runtime.loadOrt(); } catch (e) { err = e.message; }
    H.ok(/ort\.wasm\.min\.js failed its sha256 check/.test(err) && W3.log.imports.length === 0, 'a runtime file with the wrong sha256 is never run');
    // vendor override: same files from the app's own origin
    const vfiles = {};
    for (const n of ['ort.wasm.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) vfiles[base + 'vendor/omr/' + n] = files[rt.CDN.ort + n];
    const W4 = workerRuntime(Object.assign({}, files, vfiles));
    W4.OMR.runtime.configure({ base, ep: 'wasm', vendor: 'vendor/omr/' });
    await W4.OMR.runtime.loadOrt();
    H.ok(W4.log.fetches.includes(base + 'vendor/omr/ort-wasm-simd-threaded.wasm') && !W4.log.fetches.some((u) => u.startsWith('https://cdn.jsdelivr.net/')),
      'vendor override loads everything same-origin');
    // offline: manifest + models come from the cache of an earlier run
    const W5 = workerRuntime(files);
    W5.OMR.runtime.configure({ base, ep: 'wasm' });
    for (const k of ['segnet', 'encoder', 'decoder']) await W5.OMR.runtime.modelBytes(k);
    const sizeAfter = await W5.OMR.runtime.downloadSize();
    W5.sb.fetch = async () => { throw new TypeError('Failed to fetch'); };
    W5.OMR.runtime.configure({ base });  // drops the in-memory manifest
    const dec = await W5.OMR.runtime.modelBytes('decoder');
    H.ok(sha(dec) === manifest.models.decoder.sha256 && sizeAfter.models === 0, 'offline second run: manifest and models from Cache Storage');
    H.ok(await W5.OMR.runtime.clearCache() === true && (await W5.OMR.runtime.cachedNames()).length === 0, 'clearCache empties soundlab-omr-v1');
    // no Cache Storage, no crypto.subtle (plain http): still verified, nothing cached, no throw
    const W6 = workerRuntime(files, { noCaches: true, noSubtle: true });
    W6.OMR.runtime.configure({ base, ep: 'wasm' });
    const d6 = await W6.OMR.runtime.modelBytes('decoder');
    const s6 = await W6.OMR.runtime.downloadSize();
    H.ok(sha(d6) === manifest.models.decoder.sha256 && !s6.cacheAvailable && JSON.stringify(await W6.OMR.runtime.cachedNames()) === '[]' &&
      await W6.OMR.runtime.clearCache() === false, 'without Cache Storage / crypto.subtle: verified by the JS sha256, uncached, no throw');
    // auto EP without navigator.gpu picks the wasm bundle
    const W7 = workerRuntime(files);
    W7.OMR.runtime.configure({ base });
    H.ok((await W7.OMR.runtime.downloadSize()).files.some((f) => f.name === 'ort-wasm-simd-threaded.wasm'), "ep 'auto' without navigator.gpu -> wasm bundle");
    W7.sb.navigator.gpu = { requestAdapter: async () => ({ info: { vendor: 'test' } }) };
    const W8 = workerRuntime(files);
    W8.sb.navigator.gpu = { requestAdapter: async () => ({ info: { vendor: 'test' } }) };
    W8.OMR.runtime.configure({ base });
    const s8 = await W8.OMR.runtime.downloadSize();
    H.ok(s8.files.some((f) => f.name === 'ort-wasm-simd-threaded.asyncify.wasm') && W8.OMR.runtime.info().webgpu === true,
      "ep 'auto' with a WebGPU adapter -> webgpu bundle (ort.webgpu.min.js + asyncify wasm)");
  }

  // ---- the real models (Node: readFile, onnxruntime-web 'wasm') ----
  if (!H.MODELS) { H.skip('(no models): set SL_OMR_MODELS for the manifest and session checks'); H.done(); return; }
  if (!fs.existsSync(path.join(MODELS_DIR, 'manifest.json'))) {
    H.skip('(models/omr not generated): run python -I tools/omr/split_models.py $SL_OMR_MODELS'); H.done(); return;
  }
  require(path.join(H.ROOT, 'js', 'omr', 'runtime.js'));
  const OMR = globalThis.OMR;
  const rt = OMR.runtime;
  const ort = H.ort();
  rt.configure({ readFile: (p) => fs.readFileSync(path.join(H.ROOT, p)), ep: 'auto' });
  const man = await rt.manifest();
  // manifest integrity: parts <= 14 MB, part hashes, parts join to the model, model == SL_OMR_MODELS file
  for (const k of rt.MODEL_KEYS) {
    const e = man.models[k];
    const src = path.join(H.MODELS, e.source);
    const whole = fs.readFileSync(src);
    let joined = [], okParts = true;
    for (const p of e.parts) {
      const b = fs.readFileSync(path.join(MODELS_DIR, p.file));
      if (b.length !== p.bytes || b.length > 14000000 || sha(b) !== p.sha256) okParts = false;
      joined.push(b);
    }
    const j = Buffer.concat(joined);
    H.ok(okParts && j.length === e.bytes && sha(j) === e.sha256 && sha(whole) === e.sha256 && whole.length === e.bytes,
      k + ': ' + e.parts.length + ' parts (<= 14,000,000 bytes) join to ' + e.source + ' (' + e.bytes + ' bytes, sha256 ok)');
  }
  const total = rt.MODEL_KEYS.reduce((s, k) => s + man.models[k].bytes, 0);
  H.ok(man.bytes === total && /^omr-[0-9a-f]{12}$/.test(man.version), 'manifest total ' + total + ' bytes, version ' + man.version);
  const b = await rt.modelBytes('encoder');
  H.ok(sha(b) === man.models.encoder.sha256, 'modelBytes via readFile');
  const ds = await rt.downloadSize();
  H.ok(ds.models === total && ds.runtime === 0 && ds.cacheAvailable === false, 'Node: no Cache Storage, nothing throws');

  const t0 = Date.now();
  const seg = await rt.session('segnet');
  const out1 = await seg.run({ input: new ort.Tensor('float32', new Float32Array(3 * 320 * 320).fill(255), [1, 3, 320, 320]) });
  const o1 = out1[seg.outputNames[0]];
  H.ok(seg.inputNames[0] === 'input' && o1.dims.join() === '1,6,320,320' && o1.data.every(Number.isFinite),
    'segnet runs on wasm: white 1x3x320x320 tile -> ' + o1.dims.join('x') + ' (' + (Date.now() - t0) + ' ms)');
  H.ok(rt.info().sessions.segnet.ep === 'wasm' && (await rt.session('segnet')) === seg, 'segnet session is kept and reused');

  const t1 = Date.now();
  const enc = await rt.session(man.models.encoder.source);  // = homr's FilePaths().encoder_path
  const out2 = await enc.run({ input: new ort.Tensor('float32', new Float32Array(256 * 1280).fill(0.5), [1, 1, 256, 1280]) });
  const o2 = out2[enc.outputNames[0]];
  H.ok(o2.dims.join() === '1,1280,512' && o2.data.every(Number.isFinite),
    'encoder runs on wasm (opened by homr file name): 1x1x256x1280 -> ' + o2.dims.join('x') + ' (' + (Date.now() - t1) + ' ms)');

  const t2 = Date.now();
  const dec = await rt.session('decoder', { ep: 'webgpu' });
  const i64 = (v, dims) => new ort.Tensor('int64', BigInt64Array.from([BigInt(v)]), dims || [1, 1]);
  const feeds = { rhythms: i64(1), pitchs: i64(0), lifts: i64(0), articulations: i64(0), slurs: i64(0),
    context: o2, cache_len: i64(0, [1]) };
  for (let i = 0; i < 32; i++) feeds['cache_in' + i] = new ort.Tensor('float32', new Float32Array(0), [1, 8, 0, 64]);
  const out3 = await dec.run(feeds);
  H.ok(out3.out_rhythms.dims.join() === '1,1,278' && out3.out_pitchs.dims.join() === '1,1,72' && out3.cache_out0.dims.join() === '1,8,1,64' &&
    out3.out_rhythms.data.every(Number.isFinite), 'decoder: one step with empty caches on wasm (' + (Date.now() - t2) + ' ms)');
  H.ok(rt.info().sessions.decoder.ep === 'wasm' && rt.info().sessions.decoder.wanted === 'wasm', 'decoder stays on wasm even when webgpu is asked');
  await rt.release('segnet');
  H.ok((await rt.session('segnet')) !== seg && (await rt.session('decoder')) === dec, 'release(name) frees one session; the next call makes a new one');
  await rt.release();
  H.done();
})().catch((e) => { console.log('FAIL exception ' + (e && e.stack || e)); process.exit(1); });
