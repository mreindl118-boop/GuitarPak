// Actual Hub + shared MIDI service with EventTarget fake ports. No hardware.
const { chromium } = require('playwright');
const env = require('./env');
let checks = 0;
function ok(value, message) { if (!value) throw new Error(message); checks++; console.log('  PASS', message); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
(async function () {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
      localStorage.setItem('guitarlab.lights.on', 'false');
      window.__sent = [];
      class Port extends EventTarget {
        constructor(id, name) { super(); this.id = id; this.name = name; this.state = 'connected'; this.onmidimessage = null; }
        send(bytes) { __sent.push({ id: this.id, bytes: Array.from(bytes), generation: this.generation || 0 }); }
        receive(bytes) {
          const e = new Event('midimessage'); Object.defineProperty(e, 'data', { value: new Uint8Array(bytes) });
          if (this.onmidimessage) this.onmidimessage(e); this.dispatchEvent(e);
        }
      }
      const a = new Port('A', 'Yamaha MODX'), b = new Port('B', 'Yamaha MODX');
      const out = new Port('sound', 'Yamaha MODX'), lumi = new Port('lights', 'LUMI Keys BLOCK');
      const access = { inputs: new Map([['A', a], ['B', b]]), outputs: new Map([['sound', out], ['lights', lumi]]), sysexEnabled: true };
      navigator.requestMIDIAccess = () => Promise.resolve(access);
      window.__receive = (bytes, id = 'A') => access.inputs.get(id).receive(bytes);
      window.__sound = () => __sent.filter(s => s.id === 'sound').map(s => s.bytes);
      window.__clearSound = () => { __sent.length = 0; };
      window.__replaceSound = () => { const replacement = new Port('sound', 'Yamaha MODX'); replacement.generation = 1; access.outputs.set('sound', replacement); };
      window.__disconnectSound = () => { access.outputs.get('sound').state = 'disconnected'; access.outputs.set('other-synth', new Port('other-synth', 'Korg synth')); access.onstatechange(); };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(env.URL);
    await page.waitForFunction(() => window.App && App.midi.ready && typeof App.midi.flushMusicalOutputs === 'function');
    await page.evaluate(() => {
      App.switchTo('midihub'); App.store.set('midihub.outId', 'sound');
      App.store.set('fb.root', 0); App.store.set('fb.scale', 'major'); App.scaleLock.set(true);
      const thru = document.getElementById('mh-thru'); thru.checked = true; thru.dispatchEvent(new Event('change'));
      window.rule = (add, channel = 0) => ({ id: 'test', on: true, m: { type: 'note', ch: 0, lo: 0, hi: 127 },
        a: { block: false, ch: channel, num: '', add, scale: 100, to: 'same' } });
      window.tapHub = n => { document.querySelector('#mh-kb [data-note="' + n + '"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); window.dispatchEvent(new PointerEvent('pointerup')); };
      window.rawHub = text => { document.getElementById('mh-raw').value = text; document.getElementById('mh-rawsend').click(); };
    });
    console.log('# global scope and post-rule membership');
    const chromatic = await page.evaluate(() => {
      __clearSound();
      for (let c = 0; c < 16; c++) for (let n = 60; n < 72; n++) { __receive([0x90 | c, n, 87]); __receive([0x80 | c, n, 23]); }
      return __sound();
    });
    const ons = chromatic.filter(b => (b[0] & 0xf0) === 0x90 && b[2] > 0), offs = chromatic.filter(b => (b[0] & 0xf0) === 0x80);
    ok(ons.length === 112 && offs.length === 112, 'Hub forwards seven scale notes and paired releases on all 16 channels');
    ok(ons.every(b => [0, 2, 4, 5, 7, 9, 11].includes(b[1] % 12) && b[2] === 87), 'disallowed pitches never reach selected synth; allowed pitch/velocity unchanged');
    ok(offs.every(b => b[2] === 23), 'forwarded physical Note Off release velocities survive post-rule pairing');
    const outsidePage = await page.evaluate(() => {
      App.switchTo('quiz'); __clearSound(); __receive([0x90, 61, 87]); __receive([0x80, 61, 0]);
      const sent = __sound(); App.switchTo('midihub'); return { sent, on: App.scaleLock.on, active: App.scaleLock.active };
    });
    ok(outsidePage.on && outsidePage.active && outsidePage.sent.length === 0, 'global scale lock has no Exercises-page forwarding exception');
    const virtual = await page.evaluate(() => { __clearSound(); tapHub(61); tapHub(62); return __sound(); });
    ok(virtual.length === 2 && same(virtual[0], [0x90, 62, 100]) && same(virtual[1], [0x80, 62, 0]), 'Hub virtual keyboard blocks C-sharp and keeps D on/off pair');
    const rules = await page.evaluate(() => {
      App.store.set('midihub.rules', [rule(1)]); __clearSound();
      __receive([0x90, 60, 80]); __receive([0x80, 60, 0]); // C -> C-sharp blocked
      __receive([0x90, 61, 80]); __receive([0x80, 61, 0]); // C-sharp -> D allowed
      return __sound();
    });
    ok(same(rules, [[0x90, 62, 80], [0x80, 62, 0]]), 'membership is checked on actual post-rule output, including an allowed transformed input');

    console.log('# source identity, collisions and edited rules');
    const collision = await page.evaluate(() => {
      App.store.set('midihub.rules', [rule(0, 3)]); __clearSound();
      __receive([0x90, 60, 80], 'A'); __receive([0x91, 60, 95], 'B');
      const on = __sound().slice(); __receive([0x80, 60, 0], 'A');
      const firstRelease = __sound().slice(); __receive([0x81, 60, 0], 'B');
      return { on, firstRelease, all: __sound() };
    });
    ok(same(collision.on, [[0x92, 60, 80]]) && collision.firstRelease.length === 1, 'same-name inputs collapsed onto one target cannot release each other early');
    ok(same(collision.all, [[0x92, 60, 80], [0x82, 60, 0]]), 'last physical source releases the shared forced-channel target exactly once');
    const edited = await page.evaluate(() => {
      App.store.set('midihub.rules', [rule(12)]); __clearSound(); __receive([0x94, 60, 80]);
      App.store.set('midihub.rules', [rule(7, 2)]); __receive([0x84, 60, 31]);
      return __sound();
    });
    ok(same(edited, [[0x94, 72, 80], [0x84, 72, 31]]), 'release uses actual original transformed pitch/channel after rules have changed');
    const velocityZero = await page.evaluate(() => {
      App.store.set('midihub.rules', [rule(0)]); __clearSound();
      __receive([0x95, 64, 80]); __receive([0x96, 64, 90]); __receive([0x95, 64, 0]);
      const one = __sound().slice(); __receive([0x86, 64, 0]); return { one, all: __sound() };
    });
    ok(velocityZero.one.length === 3 && velocityZero.one[2][0] === 0x85 && velocityZero.all[3][0] === 0x86, 'velocity-zero release preserves separate MPE channel pairing');
    const conversion = await page.evaluate(() => {
      const ccRule = rule(0); ccRule.m.type = 'cc'; ccRule.a.to = 'note'; ccRule.a.num = 60;
      App.store.set('midihub.rules', [ccRule]); __clearSound(); __receive([0xb2, 20, 80]);
      ccRule.a.num = 64; App.store.set('midihub.rules', [ccRule]); __receive([0xb2, 20, 0]);
      const controllerToNote = __sound().slice();
      const noteRule = rule(0); noteRule.a.to = 'cc'; noteRule.a.num = 64;
      App.store.set('midihub.rules', [noteRule]); __clearSound(); __receive([0x93, 60, 127]); __receive([0x83, 60, 31]);
      const noteToController = __sound().slice();
      App.store.set('midihub.rules', []);
      return { controllerToNote, noteToController };
    });
    ok(same(conversion.controllerToNote, [[0x92, 60, 80], [0x82, 60, 0]]), 'CC-to-note mapping releases actual original target after converted target changes');
    ok(same(conversion.noteToController, [[0xb3, 64, 127], [0xb3, 64, 0]]), 'note-to-sustain conversion retains its paired zero release rather than physical release velocity');

    console.log('# sustain and boundary cleanup');
    const cleanup = await page.evaluate(() => {
      __clearSound(); __receive([0x97, 60, 80]); __receive([0xb7, 64, 127]); __receive([0x87, 60, 0]);
      App.store.set('fb.root', 1); App.emit('fb:scale', { root: 1, scale: 'major' });
      return __sound();
    });
    ok(cleanup.some(b => same(b, [0xb7, 64, 0])), 'root change releases sustain on original used channel after physical key release');
    const stop = await page.evaluate(() => {
      App.store.set('fb.root', 0); App.emit('fb:scale', { root: 0, scale: 'major' });
      __clearSound(); __receive([0x98, 60, 80]); __receive([0xb8, 64, 127]); document.getElementById('mh-stop').click(); return __sound();
    });
    ok(stop.some(b => same(b, [0x88, 60, 0])) && stop.some(b => same(b, [0xb8, 64, 0])) && stop.some(b => b[0] === 0xfc), 'Hub Stop releases notes/sustain then retains realtime Stop protocol command');

    console.log('# raw note streams and protocol exemptions');
    const raw = await page.evaluate(() => {
      App.store.set('midihub.rules', []); __clearSound();
      rawHub('90 3D 64'); rawHub('80 3D 00'); rawHub('90 3C 50'); rawHub('80 3C 00');
      const simple = __sound().slice(); __clearSound();
      rawHub('F8 90 3D 64'); rawHub('90 3C 50 90 3D 50'); rawHub('90 3C 50 3F 50');
      const packed = __sound().slice(); App.midi.flushMusicalOutputs('raw fixture done'); __clearSound();
      rawHub('F0 43 10 7F 1C 07 30 00 05 7F F7'); rawHub('B0 4A 40'); rawHub('C0 04'); rawHub('F8');
      return { simple, packed, protocol: __sound() };
    });
    ok(!raw.simple.some(b => (b[0] & 0xf0) === 0x90 && b[1] === 61 && b[2] > 0) && raw.simple.some(b => same(b, [0x90, 60, 80])), 'raw editor Note Ons obey global lock while allowed raw notes remain useful');
    // Decode output streams independently of the implementation, including
    // running status, so a disallowed note cannot hide after a clock/status.
    function pitches(streams) {
      const notes = [];
      for (const bytes of streams) {
        let i = 0, status = 0;
        while (i < bytes.length) {
          const b = bytes[i];
          if (b >= 0xf8) { i++; continue; }
          if (b >= 0x80) { status = b; i++; }
          if (!status || status >= 0xf0) break;
          const len = [0xc0, 0xd0].includes(status & 0xf0) ? 1 : 2;
          if (i + len > bytes.length) break;
          if ((status & 0xf0) === 0x90 && bytes[i + 1] > 0) notes.push(bytes[i]);
          i += len;
        }
      }
      return notes;
    }
    ok(pitches(raw.packed).every(n => ![61, 63].includes(n)), 'packed/running-status raw streams cannot smuggle disallowed note-ons after a prefix');
    ok(raw.protocol.some(b => b[0] === 0xf0) && raw.protocol.some(b => b[0] === 0xb0 && b[1] === 74) && raw.protocol.some(b => b[0] === 0xc0) && raw.protocol.some(b => b[0] === 0xf8), 'SysEx configuration, ordinary controls, programs and clock remain explicit protocol exemptions: ' + JSON.stringify(raw.protocol));
    const pinned = await page.evaluate(() => {
      const converted = rule(0); converted.a.to = 'cc'; converted.a.num = 1;
      App.store.set('midihub.rules', [converted]); __clearSound(); __receive([0x90, 60, 99]);
      __replaceSound(); __receive([0x80, 60, 0]);
      const replacement = __sent.filter(s => s.generation === 1).slice();
      __receive([0x90, 62, 88]); __clearSound(); __disconnectSound();
      return { replacement, fallback: __sent.filter(s => s.id === 'other-synth').slice() };
    });
    ok(pinned.replacement.length === 0, 'paired Note-to-CC zero release cannot target a same-ID same-name replacement');
    ok(pinned.fallback.length === 0, 'disconnect cleanup cannot send old paired controller releases to an auto-fallback synth');
    ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
    console.log('ALL PASS (' + checks + ' checks; cloud simulation only)');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
