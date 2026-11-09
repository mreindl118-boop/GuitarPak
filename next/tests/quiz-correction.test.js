// Adapted from codex/natural-notes-autonext-20261020 @ 7e8884f.
// App-bus simulations only: no MIDI access, output or hardware is exercised.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(value, message) {
  console.log(value ? '  PASS' : '  FAIL', message);
  if (!value) fails++;
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM,
    args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem('guitarlab.help.seen', 'true');
    localStorage.setItem('guitarlab.help.done', 'true');
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.SLQuiz && App.active === 'quiz');
  // Only the app bus is exercised; no real MIDI permission or port is opened.
  await page.evaluate(() => {
    window.note = (on, midi, chan = 0, silent = false) =>
      App.emit('midi:note', { on, midi, chan, vel: on ? 80 : 0, silent });
    window.portNote = (on, midi, portId, chan = 0) =>
      App.emit('midi:note', { on, midi, portId, port: 'Identical keyboard name', chan, vel: on ? 80 : 0 });
    window.release = () => {
      for (let m = 0; m < 128; m++) for (let c = 0; c < 16; c++) {
        note(false, m, c); note(false, m, c, true);
      }
    };
  });

  for (const level of ['notes/nat/treble/1', 'notes/nat/treble/3']) {
    const result = await page.evaluate(level => {
      release(); SLQuiz.start(level);
      const first = SLQuiz.q, pc = first.pcAnswer == null ? first.pc : first.pcAnswer;
      const right = 60 + pc, wrong = 60 + (pc + 2) % 12;
      note(true, wrong);
      const explanation = document.getElementById('qz-fb').textContent;
      const xp = SLQuiz.cur.xp, drill = SLQuiz.cur.drillPool.slice();
      note(false, wrong); note(false, right);
      const offStayed = SLQuiz.q === first;
      note(true, wrong); note(false, wrong);
      const wrongStayed = SLQuiz.q === first;
      note(true, right, 0);
      const second = SLQuiz.q;
      // Force the next target to the same pitch, so an unsafe repeat would score it.
      if (second.kind === 'choice') second.pcAnswer = pc; else second.pc = pc;
      [1, 2, 3, 0].forEach(c => note(true, right, c));
      const repeatsBlocked = SLQuiz.q === second && !SLQuiz.cur.answered;
      [0, 1, 2].forEach(c => note(false, right, c));
      note(true, right, 0);
      const partialBlocked = !SLQuiz.cur.answered;
      note(false, right, 0); note(false, right, 3);
      const releasesStayed = SLQuiz.q === second && !SLQuiz.cur.answered;
      const missPreserved = SLQuiz.cur.res.length === 1 && SLQuiz.cur.res[0] === false &&
        SLQuiz.cur.xp === xp && JSON.stringify(SLQuiz.cur.drillPool) === JSON.stringify(drill);
      note(true, right, 0);
      return { explanation, offStayed, wrongStayed, advanced: first !== second,
        repeatsBlocked, partialBlocked, releasesStayed, missPreserved,
        freshAnswers: SLQuiz.cur.answered && SLQuiz.cur.lastOk };
    }, level);
    for (const key of ['offStayed', 'wrongStayed', 'advanced', 'repeatsBlocked',
      'partialBlocked', 'releasesStayed', 'missPreserved', 'freshAnswers']) ok(result[key], level + ': ' + key);
    ok(/^You played .+\./.test(result.explanation) && result.explanation.length > 20,
      level + ': wrong-answer explanation is visible until correction');
  }

  const tapped = await page.evaluate(() => {
    release(); SLQuiz.start('notes/nat/treble/1');
    const q = SLQuiz.q;
    SLQuiz.pick(q.choices.find(c => c.id !== q.correct).id);
    const explained = /^You chose/.test(document.getElementById('qz-fb').textContent);
    note(true, 60 + q.pcAnswer);
    return explained && SLQuiz.q !== q && SLQuiz.cur.res.join() === 'false';
  });
  ok(tapped, 'tapped wrong choice then first correct MIDI press advances, preserving miss');

  await page.evaluate(() => {
    release(); SLQuiz.start('notes/nat/treble/1');
    window.first = SLQuiz.q; window.right = 60 + first.pcAnswer;
    note(true, right);
  });
  ok(await page.evaluate(() => SLQuiz.q === first && SLQuiz.cur.lastOk), 'normal correct answer keeps feedback delay');
  await page.waitForTimeout(1550);
  const normal = await page.evaluate(() => {
    const next = SLQuiz.q;
    next.pcAnswer = right % 12;
    [0, 1, 2, 3].forEach(c => note(true, right, c));
    return next !== first && !SLQuiz.cur.answered && SLQuiz.cur.res.join() === 'true';
  });
  ok(normal, 'normal auto-next still happens once; held multichannel repeats cannot score next question');

  const tone = await page.evaluate(() => {
    release(); SLQuiz.start('notes/nat/treble/3');
    const q = SLQuiz.q, right = 60 + q.pc;
    note(true, 60 + (q.pc + 1) % 12, 15, true);
    note(true, right, 15, true);
    return SLQuiz.q !== q && SLQuiz.cur.res.join() === 'false';
  });
  ok(tone, 'tone-in correction still uses its independent input source');
  const route = await page.evaluate(() => {
    release();
    const original = Object.getOwnPropertyDescriptor(App.midi, 'inputId');
    Object.defineProperty(App.midi, 'inputId', { configurable: true, value: 'test-input-A' });
    App.emit('midi:state', {});
    SLQuiz.start('notes/nat/treble/1');
    const q = SLQuiz.q, right = 60 + q.pcAnswer;
    note(true, 60 + (q.pcAnswer + 2) % 12); note(true, right);
    SLQuiz.q.pcAnswer = right % 12;
    App.emit('midi:state', { outputName: 'changed output' });
    note(true, right);
    const outputStayedBlocked = !SLQuiz.cur.answered;
    Object.defineProperty(App.midi, 'inputId', { configurable: true, value: 'test-input-B' });
    App.emit('midi:state', {}); note(true, right);
    const replacementAnswers = SLQuiz.cur.answered && SLQuiz.cur.lastOk;
    Object.defineProperty(App.midi, 'inputId', original);
    App.emit('midi:state', {});
    return { outputStayedBlocked, replacementAnswers };
  });
  ok(route.outputStayedBlocked, 'output-only state change does not re-arm held MIDI key');
  ok(route.replacementAnswers, 'changed input clears stale held notes when old route cannot send releases');

  const multiport = await page.evaluate(() => {
    release(); SLQuiz.start('notes/nat/treble/1');
    const q = SLQuiz.q, right = 60 + q.pcAnswer, wrong = 60 + (q.pcAnswer + 2) % 12;
    portNote(true, wrong, 'A'); portNote(false, wrong, 'A');
    portNote(true, right, 'A');
    const next = SLQuiz.q; next.pcAnswer = right % 12;
    portNote(true, right, 'A', 1);
    portNote(false, right, 'B'); // another keyboard's release cannot re-arm A
    portNote(true, right, 'A');
    const unrelatedReleaseBlocked = !SLQuiz.cur.answered;
    portNote(false, right, 'A');
    portNote(true, right, 'A', 2);
    const remainingChannelBlocked = !SLQuiz.cur.answered;
    portNote(true, right, 'B'); // a separate physical keyboard is a fresh press
    const independentKeyboardAnswers = SLQuiz.cur.answered && SLQuiz.cur.lastOk;
    [0, 1, 2].forEach(c => portNote(false, right, 'A', c));
    portNote(false, right, 'B');
    return { corrected: q !== next, unrelatedReleaseBlocked, remainingChannelBlocked,
      independentKeyboardAnswers, history: SLQuiz.cur.res.join() };
  });
  ok(multiport.corrected, 'first fresh correction advances with a stable input-port identity');
  ok(multiport.unrelatedReleaseBlocked, 'same-name keyboard B cannot release keyboard A held key');
  ok(multiport.remainingChannelBlocked, 'a remaining MPE/layer channel on keyboard A blocks repeats');
  ok(multiport.independentKeyboardAnswers, 'fresh strike on keyboard B answers independently of held keyboard A');
  ok(multiport.history === 'false,true', 'multiple-port correction retains original miss and grades next question once');

  const inventory = await page.evaluate(() => {
    release();
    const saved = {};
    ['inputId', 'inputs', 'ready'].forEach(k => { saved[k] = Object.getOwnPropertyDescriptor(App.midi, k); });
    Object.defineProperties(App.midi, {
      inputId: { configurable: true, value: 'all' },
      ready: { configurable: true, value: true },
      inputs: { configurable: true, value: [{ id: 'A' }, { id: 'B' }] }
    });
    App.emit('midi:state', {});
    SLQuiz.start('notes/nat/treble/1');
    const q = SLQuiz.q, right = 60 + q.pcAnswer;
    note(true, 60 + (q.pcAnswer + 2) % 12); portNote(true, right, 'A');
    SLQuiz.q.pcAnswer = right % 12;
    App.emit('midi:state', { outputName: 'new output' });
    portNote(true, right, 'A');
    const outputChangeBlocked = !SLQuiz.cur.answered;
    Object.defineProperty(App.midi, 'inputs', { configurable: true, value: [{ id: 'B' }] });
    App.emit('midi:state', {});
    Object.defineProperty(App.midi, 'inputs', { configurable: true, value: [{ id: 'A' }, { id: 'B' }] });
    App.emit('midi:state', {}); portNote(true, right, 'A');
    const reconnectedInputAnswers = SLQuiz.cur.answered && SLQuiz.cur.lastOk;
    portNote(false, right, 'A');
    Object.keys(saved).forEach(k => Object.defineProperty(App.midi, k, saved[k]));
    App.emit('midi:state', {}); release();
    return { outputChangeBlocked, reconnectedInputAnswers };
  });
  ok(inventory.outputChangeBlocked, 'All keyboards output/inventory refresh retains connected held notes');
  ok(inventory.reconnectedInputAnswers, 'disconnected source loses stale holds so a reconnected input can answer');
  ok(errors.length === 0, 'no page errors: ' + errors.join('; '));
  await browser.close();
  console.log(fails ? 'FAILED: ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
