// Silent regression: actual MP3 decode and production piano/master graph.
// Every AudioContext is replaced by an OfflineAudioContext; the browser also
// mutes audio, blocks external requests and uses a fresh, permission-free profile.
const assert = require('assert/strict');
const fs = require('fs'), http = require('http'), path = require('path');
const { chromium } = require('playwright');
const env = require('./env');
const root = env.ROOT;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const name = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!name.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(name, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

async function render(browser, origin, options) {
  const opts = Object.assign({ tone: 'grand', volume: 100, kind: 'live', velocity: 127, notes: [60] }, options);
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1200, height: 900 } });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || (opts.fallback && /\/samples\//.test(url.pathname))) return route.abort();
    return route.continue();
  });
  await context.addInitScript(opts => {
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.app.pianoTone', JSON.stringify(opts.tone));
    localStorage.setItem('guitarlab.app.vol', JSON.stringify(opts.volume));
    localStorage.setItem('guitarlab.pn.voice', '"piano"');
    if (opts.smartChord) localStorage.setItem('guitarlab.pn.perf', JSON.stringify({ chords: '7th', bass: true }));
    window.SL_ARTIFACT = true;
    const NativeOffline = window.OfflineAudioContext;
    window.__audioTest = { loaded: 0, pending: 0, sources: [], gains: [], shapers: [], oscillators: [] };
    function SilentContext() {
      const c = new NativeOffline(2, 96000, 48000), test = window.__audioTest;
      test.context = c;
      test.resumeRender = c.resume.bind(c);
      c.resume = () => Promise.resolve(); // no render until startRendering()
      for (const [method, key] of [['createBufferSource', 'sources'], ['createGain', 'gains'], ['createWaveShaper', 'shapers'], ['createOscillator', 'oscillators']]) {
        const native = c[method].bind(c);
        c[method] = function () { const node = native(); test[key].push(node); return node; };
      }
      const decode = c.decodeAudioData.bind(c);
      c.decodeAudioData = function (bytes, success, failure) {
        test.pending++;
        return decode(bytes, b => { test.pending--; if (success) success(b); }, e => { test.pending--; if (failure) failure(e); });
      };
      return c;
    }
    window.AudioContext = window.webkitAudioContext = SilentContext;
    navigator.requestMIDIAccess = () => Promise.reject(new Error('MIDI disabled in offline test'));
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('Capture disabled in offline test'));
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      const dir = opts.tone === 'grand' ? 'piano2' : 'keys';
      if (String(url).includes('samples/' + dir + '/')) this.addEventListener('load', () => { if (this.status === 200) window.__audioTest.loaded++; });
      return open.apply(this, arguments);
    };
  }, opts);
  const page = await context.newPage();
  try {
    await page.goto(origin + '/index.html');
    await page.waitForFunction(fallback => window.App && App.keys && (fallback || window.__audioTest.loaded === 7), opts.fallback);
    await page.evaluate(() => { App.switchTo('piano'); App.keys.warm(); });
    await page.waitForFunction(fallback => __audioTest.pending === 0 && (fallback || App.keys.ready()), opts.fallback);
    return await page.evaluate(async opts => {
      const test = __audioTest, c = test.context;
      if (!(c instanceof OfflineAudioContext)) throw new Error('Real-time audio prohibited');
      if (test.sources.length) throw new Error('Unexpected voice before test');
      for (const note of opts.notes) {
        if (opts.kind === 'scheduled') App.keys.play(note, 0, 1.6, opts.gain);
        else if (opts.kind === 'touch') document.querySelector('.pn-key[data-midi="' + note + '"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        else App.emit('midi:note', { on: true, midi: note, vel: opts.velocity, chan: 0 });
      }
      function stats(buffer, seconds, start) {
        let peak = 0, sum = 0, count = 0, finite = true;
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
          const d = buffer.getChannelData(ch), n = Math.min(d.length, Math.round((seconds || buffer.duration) * buffer.sampleRate));
          for (let i = Math.round((start || 0) * buffer.sampleRate); i < n; i++) { finite = finite && Number.isFinite(d[i]); peak = Math.max(peak, Math.abs(d[i])); sum += d[i] * d[i]; count++; }
        }
        return { peak, rms: Math.sqrt(sum / count), finite };
      }
      // A pointer event also starts the app's silent warmup buffer. Report the
      // analyzed piano sample, rather than treating warmup as the piano voice.
      const sampled = test.sources.filter(s => s.buffer && s.buffer.__norm !== undefined);
      const source = sampled[0] && sampled[0].buffer;
      const result = { tone: App.pianoTone, volume: App.volume, master: c.destination.gain.value, source: source ? stats(source) : null, norm: source ? App.sampleNorm(source) : null, lead: source ? App.sampleLead(source) : null, sources: test.sources.length, oscillators: test.oscillators.length, clipper: test.shapers.map(s => ({ oversample: s.oversample, points: s.curve.length })), preGain: test.gains[1].gain.value };
      const normalization = result.normalization = {};
      for (const [name, value] of [['silence', 0], ['quiet', 0.0001], ['capped', 0.01], ['normal', 0.6], ['hot', 2]]) {
        const b = c.createBuffer(1, 4800, c.sampleRate);
        b.getChannelData(0).fill(value);
        normalization[name] = { gain: App.sampleNorm(b), lead: App.sampleLead(b) };
      }
      // Pressure must arrive after the attack ramp. Applying it at time zero
      // would be superseded by the existing 2.5ms ramp and test nothing.
      const paused = opts.pressure == null ? null : c.suspend(0.1);
      const rendering = c.startRendering();
      if (paused) {
        await paused;
        result.pressureAt = c.currentTime;
        App.emit('midi:pressure', { chan: 0, val: opts.pressure });
        await test.resumeRender();
      }
      const audio = await rendering;
      result.output = stats(audio);
      result.firstSecond = stats(audio, 1);
      result.pressureTail = stats(audio, 1, 0.3);
      return result;
    }, opts);
  } finally { await context.close(); }
}

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
    const grand = await render(browser, origin, {});
    const bright = await render(browser, origin, { tone: 'bright' });
    const preview = await render(browser, origin, { kind: 'scheduled' });
    console.log('Decoded piano levels', JSON.stringify({ grand, bright, preview }));
    assert(grand.output.peak > 0.25, 'Normalized Grand must not retain the obsolete 0.21 attenuation');
    assert(preview.output.peak > 0.18, 'Scheduled Grand preview must share corrected level');
    assert(Math.abs(grand.output.peak - 0.444) < 0.005, 'Full-velocity Grand C4 keeps the 0.6 normalization target and 0.74 velocity envelope');
    assert(Math.abs(preview.output.peak - 0.3) < 0.005, 'Default preview uses half the normalized sample level');
    assert(grand.firstSecond.rms / bright.firstSecond.rms > 0.8 && grand.firstSecond.rms / bright.firstSecond.rms < 1.25, 'Grand/Bright C4 first-second RMS should be comparable');
    assert(Math.abs(bright.output.peak - 0.240695) < 0.005, 'Bright bank remains at its existing level');
    console.log('PASS: actual decoded Grand live/preview levels and Bright loudness comparison');

    const cases = { grand, bright, preview };
    for (const volume of [0, 50]) cases['master' + volume] = await render(browser, origin, { volume });
    assert(cases.master0.output.peak < 1e-6, 'Master zero is silent');
    assert(Math.abs(cases.master50.output.peak / grand.output.peak - 0.5) < 0.01, 'Master 50 halves amplitude below the clipper knee');
    for (const [name, test] of Object.entries(cases)) {
      assert(test.preGain === 0.5 && test.clipper.length === 1 && test.clipper[0].oversample === 'none', name + ': zero-delay master safety chain unchanged');
    }
    console.log('PASS: master 0/50/100 and existing zero-delay clipper');

    cases.soft = await render(browser, origin, { velocity: 32 });
    cases.medium = await render(browser, origin, { velocity: 90 });
    cases.touch = await render(browser, origin, { kind: 'touch' });
    assert(cases.soft.output.peak < cases.medium.output.peak && cases.medium.output.peak < grand.output.peak, 'Piano preserves velocity dynamics');
    assert(Math.abs(cases.touch.output.peak - cases.medium.output.peak) < 1e-5, 'On-screen touch and MIDI velocity 90 share the piano path');
    console.log('PASS: soft/medium/hard dynamics and on-screen/MIDI parity');

    cases.smartChord = await render(browser, origin, { smartChord: true });
    cases.pressureChord = await render(browser, origin, { smartChord: true, pressure: 127 });
    cases.zeroPressure = await render(browser, origin, { pressure: 0 });
    cases.sum = await render(browser, origin, { notes: [48, 52, 57, 60, 64, 69, 72], pressure: 127 });
    assert(cases.smartChord.sources === 5 && cases.pressureChord.sources === 5, 'Smart seventh chord plus bass uses five real sampled voices');
    assert(cases.smartChord.output.peak < 0.8, 'Built-in chord energy sharing retains headroom below the soft knee');
    assert(cases.pressureChord.pressureTail.rms > cases.smartChord.pressureTail.rms * 1.25, 'Maximum MIDI pressure raises the held chord after its attack');
    assert(cases.zeroPressure.pressureTail.rms < grand.pressureTail.rms * 0.45, 'Zero MIDI pressure retains the existing softer held-note expression');
    assert(cases.sum.sources === 7 && cases.sum.output.peak > grand.output.peak, 'A summed full-velocity chord exercises the safety path');
    console.log('PASS: five-note chord sharing, maximum pressure and dense summed-chord safety');

    cases.fallback = await render(browser, origin, { fallback: true });
    cases.fallbackPreview = await render(browser, origin, { fallback: true, kind: 'scheduled' });
    assert(cases.fallback.sources === 0 && cases.fallback.oscillators === 1, 'Missing piano samples use the real synth fallback');
    assert(cases.fallbackPreview.sources === 0 && cases.fallbackPreview.oscillators === 1, 'Scheduled preview retains synth fallback');
    assert(cases.fallback.output.peak > 0.1 && cases.fallbackPreview.output.peak > 0.1, 'Fallback is audible in the rendered buffer without obsolete attenuation');
    console.log('PASS: missing-sample live and preview fallback');

    const norm = grand.normalization;
    assert(norm.silence.gain === 1 && norm.quiet.gain === 1 && norm.capped.gain === 4, 'Silent/nearly silent samples do not cause unbounded normalization');
    assert(Math.abs(norm.normal.gain - 1) < 1e-6 && Math.abs(norm.hot.gain - 0.3) < 1e-6, 'Normal/hot samples follow the existing peak normalization');
    for (const [name, test] of Object.entries(cases)) {
      assert(test.output.finite && test.output.peak <= 1 && test.output.peak >= 0, name + ': all rendered output remains finite and bounded');
      for (const analyzed of Object.values(test.normalization)) assert(Number.isFinite(analyzed.gain) && Number.isFinite(analyzed.lead), name + ': normalization metadata is finite');
    }
    console.log('PASS: normalization cap/silence and finite, bounded output across all paths');
    console.log('Audio level summary', JSON.stringify(Object.fromEntries(Object.entries(cases).map(([name, test]) => [name, { peak: test.output.peak, rmsFirstSecond: test.firstSecond.rms, pressureTailRms: test.pressureTail.rms }]))));
    // Optional evidence output is a caller-selected local file; no personal data.
    if (process.env.SL_AUDIO_REPORT) fs.writeFileSync(process.env.SL_AUDIO_REPORT, JSON.stringify(cases, null, 2) + '\n');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
