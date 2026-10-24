// Sheet music to synth and tab, end to end: a MusicXML score goes through
// Score review (1.1), becomes a reviewed revision, and the three buttons hand
// it on - Play on synth (the MIDI Hub Player, a fake MODX-1 records bytes),
// Export MIDI (a real download), Open as tab (the Songs page). Then the
// Player's own Open as tab in a changed key, and Songs' Export tab.
const { chromium } = require('playwright');
const path = require('path');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM });
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  await ctx.addInitScript(() => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.lights.on', 'false');
    window.__sent = [];
    const out = { id: 'modx1', name: 'MODX-1', state: 'connected', send: b => window.__sent.push(Array.from(b)) };
    const inp = { id: 'mi', name: 'MODX-1', state: 'connected', onmidimessage: null };
    navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map([['mi', inp]]), outputs: new Map([['modx1', out]]), sysexEnabled: true, onstatechange: null });
  });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.SLScoreReview && window.SLMusicLibrary && window.SLMidiHub && window.App && App.songs && App.midi && App.midi.ready);

  console.log('# a reviewed score from Score review');
  await page.evaluate(() => { App.switchTo('score'); });
  await page.setInputFiles('#sr-file', path.join(__dirname, 'fixtures/score/tempo-tie-chord.musicxml'));
  await page.waitForFunction(() => SLScoreReview.snapshot().item && SLScoreReview.snapshot().item.original.kind === 'musicxml' && !SLScoreReview.snapshot().busy);
  const before = await page.evaluate(() => ({ rows: SLScoreReview.snapshot().editor.rows.length, synth: document.getElementById('sr-synth').disabled, midi: document.getElementById('sr-export-midi').disabled, tab: document.getElementById('sr-tab').disabled }));
  ok(before.rows > 0 && before.synth && before.midi && before.tab, 'the three buttons wait for a reviewed revision (' + before.rows + ' imported targets)');
  await page.click('#sr-all-verified'); await page.click('#sr-review');
  await page.waitForFunction(() => SLScoreReview.snapshot().revision && SLScoreReview.snapshot().revision.reviewState === 'reviewed' && !SLScoreReview.snapshot().busy);
  const rev = await page.evaluate(() => { const s = SLScoreReview.snapshot(); return { pitched: s.revision.score.notes.filter(n => !n.rest).length, bpm: s.revision.score.bpm, len: s.revision.score.len, synth: document.getElementById('sr-synth').disabled, midi: document.getElementById('sr-export-midi').disabled, tab: document.getElementById('sr-tab').disabled }; });
  ok(rev.pitched > 0 && !rev.synth && !rev.midi && !rev.tab, 'a reviewed revision enables them: ' + rev.pitched + ' pitched targets at ' + rev.bpm + ' BPM');

  console.log('# Play on synth');
  await page.click('#sr-synth');
  await page.waitForFunction(() => App.active === 'midihub');
  const synth = await page.evaluate(async () => {
    const st = SLMidiHub.player.state, shown = [...document.querySelectorAll('.mh-view')].filter(x => !x.hidden).map(x => x.dataset.view).join();
    App.store.set('midihub.plTempo', 200); __sent.length = 0;
    SLMidiHub.player.play();
    const deadline = performance.now() + 15000;
    while (SLMidiHub.player.state.playing && performance.now() < deadline) await new Promise(r => setTimeout(r, 40));
    return { st, shown, ons: __sent.filter(b => (b[0] & 0xf0) === 0x90).length, offs: __sent.filter(b => (b[0] & 0xf0) === 0x80).length, status: document.getElementById('sr-status') ? document.getElementById('sr-status').textContent : '' };
  });
  ok(synth.shown === 'player' && synth.st.title && synth.st.duration > 0, 'the MIDI tab opens on the Player with the reviewed score: ' + synth.st.title + ', ' + synth.st.duration.toFixed(2) + ' s');
  ok(synth.ons === rev.pitched && synth.offs === rev.pitched, 'every reviewed target reaches the synth as a note on + off: ' + synth.ons + ' / ' + rev.pitched);

  console.log('# Export MIDI');
  await page.evaluate(() => App.switchTo('score'));
  await page.waitForFunction(() => App.active === 'score' && !SLScoreReview.snapshot().busy);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#sr-export-midi')]);
  const midPath = await dl.path(), fs = require('fs'), head = fs.readFileSync(midPath).slice(0, 4).toString('latin1');
  ok(/\.mid$/.test(dl.suggestedFilename()) && head === 'MThd', 'a MIDI file downloads: ' + dl.suggestedFilename());
  const back = await page.evaluate(async (bytes) => { const sum = await SLMidiHub.player.loadFile('back.mid', new Uint8Array(bytes).buffer); return sum; }, Array.from(fs.readFileSync(midPath)));
  ok(back.notes === rev.pitched, 'the exported file reads back with the same ' + rev.pitched + ' notes');

  console.log('# Open as tab');
  await page.evaluate(() => App.switchTo('score'));
  await page.waitForFunction(() => App.active === 'score' && !SLScoreReview.snapshot().busy);
  await page.click('#sr-tab');
  await page.waitForFunction(() => App.active === 'songs' && App.songs.current);
  const tab = await page.evaluate(() => { const c = App.songs.current, txt = App.songs.toAscii(c); return { steps: c.steps.length, bars: c.bars, notes: c.steps.reduce((n, s) => n + s.notes.length, 0), lines: txt.split('\n').filter(Boolean).length, first: txt.split('\n')[0].slice(0, 12), shown: document.querySelectorAll('#sg-tabout [data-sgstep]').length > 0, exp: document.getElementById('sg-exporttab').disabled, msg: document.getElementById('sg-addmsg').textContent }; });
  ok(tab.steps > 0 && tab.notes === rev.pitched && tab.shown && /from Score review/.test(tab.msg), 'the Songs page shows it as tab with every target placed on a string: ' + tab.steps + ' steps, ' + tab.notes + ' notes');
  ok(tab.lines >= 6 && /^e\|/.test(tab.first) && !tab.exp, 'the ASCII tab has six string lines and Export tab is enabled: ' + JSON.stringify(tab.first));
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#sg-exporttab')]);
  ok(/\.txt$/.test(dl2.suggestedFilename()) && fs.readFileSync(await dl2.path(), 'utf8').startsWith('e|'), 'Export tab downloads the text: ' + dl2.suggestedFilename());

  console.log('# the Player’s own Open as tab, in a changed key');
  const shifted = await page.evaluate(async () => {
    App.switchTo('midihub');
    const xml = '<?xml version="1.0"?><score-partwise><work><work-title>Line</work-title></work><part-list><score-part id="P1"/></part-list><part id="P1"><measure><attributes><divisions>1</divisions></attributes><direction><sound tempo="120"/></direction>' +
      ['C', 'D', 'E', 'F'].map(s => '<note><pitch><step>' + s + '</step><octave>4</octave></pitch><duration>1</duration></note>').join('') + '</measure></part></score-partwise>';
    await SLMidiHub.player.loadFile('line.musicxml', new TextEncoder().encode(xml).buffer);
    App.store.set('midihub.plTrans', 0);
    App.store.set('midihub.plShift', { on: true, fr: 0, fs: 'major', tr: 0, ts: 'aeolian' });
    const ok1 = SLMidiHub.player.openAsTab();
    const c = App.songs.current;
    return { ok1, active: App.active, midis: c.steps.map(s => s.notes.map(n => n.midi).join('+')).join(','), msg: document.getElementById('sg-addmsg').textContent };
  });
  ok(shifted.ok1 && shifted.active === 'songs' && shifted.midis === '60,62,63,65' && /chosen key/.test(shifted.msg), 'C D E F in C minor becomes C D Eb F on the tab: ' + shifted.midis);

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close(); await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
