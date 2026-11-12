// soundLAB Gear (gear.html), 2.0 Phase A3b: the second app over the same
// scripts and the same store. Plan: docs/plans/phase-a/PLAN.md, section 7.5.
//
// What this suite holds Gear to:
//   - it boots with no page error and no missing file, on the Deck; its panels
//     are exactly Deck, Live sets, Hub and Helix; tabs Synth | Helix, pills
//     Deck | Live | Hub; none of soundLAB's own modules is loaded; a first
//     visit shows no welcome tour, asks the browser for no MIDI permission
//     and sends no byte
//   - a returning user's MIDI comes back by itself and still nothing is sent
//     to the synth by opening pages
//   - the Hub in Gear: the Hear input switch (#mh-hearin) where the App voice
//     box was, the Thru hint, the input picker (All keyboards / one keyboard,
//     moved here from multiin.test.js), a Player card without "Open as tab"
//   - the Deck and Live in Gear: the Now bar takes the factory sound names
//     when they arrive after the page is up (the Deck is the first page here),
//     a preset's key restore writes fb.root to the store (there is no
//     Fretboard page to do it), Go live holds the wake tag
//   - two apps, one store: #app-switch goes across both ways, each app keeps
//     its own last page (app.tab / gear.tab), the key is shared, the gear
//     icon opens Settings in soundLAB, #page deep links work in both
//     directions and the hash is cleared once used
//   - phone width: no sideways scroll, the header stays inside the screen
//   - the context bar on the four Gear pages (the matrix of
//     context-global.test.js, which covers soundLAB's pages)
//   - Hear input with soundLAB and Gear open at once (Chromium's fake audio
//     device): one window plays it, the other says so; On moves it; Off in
//     either stops both; closing the owner hands it over
//   - Hear input left on but waiting for the browser's permission: Gear says
//     once that the switch is on the Hub page
//
// No hardware: fake Web MIDI ports record every byte, the audio input is
// Chromium's fake device. Service workers are blocked (one variable less).
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const J = JSON.stringify;

const GEAR_PAGES = ['deck', 'liveset', 'midihub', 'helix'];
// this app's own files: an error status from another host (the update check asks GitHub) is not ours
const ORIGIN = env.GEAR_URL.replace(/^([a-z]+:\/\/[^/]+).*$/i, '$1');

