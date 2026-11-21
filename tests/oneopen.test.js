// One Open (js/songs.js, 1.3 / primer C2): one "Open a score" on the Play tab that
// takes a MIDI file, a MusicXML score or a text tab and routes it to Play on
// synth (the score player, js/scoreplayer.js = window.SLScorePlayer, which sits
// in the MIDI Hub's Player view), Practice (the Woodshed's own handle) or Open
// as tab (the Songs page). A fake MODX records what the synth gets.
// Also the score player's per-mount options (its own ports row, the no-output
// line, the connect button, the two texts that name the host).
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
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.midi.hasOutput && window.SLScorePlayer && App.songs && window.Woodshed);

  // a tiny MIDI file made by the Player's own writer (C4 D4 E4 F4 at 120)
  const midi = await page.evaluate(() => Array.from(SLScorePlayer.scoreToMidi({ title: 'Four', bpm: 120, len: 4, notes: [60, 62, 64, 65].map((m, i) => ({ t: i, d: 1, m, partId: 'p1', v: 100 })) })));
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
  await ctx.close();

  // The card's per-mount options (SLScorePlayer.mount(el, opts)): ports = its own "Synth out" and "Channel"
  // selects for a host with no Hub header, noOut = the line while there is no synth output, connect = a button
  // after it. The Hub passes none of them; the Songs page will (A3b), so they are checked here, on a card
  // mounted the same way, with MIDI connected only after boot.
  console.log('# the Player card mounted with its own ports row, MIDI connected after boot');
  const c2 = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await c2.addInitScript(() => {
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true')); // not midi.wanted: nothing connects at boot
    localStorage.setItem('guitarlab.midihub.ch', '3');
    const out = { id: 'modx1', name: 'MODX-1', state: 'connected', send: () => { } };
    const inp = { id: 'mi', name: 'MODX-1', state: 'connected', onmidimessage: null };
    navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map([['mi', inp]]), outputs: new Map([['modx1', out]]), sysexEnabled: true, onstatechange: null });
    window.__card = () => {
      const q = id => document.getElementById(id), row = q('mh-plports'), btn = q('mh-plconnect'), tips = document.querySelector('.mh-pl details p');
      return {
        cards: document.querySelectorAll('.mh-pl').length, out: q('mh-plout').textContent, tips: tips.textContent.slice(tips.textContent.indexOf('sends everything')),
        row: row ? { hidden: row.hidden, display: getComputedStyle(row).display, height: row.getBoundingClientRect().height, ports: [...q('mh-plsynth').options].map(x => x.value).join(), port: q('mh-plsynth').value, ch: q('mh-plch').value } : null,
        btn: btn ? { hidden: btn.hidden, label: btn.textContent } : null
      };
    };
    // the card's Open as tab, and what the Songs page then says the tab came from
    window.__asTab = () => { SLScorePlayer.loadScore({ title: 'Line', bpm: 120, len: 4, notes: [60, 62, 64, 65].map((m, i) => ({ t: i, d: 1, m, partId: 'p1', v: 100 })) }); SLScorePlayer.openAsTab(); return App.songs.current && App.songs.current.from; };
  });
  const p2 = await c2.newPage(), errs2 = [];
  p2.on('pageerror', e => errs2.push(e.message));
  await p2.goto(env.URL);
  await p2.waitForFunction(() => window.App && App.midi && window.SLScorePlayer && App.songs && App.active === 'quiz');
  const NO_OUT = 'No synth output yet. Connect your keyboard in Settings \u203a MIDI keyboard.';
  const hub = await p2.evaluate(() => ({ ready: App.midi.ready, card: __card(), from: __asTab() }));
  ok(hub.ready === false && hub.card.cards === 1 && /connect MIDI above$/.test(hub.card.out) && hub.card.row === null && hub.card.btn === null,
    'the Hub\u2019s mount passes no option: its own line while there is no output, no ports row, no button: ' + hub.card.out);
  ok(hub.card.tips === 'sends everything to the Part picked in Control.' && hub.from === 'from the MIDI Hub Player', 'and its two texts name the Hub: ' + JSON.stringify([hub.card.tips, hub.from]));
  const own = await p2.evaluate((noOut) => {
    const host = document.createElement('div'); host.id = 'own-player'; document.body.appendChild(host);
    SLScorePlayer.mount(host, { ports: true, noOut: noOut, connect: { label: 'Connect MIDI', run: () => { App.midi.enable(); } } });
    return { card: __card(), hubHost: document.getElementById('mh-player').children.length, from: __asTab() };
  }, NO_OUT);
  ok(own.card.cards === 1 && own.hubHost === 0, 'one card per document: mounting it somewhere else empties the Hub\u2019s host');
  ok(own.card.out === NO_OUT && own.card.btn && !own.card.btn.hidden && own.card.btn.label === 'Connect MIDI', 'no output yet: the mount\u2019s own line and its button: ' + own.card.out);
  ok(own.card.row && own.card.row.hidden && own.card.row.display === 'none' && own.card.row.height === 0,
    'the ports row is not on screen before MIDI is connected (no empty Synth out select): ' + JSON.stringify(own.card.row));
  ok(own.card.tips === 'sends everything to the Channel picked above.' && own.from === 'from the Player', 'with its own Channel select the two texts no longer name the Hub: ' + JSON.stringify([own.card.tips, own.from]));
  await p2.evaluate(() => document.getElementById('mh-plconnect').click());
  await p2.waitForFunction(() => App.midi.ready && !document.getElementById('mh-plports').hidden);
  const live = await p2.evaluate(() => __card());
  ok(/MODX-1/.test(live.out) && live.btn.hidden, 'the button connects; the card names the synth without a reload (repainted on midi:state): ' + live.out);
  ok(!live.row.hidden && live.row.display === 'flex' && live.row.ports === 'shared,modx1' && live.row.port === 'modx1' && live.row.ch === '3',
    'and the ports row is there: Synth out lists the ports, Channel shows the stored one (4): ' + JSON.stringify(live.row));
  ok(errs2.length === 0, 'no page errors (own ports row)' + (errs2.length ? ': ' + errs2.join(' | ') : ''));
  await c2.close(); await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
