// Deterministic clock simulations of the shared guided-performance engine.
// No browser permission, actual MIDI device or wall-clock delay is involved.
const Engine = require('../js/performance-engine');
let checks = 0;
function ok(value, message) { if (!value) throw new Error(message); checks++; console.log('  PASS', message); }
function close(a, b, tolerance = 0.00001) { return Math.abs(a - b) <= tolerance; }
function fixture(notes, extra = {}) {
  let time = 0;
  const events = [];
  const score = Object.assign({ title: 'Original test exercise', bpm: 60, len: 4, notes }, extra.score || {});
  const engine = new Engine(Object.assign({ countIn: 0, clock: () => time, onChange: (s, e) => events.push({ s, e }) }, extra, { score }));
  return { engine, events, advance: n => { time += n; return engine.tick(); }, at: n => { time = n; return engine.tick(); },
    on: (midi, channel = 0, source = 'synth') => engine.input({ midi, on: true, vel: 91, chan: channel, portId: source }),
    off: (midi, channel = 0, source = 'synth') => engine.input({ midi, on: false, chan: channel, portId: source }),
    pedal: (value, channel = 0, source = 'synth') => engine.control({ controller: 64, value, chan: channel, portId: source }),
    get state() { return engine.snapshot(); } };
}

console.log('# structured source normalization');
{
  const sc = Engine.normalizeScore({ bpm: 100, notes: [{ m: 60, t: 0, d: 2 }, { m: 64, t: 0, d: 1 },
    { m: 60, t: 1, d: 1 }, { rest: true, t: 2, d: 3 }, { m: 200, t: 1 }, { m: 62, t: -1 }] });
  ok(sc.groups.length === 2 && sc.groups[0].notes.join() === '60,64', 'same-onset pitches form an exact-register chord');
  ok(sc.groups[0].endBeat === 2 && sc.len === 5, 'note durations and explicit trailing rest define source length');
  ok(sc.warnings.some(w => /Overlapping/.test(w)) && sc.groups[0].entries[0].durationScored === false, 'ambiguous overlapping repeated-pitch durations explicitly excluded');
  ok(sc.warnings.some(w => /invalid/.test(w)), 'invalid pitches and beat positions are reported, never fabricated');
  const tr = Engine.normalizeScore({ notes: [{ notes: [60, 64, 67], beat: 1, duration: 2 }] }, { transpose: 12 });
  ok(tr.groups[0].notes.join() === '72,76,79', 'grouped structured notes accept explicit octave transposition');
  const warnings = Engine.normalizeScore({ timingOk: false, importWarnings: ['Single tempo only.'], notes: [{ m: 60, t: 0, d: 1, tie: 'start' }] }).warnings;
  ok(warnings.some(w => /Tie/.test(w)) && warnings.some(w => /approximate/.test(w)) && warnings.indexOf('Single tempo only.') >= 0, 'source limitations and unparsed tie marks remain honest');
  const dupe = Engine.normalizeScore({ notes: [{ m: 60, t: 0, d: 1 }, { m: 60, t: 0, d: 1 }] });
  ok(dupe.groups[0].notes.length === 1 && dupe.warnings.some(w => /Duplicate/.test(w)), 'duplicate simultaneous pitches do not invent extra required keys');
  const zero = Engine.normalizeScore({ bpm: 400, notes: [{ m: 60, t: 0, d: 0 }] });
  ok(zero.groups[0].entries[0].duration === 0 && zero.warnings.some(w => /Zero-duration/.test(w)), 'zero-duration source notes preserve onset semantics without an invented hold');
  ok(zero.bpm === 300 && zero.warnings.some(w => /20–300/.test(w)), 'out-of-range source tempo has an explicit practice-clamp warning');
  const endZero = fixture([{ m: 60, t: 1, d: 0 }], { mode: 'tempo', score: { len: 1 } });
  endZero.engine.start(); endZero.at(1); endZero.on(60);
  ok(endZero.state.results.expected === 1 && endZero.state.results.matched === 1, 'a zero-duration final onset at the declared score end remains playable');
}

