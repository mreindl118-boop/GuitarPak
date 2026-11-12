// CONTROLLER REMOTE on the runner pages: the fretboard runner (pages
// fretboard / tab / notation, js/fretboard.js), the Songs player
// (js/songs.js) and the Free practice cards on the Plan page (js/trainer.js,
// mounted by js/practiceplan.js). onRemote next / back / stop does what the
// on-screen buttons do (Play / Pause, reset, +1 change, the run's Reset),
// 'nothing here' returns false, and the reserved double-tap key is claimed
// only where remoteKey allows it (the Plan page; the runners and Songs only
// while the lowest key is not a lit target).
// On the Plan page the cards are asked first: a chord-change run counts NEXT,
// STOP cancels it or pauses the Free practice timer; with no run NEXT is the
// Plan's own "Block: …" (tests/remote-plan.test.js covers the Plan itself).
// Where nothing happens, a page that toasted its reason answers false (no
// success HUD), so the remote adds neither its own note nor the sound hint.
// 2.0 Phase A3b: Live sets and the Deck are soundLAB Gear (gear.html). Their
// half of this suite moved, as it was, to tests/remote-gear.test.js, with the
// gear seeds (the Live set, the key-light output, the Hub profile).
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const J = JSON.stringify;
const MAP = { next: { midi: { t: 'cc', n: 86, ch: null, port: '' }, key: null }, back: { midi: { t: 'cc', n: 87, ch: null, port: '' }, key: null }, stop: { midi: { t: 'cc', n: 85, ch: null, port: '' }, key: null } };
const TAB = ['e|--0--1--3--5--|', 'B|--------------|', 'G|--------------|', 'D|--------------|', 'A|--------------|', 'E|--------------|'].join('\n');
// step 1 adds C3 (48) on the A string: the LUMI's lowest key is a lit target
const TAB_C = ['e|--0--1--3--5--|', 'B|--------------|', 'G|--------------|', 'D|--------------|', 'A|--3-----------|', 'E|--------------|'].join('\n');
// a song handed over from MIDI (App.songs.load) with an empty bar 2: a loop of bar 2 alone has nothing to play
const GAP = { name: 'Gap', srcType: 'midi', bars: 3, steps: [{ notes: [{ s: 5, f: 0, midi: 64 }], bar: 0 }, { notes: [{ s: 5, f: 1, midi: 65 }], bar: 2 }] };

