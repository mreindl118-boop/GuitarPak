/* GuitarLab jam module — backing track builder. Registers as 'jam'.
 * Synthesized drums + bass + comp instrument play a chord progression on a
 * lookahead scheduler. Keeps playing across in-app tabs (stops when the app
 * is hidden). Broadcasts the sounding chord on the App bus so the fretboard
 * can visualize scale-over-chord in real time:
 *   App.emit('jam:chord', { rootPc, quality, name, roman, tones:[pc...],
 *                           suggestedScale, suggestedName })
 *   App.emit('jam:stopped')
 * Persists under jam.* store keys.
 */
(function () {
  'use strict';

  // ---------------- state ----------------

  var state = {
    key: 9,             // A
    scale: 'aeolian',
    sevenths: false,
    barsPerChord: 1,
    vibe: 'rock',
    comp: 'strum',      // strum | pad | keys | off
    drums: true,
    bass: true,
    track: []           // [{rootPc, quality, name, roman}]
  };

  var els = {};
  var ctx = null;
  var noiseBuf = null;

  // ---------------- vibes ----------------
  // drums: k/s/h = 16th-step indices per 4/4 bar; swing shuffles the 8th "and"s.
  // bass: [beat, degree] per bar. comp: [beat, durBeats, gain] per bar.

  var VIBES = {
    rock: {
      name: 'Rock',
      drums: { k: [0, 8], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], swing: 0 },
      bass: [[0, 'R'], [1, 'R'], [1.5, 'R'], [2, '5'], [3, 'R'], [3.5, '5']],
      comp: [[0, 1.6, 0.5], [2, 1.2, 0.34]]
    },
    pop: {
      name: 'Pop',
      drums: { k: [0, 6, 8, 14], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], swing: 0 },
      bass: [[0, 'R'], [1.5, 'R'], [2, '5'], [3.5, '5']],
      comp: [[0, 1.2, 0.45], [1.5, 0.8, 0.3], [2.5, 1.2, 0.3]]
    },
    shuffle: {
      name: 'Blues shuffle',
      drums: { k: [0, 8], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], swing: 1 },
      bass: [[0, 'R'], [1, '3'], [2, '5'], [3, '6']],
      comp: [[0, 1.6, 0.42], [2, 1.6, 0.34]]
    },
    funk: {
      name: 'Funk',
      drums: { k: [0, 3, 6, 10], s: [4, 12], h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], swing: 0 },
      bass: [[0, 'R'], [0.75, 'R8'], [1.5, '5'], [2.5, 'R'], [3, 'b7']],
      comp: [[1.5, 0.25, 0.34], [3.5, 0.25, 0.34]]
    },
    ballad: {
      name: 'Ballad',
      drums: { k: [0, 10], s: [8], h: [0, 4, 8, 12], swing: 0 },
      bass: [[0, 'R'], [2, '5']],
      comp: [[0, 3.8, 0.4]]
    },
    latin: {
      name: 'Latin',
      drums: { k: [0, 6, 12], s: [8], h: [0, 2, 4, 6, 8, 10, 12, 14], swing: 0 },
      bass: [[0, 'R'], [1.5, '5'], [3, 'R']],
      comp: [[0, 1.2, 0.4], [2.5, 1.0, 0.3]]
    }
  };
  var VIBE_ORDER = ['rock', 'pop', 'shuffle', 'funk', 'ballad', 'latin'];

  // context-free chord-scale suggestions ("what to shred over this chord")
  var CHORD_SCALE = {
    maj: 'major', maj7: 'major', sus2: 'mixolydian', sus4: 'mixolydian',
    min: 'dorian', m7: 'dorian', mMaj7: 'melodicMinor',
    '7': 'mixolydian', m7b5: 'locrian', dim: 'locrian',
    dim7: 'harmonicMinor', aug: 'melodicMinor', augMaj7: 'melodicMinor'
  };

  function degSemis(deg, quality) {
    var iv = (Theory.QUALITIES[quality] || Theory.QUALITIES.maj).intervals;
    if (deg === 'R') return 0;
    if (deg === '3') return iv[1] != null ? iv[1] : 4;
    if (deg === '5') return iv[2] != null ? iv[2] : 7;
    if (deg === '6') return 9;
    if (deg === 'b7') return 10;
    if (deg === 'R8') return 12;
    return 0;
  }

  // ---------------- sampled instruments (FluidR3 GM, MIT — see samples/CREDITS.md) ----------------
  // A few anchor notes per instrument, pitch-shifted between anchors at play
  // time. Loaded lazily on first Play; every voice falls back to its synth
  // twin when a sample isn't available (offline first run, artifact build).

  var SAMPLE_SETS = {
    bass:   { dir: 'samples/bass/',   notes: { 28: 'E1', 33: 'A1', 38: 'D2', 43: 'G2', 48: 'C3' } },
    keys:   { dir: 'samples/keys/',   notes: { 48: 'C3', 52: 'E3', 57: 'A3', 60: 'C4', 64: 'E4', 69: 'A4', 72: 'C5' } },
    pad:    { dir: 'samples/pad/',    notes: { 48: 'C3', 59: 'B3', 64: 'E4', 67: 'G4', 72: 'C5' } },
    guitar: { dir: 'samples/guitar/', notes: { 40: 'E2', 45: 'A2', 50: 'D3', 55: 'G3', 59: 'B3', 64: 'E4' } }
  };
  var sampleBuf = {};
  var samplesRequested = false;
  var samplesLoaded = 0;
  var samplesTotal = 0;

  function loadSamples() {
    if (samplesRequested || !ctx) return;
    samplesRequested = true;
    Object.keys(SAMPLE_SETS).forEach(function (setId) {
      var set = SAMPLE_SETS[setId];
      Object.keys(set.notes).forEach(function (m) {
        samplesTotal++;
        // XHR, not fetch — fetch() refuses file:// URLs inside the APK's WebView
        var xhr = new XMLHttpRequest();
        xhr.open('GET', set.dir + set.notes[m] + '.mp3', true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function () {
          if ((xhr.status !== 200 && xhr.status !== 0) || !xhr.response) return;
          ctx.decodeAudioData(xhr.response, function (buf) {
            sampleBuf[setId + '/' + m] = buf;
            samplesLoaded++;
            sampleInfo();
          }, function () { /* undecodable — synth fallback */ });
        };
        xhr.onerror = function () { /* offline / blocked — synth fallback */ };
        try { xhr.send(); } catch (e) { /* file access blocked — synth fallback */ }
      });
    });
  }

  function sampleInfo() {
    var el = document.getElementById('jam-sinfo');
    if (el) el.textContent = samplesLoaded > 0 ? '· sampled instruments ready (' + samplesLoaded + '/' + samplesTotal + ')' : '';
  }

  function setReady(setId) {
    var notes = SAMPLE_SETS[setId].notes;
    for (var m in notes) if (sampleBuf[setId + '/' + m]) return true;
    return false;
  }

  function nearestSample(setId, midi) {
    var notes = SAMPLE_SETS[setId].notes, best = null, bd = 99;
    for (var m in notes) {
      var am = parseInt(m, 10);
      var d = Math.abs(midi - am);
      if (d < bd && sampleBuf[setId + '/' + m]) { bd = d; best = am; }
    }
    return best;
  }

  function playSample(setId, midi, t, dur, gain, attack, release) {
    var anchor = nearestSample(setId, midi);
    if (anchor == null) return false;
    var src = ctx.createBufferSource();
    src.buffer = sampleBuf[setId + '/' + anchor];
    src.playbackRate.value = Math.pow(2, (midi - anchor) / 12);
    var g = ctx.createGain();
    attack = attack || 0.004;
    release = release || 0.07;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.05);
    return true;
  }

  // ---------------- synth voices ----------------

  function getNoise() {
    if (noiseBuf) return noiseBuf;
    var len = Math.floor(ctx.sampleRate * 0.3);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function kick(t, gain) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(125, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.2);
  }

  function snare(t, gain) {
    var src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = getNoise();
    bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    src.connect(bp); bp.connect(g); g.connect(ctx.destination);
    src.start(t); src.stop(t + 0.15);
    var o = ctx.createOscillator(), g2 = ctx.createGain(); // body thump
    o.type = 'triangle'; o.frequency.value = 185;
    g2.gain.setValueAtTime(gain * 0.5, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g2); g2.connect(ctx.destination);
    o.start(t); o.stop(t + 0.1);
  }

  function hat(t, gain) {
    var src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = getNoise();
    hp.type = 'highpass'; hp.frequency.value = 6800;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.042);
    src.connect(hp); hp.connect(g); g.connect(ctx.destination);
    src.start(t); src.stop(t + 0.06);
  }

  function bassNote(t, midi, dur, gain) {
    if (setReady('bass') && playSample('bass', midi, t, Math.max(0.25, dur), gain * 1.5)) return;
    bassSynth(t, midi, dur, gain);
  }

  function bassSynth(t, midi, dur, gain) {
    var o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = Theory.noteFreq(midi);
    lp.type = 'lowpass'; lp.frequency.value = 750;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.setValueAtTime(gain, t + Math.max(0.05, dur - 0.08));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function padChord(t, midis, dur, gain) {
    if (setReady('pad')) {
      for (var p = 0; p < midis.length; p++) {
        playSample('pad', midis[p], t, dur, (gain / midis.length) * 1.9, 0.22, 0.4);
      }
      return;
    }
    padSynth(t, midis, dur, gain);
  }

  function padSynth(t, midis, dur, gain) {
    for (var i = 0; i < midis.length; i++) {
      var o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = Theory.noteFreq(midis[i]);
      o.detune.value = (i % 2 ? 5 : -5);
      lp.type = 'lowpass'; lp.frequency.value = 1300;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain / midis.length, t + 0.3);
      g.gain.setValueAtTime(gain / midis.length, t + Math.max(0.35, dur - 0.4));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }

  function keysChord(t, midis, gain) {
    if (setReady('keys')) {
      for (var k = 0; k < midis.length; k++) {
        playSample('keys', midis[k], t, 0.6, (gain / midis.length) * 1.7);
      }
      return;
    }
    keysSynth(t, midis, gain);
  }

  function keysSynth(t, midis, gain) {
    for (var i = 0; i < midis.length; i++) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = Theory.noteFreq(midis[i]);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain / midis.length, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + 0.5);
    }
  }

  // ---------------- chord helpers ----------------

  function chordVoicing(ch) {
    var shapes = Theory.chordShapes(ch.rootPc, ch.quality);
    if (shapes.length) return Theory.chordVoicing(shapes[0].frets);
    var iv = (Theory.QUALITIES[ch.quality] || Theory.QUALITIES.maj).intervals;
    var root = 48 + Theory.mod12(ch.rootPc - 0); // around C3
    var out = [];
    for (var i = 0; i < iv.length; i++) out.push(root + iv[i]);
    return out;
  }

  function bassRootMidi(pc) { return 28 + Theory.mod12(pc - 4); } // E1..D#2

  function chordTones(ch) {
    var iv = (Theory.QUALITIES[ch.quality] || Theory.QUALITIES.maj).intervals;
    var out = [];
    for (var i = 0; i < iv.length; i++) out.push(Theory.mod12(ch.rootPc + iv[i]));
    return out;
  }

  function chordEvent(ch) {
    var sc = CHORD_SCALE[ch.quality] || 'major';
    return {
      rootPc: ch.rootPc,
      quality: ch.quality,
      name: ch.name,
      roman: ch.roman || '',
      tones: chordTones(ch),
      suggestedScale: sc,
      suggestedName: Theory.pcName(ch.rootPc, Theory.FLAT_KEYS.has(ch.rootPc)) + ' ' +
        Theory.SCALES[sc].name.replace(/\s*\(.*\)$/, '')
    };
  }

  // ---------------- scheduler ----------------

  var playing = false;
  var timer = null;
  var bpm = 100;
  var nextBarT = 0;
  var barIdx = 0;       // counts bars since play started
  var vis = [];         // {t, chordIdx}

  function beatDur() { return 60 / bpm; }

  function stepTime(barT, step, swing) {
    var b = Math.floor(step / 4), sub = step % 4;
    if (swing && sub === 2) return barT + b * beatDur() + beatDur() * 2 / 3;
    return barT + b * beatDur() + sub * beatDur() / 4;
  }

  function scheduleBar(barT, chord, isChordStart, chordIdx) {
    var vibe = VIBES[state.vibe];
    var i, t;
    if (state.drums) {
      var d = vibe.drums;
      for (i = 0; i < d.k.length; i++) kick(stepTime(barT, d.k[i], d.swing), 0.85);
      for (i = 0; i < d.s.length; i++) snare(stepTime(barT, d.s[i], d.swing), 0.5);
      for (i = 0; i < d.h.length; i++) hat(stepTime(barT, d.h[i], d.swing), 0.22);
    }
    if (state.bass) {
      var root = bassRootMidi(chord.rootPc);
      for (i = 0; i < vibe.bass.length; i++) {
        t = barT + vibe.bass[i][0] * beatDur();
        var next = i + 1 < vibe.bass.length ? barT + vibe.bass[i + 1][0] * beatDur() : barT + 4 * beatDur();
        bassNote(t, root + degSemis(vibe.bass[i][1], chord.quality), Math.max(0.15, next - t - 0.02), 0.5);
      }
    }
    if (state.comp !== 'off') {
      var voicing = chordVoicing(chord);
      if (state.comp === 'pad') {
        if (isChordStart) padChord(barT, voicing.slice(-4), 4 * beatDur() * state.barsPerChord, 0.5);
      } else {
        for (i = 0; i < vibe.comp.length; i++) {
          t = barT + vibe.comp[i][0] * beatDur();
          if (state.comp === 'keys') {
            keysChord(t, voicing.slice(-4), vibe.comp[i][2] * 2.4);
          } else if (state.comp === 'guitar' && setReady('guitar')) {
            for (var gv = 0; gv < voicing.length; gv++) { // sampled strum
              playSample('guitar', voicing[gv], t + gv * 0.014,
                Math.min(1.5, vibe.comp[i][1] * beatDur() + 0.35), vibe.comp[i][2] * 0.5);
            }
          } else { // synth pluck strum (also the sampled-guitar fallback)
            for (var v = 0; v < voicing.length; v++) {
              App.pluck(voicing[v], (t - ctx.currentTime) + v * 0.014, Math.min(1.1, vibe.comp[i][1] * beatDur()), vibe.comp[i][2] / 2.4);
            }
          }
        }
      }
    }
    if (isChordStart) {
      vis.push({ t: barT, chordIdx: chordIdx });
      if (vis.length > 32) vis.shift();
    }
  }

  function tick() {
    var horizon = ctx.currentTime + 0.15;
    var barLen = 4 * beatDur();
    while (nextBarT < horizon) {
      if (!state.track.length) { stop(); return; }
      var chordIdx = Math.floor(barIdx / state.barsPerChord) % state.track.length;
      var isStart = barIdx % state.barsPerChord === 0;
      scheduleBar(nextBarT, state.track[chordIdx], isStart, chordIdx);
      barIdx++;
      nextBarT += barLen;
    }
    // visuals + bus events run off this timer (NOT rAF) so the fretboard
    // keeps receiving chord changes while the Jam tab is hidden
    var hit = null;
    while (vis.length && vis[0].t <= ctx.currentTime) hit = vis.shift();
    if (hit) {
      paintTrack(hit.chordIdx);
      var ch = state.track[hit.chordIdx];
      if (ch) {
        App.emit('jam:chord', chordEvent(ch));
        if (els.now) els.now.textContent = ch.name + (ch.roman ? '  ·  ' + ch.roman : '');
      }
    }
  }

  function play() {
    if (playing) return;
    if (!state.track.length) { els.now.textContent = 'add some chords first'; return; }
    try { ctx = App.getAudio(); } catch (e) { els.now.textContent = 'audio unavailable'; return; }
    loadSamples(); // lazy; first bars use synth until decoded (~a bar at most)
    vis.length = 0;
    barIdx = 0;
    nextBarT = ctx.currentTime + 0.1;
    playing = true;
    timer = setInterval(tick, 25);
    tick();
    els.play.textContent = 'Stop';
    setLive(true);
    App.emit('jam:chord', chordEvent(state.track[0]));
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    playing = false;
    vis.length = 0;
    if (els.play) els.play.textContent = 'Play';
    if (els.now) els.now.textContent = '';
    paintTrack(-1);
    setLive(false);
    App.emit('jam:stopped');
  }

  function setLive(on) {
    var btn = document.querySelector('.tab[data-panel="jam"]');
    if (btn) btn.classList.toggle('jam-live', on);
  }

  // ---------------- persistence ----------------

  function validChord(c) {
    return c && typeof c.rootPc === 'number' && isFinite(c.rootPc) && Theory.QUALITIES[c.quality];
  }

  function loadState() {
    var k = App.store.get('jam.key', 9);
    if (typeof k === 'number' && k >= 0 && k < 12) state.key = Math.floor(k);
    var sc = App.store.get('jam.scale', 'aeolian');
    if (Theory.SCALES[sc] && Theory.SCALES[sc].steps.length === 7) state.scale = sc;
    state.sevenths = !!App.store.get('jam.sevenths', false);
    var bp = App.store.get('jam.barsPerChord', 1);
    state.barsPerChord = bp === 2 ? 2 : 1;
    var vb = App.store.get('jam.vibe', 'rock');
    if (VIBES[vb]) state.vibe = vb;
    var cp = App.store.get('jam.comp', 'guitar');
    if (['guitar', 'strum', 'pad', 'keys', 'off'].indexOf(cp) !== -1) state.comp = cp;
    // one-time: settings saved before sampled instruments existed move from
    // the synth strum to the sampled guitar (synth stays selectable)
    if (!App.store.get('jam.migrSamp', false)) {
      if (state.comp === 'strum') state.comp = 'guitar';
      App.store.set('jam.comp', state.comp);
      App.store.set('jam.migrSamp', true);
    }
    state.drums = App.store.get('jam.drums', true) !== false;
    state.bass = App.store.get('jam.bass', true) !== false;
    var tr = App.store.get('jam.track', null);
    if (Object.prototype.toString.call(tr) === '[object Array]') {
      state.track = tr.filter(validChord).map(function (c) {
        var pc = Theory.mod12(Math.round(c.rootPc));
        return {
          rootPc: pc, quality: c.quality, roman: typeof c.roman === 'string' ? c.roman : '',
          name: typeof c.name === 'string' ? c.name : Theory.chordName(pc, c.quality, Theory.FLAT_KEYS.has(pc))
        };
      });
    }
    bpm = Math.max(30, Math.min(280, parseInt(App.store.get('met.bpm', 100), 10) || 100));
  }

  function saveState() {
    App.store.set('jam.key', state.key);
    App.store.set('jam.scale', state.scale);
    App.store.set('jam.sevenths', state.sevenths);
    App.store.set('jam.barsPerChord', state.barsPerChord);
    App.store.set('jam.vibe', state.vibe);
    App.store.set('jam.comp', state.comp);
    App.store.set('jam.drums', state.drums);
    App.store.set('jam.bass', state.bass);
    App.store.set('jam.track', state.track);
  }

  // user presets: named snapshots of the whole builder
  function getPresets() {
    var p = App.store.get('jam.presets', []);
    return Object.prototype.toString.call(p) === '[object Array]' ? p : [];
  }

  function savePreset(name) {
    var presets = getPresets().filter(function (p) { return p.name !== name; });
    presets.push({
      name: name, key: state.key, scale: state.scale, sevenths: state.sevenths,
      barsPerChord: state.barsPerChord, vibe: state.vibe, comp: state.comp,
      drums: state.drums, bass: state.bass, track: state.track
    });
    App.store.set('jam.presets', presets);
    renderPresetSelect();
  }

  function loadPreset(name) {
    var p = getPresets().filter(function (x) { return x.name === name; })[0];
    if (!p) return;
    stop();
    if (typeof p.key === 'number') state.key = Theory.mod12(Math.round(p.key));
    if (Theory.SCALES[p.scale]) state.scale = p.scale;
    state.sevenths = !!p.sevenths;
    state.barsPerChord = p.barsPerChord === 2 ? 2 : 1;
    if (VIBES[p.vibe]) state.vibe = p.vibe;
    if (['guitar', 'strum', 'pad', 'keys', 'off'].indexOf(p.comp) !== -1) state.comp = p.comp;
    state.drums = p.drums !== false;
    state.bass = p.bass !== false;
    state.track = (p.track || []).filter(validChord);
    saveState();
    syncControls();
    renderPalette();
    renderTrack();
  }

  function deletePreset(name) {
    App.store.set('jam.presets', getPresets().filter(function (p) { return p.name !== name; }));
    renderPresetSelect();
  }

  // ---------------- rendering ----------------

  function renderPalette() {
    var dia = Theory.diatonic(state.key, state.scale, state.sevenths);
    var h = '';
    for (var i = 0; i < dia.length; i++) {
      h += '<button type="button" class="chip jam-pal" data-jam-i="' + i + '"><b>' + dia[i].roman +
        '</b>&nbsp;' + dia[i].name + '</button>';
    }
    els.palette.innerHTML = h;
    els.palette._dia = dia;
  }

  function renderTrack() {
    if (!state.track.length) {
      els.track.innerHTML = '<span class="muted small">Tap chords above, or load a progression preset.</span>';
      return;
    }
    var h = '';
    for (var i = 0; i < state.track.length; i++) {
      h += '<button type="button" class="chip jam-bar" data-jam-bar="' + i + '" title="Remove">' +
        '<b>' + state.track[i].name + '</b><span class="muted small">&nbsp;' +
        (state.track[i].roman || '') + '</span></button>';
    }
    els.track.innerHTML = h;
  }

  function paintTrack(activeIdx) {
    if (!els.track) return;
    var kids = els.track.querySelectorAll('.jam-bar');
    for (var i = 0; i < kids.length; i++) kids[i].classList.toggle('active', i === activeIdx);
  }

  function renderPresetSelect() {
    var presets = getPresets();
    var h = '<option value="">— saved tracks —</option>';
    for (var i = 0; i < presets.length; i++) {
      h += '<option value="' + presets[i].name.replace(/"/g, '&quot;') + '">' + presets[i].name + '</option>';
    }
    els.presetSel.innerHTML = h;
  }

  function syncControls() {
    els.key.value = String(state.key);
    els.scale.value = state.scale;
    els.sev.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', (b.getAttribute('data-jam-sev') === '7') === state.sevenths);
    });
    els.vibe.value = state.vibe;
    els.comp.value = state.comp;
    els.drums.checked = state.drums;
    els.bass.checked = state.bass;
    els.bars.value = String(state.barsPerChord);
    els.bpm.value = String(bpm);
  }

  // ---------------- init ----------------

  function opt(v, label, sel) {
    return '<option value="' + v + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + label + '</option>';
  }

  function init(rootEl) {
    App.injectCSS('jam',
      '.tab.jam-live::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;' +
        'background:var(--teal);margin-right:7px;vertical-align:1px;box-shadow:0 0 8px rgba(76,201,176,0.5);' +
        'animation:met-pulse 0.9s ease-in-out infinite alternate;}' +
      '.tab.active.jam-live::before{background:var(--bg);box-shadow:none;}' +
      '.jam-track{display:flex;flex-wrap:wrap;gap:8px;min-height:40px;align-items:center}' +
      '.jam-bar.active{border-color:var(--accent);color:var(--accent);' +
        'box-shadow:0 0 14px rgba(255,171,71,0.3)}' +
      '.jam-now{font-family:var(--font-display);font-size:26px;font-weight:600;letter-spacing:1px;min-height:32px}' +
      '.jam-pal{cursor:pointer}.jam-bar{cursor:pointer}'
    );

    loadState();

    var rootOpts = '', pc;
    for (pc = 0; pc < 12; pc++) rootOpts += opt(pc, Theory.pcName(pc, Theory.FLAT_KEYS.has(pc)), state.key);
    var scaleOpts = '';
    Theory.SCALE_ORDER.forEach(function (id) {
      if (Theory.SCALES[id].steps.length === 7) scaleOpts += opt(id, Theory.SCALES[id].name, state.scale);
    });
    var progOpts = '<option value="">— progression preset —</option>';
    Theory.PROGRESSIONS.forEach(function (p) { progOpts += opt(p.id, p.name, ''); });
    var vibeOpts = '';
    VIBE_ORDER.forEach(function (id) { vibeOpts += opt(id, VIBES[id].name, state.vibe); });

    rootEl.innerHTML =
      '<div class="card">' +
        '<h2>Backing track</h2>' +
        '<div class="row tight">' +
          '<label class="field">Key<select id="jam-key">' + rootOpts + '</select></label>' +
          '<label class="field">Scale<select id="jam-scale">' + scaleOpts + '</select></label>' +
          '<div class="fb-field">Chords<div class="seg" id="jam-sev">' +
            '<button type="button" data-jam-sev="3">Triads</button>' +
            '<button type="button" data-jam-sev="7">7ths</button>' +
          '</div></div>' +
          '<label class="field">Load<select id="jam-prog">' + progOpts + '</select></label>' +
        '</div>' +
        '<div class="row tight" id="jam-palette" style="margin-top:10px"></div>' +
        '<h3 style="margin-top:16px">Track <button type="button" class="btn sm" id="jam-clear" style="margin-left:8px">Clear</button></h3>' +
        '<div class="jam-track" id="jam-track"></div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>Sound</h2>' +
        '<div class="row tight">' +
          '<label class="field">Vibe<select id="jam-vibe">' + vibeOpts + '</select></label>' +
          '<label class="field">Comp<select id="jam-comp">' +
            opt('guitar', 'Guitar (sampled)', state.comp) + opt('strum', 'Guitar (synth)', state.comp) +
            opt('pad', 'Pad', state.comp) + opt('keys', 'Keys', state.comp) +
            opt('off', 'Off', state.comp) + '</select></label>' +
          '<label class="row tight small muted" style="gap:5px"><input type="checkbox" id="jam-drums">Drums</label>' +
          '<label class="row tight small muted" style="gap:5px"><input type="checkbox" id="jam-bass">Bass</label>' +
          '<label class="field">BPM<input type="number" id="jam-bpm" min="30" max="280" style="width:74px" title="Tempo — linked to the metronome"></label>' +
          '<label class="field">Bars/chord<select id="jam-bars">' + opt(1, '1', state.barsPerChord) + opt(2, '2', state.barsPerChord) + '</select></label>' +
        '</div>' +
        '<div class="row" style="margin-top:14px">' +
          '<button type="button" class="btn big primary" id="jam-play">Play</button>' +
          '<span class="jam-now" id="jam-now"></span>' +
        '</div>' +
        '<div class="muted small" style="margin-top:10px">While it plays, open the Fretboard tab &mdash; it highlights the chord tones and suggests a mode for every chord. <span id="jam-sinfo"></span></div>' +
      '</div>' +
      '<div class="card">' +
        '<h3>Saved tracks</h3>' +
        '<div class="row tight">' +
          '<input type="text" id="jam-pname" placeholder="name this track" style="width:170px">' +
          '<button type="button" class="btn sm" id="jam-psave">Save</button>' +
          '<select id="jam-psel"></select>' +
          '<button type="button" class="btn sm" id="jam-pload">Load</button>' +
          '<button type="button" class="btn sm danger" id="jam-pdel">Delete</button>' +
        '</div>' +
      '</div>';

    els.key = document.getElementById('jam-key');
    els.scale = document.getElementById('jam-scale');
    els.sev = document.getElementById('jam-sev');
    els.prog = document.getElementById('jam-prog');
    els.palette = document.getElementById('jam-palette');
    els.track = document.getElementById('jam-track');
    els.vibe = document.getElementById('jam-vibe');
    els.comp = document.getElementById('jam-comp');
    els.drums = document.getElementById('jam-drums');
    els.bass = document.getElementById('jam-bass');
    els.bpm = document.getElementById('jam-bpm');
    els.bars = document.getElementById('jam-bars');
    els.play = document.getElementById('jam-play');
    els.now = document.getElementById('jam-now');
    els.presetSel = document.getElementById('jam-psel');

    syncControls();
    renderPalette();
    renderTrack();
    renderPresetSelect();

    els.key.addEventListener('change', function () {
      state.key = Theory.mod12(parseInt(this.value, 10) || 0);
      saveState(); renderPalette();
    });
    els.scale.addEventListener('change', function () {
      if (Theory.SCALES[this.value]) state.scale = this.value;
      saveState(); renderPalette();
    });
    els.sev.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-jam-sev]');
      if (!b) return;
      state.sevenths = b.getAttribute('data-jam-sev') === '7';
      saveState(); syncControls(); renderPalette();
    });
    els.prog.addEventListener('change', function () {
      var preset = null;
      for (var i = 0; i < Theory.PROGRESSIONS.length; i++) {
        if (Theory.PROGRESSIONS[i].id === this.value) preset = Theory.PROGRESSIONS[i];
      }
      if (!preset) return;
      state.scale = preset.scale;
      state.sevenths = !!preset.sevenths;
      state.track = Theory.resolveProgression(preset, state.key);
      this.value = '';
      saveState(); syncControls(); renderPalette(); renderTrack();
    });
    els.palette.addEventListener('click', function (e) {
      var b = e.target.closest('.jam-pal');
      if (!b) return;
      var dia = els.palette._dia || [];
      var ch = dia[parseInt(b.getAttribute('data-jam-i'), 10)];
      if (!ch) return;
      state.track.push({ rootPc: ch.rootPc, quality: ch.quality, name: ch.name, roman: ch.roman });
      saveState(); renderTrack();
    });
    els.track.addEventListener('click', function (e) {
      var b = e.target.closest('.jam-bar');
      if (!b) return;
      state.track.splice(parseInt(b.getAttribute('data-jam-bar'), 10), 1);
      saveState(); renderTrack();
    });
    document.getElementById('jam-clear').addEventListener('click', function () {
      state.track = [];
      saveState(); renderTrack();
    });
    els.vibe.addEventListener('change', function () {
      if (VIBES[this.value]) state.vibe = this.value;
      saveState();
    });
    els.comp.addEventListener('change', function () {
      state.comp = this.value;
      saveState();
    });
    els.drums.addEventListener('change', function () { state.drums = !!this.checked; saveState(); });
    els.bass.addEventListener('change', function () { state.bass = !!this.checked; saveState(); });
    els.bars.addEventListener('change', function () {
      state.barsPerChord = this.value === '2' ? 2 : 1;
      saveState();
    });
    els.bpm.addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      if (isNaN(v)) v = 100;
      bpm = Math.max(30, Math.min(280, v));
      this.value = String(bpm);
      App.store.set('met.bpm', bpm);
      App.emit('tempo', { bpm: bpm, source: 'jam' });
    });
    App.on('tempo', function (d) {
      if (d.source === 'jam') return;
      bpm = Math.max(30, Math.min(280, d.bpm));
      if (els.bpm) els.bpm.value = String(bpm);
    });

    els.play.addEventListener('click', function () { if (playing) stop(); else play(); });

    document.getElementById('jam-psave').addEventListener('click', function () {
      var name = document.getElementById('jam-pname').value.trim();
      if (!name) return;
      savePreset(name);
      document.getElementById('jam-pname').value = '';
    });
    document.getElementById('jam-pload').addEventListener('click', function () {
      if (els.presetSel.value) loadPreset(els.presetSel.value);
    });
    document.getElementById('jam-pdel').addEventListener('click', function () {
      if (els.presetSel.value) deletePreset(els.presetSel.value);
    });

    // like the metronome: keep playing across in-app tabs, stop when the APP hides
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && playing) stop();
    });
  }

  App.register('jam', {
    init: init,
    // deliberately no onHide stop — the backing track keeps playing while you
    // practice on the fretboard; visibilitychange stops it when the app hides
    onKey: function (e) {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (playing) stop(); else play();
      }
    }
  });
})();
