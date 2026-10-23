/* Instrument-focused navigation hosts. Existing instrument/session owners keep
 * their routes and behavior; this module never awards progress or opens devices.
 * One Learn instrument service supplies Free Play, Library and Progress context.
 */
(function () {
  'use strict';
  var IDS = ['piano', 'synth', 'guitar', 'bass', 'drums', 'voice', 'other'];
  var FREE = ['freeplay', 'piano', 'synth', 'pads', 'fretboard', 'tab', 'notation', 'songs', 'jam', 'midihub', 'lumipractice'];
  var PRIMARY = { piano: ['piano', 'synth', 'pads'], synth: ['synth', 'piano', 'pads'], guitar: ['fretboard', 'tab', 'notation'], bass: ['freeplay', 'synth'], drums: ['pads', 'jam'], voice: ['freeplay', 'jam'], other: ['freeplay', 'synth'] };
  var DETAILS = {
    piano: 'Play the piano freely, explore synth sounds or use pads. Scale lessons and graded practice start from Learn or a Library score.',
    synth: 'Play the synth, explore sounds and connect MIDI. Free playing does not create a graded lesson or award practice time.',
    guitar: 'Explore the six-string fretboard, tab and notation, or play along with a song or backing band.',
    bass: 'Choose a sound or use your own bass input. The Guitar tab and neck remain six-string guitar references; bass note exercises are in Learn.',
    drums: 'Play drum pads or the backing band. Rudiments and structured rhythm practice remain in the Woodshed.',
    voice: 'Use the global tuner for pitch reference or sing with the backing band. Monophonic scored practice starts from a Library score.',
    other: 'Choose a sound or connect your instrument. Structured scores and explicit input selection are available from the Library.'
  };
  var TITLES = { piano: 'Piano', synth: 'Synth', pads: 'Drum pads', fretboard: 'Guitar fretboard', tab: 'Guitar tab', notation: 'Guitar notation', songs: 'Songs & tab player', jam: 'Backing band', midihub: 'MIDI Hub', lumipractice: 'LUMI practice', freeplay: 'Free Play overview' };
  var bar = null, freeRoot = null, progressRoot = null, progressController = null, banner = null;
  function esc(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function selected() { return App.practiceInstrument ? App.practiceInstrument.get() : 'piano'; }
  function label(id) { return App.practiceInstrument ? App.practiceInstrument.label(id) : id; }
  function options() { return IDS.map(function (id) { return '<option value="' + id + '">' + esc(label(id)) + '</option>'; }).join(''); }
  function freePlayPages() { return (PRIMARY[selected()] || PRIMARY.other).slice(); }
  function freePlayDefault() { return freePlayPages()[0]; }
  function launch(page) { if (page === 'shed') App.emit('learn:practice', { instrument: selected() }); App.switchTo(page); }
  function mountBar() {
    if (bar) return;
    bar = document.createElement('section'); bar.id = 'workflow-context'; bar.className = 'workflow-context';
    bar.setAttribute('aria-label', 'Current instrument and practice workflow');
    bar.innerHTML = '<label>Instrument<select id="workflow-instrument" aria-label="Current instrument">' + options() + '</select></label>' +
      '<p id="workflow-context-note" class="small muted"></p><button type="button" class="btn sm" id="workflow-resume" hidden>Practice saved section · new attempt</button>';
    var main = document.querySelector('main'); if (main) main.insertBefore(bar, main.firstChild);
    bar.querySelector('select').addEventListener('change', function () {
      var wasFree = FREE.indexOf(App.active) >= 0;
      if (App.practiceInstrument) App.practiceInstrument.set(this.value);
      if (wasFree) App.switchTo(freePlayDefault()); else refresh();
    });
    bar.querySelector('#workflow-resume').onclick = function () { if (window.PracticeMaterial) PracticeMaterial.resume(); };
  }
  function renderFree() {
    if (!freeRoot) return;
    var id = selected(), related = freePlayPages().filter(function (p) { return p !== 'freeplay'; });
    var saved = window.PracticeMaterial && PracticeMaterial.selection ? PracticeMaterial.selection() : null;
    freeRoot.innerHTML = '<div class="card workflow-home"><p class="workflow-kicker">' + esc(label(id)) + '</p><h1>Free Play</h1><p>' + esc(DETAILS[id]) + '</p>' +
      '<div class="workflow-cards">' + related.map(function (page) { return '<button type="button" class="btn" data-workflow-route="' + page + '">' + esc(TITLES[page]) + '</button>'; }).join('') + '</div>' +
      (saved ? '<button type="button" class="btn sm" data-workflow-resume>Practice saved section · new attempt</button><p class="small muted">Starts a new attempt from the saved section’s beginning; it does not resume an unfinished grade.</p>' : '') +
      '<details><summary>All instruments and tools</summary><p class="small muted">These tools keep their own instrument layout. Choosing one does not relabel it as your current instrument or award progress.</p><div class="workflow-cards">' + FREE.filter(function (p) { return p !== 'freeplay'; }).map(function (page) { return '<button type="button" class="btn sm" data-workflow-route="' + page + '">' + esc(TITLES[page]) + '</button>'; }).join('') + '</div></details></div>';
  }
  function renderProgress() {
    if (!progressRoot || !window.PracticeProgressUI) return;
    if (!progressController) progressController = PracticeProgressUI.mount(progressRoot.querySelector('#workflow-progress-host'), { instrument: selected() });
    if (progressController) progressController.setInstrument(selected());
  }
  function storageStatus(status) {
    if (!status) return;
    var unhealthy = status.available === false || status.recoveryRequired || status.needsReload || status.lastError ||
      status.pendingBlobs > 0 || Array.isArray(status.pendingStrictKeys) && status.pendingStrictKeys.length > 0 ||
      Array.isArray(status.pendingKeys) && status.pendingKeys.length > 0 || Array.isArray(status.issues) && status.issues.length > 0;
    if (!banner) {
      banner = document.createElement('aside'); banner.id = 'workflow-storage-status'; banner.setAttribute('role', 'status'); banner.hidden = true;
      banner.innerHTML = '<span></span><button type="button" class="btn sm">Storage settings</button>';
      banner.querySelector('button').onclick = function () { App.switchTo('settings'); };
      document.body.appendChild(banner);
    }
    banner.hidden = !unhealthy;
    banner.querySelector('span').textContent = status.recoveryRequired ? 'Storage recovery needs attention. Keep this app open and review Storage settings.' : status.needsReload ? 'Settings were restored. Reload from Storage settings to apply them safely.' : 'Some changes may not be saved. Review Storage settings before closing or updating.';
  }
  function refresh() {
    mountBar();
    var ownedLearn = ['quiz', 'chords', 'theory', 'practiceplan'].indexOf(App.active) >= 0;
    bar.hidden = ownedLearn || App.active === 'settings' || App.space === 'studio' || App.active === 'progress';
    bar.querySelector('select').value = selected();
    var inFree = FREE.indexOf(App.active) >= 0;
    bar.querySelector('#workflow-context-note').textContent = label(selected()) + (inFree ? ' · Free Play. Tools keep their own layout; start a lesson or score for measured practice.' : ' · Practice credit follows this instrument. The source score keeps its original instrument.');
    bar.querySelector('#workflow-resume').hidden = !inFree || !window.PracticeMaterial || !PracticeMaterial.selection || !PracticeMaterial.selection();
    if (App.active === 'freeplay') renderFree();
    if (App.active === 'progress') renderProgress();
  }
  App.workflow = { refresh: refresh, freePlayDefault: freePlayDefault, freePlayPages: freePlayPages, routes: FREE.slice() };
  App.register('freeplay', { init: function (root) { freeRoot = root; root.addEventListener('click', function (event) {
    var b = event.target.closest('[data-workflow-route]'); if (b) launch(b.dataset.workflowRoute);
    if (event.target.closest('[data-workflow-resume]') && window.PracticeMaterial) PracticeMaterial.resume();
  }); renderFree(); }, onShow: renderFree });
  App.register('progress', { init: function (root) {
    progressRoot = root; root.innerHTML = '<div class="workflow-progress"><h1>Progress</h1><p class="muted">Your instrument’s recorded sessions, practice goals and consistency history.</p><div id="workflow-progress-host"></div></div>';
    root.addEventListener('change', function (event) { if (event.target.matches('[data-pgu="instrument"]') && App.practiceInstrument) App.practiceInstrument.set(event.target.value); });
  }, onShow: renderProgress });
  App.on('learn:instrument', refresh);
  App.on('store:status', storageStatus);
  if (App.persistence && App.persistence.status) storageStatus(App.persistence.status());
})();
