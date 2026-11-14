// The 2.0 design tokens (css/tokens.css) keep their own rules, and the files
// around them only move towards the tokens. Pure Node, no browser, no
// dependency, under a second.
//
// Why: Phase B rebuilds the look on the --sl-* tokens (docs/plans/phase-b/PLAN.md,
// step B1a). A token is free to change only while nothing reads it; a misspelt
// token is ignored by CSS without a sign; and a re-skin that leaves one raw
// colour or one old variable behind looks right in one theme and wrong in the
// other. No browser suite sees any of that.
//
//   T1  contrast in both themes, computed from the two blocks of css/tokens.css
//       (a translucent token is composited over what it lies on). The pair
//       list PAIRS below is the contract: text 4.5:1, graphics 3:1. Nothing
//       but those two blocks may set a colour: the list PLACES holds the
//       rules the file may have
//   T2  every var(--sl-…) in css/, js/ and the two pages names a token that
//       css/tokens.css defines
//   T3  raw colours only go down: the hex, rgb( and hsl( literals of each file
//       against RAW_CEILING; palettes that are data are on DATA_PALETTES
//   T4  old variables only go down: var(--<old name>) per file and name
//       against OLD_CEILING, for the 29 names that css/style.css defines
//   T5  css/tokens.css is the first stylesheet of both pages
//   T6  motion can be switched off: both reduce blocks exist
//   T7  --sl-deg-1 … -7 are DEGREE_DEFAULTS of js/app.js (the colours as they
//       are stored, before App.colors snaps them to the LUMI's table)
//
// T3 and T4 count code, not comments. The ceilings are the counts of the day a
// file was last converted: a count over its ceiling fails; a count under it
// passes and prints a NOTE with the new number, and the step that converted
// the file lowers the ceiling in the same commit.
//   node tests/tokens.test.js --tables     prints both tables as they stand today
const fs = require('fs'), path = require('path'), vm = require('vm');
const env = require('./env');
let fails = 0, notes = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
function note(msg) { notes++; console.log('  NOTE', msg); }
const read = name => fs.readFileSync(path.join(env.ROOT, name), 'utf8');
const isFile = name => { try { return fs.statSync(path.join(env.ROOT, name)).isFile(); } catch (e) { return false; } };
const list = a => a.length ? '\n    ' + a.join('\n    ') : '';
// every file under a folder with one ending, as a path from the repository root
function walk(dir, ext) {
  let out = [];
  for (const e of fs.readdirSync(path.join(env.ROOT, dir), { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) out = out.concat(walk(p, ext)); else if (e.isFile() && p.endsWith(ext)) out.push(p);
  }
  return out.sort();
}

const TOKENS = 'css/tokens.css', OLD_SHEET = 'css/style.css', PAGES = ['index.html', 'gear.html'];

// ---- the contract of T1 ------------------------------------------------------
// [what is drawn, the bar, the grounds it is drawn on, what it is]. A ground is a token, or [fill, surface]:
// a translucent fill lying on that surface. FOCUS is the outer colour of the --sl-focus ring.
const SURFACES = ['--sl-bg', '--sl-bg-raised', '--sl-surface', '--sl-surface-2', '--sl-surface-sunken'];
const TEXT = 4.5, GRAPHIC = 3, FOCUS = 'the focus ring';
const TINTED = SURFACES.map(s => ['--sl-accent-soft', s]);
const PAIRS = [
  ['--sl-ink', TEXT, SURFACES, 'text'],
  ['--sl-ink-soft', TEXT, SURFACES, 'secondary text, field labels'],
  ['--sl-ink-muted', TEXT, SURFACES, 'muted text'],
  ['--sl-accent-text', TEXT, SURFACES, 'amber as text'],
  ['--sl-ok', TEXT, SURFACES, 'status text'],
  ['--sl-warn', TEXT, SURFACES, 'status text'],
  ['--sl-bad', TEXT, SURFACES, 'status text'],
  ['--sl-info', TEXT, SURFACES, 'status text'],
  ['--sl-ink', TEXT, TINTED, 'text on an amber-tinted fill'],
  ['--sl-accent-text', TEXT, TINTED, 'amber text on an amber-tinted fill'],
  ['--sl-accent-ink', TEXT, ['--sl-accent'], 'the label of a primary button'],
  ['--sl-judge-perfect', TEXT, ['--sl-surface'], 'a judgement word on a card'],
  ['--sl-judge-great', TEXT, ['--sl-surface'], 'a judgement word on a card'],
  ['--sl-judge-good', TEXT, ['--sl-surface'], 'a judgement word on a card'],
  ['--sl-judge-miss', TEXT, ['--sl-surface'], 'a judgement word on a card'],
  ['--sl-line-control', GRAPHIC, SURFACES, 'the boundary of a control'],
  ['--sl-accent-deep', GRAPHIC, SURFACES, 'the dark end of a gradient, a hover border'],
  [FOCUS, GRAPHIC, SURFACES, 'the outer colour of --sl-focus'],
  ['--sl-key-line', GRAPHIC, ['--sl-key-white'], 'a key’s outline on an ivory key'],
  ['--sl-key-white', GRAPHIC, ['--sl-stage'], 'an ivory key on the stage'],
  ['--sl-nut', GRAPHIC, ['--sl-stage'], 'the neck’s nut on the stage'],
  ['--sl-ink-on-stage', TEXT, ['--sl-stage'], 'a label drawn on the stage']
];

// ---- the ceilings of T3: raw colours per file (hex, rgb(, hsl(), comments and DATA_PALETTES left out) ----
// A file that is not in the table may hold none. css/tokens.css is where the raw colours live: not counted.
const RAW_CEILING = {
  'css/lumi-practice.css': 14,
  'css/style.css': 54,
  'js/app.js': 26,
  'js/chordchart.js': 14,
  'js/chords.js': 20,
  'js/fretboard.js': 15,
  'js/helix.js': 8,
  'js/help.js': 3,
  'js/jam.js': 2,
  'js/keylessons.js': 4,
  'js/lumi-practice.js': 2,
  'js/metronome.js': 1,
  'js/midi.js': 1,
  'js/midihub.js': 6,
  'js/pads.js': 6,
  'js/performance-player.js': 9,
  'js/piano.js': 28,
  'js/practice-progress-ui.js': 3,
  'js/quiz.js': 8,
  'js/remote.js': 1,
  'js/songs.js': 1,
  'js/synthdeck-scope.js': 7,
  'js/synthdeck.js': 3,
  'js/synthlive.js': 11,
  'js/synthtab.js': 10,
  'js/theorytab.js': 4,
  'js/trainer.js': 1,
  'js/tuner.js': 3,
  'js/woodshed.js': 23
};
// Palettes that are data, not looks (plan D12): the colours of the notes. They reach an element as an inline
// custom property from App.colors and can be the user's own, so no token can stand for them. A whole file, or
// the part of a file from the first match of `from` to the next match of `to`.
const DATA_PALETTES = [
  { file: 'js/app.js', what: 'DEGREE_DEFAULTS', from: /\bvar DEGREE_DEFAULTS\s*=\s*\[/, to: /\]\s*;/,
    why: 'the seven default colours of the scale degrees (the user can change them: fb.colors)' },
  { file: 'js/app.js', what: 'NOTE_DEFAULTS', from: /\bvar NOTE_DEFAULTS\s*=\s*\[/, to: /\]\s*;/,
    why: 'the twelve default colours of the note names (fb.noteColors)' },
  { file: 'js/note-palette.js', what: 'the whole file',
    why: 'the LUMI’s 128-colour table and the arithmetic that snaps a note colour to it (its rgb() is a function)' },
  { file: 'js/pads.js', what: 'padColors()', from: /\bfunction padColors\s*\(\)\s*\{/, to: /\}/,
    why: 'the eight pad colours: the seven degree colours and a neutral one for the crash' }
];

// ---- the ceilings of T4: uses of the old variables, var(--<name>, per file and name ----
// The 29 names css/style.css defines on :root. A file or a name that is not in the table may have no use.
const OLD_NAMES = ['bg', 'panel', 'card', 'card2', 'inset', 'line', 'line-soft', 'text', 'muted', 'label', 'ctl-border',
  'accent', 'accent-dim', 'accent-glow', 'accent-soft', 'accent-line', 'accent-ink', 'warn', 'h-ctl', 'teal', 'green',
  'red', 'blue', 'purple', 'radius', 'shadow-1', 'font-body', 'font-display', 'font-condensed'];
// Not counted until Phase H redesigns soundLAB Gear: its pages keep the old look, exactly (plan D13).
const GEAR_WHY = 'a soundLAB Gear module: its pages keep the old variables until Phase H';
const OLD_EXEMPT = {
  'js/midihub.js': GEAR_WHY, 'js/synthtab.js': GEAR_WHY, 'js/synthlive.js': GEAR_WHY, 'js/synthdeck-maps.js': GEAR_WHY,
  'js/synthdeck-scope.js': GEAR_WHY, 'js/synthdeck.js': GEAR_WHY, 'js/helix.js': GEAR_WHY,
  'js/scoreplayer.js': 'the Player card of Songs: Gear’s Hub uses the same injected rules, so they wait for Phase H too'
};
const OLD_CEILING = {
  'css/lumi-practice.css': { card2: 1, line: 5, muted: 2, accent: 5, teal: 5, 'font-body': 2, 'font-condensed': 1 },
  'js/chordchart.js': { card: 1, line: 4, text: 3, muted: 4, accent: 3, 'accent-soft': 2, 'accent-line': 2, 'accent-ink': 2, 'font-body': 5, 'font-display': 2, 'font-condensed': 1 },
  'js/chords.js': { panel: 1, card2: 4, line: 12, text: 7, muted: 14, label: 1, 'ctl-border': 1, accent: 7, 'accent-dim': 1, 'accent-glow': 1, green: 2, red: 1, 'font-body': 1, 'font-display': 1, 'font-condensed': 3 },
  'js/fretboard.js': { panel: 1, card: 1, card2: 4, line: 9, text: 7, muted: 11, label: 2, 'ctl-border': 1, accent: 18, 'accent-glow': 4, 'accent-soft': 1, 'accent-line': 1, 'accent-ink': 1, 'h-ctl': 1, 'font-display': 2 },
  'js/help.js': { card: 1, muted: 1, accent: 2, 'accent-glow': 1 },
  'js/jam.js': { card: 1, card2: 1, line: 1, text: 2, muted: 2, label: 2, accent: 3, 'accent-glow': 1, 'accent-ink': 2, 'h-ctl': 2, teal: 4, red: 1, 'font-display': 1, 'font-condensed': 1 },
  'js/keylessons.js': { card: 2, card2: 2, line: 6, text: 2, muted: 15, accent: 12, 'accent-soft': 1, warn: 1, teal: 1, red: 1, 'font-body': 1, 'font-display': 4 },
  'js/learn-instruments.js': { card: 1, line: 1, label: 1, accent: 1 },
  'js/lights.js': { line: 1, muted: 4, warn: 1, 'font-body': 1 },
  'js/metronome.js': { card2: 1, line: 1, 'line-soft': 1, text: 1, muted: 2, label: 1, accent: 5, 'accent-glow': 2, 'accent-soft': 1, 'accent-line': 1, 'accent-ink': 1, 'font-display': 1 },
  'js/pads.js': { card2: 2, line: 1, text: 2, muted: 1, label: 1, accent: 1, 'font-body': 1 },
  'js/performance-player.js': { card2: 1, line: 3, muted: 2 },
  'js/piano.js': { card2: 1, line: 1, text: 1, muted: 2, accent: 7, 'font-body': 7 },
  'js/practice-progress-ui.js': { bg: 1, card2: 1, line: 5, muted: 4, accent: 3, red: 1 },
  'js/practiceplan.js': { bg: 1, inset: 2, line: 4, text: 1, muted: 4, accent: 6 },
  'js/quiz.js': { card: 7, card2: 12, line: 7, 'line-soft': 3, text: 19, muted: 42, label: 2, 'ctl-border': 3, accent: 52, 'accent-ink': 2, teal: 1, green: 9, red: 8, blue: 2, radius: 2, 'font-body': 13, 'font-display': 6 },
  'js/remote.js': { card: 1, line: 1, text: 1, accent: 1, 'accent-soft': 1, 'accent-line': 1, 'accent-ink': 1, 'h-ctl': 1, 'font-display': 1 },
  'js/settings.js': { card: 1, inset: 1, text: 4, muted: 3, label: 1, 'ctl-border': 1, accent: 4, 'accent-dim': 1, 'accent-soft': 1, 'accent-line': 1, red: 2 },
  'js/songs.js': { card2: 2, line: 1, text: 2, muted: 1, label: 1, 'ctl-border': 1, accent: 1, 'accent-glow': 1, 'accent-line': 2, 'font-body': 2 },
  'js/theorytab.js': { card: 1, card2: 2, inset: 1, line: 3, text: 4, muted: 3, label: 1, accent: 4, 'font-body': 2, 'font-condensed': 1 },
  'js/trainer.js': { muted: 1, accent: 2, 'font-body': 1, 'font-condensed': 1 },
  'js/tuner.js': { card2: 1, line: 3, text: 1, muted: 8, label: 1, 'ctl-border': 1, accent: 2, 'accent-ink': 2, 'h-ctl': 1, green: 7, red: 2 },
  'js/woodshed.js': { card: 1, card2: 3, line: 2, text: 1, muted: 1, 'ctl-border': 1, accent: 1, 'accent-line': 1, 'accent-ink': 1, 'font-display': 1, 'font-condensed': 1 }
};

// ---- reading the files: code without its comments ----
const blank = s => s.replace(/[^\n]/g, ' ');   // same length, same lines
const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, blank);
const stripHtml = s => s.replace(/<!--[\s\S]*?-->/g, blank);
// A script without its comments. Strings and regular expressions are followed, so the // of an address inside a
// string stays; a CSS comment that opens and closes inside one string (injected sheets) is a comment too. A
// slash is a regular expression when what stands before it cannot end a value. Checked below: what is left of
// every script still compiles.
const RE_AFTER = /(?:^|[^\w$.])(?:return|typeof|case|in|of|delete|void|throw|new|else|do|instanceof)$/;
function stripJs(src) {
  const next = /['"`\/]/g, n = src.length;
  let out = '', i = 0;
  while (i < n) {
    next.lastIndex = i;
    const m = next.exec(src);
    if (!m) { out += src.slice(i); break; }
    out += src.slice(i, m.index); i = m.index;
    const c = src[i], d = src[i + 1];
    let j;
    if (c === '/' && d === '/') { j = src.indexOf('\n', i); if (j < 0) j = n; out += blank(src.slice(i, j)); }
    else if (c === '/' && d === '*') { j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; out += blank(src.slice(i, j)); }
    else if (c === '/') {
      let k = out.length - 1; while (k >= 0 && /\s/.test(out[k])) k--;
      const regex = k < 0 || '(,=:[!&|?{};+-*%<>~^'.includes(out[k]) || RE_AFTER.test(out.slice(Math.max(0, k - 11), k + 1));
      j = i + 1;
      if (regex) { let cls = false; while (j < n && src[j] !== '\n' && (cls || src[j] !== '/')) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++; } j++; }
      out += src.slice(i, j);
    } else {
      j = i + 1; while (j < n && src[j] !== c && (c === '`' || src[j] !== '\n')) { if (src[j] === '\\') j++; j++; } j++;
      out += src.slice(i, j).replace(/\/\*[\s\S]*?\*\//g, blank);
    }
    i = j;
  }
  return out;
}
const cache = {};
const code = file => file in cache ? cache[file] : (cache[file] = (file.endsWith('.js') ? stripJs : file.endsWith('.css') ? stripCss : stripHtml)(read(file)));
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// a stylesheet (without comments) as rules: { media, selector, decls: [[property, value]] }
function declarations(body) {
  const out = []; let depth = 0, q = '', start = 0;
  for (let i = 0; i <= body.length; i++) {
    const c = body[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
    if (c === '"' || c === '\'') q = c; else if (c === '(') depth++; else if (c === ')') depth--;
    else if (i === body.length || (c === ';' && depth <= 0)) {
      const d = body.slice(start, i), k = d.indexOf(':');
      if (k > 0) out.push([d.slice(0, k).trim(), d.slice(k + 1).trim().replace(/\s+/g, ' ')]);
      start = i + 1;
    }
  }
  return out;
}
function cssRules(css, media) {
  const out = []; let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i); if (open < 0) break;
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const prelude = css.slice(i, open).trim().replace(/\s+/g, ' '), body = css.slice(open + 1, j - 1);
    if (/^@(?:media|supports|layer)\b/.test(prelude)) out.push(...cssRules(body, ((media || '') + ' ' + prelude).trim()));
    else out.push({ media: media || '', selector: prelude, decls: prelude[0] === '@' ? [] : declarations(body) });
    i = j;
  }
  return out;
}

