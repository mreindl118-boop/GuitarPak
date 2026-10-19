// Isolated browser fixture, fake ports only. No requestMIDIAccess, real ports,
// shared selection, or hardware commands. Does not claim hardware validation.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const env = require('./env');
const source = fs.readFileSync(path.join(env.ROOT, 'js/lumi-practice.js'), 'utf8');
const css = fs.readFileSync(path.join(env.ROOT, 'css/lumi-practice.css'), 'utf8');
let fails = 0;
function ok(value, message) { console.log(value ? '  PASS' : '  FAIL', message); if (!value) fails++; }

async function fixture(browser, native = false) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent('<!doctype html><html><head><style>body{font-family:sans-serif}.card{padding:16px} .field{display:flex;flex-direction:column}button{padding:8px}</style></head><body><section id="panel-lumipractice"></section></body></html>');
  await page.addStyleTag({ content: css });
  await page.evaluate(native => {
    window.__sent = []; window.__attempted = []; window.__listeners = new Map(); window.__stale = [];
    window.__failSend = false; window.__native = native;
    window.__inputs = [{ id: 'modx-answer', name: 'Mock MODX answer' }, { id: 'other-input', name: 'Unselected MODX input' },
      { id: 'lumi-input', name: 'ROLI LUMI' }, { id: 'helix-input', name: 'Helix Stadium XL' }, { id: 'virtual-input', name: 'MODX loopMIDI' }];
    window.__outputs = [{ id: 'lumi-display', name: 'Mock LUMI display' }, { id: 'other-output', name: 'Unselected ROLI LUMI output' },
      { id: 'modx-output', name: 'Yamaha MODX' }, { id: 'helix-output', name: 'Helix Stadium XL' },
      { id: 'seaboard-output', name: 'ROLI Seaboard' }, { id: 'lightpad-output', name: 'ROLI Lightpad BLOCK' }, { id: 'bare-roli-output', name: 'ROLI' },
      { id: 'mixed-output', name: 'LUMI Helix' }, { id: 'virtual-output', name: 'ROLI LUMI loopback' }];
    const events = {};
    const forbidden = () => { throw new Error('Global MIDI selection, lights or output must never be called'); };
    window.App = {
      modules: {}, register: (id, mod) => { App.modules[id] = mod; },
      on: (event, fn) => { (events[event] || (events[event] = [])).push(fn); },
      emit: (event, data) => { (events[event] || []).forEach(fn => fn(data)); },
      midi: {
        get inputs() { return __inputs; }, get outputs() { return __outputs; },
        get native() { return __native; }, get explicitPortsSupported() { return !__native; },
        get inputId() { return 'shared-input'; }, get outputId() { return 'shared-output'; },
        setInput: forbidden, setOutput: forbidden, send: forbidden, light: forbidden, dark: forbidden,
        claim: forbidden, release: forbidden, setLightsOn: forbidden, setInputFilter: forbidden,
        subscribeInput: (id, fn) => {
          if (__native || !__inputs.some(p => p.id === id)) return null;
          if (!__listeners.has(id)) __listeners.set(id, new Set());
          __listeners.get(id).add(fn); __stale.push(fn);
          return () => __listeners.get(id).delete(fn);
        },
        sendToOutput: (portId, bytes) => {
          __attempted.push({ portId, bytes: Array.from(bytes) });
          if (__native || __failSend || !__outputs.some(p => p.id === portId)) return false;
          __sent.push({ portId, bytes: Array.from(bytes) }); return true;
        }
      }
    };
    window.__receive = (id, bytes) => { (__listeners.get(id) || []).forEach(fn => fn({ portId: id, bytes })); };
    window.__change = (id, value) => { const el = document.getElementById('lp-' + id); el.value = value; el.dispatchEvent(new Event('change')); };
    window.__click = id => document.getElementById('lp-' + id).click();
  }, native);
  await page.addScriptTag({ content: source });
  await page.evaluate(() => { App.modules.lumipractice.init(document.getElementById('panel-lumipractice')); App.modules.lumipractice.onShow(); });
  return { page, context, errors };
}
async function hardware(page) {
  await page.evaluate(() => {
    App.modules.lumipractice.onShow();
    if (SLLumiPractice.snapshot().mode !== 'hardware') __change('mode', 'hardware');
    __change('input', 'modx-answer'); __change('output', 'lumi-display'); __click('start');
  });
}
async function arm(page) {
  await page.evaluate(() => __click('test'));
  await page.waitForFunction(() => SLLumiPractice.snapshot().tested);
  await page.evaluate(() => __click('arm'));
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const { page, context, errors } = await fixture(browser);
    console.log('# simulated practice and exact-pitch grading');
    const initial = await page.evaluate(() => ({ state: SLLumiPractice.snapshot(), badge: document.getElementById('lp-mode-badge').textContent,
      keys: document.querySelectorAll('[data-target-note]').length, sent: __sent.length, listeners: __listeners.size }));
    ok(initial.state.mode === 'simulated' && !initial.state.armed && !initial.state.running && /SIMULATED/.test(initial.badge), 'fresh page explicitly simulated; hardware output OFF');
    ok(initial.keys === 24 && initial.sent === 0 && initial.listeners === 0, '24-key reference and no port subscription or device traffic at initialization');
    const simulated = await page.evaluate(() => {
      __change('kind', 'major'); __click('start');
      const first = SLLumiPractice.snapshot(); __click('preview');
      const afterPreview = SLLumiPractice.snapshot();
      App.emit('note:input', { on: true, midi: first.target[0], vel: 100 });
      App.emit('midi:note', { on: true, midi: first.target[0], vel: 100 });
      App.emit('midi:out', { bytes: [144, first.target[0], 80], portId: 'lumi-display' });
      const afterEvents = SLLumiPractice.snapshot();
      first.target.forEach(n => document.querySelector('[data-answer-note="' + n + '"]').click());
      __click('check'); __click('check');
      const judged = SLLumiPractice.snapshot();
      return { first, afterPreview, afterEvents, judged, sent: __sent.length, listeners: __listeners.size,
        pressed: document.querySelectorAll('[data-answer-note][aria-pressed="true"]').length,
        compare: SLLumiPractice.compareNotes([60, 64, 67], [48, 52, 55]) };
    });
    ok(simulated.first.target.join() === '48,52,55' && simulated.judged.correct === 1 && simulated.judged.attempts === 1 && simulated.pressed === 3, 'usable triad target and simulated held-note answer; repeated check cannot inflate score');
    ok(simulated.afterPreview.held.length === 0 && simulated.afterEvents.held.length === 0 && simulated.sent === 0 && simulated.listeners === 0, 'mock output and global note/capture/output events never become answers or touch ports');
    ok(!simulated.compare.correct && simulated.compare.missing.join() === '60,64,67', 'same chord in another octave is wrong; grading does not fold pitches');

    console.log('# separate exact ports and physical answer isolation');
    const choices = await page.evaluate(() => { __change('mode', 'hardware'); return [document.getElementById('lp-input').value, document.getElementById('lp-output').value]; });
    ok(choices.join() === ',', 'hardware mode requires explicit input/output choices; no first-port auto-selection');
    const offered = await page.evaluate(() => ({
      inputs: [...document.getElementById('lp-input').options].map(p => p.value),
      outputs: [...document.getElementById('lp-output').options].map(p => p.value)
    }));
    ok(offered.inputs.join() === ',modx-answer,other-input' && offered.outputs.join() === ',lumi-display,other-output', 'role-limited choices exclude LUMI/Helix answer inputs, MODX/Helix outputs, mixed and virtual names');
    await hardware(page);
    const isolated = await page.evaluate(() => {
      const s = SLLumiPractice.snapshot();
      const before = __sent.length;
      s.target.forEach(n => __receive('other-input', [0x90, n, 90]));
      const ignored = SLLumiPractice.snapshot().held;
      // Defensive source check even if an adapter invokes the wrong callback.
      __stale[__stale.length - 1]({ portId: 'lumi-display', bytes: [0x90, s.target[0], 80] });
      const outputIgnored = SLLumiPractice.snapshot().held;
      __receive('modx-answer', [0x90, s.target[0] + 12, 90]); __click('check');
      const wrong = SLLumiPractice.snapshot();
      __receive('modx-answer', [0x90, s.target[0] + 12, 0]);
      s.target.forEach((n, i) => __receive('modx-answer', [0x90 | i, n, 90])); __click('check');
      const right = SLLumiPractice.snapshot();
      return { ignored, outputIgnored, wrong, right, traffic: __sent.length - before,
        shared: [App.midi.inputId, App.midi.outputId], listeners: [...__listeners.entries()].map(([id, set]) => [id, set.size]) };
    });
    ok(isolated.ignored.length === 0 && isolated.outputIgnored.length === 0 && isolated.wrong.correct === 0 && isolated.right.correct === 1, 'only the chosen MODX port grades exact pitches; MPE note channels accepted');
    ok(isolated.traffic === 0 && !isolated.right.armed && isolated.shared.join() === 'shared-input,shared-output', 'physical answers do not send prompts; shared MIDI choices stay untouched');
    ok(isolated.listeners.filter(v => v[1]).map(v => v[0]).join() === 'modx-answer', 'only selected answer input has an additive listener');
    const malformed = await page.evaluate(() => {
      __click('next');
      [[0x90, 60], [0x90, 128, 1], [0x90, 60, 128], [0x90, -1, 3], [0x90, 60, 1.5], [0xf0, 60, 1], [0xb0, 60, 1]].forEach(b => __receive('modx-answer', b));
      return SLLumiPractice.snapshot().held;
    });
    ok(malformed.length === 0, 'malformed, SysEx and non-note input ignored');

    console.log('# explicit selected-output test and arm');
    await page.evaluate(() => __click('arm'));
    ok(!(await page.evaluate(() => SLLumiPractice.snapshot().armed)), 'arm unavailable before completed selected-device test');
    await arm(page);
    const armed = await page.evaluate(() => ({ state: SLLumiPractice.snapshot(), sent: __sent.slice(), text: document.getElementById('lp-output-status').textContent }));
    ok(armed.state.armed && armed.state.activeOutputs === 3 && /target pulse/.test(armed.text), 'completed test permits explicit arm and transient triad preview');
    ok(armed.sent.every(s => s.portId === 'lumi-display' && [0x80, 0x90].includes(s.bytes[0] & 0xf0) && s.bytes[1] >= 48 && s.bytes[1] <= 71 && s.bytes.length === 3), 'only ordinary in-window notes go to explicitly selected LUMI output; no SysEx/CC/program/fallback');
    await page.waitForFunction(() => SLLumiPractice.snapshot().activeOutputs === 0);
    ok(await page.evaluate(() => SLLumiPractice.snapshot().armed && __sent.filter(s => (s.bytes[0] & 0xf0) === 0x90).length === __sent.filter(s => (s.bytes[0] & 0xf0) === 0x80).length), 'bounded pulse releases all notes automatically');
    await page.evaluate(() => __click('start'));
    ok(await page.evaluate(() => { const s = SLLumiPractice.snapshot(); return s.running && !s.armed && !s.tested && s.activeOutputs === 0; }), 'fresh session always resets output OFF and forgets the test');

    console.log('# cleanup boundaries');
    const boundaries = ['stop', 'blur', 'pagehide', 'visibility', 'hide', 'window', 'channel', 'output-change', 'disconnect'];
    for (const boundary of boundaries) {
      await hardware(page); await arm(page);
      const cleaned = await page.evaluate(boundary => {
        const from = __sent.length;
        if (boundary === 'stop') __click('stop');
        if (boundary === 'blur') window.dispatchEvent(new Event('blur'));
        if (boundary === 'pagehide') window.dispatchEvent(new Event('pagehide'));
        if (boundary === 'visibility') { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; }
        if (boundary === 'hide') App.modules.lumipractice.onHide();
        if (boundary === 'window') __change('low', '49');
        if (boundary === 'channel') __change('channel', '2');
        if (boundary === 'output-change') __change('output', 'other-output');
        if (boundary === 'disconnect') { __inputs = []; App.emit('midi:state', {}); }
        const s = SLLumiPractice.snapshot();
        const clean = __sent.slice(from);
        const listeners = [...__listeners.values()].reduce((sum, set) => sum + set.size, 0);
        __stale.forEach(fn => fn({ portId: 'modx-answer', bytes: [0x90, s.low, 100] }));
        __inputs = [{ id: 'modx-answer', name: 'Mock MODX answer' }, { id: 'other-input', name: 'Unselected MODX input' }];
        App.emit('midi:state', {});
        return { s, clean, listeners, late: SLLumiPractice.snapshot().held };
      }, boundary);
      ok(!cleaned.s.running && !cleaned.s.armed && !cleaned.s.tested && cleaned.s.activeOutputs === 0 && cleaned.listeners === 0 && cleaned.late.length === 0 && cleaned.clean.length === 3 && cleaned.clean.every(s => s.portId === 'lumi-display' && (s.bytes[0] & 0xf0) === 0x80), boundary + ': matching note-offs, disarm, unsubscribe and reject stale answers');
    }
    await hardware(page); await arm(page);
    const unplugged = await page.evaluate(() => {
      const from = __attempted.length;
      __outputs = [{ id: 'other-output', name: 'Unselected ROLI LUMI output' }]; App.emit('midi:state', {});
      const result = { s: SLLumiPractice.snapshot(), attempted: __attempted.slice(from), text: document.getElementById('lp-output-status').textContent };
      __outputs.push({ id: 'lumi-display', name: 'Mock LUMI display' }); App.emit('midi:state', {});
      result.reconnected = SLLumiPractice.snapshot();
      return result;
    });
    ok(!unplugged.s.running && !unplugged.s.armed && unplugged.s.activeOutputs === 0 && unplugged.attempted.length === 0 && /could not confirm/.test(unplugged.text), 'output disconnect clears pending original notes and reports undeliverable note-offs; no unrelated-port send');
    ok(!unplugged.reconnected.running && !unplugged.reconnected.armed && !unplugged.reconnected.tested && !unplugged.reconnected.outputId, 'reconnection does not reselect an output, restart, or re-arm');
    console.log('# role validation beyond the selectors');
    const wrongRoles = await page.evaluate(() => {
      // Inject bogus options to prove guards are not merely UI filtering.
      const before = __attempted.length;
      const out = document.getElementById('lp-output'), inp = document.getElementById('lp-input');
      const runs = [];
      const wrongOutputs = [['modx-output', 'MODX'], ['helix-output', 'Helix Stadium'],
        ['seaboard-output', 'ROLI Seaboard'], ['lightpad-output', 'ROLI Lightpad BLOCK'], ['bare-roli-output', 'ROLI']];
      wrongOutputs.forEach(([id, name]) => {
        __outputs.push({ id, name });
        out.add(new Option(id, id)); __change('output', id); __change('input', 'modx-answer'); __click('start'); __click('test'); __click('arm');
        runs.push(SLLumiPractice.snapshot());
      });
      ['lumi-input', 'helix-input'].forEach(id => {
        __inputs.push({ id, name: id === 'lumi-input' ? 'LUMI' : 'Helix Stadium' });
        inp.add(new Option(id, id)); __change('input', id); __click('start'); __receive(id, [0x90, 48, 80]); __click('check');
        runs.push(SLLumiPractice.snapshot());
      });
      return { runs, attempted: __attempted.length - before };
    });
    ok(wrongRoles.attempted === 0 && wrongRoles.runs.every(s => !s.armed && !s.tested && !s.held.length && s.correct === 0) && wrongRoles.runs.slice(5).every(s => !s.running), 'injected wrong-role choices cannot test, arm, send or grade; independent of UI filtering');
    [['seaboard-output', 'ROLI Seaboard'], ['lightpad-output', 'ROLI Lightpad BLOCK'], ['bare-roli-output', 'bare ROLI']].forEach(([id, name], index) => {
      const state = wrongRoles.runs[index + 2];
      ok(!offered.outputs.includes(id) && !state.armed && !state.tested && wrongRoles.attempted === 0, name + ' is excluded and cannot test, arm or send after an injected option');
    });
    await hardware(page);
    const renamedTest = await page.evaluate(() => {
      const from = __attempted.length;
      __outputs.find(p => p.id === 'lumi-display').name = 'MODX'; __click('test');
      const result = { s: SLLumiPractice.snapshot(), attempted: __attempted.length - from };
      __outputs.find(p => p.id === 'lumi-display').name = 'Mock LUMI display';
      App.emit('midi:state', {});
      return result;
    });
    ok(!renamedTest.s.armed && !renamedTest.s.tested && renamedTest.attempted === 0, 'test rechecks live output role before sending, even with a stale enabled Test button');
    await page.evaluate(() => __click('test'));
    await page.waitForFunction(() => SLLumiPractice.snapshot().tested);
    const renamedArm = await page.evaluate(() => {
      const from = __attempted.length;
      __outputs.find(p => p.id === 'lumi-display').name = 'Helix Stadium'; __click('arm');
      const result = { s: SLLumiPractice.snapshot(), attempted: __attempted.length - from };
      __outputs.find(p => p.id === 'lumi-display').name = 'Mock LUMI display';
      return result;
    });
    ok(!renamedArm.s.armed && !renamedArm.s.tested && renamedArm.attempted === 0, 'arm rechecks output role after the test; a renamed Helix cannot receive the target');
    await hardware(page); await arm(page);
    const renamedOutput = await page.evaluate(() => {
      const from = __attempted.length;
      __outputs.find(p => p.id === 'lumi-display').name = 'Yamaha MODX';
      __click('next');
      const result = { s: SLLumiPractice.snapshot(), attempted: __attempted.length - from };
      __outputs.find(p => p.id === 'lumi-display').name = 'Mock LUMI display';
      return result;
    });
    ok(!renamedOutput.s.armed && !renamedOutput.s.tested && renamedOutput.attempted === 0, 'output role is revalidated at send time even if its ID stays unchanged and no state event arrives');
    await hardware(page);
    const renamedInput = await page.evaluate(() => {
      __inputs.find(p => p.id === 'modx-answer').name = 'ROLI LUMI';
      SLLumiPractice.snapshot().target.forEach(n => __receive('modx-answer', [0x90, n, 80])); __click('check');
      const s = SLLumiPractice.snapshot();
      __inputs.find(p => p.id === 'modx-answer').name = 'Mock MODX answer';
      return s;
    });
    ok(renamedInput.held.length === 0 && renamedInput.correct === 0, 'input role is revalidated for every callback even if its ID stays unchanged');
    await hardware(page);
    const staleAnswer = await page.evaluate(() => {
      SLLumiPractice.snapshot().target.forEach(n => __receive('modx-answer', [0x90, n, 80]));
      __inputs.find(p => p.id === 'modx-answer').name = 'Helix Stadium'; __click('check');
      const s = SLLumiPractice.snapshot();
      __inputs.find(p => p.id === 'modx-answer').name = 'Mock MODX answer';
      return s;
    });
    ok(!staleAnswer.running && staleAnswer.held.length === 0 && staleAnswer.correct === 0, 'grading rechecks answer input role and rejects previously held notes after a role change');
    console.log('# range, route failure and native support');
    const range = await page.evaluate(() => {
      __change('low', '104'); __change('kind', 'note'); __change('mode', 'simulated'); __click('start');
      const all = [];
      for (let i = 0; i < 24; i++) { all.push(...SLLumiPractice.snapshot().target); __click('next'); }
      __change('low', '105');
      return { all, s: SLLumiPractice.snapshot(), keys: [...document.querySelectorAll('[data-target-note]')].map(e => Number(e.dataset.targetNote)) };
    });
    ok(Math.min(...range.all) === 104 && Math.max(...range.all) === 127 && range.s.low === 104 && range.keys.length === 24 && range.keys[23] === 127, 'configurable 24-key window reaches MIDI 127 without folding or overflow; invalid window rejected');
    await hardware(page);
    const failure = await page.evaluate(() => { __failSend = true; __click('test'); return SLLumiPractice.snapshot(); });
    ok(!failure.armed && !failure.tested && failure.activeOutputs === 0, 'selected-port send failure cannot arm output');
    await page.evaluate(() => { __failSend = false; __click('stop'); });
    await context.close();
    const nativeFixture = await fixture(browser, true);
    const nativeState = await nativeFixture.page.evaluate(() => {
      __change('mode', 'hardware'); __click('start');
      const unsupported = { s: SLLumiPractice.snapshot(), text: document.getElementById('lp-ports-status').textContent };
      __change('mode', 'simulated'); __click('start');
      return { unsupported, simulated: SLLumiPractice.snapshot(), sent: __sent.length };
    });
    ok(!nativeState.unsupported.s.running && /Native MIDI bridge/.test(nativeState.unsupported.text) && nativeState.simulated.running && nativeState.sent === 0, 'native independent routing is clearly unsupported; simulated practice still works');
    await nativeFixture.context.close();
    ok(errors.length === 0 && nativeFixture.errors.length === 0, 'no browser exceptions: ' + errors.concat(nativeFixture.errors).join('; '));
  } finally { await browser.close(); }
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS — mocks only; physical LUMI/MODX lighting unverified');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
