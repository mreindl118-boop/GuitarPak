// Recovered from b8ccb55; fixtures plus the real served app and MIDI service.
// Every port is simulated. These checks do not claim hardware validation.
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
    window.__failSend = false; window.__native = native; window.__displayEnabled = true;
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
        get displayEnabled() { return __displayEnabled; },
        setDisplayOutput: () => true,
        setDisplayEnabled: value => { __displayEnabled = value; App.emit('lights:master', { enabled: value }); },
        get inputId() { return 'shared-input'; }, get outputId() { return 'shared-output'; },
        setInput: forbidden, setOutput: forbidden, send: forbidden, light: forbidden, dark: forbidden,
        claim: forbidden, release: forbidden, setLightsOn: forbidden, setInputFilter: forbidden,
        subscribeInput: (id, fn) => {
          if (__native || !__inputs.some(p => p.id === id)) return null;
          if (!__listeners.has(id)) __listeners.set(id, new Set());
          __listeners.get(id).add(fn); __stale.push(fn);
          return () => __listeners.get(id).delete(fn);
        },
        leaseKeybedOutput: (portId) => {
          if (__native || !__outputs.some(p => p.id === portId)) return null;
          const original = __outputs.find(p => p.id === portId), name = original.name;
          let active = true, notes = new Map(), uncertain = false;
          const valid = () => __outputs.find(p => p.id === portId) === original && original.name === name;
          const send = bytes => valid() && App.midi.sendToOutput(portId, bytes);
          const clear = () => {
            for (const [key, n] of notes) {
              if (send([0x80 | n.channel, n.note, 0])) notes.delete(key); else uncertain = true;
            }
            return !uncertain;
          };
          const release = () => { const ok = clear(); active = false; return ok; };
          release.clear = clear;
          release.frame = frame => {
            if (!active || !valid() || uncertain) return false;
            const want = new Map(), channel = frame.channel || 0;
            for (const [role, vel] of [['target', 80], ['correct', 60], ['wrong', 1]]) {
              for (const note of frame[role] || []) want.set(channel + ':' + note, { channel, note, vel });
            }
            for (const [key, n] of notes) {
              if (!want.has(key)) { if (!send([0x80 | n.channel, n.note, 0])) return false; notes.delete(key); }
            }
            for (const [key, n] of want) {
              if (!notes.has(key) || notes.get(key).vel !== n.vel) {
                if (!send([0x90 | channel, n.note, n.vel])) return false;
                notes.set(key, n);
              }
            }
            return true;
          };
          return release;
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
    if (App.modules) App.modules.lumipractice.onShow(); else App.switchTo('lumipractice');
    if (SLLumiPractice.snapshot().mode !== 'hardware') __change('mode', 'hardware');
    __change('input', 'modx-answer'); __change('output', 'lumi-display'); __click('start');
  });
}
async function arm(page) {
  await page.evaluate(() => __click('test'));
  await page.waitForFunction(() => SLLumiPractice.snapshot().tested);
  await page.evaluate(() => __click('arm'));
}

