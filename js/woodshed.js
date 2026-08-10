/* soundLAB WOODSHED — the gamified practice room ('shed' page). Prefix ws-.
 *
 * One game core, three instruments (piano / guitar / drums), four modes:
 *   RUN      — straight through, full scoring, no mercy
 *   PHRASE   — 2-bar phrases loop with a count-in until 2 clean passes
 *   WAIT     — playback freezes until you play the right note(s)
 *   LADDER   — adaptive tempo: start ~70%, auto step up on success, down on
 *              failure (score material re-clocks freely — it's all synthesized)
 *
 * Timing discipline: everything runs off the shared AudioContext clock with
 * the app's 25 ms lookahead pattern — never wall-clock. Displays (falling
 * highway / horizontal scroll / staff sheet) are ONE canvas redrawn in rAF
 * only while a session is live; mode-switchable mid-run.
 * Judgment: Perfect/Great/Good ±30/60/100 ms with a per-input calibration
 * offset (tap-along wizard, stored per source in ws.cal). Misses fire when a
 * target ages out. Combos, accuracy, stars, per-song bests, XP/levels,
 * daily streaks, achievements, and a weak-phrase queue (lowest-accuracy
 * phrases resurface first). Every run is captured as an Idea (source
 * 'woodshed') for review on the DAW side.
 * Input: hardware MIDI (App.midi bus), QWERTY/touch piano (note:input) —
 * all three work on every instrument. LUMI lights mirror targets when a
 * light output is connected (current bright / next dim / wait holds).
 * Scores: built-in generators (scales, Hanon, pentatonic workout, 8 PAS
 * rudiments with sticking + accents), MIDI file import (tempo-aware),
 * ASCII tab paste (pitches only — timing marked approximate: Wait mode
 * immediately, scored modes after assuming even eighths), and any Studio
 * synth track. Library in ws.lib with auto difficulty.
 */
