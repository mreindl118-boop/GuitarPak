// Observed progress, actual controls and player recording in a cloud browser.
// Fresh browser profiles only; clocks/observations are fixtures, no hardware.
const { chromium } = require('playwright');
const fs = require('fs');
const env = require('./env');
let checks = 0;
function ok(value, message) { if (!value) throw new Error(message); checks++; console.log('  PASS', message); }
const near = (a, b, tolerance = 0.00001) => Math.abs(a - b) <= tolerance;
const field = key => '[data-pgu-field="' + key + '"]';
const stat = key => '[data-pgu-stat="' + key + '"]';

(async function () {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  try {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    await context.addInitScript(() => {
      ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(env.URL);
    await page.waitForFunction(() => window.PracticeProgressUI && window.PracticeProgress && window.Woodshed);
    const fixture = await page.evaluate(() => {
      window.__progressBase = Date.now(); window.__progressNow = __progressBase;
      App.practiceProgress = new PracticeProgress({ store: App.store, now: () => __progressNow, timezone: () => 'Etc/UTC', onChange: e => App.emit('practice:progress', e) });
      window.__addProgressFixture = (id, instrument, offset, minutes, expected, matched, extra, tempo, status, timed) => {
        const end = __progressBase - 120000 - offset * 86400000;
        const result = App.practiceProgress.recordSession({ id, instrument, startedAt: end - minutes * 60000, endedAt: end,
          engagedSeconds: minutes * 60, mode: timed ? 'tempo' : 'wait', status, expected, matched,
          missed: expected - matched, extra, wrong: extra, tempo, timingSamples: timed ? matched : 0,
          sumAbsTimingMs: timed ? matched * 20 : 0, sumTimingMs: timed ? matched * 5 : 0 });
        if (!result.ok || !result.accepted) throw new Error('Invalid fixture ' + id + ': ' + JSON.stringify(result));
        return result;
      };
      __addProgressFixture('piano-89', 'piano', 89, 10, 10, 10, 0, 100, 'complete', true);
      __addProgressFixture('piano-29', 'piano', 29, 5, 90, 45, 5, 120, 'complete', true);
      __addProgressFixture('piano-6', 'piano', 6, 10, 10, 8, 1, 110, 'partial', true);
      __addProgressFixture('piano-1', 'piano', 1, 2, 0, 0, 0, 180, 'partial', false);
      __addProgressFixture('piano-0', 'piano', 0, 1, 4, 4, 0, 80, 'complete', false);
      __addProgressFixture('guitar-0', 'guitar', 0, 2, 20, 5, 5, 95, 'complete', false);
      App.switchTo('piano'); App.switchTo('shed');
      return { piano: App.practiceProgress.summary('piano'), guitar: App.practiceProgress.summary('guitar'), data: App.practiceProgress.exportData() };
    });
    await page.waitForSelector('#ws-progress .pgu');
    const ui = page.locator('#ws-progress');
    ok(await ui.locator('[data-pgu="instrument"]').inputValue() === 'piano' && (await ui.locator('[data-pgu="instrument"] option').count()) === 7,
      'the real Woodshed library mounts all seven explicit instrument choices');
    ok((await ui.locator(stat('earned') + ' dd').textContent()) === fixture.piano.lifetimeEarnedXP.toLocaleString('en-US', { maximumFractionDigits: 1 }),
      'lifetime earned XP is read from the persistent ledger');
    ok(near(fixture.piano.accuracy, 67 / 120 * 100) && /55\.8%/.test(await ui.locator(stat('accuracy')).textContent()) && /114 expected \+ 6 extra/.test(await ui.locator(stat('accuracy')).textContent()),
      'accuracy pools raw expected plus extra notes rather than averaging session percentages');
    ok(/20 ms/.test(await ui.locator(stat('timing')).textContent()) && /63 measured onsets/.test(await ui.locator(stat('timing')).textContent()),
      'timing aggregates only the 63 actual timed onsets and does not invent Wait timing');
    ok(/80–180 BPM/.test(await ui.locator(stat('observed-tempo')).textContent()) && /120 BPM/.test(await ui.locator(stat('completed-tempo')).textContent()),
      'observed tempo includes unfinished practice while completed tempo remains distinct');
    ok(/not a measured loss of musical skill/.test(await ui.textContent()) && /not a measured skill level/.test(await ui.locator(stat('consistency')).textContent()),
      'consistency decay is explained without claiming measured skill loss');

    for (const [days, rows] of [[7, 3], [30, 4], [90, 5]]) {
      await ui.locator('[data-pgu-days="' + days + '"]').click();
      const result = await ui.evaluate(root => ({ rows: root.querySelectorAll('tbody tr').length,
        desc: root.querySelector('svg desc').textContent, summary: root.querySelector('[data-pgu="range-summary"]').textContent,
        rects: root.querySelectorAll('svg rect').length, caption: root.querySelector('caption').textContent,
        active: root.querySelector('[aria-pressed="true"]').textContent }));
      ok(result.rows === rows && result.rects === rows && result.desc.includes(rows + ' of ' + days + ' days') && result.active.includes(days) && result.caption.includes(days),
        days + '-day chart and accessible table contain observed dates only');
      ok(/engaged minutes/.test(result.summary) && /raw accuracy/.test(result.summary), days + '-day summary reports real range minutes and pooled accuracy');
    }
    await ui.locator('[data-pgu="instrument"]').selectOption('guitar');
    ok(/—/.test(await ui.locator(stat('timing') + ' dd').textContent()) && /20 expected \+ 5 extra/.test(await ui.locator(stat('accuracy')).textContent()) && (await ui.locator('tbody tr').count()) === 1,
      'guitar has its own raw accuracy and unknown timing instead of piano observations');
    await ui.locator('[data-pgu="instrument"]').selectOption('synth');
    ok((await ui.locator('[data-pgu="chart"]').textContent()).includes('No recorded practice observations') && (await ui.locator('table').count()) === 0 && (await ui.locator(stat('accuracy') + ' dd').textContent()) === '—',
      'an unobserved instrument displays no fabricated chart points or performance metrics');
    await ui.locator('[data-pgu="instrument"]').selectOption('piano');
    await ui.locator('[data-pgu="settings"] summary').click();
    const before = await page.evaluate(() => App.practiceProgress.exportData());
    await ui.locator(field('dailyMinutes')).fill('-1');
    await ui.locator('button[type="submit"]').click();
    ok(await ui.locator('[data-pgu="errors"]').isVisible() && await page.evaluate(() => App.practiceProgress.getSettings().dailyMinutes) === 10,
      'negative settings fail visibly and preserve the prior persisted settings');
    await ui.locator(field('dailyMinutes')).fill('');
    await ui.locator('button[type="submit"]').click();
    ok(/finite number/.test(await ui.locator('[data-pgu="errors"]').textContent()), 'empty numeric settings are rejected before NaN can enter storage');
    await ui.locator(field('dailyMinutes')).fill('5');
    await ui.locator(field('timezone')).fill('Mars/Unknown');
    await ui.locator('button[type="submit"]').click();
    ok(/IANA/.test(await ui.locator('[data-pgu="errors"]').textContent()) && await page.evaluate(() => App.practiceProgress.getSettings().dailyMinutes) === 10,
      'an invalid timezone rejects the entire settings patch atomically');
    await ui.locator(field('timezone')).fill('America/New_York');
    await ui.locator(field('xpPerMinute')).fill('3.5');
    await ui.locator(field('graceDays')).fill('2');
    await ui.locator(field('decayPercent')).fill('4');
    await ui.locator(field('decayDailyCap')).fill('5');
    await ui.locator(field('decayFloor')).fill('1');
    await ui.locator(field('streakBonusPercent')).fill('10');
    await ui.locator(field('streakBonusCapPercent')).fill('30');
    await ui.locator(field('xpPerCorrectNote')).fill('0.1');
    await ui.locator(field('correctNoteXPCap')).fill('20');
    await ui.locator(field('xpPerLevel')).fill('50');
    await ui.locator(field('decayEnabled')).uncheck();
    await ui.locator('button[type="submit"]').click();
    const saved = await page.evaluate(() => App.practiceProgress.exportData());
    ok(!await ui.locator('[data-pgu="errors"]').isVisible() && saved.settings.dailyMinutes === 5 && saved.settings.xpPerMinute === 3.5 && saved.settings.timezone === 'America/New_York' && saved.settings.decayEnabled === false,
      'valid goal, rate, timezone and pause-decay settings persist through actual controls');
    ok(saved.settings.graceDays === 2 && saved.settings.decayPercent === 4 && saved.settings.decayDailyCap === 5 && saved.settings.decayFloor === 1 && saved.settings.streakBonusCapPercent === 30 && saved.settings.correctNoteXPCap === 20 && saved.settings.xpPerLevel === 50,
      'bounded bonus, correct-note cap and consistency parameters are editable');
    ok(JSON.stringify(before.sessions) === JSON.stringify(saved.sessions) && before.ledgers.piano.lifetimeEarnedXP === saved.ledgers.piano.lifetimeEarnedXP,
      'settings changes preserve historical sessions, award snapshots and lifetime earnings');
    // An update event must not erase an unsaved field while the user is typing.
    await ui.locator(field('dailyMinutes')).fill('7');
    await page.evaluate(() => __addProgressFixture('voice-event', 'voice', 0, 1, 0, 0, 0, null, 'partial', false));
    ok(await ui.locator(field('dailyMinutes')).inputValue() === '7' && await page.evaluate(() => App.practiceProgress.getSettings().dailyMinutes) === 5,
      'incoming progress events preserve unsaved settings edits');
    await ui.locator('button[type="submit"]').click();
    const dates = await page.evaluate(() => {
      const today = App.practiceProgress.dayKey(__progressNow);
      const add = n => new Date(Date.parse(today + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
      return { from: add(1), to: add(3) };
    });
    await ui.locator('[data-pgu="vacation-from"]').fill(dates.to);
    await ui.locator('[data-pgu="vacation-to"]').fill(dates.from);
    await ui.locator('[data-pgu="vacation-add"]').click();
    ok(await ui.locator('[data-pgu="errors"]').isVisible() && await page.evaluate(() => App.practiceProgress.getSettings().vacations.length) === 0,
      'reversed vacation dates fail without mutating progress');
    await ui.locator('[data-pgu="vacation-from"]').fill(dates.from);
    await ui.locator('[data-pgu="vacation-to"]').fill(dates.to);
    await ui.locator('[data-pgu="vacation-add"]').click();
    ok((await ui.locator('[data-pgu="vacations"]').textContent()).includes(dates.from + ' through ' + dates.to), 'inclusive planned breaks are stored and visible');
    await ui.locator('[data-pgu="vacation-clear"]').click();
    ok(await page.evaluate(() => App.practiceProgress.getSettings().vacations.length) === 0 && await page.evaluate(() => App.practiceProgress.history('piano').length) === 5,
      'clearing vacation settings leaves all practice observations intact');

    const downloadPromise = page.waitForEvent('download');
    await ui.locator('[data-pgu="export"]').click();
    const download = await downloadPromise;
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    ok(download.suggestedFilename() === 'soundlab-practice-progress.json' && exported.version === 1 && exported.sessions.length === 7 && exported.ledgers.guitar && exported.settings.dailyMinutes === 7,
      'JSON export downloads all instrument observations, settings and ledgers');
    await ui.locator('[data-pgu="instrument"]').selectOption('guitar');
    await page.reload();
    await page.waitForFunction(() => window.PracticeProgressUI && App.practiceProgress);
    await page.evaluate(() => App.switchTo('shed'));
    await page.waitForSelector('#ws-progress .pgu');
    ok(await ui.locator('[data-pgu="instrument"]').inputValue() === 'guitar' && await ui.locator('[data-pgu-days="90"]').getAttribute('aria-pressed') === 'true' && await page.evaluate(() => App.practiceProgress.history('piano').length) === 5,
      'instrument, date range, settings and recorded history survive a real reload');
    await ui.locator('[data-pgu="settings"] summary').click();
    ok(await ui.locator(field('dailyMinutes')).inputValue() === '7' && await ui.locator(field('timezone')).inputValue() === 'America/New_York' && !await ui.locator(field('decayEnabled')).isChecked(),
      'persisted configuration restores through the real panel');
    const decay = await page.evaluate(() => {
      window.__progressNow = Date.now();
      App.practiceProgress = new PracticeProgress({ store: App.store, now: () => __progressNow, onChange: e => App.emit('practice:progress', e) });
      App.practiceProgress.updateSettings({ decayEnabled: true });
      App.switchTo('piano'); App.switchTo('shed');
      const before = App.practiceProgress.summary('guitar');
      __progressNow += 15 * 86400000; const after = App.practiceProgress.summary('guitar');
      return { before, after };
    });
    ok(decay.after.currentXP < decay.before.currentXP && near(decay.after.lifetimeEarnedXP, decay.before.lifetimeEarnedXP) &&
      (await ui.locator(stat('earned') + ' dd').textContent()) === decay.before.lifetimeEarnedXP.toLocaleString('en-US', { maximumFractionDigits: 1 }),
      'inactivity updates the current consistency balance while lifetime earnings remain visible and immutable');
    await page.setViewportSize({ width: 390, height: 844 });
    const accessible = await ui.evaluate(root => ({
      overflows: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      controls: root.querySelector('[data-pgu="instrument"]').getAttribute('aria-label'),
      goal: root.querySelector('progress').id,
      labelled: !!root.querySelector('label[for="' + root.querySelector('progress').id + '"]'),
      noBadNumbers: !/NaN|Infinity/.test(root.textContent), noReset: !Array.from(root.querySelectorAll('button')).some(b => /reset|import/i.test(b.textContent))
    }));
    ok(!accessible.overflows && accessible.controls && accessible.labelled && accessible.noBadNumbers && accessible.noReset,
      'mobile layout keeps page width bounded and exposes labeled controls without reset/import actions');
    await context.close();

    console.log('# actual player engagement and XP');
    const playerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await playerContext.addInitScript(() => ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true')));
    const player = await playerContext.newPage(); player.on('pageerror', e => errors.push(e.message));
    await player.goto(env.URL);
    await player.waitForFunction(() => window.PracticeProgress && window.PerformancePlayer && window.Woodshed);
    await player.evaluate(() => {
      window.__xpEpoch = Date.now(); window.__xpAt = 0;
      App.practiceProgress = new PracticeProgress({ store: App.store, now: () => __xpEpoch + __xpAt * 1000, timezone: () => 'Etc/UTC', onChange: e => App.emit('practice:progress', e) });
      window.__xpScore = { title: 'Original progress browser fixture', bpm: 120, len: 6,
        notes: [48, 50, 52, 53, 55, 57].map((m, i) => ({ m, t: i, d: 1, v: 90 })) };
      window.__xpOpen = instrument => { App.switchTo('shed'); Woodshed.performanceStart(__xpScore, 'wait', { clock: () => __xpAt, now: () => __xpEpoch + __xpAt * 1000, countIn: 0, instrument }); };
      window.__xpAdvance = seconds => { for (let i = 0; i < seconds; i++) { __xpAt++; PerformancePlayer.tick(); } };
      window.__xpPress = midi => { PerformancePlayer.note({ midi, on: true, velocity: 90, source: 'test', channel: 0 }); PerformancePlayer.note({ midi, on: false, velocity: 0, source: 'test', channel: 0 }); };
      __xpOpen('piano');
    });
    await player.selectOption('#pf-instrument', 'synth');
    await player.click('#pf-start');
    ok(await player.locator('#pf-instrument').isDisabled(), 'an active run locks its explicit recording instrument');
    const idle = await player.evaluate(() => { __xpAdvance(8); document.getElementById('pf-stop').click(); return App.practiceProgress.summary('synth'); });
    ok(idle.lifetimeEarnedXP === 0 && idle.totalEngagedSeconds === 0 && idle.sessionCount === 0,
      'an idle Wait screen earns no engaged time or XP');
    const completed = await player.evaluate(() => {
      __xpOpen('piano'); const selector = document.getElementById('pf-instrument'); selector.value = 'synth'; selector.dispatchEvent(new Event('change'));
      document.getElementById('pf-start').click();
      __xpScore.notes.forEach((n, i) => { if (i) __xpAdvance(1); __xpPress(n.m); });
      PerformancePlayer.tick();
      return { state: PerformancePlayer.snapshot(), synth: App.practiceProgress.summary('synth'), piano: App.practiceProgress.summary('piano'), history: App.practiceProgress.history('synth') };
    });
    ok(completed.state.status === 'complete' && completed.synth.sessionCount === 1 && completed.synth.lifetimeEarnedXP > 0 && completed.synth.totalEngagedSeconds === 5,
      'completing the actual player records measured engaged seconds and earned XP');
    ok(completed.synth.matched === 6 && completed.synth.expected === 6 && completed.synth.timingSamples === 0 && completed.piano.sessionCount === 0 && completed.history[0].instrument === 'synth',
      'actual completion credits only the selected synth instrument with raw counts and no invented Wait timing');
    const repeated = await player.evaluate(() => { PerformancePlayer.tick(); document.getElementById('pf-stop').click(); PerformancePlayer.tick(); return App.practiceProgress.summary('synth'); });
    ok(repeated.sessionCount === 1 && near(repeated.lifetimeEarnedXP, completed.synth.lifetimeEarnedXP), 'completion followed by repeated tick/Stop cannot award the same run twice');
    const paused = await player.evaluate(() => {
      __xpOpen('guitar'); document.getElementById('pf-start').click(); __xpPress(48); __xpAdvance(1);
      document.getElementById('pf-pause').click(); __xpAdvance(10);
      const frozen = PerformancePlayer.snapshot(); document.getElementById('pf-start').click(); __xpAdvance(6);
      document.getElementById('pf-stop').click();
      return { frozen, guitar: App.practiceProgress.summary('guitar'), synth: App.practiceProgress.summary('synth') };
    });
    ok(paused.frozen.status === 'paused' && paused.guitar.sessionCount === 1 && paused.guitar.totalEngagedSeconds === 1 && near(paused.synth.lifetimeEarnedXP, completed.synth.lifetimeEarnedXP),
      'pause and resumed inactivity add no engagement, while stopped partial work stays isolated by instrument');
    await player.click('#pf-back');
    await player.waitForSelector('#ws-progress .pgu');
    await player.locator('#ws-progress [data-pgu="instrument"]').selectOption('synth');
    ok((await player.locator('#ws-progress ' + stat('earned') + ' dd').textContent()) === completed.synth.lifetimeEarnedXP.toLocaleString('en-US', { maximumFractionDigits: 1 }) && await player.locator('#ws-progress tbody tr').count() === 1,
      'returning to the actual library displays the newly recorded session without manual refresh');
    ok(errors.length === 0, 'progress and player flows produce no browser exceptions');
    console.log('PASS ' + checks + ' practice progress UI checks');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
