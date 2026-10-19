// Mock-only Helix profile checks. No server, MIDI permission or device required.
const { chromium } = require('playwright');
const path = require('path');
const env = require('./env');
let fails = 0;
function ok(condition, label) {
  console.log('  ' + (condition ? 'PASS' : 'FAIL'), label);
  if (!condition) fails++;
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

async function fixture(browser, saved) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<!doctype html><html lang="en"><body><section id="panel-helix-stadium"></section></body></html>');
  await page.addStyleTag({ path: path.join(env.ROOT, 'css', 'style.css') });
  await page.addStyleTag({ path: path.join(env.ROOT, 'css', 'helix-stadium.css') });
  await page.evaluate(saved => {
    const storage = { 'helixStadium.favorites': saved || [] }, bus = {}, modules = {};
    window.__sent = []; window.__legacyCalls = 0; window.__enableCalls = 0; window.__subscribed = new Map();
    window.__unsubscribed = 0; window.__failAt = -1; window.__attempts = 0;
    const outputs = [
      { id: 'helix-a', name: 'Helix Stadium XL' }, { id: 'helix-b', name: 'Helix Stadium XL Port 2' },
      { id: 'modx', name: 'Yamaha MODX' }, { id: 'lumi', name: 'ROLI LUMI' },
      { id: 'mixed', name: 'Helix MODX virtual' }, { id: 'virtual', name: 'Helix loopMIDI' },
      { id: 'din', name: 'USB MIDI Interface' }
    ];
    const inputs = [{ id: 'helix-in', name: 'Helix Stadium XL' }, { id: 'modx-in', name: 'MODX' }];
    window.App = {
      modules,
      store: { get: (key, fallback) => key in storage ? storage[key] : fallback, set: (key, value) => { storage[key] = value; } },
      register: (name, module) => { modules[name] = module; },
      on: (name, fn) => { (bus[name] || (bus[name] = [])).push(fn); },
      emit: (name, value) => { (bus[name] || []).forEach(fn => fn(value)); },
      midi: {
        supported: true, ready: true, explicitPortsSupported: true, outputs, inputs,
        inputId: 'modx-in', outputId: 'lumi',
        enable: () => { __enableCalls++; return Promise.resolve(); },
        setInput: () => { __legacyCalls++; }, setOutput: () => { __legacyCalls++; },
        send: () => { __legacyCalls++; return true; }, setInputFilter: () => { __legacyCalls++; },
        sendToOutput: (id, bytes) => {
          const fail = __attempts++ === __failAt;
          if (fail || !App.midi.outputs.some(port => port.id === id)) return false;
          __sent.push({ id, bytes: Array.from(bytes) });
          App.emit('midi:out', { portId: id, bytes: Array.from(bytes) });
          return true;
        },
        subscribeInput: (id, fn) => {
          if (!App.midi.inputs.some(port => port.id === id)) return null;
          __subscribed.set(id, fn);
          return () => { __unsubscribed++; __subscribed.delete(id); };
        }
      }
    };
    window.__receive = (id, bytes, reportedId) => {
      const fn = __subscribed.get(id); if (fn) fn({ portId: reportedId || id, bytes });
    };
    window.__change = (id, value) => {
      const element = document.getElementById('hs-' + id); element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    window.__ready = (output = 'helix-a', channel = '1') => {
      __change('firmware', '1.4'); __change('output', output); __change('channel', channel);
      document.getElementById('hs-arm').click();
    };
  }, saved);
  await page.addScriptTag({ path: path.join(env.ROOT, 'js', 'helix-stadium.js') });
  await page.evaluate(() => {
    App.modules['helix-stadium'].init(document.getElementById('panel-helix-stadium'));
    App.modules['helix-stadium'].onShow();
  });
  return { context, page, errors };
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const { context, page, errors } = await fixture(browser);
    console.log('# startup and exact message builders');
    const startup = await page.evaluate(() => ({
      sent: __sent, enable: __enableCalls, legacy: __legacyCalls, state: SLHelixStadium.state,
      disabled: document.getElementById('hs-arm').disabled,
      options: Array.from(document.getElementById('hs-output').options).map(option => option.value),
      edge: SLHelixStadium.presetBytes(16, 127, 127, 8),
      invalid: [SLHelixStadium.presetBytes(0, 0, 0), SLHelixStadium.presetBytes(1, 128, 0), SLHelixStadium.presetBytes(1, 0, -1), SLHelixStadium.snapshotBytes(17, 0), SLHelixStadium.snapshotBytes(1, 10)],
      warning: document.body.textContent.includes('Hardware untested')
    }));
    ok(startup.sent.length === 0 && startup.enable === 0 && startup.legacy === 0, 'load/show never enables MIDI, selects shared ports, installs filters, or sends');
    ok(!startup.state.armed && startup.state.outputId === '' && startup.disabled, 'output starts disarmed and unselected with unchecked firmware');
    ok(same(startup.options, ['', 'helix-a', 'helix-b']), 'MODX, LUMI, mixed/virtual and unnamed DIN outputs excluded');
    ok(same(startup.edge, [[191, 32, 127], [207, 127], [191, 69, 7]]) && startup.invalid.every(value => value === null), 'raw 0–127 bank/program, one-based channel/snapshot, and strict bounds');
    ok(startup.warning, 'hardware-untested limitation is visible');

    console.log('# firmware, favorite storage and output arming');
    const favorite = await page.evaluate(() => {
      __change('output', 'helix-a'); __change('firmware', 'other'); document.getElementById('hs-arm').click();
      const unsupported = SLHelixStadium.state.armed;
      document.getElementById('hs-name').value = '<img src=x onerror=alert(1)> Blues Deluxe';
      __change('bank', '4'); __change('program', '127'); __change('snapshot', '8');
      document.getElementById('hs-form').dispatchEvent(new Event('submit', { cancelable: true }));
      return { unsupported, sent: __sent.length, list: App.store.get('helixStadium.favorites', []),
        rows: document.querySelectorAll('#hs-favorites li').length, injected: !!document.querySelector('#hs-favorites img') };
    });
    ok(!favorite.unsupported && favorite.sent === 0 && favorite.rows === 1, 'older/unknown firmware cannot arm; saving favorite sends nothing');
    ok(favorite.list[0].bank === 4 && favorite.list[0].program === 127 && favorite.list[0].snapshot === 8 && !favorite.injected, 'manual name and raw address stored; names render as text');

    const recall = await page.evaluate(() => {
      __ready('helix-b', '3'); const afterArm = __sent.length;
      document.querySelector('#hs-favorites [data-hs-send]').click();
      return { afterArm, sent: __sent.slice(), sharedOut: App.midi.outputId, legacy: __legacyCalls };
    });
    ok(recall.afterArm === 0, 'arming itself sends no messages');
    ok(same(recall.sent, [{ id: 'helix-b', bytes: [178, 32, 4] }, { id: 'helix-b', bytes: [194, 127] }, { id: 'helix-b', bytes: [178, 69, 7] }]), 'favorite recall sends CC32, raw PC, then optional CC69 to exact selected output');
    ok(recall.sharedOut === 'lumi' && recall.legacy === 0, 'shared keyboard destination remains unchanged');

    console.log('# snapshot and tap shortcuts');
    const shortcuts = await page.evaluate(() => {
      __sent.length = 0;
      document.querySelectorAll('#hs-snapshots button')[0].click();
      document.querySelectorAll('#hs-snapshots button')[7].click();
      document.getElementById('hs-next').click(); document.getElementById('hs-previous').click(); document.getElementById('hs-tap').click();
      return __sent.slice();
    });
    ok(same(shortcuts.map(message => message.bytes), [[178, 69, 0], [178, 69, 7], [178, 69, 8], [178, 69, 9], [178, 64, 127]]) && shortcuts.every(message => message.id === 'helix-b'), 'snapshots 1/8, next/previous, and tap send documented bytes on Global channel');

    const disarms = await page.evaluate(() => {
      const results = [];
      __change('channel', '2'); results.push(!SLHelixStadium.state.armed);
      document.getElementById('hs-arm').click(); __change('output', 'helix-a'); results.push(!SLHelixStadium.state.armed);
      document.getElementById('hs-arm').click(); __change('firmware', ''); results.push(!SLHelixStadium.state.armed);
      __ready(); window.dispatchEvent(new Event('blur')); results.push(!SLHelixStadium.state.armed);
      const start = __sent.length; document.getElementById('hs-tap').click();
      return { results, quiet: __sent.length === start };
    });
    ok(disarms.results.every(Boolean) && disarms.quiet, 'channel, destination, firmware and focus changes disarm; disarmed buttons cannot send');

    console.log('# isolated read-only input and lifecycle');
    await page.evaluate(() => {
      __change('input', 'helix-in'); __sent.length = 0;
      __receive('helix-in', [176, 69, 3], 'modx-in');
      __receive('helix-in', [176, 69, 5]); __receive('helix-in', [248]);
    });
    await page.waitForTimeout(140);
    const activity = await page.evaluate(() => ({ text: document.getElementById('hs-activity').textContent, sent: __sent.length, sharedInput: App.midi.inputId }));
    ok(/2 messages · 1 clock ticks/.test(activity.text) && activity.sent === 0 && activity.sharedInput === 'modx-in', 'only exact selected input counted; clock observed without forwarding or changing keyboard input');
    const lifecycle = await page.evaluate(() => {
      __ready(); App.modules['helix-stadium'].onHide();
      const hidden = { state: SLHelixStadium.state, subscriptions: __subscribed.size, unsubs: __unsubscribed };
      App.modules['helix-stadium'].onShow();
      const shown = { state: SLHelixStadium.state, subscriptions: __subscribed.size };
      document.getElementById('hs-arm').click(); App.emit('midi:state', {});
      return { hidden, shown, afterState: SLHelixStadium.state, subscriptions: __subscribed.size };
    });
    ok(!lifecycle.hidden.state.armed && !lifecycle.hidden.state.visible && lifecycle.hidden.subscriptions === 0 && lifecycle.hidden.unsubs > 0, 'page exit disarms and releases input subscription');
    ok(!lifecycle.shown.state.armed && lifecycle.shown.subscriptions === 1 && !lifecycle.afterState.armed && lifecycle.subscriptions === 1, 'page entry remains disarmed; MIDI state refresh replaces subscription without duplicates');
    const appHidden = await page.evaluate(() => {
      __ready();
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      const hidden = { armed: SLHelixStadium.state.armed, subscriptions: __subscribed.size };
      App.emit('midi:state', {});
      const stillHidden = __subscribed.size;
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      return { hidden, stillHidden, visible: { armed: SLHelixStadium.state.armed, subscriptions: __subscribed.size } };
    });
    ok(!appHidden.hidden.armed && appHidden.hidden.subscriptions === 0 && appHidden.stillHidden === 0 && !appHidden.visible.armed && appHidden.visible.subscriptions === 1, 'app hiding releases monitoring and disarms; MIDI state cannot resubscribe while hidden');

    console.log('# failed sends and disconnected destination');
    const failure = await page.evaluate(() => {
      __ready(); __sent.length = 0; __failAt = __attempts + 1;
      document.getElementById('hs-recall').click();
      const partial = { sent: __sent.slice(), armed: SLHelixStadium.state.armed, text: document.getElementById('hs-status').textContent };
      __failAt = -1; __ready();
      App.midi.outputs = App.midi.outputs.filter(port => port.id !== 'helix-a');
      const start = __sent.length; document.getElementById('hs-tap').click();
      return { partial, disconnected: { sent: __sent.length - start, state: SLHelixStadium.state }, legacy: __legacyCalls };
    });
    ok(failure.partial.sent.length === 1 && !failure.partial.armed && /partly sent/.test(failure.partial.text), 'partial recall reports uncertainty, disarms, and never retries');
    ok(failure.disconnected.sent === 0 && !failure.disconnected.state.armed && failure.legacy === 0, 'missing destination disarms without a fallback send');
    const renamed = await page.evaluate(() => {
      __ready('helix-b');
      App.midi.outputs.find(port => port.id === 'helix-b').name = 'MODX';
      const start = __sent.length; document.getElementById('hs-tap').click();
      return { quiet: __sent.length === start, armed: SLHelixStadium.state.armed };
    });
    ok(renamed.quiet && !renamed.armed, 'destination name is revalidated on every send even when ID is unchanged');
    await page.evaluate(() => { App.midi.explicitPortsSupported = false; App.emit('midi:state', {}); });
    ok(await page.locator('#hs-arm').isDisabled(), 'unsupported native-style backend cannot arm');

    console.log('# favorite restoration, edit/remove and small viewport');
    const second = await fixture(browser, favorite.list.concat([{ id: 'bad', name: 'Invalid', bank: 128, program: 0, snapshot: null }]));
    const restored = await second.page.evaluate(() => {
      const count = document.querySelectorAll('#hs-favorites li').length;
      document.querySelectorAll('#hs-favorites button')[1].click();
      document.getElementById('hs-name').value = 'Updated favorite';
      document.getElementById('hs-form').dispatchEvent(new Event('submit', { cancelable: true }));
      const saved = App.store.get('helixStadium.favorites', []);
      document.querySelectorAll('#hs-favorites button')[2].click();
      return { count, saved, removed: App.store.get('helixStadium.favorites', []).length, sent: __sent.length, state: SLHelixStadium.state };
    });
    ok(restored.count === 1 && restored.saved.length === 1 && restored.saved[0].name === 'Updated favorite' && restored.removed === 0, 'restores valid local favorites; editing updates identity and removing works');
    ok(restored.sent === 0 && restored.state.outputId === '' && !restored.state.armed, 'restored favorite does not restore destination/arming or send');
    await second.page.setViewportSize({ width: 390, height: 844 });
    ok(await second.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '390px layout has no horizontal overflow');
    ok(errors.length === 0 && second.errors.length === 0, 'no browser script errors: ' + errors.concat(second.errors).join('; '));
    await second.context.close(); await context.close();
  } finally {
    await browser.close();
  }
  console.log(fails ? fails + ' checks failed' : 'All Helix profile checks passed');
  process.exitCode = fails ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
