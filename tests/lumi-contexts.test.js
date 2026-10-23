// Full app, real shared LED renderer, simulated Web MIDI ports only.
// The synth is an independent input; no LUMI input or hardware is required.
const { chromium } = require('playwright');
const env = require('./env');
let checks = 0;
function ok(value, message) {
  if (!value) throw new Error(message);
  checks++; console.log('  PASS', message);
}
function targetFrame(frame) {
  return frame.now.length && frame.now.every(n => frame.lit.includes(n)) &&
    frame.lit.every(n => frame.now.includes(n) || frame.next.includes(n));
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      const seed = { 'help.seen': true, 'help.done': true, 'qz.landed': true, 'fb.root': 0, 'fb.scale': 'major',
        'fb.mode': 1, 'pn.hand': 'right', 'pn.pr.guide': true, 'pn.pr.sound': false, 'fb.pr.sound': false,
        'qz.sound': false, 'kl.dbltap': false, 'met.bpm': 240, 'pn.pr.rate': 4, 'fb.pr.rate': 4, 'midi.rangeLo': 48 };
      Object.keys(seed).forEach(k => localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k])));
      window.__sent = []; window.__epoch = 0;
      class Port extends EventTarget {
        constructor(id, name) { super(); this.id = id; this.name = name; this.state = 'connected'; this.onmidimessage = null; }
        send(bytes) { __sent.push({ id: this.id, bytes: Array.from(bytes), epoch: __epoch }); }
        receive(bytes) {
          const e = new Event('midimessage'); Object.defineProperty(e, 'data', { value: new Uint8Array(bytes) });
          if (this.onmidimessage) this.onmidimessage(e);
          this.dispatchEvent(e);
        }
      }
      window.__synth = new Port('synth-in', 'Separate practice synth');
      window.__lumi = new Port('lumi-out', 'LUMI Keys BLOCK');
      window.__access = { inputs: new Map([['synth-in', __synth]]), outputs: new Map([['lumi-out', __lumi]]), sysexEnabled: true };
      navigator.requestMIDIAccess = () => Promise.resolve(__access);
      window.__play = n => { __synth.receive([0x90, n, 100]); __synth.receive([0x80, n, 0]); };
      window.__lit = () => {
        const lit = {};
        __sent.filter(e => e.id === 'lumi-out' && e.epoch === __epoch).forEach(e => {
          const b = e.bytes, type = b[0] & 0xf0;
          if (type === 0x90 && b[2]) lit[b[1]] = b[2];
          if (type === 0x80 || (type === 0x90 && !b[2])) delete lit[b[1]];
        });
        return Object.keys(lit).map(Number).sort((a, b) => a - b);
      };
      window.__change = (id, value) => { const el = document.getElementById(id); el.value = value; el.dispatchEvent(new Event('change')); };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(env.URL);
    await page.waitForFunction(() => window.App && App.keysLessons && App.midi.setDisplayEnabled && window.SLQuiz && SLQuiz.lumiState);
    await page.evaluate(async () => {
      await App.midi.enable(); App.midi.setDisplayOutput('lumi-out'); App.midi.setInput('synth-in');
      App.midi.setDisplayEnabled(true); App.help.set(0); App.scaleLock.set(false);
      window.__guide = { now: [], next: [] }; window.__guides = [];
      const guide = App.midi.guide;
      App.midi.guide = function (now, next) {
        const list = v => v == null || v === -1 ? [] : (Array.isArray(v) ? v.slice() : [v]);
        __guide = { now: list(now), next: list(next) }; __guides.push(__guide);
        return guide.apply(this, arguments);
      };
      window.__frame = () => ({ sourceNow: __guide.now.slice(), sourceNext: __guide.next.slice(),
        now: [...new Set(__guide.now.map(App.midi.fold))], next: [...new Set(__guide.next.map(App.midi.fold))], lit: __lit() });
      window.__masterCycle = () => {
        const now = __guide.now.join(); App.midi.setDisplayEnabled(false);
        const dark = __lit().length === 0; App.midi.setDisplayEnabled(true);
        return { dark, retained: now === __guide.now.join(), frame: __frame() };
      };
    });

    console.log('# scale practice: exact targets, repeat, feedback and master lifecycle');
    const scale = await page.evaluate(() => {
      App.switchTo('piano'); document.getElementById('pn-play').click();
      return { frame: __frame(), path: App.keys.path().map(n => n.midi), status: document.getElementById('pn-status').textContent };
    });
    ok(scale.frame.sourceNow[0] === scale.path[0] && targetFrame(scale.frame) && scale.frame.lit.length <= 2,
      'scale Guide lights the actual first/next notes at Help None, replacing the allowed-scale background');
    const wrong = await page.evaluate(() => {
      __play(49); return { frame: __frame(), text: document.getElementById('pn-status').textContent,
        marked: document.querySelector('.pn-key[data-midi="49"]').classList.contains('pn-hit-bad') };
    });
    ok(wrong.frame.sourceNow[0] === scale.path[0] && /Wrong note/.test(wrong.text) && wrong.marked && targetFrame(wrong.frame),
      'wrong synth input leaves the target unchanged and gives text plus a key outline');
    const correct = await page.evaluate(() => {
      __play(__guide.now[0]); return { frame: __frame(), text: document.getElementById('pn-status').textContent,
        marked: document.querySelector('.pn-key[data-midi="48"]').classList.contains('pn-hit-ok') };
    });
    ok(correct.frame.sourceNow[0] === scale.path[1] && correct.marked && targetFrame(correct.frame),
      'correct synth input advances to the next structured scale target');
    const repeat = await page.evaluate(() => {
      const count = App.keys.path().length;
      for (let i = 1; i < count; i++) __play(__guide.now[0]);
      return __frame();
    });
    ok(repeat.sourceNow[0] === scale.path[0] && targetFrame(repeat), 'completing the scale repeats from its first note');
    const master = await page.evaluate(() => {
      App.ctx(true); document.getElementById('cx-led').click();
      const off = __lit().length === 0;
      __play(__guide.now[0]); const target = __guide.now[0], silent = __lit().length === 0;
      document.getElementById('cx-led').click();
      return { off, silent, target, frame: __frame(), on: App.midi.displayEnabled };
    });
    ok(master.off && master.silent && master.on && master.frame.sourceNow[0] === master.target && targetFrame(master.frame),
      'sole clef master OFF suppresses frames while practice advances; ON paints the current target');
    const root = await page.evaluate(() => {
      App.emit('fb:set', { source: 'test', root: 2, scale: 'major', mode: 1 });
      return { frame: __frame(), path: App.keys.path().map(n => n.midi) };
    });
    ok(root.frame.sourceNow[0] === root.path[0] && root.frame.sourceNow[0] % 12 === 2 && targetFrame(root.frame),
      'changing root rebuilds the live waiting target and releases the previous key');
    const octave = await page.evaluate(() => {
      App.emit('fb:set', { source: 'test', root: 0, scale: 'major', mode: 1 }); App.keys.setHand('left');
      const target = __guide.now[0], hint = document.getElementById('pn-status').textContent;
      __play(App.midi.fold(target));
      return { target, hint, frame: __frame(), text: document.getElementById('pn-status').textContent };
    });
    ok(octave.target === 36 && /named octave/.test(octave.hint) && /Wrong octave/.test(octave.text) && octave.frame.sourceNow[0] === 36,
      'folded LUMI lights are labelled as pitch class; playing the wrong synth octave cannot silently advance: ' + JSON.stringify(octave));
    const pause = await page.evaluate(() => {
      document.getElementById('pn-play').click(); const paused = __guide.now.length === 0 && __lit().length === 14;
      document.getElementById('pn-play').click(); const resumed = __frame();
      document.getElementById('pn-reset').click(); return { paused, resumed, stopped: __guide.now.length === 0 };
    });
    ok(pause.paused && targetFrame(pause.resumed) && pause.stopped, 'pause/resume/stop clear and restore only the active scale instruction');

    console.log('# sheet music: actual shared exercise pitches and clock');
    const sheet = await page.evaluate(() => {
      App.keys.setHand('right'); App.switchTo('notation'); document.querySelector('#panel-notation .fb-alt-play').click();
      const before = __guide.now.join(); __play(61);
      return { frame: __frame(), count: document.querySelectorAll('#panel-notation [data-step]').length, unchanged: before === __guide.now.join() };
    });
    ok(sheet.count > 0 && targetFrame(sheet.frame), 'sheet music starts with a structured score target before audio playback');
    ok(sheet.unchanged, 'wrong input does not invent a judgment or advance the timed score playhead');
    const sheetMaster = await page.evaluate(() => __masterCycle());
    ok(sheetMaster.dark && sheetMaster.retained && targetFrame(sheetMaster.frame), 'sheet target survives sole-master OFF/ON without restoring the whole scale over it');
    const sheetFirst = sheet.frame.sourceNow[0];
    await page.waitForFunction(first => __guide.now.length && __guide.now[0] !== first, sheetFirst);
    ok(targetFrame(await page.evaluate(() => __frame())), 'timed score advancement sends the current note and upcoming note through the renderer');
    const sheetPause = await page.evaluate(() => {
      document.querySelector('#panel-notation .fb-alt-play').click(); return { empty: __guide.now.length === 0, lit: __lit().length };
    });
    ok(sheetPause.empty && sheetPause.lit === 14, 'sheet pause removes guide targets and restores the selected-scale background');
    const sheetReset = await page.evaluate(() => {
      document.querySelector('#panel-notation .fb-alt-reset').click(); document.querySelector('#panel-notation .fb-alt-play').click();
      return __frame();
    });
    ok(sheetReset.sourceNow[0] === sheetFirst && targetFrame(sheetReset), 'sheet reset/repeat starts from the actual first score note');
    await page.evaluate(() => App.switchTo('tab'));
    await page.waitForTimeout(40);
    ok(targetFrame(await page.evaluate(() => __frame())), 'changing between notation and tab preserves their shared running instruction');
    await page.evaluate(() => { App.switchTo('piano'); document.getElementById('pn-play').click(); });
    await page.waitForTimeout(40);
    const ownership = await page.evaluate(() => __frame());
    ok(ownership.sourceNow[0] === 48 && targetFrame(ownership), 'leaving the score cannot erase an incoming piano target during deferred transport cleanup');
    await page.evaluate(() => { document.getElementById('pn-reset').click(); App.switchTo('notation'); });
    const noScore = await page.evaluate(() => {
      const path = Theory.exercisePath;
      Theory.exercisePath = () => [];
      try { document.querySelector('#panel-notation .fb-alt-play').click(); }
      finally { Theory.exercisePath = path; }
      return { frame: __frame(), text: document.querySelector('#panel-notation .fb-alt-status').textContent };
    });
    ok(noScore.frame.sourceNow.length === 0 && /no notes/i.test(noScore.text), 'empty structured score data reports no notes without fabricating targets');

    console.log('# lessons: count-in targets, played answers, stop and repeat');
    const lesson = await page.evaluate(() => {
      App.switchTo('piano'); App.keys.setHand('right'); App.store.set('kl.sel', 'c-r'); App.store.set('kl.reps', 1);
      App.store.set('kl.prog', { 'c-r': { step: 9 } }); App.keysLessons.start(false);
      return { frame: __frame(), targets: App.keysLessons.run.targets.slice(0, 2).map(t => t.midi) };
    });
    ok(lesson.frame.sourceNow[0] === lesson.targets[0] && targetFrame(lesson.frame), 'lesson count-in lights its actual scheduled first note at Help None');
    const lessonMaster = await page.evaluate(() => __masterCycle());
    ok(lessonMaster.dark && lessonMaster.retained && targetFrame(lessonMaster.frame), 'lesson count-in target survives master OFF/ON');
    const judged = await page.evaluate(async () => {
      const R = App.keysLessons.run, first = R.targets[0];
      const deadline = performance.now() + 8000;
      while (R.ctx.currentTime < first.at + R.lat) {
        if (performance.now() > deadline) throw new Error('Lesson audio clock stalled');
        await new Promise(r => setTimeout(r, 5));
      }
      __play(first.midi + 1);
      const wrong = { count: R.wrong, target: __guide.now[0], text: document.getElementById('kl-call').textContent };
      __play(first.midi); App.keysLessons.tick();
      return { wrong, hit: first.j, frame: __frame(), targets: R.targets.slice(0, 3).map(t => t.midi) };
    });
    ok(judged.wrong.count === 1 && judged.wrong.target === judged.targets[0] && /Wrong note/i.test(judged.wrong.text),
      'lesson wrong input gives explicit feedback and preserves its scheduled target');
    ok(judged.hit && judged.hit !== 'miss' && judged.frame.sourceNow[0] === judged.targets[1] && targetFrame(judged.frame),
      'lesson correct input advances the actual judged target and LED frame');
    const lessonStop = await page.evaluate(() => {
      App.keysLessons.stop(); const empty = __guide.now.length === 0;
      App.keysLessons.start(false); const repeated = __frame();
      App.switchTo('fretboard'); return { empty, repeated, stopped: !App.keysLessons.run, frame: __frame() };
    });
    ok(lessonStop.empty && targetFrame(lessonStop.repeated) && lessonStop.stopped && !lessonStop.frame.sourceNow.length,
      'lesson stop/repeat and navigation release the lesson guide');

    console.log('# Exercises: structured answer hints and unsupported theory');
    const exercise = await page.evaluate(() => {
      App.switchTo('quiz'); SLQuiz.start('notes/nat/treble/1');
      return { frame: __frame(), state: SLQuiz.lumiState(), target: SLQuiz.lumiTargets(), q: SLQuiz.q };
    });
    ok(exercise.state.active && exercise.target.join() === exercise.frame.sourceNow.join() && targetFrame(exercise.frame),
      'Exercises display the structured answer pitch through the same renderer');
    const exerciseMaster = await page.evaluate(() => __masterCycle());
    ok(exerciseMaster.dark && exerciseMaster.retained && targetFrame(exerciseMaster.frame), 'Exercise target survives master OFF/ON');
    const answer = await page.evaluate(() => {
      const q = SLQuiz.q; SLQuiz.pick(q.choices.find(c => c.id !== q.correct).id);
      return { answered: SLQuiz.cur.answered, ok: SLQuiz.cur.lastOk, text: document.getElementById('qz-fb').textContent, lit: __lit() };
    });
    ok(answer.answered && !answer.ok && /You chose|Not quite/.test(answer.text) && answer.lit.length > 0,
      'wrong exercise answers keep explicit text feedback and illuminate the answer');
    const nextExercise = await page.evaluate(() => {
      document.getElementById('qz-act').click(); return { frame: __frame(), target: SLQuiz.lumiTargets() };
    });
    ok(nextExercise.target.join() === nextExercise.frame.sourceNow.join() && targetFrame(nextExercise.frame),
      'advancing Exercises cancels old feedback and paints the new answer target');
    const covered = await page.evaluate(() => {
      App.switchTo('lights'); return { empty: __guide.now.length === 0, sheet: App.sheet };
    });
    ok(covered.empty && covered.sheet, 'opening a utility sheet pauses the covered exercise guide');
    await page.evaluate(() => App.closeSheet());
    ok(targetFrame(await page.evaluate(() => __frame())), 'closing the utility sheet restores the current exercise target');
    const unsupported = await page.evaluate(() => {
      const lid = SLQuiz.levels().find(lid => lid.includes('/ksh/theory/'));
      if (!lid) throw new Error('No structured key-signature theory level found');
      SLQuiz.start(lid);
      return { state: SLQuiz.lumiState(), frame: __frame(), message: document.getElementById('qz-lumi-hint').textContent,
        visible: !document.getElementById('qz-lumi-hint').hidden };
    });
    ok(!unsupported.state.supported && !unsupported.frame.sourceNow.length && unsupported.visible && /no.*pitch|no.*note/i.test(unsupported.message),
      'word-only theory questions expose unsupported pitch data and clear the prior guide');

    console.log('# song imports: structured chords, clock, audition and cleanup');
    const song = await page.evaluate(() => {
      App.switchTo('songs'); document.getElementById('sg-paste').value =
        ['e|-------------|', 'B|-------------|', 'G|-------------|', 'D|-2---3---5---|', 'A|-3---5---7---|', 'E|-------------|'].join('\n');
      document.getElementById('sg-parse').click(); document.getElementById('sg-play').click();
      return __frame();
    });
    ok(song.sourceNow.length === 2 && song.sourceNow.includes(48) && song.sourceNow.includes(52) && targetFrame(song),
      'imported tab chord targets use both parsed pitches, with no inferred PDF/audio notes');
    await page.waitForFunction(() => __guide.now.includes(50));
    ok(targetFrame(await page.evaluate(() => __frame())), 'song playback advances its actual next chord');
    const songStop = await page.evaluate(() => {
      document.getElementById('sg-reset').click(); const stopped = !__guide.now.length;
      document.querySelector('#sg-tabout [data-sgstep="1"]').click(); const audition = __frame();
      App.switchTo('piano'); return { stopped, audition, empty: !__guide.now.length };
    });
    ok(songStop.stopped && targetFrame(songStop.audition) && songStop.empty,
      'song stop and paused step audition each clean up on navigation');

    console.log('# disconnected display: no sends, current target recovery');
    const disconnected = await page.evaluate(() => {
      document.getElementById('pn-play').click();
      __lumi.state = 'disconnected'; __access.onstatechange({ port: __lumi });
      const start = __sent.length; __play(__guide.now[0]); App.midi.repaint();
      return { count: __sent.length - start, target: __guide.now[0], state: App.midi.displayState };
    });
    ok(!disconnected.state.connected && disconnected.count === 0, 'disconnected display receives no frames while independent synth practice continues');
    const reconnected = await page.evaluate(() => {
      __epoch++; __lumi.state = 'connected'; __access.onstatechange({ port: __lumi });
      return { frame: __frame(), state: App.midi.displayState, input: App.midi.inputId };
    });
    ok(reconnected.state.connected && reconnected.input === 'synth-in' && reconnected.frame.sourceNow[0] === disconnected.target && targetFrame(reconnected.frame),
      'reconnect restores the current target without substituting LUMI as the performance input');
    await page.screenshot({ path: '/tmp/soundlab-lumi-contexts.png', fullPage: true });
    await page.evaluate(() => { App.midi.setDisplayEnabled(false); document.getElementById('pn-reset').click(); });
    ok((await page.evaluate(() => __lit())).length === 0, 'master OFF plus stop leaves the simulated display dark');
    ok(!errors.length, 'no browser runtime errors: ' + errors.join('; '));
    await context.close();
    console.log(`PASS ${checks} instructional context checks (simulated MIDI; hardware unverified)`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
