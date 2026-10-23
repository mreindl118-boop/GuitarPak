// Full app + simulated EventTarget MIDI ports. No physical device I/O.
// Verify the independent display master and lock controls through the real
// shared MIDI renderer, instructional page, and selected synth sound route.
const { chromium } = require('playwright');
const env = require('./env');
let checks = 0;
function ok(value, message) {
  if (!value) throw new Error(message);
  checks++; console.log('  PASS', message);
}

async function openApp(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    if (localStorage.getItem('guitarlab.fb.root') == null) localStorage.setItem('guitarlab.fb.root', '0');
    if (localStorage.getItem('guitarlab.fb.scale') == null) localStorage.setItem('guitarlab.fb.scale', '"major"');
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
    window.__access = { inputs: new Map(), outputs: new Map(), sysexEnabled: true };
    window.__addPorts = () => {
      __access.inputs.set('synth-in', new Port('synth-in', 'Yamaha MODX'));
      __access.outputs.set('lumi-out', new Port('lumi-out', 'LUMI Keys BLOCK'));
      __access.outputs.set('synth-out', new Port('synth-out', 'Yamaha MODX'));
    };
    // Recreate the same simulated inventories for the persistence reload.
    if (localStorage.getItem('test.master.ports') === 'true') __addPorts();
    navigator.requestMIDIAccess = () => { __requests++; return Promise.resolve(__access); };
    window.__receive = bytes => __access.inputs.get('synth-in').receive(bytes);
    window.__change = (id, value) => {
      const el = document.getElementById('lp-' + id); el.value = value; el.dispatchEvent(new Event('change'));
    };
    window.__click = id => document.getElementById('lp-' + id).click();
    window.__lit = () => {
      const keys = {};
      __sent.filter(m => m.portId === 'lumi-out').forEach(m => {
        const b = m.bytes, type = b[0] & 0xf0;
        if (type === 0x90 && b[2]) keys[b[1]] = b[2];
        if (type === 0x80 || (type === 0x90 && !b[2])) delete keys[b[1]];
      });
      return keys;
    };
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.setDisplayEnabled && App.practiceRouter);
  return { page, context, errors };
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const { page, context, errors } = await openApp(browser);
    console.log('# display ON without a configured device is honest and permission-free');
    const noPort = await page.evaluate(() => {
      App.midi.setDisplayEnabled(true);
      return { enabled: App.midi.displayEnabled, state: App.midi.displayState, requests: __requests, sent: __sent.length };
    });
    ok(noPort.enabled && !noPort.state.configured && !noPort.state.connected && noPort.requests === 0 && noPort.sent === 0,
      'ON records display intent without inventing a device or requesting MIDI permission');
    ok(typeof noPort.state.reason === 'string' && noPort.state.reason.length > 0,
      'unconfigured display exposes a useful connection reason');

    await page.evaluate(async () => {
      __addPorts(); localStorage.setItem('test.master.ports', 'true');
      await App.midi.enable(); App.midi.setDisplayOutput('lumi-out');
      App.switchTo('fretboard'); App.ctx(true); App.help.set(0);
    });
    const chosen = await page.evaluate(() => ({ state: App.midi.displayState, label: document.getElementById('cx-led').textContent }));
    ok(chosen.state.configured && chosen.state.connected && chosen.state.outputId === 'lumi-out' && /LUMI Display/.test(chosen.label),
      'one explicit LUMI route and one clearly named header master control are available');

    console.log('# lock and display remain independent in all four combinations');
    for (const lock of [false, true]) for (const display of [false, true]) {
      const combo = await page.evaluate(({ lock, display }) => {
        App.scaleLock.set(lock); App.midi.setDisplayEnabled(display); App.help.set(0);
        const heard = [];
        const capture = d => { if (d.on && d.midi === 61) heard.push(d); };
        App.on('midi:note', capture); __receive([0x90, 61, 90]); __receive([0x80, 61, 0]);
        return { lock: App.scaleLock.on, display: App.midi.displayEnabled, lit: Object.keys(__lit()).map(Number),
          blocked: heard.length && heard[heard.length - 1].blocked === true,
          pressed: document.getElementById('cx-led').getAttribute('aria-pressed'),
          lockPressed: document.getElementById('cx-lock').getAttribute('aria-pressed') };
      }, { lock, display });
      ok(combo.lock === lock && combo.display === display && combo.blocked === lock &&
        combo.pressed === String(display) && combo.lockPressed === String(lock) && combo.lit.length === (display ? 14 : 0),
        `Scale Lock ${lock ? 'ON' : 'OFF'} / LUMI Display ${display ? 'ON' : 'OFF'}: note policy and full-scale lighting remain independent at Help None`);
    }
    const toggled = await page.evaluate(() => {
      const lock = App.scaleLock.on;
      document.getElementById('cx-led').click();
      const off = !App.midi.displayEnabled && Object.keys(__lit()).length === 0;
      document.getElementById('cx-led').click();
      return { lock, afterLock: App.scaleLock.on, off, on: App.midi.displayEnabled, lit: Object.keys(__lit()).length };
    });
    ok(toggled.off && toggled.on && toggled.lit === 14 && toggled.lock === toggled.afterLock,
      'header master releases/repaints display without changing Scale Lock');

    console.log('# selected root/scale changes repaint the selected LUMI');
    const keys = await page.evaluate(() => {
      App.emit('fb:set', { source: 'test', root: 2, scale: 'major', mode: 1 });
      const major = Object.keys(__lit()).map(Number);
      App.emit('fb:set', { source: 'test', root: 2, scale: 'minorPent', mode: 1 });
      return { major, pent: Object.keys(__lit()).map(Number), enabled: App.midi.displayEnabled };
    });
    ok(keys.enabled && keys.major.length === 14 && keys.major.every(n => [1, 2, 4, 6, 7, 9, 11].includes(n % 12)),
      'D major replaces C-major display notes at Help None');
    ok(keys.pent.length === 10 && keys.pent.every(n => [0, 2, 5, 7, 9].includes(n % 12)),
      'changing to D minor pentatonic removes the previous scale keys');
    const style = await page.evaluate(() => {
      App.midi.setDisplay(false); const offStyle = App.midi.displayEnabled;
      App.midi.setDisplay(true); return { offStyle, onStyle: App.midi.displayEnabled };
    });
    ok(style.offStyle && style.onStyle, 'Guide colors style does not act as a second display master');

    console.log('# master OFF releases an active lesson frame while synth sound continues');
    await page.evaluate(() => {
      App.emit('fb:set', { source: 'test', root: 0, scale: 'major', mode: 1 });
      App.scaleLock.set(true); App.switchTo('lumipractice');
      __change('mode', 'hardware'); __change('flow', 'guided'); __change('kind', 'major');
      __change('input', 'synth-in'); __change('output', 'lumi-out'); __change('sound-output', 'synth-out');
      __click('start');
      const ack = document.getElementById('lp-local-control'); ack.checked = true; ack.dispatchEvent(new Event('change'));
      __click('sound-start'); __click('test');
    });
    await page.waitForFunction(() => SLLumiPractice.snapshot().tested);
    await page.evaluate(() => __click('arm'));
    const active = await page.evaluate(() => ({ page: SLLumiPractice.snapshot(), sound: App.practiceRouter.state, lit: Object.keys(__lit()).length }));
    ok(active.page.armed && active.page.leased && active.sound.active && active.lit === 3,
      'instructional frame and independent synth route can be active together');
    const off = await page.evaluate(() => {
      App.midi.setDisplayEnabled(false);
      const from = __sent.length;
      App.midi.guide(60, 62); App.midi.repaint();
      __receive([0x90, 48, 100]); __receive([0x90, 49, 100]);
      return { s: SLLumiPractice.snapshot(), sound: App.practiceRouter.state, state: App.midi.displayState,
        lit: Object.keys(__lit()).length, after: __sent.slice(from),
        disabled: document.getElementById('lp-test').disabled && document.getElementById('lp-arm').disabled };
    });
    ok(!off.s.armed && !off.s.leased && off.s.running && off.disabled && off.lit === 0 && !off.state.enabled,
      'OFF disarms only the display, clears its held frame, and disables display test/arm');
    ok(off.sound.active && off.sound.forwarded === 1 && off.sound.blocked === 1 && off.s.feedback === 'wrong' &&
      off.after.some(m => m.portId === 'synth-out' && m.bytes[0] === 0x90 && m.bytes[1] === 48) &&
      off.after.every(m => m.portId !== 'lumi-out' || (m.bytes[0] & 0xf0) !== 0x90 || !m.bytes[2]),
      'OFF leaves raw answer grading and independent allowed-note synth sound active without relighting LUMI');
    await page.waitForTimeout(850);
    ok(await page.evaluate(() => Object.keys(__lit()).length === 0 && !SLLumiPractice.snapshot().armed),
      'guide blink timers cannot relight an OFF display');
    const frameOff = await page.evaluate(() => {
      const lease = App.midi.leaseKeybedOutput('lumi-out', 'test-off');
      const from = __sent.length;
      const frame = lease && lease.frame({ target: [48], channel: 0 });
      if (lease) lease();
      return { frame, after: __sent.slice(from) };
    });
    ok(frameOff.frame === false && frameOff.after.every(m => m.portId !== 'lumi-out' || (m.bytes[0] & 0xf0) !== 0x90 || !m.bytes[2]),
      'semantic frames reject OFF rather than bypassing the master');
    const reconnect = await page.evaluate(() => {
      __access.onstatechange();
      return { enabled: App.midi.displayEnabled, page: SLLumiPractice.snapshot(), lit: Object.keys(__lit()).length };
    });
    ok(!reconnect.enabled && !reconnect.page.armed && reconnect.lit === 0,
      'inventory refresh cannot re-arm or relight an OFF display');

    console.log('# display and lock preferences persist independently');
    await page.reload();
    await page.waitForFunction(() => window.App && App.midi && App.midi.ready);
    const savedOff = await page.evaluate(() => ({ display: App.midi.displayEnabled, lock: App.scaleLock.on,
      state: App.midi.displayState, lit: Object.keys(__lit()).length }));
    ok(!savedOff.display && savedOff.lock && savedOff.state.outputId === 'lumi-out' && savedOff.lit === 0,
      'reload remembers display OFF, selected LUMI, and independently enabled Scale Lock');
    await page.evaluate(() => { App.scaleLock.set(false); App.midi.setDisplayEnabled(true); });
    await page.reload();
    await page.waitForFunction(() => window.App && App.midi && App.midi.ready);
    const savedOn = await page.evaluate(() => ({ display: App.midi.displayEnabled, lock: App.scaleLock.on,
      lit: Object.keys(__lit()).length, selected: App.midi.displayState.outputId }));
    ok(savedOn.display && !savedOn.lock && savedOn.selected === 'lumi-out' && savedOn.lit === 14,
      'reload remembers display ON and independently disabled Scale Lock');
    ok(errors.length === 0, 'display master full app has no browser exceptions: ' + errors.join('; '));
    await context.close();
  } finally { await browser.close(); }
  console.log('ALL PASS (' + checks + ' checks; simulated ports only)');
})().catch(error => { console.error('FAIL', error.stack); process.exitCode = 1; });