// ---- one browser context = one profile ----
// opts:
//   seed      {key: value}, written ONCE per context. A marker keeps a later page load from writing
//             it again, so what the apps store survives going from one app to the other
//   first     true = a first visit: nothing seeded at all (no help.seen either)
//   ports     'none' (no device listed) | 'modx' (MODX-1, in and out) | 'two' (MODX-1 and a LUMI)
//   mic       what permissions.query says for the microphone: 'granted' | 'prompt' ('' = the browser's answer)
//   viewport, touch, mobile
let contexts = [];
async function newContext(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1200, height: 900 }, hasTouch: !!opts.touch, isMobile: !!opts.mobile, serviceWorkers: 'block' });
  contexts.push(ctx);
  await ctx.addInitScript((o) => {
    if (!/^https?:$/.test(location.protocol)) return; // about:blank between two deep links
    if (!localStorage.getItem('sl-test.seeded')) {
      localStorage.setItem('sl-test.seeded', '1');
      if (!o.first) ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('soundlab2.' + k, 'true'));
      for (const k in o.seed) localStorage.setItem('soundlab2.' + k, JSON.stringify(o.seed[k]));
    }
    window.__wait = ms => new Promise(r => setTimeout(r, ms));
    window.__q = s => document.querySelector(s);
    window.__seen = el => !!el && el.getClientRects().length > 0;
    // fake Web MIDI: every request for access is counted, every byte recorded with its port
    window.__asks = 0; window.__sent = [];
    const mkIn = (id, name) => ({ id, name, state: 'connected', type: 'input', onmidimessage: null, addEventListener() {}, removeEventListener() {} });
    const mkOut = (id, name) => ({ id, name, state: 'connected', type: 'output', send: b => window.__sent.push({ port: name, bytes: Array.from(b) }) });
    const ins = new Map(), outs = new Map();
    if (o.ports === 'modx' || o.ports === 'two') { ins.set('in-modx', mkIn('in-modx', 'MODX-1')); outs.set('out-modx', mkOut('out-modx', 'MODX-1')); }
    if (o.ports === 'two') { ins.set('in-lumi', mkIn('in-lumi', 'LUMI Keys Block ALXJ (Bluetooth MIDI IN)')); outs.set('out-lumi', mkOut('out-lumi', 'LUMI Keys Block ALXJ (Bluetooth MIDI OUT)')); }
    const access = { inputs: ins, outputs: outs, sysexEnabled: true, onstatechange: null, addEventListener() {}, removeEventListener() {} };
    navigator.requestMIDIAccess = () => { window.__asks++; return Promise.resolve(access); };
    window.__play = (id, n) => {
      const p = ins.get(id);
      if (p && p.onmidimessage) { p.onmidimessage({ data: new Uint8Array([0x90, n, 100]) }); p.onmidimessage({ data: new Uint8Array([0x80, n, 0]) }); }
    };
    // what reached the synth; and channel messages on the LUMI (the key-light engine's own SysEx to a LUMI is not page traffic)
    window.__toModx = () => window.__sent.filter(s => s.port === 'MODX-1').map(s => s.bytes.join(' '));
    window.__lumiChan = () => window.__sent.filter(s => /LUMI/.test(s.port) && s.bytes[0] < 0xF0).length;
    // the browser has never been asked for MIDI; the microphone answers what the case says
    if (navigator.permissions && navigator.permissions.query) {
      const q = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = d => d && d.name === 'midi' ? Promise.resolve({ state: 'prompt' })
        : d && d.name === 'microphone' && o.mic ? Promise.resolve({ state: o.mic }) : q(d);
    }
    // the header: the link across is shown, the corner tools stay inside the screen and clear of the logo
    window.__head = () => {
      const r = s => document.querySelector(s).getBoundingClientRect();
      const tools = r('.tb-tools'), brand = r('.brand'), link = document.getElementById('app-switch'), lr = link.getBoundingClientRect();
      return {
        link: link.textContent.trim(), linkSeen: lr.width > 0 && lr.height > 0,
        inside: tools.left >= 0 && tools.right <= window.innerWidth + 1 && lr.left >= 0 && lr.right <= window.innerWidth + 1,
        apart: brand.right <= tools.left + 1 || brand.bottom <= tools.top + 1,
        fits: document.documentElement.scrollWidth <= window.innerWidth, w: window.innerWidth, scroll: document.documentElement.scrollWidth
      };
    };
  }, { seed: opts.seed || {}, first: !!opts.first, ports: opts.ports || 'none', mic: opts.mic || '' });
  return ctx;
}
// page errors and error statuses for this app's own files, kept across navigations of the page
function watch(page) {
  const errs = [], bad = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(ORIGIN)) bad.push(r.status() + ' ' + r.url().slice(ORIGIN.length)); });
  return { errs, bad };
}
async function open(ctx, url, ready) {
  const page = await ctx.newPage(), w = watch(page);
  await page.goto(url);
  await page.waitForFunction(ready);
  return { page, errs: w.errs, bad: w.bad };
}
// Gear is up (it boots on the Deck); ...with MIDI back (a returning user: midi.wanted is stored)
const gearUp = () => !!(window.App && App.app === 'gear' && App.active === 'deck');
const gearMidi = () => !!(window.App && App.app === 'gear' && App.active === 'deck' && App.midi && App.midi.ready && App.midi.hasOutput);
const until = async (page, fn, arg, ms) => { try { await page.waitForFunction(fn, arg, { timeout: ms || 8000 }); return true; } catch (e) { return false; } };
// the page ended up in that app, on that page (after a link, a redirect or a deep link)
async function arrive(page, urlRe, app, active) {
  try {
    await page.waitForURL(urlRe, { timeout: 10000 });
    await page.waitForFunction(([app, active]) => !!(window.App && App.app === app && App.active === active), [app, active], { timeout: 10000 });
    return true;
  } catch (e) { return false; }
}
const where = page => page.evaluate(() => ({
  app: App.app, active: App.active, hash: location.hash, clean: location.href.indexOf('#') === -1, file: location.pathname.split('/').pop(),
  appTab: App.store.get('app.tab', null), gearTab: App.store.get('gear.tab', null)
}));
// a document loaded from scratch with #page in its address (goto from the same document would only change the hash)
async function deepLink(page, url) {
  await page.goto('about:blank');
  await page.goto(url).catch(() => {}); // a page of the other app redirects while it loads
}
// the key, set the way a user sets it: the clef dropdown's Key and Scale
async function setKey(page, root, scale) {
  await page.locator('#ctx-btn').click();
  await page.selectOption('#cx-root', String(root));
  await page.selectOption('#cx-scale', scale);
  await page.keyboard.press('Escape');
}
// Hear input in one window: is the input connected to the speakers, is it held, and why
const hearing = page => page.evaluate(() => {
  const s = App.audioIn.state, t = App.audioIn._t();
  return { routed: !!t.monOn, stream: !!t.stream, held: !!s.held, why: s.why || '', msg: s.msg || '', on: App.audioIn.monitor === true };
});
// the Hub's Hear input switch (Gear has no Settings page): its text, and a press on Off / On
const hearSwitch = page => page.evaluate(() => { const el = document.getElementById('mh-hearin'); return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; });
const pressHear = (page, word) => page.locator('#mh-hearin .seg button').filter({ hasText: new RegExp('^\\s*' + word + '\\s*$') }).click();

// one block of checks: a crash in it fails the suite but does not hide the blocks after it
async function section(title, fn) {
  console.log('# ' + title);
  try { await fn(); } catch (e) { fails++; console.log('  FAIL (crash) ' + title + ': ' + String(e && e.message || e).split('\n')[0]); }
  for (const c of contexts) await c.close().catch(() => {});
  contexts = [];
}
const noErrs = (errs, what) => ok(errs.length === 0, 'no page errors (' + what + ')' + (errs.length ? ': ' + errs.join(' | ') : ''));

