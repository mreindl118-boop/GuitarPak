// Real browser session boundaries with generated scores and deterministic clocks.
// No hardware, microphone, audible output or external fixture data is required.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const env = require('./env');
let checks = 0;
const evidence = { scope: 'Cloud simulation: real PerformancePlayer and PracticeProgress, synthetic note input and clock', checkpoints: [] };
function ok(value, message) { if (!value) throw new Error(message); checks++; console.log('  PASS', message); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript(() => {
      ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
      window.__deviceCalls = { midi: 0, audio: 0 };
      navigator.requestMIDIAccess = () => { __deviceCalls.midi++; return Promise.reject(new Error('Hardware unavailable in this simulation')); };
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => { __deviceCalls.audio++; return Promise.reject(new Error('Microphone unavailable in this simulation')); };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(env.URL);
    await page.waitForFunction(() => window.PerformancePlayer && window.Woodshed && window.PracticeProgress && App.practiceInstrument);
    await page.evaluate(() => {
      window.__time = 0;
      window.__wall = () => Date.parse('2026-10-23T12:00:00Z') + __time * 1000;
      localStorage.removeItem('guitarlab.' + PracticeProgress.storageKey);
      App.practiceProgress = new PracticeProgress({ store: App.store, now: __wall, timezone: () => 'UTC' });
      window.__submissions = [];
      const record = App.practiceProgress.recordSession.bind(App.practiceProgress);
      App.practiceProgress.recordSession = input => { __submissions.push(JSON.parse(JSON.stringify(input))); return record(input); };
      window.__long = { title: 'Original shared instrument boundary study', instrument: 'piano', bpm: 120, len: 64,
        notes: [{ m: 60, t: 0, d: 1 }, { m: 62, t: 32, d: 1 }] };
      window.__short = { title: 'Original shared two-note cadence', instrument: 'piano', bpm: 120, len: 2,
        notes: [{ m: 60, t: 0, d: 1 }, { m: 62, t: 1, d: 1 }] };
      window.__click = id => document.getElementById(id).click();
      window.__change = (id, value) => { const element = document.getElementById(id); element.value = value; element.dispatchEvent(new Event('change')); };
      window.__open = (score = __long) => {
        App.switchTo('shed');
        Woodshed.performanceStart(score, 'wait', { clock: () => __time, now: __wall, countIn: 0, inputKind: 'midi' });
        document.getElementById('pf-sound').checked = false;
      };
      window.__note = (midi, on = true) => PerformancePlayer.note({ midi, on, velocity: on ? 100 : 0, source: 'test', channel: 0 });
      window.__hit = midi => { __note(midi); __note(midi, false); };
      window.__step = seconds => { __time += seconds; PerformancePlayer.tick(); };
      window.__engage = () => { __hit(61); __step(0.5); __step(0.5); };
      window.__totals = () => Object.fromEntries(App.practiceInstrument.instruments.map(id => {
        const summary = App.practiceProgress.summary(id);
        return [id, { sessions: summary.sessionCount, xp: summary.lifetimeEarnedXP, seconds: summary.totalEngagedSeconds,
          matched: summary.matched, extra: summary.extra }];
      }));
      window.__view = () => ({ state: PerformancePlayer.snapshot(), selected: App.practiceInstrument.current,
        control: document.getElementById('pf-instrument').value, disabled: document.getElementById('pf-instrument').disabled,
        sessions: App.practiceProgress.exportData().sessions, totals: __totals() });
    });

    console.log('# instrument identity is captured at Start, rather than inferred from shared source content');
    const ready = await page.evaluate(() => {
      App.practiceInstrument.set('guitar'); __open();
      const before = __view(); App.practiceInstrument.set('bass'); const selected = __view();
      __click('pf-start'); const running = __view();
      return { before, selected, running };
    });
    ok(ready.before.state.practice == null && ready.before.sessions.length === 0, 'opening shared content creates no session or award');
    ok(ready.before.control === 'guitar' && ready.selected.control === 'bass', 'idle player follows the explicit Learn instrument instead of score metadata');
    ok(ready.running.state.practice && ready.running.state.practice.instrument === 'bass' && ready.running.state.practice.id,
      'Start exposes a stable session ID and snapshots the instrument selected at that moment');
    ok(ready.running.disabled && ready.running.state.status === 'running', 'running session disables its instrument selector');
    const first = ready.running.state.practice.id;
    evidence.checkpoints.push({ name: 'start', view: ready.running });

    console.log('# changing instruments ends the old running or paused session before accepting a new identity');
    const switched = await page.evaluate(() => {
      __engage(); App.practiceInstrument.set('piano'); const runningSwitch = __view();
      __click('pf-start'); const next = __view(); __engage(); __click('pf-pause'); const paused = __view();
      __step(10); App.practiceInstrument.set('synth'); const pausedSwitch = __view();
      __click('pf-start'); const synth = __view(); __engage(); __click('pf-pause'); __step(10);
      __click('pf-pause'); const resumed = __view(); __engage(); __click('pf-stop'); const stopped = __view();
      __click('pf-stop'); PerformancePlayer.tick(); const repeated = __view();
      return { runningSwitch, next, paused, pausedSwitch, synth, resumed, stopped, repeated };
    });
    ok(switched.runningSwitch.selected === 'piano' && switched.runningSwitch.state.status === 'stopped' && switched.runningSwitch.state.practice.id === first && switched.runningSwitch.state.practice.instrument === 'bass' && switched.runningSwitch.state.practice.recorded,
      'global switch stops and records the original running bass ID before selecting Piano');
    ok(switched.runningSwitch.sessions.length === 1 && switched.runningSwitch.sessions[0].instrument === 'bass' && switched.runningSwitch.sessions[0].engagedSeconds === 1 && switched.runningSwitch.totals.piano.sessions === 0,
      'switching credits only the bass time actually played, with no automatic Piano run');
    const second = switched.next.state.practice.id, third = switched.synth.state.practice.id;
    ok(switched.next.state.practice.instrument === 'piano' && second !== first && switched.paused.state.status === 'paused' && switched.paused.disabled,
      'a deliberate next Start creates a new Piano ID and disables instrument changes while paused');
    ok(switched.pausedSwitch.state.status === 'stopped' && switched.pausedSwitch.state.practice.id === second && switched.pausedSwitch.state.practice.instrument === 'piano' && switched.pausedSwitch.sessions[1].engagedSeconds === 1,
      'changing a paused session records its original Piano identity and excludes paused time');
    ok(switched.synth.state.practice.instrument === 'synth' && third !== second && switched.resumed.state.status === 'running' && switched.resumed.state.practice.id === third,
      'a fresh Synth session preserves its identity through ordinary pause and resume');
    ok(switched.stopped.sessions.length === 3 && switched.stopped.sessions[2].id === third && switched.stopped.sessions[2].instrument === 'synth' && switched.stopped.sessions[2].engagedSeconds === 2,
      'Stop records only the two engaged seconds of the Synth session');
    ok(same(switched.stopped.sessions, switched.repeated.sessions) && same(switched.stopped.totals, switched.repeated.totals),
      'repeated Stop and tick cannot duplicate the record or XP');
    evidence.checkpoints.push({ name: 'global-switch-running-paused-stop', view: switched.stopped });

    console.log('# results and restart preserve old history while creating a genuinely new run');
    const restarted = await page.evaluate(() => {
      const historical = JSON.stringify(App.practiceProgress.exportData().sessions);
      __change('pf-instrument', 'guitar'); const selected = __view();
      __click('pf-again'); const next = __view(); __engage();
      __click('pf-restart'); const restart = __view();
      __engage(); __click('pf-stop'); App.practiceInstrument.set('voice'); __click('pf-again'); const voice = __view();
      __engage(); __click('pf-stop'); const end = __view();
      return { historical, selected, next, restart, voice, end };
    });
    ok(restarted.selected.selected === 'guitar' && restarted.selected.control === 'guitar', 'explicit result-screen instrument selection updates the shared Learn choice');
    ok(restarted.next.state.practice.instrument === 'guitar' && restarted.next.state.practice.id !== first,
      'Play again starts a new ID using the newly selected instrument');
    const fourth = restarted.next.state.practice.id, fifth = restarted.restart.state.practice.id;
    ok(restarted.restart.state.practice.instrument === 'guitar' && fifth !== fourth && fifth !== first,
      'Restart ends the previous run and creates a fresh session even for the same instrument');
    ok(restarted.restart.sessions.length === 4 && restarted.restart.sessions[3].id === fourth && restarted.restart.sessions[3].instrument === 'guitar',
      'restarting records the stopped guitar attempt once before starting the next attempt');
    ok(restarted.voice.state.practice.instrument === 'voice' && restarted.end.sessions.length === 6 && restarted.end.sessions[5].id === restarted.voice.state.practice.id && restarted.end.sessions[5].instrument === 'voice',
      'selecting Voice after the results creates a separate deliberate run and independent record');
    ok(JSON.stringify(restarted.end.sessions.slice(0, 3)) === restarted.historical,
      'instrument changes and replay leave the earlier history object and award unchanged');
    evidence.checkpoints.push({ name: 'results-restart', view: restarted.end });

    console.log('# leaving and returning pauses a session without reassigning or awarding it');
    const navigation = await page.evaluate(() => {
      App.practiceInstrument.set('drums'); __open(); __click('pf-start'); __engage(); const before = __view();
      App.switchTo('quiz'); __step(20);
      const hidden = { state: PerformancePlayer.snapshot(), sessions: App.practiceProgress.exportData().sessions };
      App.switchTo('shed'); const returned = __view(); __click('pf-pause'); __engage(); __click('pf-stop'); const stopped = __view();
      __click('pf-again'); __engage(); const secondRun = __view(); App.switchTo('quiz'); App.practiceInstrument.set('other'); __step(20); App.switchTo('shed'); const changedHidden = __view();
      return { before, hidden, returned, stopped, secondRun, changedHidden };
    });
    const seventh = navigation.before.state.practice.id;
    ok(navigation.hidden.state.status === 'paused' && navigation.hidden.state.practice.id === seventh && navigation.hidden.state.practice.instrument === 'drums',
      'tab navigation pauses the same drum session and freezes its credit identity');
    ok(navigation.hidden.sessions.length === 6 && navigation.returned.sessions.length === 6,
      'hiding and returning do not finalize or auto-award an active session');
    ok(navigation.returned.state.status === 'paused' && navigation.returned.state.practice.id === seventh && navigation.returned.selected === 'drums',
      'returning shows the paused original session ready to resume');
    ok(navigation.stopped.sessions.length === 7 && navigation.stopped.sessions[6].id === seventh && navigation.stopped.sessions[6].instrument === 'drums' && navigation.stopped.sessions[6].engagedSeconds === 2,
      'resume after navigation records only played time for drums, excluding hidden time');
    ok(navigation.changedHidden.state.status === 'stopped' && navigation.changedHidden.state.practice.id === navigation.secondRun.state.practice.id && navigation.changedHidden.sessions.length === 8 && navigation.changedHidden.sessions[7].instrument === 'drums',
      'changing the category while hidden stops and records the paused old instrument before return');
    ok(navigation.changedHidden.selected === 'other' && navigation.changedHidden.totals.other.sessions === 0,
      'the selected Other instrument receives no prior drum credit or automatic run');
    evidence.checkpoints.push({ name: 'hide-return', view: navigation.changedHidden });

    console.log('# completed shared exercises award one identity and never duplicate on result review');
    const completed = await page.evaluate(() => {
      App.practiceInstrument.set('piano'); __open(__short); __click('pf-start'); __engage(); __hit(60); __hit(62); const result = __view();
      App.practiceInstrument.set('synth'); PerformancePlayer.tick(); PerformancePlayer.hide(); App.switchTo('quiz'); App.switchTo('shed'); __click('pf-stop');
      const reviewed = __view(); __click('pf-again'); const replay = __view(); __click('pf-stop'); const idleStop = __view();
      return { result, reviewed, replay, idleStop };
    });
    ok(completed.result.state.status === 'complete' && completed.result.state.practice.recorded && completed.result.sessions.length === 9,
      'finishing a generated shared exercise records exactly one completed session');
    const ninth = completed.result.state.practice.id;
    ok(completed.result.sessions[8].id === ninth && completed.result.sessions[8].instrument === 'piano' && completed.result.sessions[8].status === 'complete' && completed.result.sessions[8].matched === 2,
      'completed notes and accuracy belong to the instrument captured at Start');
    ok(same(completed.result.sessions, completed.reviewed.sessions) && same(completed.result.totals, completed.reviewed.totals),
      'switching instruments, hiding and reviewing results cannot award shared content again');
    ok(completed.replay.state.practice.instrument === 'synth' && completed.replay.state.practice.id !== ninth,
      'a deliberate new replay uses Synth with a fresh session ID');
    ok(completed.idleStop.sessions.length === 9 && completed.idleStop.totals.synth.sessions === 1,
      'starting then stopping an untouched replay invents no practice or completion');
    evidence.checkpoints.push({ name: 'complete-shared-content', view: completed.idleStop });

    console.log('# disabled controls and public snapshots cannot reassign an active session');
    const guarded = await page.evaluate(() => {
      App.practiceInstrument.set('other'); __open(); __click('pf-start'); const original = __view();
      const copy = PerformancePlayer.snapshot();
      try { copy.practice.instrument = 'piano'; copy.practice.id = 'forged-id'; } catch (_) { /* Frozen snapshots may reject writes. */ }
      const untouched = __view(); __engage(); __change('pf-instrument', 'guitar'); const switched = __view();
      __click('pf-stop'); __click('pf-stop'); const repeated = __view();
      return { original, untouched, switched, repeated };
    });
    ok(guarded.original.state.practice.instrument === 'other' && guarded.untouched.state.practice.id === guarded.original.state.practice.id && guarded.untouched.state.practice.instrument === 'other',
      'mutating a public snapshot cannot change the authoritative session instrument or ID');
    ok(guarded.switched.state.status === 'stopped' && guarded.switched.selected === 'guitar' && guarded.switched.state.practice.instrument === 'other' && guarded.switched.state.practice.recorded,
      'programmatic change on the disabled selector ends the original run before accepting a different instrument');
    ok(guarded.switched.sessions.length === 10 && guarded.switched.sessions[9].instrument === 'other' && guarded.switched.sessions[9].id === guarded.original.state.practice.id && same(guarded.switched.sessions, guarded.repeated.sessions),
      'the guarded change records Other once with its original ID and does not invent Guitar practice');
    evidence.checkpoints.push({ name: 'disabled-control-and-snapshot-guard', view: guarded.switched });

    console.log('# authoritative IDs prevent cross-instrument replay and survive reload');
    const duplicate = await page.evaluate(() => {
      const before = __totals(), sessions = App.practiceProgress.exportData().sessions;
      const original = sessions[0]; const altered = Object.assign({}, original, { instrument: 'other', engagedSeconds: 600, matched: 500 });
      const response = App.practiceProgress.recordSession(altered);
      return { before, after: __totals(), response, sessions: App.practiceProgress.exportData().sessions, submissions: __submissions, selected: App.practiceInstrument.current, calls: __deviceCalls };
    });
    ok(duplicate.response.ok && duplicate.response.duplicate && duplicate.response.accepted === false && duplicate.response.session.instrument === 'bass' && duplicate.response.session.id === first,
      'reusing an existing ID with another instrument returns the authoritative original session');
    ok(same(duplicate.before, duplicate.after) && duplicate.sessions.length === 10 && new Set(duplicate.sessions.map(session => session.id)).size === 10,
      'cross-instrument duplicate submissions cannot change totals, awards or record identity');
    ok(Object.keys(duplicate.before).length === 7 && Object.values(duplicate.before).every(total => total.sessions > 0) && Object.values(duplicate.before).reduce((sum, total) => sum + total.sessions, 0) === 10,
      'all seven instrument categories retain separate observed sessions without lost or duplicated credit');
    await page.reload();
    await page.waitForFunction(() => window.PracticeProgress && App.practiceProgress && App.practiceInstrument);
    const persisted = await page.evaluate(() => ({ sessions: App.practiceProgress.exportData().sessions, instrument: App.practiceInstrument.current, calls: __deviceCalls }));
    ok(same(persisted.sessions, duplicate.sessions) && persisted.instrument === 'guitar', 'reloading preserves selected instrument and the unchanged session ledger');
    ok(duplicate.calls.midi === 0 && duplicate.calls.audio === 0 && persisted.calls.midi === 0 && persisted.calls.audio === 0,
      'verification makes no hardware or microphone permission requests before or after reload');
    ok(errors.length === 0, 'no browser runtime errors: ' + errors.join('; '));
    evidence.checkpoints.push({ name: 'persisted', sessions: persisted.sessions, totals: duplicate.after, submissions: duplicate.submissions });
    evidence.checks = checks;
    if (process.env.SL_INSTRUMENT_EVIDENCE) {
      fs.mkdirSync(path.dirname(process.env.SL_INSTRUMENT_EVIDENCE), { recursive: true });
      fs.writeFileSync(process.env.SL_INSTRUMENT_EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');
    }
    await context.close();
    console.log('ALL PASS (' + checks + ' checks; actual browser session identity, instrument switches and persistent credit)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
