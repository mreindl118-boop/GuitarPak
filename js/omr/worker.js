/* soundLAB OMR worker: sheet music page images -> MusicXML / MIDI / .mxl with the engine in js/omr
   (homr, github.com/liebharc/homr, AGPL-3.0, and the owner's SheetLab engine: js/omr/engine.js).
   A classic Web Worker: new Worker('js/omr/worker.js'). Nothing is downloaded until 'prepare' or the
   first 'page' (the runtime then loads opencv.js, onnxruntime-web and the three models through
   OMR.runtime: verified, kept in Cache Storage 'soundlab-omr-v1', offline afterwards).

   main -> worker
     {cmd:'init', base?, models?, vendor?, pool?, hints?, debug?, cache?}
         base = the app root WITH a trailing slash (default: two levels above this script);
         models = 'models/omr/' (dir of manifest.json); vendor = same-origin dir with the runtime
         files (tests / offline dev); pool = 'auto' (default) | false | n helper workers;
         hints = {ios, deviceMemory, hardwareConcurrency, userAgent} from the page (an iPad's worker
         cannot tell itself from a Mac: pass ios = /iPad|iPhone|iPod/ or Macintosh + maxTouchPoints > 1). Execution provider: always 'wasm' (the int8 models have no WebGPU
         kernels and WebGPU changes the encoder's numbers).                -> {type:'ready', pool}
     {cmd:'size', id?, cachedOnly?}  what a first run downloads (cachedOnly: from Cache Storage only,
         no request at all; {known:false} until the manifest was cached)  -> {type:'size', id, ...}
     {cmd:'prepare', id?}  download / load everything now (progress stage 'download')
                                                                           -> {type:'prepared', id, info}
     {cmd:'page', id, label, index, count, image:{w, h, data}, opts}
         one page of document `id` (a new id starts a new document; opts of its first page count):
         data = canvas ImageData RGBA (Uint8ClampedArray, transfer its buffer); index = 0-based page of
         the file, count = pages in the file (for the progress fraction). Send the next page after
         its 'pageDone' so that only one page image is in memory.        -> 'staffs', 'page', 'pageDone'
         opts (OMR.engine.Translation): {tempoBpm 112, instrumentName 'Acoustic Grand Piano',
         program?, transposeSemitones 0, splitWideSpreads true, upscaleLowRes true, title (the PDF's
         metadata title, '' for images), sourceName (the file name)}; diagnostics: withVoices (the
         page's voices as symbol strings), recordStaffs (each transformer call's input sha1 + tokens)
     {cmd:'finish', id}    merge the pages, MusicXML, MIDI, .mxl          -> {type:'result', ...}
     {cmd:'cancel', id}    stops at the next check (between pages, segmentation batches and staffs;
         one dense staff can take ~40 s on a phone): to stop at once, terminate() the worker and
         make a new one (js/sheetlab.js does)                             -> {type:'cancelled', id}
   worker -> main
     {type:'progress', id, stage, fraction (0..1 overall), message?, done?, total?, label?, note?}
         stage 'download' (bytes; note = file), 'engine' (the engine's own progress_fn: fraction +
         message, e.g. 'Recognizing musical notation on Page 2 (2/5)...'), 'segment' (tiles),
         'staffs' (staff detection), 'read' (staffs read by the transformer)
     {type:'staffs', id, label, staffCount, preview:{w, h, items}}   the systems found on a page
     {type:'page', id, pageNumber, label, staffCount, voiceCount, skipped (null | reason), summary,
         preview:{w, h, items} | null, width, height, timings}      after each analysed page
         (a 2-page spread gives two); items = OMR.bounding_boxes drawables in preview.w x preview.h
         coordinates (the page resized to 1920 px wide)
     {type:'pageDone', id, index}
     {type:'result', id, success, cancelled, title, errorMessage, musicxml (the export: transposed, with the
         GM instrument), xmlRaw (homr's own MusicXML, what the MIDI is made from), midi: ArrayBuffer | null,
         mxl: ArrayBuffer | null, summary:{pagesProcessed, pagesSkipped, totalMeasures, totalNotes,
         totalChords, durationSeconds, pageSummaries, warnings, repeatsExpanded, pages, noteEvents,
         timings, tempoBpm, program, instrumentName, transposeSemitones, sourceName}}
     {type:'error', id, name, message}    {type:'cancelled', id}    {type:'log', message} (debug)

   Pages: RGBA is composited over WHITE, then RGB -> BGR (OMR.engine.imageFromRgba). The Python
   engine's PIL convert('RGB') drops alpha instead, which turns a transparent PNG black.

   POOL: GitHub Pages sends no COOP/COEP, so onnxruntime-web runs single-threaded. With pool > 1 this
   worker starts that many helper workers (nested workers: this same script, name 'omr-helper-N'),
   each with its own onnxruntime + segnet / encoder / decoder sessions (no opencv.js); segmentation
   batches of 8 tiles and transformer staffs run on them in parallel and are merged in a fixed order,
   bit-identical to the single-worker path (OMR.engine's pool notes). 'auto' = min(3, cores - 1)
   helpers; 1 (no helpers) on iOS / iPadOS and Safari (an iPad's desktop-mode user agent is the
   Mac's), with navigator.deviceMemory <= 4, without nested workers or without Cache Storage (each
   helper would download the models again); a number from the page overrides 'auto'. A helper that
   dies hands its task to another one, or to this worker. Sessions stay loaded between pages and
   documents; each page's images are dropped after the page. */
