// Teacher drafts are local planning data, not performances or XP observations.
// All material/clock fixtures are original; media/MIDI requests are blocked.
const { chromium } = require('playwright');
const assert = require('assert');
const env = require('./env');
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; console.log('  PASS ' + label); }
(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
    await context.addInitScript(() => {
      window.SL_ARTIFACT = true; window.__requests = { midi: 0, audio: 0 };
      ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
      navigator.requestMIDIAccess = () => { __requests.midi++; return Promise.reject(Error('Cloud test: no hardware')); };
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { addEventListener() {}, enumerateDevices: () => Promise.resolve([]), getUserMedia: () => { __requests.audio++; return Promise.reject(Error('Cloud test: no capture')); } } });
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let docsRequests = 0; page.on('request', r => { if (/docs\.google\.com/.test(r.url())) docsRequests++; });
    await page.goto(env.URL); await page.waitForFunction(() => App.practicePlan && window.PracticeMaterial);
    await page.evaluate(() => { App.practiceInstrument.set('piano'); App.switchTo('practiceplan'); document.querySelector('.pp-notes').open = true; });

    console.log('# raw notes before review survive navigation and reload');
    await page.fill('#pp-notes', 'Teacher text typed before Review mapping');
    await page.fill('#pp-link', 'https://docs.google.com/document/d/teacher-local-bookmark/edit');
    const rawCheckpoint = await page.evaluate(() => { const result = App.practicePlan.checkpoint(); App.switchTo('theory'); App.switchTo('practiceplan'); return { result, source: document.getElementById('pp-notes').value, link: document.getElementById('pp-link').value }; });
    ok(rawCheckpoint.result.ok && rawCheckpoint.source === 'Teacher text typed before Review mapping' && rawCheckpoint.link.includes('teacher-local-bookmark'), 'unreviewed raw notes and optional Doc bookmark save locally before any compilation');
    await page.reload(); await page.waitForFunction(() => App.practicePlan); await page.evaluate(() => { App.switchTo('practiceplan'); document.querySelector('.pp-notes').open = true; });
    ok(await page.inputValue('#pp-notes') === 'Teacher text typed before Review mapping' && (await page.inputValue('#pp-link')).includes('teacher-local-bookmark'), 'raw notes and bookmark survive reload independently from immutable compiled source');
    const rawFailure = await page.evaluate(() => {
      const set = App.store.set; App.store.set = (key, value) => { if (key !== 'pp.drafts.v1') return set(key, value); };
      const field = document.getElementById('pp-notes'); field.value = 'Unsaved raw notes are retained'; field.dispatchEvent(new Event('input', { bubbles: true }));
      const checkpoint = App.practicePlan.checkpoint(); App.switchTo('theory'); App.switchTo('practiceplan');
      const retained = document.getElementById('pp-notes').value; App.store.set = set; const retry = App.practicePlan.checkpoint();
      return { checkpoint, retained, retry };
    });
    ok(!rawFailure.checkpoint.ok && rawFailure.retained === 'Unsaved raw notes are retained' && rawFailure.retry.ok, 'failed raw-note save blocks checkpoint and retains text across navigation until successful retry');
    await page.evaluate(() => { window.__textMethod = File.prototype.text; File.prototype.text = function () { return new Promise(resolve => { window.__releaseTeacherFile = resolve; }); }; });
    await page.setInputFiles('#pp-file', { name: 'original-test-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('C major scale right hand') });
    const pendingImport = await page.evaluate(() => { const checkpoint = App.practicePlan.checkpoint(); App.practiceInstrument.set('guitar'); return { checkpoint, before: JSON.stringify(App.practicePlan.draft()) }; });
    await page.evaluate(() => { File.prototype.text = window.__textMethod; window.__releaseTeacherFile('C major scale right hand'); });
    await page.waitForTimeout(50);
    ok(!pendingImport.checkpoint.ok && /still being read/.test(pendingImport.checkpoint.errors[0]) && await page.evaluate(before => JSON.stringify(App.practicePlan.draft()) === before, pendingImport.before), 'pending file read blocks checkpoint and cannot replace another instrument draft after switching context');
    await page.evaluate(() => { App.practiceInstrument.set('piano'); document.querySelector('.pp-notes').open = true; });

    console.log('# immutable source, distinct repeated instructions and explicit gaps');
    const compiled = await page.evaluate(() => {
      const before = JSON.stringify(App.practicePlan.state().plan), ledger = JSON.stringify(App.practiceProgress.exportData());
      const source = 'C major scale right hand, 5 min\nC major scale right hand, 5 min\nTune at 900 bpm\nInvent microtonal bowing';
      const draft = App.practicePlan.preview(source);
      return { before, after: JSON.stringify(App.practicePlan.state().plan), draft, ledgerBefore: ledger, ledgerAfter: JSON.stringify(App.practiceProgress.exportData()) };
    });
    ok(compiled.before === compiled.after && compiled.ledgerBefore === compiled.ledgerAfter, 'compiling and reviewing leaves accepted plans and canonical XP unchanged');
    ok(compiled.draft.items.length === 2 && new Set(compiled.draft.items.map(i => i.id)).size === 2 && compiled.draft.items.every(i => i.action === 'keysLesson' && i.target.lessonId === 'c-r'), 'identical repeated instructions become distinct real lesson cards');
    ok(compiled.draft.gaps.length === 2 && compiled.draft.gaps.some(g => /not silently clamped/.test(g.reason)) && compiled.draft.source.includes('900 bpm'), 'unsupported commands and out-of-bounds text stay as visible source/gaps');
    ok(await page.locator('.pp-edit-card').count() === 2 && await page.locator('[data-pp-field="lessonId"]').count() === 2, 'review screen exposes typed existing-lesson controls');
    const sourceMismatch = await page.evaluate(() => {
      const field = document.getElementById('pp-notes'); field.value = 'New teacher text not reviewed'; field.dispatchEvent(new Event('input', { bubbles: true }));
      const invalid = App.practicePlan.validateDraft(); field.value = App.practicePlan.draft().source; field.dispatchEvent(new Event('input', { bubbles: true }));
      return invalid;
    });
    ok(!sourceMismatch.ok && /text changed/.test(sourceMismatch.errors[0]), 'new raw teacher text cannot be discarded by accepting an older compiled review');

    console.log('# edits, order and inert source');
    const edits = await page.evaluate(() => {
      const before = App.practicePlan.draft(), first = before.items[0];
      const result = App.practicePlan.editStep(first.id, { title: '<img src=x onerror="window.__draftPwned=1">', minutes: 2.5 });
      const changed = result.draft.items[0];
      const duplicate = App.practicePlan.duplicateStep(changed.id);
      const added = App.practicePlan.addStep({ title: 'Tune deliberately', action: 'openTool', page: 'tuner', instrument: 'shared', minutes: 2 });
      const last = added.draft.items.at(-1); App.practicePlan.moveStep(last.id, 0);
      const reordered = App.practicePlan.draft(); App.practicePlan.removeStep(reordered.items[2].id);
      return { before, changed, result: result.ok, duplicate: duplicate.ok, added: added.ok, current: App.practicePlan.draft(), pwned: window.__draftPwned || 0, injected: document.querySelectorAll('#pp-preview img, #pp-preview script').length };
    });
    ok(edits.result && edits.changed.id !== edits.before.items[0].id && edits.changed.sourceText === edits.before.items[0].sourceText && edits.changed.minutes === 2.5, 'edited semantics get new identities while original instructions remain unchanged');
    ok(edits.duplicate && edits.added && edits.current.items.length === 3 && edits.current.items[0].title === 'Tune deliberately' && new Set(edits.current.items.map(i => i.id)).size === 3, 'add, duplicate, reorder and remove preserve explicit distinct steps');
    ok(!edits.pwned && !edits.injected && edits.current.items.some(i => i.title.includes('<img')), 'edited markup stays inert text');
    const firstTitle = page.locator('[data-pp-field="title"]').first();
    await firstTitle.fill('Keyboard-edited tuning card'); await firstTitle.press('Tab');
    await page.waitForFunction(() => App.practicePlan.draft().items[0].title === 'Keyboard-edited tuning card');
    ok(await page.evaluate(() => document.activeElement.dataset.ppField === 'instrument'), 'editing with Tab keeps normal keyboard focus progression');

    console.log('# strict mutations and no guessed lesson hooks');
    const invalid = await page.evaluate(() => {
      const step = App.practicePlan.draft().items[0], vectors = [{ minutes: 0 }, { minutes: 61 }, { minutes: NaN }, { minutes: Infinity }, { root: -1 }, { root: 12 }, { scale: 'invented' }, { bpm: 29 }, { title: '' }, { title: 'x'.repeat(121) }, { action: 'eval' }, { page: 'settings' }, { hand: 'both' }, { instrument: 'violin' }, { lessonId: 'fake-lesson' }, { levelId: 'fake-level' }, { materialId: 'fake-material' }, { goal: { kind: 'automaticXP' } }];
      const failures = vectors.map(patch => { const before = JSON.stringify(App.practicePlan.draft()); const r = App.practicePlan.editStep(step.draftKey, patch); const after = JSON.stringify(App.practicePlan.draft()); App.practicePlan.editStep(step.draftKey, { title: step.title }); return !r.ok && before === after; });
      return failures;
    });
    ok(invalid.every(Boolean) && invalid.length === 18, 'invalid bounds, identifiers, actions and forged goal fields reject without changing the draft');
    const hand = await page.evaluate(() => {
      App.practicePlan.preview('G major scale, two octaves, hands separate'); const original = App.practicePlan.draft().items[0];
      const mismatch = App.practicePlan.editStep(original.id, { hand: 'right' }); const missing = App.practicePlan.draft().items[0];
      const corrected = App.practicePlan.editStep(missing.id, { lessonId: 'c-r' });
      const tempo = App.practicePlan.editStep(corrected.stepId, { bpm: 80 }); App.practicePlan.editStep(corrected.stepId, { title: 'Confirmed C major right hand' });
      return { original, mismatch: mismatch.ok, missing, corrected: corrected.ok, tempoRejected: !tempo.ok, draft: App.practicePlan.draft() };
    });
    ok(hand.original.lessonId === 'g2-l' && hand.mismatch && hand.missing.status === 'needsSetup' && !hand.missing.lessonId, 'unavailable G two-octave right hand becomes setup-needed rather than a fabricated lesson');
    ok(hand.corrected && hand.tempoRejected && hand.draft.items[0].lessonId === 'c-r' && hand.draft.items[0].root === 0, 'choosing a real lesson corrects its setup and arbitrary Keys BPM remains unsupported');
    const actionChange = await page.evaluate(() => {
      App.practicePlan.preview('C major scale right hand'); let step = App.practicePlan.draft().items[0];
      App.practicePlan.editStep(step.id, { action: 'openTool', page: 'tuner' }); App.practicePlan.accept(); step = App.practicePlan.state().plan.items[0];
      const open = App.keysLessons.open, calls = []; App.keysLessons.open = (...args) => calls.push(args);
      let launched; try { launched = App.practicePlan.launch(step.id); } finally { App.keysLessons.open = open; }
      App.switchTo('practiceplan'); App.practicePlan.preview('G major scale, two octaves, hands separate');
      return { launched, calls, step, running: App.store.get('pp.running') };
    });
    ok(actionChange.launched && !actionChange.calls.length && !actionChange.step.lessonId && !actionChange.running, 'changing lesson to a casual action clears hidden targets and never launches or measures the old lesson');

    console.log('# saved drafts, acceptance archive and failure recovery');
    const pendingBefore = await page.evaluate(() => App.practicePlan.draft());
    await page.reload(); await page.waitForFunction(() => App.practicePlan);
    await page.evaluate(() => { App.switchTo('practiceplan'); document.querySelector('.pp-notes').open = true; });
    ok(await page.evaluate(id => App.practicePlan.draft().id === id && document.getElementById('pp-notes').value === App.practicePlan.draft().source, pendingBefore.id), 'raw teacher text and edited draft survive reload without acceptance');
    const failedAccept = await page.evaluate(() => {
      const before = JSON.stringify(App.store.get('pp.students')), history = JSON.stringify(App.store.get('pp.history', []) || []), set = App.store.set;
      App.store.set = (key, value) => { if (key !== 'pp.students') set(key, value); };
      let error = ''; try { App.practicePlan.accept(); } catch (e) { error = e.message; } finally { App.store.set = set; }
      return { failed: !!error, unchanged: before === JSON.stringify(App.store.get('pp.students')), historySame: history === JSON.stringify(App.store.get('pp.history', []) || []), retained: !!App.practicePlan.draft() };
    });
    ok(failedAccept.failed && failedAccept.unchanged && failedAccept.historySame && failedAccept.retained, 'failed final plan write rolls back archive/gaps and retains the reviewable draft');
    const saved = await page.evaluate(() => { const before = App.practicePlan.state().plan.id; App.practicePlan.accept(); return { before, state: App.practicePlan.state(), archive: App.store.get('pp.history') }; });
    ok(saved.state.plan.id !== saved.before && !saved.state.draft && saved.archive.some(a => a.plan.id === saved.before), 'successful acceptance archives the complete previous plan');
    const unsaved = await page.evaluate(() => {
      App.practicePlan.editAccepted(); const step = App.practicePlan.draft().items[0], students = JSON.stringify(App.store.get('pp.students')), set = App.store.set;
      App.store.set = (key, value) => { if (key !== 'pp.drafts.v1') set(key, value); };
      const result = App.practicePlan.editStep(step.id, { title: 'Unsaved but retained edit' }); App.store.set = set;
      const failed = App.practicePlan.state(); const retry = App.practicePlan.retryDraft();
      return { result: result.ok, failed, retry: retry.ok, unchanged: students === JSON.stringify(App.store.get('pp.students')), after: App.practicePlan.state() };
    });
    ok(!unsaved.result && !unsaved.failed.draftSaved && unsaved.failed.draft.items[0].title === 'Unsaved but retained edit' && unsaved.unchanged, 'draft quota failure keeps the edited candidate in memory and leaves the accepted plan untouched');
    ok(unsaved.retry && unsaved.after.draftSaved && !unsaved.after.draftErrors.length, 'retry saves the exact retained draft once storage is available');
    const downloadPending = page.waitForEvent('download'); await page.click('#pp-export-draft'); const download = await downloadPending;
    ok(download.suggestedFilename() === 'soundlab-practice-draft.json', 'draft/source export remains independent of Google or account access');

    console.log('# competing tabs retain newer work and local candidates');
    await page.evaluate(() => App.practicePlan.preview('Tune up 2 minutes'));
    const second = await context.newPage(); await second.goto(env.URL); await second.waitForFunction(() => App.practicePlan);
    await second.evaluate(() => App.switchTo('practiceplan'));
    const tabA = await page.evaluate(() => App.practicePlan.editStep(App.practicePlan.draft().items[0].id, { title: 'Newer saved Tab A title' }));
    const tabB = await second.evaluate(() => {
      const result = App.practicePlan.editStep(App.practicePlan.draft().items[0].id, { minutes: 7 });
      const retry = App.practicePlan.retryDraft(), state = App.practicePlan.state();
      return { result, retry, state, saved: App.store.get('pp.drafts.v1')['self/piano'].plan };
    });
    ok(tabA.ok && !tabB.result.ok && !tabB.retry.ok && /Another tab/.test(tabB.result.errors[0]) && tabB.saved.items[0].title === 'Newer saved Tab A title' && tabB.saved.items[0].minutes === 2 && tabB.state.draft.items[0].minutes === 7 && !tabB.state.draftSaved, 'stale tab cannot overwrite a newer draft, including on retry, and keeps its own candidate exportable');
    await second.evaluate(() => App.practicePlan.reloadDraft());
    ok(await second.evaluate(() => App.practicePlan.draft().items[0].title === 'Newer saved Tab A title' && App.practicePlan.state().draftSaved), 'explicit reload resolves conflict using the saved newer draft');
    await second.close();

    console.log('# actual level/material targets and category safety');
    const launch = await page.evaluate(() => {
      App.practicePlan.preview('Ear training 3 minutes'); const item = App.practicePlan.draft().items[0];
      App.practicePlan.editStep(item.id, { action: 'quizLevel', levelId: 'notes/nat/piano/1', instrument: 'piano' }); App.practicePlan.accept();
      const bound = App.practicePlan.state().plan.items[0], started = App.practicePlan.launch(bound.id);
      const running = SLQuiz.cur && { id: SLQuiz.cur.lvl.id, instrument: SLQuiz.cur.instrument }; SLQuiz.stop();
      App.practiceInstrument.set('guitar'); const foreign = App.practicePlan.launch(bound.id); App.practiceInstrument.set('piano'); App.switchTo('practiceplan');
      return { started, running, foreign };
    });
    ok(launch.started && launch.running.id === 'notes/nat/piano/1' && launch.running.instrument === 'piano' && !launch.foreign, 'an actual chosen level starts through SLQuiz and cannot launch under a foreign category');
    const material = await page.evaluate(() => {
      const score = { id: 'draft-material', title: 'Original draft fixture', bpm: 90, len: 2, timingOk: true, source: 'test', notes: [{ m: 60, t: 0, d: 1, v: 80 }, { m: 62, t: 1, d: 1, v: 90 }] };
      App.store.set('ws.lib', [score]); App.practicePlan.preview('Work on my piece for 2 minutes');
      const setup = App.practicePlan.draft().items[0]; const ready = App.practicePlan.editStep(setup.id, { action: 'guidedScore', materialId: score.id, mode: 'wait', bpm: 120 }); App.practicePlan.accept();
      const item = App.practicePlan.state().plan.items[0], launched = App.practicePlan.launch(item.id), snapshot = PerformancePlayer.snapshot(), selection = PracticeMaterial.selection();
      score.notes[0].m = 65; App.store.set('ws.lib', [score]); App.switchTo('practiceplan');
      const stale = App.practicePlan.launch(item.id); App.practicePlan.editAccepted();
      const reselected = App.practicePlan.editStep(App.practicePlan.draft().items[0].id, { materialId: score.id });
      return { ready: ready.ok, launched, snapshot, selection, stale, reselected: reselected.ok };
    });
    ok(material.ready && material.launched && material.selection.material.id === 'draft-material', 'chosen structured material uses the central actual launch adapter with immutable identity');
    ok(material.snapshot.tempo === 120, 'structured material launches at the edited supported tempo instead of its old score tempo');
    ok(!material.stale && material.reselected, 'changed material cannot silently replace an accepted target; explicit reselection is required');
    const waitingOnly = await page.evaluate(() => {
      const scores = App.store.get('ws.lib'); scores[0].timingOk = false; App.store.set('ws.lib', scores);
      const item = App.practicePlan.draft().items[0]; App.practicePlan.editStep(item.id, { materialId: scores[0].id, mode: 'tempo' });
      return App.practicePlan.draft().items[0];
    });
    ok(waitingOnly.status === 'needsSetup' && waitingOnly.limitations.some(s => /approximate/.test(s)), 'approximate-rhythm material cannot claim a ready Tempo action');

    console.log('# mobile and side effects');
    await page.evaluate(() => { App.switchTo('practiceplan'); document.querySelector('.pp-notes').open = true; });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const mobile = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, overflow: document.documentElement.scrollWidth > innerWidth + 1, buttons: [...document.querySelectorAll('.pp-editor button')].map(b => ({text:b.textContent,height:b.getBoundingClientRect().height})), controls: [...document.querySelectorAll('.pp-editor button')].every(b => b.getBoundingClientRect().height >= 44) }));
    ok(!mobile.overflow && mobile.controls, 'editable cards fit390px and retain44px touch actions: ' + JSON.stringify(mobile));
    const effects = await page.evaluate(() => ({ requests: __requests, piano: App.practiceProgress.summary('piano'), guitar: App.practiceProgress.summary('guitar') }));
    ok(!effects.requests.midi && !effects.requests.audio && docsRequests === 0 && effects.piano.lifetimeEarnedXP === 0 && effects.guitar.lifetimeEarnedXP === 0, 'compile/edit/accept/open/setup actions never award XP or request hardware/Docs access');

    console.log('# actual repeated passing level observation');
    const repeat = await page.evaluate(() => {
      App.practicePlan.preview('Ear training 3 minutes'); const step = App.practicePlan.draft().items[0], level = 'notes/nat/treble/1';
      App.practicePlan.editStep(step.id, { action: 'quizLevel', levelId: level, instrument: 'piano' }); App.practicePlan.accept();
      const progress = App.store.get('qz.instrumentProg', {}); progress.piano = progress.piano || {}; progress.piano[level] = { b: 10, s: 3 }; App.store.set('qz.instrumentProg', progress);
      const item = App.practicePlan.state().plan.items[0]; App.practicePlan.launch(item.id);
      for (let i = 0; i < 10; i++) { if (!SLQuiz.q || SLQuiz.q.kind !== 'choice') throw Error('Expected original choice fixture'); SLQuiz.pick(SLQuiz.q.correct); document.getElementById('qz-act').click(); }
      return { item: item.id, finished: SLQuiz.cur.finished, score: SLQuiz.cur.score, level, session: SLQuiz.cur.sessionId };
    });
    await page.waitForFunction(id => { App.practicePlan.refresh(); return App.practicePlan.state().session.items[id].done; }, repeat.item);
    const observed = await page.evaluate(r => ({ history: App.practiceProgress.history('piano').find(s => s.id === r.session), best: App.store.get('qz.instrumentProg').piano[r.level].b }), repeat);
    ok(repeat.finished && repeat.score === 10 && observed.best === 10 && observed.history.status === 'complete', 'a new real passing exact-level session completes its block even when prior best was already10/10');
    ok(!errors.length, 'no uncaught browser errors: ' + errors.join('; '));
    await context.close(); console.log('ALL PASS (' + checks + ' teacher-draft browser checks; no hardware validated)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
