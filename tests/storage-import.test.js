// soundLAB 2.0, Phase A4: the 2.0 store and the one-time copy of the 1.x data.
// Plan: docs/plans/phase-a/PLAN.md, section 8 (8.5 lists these ten cases), decisions D32-D37 and D46.
//
// 2.0 keeps its data under its own prefix: 'soundlab2.' at the live address and everywhere else (the test
// server included), 'soundlab2-next.' on the beta under /next/. The first start copies the earlier data
// ('guitarlab.*') across once. From then on 2.0 never writes, removes or changes a 'guitarlab.*' key: the
// live app on the same origin (2.0.0, the code before Phase A) still uses them.
// WORDS: this suite calls 'guitarlab.*' "the 1.x store" and its content "1.x data" or "a 1.x profile", after
// the app that first wrote it. The live 2.0.0 writes there too, which is why no text ON SCREEN says "1.x".
//
// The ten cases, each in a fresh browser context (= a fresh browser profile; a case with several parts
// uses one per part):
//   1  an empty browser: the app starts, the marker says nothing was copied
//   2  a 1.x profile: what 2.0 keeps comes across byte for byte, what left the app stays behind
//   3  the one-time migration markers travel with the settings they guard
//   4  the 1.x store is untouched and no database is opened, in soundLAB and in soundLAB Gear
//   5  the copy runs once
//   6  the copy never overwrites
//   7  the beta under /next/ has its own scope (the app is served there by a route), its own words for the
//      copy and its own Web Locks
//   8  refused writes and a full store: copy order, headroom, retry, the start notice, a page's default
//      under a key that still waits, a look in soundLAB Gear or a change in Jam under such a key, blocked storage
//   9  Settings › Backup: export, an old 1.x file, a beta file, Copy again (two taps, not a double-click)
//   10 soundLAB Gear opened first
//
// How a case sets its scene: the init script below runs in the page before any script of the app. It seeds
// the stores once per profile, records every later localStorage write, and can refuse writes, cap the store
// or block storage altogether. What the app does is read back through the real storage calls, so reading
// never shows up in the record.
//
// This suite and trim.test.js are the only two that name the 1.x prefix (tests/assets.test.js holds that list).
// No hardware. Service workers are blocked: one variable less, and the /next/ route sees every request.
const { chromium } = require('playwright');
const fs = require('fs');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const J = JSON.stringify;
const lines = a => a.length ? '\n    ' + a.join('\n    ') : '';
const short = (s, n) => typeof s !== 'string' ? String(s) : s.length > (n || 70) ? s.slice(0, n || 70) + '… (' + s.length + ' characters)' : s;
const num = n => Number(n).toLocaleString('en-US');

// ---- addresses ----
// the folder the app is served from (index.html and gear.html sit in it), and the beta's folder inside it.
// The test server has no /next/: a route hands requests for it the same files (case 7)
const BASE = env.URL.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
const ORIGIN = env.URL.replace(/^([a-z]+:\/\/[^/]+).*$/i, '$1');
const NEXT = BASE + 'next/';

// ---- the three stores of this origin ----
const OLD = 'guitarlab.';        // 1.x (App.store.legacy): read once by the copy, never written
const LIVE = 'soundlab2.';       // 2.0 at the live address, and on the test server
const BETA = 'soundlab2-next.';  // 2.0 on the beta, under /next/
const MARK = 'store.imported';   // the copy's marker, one per scope: { v, from, at, copied, skipped, failed, kept }

// the copy order and the room it keeps free (plan 8.2, D46)
const SMALL = 4096;     // a value of at most this many characters goes first
const ROOM = 200000;    // characters that must still fit when the copy is done
// a recorded write keeps its value up to this length (everything except the headroom test)
const KEEP = 190000;

// the notice at each start while something did not fit (js/app.js boot); (1) = the number of items
const NOTICE = /Some of your earlier soundLAB data did not fit in this browser's storage \((\d+) items?\)\. soundLAB tries again each time it starts\. Details: soundLAB › Settings › Backup\./;
// Settings › Backup, the status block #set-backup-info (js/settings.js)
const INFO_COPIED = /^Copied your earlier soundLAB data on .+?: (\d+) items?\./;
const INFO_FAILED = /\b(\d+) items? did not fit in this browser's storage and (?:is|are) tried again at each start: (.+?)\. Your earlier data is untouched\./;
const INFO_KEPT = /\b(\d+) items? (?:was|were) not copied because this version already has its own data there: (.+?)\. Copy again would replace it\./;
// a browser that had nothing to copy (no "0 items")
const INFO_NONE = /^Looked for earlier soundLAB data in this browser on .+?: there was nothing to copy\.$/;
const AGAIN = 'Copy my earlier data again', AGAIN_BETA = 'Copy from the live app again', AGAIN_SURE = 'Tap again: this overwrites the settings here';
// the same on the beta: there every source is the live app's data ('guitarlab.*' today, the live 2.0 scope after the next release)
const NOTICE_BETA = /Some of your data from the live app did not fit in this browser's storage \((\d+) items?\)\. soundLAB tries again each time it starts\. Details: soundLAB › Settings › Backup\./;
const INFO_COPIED_BETA = /^Copied your data from the live app on .+?: (\d+) items?\./;
const INFO_FAILED_BETA = /\b(\d+) items? did not fit in this browser's storage and (?:is|are) tried again at each start: (.+?)\. The live app's data is untouched\./;
// Copy again: a second tap sooner than this after the first is a double-click and does not count (js/settings.js AGAIN_MIN)
const AGAIN_MIN = 600;

// ---- what a 1.x profile holds ----
// Raw strings, as the live 1.x app stored them. Some are oddly spaced on purpose: a copy that parsed the
// JSON and wrote it back would change the bytes.
const FLAGS = { 'help.seen': 'true', 'help.done': 'true', 'qz.landed': 'true' }; // the first-run flags
// a valid XP ledger (js/practice-progress.js refuses anything else); the zone and the daily minutes are not the defaults
const LEDGER = { version: 1, settings: { dailyMinutes: 25, xpPerMinute: 2, xpPerCorrectNote: 0, correctNoteXPCap: 100, streakBonusPercent: 5,
  streakBonusCapPercent: 25, graceDays: 3, decayEnabled: true, decayPercent: 2, decayDailyCap: 20, decayFloor: 0, xpPerLevel: 100, vacations: [],
  timezone: 'Pacific/Auckland' }, sessions: [], ledgers: {}, goals: {} };
// MIDI Hub rules as the Hub stores them (js/midihub.js): two are on, one is off
const rule = (name, on, m, a) => ({ id: 'r-' + name, on, name, m: Object.assign({ type: 'cc', ch: 0, lo: 0, hi: 127 }, m), a: Object.assign({ block: false, ch: 0, num: '', add: 0, scale: 100, to: 'same' }, a) });
const RULES = [rule('up', true, { type: 'note' }, { add: 12 }), rule('at', true, { type: 'at' }, { block: true }), rule('cc', false, { lo: 74, hi: 74 }, { num: 1 })];
const card = (id, name, notes) => ({ id, name, hand: 'R', kind: 'chord', text: '', notes });
const chart = i => ({ v: 1, id: 'ch' + i, title: 'Chart ' + i, lo: 48, oct: 2, cards: Array.from({ length: 8 }, (_, c) => card('c' + i + '-' + c, 'C', [{ m: 60, f: 1 }, { m: 64, f: 3 }, { m: 67, f: 5 }])) });

// what 2.0 keeps (plan 8.5 case 2): the key G Dorian at 96 BPM, the last page, lesson and course progress, the XP
// ledger and the 1.x XP total, the libraries, the Trainer cards, the last synth sound, the Gear namespaces, the
// pedal bindings, the first-run flags. Four of them look like a removed key and are not (app.gtab.gkeys, tr.ccA,
// tr.ccB, pads.mode): a deny list that is too wide would drop them.
const KEPT = Object.assign({}, FLAGS, {
  'fb.root': '7', 'fb.scale': '"dorian"', 'met.bpm': '96',
  'app.tab': '"songs"', 'app.gtab.gkeys': '"piano"',
  'kl.prog': '{ "c-r": { "step": 3, "passed": 2, "best": { "0": 92, "1": 88 } } }',
  'qz.instrumentProg': '{ "piano": { "notes/nat/treble/1": { "b": 9, "s": 2 } } }',
  'practice.progress.v1': J(LEDGER),
  'xp.total': '1234',
  'sg.lib': '[ { "name": "Blues in A", "steps": [], "bars": 12, "srcType": "tab" } ]',
  'cc.charts': '[ ' + J(chart(1)) + ' ]',
  'tr.sessions': '[ { "dateISO": "2026-10-01T10:00:00.000Z", "minutes": 25, "label": "Scales" } ]',
  'tr.best.C-G': '41', 'tr.ccA': '"C"', 'tr.ccB': '"G"',
  'pn.synthPreset': '"pad"', 'pads.mode': '"gm"',
  'midihub.rules': '[ ' + RULES.map(J).join(', ') + ' ]',
  'synthtab.live': '{ "sets": [ { "id": "ls1", "name": "Sunday set", "pages": [ [ { "modx": { "lsb": 0, "pc": 3 } } ] ] } ], "active": "ls1", "page": 0, "slot": null }',
  'hx.favs': '[ { "id": "f1", "name": "Verse", "bank": 0, "prog": 12, "snap": 2 } ]',
  'remote.map': '{ "next": { "midi": { "t": "cc", "n": 64, "ch": null, "port": "", "latch": false }, "key": null } }'
});
// what left the app in Phase A (the deny list, D34): never copied. The stored plug-in would set a global if it ran
const PLUGIN_CODE = 'window.__pluginRan = (window.__pluginRan || 0) + 1;';
const REMOVED = {
  'st.tracks': '[ {"id":"t1","name":"Drums","kind":"drums","steps":[[1,0,0,0],[0,0,1,0]]}, {"id":"t2","name":"Vox","kind":"sampler","sample":"s1"} ]',
  'ideas.list': '[ {"id":"i1","name":"Idea 1","key":"A minor","bpm":120,"notes":[{"m":60,"t":0,"d":0.5}]} ]',
  'song.name': '"My song"',
  'sd.retroSecs': '30',
  'app.space': '"studio"', 'app.tabStudio': '"arrange"', 'app.click': 'true',
  'app.gtab.gstudio': '"arrange"', 'app.gtab.gsketch': '"ideas"', 'app.gtab.gpl-myplug': '"myplug"',
  'pads.track': '"t1"',
  'tr.earBest': '17', 'tr.earHarm': 'true',
  'plugins.list': '[ ' + J({ id: 'pold', name: 'old-plugin', code: PLUGIN_CODE, on: true, error: '' }) + ' ]'
};
// three settings and the marker of the one-time 1.x migration that would reset each of them (case 3):
// 22 frets (js/fretboard.js), one chosen keyboard and "soundLAB plays my keys: Never" (js/midi.js)
const GUARDED = { 'fb.frets': '22', 'midi.inputId': '"in-1"', 'midi.appSound': 'false' };
const MIGRATED = { 'fb.migr24': 'true', 'midi.allIn.v1': 'true', 'midi.voiceAuto': 'true' };

// ---- a 1.x profile with large progress and large libraries (case 8) ----
// Listed by the group the copy puts a value of more than 4,096 characters in (D46): progress before libraries
// before anything else, the smallest first inside a group. Every key not listed here is small and goes first.
const LARGE = { progress: ['kl.prog', 'tr.sessions', 'qz.instrumentProg', 'xp.days', 'lesson.observations.v1'], library: ['cc.charts', 'sg.lib', 'ws.lib'], other: ['zz.notes'] };
const LIB = 'ws.lib'; // the largest library: the one that does not fit
const groupOf = (k, raw) => raw.length <= SMALL ? 1 : LARGE.progress.includes(k) ? 2 : LARGE.library.includes(k) ? 3 : 4;
const GROUP_NAMES = ['', 'small', 'progress', 'library', 'other'];
function bigProfile(withOther) {
  const day = i => new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10);
  const days = {}, levels = {};
  for (let i = 0; i < 220; i++) days[day(i)] = { x: 40 + i % 30, s: i % 5, q: 10 + i % 20, k: i % 3, l: 1, u: {} };
  for (let i = 0; i < 260; i++) levels['old/unit' + i + '/treble/1'] = { b: 8 + i % 3, s: i % 4 };
  const score = i => ({ id: 'w' + i, title: 'Long study ' + i, instrument: 'piano', bpm: 90, len: 700, diff: 2, timingOk: true,
    notes: Array.from({ length: 1400 }, (_, n) => ({ t: n * 0.5, d: 0.5, m: 48 + n % 24, v: 96 })) });
  const song = i => ({ name: 'Song ' + i, steps: Array.from({ length: 300 }, (_, n) => ({ t: n, n: [[1 + n % 6, n % 12]] })), bars: 75, srcType: 'tab' });
  const o = Object.assign({}, FLAGS, GUARDED, MIGRATED, {
    'fb.root': '7', 'fb.scale': '"dorian"', 'met.bpm': '96', 'xp.total': '1234', 'tr.best.C-G': '41', 'practice.progress.v1': J(LEDGER),
    'kl.prog': J({ 'c-r': { step: 3, passed: 2, best: { 0: 92 }, runs: Array.from({ length: 120 }, (_, i) => ({ d: day(i), st: i % 10, h: 4, acc: 80 + i % 20, t: 20 + i % 30, sc: 70 + i % 30 })) } }),
    'tr.sessions': J(Array.from({ length: 110 }, (_, i) => ({ dateISO: day(i) + 'T10:00:00.000Z', minutes: 10 + i % 40, label: 'Scales' }))),
    'qz.instrumentProg': J({ piano: levels }),
    'xp.days': J(days),
    // what Exercises has observed per instrument and day (js/xp.js): progress, although its name is none of the old ones
    'lesson.observations.v1': J({ piano: { days, sprints: {}, jump: -1 } }),
    'cc.charts': J(Array.from({ length: 15 }, (_, i) => chart(i))),
    'sg.lib': J([song(1), song(2), song(3), song(4), song(5)]),
    'ws.lib': J([score(1), score(2), score(3)])
  });
  if (withOther) o['zz.notes'] = J({ text: new Array(7001).join('n') }); // a large value the copy has no group for
  // the scene must be what the comments say, or the checks below would test something else
  const wrong = Object.keys(o).filter(k => (o[k].length > SMALL) !== [].concat(LARGE.progress, LARGE.library, LARGE.other).includes(k));
  const libs = LARGE.library.slice().sort((a, b) => o[b].length - o[a].length);
  if (wrong.length || libs[0] !== LIB) throw new Error('test setup: the large profile is not sized as listed (' + wrong.join(', ') + '; largest library ' + libs[0] + ')');
  return o;
}
// the characters a set of entries takes under a prefix (key + value), one key left out
const sizeOf = (pre, o, skip) => Object.keys(o).reduce((n, k) => k === skip ? n : n + (pre + k).length + o[k].length, 0);

