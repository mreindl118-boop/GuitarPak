// What the page loads, what the service worker caches and what is on disk
// must agree. Pure Node, no browser, under a second.
//
// Why: sw.js installs with cache.addAll. ONE listed file that is missing
// makes the whole install fail; the old cache then keeps serving the old app
// and no page shows an error. Nothing else tests sw.js.
//
//   1. every <script src> and stylesheet in index.html exists on disk and is
//      in sw.js ASSETS
//   2. every ASSETS entry exists on disk (and is listed once: addAll also
//      refuses a list that names the same file twice)
//   3. index.html has no <script> for a module that left the app
//
// Phase A (docs/plans/phase-a/PLAN.md): A1 took out studio, arrange and
// plugins. A3b adds gear.html to PAGES below.
const fs = require('fs'), path = require('path'), vm = require('vm');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const read = name => fs.readFileSync(path.join(env.ROOT, name), 'utf8');
const isFile = name => { try { return fs.statSync(path.join(env.ROOT, name)).isFile(); } catch (e) { return false; } };
const list = a => a.length ? '\n    ' + a.join('\n    ') : '';

const PAGES = ['index.html'];
// modules removed from the app: a leftover <script> would print "failed to load" at boot
const GONE = ['studio', 'arrange', 'plugins'];

// a path as the browser asks for it, relative to the page: no query, no hash, no './'
const local = ref => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref) ? null : path.posix.normalize(ref.replace(/[?#].*$/, ''));
function refs(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m => m[1]);
  const styles = [...html.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]).filter(tag => /\brel=["']stylesheet["']/i.test(tag))
    .map(tag => (/\bhref=["']([^"']+)["']/i.exec(tag) || [])[1]).filter(Boolean);
  return { scripts: scripts.map(local).filter(Boolean), styles: styles.map(local).filter(Boolean) };
}
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

for (const name of PAGES) {
  console.log('# ' + name);
  const r = refs(read(name)), all = r.scripts.concat(r.styles);
  ok(r.scripts.length > 10 && r.styles.length > 0, name + ' was read: ' + r.scripts.length + ' scripts, ' + r.styles.length + ' stylesheets');
  const lost = all.filter(f => !isFile(f));
  ok(lost.length === 0, name + ': every <script src> and stylesheet exists on disk' + list(lost));
  const uncached = all.filter(f => !cached.has(f));
  ok(uncached.length === 0, name + ': every <script src> and stylesheet is in sw.js ASSETS (works offline)' + list(uncached));
  ok(cached.has(name), name + ' itself is in sw.js ASSETS');
  const gone = r.scripts.filter(f => GONE.includes(path.basename(f, '.js')));
  ok(gone.length === 0, name + ': no <script> for a removed module (' + GONE.join(', ') + ')' + list(gone));
}

console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
process.exit(fails ? 1 : 0);
