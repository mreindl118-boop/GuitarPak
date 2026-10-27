// Controller remote in the Woodshed (js/woodshed.js onRemote / remoteKey) and
// Guided performance (js/performance-player.js PerformancePlayer.remote /
// remoteKey, delegated to while the Woodshed shows it). Every state x action
// acts like the button the player would have tapped: classic session
// (Count-in / Start, Restart, Phrases' phrase before, Stop that stays, ←
// Library), the report (Again / Library, never in the instant it appears),
// the Phrases loop's pending next pass (NEXT waits, STOP / leaving cancels
// it), and the player (Start / Resume / Again / Restart / Stop / ← Library).
// End to end through a fake MODX (CC 86/87/85: claimed, never on 'midi:raw')
// and a fake LUMI (double-tap of its lowest key only where NEXT acts and
// nothing is judged: never the library; during a run that key plays and is
// graded). STOP in the instant a run ends keeps its report too. The player
// points App.midi at its own keyboard while it shows (a remote on another
// port keeps working: midi.js claims on every port) and gives the app's own
// input back on hide / ← Library.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const J = JSON.stringify;

const MAP = {
  next: { midi: { t: 'cc', n: 86, ch: null, port: '' }, key: null },
  back: { midi: { t: 'cc', n: 87, ch: null, port: '' }, key: null },
  stop: { midi: { t: 'cc', n: 85, ch: null, port: '' }, key: null }
};

