// Keyboard lights + the app-wide Help level, against a simulated ROLI LUMI
// (a fake Web MIDI access that records every byte sent): one engine for all
// pages, the LUMI scale layout over SysEx, tonic / guide / reveal lights by
// Help level, the keyboard's octave range followed from played notes, pads
// owning the keybed, lights off, a non-LUMI keyboard, the control center.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

async function newPage(browser, name, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(([name, seed]) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
    window.__sent = [];
    const inp = { id: 'in1', name, onmidimessage: null };
    const out = { id: 'out1', name, send: b => window.__sent.push(Array.from(b)) };
    window.__in = inp;
    const access = { inputs: new Map([['in1', inp]]), outputs: new Map([['out1', out]]), sysexEnabled: true, onstatechange: null };
    navigator.requestMIDIAccess = () => Promise.resolve(access);
    // what the keybed shows: replay note on/off; last LUMI mode from SysEx
    window.__lit = () => { const l = {}; window.__sent.forEach(b => { if (b[0] === 0x90) l[b[1]] = b[2]; else if (b[0] === 0x80) delete l[b[1]]; }); return l; };
    window.__mode = () => { let m = null; window.__sent.forEach(b => { if (b[0] === 0xf0 && b[6] === 0x10 && b[7] === 0x40 && (b[8] & 0x1f) === 0x02) m = (b[8] >> 5) | (b[9] << 2); }); return m; };
    window.__play = (n) => { inp.onmidimessage({ data: new Uint8Array([0x90, n, 100]) }); inp.onmidimessage({ data: new Uint8Array([0x80, n, 0]) }); };
  }, [name, seed || {}]);
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.midi.hasOutput && App.active === 'quiz');
  return { ctx, page, errs };
}
const keys = o => Object.keys(o).map(Number).sort((a, b) => a - b);

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  let { ctx, page, errs } = await newPage(browser, 'LUMI Keys BLOCK');

  console.log('# a LUMI, Help level by Help level');
  const lv = await page.evaluate(() => {
    App.emit('fb:set', { source: 't', root: 0, scale: 'major', mode: 1 });
    const out = { lumi: App.midi.lumi, on: App.midi.lightsOn, range: App.midi.range() };
    for (const h of [4, 3, 2, 1, 0]) { App.help.set(h); const l = __lit(); out[h] = { mode: __mode(), lit: Object.keys(l).map(Number).sort((a, b) => a - b), vel: l }; }
    out.chip = App.midi.lumiColor('#6ea8fe');
    return out;
  });
  ok(lv.lumi && lv.on && lv.range.lo === 48 && lv.range.keys === 24, 'LUMI detected by name, lights on, 24 keys from C3: ' + JSON.stringify(lv.range));
  // C major in C3-B4, default palette -> the LUMI's own color table (velocity = color)
  const deg = { 0: 23, 2: 34, 4: 60, 5: 74, 7: 97, 9: 116, 11: 6 };
  const colorsOk = l => l.lit.length === 14 && l.lit.every(m => deg[m % 12] === l.vel[m]);
  ok(lv[4].mode === 3 && colorsOk(lv[4]), 'Full: every scale key in its own degree color (velocity = LUMI color), dark background: ' + JSON.stringify(lv[4].vel));
  ok(lv[3].mode === 3 && colorsOk(lv[3]), 'Colors: the same per-key coloration');
  ok(lv.chip === '#439af5', 'the sheet shows the LUMI color each screen color becomes: ' + lv.chip);
  ok(lv[2].mode === 3 && lv[2].lit.join() === '48,60' && lv[1].lit.join() === '48,60' && lv[1].vel[48] === 23, 'Target / Tonic: only the home keys, in the home color: ' + lv[1].lit);
  ok(lv[0].mode === 3 && lv[0].lit.length === 0, 'None: nothing lit');
  const col = await page.evaluate(() => {
    App.help.set(4); const from = __sent.length; App.store.set('lights.bright', 40); App.midi.repaint();
    const sx = __sent.slice(from).filter(b => b[0] === 0xf0 && b[6] === 0x10);
    return { bright: sx.some(b => b[7] === 0x40 && (b[8] & 0x1f) === 0x04 && ((b[8] >> 5) | (b[9] << 2)) === 40),
      night: sx.some(b => b[7] === 0x40 && (b[8] & 0x1f) === 0x02 && ((b[8] >> 5) | (b[9] << 2)) === 3) };
  });
  ok(col.bright && col.night, 'a repaint re-sends the dark background and the brightness: ' + JSON.stringify(col));

  console.log('# guide lights obey the Help level');
  const gd = await page.evaluate(() => {
    const o = {};
    for (const h of [4, 2, 1]) { App.help.set(h); App.midi.guide(64, 65); o[h] = __lit(); }
    App.midi.guide(null, null); o.clear = __lit();
    return o;
  });
  ok(gd[4][64] === 127 && gd[4][65] === 74 && gd[4][60] === 23, 'Full: the note to play white, the next one blinking in its color, the rest of the scale stays colored');
  ok(gd[2][64] === 127 && !gd[2][65], 'Target: only the note to play');
  ok(!gd[1][64] && keys(gd[1]).join() === '48,60', 'Tonic: no guide, home keys only');
  const blink = await page.evaluate(async () => { App.help.set(4); App.midi.guide(64, 65); const a = __lit()[65]; await new Promise(r => setTimeout(r, 350)); const b = __lit()[65]; App.midi.guide(null, null); App.help.set(1); return [a, b]; });
  ok(blink[0] === 74 && blink[1] === undefined, 'the next note really blinks (color, off): ' + JSON.stringify(blink));
  ok(keys(gd.clear).join() === '48,60', 'guide cleared, the layout stays');

  console.log('# the octave buttons are followed');
  const oc = await page.evaluate(() => {
    let ev = null; App.on('midi:range', r => { ev = r; });
    App.help.set(2);
    App.switchTo('piano');
    __play(30);                      // LUMI octave-down twice, then a key: the app follows
    App.midi.guide(64, null);
    const o = { ev, lit: Object.keys(__lit()).map(Number).sort((a, b) => a - b), label: (document.querySelector('.pn-rangel') || {}).textContent };
    __play(70);                      // back up
    o.back = App.midi.range();
    o.stored = JSON.parse(localStorage.getItem('guitarlab.midi.rangeLo'));
    App.midi.guide(null, null);
    return o;
  });
  ok(oc.ev && oc.ev.lo === 24 && oc.ev.hi === 47, 'playing below the range shifts it by octaves: ' + JSON.stringify(oc.ev));
  ok(oc.lit.join() === '24,36,40', 'tonic + guide lights move to the new octave (E4 guide -> E2): ' + oc.lit);
  ok(/LUMI C1–B2/.test(oc.label || ''), 'the Keys page marks the keys the LUMI covers: ' + oc.label);
  ok(oc.back.lo === 48 && oc.stored === 48, 'and follows it back up (remembered)');

  console.log('# Exercises, Pads, lights off');
  const ex = await page.evaluate(async () => {
    App.help.set(2);
    App.switchTo('quiz');
    SLQuiz.start('notes/nat/treble/3');                        // play the note you see
    const o = { q: SLQuiz.q.kind, during: Object.keys(__lit()).length, mode: __mode() };
    const want = SLQuiz.q.pc, wrong = (want + 1) % 12;
    __play(60 + wrong);
    o.reveal = Object.keys(__lit()).map(Number).filter(m => m % 12 === want).length;
    o.revealOnly = Object.keys(__lit()).map(Number).every(m => m % 12 === want);
    App.help.set(1); App.midi.reveal([want], 500);
    o.noRevealAtTonic = Object.keys(__lit()).length;
    SLQuiz.tab && document.getElementById('qz-back') && document.getElementById('qz-back').click();
    await new Promise(r => setTimeout(r, 50));
    o.after = Object.keys(__lit()).map(Number).sort((a, b) => a - b).join();
    return o;
  });
  ok(ex.q === 'single' && ex.during === 0 && ex.mode === 3, 'an Exercises question darkens the keybed (no hints from the layout)');
  ok(ex.reveal === 2 && ex.revealOnly, 'after you play, the right note lights in both octaves (Help: Target)');
  ok(ex.noRevealAtTonic === 0, 'at Tonic and below the answer is not shown');
  ok(ex.after === '48,60', 'back on the path, the layout returns: ' + ex.after);
  const pd = await page.evaluate(async () => {
    App.help.set(4);
    __sent.length = 0;
    App.switchTo('pads');
    const o = { mode: __mode(), lit: Object.keys(__lit()).length };
    App.emit('fb:set', { source: 't', root: 2, scale: 'major' });       // the engine keeps out while pads own the keys
    o.noScale = !__sent.some(b => b[0] === 0xf0 && b[6] === 0x10 && b[7] === 0x40 && (b[8] & 0x1f) === 0x02 && ((b[8] >> 5) | (b[9] << 2)) === 1);
    App.switchTo('piano');
    o.back = __mode();
    App.midi.setLightsOn(false);
    o.offMode = __mode();
    __sent.length = 0;
    App.emit('fb:set', { source: 't', root: 7, scale: 'major' });
    App.midi.guide(60, 62);
    o.offSent = __sent.length;
    App.midi.setLightsOn(true);
    o.onMode = __mode();
    return o;
  });
  ok(pd.mode === 3 && pd.lit === 8 && pd.noScale, 'Pads own the keybed: LUMI dark, its 8 pad keys lit, no scale pushes meanwhile');
  ok(pd.back === 3, 'leaving Pads hands the keybed back to the app');
  ok(pd.offSent === 0 && pd.onMode === 3 && pd.offMode === 1, 'lights off: the LUMI gets its own scale display back and is left alone; on again repaints');

  console.log('# control center');
  const cc = await page.evaluate(() => {
    App.switchTo('lights');
    const o = { open: App.sheet === 'lights', status: document.querySelector('.lc-status').textContent };
    document.querySelector('[data-lchelp="3"]').click();
    o.level = App.help.level();
    o.keysSeg = document.querySelector('#pn-assist .active').textContent;
    o.desc = document.querySelector('.lc-desc').textContent;
    App.keys.setAssist(0);
    o.mirror = document.querySelector('.lc-help .active').textContent;
    document.querySelector('[data-lctype="0"]').click();
    o.other = App.midi.lumi;
    document.querySelector('[data-lctype=""]').click();
    o.auto = App.midi.lumi;
    return o;
  });
  ok(cc.open && /ROLI LUMI · playing C3–B4/.test(cc.status), 'Lights & help opens over the page with the keyboard status: ' + cc.status);
  ok(cc.level === 3 && cc.keysSeg === 'Colors' && /scale in color/.test(cc.desc), 'one Help level: set in the sheet, the Keys page follows');
  ok(cc.mirror === 'None', 'and set on the Keys page, the sheet follows');
  ok(cc.other === false && cc.auto === true, 'keyboard type: Other / Auto (detected)');
  console.log('# pitch bend: off by default, on in Settings');
  const pb = await page.evaluate(() => {
    const got = []; App.on('midi:bend', d => got.push(d));
    const bend = () => __in.onmidimessage({ data: new Uint8Array([0xe0, 0x00, 0x60]) }); // +0.5 of the range
    const o = { def: App.midi.bendOn };
    bend(); o.offCount = got.length;
    App.switchTo('settings');
    o.offActive = document.querySelector('#set-midi-bend .active').textContent;
    document.querySelector('#set-midi-bend [data-bend="12"]').click();
    bend(); o.on = got.slice(-1)[0];
    o.stored = JSON.parse(localStorage.getItem('guitarlab.midi.bendOn'));
    got.length = 0;
    document.querySelector('#set-midi-bend [data-bend="0"]').click();
    o.reset = got.length === 16 && got.every(d => d.semis === 0);
    got.length = 0; bend(); o.offAgain = got.length;
    App.switchTo('quiz');
    return o;
  });
  ok(pb.def === false && pb.offCount === 0 && pb.offActive === 'Off', 'pitch bend is off by default: a LUMI wiggle bends nothing');
  ok(pb.on && pb.on.semis === 6 && pb.stored === true, 'turned on in Settings (±12): bends arrive: ' + JSON.stringify(pb.on));
  ok(pb.reset && pb.offAgain === 0, 'turned off again: held bends released, new ones ignored');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# a non-LUMI LED keyboard');
  ({ ctx, page, errs } = await newPage(browser, 'Launchkey 49'));
  const gk = await page.evaluate(() => {
    App.emit('fb:set', { source: 't', root: 0, scale: 'major', mode: 1 });
    App.help.set(4);
    const o = { lumi: App.midi.lumi, offByDefault: Object.keys(__lit()).length === 0 && !App.midi.lightsOn, sysex: __sent.filter(b => b[0] === 0xf0).length };
    App.midi.setLightsOn(true);
    const lit = __lit();
    o.scaleKeys = Object.keys(lit).map(Number).every(m => [0, 2, 4, 5, 7, 9, 11].includes(m % 12)) && Object.keys(lit).length > 20;
    o.rootBright = lit[60] === 127 && lit[64] === 100 && lit[62] === 72;
    return o;
  });
  ok(gk.lumi === false && gk.offByDefault && gk.sysex === 0, 'other keyboards: no SysEx, lights off until you turn them on (a synth there would play them)');
  ok(gk.scaleKeys && gk.rootBright, 'turned on: the scale keys lit, home brightest, chord tones next');
  ok(errs.length === 0, 'no page errors (generic)');
  await ctx.close();

  console.log('# the Android app bridge (window.SoundLabMidi, same protocol as iOS)');
  {
    const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await ctx2.addInitScript(() => {
      ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
      window.__posts = [];
      window.GuitarLabHost = { shellVersion: () => '0.75.0', setKeepScreenOn: () => {} };
      window.SoundLabMidi = { post: j => {
        const m = JSON.parse(j); window.__posts.push(m);
        if (m.cmd === 'init') setTimeout(() => window.__glMIDI.onports({ inputs: [{ id: 7, name: 'LUMI Keys BLOCK' }], outputs: [{ id: 7, name: 'LUMI Keys BLOCK' }] }), 0);
        if (m.cmd === 'bluetooth') setTimeout(() => window.__glMIDI.onstatus('Connected: LUMI Keys BLOCK'), 0);
      } };
    });
    const p2 = await ctx2.newPage(), e2 = [];
    p2.on('pageerror', e => e2.push(e.message));
    await p2.goto(env.URL);
    await p2.waitForFunction(() => window.App && App.midi && App.midi.hasOutput && App.active === 'quiz');
    const an = await p2.evaluate(async () => {
      const o = { platform: App.midi.platform, native: App.midi.native, lumi: App.midi.lumi, cmds: __posts.map(m => m.cmd) };
      o.setOut = (__posts.find(m => m.cmd === 'setOutput') || {}).id;
      o.sends = __posts.filter(m => m.cmd === 'send').length;
      o.sysex = __posts.some(m => m.cmd === 'send' && m.data[0] === 0xf0);
      o.notes = __posts.some(m => m.cmd === 'send' && m.data[0] === 0x90);
      let got = null; App.on('midi:note', d => { if (d.on) got = d.midi; });
      window.__glMIDI.onmidi(7, [0x90, 62, 100, 0x80, 62, 0]);      // a packed packet, like the bridge sends
      o.got = got;
      App.switchTo('lights');
      document.getElementById('lc-bt').click();
      await new Promise(r => setTimeout(r, 30));
      o.bt = __posts.some(m => m.cmd === 'bluetooth');
      o.status = [...document.querySelectorAll('#panel-lights p')].map(p => p.textContent).join(' | ');
      return o;
    });
    ok(an.platform === 'android' && an.native && an.lumi, 'the APK bridge is picked up as a native MIDI backend: ' + JSON.stringify(an).slice(0, 120));
    ok(an.cmds[0] === 'init' && an.setOut === 7, 'it starts the bridge and picks the LUMI as the output');
    ok(an.sysex && an.notes, 'lights go out through the bridge (SysEx background + per-key note colors): ' + an.sends + ' sends');
    ok(an.got === 62, 'notes from the keyboard arrive as midi:note (packed packets split)');
    ok(an.bt && /Connected: LUMI/.test(an.status), 'Find a Bluetooth keyboard asks the bridge and shows its progress: ' + an.status.slice(0, 120));
    ok(e2.length === 0, 'no page errors (android bridge)');
    await ctx2.close();
  }

  await browser.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
