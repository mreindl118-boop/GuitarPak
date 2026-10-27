// The CONTROLLER REMOTE core (js/remote.js + App.remoteAction in app.js +
// the input claim in midi.js): Learn in Settings › Hands-free control (a CC
// press, a Program Change, a note or a key; Escape / leaving cancels), the
// bound message CLAIMED before every listener (no 'midi:raw', no 'midi:note',
// only 'midi:remote'), press edges (release ignored; latching = every
// change), debounce, port and channel matching, the page-turner keys
// (off by default; preventDefault; never while typing), the reserved
// double-tap key on pages that allow it, routing (help tour first, a sheet
// folds away, Settings = a test that says it works, a page's onRemote and its
// label, 'nothing here' toast), the HUD, and the Android bridge path.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const J = JSON.stringify;

async function newPage(browser, seed, native) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(([seed, native]) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.lights.on', 'false');
    for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
    window.__wait = ms => new Promise(r => setTimeout(r, ms));
    window.__q = s => document.querySelector(s);
    window.__raw = []; window.__notes = []; window.__remote = []; window.__ev = [];
    if (native) {
      window.SoundLabMidi = { post: j => { const m = JSON.parse(j);
        if (m.cmd === 'init') setTimeout(() => window.__glMIDI.onports({ inputs: [{ id: 7, name: 'LUMI Keys BLOCK' }, { id: 8, name: 'MODX-1' }], outputs: [{ id: 8, name: 'MODX-1' }] }), 0); } };
      window.__send = (b, port) => window.__glMIDI.onmidi(port === 'li' ? 7 : 8, b);
    } else {
      const lumi = { id: 'li', name: 'LUMI Keys BLOCK', state: 'connected', onmidimessage: null };
      const modx = { id: 'mi', name: 'MODX-1', state: 'connected', onmidimessage: null };
      const out = { id: 'mo', name: 'MODX-1', state: 'connected', send() {} };
      navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map([['li', lumi], ['mi', modx]]), outputs: new Map([['mo', out]]), sysexEnabled: true, onstatechange: null });
      window.__send = (b, port) => { const p = port === 'li' ? lumi : modx; if (p.onmidimessage) p.onmidimessage({ data: new Uint8Array(b) }); };
    }
    window.__cc = (n, v, ch, port) => __send([0xB0 | (ch || 0), n, v], port);
    window.__press = (n, port, ch) => { __cc(n, 127, ch, port); __cc(n, 0, ch, port); };
    window.__key = (key, code, target) => { const e = new KeyboardEvent('keydown', { key, code: code || key, bubbles: true, cancelable: true }); (target || document.body).dispatchEvent(e); return e.defaultPrevented; };
    window.__toast = () => { const t = document.getElementById('app-toast'); return t && !t.hidden ? t.textContent : ''; };
    window.__hud = () => { const h = document.getElementById('remote-hud'); return h && h.classList.contains('show') ? h.textContent : ''; };
    window.__clearToast = () => { const t = document.getElementById('app-toast'); if (t) t.hidden = true; };
    window.addEventListener('DOMContentLoaded', () => {
      App.on('midi:raw', d => __raw.push(d.bytes.join(' ')));
      App.on('midi:note', d => __notes.push((d.on ? 'on ' : 'off ') + d.midi));
      App.on('midi:remote', d => __remote.push(d.bytes.join(' ')));
      App.on('remote', d => __ev.push(d.action + ':' + d.via + ':' + (d.handled ? 1 : 0) + (d.test ? ':test' : '')));
    });
  }, [seed || {}, !!native]);
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.active === 'quiz' && App.remote);
  // a test page that records what reaches it (addPage = the plugin page API)
  await page.evaluate(() => {
    window.__rm = []; window.__rmKey = true;
    App.addPage('rmtest', 'RM test', 'practice', { init: function () {}, remoteKey: function () { return window.__rmKey; },
      onRemote: function (a, info) { window.__rm.push(a + ':' + info.via); if (a === 'back' && window.__rmSay) App.toast(window.__rmSay); return a === 'back' ? false : a === 'stop' ? 'Halted' : true; } });
  });
  return { ctx, page, errs };
}
const BOUND = { next: { midi: { t: 'cc', n: 86, ch: null, port: 'MODX-1' }, key: null }, back: { midi: { t: 'pc', n: 4, ch: null, port: '' }, key: null }, stop: { midi: { t: 'note', n: 108, ch: null, port: '' }, key: { code: 'KeyQ', key: 'q' } } };

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM });

  console.log('# Learn in Settings › Hands-free control');
  let { ctx, page, errs } = await newPage(browser);
  const ln = await page.evaluate(async () => {
    App.switchTo('settings'); await __wait(250);
    const o = { rows: Array.from(document.querySelectorAll('#set-remote .rm-row')).map(r => r.dataset.rm).join(','), notSet: __q('.rm-row[data-rm="next"] .rm-what').textContent };
    __q('[data-rmlearn="next"]').click(); await __wait(30);
    o.listening = __q('[data-rmlearn="next"]').textContent + '|' + __q('[data-rmlearn="next"]').getAttribute('aria-pressed') + '|' + App.remote.learning;
    __cc(86, 0); await __wait(20); o.afterRelease = App.remote.learning; // a release is not a press
    __cc(1, 127); __cc(1, 0); await __wait(20); // the mod wheel is a CC press too: learn takes the first press
    o.learned = J(App.remote.map.next.midi); o.toast = __toast(); o.what = __q('.rm-row[data-rm="next"] .rm-what').textContent;
    o.raw = __raw.slice(); o.remote = __remote.slice();
    // learn again (moves a duplicate away from another action), a key this time
    __q('[data-rmlearn="back"]').click(); await __wait(20);
    __key('PageUp', 'PageUp'); await __wait(20);
    o.backKey = J(App.remote.map.back.key);
    __q('[data-rmlearn="stop"]').click(); await __wait(20);
    __key('Escape'); await __wait(20); o.esc = App.remote.learning; o.escToast = __toast();
    __q('[data-rmlearn="stop"]').click(); await __wait(20);
    App.switchTo('quiz'); await __wait(150); o.leave = App.remote.learning;
    // a note and a Program Change can be learned as well
    App.switchTo('settings'); await __wait(150);
    __q('[data-rmlearn="stop"]').click(); __send([0x90, 108, 90]); __send([0x80, 108, 0]); await __wait(20);
    o.note = J(App.remote.map.stop.midi); o.noteNotes = __notes.filter(n => /108/.test(n)).length;
    __q('[data-rmlearn="back"]').click(); __send([0xC0, 4]); await __wait(20); o.pc = J(App.remote.map.back.midi);
    o.clearBtn = !__q('[data-rmclear="next"]').hidden;
    __q('[data-rmclear="next"]').click(); await __wait(20); o.cleared = J(App.remote.map.next);
    return o;
    function J(x) { return JSON.stringify(x); }
  });
  ok(ln.rows === 'next,back,stop' && ln.notSet === 'Not set', 'three rows, nothing set by default');
  ok(/Listening/.test(ln.listening) && /\|true\|next$/.test(ln.listening) && ln.afterRelease === 'next', 'Learn listens (aria-pressed) and a release alone is not taken: ' + ln.listening);
  ok(/"t":"cc","n":1,"ch":0,"port":"MODX-1"/.test(ln.learned) && /Next = CC 1/.test(ln.toast) && /CC 1 · ch 1 · MODX-1/.test(ln.what), 'the first CC press is learned with channel and port: ' + ln.learned);
  ok(ln.raw.length === 0 && ln.remote.join('|') === '176 86 0|176 1 127|176 1 0', 'the stray release, the learning press and its release reach no listener (only midi:remote): ' + J(ln.remote));
  ok(/"code":"PageUp"/.test(ln.backKey), 'a key (page turner) can be learned: ' + ln.backKey);
  ok(ln.esc === null && /cancelled/.test(ln.escToast) && ln.leave === null, 'Escape and leaving Settings cancel Learn');
  ok(/"t":"note","n":108/.test(ln.note) && ln.noteNotes === 0, 'a key on the keyboard can be learned and is not played while learning: ' + ln.note);
  ok(/"t":"pc","n":4/.test(ln.pc), 'a Program Change can be learned: ' + ln.pc);
  ok(ln.clearBtn && ln.cleared === '{"midi":null,"key":null}', 'Clear empties the action');
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  console.log('# bound gestures: claimed, press edges, ports, channels, routing');
  ({ ctx, page, errs } = await newPage(browser, { 'remote.map': BOUND }));
  const bd = await page.evaluate(async () => {
    const o = {};
    App.switchTo('rmtest'); await __wait(200);
    __raw.length = 0; __rm.length = 0;
    __press(86); await __wait(30);
    o.rm = __rm.slice(); o.raw = __raw.length; o.hud = __hud(); o.hudRole = __q('#remote-hud').getAttribute('role');
    __press(86); await __wait(30); o.debounced = __rm.length; // within 250 ms
    await __wait(260); __cc(86, 100); __cc(86, 110); await __wait(20); o.held = __rm.length; // one press edge, not two
    __cc(86, 0); await __wait(260);
    __cc(86, 127, 0, 'li'); await __wait(20); o.otherPort = __rm.length + '|' + __raw.filter(b => b === '176 86 127').length; // another port: not ours
    __cc(86, 127, 5); __cc(86, 0, 5); await __wait(20); o.anyCh = __rm.length; // any channel
    await __wait(260); __send([0xC0, 4]); await __wait(20); o.pc = __rm.slice(-1)[0] + '|' + __toast(); // back -> page says false -> toast
    __send([0x90, 108, 100]); await __wait(20); __send([0x80, 108, 0]); await __wait(20);
    o.note = __rm.slice(-1)[0] + '|' + __hud() + '|' + __notes.filter(n => /108/.test(n)).length;
    await __wait(260); o.keyQ = __key('q', 'KeyQ'); await __wait(20); o.keyRm = __rm.slice(-1)[0];
    __raw.length = 0; __press(20); await __wait(20); o.unbound = __raw.length; // an unbound CC passes untouched
    return o;
  });
  ok(bd.rm.join() === 'next:cc' && bd.raw === 0 && /Next/.test(bd.hud) && bd.hudRole === 'status', 'a learned CC press fires NEXT on the page, never reaches midi:raw, the HUD says Next: ' + J(bd));
  ok(bd.debounced === 1 && bd.held === 2, 'a quick double press is debounced; a held value above 64 is one press');
  ok(bd.otherPort === '2|1', 'the same CC from another connected port is not claimed and fires nothing');
  ok(bd.anyCh === 3, 'channel "any" matches every channel');
  ok(/^back:pc\|Nothing to go back/.test(bd.pc), 'a Program Change fires BACK; a page that returns false gets the "nothing here" toast: ' + bd.pc);
  ok(/^stop:note\|.*Halted\|0$/.test(bd.note), 'a bound key fires STOP, the page label shows in the HUD, the note never plays: ' + bd.note);
  ok(bd.keyQ === true && bd.keyRm === 'stop:key', 'a learned key fires and its default is prevented');
  ok(bd.unbound === 2, 'unbound CCs pass through to midi:raw untouched');

  const lt = await page.evaluate(async () => {
    App.remote.setLatch('next', true); await __wait(270); __rm.length = 0;
    __cc(86, 127); await __wait(270); __cc(86, 0); await __wait(20);
    return __rm.length;
  });
  ok(lt === 2, 'latching: the press and the next switch-off both fire');

  const rt = await page.evaluate(async () => {
    const o = {};
    // a sheet folds away and the page gets the action
    await __wait(270); App.openSheet('metronome'); await __wait(80);
    App.remote.fire('next', 'test'); await __wait(30); o.sheet = App.sheet + '|' + __rm.slice(-1)[0];
    // the help tour takes it first
    await __wait(270); window.Help.open('quiz'); await __wait(80);
    const step0 = __q('.hp-card, #hp-card') ? (__q('.hp-card, #hp-card').textContent || '').slice(0, 30) : '';
    App.remote.fire('next', 'test'); await __wait(80);
    const step1 = __q('.hp-card, #hp-card') ? (__q('.hp-card, #hp-card').textContent || '').slice(0, 30) : '';
    o.tourMoved = step0 !== step1; await __wait(270);
    App.remote.fire('stop', 'test'); await __wait(80); o.tourClosed = !window.Help.isOpen();
    // a page that says its own reason keeps it (no 'nothing here' on top)
    App.switchTo('rmtest'); await __wait(150); window.__rmSay = 'Load a song first'; await __wait(270);
    o.own = App.remote.fire('back', 'test') + '|' + __toast(); window.__rmSay = '';
    // owns(): the bound gestures, for pages that read a port themselves
    o.owns = App.remote.owns([0xB0, 86, 127], { port: 'MODX-1' }) + '|' + App.remote.owns([0xB0, 86, 127], { port: 'LUMI Keys BLOCK' }) + '|' + App.remote.owns([0x90, 108, 1], {}) + '|' + App.remote.owns([0x90, 60, 1], {});
    // a page without onRemote
    App.switchTo('chords'); await __wait(200); __clearToast(); await __wait(270);
    o.none = App.remote.fire('next', 'test') + '|' + __toast();
    // Settings: a press is a test that says it works
    App.switchTo('settings'); await __wait(200); await __wait(270);
    o.settings = App.remote.fire('next', 'test') + '|' + __hud() + '|' + __ev.slice(-1)[0];
    return o;
  });
  ok(rt.sheet === 'null|next:test', 'an open sheet closes and the page gets NEXT: ' + rt.sheet);
  ok(rt.tourMoved && rt.tourClosed, 'a help tour takes Next (next step) and Stop (closes) first');
  ok(rt.none === 'false|Nothing to move on here', 'a page without onRemote: the "nothing here" toast');
  ok(rt.own === 'false|Load a song first', 'a page that toasted its own reason keeps it: ' + rt.own);
  ok(rt.owns === 'true|false|true|false', 'owns() knows the bound gestures, port-aware: ' + rt.owns);
  ok(/^settings\|.*Next works\|next:test:0:test$/.test(rt.settings), 'in Settings a press only shows that it works: ' + rt.settings);
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  console.log('# page turner keys');
  ({ ctx, page, errs } = await newPage(browser));
  const pt = await page.evaluate(async () => {
    const o = {};
    App.switchTo('rmtest'); await __wait(200); __rm.length = 0;
    o.offPrevented = __key('PageDown'); o.off = __rm.length;
    App.remote.setPageTurner(true);
    o.onPrevented = __key('PageDown'); await __wait(270);
    __key('ArrowLeft'); await __wait(270); __key('ArrowDown'); await __wait(20);
    o.on = __rm.slice();
    const inp = document.createElement('input'); document.body.appendChild(inp); inp.focus();
    await __wait(270); o.typing = __key('PageDown', 'PageDown', inp) + '|' + __rm.length; inp.remove();
    // a picker left focused (a select after a tap): the pedal wins, the value stays, focus lets go
    const sel = document.createElement('select'); sel.innerHTML = '<option>a</option><option>b</option>'; document.body.appendChild(sel); sel.focus();
    await __wait(270); o.select = __key('ArrowDown', 'ArrowDown', sel) + '|' + __rm.length + '|' + sel.value + '|' + (document.activeElement === sel); sel.remove();
    const r = new KeyboardEvent('keydown', { key: 'PageDown', code: 'PageDown', repeat: true, bubbles: true, cancelable: true });
    await __wait(270); document.body.dispatchEvent(r); o.repeat = __rm.length + '|' + r.defaultPrevented;
    return o;
  });
  ok(pt.offPrevented === false && pt.off === 0, 'off by default: Page Down still scrolls');
  ok(pt.onPrevented === true && pt.on.join() === 'next:key,back:key,next:key', 'page turner on: Page Down / Down = Next, Left = Back, scrolling prevented: ' + pt.on.join());
  ok(pt.typing === 'false|3', 'never while typing in a field');
  ok(pt.select === 'true|4|a|false', 'a focused select: the page turner advances, the select keeps its value and lets go of focus: ' + pt.select);
  ok(pt.repeat === '4|true', 'a held key repeats nothing (but still does not scroll)');
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  console.log('# double-tap the lowest key (opt-in, pages that allow it)');
  ({ ctx, page, errs } = await newPage(browser, { 'remote.dbl': true }));
  const dt = await page.evaluate(async () => {
    const o = {}, lo = App.midi.range().lo;
    o.lo = lo;
    App.switchTo('rmtest'); await __wait(200); __rm.length = 0; __notes.length = 0; __raw.length = 0;
    __send([0x90, lo, 90], 'li'); __send([0x80, lo, 0], 'li'); await __wait(500);
    o.single = __rm.length + '|' + __notes.length + '|' + __raw.length; // one strike: reserved, silent, nothing fires
    __send([0x90, lo, 90], 'li'); __send([0x80, lo, 0], 'li'); await __wait(60);
    __send([0x90, lo, 90], 'li'); __send([0x80, lo, 0], 'li'); await __wait(30);
    o.dbl = __rm.slice() + '|' + __notes.length;
    __send([0x90, lo, 90]); __send([0x80, lo, 0]); await __wait(20); o.modx = __notes.length; // from the MODX (a LUMI is connected): a real note
    __send([0x90, lo + 2, 90], 'li'); __send([0x80, lo + 2, 0], 'li'); await __wait(20); o.other = __notes.length; // other LUMI keys play
    window.__rmKey = false; __notes.length = 0; await __wait(400);
    __send([0x90, lo, 90], 'li'); __send([0x80, lo, 0], 'li'); await __wait(60); __send([0x90, lo, 90], 'li'); __send([0x80, lo, 0], 'li'); await __wait(30);
    o.notAllowed = __notes.length + '|' + __rm.length;
    // a key held from before the page allowed it: its release still reaches the app
    __send([0x90, lo, 90], 'li'); await __wait(10); window.__rmKey = true; __send([0x80, lo, 0], 'li'); await __wait(20);
    o.release = __notes.slice(-1)[0];
    App.remote.setDoubleTap(false); window.__rmKey = true; __notes.length = 0; await __wait(400);
    __send([0x90, lo, 90], 'li'); __send([0x80, lo, 0], 'li'); await __wait(20); o.offSwitch = __notes.length;
    return o;
  });
  ok(dt.single === '0|0|0', 'one strike on the reserved key: silent, not a note, nothing fires: ' + dt.single);
  ok(dt.dbl === 'next:dbltap|0', 'two strikes within 350 ms = NEXT (via dbltap), still no notes: ' + dt.dbl);
  ok(dt.modx === 2 && dt.other === 4, 'with a LUMI connected only the LUMI’s key is reserved; other keys play');
  ok(dt.notAllowed === '4|1', 'on a page that does not allow it (remoteKey false) the key plays and nothing fires');
  ok(dt.release === 'off ' + dt.lo, 'the release of a note that already sounded is never swallowed');
  ok(dt.offSwitch === 2, 'switch off: the key is a normal key again');
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  console.log('# one keyboard chosen as the input: the remote still hears the other ports');
  ({ ctx, page, errs } = await newPage(browser, { 'remote.map': BOUND, 'midi.inputId': 'li', 'midi.allIn.v1': true }));
  const sp = await page.evaluate(async () => {
    const o = {};
    App.switchTo('rmtest'); await __wait(200); __rm.length = 0; __raw.length = 0; __notes.length = 0;
    o.input = App.midi.inputId;
    __press(86); await __wait(30); o.pedal = __rm.join() + '|' + __raw.length; // CC 86 from the MODX (not the chosen input)
    __send([0x90, 60, 90]); __send([0x80, 60, 0]); __press(20); await __wait(20);
    o.otherStill = __notes.length + '|' + __raw.length; // the rest of the MODX stays unheard
    __send([0x90, 62, 90], 'li'); __send([0x80, 62, 0], 'li'); await __wait(20); o.lumi = __notes.length;
    // a first Learn hears the MODX too
    App.remote.clear('next'); App.remote.clear('back'); App.remote.clear('stop'); await __wait(20);
    __press(86); await __wait(30); o.unboundQuiet = __rm.length;
    App.switchTo('settings'); await __wait(200); __q('[data-rmlearn="next"]').click(); await __wait(20);
    __press(30); await __wait(30); o.learned = JSON.stringify(App.remote.map.next.midi);
    return o;
  });
  ok(sp.input === 'li' && sp.pedal === 'next:cc|0', 'with the LUMI chosen as the input, the MODX pedal still fires NEXT: ' + J(sp));
  ok(sp.otherStill === '0|0' && sp.lumi === 2, 'everything else from the unchosen port stays unheard; the chosen keyboard plays');
  ok(sp.unboundQuiet === 1, 'with nothing bound the unchosen port is not listened to');
  ok(/"t":"cc","n":30.*"port":"MODX-1"/.test(sp.learned), 'Learn hears the unchosen port: ' + sp.learned);
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  console.log('# the Android bridge');
  ({ ctx, page, errs } = await newPage(browser, { 'remote.map': BOUND }, true));
  const an = await page.evaluate(async () => {
    App.switchTo('rmtest'); await __wait(200); __rm.length = 0; __raw.length = 0;
    __press(86); await __wait(30);
    const o = { plat: App.midi.platform, rm: __rm.slice(), raw: __raw.length, remote: __remote.length };
    App.midi.setInput(7); await __wait(30); __rm.length = 0; await __wait(270); // the LUMI chosen: the MODX pedal still counts
    __press(86); await __wait(30); o.single = __rm.join() + '|' + __raw.length;
    return o;
  });
  ok(an.single === 'next:cc|0', 'native: with one input chosen, a pedal on another port still fires: ' + an.single);
  ok(an.plat === 'android' && an.rm.join() === 'next:cc' && an.raw === 0 && an.remote === 2, 'the native bridge path is claimed and fires the same: ' + J(an));
  const hid = await page.evaluate(async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    await __wait(270); __rm.length = 0; __press(86); await __wait(30);
    const n = __rm.length; delete document.hidden; return n;
  });
  ok(hid === 0, 'nothing fires while the app is hidden');
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
