// Synthetic PCM and fake shared-input graph. No microphone, network, upload,
// acoustic instrument, audio driver, speaker, or hardware is opened.
const assert = require('assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const Detector = require('../js/pitch-detector'), PracticeInput = require('../js/practice-input');
let checks = 0;
function ok(value, message) { assert(value, message); checks++; console.log('  PASS', message); }
function freq(m, reference = 440) { return reference * Math.pow(2, (m - 69) / 12); }
function tone(f, options = {}) {
  const sr = options.rate || 48000, n = options.length || 4096, x = new Float32Array(n);
  const harmonics = options.harmonics || [1], amplitude = options.amplitude ?? 0.2;
  for (let i = 0; i < n; i++) for (let h = 0; h < harmonics.length; h++)
    x[i] += amplitude * harmonics[h] * Math.sin(2 * Math.PI * f * (h + 1) * (i + (options.phase || 0)) / sr);
  return x;
}
function randomNoise(amplitude = 0.2) {
  let seed = 913;
  return Float32Array.from({ length: 4096 }, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 4294967296 * 2 - 1) * amplitude; });
}
async function fixture(options = {}, callbacks = {}) {
  let clock = 0; const notes = [], states = [];
  const input = PracticeInput.create(Object.assign({ clock: () => clock, onNote: n => notes.push(n), onState: s => states.push(s) }, callbacks));
  await input.start(Object.assign({ simulation: true }, options));
  const feed = (samples, count = 1, dt = 0.025) => {
    for (let i = 0; i < count; i++) { clock += dt; input.feed(samples, 48000, clock); }
  };
  return { input, notes, states, feed, get clock() { return clock; } };
}
function browserHarness(mode = {}) {
  const bus = {}, values = { 'audio.inId': 'guitar', 'audio.monitor': false }, tracks = [], nodes = [], calls = [];
  const pendingResolvers = [], liveBeforeCapture = [], documentListeners = {}, mediaListeners = {};
  if (mode.tonein) values['audio.tonein'] = true;
  function node(kind) {
    const n = { kind, edges: [], context: null, gain: { value: 1 }, fftSize: 1024,
      connect(to) { this.edges.push(to); }, disconnect(to) { this.edges = to ? this.edges.filter(e => e !== to) : []; },
      getFloatTimeDomainData(data) { data.fill(0); } };
    nodes.push(n); return n;
  }
  const context = { currentTime: 0, sampleRate: 48000, state: 'running', destination: node('speakers'),
    createMediaStreamSource() { const n = node('source'); n.context = context; return n; },
    createGain() { const n = node('gain'); n.context = context; return n; },
    createAnalyser() { const n = node('analyser'); n.context = context; return n; } };
  function stream(id) {
    const track = { label: 'Guitar USB interface', readyState: 'live', onended: null,
      stop() { this.readyState = 'ended'; }, getSettings: () => ({ deviceId: id }) };
    tracks.push(track); return { getTracks: () => [track], getAudioTracks: () => [track] };
  }
  const App = { store: { get: (key, fallback) => key in values ? values[key] : fallback, set: (key, value) => values[key] = value },
    getAudio: () => context, on: (name, fn) => (bus[name] || (bus[name] = [])).push(fn),
    emit: (name, data) => (bus[name] || []).slice().forEach(fn => fn(data)) };
  const navigator = { mediaDevices: { addEventListener: (name, fn) => (mediaListeners[name] || (mediaListeners[name] = [])).push(fn),
    enumerateDevices: () => Promise.resolve([{ kind: 'audioinput', deviceId: 'guitar', label: 'Guitar USB interface' }]),
    getUserMedia: constraints => {
      calls.push(constraints);
      liveBeforeCapture.push(tracks.filter(t => t.readyState === 'live').length);
      if (mode.denied) return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
      if (mode.missing) return Promise.reject(Object.assign(new Error('missing'), { name: 'NotFoundError' }));
      if (mode.pending) return new Promise(resolve => { pendingResolvers.push(() => resolve(stream('guitar'))); });
      return Promise.resolve(stream(constraints.audio.deviceId?.exact || 'default'));
    } } };
  const intervals = new Set(), sandbox = { console, App, navigator, Set, WeakMap, Float32Array,
    document: { hidden: false, addEventListener: (name, fn) => (documentListeners[name] || (documentListeners[name] = [])).push(fn), getElementById() { return null; } },
    setTimeout: () => 0, clearTimeout() {}, setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn) };
  sandbox.window = sandbox; vm.createContext(sandbox);
  for (const filename of ['js/pitch-detector.js', 'js/tonein.js', 'js/audioin.js', 'js/practice-input.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', filename), 'utf8'), sandbox);
  return { sandbox, App, calls, tracks, nodes, context, intervals, values, liveBeforeCapture, resolve: () => pendingResolvers.shift()(),
    show: () => { sandbox.document.hidden = false; (documentListeners.visibilitychange || []).forEach(fn => fn()); },
    devicesChanged: () => (mediaListeners.devicechange || []).forEach(fn => fn()),
    create: extra => new sandbox.PracticeInput(Object.assign({ clock: () => context.currentTime }, extra)) };
}

