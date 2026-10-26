// One Open (js/songs.js, 1.3 / primer C2): one "Open a score" on the Play tab that
// takes a MIDI file, a MusicXML score or a text tab and routes it to Play on
// synth (the MIDI Hub Player), Practice (the Woodshed's own handle) or Open as
// tab (the Songs page). A fake MODX records what the synth gets.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(() => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.lights.on', 'false');
    localStorage.setItem('guitarlab.midihub.profile', JSON.stringify('yamaha'));
    window.__sent = [];
    const out = { id: 'modx1', name: 'MODX-1', state: 'connected', send: b => window.__sent.push(Array.from(b)) };
    const inp = { id: 'mi', name: 'MODX-1', state: 'connected', onmidimessage: null };
    navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map([['mi', inp]]), outputs: new Map([['modx1', out]]), sysexEnabled: true, onstatechange: null });
    window.__wait = (ms) => new Promise(r => setTimeout(r, ms));
  });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.midi.hasOutput && window.SLMidiHub && App.songs && window.Woodshed);

  // a tiny MIDI file made by the Player's own writer (C4 D4 E4 F4 at 120)
  const midi = await page.evaluate(() => Array.from(SLMidiHub.scoreToMidi({ title: 'Four', bpm: 120, len: 4, notes: [60, 62, 64, 65].map((m, i) => ({ t: i, d: 1, m, partId: 'p1', v: 100 })) })));
  const xml = '<?xml version="1.0"?><score-partwise><work><work-title>Line</work-title></work><part-list><score-part id="P1"/></part-list><part id="P1"><measure><attributes><divisions>1</divisions></attributes><direction><sound tempo="120"/></direction>' +
    ['C', 'D', 'E', 'F'].map(s => '<note><pitch><step>' + s + '</step><octave>4</octave></pitch><duration>1</duration></note>').join('') + '</measure></part></score-partwise>';
  const tab = 'e|-----0-1-|\nB|-1-3-----|\nG|---------|\nD|---------|\nA|---------|\nE|---------|\n';

  console.log('# the card and the three destinations');
  await page.evaluate(() => App.switchTo('songs'));
  const card = await page.evaluate(() => ({ open: !!document.getElementById('sg-open'), destHidden: document.getElementById('sg-opendest').hidden, msg: document.getElementById('sg-openmsg').textContent, add: !!document.getElementById('sg-file') }));
  ok(card.open && card.destHidden && /Nothing open/.test(card.msg) && card.add, 'Open a score sits above Add a song; the destinations wait for a file');

  await page.setInputFiles('#sg-openfile', { name: 'four.mid', mimeType: 'audio/midi', buffer: Buffer.from(midi) });
  await page.waitForFunction(() => !document.getElementById('sg-opendest').hidden);
  const m1 = await page.evaluate(async () => { const o = { msg: document.getElementById('sg-openmsg').textContent }; document.getElementById('sg-opentab').click(); await __wait(200); o.active = App.active; o.song = App.songs.current && { name: App.songs.current.name, notes: App.songs.current.steps.reduce((n, s) => n + s.notes.length, 0), from: App.songs.current.from }; return o; });
  ok(/four\.mid · MIDI/.test(m1.msg) && m1.active === 'songs' && m1.song && m1.song.name === 'four' && m1.song.notes === 4 && m1.song.from === 'One Open', 'a MIDI file opens as tab on this page: ' + JSON.stringify(m1.song));
  const m2 = await page.evaluate(async () => { document.getElementById('sg-opensynth').click(); await __wait(400); const st = SLMidiHub.player.state; return { active: App.active, view: App.store.get('midihub.view'), title: st.title, dur: st.duration }; });
  ok(m2.active === 'midihub' && m2.view === 'player' && m2.title === 'Four' && m2.dur > 0, 'Play on synth opens the Hub Player with it: ' + m2.title);
  const m3 = await page.evaluate(async () => { App.switchTo('songs'); await __wait(100); const before = Woodshed.lib ? null : null; document.getElementById('sg-openpractice').click(); await __wait(400); return { active: App.active, msg: document.getElementById('sg-openmsg').textContent }; });
  ok(m3.active === 'shed' && /In the Woodshed: four\.mid/.test(m3.msg), 'Practice files it in the Woodshed and opens it: ' + m3.msg);

  console.log('# MusicXML and a text tab');
  await page.evaluate(() => App.switchTo('songs'));
  await page.setInputFiles('#sg-openfile', { name: 'line.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await page.waitForFunction(() => /MusicXML/.test(document.getElementById('sg-openmsg').textContent));
  const x1 = await page.evaluate(async () => { document.getElementById('sg-opentab').click(); await __wait(500); const c = App.songs.current; return { name: c && c.name, midis: c ? c.steps.map(s => s.notes.map(n => n.midi).join('+')).filter(Boolean).join(',') : '' }; });
  ok(x1.name === 'line' && x1.midis === '60,62,64,65', 'a MusicXML score goes through the Player’s reader and opens as tab: ' + x1.midis);
  await page.setInputFiles('#sg-openfile', { name: 'riff.txt', mimeType: 'text/plain', buffer: Buffer.from(tab) });
  await page.waitForFunction(() => /text tab/.test(document.getElementById('sg-openmsg').textContent));
  const t1 = await page.evaluate(async () => { document.getElementById('sg-opentab').click(); await __wait(200); const c = App.songs.current; const o = { steps: c && c.steps.length, name: c && c.name }; document.getElementById('sg-opensynth').click(); await __wait(400); o.player = SLMidiHub.player.state.title; o.active = App.active; return o; });
  ok(t1.steps > 0 && t1.active === 'midihub' && t1.player === 'riff', 'a text tab parses as tab and can play on the synth as a score: ' + JSON.stringify(t1));
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close(); await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
