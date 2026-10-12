// Keys page scale fingering (js/piano.js) vs the textbook fingerings of all
// 12 major keys, both hands, ascending. Pure Node — no browser needed.
const fs = require('fs'), env = require('./env');
const src = fs.readFileSync(env.ROOT + '/js/piano.js', 'utf8');
const Theory = { mod12: n => ((n % 12) + 12) % 12 };
let hand = 'right';
eval(src.slice(src.indexOf('  var BLACK_PC'), src.indexOf('  function fingerFor(')) +
  src.slice(src.indexOf('  function fingerGeneric('), src.indexOf('\n  }\n', src.indexOf('  function fingerGeneric(')) + 4));
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const STD = { C: ['12312345', '54321321'], G: ['12312345', '54321321'], D: ['12312345', '54321321'], A: ['12312345', '54321321'],
  E: ['12312345', '54321321'], B: ['12312345', '43214321'], 'F#': ['23412312', '43213214'], Db: ['23123412', '32143213'],
  Ab: ['34123123', '32143213'], Eb: ['31234123', '32143213'], Bb: ['41231234', '32143213'], F: ['12341234', '54321321'] };
let fails = 0;
const ok = (c, m) => { if (c) console.log('  PASS', m); else { fails++; console.log('  FAIL', m); } };
for (let r = 0; r < 12; r++) {
  const path = [0, 2, 4, 5, 7, 9, 11, 12].map(s => ({ midi: 60 + r + s }));
  hand = 'right'; const rh = fingering(path).join('');
  hand = 'left'; const lh = fingering(path).join('');
  ok(rh === STD[NAMES[r]][0] && lh === STD[NAMES[r]][1], NAMES[r] + ' major RH ' + rh + ' LH ' + lh);
}
// the thumb never lands on a black key in any 7-note scale/mode the app offers
const SCALES = { minor: [0, 2, 3, 5, 7, 8, 10, 12], harm: [0, 2, 3, 5, 7, 8, 11, 12], mel: [0, 2, 3, 5, 7, 9, 11, 12], dorian: [0, 2, 3, 5, 7, 9, 10, 12] };
const BLACK = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
let thumbs = 0;
for (const k in SCALES) for (let r = 0; r < 12; r++) for (const h of ['right', 'left']) {
  hand = h;
  const path = SCALES[k].map(s => ({ midi: 60 + r + s })), f = fingering(path);
  f.forEach((x, i) => { if (x === 1 && BLACK[(r + SCALES[k][i]) % 12]) thumbs++; });
}
ok(thumbs === 0, 'no thumb on a black key in minor / harmonic / melodic / dorian, any root, either hand (' + thumbs + ')');
console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
process.exit(fails ? 1 : 0);
