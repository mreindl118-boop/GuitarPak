// CONTROLLER REMOTE on the Keys page (js/keylessons.js remote + piano.js
// onRemote): every scale-lesson state x NEXT / BACK / STOP through
// App.remoteAction — list (Start; nothing to go back to / stop), Listen first
// (Start / Listen again / Stop), the count-in (Starting… / Restart / Stop,
// never a scored empty infinite run), a finite run (Playing… until every
// note is judged, then Results; Restart; Stop unscored), an infinite run
// (Playing… / End run scored), results (Next level / Again / Go again, a
// passed top level selects the next lesson, the last lesson says so; BACK =
// a true retry of the level just played that never lowers the saved level;
// STOP = Lessons; a NEXT right after the run ends only shows the score),
// the Keys runner taking the remote while it plays / guides / was paused by
// it (and letting go when the page is left or a lesson is opened), the LUMI
// section under the lessons (#pn-lumi, OPEN = OWNER: a lesson started from
// its Start button or opened from elsewhere folds the section and stops its
// session, so the pedal and the lowest key are the lesson's again; open over
// the results it keeps the pedal and BACK starts no lesson), the pedal
// hints, the help tour, a MODX CC end to end (claimed: no 'midi:raw'), the
// lessons' own lowest-key double-tap firing ONCE with the remote's
// double-tap option on (the LUMI section is closed: nothing reserved),
// Listen first leaving nothing of the old demo on the audio clock, BACK
// scoring a finished / infinite run before it retries,
// STOP = the Stop button even with every note judged, and Easier after a
// BACK retry being relative to the level just played.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const J = JSON.stringify;

