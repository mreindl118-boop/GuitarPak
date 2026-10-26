/* soundLAB Synth Deck — presets, dials, buttons and a scope for the synth on
 * the MIDI Hub's output (v1.1.0). Mounted by js/midihub.js into the Control
 * view (#mh-deck above the Hub's knob card, #mh-deck2 below it) and driven
 * through the Hub's HUB_API: the Hub owns the ports, the ONE send funnel,
 * the knob gestures (wireKnobs) and the per-Part CC values (kv). Prefix sdk-.
 *
 *   Now bar    the current sound's name (library → your names → the MODX
 *              factory list), Prev/Next program, star, Save sound, pins
 *   Knobs      pages of extra knobs (CC or SysEx) over the Hub card
 *   Buttons    scenes, arp / motion-sequencer switches, Part mute, pedals
 *   Sounds     the library (program + knob/button snapshot), bank browser
 *              with names, import/export, Read name from synth
 *   Scope      js/synthdeck-scope.js (what the synth transmits, on a grid)
 *   Map        every number, editable; Learn fills it from the synth
 *
 * SAFETY: zero bytes on load / boot / show / tab / Part / profile change /
 * Import / Reset / Learn / save / star / delete. Every send goes through
 * tx(): no output → refused, a LUMI-named output → refused (stricter than
 * the Hub's own knobs), SysEx without permission → refused. On-screen state
 * changes ONLY for a message that was actually sent.
 *
 * Store (App.store 'midihub.*'): deck (settings + map overrides), decklib
 * (the sounds), deckvals (switch states / SysEx knob values per Part),
 * names (your program names). Writes are debounced; blobs from a newer app
 * are read-only. Default maps: js/synthdeck-maps.js.
 */
