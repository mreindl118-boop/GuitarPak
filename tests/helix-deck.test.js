// Helix deck (js/helix-deck.js = window.SLHelixDeck, the Perform face over
// App.helix; docs/HELIX-DECK-SPEC.md) against the same fakes as
// tests/helix.test.js: a "Helix Stadium MIDI" Web MIDI port pair (__sent /
// __sentTo / __sentAt / __failNext / __recv) and an in-page bridge (FakeWS
// answering the device's RPCs, __net rows stamped with their send time).
// Added here: a rAF shim (headless pages can report hidden, so the strips'
// one-send-per-frame is driven by setTimeout), a fake clock for the 90 s arm
// window (__clock), window.confirm / prompt counters (the page must never
// call them), __pt (synthetic pointer events placed on an element's rect) and
// four contexts: desktop 1200x900, the MODX-1 / LUMI / loopMIDI isolation
// context (no Helix port: the bridge recall path), phone 375x812 and tablet
// 768x1024 (both hasTouch). Bytes are asserted as decimal strings joined by
// spaces ('176 38 32' = B0 26 20).
const { chromium } = require('playwright');
const path = require('path');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
function note(msg) { console.log('  NOTE', msg); }
const J = JSON.stringify;
const WRITES = ['/ParamValueSet', '/BlockEnableSet', '/activateSnapshot', '/SetSnapshotName', '/LoadPresetWithCID', '/SavePresetWithCID', '/ModelSet'];
const CHIPS = 'tuner,toe,tap,apptempo,click,muteall,looprec,loopover,loopplay,loopstop,looponce,loopundo';
const ROWS = 'knobs14,knobs58,pedals,stomps,block,mix';
const K0 = '.hxd-four .hxd-strip[data-key="knob:0"]';

async function newPage(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1200, height: 900 }, hasTouch: !!opts.hasTouch });
  await ctx.addInitScript(([outs, ins, bridgeAuto, favs]) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.lights.on', 'false');
    if (bridgeAuto) localStorage.setItem('guitarlab.hx.bridgeAuto', 'true');
    if (favs) localStorage.setItem('guitarlab.hx.favs', JSON.stringify(favs));
    // ---- rAF shim: headless pages may report hidden, so frames never fire
    window.requestAnimationFrame = fn => setTimeout(() => fn(performance.now()), 16);
    window.cancelAnimationFrame = id => clearTimeout(id);
    // ---- fake clock for the arm window: Date.now() + __clock
    window.__clock = 0; const now0 = Date.now; Date.now = () => now0() + window.__clock;
    // ---- the page must never open a browser dialog
    window.__dialogs = 0;
    window.confirm = () => { window.__dialogs++; return false; };
    window.prompt = () => { window.__dialogs++; return null; };
    window.alert = () => { window.__dialogs++; };
    // ---- fake Web MIDI: every byte sent is recorded with its port and time
    window.__sent = []; window.__sentTo = []; window.__sentAt = []; window.__failNext = false;
    const mkOut = (name, i) => ({ id: 'out' + i, name, state: 'connected', send: b => { if (window.__failNext) { window.__failNext = false; throw new Error('port gone'); } window.__sent.push(Array.from(b)); window.__sentTo.push(name); window.__sentAt.push(performance.now()); } });
    const mkIn = (name, i) => ({ id: 'in' + i, name, state: 'connected', _fns: [], onmidimessage: null, addEventListener(t, fn) { this._fns.push(fn); }, removeEventListener(t, fn) { this._fns = this._fns.filter(f => f !== fn); } });
    const outputs = outs.map(mkOut), inputs = ins.map(mkIn);
    const access = { inputs: new Map(inputs.map(p => [p.id, p])), outputs: new Map(outputs.map(p => [p.id, p])), sysexEnabled: true, addEventListener() {}, onstatechange: null };
    navigator.requestMIDIAccess = () => Promise.resolve(access);
    window.__recv = (bytes) => inputs.forEach(p => { const ev = { data: new Uint8Array(bytes) }; p._fns.forEach(fn => fn(ev)); if (p.onmidimessage) p.onmidimessage(ev); });
    window.__since = (n) => window.__sent.slice(n);
    // ---- synthetic pointer events: fx / fy = fractions of the element's rect, o.dy = extra px down
    window.__pt = function (el, type, fx, fy, o) {
      o = o || {};
      const r = el.getBoundingClientRect(), cx = r.left + r.width * fx, cy = r.top + r.height * fy + (o.dy || 0);
      const ev = new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: o.id || 1, pointerType: o.pointerType || 'mouse', isPrimary: true,
        clientX: cx, clientY: cy, screenX: cx, screenY: cy, button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1, shiftKey: !!o.shift });
      el.dispatchEvent(ev);
      return ev;
    };
    // ---- fake bridge: the WebSocket the page opens answers like the device
    const EB = { cg__: { asnp: 2, entt: { snps: [{ si__: 7, vald: false }, { si__: 2, name: 'Lead', vald: true }, { si__: 0, name: 'SNAPSHOT 1', vald: true }] } }, pm__: [],
      sfg_: { flow: [{ bcnt: 28, blks: [0, { enbl: 1, type: 8, mdls: [{ id__: 770, parm: [] }] }, 1, { enbl: 1, type: 1, mdls: [{ id__: 268, parm: [{ pid_: 1, valu: 0.45 }, { pid_: 2, valu: true }] }] }, 2, { enbl: 0, type: 1, mdls: [{ id__: 33, parm: [{ pid_: 1, valu: -24.1 }, { pid_: 2, valu: 3 }] }] }] }, { bcnt: 28, blks: [] }] } };
    const DEFS = { 268: { name: 'HD2_VolPanVolMono', category: 'Volume/Pan', params: { Pedal: { id: 1, type: 'f', min: 0, max: 1, def: 1 }, VolumeTaper: { id: 2, type: 'b', def: true } } },
      770: { name: 'P35_InputInst1', category: 'Input', params: {} },
      33: { name: 'HX2_CompressorDeluxeCompMono', category: 'Dynamics', params: { Threshold: { id: 1, type: 'f', min: -60, max: 0, def: -37 }, Ratio: { id: 2, type: 'i', min: 0, max: 5, def: 3 } } } };
    const USER = [{ blck: 9, ccid: -2, cctp: 1000, cid_: 216, name: 'MyVibe', posi: 0 }, { blck: 2, ccid: -2, cctp: 1000, cid_: 226, name: "Stop Draggin'", posi: 1 }];
    window.__net = [];
    class FakeWS {
      constructor(url) { this.url = url; this.readyState = 0; window.__ws = this; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen({}); this._push({ op: 'status', version: 't', host: 'p35x1.local', ip: '10.0.0.5', ports: { 2001: true, 2002: true, 2003: true }, defs: true }); }, 0); }
      _push(o) { this.onmessage && this.onmessage({ data: JSON.stringify(o) }); }
      send(s) { const m = JSON.parse(s); m.t = performance.now(); window.__net.push(m); if (m.op === 'rpc') setTimeout(() => this._reply(m), 5); if (m.op === 'lookup') { const models = {}; m.models.forEach(id => { models[id] = DEFS[id] || null; }); this._push({ op: 'defs', models }); } }
      _reply(m) {
        const id = m.args[0][1], a = m.addr, blob = (dec, size) => ({ b64: '', dec, size: size || 1 }), msg = (addr, tags, args) => this._push({ op: 'msg', port: 2002, addr, tags, args });
        if (a === '/ProductInfoGet') return msg('/getProductInfo', 'ib', [id, blob({ host: { name: 'stadium', snum: 'TEST1', vers: { majo: 1, mino: 1, patc: 0, buld: 1274 } } })]);
        if (a === '/ActiveSnapshotIndexGet') return msg('/getActiveSnapshotIndex', 'ii', [id, 2]);
        if (a === '/PropertyValueGet') return msg('/getPropertyValue', 'isbi', [id, m.args[1][1], blob(216), 0]);
        if (a === '/GetContentRef') { const cid = m.args[1][1]; return msg('/GetContentRef', 'ibi', [id, blob(cid === 216 ? USER[0] : {}), 0]); }
        if (a === '/EditBufferStateGet') return msg('/getEditBufferState', 'ihb', [id, 3685, blob({ magic: 'editbuffer', body: EB }, 28679)]);
        if (a === '/GetContainerContents') { const c = m.args[1][1]; const items = c === -2 ? USER : c === -5 ? [{ ccid: -5, cctp: 1001, cid_: 241, name: 'Bebop Festival', posi: 0, type: 1003 }] : c === 241 ? [{ ccid: 241, cctp: 1003, cid_: 242, name: 'MyVibe', posi: 0, rcid: 216 }] : []; return msg('/GetContainerContents', 'ibi', [id, blob(items), 0]); }
        if (a === '/ParamValueGet') return msg('/getParamValue', 'iiiiif', [id, m.args[1][1], m.args[2][1], 0, m.args[4][1], 0.5]);
        msg('/status', 'iii', [id, 0, 0]);
      }
      close() { this.readyState = 3; this.onclose && this.onclose({}); }
    }
    window.WebSocket = FakeWS;
  }, [opts.outs || ['Helix Stadium MIDI'], opts.ins || ['Helix Stadium MIDI'], !!opts.bridgeAuto, opts.favs || null]);
  const page = await ctx.newPage(), errs = [], dialogs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && window.SLHelix && App.midi && App.midi.ready);
  page.setDefaultTimeout(4000); // a tap on a missing / covered element fails fast instead of hanging the suite
  await page.evaluate(() => {
    window.__toasts = []; App.helix.on('toast', d => window.__toasts.push(d.msg));
    // every toast the page shows, whichever path wrote it (the engine's event through helix.js, or the deck directly):
    // both set #hx-toast's textContent, so a setter trap on that one element counts them (a repeated identical text included)
    window.__toastN = 0; window.__toastLast = '';
    const tEl = document.getElementById('hx-toast'), td = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
    if (tEl && td) Object.defineProperty(tEl, 'textContent', { configurable: true, get() { return td.get.call(this); }, set(v) { window.__toastN++; window.__toastLast = String(v); td.set.call(this, v); } });
    window.__fbset = []; App.on('fb:set', d => window.__fbset.push({ t: performance.now(), d }));
    window.__tempo = []; App.on('tempo', d => window.__tempo.push({ t: performance.now(), d }));
    // the deck's sheet: press its OK (the confirm button, else the primary button, else the form)
    window.__vis = el => !!el && !el.disabled && el.getClientRects().length > 0;
    window.__sheetOk = () => {
      const sh = document.getElementById('hxd-sheet'); if (!sh || sh.hidden) return 'closed';
      let b = document.getElementById('hxd-confirmok'); if (window.__vis(b)) { b.click(); return 'confirmok'; }
      b = sh.querySelector('button.primary, .btn.primary, button[type=submit]'); if (window.__vis(b)) { b.click(); return 'primary'; }
      const f = sh.querySelector('form'); if (f) { if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return 'submit'; }
      return 'none';
    };
    window.__sheet = () => { const sh = document.getElementById('hxd-sheet'); return sh ? { open: !sh.hidden, mode: sh.getAttribute('data-mode') || sh.dataset.sheet || '', title: (document.getElementById('hxd-ctitle') || {}).textContent || '', body: (document.getElementById('hxd-cbody') || {}).textContent || '' } : null; };
  });
  return { ctx, page, errs, dialogs };
}
const wait = (page, ms) => page.waitForTimeout(ms);
const N = page => page.evaluate(() => window.__sent.length);
const S = (page, n) => page.evaluate(n => window.__sent.slice(n).map(b => b.join(' ')), n);
const AT = (page, n) => page.evaluate(n => window.__sentAt.slice(n), n);
const net = (page, addr) => page.evaluate(addr => window.__net.filter(m => m.op === 'rpc' && m.addr === addr).map(m => m.args.slice(1).map(a => a[1])), addr);
const netAt = (page, addr) => page.evaluate(addr => window.__net.filter(m => m.op === 'rpc' && m.addr === addr).map(m => m.t), addr);
const writesSince = (page, n) => page.evaluate(([n, W]) => window.__net.slice(n).filter(m => m.op === 'rpc' && W.includes(m.addr)).map(m => m.addr), [n, WRITES]);
const netLen = page => page.evaluate(() => window.__net.length);
const toasts = page => page.evaluate(() => window.__toasts.length);
const toastN = page => page.evaluate(() => window.__toastN);
const armed = page => page.evaluate(() => App.helix.armed());
const arm = (page, on) => page.evaluate(on => App.helix.arm(on), on);
const text = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel); return e ? e.textContent.trim() : null; }, sel);
const attr = (page, sel, a) => page.evaluate(([sel, a]) => { const e = document.querySelector(sel); return e ? e.getAttribute(a) : null; }, [sel, a]);
const has = (page, sel, cls) => page.evaluate(([sel, cls]) => { const e = document.querySelector(sel); return !!e && e.classList.contains(cls); }, [sel, cls]);
const count = (page, sel) => page.evaluate(sel => document.querySelectorAll(sel).length, sel);
const vis = (page, sel) => page.evaluate(sel => window.__vis(document.querySelector(sel)), sel);
// a real tap (pointerdown / up / click from the mouse, as a finger would send them)
async function tap(page, sel) { try { await page.locator(sel).first().click({ timeout: 4000 }); return 'ok'; } catch (e) { return 'fail: ' + String(e && e.message || e).split('\n')[0]; } }
async function press(page, sel, ms) { const b = await page.locator(sel).first().boundingBox().catch(() => null); if (!b) return false; await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await wait(page, ms || 700); await page.mouse.up(); return true; }
// synthetic pointer steps in one go: [sel, type, fx, fy, o?] or a number of ms to wait
const seq = (page, steps) => page.evaluate(async steps => { for (const s of steps) { if (typeof s === 'number') await new Promise(r => setTimeout(r, s)); else { const el = document.querySelector(s[0]); if (!el) throw new Error('no element ' + s[0]); window.__pt(el, s[1], s[2], s[3], s[4]); } } }, steps);
const key = (page, sel, k, shift) => page.evaluate(([sel, k, shift]) => { const el = document.querySelector(sel); el.focus(); el.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: !!shift, bubbles: true, cancelable: true })); return document.activeElement === el; }, [sel, k, !!shift]);
const strip = (page, sel) => page.evaluate(sel => { const s = document.querySelector(sel); if (!s) return null; const one = s.closest('.hxd-one') || s.parentElement; const v = one && (one.querySelector('.hxd-val') || one.querySelector('.hxd-heroval')); return { now: s.getAttribute('aria-valuenow'), role: s.getAttribute('role'), tab: s.getAttribute('tabindex'), val: v ? v.textContent.trim() : null, h: Math.round(s.getBoundingClientRect().height) }; }, sel);
const back = page => page.evaluate(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })); return { active: App.active, mode: SLHelix.mode(), sheet: window.__sheet() }; }); // the app's Back path (help -> sheet -> module.onBack -> page stack)
const fw = (page, s) => page.evaluate(s => { App.helix.setFwConfirmed(s); return App.helix.state().fw; }, s);
// the firmware gate as the deck shows it: song chips disabled; the Mixer row either disabled in the picker or rendered inert (.hxd-four.off + the fw caption)
const gated = page => page.evaluate(async () => {
  const M = window.SLHelixMap, song = [...document.querySelectorAll('#hxd-perform [data-chip]')].filter(b => { const c = M.byId(b.dataset.chip); return c && c.minFw === '1.3'; });
  const mix = document.querySelector('#hxd-rows [data-row="mix"]'), was = SLHelixDeck.row();
  let mixOff = !!(mix && mix.disabled), cap = '';
  if (mix && !mix.disabled) { mix.click(); await new Promise(r => setTimeout(r, 20)); mixOff = !!document.querySelector('.hxd-four.off[aria-disabled="true"]'); cap = [...document.querySelectorAll('.hxd-fwrow')].filter(window.__vis).map(p => p.textContent.trim()).join(' | '); document.querySelector('#hxd-rows [data-row="' + was + '"]').click(); await new Promise(r => setTimeout(r, 20)); }
  return { song: song.length, songOff: song.filter(b => b.disabled).length, mix: !!mix, mixOff, btnOff: !!(mix && mix.disabled), cap };
});

