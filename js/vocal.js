/* soundLAB VOICE page ('vocal', Train group pill "Voice", prefix vx-, store
 * vx.*) — part A of docs/VOCAL-TRAINER.md: SING & SEE.
 *
 * INPUT: the ONE shared live input (App.audioIn.hold('vocal') + tap) — the
 *   device picked in Settings. A UR24C arrives as one stereo input: LEFT =
 *   input 1 (guitar), RIGHT = input 2 (the Helix XLR = vocals). vx.ch picks
 *   'left' | 'right' | 'both' (default right) so the guitar is never scored as
 *   the voice; two little meters show which side moves. Nothing opens until
 *   Start listening is pressed (no permission prompt by itself); leaving the
 *   page, hiding the app or a foreign transport:claim stops everything.
 * PITCH: a ScriptProcessor (2048 in, stereo) feeds SLPitchDetector (NSDF)
 *   every 1024-sample hop on the chosen side -> frames {t, midi, clarity,
 *   rms, peak}. The live line scrolls on #vx-graph (last 8 s) over the
 *   target bars, green within 25 cents, yellow within 50, red past that.
 * TARGETS (vx.mode): 'free' (the notes you held are found afterwards), 'hold'
 *   (one note, vx.note, 4 beats), 'scale' (degrees 1-2-3-4-5-4-3-2-1 of the
 *   context bar's key/scale from octave vx.oct, one beat each at met.bpm,
 *   clamped 50-140). Scale/hold takes start with a one-bar count-in; the
 *   reference notes play with you (vx.ref 'on') or only before you start
 *   ('first' = hear the first note in the count-in).
 * HEAR MYSELF (sidetone): the chosen side -> gain (vx.stGain) + a small
 *   generated room (vx.stVerb) -> the master. Always starts OFF on each visit
 *   (headphones only — a mic and speakers squeal). The page shows the delay
 *   soundLAB adds (input + base + output latency) and says the UR24C MIX knob
 *   is the zero-delay way.
 * TAKES: Record = capture the chosen side as PCM (max 90 s) and its frames;
 *   Stop scores it with SLVocalAnalysis.score (js/vocal-analysis.js): in tune
 *   %, average off, landing time, steadiness, drift, vibrato, timing,
 *   loudness, dynamics, clipping, noise, clear vs breathy, one tip, grade.
 *   Up to 8 takes in memory (kept ones stay); play a take alone or with the
 *   target notes, keep (★), save WAV, delete. Scores (not audio) go to
 *   vx.hist (cap 200) for the later Progress part.
 * Hook: window.SLVocal (state, frames, feed(frames) for tests, score, takes,
 *   targets(), stop()). Suites tests/vocal-analysis.test.js (pure) and
 *   tests/vocal.test.js (page, Chromium fake audio device).
 */
