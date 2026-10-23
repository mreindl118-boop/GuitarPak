/* Explicit-start monophonic acoustic/USB-audio practice input. Analysis shares
 * App.audioIn's selected stream and never connects its analyser to speakers.
 * USB audio is PCM, not USB-MIDI; uncertain pitch never becomes a guessed note. */
(function (root, factory) {
  'use strict';
  var Detector = typeof module === 'object' && module.exports ? require('./pitch-detector') : root.SLPitchDetector;
  var Adapter = factory(root, Detector);
  if (typeof module === 'object' && module.exports) module.exports = Adapter;
  if (root) root.PracticeInput = Adapter;
})(typeof window !== 'undefined' ? window : null, function (root, Detector) {
  'use strict';
  var TAG = 'performance-audio', instances = new Set(), installed = false;
  function number(value, fallback) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function app() { return root && root.App; }
  function install() {
    var App = app();
    if (installed || !App) return;
    installed = true;
    App.on('audioin:device', function () {
      instances.forEach(function (a) { if (a._desired && !a._choosing) a.stop('Audio input changed. Start listening again when ready.'); });
    });
    App.on('audioin:state', function (state) {
      instances.forEach(function (a) {
        if (!a._running || a._simulation) return;
        var tap = App.audioIn && App.audioIn.tap(TAG);
        if (!state.on || !tap || tap.source !== a._source) a.stop('Audio input disconnected. Reconnect and start listening again.');
      });
    });
    if (root.document && root.document.addEventListener) root.document.addEventListener('visibilitychange', function () {
      if (root.document.hidden) instances.forEach(function (a) { if (a._desired) a.stop('Listening stopped while the page is hidden. Start again when ready.'); });
    });
  }
  function PracticeInput(options) {
    options = options || {};
    this.onNote = typeof options.onNote === 'function' ? options.onNote : function () {};
    this.onState = typeof options.onState === 'function' ? options.onState : function () {};
    this.clock = typeof options.clock === 'function' ? options.clock : function () {
      try { return app().getAudio().currentTime; } catch (e) { return Date.now() / 1000; }
    };
    this.expectedNotes = options.expectedNotes;
    this._generation = 0; this._running = false; this._desired = false; this._disposed = false;
    this._state = { status: 'off', running: false, message: 'Audio listening is off.', monophonic: true };
    this._settings = this._options({}); this._clear(); instances.add(this); install();
  }
  PracticeInput.create = function (options) { return new PracticeInput(options); };
  PracticeInput.prototype._options = function (options) {
    return { deviceId: typeof options.deviceId === 'string' ? options.deviceId : null,
      referenceA4: clamp(number(options.referenceA4, 440), 400, 480),
      minMidi: clamp(Math.round(number(options.minMidi, 36)), 0, 127),
      maxMidi: clamp(Math.round(number(options.maxMidi, 96)), 0, 127),
      transpose: clamp(Math.round(number(options.transpose, 0)), -48, 48),
      confidence: clamp(number(options.confidence, 0.92), 0.7, 1),
      noiseFloor: clamp(number(options.noiseFloor, 0.008), 0.0001, 0.5),
      centsTolerance: clamp(number(options.centsTolerance, 35), 5, 50),
      latencyMs: clamp(number(options.latencyMs, 0), 0, 400),
      stableFrames: clamp(Math.round(number(options.stableFrames, 3)), 2, 8),
      releaseFrames: clamp(Math.round(number(options.releaseFrames, 3)), 2, 8) };
  };
  PracticeInput.prototype._now = function (time) { return number(time, number(this.clock(), 0)); };
  PracticeInput.prototype._clear = function () {
    this._current = null; this._candidate = null; this._quiet = 0; this._unstable = 0;
    this._previousRms = 0; this._peak = 0; this._dip = false; this._lastAttack = -Infinity; this._lastState = -Infinity;
  };
  PracticeInput.prototype._report = function (status, message, info, force) {
    var now = this._now(), changed = status !== this._state.status || message !== this._state.message;
    this._state = Object.assign({}, this._state, info || {}, { status: status, message: message,
      running: this._running, monophonic: true, simulation: !!this._simulation });
    if (force || changed || now - this._lastState >= 0.1) { this._lastState = now; this.onState(this.state); }
  };
  Object.defineProperty(PracticeInput.prototype, 'state', { get: function () { return Object.assign({}, this._state); } });
  PracticeInput.prototype._polyphonic = function () {
    var notes = typeof this.expectedNotes === 'function' ? this.expectedNotes() : this.expectedNotes;
    return Array.isArray(notes) && new Set(notes).size > 1;
  };
  PracticeInput.prototype._event = function (midi, on, time, detail) {
    var d = detail || {}, id = this._settings.deviceId || this._deviceId || 'default';
    this.onNote({ midi: midi, on: on, velocity: on ? clamp(Math.round(number(d.rms, 0.1) * 320 + 50), 1, 127) : 0,
      source: 'audio', portId: 'audio:' + id, channel: 0, silent: true,
      at: time - this._settings.latencyMs / 1000, confidence: number(d.confidence, 0), cents: number(d.cents, 0) });
  };
  PracticeInput.prototype._off = function (time) {
    if (this._current) { var current = this._current; this._current = null; this._event(current.midi, false, time, current); }
  };
  PracticeInput.prototype.reset = function () {
    this._off(this._now()); this._clear();
    if (this._running) this._report('listening', 'Play one clear note at a time.', {}, true);
    return this.state;
  };
  PracticeInput.prototype.start = function (settings) {
    var self = this, App = app(); settings = settings || {};
    this.stop();
    if (this._disposed) return Promise.resolve(false);
    this._settings = this._options(settings); this._simulation = settings.simulation === true;
    if (this._settings.minMidi > this._settings.maxMidi || this._polyphonic()) {
      this._report('unsupported', 'Audio practice supports single-note scores only. Use an arpeggio or MIDI pickup for chords.', {}, true);
      return Promise.resolve(false);
    }
    this._desired = true; var generation = ++this._generation;
    if (this._simulation) {
      this._running = true; this._report('listening', 'Synthetic audio analysis; no microphone or hardware is open.', {}, true); return Promise.resolve(true);
    }
    if (!App || !App.audioIn || !App.audioIn.supported || !App.audioIn.tap || !Detector) {
      this._desired = false; this._report('unavailable', 'Audio input is unavailable here. Use MIDI or virtual keys.', {}, true); return Promise.resolve(false);
    }
    // One live analysis owner; avoid two adapters sharing this consumer tag.
    instances.forEach(function (other) { if (other !== self && other._desired) other.stop('Audio listening moved to another practice session.'); });
    if (App.tonein && App.tonein.suspend) { App.tonein.suspend(TAG, true); this._toneSuspended = true; }
    this._report('starting', 'Opening the selected audio input…', {}, true);
    var selected = this._settings.deviceId, choosing = Promise.resolve();
    if (selected !== null && selected !== App.store.get('audio.inId', '')) {
      this._choosing = true;
      choosing = Promise.resolve(App.audioIn.setDevice(selected)).then(function () { self._choosing = false; });
    }
    return choosing.then(function () {
      if (!self._desired || self._generation !== generation) return null;
      self._holdsInput = true;
      return App.audioIn.hold(TAG, { exact: true });
    }).then(function (state) {
      if (!self._desired || self._generation !== generation) return false;
      var tap = App.audioIn.tap(TAG), id = self._settings.deviceId;
      if (!tap || (id && state.device !== id)) throw new Error(state && (state.error || state.msg) || 'The selected input is unavailable; no default input was substituted.');
      self._source = tap.source; self._context = tap.context; self._deviceId = state.device || '';
      self._analyser = tap.context.createAnalyser(); self._analyser.fftSize = 4096; self._analyser.smoothingTimeConstant = 0;
      self._buffer = new Float32Array(self._analyser.fftSize); self._source.connect(self._analyser);
      self._running = true;
      self._report('listening', 'Listening to one note at a time. Audio is analysed locally, not sent to speakers.', { deviceId: self._deviceId, label: state.label || '' }, true);
      self._timer = setInterval(function () {
        if (!self._running || self._generation !== generation) return;
        try { self._analyser.getFloatTimeDomainData(self._buffer); self.feed(self._buffer, self._context.sampleRate, self._now()); }
        catch (e) { self.stop('The input became unavailable. Start listening again when ready.'); }
      }, 25);
      return true;
    }).catch(function (error) {
      if (self._generation !== generation) return false;
      self.stop(); self._report('error', error && error.message || 'Audio input was not opened.', {}, true); return false;
    });
  };
  PracticeInput.prototype.stop = function (reason) {
    this._desired = false; this._generation++; this._choosing = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._off(this._now()); this._running = false;
    if (this._source && this._analyser) { try { this._source.disconnect(this._analyser); } catch (e) { /* only our edge */ } }
    this._source = this._analyser = this._buffer = this._context = null;
    var App = app();
    if (App && App.audioIn && this._holdsInput) { this._holdsInput = false; App.audioIn.release(TAG); }
    if (App && App.tonein && this._toneSuspended) { this._toneSuspended = false; App.tonein.suspend(TAG, false); }
    this._clear(); this._report('off', reason || 'Audio listening is off.', { midi: null, confidence: 0, rms: 0, cents: null }, true); return this.state;
  };
  PracticeInput.prototype.dispose = function () { this.stop(); this._disposed = true; instances.delete(this); };
  PracticeInput.prototype.feed = function (samples, sampleRate, time) {
    if (!this._running || this._disposed) return null;
    if (this._polyphonic()) { this.stop('This target contains a chord. Choose a monophonic score or a MIDI pickup.'); return null; }
    var now = this._now(time), opt = this._settings, generation = this._generation, rms = 0, i;
    if (!samples || !samples.length) return null;
    for (i = 0; i < samples.length; i++) rms += samples[i] * samples[i];
    rms = Math.sqrt(rms / samples.length);
    if (!Number.isFinite(rms)) return null;
    var prior = this._previousRms; this._previousRms = rms;
    if (rms < opt.noiseFloor) {
      this._candidate = null; this._unstable = 0;
      if (!this._quiet) this._quietAt = now;
      if (++this._quiet >= opt.releaseFrames) { this._off(this._quietAt); this._peak = 0; this._dip = false; }
      if (!this._running || this._generation !== generation) return null;
      this._report('quiet', 'Waiting for one clear note.', { rms: rms, confidence: 0, midi: null, cents: null }); return null;
    }
    this._quiet = 0;
    var result = Detector.detect(samples, sampleRate, { noiseFloor: opt.noiseFloor, referenceA4: opt.referenceA4,
      minFrequency: Math.max(20, opt.referenceA4 * Math.pow(2, (opt.minMidi - 12 - 69) / 12)) });
    if (!result || result.ambiguous || result.confidence < opt.confidence) {
      this._candidate = null;
      if (++this._unstable >= opt.releaseFrames + 2) this._off(now);
      if (!this._running || this._generation !== generation) return result;
      this._report('uncertain', 'Pitch is unclear. Play a single steady note; no answer was guessed.', { rms: rms, confidence: result ? result.confidence : 0, midi: null, cents: null }); return result;
    }
    this._unstable = 0;
    var physical = result.midi, midi = physical + opt.transpose;
    var info = { rms: rms, confidence: result.confidence, midi: midi, cents: result.cents, frequency: result.frequency };
    if (physical < opt.minMidi || physical > opt.maxMidi || midi < 0 || midi > 127) {
      this._candidate = null; this._off(now);
      if (!this._running || this._generation !== generation) return result;
      this._report('range', 'Detected note is outside the configured instrument range; it was ignored.', info); return result;
    }
    var distance = this._current ? (result.midiFloat + opt.transpose - this._current.midi) * 100 : Infinity;
    if (this._current && Math.abs(distance) <= 65) {
      this._candidate = null;
      this._peak = Math.max(this._peak * 0.997, rms);
      if (rms < this._peak * 0.45) this._dip = true;
      var attacked = this._dip && rms > Math.max(opt.noiseFloor * 2, prior * 2.2) && now - this._lastAttack > 0.08;
      if (!attacked) { this._report('holding', 'Holding ' + this._current.midi + ' · release or pluck again for a repeated note.', info); return result; }
      this._off(now); this._candidate = null; this._dip = false;
      if (!this._running || this._generation !== generation) return result;
    }
    if (Math.abs(result.cents) > opt.centsTolerance) {
      this._candidate = null;
      this._report('unstable', 'Between notes or bending. Hold a stable pitch; no new answer was guessed.', info); return result;
    }
    if (this._candidate && this._candidate.midi === midi &&
        Math.max(this._candidate.high, result.cents) - Math.min(this._candidate.low, result.cents) <= 18) {
      this._candidate.count++; this._candidate.low = Math.min(this._candidate.low, result.cents);
      this._candidate.high = Math.max(this._candidate.high, result.cents);
    } else this._candidate = { midi: midi, count: 1, at: now, low: result.cents, high: result.cents };
    if (this._candidate.count >= opt.stableFrames) {
      var at = this._candidate.at; this._off(at);
      if (!this._running || this._generation !== generation) return result;
      this._current = Object.assign({ midi: midi }, result); this._current.midi = midi;
      this._candidate = null; this._peak = rms; this._dip = false; this._lastAttack = at;
      this._event(midi, true, at, result);
      if (!this._running || this._generation !== generation) return result;
      this._report('holding', 'One stable note detected. Release or pluck again before repeating.', info, true);
    } else this._report('candidate', 'Confirming a stable single note…', info);
    return result;
  };
  return PracticeInput;
});
