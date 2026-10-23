// Built-in internal note admission and scheduled-voice cleanup. Node VM graphs
// inspect production synth/sampler/Jam paths; real OfflineAudioContext renders
// verify silence without speakers, permissions, physical ports or hardware.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { chromium } = require('playwright');
const env = require('./env');
const source = name => fs.readFileSync(path.join(env.ROOT, name), 'utf8');
let checks = 0;
function ok(value, message) { if (!value) throw new Error(message); checks++; console.log('  PASS', message); }
function graph() {
  const nodes = [];
  function param() {
    return { value: 0, setValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; },
      linearRampToValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; }, cancelScheduledValues() {} };
  }
  function node(type) {
    const n = { kind: type, type, frequency: param(), detune: param(), gain: param(), Q: param(), playbackRate: param(),
      starts: [], stops: [], connect() {}, disconnect() { this.disconnected = true; },
      start(...args) { this.starts.push(args); }, stop(time) { this.stops.push(time); }, addEventListener() {} };
    nodes.push(n); return n;
  }
  return { nodes, currentTime: 1, sampleRate: 128, destination: {},
    createOscillator: () => node('osc'), createBufferSource: () => node('buffer'), createGain: () => node('gain'),
    createBiquadFilter: () => node('filter'), createStereoPanner: () => Object.assign(node('pan'), { pan: param() }),
    createBuffer: (channels, length, rate) => ({ duration: length / rate, sampleRate: rate,
      getChannelData: () => new Float32Array(length) }) };
}
function harness() {
  const bus = {}, values = { 'fb.root': 0, 'fb.scale': 'major', 'scale.lock': true }, sandbox = { console };
  const App = {
    store: { get: (k, fallback) => values[k] === undefined ? fallback : values[k] },
    on: (name, fn) => { (bus[name] || (bus[name] = [])).push(fn); },
    emit: (name, data) => { for (const fn of bus[name] || []) fn(data); },
    register() {}, getAudio: () => sandbox.ctx, wake: { release() {} }
  };
  sandbox.window = sandbox; sandbox.App = App; sandbox.setTimeout = () => 0; sandbox.clearTimeout = () => {};
  sandbox.setInterval = () => 0; sandbox.clearInterval = () => {}; sandbox.document = {};
  vm.createContext(sandbox); vm.runInContext(source('js/theory.js'), sandbox);
  App.scaleLock = { get on() { return values['scale.lock']; },
    contains: note => sandbox.Theory.scaleInfo(values['fb.root'], values['fb.scale']).pcToStep.has(sandbox.Theory.mod12(note)),
    allows: note => !values['scale.lock'] || App.scaleLock.contains(note) };
  vm.runInContext(source('js/daw/synth.js'), sandbox); vm.runInContext(source('js/daw/engine.js'), sandbox);
  return { sandbox, App, values, DAW: sandbox.DAW };
}

