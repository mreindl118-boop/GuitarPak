/* soundLAB SHEETLAB (page 'sheetlab', Play group pill "Scan", prefix sl-): printed sheet music
 * (a PDF, a photo or a scan) -> MusicXML + MIDI, read ON THIS DEVICE by the OMR engine in
 * js/omr (a port of homr, github.com/liebharc/homr, AGPL-3.0, wrapped by the owner's SheetLab
 * engine, js/omr/engine.js). Nothing is uploaded.
 *
 * - All recognition runs in a classic Web Worker (js/omr/worker.js; its message protocol is
 *   documented there). The page only decodes the file: pictures through createImageBitmap
 *   (colorSpaceConversion 'none', imageOrientation 'from-image') -> canvas -> ImageData; PDFs
 *   through pdf.js (pdfjs-dist PDFJS.version, legacy build: older iPads), loaded with a dynamic
 *   import() only when a PDF is opened, rendered one page at a time at the chosen dpi (300 or
 *   200). Each page's pixels are TRANSFERRED to the worker and the next page is rendered only
 *   after its 'pageDone', so one page image is in memory at a time.
 * - CONSENT: nothing is downloaded before the owner taps Download. On show the worker is asked
 *   what Cache Storage already holds ({cmd:'size', cachedOnly:true}: no request at all); before
 *   the first download the size shown is ESTIMATE (models/omr/manifest.json + the pinned
 *   opencv.js / onnxruntime-web wasm bundle in OMR.runtime.RUNTIME_FILES + pdf.js; the suite
 *   checks that the numbers agree). Download = the worker's 'prepare' (opencv.js + onnxruntime-web
 *   from jsDelivr, the three models from models/omr, all verified by sha256 and kept in Cache
 *   Storage 'soundlab-omr-v1') + pdf.js into 'soundlab-omr-pdfjs-v1' (verified the same way), so
 *   PDFs work offline too. Later runs say "Engine ready (offline)".
 * - Stop terminates the worker (one dense staff can take ~40 s on a phone before a soft cancel
 *   would be seen); a new one is made the next time. An idle worker is also let go a minute after
 *   the page is left (its onnxruntime sessions hold a few hundred MB).
 * - Result: editable title (re-titles the .mid / .musicxml / .mxl through js/omr/midi.js +
 *   mxl.js, loaded into the page only then), per-page summaries + previews with the systems
 *   found outlined (the engine's teaser drawables), counts, and Play on synth (MIDI Hub Player),
 *   Practice (Woodshed), Open as tab (Songs), Download .mid / .musicxml / .mxl and Save to my
 *   library (App.library.saveScan; "Also save to my library" saves every result unless unticked).
 * - Options ('guitarlab.sheetlab.*'): tempo (null = follow the shared met.bpm; never written to
 *   met.bpm), instrument (SheetLab's GM menu = OMR.midi.GM_INSTRUMENTS), transpose -12..+12,
 *   split (2-page spreads), enhance (low-res scans), dpi (300 | 200), autosave; pool ('auto' |
 *   1 | n helper workers: tests / troubleshooting, no UI).
 * - App.sheetlab = {open(file | files), convert(), stop(), state, exports()}: the hook Songs'
 *   "Open a score" card and the tests use. onRemote: hands-free control does nothing here.
 */
