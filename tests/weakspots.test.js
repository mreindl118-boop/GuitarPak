// Weak-spot map (2.1): per-item speed is saved, the Progress tab draws the
// neck / keyboard colored by accuracy + speed, a tap drills exactly that spot,
// and note-level results show the small map.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  // guitar: A on low E fret 5 is weak (1 of 4, slow), open low E strong + fast,
  // G on the D string fret 5 slow but right (shaky/good); bass + keys: one each
  const items = {
    'gn:6:0:5': [1, 4, 5200], 'gf:6:0:9': [0, 2],
    'gn:6:0:0': [6, 6, 900],
    'gn:6:2:5': [3, 3, 5500],
    'gn:4:1:3': [0, 3],
    'kn:6': [1, 5, 4000], 'kf:0': [5, 5, 800]
  };
  await ctx.addInitScript((items) => {
    localStorage.setItem('soundlab2.help.seen', 'true');
    localStorage.setItem('soundlab2.help.done', 'true');
    localStorage.setItem('soundlab2.qz.landed', 'true');
    if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('soundlab2.qz.items', JSON.stringify(items)); }
  }, items);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.SLQuiz && window.App && App.practiceInstrument);

  // ---- scoring ----
  const sc = await page.evaluate(() => {
    const W = SLQuiz.weakSpots;
    return { fastAll: W.score(5, 5, 1500), slowAll: W.score(5, 5, 7000), none: W.score(0, 0, 0),
      bands: [W.band(0.9), W.band(0.7), W.band(0.5), W.band(0.1), W.band(null)] };
  });
  ok(sc.fastAll === 1, 'all right + fast = full score');
  ok(Math.abs(sc.slowAll - 0.6) < 1e-9, 'all right but slow = 0.6');
  ok(sc.none === null, 'untried spot has no score');
  ok(sc.bands.join() === 'strong,good,shaky,weak,none', 'bands: ' + sc.bands.join());

  // ---- guitar map ----
  const g = await page.evaluate(() => {
    App.practiceInstrument.set('guitar'); App.switchTo('quiz'); SLQuiz.tab('progress');
    const W = SLQuiz.weakSpots, sp = W.spots('guitar');
    const by = id => sp.filter(x => x.id === id)[0];
    const card = document.getElementById('qz-wscard');
    return { kind: W.kind(), n: sp.length, a5: by('n0:5'), e0: by('n0:0'), g5: by('n2:5'),
      weakest: W.weakest('guitar').map(x => x.id), card: !!card,
      dots: card ? card.querySelectorAll('.qz-wsdot').length : 0,
      weakDots: card ? card.querySelectorAll('.qz-wsdot.b-weak').length : 0,
      label: card ? card.querySelector('.qz-wsdot.b-weak').getAttribute('aria-label') : '',
      drillBtn: !!document.getElementById('qz-ws-drill'), lumiBtn: !!document.getElementById('qz-ws-lumi') };
  });
  ok(g.kind === 'guitar' && g.n === 78, 'guitar map = 6 strings x 13 frets');
  ok(g.a5.n === 6 && g.a5.r === 1 && g.a5.band === 'weak', 'A on low E fret 5 adds name + find stats and is Weak');
  ok(g.e0.band === 'strong', 'open low E is Strong');
  ok(g.g5.band === 'good', 'right-but-slow spot is Good, not Strong (' + g.g5.band + ')');
  ok(g.weakest[0] === 'n0:5', 'weakest spot listed first');
  ok(g.card && g.dots === 78, 'Progress tab shows the Weak spots card with 78 spots');
  ok(g.weakDots === 1 && /fret 5/.test(g.label) && /17% right/.test(g.label), 'weak spot has a readable label: ' + g.label);
  ok(g.drillBtn && !g.lumiBtn, 'guitar: Drill my weak spots, no keyboard button');

  // ---- tap a spot = drill exactly that spot ----
  const d = await page.evaluate(() => {
    document.querySelector('#qz-wscard .qz-wsdot.b-weak').click();
    const c = SLQuiz.cur, seen = [];
    for (let i = 0; i < 4; i++) {
      const q = SLQuiz.q; seen.push(q.item);
      if (q.kind === 'choice') SLQuiz.pick(q.correct);
      else App.emit('midi:note', { on: true, midi: 40 + 12 + ((q.pc - 4 + 12) % 12), vel: 90 });
      if (SLQuiz.view === 'run' && SLQuiz.cur.answered) document.getElementById('qz-act').click();
    }
    return { view: SLQuiz.view, spot: c.spot, drill: c.drill, n: c.n, seen,
      tag: document.querySelector('.qz-lvltag, .qz-runtag') ? document.body.innerText.indexOf('weak spots') >= 0 : null };
  });
  ok(d.spot && d.drill.join() === 'gn:6:0:5,gf:6:0:9', 'tapping the spot starts a spot drill on its two items');
  ok(d.seen.every(k => d.drill.indexOf(k) >= 0), 'every drill question is that spot: ' + d.seen.join(' '));
  ok(d.n === 5, 'a one-spot drill is 5 questions');

  // ---- speed is saved for right answers ----
  const sv = await page.evaluate(() => {
    SLQuiz.stop && SLQuiz.stop();
    SLQuiz.weakSpots.drill(['gn:6:3:2']);
    const q = SLQuiz.q;
    SLQuiz.pick(q.correct);
    return JSON.parse(localStorage.getItem('soundlab2.qz.items'))['gn:6:3:2'];
  });
  ok(sv && sv[0] === 1 && sv[1] === 1 && sv[2] > 0 && sv[3] > 19000, 'a right answer saves [right, asked, ms, day]: ' + JSON.stringify(sv));

  // ---- finishing a note level shows the small map ----
  const dn = await page.evaluate(() => {
    const lid = SLQuiz.levels().filter(id => /neck\/1$/.test(id))[0];
    SLQuiz.start(lid);
    for (let i = 0; i < 10; i++) { const q = SLQuiz.q; SLQuiz.pick(q.correct); if (SLQuiz.view === 'run') document.getElementById('qz-act').click(); }
    return { view: SLQuiz.view, map: !!document.querySelector('.qz-wsdone .qz-wsneck') };
  });
  ok(dn.view === 'done' && dn.map, 'results of a Fretboard note level show the weak-spot map');

  // ---- bass + keys ----
  const bk = await page.evaluate(() => {
    App.practiceInstrument.set('bass'); SLQuiz.tab('progress');
    const W = SLQuiz.weakSpots, b = { kind: W.kind(), n: W.spots().length, weak: W.weakest().map(x => x.id), dots: document.querySelectorAll('#qz-wscard .qz-wsdot').length };
    App.practiceInstrument.set('piano'); SLQuiz.tab('progress');
    const k = { kind: W.kind(), keys: document.querySelectorAll('#qz-wscard .qz-wskey').length,
      weak: W.weakest().map(x => x.label), lumi: !!document.getElementById('qz-ws-lumi') };
    document.querySelector('#qz-wscard .qz-wskey.b-weak').click();
    k.drill = SLQuiz.cur && SLQuiz.cur.drill.join();
    k.item = SLQuiz.q && SLQuiz.q.item;
    App.practiceInstrument.set('drums'); SLQuiz.stop && SLQuiz.stop(); SLQuiz.tab('progress');
    const dr = { kind: W.kind(), card: !!document.getElementById('qz-wscard') };
    return { b, k, dr };
  });
  ok(bk.b.kind === 'bass' && bk.b.n === 52 && bk.b.dots === 52, 'bass map = 4 strings x 13 frets');
  ok(bk.b.weak[0] === 'n1:3', 'bass weak spot found (A string fret 3)');
  ok(bk.k.kind === 'keys' && bk.k.keys === 12, 'keys map = 12 keys');
  ok(bk.k.weak[0] === 'F♯/G♭', 'F sharp is the weak key');
  ok(bk.k.lumi, 'keys card offers Light them on the LUMI');
  ok(bk.k.drill === 'kn:6,kf:6' && /^k[nf]:6$/.test(bk.k.item), 'tapping a key drills that key');
  ok(bk.dr.kind === null && !bk.dr.card, 'drums: no weak-spot card');

  // ---- regular levels: slow notes come up more often (no separate mode needed) ----
  const wt = await page.evaluate(() => {
    App.practiceInstrument.set('piano');
    const st = JSON.parse(localStorage.getItem('soundlab2.qz.items'));
    // two keys, both always right: C fast, D slow
    for (const k in st) delete st[k];
    st['kn:0'] = [10, 10, 900]; st['kn:2'] = [10, 10, 5900];
    localStorage.setItem('soundlab2.qz.items', JSON.stringify(st));
    location.reload();
  }).catch(() => {});
  await page.waitForFunction(() => window.SLQuiz && App.practiceInstrument);
  const pickCount = await page.evaluate(() => {
    App.practiceInstrument.set('piano');
    const lid = SLQuiz.levels().filter(id => /nat\/piano\/1$/.test(id))[0];
    let c = 0, d = 0;
    for (let i = 0; i < 3000; i++) { const q = SLQuiz.gen(lid); if (q.item === 'kn:0') c++; if (q.item === 'kn:2') d++; }
    return { c, d };
  });
  ok(pickCount.d > pickCount.c * 1.3, 'slow key comes up more in normal levels (slow ' + pickCount.d + ' vs fast ' + pickCount.c + ')');

  // ---- phone width: no horizontal scroll ----
  await page.setViewportSize({ width: 360, height: 800 });
  const ph = await page.evaluate(() => {
    App.practiceInstrument.set('guitar'); SLQuiz.tab('progress');
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
  });
  ok(ph.sw <= ph.cw, 'phone width: the neck map fits (' + ph.sw + ' <= ' + ph.cw + ')');
  await page.locator('#qz-wscard').screenshot({ path: process.env.WS_SHOT || '/tmp/ws-phone.png' }).catch(() => {});

  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();
