// What the pages load, what the service worker caches and what is on disk
// must agree. Pure Node, no browser, under a second.
//
// Why: sw.js installs with cache.addAll. ONE listed file that is missing
// makes the whole install fail; the old cache then keeps serving the old app
// and no page shows an error. Nothing else tests sw.js.
//
//   1. every <script src> and stylesheet in index.html and gear.html exists
//      on disk and is in sw.js ASSETS
//   2. every ASSETS entry exists on disk (and is listed once: addAll also
//      refuses a list that names the same file twice)
//   3. neither page has a <script> for a module that left the app
//   4. two apps from one codebase (A3b): index.html = soundLAB loads none of
//      the seven soundLAB Gear modules and has none of their panels;
//      gear.html = soundLAB Gear loads all seven, has exactly the four gear
//      panels, and loads the scripts both pages share in the same order
//   5. the shell markup exists twice until Phase B builds it from JavaScript
//      (plan D18): the two copies are the same, apart from the app's name
//   6. storage (A4): the prefix of the 1.x store is spelled once in js/ (the
//      STORE_LEGACY line of js/app.js) and in tests/ only by the suites listed
//      in OLD_STORE_SUITES below. Everything else goes through App.store
//      (js/) or names the 2.0 prefix (tests/)
//
// Phase A (docs/plans/phase-a/PLAN.md): A1 took out studio, arrange and
// plugins. A3b added gear.html (sections 7.1 and 7.5). A4 moved the store to
// its own prefix (sections 8.4 and 8.5).
const fs = require('fs'), path = require('path'), vm = require('vm');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const read = name => fs.readFileSync(path.join(env.ROOT, name), 'utf8');
const isFile = name => { try { return fs.statSync(path.join(env.ROOT, name)).isFile(); } catch (e) { return false; } };
const list = a => a.length ? '\n    ' + a.join('\n    ') : '';

const MAIN = 'index.html', GEAR = 'gear.html';
const PAGES = [MAIN, GEAR];
// modules removed from the app: a leftover <script> would print "failed to load" at boot
const GONE = ['studio', 'arrange', 'plugins'];
// soundLAB Gear's own modules and pages (js/app.js APPS.gear): in gear.html only
const GEAR_MODULES = ['midihub', 'synthtab', 'synthlive', 'synthdeck-maps', 'synthdeck-scope', 'synthdeck', 'helix'];
const GEAR_PANELS = ['deck', 'liveset', 'midihub', 'helix'];
// stylesheets of soundLAB pages that Gear does not have: the one line the two <head>s may differ by
const MAIN_ONLY_CSS = ['css/lumi-practice.css'];

