/* soundLAB Practice plan. Teacher text stays local; rules are intentionally
 * deterministic and conservative. No network requests or credential handling.
 * Plan/session data belongs to pp.*; other modules' progress is read-only. */
(function () {
  'use strict';

  // The single mapping table. Specific scale/hand/octave matching is below;
  // a matching word is never permission to invent an unsupported exercise.
  var RULES = [
    { id: 'tune', match: /\b(tun(?:e|er|ing))\b/i, title: 'Tune up', page: 'tuner', kind: 'warm-up', area: 'Tuner', minutes: 2 },
    { id: 'scale', match: /\b(scales?|pentatonic|arpeggios?)\b/i, title: 'Scale technique', page: 'piano', kind: 'technique', area: 'Keys', minutes: 5 },
    { id: 'hanon', match: /\b(hanon|rudiments?|paradiddles?)\b/i, title: 'Technique in Woodshed', page: 'shed', kind: 'technique', area: 'Woodshed', minutes: 5 },
    { id: 'chords', match: /\b(chords?|triads?|voicings?|progressions?|cadences?)\b/i, title: 'Chord practice', page: 'chords', kind: 'technique', area: 'Chords', minutes: 4 },
    { id: 'jam', match: /\b(jam|improvis(?:e|ation)|backing track)\b/i, title: 'Play with the band', page: 'jam', kind: 'repertoire', area: 'Jam', minutes: 5 },
    { id: 'piece', match: /\b(song|piece|repertoire|bars?\s+\d|measures?\s+\d)\b/i, title: 'Assigned piece', page: 'shed', kind: 'repertoire', area: 'Woodshed', minutes: 5 },
    { id: 'ear', match: /\b(ear training|intervals?|note names?|key signatures?|theory|quiz|exercises?)\b/i, title: 'Ear & theory', page: 'quiz', kind: 'ear / theory', area: 'Exercises', minutes: 3 },
    { id: 'warm', match: /\b(warm[ -]?up)\b/i, title: 'Warm up on the scale', page: 'fretboard', kind: 'warm-up', area: 'Guitar', minutes: 3 }
  ];
  var ORDER = { 'warm-up': 0, technique: 1, repertoire: 2, 'ear / theory': 3 };
  var rootEl, pending = null, uiTimer = null, message = '', refreshing = false;
  var MAX_TEXT = 128 * 1024;
  var INSTRUMENTS = ['piano', 'synth', 'guitar', 'bass', 'drums', 'voice', 'other'];
  function instrument() { return App.practiceInstrument ? App.practiceInstrument.get() : 'piano'; }
  function category(id) { return id === 'keys' ? 'piano' : INSTRUMENTS.indexOf(id) >= 0 ? id : null; }
  function label(id) { return id === 'shared' ? 'Shared theory / reference' : id === 'keys' ? 'Legacy keyboard context' : id === 'legacy' ? 'Legacy / unassigned' : App.practiceInstrument ? App.practiceInstrument.label(id) : id; }
  function itemInstrument(item, plan) {
    if (item.instrument) return item.instrument;
    if (item.page === 'quiz' || item.page === 'chords' || item.page === 'tuner') return 'shared';
    if (item.page === 'fretboard') return 'guitar';
    if (item.lessonId || item.page === 'piano') return plan.instrument === 'synth' ? 'synth' : plan.instrument === 'piano' ? 'piano' : 'keys';
    return plan.instrument === 'keys' ? 'keys' : category(plan.instrument) || 'legacy';
  }
  function compatible(item, plan, selected) { var id = itemInstrument(item, plan); return id === 'shared' || id === selected || id === 'keys' && (selected === 'piano' || selected === 'synth'); }
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function arr(k) { var a = App.store.get(k, []); return Array.isArray(a) ? a : []; }
  function obj(k) { var a = App.store.get(k, {}); return a && typeof a === 'object' && !Array.isArray(a) ? a : {}; }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  function dayKey() { return App.practiceProgress ? App.practiceProgress.dayKey(Date.now()) : App.xp.dayKey(); }
  function students() {
    var all = arr('pp.students');
    if (!all.length) { all = [{ id: 'self', name: 'My practice', docUrl: '', instrument: instrument(), plan: starter() }]; App.store.set('pp.students', all); }
    return all;
  }
  function student() { var all = students(), id = App.store.get('pp.active', all[0].id); return all.filter(function (s) { return s.id === id; })[0] || all[0]; }
  function saveStudent(s) { var all = students(); all = all.map(function (u) { return u.id === s.id ? s : u; }); App.store.set('pp.students', all); }
  function validLink(value) {
    if (!value.trim()) return '';
    try { var u = new URL(value.trim()); if (u.protocol === 'https:' && u.hostname === 'docs.google.com' && /^\/document\/(?:u\/\d+\/)?d\/[A-Za-z0-9_-]+(?:\/|$)/.test(u.pathname)) return u.origin + u.pathname; } catch (e) { /* invalid */ }
    throw new Error('Use an https://docs.google.com/document/d/… link, or leave it blank.');
  }
  function context(text) {
    text = text.replace(/\b([A-G])(?:\s+|-)(flat|sharp)\b/ig, function (_, note, accidental) { return note + (accidental.toLowerCase() === 'flat' ? 'b' : '#'); });
    var keyPattern = /\b([A-G])([#b♯♭]?)\s*(?:harmonic\s+minor|melodic\s+minor|natural\s+minor|major|minor|blues|pentatonic|ionian|dorian|phrygian|lydian|mixolydian|aeolian|locrian|scale|arpeggio)/ig;
    var keys = Array.from(text.matchAll(keyPattern)), key = keys[0];
    var root = key ? ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[key[1].toUpperCase()] + (/^[#♯]$/.test(key[2]) ? 1 : /^[b♭]$/.test(key[2]) ? -1 : 0) + 12) % 12 : +App.store.get('fb.root', 0);
    var scale = /harmonic\s+minor/i.test(text) ? 'harmonicMinor' : /melodic\s+minor/i.test(text) ? 'melodicMinor' : /minor\s+pentatonic/i.test(text) ? 'minorPent' : /(?:major\s+)?pentatonic/i.test(text) ? 'majorPent' : /blues/i.test(text) ? 'blues' : /phrygian\s+dominant/i.test(text) ? 'phrygDom' : /\bdorian\b/i.test(text) ? 'dorian' : /\bmixolydian\b/i.test(text) ? 'mixolydian' : /\bphrygian\b/i.test(text) ? 'phrygian' : /\blydian\b/i.test(text) ? 'lydian' : /\blocrian\b/i.test(text) ? 'locrian' : /minor|aeolian/i.test(text) ? 'aeolian' : 'major';
    var bpm = text.match(/\b(\d{2,3})\s*bpm\b/i) || text.match(/\bbpm\s*[:=]?\s*(\d{2,3})\b/i);
    var mins = text.match(/\b(\d{1,2})\s*(?:min(?:ute)?s?)\b/i);
    var help = text.match(/\bhelp\s*(?:level\s*)?([0-4])\b/i);
    return { root: root, scale: scale, bpm: bpm ? Math.max(30, Math.min(280, +bpm[1])) : +App.store.get('met.bpm', 80), minutes: mins ? Math.max(1, Math.min(60, +mins[1])) : null, help: help ? +help[1] : null, ambiguous: keys.length > 1 };
  }
  function mapText(text, options) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Paste lesson notes first.');
    if (text.length > MAX_TEXT) throw new Error('Keep lesson notes under 128 KB.');
    options = options || {};
    var items = [], gaps = [], seen = {}, selected = category(options.instrument) || instrument();
    function gap(source, reason) { gaps.push({ id: hash(source + '|' + reason), source: source, reason: reason }); }
    function add(source, rule, c, extra) {
      var item = Object.assign({ source: source, instrument: ['quiz','chords','tuner'].indexOf(rule.page) >= 0 ? 'shared' : selected, title: rule.title, page: rule.page, kind: /warm[ -]?up/i.test(source) ? 'warm-up' : rule.kind, area: rule.area, minutes: c.minutes || rule.minutes, root: c.root, scale: c.scale, bpm: c.bpm, help: c.help }, extra || {});
      item.id = 'pp-' + hash(JSON.stringify([source, item.instrument, item.page, item.lessonId || '', item.root, item.scale, item.bpm, item.minutes, item.help]));
      items.push(item);
    }
    text.split(/\r?\n|;/).forEach(function (line) {
      var source = line.replace(/^\s*#{1,6}\s+/, '').replace(/^\s*(?:[-*•]+|\d+[.)])\s*/, '').trim();
      if (!source || /^(?:lesson|practice|homework|notes|warm[ -]?up|technique|repertoire|ear|theory)(?:\s+notes)?\s*[:：]?$/i.test(source) || /^https?:\/\//i.test(source)) return;
      if (seen[source.toLowerCase()]) return; seen[source.toLowerCase()] = true;
      var c = context(source), rule = RULES.filter(function (r) { return r.match.test(source); })[0];
      if (c.ambiguous) { gap(source, 'Split assignments with multiple keys onto separate lines so each block has one setup.'); return; }
      if (/\b(sing|singing|vocal|sight[ -]?read|sight[ -]?sing|transcrib|pedal|embouchure|bowing)\w*/i.test(source)) { gap(source, 'No matching guided module for this assignment.'); return; }
      if (!rule) { gap(source, 'No matching guided module.'); return; }
      if (rule.id === 'scale') {
        var octaveRequest = source.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)[ -]?octave/i);
        if (/contrary\s+motion|double[ -]?(?:sharp|flat)|quarter[ -]?tone|\b(?:staccato|legato|trills?|polyrhythm|bebop|altered|microtonal|octatonic)\b|\b(?:in|by)\s+(?:seconds|fourths|fifths|sixths|sevenths|octaves|ninths|tenths|[2456789](?:nd|th)s?)\b/i.test(source) || (octaveRequest && !/^(?:1|2|one|two)$/i.test(octaveRequest[1]))) { gap(source, 'This explicit technique or octave range has no matching guided lesson.'); return; }
        if (/arpeggio/i.test(source)) { gap(source, 'No graded arpeggio lesson is available through the current lesson hook.'); return; }
        if (/chromatic|whole[ -]?tone|diminished/i.test(source)) { gap(source, 'This scale has no matching guided lesson.'); return; }
        if (selected === 'guitar' || /guitar|fretboard/i.test(source)) {
          add(source, rule, c, { instrument: 'guitar', page: 'fretboard', area: 'Guitar', title: 'Guitar scale', setup: 'Runner uses the shared key, scale and tempo. This casual tool has no automated progress timer.' }); return;
        }
        if (selected !== 'piano' && selected !== 'synth') { gap(source, 'No matching guided scale lesson for the selected ' + label(selected) + ' category.'); return; }
        if (/hands?\s+together|both\s+hands\s+together/i.test(source)) { gap(source, 'Keys lessons currently train one hand at a time.'); return; }
        var hands = /hands?\s+separate|both\s+hands|RH\s*(?:then|and|\/)\s*LH/i.test(source) ? ['right', 'left'] : [/left\s+hand|\bLH\b/i.test(source) ? 'left' : 'right'];
        var oct = /(?:two|2)[ -]?octave/i.test(source) ? 2 : 1;
        var pat = /3rds|thirds/i.test(source) ? 'i3' : 'scale';
        hands.forEach(function (hand) {
          var lesson = App.keysLessons.LESSONS.filter(function (l) { return l.root === c.root && l.scale === c.scale && l.hand === hand && l.oct === oct && l.pat === pat; })[0];
          if (!lesson) { gap(source, 'No Keys lesson for ' + (hand === 'right' ? 'RH' : 'LH') + ', ' + oct + ' octave(s), in this key and scale.'); return; }
          add(source, rule, c, { lessonId: lesson.id, title: lesson.name + ' · ' + (hand === 'right' ? 'RH' : 'LH'), setup: 'Opens this hand and octave range. Uses the lesson’s saved speed level.' });
        });
        if (/\blevel\s*\d|\bbpm\b/i.test(source.replace(/help\s*(?:level\s*)?[0-4]/ig, ''))) gap(source, 'Exact lesson speed/level needs selection in Keys; no public setup hook exists.');
        return;
      }
      var setup = rule.page === 'shed' ? 'Choose or import the assigned piece/exercise in Woodshed, then start a run.' : rule.page === 'quiz' ? 'Choose the matching topic or ear mode in Exercises; answer time is measured.' : rule.page === 'tuner' ? 'Press Start in Tuner when ready. Tuner accuracy is not recorded.' : 'Shared key and tempo are applied. Choose the requested voicing or pattern here.';
      if (rule.page === 'fretboard' && selected !== 'guitar') { gap(source, 'This warm-up hook opens the six-string guitar fretboard; choose a matching instrument-specific exercise instead.'); return; }
      add(source, rule, c, { setup: setup });
      if (rule.page === 'shed') gap(source, 'Direct selection/import of this score needs a Woodshed setup hook.');
      if (rule.page === 'quiz' && /ear|interval|key signature/i.test(source)) gap(source, 'Exact Exercises topic/ear-mode selection needs a public setup hook.');
    });
    items.sort(function (a, b) { return ORDER[a.kind] - ORDER[b.kind]; });
    return { id: 'plan-' + hash(JSON.stringify([text, selected, items.map(function (i) { return i.id; })])), source: text, instrument: selected, items: items, gaps: gaps, acceptedAt: null };
  }
  function starter() {
    var selected = instrument(), c = context(''), rows = [
      { id: 'pp-starter-tune', instrument: 'shared', title: 'Tune up', page: 'tuner', area: 'Tuner', kind: 'warm-up', minutes: 2 },
      { id: 'pp-starter-piece', title: 'Work on your piece', page: 'shed', area: 'Woodshed', kind: 'repertoire', minutes: 5, setup: 'Choose or import your piece in Woodshed.' },
      { id: 'pp-starter-ear', instrument: 'shared', title: 'Ear & theory', page: 'quiz', area: 'Exercises', kind: 'ear / theory', minutes: 3, setup: 'Choose an available topic for the current Learn category.' }
    ];
    if (selected === 'piano' || selected === 'synth') rows.splice(1, 0, { id: 'pp-starter-keys', title: 'C major · RH', page: 'piano', lessonId: 'c-r', area: 'Keys', kind: 'technique', minutes: 5, root: 0 });
    if (selected === 'guitar') rows.splice(1, 0, { id: 'pp-starter-warm', title: 'Warm up on the neck', page: 'fretboard', area: 'Guitar', kind: 'warm-up', minutes: 3 });
    return { id: 'starter-' + selected, instrument: selected, source: '', items: rows.map(function (r) { return Object.assign({ instrument: selected }, c, r, { source: 'Suggested starter — replace with your teacher’s notes.' }); }), gaps: [], acceptedAt: null };
  }
  function session(s, selected) {
    selected = selected || instrument();
    var all = obj('pp.sessions'), key = s.id + '/' + dayKey() + '/' + s.plan.id + '/' + selected;
    if (!all[key]) { all[key] = { key: key, day: dayKey(), student: s.id, plan: s.plan.id, instrument: selected, items: {} }; App.store.set('pp.sessions', all); }
    return all[key];
  }
  function saveSession(sess) {
    var all = obj('pp.sessions'); all[sess.key] = sess;
    // Keep 90 local days; historical plan evidence is independent of new notes.
    var cutoff = App.xp.addDays(dayKey(), -90);
    Object.keys(all).forEach(function (k) { if (all[k].day < cutoff) delete all[k]; });
    App.store.set('pp.sessions', all);
  }
  function telemetry(item, selected) {
    var history = App.practiceProgress ? App.practiceProgress.history(selected) : [];
    var records = history.filter(function (r) {
      if (item.lessonId) return r.mode === 'keys:' + item.lessonId;
      if (item.page === 'quiz') return r.mode === 'knowledge';
      if (item.page === 'shed') return ['wait', 'tempo', 'woodshed'].indexOf(r.mode) >= 0;
      return false;
    });
    var scoped = obj('qz.instrumentProg')[selected];
    return { ids: records.map(function (r) { return r.id; }), records: records, quiz: copy(scoped && typeof scoped === 'object' ? scoped : {}) };
  }
  function refresh() {
    if (refreshing) return; refreshing = true;
    try {
      var running = App.store.get('pp.running', null);
      if (!running) return;
      var s = students().filter(function (u) { return u.id === running.student; })[0];
      if (!s || INSTRUMENTS.indexOf(running.instrument) < 0 || running.day !== dayKey() || s.plan.id !== running.plan) { App.store.set('pp.running', null); return; }
      var item = s.plan.items.filter(function (i) { return i.id === running.item; })[0];
      if (!item) return;
      var sess = session(s, running.instrument), st = sess.items[item.id], now = telemetry(item, running.instrument), base = running.base;
      if (!st || st.done) return;
      var fresh = now.records.filter(function (r) { return base.ids.indexOf(r.id) < 0 && r.startedAt >= Date.parse(running.startedAt); });
      st.seconds = (running.previous || 0) + fresh.reduce(function (total, r) { return total + r.engagedSeconds; }, 0);
      st.instrument = running.instrument;
      st.sessionIds = (running.previousIds || []).concat(fresh.map(function (r) { return r.id; })).filter(function (id, index, all) { return all.indexOf(id) === index; });
      var reason = '';
      if (item.lessonId && fresh.some(function (r) { return r.status === 'complete' && r.matched > 0; })) reason = 'New ' + label(running.instrument) + ' Keys lesson session recorded';
      if (item.page === 'quiz' && Object.keys(now.quiz).some(function (id) { return (now.quiz[id].b || 0) >= 8 && (!base.quiz[id] || now.quiz[id].b > base.quiz[id].b); })) reason = 'New passing ' + label(running.instrument) + ' Exercises result recorded';
      if (item.page === 'shed' && fresh.some(function (r) { return r.status === 'complete' && (r.matched > 0 || r.engagedSeconds > 0); })) reason = 'New ' + label(running.instrument) + ' Woodshed session recorded';
      if (st.seconds >= item.minutes * 60) reason = 'Active practice time reached';
      if (reason) { st.done = true; st.reason = reason; st.completedAt = new Date().toISOString(); App.store.set('pp.running', null); }
      saveSession(sess);
    } finally { refreshing = false; }
  }
  function launch(id) {
    refresh();
    var s = student(), item = s.plan.items.filter(function (i) { return i.id === id; })[0];
    if (!item) return false;
    var selected = instrument();
    if (!compatible(item, s.plan, selected)) { message = 'This block is preserved for ' + label(itemInstrument(item, s.plan)) + '. Choose that Learn category before launching.'; if (el('pp-status')) el('pp-status').textContent = message; return false; }
    var sess = session(s), st = sess.items[id] || { instrument: selected, done: false, seconds: 0, reason: '' };
    // the block last opened (the controller remote's Next / Back start
    // from it) lives in the day's record, so a reload keeps the place
    sess.items[id] = st; sess.last = id; saveSession(sess);
    var observed = !!item.lessonId || item.page === 'quiz' || item.page === 'shed';
    App.store.set('pp.running', st.done || !observed ? null : { student: s.id, instrument: selected, day: dayKey(), plan: s.plan.id, item: id, base: telemetry(item, selected), previous: st.seconds, previousIds: st.sessionIds || [], startedAt: new Date().toISOString() });
    App.store.set('met.bpm', item.bpm); App.emit('tempo', { bpm: item.bpm, source: 'practiceplan' });
    App.emit('fb:set', { root: item.root, scale: item.scale, source: 'practiceplan' });
    if (item.help != null && App.help) App.help.set(item.help);
    if (item.page === 'fretboard') App.emit('fb:practice', { root: item.root, scale: item.scale, bpm: item.bpm });
    else { App.switchTo(item.page); if (item.lessonId) App.keysLessons.open(item.lessonId, selected); }
    return true;
  }
  // CONTROLLER REMOTE (js/remote.js, app.js onRemote). NEXT opens the next
  // block not measured complete: the first one after the block last opened
  // from here, else the first one (casual tools never complete, so 'the first
  // not done' alone would reopen the same Tuner block forever). BACK opens
  // the last block again. No Stop: the plan has no run of its own. Typed
  // text a launch would wipe (paint() refills the fields on return) holds
  // the pedal back: a foot bumped while writing lesson notes loses nothing.
  function unsaved(s) {
    if (el('pp-notes') && el('pp-notes').value !== (s.plan.source || '')) return (pending ? 'Accept' : 'Review') + ' or clear your lesson notes first';
    if (el('pp-link') && el('pp-link').value.trim() !== (s.student.docUrl || '')) return 'Review or clear the Google Doc link first';
    return '';
  }
  function remote(action) {
    var s = state(), items = s.availableItems, last = -1, item = null;
    items.forEach(function (i, n) { if (i.id === s.session.last) last = n; });
    if (action === 'next') {
      var open = items.filter(function (i) { return !(s.session.items[i.id] && s.session.items[i.id].done); });
      item = open.filter(function (i) { return items.indexOf(i) > last; })[0] || open[0];
    } else if (action === 'back' && last >= 0) item = items[last];
    if (!item) return false;
    var why = unsaved(s);
    if (why) { if (App.toast) App.toast(why); return false; }
    return launch(item.id) ? (action === 'next' ? 'Block: ' : 'Again: ') + item.title : false;
  }
  function preview(text, options) { pending = mapText(text, options); paintPreview(); return copy(pending); }
  function accept() {
    if (!pending) return false;
    var s = student(), link = el('pp-link') ? validLink(el('pp-link').value) : s.docUrl;
    refresh(); App.store.set('pp.running', null);
    if (s.plan && s.plan.id !== pending.id) { var archive = arr('pp.history'); archive.push({ student: s.id, plan: s.plan, archivedAt: new Date().toISOString() }); App.store.set('pp.history', archive.slice(-40)); }
    s.plan = copy(pending); s.plan.acceptedAt = new Date().toISOString(); s.instrument = pending.instrument; s.docUrl = link; saveStudent(s);
    var all = arr('pp.gaps');
    pending.gaps.forEach(function (g) {
      var id = s.id + '/' + g.id, old = all.filter(function (u) { return u.id === id; })[0];
      if (!old) { old = Object.assign({}, g, { id: id, student: s.id, count: 0, plans: [] }); all.push(old); }
      if (old.plans.indexOf(pending.id) < 0) { old.count++; old.plans.push(pending.id); old.lastSeen = s.plan.acceptedAt; }
    });
    App.store.set('pp.gaps', all); pending = null; message = 'Plan accepted. Notes and progress are saved on this device.'; paint(); return true;
  }
  function state() { refresh(); var s = student(), selected = instrument(); return copy({ student: s, instrument: selected, plan: s.plan, session: session(s), availableItems: s.plan.items.filter(function (i) { return compatible(i, s.plan, selected); }), preservedItems: s.plan.items.filter(function (i) { return !compatible(i, s.plan, selected); }), gaps: arr('pp.gaps').filter(function (g) { return g.student === s.id; }), week: App.practiceProgress ? App.practiceProgress.summary(selected, { rangeDays: 7 }).daily : [] }); }
  function textFromJSON(value) {
    if (typeof value === 'string') return value;
    var parts = [], nodes = 0;
    function walk(v, depth) {
      if (!v || depth > 30 || nodes++ > 20000) return;
      if (Array.isArray(v)) { v.forEach(function (x) { walk(x, depth + 1); }); return; }
      if (typeof v !== 'object') return;
      if (v.textRun && typeof v.textRun.content === 'string') { parts.push(v.textRun.content); return; }
      ['body', 'content', 'elements', 'paragraph', 'table', 'tableRows', 'tableCells', 'tabs', 'documentTab', 'childTabs'].forEach(function (k) { if (v[k]) walk(v[k], depth + 1); });
    }
    walk(value, 0);
    if (!parts.length) throw new Error('No Google Docs text runs found. Export as plain text instead.');
    return parts.join('');
  }
  function downloadGaps() {
    var s = state(), data = { version: 1, student: s.student.name, exportedAt: new Date().toISOString(), gaps: s.gaps };
    var url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = 'soundlab-module-gaps-' + dayKey() + '.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function paintPreview() {
    if (!el('pp-preview')) return;
    el('pp-preview').hidden = !pending;
    if (!pending) return;
    el('pp-preview').innerHTML = '<h3>Review before accepting</h3><p>' + pending.items.length + ' practice blocks · ' + pending.gaps.length + ' gaps</p><ol>' + pending.items.map(function (i) { return '<li><b>' + esc(i.title) + '</b> · ' + i.minutes + ' min<br><span class="pp-muted">Doc: “' + esc(i.source) + '”</span></li>'; }).join('') + '</ol>' + (pending.gaps.length ? '<p class="pp-muted">' + pending.gaps.map(function (g) { return esc(g.source) + ' — ' + esc(g.reason); }).join('<br>') + '</p>' : '') + '<button type="button" class="btn primary" id="pp-accept">Accept this plan</button>';
  }
  function replaceRegion(id, html) {
    var region = el(id), focused = document.activeElement, key = null;
    if (region.contains(focused)) key = focused.hasAttribute('data-pp-open') ? focused.getAttribute('data-pp-open') : focused.id;
    if (region.innerHTML === html) return;
    region.innerHTML = html;
    if (key) {
      var replacement = key.indexOf('pp-') === 0 && el(key) ? el(key) : region.querySelector('[data-pp-open="' + key + '"]');
      if (replacement) replacement.focus({ preventScroll: true });
    }
  }
  function paintProgress() {
    if (!rootEl) return;
    var s = state(), done = 0, total = s.availableItems.reduce(function (n, i) { return n + i.minutes; }, 0);
    replaceRegion('pp-today', '<div class="pp-heading"><div><h2>Today’s ' + esc(label(s.instrument)) + ' session</h2><p class="pp-muted">' + dayKey() + ' · ' + total + ' minutes suggested · accepted plan context: ' + esc(label(s.plan.instrument || 'legacy')) + '</p></div><button type="button" class="btn sm" id="pp-refresh">Refresh progress</button></div>' + (s.availableItems.length ? '<ol class="pp-blocks">' + s.availableItems.map(function (i, n) {
      var st = s.session.items[i.id] || { seconds: 0, done: false }; if (st.done) done++;
      var criterion = i.lessonId ? 'One new completed lesson session or ' + i.minutes + ' recorded playing minutes' : i.page === 'shed' ? 'One new completed run or ' + i.minutes + ' recorded playing minutes' : i.page === 'quiz' ? 'A new passing score or ' + i.minutes + ' recorded answering minutes' : 'No automated timer or completion is available for this casual tool; opening it earns no progress.';
      return '<li class="pp-block' + (st.done ? ' pp-done' : '') + '"><span class="pp-number" aria-label="' + (st.done ? 'Complete' : 'Step ' + (n + 1)) + '">' + (st.done ? '✓' : n + 1) + '</span><div class="pp-body"><span class="pp-kicker">' + esc(i.kind) + ' · ' + i.minutes + ' min</span><h3>' + esc(i.title) + '</h3><p class="pp-source">' + (s.plan.source ? 'Doc: “' + esc(i.source) + '”' : esc(i.source)) + '</p>' + (i.setup ? '<p class="pp-muted">' + esc(i.setup) + '</p>' : '') + '<p class="pp-evidence">' + (st.done ? esc(st.reason) : Math.floor(st.seconds) + ' seconds recorded · ' + criterion) + '</p></div><button type="button" class="btn' + (!st.done && n === done ? ' primary' : '') + '" data-pp-open="' + esc(i.id) + '">' + (st.done ? 'Open again' : st.seconds ? 'Continue' : 'Start') + '</button></li>';
    }).join('') + '</ol>' : '<p>No matching blocks for this Learn category. Your accepted plan is preserved below.</p>') + (s.preservedItems.length ? '<details id="pp-preserved"><summary>' + s.preservedItems.length + ' blocks preserved for other instrument contexts</summary><ul>' + s.preservedItems.map(function (i) { return '<li><b>' + esc(i.title) + '</b> · ' + esc(label(itemInstrument(i, s.plan))) + '<p class="pp-muted">' + esc(i.source) + '</p></li>'; }).join('') + '</ul></details>' : '') + '<p class="pp-muted">' + done + ' / ' + s.availableItems.length + ' matching blocks measured complete. Time comes from recorded sessions for ' + esc(label(s.instrument)) + '; opening a page earns no minutes or XP.</p>');
    var mins = s.week.reduce(function (n, d) { return n + (+d.engagedSeconds || 0); }, 0) / 60;
    var allSessions = obj('pp.sessions');
    el('pp-week').innerHTML = '<h3>Last seven days · ' + esc(label(s.instrument)) + '</h3><p>' + Math.round(mins) + ' recorded minutes · ' + s.week.filter(function (d) { return d.engagedSeconds > 0; }).length + ' observed days</p><div class="pp-week">' + s.week.map(function (d) {
      var count = 0; Object.keys(allSessions).forEach(function (k) { var se = allSessions[k]; if (se.student === s.student.id && se.instrument === s.instrument && se.day === d.date) Object.keys(se.items).forEach(function (id) { if (se.items[id].done) count++; }); });
      return '<div><b>' + esc(d.date.slice(5)) + '</b><span>' + Math.round((+d.engagedSeconds || 0) / 60) + ' min</span><small>' + count + ' blocks</small></div>';
    }).join('') + '</div><p class="pp-muted">Only this instrument’s canonical observations are counted. Legacy / unassigned history remains separate.</p>';
    replaceRegion('pp-gaps', '<div class="pp-heading"><h3>What soundLAB can’t do yet</h3><button type="button" class="btn sm" id="pp-export">Export gaps</button></div>' + (s.gaps.length ? '<ul>' + s.gaps.map(function (g) { return '<li><b>' + esc(g.source) + '</b><br>' + esc(g.reason) + ' <span class="pp-muted">(' + g.count + ' accepted plan' + (g.count === 1 ? '' : 's') + ')</span></li>'; }).join('') + '</ul>' : '<p class="pp-muted">No gaps recorded. Unmatched assignments appear here after you accept notes.</p>'));
  }
  function paint() {
    var s = student();
    el('pp-student').innerHTML = students().map(function (u) { return '<option value="' + esc(u.id) + '"' + (u.id === s.id ? ' selected' : '') + '>' + esc(u.name) + '</option>'; }).join('');
    el('pp-link').value = s.docUrl || ''; el('pp-instrument').value = instrument(); el('pp-notes').value = s.plan.source || '';
    el('pp-status').textContent = message;
    var a = el('pp-doc'); a.hidden = !s.docUrl; a.href = s.docUrl || '#';
    paintPreview(); paintProgress();
  }
  function error(e) { message = e.message || String(e); el('pp-status').textContent = message; }
  function init(box) {
    rootEl = box; App.injectCSS('practiceplan', CSS);
    box.innerHTML = '<div class="pp-wrap"><div class="pp-heading"><div><span class="pp-kicker">A little, every day</span><h1>Practice plan</h1><p class="pp-muted">Turn lesson notes into a clear next step.</p></div><button type="button" class="btn sm" id="pp-help">Lights & help</button></div><div class="pp-profile card"><label>Student <select id="pp-student"></select></label><label>New student <input id="pp-name" maxlength="60" placeholder="Name"></label><button type="button" class="btn" id="pp-add">Add student</button></div><div id="pp-today" class="card"></div><div id="pp-week" class="card"></div><details class="card pp-notes"><summary>Teacher’s lesson notes</summary><div class="pp-fields"><label>Current Learn instrument <select id="pp-instrument" disabled>' + INSTRUMENTS.map(function (id) { return '<option value="' + id + '">' + esc(label(id)) + '</option>'; }).join('') + '</select></label><label>Google Doc link (optional, saved locally)<input id="pp-link" type="url" placeholder="https://docs.google.com/document/d/…"></label><a id="pp-doc" target="_blank" rel="noopener noreferrer" hidden>Open saved lesson Doc</a><label>Paste notes, one assignment per line<textarea id="pp-notes" rows="7" placeholder="G major scale, hands separate, 5 min&#10;Practice your piece, 5 min&#10;Intervals, 3 min"></textarea></label><div class="pp-actions"><button type="button" class="btn primary" id="pp-review">Review mapping</button><label class="pp-import">Import text / Docs JSON <input id="pp-file" type="file" accept=".txt,.md,.json,text/plain,application/json"></label></div><p class="pp-muted">The link is a bookmark. Paste or export the Doc’s text to import it. Notes stay in this browser; nothing is fetched or uploaded.</p><div id="pp-preview" hidden></div></div></details><div id="pp-gaps" class="card"></div><p id="pp-status" role="status" aria-live="polite"></p></div>';
    box.addEventListener('click', function (e) {
      var target = e.target.closest('button'); if (!target) return;
      try {
        if (target.hasAttribute('data-pp-open')) launch(target.getAttribute('data-pp-open'));
        if (target.id === 'pp-review') { validLink(el('pp-link').value); preview(el('pp-notes').value, { instrument: el('pp-instrument').value }); }
        if (target.id === 'pp-accept') accept();
        if (target.id === 'pp-refresh') paintProgress();
        if (target.id === 'pp-help') App.switchTo('lights');
        if (target.id === 'pp-export') downloadGaps();
        if (target.id === 'pp-add') {
          var name = el('pp-name').value.trim(); if (!name) throw new Error('Enter the new student’s name.');
          refresh(); App.store.set('pp.running', null);
          var all = students(), id = 'student-' + Date.now().toString(36) + '-' + hash(name + all.length); all.push({ id: id, name: name, docUrl: '', instrument: instrument(), plan: starter() });
          App.store.set('pp.students', all); App.store.set('pp.active', id); pending = null; el('pp-name').value = ''; message = 'Student added. Progress for other students is preserved.'; paint();
        }
      } catch (err) { error(err); }
    });
    el('pp-student').addEventListener('change', function () { refresh(); App.store.set('pp.running', null); App.store.set('pp.active', this.value); pending = null; message = ''; paint(); });
    el('pp-file').addEventListener('change', async function () {
      var file = this.files[0]; if (!file) return;
      try { if (file.size > MAX_TEXT) throw new Error('Keep imported files under 128 KB.'); var text = await file.text(); if (/\.json$/i.test(file.name)) text = textFromJSON(JSON.parse(text)); el('pp-notes').value = text; preview(text, { instrument: el('pp-instrument').value }); message = 'Import ready to review. Accept it to replace the current plan.'; el('pp-status').textContent = message; } catch (err) { error(err); } finally { this.value = ''; }
    });
    App.on('xp', refresh);
    App.on('practiceprogress:changed', refresh);
    App.on('learn:instrument', function () {
      refresh(); App.store.set('pp.running', null); pending = null;
      message = 'Instrument changed. The previous block’s tracking ended; its original context and history are preserved.';
      paint();
    });
    document.addEventListener('visibilitychange', function () { refresh(); });
    paint();
  }
  var CSS = '.pp-wrap{max-width:960px;margin:0 auto;display:grid;gap:14px}.pp-wrap h1{margin:0;font-size:38px}.pp-wrap h2,.pp-wrap h3{margin:0 0 6px}.pp-wrap p{margin:5px 0}.pp-wrap .card{margin:0}.pp-heading,.pp-profile,.pp-actions{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.pp-kicker{font-size:12px;text-transform:uppercase;letter-spacing:1.2px;color:var(--accent)}.pp-muted{color:var(--muted);font-size:14px}.pp-profile label,.pp-fields label{display:grid;gap:6px;min-width:0;flex:1}.pp-wrap input,.pp-wrap select,.pp-wrap textarea{font:inherit;color:var(--text);background:var(--inset);border:1px solid var(--line);border-radius:8px;padding:10px;max-width:100%;min-width:0;width:100%;box-sizing:border-box}.pp-wrap textarea{resize:vertical;line-height:1.5}.pp-blocks{list-style:none;padding:0;margin:14px 0;display:grid;gap:10px}.pp-block{display:flex;gap:12px;align-items:center;border-top:1px solid var(--line);padding:15px 0 4px;overflow-wrap:anywhere}.pp-body{flex:1;min-width:0}.pp-number{display:grid;place-items:center;width:32px;height:32px;flex:none;border:1px solid var(--accent);border-radius:50%;color:var(--accent)}.pp-done .pp-number{background:var(--accent);color:var(--bg)}.pp-block h3{font-size:19px;margin-top:4px}.pp-source{font-size:14px;line-height:1.4}.pp-evidence{font-size:12px;color:var(--muted)}.pp-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin:14px 0}.pp-week>div{display:grid;gap:7px;background:var(--inset);border:1px solid var(--line);border-radius:8px;padding:10px 2px;text-align:center;font-size:13px}.pp-week small{font-size:11px;color:var(--muted)}.pp-notes summary{cursor:pointer;font-weight:600}.pp-fields{display:grid;gap:14px;padding-top:16px}.pp-import{font-size:13px;color:var(--muted);max-width:300px}.pp-wrap li{margin-bottom:10px}.pp-wrap a{color:var(--accent);overflow-wrap:anywhere}#pp-preview{border-top:1px solid var(--line);padding-top:15px}#pp-gaps{overflow-wrap:anywhere}#pp-status{font-size:14px;color:var(--accent);min-height:1em}@media(max-width:600px){.pp-wrap h1{font-size:30px}.pp-block{flex-wrap:wrap;gap:10px}.pp-block .btn{margin-left:42px;min-height:42px}.pp-block .pp-body{flex-basis:calc(100% - 44px)}.pp-week{gap:3px}.pp-week>div{font-size:11px;padding:8px 0}.pp-profile{align-items:end}.pp-profile label{flex-basis:100%}.pp-heading .btn{min-height:40px}.pp-wrap .card{padding:16px}}';
  // Keep this page's expanded Learn strip on one row on small screens. Scope
  // the integration style to the group containing this module; other groups
  // retain the shell's normal pill spacing and labels.
  CSS += '@media(max-width:600px){#subnav:has(.subtab[data-page="practiceplan"]) .subtab{padding-left:9px;padding-right:9px}}';
  App.practicePlan = { rules: RULES, preview: preview, accept: accept, state: state, refresh: refresh, launch: launch };
  App.register('practiceplan', { init: init, onShow: function () { paint(); if (!uiTimer) uiTimer = setInterval(paintProgress, 3000); }, onHide: function () { refresh(); clearInterval(uiTimer); uiTimer = null; }, onKey: function (e) { if (e.key === 'Escape' && pending) { pending = null; paintPreview(); } },
    onRemote: function (action) { return remote(action); },
    remoteKey: true // nothing on this page listens to the keys
  });
})();
