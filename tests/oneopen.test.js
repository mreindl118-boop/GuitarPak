// One Open (js/songs.js, 1.3 / primer C2): one "Open a score" on the Play tab that
// takes a MIDI file, a MusicXML score or a text tab and routes it to Play on
// synth (the score player, js/scoreplayer.js = window.SLScorePlayer), Practice
// (the Woodshed's own handle) or Open as tab (the Songs page).
// 2.0 Phase A3b: the MIDI Hub is soundLAB Gear (gear.html), so the Player is a
// card on the Songs page here (#sg-player, hidden until "Play on synth" sends
// it a file) and window.SLMidiHub does not exist. The page has no MIDI connect
// control: with no synth output the card's line names Settings › MIDI keyboard
// and its button opens Settings. MIDI is off at the start (as on a first
// visit) and is connected half way; the fake MODX is the only output.
// Also the score player's per-mount options as the Songs page passes them (its
// own ports row, the no-output line, the connect button, the two texts that
// name the host). The Hub's mount of the same card: tests/midihub-player.test.js.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(() => {
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true')); // no midi.wanted: MIDI stays off until the test connects it
    localStorage.setItem('guitarlab.lights.on', 'false');
    localStorage.setItem('guitarlab.midihub.profile', JSON.stringify('yamaha'));
    window.__sent = [];
    const out = { id: 'modx1', name: 'MODX-1', state: 'connected', send: b => window.__sent.push(Array.from(b)) };
    const inp = { id: 'mi', name: 'MODX-1', state: 'connected', onmidimessage: null };
    navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map([['mi', inp]]), outputs: new Map([['modx1', out]]), sysexEnabled: true, onstatechange: null });
    window.__wait = (ms) => new Promise(r => setTimeout(r, ms));
    // the Player card on the Songs page, as the user sees it
    window.__card = () => {
      const el = document.getElementById('sg-player'), r = el ? el.getBoundingClientRect() : null, q = id => (el && el.querySelector('#' + id)) || null;
      const btn = q('mh-plconnect'), ports = q('mh-plports');
      return { there: !!el, seen: !!el && !el.hidden && r.height > 0 && document.getElementById('panel-songs').classList.contains('active'),
        info: q('mh-plinfo') ? q('mh-plinfo').textContent : '', line: q('mh-plout') ? q('mh-plout').textContent : '',
        btn: btn ? btn.textContent.trim() : null, btnShown: !!btn && !btn.hidden, ports: !!ports && !ports.hidden };
    };
  });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.active === 'quiz' && App.midi && window.SLScorePlayer && App.songs && window.Woodshed);
  const boot = await page.evaluate(() => { window.__sameDoc = true; return { hub: typeof window.SLMidiHub, ready: App.midi.ready, out: App.midi.synthOut.has() }; }); // __sameDoc: gone after a reload
  ok(boot.hub === 'undefined', 'window.SLMidiHub is undefined in soundLAB (the Hub is soundLAB Gear): ' + boot.hub);
  ok(boot.ready === false && boot.out === false, 'MIDI is off at the start, so there is no synth output yet: ' + JSON.stringify(boot));

  // a tiny MIDI file made by the Player's own writer (C4 D4 E4 F4 at 120)
  const midi = await page.evaluate(() => Array.from(SLScorePlayer.scoreToMidi({ title: 'Four', bpm: 120, len: 4, notes: [60, 62, 64, 65].map((m, i) => ({ t: i, d: 1, m, partId: 'p1', v: 100 })) })));
  const xml = '<?xml version="1.0"?><score-partwise><work><work-title>Line</work-title></work><part-list><score-part id="P1"/></part-list><part id="P1"><measure><attributes><divisions>1</divisions></attributes><direction><sound tempo="120"/></direction>' +
    ['C', 'D', 'E', 'F'].map(s => '<note><pitch><step>' + s + '</step><octave>4</octave></pitch><duration>1</duration></note>').join('') + '</measure></part></score-partwise>';
  const tab = 'e|-----0-1-|\nB|-1-3-----|\nG|---------|\nD|---------|\nA|---------|\nE|---------|\n';

  console.log('# the card and the three destinations');
  await page.evaluate(() => App.switchTo('songs'));
  const card = await page.evaluate(() => ({ open: !!document.getElementById('sg-open'), destHidden: document.getElementById('sg-opendest').hidden, msg: document.getElementById('sg-openmsg').textContent, add: !!document.getElementById('sg-file'), player: __card(),
    after: !!document.querySelector('#sg-open + #sg-player') }));
  ok(card.open && card.destHidden && /Nothing open/.test(card.msg) && card.add, 'Open a score sits above Add a song; the destinations wait for a file');
  ok(card.player.there && card.after && !card.player.seen, 'the Player card (#sg-player) sits right after Open a score and is hidden until a file is sent to it: ' + JSON.stringify([card.player.there, card.after, card.player.seen]));

  await page.setInputFiles('#sg-openfile', { name: 'four.mid', mimeType: 'audio/midi', buffer: Buffer.from(midi) });
  await page.waitForFunction(() => !document.getElementById('sg-opendest').hidden);
  const m1 = await page.evaluate(async () => { const o = { msg: document.getElementById('sg-openmsg').textContent }; document.getElementById('sg-opentab').click(); await __wait(200); o.active = App.active; o.song = App.songs.current && { name: App.songs.current.name, notes: App.songs.current.steps.reduce((n, s) => n + s.notes.length, 0), from: App.songs.current.from }; return o; });
  ok(/four\.mid · MIDI/.test(m1.msg) && m1.active === 'songs' && m1.song && m1.song.name === 'four' && m1.song.notes === 4 && m1.song.from === 'One Open', 'a MIDI file opens as tab on this page: ' + JSON.stringify(m1.song));
  const m2 = await page.evaluate(async () => { document.getElementById('sg-opensynth').click(); await __wait(400); const st = SLScorePlayer.state; return { active: App.active, title: st.title, dur: st.duration, card: __card() }; });
  ok(m2.active === 'songs' && m2.card.seen && /Four/.test(m2.card.info) && m2.title === 'Four' && m2.dur > 0, 'Play on synth stays on the Songs page and shows the Player card with the title: ' + JSON.stringify([m2.active, m2.card.seen, m2.card.info, m2.title]));

  console.log('# the Player card with no synth output, then with the MODX');
  ok(/Settings › MIDI keyboard/.test(m2.card.line) && m2.card.btnShown && /Open Settings/.test(m2.card.btn || ''), 'no MIDI output: the card’s line names Settings › MIDI keyboard and offers a button: ' + JSON.stringify([m2.card.line, m2.card.btn]));
  const c1 = await page.evaluate(async () => {
    const o = {};
    document.querySelector('#sg-player #mh-plconnect').click(); await __wait(200);
    o.active = App.active; o.panel = document.getElementById('panel-settings').classList.contains('active');
    // connect MIDI from there (what Connect MIDI does): the fake MODX appears. The Songs page is not shown again
    await App.midi.enable(); await __wait(150);
    o.ready = App.midi.ready && App.midi.hasOutput; o.still = App.active;
    o.card = __card();
    App.switchTo('songs'); await __wait(150);
    o.back = __card(); o.sameDoc = window.__sameDoc === true;
    return o;
  });
  ok(c1.active === 'settings' && c1.panel, 'the card’s button opens Settings: ' + JSON.stringify([c1.active, c1.panel]));
  ok(c1.ready && c1.still === 'settings' && c1.sameDoc && /MODX-1/.test(c1.card.line) && !/Settings/.test(c1.card.line) && !c1.card.btnShown,
    'once the MODX is connected the card’s line names it, with no reload and before the Songs page is shown again (the Player repaints on midi:state): ' + JSON.stringify([c1.ready, c1.still, c1.sameDoc, c1.card.line, c1.card.btnShown]));
  ok(c1.back.seen && /MODX-1/.test(c1.back.line) && c1.back.ports && /Four/.test(c1.back.info),
    'back on the Songs page the card is still there with the file, the output and its Synth out / Channel selects: ' + JSON.stringify([c1.back.seen, c1.back.line, c1.back.ports]));
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
  const t1 = await page.evaluate(async () => { document.getElementById('sg-opentab').click(); await __wait(200); const c = App.songs.current; const o = { steps: c && c.steps.length, name: c && c.name }; document.getElementById('sg-opensynth').click(); await __wait(400); o.player = SLScorePlayer.state.title; o.active = App.active; o.seen = __card().seen; o.info = __card().info; return o; });
  ok(t1.steps > 0 && t1.active === 'songs' && t1.seen && t1.player === 'riff' && /riff/.test(t1.info), 'a text tab parses as tab and can play on the synth as a score (the Player card on this page): ' + JSON.stringify(t1));
  ok(await page.evaluate(() => typeof window.SLMidiHub) === 'undefined', 'window.SLMidiHub is still undefined after all three destinations');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  // The card's per-mount options (SLScorePlayer.mount(el, opts)) as the Songs page passes them (js/songs.js init):
  // ports = its own "Synth out" and "Channel" selects (this page has no Hub header), noOut = the line while there is
  // no synth output, connect = a button after it. Checked on that mount, in a profile where MIDI was never connected;
  // the connecting is done with Settings' own Connect MIDI button, where the card's line sends the user.
  // The Hub's mount in soundLAB Gear passes none of the options: tests/midihub-player.test.js.
  console.log('# the Songs page’s Player card: its own ports row, MIDI connected after boot');
  const c2 = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await c2.addInitScript(() => {
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true')); // not midi.wanted: nothing connects at boot
    localStorage.setItem('guitarlab.midihub.ch', '3');
    const out = { id: 'modx1', name: 'MODX-1', state: 'connected', send: () => { } };
    const inp = { id: 'mi', name: 'MODX-1', state: 'connected', onmidimessage: null };
    navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map([['mi', inp]]), outputs: new Map([['modx1', out]]), sysexEnabled: true, onstatechange: null });
    window.__wait = (ms) => new Promise(r => setTimeout(r, ms));
    window.__card = () => {
      const q = id => document.getElementById(id), host = q('sg-player'), row = q('mh-plports'), btn = q('mh-plconnect'), tips = document.querySelector('.mh-pl details p');
      return {
        cards: document.querySelectorAll('.mh-pl').length, inSongs: !!host.querySelector('.mh-pl'),
        seen: !host.hidden && host.getBoundingClientRect().height > 0 && document.getElementById('panel-songs').classList.contains('active'),
        out: q('mh-plout').textContent, tips: tips.textContent.slice(tips.textContent.indexOf('sends everything')),
        row: row ? { hidden: row.hidden, display: getComputedStyle(row).display, height: row.getBoundingClientRect().height, ports: [...q('mh-plsynth').options].map(x => x.value).join(), port: q('mh-plsynth').value, ch: q('mh-plch').value } : null,
        btn: btn ? { hidden: btn.hidden, seen: btn.getClientRects().length > 0, label: btn.textContent.trim() } : null
      };
    };
    // a score sent to the card and shown, as "Play on synth" does it
    window.__score = () => ({ title: 'Line', bpm: 120, len: 4, notes: [60, 62, 64, 65].map((m, i) => ({ t: i, d: 1, m, partId: 'p1', v: 100 })) });
    // the card's Open as tab, and what the Songs page then says the tab came from
    window.__asTab = () => { SLScorePlayer.loadScore(window.__score()); SLScorePlayer.openAsTab(); return App.songs.current && App.songs.current.from; };
  });
  const p2 = await c2.newPage(), errs2 = [];
  p2.on('pageerror', e => errs2.push(e.message));
  await p2.goto(env.URL);
  await p2.waitForFunction(() => window.App && App.midi && window.SLScorePlayer && App.songs && App.active === 'quiz');
  const NO_OUT = 'No synth output yet. Connect your keyboard in Settings › MIDI keyboard.';
  const own = await p2.evaluate(async () => {
    window.__sameDoc = true; // gone after a reload
    const o = { ready: App.midi.ready, hubHost: !!document.getElementById('mh-player'), before: __card().seen };
    SLScorePlayer.loadScore(__score()); SLScorePlayer.show(); await __wait(200);
    o.active = App.active; o.card = __card(); o.from = __asTab();
    return o;
  });
  ok(own.ready === false && !own.before && own.active === 'songs' && own.card.seen, 'MIDI is off; a score sent to the Player brings its card on screen on the Songs page: ' + JSON.stringify([own.ready, own.before, own.active, own.card.seen]));
  ok(own.card.cards === 1 && own.card.inSongs && !own.hubHost, 'one card per document: here it is the Songs page’s (#sg-player); soundLAB has no Hub host for it');
  ok(own.card.out === NO_OUT && own.card.btn && !own.card.btn.hidden && own.card.btn.seen && own.card.btn.label === 'Open Settings', 'no output yet: the mount’s own line and its button: ' + own.card.out + ' [' + (own.card.btn && own.card.btn.label) + ']');
  ok(own.card.row && own.card.row.hidden && own.card.row.display === 'none' && own.card.row.height === 0,
    'the ports row is not on screen before MIDI is connected (no empty Synth out select): ' + JSON.stringify(own.card.row));
  ok(own.card.tips === 'sends everything to the Channel picked above.' && own.from === 'from the Player', 'with its own Channel select the two texts name the card, not the Hub: ' + JSON.stringify([own.card.tips, own.from]));
  // the card's button opens Settings; Connect MIDI is pressed there
  await p2.evaluate(() => document.getElementById('mh-plconnect').click());
  await p2.waitForFunction(() => App.active === 'settings');
  await p2.evaluate(() => document.getElementById('set-midi-enable').click());
  await p2.waitForFunction(() => App.midi.ready && App.midi.hasOutput && !document.getElementById('mh-plports').hidden);
  const live = await p2.evaluate(async () => { const o = { active: App.active, sameDoc: window.__sameDoc === true, away: __card() }; App.switchTo('songs'); await __wait(150); o.back = __card(); return o; });
  ok(live.active === 'settings' && live.sameDoc && /MODX-1/.test(live.away.out) && live.away.btn.hidden,
    'Connect MIDI pressed in Settings: the card names the synth without a reload, before the Songs page is shown again (repainted on midi:state): ' + live.away.out);
  ok(live.back.seen && /MODX-1/.test(live.back.out) && !live.back.row.hidden && live.back.row.display === 'flex' && live.back.row.height > 0 && live.back.row.ports === 'shared,modx1' && live.back.row.port === 'modx1' && live.back.row.ch === '3',
    'back on the Songs page the ports row is there: Synth out lists the ports, Channel shows the stored one (4): ' + JSON.stringify(live.back.row));
  ok(await p2.evaluate(() => typeof window.SLMidiHub) === 'undefined', 'and no Hub was loaded on the way (window.SLMidiHub is undefined)');
  ok(errs2.length === 0, 'no page errors (own ports row)' + (errs2.length ? ': ' + errs2.join(' | ') : ''));
  await c2.close(); await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
