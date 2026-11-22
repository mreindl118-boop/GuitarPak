// FULL SCREEN + ONE METRONOME (2.3): the neck's and the keys' full-screen
// views carry the key chip + the metronome button (app.js App.fullDock), the
// clef dropdown opens INSIDE full screen, and a practice runner's Click is the
// app's one metronome (metronome.js App.metronome.link): same on / off, same
// tempo, and the runner's notes sit on the metronome's beat.
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
const setVal = (page, id, value) => page.evaluate(([id, value]) => { const el = document.getElementById(id); el.value = value; el.dispatchEvent(new Event('change')); }, [id, value]);
const visible = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; }, sel);
const metOn = page => page.evaluate(() => App.metronome.running());

(async () => {
  const b = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  const { ctx, page, errs } = await open(b, { width: 1280, height: 800 });

  console.log('# neck full screen: key chip + metronome come along');
  await go(page, 'fretboard');
  await page.click('#fb-max'); await page.waitForTimeout(300);
  ok(await visible(page, '#fb-board #fs-dock #fs-key') && await visible(page, '#fb-board #fs-dock #fs-met'), 'the key chip and the metronome button sit inside the full-screen neck');
  ok(await page.evaluate(() => document.getElementById('ctxbar').parentNode.id === 'fb-board'), 'the clef dropdown moved into full screen with them');
  const k0 = await page.evaluate(() => document.getElementById('fs-key').textContent);
  ok(/A minor pent/.test(k0) && /120/.test(k0), 'the chip names the key and the tempo: ' + k0);
  await page.click('#fs-key'); await page.waitForTimeout(150);
  ok(await visible(page, '#ctxbar #cx-scale'), 'tapping the chip opens Key / Scale / BPM inside full screen');
  ok(!(await visible(page, '#ctxbar .cx-go')), '"Use it on" (which would leave full screen) is hidden there');
  await setVal(page, 'cx-root', '7'); await setVal(page, 'cx-scale', 'major'); await setVal(page, 'cx-bpm', '90');
  await page.waitForTimeout(200);
  const n1 = await page.evaluate(() => ({ chip: document.getElementById('fs-key').textContent, title: document.getElementById('fb-title').textContent,
    root: App.store.get('fb.root'), scale: App.store.get('fb.scale'), fbBpm: document.getElementById('fb-pr-bpm').value, open: App.ctx() }));
  ok(n1.root === 7 && n1.scale === 'major' && /G major/i.test(n1.chip) && /90/.test(n1.chip), 'a new scale + tempo picked in full screen is the app key: ' + JSON.stringify(n1));
  ok(/G/.test(n1.title) && n1.fbBpm === '90', 'the neck redraws in the new key and its tempo follows: ' + JSON.stringify(n1));
  ok(n1.open, 'the dropdown stays open while picking inside it');
  await page.mouse.click(640, 600); await page.waitForTimeout(150);
  ok(!(await page.evaluate(() => App.ctx())), 'a tap on the neck tucks the dropdown away');
  await page.click('#fs-met'); await page.waitForTimeout(250);
  ok(await metOn(page), 'the full-screen metronome button starts THE metronome');
  ok(await page.evaluate(() => document.getElementById('met-btn').classList.contains('on') && document.getElementById('cx-met').classList.contains('on') && document.getElementById('fs-met').classList.contains('on')),
    'the corner metronome, the clef bar button and the full-screen button all show it running');
  await page.click('#fs-met'); await page.waitForTimeout(150);
  ok(!(await metOn(page)), 'and stops it again');
  await page.click('#fb-exitmax'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => document.getElementById('ctxbar').parentNode.classList.contains('topbar') || !!document.getElementById('ctxbar').closest('header')), 'leaving full screen puts the dropdown back in the top bar');
  ok(!(await page.evaluate(() => !!document.getElementById('fs-dock') && !!document.getElementById('fs-dock').parentNode)), 'and the full-screen buttons go away');
  await page.click('#ctx-btn'); await page.waitForTimeout(150);
  ok(await visible(page, '#ctxbar #cx-scale'), 'the top bar key chip still opens it as before');
  await page.keyboard.press('Escape');

  console.log('# one metronome: the neck runner\'s Click is the metronome');
  await page.evaluate(() => { document.getElementById('fb-pr-click').checked = true; document.getElementById('fb-pr-click').dispatchEvent(new Event('change')); });
  await page.click('#fb-pr-play'); await page.waitForTimeout(400);
  ok(await metOn(page), 'Play with Click on starts the app metronome (no separate tick)');
  await page.click('#fb-pr-play'); await page.waitForTimeout(200);
  ok(!(await metOn(page)), 'Pause stops the metronome that Play started');
  await page.click('#fb-pr-play'); await page.waitForTimeout(300);
  await page.evaluate(() => App.emit('met:toggle', {})); await page.waitForTimeout(150);
  ok(!(await page.evaluate(() => document.getElementById('fb-pr-click').checked)), 'stopping the metronome anywhere during a run unticks Click');
  await page.evaluate(() => App.emit('met:toggle', {})); await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.getElementById('fb-pr-click').checked), 'starting it anywhere ticks Click again');
  await page.click('#fb-pr-play'); await page.waitForTimeout(150);
  ok(await metOn(page), 'a metronome you started yourself keeps running after Pause');
  // the runner joins a metronome that is already running: its notes land on the beat
  await page.click('#fb-pr-play'); await page.waitForTimeout(700);
  const sync = await page.evaluate(() => {
    const c = App.getAudio(), t = c.currentTime + 0.2, beat = App.metronome.nearestBeat(t), len = 60 / App.store.get('met.bpm');
    return { beat, len, ok: beat !== null };
  });
  ok(sync.ok, 'the metronome exposes its beat grid');
  const lockT = await page.evaluate(() => { const l = App.metronome.link({ running: () => false, wantClick: () => false, setClick() {} });
    const c = App.getAudio(), t = c.currentTime + 0.3, b0 = App.metronome.nearestBeat(t), len = 60 / App.store.get('met.bpm');
    const off = l.lock(b0 + len * 0.2, App.store.get('met.bpm'), true);
    const keep = l.lock(b0 + len * 0.2, App.store.get('met.bpm'), false);
    return { snapped: Math.abs(off - b0) < 1e-6, kept: Math.abs(keep - (b0 + len * 0.2)) < 1e-6 }; });
  ok(lockT.snapped && lockT.kept, 'a note on a beat snaps to the metronome grid, an off-beat note is left alone: ' + JSON.stringify(lockT));
  await page.click('#fb-pr-play'); await page.evaluate(() => App.metronome.stop()); await page.waitForTimeout(150);

  console.log('# tempo: one number everywhere');
  await setVal(page, 'fb-pr-bpm', '132'); await page.waitForTimeout(150);
  const t1 = await page.evaluate(() => ({ store: App.store.get('met.bpm'), bar: document.getElementById('cx-bpm').value, met: document.getElementById('met-bpm') ? document.getElementById('met-bpm').textContent : null }));
  ok(t1.store === 132 && t1.bar === '132', 'the Neck tempo is the metronome tempo: ' + JSON.stringify(t1));

  console.log('# keys full screen');
  await go(page, 'piano');
  ok(await visible(page, '#pn-max'), 'Keys has a full-screen button now');
  await page.click('#pn-max'); await page.waitForTimeout(300);
  const kf = await page.evaluate(() => {
    const card = document.querySelector('.pn-card'), r = card.getBoundingClientRect(), svg = document.getElementById('pn-svg').getBoundingClientRect();
    return { max: card.classList.contains('pn-max'), full: r.width >= innerWidth - 1 && r.height >= innerHeight - 1, keysH: Math.round(svg.height),
      perfHidden: document.getElementById('pn-perf').getClientRects().length === 0, practiceHidden: document.querySelector('.pn-practice').getClientRects().length === 0 };
  });
  ok(kf.max && kf.full, 'the keyboard fills the screen: ' + JSON.stringify(kf));
  ok(kf.keysH > 300, 'the keys are drawn big: ' + kf.keysH + ' px tall');
  ok(kf.perfHidden && kf.practiceHidden, 'the control rows fold away');
  ok(await visible(page, '.pn-card #fs-key') && await visible(page, '.pn-card #fs-met') && await visible(page, '#pn-exitmax') && await visible(page, '#pn-playmax'),
    'key chip, metronome, Play and exit are on screen');
  await page.click('#fs-key'); await page.waitForTimeout(150);
  ok(await visible(page, '.pn-card #ctxbar #cx-scale'), 'the scale picker opens inside the full-screen keys');
  await setVal(page, 'cx-root', '2'); await setVal(page, 'cx-scale', 'dorian'); await page.waitForTimeout(200);
  const kt = await page.evaluate(() => document.getElementById('pn-title').textContent + ' | ' + document.getElementById('fs-key').textContent);
  ok(/^D Dorian/i.test(kt) && /D dorian/i.test(kt.split('|')[1]), 'Keys redraws in the new scale: ' + kt);
  await page.mouse.click(640, 700); await page.waitForTimeout(100);
  await page.evaluate(() => { document.getElementById('pn-click').checked = true; document.getElementById('pn-click').dispatchEvent(new Event('change')); });
  await page.click('#pn-playmax'); await page.waitForTimeout(400);
  ok(await metOn(page) && await page.evaluate(() => document.getElementById('fs-met').classList.contains('on')), 'Play in full screen with Click on runs the one metronome, and its button shows it');
  await page.click('#pn-playmax'); await page.waitForTimeout(150);
  ok(!(await metOn(page)), 'Pause stops it');
  await page.click('#pn-exitmax'); await page.waitForTimeout(250);
  ok(await page.evaluate(() => !document.querySelector('.pn-card').classList.contains('pn-max') && !!document.getElementById('ctxbar').closest('header')), 'exit: Keys back to normal, dropdown back in the top bar');
  await page.click('#pn-max'); await page.waitForTimeout(200);
  await go(page, 'chords');
  ok(await page.evaluate(() => !document.querySelector('.pn-card').classList.contains('pn-max') && !!document.getElementById('ctxbar').closest('header') && document.body.style.overflow === ''),
    'leaving the page leaves full screen cleanly');

  console.log('# phone width');
  const p2 = await open(b, { width: 390, height: 844 });
  await go(p2.page, 'fretboard');
  await p2.page.click('#fb-max'); await p2.page.waitForTimeout(250);
  await p2.page.click('#fs-key'); await p2.page.waitForTimeout(150);
  const ph = await p2.page.evaluate(() => { const r = document.getElementById('ctxbar').getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: innerWidth }; });
  ok(ph.l >= 0 && ph.r <= ph.w, 'the dropdown fits a phone screen in full screen: ' + JSON.stringify(ph));
  ok(!p2.errs.length, 'no page errors (phone): ' + p2.errs.join(' | '));
  await p2.ctx.close();

  ok(!errs.length, 'no page errors: ' + errs.join(' | '));
  await ctx.close(); await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('Error', e); process.exit(1); });
