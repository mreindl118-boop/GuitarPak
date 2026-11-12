// CONTROLLER REMOTE in soundLAB Gear (gear.html, env.GEAR_URL): Live sets
// (js/synthlive.js) and the Deck (js/synthtab.js). 2.0 Phase A3b moved these
// checks here from tests/remote-runners.test.js, as they were, when the Synth
// tab left soundLAB (docs/plans/phase-a/PLAN.md 7.5).
// onRemote next / back does what the on-screen buttons do (Next › / ‹ Prev,
// program Prev / Next through the deck's funnel), 'nothing here' returns
// false, a learned CC works end to end (claimed: it never reaches 'midi:raw' —
// so a foot switch learned on the same CC steps a Live set once, not twice),
// the foot-switch Learn says the remote's pedal cannot be learned (and times
// out), and the lowest key plays the synth (remoteKey false) on both pages.
// Where nothing happens, a page that toasted its reason answers false (no
// success HUD), so the remote adds neither its own note nor the sound hint.
// In Gear a press that came from MIDI acts one task later (it asks the Web
// Lock first): every press below is followed by a wait, which covers it.
//
// TWO WINDOWS (plan D44, "one window acts on a pedal"): soundLAB and Gear
// open side by side in one browser context, each page with its own fake MIDI
// ports and the same bound CC. Both claim the message; ONE acts on it:
//   1. both visible: soundLAB acts, Gear does nothing (no 'remote' event, no
//      Bank Select or Program Change to the synth, the Live slot stays)
//   2. soundLAB hidden: the next press steps the Live slot in Gear
//   3. no Web Locks (navigator.locks hidden): Gear acts while it has the
//      focus and not while it has not
// The test sets each page's visibility and focus itself (__vis / __focus), so
// it does not depend on how headless Chromium reports a background page.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const J = JSON.stringify;
const MAP = { next: { midi: { t: 'cc', n: 86, ch: null, port: '' }, key: null }, back: { midi: { t: 'cc', n: 87, ch: null, port: '' }, key: null }, stop: { midi: { t: 'cc', n: 85, ch: null, port: '' }, key: null } };
const M = (pc) => ({ modx: { lsb: 0, pc } });
const LIVE = { sets: [{ id: 's1', name: 'Gig', pages: [[M(1), M(2), null, M(4)].concat(Array(12).fill(null))] }], active: 's1', page: 0, slot: null };
// Bank Select (CC 0 / CC 32) or a Program Change on any channel, as __by records a message
const LOADS = /^(?:(?:17[6-9]|18\d|19[01]) (?:0|32) |(?:19[2-9]|20[0-7]) )/;