console.log('# Wait for Me: chords, exact pitch, wrong notes and rearticulation');
{
  const h = fixture([{ m: 60, t: 0, d: 1 }, { m: 60, t: 1, d: 1 }, { m: 64, t: 2, d: 1 }, { m: 67, t: 2, d: 1 }], { score: { len: 3 } });
  h.engine.start();
  ok(h.state.current.notes.join() === '60' && h.state.upcoming[1].notes.join() === '64,67', 'current and upcoming targets expose grouped score pitches');
  h.on(72);
  ok(h.state.current.beat === 0 && h.state.results.wrong === 1, 'same pitch class in a wrong octave is a counted mistake');
  h.on(60);
  ok(h.state.current.beat === 0 && h.state.current.matched.join() === '60', 'correct target held with wrong extra does not advance');
  h.off(72);
  ok(h.state.current.beat === 1 && h.state.results.matched === 1, 'releasing the wrong extra completes exact held target');
  h.on(60);
  ok(h.state.current.beat === 1 && h.state.lastFeedback.kind === 'repeat', 'duplicate held Note On cannot satisfy a repeated note');
  h.on(60, 3);
  ok(h.state.current.beat === 1 && h.state.held.join() === '60', 'another MPE channel cannot bypass physical release requirement');
  h.off(60); h.on(60);
  ok(h.state.current.beat === 1, 'releasing only one of multiple held channels is insufficient');
  h.off(60); h.off(60, 3); h.on(60);
  ok(h.state.current.notes.join() === '64,67' && h.state.results.matched === 2, 'all channels released then fresh attack advances repeated pitch once');
  h.off(60); h.on(64);
  ok(h.state.current.matched.join() === '64' && h.state.results.matched === 2, 'partial chord is visible without grading the group complete');
  h.off(64); h.on(67);
  ok(h.state.current.notes.join() === '64,67' && h.state.current.matched.join() === '67', 'sequential released notes do not satisfy a simultaneous chord or retain stale matched highlights');
  h.on(64);
  ok(h.state.status === 'complete' && h.state.results.matched === 4, 'all exact chord notes physically held completes the exercise');
  ok(h.state.results.expected === 4 && h.state.results.wrong === 1 && h.state.results.accuracy === 80, 'wrong attacks reduce final accuracy while corrected targets remain matched');
  ok(h.state.results.chordAccuracy === 100 && h.state.results.totalGroups === 3, 'final breakdown distinguishes note count and complete chord groups');
  ok(h.events.some(e => e.e.type === 'complete'), 'completion is emitted for display cleanup and results rendering');
}

console.log('# count-in, leading/inner/trailing rests and pause clock');
{
  const h = fixture([{ m: 60, t: 1, d: 1 }, { m: 62, t: 3, d: 1 }], { countIn: 4, score: { len: 5 } });
  h.engine.start(); h.on(60);
  ok(h.state.status === 'countin' && h.state.countInRemaining === 4 && h.state.results.extra === 0, 'count-in tracks physical held notes without grading');
  h.advance(2); h.engine.pause(); h.advance(100);
  ok(h.state.status === 'paused' && close(h.state.countInRemaining, 2), 'pausing freezes the count-in despite clock advancing');
  h.engine.resume(); h.advance(2);
  ok(h.state.status === 'running' && h.state.phase === 'rest' && close(h.state.restRemainingBeats, 1), 'count-in ends into the actual leading rest');
  h.advance(1); h.on(60);
  ok(h.state.current.beat === 1 && h.state.results.matched === 0, 'a key held through count-in cannot be borrowed for a later target');
  h.off(60); h.on(60);
  ok(h.state.phase === 'rest' && close(h.state.restRemainingBeats, 1) && h.state.current.notes[0] === 62, 'correct onset advances to the score’s inferred inner rest');
  h.off(60); h.advance(0.4); h.engine.pause(); h.advance(50);
  ok(close(h.state.restRemainingBeats, 0.6), 'rest progression pauses without consuming musical time');
  h.engine.resume(); h.advance(0.6); h.on(62);
  ok(h.state.phase === 'rest' && close(h.state.restRemainingBeats, 1), 'trailing rest remains after the last correct note');
  h.advance(1);
  ok(h.state.status === 'complete' && h.state.beat === 5, 'the final rest completes deterministically at section end');
}

console.log('# pause requires fresh partial-chord attacks');
{
  const h = fixture([{ m: 60, t: 0, d: 1 }, { m: 64, t: 0, d: 1 }], { score: { len: 1 } });
  h.engine.start(); h.on(60); h.engine.pause(); h.on(64); h.engine.resume();
  ok(h.state.results.matched === 0 && h.state.current.matched.length === 0, 'paused inputs and stale partial chord do not silently score on resume');
  h.off(64); h.on(64);
  ok(h.state.results.matched === 0, 'the pre-pause held key must also rearticulate');
  h.off(60); h.on(60);
  ok(h.state.status === 'complete' && h.state.results.matched === 2, 'fresh attacks after resume restore normal chord grading');
}

