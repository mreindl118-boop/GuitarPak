// Voice page end to end on a REAL signal: Chromium's fake capture plays a
// generated stereo WAV — LEFT = a 110 Hz saw (a guitar on UR24C input 1),
// RIGHT = a sung A3, +10 cents, with 5.5 Hz / ±30 cent vibrato (the voice on
// input 2). A "Hold a note" take on Right must find the voice: in tune (the
// vibrato centre, not its swings), about +10 c, vibrato ~5.5/s ±30 c. On
// Left it hears the guitar an octave down (octave-tolerant scoring).
const { chromium } = require('playwright');
const env = require('./env');
const fs = require('fs'), os = require('os'), path = require('path');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

const sr = 48000, secs = 8, n = sr * secs, buf = Buffer.alloc(44 + n * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
let ph = 0, pl = 0;
for (let i = 0; i < n; i++) {
  const t = i / sr, f = 220 * Math.pow(2, (10 + 30 * Math.sin(2 * Math.PI * 5.5 * t)) / 1200);
  ph += 2 * Math.PI * f / sr; pl += 2 * Math.PI * 110 / sr;
  const v = 0.3 * Math.sin(ph) + 0.12 * Math.sin(2 * ph) + 0.05 * Math.sin(3 * ph), g = 0.2 * ((pl / (2 * Math.PI)) % 1 - 0.5);
  buf.writeInt16LE(Math.round(g * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(v * 32767), 46 + i * 4);
}
const wav = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'slvx-')), 'sung.wav');
fs.writeFileSync(wav, buf);

(async () => {
  const b = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=' + wav, '--autoplay-policy=no-user-gesture-required'] });
  const c = await b.newContext();
  await c.addInitScript(() => { ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true')); localStorage.setItem('guitarlab.met.bpm', '120'); });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(env.URL);
  await p.waitForFunction(() => window.SLVocal);
  await p.evaluate(() => App.switchTo('vocal'));
  await p.click('#vx-listen');
  await p.waitForFunction(() => SLVocal.listening);
  await p.waitForTimeout(800);
  await p.click('#vx-mode [data-v="hold"]');
  await p.selectOption('#vx-note', '57');
  const res = {};
  for (const side of ['right', 'left']) {
    await p.click('#vx-ch [data-v="' + side + '"]');
    await p.click('#vx-rec');
    await p.waitForFunction(() => !SLVocal.recording, null, { timeout: 9000 }); // stops by itself after the pattern
    res[side] = await p.evaluate(() => { const k = SLVocal.card; return { grade: k.grade, inTune: k.inTune, off: k.offset, vib: k.vibrato, oct: k.perNote[0].octave, sung: k.sungNotes, tip: k.tip }; });
  }
  const r = res.right, l = res.left;
  console.log('# right = the voice');
  ok(r.sung === 1 && r.oct === 0, 'held A3 found in its own octave');
  ok(r.inTune > 0.9, 'in tune ' + Math.round(r.inTune * 100) + '% (vibrato centre)');
  ok(Math.abs(r.off - 10) < 5, 'average off ' + r.off.toFixed(1) + ' c (sung +10)');
  ok(r.vib && Math.abs(r.vib.rate - 5.5) < 0.8 && Math.abs(r.vib.width - 30) < 10, 'vibrato ' + (r.vib ? r.vib.rate.toFixed(1) + '/s ±' + Math.round(r.vib.width) + ' c' : 'none'));
  ok(r.grade >= 85, 'grade ' + r.grade + ', tip: ' + r.tip);
  console.log('# left = the guitar');
  ok(l.oct === -12 && !l.vib && Math.abs(l.off) < 5, 'hears the A2 guitar an octave down, no vibrato');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