async function newPage(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(([map, seed]) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.lights.on', 'false');
    localStorage.setItem('guitarlab.remote.map', JSON.stringify(map));
    for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
    const mkIn = (id, name) => ({ id, name, state: 'connected', onmidimessage: null });
    const modx = mkIn('in-modx', 'MODX-1'), lumi = mkIn('in-lumi', 'LUMI Keys BLOCK');
    const out = { id: 'out-modx', name: 'MODX-1', state: 'connected', send: () => {} };
    const access = { inputs: new Map([['in-modx', modx], ['in-lumi', lumi]]), outputs: new Map([['out-modx', out]]), sysexEnabled: true, onstatechange: null };
    navigator.requestMIDIAccess = () => Promise.resolve(access);
    window.__send = (port, bytes) => { const p = port === 'lumi' ? lumi : modx; if (p.onmidimessage) p.onmidimessage({ data: new Uint8Array(bytes) }); };
    window.__press = n => { __send('modx', [0xB0, n, 127]); __send('modx', [0xB0, n, 0]); };
    window.__strike = n => { __send('lumi', [0x90, n, 100]); __send('lumi', [0x80, n, 0]); };
    window.__wait = ms => new Promise(r => setTimeout(r, ms));
  }, [MAP, seed || {}]);
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.remote && window.Woodshed && window.PerformancePlayer && PerformancePlayer.remote);
  await page.evaluate(() => {
    window.R = a => App.remoteAction(a, { via: 'test' });
    window.raws = []; App.on('midi:raw', d => raws.push(Array.from(d.bytes).join(' ')));
    window.notes = []; App.on('midi:note', d => notes.push((d.on ? '+' : '-') + d.midi));
    window.rem = []; App.on('remote', d => rem.push(d.action + ':' + d.via + ':' + (d.handled ? 1 : 0)));
    window.hud = () => { const h = document.getElementById('remote-hud'); return h && h.classList.contains('show') ? h.textContent : ''; };
    window.toast = () => { const t = document.getElementById('app-toast'); return t && !t.hidden ? t.textContent : ''; };
    window.WS = () => Woodshed.session;
    window.st = () => { const s = PerformancePlayer.snapshot(); return s ? s.status : 'none'; };
    window.starts = 0; // every classic startRun opens one woodshed practice session
    const bs = App.xp.beginSession; App.xp.beginSession = function (o) { if (o && o.source === 'woodshed') window.starts++; return bs.apply(this, arguments); };
    window.addTest = (title, ms) => Woodshed.addScore(Woodshed.importTrack({ name: title, notes: ms.map((m, i) => ({ m, t: i, d: 0.9, v: 96 })) }));
    window.openRow = (title, mode) => {
      App.switchTo('shed');
      const row = Array.from(document.querySelectorAll('#ws-lib [data-wsid]')).find(r => r.querySelector('b').textContent === title);
      row.querySelector('[data-wsplay="' + mode + '"]').click();
    };
    window.endPass = () => { WS().startT = App.getAudio().currentTime - 200; }; // the clock ran past the end
    window.cs = () => { const S = WS(); return { view: Woodshed.view, running: !!(S && S.running), timer: !!(S && S.timer), xp: S ? S.xpSession : null, phrase: S ? S.phrase : null, autoT: !!(S && S.autoT) }; };
    window.reportShown = () => { const r = document.getElementById('pf-report'); return !!r && !r.hidden; };
    window.toLib = () => { R('stop'); const b = document.getElementById('ws-back') || document.getElementById('ws-tolib') || document.getElementById('pf-back'); if (b) b.click(); };
    window.perfOpen = (score, countIn) => {
      window.__t = 0; App.switchTo('shed');
      Woodshed.performanceStart(score, 'wait', { clock: () => window.__t });
      const c = document.getElementById('pf-countin'); c.value = String(countIn); c.dispatchEvent(new Event('change', { bubbles: true }));
    };
    window.vnote = m => { PerformancePlayer.note({ midi: m, on: true, velocity: 100, source: 'test' }); PerformancePlayer.note({ midi: m, on: false, source: 'test' }); };
    window.ONE = { title: 'Remote one note', bpm: 120, len: 1, notes: [{ m: 48, t: 0, d: 1, v: 90 }] };
    window.TWO = { title: 'Remote two notes', bpm: 120, len: 2, notes: [{ m: 48, t: 0, d: 1, v: 90 }, { m: 50, t: 1, d: 1, v: 90 }] };
    addTest('Remote run', [48, 50, 52, 53, 55, 57]);
    addTest('Remote phrases', Array.from({ length: 20 }, (_, i) => 48 + (i % 8)));
  });
  return { ctx, page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  let { ctx, page, errs } = await newPage(browser);

  console.log('# the contract');
  const ct = await page.evaluate(async () => {
    App.switchTo('shed'); await __wait(150);
    const o = {};
    o.lib = [R('next'), R('back'), R('stop')].join('|');
    o.libKey = App.remoteKeyPage();
    o.fire = String(App.remote.fire('next', 'test')) + '|' + toast();
    await __wait(270); o.fireStop = String(App.remote.fire('stop', 'test')) + '|' + toast();
    return o;
  });
  ok(ct.lib === 'false|false|false', 'the library: nothing to do for NEXT / BACK / STOP: ' + ct.lib);
  ok(ct.libKey === false, 'the library: NEXT does nothing there, so the lowest key is never reserved');
  ok(ct.fire === 'false|Nothing to move on here' && ct.fireStop === 'false|Nothing to stop here', 'the core toasts "nothing here" for the library: ' + J(ct));

  console.log('# classic session (Run): Count-in, Starting…, Playing…, Restart, Stop, Library');
  const run = await page.evaluate(async () => {
    const o = {};
    openRow('Remote run', 'run'); await __wait(60);
    o.open = J(cs()) + '|' + App.remoteKeyPage();
    starts = 0;
    o.next = R('next'); o.afterNext = J(cs()) + '|' + starts + '|' + (WS().startT > App.getAudio().currentTime);
    o.keyRun = App.remoteKeyPage();
    const xp1 = WS().xpSession;
    o.countin = R('next') + '|' + (WS().xpSession === xp1) + '|' + starts;
    WS().startT = App.getAudio().currentTime - 0.1; // past the count-in
    o.playing = R('next') + '|' + (WS().xpSession === xp1) + '|' + starts;
    o.back = R('back') + '|' + (WS().xpSession !== xp1) + '|' + starts + '|' + cs().running;
    o.stop = R('stop'); o.afterStop = J(cs());
    o.backIdle = R('back') + '|' + cs().running + '|' + starts; // nothing ran: BACK = the Count-in
    R('stop');
    o.stopIdle = R('stop') + '|' + Woodshed.view + '|' + (WS() === null) + '|' + !!document.getElementById('ws-guided-melody');
    document.getElementById('ws-back').click(); await __wait(30); o.leave = Woodshed.view; // the Library is a screen tap
    return o;
    function J(x) { return JSON.stringify(x); }
  });
  ok(/"view":"session","running":false/.test(run.open) && /\|true$/.test(run.open), 'a Run session opens stopped; the double-tap key may be claimed: ' + run.open);
  ok(run.next === 'Count-in' && /"running":true,"timer":true/.test(run.afterNext) && /\|1\|true$/.test(run.afterNext), 'NEXT = Count-in (startRun: one run, its clock ahead): ' + run.afterNext);
  ok(run.keyRun === false, 'a running run: the reserved key stays a real note');
  ok(run.countin === 'Starting…|true|1', 'NEXT during the count-in does nothing: ' + run.countin);
  ok(run.playing === 'Playing…|true|1', 'NEXT while playing does nothing: ' + run.playing);
  ok(run.back === 'Restart|true|2|true', 'BACK while playing restarts the run (a new run from the count-in): ' + run.back);
  ok(run.stop === 'Stopped' && /"view":"session","running":false,"timer":false/.test(run.afterStop), 'STOP ends the run and stays in the session: ' + run.afterStop);
  ok(run.backIdle === 'Count-in|true|3', 'BACK with nothing running starts the count-in: ' + run.backIdle);
  ok(run.stopIdle === 'false|session|false|false' && run.leave === 'lib', 'STOP with nothing running stays in the session (Next starts again; ← is a screen tap): ' + run.stopIdle);

  console.log('# report: Again / Library, never in the instant it appears');
  const rp = await page.evaluate(async () => {
    const o = {};
    openRow('Remote run', 'run'); await __wait(40);
    R('next'); endPass(); await __wait(150);
    o.report = Woodshed.view + '|' + !!document.getElementById('ws-again');
    o.guard = R('next') + '|' + Woodshed.view + '|' + R('back') + '|' + Woodshed.view;
    o.keyReport = App.remoteKeyPage();
    await __wait(650); starts = 0;
    o.again = R('next') + '|' + Woodshed.view + '|' + cs().running + '|' + starts;
    endPass(); await __wait(150); await __wait(650);
    o.back = R('back') + '|' + Woodshed.view + '|' + cs().running + '|' + starts;
    endPass(); await __wait(150);
    o.stopGuard = R('stop') + '|' + Woodshed.view + '|' + !!document.getElementById('ws-again');
    await __wait(650);
    o.stop = R('stop') + '|' + Woodshed.view + '|' + (WS() === null);
    document.getElementById('ws-tolib').click(); await __wait(30);
    return o;
  });
  ok(rp.report === 'report|true', 'a finished run shows the report');
  ok(rp.guard === 'Results|report|Results|report', 'NEXT / BACK in the instant the report appears only let it show: ' + rp.guard);
  ok(rp.keyReport === true, 'the report: nothing judged, the double-tap key may be claimed');
  ok(rp.again === 'Again|session|true|1', 'report NEXT = Again (back in the session, a new run): ' + rp.again);
  ok(rp.back === 'Again|session|true|2', 'report BACK = Again: ' + rp.back);
  ok(rp.stopGuard === 'Results|report|true', 'STOP in the instant the report appears keeps it on screen: ' + rp.stopGuard);
  ok(rp.stop === 'false|report|false', 'report STOP stays with the score (Next / Back = Again): ' + rp.stop);

  console.log('# Phrases: the phrase before, the pending next pass');
  const ph = await page.evaluate(async () => {
    const o = {};
    openRow('Remote phrases', 'phrase'); await __wait(40); starts = 0;
    o.first = R('back') + '|' + cs().phrase + '|' + cs().running; // phrase 1, nothing ran: the count-in
    o.firstRun = R('back') + '|' + cs().phrase + '|' + starts; // phrase 1 running: restart it
    WS().phrase = 2; WS().cleanPasses = 1;
    o.prev = R('back') + '|' + cs().phrase + '|' + WS().cleanPasses + '|' + cs().running + '|' + starts;
    // a pass ends: the loop restarts it by itself after 900 ms
    endPass(); await __wait(150);
    o.gap = J(cs());
    o.gapKey = App.remoteKeyPage();
    const s0 = starts;
    o.gapNext = R('next') + '|' + (starts - s0) + '|' + cs().phrase; // the player moves on: the next phrase, one run
    await __wait(1000);
    o.afterGap = cs().running + '|' + (starts - s0) + '|' + cs().autoT; // started once (the pending pass was cancelled)
    o.lastNext = R('next') + '|' + cs().phrase; // the last phrase, playing: nothing to skip to
    endPass(); await __wait(150);
    o.gapStop = R('stop') + '|' + cs().autoT; const s1 = starts;
    await __wait(1000);
    o.afterStop = cs().running + '|' + (starts - s1) + '|' + Woodshed.view;
    // leaving the page in the gap cancels the pass too
    R('next'); endPass(); await __wait(150); const s2 = starts;
    App.switchTo('quiz'); await __wait(1000);
    o.leave = cs().running + '|' + (starts - s2);
    App.switchTo('shed'); await __wait(80);
    toLib(); // end what runs, then the Library (a screen tap: Stop no longer leaves)
    return o;
    function J(x) { return JSON.stringify(x); }
  });
  ok(ph.first === 'Count-in|0|true', 'Phrases, first phrase, nothing running: BACK = the count-in: ' + ph.first);
  ok(ph.firstRun === 'Restart|0|2', 'Phrases, first phrase running: BACK restarts it: ' + ph.firstRun);
  ok(ph.prev === 'Phrase 2 of 3|1|0|true|3', 'Phrases: BACK = the phrase before (clean passes reset, a new pass): ' + ph.prev);
  ok(/"running":false/.test(ph.gap) && /"autoT":true/.test(ph.gap) && ph.gapKey === true, 'a finished pass waits 900 ms for the next one: ' + ph.gap);
  ok(ph.gapNext === 'Phrase 3 of 3|1|2', 'NEXT in the loop moves on to the next phrase (one run): ' + ph.gapNext);
  ok(ph.afterGap === 'true|1|false', 'the pending pass does not start a second run: ' + ph.afterGap);
  ok(/^(Starting…|Playing…)\|2$/.test(ph.lastNext), 'NEXT on the last phrase while it runs does nothing: ' + ph.lastNext);
  ok(ph.gapStop === 'Stopped|false' && ph.afterStop === 'false|0|session', 'STOP in the gap cancels the pending pass and stays in the session: ' + ph.gapStop + ' / ' + ph.afterStop);
  ok(ph.leave === 'false|0', 'leaving the Woodshed in the gap cancels the pending pass (no run in the background): ' + ph.leave);

  console.log('# Wait mode: armed from the start, Start, Stopped');
  const wt = await page.evaluate(async () => {
    const o = {};
    openRow('Remote run', 'wait'); await __wait(40); starts = 0;
    o.armed = J(cs()) + '|' + App.remoteKeyPage();
    o.start = R('next') + '|' + cs().timer + '|' + starts;
    o.playing = R('next') + '|' + starts;
    o.stop = R('stop') + '|' + cs().running + '|' + Woodshed.view;
    o.again = R('next') + '|' + cs().running + '|' + starts;
    toLib(); // end what runs, then the Library (a screen tap: Stop no longer leaves)
    // a note already played without Start: NEXT never throws that progress away
    openRow('Remote run', 'wait'); await __wait(40);
    App.emit('note:input', { on: true, midi: WS().targets[0].n.m, vel: 90, src: 'qwerty' });
    o.played = WS().waitIdx + '|' + R('next') + '|' + WS().waitIdx;
    o.playedStop = R('stop') + '|' + cs().running;
    toLib(); // end what runs, then the Library (a screen tap: Stop no longer leaves)
    return o;
    function J(x) { return JSON.stringify(x); }
  });
  ok(/"running":true,"timer":false/.test(wt.armed) && /\|false$/.test(wt.armed), 'Wait mode judges from the moment it shows: the reserved key is not claimed: ' + wt.armed);
  ok(wt.start === 'Start|true|1', 'Wait: NEXT = Start: ' + wt.start);
  ok(wt.playing === 'Playing…|1', 'Wait running: NEXT does nothing: ' + wt.playing);
  ok(wt.stop === 'Stopped|false|session' && wt.again === 'Start|true|2', 'Wait: STOP stays in the session, NEXT starts again: ' + wt.stop + ' / ' + wt.again);
  ok(wt.played === '1|Playing…|1' && wt.playedStop === 'Stopped|false', 'Wait with a note played before Start: NEXT keeps it, STOP stops: ' + wt.played);

  console.log('# Guided performance (the library button, the real clock)');
  const pf = await page.evaluate(async () => {
    const o = {};
    App.switchTo('shed'); await __wait(60);
    document.getElementById('ws-guided-melody').click(); await __wait(60);
    o.idle = st() + '|' + Woodshed.view + '|' + App.remoteKeyPage() + '|' + R('back');
    o.next = R('next') + '|' + st() + '|' + document.getElementById('pf-start').disabled;
    o.countin = R('next') + '|' + st() + '|' + App.remoteKeyPage();
    o.restart = R('back') + '|' + st();
    o.stop = R('stop') + '|' + st() + '|' + reportShown() + '|' + /Stopped/.test(document.getElementById('pf-report').textContent) + '|' + App.remoteKeyPage();
    o.again = R('next') + '|' + st();
    PerformancePlayer.pause(); o.paused = st() + '|' + App.remoteKeyPage();
    o.resume = R('next') + '|' + st();
    PerformancePlayer.pause(); o.pBack = R('back') + '|' + st();
    PerformancePlayer.pause(); o.pStop = R('stop') + '|' + st() + '|' + reportShown();
    o.stopBack = R('back') + '|' + st(); R('stop');
    o.lib = R('stop') + '|' + Woodshed.view + '|' + !!document.getElementById('ws-guided-melody') + '|' + st();
    document.getElementById('pf-back').click(); await __wait(30); o.libView = Woodshed.view;
    o.libNext = R('next');
    return o;
  });
  ok(pf.idle === 'idle|performance|true|false', 'performance idle: the key may be claimed, BACK has nothing to retry: ' + pf.idle);
  ok(pf.next === 'Start|countin|true', 'performance NEXT = Start (start(false), the Start button disables): ' + pf.next);
  ok(pf.countin === 'Starting…|countin|false', 'NEXT during the count-in does nothing; the key is a real note: ' + pf.countin);
  ok(pf.restart === 'Restart|countin', 'performance BACK while running = Restart: ' + pf.restart);
  ok(pf.stop === 'Stopped|stopped|true|true|true', 'performance STOP = Stop with the partial report: ' + pf.stop);
  ok(pf.again === 'Start|countin', 'performance stopped: NEXT = Start: ' + pf.again);
  ok(pf.paused === 'paused|false' && pf.resume === 'Resume|countin', 'performance paused: NEXT = Resume (the key stays a note while paused): ' + pf.resume);
  ok(pf.pBack === 'Restart|countin', 'performance paused: BACK = Restart: ' + pf.pBack);
  ok(pf.pStop === 'Stopped|stopped|true', 'performance paused: STOP = Stop: ' + pf.pStop);
  ok(pf.stopBack === 'Again|countin', 'performance stopped: BACK = Again: ' + pf.stopBack);
  ok(pf.lib === 'false|performance|false|stopped' && pf.libView === 'lib' && pf.libNext === false, 'performance with nothing running: STOP stays (← Library is a screen tap; NEXT does nothing in the Library): ' + pf.lib);

  console.log('# Guided performance: running, complete, chords on audio input');
  const pc = await page.evaluate(async () => {
    const o = {};
    perfOpen(ONE, 0);
    o.start = R('next') + '|' + st();
    o.playing = R('next') + '|' + st() + '|' + App.remoteKeyPage();
    vnote(48);
    o.done = st() + '|' + reportShown() + '|' + App.remoteKeyPage();
    o.guard = R('next') + '|' + R('back') + '|' + st();
    await __wait(650);
    o.again = R('next') + '|' + st();
    vnote(48); await __wait(650);
    o.back = R('back') + '|' + st();
    vnote(48);
    o.doneStop = R('stop') + '|' + Woodshed.view + '|' + st() + '|' + reportShown();
    await __wait(650);
    o.doneLib = R('stop') + '|' + Woodshed.view + '|' + st();
    document.getElementById('pf-back').click(); await __wait(30);
    // a chord score on audio input cannot start: the HUD and a toast say why
    App.switchTo('shed'); await __wait(40);
    document.getElementById('ws-guided-chords').click(); await __wait(40);
    const k = document.getElementById('pf-input-kind'); k.value = 'audio'; k.dispatchEvent(new Event('change', { bubbles: true }));
    o.audio = R('next') + '|' + st() + '|' + toast();
    k.value = 'midi'; k.dispatchEvent(new Event('change', { bubbles: true }));
    toLib(); // end what runs, then the Library (a screen tap: Stop no longer leaves)
    return o;
  });
  ok(pc.start === 'Start|running' && pc.playing === 'Playing…|running|false', 'performance without count-in: NEXT = Start, then NEXT does nothing while it plays: ' + pc.playing);
  ok(pc.done === 'complete|true|true', 'a completed performance shows its report (the key may be claimed again)');
  ok(pc.guard === 'Results|Results|complete', 'NEXT / BACK in the instant it completes only let the report show: ' + pc.guard);
  ok(pc.again === 'Again|running' && pc.back === 'Again|running', 'complete: NEXT and BACK = Again: ' + pc.again + ' / ' + pc.back);
  ok(pc.doneStop === 'Results|performance|complete|true', 'STOP in the instant it completes keeps the report on screen: ' + pc.doneStop);
  ok(pc.doneLib === 'false|performance|complete', 'complete: STOP stays with the report: ' + pc.doneLib);
  ok(/^Can’t start\|idle\|Audio input cannot grade chords/.test(pc.audio), 'chords on audio input: nothing starts, the HUD and a toast say why: ' + pc.audio);

  console.log('# end to end: a MODX button (CC 86 / 87 / 85)');
  const e2e = await page.evaluate(async () => {
    const o = {};
    openRow('Remote run', 'run'); await __wait(40); raws.length = 0; rem.length = 0;
    __press(86); await __wait(40);
    o.next = cs().running + '|' + hud() + '|' + rem.join();
    await __wait(300); __press(85); await __wait(40);
    o.stop = cs().running + '|' + Woodshed.view + '|' + hud();
    await __wait(300); __press(87); await __wait(40);
    o.back = cs().running + '|' + hud();
    await __wait(300); __press(85); await __wait(300); __press(85); await __wait(40);
    o.lib = Woodshed.view + '|' + toast();
    // the player: its own 'midi:raw' parser never sees the remote's CCs
    perfOpen(TWO, 0);
    await __wait(300); __press(86); await __wait(40);
    o.pNext = st() + '|' + hud();
    await __wait(300); __press(85); await __wait(40);
    const r = PerformancePlayer.snapshot().results;
    o.pStop = st() + '|' + hud() + '|' + (r.extra + r.wrong);
    o.raws = raws.filter(b => /^176 (85|86|87) /.test(b)).length;
    await __wait(300); __press(85); await __wait(40);
    o.pLib = Woodshed.view;
    document.getElementById('pf-back').click(); await __wait(30);
    return o;
  });
  ok(e2e.next === 'true|Count-in|next:cc:1', 'CC 86 from the MODX = NEXT: the run counts in, the HUD says Count-in: ' + e2e.next);
  ok(e2e.stop === 'false|session|Stopped', 'CC 85 = STOP: the run ends, the HUD says Stopped: ' + e2e.stop);
  ok(e2e.back === 'true|Count-in', 'CC 87 = BACK: with nothing running it counts in again: ' + e2e.back);
  ok(e2e.lib === 'session|Nothing to stop here', 'CC 85 twice: stop, then nothing more to stop (stays in the session): ' + e2e.lib);
  ok(e2e.pNext === 'running|Start' && /^stopped\|Stopped\|0$/.test(e2e.pStop), 'the player starts and stops from the MODX; nothing counts as a wrong or extra note: ' + e2e.pNext + ' / ' + e2e.pStop);
  ok(e2e.raws === 0, 'the remote CCs never reach midi:raw listeners');
  ok(e2e.pLib === 'performance', 'the player: STOP with nothing running stays with it');

  console.log('# calibration');
  const cal = await page.evaluate(async () => {
    App.switchTo('shed'); await __wait(40);
    document.getElementById('ws-cal-btn').click(); await __wait(40);
    return Woodshed.view + '|' + R('next') + '|' + R('back') + '|' + R('stop') + '|' + App.remoteKeyPage();
  });
  ok(cal === 'cal|false|false|false|false', 'calibration: nothing to do, and every key is a tap (the key is never claimed): ' + cal);
  ok(!errs.length, 'no page errors: ' + J(errs));
  await ctx.close();

  console.log('# double-tap the lowest key (remote.dbl)');
  ({ ctx, page, errs } = await newPage(browser, { 'remote.dbl': true }));
  const dt = await page.evaluate(async () => {
    const o = {}, lo = App.midi.range().lo; o.lo = lo;
    // the library: NEXT does nothing there, so the key stays a key
    App.switchTo('shed'); await __wait(60); notes.length = 0; rem.length = 0;
    o.libKey = App.remoteKeyPage();
    __strike(lo); await __wait(60); __strike(lo); await __wait(40);
    o.lib = notes.filter(n => n === '+' + lo).length + '|' + rem.length + '|' + Woodshed.view + '|' + toast();
    await __wait(500);
    openRow('Remote run', 'run'); await __wait(60);
    notes.length = 0; raws.length = 0; rem.length = 0;
    __strike(lo); await __wait(500);
    o.single = cs().running + '|' + notes.length + '|' + raws.length + '|' + rem.length;
    __strike(lo); await __wait(60); __strike(lo); await __wait(40);
    o.dbl = cs().running + '|' + hud() + '|' + rem.join();
    const before = WS().played.length; notes.length = 0;
    __strike(lo); await __wait(60); __strike(lo); await __wait(40);
    o.during = (WS().played.length - before) + '|' + notes.filter(n => n === '+' + lo).length + '|' + rem.length;
    toLib(); // end what runs, then the Library (a screen tap: Stop no longer leaves)
    // Wait mode is judged from the moment it shows: the key is a note
    openRow('Remote run', 'wait'); await __wait(40); notes.length = 0;
    __strike(lo); await __wait(40);
    o.wait = WS().waitIdx + '|' + WS().counts.perfect + '|' + notes.filter(n => n === '+' + lo).length + '|' + rem.length;
    toLib(); // end what runs, then the Library (a screen tap: Stop no longer leaves)
    // Guided performance: idle double-tap starts, then the key is the target
    perfOpen(TWO, 0); await __wait(300); notes.length = 0; raws.length = 0;
    __strike(lo); await __wait(500);
    o.pSingle = st() + '|' + notes.length + '|' + raws.length + '|' + PerformancePlayer.snapshot().held.length;
    __strike(lo); await __wait(60); __strike(lo); await __wait(40);
    o.pDbl = st() + '|' + hud() + '|' + rem.slice(-1)[0] + '|' + PerformancePlayer.snapshot().results.matched;
    __strike(lo); await __wait(40);
    const s = PerformancePlayer.snapshot();
    o.pPlay = s.results.matched + '|' + s.current.notes.join() + '|' + rem.length;
    toLib(); // end what runs, then the Library (a screen tap: Stop no longer leaves)
    return o;
  });
  ok(dt.lo === 48, 'the lowest key is the LUMI default C3 (48)');
  ok(dt.libKey === false && /^2\|0\|lib\|/.test(dt.lib) && !/Nothing to move on/.test(dt.lib), 'the library: the lowest key plays both strikes, a double-tap fires nothing: ' + dt.lib);
  ok(dt.single === 'false|0|0|0', 'a session not yet running: one strike of the reserved key is silent and does nothing: ' + dt.single);
  ok(dt.dbl === 'true|Count-in|next:dbltap:1', 'double-tap = NEXT: the run counts in: ' + dt.dbl);
  ok(dt.during === '2|2|1', 'during the run the lowest key plays and is judged; a double strike fires nothing: ' + dt.during);
  ok(dt.wait === '1|1|1|1', 'Wait mode: the lowest key answers the first target at once (never claimed): ' + dt.wait);
  ok(dt.pSingle === 'idle|0|0|0', 'performance idle: one strike is silent and does nothing: ' + dt.pSingle);
  ok(dt.pDbl === 'running|Start|next:dbltap:1|0', 'performance idle: double-tap = Start: ' + dt.pDbl);
  ok(dt.pPlay === '1|50|2', 'performance running: the lowest key is the first target and is graded: ' + dt.pPlay);
  ok(!errs.length, 'no page errors: ' + J(errs));
  await ctx.close();

  console.log('# performance input = the LUMI: a MODX remote keeps working');
  ({ ctx, page, errs } = await newPage(browser, { 'ws.performance.input': 'in-lumi' }));
  const pi = await page.evaluate(async () => {
    const o = {};
    const stored = () => localStorage.getItem('guitarlab.midi.inputId');
    const change = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); };
    // the app heard All inputs (the default): the player points it at its own
    // keyboard while it shows; the MODX remote still works (claimed on every port)
    perfOpen(TWO, 0); await __wait(300);
    o.open = document.getElementById('pf-input').value + '|' + App.midi.inputId + '|' + stored();
    raws.length = 0; rem.length = 0;
    __press(86); await __wait(40);
    o.next = st() + '|' + hud() + '|' + rem.join();
    __send('modx', [0x90, 48, 100]); __send('modx', [0x80, 48, 0]); // another keyboard: never graded
    const r0 = PerformancePlayer.snapshot().results;
    __strike(48); // the performance input still is
    const r1 = PerformancePlayer.snapshot().results;
    o.graded = r0.matched + '|' + (r0.wrong + r0.extra) + '|' + r1.matched;
    o.raws = raws.filter(b => /^176 (85|86|87) /.test(b)).length;
    await __wait(300); __press(85); await __wait(40); // Stop
    o.stop = st() + '|' + hud();
    // changing the player's input moves the app with it
    change('pf-input', 'in-modx'); change('pf-input', 'in-lumi');
    o.change = App.midi.inputId + '|' + stored();
    document.getElementById('pf-back').click(); await __wait(40); // ← Library (a screen tap)
    o.lib = Woodshed.view + '|' + App.midi.inputId + '|' + stored();
    openRow('Remote run', 'run'); await __wait(300);
    __press(86); await __wait(40);
    o.run = cs().running + '|' + hud();
    toLib(); // end what runs, then the Library (a screen tap: Stop no longer leaves)
    // the app hears ONE other port (the MODX): the player points it at the
    // LUMI only while it shows, and gives the MODX back after
    App.midi.setInput('in-modx'); await __wait(20);
    perfOpen(TWO, 0); await __wait(60);
    o.route = App.midi.inputId;
    App.switchTo('quiz'); await __wait(60);
    o.hidden = App.midi.inputId + '|' + stored();
    App.switchTo('shed'); await __wait(60);
    o.shown = App.midi.inputId + '|' + Woodshed.view;
    __strike(48); o.shownNote = st(); // idle: nothing is graded, nothing throws
    document.getElementById('pf-back').click(); await __wait(30);
    o.close = 'Library|' + Woodshed.view + '|' + App.midi.inputId + '|' + stored();
    openRow('Remote run', 'run'); await __wait(300);
    __press(86); await __wait(40);
    o.run2 = cs().running + '|' + hud();
    toLib(); // end what runs, then the Library (a screen tap: Stop no longer leaves)
    // an input picked elsewhere while the player shows is kept on close
    perfOpen(TWO, 0); await __wait(60);
    App.midi.setInput('all'); await __wait(20);
    document.getElementById('pf-back').click(); await __wait(30);
    o.kept = Woodshed.view + '|' + App.midi.inputId + '|' + stored();
    return o;
  });
  ok(pi.open === 'in-lumi|in-lumi|"in-lumi"', 'opening the player with the LUMI as its input points the app at the LUMI while it shows (as before): ' + pi.open);
  ok(pi.next === 'running|Start|next:cc:1', 'CC 86 from the MODX starts the performance: ' + pi.next);
  ok(pi.graded === '0|0|1' && pi.raws === 0, 'the MODX\'s notes are not graded, the LUMI\'s are, the CCs never reach midi:raw: ' + pi.graded);
  ok(pi.stop === 'stopped|Stopped', 'CC 85 stops the performance: ' + pi.stop);
  ok(pi.change === 'in-lumi|"in-lumi"', 'changing the player\'s input points the app at the new one: ' + pi.change);
  ok(pi.lib === 'lib|all|"all"', 'after ← Library the app hears every input again (nothing saved narrowed): ' + pi.lib);
  ok(pi.run === 'true|Count-in', 'and CC 86 still starts a classic run: ' + pi.run);
  ok(pi.route === 'in-lumi', 'an app on one other port is pointed at the player\'s input while it shows: ' + pi.route);
  ok(pi.hidden === 'in-modx|"in-modx"', 'leaving the Woodshed gives the app its own input back: ' + pi.hidden);
  ok(pi.shown === 'in-lumi|performance' && pi.shownNote === 'idle', 'coming back points it at the player\'s input again: ' + pi.shown);
  ok(pi.close === 'Library|lib|in-modx|"in-modx"', '← Library restores the app\'s input (and what is saved): ' + pi.close);
  ok(pi.run2 === 'true|Count-in', 'so the MODX\'s CC 86 starts a classic run again: ' + pi.run2);
  ok(pi.kept === 'lib|all|"all"', 'an input picked elsewhere while the player shows is kept: ' + pi.kept);
  ok(!errs.length, 'no page errors: ' + J(errs));
  await ctx.close();

  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
