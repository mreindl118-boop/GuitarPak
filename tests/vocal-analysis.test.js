// Pure Node: js/vocal-analysis.js (the Voice page's take score) on synthetic
// pitch frames — in tune vs sharp, landing time, wobble vs vibrato, drift,
// missed targets, free (no-target) note splitting, clipping/noise tips, and
// the pitch detector itself on a synthetic sung tone (vibrato + breath noise).
const A = require('../js/vocal-analysis.js');
const D = require('../js/pitch-detector.js');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

const HOP = 0.01;
// frames for one held note: fn(t) -> cents off target
function note(t0, dur, midi, fn, extra) {
  const out = [];
  for (let t = 0; t < dur; t += HOP) out.push(Object.assign({ t: t0 + t, midi: midi + fn(t) / 100, clarity: 0.96, rms: 0.1, peak: 0.3 }, extra || {}));
  return out;
}
function silence(t0, dur, rms) {
  const out = [];
  for (let t = 0; t < dur; t += HOP) out.push({ t: t0 + t, midi: NaN, clarity: 0, rms: rms == null ? 0.0005 : rms, peak: 0.002 });
  return out;
}

console.log('# in tune, steady');
let fr = silence(0, 0.3).concat(note(0.3, 1.5, 57, () => 3)).concat(silence(1.8, 0.3));
let c = A.score(fr, [{ t: 0.3, d: 1.5, midi: 57 }]);
ok(c.inTune > 0.95 && Math.abs(c.offset - 3) < 1, 'steady A3 +3c: in tune ' + c.inTune.toFixed(2) + ', offset ' + c.offset.toFixed(1));
ok(c.wobble < 2 && c.vibrato === null, 'no wobble, no vibrato: ' + c.wobble.toFixed(2));
ok(c.grade >= 90, 'grade ' + c.grade);
ok(/Great take/.test(c.tip), 'tip praises: ' + c.tip);
ok(c.snr > 40 && c.clipped === 0, 'snr ' + c.snr.toFixed(0) + ' dB, no clipping');

console.log('# sharp');
c = A.score(silence(0, 0.3).concat(note(0.3, 1.5, 57, () => 30)), [{ t: 0.3, d: 1.5, midi: 57 }]);
ok(c.inTune < 0.1 && c.offset > 25, 'A3 +30c: in tune ' + c.inTune.toFixed(2));
ok(/sharp/.test(c.tip), 'tip says sharp: ' + c.tip);

console.log('# slide in (scoop) then hold');
c = A.score(silence(0, 0.2).concat(note(0.2, 1.4, 57, t => t < 0.35 ? -200 + 200 * t / 0.35 : 0)), [{ t: 0.2, d: 1.4, midi: 57 }]);
ok(c.landing > 0.25 && c.landing < 0.4, 'landing ' + c.landing.toFixed(2) + ' s');
ok(/slide/.test(c.tip), 'tip: ' + c.tip);

console.log('# vibrato is not wobble');
c = A.score(silence(0, 0.2).concat(note(0.2, 2, 57, t => 35 * Math.sin(2 * Math.PI * 5.5 * t))), [{ t: 0.2, d: 2, midi: 57 }]);
ok(c.vibrato && Math.abs(c.vibrato.rate - 5.5) < 0.8 && c.vibrato.width > 20, 'vibrato ' + (c.vibrato && c.vibrato.rate.toFixed(1)) + ' Hz, ' + (c.vibrato && c.vibrato.width.toFixed(0)) + 'c');
ok(c.wobble < 8, 'steady centre under vibrato: wobble ' + c.wobble.toFixed(1));

console.log('# drift flat');
c = A.score(silence(0, 0.2).concat(note(0.2, 2, 57, t => -40 * t)), [{ t: 0.2, d: 2, midi: 57 }]);
ok(c.drift < -30, 'drift ' + c.drift.toFixed(0) + ' c/s');

console.log('# missed notes + timing');
fr = silence(0, 0.2).concat(note(0.35, 0.4, 60, () => 0)).concat(silence(0.75, 0.25)).concat(silence(1.0, 0.5, 0.0005)).concat(note(1.65, 0.35, 64, () => 0));
c = A.score(fr, [{ t: 0.2, d: 0.5, midi: 60 }, { t: 0.7, d: 0.5, midi: 62 }, { t: 1.2, d: 0.3, midi: 63 }, { t: 1.5, d: 0.5, midi: 64 }], { timed: true });
ok(c.missed === 2 && c.sungNotes === 2, 'missed ' + c.missed + ' of ' + c.notes);
ok(c.timing > 0.12, 'late by ' + c.timing.toFixed(2) + ' s');
ok(/not sung/.test(c.tip), 'tip: ' + c.tip);

console.log('# free singing splits into notes');
fr = silence(0, 0.2).concat(note(0.2, 0.5, 60, () => 0), note(0.7, 0.5, 62, () => 5), note(1.2, 0.5, 64, () => -5), silence(1.7, 0.3));
c = A.score(fr);
ok(c.free && c.notes === 3, 'found ' + c.notes + ' notes: ' + c.perNote.map(n => n.midi).join(' '));

console.log('# clipping + noise');
c = A.score(silence(0, 0.3, 0.02).concat(note(0.3, 1, 57, () => 0, { peak: 1, rms: 0.4 })));
ok(/clipping/.test(c.tip), 'clipping tip: ' + c.tip);
c = A.score(silence(0, 0.5, 0.03).concat(note(0.5, 1, 57, () => 0, { rms: 0.1 })));
ok(/noise/.test(c.tip), 'noise tip (snr ' + (c.snr || 0).toFixed(0) + '): ' + c.tip);
c = A.score(silence(0, 1));
ok(/No singing/.test(c.tip) && c.grade === null, 'silence: ' + c.tip);

console.log('# detector on a sung tone');
const sr = 48000, n = 2048, f0 = 220;
let ph = 0, buf = new Float32Array(n), seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
for (let i = 0; i < n; i++) {
  ph += 2 * Math.PI * f0 / sr;
  buf[i] = 0.3 * Math.sin(ph) + 0.15 * Math.sin(2 * ph) + 0.08 * Math.sin(3 * ph) + 0.03 * rnd();
}
const d = D.detect(buf, sr, { minFrequency: 70, maxFrequency: 1100 });
ok(d && Math.abs(d.midiFloat - 57) < 0.05 && d.clarity > 0.85, 'A3 detected: ' + (d && d.midiFloat.toFixed(2)) + ' clarity ' + (d && d.clarity.toFixed(2)));

console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails ? 1 : 0);
