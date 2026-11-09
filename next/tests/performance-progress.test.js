// Bounded integration checks: real player + progress core, injected clocks.
// No hardware, microphone, network fixture data or audible app output.
const { chromium } = require('playwright');
const fs = require('fs');
const env = require('./env');
let checks = 0;
function ok(value, message) { if (!value) throw new Error(message); checks++; console.log('  PASS', message); }
const near = (a, b) => Math.abs(a - b) < 0.00001;

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
    await context.addInitScript(() => ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true')));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(env.URL);
    await page.waitForFunction(() => window.PracticeProgress && window.PerformancePlayer && window.Woodshed);
    await page.evaluate(() => {
      window.__time = 0; window.__base = Date.parse('2026-10-23T23:59:59.500Z');
      window.__wall = () => __base + __time * 1000;
      App.practiceProgress = new PracticeProgress({ store: App.store, now: __wall, timezone: () => 'UTC' });
      window.__score = { title: 'Original progress boundary fixture', bpm: 120, len: 64,
        notes: [{ m: 48, t: 0, d: 1 }, { m: 50, t: 32, d: 1 }] };
      window.__change = (id, value) => { const e = document.getElementById(id); e.value = value; e.dispatchEvent(new Event('change')); };
      window.__open = (instrument, mode = 'wait', countIn = 0) => {
        App.switchTo('shed');
        const options = { clock: () => __time, now: __wall, countIn };
        if (instrument) options.instrument = instrument;
        Woodshed.performanceStart(__score, mode, options);
        document.getElementById('pf-sound').checked = false;
      };
      window.__note = (midi, on = true) => PerformancePlayer.note({ midi, on, velocity: on ? 100 : 0, source: 'test', channel: 0 });
      window.__hit = midi => { __note(midi); __note(midi, false); };
      window.__step = seconds => { __time += seconds; PerformancePlayer.tick(); };
      window.__start = () => document.getElementById('pf-start').click();
      window.__stop = () => document.getElementById('pf-stop').click();
      window.__result = instrument => App.practiceProgress.summary(instrument);
    });

    console.log('# failed persistence retains the real observation for export and idempotent retry');
    const failure = await page.evaluate(() => {
      const core = App.practiceProgress;
      core.recordSession({ id: 'existing-record', instrument: 'piano', startedAt: __wall() - 61000, endedAt: __wall() - 1000,
        engagedSeconds: 60, mode: 'wait', status: 'complete', expected: 1, matched: 1, missed: 0, extra: 0, wrong: 0,
        tempo: null, timingSamples: 0, sumAbsTimingMs: 0, sumTimingMs: 0 });
      window.__save = core.store.set.bind(core.store);
      core.store.set = function (key, value) { if (key === PracticeProgress.storageKey) throw new Error('Simulated quota failure'); return __save(key, value); };
      __open('piano'); __start(); __hit(49); __step(1); __stop();
      return { state: __result('piano'), text: document.getElementById('pf-xp').textContent,
        recoverable: !document.getElementById('pf-progress-unsaved').hidden };
    });
    ok(failure.recoverable && /not saved|Retry/.test(failure.text), 'storage failure is visible and offers retry/export instead of claiming saved XP');
    ok(failure.state.sessionCount === 1 && failure.state.lifetimeEarnedXP === 2, 'failed save preserves the previously stored history and award');
    const downloadPromise = page.waitForEvent('download');
    await page.evaluate(() => document.getElementById('pf-progress-export').click());
    const downloaded = await downloadPromise, payload = JSON.parse(fs.readFileSync(await downloaded.path(), 'utf8'));
    ok(payload.unrecordedPracticeSessions.length === 1 && near(payload.unrecordedPracticeSessions[0].engagedSeconds, 1) && payload.unrecordedPracticeSessions[0].extra === 1,
      'unsaved export contains the original measured session, raw counts and stable ID');
    const recovery = await page.evaluate(() => {
      App.practiceProgress.store.set = __save; document.getElementById('pf-progress-retry').click();
      const once = __result('piano');
      document.getElementById('pf-progress-retry').click(); __stop(); __stop(); PerformancePlayer.tick();
      return { once, twice: __result('piano'), hidden: document.getElementById('pf-progress-unsaved').hidden,
        ids: App.practiceProgress.history('piano').map(s => s.id) };
    });
    ok(recovery.hidden && recovery.once.sessionCount === 2 && recovery.once.lifetimeEarnedXP > 2, 'successful retry persists the retained observation and dismisses the warning');
    ok(recovery.twice.sessionCount === 2 && near(recovery.twice.lifetimeEarnedXP, recovery.once.lifetimeEarnedXP) && recovery.ids.includes(payload.unrecordedPracticeSessions[0].id),
      'retry followed by repeated Stop/tick retains the same ID and awards exactly once');

    console.log('# actual measured engagement splits at local midnight without invented note observations');
    const midnight = await page.evaluate(() => {
      // Reset only the new run's injected clock/epoch, using a fresh instrument.
      __base = Date.parse('2026-10-24T23:59:59.500Z'); __time = 0;
      __open('guitar'); __start(); __hit(49); __step(0.75); __stop();
      return { summary: __result('guitar'), history: App.practiceProgress.history('guitar') };
    });
    const record = midnight.history[0];
    ok(midnight.history.length === 1 && near(record.engagedSeconds, 0.75) && record.segments.length === 2 && record.allocation === 'measured-segments',
      'player records two explicit daily buckets when a measured tick crosses midnight');
    ok(record.segments[0].date === '2026-10-24' && record.segments[1].date === '2026-10-25' &&
      near(record.segments[0].engagedSeconds, 0.5) && near(record.segments[1].engagedSeconds, 0.25),
      'binary midnight split conserves the exact observed half-second and quarter-second');
    const rows = midnight.summary.daily.filter(d => d.hasObservation);
    ok(rows.length === 2 && rows[0].extra === 0 && rows[1].extra === 1 && rows.every(d => d.timingSamples === 0 && d.meanAbsTimingMs === null),
      'daily time is measured while raw note counts stay on session-end day and Wait timing remains unknown');

    console.log('# count-in, suspended gaps, held repeats and pause cannot farm time');
    const safeguards = await page.evaluate(() => {
      __open('bass', 'wait', 4); __start(); __hit(49); __step(1); __step(1); __step(1); __stop(); const countin = __result('bass');
      __open('drums'); __start(); __hit(49); __step(60); __step(1); __stop(); const jump = __result('drums');
      __open('voice'); __start(); __note(49);
      for (let i = 0; i < 3; i++) __step(1);
      __note(49); // duplicate held attack must not refresh last activity
      for (let i = 0; i < 3; i++) __step(1);
      __note(49, false); __stop(); const held = __result('voice');
      __open('other'); __start(); __hit(49); __step(1); document.getElementById('pf-pause').click();
      __step(100); document.getElementById('pf-pause').click(); __step(1); __stop(); const paused = __result('other');
      return { countin, jump, held, paused };
    });
    ok(safeguards.countin.sessionCount === 0 && safeguards.countin.lifetimeEarnedXP === 0,
      'attacks during count-in do not activate later idle engagement or XP');
    ok(safeguards.jump.totalEngagedSeconds === 0 && safeguards.jump.lifetimeEarnedXP === 0 && safeguards.jump.extra === 1,
      'a long clock stall creates no earned time but preserves the actual raw mistake');
    ok(near(safeguards.held.totalEngagedSeconds, 5), 'held note repeats cannot extend the five-second fresh-attack engagement window');
    ok(near(safeguards.paused.totalEngagedSeconds, 1), 'pause and resumed inactivity cannot convert paused wall time into practice');

    console.log('# observed tempo and explicit instrument identity survive control changes');
    const tempo = await page.evaluate(() => {
      __open('synth', 'tempo'); __start(); __hit(49); __step(0.5); __step(6);
      __change('pf-tempo', 300); __step(1); __stop();
      const synth = __result('synth'), history = App.practiceProgress.history('synth');
      __open('bass'); __change('pf-tempo', 300); __start(); __hit(49); __step(1); __stop();
      const wait = App.practiceProgress.history('bass').at(-1);
      __change('pf-instrument', 'guitar'); __open();
      return { synth, history, wait, selected: document.getElementById('pf-instrument').value,
        stored: App.store.get('ws.performance.instrument'), guitar: __result('guitar') };
    });
    ok(tempo.history.length === 1 && tempo.history[0].tempo === 120 && tempo.synth.observedTempo.max === 120 && tempo.synth.completedTempo.max === null,
      'unplayed tempo changes cannot inflate observed or completed speed');
    ok(tempo.wait.mode === 'wait' && tempo.wait.tempo === null, 'untimed Wait practice cannot claim an achieved BPM');
    ok(tempo.selected === 'guitar' && tempo.stored === 'guitar' && tempo.guitar.sessionCount === 1,
      'explicit instrument choice persists without reassigning another instrument’s stored session');
    ok(!errors.length, 'no browser runtime errors: ' + errors.join('; '));
    await context.close();
    console.log('ALL PASS (' + checks + ' checks; actual player/core with simulated clocks and storage failure)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
