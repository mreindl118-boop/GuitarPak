// SheetLab in soundLAB (js/sheetlab.js, page 'sheetlab' = Play › Scan): sheet music -> MIDI on the
// device. Headless Chromium against the served app; the CDN (jsDelivr: opencv.js, onnxruntime-web,
// pdf.js) is routed to the local npm packages found on NODE_PATH (or SL_PKG_DIRS), every other
// outside host is refused, and the models come from the repo's models/omr (tests/serve.py).
//   nav       the Scan pill in the Play group, the page and its cards
//   consent   no request to models/ or jsDelivr before Download, with the size from the manifest
//   options   tempo / instrument / transpose / dpi / switches persist under sheetlab.*, met.bpm untouched
//   songs     Songs' "Open a score" hands a PNG (and a PDF) to Scan
//   convert   tests/fixtures/omr/sheetlab-menuetto.png (ONE system of the Mozart duet no11-p1, the
//             fixture page of the OMR suites): Convert before the engine is there waits, Download
//             fetches + caches the engine and the conversion runs on; the result's MusicXML, MIDI and
//             counts equal what the Node engine produces for the same picture and options
//             (tests/fixtures/omr/sheetlab-menuetto.json, made by `node tests/sheetlab.test.js
//             --make-fixture`, i.e. OMR.engine.translate in Node with onnxruntime-web's wasm backend)
//   exports   Download .mid (parses, = the fixture) / .musicxml / .mxl; a new title re-titles the files
//             exactly like the engine would; Open as tab / Practice / Play on synth / Save to my library
//   stop      Stop mid-run terminates the worker, the page stays usable, a new worker comes next time
//   pdf       tests/fixtures/omr/sheetlab-menuetto.pdf (a cover page + the music, title in its
//             metadata) at 200 dpi through pdf.js and the worker's helper pool, the engine from cache
//   layout    360 px: no sideways scroll, big tap targets
//   a11y      (audit) Choose a file is reachable and opens with the keyboard; the aria-live lines
//             do not re-announce every download chunk / every second; focus stays on the page
//             after Stop; a double tap on Convert starts one run; Stop ends a run whose current
//             step cannot be cancelled (a file still being read); the Android app explains that
//             its WebView cannot pick files; previews survive a browser that gives no canvas
//             context (iOS Safari past its canvas memory); an engine update on the server is
//             asked for (Download) and never fetched by a conversion
//   sw        sw.js precaches js/sheetlab.js + every OMR.FILES file + the worker, keeps soundlab-omr-*
//             caches, passes models/omr and vendor/ to the network
// SL_SHEETLAB_POOL (default 1) is the worker pool of the first conversion ('auto' or n to vary it).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const env = require('./env');
const ROOT = env.ROOT;
const FIX = path.join(ROOT, 'tests', 'fixtures', 'omr');
const PNG = path.join(FIX, 'sheetlab-menuetto.png');
const PDF = path.join(FIX, 'sheetlab-menuetto.pdf');
const REF = path.join(FIX, 'sheetlab-menuetto.json');
// the options of the reference conversion (the page is set to the same ones through its UI)
const REF_OPTS = { tempoBpm: 96, instrumentName: 'Violin', program: 40, transposeSemitones: 2, splitWideSpreads: true, upscaleLowRes: true, title: '', sourceName: 'mozart-menuetto.png' };

let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } return !!c; }
function info(m) { console.log('  INFO', m); }
const t00 = Date.now();
const secs = () => ((Date.now() - t00) / 1000).toFixed(1) + ' s';