(async () => {
  console.log('# the map: every control has its Explain sentence (pure Node)');
  const MAP = require(path.join(env.ROOT, 'js', 'helix-map.js'));
  const missing = MAP.CONTROLS.filter(c => typeof MAP.EXPLAIN[c.id] !== 'string' || !MAP.EXPLAIN[c.id].trim() || MAP.EXPLAIN[c.id] !== c.explain).map(c => c.id);
  ok(MAP.v === 1 && MAP.CONTROLS.length >= 40 && missing.length === 0, MAP.CONTROLS.length + ' controls, each with one EXPLAIN sentence' + (missing.length ? ': missing ' + missing.join(' ') : ''));
  const rowMiss = MAP.ROWS.filter(r => !MAP.EXPLAIN[r.id]).map(r => r.id), chipMiss = MAP.CHIPS.filter(id => !MAP.byId(id));
  ok(MAP.ROWS.map(r => r.id).join(',') === ROWS && rowMiss.length === 0 && chipMiss.length === 0 && MAP.CHIPS.join(',') === 'tuner,toe,tap,click,muteall,looprec,loopover,loopplay,loopstop,looponce,loopundo', 'rows ' + MAP.ROWS.map(r => r.id).join(',') + ' and chips are controls with sentences');
  const tour = MAP.tour();
  ok(tour.length >= 4 && tour.every(s => s.t && s.x && Object.values(MAP.EXPLAIN).includes(s.x)) && tour.some(s => s.sel === '#hxd-mode'), 'tour() = ' + tour.length + ' steps worded from EXPLAIN');
  const k0 = MAP.byId('knob:0'), snap = MAP.byId('snapshot'), tun = MAP.byId('tuner'), mx = MAP.byId('mix:level'), stp = MAP.byId('stomp');
  ok(k0.num === 38 && k0.def === 64 && k0.row === 'knobs14' && snap.num === 69 && snap.conf === 'verified' && tun.num === 9 && tun.val === 34 && mx.minFw === '1.4' && mx.ch === 'layer' && stp.ch === 'ctl' && stp.conf === 'learned' && MAP.byId('setlist:pos').conf === 'unverified',
    'numbers and confidences: knob 1 CC38 def 64, snapshot CC69 verified, tuner CC9=34, mixer layer ch fw 1.4, stomps ctl ch learned, setlist 5+pos unverified');

  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });

  // ======================================================================
  console.log('# desktop: boot, Perform default, the DOM contract, startup silence');
  const { ctx, page, errs, dialogs } = await newPage(browser, { bridgeAuto: false });
  const loaded = await page.evaluate(() => !!(window.SLHelixDeck && typeof SLHelixDeck.init === 'function'));
  if (!loaded) {
    ok(false, 'js/helix-deck.js loaded (window.SLHelixDeck with init) — the rest of the suite needs the deck');
    await browser.close(); console.log('\n' + fails + ' FAILED'); process.exit(1);
  }
  let r = await page.evaluate(async () => {
    App.switchTo('helix');
    await new Promise(r => setTimeout(r, 600));
    const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
    const on = b => !!b && (b.classList.contains('active') || b.getAttribute('aria-pressed') === 'true');
    return { active: App.active, sent: window.__sent.length, writes: window.__net.filter(m => m.op === 'rpc').map(m => m.addr), ws: !!window.__ws, dialogs: window.__dialogs,
      api: ['init', 'stop', 'onBack', 'mode', 'openSheet', 'closeSheet', 'row'].filter(k => typeof SLHelixDeck[k] !== 'function'), version: SLHelixDeck.version,
      mode: SLHelix.mode(), dmode: SLHelixDeck.mode(), stored: App.store.get('hx.mode', 'perform'), performHidden: $('#hxd-perform').hidden, editHidden: $('#hxd-edit').hidden,
      modeBtns: $$('#hxd-mode button[data-mode]').map(b => b.dataset.mode + (on(b) ? '*' : '')).join(','),
      ids: ['hxd-top', 'hxd-explain', 'hxd-mode', 'hxd-routes', 'hxd-perform', 'hxd-now', 'hxd-nowname', 'hxd-nowsub', 'hxd-nowacts', 'hxd-arm', 'hxd-armst', 'hxd-prev', 'hxd-next', 'hxd-pin', 'hxd-save', 'hxd-armmsg', 'hxd-snaps', 'hxd-snprev', 'hxd-snnext', 'hxd-pins', 'hxd-pinempty', 'hxd-strips', 'hxd-hero', 'hxd-rows', 'hxd-chips', 'hxd-fsmode', 'hxd-sheet'].filter(id => !document.getElementById(id)),
      explain: $('#hxd-explain').getAttribute('aria-pressed'), caps: $$('.hxd-cap').filter(window.__vis).length,
      sheetHidden: $('#hxd-sheet').hidden, sheetRole: $('#hxd-sheet').getAttribute('role'), sheetModal: $('#hxd-sheet').getAttribute('aria-modal'),
      armst: $('#hxd-armst').textContent.trim(), armBtn: $('#hxd-arm').textContent.replace($('#hxd-armst').textContent, '').trim(), armed: App.helix.armed(), live: $('#hxd-armmsg').getAttribute('aria-live'),
      badges: $$('#hxd-routes .hxd-rbadge').map(b => b.dataset.route + ':' + b.dataset.status).join(','),
      usbCap: ($('#hxd-routes .hxd-rbadge[data-route="usb"]') || {}).title || '', topText: $('#hxd-top').textContent + ' ' + $$('#hxd-top [title]').map(e => e.title).join(' '),
      nowname: $('#hxd-nowname').textContent.trim(), nowsub: $('#hxd-nowsub').textContent.trim(), nowbad: $('#hxd-nowsub').classList.contains('bad'), prov: ($('#hxd-now .hxd-prov') || {}).dataset ? $('#hxd-now .hxd-prov').dataset.src : null,
      saveShown: window.__vis($('#hxd-save')), snaps: $$('#hxd-snaps .hxd-snap[data-snap]').map(b => b.dataset.snap).join(','), snapActive: $$('.hxd-snap.active').map(b => b.dataset.snap + ':' + (b.dataset.src || '')).join(','),
      tiles: $$('.hxd-tile').length, pinEmpty: window.__vis($('#hxd-pinempty')),
      hero: ($('#hxd-hero .hxd-strip') || {}).dataset ? $('#hxd-hero .hxd-strip').dataset.key : null, heroRole: ($('#hxd-hero .hxd-strip') || {}).getAttribute && $('#hxd-hero .hxd-strip').getAttribute('role'), heroH: Math.round(($('#hxd-hero .hxd-strip') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height),
      rows: $$('#hxd-rows button[data-row]').map(b => b.dataset.row + (on(b) ? '*' : '') + (b.disabled ? '-' : '')).join(','), row: SLHelixDeck.row(), storedRow: App.store.get('hx.row', 'knobs14'),
      keys: $$('.hxd-four .hxd-strip[data-key]').map(s => s.dataset.key).join(','), knob0: ($('.hxd-four .hxd-strip[data-key="knob:0"]') || {}).getAttribute && $('.hxd-four .hxd-strip[data-key="knob:0"]').getAttribute('aria-valuenow'),
      chips: $$('#hxd-chips .hxd-chip[data-chip]').map(b => b.dataset.chip).join(','), extraChips: $$('#hxd-chips .hxd-chip[data-chip]').slice(12).map(b => b.dataset.chip + ':' + ((window.SLHelixMap.byId(b.dataset.chip) || {}).minFw || '-')).join(','), fs: $$('#hxd-fsmode button[data-fs]').map(b => b.dataset.fs).join(','),
      chipActive: $$('.hxd-chip.active').length, confirmInDom: !!$('#hxd-confirmok') };
  });
  ok(r.active === 'helix' && r.api.length === 0 && r.version != null, 'SLHelixDeck API present (init/stop/onBack/mode/openSheet/closeSheet/row, version ' + r.version + ')' + (r.api.length ? ' missing ' + r.api.join(' ') : ''));
  ok(r.ids.length === 0, 'hxd- ids from the spec are in the DOM' + (r.ids.length ? ': missing ' + r.ids.join(' ') : ''));
  ok(r.sent === 0 && !r.writes.some(a => WRITES.includes(a)) && !r.ws && r.dialogs === 0, 'startup silence: zero bytes, no bridge socket (hx.bridgeAuto off), no dialog on open: ' + J({ sent: r.sent, ws: r.ws }));
  ok(r.mode === 'perform' && r.dmode === 'perform' && r.stored === 'perform' && !r.performHidden && r.editHidden && r.modeBtns === 'perform*,edit', 'Perform is the default face: #hxd-perform shown, #hxd-edit folded, seg ' + r.modeBtns);
  ok(r.armst === 'DISARMED' && !r.armed && /^Arm/.test(r.armBtn) && r.live === 'polite', 'disarmed on the visit: #hxd-armst ' + r.armst + ', button "' + r.armBtn + '", #hxd-armmsg aria-live ' + r.live);
  ok(r.badges === 'midi:online,net:absent,usb:absent', 'route badges (USB is absent until the bridge is up: the bridge is what finds the link): ' + r.badges);
  ok(/Start the bridge/.test(r.usbCap) && (/firmware 1\.4/.test(r.usbCap) || /firmware 1\.4/.test(r.topText)), 'the USB badge carries the honest caption (start the bridge; firmware 1.4): ' + (r.usbCap || r.topText.replace(/\s+/g, ' ').slice(0, 120)));
  ok(/User 1A/.test(r.nowname) && !r.nowbad && (r.prov === 'none' || r.prov === null), 'Now bar names the address when nothing was read (User 1A), routes present so not .bad, provenance none: ' + J({ name: r.nowname, sub: r.nowsub, prov: r.prov }));
  ok(!r.saveShown, '#hxd-save is hidden without the bridge');
  ok(r.snaps === '0,1,2,3,4,5,6,7' && (r.snapActive === '' || r.snapActive === '0:none' || r.snapActive === '0:') && r.sheetHidden && r.sheetRole === 'dialog' && r.sheetModal != null, 'eight snapshot buttons (snapshot 1 may show as the current one, but with no sent / echo / state provenance: "' + r.snapActive + '"); the sheet is a hidden modal dialog: ' + J({ hidden: r.sheetHidden, role: r.sheetRole, modal: r.sheetModal }));
  ok(r.tiles === 0 && r.pinEmpty, 'no pins yet: the empty hint shows');
  ok(r.hero === 'exp:0' && r.heroRole === 'slider' && r.heroH >= 48, 'the hero strip is EXP 1 (hx.hero default), role slider, ' + r.heroH + ' px');
  ok(/^knobs14\*,knobs58,pedals,stomps,block-?,mix-?$/.test(r.rows) && r.row === 'knobs14' && r.storedRow === 'knobs14', 'row picker in order, Knobs 1–4 active (hx.row default): ' + r.rows);
  ok(r.keys === 'knob:0,knob:1,knob:2,knob:3' && r.knob0 === '64', 'four knob strips at their default 64: ' + r.keys);
  ok(r.chips.indexOf(CHIPS) === 0 && (r.extraChips === '' || r.extraChips.split(',').every(x => /:1\.3$/.test(x))) && r.fs === '0,1,2,3,4,5,6' && r.chipActive === 0, 'the twelve chips in order' + (r.extraChips ? ' + the song transport chips (fw 1.3) after them' : '') + ' + footswitch mode seg: ' + r.chips);
  ok(r.explain === 'false' && r.caps === 0, 'Explain off: no captions');

  console.log('# Perform | Edit fold, persistence, Back order');
  r = await page.evaluate(async () => {
    const n = window.__sent.length;
    document.querySelector('#hxd-mode [data-mode="edit"]').click();
    await new Promise(r => setTimeout(r, 30));
    return { sent: window.__sent.length - n, mode: SLHelix.mode(), dmode: SLHelixDeck.mode(), stored: App.store.get('hx.mode'), performHidden: document.getElementById('hxd-perform').hidden, editHidden: document.getElementById('hxd-edit').hidden, views: [...document.querySelectorAll('.hx-view')].filter(v => !v.hidden).length };
  });
  ok(r.sent === 0 && r.mode === 'edit' && r.dmode === 'edit' && r.stored === 'edit' && r.performHidden && !r.editHidden && r.views === 1, 'Edit unfolds the six views (one shown) and hides the Perform grid, zero bytes: ' + J(r));
  r = await page.evaluate(async () => { App.switchTo('quiz'); await new Promise(r => setTimeout(r, 150)); App.switchTo('helix'); await new Promise(r => setTimeout(r, 400)); return { mode: SLHelix.mode(), armed: App.helix.armed(), armst: document.getElementById('hxd-armst').textContent.trim(), sent: window.__sent.length }; });
  ok(r.mode === 'edit' && !r.armed && r.armst === 'DISARMED' && r.sent === 0, 'hx.mode persists across a page round trip, the visit starts disarmed again, still zero bytes');
  let b = await back(page);
  ok(b.active === 'helix' && b.mode === 'perform', 'Back from Edit folds to Perform (stays on the page): ' + J(b));
  r = await page.evaluate(async () => { SLHelixDeck.mode('edit'); document.getElementById('hxd-pin').click(); await new Promise(r => setTimeout(r, 30)); return { sheet: window.__sheet(), mode: SLHelix.mode(), sent: window.__sent.length }; });
  ok(r.sheet && r.sheet.open && r.mode === 'edit' && r.sent === 0, 'Pin opens the sheet (in Edit too), nothing sent: ' + J(r.sheet));
  b = await back(page);
  ok(b.active === 'helix' && b.sheet && !b.sheet.open && b.mode === 'edit', 'Back order 1: the sheet closes first, mode untouched: ' + J(b));
  b = await back(page);
  ok(b.active === 'helix' && b.mode === 'perform', 'Back order 2: Edit -> Perform: ' + J(b));
  r = await page.evaluate(() => SLHelixDeck.onBack());
  ok(r === false, 'Back order 3: nothing open -> the deck answers false (the app unwinds)');

  console.log('# rows and Explain: zero bytes');
  r = await page.evaluate(async () => {
    const n = window.__sent.length, out = {};
    for (const id of ['knobs58', 'pedals', 'stomps', 'block', 'mix', 'knobs14']) {
      const btn = document.querySelector('#hxd-rows [data-row="' + id + '"]'); btn.click(); await new Promise(r => setTimeout(r, 20));
      out[id] = { row: SLHelixDeck.row(), keys: [...document.querySelectorAll('.hxd-four .hxd-strip[data-key]')].map(s => s.dataset.key).join('|'), off: !!document.querySelector('.hxd-four.off[aria-disabled="true"]'), cap: [...document.querySelectorAll('#hxd-strips .hxd-rowcap')].filter(window.__vis).map(p => p.textContent.trim()).join(' | '), btnOff: btn.disabled, xy: !!document.getElementById('hxd-xy'), toe: !!document.querySelector('#hxd-perform .hxd-chip[data-chip="toe"]') };
    }
    return { out, sent: window.__sent.length - n, stored: App.store.get('hx.row'), errs: 0 };
  });
  ok(r.sent === 0 && r.stored === 'knobs14', 'switching rows sends nothing and stores hx.row');
  ok(r.out.knobs58.keys === 'knob:4|knob:5|knob:6|knob:7' && /^exp:0\|exp:1(\|xy)?$/.test(r.out.pedals.keys) && r.out.pedals.xy && r.out.pedals.toe && r.out.stomps.row === 'stomps' && r.out.knobs14.keys === 'knob:0|knob:1|knob:2|knob:3', 'Knobs 5–8 = knob:4..7, Pedals = EXP 1 / EXP 2 + the XY pad + Toe chip, Stomps selectable: ' + J({ knobs58: r.out.knobs58.keys, pedals: r.out.pedals.keys, stomps: r.out.stomps.row }));
  ok(r.out.block.btnOff || (r.out.block.keys === '' && /bridge/i.test(r.out.block.cap)), 'the Block row without the bridge: ' + (r.out.block.btnOff ? 'disabled' : 'no strips, a caption says it needs the bridge') + ': ' + J(r.out.block.cap));
  ok(r.out.mix.btnOff || (r.out.mix.off && /firmware 1\.4/.test(r.out.mix.cap) && /fw unknown/.test(r.out.mix.cap)), 'the Mixer row before fw 1.4: ' + (r.out.mix.btnOff ? 'disabled' : 'strips inert (.off, aria-disabled) with the firmware caption') + ': ' + J(r.out.mix.cap));
  r = await page.evaluate(async () => {
    const n = window.__sent.length, E = window.SLHelixMap.EXPLAIN, vals = Object.values(E);
    document.getElementById('hxd-explain').click(); await new Promise(r => setTimeout(r, 30));
    const caps = [...document.querySelectorAll('.hxd-cap')].filter(window.__vis).map(p => p.textContent.trim());
    const on = { pressed: document.getElementById('hxd-explain').getAttribute('aria-pressed'), caps: caps.length, known: caps.filter(t => vals.includes(t)).length, stored: App.store.get('hx.explain'), sample: caps[0] };
    document.getElementById('hxd-explain').click(); await new Promise(r => setTimeout(r, 30));
    return { on, off: { pressed: document.getElementById('hxd-explain').getAttribute('aria-pressed'), caps: [...document.querySelectorAll('.hxd-cap')].filter(window.__vis).length, stored: App.store.get('hx.explain') }, sent: window.__sent.length - n };
  });
  ok(r.on.pressed === 'true' && r.on.caps >= 4 && r.on.known === r.on.caps && r.on.stored === true, 'Explain on: ' + r.on.caps + ' captions, every one a sentence from SLHelixMap.EXPLAIN ("' + String(r.on.sample).slice(0, 60) + '…")');
  ok(r.off.pressed === 'false' && r.off.caps === 0 && r.off.stored === false && r.sent === 0, 'Explain off again: no captions; toggling sent nothing');

  console.log('# disarmed: refusals send nothing, snap back, say why');
  let n0 = await N(page), t0 = await toastN(page);
  await seq(page, [[K0, 'pointerdown', 0.75, 0.5], [K0, 'pointerup', 0.75, 0.5], 60]);
  let st = await strip(page, K0);
  let sent = await S(page, n0);
  r = await page.evaluate(() => ({ n: window.__toastN, last: window.__toastLast }));
  ok(sent.length === 0 && st.now === '64' && st.val === '64' && r.n === t0 + 1 && /disarmed/i.test(r.last), 'a strip tap while disarmed: zero bytes, thumb stays at 64, one toast says why ("' + r.last + '"): ' + J(sent) + ' ' + st.now);
  n0 = await N(page);
  const snapBefore = await page.evaluate(() => [...document.querySelectorAll('.hxd-snap.active')].map(b => b.dataset.snap + ':' + (b.dataset.src || '')).join(','));
  r = await tap(page, '#hxd-chips .hxd-chip[data-chip="tuner"]'); await wait(page, 40);
  const snapTap = await tap(page, '#hxd-snaps .hxd-snap[data-snap="3"]'); await wait(page, 40);
  await tap(page, '#hxd-prev'); await wait(page, 40);
  sent = await S(page, n0);
  r = await page.evaluate(() => ({ active: [...document.querySelectorAll('.hxd-snap.active')].map(b => b.dataset.snap + ':' + (b.dataset.src || '')).join(','), chipSent: document.querySelectorAll('.hxd-chip.sent').length, chipActive: document.querySelectorAll('.hxd-chip.active').length, writes: window.__net.length }));
  ok(sent.length === 0 && r.active === snapBefore && !/sent|echo|state/.test(r.active) && r.chipSent === 0 && r.chipActive === 0 && r.writes === 0, 'chip, snapshot and Prev while disarmed: zero bytes, the active snapshot unchanged ("' + snapBefore + '" -> "' + r.active + '"), no chip .active / .sent (' + snapTap + ')');
  r = await page.evaluate(() => { const c = document.querySelector('#hxd-chips .hxd-chip[data-chip="muteall"]'); return { text: c.textContent.trim(), disabled: c.disabled }; });
  ok(/Arm\s*&\s*mute/i.test(r.text) && !r.disabled, 'Mute all while disarmed reads as the two-step "Arm & mute", never a silent refusal: "' + r.text + '"');
  n0 = await N(page);
  await tap(page, '#hxd-chips .hxd-chip[data-chip="muteall"]'); await wait(page, 60);
  let taps = 1;
  if ((await N(page)) === n0) { await tap(page, '#hxd-chips .hxd-chip[data-chip="muteall"]'); await wait(page, 60); taps = 2; }
  sent = await S(page, n0);
  r = await page.evaluate(() => ({ armed: App.helix.armed(), armst: document.getElementById('hxd-armst').textContent.trim(), text: document.querySelector('#hxd-chips .hxd-chip[data-chip="muteall"]').textContent.trim() }));
  ok(J(sent) === J(['176 9 24']) && r.armed && r.armst === 'ARMED' && !/Arm\s*&/i.test(r.text), 'Arm & mute arms and sends CC9 = 24 once (' + taps + ' tap' + (taps > 1 ? 's' : '') + '), the chip reads Mute all again: ' + J(sent) + ' ' + r.text);

  console.log('# Arm button');
  await arm(page, false);
  n0 = await N(page);
  await tap(page, '#hxd-arm'); await wait(page, 40);
  r = await page.evaluate(() => ({ armed: App.helix.armed(), armst: document.getElementById('hxd-armst').textContent.trim(), btn: document.getElementById('hxd-arm').textContent.trim(), msg: document.getElementById('hxd-armmsg').textContent }));
  ok(r.armed && r.armst === 'ARMED' && /Disarm/.test(r.btn) && (await N(page)) === n0, '#hxd-arm arms (helix.arm): ' + r.armst + ' / "' + r.btn + '", zero bytes; ' + r.msg.slice(0, 60));
  await tap(page, '#hxd-arm'); await wait(page, 40);
  r = await page.evaluate(() => ({ armed: App.helix.armed(), armst: document.getElementById('hxd-armst').textContent.trim() }));
  ok(!r.armed && r.armst === 'DISARMED', 'and disarms again: ' + r.armst);
  await arm(page, true);

  console.log('# strips (knob 1 = CC38): tap, drag, fine, keys, double-tap, wheel');
  n0 = await N(page);
  await seq(page, [[K0, 'pointerdown', 0.25, 0.5], [K0, 'pointerup', 0.25, 0.5], 80]);
  sent = await S(page, n0); st = await strip(page, K0);
  r = await page.evaluate(() => App.helix.values('knob:0'));
  ok(J(sent) === J(['176 38 32']) && st.now === '32' && st.val === '32' && r && r.v === 32 && r.src === 'sent', 'tap at 25 % sends exactly [B0 26 20] once per frame; thumb and value follow after op() ok, provenance sent: ' + J(sent) + ' ' + st.now);
  n0 = await N(page);
  await seq(page, [[K0, 'pointerdown', 0.1, 0.5], [K0, 'pointermove', 0.2, 0.5], [K0, 'pointermove', 0.3, 0.5], [K0, 'pointermove', 0.4, 0.5], [K0, 'pointermove', 0.5, 0.5], [K0, 'pointerup', 0.5, 0.5], 80]);
  sent = await S(page, n0); st = await strip(page, K0);
  ok(sent.length >= 1 && sent.length <= 2 && sent[sent.length - 1] === '176 38 64' && st.now === '64', 'five moves in one frame coalesce to ' + sent.length + ' send(s), the last at 50 % = 64: ' + J(sent));
  n0 = await N(page);
  await page.evaluate(async sel => {
    const s = document.querySelector(sel), h = s.getBoundingClientRect().height, w8 = ms => new Promise(r => setTimeout(r, ms));
    window.__pt(s, 'pointerdown', 0.5, 0.5); await w8(60);
    window.__pt(s, 'pointermove', 0.5, 0.5, { dy: 2 * h }); await w8(60); // off the strip: fine mode from 64
    window.__pt(s, 'pointermove', 1.0, 0.5, { dy: 2 * h }); await w8(60); // half a width = 127 * .5 * .25 = +16
    window.__pt(s, 'pointerup', 1.0, 0.5, { dy: 2 * h }); await w8(60);
  }, K0);
  sent = await S(page, n0); st = await strip(page, K0);
  ok(sent.length >= 1 && sent[sent.length - 1] === '176 38 80' && !sent.includes('176 38 127') && st.now === '80', 'dragging off the strip (2x its height) gives quarter-speed fine steps: 64 -> 80, never the 127 under the pointer: ' + J(sent));
  n0 = await N(page);
  const focused = await key(page, K0, 'ArrowRight'); await wait(page, 40); await key(page, K0, 'ArrowRight', true); await wait(page, 40); await key(page, K0, 'End'); await wait(page, 40); await key(page, K0, 'Home');
  await wait(page, 100);
  sent = await S(page, n0);
  ok(focused && J(sent) === J(['176 38 81', '176 38 91', '176 38 127', '176 38 0']), 'keyboard (a frame apart): ArrowRight +1, Shift +10, End 127, Home 0 (the strip takes focus): ' + J(sent));
  n0 = await N(page);
  await seq(page, [[K0, 'pointerdown', 0.25, 0.5], [K0, 'pointerup', 0.25, 0.5], 40, [K0, 'pointerdown', 0.25, 0.5], [K0, 'pointerup', 0.25, 0.5], 100]);
  sent = await S(page, n0); st = await strip(page, K0);
  ok(sent.length >= 1 && sent[sent.length - 1] === '176 38 64' && st.now === '64', 'a double-tap (< 350 ms) resets to the default 64: ' + J(sent));
  n0 = await N(page);
  r = await page.evaluate(async sel => {
    const s = document.querySelector(sel), w8 = ms => new Promise(r => setTimeout(r, ms));
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    s.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })); await w8(60);
    const blurred = window.__sent.length;
    s.focus(); s.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })); await w8(60);
    return { blurred, focusedEl: document.activeElement === s };
  }, K0);
  sent = await S(page, n0);
  ok(r.blurred === n0 && r.focusedEl && sent.length === 1 && /^176 38 \d+$/.test(sent[0]) && sent[0] !== '176 38 64', 'wheel is ignored unless the strip is focused, then steps once: ' + J(sent));
  const kv0 = (await strip(page, K0)).now;

  console.log('# the arm window lapses mid-drag; a failed send disarms');
  n0 = await N(page); t0 = await toastN(page);
  r = await page.evaluate(async ([sel, n0, t0]) => {
    const s = document.querySelector(sel), w8 = ms => new Promise(r => setTimeout(r, ms));
    window.__pt(s, 'pointerdown', 0.5, 0.5); await w8(60);
    const afterDown = window.__sent.length - n0, armedBefore = App.helix.armed(), toastsDown = window.__toastN - t0;
    window.__clock += 91000; // the 90 s window is over (the engine's own 90 s timer is real time and cannot fire here)
    window.__pt(s, 'pointermove', 0.75, 0.5); await w8(60);
    const afterLapse = { sent: window.__sent.length - n0, toasts: window.__toastN - t0, toast: window.__toastLast, now: s.getAttribute('aria-valuenow'), armed: App.helix.armed(), armst: document.getElementById('hxd-armst').textContent.trim() };
    window.__pt(s, 'pointermove', 0.9, 0.5); await w8(60);
    window.__pt(s, 'pointerup', 0.9, 0.5); await w8(60);
    return { afterDown, armedBefore, toastsDown, afterLapse, end: { sent: window.__sent.length - n0, toasts: window.__toastN - t0, now: s.getAttribute('aria-valuenow') } };
  }, [K0, n0, t0]);
  sent = await S(page, n0);
  ok(r.armedBefore && r.afterDown === 1 && sent[0] === '176 38 64' && r.toastsDown === 0, 'the drag starts armed: pointerdown at 50 % sends 64, no toast');
  ok(r.afterLapse.sent === 1 && !r.afterLapse.armed && r.afterLapse.now === '64' && r.afterLapse.toasts === 1, 'a move after the window lapsed is refused: zero bytes, snap-back to the last confirmed 64, ONE toast ("' + r.afterLapse.toast + '"), helix.armed() false: ' + J({ sent: r.afterLapse.sent, toasts: r.afterLapse.toasts, now: r.afterLapse.now, armed: r.afterLapse.armed }));
  if (r.afterLapse.armst !== 'DISARMED') note('the pill still reads ' + r.afterLapse.armst + ' right after the lapse: the deck sees helix.armed() false but does not tell the engine (gate); with a real clock the engine\'s own 90 s timer flips the pill');
  ok(r.end.sent === 1 && r.end.toasts === 1 && r.end.now === '64', 'the refusal ended the drag: further moves send nothing and toast nothing: ' + J(r.end));
  await arm(page, true);
  n0 = await N(page);
  r = await page.evaluate(async sel => {
    const s = document.querySelector(sel), w8 = ms => new Promise(r => setTimeout(r, ms));
    window.__failNext = true;
    window.__pt(s, 'pointerdown', 0.25, 0.5); window.__pt(s, 'pointerup', 0.25, 0.5); await w8(80);
    return { now: s.getAttribute('aria-valuenow'), armed: App.helix.armed(), armst: document.getElementById('hxd-armst').textContent.trim(), msg: document.getElementById('hxd-armmsg').textContent, v: App.helix.values('knob:0').v };
  }, K0);
  ok((await N(page)) === n0 && r.now === '64' && r.v === 64 && !r.armed && r.armst === 'DISARMED' && /send failed/i.test(r.msg), 'a failed send disarms and the strip reverts (no byte reached the port): ' + J(r));

  console.log('# EXP hero (CC1), EXP 2, the XY pad (CC7 / CC8), Toe');
  await arm(page, true);
  n0 = await N(page);
  const HERO = '#hxd-hero .hxd-strip[data-key="exp:0"]';
  await seq(page, [[HERO, 'pointerdown', 0.5, 0.5], [HERO, 'pointerup', 0.5, 0.5], 80]);
  sent = await S(page, n0);
  r = await page.evaluate(() => ({ now: document.querySelector('#hxd-hero .hxd-strip').getAttribute('aria-valuenow'), val: (document.querySelector('#hxd-hero .hxd-heroval') || {}).textContent }));
  ok(J(sent) === J(['176 1 64']) && r.now === '64' && /64/.test(r.val || ''), 'the hero strip sends EXP 1 = CC1: ' + J(sent) + ' value "' + r.val + '"');
  await page.evaluate(() => document.querySelector('#hxd-rows [data-row="pedals"]').click()); await wait(page, 30);
  n0 = await N(page);
  const E2 = '.hxd-four .hxd-strip[data-key="exp:1"]';
  await seq(page, [[E2, 'pointerdown', 0.5, 0.5], [E2, 'pointerup', 0.5, 0.5], 80]);
  sent = await S(page, n0);
  ok(J(sent) === J(['176 2 64']), 'EXP 2 = CC2: ' + J(sent));
  n0 = await N(page);
  await seq(page, [['#hxd-xy', 'pointerdown', 0.25, 0.25], 80, ['#hxd-xy', 'pointerup', 0.25, 0.25], 80]);
  sent = await S(page, n0);
  ok(sent.length >= 2 && sent[0] === '176 7 32' && sent[1] === '176 8 95' && sent.every(s => s === '176 7 32' || s === '176 8 95'), 'the XY pad sends the pair CC7 across = 32, CC8 up = 95 for a touch a quarter in and a quarter down: ' + J(sent));
  n0 = await N(page);
  await tap(page, '#hxd-perform .hxd-chip[data-chip="toe"]'); await wait(page, 40);
  sent = await S(page, n0);
  ok(J(sent) === J(['176 36 127']), 'Toe switch chip: CC36 = 127: ' + J(sent));
  await page.evaluate(() => document.querySelector('#hxd-rows [data-row="knobs14"]').click());

  console.log('# chips: exact bytes, momentary flash, never .active; fsmode; app tempo');
  n0 = await N(page);
  r = await tap(page, '#hxd-chips .hxd-chip[data-chip="tuner"]'); await wait(page, 25);
  const flash = await has(page, '#hxd-chips .hxd-chip[data-chip="tuner"]', 'sent');
  await wait(page, 300);
  const flashGone = !(await has(page, '#hxd-chips .hxd-chip[data-chip="tuner"]', 'sent'));
  sent = await S(page, n0);
  ok(J(sent) === J(['176 9 34']) && flash && flashGone, 'Tuner = CC9 34; the chip flashes .sent for ~150 ms and clears: ' + J(sent) + ' flash ' + flash + '/' + flashGone + (r !== 'ok' ? ' (' + r + ')' : ''));
  n0 = await N(page);
  for (const id of ['tap', 'click', 'muteall', 'looprec', 'loopover', 'loopplay', 'loopstop', 'looponce', 'loopundo']) { await tap(page, '#hxd-chips .hxd-chip[data-chip="' + id + '"]'); await wait(page, 25); }
  sent = await S(page, n0);
  ok(J(sent) === J(['176 64 127', '176 9 23', '176 9 24', '176 58 127', '176 58 0', '176 59 127', '176 59 0', '176 60 127', '176 53 127']), 'Tap CC64, Click CC9 23, Mute all CC9 24, looper Record 58=127 / Overdub 58=0 / Play 59=127 / Stop 59=0 / Once 60=127 / Undo 53=127: ' + J(sent));
  r = await page.evaluate(() => {
    const M = window.SLHelixMap, chips = [...document.querySelectorAll('#hxd-chips .hxd-chip[data-chip]')];
    return { active: document.querySelectorAll('.hxd-chip.active').length, pressed: chips.filter(c => c.getAttribute('aria-pressed') === 'true').length,
      unsureMismatch: chips.filter(c => { const d = M.byId(c.dataset.chip); return !!d && c.classList.contains('unsure') !== (d.conf !== 'verified'); }).map(c => c.dataset.chip),
      badge: chips.filter(c => c.classList.contains('unsure') && /\?/.test(c.textContent)).length, unsure: chips.filter(c => c.classList.contains('unsure')).length };
  });
  ok(r.active === 0 && r.pressed === 0, 'momentary chips never latch: no .active / aria-pressed after the sends');
  ok(r.unsureMismatch.length === 0 && r.badge === r.unsure, '.unsure + a ? badge exactly on chips whose number is not verified (' + r.unsure + ' chips)' + (r.unsureMismatch.length ? '; mismatch ' + r.unsureMismatch.join(' ') : ''));
  n0 = await N(page);
  await tap(page, '#hxd-fsmode [data-fs="3"]'); await wait(page, 40);
  sent = await S(page, n0);
  r = await page.evaluate(() => [...document.querySelectorAll('#hxd-fsmode button')].filter(b => b.classList.contains('active') || b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.fs).join(','));
  ok(J(sent) === J(['176 37 3']) && r === '3', 'footswitch mode seg: CC37 = 3, Snapshot mode marked: ' + J(sent) + ' active ' + r);
  await page.evaluate(() => { App.store.set('met.bpm', 240); App.emit('tempo', { bpm: 240, source: 'test' }); });
  n0 = await N(page);
  await tap(page, '#hxd-chips .hxd-chip[data-chip="apptempo"]'); await wait(page, 1700);
  sent = await S(page, n0);
  ok(J(sent) === J(['176 64 127', '176 64 127', '176 64 127', '176 64 127']), 'App tempo = four CC64 taps at the app\'s BPM: ' + J(sent));

  console.log('# the firmware gate before the bridge (fw unknown -> confirmed)');
  let g0 = await gated(page);
  ok(g0.song > 0 && g0.songOff === g0.song && g0.mix && g0.mixOff && (g0.btnOff || /fw unknown/.test(g0.cap)), 'song chips (fw 1.3) and the Mixer row (fw 1.4) are disabled while the firmware is unknown (' + (g0.btnOff ? 'picker button disabled' : 'strips inert + caption') + '): ' + J(g0));
  // the inert Mixer row sends nothing when tapped
  await page.evaluate(() => document.querySelector('#hxd-rows [data-row="mix"]').click()); await wait(page, 30);
  const MX = '.hxd-four .hxd-strip[data-key="mix:qtr:11"]';
  n0 = await N(page);
  if (await count(page, MX)) await seq(page, [[MX, 'pointerdown', 0.5, 0.5], [MX, 'pointerup', 0.5, 0.5], 80]);
  sent = await S(page, n0);
  ok(sent.length === 0, 'a tap on the inert Mixer strip (Home level, CC11 on the ¼" layer) sends nothing: ' + J(sent));
  await fw(page, '1.3'); await wait(page, 30);
  let g1 = await gated(page);
  await fw(page, '1.4'); await wait(page, 30);
  let g2 = await gated(page);
  await page.evaluate(() => document.querySelector('#hxd-rows [data-row="mix"]').click()); await wait(page, 30);
  n0 = await N(page);
  if (await count(page, MX)) await seq(page, [[MX, 'pointerdown', 0.5, 0.5], [MX, 'pointerup', 0.5, 0.5], 80]);
  sent = await S(page, n0);
  ok(J(sent) === J(['178 11 64']), 'with fw 1.4 confirmed the same strip sends CC11 = 64 on channel 3 (¼" layer): ' + J(sent));
  await page.evaluate(() => document.querySelector('#hxd-rows [data-row="knobs14"]').click()); await wait(page, 30);
  await fw(page, ''); await wait(page, 30);
  let g3 = await gated(page);
  ok(g1.songOff === 0 && g1.mixOff && g2.songOff === 0 && !g2.mixOff && g3.songOff === g3.song && g3.mixOff, 'setFwConfirmed(\'1.3\') enables the song chips, \'1.4\' the Mixer row, clearing it disables both again: ' + J({ at13: g1, at14: g2, cleared: g3 }));
  r = await page.evaluate(() => App.store.get('hx.fwConfirmed'));
  ok(r === '' || r == null, 'hx.fwConfirmed cleared: ' + J(r));

  console.log('# snapshots over MIDI, the echo, Prev / Next');
  n0 = await N(page);
  await tap(page, '#hxd-snaps .hxd-snap[data-snap="2"]'); await wait(page, 40);
  sent = await S(page, n0);
  r = await page.evaluate(() => { const a = document.querySelector('.hxd-snap.active'); return a ? a.dataset.snap + ':' + a.dataset.src : 'none'; });
  ok(J(sent) === J(['176 69 2']) && r === '2:sent', 'a snapshot tap sends CC69 = 2 (no bridge); .active with data-src sent: ' + J(sent) + ' ' + r);
  n0 = await N(page);
  await tap(page, '#hxd-snprev'); await tap(page, '#hxd-snnext'); await wait(page, 40);
  sent = await S(page, n0);
  ok(J(sent) === J(['176 69 9', '176 69 8']), 'snapshot prev / next: CC69 = 9 / 8: ' + J(sent));
  r = await page.evaluate(async () => { window.__recv([0xB0, 69, 5]); await new Promise(r => setTimeout(r, 80)); const a = document.querySelector('.hxd-snap.active'); return a ? a.dataset.snap + ':' + a.dataset.src : 'none'; });
  ok(r === '5:echo', 'a CC69 echo from the pedal marks snapshot 6 amber (data-src echo, never state): ' + r);
  n0 = await N(page);
  await tap(page, '#hxd-prev'); await tap(page, '#hxd-next'); await wait(page, 40);
  sent = await S(page, n0);
  ok(J(sent) === J(['176 9 12', '176 9 13']), 'Prev / Next = CC9 12 / 13: ' + J(sent));
  r = await page.evaluate(async () => { window.__recv([0xC0, 9]); await new Promise(r => setTimeout(r, 80)); return { name: document.getElementById('hxd-nowname').textContent.trim(), prov: document.querySelector('#hxd-now .hxd-prov').dataset.src, sub: document.getElementById('hxd-nowsub').textContent.trim() }; });
  ok(/User 3B/.test(r.name) && r.prov === 'echo', 'a Program Change echo moves the Now bar to User 3B with amber provenance: ' + J(r));

  console.log('# pins: the sheet saves an address without bytes; a tile recalls it');
  await page.evaluate(() => { App.store.set('fb.root', 7); App.store.set('met.bpm', 100); App.emit('tempo', { bpm: 100, source: 'test' }); });
  n0 = await N(page);
  await tap(page, '#hxd-pin'); await wait(page, 40);
  r = await page.evaluate(() => {
    const sh = window.__sheet(), $ = s => document.querySelector(s);
    const f = { pname: !!$('#hxd-pname'), max: $('#hxd-pname') && $('#hxd-pname').getAttribute('maxlength'), swatches: [...document.querySelectorAll('#hxd-sheet .hxd-swatch[data-colour]')].map(e => e.dataset.colour).join(','), ptags: !!$('#hxd-ptags'), psnap: !!$('#hxd-psnap'), papp: !!$('#hxd-papp'), appLabel: ($('#hxd-papp') && $('#hxd-papp').closest('label') || {}).textContent || '' };
    return { sheet: sh, f };
  });
  ok(r.sheet.open && r.f.pname && r.f.max === '40' && r.f.swatches === 'amber,teal,blue,pink,green,grey' && r.f.ptags && r.f.psnap && r.f.papp && /soundLAB key/.test(r.f.appLabel), 'the pin sheet: name (40), six colour swatches, tags, snapshot select, the app key & tempo switch: ' + J(r.f));
  r = await page.evaluate(async () => {
    const $ = s => document.querySelector(s), w8 = ms => new Promise(r => setTimeout(r, ms));
    $('#hxd-pname').value = 'Verse'; $('#hxd-pname').dispatchEvent(new Event('input', { bubbles: true }));
    $('#hxd-sheet .hxd-swatch[data-colour="teal"]').click();
    $('#hxd-psnap').value = '2'; $('#hxd-psnap').dispatchEvent(new Event('change', { bubbles: true }));
    if (!$('#hxd-papp').checked) $('#hxd-papp').click();
    const how = window.__sheetOk(); await w8(60);
    const favs = App.store.get('hx.favs', []), tile = $('.hxd-tile');
    return { how, favs, sheet: window.__sheet(), tiles: document.querySelectorAll('.hxd-tile').length, tileText: tile ? tile.textContent.replace(/\s+/g, ' ').trim() : '', tileFav: tile ? tile.dataset.fav : '', pinEmpty: window.__vis($('#hxd-pinempty')), cols: tile ? getComputedStyle($('.hxd-pingrid')).gridTemplateColumns.split(' ').length : 0, border: tile ? getComputedStyle(tile).borderLeftWidth : '' };
  });
  sent = await S(page, n0);
  const f0 = r.favs[0] || {};
  ok(sent.length === 0 && r.favs.length === 1 && f0.name === 'Verse' && f0.bank === 1 && f0.prog === 9 && f0.snap === 2 && f0.colour === 'teal' && typeof f0.id === 'string', 'saving (' + r.how + ') stores name, address (CC32 1, PC 9 = User 3B), snapshot 3 and the colour; ZERO bytes: ' + J(r.favs));
  ok(f0.app && f0.app.bpm === 100 && f0.app.root === 7, 'the app switch pins soundLAB\'s key & tempo: ' + J(f0.app));
  ok(!r.sheet.open && r.tiles === 1 && r.tileFav === f0.id && /Verse/.test(r.tileText) && /User 3B/.test(r.tileText) && /snap 3/i.test(r.tileText) && !r.pinEmpty, 'the tile shows the name and the address badge: "' + r.tileText + '"');
  ok(r.cols === 8 && parseFloat(r.border) >= 3, 'desktop pin grid has 8 columns; the colour rides the tile\'s left border: ' + r.cols + ' cols, ' + r.border);
  const TILE = '.hxd-tile[data-fav="' + f0.id + '"]';
  await arm(page, true);
  n0 = await N(page); const fb0 = await page.evaluate(() => window.__fbset.length), tp0 = await page.evaluate(() => window.__tempo.length);
  await tap(page, TILE);
  const sending = await has(page, TILE, 'sending');
  await wait(page, 600);
  sent = await S(page, n0); const at = await AT(page, n0);
  r = await page.evaluate(([n, fb0, tp0]) => ({ sending: document.querySelectorAll('.hxd-tile.sending').length, active: document.querySelector('.hxd-tile.active') ? document.querySelector('.hxd-tile.active').dataset.fav : '', drift: document.querySelectorAll('.hxd-tile.drift').length, name: document.getElementById('hxd-nowname').textContent.trim(), prov: document.querySelector('#hxd-now .hxd-prov').dataset.src,
    fbset: window.__fbset.slice(fb0).map(x => ({ dt: Math.round(x.t - window.__sentAt[window.__sentAt.length - 1]), root: x.d.root, source: x.d.source })), tempo: window.__tempo.slice(tp0).filter(x => x.d.source === 'helix').map(x => ({ dt: Math.round(x.t - window.__sentAt[window.__sentAt.length - 1]), bpm: x.d.bpm })), snap: document.querySelector('.hxd-snap.active') ? document.querySelector('.hxd-snap.active').dataset.snap : '' }), [n0, fb0, tp0]);
  const d1 = at.length > 1 ? Math.round(at[1] - at[0]) : -1, d2 = at.length > 2 ? Math.round(at[2] - at[1]) : -1;
  ok(J(sent) === J(['176 32 1', '192 9', '176 69 2']) && d1 >= 20 && d1 < 200 && d2 >= 250 && d2 < 700, 'a tile tap recalls: CC32 at 0, the Program Change +' + d1 + ' ms (30), the snapshot +' + d2 + ' ms (300): ' + J(sent));
  ok(sending && r.sending === 0 && r.active === f0.id && r.name === 'Verse' && r.prov === 'sent' && r.snap === '2', 'the tile is .sending while the plan runs, then .active; the Now bar takes the pin\'s name with grey provenance: ' + J({ sending, after: r.sending, active: r.active, name: r.name, prov: r.prov }));
  ok(r.fbset.length === 1 && r.fbset[0].dt >= 0 && r.fbset[0].root === 7 && r.fbset[0].source === 'helix' && r.tempo.length === 1 && r.tempo[0].bpm === 100 && r.tempo[0].dt >= 0, 'the pinned key & tempo apply AFTER the last byte (fb:set + tempo, source helix): ' + J({ fbset: r.fbset, tempo: r.tempo }));
  r = await page.evaluate(async () => {
    const w8 = ms => new Promise(r => setTimeout(r, ms));
    window.__recv([0xB0, 69, 4]); await w8(300);
    const drift = !!document.querySelector('.hxd-tile.drift'), snap = App.helix.state().st.snap;
    // diagnostic only: does a forced repaint of the pins (a same-pin save) show the drift the deck computes?
    const f = App.helix.favs()[0]; App.helix.saveFav(Object.assign({}, f)); await w8(60);
    const driftRepaint = !!document.querySelector('.hxd-tile.drift');
    window.__recv([0xB0, 69, 2]); await w8(300);
    return { drift, snap, driftRepaint, after: document.querySelectorAll('.hxd-tile.drift').length, active: document.querySelectorAll('.hxd-tile.active').length };
  });
  ok(r.drift && r.after === 0 && r.active === 1, 'a snapshot echo that differs from the pin (snap ' + (r.snap + 1) + ' vs pinned 3) marks the tile .drift; matching again clears it: ' + J(r) + (!r.drift && r.driftRepaint ? ' — the deck computes drift but does not repaint the pins on a snap echo' : ''));
  // second tap cancels the plan: mouse down/up twice as fast as the protocol allows
  n0 = await N(page);
  const box = await page.locator(TILE).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.up(); await page.mouse.down(); await page.mouse.up();
  await wait(page, 450);
  sent = await S(page, n0);
  r = await page.evaluate(() => ({ sending: document.querySelectorAll('.hxd-tile.sending').length, cancelled: !!window.__toasts.slice(-3).some(t => /cancel/i.test(t)) }));
  ok(sent.length >= 1 && sent.length < 3 && sent[0] === '176 32 1' && r.sending === 0, 'a second tap mid-plan cancels it: ' + sent.length + ' byte(s) out of 3, no .sending left: ' + J(sent));
  n0 = await N(page);
  r = await press(page, TILE, 750); await wait(page, 60);
  r = await page.evaluate(() => ({ sheet: window.__sheet(), name: (document.getElementById('hxd-pname') || {}).value, snap: (document.getElementById('hxd-psnap') || {}).value, teal: !!document.querySelector('#hxd-sheet .hxd-swatch[data-colour="teal"].active, #hxd-sheet .hxd-swatch[data-colour="teal"][aria-pressed="true"]') }));
  ok(r.sheet.open && r.name === 'Verse' && String(r.snap) === '2', 'a long-press (650 ms) opens the edit sheet with the pin loaded: ' + J(r));
  r = await page.evaluate(async () => {
    const $ = s => document.querySelector(s), w8 = ms => new Promise(r => setTimeout(r, ms));
    $('#hxd-pname').value = 'Verse 2'; $('#hxd-pname').dispatchEvent(new Event('input', { bubbles: true }));
    const how = window.__sheetOk(); await w8(60);
    return { how, favs: App.store.get('hx.favs', []).map(f => [f.id, f.name, f.bank, f.prog, f.snap, f.colour]), tile: ($('.hxd-tile') || {}).textContent, open: window.__sheet().open };
  });
  ok((await N(page)) === n0 && r.favs.length === 1 && r.favs[0][0] === f0.id && r.favs[0][1] === 'Verse 2' && r.favs[0][2] === 1 && r.favs[0][3] === 9 && r.favs[0][4] === 2 && r.favs[0][5] === 'teal' && /Verse 2/.test(r.tile) && !r.open, 'editing replaces the pin in place (same id, address kept), zero bytes: ' + J(r.favs));
  await press(page, TILE, 750); await wait(page, 60);
  r = await page.evaluate(async () => {
    const sh = document.getElementById('hxd-sheet'), w8 = ms => new Promise(r => setTimeout(r, ms));
    const btn = [...sh.querySelectorAll('button')].filter(window.__vis).filter(b => /remove|delete|unpin/i.test(b.textContent))[0];
    if (!btn) return { found: false };
    btn.click(); await w8(60);
    let confirmed = false;
    const okb = document.getElementById('hxd-confirmok'); if (window.__vis(okb) && !sh.hidden) { okb.click(); confirmed = true; await w8(60); }
    return { found: true, confirmed, favs: App.store.get('hx.favs', []).length, tiles: document.querySelectorAll('.hxd-tile').length, empty: window.__vis(document.getElementById('hxd-pinempty')), open: window.__sheet().open };
  });
  ok(r.found && r.favs === 0 && r.tiles === 0 && r.empty && !r.open && (await N(page)) === n0, 'the edit sheet removes the pin (' + (r.confirmed ? 'after its confirm' : 'directly') + '): empty again, zero bytes: ' + J(r));
  r = await page.evaluate(async () => {
    const w8 = ms => new Promise(r => setTimeout(r, ms)), l = [];
    for (let i = 0; i < 48; i++) l.push({ id: 'p' + i, name: 'Pin ' + i, bank: 1, prog: i, snap: null });
    l.push({ id: 'junk1', name: '', bank: 1, prog: 1 }, { id: 'junk2', name: 'bad bank', bank: 200, prog: 1 }, { id: 'junk3', name: 'bad snap', bank: 1, prog: 1, snap: 9 });
    App.store.set('hx.favs', l);
    App.helix.saveFav({ id: 'p0', name: 'Pin 0', bank: 1, prog: 0 }); await w8(60); // a replace in place repaints
    const n = window.__toasts.length, extra = App.helix.saveFav({ name: 'one more', bank: 1, prog: 2 }); await w8(30);
    const pg = document.getElementById('hxd-pinpager');
    const out = { read: App.helix.favs().length, tiles: document.querySelectorAll('.hxd-tile').length, pager: !!pg && window.__vis(pg), pagerText: pg ? pg.textContent.replace(/\s+/g, ' ').trim() : '', extra, toast: window.__toasts.slice(n).join(' | ') };
    App.store.set('hx.favs', [{ id: 'last', name: 'Last', bank: 1, prog: 0 }]); App.helix.removeFav('last'); await w8(30);
    out.after = document.querySelectorAll('.hxd-tile').length;
    return out;
  });
  ok(r.read === 48 && (r.tiles === 48 || (r.tiles === 16 && /3/.test(r.pagerText))) && r.pager && r.extra === null && /48/.test(r.toast) && r.after === 0, 'favorites validate on read (junk dropped), cap at 48 with a pager past 16 (' + r.tiles + ' tiles on a page, "' + r.pagerText + '"), the 49th is refused: ' + J({ read: r.read, extra: r.extra, toast: r.toast, after: r.after }));
  r = await page.evaluate(async () => { const n = window.__sent.length; SLHelixDeck.init(document.getElementById('hxd-top'), document.getElementById('hxd-perform'), App.helix); await new Promise(r => setTimeout(r, 40)); App.helix.arm(true); document.querySelector('#hxd-chips .hxd-chip[data-chip="tuner"]').click(); await new Promise(r => setTimeout(r, 40)); return { sent: window.__since(n).map(b => b.join(' ')), tops: document.querySelectorAll('#hxd-explain').length, nows: document.querySelectorAll('#hxd-now').length }; });
  ok(J(r.sent) === J(['176 9 34']) && r.tops === 1 && r.nows === 1, 'init() is idempotent: a second init rebuilds the DOM once, listeners are not doubled (one CC9 34 per tap): ' + J(r));

  console.log('# the bridge: Connect from the net badge, Now bar, names, green provenance');
  let how = 'badge';
  await tap(page, '#hxd-routes .hxd-rbadge[data-route="net"]'); await wait(page, 700);
  if (!(await page.evaluate(() => App.helix.devOnline()))) { ok(false, 'tapping the net badge connects the bridge (fell back to #hx-brbtn)'); how = 'hx-brbtn'; await page.evaluate(() => document.getElementById('hx-brbtn').click()); await wait(page, 700); }
  r = await page.evaluate(() => ({ online: App.helix.devOnline(), badges: [...document.querySelectorAll('#hxd-routes .hxd-rbadge')].map(b => b.dataset.route + ':' + b.dataset.status).join(','), brst: document.getElementById('hx-brst').textContent, auto: App.store.get('hx.bridgeAuto'),
    name: document.getElementById('hxd-nowname').textContent.trim(), sub: document.getElementById('hxd-nowsub').textContent.trim(), bad: document.getElementById('hxd-nowsub').classList.contains('bad'), prov: document.querySelector('#hxd-now .hxd-prov').dataset.src,
    snap0: document.querySelector('.hxd-snap[data-snap="0"]').textContent.replace(/\s+/g, ' ').trim(), snap2: document.querySelector('.hxd-snap[data-snap="2"]').textContent.replace(/\s+/g, ' ').trim(), snap1: document.querySelector('.hxd-snap[data-snap="1"]').textContent.replace(/\s+/g, ' ').trim(), active: (document.querySelector('.hxd-snap.active') || { dataset: {} }).dataset.snap + ':' + (document.querySelector('.hxd-snap.active') || { dataset: {} }).dataset.src,
    save: window.__vis(document.getElementById('hxd-save')), usb: (document.querySelector('#hxd-routes .hxd-rbadge[data-route="usb"]') || {}).title || document.getElementById('hxd-top').textContent, writes: window.__net.filter(m => m.op === 'rpc').map(m => m.addr), sent: window.__sent.length, fw: App.helix.state().fw }));
  ok(r.online && r.badges === 'midi:online,net:online,usb:needs-setup' && /Helix at 10\.0\.0\.5/.test(r.brst) && r.auto === true, 'bridge online via ' + how + ': badges ' + r.badges + '; the shell agrees: ' + r.brst);
  ok(r.name === 'MyVibe' && /Snapshot 3/.test(r.sub) && /Lead/.test(r.sub) && /fw 1\.1\.0/.test(r.sub) && /MIDI/.test(r.sub) && /net/.test(r.sub) && !r.bad && r.prov === 'state', 'the Now bar reads the device: "' + r.name + '" / "' + r.sub + '" with green provenance (' + r.prov + ')');
  ok(/SNAPSHOT 1/.test(r.snap0) && /Lead/.test(r.snap2) && !/Lead|SNAPSHOT/.test(r.snap1) && r.active === '2:state', 'snapshot names mapped by their own index (si__: 1 "SNAPSHOT 1", 3 "Lead", 2 unnamed), the active one green: ' + r.snap0 + ' | ' + r.snap1 + ' | ' + r.snap2 + ' | ' + r.active);
  ok(r.save && !r.writes.some(a => WRITES.includes(a)) && r.fw.str === '1.1.0' && r.fw.src === 'read' && /fw 1\.1\.0/.test(r.usb), 'Save appears, only read RPCs so far, fw 1.1.0 read and named in the USB caption');
  g0 = await gated(page); await fw(page, '1.4'); await wait(page, 30); g1 = await gated(page); await fw(page, '');
  ok(g0.songOff === g0.song && g0.mixOff && g1.songOff === g1.song && g1.mixOff, 'the firmware read from the pedal (1.1.0) wins over a confirmed value: song chips and Mixer row stay disabled: ' + J({ read: g0, confirmed14: g1 }));

  console.log('# bridge writes: Save confirm sheet, snapshots, the change stream, rename');
  await arm(page, true);
  let nn = await netLen(page);
  await tap(page, '#hxd-save'); await wait(page, 40);
  r = await page.evaluate(() => { const s = window.__sheet(); return { s, okCls: (document.getElementById('hxd-confirmok') || {}).className || '', cancel: window.__vis(document.getElementById('hxd-confirmcancel')) }; });
  ok(r.s.open && /Save/.test(r.s.title) && /MyVibe/.test(r.s.body) && /danger/.test(r.okCls) && r.cancel, 'Save asks in the sheet (destructive, OK is .danger, names the preset): ' + J(r.s));
  await tap(page, '#hxd-confirmcancel'); await wait(page, 60);
  r = await page.evaluate(() => window.__sheet().open);
  ok(!r && (await writesSince(page, nn)).length === 0 && (await page.evaluate(() => window.__dialogs)) === 0, 'Cancel closes it and nothing is written');
  await tap(page, '#hxd-save'); await wait(page, 40); await tap(page, '#hxd-confirmok'); await wait(page, 120);
  let w = await net(page, '/SavePresetWithCID');
  ok(J(w) === J([[216, 0, 0]]) && !(await page.evaluate(() => window.__sheet().open)), 'OK sends /SavePresetWithCID [cid, 0, 0]: ' + J(w));
  n0 = await N(page); nn = await netLen(page);
  await tap(page, '#hxd-snaps .hxd-snap[data-snap="4"]'); await wait(page, 60);
  r = await page.evaluate(() => { const a = document.querySelector('.hxd-snap.active'); return a ? a.dataset.snap + ':' + a.dataset.src : 'none'; });
  w = await page.evaluate(nn => window.__net.slice(nn).filter(m => m.op === 'rpc' && m.addr === '/activateSnapshot').map(m => m.args[1][1]), nn);
  ok(J(w) === J([4]) && (await N(page)) === n0 && r === '4:sent', 'with the bridge online a snapshot tap goes /activateSnapshot 4 and no MIDI byte: ' + J(w) + ' ' + r);
  r = await page.evaluate(async () => { window.__ws._push({ op: 'msg', port: 2001, addr: '/activateSnapshot', tags: 'iii', args: [-1, -1, 2] }); await new Promise(r => setTimeout(r, 500)); const a = document.querySelector('.hxd-snap.active'); return a ? a.dataset.snap + ':' + a.dataset.src : 'none'; });
  ok(r === '2:state', 'a change-stream snapshot is read back and painted green: ' + r);
  nn = await netLen(page);
  await press(page, '#hxd-snaps .hxd-snap[data-snap="2"]', 750); await wait(page, 60);
  r = await page.evaluate(() => ({ s: window.__sheet(), name: (document.getElementById('hxd-sname') || {}).value, max: (document.getElementById('hxd-sname') || { getAttribute: () => null }).getAttribute('maxlength') }));
  ok(r.s.open && r.name === 'Lead' && r.max === '16', 'a long-press on snapshot 3 opens the rename sheet with its name ("Lead"), 16 characters max: ' + J(r));
  r = await page.evaluate(async () => { const i = document.getElementById('hxd-sname'); i.value = 'A very long snapshot name'; i.dispatchEvent(new Event('input', { bubbles: true })); const how = window.__sheetOk(); await new Promise(r => setTimeout(r, 120)); return { how, label: document.querySelector('.hxd-snap[data-snap="2"]').textContent.replace(/\s+/g, ' ').trim(), open: window.__sheet().open }; });
  w = await page.evaluate(nn => window.__net.slice(nn).filter(m => m.op === 'rpc' && m.addr === '/SetSnapshotName').map(m => m.args.slice(1).map(a => a[1])), nn);
  ok(J(w) === J([[2, 'A very long snap']]) && /A very long snap/.test(r.label) && !r.open && !/snapshot name/.test(r.label), 'rename sends /SetSnapshotName [2, name] clipped to 16 and the button follows: ' + J(w) + ' (' + r.how + ')');
  r = await page.evaluate(() => ({ writes: window.__net.filter(m => m.op === 'rpc' && m.addr === '/activateSnapshot').length, sentAll: window.__sent.length }));

  console.log('# bridge: ★ Active pin, the block row');
  n0 = await N(page);
  await tap(page, '#hxd-pin'); await wait(page, 40);
  r = await page.evaluate(async () => {
    const sh = document.getElementById('hxd-sheet'), w8 = ms => new Promise(r => setTimeout(r, ms)), $ = s => document.querySelector(s);
    let act = [...sh.querySelectorAll('button, label, .chip')].filter(window.__vis).filter(e => /Active/.test(e.textContent) && !/soundLAB/.test(e.textContent))[0], how = act ? 'button' : '';
    if (act) act.click(); else { const sel = [...sh.querySelectorAll('select')].filter(s => [...s.options].some(o => /Active/.test(o.textContent)))[0]; if (sel) { sel.value = [...sel.options].filter(o => /Active/.test(o.textContent))[0].value; sel.dispatchEvent(new Event('change', { bubbles: true })); act = sel; how = 'select'; } }
    await w8(200);
    $('#hxd-pname').value = 'Vibe pin'; $('#hxd-pname').dispatchEvent(new Event('input', { bubbles: true }));
    $('#hxd-psnap').value = '1'; $('#hxd-psnap').dispatchEvent(new Event('change', { bubbles: true }));
    const okHow = window.__sheetOk(); await w8(80);
    return { found: !!act, how, okHow, favs: App.store.get('hx.favs', []).map(f => [f.name, f.bank, f.prog, f.snap, f.cid]), open: window.__sheet().open, tile: ($('.hxd-tile') || {}).textContent };
  });
  ok(r.found && r.favs.length === 1 && J(r.favs[0]) === J(['Vibe pin', 1, 0, 1, 216]) && !r.open && (await N(page)) === n0, '★ Active fills the address from the loaded preset (User 1A, editor id 216) and the pin saves without bytes (' + r.how + '/' + r.okHow + '): ' + J(r.favs));
  r = await page.evaluate(async () => {
    const n = window.__sent.length, nn = window.__net.length, w8 = ms => new Promise(r => setTimeout(r, ms));
    const btn = document.querySelector('#hxd-rows [data-row="block"]'); const dis = btn.disabled; btn.click(); await w8(60);
    const strips = [...document.querySelectorAll('.hxd-four .hxd-strip[data-key]')].map(s => s.dataset.key);
    let write = null;
    if (strips.length && /^param:/.test(strips[0])) { const s = document.querySelector('.hxd-four .hxd-strip[data-key]'); window.__pt(s, 'pointerdown', 0.5, 0.5); window.__pt(s, 'pointerup', 0.5, 0.5); await w8(120); write = window.__net.slice(nn).filter(m => m.op === 'rpc' && m.addr === '/ParamValueSet').map(m => m.args.slice(1).map(a => a[1])); }
    document.querySelector('#hxd-rows [data-row="knobs14"]').click();
    return { dis, row: SLHelixDeck.row(), strips, write, sent: window.__sent.length - n };
  });
  ok(!r.dis && r.row !== 'mix' && r.sent === 0 && r.strips.length <= 4, 'the Block row opens once the bridge is up (' + r.strips.length + ' param strips, no MIDI bytes): ' + J(r.strips));
  if (r.write) ok(r.write.length >= 1 && r.write[0].length === 6 && r.write[0][4] >= 0 && r.write[0][4] <= 1, 'a param strip writes /ParamValueSet [path, slot, 0, pid, value, -1] over the bridge: ' + J(r.write)); else note('the Block row showed no numeric param strip (no block open) — nothing to write');

  console.log('# USB link (fw 1.4): the bridge reports its transport; the badges, the Now sub-line, the tap');
  // the bridge's status shape from phase 4: transport = the link in use, transports = what it found on this computer
  const USB = { present: true, reachable: true, adapter: { name: 'Ethernet 3', description: 'UsbNcm Host Device' }, local: 'fd12::2', candidate: 'fd12::1' };
  const status = (page, transport, usb) => page.evaluate(([transport, usb]) => { window.__ws._push({ op: 'status', version: 't', host: 'p35x1.local', ip: transport === 'usb' ? 'fd12::1' : '10.0.0.5', ports: { 2001: true, 2002: true, 2003: true }, defs: true, transport, transports: { usb, net: { host: 'p35x1.local', ip: '10.0.0.5' } } }); }, [transport, usb]);
  const badges = page => page.evaluate(() => ({ b: [...document.querySelectorAll('#hxd-routes .hxd-rbadge')].map(b => b.dataset.route + ':' + b.dataset.status).join(','), labels: [...document.querySelectorAll('#hxd-routes .hxd-rbadge .hxd-rname')].map(e => e.textContent).join('|'), usb: document.querySelector('#hxd-routes .hxd-rbadge[data-route="usb"]').title, net: document.querySelector('#hxd-routes .hxd-rbadge[data-route="net"]').title, sub: document.getElementById('hxd-nowsub').textContent.trim(), bad: document.getElementById('hxd-nowsub').classList.contains('bad'), st: App.helix.state().routes.usb, via: App.helix.state().via, dest: App.helix.dest(), online: App.helix.devOnline(), cap: window.__vis(document.getElementById('hxd-routecap')) ? document.getElementById('hxd-routecap').textContent : '' }));
  n0 = await N(page); nn = await netLen(page);
  let stateN = await page.evaluate(() => { window.__stateN = 0; App.helix.on('state', d => { if (d && d.what === 'routes') window.__stateN++; }); return 0; });
  await status(page, 'usb', USB); await wait(page, 60);
  r = await badges(page);
  ok(r.b === 'midi:online,net:available,usb:online' && r.online, 'transport usb: the USB badge is online, net available (bridge up, Wi-Fi idle), the device still online: ' + r.b);
  ok(/via MIDI \+ USB/.test(r.sub) && !r.bad && J(r.via) === J(['MIDI', 'USB']) && /USB link fd12::1/.test(r.dest) && /Helix Stadium MIDI/.test(r.dest), 'the Now sub-line says via MIDI + USB (the MIDI port exists); helix.dest() names the link: "' + r.sub + '" / "' + r.dest + '"');
  ok(r.st.status === 'online' && r.st.adapter && r.st.adapter.name === 'Ethernet 3' && r.st.candidate === 'fd12::1' && /fd12::1/.test(r.usb) && /Ethernet 3/.test(r.usb) && /USB/.test(r.net) && /Wi-Fi/.test(r.labels), 'state().routes.usb carries {status, caption, adapter, candidate}; the badge titles name the link and the idle Wi-Fi: ' + J({ usb: r.usb, net: r.net, labels: r.labels }));
  await status(page, 'net', { present: true, reachable: false, adapter: USB.adapter, local: 'fd12::2', candidate: 'fd12::1' }); await wait(page, 40);
  r = await badges(page);
  ok(r.b === 'midi:online,net:online,usb:needs-setup' && /did not answer/.test(r.usb) && /Ethernet 3/.test(r.usb) && /Remote Access/.test(r.usb) && /via MIDI \+ net/.test(r.sub), 'a link that is present but silent: USB needs-setup with the "did not answer" caption (names the adapter), net online, via MIDI + net: ' + J({ b: r.b, usb: r.usb }));
  await status(page, 'net', null); await wait(page, 40);
  r = await badges(page);
  ok(r.b === 'midi:online,net:online,usb:needs-setup' && /firmware 1\.4/.test(r.usb) && /No USB link found/.test(r.usb) && /fw 1\.1\.0/.test(r.usb), 'transports.usb null: needs-setup with the firmware 1.4 caption + the pedal\'s fw: ' + r.usb);
  // tap while needs-setup: no bridge message, the caption line toggles under the badges
  nn = await netLen(page);
  await tap(page, '#hxd-routes .hxd-rbadge[data-route="usb"]'); await wait(page, 40);
  r = await badges(page);
  const capOn = r.cap;
  await tap(page, '#hxd-routes .hxd-rbadge[data-route="usb"]'); await wait(page, 40);
  r = await badges(page);
  ok(/firmware 1\.4/.test(capOn) && r.cap === '' && (await page.evaluate(nn => window.__net.slice(nn).filter(m => m.op === 'transport').length, nn)) === 0, 'tapping the USB badge while needs-setup toggles #hxd-routecap with the honest text and asks the bridge nothing: "' + capOn.slice(0, 60) + '…"');
  await status(page, 'net', USB); await wait(page, 40);
  r = await badges(page);
  ok(r.b === 'midi:online,net:online,usb:available' && /USB ready/.test(r.labels) && /Tap to use USB/.test(r.usb), 'reachable but on Wi-Fi: USB available ("USB ready"), the caption invites the tap: ' + J({ b: r.b, usb: r.usb }));
  nn = await netLen(page); n0 = await N(page);
  await tap(page, '#hxd-routes .hxd-rbadge[data-route="usb"]'); await wait(page, 40);
  w = await page.evaluate(nn => window.__net.slice(nn).filter(m => m.op === 'transport').map(m => m.want), nn);
  r = await badges(page);
  ok(J(w) === J(['usb']) && (await N(page)) === n0 && (await writesSince(page, nn)).length === 0, 'the tap sends {op:\'transport\', want:\'usb\'} to the bridge and nothing to the MIDI port, no device write: ' + J(w));
  ok(r.b === 'midi:online,net:online,usb:connecting' && /USB…/.test(r.labels) && /Switching/.test(r.usb), 'USB reads connecting (pulsing dot) until the bridge reports the move: ' + r.b);
  await status(page, 'usb', USB); await wait(page, 40);
  r = await badges(page);
  ok(r.b === 'midi:online,net:available,usb:online' && /via MIDI \+ USB/.test(r.sub) && !r.st.switching, 'the bridge reports transport usb: online again, the switch is over: ' + r.b);
  stateN = await page.evaluate(() => window.__stateN);
  ok(stateN >= 6, 'every status pushed a \'state\' routes event (' + stateN + ' for 6 statuses + the tap)');
  // the preference: hx.transport, sent at once and again on every (re)connect
  nn = await netLen(page);
  r = await page.evaluate(nn => { const p = App.helix.routes.usb.prefer('net'); return { p, stored: App.store.get('hx.transport'), sent: window.__net.slice(nn).filter(m => m.op === 'transport').map(m => m.want), bad: App.helix.routes.usb.prefer('wifi') }; }, nn);
  ok(r.p === 'net' && r.stored === 'net' && J(r.sent) === J(['net']) && r.bad === 'net', 'routes.usb.prefer(\'net\') stores hx.transport and tells the bridge; a bad value is ignored: ' + J(r));
  await page.evaluate(() => App.helix.routes.usb.prefer('auto'));
  // the bridge drops: USB absent (nothing can find the link), Wi-Fi reconnecting; the preference goes out again on the reconnect
  nn = await netLen(page);
  r = await page.evaluate(async () => { window.__ws.close(); await new Promise(r => setTimeout(r, 40)); return { b: [...document.querySelectorAll('#hxd-routes .hxd-rbadge')].map(b => b.dataset.route + ':' + b.dataset.status).join(','), usb: document.querySelector('#hxd-routes .hxd-rbadge[data-route="usb"]').title, armed: App.helix.armed(), sub: document.getElementById('hxd-nowsub').textContent.trim() }; });
  ok(r.b === 'midi:online,net:connecting,usb:absent' && /Start the bridge/.test(r.usb) && !r.armed && /via MIDI$/.test(r.sub), 'bridge closed: USB absent with the "start the bridge" caption, net reconnecting, output disarmed, via MIDI only: ' + J({ b: r.b, sub: r.sub }));
  r = await page.evaluate(async nn => { App.helix.routes.net.connect(); await new Promise(r => setTimeout(r, 120)); return { b: [...document.querySelectorAll('#hxd-routes .hxd-rbadge')].map(b => b.dataset.route + ':' + b.dataset.status).join(','), tr: window.__net.slice(nn).filter(m => m.op === 'transport').map(m => m.want), online: App.helix.devOnline() }; }, nn);
  ok(r.online && r.b === 'midi:online,net:online,usb:needs-setup' && J(r.tr) === J(['auto']), 'reconnected (the fake bridge names no transports): net online, USB needs-setup, hx.transport (auto) sent on the reconnect: ' + J(r));
  await page.evaluate(() => { App.helix.arm(true); });
  r = await page.evaluate(() => ({ dialogs: window.__dialogs, active: document.querySelectorAll('.hxd-chip.active').length, sentTo: [...new Set(window.__sentTo)].join(',') }));
  ok(r.dialogs === 0 && dialogs.length === 0, 'no window.confirm / prompt / alert on the page (' + r.dialogs + ')');
  ok(errs.length === 0, 'no page errors (desktop)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  ok(r.sentTo === 'Helix Stadium MIDI', 'every byte went to the Helix port only: ' + r.sentTo);
  await ctx.close();

  // ======================================================================
  console.log('# isolation: MODX-1 / LUMI / loopMIDI ports only — no MIDI route, the bridge recall path');
  const iso = await newPage(browser, { outs: ['MODX-1', 'LUMI Keys BLOCK', 'loopMIDI Helix'], ins: ['MODX-1'], bridgeAuto: false });
  r = await iso.page.evaluate(async () => {
    App.switchTo('helix'); await new Promise(r => setTimeout(r, 600));
    const n0 = window.__sentTo.length; // the lighting engine may hand a LUMI its native mode in SysEx: not the Helix page
    document.getElementById('hxd-arm').click(); await new Promise(r => setTimeout(r, 30));
    const s = document.querySelector('.hxd-four .hxd-strip[data-key="knob:0"]'); window.__pt(s, 'pointerdown', 0.75, 0.5); window.__pt(s, 'pointerup', 0.75, 0.5);
    document.querySelector('#hxd-chips .hxd-chip[data-chip="tuner"]').click();
    await new Promise(r => setTimeout(r, 100));
    return { n0, mode: SLHelix.midi.mode, badges: [...document.querySelectorAll('#hxd-routes .hxd-rbadge')].map(b => b.dataset.route + ':' + b.dataset.status).join(','), bad: document.getElementById('hxd-nowsub').classList.contains('bad'), armed: App.helix.armed(), armst: document.getElementById('hxd-armst').textContent.trim(), msg: document.getElementById('hxd-armmsg').textContent, armDisabled: document.getElementById('hxd-arm').disabled,
      now: s.getAttribute('aria-valuenow'), chan: window.__sent.filter(b => b[0] < 0xF0).length, ws: !!window.__ws };
  });
  const isoN0 = r.n0;
  ok(r.mode === 'none' && r.badges === 'midi:absent,net:absent,usb:absent' && r.bad, 'no Helix port: MIDI absent, net absent, USB absent (no bridge), the Now bar is .bad: ' + r.badges);
  ok(!r.armed && r.armst === 'DISARMED' && (r.armDisabled || /Nothing to arm/.test(r.msg)), 'Arm refuses with nothing connected (' + (r.armDisabled ? 'button disabled' : 'message') + '): ' + r.msg);
  ok(r.chan === 0 && r.now === '64' && !r.ws, 'a strip tap and a chip send no channel message anywhere; the bridge stays closed until Connect');
  await tap(iso.page, '#hxd-routes .hxd-rbadge[data-route="net"]'); await wait(iso.page, 700);
  how = 'badge';
  if (!(await iso.page.evaluate(() => App.helix.devOnline()))) { ok(false, 'tapping the net badge connects the bridge (isolation; fell back to #hx-brbtn)'); how = 'hx-brbtn'; await iso.page.evaluate(() => document.getElementById('hx-brbtn').click()); await wait(iso.page, 700); }
  r = await iso.page.evaluate(async () => {
    document.getElementById('hxd-arm').click(); await new Promise(r => setTimeout(r, 30));
    return { online: App.helix.devOnline(), badges: [...document.querySelectorAll('#hxd-routes .hxd-rbadge')].map(b => b.dataset.route + ':' + b.dataset.status).join(','), bad: document.getElementById('hxd-nowsub').classList.contains('bad'), sub: document.getElementById('hxd-nowsub').textContent.trim(), name: document.getElementById('hxd-nowname').textContent.trim(), armed: App.helix.armed(), save: window.__vis(document.getElementById('hxd-save')) };
  });
  ok(r.online && r.badges === 'midi:absent,net:online,usb:needs-setup' && !r.bad && /net/.test(r.sub) && r.name === 'MyVibe' && r.armed && r.save, 'bridge only (via ' + how + '): net online, the Now bar names the preset via net, Arm works off the bridge: ' + J({ badges: r.badges, sub: r.sub, armed: r.armed }));
  await tap(iso.page, '#hxd-pin'); await wait(iso.page, 40);
  r = await iso.page.evaluate(async () => {
    const sh = document.getElementById('hxd-sheet'), w8 = ms => new Promise(r => setTimeout(r, ms)), $ = s => document.querySelector(s);
    let act = [...sh.querySelectorAll('button, label, .chip')].filter(window.__vis).filter(e => /Active/.test(e.textContent) && !/soundLAB/.test(e.textContent))[0];
    if (act) act.click(); else { const sel = [...sh.querySelectorAll('select')].filter(s => [...s.options].some(o => /Active/.test(o.textContent)))[0]; if (sel) { sel.value = [...sel.options].filter(o => /Active/.test(o.textContent))[0].value; sel.dispatchEvent(new Event('change', { bubbles: true })); act = sel; } }
    await w8(200);
    $('#hxd-pname').value = 'Vibe'; $('#hxd-pname').dispatchEvent(new Event('input', { bubbles: true }));
    $('#hxd-psnap').value = '1'; $('#hxd-psnap').dispatchEvent(new Event('change', { bubbles: true }));
    window.__sheetOk(); await w8(80);
    return { found: !!act, favs: App.store.get('hx.favs', []).map(f => [f.name, f.bank, f.prog, f.snap, f.cid]), tile: !!$('.hxd-tile'), chan: window.__sent.filter(b => b[0] < 0xF0).length };
  });
  ok(r.found && r.favs.length === 1 && J(r.favs[0]) === J(['Vibe', 1, 0, 1, 216]) && r.tile && r.chan === 0, 'a pin from ★ Active carries the editor id for the bridge path: ' + J(r.favs));
  nn = await netLen(iso.page);
  await tap(iso.page, '.hxd-tile'); await wait(iso.page, 60);
  r = await iso.page.evaluate(() => ({ s: window.__sheet(), okCls: (document.getElementById('hxd-confirmok') || {}).className || '' }));
  ok(r.s.open && /Load/.test(r.s.title) && /"Vibe"/.test(r.s.body) && /danger/.test(r.okCls), 'without MIDI a tile recalls over the bridge after the confirm sheet (Load, names the pin, .danger): ' + J(r.s));
  await tap(iso.page, '#hxd-confirmcancel'); await wait(iso.page, 60);
  ok((await writesSince(iso.page, nn)).length === 0 && !(await iso.page.evaluate(() => window.__sheet().open)), 'Cancel loads nothing');
  await tap(iso.page, '.hxd-tile'); await wait(iso.page, 60);
  const sendingNet = await iso.page.evaluate(async () => { document.getElementById('hxd-confirmok').click(); await new Promise(r => setTimeout(r, 30)); return document.querySelectorAll('.hxd-tile.sending').length; });
  await wait(iso.page, 1300);
  const loads = await netAt(iso.page, '/LoadPresetWithCID'), snapsAt = await iso.page.evaluate(nn => window.__net.slice(nn).filter(m => m.op === 'rpc' && m.addr === '/activateSnapshot').map(m => ({ t: m.t, i: m.args[1][1] })), nn);
  w = await net(iso.page, '/LoadPresetWithCID');
  const gap = loads.length && snapsAt.length ? Math.round(snapsAt[0].t - loads[loads.length - 1]) : -1;
  r = await iso.page.evaluate(() => ({ sending: document.querySelectorAll('.hxd-tile.sending').length, active: document.querySelectorAll('.hxd-tile.active').length, chan: window.__sent.filter(b => b[0] < 0xF0).length, toasts: window.__toasts.filter(t => /Loaded/.test(t)).length }));
  ok(J(w) === J([[216]]) && snapsAt.length === 1 && snapsAt[0].i === 1 && gap >= 700 && gap < 1500, 'OK: /LoadPresetWithCID [216] then /activateSnapshot 1 after ' + gap + ' ms (>= 700): ' + J(w));
  ok(sendingNet === 1 && r.sending === 0 && r.active === 1 && r.chan === 0 && r.toasts >= 1, 'the tile was .sending, ends .active, zero MIDI bytes: ' + J(r));
  r = await iso.page.evaluate(n0 => ({ chan: window.__sent.filter(b => b[0] < 0xF0).length, to: [...new Set(window.__sentTo.filter((n, i) => window.__sent[i][0] < 0xF0))].join(','), later: [...new Set(window.__sentTo.slice(n0))].join(','), dialogs: window.__dialogs }), isoN0 || 0);
  ok(r.chan === 0 && r.to === '' && !/MODX|LUMI|loopMIDI/.test(r.later), 'MODX-1 / LUMI / loopMIDI buckets stay empty throughout: ' + J(r));
  ok(iso.errs.length === 0 && r.dialogs === 0 && iso.dialogs.length === 0, 'no page errors, no dialogs (isolation)' + (iso.errs.length ? ': ' + iso.errs.join(' | ') : ''));
  await iso.ctx.close();

  // ======================================================================
  const SEED = [{ id: 'sa', name: 'Verse', bank: 1, prog: 0, snap: 2, colour: 'teal' }, { id: 'sb', name: 'Chorus', bank: 1, prog: 1, snap: null, colour: 'pink' }];
  for (const lay of [{ name: 'phone', viewport: { width: 375, height: 812 }, cols: 4 }, { name: 'tablet', viewport: { width: 768, height: 1024 }, cols: 4 }]) {
    console.log('# layout ' + lay.name + ' ' + lay.viewport.width + 'x' + lay.viewport.height + ' (touch)');
    const m = await newPage(browser, { viewport: lay.viewport, hasTouch: true, favs: SEED, bridgeAuto: false });
    r = await m.page.evaluate(async () => {
      App.switchTo('helix'); await new Promise(r => setTimeout(r, 600));
      const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
      const de = document.documentElement, pf = $('#hxd-perform');
      // an element past the right edge is fine inside a strip that scrolls sideways on its own (row picker, footswitch seg); anything else would widen the page
      const scroller = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return p.id || p.className.split(' ')[0]; } return ''; };
      const targets = $$('#hxd-top button, #hxd-perform button, #hxd-perform .hxd-strip').filter(window.__vis).map(e => { const b = e.getBoundingClientRect(); return { id: e.id || e.className.split(' ')[0] + (e.dataset.chip || e.dataset.row || e.dataset.snap || e.dataset.key || e.dataset.fs || e.dataset.mode || ''), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), scroller: scroller(e) }; });
      const small = targets.filter(t => t.h < 40 || t.w < 40), wide = targets.filter(t => t.right > window.innerWidth + 1 && !t.scroller), scrolled = [...new Set(targets.filter(t => t.right > window.innerWidth + 1 && t.scroller).map(t => t.scroller))];
      const snaps = $$('.hxd-snap').map(e => Math.round(e.getBoundingClientRect().height)), tiles = $$('.hxd-tile').map(e => Math.round(e.getBoundingClientRect().height));
      return { mode: SLHelix.mode(), sent: window.__sent.length, scrollW: de.scrollWidth, innerW: window.innerWidth, pfScroll: pf.scrollWidth, pfClient: pf.clientWidth, n: targets.length, small, wide, scrolled,
        cols: getComputedStyle($('.hxd-pingrid')).gridTemplateColumns.split(' ').length, tiles: tiles.length, minSnap: Math.min.apply(null, snaps), minTile: Math.min.apply(null, tiles), big: $$('.hxd-big').filter(window.__vis).map(e => (e.id || 'big') + ':' + Math.round(e.getBoundingClientRect().height)), modeH: Math.round($('#hxd-mode button').getBoundingClientRect().height) };
    });
    ok(r.mode === 'perform' && r.sent === 0 && r.tiles === 2, 'opens on Perform with the two seeded pins, zero bytes');
    ok(r.scrollW <= r.innerW + 1 && r.pfScroll <= r.pfClient + 1 && r.wide.length === 0, 'no horizontal page scroll at ' + lay.viewport.width + ' px: page ' + r.scrollW + '/' + r.innerW + ', grid ' + r.pfScroll + '/' + r.pfClient + (r.scrolled.length ? '; sideways scrollers of their own: ' + r.scrolled.join(', ') : '') + (r.wide.length ? '; OVERFLOWING ' + J(r.wide) : ''));
    ok(r.n > 30 && r.small.length === 0, r.n + ' visible targets all >= 40 px' + (r.small.length ? '; too small: ' + J(r.small.slice(0, 8)) : ''));
    ok(r.cols === lay.cols && r.minSnap >= 44 && r.minTile >= 56 && r.big.every(h => +h.split(':')[1] >= 48) && r.modeH >= 44, 'pin grid ' + r.cols + ' columns (' + lay.cols + '), snaps >= 44 (' + r.minSnap + '), tiles >= 56 (' + r.minTile + '), big buttons >= 48 (' + r.big.join(' ') + '), mode seg ' + r.modeH);
    await tap(m.page, '#hxd-pin'); await wait(m.page, 60);
    r = await m.page.evaluate(() => { const i = document.getElementById('hxd-pname'); const open = window.__sheet().open, fs = i ? parseFloat(getComputedStyle(i).fontSize) : 0, sh = document.getElementById('hxd-sheet'); const card = sh && sh.firstElementChild; const back = SLHelixDeck.onBack(); return { open, fs, bottom: card ? Math.round(window.innerHeight - card.getBoundingClientRect().bottom) : -1, back, closed: !window.__sheet().open, sent: window.__sent.length }; });
    ok(r.open && r.fs >= 16 && r.back === true && r.closed && r.sent === 0, 'the pin sheet opens (inputs ' + r.fs + ' px, no zoom)' + (lay.viewport.width < 700 ? ', docked at the bottom (' + r.bottom + ' px up)' : '') + '; Back closes it: ' + J({ back: r.back, closed: r.closed }));
    ok(m.errs.length === 0 && (await m.page.evaluate(() => window.__dialogs)) === 0, 'no page errors, no dialogs (' + lay.name + ')' + (m.errs.length ? ': ' + m.errs.join(' | ') : ''));
    await m.ctx.close();
  }

  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
