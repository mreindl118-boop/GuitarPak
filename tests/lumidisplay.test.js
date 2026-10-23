// LUMI Display + double-tap lesson control (v0.79.0), against a simulated
// LUMI (a fake Web MIDI access that records every byte sent): while a guide
// is up the keybed shows ONLY the notes to play, in their App.colors color
// (Interval = degree, Note = pitch class); the scale returns afterwards;
// Display off keeps the classic look; the lesson card's chips; double-tap
// of the control key / the card starts and stops a lesson.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

async function newPage(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript((seed) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
    window.__sent = [];
    const inp = { id: 'in1', name: 'LUMI Keys BLOCK', state: 'connected', onmidimessage: null };
    const out = { id: 'out1', name: 'LUMI Keys BLOCK', state: 'connected', send: b => window.__sent.push(Array.from(b)) };
    const access = { inputs: new Map([['in1', inp]]), outputs: new Map([['out1', out]]), sysexEnabled: true, onstatechange: null };
    navigator.requestMIDIAccess = () => Promise.resolve(access);
    window.__lit = () => { const l = {}; window.__sent.forEach(b => { if (b[0] === 0x90) l[b[1]] = b[2]; else if (b[0] === 0x80) delete l[b[1]]; }); return l; };
    window.__on = (n, v) => (inp.onmidimessage || (() => {}))({ data: new Uint8Array([0x90, n, v || 100]) });
    window.__off = (n) => (inp.onmidimessage || (() => {}))({ data: new Uint8Array([0x80, n, 0]) });
    window.__tap = (n) => { window.__on(n); window.__off(n); };
  }, seed || {});
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.midi.hasOutput && App.active === 'quiz');
  return { ctx, page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  let { ctx, page, errs } = await newPage(browser);

  console.log('# LUMI Display: only the notes to play, in their colors');
  const d1 = await page.evaluate(() => {
    App.emit('fb:set', { source: 't', root: 0, scale: 'major', mode: 1 });
    App.help.set(4);
    const o = { def: App.midi.display, lumi: App.midi.lumi };
    o.layout = Object.keys(__lit()).length;
    App.midi.guide(62, 64);                       // D now, E next (C major)
    const l = __lit(); o.guided = Object.keys(l).map(Number).sort((a, b) => a - b); o.vD = l[62];
    App.midi.guide(64, 65);
    o.vE = __lit()[64];
    App.midi.setDisplay(false);
    App.midi.guide(62, 64);
    const c = __lit(); o.classic = Object.keys(c).length; o.classicD = c[62];
    App.midi.setDisplay(true);
    App.midi.guide(null, null);
    o.after = Object.keys(__lit()).length;
    return o;
  });
  ok(d1.def === true && d1.lumi && d1.layout === 14, 'on by default for a LUMI; with no guide the scale shows (14 keys): ' + JSON.stringify(d1));
  ok(d1.guided.every(n => n === 62 || n === 64) && d1.guided.includes(62), 'guiding: only the note to play (and the blinking next one) are lit: ' + d1.guided);
  ok(d1.vD !== 127 && d1.vE !== 127 && d1.vD !== d1.vE, 'the note to play shows its own color, not white, and D and E differ (degree 2 vs 3): ' + d1.vD + ' / ' + d1.vE);
  ok(d1.classic === 14 && d1.classicD === d1.vD, 'legacy Guide focus off: the scale stays lit and the target retains its mapped pitch color');
  ok(d1.after === 14, 'the guide ends: the scale is back');

  console.log('# Interval vs Note colors');
  const d2 = await page.evaluate(() => {
    const vel = (root) => { App.emit('fb:set', { source: 't', root, scale: 'major', mode: 1 }); App.midi.guide(62, null); return __lit()[62]; };
    App.colors.setMode('interval');
    const iC = vel(0), iG = vel(7);       // D = degree 2 in C, degree 5 in G
    App.colors.setMode('note');
    const nC = vel(0), nG = vel(7);       // D = D's own color in every key
    App.midi.guide(null, null); App.colors.setMode('interval');
    App.emit('fb:set', { source: 't', root: 0, scale: 'major', mode: 1 });
    return { iC, iG, nC, nG };
  });
  ok(d2.iC !== d2.iG, 'Interval: D changes color with its job in the key (C vs G): ' + JSON.stringify(d2));
  ok(d2.nC === d2.nG && d2.nC !== 127, 'Note: D keeps its own color in every key');

  console.log('# lesson card: chips + double-tap');
  const c1 = await page.evaluate(async () => {
    App.switchTo('piano');
    const wait = ms => new Promise(r => setTimeout(r, ms));
    await wait(150);
    const o = { disp: !!document.getElementById('kl-disp'), dbl: !!document.getElementById('kl-dbltap') };
    o.ck = App.keysLessons.controlKey;
    o.hint = (document.querySelector('.kl-ctl') || {}).textContent || '';
    document.getElementById('kl-disp').click();
    o.dispOff = App.midi.display === false && !document.getElementById('kl-disp').classList.contains('active');
    document.getElementById('kl-disp').click();
    o.dispOn = App.midi.display === true;
    o.context = { active: App.active, sheet: App.sheet, blocked: App.interactionBlocked, dbl: App.store.get('kl.dbltap',true) };
    o.heard=[]; App.on('midi:note', d=>o.heard.push({midi:d.midi,on:d.on,silent:d.silent,mute:d.mute}));
    // double-tap the control key: starts
    __tap(o.ck); await wait(60); __tap(o.ck); await wait(80);
    o.started = App.keysLessons.view === 'run' && !!App.keysLessons.run;
    o.runHint = (document.querySelector('.kl-taphint') || {}).textContent || '';
    // during the count-in: double-tap stops
    __tap(o.ck); await wait(60); __tap(o.ck); await wait(80);
    o.stopped = App.keysLessons.view === 'list' && !App.keysLessons.run;
    // two taps too far apart: nothing
    __tap(o.ck); await wait(450); __tap(o.ck); await wait(80);
    o.slow = App.keysLessons.view === 'list';
    // a different key in between: nothing (after a pause, so the last slow tap can't pair up)
    await wait(500);
    __tap(o.ck); await wait(40); __tap(o.ck + 2); await wait(40); __tap(o.ck); await wait(80);
    o.broken = App.keysLessons.view === 'list';
    // the card: two quick taps on empty space start, two more stop
    const card = document.querySelector('.kl-title');
    const r = card.getBoundingClientRect(), x = r.left + 4, y = r.top + 4;
    const pt = () => card.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y }));
    await wait(400); pt(); await wait(80); pt(); await wait(80);
    o.cardStart = App.keysLessons.view === 'run';
    const rc = document.querySelector('.kl-runtop'), rr = rc.getBoundingClientRect();
    const pt2 = () => rc.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: rr.left + 4, clientY: rr.top + 4 }));
    pt2(); await wait(80); pt2(); await wait(80);
    o.cardStop = App.keysLessons.view === 'list';
    // switched off: a double-tap does nothing
    document.getElementById('kl-dbltap').click();
    await wait(400); __tap(o.ck); await wait(60); __tap(o.ck); await wait(80);
    o.offIdle = App.keysLessons.view === 'list' && App.store.get('kl.dbltap') === false && !document.querySelector('.kl-ctl .muted');
    document.getElementById('kl-dbltap').click();
    return o;
  });
  ok(c1.disp && c1.dbl && /Double-tap C3/.test(c1.hint), 'the card has LUMI Display + Double-tap chips and names the control key: ' + c1.hint);
  ok(c1.dispOff && c1.dispOn, 'the LUMI Display chip mirrors Lights & help');
  ok(c1.started && /Double-tap C3 to stop/.test(c1.runHint), 'double-tapping the control key starts the lesson: ' + c1.runHint + (c1.started ? '' : JSON.stringify({context:c1.context,heard:c1.heard})));
  ok(c1.stopped, 'double-tapping it again stops the run');
  ok(c1.slow && c1.broken, 'slow taps, or another key in between, do nothing');
  ok(c1.cardStart && c1.cardStop, 'two quick taps on the card start and stop it too');
  ok(c1.offIdle, 'Double-tap off: the gesture does nothing and the hint goes away');

  console.log('# a lesson run lights only the notes to play');
  const run = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    App.help.set(4);
    const ck = App.keysLessons.controlKey;
    await wait(400); __tap(ck); await wait(60); __tap(ck);
    const R = App.keysLessons.run;
    const until = R.first + 0.25;
    const deadline = performance.now() + 8000;
    while (R.ctx.currentTime < until && performance.now() < deadline) await wait(30);
    const l = __lit(), keys = Object.keys(l).map(Number);
    const o = { n: keys.length, white: keys.some(k => l[k] === 127), running: !!App.keysLessons.run };
    document.getElementById('kl-stop').click();
    await wait(60);
    o.after = Object.keys(__lit()).length;
    return o;
  });
  ok(run.running && run.n >= 1 && run.n <= 2 && !run.white, 'during the run: 1-2 colored keys, no white, no scale: ' + JSON.stringify(run));
  ok(run.after === 14, 'stopped: the scale is back on the keys');

  console.log('# Woodshed: Wait mode lights the note to play in its color, then the next');
  const ws = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    App.emit('fb:set', { source: 't', root: 0, scale: 'major', mode: 1 });
    App.help.set(4); App.midi.setDisplay(true);
    App.store.set('ws.instr', 'piano');
    App.switchTo('shed'); await wait(150);
    document.getElementById('ws-gen-scale').click(); await wait(80);
    document.querySelector('[data-wsplay="wait"]').click(); await wait(120);
    const pre = Object.keys(__lit()).length; // the session is set up, not started: the scale still shows
    document.getElementById('ws-go').click(); await wait(200);
    const S = Woodshed.session, first = S.targets[0].n.m, second = S.targets[1].n.m;
    const l1 = __lit();
    const o = { pre, mode: S.mode, first, second, lit1: Object.keys(l1).map(Number).sort((a, b) => a - b), v1: l1[first], white: Object.values(l1).includes(127) };
    __tap(first); await wait(150);
    const l2 = __lit();
    o.idx = S.waitIdx; o.lit2 = Object.keys(l2).map(Number).sort((a, b) => a - b); o.v2 = l2[second];
    App.switchTo('piano'); await wait(150);
    o.after = Object.keys(__lit()).length;
    return o;
  });
  ok(ws.mode === 'wait' && ws.lit1.includes(ws.first) && ws.lit1.every(n => n === ws.first || n === ws.second) && ws.v1 !== 127 && !ws.white, 'Wait mode: only the note to play (and the next) lit, in color: ' + JSON.stringify(ws));
  ok(ws.idx === 1 && ws.lit2.includes(ws.second) && !ws.lit2.includes(ws.first) && ws.v2 !== 127, 'playing it moves the light to the next note');
  ok(ws.after === 14, 'leaving the Woodshed hands the keys back to the scale');

  console.log('# Songs: play-along lights the notes sounding now');
  const sg = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    App.switchTo('songs'); await wait(150);
    document.getElementById('sg-paste').value = ['e|-------------|', 'B|-------------|', 'G|-------------|', 'D|-------------|', 'A|-3---5---7---|', 'E|-------------|'].join('\n');
    document.getElementById('sg-parse').click(); await wait(80);
    document.getElementById('sg-play').click();
    const seen = new Set(), white = [];
    for (let i = 0; i < 30; i++) {
      await wait(60);
      const l = __lit();
      const ks = Object.keys(l);
      if (ks.length <= 3) ks.forEach(k => { seen.add(+k); if (l[k] === 127) white.push(+k); }); // guided frames only
    }
    document.getElementById('sg-play').click(); await wait(120);
    return { seen: [...seen].sort((a, b) => a - b), white: white.length, after: Object.keys(__lit()).length };
  });
  // A string frets 3/5/7 = C3 48, D3 50, E3 52 - inside the LUMI's C3-B4 window
  ok([48, 50, 52].filter(n => sg.seen.includes(n)).length >= 2 && sg.white === 0, 'Songs light the notes it plays, in color: ' + JSON.stringify(sg.seen));
  ok(sg.after === 14, 'pausing hands the keys back to the scale');

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
  await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