async function newPage(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript((seed) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.lights.on', 'false');
    for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
    window.__wait = ms => new Promise(r => setTimeout(r, ms));
    window.__q = s => document.querySelector(s);
    window.__raw = []; window.__notes = []; window.__ev = []; window.__guide = []; window.__plucks = 0;
    window.__by = { lumi: [], modx1: [] };
    const mk = (id, name) => ({ id, name, type: 'output', state: 'connected', send: b => { const a = Array.from(b); if (a[0] < 0xF0) window.__by[id].push(a.join(' ')); } });
    const outs = new Map([['lumi', mk('lumi', 'LUMI Keys BLOCK')], ['modx1', mk('modx1', 'MODX-1')]]);
    const modxIn = { id: 'mi', name: 'MODX-1', type: 'input', state: 'connected', onmidimessage: null };
    const lumiIn = { id: 'li', name: 'LUMI Keys BLOCK', type: 'input', state: 'connected', onmidimessage: null };
    navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map([['mi', modxIn], ['li', lumiIn]]), outputs: outs, sysexEnabled: true, onstatechange: null });
    window.__send = (b, p) => (p === 'li' ? lumiIn : modxIn).onmidimessage({ data: new Uint8Array(b) });
    window.__cc = (n, v, p) => __send([0xB0, n, v], p);
    window.__press = (n, p) => { __cc(n, 127, p); __cc(n, 0, p); };
    window.__strike = (n, p) => { __send([0x90, n, 90], p); __send([0x80, n, 0], p); };
    window.__toast = () => { const t = document.getElementById('app-toast'); return t && !t.hidden ? t.textContent : ''; };
    window.__clearToast = () => { const t = document.getElementById('app-toast'); if (t) t.hidden = true; };
    window.__hud = () => { const h = document.getElementById('remote-hud'); return h && h.classList.contains('show') ? h.textContent : ''; };
    window.__ra = a => App.remoteAction(a, { via: 'test' });
    window.__txt = s => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; };
    window.addEventListener('DOMContentLoaded', () => {
      App.on('midi:raw', d => __raw.push(d.bytes.join(' ')));
      App.on('midi:note', d => __notes.push((d.on ? 'on ' : 'off ') + d.midi));
      App.on('remote', d => __ev.push(d.action + ':' + d.via + ':' + (d.handled ? 1 : 0)));
    });
  }, seed || {});
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.midi.hasOutput && App.active === 'quiz' && App.remote);
  // the key-light guide and the plucked voice: what the runners do, seen from outside
  await page.evaluate(() => {
    const g = App.midi.guide; App.midi.guide = function (now, next) { __guide.push(now == null ? null : [].concat(now).join(',')); return g.apply(this, arguments); };
    const p = App.pluck; App.pluck = function () { __plucks++; return p.apply(this, arguments); };
  });
  return { ctx, page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  let { ctx, page, errs } = await newPage(browser, { 'remote.map': MAP });

  console.log('# the fretboard runner (Neck page)');
  const fb = await page.evaluate(async () => {
    const o = {}, play = () => __txt('#fb-pr-play'), lastNow = () => { const l = __guide.filter(x => x != null); return l[l.length - 1]; };
    App.switchTo('fretboard'); await __wait(250);
    o.key = App.remoteKeyPage();
    o.stop0 = __ra('stop');
    const p0 = __plucks;
    o.next1 = __ra('next'); o.play1 = play(); o.first = lastNow();
    await __wait(500); o.plucked = __plucks - p0;
    o.next2 = __ra('next'); o.play2 = play(); o.off = __guide[__guide.length - 1];
    o.next3 = __ra('next'); o.play3 = play(); o.resumeAt = lastNow();
    await __wait(200);
    o.back = __ra('back'); o.play4 = play(); o.restartAt = lastNow();
    o.stop = __ra('stop'); o.play5 = play(); o.stop2 = __ra('stop');
    o.next4 = __ra('next'); o.again = lastNow(); __ra('stop');
    return o;
  });
  ok(fb.key === true, 'the Neck page declares remoteKey (the runner grades nothing)');
  ok(fb.stop0 === false, 'STOP with the runner already at the first note: nothing to stop (false, the core toasts)');
  ok(fb.next1 === 'Play' && /Pause/.test(fb.play1) && fb.first && fb.plucked > 0, 'NEXT = Play: the runner starts, the button reads Pause, notes sound: ' + J([fb.next1, fb.play1, fb.first, fb.plucked]));
  ok(fb.next2 === 'Pause' && /Play/.test(fb.play2) && fb.off === null, 'NEXT again = Pause: the button reads Play, the key-light guide clears');
  ok(fb.next3 === 'Play' && /Pause/.test(fb.play3) && fb.resumeAt && fb.resumeAt !== fb.first, 'NEXT resumes where it paused (not from the first note): ' + J([fb.first, fb.resumeAt]));
  ok(fb.back === 'Restart' && /Pause/.test(fb.play4) && fb.restartAt === fb.first, 'BACK = Restart: from the first note again, still playing: ' + fb.restartAt);
  ok(fb.stop === 'Stopped' && /Play/.test(fb.play5) && fb.stop2 === false, 'STOP = the reset button (Stopped, Play shows); a second STOP has nothing to do');
  ok(fb.next4 === 'Play' && fb.again === fb.first, 'after STOP, NEXT plays from the first note');

  console.log('# STOP clears what a paused rewind leaves on the board');
  const rw = await page.evaluate(async () => {
    const o = {}, was = __q('#fb-pr-dir button.active');
    __ra('next'); await __wait(600); __ra('next'); // a few notes, then pause
    o.ringPaused = !!__q('#fb-pr-ring');
    __q('#fb-pr-dir button[data-fbdir="down"]').click(); await __wait(30); // a direction change while paused: pr.idx back to 0
    o.ring = !!__q('#fb-pr-ring'); o.status = __txt('#fb-pr-status');
    o.stop = __ra('stop'); o.ringAfter = !!__q('#fb-pr-ring'); o.statusAfter = __txt('#fb-pr-status'); o.play = __txt('#fb-pr-play');
    o.stop2 = __ra('stop');
    if (was) was.click();
    return o;
  });
  ok(rw.ringPaused && rw.ring && rw.status, 'paused, then the direction changes: the ring and the n / total status stay up at the first note: ' + J(rw));
  ok(rw.stop === 'Stopped' && !rw.ringAfter && rw.statusAfter === '' && /Play/.test(rw.play), 'STOP = the reset button: the ring and the status clear (not "nothing to stop")');
  ok(rw.stop2 === false, 'then STOP again: nothing to stop');

  console.log('# Tab and Notation pages share the runner');
  const tn = await page.evaluate(async () => {
    const o = {};
    App.switchTo('tab'); await __wait(200);
    o.key = App.remoteKeyPage();
    o.next = __ra('next'); o.tabBtn = __txt('#panel-tab .fb-alt-play');
    App.switchTo('notation'); await __wait(200);
    o.keyN = App.remoteKeyPage(); o.stillBtn = __txt('#panel-notation .fb-alt-play');
    o.pause = __ra('next'); o.nBtn = __txt('#panel-notation .fb-alt-play');
    o.stop = __ra('stop'); o.stop2 = __ra('stop');
    return o;
  });
  ok(tn.key === true && tn.next === 'Play' && /Pause/.test(tn.tabBtn), 'Tab: the stopped runner leaves the lowest key to the remote; NEXT starts the runner (its transport reads Pause)');
  ok(tn.keyN === false, 'Notation, the run going: A minor pentatonic lights C on the lowest key, so it is not reserved');
  ok(/Pause/.test(tn.stillBtn) && tn.pause === 'Pause' && /Play/.test(tn.nBtn), 'Notation: the runner kept playing across the trio; NEXT pauses it there');
  ok(tn.stop === 'Stopped' && tn.stop2 === false, 'Notation: STOP rewinds a paused run; again = nothing to stop');

  console.log('# Songs');
  const sg = await page.evaluate(async () => {
    const o = {};
    App.switchTo('songs'); await __wait(250);
    o.key = App.remoteKeyPage();
    __clearToast(); o.none = __ra('next'); o.noneToast = __toast(); o.noneStop = __ra('stop'); o.noneBack = __ra('back');
    // through a pedal: the page's toast stands, no success HUD, no 'Nothing to move on here'
    await __wait(300); __clearToast(); __ev.length = 0; __press(86); await __wait(60);
    o.pedal = [__toast(), __hud(), __ev.slice()];
    return o;
  });
  await page.evaluate((tab) => { __q('#sg-paste').value = tab; __q('#sg-parse').click(); }, TAB);
  const sg2 = await page.evaluate(async () => {
    const o = {}, play = () => __txt('#sg-play'), lastNow = () => { const l = __guide.filter(x => x != null); return l[l.length - 1]; };
    o.loaded = !!(App.songs.current && App.songs.current.steps.length);
    o.stop0 = __ra('stop');
    const p0 = __plucks;
    o.next1 = __ra('next'); o.play1 = play(); o.first = lastNow();
    await __wait(700); o.plucked = __plucks - p0;
    o.next2 = __ra('next'); o.play2 = play();
    o.back = __ra('back'); o.play3 = play(); o.restartAt = lastNow();
    await __wait(300);
    o.stop = __ra('stop'); o.play4 = play(); o.nowMark = !!__q('#sg-tabout .now'); o.status = __txt('#sg-status');
    o.stop2 = __ra('stop');
    return o;
  });
  ok(sg.key === true, 'Songs declares remoteKey (it grades nothing)');
  ok(sg.none === false && /Load a song first/.test(sg.noneToast) && sg.noneBack === false && sg.noneStop === false, 'no song: NEXT / BACK toast "Load a song first" and answer false (nothing happened); STOP has nothing: ' + J([sg.none, sg.noneToast, sg.noneStop]));
  ok(/Load a song first/.test(sg.pedal[0]) && !sg.pedal[1] && sg.pedal[2].join() === 'next:cc:0', 'no song, pedal NEXT: the page’s toast stays, no success HUD, the remote event says unhandled: ' + J(sg.pedal));
  ok(sg2.loaded && sg2.stop0 === false, 'a pasted tab loads; STOP before playing = nothing to stop');
  ok(sg2.next1 === 'Play' && /Pause/.test(sg2.play1) && sg2.plucked > 0 && sg2.first, 'NEXT = the Play button: it plays (button reads Pause): ' + J([sg2.next1, sg2.plucked]));
  ok(sg2.next2 === 'Pause' && /Play/.test(sg2.play2), 'NEXT again = Pause');
  ok(sg2.back === 'Restart' && /Pause/.test(sg2.play3) && sg2.restartAt === sg2.first, 'BACK = Restart from loop A (the first step again): ' + sg2.restartAt);
  ok(sg2.stop === 'Stopped' && /Play/.test(sg2.play4) && !sg2.nowMark && sg2.status === '' && sg2.stop2 === false, 'STOP = the reset button: paused, rewound, no step marked; again = nothing');
  const sg3 = await page.evaluate(async () => {
    const o = {};
    __guide.length = 0;
    __q('#sg-tabout [data-sgstep="0"]').click(); await __wait(30); // stopped: a tapped step sounds, lights and is marked
    o.lit = __guide.slice(); o.mark = !!__q('#sg-tabout .now');
    o.stop = __ra('stop'); o.cleared = __guide[__guide.length - 1]; o.markAfter = !!__q('#sg-tabout .now');
    o.stop2 = __ra('stop');
    return o;
  });
  ok(sg3.lit.length && sg3.lit[0] === '64' && sg3.mark, 'stopped, a step tapped: its notes light, the step is marked: ' + J(sg3.lit));
  ok(sg3.stop === 'Stopped' && sg3.cleared === null && !sg3.markAfter && sg3.stop2 === false, 'STOP then clears the lit keys and the mark like the reset button; again = nothing: ' + J([sg3.stop, sg3.cleared]));
  await page.evaluate((song) => { App.songs.load(song); }, GAP);
  const sg4 = await page.evaluate(async () => {
    const o = {}, a = __q('#sg-loopa'), b = __q('#sg-loopb');
    o.bars = a.options.length;
    a.value = '1'; a.dispatchEvent(new Event('change')); b.value = '1'; b.dispatchEvent(new Event('change'));
    __clearToast(); o.next = __ra('next'); o.toast = __toast(); o.play = __txt('#sg-play');
    await __wait(300); __clearToast(); __ev.length = 0; __press(86); await __wait(60);
    o.pedal = [__toast(), __hud(), __ev.slice()];
    a.value = '0'; a.dispatchEvent(new Event('change'));
    return o;
  });
  ok(sg4.bars === 3 && sg4.next === false && /Loop range is empty/.test(sg4.toast) && /Play/.test(sg4.play), 'a loop with nothing to play: NEXT toasts why and answers false: ' + J([sg4.next, sg4.toast]));
  ok(/Loop range is empty/.test(sg4.pedal[0]) && !sg4.pedal[1] && sg4.pedal[2].join() === 'next:cc:0', 'the same from a pedal: the page’s reason stays, no HUD: ' + J(sg4.pedal));

  console.log('# Free practice on the Plan page (the Trainer cards, js/trainer.js)');
  const tr = await page.evaluate(async () => {
    const o = {};
    // a plan block opened by NEXT sets the shared key and tempo: both are put back at the end
    const key0 = [App.store.get('fb.root', 9), App.store.get('fb.scale', 'minorPent')], bpm0 = parseInt((__q('#fb-pr-bpm') || {}).value, 10) || 100;
    const toPlan = async () => { App.switchTo('practiceplan'); await __wait(250); const d = __q('#pp-tools'); if (d) d.open = true; await __wait(30); };
    await toPlan();
    o.at = App.active; o.cards = !!__q('#pp-tools-body #tr-sess-start') && !!__q('#pp-tools-body #tr-cc-start');
    o.key = App.remoteKeyPage();
    o.back0 = __ra('back'); o.stop0 = __ra('stop');
    __q('#tr-sess-start').click(); await __wait(60);
    o.sessStop = __ra('stop'); o.sessBtn = __q('#tr-sess-start').hidden; o.sessLabel = __txt('#tr-sess-start');
    o.stopAgain = __ra('stop');
    __q('#tr-cc-start').click(); await __wait(30);
    o.c1 = __ra('next'); o.c2 = __ra('next'); o.ccNum = __txt('#tr-cc-num'); o.atRun = App.active;
    o.ccStop = __ra('stop'); o.ccRes = __txt('#tr-cc-result'); o.ccStartOn = !__q('#tr-cc-start').disabled; o.ccNum2 = __txt('#tr-cc-num');
    // the minute runs out under the foot: a late press must not open a plan block
    __q('#tr-cc-start').click(); await __wait(30);
    const real = Date.now, shift = 60100; Date.now = () => real() + shift;
    await __wait(320); o.ccDone = !__q('#tr-cc-start').disabled;
    o.late = __ra('next'); o.lateAt = App.active;
    Date.now = () => real() + 61900; // the same clock, past the 1.5 s after the run ran out
    o.after = __ra('next'); o.afterAt = App.active; // no run: the Plan's own NEXT opens a block (and leaves the page)
    Date.now = real;
    // a cancelled run never ran out: a minute after its start NEXT is the Plan's own again
    await toPlan();
    __q('#tr-cc-start').click(); await __wait(50); __q('#tr-cc-reset').click(); await __wait(30);
    Date.now = () => real() + 60200;
    o.cancelled = __ra('next'); o.cancelledAt = App.active;
    Date.now = real;
    await __wait(100);
    App.emit('fb:set', { source: 'test', root: key0[0], scale: key0[1] });
    App.store.set('met.bpm', bpm0); App.emit('tempo', { bpm: bpm0, source: 'test' });
    await __wait(100);
    return o;
  });
  ok(tr.at === 'practiceplan' && tr.cards && tr.key === true, 'the Trainer cards are on the Plan page (Free practice); the page declares remoteKey (no MIDI grading there): ' + J([tr.at, tr.cards, tr.key]));
  ok(tr.back0 === false && tr.stop0 === false, 'no block opened, nothing running: BACK and STOP have nothing to do');
  ok(tr.sessStop === 'Session paused' && !tr.sessBtn && /Resume/.test(tr.sessLabel) && tr.stopAgain === false, 'STOP pauses the running Free practice timer (Resume shows); then nothing to stop');
  ok(tr.c1 === 'Change 1' && tr.c2 === 'Change 2' && tr.ccNum === '2' && tr.atRun === 'practiceplan', 'during a chord-change run NEXT counts a change (like Space) and opens no plan block: ' + J([tr.c1, tr.c2, tr.ccNum, tr.atRun]));
  ok(tr.ccStop === 'Run cancelled' && /Run cancelled/.test(tr.ccRes) && tr.ccStartOn && tr.ccNum2 === '0', 'STOP = the run’s Reset (cancelled, unscored)');
  ok(tr.ccDone && tr.late === 'Time’s up' && tr.lateAt === 'practiceplan', 'a NEXT just after the minute ran out opens no plan block (Time’s up): ' + J([tr.late, tr.lateAt]));
  ok(/^Block: /.test(tr.after) && tr.afterAt !== 'practiceplan', 'once the 1.5 s after the run ran out have passed, NEXT is the Plan’s again (it opens the next block): ' + J([tr.after, tr.afterAt]));
  ok(/^Block: /.test(tr.cancelled) && tr.cancelledAt !== 'practiceplan', 'a run cancelled with Reset never "runs out": a minute after its start NEXT opens a plan block: ' + J([tr.cancelled, tr.cancelledAt]));

  console.log('# double-tap the lowest key on the runner pages (remoteKey: the runner while stopped or the key unlit, the Plan page)');
  const dt = await page.evaluate(async () => {
    const o = {};
    App.remote.setDoubleTap(true);
    App.switchTo('fretboard'); await __wait(250);
    __notes.length = 0; __ev.length = 0;
    __strike(48, 'li'); await __wait(500); // one strike alone: claimed, silent, nothing happens
    o.single = { notes: __notes.slice(), ev: __ev.slice(), play: __txt('#fb-pr-play') };
    __strike(48, 'li'); await __wait(80); __strike(48, 'li'); await __wait(80);
    o.dbl = { notes: __notes.slice(), ev: __ev.slice(), play: __txt('#fb-pr-play'), hud: __hud() };
    __strike(50, 'li'); await __wait(40); o.other = __notes.slice();
    // running A minor pentatonic (the default): its C folds onto the lowest key — a lit target
    // that must sound, and a double-tap of it must not pause the run
    o.litKey = App.remoteKeyPage();
    __notes.length = 0; __ev.length = 0; await __wait(400);
    __strike(48, 'li'); await __wait(80); __strike(50, 'li'); await __wait(40); __strike(48, 'li'); await __wait(80);
    o.lit = { notes: __notes.filter(n => / 48$/.test(n)), ev: __ev.slice(), play: __txt('#fb-pr-play') };
    __ra('stop');
    // A major pentatonic has no C: during that run the key lights nothing, so it stays reserved
    App.emit('fb:set', { source: 'test', root: 9, scale: 'majorPent' }); await __wait(100);
    __ra('next'); await __wait(200);
    o.freeKey = App.remoteKeyPage();
    __notes.length = 0; __ev.length = 0; await __wait(400);
    __strike(48, 'li'); await __wait(80); __strike(48, 'li'); await __wait(80);
    o.free = { notes: __notes.filter(n => / 48$/.test(n)), ev: __ev.slice(), play: __txt('#fb-pr-play') };
    __ra('stop');
    App.emit('fb:set', { source: 'test', root: 9, scale: 'minorPent' }); await __wait(100);
    // the Plan page, a chord-change run going in Free practice: the double-tap counts a change
    App.switchTo('practiceplan'); await __wait(200);
    __q('#pp-tools').open = true; __q('#tr-cc-start').click(); await __wait(30);
    __ev.length = 0; __notes.length = 0; await __wait(300);
    __strike(48, 'li'); await __wait(80); __strike(48, 'li'); await __wait(80);
    o.tr = [__ev.slice(), __txt('#tr-cc-num'), App.active, __notes.filter(n => / 48$/.test(n)).length];
    __q('#tr-cc-reset').click();
    App.remote.setDoubleTap(false);
    return o;
  });
  ok(!dt.single.notes.length && !dt.single.ev.length && /Play/.test(dt.single.play), 'one strike of the lowest key: claimed, silent, no action');
  ok(dt.dbl.ev.join() === 'next:dbltap:1' && /Pause/.test(dt.dbl.play) && /Play/.test(dt.dbl.hud) && !dt.dbl.notes.length, 'two strikes within 350 ms = NEXT: the runner plays: ' + J(dt.dbl));
  ok(dt.other.join('|') === 'on 50|off 50', 'other keys still reach the page');
  ok(dt.litKey === false && dt.lit.notes.join('|') === 'on 48|off 48|on 48|off 48' && !dt.lit.ev.length && /Pause/.test(dt.lit.play), 'running with the lowest key lit (C in A minor pentatonic): both strikes reach midi:note, no remote action, the run keeps going: ' + J(dt.lit));
  ok(dt.freeKey === true && !dt.free.notes.length && dt.free.ev.join() === 'next:dbltap:1' && /Play/.test(dt.free.play), 'running A major pentatonic (nothing on the lowest key): the key stays reserved, a double-tap pauses: ' + J(dt.free));
  ok(dt.tr[0].join() === 'next:dbltap:1' && dt.tr[1] === '1' && dt.tr[2] === 'practiceplan' && dt.tr[3] === 0, 'Plan page, a chord-change run going: the double-tap counts a change (the strikes are claimed, no plan block opens): ' + J(dt.tr));

  console.log('# Songs: the lowest key is reserved only while the song does not light it');
  await page.evaluate(async (tab) => { App.remote.setDoubleTap(true); App.switchTo('songs'); await __wait(250); __q('#sg-paste').value = tab; __q('#sg-parse').click(); }, TAB);
  const sd = await page.evaluate(async () => {
    const o = {};
    o.stoppedKey = App.remoteKeyPage();
    __ev.length = 0; __notes.length = 0; await __wait(400);
    __strike(48, 'li'); await __wait(80); __strike(48, 'li'); await __wait(80);
    o.start = [__ev.slice(), __txt('#sg-play'), __notes.filter(n => / 48$/.test(n)).length];
    o.runKey = App.remoteKeyPage();
    __ev.length = 0; await __wait(400);
    __strike(48, 'li'); await __wait(80); __strike(48, 'li'); await __wait(80);
    o.pause = [__ev.slice(), __txt('#sg-play'), __notes.filter(n => / 48$/.test(n)).length];
    __ra('stop');
    return o;
  });
  ok(sd.stoppedKey === true && sd.start[0].join() === 'next:dbltap:1' && /Pause/.test(sd.start[1]) && sd.start[2] === 0, 'a tab with nothing on the lowest key: stopped, a double-tap = Play (the strikes are claimed): ' + J(sd.start));
  ok(sd.runKey === true && sd.pause[0].join() === 'next:dbltap:1' && /Play/.test(sd.pause[1]) && sd.pause[2] === 0, 'and while it plays the key stays free of targets: a double-tap pauses: ' + J(sd.pause));
  await page.evaluate((tab) => { __q('#sg-paste').value = tab; __q('#sg-parse').click(); }, TAB_C);
  const sd2 = await page.evaluate(async () => {
    const o = {};
    o.stoppedKey = App.remoteKeyPage(); // loaded, nothing lit yet
    __q('#sg-tabout [data-sgstep="0"]').click(); await __wait(30); // step 1 = E4 + C3: C3 lights the lowest key
    o.tappedKey = App.remoteKeyPage();
    __ra('stop'); o.afterStop = App.remoteKeyPage();
    o.next = __ra('next'); await __wait(100);
    o.runKey = App.remoteKeyPage();
    __notes.length = 0; __ev.length = 0; await __wait(400);
    __strike(48, 'li'); await __wait(80); __strike(48, 'li'); await __wait(80);
    o.lit = { notes: __notes.filter(n => / 48$/.test(n)), ev: __ev.slice(), play: __txt('#sg-play') };
    __ra('stop');
    App.remote.setDoubleTap(false);
    return o;
  });
  ok(sd2.stoppedKey === true && sd2.tappedKey === false && sd2.afterStop === true, 'stopped: the key is free unless a tapped step lights it (C3); STOP clears that: ' + J([sd2.stoppedKey, sd2.tappedKey, sd2.afterStop]));
  ok(sd2.next === 'Play' && sd2.runKey === false && sd2.lit.notes.join('|') === 'on 48|off 48|on 48|off 48' && !sd2.lit.ev.length && /Pause/.test(sd2.lit.play), 'playing a song with C3 in it: the lit lowest key sounds both strikes, no remote action, the song keeps playing: ' + J(sd2.lit));

  ok(!errs.length, 'no page errors: ' + errs.join(' | '));
  await ctx.close();

  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
