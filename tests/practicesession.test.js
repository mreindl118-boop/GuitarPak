// Practice session (js/practicesession.js): the card on Learn > Plan, the
// split of minutes over picked instruments, Voice riding on an instrument,
// the top-bar countdown, the check-in, and that nothing starts by itself.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

async function open(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1200, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('__ps_seeded')) return;
    sessionStorage.setItem('__ps_seeded', '1');
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
  });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.practiceSession && App.practicePlan && App.active);
  return { ctx, page, errs };
}
const S = page => page.evaluate(() => App.practiceSession.state());
const mins = s => s.parts.map(p => p.blocks.reduce((a, b) => a + b.min, 0));

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  let { ctx, page, errs } = await open(browser);

  console.log('# nothing starts by itself');
  let boot = await page.evaluate(() => ({ chip: document.getElementById('ps-chip'), hidden: document.getElementById('ps-chip') && document.getElementById('ps-chip').hidden, run: App.store.get('ps.run', null), page: App.active, check: !!document.getElementById('ps-check') }));
  ok(boot.chip && boot.hidden && !boot.run && !boot.check, 'boot shows no countdown, no check-in and no running block');
  ok(boot.page !== 'practiceplan', 'the app still opens on its usual home page');

  console.log('# the card lives on Learn > Plan');
  await page.evaluate(() => { App.practiceSession._weekday(1); App.switchTo('practiceplan'); });
  let dom = await page.evaluate(() => ({ card: !!document.querySelector('#panel-practiceplan #ps-card'), before: document.getElementById('ps-card').compareDocumentPosition(document.getElementById('pp-today')) & 4, picks: [...document.querySelectorAll('[data-ps-inst]')].map(b => b.dataset.psInst + ':' + b.getAttribute('aria-pressed')), pages: [...document.querySelectorAll('#subnav .subtab')].map(b => b.dataset.page) }));
  ok(dom.card && dom.before, 'the session card is the first card of the Plan page');
  ok(dom.picks.join() === 'guitar:true,keys:false,bass:false,voice:false', 'Monday suggests guitar, one instrument');
  ok(dom.pages.indexOf('practicesession') < 0, 'no new page or pill was added');

  console.log('# minutes are split over the picked instruments');
  let s = await S(page);
  ok(s.parts.length === 1 && s.minutes === mins(s)[0], 'one instrument uses all the minutes (' + s.minutes + ')');
  await page.click('[data-ps-inst="keys"]'); await page.click('[data-ps-inst="bass"]'); await page.click('[data-ps-inst="guitar"]');
  await page.click('[data-ps-len="45"]');
  s = await S(page);
  ok(s.picks.join() === 'keys,bass' && s.minutes === 45, 'keys + bass at 45 minutes');
  ok(mins(s).join() === '23,22', 'the time splits evenly into two parts (' + mins(s).join(' + ') + ')');
  ok(s.parts.every(p => p.blocks.every(b => b.min >= 2)), 'every block keeps at least 2 minutes');
  await page.click('[data-ps-len="10"]');
  s = await S(page);
  ok(s.minutes === 10 && mins(s).join() === '5,5' && s.parts.every(p => p.blocks.every(b => b.core)), 'a short session keeps only the core blocks');
  await page.click('[data-ps-step="5"]');
  ok((await S(page)).minutes === 15, 'the + button adds 5 minutes');
  await page.click('[data-ps-inst="bass"]'); await page.click('[data-ps-inst="keys"]');
  s = await S(page);
  ok(s.picks.join() === 'keys', 'the last instrument cannot be switched off');

  console.log('# voice rides on an instrument');
  await page.click('[data-ps-inst="guitar"]'); await page.click('[data-ps-inst="keys"]'); await page.click('[data-ps-inst="voice"]'); await page.click('[data-ps-len="45"]');
  s = await S(page);
  ok(s.sing === 'guitar' && s.parts.map(p => p.name).join('|') === 'Guitar: scales + lead|Sing + play: Guitar', 'guitar + voice = a guitar part, then sing while you play');
  await page.click('[data-ps-sing=""]');
  s = await S(page);
  ok(s.sing === '' && s.parts[1].name === 'Voice' && s.minutes === 45, 'On its own = plain voice practice, the minutes stay');
  await page.click('[data-ps-sing="guitar"]');

  console.log('# a block opens its tool, already set up, with a countdown');
  await page.click('[data-ps-inst="voice"]'); await page.click('[data-ps-len="20"]');
  await page.click('[data-ps-open="guitar.scale"]');
  await page.waitForFunction(() => App.active === 'fretboard');
  let run = await page.evaluate(() => ({ page: App.active, root: App.store.get('fb.root'), scale: App.store.get('fb.scale'), bpm: App.store.get('met.bpm'), chip: document.getElementById('ps-chip').textContent, hidden: document.getElementById('ps-chip').hidden, inst: App.practiceInstrument.get(), toast: (document.getElementById('app-toast') || {}).textContent, run: App.practiceSession.state().run }));
  ok(run.page === 'fretboard' && run.root === 9 && run.scale === 'minorPent' && run.bpm === 60, 'Scale runner opens the Neck in A minor pentatonic at 60');
  ok(!run.hidden && /^\d+:\d\d$/.test(run.chip), 'the top bar shows the countdown (' + run.chip + ')');
  ok(run.inst === 'guitar', 'the Learn category follows the instrument');
  ok(/3 clean runs/.test(run.toast || ''), 'a one-line hint says what to do');
  ok(run.run && run.run.running && Math.abs(run.run.leftMs - run.run.total) < 3000, 'the block clock is running');

  console.log('# pause, +1 min, and back to the session from the chip');
  await page.click('#ps-chip');
  ok(await page.evaluate(() => App.active === 'practiceplan'), 'the chip opens the session card');
  await page.click('#ps-toggle');
  let p1 = (await S(page)).run; await page.waitForTimeout(700); let p2 = (await S(page)).run;
  ok(!p1.running && p1.leftMs === p2.leftMs, 'Pause holds the clock');
  await page.click('#ps-plus');
  ok((await S(page)).run.leftMs === p1.leftMs + 60000, '+1 min adds a minute');
  await page.click('#ps-toggle');

  console.log('# time up -> check-in -> next block');
  await page.evaluate(() => App.practiceSession._skip(60 * 60000));
  await page.waitForSelector('#ps-check:not([hidden])');
  let chk = await page.evaluate(() => ({ title: document.getElementById('ps-check-h').textContent, go: document.getElementById('ps-go').disabled, chip: document.getElementById('ps-chip').textContent, modal: document.getElementById('ps-check').getAttribute('aria-modal') }));
  ok(chk.title === 'Scale runner' && chk.go && chk.modal === 'true', 'the check-in asks about the block; Next waits for both answers');
  ok(/Time/.test(chk.chip), 'the chip says the time is up');
  await page.click('[data-ps-focus="2"]'); await page.click('[data-ps-fit="hard"]');
  ok(/drop 10 BPM/.test(await page.textContent('#ps-check .ps-tip')), 'too hard gives the slow-down advice');
  await page.fill('#ps-note', '60 BPM shaky');
  let nextLabel = await page.textContent('#ps-go');
  await page.click('#ps-go');
  await page.waitForFunction(() => document.getElementById('ps-check').hidden);
  s = await S(page);
  let st = s.log.blocks['guitar.scale'];
  ok(st && st.done && st.focus === 2 && st.fit === 'hard' && st.note === '60 BPM shaky', 'the check-in is saved with the block');
  ok(/^Next: /.test(nextLabel) && s.run && s.run.uid !== 'guitar.scale' && s.run.running, 'Next starts the following block right away');
  ok(await page.evaluate(() => App.active !== 'practiceplan'), 'and opens its tool');

  console.log('# I’m done, finish, streak');
  for (let i = 0; i < 6; i++) {
    const cur = (await S(page)).run; if (!cur) break;
    await page.evaluate(() => App.practiceSession.finish(false));
    await page.click('[data-ps-focus="3"]'); await page.click('[data-ps-fit="right"]'); await page.click('#ps-go');
    await page.waitForFunction(() => document.getElementById('ps-check').hidden);
  }
  s = await S(page);
  ok(!s.run && s.parts.every(p => p.blocks.every(b => s.log.blocks[b.uid] && s.log.blocks[b.uid].done)), 'every block ends checked in');
  ok(s.streak === 1, 'the day counts toward the streak');
  ok(await page.evaluate(() => App.active === 'practiceplan' && /Session done/.test(document.getElementById('ps-card').textContent) && document.getElementById('ps-chip').hidden), 'the card says the session is done and the chip is gone');

  console.log('# teacher notes become the Keys part');
  await page.evaluate(() => {
    App.practiceInstrument.set('piano'); App.switchTo('practiceplan');
    App.practicePlan.preview('G major scale, hands separate, 5 min\nPractice your piece, 5 min', { instrument: 'piano' }); App.practicePlan.accept();
    App.practiceSession.setPicks(['keys']);
  });
  s = await S(page);
  ok(/teacher/.test(s.parts[0].name) && s.parts[0].blocks.length === 3 && s.parts[0].blocks.every(b => b.planItem), 'an accepted plan supplies the Keys blocks (' + s.parts[0].blocks.map(b => b.title).join(', ') + ')');
  let before = await page.evaluate(() => App.practicePlan.state().session.last || null);
  await page.click('[data-ps-open="' + s.parts[0].blocks[0].uid + '"]');
  let after = await page.evaluate(() => ({ last: App.practicePlan.state().session.last, page: App.active }));
  ok(after.last === s.parts[0].blocks[0].planItem && after.last !== before, 'starting it launches the Plan block, so measured completion still applies');

  console.log('# a reload never restarts the clock or sound');
  await page.reload();
  await page.waitForFunction(() => window.App && App.practiceSession && App.active);
  let re = await page.evaluate(() => ({ run: App.practiceSession.state().run, chip: document.getElementById('ps-chip').className, hidden: document.getElementById('ps-chip').hidden, check: !!document.getElementById('ps-check') }));
  ok(re.run && !re.run.running && !re.hidden && /ps-paused/.test(re.chip) && !re.check, 'the block comes back paused, with its chip, and no dialog');

  console.log('# phone width');
  await ctx.close();
  ({ ctx, page, errs } = await open(browser, { width: 390, height: 800 }));
  await page.evaluate(() => { App.switchTo('practiceplan'); App.practiceSession.setPicks(['guitar', 'keys', 'voice']); });
  let ph = await page.evaluate(() => ({ over: document.documentElement.scrollWidth > window.innerWidth + 1, card: document.getElementById('ps-card').getBoundingClientRect().width, tap: Math.min(...[...document.querySelectorAll('#ps-card button')].filter(b => b.offsetParent).map(b => b.getBoundingClientRect().height)) }));
  ok(!ph.over && ph.card <= 390, 'the card fits a phone with no sideways scroll');
  ok(ph.tap >= 40, 'every control is finger-sized (' + Math.round(ph.tap) + 'px)');
  await page.click('#ps-start');
  let tb = await page.evaluate(() => { var c = document.getElementById('ps-chip').getBoundingClientRect(); return { right: c.right, w: window.innerWidth, over: document.documentElement.scrollWidth > window.innerWidth + 1, vis: c.width > 0 }; });
  ok(tb.vis && tb.right <= tb.w + 1 && !tb.over, 'the countdown chip fits the phone top bar');

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('Error', e); process.exit(1); });
