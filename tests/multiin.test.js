// All keyboards: every MIDI input plays the app at once (a MODX for playing,
// a LUMI as the lit display) while the key lights go to the one output.
// Fake Web MIDI with two inputs + two outputs (MODX listed first, like
// Windows does), each output records what it was sent.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

async function newPage(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript((seed) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
    window.__sent = { 'out-modx': [], 'out-lumi': [] };
    const mkIn = (id, name) => ({ id, name, state: 'connected', onmidimessage: null });
    const mkOut = (id, name) => ({ id, name, state: 'connected', send: b => window.__sent[id].push(Array.from(b)) });
    const modx = mkIn('in-modx', 'MODX-1'), lumi = mkIn('in-lumi', 'LUMI Keys Block ALXJ (Bluetooth MIDI IN)');
    window.__ins = { modx, lumi };
    const access = {
      inputs: new Map([['in-modx', modx], ['in-lumi', lumi]]),
      outputs: new Map([['out-modx', mkOut('out-modx', 'MODX-1')], ['out-lumi', mkOut('out-lumi', 'LUMI Keys Block ALXJ (Bluetooth MIDI OUT)')]]),
      sysexEnabled: true, onstatechange: null
    };
    navigator.requestMIDIAccess = () => Promise.resolve(access);
    window.__play = (port, n) => {
      const p = window.__ins[port];
      if (p.onmidimessage) { p.onmidimessage({ data: new Uint8Array([0x90, n, 100]) }); p.onmidimessage({ data: new Uint8Array([0x80, n, 0]) }); }
    };
    window.__notesTo = id => window.__sent[id].filter(b => (b[0] & 0xf0) === 0x90 || (b[0] & 0xf0) === 0x80).length;
  }, seed || {});
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.midi.hasOutput && App.active === 'quiz');
  return { ctx, page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });

  console.log('# fresh install: all keyboards, lights on the LUMI');
  let { ctx, page, errs } = await newPage(browser);
  const a = await page.evaluate(() => {
    const got = []; App.on('midi:note', d => { if (d.on) got.push(d.port + ':' + d.midi); });
    __play('modx', 60); __play('lumi', 64);
    return { inputId: App.midi.inputId, heard: App.midi.inputsHeard.map(p => p.name), out: App.midi.outputName, lumi: App.midi.lumi, got };
  });
  ok(a.inputId === 'all' && a.heard.length === 2, 'both keyboards are heard: ' + JSON.stringify(a.heard));
  ok(a.got.join() === 'MODX-1:60,LUMI Keys Block ALXJ (Bluetooth MIDI IN):64', 'notes from the MODX and the LUMI both play the app, tagged with their port: ' + a.got);
  ok(/LUMI/.test(a.out) && a.lumi === true, 'the lights output defaults to the LUMI even though the MODX is listed first: ' + a.out);

  console.log('# the LUMI window follows only the LUMI');
  const r = await page.evaluate(() => {
    App.help.set(4); App.switchTo('piano'); App.keys.setHand('right');
    const o = { start: App.midi.range().lo };
    __play('modx', 30);                       // a low MODX note
    o.afterModx = App.midi.range().lo; o.handModx = App.keys.hand();
    __play('lumi', 30);                       // LUMI octave-down + a key
    o.afterLumi = App.midi.range().lo; o.handLumi = App.keys.hand();
    __play('lumi', 70); o.back = App.midi.range().lo; o.handBack = App.keys.hand();
    o.modxNotes = __notesTo('out-modx'); o.lumiNotes = __notesTo('out-lumi');
    return o;
  });
  ok(r.afterModx === r.start && r.handModx === 'right', 'a low MODX note leaves the LUMI window and the hand alone: ' + r.afterModx + ' ' + r.handModx);
  ok(r.afterLumi === 24 && r.handLumi === 'left', 'the LUMI octave-down moves the window and picks the left hand: ' + r.afterLumi + ' ' + r.handLumi);
  ok(r.back === 48 && r.handBack === 'right', 'and back up: right hand');
  ok(r.modxNotes === 0 && r.lumiNotes > 0, 'key lights go only to the LUMI, never sound on the MODX: modx=' + r.modxNotes + ' lumi=' + r.lumiNotes);

  console.log('# single input still possible');
  const s = await page.evaluate(() => {
    const got = []; App.on('midi:note', d => { if (d.on) got.push(d.midi); });
    App.midi.setInput('in-modx');
    __play('modx', 61); __play('lumi', 65);
    const o = { id: App.midi.inputId, got: got.slice() };
    App.midi.setInput('all'); __play('lumi', 66);
    o.back = App.midi.inputId; o.got2 = got.slice();
    o.stored = JSON.parse(localStorage.getItem('guitarlab.midi.inputId'));
    return o;
  });
  ok(s.id === 'in-modx' && s.got.join() === '61', 'picking one input hears only it: ' + s.got);
  ok(s.back === 'all' && s.got2.join() === '61,66' && s.stored === 'all', 'All keyboards again (remembered)');

  console.log('# a synth as the output never gets light notes');
  const y = await page.evaluate(() => {
    window.__sent['out-modx'].length = 0;
    App.midi.setOutput('out-modx');
    App.midi.guide(64, 65); __play('lumi', 60);
    const o = { lumi: App.midi.lumi, notes: __notesTo('out-modx') };
    App.midi.guide(null, null); App.midi.setOutput('out-lumi');
    return o;
  });
  ok(y.lumi === false && y.notes === 0, 'MODX output + LUMI among the inputs: not treated as a LUMI, no note-on lights sent: ' + JSON.stringify(y));

  console.log('# MIDI Hub input picker');
  const h = await page.evaluate(() => {
    App.switchTo('midihub');
    const sel = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => o.value === 'all'));
    return sel ? { val: sel.value, first: sel.options[0].textContent } : null;
  });
  ok(h && h.val === 'all' && h.first === 'All keyboards', 'the Hub offers All keyboards and shows it selected: ' + JSON.stringify(h));
  const st = await page.evaluate(() => {
    App.switchTo('settings');
    const sel = document.getElementById('set-midi-in');
    const o = { first: sel.options[0] && sel.options[0].textContent, val: sel.value };
    sel.value = 'in-lumi'; sel.dispatchEvent(new Event('change'));
    o.single = App.midi.inputId;
    sel.value = 'all'; sel.dispatchEvent(new Event('change'));
    o.back = App.midi.inputId;
    o.btHint = document.getElementById('set-midi-btnote').style.display;
    App.switchTo('quiz');
    return o;
  });
  ok(st.first === 'All keyboards' && st.val === 'all', 'Settings › MIDI offers All keyboards, selected: ' + JSON.stringify(st));
  ok(st.single === 'in-lumi' && st.back === 'all', 'and switches between one keyboard and all of them');
  ok(st.btHint === 'none', 'no Windows Bluetooth hint once a Bluetooth port is listed');
  ok(!errs.length, 'no page errors: ' + errs.join(' | '));
  await ctx.close();

  console.log('# upgrade: a stored single input becomes All keyboards once');
  ({ ctx, page, errs } = await newPage(browser, { 'midi.inputId': 'in-lumi' }));
  const m1 = await page.evaluate(() => App.midi.inputId);
  ok(m1 === 'all', 'an older single-input choice migrates to All keyboards: ' + m1);
  await ctx.close();
  ({ ctx, page, errs } = await newPage(browser, { 'midi.inputId': 'in-lumi', 'midi.allIn.v1': true }));
  const m2 = await page.evaluate(() => App.midi.inputId);
  ok(m2 === 'in-lumi', 'after the migration a single-input choice is kept: ' + m2);
  await ctx.close();

  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
