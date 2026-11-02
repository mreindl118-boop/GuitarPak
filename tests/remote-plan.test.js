// CONTROLLER REMOTE on LUMI practice (js/lumi-practice.js) and the Practice
// plan (js/practiceplan.js): onRemote next / back / stop does what the
// on-screen buttons do (Start, Check answer, Next target, a guided skip that
// counts nothing, Stop; launch the next unfinished block, open the last one
// again), never tests / arms / routes a device, 'nothing here' returns false,
// a learned CC works end to end (claimed: never reaches 'midi:raw'), and the
// reserved double-tap key is claimed only where remoteKey allows it (LUMI
// practice in simulated mode, the plan page) — in hardware mode the key is
// an answer like any other.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const J = JSON.stringify;
const MAP = { next: { midi: { t: 'cc', n: 86, ch: null, port: '' }, key: null }, back: { midi: { t: 'cc', n: 87, ch: null, port: '' }, key: null }, stop: { midi: { t: 'cc', n: 85, ch: null, port: '' }, key: null } };

async function newPage(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript((seed) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.lights.on', 'false');
    for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
    window.__wait = ms => new Promise(r => setTimeout(r, ms));
    window.__q = s => document.querySelector(s);
    window.__raw = []; window.__notes = []; window.__ev = []; window.__hw = [];
    // Web MIDI ports with onmidimessage (App.midi) AND addEventListener
    // (subscribeInput: LUMI practice's own hardware answer stream)
    function port(id, name) {
      const ls = new Set();
      return { id, name, type: 'input', state: 'connected', onmidimessage: null,
        addEventListener(t, f) { if (t === 'midimessage') ls.add(f); }, removeEventListener(t, f) { ls.delete(f); },
        emit(b) { const e = { data: new Uint8Array(b) }; if (this.onmidimessage) this.onmidimessage(e); ls.forEach(f => f(e)); } };
    }
    const lumi = port('li', 'LUMI Keys BLOCK'), modx = port('mi', 'MODX-1');
    const out = { id: 'mo', name: 'MODX-1', type: 'output', state: 'connected', send() {} };
    navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map([['li', lumi], ['mi', modx]]), outputs: new Map([['mo', out]]), sysexEnabled: true, onstatechange: null });
    window.__send = (b, p) => (p === 'li' ? lumi : modx).emit(b);
    window.__cc = (n, v, p) => __send([0xB0, n, v], p);
    window.__press = (n, p) => { __cc(n, 127, p); __cc(n, 0, p); };
    window.__strike = (n, p) => { __send([0x90, n, 90], p); __send([0x80, n, 0], p); };
    window.__toast = () => { const t = document.getElementById('app-toast'); return t && !t.hidden ? t.textContent : ''; };
    window.__hud = () => { const h = document.getElementById('remote-hud'); return h && h.classList.contains('show') ? h.textContent : ''; };
    window.__clearToast = () => { const t = document.getElementById('app-toast'); if (t) t.hidden = true; };
    window.__ra = a => App.remoteAction(a, { via: 'test' });
    window.addEventListener('DOMContentLoaded', () => {
      App.on('midi:raw', d => __raw.push(d.bytes.join(' ')));
      App.on('midi:note', d => __notes.push((d.on ? 'on ' : 'off ') + d.midi));
      App.on('remote', d => __ev.push(d.action + ':' + d.via + ':' + (d.handled ? 1 : 0)));
    });
  }, seed || {});
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.active && App.remote && window.SLLumiPractice && App.practicePlan);
  // the remote must never reach device output, port selection or the sound route
  await page.evaluate(() => {
    ['leaseKeybedOutput', 'sendToOutput', 'setInput', 'setOutput', 'enable'].forEach(k => {
      const f = App.midi[k]; if (typeof f !== 'function') return;
      App.midi[k] = function () { __hw.push(k); return f.apply(this, arguments); };
    });
    if (App.practiceRouter) { const s = App.practiceRouter.start; App.practiceRouter.start = function () { __hw.push('route'); return s.apply(this, arguments); }; }
  });
  return { ctx, page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });

  console.log('# LUMI practice: guided (Wait until correct), simulated');
  let { ctx, page, errs } = await newPage(browser);
  const lg = await page.evaluate(async () => {
    const o = {}, S = () => SLLumiPractice.snapshot();
    App.switchTo('lumipractice'); await __wait(150);
    o.idle = J([__ra('back'), __ra('stop'), S().running]);
    o.start = __ra('next'); o.s1 = S(); o.startBtn = __q('#lp-start').textContent;
    const t1 = S().target.join();
    o.skip = __ra('next'); o.s2 = S(); o.t2 = S().target.join(); o.t1 = t1;
    // hold the exact target on the simulated pads: the auto-advance is pending
    S().target.forEach(n => __q('[data-answer-note="' + n + '"]').click());
    await __wait(30); o.advancing = S().advancing; const t3 = S().target.join();
    o.race = __ra('next'); o.raceTarget = S().target.join() === t3;
    await __wait(800); o.s4 = S(); o.t4 = S().target.join(); o.t3 = t3;
    // the pedal pressed just AFTER the advance brought up the next target
    // (the right notes, then 'got it, move on'): the new target stays
    S().target.forEach(n => __q('[data-answer-note="' + n + '"]').click());
    await __wait(760); const t5 = S().target.join();
    o.late = __ra('next'); o.s6 = S(); o.lateKept = S().target.join() === t5 && t5 !== o.t4;
    await __wait(950);
    o.later = __ra('next'); o.laterSkip = S().target.join() !== t5; o.s7 = S();
    o.back = __ra('back');
    o.stop = __ra('stop'); o.s5 = S(); o.status = __q('#lp-status').textContent;
    o.stopAgain = __ra('stop');
    o.hw = __hw.slice();
    return o;
    function J(x) { return JSON.stringify(x); }
  });
  ok(lg.idle === '[false,false,false]', 'idle: Back and Stop are "nothing here" (false): ' + lg.idle);
  ok(lg.start === 'Start' && lg.s1.running && lg.s1.target.length === 1 && lg.s1.attempts === 0 && /Restart session/.test(lg.startBtn), 'NEXT not running = Start (the Start button path): ' + lg.start);
  ok(lg.skip === 'Skip' && lg.s2.running && lg.t2 !== lg.t1 && lg.s2.correct === 0 && lg.s2.attempts === 0, 'guided NEXT skips to the next target and counts nothing: ' + lg.t1 + ' -> ' + lg.t2);
  ok(lg.advancing && lg.race === 'Moving on…' && lg.raceTarget, 'a NEXT while the exact target is held does not skip it (the advance is on its way)');
  ok(lg.s4.correct === 1 && lg.s4.attempts === 1 && lg.t4 !== lg.t3, 'the pending advance still counts the answer once: ' + lg.s4.correct + '/' + lg.s4.attempts);
  ok(lg.late === 'Moving on…' && lg.lateKept && lg.s6.correct === 2 && lg.s6.attempts === 2, 'a NEXT just after the advance fired keeps the target it brought up (no second move): ' + lg.late + ' ' + lg.s6.correct + '/' + lg.s6.attempts);
  ok(lg.later === 'Skip' && lg.laterSkip && lg.s7.correct === 2 && lg.s7.attempts === 2, 'a NEXT well after the advance is a skip again, uncounted: ' + lg.later);
  ok(lg.back === false, 'BACK has nothing to do on LUMI practice (false)');
  ok(lg.stop === 'Stopped' && !lg.s5.running && lg.status === 'Stopped. Start again when ready.' && lg.stopAgain === false, 'STOP = the Stop button (status text), a second Stop is "nothing here": ' + lg.status);
  ok(lg.hw.length === 0 && !lg.s5.armed && !lg.s5.tested && !lg.s5.leased, 'no device output, lease, port change or sound route was touched: ' + JSON.stringify(lg.hw));

  console.log('# LUMI practice: manual check and next');
  const lm = await page.evaluate(async () => {
    const o = {}, S = () => SLLumiPractice.snapshot();
    const f = __q('#lp-flow'); f.value = 'manual'; f.dispatchEvent(new Event('change'));
    o.flow = S().flow;
    o.start = __ra('next');
    o.wrong = __ra('next'); o.s1 = S(); o.result1 = __q('#lp-result').textContent;
    S().target.forEach(n => __q('[data-answer-note="' + n + '"]').click());
    o.right = __ra('next'); o.s2 = S(); o.checkDisabled = __q('#lp-check').disabled;
    const t = S().target.join(), serial = t;
    o.next = __ra('next'); o.s3 = S(); o.changed = S().target.join() !== serial; o.held = S().held.length;
    return o;
  });
  ok(lm.flow === 'manual' && lm.start === 'Start', 'manual flow: NEXT starts');
  ok(lm.wrong === 'Try again' && lm.s1.attempts === 1 && !lm.s1.answered && /Try again/.test(lm.result1), 'NEXT before an answer = Check answer (counts one check): ' + lm.result1);
  ok(lm.right === 'Correct' && lm.s2.answered && lm.s2.correct === 1 && lm.s2.attempts === 2 && lm.checkDisabled, 'NEXT with the exact notes held = Check answer, correct');
  ok(lm.next === 'Next target' && lm.changed && !lm.s3.answered && lm.held === 0 && lm.s3.attempts === 2, 'NEXT after a correct check = Next target (simulated answers released, no extra check)');

  console.log('# LUMI practice: hardware mode');
  const lh = await page.evaluate(async () => {
    const o = {}, S = () => SLLumiPractice.snapshot();
    __ra('stop'); await __wait(20);
    o.simKey = App.remoteKeyPage();
    const m = __q('#lp-mode'); m.value = 'hardware'; m.dispatchEvent(new Event('change')); await __wait(20);
    o.hwKey = App.remoteKeyPage(); __clearToast();
    o.next = __ra('next'); o.running = S().running; o.toast = __toast();
    o.hw = __hw.slice();
    return o;
  });
  ok(lh.simKey === true && lh.hwKey === false, 'remoteKey: the double-tap key is reserved in simulated mode only');
  ok(lh.next === 'Not started' && !lh.running && /Choose an available synth or LUMI answer input/.test(lh.toast), 'a hardware start without an input toasts why: ' + lh.toast);
  ok(lh.hw.length === 0, 'the failed start changed no port or output: ' + JSON.stringify(lh.hw));
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  console.log('# LUMI practice through MIDI: a learned CC and the double-tap key');
  ({ ctx, page, errs } = await newPage(browser, { 'remote.map': MAP, 'remote.dbl': true }));
  const le = await page.evaluate(async () => {
    const o = {}, S = () => SLLumiPractice.snapshot();
    App.switchTo('lumipractice'); await __wait(150);
    __raw.length = 0;
    __press(86); await __wait(40);
    o.cc = S().running; o.hud = __hud(); o.raw = __raw.filter(b => /^176 8[567] /.test(b)).length;
    await __wait(300);
    __press(85); await __wait(40); o.stop = !S().running + '|' + __hud();
    await __wait(300);
    // one strike of the lowest key: claimed and silent, nothing happens
    o.lo = App.midi.range().lo; __notes.length = 0; __ev.length = 0;
    __strike(o.lo, 'li'); await __wait(400);
    o.one = S().running + '|' + __notes.length + '|' + __ev.length;
    // two strikes within 350 ms = NEXT = Start
    __strike(o.lo, 'li'); await __wait(60); __strike(o.lo, 'li'); await __wait(40);
    o.two = S().running + '|' + __notes.length + '|' + __ev.join() + '|' + __hud();
    await __wait(300);
    // hardware mode: the key is an answer like any other, never a remote gesture
    __ra('stop');
    const m = __q('#lp-mode'); m.value = 'hardware'; m.dispatchEvent(new Event('change')); await __wait(20);
    const i = __q('#lp-input'); i.value = 'li'; i.dispatchEvent(new Event('change')); await __wait(20);
    __q('#lp-start').click(); await __wait(20);
    o.hwRunning = S().running;
    __notes.length = 0; __ev.length = 0;
    __send([0x90, o.lo, 90], 'li'); await __wait(60); __send([0x80, o.lo, 0], 'li'); __send([0x90, o.lo, 90], 'li'); await __wait(40);
    o.hwHeld = S().held.join(); o.hwNotes = __notes.join(); o.hwEv = __ev.join(); o.hwStill = S().running;
    __send([0x80, o.lo, 0], 'li');
    return o;
  });
  ok(le.cc === true && /Start/.test(le.hud) && le.raw === 0, 'CC 86 press + release starts the session, the HUD says Start, the CC never reaches midi:raw: ' + le.hud);
  ok(le.stop === 'true|' + 'Stopped', 'CC 85 stops it, the HUD says Stopped: ' + le.stop);
  ok(le.one === 'false|0|0', 'one strike of the lowest key alone: no note, no action: ' + le.one);
  ok(/^true\|0\|next:dbltap:1\|.*Start/.test(le.two), 'two strikes within 350 ms = NEXT (Start), silent: ' + le.two);
  ok(le.hwRunning && le.hwHeld === String(le.lo) && /on 48/.test(le.hwNotes) && le.hwEv === '' && le.hwStill, 'hardware mode: the lowest key plays and is held as an answer, no remote gesture: ' + J(le));
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  console.log('# LUMI practice, hardware: a NEXT learned on the answer keyboard\'s top key');
  ({ ctx, page, errs } = await newPage(browser, { 'remote.map': Object.assign({}, MAP, { next: { midi: { t: 'note', n: 108, ch: null, port: 'MODX-1' }, key: null } }) }));
  const ln = await page.evaluate(async () => {
    const o = {}, S = () => SLLumiPractice.snapshot();
    App.switchTo('lumipractice'); await __wait(150);
    const m = __q('#lp-mode'); m.value = 'hardware'; m.dispatchEvent(new Event('change')); await __wait(20);
    const i = __q('#lp-input'); i.value = 'mi'; i.dispatchEvent(new Event('change')); await __wait(20);
    __q('#lp-start').click(); await __wait(20);
    o.running = S().running; const t1 = S().target.slice();
    // hold the exact target on the MODX: the guided advance is pending
    t1.forEach(n => __send([0x90, n, 90])); await __wait(30);
    o.advancing = S().advancing;
    __notes.length = 0;
    __send([0x90, 108, 100]); await __wait(30);
    o.hud = __hud(); o.held = S().held.join(); o.feedback = S().feedback; o.stillAdvancing = S().advancing;
    __send([0x80, 108, 0]); await __wait(800);
    o.s2 = S(); o.moved = S().target.join() !== t1.join(); o.notes108 = __notes.filter(n => / 108$/.test(n)).length;
    t1.forEach(n => __send([0x80, n, 0])); await __wait(20);
    // manual flow: the bound key held alongside the answer is no extra note
    const f = __q('#lp-flow'); f.value = 'manual'; f.dispatchEvent(new Event('change')); await __wait(20);
    __q('#lp-start').click(); await __wait(20);
    const t2 = S().target.slice();
    t2.forEach(n => __send([0x90, n, 90])); await __wait(20);
    __send([0x90, 108, 100]); await __wait(30);
    o.mHeld = S().held.join() === t2.join(); o.mFeedback = S().feedback; o.mAnswered = S().answered; o.mCorrect = S().correct;
    __send([0x80, 108, 0]); t2.forEach(n => __send([0x80, n, 0]));
    __ra('stop');
    return o;
  });
  ok(ln.running && ln.advancing && /Moving on/.test(ln.hud), 'the learned top key on the answer input = NEXT while the advance is pending: ' + ln.hud);
  ok(ln.held && !/108/.test(ln.held) && ln.feedback === 'correct' && ln.stillAdvancing, 'the remote key is never held as an answer, the advance stays on its way: held ' + ln.held + ', ' + ln.feedback);
  ok(ln.moved && ln.s2.correct === 1 && ln.s2.attempts === 1 && ln.notes108 === 0, 'the pending advance lands and counts once: ' + ln.s2.correct + '/' + ln.s2.attempts);
  ok(ln.mHeld && ln.mFeedback !== 'wrong' && ln.mAnswered && ln.mCorrect === 1, 'manual flow: the remote key is no wrong extra note; it checks the held answer as correct: ' + ln.mFeedback);
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  console.log('# Practice plan');
  ({ ctx, page, errs } = await newPage(browser, { 'remote.map': MAP, 'remote.dbl': true }));
  const pp = await page.evaluate(async () => {
    const o = {}, P = App.practicePlan;
    App.practiceInstrument.set('piano');
    App.switchTo('practiceplan'); await __wait(120);
    o.items = P.state().availableItems.map(i => i.title).join(' | ');
    o.remoteKey = App.remoteKeyPage();
    o.idle = JSON.stringify([__ra('stop'), __ra('back')]);
    o.n1 = __ra('next'); o.a1 = App.active;
    App.switchTo('practiceplan'); await __wait(60);
    o.n2 = __ra('next'); o.a2 = App.active; o.kl = App.store.get('kl.sel', null);
    App.switchTo('practiceplan'); await __wait(60);
    o.b1 = __ra('back'); o.ab = App.active;
    App.switchTo('practiceplan'); await __wait(60);
    o.n3 = __ra('next'); o.a3 = App.active; o.running = (App.store.get('pp.running', null) || {}).item;
    // a Woodshed run is recorded: the piece block is measured complete
    const now = Date.now();
    App.practiceProgress.recordSession({ id: 'rp-shed-1', instrument: 'piano', mode: 'woodshed', startedAt: now, endedAt: now + 500, engagedSeconds: 0.5,
      status: 'complete', expected: 1, matched: 1, missed: 0, extra: 0, wrong: 0, tempo: null, timingSamples: 0, sumAbsTimingMs: 0, sumTimingMs: 0 });
    P.refresh();
    const st = P.state(); o.pieceDone = !!(st.session.items['pp-starter-piece'] || {}).done;
    App.switchTo('practiceplan'); await __wait(60);
    o.n4 = __ra('next'); o.a4 = App.active;
    App.switchTo('practiceplan'); await __wait(60);
    o.n5 = __ra('next'); o.a5 = App.active; // past the end: wraps to the first unfinished block
    App.switchTo('practiceplan'); await __wait(60);
    o.n6 = __ra('next');
    App.switchTo('practiceplan'); await __wait(60);
    o.n7 = __ra('next'); // the finished piece block is skipped
    App.switchTo('practiceplan'); await __wait(60);
    // the button path sets Back's block too
    __q('[data-pp-open="pp-starter-tune"]').click(); await __wait(30);
    App.switchTo('practiceplan'); await __wait(60);
    o.b2 = __ra('back');
    // a plan with no matching blocks: nothing to move on to or back to
    App.switchTo('practiceplan'); await __wait(60);
    P.preview('Sing the melody'); P.accept();
    o.empty = JSON.stringify([P.state().availableItems.length, __ra('next'), __ra('back'), __ra('stop')]);
    return o;
  });
  ok(pp.items === 'Tune up | C major · RH | Work on your piece | Ear & theory' && pp.remoteKey === true, 'starter plan for piano, remoteKey on: ' + pp.items);
  ok(pp.idle === '[false,false]', 'STOP and BACK (nothing launched yet) are "nothing here": ' + pp.idle);
  ok(pp.n1 === 'Block: Tune up' && pp.a1 === 'tuner', 'NEXT launches the first unfinished block: ' + pp.n1);
  ok(pp.n2 === 'Block: C major · RH' && pp.a2 === 'piano' && pp.kl === 'c-r', 'NEXT again moves past the casual Tuner block (which never completes) to the Keys lesson: ' + pp.n2);
  ok(pp.b1 === 'Again: C major · RH' && pp.ab === 'piano', 'BACK opens the last launched block again: ' + pp.b1);
  ok(pp.n3 === 'Block: Work on your piece' && pp.a3 === 'shed' && pp.running === 'pp-starter-piece', 'NEXT launches the piece with its measured tracking');
  ok(pp.pieceDone, 'a recorded Woodshed run completes the piece block');
  ok(pp.n4 === 'Block: Ear & theory' && pp.a4 === 'quiz', 'NEXT: the block after the last one: ' + pp.n4);
  ok(pp.n5 === 'Block: Tune up' && pp.a5 === 'tuner', 'NEXT past the end wraps to the first unfinished block: ' + pp.n5);
  ok(pp.n6 === 'Block: C major · RH' && pp.n7 === 'Block: Ear & theory', 'a block measured complete is skipped: ' + pp.n6 + ' -> ' + pp.n7);
  ok(pp.b2 === 'Again: Tune up', 'a block opened from its button is what BACK reopens: ' + pp.b2);
  ok(pp.empty === '[0,false,false,false]', 'no matching blocks: NEXT / BACK / STOP are "nothing here": ' + pp.empty);

  console.log('# Practice plan through MIDI');
  const pe = await page.evaluate(async () => {
    const o = {}, P = App.practicePlan;
    // a fresh student keeps the starter plan
    App.switchTo('practiceplan'); await __wait(60);
    __q('details.pp-notes').open = true;
    __q('#pp-name').value = 'Remote'; __q('#pp-add').click(); await __wait(30);
    o.items = P.state().availableItems.length;
    __clearToast();
    __press(87); await __wait(40); o.backToast = __toast(); o.backActive = App.active; // the new student has launched nothing
    await __wait(300);
    __raw.length = 0; __press(86); await __wait(40);
    o.cc = App.active + '|' + __hud() + '|' + __raw.filter(b => /^176 86 /.test(b)).length;
    App.switchTo('practiceplan'); await __wait(60);
    await __wait(300); __clearToast(); __press(85); await __wait(40); o.stopToast = __toast();
    // the double-tap key: one strike nothing, two = NEXT
    await __wait(300);
    const lo = App.midi.range().lo; __notes.length = 0; __ev.length = 0;
    __strike(lo, 'li'); await __wait(400);
    o.one = App.active + '|' + __notes.length + '|' + __ev.length;
    __strike(lo, 'li'); await __wait(60); __strike(lo, 'li'); await __wait(40);
    o.two = App.active + '|' + __notes.length + '|' + __ev.join() + '|' + __hud();
    return o;
  });
  ok(pe.items === 4 && /Nothing to go back to/.test(pe.backToast) && pe.backActive === 'practiceplan', 'a new student: BACK by CC 87 has nothing to reopen (the core toast): ' + pe.backToast);
  ok(/^tuner\|.*Block: Tune up\|0$/.test(pe.cc), 'CC 86 launches the first block, the HUD names it, the CC never reaches midi:raw: ' + pe.cc);
  ok(/Nothing to stop here/.test(pe.stopToast), 'CC 85 on the plan: nothing to stop (the core toast): ' + pe.stopToast);
  ok(pe.one === 'practiceplan|0|0', 'one strike of the lowest key on the plan: claimed, silent, nothing happens: ' + pe.one);
  ok(/^piano\|0\|next:dbltap:1\|.*Block: C major/.test(pe.two), 'double-tap the lowest key on the plan = NEXT, silent: ' + pe.two);

  console.log('# Practice plan after a reload, and a typed draft');
  await page.reload();
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.active && App.remote && App.practicePlan);
  const pr = await page.evaluate(async () => {
    const o = {}, P = App.practicePlan;
    App.switchTo('practiceplan'); await __wait(120);
    o.student = P.state().student.name; o.last = P.state().session.last;
    o.back = __ra('back'); o.ab = App.active;
    App.switchTo('practiceplan'); await __wait(60);
    o.next = __ra('next'); o.an = App.active;
    App.switchTo('practiceplan'); await __wait(60);
    // lesson notes typed but not reviewed: the pedal must not wipe them
    __q('details.pp-notes').open = true;
    const notes = __q('#pp-notes'); notes.focus(); notes.value = 'Scales: D major RH\nTune up';
    __clearToast();
    o.dNext = __ra('next'); o.dActive = App.active; o.dToast = __toast();
    __clearToast(); o.dBack = __ra('back'); o.dBackToast = __toast();
    await __wait(300); __clearToast(); __press(86); await __wait(40);
    o.dCC = App.active + '|' + __toast() + '|' + __hud();
    o.kept = __q('#pp-notes').value;
    // reviewed, not accepted: still held back, said so
    __q('#pp-review').click(); await __wait(30);
    __clearToast(); o.rNext = __ra('next'); o.rToast = __toast();
    // a typed Doc link, too
    __q('#pp-notes').value = P.state().plan.source || '';
    __q('#pp-link').value = 'https://docs.google.com/document/d/abc123/edit';
    __clearToast(); o.lNext = __ra('next'); o.lToast = __toast();
    __q('#pp-link').value = P.state().student.docUrl || '';
    notes.blur();
    o.clean = __ra('next'); o.ac = App.active;
    return o;
  });
  ok(pr.student === 'Remote' && pr.last === 'pp-starter-keys', 'the block last opened is in the day\'s session record: ' + pr.last);
  ok(pr.back === 'Again: C major · RH' && pr.ab === 'piano', 'after a reload BACK still reopens the last block: ' + pr.back);
  ok(pr.next === 'Block: Work on your piece' && pr.an === 'shed', 'after a reload NEXT moves on from it (not back to Tune up): ' + pr.next);
  ok(pr.dNext === false && pr.dActive === 'practiceplan' && pr.dToast === 'Review or clear your lesson notes first' && pr.dBack === false && /lesson notes/.test(pr.dBackToast), 'typed lesson notes: NEXT and BACK stay on the plan and say why: ' + pr.dToast);
  ok(/^practiceplan\|Review or clear your lesson notes first\|$/.test(pr.dCC), 'CC 86 with a draft: the page\'s reason, not the core toast, no HUD: ' + pr.dCC);
  ok(pr.kept === 'Scales: D major RH\nTune up', 'the draft is kept');
  ok(pr.rNext === false && pr.rToast === 'Accept or clear your lesson notes first', 'a reviewed, unaccepted draft: ' + pr.rToast);
  ok(pr.lNext === false && /Doc link/.test(pr.lToast), 'a typed Doc link holds it back too: ' + pr.lToast);
  ok(pr.clean === 'Block: Ear & theory' && pr.ac === 'quiz', 'cleared: NEXT launches again: ' + pr.clean);
  ok(!errs.length, 'no page errors: ' + J(errs)); await ctx.close();

  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
