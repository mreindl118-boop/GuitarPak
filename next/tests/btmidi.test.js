// Bluetooth MIDI pairing feedback, against a fake Android MidiBridge
// (window.SoundLabMidi + the __glMIDI callbacks, the protocol in
// android/src/com/mreindl/soundlab/MidiBridge.java): Settings › MIDI and
// Lights & help both show every status the bridge sends — Looking ->
// Connecting -> Connected, or a failure — so "Pair Bluetooth" never looks
// like it is searching forever; a connected keyboard shows up as a port.
// In a plain browser on Windows the card explains Windows Runtime MIDI
// (the switch that lets Chrome/Edge see Bluetooth LE MIDI) until a
// Bluetooth port is listed.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// script: 'ok' (finds + connects a LUMI) | 'fail' (finds one, the connect times out)
async function newPage(browser, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, userAgent: opts.ua });
  await ctx.addInitScript(([bridge, script]) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    if (!bridge) {
      // a plain browser: Web MIDI with no ports
      navigator.requestMIDIAccess = () => Promise.resolve({ inputs: new Map(), outputs: new Map(), sysexEnabled: true, onstatechange: null });
      return;
    }
    window.__posts = [];
    const later = (ms, f) => setTimeout(f, ms);
    window.SoundLabMidi = {
      post: json => {
        const m = JSON.parse(json);
        window.__posts.push(m);
        if (m.cmd === 'init') later(10, () => window.__glMIDI.onports({ inputs: [], outputs: [] }));
        if (m.cmd === 'bluetooth') {
          later(20, () => window.__glMIDI.onstatus('Looking for Bluetooth MIDI keyboards… (wake your LUMI: press a key)'));
          later(250, () => window.__glMIDI.onstatus('Connecting to LUMI Keys BLOCK…'));
          if (script === 'fail') {
            later(500, () => window.__glMIDI.onstatus('Couldn’t connect to LUMI Keys BLOCK. Switch it off and on, check that no other phone, tablet or app is connected to it, then try again.'));
          } else {
            later(500, () => {
              window.__glMIDI.onports({ inputs: [{ id: 7, name: 'LUMI Keys BLOCK' }], outputs: [{ id: 7, name: 'LUMI Keys BLOCK' }] });
              window.__glMIDI.onstatus('Connected: LUMI Keys BLOCK');
            });
          }
        }
      }
    };
  }, [!opts.web, opts.script || 'ok']);
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.active === 'quiz');
  return { ctx, page, errs };
}

// the Settings MIDI message over time while fn runs
async function watch(page, sel, ms) {
  return page.evaluate(async ([sel, ms]) => {
    const seen = [];
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const t = document.querySelector(sel).textContent;
      if (t && seen[seen.length - 1] !== t) seen.push(t);
      await new Promise(r => setTimeout(r, 20));
    }
    return seen;
  }, [sel, ms]);
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });

  console.log('# Android app: Settings › MIDI › Pair Bluetooth');
  let { ctx, page, errs } = await newPage(browser, {});
  await page.evaluate(() => App.switchTo('settings'));
  await page.waitForFunction(() => App.midi.ready && App.midi.native);
  const card = await page.evaluate(() => ({
    bt: document.getElementById('set-midi-bt').offsetParent !== null,
    note: document.getElementById('set-midi-btnote').offsetParent !== null,
    platform: App.midi.platform, posts: __posts.map(p => p.cmd)
  }));
  ok(card.bt && !card.note && card.posts.indexOf('init') >= 0, 'native bridge: Pair Bluetooth shows, no Windows note: ' + JSON.stringify(card));
  await page.click('#set-midi-bt');
  const seen = await watch(page, '#set-midi-msg', 900);
  ok(/Looking/.test(seen[0] || ''), 'the press shows "Looking…" at once: ' + seen[0]);
  ok(seen.some(s => /^Connecting to LUMI/.test(s)) && /^Connected: LUMI Keys BLOCK$/.test(seen[seen.length - 1]),
    'then every bridge status in order, ending in Connected: ' + JSON.stringify(seen));
  const ports = await page.evaluate(() => ({ posts: __posts.filter(p => p.cmd === 'bluetooth').length,
    inputs: Array.from(document.querySelectorAll('#set-midi-in option')).map(o => o.textContent) }));
  ok(ports.posts === 1 && ports.inputs.some(n => /LUMI Keys BLOCK/.test(n)), 'one bluetooth command; the keyboard is listed as an input: ' + ports.inputs.join(' | '));
  const lights = await page.evaluate(async () => {
    App.switchTo('lights');
    await new Promise(r => setTimeout(r, 300));
    const st = document.querySelector('#sheet-lights [role="status"], [id^="panel-lights"] [role="status"]') || Array.from(document.querySelectorAll('[role="status"]')).find(e => /Connected: LUMI/.test(e.textContent));
    return st ? st.textContent : '';
  });
  ok(/Connected: LUMI Keys BLOCK/.test(lights), 'Lights & help shows the same last status: ' + lights);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# a connect that fails is reported, not left searching');
  ({ ctx, page, errs } = await newPage(browser, { script: 'fail' }));
  await page.evaluate(() => App.switchTo('settings'));
  await page.waitForFunction(() => App.midi.ready && App.midi.native);
  await page.click('#set-midi-bt');
  const seenF = await watch(page, '#set-midi-msg', 900);
  ok(/Couldn.t connect to LUMI/.test(seenF[seenF.length - 1] || ''), 'the failure ends the search on screen: ' + JSON.stringify(seenF));
  const again = await page.evaluate(async () => {
    // a later port update (another device) does not wipe the message
    window.__glMIDI.onports({ inputs: [], outputs: [] });
    await new Promise(r => setTimeout(r, 100));
    return document.getElementById('set-midi-msg').textContent;
  });
  ok(/Couldn.t connect/.test(again), 'and stays readable after a port update');
  ok(errs.length === 0, 'no page errors (fail)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# Chrome on Windows: Web MIDI, no Bluetooth MIDI');
  ({ ctx, page, errs } = await newPage(browser, { web: true, ua: WIN_UA }));
  const win = await page.evaluate(async () => {
    App.switchTo('settings');
    await App.midi.enable().catch(() => {});
    await new Promise(r => setTimeout(r, 300));
    const note = document.getElementById('set-midi-btnote');
    return { native: App.midi.native, bt: document.getElementById('set-midi-bt').offsetParent !== null, note: note.offsetParent !== null ? note.textContent : '' };
  });
  ok(!win.native && !win.bt && /Windows Runtime MIDI/.test(win.note) && /use-winrt-midi-api/.test(win.note) && /USB/.test(win.note), 'no Pair button; the card explains the Windows Bluetooth MIDI switch (or USB): ' + win.note);
  ok(errs.length === 0, 'no page errors (Windows)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  await browser.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