async function guidedFixture(browser) {
  const { page, context, errors } = await fixture(browser);
  console.log('# guided simulation: wait, wrong, correct and non-color feedback');
  await page.evaluate(() => { __change('kind', 'major'); __click('start'); });
  const first = await page.evaluate(() => SLLumiPractice.snapshot());
  const partial = await page.evaluate(() => {
    document.querySelector('[data-answer-note="' + SLLumiPractice.snapshot().target[0] + '"]').click();
    __click('next'); __click('check');
    return { s: SLLumiPractice.snapshot(), text: document.getElementById('lp-feedback').textContent,
      labels: [...document.querySelectorAll('.lp-role')].map(e => e.textContent) };
  });
  await page.waitForTimeout(850);
  ok(partial.s.flow === 'guided' && partial.s.feedback === 'waiting' && partial.s.correct === 0 &&
    /Waiting/.test(partial.text) && partial.labels.includes('✓ Correct') && partial.labels.includes('◎ Target') &&
    await page.evaluate(target => SLLumiPractice.snapshot().target.join() === target.join(), first.target),
    'partial triad stays waiting, names missing notes and labels both matched and target keys');
  const wrong = await page.evaluate(() => {
    document.querySelector('[data-answer-note="49"]').click();
    return { s: SLLumiPractice.snapshot(), text: document.getElementById('lp-feedback').textContent,
      role: document.querySelector('[data-target-note="49"] .lp-role').textContent };
  });
  await page.waitForTimeout(850);
  ok(wrong.s.feedback === 'wrong' && /× Wrong/.test(wrong.text) && wrong.role === '× Wrong' &&
    await page.evaluate(target => SLLumiPractice.snapshot().target.join() === target.join() && SLLumiPractice.snapshot().correct === 0, first.target),
    'wrong extra note gets text and a × label and cannot advance the exercise');
  const correct = await page.evaluate(() => {
    document.querySelector('[data-answer-note="49"]').click();
    SLLumiPractice.snapshot().target.slice(1).forEach(n => document.querySelector('[data-answer-note="' + n + '"]').click());
    return { s: SLLumiPractice.snapshot(), live: document.getElementById('lp-feedback').getAttribute('aria-live'),
      text: document.getElementById('lp-feedback').textContent };
  });
  ok(correct.s.feedback === 'correct' && correct.s.advancing && correct.live === 'polite' && /✓ Correct/.test(correct.text),
    'exact triad shows an accessible correct message before automatic progression');
  await page.waitForFunction(() => SLLumiPractice.snapshot().correct === 1);
  const advanced = await page.evaluate(() => ({ s: SLLumiPractice.snapshot(), sent: __sent.length, listeners: __listeners.size }));
  ok(advanced.s.target.join() !== first.target.join() && advanced.s.held.length === 0 && advanced.sent === 0 && advanced.listeners === 0,
    'guided simulator advances once and virtually releases answers without device subscriptions or messages');

  for (const boundary of ['stop', 'exercise', 'blur']) {
    const before = await page.evaluate(boundary => {
      if (!SLLumiPractice.snapshot().visible) App.modules.lumipractice.onShow();
      __click('start');
      SLLumiPractice.snapshot().target.forEach(n => document.querySelector('[data-answer-note="' + n + '"]').click());
      const before = SLLumiPractice.snapshot();
      if (boundary === 'stop') __click('stop');
      if (boundary === 'exercise') __change('kind', 'minor');
      if (boundary === 'blur') window.dispatchEvent(new Event('blur'));
      return before;
    }, boundary);
    await page.waitForTimeout(850);
    const after = await page.evaluate(() => SLLumiPractice.snapshot());
    ok(before.advancing && !after.running && !after.advancing && after.correct === 0,
      boundary + ' cancels queued correct-feedback progression');
  }
  const optionalLumi = await page.evaluate(() => {
    __change('mode', 'hardware'); __change('kind', 'note'); __change('input', 'lumi-input'); __click('start');
    const n = SLLumiPractice.snapshot().target[0];
    __receive('lumi-input', [0x90, n, 100]); __receive('lumi-input', [0x91, n, 100]); __receive('lumi-input', [0x80, n, 0]);
    return SLLumiPractice.snapshot();
  });
  ok(optionalLumi.inputId === 'lumi-input' && optionalLumi.held.length === 1 && optionalLumi.feedback === 'correct',
    'optional explicitly chosen LUMI answer input tracks independent held MIDI channels');
  await page.waitForFunction(() => SLLumiPractice.snapshot().correct === 1);
  await page.evaluate(n => __receive('lumi-input', [0x91, n, 100]), optionalLumi.target[0]);
  await page.waitForTimeout(850);
  ok(await page.evaluate(n => {
    const s = SLLumiPractice.snapshot(); __receive('lumi-input', [0x81, n, 0]);
    return s.correct === 1 && s.held.join() === String(n) && SLLumiPractice.snapshot().held.length === 0;
  }, optionalLumi.target[0]), 'duplicate held note-ons cannot answer the next target and the original channel note-off releases the hold');
  ok(errors.length === 0, 'guided fixture has no browser exceptions: ' + errors.join('; '));
  await context.close();
}