async function browserRenders() {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--mute-audio'] });
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><title>Silent internal lock simulation</title>');
    await page.addScriptTag({ content: source('js/theory.js') });
    await page.evaluate(() => {
      const bus = {}; window.__root = 0; window.__lock = true;
      window.App = { on: (n, fn) => { (bus[n] || (bus[n] = [])).push(fn); },
        emit: (n, d) => { for (const fn of bus[n] || []) fn(d); },
        store: { get: (k, fallback) => ({ 'fb.root': __root, 'fb.scale': 'major', 'met.bpm': 120 })[k] ?? fallback },
        wake: { release() {}, acquire() {} },
        scaleLock: { get on() { return __lock; }, allows: n => !__lock || Theory.scaleInfo(__root, 'major').pcToStep.has(Theory.mod12(n)) } };
    });
    await page.addScriptTag({ content: source('js/daw/synth.js') });
    await page.addScriptTag({ content: source('js/daw/engine.js') });
    const result = await page.evaluate(async () => {
      const energy = buffer => Array.from(buffer.getChannelData(0)).reduce((s, v) => s + v * v, 0);
      async function note(kind, pitch, opts = {}) {
        const ctx = new OfflineAudioContext(1, 48000, 48000);
        let inst;
        if (kind === 'synth') inst = DAW.createSynth(ctx, DAW.defaultSynth());
        else {
          const buffer = ctx.createBuffer(1, 24000, 48000), data = buffer.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * 2 * Math.PI * 261.63 / 48000) * 0.5;
          DAW.samples.test = buffer;
          inst = DAW.createSampler(ctx, { sampleId: 'test', rootNote: opts.audio ? pitch : 60, loop: true,
            start: 0, end: 1, env: { a: 0.003, d: 0.1, s: 0.9, r: 0.05 }, gain: 0.9 });
        }
        inst.output.connect(ctx.destination);
        const meta = opts.audio ? { audioClip: true } : undefined;
        const at = opts.future ? 0.5 : 0.02;
        inst.noteOn(pitch, 0.8, at, 5, meta); inst.noteOff(pitch, at + 0.2, 5, meta);
        if (opts.flush) App.emit('scale:boundary', { reason: 'test' });
        const value = energy(await ctx.startRendering()); inst.dispose(); return value;
      }
      const out = { synthBlocked: await note('synth', 61), synthAllowed: await note('synth', 60),
        sampleBlocked: await note('sample', 61), sampleAllowed: await note('sample', 60),
        scheduledSynthFlushed: await note('synth', 60, { future: true, flush: true }),
        scheduledSampleFlushed: await note('sample', 60, { future: true, flush: true }),
        opaqueRecording: await note('sample', 61, { audio: true, future: true, flush: true }) };
      const track = (pitch, src) => ({ id: 'render-test', kind: 'synth', voice: 'keys', notes: [{ m: pitch, v: 100, t: 0, d: 0.25 }],
        mix: { vol: 80 }, fx: { type: 'none' }, clips: [{ start: 0, len: 1, src: src || 'pattern' }] });
      const wavEnergy = async blob => { const view = new DataView(await blob.arrayBuffer()); let sum = 0;
        for (let i = 44; i < view.byteLength; i += 2) sum += view.getInt16(i, true) ** 2; return sum; };
      DAW.engine.tracks = [track(61)]; out.loopBlocked = await wavEnergy(await DAW.engine.render());
      DAW.engine.tracks = [track(60)]; out.loopAllowed = await wavEnergy(await DAW.engine.render());
      DAW.engine.tracks = [track(61)]; out.arrangementBlocked = await wavEnergy(await DAW.engine.renderSong());
      DAW.engine.tracks = [track(60)]; out.arrangementAllowed = await wavEnergy(await DAW.engine.renderSong());
      DAW.samples['render-test'] = DAW.samples.test;
      DAW.engine.tracks = [Object.assign(track(61), { kind: 'sampler', sampler: { rootNote: 60, loop: true } })];
      out.samplerLoopBlocked = await wavEnergy(await DAW.engine.render());
      DAW.engine.tracks = [Object.assign(track(60), { kind: 'sampler', sampler: { rootNote: 60, loop: true } })];
      out.samplerLoopAllowed = await wavEnergy(await DAW.engine.render());
      DAW.engine.tracks = [Object.assign(track(61, 'audio'), { kind: 'sampler', sampler: { rootNote: 61, loop: true } })];
      out.recordingArrangement = await wavEnergy(await DAW.engine.renderSong());
      return out;
    });
    for (const k of ['synthBlocked', 'sampleBlocked', 'scheduledSynthFlushed', 'scheduledSampleFlushed', 'loopBlocked', 'arrangementBlocked', 'samplerLoopBlocked']) {
      ok(result[k] === 0, 'real silent render: ' + k + ' has zero sample energy');
    }
    for (const k of ['synthAllowed', 'sampleAllowed', 'opaqueRecording', 'loopAllowed', 'arrangementAllowed', 'samplerLoopAllowed', 'recordingArrangement']) {
      ok(result[k] > 0, 'real silent render: ' + k + ' remains audible in the offline buffer');
    }
    await page.close();
  } finally { await browser.close(); }
}

