// Note colors: by INTERVAL (scale degree, the default) or by NOTE (pitch
// class) — one App.colors service behind every page and the LUMI keybed.
// Default mode keeps today's colors (regression), the Interval | Note seg in
// Lights & help / the Fretboard settings switches every page live (fretboard
// dots + legend, Keys data-dc, Chords, Theory, the LUMI's per-key colors with
// out-of-scale keys still dark), a key other than C (pitch class, not the
// interval above the root), chord tones outside the key, the blinking next
// note off the scale, the Studio piano roll, a page that owns the keybed
// (Pads), storage that refuses writes, persistence, a custom note color,
// reset, and switching back. Fake LUMI as in lights.test.js.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

const DEG = ['#ffab47', '#e8d44d', '#7ad97a', '#4cc9b0', '#6ea8fe', '#b48ef0', '#ff85b3'];
const NOTE = ['#ff7583', '#ee9468', '#edb75a', '#f2de5f', '#c6f047', '#82ef6c', '#6cefad', '#39efef', '#6cb8ef', '#849bf5', '#a392f6', '#d27efc'];
// C major on the LUMI (C3-B4): velocity = LUMI color table index
const DEG_VEL = { 0: 23, 2: 34, 4: 60, 5: 74, 7: 97, 9: 116, 11: 6 };   // today's degree colors
const NOTE_VEL = { 0: 6, 2: 25, 4: 50, 5: 59, 7: 82, 9: 101, 11: 124 }; // NOTE_DEFAULTS, nearest LUMI color

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript(() => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    window.__sent = [];
    const inp = { id: 'in1', name: 'LUMI Keys BLOCK', onmidimessage: null };
    const out = { id: 'out1', name: 'LUMI Keys BLOCK', state: 'connected', send: b => window.__sent.push(Array.from(b)) };
    const access = { inputs: new Map([['in1', inp]]), outputs: new Map([['out1', out]]), sysexEnabled: true, onstatechange: null };
    navigator.requestMIDIAccess = () => Promise.resolve(access);
    window.__lit = () => { const l = {}; window.__sent.forEach(b => { if (b[0] === 0x90) l[b[1]] = b[2]; else if (b[0] === 0x80) delete l[b[1]]; }); return l; };
  });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await ready(page);
  return { ctx, page, errs };
}
async function ready(page, any) {
  // a reload comes back on the last page (fretboard), a fresh start on Exercises
  await page.waitForFunction(any => window.App && App.colors && App.midi && App.midi.ready && App.midi.hasOutput && (any ? !!App.active : App.active === 'quiz'), any);
}

