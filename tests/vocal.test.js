// Voice page (js/vocal.js) against Chromium's fake audio device: nothing
// opens until Start listening; the pitch tap runs and frames arrive; side
// pick (Left / Right / Both); a free take records PCM, gets a score card and
// a WAV; a scale take carries 9 targets in the take's clock; Hear myself is
// connected to the master ONLY while On (and starts Off on each visit);
// leaving the page releases the input; the Train group shows the Voice pill.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: env.CHROMIUM,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']
  });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(() => {
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('soundlab2.' + k, 'true'));
    window.__gum = 0;
    const md = navigator.mediaDevices, gum = md.getUserMedia.bind(md);
    md.getUserMedia = c => { window.__gum++; return gum(c); };
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && window.SLVocal);

  console.log('# nav + nothing opens by itself');
  await page.evaluate(() => App.switchTo('vocal'));
  await wait(300);
  const nav = await page.evaluate(() => ({
    pill: [...document.querySelectorAll('#subnav .subtab')].map(b => b.textContent.trim()),
    shown: !document.getElementById('panel-vocal').hidden && document.getElementById('panel-vocal').classList.contains('active'),
    gum: window.__gum, listening: SLVocal.listening
  }));
  ok(nav.pill.includes('Voice'), 'Train group shows a Voice pill: ' + nav.pill.join(' / '));
  ok(nav.gum === 0 && !nav.listening, 'no input opened just by showing the page');
  ok(await page.evaluate(() => !!document.querySelector('#vx-graph') && /score shows here/.test(document.getElementById('vx-card').textContent)), 'graph + empty score card rendered');

  console.log('# start listening');
  await page.click('#vx-listen');
  await page.waitForFunction(() => SLVocal.listening, null, { timeout: 5000 });
  await wait(800);
  const L = await page.evaluate(() => ({ g: !!SLVocal.graph, side: SLVocal.sidetone(), btn: document.querySelector('#vx-listen span').textContent, held: App.audioIn._t().holds }));
  ok(L.g && L.btn === 'Stop listening', 'listening, graph built');
  ok(L.held.includes('vocal'), 'holds the shared input as "vocal": ' + L.held.join(','));
  ok(!L.side, 'Hear myself is Off at start');

  console.log('# side pick');
  await page.click('#vx-ch [data-v="left"]');
  ok(await page.evaluate(() => App.store.get('vx.ch') === 'left' && document.querySelector('#vx-ch [data-v="left"]').classList.contains('active')), 'Left stored + shown');
  await page.click('#vx-ch [data-v="right"]');

  console.log('# hear myself');
  await page.click('#vx-st [data-v="on"]');
  ok(await page.evaluate(() => SLVocal.sidetone()), 'On connects the sidetone');
  ok(await page.evaluate(() => /ms<\/b> of delay/.test(document.getElementById('vx-lat').innerHTML) && /MIX/.test(document.getElementById('vx-lat').textContent)), 'delay readout + MIX knob hint');
  await page.click('#vx-st [data-v="off"]');
  ok(await page.evaluate(() => !SLVocal.sidetone()), 'Off disconnects it');

  console.log('# free take');
  await page.click('#vx-mode [data-v="free"]');
  await page.click('#vx-rec');
  ok(await page.evaluate(() => SLVocal.recording && document.querySelector('#vx-rec span').textContent === 'Stop'), 'recording, button says Stop');
  await wait(1500);
  await page.click('#vx-rec');
  await wait(100);
  const T = await page.evaluate(async () => {
    const t = SLVocal.takes[0], w = SLVocal.wav();
    return { n: SLVocal.takes.length, secs: t && t.pcm.length / t.sr, frames: t && t.frames.length, card: !!SLVocal.card, tip: SLVocal.card && SLVocal.card.tip,
      wav: w && w.size, wavHead: w && String.fromCharCode(...new Uint8Array(await w.slice(0, 4).arrayBuffer())),
      rows: document.querySelectorAll('#vx-card .vx-stat').length, takes: document.querySelectorAll('.vx-take').length,
      playOn: !document.getElementById('vx-play').disabled, hist: (App.store.get('vx.hist') || []).length };
  });
  ok(T.n === 1 && T.secs > 1 && T.secs < 2.5, 'one take of ' + (T.secs || 0).toFixed(2) + ' s');
  ok(T.frames > 30, 'pitch frames captured: ' + T.frames);
  ok(T.card && T.rows >= 10 && T.tip, 'score card with ' + T.rows + ' rows; tip: ' + T.tip);
  ok(T.wavHead === 'RIFF' && T.wav > 44, 'WAV ' + T.wav + ' bytes');
  ok(T.takes === 1 && T.playOn && T.hist === 1, 'take listed, Play enabled, score saved to history');

  console.log('# play + keep + delete');
  await page.click('.vx-take [data-act="keep"]');
  ok(await page.evaluate(() => SLVocal.takes[0].kept), 'keep');
  await page.click('#vx-play');
  await wait(150);
  ok(await page.evaluate(() => /Stop/.test(document.getElementById('vx-play').textContent)), 'Play take -> Stop');
  await page.click('#vx-play');

  console.log('# scale targets');
  const S = await page.evaluate(() => {
    App.store.set('fb.root', 0); App.store.set('fb.scale', 'major'); App.store.set('vx.oct', 3); App.store.set('met.bpm', 120);
    const t = SLVocal.targets('scale');
    return { midis: t.list.map(n => n.midi), lead: t.lead, first: t.list[0].t, beat: t.beat };
  });
  ok(S.midis.join(' ') === '48 50 52 53 55 53 52 50 48', 'C major from C3, 1-5-1: ' + S.midis.join(' '));
  ok(Math.abs(S.lead - 2) < 1e-6 && Math.abs(S.first - 2) < 1e-6, 'one-bar count-in at 120 bpm = 2 s');
  await page.click('#vx-mode [data-v="scale"]');
  await page.click('#vx-rec');
  await wait(600);
  await page.click('#vx-rec');
  await wait(100);
  const S2 = await page.evaluate(() => ({ n: SLVocal.takes.length, tg: SLVocal.takes[0].targets.length, t0: SLVocal.takes[0].targets[0].t, missed: SLVocal.card.missed }));
  ok(S2.n === 2 && S2.tg === 9 && S2.t0 > 1.9 && S2.t0 < 2.4, 'scale take has 9 targets, first at ' + S2.t0.toFixed(2) + ' s');
  ok(S2.missed === 9, 'stopped early: all 9 counted as not sung');
  await page.click('.vx-take:not(.sel) [data-act="sel"]').catch(() => {});
  await page.evaluate(() => { const id = SLVocal.takes[0].id; document.querySelector('.vx-take[data-id="' + id + '"] [data-act="del"]').click(); });
  ok(await page.evaluate(() => SLVocal.takes.length === 1), 'delete');

  console.log('# leaving releases everything');
  await page.click('#vx-st [data-v="on"]');
  await page.evaluate(() => App.switchTo('tuner'));
  await wait(300);
  const H = await page.evaluate(() => ({ l: SLVocal.listening, holds: App.audioIn._t().holds, side: SLVocal.sidetone(), stream: !!App.audioIn._t().stream }));
  ok(!H.l && !H.holds.includes('vocal') && !H.side && !H.stream, 'page left: not listening, input released, no sidetone');
  await page.evaluate(() => App.switchTo('vocal'));
  await wait(200);
  ok(await page.evaluate(() => document.querySelector('#vx-st [data-v="off"]').classList.contains('active') && !SLVocal.listening), 'back on the page: Hear myself Off, not listening');

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
