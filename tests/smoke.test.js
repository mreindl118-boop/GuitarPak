const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
(async () => {
  const b = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('soundlab2.help.seen', 'true'); localStorage.setItem('soundlab2.help.done', 'true'); localStorage.setItem('soundlab2.qz.landed', 'true');
    window.__midiLog = [];
    window.webkit = { messageHandlers: { midi: { postMessage: m => window.__midiLog.push(m) } } };
  });
  const p = await ctx.newPage();
  const errs = [];
  // uncaught errors and console errors of a page (a file another host did not serve is not ours)
  const watch = (pg, into) => {
    pg.on('pageerror', e => into.push('pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() !== 'error') return; const u = (m.location() && m.location().url) || ''; if (/Failed to load resource/.test(m.text()) && !/127\.0\.0\.1/.test(u)) return; into.push('console: ' + m.text() + ' @' + u); });
  };
  watch(p, errs);
  await p.goto(env.URL);
  await p.waitForFunction(() => window.App && App.active);
  await p.mouse.click(640, 860);
  const pages = await p.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const ids = ['quiz', 'chords', 'theory', 'fretboard', 'tab', 'notation', 'piano', 'pads', 'songs', 'jam', 'shed', 'tuner', 'quiz'];
    const seen = [];
    for (const id of ids) {
      App.switchTo(id); await wait(250);
      const panel = document.getElementById('panel-' + id);
      seen.push({ id, active: App.active, shown: !!panel && panel.classList.contains('active') });
    }
    return seen;
  });
  // a page that is not there must fail here: the id is the active page and its panel is the one shown
  const lost = pages.filter(x => x.active !== x.id || !x.shown);
  ok(lost.length === 0, 'visited, each one the active page with its panel shown: ' + pages.map(x => x.id).join(' ') + (lost.length ? '\n    not shown: ' + JSON.stringify(lost) : ''));
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

  // soundLAB Gear (gear.html, 2.0 Phase A3b): the second app over the same scripts, in the same profile.
  // It boots on the Deck; its four pages each open their own panel, with their module in it.
  await p.close(); // one window at a time: two open apps share the pedal and Hear input (tests/gear.test.js, tests/remote-gear.test.js)
  const g = await ctx.newPage(), gerrs = [];
  watch(g, gerrs);
  await g.goto(env.GEAR_URL);
  await g.waitForFunction(() => window.App && App.active === 'deck');
  await g.mouse.click(640, 860);
  const gear = await g.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const ids = ['deck', 'liveset', 'midihub', 'helix', 'deck'];
    const seen = [];
    for (const id of ids) {
      App.switchTo(id); await wait(250);
      const panel = document.getElementById('panel-' + id);
      seen.push({ id, active: App.active, shown: !!panel && panel.classList.contains('active') && document.querySelectorAll('main > .panel.active').length === 1 });
    }
    return { app: App.app, seen, panels: Array.from(document.querySelectorAll('main > .panel')).map(el => el.id.slice(6)).join(' '),
      broken: Array.from(document.querySelectorAll('main > .panel .error')).map(e => e.textContent).filter(t => /failed to load|crashed during init/.test(t)) };
  });
  const glost = gear.seen.filter(x => x.active !== x.id || !x.shown);
  ok(gear.app === 'gear' && glost.length === 0, 'soundLAB Gear: visited, each one the active page with its panel shown: ' + gear.seen.map(x => x.id).join(' ') + (glost.length ? '\n    not shown: ' + JSON.stringify(glost) : ''));
  ok(gear.panels === 'deck liveset midihub helix' && gear.broken.length === 0, 'soundLAB Gear: its panels are those four pages, each with its module: ' + gear.panels + (gear.broken.length ? '\n    ' + gear.broken.join('\n    ') : ''));
  ok(gerrs.length === 0, 'soundLAB Gear: no page errors across its pages' + (gerrs.length ? '\n    ' + gerrs.join('\n    ') : ''));
  await b.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
