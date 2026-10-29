/* soundLAB MIDI LIBRARY (App.library + the 'library' page, prefix lib-).
 *
 * Everything the owner keeps - SheetLab scans (sheet music turned into MIDI +
 * MusicXML) and what they played in the app (Studio ideas) - in ONE place
 * that is local-first and, with a key, mirrored to a folder of the soundLAB
 * repo on its own ORPHAN branch ('library': no app code, so a save never
 * triggers the Pages deploy that runs on pushes to main). docs/LIBRARY.md.
 *
 * Local: IndexedDB 'soundlab-library', store 'items', one record per entry:
 *   {id: 'scans/<slug>' | 'played/<yyyy-mm-dd>-<hhmmss>-<slug>', kind: 'scan' |
 *    'played', title, created (ms), files: {mid: Uint8Array, musicxml?: string}
 *    (local copies; a remote-only entry downloads them on first use), meta (the
 *    meta.json object), remote: {loc, shas: {mid, musicxml, meta}, paths} | null
 *    (null = never uploaded to this repo/branch/folder), pending: 'put' |
 *    'delete' | null, dirty: files the pending put still has to upload, op:
 *    'add' | 'rename' (commit message), error, ideaId (played)}.
 * Remote layout (folder default 'library'):
 *   <folder>/scans/<slug>/<slug>.mid, <slug>.musicxml, meta.json
 *   <folder>/played/<stamp>-<slug>.mid + .json
 *   <folder>/README.md (written by the orphan branch's first commit)
 * GitHub REST from the browser (api.github.com and raw.githubusercontent.com
 * both send CORS headers):
 *   list   GET  git/trees/<branch>?recursive=1 (one call); meta.json lazily
 *               (raw.githubusercontent.com without a key, git/blobs/<sha> with)
 *   write  PUT  contents/<path> {message, content (base64), branch, sha?}
 *   delete DELETE contents/<path> {message, sha, branch}
 *   first write without the branch: blob (README) -> tree -> commit with NO
 *               parents -> POST git/refs refs/heads/<branch> (an orphan branch)
 *   409/422 = the sha moved: GET contents/<path>?ref= for the fresh sha, retry
 *               ONCE. 403/429 rate limit: stop, keep everything pending, say so.
 *   Every request has a time limit (TIMEOUT). A first upload whose name is taken
 *   carries on only when every file there is byte for byte ours (git ids: our own
 *   try whose answer was lost); otherwise it takes a free name. Raw answers are
 *   checked against the listing's git id (the CDN keeps files 5 minutes).
 * NETWORK RULE: nothing is sent at boot or from other pages. Requests happen
 * only (a) when the Library page is shown (listing, plus uploading what the
 * owner already saved), (b) on an owner action (save, auto-save the owner
 * switched on, rename, delete, Sync now, Test connection, open/download an
 * entry that is only on GitHub).
 * THE KEY lives in localStorage 'soundlab.secret.library' - deliberately NOT
 * under 'guitarlab.' - so the Settings backup export never contains it.
 * Other settings: guitarlab.library.repo / branch / folder / savePlayed /
 * filter. Bus: 'library:changed' {status}.
 */
