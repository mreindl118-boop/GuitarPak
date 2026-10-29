/* soundLAB OMR runtime: loads opencv.js, onnxruntime-web and the three homr models
   (github.com/liebharc/homr, AGPL-3.0) for the OMR engine, in the Web Worker, on a page or in Node.

   - opencv.js (@techstark/opencv-js 5.0.0-release.1 = OpenCV 5.0.0, the Python reference's version)
     and onnxruntime-web 1.31.1 come from jsDelivr at pinned versions, or from a same-origin
     vendor dir (configure({vendor: 'vendor/omr/'})). Every file is fetched by us, checked against
     the sha256 below, kept in Cache Storage and loaded from a blob: URL, so a second run and an
     offline run need no network and a tampered CDN file is refused.
   - ORT bundles in 1.31.1 (what each one loads, from its dist/):
       wasm   ort.wasm.min.js   -> ort-wasm-simd-threaded.mjs + .wasm            (CPU only)
       webgpu ort.webgpu.min.js -> ort-wasm-simd-threaded.asyncify.mjs + .wasm   (native WebGPU EP + CPU)
     ort.min.js / ort.all.min.js use the JSEP build (.jsep.mjs/.wasm, 29.5 MB, + WebGL in "all").
     All are classic UMD scripts (importScripts works); the .mjs is always loaded with a dynamic
     import(), which classic workers support. A worker's script URL is not the dist folder, so
     ort.env.wasm.wasmPaths must name the .mjs and .wasm.
   - Execution providers: the decoder always runs on 'wasm' (int8 MatMulInteger + com.microsoft
     contrib ops). segnet/encoder try 'webgpu' when navigator.gpu yields an adapter and the session
     can be created, else 'wasm'. Note: the shipping segnet/encoder are int8 (ConvInteger,
     MatMulInteger, DynamicQuantizeLinear) and neither ORT WebGPU EP implements those ops, so on
     WebGPU ORT assigns them to its CPU EP anyway. Measured on Chromium's SwiftShader WebGPU: segnet
     comes out bit-identical to 'wasm', the encoder does not (max |diff| 0.25 on a 1x1280x512
     output), so only ep 'wasm' keeps exact parity with the Python (CPU) reference; Node's and the
     browser's 'wasm' outputs are identical (see notes/runtime-midi.md).
   - Models: models/omr/manifest.json (tools/omr/split_models.py) lists each model's <= 14 MB parts
     with sha256; parts are fetched, verified, joined, verified again and cached whole (key = sha256).
   - Node (tests): configure({readFile}) supplies bytes from disk; Cache Storage is absent there.

   OMR.runtime = { configure, loadCv, loadOrt, manifest, modelBytes, session, release, prepare,
                   downloadSize, cachedNames, clearCache, info }
   OMR.setOrt(ort) injects an already-loaded onnxruntime (tests); OMR.setCv (cv.js) does it for cv. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};

  const CACHE_NAME = 'soundlab-omr-v1';
  const CDN = {
    cv: 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@5.0.0-release.1/dist/',
    ort: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/'
  };
  // the pinned files (bytes and sha256 of the npm tarballs = what jsDelivr serves for these versions)
  const RUNTIME_FILES = {
    'opencv.js': { pkg: 'cv', type: 'text/javascript', bytes: 13298869, sha256: 'b873c8211421da7b9bf41ae157a923f05a46a0b8d3e5904c44c6f3ad6d39a1bd' },
    'ort.wasm.min.js': { pkg: 'ort', type: 'text/javascript', bytes: 53796, sha256: 'b8a78c408c40da65fdc8ba0846f7b2948e92a4c6d6b23cc8e4165e428ad95443' },
    'ort-wasm-simd-threaded.mjs': { pkg: 'ort', type: 'text/javascript', bytes: 24738, sha256: '30ed0b5cd1182ede931fea448afb567d4dc705ec957af09f108a2be5f770dac3' },
    'ort-wasm-simd-threaded.wasm': { pkg: 'ort', type: 'application/wasm', bytes: 14848852, sha256: '4b884c203b0fa48d057be3332c65513ff85aa3c5bddd6946acc0fab7ecda001d' },
    'ort.webgpu.min.js': { pkg: 'ort', type: 'text/javascript', bytes: 70811, sha256: '03f4423bd12fdbf5eb4ffcf6c1a3c471c760e10c2a1533f1ca64f5a7619c7731' },
    'ort-wasm-simd-threaded.asyncify.mjs': { pkg: 'ort', type: 'text/javascript', bytes: 53457, sha256: '59cf781530e1a16df2a291d78798e3ec1152467edaec402d6f9599d85047c302' },
    'ort-wasm-simd-threaded.asyncify.wasm': { pkg: 'ort', type: 'application/wasm', bytes: 28747738, sha256: 'ca319e9539cd0f1e291cf56074760121eaf39650f5dbf84b6e52c07f4b2944ec' }
  };
  const BUNDLES = {
    wasm: { script: 'ort.wasm.min.js', mjs: 'ort-wasm-simd-threaded.mjs', wasm: 'ort-wasm-simd-threaded.wasm' },
    webgpu: { script: 'ort.webgpu.min.js', mjs: 'ort-wasm-simd-threaded.asyncify.mjs', wasm: 'ort-wasm-simd-threaded.asyncify.wasm' }
  };
  const MODEL_KEYS = ['segnet', 'encoder', 'decoder'];
  // the decoder needs ops no WebGPU EP has; only these may try WebGPU
  const GPU_CANDIDATES = { segnet: true, encoder: true };

  const isWorker = typeof importScripts === 'function' && typeof G.WorkerGlobalScope !== 'undefined';
  const isNode = !isWorker && typeof process !== 'undefined' && !!(process.versions && process.versions.node) &&
    typeof G.document === 'undefined';

  const cfg = {
    base: null,          // app root URL (the worker passes it); default: this script's location
    models: 'models/omr/',
    vendor: null,        // same-origin dir with the runtime files, e.g. 'vendor/omr/'
    ep: 'auto',          // 'auto' | 'wasm' | 'webgpu'
    readFile: null,      // Node: (pathFromAppRoot) -> bytes | Promise<bytes>
    cache: true,         // use Cache Storage when the platform has it
    numThreads: null     // override ort.env.wasm.numThreads
  };
  const state = {
    ort: null, ortPromise: null, cv: null, cvPromise: null, bundle: null,
    manifest: null, manifestPromise: null, gpu: undefined, gpuPromise: null, gpuInfo: null,
    sessions: {}, sessionPromises: {}, sessionInfo: {}, blobUrls: [], log: []
  };

  function note(msg) { state.log.push(msg); if (state.log.length > 50) state.log.shift(); }

  // ---- configuration ----
  function configure(opts) {
    opts = opts || {};
    for (const k of Object.keys(opts)) {
      if (!(k in cfg)) throw new Error('OMR.runtime.configure: unknown option ' + k);
      cfg[k] = opts[k];
    }
    if (opts.models !== undefined || opts.base !== undefined || opts.readFile !== undefined) {
      state.manifest = null; state.manifestPromise = null;
    }
    return Object.assign({}, cfg);
  }
  function baseUrl() {
    if (cfg.base) return cfg.base;
    return G.location ? G.location.href : 'file:///';
  }
  function abs(rel) { return new URL(rel, baseUrl()).href; }
  function dirOf(u) { return u.endsWith('/') ? u : u + '/'; }

  // ---- sha256 (crypto.subtle where present; it is missing outside secure contexts) ----
  const K256 = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function sha256js(bytes) {
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    const n = bytes.length, full = n - (n % 64);
    const tail = new Uint8Array(((n % 64) + 9 <= 64) ? 64 : 128);
    tail.set(bytes.subarray(full));
    tail[n % 64] = 0x80;
    const bits = n * 8, dv = new DataView(tail.buffer);
    dv.setUint32(tail.length - 8, Math.floor(bits / 0x100000000));
    dv.setUint32(tail.length - 4, bits >>> 0);
    function block(b, o) {
      for (let i = 0; i < 16; i++) W[i] = (b[o + 4 * i] << 24) | (b[o + 4 * i + 1] << 16) | (b[o + 4 * i + 2] << 8) | b[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) {
        const w15 = W[i - 15], w2 = W[i - 2];
        const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
        const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      let a = H[0], b2 = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K256[i] + W[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const t2 = (S0 + ((a & b2) ^ (a & c) ^ (b2 & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b2; b2 = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += b2; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    for (let o = 0; o < full; o += 64) block(bytes, o);
    for (let o = 0; o < tail.length; o += 64) block(tail, o);
    let hex = '';
    for (let i = 0; i < 8; i++) hex += (H[i] >>> 0).toString(16).padStart(8, '0');
    return hex;
  }
  async function sha256(bytes) {
    const subtle = G.crypto && G.crypto.subtle;
    if (subtle) {
      try {
        const d = new Uint8Array(await subtle.digest('SHA-256', bytes));
        let hex = '';
        for (let i = 0; i < d.length; i++) hex += d[i].toString(16).padStart(2, '0');
        return hex;
      } catch (e) { /* fall through to the JS digest */ }
    }
    return sha256js(bytes);
  }

  // ---- Cache Storage (absent in Node, may throw in private modes: then nothing is cached) ----
  async function openCache() {
    if (!cfg.cache) return null;
    try {
      if (typeof G.caches === 'undefined' || !G.caches) return null;
      return await G.caches.open(CACHE_NAME);
    } catch (e) { return null; }
  }
  // cache keys are synthetic same-origin URLs, never fetched: omr-cache/<sha256>/<name>
  function cacheKey(sha, name) { return abs('omr-cache/' + sha + '/' + name); }
  async function cacheGet(cache, sha, name) {
    if (!cache) return null;
    try {
      const res = await cache.match(cacheKey(sha, name));
      if (!res) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (await sha256(bytes) !== sha) { await cache.delete(cacheKey(sha, name)); return null; }
      return bytes;
    } catch (e) { return null; }
  }
  async function cacheHas(cache, sha, name) {
    if (!cache) return false;
    try { return !!(await cache.match(cacheKey(sha, name))); } catch (e) { return false; }
  }
  async function cachePut(cache, sha, name, bytes, type) {
    if (!cache) return false;
    try {
      await cache.put(cacheKey(sha, name), new G.Response(bytes, { headers: { 'Content-Type': type || 'application/octet-stream' } }));
      return true;
    } catch (e) { note('cache put failed for ' + name + ': ' + (e && e.message)); return false; } // quota: keep working uncached
  }

  // ---- fetching with progress ----
  async function fetchBytes(url, expect, onChunk) {
    if (typeof G.fetch !== 'function') throw new Error('OMR.runtime: no fetch() to load ' + url);
    const res = await G.fetch(url);
    if (!res.ok) throw new Error('OMR.runtime: HTTP ' + res.status + ' for ' + url);
    if (!res.body || typeof res.body.getReader !== 'function') {
      const b = new Uint8Array(await res.arrayBuffer());
      if (onChunk) onChunk(b.length);
      return b;
    }
    const reader = res.body.getReader();
    let out = new Uint8Array(expect || 1 << 20), n = 0;
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      const v = r.value;
      if (n + v.length > out.length) {  // more than announced (or unknown size): grow
        const bigger = new Uint8Array(Math.max(out.length * 2, n + v.length));
        bigger.set(out.subarray(0, n)); out = bigger;
      }
      out.set(v, n); n += v.length;
      if (onChunk) onChunk(v.length);
    }
    return n === out.length ? out : out.slice(0, n);
  }
  async function readLocal(path) {
    const b = await cfg.readFile(path);
    return b instanceof Uint8Array ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b);
  }

  // ---- runtime files (opencv.js, ORT): verified bytes -> blob: URL ----
  function runtimeSource(name) {
    const f = RUNTIME_FILES[name];
    return cfg.vendor ? abs(dirOf(cfg.vendor) + name) : CDN[f.pkg] + name;
  }
  async function runtimeBytes(name, onProgress) {
    const f = RUNTIME_FILES[name];
    const cache = await openCache();
    let bytes = await cacheGet(cache, f.sha256, name);
    if (bytes) { if (onProgress) onProgress(f.bytes, f.bytes, { name: name, cached: true, fileDone: f.bytes, fileTotal: f.bytes }); return bytes; }
    let done = 0;
    bytes = await fetchBytes(runtimeSource(name), f.bytes, (k) => {
      done += k;
      const d = Math.min(done, f.bytes);
      if (onProgress) onProgress(d, f.bytes, { name: name, cached: false, fileDone: d, fileTotal: f.bytes });
    });
    const got = await sha256(bytes);
    if (got !== f.sha256) throw new Error('OMR.runtime: ' + name + ' failed its sha256 check (got ' + got.slice(0, 12) + ')');
    await cachePut(cache, f.sha256, name, bytes, f.type);
    return bytes;
  }
  async function runtimeUrl(name, onProgress) {
    const f = RUNTIME_FILES[name];
    if (typeof G.Blob !== 'function' || !G.URL || typeof G.URL.createObjectURL !== 'function') {
      return runtimeSource(name); // no blobs: let the platform fetch it (unverified, uncached)
    }
    const bytes = await runtimeBytes(name, onProgress);
    const u = G.URL.createObjectURL(new G.Blob([bytes], { type: f.type }));
    state.blobUrls.push(u);
    return u;
  }
  function loadClassic(src) {
    if (isWorker) { G.importScripts(src); return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const s = G.document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('OMR.runtime: could not load ' + src));
      G.document.head.appendChild(s);
    });
  }

  // ---- opencv.js ----
  function settleCv(m) {
    return new Promise((resolve, reject) => {
      if (!m) { reject(new Error('OMR.runtime: opencv.js did not define cv')); return; }
      if (typeof m.then === 'function') { m.then(resolve, reject); return; } // 5.0 builds: a Promise of the module
      if (m.Mat) { resolve(m); return; }
      m.onRuntimeInitialized = () => resolve(m);
    });
  }
  async function loadCv(onProgress) {
    if (state.cv) return state.cv;
    if (!state.cvPromise) {
      state.cvPromise = (async () => {
        if (OMR.getCv) { try { state.cv = OMR.getCv(); return state.cv; } catch (e) { /* not set yet */ } }
        let m;
        if (isNode) m = require('@techstark/opencv-js');
        else {
          await loadClassic(await runtimeUrl('opencv.js', onProgress));
          m = G.cv;
        }
        const cv = await settleCv(m);
        if (OMR.setCv) OMR.setCv(cv);
        state.cv = cv;
        return cv;
      })();
      state.cvPromise.catch(() => { state.cvPromise = null; });
    }
    return state.cvPromise;
  }

  // ---- onnxruntime-web ----
  function setOrt(ort) {
    state.ort = ort;
    if (!state.bundle) state.bundle = 'injected';
    applyEnv(ort);
  }
  function applyEnv(ort) {
    const env = ort && ort.env;
    if (!env || !env.wasm) return;
    const coi = !!G.crossOriginIsolated;
    const hc = (G.navigator && G.navigator.hardwareConcurrency) || 1;
    env.wasm.numThreads = cfg.numThreads != null ? cfg.numThreads : (coi ? Math.min(4, hc) : 1);
    env.wasm.proxy = false;
    try { env.logLevel = 'error'; } catch (e) { /* older builds: read-only */ }
  }
  async function gpuAdapter() {
    if (state.gpu !== undefined) return state.gpu;
    if (!state.gpuPromise) {
      state.gpuPromise = (async () => {
        const gpu = G.navigator && G.navigator.gpu;
        if (!gpu || typeof gpu.requestAdapter !== 'function') return null;
        try {
          const a = await gpu.requestAdapter();
          if (a) {
            const i = a.info || {};
            state.gpuInfo = { vendor: i.vendor || '', architecture: i.architecture || '', description: i.description || '' };
          }
          return a || null;
        } catch (e) { note('requestAdapter failed: ' + (e && e.message)); return null; }
      })().then((a) => { state.gpu = a; return a; });
    }
    return state.gpuPromise;
  }
  async function chooseBundle() {
    if (cfg.ep === 'wasm' || isNode) return 'wasm';
    if (cfg.ep === 'webgpu') return 'webgpu';
    return (await gpuAdapter()) ? 'webgpu' : 'wasm';
  }
  async function loadOrt(onProgress) {
    if (state.ort) return state.ort;
    if (!state.ortPromise) {
      state.ortPromise = (async () => {
        let ort;
        if (isNode) {
          ort = require('onnxruntime-web');
          state.bundle = 'node';
        } else {
          const bundle = await chooseBundle();
          const b = BUNDLES[bundle];
          const files = [b.script, b.mjs, b.wasm];
          const total = files.reduce((s, f) => s + RUNTIME_FILES[f].bytes, 0);
          const doneBy = {};
          const prog = onProgress ? (d, t, i) => {  // one stream over the bundle's three files
            doneBy[i.name] = i.fileDone;
            onProgress(Object.values(doneBy).reduce((s, v) => s + v, 0), total, i);
          } : null;
          const urls = [];
          for (const f of files) urls.push(await runtimeUrl(f, prog));
          await loadClassic(urls[0]);
          ort = G.ort;
          if (!ort || !ort.InferenceSession) throw new Error('OMR.runtime: ' + b.script + ' did not define ort');
          // the .mjs is import()ed and fetches the .wasm: name both (the worker URL is not dist/)
          ort.env.wasm.wasmPaths = { mjs: urls[1], wasm: urls[2] };
          state.bundle = bundle;
        }
        state.ort = ort;
        applyEnv(ort);
        return ort;
      })();
      state.ortPromise.catch(() => { state.ortPromise = null; });
    }
    return state.ortPromise;
  }

  // ---- models ----
  async function manifest() {
    if (state.manifest) return state.manifest;
    if (!state.manifestPromise) {
      state.manifestPromise = (async () => {
        const rel = dirOf(cfg.models) + 'manifest.json';
        let text = null, err = null;
        const cache = await openCache();
        if (cfg.readFile) text = new TextDecoder().decode(await readLocal(rel));
        else {
          try {
            const res = await G.fetch(abs(rel), { cache: 'no-cache' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            text = await res.text();
            if (cache) { try { await cache.put(abs('omr-cache/manifest.json'), new G.Response(text, { headers: { 'Content-Type': 'application/json' } })); } catch (e) { /* uncached */ } }
          } catch (e) {
            err = e;
            if (cache) { try { const r = await cache.match(abs('omr-cache/manifest.json')); if (r) text = await r.text(); } catch (x) { /* none */ } }
          }
        }
        if (text == null) throw new Error('OMR.runtime: no model manifest (' + (err && err.message) + ')');
        const m = JSON.parse(text);
        for (const k of MODEL_KEYS) if (!m.models || !m.models[k]) throw new Error('OMR.runtime: manifest lacks ' + k);
        state.manifest = m;
        if (cache && !err) prune(cache, m); // drop models of an older manifest (not awaited)
        return m;
      })();
      state.manifestPromise.catch(() => { state.manifestPromise = null; });
    }
    return state.manifestPromise;
  }
  async function prune(cache, m) {
    try {
      const keep = new Set([abs('omr-cache/manifest.json')]);
      for (const k of MODEL_KEYS) keep.add(cacheKey(m.models[k].sha256, k + '.onnx'));
      for (const n of Object.keys(RUNTIME_FILES)) keep.add(cacheKey(RUNTIME_FILES[n].sha256, n));
      for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
    } catch (e) { /* best effort */ }
  }
  // 'segnet' | 'encoder' | 'decoder', or homr's file name (manifest source, FilePaths.encoderPath ...)
  function modelKey(name, m) {
    if (MODEL_KEYS.indexOf(name) >= 0) return name;
    const base = String(name).split('/').pop();
    for (const k of MODEL_KEYS) if (m && m.models[k].source === base) return k;
    throw new Error('OMR.runtime: unknown model ' + name);
  }
  async function modelBytes(name, onProgress) {
    const m = await manifest();
    const key = modelKey(name, m), e = m.models[key];
    const cache = await openCache();
    const hit = await cacheGet(cache, e.sha256, key + '.onnx');
    if (hit) { if (onProgress) onProgress(e.bytes, e.bytes, { name: key, cached: true, fileDone: e.bytes, fileTotal: e.bytes }); return hit; }
    const out = new Uint8Array(e.bytes);
    let off = 0;
    for (const p of e.parts) {
      const rel = dirOf(cfg.models) + p.file;
      let partDone = 0;
      const part = cfg.readFile ? await readLocal(rel) : await fetchBytes(abs(rel), p.bytes, (k) => {
        partDone += k;
        const d = Math.min(off + partDone, e.bytes);
        if (onProgress) onProgress(d, e.bytes, { name: key, file: p.file, cached: false, fileDone: d, fileTotal: e.bytes });
      });
      if (part.length !== p.bytes) throw new Error('OMR.runtime: ' + p.file + ' has ' + part.length + ' bytes, expected ' + p.bytes);
      if (await sha256(part) !== p.sha256) throw new Error('OMR.runtime: ' + p.file + ' failed its sha256 check');
      if (off + part.length > out.length) throw new Error('OMR.runtime: ' + key + ' parts exceed ' + e.bytes + ' bytes');
      out.set(part, off); off += part.length;
      if (onProgress) onProgress(off, e.bytes, { name: key, file: p.file, cached: false, fileDone: off, fileTotal: e.bytes });
    }
    if (off !== e.bytes) throw new Error('OMR.runtime: ' + key + ' parts give ' + off + ' bytes, expected ' + e.bytes);
    if (await sha256(out) !== e.sha256) throw new Error('OMR.runtime: ' + key + ' failed its sha256 check');
    await cachePut(cache, e.sha256, key + '.onnx', out);
    return out;
  }

  // ---- sessions ----
  async function epFor(key, ep) {
    ep = ep || cfg.ep;
    if (!GPU_CANDIDATES[key] || ep === 'wasm' || isNode) return 'wasm';
    if (state.bundle !== 'webgpu') return 'wasm'; // the loaded ORT has no WebGPU EP
    if (ep === 'webgpu') return 'webgpu';
    return (await gpuAdapter()) ? 'webgpu' : 'wasm';
  }
  async function session(name, opts) {
    opts = opts || {};
    const m = await manifest();
    const key = modelKey(name, m);
    if (state.sessions[key]) return state.sessions[key];
    if (!state.sessionPromises[key]) {
      state.sessionPromises[key] = (async () => {
        const ort = await loadOrt(opts.onRuntimeProgress);
        const bytes = await modelBytes(key, opts.onProgress);
        const want = await epFor(key, opts.ep);
        const t0 = Date.now();
        let s = null, ep = 'wasm', fallback = null;
        if (want === 'webgpu') {
          try {
            s = await ort.InferenceSession.create(bytes, { executionProviders: ['webgpu'] });
            ep = 'webgpu';
          } catch (e) { fallback = String(e && e.message || e).slice(0, 300); note(key + ': webgpu session failed, using wasm: ' + fallback); }
        }
        if (!s) s = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
        state.sessionInfo[key] = { ep: ep, wanted: want, fallback: fallback, createMs: Date.now() - t0, bytes: bytes.length };
        state.sessions[key] = s;
        return s;
      })();
      state.sessionPromises[key].catch(() => { delete state.sessionPromises[key]; });
    }
    return state.sessionPromises[key];
  }
  async function release(name) {
    const names = name ? [modelKey(name, state.manifest)] : Object.keys(state.sessions);
    for (const k of names) {
      const s = state.sessions[k];
      delete state.sessions[k]; delete state.sessionPromises[k];
      if (s && s.release) { try { await s.release(); } catch (e) { /* already gone */ } }
    }
  }
  // everything a run needs: runtime files + the three models (one progress stream)
  async function prepare(onProgress) {
    const size = await downloadSize();
    const doneBy = {};
    const prog = (d, t, i) => {  // bytes actually downloaded (cached files count 0) of size.total
      doneBy[i.name] = i.cached ? 0 : i.fileDone;
      const done = Object.values(doneBy).reduce((s, v) => s + v, 0);
      if (onProgress) onProgress(Math.min(done, size.total), size.total, i);
    };
    await loadCv(prog);
    await loadOrt(prog);
    for (const k of MODEL_KEYS) await session(k, { onProgress: prog });
    return info();
  }

  // ---- what a first run downloads ----
  async function downloadSize() {
    const m = await manifest();
    const cache = await openCache();
    const files = [];
    for (const k of MODEL_KEYS) {
      const e = m.models[k];
      files.push({ name: k, kind: 'model', bytes: e.bytes, cached: await cacheHas(cache, e.sha256, k + '.onnx') });
    }
    if (!isNode) {
      const b = BUNDLES[state.bundle === 'webgpu' || state.bundle === 'wasm' ? state.bundle : await chooseBundle()];
      for (const n of ['opencv.js', b.script, b.mjs, b.wasm]) {
        const f = RUNTIME_FILES[n];
        const loaded = (n === 'opencv.js' && state.cv) || (n !== 'opencv.js' && state.ort);
        files.push({ name: n, kind: 'runtime', bytes: f.bytes, cached: !!loaded || await cacheHas(cache, f.sha256, n) });
      }
    }
    const sum = (kind) => files.filter((f) => !f.cached && (!kind || f.kind === kind)).reduce((s, f) => s + f.bytes, 0);
    return { total: sum(), models: sum('model'), runtime: sum('runtime'), files: files, cacheAvailable: !!cache };
  }
  async function cachedNames() {
    const cache = await openCache();
    if (!cache) return [];
    const out = [];
    let m = null;
    try { m = await manifest(); } catch (e) { /* offline without a cached manifest */ }
    if (m) for (const k of MODEL_KEYS) if (await cacheHas(cache, m.models[k].sha256, k + '.onnx')) out.push(k);
    for (const n of Object.keys(RUNTIME_FILES)) if (await cacheHas(cache, RUNTIME_FILES[n].sha256, n)) out.push(n);
    return out;
  }
  async function clearCache() {
    try {
      if (typeof G.caches === 'undefined' || !G.caches) return false;
      return await G.caches.delete(CACHE_NAME);
    } catch (e) { return false; }
  }
  function info() {
    const ort = state.ort;
    return {
      platform: isNode ? 'node' : isWorker ? 'worker' : 'page',
      ortVersion: ort && ort.env && ort.env.versions ? (ort.env.versions.web || ort.env.versions.common || '') : '',
      bundle: state.bundle,
      numThreads: ort && ort.env && ort.env.wasm ? ort.env.wasm.numThreads : null,
      crossOriginIsolated: !!G.crossOriginIsolated,
      webgpu: state.gpu === undefined ? 'unknown' : !!state.gpu,
      gpu: state.gpuInfo,
      cvLoaded: !!state.cv,
      manifestVersion: state.manifest ? state.manifest.version : null,
      sessions: JSON.parse(JSON.stringify(state.sessionInfo)),
      source: cfg.vendor ? 'vendor:' + cfg.vendor : 'jsdelivr',
      log: state.log.slice()
    };
  }

  OMR.setOrt = setOrt;
  OMR.runtime = {
    configure: configure, loadCv: loadCv, loadOrt: loadOrt, manifest: manifest, modelBytes: modelBytes,
    session: session, release: release, prepare: prepare, downloadSize: downloadSize,
    cachedNames: cachedNames, clearCache: clearCache, info: info,
    // constants for the UI / tests
    CACHE_NAME: CACHE_NAME, CDN: CDN, RUNTIME_FILES: RUNTIME_FILES, BUNDLES: BUNDLES, MODEL_KEYS: MODEL_KEYS,
    sha256: sha256, _sha256js: sha256js
  };
})(typeof self !== 'undefined' ? self : globalThis);