(function () {
  'use strict';

  var HOP = 1024, BUF = 2048, MAX_TAKE = 90, MAX_TAKES = 8, LIVE_SEC = 8;
  var NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var A = function () { return window.SLVocalAnalysis; };

  var root = null, els = {};
  var g = null;          // live graph {ctx, src, up, split, chan, proc, sink, side, verb, wet}
  var listening = false, starting = false;
  var ring = null, ringN = 0, sinceHop = 0; // pitch window on the chosen side
  var live = [];         // recent frames for the live line (t = ctx time)
  var meter = { l: 0, r: 0, at: 0 };
  var rec = null;        // {t0 (ctx time), chunks:[], n, frames:[], targets, mode}
  var takes = [], sel = null, card = null;
  var pattern = null;    // scheduled reference {stopAt, nodes:[]}
  var play = null;       // {src, t0, take, nodes}
  var raf = 0, visible = false;
  var lastFrame = null;
  var guideTimer = 0, guideKey = '';
  var showTake = false;  // the graph shows the selected take (after a take / a pick) until you record or tap it

  function store(k, d) { return App.store.get('vx.' + k, d); }
  function put(k, v) { App.store.set('vx.' + k, v); }
  function chSide() { var v = store('ch', 'right'); return v === 'left' || v === 'both' ? v : 'right'; }
  function mode() { var v = store('mode', 'scale'); return v === 'free' || v === 'hold' ? v : 'scale'; }
  function oct() { var v = parseInt(store('oct', 3), 10); return v >= 2 && v <= 5 ? v : 3; }
  function holdNote() { var v = parseInt(store('note', 57), 10); return v >= 36 && v <= 84 ? v : 57; }
  function bpm() { var v = parseInt(App.store.get('met.bpm', 90), 10) || 90; return Math.max(50, Math.min(140, v)); }
  function name(m) { m = Math.round(m); return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ctx() { return App.getAudio(); }

  // ---------- targets ----------
  function scaleMidis() {
    var r = App.store.get('fb.root', 9), sc = App.store.get('fb.scale', 'major');
    r = typeof r === 'number' && r >= 0 && r < 12 ? r : 9;
    var steps = (Theory.SCALES[sc] || Theory.SCALES.major || { steps: [0, 2, 4, 5, 7] }).steps;
    var base = 12 * (oct() + 1) + r, up = [];
    for (var i = 0; i < 5; i++) up.push(base + (i < steps.length ? steps[i] : 12 + steps[i - steps.length]));
    return up.concat(up.slice(0, 4).reverse());
  }
  // targets in seconds from the take's start: one bar count-in, then notes
  function makeTargets(m) {
    var beat = 60 / bpm(), lead = 4 * beat, out = [];
    if (m === 'hold') out.push({ t: lead, d: 4 * beat, midi: holdNote() });
    else if (m === 'scale') scaleMidis().forEach(function (n, i) { out.push({ t: lead + i * beat, d: beat * 0.92, midi: n }); });
    return { list: out, lead: m === 'free' ? 0 : lead, beat: beat, end: out.length ? out[out.length - 1].t + out[out.length - 1].d + 0.6 : 0 };
  }
  function latency() {
    var c = ctx(), s = 0;
    s += c.baseLatency || 0;
    s += c.outputLatency || 0;
    try {
      var tr = g && g.track, set = tr && tr.getSettings && tr.getSettings();
      if (set && set.latency) s += set.latency;
    } catch (e) { /* no number */ }
    return s;
  }

  // ---------- sound out: reference notes + count-in ----------
  function tone(midi, when, dur, gain) {
    if (App.keys && App.keys.ready && App.keys.ready()) {
      try { App.keys.play(midi, when, dur, gain || 0.7); return null; } catch (e) { /* fall back */ }
    }
    var c = ctx(), o = c.createOscillator(), a = c.createGain();
    o.type = 'triangle';
    o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    a.gain.setValueAtTime(0, when);
    a.gain.linearRampToValueAtTime(0.25 * (gain || 0.7), when + 0.02);
    a.gain.setTargetAtTime(0, when + Math.max(0.05, dur - 0.08), 0.05);
    o.connect(a); a.connect(c.destination);
    o.start(when); o.stop(when + dur + 0.3);
    return o;
  }
  function click(when, accent) {
    var c = ctx(), o = c.createOscillator(), a = c.createGain();
    o.frequency.value = accent ? 1600 : 1100;
    a.gain.setValueAtTime(0.0001, when);
    a.gain.exponentialRampToValueAtTime(0.3, when + 0.002);
    a.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    o.connect(a); a.connect(c.destination);
    o.start(when); o.stop(when + 0.08);
    return o;
  }
  // schedule count-in + reference notes from ctx time t0
  function schedule(t0, tg, withNotes) {
    var nodes = [], ref = store('ref', 'on');
    for (var b = 0; b < 4 && tg.lead; b++) nodes.push(click(t0 + b * tg.beat, b === 0));
    if (tg.list.length && (ref === 'first' || !withNotes)) {
      // hear the first note during the count-in
      nodes.push(tone(tg.list[0].midi, t0 + tg.beat * 0.0 + 0.01, tg.beat * 1.8, 0.6));
    }
    if (withNotes) tg.list.forEach(function (n) { nodes.push(tone(n.midi, t0 + n.t, n.d, 0.55)); });
    return nodes.filter(Boolean);
  }
  function cancel(nodes) { (nodes || []).forEach(function (o) { try { o.stop(); } catch (e) { /* done */ } }); }

  // ---------- input graph ----------
  function reverbIR(c) {
    var len = Math.floor(c.sampleRate * 1.1), b = c.createBuffer(2, len, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch), seed = ch + 7;
      for (var i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        d[i] = (seed / 2147483647 * 2 - 1) * Math.pow(1 - i / len, 3);
      }
    }
    return b;
  }
  function build(tapped) {
    teardown();
    var c = tapped.context, src = tapped.source;
    var x = { ctx: c, src: src, track: null };
    try { x.track = App.audioIn._t().stream.getAudioTracks()[0]; } catch (e) { /* no track handle */ }
    // force stereo: a mono device is heard on both sides
    x.up = c.createGain();
    x.up.channelCount = 2; x.up.channelCountMode = 'explicit'; x.up.channelInterpretation = 'speakers';
    src.connect(x.up);
    x.split = c.createChannelSplitter(2);
    x.up.connect(x.split);
    x.chan = c.createGain();        // the chosen side, mono
    x.chan.channelCount = 1; x.chan.channelCountMode = 'explicit';
    routeSide(x);
    // analysis + recording tap (zero-gain sink keeps it running; never audible)
    x.proc = c.createScriptProcessor(BUF, 2, 1);
    x.proc.onaudioprocess = onBlock;
    x.up.connect(x.proc);
    x.sink = c.createGain(); x.sink.gain.value = 0;
    x.proc.connect(x.sink); x.sink.connect(c.destination);
    // sidetone: chan -> side (dry) + verb -> wet ; connected to the master only while on
    x.side = c.createGain(); x.side.gain.value = 0;
    x.wet = c.createGain();
    x.verb = c.createConvolver();
    try { x.verb.buffer = reverbIR(c); } catch (e) { /* no reverb */ }
    x.chan.connect(x.side);
    x.side.connect(x.verb); x.verb.connect(x.wet);
    x.sideOn = false;
    g = x;
    ring = new Float32Array(BUF); ringN = 0; sinceHop = 0;
    applySidetone();
  }
  function routeSide(x) {
    x = x || g;
    if (!x) return;
    try { x.split.disconnect(); } catch (e) { /* none yet */ }
    var s = chSide();
    x.chan.gain.value = s === 'both' ? 0.5 : 1;
    if (s !== 'right') x.split.connect(x.chan, 0);
    if (s !== 'left') x.split.connect(x.chan, 1);
  }
  function teardown() {
    if (!g) return;
    try { g.proc.onaudioprocess = null; } catch (e) { /* gone */ }
    ['proc', 'sink', 'side', 'wet', 'verb', 'chan', 'split', 'up'].forEach(function (k) { try { g[k].disconnect(); } catch (e) { /* ok */ } });
    try { g.src.disconnect(g.up); } catch (e) { /* ok */ }
    g = null;
  }
  function sidetoneWanted() { return !!(els.stOn && els.stOn.classList.contains('active')); }
  function applySidetone() {
    if (!g) return;
    var on = sidetoneWanted() && listening;
    var lvl = Math.max(0, Math.min(150, parseInt(store('stGain', 80), 10) || 0)) / 100;
    var wet = Math.max(0, Math.min(60, parseInt(store('stVerb', 15), 10) || 0)) / 100;
    g.side.gain.value = lvl;
    g.wet.gain.value = wet;
    var dest = ctx().destination;
    if (on && !g.sideOn) { g.side.connect(dest); g.wet.connect(dest); g.sideOn = true; }
    if (!on && g.sideOn) { try { g.side.disconnect(dest); } catch (e) { /* ok */ } try { g.wet.disconnect(dest); } catch (e) { /* ok */ } g.sideOn = false; }
  }

  function onBlock(e) {
    var ib = e.inputBuffer, L = ib.getChannelData(0), R = ib.numberOfChannels > 1 ? ib.getChannelData(1) : L;
    var s = chSide(), n = L.length, i, pl = 0, pr = 0;
    for (i = 0; i < n; i++) { var a = Math.abs(L[i]), b = Math.abs(R[i]); if (a > pl) pl = a; if (b > pr) pr = b; }
    meter.l = Math.max(pl, meter.l * 0.85); meter.r = Math.max(pr, meter.r * 0.85);
    var mono = new Float32Array(n);
    for (i = 0; i < n; i++) mono[i] = s === 'left' ? L[i] : s === 'right' ? R[i] : (L[i] + R[i]) / 2;
    var endT = ctx().currentTime, startT = endT - n / ib.sampleRate;
    if (rec) {
      if (rec.t0 == null) rec.t0 = startT;
      rec.chunks.push(mono); rec.n += n;
      if (rec.n / ib.sampleRate > MAX_TAKE) setTimeout(function () { stopRec(); }, 0);
    }
    // hops through the ring
    for (var off = 0; off < n; off += HOP) {
      var len = Math.min(HOP, n - off);
      ring.copyWithin(0, len);
      ring.set(mono.subarray(off, off + len), BUF - len);
      ringN = Math.min(BUF, ringN + len);
      if (ringN < BUF) continue;
      frame(ring, ib.sampleRate, startT + (off + len) / ib.sampleRate);
    }
  }
  function frame(buf, sr, t) {
    var rms = 0, peak = 0;
    for (var i = BUF - HOP; i < BUF; i++) { var v = buf[i]; rms += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
    rms = Math.sqrt(rms / HOP);
    var d = window.SLPitchDetector ? window.SLPitchDetector.detect(buf, sr, { minFrequency: 65, maxFrequency: 1100, noiseFloor: 0.004, referenceA4: 440 }) : null;
    var f = { t: t, midi: d && !d.ambiguous ? d.midiFloat : NaN, clarity: d ? d.clarity : 0, rms: rms, peak: peak };
    push(f);
  }
  function push(f) {
    lastFrame = f;
    live.push(f);
    var cut = f.t - LIVE_SEC - 1;
    while (live.length && live[0].t < cut) live.shift();
    if (rec && rec.t0 != null) rec.frames.push({ t: f.t - rec.t0, midi: f.midi, clarity: f.clarity, rms: f.rms, peak: f.peak });
  }

  // ---------- listening ----------
  function start() {
    if (listening || starting) return Promise.resolve();
    if (!App.audioIn || !App.audioIn.supported) { status('Audio input is not available in this browser.', true); return Promise.resolve(); }
    starting = true;
    status('Opening the input…');
    try { ctx().resume(); } catch (e) { /* locked until a tap */ }
    return Promise.resolve(App.audioIn.hold('vocal')).then(function () {
      starting = false;
      var t = App.audioIn.tap('vocal');
      if (!t) {
        var s = App.audioIn.state;
        App.audioIn.release('vocal');
        status(s.error || s.msg || 'The input did not open. Pick it in Settings > Sound input.', true);
        paint();
        return;
      }
      build(t);
      listening = true;
      try { App.wake.acquire('vx-listen'); } catch (e) { /* no wake */ }
      status('');
      paint();
      loop();
    }, function (err) {
      starting = false;
      status('The input did not open: ' + (err && err.message || err), true);
      paint();
    });
  }
  function stop() {
    stopRec(true);
    stopPlay();
    stopPattern();
    teardown();
    if (listening || starting) { try { App.audioIn.release('vocal'); } catch (e) { /* ok */ } }
    listening = false; starting = false;
    try { App.wake.release('vx-listen'); } catch (e) { /* ok */ }
    if (els.stOn) setSeg(els.stSeg, 'off');
    live = [];
    paint();
  }

  // ---------- recording ----------
  function startRec() {
    if (rec) return;
    stopPlay();
    showTake = false;
    var go = function () {
      if (!listening) return;
      var m = mode(), tg = makeTargets(m);
      App.emit('transport:claim', { owner: 'vocal' });
      var c = ctx(), t0 = c.currentTime + 0.12;
      rec = { t0: null, plannedT0: t0, chunks: [], n: 0, frames: [], targets: tg, mode: m, sr: c.sampleRate, at: Date.now() };
      // the take's clock starts at the first captured block; targets are
      // shifted by how far the plan sits after it (set on the first block)
      rec.offset = null;
      if (tg.list.length) {
        pattern = { nodes: schedule(t0, tg, store('ref', 'on') === 'on') };
        pattern.timer = setTimeout(function () { if (rec) rec.finished = true; stopRec(); }, (tg.end + 0.3) * 1000 + 150);
        startGuide(t0, tg.list);
      }
      paint();
    };
    if (!listening) start().then(go); else go();
  }
  function stopPattern() {
    stopGuide();
    if (!pattern) return;
    cancel(pattern.nodes);
    clearTimeout(pattern.timer);
    pattern = null;
  }
  function stopRec(discard) {
    if (!rec) return;
    var r = rec;
    rec = null;
    stopPattern();
    if (discard || !r.n) { paint(); return; }
    var pcm = new Float32Array(r.n), o = 0;
    r.chunks.forEach(function (c) { pcm.set(c, o); o += c.length; });
    // targets in the take's own clock (t = 0 = first captured sample)
    var shift = r.plannedT0 - (r.t0 == null ? r.plannedT0 : r.t0);
    var tl = r.targets.list.map(function (n) { return { t: n.t + shift, d: n.d, midi: n.midi }; });
    var take = { id: 'tk' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: r.at, mode: r.mode, sr: r.sr, pcm: pcm,
      frames: r.frames, targets: tl, beat: r.targets.beat, kept: false };
    take.card = A().score(take.frames, tl, { lag: latency(), timed: tl.length > 1 });
    take.done = !!r.finished || !tl.length;
    addTake(take);
    recordProgress(take);
    showTake = true;
    paint();
  }
  function addTake(take) {
    takes.unshift(take);
    // drop the oldest unkept beyond the cap
    while (takes.length > MAX_TAKES) {
      var idx = -1;
      for (var i = takes.length - 1; i >= 0; i--) if (!takes[i].kept) { idx = i; break; }
      if (idx < 0) break;
      takes.splice(idx, 1);
    }
    sel = take.id;
    card = take.card;
    var h = store('hist', []);
    if (!Array.isArray(h)) h = [];
    var c = take.card;
    h.push({ at: take.at, mode: take.mode, grade: c.grade, inTune: c.inTune, offset: c.offset, landing: c.landing, wobble: c.wobble, notes: c.notes });
    if (h.length > 200) h = h.slice(-200);
    put('hist', h);
  }
  function takeById(id) { for (var i = 0; i < takes.length; i++) if (takes[i].id === id) return takes[i]; return null; }


  // ---------- fits the rest of the app ----------
  // LUMI / key lights: the sounding target + the next one, through the ONE
  // keybed guide every practice page uses (cleared when the take ends)
  function startGuide(t0, list) {
    stopGuide();
    if (!App.midi || typeof App.midi.guide !== 'function') return;
    guideTimer = setInterval(function () {
      var now = ctx().currentTime - t0, i = -1, j = -1;
      for (var k = 0; k < list.length; k++) {
        if (now >= list[k].t - 0.05 && now < list[k].t + list[k].d) { i = k; break; }
        if (list[k].t > now) { j = k; break; }
      }
      var cur = i >= 0 ? [list[i].midi] : [], nx = list[i >= 0 ? i + 1 : j];
      var next = nx && (!cur.length || nx.midi !== cur[0]) ? [nx.midi] : [];
      var key = cur.join() + '|' + next.join();
      if (key !== guideKey) { guideKey = key; try { App.midi.guide(cur, next); } catch (e) { /* no keybed */ } }
    }, 25);
  }
  function stopGuide() {
    if (guideTimer) { clearInterval(guideTimer); guideTimer = 0; }
    if (guideKey) { guideKey = ''; try { App.midi.guide([], []); } catch (e) { /* ok */ } }
  }
  // Voice takes count like any other practice: singing time (only the time
  // you actually sang) goes to the voice ledger, so the streak, daily goal and
  // a Practice Plan "sing" block all see it. Notes in tune = matched.
  function recordProgress(take) {
    var P = App.practiceProgress, c = take.card;
    if (!P || !c || !c.voicedSec || c.voicedSec < 1) return;
    var end = Date.now(), dur = take.pcm.length / take.sr, start = Math.round(end - dur * 1000);
    var secs = Math.min(c.voicedSec, dur);
    var good = c.perNote.filter(function (n) { return n.sung && n.inTune >= 0.5; }).length;
    var day = P.dayKey ? P.dayKey(start) : new Date(start).toISOString().slice(0, 10);
    var expected = c.free ? c.notes : take.targets.length;
    try {
      var r = P.recordSession({ id: 'vx-' + take.id, instrument: 'voice', startedAt: start, endedAt: end, engagedSeconds: secs,
        segments: [{ date: day, startedAt: start, endedAt: end, engagedSeconds: secs }], mode: 'voice',
        status: take.done ? 'complete' : 'stopped', expected: expected, matched: Math.min(good, expected), missed: c.free ? 0 : c.missed });
      if (r && r.ok) App.emit('practiceprogress:changed', { instrument: 'voice' });
    } catch (e) { /* progress is best effort; the take is kept */ }
  }

  // ---------- playback ----------
  function playTake(id, withNotes) {
    var tk = takeById(id);
    if (!tk) return;
    stopPlay();
    if (rec) stopRec();
    App.emit('transport:claim', { owner: 'vocal' });
    var c = ctx();
    try { c.resume(); } catch (e) { /* ok */ }
    var b = c.createBuffer(1, tk.pcm.length, tk.sr);
    b.getChannelData(0).set(tk.pcm);
    var s = c.createBufferSource(), a = c.createGain();
    s.buffer = b; a.gain.value = 1;
    s.connect(a); a.connect(c.destination);
    var t0 = c.currentTime + 0.05, nodes = [];
    s.start(t0);
    if (withNotes) tk.targets.forEach(function (n) { var o = tone(n.midi, t0 + n.t, n.d, 0.45); if (o) nodes.push(o); });
    play = { src: s, t0: t0, take: tk, nodes: nodes, dur: b.duration };
    s.onended = function () { if (play && play.src === s) { play = null; paint(); } };
    sel = id; card = tk.card; showTake = true;
    paint();
    loop();
  }
  function stopPlay() {
    if (!play) return;
    try { play.src.stop(); } catch (e) { /* ended */ }
    cancel(play.nodes);
    play = null;
  }

  // ---------- WAV ----------
  function wav(tk) {
    var n = tk.pcm.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function w(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, tk.sr, true); v.setUint32(28, tk.sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) { var s = Math.max(-1, Math.min(1, tk.pcm[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return new Blob([buf], { type: 'audio/wav' });
  }
  function saveWav(id) {
    var tk = takeById(id);
    if (!tk) return;
    var a = document.createElement('a'), d = new Date(tk.at);
    a.href = URL.createObjectURL(wav(tk));
    a.download = 'soundLAB voice ' + d.toISOString().slice(0, 16).replace('T', ' ').replace(':', '-') + '.wav';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  // ---------- drawing ----------
  function css(v, d) { try { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || d; } catch (e) { return d; } }
  function colorFor(c) { var a = Math.abs(c); return a <= 25 ? css('--sl-ok', '#5fd38d') : a <= 50 ? css('--warn', '#f3c349') : css('--sl-bad', '#ff6b6b'); }
  function nearestTarget(list, t) {
    for (var i = 0; i < list.length; i++) if (t >= list[i].t && t < list[i].t + list[i].d + 0.05) return list[i];
    return null;
  }
  function draw() {
    var cv = els.graph;
    if (!cv) return;
    var w = cv.clientWidth || 600, h = cv.clientHeight || 260, dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var x2 = cv.getContext('2d');
    x2.setTransform(dpr, 0, 0, dpr, 0, 0);
    x2.clearRect(0, 0, w, h);
    // what to show: the selected take (review / playback) or the live line
    var review = !rec && (play || ((showTake || !listening) && sel)) ? (play ? play.take : takeById(sel)) : null;
    var frames, tlist, t0, t1, now = null;
    if (review) {
      frames = review.frames; tlist = review.targets;
      t0 = 0; t1 = Math.max(1, review.pcm.length / review.sr);
      if (play) now = ctx().currentTime - play.t0;
    } else if (rec && rec.t0 != null) {
      frames = rec.frames;
      var sh = rec.plannedT0 - rec.t0;
      tlist = rec.targets.list.map(function (n) { return { t: n.t + sh, d: n.d, midi: n.midi }; });
      now = ctx().currentTime - rec.t0;
      t1 = Math.max(LIVE_SEC, now + 0.5); t0 = t1 - LIVE_SEC;
      if (tlist.length) { t0 = Math.max(0, Math.min(t0, tlist[0].t - 0.5)); t1 = Math.max(t1, tlist[tlist.length - 1].t + tlist[tlist.length - 1].d + 0.5); }
    } else {
      var tn = listening ? ctx().currentTime : 0;
      frames = live.map(function (f) { return { t: f.t - tn + LIVE_SEC, midi: f.midi, clarity: f.clarity, rms: f.rms }; });
      tlist = mode() === 'hold' ? [{ t: 0, d: LIVE_SEC, midi: holdNote() }] : [];
      t0 = 0; t1 = LIVE_SEC;
    }
    var gate = A() ? A().gateFor(frames) : 0.004;
    var sung = frames.filter(function (f) { return isFinite(f.midi) && f.clarity >= 0.8 && f.rms >= gate; });
    // pitch window
    var ms = tlist.map(function (n) { return n.midi; }).concat(sung.map(function (f) { return f.midi; }));
    var lo, hi;
    if (ms.length) { lo = Math.min.apply(null, ms); hi = Math.max.apply(null, ms); }
    else { lo = mode() === 'scale' ? scaleMidis()[0] : holdNote(); hi = lo + 7; }
    lo = Math.floor(lo) - 3; hi = Math.ceil(hi) + 3;
    if (hi - lo < 10) { var mid = (hi + lo) / 2; lo = Math.floor(mid - 5); hi = lo + 10; }
    var padL = 34;
    var X = function (t) { return padL + (t - t0) / (t1 - t0) * (w - padL - 6); };
    var Y = function (m) { return h - 6 - (m - lo) / (hi - lo) * (h - 12); };
    // grid
    x2.font = '11px ' + css('--sl-font-body', 'sans-serif');
    x2.textBaseline = 'middle';
    for (var m = lo; m <= hi; m++) {
      var pc = ((m % 12) + 12) % 12, nat = [0, 2, 4, 5, 7, 9, 11].indexOf(pc) >= 0;
      x2.strokeStyle = css('--sl-line', 'rgba(255,255,255,.08)');
      x2.globalAlpha = pc === 0 ? 0.9 : nat ? 0.45 : 0.18;
      x2.beginPath(); x2.moveTo(padL, Y(m)); x2.lineTo(w, Y(m)); x2.stroke();
      x2.globalAlpha = 1;
      if (nat) { x2.fillStyle = css('--sl-ink-muted', '#999'); x2.fillText(name(m), 2, Y(m)); }
    }
    // target bars
    var bh = Math.max(6, (h - 12) / (hi - lo) * 0.8);
    x2.fillStyle = css('--sl-accent-soft', 'rgba(255,171,71,.18)');
    x2.strokeStyle = css('--sl-accent-line', 'rgba(255,171,71,.5)');
    tlist.forEach(function (n) {
      var xa = X(n.t), xb = X(n.t + n.d), y = Y(n.midi) - bh / 2;
      x2.beginPath();
      if (x2.roundRect) x2.roundRect(xa, y, Math.max(3, xb - xa), bh, 4); else x2.rect(xa, y, Math.max(3, xb - xa), bh);
      x2.fill(); x2.stroke();
    });
    // the sung line, colored by how far from the target (or nearest note)
    x2.lineWidth = 3; x2.lineCap = 'round';
    var prev = null;
    sung.forEach(function (f) {
      if (f.t < t0 || f.t > t1) { prev = null; return; }
      var tg = nearestTarget(tlist, f.t);
      var ref = tg ? tg.midi + Math.round((f.midi - tg.midi) / 12) * 12 : Math.round(f.midi);
      var cents = (f.midi - ref) * 100;
      if (prev && f.t - prev.t < 0.08) {
        x2.strokeStyle = colorFor(cents);
        x2.beginPath(); x2.moveTo(X(prev.t), Y(prev.midi)); x2.lineTo(X(f.t), Y(f.midi)); x2.stroke();
      }
      prev = f;
    });
    // playhead
    if (now != null && now >= t0 && now <= t1) {
      x2.strokeStyle = css('--sl-accent', '#ffab47'); x2.lineWidth = 1.5;
      x2.beginPath(); x2.moveTo(X(now), 0); x2.lineTo(X(now), h); x2.stroke();
    }
    if (review && listening && !play) {
      x2.fillStyle = css('--sl-ink-muted', '#999'); x2.textAlign = 'right';
      x2.fillText('Your take. Tap to go back to live.', w - 8, h - 12);
      x2.textAlign = 'left';
    }
    if (!frames.length && !tlist.length) {
      x2.fillStyle = css('--sl-ink-muted', '#999'); x2.textAlign = 'center';
      x2.fillText(listening ? 'Sing a note…' : 'Press Start listening, then sing', w / 2, h / 2);
      x2.textAlign = 'left';
    }
  }
  function readout() {
    if (!els.note) return;
    var f = lastFrame, ok = listening && f && isFinite(f.midi) && f.clarity >= 0.8 && f.rms > 0.004 && ctx().currentTime - f.t < 0.3;
    if (!ok) { els.note.textContent = '—'; els.cents.textContent = listening ? 'listening' : ''; els.note.style.color = ''; }
    else {
      var r = Math.round(f.midi), c = Math.round((f.midi - r) * 100);
      els.note.textContent = name(r);
      els.cents.textContent = (c > 0 ? '+' : '') + c + ' ¢';
      els.note.style.color = colorFor(c);
    }
    var pct = function (p) { return Math.min(100, Math.round(Math.sqrt(p) * 100)); };
    els.ml.style.width = pct(meter.l) + '%'; els.mr.style.width = pct(meter.r) + '%';
    els.ml.classList.toggle('clip', meter.l > 0.98); els.mr.classList.toggle('clip', meter.r > 0.98);
    meter.l *= 0.92; meter.r *= 0.92;
  }
  function loop() {
    if (raf) return;
    var step = function () {
      raf = 0;
      if (!visible) return;
      draw(); readout();
      if (listening || play) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  // ---------- UI ----------
  function setSeg(seg, val) {
    if (!seg) return;
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
      var on = b.getAttribute('data-v') === String(val);
      b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function seg(id, opts) {
    return '<div class="seg" id="' + id + '">' + opts.map(function (o) { return '<button type="button" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>';
  }
  function noteOptions() {
    var s = '';
    for (var m = 40; m <= 79; m++) s += '<option value="' + m + '">' + name(m) + '</option>';
    return s;
  }
  function markup() {
    return '' +
      '<div class="vx-wrap">' +
      '<div class="card vx-sing">' +
        '<h2>Voice</h2>' +
        '<div class="row tight vx-inrow">' +
          '<button type="button" class="btn primary" id="vx-listen">' + App.icon('mic', 15) + ' <span>Start listening</span></button>' +
          '<div class="vx-meters" title="Which side moves when you sing?">' +
            '<div class="vx-m"><span>L</span><i><b id="vx-ml"></b></i></div>' +
            '<div class="vx-m"><span>R</span><i><b id="vx-mr"></b></i></div>' +
          '</div>' +
          '<label class="field">My voice is on' + seg('vx-ch', [['left', 'Left (in 1)'], ['right', 'Right (in 2)'], ['both', 'Both']]) + '</label>' +
        '</div>' +
        '<div class="muted small" id="vx-status" role="status"></div>' +
        '<div class="row tight vx-modes">' +
          '<label class="field">Sing to' + seg('vx-mode', [['scale', '5-note scale'], ['hold', 'Hold a note'], ['free', 'Free']]) + '</label>' +
          '<label class="field" id="vx-octf">Start octave' + seg('vx-oct', [['2', 'Low'], ['3', 'Mid'], ['4', 'High']]) + '</label>' +
          '<label class="field" id="vx-notef">Note<select id="vx-note">' + noteOptions() + '</select></label>' +
          '<label class="field">Guide notes' + seg('vx-ref', [['on', 'Play along'], ['first', 'First note only']]) + '</label>' +
        '</div>' +
        '<div class="vx-stage">' +
          '<div class="vx-read"><div class="vx-note" id="vx-note-now">—</div><div class="vx-cents muted" id="vx-cents"></div></div>' +
          '<canvas id="vx-graph" class="vx-graph" aria-label="Pitch line: your voice over the target notes"></canvas>' +
        '</div>' +
        '<div class="row tight vx-tr">' +
          '<button type="button" class="btn" id="vx-hear">' + App.icon('ear', 15) + ' Hear the notes</button>' +
          '<button type="button" class="btn primary vx-rec" id="vx-rec">' + App.icon('record', 15) + ' <span>Record</span></button>' +
          '<button type="button" class="btn" id="vx-play" disabled>' + App.icon('play', 14) + ' Play take</button>' +
          '<button type="button" class="btn" id="vx-playn" disabled>' + App.icon('play', 14) + ' Play with notes</button>' +
        '</div>' +
        '<div class="vx-side">' +
          '<div class="row tight">' +
            '<label class="field">Hear myself' + seg('vx-st', [['off', 'Off'], ['on', 'On']]) + '</label>' +
            '<label class="field">Level <input type="range" id="vx-stgain" min="0" max="150" step="5"></label>' +
            '<label class="field">Room <input type="range" id="vx-stverb" min="0" max="60" step="5"></label>' +
          '</div>' +
          '<div class="muted small" id="vx-lat"></div>' +
        '</div>' +
        '<details class="tips"><summary>How to set up</summary>' +
          '<ol class="vx-steps">' +
            '<li>Plug the mic into the Helix, Helix XLR out into <b>UR24C input 2</b>.</li>' +
            '<li>Pick the UR24C in <a href="#" id="vx-settings">Settings &gt; Sound input</a>.</li>' +
            '<li>Put on headphones. Press <b>Start listening</b> and sing: the <b>R</b> meter should move.</li>' +
            '<li>To hear yourself with no delay, turn the UR24C <b>MIX</b> knob toward INPUT. Or use Hear myself here (a little delay).</li>' +
            '<li>Press <b>Record</b>, sing after the 4 clicks, and read your score.</li>' +
          '</ol>' +
          'Keys: Space = record / stop, H = hear the notes, P = play the take.' +
        '</details>' +
      '</div>' +
      '<div class="card vx-score">' +
        '<h2>Your take</h2>' +
        '<div id="vx-card"></div>' +
        '<h3>Takes</h3>' +
        '<div id="vx-takes" class="vx-takes"></div>' +
      '</div>' +
      '</div>';
  }
  function status(msg, bad) { if (els.status) { els.status.textContent = msg || ''; els.status.classList.toggle('error', !!bad); } }
  function fmt(v, d, unit) { return v == null || !isFinite(v) ? '—' : (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)) + (unit || ''); }
  function signed(v) { return v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + Math.round(v) + ' ¢'; }
  function row(label, value, help, cls) {
    return '<div class="vx-stat' + (cls ? ' ' + cls : '') + '"><span class="vx-sl">' + label + '</span><b>' + value + '</b><span class="vx-sh muted small">' + help + '</span></div>';
  }
  function band(v, good, okv, lowerBetter) {
    if (v == null || !isFinite(v)) return '';
    var x = lowerBetter ? v : -v, gg = lowerBetter ? good : -good, oo = lowerBetter ? okv : -okv;
    return x <= gg ? 'good' : x <= oo ? 'ok' : 'bad';
  }
  function paintCard() {
    var el = els.card;
    if (!el) return;
    var c = card;
    if (!c) { el.innerHTML = '<p class="muted">Record a take and your score shows here: how in tune you were, how fast you land on notes, how steady you hold them, and one tip.</p>'; return; }
    var An = A(), v = c.vibrato;
    el.innerHTML =
      '<div class="vx-top"><div class="vx-grade" data-band="' + (c.grade == null ? '' : c.grade >= 80 ? 'good' : c.grade >= 60 ? 'ok' : 'bad') + '">' + (c.grade == null ? '—' : c.grade) + '</div>' +
      '<p class="vx-tip" id="vx-tip">' + esc(c.tip) + '</p></div>' +
      '<div class="vx-stats">' +
      row('In tune', c.inTune == null ? '—' : Math.round(c.inTune * 100) + '%', 'time within 25 ¢', band(c.inTune, 0.8, 0.6, false)) +
      row('Average off', signed(c.offset), c.offset == null ? '' : c.offset > 5 ? 'sharp' : c.offset < -5 ? 'flat' : 'centred', band(Math.abs(c.offset || 0), 10, 20, true)) +
      row('Landing', c.landing == null ? '—' : Math.round(c.landing * 1000) + ' ms', 'to settle on each note', band(c.landing, 0.15, 0.3, true)) +
      row('Steadiness', c.wobble == null ? '—' : '±' + Math.round(c.wobble) + ' ¢', 'wobble on held notes', band(c.wobble, 8, 15, true)) +
      row('Drift', c.drift == null ? '—' : (c.drift > 0 ? '+' : '') + Math.round(c.drift) + ' ¢/s', 'long notes going sharp or flat', band(Math.abs(c.drift || 0), 10, 20, true)) +
      row('Vibrato', v ? fmt(v.rate, 1, ' /s') + ', ±' + Math.round(v.width) + ' ¢' : 'none', v ? 'speed and width' : 'straight tone', '') +
      (c.timing != null ? row('Timing', (c.timing > 0 ? '+' : '') + Math.round(c.timing * 1000) + ' ms', c.timing > 0.05 ? 'late' : c.timing < -0.05 ? 'early' : 'on the beat', band(Math.abs(c.timing), 0.08, 0.15, true)) : '') +
      row('Notes', c.free ? c.notes + ' found' : c.sungNotes + ' of ' + c.notes, c.missed ? c.missed + ' missed' : 'all sung', c.missed ? 'bad' : '') +
      row('Loudness', fmt(c.loudness, 0, ' dB'), c.dynamics == null ? '' : 'spread ' + Math.round(c.dynamics) + ' dB', '') +
      row('Clipping', c.clipped ? c.clipped + ' spots' : 'none', c.clipped ? 'turn the gain down' : 'level is safe', c.clipped > 3 ? 'bad' : 'good') +
      row('Noise', c.snr == null ? '—' : Math.round(c.snr) + ' dB under you', 'hum / hiss below your voice', band(c.snr, 30, 18, false)) +
      row('Tone', An ? An.clarityWord(c.clarity) || '—' : '—', 'clear vs breathy', band(c.clarity, 0.93, 0.86, false)) +
      '</div>';
  }
  function paintTakes() {
    var el = els.takes;
    if (!el) return;
    if (!takes.length) { el.innerHTML = '<p class="muted small">No takes yet. They stay here until you leave soundLAB; press ★ to keep one, or save it as a WAV.</p>'; return; }
    el.innerHTML = takes.map(function (t, i) {
      var d = new Date(t.at), lbl = { scale: '5-note scale', hold: 'Hold ' + (t.targets[0] ? name(t.targets[0].midi) : ''), free: 'Free' }[t.mode];
      return '<div class="vx-take' + (t.id === sel ? ' sel' : '') + '" data-id="' + t.id + '">' +
        '<button type="button" class="vx-tsel" data-act="sel">' +
          '<b>' + (t.card.grade == null ? '—' : t.card.grade) + '</b>' +
          '<span>Take ' + (takes.length - i) + ' · ' + esc(lbl) + '<br><span class="muted small">' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' · ' + (t.pcm.length / t.sr).toFixed(1) + ' s</span></span>' +
        '</button>' +
        '<button type="button" class="btn sm" data-act="play" title="Play">' + App.icon('play', 13) + '</button>' +
        '<button type="button" class="btn sm' + (t.kept ? ' on' : '') + '" data-act="keep" aria-pressed="' + t.kept + '" title="Keep">' + App.icon('star', 13) + '</button>' +
        '<button type="button" class="btn sm" data-act="wav" title="Save WAV">WAV</button>' +
        '<button type="button" class="btn sm danger" data-act="del" title="Delete">' + App.icon('close', 13) + '</button>' +
        '</div>';
    }).join('');
  }
  function paint() {
    if (!root) return;
    els.listen.querySelector('span').textContent = listening ? 'Stop listening' : starting ? 'Opening…' : 'Start listening';
    els.listen.classList.toggle('primary', !listening);
    els.rec.querySelector('span').textContent = rec ? 'Stop' : 'Record';
    els.rec.classList.toggle('live', !!rec);
    els.rec.setAttribute('aria-pressed', rec ? 'true' : 'false');
    var has = !!takeById(sel);
    els.play.disabled = !has; els.playn.disabled = !has || !(takeById(sel).targets.length);
    els.play.innerHTML = App.icon(play && !play.nodes.length ? 'stop' : 'play', 14) + (play && !play.nodes.length ? ' Stop' : ' Play take');
    setSeg(els.chSeg, chSide());
    setSeg(els.modeSeg, mode());
    setSeg(els.octSeg, String(oct()));
    setSeg(els.refSeg, store('ref', 'on'));
    els.noteSel.value = String(holdNote());
    els.octF.hidden = mode() !== 'scale';
    els.noteF.hidden = mode() !== 'hold';
    els.stGain.value = store('stGain', 80);
    els.stVerb.value = store('stVerb', 15);
    var lat = Math.round(latency() * 1000);
    var st = App.audioIn && App.audioIn.state;
    els.lat.innerHTML = listening ? 'Hear myself adds about <b>' + lat + ' ms</b> of delay' + (lat > 20 ? ' (you may hear an echo)' : '') + '. For zero delay, use the UR24C <b>MIX</b> knob instead.' +
      (st && st.mic ? ' <b>Headphones only:</b> this input is a microphone, speakers will squeal.' : '')
      : 'Start listening first. Use headphones.';
    paintCard();
    paintTakes();
    draw(); readout();
  }

  function wire() {
    els.listen.addEventListener('click', function () { if (listening) stop(); else start(); });
    els.rec.addEventListener('click', function () { if (rec) stopRec(); else startRec(); });
    els.hear.addEventListener('click', function () {
      var tg = makeTargets(mode() === 'free' ? 'hold' : mode()), t0 = ctx().currentTime + 0.05;
      try { ctx().resume(); } catch (e) { /* ok */ }
      App.emit('transport:claim', { owner: 'vocal' });
      tg.list.forEach(function (n) { tone(n.midi, t0 + n.t - tg.lead, n.d, 0.6); });
    });
    els.play.addEventListener('click', function () { if (play) { stopPlay(); paint(); } else playTake(sel, false); });
    els.playn.addEventListener('click', function () { playTake(sel, true); });
    function segClick(seg, fn) {
      seg.addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (b) { fn(b.getAttribute('data-v')); paint(); } });
    }
    segClick(els.chSeg, function (v) { put('ch', v); routeSide(); });
    segClick(els.modeSeg, function (v) { if (!rec) put('mode', v); });
    segClick(els.octSeg, function (v) { put('oct', parseInt(v, 10)); });
    segClick(els.refSeg, function (v) { put('ref', v); });
    els.noteSel.addEventListener('change', function () { put('note', parseInt(els.noteSel.value, 10)); paint(); });
    segClick(els.stSeg, function (v) {
      setSeg(els.stSeg, v);
      if (v === 'on' && !listening) start().then(applySidetone);
      applySidetone();
    });
    els.stGain.addEventListener('input', function () { put('stGain', parseInt(els.stGain.value, 10)); applySidetone(); });
    els.stVerb.addEventListener('input', function () { put('stVerb', parseInt(els.stVerb.value, 10)); applySidetone(); });
    els.graph.addEventListener('click', function () { if (showTake && !play) { showTake = false; paint(); } });
    els.settings.addEventListener('click', function (e) { e.preventDefault(); App.switchTo('settings'); });
    els.takes.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'), row = e.target.closest('.vx-take');
      if (!b || !row) return;
      var id = row.getAttribute('data-id'), tk = takeById(id), act = b.getAttribute('data-act');
      if (!tk) return;
      if (act === 'sel') { sel = id; card = tk.card; showTake = true; }
      else if (act === 'play') playTake(id, false);
      else if (act === 'keep') tk.kept = !tk.kept;
      else if (act === 'wav') saveWav(id);
      else if (act === 'del') {
        takes = takes.filter(function (t) { return t.id !== id; });
        if (sel === id) { sel = takes[0] ? takes[0].id : null; card = takes[0] ? takes[0].card : null; }
        if (play && play.take === tk) stopPlay();
      }
      paint();
    });
  }

  function init(el) {
    root = el;
    el.innerHTML = markup();
    var q = function (id) { return el.querySelector('#' + id); };
    els = {
      listen: q('vx-listen'), status: q('vx-status'), ml: q('vx-ml'), mr: q('vx-mr'), chSeg: q('vx-ch'),
      modeSeg: q('vx-mode'), octSeg: q('vx-oct'), octF: q('vx-octf'), noteF: q('vx-notef'), noteSel: q('vx-note'), refSeg: q('vx-ref'),
      note: q('vx-note-now'), cents: q('vx-cents'), graph: q('vx-graph'),
      hear: q('vx-hear'), rec: q('vx-rec'), play: q('vx-play'), playn: q('vx-playn'),
      stSeg: q('vx-st'), stOn: null, stGain: q('vx-stgain'), stVerb: q('vx-stverb'), lat: q('vx-lat'),
      settings: q('vx-settings'), card: q('vx-card'), takes: q('vx-takes')
    };
    els.stOn = els.stSeg.querySelector('[data-v="on"]');
    setSeg(els.stSeg, 'off');
    wire();
    App.on('transport:claim', function (d) { if (d && d.owner !== 'vocal') { stopRec(); stopPlay(); stopPattern(); paint(); } });
    App.on('audioin:state', function () {
      if (!listening) return;
      var t = App.audioIn.tap('vocal');
      if (!t) { stop(); status('The input closed. Press Start listening again.', true); return; }
      if (!g || t.source !== g.src) { build(t); paint(); }
    });
    App.on('fb:scale', function () { if (visible) paint(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && (listening || play)) stop(); });
    paint();
  }
  function onShow() { visible = true; paint(); loop(); }
  function onHide() { visible = false; stop(); if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function onKey(e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); els.rec.click(); }
    else if (e.key === 'h' || e.key === 'H') els.hear.click();
    else if (e.key === 'p' || e.key === 'P') { if (!els.play.disabled) els.play.click(); }
  }
  // controller remote: NEXT = record / stop (exactly the Record button), STOP = stop
  function onRemote(action) {
    if (action === 'next') { els.rec.click(); return rec ? 'Recording' : 'Take scored'; }
    if (action === 'stop') { if (!rec && !play) return false; stopRec(); stopPlay(); paint(); return 'Stopped'; }
    return false;
  }

  App.register('vocal', { init: init, onShow: onShow, onHide: onHide, onKey: onKey, onRemote: onRemote });

  window.SLVocal = {
    get listening() { return listening; },
    get recording() { return !!rec; },
    get takes() { return takes; },
    get card() { return card; },
    get graph() { return g; },
    targets: function (m) { return makeTargets(m || mode()); },
    scale: scaleMidis,
    latency: latency,
    start: start, stop: stop, record: startRec, stopRec: function () { stopRec(); }, play: playTake,
    // test hook: push frames as if they came from the input (t = ctx time)
    feed: function (frames) { frames.forEach(push); },
    wav: function (id) { var t = takeById(id || sel); return t ? wav(t) : null; },
    draw: draw,
    sidetone: function () { return !!(g && g.sideOn); }
  };
})();
