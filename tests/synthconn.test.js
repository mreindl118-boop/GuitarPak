// The Synth tab's CONNECTION BAR (js/synthdeck.js connState / connBar, shown
// on the Deck and Live pages): a tap that cannot reach the synth is never
// silent. Each way the deck can be cut off - MIDI not connected yet, Synth
// out on the LUMI, no synth on the cable, no MIDI in the browser, an Android
// app whose ONE output is the LUMI - shows a bar naming it with the fix in
// place (Connect MIDI / the synth's port), a refused tap toasts on the page
// (App.toast; the Hub page keeps its own #mh-toast) and nudges the bar, a
// Live slot stays put when nothing went out, and after the fix the same tap
// sends. Nothing may reach the LUMI as channel messages.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const J = JSON.stringify;
const LIVE = { sets: [{ id: 's1', name: 'Gig', pages: [[{ modx: { lsb: 0, pc: 3 } }].concat(Array(15).fill(null))] }], active: 's1', page: 0, slot: null };

// opts: {wanted, ports: [[id, name]], sel, hubOut, none (no Web MIDI), android: true, seed}
async function newPage(browser, opts) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await ctx.addInitScript((o) => {
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    if (o.wanted !== false) localStorage.setItem('guitarlab.midi.wanted', 'true');
    if (o.sel != null) localStorage.setItem('guitarlab.midi.outputId', JSON.stringify(o.sel));
    if (o.hubOut != null) localStorage.setItem('guitarlab.midihub.outId', JSON.stringify(o.hubOut));
    for (const k in (o.seed || {})) localStorage.setItem('guitarlab.' + k, JSON.stringify(o.seed[k]));
    window.__sent = []; window.__posts = [];
    window.__wait = (ms) => new Promise(r => setTimeout(r, ms));
    window.__q = (s) => document.querySelector(s);
    window.__toast = () => { const t = document.getElementById('app-toast'); return t && !t.hidden ? t.textContent : ''; };
    window.__hubToast = () => { const t = document.getElementById('mh-toast'); return t && !t.hidden ? t.textContent : ''; };
    window.__bar = (id) => { const c = document.getElementById(id || 'st-conn'); return c ? (c.hidden ? '' : c.textContent) : null; };
    window.__barBtns = (id) => Array.from(document.querySelectorAll('#' + (id || 'st-conn') + ' button')).map(b => b.textContent);
    // channel messages only: the lighting engine's own LUMI SysEx is not deck traffic
    window.__chan = (name) => window.__sent.filter(s => s.port === name && s.bytes[0] < 0xF0).map(s => s.bytes.join(' '));
    if (o.none) { navigator.requestMIDIAccess = undefined; return; }
    if (o.android) {
      let out = null;
      window.SoundLabMidi = { post: json => {
        const m = JSON.parse(json); window.__posts.push(m);
        const ports = o.ports.map(([id, name]) => ({ id, name }));
        if (m.cmd === 'init') setTimeout(() => window.__glMIDI.onports({ inputs: ports, outputs: ports }), 10);
        if (m.cmd === 'setOutput') out = m.id;
        if (m.cmd === 'send') { const p = o.ports.filter(x => x[0] === out)[0]; window.__sent.push({ port: p ? p[1] : '?', bytes: m.data }); }
      } };
      return;
    }
    const outs = new Map(o.ports.map(([id, name]) => [id, { id, name, state: 'connected', type: 'output', send: d => window.__sent.push({ port: name, bytes: Array.from(d) }) }]));
    const ins = new Map(o.ports.filter(p => !/Microsoft/.test(p[1])).map(([id, name]) => ['i' + id, { id: 'i' + id, name, state: 'connected', type: 'input', onmidimessage: null }]));
    navigator.requestMIDIAccess = () => Promise.resolve({ inputs: ins, outputs: outs, sysexEnabled: true, onstatechange: null });
  }, opts);
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.active === 'quiz');
  await page.waitForTimeout(300);
  return { ctx, page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  const PORTS = [['lumi', 'LUMI Keys BLOCK'], ['modx1', 'MODX-1'], ['modx2', 'MODX-2']];

  console.log('# MIDI not connected yet: the bar offers Connect MIDI');
  let { ctx, page, errs } = await newPage(browser, { wanted: false, ports: PORTS, sel: 'lumi' });
  const off = await page.evaluate(async () => {
    App.switchTo('deck'); await __wait(400);
    const o = { ready: App.midi.ready, bar: __bar(), btns: __barBtns() };
    __q('#st-next').click(); await __wait(80);
    o.sent = window.__sent.length; o.toast = __toast(); o.nudge = __q('#st-conn').classList.contains('nudge');
    __q('#st-conn button').click(); await __wait(300);
    o.readyAfter = App.midi.ready; o.barAfter = __bar(); o.toastAfter = __toast(); o.sub = __q('#st-nowsub').textContent;
    window.__sent.length = 0; __q('#st-next').click(); await __wait(80);
    o.next = __chan('MODX-1'); o.lumi = __chan('LUMI Keys BLOCK');
    return o;
  });
  ok(!off.ready && /MIDI is off/.test(off.bar) && J(off.btns) === '["Connect MIDI"]', 'MIDI off: the bar says so and offers Connect MIDI: ' + off.bar);
  ok(off.sent === 0 && /Not sent: MIDI is off/.test(off.toast) && off.nudge, 'a Next tap sends nothing, toasts on the Deck and nudges the bar: ' + off.toast);
  ok(off.readyAfter && off.barAfter === '' && /MIDI on — sending to MODX-1/.test(off.toastAfter) && /→ MODX-1$/.test(off.sub), 'Connect MIDI: the bar folds away, the toast names the synth, the sub line ends at the port (once): ' + off.sub);
  ok(off.next.some(b => /^192 /.test(b)) && off.lumi.length === 0, 'the same Next now sends the program to the MODX, nothing to the LUMI: ' + J(off.next));
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  console.log('# Synth out on the LUMI: pick the synth in place (Deck, Live, Hub)');
  ({ ctx, page, errs } = await newPage(browser, { ports: PORTS, sel: 'lumi', hubOut: 'shared', seed: { 'synthtab.live': LIVE, 'lights.on': false } }));
  const lu = await page.evaluate(async () => {
    App.switchTo('deck'); await __wait(400);
    const o = { bar: __bar(), btns: __barBtns(), sub: __q('#st-nowsub').textContent };
    window.__sent.length = 0; __q('#st-next').click(); await __wait(80); o.toast = __toast(); o.lumi = __chan('LUMI Keys BLOCK').length;
    // a refused strip drag (a turn per frame) speaks once, not once per frame
    await __wait(450); let evs = 0; App.on('synth:conn', d => { if (d && d.refused) evs++; });
    for (let v = 10; v < 90; v += 10) { App.synthDeck.perform.turn(74, v); await __wait(16); }
    o.dragEvents = evs; o.dragSent = window.__sent.filter(s => s.bytes[0] < 0xF0).length;
    // Live: a refused slot stays where it was
    App.switchTo('liveset'); await __wait(300);
    o.lvBar = __bar('st-lvconn'); o.lvBtns = __barBtns('st-lvconn');
    __q('.st-lvslot[data-slot="0"]').click(); await __wait(120);
    o.lvSlot = SLSynthLive.slot(); o.lvActive = !!__q('.st-lvslot.active'); o.lvToast = __toast(); o.lvNudge = __q('#st-lvconn').classList.contains('nudge');
    // the Hub page keeps its own toast and says where its picker is
    App.switchTo('midihub'); await __wait(300);
    const t = document.getElementById('app-toast'); if (t) t.hidden = true;
    o.hubTx = App.synthDeck.tx([0xB0, 64, 127]); await __wait(30); o.hubToast = __hubToast(); o.appToastOnHub = __toast();
    // fix it from the Live bar
    App.switchTo('liveset'); await __wait(300);
    Array.from(document.querySelectorAll('#st-lvconn button')).filter(b => b.textContent === 'MODX-1')[0].click(); await __wait(150);
    o.hubOut = SLMidiHub.outId; o.lvBarAfter = __bar('st-lvconn'); o.fixToast = __toast();
    window.__sent.length = 0;
    __q('.st-lvslot[data-slot="0"]').click(); await __wait(150);
    o.lvSlotAfter = SLSynthLive.slot(); o.lvSent = __chan('MODX-1');
    App.switchTo('deck'); await __wait(300);
    o.deckBar = __bar(); window.__sent.length = 0; __q('#st-next').click(); await __wait(80); o.next = __chan('MODX-1'); o.lumiAfter = __chan('LUMI Keys BLOCK').length;
    return o;
  });
  ok(/Synth out is the LUMI/.test(lu.bar) && J(lu.btns) === '["MODX-1","MODX-2"]', 'the bar names the LUMI and offers the synth ports (never the LUMI): ' + J(lu.btns));
  ok(/→ LUMI \(key lights\)$/.test(lu.sub), 'the Deck sub line says where bytes would go, without pointing at a picker the page does not have: ' + lu.sub);
  ok(/Not sent: the output is the LUMI/.test(lu.toast) && lu.lumi === 0, 'Next is refused out loud and nothing reaches the LUMI: ' + lu.toast);
  ok(lu.dragEvents === 1 && lu.dragSent === 0, 'a refused strip drag repaints and nudges the bar once, not every frame (' + lu.dragEvents + ')');
  ok(/Synth out is the LUMI/.test(lu.lvBar) && lu.lvBtns.length === 2, 'the Live page shows the same bar: ' + lu.lvBar);
  ok(lu.lvSlot === null && !lu.lvActive && /Not sent/.test(lu.lvToast) && lu.lvNudge, 'a refused Live slot does not light up as loaded (the stage never shows an unsent sound)');
  ok(lu.hubTx === false && /LUMI/.test(lu.hubToast) && /under Synth out/.test(lu.hubToast) && lu.appToastOnHub === '', 'on the Hub page the refusal stays in the Hub toast and points at Synth out: ' + lu.hubToast);
  ok(String(lu.hubOut) === 'modx1' && lu.lvBarAfter === '' && /Sending to MODX-1/.test(lu.fixToast), 'one tap on MODX-1 sets the Hub’s Synth out; the bar folds away: ' + lu.fixToast);
  ok(lu.lvSlotAfter === 0 && lu.lvSent.join('|') === '176 0 62|176 32 0|192 2', 'the Live slot now loads (MODX Live Set: MSB 62 / LSB 0 / PC 3): ' + J(lu.lvSent));
  ok(lu.deckBar === '' && lu.next.some(b => /^192 /.test(b)) && lu.lumiAfter === 0, 'the Deck follows: no bar, Next sends to the MODX');
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  console.log('# only the LUMI (and Windows’ GS Wavetable): no synth on the cable');
  ({ ctx, page, errs } = await newPage(browser, { ports: [['lumi', 'LUMI Keys BLOCK'], ['gs', 'Microsoft GS Wavetable Synth']], sel: 'lumi', seed: { 'lights.on': false } }));
  const ns = await page.evaluate(async () => { App.switchTo('deck'); await __wait(400); const o = { bar: __bar(), btns: __barBtns() }; window.__sent.length = 0; __q('#st-next').click(); await __wait(60); o.toast = __toast(); o.sent = window.__sent.filter(s => s.bytes[0] < 0xF0).length; return o; });
  ok(/Only the LUMI .* is connected/.test(ns.bar) && ns.btns.length === 0, 'the bar asks for the synth’s cable and never offers the GS Wavetable as the synth: ' + ns.bar);
  ok(/no synth connected/.test(ns.toast) && ns.sent === 0, 'Next: refused out loud, nothing sent: ' + ns.toast);
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  console.log('# no MIDI in the browser (Safari on an iPad)');
  ({ ctx, page, errs } = await newPage(browser, { none: true, wanted: false, ports: [] }));
  const nm = await page.evaluate(async () => { App.switchTo('deck'); await __wait(400); const o = { bar: __bar(), btns: __barBtns() }; __q('#st-next').click(); await __wait(60); o.toast = __toast(); return o; });
  ok(/No MIDI in this browser/.test(nm.bar) && /Chrome or Edge/.test(nm.bar) && nm.btns.length === 0 && /no MIDI in this browser/.test(nm.toast), 'the bar says why and where it works: ' + nm.bar);
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  console.log('# Android app: one output, on the LUMI');
  ({ ctx, page, errs } = await newPage(browser, { android: true, ports: [[7, 'LUMI Keys BLOCK'], [9, 'MODX8+']], sel: 7, seed: { 'lights.on': true } }));
  const an = await page.evaluate(async () => {
    App.switchTo('deck'); await __wait(500);
    const o = { plat: App.midi.platform, bar: __bar(), btns: __barBtns() };
    __q('#st-next').click(); await __wait(60); o.toast = __toast();
    __q('#st-conn button').click(); await __wait(300);
    o.setOut = window.__posts.filter(m => m.cmd === 'setOutput').map(m => m.id); o.fix = __toast(); o.led = App.midi.ledMode; o.lights = App.midi.lightsOn; o.barAfter = __bar();
    window.__sent.length = 0; await __wait(300); o.lightNotes = __chan('MODX8+').filter(b => /^(144|128) /.test(b)).length;
    __q('#st-next').click(); await __wait(80); o.next = __chan('MODX8+');
    return o;
  });
  ok(an.plat === 'android' && /one place at a time/.test(an.bar) && /key lights stop/.test(an.bar) && J(an.btns) === '["MODX8+"]', 'the bar explains the one native output and offers the synth: ' + an.bar);
  ok(/Not sent: the output is the LUMI/.test(an.toast), 'Next is refused out loud: ' + an.toast);
  ok(an.setOut[an.setOut.length - 1] === 9 && an.barAfter === '' && /Sending to MODX8\+ · key lights off/.test(an.fix), 'one tap moves the native output to the synth: ' + an.fix);
  ok(an.led === 'off' && !an.lights && an.lightNotes === 0, 'the key lights go off rather than PLAY on the synth (no note-ons from the lighting engine)');
  ok(an.next.some(b => /^192 /.test(b)), 'Next now sends through the bridge to the MODX: ' + J(an.next));
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
