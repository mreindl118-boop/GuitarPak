// Explicit instrument-owned practice: canonical XP, clock/idle safeguards,
// progress UI, browser Back, mistake drills, apply-it links and lefty hit targets.
// The player uses injected clocks and simulated note attacks; no hardware or mic.
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
  let { ctx, page, errs } = await newPage(browser, {'xp.total':80,'xp.days':{'1999-01-01':{x:80,s:0,p:0,q:0,k:0,l:1,u:{}}}});

  console.log('# background activity cannot award XP or duplicate instrument credit');
  const passive = await page.evaluate(() => {
    const out = {legacyTotal:App.store.get('xp.total'),legacyDays:JSON.stringify(App.store.get('xp.days'))};
    App.practiceInstrument.set('guitar');App.wake.acquire('fb-run');
    for(let i=0;i<60;i++)SLXP._tick();
    App.switchTo('fretboard');for(let i=0;i<60;i++)SLXP._tick();App.wake.release('fb-run');
    App.switchTo('piano');App.emit('midi:note',{on:true,midi:60,vel:90});App.emit('midi:note',{on:false,midi:60});
    for(let i=0;i<60;i++)SLXP._tick();SLXP.practice(600,'Keys');
    out.guitar=App.practiceProgress.summary('guitar');out.piano=App.practiceProgress.summary('piano');
    out.toast=(document.getElementById('xp-toast')||{}).textContent||'';
    out.legacyUnchanged=App.store.get('xp.total')===out.legacyTotal&&JSON.stringify(App.store.get('xp.days'))===out.legacyDays;
    return out;
  });
  ok(passive.guitar.sessionCount===0&&passive.piano.sessionCount===0,'quiz ticks, a running fretboard wake tag and unowned MIDI notes create no practice sessions');
  ok(passive.guitar.currentXP===0&&passive.piano.currentXP===0&&passive.legacyUnchanged,'background and anonymous practice preserve both instrument balances and legacy history');
  ok(!/Today counts|Daily goal reached/.test(passive.toast),'background activity does not claim an earned streak day or daily goal');

  console.log('# deliberately started player owns measured time and raw note observations');
  const owned = await page.evaluate(() => {
    window.__practiceClock=0;window.__practiceEpoch=Date.now();
    window.__practiceWall=()=>__practiceEpoch+__practiceClock*1000;
    App.practiceProgress=new PracticeProgress({store:App.store,now:__practiceWall,timezone:()=> 'UTC'});
    App.practiceProgress.updateSettings({dailyMinutes:5,xpPerMinute:2,xpPerCorrectNote:0,decayEnabled:false});
    window.__practiceOpen=instrument=>{
      App.practiceInstrument.set(instrument);App.switchTo('shed');
      Woodshed.performanceStart({title:'Original explicit-session test fixture',bpm:120,len:1024,notes:[{m:60,t:0,d:1},{m:62,t:512,d:1}]},'wait',{instrument,countIn:0,clock:()=>__practiceClock,now:__practiceWall});
      document.getElementById('pf-sound').checked=false;document.getElementById('pf-start').click();
    };
    window.__practiceAttack=()=>{PerformancePlayer.note({midi:61,on:true,velocity:100,source:'test'});PerformancePlayer.note({midi:61,on:false,velocity:0,source:'test'});};
    window.__practiceStep=seconds=>{__practiceClock+=seconds;PerformancePlayer.tick();};
    __practiceOpen('guitar');
    const identity=PerformancePlayer.snapshot().practice;
    for(let i=0;i<300;i++){if(i%4===0)__practiceAttack();__practiceStep(1);}
    document.getElementById('pf-stop').click();
    const summary=App.practiceProgress.summary('guitar'),session=App.practiceProgress.history('guitar')[0];
    document.getElementById('pf-stop').click();SLXP._tick();
    return {identity,summary,session,repeated:App.practiceProgress.summary('guitar'),facade:SLXP.forInstrument('guitar').total(),other:App.practiceProgress.summary('piano')};
  });
  ok(owned.session.id===owned.identity.id&&owned.session.instrument==='guitar'&&owned.session.status==='stopped','an explicitly started player records its stable owned session ID and captured instrument');
  ok(owned.session.engagedSeconds===300&&owned.summary.today.qualifies&&owned.summary.currentStreak===1,'five measured engaged minutes meet the configured five-minute instrument goal');
  ok(owned.summary.currentXP===10&&owned.summary.lifetimeEarnedXP===10&&owned.facade===10,'the selected course facade reads the same configured canonical award of ten XP');
  ok(owned.session.matched===0&&owned.session.expected===2&&owned.session.extra===75&&owned.session.wrong===75&&owned.session.timingSamples===0,'simulated wrong attacks retain raw counts without inventing matched notes or Wait-mode timing');
  ok(owned.repeated.sessionCount===1&&owned.repeated.currentXP===10&&owned.other.sessionCount===0,'repeated Stop and background ticks cannot credit the session twice or to Piano');

  console.log('# idle, large clock gaps and pause cannot farm practice time');
  const idle=await page.evaluate(()=>{
    __practiceOpen('piano');__practiceAttack();__practiceStep(1);__practiceStep(60);__practiceStep(1);
    PerformancePlayer.pause();__practiceStep(120);document.getElementById('pf-pause').click();__practiceStep(1);
    __practiceAttack();__practiceStep(1);document.getElementById('pf-stop').click();
    return {piano:App.practiceProgress.summary('piano'),session:App.practiceProgress.history('piano')[0],guitar:App.practiceProgress.summary('guitar')};
  });
  ok(idle.session.engagedSeconds===2,'a long clock jump, stale-note idle time, paused time and resume without a new attack contribute no engaged time');
  ok(idle.session.extra===2&&idle.session.matched===0&&idle.session.timingSamples===0,'resumed input records only fresh observed attacks and no fabricated musical success');
  ok(idle.piano.sessionCount===1&&!idle.piano.today.qualifies&&idle.piano.currentStreak===0&&idle.guitar.currentXP===10,'Piano owns its partial session while the completed Guitar goal remains independent');

  console.log('# course progress presents the canonical selected-instrument metrics');
  const prog=await page.evaluate(()=>{
    const read=instrument=>{App.practiceInstrument.set(instrument);App.switchTo('quiz');SLQuiz.tab('progress');return {tiles:[...document.querySelectorAll('.qz-tile')].map(e=>e.textContent),areas:[...document.querySelectorAll('.qz-arow')].map(e=>e.textContent),time:document.getElementById('qz-ch-time').textContent,history:document.querySelector('.qz-prog2').textContent};};
    const piano=read('piano'),guitar=read('guitar');return {piano,guitar};
  });
  ok(prog.guitar.tiles.some(t=>/Lifetime earned XP/.test(t)&&/10/.test(t))&&prog.guitar.tiles.some(t=>/Engaged practice/.test(t)&&/5 min/.test(t)),'Guitar progress displays its canonical lifetime award and five measured minutes');
  ok(prog.piano.tiles.some(t=>/Engaged practice/.test(t)&&/0 min/.test(t))&&prog.piano.areas.length===1&&/Explicit piano practice/.test(prog.piano.areas[0]),'Piano progress rounds its own two seconds to zero minutes and shows only its explicit instrument area');
  ok(/canonical instrument history, counted once/.test(prog.guitar.history)&&/Engaged minutes/.test(prog.guitar.time),'the time chart includes an accessible canonical-minutes table without adding question time again');
  ok(/Legacy \/ unassigned/.test(prog.guitar.history),'legacy history remains explicitly unassigned in course progress');

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
    out.bestBefore = App.store.get('qz.instrumentProg',{}).guitar['notes/nat/treble/1'].b;
    out.drillBtn = !!document.getElementById('qz-drill');
    document.getElementById('qz-drill').click();
    out.drill = { tag: document.querySelector('.qz-lvltag').textContent, n: SLQuiz.cur.n, items: [] };
    for (let i = 0; i < 10 && SLQuiz.view === 'run'; i++) {
      out.drill.items.push(SLQuiz.q.item);
      await new Promise(r => setTimeout(r, 10)); SLQuiz.pick(SLQuiz.q.correct); document.getElementById('qz-act').click();
    }
    out.drillDone = { big: document.querySelector('.qz-big').textContent, verdict: document.querySelector('.qz-verdict').textContent };
    out.bestAfter = App.store.get('qz.instrumentProg',{}).guitar['notes/nat/treble/1'].b;
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