(async () => {
  const browser = await chromium.launch({
    executablePath: env.CHROMIUM,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']
  });

  await section('a first visit: soundLAB Gear boots on the Deck, in silence', async () => {
    // nothing stored at all; a MODX and a LUMI are plugged in, but the browser was never asked for MIDI
    const ctx = await newContext(browser, { first: true, ports: 'two' });
    const { page, errs, bad } = await open(ctx, env.GEAR_URL, gearUp);
    await page.waitForTimeout(1200); // past the welcome tour's delay (700 ms) and the Hear-input restore (500 ms)
    const b = await page.evaluate(() => {
      const texts = sel => [...document.querySelectorAll(sel)].map(x => x.textContent.trim()).join('|');
      return {
        app: App.app, attr: document.documentElement.getAttribute('data-app'), title: document.title,
        tag: (document.querySelector('.brand .tag') || {}).textContent, foot: (document.querySelector('.foot') || {}).textContent || '',
        panels: [...document.querySelectorAll('main > .panel[id^="panel-"]')].map(el => el.id.slice(6)),
        broken: [...document.querySelectorAll('main > .panel > .error')].map(el => el.textContent),
        active: App.active, shown: [...document.querySelectorAll('main > .panel.active')].map(el => el.id).join(),
        tabs: texts('#tabbar .tabbar-btn'), tabsPhone: texts('#tabbar-m .tabbar-btn'), tab: ((document.querySelector('#tabbar .tabbar-btn.active') || {}).textContent || '').trim(),
        pills: texts('#subnav .subtab'), pill: ((document.querySelector('#subnav .subtab.active') || {}).textContent || '').trim(),
        main: ['SLQuiz', 'Woodshed', 'SLXP'].filter(n => typeof window[n] !== 'undefined').concat(['keysLessons', 'keys'].filter(n => typeof App[n] !== 'undefined').map(n => 'App.' + n)),
        gearMissing: ['SLMidiHub', 'SLSynthTab', 'SLSynthLive', 'SLSynthDeck', 'SLSynthScope', 'SLHelix', 'SLScorePlayer'].filter(n => typeof window[n] === 'undefined'),
        settingsPanel: !!document.getElementById('panel-settings'),
        asks: __asks, sent: __sent.length, ready: !!App.midi.ready,
        tour: !!(window.Help && Help.isOpen && Help.isOpen()), seen: App.store.get('help.seen', null)
      };
    });
    noErrs(errs, 'boot');
    ok(bad.length === 0, 'no file of the app is missing (no 404 or other error status)' + (bad.length ? ': ' + bad.join(' | ') : ''));
    ok(b.app === 'gear' && b.attr === 'gear' && /soundLAB Gear/.test(b.title) && b.tag === 'gear' && /soundLAB Gear alpha/.test(b.foot),
      'this is soundLAB Gear: App.app, <html data-app>, the title, the tag beside the logo and the footer say so: ' + J({ app: b.app, title: b.title }));
    ok(b.panels.slice().sort().join('|') === GEAR_PAGES.slice().sort().join('|') && !b.settingsPanel && b.broken.length === 0,
      'the panels are exactly Deck, Live sets, Hub and Helix, each with its module (no Settings page here): ' + b.panels.join('|') + (b.broken.length ? ' ' + J(b.broken) : ''));
    ok(b.tabs === 'Synth|Helix' && b.tabsPhone === 'Synth|Helix' && b.pills === 'Deck|Live|Hub', 'tabs Synth | Helix, pills Deck | Live | Hub: ' + b.tabs + ' / ' + b.pills);
    ok(b.active === 'deck' && b.shown === 'panel-deck' && b.tab === 'Synth' && b.pill === 'Deck', 'home is the Deck: ' + J({ active: b.active, shown: b.shown, tab: b.tab, pill: b.pill }));
    ok(b.main.length === 0, 'none of soundLAB\'s own modules is loaded (SLQuiz, Woodshed, App.keysLessons, App.keys, SLXP)' + (b.main.length ? ': found ' + b.main.join(', ') : ''));
    ok(b.gearMissing.length === 0, 'Gear\'s own modules are (the Hub, the Synth tab, Live sets, the Deck and its scope, Helix, the Player)' + (b.gearMissing.length ? ': missing ' + b.gearMissing.join(', ') : ''));
    ok(b.asks === 0 && b.sent === 0 && !b.ready, 'no MIDI permission request and no byte sent at boot: ' + J({ asks: b.asks, sent: b.sent }));
    ok(!b.tour && b.seen !== true, 'no welcome tour in Gear, and help.seen is left for soundLAB to set: ' + J({ tour: b.tour, seen: b.seen }));
    const v = await page.evaluate(async (pages) => {
      const o = { seen: [] };
      for (const p of pages) { App.switchTo(p); await __wait(250); o.seen.push({ p, active: App.active, shown: [...document.querySelectorAll('main > .panel.active')].map(el => el.id).join() }); }
      App.switchTo('deck'); await __wait(100);
      o.asks = __asks; o.sent = __sent.length; o.app = App.app;
      return o;
    }, GEAR_PAGES);
    ok(v.seen.every(s => s.active === s.p && s.shown === 'panel-' + s.p) && v.app === 'gear', 'each of the four pages opens its own panel: ' + v.seen.map(s => s.p + '>' + s.shown).join(' '));
    ok(v.asks === 0 && v.sent === 0, 'opening the pages still asks the browser for nothing and sends nothing (every page has its own Connect): ' + J({ asks: v.asks, sent: v.sent }));
    noErrs(errs, 'the four pages');
  });

  await section('a returning user: MIDI comes back, nothing is sent; the Hub in Gear', async () => {
    const ctx = await newContext(browser, { seed: { 'midi.wanted': true, 'lights.on': false }, ports: 'two' });
    const { page, errs, bad } = await open(ctx, env.GEAR_URL, gearMidi);
    await page.waitForTimeout(400);
    const quiet = await page.evaluate(async (pages) => {
      const pedalUp = /^(17[6-9]|18\d|19[01]) 64 0$/; // the Hub's cleanup on leaving a page: sustain up, nothing else
      const o = { asks: __asks, synth: App.midi.synthOut.name(), boot: __toModx().length, bootLumi: __lumiChan() };
      for (const p of pages) { App.switchTo(p); await __wait(250); }
      App.switchTo('midihub'); await __wait(200);
      o.pages = __toModx().filter(b => !pedalUp.test(b)); o.lumi = __lumiChan();
      return o;
    }, GEAR_PAGES);
    ok(quiet.asks >= 1 && quiet.synth === 'MODX-1', 'MIDI is connected again without a press (midi.wanted) and the synth output is the MODX, not the LUMI: ' + J({ asks: quiet.asks, synth: quiet.synth }));
    ok(quiet.boot === 0 && quiet.bootLumi === 0, 'no byte went to the synth at boot, no channel message to the LUMI');
    ok(quiet.pages.length === 0 && quiet.lumi === 0, 'opening Deck, Live, Hub and Helix sends nothing to the synth or the LUMI' + (quiet.pages.length ? ': ' + quiet.pages.join(' | ') : ''));

    console.log('# the Hub header: Hear input where App voice was');
    const hub = await page.evaluate(() => {
      const top = document.querySelector('#panel-midihub .mh-top'), sw = document.getElementById('mh-hearin');
      const seg = sw && sw.querySelector('.seg[role="group"][aria-label="Hear input"]');
      const said = re => re.test(top.textContent) || [...top.querySelectorAll('[title]')].some(el => re.test(el.title));
      return {
        sw: __seen(sw), seg: __seen(seg), btns: seg ? [...seg.querySelectorAll('button')].map(x => x.textContent.trim()).join('|') : '',
        line: sw ? sw.textContent.replace(/\s+/g, ' ').trim() : '', link: !!(sw && sw.querySelector('a[href$="index.html#settings"]')),
        voiceBox: __seen(document.getElementById('mh-hear')),
        voiceWord: [...top.querySelectorAll('label, span, button')].filter(el => /^\s*App voice\s*$/.test(el.textContent) && __seen(el)).length,
        muted: /voice is muted/i.test(top.textContent), thru: said(/Thru runs while soundLAB Gear is open/), keys: typeof App.keys
      };
    });
    ok(hub.sw && hub.seg && hub.btns === 'Off|On', 'the Hub header has the Hear input switch (#mh-hearin): Off / On: ' + hub.btns);
    ok(/Off\./.test(hub.line) && /Input, level and meter: soundLAB › Settings/.test(hub.line) && hub.link,
      'its line says Off, and that the input, level and meter are in soundLAB › Settings (a link to index.html#settings): ' + hub.line);
    ok(hub.keys === 'undefined' && !hub.voiceBox && hub.voiceWord === 0 && !hub.muted, 'no App voice box and no "voice is muted" line: Gear has no app voice');
    ok(hub.thru, 'the Hub says next to the Thru box that Thru runs while soundLAB Gear is open');

    console.log('# the Hub input picker (moved here from multiin.test.js)');
    const pick = await page.evaluate(() => {
      const sel = document.getElementById('mh-in');
      const o = { seen: __seen(sel), val: sel.value, first: sel.options[0] && sel.options[0].textContent, names: [...sel.options].slice(1).map(x => x.textContent) };
      const got = []; App.on('midi:note', d => { if (d.on) got.push(d.midi); });
      __play('in-modx', 60); __play('in-lumi', 64); o.all = got.splice(0).join();
      sel.value = 'in-modx'; sel.dispatchEvent(new Event('change'));
      __play('in-modx', 61); __play('in-lumi', 65); o.one = got.splice(0).join(); o.oneId = App.midi.inputId;
      sel.value = 'all'; sel.dispatchEvent(new Event('change'));
      __play('in-modx', 62); __play('in-lumi', 66); o.back = got.splice(0).join(); o.backId = App.midi.inputId;
      return o;
    });
    ok(pick.seen && pick.val === 'all' && pick.first === 'All keyboards', 'the Hub offers All keyboards and shows it selected: ' + J({ val: pick.val, first: pick.first }));
    ok(pick.names.length === 2 && pick.names.some(n => /MODX-1/.test(n)) && pick.names.some(n => /LUMI/.test(n)), 'and lists each keyboard by name: ' + J(pick.names));
    ok(pick.all === '60,64' && pick.one === '61' && pick.oneId === 'in-modx' && pick.back === '62,66' && pick.backId === 'all',
      'both keyboards are heard; picking the MODX there hears only it; All keyboards again hears both: ' + J([pick.all, pick.one, pick.back]));

    console.log('# the Hub\'s Player in Gear');
    const pl = await page.evaluate(() => {
      document.querySelector('#mh-views [data-view="player"]').click();
      const card = document.getElementById('mh-player');
      return {
        shown: __seen(card), play: !!document.getElementById('mh-plplay'), songs: typeof App.songs,
        tabBtn: !!document.getElementById('mh-pltab') || [...card.querySelectorAll('button')].some(x => /open as tab/i.test(x.textContent)),
        line: /Open as tab is on the Songs page in soundLAB\./.test(card.textContent), out: (document.getElementById('mh-plout') || {}).textContent || ''
      };
    });
    ok(pl.shown && pl.play && /MODX-1/.test(pl.out), 'the Hub still mounts the Player card, aimed at the synth: ' + pl.out);
    ok(pl.songs === 'undefined' && !pl.tabBtn && pl.line, 'it has no "Open as tab" button (Gear has no Songs page) and says: Open as tab is on the Songs page in soundLAB.');
    noErrs(errs, 'the Hub');
    ok(bad.length === 0, 'no file is missing with MIDI connected either' + (bad.length ? ': ' + bad.join(' | ') : ''));
  });

  await section('the Deck is the first page: its Now bar names the sound once the names file is in', async () => {
    // In soundLAB the Deck was never the first page shown, so the factory names (data/modx-performances.json,
    // fetched on first use) were in before anyone looked. Here MIDI is off and the file is slow: nothing else
    // would paint the Deck again after boot
    const ctx = await newContext(browser, { seed: { 'midihub.profile': 'yamaha', 'lights.on': false }, ports: 'none' });
    await ctx.route('**/data/modx-performances.json', async r => { await new Promise(x => setTimeout(x, 700)); await r.continue(); });
    const { page, errs } = await open(ctx, env.GEAR_URL, gearUp);
    const early = await page.evaluate(() => document.getElementById('st-nowname').textContent);
    const named = await until(page, () => /CFX \+ FM EP/.test(document.getElementById('st-nowname').textContent), null, 6000);
    const late = await page.evaluate(() => document.getElementById('st-nowname').textContent);
    ok(named, 'the Now bar takes the factory name when the names file arrives after the page is up: "' + early + '" becomes "' + late + '"');
    noErrs(errs, 'the Deck, names file late');
  });

  await section('the Deck and Live sets in Gear: a preset\'s key, Go live', async () => {
    const ctx = await newContext(browser, { seed: { 'midi.wanted': true, 'lights.on': false, 'midihub.profile': 'yamaha' }, ports: 'two' });
    const { page, errs } = await open(ctx, env.GEAR_URL, gearMidi);
    await page.waitForTimeout(400);
    await setKey(page, 2, 'dorian');
    const saved = await page.evaluate(async () => {
      const o = { root: App.store.get('fb.root', null), scale: App.store.get('fb.scale', null) };
      __q('#st-save').click(); await __wait(80);
      o.builder = !__q('#st-sheet').hidden;
      __q('#st-pname').value = 'Gear key';
      __q('#st-psave').click(); await __wait(120);
      const it = App.synthDeck.presets().filter(x => x.name === 'Gear key')[0];
      o.id = it ? it.id : null; o.app = it && it.snap ? it.snap.app : null;
      o.slot = !!(it && __q('#st-pins [data-preset="' + it.id + '"]'));
      return o;
    });
    ok(saved.root === 2 && saved.scale === 'dorian', 'the clef dropdown in Gear writes the key to the store: D dorian');
    ok(saved.builder && saved.id && saved.app && saved.app.root === 2 && saved.app.scale === 'dorian' && saved.slot, 'a Deck preset saved now keeps that key and gets a slot: ' + J(saved.app));
    await setKey(page, 7, 'major');
    const moved = await page.evaluate(() => ({ root: App.store.get('fb.root', null), scale: App.store.get('fb.scale', null), sent: __sent.length }));
    ok(moved.root === 7 && moved.scale === 'major', 'the key moves on to G major');
    await page.evaluate(id => { __q('#st-pins [data-preset="' + id + '"]').click(); }, saved.id);
    const restored = await until(page, () => App.store.get('fb.root', null) === 2 && App.store.get('fb.scale', null) === 'dorian', null, 6000);
    const after = await page.evaluate(n => ({
      root: App.store.get('fb.root', null), scale: App.store.get('fb.scale', null), barRoot: document.getElementById('cx-root').value, barScale: document.getElementById('cx-scale').value,
      toModx: __sent.slice(n).filter(s => s.port === 'MODX-1').map(s => s.bytes.join(' ')), lumi: __lumiChan()
    }), moved.sent);
    ok(restored && after.root === 2 && after.scale === 'dorian', 'loading the preset restores its key in the store: fb.root = 2, fb.scale = dorian (no Fretboard page writes it in Gear): ' + J({ root: after.root, scale: after.scale }));
    ok(after.barRoot === '2' && after.barScale === 'dorian', 'and the clef dropdown shows D dorian again');
    ok(after.toModx.some(x => /^19[2-9] |^20[0-7] /.test(x)) && after.lumi === 0, 'the load itself went to the MODX (a Program Change), nothing to the LUMI: ' + after.toModx.slice(0, 4).join(' | '));

    console.log('# Go live keeps the screen awake');
    const live = await page.evaluate(async () => {
      window.prompt = () => 'Gear set';
      App.switchTo('liveset'); await __wait(300);
      __q('#st-lvnew').click(); await __wait(80);
      const o = { set: !!__q('#st-lvgo'), before: App.wake.held().indexOf('synthlive') !== -1 };
      __q('#st-lvgo').click(); await __wait(100);
      o.live = document.documentElement.classList.contains('st-live'); o.held = App.wake.held().indexOf('synthlive') !== -1;
      __q('#st-lvexit').click(); await __wait(100);
      o.liveAfter = document.documentElement.classList.contains('st-live'); o.heldAfter = App.wake.held().indexOf('synthlive') !== -1;
      return o;
    });
    ok(live.set && !live.before && live.live && live.held, 'Go live holds the wake tag synthlive: ' + J({ live: live.live, held: live.held }));
    ok(!live.liveAfter && !live.heldAfter, 'Exit lets it go again');
    noErrs(errs, 'Deck and Live');
  });

  await section('two apps, one store: the link across, each app\'s last page, the key, Settings, #page', async () => {
    // soundLAB was last on Piano; Gear has never been opened
    const ctx = await newContext(browser, { seed: { 'app.tab': 'piano' } });
    const { page, errs, bad } = await open(ctx, env.GEAR_URL, gearUp);
    let w = await where(page);
    ok(w.active === 'deck' && w.gearTab === 'deck' && w.appTab === 'piano', 'Gear opens on its own home, not on soundLAB\'s last page, and leaves app.tab alone: ' + J(w));
    const link = await page.evaluate(() => { const a = document.getElementById('app-switch'); return { tag: a.tagName, href: a.getAttribute('href') || '', text: a.textContent.trim(), seen: __seen(a) }; });
    ok(link.tag === 'A' && link.seen && /(^|\/)index\.html$/.test(link.href) && link.text === 'soundLAB', '#app-switch in Gear is a real link to soundLAB (index.html): ' + J(link));
    await page.locator('#subnav .subtab', { hasText: 'Hub' }).click();
    await setKey(page, 2, 'dorian');
    w = await where(page);
    ok(w.active === 'midihub' && w.gearTab === 'midihub' && w.appTab === 'piano', 'the Hub pill: Gear remembers the Hub under gear.tab; app.tab still says piano: ' + J(w));

    await page.locator('#app-switch').click();
    ok(await arrive(page, /\/index\.html/, 'main', 'piano'), 'the link opens soundLAB, on the page it was left on (Piano)');
    const sl = await page.evaluate(() => {
      const a = document.getElementById('app-switch');
      return { href: a.getAttribute('href') || '', text: a.textContent.trim(), label: a.getAttribute('aria-label'), seen: __seen(a),
        root: document.getElementById('cx-root').value, scale: document.getElementById('cx-scale').value, gearTab: App.store.get('gear.tab', null), hub: typeof window.SLMidiHub };
    });
    ok(sl.seen && /(^|\/)gear\.html$/.test(sl.href) && sl.text === 'Gear' && sl.label === 'Open soundLAB Gear', '#app-switch in soundLAB reads "Gear" and points at gear.html: ' + J({ href: sl.href, text: sl.text, label: sl.label }));
    ok(sl.root === '2' && sl.scale === 'dorian', 'one key for both apps: D dorian set in Gear is the key in soundLAB');
    ok(sl.gearTab === 'midihub' && sl.hub === 'undefined', 'visiting soundLAB leaves gear.tab alone (and soundLAB loads no Hub)');
    await page.evaluate(() => App.switchTo('songs'));
    w = await where(page);
    ok(w.appTab === 'songs' && w.gearTab === 'midihub', 'soundLAB moves to Songs: app.tab follows, gear.tab does not: ' + J(w));

    await page.locator('#app-switch').click();
    ok(await arrive(page, /\/gear\.html/, 'gear', 'midihub'), 'the link back opens Gear on its own last page (the Hub)');
    w = await where(page);
    ok(w.appTab === 'songs', 'visiting Gear leaves soundLAB\'s app.tab alone: ' + J(w));

    console.log('# the gear icon in Gear opens Settings in soundLAB');
    await page.locator('#settings-btn').click();
    ok(await arrive(page, /\/index\.html/, 'main', 'settings'), 'the gear icon leaves for index.html#settings: soundLAB opens with Settings showing');
    w = await where(page);
    ok(w.hash === '' && w.clean, 'the #settings in the address is cleared once used: ' + w.file + w.hash);
    await page.locator('#settings-btn').click();
    w = await where(page);
    ok(w.active === 'songs' && w.gearTab === 'midihub', 'the gear icon there closes Settings onto soundLAB\'s own page (Songs): ' + J(w));

    console.log('# #page deep links, both ways');
    await deepLink(page, env.GEAR_URL + '#liveset');
    ok(await arrive(page, /\/gear\.html/, 'gear', 'liveset'), 'gear.html#liveset opens Live sets in Gear (the #page wins over the stored Hub)');
    w = await where(page);
    ok(w.hash === '' && w.clean && w.file === 'gear.html', 'and the hash is cleared: ' + w.file + w.hash);
    await deepLink(page, env.GEAR_URL + '#piano');
    ok(await arrive(page, /\/index\.html/, 'main', 'piano'), 'gear.html#piano is a soundLAB page: it opens Piano in soundLAB');
    w = await where(page);
    ok(w.hash === '' && w.clean && w.file === 'index.html', 'and the hash is cleared there: ' + w.file + w.hash);
    await deepLink(page, env.URL + '#helix');
    ok(await arrive(page, /\/gear\.html/, 'gear', 'helix'), 'index.html#helix is a Gear page: it opens Helix in Gear');
    w = await where(page);
    ok(w.hash === '' && w.clean && w.file === 'gear.html', 'and the hash is cleared there: ' + w.file + w.hash);
    // the same guard from inside: a soundLAB page id never blanks Gear, it goes across
    await page.evaluate(() => { setTimeout(() => App.switchTo('songs'), 0); });
    ok(await arrive(page, /\/index\.html/, 'main', 'songs'), 'App.switchTo(\'songs\') inside Gear leaves for soundLAB\'s Songs page');
    noErrs(errs, 'both apps, every hop');
    ok(bad.length === 0, 'no file missing on the way' + (bad.length ? ': ' + bad.join(' | ') : ''));
  });

  await section('phone width: no sideways scroll', async () => {
    const ctx = await newContext(browser, { seed: { 'midi.wanted': true, 'lights.on': false }, ports: 'two', viewport: { width: 390, height: 844 }, touch: true });
    const { page, errs } = await open(ctx, env.GEAR_URL, gearMidi);
    await page.waitForTimeout(300);
    const ph = await page.evaluate(async (pages) => {
      const o = { pages: {}, tabs: [...document.querySelectorAll('#tabbar-m .tabbar-btn')].map(x => x.textContent.trim()).join('|'),
        bottom: getComputedStyle(document.getElementById('tabbar-m')).display !== 'none', top: getComputedStyle(document.getElementById('tabbar')).display !== 'none' };
      for (const p of pages) {
        App.switchTo(p); await __wait(300); window.scrollTo(0, 0);
        o.pages[p] = { fits: document.documentElement.scrollWidth <= window.innerWidth, scroll: document.documentElement.scrollWidth };
      }
      App.switchTo('deck'); await __wait(150); window.scrollTo(0, 0);
      o.head = __head();
      return o;
    }, GEAR_PAGES);
    ok(ph.bottom && !ph.top && ph.tabs === 'Synth|Helix', 'the tab bar sits along the bottom with two tabs: ' + ph.tabs);
    for (const p of GEAR_PAGES) ok(ph.pages[p] && ph.pages[p].fits, p + ' at 390 px: no sideways scroll (content ' + (ph.pages[p] || {}).scroll + ' px wide)');
    ok(ph.head.linkSeen && ph.head.link === 'soundLAB' && ph.head.inside && ph.head.apart, 'the header at 390 px: the link to soundLAB and the five icons stay inside the screen, clear of the logo: ' + J(ph.head));
    await page.setViewportSize({ width: 360, height: 780 });
    await page.waitForTimeout(200);
    const small = await page.evaluate(() => __head());
    ok(small.linkSeen && small.inside && small.apart && small.fits, 'at 360 px too, and the Deck does not scroll sideways: ' + J(small));
    noErrs(errs, 'phone');
  });

  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await section(viewport.width + ' px: the context bar on the four Gear pages', async () => {
      const phone = viewport.width === 390;
      const ctx = await newContext(browser, { viewport, touch: phone, mobile: phone });
      const { page, errs } = await open(ctx, env.GEAR_URL, gearUp);
      await page.evaluate(() => { App.setTheme('dark'); App.scaleLock.set(false); App.midi.setDisplayEnabled(false); });
      const registered = await page.evaluate(() => [...document.querySelectorAll('main > .panel[id^="panel-"]')].map(el => el.id.slice(6)).sort().join('|'));
      ok(registered === GEAR_PAGES.slice().sort().join('|'), 'the matrix covers every page of Gear: ' + registered);
      for (const name of GEAR_PAGES) {
        await page.evaluate(n => App.switchTo(n), name);
        await page.waitForFunction(n => App.active === n, name);
        await page.waitForTimeout(70);
        await page.locator('#ctx-btn').click();
        // the snapshot of context-global.test.js: one clef, one shared set of controls, on every page
        const s = await page.evaluate(() => {
          const b = document.getElementById('ctx-btn'), bar = document.getElementById('ctxbar');
          const r = b.getBoundingClientRect(), d = bar.getBoundingClientRect();
          const peer = document.getElementById('lights-btn').getBoundingClientRect();
          const brand = document.querySelector('.brand').getBoundingClientRect(), tools = document.querySelector('.tb-tools').getBoundingClientRect();
          const icon = b.querySelector('svg.ic');
          return {
            active: App.active, visible: getComputedStyle(b).display !== 'none' && r.width > 0, enabled: !b.disabled, open: App.ctx(), expanded: b.getAttribute('aria-expanded'),
            label: b.getAttribute('aria-label'), region: bar.getAttribute('role'), labelled: !!bar.getAttribute('aria-label'), controls: b.getAttribute('aria-controls'),
            width: r.width, height: r.height, likePeers: Math.abs(r.width - peer.width) < 1 && Math.abs(r.height - peer.height) < 1,
            noHeaderOverlap: brand.right <= tools.left + 1 || brand.bottom <= tools.top + 1,
            inBounds: d.left >= 0 && d.right <= innerWidth + 1 && d.top >= 0 && d.bottom <= innerHeight + 1,
            unique: ['ctxbar', 'cx-root', 'cx-scale', 'cx-lock', 'cx-led'].every(id => document.querySelectorAll('#' + id).length === 1),
            targets: [...bar.querySelectorAll('select,input[type=number],button')].every(el => {
              const q = el.getBoundingClientRect(); return !el.getClientRects().length || Math.round(q.height) >= 44 && (!el.matches('button') || Math.round(q.width) >= 44);
            }),
            icon: icon ? icon.getAttribute('aria-hidden') : null
          };
        });
        ok(s.active === name && s.visible && s.enabled && s.open && s.expanded === 'true' && s.width >= 34 && s.height >= 34 && s.likePeers && s.noHeaderOverlap && s.inBounds && s.unique && s.targets,
          name + ': visible clef sized like its neighbours (>= 34 px), reachable disclosure, one shared set of controls' + (s.active === name && s.open ? '' : ' ' + J(s)));
        ok(s.controls === 'ctxbar' && s.region === 'region' && s.labelled && /Key, scale/.test(s.label) && s.icon === 'true', name + ': labelled disclosure and decorative SVG');
        await page.keyboard.press('Escape');
      }
      ok(await page.evaluate(() => !App.ctx() && __asks === 0), 'Escape closes it; the walk through the pages asked the browser for no MIDI');
      noErrs(errs, viewport.width + ' px');
    });
  }

  await section('Hear input with soundLAB and Gear open at once: one window plays it', async () => {
    // audio.monitor was left on; the audio-input permission is granted; a MODX is on MIDI (the Hub shows its ports row)
    const ctx = await newContext(browser, { seed: { 'audio.monitor': true, 'midi.wanted': true, 'lights.on': false }, ports: 'modx', mic: 'granted' });
    const main = await open(ctx, env.URL, () => !!(window.App && App.app === 'main' && App.audioIn && App.active));
    const first = await until(main.page, () => App.audioIn._t().monOn === true);
    let a = await hearing(main.page);
    ok(first && a.routed && !a.held, 'soundLAB, opened first, restores Hear input and plays it: ' + J(a));

    const gear = await open(ctx, env.GEAR_URL, gearMidi);
    const waits = await until(gear.page, () => { const s = App.audioIn.state; return s.held && s.why === 'other'; });
    await gear.page.evaluate(() => App.switchTo('midihub'));
    a = await hearing(main.page); let g = await hearing(gear.page);
    ok(waits && a.routed && !g.routed, 'with Gear open too, exactly one window has the input on the speakers (soundLAB): ' + J({ soundLAB: a.routed, gear: g.routed }));
    ok(g.on && g.held && g.why === 'other' && !g.stream, 'Gear holds: why "other", and it did not open the input: ' + J(g));
    const line = await hearSwitch(gear.page);
    const toast = await gear.page.evaluate(() => { const t = document.getElementById('app-toast'); return t && !t.hidden ? t.textContent : ''; });
    ok(/other soundLAB window has Hear input/.test(g.msg) && /other soundLAB window has Hear input/.test(line), 'and says so on the Hub\'s switch: ' + g.msg);
    ok(!/Hub page/.test(toast), 'held by the other window needs no toast' + (toast ? ': ' + toast : ''));

    await pressHear(gear.page, 'On');
    const movedG = await until(gear.page, () => App.audioIn._t().monOn === true);
    const movedA = await until(main.page, () => { const s = App.audioIn.state; return !App.audioIn._t().monOn && s.held && s.why === 'other'; });
    a = await hearing(main.page); g = await hearing(gear.page);
    ok(movedG && g.routed && !g.held, 'On pressed in Gear moves Hear input there: ' + J(g));
    ok(movedA && !a.routed && a.held && a.why === 'other', 'and soundLAB stops, held with why "other": ' + J(a));
    ok(/Hearing .+ through this computer\./.test(await hearSwitch(gear.page)), 'the Hub\'s switch says what is heard through this computer');

    await main.page.evaluate(() => { App.audioIn.setMonitor(false); }); // not awaited here: the states below are waited for
    const offA = await until(main.page, () => App.audioIn.monitor === false && !App.audioIn._t().monOn);
    const offG = await until(gear.page, () => App.audioIn.monitor === false && !App.audioIn._t().monOn && !App.audioIn._t().stream);
    a = await hearing(main.page); g = await hearing(gear.page);
    ok(offA && offG && !a.routed && !g.routed && !a.on && !g.on, 'Off pressed in soundLAB (the window that was not playing) leaves neither window routed: ' + J({ soundLAB: a, gear: g }));
    ok(!g.stream && /Off\./.test(await hearSwitch(gear.page)), 'Gear let the input go and its switch reads Off');

    await pressHear(gear.page, 'On');
    const againG = await until(gear.page, () => App.audioIn._t().monOn === true);
    const againA = await until(main.page, () => { const s = App.audioIn.state; return !App.audioIn._t().monOn && s.held && s.why === 'other'; });
    a = await hearing(main.page); g = await hearing(gear.page);
    ok(againG && againA && g.routed && !a.routed, 'On in Gear again: Gear plays, soundLAB waits: ' + J({ soundLAB: a.routed, gear: g.routed }));

    // soundLAB's Settings is open: its level meter holds the input open (never on the speakers). Off pressed
    // in Gear ends the last use of the input, so the meter lets it go, as after Off pressed in Settings itself
    await main.page.evaluate(() => App.switchTo('settings'));
    const metered = await until(main.page, () => { const t = App.audioIn._t(); return t.holds.indexOf('settings-meter') !== -1 && !!t.stream && !t.monOn; });
    await pressHear(gear.page, 'Off');
    const freed = await until(main.page, () => { const t = App.audioIn._t(); return App.audioIn.monitor === false && !t.stream && t.holds.length === 0; });
    a = await hearing(main.page);
    ok(metered && freed && !a.routed && !a.stream && !a.held, 'with soundLAB\'s Settings open, Off pressed in Gear also closes the input its meter held: ' + J(a));
    await main.page.evaluate(() => App.switchTo('quiz'));
    await pressHear(gear.page, 'On');
    const backG = await until(gear.page, () => App.audioIn._t().monOn === true);
    const backA = await until(main.page, () => { const s = App.audioIn.state; return !App.audioIn._t().monOn && s.held && s.why === 'other'; });
    ok(backG && backA, 'and On in Gear plays there again, soundLAB waiting');
    noErrs(gear.errs, 'Gear, two windows');
    await gear.page.close();
    const took = await until(main.page, () => App.audioIn._t().monOn === true && !App.audioIn.state.held);
    a = await hearing(main.page);
    ok(took && a.routed && !a.held, 'closing the window that played it lets the other take over: soundLAB plays again: ' + J(a));
    noErrs(main.errs, 'soundLAB, two windows');
  });

  await section('Hear input left on, the browser has not been asked yet: Gear points at the Hub', async () => {
    const ctx = await newContext(browser, { seed: { 'audio.monitor': true, 'midi.wanted': true, 'lights.on': false }, ports: 'modx', mic: 'prompt' });
    const { page, errs } = await open(ctx, env.GEAR_URL, gearMidi);
    const told = await until(page, () => { const t = document.getElementById('app-toast'); return !!t && !t.hidden && /Hub page/.test(t.textContent); }, null, 6000);
    const t1 = await page.evaluate(() => { const t = document.getElementById('app-toast'); return { text: t ? t.textContent : '', active: App.active }; });
    let h = await hearing(page);
    ok(told && /Hear input is on/.test(t1.text) && /The switch is on the Hub page\.$/.test(t1.text.trim()), 'Gear shows a toast with the reason and where the switch is: ' + t1.text);
    ok(h.on && h.held && h.why === 'perm' && !h.stream && !h.routed, 'nothing was opened and nothing asked at launch: Hear input waits for a press: ' + J(h));
    const once = await page.evaluate(async () => {
      const t = document.getElementById('app-toast'); t.hidden = true; t.textContent = '';
      App.emit('audioin:state', App.audioIn.state); // the same hold, reported once more
      await __wait(150);
      return { shown: !t.hidden, text: t.textContent };
    });
    ok(!once.shown && !/Hub page/.test(once.text), 'it is said once per start: the same hold reported again brings no second toast');
    await page.evaluate(() => App.switchTo('midihub'));
    ok(/press On to start it/.test(await hearSwitch(page)), 'the Hub\'s switch shows the same reason: ' + await hearSwitch(page));
    await pressHear(page, 'On');
    const started = await until(page, () => App.audioIn._t().monOn === true);
    h = await hearing(page);
    ok(started && h.routed && !h.held && /Hearing .+ through this computer\./.test(await hearSwitch(page)), 'On pressed there starts it (the browser asks, the fake device answers): ' + await hearSwitch(page));
    await pressHear(page, 'Off');
    const stopped = await until(page, () => !App.audioIn._t().monOn && App.audioIn.monitor === false);
    ok(stopped && (await page.evaluate(() => App.store.get('audio.monitor', null))) === false && /Off\./.test(await hearSwitch(page)), 'Off switches it off for good (audio.monitor is false): ' + await hearSwitch(page));
    noErrs(errs, 'Hear input in Gear');
  });

  await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
