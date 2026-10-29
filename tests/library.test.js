// My library (js/library.js): local-first MIDI library mirrored to an ORPHAN 'library' branch of
// the soundLAB repo through the GitHub REST API. A fake GitHub (page routes for api.github.com and
// raw.githubusercontent.com) keeps a tree, records every request and injects conflicts and rate
// limits. Covers: no requests at boot / on other pages, listing without a key, saving a scan
// (binary + UTF-8 round trip), the orphan-branch sequence on the first write, played ideas
// (auto-save + the idea's button), the offline queue + Sync now, the 409 retry, the rate-limit
// message, rename, two-step delete, remote-only entries (Play on synth / Practice / Open as tab /
// Download) and the key never reaching the Settings backup.
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

const OWNER = 'mreindl118-boop', REPO = 'GuitarPak', KEY = 'github_pat_TEST_library_0123456789abcdef';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'ETag, Link, Location, Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Used, X-RateLimit-Resource, X-RateLimit-Reset'
};
const V = /APP_VERSION = '([^']+)'/.exec(fs.readFileSync(env.ROOT + '/js/app.js', 'utf8'))[1];
const gitSha = (buf) => crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + buf.length + '\0'), buf])).digest('hex');

// ---------------------------------------------------------------- the fake GitHub
const gh = {
  branch: null,          // null = no 'library' branch; else Map(path -> Buffer)
  blobs: new Map(), trees: new Map(), commits: new Map(), n: 0,
  log: [],               // {m, path, query, auth, body, status}
  fault: {},             // {rate: n PUTs, rate429List: n, conflict: path, delay: ms, busy409: n PUTs, hang(m, path), drop(m, path), private, stale: Map(path -> old Buffer)}
  messages: []
};
function seed(files) { gh.branch = new Map(Object.entries(files).map(([p, c]) => [p, Buffer.isBuffer(c) ? c : Buffer.from(c)])); }
function libLog() { return gh.log.filter(r => !(r.m === 'RAW' && /\/main\/version\.json$/.test(r.path))); }

async function api(route) {
  const req = route.request(), url = new URL(req.url()), m = req.method();
  const auth = req.headers()['authorization'] || '';
  let body = null;
  try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch (e) { body = null; }
  const entry = { m, path: url.pathname, query: url.search, auth, body, status: 0 };
  if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE', 'access-control-allow-headers': 'Authorization, Content-Type, Accept, X-GitHub-Api-Version' }, CORS) });
  gh.log.push(entry);
  if (gh.fault.hang && gh.fault.hang(m, url.pathname)) { entry.status = -1; return; } // never answers
  if (gh.fault.drop && gh.fault.drop(m, url.pathname)) { // GitHub does it, the answer is lost on the way back
    gh.fault.drop = null;
    await api({ request: () => req, fulfill: async () => {} });
    gh.log.pop();
    entry.status = -2;
    return route.abort('connectionreset');
  }
  if (gh.fault.private) { entry.status = 404; return route.fulfill({ status: 404, headers: Object.assign({ 'content-type': 'application/json' }, CORS), body: '{"message":"Not Found"}' }); }
  const reply = (status, obj, extra) => { entry.status = status; return route.fulfill({ status, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, CORS, extra || {}), body: JSON.stringify(obj) }); };
  const p = url.pathname.split('/').map(decodeURIComponent);
  if (p[1] !== 'repos' || p[2] !== OWNER || p[3] !== REPO) return reply(404, { message: 'Not Found' });
  if (auth && auth !== 'Bearer ' + KEY) return reply(401, { message: 'Bad credentials' });
  const authed = auth === 'Bearer ' + KEY, rest = p.slice(4);
  if (m !== 'GET' && !authed) return reply(401, { message: 'Requires authentication' });
  const files = gh.branch;
  if (rest.length === 0 && m === 'GET') return reply(200, { full_name: OWNER + '/' + REPO, private: false, default_branch: 'main', permissions: { push: authed, pull: true } });
  if (rest[0] === 'git' && rest[1] === 'trees' && m === 'GET') {
    if (gh.fault.rate429List) { gh.fault.rate429List--; return reply(429, { message: 'Too many requests' }, { 'retry-after': '120' }); }
    if (rest.slice(2).join('/') !== 'library' || !files) return reply(404, { message: 'Not Found' });
    const tree = [], dirs = new Set();
    for (const [path, buf] of files) {
      tree.push({ path, mode: '100644', type: 'blob', sha: gitSha(buf), size: buf.length });
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    }
    for (const d of dirs) tree.push({ path: d, mode: '040000', type: 'tree', sha: 'd' + crypto.createHash('sha1').update(d).digest('hex').slice(1) });
    tree.sort((a, b) => a.path < b.path ? -1 : 1);
    return reply(200, { sha: 'root' + (gh.n++), tree, truncated: false });
  }
  if (rest[0] === 'git' && rest[1] === 'blobs' && m === 'POST') {
    const buf = body.encoding === 'base64' ? Buffer.from(body.content, 'base64') : Buffer.from(body.content, 'utf8');
    const sha = gitSha(buf); gh.blobs.set(sha, buf);
    return reply(201, { sha, url: 'blob' });
  }
  if (rest[0] === 'git' && rest[1] === 'blobs' && m === 'GET') {
    let buf = gh.blobs.get(rest[2]);
    if (!buf && files) for (const b of files.values()) if (gitSha(b) === rest[2]) buf = b;
    if (!buf) return reply(404, { message: 'Not Found' });
    return reply(200, { sha: rest[2], size: buf.length, encoding: 'base64', content: buf.toString('base64').replace(/(.{60})/g, '$1\n') });
  }
  if (rest[0] === 'git' && rest[1] === 'trees' && m === 'POST') { const sha = 'tree' + (gh.n++); gh.trees.set(sha, body); return reply(201, { sha }); }
  if (rest[0] === 'git' && rest[1] === 'commits' && m === 'POST') { const sha = 'commit' + (gh.n++); gh.commits.set(sha, body); return reply(201, { sha }); }
  if (rest[0] === 'git' && rest[1] === 'refs' && m === 'POST') {
    if (files) return reply(422, { message: 'Reference already exists' });
    const commit = gh.commits.get(body.sha), tree = commit && gh.trees.get(commit.tree);
    if (!tree) return reply(422, { message: 'Object does not exist' });
    gh.branch = new Map(tree.tree.map(e => [e.path, gh.blobs.get(e.sha)]));
    return reply(201, { ref: body.ref, object: { sha: body.sha, type: 'commit' } });
  }
  if (rest[0] === 'contents') {
    const fp = rest.slice(1).join('/');
    if (m === 'GET') {
      if (!files || !files.has(fp)) return reply(404, { message: 'Not Found' });
      return reply(200, { type: 'file', path: fp, sha: gitSha(files.get(fp)), size: files.get(fp).length });
    }
    if (m === 'PUT') {
      if (gh.fault.delay) await new Promise(r => setTimeout(r, gh.fault.delay));
      if (gh.fault.rate) { gh.fault.rate--; return reply(403, { message: 'API rate limit exceeded for user ID 1.' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 900) }); }
      if (!files || body.branch !== 'library') return reply(404, { message: 'Branch not found' });
      if (gh.fault.busy409) { gh.fault.busy409--; return reply(409, { message: 'Conflict: reference update failed' }); } // the branch moved under the write
      if (gh.fault.conflict === fp) { // another device changed this file a moment ago
        gh.fault.conflict = null;
        files.set(fp, Buffer.concat([files.get(fp) || Buffer.alloc(0), Buffer.from('\n')]));
      }
      const cur = files.get(fp);
      if (cur && body.sha !== gitSha(cur)) return reply(body.sha ? 409 : 422, { message: body.sha ? fp + ' does not match ' + body.sha : 'Invalid request.\n\n"sha" wasn\'t supplied.' });
      const buf = Buffer.from(body.content, 'base64');
      files.set(fp, buf); gh.messages.push(body.message);
      return reply(cur ? 200 : 201, { content: { path: fp, sha: gitSha(buf) }, commit: { sha: 'commit' + (gh.n++), message: body.message } });
    }
    if (m === 'DELETE') {
      const cur = files && files.get(fp);
      if (!cur) return reply(404, { message: 'Not Found' });
      if (body.sha !== gitSha(cur)) return reply(409, { message: 'sha does not match' });
      files.delete(fp); gh.messages.push(body.message);
      return reply(200, { content: null, commit: { sha: 'commit' + (gh.n++) } });
    }
  }
  return reply(404, { message: 'Not Found (fake)' });
}

