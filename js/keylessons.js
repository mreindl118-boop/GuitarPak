/* soundLAB KEYS LESSONS — graded scale lessons on the Keys page, played
 * against a metronome and judged note by note: the right key, and how close
 * to the beat. Mounted by piano.js into #pn-lessons (App.keysLessons.init).
 *
 * A lesson = a scale, a hand, 1 or 2 octaves and a pattern, run up and down.
 * Its LEVEL is the speed: quarter notes at 60 up to 16ths at 72 (STEPS).
 * A run = one bar of count-in, then the pattern `reps` times, closing on the
 * tonic. Every note is judged against its beat — perfect / great / good
 * windows like the Woodshed — after output latency and the Woodshed tap
 * calibration (ws.cal) are taken off, so "on the click you hear" is on time.
 * Score = notes right × timing quality; 85+ levels the lesson up, 70+ passes.
 * How much the keyboard helps is the Keys page's Help level (pn.assist).
 *
 * INFINITE MODE (kl.reps 0, "∞"): the pattern loops with the click until you
 * stop; a STREAK counts clean notes in a row (right key within the 'good'
 * window) and any wrong / late / missed note breaks it. Targets are generated
 * on the fly, so with Speed up (kl.speedup) every clean loop adds 4 bpm. The
 * best streak per lesson level is the record (prog.inf[step]).
 *
 * Stores: kl.prog { lessonId: { step, passed, best: {step: score},
 *           fails, mastered, inf: {step: best streak},
 *           runs: [{d, st, h, acc, t, m, sd, sc | inf, bpm}] (last 40) } }
 *         kl.sel (lesson id) · kl.tier · kl.reps (1 | 2 | 4 | 0 = infinite)
 *         kl.speedup (infinite: +4 bpm per clean loop, default on)
 * Bus: emits transport:claim {owner:'keys'}; stops on any other claim.
 *
 * DOUBLE-TAP CONTROL (v0.79.0, kl.dbltap, default on): hands stay on the
 * keys. Two strikes of the CONTROL KEY (the lowest key of the lit keyboard
 * range - a LUMI's leftmost key) within 350 ms start the selected lesson
 * (or Again / Next level / Go again); during a run they stop it, unless the
 * second strike was a right note of the lesson (a turnaround that repeats
 * that note never stops a run). Double-tapping empty space on the lesson
 * card does the same on a touchscreen. The GUIDE COLORS chip mirrors
 * the legacy guide-style setting (App.midi.display); the single LUMI Display
 * master lives in the treble-clef menu.
 */