console.log('# rests require silence in both performance modes');
for (const mode of ['wait', 'tempo']) {
  const h = fixture([{ m: 60, t: 1, d: 1 }], { mode, score: { len: 2 } });
  h.engine.start(); h.on(61); h.off(61);
  ok(h.state.results.extra === 1 && h.state.results.wrong === 0 && h.state.lastFeedback.kind === 'extra', mode + ': playing during a leading rest counts an extra attack');
  h.advance(1); h.on(60);
  ok(h.state.results.matched === 1, mode + ': rest mistake does not prevent a later fresh correct attack');
}

console.log('# Play at Tempo: onset windows, misses, wrong and extra notes');
{
  const h = fixture([{ m: 60, t: 0, d: 0.5 }, { m: 64, t: 1, d: 0.5 }, { m: 67, t: 1, d: 0.5 }, { m: 62, t: 2, d: 0.5 }],
    { mode: 'tempo', score: { len: 3 } });
  h.engine.start(); h.on(60); h.advance(0.5); h.off(60);
  h.at(0.95); h.on(64); h.on(61); h.off(61); h.at(1.08); h.on(67);
  ok(h.state.results.matched === 3 && h.state.results.perfect === 1 && h.state.results.great === 1 && h.state.results.good === 1,
    'exact, 50ms early and 80ms late attacks receive distinct timing grades');
  ok(h.state.results.early === 1 && h.state.results.late === 1 && h.state.results.wrong === 1, 'timing direction and a blocked-capable raw wrong pitch are counted');
  h.off(64); h.off(67); h.at(1.5); h.on(72); h.off(72);
  ok(h.state.results.extra === 2 && h.state.results.wrong === 1, 'off-window extra and in-window wrong pitches have a meaningful separate breakdown');
  h.at(2.121);
  ok(h.state.results.missed === 1 && h.state.lastFeedback.kind === 'miss', 'unplayed target becomes a miss only after its late window');
  h.at(3.001);
  ok(h.state.status === 'complete' && h.state.results.accuracy === 50, 'timed run completes without waiting and includes extras in accuracy denominator');
  ok(h.state.results.completedGroups === 2 && close(h.state.results.chordAccuracy, 66.7), 'partial or missed chord groups reduce group completion accuracy');
  ok(close(h.state.results.meanTimingMs, 10) && close(h.state.results.meanAbsTimingMs, 130 / 3), 'signed and absolute timing summaries preserve early/late information');
  ok(h.state.results.durationSamples === 3, 'timed note releases produce explicit duration samples');
  ok(h.state.results.durationAccuracy >= 0 && h.state.results.durationAccuracy <= 100, 'hold-duration accuracy is bounded and distinct from onset accuracy');
  ok(h.state.results.attempts.filter(a => a.result === 'missed').length === 1, 'final per-note breakdown includes exact missed pitch/beat');
}

console.log('# changing speed, timed pause and note hold durations');
{
  const h = fixture([{ m: 60, t: 0, d: 2 }, { m: 62, t: 2, d: 1 }], { mode: 'tempo', score: { len: 3 } });
  h.engine.start(); h.on(60); h.advance(1); h.engine.setTempo(120);
  ok(close(h.state.beat, 1) && h.state.tempo === 120, 'tempo change preserves current musical beat exactly');
  h.advance(0.25); h.engine.pause(); h.advance(10);
  ok(close(h.state.beat, 1.5), 'timed pause freezes score position despite the external clock');
  h.off(60);
  ok(close(h.state.results.meanDurationErrorBeats, -0.5), 'release during pause measures frozen musical hold duration');
  h.engine.resume(); h.advance(0.25); h.on(62);
  ok(h.state.results.matched === 2 && close(h.state.beat, 2), 'resumed target timing follows the new speed without a clock jump');
  h.advance(0.5); h.off(62); h.advance(0.001);
  ok(h.state.status === 'complete' && h.state.results.missed === 0, 'speed changes do not lose later allowed targets');
  h.engine.restart();
  ok(h.state.status === 'running' && h.state.results.matched === 0 && close(h.state.beat, 0), 'restart resets score and statistics at the selected current tempo');
}

