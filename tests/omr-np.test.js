// OMR engine: Python/numpy semantics helpers (js/omr/np.js)
const H = require('./omr/harness');
const OMR = H.load('np.js');
const py = OMR.py, np = OMR.np;
H.ok(py.round(2.5) === 2 && py.round(3.5) === 4 && py.round(-2.5) === -2 && py.round(2.6) === 3, 'round half to even');
H.ok(py.int(-2.7) === -2 && py.int(2.7) === 2, 'int truncates toward zero');
H.ok(py.floorDiv(-7, 2) === -4 && py.mod(-7, 2) === 1 && py.mod(7, -2) === -1, 'floor division and modulo signs');
H.ok(np.median([3, 1, 2, 4]) === 2.5 && np.median([5, 1, 3]) === 3, 'median');
H.ok(Math.abs(np.std([1, 2, 3, 4]) - 1.118033988749895) < 1e-12, 'population std');
H.ok(np.percentile([1, 2, 3, 4], 25) === 1.75, 'linear percentile');
H.ok(np.argmax([1, 3, 3, 2]) === 1 && np.argmin([2, 1, 1]) === 1, 'argmax/argmin first occurrence');
const s = py.sorted([{ k: 1, i: 0 }, { k: 2, i: 1 }, { k: 1, i: 2 }, { k: 2, i: 3 }], (o) => o.k, true);
H.ok(s.map((o) => o.i).join() === '1,3,0,2', 'sorted(reverse=True) keeps ties in input order');
H.ok(py.max([[1, 2], [1, 3], [1, 3]], (t) => t) [1] === 3 && py.cmp([1, 2], [1, 2, 0]) < 0, 'tuple comparison');
H.done();
