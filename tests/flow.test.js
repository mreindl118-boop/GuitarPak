// FLOW: one key and one tempo, visible on every page and followed by every
// tool - the key chip in the top bar, key titles as doors to the one picker,
// Chords + Jam on pentatonic / blues scales, the shared tempo, "Use it on",
// and the retired Studio button.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
async function open(browser, vp, seed) {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.addInitScript((seed) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('guitarlab.help.seen', 'true'); localStorage.setItem('guitarlab.help.done', 'true'); localStorage.setItem('guitarlab.qz.landed', 'true');
    for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
  }, seed || {});
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.active);
  await page.waitForTimeout(250);
  return { ctx, page, errs };
}
const go = async (page, name) => { await page.evaluate(n => App.switchTo(n), name); await page.waitForTimeout(250); };
const setBar = (page, id, value) => page.evaluate(([id, value]) => { const el = document.getElementById(id); el.value = value; el.dispatchEvent(new Event('change')); }, [id, value]);
(async () => {
  const b = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });

  console.log('# theory: the chord key of a scale');
  let { ctx, page, errs } = await open(b, { width: 1280, height: 800 });
  const th = await page.evaluate(() => ({
    pent: Theory.parentScale('minorPent'), blues: Theory.parentScale('blues'), mpent: Theory.parentScale('majorPent'),
    dor: Theory.parentScale('dorian'), bad: Theory.parentScale('nope'), short: Theory.keyShort(9, 'minorPent'), flat: Theory.keyShort(3, 'major')
  }));
  ok(th.pent === 'aeolian' && th.blues === 'aeolian' && th.mpent === 'major' && th.dor === 'dorian' && th.bad === 'major', 'pentatonic / blues borrow major or natural minor; 7-note scales stay: ' + JSON.stringify(th));
  ok(th.short === 'A minor pent' && th.flat === 'Eb major', 'short key names: ' + th.short + ', ' + th.flat);

  console.log('# first launch: one tempo, one key, everywhere');
  await go(page, 'fretboard');
  const chip0 = await page.evaluate(() => ({ key: document.getElementById('ctx-key').textContent, bpm: document.getElementById('ctx-tempo').textContent,
    fb: document.getElementById('fb-pr-bpm').value, shown: document.getElementById('ctx-key').getClientRects().length > 0 }));
  ok(chip0.key === 'A minor pent' && chip0.bpm === '120' && chip0.shown, 'the key chip names the key and tempo: ' + JSON.stringify(chip0));
  ok(chip0.fb === '120', 'the Neck starts on the same tempo as the chip (was 100 vs 120): ' + chip0.fb);
  await go(page, 'chords');
  const ch0 = await page.evaluate(() => ({ label: document.getElementById('ch-key-label').textContent, bpm: document.getElementById('ch-bpm').value,
    pal: [...document.querySelectorAll('#ch-inkey button, #ch-inkey .chip')].map(x => x.textContent.trim()).join(' ') }));
  ok(/^A Natural Minor/.test(ch0.label) && /Am/.test(ch0.pal), 'Chords opens in A minor for A minor pentatonic (was stuck on C major): ' + JSON.stringify(ch0));
  ok(ch0.bpm === '120', 'Chords uses the shared tempo: ' + ch0.bpm);

  console.log('# change it once, every page follows');
  await page.click('#ctx-btn'); await setBar(page, 'cx-root', '4'); await setBar(page, 'cx-scale', 'majorPent'); await setBar(page, 'cx-bpm', '84');
  await page.waitForTimeout(200);
  const ch1 = await page.evaluate(() => ({ chip: document.getElementById('ctx-key').textContent + '/' + document.getElementById('ctx-tempo').textContent,
    label: document.getElementById('ch-key-label').textContent, bpm: document.getElementById('ch-bpm').value }));
  ok(ch1.chip === 'E major pent/84' && /^E Major/.test(ch1.label) && ch1.bpm === '84', 'chip + Chords follow the bar live: ' + JSON.stringify(ch1));
  await page.keyboard.press('Escape');
  await setBar(page, 'ch-bpm', '96'); await page.waitForTimeout(100);
  const t1 = await page.evaluate(() => ({ met: App.store.get('met.bpm'), chip: document.getElementById('ctx-tempo').textContent, bar: document.getElementById('cx-bpm').value }));
  ok(t1.met === 96 && t1.chip === '96' && t1.bar === '96', 'a tempo set on Chords is the app tempo: ' + JSON.stringify(t1));
  await setBar(page, 'cx-scale', 'minorPent'); await go(page, 'jam');
  const jam = await page.evaluate(() => ({ label: document.getElementById('jam-keylabel').textContent, bpm: document.getElementById('jam-bpm').value,
    pal: [...document.querySelectorAll('.jam-pal')].map(x => x.textContent).join(' ') }));
  ok(/^E Natural Minor/.test(jam.label) && /Em/.test(jam.pal) && jam.bpm === '96', 'Jam plays E minor for E minor pentatonic (was E major): ' + JSON.stringify(jam));

  console.log('# key titles open the one picker');
  for (const [pg, id] of [['jam', 'jam-keylabel'], ['chords', 'ch-key-label'], ['fretboard', 'fb-title'], ['tab', 'fb-tab-title'], ['notation', 'fb-notation-title'], ['piano', 'pn-title']]) {
    await go(page, pg);
    await page.click('#' + id); await page.waitForTimeout(120);
    const st = await page.evaluate(() => ({ open: App.ctx(), focus: document.activeElement.id, go: [...document.querySelectorAll('#cx-go [data-cxgo]')].map(x => x.getAttribute('data-cxgo')) }));
    ok(st.open && st.focus === 'cx-root' && st.go.indexOf(pg) === -1 && st.go.length >= 4, pg + ': the key title opens the picker; "Use it on" leaves this page out: ' + JSON.stringify(st));
    await page.keyboard.press('Escape');
  }
  await go(page, 'fretboard'); await page.focus('#fb-title'); await page.keyboard.press('Enter'); await page.waitForTimeout(120);
  ok(await page.evaluate(() => App.ctx()), 'a key title works from the keyboard (Enter)');
  await page.click('#cx-go [data-cxgo="chords"]'); await page.waitForTimeout(250);
  const went = await page.evaluate(() => ({ active: App.active, open: App.ctx(), label: document.getElementById('ch-key-label').textContent }));
  ok(went.active === 'chords' && !went.open && /^E Natural Minor/.test(went.label), '"Use it on Chords" lands on Chords in the same key: ' + JSON.stringify(went));
  ok(errs.length === 0, 'no page errors' + (errs.length ? '\n    ' + errs.join('\n    ') : ''));

  console.log('# the Studio button');
  const s0 = await page.evaluate(() => ({ hidden: document.getElementById('space-btn').getClientRects().length === 0, order: [...document.querySelectorAll('#tabs > button')].filter(x => x.getClientRects().length).map(x => x.id).join(',') }));
  ok(s0.hidden && s0.order === 'help-btn,settings-btn,ctx-btn,lights-btn,met-btn', 'no Studio button by default: ' + JSON.stringify(s0));
  await go(page, 'settings'); await page.click('#set-studio'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => App.studioShown() && document.getElementById('space-btn').getClientRects().length > 0), 'Settings > Studio brings the button back');
  await page.click('#space-btn'); await page.waitForTimeout(900);
  await page.evaluate(() => App.setStudioShown(false));
  ok(await page.evaluate(() => App.space === 'studio' && document.getElementById('space-btn').getClientRects().length > 0 && document.getElementById('cx-go').hidden), 'inside the Studio the way home always shows');
  await page.click('#space-btn'); await page.waitForTimeout(900);
  ok(await page.evaluate(() => App.space === 'practice' && document.getElementById('space-btn').getClientRects().length === 0), 'back in practice it is gone again');
  await page.reload(); await page.waitForFunction(() => window.App && App.active);
  ok(await page.evaluate(() => document.getElementById('ctx-key').textContent === 'E minor pent' && document.getElementById('ctx-tempo').textContent === '96'), 'key and tempo survive a reload');
  await ctx.close();

  console.log('# phones');
  for (const w of [390, 360]) {
    ({ ctx, page, errs } = await open(b, { width: w, height: 760 }, { 'fb.root': 8, 'fb.scale': 'harmonicMinor' }));
    await go(page, 'fretboard');
    const ph = await page.evaluate(() => {
      const k = document.getElementById('ctx-key'), r = k.getBoundingClientRect(), tools = document.getElementById('tabs').getBoundingClientRect(), brand = document.querySelector('.brand').getBoundingClientRect();
      return { text: k.textContent, w: Math.round(r.width), over: document.documentElement.scrollWidth > innerWidth, oneRow: Math.abs(tools.top + tools.height / 2 - (brand.top + brand.height / 2)) < 14 && tools.right <= innerWidth + 0.5 };
    });
    ok(ph.text === 'Ab harm. minor' && ph.w > 30 && !ph.over && ph.oneRow, w + ' px: the key reads in the top row, no sideways scroll: ' + JSON.stringify(ph));
    ok(errs.length === 0, 'no page errors (' + w + ')' + (errs.length ? '\n    ' + errs.join('\n    ') : ''));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? '\nFAILED: ' + fails : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})();
