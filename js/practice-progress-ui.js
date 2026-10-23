/* Instrument-specific practice history. All earned/decayed values come from
 * PracticeProgress; this view never awards, migrates, resets or invents data. */
(function () {
  'use strict';
  var serial = 0, mounted = [], observing = false;
  var INSTRUMENTS = ['piano', 'synth', 'guitar', 'bass', 'drums', 'voice', 'other'];
  var LABELS = { piano: 'Piano', synth: 'Synth', guitar: 'Guitar', bass: 'Bass', drums: 'Drums', voice: 'Voice', other: 'Other' };
  var FIELDS = [
    ['dailyMinutes', 'Daily goal (engaged minutes)', 1, 1440, 1],
    ['xpPerMinute', 'XP per engaged minute', 0, 1000, 'any'],
    ['xpPerCorrectNote', 'XP per correctly matched note', 0, 100, 'any'],
    ['correctNoteXPCap', 'Correct-note XP cap per session', 0, 100000, 'any'],
    ['streakBonusPercent', 'Streak bonus per day (%)', 0, 100, 'any'],
    ['streakBonusCapPercent', 'Maximum streak bonus (%)', 0, 500, 'any'],
    ['graceDays', 'Inactive grace days before decay', 0, 365, 1],
    ['decayPercent', 'Consistency decay per day (%)', 0, 100, 'any'],
    ['decayDailyCap', 'Maximum consistency XP lost per day', 0, 1000000, 'any'],
    ['decayFloor', 'Consistency XP floor', 0, 1000000000, 'any'],
    ['xpPerLevel', 'Consistency XP per level', 1, 1000000, 'any']
  ];
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function count(value) { return finite(value) && value >= 0 ? value : 0; }
  function number(value, places) { return finite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: places == null ? 1 : places }) : '—'; }
  function dayCount(value) { return number(count(value), 0) + (value === 1 ? ' day' : ' days'); }
  function dateLabel(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return String(date || '');
    return new Date(date + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  function tempoText(value) {
    if (finite(value) && value > 0) return number(value, 0) + ' BPM';
    if (!value || typeof value !== 'object') return '—';
    var lo = value.min, hi = value.max;
    if (finite(lo) && finite(hi) && lo > 0 && hi > 0) return number(lo, 0) + (lo === hi ? '' : '–' + number(hi, 0)) + ' BPM';
    return finite(value.max) && value.max > 0 ? number(value.max, 0) + ' BPM' : finite(value.latest) && value.latest > 0 ? number(value.latest, 0) + ' BPM' : '—';
  }
  function style() {
    App.injectCSS('practice-progress-ui',
      '.pgu{margin-top:16px}.pgu-head,.pgu-toolbar,.pgu-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.pgu h2,.pgu h3{margin-top:0}.pgu-head h2{margin-bottom:4px}.pgu-head p{margin:0;max-width:690px}.pgu-select{display:grid;gap:5px;min-width:150px}.pgu-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px;margin:16px 0}.pgu-stat{border:1px solid var(--line);border-radius:10px;padding:12px;background:var(--card2);min-width:0}.pgu-stat dt{font-size:12px;color:var(--muted)}.pgu-stat dd{font-size:25px;font-weight:650;margin:7px 0 5px;font-variant-numeric:tabular-nums}.pgu-stat small{display:block;line-height:1.5;color:var(--muted)}.pgu-goal{display:grid;gap:6px;margin-bottom:14px}.pgu-goal progress{width:100%;height:14px}.pgu-ranges{display:flex;gap:5px;flex-wrap:wrap}.pgu-ranges button[aria-pressed=true]{background:var(--accent);color:var(--bg,#18151a)}.pgu-chart{margin:10px 0}.pgu-chart svg{display:block;width:100%;height:auto;min-height:140px;max-height:250px}.pgu-empty{padding:18px;border:1px dashed var(--line);border-radius:9px;color:var(--muted)}.pgu-table-wrap{overflow-x:auto;max-width:100%;margin:12px 0}.pgu table{border-collapse:collapse;width:100%;font-size:12px;min-width:700px}.pgu caption{text-align:left;font-weight:600;padding:8px 0}.pgu th,.pgu td{text-align:left;border-bottom:1px solid var(--line);padding:9px 10px;vertical-align:top}.pgu th{color:var(--muted)}.pgu-settings{margin-top:16px;border-top:1px solid var(--line);padding-top:14px}.pgu-settings summary{cursor:pointer;font-weight:600}.pgu-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:13px;margin:14px 0}.pgu-field{display:grid;gap:5px;font-size:13px}.pgu-field input{width:100%;min-width:0;box-sizing:border-box}.pgu-check{display:flex;align-items:center;gap:8px}.pgu-check input{width:auto}.pgu-error{border-left:3px solid var(--red,#ef6576);padding:9px 12px;margin:10px 0}.pgu-error ul{margin:5px 0 0;padding-left:18px}.pgu-vacation{border-top:1px solid var(--line);padding-top:12px;margin-top:14px}.pgu-vacation-fields{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}.pgu-vacation-fields label{flex:1 1 160px}.pgu-status{min-height:20px;margin:10px 0 0}.pgu [hidden]{display:none!important}.pgu button:focus-visible,.pgu input:focus-visible,.pgu select:focus-visible,.pgu summary:focus-visible{outline:3px solid var(--accent);outline-offset:3px}@media(max-width:520px){.pgu-head{align-items:stretch}.pgu-select{width:100%}.pgu-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.pgu-stat{padding:10px}.pgu-stat dd{font-size:22px}.pgu-fields{grid-template-columns:1fr}.pgu-actions .btn{flex:1 1 auto}}'
    );
  }
  function mount(root, options) {
    options = options || {};
    if (!root || !root.querySelector) throw new Error('PracticeProgressUI.mount needs a DOM element.');
    if (root._practiceProgressUI) root._practiceProgressUI.unmount();
    var api = App.practiceProgress;
    if (!api || typeof api.summary !== 'function') { root.textContent = 'Practice progress is unavailable.'; return null; }
    style();
    var id = 'pgu-' + (++serial), disposed = false, dirty = false;
    var storedInstrument = App.store.get('progress.ui.instrument', null);
    var instrument = INSTRUMENTS.indexOf(storedInstrument) >= 0 ? storedInstrument : INSTRUMENTS.indexOf(options.instrument) >= 0 ? options.instrument : 'piano';
    var days = App.store.get('progress.ui.rangeDays', 30);
    if ([7, 30, 90].indexOf(days) < 0) days = 30;
    function q(name) { return root.querySelector('[data-pgu="' + name + '"]'); }
    root.innerHTML = '<section class="card pgu" aria-labelledby="' + id + '-title"><div class="pgu-head"><div><h2 id="' + id + '-title">Practice progress</h2>' +
      '<p class="small muted">Earned XP records your practice. Consistency XP and its level can decline after time away; that is not a measured loss of musical skill.</p></div>' +
      '<label class="pgu-select">Instrument<select data-pgu="instrument" aria-label="Progress instrument">' + INSTRUMENTS.map(function (key) { return '<option value="' + key + '">' + LABELS[key] + '</option>'; }).join('') + '</select></label></div>' +
      '<dl class="pgu-cards" data-pgu="cards"></dl><div class="pgu-goal" data-pgu="goal"></div>' +
      '<div class="pgu-toolbar"><h3 style="margin:0">Recorded history</h3><div class="pgu-ranges" role="group" aria-label="Progress history range">' + [7, 30, 90].map(function (n) { return '<button class="btn sm" type="button" data-pgu-days="' + n + '" aria-pressed="false">' + n + ' days</button>'; }).join('') + '</div></div>' +
      '<p data-pgu="range-summary" class="small muted"></p><div data-pgu="chart" class="pgu-chart"></div><div data-pgu="history" class="pgu-table-wrap"></div>' +
      '<details class="pgu-settings" data-pgu="settings"><summary>Goals, XP and consistency settings</summary><p class="small muted">These parameters apply to all instruments. They do not erase sessions or rewrite lifetime earned XP. Future sessions keep the earning parameters recorded with them.</p>' +
      '<form data-pgu="form" novalidate><div class="pgu-fields">' + FIELDS.map(function (field) { return '<label class="pgu-field" for="' + id + '-' + field[0] + '">' + field[1] + '<input id="' + id + '-' + field[0] + '" data-pgu-field="' + field[0] + '" type="number" min="' + field[2] + '" max="' + field[3] + '" step="' + field[4] + '" required></label>'; }).join('') +
      '<label class="pgu-field" for="' + id + '-timezone">Practice timezone (IANA)<input id="' + id + '-timezone" data-pgu-field="timezone" type="text" placeholder="Etc/UTC" required autocomplete="off"></label></div>' +
      '<label class="pgu-check"><input data-pgu-field="decayEnabled" type="checkbox"> Apply consistency decay after the grace period</label>' +
      '<p class="small muted">Decay is a percentage of consistency XP per inactive day, bounded by the daily XP cap and floor. Vacation dates pause decay. Timezone changes apply to future calendar allocation.</p>' +
      '<div data-pgu="errors" class="pgu-error" role="alert" hidden></div><div class="pgu-actions"><button class="btn primary" type="submit">Save progress settings</button><button class="btn" data-pgu="export" type="button">Export progress JSON</button></div></form>' +
      '<div class="pgu-vacation"><h3>Vacation / planned break</h3><p data-pgu="vacations" class="small muted"></p><div class="pgu-vacation-fields"><label class="pgu-field">From<input data-pgu="vacation-from" type="date"></label><label class="pgu-field">Through<input data-pgu="vacation-to" type="date"></label>' +
      '<button class="btn sm" data-pgu="vacation-add" type="button">Add vacation dates</button><button class="btn sm" data-pgu="vacation-clear" type="button">Clear vacation dates</button></div><p class="small muted">Dates include both endpoints. Clearing these dates changes the break setting; it does not delete practice history.</p></div></details>' +
      '<p data-pgu="status" class="pgu-status small" role="status" aria-live="polite"></p></section>';
    q('instrument').value = instrument;
    function message(text) { q('status').textContent = text; }
    function errors(list) {
      if (!list) { q('errors').hidden = true; q('errors').textContent = ''; return; }
      if (!Array.isArray(list)) list = typeof list === 'object' ? Object.keys(list).map(function (key) { return key + ': ' + list[key]; }) : [String(list)];
      q('errors').innerHTML = '<b>Settings were not saved.</b><ul>' + list.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>';
      q('errors').hidden = false;
    }
    function card(label, value, explanation, key) { return '<div class="pgu-stat" data-pgu-stat="' + key + '"><dt>' + label + '</dt><dd>' + value + '</dd><small>' + explanation + '</small></div>'; }
    function chart(daily) {
      var rows = daily.filter(function (d) { return d.hasObservation || count(d.sessionCount) > 0; });
      if (!rows.length) { q('chart').innerHTML = '<p class="pgu-empty">No recorded practice observations in this range. Start a performance to build this instrument’s history.</p>'; return; }
      var width = 760, height = 190, left = 48, right = 18, top = 18, bottom = 38;
      var max = Math.max(1, Math.max.apply(null, rows.map(function (d) { return count(d.engagedSeconds) / 60; })));
      var unit = (width - left - right) / Math.max(1, daily.length), plotHeight = height - top - bottom;
      var bars = '', labels = '', labelEvery = Math.max(1, Math.ceil(daily.length / 8));
      daily.forEach(function (d, index) {
        var observed = d.hasObservation || count(d.sessionCount) > 0;
        var minutes = count(d.engagedSeconds) / 60, x = left + index * unit + unit * 0.15;
        var barHeight = minutes / max * plotHeight, y = height - bottom - barHeight;
        if (observed) bars += '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + Math.max(1, unit * 0.7).toFixed(2) + '" height="' + barHeight.toFixed(2) + '" fill="var(--accent,#e6a84b)"><title>' + esc(d.date) + ': ' + number(minutes) + ' engaged minutes</title></rect>';
        var lastIndex = daily.length - 1;
        if (index === lastIndex || index % labelEvery === 0 && lastIndex - index >= labelEvery * 0.75) labels += '<text x="' + (x + unit * 0.35).toFixed(2) + '" y="' + (height - 12) + '" text-anchor="middle" fill="currentColor" font-size="11">' + esc(dateLabel(d.date)) + '</text>';
      });
      q('chart').innerHTML = '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-labelledby="' + id + '-chart-title ' + id + '-chart-desc"><title id="' + id + '-chart-title">' + LABELS[instrument] + ': engaged practice minutes per day</title><desc id="' + id + '-chart-desc">' + rows.length + ' of ' + daily.length + ' days have recorded observations. Blank positions have no practice observations. Exact values are in the history table.</desc>' +
        '<line x1="' + left + '" y1="' + (height - bottom) + '" x2="' + (width - right) + '" y2="' + (height - bottom) + '" stroke="currentColor" opacity=".35"/>' +
        '<text x="' + (left - 8) + '" y="' + (top + 6) + '" text-anchor="end" fill="currentColor" font-size="11">' + number(max) + '</text><text x="' + (left - 8) + '" y="' + (height - bottom + 4) + '" text-anchor="end" fill="currentColor" font-size="11">0</text>' + bars + labels + '</svg>';
    }
    function table(daily) {
      var rows = daily.filter(function (d) { return d.hasObservation || count(d.sessionCount) > 0; });
      if (!rows.length) { q('history').innerHTML = ''; return; }
      q('history').innerHTML = '<table><caption>Recorded ' + LABELS[instrument].toLowerCase() + ' practice days · last ' + days + ' days</caption><thead><tr><th scope="col">Date</th><th scope="col">Engaged minutes</th><th scope="col">Earned XP</th><th scope="col">Raw accuracy</th><th scope="col">Measured timing</th><th scope="col">Observed tempo</th><th scope="col">Completed tempo</th></tr></thead><tbody>' + rows.map(function (d) {
        var denominator = count(d.expected) + count(d.extra), accuracy = denominator > 0 && finite(d.accuracy) ? number(d.accuracy) + '%<br><small>' + number(count(d.matched), 0) + '/' + number(denominator, 0) + ' notes</small>' : '—';
        var timing = count(d.timingSamples) > 0 && finite(d.meanAbsTimingMs) ? number(d.meanAbsTimingMs, 0) + ' ms<br><small>' + number(d.timingSamples, 0) + ' onsets</small>' : '—';
        return '<tr><th scope="row"><time datetime="' + esc(d.date) + '">' + esc(d.date) + '</time></th><td>' + number(count(d.engagedSeconds) / 60) + '</td><td>' + number(count(d.earnedXP)) + '</td><td>' + accuracy + '</td><td>' + timing + '</td><td>' + tempoText(d.observedTempo) + '</td><td>' + tempoText(d.completedTempo) + '</td></tr>';
      }).join('') + '</tbody></table>';
    }
    function refresh() {
      if (disposed) return;
      var summary, settings;
      try { summary = api.summary(instrument, { rangeDays: days }); settings = api.getSettings(); }
      catch (error) { message('Progress could not be loaded: ' + error.message); return; }
      var today = summary.today || {}, daily = Array.isArray(summary.daily) ? summary.daily : [];
      var denominator = count(summary.expected) + count(summary.extra), observed = daily.filter(function (d) { return d.hasObservation || count(d.sessionCount) > 0; }).length;
      var accuracy = denominator > 0 && finite(summary.accuracy) ? number(summary.accuracy) + '%' : '—';
      var timing = count(summary.timingSamples) > 0 && finite(summary.meanAbsTimingMs) ? number(summary.meanAbsTimingMs, 0) + ' ms' : '—';
      q('cards').innerHTML = card('Lifetime earned XP', number(count(summary.lifetimeEarnedXP)), 'Recorded earnings stay intact when consistency decays.', 'earned') +
        card('Consistency XP · level ' + number(count(summary.level), 0), number(count(summary.currentXP)), 'This balance can decay after inactivity; it is not a measured skill level.', 'consistency') +
        card('Current streak', dayCount(summary.currentStreak), 'Best recorded streak: ' + dayCount(summary.bestStreak) + '.', 'streak') +
        card('Lifetime engaged practice', number(count(summary.totalEngagedSeconds) / 60, 2) + ' min', number(count(summary.sessionCount), 0) + ' recorded sessions for ' + LABELS[instrument].toLowerCase() + '.', 'minutes') +
        card('Lifetime raw note accuracy', accuracy, denominator > 0 ? number(count(summary.matched), 0) + ' matched / (' + number(count(summary.expected), 0) + ' expected + ' + number(count(summary.extra), 0) + ' extra). Raw mistakes count before sound filtering.' : 'No scored note observations yet.', 'accuracy') +
        card('Mean absolute timing', timing, count(summary.timingSamples) > 0 ? number(summary.timingSamples, 0) + ' measured onsets; timing is separate from note accuracy.' : 'No measured timed onsets yet. Wait-mode practice does not imply timing accuracy.', 'timing') +
        card('Observed tempo', tempoText(summary.observedTempo), 'Tempo seen during recorded practice, including unfinished runs.', 'observed-tempo') +
        card('Completed tempo', tempoText(summary.completedTempo), 'Tempo of completed runs; completion does not certify note accuracy.', 'completed-tempo');
      var goal = finite(today.goalMinutes) && today.goalMinutes > 0 ? today.goalMinutes : settings.dailyMinutes;
      var minutes = count(today.engagedSeconds) / 60;
      q('goal').innerHTML = '<label for="' + id + '-goal">Today: ' + number(minutes) + ' / ' + number(goal) + ' engaged minutes' + (today.vacation ? ' · vacation date' : today.qualifies ? ' · goal reached' : '') + '</label><progress id="' + id + '-goal" max="' + goal + '" value="' + Math.min(goal, minutes) + '"></progress><span class="small muted">Calendar: ' + esc(settings.timezone) + '. Activity is assigned to its recorded instrument.</span>';
      var range = summary.range || {}, rangeDenominator = count(range.expected) + count(range.extra);
      var rangeAccuracy = rangeDenominator > 0 && finite(range.accuracy) ? number(range.accuracy) + '% raw accuracy (' + number(count(range.matched), 0) + '/' + number(rangeDenominator, 0) + ' notes)' : 'no scored note observations';
      q('range-summary').textContent = LABELS[instrument] + ' · last ' + days + ' calendar days · ' + dayCount(observed) + ' with recorded practice · ' + number(count(range.engagedSeconds) / 60, 2) + ' engaged minutes · ' + rangeAccuracy + '. Missing timing or tempo stays unknown.';
      root.querySelectorAll('[data-pgu-days]').forEach(function (button) { button.setAttribute('aria-pressed', String(Number(button.dataset.pguDays) === days)); });
      chart(daily); table(daily);
      if (!dirty) root.querySelectorAll('[data-pgu-field]').forEach(function (input) { var value = settings[input.dataset.pguField]; if (input.type === 'checkbox') input.checked = value === true; else input.value = value == null ? '' : String(value); });
      var vacations = Array.isArray(settings.vacations) ? settings.vacations : [];
      q('vacations').textContent = vacations.length ? 'Planned breaks: ' + vacations.map(function (v) { return v.from + ' through ' + v.to; }).join('; ') + '.' : 'No vacation dates set.';
      q('vacation-clear').disabled = !vacations.length;
    }
    q('instrument').addEventListener('change', function () {
      instrument = this.value; App.store.set('progress.ui.instrument', instrument); refresh();
      if (typeof options.onInstrumentChange === 'function') options.onInstrumentChange(instrument);
    });
    root.querySelectorAll('[data-pgu-days]').forEach(function (button) { button.addEventListener('click', function () { days = Number(this.dataset.pguDays); App.store.set('progress.ui.rangeDays', days); refresh(); }); });
    q('form').addEventListener('input', function () { dirty = true; });
    q('form').addEventListener('submit', function (event) {
      event.preventDefault(); var patch = {}, invalid = [];
      root.querySelectorAll('[data-pgu-field]').forEach(function (input) {
        var key = input.dataset.pguField;
        if (input.type === 'checkbox') patch[key] = input.checked;
        else if (key === 'timezone') patch[key] = input.value.trim();
        else if (input.value.trim() === '' || !Number.isFinite(Number(input.value))) invalid.push(key + ' must be a finite number.');
        else patch[key] = Number(input.value);
      });
      if (invalid.length) { errors(invalid); return; }
      try {
        var result = api.updateSettings(patch);
        if (!result || result.ok !== true) { errors(result && result.errors || ['The progress service rejected these settings.']); return; }
        dirty = false; errors(null); refresh(); message('Progress settings saved. Recorded sessions and lifetime earned XP are unchanged.');
      } catch (error) { errors([error.message]); }
    });
    q('export').addEventListener('click', function () {
      try {
        var blob = new Blob([JSON.stringify(api.exportData(), null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = 'soundlab-practice-progress.json'; link.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        message('Progress export downloaded. Keep the file as a separate backup.');
      } catch (error) { message('Export failed: ' + error.message); }
    });
    q('vacation-add').addEventListener('click', function () {
      var from = q('vacation-from').value, to = q('vacation-to').value;
      if (!from || !to || from > to) { errors(['Choose a vacation start date and an end date on or after it.']); return; }
      try { var result = api.setVacation({ from: from, to: to }); if (result && result.ok === false) { errors(result.errors); return; } errors(null); refresh(); message('Vacation dates saved.'); }
      catch (error) { errors([error.message]); }
    });
    q('vacation-clear').addEventListener('click', function () {
      try { var result = api.setVacation(null); if (result && result.ok === false) { errors(result.errors); return; } errors(null); refresh(); message('Vacation dates cleared. Practice history is unchanged.'); }
      catch (error) { errors([error.message]); }
    });
    var controller = { refresh: refresh, setInstrument: function (value) { if (INSTRUMENTS.indexOf(value) < 0) return false; instrument = value; q('instrument').value = value; App.store.set('progress.ui.instrument', value); refresh(); return true; },
      get instrument() { return instrument; }, unmount: function () { disposed = true; mounted = mounted.filter(function (entry) { return entry.controller !== controller; }); if (root._practiceProgressUI === controller) delete root._practiceProgressUI; } };
    root._practiceProgressUI = controller;
    mounted.push({ root: root, controller: controller });
    if (!observing) {
      observing = true;
      // App.on has no unsubscribe operation. One shared observer avoids
      // accumulating a listener on each Woodshed library render.
      App.on('practice:progress', function () {
        mounted = mounted.filter(function (entry) { return document.documentElement.contains(entry.root); });
        mounted.forEach(function (entry) { entry.controller.refresh(); });
      });
    }
    refresh(); return controller;
  }
  window.PracticeProgressUI = { mount: mount, instruments: INSTRUMENTS.slice() };
})();