const MAP = { next: { midi: { t: 'cc', n: 86, ch: null, port: '' }, key: null },
  back: { midi: { t: 'cc', n: 87, ch: null, port: '' }, key: null },
  stop: { midi: { t: 'cc', n: 85, ch: null, port: '' }, key: null } };

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript((MAP) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.lights.on', 'false');
    localStorage.setItem('guitarlab.remote.map', JSON.stringify(MAP));
    localStorage.setItem('guitarlab.kl.prog', JSON.stringify({ 'c-r': { step: 9 } })); // 16ths at 72: a short run
    localStorage.setItem('guitarlab.kl.sel', JSON.stringify('c-r'));
    localStorage.setItem('guitarlab.kl.reps', JSON.stringify(1));
    window.__wait = ms => new Promise(r => setTimeout(r, ms));
    window.__q = s => document.querySelector(s);
    window.__raw = []; window.__ev = []; window.__claims = [];
    const lumi = { id: 'li', name: 'LUMI Keys BLOCK', state: 'connected', onmidimessage: null };
    const modx = { id: 'mi', name: 'MODX-1', state: 'connected', onmidimessage: null };
    const out = { id: 'mo', name: 'MODX-1', state: 'connected', send() {} };
    navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map([['li', lumi], ['mi', modx]]), outputs: new Map([['mo', out]]), sysexEnabled: true, onstatechange: null });
    window.__send = (b, port) => { const p = port === 'li' ? lumi : modx; if (p.onmidimessage) p.onmidimessage({ data: new Uint8Array(b) }); };
    window.__press = (n) => { __send([0xB0, n, 127]); __send([0xB0, n, 0]); };
    window.__tapKey = (n) => { __send([0x90, n, 100], 'li'); __send([0x80, n, 0], 'li'); };
    window.__hud = () => { const h = document.getElementById('remote-hud'); return h && h.classList.contains('show') ? h.textContent : ''; };
    window.__toast = () => { const t = document.getElementById('app-toast'); return t && !t.hidden ? t.textContent : ''; };
    window.__ra = a => App.remoteAction(a, { via: 'test' });
    // the LUMI section under the lessons (#pn-lumi): open or fold it and let
    // its 'toggle' event run (the event is async; piano.js acts on it). The
    // 1 s fallback only keeps a missing event from hanging the run
    window.__lumi = open => {
      const box = __q('#pn-lumi');
      if (box.open === open) return __wait(0);
      return new Promise(done => { box.addEventListener('toggle', () => done(), { once: true }); box.open = open; setTimeout(done, 1000); });
    };
    // every scheduled source node: its start time, its earliest stop, the lesson run it belongs to
    window.__srcs = [];
    [window.AudioScheduledSourceNode && AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype, OscillatorNode.prototype].forEach(S => {
      if (!S) return;
      const own = k => Object.prototype.hasOwnProperty.call(S, k);
      if (own('start')) { const st = S.start; S.start = function (when) { if (!this.__rec) { this.__rec = { when: when || 0, stopAt: Infinity, run: window.App && App.keysLessons ? App.keysLessons.run : null }; __srcs.push(this.__rec); } return st.apply(this, arguments); }; }
      if (own('stop')) { const sp = S.stop; S.stop = function (when) { if (this.__rec) this.__rec.stopAt = Math.min(this.__rec.stopAt, when || 0); return sp.apply(this, arguments); }; }
    });
    // play every target of a finite run on its beat (or the first n of an infinite one)
    window.__playAll = async (R, n) => {
      for (let i = 0; i < (n || R.targets.length); i++) {
        const dl0 = performance.now() + 8000;
        while (!R.targets[i] && performance.now() < dl0) await __wait(10);
        const tg = R.targets[i], at = tg.at + R.lat, dl = performance.now() + Math.max(0, (at - R.ctx.currentTime) * 1000) + 5000;
        while (R.ctx.currentTime < at) {
          if (performance.now() > dl) throw new Error('audio clock stalled');
          await __wait(Math.min(20, Math.max(1, (at - R.ctx.currentTime) * 1000)));
        }
        App.emit('midi:note', { on: true, midi: tg.midi, vel: 90 });
        App.emit('midi:note', { on: false, midi: tg.midi });
      }
    };
    window.__kl = () => App.keysLessons;
    window.__prog = id => (App.store.get('kl.prog', {}) || {})[id] || {};
    window.__setProg = (id, p) => { const all = App.store.get('kl.prog', {}) || {}; all[id] = p; App.store.set('kl.prog', all); };
    // past the count-in of the run now playing
    window.__pastCountIn = async () => {
      const R = App.keysLessons.run, dl = performance.now() + 8000;
      while (R.ctx.currentTime - R.lat < R.first + 0.05 && performance.now() < dl) await __wait(25);
    };
    // a scored result without the wait: start, judge every note, finish
    window.__fakeDone = (id, step, j) => {
      __setProg(id, { step });
      App.store.set('kl.sel', id); App.store.set('kl.reps', 1);
      App.keysLessons.start(false);
      App.keysLessons.run.targets.forEach(t => { t.j = j || 'perfect'; t.err = 0; });
      App.keysLessons.finish();
      const L = App.keysLessons.last;
      return { view: App.keysLessons.view, pass: L.pass, up: L.up, step: L.r.step, btn: (__q('#kl-start') || {}).textContent, next: !!__q('#kl-nextlesson') };
    };
    window.addEventListener('DOMContentLoaded', () => {
      App.on('midi:raw', d => __raw.push(d.bytes.join(' ')));
      App.on('remote', d => __ev.push(d.action + ':' + d.via + ':' + (d.handled ? 1 : 0)));
      App.on('transport:claim', d => __claims.push(d.owner));
    });
  }, MAP);
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.remote && App.keysLessons && App.active === 'quiz');
  await page.evaluate(async () => { App.switchTo('piano'); await __wait(150); });

  console.log('# list: NEXT starts the selected lesson; nothing to go back to or stop');
  const ls = await page.evaluate(async () => {
    const o = { hook: typeof __kl().remote, back: __ra('back'), stop: __ra('stop'), view0: __kl().view };
    o.next = __ra('next');
    const R = __kl().run;
    o.view = __kl().view; o.step = R && R.step; o.lesson = R && R.l.id; o.demo = R && R.demo;
    // the count-in: NEXT waits, BACK restarts, STOP ends it unscored
    o.cin = __ra('next'); o.same = __kl().run === R;
    o.back2 = __ra('back'); o.newRun = !!__kl().run && __kl().run !== R && __kl().run.step === 9;
    o.stop2 = __ra('stop'); o.after = __kl().view; o.none = !__kl().run;
    o.runs = (__prog('c-r').runs || []).length;
    return o;
  });
  ok(ls.hook === 'function' && ls.back === false && ls.stop === false && ls.view0 === 'list', 'list: BACK and STOP have nothing to do (false, the core toasts): ' + J(ls));
  ok(ls.next === 'Start' && ls.view === 'run' && ls.step === 9 && ls.lesson === 'c-r' && !ls.demo, 'list: NEXT = Start, the saved level of the selected lesson');
  ok(ls.cin === 'Starting…' && ls.same, 'count-in: NEXT is ignored ("Starting…"), the run is untouched');
  ok(ls.back2 === 'Restart' && ls.newRun, 'count-in: BACK restarts the run at the same level');
  ok(ls.stop2 === 'Stopped' && ls.after === 'list' && ls.none && ls.runs === 0, 'count-in: STOP ends it, back to the list, nothing recorded');

  console.log('# Listen first');
  const dm = await page.evaluate(async () => {
    __q('#kl-listen').click();
    const R = __kl().run, o = { demo: R && R.demo };
    o.back = __ra('back'); o.replay = !!__kl().run && __kl().run !== R && __kl().run.demo;
    o.next = __ra('next'); o.real = !!__kl().run && !__kl().run.demo && __kl().view === 'run';
    o.stopReal = __ra('stop');
    __q('#kl-listen').click();
    o.stop = __ra('stop'); o.view = __kl().view; o.none = !__kl().run;
    return o;
  });
  ok(dm.demo && dm.back === 'Listen again' && dm.replay, 'Listen first: BACK plays the demo again: ' + J(dm));
  ok(dm.next === 'Start' && dm.real && dm.stopReal === 'Stopped', 'Listen first: NEXT stops listening and starts the real run');
  ok(dm.stop === 'Stopped' && dm.view === 'list' && dm.none, 'Listen first: STOP = the Stop button');

  console.log('# a finite run: Playing… until every note is judged, then Results');
  const fr = await page.evaluate(async () => {
    const o = {};
    o.start = __ra('next');
    const R = __kl().run;
    o.n = R.targets.length;
    for (const tg of R.targets) {
      const at = tg.at + R.lat, dl = performance.now() + Math.max(0, (at - R.ctx.currentTime) * 1000) + 5000;
      while (R.ctx.currentTime < at) {
        if (performance.now() > dl) throw new Error('audio clock stalled');
        await __wait(Math.min(20, Math.max(1, (at - R.ctx.currentTime) * 1000)));
      }
      App.emit('midi:note', { on: true, midi: tg.midi, vel: 90 });
      App.emit('midi:note', { on: false, midi: tg.midi });
      if (tg.i === 5) { o.mid = __ra('next'); o.midSame = __kl().run === R && __kl().view === 'run'; }
    }
    o.fin = __ra('next'); // straight after the last note: the auto-finish is ~0.4 s away
    o.view = __kl().view;
    const L = __kl().last;
    o.hits = L.st.hits; o.score = L.st.score; o.pass = L.pass; o.up = L.up;
    o.btn = __q('#kl-start').textContent; o.nextBtn = !!__q('#kl-nextlesson');
    o.quick = __ra('next'); o.stillDone = __kl().view === 'done'; // the score shows first
    await __wait(650);
    o.nextLesson = __ra('next');
    o.view2 = __kl().view; o.sel = App.store.get('kl.sel'); o.tier = App.store.get('kl.tier');
    o.listTitle = (__q('.kl-title b') || {}).textContent;
    o.prog = __prog('c-r');
    return o;
  });
  ok(fr.start === 'Start' && fr.mid === 'Playing…' && fr.midSame, 'mid-run NEXT = "Playing…", nothing changes: ' + J({ mid: fr.mid }));
  ok(fr.fin === 'Results' && fr.view === 'done' && fr.hits === fr.n, 'every note judged: NEXT shows the results now: ' + J({ fin: fr.fin, hits: fr.hits, n: fr.n }));
  ok(fr.pass && !fr.up && fr.btn === 'Again' && fr.nextBtn, 'a passed top level: "Again" plus a Next lesson button: ' + J({ score: fr.score, btn: fr.btn }));
  ok(fr.quick === 'Results' && fr.stillDone, 'a NEXT right after the run ended only lets the score show');
  ok(fr.nextLesson === 'Next lesson: C major · Left hand' && fr.view2 === 'list' && fr.sel === 'c-l' && fr.tier === 'start' && /C major · Left hand/.test(fr.listTitle),
    'NEXT after a passed top level selects the next lesson in course order: ' + J({ l: fr.nextLesson, sel: fr.sel }));
  ok(fr.prog.step === 9 && fr.prog.runs.length === 1, 'the finished lesson keeps its level; one scored run: ' + J({ step: fr.prog.step, runs: fr.prog.runs.length }));

  console.log('# a finite run after the count-in: BACK restarts, STOP ends it unscored');
  const fr2 = await page.evaluate(async () => {
    __setProg('c-l', { step: 7 }); // 8ths at 100: a short count-in
    const o = { start: __ra('next') };
    await __pastCountIn();
    const R = __kl().run;
    o.next = __ra('next'); o.same = __kl().run === R;
    o.back = __ra('back'); o.restart = !!__kl().run && __kl().run !== R && __kl().run.step === 7 && __kl().view === 'run';
    await __pastCountIn();
    o.stop = __ra('stop'); o.view = __kl().view; o.none = !__kl().run;
    o.prog = __prog('c-l');
    return o;
  });
  ok(fr2.start === 'Start' && fr2.next === 'Playing…' && fr2.same, 'playing: NEXT is acknowledged, nothing skips: ' + J(fr2));
  ok(fr2.back === 'Restart' && fr2.restart, 'playing: BACK restarts from the count-in at the same level');
  ok(fr2.stop === 'Stopped' && fr2.view === 'list' && fr2.none && fr2.prog.step === 7 && !(fr2.prog.runs || []).length, 'playing: STOP = the Stop button (unscored, level unchanged)');

  console.log('# results: Next level, a true retry, Again, Lessons, the last lesson');
  const rs = await page.evaluate(async () => {
    const o = {};
    o.up = __fakeDone('d-r', 4);
    await __wait(650);
    o.retry = __ra('back'); // after a level-up: retry the level just played
    o.retryStep = __kl().run && __kl().run.step; o.savedDuring = __prog('d-r').step;
    __kl().run.targets.forEach(t => { t.j = 'perfect'; t.err = 0; }); __kl().finish();
    o.afterClean = __prog('d-r').step; o.lastUp = __kl().last.up; o.lastStep = __kl().last.r.step;
    await __wait(650);
    o.retry2 = __ra('back');
    __kl().run.targets.forEach(t => { t.j = 'miss'; }); __kl().finish();
    o.afterFail = __prog('d-r').step; o.failPass = __kl().last.pass;
    await __wait(650);
    o.again = __ra('next'); o.againStep = __kl().run && __kl().run.step; // a failed run: Again = the level just played
    __ra('stop');
    o.up2 = __fakeDone('d-r', 5);
    await __wait(650);
    o.nextLevel = __ra('next'); o.nlStep = __kl().run && __kl().run.step;
    __ra('stop');
    o.fail = __fakeDone('em-r', 2, 'miss');
    await __wait(650);
    o.lessons = __ra('stop'); o.lview = __kl().view;
    // STOP after every note was judged (the auto-finish is due): the Stop
    // button's rule — a finite run is never scored — on the pedal too
    __setProg('em-r', { step: 2 }); __ra('next');
    const LS = __kl().run;
    LS.targets.forEach(t => { t.j = 'perfect'; t.err = 0; });
    o.lateStop = __ra('stop'); o.lsView = __kl().view; o.lsRuns = (__prog('em-r').runs || []).length; o.lsScored = !!__kl().last && __kl().last.r === LS;
    __ra('next');
    __kl().run.targets.forEach(t => { t.j = 'perfect'; t.err = 0; });
    __q('#kl-stop').click(); o.btnView = __kl().view; o.btnRuns = (__prog('em-r').runs || []).length;
    __q('#kl-back') && __q('#kl-back').click();
    o.last = __fakeDone('g2-l', 9);
    await __wait(650);
    o.allDone = __ra('next'); o.adView = __kl().view; o.adSel = App.store.get('kl.sel');
    __q('#kl-back').click();
    o.top = __fakeDone('c-r', 9);
    __q('#kl-nextlesson').click();
    o.btnSel = App.store.get('kl.sel'); o.btnView = __kl().view;
    return o;
  });
  ok(rs.up.up && rs.up.btn === 'Next level' && rs.retry === 'Retry' && rs.retryStep === 4 && rs.savedDuring === 5,
    'after a level-up BACK retries the level just played (4), the saved level stays 5: ' + J({ up: rs.up, retry: rs.retry, step: rs.retryStep, saved: rs.savedDuring }));
  ok(rs.afterClean === 5 && rs.lastUp && rs.lastStep === 4 && rs.retry2 === 'Retry' && rs.afterFail === 5 && rs.failPass === false,
    'a clean or failed retry never lowers the saved level: ' + J({ clean: rs.afterClean, fail: rs.afterFail }));
  ok(rs.again === 'Again' && rs.againStep === 4, 'a failed retry of a lower level: NEXT = Again replays the level the results show (not the saved one): ' + J({ again: rs.again, step: rs.againStep }));
  ok(rs.up2.up && rs.nextLevel === 'Next level' && rs.nlStep === 6, 'a level-up: NEXT = Next level: ' + J({ nl: rs.nextLevel, step: rs.nlStep }));
  ok(!rs.fail.pass && !rs.fail.next && rs.lessons === 'Lessons' && rs.lview === 'list', 'results: STOP = Lessons (back to the list)');
  ok(rs.lateStop === 'Stopped' && rs.lsView === 'list' && rs.lsRuns === 0 && !rs.lsScored && rs.btnView === 'list' && rs.btnRuns === 0,
    'STOP once every note is judged = the Stop button: unscored, like a tap on Stop in the same moment: ' + J({ s: rs.lateStop, runs: rs.lsRuns, btn: rs.btnRuns }));
  ok(rs.last.pass && !rs.last.next && rs.allDone === 'All lessons done' && rs.adView === 'done' && rs.adSel === 'g2-l', 'the last lesson passed at the top: "All lessons done", nothing moves: ' + J({ l: rs.allDone }));
  ok(rs.top.next && rs.btnSel === 'c-l' && rs.btnView === 'list', 'the Next lesson button does what NEXT does');

  console.log('# infinite: STOP in the count-in is unscored, End run after it');
  const inf = await page.evaluate(async () => {
    App.store.set('kl.sel', 'c-r'); __setProg('c-r', { step: 7 }); App.store.set('kl.reps', 0);
    __q('#kl-back') && __q('#kl-back').click();
    const o = { start: __ra('next') };
    o.inf = !!__kl().run.inf;
    o.stopCin = __ra('stop'); o.view = __kl().view; o.prog = __prog('c-r');
    o.start2 = __ra('next');
    await __pastCountIn();
    o.next = __ra('next'); o.running = !!__kl().run;
    o.end = __ra('stop'); o.view2 = __kl().view; o.lastInf = !!(__kl().last && __kl().last.inf);
    o.runs = (__prog('c-r').runs || []).length;
    await __wait(650);
    o.retry = __ra('back'); o.retryInf = !!(__kl().run && __kl().run.inf && __kl().run.step === 7);
    o.stopRetry = __ra('stop');
    // a second End run, then Go again
    __ra('next'); await __pastCountIn(); __ra('stop'); await __wait(650);
    o.go = __ra('next'); o.goInf = !!(__kl().run && __kl().run.inf);
    __ra('stop');
    App.store.set('kl.reps', 1);
    return o;
  });
  ok(inf.start === 'Start' && inf.inf && inf.stopCin === 'Stopped' && inf.view === 'list' && !(inf.prog.runs || []).length && !(inf.prog.inf || {})['7'],
    'infinite count-in: STOP stops it without saving an empty run: ' + J({ stop: inf.stopCin, prog: inf.prog }));
  ok(inf.next === 'Playing…' && inf.running && inf.end === 'End run' && inf.view2 === 'done' && inf.lastInf && inf.runs === 1, 'infinite: NEXT plays on, STOP = End run (scored): ' + J({ end: inf.end, runs: inf.runs }));
  ok(inf.retry === 'Retry' && inf.retryInf && inf.stopRetry === 'Stopped', 'infinite results: BACK goes again at the same level');
  ok(inf.go === 'Go again' && inf.goInf, 'infinite results: NEXT = Go again');

  console.log('# the Keys runner takes the remote while it plays, guides or was paused by it');
  const rn = await page.evaluate(async () => {
    const pos = () => { const m = /(\d+) \/ \d+/.exec(__q('#pn-status').textContent); return m ? +m[1] : -1; };
    const playing = () => /Pause/.test(__q('#pn-play').textContent);
    const o = {};
    __q('#pn-play').click(); await __wait(60);
    o.busy = App.keys.runnerBusy() && playing();
    o.next = __ra('next'); o.noLesson = !__kl().run;
    o.back = __ra('back'); o.stillPlaying = playing();
    o.stop = __ra('stop'); o.paused = !playing() && App.keys.runnerBusy();
    o.resume = __ra('next'); o.resumed = playing() && !__kl().run;
    __q('#pn-play').click(); await __wait(30); // an on-screen pause: NEXT is the lesson card's again
    o.handBack = !App.keys.runnerBusy();
    o.lesson = __ra('next'); o.lessonRun = !!__kl().run && !playing();
    __ra('stop');
    // Guide mode: skip a note, a note back, pause, resume in place
    __q('#pn-guide').click();
    __q('#pn-play').click(); await __wait(30);
    o.g0 = pos();
    o.skip = __ra('next'); __ra('next'); o.g2 = pos(); // the remote debounce is in remote.js, not here
    o.noteBack = __ra('back'); o.g1 = pos();
    o.gStop = __ra('stop'); o.gPaused = !playing();
    o.gResume = __ra('next'); o.gAt = pos(); o.gPlaying = playing();
    o.gRestart = (__ra('stop'), __ra('back')); o.gFrom = pos();
    __q('#pn-reset').click();
    o.idleBack = __ra('back'); o.idleStop = __ra('stop');
    __q('#pn-guide').click(); // guide off again
    return o;
  });
  ok(rn.busy && rn.next === 'Playing…' && rn.noLesson && rn.back === 'Restart' && rn.stillPlaying, 'a playing runner: NEXT plays on, BACK restarts it, no lesson starts: ' + J(rn));
  ok(rn.stop === 'Paused' && rn.paused && rn.resume === 'Resume' && rn.resumed, 'STOP pauses it in place; NEXT resumes what the remote paused');
  ok(rn.handBack && rn.lesson === 'Start' && rn.lessonRun, 'paused on screen: NEXT starts the lesson again (and the lesson stops the runner)');
  ok(rn.g0 === 1 && rn.skip === 'Skip note' && rn.g2 === 3 && rn.noteBack === 'Note back' && rn.g1 === 2, 'Guide: NEXT skips a note, BACK goes a note back');
  ok(rn.gStop === 'Paused' && rn.gPaused && rn.gResume === 'Resume' && rn.gAt === 2 && rn.gPlaying, 'Guide: STOP pauses, NEXT resumes at the same note');
  ok(rn.gRestart === 'Restart' && rn.gFrom === 1, 'Guide paused by the remote: BACK restarts from the first note');
  ok(rn.idleBack === false && rn.idleStop === false, 'a reset runner and the list: BACK / STOP have nothing to do');

  console.log('# the LUMI section under the lessons: open = owner');
  const lo = await page.evaluate(async () => {
    const S = () => SLLumiPractice.snapshot(), box = __q('#pn-lumi'), lp = App.lumiPractice;
    const o = { closed0: !box.open && !lp.open, key0: App.remoteKeyPage() };
    __setProg('am-r', { step: 7 }); App.store.set('kl.reps', 1); // 8ths at 100: a short count-in
    App.keysLessons.open('am-r');

    // (1) the section open with a session running, then the lesson's own Start button
    await __lumi(true);
    o.open1 = box.open && lp.open && S().visible;
    o.lumiStart = __ra('next'); o.lumiOn1 = S().running && lp.running; o.noLesson1 = !__kl().run; // the pedal is the section's
    __q('#kl-start').click();
    const R1 = __kl().run;
    o.run1 = !!R1 && R1.l.id === 'am-r' && !R1.demo && __kl().view === 'run';
    o.folded1 = !box.open && !lp.open; o.lumiOff1 = !S().running && !lp.running;
    o.said1 = __q('#lp-status').textContent;
    await __wait(80); // the fold's 'toggle' event has run by now: it must leave the lesson alone
    o.still1 = __kl().run === R1 && __kl().view === 'run';
    o.cin1 = __ra('next'); o.same1 = __kl().run === R1 && !S().running && !box.open;
    o.stop1 = __ra('stop');

    // (2) the same with the remote's double-tap key on: the lowest key is
    // reserved while the section is open, and the lesson's during a lesson
    App.remote.setDoubleTap(true);
    await __lumi(true);
    o.key1 = App.remoteKeyPage();
    __q('#lp-start').click(); o.lumiOn2 = S().running;
    __q('#kl-start').click();
    const R2 = __kl().run;
    o.folded2 = !!R2 && !box.open && !lp.open && !S().running;
    o.key2 = App.remoteKeyPage();
    await __wait(80);
    o.cin2 = __ra('next'); o.same2 = __kl().run === R2;
    await __pastCountIn();
    o.key3 = App.remoteKeyPage();
    const ck = __kl().controlKey, hit0 = R2.lastHit;
    __ev.length = 0;
    __tapKey(ck); await __wait(40);
    o.ck = ck; o.judged = __kl().run === R2 && !!R2.lastHit && R2.lastHit !== hit0; o.gestures = __ev.slice();
    __ra('stop');
    App.remote.setDoubleTap(false);

    // (3) a finished lesson, then the section opened while the results show
    o.done3 = __fakeDone('am-l', 9);
    await __wait(650);
    await __lumi(true);
    o.view3 = __kl().view;
    __q('#lp-start').click(); o.lumiOn3 = S().running;
    o.back3 = __ra('back');
    o.noRun3 = !__kl().run && __kl().view === 'done';
    o.lumiStill3 = S().running && box.open && lp.open;
    o.stop3 = __ra('stop'); o.lumiOff3 = !S().running; o.view3b = __kl().view;
    o.stop3b = __ra('stop'); o.view3c = __kl().view; // nothing left to stop: no fall-through to the card's 'Lessons'

    // (4) a lesson opened from elsewhere (a Plan block, the Learn bar)
    __q('#lp-start').click(); o.lumiOn4 = S().running;
    App.keysLessons.open('dm-r', 'piano');
    o.folded4 = !box.open && !lp.open && !S().running; o.said4 = __q('#lp-status').textContent;
    await __wait(80);
    o.next4 = __ra('next'); o.lesson4 = __kl().run && __kl().run.l.id; o.noLumi4 = !S().running;
    __ra('stop');
    // ... and a section left open on a page that is not showing is folded too
    await __lumi(true);
    App.switchTo('quiz'); await __wait(80);
    o.openAway = lp.open && !S().visible;
    App.keysLessons.open('dm-r', 'piano');
    o.foldedAway = !box.open && !lp.open;
    App.switchTo('piano'); await __wait(120);
    o.next5 = __ra('next'); o.lesson5 = __kl().run && __kl().run.l.id; o.noLumi5 = !S().running && !S().visible;
    __ra('stop');

    App.keysLessons.open('c-r'); // the selection the rest of the suite expects
    o.end = !box.open && !lp.open && !__kl().run && __kl().view === 'list' && !App.keys.runnerBusy() && App.remoteKeyPage() === false;
    return o;
  });
  ok(lo.closed0 && lo.key0 === false, 'the section is closed by default and reserves nothing: ' + J(lo));
  ok(lo.open1 && lo.lumiStart === 'Start' && lo.lumiOn1 && lo.noLesson1, 'open, the section has the pedal: NEXT starts its session, not the lesson');
  ok(lo.run1 && lo.folded1 && lo.lumiOff1 && lo.said1 === 'A lesson started. LUMI session stopped.',
    '(1) the lesson\u2019s Start button: the section is closed, no LUMI session is running, and it says why: ' + lo.said1);
  ok(lo.still1 && lo.cin1 === 'Starting…' && lo.same1 && lo.stop1 === 'Stopped', '(1) NEXT during the count-in answers "Starting…" and the lesson run is still there: ' + J({ cin: lo.cin1, stop: lo.stop1 }));
  ok(lo.key1 === true && lo.lumiOn2 && lo.folded2 && lo.key2 === false && lo.cin2 === 'Starting…' && lo.same2,
    '(2) with the double-tap key on: reserved while the section is open, not during the lesson; NEXT in the count-in is the lesson\u2019s: ' + J({ open: lo.key1, lesson: lo.key2, cin: lo.cin2 }));
  ok(lo.key3 === false && lo.judged && lo.gestures.length === 0, '(2) a strike on the lowest key (' + lo.ck + ') during the lesson is judged, not taken as a remote gesture: ' + J(lo.gestures));
  ok(lo.done3.view === 'done' && lo.view3 === 'done' && lo.lumiOn3 && lo.back3 === false && lo.noRun3 && lo.lumiStill3,
    '(3) the section opened over the results: BACK is "nothing here", no lesson run starts, the LUMI session keeps running: ' + J({ back: lo.back3 }));
  ok(lo.stop3 === 'Stopped' && lo.lumiOff3 && lo.view3b === 'done' && lo.stop3b === false && lo.view3c === 'done',
    '(3) STOP stops the LUMI session only; a second STOP is "nothing here" (no fall-through to the lesson card): ' + J([lo.stop3, lo.stop3b]));
  ok(lo.lumiOn4 && lo.folded4 && lo.said4 === 'A lesson was opened.' && lo.next4 === 'Start' && lo.lesson4 === 'dm-r' && lo.noLumi4,
    '(4) App.keysLessons.open with the section open closes it (the session stops) and NEXT starts that lesson: ' + J({ next: lo.next4, lesson: lo.lesson4 }));
  ok(lo.openAway && lo.foldedAway && lo.next5 === 'Start' && lo.lesson5 === 'dm-r' && lo.noLumi5,
    '(4) a section left open on another page is folded by a lesson opened from there: NEXT is the lesson\u2019s on return');
  ok(lo.end, 'afterwards: section closed, nothing running, nothing reserved');

  console.log('# hints + help tour');
  const ht = await page.evaluate(async () => {
    const o = { list: (__q('.kl-ctl .muted') || {}).textContent || '' };
    __ra('next'); o.run = (__q('.kl-taphint') || {}).textContent || ''; __ra('stop');
    App.remote.clear('next'); await __wait(20);
    o.cleared = (__q('.kl-ctl .muted') || {}).textContent || '';
    App.remote.setPageTurner(true); await __wait(20);
    o.pt = (__q('.kl-ctl .muted') || {}).textContent || '';
    App.remote.setPageTurner(false);
    App.remote.setDoubleTap(true); await __wait(20);
    o.dblOnly = (__q('.kl-ctl .muted') || {}).textContent || ''; // the remote's own double-tap is not a pedal here
    App.remote.setDoubleTap(false);
    const step = (Help.TOURS.piano || []).find(s => s.sel === '.kl-card');
    o.tour = step ? step.x : '';
    return o;
  });
  ok(/Double-tap C3/.test(ht.list) && /Next pedal/.test(ht.list), 'list hint: the double-tap plus "your Next pedal": ' + ht.list);
  ok(/Double-tap C3 or press your Stop pedal to stop/.test(ht.run), 'run hint: the Stop pedal (NEXT does not stop a run): ' + ht.run);
  ok(!/pedal/.test(ht.cleared) && /Next pedal/.test(ht.pt) && !/pedal/.test(ht.dblOnly), 'the hint follows the binding (gone when cleared, a page turner counts, the remote double-tap does not): ' + J([ht.cleared, ht.pt, ht.dblOnly]));
  ok(/Next pedal/.test(ht.tour), 'the Keys tour mentions the Next pedal: ' + ht.tour.slice(-130));

  console.log('# end to end: a MODX CC, claimed before every listener');
  const e2e = await page.evaluate(async (MAP) => {
    App.store.set('remote.map', MAP); App.emit('remote:map', {});
    App.store.set('kl.sel', 'c-r'); __setProg('c-r', { step: 9 });
    await __wait(300);
    __raw.length = 0; __ev.length = 0;
    const o = {};
    __press(86); await __wait(40);
    o.view = __kl().view; o.hud = __hud(); o.ev = __ev.slice();
    __press(85); await __wait(40);
    o.view2 = __kl().view; o.hud2 = __hud();
    __press(87); await __wait(40);
    o.toast = __toast(); o.ev2 = __ev.slice();
    o.raw = __raw.filter(r => /^176 8[567] /.test(r));
    return o;
  }, MAP);
  ok(e2e.view === 'run' && /Start/.test(e2e.hud) && e2e.ev[0] === 'next:cc:1', 'CC 86 on the MODX = NEXT: the lesson starts, the HUD says Start: ' + J(e2e));
  ok(e2e.view2 === 'list' && /Stopped/.test(e2e.hud2), 'CC 85 = STOP: the run stops');
  ok(/Nothing to go back to/.test(e2e.toast) && e2e.ev2[2] === 'back:cc:0', 'CC 87 = BACK in the list: nothing here (toast)');
  ok(e2e.raw.length === 0, 'the bound CCs never reached midi:raw: ' + J(e2e.raw));

  console.log('# the lessons keep their own lowest-key double-tap (the LUMI section is closed: nothing reserved)');
  const dt = await page.evaluate(async () => {
    App.remote.setDoubleTap(true);
    await __wait(400);
    __claims.length = 0; __ev.length = 0;
    const ck = __kl().controlKey, o = { ck, reserved: App.remoteKeyPage() };
    __tapKey(ck); await __wait(60); __tapKey(ck); await __wait(80);
    o.view = __kl().view; o.claims = __claims.filter(c => c === 'keys').length; o.ev = __ev.slice();
    __tapKey(ck); await __wait(60); __tapKey(ck); await __wait(80);
    o.view2 = __kl().view;
    App.remote.setDoubleTap(false);
    return o;
  });
  ok(dt.ck === 48 && dt.reserved === false, 'the LUMI section is closed: the Keys page reserves no key, the lowest key is not the remote\u2019s: ' + J(dt));
  ok(dt.view === 'run' && dt.claims === 1 && dt.ev.length === 0, 'a double-tap starts the lesson ONCE (kl.dbltap), not also via the remote');
  ok(dt.view2 === 'list', 'a second double-tap stops it');

  console.log('# a remote-paused runner lets go when the page is left or a lesson is opened');
  const ph = await page.evaluate(async () => {
    const playing = () => /Pause/.test(__q('#pn-play').textContent);
    const o = {};
    App.store.set('kl.reps', 1);
    __q('#kl-back') && __q('#kl-back').click();
    __q('#pn-play').click(); await __wait(60);
    o.stop = __ra('stop'); o.held = App.keys.runnerBusy();
    App.switchTo('quiz'); await __wait(120);
    App.switchTo('piano'); App.keysLessons.open('d-r', 'piano'); await __wait(120); // what Practice plan does
    o.released = !App.keys.runnerBusy();
    o.next = __ra('next'); o.lesson = __kl().run && __kl().run.l.id; o.runner = playing();
    __ra('stop');
    // opened while still on the Keys page: the same
    __q('#pn-play').click(); await __wait(60); __ra('stop');
    App.keysLessons.open('c-r', 'piano');
    o.next2 = __ra('next'); o.lesson2 = __kl().run && __kl().run.l.id; o.runner2 = playing();
    __ra('stop');
    // Learn's 'Open Keys lessons'
    __q('#pn-play').click(); await __wait(60); __ra('stop');
    App.emit('learn:lesson', { instrument: 'piano', kind: 'keys' });
    o.next3 = __ra('next'); o.lesson3 = !!__kl().run; o.runner3 = playing();
    __ra('stop');
    // leaving the page alone is enough
    __q('#pn-play').click(); await __wait(60); __ra('stop');
    App.switchTo('quiz'); await __wait(80); App.switchTo('piano'); await __wait(120);
    o.next4 = __ra('next'); o.lesson4 = !!__kl().run; o.runner4 = playing();
    __ra('stop');
    __q('#pn-reset').click();
    return o;
  });
  ok(ph.stop === 'Paused' && ph.held && ph.released && ph.next === 'Start' && ph.lesson === 'd-r' && !ph.runner,
    'paused by the remote, page left, Practice plan opens a lesson: NEXT starts that lesson, not the old runner: ' + J(ph));
  ok(ph.next2 === 'Start' && ph.lesson2 === 'c-r' && !ph.runner2, 'a lesson opened on the Keys page takes NEXT from a remote-paused runner');
  ok(ph.next3 === 'Start' && ph.lesson3 && !ph.runner3, 'Learn\u2019s Open Keys lessons takes NEXT from a remote-paused runner');
  ok(ph.next4 === 'Start' && ph.lesson4 && !ph.runner4, 'leaving the page ends the remote pause (NEXT is the lesson card\u2019s again)');

  console.log('# BACK never throws a finished run away');
  const bk = await page.evaluate(async () => {
    const o = {};
    App.store.set('kl.sel', 'g-r'); __setProg('g-r', { step: 9 }); App.store.set('kl.reps', 1);
    o.start = __ra('next');
    const R = __kl().run;
    await __playAll(R);
    o.all = R.targets.every(t => t.j); o.n = R.targets.length;
    o.back = __ra('back'); // straight after the last note: the auto-score is still ~0.4 s away
    const L = __kl().last, p = __prog('g-r');
    o.scored = !!L && L.r === R && L.st.hits === R.targets.length; o.runs = (p.runs || []).length; o.step = p.step;
    o.again = !!__kl().run && __kl().run !== R && !__kl().run.demo && __kl().run.step === 9 && __kl().view === 'run';
    __ra('stop');
    // infinite: BACK in the count-in restarts unscored; after it the streak is saved first
    App.store.set('kl.sel', 'g-l'); __setProg('g-l', { step: 7 }); App.store.set('kl.reps', 0);
    __ra('next');
    const I0 = __kl().run;
    o.cin = __ra('back'); o.cinNew = !!__kl().run && __kl().run !== I0 && !!__kl().run.inf; o.cinRuns = (__prog('g-l').runs || []).length;
    const I1 = __kl().run;
    await __pastCountIn();
    await __playAll(I1, 6);
    o.streak = I1.inf.best;
    o.ib = __ra('back');
    const q = __prog('g-l');
    o.iRuns = (q.runs || []).length; o.iBest = (q.inf || {})['7']; o.iLast = !!(__kl().last && __kl().last.inf && __kl().last.r === I1);
    o.iNew = !!__kl().run && __kl().run !== I1 && !!__kl().run.inf && __kl().run.step === 7;
    o.iStop = __ra('stop'); // the new run is still counting in: unscored
    o.iRuns2 = (__prog('g-l').runs || []).length;
    App.store.set('kl.reps', 1);
    App.store.set('kl.sel', 'c-r');
    return o;
  });
  ok(bk.start === 'Start' && bk.all && bk.back === 'Retry' && bk.scored && bk.runs === 1 && bk.again,
    'a finished finite run: BACK scores it, then retries the same level: ' + J(bk));
  ok(bk.step === 9, 'the finished run kept its level (top level, no level-up)');
  ok(bk.cin === 'Restart' && bk.cinNew && bk.cinRuns === 0, 'infinite count-in: BACK restarts, nothing saved');
  ok(bk.streak >= 5 && bk.ib === 'Restart' && bk.iRuns === 1 && bk.iBest === bk.streak && bk.iLast && bk.iNew,
    'infinite past the count-in: BACK saves the streak and the run, then goes again: ' + J({ streak: bk.streak, best: bk.iBest, runs: bk.iRuns }));
  ok(bk.iStop === 'Stopped' && bk.iRuns2 === 1, 'the restarted infinite run in its count-in: STOP saves nothing more');

  console.log('# Easier after a BACK retry is relative to the level just played');
  const ez = await page.evaluate(async () => {
    const o = {};
    o.up = __fakeDone('bb-r', 4); // level-up: saved level 5 (index)
    await __wait(650);
    o.retry = __ra('back'); o.rStep = __kl().run && __kl().run.step;
    __kl().run.targets.forEach(t => { t.j = 'miss'; }); __kl().finish();
    const p = __prog('bb-r');
    o.saved = p.step; o.fails = p.fails; o.lastStep = __kl().last.r.step;
    o.easier = !!__q('[data-klstep="-1"]'); o.two = /Two misses/.test((__q('.kl-notes') || {}).textContent || '');
    __q('[data-klstep="-1"]').click();
    o.after = __prog('bb-r').step; o.view = __kl().view; o.sel = App.store.get('kl.sel');
    // two fails AT the saved level still count, and say so
    __fakeDone('bb-r', 3, 'miss');
    await __wait(650);
    o.again = __ra('next');
    __kl().run.targets.forEach(t => { t.j = 'miss'; }); __kl().finish();
    o.fails2 = __prog('bb-r').fails; o.two2 = /Two misses/.test((__q('.kl-notes') || {}).textContent || '');
    __q('[data-klstep="-1"]').click();
    o.after2 = __prog('bb-r').step;
    App.store.set('kl.sel', 'c-r');
    return o;
  });
  ok(ez.up.up && ez.retry === 'Retry' && ez.rStep === 4 && ez.saved === 5 && ez.fails === 0 && ez.lastStep === 4 && !ez.two,
    'a failed BACK retry of a lower level does not count against the saved level: ' + J(ez));
  ok(ez.easier && ez.after === 3 && ez.view === 'list' && ez.sel === 'bb-r', 'Easier on that result = one below the level just played (3), not the level just failed');
  ok(ez.again === 'Again' && ez.fails2 === 2 && ez.two2 && ez.after2 === 2, 'fails at the saved level still count (two misses -> the hint; Easier = one below)');

  console.log('# Listen first: BACK / NEXT / Stop leave nothing of the old demo on the audio clock');
  const dh = await page.evaluate(async () => {
    App.keys.warm();
    const dlr = performance.now() + 8000;
    while (!App.keys.ready() && performance.now() < dlr) { await __wait(50); App.keys.warm(); }
    const o = { sampled: App.keys.ready() };
    App.store.set('kl.sel', 'f-r'); __setProg('f-r', { step: 9 }); App.store.set('kl.reps', 1);
    __q('#kl-back') && __q('#kl-back').click();
    // wait for a demo note queued ahead on the audio clock
    const queued = async R => {
      const dl = performance.now() + 9000;
      while (performance.now() < dl) {
        const now = R.ctx.currentTime;
        if (now > R.first && R.voices.some(v => v.at > now + 0.02)) return R.voices.filter(v => v.at > now);
        await __wait(4);
      }
      return [];
    };
    const ahead = (R, t) => __srcs.filter(s => s.run === R && s.when > t + 0.2 && !(s.stopAt <= s.when)).length;
    const hushed = q => q.length > 0 && q.every(v => v.src.__rec && v.src.__rec.stopAt <= v.at);
    __q('#kl-listen').click();
    const D1 = __kl().run;
    o.n = D1.targets.length;
    const q1 = await queued(D1), t1 = D1.ctx.currentTime;
    o.queuedAt1 = __srcs.filter(s => s.run === D1 && s.when > t1).length; // the lookahead: a note or two, never the scale
    o.back = __ra('back');
    const D2 = __kl().run;
    o.again = !!D2 && D2 !== D1 && D2.demo;
    o.hushed1 = hushed(q1); o.left1 = ahead(D1, t1);
    const q2 = await queued(D2), t2 = D2.ctx.currentTime;
    o.next = __ra('next');
    const G = __kl().run;
    o.real = !!G && !G.demo;
    o.hushed2 = hushed(q2); o.left2 = ahead(D2, t2);
    o.inRun = __srcs.filter(s => s.run === D2 && s.when >= G.first && !(s.stopAt <= s.when)).length;
    __ra('stop');
    __q('#kl-listen').click();
    const D3 = __kl().run;
    const q3 = await queued(D3), t3 = D3.ctx.currentTime;
    __q('#kl-stop').click(); // the on-screen Stop: the same
    o.hushed3 = hushed(q3); o.left3 = ahead(D3, t3); o.view = __kl().view;
    App.store.set('kl.sel', 'c-r');
    return o;
  });
  ok(dh.sampled, 'the sampled piano bank decoded (the demo voices can be hushed)');
  ok(dh.n > 4 && dh.queuedAt1 <= 3, 'the demo is scheduled on a lookahead, not the whole scale at once: ' + J(dh));
  ok(dh.back === 'Listen again' && dh.again && dh.hushed1 && dh.left1 === 0, 'BACK during Listen first: the old demo\u2019s queued notes are cancelled, nothing of it left ahead');
  ok(dh.next === 'Start' && dh.real && dh.hushed2 && dh.left2 === 0 && dh.inRun === 0, 'NEXT during Listen first: no demo note lands in the graded run');
  ok(dh.hushed3 && dh.left3 === 0 && dh.view === 'list', 'the on-screen Stop during Listen first hushes the demo too');

  ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
