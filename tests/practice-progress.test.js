// Deterministic persistence/calendar/XP tests. No browser, wall-clock waits,
// historical app-data migration, MIDI, hardware or network access.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const Progress = require('../js/practice-progress');
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; console.log('  PASS', message); }
function eq(a, b, message) { assert.deepStrictEqual(a, b, message); checks++; console.log('  PASS', message); }
function near(a, b, message) { ok(Math.abs(a - b) < 0.00001, message + ` (${a})`); }
function memory() { const values = {}; return { values, get(k, fallback) { return Object.hasOwn(values, k) ? structuredClone(values[k]) : fallback; }, set(k, v) { values[k] = structuredClone(v); } }; }
function fixture(iso = '2026-10-19T12:00:00Z', zone = 'UTC', store = memory()) {
  let time = Date.parse(iso), serial = 0;
  const events = [], core = new Progress({ store, now: () => time, timezone: () => zone, onChange: e => events.push(e) });
  return { core, store, events, at(iso) { time = Date.parse(iso); },
    session(patch = {}) { return Object.assign({ id: 's-' + (++serial), instrument: 'piano', startedAt: time - 600000, endedAt: time,
      engagedSeconds: 600, mode: 'tempo', status: 'complete', expected: 10, matched: 8, missed: 2, extra: 1, wrong: 1,
      tempo: 100, timingSamples: 8, sumAbsTimingMs: 160, sumTimingMs: 40 }, patch); },
    record(patch = {}) { return core.recordSession(this.session(patch)); }, get now() { return time; } };
}

console.log('# explicit instruments, immutable awards and idempotent persistence');
{
  const f = fixture(), s = f.session();
  eq(f.core.instruments, ['piano', 'synth', 'guitar', 'bass', 'drums', 'voice', 'other'], 'stable explicit instrument IDs');
  ok(f.core.recordSession(s).accepted, 'observed session is accepted');
  const first = f.core.summary('piano');
  eq([first.lifetimeEarnedXP, first.currentXP, first.level], [20, 20, 1], 'ten observed minutes earn default20 XP');
  eq(first.currentStreak, 1, 'daily threshold earns one practiced day');
  near(first.accuracy, 8 / 11 * 100, 'raw accuracy uses expected plus extra');
  eq([first.meanAbsTimingMs, first.meanTimingMs, first.timingSamples], [20, 5, 8], 'timing averages use actual samples');
  const duplicate = f.core.recordSession(Object.assign({}, s, { instrument: 'guitar', matched: 10 }));
  ok(duplicate.duplicate && !duplicate.accepted, 'same ID across instruments cannot award twice');
  eq(f.core.summary('guitar').lifetimeEarnedXP, 0, 'duplicate never guesses another instrument');
  eq(f.core.history('piano').length, 1, 'duplicate does not append history');
  const reloaded = new Progress({ store: f.store, now: () => f.now, timezone: () => 'America/New_York' });
  ok(reloaded.recordSession(s).duplicate, 'reload and repeated completion remain idempotent');
  eq(reloaded.summary('piano').lifetimeEarnedXP, 20, 'stored award survives reload unchanged');
  const history = reloaded.history('piano'), settings = reloaded.getSettings(), exported = reloaded.exportData();
  history[0].earnedXP = 999; history[0].award.settings.xpPerMinute = 999; settings.vacations.push({ from: '2026-10-01', to: '2026-10-31' });
  exported.ledgers.piano.lifetimeEarnedXP = 0;
  eq(reloaded.history('piano')[0].earnedXP, 20, 'returned nested records cannot mutate immutable awards');
  eq(reloaded.getSettings().vacations, [], 'returned settings cannot mutate vacations');
  eq(reloaded.summary('piano').lifetimeEarnedXP, 20, 'export returns a detached copy');
  ok(f.events.some(e => e.type === 'record'), 'persisted observations publish progress events');
}

