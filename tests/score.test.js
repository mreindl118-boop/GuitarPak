// Browser + independent SMF decoder coverage for the bounded Score preview.
// Uses the actual app audio master/transport. MIDI output is intercepted; this
// suite does not claim audible or physical-hardware validation.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), assert = require('assert');
const env = require('./env');
const ROOT = path.resolve(__dirname, '..');
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', 'score', name));
const XML = fixture('tempo-tie-chord.musicxml').toString('utf8');
let passes = 0;
function ok(condition, label) { assert.ok(condition, label); passes++; console.log('  PASS ' + label); }

// Deliberately separate from Score's encoder/model. Read all bytes and recover
// tempo, meter and note intervals from the exported binary track.
function decodeMidi(input) {
  const b = Buffer.from(input); let p = 0;
  const tag = () => { const t = b.toString('ascii', p, p + 4); p += 4; return t; };
  const u32 = () => { const n = b.readUInt32BE(p); p += 4; return n; };
  const u16 = () => { const n = b.readUInt16BE(p); p += 2; return n; };
  assert.equal(tag(), 'MThd'); assert.equal(u32(), 6);
  const format = u16(), tracks = u16(), division = u16();
  assert.equal(tag(), 'MTrk'); const end = p + 4 + u32();
  let tick = 0, last = 0, eot = null; const tempos = [], meters = [], notes = [], active = new Map(), events = [];
  function vlq() { let n = 0, v, count = 0; do { assert.ok(p < b.length && count++ < 4); v = b[p++]; n = n * 128 + (v & 127); } while (v & 128); return n; }
  while (p < end) {
    tick += vlq(); let status = b[p++];
    if (status < 128) { p--; status = last; } else last = status;
    if (status === 255) {
      const type = b[p++], len = vlq(), data = b.subarray(p, p + len); p += len;
      if (type === 0x51) tempos.push({ tick, us: data.readUIntBE(0, 3) });
      if (type === 0x58) meters.push({ tick, beats: data[0], denominator: 2 ** data[1] });
      if (type === 0x2f) eot = tick;
    } else {
      assert.ok(status >= 0x80 && status <= 0xef); const hi = status & 0xf0;
      const note = b[p++], velocity = hi === 0xc0 || hi === 0xd0 ? null : b[p++];
      events.push({ tick, status, note, velocity });
      if (hi === 0x90 && velocity > 0) { assert.ok(!active.has(note)); active.set(note, tick); }
      if (hi === 0x80 || (hi === 0x90 && velocity === 0)) { assert.ok(active.has(note)); notes.push({ midi: note, tick: active.get(note), duration: tick - active.get(note) }); active.delete(note); }
    }
  }
  assert.equal(p, b.length); assert.equal(active.size, 0);
  notes.sort((a, b2) => a.tick - b2.tick || a.midi - b2.midi);
  return { format, tracks, division, tempos, meters, notes, events, eot };
}
function secondsAt(midi, tick) {
  let prev = 0, us = 500000, seconds = 0;
  for (const t of midi.tempos) { if (t.tick > tick) break; seconds += (t.tick - prev) / midi.division * us / 1e6; prev = t.tick; us = t.us; }
  return seconds + (tick - prev) / midi.division * us / 1e6;
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 850 }, acceptDownloads: true });
    await context.addInitScript(() => {
      ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
      localStorage.setItem('guitarlab.lights.on', 'false'); localStorage.setItem('guitarlab.midi.wanted', 'false');
      // Even if a future shell initializes MIDI, no physical port is touched.
      navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map(), outputs: new Map(), sysexEnabled: false, onstatechange: null });
    });
    await context.route('https://raw.githubusercontent.com/**', route => route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(env.URL); await page.waitForFunction(() => window.App && App.active);
    if (!await page.evaluate(() => !!window.SLScore)) await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'js', 'score.js'), 'utf8') });
    if (!await page.evaluate(() => !!document.getElementById('sc-file'))) {
      await page.addStyleTag({ content: fs.readFileSync(path.join(ROOT, 'css', 'score.css'), 'utf8').replace("url('../fonts/", "url('/fonts/") });
      await page.evaluate(() => App.addPage('score', 'Score', 'practice', SLScore.module));
    }
    await page.evaluate(() => App.switchTo('score'));

    const model = await page.evaluate(xml => SLScore.parseMusicXML(xml), XML);
    ok(model.measures.length === 2 && model.eventCount === 6 && model.totalBeats === 8, 'MusicXML measures, rests, chords and duration retained');
    ok(model.notes.length === 4 && model.notes[0].duration === 3, 'tie notation and sound tie merge into one sustained note');
    ok(model.notes[1].pitch.step === 'F' && model.notes[1].pitch.alter === 1 && model.notes[1].midi === 66, 'source pitch spelling and explicit sharp retained');
    ok(JSON.stringify(model.tempos) === JSON.stringify([{ beat: 0, bpm: 120 }, { beat: 2, bpm: 60 }]), 'two numeric tempo changes preserved');
    const tl = await page.evaluate(xml => { const m = SLScore.parseMusicXML(xml); return { notes: SLScore.timeline(m), duration: SLScore.beatSeconds(m, m.totalBeats) }; }, XML);
    ok(tl.notes[0].duration === 2 && tl.notes[1].at === 3 && tl.notes[1].duration === 2 && tl.duration === 7, 'ties span tempo change with correct elapsed seconds');
    const bytes = await page.evaluate(xml => Array.from(SLScore.midiBytes(SLScore.parseMusicXML(xml))), XML);
    const midi = decodeMidi(bytes);
    ok(midi.format === 0 && midi.tracks === 1 && midi.division === 960, 'independent decoder verifies Standard MIDI File format 0');
    ok(JSON.stringify(midi.notes) === JSON.stringify([{ midi: 60, tick: 0, duration: 2880 }, { midi: 66, tick: 3840, duration: 1920 }, { midi: 69, tick: 3840, duration: 1920 }, { midi: 67, tick: 5760, duration: 1440 }]), 'independently decoded MIDI pitches, chords and tie durations match fixture exactly');
    ok(JSON.stringify(midi.tempos) === JSON.stringify([{ tick: 0, us: 500000 }, { tick: 1920, us: 1000000 }]) && midi.eot === 7680 && secondsAt(midi, midi.eot) === 7, 'MIDI retains tempo map and trailing rest');
    ok(midi.meters.length === 1 && midi.meters[0].beats === 4 && midi.meters[0].denominator === 4, 'MIDI meter meta event preserved');

    const round = await page.evaluate(() => {
      const m = SLScore.createScore('Bb3:q F#4:e E4:e R:h | [C4,E4,G4]:w', { title: 'A <title> & melody', bpm: 83, clef: 'bass' });
      const xml = SLScore.scoreXML(m), back = SLScore.parseMusicXML(xml);
      return { title: back.title, notes: back.notes, before: m.notes, xml, duration: back.totalBeats, clef: back.measures[0].clef };
    });
    ok(round.title === 'A <title> & melody' && round.clef === 'bass' && round.duration === 8 && JSON.stringify(round.notes) === JSON.stringify(round.before), 'created MusicXML escapes title and roundtrips pitches/rhythm/clef');
    const changed = XML.replace('<measure number="2">', '<measure number="2"><attributes><time><beats>2</beats><beat-type>2</beat-type></time></attributes>');
    const meterMidi = decodeMidi(await page.evaluate(xml => Array.from(SLScore.midiBytes(SLScore.parseMusicXML(xml))), changed));
    ok(meterMidi.meters[1].tick === 3840 && meterMidi.meters[1].beats === 2 && meterMidi.meters[1].denominator === 2, 'mid-score meter change exported at exact beat');
    const dottedTempo = XML.replace('<beat-unit>quarter</beat-unit><per-minute>120', '<beat-unit>eighth</beat-unit><beat-unit-dot/><per-minute>120').replace('<sound tempo="120"/>', '');
    ok(await page.evaluate(xml => SLScore.parseMusicXML(xml).tempos[0].bpm, dottedTempo) === 90, 'dotted eighth metronome converted to quarter-note tempo');

    async function rejects(xml, pattern, name) { const error = await page.evaluate(s => { try { SLScore.parseMusicXML(s); return ''; } catch (e) { return e.message; } }, xml); ok(pattern.test(error), name + ': ' + error); }
    await rejects(fixture('multiple-voices.musicxml').toString(), /Multiple voices/, 'multiple voices explicitly rejected');
    await rejects(fixture('repeat.musicxml').toString(), /repeat/, 'repeat playback explicitly rejected');
    await rejects(XML.replace('<tie type="start"/>', '').replace('<tied type="start"/>', ''), /tie stop/, 'unmatched tie stop rejected');
    await rejects(XML.replace('<tie type="stop"/>', '').replace('<tied type="stop"/>', ''), /tied pitch|open tie/, 'unmatched tie start rejected');
    await rejects(XML.replace('<duration>16</duration>', '<duration>15</duration>'), /inconsistent/, 'irregular/inconsistent duration rejected without quantization');
    await rejects(XML.replace('<divisions>8</divisions>', '<divisions>8</divisions><staves>2</staves>'), /one staff/, 'multiple staves explicitly rejected');
    await rejects(XML.replace('<divisions>8</divisions>', '<divisions>8</divisions><transpose><chromatic>2</chromatic></transpose>'), /transpose/, 'transposing part explicitly rejected');
    await rejects(XML.replace('<note>', '<note><grace/>'), /grace/, 'grace notes explicitly rejected');
    await rejects(XML.replace('<note>', '<note><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>'), /time-modification/, 'tuplets explicitly rejected');
    await rejects(XML.replace('<direction>', '<direction><direction-type><words>D.C. al Fine</words></direction-type>'), /navigation/, 'textual repeat/navigation explicitly rejected');
    await rejects(XML.replace('<divisions>8</divisions>', '<divisions>8</divisions><measure-style><multiple-rest>4</multiple-rest></measure-style>'), /measure-style/, 'multi-measure rest shorthand rejected rather than shortened');
    await rejects(XML.replace('<note>', '<note attack="2">'), /timing overrides/, 'note timing overrides rejected rather than shifted');
    await rejects(XML.replace('<step>C</step>', ''), /exactly one letter/, 'missing pitch step rejected rather than becoming C');
    await rejects(XML.replace('<step>C</step>', '<step></step>'), /exactly one letter/, 'empty pitch step rejected rather than becoming C');
    await rejects(XML.replace('<step>C</step>', '<step>CD</step>'), /exactly one letter/, 'multi-letter pitch step rejected rather than becoming C');
    await rejects('<score-partwise><part></score-partwise>', /valid/, 'malformed XML rejected');
    await rejects(XML.replace('<!DOCTYPE score-partwise PUBLIC', '<!DOCTYPE score-partwise [<!ENTITY x "x">]><!--').replace('partwise.dtd">', 'partwise.dtd">-->'), /entity|DTD/, 'entity/internal DTD content rejected');
    const invalidCreate = await page.evaluate(() => { try { SLScore.createScore('C4:h D4:w'); } catch (e) { return e.message; } });
    ok(/crosses a barline/.test(invalidCreate), 'composer rejects a note crossing a bar without rewriting');
    const offGrid = await page.evaluate(() => { const m = SLScore.createScore('C4:q'); m.notes[0].duration = 1 / 7; try { SLScore.midiBytes(m); } catch (e) { return e.message; } });
    ok(/represented exactly/.test(offGrid), 'nonrepresentable MIDI rhythm rejected rather than quantized');

    await page.setInputFiles('#sc-file', { name: 'retained-original.musicxml', mimeType: 'application/xml', buffer: fixture('tempo-tie-chord.musicxml') });
    await page.waitForFunction(() => SLScore.model && SLScore.model.title === 'Tempo, tie and chord fixture');
    ok(await page.locator('#sc-notices').isVisible() && /Limited pitch\/rhythm/.test(await page.locator('#sc-notices').innerText()), 'persistent preview/export limitation notice visible');
    ok(await page.locator('#sc-rows tr').count() === 6 && await page.locator('#sc-staff svg').count() === 2, 'real staff preview and accessible exact event table render');
    const originalDownload = page.waitForEvent('download'); await page.click('#sc-original'); const orig = await originalDownload;
    ok(orig.suggestedFilename() === 'retained-original.musicxml' && fs.readFileSync(await orig.path()).equals(fixture('tempo-tie-chord.musicxml')), 'downloaded imported MusicXML preserves original bytes and filename');
    const midiDownload = page.waitForEvent('download'); await page.click('#sc-midi'); const mid = await midiDownload;
    ok(fs.readFileSync(await mid.path()).equals(Buffer.from(bytes)), 'MIDI download exactly matches independently decoded export');
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fixture('tempo-tie-chord.musicxml')]);
    await page.setInputFiles('#sc-file', { name: 'bom.musicxml', mimeType: 'application/xml', buffer: bom });
    await page.waitForFunction(() => SLScore.originalBytes && SLScore.originalBytes[0] === 239);
    ok(await page.evaluate(() => Array.from(SLScore.originalBytes).slice(0, 3).join(',')) === '239,187,191', 'UTF-8 byte-order marker preserved independently of parsing');
    await page.setInputFiles('#sc-file', { name: 'unsupported.musicxml', mimeType: 'application/xml', buffer: fixture('repeat.musicxml') });
    await page.waitForFunction(() => document.querySelector('#sc-status').classList.contains('error'));
    ok(await page.evaluate(() => SLScore.model.title) === 'Tempo, tie and chord fixture', 'failed unsupported import preserves previous valid score');
    await page.setInputFiles('#sc-file', { name: 'compressed.mxl', mimeType: 'application/zip', buffer: Buffer.from([0x50, 0x4b, 3, 4]) });
    await page.waitForFunction(() => /Compressed/.test(document.querySelector('#sc-status').textContent));
    ok(/uncompressed/.test(await page.locator('#sc-status').innerText()), 'compressed MXL gives actionable honest error');

    await page.evaluate(() => {
      window.__scoreMidiCalls = 0; App.midi.send = () => { window.__scoreMidiCalls++; return true; };
      window.__scoreConnections = []; window.__scoreStops = 0;
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (target) { window.__scoreConnections.push({ source: this.constructor.name, target: target.constructor.name, master: target === App.getAudio().destination }); return connect.apply(this, arguments); };
      const stop = OscillatorNode.prototype.stop;
      OscillatorNode.prototype.stop = function () { window.__scoreStops++; return stop.apply(this, arguments); };
      App.setVolume(0);
    });
    await page.click('#sc-play'); await page.waitForTimeout(220);
    const audio = await page.evaluate(() => ({ playing: SLScore.playing, voices: SLScore.activeVoices, connections: window.__scoreConnections, masterType: App.getAudio().destination.constructor.name, midi: window.__scoreMidiCalls }));
    ok(audio.playing && audio.voices > 0, 'local audio voices actually scheduled during score playback');
    ok(audio.masterType === 'GainNode' && audio.connections.some(c => c.source === 'GainNode' && c.master) && !audio.connections.some(c => c.target === 'AudioDestinationNode'), 'score synth connects through the actual app master gain');
    await page.click('#sc-stop');
    ok(await page.evaluate(() => !SLScore.playing && SLScore.activeVoices === 0 && window.__scoreStops >= 2), 'Stop cancels owned scheduled oscillator voices immediately');
    await page.click('#sc-play'); await page.waitForTimeout(180); await page.evaluate(() => App.emit('transport:claim', { owner: 'test-other' }));
    ok(await page.evaluate(() => !SLScore.playing && SLScore.activeVoices === 0), 'another transport claim stops all score voices');
    await page.click('#sc-play'); await page.waitForTimeout(180); await page.evaluate(() => App.switchTo('piano'));
    ok(await page.evaluate(() => !SLScore.playing && SLScore.activeVoices === 0), 'leaving Score stops all voices');
    await page.evaluate(() => App.switchTo('score')); await page.click('#sc-play'); await page.waitForTimeout(180);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    ok(await page.evaluate(() => !SLScore.playing && SLScore.activeVoices === 0), 'hidden document stops score audio');
    await page.evaluate(() => { delete document.hidden; });
    const pending = await page.evaluate(async () => {
      const ctx = App.getAudio(), resume = ctx.resume.bind(ctx); await ctx.suspend();
      const releases = []; ctx.resume = () => new Promise(resolve => releases.push(() => resume().then(resolve)));
      const start = SLScore.play(); App.emit('transport:claim', { owner: 'pending-test' });
      await Promise.all(releases.map(fn => fn())); await start; ctx.resume = resume;
      return !SLScore.playing && SLScore.activeVoices === 0;
    });
    ok(pending, 'transport claim cancels an audio start still waiting for resume');
    await page.locator('#sc-play').focus(); await page.keyboard.press('Space'); await page.waitForTimeout(160); await page.keyboard.press('Escape');
    ok(await page.evaluate(() => !SLScore.playing && SLScore.activeVoices === 0), 'Space/Escape playback controls are usable from keyboard');
    ok(await page.evaluate(() => window.__scoreMidiCalls) === 0, 'score preview/export never calls MIDI hardware output');
    await page.evaluate(() => App.setVolume(100));

    await page.setViewportSize({ width: 360, height: 740 });
    await page.click('#sc-demo');
    const mobile = await page.evaluate(() => {
      const panel = document.getElementById('panel-score');
      const overflow = document.documentElement.scrollWidth > innerWidth + 1;
      const outside = [...panel.querySelectorAll('button,select')].filter(n => { const r = n.getBoundingClientRect(); return r.width && (r.left < -1 || r.right > innerWidth + 1); }).map(n => n.id);
      return { overflow, outside, allTall: [...panel.querySelectorAll('#sc-result button,#sc-result select')].every(n => n.getBoundingClientRect().height >= 40) };
    });
    ok(!mobile.overflow && mobile.outside.length === 0 && mobile.allTall, '360px layout contains controls with touch-sized targets');
    await page.locator('#sc-play').scrollIntoViewIfNeeded();
    const hit = await page.locator('#sc-play').evaluate(n => { const r = n.getBoundingClientRect(), t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return t === n || n.contains(t); });
    ok(hit, 'mobile Play control is reachable at its visible center');
    if (process.env.SL_SCORE_SCREENSHOT) await page.screenshot({ path: process.env.SL_SCORE_SCREENSHOT, fullPage: true });
    ok(errors.length === 0, 'no uncaught browser errors: ' + errors.join('; '));
    await context.close();
    console.log('# Score: ' + passes + ' checks passed (browser simulation; no hardware proof).');
  } finally { await browser.close(); }
})().catch(e => { console.error('FAIL', e.stack || e); process.exitCode = 1; });