(async () => {
  console.log('# extracted shared NSDF detector');
  for (const midi of [36, 40, 45, 50, 57, 69, 81, 88, 96]) {
    const pitch = Detector.detect(tone(freq(midi)), 48000);
    ok(pitch && pitch.midi === midi && Math.abs(pitch.cents) < 2 && pitch.confidence > 0.98 && !pitch.ambiguous,
      'pure sine MIDI ' + midi + ' keeps its actual octave with high confidence');
  }
  const guitar = Detector.detect(tone(110, { harmonics: [1, 0.7, 0.4, 0.2] }), 48000);
  ok(guitar && guitar.midi === 45 && !guitar.ambiguous, 'harmonic guitar-like signal keeps the fundamental rather than the loudest overtone');
  const ambiguity = Detector.detect(tone(110, { harmonics: [0.1, 1] }), 48000);
  ok(ambiguity && ambiguity.ambiguous, 'competing harmonic octave is marked uncertain instead of guessed');
  const noise = Detector.detect(randomNoise(), 48000);
  ok(!noise || noise.confidence < 0.7, 'broadband noise has no confident note');
  ok(!Detector.detect(new Float32Array(4096), 48000) && !Detector.detect(tone(110, { amplitude: 0.001 }), 48000), 'silence and below-floor signal are gated');
  ok(!Detector.detect([NaN, ...new Array(511).fill(0)], 48000) && !Detector.detect(tone(440), 0), 'non-finite PCM and invalid sample rates cannot generate a note');
  const calibrated = Detector.detect(tone(443), 48000, { referenceA4: 443 });
  ok(calibrated.midi === 69 && Math.abs(calibrated.cents) < 1, 'reference A4 calibration changes note interpretation explicitly');
  const dc = tone(146.832); for (let i = 0; i < dc.length; i++) dc[i] += 0.25;
  ok(Detector.detect(dc, 48000).midi === 50, 'DC offset is removed before periodicity analysis');
  const rate441 = Detector.detect(tone(220, { rate: 44100 }), 44100);
  ok(rate441 && rate441.midi === 57 && Math.abs(rate441.cents) < 2, 'common 44.1 kHz sample rate retains pitch accuracy');
  ok(!Detector.detect(tone(freq(108)), 48000), 'a note above the analysis range is rejected instead of borrowing an octave-down period');
  ok(!Detector.detect(tone(1567.98), 48000, { minFrequency: 55, maxFrequency: 1350 }), 'legacy limited range cannot reinterpret an out-of-range high note at half frequency');

  console.log('# monophonic normalized note state');
  const a = await fixture();
  a.feed(tone(110), 2); ok(!a.notes.length, 'one or two candidate frames cannot answer before stability confirmation');
  a.feed(tone(110)); ok(a.notes.length === 1 && a.notes[0].on && a.notes[0].midi === 45 && a.notes[0].source === 'audio' && a.notes[0].silent,
    'stable guitar pitch emits one normalized silent audio attack');
  a.feed(tone(110), 20); ok(a.notes.length === 1, 'sustained note does not farm repeated target attacks');
  for (const cents of [-25, 20, -18, 28, -12, 10, 45, 55, 40, 0]) a.feed(tone(110 * Math.pow(2, cents / 1200)));
  ok(a.notes.length === 1, 'vibrato and near-boundary pitch hysteresis preserve one held note');
  a.feed(new Float32Array(4096), 2); ok(a.notes.length === 1, 'release is debounced across quiet frames');
  a.feed(new Float32Array(4096)); ok(a.notes.length === 2 && !a.notes[1].on, 'confirmed silence emits a paired release');
  a.feed(tone(110), 3); ok(a.notes.length === 3 && a.notes[2].on, 'same-pitch fresh attack after silence is recognized');
  a.feed(tone(110, { amplitude: 0.025 }), 3); a.feed(tone(110, { amplitude: 0.2 }), 3);
  ok(a.notes.length === 5 && !a.notes[3].on && a.notes[4].on, 'decay trough followed by reliable envelope attack permits same-pitch pluck rearticulation');
  a.feed(tone(146.832), 3); ok(a.notes.slice(-2).map(n => String(n.on)).join() === 'false,true' && a.notes.at(-1).midi === 50, 'stable changed pitch releases its original note before the new attack');
  a.input.stop(); const stopped = a.notes.length; a.feed(tone(220), 5);
  ok(a.notes.length === stopped && !a.input.state.running && a.input.state.midi === null, 'Stop pairs the current release and ignores later frames without stale detected-note UI');
  a.input.dispose();

  const uncertain = await fixture(); uncertain.feed(randomNoise(), 8); uncertain.feed(tone(110, { harmonics: [0.1, 1] }), 8);
  ok(!uncertain.notes.length && uncertain.input.state.status === 'uncertain', 'noisy and octave-ambiguous frames never become wrong guessed answers');
  uncertain.feed(tone(110), 3);
  for (const cents of [65, 75, 85, 95, 105]) uncertain.feed(tone(110 * Math.pow(2, cents / 1200)));
  ok(uncertain.notes.filter(n => n.on).length === 1, 'moving bend is not a fresh note until a new pitch becomes stable');
  uncertain.feed(tone(freq(46)), 3); ok(uncertain.notes.at(-1).midi === 46 && uncertain.notes.at(-1).on, 'a stable new semitone is eventually observable instead of being permanently hidden');
  uncertain.input.dispose();
  const ranged = await fixture({ minMidi: 40, maxMidi: 64 }); ranged.feed(tone(freq(76)), 5);
  ok(!ranged.notes.length && ranged.input.state.status === 'range', 'out-of-range actual pitch is ignored without octave correction toward a score');
  ranged.input.dispose();
  const bass = await fixture({ minMidi: 24, maxMidi: 60 }); bass.feed(tone(freq(28)), 3);
  ok(bass.notes[0]?.midi === 28, 'explicit low instrument range supports bass E1 without an octave-up correction'); bass.input.dispose();
  const transposed = await fixture({ transpose: 12, referenceA4: 443, latencyMs: 80, minMidi: 40, maxMidi: 90 }); transposed.feed(tone(443), 3);
  ok(transposed.notes[0].midi === 81 && Math.abs(transposed.notes[0].cents) < 1, 'manual reference and transposition are explicit, not expected-note guesses');
  ok(Math.abs(transposed.notes[0].at - (0.025 - 0.08)) < 1e-8, 'confirmed onset keeps first candidate time and applies explicit device latency offset');
  transposed.input.dispose();
  const chord = await fixture({}, { expectedNotes: () => [60, 64, 67] });
  ok(!chord.input.state.running && chord.input.state.status === 'unsupported', 'polyphonic score target is explicitly unsupported before audio capture');
  chord.input.dispose();
  let stopOnAttack;
  const reentrant = await fixture({}, { onNote: n => { if (n.on) stopOnAttack.stop('Completed by the player.'); } });
  stopOnAttack = reentrant.input; reentrant.feed(tone(110), 3);
  ok(reentrant.input.state.status === 'off' && !reentrant.input.state.running, 'player completion inside the note callback cannot restore stale holding status'); reentrant.input.dispose();
  let stopOnRelease, releasedEvents = [];
  const releaseStop = await fixture({}, { onNote: n => { releasedEvents.push(n); if (!n.on) stopOnRelease.stop(); } });
  stopOnRelease = releaseStop.input; releaseStop.feed(tone(110), 3); releaseStop.feed(tone(146.832), 3);
  ok(releasedEvents.filter(n => n.on).length === 1 && releaseStop.input.state.status === 'off', 'a stop during old-note release prevents a late changed-pitch attack'); releaseStop.input.dispose();

  console.log('# shared stream ownership and explicit permission lifecycle');
  const shared = browserHarness(), events = [], input = shared.create({ onNote: n => events.push(n) });
  ok(!shared.calls.length && !shared.App.audioIn.tap('performance-audio'), 'constructing adapter cannot request permission or obtain an unowned tap');
  ok(await input.start({ deviceId: 'guitar' }), 'explicit Start acquires selected shared stream and analysis tap');
  ok(shared.calls.length === 1 && shared.calls[0].audio.deviceId.exact === 'guitar', 'selected USB-audio interface is opened exactly once with exact device identity');
  ok(shared.App.audioIn._t().holds.includes('performance-audio') && shared.App.audioIn.tap('performance-audio').source, 'public tap exists only while its shared hold owns the stream');
  const source = shared.nodes.find(n => n.kind === 'source'), ownAnalyser = source.edges.find(n => n.kind === 'analyser');
  ok(ownAnalyser && !ownAnalyser.edges.length && !source.edges.includes(shared.context.destination), 'adapter analyser has no edge to speakers');
  await shared.App.audioIn.hold('other-meter'); input.stop();
  ok(source.edges.length === 1 && source.edges[0].kind === 'gain' && shared.tracks[0].readyState === 'live', 'stop disconnects only its own analyser edge and preserves another consumer');
  ok(!shared.App.audioIn.tap('performance-audio') && shared.App.audioIn.tap('other-meter'), 'released tag cannot reuse another consumer’s active tap');
  shared.App.audioIn.release('other-meter'); ok(shared.tracks[0].readyState === 'ended', 'last shared consumer release stops capture tracks');
  ok(await input.start({ deviceId: 'guitar' }), 'manual new Start can reopen after an explicit stop');
  shared.tracks.at(-1).onended(); ok(!input.state.running && !shared.App.audioIn.holding && /disconnected/.test(input.state.message), 'physical track end stops adapter and releases its hold without automatic retry');
  input.dispose();
  const denied = browserHarness({ denied: true }), deniedInput = denied.create();
  ok(!(await deniedInput.start({ deviceId: 'guitar' })) && denied.calls.length === 1 && deniedInput.state.status === 'error', 'permission denial is reported once and never silently retried');
  ok(!denied.App.audioIn.holding && !denied.intervals.size, 'permission failure releases consumer ownership and creates no poller'); deniedInput.dispose();
  const missing = browserHarness({ missing: true }), missingInput = missing.create();
  ok(!(await missingInput.start({ deviceId: 'missing' })) && missing.calls.every(c => c.audio.deviceId?.exact === 'missing'), 'missing chosen input does not fall back to a default microphone');
  missingInput.dispose();
  const pending = browserHarness({ pending: true }), pendingInput = pending.create();
  const starting = pendingInput.start({ deviceId: 'guitar' }); await Promise.resolve(); await Promise.resolve(); pendingInput.stop(); pending.resolve();
  ok(!(await starting) && pending.tracks[0].readyState === 'ended' && !pendingInput.state.running, 'Stop during a permission prompt invalidates later resolution and closes its tracks'); pendingInput.dispose();
  const changing = browserHarness(), changingInput = changing.create(); await changingInput.start({ deviceId: 'guitar' });
  await changing.App.audioIn.setDevice('another-input');
  ok(!changingInput.state.running && !changing.App.audioIn.holding && !changing.intervals.size, 'source change stops analysis and does not auto-capture the new device'); changingInput.dispose();

  console.log('# legacy ToneIn capture is suspended without permission auto-resume');
  const prior = browserHarness({ tonein: true }); prior.App.tonein.start();
  await Promise.resolve(); await Promise.resolve();
  ok(prior.App.tonein.running && prior.tracks[0].readyState === 'live', 'preexisting opted-in ToneIn can be running before practice');
  const practice = prior.create(); await practice.start({ deviceId: 'guitar' });
  ok(!prior.App.tonein.running && prior.App.tonein.suspended && prior.tracks[0].readyState === 'ended', 'practice suspends and stops the preexisting ToneIn capture');
  ok(prior.liveBeforeCapture[1] === 0 && prior.calls.length === 2, 'old capture is stopped before acquiring the one shared practice stream');
  practice.stop(); const afterStop = prior.calls.length; prior.show(); prior.devicesChanged();
  await Promise.resolve(); await Promise.resolve();
  ok(prior.calls.length === afterStop && !prior.App.tonein.running && !prior.App.tonein.suspended && prior.values['audio.tonein'] === true,
    'stop preserves the ToneIn preference while return/device events cannot request permission or auto-resume capture');
  prior.App.tonein.start(); await Promise.resolve(); await Promise.resolve();
  ok(prior.App.tonein.running && prior.calls.length === afterStop + 1, 'an explicit later Settings/API start may resume the prior ToneIn opt-in'); prior.App.tonein.stop(); practice.dispose();
  const lateTone = browserHarness({ tonein: true, pending: true }); lateTone.App.tonein.start();
  const pendingPractice = lateTone.create(), pendingStart = pendingPractice.start({ deviceId: 'guitar' });
  await Promise.resolve(); await Promise.resolve(); lateTone.resolve(); await Promise.resolve();
  ok(!lateTone.App.tonein.running && lateTone.tracks[0].readyState === 'ended', 'a pre-suspension ToneIn permission resolution is closed instead of reopening competing capture');
  lateTone.resolve(); ok(await pendingStart, 'the explicitly requested shared practice stream may finish opening');
  pendingPractice.stop(); lateTone.show(); lateTone.devicesChanged(); await Promise.resolve(); await Promise.resolve();
  ok(lateTone.calls.length === 2 && lateTone.tracks.every(t => t.readyState === 'ended'), 'pending capture cancellation and suspension cannot restart either input automatically'); pendingPractice.dispose();
  console.log('ALL PASS (' + checks + ' synthetic/shared-graph checks; no hardware validated)');
})().catch(error => { console.error(error); process.exit(1); });
