// Real shell, simulated browser only: one musical context on every built-in
// page, including both workspaces, Learn, Settings and modal utilities.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), env = require('./env');
let checks = 0;
function ok(value, message) { if (!value) throw new Error(message); checks++; console.log('  PASS', message); }
const practice = ['quiz', 'practiceplan', 'fretboard', 'tab', 'notation', 'helix', 'chords', 'piano', 'synth', 'pads', 'deck', 'liveset', 'midihub', 'lumipractice', 'songs', 'jam', 'sheetlab', 'library', 'shed', 'tuner', 'trainer', 'theory', 'settings']; // 1.3: deck + liveset = the Synth tab
const studio = ['arrange', 'tracks', 'song', 'ideas', 'settings'];
async function switchTo(page, name) {
  await page.evaluate(name => App.switchTo(name), name);
  await page.waitForFunction(name => App.active === name && !document.documentElement.classList.contains('space-wiping'), name);
  await page.waitForTimeout(70);
}
async function shot(page, name) {
  if (!process.env.EVIDENCE_DIR) return;
  await page.waitForTimeout(200); // settle the disclosure/theme entrance before evidence
  fs.mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(process.env.EVIDENCE_DIR, 'addendum-context-' + name + '.png') });
}
async function contextSnapshot(page) {
  return page.evaluate(() => {
    const b = document.getElementById('ctx-btn'), bar = document.getElementById('ctxbar');
    const r = b.getBoundingClientRect(), d = bar.getBoundingClientRect();
    const peer = document.getElementById('lights-btn').getBoundingClientRect(); // 1.3 (A2): the clef shares its neighbours' box
    const brand = document.querySelector('.brand').getBoundingClientRect();
    const tools = document.querySelector('.tb-tools').getBoundingClientRect();
    return { active: App.active, visible: getComputedStyle(b).display !== 'none' && r.width > 0,
      enabled: !b.disabled, open: App.ctx(), expanded: b.getAttribute('aria-expanded'),
      label: b.getAttribute('aria-label'), region: bar.getAttribute('role'),
      labelled: !!bar.getAttribute('aria-label'), controls: b.getAttribute('aria-controls'),
      width: r.width, height: r.height, likePeers: Math.abs(r.width - peer.width) < 1 && Math.abs(r.height - peer.height) < 1, noHeaderOverlap: brand.right <= tools.left + 1 || brand.bottom <= tools.top + 1,
      inBounds: d.left >= 0 && d.right <= innerWidth + 1 && d.top >= 0 && d.bottom <= innerHeight + 1,
      unique: ['ctxbar', 'cx-root', 'cx-scale', 'cx-lock', 'cx-led'].every(id => document.querySelectorAll('#' + id).length === 1),
      targets: [...bar.querySelectorAll('select,input[type=number],button')].every(el => {
        const r = el.getBoundingClientRect(); return !el.getClientRects().length || Math.round(r.height) >= 44 && (!el.matches('button') || Math.round(r.width) >= 44);
      }),
      root: document.getElementById('cx-root').value, scale: document.getElementById('cx-scale').value,
      lock: document.getElementById('cx-lock').getAttribute('aria-pressed'), display: document.getElementById('cx-led').getAttribute('aria-pressed'),
      colors: App.colors.mode(), icon: b.querySelector('svg.ic')?.getAttribute('aria-hidden')
    };
  });
}
(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const phone = viewport.width === 390;
      const context = await browser.newContext({ viewport, hasTouch: phone, isMobile: phone, serviceWorkers: 'block' });
      await context.addInitScript(() => {
        ['help.seen', 'help.done', 'qz.landed'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
        window.__midiRequests = 0;
        navigator.requestMIDIAccess = () => { __midiRequests++; return Promise.reject(new Error('No hardware in context UI test')); };
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(env.URL);
      await page.waitForFunction(() => window.App && App.active && App.midi && App.colors);
      await page.evaluate(() => { App.setTheme('dark'); App.scaleLock.set(false); App.midi.setDisplayEnabled(false); });
      console.log('# ' + viewport.width + 'px global context across all built-in pages');
      const registered = await page.evaluate(() => [...document.querySelectorAll('main > .panel[id^="panel-"]')].map(el => el.id.slice(6)).sort());
      ok(registered.join('|') === [...new Set([...practice, ...studio])].sort().join('|'), 'matrix covers every registered built-in page');
      for (const [space, pages] of [['Practice', practice], ['Studio', studio]]) for (const name of pages) {
        await switchTo(page, name);
        await page.locator('#ctx-btn').click();
        const s = await contextSnapshot(page);
        ok(s.active === name && s.visible && s.enabled && s.open && s.expanded === 'true' && s.width >= 34 && s.height >= 34 && s.likePeers && s.noHeaderOverlap && s.inBounds && s.unique && s.targets,
          `${space}/${name}: visible clef sized like its neighbours (>= 34 px), reachable disclosure, one shared set of controls`);
        ok(s.controls === 'ctxbar' && s.region === 'region' && s.labelled && /Key, scale/.test(s.label) && s.icon === 'true', `${space}/${name}: labelled disclosure and decorative SVG`);
        await page.keyboard.press('Escape');
      }
      await switchTo(page, 'quiz');
      await page.locator('#ctx-btn').focus();
      await page.keyboard.press('Enter');
      ok(await page.evaluate(() => App.ctx() && document.activeElement.id === 'cx-root'), 'Enter opens and focuses the first labelled field');
      await page.keyboard.press('Escape');
      ok(await page.evaluate(() => !App.ctx() && document.activeElement.id === 'ctx-btn' && document.getElementById('ctxbar').hidden), 'Escape closes, hides fields, and returns focus to clef');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Shift+Tab');
      ok(await page.evaluate(() => !App.ctx() && document.activeElement.id === 'ctx-btn'), 'ArrowDown opens; reverse Tab returns safely to clef');
      await page.locator('#ctx-btn').click();
      await page.selectOption('#cx-root', '2'); await page.selectOption('#cx-scale', 'dorian');
      await page.locator('#cx-lock').click(); await page.locator('#cx-led').click();
      await page.locator('[data-cxcolormode="note"]').click();
      const selected = await contextSnapshot(page);
      ok(selected.open && selected.root === '2' && selected.scale === 'dorian' && selected.lock === 'true' && selected.display === 'true' && selected.colors === 'note', 'all five context choices remain open and update the shared services');
      ok(await page.evaluate(() => /unconfigured|select|configured|connect/i.test(document.getElementById('cx-tnote').textContent) && __midiRequests === 0), 'display enabled without hardware has an honest status and makes no permission request');
      await page.mouse.click(viewport.width - 12, viewport.height - 80);
      ok(await page.evaluate(() => !App.ctx()), 'pointer outside closes the disclosure');
      await switchTo(page, 'arrange'); await page.locator('#ctx-btn').click();
      const shared = await contextSnapshot(page);
      ok(shared.root === selected.root && shared.scale === selected.scale && shared.lock === selected.lock && shared.display === selected.display && shared.colors === selected.colors, 'Studio shares Practice key, scale, lock, display and palette state');
      await page.evaluate(() => App.switchTo('settings'));
      ok(await page.evaluate(() => !App.ctx()), 'page navigation closes the disclosure');
      await page.locator('#ctx-btn').click();
      await page.locator('#settings-btn').focus();
      ok(await page.evaluate(() => !App.ctx()), 'moving focus out closes the nonmodal disclosure');

      console.log('# modal boundaries, persistence, and contrast');
      for (const modal of ['metronome', 'lights']) {
        await page.locator('#ctx-btn').click();
        await page.evaluate(modal => App.openSheet(modal), modal);
        const state = await page.evaluate(modal => {
          const b = document.getElementById('ctx-btn'), r = b.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { closed: !App.ctx(), disabled: b.disabled, reopen: App.ctx(true), focus: document.getElementById('sheet-' + modal).contains(document.activeElement), blocked: top !== b && !b.contains(top) };
        }, modal);
        ok(state.closed && state.disabled && !state.reopen && state.focus && state.blocked, modal + ' modal closes/blocks clef and prevents background click-through');
        await page.keyboard.press('Escape');
        ok(await page.evaluate(() => !App.sheet && !document.getElementById('ctx-btn').disabled && document.activeElement.id === 'ctx-btn'), modal + ' dismissal restores enabled clef and focus');
      }
      await page.locator('#ctx-btn').click(); await page.locator('#help-btn').click();
      ok(await page.evaluate(() => Help.isOpen() && !App.ctx() && document.getElementById('ctx-btn').disabled && !App.ctx(true)), 'Help overlay blocks the shared disclosure');
      await page.evaluate(() => Help.close());
      ok(await page.evaluate(() => !document.getElementById('ctx-btn').disabled), 'closing Help restores clef availability');
      await page.reload();
      await page.waitForFunction(() => window.App && App.midi && App.colors && App.active);
      await page.locator('#ctx-btn').click();
      const persisted = await contextSnapshot(page);
      ok(persisted.root === '2' && persisted.scale === 'dorian' && persisted.lock === 'true' && persisted.display === 'true' && persisted.colors === 'note', 'reload preserves one authoritative context across workspaces');
      for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => App.setTheme(theme), theme);
        await page.waitForTimeout(180);
        const style = await page.locator('#ctx-btn').evaluate(b => ({ ink: getComputedStyle(b).color, paper: getComputedStyle(b).backgroundColor, svg: getComputedStyle(b.querySelector('.ic')).stroke }));
        ok(style.ink !== style.paper && style.svg !== 'none', theme + ' clef uses visible themed ink and background');
        const contrast = await page.evaluate(() => {
          const luma = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
          // a ghost button (transparent background, or the open state's faint accent tint) sits on its
          // nearest painted ancestor - the top bar; layers under 50 % alpha are tints, not paper
          const paperOf = el => { for (let e = el; e; e = e.parentElement) { const bg = getComputedStyle(e).backgroundColor, a = bg.match(/[\d.]+/g); if (!a || bg.startsWith('color(')) continue; if (a.length < 4 || Number(a[3]) >= 0.5) return bg; } return 'rgb(255, 255, 255)'; };
          return ['ctx-btn', 'cx-root', 'cx-scale', 'cx-bpm', 'cx-sig'].every(id => {
            const el = document.getElementById(id), s = getComputedStyle(el), ink = luma(s.color), paper = luma(paperOf(el));
            return (Math.max(ink, paper) + .05) / (Math.min(ink, paper) + .05) >= 4.5;
          });
        });
        ok(contrast, theme + ' clef and context field text meet 4.5:1 contrast');
        await shot(page, (phone ? 'phone' : 'desktop') + '-' + theme);
      }
      if (phone) {
        await page.setViewportSize({ width: 360, height: 780 });
        const narrow = await contextSnapshot(page);
        ok(narrow.width >= 34 && narrow.height >= 34 && narrow.likePeers && narrow.inBounds && narrow.noHeaderOverlap && narrow.targets, '360px keeps the clef at the shared icon size (>= 34 px) and 44px fields without header collision');
      }
      ok(errors.length === 0, 'no browser exceptions: ' + errors.join('; '));
      await context.close();
    }
  } finally { await browser.close(); }
  console.log('ALL PASS (' + checks + ' checks; browser only, no hardware)');
})().catch(error => { console.error('FAIL', error.stack); process.exitCode = 1; });
