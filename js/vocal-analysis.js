/* soundLAB vocal analysis (window.SLVocalAnalysis) — pure functions that turn
 * a take's pitch frames into the Voice page's score card. No DOM, no audio:
 * runs in Node for tests. Frames come from js/vocal.js every hop:
 *   { t (s from take start), midi (float, NaN = no pitch), clarity (NSDF peak
 *     0..1), rms (0..1), peak (0..1, max |sample| in the hop) }
 * Targets (optional): [{ t, d, midi }] in the same time base. Without targets
 * the take is split into the notes you actually held (segment()).
 * score() returns plain numbers + one tip; nothing here guesses beyond what
 * the frames show (a metric with too little data is null, never invented).
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SLVocalAnalysis = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var IN_TUNE = 25;      // cents either side that count as "in tune"
  var LAND = 50;         // cents: "landed" once inside this for LAND_HOLD s
  var LAND_HOLD = 0.1;
  var CLARITY_MIN = 0.8; // NSDF clarity below this = not a sung pitch

  function db(x) { return x > 0 ? 20 * Math.log(x) / Math.LN10 : -120; }
  function mean(a) { if (!a.length) return NaN; var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function std(a) {
    if (a.length < 2) return NaN;
    var m = mean(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / (a.length - 1));
  }
  function median(a) {
    if (!a.length) return NaN;
    var b = a.slice().sort(function (x, y) { return x - y; }), h = b.length >> 1;
    return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2;
  }
  function pct(a, p) {
    if (!a.length) return NaN;
    var b = a.slice().sort(function (x, y) { return x - y; });
    return b[Math.min(b.length - 1, Math.max(0, Math.round(p * (b.length - 1))))];
  }
  function voiced(f, gate) {
    return f && isFinite(f.midi) && f.clarity >= CLARITY_MIN && f.rms >= gate;
  }
  // centred moving average over `w` seconds (smooths vibrato away)
  function smooth(ts, xs, w) {
    var out = new Array(xs.length), j0 = 0, j1 = 0, s = 0;
    for (var i = 0; i < xs.length; i++) {
      while (j1 < xs.length && ts[j1] <= ts[i] + w / 2) { s += xs[j1]; j1++; }
      while (ts[j0] < ts[i] - w / 2) { s -= xs[j0]; j0++; }
      out[i] = s / (j1 - j0);
    }
    return out;
  }
  // least-squares slope (units per second)
  function slope(ts, xs) {
    if (xs.length < 3) return NaN;
    var mt = mean(ts), mx = mean(xs), n = 0, d = 0;
    for (var i = 0; i < xs.length; i++) { n += (ts[i] - mt) * (xs[i] - mx); d += (ts[i] - mt) * (ts[i] - mt); }
    return d ? n / d : NaN;
  }

  // the noise gate: twice the quiet floor, but never closer than 20 dB under
  // the loud part (a take that is all singing has no quiet floor to read)
  function gateFor(frames) {
    var r = frames.map(function (f) { return f.rms || 0; }).filter(function (x) { return x > 0; });
    if (!r.length) return 0.004;
    return Math.max(0.004, Math.min(pct(r, 0.1) * 2, pct(r, 0.95) / 10));
  }

  // Notes you actually held, when there were no targets: runs of voiced
  // frames that stay within half a semitone of their running median.
  function segment(frames, gate) {
    if (gate == null) gate = gateFor(frames);
    var notes = [], cur = null, gapT = 0;
    function close() {
      if (cur && cur.frames.length >= 4) {
        var m = median(cur.frames.map(function (f) { return f.midi; }));
        var t0 = cur.frames[0].t, t1 = cur.frames[cur.frames.length - 1].t;
        notes.push({ t: t0, d: Math.max(0.05, t1 - t0), midi: Math.round(m), found: true });
      }
      cur = null;
    }
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      if (!voiced(f, gate)) {
        if (cur && f.t - gapT > 0.12) close();
        continue;
      }
      gapT = f.t;
      if (cur) {
        var m = median(cur.frames.slice(-8).map(function (x) { return x.midi; }));
        if (Math.abs(f.midi - m) > 0.6) close();
      }
      if (!cur) cur = { frames: [] };
      cur.frames.push(f);
    }
    close();
    return notes;
  }

  // one target note against the frames inside it
  function noteStats(target, frames, gate, lag) {
    var t0 = target.t + lag, t1 = target.t + target.d + lag;
    var inside = frames.filter(function (f) { return f.t >= t0 && f.t < t1; });
    var v = inside.filter(function (f) { return voiced(f, gate); });
    var res = { midi: target.midi, t: target.t, d: target.d, frames: v.length, sung: v.length >= 3 && v[v.length - 1].t - v[0].t >= Math.min(0.12, target.d / 3) };
    if (!res.sung) return res;
    // octave-tolerant: a note sung an octave off is judged in its own octave
    // only when it is a whole octave away (a man singing a C5 target as C4)
    var med = median(v.map(function (f) { return f.midi; }));
    var oct = Math.round((med - target.midi) / 12) * 12;
    res.octave = oct;
    var ts = v.map(function (f) { return f.t; });
    var cents = v.map(function (f) { return (f.midi - target.midi - oct) * 100; });
    res.onset = ts[0] - target.t - lag; // s after the target started
    // landing: first time the pitch stays inside LAND for LAND_HOLD
    var land = null;
    for (var i = 0; i < cents.length && land == null; i++) {
      if (Math.abs(cents[i]) > LAND) continue;
      var j = i;
      while (j < cents.length && Math.abs(cents[j]) <= LAND) j++;
      if (ts[j - 1] - ts[i] >= LAND_HOLD || j === cents.length && ts[j - 1] - ts[i] >= LAND_HOLD / 2) land = i;
    }
    res.landed = land != null;
    res.landing = land != null ? ts[land] - ts[0] : null;
    var after = land != null ? cents.slice(land) : cents, at = land != null ? ts.slice(land) : ts;
    // in tune = the centre of the pitch (vibrato smoothed out) within 25 c
    var centre = smooth(ts, cents, 0.22);
    res.inTune = centre.filter(function (c) { return Math.abs(c) <= IN_TUNE; }).length / centre.length;
    res.offset = mean(after);
    res.absOff = mean(after.map(Math.abs));
    // steadiness = wobble of the vibrato-free line; vibrato = what's left
    var sm = smooth(at, after, 0.22);
    res.wobble = std(sm);
    var resid = after.map(function (c, k) { return c - sm[k]; });
    var dur = at.length ? at[at.length - 1] - at[0] : 0;
    res.held = dur;
    res.drift = dur >= 0.8 ? slope(at, sm) : null;
    var cross = 0;
    for (var k = 1; k < resid.length; k++) if ((resid[k - 1] < 0) !== (resid[k] < 0)) cross++;
    var rate = dur > 0.4 ? cross / 2 / dur : 0, ext = std(resid) * Math.SQRT2;
    res.vibrato = dur >= 0.6 && rate >= 4 && rate <= 8.5 && ext >= 15 ? { rate: rate, width: ext } : null;
    return res;
  }

  /* score(frames, targets?, opts?) -> card
   *   opts.lag   s to shift targets by (output + input latency), default 0
   *   opts.timed true when targets came with a beat (timing is scored)
   */
  function score(frames, targets, opts) {
    opts = opts || {};
    frames = (frames || []).filter(function (f) { return f && isFinite(f.t); });
    var gate = gateFor(frames), lag = +opts.lag || 0;
    var free = !targets || !targets.length;
    var notes = free ? segment(frames, gate) : targets;
    var stats = notes.map(function (n) { return noteStats(n, frames, gate, free ? 0 : lag); });
    var sung = stats.filter(function (s) { return s.sung; });
    var v = frames.filter(function (f) { return voiced(f, gate); });
    // noise = the gaps that are clearly quieter than the singing (10 dB+)
    var sungRms = median(v.map(function (f) { return f.rms; }));
    var quiet = frames.filter(function (f) { return !voiced(f, gate) && f.rms > 0 && (!isFinite(sungRms) || f.rms < sungRms / 3); });
    var w = function (key) { // frame-weighted mean of a per-note stat
      var tot = 0, n = 0;
      sung.forEach(function (s) { if (s[key] != null && isFinite(s[key])) { tot += s[key] * s.frames; n += s.frames; } });
      return n ? tot / n : null;
    };
    var vib = sung.filter(function (s) { return s.vibrato; });
    var landings = sung.filter(function (s) { return s.landing != null; }).map(function (s) { return s.landing; });
    var drifts = sung.filter(function (s) { return s.drift != null && isFinite(s.drift); }).map(function (s) { return s.drift; });
    var loud = v.map(function (f) { return db(f.rms); });
    var card = {
      free: free,
      notes: notes.length,
      sungNotes: sung.length,
      missed: free ? 0 : stats.length - sung.length,
      voicedSec: v.length && frames.length > 1 ? v.length * ((frames[frames.length - 1].t - frames[0].t) / (frames.length - 1)) : 0,
      inTune: w('inTune'),
      offset: w('offset'),
      absOff: w('absOff'),
      landing: landings.length ? median(landings) : null,
      wobble: w('wobble'),
      drift: drifts.length ? median(drifts) : null,
      vibrato: vib.length ? { rate: mean(vib.map(function (s) { return s.vibrato.rate; })), width: mean(vib.map(function (s) { return s.vibrato.width; })), notes: vib.length } : null,
      timing: (!free && opts.timed && sung.length) ? median(sung.map(function (s) { return s.onset; })) : null,
      loudness: loud.length ? mean(loud) : null,
      dynamics: loud.length > 5 ? pct(loud, 0.9) - pct(loud, 0.1) : null,
      clipped: frames.filter(function (f) { return f.peak >= 0.985; }).length,
      noise: quiet.length >= 10 ? db(pct(quiet.map(function (f) { return f.rms; }), 0.25)) : null, // the quieter gaps, not breaths
      clarity: v.length ? mean(v.map(function (f) { return f.clarity; })) : null,
      perNote: stats
    };
    card.snr = card.loudness != null && card.noise != null ? card.loudness - card.noise : null;
    card.grade = grade(card);
    card.tip = tip(card);
    return card;
  }

  // 0-100: mostly pitch, then landing and steadiness; a missed note costs
  function grade(c) {
    if (c.inTune == null) return null;
    var g = c.inTune * 70;
    g += 15 * (c.landing == null ? 0.5 : Math.max(0, 1 - c.landing / 0.4));
    g += 15 * (c.wobble == null ? 0.5 : Math.max(0, 1 - c.wobble / 30));
    if (c.notes && !c.free) g *= c.sungNotes / c.notes;
    return Math.round(Math.max(0, Math.min(100, g)));
  }

  function clarityWord(c) {
    if (c == null) return '';
    return c >= 0.93 ? 'Clear' : c >= 0.86 ? 'A little airy' : 'Breathy';
  }

  // ONE plain next step, most urgent first
  function tip(c) {
    if (!c.voicedSec || c.voicedSec < 0.3) return 'No singing heard. Check the input side (Left or Right) and that the meter moves when you sing.';
    if (c.clipped > 3) return 'Your input is too loud and clipping. Turn the gain down a little on the UR24C (input 2).';
    if (c.snr != null && c.snr < 18) return 'There is a lot of noise under your voice. Sing closer to the mic or raise the gain a little.';
    if (c.missed && c.missed >= Math.max(1, c.notes / 3)) return 'Some notes were not sung. Take a breath before the pattern starts and sing every note.';
    if (c.offset != null && c.offset > 15) return 'You run a little sharp. Relax your throat and do not push. Think of landing on top of the note gently.';
    if (c.offset != null && c.offset < -15) return 'You run a little flat. Use more breath support and think of the note as slightly higher.';
    if (c.landing != null && c.landing > 0.25) return 'You slide into notes. Hear the note in your head first, then start right on it.';
    if (c.wobble != null && c.wobble > 15) return 'Held notes wobble. Keep the air steady, like a slow even stream.';
    if (c.drift != null && Math.abs(c.drift) > 20) return 'Long notes ' + (c.drift > 0 ? 'creep sharp' : 'sag flat') + ' as you hold them. Keep the support going to the end of the note.';
    if (c.timing != null && c.timing > 0.15) return 'You come in late. Breathe on the beat before, then start right on the beat.';
    if (c.clarity != null && c.clarity < 0.86) return 'The tone is breathy. Close the gap a little: a gentle "ng" hum, then open to the vowel.';
    if (c.inTune != null && c.inTune >= 0.85) return 'Great take. Try a higher pattern or a faster tempo next.';
    return 'Good work. Sing it once more and listen back for the notes that turned yellow or red.';
  }

  return { score: score, segment: segment, gateFor: gateFor, clarityWord: clarityWord, IN_TUNE: IN_TUNE, _t: { smooth: smooth, slope: slope, median: median, noteStats: noteStats } };
});