console.log('# observed engagement, zero/unknown data and weighted metrics');
{
  const f = fixture();
  f.record({ expected: 1, matched: 1, missed: 0, extra: 0, wrong: 0, timingSamples: 1, sumAbsTimingMs: 100, sumTimingMs: -100, tempo: 90 });
  f.record({ expected: 100, matched: 50, missed: 50, extra: 20, wrong: 10, timingSamples: 50, sumAbsTimingMs: 1000, sumTimingMs: 500, tempo: 150, status: 'partial' });
  const s = f.core.summary('piano');
  near(s.accuracy, 51 / 121 * 100, 'accuracy is weighted raw counts, not a mean of percentages');
  near(s.meanAbsTimingMs, 1100 / 51, 'timing weights sample counts rather than sessions');
  eq([s.observedTempo.max, s.completedTempo.max], [150, 90], 'observed tempo is separate from completed-run tempo');
  const wait = fixture();
  wait.record({ mode: 'wait', timingSamples: 0, sumAbsTimingMs: 0, sumTimingMs: 0 });
  eq([wait.core.summary('piano').meanAbsTimingMs, wait.core.summary('piano').meanTimingMs], [null, null], 'Wait timing remains unknown rather than invented zero milliseconds');
  const empty = fixture();
  empty.core.updateSettings({ xpPerCorrectNote: 10 });
  empty.record({ startedAt: empty.now, engagedSeconds: 0, timingSamples: 0, sumAbsTimingMs: 0, sumTimingMs: 0 });
  eq([empty.core.summary('piano').currentXP, empty.core.summary('piano').currentStreak], [0, 0], 'zero engagement awards neither XP nor a practiced day');
  eq(empty.core.summary('piano').observedTempo.max, null, 'a configured idle tempo is not an observed performance');
  empty.core.updateSettings({ xpPerMinute: 0 });
  empty.record({ startedAt: empty.now - 500, engagedSeconds: 0.5 });
  eq(empty.core.summary('piano').currentXP, 0, 'sub-second restart attempts cannot farm correct-note XP');
  empty.record({ startedAt: empty.now - 1000, engagedSeconds: 1, matched: 10, missed: 0, timingSamples: 0, sumAbsTimingMs: 0, sumTimingMs: 0 });
  eq(empty.core.summary('piano').currentXP, 100, 'correct-note XP respects the explicit per-session cap');
}

console.log('# local calendar, midnight conservation and honest allocation');
{
  const f = fixture('2026-03-09T00:05:00Z');
  const start = Date.parse('2026-03-08T23:55Z'), midnight = Date.parse('2026-03-09T00:00Z');
  const r = f.record({ startedAt: start, endedAt: f.now, engagedSeconds: 600, segments: [
    { startedAt: start, endedAt: midnight, engagedSeconds: 300, date: '2026-03-08' },
    { startedAt: midnight, endedAt: f.now, engagedSeconds: 300, date: '2026-03-09' }] });
  ok(r.ok, 'measured midnight buckets are accepted');
  const days = f.core.summary('piano', { rangeDays: 2 }).daily;
  eq(days.map(d => d.engagedSeconds), [300, 300], 'measured seconds are conserved on their actual daily labels');
  eq(days.map(d => d.expected), [0, 10], 'note observations stay explicitly on session-end date rather than fabricated per-day samples');
  eq(days.map(d => d.qualifies), [false, false], 'ten total minutes across two days do not invent a ten-minute day');
  eq(f.core.history('piano')[0].allocation, 'measured-segments', 'measured day allocation is labelled');
  const fallback = fixture('2026-03-09T00:05Z');
  fallback.record({ startedAt: start, engagedSeconds: 600 });
  eq(fallback.core.history('piano')[0].allocation, 'session-end', 'missing measured buckets are explicitly session-end allocation');
  eq(fallback.core.summary('piano', { rangeDays: 2 }).daily.map(d => d.engagedSeconds), [0, 600], 'fallback never invents a proportional midnight split');
  const approx = fixture('2026-03-09T00:05Z');
  approx.record({ startedAt: start, segments: [{ startedAt: start, endedAt: approx.now, engagedSeconds: 600 }] });
  eq(approx.core.history('piano')[0].allocation, 'segment-end', 'unlabelled cross-day segment is identified as end-date attribution');
  const noObs = f.core.summary('guitar', { rangeDays: 7 });
  ok(noObs.daily.every(d => !d.hasObservation && d.accuracy === null && d.meanAbsTimingMs === null), 'blank calendar rows do not invent note or timing observations');
}
{
  const spring = fixture('2026-03-08T07:10Z', 'America/New_York');
  spring.record({ startedAt: Date.parse('2026-03-08T06:50Z'), engagedSeconds: 1200 });
  eq(spring.core.summary('piano').today.minutes, 20, 'spring DST skipped hour adds no fictitious practice time');
  eq(spring.core.dayKey(Date.parse('2026-03-08T04:59Z')), '2026-03-07', 'DST local midnight uses the IANA calendar');
  const fall = fixture('2026-11-01T06:10Z', 'America/New_York');
  fall.record({ startedAt: Date.parse('2026-11-01T05:50Z'), engagedSeconds: 1200 });
  eq(fall.core.summary('piano').today.minutes, 20, 'fall DST repeated hour is not double counted');
  eq(fall.core.dayKey(Date.parse('2026-11-01T04:01Z')), '2026-11-01', 'fall DST day key follows local calendar');
}