(function () {
  'use strict';
  const G = self;
  importScripts('manifest.js');
  importScripts.apply(null, G.OMR.FILES);
  const OMR = G.OMR;

  const state = {
    mode: null,           // 'main' | 'helper'
    debug: false,
    runtimeCfg: null,     // what helpers are configured with
    poolWanted: 'auto', hints: {}, poolSize: 1,
    ready: null, pool: null,
    doc: null, docId: null, cancelled: Object.create(null),
    queue: Promise.resolve()
  };

  function post(msg, transfer) { G.postMessage(msg, transfer || []); }
  function errInfo(e) {
    return { name: (e && (e.pyType || e.name)) || 'Error', message: e && e.message !== undefined ? String(e.message) : String(e) };
  }
  OMR.simple_logging.sink = (message) => {
    if (state.debug) post({ type: state.mode === 'helper' ? 'hlog' : 'log', message: message });
  };
  // serial: one page / finish at a time, in arrival order
  function enqueue(fn) {
    const p = state.queue.then(fn);
    state.queue = p.catch(() => {});
    return p;
  }

  // ---------------------------------------------------------------------------------- pool size
  function decidePool(pool, hints) {
    hints = hints || {};
    if (pool === false || pool === 0 || pool === 1 || pool === '1') return 1;
    if (typeof pool === 'number' && pool > 1) return Math.min(Math.floor(pool), 8);
    const nav = G.navigator || {};
    const cores = hints.hardwareConcurrency || nav.hardwareConcurrency || 1;
    const mem = hints.deviceMemory !== undefined ? hints.deviceMemory : nav.deviceMemory;
    const ua = hints.userAgent || nav.userAgent || '';
    if (hints.ios || /iPhone|iPad|iPod/.test(ua)) return 1;   // memory: one onnxruntime per helper
    // Safari: an iPad asks for the desktop site with the Mac's user agent (a worker cannot see
    // maxTouchPoints), and nested workers there are recent; one worker unless the page says otherwise
    if (/Safari\//.test(ua) && /Version\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|Android/.test(ua)) return 1;
    if (mem !== undefined && mem !== null && mem <= 4) return 1;
    if (typeof G.Worker !== 'function') return 1;               // no nested workers here
    return Math.max(1, Math.min(3, cores - 1));
  }

  // ---------------------------------------------------------------------------------- helpers
  const HELPER_SILENCE = 45000;
  class HelperPool {
    constructor() { this.helpers = []; this.queue = []; this.size = 0; this.local = false; }
    static async create(n, onProgress) {
      const pool = new HelperPool();
      // the first helper downloads everything into Cache Storage; the others then read it there
      const first = pool.spawn(0);
      await first.init(true, onProgress);
      const rest = [];
      for (let i = 1; i < n; i++) rest.push(pool.spawn(i));
      await Promise.all(rest.map((h) => h.init(false).catch(() => {})));
      pool.helpers = pool.helpers.filter((h) => h.alive);
      pool.size = pool.helpers.length;
      if (!pool.size) throw new Error('no helper worker started');
      return pool;
    }
    spawn(i) {
      const pool = this;
      const w = new G.Worker(G.location.href, { name: 'omr-helper-' + i });
      const h = {
        i: i, w: w, alive: true, ready: false, busy: null, onProgress: null, initWait: null,
        init(prepare, onProgress) {
          h.onProgress = onProgress || null;
          return new Promise((resolve, reject) => {
            h.initWait = { resolve: resolve, reject: reject };
            h.kick();
            w.postMessage({ cmd: 'helper', cfg: state.runtimeCfg, prepare: !!prepare, debug: state.debug });
          });
        },
        // a helper that stays silent while starting (e.g. a browser whose nested workers never run)
        // is given up after HELPER_SILENCE ms; download progress keeps a slow first start alive
        kick() {
          clearTimeout(h.timer);
          if (h.initWait) h.timer = setTimeout(() => pool.onDead(h, 'no answer from the helper worker'), HELPER_SILENCE);
        }
      };
      w.onmessage = (e) => pool.onMessage(h, e.data || {});
      w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); pool.onDead(h, e && e.message ? e.message : 'helper worker failed'); };
      w.onmessageerror = () => pool.onDead(h, 'helper message could not be read');
      this.helpers.push(h);
      return h;
    }
    onMessage(h, m) {
      h.kick();
      if (m.type === 'hprogress') { if (h.onProgress) h.onProgress(m.done, m.total, m.info || {}); return; }
      if (m.type === 'hlog') { if (state.debug) post({ type: 'log', message: '[helper ' + h.i + '] ' + m.message }); return; }
      if (m.type === 'hready') { h.ready = true; clearTimeout(h.timer); if (h.initWait) { h.initWait.resolve(); h.initWait = null; } return; }
      if (m.type === 'hfail') { this.onDead(h, m.message || 'helper could not start'); return; }
      if (m.type === 'hdone' || m.type === 'herror') {
        const task = h.busy;
        h.busy = null;
        if (task) {
          if (m.type === 'hdone') task.resolve(m.result);
          else { const e = new Error(m.message); e.name = m.name || 'Error'; if (m.pyType) e.pyType = m.pyType; task.reject(e); }
        }
        this.pump();
      }
    }
    onDead(h, why) {
      if (!h.alive) return;
      h.alive = false;
      clearTimeout(h.timer);
      try { h.w.terminate(); } catch (e) { /* gone */ }
      if (h.initWait) { h.initWait.reject(new Error(why)); h.initWait = null; }
      const task = h.busy;
      h.busy = null;
      if (task) this.queue.unshift(task); // another helper (or this worker) runs it again
      this.helpers = this.helpers.filter((x) => x.alive);
      this.size = this.helpers.length;
      if (state.debug) post({ type: 'log', message: 'OMR helper ' + h.i + ' stopped: ' + why });
      this.pump();
    }
    run(msg) {
      return new Promise((resolve, reject) => { this.queue.push({ msg: msg, resolve: resolve, reject: reject }); this.pump(); });
    }
    pump() {
      if (!this.helpers.length) { // nobody left: run here (the same code the helpers run)
        while (this.queue.length) {
          const t = this.queue.shift();
          runTask(t.msg).then(t.resolve, t.reject);
        }
        return;
      }
      for (const h of this.helpers) {
        if (!this.queue.length) return;
        if (!h.ready || h.busy || !h.alive) continue;
        const t = this.queue.shift();
        h.busy = t;
        try { h.w.postMessage(t.msg); } catch (e) { h.busy = null; this.queue.unshift(t); this.onDead(h, e.message); return; }
      }
    }
    // the OMR.engine pool interface (copies, so a dead helper's task can be sent again)
    segnet(data, dims) { return this.run({ cmd: 'seg', data: data, dims: dims }); }
    staff(image) {
      return this.run({ cmd: 'staff', image: { h: image.h, w: image.w, c: image.c, data: image.data } })
        .then((list) => OMR.engine.tasks.decodeSymbols(list));
    }
    // a cancelled document: its tasks that no helper has started yet are dropped
    dropQueued() {
      const q = this.queue;
      this.queue = [];
      for (const t of q) { const e = new Error('Cancelled'); e.name = 'AbortError'; e.omrCancel = true; t.reject(e); }
    }
    terminate() { for (const h of this.helpers) { try { h.w.terminate(); } catch (e) { /* gone */ } } this.helpers = []; this.size = 0; }
  }
  // a pool task, in a helper or here
  async function runTask(m) {
    if (m.cmd === 'seg') return OMR.engine.tasks.segnet(m.data, m.dims);
    if (m.cmd === 'staff') return OMR.engine.tasks.encodeSymbols(await OMR.engine.tasks.staff(m.image));
    throw new Error('unknown task ' + m.cmd);
  }

  // ---------------------------------------------------------------------------------- main mode
  function configure(m) {
    const base = m.base || new URL('../../', G.location.href).href;
    state.runtimeCfg = {
      base: base.endsWith('/') ? base : base + '/',
      models: m.models || 'models/omr/', vendor: m.vendor || null, ep: 'wasm', cache: m.cache !== false
    };
    OMR.runtime.configure(state.runtimeCfg);
  }

  function downloadProgress(id) {
    const doneBy = Object.create(null);
    let total = 0;
    const emit = (name) => {
      let done = 0;
      for (const k in doneBy) done += doneBy[k];
      post({ type: 'progress', id: id, stage: 'download', done: Math.min(done, total || done), total: total, note: name,
        fraction: total ? Math.min(1, done / total) : 0 });
    };
    return {
      setTotal(t) { total = t; },
      on(d, t, info) { // OMR.runtime progress: (bytesDone, bytesTotal, {name, cached, fileDone})
        info = info || {};
        doneBy[info.name || '?'] = info.cached ? 0 : (info.fileDone !== undefined ? info.fileDone : d);
        emit(info.name);
      }
    };
  }

  function ensureReady(id) {
    if (state.ready) return state.ready;
    state.ready = (async () => {
      const t0 = Date.now();
      const dl = downloadProgress(id);
      let size = null;
      try { size = await OMR.runtime.downloadSize(); dl.setTotal(size.total); } catch (e) { /* offline: the cache decides */ }
      await OMR.runtime.loadCv(dl.on);
      let poolSize = state.poolSize;
      // without Cache Storage every helper would download the models again (Node reads them from disk)
      if (poolSize > 1 && size && !size.cacheAvailable && OMR.runtime.info().platform !== 'node') poolSize = 1;
      if (poolSize > 1) {
        try { state.pool = await HelperPool.create(poolSize, dl.on); } catch (e) {
          state.pool = null;
          if (state.debug) post({ type: 'log', message: 'OMR pool off: ' + (e && e.message) });
        }
      }
      if (!state.pool) {
        await OMR.runtime.loadOrt(dl.on);
        for (const k of OMR.runtime.MODEL_KEYS) await OMR.runtime.session(k, { onProgress: dl.on });
      }
      const info = OMR.runtime.info();
      info.pool = state.pool ? state.pool.size : 1;
      info.readyMs = Date.now() - t0;
      return info;
    })();
    state.ready.catch(() => { state.ready = null; });
    return state.ready;
  }

  async function cachedSize() {
    const R = OMR.runtime;
    const base = state.runtimeCfg ? state.runtimeCfg.base : new URL('../../', G.location.href).href;
    const key = (rel) => new URL(rel, base).href;
    let cache = null;
    try { if (G.caches) cache = await G.caches.open(R.CACHE_NAME); } catch (e) { cache = null; }
    if (!cache) return { known: false, cacheAvailable: false };
    let manifest = null;
    try { const r = await cache.match(key('omr-cache/manifest.json')); if (r) manifest = JSON.parse(await r.text()); } catch (e) { manifest = null; }
    if (!manifest) return { known: false, cacheAvailable: true };
    const has = async (sha, name) => { try { return !!(await cache.match(key('omr-cache/' + sha + '/' + name))); } catch (e) { return false; } };
    const files = [];
    for (const k of R.MODEL_KEYS) {
      const e = manifest.models[k];
      files.push({ name: k, kind: 'model', bytes: e.bytes, cached: await has(e.sha256, k + '.onnx') });
    }
    const b = R.BUNDLES.wasm;
    for (const n of ['opencv.js', b.script, b.mjs, b.wasm]) {
      const f = R.RUNTIME_FILES[n];
      files.push({ name: n, kind: 'runtime', bytes: f.bytes, cached: await has(f.sha256, n) });
    }
    const sum = (kind) => files.filter((f) => !f.cached && (!kind || f.kind === kind)).reduce((s, f) => s + f.bytes, 0);
    return { known: true, total: sum(), models: sum('model'), runtime: sum('runtime'), files: files, cacheAvailable: true };
  }

  function stageFraction(doc, s) {
    const total = Math.max(1, doc.totalPages, doc.count);
    let sub = 0;
    if (s.stage === 'segment') sub = s.total ? 0.45 * s.done / s.total : 0;
    else if (s.stage === 'staffs') sub = 0.5;
    else if (s.stage === 'read') sub = 0.5 + (s.total ? 0.5 * s.done / s.total : 0);
    return 0.12 + 0.65 * (Math.max(0, doc.count - 1) + sub) / total;
  }

  function startDoc(id, opts) {
    const o = Object.assign({}, opts || {});
    o.pool = state.pool || null;
    const hooks = {
      cancelled: () => !!state.cancelled[id],
      progress: (p, message) => post({ type: 'progress', id: id, stage: 'engine', fraction: p, message: message }),
      stage: (s) => post({ type: 'progress', id: id, stage: s.stage, done: s.done, total: s.total, label: s.label,
        fraction: state.doc ? stageFraction(state.doc, s) : undefined }),
      staffs: (label, teaser, n) => post({ type: 'staffs', id: id, label: label, staffCount: n,
        preview: teaser ? { w: teaser.width, h: teaser.height, items: teaser.items } : null }),
      page: (info, analysis) => post({ type: 'page', id: id, pageNumber: info.pageNumber, label: info.label, staffCount: info.staffCount,
        voiceCount: info.voiceCount, skipped: info.skippedReason, summary: info.summary, width: info.width, height: info.height,
        preview: info.teaser ? { w: info.teaserWidth, h: info.teaserHeight, items: info.teaser } : null, timings: info.timings,
        // opts.withVoices (tests / diagnostics): the page's voices as homr's symbol strings
        voices: o.withVoices && analysis ? analysis.voices.map((v) => v.map((sym) => String(sym))) : undefined,
        // opts.recordStaffs: every transformer call {sha1 of the staff image, shape, tokens}
        staffs: info.staffs })
    };
    state.doc = new OMR.engine.Translation(o, hooks);
    state.docId = id;
    state.doc.start();
  }

  function sendResult(id, r) {
    const midi = r.midi ? r.midi.slice().buffer : null;
    const mxl = r.mxl ? r.mxl.slice().buffer : null;
    const transfer = [];
    if (midi) transfer.push(midi);
    if (mxl) transfer.push(mxl);
    post({
      type: 'result', id: id, success: r.success, cancelled: !!r.cancelled, title: r.title, errorMessage: r.errorMessage,
      musicxml: r.musicxml, xmlRaw: r.xmlRaw, midi: midi, mxl: mxl,
      summary: {
        pagesProcessed: r.pagesProcessed, pagesSkipped: r.pagesSkipped, totalMeasures: r.totalMeasures, totalNotes: r.totalNotes,
        totalChords: r.totalChords, durationSeconds: r.durationSeconds, pageSummaries: r.pageSummaries, warnings: r.warnings,
        repeatsExpanded: r.repeatsExpanded, pages: r.pages, noteEvents: r.noteEvents, timings: r.timings,
        tempoBpm: r.tempoBpm, program: r.program, instrumentName: r.instrumentName, transposeSemitones: r.transposeSemitones,
        sourceName: r.sourceName
      }
    }, transfer);
  }

  function fail(id, e) {
    if (e && (e.name === 'AbortError' || e.omrCancel)) { post({ type: 'cancelled', id: id }); return; }
    const i = errInfo(e);
    post({ type: 'error', id: id, name: i.name, message: i.message });
  }

  function onMain(m) {
    const id = m.id;
    switch (m.cmd) {
      case 'init':
        state.mode = 'main';
        state.debug = !!m.debug;
        configure(m);
        state.poolWanted = m.pool === undefined ? 'auto' : m.pool;
        state.hints = m.hints || {};
        state.poolSize = decidePool(state.poolWanted, state.hints);
        post({ type: 'ready', pool: state.poolSize });
        return;
      case 'size':
        if (!state.runtimeCfg) configure({});
        (m.cachedOnly ? cachedSize() : OMR.runtime.downloadSize().then((s) => Object.assign({ known: true }, s)))
          .then((s) => post(Object.assign({ type: 'size', id: id }, s)), (e) => fail(id, e));
        return;
      case 'prepare':
        if (!state.runtimeCfg) configure({});
        enqueue(() => ensureReady(id)).then((info) => post({ type: 'prepared', id: id, info: info }), (e) => fail(id, e));
        return;
      case 'page': {
        if (!state.runtimeCfg) configure({});
        const img = m.image;
        m.image = null;
        enqueue(async () => {
          if (state.cancelled[id]) return;
          await ensureReady(id);
          if (state.cancelled[id]) return;
          if (!state.doc || state.docId !== id) startDoc(id, m.opts);
          // RGBA (canvas ImageData) unless the page says it is BGR already ({format: 'bgr'}, tests)
          let bgr = img.format === 'bgr' ? { h: img.h, w: img.w, c: 3, data: img.data } : OMR.engine.imageFromRgba(img.w, img.h, img.data);
          img.data = null;
          await state.doc.addPage(bgr, m.label || ('Page ' + ((m.index || 0) + 1)),
            { sourcePages: m.count, pageIndex: m.index || 0, totalPages: m.totalPages });
          bgr = null;
          post({ type: 'pageDone', id: id, index: m.index || 0 });
        }).catch((e) => {
          if (state.docId === id && (state.cancelled[id] || (e && e.omrCancel))) {
            state.doc = null; state.docId = null;
            if (state.pool) state.pool.dropQueued();
          }
          fail(id, e);
        });
        return;
      }
      case 'finish':
        enqueue(async () => {
          if (state.cancelled[id]) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
          if (!state.doc || state.docId !== id) {
            await ensureReady(id);
            startDoc(id, m.opts);
          }
          const doc = state.doc;
          state.doc = null; state.docId = null;
          const r = await doc.finish();
          if (r.cancelled) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
          sendResult(id, r);
        }).catch((e) => fail(id, e));
        return;
      case 'cancel':
        // checked between pages, segmentation batches and staffs; queued pages of this id are dropped
        if (id !== undefined) state.cancelled[id] = true;
        else if (state.docId !== null) state.cancelled[state.docId] = true;
        return;
      default:
        post({ type: 'error', id: id, name: 'Error', message: 'unknown command ' + m.cmd });
    }
  }

  // ---------------------------------------------------------------------------------- helper mode
  function onHelper(m) {
    if (m.cmd === 'helper') {
      state.mode = 'helper';
      state.debug = !!m.debug;
      OMR.runtime.configure(m.cfg);
      (async () => {
        if (m.prepare) {
          const prog = (d, t, info) => post({ type: 'hprogress', done: d, total: t, info: info });
          await OMR.runtime.loadOrt(prog);
          for (const k of OMR.runtime.MODEL_KEYS) await OMR.runtime.session(k, { onProgress: prog });
        } else {
          await OMR.runtime.loadOrt();
          for (const k of OMR.runtime.MODEL_KEYS) { post({ type: 'hprogress', done: 0, total: 0, info: { name: k, cached: true } }); await OMR.runtime.session(k); }
        }
        post({ type: 'hready' });
      })().catch((e) => post({ type: 'hfail', message: errInfo(e).message }));
      return;
    }
    runTask(m).then((result) => {
      const transfer = m.cmd === 'seg' ? result.map((a) => a.buffer) : [];
      post({ type: 'hdone', result: result }, transfer);
    }, (e) => {
      const i = errInfo(e);
      post({ type: 'herror', name: i.name, pyType: e && e.pyType, message: i.message });
    });
  }

  G.onmessage = (e) => {
    const m = e.data || {};
    try {
      if (m.cmd === 'helper' || (state.mode === 'helper' && (m.cmd === 'seg' || m.cmd === 'staff'))) onHelper(m);
      else onMain(m);
    } catch (err) {
      fail(m.id, err);
    }
  };
})();