// what every page of a context starts with: the seeds, a fake LUMI and a fake
// MODX (each page gets its own pair), and the helpers the checks use
function INIT(seed) {
  ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
  localStorage.setItem('guitarlab.lights.on', 'false');
  localStorage.setItem('guitarlab.midi.outputId', JSON.stringify('lumi'));
  localStorage.setItem('guitarlab.midihub.profile', JSON.stringify('yamaha'));
  for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
  window.__wait = ms => new Promise(r => setTimeout(r, ms));
  window.__q = s => document.querySelector(s);
  window.__raw = []; window.__notes = []; window.__ev = []; window.__slots = 0;
  window.__by = { lumi: [], modx1: [] };
  const mk = (id, name) => ({ id, name, type: 'output', state: 'connected', send: b => { const a = Array.from(b); if (a[0] < 0xF0) window.__by[id].push(a.join(' ')); } });
  const outs = new Map([['lumi', mk('lumi', 'LUMI Keys BLOCK')], ['modx1', mk('modx1', 'MODX-1')]]);
  const modxIn = { id: 'mi', name: 'MODX-1', type: 'input', state: 'connected', onmidimessage: null };
  const lumiIn = { id: 'li', name: 'LUMI Keys BLOCK', type: 'input', state: 'connected', onmidimessage: null };
  navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map([['mi', modxIn], ['li', lumiIn]]), outputs: outs, sysexEnabled: true, onstatechange: null });
  window.__send = (b, p) => (p === 'li' ? lumiIn : modxIn).onmidimessage({ data: new Uint8Array(b) });
  window.__cc = (n, v, p) => __send([0xB0, n, v], p);
  window.__press = (n, p) => { __cc(n, 127, p); __cc(n, 0, p); };
  window.__strike = (n, p) => { __send([0x90, n, 90], p); __send([0x80, n, 0], p); };
  window.__toast = () => { const t = document.getElementById('app-toast'); return t && !t.hidden ? t.textContent : ''; };
  window.__clearToast = () => { const t = document.getElementById('app-toast'); if (t) t.hidden = true; };
  window.__hud = () => { const h = document.getElementById('remote-hud'); return h && h.classList.contains('show') ? h.textContent : ''; };
  window.__ra = a => App.remoteAction(a, { via: 'test' });
  window.__txt = s => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; };
  // the two-window checks decide what this page reports: shown or hidden (with the event a real change sends), focused or not
  window.__vis = on => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => !on });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (on ? 'visible' : 'hidden') });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  window.__focus = on => { document.hasFocus = () => !!on; };
  window.addEventListener('DOMContentLoaded', () => {
    App.on('midi:raw', d => __raw.push(d.bytes.join(' ')));
    App.on('midi:note', d => __notes.push((d.on ? 'on ' : 'off ') + d.midi));
    App.on('remote', d => __ev.push(d.action + ':' + d.via + ':' + (d.handled ? 1 : 0)));
    App.on('synthlive:slot', () => { __slots++; });
  });
}
// the page is up: MIDI connected, the home page showing, the remote loaded
const GEAR_UP = () => window.App && App.midi && App.midi.ready && App.midi.hasOutput && App.active === 'deck' && App.remote && window.SLSynthLive;
const MAIN_UP = () => window.App && App.midi && App.midi.ready && App.midi.hasOutput && App.active === 'quiz' && App.remote;

