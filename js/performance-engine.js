/* Structured performance practice, independent of DOM, audio and MIDI outputs.
 * clock() is monotonic seconds (normally AudioContext.currentTime). Call tick()
 * from the player's scheduler. Grading consumes RAW physical input, before any
 * sound-output scale filter. No timer, MIDI send or hidden device dependency.
 */
(function (root, factory) {
  'use strict';
  var Engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = Engine;
  if (root) root.PerformanceEngine = Engine;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var EPS = 0.000001;
  function number(v, fallback) { return Number.isFinite(Number(v)) ? Number(v) : fallback; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function unique(a) { return Array.from(new Set(a)); }
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function sourceOf(event) { return String(event.portId != null ? event.portId : event.source != null ? event.source : 'input'); }
  function normalizeScore(score, options) {
    score = score || {}; options = options || {};
    var transpose = Math.round(number(options.transpose, 0)), warnings = Array.isArray(score.importWarnings) ? score.importWarnings.slice() : [], notes = [], restEnd = 0;
    if (score.timingOk === false) warnings.push('Source timing is approximate; timed results use the assumed beat positions.');
    if (number(score.bpm, 80) < 20 || number(score.bpm, 80) > 300) warnings.push('Source tempo is outside the 20–300 BPM practice range; the nearest supported tempo is used.');
    (Array.isArray(score.notes) ? score.notes : []).forEach(function (n, i) {
      if (!n) return;
      if (n.rest) { restEnd = Math.max(restEnd, number(n.t, 0) + Math.max(0, number(n.d, 0))); return; }
      var pitches = Array.isArray(n.notes) ? n.notes : [n.m == null ? n.midi : n.m];
      pitches.forEach(function (pitch) {
        var m = number(pitch, NaN) + transpose, t = number(n.t == null ? n.beat : n.t, NaN);
        if (!Number.isInteger(m) || m < 0 || m > 127 || !Number.isFinite(t) || t < 0) {
          warnings.push('An invalid or transposed out-of-range note was omitted.'); return;
        }
        var d = Math.max(0, number(n.d == null ? n.duration : n.d, 1));
        if (d === 0) warnings.push('Zero-duration notes are graded for onset only.');
        notes.push({ midi: m, beat: t, duration: d, velocity: clamp(number(n.v, 96), 1, 127), originalIndex: i });
        if (n.tie || n.tieStart || n.tieStop) warnings.push('Tie marks are not interpreted; provide one sustained note per tied pitch.');
      });
    });
    notes.sort(function (a, b) { return a.beat - b.beat || a.midi - b.midi; });
    var groups = [], previous = {};
    notes.forEach(function (n) {
      var g = groups[groups.length - 1];
      if (!g || Math.abs(g.beat - n.beat) > EPS) {
        g = { id: 'g' + groups.length, beat: n.beat, endBeat: n.beat, notes: [], entries: [], kind: 'notes' };
        groups.push(g);
      }
      if (g.notes.indexOf(n.midi) >= 0) { warnings.push('Duplicate simultaneous pitches are counted once.'); return; }
      var active = (previous[n.midi] || []).filter(function (p) { return p.beat + p.duration > n.beat + EPS; });
      if (active.length) {
        active.forEach(function (p) { p.durationScored = false; }); n.durationScored = false;
        warnings.push('Overlapping repeated pitches require rearticulation; their hold durations are not scored.');
      }
      active.push(n); previous[n.midi] = active;
      g.notes.push(n.midi); g.entries.push(n); g.endBeat = Math.max(g.endBeat, n.beat + n.duration);
    });
    var end = notes.reduce(function (v, n) { return Math.max(v, n.beat + n.duration); }, restEnd);
    return { title: String(score.title || 'Structured exercise'), bpm: clamp(number(score.bpm, 80), 20, 300),
      len: Math.max(end, number(score.len, end)), groups: groups, warnings: unique(warnings),
      source: score.source || 'structured', timingOk: score.timingOk !== false };
  }

  function PerformanceEngine(options) {
    options = options || {};
    this.clock = typeof options.clock === 'function' ? options.clock : function () { return Date.now() / 1000; };
    this.onChange = typeof options.onChange === 'function' ? options.onChange : function () {};
    this.score = options.score || {};
    this.mode = options.mode === 'tempo' ? 'tempo' : 'wait';
    this.transpose = Math.round(number(options.transpose, 0));
    this.normalized = normalizeScore(this.score, { transpose: this.transpose });
    this.tempo = clamp(number(options.tempo, this.normalized.bpm), 20, 300);
    this.countIn = clamp(number(options.countIn, 4), 0, 16);
    this.inputDelayMs = clamp(number(options.inputDelayMs, 0), 0, 500);
    this.window = Math.max(0.03, number(options.window, 0.12));
    this.section = this._section(options.section);
    this.status = 'idle'; this.phase = 'target'; this._physical = new Map(); this._sounding = new Map(); this._pedals = new Map();
    this._serial = 0; this._lastClock = this._now(); this._anchorTime = this._lastClock; this._anchorBeat = this.section.startBeat;
    this._pausedStatus = null; this._lastFeedback = null; this._loops = 0; this._timeline = [];
    this._prepare(true);
  }
  PerformanceEngine.normalizeScore = normalizeScore;
  PerformanceEngine.prototype._now = function () {
    var t = number(this.clock(), this._lastClock || 0);
    // A suspended or reset clock cannot run musical time backwards.
    this._lastClock = Math.max(number(this._lastClock, t), t); return this._lastClock;
  };
  PerformanceEngine.prototype._section = function (section) {
    var length = this.normalized.len, start = clamp(number(section && section.startBeat, 0), 0, Math.max(0, length - 0.01));
    var end = clamp(number(section && section.endBeat, length), start + 0.01, Math.max(length, start + 0.01));
    return { startBeat: start, endBeat: end, loop: !!(section && section.loop) };
  };
  PerformanceEngine.prototype._prepare = function (reset) {
    var self = this;
    this.groups = this.normalized.groups.filter(function (g) {
      var zeroAtScoreEnd = Math.abs(g.beat - self.section.endBeat) <= EPS && Math.abs(self.section.endBeat - self.normalized.len) <= EPS &&
        g.entries.some(function (n) { return n.duration === 0; });
      return g.beat >= self.section.startBeat - EPS && (g.beat < self.section.endBeat - EPS || zeroAtScoreEnd);
    }).map(function (g) {
      return { id: g.id, beat: g.beat, endBeat: Math.min(g.endBeat, self.section.endBeat), notes: g.notes.slice(), kind: 'notes',
        entries: g.entries.map(function (n) { return { midi: n.midi, beat: n.beat, duration: Math.min(n.duration, self.section.endBeat - n.beat),
          velocity: n.velocity, durationScored: n.durationScored !== false && n.duration > 0, state: 'pending' }; }) };
    });
    this._waitIndex = 0; this._waitBeat = this.section.startBeat;
    this._waitGap = Math.max(0, (this.groups[0] ? this.groups[0].beat : this.section.endBeat) - this.section.startBeat);
    this._waitLast = this._now(); this._activation = this._serial;
    if (reset) {
      this._loops = 0; this._attempts = []; this._holds = []; this._lastFeedback = null;
      this._stats = { expected: this.groups.reduce(function (v, g) { return v + g.entries.length; }, 0),
        matched: 0, missed: 0, extra: 0, wrong: 0, perfect: 0, great: 0, good: 0, early: 0, late: 0,
        completedGroups: 0, totalGroups: this.groups.length };
    }
  };
  PerformanceEngine.prototype._emit = function (type) { var s = this.snapshot(); this.onChange(s, { type: type }); return s; };
  PerformanceEngine.prototype._beat = function (now) {
    return this._anchorBeat + (now - this._anchorTime) * this.tempo / 60;
  };
  PerformanceEngine.prototype._setAnchor = function (beat, now) { this._anchorBeat = beat; this._anchorTime = now; };
  PerformanceEngine.prototype._recordClock = function (time, beat, moving, live) {
    this._timeline.push({ time: time, beat: beat, tempo: this.tempo, moving: moving, live: live });
  };
  PerformanceEngine.prototype._segmentAt = function (time) {
    for (var i = this._timeline.length - 1; i >= 0; i--) if (this._timeline[i].time <= time + EPS) return this._timeline[i];
    return null;
  };
  PerformanceEngine.prototype._beatAt = function (time) {
    var segment = this._segmentAt(time);
    return segment ? segment.beat + (segment.moving ? Math.max(0, time - segment.time) * segment.tempo / 60 : 0) : this.section.startBeat;
  };
  PerformanceEngine.prototype._timeForBeat = function (beat, referenceTime) {
    var reference = referenceTime == null ? this._now() : referenceTime, self = this;
    function shifted(time) {
      var pause = 0;
      self._timeline.forEach(function (s, index) {
        var next = self._timeline[index + 1];
        if (!s.moving && next && s.time >= time - EPS && s.time < reference) pause += Math.max(0, Math.min(next.time, reference) - s.time);
      });
      return time + pause;
    }
    for (var i = this._timeline.length - 1; i >= 0; i--) {
      var segment = this._timeline[i];
      if (!segment.moving || !segment.live || segment.time > reference + EPS || beat < segment.beat - EPS) continue;
      var time = segment.time + (beat - segment.beat) * 60 / segment.tempo;
      if (!this._timeline[i + 1] || this._timeline[i + 1].time > reference + EPS || time <= this._timeline[i + 1].time + EPS) return shifted(time);
    }
    return this._anchorTime + (beat - this._anchorBeat) * 60 / this.tempo;
  };
  PerformanceEngine.prototype._inputTime = function (event) {
    var now = this._now();
    if (this.mode === 'wait') return now;
    var earliest = Math.max(now - this.inputDelayMs / 1000, this._timeline.length ? this._timeline[0].time : now);
    return clamp(number(event && event.at, now), earliest, now);
  };
  PerformanceEngine.prototype.start = function () {
    if (this.status === 'paused') return this.resume();
    if (this.status === 'running' || this.status === 'countin') return this.snapshot();
    this._prepare(true);
    var now = this._now(); this._setAnchor(this.section.startBeat - this.countIn, now); this._waitLast = now;
    this.status = this.countIn > 0 ? 'countin' : 'running'; this.phase = this.countIn > 0 ? 'countin' : (this._waitGap > EPS ? 'rest' : 'target');
    this._timeline = []; this._recordClock(now, this._anchorBeat, true, this.status === 'running');
    return this._emit('start');
  };
  PerformanceEngine.prototype.restart = function () { this.status = 'idle'; return this.start(); };
  PerformanceEngine.prototype.stop = function () {
    this.tick(); this._stopBeat = this.snapshot().timelineBeat;
    this._finalizeHolds(); this.status = 'stopped'; this.phase = 'stopped';
    this._recordClock(this._now(), this._stopBeat, false, false);
    return this._emit('stop');
  };
  PerformanceEngine.prototype.pause = function () {
    this.tick();
    if (this.status !== 'running' && this.status !== 'countin') return this.snapshot();
    this._pauseBeat = this._beat(this._now()); this._pausedStatus = this.status;
    this._recordClock(this._now(), this._pauseBeat, false, false);
    this.status = 'paused'; this.phase = 'paused'; return this._emit('pause');
  };
  PerformanceEngine.prototype.resume = function () {
    if (this.status !== 'paused') return this.snapshot();
    var now = this._now(); this._setAnchor(this._pauseBeat, now); this._waitLast = now;
    this.status = this._pausedStatus; this._pausedStatus = null; this._activation = this._serial;
    this._recordClock(now, this._pauseBeat, true, this.status === 'running');
    // A chord partly entered before pausing needs a fresh physical attack.
    if (this.mode === 'wait' && this.groups[this._waitIndex]) this.groups[this._waitIndex].entries.forEach(function (n) { n.attack = null; });
    this.phase = this.status === 'countin' ? 'countin' : (this._waitGap > EPS ? 'rest' : 'target');
    return this._emit('resume');
  };
  PerformanceEngine.prototype.setTempo = function (bpm) {
    this.tick(); var now = this._now(), beat = this.status === 'paused' ? this._pauseBeat : this._beat(now);
    this.tempo = clamp(number(bpm, this.tempo), 20, 300); this._setAnchor(beat, now); this._waitLast = now;
    this._recordClock(now, beat, this.status === 'running' || this.status === 'countin', this.status === 'running');
    return this._emit('tempo');
  };
  PerformanceEngine.prototype.setInputDelay = function (milliseconds) {
    this.tick(); this.inputDelayMs = clamp(number(milliseconds, 0), 0, 500); return this._emit('latency');
  };
  PerformanceEngine.prototype.setSection = function (section) {
    this.stop(); this.section = this._section(section); this._prepare(true); this.status = 'idle'; this.phase = 'target';
    return this._emit('section');
  };
  PerformanceEngine.prototype.setTranspose = function (semitones) {
    this.stop(); this.transpose = Math.round(number(semitones, 0));
    this.normalized = normalizeScore(this.score, { transpose: this.transpose }); this.section = this._section(this.section);
    this._prepare(true); this.status = 'idle'; this.phase = 'target'; return this._emit('transpose');
  };
  PerformanceEngine.prototype._targetView = function (g) {
    if (!g) return null;
    var physical = Array.from(this._physical.values());
    return { id: g.id, beat: g.beat, endBeat: g.endBeat, kind: 'notes', notes: g.notes.slice(),
      matched: g.entries.filter(function (n) { return n.state === 'matched' || (n.attack && physical.some(function (p) { return p.serial === n.attack; })); }).map(function (n) { return n.midi; }),
      missed: g.entries.filter(function (n) { return n.state === 'missed'; }).map(function (n) { return n.midi; }),
      durations: g.entries.map(function (n) { return { midi: n.midi, beats: n.duration }; }) };
  };
  PerformanceEngine.prototype._groupResolved = function (g) { return g.entries.every(function (n) { return n.state !== 'pending'; }); };
  PerformanceEngine.prototype._currentIndex = function () {
    if (this.mode === 'wait') return this._waitIndex;
    for (var i = 0; i < this.groups.length; i++) if (!this._groupResolved(this.groups[i])) return i;
    return this.groups.length;
  };
  PerformanceEngine.prototype._activeNotes = function (beat, matchedOnly) {
    var notes = [];
    this.groups.forEach(function (g) { g.entries.forEach(function (n) {
      if (beat >= n.beat - EPS && beat < n.beat + n.duration - EPS && (!matchedOnly || n.state === 'matched')) notes.push(n.midi);
    }); });
    return unique(notes).sort(function (a, b) { return a - b; });
  };
  PerformanceEngine.prototype.snapshot = function () {
    var now = this._now(), timeline = this.status === 'paused' ? this._pauseBeat : this._beat(now);
    if (this.status === 'idle') timeline = this.section.startBeat;
    if (this.status === 'stopped') timeline = this._stopBeat;
    var idx = this._currentIndex(), current = this._targetView(this.groups[idx]);
    var beat = this.mode === 'wait' && this.status !== 'countin' && !(this.status === 'paused' && this._pausedStatus === 'countin') ? this._waitBeat : timeline;
    if (this.status === 'complete') beat = this.section.endBeat;
    var activeNotes = this.mode === 'tempo' ? this._activeNotes(beat) : (this._waitGap <= EPS && current ? current.notes.slice() : []);
    var activeMatchedNotes = this.mode === 'tempo' ? this._activeNotes(beat, true) : (this._waitGap <= EPS && current ? current.matched.slice() : []);
    if (this.status === 'countin' || this.status === 'complete' || this.status === 'stopped' || this.status === 'paused') { activeNotes = []; activeMatchedNotes = []; }
    var expected = this._stats.expected, matched = this._stats.matched, errs = this._attempts.filter(function (x) { return x.result === 'matched'; });
    var holdSamples = this._holds.filter(function (h) { return h.error != null; });
    var results = Object.assign({}, this._stats, {
      pending: Math.max(0, expected - matched - this._stats.missed),
      accuracy: expected + this._stats.extra > 0 ? Math.round(matched / (expected + this._stats.extra) * 1000) / 10 : 0,
      chordAccuracy: this._stats.totalGroups ? Math.round(this._stats.completedGroups / this._stats.totalGroups * 1000) / 10 : 0,
      meanAbsTimingMs: errs.length ? errs.reduce(function (a, x) { return a + Math.abs(x.offsetMs); }, 0) / errs.length : 0,
      meanTimingMs: errs.length ? errs.reduce(function (a, x) { return a + x.offsetMs; }, 0) / errs.length : 0,
      durationSamples: holdSamples.length,
      meanDurationErrorBeats: holdSamples.length ? holdSamples.reduce(function (a, h) { return a + h.error; }, 0) / holdSamples.length : 0,
      meanAbsDurationErrorBeats: holdSamples.length ? holdSamples.reduce(function (a, h) { return a + Math.abs(h.error); }, 0) / holdSamples.length : 0,
      durationAccuracy: holdSamples.length ? Math.round(holdSamples.reduce(function (a, h) {
        return a + clamp(1 - Math.abs(h.error) / h.expected, 0, 1);
      }, 0) / holdSamples.length * 1000) / 10 : null,
      loops: this._loops, attempts: copy(this._attempts), durationDetails: copy(holdSamples)
    });
    return { status: this.status, phase: this.phase, mode: this.mode, tempo: this.tempo, transpose: this.transpose, inputDelayMs: this.inputDelayMs,
      beat: clamp(beat, this.section.startBeat, this.section.endBeat), timelineBeat: timeline,
      countInRemaining: this.status === 'countin' || (this.status === 'paused' && this._pausedStatus === 'countin') ? Math.max(0, this.section.startBeat - timeline) : 0,
      current: current, activeNotes: activeNotes, activeMatchedNotes: activeMatchedNotes, upcoming: this.groups.slice(idx + (current ? 1 : 0), idx + 5).map(this._targetView.bind(this)),
      held: unique(Array.from(this._physical.values()).map(function (n) { return n.midi; })).sort(function (a, b) { return a - b; }),
      sounding: unique(Array.from(this._sounding.values()).map(function (n) { return n.midi; })).sort(function (a, b) { return a - b; }),
      restRemainingBeats: this.mode === 'wait' ? this._waitGap : Math.max(0, current ? current.beat - beat : this.section.endBeat - beat),
      progress: this.section.endBeat > this.section.startBeat ? clamp((beat - this.section.startBeat) / (this.section.endBeat - this.section.startBeat), 0, 1) : 1,
      section: Object.assign({}, this.section), results: results, lastFeedback: this._lastFeedback && copy(this._lastFeedback),
      warnings: this.normalized.warnings.slice(), title: this.normalized.title };
  };
  PerformanceEngine.prototype._completeGroup = function (g) {
    if (!g.completed && g.entries.every(function (n) { return n.state === 'matched'; })) { g.completed = true; this._stats.completedGroups++; }
  };
  PerformanceEngine.prototype._end = function () {
    this._finalizeHolds(this._timeForBeat(this.section.endBeat));
    if (this.section.loop && this.groups.length) {
      this._loops++;
      var extraExpected = this.groups.reduce(function (v, g) { return v + g.entries.length; }, 0), extraGroups = this.groups.length;
      this._prepare(false); this._stats.expected += extraExpected; this._stats.totalGroups += extraGroups;
      this._setAnchor(this.section.startBeat - this.countIn, this._now());
      this.status = this.countIn ? 'countin' : 'running'; this.phase = this.countIn ? 'countin' : (this._waitGap ? 'rest' : 'target');
      this._timeline = []; this._recordClock(this._now(), this._anchorBeat, true, this.status === 'running');
      return 'loop';
    }
    this.status = 'complete'; this.phase = 'complete'; this._recordClock(this._now(), this.section.endBeat, false, false); return 'complete';
  };
  PerformanceEngine.prototype.tick = function () {
    var now = this._now(), event = 'tick';
    if (this.status === 'countin') {
      var beat = this._beat(now);
      if (beat >= this.section.startBeat - EPS) {
        this.status = 'running'; this._activation = this._serial;
        this._waitLast = now - Math.max(0, beat - this.section.startBeat) * 60 / this.tempo;
        this._recordClock(this._waitLast, this.section.startBeat, true, true);
      }
    }
    if (this.status === 'running') {
      if (this.mode === 'wait') {
        if (this._waitGap > EPS) {
          var elapsed = Math.max(0, now - this._waitLast) * this.tempo / 60;
          var step = Math.min(elapsed, this._waitGap); this._waitGap -= step; this._waitBeat += step;
        }
        this._waitLast = now;
        this.phase = this._waitGap > EPS ? 'rest' : 'target';
        if (this._waitGap <= EPS) {
          var g = this.groups[this._waitIndex];
          if (!g) event = this._end();
          else this._waitBeat = g.beat;
        }
      } else {
        var currentBeat = this._beat(now), windowBeats = this.window * this.tempo / 60, delay = this.inputDelayMs / 1000;
        var self = this;
        this.groups.forEach(function (g) {
          g.entries.forEach(function (n) {
            if (n.state === 'pending' && currentBeat >= n.beat - EPS && now > self._timeForBeat(n.beat) + self.window + delay + EPS) {
              n.state = 'missed'; self._stats.missed++; self._attempts.push({ result: 'missed', midi: n.midi, beat: n.beat });
              self._lastFeedback = { kind: 'miss', midi: n.midi, notes: g.notes.slice(), message: 'Target missed.' };
            }
          });
        });
        var current = this.groups[this._currentIndex()];
        this.phase = !this._activeNotes(currentBeat).length && (!current || currentBeat < current.beat - windowBeats) ? 'rest' : 'target';
        // Allow the final attack's late window even when the section is short.
        var last = this.groups[this.groups.length - 1];
        var finishTime = Math.max(this._timeForBeat(this.section.endBeat), last ? this._timeForBeat(last.beat) + this.window : this._timeForBeat(this.section.endBeat)) + delay;
        if (now >= finishTime + EPS) event = this._end();
      }
    }
    return this._emit(event);
  };
  PerformanceEngine.prototype._recordMatch = function (n, g, offset, physical) {
    n.state = 'matched'; this._stats.matched++;
    var ms = offset * 1000, abs = Math.abs(ms), grade = abs <= 30 + EPS ? 'perfect' : abs <= 60 + EPS ? 'great' : 'good';
    this._stats[grade]++; if (ms < -EPS) this._stats.early++; else if (ms > EPS) this._stats.late++;
    this._attempts.push({ result: 'matched', midi: n.midi, beat: n.beat, offsetMs: ms, grade: grade, group: g.id });
    if (physical && n.durationScored && this.mode === 'tempo') {
      var hold = { midi: n.midi, expected: n.duration, startBeat: physical.attackBeat, error: null, key: physical.key };
      physical.hold = hold; this._holds.push(hold);
    }
    this._completeGroup(g);
  };
  PerformanceEngine.prototype._releaseSound = function (key, at) {
    var s = this._sounding.get(key);
    if (s && s.hold && s.hold.error == null) {
      var beat = at == null ? this.status === 'paused' ? this._pauseBeat : this._beat(this._now()) : this._beatAt(at);
      s.hold.actual = Math.max(0, beat - s.hold.startBeat); s.hold.error = s.hold.actual - s.hold.expected;
    }
    this._sounding.delete(key);
  };
  PerformanceEngine.prototype._finalizeHolds = function (at) {
    var self = this; this._sounding.forEach(function (s, key) { self._releaseSound(key, at); });
  };
  PerformanceEngine.prototype._tryWait = function () {
    if (this.status !== 'running' || this._waitGap > EPS) return;
    var g = this.groups[this._waitIndex]; if (!g) return;
    var held = Array.from(this._physical.values()), self = this;
    var wrong = held.some(function (p) { return g.notes.indexOf(p.midi) < 0; });
    var correct = g.entries.every(function (n) {
      return n.attack && held.some(function (p) { return p.serial === n.attack && p.midi === n.midi; });
    });
    if (!correct || wrong) return;
    g.entries.forEach(function (n) { self._recordMatch(n, g, 0, null); });
    this._lastFeedback = { kind: 'correct', notes: g.notes.slice(), message: 'Correct. Release repeated notes before playing again.' };
    this._waitIndex++; this._activation = this._serial;
    var next = this.groups[this._waitIndex], end = g.endBeat;
    this._waitBeat = next && next.beat < end ? next.beat : end;
    this._waitGap = Math.max(0, (next ? next.beat : this.section.endBeat) - end); this._waitLast = this._now();
    this.phase = this._waitGap > EPS ? 'rest' : 'target';
    if (!next && this._waitGap <= EPS) this._end();
  };
  PerformanceEngine.prototype.input = function (event) {
    event = event || {}; this.tick();
    if (event.controller != null || event.cc != null) return this.control(event);
    var midi = number(event.midi == null ? event.note : event.midi, NaN);
    if (!Number.isInteger(midi) || midi < 0 || midi > 127) return this.snapshot();
    var inputAt = this._inputTime(event), inputSegment = this._segmentAt(inputAt);
    var velocity = number(event.velocity == null ? event.vel : event.velocity, event.on === false ? 0 : 96);
    var on = event.on !== false && velocity > 0, channel = clamp(Math.floor(number(event.channel == null ? event.chan : event.channel, 0)), 0, 15);
    var source = sourceOf(event), sourceChan = JSON.stringify([source, channel]);
    var key = JSON.stringify([source, channel, midi]), previous = this._physical.get(key);
    if (!on) {
      this._physical.delete(key);
      if (!this._pedals.get(sourceChan)) this._releaseSound(key, inputAt);
      if (this.mode === 'wait') this._tryWait();
      return this._emit('input');
    }
    if (previous) { this._lastFeedback = { kind: 'repeat', midi: midi, message: 'Release the key before repeating it.' }; return this._emit('input'); }
    var samePitchHeld = Array.from(this._physical.values()).some(function (p) { return p.midi === midi; });
    this._releaseSound(key, inputAt); // A fresh attack supersedes a pedal-held prior voice.
    var physical = { midi: midi, key: key, source: source, sourceChan: sourceChan, serial: ++this._serial, velocity: velocity, attackBeat: this._beatAt(inputAt) };
    this._physical.set(key, physical); this._sounding.set(key, physical);
    if (this.status !== 'running' || this.mode === 'tempo' && inputSegment && !inputSegment.live) return this._emit('input');
    if (this.mode === 'wait' && this._waitGap > EPS) { this._wrong(midi, false); return this._emit('input'); }
    if (samePitchHeld) {
      this._lastFeedback = { kind: 'repeat', midi: midi, message: 'Release this pitch on every input channel before repeating it.' };
      return this._emit('input');
    }
    if (this.mode === 'wait') {
      var g = this.groups[this._waitIndex], note = g && g.entries.find(function (n) { return n.midi === midi; });
      if (note) {
        note.attack = physical.serial;
        this._lastFeedback = { kind: 'partial', midi: midi, notes: g.notes.slice(), message: 'Hold all target notes together.' };
        this._tryWait();
      } else this._wrong(midi, true);
    } else {
      var nearest = null, group = null, best = Infinity, self = this;
      this.groups.forEach(function (g) { g.entries.forEach(function (n) {
        if (n.midi !== midi || n.state !== 'pending') return;
        var diff = Math.abs(inputAt - self._timeForBeat(n.beat, inputAt));
        if (diff < best) { nearest = n; group = g; best = diff; }
      }); });
      if (nearest && best <= this.window + EPS) {
        this._recordMatch(nearest, group, inputAt - this._timeForBeat(nearest.beat, inputAt), physical);
        this._lastFeedback = { kind: 'correct', midi: midi, notes: group.notes.slice(), message: 'Target matched.' };
      } else {
        var active = this.groups.some(function (g) { return Math.abs(inputAt - self._timeForBeat(g.beat, inputAt)) <= self.window + EPS; });
        this._wrong(midi, active);
      }
    }
    return this._emit(this.status === 'complete' ? 'complete' : 'input');
  };
  PerformanceEngine.prototype._wrong = function (midi, wrongPitch) {
    this._stats.extra++; if (wrongPitch) this._stats.wrong++;
    this._lastFeedback = { kind: wrongPitch ? 'wrong' : 'extra', midi: midi,
      message: wrongPitch ? 'Wrong note. Release it and play the target.' : 'Extra note outside the target window.' };
    this._attempts.push({ result: wrongPitch ? 'wrong' : 'extra', midi: midi, beat: this.mode === 'wait' ? this._waitBeat : this._beat(this._now()) });
  };
  PerformanceEngine.prototype.control = function (event) {
    event = event || {};
    if (number(event.controller == null ? event.cc : event.controller, -1) !== 64) return this.snapshot();
    var channel = clamp(Math.floor(number(event.channel == null ? event.chan : event.channel, 0)), 0, 15);
    var key = JSON.stringify([sourceOf(event), channel]);
    var down = number(event.value == null ? event.velocity : event.value, 0) >= 64;
    this._pedals.set(key, down);
    if (!down) {
      var self = this, inputAt = this._inputTime(event); this._sounding.forEach(function (s, k) { if (s.sourceChan === key && !self._physical.has(k)) self._releaseSound(k, inputAt); });
    }
    return this._emit('control');
  };
  PerformanceEngine.prototype.releaseInput = function (source) {
    var self = this, target = source == null ? null : String(source);
    this._physical.forEach(function (n, key) { if (target == null || n.source === target) { self._physical.delete(key); self._releaseSound(key); } });
    this._pedals.forEach(function (_, key) { if (target == null || JSON.parse(key)[0] === target) self._pedals.delete(key); });
    this._sounding.forEach(function (n, key) { if (target == null || n.source === target) self._releaseSound(key); });
    return this._emit('release');
  };
  return PerformanceEngine;
});
