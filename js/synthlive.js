/* soundLAB LIVE SETS (1.3, Synth tab pill "Live"): named sets of presets in
 * PAGES OF 16 (4 x 4), like the MODX's own Live Sets. A slot holds a Synth
 * Deck preset (js/synthdeck.js, loaded through App.synthDeck.perform.load) or
 * a MODX Live Set slot (Bank MSB 62 / LSB page / Program slot on the Part
 * channel). Stepping: on-screen Next / Prev, a FOOT SWITCH CC (learned once,
 * synthtab.fsCC) and, as an option, a LUMI's octave buttons ('midi:range'
 * with prev). GO LIVE = the stage page: the top bar and the tab bar fold
 * away, keep-awake is held, Lock turns every slot into press-and-hold,
 * Panic sends all notes off + sustain off on all 16 channels through the
 * deck's funnel. The Deck's own slot grid shows the active set's page.
 * Store synthtab.live {sets:[{id, name, pages:[[16 x (null | {preset} |
 * {modx:{lsb, pc}})]]}], active, page, slot}, synthtab.fsCC, synthtab.octStep.
 * Plan: docs/SYNTH-TAB-PLAN.md; requirements: docs/UI-LOGIC-SWEEP-1.3.md §5.
 */
(function () {
  'use strict';

  var root = null, els = {}, editing = false, picking = null, locked = false, live = false, learnFs = false, holdT = 0, holdSlot = null;
  var NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function q(sel, r) { return (r || root).querySelector(sel); }
  function qa(sel, r) { return Array.prototype.slice.call((r || root).querySelectorAll(sel)); }
  function g(k, d) { return App.store.get('synthtab.' + k, d); }
  function set(k, v) { App.store.set('synthtab.' + k, v); }
  function P() { var d = App.synthDeck; return d && d.perform && d.perform.ready() ? d.perform : null; }
  function uid() { return 'ls' + Date.now().toString(36) + Math.floor(Math.random() * 1e4); }
  function toast(m) { if (App.toast) App.toast(m); }

  // ---- the store ----
  function data() {
    var d = g('live', null);
    if (!d || !Array.isArray(d.sets)) d = { sets: [], active: null, page: 0, slot: null };
    d.sets = d.sets.filter(function (s) { return s && typeof s.id === 'string' && Array.isArray(s.pages); });
    d.sets.forEach(function (s) { s.name = String(s.name || 'Set').slice(0, 40); if (!s.pages.length) s.pages.push(emptyPage()); s.pages = s.pages.map(function (p) { var o = Array.isArray(p) ? p.slice(0, 16) : []; while (o.length < 16) o.push(null); return o; }); });
    return d;
  }
  function save(d) { set('live', d); }
  function emptyPage() { var a = []; for (var i = 0; i < 16; i++) a.push(null); return a; }
  function active(d) { d = d || data(); for (var i = 0; i < d.sets.length; i++) if (d.sets[i].id === d.active) return d.sets[i]; return d.sets[0] || null; }
  function pageOf(d) { var s = active(d); if (!s) return null; var i = Math.max(0, Math.min(s.pages.length - 1, d.page | 0)); d.page = i; return s.pages[i]; }
  function slotName(sl) {
    if (!sl) return '';
    if (sl.preset) { var p = P(), it = p ? p.find(sl.preset) : null; return it ? it.name : '(missing preset)'; }
    if (sl.modx) return 'Live Set ' + (sl.modx.lsb + 1) + '-' + sl.modx.pc;
    return '';
  }
  function slotBadges(sl) {
    if (!sl) return '';
    if (sl.modx) return 'MODX Live Set';
    var p = P(), it = p ? p.find(sl.preset) : null; if (!it) return '';
    var b = [], sn = it.snap || {};
    if (it.prog) b.push(it.prog.msb + '/' + it.prog.lsb + '/' + it.prog.pc);
    if (sn.app && typeof sn.app.root === 'number') b.push(NOTE[sn.app.root % 12] + ' ' + (sn.app.scale || ''));
    if (sn.split && !sn.split.off) b.push('split');
    return b.join(' · ');
  }
  function slotColour(sl) { var p = P(), it = sl && sl.preset && p ? p.find(sl.preset) : null; return it && it.snap && it.snap.colour ? it.snap.colour : ''; }

  // ---- PROFILES: a named bundle of sounds (the deck library + names), Live sets and Deck settings ----
  // synthtab.profiles [{id, name, updated, data}], synthtab.profile = the active id. Switching
  // saves the active profile first, then replaces the deck's library and the Live/Deck stores.
  var PROFILE_KEYS = ['live', 'fav', 'fsCC', 'octStep', 'explain', 'row'];
  function profiles() { var l = g('profiles', null); return Array.isArray(l) ? l.filter(function (x) { return x && typeof x.id === 'string'; }) : []; }
  function profileId() { return g('profile', null); }
  function activeProfile() { var id = profileId(); return profiles().filter(function (x) { return x.id === id; })[0] || null; }
  function snapshotProfile(into) {
    var p = P(), d = {};
    PROFILE_KEYS.forEach(function (k) { d[k] = g(k, null); });
    d.deck = p && p.exportJSON ? p.exportJSON() : null;
    into.data = d; into.updated = Date.now();
    return into;
  }
  function applyProfile(pr) {
    var d = pr.data || {}, p = P();
    PROFILE_KEYS.forEach(function (k) { set(k, d[k] == null ? null : d[k]); });
    if (p && p.replaceSounds) p.replaceSounds(d.deck || { lib: { items: [] } });
    set('profile', pr.id);
    editing = false; closePicker(); render();
    App.emit('synthtab:profile', { id: pr.id });
  }
  function saveActiveProfile() { var list = profiles(), a = activeProfile(); if (!a) return list; snapshotProfile(a); set('profiles', list.map(function (x) { return x.id === a.id ? a : x; })); return profiles(); }
  function switchProfile(id) { var list = saveActiveProfile(), to = list.filter(function (x) { return x.id === id; })[0]; if (!to) return false; applyProfile(to); return true; }
  function newProfile(name, duplicate) {
    var list = saveActiveProfile(), pr = { id: 'pf' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), name: String(name || 'Profile').slice(0, 40), updated: Date.now(), data: {} };
    if (duplicate) snapshotProfile(pr); else { pr.data = { deck: { lib: { items: [] } }, live: null, fav: null, fsCC: null, octStep: false, explain: g('explain', false), row: 'fav' }; }
    if (!list.length && !activeProfile()) { var cur = { id: 'pf' + (Date.now() - 1).toString(36), name: 'My setup', updated: Date.now(), data: {} }; snapshotProfile(cur); list.push(cur); } // the setup you had becomes the first profile
    list.push(pr); set('profiles', list); applyProfile(pr); return pr;
  }
  function renameProfile(name) { var a = activeProfile(); if (!a) return; a.name = String(name || a.name).slice(0, 40); set('profiles', profiles().map(function (x) { return x.id === a.id ? a : x; })); render(); }
  function deleteProfile() { var a = activeProfile(); if (!a) return; var list = profiles().filter(function (x) { return x.id !== a.id; }); set('profiles', list); if (list.length) applyProfile(list[0]); else { set('profile', null); render(); } }
  function exportProfile() {
    var a = activeProfile(); if (!a) { toast('No profile yet — make one first'); return null; }
    snapshotProfile(a); set('profiles', profiles().map(function (x) { return x.id === a.id ? a : x; }));
    var obj = { soundlab: 'synthtab-profile', v: 1, profile: a }, txt = JSON.stringify(obj, null, 1);
    if (!window.SL_ARTIFACT) { try { var el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); el.download = 'soundlab-profile-' + a.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.json'; document.body.appendChild(el); el.click(); document.body.removeChild(el); } catch (e) { toast('Downloads are blocked here'); } }
    return obj;
  }
  function importProfile(obj) {
    if (!obj || obj.soundlab !== 'synthtab-profile' || !obj.profile || typeof obj.profile.id !== 'string') { toast('Not a soundLAB profile file'); return false; }
    var list = saveActiveProfile(), pr = { id: obj.profile.id, name: String(obj.profile.name || 'Imported').slice(0, 40), updated: Date.now(), data: obj.profile.data || {} };
    if (list.some(function (x) { return x.id === pr.id; })) pr.id = pr.id + '-' + Date.now().toString(36);
    list.push(pr); set('profiles', list); applyProfile(pr); toast('Profile ' + pr.name + ' loaded'); return true;
  }

  // ---- loading a slot ----
  var COLOURS = { amber: '#ffab47', teal: '#2fb8a0', blue: '#4f8df5', pink: '#e06aa0', green: '#7dc45a', grey: '#8a8580' };
  function go(d, idx) {
    var page = pageOf(d), sl = page && page[idx], p = P(); if (!sl || !p) return false;
    d.slot = idx; save(d);
    if (sl.preset) p.load(sl.preset).then(function () { paint(); App.emit('synthlive:slot', { idx: idx }); });
    else if (sl.modx) { p.program(62, sl.modx.lsb, sl.modx.pc); paint(); App.emit('synthlive:slot', { idx: idx }); }
    paint();
    return true;
  }
  // next / previous filled slot, across pages
  function step(dir) {
    var d = data(), s = active(d); if (!s) return false;
    var order = []; s.pages.forEach(function (p, pi) { p.forEach(function (sl, i) { if (sl) order.push({ pi: pi, i: i }); }); });
    if (!order.length) return false;
    var cur = -1; order.forEach(function (o, k) { if (o.pi === d.page && o.i === d.slot) cur = k; });
    var nx = order[((cur < 0 ? (dir > 0 ? -1 : 0) : cur) + dir + order.length) % order.length];
    d.page = nx.pi; return go(d, nx.i);
  }
  var lastStep = 0;
  function debounced(dir) { var now = Date.now(); if (now - lastStep < 150) return false; lastStep = now; return step(dir); }

  // ---- render ----
  function render() {
    if (!root) return;
    var d = data(), s = active(d), page = pageOf(d);
    root.classList.toggle('st-islive', live);
    if (!s) {
      root.innerHTML = '<div class="st-lvprof muted small"><span>Profile</span><select id="st-lvprofile" aria-label="Profile">' + (profiles().length ? profiles().map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === profileId() ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') : '<option value="">(no profile — your current setup)</option>') + '</select><button type="button" class="btn sm" id="st-lvpnew">+ New</button><button type="button" class="btn sm" id="st-lvpdup">Duplicate</button>' + (profiles().length ? '<button type="button" class="btn sm" id="st-lvprename">Rename</button><button type="button" class="btn sm" id="st-lvpdel">Delete</button>' : '') + '<button type="button" class="btn sm" id="st-lvpexport">Export</button><label class="btn sm">Import<input type="file" id="st-lvpimport" accept=".json,application/json" hidden></label></div>' +
        '<div class="card st-lvempty"><h2>Live sets</h2><p class="muted">Pages of 16 presets, like the synth’s own Live Sets. Save presets on the Deck, then put them on slots here; step through them with a foot switch on stage.</p><button type="button" class="btn primary st-big" id="st-lvnew">New set</button></div>';
      return;
    }
    var fs = g('fsCC', null);
    root.innerHTML =
      (live ? '' :
      '<div class="st-lvtop">' +
        '<label class="field st-lvsel">Set<select id="st-lvset">' + d.sets.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === s.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></label>' +
        '<button type="button" class="btn sm" id="st-lvnew" title="New set">+ New</button><button type="button" class="btn sm" id="st-lvrename">Rename</button><button type="button" class="btn sm" id="st-lvdel">Delete</button>' +
        '<span class="st-lvgap"></span>' +
        '<button type="button" class="btn sm' + (editing ? ' active' : '') + '" id="st-lvedit" aria-pressed="' + editing + '">' + (editing ? 'Done' : 'Edit slots') + '</button>' +
        '<button type="button" class="btn primary" id="st-lvgo">Go live</button>' +
      '</div>' +
      '<div class="st-lvprof muted small"><span>Profile</span><select id="st-lvprofile" aria-label="Profile">' + (profiles().length ? profiles().map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === profileId() ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') : '<option value="">(no profile — your current setup)</option>') + '</select>' +
        '<button type="button" class="btn sm" id="st-lvpnew" title="An empty profile">+ New</button><button type="button" class="btn sm" id="st-lvpdup" title="A copy of this setup">Duplicate</button>' + (profiles().length ? '<button type="button" class="btn sm" id="st-lvprename">Rename</button><button type="button" class="btn sm" id="st-lvpdel">Delete</button>' : '') +
        '<button type="button" class="btn sm" id="st-lvpexport">Export</button><label class="btn sm">Import<input type="file" id="st-lvpimport" accept=".json,application/json" hidden></label></div>' +
      '<div class="st-lvopts muted small">' +
        '<span>Foot switch: ' + (fs == null ? 'none' : 'CC ' + fs) + '</span><button type="button" class="btn sm' + (learnFs ? ' active' : '') + '" id="st-lvfs">' + (learnFs ? 'Listening… press the switch' : 'Learn') + '</button>' + (fs == null ? '' : '<button type="button" class="btn sm" id="st-lvfsclr">Clear</button>') +
        '<label class="mh-chk"><input type="checkbox" id="st-lvoct"' + (g('octStep', false) ? ' checked' : '') + '> LUMI octave buttons step the set</label>' +
      '</div>') +
      (live ?
      '<div class="st-lvstage">' +
        '<div class="st-lvstagetop"><button type="button" class="btn sm" id="st-lvexit">‹ Exit</button><span class="muted small">' + esc(s.name) + ' · page ' + (d.page + 1) + ' of ' + s.pages.length + '</span>' +
          '<button type="button" class="btn sm' + (locked ? ' active' : '') + '" id="st-lvlock" aria-pressed="' + locked + '">' + (locked ? 'Locked' : 'Lock') + '</button></div>' +
        '<div class="card st-lvnow"><div class="st-lvkick">NOW · SLOT ' + (d.slot == null ? '–' : d.slot + 1) + '</div><div class="st-lvname" id="st-lvnowname">' + esc(d.slot == null ? '—' : slotName(page[d.slot]) || '—') + '</div><div class="muted small">' + esc(d.slot == null ? 'tap a slot' : slotBadges(page[d.slot])) + '</div></div>' +
        '<div class="st-lvnext muted small">NEXT · ' + esc(nextName(d)) + '</div>' +
      '</div>' : '') +
      '<div class="st-lvpager"><button type="button" class="btn sm" id="st-lvpprev" aria-label="Previous page"' + (d.page <= 0 ? ' disabled' : '') + '>‹</button><span class="muted small">page ' + (d.page + 1) + ' of ' + s.pages.length + '</span><button type="button" class="btn sm" id="st-lvpnext" aria-label="Next page"' + (d.page >= s.pages.length - 1 ? ' disabled' : '') + '>›</button>' + (editing ? '<button type="button" class="btn sm" id="st-lvpadd">+ Page</button>' : '') + '</div>' +
      '<div class="st-lvgrid" id="st-lvgrid" role="group" aria-label="Slots">' + page.map(function (sl, i) {
        var col = COLOURS[slotColour(sl)] || '';
        return '<button type="button" class="st-lvslot' + (sl ? '' : ' empty') + (i === d.slot ? ' active' : '') + '" data-slot="' + i + '"' + (col ? ' style="border-left:4px solid ' + col + '"' : '') + ' aria-label="Slot ' + (i + 1) + (sl ? ': ' + esc(slotName(sl)) : ', empty') + '">' +
          '<span class="st-lvn">' + (i + 1) + '</span><span class="st-lvname2">' + esc(slotName(sl) || (editing ? '+ assign' : '')) + '</span><span class="st-lvsub">' + esc(slotBadges(sl)) + '</span></button>';
      }).join('') + '</div>' +
      (live ? '<div class="st-lvacts"><button type="button" class="btn st-big" id="st-lvprev">‹ Prev</button><button type="button" class="btn st-big" id="st-lvnextb">Next ›</button><button type="button" class="btn st-big st-panic" id="st-lvpanic">Panic</button></div>' +
        '<p class="muted small st-lvhint">Screen stays on. ' + (locked ? 'Locked: hold a slot to load it.' : 'Lock to make slots press-and-hold.') + '</p>' : '') +
      '<div class="st-lvpick" id="st-lvpick" hidden></div>';
    ['lvset', 'lvgrid', 'lvpick'].forEach(function (id) { els[id] = q('#st-' + id); });
  }
  function nextName(d) {
    var s = active(d); if (!s) return '—';
    var order = []; s.pages.forEach(function (p, pi) { p.forEach(function (sl, i) { if (sl) order.push({ pi: pi, i: i, sl: sl }); }); });
    if (!order.length) return '—';
    var cur = -1; order.forEach(function (o, k) { if (o.pi === d.page && o.i === d.slot) cur = k; });
    var nx = order[(cur + 1) % order.length];
    return (nx.i + 1) + ' · ' + slotName(nx.sl);
  }
  function paint() { render(); }

  // ---- the slot picker (edit mode) ----
  function openPicker(idx) {
    var p = P(); if (!p || !els.lvpick) return;
    picking = idx;
    var items = p.presets().slice().sort(function (a, b) { return (b.used || 0) - (a.used || 0); });
    els.lvpick.innerHTML = '<div class="card st-lvpickcard"><div class="st-lvpickhead"><b>Slot ' + (idx + 1) + '</b><button type="button" class="btn sm" data-pick="close">Close</button></div>' +
      '<div class="st-lvpicklist">' + items.map(function (it) { return '<button type="button" class="st-lvpickitem" data-pick="preset" data-id="' + esc(it.id) + '"><b>' + esc(it.name) + '</b><span class="muted small">' + esc(it.prog ? it.prog.msb + '/' + it.prog.lsb + '/' + it.prog.pc : '') + (it.tags && it.tags.length ? ' · ' + esc(it.tags.join(', ')) : '') + '</span></button>'; }).join('') +
        (items.length ? '' : '<p class="muted small">No presets yet — save one on the Deck.</p>') + '</div>' +
      '<div class="st-lvpickmodx"><b>MODX Live Set slot</b> <label class="field">page<input type="number" id="st-lvmpage" min="1" max="16" value="1"></label><label class="field">slot<input type="number" id="st-lvmslot" min="1" max="16" value="' + (idx + 1) + '"></label><button type="button" class="btn sm" data-pick="modx">Use</button></div>' +
      '<div class="row tight"><button type="button" class="btn sm" data-pick="clear">Clear slot</button></div></div>';
    els.lvpick.hidden = false;
  }
  function closePicker() { picking = null; if (els.lvpick) els.lvpick.hidden = true; }

  function onClick(e) {
    var t = e.target, b, d = data();
    if (t.closest('#st-lvpnew')) { var pn = window.prompt('Name the new profile', 'Profile ' + (profiles().length + 1)); if (pn == null) return; newProfile(pn, false); toast('Profile ' + pn + ' — empty, yours to fill'); return; }
    if (t.closest('#st-lvpdup')) { var pd = window.prompt('Name the copy', (activeProfile() ? activeProfile().name : 'My setup') + ' copy'); if (pd == null) return; newProfile(pd, true); return; }
    if (t.closest('#st-lvprename')) { var pr = activeProfile(); if (!pr) return; var pnn = window.prompt('Rename the profile', pr.name); if (pnn == null) return; renameProfile(pnn); return; }
    if (t.closest('#st-lvpdel')) { var pa = activeProfile(); if (!pa) return; if (!window.confirm('Delete the profile "' + pa.name + '" with its sounds and sets?')) return; deleteProfile(); return; }
    if (t.closest('#st-lvpexport')) { exportProfile(); return; }
    if (t.closest('#st-lvnew')) { var n = window.prompt('Name the set', d.sets.length ? 'Set ' + (d.sets.length + 1) : 'My set'); if (n == null) return; var s0 = { id: uid(), name: n.trim() || 'Set', pages: [emptyPage()] }; d.sets.push(s0); d.active = s0.id; d.page = 0; d.slot = null; save(d); render(); return; }
    var s = active(d); if (!s) return;
    if (t.closest('#st-lvrename')) { var nn = window.prompt('Rename the set', s.name); if (nn == null) return; s.name = nn.trim().slice(0, 40) || s.name; save(d); render(); return; }
    if (t.closest('#st-lvdel')) { if (!window.confirm('Delete the set "' + s.name + '"? The presets stay in your Sounds.')) return; d.sets = d.sets.filter(function (x) { return x.id !== s.id; }); d.active = d.sets.length ? d.sets[0].id : null; d.page = 0; d.slot = null; save(d); render(); return; }
    if (t.closest('#st-lvedit')) { editing = !editing; closePicker(); render(); return; }
    if (t.closest('#st-lvgo')) { setLive(true); return; }
    if (t.closest('#st-lvexit')) { setLive(false); return; }
    if (t.closest('#st-lvlock')) { locked = !locked; render(); return; }
    if (t.closest('#st-lvfs')) { learnFs = !learnFs; render(); return; }
    if (t.closest('#st-lvfsclr')) { set('fsCC', null); render(); return; }
    if (t.closest('#st-lvpprev')) { d.page = Math.max(0, d.page - 1); save(d); render(); return; }
    if (t.closest('#st-lvpnext')) { d.page = Math.min(s.pages.length - 1, d.page + 1); save(d); render(); return; }
    if (t.closest('#st-lvpadd')) { if (s.pages.length >= 16) return toast('16 pages is the most'); s.pages.push(emptyPage()); d.page = s.pages.length - 1; save(d); render(); return; }
    if (t.closest('#st-lvprev')) { debounced(-1); return; }
    if (t.closest('#st-lvnextb')) { debounced(1); return; }
    if (t.closest('#st-lvpanic')) { var p = P(); if (p && p.panic()) toast('All notes off, sustain off, on every channel'); return; }
    if ((b = t.closest('[data-pick]'))) {
      var page = pageOf(d), act = b.dataset.pick;
      if (act === 'close') { closePicker(); return; }
      if (picking == null) return;
      if (act === 'preset') page[picking] = { preset: b.dataset.id };
      else if (act === 'modx') page[picking] = { modx: { lsb: Math.max(0, Math.min(15, (parseInt(q('#st-lvmpage').value, 10) || 1) - 1)), pc: Math.max(1, Math.min(16, parseInt(q('#st-lvmslot').value, 10) || 1)) } };
      else if (act === 'clear') page[picking] = null;
      save(d); closePicker(); render(); return;
    }
    if ((b = t.closest('[data-slot]'))) {
      var idx = +b.dataset.slot;
      if (editing) { openPicker(idx); return; }
      if (locked) return; // locked: pointer hold handles it
      var pg = pageOf(d); if (!pg[idx]) { if (!live) { editing = true; render(); openPicker(idx); } return; }
      go(d, idx); return;
    }
  }
  // locked: a slot loads only after a 400 ms hold
  function onDown(e) {
    if (!locked || editing) return;
    var b = e.target.closest ? e.target.closest('[data-slot]') : null; if (!b) return;
    holdSlot = +b.dataset.slot; clearTimeout(holdT);
    holdT = setTimeout(function () { holdT = 0; var d = data(), pg = pageOf(d); if (pg && pg[holdSlot]) go(d, holdSlot); holdSlot = null; }, 400);
  }
  function onUp() { if (holdT) { clearTimeout(holdT); holdT = 0; } holdSlot = null; }

  function setLive(on) {
    live = !!on; closePicker(); editing = false;
    document.documentElement.classList.toggle('st-live', live);
    if (App.wake) { try { if (live) App.wake('synthlive'); else if (App.wake.release) App.wake.release('synthlive'); } catch (e) { /* no wake lock here */ } }
    if (live && App.showBar) { /* the bar is hidden by css while live */ }
    render();
  }

  App.register('liveset', {
    init: function (el) {
      root = el;
      App.injectCSS('synthlive',
        '.st-lvtop{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px}.st-lvsel{flex:1;min-width:140px}.st-lvsel select{min-height:44px;width:100%}.st-lvgap{flex:1}.st-lvtop .btn{min-height:44px}' +
        '.st-lvopts{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.st-lvopts .btn{min-height:40px}' +
        '.st-lvprof{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px}.st-lvprof select{min-height:40px;max-width:200px}.st-lvprof .btn{min-height:40px}' +
        '.st-lvpager{display:flex;gap:8px;align-items:center;margin:4px 0 8px}.st-lvpager .btn{min-width:44px;min-height:44px}' +
        '.st-lvgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}' +
        '.st-lvslot{min-height:64px;padding:8px;border-radius:12px;border:1px solid var(--line);background:var(--card-2,rgba(255,255,255,.04));color:var(--text);text-align:left;display:grid;gap:2px;align-content:start;font:inherit;touch-action:manipulation}' +
        '.st-lvslot.empty{border-style:dashed;color:var(--muted)}.st-lvslot.active{border-color:var(--accent-line);background:var(--accent-soft)}.st-lvn{font-size:11px;color:var(--muted)}.st-lvname2{font-weight:600;font-size:13px;overflow-wrap:anywhere}.st-lvsub{font-size:11px;color:var(--muted)}' +
        '.st-lvempty{display:grid;gap:10px}.st-lvempty .st-big{justify-self:start;min-height:48px}' +
        '.st-lvpick{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}.st-lvpick[hidden]{display:none}' +
        '.st-lvpickcard{width:100%;max-width:560px;max-height:90vh;overflow:auto;display:grid;gap:10px;border-radius:20px 20px 0 0}@media (min-width:700px){.st-lvpick{align-items:center}.st-lvpickcard{border-radius:16px}}' +
        '.st-lvpickhead{display:flex;justify-content:space-between;align-items:center}.st-lvpicklist{display:grid;gap:6px;max-height:40vh;overflow:auto}.st-lvpickitem{min-height:48px;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--text);text-align:left;display:grid;gap:2px;font:inherit}' +
        '.st-lvpickmodx{display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}.st-lvpickmodx input{width:70px;min-height:44px}' +
        '.st-lvstage{display:grid;gap:8px;margin-bottom:10px}.st-lvstagetop{display:flex;justify-content:space-between;align-items:center;gap:8px}.st-lvstagetop .btn{min-height:44px}' +
        '.st-lvnow{border:2px solid var(--accent);padding:14px 16px;display:grid;gap:2px}.st-lvkick{font-size:12px;letter-spacing:1px;color:var(--accent-ink);font-weight:600}.st-lvname{font:600 36px/1.05 var(--font-condensed);overflow-wrap:anywhere}' +
        '.st-lvnext{padding:8px 12px;border-radius:10px;border:1px solid var(--line)}' +
        '.st-lvacts{display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:8px;margin-top:10px}.st-lvacts .st-big{min-height:60px;font-size:18px}.st-panic{border-color:#7a2e2a;color:#ffb3ad;background:#2a1414}' +
        '.st-lvhint{margin:8px 0 0;text-align:center}' +
        'html.st-live .topbar,html.st-live #tabbar-m,html.st-live .foot{display:none!important}html.st-live #panel-liveset{padding-top:8px}');
      el.addEventListener('click', onClick);
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      el.addEventListener('change', function (e) {
        if (e.target.id === 'st-lvset') { var d = data(); d.active = e.target.value; d.page = 0; d.slot = null; save(d); render(); }
        else if (e.target.id === 'st-lvprofile') { if (e.target.value) switchProfile(e.target.value); }
        else if (e.target.id === 'st-lvpimport') { var f = e.target.files && e.target.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { try { importProfile(JSON.parse(rd.result)); } catch (x) { toast('Not a soundLAB profile file'); } }; rd.readAsText(f); e.target.value = ''; }
        else if (e.target.id === 'st-lvoct') set('octStep', !!e.target.checked);
      });
      // a foot switch: learn its CC once, then every press steps the set
      App.on('midi:raw', function (d) {
        var b = d && d.bytes; if (!b || (b[0] & 0xF0) !== 0xB0 || b.length < 3) return;
        if (learnFs && App.active === 'liveset') { learnFs = false; set('fsCC', b[1]); toast('Foot switch: CC ' + b[1]); render(); return; }
        var fs = g('fsCC', null); if (fs == null || b[1] !== fs || b[2] === 0) return;
        if (App.active === 'liveset' || App.active === 'deck') debounced(1);
      });
      // a LUMI's octave buttons (option): down = previous, up = next
      App.on('midi:range', function (r) {
        if (!r || !r.lumi || r.prev == null || !g('octStep', false)) return;
        if (App.active !== 'liveset' && App.active !== 'deck') return;
        debounced(r.lo > r.prev ? 1 : -1);
      });
      render();
    },
    onShow: function () { if (App.midi && App.midi.mute) App.midi.mute('synthlive', App.store.get('midihub.hear', false) !== true); render(); },
    onHide: function () { if (live) setLive(false); closePicker(); learnFs = false; if (App.midi && App.midi.mute) App.midi.mute('synthlive', false); },
    onBack: function () { if (picking != null) { closePicker(); return true; } if (live) { setLive(false); return true; } if (editing) { editing = false; render(); return true; } return false; }
  });

  window.SLSynthLive = { // for the Deck's grid and the tests
    data: data, active: function () { return active(); }, page: function () { var d = data(); return pageOf(d); }, pageIndex: function () { return data().page; }, slot: function () { return data().slot; },
    go: function (i) { return go(data(), i); }, step: step, setLive: setLive, get live() { return live; }, get locked() { return locked; }, lock: function (on) { locked = !!on; render(); },
    slotName: slotName, slotBadges: slotBadges, render: render,
    profiles: profiles, profile: activeProfile, newProfile: newProfile, switchProfile: switchProfile, exportProfile: exportProfile, importProfile: importProfile
  };
})();
