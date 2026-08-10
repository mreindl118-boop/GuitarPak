/* GuitarLab jam module v2 — an auto-band. Registers as 'jam'.
 *
 * Band-in-a-Box-style flow: pick a GENRE, hit Play, and a full band plays a
 * complete song form (Intro → A → B → …, Finish cues the Ending) in the
 * app's shared key. Everything above the sound layer is new:
 *   - genre presets auto-arrange a song (sections with degree-based chords,
 *     so changing the key in the context bar re-harmonizes LIVE)
 *   - editable song structure: per-section chords, repeats, bars-per-chord,
 *     sections toggle on/off
 *   - per-instrument mixer (drums / bass / comp) with volume + mute and a
 *     selectable comp instrument
 *   - style & feel: energy (Chill / Groove / Push) + swing
 *   - live re-harmonizing: tap a palette chord (or play one on a MIDI
 *     keyboard) while the band plays to vamp on it; Resume returns to the form
 *
 * The SOUND layer is the maintained original: sampled instruments
 * (samples/CREDITS.md), synthesized drums, humanization — untouched.
 * Broadcasts the sounding chord exactly as before so the fretboard/piano
 * follow: App.emit('jam:chord', {rootPc, quality, name, roman, tones,
 * suggestedScale, suggestedName}) / App.emit('jam:stopped').
 * Persists under jam2.* (old jam.track progressions migrate into section A).
 */
