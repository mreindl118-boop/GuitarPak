// Pure shared-color profile tests; no browser, MIDI permissions or hardware.
const P = require('../js/note-palette');
const { createHash } = require('crypto');
let checks = 0;
function ok(value, label) { if (!value) throw new Error(label); checks++; console.log('  PASS', label); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const degree = ['#ffab47','#e8d44d','#7ad97a','#4cc9b0','#6ea8fe','#b48ef0','#ff85b3'];
const note = ['#ff7583','#ee9468','#edb75a','#f2de5f','#c6f047','#82ef6c','#6cefad','#39efef','#6cb8ef','#849bf5','#a392f6','#d27efc'];
const bytes = Buffer.from(P.table.flatMap(c => [c >> 16, (c >> 8) & 255, c & 255]));
ok(P.table.length === 128 && P.rgb(0) === '#000000' && P.rgb(127) === '#ffffff', 'documented program profile has 128 entries, zero off and 127 white');
ok(createHash('sha256').update(bytes).digest('hex') === '88c6418070feaecb35169c0ccdc123a391b2d7b084b9f9b8720ebeb6dde780b2', 'all 384 palette RGB bytes match the archived default LittleFoot program');
ok(P.table.every((_, i) => i === 0 || P.nearest(P.rgb(i)) === i), 'each nonzero supported color maps back to its exact velocity');
ok(P.nearest('#000000') > 0 && P.nearest('#ffffff') === 127 && P.rgb(128) === null && P.rgb(-1) === null && P.rgb(1.5) === null, 'off is never chosen for a pitch color; unsupported velocity values reject');
ok([null, '', '#abc', '#gg0000'].every(x => P.nearest(x) === null), 'malformed custom colors reject without invented device values');
const intervals = P.intervals(degree), notes = P.notes(note);
ok(new Set(intervals).size === 12 && new Set(notes).size === 12, 'both default modes give all twelve chromatic pitches distinct mapped colors');
for (const [mode, colors] of [['interval', intervals], ['note', notes]]) {
  ok([1,3,6,8,10].every(i => colors[i] === P.quantize(P.midpoint(colors[i-1], colors[i+1]))), mode + ' altered pitches are quantized blends of adjacent natural anchors');
  ok(colors.every(c => P.rgb(P.nearest(c)) === c), mode + ' screen values belong exactly to the supported LED profile');
}
ok(same(P.naturals.map((n,i) => intervals[n]), P.mapped(degree)), 'R 2 3 4 5 6 7 retain their seven configured natural anchors');
ok(same(P.naturals.map(n => notes[n]), P.naturals.map(n => P.quantize(note[n]))), 'C D E F G A B retain their configured absolute natural anchors');
const aliases = [['C#','Db',61], ['D♭4','C♯4',1], ['B#','C',0], ['Cb','B',11], ['E#','F',5], ['Fb','E',4], ['F##','G',7]];
ok(aliases.every(group => new Set(group.map(P.pc)).size === 1), 'sharp/flat, octave and edge enharmonic spellings resolve to one pitch identity');
ok(['H', 'C###', {}, NaN, Infinity].every(v => P.pc(v) === null), 'invalid pitches fail explicitly');
ok(Array.from({length:12}, (_, root) => root).every(root => Array.from({length:128}, (_, n) => n).every(n => {
  const sample = P.sample(n, root, 'interval', degree, note);
  return sample.color === intervals[((n-root)%12+12)%12] && sample.velocity === P.nearest(sample.color);
})), 'every MIDI pitch/root pair uses chromatic root-relative identity and exact matching LED index');
ok(Array.from({length:12}, (_, root) => root).every(root => Array.from({length:12}, (_, n) => n).every(n => P.sample(n,root,'note',degree,note).color === notes[n])), 'absolute Note Names identity remains unchanged when the selected root changes');
const accidentalEdit = note.slice(); [1,3,6,8,10].forEach(n => { accidentalEdit[n] = '#000000'; });
ok(same(P.notes(accidentalEdit), notes), 'legacy custom accidental entries cannot override natural-derived blends');
const naturalEdit = note.slice(); naturalEdit[4] = '#2040ff'; const edited = P.notes(naturalEdit);
ok(edited[4] === '#5e6dff' && edited[3] !== notes[3] && edited[6] === notes[6] && edited[2] === notes[2], 'a custom natural maps once and updates only neighboring altered-pitch blends');
const callerCopy = P.intervals(degree); callerCopy[0] = '#000000';
ok(P.intervals(degree)[0] === intervals[0] && Object.isFrozen(P.table), 'caller edits cannot corrupt the cached profile or palette');
console.log('ALL PASS (' + checks + ' checks)');