(function () {
  'use strict';

  // SheetLab's GM menu (tools/sheetlab_engine.py GM_INSTRUMENTS = OMR.midi.GM_INSTRUMENTS; the
  // suite checks they agree). Name -> program 0..127.
  var GM = {
    'Acoustic Grand Piano': 0, 'Bright Acoustic Piano': 1, 'Honky-tonk / Ragtime Piano': 3, 'Electric Piano (Rhodes)': 4,
    'Harpsichord': 6, 'Celesta': 8, 'Music Box': 10, 'Vibraphone': 11, 'Marimba': 12, 'Church Organ': 19, 'Accordion': 21,
    'Acoustic Guitar (Nylon)': 24, 'Acoustic Guitar (Steel)': 25, 'Electric Guitar (Jazz)': 26, 'Electric Guitar (Clean)': 27,
    'Acoustic Bass': 32, 'Violin': 40, 'Viola': 41, 'Cello': 42, 'String Ensemble': 48, 'Choir Aahs': 52, 'Trumpet': 56,
    'Trombone': 57, 'French Horn': 60, 'Alto Sax': 65, 'Tenor Sax': 66, 'Oboe': 68, 'Clarinet': 71, 'Flute': 73
  };
  var DEF_INST = 'Acoustic Grand Piano';

  // pdf.js (Apache-2.0): the pinned files with the npm tarball's bytes / sha256 (= what jsDelivr serves)
  var PDFJS = {
    version: '4.10.38',
    base: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/',
    files: {
      'pdf.min.mjs': { bytes: 398237, sha256: '44ec6f011027ee77791386b66c14876a5fc29e20bf0433c07c6726fff7212b72' },
      'pdf.worker.min.mjs': { bytes: 1417586, sha256: 'bd88805178a26c729db8c0107a5b630cb900ec070f4d8c7529a3e45530afd41d' }
    },
    cache: 'soundlab-omr-pdfjs-v1'
  };
  // what a first run downloads, before anything was cached: models/omr/manifest.json "bytes" and
  // opencv.js + ort.wasm.min.js + ort-wasm-simd-threaded.mjs/.wasm (OMR.runtime.RUNTIME_FILES)
  var ESTIMATE = { models: 77173856, runtime: 28226255, pdf: 398237 + 1417586 };
  var MAX_PIXELS = 16000000;          // a page canvas never exceeds this (iOS Safari: 16,777,216)
  var THUMB_W = 720;                  // preview picture width
  var IDLE_KILL_MS = 60000;           // an idle worker is let go this long after the page is left
  var WATCHDOG_MS = 240000;           // no word from a working worker for this long (app visible) = it died
  var IMG_RE = /\.(png|jpe?g|jfif|webp|bmp|gif|tiff?|heic|heif|avif)$/i;
  var PDF_RE = /\.pdf$/i;

  // ---------------------------------------------------------------- options

  function sharedBpm() { var v = parseInt(App.store.get('met.bpm', 120), 10); return v > 0 ? v : 120; }
  function opt() {
    var t = App.store.get('sheetlab.tempo', null);
    t = t == null ? null : Math.round(Number(t));
    if (t != null && !(t >= 20 && t <= 300)) t = null;
    var inst = App.store.get('sheetlab.instrument', DEF_INST);
    if (!Object.prototype.hasOwnProperty.call(GM, inst)) inst = DEF_INST;
    var tr = parseInt(App.store.get('sheetlab.transpose', 0), 10);
    if (!(tr >= -12 && tr <= 12)) tr = 0;
    var dpi = parseInt(App.store.get('sheetlab.dpi', 300), 10) === 200 ? 200 : 300;
    return {
      tempo: t, bpm: t == null ? sharedBpm() : t, instrument: inst, program: GM[inst], transpose: tr, dpi: dpi,
      split: App.store.get('sheetlab.split', true) !== false,
      enhance: App.store.get('sheetlab.enhance', true) !== false,
      autosave: App.store.get('sheetlab.autosave', true) !== false
    };
  }
  function poolPref() {
    var p = App.store.get('sheetlab.pool', 'auto');
    if (p === false || p === 0 || p === 1) return 1;
    if (typeof p === 'number' && p > 1) return Math.floor(p);
    return 'auto';
  }

  // ---------------------------------------------------------------- state

  var S = {
    phase: 'idle',        // idle | running | done | error | stopped
    files: [],            // one PDF, or one or more pictures (= pages, in this order)
    engine: 'unknown',    // unknown | checking | needed | downloading | ready | unavailable
    size: null,           // {total, estimate, cacheAvailable}
    engineNote: '',       // why the engine is unavailable / the download failed
    pending: false,       // Convert was tapped before the engine was there: go on after Download
    starting: false,      // Convert tapped, the engine check (a worker round trip) still running: a token
    job: null, result: null, msg: '', msgErr: false, lib: '', dl: null
  };
  var W = { w: null, n: 0, waits: {}, jobs: {}, prepared: false, cacheAvailable: true, idleT: null };
  var els = {};

  function isCancel(e) { return !!e && (e.name === 'AbortError' || e.slCancel === true); }
  function userErr(m) { var e = new Error(m); e.slUser = true; return e; }
  function cancelErr() { var e = new Error('Stopped'); e.name = 'AbortError'; e.slCancel = true; return e; }
  function errText(e) { return e && e.message ? String(e.message) : String(e || 'unknown error'); }
  function mb(bytes) { var v = bytes / 1e6; return v < 1 ? 'under 1 MB' : Math.round(v) + ' MB'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clock(ms) { var s = Math.max(0, Math.round(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function isTouch() {
    try { return (window.matchMedia && matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0; } catch (e) { return false; }
  }
  function isIOS() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function standalone() {
    try { return navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches); } catch (e) { return false; }
  }
  // the soundLAB Android app (window.GuitarLabHost): its WebView cannot open a file chooser
  // (MainActivity has no WebChromeClient.onShowFileChooser, shells up to 0.75.0), so a tap on
  // Choose a file / Take a photo does nothing there. A shell that can pick files says so with
  // GuitarLabHost.canPickFiles() returning true, and the note goes away.
  function hostCannotPick() {
    var h = window.GuitarLabHost;
    if (!h) return false;
    try { return !(typeof h.canPickFiles === 'function' && h.canPickFiles() === true); } catch (e) { return true; }
  }
  function hostNote() {
    var here = /^https?:$/.test(location.protocol) ? String(location.host + location.pathname).replace(/index\.html$/, '') : 'mreindl118-boop.github.io/GuitarPak';
    return 'The soundLAB Android app cannot open files yet (that needs an app update). To scan sheet music on this phone, ' +
      'open ' + here + ' in Chrome; the recognition engine downloads there once.';
  }
  function kindOf(f) {
    var n = String(f && f.name || ''), t = String(f && f.type || '');
    if (t === 'application/pdf' || PDF_RE.test(n)) return 'pdf';
    if (/^image\//.test(t) || IMG_RE.test(n)) return 'image';
    return '';
  }

  // ---------------------------------------------------------------- the worker

  function appBase() { return new URL('./', location.href).href; }
  function hints() {
    var nav = navigator;
    return { ios: isIOS(), deviceMemory: nav.deviceMemory, hardwareConcurrency: nav.hardwareConcurrency, userAgent: nav.userAgent || '' };
  }
  function worker() {
    if (W.w) return W.w;
    if (typeof Worker !== 'function') throw new Error('this browser cannot run background workers');
    if (typeof WebAssembly !== 'object') throw new Error('this browser has no WebAssembly');
    var w = new Worker('js/omr/worker.js');
    w.onmessage = function (e) { onMsg(w, e.data || {}); };
    w.onerror = function (e) {
      if (e && e.preventDefault) e.preventDefault();
      if (W.w === w) dropWorker(new Error('the recognition engine stopped (' + ((e && e.message) || 'worker error') + ')'));
    };
    w.onmessageerror = function () { if (W.w === w) dropWorker(new Error('the recognition engine sent something unreadable')); };
    var init = { cmd: 'init', base: appBase(), pool: poolPref(), hints: hints() };
    if (typeof window.SL_OMR_VENDOR === 'string') init.vendor = window.SL_OMR_VENDOR; // offline dev: same-origin runtime files
    w.postMessage(init);
    W.w = w;
    return w;
  }
  // terminate the worker; everything waiting on it fails with `err` (a cancel for Stop)
  function dropWorker(err) {
    var w = W.w;
    W.w = null; W.prepared = false;
    if (w) { try { w.terminate(); } catch (e) { /* gone */ } }
    var waits = W.waits; W.waits = {};
    Object.keys(waits).forEach(function (k) { try { waits[k].rej(err); } catch (e) { /* settled */ } });
    var jobs = W.jobs; W.jobs = {};
    Object.keys(jobs).forEach(function (k) { jobFail(jobs[k], err); });
  }
  function onMsg(w, m) {
    if (w !== W.w) return; // a terminated worker's last words
    if (m.type === 'ready' || m.type === 'log') return;
    var job = m.id != null ? W.jobs[m.id] : null;
    if (job) { onJobMsg(job, m); return; }
    var wt = m.id != null ? W.waits[m.id] : null;
    if (!wt) return;
    if (m.type === 'progress') { if (wt.progress) { try { wt.progress(m); } catch (e) { /* UI */ } } return; }
    if (m.type === 'error' || m.type === 'cancelled') {
      delete W.waits[m.id];
      wt.rej(m.type === 'cancelled' ? cancelErr() : workerErr(m));
      return;
    }
    if (wt.types.indexOf(m.type) >= 0) { delete W.waits[m.id]; wt.res(m); }
  }
  function workerErr(m) { var e = new Error(m.message || 'the recognition engine failed'); e.name = m.name || 'Error'; return e; }
  function ask(msg, types, progress) {
    return new Promise(function (res, rej) {
      var w;
      try { w = worker(); } catch (e) { rej(e); return; }
      var id = 'sl-' + (++W.n);
      W.waits[id] = { res: res, rej: rej, types: types, progress: progress || null };
      msg.id = id;
      w.postMessage(msg);
    });
  }
  function scheduleIdleKill() {
    clearTimeout(W.idleT);
    W.idleT = setTimeout(function () {
      if (App.active !== 'sheetlab' && S.phase !== 'running' && S.engine !== 'downloading' && W.w && !Object.keys(W.waits).length) {
        dropWorker(cancelErr());
        if (S.engine === 'ready' && !W.cacheAvailable) S.engine = 'unknown'; // it lived in that worker only
      }
    }, IDLE_KILL_MS);
  }

  // ---------------------------------------------------------------- pdf.js (fetched, verified, cached, imported from a blob)

  var PDF = { lib: null, promise: null, ctl: null };
  function hex(buf) { return Array.from(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
  function canVerify() { return !!(window.crypto && crypto.subtle && typeof crypto.subtle.digest === 'function'); }
  function pdfKey(name) { var f = PDFJS.files[name]; return new URL('omr-cache/pdfjs/' + f.sha256 + '/' + name, appBase()).href; }
  function openPdfCache() {
    try { if (!window.caches) return Promise.resolve(null); return caches.open(PDFJS.cache).catch(function () { return null; }); } catch (e) { return Promise.resolve(null); }
  }
  function pdfCached() {
    if (PDF.lib) return Promise.resolve(true);
    return openPdfCache().then(function (c) {
      if (!c) return false;
      return Promise.all(Object.keys(PDFJS.files).map(function (n) { return c.match(pdfKey(n)).then(function (r) { return !!r; }, function () { return false; }); }))
        .then(function (a) { return a.every(Boolean); });
    }).catch(function () { return false; });
  }
  // one pdf.js file as verified bytes: Cache Storage first, else jsDelivr (sha256 checked, then cached)
  function pdfFile(name, onBytes, signal) {
    var f = PDFJS.files[name];
    return openPdfCache().then(function (c) {
      var hit = c ? c.match(pdfKey(name)).catch(function () { return null; }) : Promise.resolve(null);
      return hit.then(function (r) {
        if (r) return r.arrayBuffer().then(function (b) { if (onBytes) onBytes(f.bytes); return { bytes: b, cached: true, cache: c }; });
        return fetch(PDFJS.base + name, signal ? { signal: signal } : undefined).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status + ' for pdf.js');
          if (!res.body || !res.body.getReader) return res.arrayBuffer().then(function (b) { if (onBytes) onBytes(b.byteLength); return b; });
          var rd = res.body.getReader(), parts = [], n = 0;
          return (function pump() {
            return rd.read().then(function (x) {
              if (x.done) { var out = new Uint8Array(n), o = 0; parts.forEach(function (p) { out.set(p, o); o += p.length; }); return out.buffer; }
              parts.push(x.value); n += x.value.length; if (onBytes) onBytes(Math.min(n, f.bytes));
              return pump();
            });
          })();
        }).then(function (b) { return { bytes: b, cached: false, cache: c }; });
      });
    }).then(function (got) {
      return crypto.subtle.digest('SHA-256', got.bytes).then(function (d) {
        if (hex(d) !== f.sha256) {
          if (got.cached && got.cache) got.cache.delete(pdfKey(name)).catch(function () {});
          throw new Error('pdf.js (' + name + ') failed its integrity check');
        }
        if (!got.cached && got.cache) {
          return got.cache.put(pdfKey(name), new Response(got.bytes, { headers: { 'Content-Type': 'text/javascript' } }))
            .catch(function () { /* quota: works uncached */ }).then(function () { return got.bytes; });
        }
        return got.bytes;
      });
    });
  }
  // the Download tap: pdf.js into Cache Storage (so a PDF opens offline later), nothing executed
  function prefetchPdfjs(onBytes, signal) {
    if (!canVerify()) return Promise.resolve(false);
    var done = {};
    var each = function (n) { return function (b) { done[n] = b; if (onBytes) onBytes(Object.keys(done).reduce(function (s, k) { return s + done[k]; }, 0)); }; };
    return Promise.all(Object.keys(PDFJS.files).map(function (n) { return pdfFile(n, each(n), signal); })).then(function () {
      openPdfCache().then(function (c) { // drop other versions
        if (!c) return;
        var keep = Object.keys(PDFJS.files).map(pdfKey);
        return c.keys().then(function (ks) { ks.forEach(function (r) { if (keep.indexOf(r.url) < 0) c.delete(r).catch(function () {}); }); });
      }).catch(function () {});
      return true;
    });
  }
  function loadPdfjs() {
    if (PDF.lib) return Promise.resolve(PDF.lib);
    if (PDF.promise) return PDF.promise;
    PDF.promise = (function () {
      if (!canVerify() || typeof Blob !== 'function' || !window.URL || !URL.createObjectURL) {
        // no integrity check possible here (not a secure context): load the pinned CDN files as they are
        return import(PDFJS.base + 'pdf.min.mjs').then(function (lib) {
          lib.GlobalWorkerOptions.workerSrc = PDFJS.base + 'pdf.worker.min.mjs';
          return lib;
        });
      }
      return Promise.all([pdfFile('pdf.min.mjs'), pdfFile('pdf.worker.min.mjs')]).then(function (b) {
        var main = URL.createObjectURL(new Blob([b[0]], { type: 'text/javascript' }));
        var wk = URL.createObjectURL(new Blob([b[1]], { type: 'text/javascript' }));
        return import(main).then(function (lib) {
          if (!lib || !lib.getDocument) throw new Error('pdf.js did not load');
          lib.GlobalWorkerOptions.workerSrc = wk;
          return lib;
        });
      });
    })().then(function (lib) { PDF.lib = lib; return lib; });
    PDF.promise.catch(function () { PDF.promise = null; });
    return PDF.promise;
  }

  // ---------------------------------------------------------------- engine status / download

  function checkEngine() {
    if (S.engine === 'downloading') return Promise.resolve(S.engine);
    if (W.prepared) { S.engine = 'ready'; paintEngine(); return Promise.resolve('ready'); }
    if (S.engine !== 'ready') S.engine = 'checking';
    paintEngine();
    return Promise.all([ask({ cmd: 'size', cachedOnly: true }, ['size']), pdfCached()]).then(function (r) {
      var s = r[0];
      // Everything the CACHED manifest names is here. A run fetches the server's manifest, though,
      // and would download newer models on its own: once the engine is on this device (the owner
      // agreed to it; never before the first Download), and online, the server's manifest decides,
      // so an engine update is asked for like the first download. Offline / no answer: the cache.
      if (s.known && !(s.total > 0) && !W.prepared && navigator.onLine !== false) {
        var net = ask({ cmd: 'size' }, ['size']);
        var slow = new Promise(function (res) { setTimeout(function () { res(null); }, 8000); });
        return Promise.race([net, slow]).then(function (n) {
          return n && n.known !== false && n.total > 0 ? [Object.assign({}, n, { known: true, update: true }), r[1]] : r;
        }, function () { return r; });
      }
      return r;
    }).then(function (r) {
      var s = r[0], pdfOk = r[1];
      W.cacheAvailable = s.cacheAvailable !== false;
      var pdfBytes = pdfOk || !canVerify() ? 0 : ESTIMATE.pdf;
      if (W.prepared) { S.engine = 'ready'; }
      else if (!s.known) {
        S.size = { total: ESTIMATE.models + ESTIMATE.runtime + pdfBytes, estimate: true, cacheAvailable: W.cacheAvailable };
        S.engine = 'needed';
      } else {
        S.size = { total: (s.total || 0) + pdfBytes, estimate: false, cacheAvailable: W.cacheAvailable, update: !!s.update };
        S.engine = S.size.total > 0 ? 'needed' : 'ready';
      }
      paintEngine();
      return S.engine;
    }).catch(function (e) {
      if (isCancel(e)) { S.engine = 'unknown'; paintEngine(); return S.engine; }
      S.engine = 'unavailable';
      S.engineNote = 'The recognition engine cannot run here: ' + errText(e) + '.';
      paintEngine();
      return S.engine;
    });
  }

  function downloadEngine() {
    if (S.engine === 'downloading' || S.engine === 'unavailable') return Promise.resolve(false);
    S.engine = 'downloading';
    S.engineNote = '';
    var total = S.size ? S.size.total : ESTIMATE.models + ESTIMATE.runtime + ESTIMATE.pdf;
    var dl = S.dl = { w: 0, wTotal: 0, pdf: 0, total: total, t0: Date.now() };
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) { /* not offered */ }
    PDF.ctl = typeof AbortController === 'function' ? new AbortController() : null;
    paintEngine();
    var p1 = ask({ cmd: 'prepare' }, ['prepared'], function (m) {
      if (m.stage !== 'download') return;
      dl.w = m.done || 0; dl.wTotal = m.total || 0;
      paintDownload();
    });
    var p2 = prefetchPdfjs(function (b) { dl.pdf = b; paintDownload(); }, PDF.ctl && PDF.ctl.signal).catch(function (e) {
      // pdf.js is only needed for PDFs: the engine still works for pictures; a PDF retries online
      if (!isCancel(e)) S.pdfNote = 'pdf.js could not be downloaded (' + errText(e) + '): PDFs need a connection the first time.';
      return false;
    });
    return Promise.all([p1, p2]).then(function () {
      if (S.dl !== dl) return false;
      S.dl = null;
      W.prepared = true;
      S.engine = 'ready';
      paintEngine();
      if (S.pending && S.files.length && S.phase !== 'running') { S.pending = false; convert(); }
      return true;
    }, function (e) {
      if (S.dl !== dl) return false;
      S.dl = null;
      if (isCancel(e)) { S.engine = 'unknown'; paintEngine(); checkEngine(); return false; }
      S.engine = 'needed';
      S.engineNote = 'The download did not finish: ' + friendly(e) + ' Check the connection and tap Download again.';
      App.toast('The recognition engine could not be downloaded.', 4200);
      paintEngine();
      dropWorker(cancelErr()); // a fresh worker for the next try
      checkEngine();
      return false;
    });
  }
  function stopDownload() {
    if (S.engine !== 'downloading') return;
    S.dl = null;
    if (PDF.ctl) { try { PDF.ctl.abort(); } catch (e) { /* done */ } }
    dropWorker(cancelErr());
    S.engine = 'unknown';
    // the runtime keeps each file once it has fully arrived (a model only with all its parts)
    say('Download stopped. The files that finished downloading are kept; Download fetches the rest.');
    checkEngine();
  }
  function friendly(e) {
    var t = errText(e);
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(t)) return 'the connection failed.';
    if (/HTTP 404/.test(t)) return 'a file is missing on the server (' + t + ').';
    if (/sha256|integrity/i.test(t)) return 'a file arrived damaged (' + t + ').';
    if (/quota|QuotaExceeded/i.test(t)) return 'the device is out of storage space.';
    return t.replace(/^OMR\.runtime:\s*/, '') + '.';
  }

  // ---------------------------------------------------------------- reading the file into pages

  function newCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function ctx2d(c) {
    var x = null;
    try { x = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' }); } catch (e) { x = null; }
    return x || c.getContext('2d');
  }
  function release(c) { if (c) { c.width = 0; c.height = 0; } }
  function fit(w, h) { // keep a page canvas under MAX_PIXELS
    if (w * h <= MAX_PIXELS) return [w, h];
    var k = Math.sqrt(MAX_PIXELS / (w * h));
    return [Math.max(1, Math.floor(w * k)), Math.max(1, Math.floor(h * k))];
  }
  function thumbOf(c) {
    var tw = Math.min(THUMB_W, c.width), th = Math.max(1, Math.round(c.height * tw / c.width));
    var t = newCanvas(tw, th), x = t.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(c, 0, 0, tw, th);
    return new Promise(function (res) {
      var done = function (blob) { release(t); res(blob ? { url: URL.createObjectURL(blob), w: tw, h: th } : null); };
      try { t.toBlob(done, 'image/jpeg', 0.82); } catch (e) { done(null); }
    });
  }
  // a picture -> something drawImage takes ({src, w, h, close})
  function decodeImage(file) {
    var tries = [];
    if (typeof createImageBitmap === 'function') {
      tries.push(function () { return createImageBitmap(file, { colorSpaceConversion: 'none', imageOrientation: 'from-image' }); });
      tries.push(function () { return createImageBitmap(file); });
    }
    tries.push(function () { // <img> decodes more formats in some browsers (TIFF / HEIC in Safari)
      return new Promise(function (res, rej) {
        var u = URL.createObjectURL(file), img = new Image();
        img.onload = function () { res({ width: img.naturalWidth, height: img.naturalHeight, img: img, close: function () { URL.revokeObjectURL(u); } }); };
        img.onerror = function () { URL.revokeObjectURL(u); rej(new Error('cannot decode')); };
        img.src = u;
      });
    });
    var i = 0;
    function next() {
      if (i >= tries.length) {
        var n = String(file.name || ''), ext = ((n.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
        // a format every browser reads that still fails is a damaged file; others are a browser limit
        if (/^(png|jpe?g|jfif|webp|bmp|gif)$/.test(ext) || (!ext && /^image\/(png|jpeg|webp|bmp|gif)$/.test(file.type || ''))) {
          return Promise.reject(userErr('“' + n + '” could not be read as a picture: the file looks damaged (or is not really a ' + (ext ? '.' + ext : 'picture') + ').'));
        }
        return Promise.reject(userErr('This browser cannot open ' + (ext ? '.' + ext : 'this kind of') + ' pictures. Save it as PNG, JPG or PDF and try again.'));
      }
      // a try that throws at once (an option an older Safari does not know) falls through to the next one
      return Promise.resolve().then(tries[i++]).then(function (b) {
        if (!b || !(b.width > 0) || !(b.height > 0)) throw new Error('empty picture');
        return { src: b.img || b, w: b.width, h: b.height, close: function () { try { b.close(); } catch (e) { /* fine */ } } };
      }).catch(next);
    }
    return next();
  }
  function imageSource(files) {
    return {
      count: files.length, title: '', kind: 'image',
      page: function (i) {
        return decodeImage(files[i]).then(function (d) {
          var wh = fit(d.w, d.h), c = newCanvas(wh[0], wh[1]), x = ctx2d(c);
          x.imageSmoothingQuality = 'high';
          x.drawImage(d.src, 0, 0, wh[0], wh[1]);
          d.close();
          var data = x.getImageData(0, 0, wh[0], wh[1]).data;
          return thumbOf(c).then(function (thumb) { release(c); return { w: wh[0], h: wh[1], data: data, thumb: thumb, scaled: wh[0] !== d.w }; });
        });
      },
      close: function () {}
    };
  }
  function pdfSource(file, job) {
    return Promise.all([loadPdfjs(), file.arrayBuffer()]).then(function (r) {
      var lib = r[0];
      var task = job.pdfTask = lib.getDocument({ data: new Uint8Array(r[1]), isEvalSupported: false, enableXfa: false, verbosity: 0 });
      return task.promise.then(function (doc) {
        return doc.getMetadata().catch(function () { return null; }).then(function (md) {
          var title = md && md.info && typeof md.info.Title === 'string' ? md.info.Title : '';
          return {
            count: doc.numPages, title: title, kind: 'pdf',
            page: function (i) {
              return doc.getPage(i + 1).then(function (p) {
                var vp1 = p.getViewport({ scale: 1 });
                var scale = job.opts.dpi / 72, cap = Math.sqrt(MAX_PIXELS / Math.max(1, vp1.width * vp1.height));
                var scaled = scale > cap;
                if (scaled) scale = cap;
                var vp = p.getViewport({ scale: scale });
                // pixel size like PyMuPDF's get_pixmap(dpi=...) (the rect rounded outwards)
                var w = Math.max(1, Math.ceil(vp.width - 0.001)), h = Math.max(1, Math.ceil(vp.height - 0.001));
                var c = newCanvas(w, h), x = ctx2d(c);
                x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); // paper
                var rt = job.renderTask = p.render({ canvasContext: x, viewport: vp });
                return rt.promise.then(function () {
                  job.renderTask = null;
                  var data = x.getImageData(0, 0, w, h).data;
                  try { p.cleanup(); } catch (e) { /* fine */ }
                  return thumbOf(c).then(function (thumb) { release(c); return { w: w, h: h, data: data, thumb: thumb, scaled: scaled }; });
                }, function (e) { release(c); throw e; });
              });
            },
            close: function () { try { doc.destroy(); } catch (e) { /* gone */ } }
          };
        });
      });
    }).catch(function (e) {
      var n = e && e.name;
      if (isCancel(e)) throw e;
      if (n === 'PasswordException') throw userErr('This PDF is protected with a password. Open it in a PDF app, save a copy without the password, and try again.');
      if (n === 'InvalidPDFException') throw userErr('This file is not a readable PDF.');
      if (!navigator.onLine && !PDF.lib) throw userErr('Opening a PDF needs pdf.js, which is not on this device yet: connect once (or tap Download above).');
      throw userErr('The PDF could not be opened: ' + errText(e));
    });
  }

  // ---------------------------------------------------------------- converting

  function setFiles(list, append) {
    var files = Array.prototype.slice.call(list || []).filter(Boolean);
    var pdf = files.filter(function (f) { return kindOf(f) === 'pdf'; })[0];
    var imgs = files.filter(function (f) { return kindOf(f) === 'image'; });
    var other = files.filter(function (f) { return !kindOf(f); });
    if (!pdf && !imgs.length) {
      if (files.length) say((other[0] ? '“' + other[0].name + '” is not' : 'That is not') + ' a PDF or a picture. Scan reads PDFs and pictures (PNG, JPG, WEBP, BMP, TIFF) of printed sheet music.', true);
      return null;
    }
    if (pdf) {
      S.files = [pdf];
      if (files.length > 1) say('One PDF at a time: using “' + pdf.name + '”.');
      else say('');
    } else {
      imgs.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' }); });
      S.files = append && S.files.length && kindOf(S.files[0]) === 'image' ? S.files.concat(imgs) : imgs;
      say(other.length ? 'Skipped ' + other.length + ' file' + (other.length === 1 ? '' : 's') + ' that ' + (other.length === 1 ? 'is' : 'are') + ' not a picture.' : '');
    }
    if (S.phase !== 'running') { S.pending = false; }
    paintSel();
    return fileInfo();
  }
  function fileInfo() {
    return { count: S.files.length, kind: S.files.length ? kindOf(S.files[0]) : '', files: S.files.map(function (f) { return { name: f.name, size: f.size, type: f.type }; }) };
  }

  function open(file) {
    var list = file && typeof file.length === 'number' && !(file instanceof Blob) ? file : [file];
    var info = setFiles(list, false);
    if (App.active !== 'sheetlab') App.switchTo('sheetlab');
    if (info && S.engine === 'unknown') checkEngine();
    try { if (els.sel && !els.sel.hidden && els.sel.scrollIntoView) els.sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* old browser */ }
    return Promise.resolve(info || fileInfo());
  }

  function convert() {
    try {
      // S.starting: the engine check below is a worker round trip; a second tap meanwhile (a double
      // tap on a tablet) must not start a second conversion of the same file
      if (S.phase === 'running' || S.starting) return Promise.resolve(snapshot());
      if (!S.files.length) { say('Choose a PDF or a picture of sheet music first.', true); return Promise.resolve(snapshot()); }
      if (S.engine === 'unavailable') { say(S.engineNote || 'The recognition engine cannot run in this browser.', true); return Promise.resolve(snapshot()); }
      if (S.engine === 'downloading') { S.pending = true; say('The conversion starts as soon as the download is done.'); paintSel(); return Promise.resolve(snapshot()); }
      var token = S.starting = {};
      paintSel();
      // a worker that never answers: Convert works again after 20 s, and this start is superseded
      var unstick = setTimeout(function () { if (S.starting === token) { S.starting = false; paintSel(); } }, 20000);
      // the cache may have been cleared since the last look: ask again (no request) before running
      return checkEngine().then(function (st) {
        clearTimeout(unstick);
        if (S.starting !== token) return snapshot(); // superseded (see unstick)
        S.starting = false;
        if (st !== 'ready') {
          S.pending = true;
          say(S.size && S.size.update ? 'First tap Download above to update the recognition engine; this conversion starts right after.'
            : 'First tap Download above: the recognition engine comes onto this device once, and this conversion starts right after.');
          paintEngine(true);
          return snapshot();
        }
        return run();
      }).catch(function (e) { clearTimeout(unstick); if (S.starting === token) S.starting = false; paintSel(); fail(e); return snapshot(); });
    } catch (e) { S.starting = false; fail(e); return Promise.resolve(snapshot()); }
  }

  function jobOpts(o, src, files) {
    return {
      tempoBpm: o.bpm, instrumentName: o.instrument, program: o.program, transposeSemitones: o.transpose,
      splitWideSpreads: o.split, upscaleLowRes: o.enhance, title: src ? src.title || '' : '', sourceName: files[0].name, dpi: o.dpi
    };
  }

  function run() {
    var o = opt();
    var files = S.files.slice();
    var job = {
      id: 'scan-' + Date.now().toString(36) + '-' + (++W.n), files: files, o: o, opts: null, t0: Date.now(),
      count: 0, cur: 0, stage: 'start', label: '', done: 0, total: 0, sub: 0, pages: [], thumbs: [], meta: [],
      wait: null, failed: null, stopped: false, src: null, pdfTask: null, renderTask: null, kind: kindOf(files[0]), trail: [],
      abort: null, abortP: null
    };
    // Stop / a dead worker must end the run AT ONCE, also while a step that cannot be cancelled is
    // still pending (pdf.js downloading on a slow connection, a big file being read, a picture
    // decoding): every such step races this promise (guard), and what it delivers late is let go
    job.abortP = new Promise(function (res, rej) { job.abort = rej; });
    job.abortP.catch(function () { /* raced by guard() */ });
    S.trail = job.trail;
    if (S.result) revokeThumbs(S.result.thumbs);
    S.job = job; S.phase = 'running'; S.result = null; S.lib = ''; S.pending = false;
    say('');
    App.wake.acquire('sl-scan');
    var hadFocus = focusOnPage();
    paintAll();
    if (hadFocus) focusEl(els.stop); // Convert is disabled now: the keyboard goes on to Stop
    try { if (els.out.scrollIntoView) els.out.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* old browser */ }
    job.quiet = 0;
    var ticker = setInterval(function () {
      // counted only while the app is visible: a backgrounded iPad suspends the worker
      if (!document.hidden && W.jobs[job.id]) job.quiet += 1000;
      if (job.quiet > WATCHDOG_MS && !job.stopped) {
        dropWorker(new Error('the recognition engine stopped answering (out of memory?)'));
      }
      paintProgress();
    }, 1000);
    var w;
    var p = Promise.resolve().then(function () {
      if (job.failed) throw job.failed; // stopped before it began
      w = worker();
      W.jobs[job.id] = job;
      setStage(job, job.kind === 'pdf' ? 'pdf' : 'render');
      return guard(job, job.kind === 'pdf' ? pdfSource(files[0], job) : imageSource(files), function (src) { try { src.close(); } catch (e) { /* gone */ } });
    }).then(function (src) {
      job.src = src;
      job.count = src.count;
      job.opts = jobOpts(o, src, files);
      if (!src.count) throw userErr('This PDF has no pages.');
      var i = 0;
      function nextPage() {
        if (job.stopped) throw cancelErr();
        if (job.failed) throw job.failed;
        if (i >= src.count) return null;
        job.cur = i; job.sub = 0; job.label = '';
        setStage(job, 'render');
        return guard(job, src.page(i), function (pg) { revokeThumbs([pg.thumb]); }).then(function (pg) {
          if (job.stopped) throw cancelErr();
          job.thumbs[i] = pg.thumb;
          job.meta[i] = { w: pg.w, h: pg.h, scaled: pg.scaled };
          var idx = i;
          var waiting = jobWait(job, 'pageDone', function (m) { return m.index === idx; });
          setStage(job, 'segment');
          w.postMessage({ cmd: 'page', id: job.id, label: 'Page ' + (i + 1), index: i, count: src.count,
            image: { w: pg.w, h: pg.h, data: pg.data }, opts: job.opts }, [pg.data.buffer]);
          pg = null;
          return waiting;
        }).then(function () { i++; job.sub = 1; return nextPage(); });
      }
      return nextPage();
    }).then(function () {
      if (job.stopped) throw cancelErr();
      setStage(job, 'write');
      var waiting = jobWait(job, 'result');
      w.postMessage({ cmd: 'finish', id: job.id, opts: job.opts });
      return waiting;
    }).then(function (res) {
      finishJob(job, res);
    }).catch(function (e) {
      if (job.stopped || isCancel(e)) {
        S.phase = 'stopped';
        say('Stopped. Nothing was kept from this run.');
      } else {
        S.phase = 'error';
        S.result = null;
        var m = e && e.slUser ? errText(e) : 'The scan stopped: ' + friendly(e);
        // the worker may still be busy with this document: drop what it has queued for it
        if (W.w) { try { W.w.postMessage({ cmd: 'cancel', id: job.id }); } catch (x) { /* gone */ } }
        say(m, true);
        App.toast(e && e.slUser ? m : 'Scan failed.', 5200);
        if (!W.w || /recognition engine/.test(m)) checkEngine();
      }
    }).then(function () {
      clearInterval(ticker);
      delete W.jobs[job.id];
      if (job.src) { try { job.src.close(); } catch (e) { /* gone */ } }
      if (S.job === job) S.job = null;
      if (!(S.result && S.result.thumbs === job.thumbs)) revokeThumbs(job.thumbs);
      App.wake.release('sl-scan');
      var refocus = focusOnPage(els.prog);
      paintAll();
      // Stop / the progress card is hidden now: keep the keyboard on the page (the first action of a
      // result, else Convert) instead of dropping it to the top of the document
      if (refocus) focusEl(S.phase === 'done' && !els.acts.hidden ? document.getElementById('sl-play') : !els.go.disabled ? els.go : els.choose);
      if (App.active !== 'sheetlab') scheduleIdleKill();
      return snapshot();
    });
    job.promise = p;
    return p;
  }

  // p, unless the job fails first (Stop, a dead worker); a value p still delivers afterwards goes
  // to late() so it is released (an open PDF document, a page's thumbnail)
  function guard(job, p, late) {
    p = Promise.resolve(p); // imageSource() is a plain object, pdfSource() a promise
    return new Promise(function (res, rej) {
      var done = false;
      p.then(function (v) {
        if (done) { if (late && v) { try { late(v); } catch (e) { /* released anyway */ } } return; }
        done = true; res(v);
      }, function (e) { if (!done) { done = true; rej(e); } });
      job.abortP.catch(function (e) { if (!done) { done = true; rej(e); } });
    });
  }
  function jobWait(job, type, match) {
    return new Promise(function (res, rej) {
      if (job.failed) { rej(job.failed); return; }
      job.wait = { type: type, match: match || null, res: res, rej: rej };
    });
  }
  function jobFail(job, err) {
    job.failed = job.failed || err;
    if (isCancel(err)) job.stopped = true;
    var w = job.wait; job.wait = null;
    if (w) w.rej(err);
    if (job.abort) job.abort(job.failed);
    if (job.renderTask) { try { job.renderTask.cancel(); } catch (e) { /* done */ } }
  }
  function onJobMsg(job, m) {
    job.quiet = 0;
    switch (m.type) {
      case 'progress': onProgress(job, m); return;
      case 'staffs': onPagePreview(job, m, false); return;
      case 'page': onPagePreview(job, m, true); return;
      case 'error': jobFail(job, workerErr(m)); return;
      case 'cancelled': jobFail(job, cancelErr()); return;
      default: {
        var w = job.wait;
        if (w && m.type === w.type && (!w.match || w.match(m))) { job.wait = null; w.res(m); }
      }
    }
  }
  function onProgress(job, m) {
    if (m.stage === 'download') {
      job.stage = m.total ? 'download' : 'start';
      job.done = m.done || 0; job.total = m.total || 0;
    } else if (m.stage === 'engine') {
      var t = String(m.message || '');
      if (/^Merging/.test(t)) job.stage = 'merge';
      else if (/^Synthesizing/.test(t)) job.stage = 'write';
      else return;
    } else if (m.stage === 'segment' || m.stage === 'staffs' || m.stage === 'read') {
      job.stage = m.stage; job.done = m.done || 0; job.total = m.total || 0;
      if (m.label) job.label = m.label;
    } else return;
    mark(job);
    paintProgress();
  }
  function setStage(job, st) { job.stage = st; job.done = 0; job.total = 0; mark(job); paintProgress(); }
  // the stages a run went through ('render 1', 'segment 1', ..., 'render 2', ...): state.trail
  function mark(job) {
    var k = job.stage + ' ' + (job.cur + 1), t = job.trail;
    if (t[t.length - 1] !== k) { t.push(k); if (t.length > 400) t.shift(); }
  }

  function fraction(job) {
    if (!job) return 0;
    if (job.stage === 'merge' || job.stage === 'write') return 0.95;
    var n = Math.max(1, job.count || 1), sub = 0, d = job.total ? Math.min(1, job.done / job.total) : 0;
    switch (job.stage) {
      case 'pdf': case 'start': case 'download': sub = 0; break;
      case 'render': sub = 0.02; break;
      case 'segment': sub = 0.05 + 0.45 * d; break;
      case 'staffs': sub = 0.52; break;
      case 'read': sub = 0.55 + 0.45 * d; break;
      default: sub = job.sub || 0;
    }
    if (/\(Left\)$/.test(job.label) && job.stage !== 'render') sub = sub / 2;
    else if (/\(Right\)$/.test(job.label) && job.stage !== 'render') sub = 0.5 + sub / 2;
    return Math.min(0.93, 0.02 + 0.91 * (job.cur + sub) / n);
  }
  function stageText(job) {
    var pdf = job.kind === 'pdf';
    switch (job.stage) {
      case 'start': return 'Starting the recognition engine…';
      case 'download': return 'Downloading the recognition engine: ' + mb(job.done) + ' of ' + mb(job.total) + '…';
      case 'pdf': return 'Opening the PDF…';
      case 'render': return pdf ? 'Rendering the page…' : 'Reading the picture…';
      case 'segment': return 'Looking for notes and staffs…';
      case 'staffs': return 'Finding the staffs…';
      case 'read': return job.total ? (job.done < job.total ? 'Reading staff ' + (job.done + 1) + ' of ' + job.total + '…' : 'Read all ' + job.total + ' staff' + (job.total === 1 ? '' : 's') + '.') : 'Reading the staffs…';
      case 'merge': return 'Putting the pages together…';
      case 'write': return 'Writing MIDI and MusicXML…';
    }
    return 'Working…';
  }
  function pageText(job) {
    if (!job.count || job.stage === 'merge' || job.stage === 'write') return job.count ? job.count + ' page' + (job.count === 1 ? '' : 's') + ' read' : '';
    var half = /\(Left\)$/.test(job.label) ? ' · left half' : /\(Right\)$/.test(job.label) ? ' · right half' : '';
    return 'Page ' + (job.cur + 1) + ' of ' + job.count + half;
  }

  function finishJob(job, res) {
    var sm = res.summary || {};
    var r = {
      title: res.title || '', origTitle: res.title || '', success: !!res.success, error: res.errorMessage || '',
      musicxml: res.musicxml || '', xmlRaw: res.xmlRaw || '',
      midi: res.midi ? new Uint8Array(res.midi) : null, mxl: res.mxl ? new Uint8Array(res.mxl) : null,
      summary: sm, pages: job.pages, thumbs: job.thumbs, meta: job.meta, o: job.o, source: job.files[0].name,
      sourcePages: job.count, kind: job.kind, ms: Date.now() - job.t0, exports: null
    };
    r.exports = r.midi ? { title: r.title, midi: r.midi, musicxml: r.musicxml, mxl: r.mxl } : null;
    S.result = r;
    if (r.success && r.midi) {
      S.phase = 'done';
      say('');
      if (App.active !== 'sheetlab') App.toast('Scan finished: ' + (r.title || 'your music') + ' (Play › Scan).', 4800);
      if (job.o.autosave && App.library && typeof App.library.saveScan === 'function') saveToLibrary(true);
    } else {
      S.phase = 'error';
      var plain = /No musical staves or noteheads/.test(r.error)
        ? 'No music found: no staffs or notes could be read. A flat, sharp, well-lit page (or PDF quality 300 dpi) reads best.'
        : 'The conversion did not finish: ' + (r.error || 'unknown error') + (r.musicxml ? ' The MusicXML can still be downloaded.' : '');
      say(plain, true);
      App.toast(/No music found/.test(plain) ? 'No music found in that file.' : 'Scan failed.', 4200);
    }
  }

  function stop() {
    var job = S.job;
    if (job) {
      job.stopped = true;
      if (job.renderTask) { try { job.renderTask.cancel(); } catch (e) { /* done */ } }
      if (job.pdfTask) { try { job.pdfTask.destroy(); } catch (e) { /* done */ } }
      dropWorker(cancelErr()); // the pages already sent are dropped with it; a new worker comes next time
      jobFail(job, cancelErr());
      return job.promise || Promise.resolve(snapshot());
    }
    if (S.engine === 'downloading') { stopDownload(); }
    return Promise.resolve(snapshot());
  }

  function fail(e) {
    var m = errText(e);
    say(m, true);
    App.toast(m, 4200);
  }

  // ---------------------------------------------------------------- exports (title edits re-title the files)

  var omrLoad = null;
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  // js/omr/midi.js + mxl.js need nothing else (no opencv, no onnxruntime)
  function omrWriters() {
    if (window.OMR && OMR.midi && OMR.mxl) return Promise.resolve(window.OMR);
    if (!omrLoad) {
      omrLoad = loadScript('js/omr/midi.js').then(function () { return loadScript('js/omr/mxl.js'); }).then(function () { return window.OMR; });
      omrLoad.catch(function () { omrLoad = null; });
    }
    return omrLoad;
  }
  function cleanTitle(t) {
    return String(t == null ? '' : t).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  }
  function xmlEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function setWorkTitle(xml, title) {
    if (!xml) return xml;
    var t = xmlEsc(title);
    if (/<work-title>[\s\S]*?<\/work-title>/.test(xml)) return xml.replace(/<work-title>[\s\S]*?<\/work-title>/, '<work-title>' + t + '</work-title>');
    if (/<work-title\s*\/>/.test(xml)) return xml.replace(/<work-title\s*\/>/, '<work-title>' + t + '</work-title>');
    return xml.replace(/(<score-partwise[^>]*>)/, '$1<work><work-title>' + t + '</work-title></work>');
  }
  function stemOf(name) { var b = String(name || '').split(/[\\/]/).pop(); var i = b.lastIndexOf('.'); return (i > 0 ? b.slice(0, i) : b) || 'score'; }
  // the files for the current title: as the engine made them, or re-titled (MIDI track name,
  // MusicXML work-title; the .mid made exactly like the engine's from homr's MusicXML)
  function exportsFor() {
    var r = S.result;
    if (!r || !r.midi) return Promise.reject(new Error('There is no converted score yet.'));
    var title = cleanTitle(r.title) || r.origTitle || 'Score';
    if (r.exports && r.exports.title === title) return Promise.resolve(r.exports);
    if (r.exportsP && r.exportsP.title === title) return r.exportsP.p;
    var p = omrWriters().then(function (OMR) {
      var raw = setWorkTitle(r.xmlRaw, title), out = setWorkTitle(r.musicxml, title);
      var conv = OMR.midi.convert(raw, { tempo: r.o.bpm, program: r.o.program, transpose: r.o.transpose, title: title, instrumentName: r.o.instrument });
      return OMR.mxl.write(out, stemOf(r.source) + '.musicxml').then(function (mxl) {
        var x = { title: title, midi: conv.midi, musicxml: out, mxl: mxl };
        if (S.result === r && cleanTitle(r.title) === title) { r.exports = x; r.exportsP = null; }
        return x;
      });
    });
    r.exportsP = { title: title, p: p };
    p.catch(function () { if (r.exportsP && r.exportsP.p === p) r.exportsP = null; });
    return p;
  }
  function fileName(title, ext) {
    var b = String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 100);
    return (b || 'score') + '.' + ext;
  }
  var TYPES = { mid: 'audio/midi', musicxml: 'application/vnd.recordare.musicxml+xml', mxl: 'application/vnd.recordare.musicxml' };
  // one file to the device: a download; the share sheet in the iOS home-screen app; the Android
  // app's WebView has no downloads (no DownloadListener), so it says what works instead
  function saveFile(name, data, type) {
    if (window.SL_ARTIFACT) { App.toast('Downloads are blocked here.', 3600); return 'blocked'; }
    var blob = new Blob([data], { type: type });
    var host = window.GuitarLabHost;
    if ((host || (isIOS() && standalone())) && navigator.share && navigator.canShare && typeof File === 'function') {
      try {
        var file = new File([blob], name, { type: type });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: name }).catch(function (e) {
            if (e && e.name !== 'AbortError') App.toast('Could not share ' + name + ': ' + errText(e), 4200);
          });
          return 'shared';
        }
      } catch (e) { /* fall through */ }
    }
    if (host) {
      App.toast('The Android app cannot save files. Use Save to my library, or open soundLAB in Chrome to download.', 6400);
      return 'unsupported';
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 15000);
    return 'downloaded';
  }
  function download(kind) {
    return exportsFor().then(function (x) {
      var data = kind === 'mid' ? x.midi : kind === 'mxl' ? x.mxl : x.musicxml;
      if (!data) throw new Error(kind === 'mxl' ? 'No .mxl was made for this score.' : 'Nothing to download.');
      return saveFile(fileName(x.title, kind), data, TYPES[kind]);
    }).catch(function (e) { fail(e); return 'failed'; });
  }
  // MusicXML-only result (the MIDI step failed): .musicxml / .mxl as the engine made them
  function downloadRaw(kind) {
    var r = S.result;
    if (!r) return;
    var data = kind === 'mxl' ? r.mxl : r.musicxml;
    if (!data) { fail(new Error('Nothing to download.')); return; }
    saveFile(fileName(r.title || 'score', kind), data, TYPES[kind]);
  }
  function bufOf(u8) { return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength); }

  function playOnSynth() {
    return exportsFor().then(function (x) {
      var hub = window.SLMidiHub && SLMidiHub.player;
      if (!hub) throw new Error('The MIDI Hub is not loaded.');
      return Promise.resolve(hub.loadFile(fileName(x.title, 'mid'), bufOf(x.midi))).then(function () { hub.show(); return true; });
    }).catch(function (e) { fail(e); return false; });
  }
  function practice() {
    return exportsFor().then(function (x) {
      var ws = window.Woodshed;
      if (!ws || typeof ws.importMidi !== 'function' || typeof ws.addScore !== 'function') throw new Error('The Woodshed is not available in this build.');
      var sc = ws.importMidi(bufOf(x.midi), x.title);
      if (!sc) throw new Error('The Woodshed could not read the MIDI.');
      ws.addScore(sc);
      App.switchTo('shed');
      return true;
    }).catch(function (e) { fail(e); return false; });
  }
  function openAsTab() {
    return exportsFor().then(function (x) {
      if (!App.songs || typeof App.songs.fromMidi !== 'function') throw new Error('The Songs page is not available.');
      var song = App.songs.fromMidi(bufOf(x.midi), x.title);
      if (!song) throw new Error('Nothing in it fits a guitar.');
      song.from = 'Scan';
      if (!App.songs.load(song)) throw new Error('Nothing in it fits a guitar.');
      App.switchTo('songs');
      return true;
    }).catch(function (e) { fail(e); return false; });
  }
  function saveToLibrary(auto) {
    var lib = App.library;
    if (!lib || typeof lib.saveScan !== 'function') { libSay('My library is not available in this build.'); return Promise.resolve(null); }
    var r = S.result;
    if (!r || !r.midi) return Promise.resolve(null);
    libSay(auto ? 'Saving to my library…' : 'Saving…');
    return exportsFor().then(function (x) {
      var sm = r.summary || {};
      return lib.saveScan({
        title: x.title, source: r.source, pages: r.sourcePages,
        options: { tempo: r.o.bpm, program: r.o.program, transpose: r.o.transpose },
        summary: { measures: sm.totalMeasures, notes: sm.totalNotes, chords: sm.totalChords, seconds: sm.durationSeconds },
        midi: x.midi, musicxml: x.musicxml
      });
    }).then(function (st) {
      if (S.result === r) libSay(st && st.message ? st.message : 'Saved to my library.');
      return st;
    }, function (e) {
      if (S.result === r) libSay('Not saved to my library: ' + errText(e));
      return null;
    });
  }

  // ---------------------------------------------------------------- page previews

  function palette() {
    var cs = getComputedStyle(document.documentElement);
    return ['--accent', '--teal', '--blue', '--purple', '--green', '--red'].map(function (v) { return cs.getPropertyValue(v).trim() || 'currentColor'; });
  }
  function onPagePreview(job, m, final) {
    var i = job.cur, key = m.label || ('Page ' + (i + 1));
    var pg = null;
    for (var k = 0; k < job.pages.length; k++) if (job.pages[k].label === key) pg = job.pages[k];
    if (!pg) { pg = { label: key, index: i }; job.pages.push(pg); }
    pg.staffCount = m.staffCount;
    if (m.preview && m.preview.items) pg.preview = m.preview;
    if (final) {
      pg.final = true; pg.voiceCount = m.voiceCount; pg.skipped = m.skipped || null;
      pg.width = m.width; pg.height = m.height;
      if (!m.preview) pg.preview = pg.skipped ? null : pg.preview;
    }
    paintPages(job.pages, job.thumbs, job.meta);
  }
  function skipText(reason) {
    var r = String(reason || '');
    if (/^Non-music \/ cover page/.test(r)) return 'No music here (a cover or text page).';
    if (/^No musical voices detected/.test(r)) return 'No notes could be read on this page.';
    var m = r.match(/^OMR skipped page \(([\s\S]*)\)$/);
    return 'Could not read this page' + (m ? ' (' + m[1] + ')' : r ? ' (' + r + ')' : '') + '.';
  }
  function pageSummary(pg) {
    if (!pg.final) return (pg.staffCount ? pg.staffCount + ' staff' + (pg.staffCount === 1 ? '' : 's') + ' found, reading…' : 'Reading…');
    if (pg.skipped) return 'Skipped: ' + skipText(pg.skipped);
    return pg.staffCount + ' staff' + (pg.staffCount === 1 ? '' : 's') + ' · ' + pg.voiceCount + ' part' + (pg.voiceCount === 1 ? '' : 's');
  }
  function paintPages(pages, thumbs, meta) {
    if (!els.pages) return;
    var have = {};
    Array.prototype.forEach.call(els.pages.children, function (n) { have[n.getAttribute('data-label')] = n; });
    pages.forEach(function (pg) {
      var n = have[pg.label];
      if (!n) {
        n = document.createElement('figure');
        n.className = 'sl-page';
        n.setAttribute('data-label', pg.label);
        n.innerHTML = '<figcaption><b></b> <span class="sl-psum"></span></figcaption><div class="sl-pwrap"><canvas class="sl-prev"></canvas></div>';
        els.pages.appendChild(n);
      }
      n.querySelector('b').textContent = pg.label;
      var sum = n.querySelector('.sl-psum');
      sum.textContent = pageSummary(pg);
      sum.classList.toggle('sl-skip', !!pg.skipped);
      var sig = (pg.final ? 'f' : 'p') + (pg.preview ? pg.preview.items.length : 0) + (thumbs[pg.index] ? 't' : '');
      if (n.getAttribute('data-drawn') !== sig) {
        n.setAttribute('data-drawn', sig);
        drawPreview(n.querySelector('canvas'), pg, thumbs[pg.index], meta[pg.index]);
      }
    });
  }
  function drawPreview(cv, pg, thumb, meta) {
    var pv = pg.preview;
    // which part of the picture this page is (a 2-page spread is analysed as two halves)
    var ow = meta ? meta.w : (thumb ? thumb.w : 1), oh = meta ? meta.h : (thumb ? thumb.h : 1);
    var rx = 0, rw = ow;
    if (/\(Left\)$/.test(pg.label)) { rw = Math.floor(ow / 2) + Math.trunc(ow * 0.01); }
    else if (/\(Right\)$/.test(pg.label)) { rx = Math.floor(ow / 2) - Math.trunc(ow * 0.01); rw = ow - rx; }
    var W0 = pv ? pv.w : rw, H0 = pv ? pv.h : oh;
    // as wide as it is shown (x devicePixelRatio), at most 960 px: every preview stays in memory
    // while the result is open (a 20-page PDF at 960 px = ~100 MB of canvas; iOS Safari has a
    // canvas memory budget and then hands out no context at all)
    var shown = cv.parentNode && cv.parentNode.clientWidth ? cv.parentNode.clientWidth * (window.devicePixelRatio || 1) : 960;
    var cw = Math.max(1, Math.round(Math.min(960, W0, Math.max(320, shown)))), ch = Math.max(1, Math.round(H0 * cw / W0));
    cv.width = cw; cv.height = ch;
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', pg.label + (pv ? ': the staffs found are outlined' : ''));
    var x = cv.getContext('2d');
    if (!x) { cv.width = 0; cv.height = 0; return; } // out of canvas memory: the caption still says what was found
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, cw, ch);
    // the picture lines up with the outlines unless the engine cropped it first (a dark frame, a photo's desk)
    var near = function (a, b) { return Math.abs(a - b) <= 0.012 * Math.max(a, b); };
    var aligned = !pv || (pg.width && pg.height ? near(rw / oh, pg.width / pg.height) && near(pg.width / pg.height, pv.w / pv.h) : near(rw / oh, pv.w / pv.h));
    var drawItems = function () {
      if (!pv) return;
      var k = cw / pv.w, pal = palette(), seen = [];
      x.lineWidth = Math.max(1.5, 2.2 * k * (pv.w / 960));
      x.lineJoin = 'round';
      pv.items.forEach(function (it) {
        var key = String(it.color), ci = seen.indexOf(key);
        if (ci < 0) { seen.push(key); ci = seen.length - 1; }
        x.strokeStyle = pal[ci % pal.length];
        x.beginPath();
        if (it.type === 'polyline' || it.type === 'polygon') {
          (it.points || []).forEach(function (p, j) { if (j) x.lineTo(p[0] * k, p[1] * k); else x.moveTo(p[0] * k, p[1] * k); });
          if (it.type === 'polygon') x.closePath();
        } else if (it.type === 'rect') {
          x.rect(it.x1 * k, it.y1 * k, (it.x2 - it.x1) * k, (it.y2 - it.y1) * k);
        } else if (it.type === 'ellipse' && x.ellipse) {
          x.ellipse(it.center[0] * k, it.center[1] * k, Math.max(0.5, it.axes[0] * k), Math.max(0.5, it.axes[1] * k), (it.angle || 0) * Math.PI / 180, 0, 2 * Math.PI);
        } else return;
        x.stroke();
      });
    };
    if (thumb && aligned) {
      var img = new Image();
      img.onload = function () {
        if (cv.width !== cw) return; // redrawn meanwhile
        var sx = rx * thumb.w / ow, sw = rw * thumb.w / ow;
        try { x.drawImage(img, sx, 0, sw, thumb.h, 0, 0, cw, ch); } catch (e) { /* revoked */ }
        if (pg.skipped) { x.fillStyle = 'rgba(255,255,255,0.55)'; x.fillRect(0, 0, cw, ch); }
        drawItems();
      };
      img.onerror = drawItems;
      img.src = thumb.url;
    } else {
      drawItems();
    }
  }
  function revokeThumbs(list) { (list || []).forEach(function (t) { if (t && t.url) { try { URL.revokeObjectURL(t.url); } catch (e) { /* gone */ } } }); }

  // ---------------------------------------------------------------- painting

  // the keyboard focus is on this page (nowhere, or inside `within` when given) while it is shown
  function focusOnPage(within) {
    if (App.active !== 'sheetlab' || !els.root) return false;
    var a = document.activeElement;
    if (!a || a === document.body || a === document.documentElement) return true;
    return within ? within.contains(a) : els.root.contains(a);
  }
  function focusEl(el) { try { if (el && !el.hidden && !el.disabled) el.focus({ preventScroll: true }); } catch (e) { /* fine */ } }
  // text only when it changed: live regions re-announce an identical rewrite
  function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }
  function say(m, isErr) { S.msg = m || ''; S.msgErr = !!isErr && !!m; if (els.msg) { els.msg.textContent = S.msg; els.msg.classList.toggle('err', S.msgErr); els.msg.hidden = !S.msg; } }
  function libSay(m) { S.lib = m || ''; if (els.libmsg) els.libmsg.textContent = S.lib; }

  function paintEngine(nudge) {
    var e = els.engine;
    if (!e) return;
    var st = S.engine, html = '', cls = 'sl-engine';
    if (st === 'ready') {
      cls += ' ok';
      html = '<span class="sl-eicon" aria-hidden="true">' + App.icon('check', 16) + '</span><span>' +
        (W.cacheAvailable ? 'Engine ready (offline).' : 'Engine ready for this session (this browser cannot keep it).') + '</span>';
    } else if (st === 'needed') {
      var sz = S.size ? S.size.total : ESTIMATE.models + ESTIMATE.runtime + ESTIMATE.pdf;
      var partial = S.size && !S.size.estimate && S.size.total < ESTIMATE.models + ESTIMATE.runtime;
      var keep = !S.size || S.size.cacheAvailable !== false;
      html = '<span class="sl-etext">' + (S.size && S.size.update
        ? 'An update of the recognition engine is ready to download (about ' + mb(sz) + '); conversions wait for it.'
        : partial
        ? 'The recognition engine needs about ' + mb(sz) + ' more, downloaded once; then it works offline.'
        : keep ? 'Reading sheet music downloads the recognition engine once (about ' + mb(sz) + '), then works offline.'
          : 'Reading sheet music downloads the recognition engine (about ' + mb(sz) + '). This browser cannot keep it, so it downloads again next time.') +
        '</span><button type="button" class="btn primary" id="sl-dl">Download</button>';
      if (S.pending) cls += ' wait';
    } else if (st === 'downloading') {
      // #sl-engine is a polite live region: it announces the state once; the running MB count is
      // aria-hidden (a screen reader would read every chunk) and lives in the progressbar's value
      html = '<div class="sl-erow"><span class="sl-etext"><span class="sl-sr">Downloading the recognition engine.</span>' +
        '<span id="sl-dltext" aria-hidden="true">Downloading the recognition engine…</span></span>' +
        '<button type="button" class="btn" id="sl-dlstop">Stop</button></div>' +
        '<div class="sl-bar" id="sl-dlbar" role="progressbar" aria-label="Download" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>';
    } else if (st === 'unavailable') {
      cls += ' bad';
      html = '<span>' + esc(S.engineNote || 'The recognition engine cannot run in this browser.') + '</span>';
    } else {
      html = '<span class="muted">Checking the recognition engine…</span>';
    }
    if (S.engineNote && st !== 'unavailable') html += '<div class="sl-enote">' + esc(S.engineNote) + '</div>';
    if (S.pdfNote && st === 'ready') html += '<div class="sl-enote">' + esc(S.pdfNote) + '</div>';
    // rewrite only on a real change: an identical rewrite is announced again by screen readers and
    // takes the keyboard focus off the Download / Stop button
    if (e.__slKey !== cls + '|' + html) {
      e.__slKey = cls + '|' + html;
      e.className = cls;
      e.setAttribute('data-state', st);
      e.innerHTML = html;
    }
    if (st === 'downloading') paintDownload();
    if (nudge && st === 'needed') {
      e.classList.remove('nudge'); void e.offsetWidth; e.classList.add('nudge');
      var b = document.getElementById('sl-dl');
      try { if (b) b.focus({ preventScroll: true }); if (e.scrollIntoView) e.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (x) { /* fine */ }
    }
    paintSel();
  }
  function paintDownload() {
    var d = S.dl;
    if (!d) return;
    var done = d.w + d.pdf, total = Math.max(d.total, (d.wTotal || 0) + (d.pdf ? ESTIMATE.pdf : 0), done);
    var t = document.getElementById('sl-dltext'), bar = document.getElementById('sl-dlbar');
    setText(t, 'Downloading the recognition engine: ' + mb(done) + ' of ' + mb(total) + (done >= total && total ? ' (starting it…)' : '…'));
    if (bar) {
      var pc = total ? Math.min(100, Math.round(100 * done / total)) : 0;
      if (bar.getAttribute('aria-valuenow') === String(pc) && bar.firstChild.style.width) return;
      bar.setAttribute('aria-valuetext', mb(done) + ' of ' + mb(total));
      bar.firstChild.style.width = pc + '%';
      bar.setAttribute('aria-valuenow', String(pc));
    }
  }
  function paintSel() {
    if (!els.sel) return;
    var n = S.files.length, running = S.phase === 'running';
    els.sel.hidden = !n;
    if (n) {
      var k = kindOf(S.files[0]);
      var size = S.files.reduce(function (s, f) { return s + (f.size || 0); }, 0);
      var kb = size >= 1e6 ? (size / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(size / 1e3)) + ' KB';
      els.selname.textContent = k === 'pdf' ? S.files[0].name + ' · PDF · ' + kb
        : n === 1 ? S.files[0].name + ' · picture · ' + kb
          : n + ' pictures = ' + n + ' pages, in this order: ' + S.files.map(function (f) { return f.name; }).join(', ');
    }
    els.go.disabled = running || S.starting || !n || S.engine === 'unavailable';
    els.go.textContent = running || S.starting ? 'Converting…' : S.pending && S.engine !== 'ready' ? 'Converts after the download' : 'Convert to MIDI';
    els.clear.disabled = running;
    els.file.disabled = running; els.cam.disabled = running;
    [els.choose, els.photo].forEach(function (lb) { // labels styled as buttons: keyboard-operable (see init)
      lb.classList.toggle('dis', running);
      lb.tabIndex = running ? -1 : 0;
      lb.setAttribute('aria-disabled', running ? 'true' : 'false');
    });
    var imgs = n && kindOf(S.files[0]) === 'image';
    els.photoLabel.textContent = imgs ? 'Add a page (photo)' : 'Take a photo';
    els.drop.classList.toggle('dis', running);
    if (els.optset) els.optset.disabled = running;
  }
  function paintOpts() {
    var o = opt();
    els.tempo.value = String(o.bpm);
    els.tempoNote.innerHTML = o.tempo == null
      ? 'Follows the shared tempo' : '<button type="button" class="sl-link" id="sl-tempo-shared">Use the shared tempo (' + sharedBpm() + ')</button>';
    els.inst.value = o.instrument;
    els.tr.value = String(o.transpose);
    els.split.checked = o.split;
    els.enhance.checked = o.enhance;
    els.autosave.checked = o.autosave;
    els.autosaveRow.hidden = !(App.library && typeof App.library.saveScan === 'function');
    Array.prototype.forEach.call(els.dpi.querySelectorAll('[data-v]'), function (b) {
      var on = parseInt(b.getAttribute('data-v'), 10) === o.dpi;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function paintProgress() {
    var job = S.job;
    if (!job || !els.stage) return;
    setText(els.stage, stageText(job));
    setText(els.pageof, pageText(job)); // a live region: once per page, not every second
    setText(els.elapsed, clock(Date.now() - job.t0));
    var pc = Math.round(100 * fraction(job));
    if (els.bar.getAttribute('aria-valuenow') !== String(pc)) {
      els.bar.firstChild.style.width = pc + '%';
      els.bar.setAttribute('aria-valuenow', String(pc));
    }
  }
  function paintResult() {
    var r = S.result, ok = S.phase === 'done' && r && r.midi;
    els.res.hidden = !(r && (S.phase === 'done' || S.phase === 'error'));
    if (!r) return;
    if (document.activeElement !== els.title) els.title.value = r.title || '';
    els.title.disabled = !ok;
    var sm = r.summary || {};
    var parts = Math.max(0, Math.max.apply(null, [0].concat(r.pages.filter(function (p) { return !p.skipped; }).map(function (p) { return p.voiceCount || 0; }))));
    var line = ok ? [
      (sm.totalMeasures || 0) + ' measure' + (sm.totalMeasures === 1 ? '' : 's'),
      (sm.totalNotes || 0) + ' note' + (sm.totalNotes === 1 ? '' : 's'),
      (sm.totalChords || 0) + ' chord' + (sm.totalChords === 1 ? '' : 's'),
      clock((sm.durationSeconds || 0) * 1000) + ' long'
    ].join(' · ') : '';
    var detail = ok ? [
      (sm.pagesProcessed || 0) + ' of ' + ((sm.pagesProcessed || 0) + (sm.pagesSkipped || 0)) + ' page' + ((sm.pagesProcessed || 0) + (sm.pagesSkipped || 0) === 1 ? '' : 's') + ' read',
      parts ? parts + ' part' + (parts === 1 ? '' : 's') : '',
      r.o.bpm + ' BPM', r.o.instrument, r.o.transpose ? (r.o.transpose > 0 ? '+' : '') + r.o.transpose + ' semitones' : '',
      'took ' + clock(r.ms)
    ].filter(Boolean).join(' · ') : '';
    els.counts.innerHTML = ok ? '<div class="sl-countline">' + esc(line) + '</div><div class="muted small">' + esc(detail) + '</div>'
      : '<div class="sl-warn">' + esc(S.msg || r.error || 'The conversion did not finish.') + '</div>';
    var warns = (sm.warnings || []).filter(Boolean);
    els.warn.hidden = !warns.length;
    els.warn.innerHTML = warns.map(function (w) { return '<div>' + esc(w) + '</div>'; }).join('');
    els.acts.hidden = !ok;
    els.dls.hidden = !(ok || (r.musicxml && S.phase === 'error'));
    els.dlMid.hidden = !ok;
    els.dlMxl.hidden = !r.mxl;
    var hasLib = !!(App.library && typeof App.library.saveScan === 'function');
    els.librow.hidden = !ok || !hasLib;
    els.libmsg.textContent = S.lib;
  }
  function paintAll() {
    if (!els.root) return;
    paintSel();
    var running = S.phase === 'running', r = S.result;
    els.out.hidden = !(running || r);
    els.prog.hidden = !running;
    els.outh.textContent = running ? 'Reading the music' : S.phase === 'done' ? 'Your score' : 'Could not convert';
    if (running) {
      paintProgress();
      if (els.pages.getAttribute('data-job') !== S.job.id) { els.pages.innerHTML = ''; els.pages.setAttribute('data-job', S.job.id); }
    } else if (r) {
      if (els.pages.getAttribute('data-job') === null || !els.pages.children.length) paintPages(r.pages, r.thumbs, r.meta);
    } else {
      els.pages.innerHTML = '';
      els.pages.removeAttribute('data-job');
    }
    paintResult();
  }

  // ---------------------------------------------------------------- the page

  function css() {
    App.injectCSS('sheetlab',
      '#panel-sheetlab{max-width:900px;margin:0 auto}' +
      '#panel-sheetlab [hidden]{display:none!important}' +
      '#panel-sheetlab fieldset{border:0;margin:0;padding:0;min-width:0}' +
      '#panel-sheetlab .btn{min-height:42px;display:inline-flex;align-items:center;justify-content:center;gap:7px}' +
      '#panel-sheetlab .btn.sm{min-height:var(--h-ctl)}' +
      '#panel-sheetlab input[type=text],#panel-sheetlab input[type=number],#panel-sheetlab select{font-size:16px;width:100%;box-sizing:border-box;min-height:42px}' +
      '.sl-lead{margin:-4px 0 12px;line-height:1.5}' +
      // engine line
      '.sl-engine{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:12px 14px;border-radius:12px;border:1px solid var(--line);' +
        'background:var(--inset);line-height:1.45;margin-bottom:14px}' +
      '.sl-engine .sl-etext{flex:1 1 240px;min-width:0}' +
      '.sl-engine.ok{color:var(--text)}.sl-engine.ok .sl-eicon{color:var(--green);display:inline-flex}' +
      '.sl-engine.bad{color:var(--warn)}' +
      '.sl-engine.wait{border-color:var(--accent-line);background:var(--accent-soft)}' +
      '.sl-engine.nudge{animation:sl-nudge .7s ease 2}' +
      '@keyframes sl-nudge{50%{box-shadow:0 0 0 4px var(--accent-soft);border-color:var(--accent)}}' +
      '.sl-erow{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;width:100%}' +
      '.sl-enote{flex:1 1 100%;font-size:12.5px;color:var(--warn)}' +
      // drop zone
      '.sl-drop{border:2px dashed var(--ctl-border);border-radius:14px;padding:18px 14px;text-align:center;cursor:pointer;' +
        'transition:border-color 120ms ease,background 120ms ease;outline:none}' +
      '.sl-drop:focus-visible,.sl-drop.over{border-color:var(--accent);background:var(--accent-soft)}' +
      '@media (hover:hover){.sl-drop:hover{border-color:var(--accent-line)}}' +
      '.sl-drop.dis{opacity:.5;pointer-events:none}' +
      '.sl-drop-ic{color:var(--accent-ink);display:flex;justify-content:center;margin-bottom:6px}' +
      '.sl-drop-t{font-weight:600;font-size:15.5px}' +
      '.sl-drop-s{margin-top:4px}' +
      '.sl-pick{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:12px}' +
      '.sl-pick .btn{flex:0 1 auto}.sl-pick .btn.dis{opacity:.4;pointer-events:none}' +
      '.sl-pick label.btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}' +
      '.sl-hostnote{margin-top:12px;color:var(--warn);line-height:1.45;font-size:14px}' +
      '.sl-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}' +
      '.sl-sel{margin-top:14px;padding:12px 14px;border:1px solid var(--accent-line);border-radius:12px;background:var(--accent-soft)}' +
      '.sl-selname{font-weight:600;overflow-wrap:anywhere;margin-bottom:10px}' +
      '.sl-selacts{display:flex;flex-wrap:wrap;gap:10px}' +
      '.sl-msg{margin-top:12px;line-height:1.45}.sl-msg.err{color:var(--warn)}' +
      // options
      '.card h3.sl-optsh{margin-top:24px}' +
      '.sl-opts{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px}' +
      '.sl-opts label.field{display:flex;min-width:0}' +
      '.sl-tnote{font-size:12px;font-weight:500;letter-spacing:0;text-transform:none;color:var(--muted);min-height:16px}' +
      '.sl-link{background:none;border:0;padding:0;color:var(--accent-ink);font:inherit;text-decoration:underline;cursor:pointer;text-align:left}' +
      '.sl-field{display:flex;flex-direction:column;gap:5px;min-width:0}' +
      '.sl-dpi{display:flex;width:100%;box-sizing:border-box;min-height:42px}.sl-dpi button{flex:1 1 0;padding:4px 8px}' +
      '.sl-checks{display:flex;flex-wrap:wrap;gap:6px 22px;margin-top:14px}' +
      '.sl-check{display:inline-flex;align-items:center;gap:10px;min-height:40px;cursor:pointer;font-size:15px}' +
      '.sl-check input{width:20px;height:20px;flex:none}' +
      // progress + result
      '.sl-prog .sl-stage{font-weight:600;font-size:16px}' +
      '.sl-bar{position:relative;height:10px;border-radius:6px;background:var(--inset);border:1px solid var(--ctl-border);overflow:hidden;margin:10px 0 12px;flex:1 1 100%}' +
      '.sl-bar>span{position:absolute;left:0;top:0;bottom:0;width:0;background:var(--accent);border-radius:6px;transition:width 300ms ease}' +
      '.sl-progrow{display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap}' +
      '.sl-elapsed{font-variant-numeric:tabular-nums}' +
      'label.field.sl-titlef{display:flex;max-width:560px;margin-bottom:12px}' +
      '.sl-countline{font-weight:600;font-size:15.5px;margin-bottom:2px}' +
      '.sl-warn{margin-top:10px;color:var(--warn);line-height:1.45}' +
      '.sl-acts{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:14px}' +
      '.sl-dls{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;align-items:center}' +
      '.sl-librow{display:flex;flex-wrap:wrap;gap:8px 12px;margin-top:12px;align-items:center}' +
      '.sl-librow .muted{flex:1 1 200px;min-width:0;line-height:1.4}' +
      '.sl-pages{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-top:16px}' +
      '.sl-pages:empty{display:none}' +
      '.sl-page{margin:0;min-width:0}' +
      '.sl-page figcaption{font-size:13.5px;margin-bottom:6px;line-height:1.4}' +
      '.sl-psum{color:var(--muted)}.sl-psum.sl-skip{color:var(--warn)}' +
      '.sl-pwrap{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--inset)}' +
      '.sl-prev{display:block;width:100%;height:auto}' +
      '@media (max-width:480px){#panel-sheetlab .card{padding:16px 14px}.sl-pick .btn,.sl-selacts .btn{flex:1 1 100%}' +
        '.sl-opts{grid-template-columns:1fr 1fr;grid-auto-flow:dense;gap:12px}.sl-opts .sl-wide{grid-column:1/-1}' +
        '.sl-acts{grid-template-columns:1fr 1fr}.sl-acts .btn{padding-left:8px;padding-right:8px}.sl-pages{grid-template-columns:1fr}}' +
      '@media (max-width:340px){.sl-opts{grid-template-columns:1fr}}' +
      '@media (pointer:coarse){#panel-sheetlab .btn{min-height:46px}}'
    );
  }

  function instOptions() {
    return Object.keys(GM).map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('');
  }
  function trOptions() {
    var o = '';
    for (var t = 12; t >= -12; t--) {
      var lbl = t === 0 ? '0 (as written)' : (t > 0 ? '+' : '−') + Math.abs(t) + (Math.abs(t) === 12 ? ' (an octave)' : '');
      o += '<option value="' + t + '">' + lbl + '</option>';
    }
    return o;
  }

  function init(rootEl) {
    css();
    var touch = isTouch();
    rootEl.innerHTML =
      '<div class="card" id="sl-card">' +
        '<h2>Sheet music to MIDI</h2>' +
        '<div class="muted sl-lead">A PDF, a photo or a scan of printed sheet music becomes MIDI and MusicXML to play, practise or keep. ' +
          'It is read on this device; nothing is uploaded.</div>' +
        '<div class="sl-engine" id="sl-engine" aria-live="polite"></div>' +
        '<div class="sl-drop" id="sl-drop">' +
          '<div class="sl-drop-ic">' + App.icon('note', 28) + '</div>' +
          '<div class="sl-drop-t">' + (touch ? 'Choose sheet music, or take a photo' : 'Drop a PDF or pictures of sheet music here') + '</div>' +
          '<div class="sl-drop-s muted small" id="sl-drop-s">PDF, PNG, JPG, WEBP, BMP or TIFF. Several pictures become several pages.</div>' +
          // the pickers are <label>s around hidden inputs: tabindex + role + Enter/Space (init) make them keyboard buttons
          '<div class="sl-pick">' +
            '<label class="btn primary" id="sl-choose" tabindex="0" role="button" aria-describedby="sl-drop-s">Choose a file<input type="file" id="sl-file" multiple hidden ' +
              'accept=".pdf,application/pdf,image/*,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff"></label>' +
            '<label class="btn" id="sl-photo" tabindex="0" role="button"' + (touch ? '' : ' hidden') + '><span id="sl-photolbl">Take a photo</span>' +
              '<input type="file" id="sl-cam" accept="image/*" capture="environment" hidden></label>' +
          '</div>' +
          '<div class="sl-hostnote" id="sl-hostnote" hidden></div>' +
        '</div>' +
        '<div class="sl-sel" id="sl-sel" hidden>' +
          '<div class="sl-selname" id="sl-selname"></div>' +
          '<div class="sl-selacts">' +
            '<button type="button" class="btn primary" id="sl-go">Convert to MIDI</button>' +
            '<button type="button" class="btn" id="sl-clear">Clear</button>' +
          '</div>' +
        '</div>' +
        '<div class="sl-msg muted" id="sl-msg" role="status" aria-live="polite" hidden></div>' +
        '<h3 class="sl-optsh">Options</h3>' +
        '<fieldset id="sl-optset"><div class="sl-opts" id="sl-opts">' +
          '<label class="field">Tempo (BPM)<input type="number" id="sl-tempo" min="20" max="300" step="1" inputmode="numeric">' +
            '<span class="sl-tnote" id="sl-tnote"></span></label>' +
          '<label class="field sl-wide">Instrument<select id="sl-inst">' + instOptions() + '</select></label>' +
          '<label class="field">Transpose<select id="sl-tr">' + trOptions() + '</select></label>' +
          '<div class="sl-field sl-wide"><span class="ctl-label" id="sl-dpilbl">PDF quality</span>' +
            '<div class="seg sl-dpi" id="sl-dpi" role="group" aria-labelledby="sl-dpilbl">' +
              '<button type="button" data-v="300">300 dpi</button><button type="button" data-v="200">200 dpi</button>' +
            '</div><span class="sl-tnote">200 dpi is faster</span></div>' +
        '</div>' +
        '<div class="sl-checks">' +
          '<label class="sl-check"><input type="checkbox" id="sl-split"> Split 2-page spreads</label>' +
          '<label class="sl-check"><input type="checkbox" id="sl-enhance"> Enhance low-res scans</label>' +
          '<label class="sl-check" id="sl-autosave-row" hidden><input type="checkbox" id="sl-autosave"> Also save to my library</label>' +
        '</div></fieldset>' +
        '<details class="tips"><summary>What reads well</summary><div>Printed (engraved) music, one page at a time, flat and evenly lit; ' +
          'PDFs straight from a notation program read best. Handwriting, guitar tab, chord charts and lyrics are not read. ' +
          'The first run downloads the recognition engine (homr: AGPL-3.0; OpenCV, ONNX Runtime and pdf.js) once; ' +
          'a long piece takes a while on a phone, and you can use other pages meanwhile.</div></details>' +
      '</div>' +
      '<div class="card sl-out" id="sl-out" hidden>' +
        '<h2 id="sl-outh">Scan</h2>' +
        '<div class="sl-prog" id="sl-prog" hidden>' +
          '<div class="sl-progrow"><span class="sl-stage" id="sl-stage">Starting…</span><span class="muted small sl-elapsed" id="sl-elapsed">0:00</span></div>' +
          '<div class="muted small" id="sl-pageof" aria-live="polite"></div>' +
          '<div class="sl-bar" id="sl-bar" role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>' +
          '<div class="sl-progrow"><button type="button" class="btn" id="sl-stop">' + App.icon('stop', 16) + 'Stop</button>' +
            '<span class="muted small">Other pages keep working meanwhile; keep soundLAB open.</span></div>' +
        '</div>' +
        '<div id="sl-res" hidden>' +
          '<label class="field sl-titlef">Title<input type="text" id="sl-title" maxlength="120" autocomplete="off" spellcheck="false"></label>' +
          '<div id="sl-counts"></div>' +
          '<div class="sl-warn small" id="sl-warn" hidden></div>' +
          '<div class="sl-acts" id="sl-acts">' +
            '<button type="button" class="btn primary" id="sl-play">' + App.icon('play', 16) + 'Play on synth</button>' +
            '<button type="button" class="btn" id="sl-practice">' + App.icon('target', 16) + 'Practice</button>' +
            '<button type="button" class="btn" id="sl-tab">' + App.icon('guitar', 16) + 'Open as tab</button>' +
          '</div>' +
          '<div class="sl-dls" id="sl-dls"><span class="ctl-label">Download</span>' +
            '<button type="button" class="btn sm" id="sl-dl-mid">.mid</button>' +
            '<button type="button" class="btn sm" id="sl-dl-xml">.musicxml</button>' +
            '<button type="button" class="btn sm" id="sl-dl-mxl">.mxl</button>' +
          '</div>' +
          '<div class="sl-librow" id="sl-librow"><button type="button" class="btn sm" id="sl-save">Save to my library</button>' +
            '<span class="muted small" id="sl-libmsg" role="status" aria-live="polite"></span></div>' +
        '</div>' +
        '<div class="sl-pages" id="sl-pages"></div>' +
      '</div>';

    var $ = function (id) { return document.getElementById(id); };
    els = {
      root: rootEl, engine: $('sl-engine'), drop: $('sl-drop'), file: $('sl-file'), cam: $('sl-cam'), choose: $('sl-choose'),
      photo: $('sl-photo'), photoLabel: $('sl-photolbl'), sel: $('sl-sel'), selname: $('sl-selname'), go: $('sl-go'), clear: $('sl-clear'),
      msg: $('sl-msg'), optset: $('sl-optset'), tempo: $('sl-tempo'), tempoNote: $('sl-tnote'), inst: $('sl-inst'), tr: $('sl-tr'),
      dpi: $('sl-dpi'), split: $('sl-split'), enhance: $('sl-enhance'), autosave: $('sl-autosave'), autosaveRow: $('sl-autosave-row'),
      out: $('sl-out'), outh: $('sl-outh'), prog: $('sl-prog'), stage: $('sl-stage'), elapsed: $('sl-elapsed'), pageof: $('sl-pageof'),
      bar: $('sl-bar'), stop: $('sl-stop'), res: $('sl-res'), title: $('sl-title'), counts: $('sl-counts'), warn: $('sl-warn'),
      acts: $('sl-acts'), dls: $('sl-dls'), dlMid: $('sl-dl-mid'), dlXml: $('sl-dl-xml'), dlMxl: $('sl-dl-mxl'),
      librow: $('sl-librow'), libmsg: $('sl-libmsg'), save: $('sl-save'), pages: $('sl-pages'), hostnote: $('sl-hostnote')
    };

    // picking
    els.file.addEventListener('change', function () { var f = this.files; setFiles(f, false); this.value = ''; if (S.engine === 'unknown') checkEngine(); });
    els.cam.addEventListener('change', function () { var f = this.files; setFiles(f, true); this.value = ''; if (S.engine === 'unknown') checkEngine(); });
    // keyboard: Enter / Space on the two picker labels opens their file chooser (a label is not a button)
    [els.choose, els.photo].forEach(function (lb) {
      lb.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        e.preventDefault();
        if (S.phase === 'running') return;
        var inp = lb.querySelector('input');
        if (inp && !inp.disabled) inp.click();
      });
      lb.addEventListener('click', function () { if (hostCannotPick()) App.toast(hostNote(), 7000); });
    });
    if (hostCannotPick()) { els.hostnote.textContent = hostNote(); els.hostnote.hidden = false; }
    els.drop.addEventListener('click', function (e) {
      if (e.target.closest('label, input, button')) return; // the buttons inside open their own pickers
      if (S.phase !== 'running') els.file.click();
    });
    ['dragenter', 'dragover'].forEach(function (t) {
      els.drop.addEventListener(t, function (e) { e.preventDefault(); if (S.phase !== 'running') els.drop.classList.add('over'); });
    });
    ['dragleave', 'dragend'].forEach(function (t) { els.drop.addEventListener(t, function () { els.drop.classList.remove('over'); }); });
    els.drop.addEventListener('drop', function (e) {
      e.preventDefault();
      els.drop.classList.remove('over');
      if (S.phase === 'running') return;
      var f = e.dataTransfer && e.dataTransfer.files;
      if (f && f.length) { setFiles(f, false); if (S.engine === 'unknown') checkEngine(); }
    });
    // a file dropped next to the zone must not navigate away from the app
    rootEl.addEventListener('dragover', function (e) { e.preventDefault(); });
    rootEl.addEventListener('drop', function (e) { e.preventDefault(); });
    els.go.addEventListener('click', function () { convert(); });
    els.clear.addEventListener('click', function () { S.files = []; S.pending = false; say(''); paintSel(); paintEngine(); });
    els.engine.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'sl-dl') downloadEngine();
      else if (b.id === 'sl-dlstop') stopDownload();
    });

    // options
    var setTempo = function () {
      var v = Math.round(Number(els.tempo.value));
      if (!(v >= 20 && v <= 300)) { paintOpts(); return; }
      App.store.set('sheetlab.tempo', v === sharedBpm() && App.store.get('sheetlab.tempo', null) == null ? null : v);
      paintOpts();
    };
    els.tempo.addEventListener('change', setTempo);
    els.tempoNote.addEventListener('click', function (e) {
      if (e.target.id === 'sl-tempo-shared') { App.store.set('sheetlab.tempo', null); paintOpts(); }
    });
    els.inst.addEventListener('change', function () { App.store.set('sheetlab.instrument', els.inst.value); });
    els.tr.addEventListener('change', function () { App.store.set('sheetlab.transpose', parseInt(els.tr.value, 10) || 0); });
    els.split.addEventListener('change', function () { App.store.set('sheetlab.split', !!els.split.checked); });
    els.enhance.addEventListener('change', function () { App.store.set('sheetlab.enhance', !!els.enhance.checked); });
    els.autosave.addEventListener('change', function () { App.store.set('sheetlab.autosave', !!els.autosave.checked); });
    els.dpi.addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]');
      if (!b) return;
      App.store.set('sheetlab.dpi', parseInt(b.getAttribute('data-v'), 10) === 200 ? 200 : 300);
      paintOpts();
    });
    App.on('tempo', function () { if (App.store.get('sheetlab.tempo', null) == null && document.activeElement !== els.tempo) paintOpts(); });

    // progress + result
    els.stop.addEventListener('click', function () { stop(); });
    els.title.addEventListener('change', function () {
      var r = S.result;
      if (!r) return;
      r.title = cleanTitle(els.title.value) || r.origTitle;
      els.title.value = r.title;
      exportsFor().catch(function (e) { fail(e); }); // ready before the next tap
    });
    els.title.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); els.title.blur(); } });
    $('sl-play').addEventListener('click', function () { playOnSynth(); });
    $('sl-practice').addEventListener('click', function () { practice(); });
    $('sl-tab').addEventListener('click', function () { openAsTab(); });
    els.dlMid.addEventListener('click', function () { download('mid'); });
    els.dlXml.addEventListener('click', function () { if (S.phase === 'done') download('musicxml'); else downloadRaw('musicxml'); });
    els.dlMxl.addEventListener('click', function () { if (S.phase === 'done') download('mxl'); else downloadRaw('mxl'); });
    els.save.addEventListener('click', function () { saveToLibrary(false); });

    paintOpts();
    paintEngine();
    paintAll();
  }

  function onShow() {
    clearTimeout(W.idleT);
    paintOpts();
    if (S.engine === 'unknown' || (S.engine === 'needed' && !S.dl)) checkEngine();
    paintAll();
  }
  function onHide() {
    scheduleIdleKill();
  }

  function snapshot() {
    var job = S.job, r = S.result;
    return {
      phase: S.phase, engine: S.engine, size: S.size ? { total: S.size.total, estimate: S.size.estimate, cacheAvailable: S.size.cacheAvailable } : null,
      pending: S.pending, message: S.msg, error: S.msgErr ? S.msg : '', library: S.lib, workerAlive: !!W.w, prepared: W.prepared,
      trail: (S.trail || []).slice(),
      files: fileInfo().files,
      progress: job ? { stage: job.stage, text: stageText(job), page: job.cur + 1, pages: job.count, label: job.label, fraction: fraction(job), elapsedMs: Date.now() - job.t0 } : null,
      result: r ? {
        title: r.title, success: r.success, error: r.error, source: r.source, pagesInFile: r.sourcePages, ms: r.ms,
        summary: { pagesProcessed: r.summary.pagesProcessed, pagesSkipped: r.summary.pagesSkipped, totalMeasures: r.summary.totalMeasures,
          totalNotes: r.summary.totalNotes, totalChords: r.summary.totalChords, durationSeconds: r.summary.durationSeconds,
          pageSummaries: r.summary.pageSummaries, warnings: r.summary.warnings, tempoBpm: r.summary.tempoBpm, program: r.summary.program,
          instrumentName: r.summary.instrumentName, transposeSemitones: r.summary.transposeSemitones },
        pages: r.pages.map(function (p) { return { label: p.label, staffCount: p.staffCount, voiceCount: p.voiceCount, skipped: p.skipped, preview: !!p.preview }; }),
        midiBytes: r.midi ? r.midi.length : 0, musicxml: r.musicxml, xmlRaw: r.xmlRaw
      } : null
    };
  }

  App.sheetlab = {
    open: function (f) { try { return open(f); } catch (e) { fail(e); return Promise.resolve(fileInfo()); } },
    convert: convert,
    stop: stop,
    exports: exportsFor,
    get state() { return snapshot(); },
    GM: GM, PDFJS: PDFJS, ESTIMATE: ESTIMATE
  };

  App.register('sheetlab', {
    init: init, onShow: onShow, onHide: onHide,
    onRemote: function () { return false; } // hands-free control has nothing to move on here
  });
})();
