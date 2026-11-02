// MIDI Hub Player: a MIDI or MusicXML file plays on the synth output only.
// Fake MODX-1 + LUMI ports record every byte. Checks: only Note On/Off and
// sustain reach the synth (program, other CC and SysEx dropped), nothing
// goes to the LUMI, velocity cap, tempo, channels as in file vs one Part,
// pause/stop/Panic/leaving release everything, MusicXML chords/ties/rests/
// voices/tempo, and .mxl (stored and deflated). Test material is synthetic.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await ctx.addInitScript(() => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.lights.on', 'false');
    localStorage.setItem('guitarlab.midi.outputId', JSON.stringify('lumi'));
    localStorage.setItem('guitarlab.midihub.profile', JSON.stringify('yamaha'));
    window.__by = { lumi: [], modx1: [] };
    const mk = (id, name) => ({ id, name, state: 'connected', send: b => window.__by[id].push(Array.from(b)) });
    const outs = new Map([['lumi', mk('lumi', 'LUMI Keys BLOCK')], ['modx1', mk('modx1', 'MODX-1')]]);
    const ins = new Map([['mi', { id: 'mi', name: 'MODX-1', state: 'connected', onmidimessage: null }]]);
    navigator.requestMIDIAccess = () => Promise.resolve({ inputs: ins, outputs: outs, sysexEnabled: true, onstatechange: null });
  });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.midi.hasOutput && App.active === 'quiz');

  // ---- test material (built in the page) ----
  await page.evaluate(() => {
    const vlq = n => { const o = [n & 0x7f]; n >>= 7; while (n) { o.unshift((n & 0x7f) | 0x80); n >>= 7; } return o; };
    const trk = evs => { const body = []; evs.forEach(([dt, ...b]) => body.push(...vlq(dt), ...b)); body.push(0, 0xff, 0x2f, 0); return [0x4d, 0x54, 0x72, 0x6b, (body.length >>> 24) & 255, (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255, ...body]; };
    const name = [...'Test tune'].map(c => c.charCodeAt(0));
    const t0 = trk([[0, 0xff, 0x03, name.length, ...name], [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]]); // 120 bpm
    // ch1: program change, sysex, C4 E4 (sustain on), restrike C4, mod wheel; ch2: C3
    const t1 = trk([[0, 0xc0, 5], [0, 0xf0, 3, 0x7e, 0x7f, 0xf7], [0, 0xb0, 64, 127], [0, 0x90, 60, 100], [0, 0x91, 48, 90],
      [240, 0x90, 64, 120], [0, 0xb0, 1, 40], [240, 0x90, 60, 80], [0, 0x80, 64, 0], [240, 0x80, 60, 0], [0, 0x81, 48, 0], [0, 0xb0, 64, 0], [0, 0x80, 60, 0]]);
    const hd = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, 0x01, 0xe0];
    window.__mid = new Uint8Array([...hd, ...t0, ...t1]).buffer;
    window.__xml = '<?xml version="1.0"?><score-partwise version="3.1"><work><work-title>Two voices</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part><score-part id="P2"><part-name>Bass</part-name></score-part></part-list>' +
      '<part id="P1"><measure number="1"><attributes><divisions>2</divisions></attributes><direction><sound tempo="120"/></direction>' +
      '<note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>' +
      '<note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>' +
      '<note><rest/><duration>2</duration><voice>1</voice></note>' +
      '<note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><tie type="start"/><voice>1</voice></note>' +
      '<backup><duration>8</duration></backup><note><pitch><step>G</step><octave>3</octave></pitch><duration>8</duration><voice>2</voice></note></measure>' +
      '<measure number="2"><note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration><tie type="stop"/><voice>1</voice></note>' +
      '<note><grace/><pitch><step>A</step><octave>4</octave></pitch><voice>1</voice></note><note><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note></measure></part>' +
      '<part id="P2"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>2</octave></pitch><duration>4</duration></note></measure></part></score-partwise>';
    const enc = new TextEncoder();
    window.__zip = async deflate => {
      const files = [['META-INF/container.xml', '<?xml version="1.0"?><container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>'], ['score.xml', window.__xml]];
      const parts = [], central = []; let off = 0;
      for (const [nm, txt] of files) {
        let data = enc.encode(txt), method = 0;
        if (deflate) { data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); method = 8; }
        const n = enc.encode(nm), lh = new DataView(new ArrayBuffer(30));
        lh.setUint32(0, 0x04034b50, true); lh.setUint16(8, method, true); lh.setUint32(18, data.length, true); lh.setUint16(26, n.length, true);
        const ch = new DataView(new ArrayBuffer(46));
        ch.setUint32(0, 0x02014b50, true); ch.setUint16(10, method, true); ch.setUint32(20, data.length, true); ch.setUint16(28, n.length, true); ch.setUint32(42, off, true);
        parts.push(new Uint8Array(lh.buffer), n, data); central.push(new Uint8Array(ch.buffer), n);
        off += 30 + n.length + data.length;
      }
      const cdSize = central.reduce((s, a) => s + a.length, 0), end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
      return new Blob([...parts, ...central, new Uint8Array(end.buffer)]).arrayBuffer();
    };
  });

  console.log('# the Player view');
  const v = await page.evaluate(() => {
    App.switchTo('midihub');
    document.querySelector('#mh-views [data-view="player"]').click();
    return {
      views: [...document.querySelectorAll('#mh-views button')].map(b => b.dataset.view).slice(0, 3).join(','),
      shown: [...document.querySelectorAll('.mh-view')].filter(x => !x.hidden).map(x => x.dataset.view).join(),
      out: document.getElementById('mh-plout').textContent, playDisabled: document.getElementById('mh-plplay').disabled,
      accept: document.getElementById('mh-plfile').accept
    };
  });
  ok(v.views === 'control,player,play' && v.shown === 'player', 'Player sits next to Control: ' + v.views);
  ok(/MODX-1/.test(v.out) && v.playDisabled && /\.mid/.test(v.accept) && /\.mxl/.test(v.accept), 'it targets the synth out (MODX-1), Play waits for a file: ' + v.out);

  console.log('# a MIDI file');
  const m1 = await page.evaluate(async () => {
    App.store.set('midihub.plVel', 60); App.store.set('midihub.plTempo', 150); App.store.set('midihub.plRoute', 'file');
    const sum = await SLMidiHub.player.loadFile('test.mid', window.__mid);
    __by.modx1.length = 0; __by.lumi.length = 0;
    SLMidiHub.player.play();
    const deadline = performance.now() + 4000;
    while (SLMidiHub.player.state.playing && performance.now() < deadline) await new Promise(r => setTimeout(r, 30));
    return { sum, info: document.getElementById('mh-plinfo').textContent, warn: document.getElementById('mh-plwarn').textContent, sent: __by.modx1.slice(), lumi: __by.lumi.length, state: SLMidiHub.player.state };
  });
  const st = m1.sent.map(b => b[0] & 0xf0), ons = m1.sent.filter(b => (b[0] & 0xf0) === 0x90), offs = m1.sent.filter(b => (b[0] & 0xf0) === 0x80);
  ok(m1.sum.title === 'Test tune' && m1.sum.notes === 4 && m1.sum.channels.join() === '1,2' && /Test tune/.test(m1.info), 'reads title, 4 notes (one re-struck), channels 1 and 2: ' + JSON.stringify(m1.sum));
  ok(/left out/.test(m1.warn), 'says what it leaves out: ' + m1.warn);
  const infoLine = await page.evaluate(() => { const m = document.querySelector('#mh-plwarn .muted'); return m ? m.textContent : ''; });
  ok(/left out/.test(infoLine) && /own sound/.test(infoLine), 'the left-out program / controller line is a plain note (muted: every scan has one), not a red warning: ' + infoLine);
  ok(st.every(s => s === 0x90 || s === 0x80 || s === 0xb0) && m1.sent.filter(b => (b[0] & 0xf0) === 0xb0).every(b => b[1] === 64), 'only notes and the sustain pedal reach the synth (no program, mod wheel or SysEx)');
  ok(ons.length === 4 && offs.length === 4 && m1.lumi === 0, 'every note played and released, nothing sent to the LUMI: ' + ons.length + ' on / ' + offs.length + ' off');
  ok(Math.max(...ons.map(b => b[2])) === 60 && ons.some(b => b[0] === 0x91 && b[1] === 48), 'loudest note = the cap (60); channel 2 kept: ' + ons.map(b => b.join(' ')).join('|'));
  ok(!m1.state.playing && m1.state.held === 0 && m1.sent.some(b => b[0] === 0xb0 && b[2] === 0), 'it finishes on its own with nothing held and the pedal up');
  const i60 = m1.sent.findIndex((b, i) => i > m1.sent.findIndex(x => x[0] === 0x90 && x[1] === 60) && b[0] === 0x90 && b[1] === 60);
  ok(i60 > 0 && m1.sent.slice(0, i60).some(b => b[0] === 0x80 && b[1] === 60), 'a re-struck note is released before it sounds again');

  console.log('# one Part, tempo, pause, Panic, leaving');
  const m2 = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('#mh-parts [data-part="2"]').click(); // Part 3
    document.querySelector('#mh-views [data-view="player"]').click();
    document.querySelector('[data-plroute="part"]').click();
    App.store.set('midihub.plTempo', 50);
    __by.modx1.length = 0;
    SLMidiHub.player.play(); await wait(260);
    const mid = { held: SLMidiHub.player.state.held, label: document.getElementById('mh-plpartlab').textContent };
    SLMidiHub.player.pause();
    const afterPause = { held: SLMidiHub.player.state.held, playing: SLMidiHub.player.state.playing, sent: __by.modx1.slice(), btn: document.getElementById('mh-plplay').textContent };
    SLMidiHub.player.play(); await wait(120);
    document.getElementById('mh-panic').click();
    const afterPanic = SLMidiHub.player.state;
    SLMidiHub.player.play(); await wait(120);
    App.switchTo('piano');
    const afterLeave = SLMidiHub.player.state;
    App.switchTo('midihub');
    return { mid, afterPause, afterPanic, afterLeave };
  });
  const p = m2.afterPause.sent, pOn = p.filter(b => (b[0] & 0xf0) === 0x90).length, pOff = p.filter(b => (b[0] & 0xf0) === 0x80).length;
  ok(p.filter(b => (b[0] & 0xf0) === 0x90).every(b => b[0] === 0x92) && /All on Part 3/.test(m2.mid.label), 'All on one Part: every note on channel 3: ' + m2.mid.label);
  ok(m2.mid.held > 0 && m2.afterPause.held === 0 && !m2.afterPause.playing && pOff >= pOn && p.some(b => b[0] === 0xb2 && b[1] === 64 && b[2] === 0) && m2.afterPause.btn === 'Play', 'Pause releases every held note and lifts the pedal: ' + pOn + ' on / ' + pOff + ' off');
  ok(!m2.afterPanic.playing && m2.afterPanic.held === 0, 'Panic stops the player');
  ok(!m2.afterLeave.playing && m2.afterLeave.held === 0, 'leaving the MIDI tab pauses it with nothing held');

  console.log('# MusicXML and .mxl');
  const x = await page.evaluate(async () => {
    App.store.set('midihub.plRoute', 'file'); App.store.set('midihub.plTempo', 100);
    const sum = await SLMidiHub.player.loadFile('two.musicxml', new TextEncoder().encode(window.__xml).buffer);
    __by.modx1.length = 0;
    SLMidiHub.player.play();
    const deadline = performance.now() + 6000;
    while (SLMidiHub.player.state.playing && performance.now() < deadline) await new Promise(r => setTimeout(r, 30));
    const stored = await SLMidiHub.player.loadFile('two.mxl', await window.__zip(false));
    const deflated = await SLMidiHub.player.loadFile('two.mxl', await window.__zip(true));
    let bad = '';
    try { await SLMidiHub.player.loadFile('nope.musicxml', new TextEncoder().encode('<html></html>').buffer); } catch (e) { bad = e.message; }
    return { sum, sent: __by.modx1.slice(), stored, deflated, bad, warn: document.getElementById('mh-plwarn').textContent };
  });
  const xon = x.sent.filter(b => (b[0] & 0xf0) === 0x90).map(b => (b[0] & 15) + 1 + ':' + b[1]);
  ok(x.sum.title === 'Two voices' && x.sum.notes === 6 && x.sum.channels.join() === '1,2', 'MusicXML: title, 6 notes (chord kept, tie merged, grace left out), parts on channels 1-2: ' + JSON.stringify(x.sum));
  ok(xon.slice(0, 3).sort().join() === '1:55,1:60,1:64' && xon.includes('1:66') && xon.includes('1:70') && xon.includes('2:36'), 'pitches: C4+E4 chord with the second voice G3, F#4 tied, Bb4, bass C2: ' + xon.join(' '));
  ok(Math.abs(x.sum.duration - 3.0) < 0.05, 'the tempo mark sets the length (6 beats at 120 BPM = 3 s): ' + x.sum.duration.toFixed(2));
  ok(x.stored.notes === 6 && x.deflated.notes === 6 && x.stored.title === 'Two voices', '.mxl opens, stored and compressed');
  ok(/MusicXML/.test(x.bad) && /grace/.test(x.warn), 'a non-score is refused with a clear message; grace notes are reported: ' + x.bad);

  console.log('# a reviewed score (Score review / practice format)');
  const r = await page.evaluate(async () => {
    const score = { title: 'Reviewed demo', bpm: 120, len: 4, rhythmKnown: true, notes: [
      { t: 0, d: 1, m: 60, partId: 'P1' }, { t: 0, d: 1, m: 64, partId: 'P1' }, { t: 1, d: 1, rest: true, partId: 'P1' },
      { t: 2, d: 2, m: 67, partId: 'P1', v: 100 }, { t: 0, d: 4, m: 36, partId: 'P2' }] };
    const sum = SLMidiHub.player.loadScore(score);
    App.store.set('midihub.plRoute', 'file'); App.store.set('midihub.plTempo', 200);
    __by.modx1.length = 0; SLMidiHub.player.play();
    const deadline = performance.now() + 4000;
    while (SLMidiHub.player.state.playing && performance.now() < deadline) await new Promise(r => setTimeout(r, 30));
    const ons = __by.modx1.filter(b => (b[0] & 0xf0) === 0x90).map(b => ((b[0] & 15) + 1) + ':' + b[1]);
    const mid = SLMidiHub.scoreToMidi(score);
    const back = await SLMidiHub.player.loadFile('reviewed.mid', mid.buffer);
    const unconfirmed = SLMidiHub.player.loadScore(Object.assign({}, score, { rhythmKnown: false }));
    let bad = '';
    try { SLMidiHub.player.loadScore({ bpm: 120, len: 4, notes: [{ t: 0, d: 1, rest: true }] }); } catch (e) { bad = e.message; }
    SLMidiHub.player.show();
    const shown = [...document.querySelectorAll('.mh-view')].filter(x => !x.hidden).map(x => x.dataset.view).join();
    return { sum, ons, head: String.fromCharCode(...mid.slice(0, 4)), back, unconfirmed, bad, shown };
  });
  ok(r.sum.title === 'Reviewed demo' && r.sum.notes === 4 && r.sum.channels.join() === '1,2' && Math.abs(r.sum.duration - 2) < 0.05, 'loadScore: 4 notes (rest skipped), parts on channels 1-2, 4 beats at 120 = 2 s: ' + JSON.stringify(r.sum));
  ok(r.ons.slice(0, 3).sort().join() === '1:60,1:64,2:36' && r.ons.includes('1:67'), 'it plays the chord, the bass part on channel 2 and the last note: ' + r.ons.join(' '));
  ok(r.head === 'MThd' && r.back.notes === 4 && r.back.channels.join() === '1,2' && Math.abs(r.back.duration - r.sum.duration) < 0.02 && r.back.title === 'Reviewed demo', 'scoreToMidi round-trips through the Player: same notes, channels, length and title: ' + JSON.stringify(r.back));
  ok(r.unconfirmed.warnings.some(w => /not confirmed/.test(w)) && /no pitched notes/.test(r.bad), 'an unconfirmed rhythm is flagged; a score with no notes is refused: ' + r.bad);
  ok(r.shown === 'player', 'player.show() opens the Player view');

  console.log('# key shifter');
  const k = await page.evaluate(async () => {
    // a C major line: C D E F G A B C', then an F# (chromatic)
    const notes = [60, 62, 64, 65, 67, 69, 71, 72].map((m, i) => ({ t: i, d: 1, m, partId: 'P1' })).concat([{ t: 8, d: 1, m: 66, partId: 'P1' }]);
    SLMidiHub.player.loadScore({ title: 'C line', bpm: 240, len: 9, notes });
    const key = SLMidiHub.player.key, info0 = document.getElementById('mh-plkeyinfo').textContent;
    const map = () => [60, 62, 64, 65, 67, 69, 71, 72, 66].map(n => SLMidiHub.player.shiftNote(n));
    const sel = (id, v) => { const e = document.getElementById(id); e.value = String(v); e.dispatchEvent(new Event('change')); };
    const box = document.getElementById('mh-plshift');
    sel('mh-pltrans', 2); const up2 = map();
    sel('mh-pltrans', 0); box.checked = true; box.dispatchEvent(new Event('change'));
    sel('mh-pltr', 0); sel('mh-plts', 'aeolian'); const toMinor = map(); const info1 = document.getElementById('mh-plkeyinfo').textContent;
    sel('mh-pltr', 7); sel('mh-plts', 'major'); const toG = map();
    sel('mh-pltr', 0); sel('mh-plts', 'aeolian');
    App.store.set('midihub.plRoute', 'file'); App.store.set('midihub.plTempo', 200);
    __by.modx1.length = 0; SLMidiHub.player.play();
    const deadline = performance.now() + 4000;
    while (SLMidiHub.player.state.playing && performance.now() < deadline) await new Promise(r => setTimeout(r, 30));
    const played = __by.modx1.filter(b => (b[0] & 0xf0) === 0x90).map(b => b[1]);
    const offs = __by.modx1.filter(b => (b[0] & 0xf0) === 0x80).map(b => b[1]);
    box.checked = false; box.dispatchEvent(new Event('change'));
    return { key, info0, up2, toMinor, info1, toG, played, offs, hidden: document.getElementById('mh-plkeys').hidden, plain: map() };
  });
  ok(k.key.root === 0 && k.key.scale === 'major' && /C major/.test(k.info0), 'it guesses the key: ' + k.info0);
  ok(k.up2.join() === '62,64,66,67,69,71,73,74,68', 'transpose +2 moves every note two semitones: ' + k.up2.join(','));
  ok(k.toMinor.join() === '60,62,63,65,67,68,70,72,66' && /C major as C minor/.test(k.info1), 'C major as C minor: E A B become Eb Ab Bb, F# stays chromatic: ' + k.toMinor.join(',') + ' / ' + k.info1);
  ok(k.toG.join() === '55,57,59,60,62,64,66,67,61', 'C major as G major moves each degree to G major (down a 4th): ' + k.toG.join(','));
  ok(k.played.join() === k.toMinor.join() && k.offs.slice().sort().join() === k.played.slice().sort().join(), 'playback sends the shifted notes, and each Note Off matches its Note On: ' + k.played.join(','));
  ok(k.hidden && k.plain.join() === '60,62,64,65,67,69,71,72,66', 'Change key off: notes as written again');

  console.log('# iPad Safari: no Web MIDI');
  const ictx = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15' });
  await ictx.addInitScript(() => {
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
    try { delete Navigator.prototype.requestMIDIAccess; } catch (e) { /* not there */ }
  });
  const ip = await ictx.newPage();
  ip.on('pageerror', e => errs.push('ipad: ' + e.message));
  await ip.goto(env.URL);
  await ip.waitForFunction(() => window.App && window.SLMidiHub && App.active);
  const ipad = await ip.evaluate(async () => {
    SLMidiHub.player.show();
    await new Promise(r => setTimeout(r, 200));
    const s0 = document.getElementById('mh-status').textContent, hidden = document.getElementById('mh-connect').hidden;
    document.getElementById('mh-enable').click();
    await new Promise(r => setTimeout(r, 200));
    return { s0, hidden, s1: document.getElementById('mh-status').textContent, out: document.getElementById('mh-plout').textContent };
  });
  ok(/Safari and Chrome on iPad have no Web MIDI/.test(ipad.s0) && /Web MIDI browser app/.test(ipad.s0) && !/Chrome or Edge/.test(ipad.s0) && ipad.hidden,
    'iPad Safari: the Hub names the fix (a Web MIDI browser app), not "use Chrome or Edge", and offers no Connect: ' + ipad.s0);
  ok(!/declined or failed/.test(ipad.s1) && /No MIDI in this browser/.test(ipad.out), 'a Connect that cannot work never claims "declined or failed": ' + ipad.s1 + ' / ' + ipad.out);
  await ictx.close();

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close(); await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
