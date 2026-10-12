// v0.72 batch: the practice ledger (playing on any page counts), Android/
// browser Back, Drill these, wrong-answer contrast, lesson cards, "apply it"
// links, and the left-handed fretboard tap targets.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

async function newPage(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript((seed) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
  }, seed || {});
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.SLQuiz && window.SLXP && App.active === 'quiz');
  return { ctx, page, errs };
}
const PLAY = async (right) => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 10 && SLQuiz.view === 'run'; i++) {
    await wait(15);
    const q = SLQuiz.q;
    SLQuiz.pick(i < right ? q.correct : q.choices.find(c => c.id !== q.correct).id);
    await wait(5);
    document.getElementById('qz-act').click();
  }
  return SLQuiz.view;
};

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  let { ctx, page, errs } = await newPage(browser);

  console.log('# practice ledger');
  const led = await page.evaluate(() => {
    const out = {};
    App.wake.acquire('fb-run');
    out.quizTick = (SLXP._tick(), SLXP.today().p || 0);               // Exercises page: not counted here
    App.switchTo('fretboard');
    const x0 = SLXP.total();
    for (let i = 0; i < 59; i++) SLXP._tick();
    out.before = { p: SLXP.today().p, streak: SLXP.streak().today };
    SLXP._tick();                                                      // 300 s
    out.after = { p: SLXP.today().p, streak: SLXP.streak(), xp: SLXP.total() - x0 };
    out.toast = (document.getElementById('xp-toast') || {}).textContent || '';
    out.areas = SLXP.areas(7);
    App.wake.release('fb-run');
    const p1 = SLXP.today().p;
    for (let i = 0; i < 5; i++) SLXP._tick();                          // nothing running, no notes: no time
    out.idle = SLXP.today().p - p1;
    App.emit('midi:note', { on: true, midi: 60, vel: 90 });            // free playing on the keys counts
    App.switchTo('piano');
    for (let i = 0; i < 3; i++) SLXP._tick();
    out.keys = (SLXP.today().a || {}).Keys || 0;
    return out;
  });
  ok(led.quizTick === 0, 'time on the Exercises page is not double-counted');
  ok(led.before.p === 295 && !led.before.streak && led.after.p === 300 && led.after.streak.today && led.after.streak.n === 1, '5 minutes of a running drill make today a streak day: ' + JSON.stringify(led.after.streak));
  ok(led.after.xp === 10, '2 XP per minute played: +' + led.after.xp);
  ok(/Today counts/.test(led.toast), 'a toast says today counts: ' + led.toast);
  ok(led.areas[0] && led.areas[0].area === 'Guitar' && led.areas[0].s === 300, 'time logged per area: ' + JSON.stringify(led.areas));
  ok(led.idle === 0 && led.keys === 15, 'idle time is not counted; notes coming in on Keys are: ' + led.idle + ' / ' + led.keys);
  const prog = await page.evaluate(() => { App.switchTo('quiz'); SLQuiz.tab('progress');
    return { tile: [...document.querySelectorAll('.qz-tile')].find(t => /Practice time/.test(t.textContent)).textContent, rows: document.querySelectorAll('.qz-arow').length, note: document.querySelector('.qz-strip').textContent }; });
  ok(/playing/.test(prog.tile) && prog.rows >= 2, 'Progress shows playing time and the per-area rows: ' + prog.tile.replace(/\s+/g, ' '));

  console.log('# Back');
  const back = async () => { await page.evaluate(() => history.back()); await page.waitForTimeout(200); };
  await page.evaluate(() => { SLQuiz.tab('path'); App.switchTo('chords'); App.switchTo('fretboard'); });
  await back();
  ok(await page.evaluate(() => App.active) === 'chords', 'Back returns to the previous page');
  await page.evaluate(() => App.switchTo('metronome'));
  await back();
  ok(await page.evaluate(() => App.active === 'chords' && !document.documentElement.classList.contains('sheet-open')), 'Back closes the metronome sheet, page stays');
  await page.evaluate(() => document.getElementById('settings-btn').click());
  await back();
  ok(await page.evaluate(() => App.active) === 'chords', 'Back closes Settings');
  await back();
  ok(await page.evaluate(() => App.active) === 'quiz', 'Back walks to Exercises');
  await page.evaluate(() => SLQuiz.start('notes/nat/treble/1'));
  await back();
  ok(await page.evaluate(() => SLQuiz.view === 'home' && !!document.querySelector('.qz-npop')), 'Back leaves a running level for the path (its step open)');
  await back();
  ok(await page.evaluate(() => !document.querySelector('.qz-npop')), 'Back closes the step card');
  await back();
  const root = await page.evaluate(() => ({ hint: (document.getElementById('back-hint') || {}).textContent, state: history.state && history.state.sl }));
  ok(/Back again/.test(root.hint || '') && root.state === 'base', 'at the start, Back warns that the next one leaves: ' + JSON.stringify(root));
  await page.mouse.click(600, 400);
  ok(await page.evaluate(() => history.state && history.state.sl) === 'top', 'a tap re-arms in-app Back');

  console.log('# Exercises: lesson, mistakes, drill, apply it');
  const lx = await page.evaluate(async (PLAY) => {
    const play = new Function('return ' + PLAY)(), out = {};
    document.querySelector('[data-qzn="0"]').click();
    out.lesson = !!document.querySelector('.qz-npop details.qz-nlearn[open] .qz-learn');
    out.apply = (document.querySelector('.qz-npop [data-qzapply]') || {}).textContent;
    SLQuiz.start('notes/nat/treble/1');
    const q = SLQuiz.q, wrong = q.choices.find(c => c.id !== q.correct);
    SLQuiz.pick(wrong.id);
    out.fb = document.getElementById('qz-fb').textContent;
    out.wrongLabel = wrong.label;
    document.getElementById('qz-act').click();
    await play(7);                                       // 7 more right: 7/10 + misses
    out.misses = SLQuiz.cur.drillPool.slice();
    out.bestBefore = JSON.parse(localStorage.getItem('guitarlab.qz.prog'))['notes/nat/treble/1'].b;
    out.drillBtn = !!document.getElementById('qz-drill');
    document.getElementById('qz-drill').click();
    out.drill = { tag: document.querySelector('.qz-lvltag').textContent, n: SLQuiz.cur.n, items: [] };
    for (let i = 0; i < 10 && SLQuiz.view === 'run'; i++) {
      out.drill.items.push(SLQuiz.q.item);
      await new Promise(r => setTimeout(r, 10)); SLQuiz.pick(SLQuiz.q.correct); document.getElementById('qz-act').click();
    }
    out.drillDone = { big: document.querySelector('.qz-big').textContent, verdict: document.querySelector('.qz-verdict').textContent };
    out.bestAfter = JSON.parse(localStorage.getItem('guitarlab.qz.prog'))['notes/nat/treble/1'].b;
    out.doneApply = !!document.querySelector('.qz-donelinks [data-qzapply="nat"]');
    SLQuiz.start('scales/smm/staff/1');
    await play(10);
    document.querySelector('[data-qzapply="smm"]').click();
    await new Promise(r => setTimeout(r, 100));
    out.fb2 = { page: App.active, scale: JSON.parse(localStorage.getItem('guitarlab.fb.scale')) };
    return out;
  }, PLAY.toString());
  ok(lx.lesson && /Fretboard/.test(lx.apply || ''), 'a new step opens with its lesson + an apply-it button: ' + lx.apply);
  ok(lx.fb.indexOf('You chose ' + lx.wrongLabel + '.') === 0, 'a wrong answer names what you picked: ' + lx.fb.slice(0, 60));
  ok(lx.drillBtn && lx.misses.length >= 1, 'results offer Drill these for the misses: ' + lx.misses.join(','));
  ok(/Drill/.test(lx.drill.tag) && lx.drill.n >= 5 && lx.drill.items.every(i => lx.misses.indexOf(i) >= 0), 'the drill asks only the missed items: ' + JSON.stringify(lx.drill));
  ok(new RegExp('^' + lx.drill.n + '/' + lx.drill.n).test(lx.drillDone.big) && /All fixed/.test(lx.drillDone.verdict), 'drill results: ' + JSON.stringify(lx.drillDone));
  ok(lx.bestAfter === lx.bestBefore, 'a drill never overwrites the level score');
  ok(lx.doneApply && lx.fb2.page === 'fretboard' && lx.fb2.scale === 'major', 'apply it: a scales lesson opens that scale on the Fretboard: ' + JSON.stringify(lx.fb2));
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# left-handed fretboard taps');
  ({ ctx, page, errs } = await newPage(browser, { 'fb.lefty': true }));
  const lf = await page.evaluate(() => {
    App.switchTo('fretboard');
    const r = f => { const e = document.querySelector('.fb-hit[data-fb-s="0"][data-fb-f="' + f + '"]'); return e ? e.getBoundingClientRect() : null; };
    const hit = r(1), dot = { x: +document.querySelector('.fb-hit[data-fb-f="1"]').getAttribute('data-fb-cx') };
    const svg = document.querySelector('.fb-hit').ownerSVGElement, pt = svg.createSVGPoint();
    const e1 = document.querySelector('.fb-hit[data-fb-s="0"][data-fb-f="1"]');
    return { x: +e1.getAttribute('x'), w: +e1.getAttribute('width'), cx: dot.x };
  });
  ok(lf.cx >= lf.x && lf.cx <= lf.x + lf.w, 'lefty: fret 1 tap target sits over fret 1: ' + JSON.stringify(lf));
  ok(errs.length === 0, 'no page errors (lefty)');
  await ctx.close();

  await browser.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
