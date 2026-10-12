const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const FEED = 'https://raw.githubusercontent.com/mreindl118-boop/GuitarPak/main/version.json';
async function run(b, url, feed, shell) {
  const ctx = await b.newContext();
  await ctx.addInitScript((shell) => {
    localStorage.setItem('guitarlab.help.seen', 'true'); localStorage.setItem('guitarlab.help.done', 'true'); localStorage.setItem('guitarlab.qz.landed', 'true');
    if (shell) window.GuitarLabHost = { shellVersion: () => shell, setKeepScreenOn: () => {} };
  }, shell || null);
  await ctx.route(FEED, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(feed) }));
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.App && App.active, null, { timeout: 15000 });
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => { const b = document.getElementById('app-update'); return b ? { text: b.querySelector('span').textContent, btn: b.querySelector('.primary').textContent } : null; });
  await ctx.close();
  return { r, errs };
}
(async () => {
  const b = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--allow-file-access-from-files'] });
  const WEB = env.URL, FILE = 'file://' + env.ROOT + '/index.html';
  const apk = 'https://github.com/mreindl118-boop/GuitarPak/raw/main/releases/soundLAB-alpha.apk';
  let x;
  // versions derived from the app under test, so the suite survives releases
  const V = /APP_VERSION = '([^']+)'/.exec(require('fs').readFileSync(env.ROOT + '/js/app.js', 'utf8'))[1];
  const up = (v, n) => { const p = v.split('.').map(Number); p[2] += n; return p.join('.'); };
  const NEWER = up(V, 7), OLD = '0.67.1', SHELL = '0.70.1', BIG = '9.0.0';
  const esc = v => v.replace(/\./g, '\\.');
  console.log('# web / PWA (app v' + V + ')');
  x = await run(b, WEB, { version: OLD, web: V, apk });
  ok(x.r === null, 'web, up to date: no banner ' + JSON.stringify(x.r));
  x = await run(b, WEB, { version: OLD, web: NEWER, apk });
  ok(x.r && new RegExp('v' + esc(NEWER) + ' is available').test(x.r.text) && x.r.btn === 'Update now', 'web, newer web build: Update now ' + JSON.stringify(x.r));
  x = await run(b, WEB, { version: BIG, apk });
  ok(x.r && /v9\.0\.0/.test(x.r.text), 'web, feed without a web field still works ' + JSON.stringify(x.r));
  console.log('# Android shell (live site + GuitarLabHost)');
  x = await run(b, WEB, { version: SHELL, web: V, apk }, SHELL);
  ok(x.r === null, 'shell, nothing new: no banner ' + JSON.stringify(x.r));
  x = await run(b, WEB, { version: SHELL, web: NEWER, apk }, SHELL);
  ok(x.r && x.r.btn === 'Update now' && !/Android/.test(x.r.text), 'shell, newer web build: refreshes like the web, no APK download ' + JSON.stringify(x.r));
  x = await run(b, WEB, { version: BIG, web: BIG, apk }, SHELL);
  ok(x.r && /Android app \(v9\.0\.0\)/.test(x.r.text) && x.r.btn === 'Download', 'shell, genuinely newer APK: Download offered ' + JSON.stringify(x.r));
  console.log('# bundled offline copy (file://)');
  x = await run(b, FILE, { version: OLD, web: NEWER, apk });
  ok(x.r === null, 'bundled copy, stale APK file: no download loop ' + JSON.stringify(x.r));
  x = await run(b, FILE, { version: BIG, web: BIG, apk });
  ok(x.r && x.r.btn === 'Download', 'bundled copy, newer APK exists: Download offered ' + JSON.stringify(x.r));
  console.log('# the feed vs the real APK file (what stops download loops)');
  const feed = require(env.ROOT + '/version.json');
  if (env.AAPT) { // needs build-tools aapt: AAPT=/path/to/aapt
    const badging = require('child_process').execFileSync(env.AAPT, ['dump', 'badging', env.ROOT + '/releases/soundLAB-alpha.apk']).toString();
    const apkVer = (/versionName='([^']+)'/.exec(badging) || [])[1];
    ok(feed.version === apkVer, 'version.json "version" (' + feed.version + ') equals the published APK\'s versionName (' + apkVer + ')');
    ok(/package: name='com\.mreindl\.soundlab'/.test(badging), 'published APK is the new com.mreindl.soundlab app');
  } else console.log('  skip APK checks (set AAPT to run them); feed APK channel = ' + feed.version);
  await b.close();
  console.log(fails ? '\nFAILED: ' + fails : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