console.log('# streak accumulation, vacations and conservative daily decay');
{
  const f = fixture(); f.record({ engagedSeconds: 300 });
  eq(f.core.summary('piano').currentStreak, 0, 'sub-threshold practice does not qualify');
  f.record({ engagedSeconds: 300 });
  eq(f.core.summary('piano').currentStreak, 1, 'same-day observed minutes accumulate toward the goal');
  f.at('2026-10-20T12:00Z'); const second = f.record();
  eq(second.session.earnedXP, 21, 'second practiced day gets the frozen five-percent streak bonus');
  eq(f.core.summary('piano').currentStreak, 2, 'successive local dates count practiced days once');
  const frozen = f.core.history('piano')[0].earnedXP;
  f.core.updateSettings({ xpPerMinute: 100, dailyMinutes: 20 });
  eq(f.core.history('piano')[0].earnedXP, frozen, 'reward settings never recalculate a recorded award');
  eq(f.core.summary('piano').today.goalMinutes, 10, 'existing day retains its captured daily goal');
  f.at('2026-10-21T12:00Z'); f.record();
  eq(f.core.summary('piano').today.goalMinutes, 20, 'new day uses the new threshold without rewriting past days');
}
{
  const f = fixture(); f.record(); f.at('2026-10-23T12:00Z');
  eq(f.core.summary('piano').currentXP, 20, 'three closed missed days consume grace without decay');
  f.at('2026-10-24T12:00Z'); const first = f.core.summary('piano');
  near(first.currentXP, 19.6, 'fourth closed missed day decays current XP once');
  eq(first.lifetimeEarnedXP, 20, 'decay never subtracts lifetime-earned XP');
  const export1 = f.core.exportData(); f.core.reconcile(); f.core.summary('piano');
  eq(f.core.exportData(), export1, 'repeated load/read/reconcile does not repeat daily decay');
  f.at('2026-10-25T12:00Z'); near(f.core.summary('piano').currentXP, 19.208, 'next eligible date gets one percentage step');
  f.at('2026-10-22T12:00Z'); near(f.core.summary('piano').currentXP, 19.208, 'clock rollback cannot replay settled days');
}
{
  const f = fixture(); f.core.updateSettings({ graceDays: 0, decayPercent: 100, decayDailyCap: 7, decayFloor: 5 }); f.record();
  f.at('2026-10-22T12:00Z'); eq(f.core.summary('piano').currentXP, 6, 'daily decay obeys its absolute cap');
  f.at('2026-10-23T12:00Z'); eq(f.core.summary('piano').currentXP, 5, 'decay cannot cross the configured floor');
  f.at('2026-11-23T12:00Z'); eq(f.core.summary('piano').currentXP, 5, 'long gaps cannot make current XP negative');
}
{
  const f = fixture(); f.record();
  ok(f.core.setVacation({ from: '2026-10-20', to: '2026-10-22' }).ok, 'inclusive vacation can be declared');
  f.core.setVacation({ from: '2026-10-21', to: '2026-10-23' });
  eq(f.core.getSettings().vacations, [{ from: '2026-10-20', to: '2026-10-23' }], 'overlapping vacation ranges merge idempotently');
  f.at('2026-10-24T12:00Z');
  const s = f.core.summary('piano');
  eq([s.currentXP, s.currentStreak], [20, 1], 'vacation protects streak/XP without adding practiced days');
  ok(s.daily.filter(d => d.vacation).every(d => d.minutes === 0 && !d.qualifies), 'vacation does not invent minutes or goal completion');
  f.record(); eq(f.core.summary('piano').currentStreak, 2, 'practice after vacation continues the actual practiced-day streak');
  ok(!f.core.setVacation({ from: '2026-02-30', to: '2026-03-02' }).ok, 'normalized-invalid vacation dates are rejected');
  f.core.setVacation(null); eq(f.core.getSettings().vacations, [], 'vacation clear is explicit');
  eq(f.core.summary('piano').currentStreak, 2, 'clearing planned dates retains already settled vacation streak protection');
  const reload = new Progress({ store: f.store, now: () => f.now });
  eq(reload.summary('piano').currentStreak, 2, 'closed vacation protection survives persistence and reload');
}
{
  const f = fixture(); f.record(); f.at('2026-10-23T12:00Z'); f.core.updateSettings({ decayEnabled: false });
  f.at('2026-11-23T12:00Z'); eq(f.core.summary('piano').currentXP, 20, 'disabled decay settles dates without penalty');
  f.core.updateSettings({ decayEnabled: true });
  eq(f.core.summary('piano').currentXP, 20, 're-enabling decay does not bill already settled disabled dates');
  f.at('2026-11-24T12:00Z'); near(f.core.summary('piano').currentXP, 19.6, 'only a newly closed eligible date uses re-enabled decay');
}