// ---- colour arithmetic (WCAG 2) ----
// [r, g, b, alpha] of a hex or rgb()/rgba() value; null for anything else
function colour(v) {
  v = String(v == null ? '' : v).trim();
  let m;
  if ((m = /^#([0-9a-f]{3,4})$/i.exec(v))) { const p = [...m[1]].map(c => parseInt(c + c, 16)); return [p[0], p[1], p[2], p.length > 3 ? p[3] / 255 : 1]; }
  if ((m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(v))) return [0, 2, 4].map(k => parseInt(m[1].slice(k, k + 2), 16)).concat(m[2] ? parseInt(m[2], 16) / 255 : 1);
  if ((m = /^rgba?\(([^()]+)\)$/i.exec(v))) {
    const p = m[1].split(/[\s,\/]+/).filter(Boolean);
    const num = (s, full) => /%$/.test(s) ? parseFloat(s) / 100 * full : parseFloat(s);
    const c = p.slice(0, 3).map(s => num(s, 255)).concat(p.length > 3 ? num(p[3], 1) : 1);
    if ((p.length === 3 || p.length === 4) && c.every(x => isFinite(x))) return c;
  }
  return null;
}
const over = (fg, bg) => fg[3] >= 1 ? fg : [0, 1, 2].map(k => fg[k] * fg[3] + bg[k] * (1 - fg[3])).concat(1);
const lum = c => [0, 1, 2].map(k => c[k] / 255).map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4).reduce((s, x, k) => s + x * [0.2126, 0.7152, 0.0722][k], 0);
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// a value with every var(--name) replaced by what the theme holds; null when a name is missing
function resolve(T, value) {
  let lost = false;
  for (let n = 0; n < 8 && /var\(/.test(value); n++) {
    value = value.replace(/var\(\s*(--[\w-]+)\s*(?:,([^()]*))?\)/g, (all, name, fallback) =>
      Object.prototype.hasOwnProperty.call(T, name) ? T[name] : fallback != null ? fallback.trim() : (lost = true, ''));
  }
  return lost || /var\(/.test(value) ? null : value;
}
const tokenColour = (T, name) => Object.prototype.hasOwnProperty.call(T, name) ? colour(resolve(T, T[name])) : null;
// the colour of the outer layer of the --sl-focus ring (a list of shadows, the last one drawn outermost)
function focusColour(T) {
  const v = Object.prototype.hasOwnProperty.call(T, '--sl-focus') ? resolve(T, T['--sl-focus']) : null;
  if (!v) return null;
  const layers = v.split(/,(?![^(]*\))/), last = layers[layers.length - 1].trim();
  const m = /(#[0-9a-f]{3,8}|rgba?\([^()]*\))$/i.exec(last) || /^(#[0-9a-f]{3,8}|rgba?\([^()]*\))/i.exec(last);
  return m ? colour(m[1]) : null;
}

// ---- the counts of T3 and T4 (before any output: --tables prints them and nothing else) ----
const cssFiles = walk('css', '.css'), jsFiles = walk('js', '.js');
const RAW = /(?<![&\w])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])|\b(?:rgb|hsl)a?\(/gi;
const rawIn = text => (text.match(RAW) || []).length;
// the text of a file without its data palettes; each entry remembers how many colours it took out
function withoutPalettes(file) {
  let text = code(file);
  for (const p of DATA_PALETTES.filter(p => p.file === file)) {
    if (!p.from) { p.took = rawIn(text); text = ''; continue; }
    const a = p.from.exec(text), b = a && p.to.exec(text.slice(a.index + a[0].length));
    if (!a || !b) { p.took = -1; continue; }
    const end = a.index + a[0].length + b.index + b[0].length;
    p.took = rawIn(text.slice(a.index, end));
    text = text.slice(0, a.index) + blank(text.slice(a.index, end)) + text.slice(end);
  }
  return text;
}
const rawFiles = cssFiles.filter(f => f !== TOKENS).concat(jsFiles);
const rawCount = {};
for (const f of rawFiles) rawCount[f] = rawIn(withoutPalettes(f));
// T4: the uses of each old name, per file that is not exempt
const oldFiles = cssFiles.filter(f => f !== TOKENS && f !== OLD_SHEET).concat(jsFiles).filter(f => !Object.prototype.hasOwnProperty.call(OLD_EXEMPT, f));
const oldCount = {};
for (const f of oldFiles) {
  const c = {};
  for (const m of code(f).matchAll(/var\(\s*--([a-z][\w-]*)/gi)) if (OLD_NAMES.includes(m[1])) c[m[1]] = (c[m[1]] || 0) + 1;
  if (Object.keys(c).length) oldCount[f] = c;
}
if (process.argv.includes('--tables')) {
  const key = k => /^[a-z_$][\w$]*$/i.test(k) ? k : '\'' + k + '\'';
  console.log('const RAW_CEILING = {\n' + rawFiles.filter(f => rawCount[f]).map(f => '  \'' + f + '\': ' + rawCount[f]).join(',\n') + '\n};');
  console.log('const OLD_CEILING = {\n' + oldFiles.filter(f => oldCount[f]).map(f => '  \'' + f + '\': { ' +
    OLD_NAMES.filter(n => oldCount[f][n]).map(n => key(n) + ': ' + oldCount[f][n]).join(', ') + ' }').join(',\n') + '\n};');
  process.exit(0);
}

// ---- the tokens as the browser reads them ----
console.log('# the files were read');
const tokenRules = isFile(TOKENS) ? cssRules(code(TOKENS)) : [];
const custom = (rule, into) => { for (const [k, v] of rule.decls) if (/^--/.test(k)) into[k] = v; return into; };
const dark = {}, lightOnly = {};
for (const r of tokenRules) {
  if (r.media) continue;
  if (r.selector === ':root') custom(r, dark);
  else if (r.selector === ':root[data-theme="light"]') custom(r, lightOnly);
}
const light = Object.assign({}, dark, lightOnly);
const defined = new Set([].concat(...tokenRules.map(r => r.decls.map(d => d[0]))).filter(k => /^--sl-/.test(k)));
ok(Object.keys(dark).length > 60 && Object.keys(lightOnly).length > 10,
  TOKENS + ' was read: ' + Object.keys(dark).length + ' tokens on :root, ' + Object.keys(lightOnly).length + ' of them re-inked on :root[data-theme="light"]');
const lightStray = Object.keys(lightOnly).filter(k => !Object.prototype.hasOwnProperty.call(dark, k));
ok(lightStray.length === 0, 'every token the light block sets is also set on :root (a token of one theme only would be empty in the other)' + list(lightStray));
const notSl = [...new Set([].concat(...tokenRules.map(r => r.decls.map(d => d[0]))).filter(k => /^--/.test(k) && !/^--sl-/.test(k)))];
ok(notSl.length === 0, 'every custom property of ' + TOKENS + ' is named --sl-…' + list(notSl));
// T1, T2 and T7 are computed from the two blocks read above and from nothing else, so nothing else may set a
// token: these are the rules the file may have (null = any name), and the two media blocks set only the names
// they are for. A browser would obey any other rule (a dark-only block, a second light selector, a colour inside
// a media block) and this suite would not see it. A step that needs another rule adds it here, with its reason.
const PLACES = {
  ':root': null,
  ':root[data-theme="light"]': null,
  '@media (any-pointer: coarse) :root': ['--sl-control-h', '--sl-control-h-dense'],
  '@media (prefers-reduced-motion: reduce) :root': ['--sl-dur-fast', '--sl-dur']
};
const strayRules = [];
for (const r of tokenRules) {
  const at = (r.media + ' ' + r.selector).trim(), may = Object.prototype.hasOwnProperty.call(PLACES, at) ? PLACES[at] : undefined;
  if (may === undefined) strayRules.push(at + ': not a rule this file may have');
  else if (may) { const more = r.decls.map(d => d[0]).filter(k => !may.includes(k)); if (more.length) strayRules.push(at + ': sets ' + more.join(', ') + ' (it may set ' + may.join(', ') + ')'); }
}
ok(tokenRules.length >= Object.keys(PLACES).length && strayRules.length === 0, TOKENS + ' has no rule but ' + Object.keys(PLACES).join(' | ') +
  ', and the two media blocks set only their own names (the contrast and the degree colours are computed from the first two)' + list(strayRules));

const scripts = jsFiles.filter(f => { try { new vm.Script(code(f), { filename: f }); return false; } catch (e) { return true; } });
ok(jsFiles.length > 30 && scripts.length === 0, 'the scripts of js/ were read without their comments, and what is left of each still compiles (' + jsFiles.length + ' files)' +
  list(scripts.map(f => f + ': the comment reader of this suite (stripJs) lost its place in this file')));

// ---- T1 ----
console.log('# T1 contrast of the token pairs, both themes (text ' + TEXT + ':1, graphics ' + GRAPHIC + ':1)');
const short = name => name.replace(/^--sl-/, '');
const groundName = g => Array.isArray(g) ? short(g[0]) + ' over ' + short(g[1]) : short(g);
// the opaque colour a thing is drawn on; null when a token is missing, unreadable or translucent with nothing under it
function ground(T, g) {
  if (Array.isArray(g)) { const fill = tokenColour(T, g[0]), base = tokenColour(T, g[1]); return fill && base && base[3] >= 1 ? over(fill, base) : null; }
  const c = tokenColour(T, g);
  return c && c[3] >= 1 ? c : null;
}
let pairCount = 0;
for (const [theme, T] of [['dark', dark], ['light', light]]) {
  for (const [fg, need, grounds, what] of PAIRS) {
    const F = fg === FOCUS ? focusColour(T) : tokenColour(T, fg);
    const rows = grounds.map(g => { const B = ground(T, g); return { on: groundName(g), r: F && B ? contrast(over(F, B), B) : null }; });
    pairCount += rows.length;
    const low = rows.filter(x => x.r == null || x.r < need);
    ok(low.length === 0, theme + ': ' + fg + ' on ' + rows.map(x => x.on + ' ' + (x.r == null ? '?' : x.r.toFixed(2))).join(', ') +
      '  (' + what + ', needs ' + need + ')' +
      list(low.map(x => x.r == null ? 'cannot be computed on ' + x.on + ': a token is missing, is not a colour, or a translucent ground has no surface under it'
        : 'on ' + x.on + ': ' + x.r.toFixed(3) + ' to 1 is under ' + need + ' to 1')));
  }
}
ok(pairCount === 148, 'the pair list is whole: ' + pairCount + ' pairs were computed (74 in each theme)');
// not a pair with a bar: a fret wire is quiet on purpose (under 3:1). What must hold is the order of the two
for (const [theme, T] of [['dark', dark], ['light', light]]) {
  const S = ground(T, '--sl-stage'), on = name => { const c = tokenColour(T, name); return c && S ? contrast(over(c, S), S) : null; };
  const str = on('--sl-string'), fret = on('--sl-fret');
  ok(str != null && fret != null && str >= GRAPHIC && fret < str, theme + ': --sl-string on stage ' + (str == null ? '?' : str.toFixed(2)) + ', --sl-fret on stage ' +
    (fret == null ? '?' : fret.toFixed(2)) + '  (a string needs ' + GRAPHIC + ', and a fret wire is quieter than a string: the neck reads the same way in both themes)');
}

// ---- T2 ----
console.log('# T2 every var(--sl-…) names a token that ' + TOKENS + ' defines');
const readers = cssFiles.concat(jsFiles, PAGES.filter(isFile));
const uses = [].concat(...readers.map(f => [...code(f).matchAll(/var\(\s*(--sl-[\w-]*)/gi)].map(m => ({ file: f, name: m[1], n: lineOf(code(f), m.index) }))));
const unknown = uses.filter(u => !defined.has(u.name));
ok(defined.size > 60 && uses.length > 0 && unknown.length === 0, 'every var(--sl-…) in css/, js/ and the two pages names one of the ' + defined.size + ' tokens (' + uses.length + ' uses in ' +
  new Set(uses.map(u => u.file)).size + ' file(s)): CSS ignores a misspelt token without a sign' + list(unknown.map(u => u.file + ':' + u.n + ': var(' + u.name + ')')));

// ---- T3 ----
console.log('# T3 raw colours only go down (hex, rgb(, hsl( per file; comments and the data palettes left out)');
const rawTotal = Object.keys(RAW_CEILING).reduce((s, f) => s + (rawCount[f] || 0), 0);
for (const f of Object.keys(RAW_CEILING)) {
  const have = rawCount[f] || 0, top = RAW_CEILING[f];
  ok(have <= top, f + ': ' + have + ' raw colour(s), the ceiling is ' + top + (have > top ? '\n    a new colour comes from a --sl-* token (css/tokens.css), a note colour from App.colors' : ''));
  if (have < top) note(f + (isFile(f) ? ': lower its ceiling in RAW_CEILING from ' + top + ' to ' + have : ' is gone: take it out of RAW_CEILING'));
}
const rawStray = rawFiles.filter(f => !Object.prototype.hasOwnProperty.call(RAW_CEILING, f) && rawCount[f] > 0);
ok(rawFiles.length > 30 && rawStray.length === 0, 'no other file of css/ or js/ holds a raw colour (' + rawFiles.length + ' files read, ' + rawTotal + ' raw colours in the ' +
  Object.keys(RAW_CEILING).length + ' files of the table)' + list(rawStray.map(f => f + ': ' + rawCount[f] + ' (use a --sl-* token; a file new to the table needs a reason in the pull request)')));
const idlePalettes = DATA_PALETTES.filter(p => !(p.took > 0));
ok(idlePalettes.length === 0, 'each data palette on the allow list is there and holds colours: ' + DATA_PALETTES.map(p => p.file + ' ' + p.what + ' (' + p.took + ')').join(', ') +
  list(idlePalettes.map(p => p.file + ' ' + p.what + ': ' + (isFile(p.file) ? 'not found or without a colour' : 'the file is gone') + '. It leaves DATA_PALETTES (' + p.why + ')')));

// ---- T4 ----
console.log('# T4 old variables only go down (var(--<name>) per file, for the ' + OLD_NAMES.length + ' names ' + OLD_SHEET + ' defines)');
const oldRoot = isFile(OLD_SHEET) ? cssRules(code(OLD_SHEET)).filter(r => !r.media && r.selector === ':root') : [];
const oldDefined = [...new Set([].concat(...oldRoot.map(r => r.decls.map(d => d[0]))).filter(k => /^--/.test(k)).map(k => k.slice(2)))];
const oldNew = oldDefined.filter(k => !OLD_NAMES.includes(k)), oldLost = OLD_NAMES.filter(k => !oldDefined.includes(k));
ok(OLD_NAMES.length === 29 && oldNew.length === 0 && oldLost.length === 0, 'the names counted are the ' + oldDefined.length + ' variables ' + OLD_SHEET + ' defines on :root' +
  list(oldNew.map(k => '--' + k + ' is defined there and not counted here: a new look uses a --sl-* token, not a new old variable')
    .concat(oldLost.map(k => '--' + k + ' is counted here and no longer defined there'))));
let oldTotal = 0;
for (const f of Object.keys(OLD_CEILING)) {
  const have = oldCount[f] || {}, top = OLD_CEILING[f];
  const names = OLD_NAMES.filter(n => have[n] || top[n]);
  const sum = names.reduce((s, n) => s + (have[n] || 0), 0); oldTotal += sum;
  const over_ = names.filter(n => (have[n] || 0) > (top[n] || 0)), under = names.filter(n => (have[n] || 0) < (top[n] || 0));
  ok(over_.length === 0, f + ': ' + sum + ' use(s) of ' + names.filter(n => have[n]).length + ' old variable(s), none over its ceiling' +
    list(over_.map(n => 'var(--' + n + '): ' + (have[n] || 0) + ', the ceiling is ' + (top[n] || 0) + ' (use the --sl-* token instead)')));
  if (under.length) note(f + (isFile(f) ? ': lower OLD_CEILING to ' + under.map(n => n + ' ' + (have[n] || 0) + ' (was ' + top[n] + ')').join(', ') : ' is gone: take it out of OLD_CEILING'));
}
const oldStray = oldFiles.filter(f => !Object.prototype.hasOwnProperty.call(OLD_CEILING, f) && oldCount[f]);
ok(oldFiles.length > 30 && oldStray.length === 0, 'no other file of css/ or js/ reads an old variable (' + oldFiles.length + ' files read, ' + oldTotal + ' uses in the ' +
  Object.keys(OLD_CEILING).length + ' files of the table)' + list(oldStray.map(f => f + ': ' + Object.keys(oldCount[f]).map(n => 'var(--' + n + ') ' + oldCount[f][n]).join(', '))));
const exemptGone = Object.keys(OLD_EXEMPT).filter(f => !isFile(f)), exemptListed = Object.keys(OLD_EXEMPT).filter(f => Object.prototype.hasOwnProperty.call(OLD_CEILING, f));
ok(exemptGone.length === 0 && exemptListed.length === 0, 'not counted until Phase H: ' + Object.keys(OLD_EXEMPT).join(', ') + ' (the seven soundLAB Gear modules and the Player card), and each is there' +
  list(exemptGone.map(f => f + ' is gone: it leaves OLD_EXEMPT').concat(exemptListed.map(f => f + ' is on OLD_EXEMPT and in OLD_CEILING: one of the two'))));

// ---- T5 ----
console.log('# T5 ' + TOKENS + ' is the first stylesheet of both pages');
for (const name of PAGES) {
  const html = isFile(name) ? code(name) : '';
  // every stylesheet in document order: <link rel="stylesheet"> and <style>
  const sheets = [...html.matchAll(/<link\b[^>]*>|<style\b[^>]*>/gi)].map(m => /^<style/i.test(m[0]) ? '<style>' :
    /\brel=["']?stylesheet["']?/i.test(m[0]) ? ((/\bhref=["']([^"']+)["']/i.exec(m[0]) || [])[1] || '').replace(/[?#].*$/, '').replace(/^\.\//, '') : null).filter(s => s != null);
  ok(sheets.length > 1 && sheets[0] === TOKENS && sheets.indexOf(TOKENS, 1) < 0, name + ': ' + TOKENS + ' comes first, once (no token is read before it loads): ' + sheets.join(', '));
}

// ---- T6 ----
console.log('# T6 motion can be switched off');
const REDUCE = /prefers-reduced-motion:\s*reduce/;
const zero = v => /^0(?:m?s)?$/.test(String(v || '').trim());
const reduceTokens = custom({ decls: [].concat(...tokenRules.filter(r => REDUCE.test(r.media) && r.selector === ':root').map(r => r.decls)) }, {});
ok(zero(reduceTokens['--sl-dur']) && zero(reduceTokens['--sl-dur-fast']) && /ms$|s$/.test(dark['--sl-dur'] || '') && !zero(dark['--sl-dur']) && !zero(dark['--sl-dur-fast']),
  TOKENS + ': under prefers-reduced-motion both durations are zero (--sl-dur ' + dark['--sl-dur'] + ' -> ' + reduceTokens['--sl-dur'] + ', --sl-dur-fast ' + dark['--sl-dur-fast'] + ' -> ' + reduceTokens['--sl-dur-fast'] + ')');
const oldReduce = (isFile(OLD_SHEET) ? cssRules(code(OLD_SHEET)) : []).filter(r => REDUCE.test(r.media) && r.selector.split(',').map(s => s.trim()).includes('*'));
const off = prop => oldReduce.some(r => r.decls.some(d => d[0] === prop && /^none\s*!important$/.test(d[1])));
ok(off('animation') && off('transition'), OLD_SHEET + ': under prefers-reduced-motion every element has animation: none and transition: none, both !important');

// ---- T7 ----
console.log('# T7 the degree tokens are DEGREE_DEFAULTS of js/app.js (the stored colours, before the LUMI snap)');
const degLine = /\bvar DEGREE_DEFAULTS\s*=\s*\[([^\]]*)\]/.exec(isFile('js/app.js') ? code('js/app.js') : '');
const defaults = degLine ? (degLine[1].match(/#[0-9a-f]{6}\b/gi) || []).map(s => s.toLowerCase()) : [];
ok(defaults.length === 7, 'DEGREE_DEFAULTS was read from js/app.js: ' + (defaults.join(' ') || 'not found'));
const degs = T => [1, 2, 3, 4, 5, 6, 7].map(n => String(T['--sl-deg-' + n] || '').toLowerCase());
ok(defaults.length === 7 && degs(dark).join(' ') === defaults.join(' '), '--sl-deg-1 … --sl-deg-7 are those seven, in order: ' + degs(dark).join(' '));
const degLight = [1, 2, 3, 4, 5, 6, 7].map(n => '--sl-deg-' + n).filter(k => Object.prototype.hasOwnProperty.call(lightOnly, k));
ok(degLight.length === 0 && defined.has('--sl-deg-7') && !defined.has('--sl-deg-8'), 'there are seven of them and the light theme does not re-ink one (a note colour is the same in both themes)' + list(degLight));

if (notes) console.log(notes + ' NOTE(s): a count fell under its ceiling. Lower the ceiling in tests/tokens.test.js in the same commit (--tables prints both tables).');
console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);
