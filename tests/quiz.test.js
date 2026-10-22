const { chromium } = require('playwright');
const env = require('./env');
const URL = env.URL;
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

async function newPage(browser, seed, locked) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  if (locked) await ctx.addInitScript(() => {
    // emulate a browser autoplay lock: contexts start suspended and only
    // resume after a real user gesture
    const Orig = window.AudioContext;
    const W = function (o) {
      const c = new Orig(o); c.suspend();
      const r = c.resume.bind(c);
      c.resume = function () { return window.__gest ? r() : Promise.resolve(); };
      return c;
    };
    W.prototype = Orig.prototype;
    window.AudioContext = W;
    // page.evaluate counts as user activation in Playwright, so track REAL input
    ['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, e => { if (e.isTrusted) window.__gest = true; }, true));
  });
  await ctx.addInitScript((seed) => {
    localStorage.setItem('guitarlab.help.seen', 'true');
    localStorage.setItem('guitarlab.help.done', 'true');
    for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
    window.__comp = 0;
    const P = (window.BaseAudioContext || window.AudioContext).prototype;
    const orig = P.createDynamicsCompressor;
    P.createDynamicsCompressor = function () { window.__comp++; return orig.apply(this, arguments); };
  }, seed || {});
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const u = (m.location() && m.location().url) || '';
    if (/Failed to load resource/.test(m.text()) && !/127\.0\.0\.1/.test(u)) return; // update check behind the sandbox proxy
    errs.push('console: ' + m.text() + ' @' + u);
  });
  await page.goto(URL);
  await page.waitForFunction(() => window.App && window.SLQuiz && App.active);
  return { ctx, page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });

  console.log('# landing + nav');
  let { ctx, page, errs } = await newPage(browser);
  await page.waitForFunction(() => App.active === 'quiz', null, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => App.active) === 'quiz', 'first launch lands on Exercises');
  const nav = await page.evaluate(() => ({ v: (document.querySelector('#tabbar .tabbar-btn.active') || {}).textContent,
    first: document.querySelector('#tabbar .tabbar-btn').textContent,
    pills: [...document.querySelectorAll('#subnav .subtab')].map(b => b.textContent) }));
  ok(nav.v === 'Learn' && nav.first === 'Learn', 'Learn tab first + active: ' + JSON.stringify(nav));
  ok(nav.pills.join('|') === 'Exercises|Chords|Circle', 'pill strip: ' + nav.pills.join('|'));
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('guitarlab.qz.landed'))) === true, 'qz.landed stored');
  ok(await page.evaluate(() => !!document.querySelector('.qz-path') && !!document.querySelector('.qz-strip')), 'home opens on the path with the stats strip');
  await page.evaluate(() => document.querySelector('[data-qzh="topics"]').click());
  const topics = await page.$$eval('.qz-topic .qz-tname', a => a.map(x => x.textContent));
  ok(topics.join(',') === 'Notes,Intervals,Chords,Scales,Key signatures', 'topics: ' + topics.join(','));

  console.log('# font');
  const font = await page.evaluate(async () => { await document.fonts.load('48px SLMusic'); return document.fonts.check('48px SLMusic'); });
  ok(font, 'SLMusic font loads');

  console.log('# generator sweep');
  const sweep = await page.evaluate(() => {
    const out = { levels: SLQuiz.levels().length, bad: [], n: 0 };
    const dbl = /♯♯|♭♭/;
    for (const lid of SLQuiz.levels()) {
      for (let i = 0; i < 80; i++) {
        let q;
        try { q = SLQuiz.gen(lid); } catch (e) { out.bad.push(lid + ' threw ' + e.message); break; }
        out.n++;
        const fail = (m) => { if (out.bad.length < 40) out.bad.push(lid + ': ' + m + ' :: ' + JSON.stringify({ p: q.prompt, c: q.correct, ch: q.choices && q.choices.map(c => c.label) })); };
        if (!q.prompt) fail('no prompt');
        if (!/^(choice|single|set)$/.test(q.kind)) fail('kind ' + q.kind);
        if (q.kind === 'choice') {
          const ids = q.choices.map(c => c.id);
          if (ids.length < 2) fail('few choices');
          if (new Set(ids).size !== ids.length) fail('dup choice ids');
          if (ids.indexOf(q.correct) < 0) fail('correct not offered');
          if (q.choices.some(c => dbl.test(c.label))) fail('double accidental in a choice');
          if (q.pcAnswer != null) {
            const c = q.choices.find(c => c.id === q.correct);
            if (c.pc != null && c.pc !== q.pcAnswer) fail('pcAnswer mismatch');
          }
        }
        if (q.kind === 'single' && !(q.pc >= 0 && q.pc < 12)) fail('single pc');
        if (q.kind === 'set' && !Object.keys(q.pcs || {}).length) fail('set pcs');
        if (q.show && q.show.type === 'staff') {
          (q.show.cols || []).forEach(col => col.forEach(n => { if (Math.abs(n.acc) > 1) fail('staff double accidental'); }));
        }
        if (q.audio) q.audio.forEach(ev => ev.m.forEach(m => { if (!(m >= 28 && m <= 96)) fail('audio midi ' + m); }));
        if (!q.item) fail('no item key');
      }
    }
    return out;
  });
  ok(sweep.bad.length === 0, 'generators clean over ' + sweep.n + ' questions / ' + sweep.levels + ' levels' + (sweep.bad.length ? '\n    ' + sweep.bad.join('\n    ') : ''));
  console.log('  levels =', sweep.levels);

  console.log('# theory core');
  const th = await page.evaluate(() => {
    const T = SLQuiz.theory, bad = [];
    const L = 'CDEFGAB';
    for (const id in T.IV) {
      for (let st = 23; st < 40; st++) for (const acc of [-1, 0, 1]) {
        const lo = { L: st % 7, acc, oct: Math.floor(st / 7) };
        const hi = T.addIv(lo, T.IV[id]);
        const steps = (hi.oct * 7 + hi.L) - (lo.oct * 7 + lo.L);
        if (steps !== T.IV[id].n - 1) bad.push(id + ' steps ' + T.nm(lo));
        if (T.midiOf(hi) - T.midiOf(lo) !== T.IV[id].s) bad.push(id + ' semis ' + T.nm(lo));
      }
    }
    const sp = (r, q) => T.buildChord(T.nt(L.indexOf(r[0]), r[1] === '♭' ? -1 : r[1] === '♯' ? 1 : 0, 4), q).map(T.nm).join(' ');
    const want = { 'C maj7': 'C E G B', 'C dim7': 'C E♭ G♭ B♭♭', 'B dim': 'B D F', 'E♭ m7b5': 'E♭ G♭ B♭♭ D♭', 'F♯ aug': 'F♯ A♯ C♯♯', 'A♭ dom7': 'A♭ C E♭ G♭', 'D sus47': 'D G A C', 'G six': 'G B D E' };
    for (const k in want) { const [r, q] = k.split(' '); const got = sp(r, q); if (got !== want[k]) bad.push(k + ' = ' + got); }
    const sc = (r, t) => T.buildScale(T.nt(L.indexOf(r[0]), r[1] === '♭' ? -1 : r[1] === '♯' ? 1 : 0, 4), t).map(T.nm).join(' ');
    const ws = { 'E♭ major': 'E♭ F G A♭ B♭ C D', 'F♯ minor': 'F♯ G♯ A B C♯ D E', 'A harm': 'A B C D E F G♯', 'D dorian': 'D E F G A B C', 'F lyd': 'F G A B C D E', 'B♭ mixo': 'B♭ C D E♭ F G A♭', 'E blues': 'E G A B♭ B D', 'C minp': 'C E♭ F G B♭' };
    for (const k in ws) { const [r, t] = k.split(' '); const got = sc(r, t); if (got !== ws[k]) bad.push(k + ' = ' + got); }
    const kc = T.keyChords(T.KEYS.find(k => k.n === -3), true).map(c => c.num + ':' + c.name).join(' ');
    if (kc !== 'i:Cm ii°:D° III:E♭ iv:Fm V:G VI:A♭ vii°:B°') bad.push('C minor chords = ' + kc);
    const kM = T.keyChords(T.KEYS.find(k => k.n === 2), false).map(c => c.name).join(' ');
    if (kM !== 'D Em F♯m G A Bm C♯°') bad.push('D major chords = ' + kM);
    return bad;
  });
  ok(th.length === 0, 'intervals/chords/scales/keys spelled right' + (th.length ? '\n    ' + th.join('\n    ') : ''));

  console.log('# full level, all right');
  const run1 = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    SLQuiz.start('notes/nat/treble/1');
    const svgs = [];
    for (let i = 0; i < 10; i++) {
      const glyphs = [...document.querySelectorAll('#qz-vis .qz-mu')].length;
      svgs.push(glyphs);
      SLQuiz.pick(SLQuiz.q.correct);
      document.getElementById('qz-act').click();
      await wait(10);
    }
    return { view: SLQuiz.view, big: document.querySelector('.qz-big') && document.querySelector('.qz-big').textContent,
      stars: document.querySelector('.qz-stars').textContent, prog: JSON.parse(localStorage.getItem('guitarlab.qz.prog')), svgs };
  });
  ok(run1.view === 'done' && run1.big === '10/10' && run1.stars === '★★★', 'done view 10/10 ★★★: ' + JSON.stringify([run1.view, run1.big, run1.stars]));
  ok(run1.prog['notes/nat/treble/1'] && run1.prog['notes/nat/treble/1'].s === 3, 'progress saved with 3 stars');
  ok(run1.svgs.every(n => n >= 2), 'staff drawn each question (clef + note glyphs): ' + run1.svgs.join(','));

  console.log('# smooth run view');
  const sm = await page.evaluate(async () => {
    SLQuiz.start('scales/smm/staff/1');
    const shell = document.getElementById('qz-runshell');
    const c1 = document.getElementById('qz-count').textContent;
    const act1 = document.getElementById('qz-act').textContent;
    SLQuiz.pick(SLQuiz.q.choices.find(c => c.id !== SLQuiz.q.correct).id);
    const act2 = document.getElementById('qz-act').textContent.trim();
    const fb = document.getElementById('qz-fb').textContent;
    document.getElementById('qz-act').click();
    return { same: document.getElementById('qz-runshell') === shell, c1, c2: document.getElementById('qz-count').textContent, act1, act2, fb,
      instr: !!document.querySelector('.qz-instr'), fade: document.getElementById('qz-q').classList.contains('qz-in') };
  });
  ok(sm.same && sm.c1 === '1 / 10' && sm.c2 === '2 / 10' && sm.fade, 'run shell stays put between questions, only the question fades in: ' + JSON.stringify(sm));
  ok(sm.act1 === 'Show answer' && sm.act2 === 'Next' && /^You chose .+\./.test(sm.fb) && !sm.instr, 'one footer action swaps Show answer -> Next in place: ' + JSON.stringify([sm.act1, sm.act2, sm.fb.slice(0, 30)]));
  const earB = await page.evaluate(() => { SLQuiz.start('intervals/i23/ear/1'); return { big: !!document.querySelector('#qz-vis .qz-earbtn'), small: !!document.querySelector('.qz-prompt .qz-hear') }; });
  ok(earB.big && !earB.small, 'ear questions show one big play button: ' + JSON.stringify(earB));

  console.log('# failing level shows the misses');
  const run2 = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    SLQuiz.start('intervals/i23/staff/1');
    for (let i = 0; i < 10; i++) {
      const q = SLQuiz.q;
      const wrong = q.choices.find(c => c.id !== q.correct);
      SLQuiz.pick(i < 4 ? wrong.id : q.correct);
      document.getElementById('qz-act').click();
      await wait(10);
    }
    return { h: document.querySelector('.qz-verdict').textContent, miss: (document.querySelector('.qz-miss') || {}).textContent || '' };
  });
  ok(/^Not passed yet/.test(run2.h) && /Practice/.test(run2.miss), 'fail summary: ' + JSON.stringify(run2));
  ok(await page.evaluate(() => document.querySelector('.qz-done .btn.primary').id === 'qz-retry'), 'failing a level makes Try again the main action');

  console.log('# answer by MIDI chord (set)');
  const midi1 = await page.evaluate(async () => {
    SLQuiz.start('chords/cmm/piano/2');
    const q = SLQuiz.q, pcs = Object.keys(q.pcs).map(Number);
    pcs.forEach((pc, i) => App.emit('midi:note', { on: true, midi: 48 + pc + (i === 1 ? 12 : 0), vel: 90, chan: 0 }));
    const fb = document.getElementById('qz-fb');
    return { kind: q.kind, cls: fb.className, txt: fb.textContent, marks: document.querySelectorAll('.qz-key.mk-ok').length };
  });
  ok(midi1.kind === 'set' && /ok/.test(midi1.cls), 'chord played over MIDI is correct: ' + JSON.stringify(midi1));
  const midi2 = await page.evaluate(() => {
    document.getElementById('qz-act').click();
    const q = SLQuiz.q; const pcs = Object.keys(q.pcs).map(Number);
    let bad = 0; while (q.pcs[bad]) bad++;
    App.emit('midi:note', { on: true, midi: 60 + pcs[0], vel: 90 });
    App.emit('midi:note', { on: true, midi: 60 + bad, vel: 90 });
    return { cls: document.getElementById('qz-fb').className, red: document.querySelectorAll('.qz-key.mk-bad').length };
  });
  ok(/bad/.test(midi2.cls) && midi2.red >= 1, 'a wrong MIDI note fails and is marked red: ' + JSON.stringify(midi2));

  console.log('# tap the chord + Check');
  const tap = await page.evaluate(() => {
    SLQuiz.start('chords/cmm/piano/2');
    const q = SLQuiz.q;
    const keys = q.reveal.keys;
    keys.forEach(m => document.querySelector('.qz-key[data-m="' + m + '"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' })));
    const dis = document.getElementById('qz-check').disabled;
    document.getElementById('qz-check').click();
    return { dis, cls: document.getElementById('qz-fb').className };
  });
  ok(!tap.dis && /ok/.test(tap.cls), 'tapped chord + Check is correct: ' + JSON.stringify(tap));

  console.log('# guitar tone-in answers (silent midi:note)');
  const tone = await page.evaluate(() => {
    SLQuiz.start('notes/nat/treble/3');
    const q = SLQuiz.q;
    App.emit('midi:note', { on: true, midi: 40 + ((q.pc - 4 + 12) % 12), vel: 80, silent: true });
    return { kind: q.kind, cls: document.getElementById('qz-fb').className };
  });
  ok(tone.kind === 'single' && /ok/.test(tone.cls), 'tone-in note answers a play question: ' + JSON.stringify(tone));
  const toneChoice = await page.evaluate(() => {
    SLQuiz.start('notes/acc/treble/1');
    const q = SLQuiz.q;
    App.emit('midi:note', { on: true, midi: 52 + ((q.pcAnswer - 4 + 12) % 12), vel: 80, silent: true });
    return { cls: document.getElementById('qz-fb').className, ok: document.querySelector('.qz-ch.ok') && document.querySelector('.qz-ch.ok').getAttribute('data-qzc') === q.correct };
  });
  ok(/ok/.test(toneChoice.cls) && toneChoice.ok, 'playing the note answers a name-the-note choice: ' + JSON.stringify(toneChoice));

  console.log('# neck find (string must match)');
  const neck = await page.evaluate(() => {
    SLQuiz.start('notes/acc/neck/2');
    const q = SLQuiz.q, spot = q.reveal.neck[0];
    const other = (q.string + 1) % 6;
    const OPEN = [40, 45, 50, 55, 59, 64];
    let f = 0; while ((OPEN[other] + f) % 12 !== q.pc) f++;
    document.querySelector('.qz-fz[data-s="' + other + '"][data-f="' + f + '"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    const wrongString = document.getElementById('qz-fb').className;
    document.getElementById('qz-act').click();
    const q2 = SLQuiz.q, sp2 = q2.reveal.neck[0];
    document.querySelector('.qz-fz[data-s="' + sp2.s + '"][data-f="' + sp2.f + '"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    return { wrongString, right: document.getElementById('qz-fb').className };
  });
  ok(/bad/.test(neck.wrongString) && /ok/.test(neck.right), 'neck: right note wrong string fails, right spot passes: ' + JSON.stringify(neck));

  console.log('# ear autoplay + replay');
  const ear = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    let n = 0; const orig = App.keys.play; App.keys.play = function () { n++; return orig.apply(this, arguments); };
    App.store.set('qz.sound', 'piano');
    SLQuiz.start('intervals/i23/ear/1');
    await wait(450);
    const auto = n;
    document.getElementById('qz-hear').click();
    const again = n;
    App.keys.play = orig;
    return { auto, again };
  });
  ok(ear.auto === 2 && ear.again === 4, 'ear question autoplays its two notes, Hear plays again: ' + JSON.stringify(ear));

  console.log('# keyboard shortcuts');
  await page.evaluate(() => SLQuiz.start('keys/kcirc/theory/2'));
  const idx = await page.evaluate(() => SLQuiz.q.choices.findIndex(c => c.id === SLQuiz.q.correct));
  await page.keyboard.press(String(idx + 1));
  ok(await page.evaluate(() => /ok/.test(document.getElementById('qz-fb').className)), 'number key answers');
  await page.keyboard.press('Enter');
  ok(await page.evaluate(() => document.getElementById('qz-fb').textContent === ''), 'Enter goes to the next question');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => SLQuiz.view) === 'home', 'Escape backs out to the path (level started from home)');

  console.log('# render every level once (no throw, visual present)');
  const rend = await page.evaluate(() => {
    const bad = [];
    for (const lid of SLQuiz.levels()) {
      try {
        SLQuiz.start(lid);
        const q = SLQuiz.q;
        if (q.show && q.kind === 'choice' && !document.querySelector('#qz-vis svg')) bad.push(lid + ' no visual');
        if (q.kind !== 'choice' && !document.querySelector('#qz-ans svg')) bad.push(lid + ' no board');
        if (q.kind === 'choice' && document.querySelectorAll('.qz-ch').length !== q.choices.length) bad.push(lid + ' choices');
      } catch (e) { bad.push(lid + ' ' + e.message); }
    }
    return bad;
  });
  ok(rend.length === 0, 'all levels render' + (rend.length ? '\n    ' + rend.join('\n    ') : ''));

  console.log('# topic page + learn toggle');
  const tp = await page.evaluate(() => {
    document.getElementById('qz-back').click();
    document.getElementById('qz-home') && document.getElementById('qz-home').click();
    document.querySelector('[data-qzh="topics"]').click();
    document.querySelector('[data-qzt="chords"]').click();
    const units = document.querySelectorAll('.qz-unit').length;
    const lb = document.querySelector('[data-qzlearn]'); lb.click();
    const shown = !document.getElementById('qz-learn-' + lb.getAttribute('data-qzlearn')).hidden;
    document.querySelector('[data-qzm="cmm|ear"]').click();
    const rows = [...document.querySelectorAll('.qz-unit')][0].querySelectorAll('.qz-lvl').length;
    const learnKept = !document.getElementById('qz-learn-cmm').hidden;
    const openBefore = document.querySelectorAll('.qz-unit.open').length;
    document.querySelector('[data-qzu="cdas"]').click();
    const opened = document.getElementById('qz-unit-cdas').classList.contains('open') && !!document.querySelector('#qz-unit-cdas .qz-lvl');
    document.querySelector('[data-qzu="cdas"]').click();
    const closed = !document.getElementById('qz-unit-cdas').classList.contains('open') && !document.querySelector('#qz-unit-cdas .qz-lvl');
    return { units, shown, rows, learnKept, openBefore, opened, closed };
  });
  ok(tp.units === 6 && tp.shown && tp.rows === 3, 'chords topic: 6 units, learn opens, ear chip shows 3 levels: ' + JSON.stringify(tp));
  ok(tp.openBefore === 1 && tp.opened && tp.closed && tp.learnKept, 'one unit open by default, units toggle in place, Learn stays open on mode switch: ' + JSON.stringify(tp));

  console.log('# latency: master chain');
  await page.mouse.click(600, 30);
  const lat = await page.evaluate(() => {
    const c = App.getAudio();
    return { comp: window.__comp, state: c.state, base: c.baseLatency };
  });
  ok(lat.comp === 0, 'no DynamicsCompressor created in practice pages: ' + JSON.stringify(lat));

  console.log('# fretboard: mouse press plays once');
  const fb = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    App.switchTo('fretboard');
    await wait(150);
    let n = 0; const orig = App.pluck; App.pluck = function () { n++; return orig.apply(this, arguments); };
    const hit = document.querySelector('#panel-fretboard .fb-hit');
    const r = hit.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, found: !!hit };
  });
  if (fb.found) {
    await page.evaluate(() => { window.__pl = 0; const o = App.pluck; App.pluck = function () { window.__pl++; return o.apply(this, arguments); }; });
    await page.mouse.move(fb.x, fb.y);
    await page.mouse.down();
    const atDown = await page.evaluate(() => window.__pl);
    await page.mouse.up();
    await page.waitForTimeout(50);
    const after = await page.evaluate(() => window.__pl);
    ok(atDown === 1 && after === 1, 'sounds on mouse-down, not again on click: down=' + atDown + ' total=' + after);
  } else ok(false, 'no .fb-hit found');

  console.log('# chrome');
  const ch = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const disp = () => getComputedStyle(document.getElementById('ctx-btn')).display;
    App.switchTo('quiz'); await wait(50);
    const onQuiz = disp();
    App.switchTo('fretboard'); await wait(50);
    const onNeck = disp();
    let running = null; App.on('met:state', d => { running = d.running; });
    App.emit('met:toggle'); await wait(150);
    const started = running;
    App.switchTo('quiz'); await wait(150);
    return { onQuiz, onNeck, started, stopped: running === false };
  });
  ok(ch.onQuiz === 'none' && ch.onNeck !== 'none', 'key/scale clef hidden on Exercises, shown on the neck: ' + JSON.stringify(ch));
  ok(ch.started === true && ch.stopped, 'opening Exercises stops the metronome: ' + JSON.stringify(ch));
  await page.setViewportSize({ width: 1200, height: 520 });
  await page.evaluate(() => { App.switchTo('piano'); });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(80);
  await page.mouse.wheel(0, 500); await page.waitForTimeout(350);
  const hid = await page.evaluate(() => ({ y: window.pageYOffset, hidden: document.querySelector('.topbar').classList.contains('bar-hidden') }));
  await page.mouse.wheel(0, -60); await page.waitForTimeout(350);
  const back = await page.evaluate(() => ({ y: window.pageYOffset, hidden: document.querySelector('.topbar').classList.contains('bar-hidden') }));
  ok(hid.y > 0 && hid.hidden && !back.hidden, 'top bar hides on scroll down, returns on scroll up: ' + JSON.stringify([hid, back]));
  await page.setViewportSize({ width: 1200, height: 900 });

  console.log('# switching away and back keeps the course');
  await page.evaluate(() => App.switchTo('quiz'));
  ok(await page.evaluate(() => App.active === 'quiz' && !!document.querySelector('#panel-quiz .qz-view')), 'back on Exercises');

  ok(errs.length === 0, 'no page errors' + (errs.length ? '\n    ' + errs.join('\n    ') : ''));
  await ctx.close();

  console.log('# second launch does not force-land');
  ({ ctx, page, errs } = await newPage(browser, { 'qz.landed': true, 'app.tab': 'piano' }));
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => App.active) === 'piano', 'stored tab wins once landed: ' + await page.evaluate(() => App.active));
  ok(errs.length === 0, 'no page errors (2)' + (errs.length ? '\n    ' + errs.join('\n    ') : ''));
  await ctx.close();
  await browser.close();

  console.log('# sound hint without a gesture');
  const b2 = await chromium.launch({ executablePath: env.CHROMIUM });
  ({ ctx, page, errs } = await newPage(b2, { 'qz.landed': true }, true));
  await page.waitForTimeout(100);
  await page.evaluate(() => App.emit('midi:note', { on: true, midi: 60, vel: 100 }));
  const h1 = await page.evaluate(async () => { const hint = !!document.getElementById('snd-hint'); App.getAudio(); await new Promise(r => setTimeout(r, 150)); return { hint, st: App.getAudio().state }; });
  ok(h1.hint && h1.st !== 'running', 'hint appears when MIDI plays into a locked context: ' + JSON.stringify(h1));
  await page.mouse.click(300, 400);
  await page.waitForTimeout(200);
  const h2 = await page.evaluate(() => ({ hint: !!document.getElementById('snd-hint'), st: App.getAudio().state }));
  ok(!h2.hint && h2.st === 'running', 'first click unlocks audio and removes the hint: ' + JSON.stringify(h2));
  await page.evaluate(() => App.emit('midi:note', { on: true, midi: 62, vel: 100 }));
  ok(await page.evaluate(() => !document.getElementById('snd-hint')), 'no hint once unlocked');
  ok(errs.length === 0, 'no page errors (3)' + (errs.length ? '\n    ' + errs.join('\n    ') : ''));
  await b2.close();

  console.log(fails ? '\nFAILED: ' + fails : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
