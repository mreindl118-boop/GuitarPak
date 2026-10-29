// OMR engine: homr's predict_symbols (main.py) on the segmentation masks, against the
// Python reference 06-symbols.json on every page: create_bounding_ellipses (noteheads),
// create_rotated_bounding_boxes (staff fragments, clefs/keys, stems/rests) and the bar line
// candidates from prepare_bar_line_image. Counts and order exact, every box's centre, size,
// angle and corners within the fixture's 4-decimal rounding, polygons and contour lengths exact.
// fitEllipse jitters degenerate notehead contours with cv::theRNG(), whose state carries from
// page to page in the Python process: the pages run here in the same (sorted) order from a
// fresh RNG, so the full set must be present for the later pages to match bit for bit.
const crypto = require('crypto');
const H = require('./omr/harness');
// the foundation only (later engine files may be mid-port), then bar_line_detection.js
const OMR = H.load('model.js');
require(require('path').join(H.ROOT, 'js', 'omr', 'bar_line_detection.js'));
const np = OMR.np, bbx = OMR.bounding_boxes;

const TOL = 0.6e-4; // the fixtures keep 4 decimals

function mask(page, name) { return np.gt(H.readPng(H.fix(page, '05-filtered-' + name + '.png'), { gray: true }), 0); }

// homr: main.py predict_symbols
function predictSymbols(m) {
  const noteheads = bbx.createBoundingEllipses(m.notehead, { minSize: [4, 4] });
  const staffFragments = bbx.createRotatedBoundingBoxes(m.staff, { skipMerging: true, minSize: [5, 1], maxSize: [10000, 100] });
  const clefsKeys = bbx.createRotatedBoundingBoxes(m.clefs_keys, { minSize: [20, 40], maxSize: [1000, 1000] });
  const stemsRest = bbx.createRotatedBoundingBoxes(m.stems_rest);
  const barLineImg = OMR.bar_line_detection.prepareBarLineImage(m.stems_rest);
  const barLines = bbx.createRotatedBoundingBoxes(barLineImg, { skipMerging: true, minSize: [1, 5] });
  return { noteheads, staff_fragments: staffFragments, clefs_keys: clefsKeys, stems_rest: stemsRest, bar_lines: barLines };
}

// one box against its JSON dump; returns [reason or '', worst float deviation]
function cmpBox(js, py) {
  let worst = 0;
  const num = (a, b, what) => {
    const d = Math.abs(a - b);
    if (d > worst) worst = d;
    return d <= TOL ? '' : what + ' ' + a + ' vs ' + b;
  };
  if (js.constructor.name !== py.__type) return ['type ' + js.constructor.name + ' vs ' + py.__type, worst];
  if (js.debugId !== py.debug_id) return ['debug_id ' + js.debugId + ' vs ' + py.debug_id, worst];
  if (js.contours.length / 2 !== py.contours_len) return ['contours_len ' + js.contours.length / 2 + ' vs ' + py.contours_len, worst];
  const pairs = [['center', js.center, py.center], ['size', js.size, py.size], ['top_left', js.topLeft, py.top_left],
    ['bottom_left', js.bottomLeft, py.bottom_left], ['top_right', js.topRight, py.top_right], ['bottom_right', js.bottomRight, py.bottom_right]];
  for (const [what, a, b] of pairs) for (let k = 0; k < 2; k++) { const r = num(a[k], b[k], what + '[' + k + ']'); if (r) return [r, worst]; }
  let r = num(js.angle, py.angle, 'angle');
  if (r) return [r, worst];
  if (Array.isArray(py.polygon)) {
    const flat = py.polygon.flat();
    if (flat.length !== js.polygon.length || flat.some((v, i) => v !== js.polygon[i])) return ['polygon ' + Array.from(js.polygon) + ' vs ' + flat, worst];
  } else {
    const sha = crypto.createHash('sha1').update(Buffer.from(js.polygon.buffer, js.polygon.byteOffset, js.polygon.byteLength)).digest('hex').slice(0, 12);
    if (sha !== py.polygon.sha1 || js.polygon.length !== py.polygon.__nd[0] * py.polygon.__nd[1]) return ['polygon sha1 ' + sha + ' vs ' + py.polygon.sha1, worst];
  }
  return ['', worst];
}

(async () => {
  await H.needCv();
  const pages = H.pages().filter((p) => H.has(p, '06-symbols.json'));
  if (!pages.length) { H.skip('boxes parity: no 06-symbols.json fixtures'); H.done(); return; }
  if (pages.length < 7) H.skip('only ' + pages.length + ' pages: degenerate noteheads of later pages may differ (theRNG carries over from the missing pages)');
  OMR.cv2.resetRNG(); // a fresh Python process
  let totalBoxes = 0, totalBad = 0, totalMs = 0;
  for (const page of pages) {
    const m = {};
    for (const n of ['staff', 'stems_rest', 'notehead', 'clefs_keys']) m[n] = mask(page, n);
    const t0 = Date.now();
    const sym = predictSymbols(m);
    const ms = Date.now() - t0;
    totalMs += ms;
    const want = H.readJson(H.fix(page, '06-symbols.json'));
    for (const key of ['noteheads', 'staff_fragments', 'clefs_keys', 'stems_rest', 'bar_lines']) {
      const js = sym[key], py = want[key];
      let bad = 0, worst = 0, first = '';
      if (js.length !== py.length) first = 'count ' + js.length + ' vs ' + py.length;
      const n = Math.min(js.length, py.length);
      for (let i = 0; i < n; i++) {
        const [r, w] = cmpBox(js[i], py[i]);
        worst = Math.max(worst, w);
        if (r) { bad++; if (!first) first = '[' + i + '] ' + r; }
      }
      totalBoxes += py.length; totalBad += bad + (js.length !== py.length ? 1 : 0);
      H.ok(js.length === py.length && !bad, page + ' ' + key + ': ' + (n - bad) + '/' + py.length + ' boxes exact (max deviation ' + worst.toExponential(1) + ')' + (first ? ' -- ' + first : ''));
    }
    console.log('  ' + page + ': predict_symbols in ' + ms + ' ms');
  }
  console.log('  ' + totalBoxes + ' boxes, ' + totalBad + ' differ; ' + totalMs + ' ms in total');
  H.done();
})().catch((e) => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