console.log('# score durations remain visible after onset grading');
{
  const h = fixture([{ m: 60, t: 0, d: 2 }, { m: 64, t: 4, d: 1 }], { mode: 'tempo', score: { len: 5 } });
  h.engine.start(); h.on(60); h.advance(1);
  ok(h.state.activeNotes.join() === '60' && h.state.activeMatchedNotes.join() === '60' && h.state.phase === 'target' && h.state.current.notes.join() === '64', 'sustained current score note and matched feedback stay distinct from upcoming unresolved note');
  h.advance(1.5);
  ok(!h.state.activeNotes.length && !h.state.activeMatchedNotes.length && h.state.phase === 'rest' && h.state.current.notes.join() === '64', 'an actual score gap clears active target/feedback frames while retaining upcoming notes');
  h.engine.pause();
  ok(!h.state.activeNotes.length, 'paused display exposes no active score target');
}

console.log('# sustain, channel/source pairing, velocity-zero and disconnection');
{
  const h = fixture([{ m: 60, t: 0, d: 1 }, { m: 60, t: 1, d: 1 }], { score: { len: 2 } });
  h.engine.start(); h.pedal(127, 2); h.on(60, 2); h.engine.input({ midi: 60, on: true, vel: 0, chan: 2, portId: 'synth' });
  ok(h.state.held.length === 0 && h.state.sounding.join() === '60', 'velocity-zero Note On is a physical release while sustain keeps the sounding ledger');
  h.on(60, 2);
  ok(h.state.status === 'complete' && h.state.results.matched === 2, 'physical release/rearticulation succeeds even with pedal down');
  h.engine.releaseInput();
  ok(!h.state.held.length && !h.state.sounding.length, 'explicit stop/disconnect cleanup releases all engine ledgers');
  const p = fixture([{ m: 60, t: 0, d: 3 }], { mode: 'tempo' });
  p.engine.start(); p.pedal(127, 1, 'a'); p.on(60, 1, 'a'); p.on(67, 1, 'b'); p.off(60, 1, 'a');
  p.pedal(0, 1, 'b');
  ok(p.state.sounding.indexOf(60) >= 0, 'another identically numbered channel on another source cannot release a pedal-held note');
  p.engine.releaseInput('a');
  ok(p.state.sounding.join() === '67' && p.state.held.join() === '67', 'disconnecting one source preserves independently held other source');
  p.engine.releaseInput('b');
  ok(!p.state.sounding.length && !p.state.held.length, 'per-source cleanup completes safely without conflating ports');
  p.on(60, 1, 'synth'); p.on(67, 1, 'synth:extension'); p.engine.releaseInput('synth');
  ok(p.state.held.join() === '67', 'similarly prefixed MIDI port IDs remain distinct during cleanup');
  p.engine.releaseInput(); p.engine.input({ midi: 60, on: true, portId: 0 }); p.engine.input({ midi: 67, on: true }); p.engine.releaseInput(0);
  ok(p.state.held.join() === '67', 'numeric port zero remains distinct from an unspecified input source');
}

console.log('# timed repeated notes cannot reuse held attacks');
{
  const h = fixture([{ m: 60, t: 0, d: 0.5 }, { m: 60, t: 1, d: 0.5 }], { mode: 'tempo', score: { len: 2 } });
  h.engine.start(); h.on(60); h.at(1); h.on(60); h.at(1.121);
  ok(h.state.results.matched === 1 && h.state.results.missed === 1, 'a repeated held Note On cannot score the second timed target');
  h.engine.restart(); h.off(60); h.on(60); h.advance(0.5); h.off(60); h.advance(0.5); h.on(60);
  ok(h.state.results.matched === 2, 'fresh attacks score both repeated timed notes');
}

console.log('# section looping, transposition, stop and safe snapshots');
{
  const h = fixture([{ m: 60, t: 0, d: 1 }, { m: 62, t: 1, d: 1 }, { m: 64, t: 2, d: 1 }],
    { section: { startBeat: 1, endBeat: 2, loop: true }, score: { len: 3 } });
  h.engine.start();
  ok(h.state.current.notes.join() === '62' && h.state.results.expected === 1, 'section practice limits targets to onsets inside the selected beat range');
  h.on(62);
  ok(h.state.results.loops === 1 && h.state.current.notes.join() === '62', 'completed looping section starts the next pass');
  h.on(62);
  ok(h.state.results.matched === 1, 'loop boundary cannot borrow a key held from the prior pass');
  h.off(62); h.on(62);
  ok(h.state.results.matched === 2 && h.state.results.loops === 2, 'fresh attack completes the next loop and accumulates results');
  h.engine.setSection({ startBeat: 0, endBeat: 3, loop: false }); h.engine.setTranspose(12); h.engine.start();
  ok(h.state.current.notes[0] === 72 && h.state.results.expected === 3, 'section and octave changes rebuild an idle sequence without stale targets');
  const snapshot = h.state; snapshot.current.notes[0] = 0; snapshot.results.attempts.push({ result: 'forged' });
  ok(h.state.current.notes[0] === 72 && !h.state.results.attempts.length, 'consumers cannot mutate scoring state through snapshots');
  h.engine.stop(); h.on(72);
  ok(h.state.status === 'stopped' && h.state.results.matched === 0, 'stopped input never grades or restarts playback');
  h.engine.releaseInput();
}

