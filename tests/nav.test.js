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
  ok(d1.tabs.join('|') === 'Learn|Free Play|Library|Progress' && d1.active === 'Learn', 'sections: ' + d1.tabs.join('|') + ' (active ' + d1.active + ')');
  ok(d1.topShown && !d1.botShown && d1.noSelect && !d1.metTab, 'top tab bar on desktop, no drop-down, no metronome tab: ' + JSON.stringify(d1));
  const clickTab = async (label, sel) => { await page.click((sel || '#tabbar') + ' .tabbar-btn:has-text("' + label + '")'); await page.waitForTimeout(120); return page.evaluate(() => App.active); };
  ok(await clickTab('Free Play') === 'piano', 'Free Play opens the selected piano instrument');
  ok((await page.evaluate(() => [...document.querySelectorAll('#subnav .subtab')].map(b => b.textContent).join('|'))) === 'Piano|Synth|Pads', 'Free Play shows the current instrument tools');
  await page.click('#subnav .subtab:has-text("Synth")'); await page.waitForTimeout(150);
  await page.selectOption('#workflow-instrument', 'guitar'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => App.active) === 'fretboard', 'changing the Free Play instrument opens its guitar neck');
  ok((await page.evaluate(() => [...document.querySelectorAll('#subnav .subtab')].map(b => b.textContent).join('|'))) === 'Neck|Tab|Notation', 'Guitar pills: Neck | Tab | Notation');
  await page.selectOption('#workflow-tools', 'midihub'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => App.active) === 'midihub', 'all-tools picker preserves the MIDI Hub');
  ok(await clickTab('Library') === 'musiclibrary', 'Library opens retained source files');
  ok((await page.evaluate(() => [...document.querySelectorAll('#subnav .subtab')].map(b => b.textContent).join('|'))) === 'My files|Review|Woodshed', 'Library retains review and all Woodshed tools');
  await page.click('#tuner-btn'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => App.sheet === 'tuner' && App.active === 'musiclibrary'), 'Tuner is a global sheet over the current route');
  await page.keyboard.press('Escape');
  await clickTab('Free Play'); await page.evaluate(() => window.scrollTo(0, 600)); await page.waitForTimeout(150);
  await clickTab('Free Play'); await page.waitForTimeout(700);
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
  await page.click('#ctx-btn'); await page.click('#cx-met'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !document.getElementById('met-btn').classList.contains('on')), 'stopping from the context bar clears the icon');

  console.log('# clef dropdown (key / scale / tempo)');
  const shown = () => page.evaluate(() => getComputedStyle(document.getElementById('ctxbar')).display !== 'none');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  const cx0 = { open: await shown(), order: await page.evaluate(() => [...document.querySelectorAll('.tb-tools .icon-btn')].map(b => b.id).join(',')),
    label: await page.evaluate(() => document.getElementById('ctx-btn').getAttribute('aria-label')) };
  ok(!cx0.open && cx0.order === 'help-btn,settings-btn,ctx-btn,tuner-btn,lights-btn,met-btn' && /A Minor Pentatonic · 120 BPM|· \d+ BPM/.test(cx0.label),
    'key / scale / tempo are tucked away behind the clef, beside the lights and metronome: ' + JSON.stringify(cx0));
  await page.click('#ctx-btn'); await page.waitForTimeout(150);
  const cx1 = { open: await shown(), exp: await page.evaluate(() => document.getElementById('ctx-btn').getAttribute('aria-expanded')) };
  await page.selectOption('#cx-scale', 'dorian'); await page.waitForTimeout(100);
  cx1.afterPick = await shown();
  cx1.label = await page.evaluate(() => document.getElementById('ctx-btn').title);
  await page.mouse.click(640, 600); await page.waitForTimeout(150);
  cx1.outside = await shown();
  await page.click('#ctx-btn'); await page.waitForTimeout(100); await page.click('#ctx-btn'); await page.waitForTimeout(100);
  cx1.toggle = await shown();
  await page.click('#ctx-btn'); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  cx1.esc = await shown();
  await page.click('#ctx-btn'); await page.evaluate(() => App.switchTo('chords')); await page.waitForTimeout(150);
  cx1.nav = await shown();
  await page.evaluate(() => App.switchTo('quiz')); await page.waitForTimeout(150);
  cx1.quizBtn = await page.evaluate(() => getComputedStyle(document.getElementById('ctx-btn')).display);
  await page.evaluate(() => App.switchTo('songs')); await page.waitForTimeout(150);
  ok(cx1.open && cx1.exp === 'true' && cx1.afterPick && /Dorian/.test(cx1.label), 'the clef opens it; picking a scale keeps it open and the button names it: ' + JSON.stringify(cx1));
  ok(!cx1.outside && !cx1.toggle && !cx1.esc && !cx1.nav, 'tucked away by a tap outside, the clef again, Esc, or changing page: ' + JSON.stringify(cx1));
  ok(cx1.quizBtn !== 'none', 'the shared clef remains available on Exercises');
  await page.evaluate(() => { const s = document.getElementById('cx-scale'); s.value = 'minorPent'; s.dispatchEvent(new Event('change')); });

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
  ok(m1.botShown && !m1.topShown && m1.barBottom === m1.vh && m1.n === 4, 'phone: four focused sections fixed along the bottom: ' + JSON.stringify(m1));
  ok(!m1.oneRow && m1.metRight < 20, 'phone: utilities have their own reachable row, metronome in the corner: ' + JSON.stringify(m1));
  await page.evaluate(() => App.switchTo('fretboard')); await page.waitForTimeout(150);
  await page.tap('#ctx-btn'); await page.waitForTimeout(200);
  const m3 = await page.evaluate(() => { const c = document.getElementById('ctxbar').getBoundingClientRect(); return { open: App.ctx(), l: Math.round(c.left), r: Math.round(innerWidth - c.right), over: document.documentElement.scrollWidth > innerWidth }; });
  await page.evaluate(() => history.back()); await page.waitForTimeout(250);
  m3.back = await page.evaluate(() => App.ctx());
  ok(m3.open && m3.l === 12 && m3.r === 12 && !m3.over && !m3.back, 'phone: the clef dropdown spans the screen; Back tucks it away: ' + JSON.stringify(m3));
  await page.evaluate(() => App.switchTo('quiz')); await page.waitForTimeout(150);
  await page.tap('#tabbar-m .tabbar-btn:has-text("Play")'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => App.active) === 'piano', 'phone: Free Play opens the selected instrument');
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
