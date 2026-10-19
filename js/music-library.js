/* soundLAB private music library. IndexedDB stores immutable original bytes;
 * metadata and actual derived MIDI versions live separately. No recognition,
 * network, account sync, MIDI port or external device API is used. */
(function () {
  'use strict';
  var DB_NAME = 'soundlab.music-library', MAX_FILE = 20 * 1024 * 1024, MAX_TOTAL = 100 * 1024 * 1024, MAX_ITEMS = 50;
  var MAX_PACKAGE = 120 * 1024 * 1024, ENGINE = 'soundlab-score-subset-1';
  var FIELDS = ['title', 'composer', 'arranger', 'instrument', 'key', 'time', 'tempo', 'source', 'license', 'provenance'];
  var LABELS = { title: 'Title', composer: 'Composer', arranger: 'Arranger', instrument: 'Instrument', key: 'Key / key signature', time: 'Time signature', tempo: 'Tempo (state beat unit)', source: 'Source / attribution', license: 'License / rights statement', provenance: 'Provenance notes' };
  var STATUS = { uploaded: 'Uploaded · not validated', 'needs-recognition': 'Needs recognition · none performed', 'needs-correction': 'Needs correction / unsupported preview', validated: 'Validated for limited Score subset' };
  var dbPromise = null, queue = Promise.resolve(), rootEl, els = {}, selected = null, previewURL = null, items = [];
  function fail(message) { throw new Error(message); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function now() { return new Date().toISOString(); }
  function id() { return crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16))).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
  function text(value, max) { if (value == null || value === '') return null; if (typeof value !== 'string') fail('Metadata values must be text.'); var s = value.trim(); if (s.length > (max || 1000)) fail('A metadata field is too long.'); return s || null; }
  function metadata(input) {
    input = input || {}; var out = {};
    FIELDS.forEach(function (field) { out[field] = text(input[field], field === 'title' ? 200 : 2000); });
    var tags = Array.isArray(input.tags) ? input.tags : typeof input.tags === 'string' ? input.tags.split(',') : [];
    if (tags.length > 30) fail('Use at most 30 tags.');
    out.tags = tags.map(function (tag) { return text(tag, 80); }).filter(Boolean).filter(function (tag, i, all) { return all.indexOf(tag) === i; });
    return out;
  }
  function importedDeclarations(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) return null; var json = JSON.stringify(value); if (json.length > 200000) fail('Imported source declaration metadata is too large.'); return JSON.parse(json); }
  function kind(filename) {
    var ext = String(filename).toLowerCase().split('.').pop();
    if (ext === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'heic', 'heif', 'tif', 'tiff'].indexOf(ext) >= 0) return 'image';
    if (ext === 'xml' || ext === 'musicxml') return 'musicxml';
    if (ext === 'mxl') return 'mxl';
    if (ext === 'mid' || ext === 'midi') return 'midi';
    fail('Supported originals: PDF, raster images, MusicXML/XML/MXL and MIDI.');
  }
  function mimeFor(filename, k) {
    if (k === 'pdf') return 'application/pdf'; if (k === 'musicxml') return 'application/vnd.recordare.musicxml+xml';
    if (k === 'mxl') return 'application/vnd.recordare.musicxml'; if (k === 'midi') return 'audio/midi';
    var ext = filename.toLowerCase().split('.').pop(); return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif' }[ext] || 'application/octet-stream';
  }
  async function hash(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
  function bytesOf(value) { if (value instanceof Uint8Array) return new Uint8Array(value); if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0)); fail('Expected file bytes.'); }
  function openDB() {
    if (!dbPromise) dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB is unavailable. This library needs browser storage.')); return; }
      var request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () { ['items', 'originals', 'derived'].forEach(function (store) { request.result.createObjectStore(store, { keyPath: 'id' }); }); };
      request.onsuccess = function () { var db = request.result; db.onversionchange = function () { db.close(); dbPromise = null; }; resolve(db); };
      request.onerror = function () { dbPromise = null; reject(request.error || new Error('Browser storage could not open.')); };
      request.onblocked = function () { dbPromise = null; reject(new Error('Close other soundLAB tabs to upgrade browser storage.')); };
    });
    return dbPromise;
  }
  async function read(store, key) {
    var db = await openDB(); return new Promise(function (resolve, reject) { var r = key == null ? db.transaction(store).objectStore(store).getAll() : db.transaction(store).objectStore(store).get(key); r.onsuccess = function () { resolve(r.result); }; r.onerror = function () { reject(r.error); }; });
  }
  async function write(records, deletes, expected) {
    var db = await openDB(); return new Promise(function (resolve, reject) {
      var tx = db.transaction(['items', 'originals', 'derived'], 'readwrite'), abortReason = null, itemRows = null, derivedRows = null;
      tx.oncomplete = function () { resolve(); }; tx.onabort = tx.onerror = function () { reject(abortReason || tx.error || new Error('Browser storage write failed (possibly quota or private mode).')); };
      function abort(message) { abortReason = new Error(message); tx.abort(); }
      function apply() {
        if (!itemRows || !derivedRows) return;
        var itemMap = new Map(itemRows.map(function (i) { return [i.id, i]; })), derivedMap = new Map(derivedRows.map(function (d) { return [d.id, d]; }));
        var stale = Object.keys(expected || {}).some(function (itemId) { var current = itemMap.get(itemId); return !current || (current.storeRevision || 1) !== expected[itemId]; });
        if (stale) { abort('Library item changed in another tab. Retry this action.'); return; }
        (deletes || []).forEach(function (r) { if (r.store === 'items') itemMap.delete(r.id); if (r.store === 'derived') derivedMap.delete(r.id); });
        (records || []).forEach(function (r) { if (r.store === 'items') itemMap.set(r.value.id, r.value); if (r.store === 'derived') derivedMap.set(r.value.id, r.value); });
        var size = Array.from(itemMap.values()).reduce(function (s, i) { return s + i.original.size; }, 0) + Array.from(derivedMap.values()).reduce(function (s, d) { return s + d.size; }, 0);
        if (itemMap.size > MAX_ITEMS || size > MAX_TOTAL) { abort('Local library limit: 50 items / 100 MB of files. Export a backup, then remove items to make space.'); return; }
        // Original/derived records can only be added, never replaced. The same
        // transaction serializes quota and revision checks across browser tabs.
        (records || []).forEach(function (r) { var store = tx.objectStore(r.store); if (r.store === 'items') store.put(r.value); else store.add(r.value); });
        (deletes || []).forEach(function (r) { tx.objectStore(r.store).delete(r.id); });
      }
      var ir = tx.objectStore('items').getAll(), dr = tx.objectStore('derived').getAll();
      ir.onsuccess = function () { itemRows = ir.result; apply(); }; dr.onsuccess = function () { derivedRows = dr.result; apply(); };
    });
  }
  function serial(fn) { var result = queue.then(fn); queue = result.catch(function () {}); return result; }
  async function stats() { var all = await read('items'), derived = await read('derived'); return { count: all.length, bytes: all.reduce(function (s, i) { return s + i.original.size; }, 0) + derived.reduce(function (s, d) { return s + d.size; }, 0) }; }
  async function capacity(count, bytes) { var used = await stats(); if (used.count + count > MAX_ITEMS || used.bytes + bytes > MAX_TOTAL) fail('Local library limit: 50 items / 100 MB of files. Export a backup, then remove items to make space.'); }
  async function addOriginal(input) {
    return serial(async function () {
      var bytes = bytesOf(input.bytes), filename = text(input.filename, 240), k = kind(filename || ''), meta = metadata(input.metadata);
      if (!bytes.length || bytes.length > MAX_FILE) fail('Choose a nonempty original no larger than 20 MB.');
      await capacity(1, bytes.length);
      var itemId = id(), sha = await hash(bytes), at = now();
      var item = { id: itemId, createdAt: at, updatedAt: at, storeRevision: 1, metadata: meta, metadataRevision: 1, original: { filename: filename, kind: k, mime: mimeFor(filename, k), size: bytes.length, sha256: sha }, status: k === 'pdf' || k === 'image' ? 'needs-recognition' : 'uploaded', declared: null, derivatives: [], evidence: [{ at: at, kind: 'ingest', text: 'Original bytes retained. No recognition or musical validation performed.', origin: input.origin === 'soundlab-score' ? 'soundlab-score' : 'user-file', sha256: sha }] };
      await write([{ store: 'originals', value: { id: itemId, bytes: bytes.buffer } }, { store: 'items', value: item }]);
      return item;
    });
  }
  async function updateMetadata(itemId, input) {
    return serial(async function () {
      var item = await read('items', itemId); if (!item) fail('Library item not found.');
      var expected = {}; expected[itemId] = item.storeRevision || 1; item.storeRevision = expected[itemId] + 1;
      item.metadata = metadata(input); item.metadataRevision++; item.updatedAt = now();
      item.evidence.push({ at: item.updatedAt, kind: 'metadata', text: 'User entered metadata; unknown fields remain null. This is not musical validation.', revision: item.metadataRevision });
      item.evidence = item.evidence.slice(-100); await write([{ store: 'items', value: item }], [], expected); return item;
    });
  }
  async function getOriginal(itemId) { var record = await read('originals', itemId); if (!record) fail('Original file not found.'); return new Uint8Array(record.bytes.slice(0)); }
  function first(node, tag) { return node.getElementsByTagNameNS('*', tag)[0] || null; }
  function childValue(node, tag) { var n = first(node, tag); return n && n.textContent.trim() || null; }
  function declaredMetadata(xml, model) {
    var doc = new DOMParser().parseFromString(xml.replace(/<!DOCTYPE[^>]*>/gi, ''), 'application/xml');
    var declared = { title: childValue(doc, 'work-title') || childValue(doc, 'movement-title'), composer: null, arranger: null, instrument: childValue(doc, 'instrument-name'), keyChanges: [], timeChanges: [], tempoChanges: [], provenance: 'Explicit MusicXML declarations only. Omitted values stay unknown; Score defaults are not copied into metadata.' };
    Array.from(doc.getElementsByTagNameNS('*', 'creator')).forEach(function (c) { var type = c.getAttribute('type'); if (type === 'composer' || type === 'arranger') declared[type] = c.textContent.trim() || null; });
    var divisions = 1, units = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625 };
    Array.from(doc.getElementsByTagNameNS('*', 'measure')).forEach(function (measure, mi) {
      var cursor = 0, m = model.measures[mi];
      Array.from(measure.children).forEach(function (element) {
        if (element.localName === 'attributes') {
          if (first(element, 'divisions')) divisions = Number(childValue(element, 'divisions'));
          if (first(element, 'time')) declared.timeChanges.push({ beat: m.start, measure: m.number, value: m.beats + '/' + m.beatType, source: 'MusicXML attributes/time' });
          var key = first(element, 'key');
          if (key) declared.keyChanges.push({ beat: m.start, measure: m.number, fifths: childValue(key, 'fifths'), mode: childValue(key, 'mode'), source: 'MusicXML attributes/key; no tonic inferred' });
        } else if (element.localName === 'note') { if (!first(element, 'chord')) cursor += Number(childValue(element, 'duration')) / divisions; }
        else if (element.localName === 'direction' || element.localName === 'sound') {
          var sounds = element.localName === 'sound' ? [element] : Array.from(element.getElementsByTagNameNS('*', 'sound')), bpm = null;
          Array.from(element.getElementsByTagNameNS('*', 'metronome')).forEach(function (mark) { bpm = Number(childValue(mark, 'per-minute')) * units[childValue(mark, 'beat-unit')] * (2 - Math.pow(0.5, mark.getElementsByTagNameNS('*', 'beat-unit-dot').length)); });
          sounds.forEach(function (s) { if (s.hasAttribute('tempo')) bpm = Number(s.getAttribute('tempo')); });
          if (bpm !== null) declared.tempoChanges.push({ beat: m.start + cursor, measure: m.number, quarterBpm: bpm, source: 'Explicit MusicXML numeric tempo' });
        }
      });
    });
    return declared;
  }
  async function validate(itemId) {
    return serial(async function () {
      var item = await read('items', itemId); if (!item) fail('Library item not found.');
      var expected = {}; expected[itemId] = item.storeRevision || 1; item.storeRevision = expected[itemId] + 1;
      if (item.original.kind !== 'musicxml') fail('Only uncompressed MusicXML can be checked by the limited Score parser. No PDF/image recognition, MXL decompression or MIDI import is implemented.');
      if (!window.SLScore) fail('The Score module is not loaded.');
      if (item.derivatives.length >= 10) fail('Limit: ten generated versions per item.');
      var bytes = await getOriginal(itemId), at = now(), model, midi, xml;
      try {
        xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        model = SLScore.parseMusicXML(xml); midi = SLScore.midiBytes(model);
      } catch (e) {
        item.status = 'needs-correction'; item.updatedAt = at;
        item.evidence.push({ at: at, kind: 'score-check', engine: ENGINE, outcome: 'unsupported-or-invalid', text: e.message + ' Original bytes remain unchanged.' });
        item.evidence = item.evidence.slice(-100); await write([{ store: 'items', value: item }], [], expected);
        return { item: item, error: e.message };
      }
      await capacity(0, midi.length);
      var version = item.derivatives.length + 1, derivative = { id: itemId + '-midi-v' + version, itemId: itemId, version: version, kind: 'midi', mime: 'audio/midi', size: midi.length, sha256: await hash(midi), createdAt: at, sourceSha256: item.original.sha256, engine: ENGINE, evidence: 'Generated from accepted Score subset; pitches/rhythm/tempo/meter only. No visual proofreading or expression validation.', bytes: midi.buffer };
      item.declared = declaredMetadata(xml, model); item.status = 'validated'; item.updatedAt = at;
      item.derivatives.push({ id: derivative.id, version: version, kind: 'midi', size: derivative.size, sha256: derivative.sha256, createdAt: at, sourceSha256: derivative.sourceSha256, engine: ENGINE, evidence: derivative.evidence });
      item.evidence.push({ at: at, kind: 'score-check', engine: ENGINE, outcome: 'accepted-subset', version: version, text: derivative.evidence, warnings: model.warnings.slice() });
      item.evidence = item.evidence.slice(-100);
      await write([{ store: 'derived', value: derivative }, { store: 'items', value: item }], [], expected);
      return { item: item, derivative: item.derivatives[item.derivatives.length - 1] };
    });
  }
  async function remove(itemId) {
    return serial(async function () { var item = await read('items', itemId); if (!item) return; var expected = {}; expected[itemId] = item.storeRevision || 1; await write([], [{ store: 'items', id: itemId }, { store: 'originals', id: itemId }].concat(item.derivatives.map(function (d) { return { store: 'derived', id: d.id }; })), expected); });
  }

  // Minimal dependency-free ZIP STORE writer/reader for our own backup format.
  // Deflate/encryption/ZIP64/foreign archive formats are deliberately rejected.
  var crcTable = null;
  function crc32(bytes) {
    if (!crcTable) { crcTable = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
    var crc = 0xffffffff; for (var i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0;
  }
  function join(chunks) { var out = new Uint8Array(chunks.reduce(function (n, c) { return n + c.length; }, 0)), at = 0; chunks.forEach(function (c) { out.set(c, at); at += c.length; }); return out; }
  function header(size) { var bytes = new Uint8Array(size); return { bytes: bytes, view: new DataView(bytes.buffer) }; }
  function zipStore(entries) {
    var local = [], central = [], offset = 0, encoder = new TextEncoder();
    entries.forEach(function (entry) {
      var name = encoder.encode(entry.name), bytes = entry.bytes, crc = crc32(bytes), h = header(30);
      h.view.setUint32(0, 0x04034b50, true); h.view.setUint16(4, 20, true); h.view.setUint16(6, 0x800, true); h.view.setUint16(12, 33, true); h.view.setUint32(14, crc, true); h.view.setUint32(18, bytes.length, true); h.view.setUint32(22, bytes.length, true); h.view.setUint16(26, name.length, true);
      local.push(h.bytes, name, bytes);
      var cd = header(46); cd.view.setUint32(0, 0x02014b50, true); cd.view.setUint16(4, 20, true); cd.view.setUint16(6, 20, true); cd.view.setUint16(8, 0x800, true); cd.view.setUint16(14, 33, true); cd.view.setUint32(16, crc, true); cd.view.setUint32(20, bytes.length, true); cd.view.setUint32(24, bytes.length, true); cd.view.setUint16(28, name.length, true); cd.view.setUint32(42, offset, true); central.push(cd.bytes, name);
      offset += 30 + name.length + bytes.length;
    });
    var directory = join(central), end = header(22); end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, entries.length, true); end.view.setUint16(10, entries.length, true); end.view.setUint32(12, directory.length, true); end.view.setUint32(16, offset, true);
    return join(local.concat([directory, end.bytes]));
  }
  function unzipStore(input) {
    var bytes = bytesOf(input); if (bytes.length > MAX_PACKAGE || bytes.length < 22) fail('Invalid or oversized library package.');
    var view = new DataView(bytes.buffer), end = bytes.length - 22;
    if (view.getUint32(end, true) !== 0x06054b50 || view.getUint16(end + 20, true) !== 0 || view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) fail('Use an unmodified soundLAB library package (ZIP STORE).');
    var count = view.getUint16(end + 10, true), cdStart = view.getUint32(end + 16, true), cdSize = view.getUint32(end + 12, true);
    if (count > 551 || view.getUint16(end + 8, true) !== count || cdStart + cdSize !== end) fail('Invalid library ZIP directory.');
    var p = 0, entries = new Map(), decoder = new TextDecoder('utf-8', { fatal: true });
    while (p < cdStart) {
      if (p + 30 > cdStart || view.getUint32(p, true) !== 0x04034b50 || view.getUint16(p + 6, true) !== 0x800 || view.getUint16(p + 8, true) !== 0) fail('Only unencrypted ZIP STORE library packages are supported.');
      var size = view.getUint32(p + 22, true), nameSize = view.getUint16(p + 26, true), extra = view.getUint16(p + 28, true), start = p + 30 + nameSize + extra;
      if (size > MAX_TOTAL || view.getUint32(p + 18, true) !== size || start + size > cdStart) fail('Invalid ZIP file length.');
      var name = decoder.decode(bytes.subarray(p + 30, p + 30 + nameSize));
      if (!name || /(^\/|\\|(^|\/)\.\.(\/|$))/.test(name) || entries.has(name)) fail('Unsafe or duplicate package path.');
      var data = bytes.slice(start, start + size); if (crc32(data) !== view.getUint32(p + 14, true)) fail('Library package CRC mismatch.');
      entries.set(name, data); p = start + size;
    }
    if (p !== cdStart || entries.size !== count) fail('Library ZIP entry count mismatch.');
    // Also verify every central-directory entry matches its local header.
    var cp = cdStart, seen = new Set();
    for (var i = 0; i < count; i++) {
      if (cp + 46 > end || view.getUint32(cp, true) !== 0x02014b50) fail('Invalid ZIP central directory.');
      var nl = view.getUint16(cp + 28, true), el = view.getUint16(cp + 30, true), cl = view.getUint16(cp + 32, true), lp = view.getUint32(cp + 42, true);
      if (cp + 46 + nl + el + cl > end || lp + 30 > cdStart) fail('Invalid ZIP central entry.');
      var centralName = decoder.decode(bytes.subarray(cp + 46, cp + 46 + nl));
      if (!entries.has(centralName) || seen.has(centralName) || view.getUint32(lp, true) !== 0x04034b50 || view.getUint32(cp + 16, true) !== view.getUint32(lp + 14, true) || view.getUint32(cp + 24, true) !== view.getUint32(lp + 22, true)) fail('ZIP central/local file mismatch.');
      seen.add(centralName); cp += 46 + nl + el + cl;
    }
    if (cp !== end) fail('Invalid ZIP directory length.');
    return entries;
  }
  async function exportPackage(ids) {
    var all = await read('items'), chosen = ids ? all.filter(function (item) { return ids.indexOf(item.id) >= 0; }) : all;
    if (!chosen.length) fail('The library has no selected files to export.');
    var entries = [], manifest = { format: 'soundlab-music-library', schemaVersion: 1, exportedAt: now(), privacy: 'Local browser library backup; checksums establish byte integrity, not authorship or musical correctness.', items: [] };
    for (var i = 0; i < chosen.length; i++) {
      var item = chosen[i], copy = JSON.parse(JSON.stringify(item));
      copy.original.path = 'items/' + item.id + '/original'; entries.push({ name: copy.original.path, bytes: await getOriginal(item.id) });
      for (var j = 0; j < copy.derivatives.length; j++) { var d = copy.derivatives[j], data = await read('derived', d.id); if (!data) fail('A derived file is missing.'); d.path = 'items/' + item.id + '/midi-v' + d.version + '.mid'; entries.push({ name: d.path, bytes: new Uint8Array(data.bytes) }); }
      manifest.items.push(copy);
    }
    var manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2)); if (manifestBytes.length > 2 * 1024 * 1024) fail('Backup metadata exceeds package limit.');
    return zipStore([{ name: 'manifest.json', bytes: manifestBytes }].concat(entries));
  }
  async function importPackage(input) {
    return serial(async function () {
      var archive = unzipStore(input), raw = archive.get('manifest.json'); if (!raw || raw.length > 2 * 1024 * 1024) fail('Library package manifest is missing or too large.');
      var manifest; try { manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch (e) { fail('Invalid library package manifest.'); }
      if (manifest.format !== 'soundlab-music-library' || manifest.schemaVersion !== 1 || !Array.isArray(manifest.items) || !manifest.items.length || manifest.items.length > MAX_ITEMS) fail('Unsupported library package schema.');
      var records = [], imported = [], total = 0, usedPaths = new Set(['manifest.json']);
      for (var i = 0; i < manifest.items.length; i++) {
        var src = manifest.items[i], meta = metadata(src.metadata), orig = src.original || {}, data = archive.get(orig.path), filename = text(orig.filename, 240), k = kind(filename || '');
        if (usedPaths.has(orig.path) || !data || !data.length || data.length > MAX_FILE || data.length !== orig.size || await hash(data) !== orig.sha256) fail('Original file checksum/size mismatch in package.');
        usedPaths.add(orig.path); var itemId = id(), at = now(), claim = STATUS[src.status] ? src.status : 'unknown';
        var item = { id: itemId, createdAt: at, updatedAt: at, storeRevision: 1, metadata: meta, metadataRevision: 1, original: { filename: filename, kind: k, mime: mimeFor(filename, k), size: data.length, sha256: orig.sha256 }, status: k === 'pdf' || k === 'image' ? 'needs-recognition' : 'uploaded', declared: null, importedDeclared: importedDeclarations(src.declared || src.importedDeclared), derivatives: [], evidence: [{ at: at, kind: 'package-import', text: 'Imported bytes/checksums verified. Prior musical validation is an unverified package claim; validate locally before relying on it.', importedStatus: claim, importedItemId: text(src.id, 100), importedMetadataRevision: Number.isSafeInteger(src.metadataRevision) ? src.metadataRevision : null, sourceEvidence: Array.isArray(src.evidence) ? src.evidence.slice(-10).map(function (e) { return { kind: text(e.kind, 100), text: text(e.text, 3000), at: text(e.at, 100) }; }) : [] }] };
        total += data.length; records.push({ store: 'originals', value: { id: itemId, bytes: data.buffer } });
        var ds = Array.isArray(src.derivatives) ? src.derivatives : []; if (ds.length > 10) fail('Too many derived versions in package.');
        for (var j = 0; j < ds.length; j++) {
          var d = ds[j], db = archive.get(d.path);
          if (d.kind !== 'midi' || !db || db.length > MAX_FILE || db.length !== d.size || usedPaths.has(d.path) || await hash(db) !== d.sha256 || d.sourceSha256 !== orig.sha256 || String.fromCharCode.apply(null, db.subarray(0, 4)) !== 'MThd') fail('Invalid derived MIDI/checksum/source in package.');
          usedPaths.add(d.path); var version = j + 1, derived = { id: itemId + '-midi-v' + version, itemId: itemId, version: version, kind: 'midi', size: db.length, sha256: d.sha256, mime: 'audio/midi', createdAt: at, sourceSha256: orig.sha256, engine: 'package-import-unverified', evidence: 'Imported derived file; byte integrity checked, musical correctness not revalidated.', bytes: db.buffer };
          total += db.length; records.push({ store: 'derived', value: derived }); var info = Object.assign({}, derived); delete info.bytes; item.derivatives.push(info);
        }
        records.push({ store: 'items', value: item }); imported.push(item);
      }
      if (archive.size !== usedPaths.size) fail('Package contains files not named in its manifest.');
      await capacity(imported.length, total); await write(records); return imported;
    });
  }

  function status(message, error) { if (!els.status) return; els.status.textContent = message; els.status.classList.toggle('error', !!error); }
  async function action(fn) { try { await fn(); } catch (e) { status(e.message || 'Library action failed.', true); } }
  function download(bytes, filename, mime) { var url = URL.createObjectURL(new Blob([bytes], { type: mime })), a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); }
  function revokePreview() { if (els.preview) els.preview.innerHTML = ''; if (previewURL) URL.revokeObjectURL(previewURL); previewURL = null; }
  function prettyBytes(n) { return n < 1024 ? n + ' B' : n < 1024 * 1024 ? Math.round(n / 1024) + ' KB' : (n / 1024 / 1024).toFixed(1) + ' MB'; }
  async function refresh() {
    items = await read('items'); items.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); }); renderList();
    var used = await stats(); els.storage.textContent = used.count + ' / 50 items · ' + prettyBytes(used.bytes) + ' / 100 MB app file limit. Browser quota may be lower.';
    if (navigator.storage && navigator.storage.estimate) { try { var estimate = await navigator.storage.estimate(); if (estimate.quota) els.storage.textContent += ' Browser origin estimate: ' + prettyBytes(estimate.usage || 0) + ' used of ' + prettyBytes(estimate.quota) + '.'; } catch (e) { /* estimate unavailable */ } }
    els.export.disabled = !items.length;
  }
  function renderList() {
    var query = els.search.value.trim().toLowerCase(), matching = items.filter(function (item) { return [item.original.filename, item.metadata.title, item.metadata.composer].concat(item.metadata.tags).join(' ').toLowerCase().indexOf(query) >= 0; });
    els.list.innerHTML = matching.length ? matching.map(function (item) { return '<button type="button" class="ml-item' + (selected === item.id ? ' ml-selected' : '') + '" data-ml-open="' + item.id + '"><strong>' + esc(item.metadata.title || item.original.filename) + '</strong><span>' + esc(item.metadata.composer || 'Composer unknown') + ' · ' + esc(item.original.kind.toUpperCase()) + ' · ' + prettyBytes(item.original.size) + '</span><small>' + esc(STATUS[item.status]) + '</small></button>'; }).join('') : '<p class="muted">' + (items.length ? 'No matching items.' : 'No files saved in this browser. Add an original or save the open Score.') + '</p>';
  }
  async function select(itemId) {
    selected = itemId; revokePreview(); renderList(); var item = await read('items', itemId); if (!item) { els.detail.hidden = true; return; }
    els.detail.hidden = false;
    els.detail.innerHTML = '<h2>' + esc(item.metadata.title || item.original.filename) + '</h2><p class="ml-badge">' + esc(STATUS[item.status]) + '</p><p class="muted small">Immutable original: ' + esc(item.original.filename) + ' · ' + prettyBytes(item.original.size) + '<br>SHA-256: <span class="ml-hash">' + item.original.sha256 + '</span></p><div class="ml-actions"><button class="btn" type="button" data-ml-action="original">Download original</button><button class="btn" type="button" data-ml-action="package">Export item package</button>' + (item.original.kind === 'musicxml' ? '<button class="btn primary" type="button" data-ml-action="validate">Check Score subset + create MIDI version</button><button class="btn" type="button" data-ml-action="score">Open in Score</button>' : '') + (item.original.kind === 'pdf' || item.original.kind === 'image' ? '<button class="btn" type="button" data-ml-action="preview">Preview original</button>' : '') + '</div><div id="ml-preview"></div><details class="ml-meta" open><summary>Edit stated metadata</summary><p class="muted small">Blank means unknown. These are your statements; saving them does not validate the music. Source declarations and change maps appear separately below.</p><form id="ml-form"><div class="ml-fields">' + FIELDS.map(function (field) { return '<label for="ml-' + field + '">' + LABELS[field] + '<input id="ml-' + field + '" name="' + field + '" maxlength="' + (field === 'title' ? 200 : 2000) + '" value="' + esc(item.metadata[field] || '') + '" placeholder="Unknown / not stated"></label>'; }).join('') + '<label for="ml-tags">Tags (comma separated)<input id="ml-tags" name="tags" value="' + esc(item.metadata.tags.join(', ')) + '"></label></div><button type="submit" class="btn primary">Save metadata</button></form></details>' + (item.declared ? '<details class="ml-meta"><summary>Explicit source metadata and tempo/meter/key changes</summary><pre class="ml-json">' + esc(JSON.stringify(item.declared, null, 2)) + '</pre></details>' : '') + '<details class="ml-meta"><summary>Processing evidence</summary><pre class="ml-json">' + esc(JSON.stringify(item.evidence, null, 2)) + '</pre></details><div class="ml-versions"><h3>Available derived versions</h3>' + (item.derivatives.length ? item.derivatives.map(function (d) { return '<div class="ml-version"><button type="button" class="btn" data-ml-derived="' + d.id + '">Download MIDI v' + d.version + '</button><span class="muted small">' + esc(d.evidence) + '</span></div>'; }).join('') : '<p class="muted small">None. Originals are retained; no recognition or conversion has been invented.</p>') + '</div><button class="btn danger" type="button" data-ml-action="remove">Remove item and its local versions</button>';
    if (item.importedDeclared && !item.declared) { var detail = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre'); detail.className = 'ml-meta'; summary.textContent = 'Imported source metadata/change maps (unverified package claim)'; pre.className = 'ml-json'; pre.textContent = JSON.stringify(item.importedDeclared, null, 2); detail.appendChild(summary); detail.appendChild(pre); els.detail.insertBefore(detail, els.detail.querySelector('.ml-versions')); }
    els.preview = els.detail.querySelector('#ml-preview');
    els.detail.querySelector('#ml-form').onsubmit = function (event) { event.preventDefault(); action(async function () { var input = {}; FIELDS.concat(['tags']).forEach(function (f) { input[f] = els.detail.querySelector('#ml-' + f).value; }); await updateMetadata(itemId, input); await refresh(); await select(itemId); status('Metadata saved. Original bytes unchanged.'); }); };
    els.detail.querySelectorAll('[data-ml-action]').forEach(function (button) { button.onclick = function () { action(async function () {
      var act = button.getAttribute('data-ml-action');
      if (act === 'original') { download(await getOriginal(itemId), item.original.filename, item.original.mime); status('Original download requested.'); }
      if (act === 'package') { download(await exportPackage([itemId]), 'soundlab-music-item.zip', 'application/zip'); status('Item backup package download requested.'); }
      if (act === 'validate') { var result = await validate(itemId); await refresh(); await select(itemId); status(result.error ? 'Needs correction / unsupported Score preview: ' + result.error : 'Score subset accepted; MIDI v' + result.derivative.version + ' generated. This is not visual proofreading.', !!result.error); }
      if (act === 'score') { if (!window.SLScore) fail('Score module unavailable.'); await SLScore.importBytes((await getOriginal(itemId)).buffer, item.original.filename); App.switchTo('score'); }
      if (act === 'preview') {
        revokePreview(); previewURL = URL.createObjectURL(new Blob([await getOriginal(itemId)], { type: item.original.mime }));
        if (item.original.kind === 'image' && /^image\//.test(item.original.mime)) { var image = document.createElement('img'); image.src = previewURL; image.alt = 'User supplied original image. No recognition performed.'; image.onerror = function () { status('This browser cannot preview that image format; download the unchanged original.'); }; els.preview.appendChild(image); }
        else if (item.original.kind === 'pdf') { var frame = document.createElement('iframe'); frame.title = 'Original PDF preview; no recognition performed'; frame.setAttribute('sandbox', ''); frame.src = previewURL; els.preview.appendChild(frame); }
        else status('Original retained; this image format has no browser preview. Download the original.');
        var notice = document.createElement('p'); notice.className = 'muted small'; notice.textContent = 'Original preview only. No notes have been recognized. PDF rendering depends on the browser; use Download original if blank.'; els.preview.appendChild(notice);
      }
      if (act === 'remove' && confirm('Remove this browser-local item and its generated versions? Export a backup first if needed.')) { await remove(itemId); selected = null; revokePreview(); els.detail.hidden = true; await refresh(); status('Item removed from this browser library.'); }
    }); }; });
    els.detail.querySelectorAll('[data-ml-derived]').forEach(function (button) { button.onclick = function () { action(async function () { var d = await read('derived', button.getAttribute('data-ml-derived')); if (!d) fail('Derived version not found.'); download(new Uint8Array(d.bytes), 'score-midi-v' + d.version + '.mid', 'audio/midi'); }); }; });
  }
  function init(element) {
    rootEl = element; rootEl.innerHTML = '<div class="card"><h2>Music library</h2><p>Keep your own originals and stated metadata privately in this browser. Convert supported MusicXML through the limited Score reader.</p><p class="ml-notice small">Local browser/profile storage only. Files are not uploaded or synced, and browser data clearing, private mode or storage eviction can remove them. Export backup packages. Limits: 20 MB per original, 50 items, 100 MB total files. PDF/image preview is not recognition; no PDF/photo/audio transcription or MXL decompression is implemented.</p><div class="ml-actions"><label class="btn ml-file">Add originals<input id="ml-files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.avif,.heic,.heif,.tif,.tiff,.xml,.musicxml,.mxl,.mid,.midi"></label><button type="button" class="btn" id="ml-score-save">Save open Score</button><button type="button" class="btn" id="ml-export" disabled>Export library package</button><label class="btn ml-file">Import library package<input id="ml-package" type="file" accept=".zip,application/zip"></label></div><p id="ml-storage" class="muted small">Opening local storage…</p><p id="ml-status" class="ml-status" role="status" aria-live="polite"></p></div><div class="card"><label for="ml-search">Find title, composer, tag or filename</label><input class="ml-search" id="ml-search" type="search" placeholder="Search local library"><div id="ml-list" class="ml-list"></div></div><div class="card" id="ml-detail" hidden></div>';
    ['storage', 'status', 'export', 'search', 'list', 'detail'].forEach(function (key) { els[key] = rootEl.querySelector('#ml-' + key); });
    els.search.oninput = renderList;
    els.list.onclick = function (event) { var button = event.target.closest('[data-ml-open]'); if (button) action(function () { return select(button.getAttribute('data-ml-open')); }); };
    rootEl.querySelector('#ml-files').onchange = function (event) { var files = Array.from(event.target.files); event.target.value = ''; action(async function () { var saved = 0, failures = []; for (var i = 0; i < files.length; i++) { var file = files[i]; try { if (file.size > MAX_FILE) fail('File exceeds 20 MB.'); var item = await addOriginal({ filename: file.name, bytes: await file.arrayBuffer() }); selected = item.id; saved++; } catch (e) { failures.push(file.name + ': ' + e.message); } } await refresh(); if (selected) await select(selected); status(saved + ' original(s) retained. No recognition performed.' + (failures.length ? ' Could not save ' + failures.length + ': ' + failures.join(' · ') : ''), !!failures.length); }); };
    rootEl.querySelector('#ml-score-save').onclick = function () { action(async function () { if (!window.SLScore || !SLScore.model) fail('Open or create a Score first.'); var bytes = SLScore.originalBytes || new TextEncoder().encode(SLScore.scoreXML(SLScore.model)); var item = await addOriginal({ filename: 'score.musicxml', bytes: bytes, origin: 'soundlab-score' }); await refresh(); await select(item.id); status('Open Score saved as an immutable original. Check it to generate a MIDI version.'); }); };
    els.export.onclick = function () { action(async function () { download(await exportPackage(), 'soundlab-music-library.zip', 'application/zip'); status('Library backup package download requested.'); }); };
    rootEl.querySelector('#ml-package').onchange = function (event) { var file = event.target.files[0]; event.target.value = ''; if (!file) return; action(async function () { if (file.size > MAX_PACKAGE) fail('Library package exceeds 120 MB.'); var imported = await importPackage(await file.arrayBuffer()); await refresh(); await select(imported[0].id); status(imported.length + ' item(s) imported. Checksums verified; musical validation must be repeated locally.'); }); };
    action(refresh);
  }
  var module = { init: init, onShow: function () { if (rootEl) action(refresh); }, onHide: revokePreview };
  window.SLMusicLibrary = { module: module, addOriginal: addOriginal, updateMetadata: updateMetadata, getOriginal: getOriginal, list: function () { return read('items'); }, get: function (itemId) { return read('items', itemId); }, getDerived: function (derivedId) { return read('derived', derivedId); }, validate: validate, remove: remove, exportPackage: exportPackage, importPackage: importPackage, stats: stats, hash: hash, zipStore: zipStore, unzipStore: unzipStore, select: select, refresh: refresh, limits: { maxOriginalBytes: MAX_FILE, maxTotalBytes: MAX_TOTAL, maxItems: MAX_ITEMS } };
  App.register('musiclibrary', module);
})();
