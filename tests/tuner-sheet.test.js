// Actual shell/Tuner/shared audio-input graph; WebAudio generates fake input.
// getUserMedia never reaches a physical device. Hardware accuracy is unverified.
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const env = require('./env');
let checks = 0;
function ok(value, message) { assert(value, message); checks++; console.log('  PASS', message); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      ['help.seen', 'help.done', 'qz.landed'].forEach(key => localStorage.setItem('guitarlab.' + key, 'true'));
      window.__capture = { calls: [], streams: [], pending: [], mode: 'immediate', frequency: 440, midi: 0 };
      navigator.requestMIDIAccess = () => { __capture.midi++; return Promise.reject(new Error('No physical MIDI in cloud tests')); };
      const device = id => ({ kind: 'audioinput', deviceId: id, groupId: id, label: 'Synthetic line ' + id });
      navigator.mediaDevices.enumerateDevices = () => Promise.resolve([device('usb-line'), device('other-line')]);
      window.__makeStream = id => {
        const ctx = new AudioContext(), oscillator = ctx.createOscillator(), gain = ctx.createGain(), destination = ctx.createMediaStreamDestination();
        oscillator.frequency.value = __capture.frequency; gain.gain.value = 0.2;
        oscillator.connect(gain); gain.connect(destination); oscillator.start(); ctx.resume();
        const stream = destination.stream, track = stream.getAudioTracks()[0];
        track.getSettings = () => ({ deviceId: id, echoCancellation: false, noiseSuppression: false, autoGainControl: false });
        const stop = track.stop.bind(track); let ended = false;
        track.stop = () => { if (ended) return; ended = true; stop(); oscillator.stop(); ctx.close().catch(() => {}); };
        const item = { ctx, oscillator, gain, stream, track, id }; __capture.streams.push(item); __capture.current = item;
        return stream;
      };
      navigator.mediaDevices.getUserMedia = constraints => {
        __capture.calls.push(JSON.parse(JSON.stringify(constraints)));
        const id = constraints.audio && constraints.audio.deviceId && constraints.audio.deviceId.exact || 'default';
        if (__capture.mode === 'pending') return new Promise((resolve, reject) => __capture.pending.push({ resolve: () => resolve(__makeStream(id)), reject }));
        const names = { denied: 'NotAllowedError', missing: 'NotFoundError', busy: 'NotReadableError' };
        if (names[__capture.mode]) return Promise.reject(new DOMException('Synthetic ' + __capture.mode, names[__capture.mode]));
        return Promise.resolve(__makeStream(__capture.mode === 'wrong-device' ? 'unexpected-device' : id));
      };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(env.URL);
    await page.waitForFunction(() => App.tuner && document.getElementById('tuner-btn'));
    await page.evaluate(() => {
      App.setVolume(0); App.store.set('audio.inId', 'usb-line');
      window.__openTuner = () => App.openSheet('tuner');
      window.__closeTuner = () => App.closeSheet();
      window.__toggle = () => document.getElementById('tun-toggle').click();
      window.__state = () => ({ tuner: App.tuner.state, audio: App.audioIn.state, holds: App.audioIn._t().holds,
        calls: __capture.calls.length, liveTracks: __capture.streams.filter(item => item.track.readyState === 'live').length,
        monitor: App.store.get('audio.monitor', false), selected: App.store.get('audio.inId'), output: App.store.get('audio.outId', '') });
      window.__references = [];
      const pluck = App.pluck;
      App.pluck = function () { __references.push([...arguments]); return pluck.apply(App, arguments); };
    });

    console.log('# global open is passive and old routes open the same single host');
    for (const route of ['quiz', 'piano', 'shed', 'midihub', 'tracks', 'settings']) {
      await page.evaluate(route => App.switchTo(route), route);
      await page.waitForFunction(route => App.active === route, route);
      await page.waitForFunction(() => getComputedStyle(document.getElementById('wipe')).display === 'none');
      const opened = await page.evaluate(() => {
        const active = App.active, beforeCalls = __capture.calls.length; document.getElementById('tuner-btn').click();
        return { active, beforeCalls, after: App.active, sheet: App.sheet, state: __state(), hosts: document.querySelectorAll('#panel-tuner').length,
          instances: document.querySelectorAll('#tun-toggle').length, expanded: document.getElementById('tuner-btn').getAttribute('aria-expanded') };
      });
      ok(opened.sheet === 'tuner' && opened.active === opened.after && opened.state.calls === opened.beforeCalls && !opened.state.holds.includes('tuner-analysis') && !opened.state.tuner.listening && !opened.state.tuner.pending,
        'opening Tuner from ' + route + ' leaves the route and microphone untouched');
      ok(opened.hosts === 1 && opened.instances === 1 && opened.expanded === 'true', route + ' uses one canonical Tuner/controller');
      await page.evaluate(() => __closeTuner());
    }
    await page.evaluate(() => App.switchTo('quiz'));
    await page.waitForFunction(() => App.active === 'quiz' && App.space === 'practice');
    const alias = await page.evaluate(() => { const before = App.active, calls = __capture.calls.length; App.switchTo('tuner'); return { before, active: App.active, sheet: App.sheet, beforeCalls: calls, calls: __capture.calls.length }; });
    const initialCalls = alias.calls;
    ok(alias.before === alias.active && alias.sheet === 'tuner' && alias.calls === alias.beforeCalls, 'legacy tuner route opens the passive sheet over the existing page');
    if (process.env.SL_TUNER_EVIDENCE) {
      const directory = path.dirname(process.env.SL_TUNER_EVIDENCE); fs.mkdirSync(directory, { recursive: true });
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.querySelector('#sheet-tuner .sheet-card').getAnimations().map(animation => animation.finished.catch(() => {}))); });
        await page.screenshot({ path: path.join(directory, 'tuner-default-' + width + '.png') });
      }
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    const chips = await page.evaluate(() => [...document.querySelectorAll('#tun-chips button')].map(button => button.textContent.replace('✓', '')));
    ok(chips.join(',') === 'E2,A2,D3,G3,B3,E4', 'standard tuning retains all six octave-correct reference chips');
    await page.locator('#tun-chips button').first().focus(); await page.keyboard.press('Space');
    const reference = await page.evaluate(() => ({ calls: __capture.calls.length, notes: __references, state: App.tuner.state }));
    ok(reference.calls === initialCalls && reference.notes.length === 1 && reference.notes[0][0] === 40 && !reference.state.listening,
      'Space on a reference button plays it once without starting microphone capture');

    console.log('# explicit Start uses the selected shared source and real detector');
    await page.locator('#tun-toggle').focus(); await page.keyboard.press('Space');
    await page.waitForFunction(() => App.tuner.state.listening && App.tuner.state.pitch && App.tuner.state.pitch.midi === 69 && Math.abs(App.tuner.state.pitch.cents) < 3);
    const started = await page.evaluate(() => __state());
    ok(started.calls === initialCalls + 1 && started.holds.includes('tuner-analysis') && started.tuner.deviceId === 'usb-line', 'explicit keyboard Start acquires one exact selected-source analysis hold');
    ok(started.liveTracks === 1 && !started.monitor, 'analysis has one synthetic stream and never enables Hear Input');
    const exact = await page.evaluate(() => __capture.calls.every(call => call.audio.deviceId.exact === 'usb-line'));
    ok(exact && Math.abs(started.tuner.pitch.cents) < 3, 'shared input is requested by exact device ID and sine A4 retains its octave');
    const inTune = await page.locator('#tun-direction').textContent();
    ok(inTune === 'In tune' && /[+-].*¢/.test(await page.locator('#tun-cents').textContent()), 'numeric cents and In tune text communicate feedback without color');
    await page.evaluate(() => { __capture.current.oscillator.frequency.value = 440 * Math.pow(2, -18 / 1200); });
    await page.waitForFunction(() => document.getElementById('tun-direction').textContent.startsWith('Flat'));
    ok((await page.locator('#tun-cents').textContent()).startsWith('-'), 'flat input shows a negative cents value and tune-up instruction');
    await page.evaluate(() => { __capture.current.oscillator.frequency.value = 440 * Math.pow(2, 18 / 1200); });
    await page.waitForFunction(() => document.getElementById('tun-direction').textContent.startsWith('Sharp'));
    ok((await page.locator('#tun-cents').textContent()).startsWith('+'), 'sharp input shows a positive cents value and tune-down instruction');
    await page.evaluate(() => { __capture.current.gain.gain.value = 0; });
    await page.waitForFunction(() => App.tuner.state.pitch === null);
    ok(/clear note/.test(await page.locator('#tun-direction').textContent()), 'silence clears stale pitch and asks for a clear note');
    await page.locator('#tun-toggle').focus(); await page.keyboard.press('Space');
    const stopped = await page.evaluate(() => __state());
    ok(!stopped.tuner.listening && !stopped.holds.includes('tuner-analysis') && stopped.liveTracks === 0 && stopped.calls === started.calls,
      'Space on Stop releases the sole capture owner exactly once');

    console.log('# tuning calibration and preferences survive the shared drawer');
    await page.fill('#tun-a4', '443'); await page.locator('#tun-a4').dispatchEvent('change');
    await page.evaluate(() => { __capture.frequency = 443; __toggle(); });
    await page.waitForFunction(() => App.tuner.state.pitch && App.tuner.state.pitch.midi === 69 && Math.abs(App.tuner.state.pitch.cents) < 3);
    await page.locator('#tun-chips button').first().click();
    const calibrated = await page.evaluate(() => ({ state: App.tuner.state, reference: __references.at(-1)[0], saved: App.store.get('tun.a4') }));
    ok(calibrated.saved === 443 && Math.abs(calibrated.reference - (40 + 12 * Math.log2(443 / 440))) < 1e-8,
      'A4 calibration persists and shifts reference playback by the matching fractional MIDI offset');
    await page.fill('#tun-a4', '999'); await page.locator('#tun-a4').dispatchEvent('change');
    ok(await page.inputValue('#tun-a4') === '466', 'A4 upper bound is clamped to the existing 466 Hz limit');
    await page.fill('#tun-a4', '0'); await page.locator('#tun-a4').dispatchEvent('change');
    ok(await page.inputValue('#tun-a4') === '415', 'A4 lower bound is clamped to the existing 415 Hz limit');
    const tuning = await page.evaluate(() => {
      const select = document.getElementById('tun-tuning'), next = [...select.options].find(option => option.value !== 'standard');
      select.value = next.value; select.dispatchEvent(new Event('change'));
      return { id: next.value, stored: App.store.get('tun.tuning'), labels: [...document.querySelectorAll('#tun-chips button span:first-child')].map(span => span.textContent), expected: Theory.TUNINGS[next.value].midi.map(m => Theory.midiName(m)) };
    });
    ok(tuning.id === tuning.stored && same(tuning.labels, tuning.expected), 'all existing alternate tuning references still follow the selected tuning');
    await page.evaluate(() => __closeTuner());

    console.log('# tuner Stop disconnects only its own edge and preserves other shared owners');
    const held = await page.evaluate(async () => {
      await App.audioIn.hold('settings-meter'); await App.audioIn.setMonitor(true);
      const source = App.audioIn._t().src, disconnect = source.disconnect.bind(source);
      window.__disconnects = []; source.disconnect = function () { __disconnects.push({ args: arguments.length, kind: arguments[0] && arguments[0].constructor.name }); return disconnect(...arguments); };
      __openTuner(); __toggle(); return __state();
    });
    await page.waitForFunction(() => App.tuner.state.listening);
    const shared = await page.evaluate(() => __state());
    ok(shared.calls === held.calls && shared.holds.includes('settings-meter') && shared.holds.includes('tuner-analysis'), 'Tuner reuses another consumer’s existing stream rather than opening another input');
    const released = await page.evaluate(() => { __closeTuner(); return Object.assign(__state(), { disconnects: __disconnects }); });
    ok(released.holds.includes('settings-meter') && !released.holds.includes('tuner-analysis') && released.liveTracks === 1,
      'closing releases only Tuner while the Settings hold and live input survive');
    ok(released.monitor && released.audio.monitor && released.selected === shared.selected && released.output === shared.output,
      'closing preserves Hear Input, selected input and output settings');
    ok(released.disconnects.length === 1 && released.disconnects[0].args === 1 && released.disconnects[0].kind === 'AnalyserNode',
      'Tuner disconnects exactly its own analyser edge and never the shared source graph');
    await page.evaluate(async () => { await App.audioIn.setMonitor(false); App.audioIn.release('settings-meter'); });

    console.log('# pending close/reopen cannot release a newer same-tag lease');
    await page.evaluate(() => { __capture.mode = 'pending'; __openTuner(); __toggle(); });
    await page.waitForFunction(() => __capture.pending.length === 1);
    ok(await page.locator('#tun-toggle').isEnabled(), 'pending permission exposes a usable Cancel listening control');
    await page.evaluate(() => { __closeTuner(); __openTuner(); __toggle(); });
    await page.waitForFunction(() => __capture.pending.length === 2);
    await page.evaluate(() => __capture.pending[0].resolve());
    await page.waitForFunction(() => __capture.streams.at(-1).track.readyState === 'ended');
    const stale = await page.evaluate(() => __state());
    ok(stale.tuner.pending && !stale.tuner.listening && stale.holds.includes('tuner-analysis'),
      'late first permission result is discarded without removing the newer Tuner hold');
    await page.evaluate(() => __capture.pending[1].resolve()); await page.waitForFunction(() => App.tuner.state.listening);
    ok((await page.evaluate(() => __state())).liveTracks === 1, 'new permission result activates one stream after the old canceled stream ends');
    await page.evaluate(() => { __closeTuner(); __capture.pending = []; __openTuner(); __toggle(); });
    await page.waitForFunction(() => __capture.pending.length === 1);
    await page.evaluate(() => { __toggle(); __toggle(); }); await page.waitForFunction(() => __capture.pending.length === 2);
    await page.evaluate(() => __capture.pending[1].resolve()); await page.waitForFunction(() => App.tuner.state.listening);
    await page.evaluate(() => __capture.pending[0].reject(new DOMException('Late old denial', 'NotAllowedError')));
    const lateRejection = await page.evaluate(() => __state());
    ok(lateRejection.tuner.listening && lateRejection.holds.includes('tuner-analysis') && !lateRejection.tuner.error,
      'late denial from the canceled request cannot stop or replace the new listening session');
    await page.evaluate(() => { __closeTuner(); __capture.mode = 'immediate'; });

    console.log('# exact device/error/disconnect/hidden paths clean up without automatic retries');
    for (const mode of ['denied', 'missing', 'busy', 'wrong-device']) {
      await page.evaluate(mode => { __capture.mode = mode; __openTuner(); __toggle(); }, mode);
      await page.waitForFunction(() => !!App.tuner.state.error && !App.tuner.state.pending);
      const failure = await page.evaluate(() => __state());
      ok(!failure.tuner.listening && !failure.holds.includes('tuner-analysis') && failure.selected === 'usb-line', mode + ' reports an error and releases only Tuner without changing the selected input');
      await page.evaluate(() => __closeTuner());
    }
    await page.evaluate(() => { __capture.mode = 'immediate'; __openTuner(); __toggle(); }); await page.waitForFunction(() => App.tuner.state.listening);
    const deviceChanged = await page.evaluate(async () => { const calls = __capture.calls.length; await App.audioIn.setDevice('other-line'); return { calls, after: __state() }; });
    ok(!deviceChanged.after.tuner.listening && deviceChanged.after.calls === deviceChanged.calls && !deviceChanged.after.holds.includes('tuner-analysis'),
      'changing the shared selected input stops Tuner and requires a fresh Start');
    await page.evaluate(() => __toggle()); await page.waitForFunction(() => App.tuner.state.listening);
    const secondDevice = await page.evaluate(() => ({ state: __state(), request: __capture.calls.at(-1) }));
    ok(secondDevice.state.tuner.deviceId === 'other-line' && secondDevice.request.audio.deviceId.exact === 'other-line', 'fresh Start uses exactly the newly selected input');
    await page.evaluate(() => { const track = __capture.current.track; track.stop(); if (track.onended) track.onended(); });
    await page.waitForFunction(() => !App.tuner.state.listening);
    ok(!(await page.evaluate(() => __state())).holds.includes('tuner-analysis'), 'track disconnection clears Tuner capture ownership');
    await page.evaluate(() => __toggle()); await page.waitForFunction(() => App.tuner.state.listening);
    const hidden = await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hidden === true });
      __hidden = true; document.dispatchEvent(new Event('visibilitychange')); const off = __state();
      __hidden = false; document.dispatchEvent(new Event('visibilitychange')); return { off, returned: __state() };
    });
    ok(!hidden.off.tuner.listening && hidden.off.liveTracks === 0 && hidden.returned.calls === hidden.off.calls && !hidden.returned.tuner.pending,
      'app hide releases capture and foreground return does not automatically listen');
    await page.evaluate(() => __toggle()); await page.waitForFunction(() => App.tuner.state.listening);
    const claimed = await page.evaluate(() => { App.emit('transport:claim', { owner: 'keys' }); return __state(); });
    ok(!claimed.tuner.listening && !claimed.holds.includes('tuner-analysis'), 'another practice transport claim releases only Tuner capture');
    await page.evaluate(() => __toggle()); await page.waitForFunction(() => App.tuner.state.listening);
    const nav = await page.evaluate(() => { App.switchTo('quiz'); return { state: __state(), sheet: App.sheet }; });
    ok(!nav.sheet && !nav.state.tuner.listening && nav.state.liveTracks === 0, 'route navigation closes the sheet and releases its last capture lease');
    const unavailable = await page.evaluate(() => {
      const original = navigator.mediaDevices.getUserMedia; navigator.mediaDevices.getUserMedia = undefined;
      __openTuner(); const before = __capture.calls.length; __toggle(); const state = __state();
      navigator.mediaDevices.getUserMedia = original; return { before, state };
    });
    ok(unavailable.state.calls === unavailable.before && /unavailable/.test(unavailable.state.tuner.error) && !unavailable.state.holds.includes('tuner-analysis'),
      'unsupported capture displays an actionable error without acquiring a hold');

    console.log('# focus, themes, responsive layout and persistence');
    await page.evaluate(() => __closeTuner()); await page.locator('#tuner-btn').focus(); await page.keyboard.press('Enter');
    const focus = await page.evaluate(() => ({ id: document.activeElement.id, close: document.activeElement.hasAttribute('data-sheet-close'), role: document.querySelector('#sheet-tuner .sheet-card').getAttribute('role') }));
    ok(focus.close && focus.role === 'dialog', 'keyboard opening moves focus into the labeled Tuner dialog');
    await page.keyboard.press('Escape');
    ok(await page.evaluate(() => document.activeElement.id === 'tuner-btn' && App.sheet === null), 'Escape closes and returns focus to the global Tuner button');
    await page.evaluate(() => __openTuner());
    const layouts = [];
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => App.setTheme(theme), theme);
      for (const width of [360, 390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.querySelector('#sheet-tuner .sheet-card').getAnimations().map(animation => animation.finished.catch(() => {}))); });
        layouts.push(await page.evaluate(({ width, theme }) => ({ width, theme,
          overflow: document.documentElement.scrollWidth > innerWidth,
          sheetWidth: document.querySelector('#sheet-tuner .sheet-card').getBoundingClientRect().width,
          toggleHeight: document.getElementById('tun-toggle').getBoundingClientRect().height,
          bg: getComputedStyle(document.querySelector('#sheet-tuner .sheet-card')).backgroundColor }), { width, theme }));
      }
    }
    ok(layouts.every(layout => !layout.overflow && layout.sheetWidth <= layout.width && layout.toggleHeight >= 44),
      'dark/light Tuner and 44px Start control fit 360px, 390px and desktop viewports');
    ok(new Set(layouts.map(layout => layout.bg)).size === 2, 'Tuner uses distinct existing light and dark theme surfaces');
    await page.evaluate(() => {
      document.getElementById('tun-fret-min').value = 3; document.getElementById('tun-fret-min').dispatchEvent(new Event('change'));
      document.getElementById('tun-anyoct').checked = true; document.getElementById('tun-anyoct').dispatchEvent(new Event('change'));
    });
    const saved = await page.evaluate(() => ({ a4: App.store.get('tun.a4'), tuning: App.store.get('tun.tuning'), fret: App.store.get('tun.fretMin'), any: App.store.get('tun.anyOct'), calls: __capture.calls.length, midi: __capture.midi }));
    await page.reload(); await page.waitForFunction(() => App.tuner); await page.evaluate(() => App.openSheet('tuner'));
    const persisted = await page.evaluate(() => ({ a4: Number(document.getElementById('tun-a4').value), tuning: document.getElementById('tun-tuning').value,
      fret: Number(document.getElementById('tun-fret-min').value), any: document.getElementById('tun-anyoct').checked, calls: __capture.calls.length, midi: __capture.midi }));
    ok(persisted.a4 === saved.a4 && persisted.tuning === saved.tuning && persisted.fret === saved.fret && persisted.any === saved.any,
      'A4, tuning and note-finder preferences survive reload into the same drawer');
    ok(persisted.calls === 0 && persisted.midi === 0 && saved.midi === 0, 'reload and passive open request no microphone or MIDI hardware access');
    ok(errors.length === 0, 'no browser runtime errors: ' + errors.join('; '));
    if (process.env.SL_TUNER_EVIDENCE) {
      fs.mkdirSync(path.dirname(process.env.SL_TUNER_EVIDENCE), { recursive: true });
      fs.writeFileSync(process.env.SL_TUNER_EVIDENCE, JSON.stringify({ checks, scope: 'Synthetic WebAudio input through actual shared service; hardware unverified', layouts, saved, persisted, errors }, null, 2) + '\n');
    }
    await context.close(); console.log('ALL PASS (' + checks + ' checks; real Tuner sheet and shared-input ownership, synthetic capture only)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
