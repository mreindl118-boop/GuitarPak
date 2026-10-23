// Full app + player + audio adapter + scorer. PCM, clock, media streams and
// MIDI ports are cloud fakes. Never opens a microphone or physical device.
const { chromium } = require('playwright');
const env = require('./env');
let checks = 0;
function ok(value, message) { if (!value) throw new Error(message); checks++; console.log('  PASS', message); }
const SCORE = { title: 'Original single-note audio fixture', instrument: 'guitar', bpm: 60, len: 3,
  notes: [{ m: 69, t: 0, d: 1, v: 90 }, { m: 69, t: 1, d: 1, v: 90 }, { m: 71, t: 2, d: 1, v: 90 }] };

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 1000 } });
    await context.addInitScript(() => {
      ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
      localStorage.setItem('guitarlab.fb.root', '0'); localStorage.setItem('guitarlab.fb.scale', '"major"');
      localStorage.setItem('guitarlab.midi.appSound', 'false');
      window.__gum = []; window.__fakeStreams = []; window.__mediaMode = 'success'; window.__resolveCapture = null;
      const mediaContext = new AudioContext();
      function fakeStream() {
        const dest = mediaContext.createMediaStreamDestination();
        // Silent synthetic stream. It has no source-to-speaker connection.
        __fakeStreams.push(dest.stream); return dest.stream;
      }
      const md = {
        addEventListener() {},
        enumerateDevices: () => Promise.resolve([{ kind: 'audioinput', deviceId: 'guitar', label: 'Simulated USB audio interface' }]),
        getUserMedia: constraints => {
          __gum.push(constraints);
          if (__mediaMode === 'denied') return Promise.reject(Object.assign(new Error('simulated denial'), { name: 'NotAllowedError' }));
          if (__mediaMode === 'pending') return new Promise(resolve => { __resolveCapture = () => resolve(fakeStream()); });
          return Promise.resolve(fakeStream());
        }
      };
      Object.defineProperty(navigator, 'mediaDevices', { value: md, configurable: true });
      class Port extends EventTarget {
        constructor() { super(); this.id = 'synth'; this.name = 'Simulated MIDI pickup'; this.state = 'connected'; this.onmidimessage = null; }
        receive(bytes) { const e = new Event('midimessage'); Object.defineProperty(e, 'data', { value: new Uint8Array(bytes) }); if (this.onmidimessage) this.onmidimessage(e); this.dispatchEvent(e); }
      }
      window.__midi = new Port(); navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map([['synth', __midi]]), outputs: new Map(), sysexEnabled: false });
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(env.URL);
    await page.waitForFunction(() => window.PracticeInput && window.PerformancePlayer && window.Woodshed);
    await page.evaluate(async () => {
      await App.midi.enable(); App.scaleLock.set(true);
      window.__time = 0;
      window.__change = (id, value) => { const e = document.getElementById(id); e.value = String(value); e.dispatchEvent(new Event('change', { bubbles: true })); };
      window.__state = () => PerformancePlayer.snapshot();
      window.__open = (score, mode = 'wait') => {
        App.switchTo('shed'); __time = 0;
        Woodshed.performanceStart(score, mode, { clock: () => __time, countIn: 0, inputKind: 'midi', inputId: 'all' });
        document.getElementById('pf-sound').checked = false;
      };
      window.__pcm = (midi, amplitude = 0.2, harmonics = [1], reference = 440) => {
        const f = reference * 2 ** ((midi - 69) / 12), samples = new Float32Array(4096);
        for (let i = 0; i < samples.length; i++) for (let h = 0; h < harmonics.length; h++) samples[i] += amplitude * harmonics[h] * Math.sin(2 * Math.PI * f * (h + 1) * i / 48000);
        return samples;
      };
      window.__feed = (midi, frames = 3, opts = {}) => {
        for (let i = 0; i < frames; i++) {
          __time = opts.first == null ? __time + 0.025 : opts.first + i * 0.025;
          PerformancePlayer.audioInput.feed(midi == null ? new Float32Array(4096) : __pcm(midi, opts.amplitude, opts.harmonics, opts.reference), 48000, __time);
        }
        return __state();
      };
      window.__startSynthetic = async (score, mode = 'wait', latency = 0) => {
        __open(score, mode); __change('pf-input-kind', 'audio'); __change('pf-audio-latency', latency);
        await PerformancePlayer.listenAudio(true); document.getElementById('pf-start').click(); return __state();
      };
    });

    console.log('# deliberate audio source and capability labels');
    const selection = await page.evaluate(score => {
      __open(score); const opened = __gum.length;
      __change('pf-input-kind', 'audio');
      return { opened, selected: __gum.length, panel: !document.getElementById('pf-audio-panel').hidden,
        labels: document.getElementById('pf-audio-panel').textContent, status: __state().status };
    }, SCORE);
    ok(selection.opened === 0 && selection.selected === 0 && selection.panel && selection.status === 'idle', 'opening player or selecting audio cannot request input permission or start capture');
    ok(/USB-MIDI/.test(selection.labels) && /USB audio/.test(selection.labels) && /cannot mute acoustic or direct/.test(selection.labels), 'UI distinguishes note MIDI from instrument audio and does not claim Scale Lock mutes direct sound');

    console.log('# same structured targets through MIDI and synthetic audio');
    const midi = await page.evaluate(score => {
      __open(score); document.getElementById('pf-start').click();
      [69, 69, 71].forEach(n => { __midi.receive([144, n, 100]); __midi.receive([128, n, 0]); });
      return __state();
    }, SCORE);
    ok(midi.status === 'complete' && midi.results.matched === 3, 'reference MIDI input completes the original three-note source');
    const wait = await page.evaluate(async score => {
      await __startSynthetic(score); const start = __state();
      const previewDisabled = [...document.querySelectorAll('[data-pf-note]')].every(button => button.disabled);
      PerformancePlayer.note({ midi: 69, on: true, source: 'qwerty', velocity: 100 });
      __midi.receive([144, 69, 100]); __midi.receive([128, 69, 0]);
      const isolated = __state();
      __feed(69); const first = __state(); __feed(69, 10); const held = __state();
      __feed(null); __feed(70); const wrong = __state(); __feed(null); __feed(69); const repeated = __state();
      __feed(null); __feed(71); return { start, previewDisabled, isolated, first, held, wrong, repeated, final: __state(), gum: __gum.length,
        report: document.getElementById('pf-report').textContent, input: PerformancePlayer.audioInput.state };
    }, SCORE);
    ok(wait.previewDisabled && wait.isolated.results.matched === 0 && wait.isolated.held.length === 0, 'audio mode keeps the keyboard as a disabled preview and ignores QWERTY/MIDI answers before real synthetic audio advances');
    ok(wait.start.status === 'running' && wait.first.results.matched === 1 && wait.held.results.matched === 1, 'a stable sung/clean sine note answers once while sustained pitch cannot farm repeats');
    ok(wait.wrong.results.wrong === 1 && wait.wrong.current.notes[0] === 69, 'raw out-of-scale audio mistake remains visible and cannot advance the target');
    ok(wait.repeated.current.notes[0] === 71 && wait.final.status === 'complete' && wait.final.results.matched === midi.results.matched, 'release and fresh same-pitch audio attack follow the same source sequence as MIDI');
    ok(wait.final.results.accuracy === 75 && /accuracy/.test(wait.report) && !wait.input.running && wait.input.status === 'off', 'audio mistakes remain in final results and completion cleanly stops listening');
    ok(wait.gum === 0, 'synthetic audio flow opens no microphone, permission, or physical input');
    const guitar = await page.evaluate(async () => {
      await __startSynthetic({ title: 'Original guitar harmonic fixture', bpm: 60, len: 1, notes: [{ m: 45, t: 0, d: 1, v: 90 }] });
      __feed(45, 3, { harmonics: [1, 0.7, 0.4, 0.2] }); return __state();
    });
    ok(guitar.status === 'complete' && guitar.results.matched === 1 && guitar.results.extra === 0, 'guitar-like harmonic audio completes its exact sounding-octave target');

    console.log('# tempo calibration and release duration');
    const timed = await page.evaluate(async () => {
      const score = { title: 'Original delayed audio fixture', bpm: 60, len: 2, notes: [{ m: 69, t: 1, d: 0.5, v: 90 }] };
      await __startSynthetic(score, 'tempo', 80);
      __feed(69, 3, { first: 1.08 }); const matched = __state();
      __feed(null, 3, { first: 1.58 }); const released = __state();
      __time = 2.6; PerformancePlayer.tick(); return { matched, released, final: __state(), report: document.getElementById('pf-report').textContent };
    });
    ok(timed.matched.results.matched === 1 && timed.matched.results.missed === 0 && timed.matched.results.meanAbsTimingMs < 2,
      'known 80 ms synthetic detection delay plus confirmation is compensated without a false late attack: ' + timed.matched.results.meanAbsTimingMs);
    ok(timed.released.results.durationSamples === 1 && Math.abs(timed.released.results.meanDurationErrorBeats) < 0.01, 'release debounce preserves first quiet-frame time for compensated hold duration');
    ok(timed.final.status === 'complete' && /timing|hold/i.test(timed.report), 'tempo audio produces a complete onset/duration results report');

    console.log('# chords require explicit adapted source');
    const adapted = await page.evaluate(() => {
      __open({ title: 'Original chord adaptation fixture', bpm: 60, len: 1, notes: [60, 64, 67].map(m => ({ m, t: 0, d: 1, v: 90 })) });
      __change('pf-input-kind', 'audio');
      const blocked = document.getElementById('pf-start').disabled, visible = !document.getElementById('pf-arpeggio').hidden;
      document.getElementById('pf-arpeggio').click();
      return { blocked, visible, groups: PerformancePlayer.engine.normalized.groups.map(g => g.notes), warnings: __state().warnings, gum: __gum.length };
    });
    ok(adapted.blocked && adapted.visible && adapted.groups.length === 3 && adapted.groups.every(g => g.length === 1), 'polyphonic audio score is disabled and visible arpeggio action creates single-note targets');
    ok(adapted.warnings.some(w => /adapted exercise, not the original chord timing/.test(w)) && adapted.gum === 0, 'arpeggio conversion is labelled as adapted timing and does not auto-open capture');

    console.log('# explicit fake capture, cancellation and navigation');
    await page.evaluate(score => { __open(score); __change('pf-input-kind', 'audio'); __change('pf-audio-device', 'guitar'); document.getElementById('pf-start').click(); }, SCORE);
    await page.waitForFunction(() => PerformancePlayer.snapshot().status === 'running');
    const capture = await page.evaluate(() => {
      const running = PerformancePlayer.audioInput.state.running, hold = App.audioIn._t().holds.includes('performance-audio');
      document.getElementById('pf-pause').click();
      return { running, hold, paused: __state().status, stopped: !PerformancePlayer.audioInput.state.running,
        ended: __fakeStreams.at(-1).getTracks().every(t => t.readyState === 'ended'), gum: __gum.length };
    });
    ok(capture.running && capture.hold && capture.paused === 'paused' && capture.stopped && capture.ended, 'Pause releases the exact shared capture hold and fake MediaStream tracks');
    const beforeResume = await page.evaluate(() => { const before = __gum.length; document.getElementById('pf-pause').click(); return before; });
    await page.waitForFunction(before => __gum.length > before && PerformancePlayer.snapshot().status === 'running', beforeResume);
    const resumed = await page.evaluate(() => ({ running: PerformancePlayer.audioInput.state.running, live: __fakeStreams.at(-1).getTracks().some(t => t.readyState === 'live') }));
    ok(resumed.running && resumed.live, 'deliberate Resume reacquires audio successfully before the beat clock runs');
    const sourceChange = await page.evaluate(async () => { const before = __gum.length; await App.audioIn.setDevice('changed-in-settings');
      return { before, after: __gum.length, state: __state(), audio: PerformancePlayer.audioInput.state, stopped: __fakeStreams.at(-1).getTracks().every(t => t.readyState === 'ended') }; });
    ok(sourceChange.before === sourceChange.after && sourceChange.state.status === 'paused' && !sourceChange.audio.running && sourceChange.stopped,
      'changing shared audio input stops analysis, pauses scoring, and does not open the new source automatically');
    const pendingCount = await page.evaluate(score => {
      __mediaMode = 'pending'; __open(score); __change('pf-input-kind', 'audio'); document.getElementById('pf-start').click(); return __gum.length;
    }, SCORE);
    await page.waitForFunction(count => __gum.length > count && typeof __resolveCapture === 'function', pendingCount);
    const cancelled = await page.evaluate(async () => {
      document.getElementById('pf-stop').click(); __resolveCapture(); await new Promise(resolve => setTimeout(resolve, 30));
      return { state: __state(), tracks: __fakeStreams.at(-1).getTracks().every(t => t.readyState === 'ended'), held: App.audioIn.holding };
    });
    ok(cancelled.state.status === 'stopped' && cancelled.tracks && !cancelled.held, 'Stop while permission is pending closes late capture and never starts a run');
    const denied = await page.evaluate(async score => {
      __mediaMode = 'denied'; __open(score); __change('pf-input-kind', 'audio');
      const before = __gum.length; const started = await PerformancePlayer.listenAudio();
      return { started, calls: __gum.length - before, state: PerformancePlayer.audioInput.state, held: App.audioIn.holding };
    }, SCORE);
    ok(!denied.started && denied.calls === 1 && denied.state.status === 'error' && !denied.held, 'explicit denied capture reports failure once without stale consumer ownership');
    const nav = await page.evaluate(async score => {
      await __startSynthetic(score); __feed(69); App.switchTo('piano');
      return { state: __state(), input: PerformancePlayer.audioInput.state, gum: __gum.length };
    }, SCORE);
    ok(nav.state.status === 'paused' && !nav.state.held.length && !nav.input.running, 'leaving the player releases audio-derived held notes and stops analysis');
    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await page.evaluate(score => { __open(score); __change('pf-input-kind', 'audio');
      return { width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, start: !!document.getElementById('pf-audio-listen') }; }, SCORE);
    ok(phone.start && phone.scroll <= phone.width + 2, 'phone audio controls fit the page without horizontal document overflow');
    ok(!errors.length, 'no browser runtime errors: ' + errors.join('; '));
    console.log('ALL PASS (' + checks + ' browser audio checks; synthetic PCM/fake streams only, no hardware validated)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