async function fullApp(browser) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 950 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.fb.root', '0');
    localStorage.setItem('guitarlab.fb.scale', '"major"');
    localStorage.setItem('guitarlab.lights.displayEnabled', 'true');
    window.__sent = []; window.__requests = 0;
    class Port extends EventTarget {
      constructor(id, name) { super(); this.id = id; this.name = name; this.state = 'connected'; this.onmidimessage = null; }
      send(bytes) { __sent.push({ portId: this.id, bytes: Array.from(bytes) }); }
      receive(bytes) {
        const e = new Event('midimessage'); Object.defineProperty(e, 'data', { value: new Uint8Array(bytes) });
        if (this.onmidimessage) this.onmidimessage(e);
        this.dispatchEvent(e);
      }
    }
    window.__access = { inputs: new Map([
      ['modx-answer', new Port('modx-answer', 'Yamaha MODX')],
      ['lumi-input', new Port('lumi-input', 'LUMI Keys BLOCK')],
      ['other-input', new Port('other-input', 'Other MODX')]
    ]), outputs: new Map([
      ['lumi-display', new Port('lumi-display', 'LUMI Keys BLOCK')],
      ['modx-output', new Port('modx-output', 'Yamaha MODX')]
    ]), sysexEnabled: true };
    navigator.requestMIDIAccess = () => { __requests++; return Promise.resolve(__access); };
    window.__receive = (id, bytes) => __access.inputs.get(id).receive(bytes);
    window.__change = (id, value) => {
      const el = document.getElementById('lp-' + id); el.value = value; el.dispatchEvent(new Event('change'));
    };
    window.__click = id => document.getElementById('lp-' + id).click();
    window.__lit = () => {
      const keys = {};
      __sent.filter(s => s.portId === 'lumi-display').forEach(s => {
        const b = s.bytes;
        if ((b[0] & 0xf0) === 0x90 && b[2]) keys[b[1]] = b[2];
        if ((b[0] & 0xf0) === 0x80 || ((b[0] & 0xf0) === 0x90 && !b[2])) delete keys[b[1]];
      });
      return keys;
    };
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && window.SLLumiPractice && App.active === 'quiz');
  console.log('# real app: default simulation requires no MIDI permission or device traffic');
  const simulation = await page.evaluate(() => {
    App.switchTo('lumipractice');
    __change('flow', 'manual'); __change('kind', 'major'); __click('start'); __click('preview');
    SLLumiPractice.snapshot().target.forEach(n => document.querySelector('[data-answer-note="' + n + '"]').click());
    __click('check');
    return { s: SLLumiPractice.snapshot(), requests: __requests, sent: __sent.length, page: App.active };
  });
  ok(simulation.page === 'lumipractice' && simulation.s.correct === 1 && simulation.requests === 0 && simulation.sent === 0,
    'served full app supports simulated triads without connecting MIDI');

  await page.evaluate(async () => { __click('stop'); await App.midi.enable(); App.midi.setDisplayOutput('lumi-display'); App.midi.setDisplayEnabled(true); App.help.set(4); });
  const baseline = await page.evaluate(() => ({ lit: Object.keys(__lit()).length,
    shared: [App.midi.inputId, App.midi.outputId], on: App.midi.lightsOn, display: App.midi.display, led: App.midi.ledMode }));
  ok(baseline.lit === 14 && baseline.shared.join() === 'all,lumi-display',
    'real shared keybed starts with the full C-major layout and All keyboards');
  const colorParity = await page.evaluate(() => {
    const results = [];
    for (const mode of ['interval', 'note']) for (const tonic of [0, 7]) {
      App.colors.setMode(mode); App.emit('fb:set', { source: 'palette-test', root: tonic, scale: 'major', mode: 1 });
      const notes = Array.from({length:24}, (_,i) => i+48), lease = App.midi.leaseKeybedOutput('lumi-display', 'palette-parity');
      const sent = lease.frame({target:notes, correct:[48], wrong:[49], channel:0}), lit = __lit();
      results.push(sent && notes.every(n => lit[n] === App.colors.lumiVelocity(n) &&
        SLNotePalette.rgb(lit[n]) === App.colors.forPitch(n) &&
        document.querySelector('[data-target-note="' + n + '"]').dataset.pitchColor === App.colors.forPitch(n)));
      lease();
    }
    const aliases = App.colors.forPitch('C#') === App.colors.forPitch('Db') && App.colors.lumiVelocity('E#') === App.colors.lumiVelocity('F');
    App.colors.setMode('interval'); App.emit('fb:set', { source: 'palette-test', root: 0, scale: 'major', mode: 1 });
    return { results, aliases, synth: __sent.filter(m => m.portId === 'modx-output').length };
  });
  ok(colorParity.results.length === 4 && colorParity.results.every(Boolean) && colorParity.aliases && colorParity.synth === 0,
    'every chromatic pitch in both 24-key windows/modes uses identical preview RGB and shared-frame lookup values, including correct/wrong roles and enharmonic spellings');
  await hardware(page);
  const routing = await page.evaluate(() => {
    const target = SLLumiPractice.snapshot().target, shared = [];
    App.on('midi:note', d => { if (d.on) shared.push({ midi: d.midi, portId: d.portId }); });
    App.midi.setInputFilter(b => (b[0] & 0xf0) === 0x90 ? [b[0], b[1] + 12, b[2]] : b);
    target.forEach(n => __receive('other-input', [0x90, n, 90]));
    const ignored = SLLumiPractice.snapshot().held.length;
    target.forEach((n, i) => __receive('modx-answer', [0x90 | i, n, 90])); __click('check');
    App.midi.setInputFilter(null);
    return { ignored, s: SLLumiPractice.snapshot(), shared };
  });
  ok(routing.ignored === 0 && routing.s.correct === 1 && routing.shared.some(n => n.portId === 'modx-answer' && n.midi === 60),
    'exact physical answers bypass shared transposition while global notes keep their port IDs and rules');

  console.log('# real app: selected output lease prevents shared keybed conflicts');
  await page.evaluate(() => __click('test'));
  const test = await page.evaluate(() => {
    const from = __sent.length;
    App.midi.guide(60, 62); App.midi.repaint();
    return { s: SLLumiPractice.snapshot(), lit: Object.keys(__lit()).map(Number), extra: __sent.slice(from) };
  });
  ok(test.s.leased && test.s.activeOutputs === 1 && test.lit.join() === '48' && test.extra.length === 0,
    'test pulse owns the selected LUMI; shared guide/repaint emits no competing notes or SysEx');
  await page.waitForFunction(() => SLLumiPractice.snapshot().tested && !SLLumiPractice.snapshot().leased);
  await page.evaluate(() => App.midi.guide(null, null));
  ok(await page.evaluate(() => Object.keys(__lit()).length === 14), 'test completion restores the existing shared scale');
  await page.evaluate(() => __click('arm'));
  const armed = await page.evaluate(() => {
    const from = __sent.length;
    App.midi.repaint();
    return { s: SLLumiPractice.snapshot(), lit: Object.keys(__lit()).map(Number).sort((a,b) => a-b), extra: __sent.slice(from) };
  });
  ok(armed.s.armed && armed.s.leased && armed.lit.join() === armed.s.target.join() && armed.extra.length === 0,
    'armed exact target replaces the scale and holds ownership across shared repaint');
  await page.waitForTimeout(850);
  ok(await page.evaluate(() => SLLumiPractice.snapshot().leased && SLLumiPractice.snapshot().activeOutputs === 3 && Object.keys(__lit()).length === 3),
    'instructional target stays visible beyond the former pulse timeout');
  const restored = await page.evaluate(() => {
    __click('next'); const last = SLLumiPractice.snapshot().target;
    __click('stop');
    App.emit('fb:set', { source: 'test', root: 7, scale: 'major', mode: 1 });
    return { s: SLLumiPractice.snapshot(), lit: Object.keys(__lit()).map(Number), last,
      shared: [App.midi.inputId, App.midi.outputId], on: App.midi.lightsOn, display: App.midi.display, led: App.midi.ledMode,
      ports: [...new Set(__sent.map(x => x.portId))] };
  });
  ok(!restored.s.leased && !restored.s.armed && restored.lit.length === 14 && restored.lit.includes(54) && !restored.lit.includes(53),
    'stop releases exact target notes and repaints the CURRENT G-major layout instead of a stale cache');
  ok(restored.shared.join() === baseline.shared.join() && restored.on === baseline.on && restored.display === baseline.display &&
    restored.led === baseline.led && restored.ports.join() === 'lumi-display',
    'same-output cooperation preserves shared routing/preferences and never sends to the MODX synth');

  await hardware(page); await arm(page);
  const leaving = await page.evaluate(() => {
    App.switchTo('fretboard');
    return { s: SLLumiPractice.snapshot(), lit: Object.keys(__lit()).length };
  });
  ok(!leaving.s.running && !leaving.s.leased && !leaving.s.armed && leaving.s.activeOutputs === 0 && leaving.lit === 14,
    'real shell navigation cleans the pulse/subscription/lease and restores shared lights');

  console.log('# real app: guided MODX answers drive a sustained LUMI instructional frame');
  await page.evaluate(() => { App.switchTo('lumipractice'); __change('flow', 'guided'); __change('kind', 'major'); });
  await hardware(page); await arm(page);
  const guidedFirst = await page.evaluate(() => SLLumiPractice.snapshot());
  await page.waitForTimeout(850);
  ok(await page.evaluate(target => {
    const s = SLLumiPractice.snapshot();
    return s.armed && s.activeOutputs === 3 && s.correct === 0 && s.target.join() === target.join() &&
      Object.keys(__lit()).map(Number).sort((a,b) => a-b).join() === target.join();
  }, guidedFirst.target), 'unanswered target chord stays on the LUMI after 650 ms without becoming an answer');
  const guidedPartial = await page.evaluate(() => {
    const n = SLLumiPractice.snapshot().target[0]; __receive('modx-answer', [0x90, n, 100]);
    return { s: SLLumiPractice.snapshot(), vel: __lit()[n], expected: App.colors.lumiVelocity(n), label: document.querySelector('[data-target-note="' + n + '"] .lp-role').textContent };
  });
  await page.waitForTimeout(850);
  ok(guidedPartial.s.feedback === 'waiting' && guidedPartial.vel === guidedPartial.expected && guidedPartial.label === '✓ Correct' &&
    await page.evaluate(target => SLLumiPractice.snapshot().correct === 0 && SLLumiPractice.snapshot().target.join() === target.join(), guidedFirst.target),
    'partial physical chord labels the correct key without changing its pitch hue through the shared renderer and waits');
  const guidedWrong = await page.evaluate(() => {
    const bad = SLLumiPractice.snapshot().target[0] + 1; __receive('modx-answer', [0x91, bad, 100]);
    return { bad, s: SLLumiPractice.snapshot(), vel: __lit()[bad], expected: App.colors.lumiVelocity(bad), text: document.getElementById('lp-feedback').textContent };
  });
  await page.waitForTimeout(850);
  ok(guidedWrong.s.feedback === 'wrong' && guidedWrong.vel === guidedWrong.expected && /× Wrong/.test(guidedWrong.text) &&
    await page.evaluate(() => SLLumiPractice.snapshot().correct === 0 && !SLLumiPractice.snapshot().advancing),
    'wrong physical extra note gets a distinct LED frame and labeled error, never automatic advancement');
  await page.evaluate(bad => {
    __receive('modx-answer', [0x81, bad, 0]);
    SLLumiPractice.snapshot().target.slice(1).forEach((n, i) => __receive('modx-answer', [0x92 | i, n, 100]));
  }, guidedWrong.bad);
  ok(await page.evaluate(() => SLLumiPractice.snapshot().feedback === 'correct' && SLLumiPractice.snapshot().advancing &&
    SLLumiPractice.snapshot().target.every(n => __lit()[n] === App.colors.lumiVelocity(n))),
    'complete exact physical chord preserves pitch colors and signals correct before advancing');
  await page.waitForFunction(() => SLLumiPractice.snapshot().correct === 1);
  const guidedNext = await page.evaluate(() => SLLumiPractice.snapshot());
  ok(guidedNext.target.join() !== guidedFirst.target.join() && guidedNext.held.join() === guidedFirst.target.join(),
    'automatic transition preserves real physical holds instead of inventing note-offs');
  await page.evaluate(target => {
    __receive('modx-answer', [0x80, target[0], 0]);
    target.slice(1).forEach((n, i) => __receive('modx-answer', [0x82 | i, n, 0]));
    App.emit('midi:out', { bytes: [0x90, SLLumiPractice.snapshot().target[0], 100], portId: 'lumi-display' });
  }, guidedFirst.target);
  await page.waitForTimeout(850);
  ok(await page.evaluate(() => SLLumiPractice.snapshot().held.length === 0 && SLLumiPractice.snapshot().correct === 1),
    'only matching physical note-offs clear held answers; display output events never answer the next target');
  await page.evaluate(() => {
    SLLumiPractice.snapshot().target.forEach(n => __receive('modx-answer', [0x90, n, 100]));
    __click('stop');
  });
  await page.waitForTimeout(850);
  ok(await page.evaluate(() => {
    const s = SLLumiPractice.snapshot(); return !s.running && !s.advancing && !s.leased && !s.armed && s.correct === 1 && s.activeOutputs === 0;
  }), 'stop during correct feedback cancels automatic advancement and releases the instructional frame');

  await page.evaluate(() => __change('flow', 'manual'));
  await hardware(page); await arm(page);
  const replaced = await page.evaluate(() => {
    const original = __access.outputs.get('lumi-display'), messages = [];
    const replacement = new original.constructor(original.id, original.name);
    replacement.send = bytes => { messages.push(Array.from(bytes)); __sent.push({ portId: replacement.id, bytes: Array.from(bytes) }); };
    __access.outputs.set(replacement.id, replacement); __access.onstatechange();
    return { s: SLLumiPractice.snapshot(), messages };
  });
  ok(!replaced.s.running && !replaced.s.armed && !replaced.s.leased && replaced.messages.length > 0 &&
    replaced.messages.every(b => (b[0] & 0xf0) !== 0x80),
    'same-ID replacement cannot receive old frame note-offs; ordinary shared inventory repaint is separate');

  console.log('# real app: separate synth input, LUMI display output and locked synth sound output');
  await page.waitForFunction(() => !!App.practiceRouter);
  const soundSetup = await page.evaluate(() => {
    App.emit('fb:set', { source: 'test', root: 0, scale: 'major', mode: 1 });
    App.scaleLock.set(true);
    __change('flow', 'guided'); __change('kind', 'major');
    __change('input', 'modx-answer'); __change('output', 'lumi-display');
    __change('sound-output', 'modx-output'); __click('start');
    return { s: SLLumiPractice.snapshot(), outputs: [...document.getElementById('lp-sound-output').options].map(p => p.value),
      disabled: document.getElementById('lp-sound-start').disabled, active: App.practiceRouter.active,
      shared: [App.midi.inputId, App.midi.outputId] };
  });
  ok(soundSetup.s.inputId === 'modx-answer' && soundSetup.s.outputId === 'lumi-display' && soundSetup.s.synthOutputId === 'modx-output' &&
    soundSetup.outputs.join() === ',modx-output' && !soundSetup.s.localControlOff && soundSetup.disabled && !soundSetup.active,
    'three explicit routes remain independent; synth sound excludes LUMI and starts OFF pending Local Control acknowledgement');
  await arm(page);
  const soundStarted = await page.evaluate(() => {
    const target = SLLumiPractice.snapshot().target;
    const white = target.every(n => __lit()[n] === App.colors.lumiVelocity(n));
    const ack = document.getElementById('lp-local-control'); ack.checked = true; ack.dispatchEvent(new Event('change'));
    __click('sound-start');
    return { state: App.practiceRouter.state, white, s: SLLumiPractice.snapshot() };
  });
  ok(soundStarted.state.active && soundStarted.state.inputId === 'modx-answer' && soundStarted.state.outputId === 'modx-output' &&
    soundStarted.white && soundStarted.s.armed,
    'explicit acknowledgement starts selected synth sound while target-only LUMI frame remains independently armed with mapped pitch colors');
  const blocked = await page.evaluate(() => {
    const from = __sent.length; __receive('modx-answer', [0x90, 49, 100]);
    return { s: SLLumiPractice.snapshot(), state: App.practiceRouter.state,
      synth: __sent.slice(from).filter(m => m.portId === 'modx-output'), red: __lit()[49], expected: App.colors.lumiVelocity(49),
      label: document.querySelector('[data-target-note="49"] .lp-role').textContent };
  });
  ok(blocked.state.blocked === 1 && blocked.s.feedback === 'wrong' && blocked.synth.length === 0 && blocked.red === blocked.expected && blocked.label === '× Wrong',
    'out-of-scale synth key remains an instructional error on LUMI while its sound note-on is blocked');
  const soundStopped = await page.evaluate(() => {
    __receive('modx-answer', [0x80, 49, 0]);
    const from = __sent.length;
    SLLumiPractice.snapshot().target.forEach(n => __receive('modx-answer', [0x90, n, 100]));
    __receive('modx-answer', [0xb0, 64, 127]);
    const before = { s: SLLumiPractice.snapshot(), green: SLLumiPractice.snapshot().target.every(n => __lit()[n] === App.colors.lumiVelocity(n)) };
    __click('stop');
    return { before, s: SLLumiPractice.snapshot(), state: App.practiceRouter.state,
      synth: __sent.slice(from).filter(m => m.portId === 'modx-output').map(m => m.bytes),
      shared: [App.midi.inputId, App.midi.outputId] };
  });
  await page.waitForTimeout(850);
  ok(soundStopped.before.green && soundStopped.before.s.advancing && soundStopped.synth.filter(b => b[0] === 0x90).map(b => b[1]).join() === '48,52,55' &&
    soundStopped.synth.filter(b => b[0] === 0x80).map(b => b[1]).join() === '48,52,55' &&
    soundStopped.synth.some(b => b[0] === 0xb0 && b[1] === 64 && b[2] === 0),
    'correct target retains pitch colors, forwards exact allowed pitches, and Stop sends their matching note-offs plus sustain release');
  ok(!soundStopped.state.active && soundStopped.state.held === 0 && !soundStopped.s.armed && !soundStopped.s.leased &&
    soundStopped.shared.join() === soundSetup.shared.join() && await page.evaluate(() => !SLLumiPractice.snapshot().advancing && SLLumiPractice.snapshot().correct === 0),
    'Stop cleans sound routing, display ownership and queued advancement without changing global selections');

  await page.setViewportSize({ width: 375, height: 1000 });
  await page.evaluate(() => { App.switchTo('lumipractice'); __change('mode', 'simulated'); __click('start'); });
  const phone = await page.evaluate(() => {
    const panel = document.getElementById('panel-lumipractice'), key = document.querySelector('[data-answer-note]');
    return { width: innerWidth, panel: panel.getBoundingClientRect().width,
      overflow: panel.scrollWidth > panel.clientWidth + 1, key: key.getBoundingClientRect().width };
  });
  ok(!phone.overflow && phone.key >= 36, 'phone practice fits its panel with usable answer targets: ' + JSON.stringify(phone));
  await page.waitForTimeout(950); // allow the shell's space transition to finish
  await page.screenshot({ path: '/tmp/soundlab-lumi-practice-phone.png', fullPage: true });
  ok(errors.length === 0, 'real full app has no browser exceptions: ' + errors.join('; '));
  await context.close();
}

