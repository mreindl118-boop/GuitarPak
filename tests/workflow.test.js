// Full shell, real registered tools and canonical services. No physical input.
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright'), env = require('./env');
const PracticeProgress = require('../js/practice-progress');
let checks = 0;
function ok(value, message) { assert(value, message); checks++; console.log('  PASS', message); }
const legacy = ['quiz', 'practiceplan', 'fretboard', 'tab', 'notation', 'chords', 'piano', 'synth', 'pads', 'midihub', 'lumipractice', 'songs', 'jam', 'shed', 'trainer', 'theory'];
async function route(page, id) { await page.evaluate(id => App.switchTo(id), id); await page.waitForFunction(id => App.active === id && document.getElementById('wipe').style.display === 'none', id); }
async function open(browser, width, seed = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, hasTouch: width < 600, isMobile: width < 600, serviceWorkers: 'block' });
  await context.addInitScript(seed => {
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    for (const k in seed) if (localStorage.getItem('guitarlab.' + k) == null) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
    window.__permissions = { midi: 0, audio: 0 };
    navigator.requestMIDIAccess = () => { __permissions.midi++; return Promise.reject(new Error('No hardware in workflow test')); };
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => { __permissions.audio++; return Promise.reject(new Error('No microphone in workflow test')); };
  }, seed);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /init |Module .*failed|bus:/.test(m.text())) errors.push(m.text()); });
  await page.goto(env.URL); await page.waitForFunction(() => window.App && App.active && App.workflow && window.SLMusicLibrary && window.SLScoreReview);
  return { context, page, errors };
}
async function screenshot(page, name) {
  if (!process.env.EVIDENCE_DIR) return;
  fs.mkdirSync(process.env.EVIDENCE_DIR, { recursive: true }); await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(process.env.EVIDENCE_DIR, '1.1-workflow-' + name + '.png') });
}
(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM });
  try {
    for (const width of [1440, 390, 360]) {
      const { context, page, errors } = await open(browser, width);
      const nav = width > 900 ? '#tabbar' : '#tabbar-m';
      console.log('# workflow at ' + width + 'px');
      ok(await page.locator(nav + ' .tabbar-btn').allTextContents().then(x => x.join('|')) === 'Learn|Free Play|Library|Progress', 'four focused sections replace duplicate Play/Practice navigation');
      ok(await page.evaluate(() => App.persistence === App.store && typeof App.persistence.status === 'function'), 'shell uses the actual shared persistence facade');
      for (const [instrument, target] of [['piano', 'piano'], ['synth', 'synth'], ['guitar', 'fretboard'], ['bass', 'freeplay'], ['drums', 'pads'], ['voice', 'freeplay'], ['other', 'freeplay']]) {
        await route(page, 'quiz'); await page.selectOption('#learn-instrument', instrument);
        await page.locator(nav + ' [data-group="gfree"]').click();
        await page.waitForFunction(id => App.active === id, target);
        const s = await page.evaluate(() => ({ selected: App.practiceInstrument.get(), text: document.getElementById('workflow-context-note').textContent, tools: [...document.querySelectorAll('#workflow-tools option')].map(x => x.value) }));
        ok(s.selected === instrument && s.text.toLowerCase().includes(instrument) && s.tools.includes('songs') && s.tools.includes('midihub') && s.tools.includes('lumipractice'), instrument + ' opens its honest default and keeps all unique tools');
      }
      await route(page, 'quiz'); await page.selectOption('#learn-instrument', 'piano');
      await page.locator(nav + ' [data-group="gfree"]').click();
      await page.selectOption('#workflow-tools', 'songs');
      ok(await page.evaluate(() => App.active === 'songs'), 'All tools reaches the original Songs player');
      await page.selectOption('#workflow-tools', 'jam');
      ok(await page.evaluate(() => App.active === 'jam'), 'All tools reaches the original backing band');
      await page.locator(nav + ' [data-group="gtheory"]').click();
      await page.locator('#subnav [data-page="trainer"]').click();
      ok(await page.evaluate(() => App.active === 'trainer'), 'the original Trainer remains directly reachable in Learn');
      for (const id of legacy) { await route(page, id); ok(await page.evaluate(id => App.active === id && document.getElementById('panel-' + id).classList.contains('active'), id), 'legacy route retained: ' + id); }
      await page.locator(nav + ' [data-group="glibrary"]').click();
      ok(await page.evaluate(() => App.active === 'musiclibrary' && !!document.querySelector('#panel-musiclibrary input[type="file"]')), 'Library opens the real persistent source loader');
      await route(page, 'progress');
      await page.selectOption('#workflow-progress-host [data-pgu="instrument"]', 'guitar');
      ok(await page.evaluate(() => App.practiceInstrument.get() === 'guitar' && document.querySelector('#workflow-progress-host [data-pgu="instrument"]').value === 'guitar'), 'Progress instrument selection updates the same shared category');
      await route(page, 'freeplay');
      ok(await page.evaluate(() => document.getElementById('workflow-instrument').value === 'guitar'), 'Free Play receives the Progress category without a separate setting');
      await page.evaluate(() => App.scaleLock.set(true)); await page.evaluate(() => App.midi.setDisplayEnabled(true));
      const beforeTuner = await page.evaluate(() => App.active);
      await page.locator('#tuner-btn').click();
      ok(await page.evaluate(before => App.active === before && App.sheet === 'tuner' && document.querySelectorAll('#panel-tuner').length === 1 && !document.querySelector('main #panel-tuner'), beforeTuner), 'one global Tuner sheet preserves the underlying route');
      ok(await page.evaluate(() => document.activeElement.closest('#sheet-tuner') && document.getElementById('ctx-btn').disabled && !App.ctx(true)), 'Tuner takes focus and blocks the background context disclosure');
      await page.keyboard.press('Escape');
      ok(await page.evaluate(() => !App.sheet && document.activeElement.id === 'tuner-btn' && App.scaleLock.on && App.midi.displayEnabled), 'Tuner Escape restores focus and leaves global music preferences intact');
      await page.evaluate(() => App.switchTo('tuner'));
      ok(await page.evaluate(before => App.sheet === 'tuner' && App.active === before, beforeTuner), 'the old tuner route is a compatible utility alias');
      await page.keyboard.press('Escape');
      await route(page, 'arrange'); await page.locator('#tuner-btn').click();
      ok(await page.evaluate(() => App.active === 'arrange' && App.space === 'studio' && App.sheet === 'tuner'), 'Tuner is global in Studio too');
      await page.keyboard.press('Escape'); await route(page, 'settings');
      await page.locator('#tuner-btn').click();
      ok(await page.evaluate(() => App.active === 'settings' && App.sheet === 'tuner'), 'Tuner remains available over Settings');
      await page.keyboard.press('Escape'); await route(page, 'freeplay');
      for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => App.setTheme(theme), theme); await page.waitForTimeout(180);
        const layout = await page.evaluate(() => {
          const tools = [...document.querySelectorAll('.tb-tools button')].map(b => ({ id: b.id, r: b.getBoundingClientRect() }));
          const t = document.getElementById('tuner-btn'), r = t.getBoundingClientRect(), ink = getComputedStyle(t).color;
          return { overflow: document.documentElement.scrollWidth > innerWidth, fits: tools.every(x => x.r.left >= 0 && x.r.right <= innerWidth + 1), tuner: r.width >= 44 && r.height >= 44 && !!ink, order: tools.map(x => x.id).join('|') };
        });
        ok(!layout.overflow && layout.fits && layout.tuner && /settings-btn\|ctx-btn\|tuner-btn/.test(layout.order), theme + ' header fits with adjacent Settings / clef / 44px Tuner');
        await screenshot(page, width + '-' + theme);
      }
      await page.evaluate(() => App.addPage('workflow-plugin', 'Test tool', 'practice', { init: el => { el.textContent = 'Plugin tool'; } }));
      await route(page, 'workflow-plugin'); await route(page, 'progress'); await page.evaluate(() => history.back());
      await page.waitForFunction(() => App.active === 'workflow-plugin');
      ok(true, 'plugin routes and in-app Back still work');
      ok(await page.evaluate(() => __permissions.audio === 0 && __permissions.midi === 0), 'navigation and opening Tuner never request MIDI or microphone permission');
      ok(errors.length === 0, 'no module or browser exceptions: ' + errors.join('; '));
      await context.close();
    }
    const saved = await open(browser, 390, { 'app.tab': 'tuner' });
    ok(await saved.page.evaluate(() => App.active === 'quiz' && App.sheet === 'tuner'), 'a pre-1.1 saved Tuner page opens its sheet over Learn');
    await saved.context.close();

    console.log('# interrupted storage startup fails closed and retries once');
    const recoveryContext = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
    await recoveryContext.addInitScript(() => {
      ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
      window.__allowStartupRecovery = false; window.__startupRecovered = false; window.__recoveryCalls = 0; window.__swRegistrations = 0;
      navigator.serviceWorker.register = () => { __swRegistrations++; return Promise.resolve({}); };
      let persistence;
      Object.defineProperty(window, 'SLPersistence', { configurable: true, get: () => persistence, set: api => {
        const create = api.create;
        api.create = opts => {
          const store = create(opts), status = store.status;
          store.status = () => Object.assign({}, status(), { recoveryRequired: !__startupRecovered });
          store.recover = async () => { __recoveryCalls++; if (__allowStartupRecovery) { __startupRecovered = true; return { ok: true }; } return { ok: false, errors: ['Synthetic sampler recovery failure'] }; };
          return store;
        };
        persistence = api;
      } });
    });
    const recoveryPage = await recoveryContext.newPage(); await recoveryPage.goto(env.URL);
    await recoveryPage.waitForSelector('#startup-recovery-error:has-text("Synthetic sampler recovery failure")');
    ok(await recoveryPage.evaluate(() => !App.active && __swRegistrations === 0 && document.querySelector('.topbar').inert), 'failed startup recovery leaves the app and new service worker unstarted with background controls inert');
    await recoveryPage.keyboard.press('Tab');
    ok(await recoveryPage.evaluate(() => !!document.activeElement.closest('#startup-recovery')), 'recovery dialog traps keyboard focus');
    const download = recoveryPage.waitForEvent('download'); await recoveryPage.locator('#startup-recovery-export').click();
    const recoveryDownload = await download;
    ok(recoveryDownload.suggestedFilename() === 'soundlab-storage-recovery.json' && JSON.parse(fs.readFileSync(await recoveryDownload.path(), 'utf8')).format === 'soundlab-storage-recovery', 'recovery offers the actual recovery JSON without claiming a complete archive');
    await recoveryPage.evaluate(() => { __allowStartupRecovery = true; });
    await recoveryPage.locator('#startup-recovery-retry').click(); await recoveryPage.waitForFunction(() => !!App.active);
    const recovered = await recoveryPage.evaluate(() => ({ calls: __recoveryCalls, registrations: __swRegistrations, overlay: !!document.getElementById('startup-recovery'), inert: document.querySelector('.topbar').inert }));
    ok(recovered.calls === 2 && recovered.registrations === 1 && !recovered.overlay && !recovered.inert, 'confirmed recovery retries once, boots once, and then permits service-worker registration: ' + JSON.stringify(recovered));
    await recoveryContext.close();

    console.log('# recovery cannot boot stale module snapshots');
    function progressFixture(id) {
      let data = null;
      const core = new PracticeProgress({ store: { get: () => data, set: (key, value) => { data = JSON.parse(JSON.stringify(value)); } }, now: () => 1000, timezone: () => 'UTC' });
      assert(core.recordSession({ id, instrument: 'piano', startedAt: 0, endedAt: 1000, engagedSeconds: 1, mode: 'wait', status: 'complete', expected: 1, matched: 1, missed: 0, extra: 0, wrong: 0, timingSamples: 0, sumAbsTimingMs: 0, sumTimingMs: 0, tempo: null }).ok);
      return core.exportData();
    }
    const reloadContext = await browser.newContext({ serviceWorkers: 'block' });
    await reloadContext.addInitScript(({ partial, restored }) => {
      ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
      if (!sessionStorage.getItem('test.startup.seeded')) { sessionStorage.setItem('test.startup.seeded', 'true'); localStorage.setItem('guitarlab.practice.progress.v1', JSON.stringify(partial)); localStorage.setItem('guitarlab.learn.instrument', '"guitar"'); }
      navigator.serviceWorker.register = () => { sessionStorage.setItem('test.startup.sw', String(Number(sessionStorage.getItem('test.startup.sw') || 0) + 1)); return Promise.resolve({}); };
      if (sessionStorage.getItem('test.startup.recovered')) return;
      let persistence;
      Object.defineProperty(window, 'SLPersistence', { configurable: true, get: () => persistence, set: api => {
        const create = api.create;
        api.create = opts => {
          const store = create(opts), status = store.status;
          store.status = () => Object.assign({}, status(), { recoveryRequired: !sessionStorage.getItem('test.startup.recovered') });
          store.recover = async () => {
            window.__coreBeforeRollback = App.practiceProgress.data.sessions.map(s => s.id);
            localStorage.setItem('guitarlab.practice.progress.v1', JSON.stringify(restored));
            localStorage.setItem('guitarlab.learn.instrument', '"piano"');
            sessionStorage.setItem('test.startup.recovered', 'true');
            return { ok: true, requiresReload: true };
          };
          return store;
        }; persistence = api;
      } });
    }, { partial: progressFixture('partial-import'), restored: progressFixture('original-before-import') });
    const reloadPage = await reloadContext.newPage(); await reloadPage.goto(env.URL);
    await reloadPage.waitForSelector('#startup-recovery-title:has-text("Recovery saved")');
    const stale = await reloadPage.evaluate(() => ({ active: App.active, captured: __coreBeforeRollback, cachedInstrument: App.practiceInstrument.get(), durableInstrument: JSON.parse(localStorage.getItem('guitarlab.learn.instrument')), durable: JSON.parse(localStorage.getItem('guitarlab.practice.progress.v1')).sessions.map(s => s.id), registrations: Number(sessionStorage.getItem('test.startup.sw') || 0), inert: document.querySelector('.topbar').inert }));
    ok(!stale.active && stale.captured.join() === 'partial-import' && stale.cachedInstrument === 'guitar' && stale.durableInstrument === 'piano' && stale.durable.join() === 'original-before-import' && stale.registrations === 0 && stale.inert, 'confirmed recovery keeps captured Core/history and stale instrument preferences unbooted until a deliberate fresh load: ' + JSON.stringify(stale));
    await Promise.all([reloadPage.waitForNavigation(), reloadPage.locator('#startup-recovery-retry').click()]);
    await reloadPage.waitForFunction(() => !!App.active);
    ok(await reloadPage.evaluate(() => App.practiceInstrument.get() === 'piano' && App.practiceProgress.history('piano').map(s => s.id).join() === 'original-before-import' && Number(sessionStorage.getItem('test.startup.sw')) === 1 && !document.getElementById('startup-recovery')), 'explicit reload constructs Core and instrument preferences from restored data, then boots and registers offline support once');
    await reloadContext.close();

    console.log('# another tab can finish recovery before startup checks its journal');
    const beforeStartupContext = await browser.newContext({ serviceWorkers: 'block' });
    await beforeStartupContext.addInitScript(({ partial, restored }) => {
      ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
      if (!sessionStorage.getItem('test.before-startup.seeded')) {
        sessionStorage.setItem('test.before-startup.seeded', 'true');
        localStorage.setItem('guitarlab.practice.progress.v1', JSON.stringify(partial));
        localStorage.setItem('guitarlab.learn.instrument', '"guitar"');
        localStorage.setItem('guitarlab.__persistence.journal.v1', JSON.stringify({ version: 1, id: 'other-tab-recovery', state: 'applying', beforeRecords: [
          { key: 'guitarlab.practice.progress.v1', raw: JSON.stringify(restored) },
          { key: 'guitarlab.learn.instrument', raw: '"piano"' }
        ] }));
      }
      navigator.serviceWorker.register = () => { sessionStorage.setItem('test.before-startup.sw', String(Number(sessionStorage.getItem('test.before-startup.sw') || 0) + 1)); return Promise.resolve({}); };
    }, { partial: progressFixture('partial-before-startup'), restored: progressFixture('restored-before-startup') });
    const beforeStartupPage = await beforeStartupContext.newPage();
    let releaseFinalScript;
    const finalScriptWait = new Promise(resolve => { releaseFinalScript = resolve; });
    const delayFinalScript = async route => { await finalScriptWait; await route.continue(); };
    await beforeStartupPage.route('**/js/checkpoint.js', delayFinalScript);
    const loadingBeforeStartup = beforeStartupPage.goto(env.URL);
    await beforeStartupPage.waitForFunction(() => window.App && App.practiceProgress && App.practiceInstrument);
    const preRecovery = await beforeStartupPage.evaluate(() => ({ active: App.active, instrument: App.practiceInstrument.get(), sessions: App.practiceProgress.data.sessions.map(s => s.id) }));
    // Model another tab's completed, verified rollback after this document's
    // modules captured partial data, before its final startup script runs.
    await beforeStartupPage.evaluate(restored => {
      localStorage.setItem('guitarlab.practice.progress.v1', JSON.stringify(restored));
      localStorage.setItem('guitarlab.learn.instrument', '"piano"');
      localStorage.removeItem('guitarlab.__persistence.journal.v1');
    }, progressFixture('restored-before-startup'));
    releaseFinalScript(); await loadingBeforeStartup;
    await beforeStartupPage.waitForSelector('#startup-recovery-title:has-text("Reload saved data")');
    const beforeStartup = await beforeStartupPage.evaluate(() => ({ active: App.active, instrument: App.practiceInstrument.get(), durable: JSON.parse(localStorage.getItem('guitarlab.learn.instrument')), state: App.persistence.status(), registrations: Number(sessionStorage.getItem('test.before-startup.sw') || 0), inert: document.querySelector('.topbar').inert }));
    ok(!preRecovery.active && preRecovery.instrument === 'guitar' && preRecovery.sessions.join() === 'partial-before-startup' && !beforeStartup.active && beforeStartup.instrument === 'guitar' && beforeStartup.durable === 'piano' && beforeStartup.state.needsReload && !beforeStartup.state.recoveryRequired && beforeStartup.registrations === 0 && beforeStartup.inert, 'a journal cleared before startup still blocks stale module snapshots and service-worker registration: ' + JSON.stringify(beforeStartup));
    await beforeStartupPage.unroute('**/js/checkpoint.js', delayFinalScript);
    await Promise.all([beforeStartupPage.waitForNavigation(), beforeStartupPage.locator('#startup-recovery-retry').click()]);
    await beforeStartupPage.waitForFunction(() => !!App.active);
    ok(await beforeStartupPage.evaluate(() => App.practiceInstrument.get() === 'piano' && App.practiceProgress.history('piano').map(s => s.id).join() === 'restored-before-startup' && Number(sessionStorage.getItem('test.before-startup.sw')) === 1 && !document.getElementById('startup-recovery')), 'fresh deliberate reload after another tab finished recovery reads only restored data and registers offline support once');
    await beforeStartupContext.close();
  } finally { await browser.close(); }
  console.log('ALL PASS (' + checks + ' checks; cloud browser only)');
})().catch(error => { console.error('FAIL', error.stack); process.exitCode = 1; });