// ------------------------------------------------------------------------------- Node helpers
function loadOmr(files) {
  globalThis.self = globalThis.self || globalThis;
  for (const f of files) require(path.join(ROOT, 'js', 'omr', f));
  return globalThis.OMR;
}
function pngToRgba(file) { // 8-bit RGB / RGBA PNG -> RGBA (what a canvas gives the worker)
  const buf = fs.readFileSync(file);
  let p = 8, w = 0, h = 0, ct = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12]) throw new Error('8-bit non-interlaced only'); }
    else if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const ch = { 2: 3, 6: 4 }[ct];
  if (!ch) throw new Error('RGB / RGBA PNG only');
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, px = new Uint8Array(h * stride);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[x] = v & 255;
    }
    prev = cur;
  }
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    for (let k = 0; k < 3; k++) rgba[i * 4 + k] = px[i * ch + k];
    rgba[i * 4 + 3] = ch === 4 ? px[i * ch + 3] : 255;
  }
  return { w, h, data: rgba };
}
// a Standard MIDI File -> {format, ntrks, division, tracks: [{name, notes, events}]} (throws if malformed)
function parseSmf(b) {
  const u32 = (i) => b.readUInt32BE(i), u16 = (i) => b.readUInt16BE(i);
  if (b.toString('ascii', 0, 4) !== 'MThd') throw new Error('no MThd');
  const out = { format: u16(8), ntrks: u16(10), division: u16(12), tracks: [] };
  let p = 8 + u32(4);
  for (let t = 0; t < out.ntrks; t++) {
    if (b.toString('ascii', p, p + 4) !== 'MTrk') throw new Error('no MTrk ' + t);
    const end = p + 8 + u32(p + 4);
    let i = p + 8, st = 0;
    const tr = { name: null, notes: 0, events: 0, tempo: null, program: null };
    const vlq = () => { let v = 0, c; do { c = b[i++]; v = (v << 7) | (c & 127); } while (c & 128); return v; };
    while (i < end) {
      vlq();
      let s = b[i];
      if (s & 0x80) { i++; st = s; } else s = st;
      tr.events++;
      if (s === 0xff) {
        const type = b[i++], len = vlq(), d = b.subarray(i, i + len); i += len;
        if (type === 0x03 && tr.name === null) tr.name = d.toString('utf8');
        if (type === 0x51) tr.tempo = (d[0] << 16) | (d[1] << 8) | d[2];
        if (type === 0x2f) break;
      } else if (s === 0xf0 || s === 0xf7) { i += vlq(); }
      else {
        const hi = s & 0xf0, n = hi === 0xc0 || hi === 0xd0 ? 1 : 2;
        if (hi === 0x90 && b[i + 1] > 0) tr.notes++;
        if (hi === 0xc0) tr.program = b[i];
        i += n;
      }
    }
    if (i > end) throw new Error('track overruns ' + t);
    out.tracks.push(tr);
    p = end;
  }
  return out;
}
function pkgDir(name, version) { // a local copy of an npm package (NODE_PATH, SL_PKG_DIRS)
  const dirs = [].concat((process.env.SL_PKG_DIRS || '').split(path.delimiter), (process.env.NODE_PATH || '').split(path.delimiter)).filter(Boolean);
  for (const d of dirs) {
    const p = path.join(d, name);
    try { const pj = JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8')); if (!version || pj.version === version) return p; } catch (e) { /* next */ }
  }
  return null;
}

// ------------------------------------------------------------------------------- --make-fixture
async function makeFixture() {
  const H = require('./omr/harness');
  const OMR = H.load();
  await H.cv(); H.ort();
  OMR.runtime.configure({ readFile: (p) => fs.readFileSync(path.join(ROOT, p)) });
  const img = pngToRgba(PNG);
  const bgr = OMR.engine.imageFromRgba(img.w, img.h, img.data);
  const t0 = Date.now();
  const r = await OMR.engine.translate([{ label: 'Page 1', image: bgr }], REF_OPTS);
  const out = {
    made: 'node tests/sheetlab.test.js --make-fixture: OMR.engine.translate (js/omr, Node, onnxruntime-web wasm, the repo models) on ' +
      path.basename(PNG) + ' as RGBA over white, like the page sends it',
    options: REF_OPTS, ms: Date.now() - t0,
    title: r.title, success: r.success, errorMessage: r.errorMessage, pageSummaries: r.pageSummaries,
    summary: { pagesProcessed: r.pagesProcessed, pagesSkipped: r.pagesSkipped, totalMeasures: r.totalMeasures, totalNotes: r.totalNotes,
      totalChords: r.totalChords, durationSeconds: r.durationSeconds, warnings: r.warnings },
    pages: r.pages.map((p) => ({ label: p.label, staffCount: p.staffCount, voiceCount: p.voiceCount, skipped: p.skippedReason })),
    musicxml: r.musicxml, xmlRaw: r.xmlRaw, midi: Buffer.from(r.midi).toString('base64')
  };
  fs.writeFileSync(REF, JSON.stringify(out, null, 1) + '\n');
  console.log('wrote ' + REF + ' (' + out.ms + ' ms): ' + out.title + ', ' + out.pageSummaries.join('; ') + ', ' + out.summary.totalNotes + ' notes');
}

// ------------------------------------------------------------------------------- sw.js (Node)
async function swChecks(OMRFILES) {
  console.log('# sw.js');
  const src = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const listeners = {}, deleted = [];
  const sandbox = {
    self: { addEventListener: (t, f) => { listeners[t] = f; }, location: { origin: 'https://x.test' }, registration: { scope: 'https://x.test/GuitarPak/' },
      skipWaiting: () => Promise.resolve(), clients: { claim: () => Promise.resolve() } },
    caches: { keys: () => Promise.resolve(['guitarlab-v1', 'guitarlab-v2', 'soundlab-omr-v1', 'soundlab-omr-pdfjs-v1', 'another-app-v3']),
      delete: (k) => { deleted.push(k); return Promise.resolve(true); }, match: () => Promise.resolve(null), open: () => Promise.resolve({ put() {} }) },
    fetch: () => Promise.resolve({ clone() { return this; } })
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const assets = sandbox.ASSETS, CACHE = sandbox.CACHE;
  const omr = OMRFILES.map((f) => 'js/omr/' + f);
  ok(assets.indexOf('js/sheetlab.js') >= 0 && assets.indexOf('js/omr/manifest.js') >= 0 && assets.indexOf('js/omr/worker.js') >= 0,
    'ASSETS has js/sheetlab.js, js/omr/manifest.js and js/omr/worker.js');
  const missing = omr.filter((f) => assets.indexOf(f) < 0);
  ok(!missing.length, 'ASSETS lists every OMR.FILES file (' + omr.length + ')' + (missing.length ? ': missing ' + missing.join(', ') : ''));
  const absent = assets.filter((a) => a !== '.' && !fs.existsSync(path.join(ROOT, a)));
  ok(!absent.length, 'every ASSETS entry exists' + (absent.length ? ': ' + absent.join(', ') : ''));
  ok(!assets.some((a) => /^(models|vendor)\//.test(a)), 'no models/ or vendor/ file is precached');
  let wait = null;
  sandbox.caches.keys = () => Promise.resolve(['guitarlab-v1', CACHE, 'soundlab-omr-v1', 'soundlab-omr-pdfjs-v1', 'another-app-v3']);
  listeners.activate({ waitUntil: (p) => { wait = p; } });
  await wait;
  ok(deleted.join() === 'guitarlab-v1', 'activate deletes only old guitarlab- caches (kept soundlab-omr-*, other apps): deleted ' + deleted.join());
  const fetched = (url) => { let used = false; listeners.fetch({ request: { method: 'GET', url: url }, respondWith: () => { used = true; } }); return used; };
  ok(!fetched('https://x.test/GuitarPak/models/omr/decoder.onnx.part00') && !fetched('https://x.test/GuitarPak/models/omr/manifest.json?x=1') &&
    !fetched('https://x.test/GuitarPak/vendor/omr/opencv.js'), 'fetch passes models/omr/* and vendor/* straight to the network');
  ok(fetched('https://x.test/GuitarPak/js/app.js') && fetched('https://x.test/GuitarPak/js/omr/engine.js'), 'fetch still serves app files cache-first');
}

// ------------------------------------------------------------------------------- the browser
const fs_png = () => fs.readFileSync(PNG);
async function browserChecks(ref, OMR) {
  const { chromium } = require('playwright');
  const base = new URL(env.URL);
  const origin = base.origin;
  const reqs = []; // {url, t}
  const external = [];
  const pkgs = {};
  const browser = await chromium.launch({ executablePath: env.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  await ctx.route((url) => url.origin !== origin, async (route) => {
    const u = route.request().url();
    const m = /^https:\/\/cdn\.jsdelivr\.net\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\/(.+)$/.exec(u);
    if (!m) { external.push(u); return route.abort(); }
    reqs.push({ url: u, t: Date.now() });
    const key = m[1] + '@' + m[2];
    if (!(key in pkgs)) pkgs[key] = pkgDir(m[1], m[2]);
    const file = pkgs[key] && path.join(pkgs[key], m[3]);
    if (!file || !fs.existsSync(file)) { info('no local copy of ' + u); return route.fulfill({ status: 404, body: 'not here' }); }
    const type = /\.wasm$/.test(file) ? 'application/wasm' : /\.m?js$/.test(file) ? 'text/javascript' : 'application/octet-stream';
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': type }, body: fs.readFileSync(file) });
  });
  await ctx.route((url) => url.origin === origin && /\/models\/omr\//.test(url.pathname), (route) => { reqs.push({ url: route.request().url(), t: Date.now() }); return route.continue(); });
  const pool = process.env.SL_SHEETLAB_POOL === 'auto' ? 'auto' : Number(process.env.SL_SHEETLAB_POOL || 1);
  await ctx.addInitScript((pool) => {
    ['help.seen', 'help.done', 'qz.landed'].forEach((k) => localStorage.setItem('guitarlab.' + k, 'true'));
    if (!localStorage.getItem('guitarlab.sheetlab.pool')) localStorage.setItem('guitarlab.sheetlab.pool', JSON.stringify(pool));
    window.__wait = (ms) => new Promise((r) => setTimeout(r, ms));
  }, pool);
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  // file choosers: listened for from the start (a waitForEvent armed just before the key press turns
  // Playwright's interception on too late now and then); each one is answered with no file
  const choosers = [];
  const onChooser = (c) => { choosers.push(c.isMultiple()); c.setFiles([]).catch(() => {}); };
  page.on('filechooser', onChooser);
  page.on('worker', (w) => w.on('close', () => {}));
  const engineReqs = () => reqs.filter((r) => /cdn\.jsdelivr\.net|\/models\/omr\//.test(r.url));
  const st = () => page.evaluate(() => { const s = App.sheetlab.state; if (s.result) { s.result.musicxml = s.result.musicxml.length; s.result.xmlRaw = s.result.xmlRaw.length; } return s; });
  async function until(fn, ms, what) {
    const t0 = Date.now();
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() - t0 > ms) throw new Error('timeout: ' + what);
      await page.waitForTimeout(150);
    }
  }

  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.sheetlab && App.songs && window.SLMidiHub && window.Woodshed);

  console.log('# nav + page (' + secs() + ')');
  const nav = await page.evaluate(async () => {
    App.switchTo('sheetlab'); await __wait(200);
    const q = (s) => document.querySelector(s);
    return {
      active: App.active, group: (q('#tabbar .tabbar-btn.active') || q('#tabbar-m .tabbar-btn.active') || {}).textContent,
      pills: [...document.querySelectorAll('#subnav .subtab')].map((b) => b.textContent + (b.classList.contains('active') ? '*' : '')).join('|'),
      h2: q('#panel-sheetlab .card h2').textContent, drop: !!q('#sl-drop'), choose: !!q('#sl-file'), cam: q('#sl-cam') && q('#sl-cam').getAttribute('capture'),
      camAccept: q('#sl-cam') && q('#sl-cam').getAttribute('accept'), photoHidden: q('#sl-photo').hidden, out: q('#sl-out').hidden,
      remote: App.remoteKeyPage ? null : null
    };
  });
  ok(nav.active === 'sheetlab' && /Play/.test(nav.group) && /Scan\*/.test(nav.pills) && /Songs\|Jam\|Scan\*/.test(nav.pills),
    'Play › Scan opens the page: ' + nav.group + ' / ' + nav.pills);
  ok(/sheet music to midi/i.test(nav.h2) && nav.drop && nav.choose && nav.cam === 'environment' && nav.camAccept === 'image/*' && nav.photoHidden && nav.out,
    'the card: drop zone, Choose a file, a camera input (shown on touch devices only), no result yet');

  console.log('# keyboard: Choose a file (' + secs() + ')');
  await page.evaluate(() => { window.scrollTo(0, 0); if (document.activeElement) document.activeElement.blur(); });
  const tabbed = [];
  for (let i = 0; i < 60 && tabbed.indexOf('sl-choose') < 0; i++) {
    await page.keyboard.press('Tab');
    tabbed.push(await page.evaluate(() => document.activeElement && document.activeElement.id));
  }
  ok(tabbed.indexOf('sl-choose') >= 0, 'Tab reaches Choose a file (a label styled as a button)');
  await page.focus('#sl-choose');
  await page.keyboard.press('Enter');
  await until(async () => choosers.length > 0, 3000, 'a file chooser').catch(() => {});
  page.off('filechooser', onChooser);
  const kbc = choosers.length === 1 ? { isMultiple: () => choosers[0] } : null;
  // Chromium shows one chooser per page here, so Space is checked one step earlier: it clicks the input
  await page.evaluate(() => { window.__fileClicks = 0; const c = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function () { if (this.id === 'sl-file') __fileClicks++; else return c.apply(this, arguments); }; });
  await page.focus('#sl-choose');
  await page.keyboard.press(' ');
  const spaceClicks = await page.evaluate(() => __fileClicks);
  ok(!!kbc && kbc.isMultiple() && spaceClicks === 1, 'Enter on Choose a file opens the file chooser, Space too (' + !!kbc + ', ' + spaceClicks + ')');

  console.log('# consent gate (' + secs() + ')');
  await until(async () => (await st()).engine === 'needed', 20000, 'engine check');
  const s0 = await st();
  const engineText = await page.textContent('#sl-engine');
  const est = ref.estimate;
  ok(/Reading sheet music downloads the recognition engine once \(about \d+ MB\), then works offline\./.test(engineText) &&
    engineText.indexOf('about ' + Math.round(est.total / 1e6) + ' MB') >= 0 && s0.size.estimate === true,
    'the consent line names the size from the manifest + runtime + pdf.js (' + Math.round(est.total / 1e6) + ' MB): ' + engineText.trim());
  ok(await page.isVisible('#sl-dl'), 'a Download button');
  ok(engineReqs().length === 0, 'nothing from models/ or jsDelivr before the tap (' + engineReqs().length + ')');

  console.log('# options persist (' + secs() + ')');
  const bpm0 = await page.evaluate(() => App.store.get('met.bpm', 120));
  const t0v = await page.inputValue('#sl-tempo');
  ok(Number(t0v) === Number(bpm0) && /shared tempo/i.test(await page.textContent('#sl-tnote')), 'tempo starts at the shared tempo (' + t0v + ')');
  await page.fill('#sl-tempo', '96'); await page.dispatchEvent('#sl-tempo', 'change');
  await page.selectOption('#sl-inst', 'Violin');
  await page.selectOption('#sl-tr', '2');
  await page.click('#sl-dpi [data-v="200"]');
  await page.uncheck('#sl-split'); await page.check('#sl-split'); // touched, still on
  await page.uncheck('#sl-enhance');
  await page.reload();
  await page.waitForFunction(() => window.App && App.sheetlab);
  await page.evaluate(() => App.switchTo('sheetlab'));
  const o1 = await page.evaluate(() => ({
    tempo: document.getElementById('sl-tempo').value, inst: document.getElementById('sl-inst').value, tr: document.getElementById('sl-tr').value,
    dpi: (document.querySelector('#sl-dpi .active') || {}).textContent, split: document.getElementById('sl-split').checked,
    enhance: document.getElementById('sl-enhance').checked, store: ['tempo', 'instrument', 'transpose', 'dpi', 'split', 'enhance'].map((k) => App.store.get('sheetlab.' + k, null)),
    bpm: App.store.get('met.bpm', 120), note: document.getElementById('sl-tnote').textContent
  }));
  ok(o1.tempo === '96' && o1.inst === 'Violin' && o1.tr === '2' && /200/.test(o1.dpi) && o1.split && !o1.enhance && /Use the shared tempo/.test(o1.note),
    'options survive a reload: ' + JSON.stringify(o1.store));
  ok(o1.bpm === bpm0, 'the shared tempo (met.bpm) is never written (' + o1.bpm + ')');
  await page.check('#sl-enhance');
  ok(await page.evaluate(() => App.store.get('sheetlab.enhance', null)) === true, 'Enhance low-res scans back on');
  await until(async () => (await st()).engine === 'needed', 20000, 'engine check after reload');

  console.log('# Songs’ Open a score hands sheet music to Scan (' + secs() + ')');
  await page.evaluate(() => App.switchTo('songs'));
  await page.setInputFiles('#sg-openfile', { name: 'mozart-menuetto.png', mimeType: 'image/png', buffer: fs.readFileSync(PNG) });
  await until(() => page.evaluate(() => App.active === 'sheetlab' && App.sheetlab.state.files.length === 1), 5000, 'routed to Scan');
  const routed = await page.evaluate(() => ({ files: App.sheetlab.state.files, sel: document.getElementById('sl-selname').textContent, songs: document.getElementById('sg-openmsg').textContent }));
  ok(routed.files[0].name === 'mozart-menuetto.png' && /mozart-menuetto\.png · picture/.test(routed.sel) && /opened in Scan/.test(routed.songs),
    'a PNG from Open a score lands on Scan, selected: ' + routed.sel);
  ok(engineReqs().length === 0, 'opening a file downloads nothing');

  console.log('# Convert before Download waits for the tap (' + secs() + ')');
  await page.click('#sl-go');
  await until(async () => (await st()).pending, 5000, 'pending');
  const pend = await page.evaluate(() => ({ cls: document.getElementById('sl-engine').className, go: document.getElementById('sl-go').textContent, msg: document.getElementById('sl-msg').textContent, phase: App.sheetlab.state.phase }));
  ok(/wait/.test(pend.cls) && /after the download/i.test(pend.go) && /Download/.test(pend.msg) && pend.phase === 'idle', 'Convert asks for the Download first: ' + pend.msg);
  ok(engineReqs().length === 0, 'still nothing downloaded');

  console.log('# Download, then the conversion runs on (' + secs() + ')');
  await page.evaluate(() => { // main-thread responsiveness probe
    window.__gaps = []; let last = performance.now();
    window.__probe = setInterval(() => { const n = performance.now(); __gaps.push(n - last); last = n; }, 50);
  });
  await page.evaluate(() => { // aria-live chatter: how often each live line changes, and how often to the same words
    window.__live = {};
    const watch = () => document.querySelectorAll('#panel-sheetlab [aria-live]').forEach((el) => {
      if (el.__lw) return; el.__lw = 1;
      const key = el.id || el.className;
      // what a screen reader is given: changes outside aria-hidden parts, the text without them
      const said = () => { const c = el.cloneNode(true); c.querySelectorAll('[aria-hidden="true"]').forEach((x) => x.remove()); return c.textContent.trim(); };
      new MutationObserver((recs) => {
        if (recs.every((r) => { const n = r.target.nodeType === 1 ? r.target : r.target.parentElement; return n && n !== el && n.closest('[aria-hidden="true"]'); })) return;
        const t = said(), o = __live[key] = __live[key] || { n: 0, same: 0, last: null };
        o.n++; if (t === o.last) o.same++; o.last = t;
      }).observe(el, { childList: true, subtree: true, characterData: true });
    });
    watch(); window.__lwT = setInterval(watch, 200);
  });
  const tDl = Date.now();
  await page.click('#sl-dl');
  const seen = new Set(), dlTexts = new Set();
  await until(async () => {
    const s = await st();
    if (s.engine === 'downloading') { const t = await page.textContent('#sl-engine'); if (/Downloading the recognition engine: \d+ MB of \d+ MB/.test(t)) dlTexts.add('bytes'); }
    if (s.progress) { seen.add(s.progress.stage); if (s.progress.pages) seen.add('page ' + s.progress.page + ' of ' + s.progress.pages); }
    return s.phase === 'done' || s.phase === 'error' ? s : null;
  }, 300000, 'conversion');
  const tDone = Date.now();
  const s1 = await st();
  const gaps = await page.evaluate(() => { clearInterval(__probe); return __gaps.slice(); });
  info('download + engine start + conversion: ' + ((tDone - tDl) / 1000).toFixed(1) + ' s; stages seen: ' + [...seen].join(', '));
  ok(s1.phase === 'done' && s1.engine === 'ready', 'Download fetched the engine and the pending conversion ran: ' + s1.phase + (s1.message ? ' (' + s1.message + ')' : ''));
  ok(dlTexts.has('bytes') || engineReqs().length > 0, 'the download showed its progress in MB');
  ok(seen.has('segment') && seen.has('read') && seen.has('page 1 of 1'), 'progress in plain stages + page n of N: ' + [...seen].join(', '));
  const er = engineReqs().map((r) => r.url);
  ok(er.some((u) => /models\/omr\/manifest\.json/.test(u)) && er.some((u) => /decoder\.onnx\.part03/.test(u)) &&
    er.some((u) => /opencv\.js$/.test(u)) && er.some((u) => /ort-wasm-simd-threaded\.wasm$/.test(u)) && er.some((u) => /pdf\.worker\.min\.mjs$/.test(u)),
    'the tap fetched the manifest, the model parts, opencv.js, onnxruntime-web and pdf.js (' + er.length + ' requests)');
  ok(/Engine ready \(offline\)/.test(await page.textContent('#sl-engine')), 'the engine line now says Engine ready (offline)');
  const maxGap = Math.max.apply(null, gaps);
  ok(maxGap < 1500, 'the page stayed responsive meanwhile (longest main-thread gap ' + Math.round(maxGap) + ' ms)');
  const live = await page.evaluate(() => { clearInterval(__lwT); return __live; });
  const le = live['sl-engine'] || { n: 0, same: 0 }, lp = live['sl-pageof'] || { n: 0, same: 0 };
  ok(le.n <= 12 && le.same <= 3, 'the engine line (aria-live) changes with the state, not with every downloaded chunk (' + le.n + ' changes, ' + le.same + ' identical)');
  ok(lp.n >= 1 && lp.same <= 2, 'the page-of line (aria-live) changes per page, not every second (' + lp.n + ' changes, ' + lp.same + ' identical)');

  const res = await page.evaluate(() => { const s = App.sheetlab.state; return { r: s.result, xml: s.result && s.result.musicxml }; });
  const exp = await page.evaluate(() => App.sheetlab.exports().then((x) => ({ title: x.title, midi: Array.from(x.midi), musicxml: x.musicxml, mxl: Array.from(x.mxl || []) })));
  const strip = (x) => String(x).replace(/<!-- imgpos[^>]*-->/g, '');
  ok(res.r.title === ref.title && res.r.title === 'Mozart Menuetto', 'title from the file name like the engine: ' + res.r.title);
  if (!ok(res.xml === ref.musicxml, 'the MusicXML equals the Node engine’s for the same picture + options (' + res.xml.length + ' chars)')) {
    info('without imgpos comments: ' + (strip(res.xml) === strip(ref.musicxml) ? 'equal' : 'still different'));
  }
  ok(Buffer.from(exp.midi).equals(Buffer.from(ref.midi, 'base64')), 'the MIDI equals the Node engine’s, byte for byte (' + exp.midi.length + ' bytes)');
  const sm = res.r.summary, rs = ref.summary;
  ok(sm.totalMeasures === rs.totalMeasures && sm.totalNotes === rs.totalNotes && sm.totalChords === rs.totalChords && Math.abs(sm.durationSeconds - rs.durationSeconds) < 1e-9 &&
    sm.tempoBpm === 96 && sm.program === 40 && sm.transposeSemitones === 2, 'counts and options as the reference: ' + rs.totalMeasures + ' measures, ' + rs.totalNotes + ' notes, 96 BPM, Violin, +2');
  const ui = await page.evaluate(() => {
    const cv = document.querySelector('#sl-pages canvas');
    let colored = 0, dark = 0;
    if (cv && cv.width) {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 60) colored++;
        else if (Math.max(d[i], d[i + 1], d[i + 2]) < 90) dark++;
      }
    }
    return { pages: [...document.querySelectorAll('#sl-pages figcaption')].map((f) => f.textContent), cw: cv && cv.width, ch: cv && cv.height, colored, dark,
      shown: cv ? Math.round(cv.getBoundingClientRect().width * (window.devicePixelRatio || 1)) : 0,
      counts: document.getElementById('sl-counts').textContent, title: document.getElementById('sl-title').value, h2: document.getElementById('sl-outh').textContent,
      lib: document.getElementById('sl-libmsg').textContent, acts: [...document.querySelectorAll('#sl-acts button')].filter((b) => !b.hidden).map((b) => b.textContent) };
  });
  ok(ui.pages.length === 1 && /Page 1 1 staff · 1 part/.test(ui.pages[0]) && ui.cw > 0 && ui.colored > 200 && ui.dark > 0.01 * ui.cw * ui.ch,
    'the page summary + a preview of the page with the staffs outlined: ' + ui.pages[0] + ' (' + ui.cw + 'x' + ui.ch + ', ' + ui.colored + ' outline / ' + ui.dark + ' ink pixels)');
  ok(ui.cw <= Math.max(320, ui.shown) + 1 && ui.cw <= 960, 'the preview canvas is as wide as it is shown (x devicePixelRatio, 320..960 px): ' + ui.cw + ' for ' + ui.shown);
  const rem = await page.evaluate(() => ({ next: App.remoteAction('next', { via: 'test' }), stop: App.remoteAction('stop', { via: 'test' }), key: App.remoteKeyPage(), active: App.active, phase: App.sheetlab.state.phase }));
  ok(rem.next === false && rem.stop === false && rem.key === false && rem.active === 'sheetlab' && rem.phase === 'done', 'hands-free control does nothing on this page (onRemote false, no reserved key)');
  ok(ui.title === 'Mozart Menuetto' && /measures · .*notes · .*chords · .*long/.test(ui.counts) && ui.h2 === 'Your score' &&
    ui.acts.join('|') === 'Play on synth|Practice|Open as tab', 'result: editable title, counts, the three actions: ' + ui.counts);
  await until(() => page.evaluate(() => /Saved|already/.test(document.getElementById('sl-libmsg').textContent)), 15000, 'auto-save to the library');
  const lib1 = await page.evaluate(() => App.library.list().then((l) => l.filter((i) => i.kind === 'scan').map((i) => i.title)));
  ok(lib1.indexOf('Mozart Menuetto') >= 0, 'Also save to my library (on by default) kept it: ' + (await page.textContent('#sl-libmsg')));

  console.log('# downloads + a new title (' + secs() + ')');
  async function grab(sel) {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(sel)]);
    return { name: d.suggestedFilename(), bytes: fs.readFileSync(await d.path()) };
  }
  const dMid = await grab('#sl-dl-mid');
  let smf = null;
  try { smf = parseSmf(dMid.bytes); } catch (e) { info('SMF: ' + e.message); }
  ok(dMid.name === 'Mozart Menuetto.mid' && smf && smf.ntrks >= 2 && smf.tracks.reduce((n, t) => n + t.notes, 0) === rs.totalNotes &&
    smf.tracks[0].name === 'Mozart Menuetto' && smf.tracks.some((t) => t.program === 40) && dMid.bytes.equals(Buffer.from(ref.midi, 'base64')),
    'Download .mid: ' + dMid.name + ' parses (' + (smf && smf.ntrks) + ' tracks, ' + (smf && smf.tracks.reduce((n, t) => n + t.notes, 0)) + ' notes, Violin) = the reference');
  const dXml = await grab('#sl-dl-xml');
  ok(dXml.name === 'Mozart Menuetto.musicxml' && dXml.bytes.toString('utf8') === ref.musicxml, 'Download .musicxml: the result’s MusicXML');
  const dMxl = await grab('#sl-dl-mxl');
  const mx = await OMR.mxl.read(new Uint8Array(dMxl.bytes));
  ok(dMxl.name === 'Mozart Menuetto.mxl' && mx.xml === ref.musicxml && mx.rootfile === 'mozart-menuetto.musicxml', 'Download .mxl: a zip with the MusicXML (' + mx.rootfile + ')');

  await page.fill('#sl-title', 'Menuetto K. 487 & co');
  await page.press('#sl-title', 'Enter');
  await until(() => page.evaluate(() => App.sheetlab.exports().then((x) => x.title)).then((t) => t === 'Menuetto K. 487 & co'), 20000, 're-titled exports');
  const dMid2 = await grab('#sl-dl-mid');
  const smf2 = parseSmf(dMid2.bytes);
  const raw2 = ref.xmlRaw.replace(/<work-title>[\s\S]*?<\/work-title>/, '<work-title>Menuetto K. 487 &amp; co</work-title>');
  const want2 = OMR.midi.convert(raw2, { tempo: 96, program: 40, transpose: 2, title: 'Menuetto K. 487 & co', instrumentName: 'Violin' }).midi;
  ok(dMid2.name === 'Menuetto K. 487 & co.mid' && smf2.tracks[0].name === 'Menuetto K. 487 & co' && dMid2.bytes.equals(Buffer.from(want2)),
    'a new title re-titles the .mid exactly like the engine would make it (' + dMid2.name + ')');
  const dXml2 = await grab('#sl-dl-xml');
  ok(/<work-title>Menuetto K\. 487 &amp; co<\/work-title>/.test(dXml2.bytes.toString('utf8')) &&
    dXml2.bytes.toString('utf8').replace(/<work-title>[^<]*<\/work-title>/, '') === ref.musicxml.replace(/<work-title>[^<]*<\/work-title>/, ''),
    'and the MusicXML work-title (nothing else changes)');

  console.log('# Open as tab / Practice / Play on synth / Save to my library (' + secs() + ')');
  const a1 = await page.evaluate(async () => { document.getElementById('sl-tab').click(); await __wait(500); const c = App.songs.current; return { active: App.active, name: c && c.name, from: c && c.from, steps: c && c.steps.length }; });
  ok(a1.active === 'songs' && a1.name === 'Menuetto K. 487 & co' && a1.from === 'Scan' && a1.steps > 0, 'Open as tab: the Songs page with it (' + a1.steps + ' steps)');
  const a2 = await page.evaluate(async () => {
    App.switchTo('sheetlab'); await __wait(150); document.getElementById('sl-practice').click(); await __wait(600);
    const toast = document.getElementById('app-toast').textContent;
    App.switchTo('sheetlab'); await __wait(150); document.getElementById('sl-practice').click(); await __wait(600);
    // (the Woodshed names an imported score without what follows its last dot: "Menuetto K")
    const rows = [...document.querySelectorAll('#ws-lib [data-wsid]')].filter((r) => /Menuetto K/.test(r.textContent));
    const b = rows[0] && rows[0].getBoundingClientRect();
    return { active: App.active, toast, n: (App.store.get('ws.lib') || []).filter((sc) => /^Menuetto K/.test(sc.title)).length, inView: !!b && b.top >= 0 && b.bottom <= innerHeight };
  });
  ok(a2.active === 'shed', 'Practice: in the Woodshed');
  ok(a2.n === 1 && a2.inView && /In the Woodshed: Menuetto K\. 487 & co/.test(a2.toast), 'Practice says so, and a second tap shows the same score (scrolled into view) instead of a second copy: ' + JSON.stringify(a2));
  const a3 = await page.evaluate(async () => { App.switchTo('sheetlab'); await __wait(150); document.getElementById('sl-play').click(); await __wait(800); const s = SLMidiHub.player.state; return { active: App.active, view: App.store.get('midihub.view'), dur: s && s.duration, notes: s && s.notes }; });
  ok(a3.active === 'midihub' && a3.view === 'player' && a3.dur > 0, 'Play on synth: the Hub Player has it (' + (a3.dur || 0).toFixed(1) + ' s)');
  const a4 = await page.evaluate(async () => { App.switchTo('sheetlab'); await __wait(150); document.getElementById('sl-libmsg').textContent = ''; document.getElementById('sl-save').click(); for (let i = 0; i < 60 && !/Saved|already|device/.test(document.getElementById('sl-libmsg').textContent); i++) await __wait(100); return document.getElementById('sl-libmsg').textContent; });
  const lib2 = await page.evaluate(() => App.library.list().then((l) => l.filter((i) => i.kind === 'scan').map((i) => i.title)));
  ok(/Saved|already/.test(a4) && lib2.indexOf('Menuetto K. 487 & co') >= 0, 'Save to my library with the new title: ' + a4);
  ok(lib2.indexOf('Mozart Menuetto') < 0 && lib2.filter((t) => t === 'Menuetto K. 487 & co').length === 1 && /already/.test(a4),
    'the edited title renamed the auto-saved entry (one entry, no "Mozart Menuetto" left behind); Save then finds it there: ' + lib2.join(' | '));

  console.log('# after a conversion, Take a photo starts the next piece (' + secs() + ')');
  await page.evaluate(() => App.switchTo('sheetlab'));
  const ph0 = await page.evaluate(() => document.getElementById('sl-photolbl').textContent);
  await page.setInputFiles('#sl-cam', { name: 'IMG_0100.png', mimeType: 'image/png', buffer: fs_png() });
  const ph1 = await page.evaluate(() => ({ files: App.sheetlab.state.files.map((f) => f.name), lbl: document.getElementById('sl-photolbl').textContent }));
  ok(ph0 === 'Take a photo' && ph1.files.join() === 'IMG_0100.png' && ph1.lbl === 'Add a page (photo)',
    'the photo replaces the converted picture (it used to become page 2 of the old scan): ' + ph0 + ' -> ' + ph1.files.join());

  console.log('# Stop mid-run (' + secs() + ')');
  const before = engineReqs().length;
  await page.evaluate(() => { window.__run = App.sheetlab.convert(); });
  await until(async () => { const s = await st(); return s.progress && /segment|staffs|read/.test(s.progress.stage); }, 60000, 'a running stage');
  const stopT = Date.now();
  await page.click('#sl-stop');
  const s2 = await page.evaluate(() => window.__run.then(() => App.sheetlab.state));
  ok(s2.phase === 'stopped' && !s2.workerAlive && /Stopped/.test(s2.message) && Date.now() - stopT < 5000, 'Stop ends the run at once and lets the worker go: ' + s2.message);
  const usable = await page.evaluate(() => ({ go: !document.getElementById('sl-go').disabled, out: document.getElementById('sl-out').hidden, opts: !document.getElementById('sl-optset').disabled,
    focus: document.activeElement && document.activeElement.id }));
  ok(usable.go && usable.opts, 'the page is usable again (Convert and the options are enabled)');
  ok(usable.focus === 'sl-go', 'the keyboard focus moves from the hidden Stop to Convert (' + usable.focus + ')');

  console.log('# Stop while a step cannot be cancelled (a file still being read) (' + secs() + ')');
  const stuck = await page.evaluate(async () => {
    // a PDF whose bytes never arrive (a huge file from a cloud drive, a stalled read): pdf.js and the
    // worker cannot cancel that, Stop must end the run anyway
    const f = { name: 'never.pdf', type: 'application/pdf', size: 1e6, arrayBuffer: () => new Promise(() => {}) };
    await App.sheetlab.open(f);
    const run = App.sheetlab.convert();
    for (let i = 0; i < 200 && !(App.sheetlab.state.progress && App.sheetlab.state.progress.stage === 'pdf'); i++) await __wait(25);
    const stage = App.sheetlab.state.progress && App.sheetlab.state.progress.stage;
    await __wait(300);
    const t0 = performance.now();
    document.getElementById('sl-stop').click();
    const end = await Promise.race([run.then(() => 'settled'), __wait(4000).then(() => 'hung')]);
    return { stage, end, ms: Math.round(performance.now() - t0), phase: App.sheetlab.state.phase, go: !document.getElementById('sl-go').disabled };
  });
  ok(stuck.stage === 'pdf' && stuck.end === 'settled' && stuck.phase === 'stopped' && stuck.go && stuck.ms < 2000,
    'Stop ends it at once and frees the page (' + stuck.end + ' after ' + stuck.ms + ' ms, ' + stuck.phase + ')');
  await until(async () => (await st()).engine === 'ready', 20000, 'engine status after Stop');
  ok(engineReqs().slice(before).every((r) => !/\.part\d\d$|opencv|ort-wasm/.test(r.url)), 'nothing was downloaded again (the engine is cached)');

  console.log('# files that cannot be read; a double tap on Convert (' + secs() + ')');
  await page.setInputFiles('#sl-file', { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not a picture at all, just text pretending') });
  await page.evaluate(() => { // count the runs started; this worker has not prepared the engine (Stop let the last one go)
    window.__runs = 0; const acq = App.wake.acquire;
    App.wake.acquire = function (tag) { if (tag === 'sl-scan') __runs++; return acq.apply(this, arguments); };
  });
  const prepared0 = await page.evaluate(() => App.sheetlab.state.prepared);
  await page.dblclick('#sl-go');
  const bad = await until(async () => { const s = await st(); return s.phase === 'error' ? s : null; }, 20000, 'damaged file');
  const toast = await page.evaluate(() => { const t = document.getElementById('app-toast'); return t && !t.hidden ? t.textContent : ''; });
  ok(/“broken\.png” could not be read as a picture/.test(bad.message) && /could not be read/.test(toast) && !bad.result && await page.isEnabled('#sl-go'),
    'a damaged picture: an inline message + a toast, no throw, the page stays usable: ' + bad.message);
  await page.waitForTimeout(500);
  const runs = await page.evaluate(() => __runs);
  ok(prepared0 === false && runs === 1, 'a double tap on Convert (the engine check still a worker round trip) starts ONE run (' + runs + ')');
  const txt = await page.evaluate(() => App.sheetlab.open(new File(['hello'], 'notes.txt', { type: 'text/plain' })).then(() => App.sheetlab.state));
  ok(/notes\.txt” is not a PDF or a picture/.test(txt.message) && txt.files.length === 1 && txt.files[0].name === 'broken.png', 'a file that is not sheet music is refused and the selection kept: ' + txt.message);

  console.log('# a PDF (cover + music, metadata title) at 200 dpi through the worker pool (' + secs() + ')');
  // a library key on this device: GitHub (the default repository is public) answers 503 here
  await ctx.route('https://api.github.com/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"message":"test"}' }));
  await page.evaluate(() => { App.library.setKey('github_pat_TEST_sheetlab_0123456789abcdef'); App.store.set('library.publicAck', false); App.store.set('sheetlab.pool', 2); App.switchTo('songs'); });
  await page.setInputFiles('#sg-openfile', { name: 'menuetto.pdf', mimeType: 'application/pdf', buffer: fs.readFileSync(PDF) });
  await until(() => page.evaluate(() => App.active === 'sheetlab' && App.sheetlab.state.files[0] && App.sheetlab.state.files[0].name === 'menuetto.pdf'), 5000, 'PDF routed');
  const before2 = engineReqs().length;
  const seen2 = new Set();
  await page.evaluate(() => { // the preview canvases get no 2D context (iOS Safari once its canvas memory is used up)
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function () { return this.classList.contains('sl-prev') && window.__noCtx ? null : gc.apply(this, arguments); };
    window.__noCtx = true;
  });
  await page.click('#sl-go');
  await until(async () => (await st()).phase === 'running', 20000, 'the PDF run starts');
  await until(async () => {
    const s = await st();
    if (s.progress) seen2.add(s.progress.text.replace(/\d+/g, 'n') + ' | ' + (s.progress.pages ? 'page ' + s.progress.page + ' of ' + s.progress.pages : ''));
    return s.phase === 'done' || s.phase === 'error' ? s : null;
  }, 300000, 'PDF conversion');
  const s3 = await st();
  ok(s3.phase === 'done' && s3.result.title === 'Menuetto from 12 Duets' && s3.result.pagesInFile === 2, 'the PDF converts with the title from its metadata: ' + s3.result.title);
  const pub = await page.evaluate(async () => ({ label: document.getElementById('sl-autosave-txt').textContent, msg: document.getElementById('sl-libmsg').textContent,
    lib: (await App.library.list()).filter((i) => i.title === 'Menuetto from 12 Duets').length }));
  ok(/GitHub/.test(pub.label) && /public/.test(pub.label), 'with a key the checkbox says where a save goes: ' + pub.label);
  ok(pub.lib === 0 && /Not saved yet/.test(pub.msg) && /anyone can download/.test(pub.msg), 'the first scan upload is not automatic: it says where it would go and waits for the tap: ' + pub.msg);
  await page.click('#sl-save');
  await until(() => page.evaluate(() => /on this device|Saved|GitHub/.test(document.getElementById('sl-libmsg').textContent) && !/Not saved yet|Saving/.test(document.getElementById('sl-libmsg').textContent)), 15000, 'the tapped save');
  const pub2 = await page.evaluate(async () => ({ ack: App.store.get('library.publicAck', false), lib: (await App.library.list()).filter((i) => i.title === 'Menuetto from 12 Duets').length, msg: document.getElementById('sl-libmsg').textContent }));
  ok(pub2.ack === true && pub2.lib === 1, 'the tap saves it (asked once): ' + pub2.msg);
  await page.evaluate(() => App.library.setKey(''));
  await ctx.unroute('https://api.github.com/**');
  ok(s3.result.pages.length === 2 && s3.result.pages[0].skipped && /cover/i.test(s3.result.pages[0].skipped) && !s3.result.pages[1].skipped && s3.result.pages[1].staffCount >= 1,
    'page 1 (the cover) is skipped with its reason, page 2 is read: ' + s3.result.summary.pageSummaries.join(' / '));
  const pcap = await page.evaluate(() => [...document.querySelectorAll('#sl-pages figcaption')].map((f) => f.textContent));
  ok(/Skipped: No music here \(a cover or text page\)/.test(pcap[0]) && /staff/.test(pcap[1]), 'skipped pages say why in plain words: ' + pcap[0]);
  ok(errs.length === 0, 'no canvas context for the previews: no page error, the captions still say what was found');
  await page.evaluate(() => { window.__noCtx = false; });
  const tr = s3.trail, r2 = tr.indexOf('render 2'), last1 = Math.max.apply(null, tr.map((x, i) => (/^(segment|staffs|read) 1$/.test(x) ? i : -1)));
  ok(tr.indexOf('render 1') >= 0 && r2 > last1 && last1 > 0 && [...seen2].some((x) => /page 2 of 2/.test(x)),
    'PDF pages render one at a time, the next only after the worker finished the last: ' + tr.join(', '));
  const after2 = engineReqs().slice(before2).map((r) => r.url);
  ok(!after2.some((u) => /\.part\d\d$|opencv|ort-wasm|pdf\.min\.mjs|pdf\.worker/.test(u)), 'engine and pdf.js came from Cache Storage (no new downloads: ' + after2.length + ' requests, manifest only)');
  info('PDF run ' + (s3.result.ms / 1000).toFixed(1) + ' s with pool 2; notes ' + s3.result.summary.totalNotes + ' (PNG run: ' + rs.totalNotes + ')');

  console.log('# phone width (' + secs() + ')');
  await page.setViewportSize({ width: 360, height: 780 });
  await page.evaluate(() => { App.switchTo('sheetlab'); window.scrollTo(0, 0); });
  await page.waitForTimeout(300);
  const lay = await page.evaluate(() => {
    const vis = (el) => el && el.offsetParent !== null;
    const ids = ['sl-choose', 'sl-go', 'sl-play', 'sl-practice', 'sl-tab', 'sl-title', 'sl-tempo', 'sl-inst'];
    const sizes = ids.map((id) => { const el = document.getElementById(id); return vis(el) ? [id, Math.round(el.getBoundingClientRect().height), Math.round(el.getBoundingClientRect().right)] : null; }).filter(Boolean);
    const wide = [...document.querySelectorAll('#panel-sheetlab *')].filter((el) => vis(el) && el.getBoundingClientRect().right > window.innerWidth + 0.5).map((el) => el.id || el.className || el.tagName).slice(0, 5);
    return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, sizes, wide };
  });
  ok(lay.sw <= lay.iw && !lay.wide.length, 'no sideways scroll at 360 px (' + lay.sw + ' / ' + lay.iw + ')' + (lay.wide.length ? ': ' + lay.wide.join(', ') : ''));
  ok(lay.sizes.length >= 6 && lay.sizes.every((s) => s[1] >= 40), 'tap targets at least 40 px tall: ' + lay.sizes.map((s) => s[0] + ' ' + s[1]).join(', '));

  console.log('# the Android app: its WebView cannot pick files (' + secs() + ')');
  for (const canPick of [false, true]) {
    const actx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await actx.route((url) => url.origin !== origin, (route) => route.abort());
    await actx.addInitScript((canPick) => {
      ['help.seen', 'help.done', 'qz.landed'].forEach((k) => localStorage.setItem('guitarlab.' + k, 'true'));
      window.GuitarLabHost = { setKeepScreenOn() {}, shellVersion() { return '0.75.0'; } };
      if (canPick) window.GuitarLabHost.canPickFiles = () => true;
    }, canPick);
    const ap = await actx.newPage();
    ap.on('pageerror', (e) => errs.push('android: ' + e.message));
    await ap.goto(env.URL);
    await ap.waitForFunction(() => window.App && App.sheetlab);
    await ap.evaluate(() => App.switchTo('sheetlab'));
    const an = await ap.evaluate(async () => {
      const n = document.getElementById('sl-hostnote');
      document.getElementById('sl-choose').click();
      await new Promise((r) => setTimeout(r, 150));
      const t = document.getElementById('app-toast');
      return { shown: !n.hidden, text: n.textContent, toast: t && !t.hidden ? t.textContent : '' };
    });
    if (!canPick) ok(an.shown && /Android app cannot open files yet/.test(an.text) && /in Chrome/.test(an.text) && /cannot open files/.test(an.toast),
      'in the Android app (no file chooser) Scan says so and where it works: ' + an.text);
    const aeng = await ap.evaluate(async () => { await new Promise((r) => setTimeout(r, 300)); const s = App.sheetlab.state; return { engine: s.engine, worker: s.workerAlive, dl: !!document.getElementById('sl-dl'), text: document.getElementById('sl-engine').textContent }; });
    if (!canPick) ok(aeng.engine === 'unavailable' && !aeng.dl && !aeng.worker && /cannot open files/.test(aeng.text),
      'and offers no engine download there (107 MB nothing could use), no worker starts: ' + JSON.stringify(aeng));
    else ok(!an.shown && !/cannot open files/.test(an.toast), 'an app that can pick files (canPickFiles) gets no note');
    await actx.close();
  }

  console.log('# the claude.ai artifact: no models there, Scan says so (' + secs() + ')');
  {
    const xctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' });
    await xctx.route((url) => url.origin !== origin, (route) => route.abort());
    await xctx.addInitScript(() => { ['help.seen', 'help.done', 'qz.landed'].forEach((k) => localStorage.setItem('guitarlab.' + k, 'true')); window.SL_ARTIFACT = true; });
    const xp = await xctx.newPage();
    xp.on('pageerror', (e) => errs.push('artifact: ' + e.message));
    await xp.goto(env.URL);
    await xp.waitForFunction(() => window.App && App.sheetlab);
    await xp.evaluate(() => App.switchTo('sheetlab'));
    const xa = await xp.evaluate(async () => { await new Promise((r) => setTimeout(r, 300)); const s = App.sheetlab.state;
      return { engine: s.engine, worker: s.workerAlive, dl: !!document.getElementById('sl-dl'), text: document.getElementById('sl-engine').textContent, pick: document.getElementById('sl-choose').getAttribute('aria-disabled') }; });
    ok(xa.engine === 'unavailable' && !xa.dl && !xa.worker && /full site/.test(xa.text) && xa.pick === 'true',
      'in the artifact (no models/omr) Scan points to the full site and offers neither Download nor a picker: ' + xa.text);
    await xctx.close();
  }

  console.log('# a worker that cannot start (offline before the files were cached): Try again (' + secs() + ')');
  {
    const rctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' });
    await rctx.route((url) => url.origin !== origin, (route) => route.abort());
    await rctx.addInitScript(() => {
      ['help.seen', 'help.done', 'qz.landed'].forEach((k) => localStorage.setItem('guitarlab.' + k, 'true'));
      const Real = window.Worker; window.__failWorker = true;
      window.Worker = function (url, o) {
        if (!window.__failWorker) return new Real(url, o);
        const self = this; this.postMessage = function () {}; this.terminate = function () {};
        setTimeout(() => { if (self.onerror) self.onerror({ message: "Uncaught NetworkError: Failed to execute 'importScripts' on 'WorkerGlobalScope'", preventDefault() {} }); }, 30);
      };
    });
    const rp = await rctx.newPage();
    rp.on('pageerror', (e) => errs.push('retry: ' + e.message));
    await rp.goto(env.URL);
    await rp.waitForFunction(() => window.App && App.sheetlab);
    await rp.evaluate(() => App.switchTo('sheetlab'));
    await rp.waitForFunction(() => App.sheetlab.state.engine === 'unknown' && !!document.getElementById('sl-retry'), null, { timeout: 8000 }).catch(() => {});
    await rp.setInputFiles('#sl-file', { name: 'mozart-menuetto.png', mimeType: 'image/png', buffer: fs_png() });
    await rp.click('#sl-go');
    await rp.waitForTimeout(400);
    const r1 = await rp.evaluate(() => ({ engine: App.sheetlab.state.engine, text: document.getElementById('sl-engine').textContent, msg: App.sheetlab.state.message,
      retry: !!document.getElementById('sl-retry'), go: !document.getElementById('sl-go').disabled }));
    ok(r1.engine === 'unknown' && r1.retry && /Could not start the recognition engine/.test(r1.text) && !/importScripts/.test(r1.text) && r1.go,
      'a worker that fails to start is not "cannot run here" for good: a plain note and Try again (the raw error stays in the console): ' + r1.text);
    ok(/Could not start/.test(r1.msg) && !/Download/.test(r1.msg), 'Convert says the same, not "tap Download above" (there is no Download): ' + r1.msg);
    await rp.evaluate(() => { window.__failWorker = false; document.getElementById('sl-retry').click(); });
    await rp.waitForFunction(() => App.sheetlab.state.engine === 'needed', null, { timeout: 20000 }).catch(() => {});
    const r2 = await rp.evaluate(() => ({ engine: App.sheetlab.state.engine, dl: !!document.getElementById('sl-dl') }));
    ok(r2.engine === 'needed' && r2.dl, 'Try again works once the worker can start (the engine is offered for download): ' + JSON.stringify(r2));
    await rctx.close();
  }

  console.log('# a touch phone: Take a photo, each photo one more page (' + secs() + ')');
  const mctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await mctx.route((url) => url.origin !== origin, (route) => { external.push(route.request().url()); return route.abort(); });
  await mctx.addInitScript(() => { ['help.seen', 'help.done', 'qz.landed'].forEach((k) => localStorage.setItem('guitarlab.' + k, 'true')); });
  const mp = await mctx.newPage();
  mp.on('pageerror', (e) => errs.push('phone: ' + e.message));
  await mp.goto(env.URL);
  await mp.waitForFunction(() => window.App && App.sheetlab);
  await mp.evaluate(() => App.switchTo('sheetlab'));
  const m1 = await mp.evaluate(() => ({ photo: !document.getElementById('sl-photo').hidden, lbl: document.getElementById('sl-photolbl').textContent, t: document.querySelector('.sl-drop-t').textContent }));
  const png = fs.readFileSync(PNG);
  await mp.setInputFiles('#sl-cam', { name: 'IMG_0007.png', mimeType: 'image/png', buffer: png });
  const m2 = await mp.evaluate(() => document.getElementById('sl-photolbl').textContent);
  await mp.setInputFiles('#sl-cam', { name: 'IMG_0008.png', mimeType: 'image/png', buffer: png });
  const m3 = await mp.evaluate(() => ({ files: App.sheetlab.state.files.map((f) => f.name), sel: document.getElementById('sl-selname').textContent,
    sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  ok(m1.photo && m1.lbl === 'Take a photo' && /take a photo/i.test(m1.t), 'on a touch screen Take a photo shows (the camera input)');
  ok(m2 === 'Add a page (photo)' && m3.files.join() === 'IMG_0007.png,IMG_0008.png' && /2 pictures = 2 pages/.test(m3.sel), 'each photo adds a page in the order taken: ' + m3.sel);
  ok(m3.sw <= m3.iw, 'no sideways scroll on the phone (' + m3.sw + ' / ' + m3.iw + ')');
  const dpiH = await mp.evaluate(() => { const b = document.querySelector('#sl-dpi button'); return b ? Math.round(b.getBoundingClientRect().height) : 0; });
  ok(dpiH >= 44, 'PDF quality buttons are as tall as the other Scan controls on a touch screen (' + dpiH + ' px)');
  await mp.setInputFiles('#sl-file', { name: 'IMG_4023.HEIC', mimeType: 'image/heic', buffer: Buffer.from('ftypheic not decodable here') });
  await mp.click('#sl-go');
  await mp.waitForFunction(() => /cannot open \.heic/.test(App.sheetlab.state.message), null, { timeout: 10000 }).catch(() => {});
  const heic = await mp.evaluate(() => ({ msg: App.sheetlab.state.message, pending: App.sheetlab.state.pending, engine: App.sheetlab.state.engine }));
  ok(/This browser cannot open \.heic pictures/.test(heic.msg) && !heic.pending && heic.engine !== 'downloading',
    'a .heic this browser cannot open is refused at Convert, before the engine download is asked for: ' + heic.msg);
  await mctx.close();

  console.log('# an engine update on the server: asked for, never fetched by a run (' + secs() + ')');
  {
    const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'models', 'omr', 'manifest.json'), 'utf8'));
    man.models.segnet.sha256 = 'f'.repeat(64);
    (man.models.segnet.parts || []).forEach((p) => { p.sha256 = 'e'.repeat(64); });
    await ctx.route((url) => url.origin === origin && /\/models\/omr\/manifest\.json$/.test(url.pathname),
      (route) => { reqs.push({ url: route.request().url(), t: Date.now() }); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(man) }); });
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.reload();
    await page.waitForFunction(() => window.App && App.sheetlab);
    await page.evaluate(() => App.switchTo('sheetlab'));
    await until(async () => /needed|ready/.test((await st()).engine), 20000, 'engine check after an update');
    const upd = await page.evaluate(() => ({ engine: App.sheetlab.state.engine, text: document.getElementById('sl-engine').textContent }));
    ok(upd.engine === 'needed' && /An update of the recognition engine/.test(upd.text) && /about 14 MB/.test(upd.text), 'the engine line asks for the update (Download): ' + upd.text.trim());
    const before3 = engineReqs().length;
    await page.setInputFiles('#sl-file', { name: 'mozart-menuetto.png', mimeType: 'image/png', buffer: fs.readFileSync(PNG) });
    await page.click('#sl-go');
    await until(async () => (await st()).pending, 10000, 'pending after an update');
    await page.waitForTimeout(1000);
    const s4 = await st();
    const parts = engineReqs().slice(before3).filter((r) => /\.part\d\d$/.test(r.url));
    ok(s4.phase !== 'running' && s4.pending && parts.length === 0, 'Convert waits for that Download and fetches no model part (' + parts.length + ')');
  }

  const strays = external.filter((u) => !/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/main\/version\.json/.test(u)); // the app's own update check (refused here)
  ok(strays.length === 0, 'nothing else left the machine (only the routed CDN; the app update check was refused)' + (strays.length ? ': ' + strays.slice(0, 3).join(', ') : ''));
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
  await browser.close();
}

