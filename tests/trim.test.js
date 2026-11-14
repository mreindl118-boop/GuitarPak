// soundLAB 2.0, Phase A ("Trim"): what left the app is gone, what stays still
// works, and the 1.x data on the same origin is never touched.
// Plan: docs/plans/phase-a/PLAN.md (sections 4.5, 5.7 and 7.5).
//
// A1 = the Studio space, the loop/song sequencer, the sampler and its
// database, and the plug-in API are out:
//   - the panels are exactly the page list plus Settings; no Studio tab or pill
//   - the removed controls and globals are gone, the sound library is kept
//   - a stored 1.x plug-in is never run; the sampler database is never opened
//   - stored Studio / plug-in / workspace keys are byte-identical after every
//     page was visited and the kept sounds were played (the live app on this
//     origin still owns them) — and after the same profile opened soundLAB
//     Gear and its four pages (A3b: they were soundLAB pages when A1 wrote
//     this guard)
//   - a stale workspace or page id lands on Exercises, never on a blank page
//   - Backup import skips the keys of removed features and says so
// A2 = three pills are folded into the pages that took their features in
// (plan section 5): the Trainer cards are on the Plan page (Free practice),
// the Synth pill is the Sound picker on Piano, LUMI practice is a section
// under the Keys lessons:
//   - no pill reads Trainer, Synth or LUMI; Keys is Piano | Charts | Pads,
//     Train is Woodshed | Tuner
//   - App.switchTo('trainer' / 'synth' / 'lumipractice') lands on Plan / Piano
//     / Piano and says where the feature went; so does a stored last page
//   - a stored pill (app.gtab.gkeys = synth, app.gtab.gprac = trainer) opens
//     the first page of its tab
//   - the interval ear trainer is Exercises now: #tr-ear-go starts the ear
//     level, and says why it does not under a category without ear training
// A3b = the Deck, Live sets, the MIDI Hub and Helix are soundLAB Gear
// (gear.html, plan section 7; tests/gear.test.js holds Gear to its side):
//   - soundLAB loads none of the gear modules and has 14 pages in five tabs;
//     no tab or pill reads Synth, Helix, Deck, Live or Hub
//   - the Hub's "Apply rules to what soundLAB hears" still works here: a
//     stored rule shapes what the Piano page receives, and Settings › MIDI
//     keyboard says so with the rule count (hidden when the box is off or no
//     rule is enabled; a rule for one keyboard only, m.port, is Thru's and is
//     not counted); its button opens the Hub in Gear
//   - a stored last page that is a Gear page boots to Exercises without
//     leaving soundLAB and says once where those pages are; Thru left on is
//     said once too; both at one start are said in ONE notice
//   - App.switchTo('midihub') leaves for gear.html#midihub
// No hardware: no microphone; the one MIDI keyboard (A3b) is a fake Web MIDI
// port. Sound runs into a muted context.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const J = JSON.stringify;

// ---- what this app is (A2 and A3b edited these lists) ----
// soundLAB's page list (js/app.js APPS.main.pages), in its order; Settings is an overlay page
const PAGES = ['quiz', 'practiceplan', 'fretboard', 'tab', 'notation', 'chords', 'piano', 'chart', 'pads',
  'songs', 'jam', 'shed', 'tuner', 'theory'];
// soundLAB Gear's pages (APPS.gear.pages): gear.html has them, index.html does not
const GEAR_PAGES = ['deck', 'liveset', 'midihub', 'helix'];
const TABS = 'Learn|Guitar|Keys|Play|Train';
// pages that left the app (MOVED in js/app.js): App.switchTo(id) goes to the page that took the feature in,
// or home, and says why. there = what the sentence names, on the page it lands on.
const STUDIO = /Studio is no longer part of soundLAB\./;
const MOVED = {
  arrange: { to: 'quiz', say: STUDIO }, tracks: { to: 'quiz', say: STUDIO }, song: { to: 'quiz', say: STUDIO }, ideas: { to: 'quiz', say: STUDIO },
  trainer: { to: 'practiceplan', say: /^The Trainer cards are on the Plan page now, under Free practice\.$/, there: '#panel-practiceplan #pp-tools #tr-cc-start' },
  synth: { to: 'piano', say: /^Synth sounds are in the Sound picker on the Piano page\.$/, there: '#panel-piano #pn-voice option:nth-of-type(2)' },
  lumipractice: { to: 'piano', say: /^LUMI practice is on the Piano page now, under the lessons\.$/, there: '#panel-piano #pn-lumi #pn-lumi-body #lp-mode' }
};
const NAMES = { quiz: 'Exercises', practiceplan: 'the Plan page', piano: 'the Piano page' };
// a tab or pill with one of these names would be a way into a removed page ("Songs" is not "Song")
const GONE_LABELS = /^(studio|sketch|timeline|editor|song|ideas)$/i;
// A2: three pills
const GONE_PILLS = /^(trainer|synth|lumi)$/i;
// A3b: the Synth tab (Deck | Live | Hub) and the Helix pill are soundLAB Gear
const GONE_GEAR = /^(synth|helix|deck|live|hub)$/i;
// its modules: none of them is loaded here
const GEAR_GLOBALS = ['SLMidiHub', 'SLSynthTab', 'SLSynthLive', 'SLSynthDeck', 'SLSynthScope', 'SLHelix'];
// the two notices soundLAB shows once (js/app.js boot), word for word
const TOLD_GEAR = 'Deck, Live sets, the MIDI Hub and Helix are in soundLAB Gear now: the Gear button at the top.';
const TOLD_THRU = 'MIDI Hub Thru runs in soundLAB Gear now. Keep Gear open in a second window to pass your keyboard to the synth while you practise.';
// controls that went with the Studio, the capture, the sequencer and the plug-in API
const GONE_IDS = ['space-btn', 'cx-rec', 'cx-rec-msg', 'wipe', 'set-click', 'set-retro', 'set-voice', 'set-plugin-file',
  'ws-track', 'pd-play', 'pd-rec', 'pd-click', 'pd-clear', 'pd-recinfo', 'pd-track', 'pd-mk',
  // A2: the Trainer's interval ear trainer (Exercises has it)
  'tr-ear-play', 'tr-ear-replay', 'tr-ear-harm', 'tr-ear-grid', 'tr-ear-msg'];
// help tours of removed pages (js/help.js)
const GONE_TOURS = ['song', 'arrange', 'tracks', 'ideas', 'trainer'];
// keys of removed features: no 2.0 code writes or deletes them (same pattern as the Backup skip in js/settings.js)
const DEAD = '^guitarlab\\.(st\\.|sd\\.|ideas\\.|song\\.|plugins\\.|app\\.space$|app\\.tabStudio$|app\\.click$|pads\\.track$)';

