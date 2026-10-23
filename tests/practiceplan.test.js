// Practice Plan: inert lesson-note imports, honest module mapping, measured
// progress after launch, independent student plans, and phone/keyboard use.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

async function open(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1200, height: 900 }, acceptDownloads: true, serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('__pp_seeded')) return;
    sessionStorage.setItem('__pp_seeded', '1');
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
  });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.practicePlan && App.xp && App.active);
  await page.evaluate(() => {
    window.__ppClock = Date.now();
    App.practiceProgress = new PracticeProgress({ store: App.store, now: () => __ppClock, timezone: () => 'UTC' });
    window.__ppRecord = (id, instrument, mode, seconds, opts = {}) => {
      __ppClock = Math.max(__ppClock, Date.now()); const startedAt = __ppClock; __ppClock += seconds * 1000;
      const matched = opts.matched == null ? 1 : opts.matched;
      return App.practiceProgress.recordSession({ id, instrument, mode, startedAt, endedAt: __ppClock, engagedSeconds: seconds,
        status: opts.status || 'complete', expected: matched, matched, missed: 0, extra: 0, wrong: 0,
        tempo: null, timingSamples: 0, sumAbsTimingMs: 0, sumTimingMs: 0 });
    };
    App.switchTo('practiceplan'); document.querySelector('details.pp-notes').open = true;
  });
  return { ctx, page, errs };
}

