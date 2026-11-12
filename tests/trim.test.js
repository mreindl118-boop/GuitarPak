// soundLAB 2.0, Phase A ("Trim"): what left the app is gone, what stays still
// works, and the 1.x data on the same origin is never touched.
// Plan: docs/plans/phase-a/PLAN.md (sections 4.5 and 5.7; A3b adds to this file).
//
// A1 = the Studio space, the loop/song sequencer, the sampler and its
// database, and the plug-in API are out:
//   - the panels are exactly the page list plus Settings; no Studio tab or pill
//   - the removed controls and globals are gone, the sound library is kept
//   - a stored 1.x plug-in is never run; the sampler database is never opened
//   - stored Studio / plug-in / workspace keys are byte-identical after every
//     page was visited and the kept sounds were played (the live 1.x app on
//     this origin still owns them)
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
// No hardware: no MIDI device, no microphone. Sound runs into a muted context.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const J = JSON.stringify;

// ---- what this app is (A2 edited these lists; A3b edits them again) ----
// the page list of js/app.js (PAGES), in its order; Settings is an overlay page
const PAGES = ['quiz', 'practiceplan', 'fretboard', 'tab', 'notation', 'helix', 'chords', 'piano', 'chart', 'pads',
  'deck', 'liveset', 'midihub', 'songs', 'jam', 'shed', 'tuner', 'theory'];
// pages that left the app (MOVED in js/app.js): App.switchTo(id) goes to the page that took the feature in,
// or home, and says why. there = what the sentence names, on the page it lands on.
const STUDIO = /Studio is not part of soundLAB 2\.0/;
const MOVED = {
  arrange: { to: 'quiz', say: STUDIO }, tracks: { to: 'quiz', say: STUDIO }, song: { to: 'quiz', say: STUDIO }, ideas: { to: 'quiz', say: STUDIO },
  trainer: { to: 'practiceplan', say: /^The Trainer cards are on the Plan page now, under Free practice\.$/, there: '#panel-practiceplan #pp-tools #tr-cc-start' },
  synth: { to: 'piano', say: /^Synth sounds are in the Sound picker on the Piano page\.$/, there: '#panel-piano #pn-voice option:nth-of-type(2)' },
  lumipractice: { to: 'piano', say: /^LUMI practice is on the Piano page now, under the lessons\.$/, there: '#panel-piano #pn-lumi #pn-lumi-body #lp-mode' }
};
const NAMES = { quiz: 'Exercises', practiceplan: 'the Plan page', piano: 'the Piano page' };
// a tab or pill with one of these names would be a way into a removed page ("Songs" is not "Song")
const GONE_LABELS = /^(studio|sketch|timeline|editor|song|ideas)$/i;
// A2: pills only. "Synth" is still a tab (Deck, Live, Hub) until A3b.
const GONE_PILLS = /^(trainer|synth|lumi)$/i;
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

// raw = { key: exact stored string }; json = { key: value } (stored as JSON, like App.store)
async function newPage(browser, raw, json) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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
    return { seen, labels: Object.keys(labels), pills: Object.keys(pills) };
  }, PAGES.concat('settings'));
  const lost = tour.seen.filter(x => x.active !== x.id || x.shown !== x.id || !x.seen);
  ok(lost.length === 0, 'visited ' + tour.seen.length + ' pages, each one the active page with its own panel visible' + (lost.length ? '\n    not shown: ' + J(lost) : ''));
  const badLabels = tour.labels.filter(t => GONE_LABELS.test(t));
  ok(tour.labels.includes('Learn') && badLabels.length === 0, 'no tab or pill reads Studio, Sketch, Timeline, Editor, Song or Ideas (' + tour.labels.length + ' labels seen)' +
    (badLabels.length ? '\n    found: ' + badLabels.join(', ') : ''));
  const badPills = tour.pills.filter(t => GONE_PILLS.test(t));
  ok(tour.pills.includes('Piano') && tour.pills.includes('Woodshed') && tour.pills.includes('Plan') && badPills.length === 0,
    'A2: no pill reads Trainer, Synth or LUMI (' + tour.pills.length + ' pills seen: ' + tour.pills.join(', ') + ')' + (badPills.length ? '\n    found: ' + badPills.join(', ') : ''));
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

  console.log('# A1 the 1.x data on this origin is untouched');
  const data = await page.evaluate(([keys, dead]) => {
    const re = new RegExp(dead), now = {};
    keys.forEach(k => { now[k] = localStorage.getItem('guitarlab.' + k); });
    return { now, ran: window.__pluginRan,
      writes: __writes.filter(w => w[0] === 'clear' || re.test(w[1])).map(w => w[0] + ' ' + w[1]),
      tabs: __writes.filter(w => w[1] === 'guitarlab.app.tab').map(w => w[2]),
      all: __writes.length, idb: __idb.slice() };
  }, [Object.keys(OLD), DEAD]);
  ok(data.ran === undefined, 'a stored 1.x plug-in is never run (its code would set a global): ' + J(data.ran));
  const daw = data.idb.filter(x => /guitarlab-daw/.test(x));
  ok(daw.length === 0, 'the sampler database guitarlab-daw is never opened or deleted (databases touched: ' + (data.idb.join(', ') || 'none') + ')');
  const changed = Object.keys(OLD).filter(k => data.now[k] !== OLD[k]);
  ok(changed.length === 0, 'stored ' + Object.keys(OLD).join(', ') + ' are byte-identical after every page, the sounds and a pad hit' +
    (changed.length ? '\n    changed: ' + J(changed.map(k => k + ' = ' + data.now[k])) : ''));
  ok(data.all > 0 && data.writes.length === 0, 'no write, removal or clear of a removed-feature key (' + data.all + ' other writes seen)' + lines(data.writes));
  const pageOf = v => { try { return JSON.parse(v); } catch (e) { return v; } };
  const badTabs = data.tabs.filter(v => !PAGES.includes(pageOf(v)));
  ok(data.tabs.length > 0 && badTabs.length === 0, 'app.tab only ever held a page of this app (' + data.tabs.length + ' writes)' + lines(badTabs));
  ok(errs.length === 0, 'no uncaught page error on a 1.x profile' + lines(errs));
  ok(logs.length === 0, 'no console error on a 1.x profile (a module that fails in init / onShow prints here)' + lines(logs));
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

  await browser.close();
  console.log(fails ? '\nFAILED: ' + fails : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
