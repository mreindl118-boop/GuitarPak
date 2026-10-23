/* One explicit Learn category, shared by lesson/session owners. No migration:
 * historical unassigned progress remains unassigned. Selection is not credit. */
(function () {
  'use strict';
  var IDS = ['piano', 'synth', 'guitar', 'bass', 'drums', 'voice', 'other'];
  var LABEL = { piano: 'Piano', synth: 'Synth', guitar: 'Guitar', bass: 'Bass', drums: 'Drums', voice: 'Voice', other: 'Other' };
  var SHARED = ['treble', 'bass', 'staff', 'ear', 'theory'];
  var MODES = { piano: SHARED.concat(['piano']), synth: SHARED.concat(['piano']), guitar: SHARED.concat(['neck']),
    bass: SHARED.concat(['neck']), drums: ['theory'], voice: SHARED, other: SHARED };
  var PAGES = ['quiz', 'chords', 'theory', 'practiceplan'];
  var NOTES = {
    piano: 'Keyboard note exercises, shared notation and ear training, plus the actual keys scale lessons.',
    synth: 'Keyboard note exercises and keys lessons. Synth technique and patch programming are not a separate quiz curriculum.',
    guitar: 'Six-string guitar fretboard exercises, shared notation and ear training, and guitar practice tools.',
    bass: 'Four-string bass exercises use E1–A1–D2–G2. Shared notation and ear training also apply to bass.',
    drums: 'Shared theory is available here. Dedicated drum quiz levels are not available yet; use the drum pads and rhythm library for playing.',
    voice: 'Shared notation, pitch and ear training. Use monophonic pitch practice for sung notes; this is not a vocal technique curriculum.',
    other: 'Shared notation, ear training and theory, with an explicit Other instrument credit category.'
  };
  var ENTRIES = {
    piano: [{ label: 'Keys scale lessons', page: 'piano', target: 'pn-lessons', kind: 'Keyboard lessons' }, { label: 'Wait / Tempo practice', page: 'shed', kind: 'Performance practice' }],
    synth: [{ label: 'Keys scale lessons', page: 'piano', target: 'pn-lessons', kind: 'Keyboard lessons' }, { label: 'Synth keyboard', page: 'synth', kind: 'Instrument' }, { label: 'Wait / Tempo practice', page: 'shed', kind: 'Performance practice' }],
    guitar: [{ label: 'Guitar fretboard', page: 'fretboard', kind: 'Guitar' }, { label: 'Guitar tab & notation', page: 'tab', kind: 'Guitar' }, { label: 'Performance practice', page: 'shed', kind: 'Performance practice' }],
    bass: [{ label: 'Bass fretboard exercises', page: 'quiz', level: 'notes/nat/neck/1', kind: 'Four-string bass' }, { label: 'Bass performance practice', page: 'shed', kind: 'Performance practice' }, { label: 'Guitar tab reference', page: 'tab', kind: 'Shared reference · six-string guitar' }],
    drums: [{ label: 'Drum pads', page: 'pads', kind: 'Drums' }, { label: 'Drum & rhythm library', page: 'shed', kind: 'Rhythm practice' }],
    voice: [{ label: 'Ear-training exercises', page: 'quiz', level: 'notes/pitch/ear/1', kind: 'Shared ear training' }, { label: 'Monophonic pitch practice', page: 'shed', kind: 'Audio or virtual input' }, { label: 'Pitch tuner', page: 'tuner', kind: 'Pitch reference' }],
    other: [{ label: 'Performance practice', page: 'shed', kind: 'Explicit instrument selection' }, { label: 'Circle of fifths', page: 'theory', kind: 'Shared theory' }]
  };
  var saved = App.store.get('learn.instrument', 'piano'), selected = IDS.indexOf(saved) >= 0 ? saved : 'piano', bar = null;
  function esc(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function id(value) { return IDS.indexOf(value) >= 0 ? value : selected; }
  function set(value) {
    if (IDS.indexOf(value) < 0) return false;
    if (value === selected) return true;
    var previous = selected; selected = value; App.store.set('learn.instrument', value);
    App.emit('learn:instrument', { instrument: value, previous: previous });
    refresh(); return true;
  }
  function mount() {
    if (bar && document.documentElement.contains(bar)) return;
    var main = document.querySelector('main');
    if (!main) return;
    App.injectCSS('learn-instruments',
      '#learn-instruments{margin:0 0 18px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--card);display:grid;gap:12px}#learn-instruments[hidden]{display:none}#learn-instruments h2{font-size:20px;margin:0}#learn-instruments p{margin:0;line-height:1.5}.learn-inst-head{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.learn-inst-head label{display:grid;gap:5px;min-width:180px}.learn-inst-links{display:flex;gap:8px;flex-wrap:wrap}.learn-inst-links button{text-align:left;display:grid;gap:4px}.learn-inst-links small{font-size:11px;font-weight:400;opacity:.8}.learn-inst-session{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.learn-inst-category{font-weight:650;color:var(--accent)}@media(max-width:520px){.learn-inst-head label{width:100%}.learn-inst-links{display:grid;grid-template-columns:1fr 1fr}.learn-inst-links button{min-width:0;white-space:normal}}');
    bar = document.createElement('section'); bar.id = 'learn-instruments'; bar.setAttribute('aria-label', 'Learn instrument category');
    bar.innerHTML = '<div class="learn-inst-head"><div><h2>Learn by instrument</h2><p class="small muted">Choose your lesson and completion category.</p></div><label>Instrument<select id="learn-instrument" aria-label="Learn instrument">' + IDS.map(function (key) { return '<option value="' + key + '">' + LABEL[key] + '</option>'; }).join('') + '</select></label></div>' +
      '<p id="learn-instrument-note" class="small"></p><div id="learn-instrument-links" class="learn-inst-links"></div>' +
      '<p class="small muted">Notation, ear training and theory are shared content. Each run keeps the instrument selected at its start. Earlier unassigned history remains Legacy / unassigned.</p>' +
      '<div class="learn-inst-session" id="learn-instrument-session" role="status"></div>';
    main.insertBefore(bar, main.firstChild);
    bar.querySelector('select').addEventListener('change', function () { set(this.value); });
    bar.addEventListener('click', function (event) {
      var stop = event.target.closest && event.target.closest('#learn-stop-exercise');
      if (stop) { if (window.SLQuiz && SLQuiz.stop) SLQuiz.stop(); refresh(); return; }
      var button = event.target.closest && event.target.closest('[data-learn-entry]');
      if (!button) return;
      var entry = ENTRIES[selected][Number(button.dataset.learnEntry)];
      if (!entry) return;
      if (entry.page === 'shed') App.emit('learn:practice', { instrument: selected });
      if (entry.target === 'pn-lessons') App.emit('learn:lesson', { instrument: selected, kind: 'keys' });
      App.switchTo(entry.page);
      if (entry.level && window.SLQuiz) SLQuiz.start(entry.level);
      if (entry.target) { var target = document.getElementById(entry.target); if (target) target.scrollIntoView({ block: 'start' }); }
    });
  }
  function refresh() {
    mount(); if (!bar) return;
    bar.hidden = PAGES.indexOf(App.active) < 0;
    var running = !!(window.SLQuiz && SLQuiz.view === 'run' && SLQuiz.cur);
    var select = bar.querySelector('select'); select.value = selected; select.disabled = running;
    bar.querySelector('#learn-instrument-note').innerHTML = '<span class="learn-inst-category">' + LABEL[selected] + '</span> · ' + esc(NOTES[selected]);
    bar.querySelector('#learn-instrument-links').innerHTML = ENTRIES[selected].map(function (entry, index) { return '<button class="btn sm" type="button" data-learn-entry="' + index + '"' + (running ? ' disabled' : '') + '>' + esc(entry.label) + '<small>' + esc(entry.kind) + '</small></button>'; }).join('');
    bar.querySelector('#learn-instrument-session').innerHTML = running ? '<span class="small">Current exercise: ' + LABEL[id(SLQuiz.cur.instrument)] + '. End it before changing categories.</span><button class="btn sm" id="learn-stop-exercise" type="button">End exercise to switch instrument</button>' : '';
  }
  App.practiceInstrument = App.learnInstruments = {
    instruments: IDS.slice(), get current() { return selected; }, get: function () { return selected; }, set: set,
    snapshot: function () { return Object.freeze({ instrument: selected }); }, label: function (value) { return LABEL[id(value)]; },
    modes: function (value) { return MODES[id(value)].slice(); }, allowsMode: function (mode, value) { return MODES[id(value)].indexOf(mode) >= 0; },
    contentKind: function (mode, value) { return mode === 'neck' ? id(value) === 'bass' ? 'Four-string bass' : 'Six-string guitar' : mode === 'piano' ? 'Keyboard exercise' : 'Shared theory / ear training'; },
    entries: function (value) { return ENTRIES[id(value)].map(function (entry) { return Object.assign({}, entry); }); }, refresh: refresh
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh); else refresh();
})();
