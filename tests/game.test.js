// soundLAB lesson game layer: XP, levels, goal, streak + freezes, path locks,
// jump tests, 60-second sprints, Progress charts, Learn-tab dot, phone taps.
const { chromium } = require('playwright');
const env = require('./env');
const URL = env.URL;
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

async function newPage(browser, seed, phone) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript((seed) => {
    if (sessionStorage.getItem('__seeded')) return; // seed once, keep state across reloads
    sessionStorage.setItem('__seeded', '1');
    localStorage.setItem('guitarlab.help.seen', 'true');
    localStorage.setItem('guitarlab.help.done', 'true');
    localStorage.setItem('guitarlab.qz.landed', 'true');
    for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
  }, seed || {});
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const u = (m.location() && m.location().url) || '';
    if (/Failed to load resource/.test(m.text()) && !/127\.0\.0\.1/.test(u)) return;
    errs.push('console: ' + m.text() + ' @' + u);
  });
  await page.goto(URL);
  await page.waitForFunction(() => window.App && window.SLQuiz && window.SLXP && App.active === 'quiz');
  return { ctx, page, errs };
}

// answer the running level: the first `right` questions right, the rest wrong
const PLAY = async (right) => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 10 && SLQuiz.view === 'run'; i++) {
    await wait(15);
    const q = SLQuiz.q;
    if (i < right) SLQuiz.pick(q.correct);
    else SLQuiz.pick(q.choices.find(c => c.id !== q.correct).id);
    await wait(5);
    document.getElementById('qz-act').click();
  }
  return SLQuiz.view;
};

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });

  console.log('# xp rules (SLXP)');
  let { ctx, page, errs } = await newPage(browser);
  const rules = await page.evaluate(() => {
    const X = SLXP, o = {};
    o.lv = [0, 39, 40, 99, 100, 160].map(x => { const l = X.levelOf(x); return l.lv + ':' + l.into + '/' + l.need; });
    o.title = [X.levelOf(0).title, X.levelOf(100).title, X.levelOf(5000).title];
    o.fresh = X.total();
    o.a = [X.answer({ unit: 'nat', ok: true, ms: 1500, combo: 1, kind: 'choice' }).xp,  // 2 + quick
      X.answer({ unit: 'nat', ok: true, ms: 5000, combo: 2, kind: 'choice' }).xp,         // 2
      X.answer({ unit: 'nat', ok: true, ms: 5000, combo: 5, kind: 'choice' }).xp,         // 2 + run of 5
      X.answer({ unit: 'nat', ok: true, ms: 5000, combo: 5, kind: 'ear' }).xp,            // ear par 6.5 s: 2 + 1 + 1
      X.answer({ unit: 'nat', ok: false, ms: 900, combo: 0, kind: 'choice' }).xp];        // 0
    o.total = X.total();
    o.today = JSON.parse(JSON.stringify(X.today()));
    o.speed = Math.round(X.speed('nat').avg);
    o.dotBefore = document.documentElement.classList.contains('goal-due');
    o.badGoal = (X.setGoal(33), X.goal());
    X.setGoal(20);
    o.goal = X.goal();
    o.dotAfter = document.documentElement.classList.contains('goal-due');
    o.fin = X.finishLevel({ passed: true, perfect: true });
    o.dotMet = document.documentElement.classList.contains('goal-due');
    o.fin2 = X.finishLevel({ passed: true });
    return o;
  });
  ok(rules.lv.join(' ') === '1:0/40 1:39/40 2:0/60 2:59/60 3:0/80 3:60/80', 'level curve 40, then +20 per level: ' + rules.lv.join(' '));
  ok(rules.title.join(',') === 'Beginner,Learner,Maestro', 'level titles: ' + rules.title);
  ok(rules.fresh === 0, 'a brand-new player starts at 0 XP');
  ok(rules.a.join(',') === '3,2,3,4,0', 'XP per answer (quick +1, run of 5 +1, wrong 0): ' + rules.a);
  ok(rules.total === 12 && rules.today.x === 12 && rules.today.q === 5 && rules.today.k === 4, 'answers add to total + today: ' + JSON.stringify(rules.today).slice(0, 80));
  ok(rules.speed === 4125, 'unit speed averages right answers only: ' + rules.speed);
  ok(rules.fin.bonus === 10 && rules.fin.streak === 1 && rules.fin.extended, 'finishing a level: +5 pass +5 perfect, day 1 of a streak: ' + JSON.stringify(rules.fin));
  ok(rules.dotBefore === true && rules.dotAfter === true && rules.goal === 20 && rules.badGoal === 50, 'goal: invalid values ignored, dot shows until met: ' + JSON.stringify([rules.dotBefore, rules.badGoal, rules.goal, rules.dotAfter]));
  ok(rules.fin.goalHit && !rules.dotMet, 'crossing the goal reports it and clears the Learn-tab dot');
  ok(!rules.fin2.goalHit && !rules.fin2.extended && rules.fin2.bonus === 5, 'a later level the same day: no 2nd goal hit, streak already counted: ' + JSON.stringify(rules.fin2));

  console.log('# streak + freezes (pinned clock)');
  const st = await page.evaluate(() => {
    const X = SLXP, out = {};
    Object.keys(localStorage).filter(k => /^guitarlab\.xp\./.test(k)).forEach(k => localStorage.removeItem(k));
    X._reload();
    const at = d => X._now(() => new Date(2026, 0, d, 12));
    const earned = [];
    for (let d = 1; d <= 7; d++) { at(d); earned.push(X.finishLevel({ passed: true }).freezeEarned); }
    out.after7 = X.streak();
    out.earned = earned.map(Number).join('');
    at(7); X.finishLevel({ passed: true }); out.sameDay = X.streak().freezes;     // 2nd level same day: no 2nd freeze
    at(9); out.bridged = X.streak();                                              // day 8 missed -> freeze used
    out.frozen = JSON.parse(localStorage.getItem('guitarlab.xp.frozen'));
    X.finishLevel({ passed: true }); out.day9 = X.streak().n;
    at(12); out.broken = X.streak();                                              // 2 missed, 0 freezes
    // a 2-day gap is NOT bridged by a single freeze (the freeze stays banked)
    localStorage.setItem('guitarlab.xp.freeze', '1');
    at(13); X.finishLevel({ passed: true });
    at(16); out.gap2 = X.streak();
    out.hist = X.history(5).map(h => h.key.slice(8) + (h.l ? 'L' : '') + (h.frozen ? 'F' : '')).join(' ');
    out.best = out.gap2.best;
    X._now(null);
    return out;
  });
  ok(st.after7.n === 7 && st.earned === '0000001' && st.after7.freezes === 1, '7 days in a row earns a freeze on day 7: ' + JSON.stringify(st.after7) + ' ' + st.earned);
  ok(st.sameDay === 1, 'a second level on the same day earns no extra freeze');
  ok(st.bridged.n === 7 && !st.bridged.today && st.bridged.freezes === 0 && st.frozen.join() === '2026-01-08', 'a missed day spends the freeze, streak lives: ' + JSON.stringify(st.bridged) + ' ' + st.frozen);
  ok(st.day9 === 8, 'finishing a level the next day extends it to 8');
  ok(st.broken.n === 0 && st.broken.best === 8, 'two missed days with no freeze break it (best kept): ' + JSON.stringify(st.broken));
  ok(st.gap2.n === 0 && st.gap2.freezes === 1, 'one freeze cannot bridge a 2-day gap and stays banked: ' + JSON.stringify(st.gap2));
  ok(st.hist === '12 13L 14 15 16', 'history walks the pinned days: ' + st.hist);
  ok(errs.length === 0, 'no page errors (rules)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# first run seeds XP from course progress');
  ({ ctx, page, errs } = await newPage(browser, { 'qz.prog': { 'notes/nat/treble/1': { b: 10, s: 3 }, 'notes/nat/treble/2': { b: 8, s: 1 }, 'notes/nat/bass/1': { b: 5, s: 0 } } }));
  ok(await page.evaluate(() => SLXP.total()) === 25, 'seed: 10 per passed level, +5 for 3 stars, failed levels 0');
  await ctx.close();

  console.log('# the path: locks, current step, unlocking');
  ({ ctx, page, errs } = await newPage(browser));
  const p0 = await page.evaluate(() => ({ view: SLQuiz.view, path: !!document.querySelector('.qz-path'), n: SLQuiz.nodes().length,
    n0: SLQuiz.node(0), n1: SLQuiz.node(1), cur: SLQuiz.current(), start: !!document.querySelector('#qz-node-0 .qz-nstart'),
    locked: document.querySelectorAll('.qz-node.locked').length, cont: document.getElementById('qz-cont').getAttribute('data-qzl'), contTxt: document.getElementById('qz-cont').textContent.trim() }));
  ok(p0.view === 'home' && p0.path && p0.n > 30, 'home opens on the path: ' + p0.n + ' steps');
  ok(p0.n0.open && !p0.n1.open && p0.cur === 0 && p0.start && p0.locked === p0.n - 1, 'fresh: only step 1 open + marked Start: ' + JSON.stringify([p0.n0, p0.n1, p0.locked]));
  ok(p0.cont === 'notes/nat/treble/1' && p0.contTxt === 'Start', 'Start button opens level 1: ' + p0.cont);
  const pop = await page.evaluate(() => {
    document.querySelector('[data-qzn="1"]').click();
    const pp = document.querySelector('.qz-npop');
    return { lock: !!pp.querySelector('.qz-lockmsg'), jump: !!pp.querySelector('[data-qzjump="1"]'), rows: pp.querySelectorAll('.qz-lvl').length };
  });
  ok(pop.lock && pop.jump && pop.rows === 0, 'a locked step offers only Jump here: ' + JSON.stringify(pop));
  const run1 = await page.evaluate(async (PLAY) => {
    document.getElementById('qz-cont').click();
    const lid = SLQuiz.cur.lvl.id;
    const v = await (new Function('return ' + PLAY)())(8);
    return { lid, v, back: document.getElementById('qz-back').textContent.trim(), xp: SLQuiz.cur.xp, n1: SLQuiz.node(1), cur: SLQuiz.current() };
  }, PLAY.toString());
  ok(run1.v === 'done' && run1.lid === 'notes/nat/treble/1', 'Continue runs level 1 to the results');
  ok(run1.n1.open && run1.cur === 1, 'passing it opens the next step and makes it current: ' + JSON.stringify(run1.n1));
  ok(run1.xp >= 21 && /path/i.test(run1.back), 'results: XP earned (8 right + pass bonus) + back to the path: ' + run1.xp + ' ' + run1.back);
  const dn = await page.evaluate(() => ({ tiles: [...document.querySelectorAll('.qz-dstats .qz-tile')].map(t => t.textContent.replace(/\s+/g, ' ').trim()), notes: [...document.querySelectorAll('.qz-dnotes li')].map(l => l.textContent) }));
  ok(dn.tiles.length === 3 && /XP earned/.test(dn.tiles[0]) && /Time/.test(dn.tiles[1]), 'results tiles: ' + dn.tiles.join(' | '));
  ok(dn.notes.some(n => /Day 1 of a new streak/.test(n)) && !dn.notes.some(n => /faster|slower/.test(n)), 'streak note, no speed note from instant test taps: ' + dn.notes.join(' | '));
  const back = await page.evaluate(() => { document.getElementById('qz-back').click(); return { view: SLQuiz.view, path: !!document.querySelector('.qz-path'), streak: document.querySelector('.qz-strip .qz-stat b').textContent }; });
  ok(back.view === 'home' && back.path && back.streak === '1', 'back on the path, strip shows a 1-day streak: ' + JSON.stringify(back));

  console.log('# jump tests');
  const jump = await page.evaluate(async (PLAY) => {
    const play = new Function('return ' + PLAY)();
    const out = {};
    // a locked step whose first level is multiple choice
    let j = -1;
    for (let i = 3; i < SLQuiz.nodes().length; i++) { const n = SLQuiz.node(i); if (!n.open && SLQuiz.gen(n.first).kind === 'choice') { j = i; break; } }
    out.j = j;
    SLQuiz.tab('path');
    document.querySelector('[data-qzn="' + j + '"]').click();
    document.querySelector('[data-qzjump="' + j + '"]').click();
    out.tag = document.querySelector('.qz-lvltag') && document.querySelector('.qz-lvltag').textContent;
    await play(8);
    out.fail = { verdict: document.querySelector('.qz-verdict').textContent, open: SLQuiz.node(j).open, again: !!document.querySelector('[data-qzjump]') };
    document.querySelector('[data-qzjump]').click();
    await play(9);
    out.pass = { verdict: document.querySelector('.qz-verdict').textContent, open: SLQuiz.node(j).open, before: SLQuiz.node(j - 1).open, after: SLQuiz.node(j + 1).open, after2: SLQuiz.node(j + 2).open, jump: SLXP.jump(), cur: SLQuiz.current() };
    document.getElementById('qz-tohome').click();
    out.home = SLQuiz.view;
    return out;
  }, PLAY.toString());
  ok(jump.j > 0 && /jump/i.test(jump.tag || ''), 'jump test starts from a locked step: ' + jump.j + ' ' + jump.tag);
  ok(!jump.fail.open && jump.fail.again && /9 right/.test(jump.fail.verdict), '8/10 does not open the path (or the step): ' + jump.fail.verdict);
  ok(jump.pass.open && jump.pass.before && jump.pass.after && !jump.pass.after2 && jump.pass.jump === jump.j && jump.pass.cur === jump.j + 1, '9/10 opens every step up to it, its level counts, the next step is current: ' + JSON.stringify(jump.pass));
  ok(jump.home === 'home', 'back to the path after a jump');

  console.log('# 60-second sprint');
  const sp = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const out = {};
    SLQuiz.tab('path');
    document.querySelector('[data-qzn="0"]').click();
    document.querySelector('[data-qzsprint="0"]').click();
    out.run = { view: SLQuiz.view, bar: !!document.getElementById('qz-timefill'), act: document.getElementById('qz-act').textContent.trim(), count: document.getElementById('qz-count').textContent };
    const xp0 = SLXP.total();
    for (let i = 0; i < 5; i++) { await wait(20); const q1 = SLQuiz.q; SLQuiz.pick(q1.correct); await wait(450); out['adv' + i] = SLQuiz.q !== q1; }
    out.pill = document.getElementById('qz-xpp').textContent;
    out.combo = /5 in a row/.test(out.pill);
    // run the clock out
    SLQuiz.cur.sprint.end = Date.now() - 1;
    await wait(250);
    out.done = { view: SLQuiz.view, big: document.querySelector('.qz-big').textContent, verdict: document.querySelector('.qz-verdict').textContent,
      tiles: [...document.querySelectorAll('.qz-dstats .qz-tile')].map(t => t.textContent.replace(/\s+/g, ' ').trim()) };
    out.rec = SLXP.sprintBest(SLQuiz.nodes()[0]);
    out.gained = SLXP.total() - xp0;
    out.prog = JSON.parse(localStorage.getItem('guitarlab.qz.prog'))['notes/nat/treble/1'].b;
    // a slower second sprint is not a record
    document.querySelector('[data-qzsprint="0"]').click();
    await wait(20); SLQuiz.pick(SLQuiz.q.correct); await wait(400);
    SLQuiz.finishSprint();
    out.second = { verdict: document.querySelector('.qz-verdict').textContent, rec: SLXP.sprintBest(SLQuiz.nodes()[0]) };
    // leaving the page mid-sprint ends it
    document.querySelector('[data-qzsprint="0"]').click();
    App.switchTo('chords'); await wait(50);
    out.left = { view: SLQuiz.view, timer: SLQuiz.cur.sprint.timer, done: SLQuiz.cur.sprint.done };
    App.switchTo('quiz');
    return out;
  });
  ok(sp.run.view === 'run' && sp.run.bar && sp.run.act === 'Skip' && /60 s/.test(sp.run.count), 'sprint: time bar, 60 s, Skip footer: ' + JSON.stringify(sp.run));
  ok(sp.adv0 && sp.adv1 && sp.adv4, 'right answers auto-advance in a sprint');
  ok(sp.combo, 'run counter shows the streak of right answers: ' + sp.pill);
  ok(sp.done.view === 'done' && /^5/.test(sp.done.big) && /First record/.test(sp.done.verdict), 'time up -> results, first record: ' + JSON.stringify(sp.done));
  ok(sp.done.tiles.some(t => /Record\s*5/.test(t)), 'sprint results show the record: ' + sp.done.tiles.join(' | '));
  ok(sp.rec === 5 && sp.gained >= 15, 'record stored + XP (answers + record bonus): ' + sp.rec + ' / +' + sp.gained);
  ok(sp.prog === 8, 'sprints never overwrite level scores');
  ok(sp.second.rec === 5 && /Your record: 5/.test(sp.second.verdict), 'a lower score keeps the record: ' + sp.second.verdict);
  ok(sp.left.done && !sp.left.timer, 'leaving the page ends a running sprint: ' + JSON.stringify(sp.left));

  console.log('# endless streak');
  const en = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const txt = s => (document.querySelector(s) || {}).textContent;
    const out = {};
    document.getElementById('qz-tohome').click();
    SLQuiz.clock(0); // untimed here; the answer clock has its own checks below
    SLQuiz.tab('path');
    if (!document.querySelector('.qz-npop [data-qzendless="0"]')) document.querySelector('[data-qzn="0"]').click();
    out.picker = [...document.querySelectorAll('.qz-npop [data-qzclock]')].map(b => b.textContent + (b.classList.contains('active') ? '*' : '')).join();
    const pop = document.querySelector('.qz-npop');
    document.querySelector('.qz-npop [data-qzclock="8"]').click();
    out.inplace = document.querySelector('.qz-npop') === pop && SLQuiz.clock() === 8 && document.querySelector('.qz-npop .qz-clockseg .active').textContent === '8 s';
    document.querySelector('.qz-npop [data-qzclock="0"]').click();
    const btn = document.querySelector('.qz-npop [data-qzendless="0"]');
    out.btn = btn && btn.textContent;
    btn.click();
    out.run = { view: SLQuiz.view, bar: !!document.getElementById('qz-timefill'), act: document.getElementById('qz-act').textContent.trim(),
      tag: txt('.qz-lvltag'), back: txt('#qz-back').trim(), endless: SLQuiz.cur.sprint.endless };
    for (let i = 0; i < 6; i++) { await wait(20); const q1 = SLQuiz.q; SLQuiz.pick(q1.correct); await wait(450); out['adv' + i] = SLQuiz.q !== q1; }
    out.count = txt('#qz-count');
    // the first miss ends it
    const q = SLQuiz.q;
    SLQuiz.pick(q.choices.find(c => c.id !== q.correct).id);
    await wait(100);
    out.miss = { view: SLQuiz.view, act: document.getElementById('qz-act').textContent.trim() };
    await wait(1900);
    out.done = { view: SLQuiz.view, big: txt('.qz-big'), verdict: txt('.qz-verdict'), ended: txt('.qz-miss'), again: !!document.querySelector('.qz-done [data-qzendless="0"]') };
    out.rec = SLXP.sprintBest('end:' + SLQuiz.nodes()[0]);
    out.sprintRec = SLXP.sprintBest(SLQuiz.nodes()[0]);
    out.prog = JSON.parse(localStorage.getItem('guitarlab.qz.prog'))['notes/nat/treble/1'].b;
    // End run keeps a shorter streak, not as the record
    document.querySelector('.qz-done [data-qzendless="0"]').click();
    for (let i = 0; i < 2; i++) { await wait(20); SLQuiz.pick(SLQuiz.q.correct); await wait(450); }
    out.count2 = txt('#qz-count');
    document.getElementById('qz-back').click();
    out.second = { view: SLQuiz.view, big: txt('.qz-big'), verdict: txt('.qz-verdict'), rec: SLXP.sprintBest('end:' + SLQuiz.nodes()[0]) };
    return out;
  });
  ok(/Endless streak/.test(en.btn) && en.run.view === 'run' && en.run.endless && !en.run.bar && en.run.act === 'Show answer' && /^Endless streak/.test(en.run.tag) && en.run.back === 'End run',
    'endless: from the step card, no clock, Show answer, End run: ' + JSON.stringify([en.btn, en.run]));
  ok(en.picker === 'Off*,8 s,5 s,3 s' && en.inplace, 'the step card has the answer clock picker; it updates in place: ' + en.picker);
  ok(en.adv0 && en.adv5 && en.count === 'Streak 6', 'right answers keep it going: ' + en.count);
  ok(en.miss.view === 'run' && en.miss.act === 'Finish' && en.done.view === 'done', 'the first miss shows the answer, then ends it: ' + JSON.stringify(en.miss));
  ok(/^6 in a row/.test(en.done.big) && /First record/.test(en.done.verdict) && /Ended on/.test(en.done.ended || '') && en.done.again, 'results: the streak, a first record, what ended it, Go again: ' + JSON.stringify(en.done));
  ok(en.rec === 6 && en.sprintRec === 5 && en.prog === 8, 'its own record; sprint record and level scores untouched: ' + JSON.stringify([en.rec, en.sprintRec, en.prog]));
  ok(en.count2 === 'Streak 2 · best 6' && en.second.view === 'done' && /^2/.test(en.second.big) && /Your record: 6/.test(en.second.verdict) && en.second.rec === 6,
    'End run scores the streak so far; a shorter one keeps the record: ' + JSON.stringify([en.count2, en.second]));

  console.log('# answer clock');
  const ck = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const txt = s => (document.querySelector(s) || {}).textContent;
    const node = SLQuiz.nodes()[0], lid = SLQuiz.levels()[0], out = {};
    // picked on the endless results
    document.querySelector('.qz-done [data-qzclock="3"]').click();
    out.pick = [SLQuiz.clock(), txt('.qz-done .qz-clockseg .active')];
    // levels stay untimed; drills get the clock (no tightening)
    SLQuiz.start(lid);
    out.level = { clock: !!SLQuiz.cur.clock, bar: !!document.getElementById('qz-clockfill') };
    SLQuiz.start(lid, { drill: [SLQuiz.gen(lid).item] });
    out.drill = { base: SLQuiz.cur.clock && SLQuiz.cur.clock.base, bar: !!document.getElementById('qz-clockfill'), running: !!SLQuiz.cur.clock.timer };
    await wait(20); SLQuiz.pick(SLQuiz.q.correct);
    out.drill.now = SLQuiz.cur.clock.now; out.drill.stopped = !SLQuiz.cur.clock.timer;
    await wait(1500);
    // leaving the page pauses it; coming back gives a fresh clock
    App.switchTo('chords'); await wait(50);
    out.hide = { timer: SLQuiz.cur.clock.timer, q: SLQuiz.q && !SLQuiz.cur.answered };
    await wait(3200);
    App.switchTo('quiz'); await wait(150);
    out.show = { timer: !!SLQuiz.cur.clock.timer, answered: SLQuiz.cur.answered, left: SLQuiz.cur.clock.end - Date.now() };
    // a sheet over the question pauses it; closing it gives a fresh clock
    document.getElementById('lights-btn').click(); await wait(50);
    out.sheet = { open: App.sheet, timer: SLQuiz.cur.clock.timer };
    await wait(3300);
    out.sheet.answered = SLQuiz.cur.answered;
    document.querySelector('#sheet-lights [data-sheet-close]').click(); await wait(100);
    out.sheet.after = !!SLQuiz.cur.clock.timer; out.sheet.left = SLQuiz.cur.clock.end - Date.now();
    // the app hidden right after an answer: the next question waits, unseen
    let hid = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hid });
    SLQuiz.pick(SLQuiz.q.correct);
    hid = true; document.dispatchEvent(new Event('visibilitychange'));
    await wait(5000);
    out.bg = { answered: SLQuiz.cur.answered, timer: SLQuiz.cur.clock.timer, timedOut: !!SLQuiz.cur.timedOut };
    hid = false; document.dispatchEvent(new Event('visibilitychange')); await wait(100);
    out.bg.after = !!SLQuiz.cur.clock.timer;
    delete document.hidden;
    // an ear question's sound and clock wait until the quiz is on screen
    const ear = SLQuiz.levels().find(id => /\/ear\//.test(id));
    SLQuiz.start(ear, { drill: [SLQuiz.gen(ear).item] });
    App.switchTo('chords');
    await wait(1800);
    out.ear = { id: ear, timer: SLQuiz.cur.clock.timer, played: !!SLQuiz.cur.autoPlayed, answered: SLQuiz.cur.answered };
    App.switchTo('quiz'); await wait(100);
    out.ear.after = !!SLQuiz.cur.clock.timer; out.ear.played2 = SLQuiz.cur.autoPlayed === SLQuiz.q;
    // timed endless: the clock tightens 0.1 s per right answer; running out ends it
    SLQuiz.endless(0);
    out.run = { bar: !!document.getElementById('qz-clockfill'), tag: txt('.qz-lvltag'), count: txt('#qz-count') };
    for (let i = 0; i < 3; i++) { await wait(20); SLQuiz.pick(SLQuiz.q.correct); await wait(450); }
    out.count = txt('#qz-count');
    out.now = SLQuiz.cur.clock.now;
    const w0 = parseFloat(document.getElementById('qz-clockfill').style.width);
    await wait(1200);
    out.drain = [w0, parseFloat(document.getElementById('qz-clockfill').style.width)];
    await wait(1700);
    out.timeout = { view: SLQuiz.view, fb: txt('#qz-fb'), answered: SLQuiz.cur.answered };
    await wait(1900);
    out.done = { view: SLQuiz.view, big: txt('.qz-big'), verdict: txt('.qz-verdict'), ended: txt('.qz-miss'), tag: txt('.qz-lvltag') };
    out.rec = SLXP.sprintBest('end:' + node + '@3');
    out.untimed = SLXP.sprintBest('end:' + node);
    return out;
  });
  ok(ck.pick[0] === 3 && ck.pick[1] === '3 s', 'pick the clock on the results: ' + JSON.stringify(ck.pick));
  ok(!ck.level.clock && !ck.level.bar, 'levels stay untimed');
  ok(ck.drill.base === 3 && ck.drill.bar && ck.drill.running && ck.drill.now === 3 && ck.drill.stopped, 'drills get the clock, it stops on an answer, no tightening: ' + JSON.stringify(ck.drill));
  ok(ck.hide.timer === 0 && ck.hide.q && ck.show.timer && !ck.show.answered && ck.show.left > 2500, 'leaving the page pauses it; coming back gives a fresh clock: ' + JSON.stringify([ck.hide, ck.show]));
  ok(ck.sheet.open === 'lights' && ck.sheet.timer === 0 && !ck.sheet.answered && ck.sheet.after && ck.sheet.left > 2500, 'a sheet on top pauses it; closing gives a fresh clock: ' + JSON.stringify(ck.sheet));
  ok(!ck.bg.answered && ck.bg.timer === 0 && !ck.bg.timedOut && ck.bg.after, 'a question that comes up while the app is hidden waits for you: ' + JSON.stringify(ck.bg));
  ok(ck.ear.id && ck.ear.timer === 0 && !ck.ear.played && !ck.ear.answered && ck.ear.after && ck.ear.played2, 'an ear question plays and starts its clock only on the quiz page: ' + JSON.stringify(ck.ear));
  ok(ck.run.bar && /3 s clock/.test(ck.run.tag) && /3\.0 s/.test(ck.run.count), 'timed endless: a clock bar, the clock in the tag + counter: ' + JSON.stringify(ck.run));
  ok(ck.now === 2.7 && /Streak 3 · 2\.7 s/.test(ck.count), 'each right answer takes 0.1 s off: ' + ck.count);
  ok(ck.drain[0] > 85 && ck.drain[1] < ck.drain[0] - 30, 'the bar drains: ' + JSON.stringify(ck.drain));
  ok(ck.timeout.view === 'run' && ck.timeout.answered && /Time’s up/.test(ck.timeout.fb), 'time running out is a miss: ' + JSON.stringify(ck.timeout));
  ok(ck.done.view === 'done' && /^3 in a row/.test(ck.done.big) && /First record/.test(ck.done.verdict) && /Time’s up/.test(ck.done.ended) && /3 s clock/.test(ck.done.tag), 'then the run ends: ' + JSON.stringify(ck.done));
  ok(ck.rec === 3 && ck.untimed === 6, 'records are kept per clock: ' + JSON.stringify([ck.rec, ck.untimed]));

  console.log('# Progress tab');
  const pg = await page.evaluate(() => {
    App.switchTo('quiz');
    document.getElementById('qz-tohome').click();
    SLQuiz.tab('progress');
    const q = s => document.querySelector(s);
    const out = { tiles: [...document.querySelectorAll('.qz-prog2 > .qz-tiles .qz-tile')].length,
      charts: ['qz-ch-xp', 'qz-ch-time', 'qz-ch-speed'].map(id => !!document.querySelector('#' + id + ' svg')),
      goalLine: !!q('#qz-ch-xp .qz-goalline'), tables: document.querySelectorAll('details.qz-tbl').length,
      topicRows: document.querySelectorAll('.qz-prog2 > section > .qz-tblwrap > .qz-table tbody tr').length,
      recs: document.querySelectorAll('.qz-recs li').length, week: document.querySelectorAll('.qz-wday').length,
      today: q('.qz-wday:last-child').className };
    q('[data-qzgoal="100"]').click();
    out.goal = SLXP.goal();
    out.strip = q('.qz-strip').textContent.includes('/100');
    out.active = q('[data-qzgoal="100"]').classList.contains('active');
    // hover tooltip
    const hit = document.querySelectorAll('#qz-ch-xp .qz-hit');
    hit[hit.length - 1].dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    const tip = q('#qz-ch-xp .qz-tip');
    out.tip = !tip.hidden && tip.textContent;
    return out;
  });
  ok(pg.tiles === 4 && pg.week === 7 && /done/.test(pg.today), 'tiles + this-week strip (today practiced): ' + JSON.stringify([pg.tiles, pg.week, pg.today]));
  ok(pg.charts.every(Boolean) && pg.goalLine && pg.tables === 3, 'XP, time and speed charts drawn, goal line, table views: ' + JSON.stringify(pg));
  ok(pg.topicRows === 5 && pg.recs === 3, 'topic speed table + sprint and streak records (per clock): ' + pg.topicRows + ' / ' + pg.recs);
  ok(pg.goal === 100 && pg.strip && pg.active, 'changing the daily goal updates the strip');
  ok(/^Today: \d+ XP/.test(pg.tip || ''), 'chart hover tooltip: ' + pg.tip);
  ok(errs.length === 0, 'no page errors (path/sprint/progress)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# phone: layout + real taps');
  const days = {};
  const key = n => { const x = new Date(); x.setDate(x.getDate() - n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  [[1, 60, 600, 30, 26, 2, 4200], [2, 45, 480, 24, 20, 2, 4800], [9, 50, 540, 28, 22, 2, 6100]].forEach(r => {
    days[key(r[0])] = { x: r[1], s: r[2], q: r[3], k: r[4], l: r[5], u: { nat: [r[4], r[4] * r[6], r[3]] } };
  });
  ({ ctx, page, errs } = await newPage(browser, { 'qz.prog': { 'notes/nat/treble/1': { b: 9, s: 2 } }, 'xp.days': days, 'xp.total': 155 }, true));
  const covered = async (sel) => page.evaluate((sel) => {
    const e = document.querySelector(sel); e.scrollIntoView({ block: 'center' });
    const r = e.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!h && (h === e || e.contains(h));
  }, sel);
  ok(await page.evaluate(() => document.documentElement.classList.contains('goal-due') && !!document.querySelector('#tabbar-m .tabbar-btn[data-group="gtheory"]')), 'Learn tab shows the goal dot (goal not met today)');
  ok(await covered('#qz-cont'), 'Continue is tappable');
  await page.tap('#qz-cont');
  ok(await page.evaluate(() => SLQuiz.view === 'run' && SLQuiz.cur.lvl.id === SLQuiz.node(1).first), 'tap Continue -> the newest open step');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  ok(await page.evaluate(() => SLQuiz.view) === 'home', 'Escape -> path');
  ok(await page.evaluate(() => !!document.querySelector('#qz-node-1 .qz-node.sel') && !!document.querySelector('.qz-npop')), 'back on the path with the step you left already open: ' + await page.evaluate(() => JSON.stringify({ sel: [...document.querySelectorAll('.qz-node.sel')].map(n => n.id), pops: document.querySelectorAll('.qz-npop').length, cur: SLQuiz.cur && SLQuiz.cur.lvl.id })));
  ok(await covered('[data-qzn="0"]'), 'step 1 is tappable');
  await page.tap('[data-qzn="0"]');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => !!document.querySelector('#qz-node-0 .qz-node.sel') && !document.querySelector('#qz-node-1 .qz-node.sel') && document.querySelectorAll('.qz-npop').length === 1), 'tap another step swaps the card');
  ok(await covered('.qz-npop [data-qzsprint]'), 'sprint button not under the tab bar');
  await page.tap('.qz-npop [data-qzsprint]');
  ok(await page.evaluate(() => SLQuiz.view === 'run' && !!SLQuiz.cur.sprint), 'tap sprint starts it');
  ok(await covered('.qz-ch'), 'sprint answers tappable');
  await page.evaluate(() => SLQuiz.finishSprint());
  await page.tap('#qz-tohome');
  await page.evaluate(() => { SLQuiz.tab('progress'); });
  await page.waitForTimeout(150);
  const ov = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth > innerWidth,
    cards: [...document.querySelectorAll('.qz-prog2 .card, .qz-prog2 .qz-tile')].filter(c => c.getBoundingClientRect().right > innerWidth + 0.5).length,
    svgs: [...document.querySelectorAll('.qz-svg')].map(s => s.getBoundingClientRect().right <= innerWidth) }));
  ok(!ov.doc && ov.cards === 0 && ov.svgs.length === 3 && ov.svgs.every(Boolean), 'progress fits the phone width: ' + JSON.stringify(ov));
  ok(await covered('[data-qzgoal="150"]'), 'goal buttons tappable');
  ok(errs.length === 0, 'no page errors (phone)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  await browser.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