(function () {
  'use strict';

  var VERSION = 1, LIB_CAP = 200, PLAN_CAP = 512, PIN_MAX = 12;
  var api = null, box1 = null, box2 = null, els = {};
  var wired = false, mounted = false, lastProfile = null, savedOnce = false;
  var deck = null, lib = null, vals = null, names = null, ro = {};
  var mapCache = {};
  var heldSet = {};                 // momentary id -> { ctl, el }
  var learning = null;              // { id, mode:'num'|'addr'|'moves', frames:[], t }
  var loadJob = null;               // the running Load
  var persistT = {}, dirty = {};
  var unverifiedToasted = false, lastRefuse = 0;
  var factory = null, factoryState = '';   // '' | 'loading' | 'ok' | 'fail'
  var readJob = null;               // Read name from synth collector
  var pageId = null, bankSel = null, openRow = null, twoStep = {};
  var editing = {};                 // open inline editors (onBack closes them)
  var progSeen = null, progSeenT = 0;
  var lastLoaded = null;

  var Maps = window.SLSynthDeckMaps || { v: 1, generic: { name: 'Generic', sections: [], controls: [], pages: [], banks: [], notes: [] } };

  // ---- tiny helpers ----
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function isArr(a) { return Object.prototype.toString.call(a) === '[object Array]'; }
  function isObj(o) { return !!o && typeof o === 'object' && !isArr(o); }
  function num(v, d) { var n = parseInt(v, 10); return isNaN(n) ? d : n; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function uid(p) { return (p || 'u_') + Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 46656).toString(36); }
  function esc(s) { return api ? api.esc(s) : String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function toast(m) { if (api && api.toast) api.toast(m); }
  function hex(b) { return api ? api.hex(b) : b.map(function (x) { return ('0' + x.toString(16).toUpperCase()).slice(-2); }).join(' '); }
  function q(sel, root) { return (root || box2 || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || box2 || document).querySelectorAll(sel)); }
  function active() { return App.active === 'midihub' || App.active === 'deck' || App.active === 'liveset'; } // the Synth tab's pages host the deck too (js/synthtab.js)
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // ---- store: four blobs, validated / migrated on read, debounced writes ----
  function deckDefaults() {
    return { v: VERSION, tab: 'knobs', settleMs: 250, pace: 2, globalCh: 0, learnPort: 'all', bankMode: 'part', scope: { win: 4, lanes: [95, 17, 1, 74], showOut: true }, maps: {} };
  }
  function validCtl(c) {
    if (!isObj(c) || typeof c.id !== 'string' || !c.id) return null;
    var o = {};
    o.id = c.id; o.sec = typeof c.sec === 'string' ? c.sec : 'custom'; o.name = typeof c.name === 'string' ? c.name.slice(0, 40) : c.id;
    o.kind = ['cc', 'pc', 'sx'].indexOf(c.kind) >= 0 ? c.kind : 'cc';
    o.ui = ['knob', 'toggle', 'momentary', 'radio', 'trigger'].indexOf(c.ui) >= 0 ? c.ui : 'toggle';
    o.ch = (c.ch === 'part' || c.ch === 'global') ? c.ch : (typeof c.ch === 'number' && c.ch >= 0 && c.ch < 16) ? c.ch : 'part';
    o.num = (typeof c.num === 'number' && c.num >= 0 && c.num < 128) ? c.num : null;
    o.on = typeof c.on === 'number' ? clamp(c.on, 0, 127) : 127; o.off = typeof c.off === 'number' ? clamp(c.off, 0, 127) : 0;
    o.def = typeof c.def === 'number' ? clamp(c.def, 0, 127) : 64;
    if (typeof c.group === 'string') o.group = c.group;
    if (typeof c.val === 'number') o.val = clamp(c.val, 0, 127);
    if (isObj(c.sx)) o.sx = { addr: typeof c.sx.addr === 'string' ? c.sx.addr : null, on: typeof c.sx.on === 'string' ? c.sx.on : '01', off: typeof c.sx.off === 'string' ? c.sx.off : '00', val: typeof c.sx.val === 'string' ? c.sx.val : '{v}' };
    o.conf = ['verified', 'documented', 'unverified', 'learned'].indexOf(c.conf) >= 0 ? c.conf : 'unverified';
    if (typeof c.src === 'string') o.src = c.src; if (typeof c.note === 'string') o.note = c.note;
    if (typeof c.slot === 'string') o.slot = c.slot;
    return o;
  }
  function validPage(p) {
    if (!isObj(p) || typeof p.id !== 'string' || !p.id) return null;
    var ctl = isArr(p.ctl) ? p.ctl.slice(0, 8) : [];
    while (ctl.length < 8) ctl.push(null);
    return { id: p.id, name: typeof p.name === 'string' ? p.name.slice(0, 24) : 'Page', ctl: ctl.map(function (x) { return typeof x === 'string' ? x : null; }) };
  }
  function validMapOv(m) {
    if (!isObj(m)) return null;
    var o = { ctl: {}, custom: [], pages: [], banks: [] };
    if (isObj(m.ctl)) for (var k in m.ctl) if (isObj(m.ctl[k])) o.ctl[k] = clone(m.ctl[k]);
    if (isArr(m.custom)) m.custom.forEach(function (c) { var v = validCtl(c); if (v) o.custom.push(v); });
    if (isArr(m.pages)) m.pages.forEach(function (p) { var v = validPage(p); if (v) o.pages.push(v); });
    if (isArr(m.banks)) m.banks.forEach(function (b) { if (isObj(b) && typeof b.msb === 'number' && typeof b.lsb === 'number') o.banks.push({ msb: clamp(b.msb, 0, 127), lsb: clamp(b.lsb, 0, 127), name: String(b.name || ('Bank ' + b.msb + '/' + b.lsb)).slice(0, 24) }); });
    return o;
  }
  function validPreset(p) {
    if (!isObj(p) || typeof p.id !== 'string' || !p.id) return null;
    var o = { id: p.id, name: typeof p.name === 'string' ? p.name.slice(0, 48) : 'Sound', star: !!p.star, tags: [], dev: typeof p.dev === 'string' ? p.dev : 'generic', prog: null, parts: {},
      created: typeof p.created === 'number' ? p.created : Date.now(), updated: typeof p.updated === 'number' ? p.updated : Date.now(), used: typeof p.used === 'number' ? p.used : 0 };
    if (isArr(p.tags)) o.tags = p.tags.filter(function (t) { return typeof t === 'string'; }).map(function (t) { return t.slice(0, 20); }).slice(0, 8);
    if (isObj(p.prog) && typeof p.prog.pc === 'number') o.prog = { msb: clamp(num(p.prog.msb, 0), 0, 127), lsb: clamp(num(p.prog.lsb, 0), 0, 127), pc: clamp(p.prog.pc, 1, 128), ch: (typeof p.prog.ch === 'number' && p.prog.ch >= 0 && p.prog.ch < 16) ? p.prog.ch : null };
    if (isObj(p.parts)) for (var k in p.parts) {
      if (!/^(\d{1,2})$/.test(k) || +k > 15) continue;
      var pk = String(+k); // '01' and '1' are the same Part: recallPlan looks up String(part)
      var src = p.parts[k], part = { cc: {}, ctl: {} }, any = false;
      if (isObj(src)) {
        if (isObj(src.cc)) for (var c in src.cc) if (/^\d{1,3}$/.test(c) && +c < 128 && typeof src.cc[c] === 'number') { part.cc[c] = clamp(src.cc[c], 0, 127); any = true; }
        if (isObj(src.ctl)) for (var i in src.ctl) if (typeof src.ctl[i] === 'number') { part.ctl[i] = clamp(src.ctl[i], 0, 127); any = true; }
      }
      if (any) o.parts[pk] = part;
    }
    // 1.3 full snapshot (docs/SYNTH-TAB-PLAN.md): what the Synth tab brings back besides the synth
    if (isObj(p.snap)) {
      var sn = {};
      if (typeof p.snap.colour === 'string' && /^[a-z]{1,12}$/.test(p.snap.colour)) sn.colour = p.snap.colour;
      if (isObj(p.snap.app) && typeof p.snap.app.root === 'number') sn.app = { root: clamp(Math.round(p.snap.app.root), 0, 11), scale: typeof p.snap.app.scale === 'string' ? p.snap.app.scale.slice(0, 24) : 'major', mode: typeof p.snap.app.mode === 'number' ? clamp(Math.round(p.snap.app.mode), 0, 11) : 0 };
      if (isArr(p.snap.fav) && p.snap.fav.length === 4 && p.snap.fav.every(function (n) { return typeof n === 'number' && n >= 0 && n < 128; })) sn.fav = p.snap.fav.slice();
      if (isObj(p.snap.split)) { // the Hub's key split (SLMidiHub.split): {off:true} = this preset switches the split off
        if (p.snap.split.off) sn.split = { off: true };
        else if (typeof p.snap.split.at === 'number') sn.split = { at: clamp(Math.round(p.snap.split.at), 1, 127), at2: typeof p.snap.split.at2 === 'number' ? clamp(Math.round(p.snap.split.at2), 1, 127) : null, parts: isArr(p.snap.split.parts) ? p.snap.split.parts.slice(0, 2).map(function (n) { return clamp(num(n, 2), 1, 16); }) : [2], port: typeof p.snap.split.port === 'string' ? p.snap.split.port.slice(0, 40) : '', sus: p.snap.split.sus !== false, on: p.snap.split.on !== false };
      }
      if (Object.keys(sn).length) o.snap = sn;
    }
    return o;
  }
  // migrate(name, blob) -> a valid blob of the current version (defaults when
  // junk). A blob from a NEWER app is returned validated too; readBlob marks
  // it read-only so it is never overwritten.
  function migrate(name, blob) {
    var o;
    if (name === 'deck') {
      o = deckDefaults();
      if (!isObj(blob)) return o;
      if (['knobs', 'buttons', 'sounds', 'scope', 'map'].indexOf(blob.tab) >= 0) o.tab = blob.tab;
      o.settleMs = clamp(num(blob.settleMs, 250), 0, 2000); o.pace = clamp(num(blob.pace, 2), 0, 200);
      o.globalCh = clamp(num(blob.globalCh, 0), 0, 15); o.learnPort = typeof blob.learnPort === 'string' ? blob.learnPort : 'all';
      o.bankMode = blob.bankMode === 'whole' ? 'whole' : 'part';
      if (isObj(blob.scope)) {
        o.scope.win = [1, 2, 4, 8].indexOf(blob.scope.win) >= 0 ? blob.scope.win : 4;
        if (isArr(blob.scope.lanes)) o.scope.lanes = blob.scope.lanes.filter(function (x) { return typeof x === 'number' && x >= 0 && x < 128; }).slice(0, 4);
        o.scope.showOut = blob.scope.showOut !== false;
      }
      if (isObj(blob.maps)) for (var k in blob.maps) { var v = validMapOv(blob.maps[k]); if (v) o.maps[k] = v; }
      return o;
    }
    if (name === 'decklib') {
      o = { v: VERSION, items: [] };
      if (isObj(blob) && isArr(blob.items)) blob.items.forEach(function (p) { var v = validPreset(p); if (v && o.items.length < LIB_CAP) o.items.push(v); });
      return o;
    }
    if (name === 'deckvals') {
      o = { v: VERSION, ctl: {}, lastBank: null };
      if (isObj(blob)) {
        if (isObj(blob.ctl)) for (var pk in blob.ctl) if (isObj(blob.ctl[pk])) { o.ctl[pk] = {}; for (var id in blob.ctl[pk]) if (typeof blob.ctl[pk][id] === 'number') o.ctl[pk][id] = clamp(blob.ctl[pk][id], 0, 127); }
        if (isObj(blob.lastBank) && typeof blob.lastBank.t === 'number') o.lastBank = { msb: clamp(num(blob.lastBank.msb, 0), 0, 127), lsb: clamp(num(blob.lastBank.lsb, 0), 0, 127), pc: clamp(num(blob.lastBank.pc, 1), 1, 128), ch: clamp(num(blob.lastBank.ch, 0), 0, 15), t: blob.lastBank.t };
      }
      return o;
    }
    if (name === 'names') {
      o = { v: VERSION };
      if (isObj(blob)) for (var b in blob) if (/^\d{1,3}\/\d{1,3}$/.test(b) && isObj(blob[b])) { o[b] = {}; for (var pc in blob[b]) if (/^\d{1,3}$/.test(pc) && typeof blob[b][pc] === 'string') o[b][pc] = blob[b][pc].slice(0, 48); }
      return o;
    }
    return blob;
  }
  function readBlob(name) {
    var raw = App.store.get('midihub.' + name, null);
    ro[name] = isObj(raw) && typeof raw.v === 'number' && raw.v > VERSION;
    return migrate(name, raw);
  }
  function loadAll() {
    deck = readBlob('deck'); lib = readBlob('decklib'); vals = readBlob('deckvals'); names = readBlob('names');
    mapCache = {};
  }
  function blobOf(name) { return name === 'deck' ? deck : name === 'decklib' ? lib : name === 'deckvals' ? vals : names; }
  function persist(name) {
    if (ro[name]) return;
    dirty[name] = true;
    if (persistT[name]) clearTimeout(persistT[name]);
    persistT[name] = setTimeout(function () { persistT[name] = 0; flushOne(name); }, 300);
  }
  function flushOne(name) {
    if (!dirty[name] || ro[name]) return;
    dirty[name] = false;
    if (persistT[name]) { clearTimeout(persistT[name]); persistT[name] = 0; }
    App.store.set('midihub.' + name, blobOf(name));
  }
  function flushAll() { ['deck', 'decklib', 'deckvals', 'names'].forEach(flushOne); }

  // ---- the effective map: defaults ⊕ overrides ⊕ custom controls/pages ----
  function profileKey() { return api ? api.profileKey() : 'generic'; }
  function ovFor(pk, create) {
    if (!deck.maps[pk] && create) deck.maps[pk] = { ctl: {}, custom: [], pages: [], banks: [] };
    return deck.maps[pk] || null;
  }
  function map(pk) {
    pk = pk || profileKey();
    if (mapCache[pk]) return mapCache[pk];
    var base = Maps[pk] || Maps.generic, ov = deck ? deck.maps[pk] : null;
    var controls = [], byId = {};
    (base.controls || []).forEach(function (c) {
      var o = clone(c);
      if (ov && ov.ctl && ov.ctl[c.id]) { var p = ov.ctl[c.id]; for (var k in p) { if (k === 'sx' && isObj(p.sx)) { o.sx = o.sx || {}; for (var s in p.sx) o.sx[s] = p.sx[s]; } else o[k] = p[k]; } }
      var v = validCtl(o); if (!v) return;
      v.edited = !!(ov && ov.ctl && ov.ctl[c.id]);
      controls.push(v); byId[v.id] = v;
    });
    if (ov) ov.custom.forEach(function (c) { var v = validCtl(c); if (!v || byId[v.id]) return; v.custom = true; controls.push(v); byId[v.id] = v; });
    var pages = [], pageIds = {};
    (base.pages || []).forEach(function (p) {
      var o = clone(p), rep = ov && ov.pages.filter(function (x) { return x.id === p.id; })[0];
      if (rep) { o.ctl = rep.ctl.slice(); o.name = rep.name || o.name; o.edited = true; }
      pages.push(o); pageIds[o.id] = true;
    });
    if (ov) ov.pages.forEach(function (p) { if (pageIds[p.id]) return; var o = clone(p); o.custom = true; pages.push(o); pageIds[o.id] = true; });
    var banks = (base.banks || []).map(clone);
    if (ov) ov.banks.forEach(function (b) { var o = clone(b); o.custom = true; banks.push(o); });
    var m = { key: pk, name: base.name, short: base.short || base.name, sections: (base.sections || []).map(clone), extraTitle: base.extraTitle || 'More',
      controls: controls, byId: byId, pages: pages, banks: banks, bankModes: base.bankModes || null, bulk: base.bulk || null,
      nameFile: base.nameFile || null, identity: base.identity || null, notes: (base.notes || []).slice() };
    if (!m.sections.some(function (s) { return s.id === 'custom'; })) m.sections.push({ id: 'custom', name: 'Yours' });
    mapCache[pk] = m;
    return m;
  }
  function ctlById(id) { return map().byId[id] || null; }
  function sectionName(m, id) { var s = m.sections.filter(function (x) { return x.id === id; })[0]; return s ? s.name : id; }
  function invalidate() { mapCache = {}; }

  // hubKnobs(profileKey) -> the Hub card's knobs from the map, or null (built-ins)
  function hubKnobs(pk) {
    var m = map(pk), hub = m.controls.filter(function (c) { return c.sec === 'hub' && c.kind === 'cc' && c.ui === 'knob' && c.num != null; });
    if (!hub.length) return null;
    var K = function (c) { return { cc: c.num, name: c.name, def: c.def }; };
    var hero = hub.filter(function (c) { return c.slot === 'hero'; })[0];
    return { hero: hero ? K(hero) : null, main: hub.filter(function (c) { return c.slot === 'main'; }).map(K), extra: hub.filter(function (c) { return c.slot === 'extra'; }).map(K), extraTitle: m.extraTitle };
  }

  // setControl(id, patch): a PATCH over the default (changed fields only) or
  // the custom control itself; radio members share num/ch/kind with siblings
  function setControl(id, patch, quiet) {
    if (!deck || !isObj(patch)) return false;
    var pk = profileKey(), ov = ovFor(pk, true), base = (Maps[pk] || Maps.generic).controls.filter(function (c) { return c.id === id; })[0];
    var cur = ctlById(id); if (!cur && !base) return false;
    var ids = [id];
    if (cur && cur.ui === 'radio' && cur.group) {
      var shared = {}, anyShared = false;
      ['num', 'ch', 'kind'].forEach(function (k) { if (k in patch) { shared[k] = patch[k]; anyShared = true; } });
      if (anyShared) map().controls.forEach(function (c) { if (c.group === cur.group && c.id !== id) ids.push(c.id); });
    }
    ids.forEach(function (cid) {
      var p = cid === id ? patch : (function () { var o = {}; ['num', 'ch', 'kind'].forEach(function (k) { if (k in patch) o[k] = patch[k]; }); return o; })();
      var custom = ov.custom.filter(function (c) { return c.id === cid; })[0];
      if (custom) { for (var k in p) { if (k === 'sx' && isObj(p.sx)) { custom.sx = custom.sx || {}; for (var s in p.sx) custom.sx[s] = p.sx[s]; } else custom[k] = p[k]; } return; }
      var d = (Maps[pk] || Maps.generic).controls.filter(function (c) { return c.id === cid; })[0]; if (!d) return;
      var o = ov.ctl[cid] || {};
      for (var k2 in p) {
        if (k2 === 'sx' && isObj(p.sx)) { o.sx = o.sx || {}; for (var s2 in p.sx) { if (d.sx && d.sx[s2] === p.sx[s2]) delete o.sx[s2]; else o.sx[s2] = p.sx[s2]; } if (!Object.keys(o.sx).length) delete o.sx; }
        else if (d[k2] === p[k2] || (d[k2] == null && p[k2] == null)) delete o[k2];
        else o[k2] = p[k2];
      }
      if (Object.keys(o).length) ov.ctl[cid] = o; else delete ov.ctl[cid];
    });
    invalidate(); persist('deck');
    if (!quiet) afterMapChange(cur ? cur.sec === 'hub' : false);
    return true;
  }
  function resetControl(id) {
    var ov = ovFor(profileKey(), false); if (!ov) return;
    var wasHub = (ctlById(id) || {}).sec === 'hub';
    delete ov.ctl[id];
    invalidate(); persist('deck'); afterMapChange(wasHub);
  }
  function deleteControl(id) {
    var ov = ovFor(profileKey(), false); if (!ov) return;
    ov.custom = ov.custom.filter(function (c) { return c.id !== id; });
    ov.pages.forEach(function (p) { p.ctl = p.ctl.map(function (x) { return x === id ? null : x; }); });
    invalidate(); persist('deck'); afterMapChange(false);
  }
  function addControl(spec) {
    var ov = ovFor(profileKey(), true);
    var c = validCtl(spec); if (!c) return null;
    c.id = uid('u_'); c.sec = 'custom'; c.conf = c.conf === 'learned' ? 'learned' : 'unverified';
    ov.custom.push(c);
    invalidate(); persist('deck'); afterMapChange(false);
    return c.id;
  }
  function resetMap() {
    if (!deck) return;
    delete deck.maps[profileKey()];
    invalidate(); persist('deck'); afterMapChange(true);
    toast('Map back to the defaults');
  }
  function setPage(id, patch) {
    var ov = ovFor(profileKey(), true), m = map(), p = m.pages.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    var entry = ov.pages.filter(function (x) { return x.id === id; })[0];
    if (!entry) { entry = { id: id, name: p.name, ctl: p.ctl.slice() }; ov.pages.push(entry); }
    if ('name' in patch) entry.name = String(patch.name || 'Page').slice(0, 24);
    if ('ctl' in patch) entry.ctl = validPage({ id: id, ctl: patch.ctl }).ctl;
    invalidate(); persist('deck'); afterMapChange(false);
  }
  function addPage(name) {
    var ov = ovFor(profileKey(), true), id = uid('pg_');
    ov.pages.push({ id: id, name: name || ('Page ' + (map().pages.length + 1)), ctl: [null, null, null, null, null, null, null, null] });
    invalidate(); persist('deck'); pageId = id; afterMapChange(false);
    return id;
  }
  function deletePage(id) {
    var ov = ovFor(profileKey(), false); if (!ov) return;
    ov.pages = ov.pages.filter(function (p) { return p.id !== id; });
    invalidate(); persist('deck'); if (pageId === id) pageId = null; afterMapChange(false);
  }
  function afterMapChange(hub) {
    if (!mounted) return;
    if (hub && api.renderControl) api.renderControl(); // calls onPart() → repaints the deck
    renderPages(); renderButtons(); renderMap(); renderBanks(); paintNow();
  }

  // ---- channels, bytes, the ONE send funnel ----
  function chOf(ctl) {
    if (ctl.ch === 'global') return clamp(deck.globalCh, 0, 15);
    if (typeof ctl.ch === 'number') return ctl.ch;
    return api.ch();
  }
  // switch / SysEx-knob states live per Part (the selected Part at the time
  // for 'part' and 'global' controls; a fixed channel keys by that channel)
  function stateKey(ctl) { return typeof ctl.ch === 'number' ? String(ctl.ch) : String(api.ch()); }
  function getState(ctl, key) { var k = key || stateKey(ctl), a = vals.ctl[k]; var id = ctl.ui === 'radio' ? ctl.group : ctl.id; return a && typeof a[id] === 'number' ? a[id] : null; }
  function setState(ctl, v, key) { var k = key || stateKey(ctl), id = ctl.ui === 'radio' ? ctl.group : ctl.id; vals.ctl[k] = vals.ctl[k] || {}; vals.ctl[k][id] = v; persist('deckvals'); }
  function unsure(ctl) { return ctl.kind === 'sx' ? !(ctl.sx && ctl.sx.addr) : ctl.num == null; }

  // SysEx through the profile's builder; 'p' = Part nibble, 's' = scene,
  // '{v}' = the value. null when the profile has no builder or a byte is bad.
  function sxBytes(ctl, dataHex, v, part) {
    var p = api.profile(), sx = p.sysex; if (!sx || !sx.paramChange || !ctl.sx || !ctl.sx.addr) return null;
    var pn = (part == null ? chOf(ctl) : part).toString(16).toUpperCase(), sn = (typeof ctl.scene === 'number' ? ctl.scene : 0).toString(16).toUpperCase();
    var addrStr = String(ctl.sx.addr).replace(/p/g, pn).replace(/s/g, sn);
    var dataStr = String(dataHex == null ? '' : dataHex).replace(/\{v\}/g, hex([clamp(Math.round(v || 0), 0, 127)]));
    if (/[^0-9a-fA-F\s]/.test(addrStr) || /[^0-9a-fA-F\s]/.test(dataStr)) return null;
    var addr, data;
    try { addr = api.parseHex(addrStr); data = api.parseHex(dataStr); } catch (e) { return null; }
    if (addr.length !== (sx.addrLen || 3) || !data.length) return null;
    var modelStr = api.g('model', hex(sx.model)), model;
    try { model = api.parseHex(modelStr); } catch (e2) { model = sx.model.slice(); }
    var bytes;
    try { bytes = sx.paramChange({ dev: clamp(num(api.g('dev', 0), 0), 0, sx.devMax || 15), model: model, addr: addr, data: data, size: [] }); } catch (e3) { return null; }
    return validSysex(bytes) ? bytes : null;
  }
  function validSysex(b) {
    if (!isArr(b) || b.length < 3 || b[0] !== 0xF0 || b[b.length - 1] !== 0xF7) return false;
    for (var i = 1; i < b.length - 1; i++) if (typeof b[i] !== 'number' || b[i] < 0 || b[i] > 127) return false;
    return true;
  }
  // bytesFor(ctl, which, v, part) -> { bytes, origin } | null
  //   which: 'on' | 'off' | 'val' (radio / trigger) | 'knob' (v)
  function bytesFor(ctl, which, v, part) {
    var c = part == null ? chOf(ctl) : part;
    if (ctl.kind === 'sx') {
      // 'on' / 'off' = the switch bytes, 'val' (radio, trigger) = the on bytes, 'knob' = sx.val with {v}
      var d = which === 'off' ? (ctl.sx && ctl.sx.off) : which === 'knob' ? ((ctl.sx && ctl.sx.val) || '{v}') : (ctl.sx && ctl.sx.on);
      var b = sxBytes(ctl, d, v, c); return b ? { bytes: b, origin: 'raw' } : null;
    }
    if (ctl.num == null) return null;
    var data = which === 'on' ? ctl.on : which === 'off' ? ctl.off : which === 'val' ? (typeof ctl.val === 'number' ? ctl.val : 0) : clamp(Math.round(v || 0), 0, 127);
    if (ctl.kind === 'pc') return { bytes: [0xC0 | c, data & 127], origin: undefined };
    return { bytes: [0xB0 | c, ctl.num & 127, data & 127], origin: undefined };
  }
  function refuse(msg) { var now = Date.now(); if (now - lastRefuse > 400) toast(msg); lastRefuse = now; }
  function outIsLumi() { return /lumi/i.test(api.hubOutName() || ''); }
  function txCheck(bytes) {
    var why = !api.hasOut() ? (App.active === 'midihub' ? 'No MIDI output — pick one under Synth out' : 'Not connected to a synth — connect at the top of the page') : outIsLumi() ? 'That output is the LUMI (key lights) — pick the synth under Synth out' :
      (bytes && bytes[0] === 0xF0 && !api.sysexOk) ? 'SysEx not allowed by the browser — reconnect MIDI and allow SysEx' : null;
    if (!why) return true;
    refuse(why);
    if (mounted) { paintNow(); paintNative(); } // the Now bar shows the same reason
    return false;
  }
  // THE funnel: every byte the deck sends goes through here
  function tx(bytes, origin) {
    if (!api || !isArr(bytes) || !bytes.length) return false;
    if (!txCheck(bytes)) return false;
    var ok = false;
    try { ok = !!api.send(bytes, origin); } catch (e) { console.error('synth deck send', e); ok = false; }
    return ok;
  }
  function unverifiedNote(ctl) {
    if (ctl.kind === 'sx' && ctl.conf === 'unverified' && !unverifiedToasted) { unverifiedToasted = true; toast('Sending an unverified ' + map().short + ' address — check the synth'); }
  }
  // send one control message; returns true only when bytes went out
  function sendCtl(ctl, which, v, part) {
    if (unsure(ctl)) { toast('No number yet — set it in Map or tap Learn'); return false; }
    var b = bytesFor(ctl, which, v, part);
    if (!b) { if (ctl.kind === 'sx' && !api.profile().sysex) toast('This device profile has no SysEx builder'); else toast('Bad bytes for ' + ctl.name + ' — check it in Map'); return false; }
    var ok = tx(b.bytes, b.origin);
    if (ok) unverifiedNote(ctl);
    return ok;
  }

  // ============================================================ MOUNT ====
  var TABS = [['knobs', 'Knobs'], ['buttons', 'Buttons'], ['sounds', 'Sounds'], ['scope', 'Scope'], ['map', 'Map']];
  function init(b1, b2, hubApi) {
    if (!b1 || !b2 || !hubApi) return;
    api = hubApi; box1 = b1; box2 = b2;
    // the Hub re-renders on Import / Reset Hub, which wrote the store directly:
    // pending writes of ours are dropped and the blobs re-read
    for (var pk in persistT) if (persistT[pk]) { clearTimeout(persistT[pk]); persistT[pk] = 0; }
    dirty = {};
    loadAll();
    injectStyles();
    cancelLoad(true); drainHeld('remount'); learnOff(true);
    if (window.SLSynthScope && SLSynthScope.unmount) { try { SLSynthScope.unmount(); } catch (e) { /* not mounted */ } }
    box1.innerHTML =
      '<div class="card sdk-now" id="sdk-now">' +
        '<div class="sdk-now-main"><button type="button" class="sdk-name" id="sdk-nowname" title="Open this sound in Sounds"></button><span class="muted small" id="sdk-nowsub"></span></div>' +
        '<div class="sdk-now-acts">' +
          '<button type="button" class="btn sdk-big" id="sdk-prev" aria-label="Previous program">‹ Prev</button>' +
          '<button type="button" class="btn sdk-big" id="sdk-next" aria-label="Next program">Next ›</button>' +
          '<button type="button" class="btn sdk-big" id="sdk-star" aria-pressed="false" title="Pin this sound up here">' + App.icon('star', 18) + ' <span>Star</span></button>' +
          '<button type="button" class="btn sdk-big primary" id="sdk-save">Save sound</button>' +
        '</div>' +
        '<div id="sdk-pins" class="sdk-pins" role="group" aria-label="Pinned sounds"></div>' +
        '<div class="row tight sdk-ldrow"><div id="sdk-ldst" role="status" aria-live="polite"></div><button type="button" class="btn sm" id="sdk-lstop" hidden>Stop</button></div>' +
        '<div id="sdk-native" class="mh-warn small" hidden></div>' +
        '<form id="sdk-save-form" class="sdk-form" hidden autocomplete="off">' +
          '<input type="hidden" id="sdk-pid" value="">' +
          '<div class="row tight"><label class="field">Name<input type="text" id="sdk-pname" maxlength="48" required placeholder="Warm Pad"></label>' +
          '<label class="field">Tags<input type="text" id="sdk-ptags" maxlength="80" placeholder="pad, soft"></label></div>' +
          '<div class="row tight"><span class="ctl-label">Keep</span><div class="seg" id="sdk-pscope" role="group" aria-label="What to save">' +
            '<button type="button" data-scope="part" aria-pressed="true" class="active">This Part</button><button type="button" data-scope="all" aria-pressed="false">All Parts</button><button type="button" data-scope="prog" aria-pressed="false">Program only</button></div></div>' +
          '<div class="row tight sdk-incs"><label class="mh-chk"><input type="checkbox" id="sdk-incprog" checked> Program <span id="sdk-progtxt" class="mh-mono"></span></label>' +
            '<label class="mh-chk"><input type="checkbox" id="sdk-incknobs" checked> Knobs</label><label class="mh-chk"><input type="checkbox" id="sdk-incbtns" checked> Buttons &amp; scenes</label></div>' +
          '<div class="row tight"><button type="submit" class="btn primary" id="sdk-psave">Save</button><button type="button" class="btn" id="sdk-pcancel">Cancel</button><span class="muted small" id="sdk-pnote"></span></div>' +
        '</form>' +
      '</div>' +
      '<div class="seg sdk-tabs" id="sdk-tabs" role="group" aria-label="Synth deck">' + TABS.map(function (t) { return '<button type="button" data-tab="' + t[0] + '" aria-pressed="false">' + t[1] + '</button>'; }).join('') + '</div>';
    box2.innerHTML = TABS.map(function (t) {
      var inner = t[0] === 'knobs' ? '<div id="sdk-pages" class="card"></div>' : t[0] === 'buttons' ? '<div id="sdk-buttons" class="card"></div>' :
        t[0] === 'sounds' ? '<div id="sdk-sounds" class="card"></div>' : t[0] === 'scope' ? '<div id="sdk-scope-tab" class="card"></div>' : '<div id="sdk-map" class="card"></div>';
      return '<div class="sdk-tab" data-tab="' + t[0] + '" hidden>' + inner + '</div>';
    }).join('');
    els = {};
    ['now', 'nowname', 'nowsub', 'prev', 'next', 'star', 'save', 'pins', 'ldst', 'lstop', 'native', 'save-form', 'pid', 'pname', 'ptags', 'pscope', 'incprog', 'progtxt', 'incknobs', 'incbtns', 'psave', 'pcancel', 'pnote', 'tabs']
      .forEach(function (id) { els[id] = box1.querySelector('#sdk-' + id); });
    ['pages', 'buttons', 'sounds', 'scope-tab', 'map'].forEach(function (id) { els[id] = box2.querySelector('#sdk-' + id); });
    mounted = true; lastProfile = profileKey(); openRow = null; twoStep = {}; editing = {};
    wireBox();
    wireOnce();
    renderPages(); renderButtons(); renderSounds(); renderMap();
    paintNow(); paintNative();
    showTab(deck.tab, true);
  }

  // DOM listeners: per mount (the boxes are new each time)
  function wireBox() {
    els.prev.addEventListener('click', function () { stepProgram(-1); });
    els.next.addEventListener('click', function () { stepProgram(1); });
    els.star.addEventListener('click', function () { starCurrent(); });
    els.save.addEventListener('click', function () { openSaveForm(null); });
    els.nowname.addEventListener('click', function () { var m = matchPreset(); tab('sounds'); if (m) revealTile(m.id); });
    els.pins.addEventListener('click', function (e) { var b = e.target.closest('[data-preset]'); if (b) load(b.dataset.preset); });
    els.lstop.addEventListener('click', function () { cancelLoad(); });
    els.tabs.addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) tab(b.dataset.tab); });
    els['save-form'].addEventListener('submit', function (e) { e.preventDefault(); submitSaveForm(); });
    els.pcancel.addEventListener('click', function () { closeSaveForm(); });
    els.pscope.addEventListener('click', function (e) { var b = e.target.closest('[data-scope]'); if (!b) return; qa('button', els.pscope).forEach(function (x) { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); }); paintSaveNote(); });
    els.incprog.addEventListener('change', paintSaveNote);
    // knob pages: the Hub's gestures, the deck's value model
    api.wireKnobs(els.pages, { turn: pageTurn, def: pageDef, val: pageVal });
    els.pages.addEventListener('click', onPagesClick);
    els.pages.addEventListener('change', onPagesChange);
    // buttons
    els.buttons.addEventListener('click', onButtonsClick);
    els.buttons.addEventListener('pointerdown', onMomentaryDown);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { els.buttons.addEventListener(ev, onMomentaryUp); });
    els.buttons.addEventListener('keydown', function (e) { var b = e.target.closest && e.target.closest('.sdk-btn[data-ui="momentary"]'); if (!b || e.repeat || (e.key !== ' ' && e.key !== 'Enter')) return; e.preventDefault(); pressMomentary(b.dataset.ctl, b); });
    els.buttons.addEventListener('keyup', function (e) { var b = e.target.closest && e.target.closest('.sdk-btn[data-ui="momentary"]'); if (!b || (e.key !== ' ' && e.key !== 'Enter')) return; e.preventDefault(); releaseMomentary(b.dataset.ctl); });
    els.buttons.addEventListener('change', onButtonsChange);
    // sounds
    els.sounds.addEventListener('click', onSoundsClick);
    els.sounds.addEventListener('input', onSoundsInput);
    els.sounds.addEventListener('change', onSoundsChange);
    els.sounds.addEventListener('mouseover', function (e) { var t = e.target.closest && e.target.closest('.sdk-tile'); if (t) paintBytes(t.dataset.preset); });
    els.sounds.addEventListener('focusin', function (e) { var t = e.target.closest && e.target.closest('.sdk-tile'); if (t) paintBytes(t.dataset.preset); });
    // map
    els.map.addEventListener('click', onMapClick);
    els.map.addEventListener('change', onMapChange);
  }

  // bus / window listeners: ONCE for the app's life, gated on the Hub page
  function wireOnce() {
    if (wired) return; wired = true;
    App.on('midi:raw', onRaw);
    App.on('midi:out', onOut);
    App.on('midi:state', function () { drainHeld('MIDI changed'); cancelLoad(); if (mounted) { paintNow(); paintNative(); paintLearnPorts(); } });
    App.on('midi:beforeoutput', function () { drainHeld('output changing'); cancelLoad(); });
    window.addEventListener('blur', function () { drainHeld('blur'); cancelLoad(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) { drainHeld('hidden'); cancelLoad(); flushAll(); scopeSync(); } else scopeSync(); });
    window.addEventListener('pagehide', function () { drainHeld('pagehide'); cancelLoad(); flushAll(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && learning && active()) { learnOff(); e.stopPropagation(); } });
    // the page's own show/hide (App has no page event): the panel's class flips
    var panel = document.getElementById('panel-midihub');
    if (panel && window.MutationObserver) new MutationObserver(function () { scopeSync(); }).observe(panel, { attributes: true, attributeFilter: ['class'] });
    // the Hub's Synth out / In pickers live outside the deck: follow them
    var hubRoot = api.root();
    if (hubRoot) hubRoot.addEventListener('change', function (e) { if (e.target && (e.target.id === 'mh-out' || e.target.id === 'mh-in') && mounted) { paintNow(); paintNative(); paintLearnPorts(); } });
  }

  // ============================================================ TABS ====
  function tab(name) {
    if (name === undefined) return deck.tab;
    if (!TABS.some(function (t) { return t[0] === name; })) return deck.tab;
    showTab(name, false);
    return deck.tab;
  }
  function showTab(name, first) {
    if (deck.tab !== name) { deck.tab = name; persist('deck'); }
    if (!mounted) return;
    qa('button', els.tabs).forEach(function (b) { var on = b.dataset.tab === name; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    qa('.sdk-tab', box2).forEach(function (p) { p.hidden = p.dataset.tab !== name; });
    var cv = api.cv(); if (cv) cv.hidden = name !== 'knobs';
    if (name === 'scope') renderScope();
    if (name === 'sounds') paintBytes(null);
    scopeSync();
    if (!first && name !== 'map') learnOff(true);
  }

  // ============================================================ NOW BAR ====
  function hubProg() {
    var p = api.profile();
    return { msb: clamp(num(api.g('msb', p.bankMsb), 0), 0, 127), lsb: clamp(num(api.g('lsb', 0), 0), 0, 127), pc: api.progNum() };
  }
  function progTouched() {
    var p = hubProg(), key = p.msb + '/' + p.lsb + '/' + p.pc;
    if (key !== progSeen) { progSeen = key; progSeenT = Date.now(); }
  }
  // the sound the synth is on, if the library knows it
  function matchPreset(prog) {
    var p = prog || hubProg(), part = api.ch(), best = null;
    lib.items.forEach(function (it) {
      if (!it.prog || it.prog.msb !== p.msb || it.prog.lsb !== p.lsb || it.prog.pc !== p.pc) return;
      if (it.prog.ch != null && it.prog.ch !== part) return;
      if (!best) { best = it; return; }
      var a = it.prog.ch === part ? 1 : 0, b = best.prog.ch === part ? 1 : 0;
      if (a > b || (a === b && (it.used || 0) > (best.used || 0))) best = it;
    });
    return best;
  }
  function userName(msb, lsb, pc) {
    var pc0 = String(pc - 1), m = map(), tries = [msb + '/' + lsb];
    if (m.bankModes && (msb === 63 || msb === 64)) tries.push('64/' + lsb, '63/' + lsb);
    for (var i = 0; i < tries.length; i++) { var bank = names[tries[i]]; if (bank && typeof bank[pc0] === 'string' && bank[pc0]) return bank[pc0]; }
    return null;
  }
  function factoryName(msb, lsb, pc) {
    var m = map(); if (!m.nameFile) return null;
    if (!(msb === 63 || msb === 64)) return null;
    if (!factory) { loadFactory(); return null; }
    var bank = factory.banks && factory.banks[String(lsb)];
    return bank && typeof bank[pc - 1] === 'string' ? bank[pc - 1] : null;
  }
  function loadFactory() {
    var m = map(); if (factoryState || !m.nameFile) return;
    factoryState = 'loading';
    try {
      var x = new XMLHttpRequest();
      x.open('GET', m.nameFile, true);
      x.onreadystatechange = function () {
        if (x.readyState !== 4) return;
        try {
          var o = JSON.parse(x.responseText);
          if (isObj(o) && isObj(o.banks)) { factory = o; factoryState = 'ok'; if (mounted) { paintNow(); renderBankGrid(); renderTiles(); } return; }
        } catch (e) { /* fall through */ }
        factoryState = 'fail';
      };
      x.onerror = function () { factoryState = 'fail'; };
      x.send();
    } catch (e2) { factoryState = 'fail'; }
  }
  // names() -> fn(msb, lsb, pc1) -> the best known name or null
  function names_() { return function (msb, lsb, pc) { return userName(msb, lsb, pc) || factoryName(msb, lsb, pc); }; }
  function progName(msb, lsb, pc) {
    var it = matchPreset({ msb: msb, lsb: lsb, pc: pc }); if (it) return it.name;
    return userName(msb, lsb, pc) || factoryName(msb, lsb, pc) || ('Program ' + pc + ' · Bank ' + msb + '/' + lsb);
  }
  function outLabel() {
    if (!api.hasOut()) return { text: 'no output', bad: true };
    if (outIsLumi()) return { text: 'LUMI (key lights) — pick the synth under Synth out', bad: true };
    return { text: api.hubOutName() || 'output', bad: false };
  }
  function nowText() {
    var p = hubProg(), o = outLabel();
    return { name: progName(p.msb, p.lsb, p.pc), sub: api.partLabel() + ' ' + (api.ch() + 1) + ' · Bank ' + p.msb + '/' + p.lsb + ' · Program ' + p.pc + ' → ' + o.text, bad: o.bad };
  }
  function paintNow() {
    if (!mounted) return;
    progTouched();
    var t = nowText(), m = matchPreset();
    els.nowname.textContent = t.name;
    els.nowsub.textContent = t.sub; els.nowsub.classList.toggle('bad', t.bad);
    els.star.setAttribute('aria-pressed', String(!!(m && m.star))); els.star.classList.toggle('active', !!(m && m.star));
    paintPins(); paintSaveNote();
    qa('.sdk-pc.active', els.sounds).forEach(function (b) { b.classList.remove('active'); });
    var cur = q('.sdk-pc[data-pc="' + (hubProg().pc - 1) + '"]', els.sounds);
    if (cur && bankSel === hubProg().msb + '/' + hubProg().lsb) cur.classList.add('active');
  }
  function paintPins() {
    var starred = lib.items.filter(function (it) { return it.star; }).sort(function (a, b) { return (b.used || 0) - (a.used || 0); }).slice(0, PIN_MAX);
    els.pins.innerHTML = starred.map(function (it) { return '<button type="button" class="sdk-pin' + (lastLoaded === it.id ? ' active' : '') + '" data-preset="' + esc(it.id) + '" title="Load ' + esc(it.name) + '">' + App.icon('star', 12) + ' ' + esc(it.name) + '</button>'; }).join('');
    els.pins.hidden = !starred.length;
  }
  function paintNative() {
    if (!mounted) return;
    var m = api.midi(), lines = [], warn = false;
    if (!m || !m.supported) lines.push('No MIDI in this browser. On an iPad open soundLAB in the Web MIDI Browser app (App Store) with the synth on a USB adapter; on a computer use Chrome or Edge.');
    else if (m.platform === 'android' || m.platform === 'ios') {
      var n = m.outputName || 'none';
      lines.push('On this device soundLAB has one MIDI output: ' + n + '. Pick the synth as the output in Settings › MIDI before using these controls.');
      if (/lumi/i.test(n)) warn = true;
    } else if (m.ready && outIsLumi()) { lines.push('Synth out is the LUMI (key lights): the deck sends nothing to it. Pick the synth under Synth out.'); warn = true; }
    if (ro.deck || ro.decklib || ro.deckvals || ro.names) lines.push('Sound data from a newer soundLAB — update the app');
    els.native.textContent = lines.join(' ');
    els.native.classList.toggle('info', !warn);
    els.native.hidden = !lines.length;
  }
  function stepProgram(d) {
    if (!txCheck([0xC0])) return;
    api.sendProgram(api.progNum() + d);
    paintNow();
  }
  // star / unstar what the synth is on (a program-only entry when it is new)
  function starCurrent() {
    var m = matchPreset();
    if (m) { m.star = !m.star; m.updated = Date.now(); }
    else {
      if (lib.items.length >= LIB_CAP) return toast('200 sounds already — delete one');
      var p = hubProg(), t = nowText();
      m = { id: uid('p_'), name: t.name, star: true, tags: [], dev: profileKey(), prog: { msb: p.msb, lsb: p.lsb, pc: p.pc, ch: null }, parts: {}, created: Date.now(), updated: Date.now(), used: 0 };
      lib.items.push(m);
    }
    persist('decklib'); paintNow(); renderTiles();
    toast(m.star ? 'Pinned ' + m.name : 'Unpinned ' + m.name);
  }

  // ============================================================ KNOB PAGES ====
  function curPage() {
    var m = map(), p = m.pages.filter(function (x) { return x.id === pageId; })[0] || m.pages[0] || null;
    pageId = p ? p.id : null; return p;
  }
  function knobVal(ctl) {
    if (ctl.kind === 'sx') { var s = getState(ctl); return s == null ? ctl.def : s; }
    if (ctl.num == null) return ctl.def;
    var v = api.kvGet(ctl.num, chOf(ctl)); return v == null ? ctl.def : v;
  }
  function knobEl(ctl, slot) {
    var tmp = document.createElement('div');
    tmp.innerHTML = api.knobHTML({ cc: ctl.num == null ? -1 : ctl.num, name: ctl.name, def: ctl.def });
    var k = tmp.firstChild;
    k.dataset.ctl = ctl.id; k.dataset.kind = ctl.kind === 'sx' ? 'sx' : 'cc'; k.dataset.slot = slot;
    var sm = k.querySelector('small');
    if (ctl.kind === 'sx') sm.textContent = 'SysEx'; else if (ctl.num == null) sm.textContent = '?'; else sm.textContent = (ctl.kind === 'pc' ? 'PC ' : 'CC ') + ctl.num;
    if (unsure(ctl)) { k.classList.add('unsure'); sm.innerHTML = '<span class="sdk-badge">?</span> no number'; }
    else if (ctl.conf === 'unverified') sm.innerHTML += ' <span class="sdk-badge" title="not checked on your synth">?</span>';
    else if (ctl.conf === 'learned') sm.innerHTML += ' ' + App.icon('check', 10);
    k.title = ctl.name + (ctl.kind === 'sx' ? ' · SysEx ' + (ctl.sx && ctl.sx.addr || '?') : ctl.num == null ? ' · no number yet' : ' · CC ' + ctl.num) + ' — drag up/down or arrow keys (click it first to scroll it); double-tap resets';
    api.paintKnobEl(k, knobVal(ctl));
    return k;
  }
  function renderPages() {
    if (!mounted) return;
    var m = map(), p = curPage();
    var sel = '<div class="seg" id="sdk-pagesel" role="group" aria-label="Knob page">' + m.pages.map(function (x) { return '<button type="button" data-page="' + esc(x.id) + '" class="' + (p && x.id === p.id ? 'active' : '') + '" aria-pressed="' + String(!!(p && x.id === p.id)) + '">' + esc(x.name) + '</button>'; }).join('') + '</div>';
    els.pages.innerHTML =
      '<div class="row tight sdk-pagehead">' + sel + '<span class="muted small" id="sdk-pageinfo"></span></div>' +
      '<div class="mh-knobs" id="sdk-knobs"></div>' +
      '<div class="row tight sdk-pageacts"><button type="button" class="btn sm" id="sdk-pagesend" title="Send every knob on this page as it stands">Send page</button>' +
        '<button type="button" class="btn sm" id="sdk-addpage">+ Page</button><button type="button" class="btn sm" id="sdk-pageedit">Edit in Map</button>' +
        (p && p.custom ? '<button type="button" class="btn sm danger" id="sdk-delpage" data-two="page">Delete page</button>' : '') + '</div>' +
      '<div id="sdk-picker" class="sdk-picker" hidden></div>';
    var box = q('#sdk-knobs', els.pages);
    if (!p) { box.innerHTML = '<div class="muted small">No pages yet — tap + Page.</div>'; return; }
    p.ctl.forEach(function (id, i) {
      var ctl = id ? m.byId[id] : null;
      if (ctl && ctl.ui === 'knob') box.appendChild(knobEl(ctl, i));
      else { var s = el('button', 'sdk-slot', ''); s.type = 'button'; s.dataset.slot = i; s.innerHTML = App.icon('plus', 20) + '<span>add a knob</span>'; s.title = 'Put a knob in this slot'; box.appendChild(s); }
    });
    q('#sdk-pageinfo', els.pages).textContent = api.partLabel() + ' ' + (api.ch() + 1) + ' · ' + p.ctl.filter(function (x) { return x && m.byId[x]; }).length + ' knobs';
  }
  function paintPageKnobs() {
    if (!mounted) return;
    qa('.mh-knob[data-ctl]', els.pages).forEach(function (k) { var c = ctlById(k.dataset.ctl); if (c) api.paintKnobEl(k, knobVal(c)); });
    var info = q('#sdk-pageinfo', els.pages), p = curPage();
    if (info && p) info.textContent = api.partLabel() + ' ' + (api.ch() + 1) + ' · ' + p.ctl.filter(function (x) { return x && ctlById(x); }).length + ' knobs';
  }
  function pageTurn(c, v, k) {
    var ctl = ctlById(k.dataset.ctl); if (!ctl) return;
    v = clamp(Math.round(v), 0, 127);
    if (unsure(ctl)) { toast('No number yet — set it in Map or tap Learn'); return; }
    if (v === knobVal(ctl)) return;
    if (ctl.kind === 'sx') { if (sendCtl(ctl, 'knob', v)) { setState(ctl, v); api.paintKnobEl(k, v); } return; }
    if (!sendCtl(ctl, 'knob', v)) return;
    var part = chOf(ctl);
    api.setKv(ctl.num, v, part);
    api.paintKnobEl(k, v);
    if (part === api.ch()) api.paintKnob(ctl.num); // the Hub card twin follows
  }
  function pageDef(c, k) { var ctl = ctlById(k.dataset.ctl); return ctl ? ctl.def : 64; }
  function pageVal(c, k) { var ctl = ctlById(k.dataset.ctl); return ctl ? knobVal(ctl) : 0; }
  function sendPage() {
    var p = curPage(); if (!p) return;
    var n = 0, m = map();
    p.ctl.forEach(function (id) { var ctl = id && m.byId[id]; if (!ctl || ctl.ui !== 'knob' || unsure(ctl)) return; if (sendCtl(ctl, 'knob', knobVal(ctl))) n++; });
    if (n) toast('Sent ' + n + ' knobs on ' + api.partLabel() + ' ' + (api.ch() + 1));
  }
  function onPagesClick(e) {
    var t = e.target.closest ? e.target : null; if (!t) return;
    var b = t.closest('[data-page]'); if (b) { pageId = b.dataset.page; closePicker(); renderPages(); return; }
    var k = t.closest('.mh-knob.unsure'); if (k) { toast('No number yet — set it in Map or tap Learn'); return; }
    var s = t.closest('.sdk-slot'); if (s) { openPicker(+s.dataset.slot); return; }
    if (t.closest('#sdk-pagesend')) { sendPage(); return; }
    if (t.closest('#sdk-addpage')) { addPage(); toast('New page — tap a slot to fill it'); return; }
    if (t.closest('#sdk-pageedit')) { tab('map'); var mp = q('#sdk-mpages', els.map); if (mp && mp.scrollIntoView) mp.scrollIntoView({ block: 'start' }); return; }
    if (t.closest('#sdk-delpage')) { if (confirmTwo(t.closest('#sdk-delpage'), 'page', 'Really delete?')) { var p = curPage(); if (p) deletePage(p.id); } return; }
    if (t.closest('#sdk-pickok')) { pickerApply(); return; }
    if (t.closest('#sdk-pickcancel')) { closePicker(); return; }
  }
  function onPagesChange(e) {
    if (e.target.id === 'sdk-pickctl') { var nf = q('#sdk-picknew', els.pages); if (nf) nf.hidden = e.target.value !== '__new'; }
  }
  function openPicker(slot) {
    var pk = q('#sdk-picker', els.pages); if (!pk) return;
    var m = map(), opts = m.controls.filter(function (c) { return c.ui === 'knob'; }).map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + (c.kind === 'sx' ? ' (SysEx)' : c.num == null ? ' (?)' : ' (CC ' + c.num + ')') + '</option>'; }).join('');
    pk.innerHTML = '<div class="row tight"><label class="field">Knob<select id="sdk-pickctl"><option value="__new">New knob…</option>' + opts + '</select></label>' +
      '<span id="sdk-picknew" class="row tight"><label class="field">Name<input type="text" id="sdk-pickname" maxlength="24" placeholder="Filter EG"></label><label class="field">CC<input type="number" id="sdk-pickcc" min="0" max="127" inputmode="numeric" placeholder="n"></label></span>' +
      '<button type="button" class="btn sm primary" id="sdk-pickok">Put it here</button><button type="button" class="btn sm" id="sdk-pickcancel">Cancel</button></div>';
    pk.dataset.slot = slot; pk.hidden = false; editing.picker = true;
    var sel = q('#sdk-pickctl', pk); if (opts) { sel.selectedIndex = 1; q('#sdk-picknew', pk).hidden = true; }
    try { sel.focus(); } catch (e) { /* no focus */ }
  }
  function closePicker() { var pk = q('#sdk-picker', els.pages); if (pk) { pk.hidden = true; pk.innerHTML = ''; } delete editing.picker; }
  function pickerApply() {
    var pk = q('#sdk-picker', els.pages), p = curPage(); if (!pk || !p) return;
    var slot = +pk.dataset.slot, sel = q('#sdk-pickctl', pk), id = sel.value;
    if (id === '__new') {
      var name = (q('#sdk-pickname', pk).value || '').trim(), cc = q('#sdk-pickcc', pk).value;
      if (!name) { toast('Give the knob a name'); return; }
      id = addControl({ id: 'x', name: name, kind: 'cc', ui: 'knob', ch: 'part', num: cc === '' ? null : clamp(num(cc, 0), 0, 127), def: 64 });
      if (!id) return;
    }
    var ctl = p.ctl.slice(); ctl[slot] = id;
    closePicker(); setPage(p.id, { ctl: ctl });
  }

  // ============================================================ BUTTONS ====
  var BTN_UIS = { toggle: 1, momentary: 1, radio: 1, trigger: 1 };
  function btnHTML(ctl) {
    var st = getState(ctl), on = ctl.ui === 'radio' ? (st != null && st === ctl.val) : ctl.ui === 'toggle' ? st === 1 : false;
    var sub = ctl.kind === 'sx' ? 'SysEx' : ctl.num == null ? 'no number' : (ctl.kind === 'pc' ? 'PC ' : 'CC ') + ctl.num + (ctl.ui === 'radio' && typeof ctl.val === 'number' ? ' = ' + ctl.val : '');
    var badge = unsure(ctl) ? '<span class="sdk-badge" title="no number yet — set it in Map or tap Learn">?</span>' : ctl.conf === 'unverified' ? '<span class="sdk-badge" title="not checked on your synth">?</span>' :
      ctl.conf === 'documented' ? '<span class="sdk-dot" title="from documentation">·</span>' : ctl.conf === 'learned' ? '<span class="sdk-ok" title="learned from your synth">' + App.icon('check', 11) + '</span>' : '';
    var a = ctl.ui === 'radio' ? ' role="radio" aria-checked="' + on + '"' : ctl.ui === 'trigger' ? '' : ' aria-pressed="' + on + '"';
    return '<button type="button" class="sdk-btn' + (on ? ' active' : '') + (unsure(ctl) ? ' unsure' : '') + '" data-ctl="' + esc(ctl.id) + '" data-ui="' + ctl.ui + '"' + a +
      ' title="' + esc(ctl.name + (ctl.note ? ' — ' + ctl.note : '') + (ctl.src ? ' [' + ctl.src + ']' : '')) + '"><span class="sdk-bname">' + esc(ctl.name) + badge + '</span><small>' + esc(sub) + (ctl.ui === 'momentary' ? ' · hold' : '') + '</small></button>';
  }
  function renderButtons() {
    if (!mounted) return;
    var m = map(), html = '', secs = {};
    m.controls.forEach(function (c) { if (!BTN_UIS[c.ui]) return; (secs[c.sec] = secs[c.sec] || []).push(c); });
    var order = m.sections.map(function (s) { return s.id; });
    Object.keys(secs).forEach(function (s) { if (order.indexOf(s) < 0) order.push(s); });
    order.forEach(function (sid) {
      var list = secs[sid]; if (!list || !list.length) return;
      var groups = {}, inner = '';
      list.forEach(function (c) {
        if (c.ui === 'radio' && c.group) { if (!groups[c.group]) { groups[c.group] = []; inner += '%%' + c.group + '%%'; } groups[c.group].push(c); }
        else inner += btnHTML(c);
      });
      for (var g in groups) inner = inner.replace('%%' + g + '%%', '<div role="radiogroup" data-group="' + esc(g) + '" class="sdk-radios" aria-label="' + esc(sectionName(m, sid)) + '">' + groups[g].map(btnHTML).join('') + '</div>');
      html += '<section class="sdk-sec" data-sec="' + esc(sid) + '"><h3>' + esc(sectionName(m, sid)) + '</h3><div class="sdk-grid">' + inner + '</div></section>';
    });
    if (!html) html = '<div class="muted small">No buttons for this device yet.</div>';
    html += '<div class="row tight sdk-btnacts"><button type="button" class="btn sm" id="sdk-addctl">' + App.icon('plus', 14) + ' Add control</button><span class="muted small">Tap Learn in Map to take a number from the synth.</span></div>' +
      '<form id="sdk-addform" class="sdk-form" hidden autocomplete="off"><div class="row tight">' +
        '<label class="field">Name<input type="text" name="name" maxlength="24" required placeholder="Arp hold"></label>' +
        '<label class="field">Type<select name="ui"><option value="toggle">On / off</option><option value="momentary">Hold</option><option value="trigger">One shot</option><option value="knob">Knob</option></select></label>' +
        '<label class="field">Message<select name="kind"><option value="cc">CC</option><option value="pc">Program</option>' + (api.profile().sysex ? '<option value="sx">SysEx</option>' : '') + '</select></label>' +
        '<label class="field">Channel<select name="ch"><option value="part">This Part</option><option value="global">Global</option></select></label>' +
        '<label class="field" data-for="cc pc">Number<input type="number" name="num" min="0" max="127" inputmode="numeric" placeholder="learn later"></label>' +
        '<label class="field" data-for="sx" hidden>Address (hex)<input type="text" name="addr" class="mh-mono" placeholder="31 0p 18"></label>' +
        '<label class="field" data-for="sx" hidden>On / off (hex)<span class="row tight"><input type="text" name="on" class="mh-mono sdk-hex" value="01"><input type="text" name="off" class="mh-mono sdk-hex" value="00"></span></label>' +
        '<button type="submit" class="btn sm primary">Add</button><button type="button" class="btn sm" data-act="addcancel">Cancel</button></div></form>' +
      '<details class="tips" id="sdk-btips"><summary>Check on the synth</summary>' + m.notes.map(function (n) { return '<p>Check on the synth: ' + esc(n) + '</p>'; }).join('') +
        '<p>Nothing is sent when the deck opens, when a Part or device changes or when a sound is saved — only when you tap, drag or load.</p></details>';
    els.buttons.innerHTML = html;
    var f = q('#sdk-addform', els.buttons);
    f.addEventListener('submit', function (e) { e.preventDefault(); submitAddForm(f); });
  }
  function paintButtons() {
    if (!mounted) return;
    qa('.sdk-btn[data-ctl]', els.buttons).forEach(function (b) {
      var ctl = ctlById(b.dataset.ctl); if (!ctl) return;
      var st = getState(ctl), on = ctl.ui === 'radio' ? (st != null && st === ctl.val) : ctl.ui === 'toggle' ? st === 1 : ctl.ui === 'momentary' ? !!heldSet[ctl.id] : false;
      b.classList.toggle('active', on);
      if (ctl.ui === 'radio') b.setAttribute('aria-checked', String(on)); else if (ctl.ui !== 'trigger') b.setAttribute('aria-pressed', String(on));
    });
  }
  function onButtonsClick(e) {
    var t = e.target;
    if (t.closest('#sdk-addctl')) { var f = q('#sdk-addform', els.buttons); f.hidden = !f.hidden; editing.addform = !f.hidden; if (!f.hidden) try { f.querySelector('[name=name]').focus(); } catch (x) { } return; }
    if (t.closest('[data-act="addcancel"]')) { closeAddForm(); return; }
    var b = t.closest('.sdk-btn[data-ctl]'); if (!b) return;
    var ctl = ctlById(b.dataset.ctl); if (!ctl) return;
    if (unsure(ctl)) { toast('No number yet — set it in Map or tap Learn'); openMapRow(ctl.id); return; }
    if (ctl.ui === 'toggle') {
      var next = getState(ctl) === 1 ? 0 : 1;
      if (sendCtl(ctl, next ? 'on' : 'off')) { setState(ctl, next); paintButtons(); }
    } else if (ctl.ui === 'radio') {
      if (sendCtl(ctl, 'val')) { setState(ctl, typeof ctl.val === 'number' ? ctl.val : 0); paintButtons(); }
    } else if (ctl.ui === 'trigger') {
      if (sendCtl(ctl, 'val')) toast(ctl.name + ' sent on ' + api.partLabel() + ' ' + (chOf(ctl) + 1));
    }
  }
  function onButtonsChange(e) {
    var f = e.target.closest && e.target.closest('#sdk-addform'); if (!f) return;
    var kind = f.querySelector('[name=kind]').value;
    qa('[data-for]', f).forEach(function (l) { l.hidden = l.dataset['for'].split(' ').indexOf(kind) < 0; });
  }
  function closeAddForm() { var f = q('#sdk-addform', els.buttons); if (f) { f.hidden = true; f.reset(); } delete editing.addform; }
  function submitAddForm(f) {
    var g = function (n) { var x = f.querySelector('[name=' + n + ']'); return x ? x.value : ''; };
    var kind = g('kind'), spec = { id: 'x', name: g('name').trim(), kind: kind, ui: g('ui'), ch: g('ch') === 'global' ? 'global' : 'part', num: g('num') === '' ? null : clamp(num(g('num'), 0), 0, 127), def: 64 };
    if (!spec.name) return toast('Give it a name');
    if (kind === 'sx') spec.sx = { addr: g('addr').trim() || null, on: g('on').trim() || '01', off: g('off').trim() || '00', val: '{v}' };
    var id = addControl(spec); if (!id) return;
    closeAddForm();
    toast('Added ' + spec.name + (spec.num == null && kind !== 'sx' ? ' — Learn its number in Map' : ''));
  }
  // momentary: on while held, off on release — and always off on any loss of control
  function onMomentaryDown(e) {
    var b = e.target.closest && e.target.closest('.sdk-btn[data-ui="momentary"]'); if (!b) return;
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ }
    pressMomentary(b.dataset.ctl, b);
  }
  function onMomentaryUp(e) {
    var b = e.target.closest && e.target.closest('.sdk-btn[data-ui="momentary"]'); if (!b) return;
    releaseMomentary(b.dataset.ctl);
  }
  function pressMomentary(id, b) {
    if (heldSet[id]) return;
    var ctl = ctlById(id); if (!ctl) return;
    if (unsure(ctl)) { toast('No number yet — set it in Map or tap Learn'); return; }
    if (!sendCtl(ctl, 'on')) return;
    heldSet[id] = { ctl: ctl, el: b, part: chOf(ctl) };
    b.classList.add('active'); b.setAttribute('aria-pressed', 'true');
  }
  function releaseMomentary(id) {
    var h = heldSet[id]; if (!h) return;
    delete heldSet[id];
    var b = h.ctl, part = h.part, bytes = bytesFor(b, 'off', 0, part);
    if (bytes) tx(bytes.bytes, bytes.origin);
    if (h.el) { h.el.classList.remove('active'); h.el.setAttribute('aria-pressed', 'false'); }
  }
  function drainHeld(why) {
    var ids = Object.keys(heldSet); if (!ids.length) return;
    ids.forEach(releaseMomentary);
    if (why !== 'remount') paintButtons();
  }

  // ============================================================ MAP ====
  var CONF_TXT = { verified: '', documented: '·', unverified: '?', learned: '✓' };
  var CONF_TIP = { verified: 'checked', documented: 'from documentation, not checked on your synth', unverified: 'unverified — check the synth', learned: 'learned from your synth' };
  function chOpts(sel) {
    var h = '<option value="part"' + (sel === 'part' ? ' selected' : '') + '>' + api.partLabel() + '</option><option value="global"' + (sel === 'global' ? ' selected' : '') + '>Global</option>';
    for (var c = 0; c < 16; c++) h += '<option value="' + c + '"' + (sel === c ? ' selected' : '') + '>' + (c + 1) + '</option>';
    return h;
  }
  function mapRow(c) {
    var sx = c.kind === 'sx', isKnob = c.ui === 'knob', lrn = learning && learning.id === c.id;
    var numCell = sx ?
      '<input type="text" name="addr" class="mh-mono sdk-addr" value="' + esc(c.sx && c.sx.addr || '') + '" placeholder="aH aM aL" title="address (hex); p = Part, s = scene">' +
        (isKnob ? '<input type="text" name="val" class="mh-mono sdk-hex" value="' + esc(c.sx && c.sx.val || '{v}') + '" title="data ({v} = the knob value)">' :
          '<input type="text" name="on" class="mh-mono sdk-hex" value="' + esc(c.sx && c.sx.on || '01') + '" title="on (hex)"><input type="text" name="off" class="mh-mono sdk-hex" value="' + esc(c.sx && c.sx.off || '00') + '" title="off (hex)">') :
      '<input type="number" name="num" min="0" max="127" inputmode="numeric" value="' + (c.num == null ? '' : c.num) + '" placeholder="?" title="' + (c.kind === 'pc' ? 'program (0-127)' : 'controller number') + '">' +
        (c.ui === 'radio' ? '<input type="number" name="val" min="0" max="127" inputmode="numeric" value="' + (typeof c.val === 'number' ? c.val : 0) + '" title="value this member sends">' : '');
    var acts = '<button type="button" class="btn sm' + (lrn && learning.mode !== 'moves' ? ' active' : '') + '" data-learn="' + esc(c.id) + '">' + (lrn && learning.mode !== 'moves' ? 'Listening… play/turn it on the synth' : 'Learn') + '</button>' +
      (sx && !isKnob ? '<button type="button" class="btn sm' + (lrn && learning.mode === 'moves' ? ' active' : '') + '" data-learn2="' + esc(c.id) + '">' + (lrn && learning.mode === 'moves' ? 'Listening… move it twice' : 'Learn 2 moves') + '</button>' : '') +
      (c.edited ? '<button type="button" class="btn sm" data-mreset="' + esc(c.id) + '">Default</button>' : '') +
      (c.custom ? '<button type="button" class="btn sm danger" data-del="' + esc(c.id) + '" data-two="del-' + esc(c.id) + '">Delete</button>' : '');
    var kindOpts = ['cc', 'pc'].concat(api.profile().sysex ? ['sx'] : []).map(function (k) { return '<option value="' + k + '"' + (c.kind === k ? ' selected' : '') + '>' + ({ cc: 'CC', pc: 'Program', sx: 'SysEx' })[k] + '</option>'; }).join('');
    return '<tr data-ctl="' + esc(c.id) + '" data-sec="' + esc(c.sec) + '">' +
      '<td><input type="text" name="name" maxlength="24" value="' + esc(c.name) + '"><small class="muted">' + esc(sectionName(map(), c.sec)) + ' · ' + ({ knob: 'knob', toggle: 'on/off', momentary: 'hold', radio: 'pick one', trigger: 'one shot' })[c.ui] + '</small></td>' +
      '<td><select name="kind">' + kindOpts + '</select></td><td><select name="ch">' + chOpts(c.ch) + '</select></td>' +
      '<td class="sdk-numcell">' + numCell + '</td>' +
      '<td>' + (isKnob ? '<input type="number" name="def" min="0" max="127" inputmode="numeric" value="' + c.def + '" title="start value (double-tap a knob)">' : '<span class="muted small">—</span>') + '</td>' +
      '<td><span class="sdk-conf" data-conf="' + c.conf + '" title="' + esc(CONF_TIP[c.conf] + (c.src ? ': ' + c.src : '')) + '">' + (c.conf === 'learned' ? App.icon('check', 12) : CONF_TXT[c.conf]) + '</span></td>' +
      '<td class="sdk-acts">' + acts + '</td></tr>';
  }
  function renderMap() {
    if (!mounted) return;
    var m = map(), ports = api.midi() && api.midi().ready ? api.midi().inputs : [];
    var gch = ''; for (var c = 0; c < 16; c++) gch += '<option value="' + c + '"' + (c === deck.globalCh ? ' selected' : '') + '>' + (c + 1) + '</option>';
    var lp = '<option value="all">All inputs</option>' + ports.map(function (p) { return '<option value="' + esc(String(p.id)) + '"' + (String(p.id) === deck.learnPort ? ' selected' : '') + '>' + esc(p.name || p.id) + '</option>'; }).join('');
    els.map.innerHTML =
      '<div class="row tight sdk-maphead"><span id="sdk-mapdev"><b>Map:</b> ' + esc(m.name) + '</span>' +
        '<label class="field">Global channel<select id="sdk-gch" title="channel for Scenes and other global controls">' + gch + '</select></label>' +
        '<label class="field">Learn from<select id="sdk-learnport">' + lp + '</select></label>' +
        '<button type="button" class="btn sm" id="sdk-addctl2">' + App.icon('plus', 14) + ' Add control</button>' +
        '<button type="button" class="btn sm danger" id="sdk-mapreset" data-two="mapreset">Reset map</button></div>' +
      '<div class="sdk-tscroll"><table class="mh-table sdk-mtable" id="sdk-mtable"><thead><tr><th>Control</th><th>Message</th><th>Channel</th><th>Number / address</th><th>Start</th><th title="verified · from documentation ? unverified ✓ learned">?</th><th></th></tr></thead>' +
        '<tbody>' + m.controls.map(mapRow).join('') + '</tbody></table></div>' +
      '<h3>Knob pages</h3><div id="sdk-mpages">' + m.pages.map(pageRow).join('') + '</div>' +
      '<p class="muted small">? = from documentation, not checked on your synth — tap Learn and move the control on the synth to make it yours. The deck is stricter than the Hub’s own knobs: it never sends to a LUMI-named output, even when Synth out is “Same as key lights”.</p>';
  }
  function pageRow(p) {
    var m = map(), opts = m.controls.filter(function (c) { return c.ui === 'knob'; });
    var sels = p.ctl.map(function (id, i) { return '<select data-slot="' + i + '" title="slot ' + (i + 1) + '"><option value="">—</option>' + opts.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>'; }).join('');
    return '<div class="sdk-mpage row tight" data-page="' + esc(p.id) + '"><input type="text" name="pname" maxlength="24" value="' + esc(p.name) + '"><div class="sdk-mslots">' + sels + '</div>' +
      (p.custom ? '<button type="button" class="btn sm danger" data-delpage="' + esc(p.id) + '" data-two="delpage-' + esc(p.id) + '">Delete</button>' : '') + '</div>';
  }
  function onMapClick(e) {
    var t = e.target, b;
    if ((b = t.closest('[data-learn]'))) { learn(b.dataset.learn, learning && learning.id === b.dataset.learn && learning.mode !== 'moves' ? false : true, 'num'); return; }
    if ((b = t.closest('[data-learn2]'))) { learn(b.dataset.learn2, learning && learning.id === b.dataset.learn2 && learning.mode === 'moves' ? false : true, 'moves'); return; }
    if ((b = t.closest('[data-mreset]'))) { resetControl(b.dataset.mreset); return; }
    if ((b = t.closest('[data-del]'))) { if (confirmTwo(b, b.dataset.two, 'Really delete?')) deleteControl(b.dataset.del); return; }
    if ((b = t.closest('[data-delpage]'))) { if (confirmTwo(b, b.dataset.two, 'Really delete?')) deletePage(b.dataset.delpage); return; }
    if (t.closest('#sdk-mapreset')) { if (confirmTwo(t.closest('#sdk-mapreset'), 'mapreset', 'Really reset?')) resetMap(); return; }
    if (t.closest('#sdk-addctl2')) { tab('buttons'); var f = q('#sdk-addform', els.buttons); if (f) { f.hidden = false; editing.addform = true; try { f.querySelector('[name=name]').focus(); } catch (x) { } } return; }
  }
  function onMapChange(e) {
    var t = e.target;
    if (t.id === 'sdk-gch') { deck.globalCh = clamp(num(t.value, 0), 0, 15); persist('deck'); return; }
    if (t.id === 'sdk-learnport') { deck.learnPort = t.value || 'all'; persist('deck'); return; }
    var pr = t.closest('.sdk-mpage');
    if (pr) {
      if (t.name === 'pname') setPage(pr.dataset.page, { name: t.value });
      else if (t.dataset.slot != null) { var ctl = qa('select[data-slot]', pr).map(function (s) { return s.value || null; }); setPage(pr.dataset.page, { ctl: ctl }); }
      return;
    }
    var tr = t.closest('tr[data-ctl]'); if (!tr) return;
    var id = tr.dataset.ctl, c = ctlById(id); if (!c) return;
    var patch = {}, n = t.name, v = t.value;
    if (n === 'name') patch.name = String(v).trim().slice(0, 24) || c.name;
    else if (n === 'kind') { patch.kind = v; if (v === 'sx' && !c.sx) patch.sx = { addr: null, on: '01', off: '00', val: '{v}' }; }
    else if (n === 'ch') patch.ch = v === 'part' || v === 'global' ? v : clamp(num(v, 0), 0, 15);
    else if (n === 'num') patch.num = v === '' ? null : clamp(num(v, 0), 0, 127);
    else if (n === 'def') patch.def = clamp(num(v, 64), 0, 127);
    else if (n === 'val' && c.kind !== 'sx') patch.val = clamp(num(v, 0), 0, 127);
    else if (n === 'addr' || n === 'on' || n === 'off' || n === 'val') { patch.sx = {}; patch.sx[n] = n === 'addr' ? (String(v).trim() || null) : String(v).trim(); if (!/^[0-9a-fA-F{}vps\s]*$/.test(String(v))) return toast('Hex only (p = Part, s = scene, {v} = value)'); }
    else return;
    if ('num' in patch || 'sx' in patch || 'kind' in patch) patch.conf = 'unverified'; // typed by hand: not checked on the synth
    setControl(id, patch);
  }
  function openMapRow(id) {
    tab('map');
    var tr = q('tr[data-ctl="' + id + '"]', els.map); if (!tr) return;
    var inp = tr.querySelector('[name=num],[name=addr]');
    if (tr.scrollIntoView) tr.scrollIntoView({ block: 'center' });
    if (inp) try { inp.focus(); } catch (e) { /* no focus */ }
  }
  // two-step destructive buttons: the first tap arms it for 4 s
  function confirmTwo(b, key, label) {
    if (twoStep[key] && twoStep[key].until > Date.now()) { clearTimeout(twoStep[key].t); delete twoStep[key]; return true; }
    var orig = b.innerHTML;
    b.innerHTML = label; b.classList.add('armed');
    twoStep[key] = { until: Date.now() + 4000, t: setTimeout(function () { delete twoStep[key]; if (b.isConnected) { b.innerHTML = orig; b.classList.remove('armed'); } }, 4000) };
    return false;
  }
  function paintLearnPorts() { var s = q('#sdk-learnport', els.map); if (s && !learning) renderMap(); }

  // ============================================================ MIDI LEARN ====
  function learn(id, on, mode) {
    var same = !!(learning && learning.id === id && ((learning.mode === 'moves') === (mode === 'moves')));
    if (on === false || same) { learnOff(); return false; }
    var ctl = ctlById(id); if (!ctl) return false;
    learnOff(true);
    if (ctl.kind === 'sx' && !api.profile().sysex) { toast('This device profile has no SysEx format to learn from'); return false; }
    learning = { id: id, mode: ctl.kind === 'sx' ? (mode === 'moves' ? 'moves' : 'addr') : 'num', frames: [], t: setTimeout(function () { toast('Learn timed out'); learnOff(); }, 20000) };
    if (!(api.midi() && api.midi().ready)) toast('Connect MIDI and pick an In port first');
    paintLearn();
    return true;
  }
  function learnOff() {
    if (!learning) return;
    clearTimeout(learning.t); learning = null;
    paintLearn();
  }
  // the Learn buttons repaint in place (the row keeps its focus and identity)
  function paintLearn() {
    if (!mounted) return;
    qa('[data-learn],[data-learn2]', els.map).forEach(function (b) {
      var moves = b.dataset.learn2 != null, id = moves ? b.dataset.learn2 : b.dataset.learn;
      var on = !!(learning && learning.id === id && ((learning.mode === 'moves') === moves));
      b.classList.toggle('active', on);
      b.textContent = on ? (moves ? 'Listening… move it twice' : 'Listening… play/turn it on the synth') : (moves ? 'Learn 2 moves' : 'Learn');
    });
  }
  // Yamaha F0 43 1n 7F 1C mm… / Roland DT1 → { addr:[...], data:[...] }
  function parseParam(b) {
    var p = api.profile(), sx = p.sysex; if (!sx || b[0] !== 0xF0 || b[b.length - 1] !== 0xF7) return null;
    var ml = sx.model.length, al = sx.addrLen || 3;
    if (b[1] === 0x43) {
      if ((b[2] & 0xF0) !== 0x10 || b[3] !== 0x7F || b[4] !== 0x1C || b.length < 5 + ml + al + 2) return null;
      return { addr: b.slice(5 + ml, 5 + ml + al), data: b.slice(5 + ml + al, b.length - 1) };
    }
    if (b[1] === 0x41) {
      var cmd = 3 + ml; if (b[cmd] !== 0x12 || b.length < cmd + 1 + al + 3) return null;
      return { addr: b.slice(cmd + 1, cmd + 1 + al), data: b.slice(cmd + 1 + al, b.length - 2) };
    }
    return null;
  }
  function onLearnFrame(b, portId) {
    if (!learning) return;
    if (deck.learnPort !== 'all' && String(portId) !== String(deck.learnPort)) return;
    var ctl = ctlById(learning.id); if (!ctl) { learnOff(); return; }
    if (learning.mode === 'num') {
      var d = api.decode(b);
      if (d.kind !== 'cc' && d.kind !== 'pc') return;
      var patch = { num: d.num, conf: 'learned' };
      if (d.kind !== ctl.kind) patch.kind = d.kind;
      if (typeof ctl.ch === 'number') patch.ch = d.ch;
      learnOff(true); setControl(ctl.id, patch);
      toast('Learned: ' + (d.kind === 'cc' ? 'CC ' : 'Program ') + d.num + ' for ' + ctl.name);
      return;
    }
    var f = parseParam(b); if (!f) return;
    if (learning.mode === 'addr') {
      var id = learning.id; learnOff(true);
      setControl(id, { sx: { addr: hex(f.addr) }, conf: 'learned' });
      toast('Learned: address ' + hex(f.addr) + ' for ' + ctl.name);
      return;
    }
    // 'moves': two frames, same address, ONE data byte differs → on (first) / off
    if (!learning.frames.length) { learning.frames.push(f); toast('Got ' + hex(f.addr) + ' — now move it the other way'); return; }
    var a = learning.frames[0];
    if (hex(a.addr) !== hex(f.addr)) { learning.frames = [f]; toast('Different address (' + hex(f.addr) + ') — move the same control again'); return; }
    var diff = -1;
    for (var i = 0; i < Math.max(a.data.length, f.data.length); i++) if (a.data[i] !== f.data[i]) { if (diff >= 0) { diff = -2; break; } diff = i; }
    if (diff < 0) { toast(diff === -1 ? 'Same value — move it the other way' : 'More than one byte changed — try again'); learning.frames = [f]; return; }
    var cid = learning.id; learnOff(true);
    setControl(cid, { sx: { addr: hex(f.addr), on: hex([a.data[diff]]), off: hex([f.data[diff]]) }, conf: 'learned' });
    toast('Learned: ' + hex(f.addr) + ' on ' + hex([a.data[diff]]) + ' / off ' + hex([f.data[diff]]) + ' for ' + ctl.name);
  }

  // ============================================================ INCOMING ====
  function onRaw(d) {
    var b = d && d.bytes; if (!b || !b.length || !active() || !mounted) return;
    var st = b[0] & 0xF0, c = b[0] & 15;
    if (learning) onLearnFrame(b, d.portId);
    if (readJob && b[0] === 0xF0) onReadFrame(b);
    if (st === 0xB0 && b.length > 2) {
      if (b[1] === 0 || b[1] === 32) { var lb = vals.lastBank || { msb: 0, lsb: 0, pc: 1, ch: c, t: 0 }; lb[b[1] === 0 ? 'msb' : 'lsb'] = b[2]; lb.ch = c; lb.t = Date.now(); vals.lastBank = lb; persist('deckvals'); if (c === api.ch()) paintNowSoon(); }
      else if (c === api.ch() && !api.allKnobs().some(function (k) { return k.cc === b[1]; })) {
        // a page knob the Hub card does not show: mirror it (the Hub mirrors its own)
        var hit = false;
        map().controls.forEach(function (ctl) { if (ctl.ui === 'knob' && ctl.kind === 'cc' && ctl.num === b[1] && chOf(ctl) === c) hit = true; });
        if (hit) { api.setKv(b[1], b[2]); qa('.mh-knob[data-ctl][data-kind="cc"][data-cc="' + b[1] + '"]', els.pages).forEach(function (k) { api.paintKnobEl(k, b[2]); }); }
      }
    } else if (st === 0xC0 && b.length > 1) {
      var lb2 = vals.lastBank || { msb: hubProg().msb, lsb: hubProg().lsb, pc: 1, ch: c, t: 0 };
      lb2.pc = b[1] + 1; lb2.ch = c; lb2.t = Date.now(); vals.lastBank = lb2; persist('deckvals');
      if (c === api.ch()) paintNowSoon();
    }
  }
  var nowT = 0;
  function paintNowSoon() { if (nowT) return; nowT = setTimeout(function () { nowT = 0; paintNow(); renderBankActive(); }, 0); }
  // what left the app: the Hub's own Prev/Next/program moves the Now bar; the
  // MIDI service's cleanup (sustain off on a route change) is mirrored into
  // the switch states so the screen never claims a pedal the synth let go of
  function onOut(d) {
    var b = d && d.bytes; if (!b || !b.length || !mounted || d.kind === 'led') return;
    var st = b[0] & 0xF0, c = b[0] & 15;
    if (d.kind === 'music-cleanup') {
      if (st !== 0xB0 || b.length < 3) return;
      var changed = false;
      map().controls.forEach(function (ctl) {
        if (ctl.ui !== 'toggle' || ctl.kind !== 'cc' || ctl.num !== b[1] || ctl.off !== b[2]) return;
        var key = typeof ctl.ch === 'number' ? String(ctl.ch) : String(c);
        if (ctl.ch === 'global' ? chOf(ctl) !== c : typeof ctl.ch === 'number' ? ctl.ch !== c : false) return;
        if (getState(ctl, key) === 1) { setState(ctl, 0, key); changed = true; }
      });
      if (changed) paintButtons();
      return;
    }
    if ((st === 0xC0 && b.length > 1) || (st === 0xB0 && b.length > 2 && (b[1] === 0 || b[1] === 32))) paintNowSoon();
  }

  // ============================================================ SOUNDS ====
  var searchQ = '', filt = 'all', sortBy = 'recent';
  function findPreset(id) { for (var i = 0; i < lib.items.length; i++) if (lib.items[i].id === id) return lib.items[i]; return null; }
  function renderSounds() {
    if (!mounted) return;
    var m = map();
    els.sounds.innerHTML =
      '<div class="row tight sdk-shead"><input type="search" id="sdk-search" placeholder="Find a sound" aria-label="Find a sound" value="' + esc(searchQ) + '">' +
        '<div class="seg" id="sdk-filt" role="group" aria-label="Show"><button type="button" data-f="all"' + (filt === 'all' ? ' class="active"' : '') + '>All</button><button type="button" data-f="star"' + (filt === 'star' ? ' class="active"' : '') + '>Starred</button><button type="button" data-f="part"' + (filt === 'part' ? ' class="active"' : '') + '>This ' + api.partLabel() + '</button></div>' +
        '<select id="sdk-sort" aria-label="Sort"><option value="recent"' + (sortBy === 'recent' ? ' selected' : '') + '>Recent first</option><option value="name"' + (sortBy === 'name' ? ' selected' : '') + '>By name</option><option value="bank"' + (sortBy === 'bank' ? ' selected' : '') + '>By bank</option></select></div>' +
      '<div id="sdk-tiles" class="sdk-tiles"></div>' +
      '<div id="sdk-empty" class="muted" hidden>No sounds yet — set a program and the knobs, then Save sound.</div>' +
      '<div id="sdk-bytes" class="mh-mono small"></div>' +
      '<details class="tips" id="sdk-bankwrap"><summary>Browse the synth’s banks</summary>' +
        '<div class="row tight sdk-bankhead"><label class="field">Bank<select id="sdk-bank"></select></label>' +
          (m.bankModes ? '<div class="seg" id="sdk-bankmode" role="group" aria-label="Bank kind"><button type="button" data-mode="part"' + (deck.bankMode !== 'whole' ? ' class="active" aria-pressed="true"' : ' aria-pressed="false"') + ' title="MSB 63: one Performance’s Part 1 into this Part">Into this Part</button><button type="button" data-mode="whole"' + (deck.bankMode === 'whole' ? ' class="active" aria-pressed="true"' : ' aria-pressed="false"') + ' title="MSB 64: the whole Performance, all Parts (send on channel 1)">Whole performance</button></div>' : '') +
          '<button type="button" class="btn sm" id="sdk-readname"' + (m.bulk ? '' : ' hidden') + ' title="Asks the synth for the current Performance and takes its name">Read name from synth</button></div>' +
        '<div id="sdk-addbank" class="row tight sdk-form" hidden><label class="field">Name<input type="text" id="sdk-bkname" maxlength="24" placeholder="My bank"></label><label class="field">MSB<input type="number" id="sdk-bkmsb" min="0" max="127" value="0"></label><label class="field">LSB<input type="number" id="sdk-bklsb" min="0" max="127" value="0"></label><button type="button" class="btn sm primary" id="sdk-bkadd">Add bank</button><button type="button" class="btn sm" id="sdk-bkcancel">Cancel</button></div>' +
        '<div id="sdk-bankgrid" class="sdk-bankgrid" role="group" aria-label="Programs"></div>' +
        '<div id="sdk-nameform" class="row tight"><span class="muted small" id="sdk-namefor"></span><input type="text" id="sdk-namein" maxlength="48" placeholder="name this program">' +
          '<button type="button" class="btn sm" id="sdk-nameadd" title="Remember this name for the program the synth is on">Name it</button><button type="button" class="btn sm" id="sdk-namelib" title="A program-only sound in the library">Add to library</button></div>' +
        '<div class="muted small">Tap a program to send it (bank select + program change, nothing else). Names come from your own list, then the factory list.</div>' +
      '</details>' +
      '<div class="row tight sdk-sfoot"><button type="button" class="btn sm" id="sdk-pexport">Export</button><button type="button" class="btn sm" id="sdk-pimport">Import</button><input type="file" id="sdk-pimportfile" accept="application/json,.json" hidden>' +
        '<label class="field">Wait after program (ms)<input type="number" id="sdk-settle" min="0" max="2000" step="10" value="' + deck.settleMs + '"></label>' +
        '<label class="field">Gap (ms)<input type="number" id="sdk-pace" min="0" max="200" value="' + deck.pace + '"></label>' +
        '<button type="button" class="btn sm danger" id="sdk-pclear" data-two="pclear">Delete all sounds</button></div>' +
      '<textarea id="sdk-ptext" hidden aria-label="Sound data as text"></textarea>';
    renderTiles(); renderBanks();
  }
  function presetSub(it) {
    var n = 0; for (var k in it.parts) { n += Object.keys(it.parts[k].cc).length + Object.keys(it.parts[k].ctl).length; }
    var parts = Object.keys(it.parts);
    return (it.prog ? it.prog.msb + '/' + it.prog.lsb + ' · ' + it.prog.pc : 'no program') + ' · ' +
      (parts.length === 0 ? 'program only' : parts.length === 1 ? api.partLabel() + ' ' + (+parts[0] + 1) : parts.length + ' ' + api.partLabel() + 's') + (n ? ' · ' + n + ' values' : '');
  }
  function visibleItems() {
    var qs = searchQ.trim().toLowerCase(), part = api.ch(), pk = profileKey();
    var list = lib.items.filter(function (it) {
      if (filt === 'star' && !it.star) return false;
      if (filt === 'part' && !(it.parts[String(part)] || (it.prog && it.prog.ch === part))) return false;
      if (qs && (it.name + ' ' + it.tags.join(' ') + ' ' + (it.prog ? it.prog.msb + '/' + it.prog.lsb + ' ' + it.prog.pc : '')).toLowerCase().indexOf(qs) < 0) return false;
      return true;
    });
    list.sort(function (a, b) {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'bank') { var ka = a.prog ? a.prog.msb * 1e6 + a.prog.lsb * 1e3 + a.prog.pc : 1e12, kb = b.prog ? b.prog.msb * 1e6 + b.prog.lsb * 1e3 + b.prog.pc : 1e12; return ka - kb || a.name.localeCompare(b.name); }
      return Math.max(b.used || 0, b.updated || 0) - Math.max(a.used || 0, a.updated || 0);
    });
    list.sort(function (a, b) { return (a.dev === pk ? 0 : 1) - (b.dev === pk ? 0 : 1); });
    return list;
  }
  function tileHTML(it) {
    var open = openRow === it.id;
    return '<div class="sdk-titem' + (open ? ' open' : '') + '" data-item="' + esc(it.id) + '">' +
      '<button type="button" class="sdk-tile' + (it.star ? ' star' : '') + (lastLoaded === it.id ? ' active' : '') + '" data-preset="' + esc(it.id) + '" aria-expanded="' + open + '">' +
        '<b class="sdk-tname">' + (it.star ? '<span class="sdk-tstar">' + App.icon('star', 12) + '</span>' : '') + esc(it.name) + '</b><span class="sdk-tsub">' + esc(presetSub(it)) + '</span><span class="sdk-ttags">' + esc(it.tags.join(', ')) + '</span></button>' +
      '<button type="button" class="sdk-tmore" data-more="' + esc(it.id) + '" aria-label="More for ' + esc(it.name) + '">⋯</button>' +
      (open ? '<div class="sdk-trow" data-row="' + esc(it.id) + '"><button type="button" class="btn sm primary" data-act="load">' + App.icon('play', 12) + ' Load</button><button type="button" class="btn sm" data-act="edit">Edit</button>' +
        '<button type="button" class="btn sm" data-act="star" aria-pressed="' + !!it.star + '">' + App.icon('star', 12) + ' ' + (it.star ? 'Unstar' : 'Star') + '</button><button type="button" class="btn sm" data-act="dup">Duplicate</button>' +
        '<button type="button" class="btn sm danger" data-act="del" data-two="del-' + esc(it.id) + '">Delete</button></div>' : '') +
      '</div>';
  }
  function renderTiles() {
    var box = q('#sdk-tiles', els.sounds), empty = q('#sdk-empty', els.sounds); if (!box) return;
    var list = visibleItems();
    box.innerHTML = list.map(tileHTML).join('');
    empty.hidden = !!lib.items.length;
    if (lib.items.length && !list.length) box.innerHTML = '<div class="muted small">Nothing matches.</div>';
  }
  function revealTile(id) {
    openRow = id; renderTiles(); paintBytes(id);
    var t = q('.sdk-tile[data-preset="' + id + '"]', els.sounds);
    if (t && t.scrollIntoView) t.scrollIntoView({ block: 'center' });
  }
  function paintBytes(id) {
    var box = q('#sdk-bytes', els.sounds); if (!box) return;
    if (!id) id = openRow || lastLoaded;
    var it = id && findPreset(id); if (!it) { box.textContent = ''; return; }
    var plan = recallPlan(id), prog = plan.filter(function (p) { return p.step === 'prog'; }), rest = plan.length - prog.length;
    var txt = 'Load sends: ' + (prog.length ? prog.map(function (p) { return hex(p.bytes); }).join(' · ') : '') +
      (rest ? (prog.length ? ' · then ' + rest + ' messages after ' + deck.settleMs + ' ms' : rest + ' messages now') : (prog.length ? '' : 'nothing'));
    if (plan.truncated) txt += ' (truncated at ' + PLAN_CAP + ')';
    box.textContent = txt;
  }
  function onSoundsClick(e) {
    var t = e.target, b;
    if ((b = t.closest('#sdk-filt [data-f]'))) { filt = b.dataset.f; qa('button', b.parentNode).forEach(function (x) { x.classList.toggle('active', x === b); }); renderTiles(); return; }
    if ((b = t.closest('.sdk-tmore'))) { openRow = b.dataset.more; renderTiles(); paintBytes(openRow); return; }
    if ((b = t.closest('.sdk-tile'))) { var id = b.dataset.preset; openRow = openRow === id ? null : id; renderTiles(); paintBytes(id); return; }
    if ((b = t.closest('.sdk-trow [data-act]'))) {
      var rid = b.closest('.sdk-trow').dataset.row, it = findPreset(rid); if (!it) return;
      var act = b.dataset.act;
      if (act === 'load') load(rid);
      else if (act === 'edit') openSaveForm(rid);
      else if (act === 'star') { it.star = !it.star; it.updated = Date.now(); persist('decklib'); renderTiles(); paintNow(); }
      else if (act === 'dup') { if (lib.items.length >= LIB_CAP) return toast('200 sounds already — delete one'); var c = clone(it); c.id = uid('p_'); c.name = (it.name + ' copy').slice(0, 48); c.star = false; c.created = c.updated = Date.now(); c.used = 0; lib.items.push(c); persist('decklib'); openRow = c.id; renderTiles(); }
      else if (act === 'del') { if (!confirmTwo(b, b.dataset.two, 'Really delete?')) return; lib.items = lib.items.filter(function (x) { return x.id !== rid; }); if (lastLoaded === rid) lastLoaded = null; openRow = null; persist('decklib'); renderTiles(); paintNow(); paintBytes(null); toast('Deleted ' + it.name); }
      return;
    }
    if ((b = t.closest('#sdk-bankmode [data-mode]'))) { deck.bankMode = b.dataset.mode === 'whole' ? 'whole' : 'part'; persist('deck'); bankSel = null; renderBanks(); return; }
    if ((b = t.closest('.sdk-pc'))) { pickProgram(+b.dataset.pc); return; }
    if (t.closest('#sdk-readname')) { readName(); return; }
    if (t.closest('#sdk-nameadd')) { nameIt(); return; }
    if (t.closest('#sdk-namelib')) { addProgramToLib(); return; }
    if (t.closest('#sdk-bkadd')) { addBank(); return; }
    if (t.closest('#sdk-bkcancel')) { closeAddBank(); return; }
    if (t.closest('#sdk-pexport')) { doExport(); return; }
    if (t.closest('#sdk-pimport')) { doImportClick(); return; }
    if (t.closest('#sdk-pclear')) { if (confirmTwo(t.closest('#sdk-pclear'), 'pclear', 'Really delete all?')) { lib.items = []; lastLoaded = null; openRow = null; persist('decklib'); renderTiles(); paintNow(); paintBytes(null); toast('Library emptied'); } return; }
  }
  function onSoundsInput(e) {
    if (e.target.id === 'sdk-search') { searchQ = e.target.value; renderTiles(); }
  }
  function onSoundsChange(e) {
    var t = e.target;
    if (t.id === 'sdk-sort') { sortBy = t.value; renderTiles(); }
    else if (t.id === 'sdk-bank') { if (t.value === '__add') { openAddBank(); } else { bankSel = t.value; renderBankGrid(); } }
    else if (t.id === 'sdk-settle') { deck.settleMs = clamp(num(t.value, 250), 0, 2000); t.value = deck.settleMs; persist('deck'); paintBytes(null); }
    else if (t.id === 'sdk-pace') { deck.pace = clamp(num(t.value, 2), 0, 200); t.value = deck.pace; persist('deck'); }
    else if (t.id === 'sdk-pimportfile') { var f = t.files && t.files[0]; if (!f) return; readFileText(f, function (txt) { importText(txt); t.value = ''; }); }
  }
  function readFileText(f, cb) {
    if (f.text) { f.text().then(cb, function () { toast('Could not read the file'); }); return; }
    var r = new FileReader(); r.onload = function () { cb(String(r.result)); }; r.onerror = function () { toast('Could not read the file'); }; r.readAsText(f);
  }

  // ---- bank browser ----
  function bankList() {
    var m = map(), msb = m.bankModes ? (deck.bankMode === 'whole' ? m.bankModes.whole : m.bankModes.part) : null;
    return m.banks.map(function (b) { return { msb: msb == null || b.custom ? b.msb : msb, lsb: b.lsb, name: b.name, custom: !!b.custom }; });
  }
  function renderBanks() {
    var sel = q('#sdk-bank', els.sounds); if (!sel) return;
    var list = bankList(), p = hubProg(), cur = p.msb + '/' + p.lsb;
    if (!bankSel || !list.some(function (b) { return b.msb + '/' + b.lsb === bankSel; })) bankSel = list.some(function (b) { return b.msb + '/' + b.lsb === cur; }) ? cur : (list.length ? list[0].msb + '/' + list[0].lsb : null);
    sel.innerHTML = list.map(function (b) { var v = b.msb + '/' + b.lsb; return '<option value="' + v + '" title="Bank ' + v + '"' + (v === bankSel ? ' selected' : '') + '>' + esc(b.name) + '</option>'; }).join('') + '<option value="__add">Add bank…</option>';
    renderBankGrid();
  }
  function renderBankGrid() {
    var grid = q('#sdk-bankgrid', els.sounds); if (!grid) return;
    if (!bankSel) { grid.innerHTML = '<div class="muted small">No banks — add one.</div>'; return; }
    var parts = bankSel.split('/'), msb = +parts[0], lsb = +parts[1], look = names_(), p = hubProg(), html = '';
    for (var i = 0; i < 128; i++) {
      var n = look(msb, lsb, i + 1), act = p.msb === msb && p.lsb === lsb && p.pc === i + 1;
      html += '<button type="button" class="sdk-pc' + (act ? ' active' : '') + (n ? ' named' : '') + '" data-pc="' + i + '" title="Bank ' + msb + '/' + lsb + ' · program ' + (i + 1) + '"><b>' + (i + 1) + '</b><span>' + esc(n || 'Program ' + (i + 1)) + '</span></button>';
    }
    grid.innerHTML = html;
    if (factoryState === '' && map().nameFile) loadFactory();
    paintNameFor();
  }
  function renderBankActive() {
    var p = hubProg();
    qa('.sdk-pc', els.sounds).forEach(function (b) { b.classList.toggle('active', bankSel === p.msb + '/' + p.lsb && +b.dataset.pc === p.pc - 1); });
    paintNameFor();
  }
  function paintNameFor() { var s = q('#sdk-namefor', els.sounds); if (!s) return; var p = hubProg(); s.textContent = 'Bank ' + p.msb + '/' + p.lsb + ' · Program ' + p.pc + ':'; }
  function pickProgram(pc0) {
    if (!bankSel) return;
    var parts = bankSel.split('/'), msb = +parts[0], lsb = +parts[1];
    if (!txCheck([0xC0])) return;
    api.sendProgram(pc0 + 1, msb, lsb); // bank select + program change on the selected Part, nothing else
    paintNow(); renderBankActive();
  }
  function nameIt() {
    var inp = q('#sdk-namein', els.sounds), v = (inp.value || '').trim(); if (!v) return toast('Type a name first');
    var p = hubProg(), key = p.msb + '/' + p.lsb;
    names[key] = names[key] || {}; names[key][String(p.pc - 1)] = v.slice(0, 48);
    persist('names'); inp.value = '';
    paintNow(); renderBankGrid(); renderTiles();
    toast('Named ' + key + ' · ' + p.pc + ': ' + v);
  }
  function addProgramToLib() {
    if (lib.items.length >= LIB_CAP) return toast('200 sounds already — delete one');
    var inp = q('#sdk-namein', els.sounds), v = (inp.value || '').trim(), p = hubProg();
    var it = { id: uid('p_'), name: (v || progName(p.msb, p.lsb, p.pc)).slice(0, 48), star: false, tags: [], dev: profileKey(), prog: { msb: p.msb, lsb: p.lsb, pc: p.pc, ch: null }, parts: {}, created: Date.now(), updated: Date.now(), used: 0 };
    lib.items.push(it); persist('decklib'); inp.value = '';
    openRow = it.id; renderTiles(); paintNow(); paintBytes(it.id);
    toast('Added ' + it.name + ' (program only)');
  }
  function openAddBank() { var f = q('#sdk-addbank', els.sounds); if (f) { f.hidden = false; editing.addbank = true; try { q('#sdk-bkname', f).focus(); } catch (e) { } } }
  function closeAddBank() { var f = q('#sdk-addbank', els.sounds); if (f) f.hidden = true; delete editing.addbank; var sel = q('#sdk-bank', els.sounds); if (sel && bankSel) sel.value = bankSel; }
  function addBank() {
    var f = q('#sdk-addbank', els.sounds), name = (q('#sdk-bkname', f).value || '').trim(), msb = clamp(num(q('#sdk-bkmsb', f).value, 0), 0, 127), lsb = clamp(num(q('#sdk-bklsb', f).value, 0), 0, 127);
    var ov = ovFor(profileKey(), true);
    ov.banks.push({ msb: msb, lsb: lsb, name: name || ('Bank ' + msb + '/' + lsb) });
    invalidate(); persist('deck'); bankSel = msb + '/' + lsb; closeAddBank(); renderBanks();
  }
  // READ NAME FROM SYNTH: bulk request, then the Performance-common block
  function readName() {
    var m = map(); if (!m.bulk) return toast('Not for this device profile');
    var req; try { req = api.parseHex(m.bulk.request); } catch (e) { return toast('Bad request bytes in the map'); }
    readOff();
    if (!tx(req, 'raw')) return;
    var p = hubProg();
    readJob = { msb: p.msb, lsb: p.lsb, pc: p.pc, addr: hex(api.parseHex(m.bulk.nameAddr)), off: m.bulk.nameOffset, len: m.bulk.nameLen,
      t: setTimeout(function () { readJob = null; toast('No name came back — is the synth’s MIDI In/Out set to USB?'); }, 3000) };
    toast('Asking the synth…');
  }
  function readOff() { if (readJob) { clearTimeout(readJob.t); readJob = null; } }
  function onReadFrame(b) {
    // F0 43 0n 7F 1C bb bb mm aH aM aL dd… F7 (Yamaha bulk dump block)
    if (b[1] !== 0x43 || (b[2] & 0xF0) !== 0x00 || b[3] !== 0x7F || b[4] !== 0x1C) return;
    var sx = api.profile().sysex, ml = sx ? sx.model.length : 1, al = sx ? (sx.addrLen || 3) : 3, a0 = 7 + ml;
    if (b.length < a0 + al + 1) return;
    var addr = hex(b.slice(a0, a0 + al));
    if (addr === hex([0x30, 0x50, 0x00]) && b.length >= a0 + al + 128) { // the eight Assign knob display names (checked on a MODX8+ dump 2026-10-24: "Assigned" when blank)
      var arr = [];
      for (var j = 0; j < 8; j++) { var s2 = ''; for (var k2 = 0; k2 < 16; k2++) { var c2 = b[a0 + al + j * 16 + k2]; s2 += (c2 >= 32 && c2 < 127) ? String.fromCharCode(c2) : ' '; } s2 = s2.replace(/\s+$/, '').replace(/^\s+/, ''); arr.push(/^assigned$/i.test(s2) ? '' : s2.slice(0, 16)); }
      var an = App.store.get('midihub.assignnames', null) || {};
      an[readJob.msb + '/' + readJob.lsb + '/' + readJob.pc] = arr; App.store.set('midihub.assignnames', an);
      readJob.assigned = true; App.emit('deck:assignnames', { names: arr });
      if (readJob.named) readOff();
      return;
    }
    if (addr !== readJob.addr || readJob.named) return;
    var start = typeof readJob.off === 'number' ? readJob.off : a0 + al, s = '';
    for (var i = start; i < Math.min(b.length - 1, start + readJob.len); i++) { var c = b[i]; s += (c >= 32 && c < 127) ? String.fromCharCode(c) : ' '; }
    s = s.replace(/\s+$/, '').replace(/^\s+/, '');
    var job = readJob;
    // the Assign names block follows the name block in the dump: keep listening a moment for it
    job.named = true; clearTimeout(job.t); job.t = setTimeout(function () { if (readJob === job) readJob = null; }, 1500);
    if (job.assigned) readOff();
    if (!s) return toast('The synth answered, but with an empty name');
    var key = job.msb + '/' + job.lsb; names[key] = names[key] || {}; names[key][String(job.pc - 1)] = s.slice(0, 48);
    persist('names'); paintNow(); renderBankGrid(); renderTiles();
    toast('Name from synth: ' + s);
  }

  // ---- save ----
  function allPartsWithData() {
    api.kvFlush();
    var kvs = api.g('kv', null) || {}, out = {};
    for (var k in kvs) if (/^\d+$/.test(k) && Object.keys(kvs[k] || {}).length) out[k] = 1;
    for (var j in vals.ctl) if (/^\d+$/.test(j) && Object.keys(vals.ctl[j]).length) out[j] = 1;
    out[String(api.ch())] = 1;
    return Object.keys(out).map(Number).sort(function (a, b) { return a - b; });
  }
  function snapshot(scope, incKnobs, incBtns) {
    var m = map(), parts = {}, list = scope === 'prog' ? [] : scope === 'all' ? allPartsWithData() : [api.ch()];
    list.forEach(function (part) {
      var cc = {}, ctl = {}, key = String(part);
      var keyFor = function (c) { return stateKeyFor(c, part); };
      m.controls.forEach(function (c) {
        if (c.ui === 'knob' && c.kind === 'cc' && c.num != null) {
          if (!incKnobs) return;
          var p = c.ch === 'part' ? part : chOf(c), v = api.kvGet(c.num, p);
          if (v == null && c.sec === 'hub') v = api.kv(c.num, p);
          if (v != null && c.ch === 'part') cc[String(c.num)] = v;
          else if (v != null) ctl[c.id] = v; // a knob on another channel keeps its own entry
        } else if (c.ui === 'knob' && c.kind === 'sx') {
          if (!incKnobs) return;
          var s = getState(c, keyFor(c)); if (s != null) ctl[c.id] = s;
        } else if (c.ui === 'toggle') {
          if (!incBtns) return;
          var t = getState(c, keyFor(c)); if (t != null) ctl[c.id] = t;
        } else if (c.ui === 'radio' && c.group && !(c.group in ctl)) {
          if (!incBtns) return;
          var g = getState(c, keyFor(c)); if (g != null) ctl[c.group] = g;
        }
      });
      if (Object.keys(cc).length || Object.keys(ctl).length) parts[key] = { cc: cc, ctl: ctl };
    });
    return parts;
  }
  function progSource() {
    var p = hubProg(), lb = vals.lastBank;
    if (lb && lb.t > progSeenT && lb.ch !== api.ch()) return { msb: lb.msb, lsb: lb.lsb, pc: lb.pc, ch: lb.ch, from: 'synth' };
    return { msb: p.msb, lsb: p.lsb, pc: p.pc, ch: null, from: 'hub' };
  }
  // save({name, tags, scope, incProg, incKnobs, incBtns, id?}) -> the preset | null. Never sends.
  function save(o) {
    o = o || {};
    var name = String(o.name || '').trim().slice(0, 48); if (!name) { toast('Give the sound a name'); return null; }
    var it = o.id ? findPreset(o.id) : null;
    if (!it && lib.items.length >= LIB_CAP) { toast('200 sounds already — delete one'); return null; }
    var scope = o.scope === 'all' || o.scope === 'prog' ? o.scope : 'part';
    var ps = progSource(), prog = o.incProg === false ? null : { msb: ps.msb, lsb: ps.lsb, pc: ps.pc, ch: ps.ch };
    var parts = snapshot(scope, o.incKnobs !== false, o.incBtns !== false);
    var tags = isArr(o.tags) ? o.tags : String(o.tags || '').split(',');
    tags = tags.map(function (t) { return String(t).trim().slice(0, 20); }).filter(function (t) { return t; }).slice(0, 8);
    var now = Date.now();
    var snap = it && it.snap ? it.snap : {};
    if (typeof o.colour === 'string') snap.colour = o.colour.slice(0, 12);
    if (o.incApp === true) snap.app = appState(); else if (o.incApp === false) delete snap.app;
    if (isArr(o.fav) && o.fav.length === 4) snap.fav = o.fav.slice();
    if (o.incSplit === true) { var hs = window.SLMidiHub && SLMidiHub.split ? SLMidiHub.split.get() : null; snap.split = hs ? { at: hs.at, at2: hs.at2 || null, parts: hs.parts.slice(), port: hs.port || '', sus: hs.sus !== false, on: hs.on !== false } : { off: true }; }
    else if (o.incSplit === false) delete snap.split;
    if (!Object.keys(snap).length) snap = null;
    if (it) { it.name = name; it.tags = tags; it.prog = prog; it.parts = parts; it.updated = now; it.dev = profileKey(); if (snap) it.snap = snap; else delete it.snap; }
    else { it = { id: uid('p_'), name: name, star: false, tags: tags, dev: profileKey(), prog: prog, parts: parts, created: now, updated: now, used: 0 }; if (snap) it.snap = snap; lib.items.push(it); }
    persist('decklib');
    if (mounted) { renderTiles(); paintNow(); openRow = it.id; paintBytes(it.id); }
    if (!savedOnce && mounted) { savedOnce = true; tab('sounds'); revealTile(it.id); }
    toast((o.id ? 'Updated ' : 'Saved ') + name);
    return it;
  }
  // the app's own state a preset carries (the context bar's key / scale / mode; the LUMI layout follows)
  function appState() {
    var r = App.store.get('fb.root', 9), s = App.store.get('fb.scale', 'minorPent'), m = App.store.get('fb.mode', 0);
    return { root: typeof r === 'number' ? ((r % 12) + 12) % 12 : 9, scale: typeof s === 'string' ? s : 'minorPent', mode: typeof m === 'number' ? m : 0 };
  }
  function applyApp(app) {
    if (!app || typeof app.root !== 'number') return;
    App.emit('fb:set', { source: 'synthdeck', root: app.root, scale: app.scale, mode: app.mode });
  }
  function openSaveForm(id) {
    var f = els['save-form'], it = id ? findPreset(id) : null;
    els.pid.value = it ? it.id : '';
    els.pname.value = it ? it.name : (matchPreset() ? matchPreset().name + ' 2' : nowText().name);
    els.ptags.value = it ? it.tags.join(', ') : '';
    var scope = it ? (Object.keys(it.parts).length === 0 ? 'prog' : Object.keys(it.parts).length === 1 && it.parts[String(api.ch())] ? 'part' : 'all') : 'part';
    qa('button', els.pscope).forEach(function (b) { var on = b.dataset.scope === scope; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); });
    els.incprog.checked = it ? !!it.prog : true; els.incknobs.checked = true; els.incbtns.checked = true;
    els.psave.textContent = it ? 'Update' : 'Save';
    f.hidden = false; editing.save = true;
    paintSaveNote();
    try { els.pname.focus(); els.pname.select(); } catch (e) { /* no focus */ }
  }
  function closeSaveForm() { var f = els['save-form']; if (f) { f.hidden = true; } delete editing.save; }
  function formScope() { var b = q('button.active', els.pscope); return b ? b.dataset.scope : 'part'; }
  function paintSaveNote() {
    if (!mounted || els['save-form'].hidden) return;
    var ps = progSource();
    els.progtxt.textContent = 'Bank ' + ps.msb + '/' + ps.lsb + ' · Program ' + ps.pc + (ps.from === 'synth' ? ' (from the synth, ch ' + (ps.ch + 1) + ')' : '');
    var scope = formScope(), parts = snapshot(scope, true, true), n = 0, np = 0;
    for (var k in parts) { np++; n += Object.keys(parts[k].cc).length + Object.keys(parts[k].ctl).length; }
    els.pnote.textContent = scope === 'prog' ? 'Program only' : (scope === 'part' ? api.partLabel() + ' ' + (api.ch() + 1) : np + ' ' + api.partLabel() + 's') + ' · ' + n + ' values';
  }
  function submitSaveForm() {
    var it = save({ id: els.pid.value || null, name: els.pname.value, tags: els.ptags.value, scope: formScope(), incProg: els.incprog.checked, incKnobs: els.incknobs.checked, incBtns: els.incbtns.checked });
    if (it) closeSaveForm();
  }

  // ---- recall ----
  function stateKeyFor(c, part) { return typeof c.ch === 'number' ? String(c.ch) : String(part); }
  function recallPlan(id) {
    var it = findPreset(id), plan = []; if (!it) return plan;
    var m = map(), t = 0, pace = clamp(num(deck.pace, 2), 0, 200);
    if (it.prog) {
      var c = it.prog.ch == null ? api.ch() : it.prog.ch;
      plan.push({ bytes: [0xB0 | c, 0, it.prog.msb], origin: undefined, at: 0, step: 'prog' }, { bytes: [0xB0 | c, 32, it.prog.lsb], origin: undefined, at: 0, step: 'prog' }, { bytes: [0xC0 | c, it.prog.pc - 1], origin: undefined, at: 0, step: 'prog' });
    }
    var keys = Object.keys(it.parts).map(Number).sort(function (a, b) { return a - b; });
    if (keys.length && it.prog) t = clamp(num(deck.settleMs, 250), 0, 2000);
    keys.forEach(function (part) {
      var pp = it.parts[String(part)], done = {};
      m.controls.forEach(function (ctl) {
        if (ctl.ui !== 'knob' || ctl.kind !== 'cc' || ctl.num == null || ctl.ch !== 'part') return;
        var v = pp.cc[String(ctl.num)]; if (v == null || done[ctl.num]) return;
        done[ctl.num] = true; plan.push({ bytes: [0xB0 | part, ctl.num, v], origin: undefined, at: t, cc: ctl.num, part: part, v: v }); t += pace;
      });
      Object.keys(pp.cc).map(Number).sort(function (a, b) { return a - b; }).forEach(function (n) {
        if (done[n]) return; done[n] = true; plan.push({ bytes: [0xB0 | part, n, pp.cc[n]], origin: undefined, at: t, cc: n, part: part, v: pp.cc[n] }); t += pace;
      });
      m.controls.forEach(function (ctl) {
        var b = null, item = null, chan = ctl.ch === 'part' ? part : chOf(ctl);
        if (ctl.ui === 'toggle' && (ctl.id in pp.ctl)) { var on = pp.ctl[ctl.id] === 1; b = bytesFor(ctl, on ? 'on' : 'off', 0, chan); item = { ctl: ctl.id, state: on ? 1 : 0, key: stateKeyFor(ctl, part) }; }
        else if (ctl.ui === 'radio' && ctl.group && (ctl.group in pp.ctl) && ctl.val === pp.ctl[ctl.group]) { b = bytesFor(ctl, 'val', 0, chan); item = { ctl: ctl.id, state: ctl.val, key: stateKeyFor(ctl, part) }; }
        else if (ctl.ui === 'knob' && ctl.kind === 'sx' && (ctl.id in pp.ctl)) { b = bytesFor(ctl, 'knob', pp.ctl[ctl.id], chan); item = { ctl: ctl.id, state: pp.ctl[ctl.id], key: stateKeyFor(ctl, part) }; }
        else if (ctl.ui === 'knob' && ctl.kind === 'cc' && ctl.ch !== 'part' && ctl.num != null && (ctl.id in pp.ctl)) { b = bytesFor(ctl, 'knob', pp.ctl[ctl.id], chan); item = { cc: ctl.num, part: chan, v: pp.ctl[ctl.id] }; }
        if (!b || !item) return;
        item.bytes = b.bytes; item.origin = b.origin; item.at = t; plan.push(item); t += pace;
      });
    });
    if (plan.length > PLAN_CAP) { plan.length = PLAN_CAP; plan.truncated = true; }
    return plan;
  }
  function applyItem(item) {
    if (item.cc != null) {
      api.setKv(item.cc, item.v, item.part);
      if (item.part === api.ch()) { api.paintKnob(item.cc); qa('.mh-knob[data-ctl][data-kind="cc"][data-cc="' + item.cc + '"]', els.pages).forEach(function (k) { api.paintKnobEl(k, item.v); }); }
    } else if (item.ctl) {
      var ctl = ctlById(item.ctl); if (!ctl) return;
      setState(ctl, item.state, item.key);
    }
  }
  function ldStatus(txt) { if (els.ldst) els.ldst.textContent = txt; }
  // load(id) -> Promise<{sent, planned, stopped}>; one setTimeout chain
  function load(id) {
    return new Promise(function (resolve) {
      var it = findPreset(id);
      if (!it) { resolve({ sent: 0, planned: 0, stopped: true }); return; }
      cancelLoad(true); drainHeld('load'); learnOff(true);
      var plan = recallPlan(id), planned = plan.length;
      if (plan.truncated) toast('Sound too large, truncated');
      if (!planned) { ldStatus('Nothing to send for ' + it.name); resolve({ sent: 0, planned: 0, stopped: false }); return; }
      if (!txCheck(plan[0].bytes)) { ldStatus(!api.hasOut() ? 'Not loaded — no MIDI output' : outIsLumi() ? 'Not loaded — Synth out is the LUMI (key lights)' : 'Not loaded — SysEx is not allowed'); resolve({ sent: 0, planned: planned, stopped: true }); return; }
      var job = { id: id, name: it.name, plan: plan, i: 0, sent: 0, timer: 0, resolve: resolve, done: false };
      loadJob = job;
      els.lstop.hidden = false;
      var prog = plan.filter(function (p) { return p.step === 'prog'; }), rest = plan.filter(function (p) { return p.step !== 'prog'; });
      if (prog.length) {
        var c = prog[0].bytes[0] & 15;
        if (c === api.ch()) { api.sendProgram(it.prog.pc, it.prog.msb, it.prog.lsb); job.sent += 3; }
        else {
          for (var i = 0; i < prog.length; i++) { if (!tx(prog[i].bytes, prog[i].origin)) { finishLoad(job, true); return; } job.sent++; }
          api.set('msb', it.prog.msb); api.set('lsb', it.prog.lsb); api.set('prog', it.prog.pc); api.paintProg();
        }
        job.i = prog.length;
        lastLoaded = id; paintNow(); renderBankActive();
      }
      ldStatus('Loading ' + it.name + '… ' + job.i + '/' + planned);
      if (!rest.length) { finishLoad(job, false); return; }
      var step = function () {
        job.timer = 0;
        if (loadJob !== job) return;
        while (job.i < plan.length) {
          var item = plan[job.i];
          if (!tx(item.bytes, item.origin)) { finishLoad(job, true); return; }
          job.i++; job.sent++;
          applyItem(item);
          ldStatus('Loading ' + it.name + '… ' + job.i + '/' + planned);
          var nx = plan[job.i]; if (!nx) break;
          var dt = nx.at - item.at;
          if (dt > 0) { job.timer = setTimeout(step, dt); return; }
        }
        finishLoad(job, false);
      };
      job.timer = setTimeout(step, it.prog ? clamp(num(deck.settleMs, 250), 0, 2000) : 0);
    });
  }
  function finishLoad(job, stopped) {
    if (job.done) return; job.done = true;
    if (job.timer) { clearTimeout(job.timer); job.timer = 0; }
    if (loadJob === job) loadJob = null;
    if (els.lstop) els.lstop.hidden = true;
    var it = findPreset(job.id);
    if (stopped) ldStatus('Load stopped at ' + job.i + '/' + job.plan.length);
    else { if (it) { it.used = Date.now(); persist('decklib'); if (it.snap && it.snap.app) applyApp(it.snap.app); if (it.snap && it.snap.split && window.SLMidiHub && SLMidiHub.split) SLMidiHub.split.set(it.snap.split.off ? null : it.snap.split); } lastLoaded = job.id; ldStatus('Loaded ' + job.name + ' → ' + (api.hubOutName() || 'output')); }
    paintButtons(); paintPageKnobs(); paintNow(); if (mounted) renderTiles();
    job.resolve({ sent: job.sent, planned: job.plan.length, stopped: !!stopped });
  }
  function cancelLoad(quiet) {
    var job = loadJob; if (!job) return false;
    finishLoad(job, true);
    if (!quiet) toast('Load stopped');
    return true;
  }

  // ---- import / export ----
  function exportJSON() {
    flushAll();
    return { soundlab: 'synthdeck', v: VERSION, lib: clone(lib), names: clone(names), map: clone(deck.maps[profileKey()] || null), dev: profileKey() };
  }
  function doExport() {
    var txt = JSON.stringify(exportJSON(), null, 1), ta = q('#sdk-ptext', els.sounds), ok = false;
    if (!window.SL_ARTIFACT) {
      try {
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = 'soundlab-sounds.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); ok = 'download' in a;
      } catch (e) { ok = false; }
    }
    if (ta) { ta.hidden = ok; if (!ok) { ta.value = txt; ta.dataset.exported = txt; try { ta.select(); } catch (e2) { } } }
    toast(ok ? 'Exported ' + lib.items.length + ' sounds' : 'Downloads are blocked here — copy the text below');
  }
  function importJSON(obj) {
    try {
      if (!isObj(obj)) return { ok: false, why: 'not a sound file' };
      if (typeof obj.v === 'number' && obj.v > VERSION) return { ok: false, why: 'from a newer soundLAB — update the app' };
      var src = isObj(obj.lib) ? obj.lib : obj, items = isArr(src.items) ? src.items : null;
      if (!items && !isObj(obj.names) && !isObj(obj.map)) return { ok: false, why: 'no sounds in it' };
      var added = 0, updated = 0, dropped = 0;
      (items || []).forEach(function (p) {
        var v = validPreset(p); if (!v) { dropped++; return; }
        var cur = findPreset(v.id);
        if (cur) { for (var k in v) cur[k] = v[k]; updated++; }
        else if (lib.items.length < LIB_CAP) { lib.items.push(v); added++; }
        else dropped++;
      });
      if (isObj(obj.names)) { var nn = migrate('names', obj.names); for (var b in nn) if (b !== 'v') { names[b] = names[b] || {}; for (var pc in nn[b]) names[b][pc] = nn[b][pc]; } persist('names'); }
      if (isObj(obj.map)) {
        var mv = validMapOv(obj.map), pk = typeof obj.dev === 'string' && Maps[obj.dev] ? obj.dev : profileKey(), ov = ovFor(pk, true);
        for (var id in mv.ctl) ov.ctl[id] = mv.ctl[id];
        mv.custom.forEach(function (c) { var i = -1; ov.custom.forEach(function (x, j) { if (x.id === c.id) i = j; }); if (i >= 0) ov.custom[i] = c; else ov.custom.push(c); });
        mv.pages.forEach(function (p) { var i = -1; ov.pages.forEach(function (x, j) { if (x.id === p.id) i = j; }); if (i >= 0) ov.pages[i] = p; else ov.pages.push(p); });
        mv.banks.forEach(function (bk) { if (!ov.banks.some(function (x) { return x.msb === bk.msb && x.lsb === bk.lsb; })) ov.banks.push(bk); });
        invalidate(); persist('deck');
      }
      persist('decklib');
      if (mounted) { renderTiles(); renderBanks(); renderMap(); renderPages(); renderButtons(); paintNow(); }
      return { ok: true, added: added, updated: updated, dropped: dropped };
    } catch (e) { return { ok: false, why: 'not a sound file' }; }
  }
  function importText(txt) {
    var o; try { o = JSON.parse(txt); } catch (e) { toast('Not a sound file'); return; }
    var r = importJSON(o);
    toast(r.ok ? 'Imported: ' + r.added + ' new, ' + r.updated + ' updated' + (r.dropped ? ', ' + r.dropped + ' skipped' : '') : 'Not imported — ' + r.why);
  }
  function doImportClick() {
    var ta = q('#sdk-ptext', els.sounds), fi = q('#sdk-pimportfile', els.sounds);
    if (ta && !ta.hidden && ta.value.trim() && ta.value !== ta.dataset.exported) { importText(ta.value); return; }
    if (fi) fi.click();
  }

  // ============================================================ SCOPE ====
  function renderScope() {
    var host = els['scope-tab']; if (!host) return;
    if (!window.SLSynthScope) { host.innerHTML = '<div class="muted small">The Scope is not in this build.</div>'; return; }
    try {
      SLSynthScope.mount(host, api, { win: deck.scope.win, lanes: deck.scope.lanes.slice(), showOut: deck.scope.showOut, onChange: function (o) {
        if (!isObj(o)) return;
        if ([1, 2, 4, 8].indexOf(o.win) >= 0) deck.scope.win = o.win;
        if (isArr(o.lanes)) deck.scope.lanes = o.lanes.filter(function (x) { return typeof x === 'number'; }).slice(0, 4);
        if ('showOut' in o) deck.scope.showOut = !!o.showOut;
        persist('deck');
      } });
    } catch (e) { console.error('synth scope', e); }
  }
  function scopeSync() {
    if (!window.SLSynthScope) return;
    var on = mounted && !!deck && deck.tab === 'scope' && active();
    try { SLSynthScope.setActive(on); if (on && !document.hidden) SLSynthScope.start(); else SLSynthScope.stop(); } catch (e) { /* scope not mounted yet */ }
  }
  function scopeOff() { if (!window.SLSynthScope) return; try { SLSynthScope.setActive(false); SLSynthScope.stop(); } catch (e) { } }

  // ============================================================ LIFECYCLE ====
  function stop() {
    drainHeld('stop'); cancelLoad(true); learnOff(true); readOff();
    scopeOff();
    flushAll();
    if (api && api.kvFlush) api.kvFlush();
  }
  function onPart() {
    if (!mounted || !api) return;
    drainHeld('part');
    if (profileKey() !== lastProfile) {
      lastProfile = profileKey(); invalidate(); pageId = null; bankSel = null; learnOff(true); factory = null; factoryState = '';
      renderPages(); renderButtons(); renderSounds(); renderMap();
    } else { paintButtons(); paintPageKnobs(); renderBankActive(); }
    paintNow(); paintNative();
  }
  function onBack() {
    if (!mounted) return false;
    if (editing.save) { closeSaveForm(); return true; }
    if (editing.addform) { closeAddForm(); return true; }
    if (editing.picker) { closePicker(); return true; }
    if (editing.addbank) { closeAddBank(); return true; }
    if (learning) { learnOff(); return true; }
    return false;
  }

  // ============================================================ CSS ====
  function injectStyles() {
    App.injectCSS('synthdeck',
      '.sdk-now{padding:16px 18px}.sdk-now-main{display:flex;flex-direction:column;gap:2px;margin-bottom:12px;min-width:0}' +
      '.sdk-name{background:none;border:0;padding:0;text-align:left;color:var(--text);font:600 30px/1.1 var(--font-condensed);cursor:pointer;letter-spacing:.2px;overflow-wrap:anywhere;max-width:100%}' +
      '@media (hover:hover){.sdk-name:hover{color:var(--accent-ink)}}#sdk-nowsub{overflow-wrap:anywhere}#sdk-nowsub.bad{color:var(--red)}' +
      '.sdk-now-acts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}' +
      '.btn.sdk-big{min-height:52px;font-size:16px;padding:8px 10px;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}' +
      '#sdk-star.active{color:var(--accent-ink);border-color:var(--accent-line);background:var(--accent-soft)}' +
      '.sdk-pins{display:flex;gap:8px;overflow-x:auto;padding:10px 0 4px;scrollbar-width:thin;-webkit-overflow-scrolling:touch}.sdk-pins[hidden]{display:none}' +
      '.sdk-pin{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:6px 14px;border-radius:999px;border:1px solid var(--ctl-border);background:var(--card2);color:var(--text);font-family:var(--font-body);font-weight:600;font-size:14px;cursor:pointer;max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.sdk-pin.active{color:var(--accent-ink);border-color:var(--accent-line);background:var(--accent-soft)}' +
      '.sdk-ldrow{margin-top:6px}.sdk-ldrow:empty{display:none}#sdk-ldst{font-size:12.5px;color:var(--muted)}#sdk-ldst:empty{display:none}' +
      '#sdk-native{margin-top:8px}#sdk-native.info{color:var(--warn)}' +
      '.sdk-form{margin-top:12px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--card2)}.sdk-form .row{margin-bottom:8px}.sdk-form .row:last-child{margin-bottom:0}' +
      '.sdk-form input[type=text]{min-width:0;width:200px;max-width:100%}.sdk-form .seg button{min-height:40px}' +
      '.seg.sdk-tabs{display:flex;width:100%;margin:0 0 12px;box-sizing:border-box}.sdk-tabs button{flex:1;min-height:44px;font-size:14px;padding:4px 6px}' +
      '.sdk-pagehead{justify-content:space-between;margin-bottom:12px}.sdk-pageacts{margin-top:12px}' +
      '.sdk-slot{display:grid;justify-items:center;align-content:center;gap:4px;min-height:124px;border:1px dashed var(--ctl-border);border-radius:12px;background:transparent;color:var(--muted);font-family:var(--font-body);font-size:12px;cursor:pointer}' +
      '@media (hover:hover){.sdk-slot:hover{border-color:var(--accent-line);color:var(--text)}}.sdk-picker{margin-top:10px}' +
      '.mh-knob.unsure{opacity:.7;border-style:dashed;cursor:pointer}' +
      '.sdk-badge{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:8px;font-size:11px;font-weight:700;background:var(--accent-soft);color:var(--accent-ink);border:1px solid var(--accent-line);margin-left:5px;vertical-align:middle}' +
      '.sdk-dot{color:var(--muted);margin-left:4px;font-weight:700}.sdk-ok{color:var(--green);margin-left:4px;display:inline-flex}' +
      '.sdk-sec{margin-bottom:16px}.sdk-sec h3{margin-bottom:8px}.sdk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.sdk-radios{display:contents}' +
      '.sdk-btn{display:grid;gap:2px;justify-items:start;align-content:center;min-height:64px;padding:10px 12px;border-radius:12px;border:1px solid var(--ctl-border);background:var(--card2);color:var(--text);text-align:left;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;font-family:var(--font-body);box-shadow:var(--shadow-1)}' +
      '.sdk-btn .sdk-bname{font-weight:600;font-size:14.5px;display:inline-flex;align-items:center}.sdk-btn small{color:var(--muted);font-size:11.5px}' +
      '.sdk-btn.active{background:var(--accent-soft);border-color:var(--accent-line);color:var(--accent-ink)}.sdk-btn.active small{color:var(--accent-ink)}' +
      '.sdk-btn[data-ui=momentary].active{background:var(--accent);color:#221302;border-color:var(--accent)}.sdk-btn[data-ui=momentary].active small{color:#221302}' +
      '.sdk-btn.unsure{border-style:dashed;opacity:.75}.sdk-btnacts{margin-top:8px}' +
      '.sdk-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:8px;margin-top:12px}.sdk-titem{position:relative;display:grid;min-width:0}' +
      '.sdk-tile{display:grid;gap:3px;justify-items:start;align-content:start;min-height:64px;padding:10px 36px 10px 12px;border-radius:12px;border:1px solid var(--ctl-border);background:var(--card2);color:var(--text);text-align:left;cursor:pointer;font-family:var(--font-body);min-width:0;box-shadow:var(--shadow-1)}' +
      '.sdk-tname{font:600 17px/1.15 var(--font-condensed);overflow-wrap:anywhere;display:inline-flex;gap:4px;align-items:center}.sdk-tstar{color:var(--accent);display:inline-flex}' +
      '.sdk-tsub{font-size:11.5px;color:var(--muted)}.sdk-ttags{font-size:11px;color:var(--accent-ink)}.sdk-ttags:empty{display:none}' +
      '.sdk-tile.active{border-color:var(--accent-line);background:var(--accent-soft)}.sdk-titem.open .sdk-tile{border-radius:12px 12px 0 0}' +
      '.sdk-tmore{position:absolute;top:6px;right:6px;width:30px;height:30px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--muted);font-size:18px;line-height:1;cursor:pointer}' +
      '.sdk-trow{display:flex;flex-wrap:wrap;gap:6px;padding:8px;border:1px solid var(--line);border-top:0;border-radius:0 0 12px 12px;background:var(--card)}' +
      '#sdk-bytes{margin-top:10px;color:var(--muted);overflow-wrap:anywhere}#sdk-bytes:empty{display:none}#sdk-search{min-width:0;flex:1 1 160px}.sdk-shead{margin-bottom:4px}' +
      '.sdk-bankhead{margin:6px 0}.sdk-bankgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px;margin:10px 0;max-height:380px;overflow:auto;padding-right:2px}' +
      '.sdk-pc{display:grid;gap:1px;justify-items:start;min-height:44px;padding:5px 8px;border-radius:9px;border:1px solid var(--line);background:var(--card2);color:var(--muted);text-align:left;cursor:pointer;font-size:12.5px;line-height:1.15;font-family:var(--font-body);min-width:0}' +
      '.sdk-pc span{overflow-wrap:anywhere}.sdk-pc b{font:400 15px/1 var(--font-display);color:var(--muted)}.sdk-pc.named{color:var(--text)}.sdk-pc.active{border-color:var(--accent);background:var(--accent-soft);color:var(--accent-ink)}.sdk-pc.active b{color:var(--accent-ink)}' +
      '#sdk-nameform{margin-top:8px}#sdk-nameform input{flex:1 1 140px;min-width:0}' +
      '.sdk-sfoot{margin-top:12px;padding-top:12px;border-top:1px solid var(--line-soft)}.sdk-sfoot input[type=number]{width:84px}' +
      '#sdk-ptext{width:100%;box-sizing:border-box;min-height:120px;margin-top:8px;font-family:ui-monospace,Consolas,Menlo,monospace;font-size:12px;background:var(--card2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px}' +
      '.sdk-maphead{margin-bottom:12px}#sdk-mapdev{font-size:14px}' +
      '.sdk-tscroll{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%}.sdk-mtable{min-width:720px}' +
      '.sdk-mtable input[type=text]{width:120px}.sdk-mtable input[type=number]{width:72px}.sdk-mtable .sdk-addr{width:92px}.sdk-mtable .sdk-hex{width:48px;text-align:center}' +
      '.sdk-mtable td small{display:block;margin-top:2px}.sdk-mtable select{padding-right:30px;max-width:120px}.sdk-numcell input{margin:0 4px 4px 0}' +
      '.sdk-acts{white-space:nowrap}.sdk-acts .btn{margin:2px 4px 2px 0}' +
      '.sdk-conf{font-weight:700;color:var(--muted);display:inline-flex}.sdk-conf[data-conf=unverified]{color:var(--warn)}.sdk-conf[data-conf=learned]{color:var(--green)}' +
      '.sdk-mpage{margin-bottom:8px}.sdk-mpage input[type=text]{width:120px}.sdk-mslots{display:flex;flex-wrap:wrap;gap:4px}.sdk-mslots select{max-width:124px;font-size:12.5px;padding-left:8px}' +
      '.btn.armed{background:var(--red);color:#fff;border-color:var(--red)}' +
      '@media (pointer:coarse){.mh-knob svg{width:84px;height:84px}.mh-knob.hero svg{width:140px;height:140px}.mh-knobs{grid-template-columns:repeat(auto-fill,minmax(112px,1fr))}}' +
      '@media (max-width:700px){.sdk-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}.sdk-now-acts{grid-template-columns:repeat(2,minmax(0,1fr))}.sdk-name{font-size:26px}.sdk-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.sdk-bankgrid{grid-template-columns:repeat(3,minmax(0,1fr))}}' +
      '@media (max-width:400px){.sdk-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.sdk-tabs button{font-size:13px;padding:4px 2px}.sdk-bankgrid{grid-template-columns:repeat(2,minmax(0,1fr))}}'
    );
  }

  // ============================================================ PUBLIC ====
  // ---- PERFORM: what the Synth tab's play face (js/synthtab.js) needs ----
  // Everything still goes through sendCtl / the Hub's turn(), so the LUMI
  // guard, Rules-on-app-controls, the ledger and the switch states hold.
  function tapCtl(id) {
    var ctl = ctlById(id); if (!ctl) return false;
    if (unsure(ctl)) { toast('No number yet — set it in Map or tap Learn'); return false; }
    if (ctl.ui === 'toggle') { var next = getState(ctl) === 1 ? 0 : 1; if (!sendCtl(ctl, next ? 'on' : 'off')) return false; setState(ctl, next); paintButtons(); return true; }
    if (ctl.ui === 'radio') { if (!sendCtl(ctl, 'val')) return false; setState(ctl, typeof ctl.val === 'number' ? ctl.val : 0); paintButtons(); return true; }
    if (ctl.ui === 'trigger') return sendCtl(ctl, 'val');
    return false;
  }
  function ctlInfo(id) {
    var ctl = ctlById(id); if (!ctl) return null;
    var st = getState(ctl), on = ctl.ui === 'radio' ? (st != null && st === (typeof ctl.val === 'number' ? ctl.val : 0)) : st === 1;
    return { id: ctl.id, name: ctl.name, ui: ctl.ui, on: on, unsure: unsure(ctl), conf: ctl.conf, num: ctl.num };
  }
  var PERFORM = {
    ready: function () { return !!(api && deck && lib); }, // the Hub mounts the deck after the Synth tab's pages init
    now: function () { var t = nowText(), p = hubProg(); return { name: t.name, sub: t.sub, bad: t.bad, msb: p.msb, lsb: p.lsb, pc: p.pc, part: api.ch(), out: api.hubOutName ? (api.hubOutName() || '') : '', match: matchPreset() }; },
    step: stepProgram,
    presets: function () { return lib ? lib.items.slice() : []; },
    load: load,
    openSave: function () { tab('sounds'); openSaveForm(null); },
    kv: function (cc) { return api ? api.kv(cc) : 0; },
    turn: function (cc, v) { if (!api || !txCheck([0xB0])) return false; api.turn(cc, v); return true; },
    knobs: function () { return api ? api.allKnobs() : []; },
    ccName: function (cc) { return api && api.ccName ? api.ccName(cc) : null; },
    tap: tapCtl, ctl: ctlInfo,
    save: save, find: findPreset, appState: appState,
    // Live: all notes off + sustain off on every channel, through the deck's funnel
    // profiles (js/synthlive.js): the whole library + names as JSON, and a replace that swaps them
    exportJSON: exportJSON,
    replaceSounds: function (obj) { lib.items.length = 0; for (var k in names) if (k !== 'v') delete names[k]; var r = importJSON(obj || {}); persist('decklib'); persist('names'); if (mounted) { renderTiles(); paintNow(); } return r; },
    panic: function () { if (!txCheck([0xB0])) return false; var n = 0; for (var c = 0; c < 16; c++) { if (tx([0xB0 | c, 123, 0], 'raw')) n++; tx([0xB0 | c, 120, 0], 'raw'); tx([0xB0 | c, 64, 0], 'raw'); } return n > 0; },
    // a bank/program (e.g. a MODX Live Set slot: MSB 62, LSB page, PC slot) on the current Part
    program: function (msb, lsb, pc) { if (!txCheck([0xC0])) return false; api.sendProgram(pc, msb, lsb); paintNow(); return true; },
    persist: function () { persist('decklib'); if (mounted) { renderTiles(); paintNow(); } },
    // the Performance's own names for Assign knobs 1-8 (Read name from synth fills them), or null
    assignNames: function () { var p = hubProg(), an = App.store.get('midihub.assignnames', null); var a = an && an[p.msb + '/' + p.lsb + '/' + p.pc]; return Array.isArray(a) ? a : null; },
    readName: readName
  };

  var DECK = {
    version: VERSION,
    perform: PERFORM,
    init: init, stop: stop, onPart: onPart, onBack: onBack,
    hubKnobs: hubKnobs, map: function (pk) { return deck ? map(pk) : null; }, setControl: setControl, resetMap: resetMap, learn: learn,
    presets: function () { return lib ? lib.items.slice() : []; }, save: save, load: load, recallPlan: recallPlan, cancelLoad: function () { return cancelLoad(); },
    tab: tab, names: names_, nowText: nowText, tx: tx,
    migrate: migrate, exportJSON: exportJSON, importJSON: importJSON,
    scopeFeed: function (bytes, dir, t, portId) { if (window.SLSynthScope && SLSynthScope.feed) return SLSynthScope.feed(bytes, dir, t, portId); },
    scopeFrame: function () { if (window.SLSynthScope && SLSynthScope.frame) return SLSynthScope.frame(); },
    scopeState: function () { return window.SLSynthScope && SLSynthScope.state ? SLSynthScope.state() : null; },
    get scopeRunning() { return !!(window.SLSynthScope && SLSynthScope.running); },
    get held() { return Object.keys(heldSet); }
  };
  window.SLSynthDeck = DECK;
  if (window.App) App.synthDeck = DECK;
})();
