// Chord chart maker (js/chordchart.js, page 'chart'): dots, fingers, names,
// chord/line playback, LUMI guide, save/undo/import, MIDI export, Woodshed.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
  });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && window.SLChart && App.active === 'quiz');

  console.log('# Page + chord names');
  const a = await page.evaluate(() => {
    App.switchTo('chart');
    const D = SLChart.detect;
    return {
      active: App.active, pill: !!document.querySelector('.subtab[data-page="chart"], [data-page="chart"]'),
      cards: document.querySelectorAll('#cc-sheet .cc-card').length,
      names: [D([65, 69, 74]), D([55, 57, 60, 64]), D([53, 57, 60, 64]), D([55, 57, 59, 62]), D([60, 64, 67]), D([57, 60, 62, 65]), D([60]), D([])]
    };
  });
  ok(a.active === 'chart' && a.cards === 8, 'Charts page opens with 8 blank keyboards ' + JSON.stringify(a));
  ok(JSON.stringify(a.names) === JSON.stringify(['Dm/F', 'Am7/G', 'Fmaj7', 'Gadd2', 'C', 'Dm7/A', 'C', '']), 'chord names from dots: ' + JSON.stringify(a.names));

  console.log('# Dots, fingers, undo, save');
  const b = await page.evaluate(() => {
    const c = SLChart;
    c.select(0); c.tool('dot');
    // real taps on the drawn keys
    [53, 57, 62].forEach(m => document.querySelector('#cc-sheet .cc-card[data-ci="0"] .cc-k[data-m="' + m + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const dots = document.querySelectorAll('#cc-sheet .cc-card[data-ci="0"] .cc-dot').length;
    const placeholder = document.querySelector('#cc-sheet .cc-name[data-ci="0"]').placeholder;
    c.tool('5'); c.tap(0, 62);
    const f5 = c.chart().cards[0].notes.find(n => n.m === 62).f;
    document.getElementById('cc-fing').click();
    const fingers = c.chart().cards[0].notes.slice().sort((x, y) => x.m - y.m).map(n => n.f);
    document.getElementById('cc-nameit').click();
    const name = c.chart().cards[0].name;
    c.tool('erase'); c.tap(0, 57);
    const afterErase = c.chart().cards[0].notes.length;
    document.getElementById('cc-undo').click();
    const afterUndo = c.chart().cards[0].notes.length;
    const stored = JSON.parse(localStorage.getItem('guitarlab.cc.charts'))[0].cards[0];
    return { dots, placeholder, f5, fingers, name, afterErase, afterUndo, stored: stored.notes.length, storedName: stored.name, fingText: document.querySelectorAll('#cc-sheet .cc-card[data-ci="0"] .cc-fing').length };
  });
  ok(b.dots === 3 && b.placeholder === 'Dm/F', 'three taps = three dots; the empty name shows the found chord ' + JSON.stringify(b));
  ok(b.f5 === 5 && JSON.stringify(b.fingers) === '[1,2,5]' && b.fingText === 3, 'finger tool + Add fingers: 1 2 5 for a right-hand Dm/F');
  ok(b.name === 'Dm/F' && b.afterErase === 2 && b.afterUndo === 3, 'Name it, Erase, Undo');
  ok(b.stored === 3 && b.storedName === 'Dm/F', 'saved in the browser (cc.charts)');

  console.log('# Left hand fingers, line, LUMI guide, play it in');
  const c2 = await page.evaluate(() => {
    const c = SLChart, calls = [];
    const orig = App.midi.guide; App.midi.guide = (n, x) => { calls.push([n.slice(), (x || []).slice()]); };
    c.select(1);
    document.querySelector('[data-cchand="L"]').click();
    c.tool('dot'); [48, 52, 55].forEach(m => c.tap(1, m));
    document.getElementById('cc-fing').click();
    const lf = c.chart().cards[1].notes.slice().sort((x, y) => x.m - y.m).map(n => n.f);
    c.select(0);
    const lit = calls[calls.length - 1];
    c.select(2);
    document.querySelector('[data-cckind="line"]').click();
    document.getElementById('cc-listen').click();
    [50, 53, 57, 53].forEach(m => App.emit('midi:note', { on: true, midi: m, vel: 90 }));
    const line = c.chart().cards[2].notes.map(n => n.m);
    const ord = document.querySelectorAll('#cc-sheet .cc-card[data-ci="2"] .cc-ord').length;
    document.getElementById('cc-listen').click();
    App.midi.guide = orig;
    return { lf, lit, line, ord };
  });
  ok(JSON.stringify(c2.lf) === '[5,3,1]', 'left hand fingers count from the pinky: ' + JSON.stringify(c2.lf));
  ok(c2.lit && c2.lit[0].sort().join() === '53,57,62' && c2.lit[1].sort().join() === '48,52,55', 'the picked chord lights the LUMI, the next one is the blinking "next": ' + JSON.stringify(c2.lit));
  ok(JSON.stringify(c2.line) === '[50,57]' && c2.ord === 2, 'Play it in: MIDI notes drop dots (again = off), a Line numbers them in order ' + JSON.stringify(c2));

  console.log('# Files');
  const d = await page.evaluate(() => {
    const bytes = SLChart.toMidi();
    const head = String.fromCharCode.apply(null, bytes.slice(0, 4));
    let ons = 0; for (let i = 0; i < bytes.length - 2; i++) if (bytes[i] === 0x90) ons++;
    const bad = SLChart.clean({ cards: [{ notes: [{ m: 999 }, { m: 60, f: 9 }, { m: 60 }] }], lo: 61, oct: 7 });
    return { head, ons, bad: bad && { notes: bad.cards[0].notes, lo: bad.lo, oct: bad.oct }, notChart: SLChart.clean({ foo: 1 }) };
  });
  ok(d.head === 'MThd' && d.ons >= 8, 'Save MIDI makes a real MIDI file (' + d.ons + ' note-ons)');
  ok(d.bad && JSON.stringify(d.bad.notes) === '[{"m":60,"f":0}]' && d.bad.lo === 60 && d.bad.oct === 2 && d.notChart === null, 'opened files are cleaned: ' + JSON.stringify(d));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#cc-export')]);
  ok(/\.chart\.json$/.test(dl.suggestedFilename()), 'Save file downloads ' + dl.suggestedFilename());
  const fpath = await dl.path();
  await page.evaluate(() => document.getElementById('cc-new').click());
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('guitarlab.cc.charts')).length);
  await page.setInputFiles('#cc-import', fpath);
  await page.waitForFunction(n => JSON.parse(localStorage.getItem('guitarlab.cc.charts')).length === n + 1, before);
  const imp = await page.evaluate(() => ({ title: SLChart.chart().title, name: SLChart.chart().cards[0].name, opts: document.querySelectorAll('#cc-pick option').length }));
  ok(imp.name === 'Dm/F' && imp.opts >= 3, 'Open file brings the chart back with names and fingers ' + JSON.stringify(imp));

  console.log('# Practice with LUMI -> Woodshed; leaving clears the lights');
  const e = await page.evaluate(() => {
    const calls = []; const orig = App.midi.guide; App.midi.guide = (n, x) => calls.push([n.slice(), (x || []).slice()]);
    document.getElementById('cc-practice').click();
    const r = { active: App.active, cleared: calls.some(c => !c[0].length && !c[1].length) };
    App.midi.guide = orig;
    return r;
  });
  ok(e.active === 'shed' && e.cleared, 'Practice with LUMI opens the chart in the Woodshed; the chart lights are released ' + JSON.stringify(e));

  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs));
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