async function raw(route) {
  const url = new URL(route.request().url()), p = url.pathname.split('/').map(decodeURIComponent);
  const entry = { m: 'RAW', path: url.pathname, auth: route.request().headers()['authorization'] || '', status: 0 };
  gh.log.push(entry);
  if (p[1] === OWNER && p[2] === REPO && p[3] === 'main' && p[4] === 'version.json') {
    return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, CORS), body: JSON.stringify({ web: V, version: '0.75.0' }) });
  }
  const fp = p.slice(4).join('/');
  const buf = (gh.fault.stale && gh.fault.stale.get(fp)) || (p[1] === OWNER && p[2] === REPO && p[3] === 'library' && gh.branch && gh.branch.get(fp)); // stale: the CDN's 5-minute copy
  entry.status = buf ? 200 : 404;
  if (!buf) return route.fulfill({ status: 404, headers: CORS, body: '404: Not Found' });
  return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'text/plain; charset=utf-8' }, CORS), body: buf });
}

async function newCtx(browser, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1200, height: 900 }, serviceWorkers: 'block', acceptDownloads: true }, opts || {}));
  await ctx.addInitScript(() => {
    ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    window.__wait = (ms) => new Promise(r => setTimeout(r, ms));
  });
  await ctx.route('https://api.github.com/**', api);
  await ctx.route('https://raw.githubusercontent.com/**', raw);
  return ctx;
}
async function until(page, fn, arg, ms) { await page.waitForFunction(fn, arg, { timeout: ms || 8000 }); }
async function idle(page) { await page.evaluate(async () => { await __wait(30); await App.library.idle(); await __wait(30); await App.library.idle(); }); }
async function waitLog(pred, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { if (pred()) return true; await new Promise(r => setTimeout(r, 25)); } return false; }
async function items(page) { return page.evaluate(async () => (await App.library.list()).map(it => ({ id: it.id, kind: it.kind, title: it.title, pending: it.pending, remote: !!it.remote, hasMid: !!(it.files && it.files.mid), error: it.error || null }))); }
async function readDownload(page, clickFn) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), clickFn()]);
  return { name: dl.suggestedFilename(), buf: fs.readFileSync(await dl.path()) };
}
const card = (title) => `.lib-item:has(.lib-title:text-is("${title}"))`;

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM });
  let ctx = await newCtx(browser);
  let page = await ctx.newPage();
  const errs = [];
  const watch = (pg) => pg.on('pageerror', e => errs.push(e.message));
  watch(page);
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.library && App.active && window.SLMidiHub && window.Woodshed && App.songs);

  console.log('# nothing is sent at boot or from other pages');
  for (const pg of ['songs', 'jam', 'shed', 'piano', 'midihub', 'settings', 'quiz']) { await page.evaluate((p) => App.switchTo(p), pg); await page.waitForTimeout(150); }
  await page.waitForTimeout(400);
  ok(libLog().length === 0, 'boot + six other pages + Settings: no request to GitHub (' + libLog().map(r => r.m + ' ' + r.path).join(', ') + ')');
  const nav = await page.evaluate(() => { App.switchTo('songs'); return document.getElementById('subnav').textContent; });
  ok(/Library/.test(nav), 'the Play group has a Library pill: ' + nav);

  console.log('# listing without a key (the branch does not exist yet)');
  await page.evaluate(() => App.switchTo('library'));
  await until(page, () => !App.library.status.busy && App.library.status.branch === false);
  let L = libLog();
  ok(L.length === 2 && L[0].m === 'GET' && /\/git\/trees\/library$/.test(L[0].path) && L[0].query === '?recursive=1' && L[0].status === 404 && L[1].m === 'GET' && L[1].path === '/repos/' + OWNER + '/' + REPO && L.every(r => !r.auth), 'page show = ONE tree listing (404: no branch yet, so one look at the repository itself), no Authorization header: ' + L.map(r => r.m + ' ' + r.path + r.query).join(', '));
  const empty = await page.evaluate(() => ({ list: document.getElementById('lib-list').textContent, status: document.getElementById('lib-status').textContent }));
  ok(/Nothing here yet/.test(empty.list) && /without a key|Read-only|no key/i.test(empty.status), 'empty library, read-only status: ' + empty.status);

  console.log('# a scan saved without a key stays on this device');
  const mid1 = await page.evaluate(() => Array.from(SLMidiHub.scoreToMidi({ title: 'Für Elise', bpm: 96, len: 4, notes: [64, 63, 64, 63].map((m, i) => ({ t: i, d: 1, m, partId: 'p1', v: 90 })) })));
  const XML = '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><work><work-title>Für Elise – più mosso ♩=96</work-title></work></score-partwise>\n';
  const bin = Array.from({ length: 512 }, (_, i) => i % 256);
  const r1 = await page.evaluate(async ([mid, xml]) => App.library.saveScan({ title: 'Für Elise – Test', source: 'fur-elise.pdf', pages: 2, options: { tempo: 96, program: 0, transpose: 0 }, summary: { measures: 12, notes: 80, chords: 4, seconds: 31.5 }, midi: new Uint8Array(mid), musicxml: xml }), [mid1, XML]);
  const r2 = await page.evaluate(async (b) => App.library.saveScan({ title: 'Binary', source: 'bin.png', pages: 1, midi: new Uint8Array(b).buffer }), bin);
  ok(!r1.uploaded && !r2.uploaded && /key/.test(r1.message), 'saved locally, says a key is needed: ' + r1.message);
  ok(libLog().length === 2, 'no write request without a key');
  await page.waitForTimeout(100);
  let it = await items(page);
  ok(it.length === 2 && it.every(x => x.pending === 'put' && !x.remote) && it.some(x => x.id === 'scans/fur-elise-test'), 'two pending local entries: ' + it.map(x => x.id).join(', '));
  const st0 = await page.evaluate(() => document.querySelector('.lib-item .lib-state').textContent);
  ok(/this device only/i.test(st0), 'the entry says it is only on this device: ' + st0);

  console.log('# the key: Settings card, local storage, never in the backup');
  await page.evaluate(() => App.switchTo('settings'));
  const set0 = await page.evaluate(() => ({ repo: document.getElementById('lib-set-repo').value, branch: document.getElementById('lib-set-branch').value, folder: document.getElementById('lib-set-folder').value, played: document.getElementById('lib-set-played').checked, type: document.getElementById('lib-set-key').type, help: document.getElementById('set-library-card').textContent }));
  ok(set0.repo === OWNER + '/' + REPO && set0.branch === 'library' && set0.folder === 'library' && set0.type === 'password' && !set0.played, 'defaults: repo / library branch / library folder, password field, Save what I play off without a key');
  ok(/personal-access-tokens\/new/.test(set0.help) && /Only select repositories/.test(set0.help) && /Contents/.test(set0.help) && /Read and write/.test(set0.help) && /Expiration/.test(set0.help) && /ruleset/.test(set0.help) && /[Pp]lugins/.test(set0.help), 'step-by-step key instructions + security notes are on the card');
  await page.fill('#lib-set-key', KEY);
  await page.press('#lib-set-key', 'Enter');
  const keyState = await page.evaluate((K) => {
    const o = { secret: localStorage.getItem('soundlab.secret.library'), field: document.getElementById('lib-set-key').value, inGuitarlab: [] };
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('guitarlab.') === 0 && localStorage.getItem(k).indexOf(K) !== -1) o.inGuitarlab.push(k); }
    o.played = document.getElementById('lib-set-played').checked;
    return o;
  }, KEY);
  ok(keyState.secret === KEY && keyState.field === '' && keyState.inGuitarlab.length === 0, 'the key is in soundlab.secret.library only (field cleared, no guitarlab.* key holds it)');
  ok(keyState.played, 'Save what I play turns on by default once a key is set');
  const backup = await readDownload(page, () => page.click('#set-backup-out'));
  const bj = JSON.parse(backup.buf.toString('utf8'));
  ok(bj.app === 'soundLAB' && backup.buf.toString('utf8').indexOf(KEY) === -1 && !Object.keys(bj.keys).some(k => /secret/.test(k)) && Object.keys(bj.keys).some(k => k.indexOf('guitarlab.') === 0), 'Export settings: a valid backup WITHOUT the key (' + Object.keys(bj.keys).length + ' keys)');
  ok(libLog().length === 2, 'setting the key and exporting sent nothing');
  await page.click('#lib-set-test');
  await until(page, () => /Connected|cannot/.test(document.getElementById('lib-set-msg').textContent));
  const tmsg = await page.evaluate(() => document.getElementById('lib-set-msg').textContent);
  L = libLog().slice(2);
  ok(/Connected to mreindl118-boop\/GuitarPak/.test(tmsg) && /created with your first save/.test(tmsg) && L.length === 2 && L.every(r => r.auth === 'Bearer ' + KEY), 'Test connection (owner action): repo + listing with the key: ' + tmsg);

  console.log('# the first write creates the orphan library branch, then uploads');
  gh.log.length = 0;
  await page.evaluate(() => App.switchTo('library'));
  await page.click('#lib-sync');
  await waitLog(() => gh.messages.length >= 5);
  await idle(page);
  L = libLog();
  const seq = L.map(r => r.m + ' ' + r.path.replace('/repos/' + OWNER + '/' + REPO, ''));
  const iBlob = seq.indexOf('POST /git/blobs'), iTree = seq.indexOf('POST /git/trees'), iCommit = seq.indexOf('POST /git/commits'), iRef = seq.indexOf('POST /git/refs'), iPut = seq.findIndex(s => s.indexOf('PUT /contents/') === 0);
  ok(seq[0] === 'GET /git/trees/library' && L[0].status === 404 && iBlob > 0 && iBlob < iTree && iTree < iCommit && iCommit < iRef && iRef < iPut, 'order: tree 404 -> blob -> tree -> commit -> ref -> contents PUTs: ' + seq.slice(0, 7).join(' | '));
  const cBody = L[iCommit].body, tBody = L[iTree].body, rBody = L[iRef].body, bBody = L[iBlob].body;
  ok(Array.isArray(cBody.parents) && cBody.parents.length === 0 && !tBody.base_tree && tBody.tree.length === 1 && tBody.tree[0].path === 'library/README.md' && tBody.tree[0].mode === '100644' && rBody.ref === 'refs/heads/library' && /soundLAB library/.test(bBody.content), 'a parentless commit of library/README.md only (no app code), ref refs/heads/library');
  const puts = L.filter(r => r.m === 'PUT');
  ok(puts.length === 5 && puts.every(r => r.auth === 'Bearer ' + KEY && r.body.branch === 'library' && !r.body.sha), 'five PUTs (3 files + 2 files) with the key, on the library branch, new files without sha');
  ok(gh.messages.filter(m => m === 'soundLAB: add Für Elise – Test').length === 3 && gh.messages.filter(m => m === 'soundLAB: add Binary').length === 2, 'commit messages "soundLAB: add <title>"');
  const F = gh.branch;
  const midBack = F.get('library/scans/fur-elise-test/fur-elise-test.mid'), xmlBack = F.get('library/scans/fur-elise-test/fur-elise-test.musicxml'), binBack = F.get('library/scans/binary/binary.mid');
  ok(midBack && Buffer.compare(midBack, Buffer.from(mid1)) === 0, 'the .mid arrives byte for byte (' + (midBack && midBack.length) + ' bytes)');
  ok(binBack && Buffer.compare(binBack, Buffer.from(bin)) === 0 && !F.has('library/scans/binary/binary.musicxml'), 'all 256 byte values survive the base64 round trip; no .musicxml when there is none');
  ok(xmlBack && xmlBack.toString('utf8') === XML, 'the MusicXML arrives as UTF-8 (ü, –, ♩ intact)');
  const meta1 = JSON.parse(F.get('library/scans/fur-elise-test/meta.json').toString('utf8'));
  ok(meta1.kind === 'scan' && meta1.title === 'Für Elise – Test' && meta1.source === 'fur-elise.pdf' && meta1.pages === 2 && meta1.options.tempo === 96 && meta1.summary.measures === 12 && meta1.summary.seconds === 31.5 && meta1.app === 'soundLAB ' + V && !isNaN(Date.parse(meta1.created)), 'meta.json: kind, title, source, pages, created, options, summary, app version');
  it = await items(page);
  ok(it.length === 2 && it.every(x => !x.pending && x.remote && x.hasMid), 'both entries uploaded, nothing pending');
  const st1 = await page.evaluate(() => ({ s: document.getElementById('lib-status').textContent, c: document.querySelector('.lib-item .lib-state').textContent }));
  ok(/Up to date/.test(st1.s) && /On GitHub/.test(st1.c), 'status + entry say it is on GitHub: ' + st1.s + ' / ' + st1.c);

  console.log('# played ideas: auto-save with Save what I play, the idea button otherwise');
  gh.log.length = 0; gh.messages.length = 0;
  await page.evaluate(async () => {
    for (const m of [60, 64, 67]) { App.emit('note:input', { on: true, midi: m, vel: 100, src: 'touch' }); await __wait(60); App.emit('note:input', { on: false, midi: m, src: 'touch' }); await __wait(20); }
    document.getElementById('sd-retro').click();
  });
  await waitLog(() => gh.messages.length >= 2);
  await idle(page);
  const playedPaths = [...gh.branch.keys()].filter(p => p.indexOf('library/played/') === 0);
  const pm = playedPaths.find(p => /\.mid$/.test(p)), pj = playedPaths.find(p => /\.json$/.test(p));
  ok(playedPaths.length === 2 && /^library\/played\/\d{4}-\d\d-\d\d-\d{6}-idea-\d+\.mid$/.test(pm) && pj === pm.replace(/\.mid$/, '.json'), 'a captured idea lands as played/<yyyy-mm-dd>-<hhmmss>-<slug>.mid + .json: ' + pm);
  const pmeta = JSON.parse(gh.branch.get(pj).toString('utf8'));
  ok(pmeta.kind === 'played' && /^Idea \d+$/.test(pmeta.title) && pmeta.notes === 3 && pmeta.source === 'retro' && pmeta.bpm > 0 && typeof pmeta.key === 'string' && pmeta.ideaId, 'played meta: kind, title, bpm, key, notes, source, idea id: ' + JSON.stringify({ t: pmeta.title, bpm: pmeta.bpm, key: pmeta.key, src: pmeta.source }));
  const parsed = await page.evaluate((b) => { const sc = Woodshed.importMidi(new Uint8Array(b).buffer, 'p'); return sc.notes.map(n => n.m); }, Array.from(gh.branch.get(pm)));
  ok(parsed.join(',') === '60,64,67', 'the played .mid is a real Standard MIDI File (Woodshed reads 60,64,67)');
  await page.evaluate(() => App.switchTo('settings'));
  await page.uncheck('#lib-set-played');
  gh.messages.length = 0;
  const before = libLog().length;
  await page.evaluate(async () => {
    App.emit('note:input', { on: true, midi: 62, vel: 90, src: 'touch' }); await __wait(50); App.emit('note:input', { on: false, midi: 62, src: 'touch' });
    document.getElementById('sd-retro').click(); await __wait(300);
  });
  ok(libLog().length === before && (await items(page)).filter(x => x.kind === 'played').length === 1, 'Save what I play off: a new idea is NOT saved or sent');
  await page.evaluate(() => { const b = document.querySelector('#sd-list [data-ilib]'); b.click(); });
  await waitLog(() => gh.messages.length >= 2);
  await idle(page);
  ok((await items(page)).filter(x => x.kind === 'played' && !x.pending).length === 2, 'the idea\'s Save to library button saves and uploads it');
  const dupl = await page.evaluate(async () => { const list = App.store.get('ideas.list'); return App.library.savePlayed(list[list.length - 1]); });
  ok(dupl.already === true, 'saving the same idea again is refused as already there');

  console.log('# offline: kept on this device, uploaded by Sync now');
  await page.evaluate(() => App.switchTo('library'));
  gh.log.length = 0; gh.messages.length = 0;
  await ctx.setOffline(true);
  const r3 = await page.evaluate(async (mid) => App.library.saveScan({ title: 'Offline piece', source: 'off.jpg', pages: 1, midi: new Uint8Array(mid), musicxml: '<score-partwise/>' }), mid1);
  ok(!r3.uploaded && /Offline/.test(r3.message), 'saving offline keeps it here and says so: ' + r3.message);
  ok(libLog().filter(r => r.m !== 'RAW').length === 0, 'nothing reached GitHub while offline');
  const offSt = await page.evaluate(() => document.getElementById('lib-status').textContent);
  ok(/Offline/.test(offSt), 'status line: ' + offSt);
  await ctx.setOffline(false);
  await until(page, () => /1 change waiting to upload/.test(document.getElementById('lib-status').textContent));
  ok(libLog().length === 0, 'coming back online sends nothing by itself (the status says 1 change waiting)');
  await page.click('#lib-sync');
  await waitLog(() => gh.messages.length >= 3);
  await idle(page);
  ok(gh.branch.has('library/scans/offline-piece/offline-piece.mid') && gh.branch.has('library/scans/offline-piece/meta.json') && (await items(page)).every(x => !x.pending), 'Sync now uploads the queued entry');

  console.log('# rename + a conflict: the sha moved, refetch it, retry once');
  gh.log.length = 0; gh.messages.length = 0;
  const metaPath = 'library/scans/offline-piece/meta.json';
  gh.fault.conflict = metaPath;
  await page.click(card('Offline piece') + ' [data-act="rename"]');
  await page.fill('#lib-ren-in', 'Offline piece (edited)');
  await page.press('#lib-ren-in', 'Enter');
  await waitLog(() => gh.messages.length >= 1);
  await idle(page);
  L = libLog().filter(r => r.m !== 'GET' || /contents/.test(r.path));
  const cseq = L.map(r => r.m + ' ' + r.path.split('/').slice(-1)[0] + ' ' + r.status);
  ok(cseq.join(' | ') === 'PUT meta.json 409 | GET meta.json 200 | PUT meta.json 200', 'conflict: PUT 409 -> GET contents for the sha -> PUT 200 (' + cseq.join(' | ') + ')');
  const getC = L.find(r => r.m === 'GET');
  ok(getC && getC.query === '?ref=library', 'the sha is fetched from the library branch');
  const meta3 = JSON.parse(gh.branch.get(metaPath).toString('utf8'));
  ok(meta3.title === 'Offline piece (edited)' && meta3.source === 'off.jpg' && gh.messages[0] === 'soundLAB: rename Offline piece (edited)' && libLog().filter(r => r.m === 'PUT').length === 2, 'rename rewrites meta.json only ("soundLAB: rename <title>"), the .mid is untouched');
  ok(await page.isVisible(card('Offline piece (edited)')), 'the list shows the new name');

  console.log('# rate limit: stop, keep pending, say when');
  gh.log.length = 0; gh.messages.length = 0;
  gh.fault.rate = 1;
  const r4 = await page.evaluate(async (mid) => App.library.saveScan({ title: 'Rate test', midi: new Uint8Array(mid) }), mid1);
  ok(!r4.uploaded && /limit/.test(r4.message) && /Try again after \d\d:\d\d/.test(r4.message), 'a 403 rate limit keeps it pending and says until when: ' + r4.message);
  ok(libLog().filter(r => r.m === 'PUT').length === 1 && (await items(page)).find(x => x.title === 'Rate test').pending === 'put', 'the sync stopped at the first refused PUT; the entry waits');
  const rateSt = await page.evaluate(() => document.getElementById('lib-status').textContent);
  ok(/limit/.test(rateSt), 'the status line says so: ' + rateSt);
  await page.click('#lib-sync');
  await waitLog(() => gh.messages.length >= 3);
  await idle(page);
  ok(gh.branch.has('library/scans/rate-test/rate-test.mid') && !(await items(page)).some(x => x.pending), 'Sync now later uploads it');
  gh.fault.rate429List = 1;
  await page.click('#lib-sync');
  await idle(page);
  const r429 = await page.evaluate(() => App.library.status);
  ok(r429.errorKind === 'rate' && /limit/.test(r429.text), '429 Too many requests is a rate limit too: ' + r429.text);

  console.log('# a rename tapped while the first upload is still running is not lost');
  gh.log.length = 0; gh.messages.length = 0;
  gh.fault.delay = 350;
  await page.evaluate((mid) => { window.__race = App.library.saveScan({ title: 'Race', midi: new Uint8Array(mid) }); }, mid1);
  await waitLog(() => libLog().some(r => r.m === 'PUT' && /race\.mid$/.test(r.path)));
  const rr = await page.evaluate(() => App.library.rename('scans/race', 'Race renamed'));
  gh.fault.delay = 0;
  await page.evaluate(() => window.__race);
  await idle(page);
  const raceMeta = JSON.parse(gh.branch.get('library/scans/race/meta.json').toString('utf8'));
  const raceIt = (await items(page)).find(x => x.id === 'scans/race');
  ok(raceMeta.title === 'Race renamed' && raceIt && raceIt.title === 'Race renamed' && !raceIt.pending && rr.uploaded, 'the upload left it pending and the next sync sent the new name: ' + raceMeta.title + ' / ' + gh.messages.join(' ; '));

  console.log('# delete: two steps, then the files go from GitHub');
  gh.log.length = 0; gh.messages.length = 0;
  await page.click('#lib-sync'); await idle(page); gh.log.length = 0;
  await page.click(card('Binary') + ' [data-act="delete"]');
  await page.waitForFunction(() => /Delete for good/.test(document.querySelector('.lib-item[data-id="scans/binary"] [data-act="delete"]').textContent), null, { timeout: 3000 }).catch(() => {});
  const armed = await page.textContent(card('Binary') + ' [data-act="delete"]');
  ok(/Delete for good\?/.test(armed) && libLog().length === 0, 'first tap only arms it: ' + armed);
  await page.click(card('Binary') + ' [data-act="delete"]');
  await waitLog(() => gh.messages.length >= 2);
  await idle(page);
  const dels = libLog().filter(r => r.m === 'DELETE');
  ok(dels.length === 2 && dels.every(r => r.body.sha && r.body.branch === 'library' && r.body.message === 'soundLAB: delete Binary' && r.auth === 'Bearer ' + KEY), 'two DELETEs with sha, branch and "soundLAB: delete <title>"');
  ok(![...gh.branch.keys()].some(p => p.indexOf('library/scans/binary/') === 0) && !(await items(page)).some(x => x.title === 'Binary') && !(await page.isVisible(card('Binary'))), 'gone from GitHub, this device and the list');

  console.log('# another device\'s entries: listed, opened, played, practised, downloaded');
  const other = await page.evaluate(() => Array.from(SLMidiHub.scoreToMidi({ title: 'From the phone', bpm: 90, len: 3, notes: [67, 69, 71].map((m, i) => ({ t: i, d: 1, m, partId: 'p', v: 100 })) })));
  gh.branch.set('library/played/2026-10-01-101500-from-the-phone.mid', Buffer.from(other));
  gh.branch.set('library/played/2026-10-01-101500-from-the-phone.json', Buffer.from(JSON.stringify({ kind: 'played', title: 'From the phone', created: '2026-10-01T10:15:00.000Z', bpm: 90, key: 'G Major', notes: 3, seconds: 2, source: 'idea' })));
  gh.branch.set('library/notes.txt', Buffer.from('not library content'));
  gh.log.length = 0;
  await page.click('#lib-sync');
  await idle(page);
  await until(page, () => !!document.querySelector('.lib-item[data-id="played/2026-10-01-101500-from-the-phone"]'));
  const otherCard = await page.evaluate(() => { const c = document.querySelector('.lib-item[data-id="played/2026-10-01-101500-from-the-phone"]'); return { title: c.querySelector('.lib-title').textContent, state: c.querySelector('.lib-state').textContent, info: c.querySelector('.lib-info').textContent }; });
  ok(/From the phone/.test(otherCard.title) && /On GitHub/.test(otherCard.state) && /90 BPM/.test(otherCard.info) && /G Major/.test(otherCard.info), 'its meta.json gives the title and details: ' + JSON.stringify(otherCard));
  ok(libLog().some(r => /\/git\/blobs\//.test(r.path) && r.m === 'GET') && !libLog().some(r => r.m === 'RAW'), 'with a key the meta comes from the exact blob (git/blobs/<sha>)');
  await page.evaluate(() => { document.getElementById('lib-q').value = 'phone'; document.getElementById('lib-q').dispatchEvent(new Event('input')); });
  await page.waitForTimeout(100);
  let shownN = await page.$$eval('.lib-item', els => els.length);
  ok(shownN === 1, 'search narrows the list to the match');
  await page.evaluate(() => { document.getElementById('lib-q').value = ''; document.getElementById('lib-q').dispatchEvent(new Event('input')); });
  await page.click('#lib-filter [data-f="scan"]');
  await page.waitForTimeout(100);
  const scansOnly = await page.$$eval('.lib-item', els => els.map(e => e.getAttribute('data-id')));
  ok(scansOnly.length > 0 && scansOnly.every(id => id.indexOf('scans/') === 0), 'filter Scans: ' + scansOnly.length + ' scans');
  await page.click('#lib-filter [data-f="played"]');
  await page.waitForTimeout(100);
  const playedOnly = await page.$$eval('.lib-item', els => els.map(e => e.getAttribute('data-id')));
  ok(playedOnly.length === 3 && playedOnly.every(id => id.indexOf('played/') === 0), 'filter Played: ' + playedOnly.length);
  await page.click('#lib-filter [data-f="all"]');
  await page.waitForTimeout(100);
  const order = await page.$$eval('.lib-item', els => els.map(e => e.getAttribute('data-id')));
  const nAll = (await items(page)).length;
  ok(order[order.length - 1] === 'played/2026-10-01-101500-from-the-phone' && order.length === nAll, 'newest first (the October entry is last of ' + order.length + ')');

  const sel = '.lib-item[data-id="played/2026-10-01-101500-from-the-phone"]';
  await page.click(sel + ' [data-act="synth"]');
  await until(page, () => App.active === 'midihub' && SLMidiHub.player.state.title);
  const syn = await page.evaluate(() => ({ title: SLMidiHub.player.state.title, view: App.store.get('midihub.view'), dur: SLMidiHub.player.state.duration }));
  ok(syn.view === 'player' && syn.dur > 0 && /From the phone/.test(syn.title), 'Play on synth: the Hub Player opens it (downloaded from GitHub): ' + JSON.stringify(syn));
  await page.evaluate(() => App.switchTo('library'));
  await page.click(sel + ' [data-act="practice"]');
  await until(page, () => App.active === 'shed');
  ok(await page.evaluate(() => (App.store.get('ws.lib') || []).some(s => s.title === 'From the phone' && s.notes.length === 3)), 'Practice: it is in the Woodshed library and the Woodshed is open');
  await page.click('#ws-mylib');
  await until(page, () => App.active === 'library');
  ok(true, 'the Woodshed\'s My library button opens the library page');
  await page.click(sel + ' [data-act="tab"]');
  await until(page, () => App.active === 'songs');
  ok(await page.evaluate(() => App.songs.current && App.songs.current.name === 'From the phone' && App.songs.current.steps.length > 0), 'Open as tab: the Songs page shows it as tab');
  await page.evaluate(() => App.switchTo('library'));
  const dl = await readDownload(page, () => page.click(sel + ' [data-act="mid"]'));
  ok(dl.name === 'from-the-phone.mid' && Buffer.compare(dl.buf, Buffer.from(other)) === 0, 'Download .mid: ' + dl.name + ' byte for byte');
  const dlx = await readDownload(page, () => page.click(card('Für Elise – Test') + ' [data-act="musicxml"]'));
  ok(dlx.name === 'fur-elise-test.musicxml' && dlx.buf.toString('utf8') === XML, 'Download .musicxml of a scan');

  console.log('# a reload with a key and a pending change: still nothing until the library is opened');
  await ctx.setOffline(true);
  await page.evaluate(async (mid) => { await App.library.saveScan({ title: 'Waiting', midi: new Uint8Array(mid) }); App.switchTo('songs'); }, mid1);
  await ctx.setOffline(false);
  gh.log.length = 0;
  await page.reload();
  await page.waitForFunction(() => window.App && App.library && App.active);
  for (const pg of ['jam', 'shed', 'settings', 'songs']) { await page.evaluate((p) => App.switchTo(p), pg); await page.waitForTimeout(150); }
  await page.waitForTimeout(400);
  ok(libLog().length === 0 && (await items(page)).some(x => x.title === 'Waiting' && x.pending === 'put'), 'reload + other pages with a key and a pending entry: no request');
  await page.evaluate(() => App.switchTo('library'));
  await waitLog(() => gh.branch.has('library/scans/waiting/meta.json'));
  await idle(page);
  ok(gh.branch.has('library/scans/waiting/waiting.mid') && libLog()[0].m === 'GET' && /trees/.test(libLog()[0].path), 'opening the library lists, then uploads what the owner saved');

  console.log('# names already taken on GitHub are never overwritten');
  await page.evaluate(() => App.switchTo('songs'));
  gh.branch.set('library/scans/fresh/fresh.mid', Buffer.from(mid1));
  gh.branch.set('library/scans/fresh/meta.json', Buffer.from(JSON.stringify({ kind: 'scan', title: 'Fresh (phone)', created: '2026-10-02T00:00:00Z' })));
  gh.messages.length = 0;
  const r5 = await page.evaluate(async (mid) => App.library.saveScan({ title: 'Fresh', midi: new Uint8Array(mid) }), mid1);
  await idle(page);
  ok(r5.uploaded && r5.id === 'scans/fresh-2' && gh.branch.has('library/scans/fresh-2/fresh-2.mid') && JSON.parse(gh.branch.get('library/scans/fresh/meta.json')).title === 'Fresh (phone)', 'a new entry whose name exists on GitHub takes fresh-2: ' + r5.id);

  const twins = await page.evaluate(async (mid) => (await Promise.all([1, 2].map((n) => { const m = new Uint8Array(mid); m[m.length - 5] = n; return App.library.saveScan({ title: 'Twin', midi: m }); }))).map(r => r.id).sort(), mid1);
  await idle(page);
  ok(twins.join(',') === 'scans/twin,scans/twin-2' && gh.branch.has('library/scans/twin/twin.mid') && gh.branch.has('library/scans/twin-2/twin-2.mid'), 'two different scans saved under the same title at the same moment keep both: ' + twins.join(', '));
  gh.messages.length = 0;
  const same = await page.evaluate(async (mid) => { const o = () => ({ title: 'Same scan', midi: new Uint8Array(mid), musicxml: '<score-partwise/>' }); const r = await Promise.all([App.library.saveScan(o()), App.library.saveScan(o())]); const r3 = await App.library.saveScan(o()); return { ids: r.concat(r3).map(x => x.id), already: r.concat(r3).filter(x => x.already).length, n: (await App.library.list()).filter(x => x.title === 'Same scan').length }; }, mid1);
  await idle(page);
  ok(same.n === 1 && same.already === 2 && gh.messages.filter(m => m === 'soundLAB: add Same scan').length === 3, 'the SAME scan saved twice at once and once more (a double tap, auto-save + tap) stays one entry, uploaded once: ' + same.ids.join(', '));

  console.log('# Forget key; another device without a key reads the public library');
  await page.evaluate(() => App.switchTo('settings'));
  await page.click('#lib-set-forget');
  ok(await page.evaluate(() => localStorage.getItem('soundlab.secret.library') === null && !App.library.hasKey), 'Forget key removes it');
  const ctx2 = await newCtx(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await ctx2.newPage();
  watch(p2);
  gh.log.length = 0;
  await p2.goto(env.URL);
  await p2.waitForFunction(() => window.App && App.library && App.active);
  await p2.waitForTimeout(300);
  ok(libLog().length === 0, 'a phone boots without a request');
  await p2.evaluate(() => App.switchTo('library'));
  await until(p2, () => document.querySelectorAll('.lib-item').length >= 6 && !App.library.status.busy && !/details load/.test(document.getElementById('lib-list').textContent));
  L = libLog();
  ok(L.filter(r => r.m === 'GET').length === 1 && L.every(r => !r.auth) && L.filter(r => r.m === 'RAW' && /meta\.json$|\.json$/.test(r.path)).length >= 6, 'no key: one tree listing + public raw meta files, no Authorization anywhere (' + L.length + ' requests)');
  const titles2 = await p2.$$eval('.lib-title', els => els.map(e => e.firstChild.textContent));
  ok(titles2.indexOf('Für Elise – Test') !== -1 && titles2.indexOf('From the phone') !== -1 && titles2.indexOf('Offline piece (edited)') !== -1, 'titles from meta.json: ' + titles2.join(', '));
  const dl2 = await readDownload(p2, () => p2.click(card('Für Elise – Test') + ' [data-act="mid"]'));
  ok(Buffer.compare(dl2.buf, Buffer.from(mid1)) === 0 && libLog().some(r => r.m === 'RAW' && /fur-elise-test\.mid$/.test(r.path)), 'download without a key comes from raw.githubusercontent.com, byte for byte');
  const before2 = libLog().length;
  await p2.click(card('From the phone') + ' [data-act="delete"]');
  await p2.click(card('From the phone') + ' [data-act="delete"]');
  await p2.waitForTimeout(300);
  const toast = await p2.evaluate(() => document.getElementById('app-toast') && document.getElementById('app-toast').textContent);
  ok(libLog().length === before2 && /needs the access key/.test(toast || '') && await p2.isVisible(card('From the phone')), 'deleting from GitHub without a key is refused with a reason: ' + toast);
  const fit = await p2.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  ok(fit.sw <= fit.w, 'phone width: no horizontal scroll (' + fit.sw + ' <= ' + fit.w + ')');
  await p2.evaluate(() => App.switchTo('settings'));
  const fit2 = await p2.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  ok(fit2.sw <= fit2.w, 'Settings with the Library sync card fits the phone (' + fit2.sw + ')');
  const tour = await p2.evaluate(() => { App.switchTo('library'); document.getElementById('help-btn').click(); const c = document.querySelector('#hp-ov .hp-card'); return c ? c.textContent : ''; });
  ok(/My library/.test(tour), 'the (?) tour explains the library page');
  await ctx2.close();

  console.log('# audit: the key pasted badly or in the wrong field, duplicates, lost answers, hung requests');
  gh.branch = new Map([['library/README.md', Buffer.from('x')]]); gh.fault = {}; gh.messages.length = 0; gh.log.length = 0;
  const ctx3 = await newCtx(browser);
  const p3 = await ctx3.newPage();
  watch(p3);
  const carried = [], logs3 = [];   // every request that carries the key, anywhere in it
  p3.on('request', (rq) => {
    const u = rq.url(), b = rq.postData() || '', h = rq.headers(), hdrs = Object.keys(h).filter(k => h[k].indexOf(KEY) !== -1);
    if (u.indexOf(KEY) !== -1 || b.indexOf(KEY) !== -1 || hdrs.length) carried.push({ host: new URL(u).host, url: u.indexOf(KEY) !== -1, body: b.indexOf(KEY) !== -1, hdrs: hdrs.join() });
  });
  p3.on('console', m => logs3.push(m.text()));
  await p3.goto(env.URL);
  await p3.waitForFunction(() => window.App && App.library && App.active && window.SLMidiHub);
  await p3.evaluate(() => App.switchTo('settings'));
  await p3.fill('#lib-set-key', ' ' + KEY.slice(0, 12) + '​' + KEY.slice(12) + ' ');
  await p3.press('#lib-set-key', 'Enter');
  ok(await p3.evaluate((K) => localStorage.getItem('soundlab.secret.library') === K && App.library.hasKey, KEY), 'a key pasted with spaces and a zero-width space is stored clean (it used to make every request look offline)');
  const badKey = await p3.evaluate(async () => {
    const r = App.library.setKey('github_pat_ÄÖÜ_kein_Schlüssel');
    const inp = document.getElementById('lib-set-key'); inp.value = 'github_pat_☃_snow'; inp.dispatchEvent(new Event('change'));
    return { r, msg: document.getElementById('lib-set-msg').textContent };
  });
  ok(badKey.r === false && /not a GitHub access key/.test(badKey.msg) && await p3.evaluate((K) => localStorage.getItem('soundlab.secret.library') === K, KEY), 'a "key" with characters GitHub keys never have is refused with a reason; the saved key stays: ' + badKey.msg);
  const wrongField = await p3.evaluate(async (K) => {
    const o = {};
    for (const id of ['lib-set-repo', 'lib-set-branch', 'lib-set-folder']) {
      const el = document.getElementById(id); el.value = K; el.dispatchEvent(new Event('change'));
      await __wait(30);
      o[id] = { field: el.value, msg: document.getElementById('lib-set-msg').textContent };
    }
    await App.library.setConfig({ branch: K, folder: K, repo: 'x/' + K });
    const c = App.library.config();
    o.cfg = c; o.stored = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('guitarlab.') === 0 && localStorage.getItem(k).indexOf(K) !== -1) o.stored.push(k); }
    for (const b of ['refs/heads/main', 'heads/main', 'MAIN']) { await App.library.setConfig({ branch: b }); o[b] = App.library.config().branch; }
    for (const r of ['x/..', 'x/.']) { await App.library.setConfig({ repo: r }); o[r] = App.library.config().repo; }
    return o;
  }, KEY);
  ok(['lib-set-repo', 'lib-set-branch', 'lib-set-folder'].every(id => wrongField[id].field.indexOf(KEY) === -1 && /looks like an access key/.test(wrongField[id].msg)) &&
    wrongField.cfg.branch === 'library' && wrongField.cfg.folder === 'library' && wrongField.cfg.repo === OWNER + '/' + REPO && wrongField.stored.length === 0,
    'the key pasted into Repository / Branch / Folder is refused (never a name in guitarlab.* backups, URLs or a public branch): ' + wrongField['lib-set-branch'].msg);
  ok(wrongField['refs/heads/main'] === 'library' && wrongField['heads/main'] === 'library' && wrongField.MAIN === 'library' && wrongField['x/..'] === OWNER + '/' + REPO && wrongField['x/.'] === OWNER + '/' + REPO, 'refs/heads/main, heads/main and repository names . / .. are refused');

  const twice = await p3.evaluate(async () => {
    const idea = { id: 'iaudit1', name: 'Twice', ts: Date.now(), source: 'rec', bpm: 100, root: 0, scale: 'major', dur: 1, notes: [{ m: 60, v: 90, t: 0, d: 0.5 }] };
    const r = await Promise.all([App.library.savePlayed(idea), App.library.savePlayed(idea)]);
    return { n: (await App.library.list()).filter(i => i.ideaId === 'iaudit1').length, already: r.filter(x => x.already).length };
  });
  await idle(p3);
  ok(twice.n === 1 && twice.already === 1 && [...gh.branch.keys()].filter(k => /^library\/played\/.*twice\.mid$/.test(k)).length === 1, 'an auto-save and a Save to library tap at the same moment keep ONE entry (' + twice.n + ' here)');

  gh.fault.drop = (m, path) => m === 'PUT' && /lost-answer\.mid$/.test(path);
  const lost = await p3.evaluate(async (mid) => App.library.saveScan({ title: 'Lost answer', midi: new Uint8Array(mid), musicxml: '<score-partwise/>' }), mid1);
  ok(!lost.uploaded && gh.branch.has('library/scans/lost-answer/lost-answer.mid'), 'the .mid reached GitHub but its answer was lost on the way back: the entry waits (' + lost.message + ')');
  gh.log.length = 0;
  await p3.evaluate(() => App.library.sync());
  const lostPuts = libLog().filter(r => r.m === 'PUT').map(r => r.path.split('/').pop()).sort();
  const scanDirs = () => [...new Set([...gh.branch.keys()].filter(k => k.indexOf('library/scans/') === 0).map(k => k.split('/')[2]))].sort();
  ok(scanDirs().join() === 'lost-answer' && lostPuts.join() === 'lost-answer.musicxml,meta.json' && (await items(p3)).every(x => !x.pending && !/-2$/.test(x.id)),
    'Sync now carries on with the same entry (no lost-answer-2 copy, the .mid is not sent twice): ' + lostPuts.join(', '));

  gh.log.length = 0;
  await p3.evaluate(async () => { await App.library.setConfig({ folder: 'libary' }); await App.library.setConfig({ folder: 'library' }); await App.library.sync(); });
  ok(scanDirs().join() === 'lost-answer' && !(await items(p3)).some(x => x.pending || /-2$/.test(x.id)) && !libLog().some(r => r.m === 'PUT'), 'the folder changed and changed back: the same entries, nothing uploaded twice');

  gh.fault.hang = (m, path) => m === 'GET' && /\/git\/trees\//.test(path);
  const hung = await p3.evaluate(async (mid) => {
    App.library.TIMEOUT.read = 1500; App.library.TIMEOUT.write = 1500;
    const r = await App.library.saveScan({ title: 'Hung', midi: new Uint8Array(mid) });
    return { r, st: App.library.status };
  }, mid1);
  ok(!hung.r.uploaded && /did not answer/.test(hung.r.message) && !hung.st.busy && hung.st.pending === 1, 'a listing that never answers ends the sync ("did not answer"), the entry waits and the queue is free: ' + hung.r.message);
  gh.fault.hang = null;
  await p3.evaluate(async () => { App.library.TIMEOUT.read = 30000; App.library.TIMEOUT.write = 120000; await App.library.sync(); });
  ok(gh.branch.has('library/scans/hung/hung.mid') && !(await items(p3)).some(x => x.pending), 'the next Sync now uploads it');

  gh.log.length = 0; gh.fault.busy409 = 1;
  const busy = await p3.evaluate(async (mid) => App.library.saveScan({ title: 'Busy branch', midi: new Uint8Array(mid) }), mid1);
  const bseq = libLog().filter(r => /busy-branch\.mid$/.test(r.path)).map(r => r.m + ' ' + r.status).join(' | ');
  ok(busy.uploaded && bseq === 'PUT 409 | GET 404 | PUT 201', 'a NEW file meeting a 409 (the branch moved: another device saving at once) is checked and sent again, not called "taken": ' + bseq);

  // deleted while ANOTHER entry uploads: it must never reach the (public) repository's history
  await p3.evaluate(async (mid) => { App.library.setKey(''); await App.library.saveScan({ title: 'Alpha', midi: new Uint8Array(mid) }); await App.library.saveScan({ title: 'Secret draft', midi: new Uint8Array(mid) }); }, mid1);
  await p3.evaluate((K) => App.library.setKey(K), KEY);
  gh.messages.length = 0; gh.log.length = 0; gh.fault.delay = 400;
  await p3.evaluate(() => { window.__sd = App.library.sync(); });
  await waitLog(() => libLog().some(r => r.m === 'PUT' && /alpha\.mid$/.test(r.path)));
  const sd = await p3.evaluate(() => App.library.remove('scans/secret-draft'));
  gh.fault.delay = 0;
  await p3.evaluate(async () => { await window.__sd; });
  await idle(p3);
  ok(!gh.messages.some(m => /Secret draft/.test(m)) && ![...gh.branch.keys()].some(k => /secret-draft/.test(k)) && !(await items(p3)).some(x => /secret/.test(x.id)) && gh.branch.has('library/scans/alpha/alpha.mid'),
    'an entry deleted while another one uploads is never sent (no add + delete commits in the public history): ' + gh.messages.join(' ; ') + ' / ' + sd.message);

  await p3.evaluate(() => App.switchTo('settings'));
  gh.fault.rate429List = 1;
  await p3.click('#lib-set-test');
  const tc = await until(p3, () => !document.getElementById('lib-set-test').disabled && /limit/.test(document.getElementById('lib-set-msg').textContent), null, 5000).then(() => true, () => false);
  ok(tc, 'Test connection: a rate-limited listing is reported and the button comes back (it hung on "Checking…" with an unhandled rejection)');
  ok(carried.length > 0 && carried.every(r => r.host === 'api.github.com' && !r.url && !r.body && r.hdrs === 'authorization') && !logs3.some(l => l.indexOf(KEY) !== -1),
    'the key travels only as the Authorization header to api.github.com (' + carried.length + ' requests), never in a URL, a body, another host or the console');
  await ctx3.close();

  console.log('# audit: another device without a key - a stale CDN copy, the repository gone private');
  const ctx4 = await newCtx(browser);
  const p4 = await ctx4.newPage();
  watch(p4);
  await p4.goto(env.URL);
  await p4.waitForFunction(() => window.App && App.library && App.active);
  await p4.evaluate(() => App.library.sync());
  const mp = 'library/scans/lost-answer/meta.json', oldMeta = gh.branch.get(mp), nm = JSON.parse(oldMeta.toString('utf8'));
  nm.title = 'Renamed on the phone';
  gh.branch.set(mp, Buffer.from(JSON.stringify(nm, null, 2) + '\n'));
  gh.fault.stale = new Map([[mp, oldMeta]]);
  gh.log.length = 0;
  await p4.evaluate(() => App.library.sync());
  const t4 = await p4.evaluate(async () => (await App.library.get('scans/lost-answer')).title);
  ok(t4 === 'Renamed on the phone' && libLog().some(r => r.m === 'GET' && /\/git\/blobs\//.test(r.path) && !r.auth), 'raw.githubusercontent.com still serving the old meta.json is noticed (git id) and the exact version comes from git/blobs, no key: ' + t4);
  gh.fault.stale = null;
  const n4 = (await items(p4)).length;
  gh.fault.private = true;
  const st4 = await p4.evaluate(() => App.library.sync());
  gh.fault.private = false;
  ok(/cannot find/.test(st4.text) && (await items(p4)).length === n4 && n4 >= 3, 'the repository unreachable (private, no key): a clear message and nothing dropped here (' + n4 + ' entries): ' + st4.text);
  // another tab upgrading / deleting the database (a later release, Clear data): this tab lets go and opens it again
  const vc = await p4.evaluate(() => new Promise((res) => {
    const q = indexedDB.deleteDatabase('soundlab-library'), o = { blocked: false, ok: false };
    q.onblocked = () => { o.blocked = true; };
    q.onsuccess = () => { o.ok = true; res(o); };
    setTimeout(() => res(o), 3000);
  }));
  const after4 = await p4.evaluate(async () => { await App.library.sync(); return (await App.library.list()).length; });
  ok(vc.ok && !vc.blocked && after4 === n4, 'the database lets go when another tab deletes / upgrades it (it stayed blocked), then works again (' + after4 + ' entries listed back)');
  await ctx4.close();

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close(); await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
