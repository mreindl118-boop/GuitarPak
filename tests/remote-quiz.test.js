// Controller remote on Exercises (js/quiz.js onRemote / remoteKey): NEXT,
// BACK and STOP in every view (home + node card, topic, run, done) for
// levels, jumps, drills, 60-second sprints and Endless streaks — each acting
// like the button the player would have tapped. Show answer (a miss) needs
// two presses and never fires on a question that just appeared, nor in an
// Endless run. End to end through a fake MODX (CC 86/87/85) and a fake LUMI
// (double-tap of its lowest key): the remote's messages never reach
// 'midi:raw' / 'midi:note', and one strike of the reserved key is never graded
// — unless that key is the answer (a bass-clef C3), when it answers. A done
// screen is never skipped by any action landing with it; HUD labels fit one
// line on a phone and the toast carries the full sentence.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

const MAP = {
  next: { midi: { t: 'cc', n: 86, ch: null, port: '' }, key: null },
  back: { midi: { t: 'cc', n: 87, ch: null, port: '' }, key: null },
  stop: { midi: { t: 'cc', n: 85, ch: null, port: '' }, key: null }
};

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript((map) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.remote.map', JSON.stringify(map));
    localStorage.setItem('guitarlab.remote.dbl', 'false');
    const mkIn = (id, name) => ({ id, name, state: 'connected', onmidimessage: null });
    const modx = mkIn('in-modx', 'MODX-1'), lumi = mkIn('in-lumi', 'LUMI Keys BLOCK');
    const out = { id: 'out-lumi', name: 'LUMI Keys BLOCK', state: 'connected', send: () => {} };
    const access = { inputs: new Map([['in-modx', modx], ['in-lumi', lumi]]), outputs: new Map([['out-lumi', out]]), sysexEnabled: true, onstatechange: null };
    navigator.requestMIDIAccess = () => Promise.resolve(access);
    window.__send = (port, bytes) => { const p = port === 'lumi' ? lumi : modx; if (p.onmidimessage) p.onmidimessage({ data: new Uint8Array(bytes) }); };
    window.__press = (n, port) => { __send(port || 'modx', [0xB0, n, 127]); __send(port || 'modx', [0xB0, n, 0]); };
    window.__strike = (n, port) => { __send(port || 'lumi', [0x90, n, 100]); __send(port || 'lumi', [0x80, n, 0]); };
    window.__wait = ms => new Promise(r => setTimeout(r, ms));
  }, MAP);
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.active === 'quiz' && window.SLQuiz && App.remote);
  await page.evaluate(() => {
    window.R = a => App.remoteAction(a, { via: 'test' });
    window.aged = () => { if (SLQuiz.cur) SLQuiz.cur.t0 = performance.now() - 5000; };
    window.wrong = () => { const q = SLQuiz.q; return q.choices.filter(c => c.id !== q.correct)[0].id; };
    // a level answered right (or wrong) by tapping, moved on by the remote
    window.runLevel = (id, good, opt) => {
      SLQuiz.start(id, opt); const labels = [];
      for (let i = 0; i < 10 && SLQuiz.view === 'run'; i++) { SLQuiz.pick(good ? SLQuiz.q.correct : wrong()); labels.push(R('next')); }
      return labels;
    };
    window.played = 0;
    const kp = App.keys.play; App.keys.play = function () { window.played++; return kp.apply(this, arguments); };
    const pl = App.pluck; App.pluck = function () { window.played++; return pl.apply(this, arguments); };
    window.raws = []; App.on('midi:raw', d => window.raws.push(Array.from(d.bytes)));
    window.notes = []; App.on('midi:note', d => window.notes.push((d.on ? '+' : '-') + d.midi + '@' + (d.port || '')));
    window.remotes = []; App.on('remote', d => window.remotes.push(d.action + ':' + d.via));
    window.hud = () => { const h = document.getElementById('remote-hud'); return h ? h.textContent : ''; };
    window.toast = () => { const t = document.getElementById('app-toast'); return t && !t.hidden ? t.textContent : ''; };
  });

  console.log('# the contract');
  const c0 = await page.evaluate(() => ({ key: App.remoteKeyPage(), tour: Help.TOURS.quiz.some(s => /Hands-free control/.test(s.x) && /page turner/.test(s.x)),
    endless: Help.TOURS.quiz.some(s => /press it twice to show an answer, not in an Endless streak/.test(s.x)) }));
  ok(c0.key === true, 'Exercises declares remoteKey (the reserved double-tap key may be claimed here)');
  ok(c0.tour, 'the Exercises tour has a step about a pedal / page turner in Settings › Hands-free control');
  ok(c0.endless, 'the tour step says the two-press Show answer is not in an Endless streak');

  console.log('# home: lesson first, then the level; node card; tabs');
  const h1 = await page.evaluate(() => {
    const o = { view0: SLQuiz.view, cur0: SLQuiz.current(), node0: SLQuiz.node(SLQuiz.current()) };
    o.r1 = R('next');
    o.card = !!document.querySelector('#qz-node-' + o.cur0 + ' .qz-npop');
    o.lesson = !!document.querySelector('.qz-npop details.qz-nlearn[open]');
    o.view1 = SLQuiz.view;
    o.r2 = R('next');
    o.view2 = SLQuiz.view; o.lvl2 = SLQuiz.cur && SLQuiz.cur.lvl.id; o.from = SLQuiz.cur && SLQuiz.cur.from;
    return o;
  });
  ok(h1.view0 === 'home' && h1.node0.done === 0, 'starts on the home Path, the current step not started: ' + JSON.stringify(h1.node0));
  ok(h1.r1 === 'Lesson' && h1.card && h1.lesson && h1.view1 === 'home', 'NEXT on a new step opens its card with the lesson open (nothing starts): ' + h1.r1);
  ok(h1.r2 === 'Start' && h1.view2 === 'run' && h1.lvl2 === h1.node0.first && h1.from === 'path', 'NEXT again = the card\'s Start: level 1 runs from the path: ' + h1.r2 + ' ' + h1.lvl2);

  const h2 = await page.evaluate(() => {
    const o = {}, node = SLQuiz.cur.lvl.node.i, session = SLQuiz.cur;
    o.stop = R('stop'); o.view = SLQuiz.view; o.stopped = session.finished === true;
    o.card = !!document.querySelector('#qz-node-' + node + ' .qz-npop');
    o.back1 = R('back'); o.card2 = !!document.querySelector('.qz-npop');
    o.back2 = R('back');
    o.stopHome = R('stop');
    SLQuiz.tab('topics');
    o.back3 = R('back'); o.tab = document.querySelector('[data-qzh][aria-selected="true"]').getAttribute('data-qzh');
    // the open card (node 0, now started) after the lesson: Start/Level n via the card's primary
    SLQuiz.tab('progress');
    o.fromProgress = R('next'); o.view2 = SLQuiz.view; o.tabAfter = document.querySelector('[data-qzh][aria-selected="true"]').getAttribute('data-qzh');
    o.card3 = !!document.querySelector('.qz-npop details.qz-nlearn[open]');
    return o;
  });
  ok(h2.stop === 'Stopped' && h2.view === 'home' && h2.stopped && h2.card, 'STOP in a path level = End: stopped, back on the path with its card open: ' + h2.stop);
  ok(h2.back1 === 'Card closed' && !h2.card2, 'BACK on home closes the open node card');
  ok(h2.back2 === false && h2.stopHome === false, 'nothing to go back to / stop on the bare Path (false = the core toasts)');
  ok(h2.back3 === 'Path' && h2.tab === 'path', 'BACK on the Topics tab returns to the Path tab');
  ok(h2.fromProgress === 'Lesson' && h2.view2 === 'home' && h2.tabAfter === 'path' && h2.card3, 'NEXT from the Progress tab switches to the Path and opens the new step\'s lesson (not a toggle-close)');

  console.log('# run: two-press Show answer, guarded against a fresh question');
  const r1 = await page.evaluate(() => {
    const o = {};
    o.start = R('next'); o.view = SLQuiz.view; // the card is open: its Start
    const q = SLQuiz.q;
    o.fresh = R('next'); o.freshAnswered = SLQuiz.cur.answered;
    aged();
    o.arm = R('next'); o.armAnswered = SLQuiz.cur.answered; o.armToast = toast();
    o.reveal = R('next'); o.answered = SLQuiz.cur.answered; o.res = SLQuiz.cur.res.join();
    o.fb = document.getElementById('qz-fb').textContent; o.act = document.getElementById('qz-act').textContent.trim();
    o.next = R('next'); o.moved = SLQuiz.q !== q && !SLQuiz.cur.answered;
    // an arm belongs to its question: a press armed on one never reveals the next
    aged(); o.arm2 = R('next');
    SLQuiz.pick(SLQuiz.q.correct);
    o.next2 = R('next');
    aged(); o.arm3 = R('next'); o.arm3Answered = SLQuiz.cur.answered;
    return o;
  });
  ok(r1.start === 'Start' && r1.view === 'run', 'NEXT on the open card starts its level');
  ok(r1.fresh === 'Answer first' && !r1.freshAnswered, 'a NEXT within 1.5 s of the question appearing does nothing (the auto-advance race): ' + r1.fresh);
  ok(r1.arm === 'Again = answer' && !r1.armAnswered, 'the first NEXT on an unanswered question only arms (short HUD label): ' + r1.arm);
  ok(r1.armToast === 'Press Next again to show the answer', 'the arming press toasts the full sentence: ' + r1.armToast);
  ok(r1.reveal === 'Answer shown' && r1.answered && r1.res === 'false' && /Not quite/.test(r1.fb) && /Next/.test(r1.act), 'the second NEXT = Show answer (a miss, feedback, the footer says Next)');
  ok(r1.next === 'Next' && r1.moved, 'NEXT on an answered question = Next (a new question)');
  ok(r1.arm2 === 'Again = answer' && r1.next2 === 'Next' && r1.arm3 === 'Again = answer' && !r1.arm3Answered,
    'an arm on one question never reveals the next one');
  const r2 = await page.evaluate(async () => {
    await __wait(3100);
    const o = { late: R('next'), answered: SLQuiz.cur.answered };
    return o;
  });
  ok(r2.late === 'Again = answer' && !r2.answered, 'a second press after 3 s arms again instead of revealing');
  const r3 = await page.evaluate(() => {
    const o = {}, q = SLQuiz.q;
    o.p0 = played; o.back = R('back'); o.p1 = played;
    o.same = SLQuiz.q === q && SLQuiz.view === 'run' && !SLQuiz.cur.answered;
    // a sheet over the page: the core folds it away; that press never reveals
    aged(); App.switchTo('metronome'); o.sheet = App.sheet;
    o.sheetNext = R('next'); o.sheetClosed = !App.sheet; o.sheetAnswered = SLQuiz.cur.answered;
    // out of sight (app hidden): nothing at all
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    aged(); o.hidden = [R('next'), R('next'), R('back'), R('stop')]; o.hiddenView = SLQuiz.view; o.hiddenAnswered = SLQuiz.cur.answered;
    delete document.hidden;
    o.visible = document.hidden === false;
    return o;
  });
  ok(r3.back === 'Again' && r3.p1 > r3.p0 && r3.same, 'BACK in a run plays the question again (like Space) and never ends the run: ' + (r3.p1 - r3.p0) + ' sound(s)');
  ok(r3.sheet === 'metronome' && r3.sheetNext === 'Answer first' && r3.sheetClosed && !r3.sheetAnswered, 'a NEXT that folds a sheet away gets a fresh question window, never a reveal: ' + r3.sheetNext);
  ok(r3.hidden.every(x => x === false) && r3.hiddenView === 'run' && !r3.hiddenAnswered && r3.visible, 'covered (app hidden): every action returns false and nothing changes');

  console.log('# done: results first, then the primary; BACK = Try again; STOP = the path');
  const d1 = await page.evaluate(() => {
    SLQuiz.stop();
    const first = SLQuiz.levels()[0], o = { first };
    o.labels = runLevel(first, true);
    o.view = SLQuiz.view; o.score = SLQuiz.cur.score;
    o.results = R('next'); o.resultsBack = R('back'); o.resultsStop = R('stop');
    o.still = SLQuiz.view === 'done' && SLQuiz.cur.lvl.id === first && SLQuiz.cur.res.length === 10;
    SLQuiz.cur.doneT = 0; // the results have been read
    o.back = R('back'); o.retry = SLQuiz.view === 'run' && SLQuiz.cur.lvl.id === first && SLQuiz.cur.res.length === 0;
    o.labels2 = runLevel(first, true);
    SLQuiz.cur.doneT = 0;
    o.primary = document.querySelector('.qz-done .qz-acts > .btn.primary').textContent.trim();
    o.next = R('next'); o.lvl = SLQuiz.cur.lvl.id; o.view2 = SLQuiz.view; o.second = SLQuiz.levels()[1];
    return o;
  });
  ok(d1.labels.slice(0, 9).every(l => l === 'Next') && d1.labels[9] === 'Finish' && d1.view === 'done' && d1.score === 10, 'a level answered right, moved on by NEXT; the last NEXT = Finish: ' + d1.labels.join(','));
  ok(d1.results === 'Results' && d1.still, 'a NEXT right as the results land does not skip them: ' + d1.results);
  ok(d1.resultsBack === 'Results' && d1.resultsStop === 'Results' && d1.still, 'a BACK or STOP right as the results land does not skip them either (no restart): ' + d1.resultsBack + ' / ' + d1.resultsStop);
  ok(d1.back === 'Try again' && d1.retry, 'BACK on a done level = Try again (the same level, fresh)');
  ok(d1.next === 'Next level' && d1.primary === 'Next level' && d1.view2 === 'run' && d1.lvl === d1.second, 'NEXT on a passed level = its primary, Next level: ' + d1.next + ' ' + d1.lvl);

  const d2 = await page.evaluate(() => {
    const o = {}, id = SLQuiz.cur.lvl.id;
    o.labels = runLevel(id, false);
    o.failed = SLQuiz.view === 'done' && SLQuiz.cur.score === 0;
    SLQuiz.cur.doneT = 0;
    o.primary = document.querySelector('.qz-done .qz-acts > .btn.primary').id;
    o.next = R('next'); o.again = SLQuiz.view === 'run' && SLQuiz.cur.lvl.id === id;
    runLevel(id, false); SLQuiz.cur.doneT = 0;
    // the drill of the misses
    document.getElementById('qz-drill').click();
    o.drill = !!SLQuiz.cur.drill;
    for (let i = 0; i < 12 && SLQuiz.view === 'run'; i++) { SLQuiz.pick(wrong()); R('next'); }
    o.drillDone = SLQuiz.view === 'done';
    SLQuiz.cur.doneT = 0;
    o.drillBack = R('back'); o.drillAgain = SLQuiz.view === 'run' && !!SLQuiz.cur.drill;
    for (let i = 0; i < 12 && SLQuiz.view === 'run'; i++) { SLQuiz.pick(SLQuiz.q.correct); R('next'); }
    SLQuiz.cur.doneT = 0;
    o.drillNext = R('next'); o.toLevel = SLQuiz.view === 'run' && !SLQuiz.cur.drill && SLQuiz.cur.lvl.id === id;
    o.stopRun = R('stop');
    runLevel(id, false); SLQuiz.cur.doneT = 0;
    const node = SLQuiz.cur.lvl.node.i;
    o.stopDone = R('stop'); o.home = SLQuiz.view === 'home' && !!document.querySelector('#qz-node-' + node + ' .qz-npop');
    return o;
  });
  ok(d2.failed && d2.primary === 'qz-retry' && d2.next === 'Try again' && d2.again, 'a failed level: NEXT = its primary, Try again: ' + d2.next);
  ok(d2.drill && d2.drillDone && d2.drillBack === 'Drill again' && d2.drillAgain, 'drill done: BACK = Drill again (the misses again)');
  ok(d2.drillNext === 'Back to the level' && d2.toLevel, 'drill done: NEXT = its primary, Back to the level');
  ok(d2.stopRun === 'Stopped', 'STOP in a level = Stopped');
  ok(d2.stopDone === 'Path' && d2.home, 'STOP on a done screen = back to the path with the step\'s card open');

  console.log('# Endless streak + 60-second sprint');
  const e1 = await page.evaluate(() => {
    const o = {};
    SLQuiz.endless(0);
    o.endless = SLQuiz.cur.sprint && SLQuiz.cur.sprint.endless;
    const q0 = SLQuiz.q; o.screen = q0.kind === 'choice' && q0.pcAnswer == null;
    aged(); o.n1 = R('next'); o.n1Toast = toast(); o.n2 = R('next'); o.unanswered = !SLQuiz.cur.answered;
    SLQuiz.pick(SLQuiz.q.correct); o.next = R('next'); o.still = SLQuiz.view === 'run' && !SLQuiz.cur.answered;
    SLQuiz.pick(SLQuiz.q.correct);
    o.stop = R('stop'); o.view = SLQuiz.view; o.score = SLQuiz.cur.score; o.rec = SLQuiz.cur.rec && SLQuiz.cur.rec.best;
    o.stop2 = R('stop'); o.stillDone = SLQuiz.view === 'done'; // a second Stop right behind the first keeps the results up
    SLQuiz.cur.doneT = 0;
    o.back = R('back'); o.again = SLQuiz.view === 'run' && SLQuiz.cur.sprint && SLQuiz.cur.sprint.endless;
    R('stop'); SLQuiz.cur.doneT = 0;
    o.primary = R('next'); o.again2 = SLQuiz.view === 'run' && SLQuiz.cur.sprint && SLQuiz.cur.sprint.endless;
    R('stop'); SLQuiz.cur.doneT = 0;
    o.toPath = R('stop'); o.home = SLQuiz.view === 'home';
    SLQuiz.sprint(0);
    o.sprint = SLQuiz.cur.sprint && !SLQuiz.cur.sprint.endless;
    aged(); o.s1 = R('next'); o.s2 = R('next'); o.skipped = SLQuiz.cur.answered && SLQuiz.cur.res.join() === 'false';
    o.sStop = R('stop'); o.sView = SLQuiz.view;
    return o;
  });
  ok(e1.endless && e1.n1 === (e1.screen ? 'Pick with a key' : 'Play the answer') && e1.n2 === e1.n1 && e1.unanswered, 'Endless: NEXT never reveals (a reveal would end the streak): ' + e1.n1);
  ok(/^Endless: (play|tap) the answer.*press Stop to end the run$/.test(e1.n1Toast), 'Endless: the toast says how to answer and that Stop ends: ' + e1.n1Toast);
  ok(e1.next === 'Next' && e1.still, 'Endless: NEXT after a right answer moves on');
  ok(e1.stop === 'Run ended' && e1.view === 'done' && e1.score === 2 && e1.rec === 2, 'Endless: STOP = End run, the streak is kept as the record: ' + e1.score);
  ok(e1.stop2 === 'Results' && e1.stillDone, 'Endless: a second STOP right behind the first keeps the results on screen: ' + e1.stop2);
  ok(e1.back === 'Go again' && e1.again, 'Endless done: BACK = Go again');
  ok(/Go again/.test(e1.primary) && e1.again2, 'Endless done: NEXT = its primary, Go again: ' + e1.primary);
  ok(e1.toPath === 'Path' && e1.home, 'Endless done: STOP = Back to the path');
  ok(e1.sprint && e1.s1 === 'Again = skip' && e1.s2 === 'Skipped' && e1.skipped, '60-second sprint: two presses = Skip (a miss): ' + e1.s1 + ' / ' + e1.s2);
  ok(e1.sStop === 'Stopped' && e1.sView === 'home', '60-second sprint: STOP = End sprint (dropped, back to the path)');

  console.log('# jump test on a locked step');
  const j1 = await page.evaluate(() => {
    const o = {}, nodes = SLQuiz.nodes();
    let i = -1;
    for (let k = 0; k < nodes.length; k++) if (!SLQuiz.node(k).open) { i = k; break; }
    o.i = i;
    if (SLQuiz.tab) SLQuiz.tab('path');
    document.querySelector('[data-qzn="' + i + '"]').click();
    o.card = !!document.querySelector('#qz-node-' + i + ' .qz-npop [data-qzjump]');
    o.next = R('next'); o.jump = SLQuiz.cur && SLQuiz.cur.jump;
    for (let n = 0; n < 10 && SLQuiz.view === 'run'; n++) { aged(); R('next'); R('next'); R('next'); }
    o.done = SLQuiz.view === 'done' && SLQuiz.cur.score === 0;
    SLQuiz.cur.doneT = 0;
    o.back = R('back'); o.again = SLQuiz.view === 'run' && SLQuiz.cur.jump === i && SLQuiz.cur.res.length === 0;
    o.stop = R('stop');
    return o;
  });
  ok(j1.i > 0 && j1.card && j1.next === 'Jump test' && j1.jump === j1.i, 'NEXT on a locked step\'s card = Jump here: ' + j1.next);
  ok(j1.done && j1.back === 'Jump again' && j1.again, 'a failed jump (revealed by NEXT twice per question): BACK = Try the jump again');
  ok(j1.stop === 'Stopped', 'STOP ends the jump test');

  console.log('# topic view');
  const t1 = await page.evaluate(() => {
    const o = {};
    SLQuiz.tab('topics');
    document.querySelector('[data-qzt="notes"]').click();
    o.view = SLQuiz.view;
    o.stopTopic = R('stop');
    o.back = R('back'); o.home = SLQuiz.view === 'home';
    document.querySelector('[data-qzt="notes"]').click();
    o.next = R('next'); o.lvl = SLQuiz.cur && SLQuiz.cur.lvl.id; o.from = SLQuiz.cur && SLQuiz.cur.from;
    o.stop = R('stop'); o.view2 = SLQuiz.view;
    return o;
  });
  ok(t1.view === 'topic' && t1.stopTopic === false, 'nothing to stop in the topic view');
  ok(t1.back === 'Exercises' && t1.home, 'BACK in the topic view = back to the Exercises home');
  ok(/^Level \d+$/.test(t1.next) && t1.next === 'Level 2' && t1.lvl === 'notes/nat/treble/2' && t1.from === 'topic', 'NEXT in a topic = its first open unit\'s first unpassed level: ' + t1.next + ' ' + t1.lvl);
  ok(t1.stop === 'Stopped' && t1.view2 === 'topic', 'STOP in a level started from a topic returns to the topic');

  console.log('# end to end: MODX buttons (CC 86 / 87 / 85)');
  const m1 = await page.evaluate(async () => {
    const o = {};
    SLQuiz.stop(); raws.length = 0; notes.length = 0;
    __press(86); await __wait(60);
    o.start = hud(); o.view = SLQuiz.view;
    if (SLQuiz.view !== 'run') { await __wait(300); __press(86); await __wait(60); o.start2 = hud(); }
    o.run = SLQuiz.view === 'run';
    aged(); await __wait(300);
    __press(86); await __wait(60); o.arm = hud(); o.armAnswered = SLQuiz.cur.answered;
    await __wait(300);
    __press(86); await __wait(60); o.reveal = hud(); o.answered = SLQuiz.cur.answered;
    await __wait(300);
    const p0 = played; __press(87); await __wait(60); o.back = hud(); o.played = played > p0;
    await __wait(300);
    const r0 = remotes.length;
    __send('modx', [0xB0, 86, 127]); await __wait(300); __send('modx', [0xB0, 86, 127]); __send('modx', [0xB0, 86, 0]);
    o.held = remotes.slice(r0).join() === 'next:cc' && SLQuiz.view === 'run' && !SLQuiz.cur.answered; // one press = one NEXT
    await __wait(300);
    __press(85); await __wait(60); o.stop = hud(); o.home = SLQuiz.view === 'home';
    o.raw = raws.filter(b => (b[0] & 0xf0) === 0xB0 && [85, 86, 87].includes(b[1])).length;
    o.rawAll = raws.length; o.notes = notes.length;
    return o;
  });
  ok(m1.run, 'CC 86 from the MODX moves the home page on (lesson, then the level): ' + m1.start + ' / ' + (m1.start2 || ''));
  ok(m1.arm === 'Again = answer' && !m1.armAnswered && m1.reveal === 'Answer shown' && m1.answered, 'CC 86 twice = Show answer, shown on the HUD: ' + m1.arm + ' / ' + m1.reveal);
  ok(m1.back === 'Again' && m1.played, 'CC 87 = hear it again (HUD Again)');
  ok(m1.held, 'a held CC 86 press advances once only');
  ok(m1.stop === 'Stopped' && m1.home, 'CC 85 = Stop (HUD Stopped), back on the path');
  ok(m1.raw === 0 && m1.notes === 0, 'the remote\'s CCs never reached midi:raw or midi:note listeners: ' + m1.raw + ' raw / ' + m1.notes + ' notes');

  console.log('# end to end: double-tap the LUMI\'s lowest key');
  const k1 = await page.evaluate(async () => {
    const o = {};
    App.remote.setDoubleTap(true);
    const lo = App.midi.range().lo; o.lo = lo;
    const lvl = SLQuiz.levels().filter(id => /\/nat\/piano\/2$/.test(id))[0]; o.lvl = lvl;
    // a question whose answer is not the reserved key's pitch class (that one frees the key)
    for (let n = 0; n < 60; n++) { SLQuiz.start(lvl); if (((SLQuiz.q.pc - lo) % 12 + 12) % 12) break; }
    o.kind = SLQuiz.q.kind; o.reserved = App.remoteKeyPage();
    notes.length = 0; raws.length = 0;
    __strike(lo); await __wait(400);
    o.single = !SLQuiz.cur.answered && SLQuiz.cur.res.length === 0;
    o.silent = notes.length === 0 && raws.length === 0;
    aged();
    __strike(lo); await __wait(80); __strike(lo); await __wait(60);
    o.dbl1 = hud(); o.dblAnswered = SLQuiz.cur.answered;
    await __wait(300);
    __strike(lo); await __wait(80); __strike(lo); await __wait(60);
    o.dbl2 = hud(); o.revealed = SLQuiz.cur.answered && SLQuiz.cur.res.join() === 'false';
    o.notes = notes.filter(n => n.indexOf('+' + lo + '@') === 0).length;
    // another key on the LUMI is still an answer
    SLQuiz.start(lvl);
    const pc = SLQuiz.q.pc, key = lo + 1 + ((pc - lo - 1) % 12 + 12) % 12;
    __strike(key); await __wait(40); o.answer = SLQuiz.cur.answered && SLQuiz.cur.lastOk;
    // the MODX's same key is not the LUMI's control key: it plays and answers
    SLQuiz.start(lvl);
    __strike(lo, 'modx'); await __wait(40); o.modx = SLQuiz.cur.answered;
    // Double-tap off: the lowest key is an ordinary key again
    App.remote.setDoubleTap(false);
    SLQuiz.start(lvl);
    __strike(lo); await __wait(40); o.off = SLQuiz.cur.answered && SLQuiz.cur.res.length === 1;
    SLQuiz.stop();
    return o;
  });
  ok(k1.kind === 'single', 'a play-the-note level (any key would answer it): ' + k1.lvl);
  ok(k1.single && k1.silent, 'one strike of the reserved key (' + k1.lo + ') is not graded and reaches no listener');
  ok(k1.reserved === true, 'the key is reserved on a question it does not answer');
  ok(k1.dbl1 === 'Again = answer' && !k1.dblAnswered, 'a double-tap = NEXT (arms Show answer): ' + k1.dbl1);
  ok(k1.dbl2 === 'Answer shown' && k1.revealed && k1.notes === 0, 'a second double-tap = Show answer, and the key never played as a note');
  ok(k1.answer, 'other LUMI keys still answer');
  ok(k1.modx, 'the same pitch on the MODX plays and answers (only the LUMI\'s key is reserved)');
  ok(k1.off, 'Double-tap off: the lowest key answers normally');

  console.log('# the reserved key is free while it is the answer (bass-clef C3)');
  const b1 = await page.evaluate(async () => {
    const o = {}, lo = App.midi.range().lo, lvl = 'notes/nat/bass/1';
    o.lo = lo; o.avail = SLQuiz.levels().indexOf(lvl) >= 0;
    App.remote.setDoubleTap(true);
    const isC = () => SLQuiz.q && SLQuiz.q.pcAnswer != null && ((SLQuiz.q.pcAnswer - lo) % 12 + 12) % 12 === 0;
    const onLo = () => SLQuiz.lumiTargets().indexOf(lo) >= 0;
    let n;
    for (n = 0; n < 400; n++) { SLQuiz.start(lvl); if (onLo()) break; }
    o.found = onLo(); o.kind = SLQuiz.q.kind; o.target = SLQuiz.lumiTargets().join();
    o.lit = SLQuiz.lumiState().active;
    o.free = App.remoteKeyPage();
    notes.length = 0; remotes.length = 0;
    __strike(lo); await __wait(60);
    o.answered = SLQuiz.cur.answered && SLQuiz.cur.lastOk && SLQuiz.cur.res.join() === 'true';
    o.heard = notes.some(x => x.indexOf('+' + lo + '@') === 0); o.noRemote = remotes.length === 0;
    o.afterRight = App.remoteKeyPage(); // answered right: the key is the double-tap Next again
    o.next = R('next'); o.nextMatches = App.remoteKeyPage() === !isC();
    for (n = 0; n < 60 && isC(); n++) SLQuiz.start(lvl);
    o.otherQ = !isC(); o.reservedAgain = App.remoteKeyPage();
    // a miss on a C question: the fresh correction (the key) moves on, ungraded
    for (n = 0; n < 400; n++) { SLQuiz.start(lvl); if (onLo()) break; }
    SLQuiz.pick(wrong()); o.missed = SLQuiz.cur.answered && !SLQuiz.cur.lastOk;
    o.freeMiss = App.remoteKeyPage();
    const q1 = SLQuiz.q; __strike(lo); await __wait(60);
    o.corrected = SLQuiz.q !== q1 && !SLQuiz.cur.answered && SLQuiz.cur.res.join() === 'false';
    // a sprint never takes a correction: the key is the double-tap Next once answered
    const bassNode = SLQuiz.nodes().findIndex((id, i) => SLQuiz.node(i).first === lvl);
    for (n = 0; n < 200 && bassNode >= 0; n++) { SLQuiz.sprint(bassNode); if (SLQuiz.cur && isC()) break; }
    o.sprintNode = SLQuiz.cur && SLQuiz.cur.sprint ? SLQuiz.cur.lvl.id : null;
    if (o.sprintNode && isC()) { o.sprintFree = App.remoteKeyPage(); SLQuiz.pick(wrong()); o.sprintMissed = App.remoteKeyPage(); }
    SLQuiz.stop();
    App.remote.setDoubleTap(false);
    return o;
  });
  ok(b1.avail && b1.found && b1.kind === 'choice', 'a bass-clef reading question whose target is the reserved key ' + b1.lo + ': ' + b1.target);
  ok(b1.free === false, 'that key is not reserved while it is the answer (App.remoteKeyPage() false)');
  ok(b1.answered && b1.heard && b1.noRemote, 'striking it answers right (played as a note, not a remote tap)');
  ok(b1.afterRight === true, 'once answered right, the key is reserved again (its double-tap = Next)');
  ok(b1.next === 'Next' && b1.nextMatches && b1.otherQ && b1.reservedAgain === true, 'the next question that is not C reserves the key again');
  ok(b1.missed && b1.freeMiss === false && b1.corrected, 'after a miss on a C question, the key is the fresh correction: one strike moves on, ungraded');
  ok(b1.sprintNode == null || (b1.sprintFree === false && b1.sprintMissed === true), 'in a sprint, the key is free on an open C question and reserved once it is answered (no corrections): ' + b1.sprintNode);

  console.log('# set questions + a started step');
  const s1 = await page.evaluate(() => {
    const o = {};
    // a set question with screen taps: NEXT = Check (the button that is lit)
    const lvl = SLQuiz.levels().filter(id => { const q = SLQuiz.gen(id); return q && q.kind === 'set'; })[0]; o.lvl = lvl;
    SLQuiz.start(lvl);
    o.noTaps = R('next'); // fresh, nothing tapped: no Check, no reveal
    const k = document.querySelector('#qz-ans .qz-key'), r = k.getBoundingClientRect();
    k.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, clientX: r.left + 2, clientY: r.top + 2 }));
    o.tapped = Object.keys(SLQuiz.cur.tap).length;
    o.check = R('next'); o.answered = SLQuiz.cur.answered && SLQuiz.cur.res.length === 1;
    SLQuiz.stop();
    // every level passed except treble 2: the step is started, so NEXT runs its next level at once
    const p = {}; SLQuiz.levels().forEach(id => { if (id !== 'notes/nat/treble/2') p[id] = { b: 10, s: 3 }; });
    const all = App.store.get('qz.instrumentProg', {}); all[App.practiceInstrument.get()] = p; App.store.set('qz.instrumentProg', all);
    SLQuiz.stop(); SLQuiz.tab('path');
    o.cur = SLQuiz.current();
    o.next = R('next'); o.run = SLQuiz.view === 'run' && SLQuiz.cur.lvl.id === 'notes/nat/treble/2';
    SLQuiz.stop();
    return o;
  });
  ok(!!s1.lvl && s1.noTaps === 'Answer first' && s1.tapped === 1 && s1.check === 'Check' && s1.answered, 'set question with taps: NEXT = Check: ' + s1.lvl + ' ' + s1.check);
  ok(s1.cur === 0 && s1.next === 'Level 2' && s1.run, 'home, the current step already started: NEXT = Continue (its next level): ' + s1.next);

  console.log('# a 60-second sprint ending on its clock: the results are not skipped');
  const sp1 = await page.evaluate(async () => {
    const o = {};
    SLQuiz.sprint(0); o.sprint = !!(SLQuiz.cur && SLQuiz.cur.sprint && !SLQuiz.cur.sprint.endless);
    SLQuiz.pick(SLQuiz.q.correct);
    SLQuiz.cur.sprint.end = Date.now() - 1; await __wait(300);
    o.done = SLQuiz.view === 'done';
    o.back = R('back'); o.stop = R('stop'); o.next = R('next');
    o.still = SLQuiz.view === 'done' && !!SLQuiz.cur.sprint && SLQuiz.cur.sprint.done;
    await __wait(1100);
    o.back2 = R('back'); o.again = SLQuiz.view === 'run' && !!SLQuiz.cur.sprint && !SLQuiz.cur.sprint.done && SLQuiz.cur.res.length === 0;
    SLQuiz.stop();
    return o;
  });
  ok(sp1.sprint && sp1.done, 'a 60-second sprint ended by its clock lands on the results');
  ok(sp1.back === 'Results' && sp1.stop === 'Results' && sp1.next === 'Results' && sp1.still, 'BACK / STOP / NEXT within 1 s of the end keep the results up: ' + [sp1.back, sp1.stop, sp1.next].join(','));
  ok(sp1.back2 === 'Sprint again' && sp1.again, 'after a second, BACK = Sprint again');

  console.log('# phone width: HUD labels fit one line, the toast says the rest');
  await page.setViewportSize({ width: 375, height: 812 });
  const w1 = await page.evaluate(async () => {
    const o = {};
    const fit = () => { const s = document.querySelector('#remote-hud span'); return s ? { t: s.textContent, ok: s.scrollWidth <= s.clientWidth, w: s.scrollWidth + '/' + s.clientWidth } : { t: '', ok: false, w: '-' }; };
    const clk = SLQuiz.clock(); SLQuiz.clock(0);
    SLQuiz.start(SLQuiz.levels()[0]); aged();
    await __wait(300); App.remote.fire('next', 'test'); await __wait(50); o.arm = fit(); o.armToast = toast();
    SLQuiz.stop(); SLQuiz.sprint(0); aged();
    await __wait(300); App.remote.fire('next', 'test'); await __wait(50); o.skip = fit(); o.skipToast = toast();
    SLQuiz.stop(); SLQuiz.endless(0);
    const q0 = SLQuiz.q; o.playable = !(q0.kind === 'choice' && q0.pcAnswer == null);
    await __wait(300); App.remote.fire('next', 'test'); await __wait(50); o.play = fit(); o.playToast = toast();
    // a node answered on screen only (ear, intervals, theory): MIDI cannot answer it
    const nodes = SLQuiz.nodes(); o.screen = null;
    for (let i = 0; i < nodes.length && !o.screen; i++) {
      SLQuiz.stop(); SLQuiz.endless(i);
      const q = SLQuiz.q;
      if (!q || q.kind !== 'choice' || q.pcAnswer != null) continue;
      o.screenNode = nodes[i];
      await __wait(300); App.remote.fire('next', 'test'); await __wait(50); o.screen = fit(); o.screenToast = toast();
      __strike(61); await __wait(40); o.ignored = !SLQuiz.cur.answered; // a black key picks nothing
    }
    SLQuiz.stop(); SLQuiz.clock(clk);
    return o;
  });
  await page.setViewportSize({ width: 1200, height: 900 });
  ok(w1.arm.t === 'Again = answer' && w1.arm.ok, 'phone: the arm label fits the HUD: ' + w1.arm.t + ' ' + w1.arm.w);
  ok(w1.armToast === 'Press Next again to show the answer', 'phone: the toast says a second press shows the answer');
  ok(w1.skip.t === 'Again = skip' && w1.skip.ok && w1.skipToast === 'Press Next again to skip', 'phone: the sprint arm label fits, the toast says skip: ' + w1.skip.w);
  ok(w1.play.t === (w1.playable ? 'Play the answer' : 'Pick with a key') && w1.play.ok, 'phone: the Endless label fits and matches the question type: ' + w1.play.t + ' ' + w1.play.w);
  ok(/^Endless: (play|tap) the answer/.test(w1.playToast), 'phone: the Endless toast: ' + w1.playToast);
  ok(!!w1.screen && w1.screen.t === 'Pick with a key' && w1.screen.ok, 'Endless on a multiple-choice node (' + w1.screenNode + '): NEXT says Pick with a key: ' + (w1.screen && w1.screen.t));
  ok(w1.screenToast === 'Endless: play the white key on your answer, or press Stop to end the run' && w1.ignored, 'and the toast says to play the answer\u2019s white key (a black key picks nothing)');

  console.log('# multiple choice answered from the keyboard (white keys pick the choices)');
  const kc = await page.evaluate(async () => {
    const o = {}, WHITE = [0, 2, 4, 5, 7, 9, 11];
    const keyFor = (q, i) => { const lo = App.midi.range().lo, base = lo - lo % 12; return q.choices.length <= 7 ? 72 + WHITE[i] : base + 12 * Math.floor(i / 7) + WHITE[i % 7]; };
    const clk = SLQuiz.clock(); SLQuiz.clock(0);
    // find a level whose first question is screen-only multiple choice, with up to 7 choices, and one with more
    const lv = SLQuiz.levels(); let small = null, big = null;
    for (let k = 0; k < lv.length && (!small || !big); k++) {
      for (let t = 0; t < 4; t++) {
        SLQuiz.start(lv[k]); const q = SLQuiz.q;
        if (q && q.kind === 'choice' && q.pcAnswer == null) { if (q.choices.length <= 7 && !small) small = lv[k]; if (q.choices.length > 7 && !big) big = lv[k]; }
        SLQuiz.stop();
      }
    }
    o.found = !!small + '|' + !!big;
    SLQuiz.start(small); await __wait(80);
    let q = SLQuiz.q;
    o.badges = Array.from(document.querySelectorAll('.qz-ch .kb')).map(b => b.textContent).join('');
    o.hint = (document.querySelector('.qz-ans .qz-hint') || {}).textContent || '';
    const ci = q.choices.findIndex(c => c.id === q.correct);
    __strike(keyFor(q, ci)); await __wait(40);
    o.right = SLQuiz.cur.answered + '|' + SLQuiz.cur.lastOk;
    // a wrong key = that wrong choice; then the right key moves on (a fresh correction)
    await __wait(1600); q = SLQuiz.q; const q1 = q;
    const ci2 = q.choices.findIndex(c => c.id === q.correct), wrong = ci2 === 0 ? 1 : 0;
    __strike(keyFor(q, wrong)); await __wait(40);
    o.wrong = SLQuiz.cur.answered + '|' + SLQuiz.cur.lastOk;
    __strike(keyFor(q, ci2)); await __wait(60);
    o.corrected = SLQuiz.q !== q1;
    SLQuiz.stop();
    // more than 7 choices: the white keys up from the window's bottom C (two octaves on a LUMI)
    if (big) {
      SLQuiz.start(big); await __wait(80); q = SLQuiz.q;
      o.bigBadges = Array.from(document.querySelectorAll('.qz-ch .kb')).map(b => b.textContent);
      const cb = q.choices.findIndex(c => c.id === q.correct);
      __strike(keyFor(q, cb)); await __wait(40);
      o.bigRight = SLQuiz.cur.answered + '|' + SLQuiz.cur.lastOk + '|' + q.choices.length;
      SLQuiz.stop();
    }
    // the reserved double-tap key never blocks an answer on these questions
    App.remote.setDoubleTap(true); SLQuiz.start(small); await __wait(80);
    o.keyFree = App.remoteKeyPage();
    App.remote.setDoubleTap(false); SLQuiz.stop();
    SLQuiz.clock(clk);
    return o;
  });
  ok(kc.found === 'true|true', 'there are multiple-choice levels with up to 7 and with more choices: ' + kc.found);
  ok(/^CD/.test(kc.badges) && /white key/.test(kc.hint), 'each choice shows its white key (C, D, E…) and a hint says so: ' + kc.badges + ' / ' + kc.hint);
  ok(kc.right === 'true|true', 'playing the right answer\u2019s white key answers it (any octave)');
  ok(kc.wrong === 'true|false' && kc.corrected, 'another white key is that (wrong) choice; then the right key moves on without touching the screen');
  const oct0 = kc.bigBadges && +String(kc.bigBadges[0]).slice(1);
  ok(Array.isArray(kc.bigBadges) && /^C\d$/.test(kc.bigBadges[0]) && kc.bigBadges[1] === 'D' + oct0 && kc.bigBadges[7] === 'C' + (oct0 + 1) && /^true\|true\|/.test(kc.bigRight), 'more than 7 choices: the keys climb from the window\u2019s bottom C over two octaves and answer: ' + JSON.stringify([kc.bigBadges && kc.bigBadges.slice(0, 9), kc.bigRight]));
  ok(kc.keyFree === false, 'with the double-tap on, the lowest key is not reserved on a multiple-choice question (it picks the first answer)');

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