// ---- the page side: runs before any script of the app, on every load of every page of a profile ----
// o = { seed: { prefix: { key: raw } }, ctl, blocked, keep, mark }
function INIT(o) {
  if (!/^https?:$/.test(location.protocol)) return; // about:blank
  window.__wait = ms => new Promise(r => setTimeout(r, ms));
  // a panel the user can see: it is the active one, it is laid out and it has content
  window.__seen = id => { const p = document.getElementById('panel-' + id); if (!p) return false; const r = p.getBoundingClientRect();
    return p.classList.contains('active') && getComputedStyle(p).display !== 'none' && r.height > 0 && p.children.length > 0; };
  window.__shown = () => Array.from(document.querySelectorAll('main > .panel.active')).map(p => p.id.slice(6)).join(',');
  window.__pages = () => Array.from(document.querySelectorAll('main > .panel[id^="panel-"]')).map(p => p.id.slice(6));
  window.__broken = () => Array.from(document.querySelectorAll('.panel .error')).map(e => e.textContent).filter(t => /failed to load|crashed during init/.test(t));
  window.__toast = () => { const t = document.getElementById('app-toast'); return t && !t.hidden ? t.textContent : ''; };
  // every database the page opens or deletes
  window.__idb = [];
  if (window.IDBFactory) {
    const open = IDBFactory.prototype.open, del = IDBFactory.prototype.deleteDatabase;
    IDBFactory.prototype.open = function (name) { window.__idb.push('open ' + name); return open.apply(this, arguments); };
    IDBFactory.prototype.deleteDatabase = function (name) { window.__idb.push('delete ' + name); return del.apply(this, arguments); };
  }
  // storage blocked for this site (a browser set to refuse site data): reading the object itself throws
  if (o.blocked) {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Access is denied for this document.', 'SecurityError'); } });
    return;
  }

  const P = Storage.prototype, ls = window.localStorage;
  const real = { set: P.setItem, get: P.getItem, remove: P.removeItem, clear: P.clear, key: P.key };
  // this suite's own keys: outside every store of the app, never counted, never recorded
  const TEST = 'sl-test.';
  if (real.get.call(ls, TEST + 'seeded') === null) { // once per profile: a reload must not put back what changed since
    real.set.call(ls, TEST + 'seeded', '1');
    for (const pre in o.seed) for (const k in o.seed[pre]) real.set.call(ls, pre + k, o.seed[pre][k]);
    real.set.call(ls, TEST + 'ctl', JSON.stringify(o.ctl || {}));
  }
  // what the storage refuses, from this load on and after the next one:
  //   { refuse: [full keys] }  setItem throws for these keys
  //   { drop: [full keys] }    setItem returns for these keys as if all were well, and stores nothing
  //   { refuseAll: true }      every setItem throws (the store is full to the last character)
  //   { cap: n }               the store holds at most n characters, keys and values together
  let ctl = {};
  try { ctl = JSON.parse(real.get.call(ls, TEST + 'ctl')) || {}; } catch (e) { ctl = {}; }
  window.__ctl = next => { ctl = next || {}; real.set.call(ls, TEST + 'ctl', JSON.stringify(ctl)); };
  // the characters stored now, without one key (the one about to be replaced)
  const used = but => { let n = 0; for (let i = 0; i < ls.length; i++) { const k = real.key.call(ls, i); if (k === but || k.indexOf(TEST) === 0) continue; n += k.length + real.get.call(ls, k).length; } return n; };
  const full = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

  // every setItem / removeItem / clear of localStorage after this point, the one-time copy included (it runs
  // while js/app.js loads): { op, key, len, val (null when longer than o.keep), refused }
  window.__writes = [];
  P.setItem = function (k, v) {
    if (this !== ls) return real.set.apply(this, arguments);
    k = String(k); v = String(v);
    const w = { op: 'set', key: k, len: v.length, val: v.length <= o.keep ? v : null, refused: '' };
    window.__writes.push(w);
    if (ctl.refuseAll || (ctl.refuse || []).indexOf(k) !== -1) { w.refused = 'refused'; throw full(); }
    if ((ctl.drop || []).indexOf(k) !== -1) { w.refused = 'dropped'; return; }
    if (ctl.cap && used(k) + k.length + v.length > ctl.cap) { w.refused = 'full'; throw full(); }
    return real.set.call(this, k, v);
  };
  P.removeItem = function (k) { if (this === ls) window.__writes.push({ op: 'remove', key: String(k), len: 0, val: null, refused: '' }); return real.remove.apply(this, arguments); };
  P.clear = function () { if (this === ls) window.__writes.push({ op: 'clear', key: '*', len: 0, val: null, refused: '' }); return real.clear.apply(this, arguments); };

  // the stores as they are, read and changed past the record: what this suite looks at, and what ANOTHER app
  // on this origin does (the live 1.x app, the live 2.0 app next to the beta)
  window.__store = {
    dump: pre => { const out = {}; for (let i = 0; i < ls.length; i++) { const k = real.key.call(ls, i); if (k.indexOf(pre) === 0) out[k.slice(pre.length)] = real.get.call(ls, k); } return out; },
    raw: key => real.get.call(ls, key),
    put: (key, raw) => { real.set.call(ls, key, raw); },
    drop: key => { real.remove.call(ls, key); },
    used: () => used(null),
    // the recorded writes that named a key under a prefix (or cleared everything), from record number `from` on
    touched: (pre, from) => window.__writes.slice(from || 0).filter(w => w.op === 'clear' || w.key.indexOf(pre) === 0).map(w => w.op + ' ' + w.key + (w.refused ? ' (' + w.refused + ')' : ''))
  };
  // the marker of a scope: the stored string and what it says
  window.__mark = pre => { const raw = real.get.call(ls, pre + o.mark); let m = null; try { m = JSON.parse(raw); } catch (e) { m = null; } return { raw, m }; };
  // how each key of a source ({ key: raw }) fared under a prefix in THIS load: the first write of it
  // (same | differs | refused | none), what is stored now (same | differs | missing), how often it was
  // written, whether it was removed again
  window.__copied = (pre, src) => {
    const out = {};
    for (const k in src) {
      const w = window.__writes.filter(x => x.op === 'set' && x.key === pre + k), now = real.get.call(ls, pre + k);
      out[k] = { writes: w.length,
        first: !w.length ? 'none' : w[0].refused ? 'refused' : (w[0].val === null ? w[0].len === src[k].length : w[0].val === src[k]) ? 'same' : 'differs',
        now: now === null ? 'missing' : now === src[k] ? 'same' : 'differs',
        removed: window.__writes.some(x => x.op === 'remove' && x.key === pre + k) };
    }
    return out;
  };
}

// ---- one browser context = one browser profile ----
// o: old / live / beta = { key: raw } seeded under that store's prefix, once; ctl = what the storage refuses
// (see INIT); blocked = no storage at all; next = serve the app under /next/ too
let contexts = [];
async function profile(browser, o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
  contexts.push(ctx);
  // the beta's address: BASE/next/<path> is answered with the test server's BASE/<path>. The page keeps
  // its /next/ address (the request is redirected behind its back), which is what js/app.js looks at
  if (o.next) await ctx.route(u => String(u).indexOf(NEXT) === 0, route => route.continue({ url: BASE + route.request().url().slice(NEXT.length) }));
  const seed = {};
  seed[OLD] = o.old || {}; seed[LIVE] = o.live || {}; seed[BETA] = o.beta || {};
  await ctx.addInitScript(INIT, { seed, ctl: o.ctl || {}, blocked: !!o.blocked, keep: KEEP, mark: MARK });
  return ctx;
}
// the app is up: both apps set App.active when the start page is showing
async function up(page) {
  await page.waitForFunction(() => !!(window.App && App.active), null, { timeout: 15000 });
  await page.waitForTimeout(300);
}
// one page of a profile. Kept across reloads: uncaught errors, console errors (a module that fails in init
// or onShow prints there; a file another host did not send is not ours: the update check asks GitHub) and
// error statuses for this app's own files
async function open(ctx, url) {
  const page = await ctx.newPage(), errs = [], logs = [], bad = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const u = (m.location() && m.location().url) || '';
    if (/Failed to load resource/.test(m.text()) && u.indexOf(ORIGIN) !== 0) return;
    logs.push(m.text() + (u ? ' @' + u : ''));
  });
  page.on('response', r => { if (r.status() >= 400 && r.url().indexOf(ORIGIN) === 0) bad.push(r.status() + ' ' + r.url().slice(ORIGIN.length)); });
  await page.goto(url);
  await up(page);
  return { page, errs, logs, bad };
}
async function reload(page) { await page.reload(); await up(page); }
const quiet = (w, what) => ok(w.errs.length === 0 && w.logs.length === 0 && w.bad.length === 0,
  'no page error, no console error, no missing file (' + what + ')' + lines(w.errs.concat(w.logs, w.bad)));

// the app as the user finds it: which app, which page, is its panel showing, did a module fail
const health = page => page.evaluate(() => ({ app: App.app, active: App.active, shown: __shown(), seen: __seen(App.active), broken: __broken() }));
const healthy = h => !!h && !!h.active && h.shown === h.active && h.seen && h.broken.length === 0;
const said = h => J([h.app, h.active, h.shown, h.seen]) + lines(h.broken);

// a marker as the plan fixes it: { v, from, at, copied, skipped, failed: [keys], kept: [keys] }
const markerOk = m => !!m && m.v === 1 && typeof m.from === 'string' && typeof m.at === 'number' && m.at > 0 &&
  Number.isInteger(m.copied) && m.copied >= 0 && Number.isInteger(m.skipped) && m.skipped >= 0 && Array.isArray(m.failed) && Array.isArray(m.kept);
const sameMark = (a, b) => !!a && !!b && ['v', 'from', 'at', 'copied', 'skipped'].every(k => a[k] === b[k]) && J(a.failed) === J(b.failed) && J(a.kept) === J(b.kept);
const counts = m => m ? J({ from: m.from, copied: m.copied, skipped: m.skipped, failed: m.failed, kept: m.kept }) : 'no marker';

// two snapshots of a store ({ key: raw }): what differs, [] = identical
function diff(a, b) {
  const out = [];
  for (const k in a) { if (!(k in b)) out.push('gone: ' + k); else if (a[k] !== b[k]) out.push('changed: ' + k + ' = ' + short(b[k])); }
  for (const k in b) if (!(k in a)) out.push('new: ' + k + ' = ' + short(b[k]));
  return out;
}
// what __copied saw, for a list of keys: `wrong` = the first write was not the source string (or there was
// none), `missing` = not stored now, `changed` = stored but different although nobody wrote it again,
// `again` = the app itself has written it since (its own business: a page saving its state)
function arrived(rep, keys) {
  const differs = keys.filter(k => rep[k].now === 'differs');
  return {
    wrong: keys.filter(k => rep[k].first !== 'same').map(k => k + ': first write ' + rep[k].first),
    missing: keys.filter(k => rep[k].now === 'missing'),
    changed: differs.filter(k => rep[k].writes < 2 && !rep[k].removed),
    again: differs.filter(k => rep[k].writes > 1 || rep[k].removed)
  };
}
const clean = a => a.wrong.length === 0 && a.missing.length === 0 && a.changed.length === 0;
const told = a => (a.again.length ? ' (written again by the app itself since: ' + a.again.join(', ') + ')' : '') +
  lines(a.wrong.concat(a.missing.map(k => 'missing: ' + k), a.changed.map(k => 'changed: ' + k)));

// Settings › Backup as it shows: the status block, the Copy again button, the message beside the buttons
const backupCard = page => page.evaluate(async () => {
  App.switchTo('settings'); await __wait(250);
  const info = document.getElementById('set-backup-info'), again = document.getElementById('set-copy-again'), msg = document.getElementById('set-backup-msg');
  return { info: !!info, seen: !!info && !info.hidden && info.getClientRects().length > 0, text: info ? info.textContent.replace(/\s+/g, ' ').trim() : '',
    again: again ? again.textContent.replace(/\s+/g, ' ').trim() : null, msg: msg ? msg.textContent : null };
});
// Settings › Backup › Import settings with a file ({ app, keys, ... }). The page reports, then reloads about
// a second later: everything is read at once. -> the message, the three stores as they are then, the keys it
// wrote, every recorded touch outside the 2.0 store of this address, and whether the page reloaded
async function importFile(page, file) {
  await page.evaluate(async () => { App.switchTo('settings'); await __wait(200); });
  const from = await page.evaluate(() => __writes.length);
  const reloaded = page.waitForEvent('load', { timeout: 8000 }).then(() => true, () => false);
  await page.setInputFiles('#set-backup-in', { name: 'soundlab-settings.json', mimeType: 'application/json', buffer: Buffer.from(J(file)) });
  const snap = await page.evaluate(async ([OLD, LIVE, BETA, from]) => {
    const msg = document.getElementById('set-backup-msg'), t0 = Date.now();
    while (!msg.textContent && Date.now() - t0 < 5000) await __wait(20);
    const w = __writes.slice(from);
    return { msg: msg.textContent, live: __store.dump(LIVE), old: __store.dump(OLD), beta: __store.dump(BETA),
      wrote: w.filter(x => x.op === 'set').map(x => x.key),
      elsewhere: w.filter(x => x.op === 'clear' || x.key.indexOf(LIVE) !== 0).map(x => x.op + ' ' + x.key) };
  }, [OLD, LIVE, BETA, from]);
  snap.reloaded = await reloaded;
  if (snap.reloaded) await up(page);
  return snap;
}