console.log('# idle and stopped clocks stay still');
{
  const h = fixture([{ m: 60, t: 0, d: 1 }], { mode: 'tempo' });
  h.advance(20);
  ok(h.state.status === 'idle' && h.state.beat === 0, 'an unstarted tempo exercise never drifts while previewing');
  h.engine.start(); h.advance(0.5); h.engine.stop(); h.advance(20);
  ok(h.state.status === 'stopped' && close(h.state.beat, 0.5), 'stopped exercise freezes the last musical position');
}

console.log('# calibrated input timestamps and delayed arrival grace');
for (const latency of [80, 200]) {
  const h = fixture([{ m: 60, t: 1, d: 1 }], { mode: 'tempo', inputDelayMs: latency, score: { len: 3 } });
  h.engine.start(); h.at(1 + latency / 1000);
  h.engine.input({ midi: 60, on: true, source: 'audio', at: 1 });
  ok(h.state.results.matched === 1 && h.state.results.perfect === 1 && close(h.state.results.meanTimingMs, 0), latency + 'ms compensated late arrival is graded at its actual onset');
  ok(close(h.state.beat, 1 + latency / 1000) && h.state.inputDelayMs === latency, latency + 'ms compensation leaves the visible transport clock unchanged');
}
{
  const h = fixture([{ m: 60, t: 0, d: 0.05 }], { mode: 'tempo', inputDelayMs: 200, score: { len: 0.05 } });
  h.engine.start(); h.at(0.2);
  ok(h.state.status === 'running' && h.state.results.missed === 0, 'input delay extends both last-note miss aging and the completion tail');
  h.engine.input({ midi: 60, on: true, source: 'audio', at: 0 }); h.at(0.321);
  ok(h.state.status === 'complete' && h.state.results.matched === 1 && h.state.results.missed === 0, 'a delayed final attack is accepted before deterministic tail completion');
  ok(close(h.state.results.meanDurationErrorBeats, 0), 'completion-tail waiting does not inflate the final note’s hold duration');
  const absent = fixture([{ m: 60, t: 0, d: 1 }], { mode: 'tempo', inputDelayMs: 200 });
  absent.engine.start(); absent.at(0.321);
  ok(absent.state.results.missed === 1, 'a genuinely absent target becomes a miss after window plus calibrated delay');
}
{
  const h = fixture([{ m: 60, t: 0, d: 1 }], { mode: 'tempo', inputDelayMs: 200 });
  h.engine.start(); h.at(0.2); h.on(60);
  ok(h.state.results.matched === 0 && h.state.results.extra === 1, 'inputs without a timestamp are graded at arrival, never silently backdated');
  const future = fixture([{ m: 60, t: 0.5, d: 1 }], { mode: 'tempo', inputDelayMs: 200 });
  future.engine.start(); future.at(0.2); future.engine.input({ midi: 60, on: true, at: 0.5 });
  ok(future.state.results.matched === 0, 'future timestamps are clamped to now and cannot claim a later target');
  const past = fixture([{ m: 60, t: 0.5, d: 1 }], { mode: 'tempo', inputDelayMs: 200 });
  past.engine.start(); past.at(1); past.engine.input({ midi: 60, on: true, at: -100 });
  ok(past.state.results.matched === 0 && past.state.results.missed === 1, 'timestamps older than the configured delay cannot resurrect expired targets');
  past.engine.pause(); past.engine.setInputDelay(999);
  ok(past.state.inputDelayMs === 500, 'runtime latency configuration is bounded to 500ms');
  past.engine.setInputDelay(-20);
  ok(past.state.inputDelayMs === 0, 'negative latency configuration clamps to zero');
}
{
  const h = fixture([{ m: 60, t: 0.75, d: 1 }, { m: 62, t: 2, d: 0.5 }], { mode: 'tempo', inputDelayMs: 200, score: { len: 3 } });
  h.engine.start(); h.at(0.8); h.engine.setTempo(120); h.at(0.95);
  h.engine.input({ midi: 60, on: true, source: 'audio', at: 0.75 });
  ok(h.state.results.perfect === 1 && close(h.state.results.meanTimingMs, 0), 'a late frame from before a speed change uses the original tempo segment');
  h.at(1.475); h.engine.input({ midi: 60, on: false, source: 'audio', at: 1.275 });
  ok(h.state.results.durationSamples === 1 && close(h.state.results.meanDurationErrorBeats, 0), 'compensated on/off holds integrate musical beats across tempo changes');
  h.at(1.6); h.engine.input({ midi: 62, on: true, source: 'audio', at: 1.4 });
  ok(h.state.results.matched === 2 && h.state.results.perfect === 2, 'a later target follows the new tempo while preserving calibrated timing');
  const early = fixture([{ m: 60, t: 1, d: 1 }], { mode: 'tempo', inputDelayMs: 200, score: { len: 2 } });
  early.engine.start(); early.at(0.95); early.engine.setTempo(120); early.at(1.1);
  early.engine.input({ midi: 60, on: true, source: 'audio', at: 0.9 });
  ok(early.state.results.matched === 1 && close(early.state.results.meanTimingMs, -100), 'an early frame uses the tempo forecast known at capture, without applying a later speed change retroactively');
}
{
  const h = fixture([{ m: 60, t: 1, d: 1 }], { mode: 'tempo', inputDelayMs: 200, score: { len: 2 } });
  h.engine.start(); h.at(0.9); h.engine.pause(); h.advance(10); h.engine.resume(); h.at(11);
  h.engine.input({ midi: 60, on: true, source: 'audio', at: 10.85 });
  ok(h.state.results.matched === 0 && h.state.results.extra === 0, 'late frames captured during a pause remain ungraded after resume');
  h.engine.input({ midi: 60, on: false, source: 'audio', at: 10.86 }); h.at(11.2);
  h.engine.input({ midi: 60, on: true, source: 'audio', at: 11 });
  ok(h.state.results.matched === 1 && h.state.results.perfect === 1 && close(h.state.beat, 1.2), 'resume shifts target wall time without shifting the visible beat or compensated onset');
  const wait = fixture([{ m: 60, t: 0, d: 1 }], { inputDelayMs: 500, score: { len: 1 } });
  wait.engine.start(); wait.engine.input({ midi: 60, on: true, source: 'audio', at: -500 });
  ok(wait.state.status === 'complete' && wait.state.results.matched === 1, 'Wait for Me retains physical matching independently of timestamp calibration');
}
for (const latency of [0, 200]) {
  const h = fixture([{ m: 60, t: 1, d: 1 }], { mode: 'tempo', inputDelayMs: latency, score: { len: 2 } });
  h.engine.start(); h.at(1.05); h.engine.pause(); h.advance(10); h.engine.resume();
  h.engine.input({ midi: 60, on: true, source: 'audio', at: 11.05 });
  ok(h.state.results.matched === 1 && h.state.results.great === 1 && h.state.results.missed === 0, latency + 'ms: pause freezes an already-open late window instead of aging it through the pause');
}
{
  const h = fixture([{ m: 60, t: 1, d: 1 }], { mode: 'tempo', inputDelayMs: 200, score: { len: 2 } });
  h.engine.start(); h.at(1); h.engine.pause(); h.advance(0.1); h.engine.resume(); h.at(1.15);
  h.engine.input({ midi: 60, on: true, source: 'audio', at: 0.99 });
  ok(h.state.results.matched === 1 && close(h.state.results.meanTimingMs, -10), 'a delayed frame captured just before a short pause uses its original timing segment');
}

{
  const unknown = fixture([{m:60,t:0,d:1}],{mode:'tempo',score:{len:1,rhythmKnown:false}});
  ok(unknown.engine.mode==='wait','unreviewed rhythm cannot enter Tempo even through the engine API');
  unknown.engine.start();unknown.advance(60);
  ok(unknown.state.results.missed===0&&unknown.state.status==='running','unknown rhythm waits indefinitely without fabricated timing misses');
  unknown.engine.input({midi:60,on:true,source:'test'});
  ok(unknown.state.results.matched===1&&unknown.state.mode==='wait'&&unknown.state.results.durationSamples===0,'unknown rhythm grades pitch without timed hold samples');
}
console.log('ALL PASS (' + checks + ' checks)');
