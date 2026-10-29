// A send the Synth tab cannot make is never silent (alongside the 1.3.1
// connect panel, tests/synthconnect.test.js): a refused send (a remote press,
// a Live slot, the deck's funnel) toasts its reason on the page (App.toast;
// the Hub page keeps its own #mh-toast) and nudges the panel; a Live slot stays
// put when nothing went out; a refused strip drag speaks once; on the Android
// app (ONE output, shared with the key lights) picking the synth in the panel
// moves that output and switches the key lights off. After the fix the same
// press sends. Nothing may reach the LUMI as channel messages.
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
    window.__pick = (id, value) => { const sel = document.querySelector('#' + (id || 'st-conn') + ' [data-conn="out"]'); if (!sel) return false; sel.value = String(value); sel.dispatchEvent(new Event('change', { bubbles: true })); return true; };
    window.__opts = (id) => Array.from(document.querySelectorAll('#' + (id || 'st-conn') + ' [data-conn="out"] option')).map(o => o.textContent);
    window.__nudged = (id) => document.getElementById(id || 'st-conn').classList.contains('st-nudge');
    if (navigator.permissions) { const q0 = navigator.permissions.query.bind(navigator.permissions); navigator.permissions.query = d => d && d.name === 'midi' ? Promise.resolve({ state: 'prompt' }) : q0(d); }
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

  console.log('# MIDI not connected yet: a refused press says so, Connect fixes it');
  let { ctx, page, errs } = await newPage(browser, { wanted: false, ports: PORTS, sel: 'lumi', seed: { 'lights.on': false } });
  const off = await page.evaluate(async () => {
    App.switchTo('deck'); await __wait(400);
    const o = { ready: App.midi.ready, panel: __bar(), go: !!__q('#st-conn [data-conn="go"]') };
    o.r = App.remoteAction('next', { via: 'test' }); await __wait(40);
    o.toast = __toast(); o.nudge = __nudged(); o.sent = window.__sent.length;
    __q('#st-conn [data-conn="go"]').click(); await __wait(300);
    o.readyAfter = App.midi.ready; o.panelAfter = __bar();
    window.__sent.length = 0; __q('#st-next').click(); await __wait(80);
    o.next = __chan('MODX-1'); o.lumi = __chan('LUMI Keys BLOCK');
    return o;
  });
  ok(!off.ready && /Connect your synth/.test(off.panel) && off.go, 'MIDI off: the connect panel offers Connect: ' + off.panel);
  ok(off.r === false && /Not sent: MIDI is off — tap Connect at the top of the page/.test(off.toast) && off.nudge && off.sent === 0, 'a remote Next is refused out loud and nudges the panel: ' + off.toast);
  ok(off.readyAfter && off.panelAfter === '' && off.next.some(b => /^192 /.test(b)) && off.lumi.length === 0, 'after Connect the panel folds away and Next sends the program to the MODX: ' + J(off.next));
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  console.log('# Synth out on the LUMI: refusals on the Deck, Live and the Hub; the panel fixes it');
  ({ ctx, page, errs } = await newPage(browser, { ports: PORTS, sel: 'lumi', hubOut: 'shared', seed: { 'synthtab.live': LIVE, 'lights.on': false } }));
  const lu = await page.evaluate(async () => {
    App.switchTo('deck'); await __wait(400);
    const o = { panel: __bar(), opts: __opts() };
    window.__sent.length = 0;
    o.r = App.remoteAction('next', { via: 'test' }); await __wait(40); o.toast = __toast(); o.lumi = __chan('LUMI Keys BLOCK').length;
    // a refused strip drag (a turn per frame) speaks once, not once per frame
    await __wait(450); let evs = 0; App.on('synth:conn', d => { if (d && d.refused) evs++; });
    for (let v = 10; v < 90; v += 10) { App.synthDeck.perform.turn(74, v); await __wait(16); }
    o.dragEvents = evs; o.dragSent = window.__sent.filter(s => s.bytes[0] < 0xF0).length;
    // Live: a refused slot stays where it was
    App.switchTo('liveset'); await __wait(300);
    o.lvPanel = __bar('st-lvconn');
    __q('.st-lvslot[data-slot="0"]').click(); await __wait(120);
    o.lvSlot = SLSynthLive.slot(); o.lvActive = !!__q('.st-lvslot.active'); o.lvToast = __toast(); o.lvNudge = __nudged('st-lvconn');
    // the Hub page keeps its own toast and points at its Synth out row
    App.switchTo('midihub'); await __wait(300);
    const t = document.getElementById('app-toast'); if (t) t.hidden = true;
    o.hubTx = App.synthDeck.tx([0xB0, 64, 127]); await __wait(30); o.hubToast = __hubToast(); o.appToastOnHub = __toast();
    // the fix, from the Live page's panel
    App.switchTo('liveset'); await __wait(300);
    o.picked = __pick('st-lvconn', 'modx1'); await __wait(150);
    o.hubOut = SLMidiHub.outId; o.lvPanelAfter = __bar('st-lvconn');
    window.__sent.length = 0;
    __q('.st-lvslot[data-slot="0"]').click(); await __wait(150);
    o.lvSlotAfter = SLSynthLive.slot(); o.lvSent = __chan('MODX-1');
    App.switchTo('deck'); await __wait(300);
    o.deckPanel = __bar(); window.__sent.length = 0; __q('#st-next').click(); await __wait(80); o.next = __chan('MODX-1'); o.lumiAfter = __chan('LUMI Keys BLOCK').length;
    return o;
  });
  ok(/Sending to the LUMI/.test(lu.panel) && lu.opts.some(t => /MODX-1/.test(t)), 'the panel names the LUMI and offers the synth: ' + J(lu.opts));
  ok(lu.r === false && /Not sent: the output is the LUMI .* pick the synth at the top of the page/.test(lu.toast) && lu.lumi === 0, 'a remote Next is refused out loud; nothing reaches the LUMI: ' + lu.toast);
  ok(lu.dragEvents === 1 && lu.dragSent === 0, 'a refused strip drag repaints and nudges the panel once, not every frame (' + lu.dragEvents + ')');
  ok(/Sending to the LUMI/.test(lu.lvPanel), 'the Live page shows the same panel');
  ok(lu.lvSlot === null && !lu.lvActive && /Not sent/.test(lu.lvToast) && lu.lvNudge, 'a refused Live slot does not light up as loaded (the stage never shows an unsent sound)');
  ok(lu.hubTx === false && /LUMI/.test(lu.hubToast) && /under Synth out/.test(lu.hubToast) && lu.appToastOnHub === '', 'on the Hub page the refusal stays in the Hub toast and points at Synth out: ' + lu.hubToast);
  ok(lu.picked && String(lu.hubOut) === 'modx1' && lu.lvPanelAfter === '', 'picking the MODX in the panel sets the Hub’s Synth out; the panel folds away');
  ok(lu.lvSlotAfter === 0 && lu.lvSent.join('|') === '176 0 62|176 32 0|192 2', 'the Live slot now loads (MODX Live Set: MSB 62 / LSB 0 / PC 3): ' + J(lu.lvSent));
  ok(lu.deckPanel === '' && lu.next.some(b => /^192 /.test(b)) && lu.lumiAfter === 0, 'the Deck follows: no panel, Next sends to the MODX');
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  console.log('# only the LUMI (and Windows’ GS Wavetable); no MIDI in the browser');
  ({ ctx, page, errs } = await newPage(browser, { ports: [['lumi', 'LUMI Keys BLOCK'], ['gs', 'Microsoft GS Wavetable Synth']], sel: 'lumi', seed: { 'lights.on': false } }));
  const ns = await page.evaluate(async () => { App.switchTo('deck'); await __wait(400); window.__sent.length = 0; const r = App.remoteAction('next', { via: 'test' }); await __wait(40); return { r, toast: __toast(), sent: window.__sent.filter(s => s.bytes[0] < 0xF0).length }; });
  ok(ns.r === false && /no synth connected/.test(ns.toast) && ns.sent === 0, 'only a LUMI: a press is refused as "no synth connected" (the GS Wavetable is not your synth): ' + ns.toast);
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();
  ({ ctx, page, errs } = await newPage(browser, { none: true, wanted: false, ports: [] }));
  const nm = await page.evaluate(async () => { App.switchTo('deck'); await __wait(400); const r = App.remoteAction('next', { via: 'test' }); await __wait(40); return { r, panel: __bar(), toast: __toast() }; });
  ok(nm.r === false && /can.t reach MIDI/.test(nm.panel) && /no MIDI in this browser/.test(nm.toast), 'no Web MIDI: the panel says so and a press is refused out loud: ' + nm.toast);
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  console.log('# the Android app: one output, on the LUMI');
  ({ ctx, page, errs } = await newPage(browser, { android: true, ports: [[7, 'LUMI Keys BLOCK'], [9, 'MODX8+']], sel: 7, seed: { 'lights.on': true } }));
  const an = await page.evaluate(async () => {
    App.switchTo('deck'); await __wait(500);
    const o = { plat: App.midi.platform, panel: __bar(), opts: __opts() };
    o.picked = __pick('st-conn', '9'); await __wait(300);
    o.setOut = window.__posts.filter(m => m.cmd === 'setOutput').map(m => m.id); o.toast = __toast(); o.led = App.midi.ledMode; o.lights = App.midi.lightsOn; o.panelAfter = __bar();
    window.__sent.length = 0; await __wait(300); o.lightNotes = __chan('MODX8+').filter(b => /^(144|128) /.test(b)).length;
    __q('#st-next').click(); await __wait(80); o.next = __chan('MODX8+');
    return o;
  });
  ok(an.plat === 'android' && /Sending to the LUMI/.test(an.panel) && /one place at a time/.test(an.panel) && an.opts.some(t => /MODX8\+/.test(t)), 'the panel explains the one native output and offers the synth: ' + an.panel);
  ok(an.picked && an.setOut[an.setOut.length - 1] === 9 && an.panelAfter === '' && /Synth out: MODX8\+ · key lights off/.test(an.toast), 'picking the MODX moves the native output to it: ' + an.toast);
  ok(an.led === 'off' && !an.lights && an.lightNotes === 0, 'the key lights go off rather than PLAY on the synth (no note-ons from the lighting engine)');
  ok(an.next.some(b => /^192 /.test(b)), 'Next now sends through the bridge to the MODX: ' + J(an.next));
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