// a path as the browser asks for it, relative to the page: no query, no hash, no './'
const local = ref => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref) ? null : path.posix.normalize(ref.replace(/[?#].*$/, ''));
const styleHref = tag => /\brel=["']stylesheet["']/i.test(tag) ? (/\bhref=["']([^"']+)["']/i.exec(tag) || [])[1] || null : null;
function refs(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m => m[1]);
  const styles = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => styleHref(m[0])).filter(Boolean);
  return { scripts: scripts.map(local).filter(Boolean), styles: styles.map(local).filter(Boolean) };
}
const moduleOf = file => path.basename(file, '.js');
const panels = html => [...html.matchAll(/<section\b[^>]*\bid=["']panel-([a-z0-9_-]+)["']/gi)].map(m => m[1]);
// CACHE and ASSETS as the worker itself builds them (run with an inert `self`),
// or read from the text when the file cannot be run that way
function worker() {
  const src = read('sw.js');
  try {
    const self = { addEventListener() {}, skipWaiting() {}, location: { origin: '', pathname: '/' }, registration: { scope: '/' }, clients: {} };
    const box = { self, caches: {}, fetch() {}, Request: function () {}, Promise, console };
    vm.createContext(box);
    vm.runInContext(src, box, { filename: 'sw.js' });
    if (Array.isArray(box.ASSETS)) return { cache: String(box.CACHE), assets: box.ASSETS.map(String) };
  } catch (e) { /* fall through to the text */ }
  const body = (/\bASSETS\s*=\s*\[([\s\S]*?)\]/.exec(src) || [])[1] || '';
  return { cache: (/\bCACHE\s*=\s*([^;\n]+)/.exec(src) || [])[1] || '', assets: [...body.matchAll(/'([^']*)'|"([^"]*)"/g)].map(m => m[1] != null ? m[1] : m[2]) };
}

console.log('# sw.js ASSETS against the disk');
const sw = worker();
// '.' is the folder itself: the server answers it with index.html
const onDisk = a => (a === '.' || a === './' || a === '') ? 'index.html' : path.posix.normalize(a);
ok(sw.assets.length > 20 && sw.assets.includes('index.html'), 'sw.js ASSETS was read: ' + sw.assets.length + ' entries, cache ' + sw.cache);
const missing = sw.assets.filter(a => !isFile(onDisk(a)));
ok(missing.length === 0, 'every ASSETS entry exists on disk (one missing file stops the offline install)' + list(missing));
const twice = sw.assets.filter((a, i) => sw.assets.indexOf(a) !== i);
ok(twice.length === 0, 'no ASSETS entry is listed twice' + list(twice));
const cached = new Set(sw.assets.map(onDisk));

const html = {}, loaded = {};
for (const name of PAGES) {
  console.log('# ' + name);
  html[name] = isFile(name) ? read(name) : '';
  const r = loaded[name] = refs(html[name]), all = r.scripts.concat(r.styles);
  ok(r.scripts.length > 10 && r.styles.length > 0, name + ' was read: ' + r.scripts.length + ' scripts, ' + r.styles.length + ' stylesheets');
  const lost = all.filter(f => !isFile(f));
  ok(lost.length === 0, name + ': every <script src> and stylesheet exists on disk' + list(lost));
  const uncached = all.filter(f => !cached.has(f));
  ok(uncached.length === 0, name + ': every <script src> and stylesheet is in sw.js ASSETS (works offline)' + list(uncached));
  ok(cached.has(name), name + ' itself is in sw.js ASSETS');
  const gone = r.scripts.filter(f => GONE.includes(moduleOf(f)));
  ok(gone.length === 0, name + ': no <script> for a removed module (' + GONE.join(', ') + ')' + list(gone));
  const again = r.scripts.filter((f, i) => r.scripts.indexOf(f) !== i);
  ok(again.length === 0, name + ': no script is loaded twice' + list(again));
}

console.log('# two apps: soundLAB (' + MAIN + ') and soundLAB Gear (' + GEAR + ')');
const isGear = f => GEAR_MODULES.includes(moduleOf(f));
const inMain = loaded[MAIN].scripts.filter(isGear);
ok(inMain.length === 0, MAIN + ' loads none of the seven soundLAB Gear modules (' + GEAR_MODULES.join(', ') + ')' + list(inMain));
// the acceptance grep of plan 7.7: no line of index.html names a gear module at all (script, panel or text)
const named = html[MAIN].split('\n').map((l, i) => (i + 1) + ': ' + l.trim()).filter(l => /midihub|synthtab|synthlive|synthdeck|helix/.test(l));
ok(named.length === 0, MAIN + ' does not name a gear module anywhere (midihub, synthtab, synthlive, synthdeck, helix)' + list(named));
const gearHas = loaded[GEAR].scripts.filter(isGear).map(moduleOf);
const gearLacks = GEAR_MODULES.filter(m => !gearHas.includes(m));
ok(gearLacks.length === 0, GEAR + ' loads all seven (Deck, Live sets and the Hub must share one document)' + list(gearLacks));
ok(gearHas.indexOf('synthdeck-maps') !== -1 && gearHas.indexOf('synthdeck-maps') < gearHas.indexOf('synthdeck'), GEAR + ': the Deck’s maps are loaded before the Deck (js/synthdeck-maps.js, then js/synthdeck.js)');
ok(loaded[GEAR].scripts.length === 18, GEAR + ' loads 18 scripts (plan 7.1): ' + loaded[GEAR].scripts.length);
// both pages boot the same shell: what they share is loaded in the same order (theory and the note palette
// before app.js, app.js before every module, help and lights last)
const both = f => loaded[MAIN].scripts.includes(f) && loaded[GEAR].scripts.includes(f);
const sharedMain = loaded[MAIN].scripts.filter(both), sharedGear = loaded[GEAR].scripts.filter(both);
ok(sharedMain.length >= 8 && sharedMain.join('|') === sharedGear.join('|'), 'the ' + sharedMain.length + ' scripts both pages load come in the same order: ' + sharedMain.map(moduleOf).join(' ') +
  (sharedMain.join('|') === sharedGear.join('|') ? '' : '\n    ' + GEAR + ': ' + sharedGear.map(moduleOf).join(' ')));
const first = n => loaded[n].scripts.slice(0, 3).map(moduleOf).join(' ');
ok(first(MAIN) === 'theory note-palette app' && first(GEAR) === 'theory note-palette app', 'both start with theory, note-palette, app (js/app.js needs the two before it): ' + first(MAIN) + ' / ' + first(GEAR));
const gearOnly = loaded[GEAR].scripts.filter(f => !both(f) && !isGear(f));
ok(gearOnly.length === 0, GEAR + ' loads nothing but shared scripts and the seven gear modules' + list(gearOnly));
// panels: a page is its id in the page list, its panel and its script, changed together (plan rule 7)
const mainPanels = panels(html[MAIN]), gearPanels = panels(html[GEAR]);
const stray = mainPanels.filter(p => GEAR_PANELS.includes(p));
ok(stray.length === 0, MAIN + ' has no panel of a gear page (' + GEAR_PANELS.join(', ') + ')' + list(stray));
const gearPages = gearPanels.filter(p => p !== 'metronome' && p !== 'lights'); // the two sheets are shell, in both pages
ok(gearPages.join('|') === GEAR_PANELS.join('|'), GEAR + ': the pages in <main> are exactly ' + GEAR_PANELS.join(', ') + ': ' + gearPages.join(', '));
const htmlTag = n => (/<html\b[^>]*>/i.exec(html[n]) || [''])[0];
ok(/\bdata-app=["']gear["']/.test(htmlTag(GEAR)) && !/\bdata-app=/.test(htmlTag(MAIN)), 'js/app.js picks the app from <html data-app>: ' + htmlTag(MAIN) + ' / ' + htmlTag(GEAR));

// ---- the shell, copied into gear.html (plan D18, 7.1) ----
// Four blocks, each cut at fixed marks and compared as text after the things that name the app are evened out:
//   head    <head> ... </head>             evened out: the <title> text; the stylesheets of soundLAB-only pages
//                                          (MAIN_ONLY_CSS) are not in gear.html
//   shell   <body> ... up to <main>        the header with the context bar, the phone tab bar, the two sheets
//                                          evened out: the text of <span class="tag">
//   footer  </main> ... up to the first <script   evened out: "soundLAB Gear" reads "soundLAB"
//   boot    the inline <script> (App.boot() and the worker registration) ... to the end of the file
// Everything else in the two files is the app's own: the <html> tag, the panels and the script list (above).
console.log('# the shell is the same markup in both pages');
function cut(name, from, to, toFirst) {
  const src = html[name], a = from ? src.indexOf(from) : 0;
  if (a < 0) return null;
  const start = a + (from ? from.length : 0);
  const b = to == null ? src.length : (toFirst ? src.indexOf(to, start) : src.lastIndexOf(to));
  return b < start ? null : src.slice(start, b);
}
// where two texts part: the line number inside the block and both lines
function parts(a, b) {
  const x = a.split('\n'), y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return '\n    line ' + (i + 1) + ' of the block\n    ' + MAIN + ': ' + String(x[i]).trim().slice(0, 160) + '\n    ' + GEAR + ': ' + String(y[i]).trim().slice(0, 160);
  return '';
}
function same(what, a, b, said) {
  const found = a != null && b != null && a.trim().length > 0;
  ok(found && a === b, what + (said ? ' ' + said : '') + (!found ? '\n    the block was not found in ' + (a == null || !a.trim() ? MAIN : GEAR) : a === b ? '' : parts(a, b)));
}
const titleRe = /<title>([^<]*)<\/title>/, tagRe = /<span class="tag">([^<]*)<\/span>/g;

// head
const headOf = n => cut(n, '<head>', '</head>');
const title = n => (titleRe.exec(headOf(n) || '') || [])[1] || '';
const dropMainCss = h => h == null ? h : h.split('\n').filter(line => { const href = styleHref(line); return !(href && MAIN_ONLY_CSS.includes(local(href))); }).join('\n');
const evenHead = h => h == null ? h : h.replace(titleRe, '<title>*</title>');
same('head: the same lines in both pages,', evenHead(dropMainCss(headOf(MAIN))), evenHead(headOf(GEAR)),
  'apart from the <title> and ' + MAIN_ONLY_CSS.join(', ') + ' (a soundLAB page’s stylesheet)');
const gearMainCss = loaded[GEAR].styles.filter(f => MAIN_ONLY_CSS.includes(f));
ok(gearMainCss.length === 0 && MAIN_ONLY_CSS.every(f => loaded[MAIN].styles.includes(f)), MAIN_ONLY_CSS.join(', ') + ' is loaded by ' + MAIN + ' and not by ' + GEAR + list(gearMainCss));
ok(/^soundLAB Gear\b/.test(title(GEAR)) && /^soundLAB\b/.test(title(MAIN)) && !/Gear/.test(title(MAIN)), 'each title names its app: "' + title(MAIN) + '" / "' + title(GEAR) + '"');

// shell
const shellOf = n => cut(n, '<body>', '<main>', true);
const tags = n => [...(shellOf(n) || '').matchAll(tagRe)].map(m => m[1]);
const evenShell = s => s == null ? s : s.replace(tagRe, '<span class="tag">*</span>');
same('shell: header, context bar, phone tab bar and the two sheets (<body> up to <main>) are the same text,', evenShell(shellOf(MAIN)), evenShell(shellOf(GEAR)),
  'apart from the tag beside the logo');
ok(tags(MAIN).length === 1 && tags(GEAR).join('|') === 'gear' && tags(MAIN)[0] !== 'gear', 'one tag beside the logo in each; Gear’s reads "gear": ' + JSON.stringify([tags(MAIN), tags(GEAR)]));
const shellIds = n => [...(shellOf(n) || '').matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const needIds = ['tabbar', 'app-switch', 'settings-btn', 'ctx-btn', 'lights-btn', 'met-btn', 'ctxbar', 'subnav', 'tabbar-m', 'sheet-metronome', 'panel-metronome', 'sheet-lights', 'panel-lights'];
const lostIds = needIds.filter(id => !shellIds(GEAR).includes(id));
ok(lostIds.length === 0, 'the block that was compared is the whole shell: tab bars, the link across, the corner tools, the context bar and both sheets are in it' + list(lostIds));

// footer
const footOf = n => cut(n, '</main>', '<script', true);
const footText = n => ((/<footer\b[^>]*>([\s\S]*?)<\/footer>/.exec(footOf(n) || '') || [])[1] || '').trim();
same('footer: the same markup and sentence,', footOf(MAIN), footOf(GEAR) == null ? null : footOf(GEAR).replace('soundLAB Gear', 'soundLAB'), 'apart from the app’s name');
ok(/^soundLAB Gear\b/.test(footText(GEAR)) && /^soundLAB\b/.test(footText(MAIN)) && !/Gear/.test(footText(MAIN)), 'each footer names its app: "' + footText(MAIN) + '" / "' + footText(GEAR) + '"');

// boot
const bootOf = n => { const at = html[n].lastIndexOf('<script>'); return at < 0 ? null : html[n].slice(at); };
same('boot: the inline script (App.boot() and the service-worker registration) and the end of the file are the same text', bootOf(MAIN), bootOf(GEAR));
ok(/App\.boot\(\);/.test(bootOf(GEAR) || '') && /serviceWorker\.register\('sw\.js'\)/.test(bootOf(GEAR) || ''), GEAR + ' boots the app and registers the one service worker (sw.js serves both pages)');

// ---- storage: the 1.x prefix is spelled in one place (plan 8.4, risk 21) ----
// 2.0 keeps its data under its own prefix (App.store.prefix) and reads the 1.x store once, at the first start.
// The live 1.x app on the same origin still owns that store. So:
//   js/     a line of code that spells the old prefix would read or write the live app's data past App.store.
//           Allowed: the one line of js/app.js that defines STORE_LEGACY. Comments do not count.
//   tests/  a suite that spells it seeds or reads keys the app no longer looks at, and passes while testing
//           nothing. Allowed: the suites of OLD_STORE_SUITES, each for the reason given there.
// "Spelled" = the word as the start of a string (a quote, the word, a dot) or inside a regular expression
// (the word, a backslash, a dot). The word alone is fine: the sampler database and old file names carry it.
console.log('# storage: the 1.x prefix is spelled once in js/, and only by two suites in tests/');
const OLD_WORD = 'guitarlab';
const spelled = new RegExp('[\'"`]' + OLD_WORD + '\\.|' + OLD_WORD + '\\\\\\.');
// suites that name the 1.x store on purpose (file in tests/ -> why). Keep it exact: a suite that stops
// needing the old prefix leaves this list.
const OLD_STORE_SUITES = {
  'storage-import.test.js': 'the one-time copy itself: it seeds the 1.x store, starts the app and compares the two stores',
  'trim.test.js': 'keys of removed features are seeded in the 1.x store, where a 1.x profile has them (untouched there, not copied to 2.0, no 1.x key written), and its Backup case imports a 1.x file'
};
// every script under a folder (.js, and the runner's .sh and .py), as a path from the repository root
function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(path.join(env.ROOT, dir), { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) out = out.concat(walk(p)); else if (e.isFile() && /\.(js|sh|py)$/.test(e.name)) out.push(p);
  }
  return out;
}
// the code of one line: nothing for a comment line, and a trailing // comment cut off (quotes are followed,
// so the // of an address inside a string stays)
function codeOf(line) {
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) return '';
  let q = '';
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = ''; }
    else if (c === '\'' || c === '"' || c === '`') q = c;
    else if (c === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}
// "file:line: text" for every line of a file that spells the old prefix
const spellings = (file, code) => read(file).split('\n').map((l, i) => ({ n: i + 1, l: code ? codeOf(l) : l }))
  .filter(x => spelled.test(x.l)).map(x => ({ file, n: x.n, text: x.l.trim().slice(0, 140) }));
const at = h => h.file + ':' + h.n + ': ' + h.text;

const jsFiles = walk('js').filter(f => /\.js$/.test(f));
const jsHits = [].concat(...jsFiles.map(f => spellings(f, true)));
const isLegacyLine = h => h.file === 'js/app.js' && /\bSTORE_LEGACY\s*=/.test(h.text);
const legacyLines = jsHits.filter(isLegacyLine), jsStray = jsHits.filter(h => !isLegacyLine(h));
ok(jsFiles.length > 30 && legacyLines.length === 1, 'js/app.js names the 1.x store on one line of code, the one that defines STORE_LEGACY (' + jsFiles.length + ' files read)' +
  (legacyLines.length === 1 ? '' : legacyLines.length ? list(legacyLines.map(at)) : '\n    no such line was found'));
ok(jsStray.length === 0, 'no other line of code in js/ spells the old prefix: everything else goes through App.store' + list(jsStray.map(at)));
// the prefix the suites seed and read back is the one js/app.js uses at the address they load
// (index.html and gear.html on the test server are the live scope, not the beta under /next/)
ok(/['"]soundlab2\.['"]/.test(read('js/app.js').split('\n').map(codeOf).join('\n')), 'js/app.js names the 2.0 prefix the suites seed (soundlab2 + dot)');

const testFiles = walk('tests');
const listed = f => path.posix.dirname(f) === 'tests' && Object.prototype.hasOwnProperty.call(OLD_STORE_SUITES, path.posix.basename(f));
const testStray = [].concat(...testFiles.filter(f => !listed(f)).map(f => spellings(f, false)));
ok(testFiles.length > 60 && testStray.length === 0, 'no file in tests/ spells the old prefix, comments included (' + testFiles.length + ' files read), apart from ' + Object.keys(OLD_STORE_SUITES).join(' and ') +
  list(testStray.map(at)));
// the list stays exact: a listed suite that is there really does name the 1.x store
// (a listed suite that is missing shows up in tests/run.sh, which runs every suite by name)
const idle = Object.keys(OLD_STORE_SUITES).filter(name => isFile('tests/' + name) && spellings('tests/' + name, false).length === 0);
ok(idle.length === 0, 'each suite on that list still needs to be on it' + list(idle.map(name => name + ': ' + OLD_STORE_SUITES[name])));

console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);