(function () {
  'use strict';

  var els = {};
  var view = 'lib';          // lib | session | report | cal
  var WIN = { perfect: 30, great: 60, good: 100 };
  var PHRASE_BEATS = 8;

  // ---------------- score model + generators ----------------

  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  function scaleScore(instr) {
    var rootPc = App.store.get('fb.root', 0);
    var scaleId = App.store.get('fb.scale', 'major');
    if (!Theory.SCALES[scaleId] || Theory.SCALES[scaleId].steps.length < 5) scaleId = 'major';
    var steps = Theory.SCALES[scaleId].steps;
    var base = (instr === 'guitar' ? 45 : 48) + Theory.mod12(rootPc);
    var seq = [];
    for (var o = 0; o < 2; o++) steps.forEach(function (s) { seq.push(base + o * 12 + s); });
    seq.push(base + 24);
    var down = seq.slice(0, -1).reverse();
    var all = seq.concat(down);
    var notes = all.map(function (m, i) { return { m: m, t: i, d: 0.9, v: 96 }; });
    var name = Theory.pcName(rootPc, Theory.FLAT_KEYS.has(rootPc)) + ' ' + Theory.SCALES[scaleId].name.replace(/\s*\(.*\)$/, '');
    return mkScore(name + ' scale', instr, 80, notes, true, 'generator');
  }

  function hanonScore() {
    var pat = [0, 2, 3, 4, 5, 4, 3, 2]; // Hanon No.1 cell over the C major scale
    var scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
    var notes = [];
    var t = 0;
    for (var cell = 0; cell < 8; cell++) {
      pat.forEach(function (p) {
        notes.push({ m: 48 + scale[Math.min(scale.length - 1, cell + p)], t: t, d: 0.45, v: 92 });
        t += 0.5;
      });
    }
    return mkScore('Hanon pattern No.1', 'piano', 92, notes, true, 'generator');
  }

  function pentWorkout() {
    var rootPc = App.store.get('fb.root', 9);
    var steps = Theory.SCALES.minorPent.steps;
    var base = 45 + Theory.mod12(rootPc - 9);
    var seq = [];
    for (var o = 0; o < 2; o++) steps.forEach(function (s) { seq.push(base + o * 12 + s); });
    seq.push(base + 24);
    // fours: groups of four ascending from each degree
    var notes = [];
    var t = 0;
    for (var i = 0; i + 3 < seq.length; i++) {
      for (var j = 0; j < 4; j++) { notes.push({ m: seq[i + j], t: t, d: 0.45, v: 96 }); t += 0.5; }
    }
    var name = Theory.pcName(Theory.mod12(rootPc), Theory.FLAT_KEYS.has(rootPc));
    return mkScore(name + ' pentatonic fours', 'guitar', 88, notes, true, 'generator');
  }

  // The full 40 PAS rudiments. flam: one grace ~30ms before the marked
  // strokes; drag: two. Sticking shown is standard PAS; a handful of compound
  // drag orderings are simplified to their common practice-pad forms.
  // 'buzz' = multiple-bounce textures we can't sense from single hits —
  // display + timing only, accents unscored.
  var RUDIMENTS = [
    { id: 'r1', name: 'Single stroke roll', stick: 'RLRLRLRL', acc: [] },
    { id: 'r2', name: 'Single stroke four', stick: 'RLRL', acc: [3] },
    { id: 'r3', name: 'Single stroke seven', stick: 'RLRLRLR', acc: [6] },
    { id: 'r4', name: 'Multiple bounce roll', stick: 'RLRL', acc: [], buzz: true },
    { id: 'r5', name: 'Triple stroke roll', stick: 'RRRLLL', acc: [] },
    { id: 'r6', name: 'Double stroke open roll', stick: 'RRLLRRLL', acc: [] },
    { id: 'r7', name: 'Five stroke roll', stick: 'RRLLRLLRRL', acc: [4, 9] },
    { id: 'r8', name: 'Six stroke roll', stick: 'RLLRRL', acc: [0, 5] },
    { id: 'r9', name: 'Seven stroke roll', stick: 'RRLLRRL', acc: [6] },
    { id: 'r10', name: 'Nine stroke roll', stick: 'RRLLRRLLR', acc: [8] },
    { id: 'r11', name: 'Ten stroke roll', stick: 'RRLLRRLLRL', acc: [8, 9] },
    { id: 'r12', name: 'Eleven stroke roll', stick: 'RRLLRRLLRRL', acc: [10] },
    { id: 'r13', name: 'Thirteen stroke roll', stick: 'RRLLRRLLRRLLR', acc: [12] },
    { id: 'r14', name: 'Fifteen stroke roll', stick: 'RRLLRRLLRRLLRRL', acc: [14] },
    { id: 'r15', name: 'Seventeen stroke roll', stick: 'RRLLRRLLRRLLRRLLR', acc: [16] },
    { id: 'r16', name: 'Single paradiddle', stick: 'RLRRLRLL', acc: [0, 4] },
    { id: 'r17', name: 'Double paradiddle', stick: 'RLRLRRLRLRLL', acc: [0, 6] },
    { id: 'r18', name: 'Triple paradiddle', stick: 'RLRLRLRRLRLRLRLL', acc: [0, 8] },
    { id: 'r19', name: 'Paradiddle-diddle', stick: 'RLRRLLRLRRLL', acc: [0, 6] },
    { id: 'r20', name: 'Flam', stick: 'RL', acc: [0, 1], flam: [0, 1] },
    { id: 'r21', name: 'Flam accent', stick: 'RLRLRL', acc: [0, 3], flam: [0, 3] },
    { id: 'r22', name: 'Flam tap', stick: 'RRLL', acc: [0, 2], flam: [0, 2] },
    { id: 'r23', name: 'Flamacue', stick: 'RLRLR', acc: [1], flam: [0, 4] },
    { id: 'r24', name: 'Flam paradiddle', stick: 'RLRRLRLL', acc: [0, 4], flam: [0, 4] },
    { id: 'r25', name: 'Single flammed mill', stick: 'RRLRLLRL', acc: [0, 4], flam: [0, 4] },
    { id: 'r26', name: 'Flam paradiddle-diddle', stick: 'RLRRLL', acc: [0], flam: [0] },
    { id: 'r27', name: 'Pataflafla', stick: 'RLRLRLRL', acc: [0, 3, 4, 7], flam: [0, 3, 4, 7] },
    { id: 'r28', name: 'Swiss army triplet', stick: 'RRLRRL', acc: [0, 3], flam: [0, 3] },
    { id: 'r29', name: 'Inverted flam tap', stick: 'RLLR', acc: [0, 2], flam: [0, 2] },
    { id: 'r30', name: 'Flam drag', stick: 'RLLR', acc: [0, 3], flam: [0], drag: [3] },
    { id: 'r31', name: 'Drag (half drag)', stick: 'RL', acc: [0, 1], drag: [0, 1] },
    { id: 'r32', name: 'Single drag tap', stick: 'RLRL', acc: [1, 3], drag: [0, 2] },
    { id: 'r33', name: 'Double drag tap', stick: 'RRLLLR', acc: [2, 5], drag: [0, 1, 3, 4] },
    { id: 'r34', name: 'Lesson 25', stick: 'RLRRLR', acc: [2, 5], drag: [0, 3] },
    { id: 'r35', name: 'Single dragadiddle', stick: 'RLRRLRLL', acc: [0, 4], drag: [0, 4] },
    { id: 'r36', name: 'Drag paradiddle #1', stick: 'RRLRRLLRLL', acc: [0, 5], drag: [1, 6] },
    { id: 'r37', name: 'Drag paradiddle #2', stick: 'RRLRLRLLRLRL', acc: [0, 6], drag: [1, 2, 7, 8] },
    { id: 'r38', name: 'Single ratamacue', stick: 'RLRL', acc: [3], drag: [0] },
    { id: 'r39', name: 'Double ratamacue', stick: 'RRLRL', acc: [4], drag: [0, 1] },
    { id: 'r40', name: 'Triple ratamacue', stick: 'RRRLRL', acc: [5], drag: [0, 1, 2] }
  ];

  function rudimentScore(r) {
    var stick = r.stick.replace(/\s/g, '');
    var notes = [];
    var t = 0;
    for (var rep = 0; rep < 4; rep++) {
      for (var i = 0; i < stick.length; i++) {
        var accented = r.acc.indexOf(i) !== -1;
        var lane = stick[i] === 'R' ? 0 : 1;
        // grace strokes: flam = one, drag = two, ~1/16 of a beat ahead, soft
        var graces = (r.flam && r.flam.indexOf(i) !== -1) ? 1 : (r.drag && r.drag.indexOf(i) !== -1) ? 2 : 0;
        for (var gi = graces; gi > 0; gi--) {
          notes.push({ m: 38, t: Math.max(0, t - gi * 0.07), d: 0.08, v: 48, lane: 1 - lane, s: stick[i] === 'R' ? 'l' : 'r', grace: true });
        }
        notes.push({ m: 38, t: t, d: 0.2, v: accented ? 118 : 78, lane: lane, s: stick[i] });
        t += 0.5;
      }
    }
    var sc = mkScore(r.name, 'drums', 70, notes, true, 'rudiment');
    sc.rud = r.id;
    sc.stick = stick;
    sc.hasGrace = !!(r.flam || r.drag);
    sc.buzz = !!r.buzz;
    return sc;
  }

  function mkScore(title, instr, bpm, notes, timingOk, source) {
    var len = 0;
    notes.forEach(function (n) { len = Math.max(len, n.t + n.d); });
    var sc = {
      id: uid('s'), title: title, instrument: instr, bpm: bpm,
      notes: notes, len: Math.ceil(len / 4) * 4 || 4, timingOk: timingOk, source: source
    };
    sc.diff = difficulty(sc);
    return sc;
  }

  function difficulty(sc) {
    if (!sc.notes.length) return 1;
    var nps = sc.notes.length / (sc.len * 60 / sc.bpm);
    var span = 0;
    for (var i = 1; i < sc.notes.length; i++) span = Math.max(span, Math.abs(sc.notes[i].m - sc.notes[i - 1].m));
    var d = 1 + Math.min(2.5, nps / 3) + Math.min(1.5, span / 14);
    return Math.max(1, Math.min(5, Math.round(d)));
  }

  // ---------------- importers ----------------

  // minimal tempo-aware SMF reader (type 0/1)
  function importMidi(buf, name) {
    var d = new DataView(buf);
    var p = 0;
    function u32() { var v = d.getUint32(p); p += 4; return v; }
    function u16() { var v = d.getUint16(p); p += 2; return v; }
    function u8() { return d.getUint8(p++); }
    function vlq() { var v = 0, b; do { b = u8(); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; }
    if (u32() !== 0x4d546864) throw new Error('not a MIDI file');
    u32(); u16();
    var nTracks = u16(), division = u16();
    if (division & 0x8000) throw new Error('SMPTE time not supported');
    var tempo = 500000, notes = [], drums = false;
    for (var tr = 0; tr < nTracks; tr++) {
      if (u32() !== 0x4d54726b) break;
      var len = u32(), end = p + len, tick = 0, run = 0;
      var open = {};
      while (p < end) {
        tick += vlq();
        var st = u8();
        if (st < 0x80) { p--; st = run; } else run = st;
        var type = st & 0xf0, ch = st & 0x0f;
        if (st === 0xff) {
          var meta = u8(), ml = vlq();
          if (meta === 0x51 && ml === 3) { tempo = (u8() << 16) | (u8() << 8) | u8(); }
          else p += ml;
        } else if (st === 0xf0 || st === 0xf7) {
          p += vlq();
        } else if (type === 0x90 || type === 0x80) {
          var m = u8(), v = u8();
          var beat = tick / division;
          if (type === 0x90 && v > 0) {
            open[ch + ':' + m] = { t: beat, v: v };
            if (ch === 9) drums = true;
          } else {
            var o = open[ch + ':' + m];
            if (o) {
              notes.push({ m: m, t: o.t, d: Math.max(0.1, beat - o.t), v: o.v, lane: ch === 9 ? (notes.length % 2) : undefined });
              delete open[ch + ':' + m];
            }
          }
        } else if (type === 0xc0 || type === 0xd0) { p += 1; }
        else { p += 2; }
      }
      p = end;
    }
    if (!notes.length) throw new Error('no notes found');
    notes.sort(function (a, b) { return a.t - b.t; });
    if (notes.length > 1500) notes = notes.slice(0, 1500);
    var t0 = notes[0].t;
    notes.forEach(function (n) { n.t = Math.round((n.t - t0) * 100) / 100; });
    var bpm = Math.max(40, Math.min(240, Math.round(60000000 / tempo)));
    return mkScore(name.replace(/\.[^.]+$/, '').slice(0, 40), drums ? 'drums' : 'piano', bpm, notes, true, 'midi');
  }

  var TAB_TUNING = [64, 59, 55, 50, 45, 40]; // e B G D A E
  function importAscii(text, name) {
    var lines = text.split(/\r?\n/);
    var systems = [], run = [];
    lines.forEach(function (ln) {
      if (/^[eEBGDAd]?[|:]?[-0-9hpbrx/\\~|]{6,}/.test(ln.trim()) && /-/.test(ln)) run.push(ln);
      else { if (run.length >= 6) systems.push(run.slice(0, 6)); run = []; }
    });
    if (run.length >= 6) systems.push(run.slice(0, 6));
    if (!systems.length) throw new Error('no tab found — need six string lines');
    var notes = [];
    var col0 = 0;
    systems.forEach(function (sys) {
      var start = 0;
      sys.forEach(function (ln) { var i = ln.indexOf('-'); if (i > start) start = i; });
      var width = Math.max.apply(null, sys.map(function (l) { return l.length; }));
      for (var c = start; c < width; c++) {
        for (var s = 0; s < 6; s++) {
          var ch = sys[s][c];
          if (ch >= '0' && ch <= '9') {
            var fret = parseInt(ch, 10);
            if (sys[s][c + 1] >= '0' && sys[s][c + 1] <= '9') { fret = fret * 10 + parseInt(sys[s][c + 1], 10); }
            if (fret <= 24) notes.push({ m: TAB_TUNING[s] + fret, t: col0 + (c - start), d: 0.9, v: 96, str: s, fret: fret });
            if (fret > 9) c++;
          }
        }
      }
      col0 += width - start + 2;
    });
    if (!notes.length) throw new Error('no fret numbers found');
    // collapse columns to sequential positions, assume even eighths
    var cols = [];
    notes.forEach(function (n) { if (cols.indexOf(n.t) === -1) cols.push(n.t); });
    cols.sort(function (a, b) { return a - b; });
    notes.forEach(function (n) { n.t = cols.indexOf(n.t) * 0.5; n.d = 0.45; });
    var sc = mkScore(name.slice(0, 40) || 'Pasted tab', 'guitar', 80, notes, false, 'ascii');
    return sc;
  }

  function importTrack(t) {
    var notes = (t.notes || []).map(function (n) { return { m: n.m, t: n.t, d: n.d, v: n.v }; });
    if (!notes.length) return null;
    return mkScore(t.name, 'piano', parseInt(App.store.get('met.bpm', 100), 10) || 100, notes, true, 'studio');
  }

  // ---------------- library ----------------

  function lib() {
    var v = App.store.get('ws.lib', []);
    return Object.prototype.toString.call(v) === '[object Array]' ? v : [];
  }

  function saveLib(l) { App.store.set('ws.lib', l.slice(-40)); }

  function addScore(sc) {
    if (!sc) return null;
    var l = lib();
    l.push(sc);
    saveLib(l);
    renderLib();
    return sc;
  }

  function bestKey(sc, mode) { return 'ws.best.' + sc.title.replace(/\W+/g, '_') + '.' + mode; }

  // ---------------- progression ----------------

  function addXp(pts) {
    var xp = parseInt(App.store.get('ws.xp', 0), 10) + pts;
    App.store.set('ws.xp', xp);
    return xp;
  }

  function level(xp) { return Math.floor(Math.sqrt(xp / 100)) + 1; }

  function bumpStreak() {
    var s = App.store.get('ws.streak', { last: '', days: 0 });
    var today = new Date().toDateString();
    if (s.last === today) return s.days;
    var y = new Date(Date.now() - 864e5).toDateString();
    s.days = (s.last === y) ? s.days + 1 : 1;
    s.last = today;
    App.store.set('ws.streak', s);
    return s.days;
  }

  var ACHIEVEMENTS = {
    first: 'First run in the Shed', ninety: '90%+ accuracy', combo25: '25-note combo',
    streak3: '3-day streak', ladder: 'Climbed the tempo ladder past 100%', clean: 'A perfect no-miss run'
  };

  function grantAch(id) {
    var a = App.store.get('ws.ach', []);
    if (a.indexOf(id) !== -1) return false;
    a.push(id);
    App.store.set('ws.ach', a);
    flash('🏆 ' + ACHIEVEMENTS[id]);
    return true;
  }

  function weakQueue() {
    var v = App.store.get('ws.weak', []);
    return Object.prototype.toString.call(v) === '[object Array]' ? v : [];
  }

  // ---------------- the session ----------------

  var S = null; // active session state

  function calFor(src) {
    var c = App.store.get('ws.cal', {});
    return (c && typeof c[src] === 'number') ? c[src] : 0;
  }

  function newSession(sc, mode) {
    var scale = mode === 'ladder' ? (parseFloat(App.store.get('ws.ladder.' + sc.title.replace(/\W+/g, '_'), 0.7)) || 0.7) : 1;
    return {
      sc: sc, mode: mode, tempoScale: scale,
      display: App.store.get('ws.display', 'highway'),
      guide: App.store.get('ws.guide', mode !== 'run'),
      phrase: 0, cleanPasses: 0,
      targets: [], judged: [], combo: 0, maxCombo: 0, strays: 0,
      waitIdx: 0, running: false, startT: 0, timer: null,
      counts: { perfect: 0, great: 0, good: 0, miss: 0 },
      played: []
    };
  }

  function spb() { return 60 / (S.sc.bpm * S.tempoScale); }

  function phraseCount(sc) { return Math.max(1, Math.ceil(sc.len / PHRASE_BEATS)); }

  function phraseNotes(sc, p) {
    return sc.notes.filter(function (n) { return n.t >= p * PHRASE_BEATS && n.t < (p + 1) * PHRASE_BEATS; });
  }

  function buildTargets() {
    var notes = S.mode === 'phrase' ? phraseNotes(S.sc, S.phrase) : S.sc.notes;
    var base = S.mode === 'phrase' ? S.phrase * PHRASE_BEATS : 0;
    S.targets = notes.map(function (n, i) {
      // grace strokes render + sound but are never judged (flam quality is
      // measured from the played stream instead — see report)
      return { i: i, n: n, at: (n.t - base) * spb(), judged: n.grace ? 'grace' : null, err: 0, sounded: false };
    });
  }

  var voices = {};
  function voiceFor(kind) {
    var ctx = App.getAudio();
    if (!voices.ctx || voices.ctx !== ctx) voices = { ctx: ctx };
    if (kind === 'drums') {
      if (!voices.drums) { voices.drums = DAW.createDrums(ctx); voices.drums.output.connect(ctx.destination); }
      return voices.drums;
    }
    if (!voices.synth) {
      voices.synth = DAW.createSynth(ctx, DAW.SYNTH_PRESETS[2].params);
      voices.synth.output.connect(ctx.destination);
    }
    return voices.synth;
  }

  function click(t, strong) {
    var ctx = App.getAudio();
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = strong ? 1568 : 1046;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.06);
  }

  function soundNote(n, t) {
    if (S.sc.instrument === 'drums') voiceFor('drums').noteOn(1, (n.v / 127), t);
    else {
      var v = voiceFor('synth');
      v.noteOn(n.m, (n.v / 127) * 0.7, t, 0);
      v.noteOff(n.m, t + Math.max(0.1, n.d * spb()), 0);
    }
  }

  function startRun() {
    var ctx = App.getAudio();
    buildTargets();
    S.judged = [];
    S.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    S.combo = 0; S.maxCombo = 0; S.strays = 0; S.played = [];
    S.waitIdx = 0;
    var countIn = S.mode === 'wait' ? 0 : 4;
    S.startT = ctx.currentTime + 0.2 + countIn * spb();
    for (var c = 0; c < countIn; c++) click(ctx.currentTime + 0.2 + c * spb(), c === 0);
    S.running = true;
    S.schedIdx = 0;
    S.clickBeat = 0;
    if (S.timer) clearInterval(S.timer);
    S.timer = setInterval(tickRun, 25);
    App.wake.acquire('ws-run');
    if (!rafId) rafId = requestAnimationFrame(draw);
    paintHud();
  }

  function endRun(finished) {
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    S.running = false;
    App.wake.release('ws-run');
    lightsOff();
    if (finished) finishReport();
  }

  function tickRun() {
    var ctx = App.getAudio();
    var now = ctx.currentTime;
    if (S.mode === 'wait') return; // wait mode has no clock
    var horizon = now + 0.3;
    // metronome click + guide sounds through the lookahead window
    var endBeat = (S.mode === 'phrase' ? PHRASE_BEATS : S.sc.len) + 0.001;
    while (S.startT + S.clickBeat * spb() < horizon && S.clickBeat < endBeat) {
      click(Math.max(now + 0.01, S.startT + S.clickBeat * spb()), S.clickBeat % 4 === 0);
      S.clickBeat++;
    }
    S.targets.forEach(function (tg) {
      if (!tg.sounded && S.startT + tg.at < horizon) {
        tg.sounded = true;
        if (S.guide) soundNote(tg.n, Math.max(now + 0.01, S.startT + tg.at));
      }
    });
    // age out misses
    S.targets.forEach(function (tg) {
      if (!tg.judged && now - (S.startT + tg.at) > (WIN.good + 60) / 1000) {
        tg.judged = 'miss';
        S.counts.miss++;
        S.combo = 0;
        paintHud();
      }
    });
    lightsUpdate(now);
    // done?
    var endT = S.startT + endBeat * spb() + 0.4;
    if (now > endT) endRun(true);
  }

  // ---------------- judgment ----------------

  function inputNote(midi, vel, src) {
    if (!S || !S.running) return;
    var ctx = App.getAudio();
    var now = ctx.currentTime - calFor(src) / 1000;
    S.played.push({ m: midi, at: now - S.startT, v: vel });

    if (S.mode === 'wait') {
      while (S.targets[S.waitIdx] && S.targets[S.waitIdx].judged === 'grace') S.waitIdx++;
      var tg = S.targets[S.waitIdx];
      if (!tg) return;
      var wantPc = S.sc.instrument === 'drums' ? true : Theory.mod12(midi) === Theory.mod12(tg.n.m);
      if (wantPc) {
        tg.judged = 'perfect';
        tg.pv = vel;
        S.counts.perfect++;
        S.combo++; S.maxCombo = Math.max(S.maxCombo, S.combo);
        soundNote(tg.n, ctx.currentTime);
        S.waitIdx++;
        while (S.targets[S.waitIdx] && S.targets[S.waitIdx].judged === 'grace') S.waitIdx++;
        if (S.waitIdx >= S.targets.length) endRun(true);
      } else {
        S.combo = 0;
        S.strays++;
      }
      paintHud();
      lightsUpdate(now);
      return;
    }

    // timed modes: nearest unjudged target of the same pitch class
    var best = null, bd = 1;
    S.targets.forEach(function (tg) {
      if (tg.judged) return;
      var pitchOk = S.sc.instrument === 'drums' ? true : Theory.mod12(tg.n.m) === Theory.mod12(midi);
      if (!pitchOk) return;
      var err = now - (S.startT + tg.at);
      if (Math.abs(err) < bd) { bd = Math.abs(err); best = { tg: tg, err: err }; }
    });
    if (best && bd * 1000 <= WIN.good + 40) {
      var ms = best.err * 1000;
      var j = Math.abs(ms) <= WIN.perfect ? 'perfect' : Math.abs(ms) <= WIN.great ? 'great' : 'good';
      best.tg.judged = j;
      best.tg.err = ms;
      best.tg.pv = vel;
      S.judged.push({ t: best.tg.n.t, err: ms, j: j });
      S.counts[j]++;
      S.combo++;
      S.maxCombo = Math.max(S.maxCombo, S.combo);
      if (S.combo === 25) grantAch('combo25');
    } else {
      S.strays++;
      S.combo = 0;
    }
    paintHud();
  }

  function accuracy() {
    var total = S.targets.filter(function (tg) { return tg.judged !== 'grace'; }).length;
    if (!total) return 0;
    var pts = S.counts.perfect + S.counts.great * 0.8 + S.counts.good * 0.5;
    return Math.round((pts / total) * 100);
  }

  function stars(acc) { return acc >= 97 ? 5 : acc >= 90 ? 4 : acc >= 80 ? 3 : acc >= 65 ? 2 : 1; }

  // ---------------- report + progression ----------------

  function finishReport() {
    var acc = accuracy();
    if (S.mode === 'phrase') {
      var clean = S.counts.miss === 0 && acc >= 85;
      if (clean) S.cleanPasses++; else S.cleanPasses = 0;
      if (S.cleanPasses >= 2 && S.phrase < phraseCount(S.sc) - 1) {
        S.phrase++;
        S.cleanPasses = 0;
        flash('Phrase ' + (S.phrase + 1) + ' of ' + phraseCount(S.sc));
      } else {
        flash(clean ? 'Clean! ' + (2 - S.cleanPasses) + ' more' : 'Again — ' + acc + '%');
      }
      setTimeout(function () { if (S && view === 'session') startRun(); }, 900);
      return;
    }
    if (S.mode === 'ladder') {
      var key = 'ws.ladder.' + S.sc.title.replace(/\W+/g, '_');
      if (acc >= 90) S.tempoScale = Math.min(1.2, Math.round((S.tempoScale + 0.05) * 100) / 100);
      else if (acc < 70) S.tempoScale = Math.max(0.5, Math.round((S.tempoScale - 0.05) * 100) / 100);
      App.store.set(key, S.tempoScale);
      if (S.tempoScale > 1) grantAch('ladder');
    }
    // weak phrases
    var weak = weakQueue().filter(function (w) { return w.title !== S.sc.title; });
    var pc = phraseCount(S.sc);
    for (var p = 0; p < pc; p++) {
      var pn = phraseNotes(S.sc, p);
      if (!pn.length) continue;
      var hits = S.judged.filter(function (jd) { return jd.t >= p * PHRASE_BEATS && jd.t < (p + 1) * PHRASE_BEATS; }).length;
      var pAcc = Math.round((hits / pn.length) * 100);
      if (pAcc < 70) weak.push({ title: S.sc.title, phrase: p, acc: pAcc });
    }
    weak.sort(function (a, b) { return a.acc - b.acc; });
    App.store.set('ws.weak', weak.slice(0, 12));

    // bests + XP + streak + achievements + DAW capture
    var score = acc * 10 + S.maxCombo * 2;
    var bk = bestKey(S.sc, S.mode);
    var prev = parseInt(App.store.get(bk, 0), 10);
    if (score > prev) App.store.set(bk, score);
    var xp = addXp(Math.round(score / 10) + 5);
    var days = bumpStreak();
    grantAch('first');
    if (acc >= 90) grantAch('ninety');
    if (S.counts.miss === 0 && S.targets.length > 4 && acc >= 80) grantAch('clean');
    if (days >= 3) grantAch('streak3');
    captureRun();
    renderReport(acc, score, prev, xp, days);
  }

  function captureRun() {
    if (!S.played.length) return;
    var list = App.store.get('ideas.list', []);
    if (Object.prototype.toString.call(list) !== '[object Array]') list = [];
    list.push({
      id: uid('i'), name: 'Shed: ' + S.sc.title.slice(0, 20), ts: Date.now(), source: 'woodshed',
      bpm: Math.round(S.sc.bpm * S.tempoScale), root: App.store.get('fb.root', 0), scale: App.store.get('fb.scale', 'major'),
      dur: Math.round((S.played[S.played.length - 1].at + 0.5) * 10) / 10,
      misses: S.targets.filter(function (tg) { return tg.judged === 'miss'; })
        .map(function (tg) { return Math.round(tg.at * 100) / 100; }).slice(0, 60),
      notes: S.played.slice(0, 800).map(function (p) {
        return { m: p.m, v: p.v || 90, t: Math.max(0, Math.round(p.at * 1000) / 1000), d: 0.3 };
      })
    });
    App.store.set('ideas.list', list.slice(-100));
  }

  // ---------------- audio-in: mic/interface note reading ----------------
  // Guitar: normalized autocorrelation pitch detection (60-1000 Hz) on the
  // selected input device with echoCancellation/noiseSuppression/autoGain
  // OFF (they destroy transients); frames below a clarity threshold are
  // DISCARDED, never scored as misses. Drums: amplitude-jump onset
  // detection, pitch-agnostic. Timing windows already absorb detection lag
  // via the calibration wizard ('audio' source).

  var mic = { on: false, stream: null, timer: null, lastMidi: -1, quiet: true, lastRms: 0, err: '' };

  function micStart() {
    var pref = App.store.get('audio.inId', null);
    var cons = {
      echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1
    };
    if (pref) cons.deviceId = { ideal: pref };
    return navigator.mediaDevices.getUserMedia({ audio: cons }).then(function (stream) {
      var ctx = App.getAudio();
      mic.stream = stream;
      var src = ctx.createMediaStreamSource(stream);
      var an = ctx.createAnalyser();
      an.fftSize = 2048;
      src.connect(an);
      var buf = new Float32Array(2048);
      mic.on = true;
      mic.err = '';
      mic.timer = setInterval(function () {
        an.getFloatTimeDomainData(buf);
        var rms = 0;
        for (var i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
        rms = Math.sqrt(rms / buf.length);
        if (S && S.sc.instrument === 'drums') {
          // onset: sharp jump over the previous frame
          if (rms > 0.03 && rms > mic.lastRms * 2.6) {
            inputNote(38, Math.min(127, Math.round(rms * 600)), 'audio');
          }
          mic.lastRms = rms;
          return;
        }
        if (rms < 0.012) { mic.quiet = true; mic.lastMidi = -1; mic.lastRms = rms; return; }
        var det = detectPitch(buf, ctx.sampleRate);
        mic.lastRms = rms;
        if (!det || det.clarity < 0.9) return; // low confidence — discard, don't punish
        var midi = Math.round(69 + 12 * Math.log2(det.freq / 440));
        if (midi < 28 || midi > 96) return;
        if (midi !== mic.lastMidi || mic.quiet) {
          inputNote(midi, Math.min(127, Math.round(rms * 500) + 40), 'audio');
          mic.lastMidi = midi;
          mic.quiet = false;
        }
      }, 30);
      paintMicChip();
    }).catch(function (e) {
      mic.err = 'mic unavailable: ' + (e && e.name || e);
      mic.on = false;
      paintMicChip();
    });
  }

  function micStop() {
    if (mic.timer) { clearInterval(mic.timer); mic.timer = null; }
    if (mic.stream) { mic.stream.getTracks().forEach(function (t) { t.stop(); }); mic.stream = null; }
    mic.on = false;
    mic.lastMidi = -1;
    paintMicChip();
  }

  function detectPitch(buf, sr) {
    // normalized autocorrelation over guitar-range lags
    var minLag = Math.floor(sr / 1000), maxLag = Math.floor(sr / 60);
    var bestLag = -1, bestR = 0;
    var energy = 0;
    for (var i = 0; i < buf.length; i++) energy += buf[i] * buf[i];
    if (energy === 0) return null;
    for (var lag = minLag; lag <= maxLag; lag++) {
      var r = 0;
      for (var j = 0; j + lag < buf.length; j += 2) r += buf[j] * buf[j + lag];
      r = (2 * r * 2) / energy; // normalize (stride-2 compensation)
      if (r > bestR) { bestR = r; bestLag = lag; }
    }
    if (bestLag < 0) return null;
    return { freq: sr / bestLag, clarity: Math.min(1, bestR) };
  }

  function paintMicChip() {
    var b = document.getElementById('ws-mic');
    if (!b) return;
    b.classList.toggle('active', mic.on);
    b.textContent = mic.on ? '🎤 Listening' : '🎤 Mic';
    var m = document.getElementById('ws-micmsg');
    if (m) m.textContent = mic.err;
  }

  // ---------------- LUMI lights ----------------

  var lit = [];
  function lightsUpdate(now) {
    if (!App.midi || !App.midi.hasOutput || S.sc.instrument === 'drums') return;
    var cur = null, next = null;
    if (S.mode === 'wait') {
      cur = S.targets[S.waitIdx] && S.targets[S.waitIdx].n.m;
      next = S.targets[S.waitIdx + 1] && S.targets[S.waitIdx + 1].n.m;
    } else {
      for (var i = 0; i < S.targets.length; i++) {
        var tg = S.targets[i];
        if (tg.judged) continue;
        var dt = (S.startT + tg.at) - now;
        if (dt > -0.1 && cur === null) { cur = tg.n.m; continue; }
        if (cur !== null && dt > 0) { next = tg.n.m; break; }
      }
    }
    var want = [];
    if (cur != null) want.push([cur, 120]);
    if (next != null && next !== cur) want.push([next, 25]);
    lit.forEach(function (m) {
      if (!want.some(function (w) { return w[0] === m; })) App.midi.dark(m);
    });
    want.forEach(function (w) { App.midi.light(w[0], w[1]); });
    lit = want.map(function (w) { return w[0]; });
  }

  function lightsOff() {
    if (App.midi && App.midi.hasOutput) lit.forEach(function (m) { App.midi.dark(m); });
    lit = [];
  }

  // ---------------- display (one canvas, three modes) ----------------

  var rafId = 0;

  function noteColor(j) {
    return j === 'perfect' ? '#4cc9b0' : j === 'great' ? '#8bd450' : j === 'good' ? '#ffd166'
      : j === 'miss' ? '#d9484a' : j === 'grace' ? 'rgba(180,175,165,0.5)' : '#e8e2d6';
  }

  function draw() {
    rafId = 0;
    if (!S || view !== 'session') return;
    var cv = els.canvas;
    var g = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    var ctx = App.getAudio();
    var now = S.mode === 'wait'
      ? (S.targets[S.waitIdx] ? S.targets[S.waitIdx].at : 0)
      : (S.running ? ctx.currentTime - S.startT : -1);

    var lo = 127, hi = 0;
    S.sc.notes.forEach(function (n) { lo = Math.min(lo, n.m); hi = Math.max(hi, n.m); });
    lo -= 2; hi += 2;

    if (S.display === 'highway') drawHighway(g, W, H, now, lo, hi);
    else if (S.display === 'scroll') drawScroll(g, W, H, now, lo, hi);
    else if (S.display === 'tab') drawTab(g, W, H, now, 0, H);
    else if (S.display === 'both') { drawSheet(g, W, H * 0.55, now); drawTab(g, W, H, now, H * 0.58, H * 0.42); }
    else drawSheet(g, W, H, now);

    if (S.running || S.mode === 'wait') rafId = requestAnimationFrame(draw);
  }

  function xForPitch(m, lo, hi, W) {
    return 30 + ((m - lo) / Math.max(1, hi - lo)) * (W - 60);
  }

  function drawHighway(g, W, H, now, lo, hi) {
    var hitY = H - 46;
    var pxPerSec = (H - 60) / 3;
    g.fillStyle = 'rgba(128,128,128,0.16)';
    g.fillRect(0, hitY, W, 2.5);
    var isDrums = S.sc.instrument === 'drums';
    S.targets.forEach(function (tg) {
      var dt = tg.at - now;
      if (dt < -0.6 || dt > 3.2) return;
      var y = hitY - dt * pxPerSec;
      var x = isDrums ? (W / 2 + (tg.n.lane === 0 ? 90 : -90)) : xForPitch(tg.n.m, lo, hi, W);
      g.fillStyle = noteColor(tg.judged);
      g.globalAlpha = tg.judged === 'miss' ? 0.45 : 1;
      var h = Math.max(10, (tg.n.d * spb()) * pxPerSec);
      g.beginPath();
      g.roundRect(x - 9, y - h, 18, h, 5);
      g.fill();
      g.globalAlpha = 1;
      if (isDrums && tg.n.s) {
        g.fillStyle = '#141216';
        g.font = 'bold 10px sans-serif';
        g.textAlign = 'center';
        g.fillText(tg.n.s, x, y - h / 2 + 3);
      }
      if (tg.n.v > 110) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(x - 11, y - h - 2, 22, h + 4); }
    });
    // mini keyboard strip for pitch reference
    if (!isDrums) {
      for (var m = lo + 2; m <= hi - 2; m++) {
        var x2 = xForPitch(m, lo, hi, W);
        var black = [1, 3, 6, 8, 10].indexOf(Theory.mod12(m)) !== -1;
        g.fillStyle = black ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.25)';
        g.fillRect(x2 - 7, H - 36, 14, 28);
      }
    } else {
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.font = 'bold 13px sans-serif';
      g.textAlign = 'center';
      g.fillText('L', W / 2 - 90, H - 16);
      g.fillText('R', W / 2 + 90, H - 16);
    }
  }

  function drawScroll(g, W, H, now, lo, hi) {
    var hitX = 90;
    var pxPerSec = (W - 120) / 4;
    g.fillStyle = 'rgba(128,128,128,0.16)';
    g.fillRect(hitX, 0, 2.5, H);
    S.targets.forEach(function (tg) {
      var dt = tg.at - now;
      if (dt < -1 || dt > 4.2) return;
      var x = hitX + dt * pxPerSec;
      var y = H - 24 - ((tg.n.m - lo) / Math.max(1, hi - lo)) * (H - 48);
      g.fillStyle = noteColor(tg.judged);
      g.globalAlpha = tg.judged === 'miss' ? 0.45 : 1;
      var w = Math.max(10, (tg.n.d * spb()) * pxPerSec - 2);
      g.beginPath();
      g.roundRect(x, y - 6, w, 12, 4);
      g.fill();
      g.globalAlpha = 1;
    });
  }

  function tabPos(n) {
    if (n.str != null) return { s: n.str, f: n.fret };
    for (var s = 0; s < 6; s++) {
      var f = n.m - TAB_TUNING[s];
      if (f >= 0 && f <= 15) return { s: s, f: f };
    }
    return { s: 0, f: Math.max(0, n.m - TAB_TUNING[0]) };
  }

  function drawTab(g, W, H, now, y0, hgt) {
    var top = y0 + 18, gap = (hgt - 40) / 5;
    g.strokeStyle = 'rgba(200,195,185,0.4)';
    g.lineWidth = 1;
    for (var s = 0; s < 6; s++) {
      g.beginPath();
      g.moveTo(20, top + s * gap);
      g.lineTo(W - 20, top + s * gap);
      g.stroke();
    }
    var hitX = 110, pxPerBeat = 46;
    g.fillStyle = 'rgba(255,171,71,0.9)';
    g.fillRect(hitX, top - 8, 2, 5 * gap + 16);
    S.targets.forEach(function (tg) {
      var dx = (tg.at - now) / spb() * pxPerBeat;
      if (dx < -100 || dx > W - 100) return;
      var p = tabPos(tg.n);
      g.fillStyle = noteColor(tg.judged);
      g.font = 'bold 12px sans-serif';
      g.textAlign = 'center';
      var y = top + p.s * gap;
      g.beginPath();
      g.arc(hitX + dx, y, 8.5, 0, Math.PI * 2);
      g.fillStyle = 'rgba(19,17,20,0.9)';
      g.fill();
      g.fillStyle = noteColor(tg.judged);
      g.fillText(String(p.f), hitX + dx, y + 4);
    });
  }

  var SHEET_STEP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  function drawSheet(g, W, H, now) {
    var midY = H / 2;
    g.strokeStyle = 'rgba(200,195,185,0.55)';
    g.lineWidth = 1;
    for (var l = -2; l <= 2; l++) {
      g.beginPath();
      g.moveTo(20, midY + l * 12);
      g.lineTo(W - 20, midY + l * 12);
      g.stroke();
    }
    var hitX = 110;
    var pxPerBeat = 46;
    g.fillStyle = 'var(--accent)';
    g.fillStyle = 'rgba(255,171,71,0.9)';
    g.fillRect(hitX, midY - 46, 2, 92);
    // E4 (midi 64) sits on the bottom line
    function yFor(m) {
      var oct = Math.floor(m / 12) - 1;
      var stepIdx = SHEET_STEP[Theory.mod12(m)] + oct * 7;
      var e4 = SHEET_STEP[4] + 4 * 7;
      return midY + 24 - (stepIdx - e4) * 6;
    }
    S.targets.forEach(function (tg) {
      var dx = (tg.at - now) / spb() * pxPerBeat;
      if (dx < -100 || dx > W - 100) return;
      var x = hitX + dx;
      var y = yFor(tg.n.m);
      g.fillStyle = noteColor(tg.judged);
      g.beginPath();
      g.ellipse(x, y, 6.5, 5, -0.3, 0, Math.PI * 2);
      g.fill();
      if (y < midY - 30 || y > midY + 30) {
        g.strokeStyle = 'rgba(200,195,185,0.55)';
        g.beginPath();
        g.moveTo(x - 10, y + (y > midY ? 0 : 0));
        g.lineTo(x + 10, y);
        g.stroke();
      }
      g.strokeStyle = 'rgba(200,195,185,0.8)';
      g.beginPath();
      g.moveTo(x + 6, y - 2);
      g.lineTo(x + 6, y - 26);
      g.stroke();
    });
  }

  // ---------------- calibration wizard ----------------

  var cal = null;
  function startCal() {
    view = 'cal';
    render();
    var ctx = App.getAudio();
    cal = { clicks: [], taps: [], n: 8 };
    var t0 = ctx.currentTime + 0.6;
    for (var i = 0; i < cal.n; i++) {
      var t = t0 + i * 0.6;
      click(t, i === 0);
      cal.clicks.push(t);
    }
    setTimeout(function () { if (view === 'cal') finishCal(); }, (0.6 + cal.n * 0.6 + 0.8) * 1000);
  }

  function calTap(src) {
    if (!cal) return;
    var now = App.getAudio().currentTime;
    var best = null, bd = 1;
    cal.clicks.forEach(function (c) {
      if (Math.abs(now - c) < bd) { bd = Math.abs(now - c); best = c; }
    });
    if (best !== null && bd < 0.3) cal.taps.push({ err: (now - best) * 1000, src: src });
    var el = document.getElementById('ws-cal-count');
    if (el) el.textContent = cal.taps.length + ' / ' + cal.n;
  }

  function finishCal() {
    if (!cal || cal.taps.length < 3) {
      flash(cal && cal.taps.length ? 'Not enough taps — try again' : 'No taps heard');
      cal = null;
      view = 'lib';
      render();
      return;
    }
    var bySrc = {};
    cal.taps.forEach(function (t) { (bySrc[t.src] = bySrc[t.src] || []).push(t.err); });
    var stored = App.store.get('ws.cal', {});
    Object.keys(bySrc).forEach(function (src) {
      var errs = bySrc[src].sort(function (a, b) { return a - b; });
      stored[src] = Math.round(errs[Math.floor(errs.length / 2)]);
    });
    App.store.set('ws.cal', stored);
    flash('Calibrated: ' + Object.keys(bySrc).map(function (s) { return s + ' ' + stored[s] + 'ms'; }).join(' · '));
    cal = null;
    view = 'lib';
    render();
  }

  // ---------------- UI ----------------

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var flashT = null;
  function flash(msg) {
    var el = document.getElementById('ws-flash');
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '1';
    if (flashT) clearTimeout(flashT);
    flashT = setTimeout(function () { el.style.opacity = '0'; }, 2200);
  }

  function paintHud() {
    if (view !== 'session') return;
    var el = document.getElementById('ws-hud');
    if (!el || !S) return;
    el.innerHTML =
      '<span class="ws-combo">' + S.combo + '×</span>' +
      '<span class="muted small">acc ' + accuracy() + '% · P' + S.counts.perfect + ' G' + S.counts.great +
      ' g' + S.counts.good + ' <span style="color:#d9484a">M' + S.counts.miss + '</span></span>' +
      (S.mode === 'phrase' ? '<span class="muted small">phrase ' + (S.phrase + 1) + '/' + phraseCount(S.sc) +
        ' · clean ' + S.cleanPasses + '/2</span>' : '') +
      (S.mode === 'ladder' || S.tempoScale !== 1 ? '<span class="muted small">' + Math.round(S.tempoScale * 100) + '% tempo</span>' : '');
  }

  function render() {
    if (view === 'lib') renderLib();
    else if (view === 'session') renderSession();
    else if (view === 'cal') renderCal();
    // report renders itself
  }

  function statsLine() {
    var xp = parseInt(App.store.get('ws.xp', 0), 10);
    var s = App.store.get('ws.streak', { days: 0 });
    var ach = App.store.get('ws.ach', []);
    return 'Level ' + level(xp) + ' · ' + xp + ' XP · ' + (s.days || 0) + '-day streak · ' + ach.length + '/' + Object.keys(ACHIEVEMENTS).length + ' achievements';
  }

  function renderLib() {
    var weak = weakQueue();
    var h =
      '<div class="card">' +
        '<div class="row spread"><h2 style="margin:0">Woodshed</h2>' +
          '<span class="muted small">' + statsLine() + '</span></div>' +
        '<div class="muted small" style="margin-top:6px">Pick something to practice — every run is scored (Perfect ±' + WIN.perfect +
          'ms) and lands as a take in your Studio Ideas. Calibrate once per input for honest timing.</div>' +
        '<div class="row" style="margin-top:12px">' +
          '<button type="button" class="btn sm" id="ws-gen-scale">+ Scale (your key)</button>' +
          '<button type="button" class="btn sm" id="ws-gen-hanon">+ Hanon</button>' +
          '<button type="button" class="btn sm" id="ws-gen-pent">+ Pentatonic fours</button>' +
          '<label class="btn sm">+ MIDI file<input type="file" id="ws-midi" accept=".mid,.midi" style="display:none"></label>' +
          '<button type="button" class="btn sm" id="ws-ascii-btn">+ Paste tab</button>' +
          '<button type="button" class="btn sm" id="ws-track">+ From Studio track</button>' +
          '<button type="button" class="btn sm" id="ws-cal-btn">Calibrate timing</button>' +
        '</div>' +
        '<div id="ws-ascii-box" style="display:none;margin-top:10px">' +
          '<textarea id="ws-ascii" rows="7" style="width:100%" placeholder="Paste six-line ASCII tab here"></textarea>' +
          '<div class="row tight" style="margin-top:6px"><button type="button" class="btn sm primary" id="ws-ascii-go">Import</button>' +
          '<span class="muted small">ASCII tab has no reliable rhythm — imports as pitches, Wait mode ready; scored modes assume even eighths.</span></div>' +
        '</div>' +
        '<div class="muted small" id="ws-msg" style="margin-top:8px"></div>' +
      '</div>' +
      (weak.length ? '<div class="card"><h2>Weak spots</h2><div class="row tight">' + weak.slice(0, 5).map(function (w, i) {
        return '<button type="button" class="chip fb-chip" data-wsweak="' + i + '">' + esc(w.title.slice(0, 18)) + ' · phrase ' + (w.phrase + 1) + ' · ' + w.acc + '%</button>';
      }).join('') + '</div><div class="muted small" style="margin-top:6px">Your lowest-scoring phrases — clear them and they leave the queue.</div></div>' : '') +
      '<div class="card"><h2>Rudiments</h2><div class="row tight">' + RUDIMENTS.map(function (r) {
        var best = App.store.get('ws.ladder.' + r.name.replace(/\W+/g, '_'), null);
        return '<button type="button" class="chip fb-chip" data-wsrud="' + r.id + '">' + r.name +
          (best ? ' <span class="muted">' + Math.round(best * 100) + '%</span>' : '') + '</button>';
      }).join('') + '</div><div class="muted small" style="margin-top:6px">8 of the 40 PAS rudiments with sticking + accent targets — the ladder raises tempo as you pass.</div></div>' +
      '<div class="card"><h2>Library</h2><div id="ws-lib">' + (lib().length ? lib().slice().reverse().map(function (sc) {
        var best = parseInt(App.store.get(bestKey(sc, 'run'), 0), 10);
        return '<div class="row spread ws-row" data-wsid="' + sc.id + '">' +
          '<span><b>' + esc(sc.title) + '</b> <span class="muted small">' + sc.instrument + ' · ' + sc.bpm + ' BPM · ' +
          sc.notes.length + ' notes · diff ' + '★'.repeat(sc.diff) + (sc.timingOk ? '' : ' · timing approximate') +
          (best ? ' · best ' + best : '') + '</span></span>' +
          '<span class="row tight">' +
            '<button type="button" class="btn sm primary" data-wsplay="run">Run</button>' +
            '<button type="button" class="btn sm" data-wsplay="phrase">Phrases</button>' +
            '<button type="button" class="btn sm" data-wsplay="wait">Wait</button>' +
            '<button type="button" class="btn sm" data-wsplay="ladder">Ladder</button>' +
            '<button type="button" class="btn sm" data-wsdel="' + sc.id + '">' + App.icon('close', 12) + '</button>' +
          '</span></div>';
      }).join('') : '<div class="muted">Nothing yet — generate an exercise above, import a MIDI file, or paste a tab.</div>') + '</div></div>';
    els.root.innerHTML = h;
    wireLib();
  }

  function renderSession() {
    els.root.innerHTML =
      '<div class="card">' +
        '<div class="row spread">' +
          '<span class="row tight">' +
            '<button type="button" class="btn sm" id="ws-back">' + App.icon('left', 14) + '</button>' +
            '<b>' + esc(S.sc.title) + '</b>' +
            '<span class="muted small">' + S.mode + (S.sc.timingOk ? '' : ' · even-eighths assumed') + '</span>' +
          '</span>' +
          '<span class="row tight">' +
            '<div class="seg" id="ws-disp">' +
              [['highway', 'Highway'], ['scroll', 'Scroll'], ['sheet', 'Sheet']]
                .concat(S.sc.instrument === 'guitar' ? [['tab', 'Tab'], ['both', 'Tab+Sheet']] : [])
                .map(function (d) { return '<button type="button" data-wsd="' + d[0] + '">' + d[1] + '</button>'; }).join('') +
            '</div>' +
            (S.sc.instrument !== 'piano'
              ? '<button type="button" class="chip fb-chip" id="ws-mic" title="Score from your instrument through the mic / audio interface (guitar: pitch detection · drums: onset detection)">🎤 Mic</button>'
              : '') +
            '<button type="button" class="chip fb-chip' + (S.guide ? ' active' : '') + '" id="ws-guide" title="Play the target notes as a guide">Guide</button>' +
            '<button type="button" class="btn sm primary" id="ws-go">' + App.icon('restart', 14) + ' ' + (S.mode === 'wait' ? 'Start' : 'Count-in') + '</button>' +
          '</span>' +
        '</div>' +
        '<div id="ws-hud" class="row tight" style="margin-top:8px;min-height:26px"></div>' +
        '<div class="muted small" id="ws-micmsg"></div>' +
        '<canvas id="ws-cv" width="1100" height="360" style="width:100%;background:var(--card2);border:1px solid var(--line);border-radius:10px;margin-top:6px"></canvas>' +
        '<div class="muted small" style="margin-top:8px">Play with your MIDI keys anywhere, the typing keys or touch keys on the Piano page' +
          (S.sc.instrument === 'drums' ? ', or the Pads' : '') + '. Switch the view live — same clock underneath.</div>' +
      '</div>';
    document.getElementById('ws-back').addEventListener('click', function () {
      endRun(false);
      micStop();
      S = null;
      view = 'lib';
      render();
    });
    document.getElementById('ws-go').addEventListener('click', function () { startRun(); });
    document.getElementById('ws-disp').addEventListener('click', function (e) {
      var b = e.target.closest('[data-wsd]');
      if (!b) return;
      S.display = b.getAttribute('data-wsd');
      App.store.set('ws.display', S.display);
      paintDispSeg();
      if (!rafId) rafId = requestAnimationFrame(draw);
    });
    document.getElementById('ws-guide').addEventListener('click', function () {
      S.guide = !S.guide;
      App.store.set('ws.guide', S.guide);
      this.classList.toggle('active', S.guide);
    });
    var micBtn = document.getElementById('ws-mic');
    if (micBtn) {
      micBtn.addEventListener('click', function () {
        if (mic.on) micStop(); else micStart();
      });
      paintMicChip();
    }
    els.canvas = document.getElementById('ws-cv');
    paintDispSeg();
    paintHud();
    if (S.mode === 'wait') { buildTargets(); S.running = true; rafId = requestAnimationFrame(draw); }
    else rafId = requestAnimationFrame(draw);
  }

  function paintDispSeg() {
    var seg = document.getElementById('ws-disp');
    if (!seg) return;
    seg.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-wsd') === S.display);
    });
  }

  function renderCal() {
    els.root.innerHTML =
      '<div class="card"><h2>Timing calibration</h2>' +
      '<div class="muted">Eight clicks are playing. Tap along with EVERY input you use — MIDI keys, typing keys, the touch piano. ' +
      'The median offset per input is stored and silently applied to all scoring.</div>' +
      '<div class="jam-now" id="ws-cal-count" style="margin-top:10px">0 / 8</div></div>';
  }

  function renderReport(acc, score, prevBest, xp, days) {
    view = 'report';
    var st = stars(acc);
    var hits = S.judged;
    var bias = hits.length ? Math.round(hits.reduce(function (a, b) { return a + b.err; }, 0) / hits.length) : 0;
    var pc = phraseCount(S.sc);
    var phrasesH = '';
    for (var p = 0; p < pc; p++) {
      var pn = phraseNotes(S.sc, p).length;
      if (!pn) continue;
      var ph = hits.filter(function (jd) { return jd.t >= p * PHRASE_BEATS && jd.t < (p + 1) * PHRASE_BEATS; }).length;
      var pAcc = Math.round((ph / pn) * 100);
      phrasesH += '<div class="ws-pbar" title="phrase ' + (p + 1) + ': ' + pAcc + '%">' +
        '<div style="height:' + Math.max(6, pAcc * 0.6) + 'px;background:' + (pAcc >= 85 ? '#4cc9b0' : pAcc >= 60 ? '#ffd166' : '#d9484a') + '"></div>' +
        '<span>' + (p + 1) + '</span></div>';
    }
    // deeper read-outs where the material carries targets
    var extras = [];
    var real = S.targets.filter(function (tg) { return tg.judged !== 'grace'; });
    var withV = real.filter(function (tg) { return tg.pv != null; });
    if (S.sc.instrument === 'drums' && !S.sc.buzz && withV.length >= 4) {
      var okAcc = withV.filter(function (tg) { return (tg.n.v >= 110) === (tg.pv >= 105); }).length;
      extras.push('accent pattern ' + Math.round((okAcc / withV.length) * 100) + '% match');
    }
    var distinctV = {};
    real.forEach(function (tg) { distinctV[tg.n.v] = 1; });
    if (S.sc.instrument !== 'drums' && Object.keys(distinctV).length > 2 && withV.length >= 4) {
      var dv = withV.reduce(function (a, tg) { return a + Math.abs(tg.pv - tg.n.v); }, 0) / withV.length;
      extras.push('dynamics ' + Math.max(0, Math.round(100 - dv)) + '% match to the score');
    }
    if (S.sc.hasGrace && S.played.length > 3) {
      var groups = 0;
      S.targets.forEach(function (tg, i) {
        if (tg.judged === 'grace' && (!S.targets[i - 1] || S.targets[i - 1].judged !== 'grace')) groups++;
      });
      var pairs = 0;
      for (var pi = 1; pi < S.played.length; pi++) {
        var gap = (S.played[pi].at - S.played[pi - 1].at) * 1000;
        if (gap >= 15 && gap <= 60) pairs++;
      }
      if (groups) extras.push('flam/drag grace spacing: ' + Math.min(100, Math.round((pairs / groups) * 100)) + '% landed in the 15–60ms pocket');
    }

    var coach = S.counts.miss > S.targets.length / 3 ? 'Lots of misses — drop to Phrases or Wait mode and rebuild it slowly.'
      : Math.abs(bias) < 12 ? 'Your timing is centered — push the tempo.'
      : bias > 0 ? 'You drag by ~' + bias + 'ms on average — think ahead of the click.'
      : 'You rush by ~' + (-bias) + 'ms on average — relax into the click.';
    els.root.innerHTML =
      '<div class="card">' +
        '<div class="row spread"><h2 style="margin:0">' + '★'.repeat(st) + '<span style="opacity:0.25">' + '★'.repeat(5 - st) + '</span>' +
        ' ' + acc + '%</h2><span class="muted small">' + statsLine() + '</span></div>' +
        '<div class="row" style="margin-top:8px">' +
          '<span class="muted">score <b>' + score + '</b>' + (score > prevBest ? ' — new best!' : prevBest ? ' (best ' + prevBest + ')' : '') +
          ' · combo ' + S.maxCombo + ' · strays ' + S.strays + (days > 1 ? ' · 🔥 ' + days + ' days' : '') + '</span>' +
        '</div>' +
        '<div class="muted" style="margin-top:10px">' + coach + '</div>' +
        (extras.length ? '<div class="muted small" style="margin-top:6px">' + extras.join(' · ') + '</div>' : '') +
        '<div class="row tight" style="margin-top:12px;align-items:flex-end" id="ws-phrases">' + phrasesH + '</div>' +
        '<div class="row" style="margin-top:14px">' +
          '<button type="button" class="btn primary" id="ws-again">' + App.icon('restart', 14) + ' Again</button>' +
          '<button type="button" class="btn" id="ws-tolib">Library</button>' +
        '</div>' +
      '</div>';
    document.getElementById('ws-again').addEventListener('click', function () {
      view = 'session';
      renderSession();
      startRun();
    });
    document.getElementById('ws-tolib').addEventListener('click', function () {
      S = null;
      view = 'lib';
      render();
    });
  }

  function startSession(sc, mode) {
    if (!sc.timingOk && mode !== 'wait') flash('Timing approximate — scored as even eighths');
    S = newSession(sc, mode);
    view = 'session';
    renderSession();
  }

  function wireLib() {
    document.getElementById('ws-gen-scale').addEventListener('click', function () {
      addScore(scaleScore(App.store.get('ws.instr', 'piano') === 'guitar' ? 'guitar' : 'piano'));
    });
    document.getElementById('ws-gen-hanon').addEventListener('click', function () { addScore(hanonScore()); });
    document.getElementById('ws-gen-pent').addEventListener('click', function () { addScore(pentWorkout()); });
    document.getElementById('ws-midi').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var sc = importMidi(rd.result, f.name);
          addScore(sc);
          msg('Imported “' + sc.title + '”: ' + sc.notes.length + ' notes, ' + sc.bpm + ' BPM, tempo map applied. Preserved: pitches, timing, velocities. Dropped: program changes, CC, pitch bend, lyrics.');
        } catch (e) { msg('MIDI import failed: ' + e.message); }
      };
      rd.readAsArrayBuffer(f);
    });
    document.getElementById('ws-ascii-btn').addEventListener('click', function () {
      var box = document.getElementById('ws-ascii-box');
      box.style.display = box.style.display === 'none' ? '' : 'none';
    });
    document.getElementById('ws-ascii-go').addEventListener('click', function () {
      try {
        var sc = importAscii(document.getElementById('ws-ascii').value, 'Pasted tab');
        addScore(sc);
        msg('Imported ' + sc.notes.length + ' notes from tab. Preserved: pitches, string/fret. Dropped: rhythm (marked approximate), technique glyphs (h/p/b noted but unscored).');
      } catch (e) { msg('Tab import failed: ' + e.message); }
    });
    document.getElementById('ws-track').addEventListener('click', function () {
      var t = (window.DAW ? DAW.engine.tracks : []).filter(function (x) { return x.kind !== 'drums' && x.notes && x.notes.length; })[0];
      if (!t) { msg('No Studio track with notes yet — draw something in the Tracks piano roll first.'); return; }
      addScore(importTrack(t));
      msg('“' + t.name + '” imported from the Studio.');
    });
    document.getElementById('ws-cal-btn').addEventListener('click', startCal);
    els.root.addEventListener('click', function (e) {
      var rud = e.target.closest('[data-wsrud]');
      if (rud) {
        var r = RUDIMENTS.filter(function (x) { return x.id === rud.getAttribute('data-wsrud'); })[0];
        startSession(rudimentScore(r), 'ladder');
        return;
      }
      var wk = e.target.closest('[data-wsweak]');
      if (wk) {
        var w = weakQueue()[parseInt(wk.getAttribute('data-wsweak'), 10)];
        var sc = lib().filter(function (x) { return x.title === w.title; })[0];
        if (sc) {
          S = newSession(sc, 'phrase');
          S.phrase = Math.min(w.phrase, phraseCount(sc) - 1);
          view = 'session';
          renderSession();
        }
        return;
      }
      var play = e.target.closest('[data-wsplay]');
      if (play) {
        var row = play.closest('[data-wsid]');
        var sc2 = lib().filter(function (x) { return x.id === row.getAttribute('data-wsid'); })[0];
        if (sc2) startSession(sc2, play.getAttribute('data-wsplay'));
        return;
      }
      var del = e.target.closest('[data-wsdel]');
      if (del) {
        saveLib(lib().filter(function (x) { return x.id !== del.getAttribute('data-wsdel'); }));
        renderLib();
      }
    });
  }

  function msg(s) {
    var el = document.getElementById('ws-msg');
    if (el) el.textContent = s;
  }

  // ---------------- module ----------------

  function init(rootEl) {
    App.injectCSS('woodshed',
      '.ws-row{padding:8px 0;border-bottom:1px solid var(--line)}' +
      '.ws-combo{font-family:var(--font-condensed,var(--font-display));font-size:26px;font-weight:700;color:var(--accent);min-width:52px}' +
      '.ws-pbar{display:flex;flex-direction:column;align-items:center;gap:2px;width:22px}' +
      '.ws-pbar div{width:14px;border-radius:3px 3px 0 0;align-self:center}' +
      '.ws-pbar span{font-size:9px;color:var(--muted)}' +
      '#ws-flash{position:fixed;left:50%;transform:translateX(-50%);bottom:70px;z-index:450;background:var(--card);' +
        'border:1px solid var(--accent);border-radius:10px;padding:8px 16px;transition:opacity 0.4s;opacity:0;pointer-events:none}'
    );
    els.root = rootEl;
    if (!document.getElementById('ws-flash')) {
      var f = document.createElement('div');
      f.id = 'ws-flash';
      document.body.appendChild(f);
    }
    render();

    // inputs: hardware MIDI + on-screen/QWERTY notes; calibration taps too
    App.on('midi:note', function (d) {
      if (!d || !d.on || App.active !== 'shed') return;
      if (cal) { calTap('midi'); return; }
      inputNote(d.midi, d.vel, 'midi');
    });
    App.on('note:input', function (d) {
      if (!d || !d.on || App.active !== 'shed') return;
      var src = d.src === 'touch' ? 'touch' : 'qwerty';
      if (cal) { calTap(src); return; }
      inputNote(d.midi, d.vel || 90, src);
    });
  }

  // read-only debug/test handle (also lets plugins peek at the session)
  window.Woodshed = {
    get session() { return S; },
    get view() { return view; },
    get cal() { return cal; },
    get mic() { return mic; },
    importMidi: importMidi,
    importAscii: importAscii
  };

  App.register('shed', {
    init: init,
    onShow: function () { if (view === 'lib') renderLib(); },
    onHide: function () { if (S) endRun(false); micStop(); lightsOff(); },
    onKey: function (e) {
      if (view !== 'session' || !S) return;
      // QWERTY drumming/tapping: Z/X = L/R pads in the shed (drums), any-key tap for cal
      if (e.repeat) return;
      if (S.sc.instrument === 'drums' && (e.code === 'KeyZ' || e.code === 'KeyX')) {
        e.preventDefault();
        inputNote(38, e.code === 'KeyX' ? 118 : 90, 'qwerty');
      }
    }
  });
})();
