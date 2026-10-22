// Practice Plan: inert lesson-note imports, honest module mapping, measured
// progress after launch, independent student plans, and phone/keyboard use.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

async function open(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1200, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('__pp_seeded')) return;
    sessionStorage.setItem('__pp_seeded', '1');
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
  });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.practicePlan && App.xp && App.active);
  await page.evaluate(() => { App.switchTo('practiceplan'); document.querySelector('details.pp-notes').open = true; });
  return { ctx, page, errs };
}

// Keep setup through the public import/accept flow. Telemetry is seeded at its
// existing source, rather than by changing the planner's completion flags.
async function plan(page, text, opts) {
  return page.evaluate(({ text, opts }) => {
    App.switchTo('practiceplan');
    App.practicePlan.preview(text, opts);
    App.practicePlan.accept();
    return App.practicePlan.state();
  }, { text, opts: opts || {} });
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  let { ctx, page, errs } = await open(browser);

  console.log('# standard module and review before acceptance');
  const start = await page.evaluate(() => ({
    active: App.active,
    panel: !!document.querySelector('#panel-practiceplan #pp-today'),
    rules: Array.isArray(App.practicePlan.rules) && App.practicePlan.rules.length,
    plan: App.practicePlan.state().plan,
    week: document.getElementById('pp-week').textContent,
    controls: ['pp-notes', 'pp-review', 'pp-preview', 'pp-gaps', 'pp-student', 'pp-link', 'pp-instrument', 'pp-file'].every(id => !!document.getElementById(id)),
    nav: [...document.querySelectorAll('#subnav .subtab')].some(e => /plan/i.test(e.textContent))
  }));
  ok(start.active === 'practiceplan' && start.panel && start.controls && start.nav, 'a registered page, navigation pill, and complete import/session controls');
  ok(start.rules >= 4 && start.plan.items.length >= 4 && start.week.trim(), 'readable mapping rules, a short starter session, and weekly progress');
  const beforeReview = JSON.stringify(start.plan.items);
  await page.fill('#pp-notes', 'C major scale right hand\nInvent a seven-string microtonal tapping etude');
  await page.click('#pp-review');
  const reviewed = await page.evaluate(() => ({
    plan: App.practicePlan.state().plan.items,
    text: document.getElementById('pp-preview').textContent,
    accept: !document.getElementById('pp-accept').disabled
  }));
  ok(JSON.stringify(reviewed.plan) === beforeReview && reviewed.accept && /C major/i.test(reviewed.text), 'review explains the proposal while preserving the accepted session');
  await page.click('#pp-accept');
  let state = await page.evaluate(() => App.practicePlan.state());
  ok(state.plan.items.some(i => i.lessonId === 'c-r' && /C major/i.test(i.source)), 'accepted source text maps to the exact C-major right-hand lesson');
  ok((await page.evaluate(() => App.store.get('pp.gaps', []))).some(g => JSON.stringify(g).includes('microtonal')), 'an unsupported technique remains a module gap');

  console.log('# precise mapping and gap accounting');
  state = await plan(page, 'G major scale, two octaves, hands separate');
  ok(state.plan.items.some(i => i.lessonId === 'g2-l'), 'two-octave G-major left hand uses the existing g2-l lesson');
  ok(!state.plan.items.some(i => i.lessonId === 'g2-r'), 'the plan never invents an unavailable two-octave right-hand lesson');
  const gGaps = await page.evaluate(() => App.store.get('pp.gaps', []));
  ok(gGaps.some(g => /G major/i.test(JSON.stringify(g)) && /right|RH/i.test(JSON.stringify(g))), 'the unavailable right-hand part is explicitly recorded as a gap');
  const unsupported = 'C major scale in five octaves with contrary motion';
  state = await plan(page, unsupported);
  ok(!state.plan.items.some(i => i.source === unsupported && i.lessonId), 'unsupported explicit technique is not silently replaced by a simpler lesson');
  const countGaps = () => App.store.get('pp.gaps', []).reduce((n, g) => n + (+g.count || 1), 0);
  const count1 = await page.evaluate(countGaps);
  await plan(page, unsupported);
  const count2 = await page.evaluate(countGaps);
  ok(count1 === count2, 'accepting identical notes again does not inflate gap counts');

  console.log('# modes, spelled accidentals, and explicit technique');
  state = await plan(page, 'D mixolydian guitar scale', { instrument: 'guitar' });
  ok(state.plan.items.some(i => i.page === 'fretboard' && i.root === 2 && i.scale === 'mixolydian'), 'a named mode preserves both its root and scale when mapped to Guitar');
  state = await plan(page, 'B flat major scale right hand', { instrument: 'keys' });
  ok(state.plan.items.some(i => i.lessonId === 'bb-r'), 'a spelled flat selects the B-flat lesson rather than a different key');
  state = await plan(page, 'G dorian scale', { instrument: 'keys' });
  ok(state.plan.items.length === 0 && state.plan.gaps.some(g => /G dorian/.test(g.source)), 'an unavailable Keys mode remains a gap instead of silently becoming C major');
  state = await plan(page, 'C major scale in tenths', { instrument: 'keys' });
  ok(state.plan.items.length === 0 && state.plan.gaps.some(g => /tenths/.test(g.source)), 'an unsupported requested interval pattern remains a gap');
  state = await plan(page, '## C major scale RH', { instrument: 'keys' });
  ok(state.plan.items.some(i => i.lessonId === 'c-r'), 'an assignment formatted as a Markdown heading is imported and mapped');

  console.log('# inert notes and link-only Docs workflow');
  let docsRequests = 0;
  page.on('request', r => { if (/docs\.google\.com/.test(r.url())) docsRequests++; });
  const hostile = '<img src=x onerror="window.__pp_pwned=1"><script>window.__pp_pwned=2</script>';
  await page.fill('#pp-link', 'https://docs.google.com/document/d/practice-test-document/edit');
  await page.fill('#pp-notes', 'C major scale right hand\n' + hostile);
  await page.click('#pp-review');
  const inert = await page.evaluate(() => ({
    pwned: window.__pp_pwned || 0,
    nodes: document.querySelectorAll('#pp-preview img, #pp-preview script').length,
    literal: document.getElementById('pp-preview').textContent.includes('<img')
  }));
  await page.click('#pp-accept');
  ok(!inert.pwned && inert.nodes === 0 && inert.literal, 'pasted markup is displayed as source text and cannot execute');
  ok(docsRequests === 0, 'saving a Google Docs link does not request live or credentialed document access');

  console.log('# exact lesson hook and measured completion');
  await plan(page, 'C major scale right hand');
  const lesson = await page.evaluate(() => {
    const item = App.practicePlan.state().plan.items.find(i => i.lessonId === 'c-r');
    const old = { step: 2, passed: 1, best: { 1: 85 }, runs: [{ d: App.xp.dayKey(), st: 1, h: 3, acc: 95, t: 20, m: 0, sd: 10, sc: 85 }] };
    App.store.set('kl.prog', { 'c-r': old });
    const help = App.help.level();
    App.practicePlan.launch(item.id);
    App.practicePlan.refresh();
    return { id: item.id, active: App.active, selected: App.store.get('kl.sel'), tempo: App.store.get('met.bpm'), help, afterHelp: App.help.level(),
      done: !!App.practicePlan.state().session.items[item.id].done };
  });
  ok(lesson.active === 'piano' && lesson.selected === 'c-r' && lesson.help === lesson.afterHelp, 'launch selects the exact Keys lesson and uses the shared Help setting');
  ok(!lesson.done, 'existing lesson history and opening a module do not complete a new block');
  const evidence = await page.evaluate(id => {
    const all = App.store.get('kl.prog', {});
    all['g-r'] = { step: 3, runs: [{ d: App.xp.dayKey(), st: 2, h: 3, sc: 95 }] };
    App.store.set('kl.prog', all);
    App.xp.practice(600, 'Jam');
    App.practicePlan.refresh();
    const unrelated = !!App.practicePlan.state().session.items[id].done;
    all['c-r'].runs.push({ d: App.xp.dayKey(), st: 2, h: 3, acc: 98, t: 15, m: 0, sd: 9, sc: 92 });
    App.store.set('kl.prog', all);
    App.practicePlan.refresh();
    return { unrelated, record: App.practicePlan.state().session.items[id] };
  }, lesson.id);
  ok(!evidence.unrelated && evidence.record.done && evidence.record.reason, 'only a new run of the selected lesson completes that block, with an evidence explanation');

  await plan(page, 'C major scale right hand at 72 bpm');
  const rollover = await page.evaluate(() => {
    const item = App.practicePlan.state().plan.items.find(i => i.lessonId === 'c-r');
    const old = { step: 2, runs: Array.from({ length: 40 }, (_, i) => ({ d: App.xp.dayKey(), st: 1, h: 3, sc: 60 + i / 2 })) };
    App.store.set('kl.prog', { 'c-r': old });
    App.practicePlan.launch(item.id);
    const before = !!App.practicePlan.state().session.items[item.id].done;
    old.runs.shift(); old.runs.push({ d: App.xp.dayKey(), st: 2, h: 3, sc: 97 });
    App.store.set('kl.prog', { 'c-r': old });
    App.practicePlan.refresh();
    return { before, after: !!App.practicePlan.state().session.items[item.id].done };
  });
  ok(!rollover.before && rollover.after, 'fresh evidence is recognized when the lesson history has reached its 40-run retention limit');

  await plan(page, 'C major scale right hand, 4 minutes');
  const playedRun = await page.evaluate(() => {
    const item = App.practicePlan.state().plan.items.find(i => i.lessonId === 'c-r');
    const progress = { step: 0, runs: [] };
    App.store.set('kl.prog', { 'c-r': progress });
    App.practicePlan.launch(item.id);
    progress.runs.push({ d: App.xp.dayKey(), st: 0, h: 3, acc: 0, t: 0, inf: 0 });
    App.store.set('kl.prog', { 'c-r': progress }); App.practicePlan.refresh();
    const empty = !!App.practicePlan.state().session.items[item.id].done;
    progress.runs.push({ d: App.xp.dayKey(), st: 0, h: 3, acc: 80, t: 25, m: 0, sd: 20, inf: 1, bpm: 60 });
    App.store.set('kl.prog', { 'c-r': progress }); App.practicePlan.refresh();
    return { empty, played: !!App.practicePlan.state().session.items[item.id].done };
  });
  ok(!playedRun.empty && playedRun.played, 'an empty infinite run does not complete a Keys block, but a newly recorded played run does');

  console.log('# module setup and per-area minutes');
  await plan(page, 'G minor pentatonic guitar scale 2 minutes at 80 bpm', { instrument: 'guitar' });
  const guitar = await page.evaluate(() => {
    const item = App.practicePlan.state().plan.items.find(i => i.page === 'fretboard');
    if (!item) return { missing: true };
    let event;
    App.on('fb:practice', d => { event = d; });
    App.practicePlan.launch(item.id);
    const afterOpen = !!App.practicePlan.state().session.items[item.id].done;
    App.xp.practice(60, 'Guitar'); App.practicePlan.refresh();
    const half = !!App.practicePlan.state().session.items[item.id].done;
    App.xp.practice(60, 'Guitar'); App.practicePlan.refresh();
    return { active: App.active, event, minutes: item.minutes, tempo: App.store.get('met.bpm'), afterOpen, half, done: !!App.practicePlan.state().session.items[item.id].done };
  });
  ok(!guitar.missing && guitar.active === 'fretboard' && guitar.event.root === 7 && guitar.event.scale === 'minorPent' && guitar.event.bpm === 80 && guitar.tempo === 80, 'a guitar block starts the configured Fretboard runner through the shared hook');
  ok(guitar.minutes === 2 && !guitar.afterOpen && !guitar.half && guitar.done, 'configured practice minutes, rather than wall time or launch, complete the guitar block');

  const changedSetup = await page.evaluate(() => {
    const text = 'Guitar scale, 1 minute';
    App.store.set('fb.root', 0); App.store.set('met.bpm', 80);
    App.practicePlan.preview(text, { instrument: 'guitar' }); App.practicePlan.accept();
    const before = App.practicePlan.state(), item = before.plan.items[0];
    App.practicePlan.launch(item.id); App.xp.practice(60, 'Guitar'); App.practicePlan.refresh();
    const finished = !!App.practicePlan.state().session.items[item.id].done;
    App.store.set('fb.root', 7); App.store.set('met.bpm', 120);
    App.practicePlan.preview(text, { instrument: 'guitar' }); App.practicePlan.accept();
    const after = App.practicePlan.state(), changed = after.plan.items[0];
    return { finished, oldPlan: before.plan.id, newPlan: after.plan.id, oldItem: item.id, newItem: changed.id,
      root: changed.root, bpm: changed.bpm, inherited: !!(after.session.items[changed.id] || {}).done };
  });
  ok(changedSetup.finished && changedSetup.oldPlan !== changedSetup.newPlan && changedSetup.oldItem !== changedSetup.newItem && changedSetup.root === 7 && changedSetup.bpm === 120 && !changedSetup.inherited,
    'accepting the same words with a changed key/tempo creates a distinct plan without inherited completion');

  await plan(page, 'Ear training intervals 2 minutes');
  const exercise = await page.evaluate(() => {
    const item = App.practicePlan.state().plan.items.find(i => i.page === 'quiz');
    if (!item) return { missing: true };
    App.store.set('qz.prog', { 'notes/nat/treble/1': { b: 10, s: 3 } });
    App.practicePlan.launch(item.id); App.practicePlan.refresh();
    const old = !!App.practicePlan.state().session.items[item.id].done;
    App.xp.practice(300, 'Keys'); App.practicePlan.refresh();
    const other = !!App.practicePlan.state().session.items[item.id].done;
    App.xp.answer({ ok: true, kind: 'ear', ms: 30000 });
    App.xp.answer({ ok: true, kind: 'ear', ms: 30000 });
    App.xp.answer({ ok: true, kind: 'ear', ms: 30000 });
    App.xp.answer({ ok: true, kind: 'ear', ms: 30000 });
    App.practicePlan.refresh();
    return { active: App.active, old, other, done: !!App.practicePlan.state().session.items[item.id].done };
  });
  ok(!exercise.missing && exercise.active === 'quiz' && !exercise.old && !exercise.other && exercise.done, 'Exercises counts new answer time and ignores existing scores or another module’s minutes');

  await plan(page, 'Practice assigned piece, 3 minutes');
  const woodshed = await page.evaluate(() => {
    const item = App.practicePlan.state().plan.items.find(i => i.page === 'shed');
    if (!item) return { missing: true };
    App.store.set('ws.xp', 100);
    App.practicePlan.launch(item.id); App.practicePlan.refresh();
    const old = !!App.practicePlan.state().session.items[item.id].done;
    App.store.set('ws.xp', 110); App.practicePlan.refresh();
    return { active: App.active, old, done: !!App.practicePlan.state().session.items[item.id].done };
  });
  ok(!woodshed.missing && woodshed.active === 'shed' && !woodshed.old && woodshed.done, 'Woodshed uses a fresh score/XP result instead of lifetime XP');

  console.log('# independent students and persistence');
  await plan(page, 'C major scale right hand');
  const studentA = await page.inputValue('#pp-student');
  const aItems = await page.evaluate(() => App.practicePlan.state().plan.items.map(i => i.id).join('|'));
  await page.fill('#pp-name', 'Second student'); await page.click('#pp-add');
  const studentB = await page.inputValue('#pp-student');
  await plan(page, 'F major scale left hand');
  const bHasLesson = await page.evaluate(() => App.practicePlan.state().plan.items.some(i => i.lessonId === 'f-l'));
  await page.selectOption('#pp-student', studentA);
  const restoredA = await page.evaluate(() => ({
    items: App.practicePlan.state().plan.items.map(i => i.id).join('|'),
    foreign: App.practicePlan.state().plan.items.some(i => i.lessonId === 'f-l')
  }));
  ok(studentA !== studentB && bHasLesson && restoredA.items === aItems && !restoredA.foreign, 'each student retains an independent accepted plan');
  await page.reload(); await page.waitForFunction(() => window.App && App.practicePlan && App.active);
  await page.evaluate(() => { App.switchTo('practiceplan'); document.querySelector('details.pp-notes').open = true; });
  const persisted = await page.evaluate(() => App.practicePlan.state().plan.items.map(i => i.id).join('|'));
  ok(await page.inputValue('#pp-student') === studentA && persisted === aItems, 'the selected student and accepted plan survive a reload');

  console.log('# text file import and gap export');
  await page.selectOption('#pp-instrument', 'keys');
  await page.setInputFiles('#pp-file', { name: 'lesson-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('D major scale right hand\nMicrotonal prepared piano technique', 'utf8') });
  await page.waitForFunction(() => /D major/.test(document.getElementById('pp-notes').value));
  await page.click('#pp-review'); await page.click('#pp-accept');
  ok(await page.evaluate(() => App.practicePlan.state().plan.items.some(i => i.lessonId === 'd-r')), 'a local text export imports through the same reviewed mapping');

  const docsJSON = { tabs: [{ documentTab: { body: { content: [
    { paragraph: { elements: [{ textRun: { content: 'E minor scale right hand\n' } }] } },
    { table: { tableRows: [{ tableCells: [{ content: [
      { paragraph: { elements: [{ textRun: { content: 'F major scale left hand\n' } }] } }
    ] }] }] } }
  ] } } }] };
  await page.setInputFiles('#pp-file', { name: 'teacher-notes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(docsJSON), 'utf8') });
  await page.waitForFunction(() => /E minor/.test(document.getElementById('pp-notes').value) && /F major/.test(document.getElementById('pp-notes').value));
  await page.click('#pp-review'); await page.click('#pp-accept');
  const jsonLessons = await page.evaluate(() => App.practicePlan.state().plan.items.map(i => i.lessonId));
  ok(jsonLessons.includes('em-r') && jsonLessons.includes('f-l') && jsonLessons.length === 2, 'Docs JSON imports distinct assignments from a document tab paragraph and a table cell');

  const downloadPromise = page.waitForEvent('download');
  await page.click('#pp-export');
  const download = await downloadPromise;
  ok(/gap|practice/i.test(download.suggestedFilename()), 'module gaps can be exported without external transmission');

  console.log('# keyboard and phone layout');
  await page.locator('#pp-today [data-pp-open]').first().focus();
  const focusedItem = await page.evaluate(() => document.activeElement.getAttribute('data-pp-open'));
  await page.waitForTimeout(3300);
  ok(await page.evaluate(id => document.activeElement.getAttribute('data-pp-open') === id, focusedItem), 'periodic progress refresh preserves keyboard focus on the session control');
  await page.keyboard.press('Enter');
  ok(await page.evaluate(() => App.active) !== 'practiceplan', 'a session block launches with the keyboard');
  ok(errs.length === 0, 'no desktop page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  ({ ctx, page, errs } = await open(browser, { width: 390, height: 844 }));
  await plan(page, 'C major scale right hand\n' + 'UnmatchedLongSourceWord'.repeat(24));
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    today: document.getElementById('pp-today').getBoundingClientRect().width,
    notes: document.getElementById('pp-notes').getBoundingClientRect().width,
    week: document.getElementById('pp-week').textContent
  }));
  ok(!mobile.overflow && mobile.today <= 390 && mobile.notes <= 390 && mobile.week.trim(), 'long imported notes and weekly/session cards fit a phone viewport: ' + JSON.stringify(mobile));
  await page.setViewportSize({ width: 360, height: 844 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  const narrowNav = await page.evaluate(() => {
    const pills = [...document.querySelectorAll('#subnav .subtab')].map(e => {
      const r = e.getBoundingClientRect(); return { label: e.textContent, top: r.top, left: r.left, right: r.right };
    });
    return { n: pills.length, oneRow: Math.max(...pills.map(r => r.top)) - Math.min(...pills.map(r => r.top)) <= 2,
      fits: pills.every(r => r.left >= 0 && r.right <= window.innerWidth + 1), overflow: document.documentElement.scrollWidth > window.innerWidth, pills };
  });
  ok(narrowNav.n >= 4 && narrowNav.oneRow && narrowNav.fits && !narrowNav.overflow, 'Learn navigation stays on one visible row at 360px: ' + JSON.stringify(narrowNav));
  ok(errs.length === 0, 'no phone page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close(); await browser.close();
  console.log(fails ? '\nFAILED: ' + fails : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
