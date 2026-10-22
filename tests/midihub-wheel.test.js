// MIDI Hub Control view: a mouse-wheel page scroll that passes over the big
// knobs must not turn them (it sent CC7/CC74 down and the synth went quiet);
// a knob that was clicked still turns with the wheel.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 700 } });
  await ctx.addInitScript(() => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.lights.on', 'false');
    window.__sent = [];
    const inp = { id: 'in1', name: 'MODX-1', state: 'connected', onmidimessage: null };
    const out = { id: 'out1', name: 'MODX-1', state: 'connected', send: b => window.__sent.push(Array.from(b)) };
    const access = { inputs: new Map([['in1', inp]]), outputs: new Map([['out1', out]]), sysexEnabled: true, onstatechange: null };
    navigator.requestMIDIAccess = () => Promise.resolve(access);
  });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.midi.hasOutput && App.active === 'quiz');
  await page.evaluate(() => { App.switchTo('midihub'); });
  await page.waitForSelector('.mh-knob[data-cc="7"]', { state: 'visible' });
  const vol = page.locator('.mh-knob[data-cc="7"]');
  await vol.scrollIntoViewIfNeeded();
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); window.__sent.length = 0; });
  const before = await page.evaluate(() => ({ v: SLMidiHub.knob(7), y: window.scrollY }));
  const box = await vol.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 120);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ v: SLMidiHub.knob(7), y: window.scrollY,
    cc7: window.__sent.filter(b => (b[0] & 0xF0) === 0xB0 && b[1] === 7).length }));
  ok(after.v === before.v && after.cc7 === 0, 'wheel over an untouched Volume knob leaves it alone: ' + before.v + ' -> ' + after.v + ', CC7 sent ' + after.cc7);
  ok(after.y > before.y, 'and the page scrolls instead: scrollY ' + before.y + ' -> ' + after.y);

  // click it (no drag) and the wheel turns it
  await vol.scrollIntoViewIfNeeded();
  const b2 = await vol.boundingBox();
  await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2);
  const v0 = await page.evaluate(() => { window.__sent.length = 0; return SLMidiHub.knob(7); });
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(200);
  const turned = await page.evaluate(() => ({ v: SLMidiHub.knob(7), sent: window.__sent.filter(b => (b[0] & 0xF0) === 0xB0 && b[1] === 7).map(b => b.join(' ')),
    focused: document.activeElement && document.activeElement.dataset.cc }));
  ok(turned.focused === '7' && turned.v === v0 - 4 && turned.sent.length === 1, 'a clicked knob turns with the wheel: ' + v0 + ' -> ' + turned.v + ' ' + turned.sent.join());
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
