// 1.4.1 ports by name: Chrome on Windows numbers MIDI ports by position
// ("output-1"...), and the order changes when another app (FL Studio)
// lets go of a device. A saved id that now points at another port must
// not steal the LUMI's lights; the LUMI is found again by name, and its
// FIRST port (not "MIDIOUT2 (...)") takes the light commands.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

async function newPage(browser, seed, outs) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(([seed, outs]) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('soundlab2.' + k, 'true'));
    for (const k in seed) localStorage.setItem('soundlab2.' + k, JSON.stringify(seed[k]));
    window.__sent = {};
    const mkOut = (id, name) => { window.__sent[id] = []; return { id, name, state: 'connected', send: b => window.__sent[id].push(Array.from(b)) }; };
    const lumiIn = { id: 'input-1', name: 'LUMI Keys Block', state: 'connected', onmidimessage: null };
    const access = { inputs: new Map([['input-1', lumiIn]]), outputs: new Map(outs.map(([i, n]) => [i, mkOut(i, n)])), sysexEnabled: true, onstatechange: null };
    navigator.requestMIDIAccess = () => Promise.resolve(access);
    window.__sysex = id => window.__sent[id].filter(b => b[0] === 0xf0).length;
  }, [seed || {}, outs]);
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.active === 'quiz');
  return { ctx, page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM });
  // after FL Studio let go, Windows lists the ports in a new order
  const NEW_ORDER = [['output-1', 'Steinberg UR24C-1'], ['output-2', 'MIDIOUT2 (LUMI Keys Block)'], ['output-3', 'LUMI Keys Block']];

  console.log('# an older install: saved by position only, the spots now hold other ports');
  let { ctx, page, errs } = await newPage(browser, { 'midi.outputId': 'output-2', 'lights.outputId': 'output-1', 'lights.displayEnabled': true }, NEW_ORDER);
  const a = await page.evaluate(async () => {
    App.switchTo('piano');
    await new Promise(r => setTimeout(r, 600));
    return { out: App.midi.outputName, lights: App.midi.displayState, lumi: __sysex('output-3'), ur: __sysex('output-1'), two: __sysex('output-2'),
      savedId: JSON.parse(localStorage.getItem('soundlab2.lights.outputId')), savedName: JSON.parse(localStorage.getItem('soundlab2.lights.outputName')) };
  });
  ok(a.lights.connected && a.lights.name === 'LUMI Keys Block', 'the lights find the LUMI by name, not the UR24C now at output-1: ' + a.lights.reason);
  ok(a.out === 'LUMI Keys Block', 'the key-light output skips the LUMI second port: ' + a.out);
  ok(a.lumi > 0 && a.ur === 0 && a.two === 0, 'scale colors (SysEx) reach the LUMI main port only: lumi=' + a.lumi + ' ur24c=' + a.ur + ' port2=' + a.two);
  ok(a.savedId === 'output-3' && a.savedName === 'LUMI Keys Block', 'the new spot and the name are saved');
  ok(!errs.length, 'no page errors: ' + errs.join(' | '));
  await ctx.close();

  console.log('# saved by name: the order changes again on the next start');
  ({ ctx, page, errs } = await newPage(browser, { 'midi.outputId': 'output-3', 'midi.outputName': 'LUMI Keys Block', 'lights.outputId': 'output-3', 'lights.outputName': 'LUMI Keys Block', 'lights.displayEnabled': true },
    [['output-1', 'LUMI Keys Block'], ['output-2', 'MIDIOUT2 (LUMI Keys Block)'], ['output-3', 'Steinberg UR24C-1']]));
  const b = await page.evaluate(async () => {
    App.switchTo('piano');
    await new Promise(r => setTimeout(r, 600));
    return { out: App.midi.outputName, name: App.midi.displayState.name, lumi: __sysex('output-1'), ur: __sysex('output-3') };
  });
  ok(b.out === 'LUMI Keys Block' && b.name === 'LUMI Keys Block' && b.lumi > 0 && b.ur === 0, 'followed by name to its new spot: ' + JSON.stringify(b));
  await ctx.close();

  console.log('# a chosen synth output is kept');
  ({ ctx, page, errs } = await newPage(browser, {}, [['output-1', 'LUMI Keys Block'], ['output-2', 'MODX-1']]));
  const c = await page.evaluate(() => {
    App.midi.setOutput('output-2');
    return { out: App.midi.outputName, name: JSON.parse(localStorage.getItem('soundlab2.midi.outputName')) };
  });
  ok(c.out === 'MODX-1' && c.name === 'MODX-1', 'picking the MODX by hand sticks and saves its name');
  await ctx.close();

  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
