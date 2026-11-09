// Real Learn controls and attributed knowledge sessions; no MIDI hardware.
const { chromium } = require('playwright');
const env = require('./env');
let checks = 0;
function ok(value, message) { if (!value) throw new Error(message); checks++; console.log('  PASS', message); }

(async function () {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
      localStorage.setItem('guitarlab.qz.prog', JSON.stringify({ 'notes/nat/treble/1': { b: 9, s: 2 } }));
      localStorage.setItem('guitarlab.xp.total', '77');
      localStorage.setItem('guitarlab.xp.days', JSON.stringify({ '2026-01-01': { x: 77, s: 30, p: 0, q: 2, k: 1, l: 1, u: {} } }));
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(env.URL);
    await page.waitForFunction(() => window.SLQuiz && window.SLXP && App.practiceInstrument && App.practiceProgress);
    await page.evaluate(() => App.switchTo('quiz'));
    const initial = await page.evaluate(() => ({ selection: App.practiceInstrument.get(), choices: document.querySelectorAll('#learn-instrument option').length,
      legacy: App.store.get('qz.prog'), legacyXP: App.store.get('xp.total'), current: SLQuiz.node(0).done, snapshot: App.practiceInstrument.snapshot(),
      frozen: Object.isFrozen(App.practiceInstrument.snapshot()), instrumentKeys: App.store.get('qz.instrumentProg', {}) }));
    ok(initial.selection === 'piano' && initial.choices === 7 && initial.frozen && initial.snapshot.instrument === 'piano', 'seven stable instrument choices share an immutable selection snapshot');
    ok(initial.legacyXP === 77 && initial.legacy['notes/nat/treble/1'].b === 9 && initial.current === 0 && Object.keys(initial.instrumentKeys).length === 0,
      'old XP and course history remain unassigned rather than copied into piano');
    const categoryModes = {
      piano: ['treble', 'bass', 'staff', 'ear', 'theory', 'piano'], synth: ['treble', 'bass', 'staff', 'ear', 'theory', 'piano'],
      guitar: ['treble', 'bass', 'staff', 'ear', 'theory', 'neck'], bass: ['treble', 'bass', 'staff', 'ear', 'theory', 'neck'],
      drums: ['theory'], voice: ['treble', 'bass', 'staff', 'ear', 'theory'], other: ['treble', 'bass', 'staff', 'ear', 'theory']
    };
    for (const [instrument, expected] of Object.entries(categoryModes)) {
      await page.selectOption('#learn-instrument', instrument);
      const catalog = await page.evaluate(() => {
        const all = SLQuiz.nodes();
        return { levels: [...new Set(SLQuiz.levels().map(id => id.split('/')[2]))],
          visible: [...new Set(Array.from(document.querySelectorAll('[data-qzn]'), button => all[Number(button.dataset.qzn)].split('|')[1]))],
          category: document.getElementById('qz-category').textContent };
      });
      ok(catalog.levels.length > 0 && catalog.levels.every(m => expected.includes(m)) && catalog.visible.every(m => expected.includes(m)) && catalog.category.toLowerCase().includes(instrument),
        instrument + ': real level catalog and path exclude other instrument modes');
    }
    await page.selectOption('#learn-instrument', 'drums');
    const drums = await page.evaluate(() => {
      const before = SLQuiz.view, hidden = SLQuiz.nodes().indexOf('nat|piano');
      const refused = SLQuiz.start('notes/nat/piano/1') === false && SLQuiz.sprint(hidden) === false;
      const note = document.getElementById('learn-instrument-note').textContent;
      const links = document.getElementById('learn-instrument-links').textContent;
      document.getElementById('qz-cont').click();
      return { before, refused, note, links, mode: SLQuiz.cur.lvl.mode, instrument: SLQuiz.cur.instrument, disabled: document.getElementById('learn-instrument').disabled };
    });
    ok(drums.refused && drums.before === 'home' && drums.mode === 'theory' && drums.instrument === 'drums', 'Drums Continue and programmatic/sprint entry cannot bypass the theory-only filter');
    ok(/Dedicated drum quiz levels are not available/.test(drums.note) && /Drum pads/.test(drums.links) && /rhythm/.test(drums.links), 'Drums exposes actual playing tools and its dedicated-quiz gap clearly');
    ok(drums.disabled && await page.locator('#learn-stop-exercise').isVisible(), 'an active exercise requires End exercise before the visible selector can change');
    await page.click('#learn-stop-exercise');
    ok(await page.evaluate(() => SLQuiz.view === 'home' && SLQuiz.cur === null) && !await page.locator('#learn-instrument').isDisabled(), 'End exercise clears the old run and re-enables category selection');

    await page.selectOption('#learn-instrument', 'bass');
    const bass = await page.evaluate(() => {
      const started = SLQuiz.start('notes/nat/neck/1');
      const rows = document.querySelectorAll('.qz-str').length, names = Array.from(document.querySelectorAll('.qz-sname'), e => e.textContent);
      const audio = SLQuiz.q.audio[0].m[0], hint = document.querySelector('.qz-neck').getAttribute('aria-label'), runLabel = document.getElementById('qz-run-instrument').textContent;
      SLQuiz.stop(); SLQuiz.start('notes/acc/neck/2');
      const q = SLQuiz.q, spot = q.reveal.neck[0], played = [], original = App.pluck, inputPositions = document.querySelectorAll('.qz-fz').length;
      App.pluck = function (midi) { played.push(midi); };
      document.querySelector('.qz-fz[data-s="' + spot.s + '"][data-f="' + spot.f + '"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
      App.pluck = original;
      return { started, rows, names, audio, hint, runLabel, inputPositions,
        lastOk: SLQuiz.cur.lastOk, played, target: [28, 33, 38, 43][spot.s] + spot.f };
    });
    ok(bass.started && bass.rows === 4 && bass.names.join(',') === 'E,A,D,G' && /Four-string bass/.test(bass.hint) && /Credit category: Bass/.test(bass.runLabel) && bass.audio >= 28 && bass.audio <= 46,
      'Bass fretboard questions use the real four-string E1 A1 D2 G2 range and accessible layout');
    ok(bass.inputPositions === 52 && bass.lastOk && bass.played[0] === bass.target, 'Bass answer hit targets and actual sounded MIDI use bass tuning, not six-string guitar pitches');
    await page.evaluate(() => SLQuiz.stop());
    await page.selectOption('#learn-instrument', 'guitar');
    const guitar = await page.evaluate(() => { SLQuiz.start('notes/nat/neck/1'); return { rows: document.querySelectorAll('.qz-str').length, label: document.querySelector('.qz-neck').getAttribute('aria-label') }; });
    ok(guitar.rows === 6 && /Six-string guitar/.test(guitar.label), 'Guitar retains its original six-string fretboard behavior');
    await page.evaluate(() => SLQuiz.stop());

    for (const destination of ['quiz', 'chords', 'theory', 'practiceplan']) {
      await page.evaluate(pageId => App.switchTo(pageId), destination);
      ok(await page.locator('#learn-instruments').isVisible() && await page.locator('#learn-instrument').inputValue() === 'guitar', 'Learn category and entry links remain visible on ' + destination);
    }
    await page.evaluate(() => App.switchTo('shed'));
    ok(!await page.locator('#learn-instruments').isVisible(), 'Learn category bar stays scoped to Learn pages');
    await page.evaluate(() => App.switchTo('quiz'));
    await page.selectOption('#learn-instrument', 'piano');
    await page.locator('[data-learn-entry="0"]').click();
    ok(await page.evaluate(() => App.active === 'piano') && await page.locator('#pn-lessons').isVisible(), 'Piano lesson entry opens the real keys lesson module');
    await page.evaluate(() => App.switchTo('quiz'));
    await page.selectOption('#learn-instrument', 'bass');
    await page.locator('[data-learn-entry="0"]').click();
    ok(await page.evaluate(() => App.active === 'quiz' && SLQuiz.view === 'run' && SLQuiz.cur.instrument === 'bass') && await page.locator('.qz-str').count() === 4,
      'Bass entry opens an actual bass exercise instead of relabeling a guitar page');
    await page.evaluate(() => SLQuiz.stop());

    const knowledge = await page.evaluate(() => {
      window.__learnNow = Date.now();
      App.practiceProgress = new PracticeProgress({ store: App.store, now: () => __learnNow, onChange: event => App.emit('practice:progress', event) });
      SLXP._now(() => new Date(__learnNow));
      window.__completeKnowledge = instrument => {
        App.practiceInstrument.set(instrument); SLQuiz.start('keys/kcirc/theory/1');
        const snapshot = { instrument: SLQuiz.cur.instrument, id: SLQuiz.cur.sessionId };
        for (let i = 0; i < 10; i++) { __learnNow += 2000; SLQuiz.cur.t0 = performance.now() - 2000; SLQuiz.pick(SLQuiz.q.correct); document.getElementById('qz-act').click(); }
        return { snapshot, view: SLQuiz.view, course: App.store.get('qz.instrumentProg', {}), summary: App.practiceProgress.summary(instrument),
          questions: SLXP.forInstrument(instrument).totals(), text: document.getElementById('qz-completion-instrument').textContent };
      };
      const piano = __completeKnowledge('piano'), voice = __completeKnowledge('voice');
      return { piano, voice, history: App.practiceProgress.exportData(), legacy: App.store.get('qz.prog'), legacyXP: App.store.get('xp.total') };
    });
    ok(knowledge.piano.view === 'done' && knowledge.voice.view === 'done' && knowledge.piano.snapshot.id !== knowledge.voice.snapshot.id && /Voice/.test(knowledge.voice.text),
      'shared theory completes with one explicit immutable instrument and a unique run ID');
    ok(knowledge.voice.course.piano['keys/kcirc/theory/1'].b === 10 && knowledge.voice.course.voice['keys/kcirc/theory/1'].b === 10 && !knowledge.voice.course.guitar && !knowledge.voice.course.drums,
      'the same shared level has independent course completion only for the two instruments that completed it');
    ok(knowledge.piano.summary.lifetimeEarnedXP > 0 && knowledge.voice.summary.lifetimeEarnedXP > 0 && knowledge.piano.questions.q === 10 && knowledge.voice.questions.q === 10,
      'bounded active question practice credits the canonical instrument XP and scoped knowledge counts');
    const knowledgeRows = knowledge.history.sessions.filter(s => s.mode === 'knowledge' && s.status === 'complete');
    ok(knowledgeRows.length === 2 && knowledgeRows.every(s => s.expected === 0 && s.matched === 0 && s.timingSamples === 0 && s.engagedSeconds <= 20.001),
      'knowledge answers never fabricate musical note accuracy, timing samples or unbounded active time');
    ok(knowledge.legacyXP === 77 && knowledge.legacy['notes/nat/treble/1'].b === 9 && Object.keys(knowledge.legacy).length === 1,
      'new attributed completions leave every historical unassigned record intact');
    const stopped = await page.evaluate(() => {
      App.practiceInstrument.set('piano'); SLQuiz.start('keys/kcirc/theory/1'); __learnNow += 2000; SLQuiz.cur.t0 = performance.now() - 2000; SLQuiz.pick(SLQuiz.q.correct);
      const id = SLQuiz.cur.sessionId; App.practiceInstrument.set('drums');
      const rows = App.practiceProgress.exportData().sessions.filter(s => s.id === id);
      return { rows, view: SLQuiz.view, current: SLQuiz.cur, drums: App.practiceProgress.summary('drums'), pianoQuestions: SLXP.forInstrument('piano').totals().q };
    });
    ok(stopped.view === 'home' && stopped.current === null && stopped.rows.length === 1 && stopped.rows[0].instrument === 'piano' && stopped.rows[0].status === 'stopped' && stopped.pianoQuestions === 11,
      'a programmatic category change closes the old run once as stopped under its original snapshot');
    ok(stopped.drums.lifetimeEarnedXP === 0 && !(await page.evaluate(() => App.store.get('qz.instrumentProg', {}).drums)), 'switching categories transfers neither course completion nor earned XP');
    const unsaved = await page.evaluate(() => {
      App.practiceInstrument.set('voice'); const earned = App.practiceProgress.summary('voice').lifetimeEarnedXP;
      SLQuiz.start('keys/kcirc/theory/1'); const id = SLQuiz.cur.sessionId;
      __learnNow += 2000; SLQuiz.cur.t0 = performance.now() - 2000; SLQuiz.pick(SLQuiz.q.correct);
      const original = App.practiceProgress.recordSession;
      App.practiceProgress.recordSession = () => ({ ok: false, errors: ['Browser fixture persistence failure'] });
      SLQuiz.stop(); App.practiceProgress.recordSession = original;
      return { id, earned, after: App.practiceProgress.summary('voice').lifetimeEarnedXP, pending: SLXP.pending().length,
        message: document.getElementById('qz-save-error').textContent };
    });
    ok(unsaved.pending === 1 && unsaved.earned === unsaved.after && /not been saved/.test(unsaved.message) && /Retry saving/.test(unsaved.message),
      'failed persistence keeps the exact lesson pending and shows retry/export without claiming unconfirmed XP');
    await page.click('#qz-retry-save');
    const retried = await page.evaluate(id => ({ pending: SLXP.pending().length, rows: App.practiceProgress.history('voice').filter(s => s.id === id), earned: App.practiceProgress.summary('voice').lifetimeEarnedXP }), unsaved.id);
    ok(retried.pending === 0 && retried.rows.length === 1 && retried.earned > unsaved.earned && !await page.locator('#qz-save-error').count(),
      'the visible Retry action saves the original snapshot once and clears the pending error');
    const paused = await page.evaluate(() => {
      App.practiceInstrument.set('piano'); SLQuiz.start('notes/nat/treble/1'); const id = SLQuiz.cur.sessionId;
      SLQuiz.cur.t0 = performance.now() - 1000; App.switchTo('lights'); __learnNow += 60000;
      SLQuiz.pick(SLQuiz.q.correct); const ignored = SLQuiz.cur.res.length === 0;
      App.closeSheet(); SLQuiz.cur.t0 = performance.now() - 2000; __learnNow += 2000; SLQuiz.pick(SLQuiz.q.correct);
      const responseMs = SLQuiz.cur.ms; SLQuiz.stop();
      return { ignored, responseMs, session: App.practiceProgress.history('piano').find(s => s.id === id) };
    });
    ok(paused.ignored && paused.responseMs >= 2000 && paused.responseMs < 2100 && paused.session.engagedSeconds < 2.1,
      'an actual open sheet prevents grading and its covered minute enters neither answer latency nor engaged XP');
    await page.evaluate(() => App.practiceInstrument.set('drums'));
    const tabProof = await page.evaluate(() => {
      const before = App.practiceProgress.exportData().sessions.length;
      ['chords', 'theory', 'practiceplan', 'quiz'].forEach(id => App.switchTo(id));
      SLQuiz.tab('progress');
      return { before, after: App.practiceProgress.exportData().sessions.length, legacy: document.getElementById('qz-legacy-history').textContent,
        label: document.querySelector('.qz-tiles').textContent, history: App.store.get('qz.prog') };
    });
    ok(tabProof.before === tabProof.after && /Legacy \/ unassigned/.test(tabProof.legacy) && /77 historical XP/.test(tabProof.legacy), 'Learn tab navigation adds no duplicate credit and exposes preserved Legacy / unassigned history');
    ok(/Lifetime earned XP/.test(tabProof.label) && /Consistency level/.test(tabProof.label) && !/freeze/.test(tabProof.label), 'Learn uses the canonical lifetime/consistency distinction without a competing old game XP balance');
    await page.reload();
    await page.waitForFunction(() => App.practiceInstrument && window.SLQuiz);
    await page.evaluate(() => App.switchTo('quiz'));
    ok(await page.locator('#learn-instrument').inputValue() === 'drums' && await page.evaluate(() => App.store.get('qz.instrumentProg').voice['keys/kcirc/theory/1'].b) === 10,
      'instrument selection and scoped course completion survive reload');
    await page.setViewportSize({ width: 390, height: 844 });
    ok(await page.locator('#learn-instrument').isVisible() && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'the Learn selector and category links fit a small phone');
    ok(errors.length === 0, 'all instrument and attribution flows run without browser exceptions');
    console.log('PASS ' + checks + ' Learn instrument checks');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