// what a 1.x profile holds. Raw strings, oddly spaced on purpose: a read-and-
// write-back of the JSON would change the bytes and show up below.
const PLUGIN_CODE = 'window.__pluginRan = (window.__pluginRan || 0) + 1;';
const OLD = {
  'st.tracks': '[ {"id":"t1","name":"Drums","kind":"drums","steps":[[1,0,0,0],[0,0,1,0]],"mix":{"vol":80,"mute":false,"solo":false}} ]',
  'st.bars': '2',
  'st.armed': '"t1"',
  'ideas.list': '[ {"id":"i1","name":"Idea 1","key":"A minor","bpm":120,"notes":[{"m":60,"t":0,"d":0.5}]} ]',
  'song.name': '"My song"',
  'sd.retroSecs': '30',
  'sd.playVoice': '"keys"',
  'plugins.list': '[ ' + J({ id: 'pold', name: 'old-plugin', code: PLUGIN_CODE, on: true, error: '' }) + ' ]',
  'app.space': '"studio"',
  'app.tabStudio': '"arrange"',
  'app.click': 'true',
  'pads.track': '"t1"'
};

// raw = { key: exact stored string }; json = { key: value } (stored as JSON, like App.store);
// extra = async ctx => {...}, run before the page is made (more init scripts)
async function newPage(browser, raw, json, extra) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (extra) await extra(ctx);
  await ctx.addInitScript(([raw, json]) => {
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    if (!sessionStorage.getItem('__seeded')) { // once: a reload must not put back what the app removed
      sessionStorage.setItem('__seeded', '1');
      for (const k in raw) localStorage.setItem('guitarlab.' + k, raw[k]);
      for (const k in json) localStorage.setItem('guitarlab.' + k, JSON.stringify(json[k]));
    }
    // every later write to localStorage: [what, key, value (kept for app.tab only)]
    window.__writes = [];
    const set = Storage.prototype.setItem, remove = Storage.prototype.removeItem, clear = Storage.prototype.clear;
    Storage.prototype.setItem = function (k, v) { if (this === window.localStorage) window.__writes.push(['set', String(k), String(k) === 'guitarlab.app.tab' ? String(v) : '']); return set.apply(this, arguments); };
    Storage.prototype.removeItem = function (k) { if (this === window.localStorage) window.__writes.push(['remove', String(k), '']); return remove.apply(this, arguments); };
    Storage.prototype.clear = function () { if (this === window.localStorage) window.__writes.push(['clear', '*', '']); return clear.apply(this, arguments); };
    // every database the page opens or deletes
    window.__idb = [];
    if (window.IDBFactory) {
      const open = IDBFactory.prototype.open, del = IDBFactory.prototype.deleteDatabase;
      IDBFactory.prototype.open = function (name) { window.__idb.push('open ' + name); return open.apply(this, arguments); };
      IDBFactory.prototype.deleteDatabase = function (name) { window.__idb.push('delete ' + name); return del.apply(this, arguments); };
    }
    window.__wait = ms => new Promise(r => setTimeout(r, ms));
    // a panel the user can see: it is the active one, it is laid out and it has content
    window.__seen = id => { const p = document.getElementById('panel-' + id); if (!p) return false; const r = p.getBoundingClientRect();
      return p.classList.contains('active') && getComputedStyle(p).display !== 'none' && r.height > 0 && p.children.length > 0; };
    window.__shown = () => Array.from(document.querySelectorAll('main > .panel.active')).map(p => p.id.slice(6)).join(',');
    window.__toast = () => { const t = document.getElementById('app-toast'); return t && !t.hidden ? t.textContent : ''; };
    window.__hideToast = () => { const t = document.getElementById('app-toast'); if (t) { t.hidden = true; t.textContent = ''; } };
  }, [raw || {}, json || {}]);
  const page = await ctx.newPage(), errs = [], logs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() !== 'error') return; const u = (m.location() && m.location().url) || ''; if (/Failed to load resource/.test(m.text()) && !/127\.0\.0\.1/.test(u)) return; logs.push(m.text() + (u ? ' @' + u : '')); });
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.active);
  await page.waitForTimeout(250);
  return { ctx, page, errs, logs };
}
const lines = a => a.length ? '\n    ' + a.join('\n    ') : '';

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });

  // ---------------------------------------------------------------- A1
  console.log('# A1 boot on a 1.x profile: Studio data, a stored plug-in, the Studio workspace left open');
  let { ctx, page, errs, logs } = await newPage(browser, OLD);
  const boot = await page.evaluate(() => ({
    active: App.active, shown: __shown(), seen: __seen('quiz'),
    panels: Array.from(document.querySelectorAll('main > .panel[id^="panel-"]')).map(el => el.id.slice(6)).sort(),
    broken: Array.from(document.querySelectorAll('.panel .error')).map(e => e.textContent).filter(t => /failed to load|crashed during init/.test(t)),
    space: document.documentElement.hasAttribute('data-space')
  }));
  ok(boot.active === 'quiz' && boot.shown === 'quiz' && boot.seen,
    'stale workspace (app.space = studio, app.tabStudio = arrange): the app boots to Exercises with a visible panel: ' + J([boot.active, boot.shown, boot.seen]));
  const want = PAGES.concat('settings').sort();
  ok(boot.panels.join('|') === want.join('|'), 'the panels are exactly the page list plus Settings (' + want.length + ')' +
    (boot.panels.join('|') === want.join('|') ? '' : '\n    extra: ' + J(boot.panels.filter(p => !want.includes(p))) + '\n    missing: ' + J(want.filter(p => !boot.panels.includes(p)))));
  ok(boot.broken.length === 0, 'every panel has its module: no "failed to load" or "crashed" notice' + lines(boot.broken));
  ok(!boot.space, 'no workspace marker (data-space) on <html>');

  console.log('# A1 gone from the window, kept as a sound library');
  const win = await page.evaluate((tours) => {
    const D = window.DAW || {};
    return {
      tours: tours.filter(id => window.Help && Help.TOURS && Help.TOURS[id]),
      gone: { SoundLab: typeof window.SoundLab, 'DAW.engine': typeof D.engine, 'DAW.createSampler': typeof D.createSampler, 'DAW.samples': typeof D.samples,
        'DAW.buildFx': typeof D.buildFx, 'DAW.fxPlugins': typeof D.fxPlugins, 'App.space': typeof App.space, 'App.setSpace': typeof App.setSpace },
      kept: { 'DAW.createSynth': typeof D.createSynth, 'DAW.guardPitched': typeof D.guardPitched, 'DAW.createDrums': typeof D.createDrums,
        'DAW.SYNTH_PRESETS': Array.isArray(D.SYNTH_PRESETS) && D.SYNTH_PRESETS.length > 0 ? 'list' : typeof D.SYNTH_PRESETS,
        'DAW.DRUM_LANES': Array.isArray(D.DRUM_LANES) && D.DRUM_LANES.length === 8 ? 'list' : typeof D.DRUM_LANES, 'App.addPage': typeof App.addPage },
      daw: Object.keys(D).sort().join(' ')
    };
  }, GONE_TOURS);
  const stillThere = Object.keys(win.gone).filter(k => win.gone[k] !== 'undefined');
  ok(stillThere.length === 0, 'gone from the window: ' + Object.keys(win.gone).join(', ') + (stillThere.length ? '\n    still there: ' + stillThere.join(', ') : ''));
  ok(win.tours.length === 0, 'no help tour is left for a removed page (' + GONE_TOURS.join(', ') + ')' + lines(win.tours));
  const keptWant = { 'DAW.createSynth': 'function', 'DAW.guardPitched': 'function', 'DAW.createDrums': 'function', 'DAW.SYNTH_PRESETS': 'list', 'DAW.DRUM_LANES': 'list', 'App.addPage': 'function' };
  const lostKept = Object.keys(keptWant).filter(k => win.kept[k] !== keptWant[k]);
  ok(lostKept.length === 0, 'kept: the synth, its presets, the pitch guard, the drum kit and its eight lanes, App.addPage (window.DAW = ' + win.daw + ')' +
    (lostKept.length ? '\n    wrong: ' + J(lostKept.map(k => k + ' is ' + win.kept[k])) : ''));

  console.log('# A3b soundLAB loads no soundLAB Gear module');
  const apps = await page.evaluate(([globals, pages]) => ({
    app: App.app, attr: document.documentElement.getAttribute('data-app'),
    loaded: globals.filter(n => typeof window[n] !== 'undefined').concat(typeof App.synthDeck !== 'undefined' ? ['App.synthDeck'] : []),
    panels: pages.filter(id => document.getElementById('panel-' + id)),
    scripts: Array.from(document.scripts).map(x => x.getAttribute('src') || '').filter(src => /midihub|synthtab|synthlive|synthdeck|helix/.test(src)),
    shared: { SLScorePlayer: typeof window.SLScorePlayer, 'App.midiRules': typeof App.midiRules, 'App.midi.synthOut': typeof (App.midi && App.midi.synthOut), 'App.goApp': typeof App.goApp }
  }), [GEAR_GLOBALS, GEAR_PAGES]);
  ok(apps.app === 'main' && apps.attr === null, 'this is soundLAB: App.app = "main", no data-app on <html>: ' + J([apps.app, apps.attr]));
  ok(apps.loaded.length === 0, GEAR_GLOBALS.join(', ') + ' are undefined in soundLAB' + (apps.loaded.length ? '\n    loaded: ' + apps.loaded.join(', ') : ''));
  ok(apps.panels.length === 0 && apps.scripts.length === 0, 'no panel and no script of a Gear page (' + GEAR_PAGES.join(', ') + ')' + lines(apps.panels.map(id => '#panel-' + id).concat(apps.scripts)));
  const sharedWant = { SLScorePlayer: 'object', 'App.midiRules': 'object', 'App.midi.synthOut': 'object', 'App.goApp': 'function' };
  const sharedLost = Object.keys(sharedWant).filter(k => apps.shared[k] !== sharedWant[k]);
  ok(sharedLost.length === 0, 'what the Hub shared stays: the score player, the rule engine, the synth output, the way across (App.goApp)' +
    (sharedLost.length ? '\n    wrong: ' + J(sharedLost.map(k => k + ' is ' + apps.shared[k])) : ''));

  // from here on, count what the kept sound library is asked to play (page:what)
  await page.evaluate(() => {
    window.__sound = { synths: 0, synthNotes: 0, drums: [] };
    const mkSynth = DAW.createSynth, mkDrums = DAW.createDrums;
    DAW.createSynth = function () { const s = mkSynth.apply(this, arguments); __sound.synths++;
      const on = s.noteOn; s.noteOn = function () { __sound.synthNotes++; return on.apply(this, arguments); }; return s; };
    DAW.createDrums = function () { const k = mkDrums.apply(this, arguments);
      const on = k.noteOn; k.noteOn = function (lane) { __sound.drums.push(App.active + ':' + lane); return on.apply(this, arguments); }; return k; };
  });

  console.log('# A1 every page opens; no way into a removed page');
  const tour = await page.evaluate(async (ids) => {
    const seen = [], labels = {}, pills = {};
    const read = () => document.querySelectorAll('.tabbar-btn, .subtab').forEach(b => { const t = (b.textContent || '').trim(); if (!t) return; labels[t] = 1; if (b.classList.contains('subtab')) pills[t] = 1; });
    read();
    for (const id of ids) { App.switchTo(id); await __wait(200); read(); seen.push({ id, active: App.active, shown: __shown(), seen: __seen(id) }); }
    const tabs = sel => Array.from(document.querySelectorAll(sel + ' .tabbar-btn')).map(b => (b.textContent || '').trim()).join('|');
    return { seen, labels: Object.keys(labels), pills: Object.keys(pills), tabs: tabs('#tabbar'), tabsPhone: tabs('#tabbar-m') };
  }, PAGES.concat('settings'));
  const lost = tour.seen.filter(x => x.active !== x.id || x.shown !== x.id || !x.seen);
  ok(lost.length === 0, 'visited ' + tour.seen.length + ' pages, each one the active page with its own panel visible' + (lost.length ? '\n    not shown: ' + J(lost) : ''));
  const badLabels = tour.labels.filter(t => GONE_LABELS.test(t));
  ok(tour.labels.includes('Learn') && badLabels.length === 0, 'no tab or pill reads Studio, Sketch, Timeline, Editor, Song or Ideas (' + tour.labels.length + ' labels seen)' +
    (badLabels.length ? '\n    found: ' + badLabels.join(', ') : ''));
  const badPills = tour.pills.filter(t => GONE_PILLS.test(t));
  ok(tour.pills.includes('Piano') && tour.pills.includes('Woodshed') && tour.pills.includes('Plan') && badPills.length === 0,
    'A2: no pill reads Trainer, Synth or LUMI (' + tour.pills.length + ' pills seen: ' + tour.pills.join(', ') + ')' + (badPills.length ? '\n    found: ' + badPills.join(', ') : ''));
  const badGear = tour.labels.filter(t => GONE_GEAR.test(t));
  ok(tour.tabs === TABS && tour.tabsPhone === TABS && badGear.length === 0, 'A3b: five tabs (' + tour.tabs + '), and no tab or pill reads Synth, Helix, Deck, Live or Hub' +
    (badGear.length ? '\n    found: ' + badGear.join(', ') : '') + (tour.tabsPhone === TABS ? '' : '\n    the phone tab bar: ' + tour.tabsPhone));
  const gone = await page.evaluate((ids) => ({
    found: ids.filter(id => document.getElementById(id)),
    cards: Array.from(document.querySelectorAll('#panel-settings h2, #panel-settings h3')).map(h => h.textContent.trim()).filter(t => /^(studio|plug-?ins?)$/i.test(t)),
    pads: document.querySelectorAll('#pd-grid .pd-pad').length, remap: ['pd-remap', 'pd-mapreset', 'pd-maphint'].every(id => document.getElementById(id))
  }), GONE_IDS);
  ok(gone.found.length === 0, 'gone from the page after every page was opened: #' + GONE_IDS.join(', #') + (gone.found.length ? '\n    still there: #' + gone.found.join(', #') : ''));
  ok(gone.cards.length === 0, 'Settings has no Studio card and no Plugins card' + lines(gone.cards));
  ok(gone.pads === 8 && gone.remap, 'Pads is play-only: eight pads and Remap stay: ' + J([gone.pads, gone.remap]));

  console.log('# A1 the kept sounds work with no engine');
  const snd = await page.evaluate(async () => {
    const o = {};
    // Piano: pick a synth in the Sound picker, play a key
    App.switchTo('piano'); await __wait(200);
    const sel = document.getElementById('pn-voice');
    const preset = sel && Array.from(sel.options).map(x => x.value).find(v => v !== 'piano');
    o.presets = sel ? sel.options.length : 0;
    if (preset) { sel.value = preset; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    o.voice = sel ? sel.value : null; o.preset = preset || null;
    const key = document.querySelector('#pn-svg .pn-key[data-midi="60"]') || document.querySelector('#pn-svg .pn-key[data-midi]');
    if (key) key.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    await __wait(120);
    o.key = !!key; o.synths = __sound.synths; o.synthNotes = __sound.synthNotes;
    if (sel) { sel.value = 'piano'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    // Jam: start, let the first bar be scheduled, stop
    App.switchTo('jam'); await __wait(250);
    const play = document.getElementById('jam-play'), fin = document.getElementById('jam-finish');
    o.jam = !!play && !!fin;
    if (o.jam) {
      play.click();
      const t0 = Date.now();
      while (Date.now() - t0 < 3000 && !__sound.drums.some(d => d.indexOf('jam:') === 0)) await __wait(25);
      o.jamRuns = !fin.disabled; o.jamDrums = __sound.drums.filter(d => d.indexOf('jam:') === 0).length;
      play.click(); await __wait(100);
      o.jamStopped = fin.disabled;
    }
    // Pads: one hit by touch
    App.switchTo('pads'); await __wait(200);
    const pad = document.querySelector('#pd-grid .pd-pad[data-lane="0"]');
    if (pad) pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    o.pad = !!pad; o.padFlash = !!pad && pad.classList.contains('pd-hit'); o.padDrums = __sound.drums.filter(d => d === 'pads:0').length;
    await __wait(150);
    // the drum kit by itself: every lane, straight into the output
    try {
      const ctx = App.getAudio(), kit = DAW.createDrums(ctx);
      kit.output.connect(ctx.destination);
      for (let lane = 0; lane < DAW.DRUM_LANES.length; lane++) kit.noteOn(lane, 0.8, ctx.currentTime);
      kit.allNotesOff(); kit.dispose();
      o.kit = 'ok';
    } catch (e) { o.kit = String(e && e.message || e); }
    App.switchTo('quiz'); await __wait(150);
    return o;
  });
  ok(snd.presets > 1 && snd.preset && snd.voice === snd.preset, 'Piano: the Sound picker lists the synth sounds and takes one: ' + J([snd.presets, snd.preset, snd.voice]));
  ok(snd.key && snd.synths >= 1 && snd.synthNotes >= 1, 'Piano: a key played with a synth sound goes through DAW.createSynth: ' + J([snd.key, snd.synths, snd.synthNotes]));
  ok(snd.jam && snd.jamRuns && snd.jamDrums >= 1, 'Jam starts and its drum kit plays through DAW.createDrums: ' + J([snd.jam, snd.jamRuns, snd.jamDrums]));
  ok(snd.jamStopped, 'Jam stops again');
  ok(snd.pad && snd.padFlash && snd.padDrums === 1, 'Pads: a hit flashes the pad and plays its own drum kit: ' + J([snd.pad, snd.padFlash, snd.padDrums]));
  ok(snd.kit === 'ok', 'DAW.createDrums(ctx).noteOn(...) plays all eight lanes: ' + snd.kit);

  console.log('# A1 + A2 a removed page id never leaves a blank screen');
  const moved = await page.evaluate(async (list) => {
    const out = [];
    for (const [id, to, there] of list) {
      App.switchTo('songs'); await __wait(120); // a page that is neither home nor a landing page
      __hideToast();
      App.switchTo(id); await __wait(120);
      let stored; try { stored = JSON.parse(localStorage.getItem('guitarlab.app.tab')); } catch (e) { stored = 'unreadable'; }
      out.push({ id, to, active: App.active, shown: __shown(), seen: __seen(to), toast: __toast(), stored, there: there ? !!document.querySelector(there) : null });
    }
    return out;
  }, Object.keys(MOVED).map(id => [id, MOVED[id].to, MOVED[id].there || '']).concat([['nosuchpage', 'quiz', '']]));
  for (const m of moved) {
    const mv = MOVED[m.id];
    ok(m.active === m.to && m.shown === m.to && m.seen, 'App.switchTo("' + m.id + '") lands on ' + NAMES[m.to] + ' with a visible panel: ' + J([m.active, m.shown, m.seen]));
    if (mv) ok(mv.say.test(m.toast), 'App.switchTo("' + m.id + '") says where the page went: "' + m.toast + '"');
    if (mv && mv.there) ok(m.there, 'App.switchTo("' + m.id + '"): what the sentence names is on that page (' + mv.there + ')');
    ok(m.stored === m.to, 'App.switchTo("' + m.id + '") is not stored as the last page (app.tab = ' + J(m.stored) + ')');
  }

  // what this document did to the 1.x data since it loaded (the init script starts __writes and __idb afresh
  // in every document; the seed is written once per tab, so a second document finds what the first left)
  const dataOf = () => page.evaluate(([keys, dead]) => {
    const re = new RegExp(dead), now = {};
    keys.forEach(k => { now[k] = localStorage.getItem('guitarlab.' + k); });
    return { now, ran: window.__pluginRan,
      writes: __writes.filter(w => w[0] === 'clear' || re.test(w[1])).map(w => w[0] + ' ' + w[1]),
      tabs: __writes.filter(w => w[1] === 'guitarlab.app.tab').map(w => w[2]),
      all: __writes.length, idb: __idb.slice() };
  }, [Object.keys(OLD), DEAD]);
  // the four things no page of either app may do to it
  const untouched = (d, after) => {
    ok(d.ran === undefined, 'a stored 1.x plug-in is never run (its code would set a global): ' + J(d.ran));
    const daw = d.idb.filter(x => /guitarlab-daw/.test(x));
    ok(daw.length === 0, 'the sampler database guitarlab-daw is never opened or deleted (databases touched: ' + (d.idb.join(', ') || 'none') + ')');
    const changed = Object.keys(OLD).filter(k => d.now[k] !== OLD[k]);
    ok(changed.length === 0, 'stored ' + Object.keys(OLD).join(', ') + ' are byte-identical after ' + after +
      (changed.length ? '\n    changed: ' + J(changed.map(k => k + ' = ' + d.now[k])) : ''));
    ok(d.all > 0 && d.writes.length === 0, 'no write, removal or clear of a removed-feature key (' + d.all + ' other writes seen)' + lines(d.writes));
  };

  console.log('# A1 the 1.x data on this origin is untouched');
  const data = await dataOf();
  untouched(data, 'every page, the sounds and a pad hit');
  const pageOf = v => { try { return JSON.parse(v); } catch (e) { return v; } };
  const badTabs = data.tabs.filter(v => !PAGES.includes(pageOf(v)));
  ok(data.tabs.length > 0 && badTabs.length === 0, 'app.tab only ever held a page of this app (' + data.tabs.length + ' writes)' + lines(badTabs));
  ok(errs.length === 0, 'no uncaught page error on a 1.x profile' + lines(errs));
  ok(logs.length === 0, 'no console error on a 1.x profile (a module that fails in init / onShow prints here)' + lines(logs));

  // the Deck, Live sets, the Hub and Helix were soundLAB pages when this guard was written; they are
  // soundLAB Gear now, on the same origin and the same store: the same profile, the same instruments
  console.log('# A3b the same 1.x profile in soundLAB Gear: its four pages leave that data alone too');
  await page.goto(env.GEAR_URL);
  const gearUp = await page.waitForFunction(() => window.App && App.app === 'gear' && App.active === 'deck', null, { timeout: 10000 }).then(() => true, () => false);
  await page.waitForTimeout(250);
  const gtour = gearUp ? await page.evaluate(async (ids) => {
    const seen = [];
    for (const id of ids) { App.switchTo(id); await __wait(250); seen.push({ id, active: App.active, shown: __shown(), seen: __seen(id) }); }
    App.switchTo('deck'); await __wait(150);
    return seen;
  }, GEAR_PAGES) : [];
  const glost = gtour.filter(x => x.active !== x.id || x.shown !== x.id || !x.seen);
  ok(gearUp && gtour.length === GEAR_PAGES.length && glost.length === 0, 'soundLAB Gear boots on this profile and each of its ' + GEAR_PAGES.length + ' pages opens with its own panel visible' +
    (glost.length ? '\n    not shown: ' + J(glost) : ''));
  if (gearUp) {
    const gdata = await dataOf();
    untouched(gdata, 'Deck, Live sets, the Hub and Helix were opened in soundLAB Gear');
    ok(gdata.tabs.length === 0, 'and Gear never writes soundLAB\u2019s last page (app.tab): ' + gdata.tabs.length + ' writes');
  }
  ok(errs.length === 0 && logs.length === 0, 'no page or console error on a 1.x profile in soundLAB Gear' + lines(errs.concat(logs)));
  await ctx.close();

  console.log('# A1 a stored last page that is no longer a page');
  ({ ctx, page, errs, logs } = await newPage(browser, {}, { 'app.tab': 'arrange' }));
  const stale = await page.evaluate(() => {
    let stored; try { stored = JSON.parse(localStorage.getItem('guitarlab.app.tab')); } catch (e) { stored = 'unreadable'; }
    return { active: App.active, shown: __shown(), seen: __seen('quiz'), stored };
  });
  ok(stale.active === 'quiz' && stale.shown === 'quiz' && stale.seen, 'app.tab = arrange boots to Exercises with a visible panel: ' + J([stale.active, stale.shown, stale.seen]));
  ok(stale.stored === 'quiz', 'and the stored last page is a real page again: ' + J(stale.stored));
  ok(errs.length === 0 && logs.length === 0, 'no page or console error (stale last page)' + lines(errs.concat(logs)));
  await ctx.close();

  // ---------------------------------------------------------------- A2
  console.log('# A2 a stored pill that is no longer a page');
  ({ ctx, page, errs, logs } = await newPage(browser, {}, { 'app.gtab.gkeys': 'synth', 'app.gtab.gprac': 'trainer' }));
  const mem = await page.evaluate(async () => {
    const tab = label => Array.from(document.querySelectorAll('#tabbar .tabbar-btn')).find(b => (b.textContent || '').trim() === label);
    const pills = () => Array.from(document.querySelectorAll('#subnav .subtab')).map(b => (b.textContent || '').trim()).join('|');
    const o = { start: App.active, tabs: !!tab('Keys') && !!tab('Train') };
    if (!o.tabs) return o;
    __hideToast();
    tab('Keys').click(); await __wait(150);
    o.keys = { active: App.active, shown: __shown(), seen: __seen('piano'), pills: pills(), stored: App.store.get('app.gtab.gkeys', null) };
    tab('Train').click(); await __wait(150);
    o.train = { active: App.active, shown: __shown(), seen: __seen('shed'), pills: pills(), stored: App.store.get('app.gtab.gprac', null) };
    return o;
  });
  ok(mem.start === 'quiz' && mem.tabs, 'the app starts on Exercises with its Keys and Train tabs');
  if (mem.tabs) {
    ok(mem.keys.active === 'piano' && mem.keys.shown === 'piano' && mem.keys.seen, 'app.gtab.gkeys = synth: the Keys tab opens Piano with a visible panel: ' + J([mem.keys.active, mem.keys.shown, mem.keys.seen]));
    ok(mem.keys.pills === 'Piano|Charts|Pads' && mem.keys.stored === 'piano', 'Keys is Piano | Charts | Pads, and it remembers a real page again: ' + J([mem.keys.pills, mem.keys.stored]));
    ok(mem.train.active === 'shed' && mem.train.shown === 'shed' && mem.train.seen, 'app.gtab.gprac = trainer: the Train tab opens the Woodshed with a visible panel: ' + J([mem.train.active, mem.train.shown, mem.train.seen]));
    ok(mem.train.pills === 'Woodshed|Tuner' && mem.train.stored === 'shed', 'Train is Woodshed | Tuner, and it remembers a real page again: ' + J([mem.train.pills, mem.train.stored]));
  }
  // the same for the last page of a 1.x session: it comes back as the page that took the feature in
  await page.evaluate(() => localStorage.setItem('guitarlab.app.tab', JSON.stringify('lumipractice')));
  await page.reload();
  await page.waitForFunction(() => window.App && App.active);
  await page.waitForTimeout(250);
  const last = await page.evaluate(() => {
    let stored; try { stored = JSON.parse(localStorage.getItem('guitarlab.app.tab')); } catch (e) { stored = 'unreadable'; }
    return { active: App.active, shown: __shown(), seen: __seen('piano'), toast: __toast(), stored };
  });
  ok(last.active === 'piano' && last.shown === 'piano' && last.seen && last.stored === 'piano', 'app.tab = lumipractice starts on the Piano page with a visible panel, stored as a real page: ' + J([last.active, last.shown, last.seen, last.stored]));
  ok(MOVED.lumipractice.say.test(last.toast), 'and the start says where LUMI practice went: "' + last.toast + '"');

  console.log('# A2 ear training left the Trainer cards: the button on the Plan page opens it in Exercises');
  const ear = await page.evaluate(async () => {
    const go = async (instrument) => {
      if (window.SLQuiz && SLQuiz.cur) SLQuiz.stop();
      App.practiceInstrument.set(instrument);
      App.switchTo('practiceplan'); await __wait(200);
      const box = document.getElementById('pp-tools'), btn = document.getElementById('tr-ear-go');
      const o = { box: !!box, btn: !!btn && !!box && box.contains(btn), category: App.practiceInstrument.label() };
      if (!o.btn) return o;
      box.open = true; __hideToast();
      btn.click(); await __wait(250);
      o.active = App.active; o.shown = __shown(); o.toast = __toast();
      o.view = window.SLQuiz ? SLQuiz.view : null;
      o.level = window.SLQuiz && SLQuiz.cur && SLQuiz.cur.lvl ? SLQuiz.cur.lvl.id : null;
      o.credit = window.SLQuiz && SLQuiz.cur ? SLQuiz.cur.instrument : null;
      return o;
    };
    const piano = await go('piano'), drums = await go('drums');
    if (window.SLQuiz && SLQuiz.cur) SLQuiz.stop();
    App.practiceInstrument.set('piano'); App.switchTo('quiz'); await __wait(150);
    return { piano, drums };
  });
  ok(ear.piano.box && ear.piano.btn && ear.drums.btn, 'the Plan page’s Free practice section has the ear-training button (#tr-ear-go)');
  if (ear.piano.btn) {
    ok(ear.piano.active === 'quiz' && ear.piano.shown === 'quiz' && ear.piano.view === 'run' && ear.piano.level === 'intervals/iall/ear/1' && ear.piano.credit === 'piano',
      'Piano: the button starts Exercises › Intervals › All intervals › Ear, level 1: ' + J([ear.piano.active, ear.piano.view, ear.piano.level, ear.piano.credit]));
    ok(!ear.piano.toast, 'Piano: nothing to explain, no notice: "' + ear.piano.toast + '"');
  }
  if (ear.drums.btn) {
    ok(ear.drums.active === 'practiceplan' && ear.drums.shown === 'practiceplan' && ear.drums.view !== 'run' && ear.drums.level === null,
      'Drums (theory only): the button stays on the Plan page and starts no exercise: ' + J([ear.drums.active, ear.drums.view, ear.drums.level]));
    ok(ear.drums.category === 'Drums' && /Ear training is not part of the Drums category\./.test(ear.drums.toast) && /Learn bar/.test(ear.drums.toast),
      'Drums: the notice names the category and where to change it: "' + ear.drums.toast + '"');
  }
  ok(errs.length === 0 && logs.length === 0, 'no page or console error (stored pills, stored last page, ear-training button)' + lines(errs.concat(logs)));
  await ctx.close();

  console.log('# A1 Backup import skips removed features');
  ({ ctx, page, errs, logs } = await newPage(browser));
  const file = J({ app: 'soundLAB', keys: {
    'guitarlab.fb.root': '7',
    'guitarlab.plugins.list': J([{ id: 'pnew', name: 'from-a-backup', code: PLUGIN_CODE, on: true, error: '' }])
  } });
  await page.evaluate(async () => { App.switchTo('settings'); await __wait(200); });
  const hasInput = await page.evaluate(() => !!document.getElementById('set-backup-in') && !!document.getElementById('set-backup-msg'));
  ok(hasInput, 'Settings › Backup has its Import control');
  if (hasInput) {
    const before = await page.evaluate(() => ({ root: localStorage.getItem('guitarlab.fb.root'), plugins: localStorage.getItem('guitarlab.plugins.list') }));
    const reloaded = page.waitForEvent('load', { timeout: 8000 }).then(() => true, () => false);
    await page.setInputFiles('#set-backup-in', { name: 'soundlab-settings.json', mimeType: 'application/json', buffer: Buffer.from(file) });
    // read at once: the page reloads about a second after it reports
    const imp = await page.evaluate(async () => {
      const msg = document.getElementById('set-backup-msg'), t0 = Date.now();
      while (!msg.textContent && Date.now() - t0 < 5000) await __wait(20);
      return { msg: msg.textContent, root: localStorage.getItem('guitarlab.fb.root'), plugins: localStorage.getItem('guitarlab.plugins.list'),
        wrote: __writes.filter(w => /^guitarlab\.plugins\./.test(w[1])).length };
    });
    ok(before.root !== '7' && imp.root === '7', 'Backup import: guitarlab.fb.root is restored (' + J(before.root) + ' -> ' + J(imp.root) + ')');
    ok(before.plugins === null && imp.plugins === null && imp.wrote === 0, 'Backup import: guitarlab.plugins.list is not written: ' + J([imp.plugins, imp.wrote]));
    ok(/\b1 settings? restored\b/.test(imp.msg) && /\b1 from removed features skipped\b/.test(imp.msg), 'Backup import: the message names one restored and one skipped item: "' + imp.msg + '"');
    ok(await reloaded, 'Backup import: the page reloads with the restored settings');
    await page.waitForFunction(() => window.App && App.active);
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => ({ root: App.store.get('fb.root', null), plugins: localStorage.getItem('guitarlab.plugins.list'), ran: window.__pluginRan }));
    ok(after.root === 7 && after.plugins === null && after.ran === undefined, 'after the reload: the key is G, no plug-in list, no plug-in code ran: ' + J(after));
  }
  ok(errs.length === 0 && logs.length === 0, 'no page or console error (Backup import)' + lines(errs.concat(logs)));
  await ctx.close();

  // ---------------------------------------------------------------- A3b
  console.log('# A3b stored MIDI Hub rules still shape what soundLAB hears');
  // what the Hub stores (js/midihub.js newRule): notes +12 and aftertouch blocked are on, a CC remap is off
  const rule = (name, on, m, a) => ({ id: 'r-' + name, on, name, m: Object.assign({ type: 'cc', ch: 0, lo: 0, hi: 127 }, m), a: Object.assign({ block: false, ch: 0, num: '', add: 0, scale: 100, to: 'same' }, a) });
  const RULES = [rule('up', true, { type: 'note' }, { add: 12 }), rule('at', true, { type: 'at' }, { block: true }), rule('cc', false, { lo: 74, hi: 74 }, { num: 1 })];
  // a key split made while a LUMI is listed (js/midihub.js): for that one keyboard, so only Thru can use it
  const PORT_RULE = rule('split', true, { type: 'note', lo: 0, hi: 127, port: 'LUMI' }, { ch: 2, add: 12 });
  // one keyboard on a fake Web MIDI port; midi.wanted connects it at the start, as for a returning user
  const keyboard = c => c.addInitScript(() => {
    const inp = { id: 'kb-in', name: 'Test keyboard', state: 'connected', type: 'input', onmidimessage: null };
    const out = { id: 'kb-out', name: 'Test keyboard', state: 'connected', type: 'output', send() {} };
    navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map([[inp.id, inp]]), outputs: new Map([[out.id, out]]), sysexEnabled: true, onstatechange: null });
    window.__recv = bytes => { if (inp.onmidimessage) inp.onmidimessage({ data: new Uint8Array(bytes) }); };
    // what the app heard since the last call, and the Piano keys that are down
    window.__heard = []; window.__listen = () => { App.on('midi:note', d => window.__heard.push(d.midi + ':' + (d.on ? 1 : 0))); App.on('midi:pressure', () => window.__heard.push('pressure')); };
    window.__down = () => Array.from(document.querySelectorAll('#pn-svg .pn-key.pn-down')).map(k => k.getAttribute('data-midi')).join();
    // press and release one key (and lean on it: channel aftertouch)
    window.__playKey = async n => { const o = {}; window.__heard.length = 0; window.__recv([0x90, n, 100]); window.__recv([0xD0, 70]); await window.__wait(60); o.down = window.__down();
      window.__recv([0x80, n, 0]); await window.__wait(60); o.up = window.__down(); o.heard = window.__heard.splice(0).join(); return o; };
    // Settings › MIDI keyboard: the line about MIDI Hub rules
    window.__rulesLine = () => { const el = document.getElementById('set-midi-rules'), btn = el && el.querySelector('button');
      return { there: !!el, card: !!el && !!el.closest('#set-midi-card'), seen: !!el && !el.hidden && el.getClientRects().length > 0, text: el ? el.textContent.replace(/\s+/g, ' ').trim() : '', btn: btn ? btn.textContent.trim() : '' }; };
    // what a soundLAB Gear window does when the Hub's box or rules change: it writes the store, this window gets the event
    window.__fromGear = (key, value) => { localStorage.setItem('guitarlab.' + key, JSON.stringify(value));
      window.dispatchEvent(new StorageEvent('storage', { key: 'guitarlab.' + key, url: location.href, storageArea: localStorage })); };
  });
  ({ ctx, page, errs, logs } = await newPage(browser, {}, { 'midi.wanted': true, 'lights.on': false, 'midihub.rulesIn': true, 'midihub.rules': RULES }, keyboard));
  await page.waitForFunction(() => App.midi && App.midi.ready);
  const shaped = await page.evaluate(async ([portRule, atRule]) => {
    const o = { hub: typeof window.SLMidiHub, filter: !!App.midi.inputFilter, active: App.midiRules.active() };
    __listen();
    App.switchTo('piano'); await __wait(250);
    const has = n => !!document.querySelector('#pn-svg .pn-key[data-midi="' + n + '"]');
    o.note = [60, 48, 55, 64, 52].find(n => has(n) && has(n + 12)) || 0;
    o.on = await __playKey(o.note);
    App.switchTo('settings'); await __wait(200);
    o.line = __rulesLine();
    // the box is cleared in Gear: the filter goes, the line goes (Settings is open: it repaints on midirules:state)
    __fromGear('midihub.rulesIn', false); await __wait(60);
    o.offFilter = !!App.midi.inputFilter; o.offLine = __rulesLine();
    App.switchTo('piano'); await __wait(200);
    o.off = await __playKey(o.note);
    // ticked again, but every rule is switched off: the filter is in, nothing changes, no line
    App.switchTo('settings'); await __wait(200);
    App.store.set('midihub.rules', App.store.get('midihub.rules', []).map(r => Object.assign({}, r, { on: false })));
    __fromGear('midihub.rulesIn', true); await __wait(60);
    o.noneFilter = !!App.midi.inputFilter; o.noneActive = App.midiRules.active(); o.noneLine = __rulesLine();
    App.switchTo('piano'); await __wait(200);
    o.none = await __playKey(o.note);
    // the box on and ONE enabled rule, but for one keyboard only (m.port): the filter gets no port name, so
    // it cannot touch what soundLAB hears, and the line must not say it does
    App.store.set('midihub.rules', [portRule]);
    App.switchTo('settings'); await __wait(200);
    o.portActive = App.midiRules.active(); o.portLine = __rulesLine();
    o.portThru = App.midiRules.apply([0x90, o.note, 100], 'LUMI Keys BLOCK').map(b => b.join(' ')).join('|'); // the rule itself works, where a port name comes with the message
    App.switchTo('piano'); await __wait(200);
    o.port = await __playKey(o.note);
    // a second enabled rule without a port: that one is counted
    App.store.set('midihub.rules', [portRule, atRule]);
    App.switchTo('settings'); await __wait(200);
    o.mixActive = App.midiRules.active(); o.mixLine = __rulesLine();
    App.switchTo('piano'); await __wait(150); // Settings paints the line when it opens: the next check opens it again
    return o;
  }, [PORT_RULE, RULES[1]]);
  ok(shaped.hub === 'undefined' && shaped.filter && shaped.active.on === true && shaped.active.rules === 2,
    'with no Hub in soundLAB, the stored box (midihub.rulesIn) installs the input filter at the start: 2 of 3 rules are enabled: ' + J([shaped.hub, shaped.filter, shaped.active]));
  ok(shaped.note > 0 && shaped.on.heard === (shaped.note + 12) + ':1,' + (shaped.note + 12) + ':0', 'a key played into the Piano page arrives an octave up and its aftertouch is dropped (key ' + shaped.note + '): ' + shaped.on.heard);
  ok(shaped.on.down === String(shaped.note + 12) && shaped.on.up === '', 'the Piano page shows the changed key going down and up: down ' + J(shaped.on.down) + ', then ' + J(shaped.on.up));
  ok(shaped.line.there && shaped.line.card && shaped.line.seen, 'Settings › MIDI keyboard shows the line #set-midi-rules: ' + J([shaped.line.there, shaped.line.card, shaped.line.seen]));
  ok(/^MIDI Hub rules are changing what soundLAB hears \(2 rules\)\. Edit them in soundLAB Gear\./.test(shaped.line.text) && shaped.line.btn === 'Open the Hub',
    'it gives the rule count, says where to edit them and has a button for it: "' + shaped.line.text + '"');
  ok(!shaped.offFilter && !shaped.offLine.seen && shaped.off.heard === shaped.note + ':1,pressure,' + shaped.note + ':0' && shaped.off.down === String(shaped.note),
    'the box cleared in a Gear window: the line is hidden at once and the key arrives as played: ' + J([shaped.offFilter, shaped.offLine.seen, shaped.off.heard]));
  ok(shaped.noneFilter && shaped.noneActive.rules === 0 && !shaped.noneLine.seen && shaped.none.heard === shaped.note + ':1,pressure,' + shaped.note + ':0',
    'the box on with no rule enabled: nothing is changed and the line stays hidden: ' + J([shaped.noneActive, shaped.noneLine.seen, shaped.none.heard]));
  ok(shaped.portActive.on === true && shaped.portActive.rules === 0 && !shaped.portLine.seen && shaped.port.heard === shaped.note + ':1,pressure,' + shaped.note + ':0',
    'the box on with one enabled rule for one keyboard only (m.port): the key arrives as played, so no rule is counted and the line stays hidden: ' + J([shaped.portActive, shaped.portLine.seen, shaped.port.heard]));
  ok(shaped.portThru === (0x91) + ' ' + (shaped.note + 12) + ' 100', 'that rule still works where the message comes with its port name (Thru in Gear): ' + shaped.portThru);
  ok(shaped.mixActive.rules === 1 && shaped.mixLine.seen && /\(1 rule\)\. Edit them in soundLAB Gear\./.test(shaped.mixLine.text),
    'with a second enabled rule that has no port, the line counts that one: "' + shaped.mixLine.text + '"');
  // the rules come back on in Gear; Settings counts them again when it is opened, and its button goes to the Hub
  let urls = [];
  page.on('framenavigated', f => { if (f === page.mainFrame()) urls.push(f.url()); });
  const again = await page.evaluate(async (rules) => { App.store.set('midihub.rules', rules); App.switchTo('settings'); await __wait(200); return __rulesLine(); }, RULES);
  ok(again.seen && /\(2 rules\)/.test(again.text), 'rules enabled again: the line is back the next time Settings opens: "' + again.text + '"');
  await page.locator('#set-midi-rules button').click();
  let there = await page.waitForFunction(() => window.App && App.app === 'gear' && App.active === 'midihub', null, { timeout: 10000 }).then(() => true, () => false);
  let hub = there ? await page.evaluate(() => ({ file: location.pathname.split('/').pop(), hash: location.hash, shown: __shown(), box: !!(document.getElementById('mh-rulesin') || {}).checked,
    rules: App.midiRules.active().rules })) : null;
  ok(there && hub.file === 'gear.html' && hub.shown === 'midihub' && urls.some(u => /\/gear\.html#midihub$/.test(u)),
    '"Open the Hub" leaves for gear.html#midihub and the Hub page is showing there: ' + J([hub && hub.file, hub && hub.shown]) + (there ? '' : '\n    went to: ' + J(urls)));
  if (there) ok(hub.box && hub.rules === 2 && hub.hash === '', 'the Hub there has its "Apply rules to what soundLAB hears" box ticked and the same 2 rules enabled; the #midihub is used up: ' + J(hub));
  ok(errs.length === 0 && logs.length === 0, 'no page or console error (Hub rules in soundLAB, the way to the Hub)' + lines(errs.concat(logs)));
  await ctx.close();

  console.log('# A3b a stored last page that is a soundLAB Gear page');
  ({ ctx, page, errs, logs } = await newPage(browser, {}, { 'app.tab': 'deck' }));
  urls = [];
  page.on('framenavigated', f => { if (f === page.mainFrame()) urls.push(f.url()); });
  // how this start went: where it is, what it said, what it stored
  const startOf = () => page.evaluate(() => {
    const stored = k => { try { return JSON.parse(localStorage.getItem('guitarlab.' + k)); } catch (e) { return 'unreadable'; } };
    const a = document.getElementById('app-switch');
    return { app: App.app, file: location.pathname.split('/').pop(), active: App.active, shown: __shown(), seen: __seen('quiz'), toast: __toast(),
      tab: stored('app.tab'), told: stored('gear.told'), thruTold: stored('gear.thruTold'), thru: localStorage.getItem('guitarlab.midihub.thru'),
      link: !!a && a.getClientRects().length > 0 ? a.textContent.trim() + ' -> ' + a.getAttribute('href') : '' };
  });
  // the next start, with these keys stored first (null = removed)
  const restart = async (keys) => {
    await page.evaluate(keys => { for (const k in keys) { if (keys[k] === null) localStorage.removeItem('guitarlab.' + k); else localStorage.setItem('guitarlab.' + k, JSON.stringify(keys[k])); } }, keys || {});
    await page.reload();
    await page.waitForFunction(() => window.App && App.active);
    await page.waitForTimeout(250);
    return startOf();
  };
  const home = s => s.app === 'main' && s.file === 'index.html' && s.active === 'quiz' && s.shown === 'quiz' && s.seen;
  let st = await startOf();
  ok(home(st), 'app.tab = deck: soundLAB starts on Exercises with a visible panel and does not leave for Gear: ' + J([st.file, st.active, st.shown, st.seen]));
  ok(st.toast === TOLD_GEAR, 'and says where those pages are now: "' + st.toast + '"');
  ok(st.link === 'Gear -> gear.html', 'the Gear button the sentence names is at the top: ' + J(st.link));
  ok(st.tab === 'quiz' && st.told === true, 'the stored last page is a soundLAB page again and the notice is marked as said (gear.told): ' + J([st.tab, st.told]));
  st = await restart();
  ok(home(st) && st.toast === '', 'the next start says nothing: the notice is shown once: ' + J(st.toast));
  for (const id of GEAR_PAGES.slice(1)) {
    st = await restart({ 'app.tab': id });
    ok(home(st) && st.toast === '' && st.tab === 'quiz', 'app.tab = ' + id + ' (already told): Exercises, no notice, no way out of soundLAB: ' + J([st.file, st.active, st.toast]));
  }
  st = await restart({ 'app.tab': 'helix', 'gear.told': null });
  ok(home(st) && st.toast === TOLD_GEAR, 'app.tab = helix in a profile that was not told yet: Exercises and the notice: "' + st.toast + '"');
  // MIDI Hub Thru left on before Phase A (1.x, the live 2.0.0): it only runs while Gear is open now, said once; the setting itself is Gear's
  st = await restart({ 'midihub.thru': true });
  ok(home(st) && st.toast === TOLD_THRU && st.thruTold === true, 'midihub.thru stored on: soundLAB says once that Thru runs in Gear: "' + st.toast + '"');
  ok(st.thru === 'true', 'and leaves the setting as it is (Gear reads it): midihub.thru = ' + st.thru);
  st = await restart();
  ok(home(st) && st.toast === '', 'the next start says nothing about Thru either: ' + J(st.toast));
  // what a Hub user of the old app most likely brings: the last page was a Gear page AND Thru was left on
  st = await restart({ 'app.tab': 'midihub', 'midihub.thru': true, 'gear.told': null, 'gear.thruTold': null });
  ok(home(st) && st.toast === TOLD_GEAR + ' ' + TOLD_THRU, 'a Gear page stored AND Thru left on: ONE notice carries both sentences (the second does not replace the first): "' + st.toast + '"');
  ok(st.told === true && st.thruTold === true && st.tab === 'quiz', 'and both are marked as said: ' + J([st.told, st.thruTold, st.tab]));
  st = await restart();
  ok(home(st) && st.toast === '', 'the start after that says nothing: ' + J(st.toast));
  ok(urls.every(u => /\/index\.html$/.test(u)), 'none of these starts left index.html (' + urls.length + ' navigations seen)' + lines(urls.filter(u => !/\/index\.html$/.test(u))));
  // an old page id in the address at such a start: the sentence about where it went comes first and is kept
  await page.evaluate(() => { localStorage.removeItem('guitarlab.gear.thruTold'); history.replaceState(null, '', '#trainer'); });
  await page.reload(); // a start on index.html#trainer (the hash alone would not load the document again)
  await page.waitForFunction(() => window.App && App.active);
  await page.waitForTimeout(250);
  st = await startOf();
  ok(st.active === 'practiceplan' && st.toast === 'The Trainer cards are on the Plan page now, under Free practice. ' + TOLD_THRU && st.thruTold === true,
    'index.html#trainer with Thru left on: the sentence about the Trainer stays, in front of the Thru notice: "' + st.toast + '"');

  console.log('# A3b a Gear page asked for inside soundLAB opens in Gear');
  await page.evaluate(async () => { App.switchTo('songs'); await __wait(150); __hideToast(); });
  urls = [];
  // App.switchTo('midihub') is a plain navigation: asked for from a timer, so this call returns before the page goes
  await page.evaluate(() => { setTimeout(() => App.switchTo('midihub'), 0); });
  there = await page.waitForFunction(() => window.App && App.app === 'gear' && App.active === 'midihub', null, { timeout: 10000 }).then(() => true, () => false);
  ok(there && urls.some(u => /\/gear\.html#midihub$/.test(u)), 'App.switchTo("midihub") leaves for gear.html#midihub' + (there ? '' : '\n    went to: ' + J(urls)));
  if (there) {
    hub = await page.evaluate(() => ({ file: location.pathname.split('/').pop(), hash: location.hash, shown: __shown(), seen: __seen('midihub'), appTab: App.store.get('app.tab', null), gearTab: App.store.get('gear.tab', null) }));
    ok(hub.file === 'gear.html' && hub.shown === 'midihub' && hub.seen && hub.hash === '', 'soundLAB Gear shows the Hub with a visible panel, the #midihub used up: ' + J([hub.file, hub.shown, hub.seen, hub.hash]));
    ok(hub.appTab === 'songs' && hub.gearTab === 'midihub', 'soundLAB\u2019s last page is still Songs (a Gear page is never stored as app.tab); Gear keeps its own: ' + J([hub.appTab, hub.gearTab]));
  }
  ok(errs.length === 0 && logs.length === 0, 'no page or console error (stored Gear pages, the notices, the way across)' + lines(errs.concat(logs)));
  await ctx.close();

  await browser.close();
  console.log(fails ? '\nFAILED: ' + fails : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