// one Gear page in its own context. before = an init script that runs ahead of INIT (case 3 hides navigator.locks with it)
async function newPage(browser, seed, before) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' });
  if (before) await ctx.addInitScript(before);
  await ctx.addInitScript(INIT, seed || {});
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.GEAR_URL);
  await page.waitForFunction(GEAR_UP);
  return { ctx, page, errs };
}
// soundLAB and Gear in ONE context (one origin, one store, one set of Web Locks), soundLAB opened first
async function twoPages(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(INIT, seed || {});
  const errs = [];
  const open = async (url, up, who) => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(who + ': ' + e.message));
    await p.goto(url);
    await p.waitForFunction(up, null, { polling: 50 });
    return p;
  };
  const main = await open(env.URL, MAIN_UP, 'soundLAB');
  const gear = await open(env.GEAR_URL, GEAR_UP, 'Gear');
  return { ctx, main, gear, errs };
}
// a timer poll, not the default animation-frame poll: a page that is not the front one may not paint
const until = (page, fn) => page.waitForFunction(fn, null, { polling: 50, timeout: 5000 }).then(() => true, () => false);

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  let { ctx, page, errs } = await newPage(browser, { 'remote.map': MAP, 'synthtab.live': LIVE });

  console.log('# Live sets');
  const lv = await page.evaluate(async () => {
    const o = {};
    App.switchTo('liveset'); await __wait(300);
    o.key = App.remoteKeyPage();
    o.stop = __ra('stop');
    window.__by.modx1.length = 0;
    o.n1 = __ra('next'); o.s1 = SLSynthLive.slot(); o.bytes = __by.modx1.slice();
    await __wait(200); o.n2 = __ra('next'); o.s2 = SLSynthLive.slot();
    await __wait(200); o.b1 = __ra('back'); o.s3 = SLSynthLive.slot();
    await __wait(200); o.b2 = __ra('back'); o.s4 = SLSynthLive.slot();
    o.bounce = __ra('next'); o.s5 = SLSynthLive.slot(); // inside the foot switch's 150 ms debounce
    // edit mode and the slot picker belong to the screen
    await __wait(200); __q('#st-lvedit').click(); await __wait(30);
    o.edit = __ra('next');
    __q('#panel-liveset [data-slot="2"]').click(); await __wait(30);
    o.pickOpen = !__q('#st-lvpick').hidden; o.pick = __ra('next');
    __q('#st-lvpick [data-pick="close"]').click(); __q('#st-lvedit').click(); await __wait(30);
    o.sEdit = SLSynthLive.slot();
    // learning the foot switch: the remote waits
    __q('#st-lvfs').click(); await __wait(30);
    __clearToast(); o.learnFlag = SLSynthLive.learning; o.learn = __ra('next'); o.learnToast = __toast(); o.sLearn = SLSynthLive.slot(); o.stillLearning = SLSynthLive.learning;
    __q('#st-lvfs').click(); await __wait(30);
    // Go live: the stage steps the same way and shows the name
    __q('#st-lvgo').click(); await __wait(50);
    o.live = __ra('next'); o.liveName = __txt('#st-lvnowname'); o.sLive = SLSynthLive.slot();
    __q('#st-lvexit').click(); await __wait(50);
    return o;
  });
  ok(lv.key === false, 'Live sets do not reserve the lowest key (it plays the synth there)');
  ok(lv.stop === false, 'STOP: nothing to end (Panic stays a screen button)');
  ok(lv.n1 === 'Live Set 1-1' && lv.s1 === 0 && lv.bytes.join('|') === '176 0 62|176 32 0|192 0', 'NEXT = Next ›: the first filled slot loads (MSB 62 / LSB 0 / PC 1) and the HUD names it: ' + J([lv.n1, lv.bytes]));
  ok(lv.n2 === 'Live Set 1-2' && lv.s2 === 1, 'NEXT again: slot 2');
  ok(lv.b1 === 'Live Set 1-1' && lv.s3 === 0 && lv.b2 === 'Live Set 1-4' && lv.s4 === 3, 'BACK = ‹ Prev: slot 1, then wraps to the last filled slot (4), skipping the empty one');
  ok(lv.bounce === false && lv.s5 === 3, 'a second step inside the 150 ms foot-switch debounce is absorbed (false)');
  ok(lv.edit === false && lv.pickOpen && lv.pick === false && lv.sEdit === 3, 'Edit slots / the slot picker: the remote leaves them alone (false), the slot stays');
  ok(lv.learnFlag === true && lv.learn === 'Pedal is the remote' && /remote’s Next — press another switch, or tap Learn to cancel/.test(lv.learnToast) && lv.sLearn === 3 && lv.stillLearning, 'while the foot switch is being learned the remote steps nothing, says its pedal cannot be learned, Learn keeps listening: ' + J([lv.learn, lv.learnToast]));
  ok(lv.live === 'Live Set 1-1' && lv.sLive === 0 && /Live Set 1-1/.test(lv.liveName), 'Go live: NEXT steps the stage and the Now card names it');

  console.log('# Live sets end to end: CC 86 = remote NEXT = the foot switch');
  const e2e = await page.evaluate(async () => {
    const o = {};
    App.switchTo('liveset'); await __wait(250);
    App.store.set('synthtab.fsCC', 86); SLSynthLive.render();
    __raw.length = 0; __ev.length = 0; let s0 = __slots;
    await __wait(300); __press(86); await __wait(60);
    o.steps1 = __slots - s0; o.slot1 = SLSynthLive.slot(); o.hud = __hud(); o.ev = __ev.slice();
    await __wait(300); s0 = __slots; __press(86); await __wait(60);
    o.steps2 = __slots - s0; o.slot2 = SLSynthLive.slot();
    o.raw86 = __raw.filter(b => /^176 8[5-7] /.test(b)).length;
    await __wait(300); s0 = __slots; __press(87); await __wait(60); o.back = [__slots - s0, SLSynthLive.slot(), __hud()];
    await __wait(300); __press(85); await __wait(60); o.stopToast = __toast();
    // a foot switch the remote does not own still steps by itself
    App.store.set('synthtab.fsCC', 20); await __wait(200); s0 = __slots; __cc(20, 127); await __wait(60); __cc(20, 0);
    o.fs = [__slots - s0, SLSynthLive.slot(), __raw.filter(b => /^176 20 /.test(b)).length];
    // learning the foot switch: the remote's own CC is claimed (it cannot be learned), the HUD says why; another CC is learned
    SLSynthLive.render(); __q('#st-lvfs').click(); await __wait(300);
    __clearToast(); s0 = __slots; __press(86); await __wait(60); o.learnHud = __hud(); o.learnToast = __toast(); o.learnFs = App.store.get('synthtab.fsCC'); o.learnSteps = __slots - s0;
    __press(21); await __wait(60); o.learned = App.store.get('synthtab.fsCC'); o.learnOff = SLSynthLive.learning;
    // Learn listens for 20 s, then gives up (a mod wheel moved later is never taken)
    const st = window.setTimeout; let expire = null;
    window.setTimeout = function (f, ms) { if (ms === 20000) { expire = f; return 0; } return st.apply(this, arguments); };
    __q('#st-lvfs').click(); window.setTimeout = st; await __wait(30);
    o.relearn = SLSynthLive.learning; __clearToast();
    if (expire) expire();
    await __wait(30); o.expired = [!!expire, SLSynthLive.learning, __toast(), __txt('#st-lvfs')];
    __cc(1, 64); await __wait(30); __cc(1, 70); await __wait(30); o.afterWheel = App.store.get('synthtab.fsCC');
    return o;
  });
  ok(e2e.steps1 === 1 && e2e.slot1 === 1 && /Live Set 1-2/.test(e2e.hud) && e2e.ev[0] === 'next:cc:1', 'CC 86 (also the foot switch) steps ONCE, the HUD names the slot: ' + J([e2e.steps1, e2e.hud, e2e.ev]));
  ok(e2e.steps2 === 1 && e2e.slot2 === 3, 'the next press: one more step (slot 4)');
  ok(e2e.raw86 === 0, 'the remote CCs never reached midi:raw listeners (claimed in midi.js)');
  ok(e2e.back[0] === 1 && e2e.back[1] === 1 && /Live Set 1-2/.test(e2e.back[2]), 'CC 87 = BACK steps back one slot: ' + J(e2e.back));
  ok(/Nothing to stop here/.test(e2e.stopToast), 'CC 85 = STOP: nothing to stop on Live sets (the core toast)');
  ok(e2e.fs[0] === 1 && e2e.fs[1] === 3 && e2e.fs[2] === 2, 'a foot switch on a CC the remote does not own still steps by itself: ' + J(e2e.fs));
  ok(/Pedal is the remote/.test(e2e.learnHud) && /remote’s Next/.test(e2e.learnToast) && e2e.learnFs === 20 && e2e.learnSteps === 0, 'during foot-switch Learn the remote CC is not learned and says so (HUD + toast): ' + J([e2e.learnHud, e2e.learnToast, e2e.learnFs]));
  ok(e2e.learned === 21 && e2e.learnOff === false, 'and a free CC is learned as the foot switch');
  ok(e2e.relearn === true && e2e.expired[0] && e2e.expired[1] === false && /timed out/.test(e2e.expired[2]) && /Learn/.test(e2e.expired[3]) && e2e.afterWheel === 21, 'Learn again: after 20 s it stops listening (toast), a mod wheel moved later is not taken: ' + J(e2e.expired.concat([e2e.afterWheel])));

  console.log('# Live sets: the lowest key plays (remoteKey false)');
  const lk = await page.evaluate(async () => {
    App.remote.setDoubleTap(true); __notes.length = 0; __ev.length = 0; const s0 = SLSynthLive.slot();
    __strike(48, 'li'); await __wait(80); __strike(48, 'li'); await __wait(80);
    const o = { notes: __notes.filter(n => /48$/.test(n)), ev: __ev.slice(), slot: SLSynthLive.slot(), s0 };
    App.remote.setDoubleTap(false); return o;
  });
  ok(lk.notes.join('|') === 'on 48|off 48|on 48|off 48' && !lk.ev.length && lk.slot === lk.s0, 'a double-tap on the lowest key just plays it twice here (no remote action): ' + J(lk));

  console.log('# the Deck');
  const dk = await page.evaluate(async () => {
    const o = {};
    App.switchTo('deck'); await __wait(400); __by.lumi.length = 0;
    o.key = App.remoteKeyPage();
    o.stop = __ra('stop');
    const s0 = SLSynthLive.slot(); __by.modx1.length = 0;
    o.next = __ra('next'); o.slot = [s0, SLSynthLive.slot()]; o.bytes = __by.modx1.slice();
    await __wait(200); o.back = __ra('back'); o.slotB = SLSynthLive.slot();
    await __wait(150); o.active = !!__q('#panel-deck .st-slot.active[data-lvslot="' + SLSynthLive.slot() + '"]');
    // the preset builder sheet is a form in progress
    __q('#st-save').click(); await __wait(50); o.sheetOpen = !__q('#st-sheet').hidden; o.sheet = __ra('next');
    __q('#st-sheetclose').click(); await __wait(30);
    // no Live set: the program steps, through the deck's funnel
    App.store.set('synthtab.live', null); SLSynthTab.render(); await __wait(50);
    await __wait(200); const pc0 = App.synthDeck.perform.now().pc; __by.modx1.length = 0;
    o.pnext = __ra('next'); o.pc1 = App.synthDeck.perform.now().pc; o.pbytes = __by.modx1.slice(); o.now = __txt('#st-nowname');
    o.pback = __ra('back'); o.pc2 = App.synthDeck.perform.now().pc; o.pc0 = pc0;
    o.lumi = __by.lumi.length;
    // end to end on the Deck
    await __wait(300); __ev.length = 0; __press(86); await __wait(60); o.e2e = [App.synthDeck.perform.now().pc, __hud(), __ev[0]];
    return o;
  });
  ok(dk.key === false, 'the Deck does not reserve the lowest key');
  ok(dk.stop === false, 'STOP: nothing to end on the Deck');
  ok(dk.slot[0] === 3 && dk.next === 'Live Set 1-1' && dk.slot[1] === 0 && dk.bytes.join('|') === '176 0 62|176 32 0|192 0', 'with a Live set: NEXT steps the set like its foot switch (wraps to slot 1): ' + J([dk.next, dk.slot, dk.bytes]));
  ok(dk.back === 'Live Set 1-4' && dk.slotB === 3 && dk.active, 'BACK steps the set back; the Deck’s grid marks the slot');
  ok(dk.sheetOpen && dk.sheet === false, 'the preset builder sheet open: the remote leaves it alone');
  ok(dk.pnext && dk.pc1 === dk.pc0 + 1 && dk.pbytes.some(b => /^192 /.test(b)) && dk.pnext === dk.now, 'no Live set: NEXT = the program Next (Bank + PC on the Part), the HUD names it: ' + J([dk.pnext, dk.pc0, dk.pc1, dk.pbytes]));
  ok(dk.pback && dk.pc2 === dk.pc0, 'BACK = the program Prev');
  ok(dk.lumi === 0, 'nothing reached the LUMI');
  ok(dk.e2e[0] === dk.pc0 + 1 && dk.e2e[1] && dk.e2e[2] === 'next:cc:1', 'CC 86 on the Deck steps the program: ' + J(dk.e2e));

  ok(!errs.length, 'no page errors: ' + errs.join(' | '));
  await ctx.close();

  console.log('# refused: Synth out is the LUMI');
  ({ ctx, page, errs } = await newPage(browser, { 'remote.map': MAP, 'synthtab.live': LIVE, 'midihub.outId': 'lumi' }));
  const rf = await page.evaluate(async () => {
    const o = {};
    App.switchTo('deck'); await __wait(400);
    __clearToast(); o.lv = __ra('next'); o.lvToast = __toast(); o.slot = SLSynthLive.slot();
    // two pedal presses 300 ms apart: the deck skips the repeat toast, the page says it again
    await __wait(500); __ev.length = 0; __clearToast(); __press(86); await __wait(300); __clearToast(); __press(86); await __wait(60);
    o.lvTwice = [__toast(), __hud(), __ev.slice(), SLSynthLive.slot()];
    App.store.set('synthtab.live', null); SLSynthTab.render(); await __wait(500);
    __clearToast(); const pc0 = App.synthDeck.perform.now().pc; o.pg = __ra('next'); o.pgToast = __toast(); o.pc = [pc0, App.synthDeck.perform.now().pc];
    await __wait(500); __ev.length = 0; __clearToast(); __press(86); await __wait(300); __clearToast(); __press(86); await __wait(60);
    o.pgTwice = [__toast(), __hud(), __ev.slice(), App.synthDeck.perform.now().pc];
    o.lumi = __by.lumi.length;
    return o;
  });
  ok(rf.lv === false && /Not sent/.test(rf.lvToast) && rf.slot === null, 'a refused Live step answers false (nothing moved), the toast says why, the slot stays: ' + J([rf.lv, rf.lvToast]));
  ok(/Not sent/.test(rf.lvTwice[0]) && !rf.lvTwice[1] && rf.lvTwice[2].join() === 'next:cc:0,next:cc:0' && rf.lvTwice[3] === null, 'two refused pedal presses 300 ms apart: the second still shows why (not "Nothing to move on" or the sound hint), no HUD: ' + J(rf.lvTwice));
  ok(rf.pg === false && /Not sent/.test(rf.pgToast) && rf.pc[0] === rf.pc[1], 'a refused program step answers false, nothing moves');
  ok(/Not sent/.test(rf.pgTwice[0]) && !rf.pgTwice[1] && rf.pgTwice[2].join() === 'next:cc:0,next:cc:0' && rf.pgTwice[3] === rf.pc[0], 'the program step, twice from a pedal: the refusal shows both times, no HUD: ' + J(rf.pgTwice));
  ok(rf.lumi === 0, 'nothing reached the LUMI');
  ok(!errs.length, 'no page errors: ' + errs.join(' | '));
  await ctx.close();

  console.log('# the Deck while its Map Learn listens');
  ({ ctx, page, errs } = await newPage(browser, { 'remote.map': MAP, 'synthtab.live': LIVE }));
  const ml = await page.evaluate(async () => {
    App.switchTo('deck'); await __wait(400);
    const o = {};
    o.learnOn = App.synthDeck.learn('sus', true, 'num') !== false && App.synthDeck.learning;
    __clearToast(); o.r = __ra('next'); o.toast = __toast(); o.slot = SLSynthLive.slot();
    App.synthDeck.learn('sus', false); o.learnOff = App.synthDeck.learning;
    await __wait(300); o.r2 = __ra('next'); o.slot2 = SLSynthLive.slot();
    return o;
  });
  ok(ml.learnOn === true && ml.r === false && /Map Learn is listening/.test(ml.toast) && ml.slot === null, 'while the Map Learn listens, a remote press does not step the set and says why: ' + ml.toast);
  ok(ml.learnOff === false && typeof ml.r2 === 'string' && ml.slot2 === 0, 'after Learn the remote steps again: ' + ml.r2);
  ok(!errs.length, 'no page errors: ' + errs.join(' | '));
  await ctx.close();

  // ---- two windows (plan D44) ----
  // one press of a bound CC into THIS page's own MIDI input, and what the page did with it.
  // The waits: past the remote's debounce and the Live step's own before the press; after it,
  // Gear's answer comes one task later (it asks the lock first)
  const press = (pg, cc) => pg.evaluate(async (cc) => {
    const slots = __slots, hudEl = document.getElementById('remote-hud');
    if (hudEl) hudEl.classList.remove('show'); // an earlier press's HUD stays up for a second
    __clearToast(); await __wait(320);
    __ev.length = 0; __raw.length = 0; __by.modx1.length = 0; __by.lumi.length = 0;
    __press(cc); await __wait(200);
    return { ev: __ev.slice(), raw: __raw.filter(b => b.indexOf('176 ' + cc + ' ') === 0).length, bytes: __by.modx1.slice(), lumi: __by.lumi.length,
      slot: window.SLSynthLive ? SLSynthLive.slot() : null, steps: __slots - slots, hud: __hud(), toast: __toast() };
  }, cc);
  const loads = r => r.bytes.filter(b => LOADS.test(b));
  const FIRST = '176 0 62|176 32 0|192 0'; // Live Set 1-1 on the MODX: MSB 62 / LSB 0 / PC 1

  console.log('# two windows, both visible: the pedal is soundLAB’s');
  let main, gear;
  ({ ctx, main, gear, errs } = await twoPages(browser, { 'remote.map': MAP, 'synthtab.live': LIVE }));
  // soundLAB on a page with nothing to move on (a press still fires there and says so); Gear on Live sets
  await main.evaluate(async () => { App.switchTo('chords'); __vis(true); await __wait(200); });
  await gear.evaluate(async () => { App.switchTo('liveset'); __vis(true); await __wait(300); });
  const held = await until(main, () => App.remote.holdsMain === true); // before the first press
  const pre = {
    main: await main.evaluate(() => ({ app: App.app, active: App.active, holds: App.remote.holdsMain })),
    gear: await gear.evaluate(() => ({ app: App.app, active: App.active, holds: App.remote.holdsMain, slot: SLSynthLive.slot(), locks: !!(navigator.locks && navigator.locks.request) }))
  };
  ok(held && pre.main.app === 'main' && pre.gear.app === 'gear' && pre.gear.active === 'liveset' && pre.gear.locks,
    'soundLAB (visible) holds the pedal lock: App.remote.holdsMain; Gear is on Live sets with the same CC bound: ' + J(pre));
  ok(pre.gear.holds === false && pre.gear.slot === null, 'Gear never holds that lock; no Live slot is loaded yet: ' + J([pre.gear.holds, pre.gear.slot]));
  const m1 = await press(main, 86), g1 = await press(gear, 86); // the CC sent into both
  ok(m1.ev.length === 1 && /^next:cc:/.test(m1.ev[0]) && m1.raw === 0, 'both visible: soundLAB acts on the press (one "remote" event; the CC is claimed, no "midi:raw"): ' + J([m1.ev, m1.raw]));
  ok(g1.ev.length === 0 && !g1.hud, 'both visible: Gear emits no "remote" event and shows no HUD: ' + J([g1.ev, g1.hud, g1.toast]));
  ok(loads(g1).length === 0, 'both visible: Gear sends no Bank Select and no Program Change to the synth: ' + J(g1.bytes));
  ok(g1.slot === null && g1.steps === 0, 'both visible: the Live slot in Gear does not move: ' + J([g1.slot, g1.steps]));
  ok(g1.raw === 0, 'both visible: Gear still claims the bound CC (it reaches no "midi:raw" listener: not Thru, not the Deck, not the foot switch)');

  console.log('# two windows, soundLAB hidden: Gear answers the pedal');
  await main.evaluate(() => { __vis(false); });
  const letGo = await until(main, () => App.remote.holdsMain === false);
  const m2 = await press(main, 86), g2 = await press(gear, 86);
  ok(letGo && m2.ev.length === 0 && m2.raw === 0, 'soundLAB hidden: it lets the lock go and does nothing with the press (still claimed): ' + J([letGo, m2.ev, m2.raw]));
  ok(g2.slot === 0 && g2.steps === 1 && g2.ev.join() === 'next:cc:1' && /Live Set 1-1/.test(g2.hud), 'soundLAB hidden: the next press steps the Live slot in Gear (slot 1; the HUD names it): ' + J([g2.slot, g2.steps, g2.ev, g2.hud]));
  ok(g2.bytes.slice(0, 3).join('|') === FIRST && g2.lumi === 0, 'and the slot loads on the synth (MSB 62 / LSB 0 / PC 1); nothing reached the LUMI: ' + J([g2.bytes, g2.lumi]));
  // and back: the lock is asked again when soundLAB returns
  await main.evaluate(() => { __vis(true); });
  const again = await until(main, () => App.remote.holdsMain === true);
  const m3 = await press(main, 86), g3 = await press(gear, 86);
  ok(again && m3.ev.length === 1 && g3.ev.length === 0 && g3.slot === 0 && g3.steps === 0 && loads(g3).length === 0,
    'soundLAB visible again: the pedal is soundLAB’s again, Gear stays on its slot and sends nothing: ' + J([again, m3.ev, g3.ev, g3.slot, g3.bytes]));
  ok(!errs.length, 'no page errors in either window: ' + errs.join(' | '));
  await ctx.close();

  console.log('# no Web Locks: Gear acts on the pedal only while it has the focus');
  // a context whose init script hides navigator.locks (the claude.ai viewer frame, an older browser)
  const NO_LOCKS = () => { Object.defineProperty(Navigator.prototype, 'locks', { configurable: true, get() { return undefined; } }); };
  ({ ctx, page, errs } = await newPage(browser, { 'remote.map': MAP, 'synthtab.live': LIVE }, NO_LOCKS));
  await page.evaluate(async () => { App.switchTo('liveset'); __vis(true); __focus(true); await __wait(300); });
  const nl = await page.evaluate(() => ({ locks: typeof navigator.locks, focus: document.hasFocus(), slot: SLSynthLive.slot() }));
  ok(nl.locks === 'undefined' && nl.focus === true && nl.slot === null, 'this context has no navigator.locks; Gear has the focus, no Live slot loaded: ' + J(nl));
  const f1 = await press(page, 86);
  ok(f1.slot === 0 && f1.steps === 1 && f1.ev.join() === 'next:cc:1' && f1.bytes.slice(0, 3).join('|') === FIRST, 'document.hasFocus() true: the press steps the Live slot in Gear: ' + J([f1.slot, f1.steps, f1.ev, f1.bytes]));
  await page.evaluate(() => { __focus(false); });
  const f2 = await press(page, 86);
  ok(f2.slot === 0 && f2.steps === 0 && f2.ev.length === 0 && !f2.hud && loads(f2).length === 0, 'document.hasFocus() false: Gear does nothing with the press (no event, no step, nothing to the synth): ' + J([f2.slot, f2.steps, f2.ev, f2.bytes]));
  ok(f2.raw === 0, 'and the bound CC is still claimed there (no "midi:raw")');
  await page.evaluate(() => { __focus(true); });
  const f3 = await press(page, 86);
  ok(f3.slot === 1 && f3.steps === 1 && f3.ev.join() === 'next:cc:1', 'focused again: the next press steps on (slot 2): ' + J([f3.slot, f3.steps, f3.ev]));
  ok(!errs.length, 'no page errors: ' + errs.join(' | '));
  await ctx.close();

  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