(async () => {
  const h = harness(), { DAW, App, values } = h;
  console.log('# shared factory admission, channels, releases and disposal');
  for (let root = 0; root < 12; root++) {
    values['fb.root'] = root;
    const admitted = [], released = [], bends = [];
    const inst = DAW.guardPitched({ noteOn: (...args) => admitted.push(args), noteOff: (...args) => released.push(args),
      pitchBend: (...args) => bends.push(args), allNotesOff() {}, dispose() {} });
    for (let channel = 0; channel < 16; channel++) for (let note = 60; note < 72; note++) {
      inst.noteOn(note, 0.7, 5, channel); inst.noteOff(note, 6, channel);
    }
    ok(admitted.length === 7 * 16 && admitted.every(a => App.scaleLock.contains(a[0]) && a[1] === 0.7), 'root ' + root + ': all sixteen channels admit exactly seven unchanged pitches');
    ok(released.length === 12 * 16 && released.every(a => a[1] === 6), 'root ' + root + ': note-offs always pass, including notes no longer admitted');
    inst.pitchBend(2, 7); ok(bends[0][0] === 0 && bends[0][1] === 7, 'root ' + root + ': locked pitch bend is neutral on the original channel');
    inst.dispose();
  }
  values['fb.root'] = 0;
  let released = [], stops = 0;
  const inst = DAW.guardPitched({ noteOn() {}, noteOff: (...a) => released.push(a), allNotesOff() { stops++; }, dispose() {} });
  inst.noteOn(60, 0, 4, 9); ok(released.length === 1 && released[0][0] === 60 && released[0][2] === 9, 'zero-velocity instrument Note On becomes its matching channel release');
  App.emit('scale:boundary'); ok(stops === 1, 'scale boundary clears registered pitched instruments');
  inst.dispose(); const before = stops; App.emit('scale:boundary'); ok(stops === before, 'disposed instruments unregister from future cleanup');
  values['scale.lock'] = false;
  const open = [], unlocked = DAW.guardPitched({ noteOn: (...a) => open.push(a), noteOff() {}, allNotesOff() {}, dispose() {} });
  unlocked.noteOn(61, 0.8, 0, 2); ok(open.length === 1 && open[0][0] === 61, 'unlocked instruments preserve chromatic notes'); unlocked.dispose();
  values['scale.lock'] = true;

  console.log('# actual internal factories and explicit opaque recording scope');
  const ctx = graph(); h.sandbox.ctx = ctx;
  const synth = DAW.createSynth(ctx, DAW.defaultSynth());
  let from = ctx.nodes.length; synth.noteOn(61, 0.8, 1, 2);
  ok(ctx.nodes.length === from, 'production synth rejects disallowed pitch before constructing voice nodes');
  synth.noteOn(60, 0.8, 20, 2);
  const future = ctx.nodes.filter(n => n.kind === 'osc' && n.starts.some(a => a[0] === 20));
  App.emit('scale:boundary'); ok(future.length === 2 && future.every(n => n.stops.includes(ctx.currentTime + 0.08)), 'boundary cancels already scheduled future synth oscillators');
  synth.dispose();
  DAW.samples.test = { duration: 1 };
  const sampler = DAW.createSampler(ctx, { sampleId: 'test', rootNote: 60, loop: true, start: 0, end: 1,
    env: { a: 0.003, d: 0.1, s: 0.9, r: 0.1 }, gain: 0.9 });
  from = ctx.nodes.length; sampler.noteOn(61, 0.9, 1, 3);
  ok(ctx.nodes.length === from, 'production pitched sampler rejects disallowed pitch before constructing a source');
  sampler.noteOn(60, 0.9, 20, 3); const melodic = ctx.nodes.filter(n => n.kind === 'buffer').at(-1);
  sampler.noteOn(61, 0.9, 20, 4, { audioClip: true }); const recording = ctx.nodes.filter(n => n.kind === 'buffer').at(-1);
  App.emit('scale:boundary');
  ok(melodic.stops.includes(ctx.currentTime + 0.08) && recording.stops.length === 0, 'boundary cancels pitched samples while explicit opaque recordings keep playing');
  sampler.allNotesOff(); ok(recording.stops.length === 1, 'normal transport stop still releases opaque recording sources'); sampler.dispose();
  const drum = DAW.createDrums(ctx, { gain: 0.9, lanes: Array.from({ length: 8 }, () => ({ tune: 0, decay: 0.3, level: 0.9 })) });
  from = ctx.nodes.length; drum.noteOn(1, 0.8, 1); const percussion = ctx.nodes.slice(from).filter(n => n.starts.length);
  App.emit('scale:boundary'); ok(percussion.length > 0 && percussion.every(n => !n.stops.includes(ctx.currentTime + 0.08)), 'drum lane one remains unpitched and is not muted by scale-boundary cleanup'); drum.dispose();

  console.log('# Jam direct sampled and oscillator voices');
  const jamCode = source('js/jam.js').replace("  App.register('jam', {", "  window.__jamSound = { setContext: function(c) { ctx = c; }, sample: playSample, bass: bassSynth, pad: padSynth, keys: keysSynth, clear: clearMelodic, seed: function(b) { sampleBuf['keys/60'] = b; } };\n  App.register('jam', {");
  vm.runInContext(jamCode, h.sandbox); h.sandbox.__jamSound.setContext(ctx); h.sandbox.__jamSound.seed({ duration: 1 });
  const jam = h.sandbox.__jamSound;
  from = ctx.nodes.length;
  ok(jam.sample('keys', 61, 1, 0.2, 0.5) === true && ctx.nodes.length === from, 'blocked Jam sample is handled without source construction or fallback');
  jam.bass(1, 61, 0.3, 0.5); ok(ctx.nodes.length === from, 'Jam bass fallback rejects disallowed pitch');
  jam.pad(20, [60, 61, 64], 0.5, 0.5); jam.keys(20, [60, 61, 64], 0.5);
  const pitched = ctx.nodes.slice(from).filter(n => n.kind === 'osc' && n.starts.length);
  ok(pitched.length === 4 && pitched.every(n => [h.sandbox.Theory.noteFreq(60), h.sandbox.Theory.noteFreq(64)].includes(n.frequency.value)), 'Jam fallback chords retain allowed tones without remapping the blocked tone');
  jam.sample('keys', 60, 20, 0.3, 0.5); const sample = ctx.nodes.filter(n => n.kind === 'buffer').at(-1);
  App.emit('scale:boundary'); ok(pitched.every(n => n.stops.includes(ctx.currentTime)) && sample.stops.includes(ctx.currentTime), 'Jam boundary stops both future oscillator and sampled melodic sources');
  await browserRenders();
  console.log('ALL PASS (' + checks + ' checks) — software graphs and silent offline renders only');
})().catch(error => { console.error('FAIL', error.stack); process.exitCode = 1; });
