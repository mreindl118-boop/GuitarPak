// OMR engine: Pillow-exact Image.resize (js/omr/pil.js).
// 1. homr's page resize (resize.py: width 1920, height round(h * 1920 / w)) of the autocropped
//    00-input.png must equal 02-resized.png byte for byte on every page.
// 2. tools/omr/dump_cv_pil.py's cases (21-pil.json): crops of the page, gray and colour, up /
//    down / one-axis / vertical-first / boxes, BICUBIC + the other filters.
const crypto = require('crypto');
const H = require('./omr/harness');
const OMR = H.load('pil.js');
const np = OMR.np, pil = OMR.pil;

// resize.py calc_target_image_size
function targetSize(w, h) {
  const tw = 1920;
  if (w === tw) return [w, h];
  return [tw, OMR.py.round(h * (tw / w))];
}

(async () => {
  await H.cv(); // for the gray conversion of the synthetic cases
  const pages = H.pages().filter((p) => H.has(p, '00-input.png') && H.has(p, '02-resized.png'));
  if (!pages.length) { H.skip('pil parity: no fixtures'); H.done(); return; }
  for (const page of pages) {
    const input = H.readPng(H.fix(page, '00-input.png'));
    const crop = H.readJson(H.fix(page, '01-crop.json'));
    const [x, y] = crop.top_left, [ch, cw] = crop.shape;
    // the autocrop of these pages is the whole page (top_left 0,0); a real crop would also
    // repaint the surroundings, so only the plain slice is reproduced here
    const cropped = np.crop(input, y, y + ch, x, x + cw);
    const [tw, th] = targetSize(cropped.w, cropped.h);
    const t0 = Date.now();
    const out = (tw === cropped.w && th === cropped.h) ? cropped : pil.resize(cropped, [tw, th]);
    const ms = Date.now() - t0;
    const want = H.readPng(H.fix(page, '02-resized.png'));
    const c = H.cmpImg(out, want);
    H.ok(c.same, page + ' resize_image ' + cropped.w + 'x' + cropped.h + ' -> ' + tw + 'x' + th + ' == 02-resized.png (' + (c.same ? 'byte-exact' : c.diff + '/' + c.total + ' values differ') + ', ' + ms + ' ms)');

    if (!H.has(page, '21-pil.json')) { H.skip(page + ' synthetic PIL cases: no 21-pil.json (run tools/omr/dump_cv_pil.py)'); continue; }
    const doc = H.readJson(H.fix(page, '21-pil.json'));
    let bad = 0;
    const why = [];
    for (const k of doc.cases) {
      let a = np.crop(input, k.crop[0], k.crop[1], k.crop[2], k.crop[3]);
      if (k.gray) a = OMR.cv2.cvtColor(a, OMR.cv2.COLOR_BGR2GRAY);
      const r = pil.resize(a, k.size, { resample: k.resample, box: k.box || undefined });
      const sha = crypto.createHash('sha1').update(r.data).digest('hex');
      const shapeOk = np.shape(r).join() === k.shape.join();
      if (!shapeOk || sha !== k.sha1) { bad++; if (why.length < 4) why.push(JSON.stringify([k.crop, k.gray, k.size, k.resample, k.box]) + (shapeOk ? ' bytes' : ' shape ' + np.shape(r))); }
    }
    H.ok(!bad, page + ' PIL ' + doc.pillow + ' resize cases: ' + (doc.cases.length - bad) + '/' + doc.cases.length + ' byte-exact' + (bad ? ' -- ' + why.join(' | ') : ''));
  }
  H.done();
})().catch((e) => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