(function () {
  'use strict';

  var els = {};
  var ctx = null;
  var noiseBuf = null;

  // ---------------- state ----------------

  var state = {
    genre: 'rock',
    energy: 2,          // 1 chill · 2 groove · 3 push
    swing: 0,           // 0..1 (seeded from the genre default on genre change)
    comp: 'guitar',     // guitar | eguitar | nylon | keys | pad
    mix: {
      drums: { on: true, vol: 80 },
      bass: { on: true, vol: 80 },
      comp: { on: true, vol: 80 }
    },
    sections: [],       // [{id, on, repeats, barsPerChord, chords:[token]}]
    selSec: 'a'
  };
  // chord token: {d: 1..7, q?: qualityOverride} (degree — re-harmonizes with
  // the key) or {abs: {rootPc, quality}} (fixed — migrated progressions)

  var COMP_IDS = ['guitar', 'eguitar', 'nylon', 'keys', 'pad'];
  var SEC_LABELS = { intro: 'Intro', a: 'A', b: 'B', ending: 'Ending' };

  // ---------------- genres ----------------
  // drums: k/s/h = 16th-step indices per 4/4 bar. bass: [beat, degree].
  // comp: [beat, durBeats, gain]. song: degree tokens per section.

  var GENRES = {
    rock: {
      name: 'Rock',
      swing: 0,
      drums: { k: [0, 8], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14] },
      bass: [[0, 'R'], [1, 'R'], [1.5, 'R'], [2, '5'], [3, 'R'], [3.5, '5']],
      comp: [[0, 1.6, 0.5], [2, 1.2, 0.34]],
      song: {
        intro: [{ d: 1 }],
        a: [{ d: 1 }, { d: 5 }, { d: 6 }, { d: 4 }],
        b: [{ d: 4 }, { d: 5 }, { d: 1 }, { d: 1 }],
        ending: [{ d: 5 }, { d: 1 }]
      }
    },
    pop: {
      name: 'Pop',
      swing: 0,
      drums: { k: [0, 6, 8, 14], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14] },
      bass: [[0, 'R'], [1.5, 'R'], [2, '5'], [3.5, '5']],
      comp: [[0, 1.2, 0.45], [1.5, 0.8, 0.3], [2.5, 1.2, 0.3]],
      song: {
        intro: [{ d: 1 }],
        a: [{ d: 6 }, { d: 4 }, { d: 1 }, { d: 5 }],
        b: [{ d: 4 }, { d: 1 }, { d: 5 }, { d: 6 }],
        ending: [{ d: 4 }, { d: 1 }]
      }
    },
    shuffle: {
      name: 'Blues shuffle',
      swing: 1,
      drums: { k: [0, 8], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14] },
      bass: [[0, 'R'], [1, '3'], [2, '5'], [3, '6']],
      comp: [[0, 1.6, 0.42], [2, 1.6, 0.34]],
      song: {
        intro: [{ d: 1, q: '7' }],
        a: [{ d: 1, q: '7' }, { d: 1, q: '7' }, { d: 1, q: '7' }, { d: 1, q: '7' },
            { d: 4, q: '7' }, { d: 4, q: '7' }, { d: 1, q: '7' }, { d: 1, q: '7' },
            { d: 5, q: '7' }, { d: 4, q: '7' }, { d: 1, q: '7' }, { d: 5, q: '7' }],
        b: [{ d: 4, q: '7' }, { d: 4, q: '7' }, { d: 1, q: '7' }, { d: 1, q: '7' }],
        ending: [{ d: 5, q: '7' }, { d: 1, q: '7' }]
      }
    },
    funk: {
      name: 'Funk',
      swing: 0,
      drums: { k: [0, 3, 6, 10], s: [4, 12], h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
      bass: [[0, 'R'], [0.75, 'R8'], [1.5, '5'], [2.5, 'R'], [3, 'b7']],
      comp: [[1.5, 0.25, 0.34], [3.5, 0.25, 0.34]],
      song: {
        intro: [{ d: 1, q: 'm7' }],
        a: [{ d: 1, q: 'm7' }, { d: 1, q: 'm7' }, { d: 4, q: '7' }, { d: 1, q: 'm7' }],
        b: [{ d: 6 }, { d: 5, q: '7' }, { d: 1, q: 'm7' }, { d: 1, q: 'm7' }],
        ending: [{ d: 5, q: '7' }, { d: 1, q: 'm7' }]
      }
    },
    ballad: {
      name: 'Ballad',
      swing: 0,
      drums: { k: [0, 10], s: [8], h: [0, 4, 8, 12] },
      bass: [[0, 'R'], [2, '5']],
      comp: [[0, 3.8, 0.4]],
      song: {
        intro: [{ d: 1 }],
        a: [{ d: 1 }, { d: 6 }, { d: 4 }, { d: 5 }],
        b: [{ d: 2 }, { d: 5 }, { d: 1 }, { d: 6 }],
        ending: [{ d: 4 }, { d: 1 }]
      }
    },
    latin: {
      name: 'Latin',
      swing: 0,
      drums: { k: [0, 6, 12], s: [8], h: [0, 2, 4, 6, 8, 10, 12, 14] },
      bass: [[0, 'R'], [1.5, '5'], [3, 'R']],
      comp: [[0, 1.2, 0.4], [2.5, 1.0, 0.3]],
      song: {
        intro: [{ d: 1 }],
        a: [{ d: 1 }, { d: 7 }, { d: 6 }, { d: 5 }],
        b: [{ d: 4 }, { d: 7 }, { d: 1 }, { d: 5 }],
        ending: [{ d: 5 }, { d: 1 }]
      }
    }
  };
  var GENRE_ORDER = ['rock', 'pop', 'shuffle', 'funk', 'ballad', 'latin'];

  // context-free chord-scale suggestions ("what to shred over this chord")
  var CHORD_SCALE = {
    maj: 'major', maj7: 'major', sus2: 'mixolydian', sus4: 'mixolydian',
    min: 'dorian', m7: 'dorian', mMaj7: 'melodicMinor',
    '7': 'mixolydian', m7b5: 'locrian', dim: 'locrian',
    dim7: 'harmonicMinor', aug: 'melodicMinor', augMaj7: 'melodicMinor'
  };

  // ---------------- shared key (context bar is the single home) ----------------

  function keyPc() {
    var v = App.store.get('fb.root', 9);
    return (typeof v === 'number' && v >= 0 && v < 12) ? Math.floor(v) : 9;
  }

  function keyScale() {
    var v = App.store.get('fb.scale', 'major');
    return (Theory.SCALES[v] && Theory.SCALES[v].steps.length === 7) ? v : 'major';
  }

  function diatonicChords() {
    return Theory.diatonic(keyPc(), keyScale(), false);
  }

  // resolve a token against the CURRENT key — this is what makes a key change
  // in the bar re-harmonize the whole song live
  function resolveToken(tok) {
    var pf = Theory.FLAT_KEYS.has(keyPc());
    if (tok.abs) {
      var pc = Theory.mod12(tok.abs.rootPc);
      var q0 = Theory.QUALITIES[tok.abs.quality] ? tok.abs.quality : 'maj';
      return { rootPc: pc, quality: q0, roman: '', name: Theory.chordName(pc, q0, pf) };
    }
    var dia = diatonicChords();
    var d = Math.max(1, Math.min(7, tok.d || 1));
    var base = dia[d - 1] || dia[0];
    var q = tok.q && Theory.QUALITIES[tok.q] ? tok.q : base.quality;
    return {
      rootPc: base.rootPc, quality: q, roman: base.roman,
      name: Theory.chordName(base.rootPc, q, pf)
    };
  }

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

  // ---------------- sampled instruments (UNCHANGED sound layer) ----------------
  // A few anchor notes per instrument, pitch-shifted between anchors at play
  // time. Loaded lazily on first Play; every voice falls back to its synth
  // twin when a sample isn't available.

  var SAMPLE_SETS = {
    bass:    { dir: 'samples/bass/',    notes: { 28: 'E1', 33: 'A1', 38: 'D2', 43: 'G2', 48: 'C3' } },
    bassp:   { dir: 'samples/bassp/',   notes: { 28: 'E1', 33: 'A1', 38: 'D2', 43: 'G2', 48: 'C3' } },
    keys:    { dir: 'samples/keys/',    notes: { 48: 'C3', 52: 'E3', 57: 'A3', 60: 'C4', 64: 'E4', 69: 'A4', 72: 'C5' } },
    pad:     { dir: 'samples/pad/',     notes: { 48: 'C3', 59: 'B3', 64: 'E4', 67: 'G4', 72: 'C5' } },
    guitar:  { dir: 'samples/guitar/',  notes: { 40: 'E2', 45: 'A2', 48: 'C3', 52: 'E3', 55: 'G3', 59: 'B3',
                                                 64: 'E4', 67: 'G4', 69: 'A4', 72: 'C5', 74: 'D5' } },
    eguitar: { dir: 'samples/eguitar/', notes: { 40: 'E2', 45: 'A2', 48: 'C3', 57: 'A3', 66: 'Fs4', 69: 'A4',
                                                 72: 'C5', 78: 'Fs5', 81: 'A5' } },
    nylon:   { dir: 'samples/nylon/',   notes: { 40: 'E2', 45: 'A2', 50: 'D3', 55: 'G3', 59: 'B3', 64: 'E4',
                                                 69: 'A4', 74: 'D5', 76: 'E5', 81: 'A5' } }
  };

  var GUITAR_COMPS = { guitar: 1, eguitar: 1, nylon: 1 };

  function hum(s) { return (Math.random() * 2 - 1) * s; }
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
            sampleBuf[setId + '/' + m] = jamCondense(buf, 2.8);
            samplesLoaded++;
            sampleInfo();
          }, function () { /* undecodable — synth fallback */ });
        };
        xhr.onerror = function () { /* offline / blocked — synth fallback */ };
        try { xhr.send(); } catch (e) { /* file access blocked — synth fallback */ }
      });
    });
  }

  function jamCondense(buf, secs) {
    var sr = buf.sampleRate;
    var n = Math.min(buf.length, Math.floor(secs * sr));
    var out = ctx.createBuffer(1, n, sr);
    var dst = out.getChannelData(0);
    var a = buf.getChannelData(0);
    var b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    for (var i = 0; i < n; i++) dst[i] = b ? (a[i] + b[i]) * 0.5 : a[i];
    var fade = Math.min(n, Math.floor(0.2 * sr));
    for (i = 0; i < fade; i++) dst[n - 1 - i] *= i / fade;
    return out;
  }

  function sampleInfo() {
    var el = document.getElementById('jam-sinfo');
    if (el) el.textContent = samplesLoaded > 0 ? 'sampled band ready (' + samplesLoaded + '/' + samplesTotal + ')' : '';
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

  var SET_TRIM = { guitar: 0.25, eguitar: 0.48, nylon: 0.18, bass: 0.35, bassp: 1.0, keys: 1, pad: 1 };

  function playSample(setId, midi, t, dur, gain, attack, release) {
    var anchor = nearestSample(setId, midi);
    if (anchor == null) return false;
    gain *= SET_TRIM[setId] || 1;
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

  // ---------------- synth voices (UNCHANGED) ----------------

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
    var set = App.store.get('app.bassStyle', 'finger') === 'pick' ? 'bassp' : 'bass';
    if (setReady(set) && playSample(set, midi, t, Math.max(0.25, dur), gain * 1.5)) return;
    if (set !== 'bass' && setReady('bass') && playSample('bass', midi, t, Math.max(0.25, dur), gain * 1.5)) return;
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
        playSample('pad', midis[p], t + p * 0.012, dur, (gain / midis.length) * 1.9, 0.22, 0.4);
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
        playSample('keys', midis[k], t + k * 0.004 + Math.random() * 0.006, 0.6,
          (gain / midis.length) * 1.7 * (0.88 + Math.random() * 0.24));
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
    var root = 48 + Theory.mod12(ch.rootPc - 0);
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

  // ---------------- song form ----------------

  function defaultSections(genre) {
    var song = GENRES[genre].song;
    return [
      { id: 'intro', on: true, repeats: 1, barsPerChord: 1, chords: song.intro.map(clone) },
      { id: 'a', on: true, repeats: 2, barsPerChord: 1, chords: song.a.map(clone) },
      { id: 'b', on: true, repeats: 1, barsPerChord: 1, chords: song.b.map(clone) },
      { id: 'ending', on: true, repeats: 1, barsPerChord: 2, chords: song.ending.map(clone) }
    ];
    function clone(t) { return JSON.parse(JSON.stringify(t)); }
  }

  function section(id) {
    for (var i = 0; i < state.sections.length; i++) {
      if (state.sections[i].id === id) return state.sections[i];
    }
    return null;
  }

  // flatten sections into bar lists the scheduler walks
  function buildPlan() {
    function barsOf(sec) {
      var out = [];
      if (!sec || !sec.on || !sec.chords.length) return out;
      for (var r = 0; r < sec.repeats; r++) {
        for (var c = 0; c < sec.chords.length; c++) {
          for (var b = 0; b < sec.barsPerChord; b++) {
            out.push({ tok: sec.chords[c], secId: sec.id, chordIdx: c, isStart: b === 0 });
          }
        }
      }
      return out;
    }
    return {
      intro: barsOf(section('intro')),
      loop: barsOf(section('a')).concat(barsOf(section('b'))),
      ending: barsOf(section('ending'))
    };
  }

  // ---------------- scheduler ----------------

  var playing = false;
  var timer = null;
  var bpm = 100;
  var nextBarT = 0;
  var vis = [];
  var plan = null;
  var pos = { phase: 'intro', i: 0 };
  var finishing = false;
  var override = null;   // {tok} — live vamp; Resume clears

  function beatDur() { return 60 / bpm; }

  function stepTime(barT, step) {
    var b = Math.floor(step / 4), sub = step % 4;
    if (state.swing > 0 && sub === 2) {
      return barT + b * beatDur() + beatDur() * (0.5 + 0.1667 * state.swing);
    }
    return barT + b * beatDur() + sub * beatDur() / 4;
  }

  // energy transforms: one knob from sparse to pushing
  function drumsFor() {
    var d = GENRES[state.genre].drums;
    if (state.energy === 1) return { k: [0, 8], s: d.s.length ? [d.s[d.s.length - 1]] : [], h: [0, 4, 8, 12], ghost: true };
    if (state.energy === 3) {
      var k = d.k.slice();
      if (k.indexOf(14) === -1) k.push(14);
      return { k: k, s: d.s, h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] };
    }
    return d;
  }

  function bassFor() {
    var b = GENRES[state.genre].bass;
    if (state.energy === 1) return [[0, 'R'], [2, '5']];
    if (state.energy === 3) return b.concat([[3.75, 'R8']]);
    return b;
  }

  function compFor() {
    var c = GENRES[state.genre].comp;
    if (state.energy === 1) return [[0, 3.8, 0.42]];
    if (state.energy === 3) return c.concat([[2.5, 0.5, 0.3]]);
    return c;
  }

  function scheduleBar(barT, chord, isChordStart, holdBars) {
    var i, t;
    var mixD = state.mix.drums, mixB = state.mix.bass, mixC = state.mix.comp;
    if (mixD.on && mixD.vol > 0) {
      var dv = mixD.vol / 80;
      var d = drumsFor();
      for (i = 0; i < d.k.length; i++) {
        kick(stepTime(barT, d.k[i]) + hum(0.004), (0.78 + Math.random() * 0.14) * dv);
      }
      for (i = 0; i < d.s.length; i++) {
        snare(stepTime(barT, d.s[i]) + hum(0.005), (d.ghost ? 0.2 : 0.44 + Math.random() * 0.12) * dv);
      }
      for (i = 0; i < d.h.length; i++) {
        var hg = (d.h[i] % 4 === 0 ? 0.26 : 0.15) * (0.85 + Math.random() * 0.3);
        if (Math.random() < 0.05) hg *= 0.4;
        hat(stepTime(barT, d.h[i]) + hum(0.006), hg * dv);
      }
    }
    if (mixB.on && mixB.vol > 0) {
      var bv = mixB.vol / 80;
      var bass = bassFor();
      var root = bassRootMidi(chord.rootPc);
      for (i = 0; i < bass.length; i++) {
        t = barT + bass[i][0] * beatDur() + hum(0.006);
        var next = i + 1 < bass.length ? barT + bass[i + 1][0] * beatDur() : barT + 4 * beatDur();
        bassNote(t, root + degSemis(bass[i][1], chord.quality),
          Math.max(0.15, next - t - 0.02), 0.5 * (0.9 + Math.random() * 0.2) * bv);
      }
    }
    if (mixC.on && mixC.vol > 0) {
      var cv = mixC.vol / 80;
      var voicing = chordVoicing(chord);
      if (state.comp === 'pad') {
        if (isChordStart) padChord(barT, voicing.slice(-4), 4 * beatDur() * holdBars, 0.5 * cv);
      } else {
        var comp = compFor();
        for (i = 0; i < comp.length; i++) {
          t = barT + comp[i][0] * beatDur() + hum(0.008);
          var hitGain = comp[i][2] * (0.88 + Math.random() * 0.24) * cv;
          if (state.comp === 'keys') {
            keysChord(t, voicing.slice(-4), hitGain * 2.4);
            continue;
          }
          var gap = 0.008 + Math.random() * 0.012;
          var order = comp[i][0] % 1 !== 0 ? voicing.slice().reverse() : voicing;
          var sampled = GUITAR_COMPS[state.comp] && setReady(state.comp);
          for (var v = 0; v < order.length; v++) {
            var noteGain = 0.9 + Math.random() * 0.2;
            if (sampled) {
              playSample(state.comp, order[v], t + v * gap,
                Math.min(1.5, comp[i][1] * beatDur() + 0.35), hitGain * 0.5 * noteGain);
            } else {
              App.pluck(order[v], (t - ctx.currentTime) + v * gap,
                Math.min(1.1, comp[i][1] * beatDur()), hitGain / 2.4 * noteGain);
            }
          }
        }
      }
    }
  }

  // walk the form one bar at a time
  function nextBarEntry() {
    if (!plan) plan = buildPlan();
    if (pos.phase === 'intro') {
      if (pos.i < plan.intro.length) return plan.intro[pos.i++];
      pos.phase = 'loop';
      pos.i = 0;
    }
    if (pos.phase === 'loop') {
      if (!plan.loop.length) return null;
      if (finishing && plan.ending.length && pos.i % plan.loop.length === 0) {
        pos.phase = 'ending';
        pos.i = 0;
      } else {
        var e = plan.loop[pos.i % plan.loop.length];
        pos.i++;
        return e;
      }
    }
    if (pos.phase === 'ending') {
      if (pos.i < plan.ending.length) return plan.ending[pos.i++];
      return null; // form complete
    }
    return null;
  }

  function tick() {
    if (nextBarT < ctx.currentTime - 0.02) nextBarT = ctx.currentTime + 0.05;
    var horizon = ctx.currentTime + 0.3;
    var barLen = 4 * beatDur();
    while (nextBarT < horizon) {
      var entry = override ? { tok: override.tok, secId: 'vamp', chordIdx: 0, isStart: true }
                           : nextBarEntry();
      if (!entry) { stopSoon(nextBarT); return; }
      var chord = resolveToken(entry.tok);
      var holdBars = override ? 1 : (section(entry.secId) ? section(entry.secId).barsPerChord : 1);
      scheduleBar(nextBarT, chord, entry.isStart || !!override, holdBars);
      if (entry.isStart || override) {
        vis.push({ t: nextBarT, chord: chord, secId: entry.secId });
        if (vis.length > 32) vis.shift();
      }
      nextBarT += barLen;
    }
    // visuals + bus events run off this timer (NOT rAF) so the fretboard
    // keeps receiving chord changes while the Jam tab is hidden
    var hit = null;
    while (vis.length && vis[0].t <= ctx.currentTime) hit = vis.shift();
    if (hit) {
      paintNow(hit);
      App.emit('jam:chord', chordEvent(hit.chord));
    }
  }

  var stopTimer = null;

  function stopSoon(atT) {
    // let the last scheduled bar ring out, then stop cleanly
    if (stopTimer) return;
    var ms = Math.max(0, (atT - ctx.currentTime) * 1000) + 150;
    stopTimer = setTimeout(function () { stopTimer = null; stop(); }, ms);
  }

  function play() {
    if (playing) return;
    try { ctx = App.getAudio(); } catch (e) { setNow('audio unavailable', ''); return; }
    loadSamples();
    vis.length = 0;
    plan = buildPlan();
    if (!plan.loop.length && !plan.intro.length) { setNow('section A needs chords', ''); return; }
    pos = { phase: plan.intro.length ? 'intro' : 'loop', i: 0 };
    finishing = false;
    override = null;
    nextBarT = ctx.currentTime + 0.1;
    playing = true;
    App.wake.acquire('jam-run');
    timer = setInterval(tick, 25);
    tick();
    updateTransport();
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
    playing = false;
    finishing = false;
    override = null;
    App.wake.release('jam-run');
    vis.length = 0;
    setNow('', '');
    paintForm(null);
    updateTransport();
    App.emit('jam:stopped');
  }

  function finish() {
    if (!playing) return;
    finishing = true;
    updateTransport();
  }

  // ---------------- persistence + migration ----------------

  function validToken(t) {
    if (!t) return false;
    if (t.abs) return typeof t.abs.rootPc === 'number' && !!Theory.QUALITIES[t.abs.quality];
    return typeof t.d === 'number' && t.d >= 1 && t.d <= 7;
  }

  function loadState() {
    var g = App.store.get;
    if (GENRES[g('jam2.genre', 'rock')]) state.genre = g('jam2.genre', 'rock');
    var en = parseInt(g('jam2.energy', 2), 10);
    state.energy = (en >= 1 && en <= 3) ? en : 2;
    var sw = parseFloat(g('jam2.swing', GENRES[state.genre].swing));
    state.swing = (sw >= 0 && sw <= 1) ? sw : GENRES[state.genre].swing;
    var cp = g('jam2.comp', 'guitar');
    state.comp = COMP_IDS.indexOf(cp) !== -1 ? cp : 'guitar';
    var mx = g('jam2.mix', null);
    if (mx && mx.drums && mx.bass && mx.comp) {
      ['drums', 'bass', 'comp'].forEach(function (ch) {
        state.mix[ch].on = mx[ch].on !== false;
        var v = parseInt(mx[ch].vol, 10);
        state.mix[ch].vol = (v >= 0 && v <= 100) ? v : 80;
      });
    }
    var secs = g('jam2.sections', null);
    if (Object.prototype.toString.call(secs) === '[object Array]' && secs.length) {
      state.sections = secs.filter(function (s) {
        return s && SEC_LABELS[s.id] && Object.prototype.toString.call(s.chords) === '[object Array]';
      }).map(function (s) {
        return {
          id: s.id, on: s.on !== false,
          repeats: Math.max(1, Math.min(4, parseInt(s.repeats, 10) || 1)),
          barsPerChord: parseInt(s.barsPerChord, 10) === 2 ? 2 : 1,
          chords: s.chords.filter(validToken)
        };
      });
    }
    if (!section('a')) state.sections = defaultSections(state.genre);

    // one-time migration: an old jam.track progression becomes section A
    if (!g('jam2.migr', false)) {
      var old = g('jam.track', null);
      if (Object.prototype.toString.call(old) === '[object Array]' && old.length) {
        var toks = old.filter(function (c) {
          return c && typeof c.rootPc === 'number' && Theory.QUALITIES[c.quality];
        }).map(function (c) {
          return { abs: { rootPc: Theory.mod12(Math.round(c.rootPc)), quality: c.quality } };
        });
        if (toks.length) section('a').chords = toks;
      }
      App.store.set('jam2.migr', true);
      saveState();
    }
    bpm = Math.max(30, Math.min(280, parseInt(g('met.bpm', 100), 10) || 100));
  }

  function saveState() {
    App.store.set('jam2.genre', state.genre);
    App.store.set('jam2.energy', state.energy);
    App.store.set('jam2.swing', state.swing);
    App.store.set('jam2.comp', state.comp);
    App.store.set('jam2.mix', state.mix);
    App.store.set('jam2.sections', state.sections);
  }

  // ---------------- UI ----------------

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setNow(main, sub) {
    if (els.now) els.now.textContent = main;
    if (els.nowSub) els.nowSub.textContent = sub;
  }

  function paintNow(hit) {
    var label = hit.secId === 'vamp' ? 'vamp' :
      hit.secId === 'intro' ? 'Intro' : hit.secId === 'ending' ? 'Ending' : SEC_LABELS[hit.secId];
    setNow(hit.chord.name, label + (hit.chord.roman ? ' · ' + hit.chord.roman : ''));
    paintForm(hit.secId);
  }

  function paintForm(activeId) {
    if (!els.form) return;
    els.form.querySelectorAll('[data-jsec]').forEach(function (b) {
      b.classList.toggle('jam-onair', b.getAttribute('data-jsec') === activeId);
    });
  }

  function updateTransport() {
    if (!els.play) return;
    els.play.innerHTML = playing ? App.icon('stop', 16) + ' Stop' : App.icon('play', 16) + ' Play';
    els.finish.disabled = !playing;
    els.finish.textContent = finishing ? 'Ending…' : 'Finish';
    els.resume.style.display = override ? '' : 'none';
  }

  function renderForm() {
    var h = '';
    state.sections.forEach(function (s) {
      var n = s.chords.length;
      h += '<button type="button" class="chip jam-sec' + (s.id === state.selSec ? ' active' : '') +
        (s.on ? '' : ' jam-off') + '" data-jsec="' + s.id + '">' +
        '<b>' + SEC_LABELS[s.id] + '</b>' +
        (s.id === 'a' || s.id === 'b' ? ' ×' + s.repeats : '') +
        ' <span class="muted">' + n + ' ch</span></button>';
    });
    els.form.innerHTML = h;
  }

  function renderEditor() {
    var s = section(state.selSec);
    if (!s) return;
    var h = '';
    s.chords.forEach(function (tok, i) {
      var ch = resolveToken(tok);
      h += '<span class="chip jam-edch">' + esc(ch.name) +
        (ch.roman ? ' <span class="muted">' + esc(ch.roman) + '</span>' : '') +
        '<button type="button" class="jam-edx" data-jrm="' + i + '" aria-label="Remove ' + esc(ch.name) + '">' +
        App.icon('close', 10) + '</button></span>';
    });
    if (!s.chords.length) h = '<span class="muted small">No chords — tap palette chords below to add.</span>';
    els.edChords.innerHTML = h;
    els.edOn.checked = s.on;
    els.edOn.disabled = s.id === 'a';
    els.edRep.value = String(s.repeats);
    els.edBars.value = String(s.barsPerChord);
    els.edTitle.textContent = SEC_LABELS[s.id] + ' section';
  }

  function renderPalette() {
    var dia = diatonicChords();
    var h = '';
    dia.forEach(function (d, i) {
      h += '<button type="button" class="chip jam-pal" data-jpal="' + (i + 1) + '">' +
        '<b>' + esc(d.roman) + '</b>' + esc(d.name) + '</button>';
    });
    els.palette.innerHTML = h;
    var pf = Theory.FLAT_KEYS.has(keyPc());
    els.keyLabel.textContent = Theory.pcName(keyPc(), pf) + ' ' +
      Theory.SCALES[keyScale()].name.replace(/\s*\(.*\)$/, '');
  }

  function syncControls() {
    els.genre.value = state.genre;
    els.energy.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', parseInt(b.getAttribute('data-jen'), 10) === state.energy);
    });
    els.swing.value = String(Math.round(state.swing * 100));
    els.bpm.value = String(bpm);
    els.compSel.value = state.comp;
    ['drums', 'bass', 'comp'].forEach(function (chn) {
      var m = state.mix[chn];
      document.getElementById('jam-mute-' + chn).classList.toggle('active', !m.on);
      document.getElementById('jam-vol-' + chn).value = String(m.vol);
    });
  }

  function rebuild() {
    plan = buildPlan();
    if (playing) pos = { phase: 'loop', i: 0 };
  }

  function init(rootEl) {
    App.injectCSS('jam',
      '.jam-now{font-family:var(--font-condensed,var(--font-display));font-size:40px;font-weight:700;line-height:1;min-height:44px}' +
      '.jam-nowsub{font-size:13px;color:var(--muted);min-height:18px}' +
      '.jam-sec{cursor:pointer;font-family:inherit;color:var(--text);gap:6px}' +
      '.jam-sec b{color:var(--accent)}' +
      '.jam-sec.jam-off{opacity:0.45}' +
      '.jam-sec.jam-onair{border-color:var(--teal);box-shadow:0 0 10px rgba(76,201,176,0.35)}' +
      '.jam-pal{cursor:pointer;font-family:inherit;color:var(--text);gap:7px}' +
      '.jam-pal b{color:var(--accent)}' +
      '.jam-pal.jam-onair{border-color:var(--teal);color:var(--teal)}' +
      '.jam-edch{gap:7px;padding-right:7px;cursor:grab;touch-action:none}' +
      '.jam-pal{touch-action:none}' +
      '.jam-ghost{position:fixed;z-index:600;pointer-events:none;background:var(--card);' +
        'border-color:var(--accent);box-shadow:0 6px 20px rgba(0,0,0,0.4)}' +
      '.jam-dropsec{border-color:var(--accent) !important;box-shadow:0 0 10px var(--accent-glow)}' +
      '.jam-chdragging{opacity:0.45}' +
      '.jam-dropch{border-color:var(--accent) !important}' +
      '.jam-edx{background:transparent;border:none;color:var(--muted);cursor:pointer;padding:2px;display:inline-flex}' +
      '.jam-edx:hover{color:var(--red)}' +
      '.jam-mixrow{display:grid;grid-template-columns:86px auto 1fr;gap:12px;align-items:center;margin-top:10px}' +
      '.jam-mixlabel{font-size:12px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:var(--label)}' +
      '.jam-editor{margin-top:12px;padding:12px 14px;background:var(--card2);border:1px solid var(--line);border-radius:12px}' +
      '.tab.jam-live::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;' +
        'background:var(--teal);margin-right:7px;}' // legacy contract, harmless
    );

    rootEl.innerHTML =
      '<div class="card">' +
        '<h2>Band</h2>' +
        '<div class="row">' +
          '<label class="field">Genre<select id="jam-genre">' +
            GENRE_ORDER.map(function (id) {
              return '<option value="' + id + '">' + GENRES[id].name + '</option>';
            }).join('') + '</select></label>' +
          '<div class="fb-field">Energy<div class="seg" id="jam-energy">' +
            '<button type="button" data-jen="1">Chill</button>' +
            '<button type="button" data-jen="2">Groove</button>' +
            '<button type="button" data-jen="3">Push</button></div></div>' +
          '<label class="field">Swing<input type="range" id="jam-swing" min="0" max="100" step="5" style="width:110px"></label>' +
          '<label class="field">BPM<input id="jam-bpm" type="number" min="30" max="280" step="1" style="width:74px"></label>' +
          '<button type="button" class="btn sm" id="jam-newsong" title="Re-arrange the song from the genre preset (replaces your section edits)">New song</button>' +
        '</div>' +
        '<div class="row" style="margin-top:14px">' +
          '<button type="button" class="btn big primary" id="jam-play">' + App.icon('play', 16) + ' Play</button>' +
          '<button type="button" class="btn" id="jam-finish" disabled title="Cue the ending and land the song">Finish</button>' +
          '<span>' +
            '<div class="jam-now" id="jam-now"></div>' +
            '<div class="jam-nowsub" id="jam-nowsub"></div>' +
          '</span>' +
          '<span class="muted small" id="jam-sinfo"></span>' +
        '</div>' +
        '<div class="row tight" style="margin-top:14px">' +
          '<span class="muted small">Form</span>' +
          '<span class="row tight" id="jam-form"></span>' +
        '</div>' +
        '<div class="jam-editor">' +
          '<div class="row tight spread">' +
            '<h3 id="jam-edtitle" style="margin:0">A section</h3>' +
            '<span class="row tight">' +
              '<label class="row tight small muted" style="gap:5px"><input type="checkbox" id="jam-ed-on">In the song</label>' +
              '<label class="row tight small muted" style="gap:5px">Repeats <select id="jam-ed-rep">' +
                '<option>1</option><option>2</option><option>3</option><option>4</option></select></label>' +
              '<label class="row tight small muted" style="gap:5px">Bars/chord <select id="jam-ed-bars">' +
                '<option>1</option><option>2</option></select></label>' +
            '</span>' +
          '</div>' +
          '<div class="row tight" id="jam-ed-chords" style="margin-top:10px"></div>' +
        '</div>' +
        '<div class="row tight" style="margin-top:14px">' +
          '<span class="chip" id="jam-keylabel" title="Key and scale come from the bar at the top — change them there and the whole song re-harmonizes, even while playing"></span>' +
          '<span class="row tight" id="jam-palette"></span>' +
          '<button type="button" class="btn sm" id="jam-resume" style="display:none" title="Back to the song form">Resume form</button>' +
        '</div>' +
        '<div class="muted small" style="margin-top:10px">Stopped: palette chords add to the selected section. ' +
          'Playing: tapping a palette chord (or playing a chord on your MIDI keyboard) makes the band vamp on it — Resume returns to the song.</div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>Mixer</h2>' +
        '<div class="jam-mixrow"><span class="jam-mixlabel">Drums</span>' +
          '<button type="button" class="chip fb-chip" id="jam-mute-drums">Mute</button>' +
          '<input type="range" id="jam-vol-drums" min="0" max="100" step="5"></div>' +
        '<div class="jam-mixrow"><span class="jam-mixlabel">Bass</span>' +
          '<button type="button" class="chip fb-chip" id="jam-mute-bass">Mute</button>' +
          '<input type="range" id="jam-vol-bass" min="0" max="100" step="5"></div>' +
        '<div class="jam-mixrow"><span class="jam-mixlabel">Comp</span>' +
          '<button type="button" class="chip fb-chip" id="jam-mute-comp">Mute</button>' +
          '<input type="range" id="jam-vol-comp" min="0" max="100" step="5"></div>' +
        '<div class="row" style="margin-top:12px">' +
          '<label class="field">Comp instrument<select id="jam-comp">' +
            '<option value="guitar">Acoustic guitar</option>' +
            '<option value="eguitar">Electric guitar</option>' +
            '<option value="nylon">Nylon guitar</option>' +
            '<option value="keys">Keys</option>' +
            '<option value="pad">Pad</option></select></label>' +
          '<span class="muted small">Bass tone (fingered / picked) lives in Settings. Kill the comp to practice comping yourself.</span>' +
        '</div>' +
      '</div>';

    els.genre = document.getElementById('jam-genre');
    els.energy = document.getElementById('jam-energy');
    els.swing = document.getElementById('jam-swing');
    els.bpm = document.getElementById('jam-bpm');
    els.play = document.getElementById('jam-play');
    els.finish = document.getElementById('jam-finish');
    els.resume = document.getElementById('jam-resume');
    els.now = document.getElementById('jam-now');
    els.nowSub = document.getElementById('jam-nowsub');
    els.form = document.getElementById('jam-form');
    els.palette = document.getElementById('jam-palette');
    els.keyLabel = document.getElementById('jam-keylabel');
    els.edChords = document.getElementById('jam-ed-chords');
    els.edOn = document.getElementById('jam-ed-on');
    els.edRep = document.getElementById('jam-ed-rep');
    els.edBars = document.getElementById('jam-ed-bars');
    els.edTitle = document.getElementById('jam-edtitle');
    els.compSel = document.getElementById('jam-comp');

    loadState();
    renderForm();
    renderEditor();
    renderPalette();
    syncControls();

    els.genre.addEventListener('change', function () {
      if (!GENRES[this.value]) return;
      state.genre = this.value;
      state.swing = GENRES[state.genre].swing;
      state.sections = defaultSections(state.genre);
      saveState();
      syncControls();
      renderForm();
      renderEditor();
      rebuild();
    });
    document.getElementById('jam-newsong').addEventListener('click', function () {
      state.sections = defaultSections(state.genre);
      saveState();
      renderForm();
      renderEditor();
      rebuild();
    });
    els.energy.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-jen]');
      if (!b) return;
      state.energy = parseInt(b.getAttribute('data-jen'), 10);
      saveState();
      syncControls();
    });
    els.swing.addEventListener('input', function () {
      state.swing = Math.max(0, Math.min(1, parseInt(this.value, 10) / 100));
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
      if (!d || d.source === 'jam') return;
      bpm = Math.max(30, Math.min(280, Math.round(d.bpm)));
      if (els.bpm) els.bpm.value = String(bpm);
    });

    els.play.addEventListener('click', function () { if (playing) stop(); else play(); });
    els.finish.addEventListener('click', finish);
    els.resume.addEventListener('click', function () {
      override = null;
      rebuild();
      updateTransport();
      paintForm(null);
    });

    els.form.addEventListener('click', function (e) {
      var b = e.target.closest('[data-jsec]');
      if (!b) return;
      state.selSec = b.getAttribute('data-jsec');
      renderForm();
      renderEditor();
    });

    els.edChords.addEventListener('click', function (e) {
      var rm = e.target.closest('[data-jrm]');
      if (!rm) return;
      var s = section(state.selSec);
      s.chords.splice(parseInt(rm.getAttribute('data-jrm'), 10), 1);
      saveState();
      renderForm();
      renderEditor();
      rebuild();
    });
    els.edOn.addEventListener('change', function () {
      var s = section(state.selSec);
      if (s.id !== 'a') s.on = !!this.checked;
      saveState();
      renderForm();
      rebuild();
    });
    els.edRep.addEventListener('change', function () {
      section(state.selSec).repeats = Math.max(1, Math.min(4, parseInt(this.value, 10) || 1));
      saveState();
      renderForm();
      rebuild();
    });
    els.edBars.addEventListener('change', function () {
      section(state.selSec).barsPerChord = parseInt(this.value, 10) === 2 ? 2 : 1;
      saveState();
      rebuild();
    });

    // ---- drag & drop: palette chord -> a section chip (or the editor) ----
    var palDrag = null;
    var dragGhost = null;
    var suppressPalClick = false;

    function killGhost() {
      if (dragGhost) { dragGhost.remove(); dragGhost = null; }
      els.form.querySelectorAll('.jam-dropsec').forEach(function (c) { c.classList.remove('jam-dropsec'); });
    }

    els.palette.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('[data-jpal]');
      if (!b) return;
      palDrag = { d: parseInt(b.getAttribute('data-jpal'), 10), x: e.clientX, y: e.clientY, active: false, label: b.textContent };
    });
    document.addEventListener('pointermove', function (e) {
      if (!palDrag) return;
      if (!palDrag.active) {
        if (Math.abs(e.clientX - palDrag.x) + Math.abs(e.clientY - palDrag.y) < 12) return;
        palDrag.active = true;
        suppressPalClick = true;
        dragGhost = document.createElement('span');
        dragGhost.className = 'chip jam-ghost';
        dragGhost.textContent = palDrag.label;
        document.body.appendChild(dragGhost);
      }
      dragGhost.style.left = (e.clientX + 10) + 'px';
      dragGhost.style.top = (e.clientY - 14) + 'px';
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var sec = el && el.closest ? el.closest('[data-jsec]') : null;
      els.form.querySelectorAll('.jam-dropsec').forEach(function (c) { c.classList.remove('jam-dropsec'); });
      if (sec) sec.classList.add('jam-dropsec');
    });
    document.addEventListener('pointerup', function (e) {
      if (!palDrag) return;
      var wasActive = palDrag.active;
      var deg = palDrag.d;
      palDrag = null;
      killGhost();
      if (!wasActive) { setTimeout(function () { suppressPalClick = false; }, 0); return; }
      setTimeout(function () { suppressPalClick = false; }, 0);
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var sec = el && el.closest ? el.closest('[data-jsec]') : null;
      var inEditor = el && el.closest ? el.closest('.jam-editor') : null;
      var target = sec ? section(sec.getAttribute('data-jsec')) : (inEditor ? section(state.selSec) : null);
      if (!target) return;
      target.chords.push({ d: deg });
      if (sec) state.selSec = target.id;
      saveState();
      renderForm();
      renderEditor();
      rebuild();
    });

    // ---- drag & drop: reorder chords inside the section editor ----
    var chDrag = null;
    els.edChords.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.jam-edx')) return; // the remove button still removes
      var chipEl = e.target.closest('.jam-edch');
      if (!chipEl) return;
      var chips = Array.prototype.slice.call(els.edChords.querySelectorAll('.jam-edch'));
      chDrag = { from: chips.indexOf(chipEl), x: e.clientX, y: e.clientY, active: false, el: chipEl };
    });
    document.addEventListener('pointermove', function (e) {
      if (!chDrag) return;
      if (!chDrag.active) {
        if (Math.abs(e.clientX - chDrag.x) + Math.abs(e.clientY - chDrag.y) < 10) return;
        chDrag.active = true;
        chDrag.el.classList.add('jam-chdragging');
      }
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var over = el && el.closest ? el.closest('.jam-edch') : null;
      els.edChords.querySelectorAll('.jam-dropch').forEach(function (c) { c.classList.remove('jam-dropch'); });
      if (over && over !== chDrag.el && els.edChords.contains(over)) over.classList.add('jam-dropch');
    });
    document.addEventListener('pointerup', function (e) {
      if (!chDrag) return;
      var drag = chDrag;
      chDrag = null;
      drag.el.classList.remove('jam-chdragging');
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var over = el && el.closest ? el.closest('.jam-edch') : null;
      els.edChords.querySelectorAll('.jam-dropch').forEach(function (c) { c.classList.remove('jam-dropch'); });
      if (!drag.active || !over || !els.edChords.contains(over)) return;
      var chips = Array.prototype.slice.call(els.edChords.querySelectorAll('.jam-edch'));
      var to = chips.indexOf(over);
      if (to === -1 || to === drag.from) return;
      var s = section(state.selSec);
      var moved = s.chords.splice(drag.from, 1)[0];
      s.chords.splice(to, 0, moved);
      saveState();
      renderEditor();
      rebuild();
    });

    els.palette.addEventListener('click', function (e) {
      if (suppressPalClick) return;
      var b = e.target.closest('[data-jpal]');
      if (!b) return;
      var d = parseInt(b.getAttribute('data-jpal'), 10);
      if (playing) {
        override = { tok: { d: d } };
        updateTransport();
        els.palette.querySelectorAll('.jam-pal').forEach(function (p) {
          p.classList.toggle('jam-onair', p === b);
        });
      } else {
        section(state.selSec).chords.push({ d: d });
        saveState();
        renderForm();
        renderEditor();
        rebuild();
        // preview strum
        try {
          App.getAudio();
          var ch = resolveToken({ d: d });
          var v = chordVoicing(ch);
          for (var i = 0; i < v.length; i++) App.pluck(v[i], i * 0.03, 1.4, 0.3);
        } catch (err) { /* audio unavailable */ }
      }
    });

    // MIDI re-harm: hold a chord (3+ notes) while playing → the band vamps it
    App.on('midi:note', function (d) {
      if (!d || !d.on || !playing || !App.midi) return;
      var held = App.midi.held;
      if (held.length < 3) return;
      var pcs = {};
      held.forEach(function (m) { pcs[Theory.mod12(m)] = true; });
      var rootPc = Theory.mod12(Math.min.apply(null, held));
      var QS = ['maj', 'min', '7', 'maj7', 'm7', 'dim', 'sus4', 'sus2'];
      for (var qi = 0; qi < QS.length; qi++) {
        var want = {};
        Theory.QUALITIES[QS[qi]].intervals.forEach(function (iv) { want[Theory.mod12(rootPc + iv)] = true; });
        var all = Object.keys(want).every(function (pc) { return pcs[pc]; }) &&
                  Object.keys(pcs).every(function (pc) { return want[pc]; });
        if (all) {
          override = { tok: { abs: { rootPc: rootPc, quality: QS[qi] } } };
          updateTransport();
          return;
        }
      }
    });

    // mixer
    ['drums', 'bass', 'comp'].forEach(function (chn) {
      document.getElementById('jam-mute-' + chn).addEventListener('click', function () {
        state.mix[chn].on = !state.mix[chn].on;
        saveState();
        syncControls();
      });
      document.getElementById('jam-vol-' + chn).addEventListener('input', function () {
        var v = parseInt(this.value, 10);
        state.mix[chn].vol = (v >= 0 && v <= 100) ? v : 80;
        saveState();
      });
    });
    els.compSel.addEventListener('change', function () {
      if (COMP_IDS.indexOf(this.value) !== -1) state.comp = this.value;
      saveState();
    });

    // shared key: re-render palette + editor names on key/scale changes —
    // resolveToken reads the store live, so playback re-harmonizes by itself
    App.on('fb:scale', function () { renderPalette(); renderEditor(); });
    App.on('fb:set', function () { renderPalette(); renderEditor(); });

    // the band stops when the APP goes hidden (not on in-app tab switches)
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
    });

    updateTransport();
  }

  App.register('jam', { init: init });
})();
