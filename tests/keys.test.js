// Keys page: Help levels (coloration scheme on/off), colored key presses,
// and the scale lessons — metronome count-in, note + timing judging, scoring,
// level-up, progress capture, stop on leaving the page.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
  });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.keys && App.keysLessons && App.active === 'quiz');
  await page.evaluate(() => App.switchTo('piano'));

  console.log('# Help levels');
  const lv = await page.evaluate(() => {
    App.emit('fb:set', { source: 't', root: 0, scale: 'major', mode: 1 });
    const out = {};
    for (const n of [4, 3, 2, 1, 0]) {
      App.keys.setAssist(n);
      const keys = [...document.querySelectorAll('#pn-svg .pn-key')];
      out[n] = {
        colored: keys.filter(k => /fill:/.test(k.getAttribute('style') || '')).length,
        tonic: keys.filter(k => /stroke:var\(--accent\)/.test(k.getAttribute('style') || '')).length,
        labels: document.querySelectorAll('#pn-svg .pn-dott').length,
        fingers: document.querySelectorAll('#pn-svg .pn-fing, #pn-svg .pn-fingb').length,
        legend: !document.getElementById('pn-legend').hidden,
        active: document.querySelector('#pn-assist .active').textContent
      };
    }
    // a pressed key shows its degree color even on a plain keyboard
    const e = document.querySelector('#pn-svg .pn-key[data-midi="64"]');
    App.emit('midi:note', { on: true, midi: 64, vel: 90, silent: true });
    out.press = e.style.fill;
    out.dc = e.getAttribute('data-dc');
    App.emit('midi:note', { on: false, midi: 64, silent: true });
    out.release = e.style.fill;
    return out;
  });
  ok(lv[4].colored > 0 && lv[4].labels > 0 && lv[4].fingers > 0 && lv[4].legend && lv[4].active === 'Full', 'Full: colors, names, fingers, legend ' + JSON.stringify(lv[4]));
  ok(lv[3].colored === lv[4].colored && lv[3].labels === 0 && lv[3].fingers === 0 && lv[3].legend, 'Colors: same coloration, no names/fingers ' + JSON.stringify(lv[3]));
  ok(lv[2].colored === 0 && lv[2].tonic > 0 && !lv[2].legend, 'Target: plain keys, tonic outlined ' + JSON.stringify(lv[2]));
  ok(lv[1].colored === 0 && lv[1].tonic > 0, 'Tonic: tonic outlined only');
  ok(lv[0].colored === 0 && lv[0].tonic === 0 && lv[0].labels === 0, 'None: a plain keyboard ' + JSON.stringify(lv[0]));
  ok(lv.dc && lv.press && lv.release === '', 'a pressed key flashes its degree color, then goes plain: ' + JSON.stringify([lv.dc, lv.press, lv.release]));
  const ring = await page.evaluate(() => {
    const r = n => { App.keys.setAssist(n); App.keys.ring(60, 62); const a = document.getElementById('pn-now'), b = document.getElementById('pn-nxt'); return [a && a.getAttribute('opacity'), b && b.style.display]; };
    const o = { 4: r(4), 2: r(2), 1: r(1) };
    App.keys.clearRing();
    return o;
  });
  ok(ring[4][0] === '1' && ring[4][1] === '' && ring[2][0] === '1' && ring[2][1] === 'none' && ring[1][0] === '0', 'rings: now+next at Full, now only at Target, none below: ' + JSON.stringify(ring));

  console.log('# lesson runs');
  // play every target at its beat (+offset ms), optionally wrong / skipped notes
  const PLAY = async (opts) => {
    const R = App.keysLessons.run, out = { n: R.targets.length };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    App.emit('midi:note', { on: true, midi: 72, vel: 80 });                 // count-in noodling: ignored
    for (const tg of R.targets) {
      const off = (opts.offset || 0) + ((opts.late || {})[tg.i] || 0);
      const due = (tg.at + R.lat + off / 1000 - R.ctx.currentTime) * 1000;
      if (due > 0) await wait(due);
      if ((opts.skip || []).includes(tg.i)) continue;
      const m = (opts.wrong || []).includes(tg.i) ? tg.midi + 1 : tg.midi;
      App.emit('midi:note', { on: true, midi: m, vel: 90 });
      App.emit('midi:note', { on: false, midi: m });
    }
    for (let i = 0; i < 80 && App.keysLessons.run; i++) await wait(50);
    return out;
  };
  const clean = await page.evaluate(async (PLAY) => {
    const play = new Function('return ' + PLAY)();
    App.keys.setAssist(3);
    localStorage.setItem('guitarlab.kl.prog', JSON.stringify({ 'g-r': { step: 9 } })); // 16ths at 72: a short run
    App.store.set('kl.sel', 'g-r'); App.store.set('kl.reps', 1);
    App.keysLessons.start(false);
    const R = App.keysLessons.run;
    const o = { n: R.targets.length, firstMidi: R.targets[0].midi, key: [App.store.get('fb.root'), App.store.get('fb.scale')], hand: App.keys.hand(),
      fingers: R.targets.slice(0, 8).map(t => t.f).join(''), countIn: Math.round((R.first - R.t0) / R.beat), claim: true };
    await play({});
    const L = App.keysLessons.last;
    o.view = App.keysLessons.view;
    o.st = L.st; o.stars = L.stars; o.up = L.up;
    o.prog = JSON.parse(localStorage.getItem('guitarlab.kl.prog'))['g-r'];
    o.today = SLXP.today().l;
    o.tiles = [...document.querySelectorAll('.kl-tile')].map(t => t.textContent);
    o.strip = document.querySelectorAll('#kl-strip .kl-dot').length;
    return o;
  }, PLAY.toString());
  ok(clean.n === 15 && clean.key[0] === 7 && clean.key[1] === 'major' && clean.hand === 'right' && clean.countIn === 4, 'a lesson sets the key, hand, one bar of count-in, up-and-down + tonic: ' + JSON.stringify(clean).slice(0, 160));
  ok(clean.fingers === '12312345', 'lesson notes carry the fingering: ' + clean.fingers);
  ok(clean.view === 'done' && clean.st.hits === 15 && clean.st.wrong === 0 && clean.st.meanAbs < 35, 'on-the-beat run: every note, tight timing: ' + JSON.stringify(clean.st));
  ok(clean.st.score >= 85 && clean.stars >= 2, 'clean run scores high: ' + clean.st.score);
  ok(clean.prog.runs.length === 1 && clean.prog.passed === 9 && clean.prog.best[9] === clean.st.score, 'progress saved: run history, best, passed level');
  ok(clean.today >= 1, 'a lesson run counts as a finished level for the streak');
  ok(clean.tiles.length === 4 && clean.strip === 15, 'results: 4 tiles + a timing dot per note');

  const messy = await page.evaluate(async (PLAY) => {
    const play = new Function('return ' + PLAY)();
    localStorage.setItem('guitarlab.kl.prog', JSON.stringify({ 'c-r': { step: 9 } }));
    App.store.set('kl.sel', 'c-r');
    App.keysLessons.start(false);
    await play({ wrong: [3], skip: [7], late: { 5: 90, 9: 90, 11: 90 } });
    const L = App.keysLessons.last;
    return { st: L.st, up: L.up, pass: L.pass, step: JSON.parse(localStorage.getItem('guitarlab.kl.prog'))['c-r'].step,
      notes: [...document.querySelectorAll('.kl-notes li')].map(l => l.textContent) };
  }, PLAY.toString());
  ok(messy.st.wrong === 1 && messy.st.miss === 2 && messy.st.hits === 13, 'a wrong note and a skipped note are counted: ' + JSON.stringify(messy.st));
  ok(messy.st.meanAbs > clean.st.meanAbs && messy.st.score < clean.st.score && !messy.up && messy.step === 9, 'late notes and mistakes lower the score; no level-up: ' + messy.st.score);
  ok(messy.notes.some(n => /wrong note/.test(n)), 'results explain the mistakes: ' + messy.notes.join(' | '));

  const up = await page.evaluate(async (PLAY) => {
    const play = new Function('return ' + PLAY)();
    localStorage.setItem('guitarlab.kl.prog', JSON.stringify({ 'f-l': { step: 8 } }));   // 16ths at 60
    App.store.set('kl.sel', 'f-l');
    App.keysLessons.start(false);
    const fingers = App.keysLessons.run.targets.slice(0, 8).map(t => t.f).join('');
    await play({});
    return { up: App.keysLessons.last.up, step: JSON.parse(localStorage.getItem('guitarlab.kl.prog'))['f-l'].step, fingers,
      btn: document.getElementById('kl-start').textContent };
  }, PLAY.toString());
  ok(up.up && up.step === 9 && /Next level/.test(up.btn), 'a score of 85+ levels the lesson up: ' + JSON.stringify(up));
  ok(up.fingers === '54321321', 'left-hand lesson fingering (F major LH): ' + up.fingers);

  console.log('# infinite');
  // play target i on its beat, for targets generated on the fly; `wrongAt` plays a C# (never in G major) instead
  const INF = async (opts) => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const R = App.keysLessons.run, o = {};
    for (let i = 0; i < opts.n; i++) {
      let tg;
      while (!(tg = R.targets.find(t => t.i === i))) await wait(20);
      const due = (tg.at + R.lat - R.ctx.currentTime) * 1000;
      if (due > 0) await wait(due);
      const m = i === opts.wrongAt ? 61 : tg.midi;
      App.emit('midi:note', { on: true, midi: m, vel: 90 });
      App.emit('midi:note', { on: false, midi: m });
      if (i === opts.wrongAt - 1) o.mid = { streak: R.inf.streak, hud: document.getElementById('kl-streakn').textContent };
    }
    await wait(300);
    o.live = { streak: R.inf.streak, best: R.inf.best, bpm: R.inf.bpm, label: document.getElementById('kl-streakl').textContent,
      count: (document.getElementById('kl-count') || {}).textContent };
    document.getElementById('kl-stop').click();
    const L = App.keysLessons.last;
    o.view = App.keysLessons.view; o.run = !!App.keysLessons.run;
    o.inf = L.inf;
    o.prog = JSON.parse(localStorage.getItem('guitarlab.kl.prog'))['g-r'];
    o.big = (document.querySelector('.kl-big') || {}).textContent;
    o.verdict = (document.querySelector('.kl-verdict') || {}).textContent;
    o.tiles = [...document.querySelectorAll('.kl-tile')].map(t => t.textContent);
    return o;
  };
  const inf1 = await page.evaluate(async (INF) => {
    const play = new Function('return ' + INF)();
    const all = JSON.parse(localStorage.getItem('guitarlab.kl.prog') || '{}');
    all['g-r'] = { step: 9 };
    localStorage.setItem('guitarlab.kl.prog', JSON.stringify(all));
    App.store.set('kl.sel', 'g-r'); App.store.set('kl.speedup', true);
    document.getElementById('kl-back').click();
    document.querySelector('[data-klreps="0"]').click();
    const ui = { reps: App.store.get('kl.reps'), seg: document.querySelector('[data-klreps="0"]').textContent,
      speed: !!document.getElementById('kl-speedup'), note: !!document.querySelector('.kl-infnote') };
    document.getElementById('kl-start').click();
    const R = App.keysLessons.run;
    ui.inf = !!R.inf; ui.n0 = R.targets.length; ui.loop = R.one.length;
    ui.streakUI = !!document.getElementById('kl-streakn'); ui.stop = document.getElementById('kl-stop').textContent;
    return Object.assign(await play({ n: 41, wrongAt: 30 }), { ui });
  }, INF.toString());
  ok(inf1.ui.reps === 0 && inf1.ui.seg === '∞' && inf1.ui.speed && inf1.ui.note, 'the ∞ option, its Speed up chip and note: ' + JSON.stringify(inf1.ui));
  ok(inf1.ui.inf && inf1.ui.n0 < 30 && inf1.ui.loop === 14 && inf1.ui.streakUI && inf1.ui.stop === 'End run', 'an infinite run makes notes as it goes, shows a streak and End run: ' + JSON.stringify(inf1.ui));
  ok(inf1.mid.streak === 30 && inf1.mid.hud === '30', 'clean notes build the streak: ' + JSON.stringify(inf1.mid));
  ok(inf1.live.streak === 10 && inf1.live.best === 30 && /best 30/.test(inf1.live.label) && /80 bpm · 1 wrong/.test(inf1.live.count), 'a wrong note starts it over; the best stays: ' + JSON.stringify(inf1.live));
  ok(inf1.live.bpm === 80, 'two clean loops sped it up 72 -> 80 bpm, the messy third did not: ' + inf1.live.bpm);
  ok(inf1.view === 'done' && !inf1.run && inf1.inf.best === 30 && inf1.inf.isBest && inf1.inf.wrong === 1, 'End run scores it: ' + JSON.stringify(inf1.inf));
  ok(inf1.prog.inf['9'] === 30 && inf1.prog.runs.length === 1 && inf1.prog.runs[0].inf === 30 && inf1.prog.step === 9, 'the record is saved per level; no level change: ' + JSON.stringify(inf1.prog));
  ok(/30/.test(inf1.big) && /First record/.test(inf1.verdict) && inf1.tiles.length === 4, 'results: the streak, a record verdict, 4 tiles: ' + JSON.stringify([inf1.big, inf1.verdict, inf1.tiles]));
  const inf2 = await page.evaluate(async (INF) => {
    const play = new Function('return ' + INF)();
    document.getElementById('kl-start').click();
    return play({ n: 8 });
  }, INF.toString());
  ok(inf2.inf.best === 8 && !inf2.inf.isBest && inf2.prog.inf['9'] === 30 && /record at this level: 30/.test(inf2.verdict), 'a shorter streak keeps the record: ' + JSON.stringify([inf2.inf.best, inf2.verdict]));
  await page.evaluate(() => App.store.set('kl.reps', 1));

  console.log('# stopping');
  const stop = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('kl-back').click();
    App.keysLessons.start(false);
    const wakeOn = App.wake.held().includes('kl-run');
    App.emit('transport:claim', { owner: 'met' });
    const a = { stopped: !App.keysLessons.run, view: App.keysLessons.view, wake: App.wake.held().includes('kl-run') };
    App.keysLessons.start(false);
    App.switchTo('fretboard');
    await wait(50);
    a.leave = !App.keysLessons.run;
    a.runs = JSON.parse(localStorage.getItem('guitarlab.kl.prog'))['f-l'].runs.length;
    a.wakeOn = wakeOn;
    App.switchTo('piano');
    return a;
  });
  ok(stop.wakeOn && stop.stopped && stop.view === 'list' && !stop.wake, 'another transport starting stops the lesson (unscored)');
  ok(stop.leave && stop.runs === 1, 'leaving the Keys page stops it; nothing is recorded');

  const ui = await page.evaluate(() => {
    document.querySelector('[data-kltier="stretch"]').click();
    const rows = document.querySelectorAll('.kl-row').length;
    document.querySelector('[data-kl="b-r"]').click();
    const title = document.querySelector('.kl-title b').textContent;
    document.querySelector('[data-klstep="1"]').click();
    const lvl = document.querySelector('.kl-level b').textContent;
    return { rows, title, lvl, help: document.getElementById('kl-help').textContent };
  });
  ok(ui.rows >= 7 && /B major/.test(ui.title) && ui.lvl === 'Level 2' && /Help: Colors/.test(ui.help), 'lesson list, picking, level +/−, help shown: ' + JSON.stringify(ui));
  const pg = await page.evaluate(() => {
    App.switchTo('quiz');
    SLQuiz.tab('progress');
    const rows = [...document.querySelectorAll('[data-qzkeys]')].map(b => b.getAttribute('data-qzkeys'));
    document.querySelector('[data-qzkeys="f-l"]').click();
    return { rows, page: App.active, sel: document.querySelector('.kl-title b').textContent };
  });
  ok(pg.rows.sort().join() === 'f-l,g-r' && pg.page === 'piano' && /F major · Left hand/.test(pg.sel), 'Exercises Progress lists keys lessons and opens one on the Keys page: ' + JSON.stringify(pg));
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));

  await browser.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
