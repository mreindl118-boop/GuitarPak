const { chromium, devices } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
(async () => {
  const b = await chromium.launch({ executablePath: env.CHROMIUM });
  for (const [name, opts] of [['Pixel 7', devices['Pixel 7']], ['iPhone SE-ish 360', { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true }], ['desktop', { viewport: { width: 1280, height: 800 } }]]) {
    const ctx = await b.newContext(opts);
    await ctx.addInitScript(() => { localStorage.setItem('guitarlab.help.seen','true'); localStorage.setItem('guitarlab.help.done','true'); localStorage.setItem('guitarlab.qz.landed','true'); });
    const p = await ctx.newPage();
    await p.goto(env.URL);
    await p.waitForFunction(() => window.SLQuiz && App.active === 'quiz');
    await p.evaluate(() => document.fonts.load('48px SLMusic'));
    // every control the user can tap must be the element actually under its own center
    const bad = await p.evaluate(async () => {
      const out = [];
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const bar = () => { const t = document.getElementById('tabbar-m'); return t && getComputedStyle(t).display !== 'none' ? t.getBoundingClientRect().height : 0; };
      const check = (lid, phase) => {
        document.querySelectorAll('#panel-quiz button, #panel-quiz .qz-key, #panel-quiz .qz-fz').forEach(el => {
          let r = el.getBoundingClientRect();
          if (!r.width || !r.height) return;
          // reachable = after scrolling it into the clear area between the bars
          if (r.top < 120 || r.bottom > innerHeight - bar() - 4) { el.scrollIntoView({ block: 'center' }); r = el.getBoundingClientRect(); }
          let x = r.left + r.width / 2, y = r.top + r.height / 2;
          if (el.classList.contains('qz-kw')) y = r.bottom - 8; // white keys: tap the visible lower part
          const top = document.elementFromPoint(x, y);
          if (top && (top === el || el.contains(top))) return;
          out.push(lid + ' [' + phase + '] ' + (el.id || el.className.baseVal || el.className) + ' covered by ' + (top ? (top.id || top.className.baseVal || top.className || top.tagName) : 'nothing'));
        });
      };
      for (const lid of SLQuiz.levels()) {
        SLQuiz.start(lid);
        window.scrollTo(0, 0);
        await wait(0);
        check(lid, 'ask');
        const q = SLQuiz.q;
        if (q.kind === 'choice') SLQuiz.pick(q.choices.find(c => c.id !== q.correct).id);
        else document.getElementById('qz-act').click();
        await wait(650); // the smooth keep-visible scroll
        const ar = document.getElementById('qz-act').getBoundingClientRect();
        if (ar.bottom > innerHeight - bar() + 1 || ar.top < 0) out.push(lid + ' [answered] Next not on screen without scrolling: ' + Math.round(ar.top) + '..' + Math.round(ar.bottom) + ' of ' + (innerHeight - bar()));
        check(lid, 'answered');
        if (out.length > 25) break;
      }
      return out;
    });
    ok(bad.length === 0, name + ': every button / key / fret is reachable by a real tap' + (bad.length ? '\n    ' + bad.slice(0, 25).join('\n    ') : ''));
    const sel = await p.evaluate(() => ({ body: getComputedStyle(document.body).userSelect || getComputedStyle(document.body).webkitUserSelect, input: getComputedStyle(document.getElementById('cx-bpm')).userSelect }));
    ok(sel.body === 'none' && sel.input !== 'none', name + ': page text not selectable (no Touch to Search), inputs still are ' + JSON.stringify(sel));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? '\nFAILED: ' + fails : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
