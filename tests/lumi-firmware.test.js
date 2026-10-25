// What the STOCK LUMI firmware taught us on 2026-10-25 (a real LUMI Keys Block
// over Bluetooth, Matt watching): every SysEx config frame wipes the keys the
// app lit, a key you press loses its light until the app re-sends it, and a
// stored output that is not on the bus must not leave the LUMI dark. A fake
// Web MIDI access records every byte; the checks pin the engine's answers.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

async function newPage(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript((seed) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.lights.display', 'false');
    for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
    window.__sent = [];
    const inp = { id: 'lumi-in', name: 'LUMI Keys Block ALXJ (Bluetooth MIDI IN)', onmidimessage: null, state: 'connected' };
    const out = { id: 'lumi-out', name: 'LUMI Keys Block ALXJ (Bluetooth MIDI OUT)', state: 'connected', send: b => window.__sent.push(Array.from(b)) };
    const synth = { id: 'modx-out', name: 'MODX-1', state: 'connected', send: b => window.__sent.push(['modx'].concat(Array.from(b))) };
    window.__in = inp; window.__out = out; window.__synth = synth;
    const access = { inputs: new Map([['lumi-in', inp]]), outputs: new Map([['lumi-out', out]]), sysexEnabled: true, onstatechange: null };
    window.__access = access;
    navigator.requestMIDIAccess = () => Promise.resolve(access);
    window.__cfg = (from) => window.__sent.slice(from).filter(b => b[0] === 0xf0 && b[6] === 0x10 && b[7] === 0x40).length;
    window.__ons = (from) => window.__sent.slice(from).filter(b => b[0] === 0x90);
    window.__lit = () => { const l = {}; window.__sent.forEach(b => { if (b[0] === 0x90) l[b[1]] = b[2]; else if (b[0] === 0x80) delete l[b[1]]; }); return l; };
    window.__press = (n) => { inp.onmidimessage({ data: new Uint8Array([0x90, n, 100]) }); };
    window.__release = (n) => { inp.onmidimessage({ data: new Uint8Array([0x80, n, 64]) }); };
  }, seed || {});
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.active === 'quiz');
  return { ctx, page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });

  console.log('# config frames go once, and every lit key is re-sent after them');
  let { ctx, page, errs } = await newPage(browser);
  const cfg = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    App.emit('fb:set', { source: 't', root: 0, scale: 'major', mode: 1 }); App.help.set(4); await wait(50);
    const o = { out: App.midi.outputName, lumi: App.midi.lumi, lit0: Object.keys(__lit()).length };
    let from = __sent.length;
    // a synth plugging in: Web MIDI fires statechange per port; the output did not change
    for (let i = 0; i < 6; i++) { __access.outputs.set('modx' + i, { id: 'modx' + i, name: 'MODX-' + i, state: 'connected', send: () => {} }); __access.onstatechange({ port: __access.outputs.get('modx' + i) }); }
    await wait(50);
    o.framesOnStatechange = __cfg(from); o.onsOnStatechange = __ons(from).length; o.outAfter = App.midi.outputName;
    // a real change (brightness) goes once and brings every key back
    from = __sent.length; App.store.set('lights.bright', 40); App.midi.repaint(); await wait(50);
    o.framesOnBright = __cfg(from); o.onsOnBright = __ons(from).length; o.litNow = Object.keys(__lit()).length;
    // nothing changed: a plain repaint sends no frame
    from = __sent.length; App.help.set(4); App.emit('help:level', { level: 4 }); await wait(30);
    o.framesIdle = __cfg(from);
    return o;
  });
  ok(cfg.lumi && /LUMI/.test(cfg.out) && cfg.lit0 > 0, 'the fake LUMI is the light output with the scale lit: ' + cfg.lit0 + ' keys');
  ok(cfg.framesOnStatechange === 0 && cfg.onsOnStatechange === 0 && /LUMI/.test(cfg.outAfter), 'six port-change announcements with the same output send NO config frame and no note (was 48 frames on the real unit): ' + cfg.framesOnStatechange);
  ok(cfg.framesOnBright === 4 && cfg.onsOnBright >= cfg.lit0 && cfg.litNow === cfg.lit0, 'a brightness change sends the two frames (x2 device ids) once and re-lights every key: ' + cfg.framesOnBright + ' frames, ' + cfg.onsOnBright + ' note-ons');
  ok(cfg.framesIdle === 0, 'a repaint with nothing changed sends no config frame');

  console.log('# a played key gets its light back (relight)');
  const rl = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const lit = __lit(); const key = Number(Object.keys(lit)[0]); const vel = lit[key];
    const o = { key, vel, relight: App.midi.relight };
    let from = __sent.length; __press(key); __release(key); await wait(30);
    o.resent = __ons(from).filter(b => b[1] === key).map(b => b[2]);
    App.midi.holdRelight('lesson', true); from = __sent.length; __press(key); __release(key); await wait(30);
    o.heldResent = __ons(from).filter(b => b[1] === key).length; o.heldState = App.midi.relight;
    App.midi.holdRelight('lesson', false);
    App.midi.setRelight(false); from = __sent.length; __press(key); __release(key); await wait(30);
    o.offResent = __ons(from).filter(b => b[1] === key).length; o.offState = App.midi.relight;
    App.midi.setRelight(true);
    // a key the app did not light gets nothing
    const dark = [...Array(24).keys()].map(i => App.midi.range().lo + i).find(n => __lit()[n] == null);
    from = __sent.length; __press(dark); __release(dark); await wait(30);
    o.darkResent = __ons(from).filter(b => b[1] === dark).length;
    return o;
  });
  ok(rl.relight === true && rl.resent.length === 1 && rl.resent[0] === rl.vel, 'releasing a lit key re-sends its note-on with the same color: key ' + rl.key + ' vel ' + rl.vel);
  ok(rl.heldResent === 0 && rl.heldState === false, 'holdRelight(owner) keeps a played key dark (progress feedback for a lesson)');
  ok(rl.offResent === 0 && rl.offState === false, 'setRelight(false) switches it off app-wide');
  ok(rl.darkResent === 0, 'a key the app never lit is left alone');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# a stored output that is not on the bus');
  ({ ctx, page, errs } = await newPage(browser, { 'midi.outputId': 'output-1' }));
  const st = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    App.emit('fb:set', { source: 't', root: 0, scale: 'major', mode: 1 }); App.help.set(4); await wait(50);
    return { out: App.midi.outputName, lumi: App.midi.lumi, lit: Object.keys(__lit()).length, stored: App.store.get('midi.outputId', null) };
  });
  ok(/LUMI/.test(st.out) && st.lumi && st.lit > 0, 'a stale midi.outputId no longer leaves the LUMI dark: it stands in as the light output (' + st.lit + ' keys lit)');
  ok(st.stored === 'output-1', 'the stored choice is kept for when that output returns: ' + st.stored);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close(); await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
