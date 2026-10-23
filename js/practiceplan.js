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
  var rootEl, pending = null, unsavedDraft = null, draftErrors = [], memoryDrafts = Object.create(null), draftBases = Object.create(null), planBases = Object.create(null), rawInputs = Object.create(null), unsavedRaw = Object.create(null), editingField = false, uiTimer = null, message = '', refreshing = false, editSerial = 0, importId = 0, importPending = null;
  var MAX_TEXT = 128 * 1024;
  var MAX_STEPS = 32, DRAFTS = 'pp.drafts.v1';
  var ACTIONS = { keysLesson: 'Keys lesson', quizLevel: 'Exercises level', guidedScore: 'Structured material', openTool: 'Open a tool / reference', needsSetup: 'Needs setup' };
  var TOOLS = { tuner: 'Tuner', quiz: 'Exercises', chords: 'Chords', theory: 'Circle', fretboard: 'Guitar fretboard', piano: 'Piano', synth: 'Synth', pads: 'Pads', jam: 'Jam', shed: 'Material library' };
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
  function compatible(item, plan, selected) {
    var id = itemInstrument(item, plan), matches = id === 'shared' || id === selected || id === 'keys' && (selected === 'piano' || selected === 'synth');
    return matches && !(item.action === 'quizLevel' && item.levelId && App.practiceInstrument && !App.practiceInstrument.allowsMode(item.levelId.split('/')[2], selected));
  }
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function arr(k) { var a = App.store.get(k, []); return Array.isArray(a) ? a : []; }
  function obj(k) { var a = App.store.get(k, {}); return a && typeof a === 'object' && !Array.isArray(a) ? a : {}; }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function draftKey() { return student().id + '/' + instrument(); }
  function writeChecked(key, value) {
    App.store.set(key, copy(value));
    if (JSON.stringify(App.store.get(key, null)) !== JSON.stringify(value)) throw new Error('Practice plan could not be saved. The previous accepted plan is unchanged; keep or export your draft.');
  }
  // localStorage has no multi-key transaction. Publish pp.students last and
  // restore earlier writes on failure; a failed write never reports acceptance.
  function writeBatch(changes) {
    var previous = {}, written = [];
    try {
      Object.keys(changes).forEach(function (key) { previous[key] = App.store.get(key, null); written.push(key); writeChecked(key, changes[key]); });
    } catch (error) {
      var uncertain = [];
      written.reverse().forEach(function (key) { try { App.store.set(key, previous[key]); if (JSON.stringify(App.store.get(key, null)) !== JSON.stringify(previous[key])) uncertain.push(key); } catch (e) { uncertain.push(key); } });
      if (uncertain.length) throw new Error('The plan save failed and some storage writes could not be restored. Export the draft before reloading; affected keys: ' + uncertain.join(', ') + '.');
      throw error;
    }
  }
  function lessons() { return App.keysLessons && Array.isArray(App.keysLessons.LESSONS) ? App.keysLessons.LESSONS : []; }
  function levels(all) { return window.SLQuiz && SLQuiz.levels ? SLQuiz.levels({ all: !!all }) : []; }
  function materials() { return arr('ws.lib').filter(function (score) { return score && typeof score.id === 'string' && Array.isArray(score.notes); }); }
  function materialFingerprint(score) {
    return window.PracticeMaterial && PracticeMaterial.fingerprint ? PracticeMaterial.fingerprint(score) : 'pp-' + hash(JSON.stringify([score.id, score.bpm, score.len, score.timingOk, score.notes]));
  }
  function resolveMaterial(id) {
    var matches = materials().filter(function (score) { return score.id === id; });
    return matches.length === 1 ? matches[0] : null;
  }
  function typed(item, plan, index) {
    var step = copy(item), defaults = context(''), lesson = lessons().filter(function (l) { return l.id === step.lessonId; })[0];
    ['root', 'scale', 'bpm', 'minutes'].forEach(function (field) { if (step[field] == null) step[field] = field === 'minutes' ? 5 : defaults[field]; });
    step.draftKey = step.draftKey || 'step-' + index + '-' + hash(step.source || step.title || '');
    step.sourceText = step.sourceText == null ? step.source || '' : step.sourceText;
    step.source = step.sourceText;
    step.action = step.action || (step.lessonId ? 'keysLesson' : step.page === 'shed' ? 'needsSetup' : 'openTool');
    step.instrument = step.instrument || itemInstrument(step, plan);
    step.hand = step.hand || (lesson && lesson.hand) || 'right';
    step.mode = step.mode || 'wait';
    step.lessonId = step.lessonId || ''; step.levelId = step.levelId || ''; step.materialId = step.materialId || '';
    if (typeof step.setup === 'string') step.setupText = step.setup;
    step.provenance = step.provenance || { ruleId: step.ruleId || 'manual', sourcePlanId: plan.id || null, sourceItemId: step.id || null };
    return deriveStep(step, plan);
  }
  function deriveStep(step, plan) {
    var limits = [], ready = true, lesson, material;
    // A changed action owns one target. Old lesson/material identifiers may
    // never drive launch or measurement after their control disappears.
    if (step.action !== 'keysLesson') step.lessonId = '';
    if (step.action !== 'quizLevel') step.levelId = '';
    if (step.action !== 'guidedScore') { step.materialId = ''; step.materialFingerprint = null; }
    if (step.action === 'keysLesson') {
      step.page = 'piano';
      lesson = lessons().filter(function (l) { return l.id === step.lessonId; })[0];
      ready = !!lesson && (step.instrument === 'piano' || step.instrument === 'synth') && lesson.root === step.root && lesson.scale === step.scale && lesson.hand === step.hand;
      limits.push('Uses the lesson’s saved speed level; an arbitrary requested BPM is not applied.');
      if (!ready) limits.push('Choose an existing lesson with this key, scale and hand. No simpler lesson is substituted.');
      step.goal = { kind: 'completedRun', observedMinutes: step.minutes };
    } else if (step.action === 'quizLevel') {
      step.page = 'quiz'; ready = levels(true).indexOf(step.levelId) >= 0;
      if (!ready) limits.push('Choose an existing Exercises level.');
      limits.push('Questions use their own pitches and timing. The global key and BPM do not configure this level.');
      step.goal = { kind: 'passingQuiz', levelId: step.levelId, observedMinutes: step.minutes };
    } else if (step.action === 'guidedScore') {
      step.page = 'shed'; material = resolveMaterial(step.materialId);
      ready = !!material && typeof step.materialFingerprint === 'string' && materialFingerprint(material) === step.materialFingerprint;
      if (!ready) limits.push('Choose a unique existing structured material; changed or missing material must be selected again.');
      if (material && step.mode === 'tempo' && (material.timingOk === false || material.rhythmKnown === false)) { ready = false; limits.push('This material has unknown or approximate timing. Choose Wait for Me instead of scored Tempo.'); }
      if (material && step.instrument === 'drums' && material.instrument !== 'drums') { ready = false; limits.push('Choose percussion material for the Drums category.'); }
      limits.push('Completion uses saved observations for this exact material fingerprint and instrument.');
      step.goal = { kind: 'completedRun', observedMinutes: step.minutes, materialId: step.materialId };
    } else if (step.action === 'openTool') {
      ready = Object.prototype.hasOwnProperty.call(TOOLS, step.page);
      limits.push(step.page === 'quiz' ? 'Choose the matching topic in Exercises; answering time is measured for the selected category.' : 'Opening this casual tool does not measure practice time or complete this block. Self-check the suggested work.');
      step.goal = { kind: step.page === 'quiz' ? 'observedSeconds' : 'selfCheck', value: step.minutes * 60 };
    } else {
      step.page = Object.prototype.hasOwnProperty.call(TOOLS, step.page) ? step.page : 'shed'; ready = false;
      limits.push(step.setupText || 'Choose a real lesson, level or structured material before this assignment can be assessed.');
      step.goal = { kind: 'selfCheck' };
    }
    step.status = ready ? 'ready' : 'needsSetup'; step.limitations = limits;
    step.target = step.action === 'keysLesson' ? { lessonId: step.lessonId } : step.action === 'quizLevel' ? { levelId: step.levelId } : step.action === 'guidedScore' ? { materialId: step.materialId, fingerprint: step.materialFingerprint || null } : { pageId: step.page };
    step.setup = { root: step.root, scale: step.scale, tempo: step.action === 'keysLesson' || step.action === 'quizLevel' ? null : step.bpm, hand: step.action === 'keysLesson' ? step.hand : null };
    return step;
  }
  function stepErrors(step) {
    var errors = [];
    if (!step || typeof step !== 'object') return ['A practice step must be an object.'];
    if (typeof step.title !== 'string' || !step.title.trim() || step.title.length > 120) errors.push('Title must contain 1–120 characters.');
    if (typeof step.sourceText !== 'string' || step.sourceText.length > MAX_TEXT) errors.push('Source text is too long.');
    if (!Object.prototype.hasOwnProperty.call(ACTIONS, step.action)) errors.push('Choose a supported action.');
    if (INSTRUMENTS.concat(['shared']).indexOf(step.instrument) < 0) errors.push('Choose an explicit instrument or shared reference category.');
    if (!finite(step.minutes) || step.minutes < 1 || step.minutes > 60) errors.push('Suggested minutes must be between 1 and 60.');
    if (!Number.isInteger(step.root) || step.root < 0 || step.root > 11) errors.push('Root must be a pitch class from 0 to 11.');
    if (typeof step.scale !== 'string' || !Object.prototype.hasOwnProperty.call(Theory.SCALES, step.scale)) errors.push('Choose an existing scale.');
    if (!Number.isInteger(step.bpm) || step.bpm < 30 || step.bpm > 280) errors.push('Tempo must be an integer between 30 and 280 BPM.');
    if (['right', 'left'].indexOf(step.hand) < 0) errors.push('Keys lessons support right or left hand separately.');
    if (['wait', 'tempo'].indexOf(step.mode) < 0) errors.push('Choose Wait for Me or Play at Tempo.');
    if (['openTool', 'needsSetup'].indexOf(step.action) >= 0 && !Object.prototype.hasOwnProperty.call(TOOLS, step.page)) errors.push('Choose an available tool.');
    if (step.action === 'keysLesson' && ['piano', 'synth'].indexOf(step.instrument) < 0) errors.push('Keys lessons require Piano or Synth; they cannot credit another instrument.');
    if (step.action === 'guidedScore' && step.instrument === 'shared') errors.push('Choose the explicit instrument that will practice this material.');
    if (step.action === 'openTool' && step.page === 'fretboard' && step.instrument !== 'guitar') errors.push('The six-string fretboard is a Guitar tool.');
    if (step.action === 'openTool' && ['piano', 'synth'].indexOf(step.page) >= 0 && ['piano', 'synth'].indexOf(step.instrument) < 0) errors.push('Keyboard tools require Piano or Synth context.');
    ['lessonId', 'levelId', 'materialId'].forEach(function (field) { if (typeof step[field] !== 'string' || step[field].length > 160) errors.push(field + ' must be a bounded identifier.'); });
    return errors;
  }
  function sealPlan(plan) {
    if (plan.items.length > MAX_STEPS) throw new Error('Keep a practice plan to at most ' + MAX_STEPS + ' steps.');
    plan.schemaVersion = 2;
    plan.items = plan.items.map(function (item, index) {
      var step = typed(item, plan, index), errors = stepErrors(step);
      if (errors.length) throw new Error(errors.join(' '));
      step.id = 'pp-' + hash(JSON.stringify([step.draftKey, step.sourceText, step.title, step.instrument, step.action, step.target, step.root, step.scale, step.bpm, step.minutes, step.hand, step.mode]));
      return step;
    });
    plan.id = 'plan-' + hash(JSON.stringify([plan.source, plan.instrument, plan.items.map(function (step) { return step.id; }), plan.gaps]));
    plan.acceptedAt = null; return plan;
  }
  function saveDraft(next, keepRaw) {
    var all = obj(DRAFTS), key = draftKey();
    try {
      assertDraftBasis(all, key);
      if (rawInputs[key] && (rawInputs[key].source.length > MAX_TEXT || rawInputs[key].link.length > 2048)) throw new Error('Keep teacher text under 128 KB and its optional link under 2048 characters.');
      if (next || keepRaw) all[key] = { version: 1, student: student().id, instrument: instrument(), savedAt: new Date().toISOString(), acceptedPlanBasis: planBases[key], rawSource: rawInputs[key] ? rawInputs[key].source : next.source, docUrl: rawInputs[key] ? rawInputs[key].link : student().docUrl || '', plan: next ? copy(next) : null };
      else delete all[key];
      writeChecked(DRAFTS, all);
    }
    catch (error) { var retained = next || pending; pending = retained ? copy(retained) : null; unsavedDraft = retained ? copy(retained) : null; unsavedRaw[key] = !!keepRaw || !!rawInputs[key]; draftErrors = [error.message]; memoryDrafts[key] = { plan: retained ? copy(retained) : null, raw: rawInputs[key] && copy(rawInputs[key]), errors: draftErrors.slice() }; throw error; }
    draftBases[key] = JSON.stringify(all[key] || null);
    pending = next ? copy(next) : null; unsavedDraft = null; draftErrors = []; delete memoryDrafts[key]; delete unsavedRaw[key];
  }
  function assertDraftBasis(all, key) {
    if (!Object.prototype.hasOwnProperty.call(draftBases, key)) { draftBases[key] = JSON.stringify(all[key] || null); planBases[key] = JSON.stringify(student().plan); }
    if (draftBases[key] !== JSON.stringify(all[key] || null)) throw new Error('Another tab changed this draft. Your local edit was retained; export it, then reload the saved draft before continuing.');
  }
  function restoreDraft() {
    var key = draftKey(), saved = obj(DRAFTS)[key]; pending = null; unsavedDraft = null; draftErrors = [];
    if (memoryDrafts[key]) { pending = copy(memoryDrafts[key].plan); unsavedDraft = copy(pending); if (memoryDrafts[key].raw) rawInputs[key] = copy(memoryDrafts[key].raw); draftErrors = memoryDrafts[key].errors.slice(); return; }
    delete rawInputs[key]; delete unsavedRaw[key];
    draftBases[key] = JSON.stringify(saved || null); planBases[key] = saved && typeof saved.acceptedPlanBasis === 'string' ? saved.acceptedPlanBasis : JSON.stringify(student().plan);
    if (!saved || saved.version !== 1 || saved.instrument !== instrument() || saved.student !== student().id) return;
    if (typeof saved.rawSource === 'string' && saved.rawSource.length <= MAX_TEXT) rawInputs[key] = { source: saved.rawSource, link: typeof saved.docUrl === 'string' ? saved.docUrl : '' };
    if (!saved.plan) return;
    try { pending = sealPlan(copy(saved.plan)); } catch (error) { message = 'A saved draft could not be loaded. Its stored data was preserved: ' + error.message; }
  }
  function validateDraft() {
    if (!pending) return { ok: false, errors: ['Review or add practice steps first.'] };
    if (draftErrors.length) return { ok: false, errors: draftErrors.slice() };
    if (rawInputs[draftKey()] && rawInputs[draftKey()].source !== pending.source) return { ok: false, errors: ['Teacher text changed after this review. Review mapping again before accepting those notes.'] };
    try { var plan = sealPlan(copy(pending)); return { ok: true, errors: [], draft: plan, ready: plan.items.filter(function (step) { return step.status === 'ready'; }).length }; }
    catch (error) { return { ok: false, errors: [error.message] }; }
  }
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
    var bpm = text.match(/(-?\d+(?:\.\d+)?)\s*bpm\b/i) || text.match(/\bbpm\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i);
    var mins = text.match(/(-?\d+(?:\.\d+)?)\s*(?:min(?:ute)?s?)\b/i);
    var help = text.match(/\bhelp\s*(?:level\s*)?([0-4])\b/i);
    var fallback = Math.max(30, Math.min(280, Math.round(+App.store.get('met.bpm', 80) || 80)));
    return { root: root, scale: scale, bpm: bpm ? +bpm[1] : fallback, minutes: mins ? +mins[1] : null, help: help ? +help[1] : null, ambiguous: keys.length > 1,
      invalid: bpm && (!Number.isInteger(+bpm[1]) || +bpm[1] < 30 || +bpm[1] > 280) || mins && (+mins[1] < 1 || +mins[1] > 60) };
  }
  function mapText(text, options) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Paste lesson notes first.');
    if (text.length > MAX_TEXT) throw new Error('Keep lesson notes under 128 KB.');
    options = options || {};
    var items = [], gaps = [], selected = category(options.instrument) || instrument();
    function gap(source, reason) { if (gaps.length >= 128) throw new Error('Split these notes into smaller plans (maximum 128 unsupported assignments).'); gaps.push({ id: hash(source + '|' + reason), source: source, reason: reason }); }
    function add(source, rule, c, extra) {
      if (items.length >= MAX_STEPS) throw new Error('Keep a practice plan to at most ' + MAX_STEPS + ' steps.');
      var item = Object.assign({ source: source, ruleId: rule.id, instrument: ['quiz','chords','tuner'].indexOf(rule.page) >= 0 ? 'shared' : selected, title: rule.title, page: rule.page, kind: /warm[ -]?up/i.test(source) ? 'warm-up' : rule.kind, area: rule.area, minutes: c.minutes || rule.minutes, root: c.root, scale: c.scale, bpm: c.bpm, help: c.help }, extra || {});
      item.id = 'pp-' + hash(JSON.stringify([source, item.instrument, item.page, item.lessonId || '', item.root, item.scale, item.bpm, item.minutes, item.help]));
      items.push(item);
    }
    text.split(/\r?\n|;/).forEach(function (line) {
      var source = line.replace(/^\s*#{1,6}\s+/, '').replace(/^\s*(?:[-*•]+|\d+[.)])\s*/, '').trim();
      if (!source || /^(?:lesson|practice|homework|notes|warm[ -]?up|technique|repertoire|ear|theory)(?:\s+notes)?\s*[:：]?$/i.test(source) || /^https?:\/\//i.test(source)) return;
      var c = context(source), rule = RULES.filter(function (r) { return r.match.test(source); })[0];
      if (c.ambiguous) { gap(source, 'Split assignments with multiple keys onto separate lines so each block has one setup.'); return; }
      if (c.invalid) { gap(source, 'Use 1–60 suggested minutes and an integer tempo from 30–280 BPM; the request was not silently clamped.'); return; }
      if (/\b(?:bass|drums?|voice|vocal)\b/i.test(source) && selected !== (/\bbass\b/i.test(source) ? 'bass' : /\bdrums?\b/i.test(source) ? 'drums' : 'voice')) { gap(source, 'Choose the assignment’s explicit instrument category before mapping it.'); return; }
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
      if (rule.page === 'shed') gap(source, 'Choose the actual structured material in review. These words alone cannot identify or import the assigned score.');
      if (rule.page === 'quiz' && /ear|interval|key signature/i.test(source)) gap(source, 'Choose an actual Exercises level in review. Text mapping does not select the exact topic or ear mode.');
    });
    items.sort(function (a, b) { return ORDER[a.kind] - ORDER[b.kind]; });
    return sealPlan({ id: 'plan-' + hash(text), source: text, instrument: selected, items: items, gaps: gaps, acceptedAt: null });
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
    var materialIds = null;
    if (item.action === 'guidedScore') {
      materialIds = [];
      if (window.PracticeMaterial && PracticeMaterial.history) {
        var rows = PracticeMaterial.history({ kind: 'legacy', id: item.materialId, fingerprint: item.materialFingerprint });
        if (Array.isArray(rows)) materialIds = rows.filter(function (row) { return row && (!row.instrument || row.instrument === selected); }).map(function (row) { return row.sessionId || row.id; });
      }
    }
    var records = history.filter(function (r) {
      if (materialIds) return materialIds.indexOf(r.id) >= 0;
      if ((!item.action || item.action === 'keysLesson') && item.lessonId) return r.mode === 'keys:' + item.lessonId;
      if (item.page === 'quiz') return r.mode === 'knowledge';
      if (!item.action && item.page === 'shed') return ['wait', 'tempo', 'woodshed'].indexOf(r.mode) >= 0;
      return false;
    });
    var scoped = obj('qz.instrumentProg')[selected];
    var currentQuiz = window.SLQuiz && SLQuiz.cur;
    return { ids: records.map(function (r) { return r.id; }), records: records, quiz: copy(scoped && typeof scoped === 'object' ? scoped : {}),
      quizRun: currentQuiz && { id: currentQuiz.sessionId, levelId: currentQuiz.lvl && currentQuiz.lvl.id, instrument: currentQuiz.instrument, passed: !!currentQuiz.finished && !currentQuiz.drill && !currentQuiz.sprint && currentQuiz.score >= 8 } };
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
      if ((!item.action || item.action === 'keysLesson') && item.lessonId && fresh.some(function (r) { return r.status === 'complete' && r.matched > 0; })) reason = 'New ' + label(running.instrument) + ' Keys lesson session recorded';
      if (item.page === 'quiz' && Object.keys(now.quiz).some(function (id) { return (!item.levelId || id === item.levelId) && (now.quiz[id].b || 0) >= 8 && (!base.quiz[id] || now.quiz[id].b > base.quiz[id].b); })) reason = 'New passing ' + label(running.instrument) + ' Exercises result recorded';
      if (item.page === 'quiz' && now.quizRun && now.quizRun.passed && now.quizRun.instrument === running.instrument && (!item.levelId || now.quizRun.levelId === item.levelId) && fresh.some(function (record) { return record.id === now.quizRun.id && record.status === 'complete'; })) reason = 'New passing ' + label(running.instrument) + ' Exercises result recorded';
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
    if (item.action) {
      item = deriveStep(copy(item), s.plan);
      var errors = stepErrors(item);
      if (errors.length) { message = errors.join(' '); if (el('pp-status')) el('pp-status').textContent = message; return false; }
      if (item.status !== 'ready') {
        App.store.set('pp.running', null); if (item.page === 'shed') App.emit('learn:practice', { instrument: selected }); App.switchTo(item.page);
        message = item.limitations.join(' ') + ' This setup step has no measured completion.';
        return false;
      }
    }
    var sess = session(s), st = sess.items[id] || { instrument: selected, done: false, seconds: 0, reason: '' };
    sess.items[id] = st; saveSession(sess);
    var observed = (!item.action || item.action === 'keysLesson') && !!item.lessonId || item.page === 'quiz' || item.action === 'guidedScore' || !item.action && item.page === 'shed';
    var tracker = st.done || !observed ? null : { student: s.id, instrument: selected, day: dayKey(), plan: s.plan.id, item: id, base: telemetry(item, selected), previous: st.seconds, previousIds: st.sessionIds || [], startedAt: new Date().toISOString() };
    if (item.action !== 'keysLesson' && item.action !== 'quizLevel') { App.store.set('met.bpm', item.bpm); App.emit('tempo', { bpm: item.bpm, source: 'practiceplan' }); }
    if (item.action !== 'quizLevel') App.emit('fb:set', { root: item.root, scale: item.scale, source: 'practiceplan' });
    if (item.help != null && App.help) App.help.set(item.help);
    if (item.action === 'guidedScore') {
      var result;
      if (window.PracticeMaterial && PracticeMaterial.launchLegacy) result = PracticeMaterial.launchLegacy(item.materialId, { mode: item.mode, instrument: selected, tempo: item.bpm, expectedFingerprint: item.materialFingerprint });
      else if (window.Woodshed && Woodshed.performanceStart) { App.emit('transport:claim', { owner: 'performance' }); Woodshed.performanceStart(resolveMaterial(item.materialId), item.mode, { instrument: selected, tempo: item.bpm }); result = { ok: true }; }
      if (!result || !result.ok) { message = result && (result.error || result.message) || 'This material could not be opened. Select it again.'; App.store.set('pp.running', null); if (el('pp-status')) el('pp-status').textContent = message; return false; }
    } else if (item.page === 'fretboard') App.emit('fb:practice', { root: item.root, scale: item.scale, bpm: item.bpm });
    else { App.switchTo(item.page); if ((!item.action || item.action === 'keysLesson') && item.lessonId) App.keysLessons.open(item.lessonId, selected); if (item.action === 'quizLevel') SLQuiz.start(item.levelId); }
    App.store.set('pp.running', tracker);
    return true;
  }
  function preview(text, options) { importId++; var next = mapText(text, options); if (next.instrument !== instrument()) throw new Error('Choose this Learn instrument before compiling its notes.'); rawInputs[draftKey()] = { source: text, link: el('pp-link') ? el('pp-link').value : student().docUrl || '' }; planBases[draftKey()] = JSON.stringify(student().plan); saveDraft(next); paintPreview(); return copy(pending); }
  function draft() { return pending ? copy(pending) : null; }
  function retryDraft() { try { saveDraft(unsavedDraft || pending, !!rawInputs[draftKey()]); paintPreview(); return { ok: true, draft: draft() }; } catch (error) { return { ok: false, errors: [error.message] }; } }
  function checkpoint() { if (importPending) return { ok: false, errors: ['A teacher-text file is still being read. Wait for its review before continuing.'] }; var result = unsavedDraft || unsavedRaw[draftKey()] ? retryDraft() : { ok: true }; return { ok: result.ok, errors: result.ok ? [] : result.errors }; }
  function reloadDraft() { var key = draftKey(); delete memoryDrafts[key]; delete rawInputs[key]; delete unsavedRaw[key]; restoreDraft(); message = 'Reloaded the saved draft. Export local edits before using this action if you need to keep them.'; paint(); return draft(); }
  function editAccepted() { var next = copy(student().plan); planBases[draftKey()] = JSON.stringify(next); rawInputs[draftKey()] = { source: next.source || '', link: student().docUrl || '' }; next.instrument = instrument(); next = sealPlan(next); saveDraft(next); paintPreview(); return draft(); }
  function discardDraft() { saveDraft(null); delete rawInputs[draftKey()]; message = 'Draft discarded. The accepted plan and its history are unchanged.'; paint(); return true; }
  function changeDraft(change) {
    if (!pending) return { ok: false, errors: ['Review notes or edit the accepted plan first.'] };
    try { var next = copy(pending), key = change(next); next = sealPlan(next); saveDraft(next); paintPreview(); return { ok: true, draft: draft(), stepId: key && (next.items.filter(function (step) { return step.draftKey === key; })[0] || {}).id }; }
    catch (error) { draftErrors = [error.message]; return { ok: false, errors: draftErrors.slice() }; }
  }
  function findStep(plan, id) { return plan.items.filter(function (step) { return step.id === id || step.draftKey === id; })[0]; }
  function applyStepPatch(step, patch) {
    var allowed = ['title', 'instrument', 'action', 'minutes', 'root', 'scale', 'bpm', 'hand', 'lessonId', 'levelId', 'materialId', 'page', 'mode'];
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(function (key) { return allowed.indexOf(key) < 0; })) throw new Error('Use only the editable practice-step fields.');
    ['minutes', 'root', 'bpm'].forEach(function (field) { if (Object.prototype.hasOwnProperty.call(patch, field) && !finite(patch[field])) throw new Error(field + ' must be a finite number.'); });
    var previousLesson = lessons().filter(function (lesson) { return lesson.id === step.lessonId; })[0];
    Object.assign(step, copy(patch));
    if (patch.action === 'keysLesson' && step.instrument === 'shared' && ['piano', 'synth'].indexOf(pending.instrument) >= 0) step.instrument = pending.instrument;
    if (patch.lessonId) {
      var lesson = lessons().filter(function (entry) { return entry.id === patch.lessonId; })[0];
      if (!lesson) throw new Error('Choose an existing Keys lesson.');
      step.root = lesson.root; step.scale = lesson.scale; step.hand = lesson.hand;
    } else if (step.action === 'keysLesson' && previousLesson && ['root', 'scale', 'hand'].some(function (key) { return Object.prototype.hasOwnProperty.call(patch, key); })) {
      var match = lessons().filter(function (lesson) { return lesson.root === step.root && lesson.scale === step.scale && lesson.hand === step.hand && lesson.oct === previousLesson.oct && lesson.pat === previousLesson.pat; })[0];
      step.lessonId = match ? match.id : '';
    }
    if (patch.levelId && levels(true).indexOf(patch.levelId) < 0) throw new Error('Choose an existing Exercises level.');
    if (Object.prototype.hasOwnProperty.call(patch, 'materialId')) {
      var material = patch.materialId ? resolveMaterial(patch.materialId) : null;
      if (patch.materialId && !material) throw new Error('Choose one unique existing material.');
      step.materialFingerprint = material ? materialFingerprint(material) : null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'bpm') && ['keysLesson', 'quizLevel'].indexOf(step.action) >= 0) throw new Error('This action uses its existing lesson/question settings; arbitrary BPM is not a supported launch hook.');
    if (Object.prototype.hasOwnProperty.call(patch, 'page') && !Object.prototype.hasOwnProperty.call(TOOLS, patch.page)) throw new Error('Choose an available tool.');
  }
  function editStep(id, patch) { return changeDraft(function (plan) { var step = findStep(plan, id); if (!step) throw new Error('The draft step no longer exists.'); applyStepPatch(step, patch); return step.draftKey; }); }
  function addStep(patch) { return changeDraft(function (plan) { var c = context(''), step = Object.assign(c, { title: 'New practice step', source: 'Added during review.', instrument: instrument(), action: 'needsSetup', page: 'shed', kind: 'technique', minutes: 5, draftKey: 'added-' + Date.now().toString(36) + '-' + (++editSerial) }); step = typed(step, plan, plan.items.length); applyStepPatch(step, patch || {}); plan.items.push(step); return step.draftKey; }); }
  function duplicateStep(id) { return changeDraft(function (plan) { var step = findStep(plan, id); if (!step) throw new Error('The draft step no longer exists.'); var duplicate = copy(step); duplicate.draftKey = 'duplicate-' + Date.now().toString(36) + '-' + (++editSerial); duplicate.provenance = { ruleId: 'duplicate', sourcePlanId: plan.id, sourceItemId: step.id }; plan.items.splice(plan.items.indexOf(step) + 1, 0, duplicate); return duplicate.draftKey; }); }
  function removeStep(id) { return changeDraft(function (plan) { var step = findStep(plan, id); if (!step) throw new Error('The draft step no longer exists.'); plan.items.splice(plan.items.indexOf(step), 1); }); }
  function moveStep(id, index) { return changeDraft(function (plan) { var step = findStep(plan, id); if (!step || !Number.isInteger(index) || index < 0 || index >= plan.items.length) throw new Error('Choose an existing step position.'); plan.items.splice(plan.items.indexOf(step), 1); plan.items.splice(index, 0, step); return step.draftKey; }); }
  function accept() {
    if (!pending) return false;
    var validated = validateDraft(); if (!validated.ok) throw new Error(validated.errors.join(' '));
    if (pending.instrument !== instrument()) throw new Error('Choose this draft’s Learn instrument before accepting it.');
    var s = student(), link = el('pp-link') ? validLink(el('pp-link').value) : s.docUrl;
    var savedDrafts = obj(DRAFTS), activeDraftKey = draftKey(); assertDraftBasis(savedDrafts, activeDraftKey);
    if (planBases[activeDraftKey] !== JSON.stringify(s.plan)) throw new Error('Another tab changed the accepted plan. Export this draft and reload before replacing that newer plan.');
    refresh(); var archive = arr('pp.history');
    if (s.plan && s.plan.id !== pending.id) archive.push({ student: s.id, plan: copy(s.plan), archivedAt: new Date().toISOString() });
    s = copy(s); s.plan = validated.draft; s.plan.acceptedAt = new Date().toISOString(); s.instrument = pending.instrument; s.docUrl = link;
    var all = arr('pp.gaps');
    pending.gaps.forEach(function (g) {
      var id = s.id + '/' + g.id, old = all.filter(function (u) { return u.id === id; })[0];
      if (!old) { old = Object.assign({}, g, { id: id, student: s.id, count: 0, plans: [] }); all.push(old); }
      if (old.plans.indexOf(pending.id) < 0) { old.count++; old.plans.push(pending.id); old.lastSeen = s.plan.acceptedAt; }
    });
    var drafts = savedDrafts; delete drafts[draftKey()];
    var changes = {}; changes['pp.history'] = archive; changes['pp.gaps'] = all; changes[DRAFTS] = drafts; changes['pp.running'] = null; changes['pp.students'] = students().map(function (entry) { return entry.id === s.id ? s : entry; });
    writeBatch(changes); draftBases[activeDraftKey] = 'null'; planBases[activeDraftKey] = JSON.stringify(s.plan); pending = null; unsavedDraft = null; draftErrors = []; delete memoryDrafts[activeDraftKey]; delete rawInputs[activeDraftKey]; delete unsavedRaw[activeDraftKey]; message = 'Plan accepted. Original notes, reviewed steps and prior plan history are saved on this device.'; paint(); return true;
  }
  function state() { refresh(); var s = student(), selected = instrument(); return copy({ student: s, instrument: selected, plan: s.plan, draft: pending, draftSaved: !unsavedDraft && !unsavedRaw[draftKey()], draftErrors: draftErrors, session: session(s), availableItems: s.plan.items.filter(function (i) { return compatible(i, s.plan, selected); }), preservedItems: s.plan.items.filter(function (i) { return !compatible(i, s.plan, selected); }), gaps: arr('pp.gaps').filter(function (g) { return g.student === s.id; }), week: App.practiceProgress ? App.practiceProgress.summary(selected, { rangeDays: 7 }).daily : [] }); }
  function textFromJSON(value) {
    if (typeof value === 'string') return value;
    var parts = [], nodes = 0;
    function walk(v, depth) {
      if (depth > 30 || nodes++ > 20000) throw new Error('This JSON export is too complex; export a smaller plain-text assignment.');
      if (!v) return;
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
  function exportDraft() {
    var data = { version: 1, student: student().id, instrument: instrument(), sourceText: el('pp-notes') ? el('pp-notes').value : pending && pending.source || '', docUrl: el('pp-link') ? el('pp-link').value : student().docUrl || '', draft: unsavedDraft || pending, saved: !unsavedDraft && !unsavedRaw[draftKey()], errors: draftErrors.slice() };
    var url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = 'soundlab-practice-draft.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); return data;
  }
  function editorSelect(step, field, title, choices, disabled) {
    return '<label>' + title + '<select data-pp-step="' + esc(step.draftKey) + '" data-pp-field="' + field + '"' + (disabled ? ' disabled' : '') + '>' + choices.map(function (choice) { return '<option value="' + esc(choice[0]) + '"' + (String(step[field]) === String(choice[0]) ? ' selected' : '') + '>' + esc(choice[1]) + '</option>'; }).join('') + '</select></label>';
  }
  function editorInput(step, field, title, attributes, disabled) {
    return '<label>' + title + '<input data-pp-step="' + esc(step.draftKey) + '" data-pp-field="' + field + '" value="' + esc(step[field]) + '" ' + attributes + (disabled ? ' disabled' : '') + '></label>';
  }
  function criterion(item) {
    if (item.action === 'needsSetup' || item.status === 'needsSetup') return 'Setup only: select the real lesson/material before assessed practice. Opening the library or tool earns no progress.';
    return (!item.action || item.action === 'keysLesson') && item.lessonId ? 'One new completed exact lesson session or ' + item.minutes + ' recorded playing minutes' : item.action === 'guidedScore' ? 'One new completed run of this exact material, or ' + item.minutes + ' recorded minutes for it' : !item.action && item.page === 'shed' ? 'One new completed run or ' + item.minutes + ' recorded playing minutes' : item.page === 'quiz' ? (item.levelId ? 'A new passing result for this exact level, or ' : 'A new passing score or ') + item.minutes + ' recorded answering minutes in this instrument category' : 'No automated timer or completion is available for this casual tool; opening it earns no progress.';
  }
  function paintPreview() {
    if (editingField) { setTimeout(paintPreview, 0); return; }
    if (!el('pp-preview')) return;
    el('pp-preview').hidden = !pending;
    if (!pending) return;
    var focused = document.activeElement, focus = focused && focused.dataset.ppField ? { key: focused.dataset.ppStep, field: focused.dataset.ppField } : null;
    var ready = pending.items.filter(function (step) { return step.status === 'ready'; }).length;
    el('pp-preview').innerHTML = '<h3>Review and edit practice steps</h3><p>' + ready + ' ready · ' + (pending.items.length - ready) + ' need setup · ' + pending.gaps.length + ' unsupported assignments. ' + (unsavedDraft ? 'Draft is not saved; retry or export it.' : 'Draft saved locally. Accepting it archives the previous plan.') + '</p>' +
      '<div id="pp-draft-errors" role="alert"' + (!draftErrors.length ? ' hidden' : '') + '>' + draftErrors.map(esc).join('<br>') + '</div><ol class="pp-editor">' + pending.items.map(function (step, index) {
        var key = esc(step.draftKey), configuration = '', kind = step.action;
        if (kind === 'keysLesson') configuration += editorSelect(step, 'lessonId', 'Existing lesson', [['', 'Choose a matching lesson']].concat(lessons().map(function (lesson) { return [lesson.id, lesson.name + ' · ' + (lesson.hand === 'right' ? 'RH' : 'LH') + ' · ' + lesson.oct + ' octave(s)']; }))) + editorSelect(step, 'hand', 'Hand', [['right', 'Right'], ['left', 'Left']]);
        if (kind === 'quizLevel') configuration += editorSelect(step, 'levelId', 'Existing Exercises level', [['', 'Choose a real level']].concat(levels(true).filter(function (id) { return !App.practiceInstrument || App.practiceInstrument.allowsMode(id.split('/')[2], step.instrument === 'shared' ? pending.instrument : step.instrument); }).map(function (id) { return [id, id.replace(/\//g, ' › ')]; })));
        if (kind === 'guidedScore') configuration += editorSelect(step, 'materialId', 'Saved structured material', [['', 'Choose material from the library']].concat(materials().filter(function (score) { return !!resolveMaterial(score.id); }).map(function (score) { return [score.id, score.title || score.id]; }))) + editorSelect(step, 'mode', 'Practice mode', [['wait', 'Wait for Me'], ['tempo', 'Play at Tempo']]);
        if (kind === 'openTool' || kind === 'needsSetup') configuration += editorSelect(step, 'page', 'Real destination', Object.keys(TOOLS).map(function (page) { return [page, TOOLS[page]]; }));
        if (kind !== 'quizLevel') configuration += editorSelect(step, 'root', 'Key / root', Array.from({ length: 12 }, function (_, pc) { return [pc, Theory.pcName(pc, false)]; })) + editorSelect(step, 'scale', 'Scale', Object.keys(Theory.SCALES).map(function (id) { return [id, Theory.SCALES[id].name]; }));
        configuration += kind === 'keysLesson' || kind === 'quizLevel' ? '<p class="pp-muted">This action keeps its existing lesson/question settings. Any requested tempo remains in the original notes; no arbitrary BPM hook is claimed.</p>' : editorInput(step, 'bpm', 'Tempo (BPM)', 'type="number" min="30" max="280" step="1"');
        return '<li class="pp-edit-card" data-pp-card="' + key + '"><div class="pp-heading"><b>Step ' + (index + 1) + ' · ' + (step.status === 'ready' ? 'Ready' : 'Setup needed') + '</b><div class="pp-actions"><button type="button" class="btn sm" data-pp-move="' + key + '" data-pp-position="' + (index - 1) + '"' + (!index ? ' disabled' : '') + ' aria-label="Move step ' + (index + 1) + ' up">Up</button><button type="button" class="btn sm" data-pp-move="' + key + '" data-pp-position="' + (index + 1) + '"' + (index === pending.items.length - 1 ? ' disabled' : '') + ' aria-label="Move step ' + (index + 1) + ' down">Down</button><button type="button" class="btn sm" data-pp-duplicate="' + key + '">Duplicate</button><button type="button" class="btn sm" data-pp-remove="' + key + '">Remove</button></div></div><div class="pp-edit-fields">' +
          editorInput(step, 'title', 'What to do', 'type="text" maxlength="120"') + editorSelect(step, 'instrument', 'Instrument context', INSTRUMENTS.concat(['shared']).map(function (id) { return [id, label(id)]; })) + editorSelect(step, 'action', 'How to start', Object.keys(ACTIONS).map(function (id) { return [id, ACTIONS[id]]; })) + editorInput(step, 'minutes', 'Suggested minutes', 'type="number" min="1" max="60" step="0.5"') + configuration + '</div><p class="pp-evidence">Completion: ' + esc(criterion(step)) + '.</p><ul class="pp-limitations">' + step.limitations.map(function (limit) { return '<li>' + esc(limit) + '</li>'; }).join('') + '</ul><details><summary>Original instruction</summary><p class="pp-source">' + esc(step.sourceText) + '</p></details></li>';
      }).join('') + '</ol><div class="pp-actions"><button type="button" class="btn" id="pp-add-step"' + (pending.items.length >= MAX_STEPS ? ' disabled' : '') + '>Add step</button><button type="button" class="btn" id="pp-discard">Discard draft</button>' + (unsavedDraft ? '<button type="button" class="btn" id="pp-retry-draft">Retry saving draft</button><button type="button" class="btn" id="pp-reload-draft">Reload saved draft</button>' : '') + '<button type="button" class="btn primary" id="pp-accept"' + (draftErrors.length ? ' disabled' : '') + '>Accept this plan</button></div>' +
      (pending.gaps.length ? '<details open><summary>Unsupported assignments remain as gaps</summary><ul>' + pending.gaps.map(function (gap) { return '<li><b>' + esc(gap.source) + '</b> — ' + esc(gap.reason) + '</li>'; }).join('') + '</ul></details>' : '') + '<details><summary>Unchanged original teacher text</summary><pre class="pp-raw">' + esc(pending.source) + '</pre></details>';
    if (focus) {
      var replacement = Array.from(el('pp-preview').querySelectorAll('[data-pp-field]')).filter(function (control) { return control.dataset.ppStep === focus.key && control.dataset.ppField === focus.field; })[0];
      if (replacement) replacement.focus({ preventScroll: true });
    }
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
      var completion = criterion(i), setup = typeof i.setup === 'string' ? i.setup : i.setupText;
      var actionLabel = i.action === 'needsSetup' || i.status === 'needsSetup' ? 'Choose setup' : i.action === 'keysLesson' ? 'Open lesson' : i.action === 'quizLevel' ? 'Start level' : i.action === 'guidedScore' ? 'Open ' + (i.mode === 'tempo' ? 'Tempo' : 'Wait') : i.action === 'openTool' ? 'Open tool' : 'Start';
      return '<li class="pp-block' + (st.done ? ' pp-done' : '') + '"><span class="pp-number" aria-label="' + (st.done ? 'Complete' : 'Step ' + (n + 1)) + '">' + (st.done ? '✓' : n + 1) + '</span><div class="pp-body"><span class="pp-kicker">' + esc(i.kind) + ' · ' + i.minutes + ' min</span><h3>' + esc(i.title) + '</h3><p class="pp-source">' + (s.plan.source ? 'Doc: “' + esc(i.source) + '”' : esc(i.source)) + '</p>' + (setup ? '<p class="pp-muted">' + esc(setup) + '</p>' : '') + '<p class="pp-evidence">' + (st.done ? esc(st.reason) : Math.floor(st.seconds) + ' seconds recorded · ' + completion) + '</p></div><button type="button" class="btn' + (!st.done && n === done ? ' primary' : '') + '" data-pp-open="' + esc(i.id) + '">' + (st.done ? 'Open again' : st.seconds ? 'Continue' : actionLabel) + '</button></li>';
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
    var raw = rawInputs[draftKey()];
    el('pp-link').value = raw ? raw.link : s.docUrl || ''; el('pp-instrument').value = instrument(); el('pp-notes').value = raw ? raw.source : pending ? pending.source : s.plan.source || '';
    el('pp-status').textContent = message;
    var a = el('pp-doc'); a.hidden = !s.docUrl; a.href = s.docUrl || '#';
    paintPreview(); paintProgress();
  }
  function error(e) { message = e.message || String(e); el('pp-status').textContent = message; paintPreview(); }
  function init(box) {
    rootEl = box; App.injectCSS('practiceplan', CSS);
    box.innerHTML = '<div class="pp-wrap"><div class="pp-heading"><div><span class="pp-kicker">A little, every day</span><h1>Practice plan</h1><p class="pp-muted">Turn lesson notes into a clear next step.</p></div><button type="button" class="btn sm" id="pp-help">Lights & help</button></div><div class="pp-profile card"><label>Student <select id="pp-student"></select></label><label>New student <input id="pp-name" maxlength="60" placeholder="Name"></label><button type="button" class="btn" id="pp-add">Add student</button></div><div id="pp-today" class="card"></div><div id="pp-week" class="card"></div><details class="card pp-notes"><summary>Teacher’s lesson notes</summary><div class="pp-fields"><label>Current Learn instrument <select id="pp-instrument" disabled>' + INSTRUMENTS.map(function (id) { return '<option value="' + id + '">' + esc(label(id)) + '</option>'; }).join('') + '</select></label><label>Google Doc link (optional, saved locally)<input id="pp-link" type="url" placeholder="https://docs.google.com/document/d/…"></label><a id="pp-doc" target="_blank" rel="noopener noreferrer" hidden>Open saved lesson Doc</a><label>Paste notes, one assignment per line<textarea id="pp-notes" rows="7" placeholder="G major scale, hands separate, 5 min&#10;Practice your piece, 5 min&#10;Intervals, 3 min"></textarea></label><div class="pp-actions"><button type="button" class="btn primary" id="pp-review">Review mapping</button><button type="button" class="btn" id="pp-edit-accepted">Edit accepted plan</button><button type="button" class="btn" id="pp-export-draft">Export notes / draft</button><label class="pp-import">Import text / Docs JSON <input id="pp-file" type="file" accept=".txt,.md,.json,text/plain,application/json"></label></div><p class="pp-muted">The link is a bookmark. Paste or export the Doc’s text to import it. Notes stay in this browser; nothing is fetched or uploaded.</p><div id="pp-preview" hidden></div></div></details><div id="pp-gaps" class="card"></div><p id="pp-status" role="status" aria-live="polite"></p></div>';
    box.addEventListener('click', function (e) {
      var target = e.target.closest('button'); if (!target) return;
      try {
        var edited;
        if (target.hasAttribute('data-pp-move')) edited = moveStep(target.getAttribute('data-pp-move'), Number(target.getAttribute('data-pp-position')));
        if (target.hasAttribute('data-pp-duplicate')) edited = duplicateStep(target.getAttribute('data-pp-duplicate'));
        if (target.hasAttribute('data-pp-remove')) edited = removeStep(target.getAttribute('data-pp-remove'));
        if (target.id === 'pp-add-step') edited = addStep();
        if (target.id === 'pp-retry-draft') edited = retryDraft();
        if (target.id === 'pp-reload-draft') reloadDraft();
        if (edited && !edited.ok) throw new Error(edited.errors.join(' '));
        if (target.id === 'pp-edit-accepted') editAccepted();
        if (target.id === 'pp-discard') discardDraft();
        if (target.id === 'pp-export-draft') exportDraft();
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
          var changes = {}; changes['pp.active'] = id; changes['pp.students'] = all; writeBatch(changes); importId++; restoreDraft(); el('pp-name').value = ''; message = 'Student added. Progress for other students is preserved.'; paint();
        }
      } catch (err) { error(err); }
    });
    box.addEventListener('change', function (event) {
      var control = event.target;
      if (!control.dataset.ppField) return;
      var field = control.dataset.ppField, patch = {};
      patch[field] = ['root', 'bpm', 'minutes'].indexOf(field) >= 0 ? control.value.trim() ? Number(control.value) : NaN : control.value;
      editingField = true;
      try { var result = editStep(control.dataset.ppStep, patch); if (!result.ok) error(new Error(result.errors.join(' '))); }
      finally { editingField = false; }
    });
    box.addEventListener('input', function (event) {
      if (event.target.id !== 'pp-notes' && event.target.id !== 'pp-link') return;
      rawInputs[draftKey()] = { source: el('pp-notes').value, link: el('pp-link').value };
      try { if (rawInputs[draftKey()].source.length > MAX_TEXT || rawInputs[draftKey()].link.length > 2048) throw new Error('Keep teacher text under 128 KB and its optional link under 2048 characters.'); saveDraft(pending, true); }
      catch (err) { unsavedRaw[draftKey()] = true; message = err.message; el('pp-status').textContent = message; }
    });
    el('pp-student').addEventListener('change', function () { try { refresh(); App.store.set('pp.running', null); writeChecked('pp.active', this.value); importId++; restoreDraft(); message = ''; paint(); } catch (err) { this.value = student().id; error(err); } });
    el('pp-file').addEventListener('change', async function () {
      var file = this.files[0]; if (!file) return;
      var token = ++importId, selectedStudent = student().id, selectedInstrument = instrument(), readToken = token; importPending = { token: token };
      try { if (file.size > MAX_TEXT) throw new Error('Keep imported files under 128 KB.'); var text = await file.text(); if (token !== importId || student().id !== selectedStudent || instrument() !== selectedInstrument) return; if (/\.json$/i.test(file.name)) text = textFromJSON(JSON.parse(text)); el('pp-notes').value = text; token = importId + 1; preview(text, { instrument: el('pp-instrument').value }); message = 'Import ready to review. Edit its cards, then accept to replace the current plan.'; el('pp-status').textContent = message; } catch (err) { if (token === importId) error(err); } finally { if (importPending && importPending.token === readToken) importPending = null; this.value = ''; }
    });
    function observedChange() { refresh(); setTimeout(refresh, 0); } // Quiz marks its result complete after the persisted XP callback returns.
    App.on('xp', observedChange);
    App.on('practiceprogress:changed', observedChange);
    App.on('performance:session', refresh);
    App.on('learn:instrument', function () {
      refresh(); App.store.set('pp.running', null); importId++; restoreDraft();
      message = 'Instrument changed. The previous block’s tracking ended; its original context and history are preserved.';
      paint();
    });
    document.addEventListener('visibilitychange', function () { refresh(); });
    restoreDraft(); paint();
  }
  var CSS = '.pp-wrap{max-width:960px;margin:0 auto;display:grid;gap:14px}.pp-wrap h1{margin:0;font-size:38px}.pp-wrap h2,.pp-wrap h3{margin:0 0 6px}.pp-wrap p{margin:5px 0}.pp-wrap .card{margin:0}.pp-heading,.pp-profile,.pp-actions{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.pp-kicker{font-size:12px;text-transform:uppercase;letter-spacing:1.2px;color:var(--accent)}.pp-muted{color:var(--muted);font-size:14px}.pp-profile label,.pp-fields label{display:grid;gap:6px;min-width:0;flex:1}.pp-wrap input,.pp-wrap select,.pp-wrap textarea{font:inherit;color:var(--text);background:var(--inset);border:1px solid var(--line);border-radius:8px;padding:10px;max-width:100%;min-width:0;width:100%;box-sizing:border-box}.pp-wrap textarea{resize:vertical;line-height:1.5}.pp-blocks{list-style:none;padding:0;margin:14px 0;display:grid;gap:10px}.pp-block{display:flex;gap:12px;align-items:center;border-top:1px solid var(--line);padding:15px 0 4px;overflow-wrap:anywhere}.pp-body{flex:1;min-width:0}.pp-number{display:grid;place-items:center;width:32px;height:32px;flex:none;border:1px solid var(--accent);border-radius:50%;color:var(--accent)}.pp-done .pp-number{background:var(--accent);color:var(--bg)}.pp-block h3{font-size:19px;margin-top:4px}.pp-source{font-size:14px;line-height:1.4}.pp-evidence{font-size:12px;color:var(--muted)}.pp-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin:14px 0}.pp-week>div{display:grid;gap:7px;background:var(--inset);border:1px solid var(--line);border-radius:8px;padding:10px 2px;text-align:center;font-size:13px}.pp-week small{font-size:11px;color:var(--muted)}.pp-notes summary{cursor:pointer;font-weight:600}.pp-fields{display:grid;gap:14px;padding-top:16px}.pp-import{font-size:13px;color:var(--muted);max-width:300px}.pp-wrap li{margin-bottom:10px}.pp-wrap a{color:var(--accent);overflow-wrap:anywhere}#pp-preview{border-top:1px solid var(--line);padding-top:15px}#pp-gaps{overflow-wrap:anywhere}#pp-status{font-size:14px;color:var(--accent);min-height:1em}@media(max-width:600px){.pp-wrap h1{font-size:30px}.pp-block{flex-wrap:wrap;gap:10px}.pp-block .btn{margin-left:42px;min-height:42px}.pp-block .pp-body{flex-basis:calc(100% - 44px)}.pp-week{gap:3px}.pp-week>div{font-size:11px;padding:8px 0}.pp-profile{align-items:end}.pp-profile label{flex-basis:100%}.pp-heading .btn{min-height:40px}.pp-wrap .card{padding:16px}}';
  CSS += '.pp-editor{list-style:none;padding:0;display:grid;gap:14px}.pp-edit-card{border:1px solid var(--line);border-radius:10px;padding:14px;min-width:0;background:var(--inset)}.pp-edit-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:12px 0}.pp-edit-fields label{display:grid;gap:5px;font-size:13px;min-width:0}.pp-wrap .pp-editor button.btn{min-height:44px}.pp-limitations{font-size:13px;color:var(--muted);padding-left:20px}.pp-raw{white-space:pre-wrap;overflow-wrap:anywhere;max-height:200px;overflow:auto;font-size:13px}.pp-edit-card details{overflow-wrap:anywhere}#pp-draft-errors{border-left:3px solid var(--warn);padding:10px;font-size:14px;margin:10px 0}#pp-draft-errors[hidden]{display:none}@media(max-width:520px){.pp-edit-fields{grid-template-columns:1fr}.pp-edit-card{padding:10px}.pp-edit-card .pp-actions{gap:6px}.pp-editor .btn{padding:8px 10px}}';
  // Keep this page's expanded Learn strip on one row on small screens. Scope
  // the integration style to the group containing this module; other groups
  // retain the shell's normal pill spacing and labels.
  CSS += '@media(max-width:600px){#subnav:has(.subtab[data-page="practiceplan"]) .subtab{padding-left:9px;padding-right:9px}}';
  App.practicePlan = { rules: RULES, preview: preview, accept: accept, state: state, refresh: refresh, launch: launch,
    draft: draft, validateDraft: validateDraft, editAccepted: editAccepted, editStep: editStep, addStep: addStep, duplicateStep: duplicateStep, removeStep: removeStep, moveStep: moveStep, discardDraft: discardDraft, retryDraft: retryDraft, reloadDraft: reloadDraft, exportDraft: exportDraft, checkpoint: checkpoint };
  App.register('practiceplan', { init: init, onShow: function () { paint(); if (!uiTimer) uiTimer = setInterval(paintProgress, 3000); }, onHide: function () { refresh(); clearInterval(uiTimer); uiTimer = null; }, onKey: function (e) { if (e.key === 'Escape' && pending) { pending = null; paintPreview(); } } });
})();
