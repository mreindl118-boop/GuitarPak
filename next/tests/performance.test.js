// Complete performance-player flows against actual UI + engine + shared MIDI.
// The clock and Web MIDI ports are cloud fakes; no hardware is opened.
const { chromium } = require('playwright');
const env = require('./env');
let checks = 0;
function ok(value, message) { if (!value) throw new Error(message); checks++; console.log('  PASS', message); }
const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;
const WAIT = { title: 'Original browser fixture: repeated note, chord and rest', bpm: 120, len: 5,
  notes: [{ m: 48, t: 0, d: 1, v: 90 }, { m: 48, t: 1, d: 1, v: 90 },
    { m: 52, t: 2, d: 1, v: 90 }, { m: 55, t: 2, d: 1, v: 90 }, { m: 50, t: 4, d: 1, v: 90 }] };
const TEMPO = { title: 'Original browser fixture: timed melody', bpm: 120, len: 3,
  notes: [{ m: 48, t: 0, d: 0.8, v: 90 }, { m: 50, t: 1, d: 0.8, v: 90 }, { m: 52, t: 2, d: 0.8, v: 90 }] };

(async function () {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  let page;
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.addInitScript(() => {
      ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
      localStorage.setItem('guitarlab.midi.outputId', '"lumi-out"');
      localStorage.setItem('guitarlab.lights.displayEnabled', 'true');
      localStorage.setItem('guitarlab.lights.led', '"scale"');
      localStorage.setItem('guitarlab.fb.root', '0'); localStorage.setItem('guitarlab.fb.scale', '"major"');
      window.__performanceSent = [];
      class Port extends EventTarget {
        constructor(id, name) { super(); this.id = id; this.name = name; this.state = 'connected'; this.onmidimessage = null; }
        send(bytes) { __performanceSent.push({ id: this.id, bytes: Array.from(bytes) }); }
        receive(bytes) {
          const event = new Event('midimessage'); Object.defineProperty(event, 'data', { value: new Uint8Array(bytes) });
          if (this.onmidimessage) this.onmidimessage(event); this.dispatchEvent(event);
        }
      }
      const input = new Port('synth-in', 'Yamaha MODX');
      const access = { inputs: new Map([['synth-in', input]]),
        outputs: new Map([['synth-out', new Port('synth-out', 'Yamaha MODX')], ['lumi-out', new Port('lumi-out', 'LUMI Keys BLOCK')]]), sysexEnabled: true };
      navigator.requestMIDIAccess = () => Promise.resolve(access);
      window.__hardwareNote = (midi, on, channel = 0, velocity = 90) => input.receive([on ? 0x90 | channel : 0x80 | channel, midi, on ? velocity : 0]);
    });
    page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(env.URL);
    await page.waitForFunction(() => window.PerformancePlayer && window.Woodshed && Woodshed.performanceStart && App.midi.ready);
    await page.evaluate(() => {
      window.__performanceTime = 0;
      window.__performanceState = () => typeof PerformancePlayer.snapshot === 'function' ? PerformancePlayer.snapshot() : PerformancePlayer.snapshot;
      window.__performanceAt = time => { __performanceTime = time; PerformancePlayer.tick(); return __performanceState(); };
      window.__performanceChange = (id, value) => {
        const e = document.getElementById(id); if (!e) throw new Error('Missing performance control ' + id);
        if (e.type === 'checkbox') e.checked = !!value; else e.value = String(value);
        e.dispatchEvent(new Event('change', { bubbles: true }));
      };
      window.__performanceOpen = (score, mode, countIn = 0) => {
        App.switchTo('shed'); __performanceTime = 0;
        Woodshed.performanceStart(score, mode, { clock: () => __performanceTime });
        __performanceChange('pf-countin', countIn);
        return __performanceState();
      };
      window.__virtualNote = (midi, on) => {
        const e = document.querySelector('[data-pf-note="' + midi + '"]');
        if (!e) throw new Error('Missing virtual performance key ' + midi);
        e.dispatchEvent(new PointerEvent(on ? 'pointerdown' : 'pointerup', { bubbles: true, pointerId: midi, pointerType: 'touch' }));
      };
    });

    console.log('# first-class library entry');
    const entry = await page.evaluate(() => {
      App.switchTo('shed');
      const available = !!document.getElementById('ws-guided-melody') && !!document.getElementById('ws-guided-chords');
      document.getElementById('ws-guided-melody').click();
      const melody = __performanceState(); document.getElementById('pf-back').click();
      const back = !!document.getElementById('ws-guided-chords'); document.getElementById('ws-guided-chords').click();
      const chord = __performanceState(); __performanceChange('pf-mode', 'tempo');
      return { available, melody, back, chord, tempo: __performanceState() };
    });
    ok(entry.available && entry.melody.current && entry.melody.results.expected > 0, 'built-in melody opens the actual first-class player from the library');
    ok(entry.back && entry.chord.results.expected > entry.chord.upcoming.length, 'Library back and generated chord exercise are usable without imports');
    ok(entry.tempo.mode === 'tempo' && entry.tempo.status === 'idle', 'the visible mode selector switches the same source into Play at Tempo');

    console.log('# complete Wait for Me flow');
    const first = await page.evaluate(score => {
      __performanceOpen(score, 'wait'); App.scaleLock.set(true);
      document.getElementById('pf-start').click(); PerformancePlayer.tick();
      return { state: __performanceState(), current: document.getElementById('pf-current').textContent,
        upcoming: document.getElementById('pf-upcoming').textContent, feedbackLive: document.getElementById('pf-feedback').getAttribute('aria-live'),
        keys: document.querySelectorAll('[data-pf-note]').length, reportHidden: document.getElementById('pf-report').hidden };
    }, WAIT);
    ok(first.state.status === 'running' && first.state.mode === 'wait' && first.state.current.notes.includes(48), 'Wait starts at the first real source target');
    ok(first.current.trim().length > 0 && first.upcoming.trim().length > 0 && first.keys >= 13 && first.feedbackLive, 'current/upcoming notes, playable keyboard and live feedback are visible without hardware');
    const waiting = await page.evaluate(() => {
      __hardwareNote(49, true); __hardwareNote(49, false);
      const wrong = __performanceState();
      const wrongShape = document.querySelector('[data-pf-note="49"] i').textContent;
      const wrongText = document.getElementById('pf-feedback').textContent;
      __hardwareNote(48, true); const correct = __performanceState();
      __hardwareNote(48, true); const held = __performanceState();
      __hardwareNote(48, false); __virtualNote(48, true); __virtualNote(48, false);
      return { wrong, wrongShape, wrongText, correct, held, rearticulated: __performanceState() };
    });
    ok(waiting.wrong.results.wrong >= 1 && waiting.wrong.current.notes.includes(48), 'scale-blocked wrong raw MIDI note is still graded and cannot advance Wait');
    ok(waiting.wrongShape === '×' && /wrong|target|release/i.test(waiting.wrongText), 'wrong input has visible shape and text feedback in addition to color');
    ok(waiting.correct.current.beat === 1 && waiting.held.current.beat === 1, 'repeated source note requires release/rearticulation rather than a held-note repeat');
    ok(waiting.rearticulated.current.notes.includes(52) && waiting.rearticulated.current.notes.includes(55), 'virtual re-strike advances to the actual two-note chord');
    const chord = await page.evaluate(() => {
      __virtualNote(52, true); const partial = __performanceState();
      __hardwareNote(51, true); __hardwareNote(51, false);
      const extra = __performanceState(); __virtualNote(55, true);
      const completeChord = __performanceState();
      __virtualNote(52, false); __virtualNote(55, false);
      const beforeRest = __performanceAt(0.49); const afterRest = __performanceAt(0.51);
      __hardwareNote(50, true); __hardwareNote(50, false); PerformancePlayer.tick();
      return { partial, extra, completeChord, beforeRest, afterRest, final: __performanceState(),
        report: document.getElementById('pf-report').textContent, reportHidden: document.getElementById('pf-report').hidden,
        progress: Number(document.getElementById('pf-progress').value) };
    });
    ok(chord.partial.current.beat === 2 && chord.extra.current.beat === 2 && chord.extra.results.wrong > waiting.wrong.results.wrong, 'partial chord and an extra wrong note do not bypass the simultaneous chord target');
    ok(chord.completeChord.phase === 'rest' && chord.beforeRest.phase === 'rest' && chord.afterRest.phase === 'target', 'written rest gap is honored before the next target');
    ok(chord.final.status === 'complete' && chord.final.results.matched === 5 && chord.final.results.wrong >= 2, 'Wait completes all five source notes with mistakes retained');
    ok(!chord.reportHidden && /accuracy|correct|matched/i.test(chord.report) && chord.progress > 0, 'completion shows an accuracy/results report and completed progress');

    console.log('# Play at Tempo, count-in and timing');
    const timed = await page.evaluate(score => {
      __performanceOpen(score, 'tempo', 4); document.getElementById('pf-start').click();
      const start = __performanceState(); __performanceAt(1.9);
      const beforePlayhead = document.getElementById('pf-roll').getAttribute('aria-label');
      __hardwareNote(48, true); __hardwareNote(48, false); const countIn = __performanceState();
      __performanceAt(2.0); __performanceAt(2.05); __hardwareNote(48, true); __performanceAt(2.2); __hardwareNote(48, false);
      const movingPlayhead = document.getElementById('pf-roll').getAttribute('aria-label');
      __performanceAt(2.45); __virtualNote(50, true); __performanceAt(2.6); __virtualNote(50, false);
      __performanceAt(3.7);
      return { start, countIn, beforePlayhead, movingPlayhead, final: __performanceState(), report: document.getElementById('pf-report').textContent };
    }, TEMPO);
    ok(timed.start.status === 'countin' && timed.countIn.results.matched === 0 && timed.countIn.results.wrong === 0, 'four-beat count-in accepts no performance answers or mistakes');
    ok(timed.final.status === 'complete' && timed.final.results.matched === 2 && timed.final.results.missed === 1, 'tempo mode scores actual timed notes and retains an unplayed target as missed');
    ok(timed.final.results.early >= 1 && timed.final.results.late >= 1 && timed.final.results.meanAbsTimingMs > 0, 'early/late timing evidence is preserved in results');
    ok(timed.beforePlayhead !== timed.movingPlayhead && /Piano roll|Beat/i.test(timed.movingPlayhead), 'the score/playhead preview updates with musical time and supplies an accessible description');
    ok(timed.final.results.durationSamples >= 2 && /Hold samples|hold error/i.test(timed.report), 'played note releases contribute separate hold-duration evidence to the report');
    ok(/timing|early|late|miss/i.test(timed.report), 'timed report exposes timing/miss feedback to the player');

    console.log('# pause, speed, restart and section loop');
    const controls = await page.evaluate(score => {
      __performanceOpen(score, 'tempo'); document.getElementById('pf-start').click(); __performanceAt(0.25);
      document.getElementById('pf-pause').click(); const paused = __performanceState();
      __performanceAt(10); const frozen = __performanceState();
      document.getElementById('pf-pause').click(); const resumed = __performanceState();
      __performanceChange('pf-tempo', 60); const slower = __performanceState();
      __performanceAt(10.25); const afterSlow = __performanceState();
      document.getElementById('pf-restart').click(); const restarted = __performanceState();
      document.getElementById('pf-stop').click();
      __performanceChange('pf-section-start', 1); __performanceChange('pf-section-end', 2); __performanceChange('pf-loop', true);
      document.getElementById('pf-start').click(); __performanceAt(13); const looped = __performanceState();
      document.getElementById('pf-stop').click(); const stopped = __performanceState();
      return { paused, frozen, resumed, slower, afterSlow, restarted, looped, stopped };
    }, TEMPO);
    ok(controls.paused.status === 'paused' && near(controls.paused.beat, controls.frozen.beat), 'pause holds musical position while the injected clock advances');
    ok(controls.resumed.status === 'running' && near(controls.resumed.beat, controls.paused.beat), 'resume continues from the same beat without a time jump');
    ok(controls.slower.tempo === 60 && controls.afterSlow.beat - controls.resumed.beat <= 0.3, 'tempo change reclocks subsequent progress rather than jumping position');
    ok(controls.restarted.results.matched === 0 && controls.restarted.results.missed === 0 && near(controls.restarted.beat, 0), 'restart resets score and position');
    ok(controls.looped.results.loops >= 1 && controls.looped.section.loop, 'chosen source section repeats with a visible loop result');
    ok(controls.stopped.status === 'stopped' && controls.stopped.held.length === 0, 'Stop clears held performance input state');

    const transformed = await page.evaluate(score => {
      __performanceOpen(score, 'wait'); __performanceChange('pf-transpose', 12);
      document.getElementById('pf-start').click(); const target = __performanceState();
      document.getElementById('pf-stop').click();
      __performanceOpen({ title: 'Original keyboard fixture', bpm: 120, len: 1, notes: [{ m: 48, t: 0, d: 1, v: 90 }] }, 'wait');
      document.getElementById('pf-start').click();
      document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }));
      document.body.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA', bubbles: true }));
      return { target, keyboard: __performanceState() };
    }, WAIT);
    ok(transformed.target.transpose === 12 && transformed.target.current.notes.includes(60), 'transpose updates the actual structured target by the requested semitones');
    ok(transformed.keyboard.status === 'complete' && transformed.keyboard.results.matched === 1 && transformed.keyboard.held.length === 0, 'QWERTY plays and releases the actual virtual instrument through the complete scorer');

    console.log('# shared display and navigation cleanup');
    const display = await page.evaluate(score => {
      __performanceOpen(score, 'wait'); document.getElementById('pf-start').click();
      __performanceSent.length = 0; App.midi.setDisplayEnabled(false); PerformancePlayer.tick();
      const off = __performanceSent.filter(s => s.id === 'lumi-out' && (s.bytes[0] & 0xf0) === 0x90 && s.bytes[2] > 0);
      __performanceSent.length = 0; App.midi.setDisplayEnabled(true); PerformancePlayer.tick();
      const on = __performanceSent.filter(s => s.id === 'lumi-out' && (s.bytes[0] & 0xf0) === 0x90 && s.bytes[2] > 0);
      __hardwareNote(48, true); App.switchTo('piano');
      return { off, on, state: __performanceState() };
    }, WAIT);
    ok(display.off.length === 0 && display.on.some(s => s.bytes[1] % 12 === 0), 'optional master LUMI display off suppresses LEDs; on shows the current real target');
    ok(!['running', 'countin'].includes(display.state.status) && display.state.held.length === 0, 'leaving performance stops grading and releases held state');

    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(score => {
      __performanceOpen(score, 'wait');
      return { width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
        start: !!document.getElementById('pf-start'), current: !!document.getElementById('pf-current'), keyboard: document.querySelectorAll('[data-pf-note]').length };
    }, WAIT);
    ok(mobile.start && mobile.current && mobile.keyboard >= 13 && mobile.scroll <= mobile.width + 2, 'mobile performance controls, note display and virtual input fit the viewport');
    ok(errors.length === 0, 'no browser errors: ' + errors.join('; '));
    console.log('ALL PASS (' + checks + ' checks; cloud browser simulation only)');
  } catch (error) {
    if (page) await page.screenshot({ path: '/tmp/sl-performance-failure.png', fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
