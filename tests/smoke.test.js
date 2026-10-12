const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
(async () => {
  const b = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('guitarlab.help.seen', 'true'); localStorage.setItem('guitarlab.help.done', 'true'); localStorage.setItem('guitarlab.qz.landed', 'true');
    window.__midiLog = [];
    window.webkit = { messageHandlers: { midi: { postMessage: m => window.__midiLog.push(m) } } };
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() !== 'error') return; const u = (m.location() && m.location().url) || ''; if (/Failed to load resource/.test(m.text()) && !/127\.0\.0\.1/.test(u)) return; errs.push('console: ' + m.text() + ' @' + u); });
  await p.goto(env.URL);
  await p.waitForFunction(() => window.App && App.active);
  await p.mouse.click(640, 860);
  const pages = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const ids = ['quiz', 'chords', 'theory', 'fretboard', 'tab', 'notation', 'piano', 'synth', 'pads', 'songs', 'jam', 'shed', 'trainer', 'tuner', 'arrange', 'tracks', 'song', 'ideas', 'quiz'];
    const seen = [];
    for (const id of ids) { App.switchTo(id); await wait(id === 'arrange' || id === 'quiz' ? 900 : 250); seen.push(App.active + ':' + App.space); }
    return seen;
  });
  ok(pages.every(x => !/undefined/.test(x)), 'visited: ' + pages.join(' '));
  // MIDI into the piano: sound first, then key lights
  await p.evaluate(async () => {
    await App.midi.enable();
    window.__glMIDI.onports({ inputs: [{ id: 7, name: 'LUMI' }], outputs: [{ id: 7, name: 'LUMI' }] });
    App.switchTo('piano');
  });
  await p.waitForTimeout(400);
  const pn = await p.evaluate(async () => {
    const order = [];
    App.on('midi:note', () => order.push('late-visual'));
    App.on('midi:note', () => order.push('early-sound'), true);
    window.__glMIDI.onmidi(7, [0x90, 60, 100]);
    await new Promise(r => setTimeout(r, 60));
    const lit = document.querySelectorAll('#pn-svg .pn-key.pn-down').length;
    window.__glMIDI.onmidi(7, [0x80, 60, 0]);
    return { order, lit };
  });
  ok(pn.order[0] === 'early-sound' && pn.order.indexOf('late-visual') > 0, 'bus priority: sound listeners run first: ' + JSON.stringify(pn.order));
  ok(pn.lit > 0, 'piano lights the pressed key from the MIDI bridge: ' + pn.lit);
  // quiz answers from the native MIDI bridge too
  const qz = await p.evaluate(async () => {
    App.switchTo('quiz');
    await new Promise(r => setTimeout(r, 300));
    SLQuiz.start('notes/nat/treble/3');
    const pc = SLQuiz.q.pc;
    window.__glMIDI.onmidi(7, [0x90, 48 + pc, 90]);
    window.__glMIDI.onmidi(7, [0x80, 48 + pc, 0]);
    return document.getElementById('qz-fb').className;
  });
  ok(/ok/.test(qz), 'quiz answered from a LUMI note via the bridge: ' + qz);
  ok(errs.length === 0, 'no page errors across all pages' + (errs.length ? '\n    ' + errs.join('\n    ') : ''));
  await b.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
