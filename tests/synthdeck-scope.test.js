// Synth Deck SCOPE (js/synthdeck-scope.js, window.SLSynthScope) against a fake
// Web MIDI setup: a MODX-1 port (the Hub's synth output) and a LUMI (the
// service's selected / key-light output). Drives the scope through
// App.synthDeck.scopeFeed/scopeFrame/scopeState + tab('scope') when the deck
// (js/synthdeck.js) is present, else mounts SLSynthScope standalone into a box
// under #panel-midihub with SLMidiHub.api — the same checks either way, none
// of them waiting on rAF or the wall clock.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const J = JSON.stringify;

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(() => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.lights.on', 'false');
    localStorage.setItem('guitarlab.midi.outputId', JSON.stringify('lumi'));
    localStorage.setItem('guitarlab.midihub.profile', JSON.stringify('yamaha'));
    localStorage.setItem('guitarlab.met.bpm', '120');
    localStorage.setItem('guitarlab.met.sig', JSON.stringify('4/4'));
    window.__by = { out1: [], lumi: [] };
    const mk = (id, name) => ({ id, name, state: 'connected', send: b => window.__by[id].push(Array.from(b)) });
    const inp = { id: 'in1', name: 'MODX-1', state: 'connected', onmidimessage: null };
    const access = { inputs: new Map([['in1', inp]]), outputs: new Map([['out1', mk('out1', 'MODX-1')], ['lumi', mk('lumi', 'LUMI Keys BLOCK')]]), sysexEnabled: true, onstatechange: null };
    navigator.requestMIDIAccess = () => Promise.resolve(access);
    window.__recv = (bytes) => inp.onmidimessage({ data: new Uint8Array(bytes) });
    window.__sentAll = () => window.__by.out1.length + window.__by.lumi.length;
  });
  // the module is normally loaded by index.html; inject it only when the page does not include it yet
  const html = fs.readFileSync(path.join(env.ROOT, 'index.html'), 'utf8');
  if (!/js\/synthdeck-scope\.js/.test(html)) { console.log('  (index.html lacks js/synthdeck-scope.js — injecting it)'); await ctx.addInitScript({ path: path.join(env.ROOT, 'js', 'synthdeck-scope.js') }); }
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.midi.hasOutput && App.active === 'quiz');

  console.log('# mount (deck or standalone) + silence');
  const m = await page.evaluate(() => {
    App.switchTo('midihub');
    const sent0 = __sentAll();
    window.__changes = [];
    const deck = !!(window.App.synthDeck && typeof App.synthDeck.scopeFeed === 'function' && typeof App.synthDeck.tab === 'function');
    if (deck) {
      App.synthDeck.tab('scope');
      window.__sc = {
        deck: true,
        feed: function () { return App.synthDeck.scopeFeed.apply(App.synthDeck, arguments); },
        frame: () => App.synthDeck.scopeFrame(), state: () => App.synthDeck.scopeState(), running: () => App.synthDeck.scopeRunning,
        active: on => App.synthDeck.tab(on ? 'scope' : 'knobs'), leave: () => {}, back: () => App.synthDeck.tab('scope')
      };
    } else {
      const box = document.createElement('div'); box.id = 'sdk-scope-tab'; box.className = 'card';
      document.getElementById('panel-midihub').appendChild(box);
      SLSynthScope.mount(box, SLMidiHub.api, { win: 4, lanes: [95, 17, 1, 74], showOut: true, onChange: o => window.__changes.push(o) });
      SLSynthScope.setActive(true);
      window.__sc = {
        deck: false,
        feed: SLSynthScope.feed, frame: SLSynthScope.frame, state: SLSynthScope.state, running: () => SLSynthScope.running,
        active: on => SLSynthScope.setActive(on), leave: () => SLSynthScope.stop(), back: () => SLSynthScope.setActive(true)
      };
    }
    const ids = ['sdk-swin', 'sdk-sfreeze', 'sdk-sout', 'sdk-slanes', 'sdk-addlane', 'sdk-sclock', 'sdk-canvas', 'sdk-parts', 'sdk-sstat', 'sdk-stips'];
    const tips = [...document.querySelectorAll('#sdk-stips li')].map(li => li.textContent);
    return {
      deck, missing: ids.filter(id => !document.getElementById(id)),
      wins: [...document.querySelectorAll('#sdk-swin button')].map(b => b.dataset.win).join(), activeWin: (document.querySelector('#sdk-swin .active') || {}).dataset,
      lanes: [...document.querySelectorAll('#sdk-slanes .sdk-lane')].map(b => b.dataset.lane).join(),
      parts: document.querySelectorAll('#sdk-parts .sdk-pd[data-part]').length,
      canvasRole: document.getElementById('sdk-canvas').getAttribute('role'), tipsEl: document.getElementById('sdk-stips').tagName + '.' + document.getElementById('sdk-stips').className,
      tips, sent: __sentAll() - sent0, running: __sc.running(), frozen: document.getElementById('sdk-sfreeze').getAttribute('aria-pressed'),
      sout: document.getElementById('sdk-sout').checked, clock: document.getElementById('sdk-sclock').textContent, css: !!document.getElementById('css-synthscope')
    };
  });
  console.log('  (path: ' + (m.deck ? 'App.synthDeck' : 'standalone SLSynthScope') + ')');
  ok(m.missing.length === 0 && m.css, 'toolbar, canvas, part dots, status and tips are all there, CSS injected once' + (m.missing.length ? ': missing ' + m.missing : ''));
  ok(m.wins === '1,2,4,8' && m.activeWin && m.activeWin.win === '4' && m.lanes === '95,17,1,74' && m.parts === 16 && m.canvasRole === 'img', 'window seg 1/2/4/8 (4 active), the four default lanes, 16 Part dots, canvas role=img');
  ok(m.tipsEl === 'DETAILS.tips', 'tips live in details.tips#sdk-stips');
  const synthTips = m.tips.filter(t => /^Check on the synth:/.test(t));
  ok(synthTips.length >= 3 && synthTips.some(t => /Arp MIDI Out/.test(t) && /bypass/.test(t)) && synthTips.some(t => /Clock Out/.test(t) && /MIDI Sync/.test(t)) && synthTips.some(t => /Motion Sequencer/.test(t) && /sends no MIDI/.test(t)),
    'tips name the synth-side switches honestly (Arp MIDI Out + bypass, Clock Out / MIDI Sync, Motion Sequencer sends no MIDI), each "Check on the synth:"');
  ok(m.sent === 0, 'mounting the Scope sends zero bytes');
  ok(m.running === true && m.frozen === 'false' && m.sout === true, 'loop runs on the open, visible Scope; not frozen; Show what I send on');
  ok(/No clock — grid from app tempo 120/.test(m.clock), 'no clock yet: ' + m.clock);

  console.log('# clock: 48 F8 at 20.833 ms → synth 120 BPM');
  const ck = await page.evaluate(() => {
    const t0 = performance.now() - 48 * 20.833 - 5;
    for (let i = 0; i < 48; i++) __sc.feed([0xF8], 'in', t0 + i * 20.833, 'in1');
    __sc.frame();
    const s = __sc.state();
    return { source: s.source, bpm: s.bpm, clockN: s.counts.clock, text: document.getElementById('sdk-sclock').textContent, beat: s.beat, bar: s.bar, bpb: s.bpb };
  });
  ok(ck.source === 'synth' && ck.bpm >= 119 && ck.bpm <= 121 && ck.clockN === 48, 'source synth, bpm ' + ck.bpm.toFixed(2) + ', 48 clocks counted');
  ok(/^Clock: synth 1(19|20|21)\.\d BPM$/.test(ck.text), 'clock line: ' + ck.text);
  ok(ck.bpb === 4 && ck.beat >= 0 && ck.beat < 4 && Number.isInteger(ck.bar), 'beat within a 4/4 bar: beat ' + ck.beat + ' bar ' + ck.bar);
  const ckStart = await page.evaluate(() => {
    // Start resets the phase: the next tick is beat 0 of a bar
    const now = performance.now();
    __sc.feed([0xFA], 'in', now - 60);
    for (let i = 0; i < 2; i++) __sc.feed([0xF8], 'in', now - 50 + i * 20.833);
    const s = __sc.state();
    return { beat: s.beat, source: s.source, bar: s.bar };
  });
  ok(ckStart.source === 'synth' && ckStart.beat === 0, 'FA resets the beat phase: beat ' + ckStart.beat);

  console.log('# notes per channel, part dots, bus input');
  const nt = await page.evaluate(() => {
    const n = performance.now(), in0 = __sc.state().counts.in;
    __sc.feed([0x92, 60, 100], 'in', n - 300, 'in1');
    __sc.feed([0x92, 64, 90], 'in', n - 250, 'in1');
    __sc.feed([0x82, 60, 0], 'in', n - 100, 'in1');
    __sc.feed([0x90, 48, 80], 'in', n - 50, 'in1');
    __recv([0x93, 62, 100]); // the real input → 'midi:raw' → the scope
    __recv([0xFE]);          // active sensing: ignored
    __sc.frame();
    const s = __sc.state();
    return {
      notes: s.notes.map(x => [x.ch, x.n, x.vel, x.t1 === null ? 'open' : 'closed', x.dir].join(':')),
      parts: s.parts, lit: document.querySelectorAll('#sdk-parts .sdk-pd.lit').length,
      stat: document.getElementById('sdk-sstat').textContent, inDelta: s.counts.in - in0
    };
  });
  ok(nt.notes.includes('2:60:100:closed:in') && nt.notes.includes('2:64:90:open:in') && nt.notes.includes('0:48:80:open:in'), 'note bars: 0x92 opens, 0x82 closes the latest open bar of that ch+note: ' + J(nt.notes));
  ok(nt.notes.includes('3:62:100:open:in') && nt.inDelta === 5, 'a note from the real input port arrives through midi:raw; active sensing is not counted: +' + nt.inDelta + ' in');
  ok(nt.parts[0] && nt.parts[2] && nt.parts[3] && !nt.parts[5] && nt.parts.length === 16, 'parts[] flags channels 1, 3 and 4 only: ' + J(nt.parts));
  ok(nt.lit >= 1, 'a Part dot lights right after a note-on: ' + nt.lit + ' lit');
  ok(/notes\/s · busiest Part 3 · \d+ clocks\/s/.test(nt.stat), 'status line names the busiest Part: ' + nt.stat);

  console.log('# CC lanes');
  const cc = await page.evaluate(() => {
    __sc.feed([0xB0, 95, 100], 'in'); __sc.feed([0xB0, 95, 110], 'in'); __sc.feed([0xB0, 20, 5], 'in');
    __sc.frame();
    const s = __sc.state();
    return { l95: s.lanes['95'], has20: '20' in s.lanes, keys: Object.keys(s.lanes).sort((a, b) => a - b).join() };
  });
  ok(cc.l95 && cc.l95.last === 110 && cc.l95.n === 2 && cc.l95.cc === 95 && cc.l95.name === 'Super Knob', 'lane 95 keeps its points and last value, named from api.ccName: ' + J(cc.l95));
  ok(!cc.has20 && cc.keys === '1,17,74,95', 'a CC that is not a lane is not buffered: ' + cc.keys);

  console.log('# midi:out filter: music to the synth port only');
  const of = await page.evaluate(() => {
    const before = __sc.state().notes.length;
    App.emit('midi:out', { bytes: [0x90, 67, 100], kind: 'led', portId: 'out1', port: 'MODX-1' });
    App.emit('midi:out', { bytes: [0x90, 67, 100], kind: 'music', portId: 'lumi', port: 'LUMI Keys BLOCK' });
    const mid = __sc.state().notes.length;
    SLMidiHub.api.send([0x90, 67, 100]); SLMidiHub.api.send([0x80, 67, 0]); SLMidiHub.api.send([0xB0, 74, 50]);
    __sc.frame();
    const s = __sc.state(), last = s.notes[s.notes.length - 1];
    return { hubOut: SLMidiHub.outId, before, mid, after: s.notes.length, last, lane74: s.lanes['74'], outCount: s.counts.out, toOut1: __by.out1.map(b => b.join(' ')) };
  });
  ok(of.hubOut === 'out1' && of.toOut1.join('|') === '144 67 100|128 67 0|176 74 50', 'the Hub sends to MODX-1 (the LUMI stays the key-light output): ' + of.toOut1.join('|'));
  ok(of.mid === of.before, 'led-kind writes and music to another port are ignored');
  ok(of.after === of.before + 1 && of.last && of.last.dir === 'out' && of.last.n === 67 && of.last.ch === 0 && of.last.t1 !== null, 'what the Hub sends the synth is drawn as dir out (and closed by its note-off): ' + J(of.last));
  ok(of.lane74 && of.lane74.last === 50 && of.outCount === 3, 'an outgoing CC lands in its lane: ' + J(of.lane74) + ' out=' + of.outCount);

  console.log('# frame + canvas size');
  const fr = await page.evaluate(() => {
    let err = null; try { __sc.frame(); __sc.frame(); } catch (e) { err = String(e); }
    const c = document.getElementById('sdk-canvas');
    return { err, w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight, dpr: window.devicePixelRatio };
  });
  ok(!fr.err && fr.w > 0 && fr.h > 0, 'frame() draws without error: ' + fr.w + 'x' + fr.h + (fr.err ? ' ' + fr.err : ''));
  ok(fr.cssW > 0 && fr.cssH === 240 && fr.w === Math.round(fr.cssW * Math.min(2, fr.dpr)), 'canvas 240 px tall, backing store = css × dpr (≤ 2): ' + J(fr));
  await page.setViewportSize({ width: 390, height: 800 });
  const ph = await page.evaluate(() => new Promise(r => requestAnimationFrame(() => {
    __sc.frame();
    const c = document.getElementById('sdk-canvas');
    r({ cssH: c.clientHeight, cssW: c.clientWidth, w: c.width, scroll: document.documentElement.scrollWidth, inner: window.innerWidth, touch: getComputedStyle(c).touchAction });
  })));
  ok(ph.cssH === 200 && ph.cssW > 0 && ph.cssW <= 390 && ph.w > 0, 'phone width: canvas 200 px tall and inside the viewport: ' + J(ph));
  ok(ph.scroll <= ph.inner, 'no horizontal page scroll at 390 px: ' + ph.scroll + ' <= ' + ph.inner);
  ok(ph.touch === 'pan-y', 'canvas touch-action pan-y (the page still scrolls over it)');
  await page.setViewportSize({ width: 1200, height: 900 });

  console.log('# running only on the active Scope, visible page');
  const rg = await page.evaluate(() => {
    const o = {};
    o.r0 = __sc.running();
    __sc.active(false); o.r1 = __sc.running();
    const before = __sc.state().notes.length; __recv([0x94, 70, 100]); o.ignored = __sc.state().notes.length === before;
    __sc.active(true); o.r2 = __sc.running();
    __recv([0x94, 71, 100]); o.heard = __sc.state().notes.length === before + 1;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'));
    o.r3 = __sc.running();
    delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));
    o.r4 = __sc.running();
    App.switchTo('piano'); __sc.leave(); o.r5 = __sc.running();
    App.switchTo('midihub'); __sc.back(); o.r6 = __sc.running();
    return o;
  });
  ok(rg.r0 && !rg.r1 && rg.ignored && rg.r2 && rg.heard, 'inactive: loop stopped and input ignored; active again: running and buffering: ' + J(rg));
  ok(!rg.r3 && rg.r4, 'document hidden stops the loop, visible restarts it');
  ok(!rg.r5 && rg.r6, 'leaving the page stops it (' + (m.deck ? 'deck stop' : 'stop()') + '), coming back to the Scope restarts it');

  console.log('# toolbar: window, lanes, freeze, show-out');
  const dt = await page.evaluate(() => {
    const o = {}, sent0 = __sentAll();
    __changes.length = 0;
    document.querySelector('#sdk-swin [data-win="8"]').click();
    o.win = __sc.state().win; o.act = (document.querySelector('#sdk-swin .active') || {}).dataset.win; o.pressed = document.querySelector('#sdk-swin [data-win="8"]').getAttribute('aria-pressed');
    document.querySelector('#sdk-slanes .sdk-lane[data-lane="17"]').click();
    o.lanes1 = SLSynthScope.lanes().join(); o.chips1 = [...document.querySelectorAll('#sdk-slanes .sdk-lane')].map(b => b.dataset.lane).join();
    o.addVisible = !document.getElementById('sdk-addlane').hidden;
    document.getElementById('sdk-addlane').click();
    const inp = document.getElementById('sdk-lanenum'); o.form = !!inp;
    inp.value = '11'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    o.lanes2 = SLSynthScope.lanes().join();
    o.chip11 = (document.querySelector('#sdk-slanes .sdk-lane[data-lane="11"]') || {}).textContent;
    o.addHidden = document.getElementById('sdk-addlane').hidden; o.formGone = !document.getElementById('sdk-lanenum');
    __sc.feed([0xB0, 11, 77], 'in'); o.l11 = __sc.state().lanes['11']; o.l17gone = !('17' in __sc.state().lanes);
    document.getElementById('sdk-sfreeze').click();
    o.fz = document.getElementById('sdk-sfreeze').getAttribute('aria-pressed'); o.rf = __sc.running(); o.fzState = __sc.state().frozen;
    document.getElementById('sdk-canvas').click();
    o.fz2 = document.getElementById('sdk-sfreeze').getAttribute('aria-pressed'); o.rf2 = __sc.running();
    const so = document.getElementById('sdk-sout'); so.checked = false; so.dispatchEvent(new Event('change', { bubbles: true }));
    o.showOut = __sc.state().showOut;
    SLSynthScope.setShowOut(true); o.soutBack = document.getElementById('sdk-sout').checked;
    o.changes = __changes.slice();
    o.sent = __sentAll() - sent0;
    return o;
  });
  ok(dt.win === 8 && dt.act === '8' && dt.pressed === 'true', 'window seg → 8 bars (active + aria-pressed)');
  ok(dt.lanes1 === '95,1,74' && dt.chips1 === '95,1,74' && dt.addVisible, 'tapping a lane chip removes it; + lane shows again with a free slot');
  ok(dt.form && dt.lanes2 === '95,1,74,11' && /CC 11 Expression/.test(dt.chip11) && dt.addHidden && dt.formGone, '+ lane → number input, Enter adds CC 11 (named), + lane hides at four lanes: ' + dt.lanes2);
  ok(dt.l11 && dt.l11.last === 77 && dt.l17gone, 'the new lane buffers, the removed one is dropped');
  ok(dt.fz === 'true' && !dt.rf && dt.fzState && dt.fz2 === 'false' && dt.rf2, 'Freeze stops the loop (aria-pressed); tapping the canvas unfreezes');
  ok(dt.showOut === false && dt.soutBack === true, 'Show what I send follows the checkbox and setShowOut');
  if (m.deck) {
    const persisted = await page.waitForFunction(() => { const d = App.store.get('midihub.deck', null); return !!(d && d.scope && d.scope.win === 8 && String(d.scope.lanes) === '95,1,74,11'); }, null, { timeout: 3000 }).then(() => true).catch(() => false);
    ok(persisted, 'the deck persists scope toolbar changes into midihub.deck.scope');
  } else {
    ok(dt.changes.length >= 4 && dt.changes[0].win === 8 && dt.changes.some(c => String(c.lanes) === '95,1,74,11') && dt.changes.some(c => c.showOut === false), 'onChange reports every toolbar change: ' + J(dt.changes.map(c => [c.win, c.lanes.join('/'), c.showOut])));
  }
  ok(dt.sent === 0, 'the toolbar, lanes, freeze and the canvas tap send zero bytes: ' + dt.sent);

  console.log('# theme + buffers');
  const th = await page.evaluate(() => new Promise(r => {
    const o = {};
    document.documentElement.setAttribute('data-theme', 'light');
    setTimeout(() => {
      let err = null; try { __sc.frame(); } catch (e) { err = String(e); }
      o.err = err;
      // 1100 notes → the buffer stays capped at 1024; frame() still fine
      const n = performance.now();
      for (let i = 0; i < 1100; i++) __sc.feed([0x91, 36 + (i % 48), 100], 'in', n - 10, 'in1');
      __sc.frame();
      o.notes = __sc.state().notes.length;
      document.documentElement.setAttribute('data-theme', 'dark');
      r(o);
    }, 30);
  }));
  ok(!th.err, 'theme switch re-reads the colour tokens and draws');
  ok(th.notes <= 1024, 'note buffer capped at 1024: ' + th.notes);

  if (!m.deck) {
    const um = await page.evaluate(() => { SLSynthScope.unmount(); return { running: SLSynthScope.running, active: SLSynthScope.active, empty: document.getElementById('sdk-scope-tab').children.length === 0, canvas: !!document.getElementById('sdk-canvas') }; });
    ok(!um.running && !um.active && um.empty && !um.canvas, 'unmount stops the loop and empties the box');
  }

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
  await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