// Keep setup through the public import/accept flow. Telemetry is seeded at its
// existing source, rather than by changing the planner's completion flags.
async function plan(page, text, opts) {
  return page.evaluate(({ text, opts }) => {
    App.practiceInstrument.set(opts.instrument === 'keys' ? 'piano' : opts.instrument || 'piano');
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

  console.log('# exact lesson hook and instrument-bound canonical completion');
  await plan(page, 'C major scale right hand');
  const lesson = await page.evaluate(() => {
    const item = App.practicePlan.state().plan.items.find(i => i.lessonId === 'c-r');
    App.store.set('kl.prog', { 'c-r': { step: 2, runs: [{ d: App.xp.dayKey(), acc: 95, sc: 85 }] } });
    __ppRecord('old-keys', 'piano', 'keys:c-r', 20);
    const help = App.help.level(); App.practicePlan.launch(item.id); App.practicePlan.refresh();
    return { id: item.id, active: App.active, selected: App.store.get('kl.sel'), help, afterHelp: App.help.level(),
      running: App.store.get('pp.running'), done: !!App.practicePlan.state().session.items[item.id].done };
  });
  ok(lesson.active === 'piano' && lesson.selected === 'c-r' && lesson.help === lesson.afterHelp && lesson.running.instrument === 'piano',
    'launch selects the exact Keys lesson with an explicit instrument snapshot and shared Help');
  ok(!lesson.done, 'existing canonical and legacy lesson history cannot complete a newly launched block');
  const evidence = await page.evaluate(id => {
    __ppRecord('other-lesson', 'piano', 'keys:g-r', 20);
    __ppRecord('other-instrument', 'synth', 'keys:c-r', 20);
    App.store.set('kl.prog', { 'c-r': { runs: [{ d: App.xp.dayKey(), acc: 100, sc: 99 }] } });
    App.practicePlan.refresh(); const unrelated = !!App.practicePlan.state().session.items[id].done;
    __ppRecord('stopped-keys', 'piano', 'keys:c-r', 5, { status: 'stopped' });
    App.practicePlan.refresh(); const stopped = !!App.practicePlan.state().session.items[id].done;
    const saved = __ppRecord('new-exact-keys', 'piano', 'keys:c-r', 20); App.practicePlan.refresh();
    return { unrelated, stopped, saved: saved.ok, record: App.practicePlan.state().session.items[id] };
  }, lesson.id);
  ok(!evidence.unrelated && !evidence.stopped && evidence.saved && evidence.record.done && evidence.record.sessionIds.includes('new-exact-keys'),
    'only fresh completed canonical evidence for the same instrument and exact lesson completes the block');

  console.log('# existing accepted plans retain context across Learn category changes');
  const preserved = await page.evaluate(() => {
    const original = JSON.stringify(App.practicePlan.state().plan);
    App.practiceInstrument.set('guitar'); const changed = App.practicePlan.state();
    const keys = changed.plan.items.find(i => i.lessonId === 'c-r');
    const refused = App.practicePlan.launch(keys.id);
    return { original, changed, refused, text: document.getElementById('pp-today').textContent,
      foreignButtons: [...document.querySelectorAll('[data-pp-open]')].some(e => e.dataset.ppOpen === keys.id) };
  });
  ok(JSON.stringify(preserved.changed.plan) === preserved.original && preserved.changed.preservedItems.length === 1 && !preserved.refused && !preserved.foreignButtons,
    'switching Learn category preserves the accepted keyboard block but disables its foreign-context launch');
  ok(/preserved|context/i.test(preserved.text) && !Object.keys(preserved.changed.session.items).length,
    'preserved context is visible and another instrument inherits no earlier block completion');

  await plan(page, 'C major scale right hand, 4 minutes', { instrument: 'synth' });
  const switched = await page.evaluate(() => {
    const item = App.practicePlan.state().plan.items[0]; App.practicePlan.launch(item.id);
    const original = App.store.get('pp.running'); App.practiceInstrument.set('piano');
    const ended = App.store.get('pp.running');
    __ppRecord('after-switch-synth', 'synth', 'keys:c-r', 25); App.practicePlan.refresh();
    App.practiceInstrument.set('synth'); const restored = App.practicePlan.state();
    return { original, ended, restored: restored.session.items[item.id], instrument: restored.instrument,
      card: document.getElementById('pp-today').textContent };
  });
  ok(switched.original.instrument === 'synth' && switched.ended === null && !switched.restored.done,
    'category change ends the old planner tracker and later history cannot silently complete it');
  ok(switched.instrument === 'synth' && /Synth/.test(switched.card), 'returning to the original category restores its own unfinished context');

  console.log('# casual tools never infer practice minutes or XP from an open page');
  await plan(page, 'G minor pentatonic guitar scale 2 minutes at 80 bpm', { instrument: 'guitar' });
  const guitar = await page.evaluate(() => {
    const item = App.practicePlan.state().plan.items[0]; let event;
    App.on('fb:practice', d => { event = d; }); App.practicePlan.launch(item.id);
    const tracker = App.store.get('pp.running');
    App.store.set('xp.days', { [App.xp.dayKey()]: { p: 600, a: { Guitar: 600 } } });
    __ppRecord('unrelated-guitar-performance', 'guitar', 'wait', 120); App.practicePlan.refresh();
    App.switchTo('practiceplan');
    return { active: 'fretboard', event, tracker, minutes: item.minutes, tempo: App.store.get('met.bpm'),
      record: App.practicePlan.state().session.items[item.id], text: document.getElementById('pp-today').textContent };
  });
  ok(guitar.event.root === 7 && guitar.event.scale === 'minorPent' && guitar.event.bpm === 80 && guitar.tempo === 80,
    'guitar block keeps the existing configured six-string Fretboard hook');
  ok(guitar.tracker === null && !guitar.record.done && guitar.record.seconds === 0 && /No automated timer/.test(guitar.text),
    'casual Fretboard has no invented minute tracker and cannot consume unrelated performance observations');
  const changedSetup = await page.evaluate(() => {
    const text = 'Guitar scale, 1 minute';
    App.store.set('fb.root', 0); App.store.set('met.bpm', 80); App.practicePlan.preview(text, { instrument: 'guitar' }); App.practicePlan.accept();
    const before = App.practicePlan.state(), item = before.plan.items[0];
    App.store.set('fb.root', 7); App.store.set('met.bpm', 120); App.practicePlan.preview(text, { instrument: 'guitar' }); App.practicePlan.accept();
    const after = App.practicePlan.state(), changed = after.plan.items[0];
    return { oldPlan: before.plan.id, newPlan: after.plan.id, oldItem: item.id, newItem: changed.id,
      root: changed.root, bpm: changed.bpm, inherited: !!(after.session.items[changed.id] || {}).done };
  });
  ok(changedSetup.oldPlan !== changedSetup.newPlan && changedSetup.oldItem !== changedSetup.newItem && changedSetup.root === 7 && changedSetup.bpm === 120 && !changedSetup.inherited,
    'changed key/tempo still creates a distinct plan with no inherited completion');

  console.log('# quiz progress and answering minutes are scoped to the launched instrument');
  await plan(page, 'Ear training intervals 2 minutes');
  const exercise = await page.evaluate(() => {
    const item = App.practicePlan.state().plan.items[0];
    App.store.set('qz.instrumentProg', { piano: { 'notes/nat/treble/1': { b: 8 } } });
    App.practicePlan.launch(item.id); App.practicePlan.refresh(); const old = !!App.practicePlan.state().session.items[item.id].done;
    App.store.set('qz.prog', { 'notes/nat/treble/1': { b: 10 } });
    App.store.set('qz.instrumentProg', { piano: { 'notes/nat/treble/1': { b: 8 } }, guitar: { 'notes/nat/treble/1': { b: 10 } } });
    __ppRecord('other-knowledge', 'guitar', 'knowledge', 120, { matched: 0 }); App.practicePlan.refresh();
    const other = !!App.practicePlan.state().session.items[item.id].done;
    __ppRecord('piano-answering', 'piano', 'knowledge', 120, { matched: 0 }); App.practicePlan.refresh();
    return { old, other, record: App.practicePlan.state().session.items[item.id] };
  });
  ok(!exercise.old && !exercise.other && exercise.record.done && exercise.record.seconds === 120 && exercise.record.instrument === 'piano',
    'only new canonical answering time in the launched category reaches the quiz block goal');
  await plan(page, 'Ear training intervals 3 minutes');
  const passing = await page.evaluate(() => {
    const item = App.practicePlan.state().plan.items[0]; App.practicePlan.launch(item.id);
    const all = App.store.get('qz.instrumentProg'); all.piano['notes/nat/treble/1'].b = 9; App.store.set('qz.instrumentProg', all);
    App.practicePlan.refresh(); return App.practicePlan.state().session.items[item.id];
  });
  ok(passing.done && /Piano/.test(passing.reason) && passing.seconds === 0, 'a fresh scoped passing score can complete shared theory without invented musical notes or time');

  console.log('# Woodshed completion uses fresh canonical IDs, not legacy XP totals');
  await plan(page, 'Practice assigned piece, 3 minutes');
  const woodshed = await page.evaluate(() => {
    const item = App.practicePlan.state().plan.items[0]; __ppRecord('old-woodshed', 'piano', 'wait', 10);
    App.practicePlan.launch(item.id); App.practicePlan.refresh(); const old = !!App.practicePlan.state().session.items[item.id].done;
    App.store.set('ws.xp', 999999); __ppRecord('foreign-woodshed', 'guitar', 'tempo', 10);
    __ppRecord('stopped-woodshed', 'piano', 'woodshed', 5, { status: 'stopped' });
    __ppRecord('empty-woodshed', 'piano', 'wait', 0, { matched: 0 }); App.practicePlan.refresh();
    const unrelated = !!App.practicePlan.state().session.items[item.id].done;
    const result = __ppRecord('fresh-woodshed', 'piano', 'tempo', 10); App.practicePlan.refresh();
    return { old, unrelated, saved: result.ok, record: App.practicePlan.state().session.items[item.id] };
  });
  ok(!woodshed.old && !woodshed.unrelated && woodshed.saved && woodshed.record.done && woodshed.record.sessionIds.includes('fresh-woodshed'),
    'only a fresh completed same-instrument Woodshed session completes the assigned-piece block');

  console.log('# shared blocks and legacy mixed plans keep separate instrument histories');
  await plan(page, 'Ear training 1 minute', { instrument: 'guitar' });
  const shared = await page.evaluate(() => {
    const item = App.practicePlan.state().plan.items[0]; App.practicePlan.launch(item.id);
    __ppRecord('shared-guitar-knowledge', 'guitar', 'knowledge', 60, { matched: 0 }); App.practicePlan.refresh();
    const guitar = App.practicePlan.state(); App.practiceInstrument.set('piano'); const piano = App.practicePlan.state();
    return { guitar, piano };
  });
  ok(shared.guitar.session.items[shared.guitar.plan.items[0].id].done && shared.piano.availableItems.length === 1 && !Object.keys(shared.piano.session.items).length,
    'shared theory stays available across categories without transferring another instrument’s completion');
  const legacy = await page.evaluate(() => {
    const active = App.practicePlan.state().student.id, students = App.store.get('pp.students');
    const original = students.find(s => s.id === active).plan;
    const mixed = { id: 'legacy-mixed', source: 'Earlier mixed plan', items: [
      { id: 'legacy-key', title: 'Earlier keys', page: 'piano', lessonId: 'c-r', minutes: 5 },
      { id: 'legacy-guitar', title: 'Earlier guitar', page: 'fretboard', minutes: 3 },
      { id: 'legacy-theory', title: 'Earlier theory', page: 'quiz', minutes: 2 }
    ], gaps: [] };
    students.find(s => s.id === active).plan = mixed; App.store.set('pp.students', students);
    const oldKey = active + '/' + App.xp.dayKey() + '/legacy-mixed';
    const old = { key: oldKey, day: App.xp.dayKey(), student: active, plan: mixed.id, items: { 'legacy-key': { done: true, seconds: 300 } } };
    const sessions = App.store.get('pp.sessions'); sessions[oldKey] = old; App.store.set('pp.sessions', sessions);
    App.store.set('pp.running', { student: active, day: App.xp.dayKey(), plan: mixed.id, item: 'legacy-key' });
    App.practicePlan.refresh(); const piano = App.practicePlan.state();
    App.practiceInstrument.set('guitar'); const guitar = App.practicePlan.state();
    App.practiceInstrument.set('bass'); const bass = App.practicePlan.state();
    const refused = App.practicePlan.launch('legacy-guitar');
    const oldAfter = App.store.get('pp.sessions')[oldKey], running = App.store.get('pp.running');
    students.find(s => s.id === active).plan = original; App.store.set('pp.students', students); App.practiceInstrument.set('piano');
    return { mixed, piano, guitar, bass, refused, old, oldAfter, running };
  });
  ok(legacy.piano.availableItems.map(i => i.id).join(',') === 'legacy-key,legacy-theory' && legacy.guitar.availableItems.map(i => i.id).join(',') === 'legacy-guitar,legacy-theory',
    'legacy mixed plans filter genuine keyboard and six-string guitar contexts without rewriting their source blocks');
  ok(JSON.stringify(legacy.bass.plan) === JSON.stringify(legacy.mixed) && legacy.bass.availableItems.length === 1 && !legacy.refused,
    'Bass retains shared theory and preserved foreign blocks without launching the six-string guitar tool');
  ok(JSON.stringify(legacy.old) === JSON.stringify(legacy.oldAfter) && !Object.keys(legacy.piano.session.items).length && legacy.running === null,
    'old unassigned block history remains unchanged and is never migrated or resumed as current-instrument credit');

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
  await page.evaluate(() => App.practiceInstrument.set('piano'));
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
