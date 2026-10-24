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

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close(); await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
