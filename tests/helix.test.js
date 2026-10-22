// Helix Stadium plugin (plugins/helix-stadium.js) against a fake "Helix
// Stadium MIDI" Web MIDI device and a fake bridge (window.WebSocket replaced by
// an in-page stand-in for tools/helix-bridge.js that answers the device's RPCs).
// Covers the page, the SAFETY model merged from null's Helix work (startup
// silence, disarmed refusals, arm, lifecycle disarms, failed-send disarm, safe
// mode off), MIDI bytes going OUT, FAVORITES, read-back + the OBSERVED panel,
// the bridge (product info, active preset, edit buffer -> named blocks, live
// param / bypass writes, change-stream echoes, presets + loading, ★ favorites
// from the Helix's numbering) and PORT ISOLATION (never a MODX / LUMI / loopMIDI
// port).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const PLUGIN = fs.readFileSync(path.join(env.ROOT, 'plugins', 'helix-stadium.js'), 'utf8');
const WRITES = ['/ParamValueSet', '/BlockEnableSet', '/activateSnapshot', '/SetSnapshotName', '/LoadPresetWithCID', '/SavePresetWithCID', '/ModelSet'];

async function newPage(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(([code, outs, ins]) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.lights.on', 'false');
    localStorage.setItem('guitarlab.plugins.list', JSON.stringify([{ id: 'phelix', name: 'helix-stadium', code, on: true, error: '' }]));
    // ---- fake Web MIDI: every byte sent is recorded with the port it went to
    window.__sent = []; window.__sentTo = []; window.__failNext = false;
    const mkOut = (name, i) => ({ id: 'out' + i, name, state: 'connected', send: b => { if (window.__failNext) { window.__failNext = false; throw new Error('port gone'); } window.__sent.push(Array.from(b)); window.__sentTo.push(name); } });
    const mkIn = (name, i) => ({ id: 'in' + i, name, state: 'connected', _fns: [], onmidimessage: null, addEventListener(t, fn) { this._fns.push(fn); }, removeEventListener(t, fn) { this._fns = this._fns.filter(f => f !== fn); } });
    const outputs = outs.map(mkOut), inputs = ins.map(mkIn);
    const access = { inputs: new Map(inputs.map(p => [p.id, p])), outputs: new Map(outputs.map(p => [p.id, p])), sysexEnabled: true, addEventListener() {}, onstatechange: null };
    navigator.requestMIDIAccess = () => Promise.resolve(access);
    window.__recv = (bytes) => inputs.forEach(p => { const ev = { data: new Uint8Array(bytes) }; p._fns.forEach(fn => fn(ev)); if (p.onmidimessage) p.onmidimessage(ev); });
    window.__since = (n) => window.__sent.slice(n);
    // ---- fake bridge: the WebSocket the plugin opens answers like the device
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
      send(s) { const m = JSON.parse(s); window.__net.push(m); if (m.op === 'rpc') setTimeout(() => this._reply(m), 5); if (m.op === 'lookup') { const models = {}; m.models.forEach(id => { models[id] = DEFS[id] || null; }); this._push({ op: 'defs', models }); } }
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
  }, [PLUGIN, opts.outs || ['Helix Stadium MIDI'], opts.ins || ['Helix Stadium MIDI']]);
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && window.SLHelix && App.midi && App.midi.ready);
  return { ctx, page, errs };
}
const J = JSON.stringify;
const net = (page, addr) => page.evaluate((addr) => window.__net.filter(m => m.op === 'rpc' && m.addr === addr).map(m => m.args.slice(1).map(a => a[1])), addr);
const armState = (page) => page.evaluate(() => ({ st: document.getElementById('hx-armst').textContent, msg: document.getElementById('hx-armmsg').textContent, armed: SLHelix.armed }));

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  const { ctx, page, errs } = await newPage(browser);

  console.log('# the page + startup silence');
  const nav = await page.evaluate(async () => {
    App.switchTo('helix');
    await new Promise(r => setTimeout(r, 700));
    return { active: App.active, tab: (document.querySelector('#tabbar .tabbar-btn.active') || {}).textContent, views: [...document.querySelectorAll('#hx-views button')].map(b => b.dataset.view).join(','),
      midi: document.getElementById('hx-midist').textContent, mode: SLHelix.midi.mode, bridge: document.getElementById('hx-brst').textContent, dev: document.getElementById('hx-devst').textContent,
      dest: document.getElementById('hx-dest').textContent, sent: window.__sent.length, writes: window.__net.filter(m => m.op === 'rpc').map(m => m.addr) };
  });
  ok(nav.active === 'helix' && /Helix/.test(nav.tab || ''), 'the Helix page is its own Practice tab: ' + nav.tab);
  ok(nav.views === 'rig,blocks,presets,looper,mixer,monitor', 'six views: ' + nav.views);
  ok(nav.mode === 'web' && /Helix Stadium MIDI/.test(nav.midi), 'found the Helix MIDI port itself: ' + nav.midi);
  ok(/Helix at 10\.0\.0\.5/.test(nav.bridge), 'bridge says the Helix is reachable: ' + nav.bridge);
  ok(/stadium/.test(nav.dev) && /fw 1\.1\.0/.test(nav.dev) && /1A MyVibe/.test(nav.dev), 'product info + active preset resolved: ' + nav.dev.replace(/\s+/g, ' '));
  ok(nav.sent === 0 && !nav.writes.some(a => WRITES.includes(a)), 'startup silence: no MIDI bytes and only read RPCs on open (' + nav.writes.join(' ') + ')');
  ok(/Helix Stadium MIDI · ch 1/.test(nav.dest) && /network 10\.0\.0\.5/.test(nav.dest), 'the destination line names both routes: ' + nav.dest);

  console.log('# safety: disarmed until Arm');
  let a = await armState(page);
  ok(a.st === 'DISARMED' && !a.armed && /disarmed/i.test(a.msg), 'output starts disarmed: ' + a.st + ' / ' + a.msg);
  let r = await page.evaluate(async () => {
    const n = window.__sent.length, k = document.querySelector('.hx-knob[data-k="0"]'), e1 = document.getElementById('hx-exp1');
    document.getElementById('hx-snnext').click();
    k.focus(); k.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    e1.value = '90'; e1.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('hx-go').click();
    await new Promise(r => setTimeout(r, 400));
    return { sent: window.__since(n), knob: k.querySelector('.hx-kv').textContent, exp: e1.value, toast: document.getElementById('hx-toast').textContent, writes: window.__net.filter(m => m.op === 'rpc' && m.addr === '/activateSnapshot').length };
  });
  ok(r.sent.length === 0 && r.writes === 0, 'disarmed: snapshot, knob, pedal and Recall send nothing: ' + J(r.sent));
  ok(r.knob === '64' && r.exp === '0', 'refused controls snap back (knob 64, EXP 1 at 0): ' + r.knob + ' / ' + r.exp);
  ok(/disarmed/i.test(r.toast) && /Nothing was sent/.test(r.toast), 'the page says why: ' + r.toast);
  await page.evaluate(() => document.getElementById('hx-arm').click());
  a = await armState(page);
  ok(a.st === 'ARMED' && a.armed, 'Arm output arms it: ' + a.st);

  console.log('# MIDI out');
  r = await page.evaluate(async () => {
    const n = window.__sent.length;
    document.getElementById('hx-prog').value = '5'; document.getElementById('hx-prog').dispatchEvent(new Event('change'));
    document.getElementById('hx-setlist').value = '1'; document.getElementById('hx-setlist').dispatchEvent(new Event('change'));
    document.getElementById('hx-go').click();
    await new Promise(r => setTimeout(r, 120));
    return { lab: document.getElementById('hx-proglab').textContent, bytes: document.getElementById('hx-bytes').textContent, sent: window.__since(n) };
  });
  ok(J(r.sent) === J([[0xB0, 32, 1], [0xC0, 4]]) && r.lab === '2A', 'Recall = CC32 setlist then Program Change (preset 5 = 2A): ' + J(r.sent));
  ok(r.bytes === 'sends B0 20 01 / C0 04', 'the byte preview shows what Recall sends: ' + r.bytes);
  r = await page.evaluate(() => { const n = window.__sent.length; const k = document.querySelector('.hx-knob[data-k="0"]'); k.focus(); k.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); k.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true })); return { sent: window.__since(n), shown: k.querySelector('.hx-kv').textContent }; });
  ok(J(r.sent) === J([[0xB0, 38, 65], [0xB0, 38, 75]]) && r.shown === '75', 'Knob 1 arrows send CC38: ' + J(r.sent));
  r = await page.evaluate(() => { const n = window.__sent.length; document.getElementById('hx-snnext').click(); document.getElementById('hx-tap').click(); document.getElementById('hx-tunerbtn').click(); document.querySelector('#hx-fsmode [data-fs="3"]').click(); document.querySelector('#hx-btns [data-btn="24"]').click(); return window.__since(n); });
  ok(J(r) === J([[0xB0, 69, 8], [0xB0, 64, 127], [0xB0, 9, 34], [0xB0, 37, 3], [0xB0, 9, 24]]), 'snapshot next / tap / tuner / footswitch mode / Mute all: ' + J(r));
  r = await page.evaluate(() => { const n = window.__sent.length; SLHelix.showView('looper'); document.querySelector('[data-lp="58:127"]').click(); document.querySelector('[data-lp="59:0"]').click(); document.getElementById('hx-song').value = '3'; document.getElementById('hx-songgo').click(); return window.__since(n); });
  ok(J(r) === J([[0xB0, 58, 127], [0xB0, 59, 0], [0xB0, 10, 2]]), 'looper record / stop + song cue: ' + J(r));
  r = await page.evaluate(() => { const n = window.__sent.length; SLHelix.showView('mixer'); document.querySelector('#hx-layers [data-layer="xlr"]').click(); document.querySelector('[data-mixt="m11"]').click(); const lv = document.querySelector('[data-mix="l12"]'); lv.value = 90; lv.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('hx-clearsolo').click(); return window.__since(n); });
  ok(J(r) === J([[0xB3, 57, 127], [0xB3, 12, 90], [0xB3, 103, 127]]), 'mixer on the XLR layer (ch 4): mute Home, Path 1A level, clear solos: ' + J(r));
  r = await page.evaluate(() => { SLHelix.showView('rig'); const n = window.__sent.length; document.getElementById('hx-sname').value = 'Drive'; document.getElementById('hx-scc').value = '20'; document.getElementById('hx-sadd').click(); document.querySelector('[data-stog="0"]').click(); document.querySelector('[data-stog="0"]').click(); return { sent: window.__since(n), stored: App.store.get('hx.ccs') }; });
  ok(J(r.sent) === J([[0xB1, 20, 127], [0xB1, 20, 0]]) && r.stored.length === 1 && r.stored[0].cc === 20, 'a Bypass/Control stomp toggles CC20 on channel 2 and is stored: ' + J(r.sent));

  console.log('# favorites (null\'s recall profile)');
  r = await page.evaluate(async () => {
    const n = window.__sent.length, set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change')); };
    set('hx-setlist', '2'); set('hx-prog', '10'); set('hx-snapafter', '2');
    const bytes = document.getElementById('hx-bytes').textContent;
    document.getElementById('hx-favname').value = 'Verse';
    document.getElementById('hx-favsave').click();
    await new Promise(r => setTimeout(r, 50));
    return { bytes, sent: window.__since(n), favs: App.store.get('hx.favs'), list: [...document.querySelectorAll('.hx-fav')].map(e => e.textContent) };
  });
  ok(r.bytes === 'sends B0 20 02 / C0 09 / B0 45 02', 'the preview adds the snapshot CC: ' + r.bytes);
  ok(r.sent.length === 0 && r.favs.length === 1 && r.favs[0].bank === 2 && r.favs[0].prog === 9 && r.favs[0].snap === 2, 'saving a favorite stores the address and sends nothing: ' + J(r.favs));
  ok(/Verse/.test(r.list[0]) && /CC32 2 · PC 9 = User 35B · then snapshot 3/.test(r.list[0]), 'the favorite reads in the Helix\'s own numbering: ' + r.list[0]);
  r = await page.evaluate(async () => {
    const n = window.__sent.length;
    document.querySelector('[data-act="recall"]').click();
    await new Promise(r => setTimeout(r, 500));
    return { sent: window.__since(n), snap: (document.querySelector('.hx-snap.active') || {}).dataset.snap };
  });
  ok(J(r.sent) === J([[0xB0, 32, 2], [0xC0, 9], [0xB0, 69, 2]]) && r.snap === '2', 'Recall sends CC32, PC, then the snapshot after the preset change: ' + J(r.sent));
  r = await page.evaluate(async () => {
    const n = window.__sent.length;
    document.querySelector('[data-act="edit"]').click();
    const form = { name: document.getElementById('hx-favname').value, btn: document.getElementById('hx-favsave').textContent, cancel: !document.getElementById('hx-favcancel').hidden };
    document.getElementById('hx-favname').value = 'Verse 2'; document.getElementById('hx-favsave').click();
    const afterEdit = App.store.get('hx.favs').map(f => f.name);
    document.querySelector('[data-act="del"]').click();
    return { form, afterEdit, afterDel: App.store.get('hx.favs').length, sent: window.__since(n) };
  });
  ok(r.form.name === 'Verse' && /Update/.test(r.form.btn) && r.form.cancel && J(r.afterEdit) === J(['Verse 2']), 'Edit loads the favorite and Update replaces it in place: ' + J(r.afterEdit));
  ok(r.afterDel === 0 && r.sent.length === 0, 'editing and removing send nothing');

  console.log('# MIDI in: read-back + observed (null\'s Stadium Local Control)');
  r = await page.evaluate(async () => {
    window.__recv([0xF8]); window.__recv([0xF8]); window.__recv([0xF8]);
    window.__recv([0xC0, 9]); window.__recv([0xB0, 69, 5]); window.__recv([0xB0, 39, 12]);
    SLHelix.showView('monitor');
    await new Promise(r => setTimeout(r, 300));
    return { prog: document.getElementById('hx-prog').value, snap: (document.querySelector('.hx-snap.active') || {}).dataset.snap, knob2: document.querySelector('.hx-knob[data-k="1"] .hx-kv').textContent,
      obs: [...document.querySelectorAll('.hx-orow')].map(e => e.textContent), count: document.getElementById('hx-obscount').textContent,
      clockRows: [...document.querySelectorAll('.hx-mrow')].filter(e => /Clock/.test(e.textContent)).length };
  });
  ok(r.prog === '10' && r.snap === '5' && r.knob2 === '12', 'Program Change, CC69 and CC39 from the pedal move the page: ' + J({ prog: r.prog, snap: r.snap, knob2: r.knob2 }));
  ok(r.obs.length === 3 && r.obs.some(t => /ch1 PC.*Preset.*9 \(3B\)/.test(t)) && r.obs.some(t => /ch1 CC 69.*Snapshot.*5/.test(t)) && r.obs.some(t => /ch1 CC 39.*Knob 2.*12/.test(t)), 'Observed lists the newest value per message, named: ' + J(r.obs));
  ok(/6 messages received · 3 clock ticks/.test(r.count) && r.clockRows === 0, 'clock is counted, not flooded into the monitor: ' + r.count);

  console.log('# bridge: edit buffer -> blocks');
  r = await page.evaluate(() => { SLHelix.showView('blocks'); return { n: document.querySelectorAll('.hx-block').length, names: [...document.querySelectorAll('.hx-bname')].map(e => e.textContent).join('|'), cats: [...document.querySelectorAll('.hx-cat')].map(e => e.textContent).join('|'), byp: [...document.querySelectorAll('.hx-block.byp')].map(e => e.dataset.b).join('|'), snaps: [...document.querySelectorAll('.hx-snap span')].map(e => e.textContent).join('|') }; });
  ok(r.n === 3 && r.names === 'Inst1|Pan Vol|Deluxe Comp' && r.cats === 'Input|Vol|Dyn', 'three blocks named from the defs: ' + r.names + ' / ' + r.cats);
  ok(r.byp === '0:2', 'the bypassed block is marked: ' + r.byp);
  ok(r.snaps === 'SNAPSHOT 1||Lead|||||', 'snapshot names mapped by their own index (si__): ' + r.snaps);
  await page.evaluate(() => SLHelix.arm());
  r = await page.evaluate(async () => {
    document.querySelector('.hx-block[data-b="0:1"]').click();
    const row = document.querySelector('.hx-param[data-pid="1"]'), inp = row.querySelector('input');
    inp.value = '0.7'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 120));
    document.querySelector('[data-ptog="2"]').click();
    await new Promise(r => setTimeout(r, 120));
    return { names: [...document.querySelectorAll('.hx-pname')].map(e => e.textContent).join('|'), pv: row.querySelector('.hx-pv').textContent };
  });
  let writes = await net(page, '/ParamValueSet');
  ok(r.names === 'Pedal|VolumeTaper' && r.pv === '70%', 'the block’s params show with names and formatted values: ' + r.names + ' ' + r.pv);
  ok(J(writes) === J([[0, 1, 0, 1, 0.7, -1], [0, 1, 0, 2, 0, -1]]), '/ParamValueSet [path, slot, 0, pid, value, -1] for the slider and the switch: ' + J(writes));
  r = await page.evaluate(async () => { document.querySelector('[data-byp="0:2"]').click(); await new Promise(r => setTimeout(r, 60)); return document.querySelectorAll('.hx-block.byp').length; });
  writes = await net(page, '/BlockEnableSet');
  ok(J(writes) === J([[0, 2, 1]]) && r === 0, 'the bypass dot sends /BlockEnableSet [path, slot, 1]: ' + J(writes));
  r = await page.evaluate(async () => {
    window.__ws._push({ op: 'msg', port: 2001, addr: '/setParamValue', tags: 'iiiiiif', args: [-1, 1, 0, 1, 0, 1, 0.8] });
    window.__ws._push({ op: 'msg', port: 2001, addr: '/setBlockEnable', tags: 'iiiii', args: [-1, 2, 0, 2, 0] });
    window.__ws._push({ op: 'msg', port: 2001, addr: '/activateSnapshot', tags: 'iii', args: [-1, -1, 2] });
    await new Promise(r => setTimeout(r, 300));
    return { pv: document.querySelector('.hx-param[data-pid="1"] .hx-pv').textContent, byp: [...document.querySelectorAll('.hx-block.byp')].map(e => e.dataset.b).join('|'), snap: (document.querySelector('.hx-snap.active') || {}).dataset.snap };
  });
  ok(r.pv === '80%' && r.byp === '0:2' && r.snap === '2', 'change-stream echoes (param, bypass, snapshot) update the page: ' + J(r));
  r = await page.evaluate(async () => { const n = window.__net.length; document.querySelector('[data-snap="4"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); document.querySelector('[data-snap="4"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await new Promise(r => setTimeout(r, 50)); return window.__net.slice(n).filter(m => m.op === 'rpc').map(m => m.addr + ' ' + m.args[1][1]); });
  ok(J(r) === J(['/activateSnapshot 4']), 'a snapshot tap goes over the bridge when it is up: ' + J(r));

  console.log('# bridge: presets + ★ favorites from the Helix\'s numbering');
  await page.evaluate(() => SLHelix.arm());
  r = await page.evaluate(async () => {
    SLHelix.showView('presets'); await new Promise(r => setTimeout(r, 400));
    const rows = [...document.querySelectorAll('.hx-preset')];
    const chips = [...document.querySelectorAll('#hx-conts .chip')].map(c => c.textContent).join('|');
    const stars = document.querySelectorAll('.hx-star').length;
    rows[1].click(); await new Promise(r => setTimeout(r, 80));
    document.querySelector('[data-star="226"]').click();
    document.querySelector('#hx-conts [data-cont="241"]').click(); await new Promise(r => setTimeout(r, 400));
    const setlistRows = [...document.querySelectorAll('.hx-preset')].map(x => x.textContent).join('|');
    document.querySelector('[data-star="242"]').click();
    return { chips, stars, rows: rows.map(x => x.textContent).join('|'), active: rows.map(x => x.classList.contains('active')).join(','), setlistRows, favs: App.store.get('hx.favs').map(f => [f.name, f.bank, f.prog, f.cid]) };
  });
  const loads = await net(page, '/LoadPresetWithCID');
  ok(r.chips === 'Factory|User|Bebop Festival' && r.rows === "1AMyVibe9 blocks|1BStop Draggin'2 blocks" && r.active === 'true,false', 'containers + user presets listed, the active one marked: ' + r.rows);
  ok(J(loads) === J([[226]]), 'tapping a preset loads it by cid (after a confirm): ' + J(loads));
  ok(r.setlistRows === '1AMyVibe', 'a setlist lists its references: ' + r.setlistRows);
  ok(r.stars === 2 && J(r.favs) === J([["Stop Draggin'", 1, 1, 226], ['MyVibe', 5, 0, 216]]), '★ saves the MIDI address from the Helix\'s numbering (User 1B = CC32 1 PC 1; setlist 1 = CC32 5) with its cid: ' + J(r.favs));

  console.log('# lifecycle disarms + failed send + safe mode');
  await page.evaluate(() => SLHelix.arm());
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  a = await armState(page);
  ok(!a.armed && /focus/i.test(a.msg), 'switching windows disarms: ' + a.msg);
  await page.evaluate(() => SLHelix.arm());
  a = await page.evaluate(async () => { App.switchTo('quiz'); await new Promise(r => setTimeout(r, 100)); const off = !SLHelix.armed; App.switchTo('helix'); await new Promise(r => setTimeout(r, 300)); return { off, st: document.getElementById('hx-armst').textContent, msg: document.getElementById('hx-armmsg').textContent }; });
  ok(a.off && a.st === 'DISARMED' && /Press Arm/.test(a.msg), 'leaving the page disarms, and coming back starts disarmed: ' + a.msg);
  r = await page.evaluate(async () => { SLHelix.arm(); const n = window.__sent.length; window.__failNext = true; document.getElementById('hx-tap').click(); const after = SLHelix.armed; return { sent: window.__since(n), after, msg: document.getElementById('hx-armmsg').textContent }; });
  ok(r.sent.length === 0 && !r.after && /send failed/i.test(r.msg), 'a failed send disarms: ' + r.msg);
  r = await page.evaluate(async () => { const s = document.getElementById('hx-safe'); s.checked = false; s.dispatchEvent(new Event('change')); const n = window.__sent.length; document.getElementById('hx-tap').click(); return { sent: window.__since(n), st: document.getElementById('hx-armst').textContent, armHidden: document.getElementById('hx-arm').hidden, stored: App.store.get('hx.safe') }; });
  ok(J(r.sent) === J([[0xB0, 64, 127]]) && r.st === 'SAFE MODE OFF' && r.armHidden && r.stored === false, 'safe mode off (after a confirm) sends without arming: ' + J(r));

  console.log('# monitor + hygiene');
  r = await page.evaluate(() => { SLHelix.showView('monitor'); return { rows: document.querySelectorAll('.hx-mrow').length, midi: document.querySelectorAll('.hx-mrow.midi').length, net: document.querySelectorAll('.hx-mrow.net').length }; });
  ok(r.rows > 10 && r.midi > 0 && r.net > 0, 'the monitor logged both MIDI and network traffic: ' + J(r));
  ok(PLUGIN.length < 100 * 1024, 'plugin stays under the 100 KB cap (' + PLUGIN.length + ' chars)');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# port isolation: never a MODX, LUMI or loopMIDI port');
  const iso = await newPage(browser, { outs: ['MODX-1', 'LUMI Keys BLOCK', 'loopMIDI Helix'], ins: ['MODX-1'] });
  r = await iso.page.evaluate(async () => {
    App.switchTo('helix'); await new Promise(r => setTimeout(r, 600));
    SLHelix.arm();
    document.getElementById('hx-tap').click(); document.getElementById('hx-snnext').click(); document.getElementById('hx-go').click();
    await new Promise(r => setTimeout(r, 200));
    return { mode: SLHelix.midi.mode, appOut: App.midi.outputName, sentTo: window.__sentTo.filter(n => !/^$/.test(n)), status: document.getElementById('hx-midist').textContent,
      allow: [SLHelix.isHelix({ name: 'Helix Stadium MIDI' }), SLHelix.isHelix({ name: 'loopMIDI Helix' }), SLHelix.isHelix({ name: 'Helix MODX virtual' }), SLHelix.isHelix({ name: 'LUMI Keys BLOCK' })] };
  });
  ok(r.mode === 'none' && /no Helix Stadium MIDI port/.test(r.status), 'with no Helix port the plugin has no MIDI route (soundLAB\'s output is ' + r.appOut + '): ' + r.status);
  ok(!r.sentTo.some(n => /MODX|LUMI|loopMIDI/.test(n)), 'nothing reached the MODX, the LUMI or the loopMIDI port: ' + J(r.sentTo));
  ok(J(r.allow) === J([true, false, false, false]), 'allow-list: Helix Stadium MIDI yes; loopMIDI / MODX / LUMI names no: ' + J(r.allow));
  ok(iso.errs.length === 0, 'no page errors (isolation)' + (iso.errs.length ? ': ' + iso.errs.join(' | ') : ''));
  await iso.ctx.close();

  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