(function () {
  'use strict';

  var STEPS = [[60, 1], [72, 1], [84, 1], [100, 1], [60, 2], [72, 2], [84, 2], [100, 2], [60, 4], [72, 4]];
  var RATE_NAME = { 1: 'Quarter notes', 2: '8th notes', 4: '16th notes' };
  var WIN = { perfect: 35, great: 70, good: 120 };
  var MASTER_STEP = 7;   // 8th notes at 100 …
  var MASTER_HELP = 2;   // … with Target help or less = mastered

  var TIERS = [['start', 'Start here'], ['build', 'Building'], ['stretch', 'Stretch']];
  function L(id, tier, name, root, scale, hand, oct, pat) {
    return { id: id, tier: tier, name: name, root: root, scale: scale, hand: hand, oct: oct || 1, pat: pat || 'scale' };
  }
  var LESSONS = [
    L('c-r', 'start', 'C major', 0, 'major', 'right'), L('c-l', 'start', 'C major', 0, 'major', 'left'),
    L('g-r', 'start', 'G major', 7, 'major', 'right'), L('g-l', 'start', 'G major', 7, 'major', 'left'),
    L('f-r', 'start', 'F major', 5, 'major', 'right'), L('f-l', 'start', 'F major', 5, 'major', 'left'),
    L('am-r', 'start', 'A minor', 9, 'aeolian', 'right'), L('am-l', 'start', 'A minor', 9, 'aeolian', 'left'),
    L('amp-r', 'start', 'A minor pentatonic', 9, 'minorPent', 'right'),
    L('d-r', 'build', 'D major', 2, 'major', 'right'), L('d-l', 'build', 'D major', 2, 'major', 'left'),
    L('em-r', 'build', 'E minor', 4, 'aeolian', 'right'), L('dm-r', 'build', 'D minor', 2, 'aeolian', 'right'),
    L('bb-r', 'build', 'B♭ major', 10, 'major', 'right'), L('bb-l', 'build', 'B♭ major', 10, 'major', 'left'),
    L('c3-r', 'build', 'C major in 3rds', 0, 'major', 'right', 1, 'i3'),
    L('c2-r', 'build', 'C major, 2 octaves', 0, 'major', 'right', 2),
    L('a-r', 'stretch', 'A major', 9, 'major', 'right'), L('e-r', 'stretch', 'E major', 4, 'major', 'right'),
    L('eb-r', 'stretch', 'E♭ major', 3, 'major', 'right'), L('ab-r', 'stretch', 'A♭ major', 8, 'major', 'right'),
    L('b-r', 'stretch', 'B major', 11, 'major', 'right'), L('fs-r', 'stretch', 'F♯ major', 6, 'major', 'right'),
    L('ahm-r', 'stretch', 'A harmonic minor', 9, 'harmonicMinor', 'right'),
    L('g2-l', 'stretch', 'G major, 2 octaves', 7, 'major', 'left', 2)
  ];
  var BY_ID = {};
  LESSONS.forEach(function (l) { BY_ID[l.id] = l; });

  var root = null, view = 'list', R = null, last = null, demo = null, entryInstrument = null;
  App.on('learn:lesson',function(e){if(e&&e.kind==='keys'){stopAll(true);entryInstrument=e.instrument==='synth'?'synth':'piano';if(root)paint();}});
  App.on('learn:instrument',function(){entryInstrument=null;if(R)stopAll(false);else if(root)paint();});
  function creditInstrument(){return R?R.instrument:entryInstrument||(App.active==='synth'?'synth':'piano');}
  function measure(r){if(!r||r.demo)return;var at=Date.now(),delta=(at-r.xpLast)/1000;r.xpLast=at;if(r.ctx.currentTime>=r.first&&delta>0&&delta<=1&&r.xpActivity!=null&&at-r.xpActivity<=5000)r.xpSeconds+=delta;}
  function recordRun(r,status){if(!r||r.demo||r.xpRecorded||!App.xp)return null;measure(r);r.xpRecorded=true;var hits=r.inf?r.inf.hits:r.targets.filter(function(t){return t.j&&t.j!=='miss';}).length,miss=r.inf?r.inf.miss:r.targets.filter(function(t){return t.j==='miss';}).length;return App.xp.finishLevel({sessionId:r.sessionId,instrument:r.instrument,status:status,mode:'keys:'+r.l.id,metrics:{engagedSeconds:r.xpSeconds,expected:r.inf?hits+miss:r.targets.length,matched:hits,missed:miss,extra:r.wrong,wrong:r.wrong}});}

  function K() { return App.keys; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function el(id) { return document.getElementById(id); }
  function stepName(i) { return RATE_NAME[STEPS[i][1]] + ' at ' + STEPS[i][0]; }
  function handName(h) { return h === 'left' ? 'Left hand' : 'Right hand'; }
  function star(n) { var s = ''; for (var i = 0; i < 3; i++) s += i < n ? '★' : '☆'; return s; }
  function starsFor(sc) { return sc >= 95 ? 3 : sc >= 85 ? 2 : sc >= 70 ? 1 : 0; }

  function progAll() { var p = App.store.get('kl.prog', {}); return p && typeof p === 'object' ? p : {}; }
  function prog(id) {
    var p = progAll()[id] || {};
    return { step: p.step >= 0 && p.step < STEPS.length ? p.step : 0, passed: typeof p.passed === 'number' ? p.passed : -1,
      best: p.best && typeof p.best === 'object' ? p.best : {}, fails: p.fails || 0, mastered: !!p.mastered,
      inf: p.inf && typeof p.inf === 'object' ? p.inf : {}, runs: Array.isArray(p.runs) ? p.runs : [] };
  }
  function saveProg(id, p) { var all = progAll(); all[id] = p; App.store.set('kl.prog', all); }
  function sel() { var id = App.store.get('kl.sel', 'c-r'); return BY_ID[id] || LESSONS[0]; }
  function reps() { var r = +App.store.get('kl.reps', 2); return r === 1 || r === 4 || r === 0 ? r : 2; }
  function speedup() { return App.store.get('kl.speedup', true) !== false; }
  function dblOn() { return App.store.get('kl.dbltap', true) !== false; }
  function ctrlKey() { var r = App.midi && App.midi.range ? App.midi.range() : null; return r && typeof r.lo === 'number' ? r.lo : 48; }
  function ctrlName() { return Theory.midiName(ctrlKey(), false); }
  var lastTap = { midi: -1, at: 0 };
  // the second strike of the control key inside 350 ms = a double-tap
  function isDoubleTap(midi) {
    if (!dblOn() || midi !== ctrlKey()) { lastTap.midi = -1; return false; }
    var now = performance.now();
    if (lastTap.midi === midi && now - lastTap.at <= 350) { lastTap.midi = -1; return true; }
    lastTap = { midi: midi, at: now };
    return false;
  }
  function onKeysPage() { return !App.sheet && !App.interactionBlocked && (App.active === 'piano' || App.active === 'synth'); }
  // start from the list / results view, stop a run
  function tapControl() {
    if (R) { if (R.inf && !R.demo) finish(); else stopAll(false); return true; }
    if (view === 'list' || view === 'done') { start(false); return true; }
    return false;
  }
  function lumiDisplay() { return !!(App.midi && App.midi.display); }
  function cal(src) { var c = App.store.get('ws.cal', {}); return c && typeof c[src] === 'number' ? c[src] : 0; }

  // ---------------- the run ----------------

  function click(ctx, t, accent) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = accent ? 1600 : 1150;
    g.gain.setValueAtTime(accent ? 0.22 : 0.14, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    o.connect(g);
    g.connect(ctx.destination); // the app's master gain shadows destination
    o.start(t);
    o.stop(t + 0.05);
  }

  function build(l, step, nReps, isDemo) {
    var k = K();
    k.stopRunner();
    App.emit('fb:set', { source: 'kl', root: l.root, scale: l.scale, mode: 1 });
    k.setHand(l.hand);
    k.render();
    k.scrollTo(true);
    var path = k.path(l.oct), fing = k.fingering(path);
    var one = Theory.exerciseSeq(path, l.pat, 'updown'), seq = [], inf = !isDemo && nReps === 0;
    if (!inf) {
      for (var r = 0; r < nReps; r++) seq = seq.concat(one);
      seq.push(one[0]); // close on the tonic
    }
    var ctx = App.getAudio(), bpm = STEPS[step][0], rate = STEPS[step][1];
    var beat = 60 / bpm, spn = beat / rate, t0 = ctx.currentTime + 0.25, first = t0 + 4 * beat;
    return {
      l: l, step: step, demo: !!isDemo, ctx: ctx, bpm: bpm, rate: rate, beat: beat, spn: spn, t0: t0, first: first,
      lat: ctx.outputLatency || ctx.baseLatency || 0, help: k.assist(), one: one, path: path, fing: fing,
      targets: seq.map(function (pi, i) {
        return { i: i, midi: path[pi].midi, pc: Theory.mod12(path[pi].midi), f: fing[pi] || 0, at: first + i * spn, j: null, err: 0 };
      }),
      inf: inf ? { k: 0, nextAt: first, loop: 0, bpm0: bpm, bpm: bpm, speedup: speedup(), dirty: {}, streak: 0, best: 0,
        hits: 0, miss: 0, errs: [], lastInput: first, beats: [], broke: 0 } : null,
      clickT: t0, beatN: 0, wrong: 0, shown: -1, timer: 0, raf: 0, lastHit: null
    };
  }

  function start(isDemo) {
    stopAll(true);
    var l = sel(), p = prog(l.id);
    try { R = build(l, p.step, isDemo ? 1 : reps(), isDemo); } catch (e) { R = null; return; }
    R.instrument=entryInstrument||(App.active==='synth'?'synth':'piano');R.sessionId='keys-'+Date.now()+'-'+Math.random().toString(36).slice(2);R.xpLast=Date.now();R.xpSeconds=0;R.xpActivity=null;R.xpRecorded=false;if(!R.demo&&App.xp)App.xp.beginSession({id:R.sessionId,instrument:R.instrument,source:'keys'});
    App.emit('transport:claim', { owner: 'keys' });
    App.wake.acquire('kl-run');
    if (R.demo) R.targets.forEach(function (tg) { K().play(tg.midi, tg.at - R.ctx.currentTime, Math.max(0.3, R.spn * 1.4), 0.5); });
    R.timer = setInterval(tick, 25);
    view = 'run';
    document.documentElement.classList.add('kl-running');
    paint();
    tick();
    focusView();
  }

  // focus mode: the keyboard and the run panel together on screen — page
  // controls fold away (CSS .kl-running) and the keyboard card lands right
  // under the top bar
  function focusView() {
    var kc = document.querySelector('#pn-stage');
    kc = kc && kc.closest('.card');
    if (!kc) return;
    if (App.showBar) App.showBar();
    var bar = document.querySelector('.topbar'), bh = bar ? bar.offsetHeight : 0; // layout height: the bar may still be sliding in
    var y = kc.getBoundingClientRect().top + window.pageYOffset - Math.max(0, bh) - 8;
    try { window.scrollTo({ top: Math.max(0, y) }); } catch (e) { window.scrollTo(0, Math.max(0, y)); }
  }

  // infinite mode: the next note of the endless loop (tempo can rise per loop)
  function genTarget() {
    var I = R.inf, pos = I.k % R.one.length;
    if (pos === 0 && I.k > 0) {
      I.loop++;
      if (I.speedup && !I.dirty[I.loop - 1] && I.bpm < I.bpm0 + 60) {
        I.bpm += 4;
        R.beat = 60 / I.bpm;
        R.spn = R.beat / R.rate;
      }
    }
    var pi = R.one[pos], tg = { i: I.k, midi: R.path[pi].midi, pc: Theory.mod12(R.path[pi].midi), f: R.fing[pi] || 0,
      at: I.nextAt, j: null, err: 0, loop: I.loop };
    R.targets.push(tg);
    if (I.k % R.rate === 0) { // on the beat: the click, accented every 4
      var bn = I.k / R.rate;
      click(R.ctx, tg.at, bn % 4 === 0);
      I.beats.push({ at: tg.at, n: 4 + bn });
      if (I.beats.length > 8) I.beats.shift();
    }
    I.k++;
    I.nextAt += R.spn;
  }

  function breakStreak(loop) {
    var I = R.inf;
    if (I.streak >= 5) I.broke = I.streak;
    I.streak = 0;
    I.dirty[loop] = true;
  }

  function tick() {
    if (!R) return;
    measure(R);
    var now = R.ctx.currentTime, heard = now - R.lat, lastAt;
    if (R.inf) {
      var I = R.inf;
      while (R.clickT < now + 0.12 && R.beatN < 4) { // the count-in bar
        if (R.clickT >= now - 0.01) click(R.ctx, R.clickT, R.beatN === 0);
        R.clickT += R.beat;
        R.beatN++;
      }
      if (I.nextAt < now - 0.05) I.nextAt = now + 0.05; // a stall: pick up again, never past-dated
      while (I.nextAt < now + 0.6) genTarget();
      lastAt = Infinity;
      // done targets fall away so the list stays short
      if (R.targets.length > 64) R.targets = R.targets.filter(function (t) { return !t.j || t.at > heard - 2; });
      // nobody playing for a while ends the run
      if (heard > Math.max(I.lastInput, R.first) + Math.max(8, R.one.length * R.spn * 2)) { finish(); return; }
    } else {
      // the click: every beat from the count-in to the last note; never past-dated
      while (R.clickT < now - 0.01) { R.clickT += R.beat; R.beatN++; }
      lastAt = R.targets[R.targets.length - 1].at;
      while (R.clickT < now + 0.12 && R.clickT <= lastAt + 0.001) { click(R.ctx, R.clickT, R.beatN % 4 === 0); R.clickT += R.beat; R.beatN++; }
    }
    // misses: the beat went by without the note
    if (!R.demo) {
      R.targets.forEach(function (tg) {
        if (!tg.j && heard > tg.at + accept() + 0.02) {
          tg.j = 'miss';
          R.lastHit = { j: 'miss', i: tg.i };
          if (R.inf) { R.inf.miss++; breakStreak(tg.loop); }
          paintHud();
        }
      });
    }
    // the note to play now (ring + LEDs follow the Help level)
    var cur = -1;
    for (var i = 0; i < R.targets.length; i++) {
      var tg = R.targets[i];
      if (!tg.j && tg.at > heard - accept()) { cur = i; break; }
      if (R.demo && tg.at > heard - R.spn * 0.5) { cur = i; break; }
    }
    var cd = heard < R.first ? Math.ceil((R.first - heard) / R.beat) : 0;
    if (cd !== R.cd) { R.cd = cd; paintHud(); }
    if (cur !== R.shown) {
      R.shown = cur;
      var a = R.targets[cur], b = R.targets[cur + 1];
      if (a) K().ring(a.midi, b ? b.midi : null); else K().clearRing();
      paintHud();
    }
    paintBeat(now);
    if (!R.inf && heard > lastAt + accept() + 0.3) finish();
  }

  // a note counts for a target within this much of its beat (tighter at speed)
  function accept() { return R ? Math.min(0.25, R.spn * 0.6) : 0.25; }

  function judge(midi, src) {
    if (!R || R.demo) return;
    var t = R.ctx.currentTime - cal(src) / 1000 - R.lat;
    if (t < R.first - R.spn * 0.6) return; // count-in noodling isn't judged
    measure(R);R.xpActivity=Date.now();
    var pc = Theory.mod12(midi), best = null, bd = 1e9;
    R.targets.forEach(function (tg) {
      if (tg.j || tg.pc !== pc) return;
      var d = Math.abs(t - tg.at);
      if (d < bd) { bd = d; best = tg; }
    });
    if (best && bd <= accept()) {
      var ms = (t - best.at) * 1000, am = Math.abs(ms);
      best.err = ms;
      best.j = am <= WIN.perfect ? 'perfect' : am <= WIN.great ? 'great' : am <= WIN.good ? 'good' : 'off';
      R.lastHit = { j: best.j, ms: ms, i: best.i };
      K().flash(midi, am <= WIN.great ? 'ok' : 'meh');
      if (R.inf) {
        var I = R.inf;
        I.hits++;
        I.lastInput = t;
        I.errs.push(ms);
        if (I.errs.length > 600) I.errs.shift();
        if (best.j === 'off') breakStreak(best.loop);
        else { I.streak++; if (I.streak > I.best) I.best = I.streak; }
      }
    } else {
      R.wrong++;
      R.lastHit = { j: 'wrong', midi: midi };
      K().flash(midi, 'bad');
      if (R.inf) { var c = R.targets[R.shown]; R.inf.lastInput = t; breakStreak(c ? c.loop : R.inf.loop); }
    }
    paintHud();
  }

  function stats(r) {
    var tg = r.targets, total = tg.length, hits = tg.filter(function (x) { return x.j && x.j !== 'miss'; });
    var errs = hits.map(function (x) { return x.err; });
    var mean = errs.length ? errs.reduce(function (a, b) { return a + b; }, 0) / errs.length : 0;
    var meanAbs = errs.length ? errs.reduce(function (a, b) { return a + Math.abs(b); }, 0) / errs.length : 0;
    var sd = errs.length > 1 ? Math.sqrt(errs.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (errs.length - 1)) : 0;
    var q = errs.length ? errs.reduce(function (a, b) { return a + Math.max(0, 1 - Math.abs(b) / 150); }, 0) / errs.length : 0;
    var acc = hits.length / (total + r.wrong);
    return { total: total, hits: hits.length, miss: total - hits.length, wrong: r.wrong, acc: acc, mean: mean, meanAbs: meanAbs, sd: sd,
      score: Math.round(100 * acc * (0.6 + 0.4 * q)) };
  }

  function finish() {
    var r = R;
    var credited=recordRun(r,'complete');
    stopAll(true);
    if (r.demo) { view = 'list'; paint(); return; }
    if (r.inf) { finishInfinite(r); return; }
    var st = stats(r), p = prog(r.l.id), stars = starsFor(st.score), pass = st.score >= 70;
    p.best[r.step] = Math.max(p.best[r.step] || 0, st.score);
    if (pass && r.step > p.passed) p.passed = r.step;
    var up = st.score >= 85 && r.step < STEPS.length - 1;
    if (up) p.step = r.step + 1;
    p.fails = pass ? 0 : p.fails + 1;
    var mastered = !p.mastered && pass && r.step >= MASTER_STEP && r.help <= MASTER_HELP;
    if (mastered) p.mastered = true;
    p.runs.push({ instrument:r.instrument,sessionId:r.sessionId,d: App.xp ? App.xp.dayKey() : '', st: r.step, h: r.help, acc: Math.round(st.acc * 100), t: Math.round(st.meanAbs),
      m: Math.round(st.mean), sd: Math.round(st.sd), sc: st.score });
    if (p.runs.length > 40) p.runs = p.runs.slice(-40);
    saveProg(r.l.id, p);
    var fin = credited;
    last = { r: r, st: st, stars: stars, pass: pass, up: up, mastered: mastered, fin: fin, p: p };
    view = 'done';
    paint();
  }

  function finishInfinite(r) {
    var I = r.inf, errs = I.errs, n = errs.length, p = prog(r.l.id), key = String(r.step);
    var mean = n ? errs.reduce(function (a, b) { return a + b; }, 0) / n : 0;
    var meanAbs = n ? errs.reduce(function (a, b) { return a + Math.abs(b); }, 0) / n : 0;
    var sd = n > 1 ? Math.sqrt(errs.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (n - 1)) : 0;
    var judged = I.hits + I.miss, acc = judged + r.wrong ? I.hits / (judged + r.wrong) : 0;
    var old = p.inf[key] || 0, isBest = I.best > old;
    if (isBest) p.inf[key] = I.best;
    p.runs.push({ instrument:r.instrument,sessionId:r.sessionId,d: App.xp ? App.xp.dayKey() : '', st: r.step, h: r.help, acc: Math.round(acc * 100), t: Math.round(meanAbs),
      m: Math.round(mean), sd: Math.round(sd), inf: I.best, bpm: I.bpm });
    if (p.runs.length > 40) p.runs = p.runs.slice(-40);
    saveProg(r.l.id, p);
    var fin = recordRun(r,'complete');
    last = { r: r, inf: { best: I.best, old: old, isBest: isBest, acc: acc, meanAbs: meanAbs, mean: mean, sd: sd, bpm: I.bpm,
      loops: Math.floor(I.hits / r.one.length), notes: judged, wrong: r.wrong }, fin: fin, p: p };
    view = 'done';
    paint();
  }

  // stop the run (and the click) without scoring
  function stopAll(quiet) {
    if (!R) return;
    recordRun(R,'stopped');
    clearInterval(R.timer);
    App.wake.release('kl-run');
    document.documentElement.classList.remove('kl-running');
    var k = K();
    if (k) k.clearRing();
    R = null;
    if (!quiet) { view = 'list'; paint(); }
  }

  // ---------------- views ----------------

  function paint() {
    if (!root) return;
    if (view === 'run' && R) root.innerHTML = card(runHTML());
    else if (view === 'done' && last) root.innerHTML = card(doneHTML());
    else { view = 'list'; root.innerHTML = card(listHTML()); }
    if (view === 'run') paintHud();
    if (view === 'done') drawStrip();
  }

  function card(inner) {
    return '<div class="card kl-card"><div class="kl-head"><h2>Scale lessons</h2>' +
      '<span class="muted small">Credit: ' + esc(creditInstrument()) + '. Shared keyboard course. Play along with the click. Right notes on the beat level you up.</span></div>' + inner + '</div>';
  }

  function lessonLine(l) { return (l.oct === 2 ? '2 octaves' : '1 octave') + ' · up and down' + (l.pat === 'i3' ? ' in 3rds' : ''); }

  function listHTML() {
    var l = sel(), p = prog(l.id), tier = App.store.get('kl.tier', l.tier), help = K().assist();
    var best = p.best[p.step];
    var rows = LESSONS.filter(function (x) { return x.tier === tier; }).map(function (x) {
      var q = prog(x.id), b = q.best[q.step];
      return '<button type="button" class="kl-row' + (x.id === l.id ? ' on' : '') + '" data-kl="' + x.id + '" aria-pressed="' + (x.id === l.id) + '">' +
        '<span class="kl-rname">' + esc(x.name) + '<small>' + handName(x.hand) + '</small></span>' +
        (q.mastered ? '<span class="kl-badge">Mastered</span>' : '') +
        '<span class="kl-rlv">Level ' + (q.step + 1) + '</span>' +
        '<span class="kl-rstars" aria-label="' + starsFor(b || 0) + ' of 3 stars">' + (b != null ? star(starsFor(b)) : '') + '</span></button>';
    }).join('');
    var recent = p.runs.slice(-6).reverse();
    return '<div class="kl-sel">' +
        '<div class="kl-title"><b>' + esc(l.name) + ' · ' + handName(l.hand) + '</b><span class="muted small">' + lessonLine(l) + '</span></div>' +
        '<div class="kl-level">' +
          '<button type="button" class="btn sm" data-klstep="-1" aria-label="Easier"' + (p.step === 0 ? ' disabled' : '') + '>' + App.icon('minus', 13) + '</button>' +
          '<span><b>Level ' + (p.step + 1) + '</b> of ' + STEPS.length + ' · ' + stepName(p.step) + (best != null ? ' · best ' + best : '') + '</span>' +
          '<button type="button" class="btn sm" data-klstep="1" aria-label="Harder"' + (p.step >= STEPS.length - 1 ? ' disabled' : '') + '>' + App.icon('plus', 13) + '</button>' +
        '</div>' +
        '<div class="kl-mastery" title="Levels passed"><span class="kl-mbar"><i style="width:' + Math.round(100 * (p.passed + 1) / STEPS.length) + '%"></i></span>' +
          '<span class="muted small">' + (p.passed + 1) + ' of ' + STEPS.length + ' levels passed' + (p.mastered ? ' · mastered' : '') + '</span></div>' +
        '<div class="kl-opts"><div class="seg" role="group" aria-label="Times through">' +
          [1, 2, 4, 0].map(function (n) {
            return '<button type="button" data-klreps="' + n + '" class="' + (reps() === n ? 'active' : '') + '"' + (n ? '' : ' aria-label="Infinite" title="Infinite: loop until you stop, go for a streak"') + '>' + (n ? n + '×' : '∞') + '</button>';
          }).join('') +
          '</div>' + (reps() === 0 ? '<button type="button" class="chip fb-chip' + (speedup() ? ' active' : '') + '" id="kl-speedup" aria-pressed="' + speedup() + '" title="Every loop without a mistake adds 4 bpm">Speed up</button>' : '') +
          '<button type="button" class="kl-helpbtn" id="kl-help">Help: ' + K().ASSIST_NAMES[help] + '</button></div>' +
        (reps() === 0 ? '<p class="kl-infnote">Infinite: the scale loops until you stop. Right notes on the beat build your streak; a wrong, late or missed note starts it over.' +
          (p.inf[p.step] ? ' <b>Best streak at this level: ' + p.inf[p.step] + '</b>' : '') + '</p>' : '') +
        '<div class="kl-acts"><button type="button" class="btn primary" id="kl-start">' + App.icon('play', 13) + ' Start</button>' +
          '<button type="button" class="btn" id="kl-listen">Listen first</button></div>' +
        '<div class="kl-ctl">' +
          '<button type="button" class="chip fb-chip' + (lumiDisplay() ? ' active' : '') + '" id="kl-disp" aria-pressed="' + lumiDisplay() + '" title="Legacy guide focus; pitch colors are shared, LUMI Display master is in the clef menu">Guide focus</button>' +
          '<button type="button" class="chip fb-chip' + (dblOn() ? ' active' : '') + '" id="kl-dbltap" aria-pressed="' + dblOn() + '" title="Start and stop with a double-tap">Double-tap</button>' +
          (dblOn() ? '<span class="muted small">Double-tap <b>' + ctrlName() + '</b> (your keyboard’s lowest key) or this card to start; again to stop.</span>' : '') +
        '</div>' +
        (recent.length ? '<details class="kl-hist"><summary>Your runs (' + p.runs.length + ')</summary><div class="kl-tblwrap"><table class="kl-table"><thead><tr><th>Day</th><th>Level</th><th>Help</th><th>Notes</th><th>Timing</th><th>Score</th></tr></thead><tbody>' +
          recent.map(function (u) {
            return '<tr><td>' + esc((u.d || '').slice(5)) + '</td><td>' + (u.st + 1) + '</td><td>' + K().ASSIST_NAMES[u.h] + '</td><td>' + u.acc + '%</td><td>±' + u.t + ' ms</td><td>' + (u.inf != null ? '∞ streak ' + u.inf : u.sc) + '</td></tr>';
          }).join('') + '</tbody></table></div></details>' : '') +
      '</div>' +
      '<div class="seg kl-tiers" role="tablist">' + TIERS.map(function (t) {
        return '<button type="button" role="tab" data-kltier="' + t[0] + '" class="' + (t[0] === tier ? 'active' : '') + '" aria-selected="' + (t[0] === tier) + '">' + t[1] + '</button>';
      }).join('') + '</div>' +
      '<div class="kl-list">' + rows + '</div>';
  }

  function runHTML() {
    return '<div class="kl-run">' +
      '<div class="kl-runrow"><div class="kl-runtop"><b>' + esc(R.l.name) + ' · ' + handName(R.l.hand) + '</b><span class="muted small">' + (R.demo ? 'Listening · ' : 'Level ' + (R.step + 1) + ' · ') + stepName(R.step) + (R.inf ? ' · Infinite' : '') + '</span></div>' +
        '<button type="button" class="btn sm" id="kl-stop">' + (R.inf ? 'End run' : 'Stop') + '</button></div>' +
      (dblOn() ? '<div class="kl-taphint muted small">Double-tap ' + ctrlName() + ' to ' + (R.inf ? 'end the run' : 'stop') + '</div>' : '') +
      '<div class="kl-beats" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +
      '<div class="kl-call" id="kl-call" aria-live="polite"></div>' +
      '<div class="kl-needle" aria-hidden="true"><span class="kl-zone"></span><span class="kl-mid"></span><i id="kl-mark"></i>' +
        '<em class="l">early</em><em class="r">late</em></div>' +
      (R.inf ? '<div class="kl-streak"><b id="kl-streakn">0</b><span class="kl-inftx"><span id="kl-streakl">streak</span><span id="kl-count"></span></span></div></div>'
        : '<div class="kl-bar" aria-hidden="true"><i id="kl-prog"></i></div><div class="kl-count muted small" id="kl-count"></div></div>');
  }

  function paintHud() {
    if (!R || view !== 'run') return;
    var call = el('kl-call'), mark = el('kl-mark'), bar = el('kl-prog'), cnt = el('kl-count');
    if (!call) return;
    var heard = R.ctx.currentTime - R.lat, h = R.lastHit;
    if (heard < R.first - 0.05) {
      var left = Math.max(1, Math.ceil((R.first - heard) / R.beat));
      call.className = 'kl-call cd';
      call.textContent = R.demo ? 'Listen…' : String(Math.min(4, left));
    } else if (R.demo) {
      call.className = 'kl-call';
      call.textContent = 'Listen';
    } else if (h) {
      call.className = 'kl-call ' + h.j;
      call.textContent = h.j === 'wrong' ? 'Wrong note' : h.j === 'miss' ? 'Missed'
        : h.j === 'perfect' ? 'Perfect' : Math.round(Math.abs(h.ms)) + ' ms ' + (h.ms < 0 ? 'early' : 'late');
      if (mark && h.ms != null) { mark.style.left = (50 + Math.max(-50, Math.min(50, h.ms / 3))) + '%'; mark.style.opacity = '1'; }
    } else {
      call.className = 'kl-call';
      call.textContent = 'Play';
    }
    if (R.inf) {
      var I = R.inf, sn = el('kl-streakn'), sl = el('kl-streakl'), rec = prog(R.l.id).inf[R.step] || 0;
      if (sn) { sn.textContent = I.streak; sn.parentNode.classList.toggle('rec', I.streak > rec && I.streak > 0); }
      if (sl) sl.textContent = I.streak > rec && rec > 0 ? 'streak · new record!' : 'streak · best ' + Math.max(rec, I.best);
      if (h && (h.j === 'wrong' || h.j === 'miss' || h.j === 'off') && I.broke) { call.textContent = 'Streak broken at ' + I.broke; I.broke = 0; }
      if (cnt) cnt.textContent = 'Loop ' + (I.loop + 1) + ' · ' + I.bpm + ' bpm' + (R.wrong ? ' · ' + R.wrong + ' wrong' : '');
      return;
    }
    var done = R.targets.filter(function (x) { return x.j; }).length;
    if (bar) bar.style.width = (100 * (R.demo ? Math.max(0, R.shown) : done) / R.targets.length) + '%';
    if (cnt && !R.demo) cnt.textContent = R.targets.filter(function (x) { return x.j && x.j !== 'miss'; }).length + ' of ' + R.targets.length + ' notes' + (R.wrong ? ' · ' + R.wrong + ' wrong' : '');
  }

  function paintBeat(now) {
    var dots = root && root.querySelectorAll('.kl-beats i');
    if (!dots || !dots.length) return;
    var heard = now - R.lat, n = Math.floor((heard - R.t0) / R.beat), at = R.t0 + n * R.beat;
    if (R.inf && heard >= R.first - 0.01) {
      var bt = null;
      R.inf.beats.forEach(function (b) { if (b.at <= heard) bt = b; });
      n = bt ? bt.n : -1;
      at = bt ? bt.at : -1;
    }
    var on = n >= 0 && heard >= R.t0 && heard - at < Math.min(0.12, R.beat * 0.5);
    for (var i = 0; i < 4; i++) dots[i].className = on && ((n % 4) + 4) % 4 === i ? (i === 0 ? 'on acc' : 'on') : '';
  }

  function doneHTML() {
    if (last.inf) return doneInfHTML();
    var s = last.st, r = last.r, p = last.p, f = last.fin || {};
    var tend = Math.abs(s.mean) < 10 ? 'Centered' : s.mean < 0 ? 'Rushing' : 'Dragging';
    var notes = [];
    if (last.mastered) notes.push('Mastered: ' + r.l.name + ', ' + handName(r.l.hand).toLowerCase() + '.');
    if (last.up) notes.push('Level up. Next run: ' + stepName(p.step) + '.');
    else if (last.pass) notes.push('Passed. Score 85 or more to level up.');
    else notes.push('Score 70 to pass this level.');
    if (s.wrong) notes.push(s.wrong + ' wrong note' + (s.wrong > 1 ? 's' : '') + (s.miss ? ', ' + s.miss + ' missed' : '') + '.');
    else if (s.miss) notes.push(s.miss + ' missed note' + (s.miss > 1 ? 's' : '') + '.');
    if (Math.abs(s.mean) >= 15) notes.push(s.mean < 0 ? 'You ran ahead of the click by ' + Math.round(-s.mean) + ' ms on average. Wait for it.' : 'You trailed the click by ' + Math.round(s.mean) + ' ms on average. Lean into the beat.');
    if (f.extended && f.streak) notes.push(f.streak === 1 ? 'Day 1 of a new streak.' : f.streak + '-day streak.');
    if (last.stars === 3 && r.help > 0) notes.push('Clean. Try it with less help.');
    if (p.fails >= 2 && r.step > 0) notes.push('Two misses in a row: an easier level builds it back.');
    return '<div class="kl-done">' +
      '<div class="kl-runtop"><b>' + esc(r.l.name) + ' · ' + handName(r.l.hand) + '</b><span class="muted small">Level ' + (r.step + 1) + ' · ' + stepName(r.step) + ' · Help: ' + K().ASSIST_NAMES[r.help] + '</span></div>' +
      '<div class="kl-score"><span class="kl-big">' + s.score + '</span><span class="kl-stars" aria-label="' + last.stars + ' of 3 stars">' + star(last.stars) + '</span></div>' +
      '<div class="kl-tiles">' +
        tile('Notes', Math.round(s.acc * 100) + '%', s.hits + ' of ' + s.total + ' right') +
        tile('Timing', '±' + Math.round(s.meanAbs) + ' ms', 'average from the beat') +
        tile('Steadiness', '±' + Math.round(s.sd) + ' ms', 'lower is smoother') +
        tile('Tendency', tend, Math.abs(s.mean) < 10 ? 'on the click' : Math.round(Math.abs(s.mean)) + ' ms ' + (s.mean < 0 ? 'early' : 'late')) +
      '</div>' +
      '<div class="kl-strip" id="kl-strip" role="img" aria-label="Timing of each note against the beat"></div>' +
      '<ul class="kl-notes">' + notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' +
      '<div class="kl-acts"><button type="button" class="btn primary" id="kl-start">' + (last.up ? 'Next level' : 'Again') + '</button>' +
        (r.step > 0 && !last.pass ? '<button type="button" class="btn" data-klstep="-1">Easier</button>' : '') +
        (last.stars === 3 && r.help > 0 ? '<button type="button" class="btn" id="kl-lesshelp">Less help</button>' : '') +
        '<button type="button" class="btn" id="kl-back">Lessons</button></div>' +
      '</div>';
  }

  function doneInfHTML() {
    var x = last.inf, r = last.r, f = last.fin || {};
    var tend = Math.abs(x.mean) < 10 ? 'Centered' : x.mean < 0 ? 'Rushing' : 'Dragging';
    var notes = [];
    if (x.loops) notes.push(x.loops + ' full loop' + (x.loops > 1 ? 's' : '') + ' of right notes' + (x.bpm > r.inf.bpm0 ? ', sped up to ' + x.bpm + ' bpm' : '') + '.');
    if (x.wrong) notes.push(x.wrong + ' wrong note' + (x.wrong > 1 ? 's' : '') + '.');
    if (Math.abs(x.mean) >= 15) notes.push(x.mean < 0 ? 'You ran ahead of the click by ' + Math.round(-x.mean) + ' ms on average.' : 'You trailed the click by ' + Math.round(x.mean) + ' ms on average.');
    if (f.extended && f.streak) notes.push(f.streak === 1 ? 'Day 1 of a new streak.' : f.streak + '-day streak.');
    return '<div class="kl-done">' +
      '<div class="kl-runtop"><b>' + esc(r.l.name) + ' · ' + handName(r.l.hand) + '</b><span class="muted small">Infinite · Level ' + (r.step + 1) + ' · ' + stepName(r.step) + ' · Help: ' + K().ASSIST_NAMES[r.help] + '</span></div>' +
      '<div class="kl-score"><span class="kl-big">' + x.best + '</span><span class="kl-inflab">in a row</span></div>' +
      '<div class="kl-verdict">' + (x.isBest ? (x.old ? 'New record! Your best was ' + x.old + '.' : 'First record set.') : 'Your record at this level: ' + x.old + '.') + '</div>' +
      '<div class="kl-tiles">' +
        tile('Notes', Math.round(x.acc * 100) + '%', x.notes + ' played') +
        tile('Timing', '±' + Math.round(x.meanAbs) + ' ms', 'average from the beat') +
        tile('Steadiness', '±' + Math.round(x.sd) + ' ms', tend.toLowerCase()) +
        tile('Top tempo', x.bpm + ' bpm', RATE_NAME[r.rate].toLowerCase()) +
      '</div>' +
      '<ul class="kl-notes">' + notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' +
      '<div class="kl-acts"><button type="button" class="btn primary" id="kl-start">Go again</button>' +
        '<button type="button" class="btn" id="kl-back">Lessons</button></div>' +
      '</div>';
  }

  function tile(lab, val, sub) {
    return '<div class="kl-tile"><span>' + lab + '</span><b>' + esc(val) + '</b><small>' + esc(sub) + '</small></div>';
  }

  // each note's offset from its beat: late above the line, early below; the
  // band is the perfect window. Misses sit on the line as hollow rings.
  function drawStrip() {
    var box = el('kl-strip');
    if (!box || !last) return;
    var tg = last.r.targets, W = Math.max(260, box.clientWidth), H = 120, L = 46, Rr = 8, T = 10, B = 18;
    var pw = W - L - Rr, ph = H - T - B, mid = T + ph / 2, lim = 150;
    var y = function (ms) { return mid - (Math.max(-lim, Math.min(lim, ms)) / lim) * (ph / 2); };
    var x = function (i) { return L + (tg.length > 1 ? (i / (tg.length - 1)) * pw : pw / 2); };
    var s = '<rect class="kl-band" x="' + L + '" y="' + y(WIN.perfect).toFixed(1) + '" width="' + pw + '" height="' + (y(-WIN.perfect) - y(WIN.perfect)).toFixed(1) + '"/>' +
      '<line class="kl-axis0" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + mid + '" y2="' + mid + '"/>' +
      '<text class="kl-ax" x="' + (L - 6) + '" y="' + (y(100) + 4).toFixed(1) + '" text-anchor="end">+100</text>' +
      '<text class="kl-ax" x="' + (L - 6) + '" y="' + (mid + 4) + '" text-anchor="end">beat</text>' +
      '<text class="kl-ax" x="' + (L - 6) + '" y="' + (y(-100) + 4).toFixed(1) + '" text-anchor="end">−100</text>' +
      '<text class="kl-ax" x="' + L + '" y="' + (H - 4) + '">note 1</text>' +
      '<text class="kl-ax" x="' + (W - Rr) + '" y="' + (H - 4) + '" text-anchor="end">note ' + tg.length + '</text>';
    tg.forEach(function (t) {
      if (t.j === 'miss' || !t.j) s += '<circle class="kl-miss" cx="' + x(t.i).toFixed(1) + '" cy="' + mid + '" r="4"><title>Note ' + (t.i + 1) + ': missed</title></circle>';
      else s += '<circle class="kl-dot" cx="' + x(t.i).toFixed(1) + '" cy="' + y(t.err).toFixed(1) + '" r="4"><title>Note ' + (t.i + 1) + ': ' +
        Math.round(Math.abs(t.err)) + ' ms ' + (t.err < 0 ? 'early' : 'late') + '</title></circle>';
    });
    box.innerHTML = '<svg width="' + W + '" height="' + H + '">' + s + '</svg>' +
      '<details class="kl-hist"><summary>Show as a table</summary><div class="kl-tblwrap"><table class="kl-table"><thead><tr><th>Note</th><th>Key</th><th>Finger</th><th>Offset</th></tr></thead><tbody>' +
      tg.map(function (t) {
        return '<tr><td>' + (t.i + 1) + '</td><td>' + Theory.midiName(t.midi, Theory.FLAT_KEYS.has(last.r.l.root)) + '</td><td>' + (t.f || '–') + '</td><td>' +
          (t.j === 'miss' || !t.j ? 'missed' : (t.err < 0 ? '−' : '+') + Math.round(Math.abs(t.err)) + ' ms') + '</td></tr>';
      }).join('') + '</tbody></table></div></details>';
  }

  // ---------------- wiring ----------------

  function onClick(e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b || b.disabled) return;
    var a;
    if ((a = b.getAttribute('data-kl'))) { App.store.set('kl.sel', a); paint(); return; }
    if ((a = b.getAttribute('data-kltier'))) { App.store.set('kl.tier', a); paint(); return; }
    if ((a = b.getAttribute('data-klreps'))) { App.store.set('kl.reps', +a); paint(); return; }
    if ((a = b.getAttribute('data-klstep'))) {
      var l = sel(), p = prog(l.id);
      p.step = Math.max(0, Math.min(STEPS.length - 1, p.step + (+a)));
      p.fails = 0;
      saveProg(l.id, p);
      view = 'list';
      paint();
      return;
    }
    switch (b.id) {
      case 'kl-start': start(false); break;
      case 'kl-listen': start(true); break;
      case 'kl-stop': if (R && R.inf) finish(); else stopAll(false); break;
      case 'kl-speedup': App.store.set('kl.speedup', !speedup()); paint(); break;
      case 'kl-dbltap': App.store.set('kl.dbltap', !dblOn()); paint(); break;
      case 'kl-disp': if (App.midi && App.midi.setDisplay) App.midi.setDisplay(!lumiDisplay()); paint(); break;
      case 'kl-back': view = 'list'; paint(); break;
      case 'kl-help': App.switchTo('lights'); break;
      case 'kl-lesshelp': K().setAssist(Math.max(0, K().assist() - 1)); view = 'list'; paint(); break;
    }
  }

  var CSS =
    '.kl-card{margin-top:14px}' +
    '.kl-head{display:grid;gap:4px;margin-bottom:12px}.kl-card .kl-head h2{margin:0}' + // the global .card h2 (Bebas + amber dot)
    '.kl-sel,.kl-run,.kl-done{display:grid;gap:12px;padding:14px;border-radius:12px;background:var(--card2)}' +
    '.kl-title,.kl-runtop{display:grid;gap:2px}.kl-title b,.kl-runtop b{font-size:16px}' +
        // '- Level n of 10 +' stays ONE control (no full-width gap on desktop)
    '.kl-level{display:grid;grid-template-columns:auto minmax(0,max-content) auto;justify-content:start;align-items:center;gap:10px}.kl-level span{font-size:14px}' +
    // focus mode while a run plays: keyboard + run panel only
    '.kl-running #panel-piano .row.spread>span.row,.kl-running #pn-perf,.kl-running #pn-qwpanel,.kl-running .pn-practice,' +
      '.kl-running #pn-legend,.kl-running .pn-foot,.kl-running .kl-head{display:none!important}' +
    '.kl-running .kl-card{margin-top:10px}' +
    '.kl-mastery{display:grid;gap:4px}.kl-mbar{display:block;height:6px;border-radius:3px;background:var(--line);overflow:hidden}.kl-mbar i{display:block;height:100%;background:var(--accent);border-radius:3px}' +
    '.kl-opts{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap}' +
    '.kl-acts{display:flex;gap:8px;flex-wrap:wrap}' +
    '.kl-tiers{display:flex;width:100%;max-width:560px;margin:14px 0 8px}.kl-tiers button{flex:1}' +
    '.kl-list{display:grid;gap:6px}' +
    '@media (min-width:900px){.kl-list{grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px}}' +
    '.kl-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--text);font:inherit;text-align:left;cursor:pointer}' +
    '.kl-row.on{border-color:var(--accent);background:var(--accent-soft)}' +
    '.kl-rname{display:grid;font-weight:600;font-size:14.5px}.kl-rname small{font-weight:500;color:var(--muted);font-size:12.5px}' +
    '.kl-rlv{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}.kl-rstars{color:var(--accent);letter-spacing:1px;min-width:3.2em;text-align:right}' +
    '.kl-badge{font-size:11px;font-weight:600;letter-spacing:.6px;text-transform:uppercase;padding:2px 7px;border-radius:6px;background:var(--accent);color:#221302}' +
    '.kl-helpbtn{border:0;background:transparent;color:var(--muted);font:inherit;font-size:13px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;padding:4px 0}' +
    '.kl-hist summary{cursor:pointer;font-size:13.5px;color:var(--muted);font-weight:600}' +
    '.kl-tblwrap{overflow-x:auto}.kl-table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums;margin-top:6px}' +
    '.kl-table th,.kl-table td{padding:6px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}.kl-table th{color:var(--muted);font-weight:600;font-size:12px}' +
    '.kl-beats{display:flex;gap:10px;justify-content:center}.kl-beats i{width:14px;height:14px;border-radius:50%;background:var(--line);transition:background .06s}' +
    '.kl-beats i.on{background:var(--accent)}.kl-beats i.on.acc{box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 35%,transparent)}' +
    '.kl-call{text-align:center;font:400 34px/1.1 var(--font-display);letter-spacing:1px;min-height:38px;text-transform:uppercase}' +
    '.kl-call.cd{font-size:52px;color:var(--accent)}.kl-call.perfect,.kl-call.great{color:var(--teal)}.kl-call.good,.kl-call.off{color:#ffd166}.kl-call.wrong,.kl-call.miss{color:var(--red)}' +
    // light theme: the pale yellow call is unreadable on a light card
    ':root[data-theme="light"] .kl-call.good,:root[data-theme="light"] .kl-call.off{color:var(--warn)}' +
    '.kl-needle{position:relative;height:30px;border-radius:8px;background:var(--card);border:1px solid var(--line)}' +
    '.kl-zone{position:absolute;top:0;bottom:0;left:calc(50% - 11.7%);width:23.4%;background:color-mix(in srgb,#4cc9b0 18%,transparent)}' +
    '.kl-mid{position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:var(--muted)}' +
    '.kl-needle i{position:absolute;top:4px;bottom:4px;width:6px;margin-left:-3px;border-radius:3px;background:var(--accent);opacity:0;left:50%;transition:left .12s ease}' +
    '.kl-needle em{position:absolute;bottom:-18px;font-style:normal;font-size:11px;color:var(--muted)}.kl-needle em.l{left:0}.kl-needle em.r{right:0}' +
    '.kl-bar{height:6px;border-radius:3px;background:var(--line);overflow:hidden;margin-top:14px}.kl-bar i{display:block;height:100%;width:0;background:var(--accent);transition:width .15s}' +
    '.kl-runrow{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}' +
    '.kl-score{display:flex;align-items:baseline;gap:14px}.kl-big{font:400 64px/1 var(--font-display)}.kl-stars{font-size:26px;color:var(--accent);letter-spacing:2px}' +
    '.kl-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(140px,45%),1fr));gap:8px}' +
    '.kl-tile{display:grid;gap:2px;padding:10px 12px;border-radius:10px;background:var(--card)}.kl-tile span{font-size:12.5px;color:var(--muted)}.kl-tile b{font-size:19px;font-variant-numeric:tabular-nums}.kl-tile small{font-size:12px;color:var(--muted)}' +
    '.kl-strip svg{display:block}.kl-band{fill:color-mix(in srgb,#4cc9b0 16%,transparent)}.kl-axis0{stroke:var(--muted);stroke-width:1}' +
    '.kl-ax{font:500 11px var(--font-body);fill:var(--muted)}.kl-dot{fill:var(--accent);stroke:var(--card2);stroke-width:2}.kl-miss{fill:none;stroke:var(--muted);stroke-width:1.5}' +
    '.kl-notes{margin:0;padding-left:18px;display:grid;gap:4px;font-size:14px}' +
    '.kl-infnote{margin:0;font-size:13.5px;color:var(--muted)}.kl-infnote b{color:var(--text);font-weight:600}' +
    '.kl-streak{display:flex;align-items:center;justify-content:center;gap:12px}.kl-inftx{display:grid;gap:2px}.kl-streak b{font:400 56px/1 var(--font-display);font-variant-numeric:tabular-nums}' +
    '.kl-streak span{font-size:14px;color:var(--muted)}.kl-streak.rec b{color:var(--accent)}' +
    '.kl-ctl{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}.kl-taphint{text-align:center;margin:-4px 0 4px}' +
    '.kl-inflab{font:400 24px/1 var(--font-display);letter-spacing:1px;text-transform:uppercase;color:var(--muted)}.kl-verdict{font-weight:600}' +
    '@media (max-width:640px){.kl-row{grid-template-columns:minmax(0,1fr) auto auto}.kl-rlv{display:none}.kl-big{font-size:52px}' +
      '.kl-run{gap:8px;padding:12px}.kl-streak b{font-size:44px}.kl-call{font-size:28px;min-height:32px}.kl-call.cd{font-size:40px}.kl-bar{margin-top:10px}}';

  App.keysLessons = {
    init: function (box) {
      root = box;
      App.injectCSS('keylessons', CSS);
      box.addEventListener('click', onClick);
      App.on('midi:note', function (d) {
        if (!d || !d.on) return;
        var dbl = !d.silent && isDoubleTap(d.midi);
        if (R) {
          if (R.demo) { if (dbl) stopAll(false); return; }
          var wrong0 = R.wrong, hit0 = R.lastHit;
          judge(d.midi, d.silent ? 'audio' : 'midi');
          // stop only when the 2nd strike wasn't a right note of the lesson
          if (dbl && R && (R.wrong > wrong0 || R.lastHit === hit0)) tapControl();
          return;
        }
        if (dbl && onKeysPage() && root) tapControl();
      });
      // touch: double-tap empty space on the lesson card
      var lastPt = { at: 0, x: 0, y: 0 };
      box.addEventListener('pointerup', function (e) {
        if (!dblOn()) return;
        if (e.target.closest && e.target.closest('button,input,select,textarea,a,label,summary,details,table')) { lastPt.at = 0; return; }
        var now = performance.now();
        if (now - lastPt.at <= 350 && Math.abs(e.clientX - lastPt.x) < 30 && Math.abs(e.clientY - lastPt.y) < 30) { lastPt.at = 0; tapControl(); }
        else lastPt = { at: now, x: e.clientX, y: e.clientY };
      });
      App.on('lights:display', function () { if (view === 'list') paint(); });
      App.on('midi:range', function () { if (view === 'list') paint(); });
      App.on('note:input', function (d) { if (d && d.on && R) judge(d.midi, d.src === 'touch' ? 'touch' : 'qwerty'); });
      App.on('transport:claim', function (d) { if (R && d && d.owner !== 'keys') stopAll(false); });
      App.on('sheet', function (d) { if (d && d.open && R) stopAll(false); });
      App.on('help:level', function () { if (view === 'list') paint(); });
      document.addEventListener('visibilitychange', function () { if (document.hidden) stopAll(false); });
      paint();
    },
    stop: function () { stopAll(false); entryInstrument=null; },
    // for the Exercises Progress tab: every lesson that has runs
    summary: function (instrument) {
      return LESSONS.map(function (l) {
        var p = prog(l.id), runs = instrument ? p.runs.filter(function (r) { return r.instrument === instrument; }) : p.runs;
        if (!runs.length) return null;
        var lastRun = runs[runs.length - 1];
        return { id: l.id, name: l.name, hand: handName(l.hand), level: p.step + 1, levels: STEPS.length, passed: p.passed + 1,
          mastered: p.mastered, curriculumShared: true, best: Math.max.apply(null, runs.map(function (u) { return u.sc || 0; })), runs: runs.length, last: lastRun.d, timing: lastRun.t,
          streak: Math.max.apply(null, [0].concat(runs.map(function (r) { return r.inf || 0; }))) };
      }).filter(Boolean).sort(function (a, b) { return a.last < b.last ? 1 : -1; });
    },
    open: function (id, instrument) { if (instrument==='piano'||instrument==='synth') {stopAll(true);entryInstrument=instrument;} if (BY_ID[id]) { App.store.set('kl.sel', id); App.store.set('kl.tier', BY_ID[id].tier); view = 'list'; paint(); } },
    // tests
    get run() { return R; },
    get view() { return view; },
    get last() { return last; },
    LESSONS: LESSONS, STEPS: STEPS, WIN: WIN,
    start: start, finish: function () { if (R) finish(); }, tick: tick,
    get controlKey() { return ctrlKey(); }, tapControl: tapControl
  };
})();
