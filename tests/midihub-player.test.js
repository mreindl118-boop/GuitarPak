// MIDI Hub Player: a MIDI or MusicXML file plays on the synth output only.
// Fake MODX-1 + LUMI ports record every byte. Checks: only Note On/Off and
// sustain reach the synth (program, other CC and SysEx dropped), nothing
// goes to the LUMI, velocity cap, tempo, channels as in file vs one Part,
// pause/stop/Panic/leaving release everything, MusicXML chords/ties/rests/
// voices/tempo, and .mxl (stored and deflated). Test material is synthetic.
// 2.0 Phase A3b: the Hub (and this mount of the Player card, js/scoreplayer.js) is in soundLAB
// Gear (gear.html, env.GEAR_URL), which boots on the Deck; "leaving" goes to the Deck.
// Last: the Hub's mount of the card passes no per-mount option (its own no-output line, no ports
// row, no button, a tip that names the Hub, no Open as tab in Gear), with MIDI connected after boot.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await ctx.addInitScript(() => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('soundlab2.' + k, 'true'));
    localStorage.setItem('soundlab2.lights.on', 'false');
    localStorage.setItem('soundlab2.midi.outputId', JSON.stringify('lumi'));
    localStorage.setItem('soundlab2.midihub.profile', JSON.stringify('yamaha'));
    window.__by = { lumi: [], modx1: [] };
    const mk = (id, name) => ({ id, name, state: 'connected', send: b => window.__by[id].push(Array.from(b)) });
    const outs = new Map([['lumi', mk('lumi', 'LUMI Keys BLOCK')], ['modx1', mk('modx1', 'MODX-1')]]);
    const ins = new Map([['mi', { id: 'mi', name: 'MODX-1', state: 'connected', onmidimessage: null }]]);
    navigator.requestMIDIAccess = () => Promise.resolve({ inputs: ins, outputs: outs, sysexEnabled: true, onstatechange: null });
  });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.GEAR_URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.midi.hasOutput && App.active === 'deck');

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
    App.switchTo('deck'); // another page of soundLAB Gear
    const afterLeave = SLMidiHub.player.state;
    App.switchTo('midihub');
    return { mid, afterPause, afterPanic, afterLeave };
  });
  const p = m2.afterPause.sent, pOn = p.filter(b => (b[0] & 0xf0) === 0x90).length, pOff = p.filter(b => (b[0] & 0xf0) === 0x80).length;
  ok(p.filter(b => (b[0] & 0xf0) === 0x90).every(b => b[0] === 0x92) && /All on Part 3/.test(m2.mid.label), 'All on one Part: every note on channel 3: ' + m2.mid.label);
  ok(m2.mid.held > 0 && m2.afterPause.held === 0 && !m2.afterPause.playing && pOff >= pOn && p.some(b => b[0] === 0xb2 && b[1] === 64 && b[2] === 0) && m2.afterPause.btn === 'Play', 'Pause releases every held note and lifts the pedal: ' + pOn + ' on / ' + pOff + ' off');
  ok(!m2.afterPanic.playing && m2.afterPanic.held === 0, 'Panic stops the player');
  ok(!m2.afterLeave.playing && m2.afterLeave.held === 0, 'leaving the Hub page (for the Deck) pauses it with nothing held');

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

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  // The Hub's mount of the card (SLScorePlayer.mount(el, { show })) passes none of the per-mount options the
  // Songs page in soundLAB uses (ports, noOut, connect: tests/oneopen.test.js, from where this half moved in
  // A3b): the Hub header above the card has Connect MIDI, Synth out and the Parts. A profile where MIDI was
  // never connected, so the card starts with no synth output.
  console.log('# the Hub\u2019s mount of the card, MIDI connected after boot');
  const c2 = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await c2.addInitScript(() => {
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('soundlab2.' + k, 'true')); // not midi.wanted: nothing connects at boot
    localStorage.setItem('soundlab2.lights.on', 'false');
    const out = { id: 'modx1', name: 'MODX-1', state: 'connected', send: () => { } };
    const inp = { id: 'mi', name: 'MODX-1', state: 'connected', onmidimessage: null };
    navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map([['mi', inp]]), outputs: new Map([['modx1', out]]), sysexEnabled: true, onstatechange: null });
    window.__card = () => {
      const q = id => document.getElementById(id), tips = document.querySelector('.mh-pl details p'), host = q('mh-player');
      return {
        cards: document.querySelectorAll('.mh-pl').length, inHub: !!host.querySelector('.mh-pl'), seen: host.getBoundingClientRect().height > 0,
        out: q('mh-plout').textContent, tips: tips.textContent.slice(tips.textContent.indexOf('sends everything')),
        row: !!(q('mh-plports') || q('mh-plsynth') || q('mh-plch')), btn: !!q('mh-plconnect'),
        tabBtn: !!q('mh-pltab'), tabLine: /Open as tab is on the Songs page in soundLAB\./.test(host.textContent)
      };
    };
  });
  const p2 = await c2.newPage(), errs2 = [];
  p2.on('pageerror', e => errs2.push(e.message));
  await p2.goto(env.GEAR_URL);
  await p2.waitForFunction(() => window.App && App.midi && window.SLMidiHub && window.SLScorePlayer && App.active === 'deck');
  const hub = await p2.evaluate(() => {
    window.__sameDoc = true; // gone after a reload
    App.switchTo('midihub');
    document.querySelector('#mh-views [data-view="player"]').click();
    const o = { ready: App.midi.ready, songs: typeof App.songs, connect: !!document.getElementById('mh-enable') && document.getElementById('mh-enable').getClientRects().length > 0, card: __card() };
    // Open as tab through the module: there is no Songs page in Gear, so nothing opens and the page stays
    SLMidiHub.player.loadScore({ title: 'Line', bpm: 120, len: 4, notes: [60, 62, 64, 65].map((m, i) => ({ t: i, d: 1, m, partId: 'p1', v: 100 })) });
    o.asTab = SLMidiHub.player.openAsTab(); o.active = App.active; o.file = location.pathname.split('/').pop();
    return o;
  });
  ok(hub.ready === false && hub.card.cards === 1 && hub.card.inHub && hub.card.seen && /connect MIDI above$/.test(hub.card.out) && !hub.card.row && !hub.card.btn,
    'the Hub\u2019s mount passes no option: its own line while there is no output, no ports row, no button: ' + hub.card.out);
  ok(hub.connect, 'and the "above" that line points at is there: the Hub header\u2019s Connect MIDI button');
  ok(hub.card.tips === 'sends everything to the Part picked in Control.', 'its tip names the Hub: ' + hub.card.tips);
  ok(hub.songs === 'undefined' && !hub.card.tabBtn && hub.card.tabLine && hub.asTab === false && hub.active === 'midihub' && hub.file === 'gear.html',
    'Gear has no Songs page: the card has no Open as tab button, says where it is, and openAsTab() opens nothing: ' + JSON.stringify([hub.card.tabBtn, hub.card.tabLine, hub.asTab, hub.active, hub.file]));
  await p2.evaluate(() => document.getElementById('mh-enable').click());
  await p2.waitForFunction(() => App.midi.ready && App.midi.hasOutput && /MODX-1/.test(document.getElementById('mh-plout').textContent));
  const live = await p2.evaluate(() => ({ sameDoc: window.__sameDoc === true, card: __card() }));
  ok(live.sameDoc && /MODX-1/.test(live.card.out) && !live.card.row && !live.card.btn, 'Connect MIDI in the Hub header: the card names the synth without a reload, still with no ports row of its own: ' + live.card.out);
  const own = await p2.evaluate(() => {
    const host = document.createElement('div'); host.id = 'own-player'; document.body.appendChild(host);
    SLScorePlayer.mount(host, { ports: true });
    return { cards: document.querySelectorAll('.mh-pl').length, hubHost: document.getElementById('mh-player').children.length, own: host.querySelectorAll('.mh-pl').length, title: SLScorePlayer.state.title };
  });
  ok(own.cards === 1 && own.hubHost === 0 && own.own === 1 && own.title === 'Line', 'one card per document: mounting it somewhere else empties the Hub\u2019s host and keeps the open score: ' + JSON.stringify(own));
  ok(errs2.length === 0, 'no page errors (the Hub\u2019s mount)' + (errs2.length ? ': ' + errs2.join(' | ') : ''));
  await c2.close(); await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
