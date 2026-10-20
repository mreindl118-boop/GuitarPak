// Sound input (js/audioin.js = App.audioIn) against Chromium's fake audio
// device (a periodic beep, permission auto-granted): device list + labels,
// the chosen input persisting, Hear input routed to the master ONLY when on
// and ONLY through the input gain (a spy on AudioNode.connect/disconnect
// walks the graph from every MediaStreamSource), the input gain, the level
// tap, plug / unplug (the chosen input is kept and used again), a busy
// device, a graph that fails to build, the app hidden, the microphone
// feedback guard on every automatic path (launch restore, a missing chosen
// input, a new OS default), the launch permission check, a locked audio
// context, tone-in following the input, the Settings card (Input select,
// Hear input seg + aria-pressed, gain, meter, Test input, MODX hint +
// auto-pick, no capture just for opening Settings, the first On before
// names are readable, "no input found" vs "declined", the output device
// re-applied) and a browser without getUserMedia failing soft.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

// opts: noMedia (no navigator.mediaDevices), perm ('granted' | 'prompt' |
// 'denied' = what permissions.query says for the microphone), boot (code run
// in the init script — e.g. a __devMap / __gumFail before the app starts)
async function newPage(browser, seed, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(([seed, noMedia, perm, boot]) => {
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
    // graph spy: every edge between AudioNodes, kept current on disconnect
    const conn = AudioNode.prototype.connect, disc = AudioNode.prototype.disconnect;
    let edges = [];
    AudioNode.prototype.connect = function (dst) {
      if (dst instanceof AudioNode) edges.push([this, dst]);
      return conn.apply(this, arguments);
    };
    AudioNode.prototype.disconnect = function (dst) {
      if (dst instanceof AudioNode) edges = edges.filter(e => !(e[0] === this && e[1] === dst));
      else if (!(dst instanceof AudioParam)) edges = edges.filter(e => e[0] !== this);
      return disc.apply(this, arguments);
    };
    // every node a live input (MediaStreamSource) reaches
    const reach = () => {
      const starts = edges.map(e => e[0]).filter(n => n instanceof MediaStreamAudioSourceNode);
      const seen = new Set(starts), q = starts.slice();
      while (q.length) {
        const n = q.shift();
        for (const e of edges) if (e[0] === n && !seen.has(e[1])) { seen.add(e[1]); q.push(e[1]); }
      }
      return seen;
    };
    // does any live input reach the master / speakers?
    window.__reachesMaster = () => reach().has(App.getAudio().destination);
    // the input-graph nodes wired straight into the master
    window.__intoMaster = () => {
      const dest = App.getAudio().destination, r = reach();
      return edges.filter(e => e[1] === dest && r.has(e[0])).map(e => e[0]);
    };
    // output devices: setSinkId calls recorded (the fake device has no outputs)
    window.__sink = [];
    AudioContext.prototype.setSinkId = function (id) {
      window.__sink.push(id);
      Object.defineProperty(this, 'sinkId', { value: id, configurable: true });
      return Promise.resolve();
    };
    if (perm && navigator.permissions) {
      const q = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = d => d && d.name === 'microphone' ? Promise.resolve({ state: perm }) : q(d);
    }
    window.__wait = ms => new Promise(r => setTimeout(r, ms));
    window.__hide = h => {
      if (h) Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      else delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    };
    if (noMedia) {
      Object.defineProperty(Navigator.prototype, 'mediaDevices', { get: () => undefined, configurable: true });
      return;
    }
    // getUserMedia log + failure stub (__gumFail {id: exact id | '*', name})
    // + an enumerateDevices rewrite hook (fake labels / devices)
    const md = navigator.mediaDevices;
    const gum = md.getUserMedia.bind(md), en = md.enumerateDevices.bind(md);
    window.__gum = [];
    window.__streams = [];
    window.__gumFail = null;
    md.getUserMedia = c => {
      window.__gum.push(JSON.parse(JSON.stringify(c)));
      const f = window.__gumFail, ex = c && c.audio && c.audio.deviceId && c.audio.deviceId.exact;
      if (f && (f.id === '*' || (f.id && ex === f.id))) return Promise.reject(new DOMException('stub', f.name));
      if (ex && window.__alias && window.__alias[ex]) { c = JSON.parse(JSON.stringify(c)); delete c.audio.deviceId; }
      return gum(c).then(s => { window.__granted = true; window.__streams.push({ c, s }); return s; });
    };
    window.__devMap = null;
    // a browser that hides device names until an input was granted (this
    // Chromium shows them right away): blank every label before a grant
    window.__hideNames = l => window.__granted ? l : l.map(d => Object.assign({}, d, { label: '' }));
    md.enumerateDevices = () => en().then(l => {
      const plain = l.map(d => ({ deviceId: d.deviceId, kind: d.kind, label: d.label, groupId: d.groupId }));
      return window.__devMap ? window.__devMap(plain) : plain;
    });
    window.__plug = () => md.dispatchEvent(new Event('devicechange'));
    window.__peak = async (ms) => {
      let pk = 0;
      const end = Date.now() + ms;
      while (Date.now() < end) { pk = Math.max(pk, App.audioIn.level().peak); await new Promise(r => setTimeout(r, 30)); }
      return pk;
    };
    if (boot) (new Function(boot))();
  }, [seed || {}, !!opts.noMedia, opts.perm || '', opts.boot || '']);
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.audioIn && App.active === 'quiz');
  return { ctx, page, errs };
}
const until = async (page, fn, arg, ms) => {
  try { await page.waitForFunction(fn, arg, { timeout: ms || 4000 }); return true; } catch (e) { return false; }
};
const noErrs = (errs, what) => ok(errs.length === 0, 'no page errors (' + what + ')' + (errs.length ? ': ' + errs.join(' | ') : ''));