console.log('# timezone changes, backdated records and per-instrument independence');
{
  const f = fixture('2026-10-23T00:30Z', 'Pacific/Kiritimati'); f.record();
  const original = f.core.history('piano')[0];
  ok(f.core.updateSettings({ timezone: 'America/Los_Angeles' }).ok, 'valid timezone change is accepted');
  const after = f.core.summary('piano');
  eq([after.sessionCount, after.totalMinutes, after.lifetimeEarnedXP], [1, 10, 20], 'timezone change cannot hide all-time observed history');
  eq(f.core.history('piano')[0].date, original.date, 'recorded calendar labels and award settings remain immutable');
  eq(f.core.dayKey(f.now), '2026-10-22', 'future records use the chosen new local calendar');
  f.core.reconcile(); eq(f.core.summary('piano').currentXP, 20, 'timezone change does not replay historical decay');
}
{
  const f = fixture('2026-11-23T12:00Z');
  eq(f.core.summary('piano').currentXP, 0, 'no practice means no historical decay');
  const r = f.record({ startedAt: Date.parse('2026-10-19T11:50Z'), endedAt: Date.parse('2026-10-19T12:00Z') });
  eq(r.session.earnedXP, 20, 'new backdated observation is awarded once');
  eq(f.core.summary('piano').currentXP, 20, 'newly recognized history has no decay before first recognition');
  eq(f.core.summary('piano').today.minutes, 0, 'backdated recognition does not invent current-day practice');
  f.record({ instrument: 'guitar' });
  eq([f.core.summary('piano').lifetimeEarnedXP, f.core.summary('guitar').lifetimeEarnedXP], [20, 20], 'each explicit instrument has its own XP ledger');
  eq(f.core.summary('drums').sessionCount, 0, 'unpracticed instruments do not inherit another instrument history');
}

