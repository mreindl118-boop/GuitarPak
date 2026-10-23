// soundLAB lesson game layer: canonical instrument XP, goals, path locks,
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

  console.log('# canonical instrument XP and preserved legacy data');
  let { ctx, page, errs } = await newPage(browser);
  const rules = await page.evaluate(() => {
    let tick = Date.parse('2026-10-23T12:00:00Z');
    App.practiceProgress = new PracticeProgress({ store: App.store, now: () => tick, timezone: () => 'UTC' });
    SLXP._now(() => new Date(tick));
    const X = SLXP.forInstrument('piano'), o = { fresh: X.total(), oldKeys: Object.keys(localStorage).filter(k => /^guitarlab\.xp\./.test(k)) };
    SLXP.beginSession({ id: 'game-canonical-rules', instrument: 'piano', source: 'knowledge' });
    const rows = [[true, 1500, 'choice'], [true, 5000, 'choice'], [true, 5000, 'choice'], [true, 5000, 'ear'], [false, 900, 'choice']];
    o.a = rows.map((r, i) => { tick += r[1]; return X.answer({ sessionId: 'game-canonical-rules', answerId: i, unit: 'nat', ok: r[0], ms: r[1], kind: r[2] }).xp; });
    X.answer({ sessionId: 'game-canonical-rules', answerId: 0, unit: 'nat', ok: true, ms: 1500 });
    o.questions = X.today(); o.speed = X.speed('nat').avg;
    o.invalidGoal = (X.setGoal(-1), X.goal());
    X.setGoal(20); o.goal = X.goal(); o.canonicalGoal = App.practiceProgress.getSettings().dailyMinutes;
    o.fin = X.finishLevel({ instrument: 'piano', sessionId: 'game-canonical-rules', passed: true, perfect: true });
    o.summary = App.practiceProgress.summary('piano');
    o.xp = X.total(); o.level = X.level();
    X.finishLevel({ instrument: 'piano', sessionId: 'game-canonical-rules', passed: true });
    o.repeated = App.practiceProgress.summary('piano');
    App.practiceInstrument.set('guitar'); o.selectedTotal = SLXP.total(); o.pianoTotal = X.total();
    SLXP.practice(600, 'Guitar'); SLXP._tick();
    o.noPassive = App.practiceProgress.summary('guitar').sessionCount;
    o.legacyKeys = Object.keys(localStorage).filter(k => /^guitarlab\.xp\./.test(k));
    o.streak = X.streak();
    SLXP._now(null);
    return o;
  });
  ok(rules.fresh === 0, 'a new instrument starts at zero canonical XP');
  ok(rules.a.every(x => x === 0), 'answers do not mint a second per-answer XP balance');
  ok(rules.questions.q === 5 && rules.questions.k === 4, 'duplicate answer callback does not duplicate question observations');
  ok(rules.speed === 4125, 'question response speed remains a separate observed metric: ' + rules.speed);
  ok(rules.invalidGoal === 10 && rules.goal === 20 && rules.canonicalGoal === 20, 'goal validation and selected goal use the canonical settings');
  ok(Math.abs(rules.xp - 0.58) < 0.00001 && Math.abs(rules.fin.bonus - rules.xp) < 0.00001, 'configured two XP/minute credits exactly 17.4 observed seconds once');
  ok(rules.summary.sessionCount === 1 && rules.summary.matched === 0 && rules.summary.expected === 0 && rules.summary.timingSamples === 0, 'knowledge sessions do not invent musical note or timing observations');
  ok(rules.repeated.sessionCount === 1 && rules.repeated.lifetimeEarnedXP === rules.summary.lifetimeEarnedXP, 'repeated finish cannot duplicate the award');
  ok(rules.selectedTotal === 0 && rules.pianoTotal === rules.xp, 'changing the viewed instrument does not move an earlier award');
  ok(rules.noPassive === 0 && rules.legacyKeys.length === rules.oldKeys.length, 'wake ticks and passive practice calls create no new session or legacy XP');
  ok(rules.level.title === 'Consistency' && rules.level.lv === 1 && rules.level.need === 100, 'the course displays the canonical consistency level');
  ok(rules.streak.n === 0 && !rules.streak.today && rules.streak.freezes === 0, 'a short completed lesson does not fabricate a qualifying daily goal or freeze');
  ok(errs.length === 0, 'no page errors (canonical rules)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# legacy course history stays unassigned');
  ({ ctx, page, errs } = await newPage(browser, { 'xp.total': 155, 'qz.prog': { 'notes/nat/treble/1': { b: 10, s: 3 }, 'notes/nat/treble/2': { b: 8, s: 1 }, 'notes/nat/bass/1': { b: 5, s: 0 } } }));
  const legacy = await page.evaluate(() => ({ total: SLXP.total(), legacy: SLXP.legacy(), scoped: App.store.get('qz.instrumentProg', {}), original: App.store.get('qz.prog') }));
  ok(legacy.total === 0 && legacy.legacy.total === 155 && legacy.legacy.label === 'Legacy / unassigned', 'existing global XP is retained without seeding new instrument awards');
  ok(!legacy.scoped.piano && legacy.original['notes/nat/treble/1'].b === 10, 'historical completion is not copied into the new Piano course');
  await ctx.close();

  console.log('# the path: locks, current step, unlocking');
  ({ ctx, page, errs } = await newPage(browser));
  const p0 = await page.evaluate(() => ({ view: SLQuiz.view, path: !!document.querySelector('.qz-path'), n: SLQuiz.nodes({ available: true }).length,
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
  ok(run1.xp >= 0 && run1.xp < 1 && /path/i.test(run1.back), 'results: bounded observed-time XP and back to the path: ' + run1.xp + ' ' + run1.back);
  const dn = await page.evaluate(() => ({ tiles: [...document.querySelectorAll('.qz-dstats .qz-tile')].map(t => t.textContent.replace(/\s+/g, ' ').trim()), notes: [...document.querySelectorAll('.qz-dnotes li')].map(l => l.textContent) }));
  ok(dn.tiles.length === 3 && /XP earned/.test(dn.tiles[0]) && /Time/.test(dn.tiles[1]), 'results tiles: ' + dn.tiles.join(' | '));
  ok(dn.notes.some(n => /engaged minutes/.test(n)) && !dn.notes.some(n => /faster|slower/.test(n)), 'honest daily goal note, no speed claim from instant test taps: ' + dn.notes.join(' | '));
  const back = await page.evaluate(() => { document.getElementById('qz-back').click(); return { view: SLQuiz.view, path: !!document.querySelector('.qz-path'), streak: document.querySelector('.qz-strip .qz-stat b').textContent }; });
  ok(back.view === 'home' && back.path && back.streak === '0', 'back on the path, short answers have not met the engaged-minute goal: ' + JSON.stringify(back));

  console.log('# jump tests');
  const jump = await page.evaluate(async (PLAY) => {
    const play = new Function('return ' + PLAY)();
    const out = {};
    // a locked step whose first level is multiple choice
    let j = -1;
    const visible = [...document.querySelectorAll('[data-qzn]')].map(e => +e.dataset.qzn);
    for (const i of visible) { const n = SLQuiz.node(i); if (i >= 3 && !n.open && SLQuiz.gen(n.first).kind === 'choice') { j = i; break; } }
    const position = visible.indexOf(j); out.next = visible[position + 1];
    out.j = j;
    SLQuiz.tab('path');
    document.querySelector('[data-qzn="' + j + '"]').click();
    document.querySelector('[data-qzjump="' + j + '"]').click();
    out.tag = document.querySelector('.qz-lvltag') && document.querySelector('.qz-lvltag').textContent;
    await play(8);
    out.fail = { verdict: document.querySelector('.qz-verdict').textContent, open: SLQuiz.node(j).open, again: !!document.querySelector('[data-qzjump]') };
    document.querySelector('[data-qzjump]').click();
    await play(9);
    out.pass = { verdict: document.querySelector('.qz-verdict').textContent, open: SLQuiz.node(j).open, before: SLQuiz.node(visible[position - 1]).open, after: SLQuiz.node(visible[position + 1]).open, after2: SLQuiz.node(visible[position + 2]).open, jump: SLXP.jump(), cur: SLQuiz.current() };
    document.getElementById('qz-tohome').click();
    out.home = SLQuiz.view;
    return out;
  }, PLAY.toString());
  ok(jump.j > 0 && /jump/i.test(jump.tag || ''), 'jump test starts from a locked step: ' + jump.j + ' ' + jump.tag);
  ok(!jump.fail.open && jump.fail.again && /9 right/.test(jump.fail.verdict), '8/10 does not open the path (or the step): ' + jump.fail.verdict);
  ok(jump.pass.open && jump.pass.before && jump.pass.after && !jump.pass.after2 && jump.pass.jump === jump.j && jump.pass.cur === jump.next, '9/10 opens every step up to it, its level counts, the next step is current: ' + JSON.stringify(jump.pass));
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
    out.prog = App.store.get('qz.instrumentProg', {}).piano['notes/nat/treble/1'].b;
    // a slower second sprint is not a record
    document.querySelector('[data-qzsprint="0"]').click();
    await wait(20); SLQuiz.pick(SLQuiz.q.correct); await wait(400);
    SLQuiz.finishSprint();
    out.second = { verdict: document.querySelector('.qz-verdict').textContent, rec: SLXP.sprintBest(SLQuiz.nodes()[0]) };
    // leaving the page mid-sprint ends it
    document.querySelector('[data-qzsprint="0"]').click();
    App.switchTo('chords'); await wait(50);
    out.left = { view: SLQuiz.view, current: SLQuiz.cur };
    App.switchTo('quiz');
    return out;
  });
  ok(sp.run.view === 'run' && sp.run.bar && sp.run.act === 'Skip' && /60 s/.test(sp.run.count), 'sprint: time bar, 60 s, Skip footer: ' + JSON.stringify(sp.run));
  ok(sp.adv0 && sp.adv1 && sp.adv4, 'right answers auto-advance in a sprint');
  ok(sp.combo, 'run counter shows the streak of right answers: ' + sp.pill);
  ok(sp.done.view === 'done' && /^5/.test(sp.done.big) && /First record/.test(sp.done.verdict), 'time up -> results, first record: ' + JSON.stringify(sp.done));
  ok(sp.done.tiles.some(t => /Record\s*5/.test(t)), 'sprint results show the record: ' + sp.done.tiles.join(' | '));
  ok(sp.rec === 5 && sp.gained >= 0 && sp.gained < 1, 'record stored with observed-time XP rather than a second record bonus: ' + sp.rec + ' / +' + sp.gained);
  ok(sp.prog === 8, 'sprints never overwrite level scores');
  ok(sp.second.rec === 5 && /Your record: 5/.test(sp.second.verdict), 'a lower score keeps the record: ' + sp.second.verdict);
  ok(sp.left.view === 'home' && !sp.left.current, 'leaving the page explicitly ends the old instrument sprint: ' + JSON.stringify(sp.left));

  console.log('# endless streak');
  const en = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const txt = s => (document.querySelector(s) || {}).textContent;
    const out = {};
    if (document.getElementById('qz-tohome')) document.getElementById('qz-tohome').click();
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
    out.prog = App.store.get('qz.instrumentProg', {}).piano['notes/nat/treble/1'].b;
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
    // Navigation explicitly ends the old run; a new run has a new identity.
    const prior = SLQuiz.cur.sessionId;
    App.switchTo('chords'); await wait(50);
    out.hide = { view: SLQuiz.view, current: SLQuiz.cur, status: App.practiceProgress.history('piano').find(s => s.id === prior).status };
    await wait(200);
    App.switchTo('quiz');
    SLQuiz.start(lid, { drill: [SLQuiz.gen(lid).item] }); await wait(100);
    out.show = { newId: SLQuiz.cur.sessionId !== prior, timer: !!SLQuiz.cur.clock.timer, answered: SLQuiz.cur.answered, left: SLQuiz.cur.clock.end - Date.now() };
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
    const earRun = SLQuiz.cur;
    App.switchTo('chords');
    await wait(400);
    out.ear = { id: ear, timer: earRun.clock.timer, played: !!earRun.autoPlayed, ended: !SLQuiz.cur };
    App.switchTo('quiz'); SLQuiz.start(ear, { drill: [SLQuiz.gen(ear).item] }); await wait(400);
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
  ok(ck.hide.view === 'home' && !ck.hide.current && ck.hide.status === 'stopped' && ck.show.newId && ck.show.timer && !ck.show.answered && ck.show.left > 2500, 'navigation stops old credit; restarting creates a fresh timed identity: ' + JSON.stringify([ck.hide, ck.show]));
  ok(ck.sheet.open === 'lights' && ck.sheet.timer === 0 && !ck.sheet.answered && ck.sheet.after && ck.sheet.left > 2500, 'a sheet on top pauses it; closing gives a fresh clock: ' + JSON.stringify(ck.sheet));
  ok(!ck.bg.answered && ck.bg.timer === 0 && !ck.bg.timedOut && ck.bg.after, 'a question that comes up while the app is hidden waits for you: ' + JSON.stringify(ck.bg));
  ok(ck.ear.id && ck.ear.timer === 0 && !ck.ear.played && ck.ear.ended && ck.ear.after && ck.ear.played2, 'an abandoned ear question stays silent; a fresh run plays only on the quiz page: ' + JSON.stringify(ck.ear));
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
      goalLine: !!q('#qz-ch-time .qz-goalline'), tables: document.querySelectorAll('details.qz-tbl').length,
      topicRows: document.querySelectorAll('.qz-prog2 > section > .qz-tblwrap > .qz-table tbody tr').length,
      recs: document.querySelectorAll('.qz-recs li').length, week: document.querySelectorAll('.qz-wday').length,
      today: q('.qz-wday:last-child').className };
    out.settings = !!q('#qz-progress-settings');
    out.duplicateGoals = document.querySelectorAll('[data-qzgoal]').length;
    out.goal = SLXP.goal();
    out.strip = q('.qz-strip').textContent.includes('/' + out.goal);
    // hover tooltip
    const hit = document.querySelectorAll('#qz-ch-xp .qz-hit');
    hit[hit.length - 1].dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    const tip = q('#qz-ch-xp .qz-tip');
    out.tip = !tip.hidden && tip.textContent;
    return out;
  });
  ok(pg.tiles === 4 && pg.week === 7 && /today/.test(pg.today) && !/done/.test(pg.today), 'tiles + this-week strip retains unmet daily goal: ' + JSON.stringify([pg.tiles, pg.week, pg.today]));
  ok(pg.charts.every(Boolean) && pg.goalLine && pg.tables === 3, 'XP, time and speed charts drawn, goal line, table views: ' + JSON.stringify(pg));
  ok(pg.topicRows === 5 && pg.recs === 3, 'topic speed table + sprint and streak records (per clock): ' + pg.topicRows + ' / ' + pg.recs);
  ok(pg.goal === 10 && pg.strip && pg.settings && !pg.duplicateGoals, 'shared progress settings replace duplicate conflicting goal buttons');
  ok(/^Today: \d+(?:\.\d+)? XP/.test(pg.tip || ''), 'chart hover tooltip: ' + pg.tip);
  ok(errs.length === 0, 'no page errors (path/sprint/progress)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# phone: layout + real taps');
  const days = {};
  const key = n => { const x = new Date(); x.setDate(x.getDate() - n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  [[1, 60, 600, 30, 26, 2, 4200], [2, 45, 480, 24, 20, 2, 4800], [9, 50, 540, 28, 22, 2, 6100]].forEach(r => {
    days[key(r[0])] = { x: r[1], s: r[2], q: r[3], k: r[4], l: r[5], u: { nat: [r[4], r[4] * r[6], r[3]] } };
  });
  ({ ctx, page, errs } = await newPage(browser, { 'qz.instrumentProg': { piano: { 'notes/nat/treble/1': { b: 9, s: 2 } } }, 'lesson.observations.v1': { piano: { days, sprints: {}, jump: -1 } }, 'xp.days': days, 'xp.total': 155 }, true));
  await page.evaluate(() => { const end = Date.now(), id = 'phone-observed-practice'; App.practiceProgress.recordSession({ id, instrument: 'piano', startedAt: end - 60000, endedAt: end, engagedSeconds: 60, mode: 'wait', status: 'complete', expected: 1, matched: 1, missed: 0, extra: 0, wrong: 0, timingSamples: 0, sumAbsTimingMs: 0, sumTimingMs: 0, tempo: null }); SLXP.refresh(); App.switchTo('quiz'); });
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
  ok(await covered('#qz-progress-settings'), 'shared progress settings button is tappable');
  ok(errs.length === 0, 'no page errors (phone)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  await browser.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