async function ingressFixture(browser) {
  const { page, context, errors } = await fixture(browser);
  console.log('# exact answer input: packet-independent MIDI decoding');
  await hardware(page);
  await page.evaluate(() => { __change('flow', 'manual'); __change('kind', 'major'); __click('start'); });
  const fragmented = await page.evaluate(() => {
    const target = SLLumiPractice.snapshot().target;
    __receive('modx-answer', [0x92, target[0], 0xf8]);
    const incomplete = SLLumiPractice.snapshot().held.length;
    __receive('modx-answer', [90, target[1], 0xfa, 91, target[2]]);
    const partial = SLLumiPractice.snapshot();
    __receive('modx-answer', [92]); __click('check');
    return { target, incomplete, partial, complete: SLLumiPractice.snapshot() };
  });
  ok(fragmented.incomplete === 0 && fragmented.partial.held.length === 2 && fragmented.partial.correct === 0,
    'fragmented running-status chord keeps incomplete notes pending and preserves realtime between pitch and velocity');
  ok(fragmented.complete.held.join() === fragmented.target.join() && fragmented.complete.correct === 1 && fragmented.complete.feedback === 'correct',
    'the final data fragment completes an exact three-note chord through the isolated answer subscription');
  const released = await page.evaluate(() => {
    const target = SLLumiPractice.snapshot().target;
    __receive('modx-answer', [0x92, target[0], 0, target[1], 0xf8, 0, target[2], 0]);
    return SLLumiPractice.snapshot();
  });
  ok(!released.held.length, 'packed velocity-zero running-status messages release every previously held chord note');
  const channels = await page.evaluate(() => {
    __click('start'); const n = SLLumiPractice.snapshot().target[0], bytes = [];
    for (let c = 0; c < 16; c++) bytes.push(0x90 | c, n, 90);
    __receive('modx-answer', bytes);
    for (let c = 0; c < 15; c++) __receive('modx-answer', [0x80 | c, n, 0]);
    const partial = SLLumiPractice.snapshot(); __receive('modx-answer', [0x9f, n, 0]);
    return { n, partial, end: SLLumiPractice.snapshot() };
  });
  ok(channels.partial.held.join() === String(channels.n) && channels.end.held.length === 0,
    'all sixteen physical channels retain independent holds until their matching release, including velocity-zero on channel sixteen');
  const system = await page.evaluate(() => {
    __click('start'); const target = SLLumiPractice.snapshot().target;
    __receive('modx-answer', [0xf0, 1, 0xf8, 2]); __receive('modx-answer', [3, 0xf7, 90]);
    __receive('modx-answer', [0xf2, 1, 0xfa, 2, target[0], 90, 0xf6]);
    const ignored = SLLumiPractice.snapshot().held.length;
    __receive('modx-answer', [0x90, target[0], 0x91, target[1], 88]);
    const resynced = SLLumiPractice.snapshot(); __receive('modx-answer', [0x81, target[1], 0]);
    __receive('modx-answer', [0xd0, 80, 81, 0xc0, 1, 2, 0x90, target[0], 91]);
    const shortMessages = SLLumiPractice.snapshot();
    return { target, ignored, resynced, shortMessages };
  });
  ok(system.ignored === 0 && system.resynced.held.join() === String(system.target[1]),
    'fragmented SysEx/system data is ignored and a new status aborts an incomplete note without inventing an attack');
  ok(system.shortMessages.held.join() === String(system.target[0]),
    'one-byte program/pressure payloads are consumed without swallowing or fabricating the next answer note');
  const portIsolation = await page.evaluate(() => {
    __click('start'); const n = SLLumiPractice.snapshot().target[0];
    __receive('modx-answer', [0x90, n]);
    __stale.at(-1)({ portId: 'other-input', bytes: [100] });
    App.emit('midi:note', { on: true, midi: n, chan: 0 }); App.emit('note:input', { on: true, midi: n });
    const ignored = SLLumiPractice.snapshot().held.length;
    __receive('modx-answer', [100]);
    return { n, ignored, end: SLLumiPractice.snapshot(), sent: __sent.length };
  });
  ok(portIsolation.ignored === 0 && portIsolation.end.held.join() === String(portIsolation.n) && portIsolation.sent === 0,
    'another input or the global note bus cannot complete a pending exact-source answer or generate MIDI output');
  for (const boundary of ['stop', 'exercise', 'input', 'window', 'hide', 'blur', 'scale']) {
    const result = await page.evaluate(boundary => {
      __click('start'); const n = SLLumiPractice.snapshot().target[0], stale = __stale.at(-1);
      __receive('modx-answer', [0x90, n]);
      if (boundary === 'stop') __click('stop');
      if (boundary === 'exercise') { __change('kind', 'minor'); __change('kind', 'major'); }
      if (boundary === 'input') { __change('input', 'lumi-input'); __change('input', 'modx-answer'); }
      if (boundary === 'window') { __change('low', 60); __change('low', 48); }
      if (boundary === 'hide') { App.modules.lumipractice.onHide(); App.modules.lumipractice.onShow(); }
      if (boundary === 'blur') window.dispatchEvent(new Event('blur'));
      if (boundary === 'scale') App.emit('fb:set', {});
      __click('start'); stale({ portId: 'modx-answer', bytes: [100] }); __receive('modx-answer', [100]);
      const reset = SLLumiPractice.snapshot();
      __receive('modx-answer', [0x90, n, 100]);
      return { n, reset, fresh: SLLumiPractice.snapshot() };
    }, boundary);
    ok(result.reset.held.length === 0 && result.fresh.held.join() === String(result.n),
      boundary + ' resets partial/running-status bytes and rejects the prior subscription generation while allowing fresh input');
  }
  const refresh = await page.evaluate(() => {
    __click('start'); const n = SLLumiPractice.snapshot().target[0], count = __stale.length;
    __receive('modx-answer', [0x94, n]); __click('refresh'); __receive('modx-answer', [99]);
    return { n, count, after: __stale.length, s: SLLumiPractice.snapshot() };
  });
  ok(refresh.s.held.join() === String(refresh.n) && refresh.count === refresh.after,
    'a harmless refresh preserves the exact live subscription and its partial frame');
  const changedIdentity = await page.evaluate(() => {
    window.__fingerprint = 'original'; App.midi.inputFingerprint = () => __fingerprint;
    __click('start'); const n = SLLumiPractice.snapshot().target[0]; __receive('modx-answer', [0x90, n]);
    __fingerprint = 'replacement'; __receive('modx-answer', [90]); const stopped = SLLumiPractice.snapshot();
    __click('start'); __receive('modx-answer', [90]); return { stopped, fresh: SLLumiPractice.snapshot() };
  });
  ok(!changedIdentity.stopped.running && !changedIdentity.stopped.held.length && !changedIdentity.fresh.held.length,
    'an exact input fingerprint replacement stops the session and never inherits the old pending note');
  const guided = await page.evaluate(() => {
    __change('flow', 'guided'); __click('start'); const target = SLLumiPractice.snapshot().target;
    __receive('modx-answer', [0x92, target[0], 0xf8, 90, target[1], 90, target[2]]);
    __receive('modx-answer', [0xfa, 90]); return target;
  });
  await page.waitForFunction(() => SLLumiPractice.snapshot().correct === 1);
  const guidedRelease = await page.evaluate(target => {
    __receive('modx-answer', [0x92, target[0], 0]);
    __receive('modx-answer', [target[1], 0xf8, 0, target[2]]); __receive('modx-answer', [0]);
    return SLLumiPractice.snapshot();
  }, guided);
  ok(guidedRelease.correct === 1 && !guidedRelease.held.length && guidedRelease.target.join() !== guided.join(),
    'a fragmented guided chord advances exactly once and its fragmented original-channel releases clear the real holds');
  ok(errors.length === 0, 'packet-decoder fixture has no browser exceptions: ' + errors.join('; '));
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const { page, context, errors } = await fixture(browser);
    console.log('# simulated practice and exact-pitch grading');
    const initial = await page.evaluate(() => ({ state: SLLumiPractice.snapshot(), badge: document.getElementById('lp-mode-badge').textContent,
      keys: document.querySelectorAll('[data-target-note]').length, sent: __sent.length, listeners: __listeners.size }));
    ok(initial.state.flow === 'guided', 'wait-until-correct is the default progression');
    ok(initial.state.mode === 'simulated' && !initial.state.armed && !initial.state.running && /SIMULATED/.test(initial.badge), 'fresh page explicitly simulated; hardware output OFF');
    ok(initial.keys === 24 && initial.sent === 0 && initial.listeners === 0, '24-key reference and no port subscription or device traffic at initialization');
    const simulated = await page.evaluate(() => {
      __change('flow', 'manual'); __change('kind', 'major'); __click('start');
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
    ok(offered.inputs.join() === ',modx-answer,other-input,lumi-input' && offered.outputs.join() === ',lumi-display,other-output', 'explicit LUMI or MODX answer inputs remain separate from LUMI display output; unrelated and virtual roles excluded');
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
      SLLumiPractice.snapshot().held.forEach((n, i) => __receive('modx-answer', [0x80 | i, n, 0]));
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
    ok(armed.state.armed && armed.state.activeOutputs === 3 && /instructional target/.test(armed.text), 'completed test permits explicit arm and sustained triad instruction');
    ok(armed.sent.every(s => s.portId === 'lumi-display' && [0x80, 0x90].includes(s.bytes[0] & 0xf0) && s.bytes[1] >= 48 && s.bytes[1] <= 71 && s.bytes.length === 3), 'only ordinary in-window notes go to explicitly selected LUMI output; no SysEx/CC/program/fallback');
    await page.waitForTimeout(850);
    ok(await page.evaluate(() => SLLumiPractice.snapshot().armed && SLLumiPractice.snapshot().activeOutputs === 3), 'target remains lit while waiting instead of disappearing after 650 ms');
    await page.evaluate(() => __click('disarm'));
    ok(await page.evaluate(() => !SLLumiPractice.snapshot().armed && SLLumiPractice.snapshot().activeOutputs === 0 && __sent.filter(s => (s.bytes[0] & 0xf0) === 0x90).length === __sent.filter(s => (s.bytes[0] & 0xf0) === 0x80).length), 'explicit disarm releases all sustained target notes');
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
    await hardware(page); await arm(page);
    const sameId = await page.evaluate(() => { App.emit('midi:state', {}); return SLLumiPractice.snapshot(); });
    ok(!sameId.running && !sameId.armed && !sameId.tested && !sameId.leased, 'same-ID inventory/route changes require a fresh session, test and arm');
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
      ['virtual-input', 'helix-input'].forEach(id => {
        __inputs.push({ id, name: id === 'virtual-input' ? 'MODX loopMIDI' : 'Helix Stadium' });
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
    await hardware(page);
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
      __inputs.find(p => p.id === 'modx-answer').name = 'Helix Stadium';
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
    await guidedFixture(browser);
    await ingressFixture(browser);
    await fullApp(browser);
  } finally { await browser.close(); }
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS — mocks only; physical LUMI/MODX lighting unverified');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