(function () {
  'use strict';

  var KEY_STORE = 'soundlab.secret.library';
  var DEF = { repo: 'mreindl118-boop/GuitarPak', branch: 'library', folder: 'library' };
  var API = 'https://api.github.com';
  var RAW = 'https://raw.githubusercontent.com';
  var DB_NAME = 'soundlab-library', DB_STORE = 'items';
  var FILES = { scan: ['mid', 'musicxml', 'meta'], played: ['mid', 'meta'] };
  var LIST_TTL = 30000;            // a page show re-lists at most every 30 s (Sync now always does)
  // a request that never answers (a dead mobile link, a captive portal) must not hold the one sync
  // queue for ever: it ends as "GitHub did not answer" and everything stays pending (ms; tests shorten it)
  var TIMEOUT = { read: 30000, write: 120000 };
  var README = '# soundLAB library\n\n' +
    'This branch holds the music soundLAB keeps for you: `scans/` (sheet music turned into MIDI and MusicXML\n' +
    'by Play › Scan) and `played/` (what you played in the app, from Studio ideas). It has no app code,\n' +
    'so saving here never redeploys the site. soundLAB writes it through the GitHub API with the key set in\n' +
    'Settings › Library sync; every entry is also kept on the device that saved it.\n';
  var enc = new TextEncoder(), dec = new TextDecoder('utf-8');

  // ---------------------------------------------------------------- settings

  // an access key pasted into the wrong field would otherwise become a repo / branch / folder NAME:
  // stored under guitarlab.* (so in every settings backup) and sent in URLs, a branch name or a path
  function looksLikeKey(v) { return /(github_pat_|gh[pousr]_)[A-Za-z0-9_]{16,}/.test(String(v == null ? '' : v)); }
  function cleanRepo(v) {
    v = String(v == null ? '' : v).trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
    if (looksLikeKey(v) || !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(v) || /\/\.\.?$/.test(v)) return '';
    return v;
  }
  // the library never shares a branch with the app: a save on main/gh-pages would redeploy it
  // (refs/heads/main and heads/main name the same branch)
  function cleanBranch(v) {
    v = String(v == null ? '' : v).trim();
    if (looksLikeKey(v) || !/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(v) || /\.\.|\.lock$|^\.|\/\./.test(v)) return '';
    if (/^(main|master|gh-pages)$/i.test(v) || /^(refs|heads)\//i.test(v)) return '';
    return v;
  }
  function cleanFolder(v) {
    v = String(v == null ? '' : v).trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
    if (!v || looksLikeKey(v) || !/^[A-Za-z0-9._ -]+(\/[A-Za-z0-9._ -]+)*$/.test(v) || v.split('/').some(function (s) { return s === '.' || s === '..' || !s.trim(); })) return '';
    return v;
  }
  function cfg() {
    var repo = cleanRepo(App.store.get('library.repo', DEF.repo)) || DEF.repo;
    var branch = cleanBranch(App.store.get('library.branch', DEF.branch)) || DEF.branch;
    var folder = cleanFolder(App.store.get('library.folder', DEF.folder)) || DEF.folder;
    return { repo: repo, branch: branch, folder: folder, loc: repo + '@' + branch + ':' + folder, rp: '/repos/' + repo };
  }

  // what a pasted key carries around or inside it: spaces, line breaks, zero-width characters (a
  // notes app on the iPad). Left in, fetch() refuses the header and every request looked "offline".
  function cleanKey(k) { return String(k == null ? '' : k).replace(/[\s​-‍⁠­]+/g, ''); }
  function keyOk(k) { return /^[\x21-\x7e]+$/.test(k); }
  function getKey() { try { return cleanKey(localStorage.getItem(KEY_STORE)); } catch (e) { return ''; } }
  // false = not stored (not a key GitHub could have made, or no storage)
  function setKey(k) {
    k = cleanKey(k);
    if (k && !keyOk(k)) return false;
    var was = getKey();
    try { if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE); } catch (e) { return false; }
    // a new key: the next visit to the Library page lists and uploads what waits at once (it used
    // to wait up to LIST_TTL, saying "1 change waiting to upload" with nothing sent)
    if (k !== was) state.lastList = 0;
    changed();
    return true;
  }
  // "Save what I play": the owner's switch; until they touch it, on once a key is set up
  function savePlayedOn() {
    var v = App.store.get('library.savePlayed', null);
    return v === true || (v !== false && !!getKey());
  }

  // ---------------------------------------------------------------- IndexedDB (memory fallback)

  var dbp = null, mem = null;
  function db() {
    if (dbp) return dbp;
    var p = dbp = new Promise(function (res) {
      var req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { mem = mem || new Map(); res(null); return; }
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(DB_STORE)) d.createObjectStore(DB_STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () {
        var d = req.result;
        // another tab upgrading or deleting the database (a later release), or the browser dropping
        // the connection (iOS after a long background): let go, and the next call opens it again
        d.onversionchange = function () { try { d.close(); } catch (e) { /* closed */ } if (dbp === p) dbp = null; };
        d.onclose = function () { if (dbp === p) dbp = null; };
        res(d);
      };
      req.onerror = function () { mem = mem || new Map(); res(null); };
      req.onblocked = function () { /* an older tab holds it open; it lets go (onversionchange), then onsuccess */ };
    });
    return dbp;
  }
  // fn(d) on the open database (null = memory). A connection that died meanwhile makes
  // d.transaction() throw InvalidStateError before anything is written: open it again, once.
  function withDb(fn) {
    return db().then(fn).catch(function (e) {
      if (!e || e.name !== 'InvalidStateError') throw e;
      dbp = null;
      return db().then(fn);
    });
  }
  function idb(mode, fn) {
    return withDb(function (d) {
      if (!d) return fn(null);
      return new Promise(function (res, rej) {
        var t = d.transaction(DB_STORE, mode), st = t.objectStore(DB_STORE), out;
        var r = fn(st);
        if (r && 'onsuccess' in r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { res(out); };
        t.onerror = t.onabort = function () { rej(t.error || new Error('library storage failed')); };
      });
    });
  }
  function all() {
    return idb('readonly', function (st) { return st ? st.getAll() : null; }).then(function (v) {
      return v || (mem ? Array.from(mem.values()) : []);
    });
  }
  function getItem(id) {
    return idb('readonly', function (st) { return st ? st.get(id) : null; }).then(function (v) {
      return v || (mem ? mem.get(id) || null : null);
    });
  }
  function putItem(it) { return idb('readwrite', function (st) { if (st) return st.put(it); mem.set(it.id, it); return null; }); }
  function delItem(id) { return idb('readwrite', function (st) { if (st) return st.delete(id); mem.delete(id); return null; }); }
  // read-modify-write of ONE record inside one transaction, so an upload finishing and a
  // rename / delete tapped meanwhile never overwrite each other. fn(cur) mutates cur in
  // place (synchronously); returning false skips the write. Resolves the record (or null).
  function update(id, fn) {
    return withDb(function (d) {
      if (!d) {
        var m = mem.get(id) || null;
        if (m && fn(m) !== false) mem.set(m.id, m);
        return m;
      }
      return new Promise(function (res, rej) {
        var t = d.transaction(DB_STORE, 'readwrite'), st = t.objectStore(DB_STORE), out = null;
        var g = st.get(id);
        g.onsuccess = function () {
          var cur = g.result || null;
          out = cur;
          if (cur && fn(cur) !== false) st.put(cur);
        };
        t.oncomplete = function () { res(out); };
        t.onerror = t.onabort = function () { rej(t.error || new Error('library storage failed')); };
      });
    });
  }
  // a NEW record under the first free id of base, base-2, base-3... (IndexedDB add() inside one
  // transaction, so two saves of the same title at the same moment never overwrite each other).
  // ifAbsent: write it only when the id is free (a listed entry never replaces a local one).
  function insert(it, base, ifAbsent) {
    var n = 1;
    function idN() { return n === 1 ? base : base + '-' + n; }
    return withDb(function (d) {
      if (!d) {
        while (mem.has(idN()) && !ifAbsent) n++;
        it.id = idN();
        if (mem.has(it.id)) return null;
        mem.set(it.id, it);
        return it;
      }
      return new Promise(function (res, rej) {
        var t = d.transaction(DB_STORE, 'readwrite'), st = t.objectStore(DB_STORE), ok = true;
        (function tryAdd() {
          it.id = idN();
          var r = st.add(it);
          r.onerror = function (e) {
            if (!r.error || r.error.name !== 'ConstraintError') return;
            e.preventDefault(); e.stopPropagation(); // keep the transaction going
            if (ifAbsent) { ok = false; return; }
            n++; tryAdd();
          };
        })();
        t.oncomplete = function () { res(ok ? it : null); };
        t.onerror = t.onabort = function () { rej(t.error || new Error('library storage failed')); };
      });
    });
  }
  // move a record to the first free id of base, base-2... in ONE transaction, so closing the app
  // half way never leaves the entry twice (or not at all). Resolves the new id, or null when the
  // record is gone or the owner deleted it meanwhile (then it is simply dropped: never on GitHub).
  function rekey(oldId, base) {
    var n = 1;
    function idN() { return n === 1 ? base : base + '-' + n; }
    return withDb(function (d) {
      if (!d) {
        var m = mem.get(oldId);
        mem.delete(oldId);
        if (!m || m.pending === 'delete') return null;
        while (mem.has(idN())) n++;
        m.id = idN(); mem.set(m.id, m);
        return m.id;
      }
      return new Promise(function (res, rej) {
        var t = d.transaction(DB_STORE, 'readwrite'), st = t.objectStore(DB_STORE), rec = null;
        var g = st.get(oldId);
        g.onsuccess = function () {
          rec = g.result || null;
          st.delete(oldId);
          if (!rec || rec.pending === 'delete') { rec = null; return; }
          (function tryAdd() {
            rec.id = idN();
            var r = st.add(rec);
            r.onerror = function (e) {
              if (!r.error || r.error.name !== 'ConstraintError') return;
              e.preventDefault(); e.stopPropagation();
              n++; tryAdd();
            };
          })();
        };
        t.oncomplete = function () { res(rec ? rec.id : null); };
        t.onerror = t.onabort = function () { rej(t.error || new Error('library storage failed')); };
      });
    });
  }
  // an owner's change to an entry (save / rename / delete / move) bumps its revision: an
  // upload that started before it leaves the entry pending, and the next sync sends the rest
  function bump(it) { it.rev = (it.rev || 0) + 1; return it; }

  // ---------------------------------------------------------------- helpers

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function b64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(str) {
    var s = atob(String(str || '').replace(/\s+/g, '')), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function toBytes(v) {
    if (!v) return null;
    if (v instanceof Uint8Array) return new Uint8Array(v);
    if (v instanceof ArrayBuffer) return new Uint8Array(v.slice(0));
    if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));
    if (Array.isArray(v)) return Uint8Array.from(v);
    return null;
  }
  function bufOf(bytes) { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); }
  function slugify(t) {
    var s = String(t == null ? '' : t);
    if (s.normalize) s = s.normalize('NFKD');
    s = s.replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
    return s || 'untitled';
  }
  // eslint-disable-next-line no-control-regex
  function cleanTitle(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }
  function hhmm(ms) { var d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function kindOf(id) { return String(id).indexOf('scans/') === 0 ? 'scan' : 'played'; }
  function filesOf(kind) { return FILES[kind] || FILES.played; }
  function filePath(c, id, f) {
    var name = String(id).split('/').slice(1).join('/');
    if (kindOf(id) === 'scan') return c.folder + '/scans/' + name + '/' + (f === 'meta' ? 'meta.json' : name + '.' + f);
    return c.folder + '/played/' + name + '.' + (f === 'meta' ? 'json' : f);
  }
  function encPath(p) { return String(p).split('/').map(encodeURIComponent).join('/'); }
  // an entry known only from the listing gets a readable name until its meta.json arrives
  function titleFromId(id) {
    var name = String(id).split('/').slice(1).join('/').replace(/^\d{4}-\d\d-\d\d-\d{6}-/, '').replace(/-+/g, ' ').trim();
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Untitled';
  }
  function createdFromId(id) {
    var m = /^played\/(\d{4})-(\d\d)-(\d\d)-(\d\d)(\d\d)(\d\d)/.exec(id);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0;
  }
  function keyName(root, scale) {
    var pc = (typeof root === 'number' && root >= 0 && root < 12) ? root : null;
    if (pc == null || !window.Theory) return '';
    var sc = Theory.SCALES[scale] ? scale : 'major';
    return Theory.pcName(pc, Theory.FLAT_KEYS.has(pc)) + ' ' + Theory.SCALES[sc].name.replace(/\s*\(.*\)$/, '');
  }
  function clock(sec) {
    sec = Math.max(0, Math.round(+sec || 0));
    return Math.floor(sec / 60) + ':' + pad2(sec % 60);
  }
  function addDirty(it, f) { it.dirty = it.dirty || []; if (it.dirty.indexOf(f) === -1) it.dirty.push(f); }
  function isDirty(it, f) { return it.pending === 'put' && (it.dirty || []).indexOf(f) !== -1; }

  // the bytes soundLAB uploads for one file of an entry (null = it has none)
  function contentOf(it, f) {
    if (f === 'mid') return it.files && it.files.mid ? (it.files.mid instanceof Uint8Array ? it.files.mid : toBytes(it.files.mid)) : null;
    if (f === 'musicxml') return it.files && typeof it.files.musicxml === 'string' ? enc.encode(it.files.musicxml) : null;
    return enc.encode(JSON.stringify(metaOf(it), null, 2) + '\n');
  }
  // git's id of a file (sha1 of "blob <size>\0" + bytes), the sha the listing shows: tells whether
  // a file on GitHub is byte for byte ours. null without WebCrypto (a plain-http page): then
  // nothing is assumed and the old behaviour (a free name, the raw file as served) applies.
  function blobSha(bytes) {
    var subtle = typeof crypto !== 'undefined' && crypto && crypto.subtle;
    if (!subtle || !bytes) return Promise.resolve(null);
    var head = enc.encode('blob ' + bytes.length + '\u0000'), buf = new Uint8Array(head.length + bytes.length);
    buf.set(head); buf.set(bytes, head.length);
    return Promise.resolve().then(function () { return subtle.digest('SHA-1', buf); }).then(function (h) {
      return Array.prototype.map.call(new Uint8Array(h), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    }, function () { return null; });
  }
  // a first upload whose name is already on GitHub: our OWN earlier try (its answer lost on a
  // dropped connection or a timeout, the repo/branch/folder switched away and back)? Only when
  // every file there is byte for byte one of ours - carrying on then cannot lose anything.
  function isOurs(it, rem) {
    var fs = Object.keys((rem && rem.shas) || {});
    if (!fs.length) return Promise.resolve(false);
    return Promise.all(fs.map(function (f) { var b = contentOf(it, f); return b ? blobSha(b) : null; })).then(function (sh) {
      return sh.every(function (s, i) { return !!s && s === rem.shas[fs[i]]; });
    });
  }

  // ---------------------------------------------------------------- GitHub

  function fail(kind, msg, status, extra) {
    var e = new Error(msg);
    e.kind = kind; e.status = status || 0;
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }
  function offline() {
    var off = typeof navigator !== 'undefined' && navigator.onLine === false;
    return fail('offline', (off ? 'Offline' : 'GitHub cannot be reached right now') + ': ' + staysText());
  }
  function needKey(what) { return fail('nokey', (what || 'Saving to GitHub') + ' needs the access key: Settings › Library sync.'); }
  function slow() { return fail('offline', 'GitHub did not answer in time: ' + staysText()); }
  // without a key nothing would ever upload "the next time you sync"
  function staysText() { return getKey() ? 'everything stays on this device and uploads the next time you sync.' : 'everything stays on this device.'; }
  // p (a fetch and the reading of its answer) or a "did not answer" after ms; the abort lets
  // the browser drop the hung connection
  function timed(p, ms, ac) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { try { if (ac) ac.abort(); } catch (e) { /* gone */ } rej(slow()); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }

  function httpFail(res, data) {
    var st = res.status, m = data && data.message ? String(data.message) : '';
    var h = function (n) { try { return res.headers.get(n); } catch (e) { return null; } };
    if (st === 401) return fail('auth', 'GitHub did not accept the access key (expired or revoked?). Make a new one: Settings › Library sync.', st);
    if (st === 429 || (st === 403 && (h('x-ratelimit-remaining') === '0' || h('retry-after') || /rate limit/i.test(m)))) {
      var reset = parseInt(h('x-ratelimit-reset'), 10), ra = parseInt(h('retry-after'), 10);
      var at = reset > 0 ? reset * 1000 : (ra > 0 ? Date.now() + ra * 1000 : Date.now() + 60000);
      return fail('rate', 'GitHub’s request limit is reached' + (getKey() ? '' : ' (without a key: 60 requests an hour)') +
        '. Nothing is lost: everything stays on this device. Try again after ' + hhmm(at) + '.', st, { until: at });
    }
    if (st === 403) return fail('perm', 'The access key may not do this on ' + cfg().repo + ': it needs Contents “Read and write” for this repository.', st);
    if (st === 404) return fail('missing', m || 'Not found', st);
    if (st === 409 || st === 422) return fail('conflict', m || 'GitHub reported a conflict', st);
    return fail('http', 'GitHub answered ' + st + (m ? ': ' + m : ''), st);
  }

  // one request to api.github.com; JSON in, JSON out
  function gh(method, path, body, write) {
    var key = getKey();
    if (write && !key) return Promise.reject(needKey());
    if (key && !keyOk(key)) return Promise.reject(fail('auth', 'The access key has characters a GitHub key never has: paste it again in Settings › Library sync.'));
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.reject(offline());
    var h = { Accept: 'application/vnd.github+json' };
    if (key) { h.Authorization = 'Bearer ' + key; h['X-GitHub-Api-Version'] = '2022-11-28'; }
    if (body !== undefined) h['Content-Type'] = 'application/json';
    var opts = { method: method, headers: h, cache: 'no-store' };
    if (body !== undefined) opts.body = JSON.stringify(body);
    var ac = typeof AbortController === 'function' ? new AbortController() : null;
    if (ac) opts.signal = ac.signal;
    var req = fetch(API + path, opts).catch(function () { throw offline(); }).then(function (res) {
      return res.text().catch(function () { return ''; }).then(function (txt) { return { res: res, txt: txt }; });
    });
    return timed(req, method === 'GET' ? TIMEOUT.read : TIMEOUT.write, ac).then(function (r) {
      var data = null;
      try { data = r.txt ? JSON.parse(r.txt) : null; } catch (e) { data = null; }
      if (r.res.ok) return data;
      throw httpFail(r.res, data);
    });
  }

  // repoSeen: the caller just read the repository itself (Test connection)
  function listRemote(c, repoSeen) {
    return gh('GET', c.rp + '/git/trees/' + encPath(c.branch) + '?recursive=1').then(function (d) {
      return { exists: true, items: parseTree(c, d && d.tree), truncated: !!(d && d.truncated) };
    }, function (e) {
      if (e.status === 409) return { exists: false, items: {}, truncated: false }; // an empty repository
      if (e.kind !== 'missing') throw e;
      // 404: no branch yet - or no such repository (a typo, private without a key, a key made for
      // another one). Only the first may reset what this device knows and create the branch.
      if (repoSeen) return { exists: false, items: {}, truncated: false };
      return gh('GET', c.rp).then(function () { return { exists: false, items: {}, truncated: false }; }, function (e2) {
        if (e2.kind !== 'missing') throw e2;
        throw fail('missing', 'GitHub cannot find ' + c.repo + (getKey() ? ' with this key' : '') + ': check the repository in Settings › Library sync' +
          (getKey() ? ' and that the key was made for it.' : ' (a private one needs the key).'), 404);
      });
    });
  }

  function parseTree(c, tree) {
    var out = {}, base = c.folder + '/';
    (tree || []).forEach(function (e) {
      if (!e || e.type !== 'blob' || typeof e.path !== 'string' || e.path.indexOf(base) !== 0) return;
      var rest = e.path.slice(base.length).split('/'), id = null, f = null, m;
      if (rest[0] === 'scans' && rest.length === 3) {
        id = 'scans/' + rest[1];
        if (rest[2] === 'meta.json') f = 'meta';
        else if (/\.midi?$/i.test(rest[2])) f = 'mid';
        else if (/\.(musicxml|xml)$/i.test(rest[2])) f = 'musicxml';
      } else if (rest[0] === 'played' && rest.length === 2 && (m = /^(.+)\.(mid|midi|json)$/i.exec(rest[1]))) {
        id = 'played/' + m[1];
        f = /json/i.test(m[2]) ? 'meta' : 'mid';
      }
      if (!id || !f) return;
      var r = out[id] = out[id] || { id: id, shas: {}, paths: {} };
      // the file soundLAB itself names wins when a folder holds more than one
      if (r.shas[f] && e.path !== filePath(c, id, f)) return;
      r.shas[f] = e.sha; r.paths[f] = e.path;
    });
    return out;
  }

  function currentSha(c, path) {
    return gh('GET', c.rp + '/contents/' + encPath(path) + '?ref=' + encodeURIComponent(c.branch)).then(function (d) {
      return d && d.sha || null;
    }, function (e) { if (e.kind === 'missing') return null; throw e; });
  }

  // PUT / DELETE with the sha we know; a 409/422 means it moved: fetch the fresh one and try ONCE more.
  // A brand-new entry (fresh) never takes over a file that appeared meanwhile: it fails, and the
  // next sync gives it a free name.
  function writeFile(c, method, path, body, fresh) {
    var url = c.rp + '/contents/' + encPath(path);
    return gh(method, url, body, true).catch(function (e) {
      if (e.kind === 'missing' && method === 'DELETE') return null; // already gone
      if (e.kind !== 'conflict') throw e;
      return currentSha(c, path).then(function (sha) {
        if (fresh) {
          // GitHub also answers 409 when the branch moved under the write (another device saving at
          // the same moment, "concurrent requests will conflict"): the file is still free, so once more
          if (sha) throw fail('conflict', 'An entry with this name just appeared on GitHub; it gets a free name at the next sync.', e.status);
          return gh(method, url, body, true);
        }
        if (method === 'DELETE' && !sha) return null;
        var b2 = Object.assign({}, body);
        if (sha) b2.sha = sha; else delete b2.sha;
        return gh(method, url, b2, true);
      });
    });
  }

  // the first write: an ORPHAN branch (its own root commit, no app code) holding README.md
  function createBranch(c) {
    return gh('POST', c.rp + '/git/blobs', { content: README, encoding: 'utf-8' }, true).then(function (blob) {
      return gh('POST', c.rp + '/git/trees', { tree: [{ path: c.folder + '/README.md', mode: '100644', type: 'blob', sha: blob.sha }] }, true);
    }).then(function (tree) {
      return gh('POST', c.rp + '/git/commits', { message: 'soundLAB: start the library', tree: tree.sha, parents: [] }, true);
    }).then(function (commit) {
      return gh('POST', c.rp + '/git/refs', { ref: 'refs/heads/' + c.branch, sha: commit.sha }, true).then(function () { return true; }, function (e) {
        if (e.kind === 'conflict') return false; // another device made it a moment ago: use that one
        throw e;
      });
    });
  }

  // a file of an entry from GitHub: the exact blob with a key, the public raw file without
  function fetchRemote(it, f) {
    var c = cfg(), r = it.remote;
    if (!r || r.loc !== c.loc || !r.shas || !r.shas[f]) return Promise.reject(fail('missing', 'That file is not on GitHub.'));
    var sha = String(r.shas[f]);
    // the exact version the listing named (also without a key for a public repository: one API request)
    var exact = function () { return gh('GET', c.rp + '/git/blobs/' + encodeURIComponent(sha)).then(function (d) { return unb64(d && d.content); }); };
    if (getKey()) return exact();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.reject(offline());
    var path = (r.paths && r.paths[f]) || filePath(c, it.id, f);
    var ac = typeof AbortController === 'function' ? new AbortController() : null;
    var req = fetch(RAW + '/' + c.repo + '/' + encPath(c.branch) + '/' + encPath(path), ac ? { cache: 'no-store', signal: ac.signal } : { cache: 'no-store' })
      .catch(function () { throw offline(); })
      .then(function (res) {
        if (!res.ok) throw httpFail(res, null);
        return res.arrayBuffer().then(function (b) { return new Uint8Array(b); });
      });
    // raw.githubusercontent.com is a CDN that keeps a file up to 5 minutes (max-age=300): right after
    // a change on another device it still hands out the old one (or a 404 for a new one). Kept here,
    // that old copy would never be replaced, so its git id is checked against the listing's.
    return timed(req, TIMEOUT.read, ac).then(function (bytes) {
      return blobSha(bytes).then(function (s) { return s && s !== sha ? exact() : bytes; });
    }, function (e) {
      if (e.kind === 'missing') return exact();
      throw e;
    });
  }

  // ---------------------------------------------------------------- state + sync

  var state = { busy: false, note: '', err: null, errKind: '', lastList: 0, lastOk: 0, branch: null, pending: 0, total: 0, online: true };
  var chain = Promise.resolve();

  function statusText() {
    var key = !!getKey(), p = state.pending;
    if (state.busy) return state.note || 'Talking to GitHub…';
    var waiting = p ? (key ? p + ' change' + (p === 1 ? '' : 's') + ' waiting to upload.' :
      p + ' entr' + (p === 1 ? 'y is' : 'ies are') + ' only on this device: add a key in Settings › Library sync to keep ' + (p === 1 ? 'it' : 'them') + ' on GitHub.') : '';
    if (state.err) return state.err + (p && state.errKind !== 'rate' && state.errKind !== 'offline' ? ' ' + waiting : '');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'Offline. ' + (waiting || 'Everything here is on this device.');
    if (waiting) return waiting;
    if (state.lastOk) return (key ? 'Up to date with GitHub' : 'Read-only (no key): showing what is on GitHub') + ' · ' + hhmm(state.lastOk) + '.';
    return key ? 'Not checked with GitHub yet.' : 'Saved on this device. Listing GitHub works without a key; saving there needs one (Settings › Library sync).';
  }
  function status() {
    return { busy: state.busy, pending: state.pending, total: state.total, error: state.err, errorKind: state.errKind, lastSync: state.lastOk, hasKey: !!getKey(), branch: state.branch, text: statusText() };
  }

  var changeT = null;
  function changed() {
    // one repaint per burst; listeners: the page, the Settings card, other pages
    if (changeT) return;
    changeT = setTimeout(function () {
      changeT = null;
      all().then(function (items) {
        state.pending = items.filter(function (it) { return it.pending; }).length;
        state.total = items.filter(function (it) { return it.pending !== 'delete'; }).length;
        App.emit('library:changed', { status: status() });
      });
    }, 0);
  }

  // run one sync at a time, in the order asked
  function sync(opts) {
    var p = chain.then(function () { return doSync(opts || {}); });
    chain = p.catch(function () {});
    return p;
  }

  function doSync(opts) {
    var c = cfg(), key = getKey();
    return all().then(function (items) {
      var pend = items.filter(function (it) { return it.pending; });
      var push = !!(opts.push && key && pend.length);
      var list = !!(opts.list || push);
      state.pending = pend.length;
      if (!list) { changed(); return status(); }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        state.err = offline().message; state.errKind = 'offline'; changed();
        return status();
      }
      state.busy = true; state.err = null; state.errKind = '';
      state.note = push ? 'Uploading to GitHub…' : 'Checking GitHub…';
      changed();
      var remote;
      return listRemote(c).then(function (r) {
        remote = r; state.branch = r.exists; state.lastList = Date.now();
        return mergeRemote(c, r);
      }).then(function () {
        return push ? pushAll(c, remote) : null;
      }).then(function () {
        return loadMetas(c);
      }).then(function () {
        state.lastOk = Date.now();
      }, function (e) {
        state.err = e && e.message ? e.message : 'Sync failed.';
        state.errKind = (e && e.kind) || 'error';
      }).then(function () {
        state.busy = false; state.note = '';
        return all();
      }).then(function (after) {
        state.pending = after.filter(function (it) { return it.pending; }).length;
        state.total = after.filter(function (it) { return it.pending !== 'delete'; }).length;
        changed();
        return status();
      });
    });
  }

  // the listing merged into the local records (local changes always win)
  function mergeRemote(c, r) {
    return all().then(function (items) {
      var byId = {}, ops = [];
      items.forEach(function (it) { byId[it.id] = it; });
      Object.keys(r.items).forEach(function (id) {
        var rem = r.items[id];
        if (!byId[id]) {
          ops.push(insert({ id: id, kind: kindOf(id), title: titleFromId(id), created: createdFromId(id), files: {}, meta: null,
            remote: { loc: c.loc, shas: rem.shas, paths: rem.paths }, pending: null, dirty: [], needMeta: !!rem.shas.meta, rev: 0 }, id, true));
          return;
        }
        ops.push(update(id, function (it) {
          if (it.pending === 'delete') return false;
          if (!it.remote || it.remote.loc !== c.loc) return false; // our own new entry with a taken name: renamed at upload
          var shas = it.remote.shas || {};
          ['mid', 'musicxml', 'meta'].forEach(function (f) {
            if (isDirty(it, f) || shas[f] === rem.shas[f]) return;
            if (rem.shas[f]) shas[f] = rem.shas[f]; else delete shas[f];
            if (f === 'meta') it.needMeta = !!rem.shas.meta;
            else if (it.files) delete it.files[f]; // changed on another device: fetched again when used
          });
          it.remote.shas = shas;
          it.remote.paths = Object.assign({}, it.remote.paths || {}, rem.paths);
        }));
      });
      // not on GitHub any more
      if (!r.truncated) {
        items.forEach(function (x) {
          if (r.items[x.id] || !x.remote || x.remote.loc !== c.loc) return;
          ops.push(update(x.id, function (it) {
            if (!it.remote || it.remote.loc !== c.loc) return false;
            // deleted on another device: drop it here too. Exception: what still has a change to send, or,
            // when the whole branch is gone, anything with a local copy - re-uploaded, never lost
            if (it.files && it.files.mid && (it.pending === 'put' || !r.exists)) {
              it.remote = null; it.pending = 'put'; it.op = 'add'; it.dirty = filesOf(it.kind).slice();
              return true;
            }
            it.pending = 'gone';
            return true;
          }));
        });
      }
      return Promise.all(ops).then(function () { return all(); }).then(function (now) {
        return Promise.all(now.filter(function (it) { return it.pending === 'gone'; }).map(function (it) { return delItem(it.id); }));
      });
    });
  }

  function loadMetas(c) {
    return all().then(function (items) {
      var todo = items.filter(function (it) {
        return it.pending !== 'delete' && !isDirty(it, 'meta') && it.remote && it.remote.loc === c.loc && it.remote.shas && it.remote.shas.meta && (it.needMeta || !it.meta);
      });
      var i = 0;
      function worker() {
        if (i >= todo.length) return Promise.resolve();
        var it = todo[i++];
        return fetchRemote(it, 'meta').then(function (bytes) {
          var meta = JSON.parse(dec.decode(bytes));
          return update(it.id, function (cur) {
            if (isDirty(cur, 'meta')) return false;
            applyMeta(cur, meta); cur.needMeta = false;
          });
        }, function (e) {
          if (e.kind === 'rate' || e.kind === 'offline' || e.kind === 'auth') throw e;
          return null; // a broken meta.json: the entry keeps its file name
        }).then(worker);
      }
      var pool = [];
      for (var k = 0; k < Math.min(4, todo.length); k++) pool.push(worker());
      return Promise.all(pool).then(function () { if (todo.length) changed(); });
    });
  }

  function applyMeta(it, meta) {
    meta = cleanMeta(meta);
    if (!meta) return;
    it.meta = meta;
    if (meta.title) it.title = cleanTitle(meta.title) || it.title;
    var t = meta.created ? Date.parse(meta.created) : 0;
    if (t > 0) it.created = t;
    if (meta.ideaId) it.ideaId = meta.ideaId;
  }
  // the fields soundLAB shows, each of its own type: a value of another type in a meta.json (a hand
  // edit, another app, {"toString": 1}) is dropped instead of breaking every list paint and search.
  // Fields soundLAB does not know are kept as they are: they are only ever written back (as JSON
  // by a rename), never shown.
  var META_STR = ['kind', 'title', 'source', 'created', 'app', 'key', 'scale', 'ideaId'], META_NUM = ['pages', 'bpm', 'root', 'notes', 'seconds'];
  function plain(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function cleanMeta(m) {
    if (!plain(m)) return null;
    var str = function (v) { return typeof v === 'string' ? v.slice(0, 300) : null; };
    var num = function (v) { return typeof v === 'number' && isFinite(v) ? v : null; };
    var out = {};
    Object.keys(m).forEach(function (k) { if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') out[k] = m[k]; });
    META_STR.forEach(function (k) { var v = str(m[k]); if (v != null) out[k] = v; else delete out[k]; });
    META_NUM.forEach(function (k) { var v = num(m[k]); if (v != null) out[k] = v; else delete out[k]; });
    if ('options' in out) {
      if (plain(m.options)) out.options = { tempo: num(m.options.tempo), program: num(m.options.program) != null ? num(m.options.program) : str(m.options.program), transpose: num(m.options.transpose) || 0 };
      else delete out.options;
    }
    if ('summary' in out) {
      if (plain(m.summary)) out.summary = { measures: num(m.summary.measures), notes: num(m.summary.notes), chords: num(m.summary.chords), seconds: num(m.summary.seconds) };
      else delete out.summary;
    }
    return out;
  }

  function metaOf(it) {
    var m = Object.assign({}, it.meta || {});
    m.kind = it.kind; m.title = it.title;
    if (!m.created) m.created = new Date(it.created || Date.now()).toISOString();
    return m;
  }

  function freeId(base, taken) {
    var id = base, n = 2;
    while (taken[id]) id = base + '-' + (n++);
    return id;
  }

  var moved = {}; // id -> new id, when an upload had to take a free name

  function pushAll(c, remote) {
    var created = remote.exists ? Promise.resolve() : createBranch(c).then(function (made) {
      remote.exists = true; state.branch = true;
      // made by another device in the meantime: list what it holds before writing next to it
      if (!made) return listRemote(c).then(function (r) { remote.items = r.items; remote.truncated = r.truncated; });
    });
    return created.then(function () { return all(); }).then(function (items) {
      var pend = items.filter(function (it) { return it.pending; }).sort(function (a, b) { return (a.created || 0) - (b.created || 0); });
      var taken = {};
      items.forEach(function (it) { taken[it.id] = true; });
      Object.keys(remote.items).forEach(function (id) { taken[id] = true; });
      var i = 0;
      function next() {
        if (i >= pend.length) return Promise.resolve();
        var it = pend[i++];
        state.note = (it.pending === 'delete' ? 'Deleting “' : 'Uploading “') + it.title + '”…';
        changed();
        var job = it.pending === 'delete' ? pushDelete(c, remote, it) : pushPut(c, remote, it, taken);
        return job.catch(function (e) {
          // the whole sync stops for these; everything stays pending
          if (e.kind === 'rate' || e.kind === 'offline' || e.kind === 'auth' || e.kind === 'perm' || e.kind === 'nokey') throw e;
          var msg = e.kind === 'missing' ? 'GitHub cannot find ' + c.repo + ' with this key: check the repository in Settings › Library sync and that the key includes it.' : e.message;
          return update(moved[it.id] || it.id, function (cur) { cur.error = msg; }).then(function () { if (e.kind === 'missing') throw fail('missing', msg); });
        }).then(next);
      }
      return next();
    });
  }

  function pushPut(c, remote, it, taken) {
    var rev = it.rev || 0, id = it.id, first = !it.remote || it.remote.loc !== c.loc, adopt = false, start = Promise.resolve();
    if (first && remote.items[id]) {
      start = isOurs(it, remote.items[id]).then(function (ours) {
        // our own earlier try (its answer was lost, or the repo/folder went away and back): carry on
        if (ours) { adopt = true; return; }
        // never overwrite an entry already on GitHub (another device, a hand-made folder): take a free name
        var nid = freeId(id, taken), oldId = id;
        taken[nid] = true;
        return rekey(oldId, nid).then(function (got) {
          if (!got) { id = null; return; } // deleted here meanwhile: nothing to send
          id = got; moved[oldId] = got; taken[got] = true;
        });
      });
    }
    return start.then(function () {
      if (!id) return null;
      var rem = first && !adopt ? { shas: {}, paths: {} } : (remote.items[id] || { shas: {}, paths: {} });
      var message = (!first && it.op === 'rename' ? 'soundLAB: rename ' : 'soundLAB: add ') + it.title;
      var files = filesOf(it.kind).filter(function (f) { return first || (it.dirty || []).indexOf(f) !== -1; });
      var paths = (!first && it.remote.paths) || {};
      var k = 0;
      function one() {
        if (k >= files.length) return Promise.resolve();
        var f = files[k++], bytes = contentOf(it, f);
        if (!bytes) return one();
        var path = paths[f] || rem.paths[f] || filePath(c, id, f), known = rem.shas[f];
        // deleted while this sync ran (another entry was uploading): send nothing more - the
        // repository is public and whatever reaches it stays in its history
        return getItem(id).then(function (now) {
          if (!now || now.pending === 'delete') return 'stop';
          // exactly these bytes are there already (an earlier try whose answer never came): nothing to send
          return known ? blobSha(bytes).then(function (s) { return s === known; }) : false;
        }).then(function (isSame) {
          if (isSame === 'stop') return 'stop';
          if (isSame) return { content: { sha: known } };
          var body = { message: message, content: b64(bytes), branch: c.branch };
          if (known) body.sha = known;
          return writeFile(c, 'PUT', path, body, first && !body.sha);
        }).then(function (res) {
          if (res === 'stop') return null;
          return update(id, function (cur) {
            if (!cur.remote || cur.remote.loc !== c.loc) cur.remote = { loc: c.loc, shas: {}, paths: {} };
            if (res && res.content && res.content.sha) cur.remote.shas[f] = res.content.sha;
            cur.remote.paths[f] = path;
            if ((cur.rev || 0) === rev) cur.dirty = (cur.dirty || []).filter(function (x) { return x !== f; });
            else if (first && cur.pending === 'put') { cur.op = 'add'; cur.dirty = filesOf(cur.kind).filter(function (x) { return files.indexOf(x) >= k || x === 'meta'; }); }
          });
        }).then(function (cur) { return cur ? one() : null; }); // removed here meanwhile: stop (its files go at the next delete)
      }
      return one().then(function () {
        return update(id, function (cur) {
          if ((cur.rev || 0) !== rev) return false; // changed meanwhile: stays pending, the next sync sends it
          cur.pending = null; cur.dirty = []; cur.op = null; cur.error = null;
        });
      });
    });
  }

  function pushDelete(c, remote, it) {
    var rem = remote.items[it.id];
    var files = rem ? Object.keys(rem.shas) : [];
    var k = 0;
    function one() {
      if (k >= files.length) return Promise.resolve();
      var f = files[k++];
      return writeFile(c, 'DELETE', rem.paths[f], { message: 'soundLAB: delete ' + it.title, sha: rem.shas[f], branch: c.branch }).then(one);
    }
    return one().then(function () { return delItem(it.id); });
  }

  // after a save / rename / delete: upload now when there is a key, else say where it is
  function settle(it, what, op) {
    changed();
    if (!getKey()) {
      return Promise.resolve({ id: it.id, title: it.title, uploaded: false, pending: true,
        message: what + ' on this device. Add a key in Settings › Library sync to ' + (op === 'rename' ? 'rename it' : 'keep it') + ' on GitHub too.' });
    }
    return sync({ push: true }).then(function (st) {
      var id = moved[it.id] || it.id;
      return getItem(id).then(function (cur) {
        if (op === 'delete') {
          return { id: id, title: it.title, uploaded: !cur, pending: !!cur,
            message: !cur ? what + ' here and from the library branch on GitHub (earlier versions stay in its history).' : '“' + it.title + '” is deleted from GitHub at the next sync. ' + (st.error || '') };
        }
        var up = !!(cur && !cur.pending && cur.remote);
        return { id: id, title: it.title, uploaded: up, pending: !up,
          message: up ? what + (op === 'rename' ? ' (GitHub too).' : ', on GitHub too.') : what + ' on this device. ' + (st.error || cur && cur.error || 'It uploads at the next sync.') };
      });
    });
  }

  // ---------------------------------------------------------------- saving

  // SheetLab's result: {title, source, pages, options {tempo, program, transpose}, summary
  // {measures, notes, chords, seconds}, midi (Uint8Array | ArrayBuffer), musicxml (string)}
  function saveScan(o) {
    o = o || {};
    var mid = toBytes(o.midi || o.mid);
    if (!mid || mid.length < 14) return Promise.reject(new Error('There is no MIDI to save.'));
    var xml = typeof o.musicxml === 'string' ? o.musicxml : (typeof o.xml === 'string' ? o.xml : null);
    var title = cleanTitle(o.title) || cleanTitle(String(o.source || '').replace(/\.[^.]+$/, '')) || 'Scan';
    var now = Date.now(), op = o.options || {}, sm = o.summary || {};
    var num = function (v) { v = +v; return isFinite(v) ? v : null; };
    var meta = {
      kind: 'scan', title: title, source: sourceKind(o.source), pages: num(o.pages), created: new Date(now).toISOString(),
      options: { tempo: num(op.tempo), program: op.program == null ? null : op.program, transpose: num(op.transpose) || 0 },
      summary: { measures: num(sm.measures), notes: num(sm.notes), chords: num(sm.chords), seconds: num(sm.seconds != null ? sm.seconds : sm.durationSeconds) },
      app: 'soundLAB ' + App.version
    };
    var it = { id: '', kind: 'scan', title: title, created: now,
      files: { mid: mid }, meta: meta, remote: null, pending: 'put', dirty: FILES.scan.slice(), op: 'add', error: null, rev: 1 };
    if (xml != null) it.files.musicxml = xml;
    // one save at a time, and the same scan twice (a double tap, an auto-save plus a tap) stays ONE
    // entry: same title, byte for byte the same MIDI and MusicXML. Anything that differs gets -2.
    var step = scanQ.then(function () {
      return all().then(function (items) {
        var dup = items.filter(function (x) {
          return x.kind === 'scan' && x.pending !== 'delete' && x.title === title && x.files && sameBytes(x.files.mid, mid) &&
            (typeof x.files.musicxml === 'string' ? x.files.musicxml : null) === xml;
        })[0];
        if (dup) return { id: dup.id, title: dup.title, uploaded: !dup.pending, pending: !!dup.pending, already: true, message: '“' + dup.title + '” is already in your library.' };
        return insert(it, 'scans/' + slugify(title)).then(function () { return { it: it }; });
      });
    });
    scanQ = step.catch(function () {});
    return step.then(function (r) { return r.it ? settle(r.it, 'Saved “' + title + '”', 'add') : r; });
  }
  var scanQ = Promise.resolve();
  // 'fur-elise.pdf' -> 'PDF': the original file's name can say more than the owner meant to keep on
  // GitHub (the title, which they see and can edit, already says what it is)
  function sourceKind(s) { var m = /\.([A-Za-z0-9]{1,5})$/.exec(String(s == null ? '' : s)); return m ? m[1].toUpperCase() : ''; }
  function sameBytes(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // a Studio idea {id, name, ts, source, bpm, root, scale, dur, notes [{m, v, t, d} seconds]}
  // as a Standard MIDI File, through the MIDI Hub's writer (SLMidiHub.scoreToMidi)
  function ideaMidi(idea) {
    var hub = window.SLMidiHub;
    if (!hub || typeof hub.scoreToMidi !== 'function') throw new Error('The MIDI writer (MIDI Hub) is not loaded.');
    var bpm = Math.max(20, Math.min(400, Math.round(+idea.bpm) || 120)), k = bpm / 60, end = 0, notes = [];
    (idea.notes || []).forEach(function (n) {
      var m = Math.round(+n.m);
      if (!(m >= 0 && m <= 127) || !isFinite(+n.t)) return;
      var t = Math.max(0, +n.t) * k, d = Math.max(0.02, +n.d || 0.05) * k;
      end = Math.max(end, t + d);
      notes.push({ t: t, d: d, m: m, v: Math.max(1, Math.min(127, Math.round(+n.v) || 90)), partId: 'played' });
    });
    if (!notes.length) throw new Error('This idea has no notes to save.');
    return hub.scoreToMidi({ title: cleanTitle(idea.name) || 'Played', bpm: bpm, len: Math.max(1, Math.ceil(end)), rhythmKnown: true, notes: notes });
  }

  // the "is it in already?" check and the insert run one save at a time: the auto-save of a new
  // idea and a tap on its Save to my library (or two quick taps) must not both find it missing
  var playedQ = Promise.resolve();
  function savePlayed(idea, opts) {
    opts = opts || {};
    if (!idea || !Array.isArray(idea.notes) || !idea.notes.length) return Promise.reject(new Error('Nothing played to save.'));
    var step = playedQ.then(function () { return addPlayed(idea); });
    playedQ = step.catch(function () {});
    return step.then(function (r) { return r.it ? settle(r.it, 'Saved “' + r.it.title + '”', 'add') : r; });
  }
  function addPlayed(idea) {
    return all().then(function (items) {
      var dup = idea.id && items.filter(function (it) { return it.ideaId === String(idea.id) && it.pending !== 'delete'; })[0];
      if (dup) return { id: dup.id, title: dup.title, uploaded: !dup.pending, pending: !!dup.pending, already: true, message: '“' + dup.title + '” is already in your library.' };
      var mid = ideaMidi(idea);
      var ts = +idea.ts > 0 ? +idea.ts : Date.now(), title = cleanTitle(idea.name) || 'Played';
      var notes = idea.notes.length, secs = +idea.dur > 0 ? +idea.dur : 0;
      var meta = {
        kind: 'played', title: title, created: new Date(ts).toISOString(), bpm: Math.round(+idea.bpm) || null,
        key: keyName(idea.root, idea.scale), root: typeof idea.root === 'number' ? idea.root : null, scale: idea.scale || null,
        notes: notes, seconds: secs, source: idea.source === 'rec' || !idea.source ? 'idea' : String(idea.source),
        ideaId: idea.id ? String(idea.id) : null, app: 'soundLAB ' + App.version
      };
      var it = { id: '', kind: 'played', title: title, created: ts,
        files: { mid: mid }, meta: meta, remote: null, pending: 'put', dirty: FILES.played.slice(), op: 'add', error: null, ideaId: meta.ideaId, rev: 1 };
      return insert(it, 'played/' + stamp(new Date(ts)) + '-' + slugify(title)).then(function () { return { it: it }; });
    });
  }

  function rename(id, title) {
    title = cleanTitle(title);
    if (!title) return Promise.reject(new Error('Give it a name.'));
    return getItem(id).then(function (it) {
      if (!it || it.pending === 'delete') throw new Error('That entry is not in the library.');
      if (title === it.title) return { id: id, title: title, uploaded: !it.pending, message: '' };
      // meta.json keeps everything else: fetch it first when only the listing is here
      var meta = null;
      var ready = (!it.meta && it.remote && it.remote.shas && it.remote.shas.meta)
        ? fetchRemote(it, 'meta').then(function (b) { try { meta = JSON.parse(dec.decode(b)); } catch (e) { /* keep the file name */ } })
        : Promise.resolve();
      return ready.then(function () {
        return update(id, function (cur) {
          if (meta && !cur.meta) applyMeta(cur, meta);
          cur.title = title;
          cur.meta = Object.assign({}, cur.meta || {}, { title: title });
          if (cur.pending !== 'put') { cur.op = 'rename'; cur.dirty = []; }
          cur.pending = 'put';
          addDirty(cur, 'meta');
          cur.error = null;
          bump(cur);
        });
      }).then(function (cur) {
        if (!cur) throw new Error('That entry is not in the library.');
        return settle(cur, 'Renamed to “' + title + '”', 'rename');
      });
    });
  }

  function remove(id) {
    return getItem(id).then(function (it) {
      if (!it) return { id: id, deleted: true, message: '' };
      // never uploaded: gone at once - unless its first upload is running right now (then the
      // queued sync deletes whatever part of it already reached GitHub)
      var uploading = state.busy && it.pending === 'put' && !!getKey();
      if ((!it.remote || it.remote.loc !== cfg().loc) && !uploading) {
        return delItem(id).then(function () { changed(); return { id: id, deleted: true, message: 'Deleted “' + it.title + '”.' }; });
      }
      if (!getKey()) throw needKey('Deleting from GitHub');
      return update(id, function (cur) { cur.pending = 'delete'; cur.error = null; bump(cur); }).then(function (cur) {
        return settle(cur || it, 'Deleted “' + it.title + '”', 'delete');
      }).then(function (r) { r.deleted = r.uploaded; return r; });
    });
  }

  // ---------------------------------------------------------------- using an entry

  function fileOf(id, f) {
    return getItem(id).then(function (it) {
      if (!it) throw new Error('That entry is not in the library.');
      if (it.files && (f === 'mid' ? it.files.mid : typeof it.files.musicxml === 'string')) return { it: it, data: it.files[f] };
      return fetchRemote(it, f).then(function (bytes) {
        var data = f === 'mid' ? bytes : dec.decode(bytes);
        // keep it here for offline use (the listing drops it again when it changes on GitHub)
        return update(id, function (cur) { cur.files = cur.files || {}; cur.files[f] = data; }).then(function (cur) {
          changed();
          return { it: cur || it, data: data };
        });
      });
    });
  }
  function midiBytes(id) { return fileOf(id, 'mid').then(function (r) { return new Uint8Array(r.data); }); }

  function playOnSynth(id) {
    return fileOf(id, 'mid').then(function (r) {
      var hub = window.SLMidiHub && SLMidiHub.player;
      if (!hub) throw new Error('The MIDI Hub is not loaded.');
      return hub.loadFile(slugify(r.it.title) + '.mid', bufOf(r.data)).then(function () {
        hub.show();
        // iPad Safari / Chrome have no Web MIDI: the Player opens, but nothing reaches a synth here
        if (App.midi && App.midi.supported === false) {
          App.toast('No MIDI in this browser: open soundLAB in a Web MIDI browser app (iPad) or Chrome / Edge; with sync the library is there too.', 7000);
          return null;
        }
        return r.it.title;
      });
    });
  }
  function practice(id) {
    return fileOf(id, 'mid').then(function (r) {
      var ws = window.Woodshed;
      if (!ws || typeof ws.importMidi !== 'function' || typeof ws.addScore !== 'function') throw new Error('The Woodshed is not available.');
      var sc = ws.importMidi(bufOf(r.data), r.it.title);
      if (!sc) throw new Error('The Woodshed could not read it.');
      App.switchTo('shed');
      // the same piece tapped again is shown, not added twice (and its row is scrolled into view)
      if (typeof ws.addOrShow === 'function') ws.addOrShow(sc); else ws.addScore(sc);
      return r.it.title;
    });
  }
  function openAsTab(id) {
    return fileOf(id, 'mid').then(function (r) {
      if (!App.songs) throw new Error('The Songs page is not available.');
      var song = App.songs.fromMidi(bufOf(r.data), r.it.title);
      if (!song) throw new Error('Nothing in it fits a guitar.');
      song.from = 'from My library';
      App.songs.load(song);
      App.switchTo('songs');
      return r.it.title;
    });
  }
  // the file to the device the way Scan hands out its files (App.saveFile: a download, the iOS
  // home-screen app's share sheet, a reason in the Android app, whose WebView has no downloads)
  function download(id, f) {
    f = f === 'musicxml' ? 'musicxml' : 'mid';
    return fileOf(id, f).then(function (r) {
      var name = App.fileName(r.it.title, f);
      var how = App.saveFile(name, r.data, f === 'mid' ? 'audio/midi' : 'application/vnd.recordare.musicxml+xml',
        { apkNote: 'The Android app cannot save files yet: open soundLAB in Chrome to download, or use Play on synth / Practice here.' });
      return how === 'downloaded' || how === 'shared' ? name : null;
    });
  }

  // repo / branch / folder changed: entries saved elsewhere upload to the new place
  function setConfig(c) {
    var before = cfg().loc;
    if (c.repo != null) App.store.set('library.repo', cleanRepo(c.repo) || DEF.repo);
    if (c.branch != null) App.store.set('library.branch', cleanBranch(c.branch) || DEF.branch);
    if (c.folder != null) App.store.set('library.folder', cleanFolder(c.folder) || DEF.folder);
    var now = cfg();
    if (now.loc === before) return Promise.resolve(now);
    state.lastList = 0; state.lastOk = 0; state.branch = null; state.err = null;
    return all().then(function (items) {
      return Promise.all(items.map(function (it) {
        if (!it.remote || it.remote.loc === now.loc) return null;
        if (it.pending === 'delete') return delItem(it.id);
        if (!it.files || !it.files.mid) return delItem(it.id); // only listed from the old place
        return update(it.id, function (cur) { cur.remote = null; cur.pending = 'put'; cur.dirty = filesOf(cur.kind).slice(); cur.op = 'add'; bump(cur); });
      }));
    }).then(function () { changed(); return now; });
  }

  function testConnection() {
    var c = cfg();
    if (!getKey()) {
      return listRemote(c).then(function (r) {
        return 'No key yet. Reading works without one: ' + (r.exists ? Object.keys(r.items).length + ' entr' + (Object.keys(r.items).length === 1 ? 'y' : 'ies') + ' on the ' + c.branch + ' branch.' : 'the ' + c.branch + ' branch is not there yet.') + ' Saving to GitHub needs a key.';
      }, function (e) { return e.message; });
    }
    var repoOk = false;
    return gh('GET', c.rp).then(function (repo) {
      repoOk = true;
      return listRemote(c, true).then(function (r) {
        var n = Object.keys(r.items).length;
        var msg = 'Connected to ' + ((repo && repo.full_name) || c.repo) + '. ' +
          (r.exists ? 'The ' + c.branch + ' branch holds ' + n + ' entr' + (n === 1 ? 'y' : 'ies') + '.' : 'The ' + c.branch + ' branch is created with your first save.');
        if (repo && repo.permissions && repo.permissions.push === false) msg += ' This account cannot write to the repository, so saving will fail.';
        else msg += ' Writing is confirmed by the first save.';
        return msg;
      });
    }).catch(function (e) {
      // a refused listing after the repository answered (a rate limit, a dropped connection) says so too
      if (e && e.kind === 'missing' && !repoOk) return 'GitHub cannot find ' + c.repo + ' with this key: check the repository name and that the key was made for it (Only select repositories).';
      return (e && e.message) || 'That did not work.';
    });
  }

  // ---------------------------------------------------------------- the page

  var els = {};
  var ui = { filter: 'all', q: '', renaming: null, draft: '', armed: null, armT: null, busy: {}, paintN: 0, shown: false };

  function css() {
    App.injectCSS('library',
      '#panel-library{max-width:860px;margin:0 auto}' +
      '.lib-tools{margin-top:12px}' +
      '.lib-in{-webkit-appearance:none;appearance:none;background-color:var(--card2);color:var(--text);border:1px solid var(--ctl-border);border-radius:10px;padding:6px 12px;' +
        'min-height:var(--h-ctl);font-size:16px;font-weight:500;font-family:var(--font-body);box-shadow:var(--shadow-1);min-width:0}' +
      '.lib-in:focus{outline:none;border-color:var(--accent-line)}' +
      '.lib-in:focus-visible{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}' +
      '#lib-q{flex:1 1 180px;max-width:360px}' +
      '#lib-status{margin-top:6px;line-height:1.45}' +
      '#lib-status.err{color:var(--warn)}' +
      '.lib-item{padding:14px 16px;margin-bottom:12px}' +
      '.lib-top{display:flex;gap:10px;align-items:baseline;justify-content:space-between;flex-wrap:wrap}' +
      '.lib-title{font-size:16px;font-weight:600;overflow-wrap:anywhere;min-width:0}' +
      '.lib-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}' +
      '.lib-kind{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:999px;font-size:11.5px;font-weight:600;' +
        'letter-spacing:.3px;color:var(--accent-ink);background:var(--accent-soft);border:1px solid var(--accent-line);vertical-align:2px}' +
      '.lib-state{font-size:12.5px;color:var(--muted)}' +
      '.lib-state.wait{color:var(--accent-ink)}.lib-state.bad{color:var(--warn)}' +
      '.lib-info{margin-top:4px}' +
      '.lib-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}' +
      '.lib-acts .btn{display:inline-flex;align-items:center;gap:6px}' +
      '.lib-ren{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:2px}' +
      '.lib-ren .lib-in{flex:1 1 200px}' +
      '.lib-empty{padding:18px 4px;line-height:1.5}' +
      '.lib-set .row{margin-top:12px}' +
      '.lib-set label.field{flex:1 1 170px;min-width:0}' +
      '.lib-set label.field .lib-in{width:100%;text-transform:none;letter-spacing:0}' +
      '.lib-set ol{margin:6px 0 0;padding-left:20px}.lib-set li{margin:3px 0}.lib-set a{color:var(--accent-ink)}' +
      '.lib-pub{margin-top:8px;line-height:1.45;color:var(--text)}.lib-pub b{color:var(--warn)}' +
      '#lib-set-msg{margin-top:10px;line-height:1.45}' +
      '#lib-set-keystate{margin-top:6px}'
    );
  }

  function init(rootEl) {
    css();
    var f = App.store.get('library.filter', 'all');
    ui.filter = f === 'scan' || f === 'played' ? f : 'all';
    rootEl.innerHTML =
      '<div class="card">' +
        '<div class="row spread">' +
          '<h2 style="margin:0">My library</h2>' +
          '<span class="row tight">' +
            '<button type="button" class="btn sm primary" id="lib-sync" title="Check GitHub and upload what is waiting">Sync now</button>' +
            '<button type="button" class="btn sm" id="lib-setup" title="Settings › Library sync: the repository and the access key">Sync settings</button>' +
          '</span>' +
        '</div>' +
        '<div class="muted small" id="lib-status" role="status" aria-live="polite"></div>' +
        '<div class="row tight lib-tools">' +
          '<div class="seg" id="lib-filter" role="group" aria-label="Show">' +
            '<button type="button" data-f="all">All</button>' +
            '<button type="button" data-f="scan">Scans</button>' +
            '<button type="button" data-f="played">Played</button>' +
          '</div>' +
          '<input type="search" class="lib-in" id="lib-q" placeholder="Search titles" aria-label="Search the library" autocomplete="off">' +
        '</div>' +
        '<details class="tips"><summary>What is in here</summary>' +
          '<div>Scans you save from Play › Scan (MIDI + MusicXML) and what you play (Studio ideas, with <b>Save what I play</b> on, ' +
          'or Save to my library on an idea). Everything is kept on this device first; with an access key it is also kept in your GitHub ' +
          'repository on its own <b>library</b> branch, so every device sees the same library. Everything synced is as public as that ' +
          'repository (' + esc(DEF.repo) + ' is public): anyone can read it, and it stays in the branch history even after Delete.</div>' +
        '</details>' +
      '</div>' +
      '<div id="lib-list"></div>';
    els.root = rootEl;
    els.list = document.getElementById('lib-list');
    els.status = document.getElementById('lib-status');
    els.filter = document.getElementById('lib-filter');
    els.q = document.getElementById('lib-q');
    paintFilter();

    document.getElementById('lib-sync').addEventListener('click', function () {
      if (state.busy) { App.toast('Already syncing with GitHub…', 2400); return; }
      sync({ list: true, push: true }).then(function (st) { if (st.error) App.toast(st.error, 5200); });
    });
    document.getElementById('lib-setup').addEventListener('click', function () {
      App.switchTo('settings');
      setTimeout(function () {
        var c = document.getElementById('set-library-card');
        if (c && c.scrollIntoView) c.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }, 60);
    });
    els.filter.addEventListener('click', function (e) {
      var b = e.target.closest('[data-f]');
      if (!b) return;
      ui.filter = b.getAttribute('data-f');
      App.store.set('library.filter', ui.filter);
      paintFilter();
      paint();
    });
    els.q.addEventListener('input', function () { ui.q = this.value; paint(); });
    els.list.addEventListener('click', onListClick);
    els.list.addEventListener('input', function (e) { if (e.target.id === 'lib-ren-in') ui.draft = e.target.value; });
    els.list.addEventListener('keydown', function (e) {
      if (e.target.id !== 'lib-ren-in') return;
      if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
      else if (e.key === 'Escape') { e.preventDefault(); ui.renaming = null; paint(); }
    });
    App.on('library:changed', function () { if (App.active === 'library') paint(); paintSettings(); });
    // the network back / gone: the status changes only where the library is in use, so a phone that
    // drops signal never creates the 'soundlab-library' database for an owner who never opened it
    // (and coming back sends nothing by itself: Sync now, a save or the next visit does)
    function onNet(online) {
      if (online) state.err = null;
      if (dbp || mem || App.active === 'library' || (setEl && setEl.offsetParent)) changed();
    }
    window.addEventListener('online', function () { onNet(true); });
    window.addEventListener('offline', function () { onNet(false); });
  }

  function paintFilter() {
    els.filter.querySelectorAll('[data-f]').forEach(function (b) {
      var on = b.getAttribute('data-f') === ui.filter;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function stateOf(it) {
    var key = !!getKey();
    if (it.error) return { cls: 'bad', txt: 'Not uploaded: ' + it.error };
    if (it.pending === 'put') {
      if (!it.remote) return key ? { cls: 'wait', txt: 'Waiting to upload' } : { cls: '', txt: 'On this device only' };
      return key ? { cls: 'wait', txt: 'Change waiting to upload' } : { cls: 'wait', txt: 'Changed here; needs the key to upload' };
    }
    if (it.remote) return { cls: '', txt: it.files && it.files.mid ? 'On GitHub · kept here' : 'On GitHub' };
    return { cls: '', txt: 'On this device' };
  }

  function info(it) {
    var m = it.meta || {}, bits = [];
    if (it.created) bits.push(new Date(it.created).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + hhmm(it.created));
    if (it.kind === 'scan') {
      var s = m.summary || {};
      if (m.pages) bits.push(m.pages + ' page' + (m.pages === 1 ? '' : 's'));
      if (s.measures) bits.push(s.measures + ' measures');
      if (s.notes) bits.push(s.notes + ' notes');
      if (s.seconds) bits.push(clock(s.seconds));
      if (m.source) bits.push(m.source);
    } else {
      if (m.bpm) bits.push(m.bpm + ' BPM');
      if (m.key) bits.push(m.key);
      if (m.notes) bits.push(m.notes + ' notes');
      if (m.seconds) bits.push(clock(m.seconds));
      if (m.source === 'retro') bits.push('kept from the last seconds');
      else if (m.source === 'woodshed') bits.push('a Woodshed run');
    }
    if (!it.meta && it.remote) bits.push('details load from GitHub');
    return bits.join(' · ');
  }

  function itemHtml(it) {
    var st = stateOf(it), id = esc(it.id), busy = ui.busy[it.id], t = esc(it.title);
    // the pill's separator is for screen readers only ("Menuetto, Scan", not "MenuettoScan"); the
    // title text node itself stays exactly the title
    var title = ui.renaming === it.id
      ? '<div class="lib-ren"><input type="text" class="lib-in" id="lib-ren-in" value="' + esc(ui.draft) + '" maxlength="120" aria-label="New name">' +
        '<button type="button" class="btn sm primary" data-act="ren-ok">Save</button><button type="button" class="btn sm" data-act="ren-no">Cancel</button></div>'
      : '<div class="lib-title">' + t + '<span class="lib-kind"><span class="lib-sr">, </span>' + (it.kind === 'scan' ? 'Scan' : 'Played') + '</span></div>';
    var dis = busy ? ' disabled' : '';
    var armed = ui.armed === it.id;
    // an entry that reached GitHub leaves it from the branch, not from the (public) history
    var onGh = !!(it.remote && it.remote.loc === cfg().loc);
    var delLbl = armed ? (onGh ? 'Delete? It stays in GitHub’s history' : 'Delete? Tap again') : 'Delete';
    var delAria = armed ? 'Delete ' + t + ': tap again.' + (onGh ? ' Earlier versions stay in the GitHub history.' : '') : 'Delete ' + t;
    var lbl = function (s) { return ' aria-label="' + s + '"'; };
    return '<div class="card lib-item" data-id="' + id + '">' +
      '<div class="lib-top">' + title + '<span class="lib-state ' + st.cls + '">' + esc(busy || st.txt) + '</span></div>' +
      '<div class="muted small lib-info">' + esc(info(it)) + '</div>' +
      '<div class="lib-acts">' +
        '<button type="button" class="btn sm primary" data-act="synth"' + dis + lbl('Play ' + t + ' on synth') + ' title="Play it on your synth from the MIDI Hub Player">' + App.icon('play', 14) + 'Play on synth</button>' +
        '<button type="button" class="btn sm" data-act="practice"' + dis + lbl('Practice ' + t) + ' title="Practice it in the Woodshed">Practice</button>' +
        '<button type="button" class="btn sm" data-act="tab"' + dis + lbl('Open ' + t + ' as tab') + ' title="Show it as guitar tab on the Songs page">Open as tab</button>' +
        '<button type="button" class="btn sm" data-act="mid"' + dis + lbl('Download ' + t + ' as .mid') + ' title="Download the MIDI file">' + App.icon('down', 14) + '.mid</button>' +
        (it.kind === 'scan' && (it.files && typeof it.files.musicxml === 'string' || it.remote && it.remote.shas && it.remote.shas.musicxml)
          ? '<button type="button" class="btn sm" data-act="musicxml"' + dis + lbl('Download ' + t + ' as .musicxml') + ' title="Download the MusicXML score">' + App.icon('down', 14) + '.musicxml</button>' : '') +
        '<button type="button" class="btn sm" data-act="rename"' + dis + lbl('Rename ' + t) + '>Rename</button>' +
        '<button type="button" class="btn sm danger" data-act="delete"' + dis + lbl(delAria) + '>' + delLbl + '</button>' +
      '</div>' +
    '</div>';
  }
  // one entry's card; details that cannot be shown (a broken record) never blank the whole list
  function cardHtml(it) {
    try { return itemHtml(it); } catch (e) {
      var t = '';
      try { t = typeof it.title === 'string' ? it.title : ''; } catch (x) { t = ''; }
      return '<div class="card lib-item" data-id="' + esc(String(it && it.id)) + '"><div class="lib-top"><div class="lib-title">' + esc(t || 'Untitled') +
        '</div></div><div class="muted small lib-info">Details unreadable.</div><div class="lib-acts">' +
        '<button type="button" class="btn sm danger" data-act="delete">' + (ui.armed === (it && it.id) ? 'Delete? Tap again' : 'Delete') + '</button></div></div>';
    }
  }

  function paint() {
    if (!els.list) return Promise.resolve();
    var n = ++ui.paintN;
    els.status.textContent = statusText();
    els.status.classList.toggle('err', !!state.err && !state.busy);
    return all().then(function (items) {
      if (n !== ui.paintN) return;
      var q = ui.q.trim().toLowerCase();
      var shown = items.filter(function (it) {
        if (it.pending === 'delete') return false;
        if (ui.filter !== 'all' && it.kind !== ui.filter) return false;
        if (!q) return true;
        var m = it.meta || {};
        try { return (it.title + ' ' + (m.source || '') + ' ' + (m.key || '')).toLowerCase().indexOf(q) !== -1; } catch (e) { return false; }
      }).sort(function (a, b) { return (b.created || 0) - (a.created || 0) || (a.id < b.id ? -1 : 1); });
      var any = items.some(function (it) { return it.pending !== 'delete'; });
      var fa = document.activeElement;
      var focusRename = ui.renaming && fa && fa.id === 'lib-ren-in';
      // the button the keyboard / screen reader was on: the list is rebuilt, so it is found again in
      // its entry's new card (the armed Delete must be reachable within its few seconds)
      var fCard = !focusRename && fa && els.list.contains(fa) && fa.closest ? fa.closest('[data-id]') : null;
      var fId = fCard && fCard.getAttribute('data-id'), fAct = fa && fa.getAttribute && fa.getAttribute('data-act');
      if (!shown.length) {
        els.list.innerHTML = '<div class="muted lib-empty">' + (any
          ? 'Nothing matches. Try All, or another search.'
          : 'Nothing here yet. Scans you save from Play › Scan land here, and so does what you play: capture an idea with the ● in the clef menu or “Keep the last 30s” on Studio › Ideas, with <b>Save what I play</b> on (Settings › Library sync).') + '</div>';
      } else {
        els.list.innerHTML = shown.map(cardHtml).join('');
      }
      if (fId && fAct && !ui.renaming) {
        var cardNow = null;
        Array.prototype.forEach.call(els.list.querySelectorAll('[data-id]'), function (c) { if (c.getAttribute('data-id') === fId) cardNow = c; });
        var back = cardNow && cardNow.querySelector('[data-act="' + fAct + '"]');
        if (back && back.disabled) back = cardNow.querySelector('[data-act]:not([disabled])') || back;
        if (back) { try { back.focus({ preventScroll: true }); } catch (e) { /* fine */ } }
      }
      if (focusRename || ui.renaming) {
        var inp = document.getElementById('lib-ren-in');
        if (inp && focusRename) { inp.focus(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* type without selection */ } }
      }
    });
  }

  function say(msg, ms) { if (msg) App.toast(msg, ms || 4200); }
  function errSay(e) { say(e && e.message ? e.message : 'That did not work.', 5200); }

  function act(id, label, fn) {
    ui.busy[id] = label;
    paint();
    return Promise.resolve().then(fn).then(function (r) { delete ui.busy[id]; paint(); return r; }, function (e) { delete ui.busy[id]; paint(); errSay(e); });
  }

  function commitRename() {
    var id = ui.renaming, title = cleanTitle(ui.draft);
    if (!id) return;
    ui.renaming = null;
    if (!title) { paint(); return; }
    act(id, 'Renaming…', function () { return rename(id, title).then(function (r) { say(r.message); }); });
  }

  function onListClick(e) {
    var b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    var card = b.closest('[data-id]'), id = card && card.getAttribute('data-id'), a = b.getAttribute('data-act');
    if (!id) return;
    if (a !== 'delete' && ui.armed) { ui.armed = null; clearTimeout(ui.armT); }
    if (a === 'synth') act(id, 'Opening…', function () { return playOnSynth(id).then(function (t) { if (t) say('On the synth: ' + t); }); });
    else if (a === 'practice') act(id, 'Opening…', function () { return practice(id).then(function (t) { say('In the Woodshed: ' + t); }); });
    else if (a === 'tab') act(id, 'Opening…', function () { return openAsTab(id); });
    else if (a === 'mid' || a === 'musicxml') act(id, 'Downloading…', function () { return download(id, a); });
    else if (a === 'rename') {
      getItem(id).then(function (it) { if (!it) return; ui.renaming = id; ui.draft = it.title; return paint(); }).then(function () {
        var inp = document.getElementById('lib-ren-in');
        if (inp) { inp.focus(); inp.select(); }
      });
    } else if (a === 'ren-ok') commitRename();
    else if (a === 'ren-no') { ui.renaming = null; paint(); }
    else if (a === 'delete') {
      if (ui.armed !== id) {
        // two-step: the first tap arms this entry for a few seconds
        ui.armed = id;
        clearTimeout(ui.armT);
        ui.armT = setTimeout(function () { ui.armed = null; paint(); }, 4000);
        paint();
        return;
      }
      ui.armed = null; clearTimeout(ui.armT);
      act(id, 'Deleting…', function () { return remove(id).then(function (r) { say(r.message); }); });
    }
  }

  function onShow() {
    ui.shown = true;
    paint();
    // the page shows what is on GitHub: one listing per visit (Sync now forces one), plus
    // uploading what the owner already saved while there is a key
    if (Date.now() - state.lastList > LIST_TTL) sync({ list: true, push: true });
  }
  function onHide() {
    ui.armed = null; clearTimeout(ui.armT);
    ui.renaming = null;
  }
  function onBack() {
    if (ui.renaming || ui.armed) { ui.renaming = null; ui.armed = null; paint(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- Settings › Library sync

  var setEl = null;
  function mountSettings(el) {
    if (!el) return;
    css();
    setEl = el;
    var c = cfg();
    el.classList.add('lib-set');
    el.innerHTML =
      '<div class="muted small">Scans you save and what you play are kept on this device. With an access key they are also kept in a folder of your ' +
        'GitHub repository, on a branch of their own (<b>library</b>), so every device sees the same library and saving never redeploys the app. ' +
        'Without a key the library still lists and opens what is on GitHub and saves on this device.</div>' +
      '<div class="small lib-pub" id="lib-set-public"><b>What is saved to GitHub is public</b> when the repository is public (' + esc(DEF.repo) + ' is): ' +
        'anyone can open it and download it, and it stays in the repository’s history even after Delete. For private scans, put a ' +
        '<b>private</b> repository of your own in Advanced › Repository below (then every device needs a key, also for listing).</div>' +
      '<div class="row">' +
        '<label class="field">Access key<input type="password" class="lib-in" id="lib-set-key" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…"></label>' +
        '<button type="button" class="btn sm" id="lib-set-test">Test connection</button>' +
        '<button type="button" class="btn sm danger" id="lib-set-forget">Forget key</button>' +
      '</div>' +
      '<div class="muted small" id="lib-set-keystate"></div>' +
      '<div class="muted small" id="lib-set-msg" role="status" aria-live="polite"></div>' +
      '<label class="set-check"><input type="checkbox" id="lib-set-played"><span>Save what I play' +
        '<small>Every idea you capture (the ● in the clef menu, Keep the last 30s on Studio › Ideas) goes to the library as a MIDI file too, ' +
        'and with a key to GitHub (public in a public repository). On by default once a key is set.</small></span></label>' +
      '<details class="tips"><summary>Advanced: where the library is kept</summary><div>' +
        'Changing these uploads every entry again to the new place.' +
        '<div class="row">' +
          '<label class="field">Repository<input type="text" class="lib-in" id="lib-set-repo" value="' + esc(c.repo) + '" spellcheck="false" autocomplete="off" autocapitalize="off"></label>' +
          '<label class="field">Branch<input type="text" class="lib-in" id="lib-set-branch" value="' + esc(c.branch) + '" spellcheck="false" autocomplete="off" autocapitalize="off"></label>' +
          '<label class="field">Folder<input type="text" class="lib-in" id="lib-set-folder" value="' + esc(c.folder) + '" spellcheck="false" autocomplete="off" autocapitalize="off"></label>' +
        '</div></div></details>' +
      '<details class="tips"><summary>How to make an access key</summary><ol>' +
        '<li>On a computer or tablet signed in to GitHub, open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer"><b>github.com/settings/personal-access-tokens/new</b></a> ' +
          '(Settings › Developer settings › Personal access tokens › Fine-grained tokens › Generate new token).</li>' +
        '<li>Name it <b>soundLAB library</b> and pick an <b>Expiration</b> (90 days is a good habit; you can make a new one any time).</li>' +
        '<li>Repository access: <b>Only select repositories</b> › <b>GuitarPak</b> (or the repository above).</li>' +
        '<li>Repository permissions › <b>Contents</b> › <b>Read and write</b>. Nothing else (Metadata: read is added by itself).</li>' +
        '<li>Generate token, copy it (it starts with github_pat_) and paste it into Access key above, then Test connection.</li>' +
        '<li>Each device needs a key once. GitHub shows a token only once, so either repeat these steps on each device (one token per ' +
          'device, so a lost phone can be revoked alone), or keep the token in your password manager and paste it from there. ' +
          'The first save creates the <b>library</b> branch.</li>' +
      '</ol></details>' +
      '<details class="tips"><summary>Keep it safe</summary><div>' +
        'The key stays on this device (its own storage, never in Export settings) and is only sent to api.github.com. ' +
        'It can change everything in the repository, the app code on main too: protect <b>main</b> with a ruleset or branch protection ' +
        '(Settings › Rules › Rulesets: restrict deletions, block force pushes, require a pull request) so a leaked key cannot touch the app. ' +
        'Never share the key or paste it anywhere else. Plugins run with full access to the app and can read its storage, so only install plugins you trust. ' +
        'Forget key removes it from this device; revoke it on GitHub if a device is lost.</div></details>';

    var repoIn = document.getElementById('lib-set-repo'), brIn = document.getElementById('lib-set-branch'), foIn = document.getElementById('lib-set-folder');
    var keyIn = document.getElementById('lib-set-key'), msg = document.getElementById('lib-set-msg');
    function setMsg(t) { msg.textContent = t || ''; }
    // the key pasted into the wrong field: never kept there (it would be a name in backups and URLs)
    function notKeyHere(inp, was) {
      if (!looksLikeKey(inp.value)) return false;
      inp.value = was;
      setMsg('That looks like an access key: paste it into Access key below. It was not saved here.');
      return true;
    }
    repoIn.addEventListener('change', function () {
      if (notKeyHere(this, cfg().repo)) return;
      var v = cleanRepo(this.value);
      if (!v) { setMsg('Write the repository as owner/name, e.g. ' + DEF.repo + '.'); this.value = cfg().repo; return; }
      setConfig({ repo: v }).then(function (n) { repoIn.value = n.repo; setMsg('Repository set to ' + n.repo + '.'); });
    });
    brIn.addEventListener('change', function () {
      if (notKeyHere(this, cfg().branch)) return;
      var v = cleanBranch(this.value);
      if (!v) { setMsg('Use a branch of its own (like library): main, master and gh-pages hold the app (refs/heads/… names them too), and saving there would redeploy it.'); this.value = cfg().branch; return; }
      setConfig({ branch: v }).then(function (n) { brIn.value = n.branch; setMsg('Branch set to ' + n.branch + '.'); });
    });
    foIn.addEventListener('change', function () {
      if (notKeyHere(this, cfg().folder)) return;
      var v = cleanFolder(this.value);
      if (!v) { setMsg('Use a plain folder name, e.g. library.'); this.value = cfg().folder; return; }
      setConfig({ folder: v }).then(function (n) { foIn.value = n.folder; setMsg('Folder set to ' + n.folder + '.'); });
    });
    function takeKey() {
      var v = cleanKey(keyIn.value);
      if (!v) return false;
      keyIn.value = '';
      if (!keyOk(v)) { setMsg('That is not a GitHub access key (it has characters keys never have). Copy it again from GitHub and paste it here.'); return false; }
      if (!setKey(v)) { setMsg('This browser does not let soundLAB keep the key here (private mode or a locked-down frame).'); return false; }
      setMsg('Key saved on this device.');
      paintSettings();
      return true;
    }
    keyIn.addEventListener('change', takeKey);
    keyIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); takeKey(); } });
    document.getElementById('lib-set-test').addEventListener('click', function () {
      takeKey();
      var b = this;
      b.disabled = true;
      setMsg('Checking…');
      testConnection().then(function (t) { setMsg(t); }, function (e) { setMsg(e && e.message); }).then(function () { b.disabled = false; });
    });
    document.getElementById('lib-set-forget').addEventListener('click', function () {
      keyIn.value = '';
      setKey('');
      setMsg('Key removed from this device. The library keeps working here; GitHub is read-only until you add a key again.');
      paintSettings();
    });
    var played = document.getElementById('lib-set-played');
    played.addEventListener('change', function () { App.store.set('library.savePlayed', !!this.checked); });
    paintSettings();
  }

  function paintSettings() {
    if (!setEl) return;
    var k = document.getElementById('lib-set-keystate'), p = document.getElementById('lib-set-played'), f = document.getElementById('lib-set-forget');
    var has = !!getKey();
    if (k) k.textContent = (has ? 'A key is saved on this device. ' : 'No key on this device: GitHub is read-only. ') + statusText();
    if (p) p.checked = savePlayedOn();
    if (f) f.disabled = !has;
  }

  // ---------------------------------------------------------------- public API

  App.library = {
    saveScan: saveScan,
    savePlayed: savePlayed,
    get savePlayedOn() { return savePlayedOn(); },
    list: function () { return all().then(function (items) { return items.filter(function (it) { return it.pending !== 'delete'; }); }); },
    get: getItem,
    sync: function () { return sync({ list: true, push: true }); },
    // resolves (with the status) once every sync asked for so far has finished
    idle: function () { return chain.then(function () { return status(); }); },
    rename: rename,
    remove: remove,
    midiBytes: midiBytes,
    musicxml: function (id) { return fileOf(id, 'musicxml').then(function (r) { return r.data; }); },
    play: playOnSynth,
    practice: practice,
    openAsTab: openAsTab,
    download: download,
    // another page's "From my library": show the page (filter 'all' | 'scan' | 'played')
    open: function (filter) {
      if (filter === 'scan' || filter === 'played' || filter === 'all') { ui.filter = filter; App.store.set('library.filter', filter); if (els.filter) paintFilter(); }
      App.switchTo('library');
    },
    mountSettings: mountSettings,
    get status() { return status(); },
    config: cfg,
    setConfig: setConfig,
    get hasKey() { return !!getKey(); },
    // the configured repository is the default one, which is public (another may be private)
    get knownPublic() { return cfg().repo === DEF.repo; },
    setKey: setKey,
    forgetKey: function () { return setKey(''); },
    testConnection: testConnection,
    ideaMidi: ideaMidi,
    TIMEOUT: TIMEOUT, // {read, write} ms (tests shorten them)
    KEY_STORE: KEY_STORE
  };
  window.SLLibrary = App.library; // test / plugin hook

  App.register('library', { init: init, onShow: onShow, onHide: onHide, onBack: onBack });
})();
