/* Deterministic observed-practice ledger. No timers, hardware or legacy migration.
 * Awards are immutable per session ID; only current consistency XP can decay.
 * Calendar dates are IANA-zone labels, advanced as dates (never 24-hour offsets).
 * Measured seconds may have daily segments. Note/timing/tempo observations stay
 * on the session-end date; absent segments, seconds do too, explicitly labelled.
 */
(function (root, factory) {
  'use strict';
  var Core = factory();
  if (typeof module === 'object' && module.exports) module.exports = Core;
  if (root) {
    root.PracticeProgress = Core;
    if (root.App) {
      try { root.App.practiceProgress = new Core({ store: root.App.store, onChange: function (event) { root.App.emit('practice:progress', event); } }); }
      catch (error) { root.App.practiceProgressError = error.message; }
    }
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var KEY = 'practice.progress.v1', IDS = ['piano', 'synth', 'guitar', 'bass', 'drums', 'voice', 'other'];
  var DEFAULTS = { dailyMinutes: 10, xpPerMinute: 2, xpPerCorrectNote: 0, correctNoteXPCap: 100,
    streakBonusPercent: 5, streakBonusCapPercent: 25, graceDays: 3, decayEnabled: true,
    decayPercent: 2, decayDailyCap: 20, decayFloor: 0, xpPerLevel: 100, vacations: [] };
  var BOUNDS = { dailyMinutes: [1, 1440], xpPerMinute: [0, 1000], xpPerCorrectNote: [0, 100],
    correctNoteXPCap: [0, 100000], streakBonusPercent: [0, 100], streakBonusCapPercent: [0, 500],
    graceDays: [0, 365], decayPercent: [0, 100], decayDailyCap: [0, 1000000], decayFloor: [0, 1000000000], xpPerLevel: [1, 1000000] };
  var MAX = Number.MAX_SAFE_INTEGER;
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function round(n) { return Math.round(n * 1000000) / 1000000; }
  function finite(n) { return typeof n === 'number' && Number.isFinite(n); }
  function dateValid(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + 'T00:00:00.000Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }
  function addDay(s, n) { return new Date(Date.parse(s + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
  function zoneValid(zone) { try { return typeof zone === 'string' && zone.length < 100 && !!new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(0); } catch (e) { return false; } }
  function dayIn(ms, zone) {
    if (!finite(ms) || !Number.isFinite(new Date(ms).getTime())) throw new RangeError('A finite epoch-millisecond timestamp is required.');
    var p = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ms), parts = {};
    p.forEach(function (v) { parts[v.type] = v.value; });
    return parts.year.padStart(4, '0') + '-' + parts.month + '-' + parts.day;
  }
  function normalizedVacations(ranges) {
    var out = [];
    ranges.slice().sort(function (a, b) { return a.from.localeCompare(b.from); }).forEach(function (r) {
      var last = out[out.length - 1];
      if (last && (last.to === '9999-12-31' || r.from <= addDay(last.to, 1))) last.to = last.to > r.to ? last.to : r.to;
      else out.push({ from: r.from, to: r.to });
    });
    return out;
  }
  function settingErrors(patch) {
    var errors = [];
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return ['Settings must be an object.'];
    Object.keys(patch).forEach(function (k) {
      var v = patch[k], b = BOUNDS[k];
      if (b && (!finite(v) || v < b[0] || v > b[1] || k === 'graceDays' && !Number.isInteger(v))) errors.push(k + ' must be ' + (k === 'graceDays' ? 'an integer ' : '') + 'between ' + b[0] + ' and ' + b[1] + '.');
      else if (k === 'timezone' && !zoneValid(v)) errors.push('timezone must be a valid IANA time zone.');
      else if (k === 'decayEnabled' && typeof v !== 'boolean') errors.push('decayEnabled must be boolean.');
      else if (k === 'vacations' && (!Array.isArray(v) || v.some(function (r) { return !r || !dateValid(r.from) || !dateValid(r.to) || r.from > r.to; }))) errors.push('vacations need valid inclusive from/to calendar dates.');
      else if (!b && ['timezone', 'decayEnabled', 'vacations'].indexOf(k) < 0) errors.push('Unknown setting: ' + k + '.');
    });
    return errors;
  }
  function instrument(id) { if (IDS.indexOf(id) < 0) throw new RangeError('Choose an explicit supported instrument.'); return id; }
  function fullSettings(settings) { return !!settings && !Object.keys(DEFAULTS).concat(['timezone']).some(function (k) { return !Object.prototype.hasOwnProperty.call(settings, k); }) && !settingErrors(settings).length; }
  function storedValid(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.sessions) || !data.ledgers || typeof data.ledgers !== 'object' || Array.isArray(data.ledgers) || !data.goals || typeof data.goals !== 'object' || Array.isArray(data.goals) || !fullSettings(data.settings)) return false;
    var ids = new Set();
    if (data.sessions.some(function (s) {
      if (!s || typeof s.id !== 'string' || !s.id.trim() || s.id.length > 128 || ids.has(s.id) || IDS.indexOf(s.instrument) < 0 || !dateValid(s.date) || !zoneValid(s.timezone) ||
          !finite(s.startedAt) || s.startedAt < 0 || !finite(s.endedAt) || s.endedAt < s.startedAt || !finite(s.engagedSeconds) || s.engagedSeconds < 0 || s.engagedSeconds > 2678400 || s.engagedSeconds > (s.endedAt - s.startedAt) / 1000 + 0.001 ||
          !finite(s.recordedAt) || !finite(s.earnedXP) || s.earnedXP < 0 || !Array.isArray(s.allocations) || !s.allocations.length || !Array.isArray(s.segments) || !s.award || !fullSettings(s.award.settings) ||
          !data.ledgers[s.instrument] || !data.goals[s.instrument] || Array.isArray(data.goals[s.instrument]) || !finite(data.goals[s.instrument][s.date]) || typeof s.mode !== 'string' || !s.mode || s.mode.length > 40 || ['complete', 'partial', 'stopped'].indexOf(s.status) < 0 ||
          ['measured-segments', 'session-end', 'segment-end'].indexOf(s.allocation) < 0 || s.observationAllocation !== 'session-end' || s.date !== dayIn(s.endedAt, s.timezone) ||
          s.tempo != null && (!finite(s.tempo) || s.tempo <= 0 || s.tempo > 1000)) return true;
      ids.add(s.id);
      if (['expected', 'matched', 'missed', 'extra', 'wrong', 'timingSamples'].some(function (k) { return !Number.isInteger(s[k]) || s[k] < 0 || s[k] > 1000000000; }) ||
          s.matched + s.missed > s.expected || s.wrong > s.extra || s.timingSamples > s.matched || s.mode === 'wait' && s.timingSamples > 0 ||
          !finite(s.sumAbsTimingMs) || s.sumAbsTimingMs < 0 || !finite(s.sumTimingMs) || Math.abs(s.sumTimingMs) > s.sumAbsTimingMs + 0.000001 || !s.timingSamples && (s.sumAbsTimingMs !== 0 || s.sumTimingMs !== 0) ||
          ['baseXP', 'noteXP', 'streakDays', 'bonusPercent'].some(function (k) { return !finite(s.award[k]) || s.award[k] < 0; }) || !Number.isInteger(s.award.streakDays)) return true;
      var awardBase = s.engagedSeconds / 60 * s.award.settings.xpPerMinute, awardNote = s.engagedSeconds >= 1 ? Math.min(s.matched * s.award.settings.xpPerCorrectNote, s.award.settings.correctNoteXPCap) : 0;
      var bonus = Math.min(Math.max(0, s.award.streakDays - 1) * s.award.settings.streakBonusPercent, s.award.settings.streakBonusCapPercent);
      if (Math.abs(s.award.baseXP - round(awardBase)) > 0.000001 || Math.abs(s.award.noteXP - round(awardNote)) > 0.000001 || s.award.bonusPercent !== bonus || Math.abs(s.earnedXP - round((awardBase + awardNote) * (1 + bonus / 100))) > 0.000001) return true;
      var segmentSeconds = 0, lastEnd = s.startedAt;
      if (s.segments.some(function (g) {
        if (!g || !finite(g.startedAt) || !finite(g.endedAt) || g.startedAt < lastEnd || g.endedAt < g.startedAt || g.endedAt > s.endedAt || !finite(g.engagedSeconds) || g.engagedSeconds < 0 || g.engagedSeconds > (g.endedAt - g.startedAt) / 1000 + 0.001 || !dateValid(g.date)) return true;
        segmentSeconds += g.engagedSeconds; lastEnd = g.endedAt; return false;
      }) || s.segments.length && Math.abs(segmentSeconds - s.engagedSeconds) > 0.001) return true;
      var seconds = 0;
      if (s.allocations.some(function (a) { if (!a || !dateValid(a.date) || !finite(a.engagedSeconds) || a.engagedSeconds < 0 || !finite(data.goals[s.instrument][a.date])) return true; seconds += a.engagedSeconds; return false; })) return true;
      return Math.abs(seconds - s.engagedSeconds) > 0.001;
    })) return false;
    return !Object.keys(data.ledgers).some(function (id) {
      var l = data.ledgers[id];
      if (IDS.indexOf(id) < 0 || !l || ['currentXP', 'lifetimeEarnedXP', 'totalDecayedXP'].some(function (k) { return !finite(l[k]) || l[k] < 0 || l[k] > MAX; }) ||
          !Number.isInteger(l.missedDays) || l.missedDays < 0 || !dateValid(l.firstObservedDate) || !dateValid(l.closedThrough) || !Array.isArray(l.decays)) return true;
      if (l.decays.some(function (e) { return !e || !dateValid(e.date) || !finite(e.xp) || e.xp < 0 || !zoneValid(e.timezone); })) return true;
      if (l.protectedDates != null && (!Array.isArray(l.protectedDates) || l.protectedDates.some(function (d) { return !dateValid(d); }))) return true;
      var earned = data.sessions.filter(function (s) { return s.instrument === id; }).reduce(function (n, s) { return n + s.earnedXP; }, 0);
      var decayed = l.decays.reduce(function (n, e) { return n + e.xp; }, 0);
      return Math.abs(earned - l.lifetimeEarnedXP) > 0.0001 || Math.abs(decayed - l.totalDecayedXP) > 0.0001 || Math.abs(earned - decayed - l.currentXP) > 0.0001;
    }) && !Object.keys(data.goals).some(function (id) { return IDS.indexOf(id) < 0 || !data.goals[id] || Object.keys(data.goals[id]).some(function (d) { return !dateValid(d) || !finite(data.goals[id][d]) || data.goals[id][d] < 1 || data.goals[id][d] > 1440; }); });
  }
  function emptyStore() { var data = {}; return { get: function (k, fallback) { return Object.prototype.hasOwnProperty.call(data, k) ? clone(data[k]) : fallback; }, set: function (k, v) { data[k] = clone(v); } }; }
  function PracticeProgress(options) {
    options = options || {};
    this.store = options.store || emptyStore(); this.now = options.now || Date.now;
    this.onChange = typeof options.onChange === 'function' ? options.onChange : function () {};
    var zone = typeof options.timezone === 'function' ? options.timezone() : options.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    if (!zoneValid(zone)) throw new RangeError('Invalid initial time zone.');
    var loaded = this.store.get(KEY, null);
    if (loaded != null) {
      if (!storedValid(loaded)) throw new Error('Stored practice progress is invalid or unsupported; it was left unchanged.');
      this.data = clone(loaded);
    } else this.data = { version: 1, settings: Object.assign(clone(DEFAULTS), { timezone: zone }), sessions: [], ledgers: {}, goals: {} };
    this._persistedRevision = typeof this.store.revision === 'function' ? this.store.revision(KEY) : null;
    this.persistenceError = null;
  }
  PracticeProgress.instruments = IDS.slice(); PracticeProgress.storageKey = KEY;
  Object.defineProperty(PracticeProgress.prototype, 'instruments', { get: function () { return IDS.slice(); } });
  PracticeProgress.prototype.dayKey = function (ms) { return dayIn(ms, this.data.settings.timezone); };
  PracticeProgress.prototype._sync = function () {
    if (typeof this.store.revision !== 'function') return { ok: true };
    try {
      var revision = this.store.revision(KEY);
      if (revision === this._persistedRevision) return { ok: true };
      var loaded = this.store.get(KEY, null);
      if (!storedValid(loaded)) throw new Error('Stored progress changed to missing, corrupt or unsupported data. Export/recover it before recording more practice.');
      // Refresh a stale tab before deriving awards. Never merge/reprice already
      // awarded sessions or replace another instrument's observations.
      this.data = clone(loaded); this._persistedRevision = revision; this.persistenceError = null;
      return { ok: true };
    } catch (error) {
      this.persistenceError = error.message;
      return { ok: false, errors: [error.message] };
    }
  };
  PracticeProgress.prototype.getSettings = function () { this._sync(); return clone(this.data.settings); };
  PracticeProgress.prototype._commit = function (next, event) {
    try {
      if (typeof this.store.write === 'function') {
        var write = this.store.write(KEY, clone(next), { expectedRevision: this._persistedRevision });
        if (!write || !write.ok) return { ok: false, errors: write && write.errors || ['Practice progress changed in another tab or could not be persisted. Retry the original session.'] };
      } else this.store.set(KEY, clone(next));
      if (JSON.stringify(this.store.get(KEY, null)) !== JSON.stringify(next)) return { ok: false, errors: ['Practice progress could not be persisted.'] };
    } catch (e) { return { ok: false, errors: ['Practice progress could not be persisted: ' + e.message] }; }
    this.data = next;
    this._persistedRevision = typeof this.store.revision === 'function' ? this.store.revision(KEY) : null;
    this.persistenceError = null;
    try { this.onChange(event); } catch (e) { /* a view cannot undo a saved observation */ }
    return { ok: true };
  };
  PracticeProgress.prototype._vacation = function (date, settings) { return settings.vacations.some(function (r) { return date >= r.from && date <= r.to; }); };
  PracticeProgress.prototype._protected = function (date, id, data) {
    var ledger = data.ledgers[id];
    return this._vacation(date, data.settings) || !!(ledger && ledger.protectedDates && ledger.protectedDates.indexOf(date) >= 0);
  };
  PracticeProgress.prototype._days = function (id, data) {
    var days = {}, self = this;
    function get(date) {
      if (!days[date]) days[date] = { date: date, engagedSeconds: 0, sessionIds: Object.create(null), observationSessions: [], earnedXP: 0, decayedXP: 0 };
      return days[date];
    }
    data.sessions.forEach(function (s) {
      if (s.instrument !== id) return;
      s.allocations.forEach(function (a) { var d = get(a.date); d.engagedSeconds = round(d.engagedSeconds + a.engagedSeconds); d.sessionIds[s.id] = true; });
      var d = get(s.date); d.sessionIds[s.id] = true; d.observationSessions.push(s); d.earnedXP = round(d.earnedXP + s.earnedXP);
    });
    var ledger = data.ledgers[id];
    if (ledger) ledger.decays.forEach(function (e) { get(e.date).decayedXP = round(get(e.date).decayedXP + e.xp); });
    Object.keys(days).forEach(function (date) {
      var d = days[date]; d.goalMinutes = data.goals[id] && data.goals[id][date] || data.settings.dailyMinutes;
      d.qualifies = d.engagedSeconds > 0 && d.engagedSeconds + 0.000001 >= d.goalMinutes * 60;
      d.vacation = self._protected(date, id, data);
    });
    return days;
  };
  PracticeProgress.prototype._missedRun = function (id, data, through) {
    var ledger = data.ledgers[id], days = this._days(id, data), run = 0;
    if (!ledger) return 0;
    for (var d = ledger.firstObservedDate; d <= through; d = addDay(d, 1)) {
      if (this._protected(d, id, data)) continue;
      if (days[d] && days[d].qualifies) run = 0; else run++;
    }
    return run;
  };
  PracticeProgress.prototype._reconcileData = function (next) {
    var today = dayIn(this.now(), next.settings.timezone), yesterday = addDay(today, -1), changed = false, self = this;
    IDS.forEach(function (id) {
      var ledger = next.ledgers[id]; if (!ledger || ledger.closedThrough >= yesterday) return;
      var days = self._days(id, next);
      for (var d = addDay(ledger.closedThrough, 1); d <= yesterday; d = addDay(d, 1)) {
        if (d >= ledger.firstObservedDate && self._vacation(d, next.settings)) {
          ledger.protectedDates = ledger.protectedDates || [];
          if (ledger.protectedDates.indexOf(d) < 0) ledger.protectedDates.push(d);
        }
        if (d >= ledger.firstObservedDate && !self._protected(d, id, next)) {
          if (days[d] && days[d].qualifies) ledger.missedDays = 0;
          else {
            ledger.missedDays++;
            if (next.settings.decayEnabled && ledger.missedDays > next.settings.graceDays) {
              var amount = round(Math.min(ledger.currentXP * next.settings.decayPercent / 100, next.settings.decayDailyCap,
                Math.max(0, ledger.currentXP - next.settings.decayFloor)));
              if (amount > 0) {
                ledger.currentXP = round(ledger.currentXP - amount); ledger.totalDecayedXP = round(ledger.totalDecayedXP + amount);
                ledger.decays.push({ date: d, xp: amount, timezone: next.settings.timezone, missedDays: ledger.missedDays });
              }
            }
          }
        }
        ledger.closedThrough = d; changed = true;
      }
    });
    return changed;
  };
  PracticeProgress.prototype.reconcile = function () {
    var sync = this._sync(); if (!sync.ok) return sync;
    var next = clone(this.data), changed = this._reconcileData(next);
    return changed ? this._commit(next, { type: 'reconcile' }) : { ok: true, changed: false };
  };
  PracticeProgress.prototype.updateSettings = function (patch) {
    var sync = this._sync(); if (!sync.ok) return sync;
    var errors = settingErrors(patch); if (errors.length) return { ok: false, errors: errors, settings: this.getSettings() };
    var next = clone(this.data); this._reconcileData(next);
    var oldZone = next.settings.timezone;
    Object.assign(next.settings, clone(patch)); next.settings.vacations = normalizedVacations(next.settings.vacations);
    if (oldZone !== next.settings.timezone) {
      // A calendar change never replays already settled dates or relabels data.
      var today = dayIn(this.now(), next.settings.timezone);
      IDS.forEach(function (id) { var l = next.ledgers[id]; if (l) { l.closedThrough = l.closedThrough > addDay(today, -1) ? l.closedThrough : addDay(today, -1); l.firstObservedDate = addDay(l.closedThrough, 1); l.missedDays = 0; } });
    } else IDS.forEach(function (id) { var l = next.ledgers[id]; if (l) l.missedDays = this._missedRun(id, next, l.closedThrough); }, this);
    var result = this._commit(next, { type: 'settings' }); result.settings = this.getSettings(); return result;
  };
  PracticeProgress.prototype.setVacation = function (range) {
    var sync = this._sync(); if (!sync.ok) return sync;
    if (range == null) return this.updateSettings({ vacations: [] });
    if (!range || !dateValid(range.from) || !dateValid(range.to) || range.from > range.to) return { ok: false, errors: ['Vacation needs valid inclusive from/to dates.'] };
    return this.updateSettings({ vacations: this.data.settings.vacations.concat([{ from: range.from, to: range.to }]) });
  };
  PracticeProgress.prototype._streaks = function (id, data, asOf) {
    var days = this._days(id, data), dates = Object.keys(days).sort(), best = 0, run = 0, last = null, self = this;
    dates.forEach(function (date) {
      if (date > asOf || !days[date].qualifies) return;
      if (last) {
        for (var gap = addDay(last, 1); gap < date; gap = addDay(gap, 1)) if (!self._protected(gap, id, data)) { run = 0; break; }
      }
      run++; best = Math.max(best, run); last = date;
    });
    if (last) {
      // Today is not missed until it closes. Vacations protect without adding days.
      for (var d = addDay(last, 1); d < asOf; d = addDay(d, 1)) if (!self._protected(d, id, data)) { run = 0; break; }
    }
    return { currentStreak: run, bestStreak: best };
  };
  PracticeProgress.prototype._normalizeSession = function (input) {
    var errors = [], s = input || {}, now = this.now();
    if (typeof s.id !== 'string' || !s.id.trim() || s.id.length > 128) errors.push('Session id must be a nonempty string of at most 128 characters.');
    if (IDS.indexOf(s.instrument) < 0) errors.push('Session needs an explicit supported instrument.');
    if (!finite(s.startedAt) || !finite(s.endedAt) || s.startedAt < 0 || s.endedAt < s.startedAt || s.endedAt > now + 1000) errors.push('Session timestamps must be finite UTC milliseconds, ordered and not in the future.');
    if (!finite(s.engagedSeconds) || s.engagedSeconds < 0 || s.engagedSeconds > 2678400 || s.engagedSeconds > (s.endedAt - s.startedAt) / 1000 + 0.001) errors.push('Engaged seconds must be observed, finite, nonnegative and within the session interval (maximum 31 days).');
    if (typeof s.mode !== 'string' || !s.mode || s.mode.length > 40) errors.push('Session mode is required.');
    if (['complete', 'partial', 'stopped'].indexOf(s.status) < 0) errors.push('Session status must be complete, partial or stopped.');
    var counters = {};
    ['expected', 'matched', 'missed', 'extra', 'wrong', 'timingSamples'].forEach(function (k) {
      var v = s[k] == null ? 0 : s[k]; counters[k] = v;
      if (!Number.isInteger(v) || v < 0 || v > 1000000000) errors.push(k + ' must be a nonnegative integer at most 1000000000.');
    });
    if (counters.matched + counters.missed > counters.expected) errors.push('Matched and missed notes cannot exceed expected notes.');
    if (counters.wrong > counters.extra) errors.push('Wrong notes are a subset of extra attacks.');
    if (counters.timingSamples > counters.matched || s.mode === 'wait' && counters.timingSamples > 0) errors.push('Timing samples require measured matched onsets; Wait timing is unknown.');
    var abs = s.sumAbsTimingMs == null ? 0 : s.sumAbsTimingMs, signed = s.sumTimingMs == null ? 0 : s.sumTimingMs;
    if (!finite(abs) || abs < 0 || abs > 1000000000000 || !finite(signed) || Math.abs(signed) > abs + 0.000001 || !counters.timingSamples && (abs !== 0 || signed !== 0)) errors.push('Timing sums must be finite and consistent with actual timing samples.');
    var tempo = s.tempo == null ? null : s.tempo;
    if (tempo != null && (!finite(tempo) || tempo <= 0 || tempo > 1000)) errors.push('Observed tempo must be positive and finite, or null.');
    var segments = [], sum = 0;
    if (s.segments != null && !Array.isArray(s.segments)) errors.push('Segments must be an array of measured intervals.');
    if (Array.isArray(s.segments)) s.segments.forEach(function (seg) {
      if (!seg || !finite(seg.startedAt) || !finite(seg.endedAt) || seg.startedAt < s.startedAt || seg.endedAt > s.endedAt || seg.endedAt < seg.startedAt ||
          !finite(seg.engagedSeconds) || seg.engagedSeconds < 0 || seg.engagedSeconds > (seg.endedAt - seg.startedAt) / 1000 + 0.001 || seg.date != null && !dateValid(seg.date)) {
        errors.push('Every segment needs valid observed timestamps/seconds inside the session.'); return;
      }
      sum += seg.engagedSeconds; segments.push({ startedAt: seg.startedAt, endedAt: seg.endedAt, engagedSeconds: seg.engagedSeconds, date: seg.date || null });
    });
    segments.sort(function (a, b) { return a.startedAt - b.startedAt; });
    for (var i = 1; i < segments.length; i++) if (segments[i].startedAt < segments[i - 1].endedAt) errors.push('Measured segment intervals must not overlap.');
    if (Array.isArray(s.segments) && Math.abs(sum - s.engagedSeconds) > 0.001) errors.push('Segment seconds must sum to total observed engaged seconds.');
    if (errors.length) return { ok: false, errors: errors };
    var zone = this.data.settings.timezone, date = dayIn(s.endedAt, zone), allocations = {}, allocation = segments.length ? 'measured-segments' : 'session-end';
    segments.forEach(function (seg) {
      var first = dayIn(seg.startedAt, zone), last = dayIn(seg.endedAt > seg.startedAt ? seg.endedAt - 1 : seg.endedAt, zone);
      if (seg.date && (seg.date < first || seg.date > last)) errors.push('A segment date must be within its measured interval in the selected zone.');
      if (!seg.date && first !== last) allocation = 'segment-end';
      seg.date = seg.date || last;
      allocations[seg.date] = round((allocations[seg.date] || 0) + seg.engagedSeconds);
    });
    if (errors.length) return { ok: false, errors: errors };
    if (!segments.length) allocations[date] = s.engagedSeconds;
    var normalized = Object.assign({ id: s.id, instrument: s.instrument, startedAt: s.startedAt, endedAt: s.endedAt,
      engagedSeconds: round(s.engagedSeconds), mode: s.mode, status: s.status, tempo: tempo, date: date, timezone: zone,
      segments: segments, allocations: Object.keys(allocations).sort().map(function (d) { return { date: d, engagedSeconds: allocations[d] }; }),
      allocation: allocation, observationAllocation: 'session-end', sumAbsTimingMs: abs, sumTimingMs: signed }, counters);
    return { ok: true, session: normalized };
  };
  PracticeProgress.prototype.recordSession = function (input) {
    var sync = this._sync(); if (!sync.ok) return sync;
    // IDs are authoritative across instruments; duplicate callbacks/imports are harmless.
    var previous = input && this.data.sessions.find(function (s) { return s.id === input.id; });
    if (previous) return { ok: true, accepted: false, duplicate: true, session: clone(previous), summary: this.summary(previous.instrument) };
    var validated = this._normalizeSession(input); if (!validated.ok) return validated;
    var next = clone(this.data); this._reconcileData(next);
    var s = validated.session, today = dayIn(this.now(), next.settings.timezone), id = s.instrument, settings = next.settings;
    if (!next.ledgers[id]) next.ledgers[id] = { lifetimeEarnedXP: 0, currentXP: 0, totalDecayedXP: 0,
      firstObservedDate: today, closedThrough: addDay(today, -1), missedDays: 0, decays: [], protectedDates: [] };
    if (!next.goals[id]) next.goals[id] = {};
    s.allocations.forEach(function (a) { if (!next.goals[id][a.date]) next.goals[id][a.date] = settings.dailyMinutes; });
    if (!next.goals[id][s.date]) next.goals[id][s.date] = settings.dailyMinutes;
    s.recordedAt = this.now(); s.earnedXP = 0; next.sessions.push(s);
    var streak = this._streaks(id, next, s.date).currentStreak;
    var baseXP = s.engagedSeconds / 60 * settings.xpPerMinute;
    var noteXP = s.engagedSeconds >= 1 ? Math.min(s.matched * settings.xpPerCorrectNote, settings.correctNoteXPCap) : 0;
    var bonusPercent = Math.min(Math.max(0, streak - 1) * settings.streakBonusPercent, settings.streakBonusCapPercent);
    s.earnedXP = round((baseXP + noteXP) * (1 + bonusPercent / 100));
    s.award = { baseXP: round(baseXP), noteXP: round(noteXP), streakDays: streak, bonusPercent: bonusPercent, settings: clone(settings) };
    var ledger = next.ledgers[id];
    if (!finite(s.earnedXP) || ledger.lifetimeEarnedXP + s.earnedXP > MAX || ledger.currentXP + s.earnedXP > MAX) return { ok: false, errors: ['XP arithmetic would exceed the supported finite range.'] };
    ledger.lifetimeEarnedXP = round(ledger.lifetimeEarnedXP + s.earnedXP); ledger.currentXP = round(ledger.currentXP + s.earnedXP);
    ledger.missedDays = this._missedRun(id, next, ledger.closedThrough);
    var result = this._commit(next, { type: 'record', instrument: id, sessionId: s.id });
    if (!result.ok) return result;
    return { ok: true, accepted: true, duplicate: false, session: clone(s), summary: this.summary(id) };
  };
  function aggregates(sessions) {
    var a = { sessionCount: sessions.length, engagedSeconds: 0, expected: 0, matched: 0, missed: 0, extra: 0, wrong: 0,
      timingSamples: 0, sumAbsTimingMs: 0, sumTimingMs: 0 }, tempos = [], completed = [];
    sessions.forEach(function (s) {
      ['engagedSeconds', 'expected', 'matched', 'missed', 'extra', 'wrong', 'timingSamples', 'sumAbsTimingMs', 'sumTimingMs'].forEach(function (k) { a[k] += s[k]; });
      if (s.engagedSeconds > 0 && s.tempo != null) { tempos.push(s.tempo); if (s.status === 'complete') completed.push(s.tempo); }
    });
    a.engagedSeconds = round(a.engagedSeconds); a.minutes = a.engagedSeconds / 60;
    a.pending = Math.max(0, a.expected - a.matched - a.missed); a.accuracy = a.expected + a.extra ? a.matched / (a.expected + a.extra) * 100 : null;
    a.meanAbsTimingMs = a.timingSamples ? a.sumAbsTimingMs / a.timingSamples : null; a.meanTimingMs = a.timingSamples ? a.sumTimingMs / a.timingSamples : null;
    a.observedTempo = { min: tempos.length ? Math.min.apply(null, tempos) : null, max: tempos.length ? Math.max.apply(null, tempos) : null,
      average: tempos.length ? tempos.reduce(function (n, t) { return n + t; }, 0) / tempos.length : null, latest: tempos.length ? tempos[tempos.length - 1] : null };
    a.completedTempo = { max: completed.length ? Math.max.apply(null, completed) : null, latest: completed.length ? completed[completed.length - 1] : null };
    return a;
  }
  PracticeProgress.prototype.history = function (id, options) {
    this._sync();
    instrument(id); options = options || {};
    if (options.days != null && (!Number.isInteger(options.days) || options.days < 1 || options.days > 3660)) throw new RangeError('History days must be 1–3660 calendar days.');
    var to = options.to || (options.days ? this.dayKey(this.now()) : '9999-12-31'), from = options.from || (options.days ? addDay(to, 1 - options.days) : '0000-01-01');
    if (!dateValid(from) || !dateValid(to) || from > to) throw new RangeError('History dates must be valid ordered calendar dates.');
    return clone(this.data.sessions.filter(function (s) { return s.instrument === id && s.date >= from && s.date <= to; }).sort(function (a, b) { return a.endedAt - b.endedAt || a.id.localeCompare(b.id); }));
  };
  PracticeProgress.prototype.summary = function (id, options) {
    instrument(id); options = options || {}; this.reconcile();
    var today = this.dayKey(this.now()), to = options.to || today, count = options.rangeDays == null ? options.days == null ? 30 : options.days : options.rangeDays;
    if (!Number.isInteger(count) || count < 1 || count > 3660) throw new RangeError('Summary range must be 1–3660 calendar days.');
    var from = options.from || addDay(to, 1 - count);
    if (!dateValid(from) || !dateValid(to) || from > to || (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000 >= 3660) throw new RangeError('Summary dates must be valid ordered calendar dates within 3660 days.');
    var all = this.history(id), days = this._days(id, this.data), settings = this.data.settings, self = this;
    function row(date) {
      var d = days[date], a = aggregates(d ? d.observationSessions : []), measured = d ? d.engagedSeconds : 0;
      return Object.assign(a, { date: date, hasObservation: !!d && Object.keys(d.sessionIds).length > 0, sessionCount: d ? Object.keys(d.sessionIds).length : 0,
        engagedSeconds: measured, minutes: measured / 60, goalMinutes: d ? d.goalMinutes : settings.dailyMinutes,
        qualifies: !!d && d.qualifies, vacation: self._protected(date, id, self.data), earnedXP: d ? d.earnedXP : 0, decayedXP: d ? d.decayedXP : 0 });
    }
    var daily = [], date = from; while (true) { daily.push(row(date)); if (date === to) break; date = addDay(date, 1); }
    var range = aggregates(all.filter(function (s) { return s.date >= from && s.date <= to; }));
    range.engagedSeconds = round(daily.reduce(function (n, d) { return n + d.engagedSeconds; }, 0)); range.minutes = range.engagedSeconds / 60;
    var totals = aggregates(all), ledger = this.data.ledgers[id] || { lifetimeEarnedXP: 0, currentXP: 0, totalDecayedXP: 0 };
    return Object.assign(totals, this._streaks(id, this.data, today), { instrument: id, timezone: settings.timezone,
      lifetimeEarnedXP: ledger.lifetimeEarnedXP, currentXP: ledger.currentXP, totalDecayedXP: ledger.totalDecayedXP,
      level: Math.floor(ledger.currentXP / settings.xpPerLevel) + 1, totalEngagedSeconds: totals.engagedSeconds, totalMinutes: totals.minutes,
      today: row(today), daily: daily, range: Object.assign(range, { from: from, to: to, days: daily.length }) });
  };
  PracticeProgress.prototype.exportData = function () { this.reconcile(); return clone(this.data); };
  return PracticeProgress;
});