// one case: a crash in it fails the suite but does not hide the cases after it; its profiles are closed
async function section(title, fn) {
  console.log('# ' + title);
  try { await fn(); } catch (e) { fails++; console.log('  FAIL (crash) ' + title + ': ' + String(e && e.message || e).split('\n')[0]); }
  for (const c of contexts) await c.close().catch(() => {});
  contexts = [];
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const nKept = Object.keys(KEPT).length, nRemoved = Object.keys(REMOVED).length;

  // ---------------------------------------------------------------- 1
  await section('1 an empty browser', async () => {
    const ctx = await profile(browser);
    const w = await open(ctx, env.URL), page = w.page;
    const h = await health(page);
    ok(h.app === 'main' && h.active === 'quiz' && healthy(h), 'soundLAB starts on Exercises with a visible panel and every module loaded: ' + said(h));
    const s = await page.evaluate(([OLD, LIVE, BETA]) => {
      const st = App.store || {};
      return { prefix: st.prefix, legacy: st.legacy, deny: Object.prototype.toString.call(st.deny),
        lacks: ['get', 'set', 'keys', 'raw', 'setRaw', 'importInfo', 'copyAgain'].filter(n => typeof st[n] !== 'function'),
        mark: __mark(LIVE), info: typeof st.importInfo === 'function' ? st.importInfo() : null, now: Date.now(),
        old: Object.keys(__store.dump(OLD)), beta: Object.keys(__store.dump(BETA)), oldWrites: __store.touched(OLD), writes: __writes.length, idb: __idb.slice() };
    }, [OLD, LIVE, BETA]);
    ok(s.lacks.length === 0 && s.deny === '[object RegExp]', 'App.store has get, set, keys, raw, setRaw, importInfo and copyAgain, and App.store.deny is a regular expression' +
      (s.lacks.length ? '\n    not a function: ' + s.lacks.join(', ') : '') + (s.deny === '[object RegExp]' ? '' : '\n    deny is ' + s.deny));
    ok(s.prefix === LIVE && s.legacy === OLD, 'at this address App.store.prefix is "' + LIVE + '", and App.store.legacy names the 1.x store: ' + J([s.prefix, s.legacy]));
    const m = s.mark.m;
    ok(s.mark.raw !== null && markerOk(m) && m.from === OLD && m.copied === 0 && m.failed.length === 0 && m.kept.length === 0,
      'the marker ' + LIVE + MARK + ' is written, with copied: 0 and nothing failed or kept: ' + s.mark.raw);
    ok(!!m && Math.abs(s.now - m.at) < 60000, 'its time (at) is this start: ' + (m ? Math.round((s.now - m.at) / 1000) + ' s before it was read' : 'no marker'));
    ok(sameMark(s.info, m), 'App.store.importInfo() gives that marker: ' + counts(s.info));
    ok(s.old.length === 0 && s.oldWrites.length === 0 && s.writes > 0, 'no guitarlab.* key was created, and none was named by a setItem, removeItem or clear (' + s.writes + ' writes to localStorage seen)' + lines(s.old.concat(s.oldWrites)));
    ok(s.beta.length === 0, 'no key of the beta scope (' + BETA + '*) either' + lines(s.beta));
    ok(s.idb.length === 0, 'no database was opened or deleted' + lines(s.idb));

    // the store's new calls, on a key of this test
    const api = await page.evaluate(([LIVE, raw]) => {
      const st = App.store, o = {};
      o.deny = [st.deny.test('st.tracks'), st.deny.test('plugins.list'), st.deny.test('tr.earBest'), st.deny.test(LIVE + 'st.tracks'), st.deny.test('synthtab.live'), st.deny.test('tr.sessions'), st.deny.test('fb.root')];
      o.set = st.setRaw('zz.raw', raw); o.raw = st.raw('zz.raw'); o.stored = __store.raw(LIVE + 'zz.raw'); o.get = st.get('zz.raw', null);
      o.keys = st.keys().slice().sort(); o.scope = Object.keys(__store.dump(LIVE)).sort(); o.none = st.raw('zz.none');
      __store.drop(LIVE + 'zz.raw');
      return o;
    }, [LIVE, ' {"a": 1} ']);
    ok(J(api.deny) === J([true, true, true, false, false, false, false]), 'App.store.deny is tested against a key without its prefix: st.tracks, plugins.list and tr.earBest are removed features; ' +
      LIVE + 'st.tracks, synthtab.live, tr.sessions and fb.root are not: ' + J(api.deny));
    ok(api.raw === ' {"a": 1} ' && api.stored === api.raw && api.get && api.get.a === 1 && api.none === null,
      'setRaw stores a string as it is under this scope, raw gives it back (null for a key that is not there), get parses it: ' + J([api.set, api.raw, api.stored, api.get, api.none]));
    ok(api.keys.includes('zz.raw') && J(api.keys) === J(api.scope), 'App.store.keys() lists the keys of this scope without the prefix (' + api.keys.length + ' keys)' +
      (J(api.keys) === J(api.scope) ? '' : '\n    keys(): ' + J(api.keys) + '\n    stored: ' + J(api.scope)));
    const c = await backupCard(page);
    ok(c.info && c.again !== null, 'Settings › Backup has its status block #set-backup-info and the button #set-copy-again: ' + J([c.info, c.again]));
    ok(c.seen && INFO_NONE.test(c.text) && !/\b0 items\b/.test(c.text), 'with nothing to copy the block says so in words, not "0 items": "' + c.text + '"');
    quiet(w, 'a first visit');
  });

  // ---------------------------------------------------------------- 2
  await section('2 a 1.x profile: what 2.0 keeps comes across byte for byte, what left the app stays behind', async () => {
    const old = Object.assign({}, KEPT, REMOVED), removed = Object.keys(REMOVED);
    const ctx = await profile(browser, { old });
    const w = await open(ctx, env.URL), page = w.page;
    await page.waitForTimeout(900); // a first run shows its welcome card 0.7 s after the start
    const s = await page.evaluate(([OLD, LIVE, KEPT, removed]) => ({
      rep: __copied(LIVE, KEPT),
      there: removed.filter(k => __store.raw(LIVE + k) !== null),
      wrote: removed.filter(k => __writes.some(x => x.key === LIVE + k)),
      ran: window.__pluginRan, mark: __mark(LIVE),
      root: App.store.get('fb.root', null),
      bar: [(document.getElementById('cx-root') || {}).value, (document.getElementById('cx-scale') || {}).value, (document.getElementById('cx-bpm') || {}).value],
      clef: (document.getElementById('ctx-btn') || {}).title || '',
      xp: window.SLXP && SLXP.legacy ? SLXP.legacy().total : null,
      ledger: App.practiceProgress ? App.practiceProgress.getSettings() : null, ledgerError: App.practiceProgressError || '',
      tour: !!(window.Help && Help.isOpen && Help.isOpen()),
      old: __store.dump(OLD), oldWrites: __store.touched(OLD), idb: __idb.slice()
    }), [OLD, LIVE, KEPT, removed]);
    const a = arrived(s.rep, Object.keys(KEPT));
    ok(a.wrong.length === 0, 'the copy wrote all ' + nKept + ' kept keys under ' + LIVE + '*, each one the source string byte for byte' + lines(a.wrong));
    ok(a.missing.length === 0 && a.changed.length === 0, 'after the start every kept key is still there and holds the source string' +
      (a.again.length ? ' (written again by the app itself since: ' + a.again.join(', ') + ')' : '') + lines(a.missing.map(k => 'missing: ' + k).concat(a.changed.map(k => 'changed: ' + k))));
    ok(s.there.length === 0 && s.wrote.length === 0, 'none of the ' + nRemoved + ' keys of removed features exists under the new prefix, and none was ever written there (' + removed.join(', ') + ')' +
      lines(s.there.map(k => 'stored: ' + k).concat(s.wrote.map(k => 'written: ' + k))));
    const m = s.mark.m;
    ok(markerOk(m) && m.from === OLD && m.copied === nKept && m.skipped === nRemoved && m.failed.length === 0 && m.kept.length === 0,
      'the marker says so: ' + nKept + ' copied from the 1.x store, ' + nRemoved + ' skipped, nothing failed: ' + counts(m));
    ok(s.ran === undefined, 'the stored 1.x plug-in did not run (its code would set a global): ' + J(s.ran));
    ok(s.root === 7, 'App.store.get("fb.root") is the seeded key, G: ' + J(s.root));
    ok(J(s.bar) === J(['7', 'dorian', '96']) && /G Dorian/.test(s.clef) && /96 BPM/.test(s.clef), 'the context bar shows G, Dorian and 96 BPM, and the clef button names them: ' + J(s.bar) + ' "' + s.clef + '"');
    ok(s.xp === 1234, 'the 1.x XP total is there as Legacy / unassigned (SLXP.legacy().total): ' + J(s.xp));
    ok(!!s.ledger && s.ledger.dailyMinutes === 25 && s.ledger.timezone === 'Pacific/Auckland' && !s.ledgerError,
      'the XP ledger loaded the copied practice.progress.v1 (25 minutes a day, zone Pacific/Auckland): ' + J(s.ledger && [s.ledger.dailyMinutes, s.ledger.timezone]) + (s.ledgerError ? ' ' + s.ledgerError : ''));
    ok(!s.tour, 'the first-run flags came across before the app read them: no welcome card');
    const h = await health(page);
    ok(h.active === 'songs' && healthy(h), 'the app opens on Songs, the page the 1.x session ended on (app.tab), with a visible panel: ' + said(h));
    ok(diff(old, s.old).length === 0 && s.oldWrites.length === 0, 'the 1.x store holds its ' + Object.keys(old).length + ' entries as before, and no write named one' + lines(diff(old, s.old).concat(s.oldWrites)));
    ok(s.idb.length === 0, 'no database was opened (the sampler database guitarlab-daw least of all)' + lines(s.idb));
    const c = await backupCard(page), n = INFO_COPIED.exec(c.text);
    ok(c.seen && !!n && +n[1] === nKept && !/did not fit/.test(c.text) && !/already has its own data/.test(c.text),
      'Settings › Backup says what the copy did, and nothing about items that did not fit: "' + c.text + '"');
    ok(c.again === AGAIN, 'its button reads "' + AGAIN + '": ' + J(c.again));
    quiet(w, 'a 1.x profile');
  });

  // ---------------------------------------------------------------- 3
  await section('3 the one-time migration markers travel with the settings they guard', async () => {
    const read = page => page.evaluate(() => ({ frets: App.store.get('fb.frets', null), input: App.store.get('midi.inputId', null), sound: App.store.get('midi.appSound', null),
      marks: [App.store.get('fb.migr24', null), App.store.get('midi.allIn.v1', null), App.store.get('midi.voiceAuto', null)],
      voice: App.midi ? App.midi.voice : null, fretSel: (document.getElementById('fb-frets') || {}).value || null }));
    let ctx = await profile(browser, { old: Object.assign({}, FLAGS, GUARDED, MIGRATED) });
    let w = await open(ctx, env.URL);
    let s = await read(w.page);
    ok(s.frets === 22, 'fb.frets 22 with fb.migr24: the neck keeps its 22 frets: ' + J([s.frets, s.fretSel]));
    ok(s.input === 'in-1', 'midi.inputId "in-1" with midi.allIn.v1: the chosen keyboard stays chosen: ' + J(s.input));
    ok(s.sound === false, 'midi.appSound false with midi.voiceAuto: "soundLAB plays my keys" stays on Never: ' + J([s.sound, s.voice]));
    ok(J(s.marks) === J([true, true, true]), 'the three markers are in the 2.0 store: ' + J(s.marks));
    quiet(w, 'migration markers');
    // the control: the same three settings without their markers. If this stops failing the settings, the
    // 1.x migrations are gone and the checks above prove nothing any more
    ctx = await profile(browser, { old: Object.assign({}, FLAGS, GUARDED) });
    w = await open(ctx, env.URL);
    s = await read(w.page);
    ok(s.frets === 24 && s.input === 'all' && s.sound === 'auto', 'control: without their markers the same three settings are reset by the 1.x migrations (24 frets, All keyboards, Auto), so the markers are what keeps them: ' +
      J([s.frets, s.input, s.sound]));
  });

  // ---------------------------------------------------------------- 4
  await section('4 the 1.x store is untouched', async () => {
    const old = Object.assign({}, KEPT, REMOVED, GUARDED, MIGRATED), nOld = Object.keys(old).length;
    const ctx = await profile(browser, { old });
    const w = await open(ctx, env.URL), page = w.page;
    const look = p => p.evaluate(OLD => ({ old: __store.dump(OLD), touched: __store.touched(OLD), writes: __writes.length, idb: __idb.slice() }), OLD);
    const same = (s, when) => ok(diff(old, s.old).length === 0 && s.touched.length === 0 && s.writes > 0,
      when + ': all ' + nOld + ' guitarlab.* entries are identical, and no setItem, removeItem or clear named one (' + s.writes + ' writes to localStorage seen in this load)' + lines(diff(old, s.old).concat(s.touched)));
    let s = await look(page);
    same(s, 'after the start');
    // the key and the tempo, set where a user sets them: the clef dropdown
    const set = await page.evaluate(async ([OLD, LIVE]) => {
      const put = (id, v) => { const el = document.getElementById(id); el.value = String(v); el.dispatchEvent(new Event('change', { bubbles: true })); };
      put('cx-root', 2); put('cx-scale', 'major'); put('cx-bpm', 132);
      await __wait(120);
      const three = pre => ['fb.root', 'fb.scale', 'met.bpm'].map(k => __store.raw(pre + k));
      return { now: three(LIVE), old: three(OLD) };
    }, [OLD, LIVE]);
    ok(J(set.now) === J(['2', '"major"', '132']) && J(set.old) === J([old['fb.root'], old['fb.scale'], old['met.bpm']]),
      'the key D major at 132 BPM is stored by 2.0 under its own prefix; the 1.x store still says G Dorian at 96: ' + J(set.now) + ' / ' + J(set.old));
    const visit = p => p.evaluate(async () => {
      const out = [];
      for (const id of __pages()) { App.switchTo(id); await __wait(180); out.push({ id, ok: App.active === id && __shown() === id }); }
      return out;
    });
    let tour = await visit(page);
    ok(tour.length > 10 && tour.every(x => x.ok), 'every page of soundLAB was opened (' + tour.map(x => x.id).join(', ') + ')' + lines(tour.filter(x => !x.ok).map(x => 'not shown: ' + x.id)));
    s = await look(page);
    same(s, 'after changing key and tempo and visiting every page');
    const idb = s.idb.slice();
    await reload(page);
    s = await look(page);
    same(s, 'after a reload');
    // soundLAB Gear is 2.0 too: the same store, the same rule
    const g = await open(ctx, env.GEAR_URL), gp = g.page;
    const gh = await health(gp);
    tour = await visit(gp);
    ok(gh.app === 'gear' && tour.length > 0 && tour.every(x => x.ok), 'soundLAB Gear opened in the same profile, and every page of it (' + tour.map(x => x.id).join(', ') + ')' + lines(tour.filter(x => !x.ok).map(x => 'not shown: ' + x.id)));
    const gs = await look(gp);
    same(gs, 'after soundLAB Gear and its pages');
    const dbs = idb.concat(s.idb, gs.idb);
    ok(dbs.length === 0, 'indexedDB.open was never called, in either app (deleteDatabase neither)' + lines(dbs));
    ok(w.errs.length === 0 && g.errs.length === 0, 'no page error on the way' + lines(w.errs.concat(g.errs)));
  });

  // ---------------------------------------------------------------- 5
  await section('5 the copy runs once', async () => {
    const ctx = await profile(browser, { old: Object.assign({}, KEPT, REMOVED) });
    const w = await open(ctx, env.URL), page = w.page;
    const first = await page.evaluate(LIVE => __mark(LIVE), LIVE);
    ok(first.raw !== null && markerOk(first.m) && first.m.copied === nKept, 'first start: the copy ran: ' + counts(first.m));
    // 2.0 is used: a new key and a new tempo
    await page.evaluate(() => { App.store.set('fb.root', 2); App.store.set('met.bpm', 150); });
    await reload(page);
    const state = () => page.evaluate(([OLD, LIVE, MARK]) => ({
      mark: __mark(LIVE).raw, markWrites: __store.touched(LIVE + MARK), room: __writes.filter(x => x.op === 'set' && x.len >= 200000).length,
      root: App.store.get('fb.root', null), bpm: App.store.get('met.bpm', null), bar: [(document.getElementById('cx-root') || {}).value, (document.getElementById('cx-bpm') || {}).value],
      late: __store.raw(LIVE + 'late.arrival'), xp: __store.raw(LIVE + 'xp.total'), oldWrites: __store.touched(OLD)
    }), [OLD, LIVE, MARK]);
    let s = await state();
    ok(s.mark === first.raw && s.markWrites.length === 0, 'after a reload the marker is the same string and was not written again' + (s.mark === first.raw ? '' : '\n    was: ' + first.raw + '\n    is:  ' + s.mark) + lines(s.markWrites));
    ok(s.room === 0, 'a start with a finished copy returns at once: no headroom test (no write of 200,000 characters): ' + s.room);
    ok(s.root === 2 && s.bpm === 150 && J(s.bar) === J(['2', '150']), 'the key and tempo changed in 2.0 stay (D, 150 BPM), they are not replaced by the 1.x values: ' + J([s.root, s.bpm, s.bar]));
    // the live 1.x app is used too: it changes two values, adds a key and removes one
    await page.evaluate(OLD => { __store.put(OLD + 'fb.root', '4'); __store.put(OLD + 'met.bpm', '141'); __store.put(OLD + 'late.arrival', '"new in 1.x"'); __store.drop(OLD + 'xp.total'); }, OLD);
    await reload(page);
    s = await state();
    ok(s.mark === first.raw && s.markWrites.length === 0 && s.room === 0, 'the 1.x store changed afterwards, then a reload: the marker is still the same string, nothing was copied again');
    ok(s.root === 2 && s.bpm === 150 && s.late === null && s.xp === KEPT['xp.total'],
      '2.0 keeps what it had: its own key and tempo, no late.arrival, and the xp.total that 1.x has dropped since: ' + J([s.root, s.bpm, s.late, s.xp]));
    ok(s.oldWrites.length === 0, 'and 2.0 wrote nothing to the 1.x store' + lines(s.oldWrites));
    ok(w.errs.length === 0, 'no page error (three starts)' + lines(w.errs));
  });

  // ---------------------------------------------------------------- 6
  await section('6 the copy never overwrites', async () => {
    // 2.0 data that is already there before the first start with this build: two keys that 1.x has too, one it has not
    const mine = { 'fb.root': '2', 'kl.prog': '{"g-r":{"step":5}}', 'zz.own': '"made in 2.0"' };
    const rest = Object.keys(KEPT).filter(k => !(k in mine));
    const ctx = await profile(browser, { old: KEPT, live: mine });
    const w = await open(ctx, env.URL), page = w.page;
    const s = await page.evaluate(([LIVE, KEPT, mine]) => ({
      rep: __copied(LIVE, KEPT), mark: __mark(LIVE),
      mine: Object.keys(mine).map(k => ({ k, now: __store.raw(LIVE + k), writes: __writes.filter(x => x.key === LIVE + k).length })),
      root: App.store.get('fb.root', null), bar: (document.getElementById('cx-root') || {}).value
    }), [LIVE, KEPT, mine]);
    const lost = s.mine.filter(x => x.now !== mine[x.k]);
    ok(lost.length === 0, 'the three ' + LIVE + '* keys that were there before the first start keep their values (' + Object.keys(mine).join(', ') + '; writes to them: ' + s.mine.map(x => x.writes).join(', ') + ')' +
      lines(lost.map(x => x.k + ' is now ' + short(x.now))));
    const a = arrived(s.rep, rest);
    ok(clean(a), 'the rest is copied: ' + rest.length + ' keys, byte for byte' + told(a));
    const m = s.mark.m;
    ok(markerOk(m) && m.copied === rest.length && m.failed.length === 0, 'the marker counts ' + rest.length + ' copied and nothing failed: the two keys 2.0 already had are not counted as copied: ' + counts(m));
    ok(!!m && m.skipped === 2 && m.copied + m.skipped === nKept, 'they are counted as skipped (left alone): copied + skipped = the ' + nKept + ' keys of the source: ' + J(m && [m.copied, m.skipped]));
    ok(s.root === 2 && s.bar === '2', 'the app runs on its own value, the key D, not on the G of 1.x: ' + J([s.root, s.bar]));
    quiet(w, 'a profile that already has 2.0 data');
  });

  // ---------------------------------------------------------------- 7
  await section('7 the beta under /next/ keeps its own scope', async () => {
    const toRoot = (p, v) => p.evaluate(async v => { const el = document.getElementById('cx-root'); el.value = String(v); el.dispatchEvent(new Event('change', { bubbles: true })); await __wait(120); }, v);

    console.log('  - a browser that only has 1.x data');
    {
      const old = Object.assign({}, KEPT, REMOVED), removed = Object.keys(REMOVED);
      const ctx = await profile(browser, { old, next: true });
      const w = await open(ctx, NEXT + 'index.html'), page = w.page;
      const s = await page.evaluate(([OLD, LIVE, BETA, KEPT, removed]) => ({
        path: location.pathname, prefix: App.store.prefix, rep: __copied(BETA, KEPT), there: removed.filter(k => __store.raw(BETA + k) !== null), mark: __mark(BETA),
        live: Object.keys(__store.dump(LIVE)), liveWrites: __store.touched(LIVE), old: __store.dump(OLD), oldWrites: __store.touched(OLD)
      }), [OLD, LIVE, BETA, KEPT, removed]);
      const h = await health(page);
      ok(/\/next\/index\.html$/.test(s.path) && healthy(h), 'the app runs at ' + s.path + ' (the route serves the test server\'s files there): ' + said(h));
      ok(s.prefix === BETA, 'there App.store.prefix is "' + BETA + '": ' + J(s.prefix));
      const a = arrived(s.rep, Object.keys(KEPT));
      ok(clean(a) && s.there.length === 0, 'with only guitarlab.* in the browser it copies from there: the ' + nKept + ' kept keys are under ' + BETA + '*, no removed feature is' + told(a) + lines(s.there.map(k => 'stored: ' + k)));
      ok(markerOk(s.mark.m) && s.mark.m.from === OLD && s.mark.m.copied === nKept && s.mark.m.failed.length === 0, 'the beta has its own marker, ' + BETA + MARK + ', from the 1.x store: ' + counts(s.mark.m));
      ok(s.live.length === 0 && s.liveWrites.length === 0, 'nothing is stored under the live prefix ' + LIVE + '*, and no write named such a key' + lines(s.live.concat(s.liveWrites)));
      ok(diff(old, s.old).length === 0 && s.oldWrites.length === 0, 'the 1.x store is untouched' + lines(diff(old, s.old).concat(s.oldWrites)));
      // on the beta guitarlab.* is the LIVE app's data (the live app still stores there): the card says "from the live app"
      const bc = await backupCard(page), bn = INFO_COPIED_BETA.exec(bc.text);
      ok(bc.seen && !!bn && +bn[1] === nKept && bc.again === AGAIN_BETA && !/earlier soundLAB data/.test(bc.text),
        'Settings › Backup on the beta calls the source the live app, in the line and on the button: "' + bc.text + '" / ' + J(bc.again));
      await toRoot(page, 11);
      const wr = await page.evaluate(([LIVE, BETA]) => [__store.raw(BETA + 'fb.root'), __store.raw(LIVE + 'fb.root')], [LIVE, BETA]);
      ok(wr[0] === '11' && wr[1] === null, 'a key change on the beta is stored under the beta prefix only: ' + J(wr));
      // the path rule: /next/ itself and /next/gear.html are the beta too
      const dir = await open(ctx, NEXT), gear = await open(ctx, NEXT + 'gear.html');
      const at = [await dir.page.evaluate(() => [location.pathname, App.app, App.store.prefix]), await gear.page.evaluate(() => [location.pathname, App.app, App.store.prefix])];
      ok(/\/next\/$/.test(at[0][0]) && at[0][1] === 'main' && at[0][2] === BETA && /\/next\/gear\.html$/.test(at[1][0]) && at[1][1] === 'gear' && at[1][2] === BETA,
        'the folder address and gear.html under /next/ are the beta scope as well: ' + J(at));
      await dir.page.close(); await gear.page.close();
      // the live address in the same browser: the beta's visit must not have used up its copy
      const betaMark = await page.evaluate(BETA => __mark(BETA).raw, BETA);
      const lw = await open(ctx, env.URL), lp = lw.page;
      const l = await lp.evaluate(([LIVE, BETA, KEPT]) => ({ path: location.pathname, prefix: App.store.prefix, rep: __copied(LIVE, KEPT), mark: __mark(LIVE), root: App.store.get('fb.root', null),
        betaMark: __mark(BETA).raw, betaRoot: __store.raw(BETA + 'fb.root'), betaWrites: __store.touched(BETA) }), [LIVE, BETA, KEPT]);
      const la = arrived(l.rep, Object.keys(KEPT));
      ok(l.prefix === LIVE && markerOk(l.mark.m) && l.mark.m.from === OLD && l.mark.m.copied === nKept && clean(la),
        'the live address (' + l.path + ') then makes its own first copy of the 1.x data, under ' + LIVE + '*: ' + counts(l.mark.m) + told(la));
      ok(l.root === 7, 'a page at the live path does not see the beta\'s write: its key is the G of 1.x, not the beta\'s B: ' + J(l.root));
      ok(l.betaMark === betaMark && l.betaRoot === '11' && l.betaWrites.length === 0, 'and it leaves the beta scope alone: same marker, same key, no write there' + lines(l.betaWrites));
      // two apps, two sets of Web Locks: the beta and the live app keep the Hear input switch and the pedal bindings
      // under their own prefix, so neither may take the other's lock (one name for the origin let Off in the beta
      // silence the live window, and a visible beta soundLAB keep a live Gear window from answering the pedal)
      const lockOf = p => p.evaluate(async () => {
        const t0 = Date.now();
        while (!(App.audioIn && App.audioIn._t().owner && App.remote && App.remote.holdsMain) && Date.now() - t0 < 3000) await __wait(30);
        return { owner: !!(App.audioIn && App.audioIn._t().owner), main: !!(App.remote && App.remote.holdsMain), held: (await navigator.locks.query()).held.map(x => x.name).sort() };
      });
      const lb = await lockOf(page), ll = await lockOf(lp);
      const want = ['soundlab-hear-input:' + BETA, 'soundlab-hear-input:' + LIVE, 'soundlab-remote-main:' + BETA, 'soundlab-remote-main:' + LIVE];
      ok(lb.owner && ll.owner && lb.main && ll.main, 'side by side, each window has its own Hear input lock and its own pedal lock: neither waits for the other: ' + J([lb.owner, ll.owner, lb.main, ll.main]));
      ok(J(ll.held) === J(want), 'the four locks held on this origin carry their scope\'s prefix: ' + J(ll.held));
      await lp.evaluate(async () => { const el = document.getElementById('cx-bpm'); el.value = '150'; el.dispatchEvent(new Event('change', { bubbles: true })); await __wait(120); });
      const back = await page.evaluate(([LIVE, BETA]) => [__store.raw(LIVE + 'met.bpm'), __store.raw(BETA + 'met.bpm'), App.store.get('met.bpm', null)], [LIVE, BETA]);
      ok(back[0] === '150' && back[1] === KEPT['met.bpm'] && back[2] === 96, 'a tempo change at the live address stays out of the beta scope: ' + J(back));
      ok(w.errs.length === 0 && lw.errs.length === 0 && w.bad.length === 0, 'no page error and no missing file under /next/' + lines(w.errs.concat(lw.errs, w.bad)));
    }

    console.log('  - a browser where the live address already runs 2.0');
    {
      // the live scope with its own marker and its own values; the 1.x store is still there, with other values
      const liveMark = J({ v: 1, from: OLD, at: 1790000000000, copied: 7, skipped: 0, failed: [], kept: [] });
      const src = Object.assign({}, FLAGS, { 'fb.root': '5', 'fb.scale': '"major"', 'met.bpm': '133', 'kl.prog': '{ "g-r": { "step": 6 } }' });
      const live = Object.assign({}, src); live[MARK] = liveMark;
      const ctx = await profile(browser, { old: KEPT, live, next: true });
      const w = await open(ctx, NEXT + 'index.html'), page = w.page;
      // three keys only the 1.x store has: a copy from there would bring exactly these strings
      const only1x = { 'xp.total': KEPT['xp.total'], 'sg.lib': KEPT['sg.lib'], 'cc.charts': KEPT['cc.charts'] };
      const s = await page.evaluate(([OLD, LIVE, BETA, src, only1x]) => ({
        prefix: App.store.prefix, rep: __copied(BETA, src), mark: __mark(BETA), root: App.store.get('fb.root', null),
        only1x: __copied(BETA, only1x), charts: __store.raw(BETA + 'cc.charts'),
        live: __store.dump(LIVE), liveWrites: __store.touched(LIVE), old: __store.dump(OLD), oldWrites: __store.touched(OLD)
      }), [OLD, LIVE, BETA, src, only1x]);
      const a = arrived(s.rep, Object.keys(src)), m = s.mark.m;
      ok(s.prefix === BETA && markerOk(m) && m.from === LIVE && m.copied === Object.keys(src).length && m.failed.length === 0,
        'with a live marker the beta copies from ' + LIVE + '*: its marker says so and counts the ' + Object.keys(src).length + ' live keys: ' + counts(m));
      ok(clean(a) && s.root === 5, 'the live values are under ' + BETA + '* byte for byte: the key is the live app\'s F, not the G of 1.x: ' + J(s.root) + told(a));
      ok(s.mark.raw !== liveMark, 'the live marker itself is not copied: the beta wrote its own');
      // by value: the Charts page stores a blank first chart of its own when it finds none, so cc.charts is there, but it is not the 1.x string
      const took = Object.keys(only1x).filter(k => s.only1x[k].first === 'same' || s.only1x[k].now === 'same');
      const there = ['xp.total', 'sg.lib'].filter(k => s.only1x[k].now !== 'missing' || s.only1x[k].writes > 0);
      let blank = null; try { blank = JSON.parse(s.charts); } catch (e) { blank = null; }
      ok(took.length === 0 && there.length === 0 && Array.isArray(blank) && blank.length === 1 && blank[0].title !== 'Chart 1',
        'what only the 1.x store has (xp.total, sg.lib, cc.charts) is not copied: the source is the live 2.0 app. No such string was written or is stored; xp.total and sg.lib do not exist, cc.charts is the Charts page\'s own blank chart: ' +
        short(s.charts) + lines(took.map(k => 'copied: ' + k).concat(there.map(k => 'stored: ' + k))));
      ok(diff(live, s.live).length === 0 && s.liveWrites.length === 0, 'the live keys are unchanged, and no write named a ' + LIVE + '* key' + lines(diff(live, s.live).concat(s.liveWrites)));
      ok(diff(KEPT, s.old).length === 0 && s.oldWrites.length === 0, 'the 1.x store is untouched as well' + lines(diff(KEPT, s.old).concat(s.oldWrites)));
      const c = await backupCard(page);
      ok(c.again === AGAIN_BETA, 'Settings › Backup on the beta offers "' + AGAIN_BETA + '": ' + J(c.again));
      await toRoot(page, 11);
      const lw = await open(ctx, env.URL), lp = lw.page;
      const l = await lp.evaluate(([LIVE, MARK]) => ({ prefix: App.store.prefix, mark: __mark(LIVE).raw, markWrites: __store.touched(LIVE + MARK), root: App.store.get('fb.root', null) }), [LIVE, MARK]);
      ok(l.prefix === LIVE && l.root === 5, 'a page at the live path does not see the beta\'s key change (B): it still has F: ' + J([l.prefix, l.root]));
      ok(l.mark === liveMark && l.markWrites.length === 0, 'and its marker is the one it had: the live scope does not copy again');
      ok(w.errs.length === 0 && lw.errs.length === 0, 'no page error (beta next to a live 2.0)' + lines(w.errs.concat(lw.errs)));
    }

    console.log('  - a beta copy from the live 2.0 scope that left one key behind');
    {
      // kl.prog exists in both sources with different values; the beta's first write of it is refused
      const liveMark = J({ v: 1, from: OLD, at: 1790000000000, copied: 7, skipped: 0, failed: [], kept: [] });
      const src = Object.assign({}, FLAGS, { 'fb.root': '5', 'kl.prog': '{ "g-r": { "step": 6 } }' });
      const live = Object.assign({}, src); live[MARK] = liveMark;
      const ctx = await profile(browser, { old: KEPT, live, next: true, ctl: { refuse: [BETA + 'kl.prog'] } });
      const w = await open(ctx, NEXT + 'index.html'), page = w.page;
      const s = await page.evaluate(BETA => ({ toast: __toast(), mark: __mark(BETA), now: __store.raw(BETA + 'kl.prog') }), BETA);
      const m = s.mark.m, nb = NOTICE_BETA.exec(s.toast);
      ok(markerOk(m) && m.from === LIVE && J(m.failed) === J(['kl.prog']) && s.now === null, 'first start: the copy came from ' + LIVE + '* and kl.prog did not fit: ' + counts(m));
      ok(!!nb && +nb[1] === 1 && !NOTICE.test(s.toast), 'the start notice on the beta says "data from the live app": "' + s.toast + '"');
      const c = await backupCard(page), f = INFO_FAILED_BETA.exec(c.text);
      ok(c.seen && INFO_COPIED_BETA.test(c.text) && !!f && +f[1] === 1 && f[2] === 'kl.prog' && !/earlier/.test(c.text),
        'Settings › Backup there names the key and says the live app\'s data is untouched: "' + c.text + '"');
      // room again: the retry must read the source the copy came from, the live 2.0 scope, not guitarlab.*
      await page.evaluate(() => __ctl({}));
      await reload(page);
      const t = await page.evaluate(([OLD, LIVE, BETA]) => ({ toast: __toast(), mark: __mark(BETA), now: __store.raw(BETA + 'kl.prog'), liveWrites: __store.touched(LIVE), oldWrites: __store.touched(OLD) }), [OLD, LIVE, BETA]);
      ok(t.now === src['kl.prog'] && t.now !== KEPT['kl.prog'], 'the next start copies kl.prog from the live scope (the live app\'s value, not the older one under guitarlab.*): ' + short(t.now));
      ok(markerOk(t.mark.m) && t.mark.m.from === LIVE && t.mark.m.failed.length === 0 && t.mark.m.kept.length === 0 && !NOTICE_BETA.test(t.toast), 'nothing is left behind and the notice is gone: ' + counts(t.mark.m));
      ok(t.liveWrites.length === 0 && t.oldWrites.length === 0 && w.errs.length === 0, 'neither source was written, no page error' + lines(t.liveWrites.concat(t.oldWrites, w.errs)));
    }
  });

  // ---------------------------------------------------------------- 8
  await section('8 refused writes and a full store', async () => {
    const keysOf = seed => Object.keys(seed), rest = seed => keysOf(seed).filter(k => k !== LIB);
    // the first start of a profile: what arrived, what the marker and the notice say
    const first = (page, seed) => page.evaluate(([OLD, LIVE, seed]) => ({ toast: __toast(), rep: __copied(LIVE, seed), mark: __mark(LIVE), info: App.store.importInfo(),
      old: __store.dump(OLD), oldWrites: __store.touched(OLD) }), [OLD, LIVE, seed]);
    const noticed = (toast, n) => { const x = NOTICE.exec(toast); return !!x && +x[1] === n; };

    console.log('  (a) setItem throws for one large library key (' + LIVE + LIB + ')');
    {
      const seed = bigProfile(true);
      const ctx = await profile(browser, { old: seed, ctl: { refuse: [LIVE + LIB] } });
      const w = await open(ctx, env.URL), page = w.page;
      const s = await first(page, seed), h = await health(page), m = s.mark.m;
      ok(w.errs.length === 0 && healthy(h), 'the start does not throw: the app is up with a visible panel: ' + said(h) + lines(w.errs));
      const a = arrived(s.rep, rest(seed));
      const small = rest(seed).filter(k => groupOf(k, seed[k]) === 1).length;
      ok(clean(a), 'every small key (' + small + ') and every progress key (' + LARGE.progress.join(', ') + ') arrived byte for byte; so did the other libraries and ' + LARGE.other.join(', ') + told(a));
      ok(s.rep[LIB].first === 'refused' && s.rep[LIB].now === 'missing', LIB + ' (' + num(seed[LIB].length) + ' characters) was tried and refused, and is not in the 2.0 store: ' + J(s.rep[LIB]));
      ok(markerOk(m) && J(m.failed) === J([LIB]) && m.copied === rest(seed).length && m.kept.length === 0, 'the marker lists the failed key and counts the ' + rest(seed).length + ' others as copied: ' + counts(m));
      ok(sameMark(s.info, m), 'App.store.importInfo() gives the same: ' + counts(s.info));
      ok(noticed(s.toast, 1), 'the start notice is shown, for 1 item: "' + s.toast + '"');
      ok(diff(seed, s.old).length === 0 && s.oldWrites.length === 0, 'the 1.x store is untouched' + lines(diff(seed, s.old).concat(s.oldWrites)));
      // D46: the order of the copy's writes (everything written under the 2.0 prefix before the marker), and the headroom test
      const log = await page.evaluate(([LIVE, MARK]) => {
        const seq = [];
        for (const x of __writes) {
          if (x.op !== 'set' || x.key.indexOf(LIVE) !== 0) continue;
          if (x.key === LIVE + MARK) break;
          seq.push({ k: x.key.slice(LIVE.length), len: x.len });
        }
        const room = __writes.filter(x => x.op === 'set' && x.key.indexOf(LIVE) === 0 && x.len >= 200000).map(x => ({ key: x.key, len: x.len, refused: x.refused,
          removed: __writes.some(y => y.op === 'remove' && y.key === x.key), left: __store.raw(x.key) !== null }));
        return { seq, room };
      }, [LIVE, MARK]);
      const seq = log.seq.filter(x => x.k in seed), rank = x => [groupOf(x.k, seed[x.k]), x.len], unsorted = [];
      for (let i = 1; i < seq.length; i++) {
        const p = rank(seq[i - 1]), q = rank(seq[i]);
        if (p[0] > q[0] || (p[0] === q[0] && p[1] > q[1])) unsorted.push(seq[i - 1].k + ' (' + GROUP_NAMES[p[0]] + ', ' + num(p[1]) + ') was written before ' + seq[i].k + ' (' + GROUP_NAMES[q[0]] + ', ' + num(q[1]) + ')');
      }
      const notOnce = keysOf(seed).filter(k => seq.filter(x => x.k === k).length !== 1);
      ok(notOnce.length === 0 && unsorted.length === 0, 'the copy writes each key once, in the order of D46: every value of at most ' + num(SMALL) + ' characters, then large progress, then large libraries, then the rest, the smallest first in each: … ' +
        seq.filter(x => x.len > SMALL).map(x => x.k + ' (' + num(x.len) + ')').join(', ') + lines(unsorted.concat(notOnce.map(k => 'not written exactly once: ' + k))));
      ok(log.room.length === 1 && log.room[0].len === ROOM && !log.room[0].refused && log.room[0].removed && !log.room[0].left,
        'when the copy is done it tests the headroom: one write of ' + num(ROOM) + ' characters under the 2.0 prefix, removed again: ' + J(log.room));
      const c = await backupCard(page), n = INFO_COPIED.exec(c.text), f = INFO_FAILED.exec(c.text);
      ok(c.seen && !!n && +n[1] === m.copied && !!f && +f[1] === 1 && f[2] === LIB, 'Settings › Backup names the key that did not fit and says the 1.x data is untouched: "' + c.text + '"');
      // the next start, still refused: tried again, the same notice, the marker left as it is
      await reload(page);
      const again = await page.evaluate(([LIVE, MARK, LIB]) => ({ toast: __toast(), mark: __mark(LIVE), markWrites: __store.touched(LIVE + MARK), tries: __store.touched(LIVE + LIB), now: __store.raw(LIVE + LIB) }), [LIVE, MARK, LIB]);
      ok(again.tries.length > 0 && again.tries.every(t => /refused/.test(t)) && again.now === null, 'the next start tries the key again (refused again): ' + J(again.tries));
      ok(again.mark.raw === s.mark.raw && again.markWrites.length === 0, 'nothing changed, so the marker is not rewritten: ' + counts(again.mark.m) + lines(again.markWrites));
      ok(noticed(again.toast, 1), 'and the notice is shown again: at each start while something is missing: "' + again.toast + '"');
      // a start where the key fits but the MARKER cannot be written: a copy the marker does not record must be
      // taken back, or the next start would find the key there, take it for 2.0's own data and move it to kept
      await page.evaluate(([LIVE, MARK]) => __ctl({ refuse: [LIVE + MARK] }), [LIVE, MARK]);
      await reload(page);
      const one = {}; one[LIB] = seed[LIB];
      const look = () => page.evaluate(([LIVE, MARK, one]) => ({ toast: __toast(), rep: __copied(LIVE, one), mark: __mark(LIVE), info: App.store.importInfo(), markTries: __store.touched(LIVE + MARK) }), [LIVE, MARK, one]);
      let nm = await look();
      ok(nm.rep[LIB].first === 'same' && nm.rep[LIB].removed && nm.rep[LIB].now === 'missing' && nm.markTries.length > 0 && nm.markTries.every(t => /refused/.test(t)),
        'a start where ' + LIB + ' fits but the marker cannot be written: the copy is taken back (written, then removed again): ' + J(nm.rep[LIB]) + ' ' + J(nm.markTries));
      ok(nm.mark.raw === s.mark.raw && !!nm.info && J(nm.info.failed) === J([LIB]) && nm.info.kept.length === 0 && noticed(nm.toast, 1), 'the stored marker is as it was, the key still waits, and the notice is shown: ' + counts(nm.info));
      await page.evaluate(() => __ctl({}));
      await reload(page);
      nm = await look();
      ok(nm.rep[LIB].now === 'same' && markerOk(nm.mark.m) && nm.mark.m.failed.length === 0 && nm.mark.m.kept.length === 0 && nm.mark.m.copied === m.copied + 1 && !NOTICE.test(nm.toast),
        'the start after that, with room for both: the key is copied, nothing failed and nothing kept: ' + counts(nm.mark.m));
      ok(w.errs.length === 0, 'no page error (a refused key, four starts)' + lines(w.errs));
    }

    console.log('  (a2) a write that is dropped without an error: setItem returns, nothing is stored');
    {
      const ctx = await profile(browser, { old: KEPT, ctl: { drop: [LIVE + 'sg.lib'] } });
      const w = await open(ctx, env.URL), page = w.page;
      const s = await first(page, KEPT), m = s.mark.m;
      ok(s.rep['sg.lib'].writes > 0 && s.rep['sg.lib'].now === 'missing', 'sg.lib was written and is not there (the browser stored nothing and said nothing): ' + J(s.rep['sg.lib']));
      ok(markerOk(m) && J(m.failed) === J(['sg.lib']) && m.copied === nKept - 1, 'every write is read back: the key is listed as failed, not counted as copied: ' + counts(m));
      ok(noticed(s.toast, 1) && w.errs.length === 0, 'and the start notice says so: "' + s.toast + '"' + lines(w.errs));
    }

    console.log('  (b) a full store: everything fits except the largest library; then (c) the next start with room again');
    {
      const seed = bigProfile(false);
      // room for the 1.x data (it stays), for the copy of everything except the largest library, for the
      // 200,000 characters the copy must leave free, and for what the app itself stores while it starts
      const SLACK = 60000, part = (LIVE + LIB).length + seed[LIB].length;
      const cap = sizeOf(OLD, seed) + sizeOf(LIVE, seed, LIB) + ROOM + SLACK;
      if (part <= SLACK + 2000) throw new Error('test setup: the largest library (' + part + ') must be larger than the slack (' + SLACK + ')');
      const ctx = await profile(browser, { old: seed, ctl: { cap } });
      const w = await open(ctx, env.URL), page = w.page;
      const s = await first(page, seed), h = await health(page), m = s.mark.m;
      console.log('    the store holds at most ' + num(cap) + ' characters: 1.x ' + num(sizeOf(OLD, seed)) + ', the copy without ' + LIB + ' ' + num(sizeOf(LIVE, seed, LIB)) + ', ' + LIB + ' ' + num(part) + ', free ' + num(ROOM) + ' + ' + num(SLACK));
      ok(w.errs.length === 0 && healthy(h), 'the start does not throw: ' + said(h) + lines(w.errs));
      ok(markerOk(m) && J(m.failed) === J([LIB]) && m.copied === rest(seed).length, 'the largest library is in failed, and only it: ' + counts(m));
      ok(s.rep[LIB].now === 'missing', LIB + ' is not left in the 2.0 store (first write: ' + s.rep[LIB].first + (s.rep[LIB].removed ? ', then removed again to keep the headroom' : '') + ')');
      const a = arrived(s.rep, rest(seed));
      ok(clean(a), 'no small key and no progress key is missing; the two smaller libraries are there too (' + rest(seed).length + ' keys, byte for byte)' + told(a));
      const room = await page.evaluate(([LIVE, n]) => {
        const k = LIVE + 'zz.room', pad = new Array(n + 1).join('r'), o = { wrote: false, err: '' };
        try { localStorage.setItem(k, pad); o.wrote = (localStorage.getItem(k) || '').length === n; } catch (e) { o.err = e.name; }
        __store.drop(k);
        o.used = __store.used();
        return o;
      }, [LIVE, ROOM]);
      ok(room.wrote, 'a write of ' + num(ROOM) + ' characters still succeeds afterwards (' + num(room.used) + ' of ' + num(cap) + ' characters used)' + (room.err ? ': ' + room.err : ''));
      ok(noticed(s.toast, 1), 'the start notice is shown, for 1 item: "' + s.toast + '"');
      ok(diff(seed, s.old).length === 0 && s.oldWrites.length === 0, 'the 1.x store is untouched' + lines(diff(seed, s.old).concat(s.oldWrites)));

      // (b2) the next start with the store as full as before: the retry is held to the same headroom
      await reload(page);
      const lib = {}; lib[LIB] = seed[LIB];
      const b2 = await page.evaluate(([LIVE, MARK, lib, n]) => {
        const o = { toast: __toast(), rep: __copied(LIVE, lib), mark: __mark(LIVE), markWrites: __store.touched(LIVE + MARK), wrote: false };
        const k = LIVE + 'zz.room', pad = new Array(n + 1).join('r');
        try { localStorage.setItem(k, pad); o.wrote = (localStorage.getItem(k) || '').length === n; } catch (e) { o.wrote = false; }
        __store.drop(k);
        return o;
      }, [LIVE, MARK, lib, ROOM]);
      ok(b2.rep[LIB].first === 'same' && b2.rep[LIB].removed && b2.rep[LIB].now === 'missing',
        '(b2) the next start, the store as full as before: the retry writes ' + LIB + ' and takes it back again to keep the headroom: ' + J(b2.rep[LIB]));
      ok(b2.mark.raw === s.mark.raw && b2.markWrites.length === 0 && noticed(b2.toast, 1) && b2.wrote,
        '(b2) the marker is as it was (the key still waits), the notice is shown again, and ' + num(ROOM) + ' characters still fit: ' + counts(b2.mark.m) + ' ' + J(b2.wrote));

      // (c) the user made room: the cap is lifted, the app starts again
      await page.evaluate(() => __ctl({}));
      await reload(page);
      const src = {}; src[LIB] = seed[LIB];
      const t = await page.evaluate(([LIVE, src]) => ({ toast: __toast(), rep: __copied(LIVE, src), mark: __mark(LIVE) }), [LIVE, src]);
      ok(t.rep[LIB].first === 'same' && t.rep[LIB].now === 'same', '(c) the next start with room again: ' + LIB + ' is copied, byte for byte: ' + J(t.rep[LIB]));
      ok(markerOk(t.mark.m) && t.mark.m.failed.length === 0 && t.mark.m.kept.length === 0 && t.mark.m.copied === m.copied + 1, '(c) failed is empty and the key counts as copied (' + m.copied + ' -> ' + (t.mark.m && t.mark.m.copied) + '): ' + counts(t.mark.m));
      ok(!NOTICE.test(t.toast), '(c) no notice at this start: "' + t.toast + '"');
      const c = await backupCard(page);
      ok(c.seen && INFO_COPIED.test(c.text) && !/did not fit/.test(c.text), '(c) Settings › Backup no longer says that something did not fit: "' + c.text + '"');
      ok(w.errs.length === 0, 'no page error (a full store, then room)' + lines(w.errs));
    }

    console.log('  (d) instead of (c): 2.0 stores its own data under the failed key before the next start');
    {
      const seed = bigProfile(false);
      const own = [{ id: 'own1', title: 'Made in 2.0', instrument: 'piano', bpm: 100, len: 4, diff: 1, timingOk: true, notes: [{ t: 0, d: 1, m: 60, v: 90 }] }];
      const ctx = await profile(browser, { old: seed, ctl: { refuse: [LIVE + LIB] } });
      const w = await open(ctx, env.URL), page = w.page;
      const s = await first(page, seed);
      ok(markerOk(s.mark.m) && J(s.mark.m.failed) === J([LIB]), 'first start: ' + LIB + ' did not fit: ' + counts(s.mark.m));
      // room again; the Woodshed saves a score, as it does after an import
      const mineRaw = await page.evaluate(([LIVE, LIB, own]) => { __ctl({}); App.store.set(LIB, own); return __store.raw(LIVE + LIB); }, [LIVE, LIB, own]);
      ok(mineRaw === J(own), '2.0 then stores its own ' + LIB + ' (one score made in 2.0): ' + short(mineRaw));
      await reload(page);
      const look = () => page.evaluate(([LIVE, MARK, LIB]) => ({ toast: __toast(), now: __store.raw(LIVE + LIB), tries: __store.touched(LIVE + LIB), mark: __mark(LIVE), markWrites: __store.touched(LIVE + MARK) }), [LIVE, MARK, LIB]);
      let t = await look();
      ok(t.now === mineRaw && t.tries.length === 0, 'the next start does not overwrite it and does not try: no write to ' + LIVE + LIB + lines(t.tries));
      ok(markerOk(t.mark.m) && t.mark.m.failed.length === 0 && J(t.mark.m.kept) === J([LIB]), 'the key moved from failed to kept: ' + counts(t.mark.m));
      ok(!NOTICE.test(t.toast), 'nothing is missing any more, so no notice: "' + t.toast + '"');
      const c = await backupCard(page), k = INFO_KEPT.exec(c.text);
      ok(c.seen && !!k && +k[1] === 1 && k[2] === LIB && !/did not fit/.test(c.text), 'Settings › Backup says that 2.0 has its own data there and that Copy again would replace it: "' + c.text + '"');
      const kept = t.mark.raw;
      await reload(page);
      t = await look();
      ok(t.now === mineRaw && t.tries.length === 0 && t.mark.raw === kept && t.markWrites.length === 0, 'the start after that leaves it alone as well: not retried, the marker not rewritten' + lines(t.tries.concat(t.markWrites)));
      ok(w.errs.length === 0, 'no page error (2.0 took the key)' + lines(w.errs));
    }

    console.log('  (d2) instead of (c): the live app removes that key before the next start');
    {
      const seed = bigProfile(false);
      const ctx = await profile(browser, { old: seed, ctl: { refuse: [LIVE + LIB] } });
      const w = await open(ctx, env.URL), page = w.page;
      const s = await first(page, seed);
      ok(markerOk(s.mark.m) && J(s.mark.m.failed) === J([LIB]), 'first start: ' + LIB + ' did not fit: ' + counts(s.mark.m));
      // room again, but the source is gone (the user deleted those scores in the live app)
      await page.evaluate(([OLD, LIB]) => { __ctl({}); __store.drop(OLD + LIB); }, [OLD, LIB]);
      await reload(page);
      const t = await page.evaluate(([LIVE, LIB]) => ({ toast: __toast(), now: __store.raw(LIVE + LIB), tries: __store.touched(LIVE + LIB), mark: __mark(LIVE) }), [LIVE, LIB]);
      ok(t.now === null && t.tries.length === 0, 'nothing is left to copy: no write to ' + LIVE + LIB + ', and it is not there' + lines(t.tries));
      ok(markerOk(t.mark.m) && t.mark.m.failed.length === 0 && t.mark.m.kept.length === 0 && t.mark.m.copied === s.mark.m.copied,
        'the key leaves the failed list: it is not kept and not counted as copied: ' + counts(t.mark.m));
      ok(!NOTICE.test(t.toast) && w.errs.length === 0, 'so the notice stops: "' + t.toast + '"' + lines(w.errs));
    }

    console.log('  (e) storage fully blocked');
    {
      // the browser refuses site data: touching localStorage throws
      let ctx = await profile(browser, { blocked: true });
      let w = await open(ctx, env.URL), page = w.page;
      let h = await health(page);
      ok(w.errs.length === 0 && h.active === 'quiz' && healthy(h), 'localStorage itself throws: the app still starts, on Exercises, with every module loaded: ' + said(h) + lines(w.errs));
      const st = await page.evaluate(async () => {
        const threw = [], call = (name, fn) => { try { return fn(); } catch (e) { threw.push(name + ': ' + e.name); return undefined; } };
        const o = { get: call('get', () => App.store.get('fb.root', 9)), keys: call('keys', () => App.store.keys()), raw: call('raw', () => App.store.raw('fb.root')), info: call('importInfo', () => App.store.importInfo()) };
        call('set', () => App.store.set('fb.root', 4)); call('setRaw', () => App.store.setRaw('zz.raw', 'x'));
        o.after = call('get', () => App.store.get('fb.root', 9));
        App.switchTo('settings'); await __wait(250);
        o.settings = __seen('settings'); o.toast = __toast(); o.threw = threw;
        return o;
      });
      ok(st.threw.length === 0 && st.get === 9 && st.after === 9 && J(st.keys) === '[]' && st.raw === null,
        'no call of the store throws there: get gives its fallback, keys() is empty, raw is null, set and setRaw are dropped: ' + J([st.get, st.after, st.keys, st.raw]) + lines(st.threw));
      ok(st.settings && w.errs.length === 0, 'Settings opens (its Backup card reads the copy\'s marker; here: ' + counts(st.info) + '; notice: "' + st.toast + '")' + lines(w.errs));
      // the store is full to the last character: reading works, every write is refused, the 1.x data is there
      ctx = await profile(browser, { old: KEPT, ctl: { refuseAll: true } });
      w = await open(ctx, env.URL); page = w.page;
      h = await health(page);
      const s = await page.evaluate(([OLD, LIVE]) => ({ live: Object.keys(__store.dump(LIVE)), old: __store.dump(OLD), tried: __writes.filter(x => x.refused).length, info: App.store.importInfo(), toast: __toast() }), [OLD, LIVE]);
      ok(w.errs.length === 0 && healthy(h), 'every write refused (' + s.tried + ' tried): the app still starts with a visible panel: ' + said(h) + lines(w.errs));
      ok(!!s.info && s.info.copied === 0 && s.info.failed.length === nKept && noticed(s.toast, nKept),
        'the marker could not be stored either, yet the app knows what its copy did (importInfo, from memory): all ' + nKept + ' items wait, and the start notice says so: ' + (s.info ? s.info.failed.length + ' failed' : 'no info'));
      ok(s.live.length === 0 && diff(KEPT, s.old).length === 0, 'nothing is stored under the 2.0 prefix, and the 1.x data is all there (what the app knows of its copy: ' + counts(s.info) + '; notice: "' + s.toast + '")' +
        lines(s.live.concat(diff(KEPT, s.old))));
    }

    console.log('  (f) a page\'s default is not taken for 2.0\'s own data: three keys that a page fills when it finds them empty');
    {
      // the Charts page stores a blank first chart, the Plan page a starter student and an empty session for today,
      // each when its key is empty. Under a key that still waits for its copy that would end the retry (case d)
      const WAIT = ['cc.charts', 'pp.students', 'pp.sessions'];
      // the control, and the source of valid Plan data: a browser with nothing waiting does store the three defaults
      let ctx = await profile(browser, { live: FLAGS });
      let w = await open(ctx, env.URL), page = w.page;
      const dflt = await page.evaluate(([LIVE, WAIT]) => WAIT.map(k => __store.raw(LIVE + k)), [LIVE, WAIT]);
      ok(dflt.every(v => typeof v === 'string' && v.length > 2), 'control: with nothing waiting, the start stores a default under each of ' + WAIT.join(', ') + ': ' + J(dflt.map(v => short(v, 40))));
      if (!dflt.every(v => typeof v === 'string')) throw new Error('no defaults to build the 1.x Plan data from');
      // a 1.x profile whose three values are too large for the first group: 15 charts, 14 students, 70 days of sessions
      const student = JSON.parse(dflt[1])[0], today = JSON.parse(dflt[2]), tk = Object.keys(today)[0];
      const day = i => new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
      const sessions = {};
      for (let i = 0; i < 70; i++) { const key = 'stu0/' + day(i) + '/' + today[tk].plan + '/' + today[tk].instrument; sessions[key] = Object.assign({}, today[tk], { key, day: day(i), student: 'stu0' }); }
      const seed = Object.assign(bigProfile(false), {
        'pp.students': J(Array.from({ length: 14 }, (_, i) => Object.assign({}, student, { id: 'stu' + i, name: 'Student ' + i }))),
        'pp.sessions': J(sessions)
      });
      const small = WAIT.filter(k => seed[k].length <= SMALL);
      if (small.length) throw new Error('test setup: not large enough to be copied after the small keys: ' + small.join(', '));
      ctx = await profile(browser, { old: seed, ctl: { refuse: WAIT.map(k => LIVE + k) } });
      w = await open(ctx, env.URL); page = w.page;
      const s = await first(page, seed), src = {}; WAIT.forEach(k => { src[k] = seed[k]; });
      ok(markerOk(s.mark.m) && J(s.mark.m.failed.slice().sort()) === J(WAIT.slice().sort()), 'first start: the three did not fit: ' + counts(s.mark.m));
      // room again from here on: a default would be stored now, if a page tried
      const waits = await page.evaluate(async ([LIVE, WAIT]) => {
        __ctl({});
        const o = { waiting: WAIT.map(k => typeof App.store.waiting === 'function' && App.store.waiting(k)), other: typeof App.store.waiting === 'function' && App.store.waiting('fb.root'), pages: [] };
        for (const id of ['chart', 'practiceplan', 'quiz', 'chart', 'practiceplan']) { App.switchTo(id); await __wait(200); o.pages.push(App.active === id && __seen(id)); }
        o.chart = window.SLChart ? SLChart.chart().title : null;
        o.students = document.querySelectorAll('#pp-student option').length;
        o.stored = WAIT.filter(k => __store.raw(LIVE + k) !== null);
        o.sets = WAIT.map(k => __writes.filter(x => x.op === 'set' && x.key === LIVE + k).map(x => x.refused || 'stored'));
        return o;
      }, [LIVE, WAIT]);
      ok(J(waits.waiting) === J([true, true, true]) && waits.other === false, 'App.store.waiting(key) is true for each of them and false for a key that arrived: ' + J([waits.waiting, waits.other]));
      ok(waits.pages.every(Boolean) && waits.chart === 'My first chart' && waits.students === 1, 'the Charts page and the Plan page open, each on its default (a blank first chart, one starter student): ' + J([waits.pages, waits.chart, waits.students]));
      ok(waits.stored.length === 0 && waits.sets.every(x => J(x) === J(['refused'])), 'neither stored that default: the three keys are still empty in the 2.0 store, and the only write ever tried was the copy\'s own: ' + J(waits.sets) +
        lines(waits.stored.map(k => 'stored: ' + k)));
      await reload(page);
      const t = await page.evaluate(async ([LIVE, src]) => {
        const o = { toast: __toast(), rep: __copied(LIVE, src), mark: __mark(LIVE) };
        App.switchTo('chart'); await __wait(200);
        o.charts = document.querySelectorAll('#cc-pick option').length;
        App.switchTo('practiceplan'); await __wait(200);
        o.students = document.querySelectorAll('#pp-student option').length;
        return o;
      }, [LIVE, src]);
      const a = arrived(t.rep, WAIT);
      ok(clean(a) && markerOk(t.mark.m) && t.mark.m.failed.length === 0 && t.mark.m.kept.length === 0, 'the next start copies all three, byte for byte: nothing failed, nothing kept: ' + counts(t.mark.m) + told(a));
      ok(t.charts === 15 && t.students === 14 && !NOTICE.test(t.toast), 'and the pages show the 1.x data: 15 charts, 14 students, no notice: ' + J([t.charts, t.students]) + ' "' + t.toast + '"');
      ok(w.errs.length === 0, 'no page error (defaults under waiting keys)' + lines(w.errs));
    }

    console.log('  (g) a look is not an edit: soundLAB Gear and Jam under keys that still wait');
    {
      // Gear stores whole blobs as it goes: the Deck's settings with the sub-tab last looked at (midihub.deck), its
      // button states with the bank and program the synth sent last (midihub.deckvals), the knob values per Part
      // (midihub.kv, also flushed whenever the window is hidden), the Helix knobs (hx.kv). Jam saves all of its
      // keys on any change. None of that is the user's data while the key still waits for its copy.
      const KV = {}; for (let p = 0; p < 16; p++) { KV[p] = {}; [74, 71, 73, 72, 91, 93, 7, 10].forEach((cc, i) => { KV[p][cc] = (p * 7 + i * 5) % 128; }); }
      const DECK = { v: 1, tab: 'knobs', settleMs: 300, pace: 2, maps: { generic: { ctl: {}, custom: Array.from({ length: 12 }, (_, i) => ({ id: 'u' + i, name: 'My control ' + i, kind: 'cc', scope: 'part', num: 20 + i, conf: 'learned', min: 0, max: 127 })), pages: [], banks: [] } } };
      const VALS = { v: 1, ctl: { 'generic/0': { sustain: 127 } }, lastBank: null };
      const SONG = [{ id: 'a', on: true, repeats: 2, barsPerChord: 1, chords: [{ d: 6 }, { d: 4 }, { d: 1 }, { d: 5 }] }];
      const GEAR = { 'midihub.kv': J(KV), 'midihub.deck': J(DECK), 'midihub.deckvals': J(VALS), 'hx.kv': J([10, 20, 30, 40, 50, 60, 70, 80]) };
      const JAM = { 'jam2.sections': J(SONG) };
      const GKEYS = Object.keys(GEAR), WAIT = GKEYS.concat(Object.keys(JAM));
      const base = Object.assign({}, FLAGS, { 'gear.told': 'true', 'jam2.migr': 'true', 'jam2.energy': '2' });
      // a look around Gear: every Deck sub-tab, what a synth and the Helix send by themselves (a sound chosen and a knob
      // turned on the instrument), the Hub and the Helix page, then another browser tab in front and the page closed
      const lookGear = page => page.evaluate(async () => {
        const raw = bytes => App.emit('midi:raw', { bytes: bytes, portId: 'in-test' });
        const o = { tabs: 0 };
        App.switchTo('deck'); await __wait(250);
        for (const b of Array.from(document.querySelectorAll('#sdk-tabs button'))) { b.click(); o.tabs++; await __wait(80); }
        raw([0xB0, 0, 63]); raw([0xB0, 32, 5]); raw([0xC0, 7]); raw([0xB0, 74, 90]);
        App.switchTo('midihub'); await __wait(250);
        raw([0xB0, 74, 91]); raw([0xC0, 8]);
        App.switchTo('helix'); await __wait(250);
        if (window.SLHelix) SLHelix.onMidiIn([0xB0, 38, 77]);
        await __wait(450); // the write timers of the Hub (200 ms) and the Deck (300 ms)
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('pagehide'));
        await __wait(150);
        o.knob = window.SLMidiHub ? SLMidiHub.api.kv(74) : null; o.helix = window.SLHelix ? SLHelix.st.kv[0] : null;
        return o;
      });
      // one change in Jam that is not the song: the energy, Push
      const jamEnergy = page => page.evaluate(async () => {
        App.switchTo('jam'); await __wait(250);
        const b = document.querySelector('#panel-jam button[data-jen="3"]');
        if (b) b.click();
        await __wait(120);
        return !!b && App.active === 'jam';
      });
      const stored = (page, keys) => page.evaluate(([LIVE, keys]) => keys.filter(k => __store.raw(LIVE + k) !== null), [LIVE, keys]);

      // the control: with nothing waiting, the same look and the same change DO store all five
      let ctx = await profile(browser, { live: base });
      let g = await open(ctx, env.GEAR_URL);
      const seen0 = await lookGear(g.page), st0 = await stored(g.page, GKEYS);
      ok(seen0.tabs >= 4 && J(st0) === J(GKEYS), 'control: with nothing waiting, a look around Gear (' + seen0.tabs + ' Deck tabs, a synth\'s and the Helix\'s own messages, the window hidden) stores ' + GKEYS.join(', ') + ': ' + J(st0));
      let m0 = await open(ctx, env.URL);
      const none0 = await stored(m0.page, ['jam2.sections']), jam0 = await jamEnergy(m0.page), sj0 = await stored(m0.page, ['jam2.sections']);
      ok(jam0 && none0.length === 0 && J(sj0) === J(['jam2.sections']), 'control: and one tap on Jam\'s energy stores the whole Jam state, the song included (jam2.sections was not stored before it): ' + J([none0, sj0]));

      // a profile whose five values did not fit at the first start (soundLAB Gear is opened first)
      const seed = Object.assign({}, base, GEAR, JAM);
      ctx = await profile(browser, { old: seed, ctl: { refuse: WAIT.map(k => LIVE + k) } });
      g = await open(ctx, env.GEAR_URL);
      const s = await first(g.page, seed);
      ok(markerOk(s.mark.m) && J(s.mark.m.failed.slice().sort()) === J(WAIT.slice().sort()), 'first start, in Gear: the five did not fit: ' + counts(s.mark.m));
      await g.page.evaluate(() => __ctl({})); // room again from here on
      const seen = await lookGear(g.page);
      const after = await g.page.evaluate(([LIVE, GKEYS]) => ({ stored: GKEYS.filter(k => __store.raw(LIVE + k) !== null),
        sets: GKEYS.map(k => __writes.filter(x => x.op === 'set' && x.key === LIVE + k).map(x => x.refused || 'stored')) }), [LIVE, GKEYS]);
      ok(seen.tabs >= 4 && seen.knob === 91 && seen.helix === 77, 'the same look: the pages work on what the instruments sent (the Hub\'s knob shows 91, the Helix knob 77): ' + J(seen));
      ok(after.stored.length === 0 && after.sets.every(x => J(x) === J(['refused'])), 'but none of it was stored: the four Gear keys are still empty, and the only write ever tried was the copy\'s own: ' + J(after.sets) +
        lines(after.stored.map(k => 'stored: ' + k)));
      // soundLAB in the same browser. Opening it is a start, so the copy is tried again: still no room at that moment, room after it
      const full = WAIT.map(k => LIVE + k);
      await g.page.evaluate(full => __ctl({ refuse: full }), full);
      m0 = await open(ctx, env.URL);
      await m0.page.evaluate(() => __ctl({}));
      const jam = await jamEnergy(m0.page);
      const sj = await m0.page.evaluate(LIVE => ({ energy: __store.raw(LIVE + 'jam2.energy'), song: __store.raw(LIVE + 'jam2.sections') }), LIVE);
      ok(jam && sj.energy === '3' && sj.song === null, 'in Jam the energy is stored (what the user changed) and the song is not (the default it shows meanwhile is not the user\'s): ' + J(sj));
      // the next start: all five arrive
      await reload(m0.page);
      const src = Object.assign({}, GEAR, JAM);
      const t = await m0.page.evaluate(([LIVE, src]) => ({ toast: __toast(), rep: __copied(LIVE, src), mark: __mark(LIVE) }), [LIVE, src]);
      const a = arrived(t.rep, WAIT);
      ok(clean(a) && markerOk(t.mark.m) && t.mark.m.failed.length === 0 && t.mark.m.kept.length === 0 && !NOTICE.test(t.toast),
        'the next start copies all five, byte for byte: nothing failed, nothing kept, no notice: ' + counts(t.mark.m) + told(a));
      ok(g.errs.length === 0 && m0.errs.length === 0, 'no page error (Gear and Jam under waiting keys)' + lines(g.errs.concat(m0.errs)));

      // what the user DOES change is 2.0's own data, as before: a knob turned on screen, another style picked in Jam
      ctx = await profile(browser, { old: seed, ctl: { refuse: WAIT.map(k => LIVE + k) } });
      g = await open(ctx, env.GEAR_URL);
      await g.page.evaluate(async () => { __ctl({}); App.switchTo('midihub'); await __wait(250); SLMidiHub.api.turn(74, 101); await __wait(350); });
      await g.page.evaluate(full => __ctl({ refuse: full }), full); // soundLAB's start tries the copy again: no room at that moment
      m0 = await open(ctx, env.URL);
      const picked = await m0.page.evaluate(async () => {
        __ctl({});
        App.switchTo('jam'); await __wait(250);
        const sel = document.getElementById('jam-genre'), other = Array.from(sel.options).map(x => x.value).filter(v => v !== sel.value)[0];
        sel.value = other; sel.dispatchEvent(new Event('change', { bubbles: true }));
        await __wait(120);
        return other;
      });
      const own = await m0.page.evaluate(LIVE => ({ kv: __store.raw(LIVE + 'midihub.kv'), song: __store.raw(LIVE + 'jam2.sections') }), LIVE);
      ok(typeof own.kv === 'string' && /"74":101/.test(own.kv) && typeof own.song === 'string' && own.song !== JAM['jam2.sections'],
        'an edit is stored at once: the knob the user turned (midihub.kv) and the song of the style picked in Jam (' + picked + '): ' + short(own.kv, 40) + ' / ' + short(own.song, 40));
      await reload(m0.page);
      const k = await m0.page.evaluate(LIVE => ({ mark: __mark(LIVE), kv: __store.raw(LIVE + 'midihub.kv'), song: __store.raw(LIVE + 'jam2.sections') }), LIVE);
      ok(markerOk(k.mark.m) && J(k.mark.m.kept.slice().sort()) === J(['jam2.sections', 'midihub.kv']) && k.mark.m.failed.length === 0 && k.kv === own.kv && k.song === own.song,
        'and at the next start those two are kept as 2.0\'s own (not overwritten), the other three are copied: ' + counts(k.mark.m));
    }

    console.log('  (h) a store with no room for the headroom at all: the small keys stay');
    {
      const seed = bigProfile(true);
      const small = keysOf(seed).filter(k => groupOf(k, seed[k]) === 1), large = keysOf(seed).filter(k => groupOf(k, seed[k]) > 1);
      const smallOnly = {}; small.forEach(k => { smallOnly[k] = seed[k]; });
      // room for the 1.x data, for the small values and a little more: far less than the 200,000 characters the copy wants free
      const cap = sizeOf(OLD, seed) + sizeOf(LIVE, smallOnly) + 30000;
      const ctx = await profile(browser, { old: seed, ctl: { cap } });
      const w = await open(ctx, env.URL), page = w.page;
      const s = await first(page, seed), h = await health(page), m = s.mark.m;
      const a = arrived(s.rep, small), left = large.filter(k => s.rep[k].now !== 'missing');
      ok(w.errs.length === 0 && healthy(h) && clean(a), 'every small key (' + small.length + ') arrived and stays, byte for byte: the headroom is never bought by undoing a small copy' + told(a) + lines(w.errs));
      ok(markerOk(m) && J(m.failed.slice().sort()) === J(large.slice().sort()) && m.copied === small.length && left.length === 0,
        'all ' + large.length + ' large values are in failed and none is left in the 2.0 store: ' + counts(m) + lines(left.map(k => 'still stored: ' + k)));
      ok(noticed(s.toast, large.length), 'the start notice counts them: "' + s.toast + '"');
    }

    console.log('  (i) Copy again in a store with no room to spare: nothing that was there is taken away');
    {
      const seed = bigProfile(false), n = keysOf(seed).length;
      const ctx = await profile(browser, { old: seed });
      const w = await open(ctx, env.URL), page = w.page;
      const s = await first(page, seed);
      ok(markerOk(s.mark.m) && s.mark.m.failed.length === 0 && s.mark.m.copied === n, 'first start, no limit: all ' + n + ' keys are copied: ' + counts(s.mark.m));
      // the origin fills up afterwards (the live app keeps writing): hardly any room left, then Copy again
      const r = await page.evaluate(([LIVE, seed]) => {
        __ctl({ cap: __store.used() + 20000 });
        const from = __writes.length, info = App.store.copyAgain();
        return { info, removed: __writes.slice(from).filter(x => x.op === 'remove' && x.key.indexOf(LIVE) === 0 && x.key !== LIVE + 'store.probe').map(x => x.key),
          lost: Object.keys(seed).filter(k => __store.raw(LIVE + k) !== seed[k]) };
      }, [LIVE, seed]);
      ok(r.lost.length === 0 && r.removed.length === 0, 'every key holds the source string afterwards and none was removed: the headroom is never bought with a key that was there before the run' +
        lines(r.lost.map(k => 'lost: ' + k).concat(r.removed.map(k => 'removed: ' + k))));
      ok(!!r.info && r.info.failed.length === 0 && r.info.copied === n && w.errs.length === 0, 'the fresh marker counts all ' + n + ' as copied, nothing failed: ' + counts(r.info) + lines(w.errs));
    }
  });

  // ---------------------------------------------------------------- 9
  await section('9 Settings › Backup', async () => {
    let exported = null; // the file of the first part, for the round trip in the third

    console.log('  - export');
    {
      // a 1.x profile, and a key of the beta scope that is none of this address's business
      const beta = { 'fb.root': '3' };
      const ctx = await profile(browser, { old: Object.assign({}, KEPT, REMOVED), beta });
      const w = await open(ctx, env.URL), page = w.page;
      await page.evaluate(async () => { App.switchTo('settings'); await __wait(200); });
      const [dl, stored] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }),
        page.evaluate(LIVE => { const now = __store.dump(LIVE); document.getElementById('set-backup-out').click(); return { now, version: App.version }; }, LIVE)]);
      const file = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
      const keys = Object.keys(file.keys || {});
      ok(file.app === 'soundLAB' && file.format === 2 && file.scope === LIVE && file.from === stored.version,
        'the export (' + dl.suggestedFilename() + ') is { app: "soundLAB", format: 2, from: the app version, scope: "' + LIVE + '", keys }: ' + J({ app: file.app, format: file.format, from: file.from, scope: file.scope }));
      const foreign = keys.filter(k => k.indexOf(LIVE) !== 0);
      ok(keys.length > 0 && foreign.length === 0, 'every key in it carries the current scope\'s prefix: no guitarlab.* key, no ' + BETA + '* key (' + keys.length + ' keys)' + lines(foreign));
      const want = Object.assign({}, stored.now); delete want[MARK];
      const got = {}; keys.forEach(k => { got[k.slice(LIVE.length)] = file.keys[k]; });
      ok(diff(want, got).length === 0 && !(MARK in got), 'it holds every key of this scope as the stored string, and leaves the copy\'s marker out' + lines(diff(want, got)));
      const dead = Object.keys(REMOVED).filter(k => k in got), lostKept = Object.keys(KEPT).filter(k => !(k in got));
      ok(dead.length === 0 && lostKept.length === 0, 'the ' + nKept + ' copied 1.x keys are in the file, the removed features are not' + lines(dead.map(k => 'in the file: ' + k).concat(lostKept.map(k => 'not in the file: ' + k))));
      ok(w.errs.length === 0, 'no page error (export)' + lines(w.errs));
      exported = file;
    }

    console.log('  - import of an old 1.x file');
    {
      // what 1.x exports: no format, every key under the 1.x prefix. One value is not a string, one key has no known prefix
      const keys = {};
      const kept = { 'fb.root': '4', 'met.bpm': '88', 'kl.prog': KEPT['kl.prog'], 'tr.sessions': KEPT['tr.sessions'] };
      const dead = { 'st.tracks': REMOVED['st.tracks'], 'ideas.list': REMOVED['ideas.list'], 'plugins.list': REMOVED['plugins.list'], 'tr.earBest': '17' };
      Object.keys(kept).forEach(k => { keys[OLD + k] = kept[k]; });
      Object.keys(dead).forEach(k => { keys[OLD + k] = dead[k]; });
      keys[OLD + 'zz.count'] = 443; keys['elsewhere.fb.root'] = '9';
      const ctx = await profile(browser, { live: FLAGS });
      const w = await open(ctx, env.URL), page = w.page;
      const imp = await importFile(page, { app: 'soundLAB', keys });
      const lost = Object.keys(kept).filter(k => imp.live[k] !== kept[k]), came = Object.keys(dead).filter(k => k in imp.live);
      ok(lost.length === 0, 'the ' + Object.keys(kept).length + ' kept keys of the file are restored under the new prefix, as the strings of the file (' + Object.keys(kept).join(', ') + ')' + lines(lost.map(k => k + ' = ' + short(imp.live[k]))));
      ok(came.length === 0, 'the ' + Object.keys(dead).length + ' keys of removed features are skipped (' + Object.keys(dead).join(', ') + ')' + lines(came));
      ok(new RegExp('\\b' + Object.keys(kept).length + ' settings restored\\b').test(imp.msg) && new RegExp('\\b' + Object.keys(dead).length + ' from removed features skipped\\b').test(imp.msg),
        'the message gives both counts: "' + imp.msg + '"');
      ok(Object.keys(imp.old).length === 0 && imp.elsewhere.length === 0, 'no guitarlab.* key is written: the 1.x store is as empty as before, and every write went to ' + LIVE + '*' + lines(Object.keys(imp.old).concat(imp.elsewhere)));
      ok(!('zz.count' in imp.live) && !imp.wrote.some(k => /elsewhere/.test(k)), 'a value that is not a string (zz.count) and a key without a known prefix are not written');
      ok(imp.reloaded, 'the page reloads with the restored settings');
      if (imp.reloaded) {
        const after = await page.evaluate(() => ({ root: App.store.get('fb.root', null), bar: [(document.getElementById('cx-root') || {}).value, (document.getElementById('cx-bpm') || {}).value], ran: window.__pluginRan }));
        ok(after.root === 4 && J(after.bar) === J(['4', '88']) && after.ran === undefined, 'after the reload the app runs on them (key E, 88 BPM), and the plug-in of the file did not run: ' + J(after));
      }
      ok(w.errs.length === 0, 'no page error (1.x file)' + lines(w.errs));
    }

    console.log('  - import of a beta file, then of the export above');
    {
      const keys = {};
      const vals = { 'fb.root': '10', 'met.bpm': '77', 'cc.charts': KEPT['cc.charts'] };
      Object.keys(vals).forEach(k => { keys[BETA + k] = vals[k]; });
      const ctx = await profile(browser, { live: FLAGS });
      const w = await open(ctx, env.URL), page = w.page;
      let imp = await importFile(page, { app: 'soundLAB', format: 2, from: '2.0.0', scope: BETA, keys });
      const lost = Object.keys(vals).filter(k => imp.live[k] !== vals[k]);
      ok(lost.length === 0 && /\b3 settings restored\b/.test(imp.msg), 'a beta file (scope "' + BETA + '") restores on live: its 3 keys are under ' + LIVE + '*: "' + imp.msg + '"' + lines(lost.map(k => k + ' = ' + short(imp.live[k]))));
      ok(Object.keys(imp.beta).length === 0 && Object.keys(imp.old).length === 0 && imp.elsewhere.length === 0, 'nothing is written under the beta prefix or the 1.x prefix' + lines(Object.keys(imp.beta).concat(Object.keys(imp.old), imp.elsewhere)));
      ok(imp.reloaded, 'the page reloads');
      if (imp.reloaded) {
        const root = await page.evaluate(() => App.store.get('fb.root', null));
        ok(root === 10, 'and runs on the restored key (A sharp / B flat): ' + J(root));
      }
      if (!exported) ok(false, 'the round trip needs the export of the first part, which did not happen');
      else if (imp.reloaded) {
        const n = Object.keys(exported.keys).length;
        imp = await importFile(page, exported);
        const off = Object.keys(exported.keys).filter(k => imp.live[k.slice(LIVE.length)] !== exported.keys[k]);
        ok(off.length === 0 && new RegExp('\\b' + n + ' settings restored\\b').test(imp.msg) && imp.elsewhere.length === 0,
          'the 2.0 export from before restores here in full: ' + n + ' keys, each the string of the file: "' + imp.msg + '"' + lines(off.concat(imp.elsewhere)));
      }
      ok(w.errs.length === 0, 'no page error (beta file, round trip)' + lines(w.errs));
    }

    console.log('  - Copy again');
    {
      const old = Object.assign({}, KEPT, REMOVED);
      const ctx = await profile(browser, { old });
      const w = await open(ctx, env.URL), page = w.page;
      const before = await page.evaluate(LIVE => __mark(LIVE), LIVE);
      // 2.0 is used (another key, a key of its own); so is the live 1.x app (another tempo)
      await page.evaluate(OLD => { App.store.set('fb.root', 2); App.store.set('zz.own', 'made in 2.0'); __store.put(OLD + 'met.bpm', '141'); }, OLD);
      old['met.bpm'] = '141';
      const c = await backupCard(page);
      ok(c.again === AGAIN, 'the button reads "' + AGAIN + '": ' + J(c.again));
      const one = await page.evaluate(async ([LIVE, MARK]) => {
        const b = document.getElementById('set-copy-again'), label = () => b.textContent.replace(/\s+/g, ' ').trim(), o = {};
        const state = () => [__store.raw(LIVE + 'fb.root'), __store.raw(LIVE + 'met.bpm'), __store.raw(LIVE + MARK)];
        b.click(); await __wait(60);
        o.label = label(); o.state = state();
        await __wait(3400);
        o.later = label(); o.stateLater = state();
        return o;
      }, [LIVE, MARK]);
      const untouched = J(['2', KEPT['met.bpm'], before.raw]);
      ok(one.label === AGAIN_SURE && J(one.state) === untouched, 'one tap only asks: the button reads "' + AGAIN_SURE + '" and nothing is copied: ' + J([one.label, one.state.slice(0, 2)]));
      ok(one.later === AGAIN && J(one.stateLater) === untouched, 'with no second tap within 3 s it goes back to "' + AGAIN + '", still nothing copied: ' + J(one.later));
      const reloaded = page.waitForEvent('load', { timeout: 8000 }).then(() => true, () => false);
      const two = await page.evaluate(async ([OLD, LIVE, MARK, removed, wait]) => {
        const b = document.getElementById('set-copy-again'), from = __writes.length, label = () => b.textContent.replace(/\s+/g, ' ').trim();
        const state = () => [__store.raw(LIVE + 'fb.root'), __store.raw(LIVE + 'met.bpm'), __store.raw(LIVE + MARK)];
        // a double-click: the second click comes before anybody could have read the new label
        b.click(); const mid = label(); b.click();
        const dbl = { label: label(), state: state(), busy: b.disabled };
        await __wait(wait);
        b.click(); // the answer to the label
        return { mid, dbl, root: __store.raw(LIVE + 'fb.root'), bpm: __store.raw(LIVE + 'met.bpm'), own: __store.raw(LIVE + 'zz.own'), mark: __mark(LIVE),
          dead: removed.filter(k => __store.raw(LIVE + k) !== null), old: __store.dump(OLD), oldWrites: __store.touched(OLD, from) };
      }, [OLD, LIVE, MARK, Object.keys(REMOVED), AGAIN_MIN + 100]);
      const m = two.mark.m;
      ok(two.dbl.label === AGAIN_SURE && J(two.dbl.state) === untouched && !two.dbl.busy, 'a double-click does not pass for the two taps: the button still asks and nothing is copied: ' + J([two.dbl.label, two.dbl.state.slice(0, 2)]));
      ok(two.mid === AGAIN_SURE && two.root === KEPT['fb.root'] && two.bpm === '141', 'a second tap after the label could be read overwrites: the key is the G of 1.x again, the tempo is the 141 that 1.x has by now: ' + J([two.mid, two.root, two.bpm]));
      ok(markerOk(m) && m.from === OLD && m.copied === nKept && m.failed.length === 0 && m.at >= before.m.at && two.mark.raw !== before.raw, 'a fresh marker: ' + nKept + ' copied: ' + counts(m));
      ok(two.own === J('made in 2.0') && two.dead.length === 0, 'it is a copy: a key only 2.0 has stays, and removed features are still left behind: ' + J(two.own) + lines(two.dead));
      ok(diff(old, two.old).length === 0 && two.oldWrites.length === 0, 'the 1.x store is untouched' + lines(diff(old, two.old).concat(two.oldWrites)));
      const did = await reloaded;
      ok(did, 'then the page reloads');
      if (did) {
        await up(page);
        const after = await page.evaluate(() => [App.store.get('fb.root', null), App.store.get('met.bpm', null), (document.getElementById('cx-root') || {}).value, (document.getElementById('cx-bpm') || {}).value]);
        ok(J(after) === J([7, 141, '7', '141']), 'and the app runs on the copied values: ' + J(after));
      }
      ok(w.errs.length === 0, 'no page error (Copy again)' + lines(w.errs));
    }
  });

  // ---------------------------------------------------------------- 10
  await section('10 soundLAB Gear opened first', async () => {
    // the Hub's switches as 1.x left them: rules applied to what the app hears, Thru on, channel 5
    const hub = { 'midihub.rulesIn': 'true', 'midihub.thru': 'true', 'midihub.ch': '4' };
    const old = Object.assign({}, KEPT, hub, REMOVED), kept = Object.assign({}, KEPT, hub), n = Object.keys(kept).length;
    const ctx = await profile(browser, { old });
    const w = await open(ctx, env.GEAR_URL), page = w.page;
    const h = await health(page);
    ok(h.app === 'gear' && healthy(h), 'soundLAB Gear is the first page this browser opens with 2.0: it is up with a visible panel: ' + said(h));
    const s = await page.evaluate(([OLD, LIVE, kept, removed]) => ({
      prefix: App.store.prefix, rep: __copied(LIVE, kept), there: removed.filter(k => __store.raw(LIVE + k) !== null), mark: __mark(LIVE),
      old: __store.dump(OLD), oldWrites: __store.touched(OLD), idb: __idb.slice()
    }), [OLD, LIVE, kept, Object.keys(REMOVED)]);
    const a = arrived(s.rep, Object.keys(kept)), m = s.mark.m;
    ok(s.prefix === LIVE && markerOk(m) && m.from === OLD && m.copied === n && m.skipped === nRemoved && m.failed.length === 0, 'it runs the same copy: ' + counts(m));
    ok(clean(a) && s.there.length === 0, 'the ' + n + ' kept keys are under ' + LIVE + '* byte for byte, no removed feature is' + told(a) + lines(s.there.map(k => 'stored: ' + k)));
    const seen = await page.evaluate(async () => {
      App.switchTo('midihub'); await __wait(300);
      const el = id => document.getElementById(id);
      return { active: App.active, rules: window.SLMidiHub ? SLMidiHub.rules.map(r => r.name + (r.on ? '' : ' (off)')) : null, filter: App.midiRules ? App.midiRules.active() : null, installed: !!(App.midi && App.midi.inputFilter),
        thru: !!(el('mh-thru') || {}).checked, rulesIn: !!(el('mh-rulesin') || {}).checked, ch: (el('mh-ch') || {}).value, chLabel: el('mh-chlabel') ? el('mh-chlabel').textContent : null };
    });
    ok(seen.active === 'midihub' && J(seen.rules) === J(['up', 'at', 'cc (off)']), 'the Hub sees the copied midihub.rules: three rules, two of them on: ' + J(seen.rules));
    ok(!!seen.filter && seen.filter.on === true && seen.filter.rules === 2 && seen.installed && seen.rulesIn, 'midihub.rulesIn came across: the box is ticked and the input filter is installed with the 2 enabled rules: ' + J([seen.filter, seen.installed, seen.rulesIn]));
    ok(seen.thru && seen.ch === '4' && seen.chLabel === '5', 'so did Thru and the channel: the Thru box is ticked, the Hub is on channel 5: ' + J([seen.thru, seen.ch, seen.chLabel]));
    ok(diff(old, s.old).length === 0 && s.oldWrites.length === 0 && s.idb.length === 0, 'the 1.x store is untouched and no database was opened' + lines(diff(old, s.old).concat(s.oldWrites, s.idb)));
    // soundLAB afterwards, in the same browser: one copy served both apps
    const mw = await open(ctx, env.URL), mp = mw.page;
    const t = await mp.evaluate(([LIVE, MARK]) => ({ app: App.app, mark: __mark(LIVE).raw, markWrites: __store.touched(LIVE + MARK), room: __writes.filter(x => x.op === 'set' && x.len >= 200000).length,
      root: App.store.get('fb.root', null), bar: [(document.getElementById('cx-root') || {}).value, (document.getElementById('cx-bpm') || {}).value], rules: App.midiRules ? App.midiRules.active() : null }), [LIVE, MARK]);
    ok(t.app === 'main' && t.mark === s.mark.raw && t.markWrites.length === 0 && t.room === 0, 'soundLAB, opened afterwards, does not copy again: the marker is the string Gear wrote');
    ok(t.root === 7 && J(t.bar) === J(['7', '96']) && !!t.rules && t.rules.on === true && t.rules.rules === 2, 'and it runs on the same data: the key G at 96 BPM, the Hub\'s 2 rules on what it hears: ' + J([t.root, t.bar, t.rules]));
    ok(w.errs.length === 0 && mw.errs.length === 0 && w.bad.length === 0, 'no page error and no missing file (Gear first, then soundLAB)' + lines(w.errs.concat(mw.errs, w.bad)));
  });

  await browser.close();
  console.log(fails ? '\nFAILED: ' + fails : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