console.log('# invalid data and storage failures cannot create or destroy awards');
{
  const f = fixture(), initial = f.core.exportData();
  const invalid = [ { instrument: undefined }, { instrument: 'violin' }, { id: '' }, { id: 'x'.repeat(129) },
    { startedAt: NaN }, { endedAt: Infinity }, { endedAt: f.now + 60000 }, { engagedSeconds: -1 }, { engagedSeconds: Infinity },
    { engagedSeconds: '600' }, { engagedSeconds: 601 }, { matched: 100 }, { wrong: 2, extra: 1 },
    { timingSamples: 0, sumAbsTimingMs: 100 }, { sumTimingMs: 999 }, { mode: 'wait', timingSamples: 8 },
    { segments: [{ startedAt: f.now - 600000, endedAt: f.now, engagedSeconds: 500 }] } ];
  invalid.forEach((patch, i) => ok(!f.core.recordSession(f.session(patch)).ok, 'invalid session vector' + i + ' rejected'));
  eq(f.core.exportData(), initial, 'invalid observations leave all history and balances unchanged');
  for (const patch of [{ timezone: 'Mars/Olympus' }, { dailyMinutes: 0 }, { xpPerMinute: Infinity }, { graceDays: 1.2 },
    { decayEnabled: 1 }, { decayPercent: -1 }, { unknown: 1 }, { vacations: [{ from: '2026-02-30', to: '2026-03-02' }] }]) {
    ok(!f.core.updateSettings(patch).ok, 'invalid settings rejected: ' + Object.keys(patch).join());
  }
  eq(f.core.getSettings(), initial.settings, 'invalid settings do not partially mutate preferences');
  const special = f.record({ id: '__proto__' });
  ok(special.ok && f.core.summary('piano').today.sessionCount === 1 && f.core.summary('piano').today.hasObservation, 'prototype-like IDs remain ordinary counted observations');
  const before = f.core.exportData(), raw = f.store.values[Progress.storageKey];
  raw.settings = {};
  assert.throws(() => new Progress({ store: f.store }), /left unchanged/); checks++; console.log('  PASS malformed stored settings fail without destructive reset');
  eq(f.store.values[Progress.storageKey].settings, {}, 'corrupt stored data is preserved for recovery');
  f.store.values[Progress.storageKey] = structuredClone(before); delete f.store.values[Progress.storageKey].sessions[0].allocations;
  assert.throws(() => new Progress({ store: f.store }), /left unchanged/); checks++; console.log('  PASS malformed stored observations cannot load as invented data');
  const broken = fixture(); broken.store.set = () => {};
  ok(!broken.record().ok, 'silent persistence failure is reported');
  eq(broken.core.summary('piano').lifetimeEarnedXP, 0, 'failed persistence cannot leave a credited in-memory award');
}

