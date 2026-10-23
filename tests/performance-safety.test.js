// Independent browser review cases for the performance UI's raw MIDI boundary.
// Ports and clock are simulated; no device is opened and app audio is muted.
const { chromium } = require('playwright');
const env = require('./env');
let checks = 0, fails = 0;
function ok(value, message) {
  checks++; if (!value) fails++;
  console.log(value ? '  PASS' : '  FAIL', message);
}
const SCORE = { title: 'Original safety fixture', bpm: 120, len: 5,
  notes: [{ m: 48, t: 0, d: 1 }, { m: 52, t: 0, d: 1 }, { m: 50, t: 2, d: 1 }] };

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1000, height: 900 } });
    await context.addInitScript(() => {
      ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
      localStorage.setItem('guitarlab.fb.root', '0'); localStorage.setItem('guitarlab.fb.scale', '"major"');
      localStorage.setItem('guitarlab.ws.performance.input', '"synth-in"');
      localStorage.setItem('guitarlab.midi.appSound', 'false');
      localStorage.setItem('guitarlab.lights.displayEnabled', 'true');
      window.__sent = [];
      class Port extends EventTarget {
        constructor(id, name) { super(); this.id = id; this.name = name; this.state = 'connected'; this.onmidimessage = null; }
        send(bytes) { __sent.push(Array.from(bytes)); }
        receive(bytes) {
          const event = new Event('midimessage'); Object.defineProperty(event, 'data', { value: new Uint8Array(bytes) });
          if (this.onmidimessage) this.onmidimessage(event); this.dispatchEvent(event);
        }
      }
      window.__synth = new Port('synth-in', 'Performance synth'); window.__other = new Port('other-in', 'Unselected keyboard');
      window.__access = { inputs: new Map([['other-in', __other], ['synth-in', __synth]]),
        outputs: new Map([['lumi-out', new Port('lumi-out', 'LUMI Keys BLOCK')]]), sysexEnabled: true };
      navigator.requestMIDIAccess = () => Promise.resolve(__access);
      window.__at = 0;
      window.__lit = () => {
        const lit = {};
        __sent.forEach(b => {
          if ((b[0] & 0xf0) === 0x90 && b[2]) lit[b[1]] = b[2];
          if ((b[0] & 0xf0) === 0x80 || ((b[0] & 0xf0) === 0x90 && !b[2])) delete lit[b[1]];
        });
        return Object.keys(lit).map(Number);
      };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(env.URL);
    await page.waitForFunction(() => window.PerformancePlayer && window.Woodshed);
    await page.evaluate(async score => {
      await App.midi.enable(); App.midi.setDisplayOutput('lumi-out'); App.midi.setInput('other-in'); App.midi.setAppSound(false);
      window.__score = score;
      window.__change = (id, value) => { const e = document.getElementById(id); e.value = value; e.dispatchEvent(new Event('change')); };
      window.__open = (inputId = 'synth-in') => {
        App.switchTo('shed'); __at = 0;
        Woodshed.performanceStart(__score, 'wait', { inputId, clock: () => __at, countIn: 0 });
        document.getElementById('pf-sound').checked = false;
        document.getElementById('pf-start').click();
      };
      window.__state = () => PerformancePlayer.snapshot();
      const guide = App.midi.guide;
      window.__guide = { now: [], next: [] };
      App.midi.guide = function(now, next) {
        const list = v => v == null ? [] : Array.isArray(v) ? v.slice() : [v];
        __guide = { now: list(now), next: list(next) }; return guide.apply(this, arguments);
      };
      window.__on = (n, ch = 0) => __synth.receive([0x90 | ch, n, 100]);
      window.__off = (n, ch = 0) => __synth.receive([0x80 | ch, n, 0]);
      __open();
    }, SCORE);

    console.log('# restored input selection is a real route');
    const restored = await page.evaluate(() => ({ selected: document.getElementById('pf-input').value, actual: App.midi.inputId }));
    ok(restored.selected === 'synth-in' && restored.actual === 'synth-in', 'restored Performance input listens to its selected port immediately');

    console.log('# raw scoring is independent of sound filters and other keyboards');
    const raw = await page.evaluate(() => {
      App.midi.setInput('all'); // expose both ports; the player retains its own synth-only selection
      App.scaleLock.set(true); document.getElementById('pf-start').click();
      if (__state().status === 'paused') document.getElementById('pf-pause').click();
      App.midi.setInputFilter(() => null);
      __other.receive([0x90, 48, 100]); const ignored = __state();
      __on(49); __off(49); const wrong = __state();
      __synth.receive([0x92, 48, 100, 52, 100]); const chord = __state();
      __synth.receive([0x92, 48, 0, 52, 0]); const released = __state();
      App.midi.setInputFilter(null);
      return { ignored, wrong, chord, released };
    });
    ok(raw.ignored.held.length === 0 && raw.ignored.results.matched === 0, 'an unselected keyboard cannot enter or answer a performance target');
    ok(raw.wrong.results.wrong === 1 && raw.wrong.results.matched === 0, 'scale-blocked and sound-filtered raw mistakes are still graded');
    ok(raw.chord.results.matched === 2 && raw.chord.current.notes[0] === 50, 'packed running-status chord attacks preserve channel and both pitches');
    ok(!raw.released.held.length, 'packed velocity-zero note-ons release both matching channel notes');

    console.log('# realtime may be interleaved anywhere in a packed channel message');
    const realtime = await page.evaluate(() => {
      __open(); App.midi.setInput('all');
      __synth.receive([0x90, 48, 0xf8, 100, 52, 100]);
      return __state();
    });
    ok(realtime.results.matched === 2 && realtime.results.extra === 0 && realtime.held.join() === '48,52',
      'interleaved MIDI clock is ignored without consuming pitch/velocity bytes or inventing attacks');
    const fragments = await page.evaluate(() => {
      __open(); App.midi.setInput('all');
      __synth.receive([0x90, 48]); __synth.receive([0xf8, 100, 52]); __synth.receive([100]);
      return __state();
    });
    ok(fragments.results.matched === 2 && fragments.results.extra === 0,
      'partial channel messages retain data and running status across input packets');
    const sysex = await page.evaluate(() => {
      __open(); App.midi.setInput('all');
      __synth.receive([0x90, 48, 100, 0xf0, 1, 2, 0xf8, 0xf7, 52, 100]); const cancelled = __state();
      __synth.receive([0x90, 52, 100]); return { cancelled, explicit: __state() };
    });
    ok(sysex.cancelled.results.matched === 0 && sysex.cancelled.held.join() === '48' && sysex.explicit.results.matched === 2,
      'SysEx cancels running status; its payload and trailing data never become phantom chord notes');

    console.log('# channel/system controls cannot become phantom key attacks');
    const controls = await page.evaluate(() => {
      __open(); App.midi.setInput('all');
      __synth.receive([0xc3, 10, 0xd3, 70, 0xe3, 0, 64, 0xf8, 0x93, 48, 100, 52, 100]);
      const chord = __state();
      __synth.receive([0xb3, 64, 127, 0x83, 48, 0, 52, 0]);
      const sustain = __state(); __synth.receive([0xb3, 64, 0]);
      return { chord, sustain, released: __state() };
    });
    ok(controls.chord.results.matched === 2 && controls.chord.results.extra === 0,
      'program, pressure, bend and clock bytes preserve the next chord without becoming notes');
    ok(!controls.sustain.held.length && controls.sustain.sounding.length === 2 && !controls.released.sounding.length,
      'channel-matched sustain preserves sounding notes until pedal-up without treating them as physical keys');

    console.log('# independent ports, disconnect, stop and virtual cleanup');
    const disconnected = await page.evaluate(() => {
      __open(); App.midi.setInput('all'); __on(48, 7);
      __synth.state = 'disconnected'; __access.onstatechange({ port: __synth });
      const gone = __state();
      __synth.state = 'connected'; __access.onstatechange({ port: __synth }); App.midi.setInput('all');
      if (__state().status === 'paused') document.getElementById('pf-pause').click();
      __on(48, 7); return { gone, back: __state(), selected: document.getElementById('pf-input').value };
    });
    ok(!disconnected.gone.held.length && disconnected.gone.status === 'paused', 'selected synth disconnect releases its held keys and pauses grading');
    ok(disconnected.selected === 'synth-in' && disconnected.back.current.matched.includes(48),
      'reconnect preserves the selected synth identity and accepts its first fresh attack');
    const stop = await page.evaluate(() => {
      document.getElementById('pf-stop').click(); const stopped = __state();
      document.getElementById('pf-start').click(); __on(48, 7);
      const again = __state(); __off(48, 7);
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }));
      const typed = __state(); __change('pf-octave', 60); const moved = __state();
      return { stopped, again, typed, moved };
    });
    ok(!stop.stopped.held.length && !stop.stopped.sounding.length && stop.stopped.status === 'stopped', 'Stop releases all hardware channels in both physical and sounding state');
    ok(stop.again.current.matched.includes(48), 'fresh attack after Stop is not suppressed by an old hardware hold');
    ok(stop.typed.held.includes(48) && !stop.moved.held.length && !stop.moved.sounding.length,
      'changing keyboard view releases QWERTY as well as pointer voices');
    const nav = await page.evaluate(() => {
      __open(); App.midi.setInput('all'); __on(48, 5); App.switchTo('piano');
      __off(48, 5); return __state();
    });
    ok(nav.status === 'paused' && !nav.held.length && !nav.sounding.length, 'navigation and later raw releases cannot strand external held-key state');

    console.log('# tempo count-in previews the first source target');
    const countIn = await page.evaluate(() => {
      __open(); __change('pf-mode', 'tempo'); __change('pf-countin', 4); document.getElementById('pf-start').click();
      return { state: __state(), guide: __guide, lit: __lit(),
        targets: [...document.querySelectorAll('.pf-target')].map(e => Number(e.dataset.pfNote)) };
    });
    ok(countIn.state.status === 'countin' && countIn.guide.now.join() === countIn.state.current.notes.join() &&
      countIn.targets.join() === countIn.state.current.notes.join(),
      'tempo count-in previews the same first chord on screen and LUMI before grading begins');
    ok(countIn.state.current.notes.every(n => countIn.lit.includes(n)) && countIn.lit.every(n => [48, 52, 50].includes(n)),
      'actual count-in LED frame contains the first chord and only its immediate next target');

    console.log('# visible targets follow scored onsets and source durations consistently');
    const timeline = await page.evaluate(() => {
      __score = { title: 'Original duration display fixture', bpm: 120, len: 4,
        notes: [{ m: 48, t: 0, d: 2 }, { m: 52, t: 1, d: 1 }, { m: 55, t: 3, d: 1 }] };
      __open(); __change('pf-mode', 'tempo'); document.getElementById('pf-start').click();
      __at = 0.05; PerformancePlayer.tick(); __on(48);
      const playing = { state: __state(), guide: __guide, current: document.getElementById('pf-current').textContent,
        upcoming: document.getElementById('pf-upcoming').textContent, roll: document.getElementById('pf-roll').getAttribute('aria-label'),
        targets: [...document.querySelectorAll('.pf-target')].map(e => Number(e.dataset.pfNote)), lit: __lit() };
      __at = 1.1; PerformancePlayer.tick();
      return { playing, rest: { state: __state(), guide: __guide, current: document.getElementById('pf-current').textContent,
        upcoming: document.getElementById('pf-upcoming').textContent, roll: document.getElementById('pf-roll').getAttribute('aria-label'),
        targets: [...document.querySelectorAll('.pf-target')].map(e => Number(e.dataset.pfNote)) } };
    });
    ok(timeline.playing.state.activeNotes.join() === '48' && timeline.playing.targets.join() === '48' && timeline.playing.guide.now.join() === '48',
      'a matched sustained note remains the keyboard and LED target for its written duration');
    ok(timeline.playing.lit.includes(48) && timeline.playing.lit.every(n => [48, 52].includes(n)),
      'actual emitted LUMI frame keeps the sustained target and only its immediate next pitch');
    ok(/C3/.test(timeline.playing.current) && /E3/.test(timeline.playing.upcoming) && /C3/.test(timeline.playing.roll),
      'current note, immediate future onset and accessible roll label agree with the duration timeline');
    ok(timeline.rest.state.phase === 'rest' && !timeline.rest.targets.length && !timeline.rest.guide.now.length && /Rest/.test(timeline.rest.current),
      'written rest has no active keyboard or LED target');
    ok(/G3/.test(timeline.rest.upcoming) && /Rest/.test(timeline.rest.roll),
      'rest keeps the immediate next score note visible while the accessible roll announces Rest');
    await page.screenshot({ path: '/tmp/soundlab-performance-review.png', fullPage: true });
    ok(!errors.length, 'no browser runtime errors: ' + errors.join('; '));
    await context.close();
    console.log(`${fails ? 'FAILED' : 'ALL PASS'} (${checks} checks, ${fails} failures; cloud fakes only)`);
    process.exitCode = fails ? 1 : 0;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