// what every page shows for C major right now
async function snapshot(page) {
  return page.evaluate(() => {
    const o = {};
    // fretboard: the dot labelled E (display = notes) + its legend chip
    const fbDot = name => {
      const c = Array.from(document.querySelectorAll('#fb-scroll circle[r="11.5"]'))
        .find(x => x.nextElementSibling && x.nextElementSibling.textContent === name);
      return c ? c.getAttribute('fill') : null;
    };
    o.fbE = fbDot('E'); o.fbC = fbDot('C'); o.fbCs = fbDot('C#') || fbDot('Db');
    const leg = Array.from(document.querySelectorAll('#fb-legend .fb-legend-item')).find(x => /E$/.test(x.textContent.trim()));
    o.fbLegE = leg ? leg.querySelector('.legend-dot').style.background : null;
    // Keys page: data-dc on E4 (in the scale) and C#4 (not)
    const k = m => document.querySelector('#pn-svg .pn-key[data-midi="' + m + '"]');
    o.pnE = k(64) && k(64).getAttribute('data-dc');
    o.pnCs = k(61) && k(61).getAttribute('data-dc');
    o.pnLegE = (Array.from(document.querySelectorAll('#pn-legend .pn-leg')).find(x => /E$/.test(x.textContent.trim())) || { querySelector: () => ({ style: {} }) }).querySelector('.legend-dot').style.background;
    // Theory key guide: degree 3 = E; Chords: the I chip (C)
    const th = document.querySelectorAll('#panel-theory .th-note')[2];
    o.thE = th ? th.style.getPropertyValue('--deg-c').trim() : null;
    const ch = document.querySelector('.ch-inkeychip');
    o.chI = ch ? ch.style.getPropertyValue('--deg-c').trim() : null;
    // the LUMI keybed (C3-B4)
    o.lit = __lit();
    return o;
  });
}
const rgb = h => 'rgb(' + [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16)).join(', ') + ')';
const litMatches = (lit, vel) => {
  const ks = Object.keys(lit).map(Number);
  return ks.length === 14 && ks.every(m => vel[m % 12] === lit[m]);
};

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  let { ctx, page, errs } = await newPage(browser);

  console.log('# the service');
  const sv = await page.evaluate(() => {
    App.emit('fb:set', { source: 't', root: 0, scale: 'major', mode: 1 });
    App.help.set(4);
    const C = App.colors;
    const lumi = C.NOTE_DEFAULTS.map(h => App.midi.lumiColor(h));
    return { mode: C.mode(), deg: C.degrees(), notes: C.notes(), defs: C.NOTE_DEFAULTS, lumiDistinct: new Set(lumi).size,
      e: C.forNote(4, 2), out: C.forNote(1), outStep: C.forNote(1, undefined), wrap: C.forNote(16, 9) };
  });
  ok(sv.mode === 'interval', 'default mode: interval');
  ok(JSON.stringify(sv.deg) === JSON.stringify(DEG), 'degrees() = the degree defaults');
  ok(JSON.stringify(sv.notes) === JSON.stringify(NOTE) && JSON.stringify(sv.defs) === JSON.stringify(NOTE), 'notes() = NOTE_DEFAULTS (12, C..B)');
  ok(sv.lumiDistinct === 12, 'all 12 note defaults land on 12 different LUMI colors');
  ok(sv.e === DEG[2] && sv.out === null && sv.outStep === null && sv.wrap === DEG[2], 'interval: forNote(pc, step) = degree color, out of scale = null, step wraps % 7');

  console.log('# interval mode keeps today\'s colors');
  await page.evaluate(() => App.switchTo('fretboard'));
  const a = await snapshot(page);
  ok(a.fbE === DEG[2] && a.fbC === DEG[0] && a.fbCs === null, 'fretboard: E dot in degree-3 color, C in the root color, no C# dot: ' + [a.fbE, a.fbC, a.fbCs]);
  ok(a.fbLegE === rgb(DEG[2]), 'fretboard legend: E chip in degree-3 color: ' + a.fbLegE);
  ok(a.pnE === DEG[2] && a.pnCs === null, 'Keys: E4 data-dc = degree 3, C#4 none: ' + a.pnE);
  ok(a.pnLegE === rgb(DEG[2]), 'Keys legend: E in degree-3 color');
  ok(a.thE === DEG[2], 'Theory key guide: degree 3 color: ' + a.thE);
  ok(a.chI === DEG[0], 'Chords: the I chip in the root color: ' + a.chI);
  ok(litMatches(a.lit, DEG_VEL), 'LUMI: every C major key in its degree color: ' + JSON.stringify(a.lit));

  console.log('# Note mode from the Lights & help seg (live, over the fretboard)');
  const sw = await page.evaluate(() => {
    App.switchTo('lights');
    const o = { sheet: App.sheet, active: App.active };
    const seg = document.querySelector('[data-lccolmode="note"]');
    o.seg = !!seg;
    o.defActive = (document.querySelector('[data-lccolmode].active') || {}).textContent;
    let ev = null; App.on('colors', d => { ev = d; });
    if (seg) seg.click();
    o.ev = ev;
    o.mode = App.colors.mode();
    o.stored = JSON.parse(localStorage.getItem('guitarlab.fb.colorMode'));
    const act = document.querySelector('[data-lccolmode].active');
    o.nowActive = act && act.textContent;
    o.pressed = act && act.getAttribute('aria-pressed');
    const sws = Array.from(document.querySelectorAll('.lc-deg'));
    o.swatches = sws.length;
    o.sw0 = sws[0] && sws[0].querySelector('i').style.background;
    o.sw0lumi = sws[0] && sws[0].querySelectorAll('i')[1].style.background;
    o.sw0lab = sws[0] && sws[0].querySelector('b').textContent;
    o.lumiC = App.midi.lumiColor(App.colors.NOTE_DEFAULTS[0]);
    return o;
  });
  ok(sw.sheet === 'lights' && sw.active === 'fretboard' && sw.seg, 'Lights & help opens over the fretboard with an Interval | Note seg');
  ok(sw.defActive === 'Interval' && sw.nowActive === 'Note' && sw.pressed === 'true', 'seg: Interval by default, Note after the tap (aria-pressed)');
  ok(sw.mode === 'note' && sw.stored === 'note' && sw.ev && sw.ev.mode === 'note', 'stored as fb.colorMode, \'colors\' event fired: ' + JSON.stringify(sw.ev));
  ok(sw.swatches === 12 && sw.sw0 === rgb(NOTE[0]) && sw.sw0lab === 'C' && sw.sw0lumi === rgb(sw.lumiC), 'the LUMI color row shows the 12 note colors (screen over LUMI): ' + [sw.swatches, sw.sw0, sw.sw0lab]);
  const b = await snapshot(page);
  ok(b.fbE === NOTE[4] && b.fbC === NOTE[0] && b.fbCs === null, 'fretboard repainted live: E = NOTE[E], C = NOTE[C], still no C# dot: ' + [b.fbE, b.fbC]);
  ok(b.fbLegE === rgb(NOTE[4]), 'fretboard legend shows the color E actually gets: ' + b.fbLegE);
  ok(b.pnE === NOTE[4] && b.pnCs === null, 'Keys: E4 data-dc = NOTE[E], C#4 (out of scale) still uncolored: ' + b.pnE);
  ok(b.pnLegE === rgb(NOTE[4]), 'Keys legend follows');
  ok(b.thE === NOTE[4], 'Theory key guide: E chip in its note color: ' + b.thE);
  ok(b.chI === NOTE[0], 'Chords: the I chip in C\'s note color: ' + b.chI);
  ok(litMatches(b.lit, NOTE_VEL), 'LUMI: scale keys in their note colors (nearest LUMI color), out-of-scale keys dark: ' + JSON.stringify(b.lit));
  const tn = await page.evaluate(() => {
    App.help.set(1); const t = __lit();
    App.emit('fb:set', { source: 't', root: 2, scale: 'major', mode: 1 }); const d = __lit();
    App.help.set(4); const full = __lit();
    App.emit('fb:set', { source: 't', root: 0, scale: 'major', mode: 1 });
    return { t, d, full };
  });
  ok(Object.keys(tn.t).join() === '48,60' && tn.t[48] === NOTE_VEL[0], 'Tonic: the home keys in the root note\'s color: ' + JSON.stringify(tn.t));
  ok(Object.keys(tn.d).join() === '50,62' && tn.d[50] === 25, 'a new key: its root note\'s color (D): ' + JSON.stringify(tn.d));
  ok(tn.full[64] === NOTE_VEL[4] && tn.full[66] !== undefined && !tn.full[65], 'in D major the E stays E-colored, F# lights, F (out of scale) stays dark');

  // a key other than C: a note's color is its PITCH CLASS, not its interval
  // above the root (in C major the two are the same number)
  const dm = await page.evaluate(() => {
    App.emit('fb:set', { source: 't', root: 2, scale: 'major', mode: 1 });
    const fbDot = name => {
      const c = Array.from(document.querySelectorAll('#fb-scroll circle[r="11.5"]'))
        .find(x => x.nextElementSibling && x.nextElementSibling.textContent === name);
      return c ? c.getAttribute('fill') : null;
    };
    const k = m => document.querySelector('#pn-svg .pn-key[data-midi="' + m + '"]');
    const th = document.querySelectorAll('#panel-theory .th-note')[2], ch = document.querySelector('.ch-inkeychip');
    const o = { fs: fbDot('F#'), d: fbDot('D'), f: fbDot('F'), pnFs: k(66).getAttribute('data-dc'), pnF: k(65).getAttribute('data-dc'),
      th3: th && th.style.getPropertyValue('--deg-c').trim(), chI: ch && ch.style.getPropertyValue('--deg-c').trim() };
    App.emit('fb:set', { source: 't', root: 0, scale: 'major', mode: 1 });
    return o;
  });
  ok(dm.fs === NOTE[6] && dm.d === NOTE[2] && dm.f === null, 'D major, fretboard: F# = NOTE[F#], D = NOTE[D], no F dot: ' + [dm.fs, dm.d, dm.f]);
  ok(dm.pnFs === NOTE[6] && dm.pnF === null, 'D major, Keys: F#4 data-dc = NOTE[F#], F4 uncolored: ' + [dm.pnFs, dm.pnF]);
  ok(dm.th3 === NOTE[6] && dm.chI === NOTE[2], 'D major, Theory degree 3 = NOTE[F#], Chords I chip = NOTE[D]: ' + [dm.th3, dm.chI]);

  // the blinking NEXT note off the scale: its own note color (by interval: the root's)
  const gd = await page.evaluate(() => {
    App.midi.guide(60, 61);
    const o = { now: __lit()[60], note: __lit()[61] };
    App.colors.setMode('interval'); o.int = __lit()[61];
    App.colors.setMode('note');
    App.midi.guide(null, null); o.clear = __lit()[61];
    return o;
  });
  ok(gd.now === 127 && gd.note === 14 && gd.int === DEG_VEL[0] && gd.clear === undefined, 'LUMI next note C# (off the scale) blinks in C#’s note color (14), by interval in the root’s (23): ' + JSON.stringify(gd));

  // chord tones outside the key: their note color by note, NON_KEY grey by interval
  const chd = await page.evaluate(() => {
    const r = document.getElementById('ch-ex-root'), q = document.getElementById('ch-ex-quality');
    r.value = '2'; r.dispatchEvent(new Event('change'));
    q.value = '7'; q.dispatchEvent(new Event('change'));
    const chips = () => Array.from(document.querySelectorAll('.ch-tonechip'));
    const tones = () => chips().map(c => c.style.getPropertyValue('--deg-c').trim());
    const ii = () => document.querySelectorAll('.ch-inkeychip')[1].style.getPropertyValue('--deg-c').trim();
    const o = { names: chips().map(c => c.textContent), note: tones(), iiN: ii() };
    App.colors.setMode('interval'); o.int = tones(); o.iiI = ii();
    App.colors.setMode('note');
    return o;
  });
  ok(chd.names.length === 4 && /F#$/.test(chd.names[1]), 'Chords: D7 loaded in C major: ' + chd.names.join(' '));
  ok(chd.note[0] === NOTE[2] && chd.note[1] === NOTE[6] && chd.iiN === NOTE[2], 'Note mode: D7’s F# (out of the key) in F#’s note color, D and the ii chip in D’s: ' + chd.note.join(' '));
  ok(chd.int[0] === DEG[1] && chd.int[1] === '#8f867c' && chd.iiI === DEG[1], 'Interval mode: the F# outside the key is grey, D = degree 2: ' + chd.int.join(' '));

  // Studio piano roll: the same service (a fresh install now gets the degree
  // defaults there too — before v0.79 it had its own fallback palette)
  // across workspaces = the screen wipe; asks again until it lands (app.js
  // setSpace drops a switch that starts < ~0.8 s after the last one began:
  // that wipe's stale safety timer ends the new one before it swaps)
  const goTo = id => page.waitForFunction(id => {
    if (App.active !== id) App.switchTo(id);
    const w = document.getElementById('wipe');
    return App.active === id && (!w || w.style.display === 'none');
  }, id, { polling: 100 });
  await goTo('tracks');
  const roll = await page.evaluate(() => {
    const t = { id: 'tcolors', name: 'Colors', kind: 'synth', voice: 'keys', synth: { cutoff: 0, attack: null, release: null, glide: null },
      sampler: { rootNote: 60, loop: false, name: '' }, steps: null, notes: [{ m: 62, t: 0, d: 0.25 }, { m: 66, t: 0.5, d: 0.25 }],
      fx: { type: 'none', mix: 0.3 }, mix: { vol: 80, mute: false, solo: false } };
    DAW.engine.tracks.push(t);
    App.emit('st:edit', { trackId: t.id });
    const fills = () => Array.from(document.querySelectorAll('.st-note')).map(x => x.getAttribute('fill'));
    const o = { note: fills() };
    App.colors.setMode('interval'); o.int = fills();
    App.colors.setMode('note');
    DAW.engine.tracks.splice(DAW.engine.tracks.indexOf(t), 1);
    return o;
  });
  await goTo('fretboard');
  ok(roll.note.join() === [NOTE[2], NOTE[6]].join(), 'Studio piano roll, Note mode: D and F# in their note colors: ' + roll.note.join(' '));
  ok(roll.int.join() === [DEG[1], '#8a8a92'].join(), 'Interval mode: D = degree 2 (the shared default, not the old #ffd166), F# off the key grey: ' + roll.int.join(' '));

  console.log('# Fretboard settings editor');
  const ed = await page.evaluate(() => {
    App.closeSheet();
    const o = {};
    const act = document.querySelector('#fb-colmode [data-fbcolmode].active');
    o.seg = act && act.textContent;
    const pick = Array.from(document.querySelectorAll('#fb-colors input[data-fbncol]'));
    o.pickers = pick.length;
    o.degPickers = document.querySelectorAll('#fb-colors input[data-fbcol]').length;
    o.labels = Array.from(document.querySelectorAll('#fb-colors .fb-colpick')).map(l => l.textContent.trim());
    const e = document.querySelector('#fb-colors input[data-fbncol="4"]');
    e.value = '#2040ff';
    e.dispatchEvent(new Event('change', { bubbles: true }));
    o.stored = JSON.parse(localStorage.getItem('guitarlab.fb.noteColors'));
    o.notesE = App.colors.notes()[4];
    return o;
  });
  ok(ed.seg === 'Note' && ed.pickers === 12 && ed.degPickers === 0, 'the editor mirrors the store: Note mode, 12 note pickers: ' + ed.pickers);
  ok(ed.labels[0] === 'C' && ed.labels[1] === 'C#/Db' && ed.labels[11] === 'B', 'pickers labelled C, C#/Db … B: ' + ed.labels.join(' '));
  ok(ed.notesE === '#2040ff' && Array.isArray(ed.stored) && ed.stored.length === 12, 'a custom note color is stored (fb.noteColors)');
  const c = await snapshot(page);
  ok(c.fbE === '#2040ff' && c.pnE === '#2040ff' && c.thE === '#2040ff', 'the custom E color reaches the fretboard, the Keys page and Theory');
  ok(c.lit[52] === 106 && c.lit[64] === 106 && c.lit[48] === NOTE_VEL[0], 'and the LUMI (E keys -> its nearest blue): ' + c.lit[64]);

  console.log('# persistence');
  await page.reload();
  await ready(page, true);
  const p = await page.evaluate(() => {
    App.help.set(4);
    App.switchTo('fretboard');
    return { mode: App.colors.mode(), e: App.colors.notes()[4] };
  });
  const pr = await snapshot(page);
  ok(p.mode === 'note' && p.e === '#2040ff', 'mode and custom color survive a reload');
  ok(pr.fbE === '#2040ff' && pr.fbC === NOTE[0] && pr.pnE === '#2040ff', 'pages paint note colors right from boot');
  ok(pr.lit[60] === NOTE_VEL[0] && pr.lit[62] === NOTE_VEL[2] && !pr.lit[61], 'the LUMI too, after reconnect: ' + JSON.stringify(pr.lit));

  console.log('# the LUMI’s own display (app lights off) follows the mode');
  const nat = await page.evaluate(() => {
    // last root (0x30) / scale (0x20) color slot sent over SysEx, as hex
    const slot = reg => { let c = null; __sent.forEach(b => { if (b[0] === 0xf0 && b[6] === 0x10 && b[7] === reg && (b[8] & 0x1f) === 0x04) {
      const r = b[11] | ((b[12] & 1) << 7), g = (b[10] << 1) | ((b[9] >> 6) & 1), bl = ((b[9] & 0x3f) << 2) | ((b[8] >> 5) & 3);
      c = '#' + [r, g, bl].map(v => v.toString(16).padStart(2, '0')).join(''); } }); return c; };
    __sent.length = 0;
    App.midi.setLightsOn(false);
    const o = { root: slot(0x30), scale: slot(0x20) };
    __sent.length = 0;
    App.colors.setMode('interval');
    o.iRoot = slot(0x30); o.iScale = slot(0x20); o.iNotes = __sent.filter(b => b[0] === 0x90).length;
    App.colors.setMode('note');
    App.midi.setLightsOn(true);
    o.back = __lit()[64];
    return o;
  });
  ok(nat.root === NOTE[0] && nat.scale === NOTE[7], 'note mode: the LUMI’s root slot = C’s note color, scale slot = G (degree 5): ' + [nat.root, nat.scale]);
  ok(nat.iRoot === DEG[0] && nat.iScale === DEG[4] && nat.iNotes === 0, 'a mode switch with lights off re-sends its two colors (degree 1 + 5), no key lights: ' + [nat.iRoot, nat.iScale]);
  ok(nat.back === 106, 'lights on again: back to the app’s per-key note colors');

  // a page that owns the keybed (Pads: night mode + its 8 keys) keeps it, lights off or not
  const pd = await page.evaluate(() => {
    const modes = () => __sent.filter(b => b[0] === 0xf0 && b[6] === 0x10 && b[7] === 0x40 && (b[8] & 0x1f) === 0x02).map(b => ((b[8] >> 5) & 3) | (b[9] << 2));
    App.midi.setLightsOn(false);
    __sent.length = 0;
    App.switchTo('pads');
    const o = { active: App.active, claim: modes() };
    __sent.length = 0;
    App.colors.setMode('interval'); App.colors.setMode('note');
    o.after = modes();
    o.colFrames = __sent.filter(b => b[0] === 0xf0 && b[6] === 0x10 && (b[7] === 0x30 || b[7] === 0x20)).length;
    App.switchTo('fretboard');
    App.midi.setLightsOn(true);
    o.back = __lit()[64];
    return o;
  });
  ok(pd.active === 'pads' && pd.claim[pd.claim.length - 1] === 3, 'Pads claims the LUMI (night mode): ' + JSON.stringify(pd.claim));
  ok(pd.after.length === 0 && pd.colFrames === 0, 'a mode switch over Pads (app lights off) leaves the LUMI alone: no scale-mode or color SysEx: ' + JSON.stringify([pd.after, pd.colFrames]));
  ok(pd.back === 106, 'back on the fretboard with lights on: the per-key note colors return');

  console.log('# reset + back to Interval');
  const rs = await page.evaluate(() => {
    const o = {};
    document.getElementById('fb-col-reset').click();
    o.reset = App.colors.notes()[4];
    o.storedReset = JSON.parse(localStorage.getItem('guitarlab.fb.noteColors'));
    o.input = document.querySelector('#fb-colors input[data-fbncol="4"]').value;
    document.querySelector('#fb-colmode [data-fbcolmode="interval"]').click();
    o.mode = App.colors.mode();
    o.degPickers = document.querySelectorAll('#fb-colors input[data-fbcol]').length;
    o.pressed = document.querySelector('#fb-colmode [data-fbcolmode="interval"]').getAttribute('aria-pressed');
    App.switchTo('lights');
    o.lcActive = (document.querySelector('[data-lccolmode].active') || {}).textContent;
    o.swatches = document.querySelectorAll('.lc-deg').length;
    App.closeSheet();
    return o;
  });
  ok(rs.reset === NOTE[4] && rs.storedReset === null && rs.input === NOTE[4], 'Reset (in Note mode) restores the note defaults');
  ok(rs.mode === 'interval' && rs.degPickers === 7 && rs.pressed === 'true', 'the Fretboard seg switches back to Interval: 7 degree pickers');
  ok(rs.lcActive === 'Interval' && rs.swatches === 7, 'Lights & help mirrors it: Interval, 7 degree swatches');
  const d = await snapshot(page);
  ok(d.fbE === DEG[2] && d.fbC === DEG[0] && d.pnE === DEG[2] && d.thE === DEG[2] && d.chI === DEG[0], 'every page is back on the degree colors');
  ok(litMatches(d.lit, DEG_VEL), 'and the LUMI: ' + JSON.stringify(d.lit));
  const dg = await page.evaluate(() => {
    const e = document.querySelector('#fb-colors input[data-fbcol="2"]');
    e.value = '#2040ff';
    e.dispatchEvent(new Event('change', { bubbles: true }));
    const o = { deg: App.colors.degrees()[2], lit: __lit()[64], dc: document.querySelector('#pn-svg .pn-key[data-midi="64"]').getAttribute('data-dc') };
    document.getElementById('fb-col-reset').click();
    o.reset = App.colors.degrees()[2]; o.litReset = __lit()[64];
    return o;
  });
  ok(dg.deg === '#2040ff' && dg.lit === 106 && dg.dc === '#2040ff', 'a custom degree color still applies everywhere (Interval mode)');
  ok(dg.reset === DEG[2] && dg.litReset === DEG_VEL[4], 'and its Reset restores the degree defaults');

  console.log('# storage that refuses writes (private window, full quota)');
  const nb = await page.evaluate(() => {
    const real = Storage.prototype.setItem, o = {};
    Storage.prototype.setItem = function (k, v) { if (/^guitarlab\.fb\./.test(k)) throw new Error('QuotaExceededError'); return real.call(this, k, v); };
    try {
      App.colors.setMode('note');
      o.mode = App.colors.mode();
      o.stored = JSON.parse(localStorage.getItem('guitarlab.fb.colorMode'));
      const c = Array.from(document.querySelectorAll('#fb-scroll circle[r="11.5"]')).find(x => x.nextElementSibling && x.nextElementSibling.textContent === 'E');
      o.fbE = c && c.getAttribute('fill');
      const n = App.colors.notes(); n[4] = '#2040ff'; App.colors.setNotes(n);
      o.e = App.colors.notes()[4];
      o.pnE = document.querySelector('#pn-svg .pn-key[data-midi="64"]').getAttribute('data-dc');
      App.colors.setNotes(null); App.colors.setMode('interval');
      o.back = App.colors.mode(); o.backE = App.colors.notes()[4];
    } finally { Storage.prototype.setItem = real; }
    return o;
  });
  ok(nb.mode === 'note' && nb.stored === 'interval' && nb.fbE === NOTE[4], 'the switch still holds for the session (not stored) and repaints: ' + JSON.stringify(nb));
  ok(nb.e === '#2040ff' && nb.pnE === '#2040ff' && nb.back === 'interval' && nb.backE === NOTE[4], 'a color edit applies too, and switching back works');

  const nl = await page.evaluate(() => {
    App.store.set('midi.lumi', false); // another keyboard: no LUMI color row
    App.switchTo('lights');
    const segs = document.querySelectorAll('[data-lccolmode]');
    const o = { n: segs.length, inHelp: !!document.querySelector('.lc-sec:first-child [data-lccolmode]'), swatches: document.querySelectorAll('.lc-deg').length };
    segs[1].click(); o.mode = App.colors.mode();
    document.querySelector('[data-lccolmode="interval"]').click(); o.back = App.colors.mode();
    App.store.set('midi.lumi', null); App.closeSheet();
    return o;
  });
  ok(nl.n === 2 && nl.inHelp && nl.swatches === 0 && nl.mode === 'note' && nl.back === 'interval', 'without a LUMI the seg sits under the Help level and still switches: ' + JSON.stringify(nl));
  ok(errs.length === 0, 'no page errors: ' + errs.join(' | '));
  await ctx.close();
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
