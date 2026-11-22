// Up-and-down practice runs (Theory.exerciseSeq 'updown'): for every scale,
// mode and pattern the top note plays ONCE, then the mirrored pattern walks
// back down in whole groups / pairs (never a cut-off first group), and the
// loop seam never repeats the bottom. Pure Node — no browser needed.
const fs = require('fs'), vm = require('vm'), env = require('./env');
const c = { window: {} }; vm.createContext(c);
vm.runInContext(fs.readFileSync(env.ROOT + '/js/theory.js', 'utf8'), c);
const T = c.window.Theory;
let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log('  FAIL', msg); } }

const PATS = ['scale', 'g3', 'g4', 'g5', 'g6', 'g7', 'i2', 'i3', 'i4', 'i5', 'i6', 'i8', 'ss0', 'ss5'];
function unitOf(pat, n) {
  const g = /^g(\d)$/.exec(pat), i = /^i(\d+)/.exec(pat);
  if (g && n >= +g[1]) return +g[1];
  if (i && n > +i[1] - 1) return 2;
  return 1;
}

// paths: Keys-style tonic-to-tonic octaves and the guitar boxes of every mode
const paths = [];
T.SCALE_ORDER.forEach(id => {
  const steps = T.SCALES[id].steps;
  [1, 2].forEach(oct => {
    const p = [];
    for (let o = 0; o < oct; o++) steps.forEach(s => p.push({ midi: 48 + o * 12 + s }));
    p.push({ midi: 48 + oct * 12 });
    paths.push({ name: id + ' keys ' + oct + ' oct', p });
  });
  for (let m = 1; m <= (steps.length === 7 ? 7 : 1); m++) {
    const gp = T.exercisePath({ rootPc: 7, scaleId: id, tuningId: 'standard', maxFret: 22, mode: m, pentBox: steps.length === 5 ? 1 : 0 });
    if (gp.length) paths.push({ name: id + ' guitar mode ' + m, p: gp });
  }
});

paths.forEach(({ name, p }) => PATS.forEach(pat => {
  const up = T.exerciseSeq(p, pat, 'up'), seq = T.exerciseSeq(p, pat, 'updown'), n = p.length;
  const u = unitOf(pat, n), tag = name + ' ' + pat;
  ok(seq.slice(0, up.length).join() === up.join(), tag + ': the way up is unchanged');
  const top = n - 1;
  ok(seq.filter(i => i === top).length === up.filter(i => i === top).length, tag + ': the top note plays once (' + seq.filter(i => i === top).length + 'x)');
  const down = seq.slice(up.length), mirror = up.slice().reverse();
  if (mirror.length > 2 * u) ok(down.join() === mirror.slice(u, mirror.length - u).join(), tag + ': the way down is the whole mirrored pattern');
  ok(seq[seq.length - 1] !== seq[0] || seq.length === 1, tag + ': no doubled bottom at the loop seam');
}));

// the reported case: C major (Ionian), straight scale, 1 octave
const cMaj = [0, 2, 4, 5, 7, 9, 11, 12].map(s => ({ midi: 60 + s }));
const names = s => s.map(i => T.midiName(cMaj[i].midi)).join(' ');
ok(names(T.exerciseSeq(cMaj, 'scale', 'updown')) === 'C4 D4 E4 F4 G4 A4 B4 C5 B4 A4 G4 F4 E4 D4', 'C Ionian scale: ' + names(T.exerciseSeq(cMaj, 'scale', 'updown')));
ok(names(T.exerciseSeq(cMaj, 'g3', 'updown')).indexOf('A4 B4 C5 B4 A4 G4 A4 G4 F4') > 0, 'C Ionian groups of 3 turn on a full group: ' + names(T.exerciseSeq(cMaj, 'g3', 'updown')));
ok(names(T.exerciseSeq(cMaj, 'i3', 'updown')).indexOf('A4 C5 B4 G4 A4 F4') > 0, 'C Ionian 3rds turn on a full pair: ' + names(T.exerciseSeq(cMaj, 'i3', 'updown')));

console.log(fails ? fails + ' FAIL of ' + checks : '  PASS ' + checks + ' up-and-down checks');
process.exit(fails ? 1 : 0);