// ------------------------------------------------------------------------------- main
(async () => {
  if (process.argv.indexOf('--make-fixture') >= 0) { await makeFixture(); return; }
  const OMR = loadOmr(['manifest.js', 'midi.js', 'mxl.js', 'runtime.js']);
  console.log('# static checks');
  // the page's copies of engine facts
  const src = fs.readFileSync(path.join(ROOT, 'js', 'sheetlab.js'), 'utf8');
  const sandbox = { App: { register() {}, store: { get: (k, d) => d }, on() {} }, window: {}, navigator: {}, location: { href: 'http://x/' }, document: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const SL = sandbox.App.sheetlab;
  ok(JSON.stringify(SL.GM) === JSON.stringify(OMR.midi.GM_INSTRUMENTS), 'the instrument menu is SheetLab’s GM list (OMR.midi.GM_INSTRUMENTS, ' + Object.keys(SL.GM).length + ')');
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'models', 'omr', 'manifest.json'), 'utf8'));
  const RF = OMR.runtime.RUNTIME_FILES, B = OMR.runtime.BUNDLES.wasm;
  ok(SL.ESTIMATE.models === man.bytes && SL.ESTIMATE.models === Object.keys(man.models).reduce((s, k) => s + man.models[k].bytes, 0), 'ESTIMATE.models = models/omr/manifest.json (' + man.bytes + ')');
  ok(SL.ESTIMATE.runtime === ['opencv.js', B.script, B.mjs, B.wasm].reduce((s, n) => s + RF[n].bytes, 0), 'ESTIMATE.runtime = opencv.js + the wasm bundle in OMR.runtime.RUNTIME_FILES');
  const pdfDir = pkgDir('pdfjs-dist', SL.PDFJS.version);
  if (pdfDir) {
    const crypto = require('crypto');
    const good = Object.keys(SL.PDFJS.files).every((n) => {
      const b = fs.readFileSync(path.join(pdfDir, 'legacy', 'build', n));
      return b.length === SL.PDFJS.files[n].bytes && crypto.createHash('sha256').update(b).digest('hex') === SL.PDFJS.files[n].sha256;
    });
    ok(good && SL.ESTIMATE.pdf === Object.keys(SL.PDFJS.files).reduce((s, n) => s + SL.PDFJS.files[n].bytes, 0), 'pdf.js ' + SL.PDFJS.version + ': pinned bytes + sha256 = the npm package');
  } else info('SKIP pdf.js pin check (no pdfjs-dist@' + SL.PDFJS.version + ' on NODE_PATH / SL_PKG_DIRS)');
  await swChecks(OMR.FILES);

  const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));
  ref.estimate = { total: SL.ESTIMATE.models + SL.ESTIMATE.runtime + SL.ESTIMATE.pdf };
  const need = ['@techstark/opencv-js', 'onnxruntime-web', 'pdfjs-dist'].filter((n) => !pkgDir(n));
  let pw = null;
  try { pw = require('playwright'); } catch (e) { pw = null; }
  if (!pw || need.length || !fs.existsSync(path.join(ROOT, 'models', 'omr', 'manifest.json')) || !fs.existsSync(path.join(ROOT, 'models', 'omr', 'decoder.onnx.part03'))) {
    console.log('SKIP browser checks: ' + (!pw ? 'no playwright' : need.length ? 'no local ' + need.join(', ') + ' (NODE_PATH / SL_PKG_DIRS)' : 'no models in models/omr'));
  } else {
    await browserChecks(ref, OMR);
  }
  console.log('time ' + secs());
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('FAIL (crash)', e); process.exit(1); });
