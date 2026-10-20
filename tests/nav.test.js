const { chromium } = require('playwright');
const env = require('./env');
const URL = env.URL;
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
async function open(browser, vp, seed, mobile) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: !!mobile, isMobile: !!mobile });
  await ctx.addInitScript((seed) => {
    localStorage.setItem('guitarlab.help.seen', 'true'); localStorage.setItem('guitarlab.help.done', 'true'); localStorage.setItem('guitarlab.qz.landed', 'true');
    for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
  }, seed || {});
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() !== 'error') return; const u = (m.location() && m.location().url) || ''; if (/Failed to load resource/.test(m.text()) && !/127\.0\.0\.1/.test(u)) return; errs.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.App && App.active);
  await page.waitForTimeout(200);
  return { ctx, page, errs };
}
const tabs = sel => [...document.querySelectorAll(sel + ' .tabbar-btn')].map(b => b.textContent);
(async () => {
  const b = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });

  console.log('# desktop tab bar');
  let { ctx, page, errs } = await open(b, { width: 1280, height: 800 }, { 'app.tab': 'metronome' });
  ok(await page.evaluate(() => App.active) === 'quiz', 'a stored metronome tab falls back to Exercises: ' + await page.evaluate(() => App.active));
  const d1 = await page.evaluate(() => ({
    tabs: [...document.querySelectorAll('#tabbar .tabbar-btn')].map(b => b.textContent),
    topShown: getComputedStyle(document.getElementById('tabbar')).display !== 'none',
    botShown: getComputedStyle(document.getElementById('tabbar-m')).display !== 'none',
    active: (document.querySelector('#tabbar .tabbar-btn.active') || {}).textContent,
    noSelect: !document.getElementById('nav-select'),
    metTab: [...document.querySelectorAll('.tabbar-btn, .subtab')].some(x => /metronome/i.test(x.textContent))
  }));
  ok(d1.tabs.join('|') === 'Learn|Guitar|Keys|Play|Practice' && d1.active === 'Learn', 'sections: ' + d1.tabs.join('|') + ' (active ' + d1.active + ')');
  ok(d1.topShown && !d1.botShown && d1.noSelect && !d1.metTab, 'top tab bar on desktop, no drop-down, no metronome tab: ' + JSON.stringify(d1));
  const clickTab = async (label, sel) => { await page.click((sel || '#tabbar') + ' .tabbar-btn:has-text("' + label + '")'); await page.waitForTimeout(120); return page.evaluate(() => App.active); };
  ok(await clickTab('Keys') === 'piano', 'Keys tab opens the piano');
  ok((await page.evaluate(() => [...document.querySelectorAll('#subnav .subtab')].map(b => b.textContent).join('|'))) === 'Piano|Synth|Pads|MIDI', 'Keys pills: Piano | Synth | Pads | MIDI');
  await page.click('#subnav .subtab:has-text("Synth")'); await page.waitForTimeout(150);
  ok(await clickTab('Guitar') === 'fretboard', 'Guitar tab opens the neck');
  ok((await page.evaluate(() => [...document.querySelectorAll('#subnav .subtab')].map(b => b.textContent).join('|'))) === 'Neck|Tab|Notation', 'Guitar pills: Neck | Tab | Notation');
  ok(await clickTab('Keys') === 'synth', 'Keys remembers the last page (Synth)');
  ok(await clickTab('Practice') === 'shed', 'Practice opens the Woodshed');
  ok((await page.evaluate(() => [...document.querySelectorAll('#subnav .subtab')].map(b => b.textContent).join('|'))) === 'Woodshed|Trainer|Tuner', 'Practice pills: Woodshed | Trainer | Tuner');
  await page.click('#subnav .subtab:has-text("Tuner")'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => App.active) === 'tuner', 'Tuner is a page under Practice');
  await clickTab('Keys'); await page.evaluate(() => window.scrollTo(0, 600)); await page.waitForTimeout(150);
  await clickTab('Keys'); await page.waitForTimeout(700);
  ok(await page.evaluate(() => window.pageYOffset) < 5, 'tapping the open tab scrolls back to the top');

  console.log('# metronome sheet');
  const before = await page.evaluate(() => App.active);
  await page.click('#met-btn'); await page.waitForTimeout(250);
  const s1 = await page.evaluate(() => ({ open: !document.getElementById('sheet-metronome').hidden, sheet: App.sheet, active: App.active,
    exp: document.getElementById('met-btn').getAttribute('aria-expanded'), start: !!document.querySelector('#sheet-metronome #met-startstop'),
    focus: document.activeElement && document.activeElement.hasAttribute('data-sheet-close') }));
  ok(s1.open && s1.sheet === 'metronome' && s1.active === before && s1.exp === 'true' && s1.start, 'corner icon opens the metronome over the current page: ' + JSON.stringify(s1));
  ok(s1.focus, 'focus moves into the sheet');
  await page.keyboard.press('Space'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.getElementById('met-btn').classList.contains('on')), 'Space starts the click; the corner icon lights up');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  const s2 = await page.evaluate(() => ({ open: !document.getElementById('sheet-metronome').hidden, on: document.getElementById('met-btn').classList.contains('on'), active: App.active, focusBtn: document.activeElement && document.activeElement.id }));
  ok(!s2.open && s2.on && s2.active === before, 'Escape closes it, the click keeps running: ' + JSON.stringify(s2));
  await page.click('#met-btn'); await page.waitForTimeout(200);
  await page.mouse.click(15, 790); await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.getElementById('sheet-metronome').hidden), 'a tap outside the card closes it');
  await page.click('#met-btn'); await page.waitForTimeout(200);
  await page.click('[data-sheet-close]'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.getElementById('sheet-metronome').hidden), 'the X closes it');
  await page.click('#met-btn'); await page.waitForTimeout(200);
  await page.click('[data-sheet-help]'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => !!document.getElementById('hp-ov') && /Metronome/.test(document.getElementById('hp-ov').textContent)), 'the sheet has its own help tour');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.evaluate(() => { const o = document.getElementById('hp-ov'); if (o) o.click(); }); await page.waitForTimeout(100);
  await page.evaluate(() => App.closeSheet());
  await page.evaluate(() => App.switchTo('metronome')); await page.waitForTimeout(150);
  ok(await page.evaluate(() => App.sheet === 'metronome' && !document.getElementById('sheet-metronome').hidden), 'switchTo("metronome") opens the sheet');
  await page.evaluate(() => App.switchTo('songs')); await page.waitForTimeout(150);
  ok(await page.evaluate(() => App.sheet === null && App.active === 'songs'), 'navigating elsewhere closes the sheet');
  await page.click('#cx-met'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !document.getElementById('met-btn').classList.contains('on')), 'stopping from the context bar clears the icon');

  console.log('# scale menu');
  const sc = await page.evaluate(() => {
    const sel = document.getElementById('cx-scale');
    const groups = [...sel.querySelectorAll('optgroup')].map(g => g.label + ':' + g.children.length);
    sel.value = 'blues'; sel.dispatchEvent(new Event('change'));
    return { groups, n: sel.options.length, first: sel.options[0].value, stored: JSON.parse(localStorage.getItem('guitarlab.fb.scale')) };
  });
  ok(sc.groups.join(',') === 'Common:5,Minor family:2,Modes:5,Exotic:1' && sc.n === 13 && sc.first === 'major' && sc.stored === 'blues', 'scales grouped, all 13 kept, selection works: ' + JSON.stringify(sc));
  ok(errs.length === 0, 'no page errors (desktop)' + (errs.length ? '\n    ' + errs.join('\n    ') : ''));
  await ctx.close();

  console.log('# phone');
  ({ ctx, page, errs } = await open(b, { width: 390, height: 844 }, {}, true));
  const m1 = await page.evaluate(() => {
    const bar = document.getElementById('tabbar-m').getBoundingClientRect();
    const met = document.getElementById('met-btn').getBoundingClientRect();
    const brand = document.querySelector('.brand').getBoundingClientRect();
    return { botShown: getComputedStyle(document.getElementById('tabbar-m')).display !== 'none', topShown: getComputedStyle(document.getElementById('tabbar')).display !== 'none',
      barBottom: Math.round(bar.bottom), vh: window.innerHeight, n: document.querySelectorAll('#tabbar-m .tabbar-btn').length,
      oneRow: Math.abs(met.top - brand.top) < 24, metRight: Math.round(window.innerWidth - met.right) };
  });
  ok(m1.botShown && !m1.topShown && m1.barBottom === m1.vh && m1.n === 5, 'phone: tabs fixed along the bottom: ' + JSON.stringify(m1));
  ok(m1.oneRow && m1.metRight < 20, 'phone: logo and corner icons share one row, metronome in the corner: ' + JSON.stringify(m1));
  await page.tap('#tabbar-m .tabbar-btn:has-text("Play")'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => App.active) === 'songs', 'phone: bottom tab navigates');
  await page.tap('#met-btn'); await page.waitForTimeout(300);
  const m2 = await page.evaluate(() => { const c = document.querySelector('#sheet-metronome .sheet-card').getBoundingClientRect(); return { bottom: Math.round(c.bottom), vh: window.innerHeight, w: Math.round(c.width) }; });
  ok(m2.bottom === m2.vh && m2.w === 390, 'phone: metronome opens as a bottom sheet: ' + JSON.stringify(m2));
  const ov = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  ok(!ov, 'phone: no sideways scroll');
  ok(errs.length === 0, 'no page errors (phone)' + (errs.length ? '\n    ' + errs.join('\n    ') : ''));
  await ctx.close();

  console.log('# studio space');
  ({ ctx, page, errs } = await open(b, { width: 1280, height: 800 }));
  await page.click('#space-btn'); await page.waitForTimeout(900);
  const st = await page.evaluate(() => ({ space: App.space, tabs: [...document.querySelectorAll('#tabbar .tabbar-btn')].map(b => b.textContent).join('|'), active: App.active }));
  ok(st.space === 'studio' && st.tabs === 'Studio|Sketch', 'studio tabs: ' + JSON.stringify(st));
  // a second switch started right after the first finished must not be eaten
  // by the first wipe's leftover safety timers (it used to land nowhere)
  const quick = await page.evaluate(async () => {
    const wipe = document.getElementById('wipe'), t0 = performance.now();
    App.setSpace('practice');
    while (performance.now() - t0 < 2000 && (App.space !== 'practice' || wipe.style.display !== 'none')) await new Promise(r => setTimeout(r, 10));
    const firstMs = Math.round(performance.now() - t0);
    App.setSpace('studio');
    await new Promise(r => setTimeout(r, 1500));
    return { firstMs, space: App.space, curtain: wipe.style.display };
  });
  ok(quick.space === 'studio' && quick.curtain === 'none', 'a quick second workspace switch lands: ' + JSON.stringify(quick));
  ok(errs.length === 0, 'no page errors (studio)' + (errs.length ? '\n    ' + errs.join('\n    ') : ''));
  await ctx.close();
  await b.close();
  console.log(fails ? '\nFAILED: ' + fails : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