(async () => {
  const browser = await chromium.launch({
    executablePath: env.CHROMIUM,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']
  });

  console.log('# the service, API first');
  let { ctx, page, errs } = await newPage(browser, { 'audio.tonein': true });
  await page.waitForTimeout(900); // tone-in auto-starts at 400 ms
  const boot = await page.evaluate(() => ({
    on: App.audioIn.state.on, stream: !!App.audioIn._t().stream, mon: App.audioIn.monitor,
    reaches: __reachesMaster(), tonein: App.tonein.running, gain: App.audioIn.gain
  }));
  ok(!boot.on && !boot.stream && boot.mon === false, 'nothing opened at boot with Hear input off (the default): ' + JSON.stringify(boot));
  ok(boot.tonein && !boot.reaches, 'tone-in listens, but no input reaches the master');
  ok(boot.gain === 100, 'input gain defaults to 100 %');

  const devs = await page.evaluate(() => App.audioIn.devices(true));
  ok(devs.length >= 2 && devs.every(d => d.kind === 'audioinput' && d.label), 'devices(true) lists the audio inputs with names after permission: ' + devs.map(d => d.label).join(' | '));
  const real = devs.filter(d => d.deviceId !== 'default' && d.deviceId !== 'communications');
  const dev1 = real[0].deviceId, dev2 = (real[1] || real[0]).deviceId;

  const mics = await page.evaluate(() => ['Mikrofon (Realtek(R) Audio)', 'Micrófono (Realtek(R) Audio)', 'Stereo Mix (Realtek(R) Audio)', 'Headset Microphone (USB)',
    'Microphone (USB Audio CODEC)', 'Mic/Inst (iRig HD 2)', 'Line (MODX)', 'Line In (Realtek(R) Audio)'].map(l => App.audioIn.isMic(l)));
  ok(mics.join() === 'true,true,true,true,false,false,false,false',
    'feedback check: German / Spanish mics, Stereo Mix and headsets count; USB instrument interfaces and line inputs do not: ' + mics.join());

  const pick = await page.evaluate(async (id) => {
    let seen = null;
    App.on('audioin:device', d => { seen = d.id; });
    __gum.length = 0;
    await App.audioIn.setDevice(id);
    await __wait(700);
    return { stored: App.store.get('audio.inId', ''), seen, tonein: App.tonein.running, gum: __gum.slice() };
  }, dev1);
  ok(pick.stored === dev1 && pick.seen === dev1, 'setDevice persists audio.inId and announces audioin:device');
  ok(pick.tonein && pick.gum.some(c => c.audio && c.audio.deviceId && c.audio.deviceId.exact === dev1),
    'tone-in re-opens on the new pick, asking for exactly that device: ' + JSON.stringify(pick.gum));

  console.log('# tone-in follows the input');
  const tone = await page.evaluate(async (id) => {
    __gum.length = 0;
    await App.audioIn.setDevice('gone-device-id');
    await __wait(500);
    const missing = { running: App.tonein.running, gum: __gum.map(c => c.audio.deviceId) };
    await App.audioIn.setDevice(id);
    await __wait(600);
    const back = App.tonein.running;
    // the input drops (track ended), then a devicechange
    const tr = App.tonein._t().stream.getAudioTracks()[0];
    tr.dispatchEvent(new Event('ended'));
    await __wait(100);
    const ended = App.tonein.running;
    __plug();
    await __wait(700);
    return { missing, back, ended, again: App.tonein.running };
  }, dev1);
  ok(!tone.missing.running && tone.missing.gum.every(d => d && d.exact === 'gone-device-id'),
    'a missing chosen input: tone-in waits, never falls back to the default mic: ' + JSON.stringify(tone.missing.gum));
  ok(tone.back, 'picking a present input starts it again');
  ok(!tone.ended && tone.again, 'the input drops (track ended): tone-in stops, and a devicechange starts it again');

  const held = await page.evaluate(async () => {
    const s = await App.audioIn.hold('t');
    const tr = App.audioIn._t().stream.getAudioTracks()[0].getSettings();
    return { s, reaches: __reachesMaster(), monOn: App.audioIn._t().monOn, raw: tr.echoCancellation === false && tr.autoGainControl === false && tr.noiseSuppression === false, dev: tr.deviceId, gum: __gum[__gum.length - 1] };
  });
  ok(held.s.on && !held.s.monitor && !held.reaches && !held.monOn, 'a meter hold opens the input; Hear input off = nothing connected to the master');
  ok(held.raw && held.dev === dev1, 'opened raw (no echo cancel / AGC / noise suppression) on the chosen device');
  ok(held.gum.audio.deviceId.exact === dev1 && held.gum.audio.channelCount.ideal === 2, 'asks for the exact device, stereo: ' + JSON.stringify(held.gum));
  const pk = await page.evaluate(() => __peak(4000));
  ok(pk > 0.01, 'level() rises with the fake beep: peak ' + pk.toFixed(3));

  const mon = await page.evaluate(async () => {
    const s = await App.audioIn.setMonitor(true);
    const into = __intoMaster();
    return { s, stored: App.store.get('audio.monitor', null), reaches: __reachesMaster(), onlyGain: into.length === 1 && into[0] === App.audioIn._t().gain };
  });
  ok(mon.stored === true && mon.s.monitor && mon.reaches, 'Hear input on: stored, and the input reaches the master');
  ok(mon.onlyGain, 'the ONLY input edge into the master is the input gain (nothing bypasses it)');
  ok(!mon.s.warn && !mon.s.mic, 'a fake (non-mic) device gets no feedback warning');

  const gn = await page.evaluate(async () => {
    App.audioIn.setGain(50);
    await __wait(300);
    const half = App.audioIn._t().gain.gain.value;
    App.audioIn.setGain(0);
    await __wait(300);
    const silent = await __peak(1500);
    const over = App.audioIn.setGain(250);
    App.audioIn.setGain(100);
    return { half, silent, over, stored: App.store.get('audio.inGain', null) };
  });
  ok(Math.abs(gn.half - 0.5) < 0.02, 'setGain(50) applies to the input gain: ' + gn.half.toFixed(3));
  ok(gn.silent < 0.001, 'gain 0 silences the tap (the meter reads after the gain): ' + gn.silent);
  ok(gn.over === 200 && gn.stored === 100, 'gain clamps to 200 % and persists');

  console.log('# unplug / re-plug');
  const plug = await page.evaluate(async (id) => {
    await App.audioIn.setDevice(id);
    const before = { on: App.audioIn.state.on, reaches: __reachesMaster() };
    window.__devMap = l => l.filter(d => d.deviceId !== id);
    __plug();
    await __wait(300);
    const sel = document.getElementById('set-audio-in');
    const gone = { s: App.audioIn.state, reaches: __reachesMaster(), stored: App.store.get('audio.inId', ''),
      opt: sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].textContent, msg: document.getElementById('set-audio-msg').textContent };
    window.__devMap = null;
    __plug();
    await __wait(900);
    return { before, gone, back: { s: App.audioIn.state, reaches: __reachesMaster() } };
  }, dev2);
  ok(plug.before.on && plug.before.reaches, 'a new pick re-opens with Hear input still on');
  ok(!plug.gone.s.on && !plug.gone.reaches && /unplugged/.test(plug.gone.s.msg), 'the device unplugged: closed, says so: ' + plug.gone.s.msg);
  ok(plug.gone.stored === dev2 && plug.gone.opt === 'Chosen device (not connected)' && /input is not connected/.test(plug.gone.msg),
    'the choice is KEPT while it is gone (Settings shows it as not connected): ' + plug.gone.msg);
  ok(plug.back.s.on && plug.back.s.monitor && plug.back.reaches && plug.back.s.device === dev2, 'plugged back in: Hear input resumes on THAT device');

  console.log('# a busy input, a graph that fails to build');
  const busy = await page.evaluate(async (id) => {
    await App.audioIn.setDevice('');
    __gumFail = { id, name: 'NotReadableError' };
    __gum.length = 0;
    const s = await App.audioIn.setDevice(id);
    const r = { s, reaches: __reachesMaster(), stream: !!App.audioIn._t().stream, tries: __gum.length };
    __gum.length = 0;
    __plug(); __plug(); __plug();
    await __wait(500);
    r.after = __gum.filter(c => !(c.audio && c.audio.channelCount === 1)).length; // tone-in's own opens aside
    __gumFail = null;
    return r;
  }, dev2);
  ok(/another app/.test(busy.s.error) && !busy.stream && !busy.reaches && busy.s.device !== 'default',
    'a busy chosen input (NotReadableError) says so — no fallback to the default device: ' + busy.s.error);
  ok(busy.tries <= 1 + 1 && busy.after === 0, 'and devicechanges do not re-open it in a loop (' + busy.tries + ' tries, ' + busy.after + ' after 3 devicechanges)');
  const graph = await page.evaluate(async (id) => {
    await App.audioIn.setDevice('');
    await App.audioIn.setDevice(id); // Hear input on + hold 't': open again
    App.audioIn.setMonitor(false);
    App.audioIn.release('t');
    const c = App.getAudio(), orig = c.createMediaStreamSource;
    c.createMediaStreamSource = function () { c.createMediaStreamSource = orig; throw new DOMException('stub', 'NotSupportedError'); };
    const n = __streams.length;
    const s = await App.audioIn.hold('t');
    // audioin's own capture (tone-in asks for channelCount 1)
    const opened = __streams.slice(n).filter(x => x.c.audio && x.c.audio.channelCount && x.c.audio.channelCount.ideal === 2).map(x => x.s);
    const r = { err: s.error, stream: !!App.audioIn._t().stream, ended: opened.map(st => st.getAudioTracks()[0].readyState) };
    App.audioIn.release('t');
    const again = await App.audioIn.hold('t');
    r.again = again.on && !!App.audioIn._t().stream;
    return r;
  }, dev2);
  ok(/could not be connected/.test(graph.err) && !graph.stream && graph.ended.length && graph.ended.every(x => x === 'ended'),
    'the audio graph fails to build: an error, the capture stopped (no live mic left behind): ' + JSON.stringify(graph));
  ok(graph.again, 'the next try works');

  console.log('# app hidden with only a meter holding the input');
  const vis = await page.evaluate(async () => {
    const tr = App.audioIn._t().stream.getAudioTracks()[0];
    __hide(true);
    await __wait(150);
    const hidden = { stream: !!App.audioIn._t().stream, ended: tr.readyState, holds: App.audioIn._t().holds };
    __hide(false);
    await __wait(700);
    return { hidden, back: !!App.audioIn._t().stream };
  });
  ok(!vis.hidden.stream && vis.hidden.ended === 'ended' && vis.hidden.holds.indexOf('t') >= 0, 'nothing heard: the device is released in the background (the hold stays)');
  ok(vis.back, 'back in front: the meter input re-opens');

  const off = await page.evaluate(async () => {
    await App.audioIn.setMonitor(false);
    const a = { s: App.audioIn.state, reaches: __reachesMaster(), stored: App.store.get('audio.monitor', null) };
    const tr = App.audioIn._t().stream.getAudioTracks()[0];
    App.audioIn.release('t');
    return { a, ended: tr.readyState, after: !!App.audioIn._t().stream };
  });
  ok(off.a.stored === false && !off.a.s.monitor && !off.a.reaches && off.a.s.on, 'Hear input off: disconnected from the master, the meter hold keeps the input');
  ok(off.ended === 'ended' && !off.after, 'releasing the last hold stops the tracks');

  console.log('# Settings > Sound input & output');
  const ui = await page.evaluate(async () => {
    App.switchTo('settings');
    await __wait(600);
    const vis = id => { const e = document.getElementById(id); return !!e && e.offsetParent !== null; };
    return {
      title: document.querySelector('#set-audio-card h2').textContent,
      input: vis('set-audio-in'), btn: vis('set-audio-enable'), seg: vis('set-ain-mon'), meter: vis('set-ain-meter'),
      gain: vis('set-ain-gain'), gainVal: document.getElementById('set-ain-gain-val').textContent, test: vis('set-ain-test'),
      opts: document.getElementById('set-audio-in').options.length, tone: vis('set-tonein'),
      hold: App.audioIn._t().holds, segOff: document.querySelector('#set-ain-mon [data-mon="off"]').classList.contains('active'),
      aria: Array.from(document.querySelectorAll('#set-ain-mon button')).map(b => b.getAttribute('aria-pressed')).join()
    };
  });
  ok(ui.title === 'Sound input & output', 'the card is "Sound input & output"');
  ok(ui.input && !ui.btn && ui.opts >= 3, 'names are readable: the Input select shows, List devices is gone (' + ui.opts + ' options)');
  ok(ui.seg && ui.meter && ui.gain && ui.gainVal === '100%' && ui.tone, 'Hear input seg, gain + readout, level meter and the tone-in checkbox are there');
  ok(ui.segOff && ui.aria === 'true,false' && ui.hold.indexOf('settings-meter') >= 0 && !ui.test,
    'seg shows Off (aria-pressed ' + ui.aria + '); an input is in use, so the meter holds it (no Test button)');
  const meterLive = await page.evaluate(async () => {
    let w = 0;
    const end = Date.now() + 4000;
    while (Date.now() < end) { w = Math.max(w, parseFloat(document.querySelector('#set-ain-meter i').style.width) || 0); await __wait(40); }
    return { w, live: document.getElementById('set-ain-meter').classList.contains('live'), s: App.audioIn.state, t: App.audioIn._t().holds, pk: await __peak(1200), hidden: document.hidden };
  });
  ok(meterLive.live && meterLive.w > 0, 'the meter moves with the input: max ' + meterLive.w + '%' + (meterLive.w > 0 ? '' : ' ' + JSON.stringify(meterLive)));

  await page.click('#set-ain-mon [data-mon="on"]');
  const clickOn = await until(page, () => App.audioIn.state.monitor);
  const on1 = await page.evaluate(() => ({ stored: App.store.get('audio.monitor', null), active: document.querySelector('#set-ain-mon [data-mon="on"]').classList.contains('active'),
    aria: document.querySelector('#set-ain-mon [data-mon="on"]').getAttribute('aria-pressed'), reaches: __reachesMaster(), msg: document.getElementById('set-ain-msg').textContent }));
  ok(clickOn && on1.stored === true && on1.active && on1.aria === 'true' && on1.reaches, 'clicking On toggles audio.monitor and routes the input: ' + on1.msg);
  await page.fill('#set-ain-gain', '150');
  await page.waitForTimeout(150);
  const g150 = await page.evaluate(() => ({ stored: App.store.get('audio.inGain', null), txt: document.getElementById('set-ain-gain-val').textContent, g: App.audioIn._t().gain.gain.value }));
  ok(g150.stored === 150 && g150.txt === '150%' && Math.abs(g150.g - 1.5) < 0.02, 'the gain slider stores, shows AND applies 150 %: ' + g150.g.toFixed(3));
  await page.fill('#set-ain-gain', '100');

  console.log('# microphone feedback guard');
  const mic = await page.evaluate(async (id) => {
    window.__devMap = l => l.map(d => d.deviceId === id ? Object.assign({}, d, { label: 'Microphone Array (Realtek(R) Audio)' }) : d);
    __plug();
    await __wait(300);
    const sel = document.getElementById('set-audio-in');
    sel.value = id;
    sel.dispatchEvent(new Event('change'));
    await __wait(900);
    const warn = document.getElementById('set-ain-warn'), onb = document.querySelector('#set-ain-mon [data-mon="on"]');
    return { s: App.audioIn.state, reaches: __reachesMaster(), picked: App.store.get('audio.inPicked', null), warnShown: !warn.hidden,
      msg: document.getElementById('set-ain-msg').textContent, heldBtn: onb.classList.contains('held') && !onb.classList.contains('active') };
  }, dev1);
  ok(mic.picked === true && mic.s.mic && mic.s.held && !mic.reaches && !mic.warnShown, 'picking a microphone while Hear input is on does NOT route it on its own: ' + mic.msg);
  ok(/microphone/i.test(mic.msg) && /press On again/.test(mic.msg) && mic.heldBtn, 'the card says why, and On shows as held (not lit)');
  await page.click('#set-ain-mon [data-mon="on"]');
  await until(page, () => App.audioIn.state.monitor);
  const mic2 = await page.evaluate(() => { const w = document.getElementById('set-ain-warn'); return { reaches: __reachesMaster(), shown: !w.hidden && w.offsetParent !== null, txt: w.textContent }; });
  ok(mic2.reaches && mic2.shown && /microphone/i.test(mic2.txt) && /howl|feed/i.test(mic2.txt), 'On again = the user allows it: routed, with the feedback warning: ' + mic2.txt);
  await page.click('#set-ain-mon [data-mon="off"]');
  const micOff = await page.evaluate(() => ({ stored: App.store.get('audio.monitor', null), reaches: __reachesMaster(), warn: document.getElementById('set-ain-warn').hidden }));
  ok(micOff.stored === false && !micOff.reaches && micOff.warn, 'Off: disconnected, warning gone');
  const leave = await page.evaluate(async () => { App.switchTo('quiz'); await __wait(200); return { holds: App.audioIn._t().holds, stream: !!App.audioIn._t().stream }; });
  ok(leave.holds.length === 0 && !leave.stream, 'leaving Settings releases the meter and the input');
  noErrs(errs, 'API + Settings');
  await ctx.close();

  console.log('# opening Settings alone grabs no device');
  ({ ctx, page, errs } = await newPage(browser, {}));
  const quiet = await page.evaluate(async () => {
    await App.audioIn.devices(true); // names readable, nothing chosen, Hear input + tone-in off
    await __wait(200);
    __gum.length = 0;
    App.switchTo('settings');
    await __wait(600);
    const test = document.getElementById('set-ain-test');
    const r = { gum: __gum.length, holds: App.audioIn._t().holds, stream: !!App.audioIn._t().stream, test: !test.hidden && test.offsetParent !== null };
    test.click();
    await __wait(700);
    r.tested = { holds: App.audioIn._t().holds, stream: !!App.audioIn._t().stream, reaches: __reachesMaster(), testGone: test.hidden };
    App.switchTo('quiz');
    await __wait(200);
    r.left = !!App.audioIn._t().stream;
    return r;
  });
  ok(quiet.gum === 0 && quiet.holds.length === 0 && !quiet.stream && quiet.test, 'no input in use: Settings opens no capture (no getUserMedia), a Test input button instead');
  ok(quiet.tested.stream && quiet.tested.holds.indexOf('settings-meter') >= 0 && !quiet.tested.reaches && quiet.tested.testGone, 'Test input opens it for the meter only');
  ok(!quiet.left, 'and leaving Settings lets it go');
  noErrs(errs, 'quiet Settings');
  await ctx.close();

  console.log('# the first On before device names are readable');
  ({ ctx, page, errs } = await newPage(browser, {}, { boot: 'window.__devMap = window.__hideNames;' }));
  await page.evaluate(() => App.switchTo('settings'));
  await page.waitForTimeout(400);
  const pre0 = await page.evaluate(() => ({ btn: document.getElementById('set-audio-enable').offsetParent !== null }));
  await page.click('#set-ain-mon [data-mon="on"]');
  await until(page, () => document.getElementById('set-audio-in').offsetParent !== null);
  const first = await page.evaluate(async () => {
    await __wait(500);
    return { stored: App.store.get('audio.monitor', null), reaches: __reachesMaster(), input: document.getElementById('set-audio-in').offsetParent !== null,
      msg: document.getElementById('set-ain-msg').textContent };
  });
  ok(pre0.btn && first.stored !== true && !first.reaches && first.input,
    'the first On only asks for permission and lists the inputs — nothing heard yet: ' + first.msg);
  ok(/Pick your instrument as Input/.test(first.msg), 'and says what to do next');
  noErrs(errs, 'first On');
  await ctx.close();

  console.log('# no input at all vs permission declined');
  ({ ctx, page, errs } = await newPage(browser, {}, { boot: "window.__gumFail = { id: '*', name: 'NotFoundError' }; window.__devMap = l => window.__hideNames(l.filter(d => d.kind !== 'audioinput'));" }));
  await page.evaluate(() => App.switchTo('settings'));
  await page.waitForTimeout(300);
  await page.click('#set-audio-enable');
  await page.waitForTimeout(500);
  const nf = await page.evaluate(() => document.getElementById('set-audio-msg').textContent);
  ok(/No audio input found/.test(nf) && !/permission/i.test(nf), 'no input (MODX off / driver missing) is not called a permission problem: ' + nf);
  const den = await page.evaluate(async () => {
    window.__gumFail = { id: '*', name: 'NotAllowedError' };
    const s = await App.audioIn.setMonitor(true);
    await __wait(100);
    return { err: s.error, stored: App.store.get('audio.monitor', null), offLit: document.querySelector('#set-ain-mon [data-mon="off"]').classList.contains('active') };
  });
  ok(/declined/.test(den.err) && den.stored === false && den.offLit, 'a declined prompt switches Hear input back Off (no new prompt at every launch): ' + den.err);
  noErrs(errs, 'no input');
  await ctx.close();

  console.log('# a MODX on USB audio');
  ({ ctx, page, errs } = await newPage(browser, {}));
  await page.evaluate(() => {
    // the MODX is plugged in (a devicechange), then Settings opens
    window.__devMap = l => l.some(d => d.label) ? l.concat([{ deviceId: 'modx-line', kind: 'audioinput', label: 'Line (MODX)', groupId: 'g-modx' }]) : l;
    __plug();
    App.switchTo('settings');
  });
  await page.waitForTimeout(300);
  const pre = await page.evaluate(() => ({ btn: document.getElementById('set-audio-enable').offsetParent !== null, input: document.getElementById('set-audio-in').offsetParent !== null }));
  if (pre.btn) {
    ok(!pre.input, 'no permission yet: List devices shows, the nameless Input select stays hidden');
    await page.click('#set-audio-enable');
  }
  await until(page, () => App.store.get('audio.inId', '') === 'modx-line');
  const mx = await page.evaluate(async () => {
    await __wait(900);
    const hint = document.getElementById('set-audio-hint');
    return { id: App.store.get('audio.inId', ''), monitor: App.store.get('audio.monitor', false), msg: document.getElementById('set-audio-msg').textContent, hint: hint.hidden ? '' : hint.textContent, s: App.audioIn.state, reaches: __reachesMaster() };
  });
  ok(mx.id === 'modx-line' && /Line \(MODX\)/.test(mx.msg), 'nothing picked yet: the MODX input is selected, like the Helix: ' + mx.msg);
  ok(mx.monitor === false && !mx.s.monitor && !mx.reaches, 'Hear input is never switched on by the auto-detect');
  ok(/MODX audio is your Input/.test(mx.hint), 'the hint says to turn on Hear input: ' + mx.hint);
  ok(mx.s.on && /not connected/.test(mx.s.msg), 'an exact device that will not open: the meter falls back to the default, with a message: ' + mx.s.msg);
  const mxOn = await page.evaluate(async () => {
    __gum.length = 0;
    __plug(); __plug();
    await __wait(400);
    const loops = __gum.length;
    await App.audioIn.setMonitor(true);
    const r = { loops, s: App.audioIn.state, reaches: __reachesMaster(), onHeld: document.querySelector('#set-ain-mon [data-mon="on"]').classList.contains('held') };
    await App.audioIn.setMonitor(true); // On again: hear the default instead
    r.again = { s: App.audioIn.state, reaches: __reachesMaster() };
    await App.audioIn.setMonitor(false);
    return r;
  });
  ok(mxOn.loops === 0, 'a listed-but-unopenable chosen input is not re-opened on every devicechange (' + mxOn.loops + ' getUserMedia)');
  ok(mxOn.s.held && mxOn.s.why === 'fell' && !mxOn.reaches && mxOn.onHeld && /not connected/.test(mxOn.s.msg) && /press On again/i.test(mxOn.s.msg),
    'Hear input on while the MODX is missing: the default is NOT heard, the card says so: ' + mxOn.s.msg);
  ok(mxOn.again.reaches && mxOn.again.s.monitor && /system default/.test(mxOn.again.s.msg), 'On again = hear the system default instead: ' + mxOn.again.s.msg);
  const other = await page.evaluate(async () => {
    const sel = document.getElementById('set-audio-in');
    sel.value = Array.from(sel.options).map(o => o.value).filter(v => v && v !== 'default' && v !== 'communications' && v !== 'modx-line')[0];
    sel.dispatchEvent(new Event('change'));
    await __wait(300);
    __plug();
    await __wait(300);
    const hint = document.getElementById('set-audio-hint');
    return { id: App.store.get('audio.inId', ''), hint: hint.hidden ? '' : hint.textContent };
  });
  ok(other.id !== 'modx-line' && other.hint === 'MODX audio found — pick it as Input and turn on Hear input to play it through soundLAB.',
    'the user picked another input: never auto-switched back, the hint says how: ' + other.hint);
  noErrs(errs, 'MODX');
  await ctx.close();

  console.log('# the chosen output device');
  ({ ctx, page, errs } = await newPage(browser, { 'audio.outId': 'out-x' }, { boot: "window.__outThere = true; window.__devMap = l => window.__outThere && l.some(d => d.label) ? l.concat([{ deviceId: 'out-x', kind: 'audiooutput', label: 'Speakers (MODX)', groupId: 'g-x' }]) : l;" }));
  await page.evaluate(async () => {
    await App.audioIn.devices(true);
    __plug();
    await __wait(400);
  });
  await page.mouse.click(3, 450); // a gesture on empty page margin
  await page.waitForTimeout(300);
  const sink2 = await page.evaluate(async () => {
    const first = __sink.slice();
    window.__outThere = false;
    __plug();
    await __wait(400);
    const sel = document.getElementById('set-audio-out');
    const gone = { opt: sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].textContent, msg: document.getElementById('set-audio-msg').textContent };
    window.__outThere = true;
    __plug();
    await __wait(400);
    return { first, gone, back: __sink.slice() };
  });
  // (Playwright's evaluate counts as a user gesture, so the wait-for-a-gesture
  // path before the first AudioContext is not observable here)
  ok(sink2.first.join() === 'out-x', 'the stored output is applied to the audio context once the device is listed: ' + JSON.stringify(sink2.first));
  ok(sink2.gone.opt === 'Chosen device (not connected)' && /output is not connected/.test(sink2.gone.msg), 'unplugged: kept, and the card says sound uses the default meanwhile');
  ok(sink2.back.length === 2 && sink2.back[1] === 'out-x', 'plugged back in: the output is applied again (the promise in the message is kept)');
  noErrs(errs, 'output');
  await ctx.close();

  console.log('# Hear input left on: restored at launch');
  ({ ctx, page, errs } = await newPage(browser, { 'audio.monitor': true, 'audio.inGain': 80 }, { perm: 'granted' }));
  const restored = await until(page, () => App.audioIn.state.monitor, null, 5000);
  const rs = await page.evaluate(() => ({ reaches: __reachesMaster(), g: App.audioIn._t().gain && App.audioIn._t().gain.gain.value }));
  ok(restored && rs.reaches && Math.abs(rs.g - 0.8) < 0.01, 'audio.monitor on + permission granted: re-opened and routed at the stored 80 % gain');
  const hid = await page.evaluate(async () => {
    __hide(true);
    await __wait(200);
    const r = { on: App.audioIn.state.on, reaches: __reachesMaster() };
    __hide(false);
    return r;
  });
  ok(hid.on && hid.reaches, 'app hidden: Hear input keeps sounding (a passthrough, like a mixer)');
  const lock = await page.evaluate(async () => {
    const c = App.getAudio();
    c.resume = () => Promise.resolve(); // the browser refuses until a gesture
    await c.suspend();
    await App.audioIn.setMonitor(false);
    await App.audioIn.setMonitor(true);
    const r = { paused: App.audioIn.state.paused, hint: !!document.getElementById('snd-hint') };
    delete c.resume;
    await c.resume();
    await __wait(200);
    r.after = { paused: App.audioIn.state.paused, hint: !!document.getElementById('snd-hint') };
    return r;
  });
  ok(lock.paused && lock.hint, 'a locked audio context: Hear input says to tap first (no silent "Hearing…")');
  ok(!lock.after.paused && !lock.after.hint, 'sound unlocked: the note goes away');
  const newDefault = await page.evaluate(async () => {
    // the OS default becomes a headset: the default entry's name changes
    window.__devMap = l => l.map(d => d.deviceId === 'default' ? Object.assign({}, d, { label: 'Default - Headset Microphone (USB)' }) : d);
    __plug();
    await __wait(400);
    return { s: App.audioIn.state, reaches: __reachesMaster(), stream: !!App.audioIn._t().stream };
  });
  ok(newDefault.s.mic && newDefault.s.held && !newDefault.reaches && !newDefault.stream,
    'the system default turns into a headset mic: re-checked, held, and the device let go: ' + newDefault.s.msg);
  noErrs(errs, 'restore');
  await ctx.close();

  console.log('# launch restore never routes a microphone or a stand-in');
  ({ ctx, page, errs } = await newPage(browser, { 'audio.monitor': true }, { perm: 'granted', boot: "window.__devMap = l => l.map(d => d.label ? Object.assign({}, d, { label: 'Microphone Array (Realtek(R) Audio)' }) : d);" }));
  await until(page, () => App.audioIn.state.held, null, 5000);
  const lm = await page.evaluate(async () => { await __wait(300); return { s: App.audioIn.state, reaches: __reachesMaster(), stream: !!App.audioIn._t().stream }; });
  ok(lm.s.held && lm.s.why === 'mic' && !lm.reaches && !lm.stream, 'the default input is a mic: held, not routed, and not left open: ' + lm.s.msg);
  noErrs(errs, 'restore mic');
  await ctx.close();

  // a CHOSEN mic-like input left on (the user allowed it last time). Fake
  // device ids change on every load, so 'mic-dev' is served by the default
  // device (an __alias in the getUserMedia stub)
  ({ ctx, page, errs } = await newPage(browser, { 'audio.monitor': true, 'audio.inId': 'mic-dev' }, { perm: 'granted', boot:
    "window.__alias = { 'mic-dev': true }; window.__devMap = l => l.map(d => d.label ? Object.assign({}, d, { label: 'Microphone (Realtek(R) Audio)' }) : d).concat([{ deviceId: 'mic-dev', kind: 'audioinput', label: 'Microphone (Realtek(R) Audio)', groupId: 'g-m' }]);" }));
  await until(page, () => App.audioIn.state.held, null, 5000);
  const lc = await page.evaluate(async () => { await __wait(300); return { s: App.audioIn.state, reaches: __reachesMaster(), stream: !!App.audioIn._t().stream }; });
  ok(lc.s.held && lc.s.why === 'mic' && !lc.reaches && !lc.stream, 'a chosen mic left on: the next launch holds it too (On must be pressed again): ' + lc.s.msg);
  noErrs(errs, 'restore chosen mic');
  await ctx.close();

  ({ ctx, page, errs } = await newPage(browser, { 'audio.monitor': true, 'audio.inId': 'gone-device-id', 'audio.inLabel': 'Line (MODX)' },
    { perm: 'granted', boot: "window.__devMap = l => l.map(d => d.label ? Object.assign({}, d, { label: 'Mikrofon (Realtek(R) Audio)' }) : d);" }));
  await until(page, () => App.audioIn.state.held, null, 5000);
  const lf = await page.evaluate(async () => {
    await __wait(300);
    const r = { s: App.audioIn.state, reaches: __reachesMaster(), stream: !!App.audioIn._t().stream, gum: __gum.map(c => c.audio && c.audio.deviceId && c.audio.deviceId.exact) };
    __plug(); // an unrelated devicechange: the chosen input is still missing
    __hide(true); __hide(false); // and a return to the app
    await __wait(500);
    r.still = { reaches: __reachesMaster(), stream: !!App.audioIn._t().stream };
    await App.audioIn.setMonitor(true); // On again
    r.allowed = { s: App.audioIn.state, reaches: __reachesMaster() };
    return r;
  });
  ok(lf.s.held && lf.s.why === 'fell' && !lf.reaches && !lf.stream && lf.gum.every(x => x === 'gone-device-id'),
    'the chosen MODX is off at launch: Hear input waits — no stand-in device opened, not even a German "Mikrofon": ' + lf.s.msg);
  ok(/“Line \(MODX\)” is not connected/.test(lf.s.msg) && /press On again/i.test(lf.s.msg), 'the card names the missing input and the way out');
  ok(!lf.still.reaches && !lf.still.stream, 'a devicechange or returning to the app does not open the default in its place');
  ok(lf.allowed.reaches && lf.allowed.s.monitor && lf.allowed.s.warn && /system default/.test(lf.allowed.s.msg),
    'On again = the user asks for the default: heard, with the microphone warning');
  noErrs(errs, 'restore missing');
  await ctx.close();

  ({ ctx, page, errs } = await newPage(browser, { 'audio.monitor': true }, { perm: 'prompt' }));
  await page.waitForTimeout(1000);
  const pp = await page.evaluate(async () => {
    const r = { gum: __gum.length, s: App.audioIn.state, stored: App.store.get('audio.monitor', null) };
    await App.audioIn.setMonitor(true);
    r.after = App.audioIn.state.monitor && __reachesMaster();
    return r;
  });
  ok(pp.gum === 0 && pp.s.held && pp.s.why === 'perm' && pp.stored === true, 'permission not granted yet: no prompt at launch, Hear input waits for a press: ' + pp.s.msg);
  ok(pp.after, 'pressing On starts it');
  noErrs(errs, 'restore prompt');
  await ctx.close();

  ({ ctx, page, errs } = await newPage(browser, { 'audio.monitor': true }, { perm: 'denied' }));
  await page.waitForTimeout(1000);
  const pd = await page.evaluate(() => ({ gum: __gum.length, stored: App.store.get('audio.monitor', null), msg: App.audioIn.state.msg }));
  ok(pd.gum === 0 && pd.stored === false && /blocked/.test(pd.msg), 'permission blocked: Hear input is switched off at launch, no prompt: ' + pd.msg);
  noErrs(errs, 'restore denied');
  await ctx.close();

  console.log('# no getUserMedia (claude.ai viewer, old WebViews)');
  ({ ctx, page, errs } = await newPage(browser, {}, { noMedia: true }));
  const nm = await page.evaluate(async () => {
    const s = await App.audioIn.setMonitor(true);
    const d = await App.audioIn.devices(true);
    App.switchTo('settings');
    await __wait(200);
    return { sup: App.audioIn.supported, err: s.error, d: d.length, lvl: App.audioIn.level().peak, msg: document.getElementById('set-ain-msg').textContent,
      list: document.getElementById('set-audio-msg').textContent, seg: document.getElementById('set-ain-mon').offsetParent !== null };
  });
  ok(!nm.sup && /not available/.test(nm.err) && nm.d === 0 && nm.lvl === 0, 'fails soft: a message, an empty list, a zero level');
  ok(/not available/.test(nm.msg) && /not available/.test(nm.list) && !nm.seg, 'Settings says so instead of breaking, and hides the Hear input controls');
  noErrs(errs, 'no media');
  await ctx.close();

  await browser.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
