// Synth tab connection (1.3.1): the Deck and Live pages connect to MIDI by themselves and say
// what is missing. Before, a first visit showed live-looking controls that silently refused
// every tap (found on Matt's MODX8+ on 2026-10-26: the controls worked once connected, but
// nothing on the Synth tab ever asked the browser for MIDI).
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

// opts: midi = 'none' | 'fake'; perm = 'prompt' | 'granted' | 'denied'; reject = true makes requestMIDIAccess fail;
// outs = which fake outputs exist; wanted = midi.wanted; outId = a stored Hub output
async function open(browser, opts, viewport) {
  const ctx = await browser.newContext(Object.assign({ viewport: viewport || { width: 1200, height: 900 }, serviceWorkers: 'block' }, opts.ctx || {}));
  await ctx.addInitScript((o) => {
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    if (o.wanted) localStorage.setItem('guitarlab.midi.wanted', 'true');
    localStorage.setItem('guitarlab.lights.on', 'false');
    localStorage.setItem('guitarlab.midihub.profile', JSON.stringify('yamaha'));
    if (o.outId) localStorage.setItem('guitarlab.midihub.outId', JSON.stringify(o.outId));
    window.__wait = ms => new Promise(r => setTimeout(r, ms));
    window.__sent = { modx: [], lumi: [] }; window.__asks = 0;
    if (o.midi === 'none') {
      try { delete Navigator.prototype.requestMIDIAccess; } catch (e) { }
      try { Object.defineProperty(navigator, 'requestMIDIAccess', { value: undefined, configurable: true }); } catch (e) { }
    } else {
      const outs = new Map(), ins = new Map();
      if (o.outs.includes('modx')) { outs.set('modx1', { id: 'modx1', name: 'MODX-1', state: 'connected', send: b => __sent.modx.push(Array.from(b)) }); ins.set('mi', { id: 'mi', name: 'MODX-1', state: 'connected', onmidimessage: null }); }
      if (o.outs.includes('lumi')) outs.set('lumi1', { id: 'lumi1', name: 'LUMI Keys Block', state: 'connected', send: b => __sent.lumi.push(Array.from(b)) });
      navigator.requestMIDIAccess = () => { __asks++; return o.reject ? Promise.reject(new DOMException('denied', 'NotAllowedError')) : Promise.resolve({ inputs: ins, outputs: outs, sysexEnabled: true, onstatechange: null }); };
    }
    const q = navigator.permissions && navigator.permissions.query ? navigator.permissions.query.bind(navigator.permissions) : null;
    if (navigator.permissions) navigator.permissions.query = d => d && d.name === 'midi' ? Promise.resolve({ state: o.perm || 'prompt' }) : (q ? q(d) : Promise.reject(new Error('no')));
  }, opts);
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && window.SLSynthTab && window.SLSynthLive);
  return { ctx, page, errs };
}
const view = page => page.evaluate(() => {
  const c = document.getElementById('st-conn');
  return { k: c && !c.hidden ? c.dataset.k : 'hidden', head: c ? (c.querySelector('.st-connhead') || {}).textContent || '' : '', body: c ? (c.querySelector('.st-connbody') || {}).textContent || '' : '',
    btn: !!(c && !c.hidden && c.querySelector('[data-conn="go"]')), sel: c && !c.hidden && c.querySelector('[data-conn="out"]') ? [...c.querySelectorAll('option')].map(o => o.textContent) : null,
    offline: document.querySelector('#panel-deck .st-face').classList.contains('st-offline'), asks: __asks, sent: __sent.modx.length, lumi: __sent.lumi.filter(m => !(m[0] === 0xF0 && m[1] === 0x00 && m[2] === 0x21 && m[3] === 0x10)).length, // the key-light engine's own ROLI frames are fine; synth messages are not
    sub: (document.getElementById('st-nowsub') || {}).textContent || '' };
});

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM });

  console.log('# an iPad without Web MIDI');
  let { ctx, page, errs } = await open(browser, { midi: 'none', ctx: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', hasTouch: true, isMobile: true } }, { width: 820, height: 1180 });
  await page.evaluate(() => App.switchTo('deck')); await page.waitForTimeout(500);
  let v = await view(page);
  ok(v.k === 'unsupported' && /can’t reach MIDI/.test(v.head) && /iPad/.test(v.body) && /MIDIWeb Browser/.test(v.body) && !v.btn && v.offline, 'the Deck says this browser has no MIDI, names the iPad apps, dims the controls: ' + v.head);
  await page.locator('#st-chips button', { hasText: 'Arpeggiator' }).tap(); await page.waitForTimeout(200);
  const nudged = await page.evaluate(() => document.getElementById('st-conn').classList.contains('st-nudge'));
  ok(nudged && (await page.locator('#st-chips button', { hasText: 'Arpeggiator' }).getAttribute('aria-pressed')) === 'false', 'a tap while offline points at the panel instead of doing nothing');
  await page.evaluate(() => App.switchTo('liveset')); await page.waitForTimeout(300);
  const lv = await page.evaluate(() => { const c = document.getElementById('st-lvconn'); return { shown: !!c && !c.hidden, k: c && c.dataset.k }; });
  ok(lv.shown && lv.k === 'unsupported', 'the Live page shows the same panel');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# never connected: no prompt by itself, one Connect button');
  ({ ctx, page, errs } = await open(browser, { midi: 'fake', outs: ['modx', 'lumi'], perm: 'prompt' }));
  await page.evaluate(() => App.switchTo('deck')); await page.waitForTimeout(500);
  v = await view(page);
  ok(v.k === 'off' && v.btn && v.asks === 0 && v.offline && /Connect your synth/.test(v.head), 'the Deck offers Connect and has not asked the browser yet: ' + JSON.stringify({ k: v.k, asks: v.asks }));
  await page.locator('#st-conn [data-conn="go"]').click();
  await page.waitForFunction(() => App.midi.ready); await page.waitForTimeout(400);
  v = await view(page);
  ok(v.k === 'hidden' && !v.offline && v.asks === 1 && (await page.evaluate(() => App.store.get('midi.wanted'))) === true, 'Connect asks once, the panel goes away and the controls come alive');
  await page.locator('#st-chips button', { hasText: 'Arpeggiator' }).click(); await page.waitForTimeout(300);
  v = await view(page);
  ok(v.sent > 0 && v.lumi === 0, 'the Arpeggiator tap reaches the MODX and no synth message reaches the LUMI: ' + v.sent + ' message(s)');
  ok((v.sub.match(/MODX-1/g) || []).length === 1, 'the Now bar names the output once: ' + v.sub);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# the browser already allows MIDI for this site');
  ({ ctx, page, errs } = await open(browser, { midi: 'fake', outs: ['modx'], perm: 'granted' }));
  await page.evaluate(() => App.switchTo('deck'));
  await page.waitForFunction(() => App.midi.ready, null, { timeout: 5000 }).catch(() => { }); await page.waitForTimeout(400);
  v = await view(page);
  ok(v.k === 'hidden' && v.asks === 1 && !v.offline, 'showing the Deck connects silently, no button: ' + JSON.stringify({ k: v.k, asks: v.asks }));
  await ctx.close();

  console.log('# the browser blocks MIDI');
  ({ ctx, page, errs } = await open(browser, { midi: 'fake', outs: ['modx'], perm: 'prompt', reject: true }));
  await page.evaluate(() => App.switchTo('deck')); await page.waitForTimeout(400);
  await page.locator('#st-conn [data-conn="go"]').click(); await page.waitForTimeout(500);
  v = await view(page);
  ok(v.k === 'denied' && v.btn && /blocked/.test(v.head) && /site settings/.test(v.body), 'a refused prompt says how to allow MIDI and offers Try again: ' + v.head);
  await ctx.close();
  ({ ctx, page, errs } = await open(browser, { midi: 'fake', outs: ['modx'], perm: 'denied' }));
  await page.evaluate(() => App.switchTo('deck')); await page.waitForTimeout(500);
  v = await view(page);
  ok(v.k === 'denied' && v.asks === 0, 'a site already blocked shows that state on arrival without asking');
  await ctx.close();

  console.log('# the LUMI chosen as the synth output');
  ({ ctx, page, errs } = await open(browser, { midi: 'fake', outs: ['modx', 'lumi'], wanted: true, outId: 'lumi1' }));
  await page.evaluate(() => App.switchTo('deck'));
  await page.waitForFunction(() => App.midi.ready); await page.waitForTimeout(500);
  v = await view(page);
  ok(v.k === 'lumi' && v.sel && v.sel.some(o => /LUMI.*key lights/.test(o)) && v.sel.includes('MODX-1') && v.offline, 'the panel says the LUMI is the output and lists the synth: ' + JSON.stringify(v.sel));
  await page.locator('#st-conn [data-conn="out"]').selectOption('modx1'); await page.waitForTimeout(300);
  await page.locator('#st-chips button', { hasText: 'Motion sequencer' }).click(); await page.waitForTimeout(300);
  v = await view(page);
  ok(v.k === 'hidden' && v.sent > 0 && v.lumi === 0 && (await page.evaluate(() => App.store.get('midihub.outId'))) === 'modx1', 'choosing the MODX there fixes it; taps reach the MODX only');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# the MODX sends its MIDI clock: slow finger taps still land');
  ({ ctx, page, errs } = await open(browser, { midi: 'fake', outs: ['modx'], wanted: true }));
  await page.evaluate(() => App.switchTo('deck'));
  await page.waitForFunction(() => App.midi.ready); await page.waitForTimeout(400);
  // ~36 clock ticks a second plus active sensing, as the MODX8+ sent on 2026-10-26
  await page.evaluate(() => {
    const inp = App.midi.inputs.length ? null : null;
    window.__clock = setInterval(() => { App.emit('midi:raw', { bytes: [0xF8], portId: 'mi' }); }, 28);
    window.__sense = setInterval(() => { App.emit('midi:raw', { bytes: [0xFE], portId: 'mi' }); }, 250);
    window.__nodes = { arp: document.querySelector('[data-chip="arpMaster"]'), s2: document.querySelector('.st-scene[data-chip="scene2"]') };
  });
  await page.waitForTimeout(1000);
  const kept = await page.evaluate(() => __nodes.arp === document.querySelector('[data-chip="arpMaster"]') && __nodes.s2 === document.querySelector('.st-scene[data-chip="scene2"]') && document.body.contains(__nodes.arp));
  ok(kept, 'a second of clock and active sensing leaves the chip and Scene buttons in place');
  const taps = [];
  for (const sel of ['[data-chip="arpMaster"]', '[data-chip="arpMaster"]', '.st-scene[data-chip="scene2"]', '.st-scene[data-chip="scene1"]', '[data-chip="msMaster"]', '[data-chip="msMaster"]']) {
    const loc = page.locator(sel), before = await loc.getAttribute('aria-pressed'), bx = await loc.boundingBox();
    await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await page.mouse.down(); await page.waitForTimeout(140); await page.mouse.up(); await page.waitForTimeout(150);
    taps.push(before !== (await loc.getAttribute('aria-pressed')) ? 'ok' : 'lost');
  }
  ok(taps.every(x => x === 'ok'), 'six 140 ms finger taps during the clock all land: ' + taps.join(' '));
  // a program change from the synth still repaints the Now bar
  await page.evaluate(() => App.emit('midi:raw', { bytes: [0xC0, 4], portId: 'mi' })); await page.waitForTimeout(300);
  ok(/Program 5/.test(await page.evaluate(() => document.getElementById('st-nowsub').textContent)), 'a Program Change from the synth still moves the Now bar');
  await page.evaluate(() => { clearInterval(__clock); clearInterval(__sense); });
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# MIDI on but no synth plugged in');
  ({ ctx, page, errs } = await open(browser, { midi: 'fake', outs: [], wanted: true }));
  await page.evaluate(() => App.switchTo('deck'));
  await page.waitForFunction(() => App.midi.ready); await page.waitForTimeout(400);
  v = await view(page);
  ok(v.k === 'noout' && /No synth output/.test(v.head) && /Plug the synth in/.test(v.body), 'no output listed: the panel says to plug the synth in');
  await ctx.close();

  await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