console.log('# browser attachment uses the same tested core');
{
  const f = fixture(); f.record(); const good = f.core.exportData();
  const corrupt = [d => { d.ledgers = {}; }, d => { d.ledgers = []; }, d => { d.goals = {}; },
    d => { d.sessions[0].tempo = 'loud'; }, d => { d.sessions[0].expected = 0; d.sessions[0].matched = 100; },
    d => { d.sessions[0].segments = [null]; }, d => { d.sessions[0].award.settings = {}; },
    d => { delete d.sessions[0].award.baseXP; }, d => { d.sessions[0].sumTimingMs = Infinity; },
    d => { d.ledgers.piano.currentXP = 999; }, d => { d.sessions.push(structuredClone(d.sessions[0])); }];
  corrupt.forEach((mutate, i) => {
    const data = structuredClone(good); mutate(data); f.store.values[Progress.storageKey] = data;
    assert.throws(() => new Progress({ store: f.store }), /left unchanged/);
    checks++; console.log('  PASS corrupt persisted vector' + i + ' rejected without resetting history');
  });
  f.store.values[Progress.storageKey] = structuredClone(good);
  eq(new Progress({ store: f.store, now: () => f.now }).summary('piano').currentXP, 20, 'complete valid exported state reloads after strict validation');
  for (const days of [0, 1.5, '2', Infinity]) {
    assert.throws(() => f.core.history('piano', { days }), /History days/); checks++; console.log('  PASS invalid history range rejected: ' + days);
  }
  assert.throws(() => f.core.summary('piano', { from: '1900-01-01', to: '2026-10-19' }), /3660/);
  checks++; console.log('  PASS explicit summary dates cannot bypass calendar row limit');
  const wideVacation = f.core.setVacation({ from: '2026-10-20', to: '9999-12-31' });
  ok(wideVacation.ok && f.core.setVacation({ from: '2026-10-21', to: '2026-10-22' }).ok && f.core.getSettings().vacations.length === 1,
    'inclusive vacation merge handles the final supported calendar year');
}
{
  const f = fixture('2026-10-19T00:30Z', 'Pacific/Kiritimati'); f.core.updateSettings({ graceDays: 0 }); f.record();
  f.at('2026-10-24T00:30Z'); f.core.reconcile();
  const before = f.core.exportData(), already = before.ledgers.piano.decays.map(d => d.date);
  f.core.updateSettings({ timezone: 'America/Los_Angeles' }); f.at('2026-10-25T00:30Z'); f.core.reconcile();
  const dates = f.core.exportData().ledgers.piano.decays.map(d => d.date);
  eq(dates, already, 'westward timezone change cannot bill an already settled date a second time');
}
{
  const store = memory(), events = [], root = { App: { store, emit: (name, event) => events.push({ name, event }) } };
  const sandbox = { window: root, Intl, Date, Number, Object, Array, JSON, Set, Math, RangeError, Error };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/practice-progress'), 'utf8'), sandbox);
  ok(typeof root.PracticeProgress === 'function' && root.App.practiceProgress, 'browser global and App singleton attach without a separate implementation');
  root.App.practiceProgress.updateSettings({ decayEnabled: false });
  ok(events.some(e => e.name === 'practice:progress'), 'browser singleton emits the documented persisted-change event');
}
console.log('# stale-tab revisions and retryable immutable observations');
{
  const store = memory(); let revision = 0, conflict = null;
  const originalSet = store.set;
  store.revision = () => revision;
  store.set = function (key, value) { originalSet(key, value); revision++; };
  store.write = function (key, value, options) {
    if (conflict) { const fn = conflict; conflict = null; fn(); }
    if (options.expectedRevision !== revision) return { ok: false, errors: ['Revision conflict'] };
    this.set(key, value); return { ok: true };
  };
  const a = fixture('2026-10-19T12:00:00Z', 'UTC', store), b = fixture('2026-10-19T12:00:00Z', 'UTC', store);
  const piano = a.session({ id: 'tab-a', instrument: 'piano' }), guitar = b.session({ id: 'tab-b', instrument: 'guitar' });
  ok(a.core.recordSession(piano).ok && b.core.recordSession(guitar).ok, 'stale tab refreshes before recording another instrument');
  eq(a.core.history('guitar').map(s => s.id), ['tab-b'], 'already open tab sees the other instrument session');
  eq(b.core.history('piano')[0].earnedXP, 20, 'refresh preserves the first immutable award');
  const later = b.session({ id: 'tab-b-later', instrument: 'bass' });
  conflict = () => a.core.recordSession(a.session({ id: 'tab-a-race', instrument: 'voice' }));
  ok(!b.core.recordSession(later).ok, 'revision change between derive and commit rejects the stale write');
  ok(b.core.recordSession(later).accepted, 'retry uses fresh state and original session ID');
  eq(b.core.exportData().sessions.map(s => s.id).sort(), ['tab-a', 'tab-a-race', 'tab-b', 'tab-b-later'], 'retry preserves all distinct observations without duplicate awards');
  const before = structuredClone(store.values[Progress.storageKey]);
  store.set(Progress.storageKey, { version: 999 });
  ok(!b.record({ id: 'unsupported' }).ok, 'unsupported external data blocks recording instead of replacing it');
  eq(store.values[Progress.storageKey], { version: 999 }, 'unsupported raw record remains unchanged');
  store.set(Progress.storageKey, before);
  ok(b.core.recordSession(later).duplicate, 'restored known state retains duplicate-session protection');
}
console.log('ALL PASS (' + checks + ' checks; deterministic observations and local calendars only)');
