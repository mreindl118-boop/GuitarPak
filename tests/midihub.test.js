// MIDI Hub (js/midihub.js) against a fake Web MIDI device that records every
// byte sent: the page under Keys, the raw tap + monitor, on-screen keys and
// controls going OUT on the Hub channel, rules (remap / transpose / block /
// channel) on Thru and on what soundLAB hears, device profiles + SysEx
// builders, panic, and the service additions (App.midi.send / setInputFilter /
// midi:raw / midi:out).
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

async function newPage(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript((seed) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
    window.__sent = [];
    const inp = { id: 'in1', name: 'Synth Port 1', onmidimessage: null };
    window.__otherSent = []; window.__echo = false;
    const out = { id: 'out1', name: 'Synth Port 1', state: 'connected', send: b => {
      const bytes = Array.from(b); window.__sent.push(bytes);
      if (window.__echo === 'sync') window.__recv(bytes);
      else if (window.__echo === 'async') setTimeout(() => window.__recv(bytes), 0);
    } };
    const other = { id: 'out2', name: 'Other synth', state: 'connected', send: b => window.__otherSent.push(Array.from(b)) };
    const access = { inputs: new Map([['in1', inp]]), outputs: new Map([['out1', out], ['out2', other]]), sysexEnabled: true, onstatechange: null };
    window.__access = access; window.__out = out;
    navigator.requestMIDIAccess = () => Promise.resolve(access);
    window.__recv = (bytes) => inp.onmidimessage({ data: new Uint8Array(bytes) });
    window.__since = (n) => window.__sent.slice(n);
  }, seed || {});
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.midi.hasOutput && App.active === 'quiz');
  return { ctx, page, errs };
}
const J = JSON.stringify;

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  let { ctx, page, errs } = await newPage(browser, { 'lights.on': false, 'midihub.thru': true });

  console.log('# the page');
  const nav = await page.evaluate(() => {
    App.switchTo('midihub');
    return {
      active: App.active, pills: [...document.querySelectorAll('#subnav .subtab')].map(b => b.textContent).join('|'),
      group: (document.querySelector('#tabbar .tabbar-btn.active') || {}).textContent,
      views: [...document.querySelectorAll('#mh-views button')].map(b => b.dataset.view).join(','),
      status: document.getElementById('mh-status').textContent, ports: !document.getElementById('mh-ports').hidden,
      inSel: document.getElementById('mh-in').value, outSel: document.getElementById('mh-out').value,
      keys: document.querySelectorAll('#mh-kb .mh-wk').length + '/' + document.querySelectorAll('#mh-kb .mh-bk').length,
      tour: !!(window.Help && Help.TOURS.midihub && Help.TOURS.midihub.length)
    };
  });
  ok(nav.active === 'midihub' && nav.group === 'Keys' && nav.pills === 'Piano|Synth|Pads|MIDI|LUMI|Helix', 'MIDI Hub remains the fourth Keys pill with LUMI and Helix integrated: ' + nav.pills);
  ok(nav.views === 'play,controls,rules,sysex,monitor,learn', 'six views: ' + nav.views);
  ok(nav.ports && nav.inSel === 'in1' && nav.outSel === 'out1' && /In: Synth Port 1/.test(nav.status), 'ports picked from the shared MIDI service: ' + nav.status);
  ok(nav.keys === '15/10' && nav.tour, 'two octaves of keys and a help tour');
  const noAutoSend = await page.evaluate(() => {
    const before = __sent.length;
    __recv([0x90, 60, 90]); __recv([0xF0, 0x43, 0x10, 0xF7]);
    const profile = document.getElementById('mh-profile');
    profile.value = 'yamaha'; profile.dispatchEvent(new Event('change'));
    profile.value = 'generic'; profile.dispatchEvent(new Event('change'));
    return { thru: document.getElementById('mh-thru').checked, sent: __sent.length - before };
  });
  ok(!noAutoSend.thru && noAutoSend.sent === 0, 'saved Thru is disarmed; incoming notes/SysEx and profile changes never send automatically');

  console.log('# out: keys, controls, program, panic');
  const out1 = await page.evaluate(() => {
    App.store.set('midihub.ch', 2); document.getElementById('mh-ch').value = '2'; document.getElementById('mh-ch').dispatchEvent(new Event('change'));
    const from = __sent.length;
    const k = document.querySelector('#mh-kb [data-note="60"]');
    k.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    const cap = []; const off = App.on('note:input', d => cap.push(d));
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA', bubbles: true }));
    document.getElementById('mh-mod').value = 77; document.getElementById('mh-mod').dispatchEvent(new Event('input'));
    document.getElementById('mh-prog').value = 5; document.getElementById('mh-msb').value = 63; document.getElementById('mh-lsb').value = 1; document.getElementById('mh-sendprog').click();
    return { sent: __since(from), cap: cap.length, last: document.getElementById('mh-lastout').textContent };
  });
  const s1 = out1.sent.map(b => b.join(' '));
  ok(s1[0] === '146 60 100' && s1[1] === '130 60 0', 'tapping middle C sends note on/off on channel 3 at velocity 100: ' + s1.slice(0, 2));
  ok(s1[2] === '146 60 100' && s1[3] === '130 60 0' && out1.cap === 2, 'QWERTY A plays C4 at the current octave and emits note:input for capture');
  ok(s1[4] === '178 1 77', 'mod slider = CC1 on the Hub channel: ' + s1[4]);
  ok(s1.slice(5).join('|') === '178 0 63|178 32 1|194 4', 'program select = bank MSB/LSB then program (1-based → 0-based): ' + s1.slice(5).join('|'));
  ok(/Program 5/.test(out1.last), 'footer shows the last message sent: ' + out1.last);
  const pan = await page.evaluate(() => { const from = __sent.length; document.getElementById('mh-panic').click(); return __since(from); });
  ok(pan.length === 64 && pan.filter(b => b[1] === 123).length === 16 && pan.filter(b => b[1] === 120).length === 16, 'panic: notes off, sound off, sustain off and bend centre on all 16 channels');

  console.log('# in: raw tap, monitor, decode');
  const inn = await page.evaluate(() => {
    document.querySelector('#mh-views [data-view="monitor"]').click(); document.getElementById('mh-monclear').click();
    const raw = []; App.on('midi:raw', d => raw.push(d.bytes));
    __recv([0xF8]); __recv([0x90, 64, 90]); __recv([0xB0, 74, 12]); __recv([0xF0, 0x43, 0x00, 0xF7]);
    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({
      raw: raw.length, rows: [...document.querySelectorAll('#mh-mon .mh-r')].map(x => x.children[3].textContent),
      lastIn: document.getElementById('mh-lastin').textContent, rx: document.getElementById('mh-rx').value,
      dec: [SLMidiHub.decode([0xE0, 0, 64]).text, SLMidiHub.decode([0xC0, 9]).text, SLMidiHub.decode([0xD0, 50]).text]
    }))));
  });
  ok(inn.raw === 4, 'every incoming message (channel, SysEx, realtime) is broadcast as midi:raw: ' + inn.raw);
  ok(inn.rows.length === 3 && /Note On E4 \(64\) vel 90/.test(inn.rows[0]) && /CC 74 Cutoff = 12/.test(inn.rows[1]) && /SysEx Yamaha/.test(inn.rows[2]), 'monitor decodes rows (clock hidden by default): ' + J(inn.rows));
  ok(inn.rx === 'F0 43 00 F7' && /SysEx Yamaha/.test(inn.lastIn), 'last SysEx captured, footer shows the last incoming message: ' + inn.lastIn);
  ok(inn.dec[0] === 'Pitch Bend 0' && inn.dec[1] === 'Program 10 (0-based 9)' && inn.dec[2] === 'Channel Pressure 50', 'decoder: ' + J(inn.dec));

  console.log('# rules on Thru');
  const thru = await page.evaluate(() => {
    document.querySelector('#mh-views [data-view="rules"]').click();
    document.querySelector('[data-preset="remap"]').click();     // CC 74 -> CC 1
    document.querySelector('[data-preset="transpose"]').click(); // notes +12
    document.querySelector('[data-preset="block"]').click();     // aftertouch dropped
    document.getElementById('mh-thru').checked = true; document.getElementById('mh-thru').dispatchEvent(new Event('change'));
    const from = __sent.length;
    __recv([0x90, 60, 100]); __recv([0xB0, 74, 40]); __recv([0xD0, 99]); __recv([0xB0, 7, 100]); __recv([0xFE]);
    return { sent: __since(from), n: document.querySelectorAll('#mh-rules .mh-rule').length, ar: SLMidiHub.applyRules([0x91, 10, 1]) };
  });
  const s2 = thru.sent.map(b => b.join(' '));
  ok(thru.n === 3 && s2.join('|') === '144 72 100|176 1 40|176 7 100', 'Thru: transposed, remapped, aftertouch blocked, others untouched, active sensing never forwarded: ' + s2.join('|'));
  ok(thru.ar.length === 1 && thru.ar[0].join(' ') === '145 22 1', 'applyRules keeps the channel and adds 12: ' + J(thru.ar));

  console.log('# rules on what soundLAB hears');
  const heard = await page.evaluate(() => {
    document.getElementById('mh-rulesin').checked = true; document.getElementById('mh-rulesin').dispatchEvent(new Event('change'));
    const notes = []; App.on('midi:note', d => notes.push(d.midi + ':' + (d.on ? 1 : 0)));
    const press = []; App.on('midi:pressure', d => press.push(d.val));
    __recv([0x90, 48, 80]); __recv([0x80, 48, 0]); __recv([0xD0, 55]);
    const withFilter = { notes: notes.slice(), press: press.slice(), has: !!App.midi.inputFilter };
    document.getElementById('mh-rulesin').checked = false; document.getElementById('mh-rulesin').dispatchEvent(new Event('change'));
    __recv([0x90, 48, 80]); __recv([0x80, 48, 0]);
    return { withFilter, after: notes.slice(), filterOff: !App.midi.inputFilter };
  });
  ok(heard.withFilter.has && heard.withFilter.notes.join() === '60:1,60:0' && heard.withFilter.press.length === 0, 'input filter: the app hears C3 as C4, aftertouch is dropped: ' + J(heard.withFilter));
  ok(heard.filterOff && heard.after.slice(2).join() === '48:1,48:0', 'switching it off restores plain notes');

  console.log('# force channel + learn');
  const lr = await page.evaluate(() => {
    App.store.set('midihub.rules', []); document.querySelector('[data-preset="chan"]').click();
    const from = __sent.length; __recv([0x93, 61, 70]);
    const forced = __since(from).map(b => b.join(' '));
    document.getElementById('mh-addrule').click();
    const rules = document.querySelectorAll('#mh-rules .mh-rule'); rules[rules.length - 1].querySelector('[data-act="learn"]').click();
    __recv([0xB5, 11, 3]);
    const r = SLMidiHub.rules[SLMidiHub.rules.length - 1];
    return { forced, learned: r.m };
  });
  ok(lr.forced.join('|') === '145 61 70', 'force channel 2: note arrives on ch4, leaves on ch2: ' + lr.forced);
  ok(lr.learned.type === 'cc' && lr.learned.ch === 6 && lr.learned.lo === 11 && lr.learned.hi === 11, 'Learn fills the match from the next message: ' + J(lr.learned));

  console.log('# profiles + SysEx');
  const sx = await page.evaluate(() => {
    document.getElementById('mh-thru').checked = false; document.getElementById('mh-thru').dispatchEvent(new Event('change'));
    document.querySelector('#mh-views [data-view="sysex"]').click();
    const generic = document.getElementById('mh-sxcard').textContent;
    document.getElementById('mh-profile').value = 'yamaha'; document.getElementById('mh-profile').dispatchEvent(new Event('change'));
    const card = document.getElementById('mh-sxcard');
    card.querySelector('#mh-pca0').value = '30'; card.querySelector('#mh-pca1').value = '00'; card.querySelector('#mh-pca2').value = '05'; card.querySelector('#mh-pcd').value = '7F';
    card.querySelector('#mh-pcd').dispatchEvent(new Event('input'));
    const from = __sent.length; card.querySelector('#mh-pcsend').click(); card.querySelector('#mh-bdsend').click();
    document.getElementById('mh-idreq').click();
    __recv([0xF0, 0x7E, 0x00, 0x06, 0x02, 0x43, 0x00, 0x41, 0x56, 0x06, 0x00, 0x00, 0x01, 0x00, 0xF7]);
    const prev = card.querySelector('#mh-pcprev').textContent;
    document.getElementById('mh-raw').value = 'F0 7E 7F 06 01'; document.getElementById('mh-rawsend').click();
    const err = document.getElementById('mh-rawerr').textContent;
    const yNotes = document.querySelectorAll('#mh-devnotes li').length, yMsb = document.getElementById('mh-msb').value;
    document.getElementById('mh-profile').value = 'roland'; document.getElementById('mh-profile').dispatchEvent(new Event('change'));
    const rc = document.getElementById('mh-sxcard'); rc.querySelector('#mh-pcd').value = '40'; rc.querySelector('#mh-pcd').dispatchEvent(new Event('input'));
    const from2 = __sent.length; rc.querySelector('#mh-pcsend').click();
    return {
      generic, sent: __since(from).map(b => SLMidiHub.hex(b)), prev, id: document.getElementById('mh-idreply').textContent, err,
      msb: yMsb, superKnob: [...document.querySelectorAll('#mh-ccgrid b')].map(b => b.textContent).includes('Super Knob'),
      roland: __since(from2).map(b => SLMidiHub.hex(b)), notes: yNotes
    };
  });
  ok(/no SysEx template/.test(sx.generic), 'Generic profile: no builder, raw hex only');
  ok(sx.sent[0] === 'F0 43 10 7F 1C 07 30 00 05 7F F7' && sx.prev === 'Will send: ' + sx.sent[0], 'Yamaha parameter change built from address + data: ' + sx.sent[0]);
  ok(sx.sent[1] === 'F0 43 20 7F 1C 07 00 00 00 F7', 'Yamaha bulk request: ' + sx.sent[1]);
  ok(sx.sent[2] === 'F0 7E 7F 06 01 F7' && /^Yamaha · family 00 41/.test(sx.id), 'identity request sent and the reply decoded: ' + sx.id);
  ok(/must end with F7/.test(sx.err), 'raw hex validation: ' + sx.err);
  ok(sx.msb === '63' && sx.superKnob && sx.notes >= 4, 'Yamaha profile sets bank MSB 63, adds Super Knob, has its own notes');
  ok(sx.roland[0] === 'F0 41 00 00 00 00 0A 12 00 00 00 00 40 40 F7', 'Roland DT1 with checksum: ' + sx.roland[0]);

  console.log('# clock at the shared tempo, leaving the page');
  const ck = await page.evaluate(() => new Promise(r => {
    App.store.set('met.bpm', 120);
    document.querySelector('#mh-views [data-view="controls"]').click();
    const from = __sent.length; document.getElementById('mh-clock').click();
    setTimeout(() => {
      const n = __since(from).filter(b => b[0] === 0xF8).length; document.getElementById('mh-clock').click();
      const from2 = __sent.length;
      document.getElementById('mh-start').click(); document.getElementById('mh-stop').click();
      const tr = __since(from2).map(b => b[0]);
      document.querySelector('#mh-kb [data-note="60"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 }));
      const from3 = __sent.length; App.switchTo('piano');
      r({ n, label: document.getElementById('mh-clock').textContent, tr, left: __since(from3).map(b => b.join(' ')) });
    }, 520);
  }));
  ok(ck.n >= 20 && ck.n <= 28 && /off/.test(ck.label), '~24 clocks per beat at 120 BPM over half a second: ' + ck.n);
  ok(ck.tr.join() === '250,252', 'Start / Stop realtime: ' + ck.tr);
  ok(ck.left.join('|') === '130 60 0', 'leaving the page releases held keys');

  console.log('# routing safety and cleanup');
  const safe = await page.evaluate(async () => {
    App.switchTo('midihub'); App.store.set('midihub.rules', []); App.store.set('midihub.rulesApp', false);
    const thru = document.getElementById('mh-thru');
    const arm = () => { thru.checked = true; thru.dispatchEvent(new Event('change')); };
    arm(); let from = __sent.length;
    __recv([0xF0, 0x43, 0x10, 0x7F, 0xF7]);
    const sysexBlocked = __sent.length === from;
    __echo = 'sync'; __recv([0x90, 66, 95]); __echo = false;
    const syncCount = __sent.length - from;
    arm(); from = __sent.length; __echo = 'async'; __recv([0x90, 67, 96]);
    await new Promise(r => setTimeout(r, 25)); __echo = false;
    const asyncCount = __sent.length - from;
    arm(); from = __sent.length; __recv([0xF8]);
    await new Promise(r => setTimeout(r, 12)); __recv([0xF8]);
    const clockThruCount = __sent.length - from;
    __recv([0x90, 70, 97]); __recv([0xB0, 64, 127]);
    App.store.set('midihub.rules', [{ id: 'changed', on: true, m: { type: 'note', ch: 0, lo: 0, hi: 127 }, a: { add: 12, ch: 4 } }]);
    from = __sent.length; __recv([0x80, 70, 0]); const thruRuleOff = __since(from);
    App.store.set('midihub.rules', []);
    from = __sent.length;
    thru.checked = false; thru.dispatchEvent(new Event('change'));
    const thruOffReleases = __since(from);

    const key = document.querySelector('#mh-kb [data-note="60"]');
    const down = () => key.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const up = () => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    App.store.set('midihub.rules', [{ id: 'cleanup', on: true, m: { type: 'note', ch: 0, lo: 0, hi: 127 }, a: { add: 12, ch: 4 } }]);
    App.store.set('midihub.rulesApp', true);
    down(); App.store.set('midihub.rules', []); from = __sent.length; up();
    const transformedOff = __since(from);
    App.store.set('midihub.rules', [{ id: 'gate', on: true, m: { type: 'note', ch: 0, lo: 0, hi: 127 }, a: { to: 'cc', num: 74 } }]);
    down(); App.store.set('midihub.rules', []); from = __sent.length; up();
    const convertedOff = __since(from);
    App.store.set('midihub.rulesApp', false);
    down(); document.getElementById('mh-sus').dispatchEvent(new PointerEvent('pointerdown'));
    document.getElementById('mh-pb').value = 900; document.getElementById('mh-pb').dispatchEvent(new Event('input'));
    document.getElementById('mh-clock').click(); arm();
    from = __sent.length; window.dispatchEvent(new Event('blur'));
    const blur = __since(from), thruOff = !thru.checked, clockOff = /off/.test(document.getElementById('mh-clock').textContent);
    const afterBlur = __sent.length; await new Promise(r => setTimeout(r, 45));
    const quietAfterBlur = __sent.length === afterBlur;

    down(); from = __sent.length; App.midi.setOutput('out2'); up();
    const oldPortOff = __since(from), other = __otherSent.slice();
    App.midi.setOutput('out1');
    down(); from = __sent.length; window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
    const cancelOff = __since(from);

    const templateData = document.getElementById('mh-pcd'); templateData.value = '80'; templateData.dispatchEvent(new Event('input'));
    from = __sent.length; document.getElementById('mh-pcsend').click();
    const invalidTemplateQuiet = __sent.length === from && /invalid/i.test(document.getElementById('mh-pcprev').textContent);
    const savedSend = __out.send; __out.send = () => { throw new Error('test output closed'); };
    document.getElementById('mh-raw').value = 'F0 7E 7F 06 01 F7'; document.getElementById('mh-rawsend').click();
    const sendError = document.getElementById('mh-rawerr').textContent; __out.send = savedSend;
    App.midi.setOutput('missing'); __access.onstatechange(); from = __sent.length;
    document.getElementById('mh-rawsend').click();
    const missingQuiet = __sent.length === from && App.midi.outputId === null;
    return { sysexBlocked, syncCount, asyncCount, clockThruCount, thruRuleOff, thruOffReleases, transformedOff, convertedOff, blur, thruOff, clockOff, quietAfterBlur, oldPortOff, other, cancelOff, sendError, missingQuiet, invalidTemplateQuiet };
  });
  ok(safe.sysexBlocked, 'armed Thru blocks incoming SysEx parameter/dump writes');
  ok(safe.syncCount === 1 && safe.asyncCount === 1, 'Thru feedback is bounded for synchronous and immediate asynchronous echo: ' + safe.syncCount + '/' + safe.asyncCount);
  ok(safe.clockThruCount === 2, 'echo guard preserves separate external MIDI clock ticks');
  ok(J(safe.thruRuleOff) === J([[0x80, 70, 0]]), 'Thru release follows the original sounding note when a rule changes');
  ok(safe.thruOffReleases.some(b => b[0] === 0x80 && b[1] === 66) && safe.thruOffReleases.some(b => b[0] === 0x80 && b[1] === 67) && safe.thruOffReleases.some(b => b[0] === 0xB0 && b[1] === 64 && b[2] === 0), 'disabling Thru releases forwarded hardware notes and sustain');
  ok(J(safe.transformedOff) === J([[0x83, 72, 0]]), 'release uses the note/channel actually sent before rules were edited: ' + J(safe.transformedOff));
  ok(J(safe.convertedOff) === J([[0xB2, 74, 0]]), 'note-to-CC gate gets its matching zero-value release after rules change');
  ok(safe.thruOff && safe.clockOff && safe.quietAfterBlur && safe.blur.some(b => b[0] === 0x82 && b[1] === 60) && safe.blur.some(b => b[0] === 0xB2 && b[1] === 64 && b[2] === 0) && safe.blur.some(b => b[0] === 0xE2 && b[1] === 0 && b[2] === 64), 'blur releases note/sustain/bend and stops clock/Thru');
  ok(J(safe.oldPortOff) === J([[0x82, 60, 0]]) && safe.other.length === 0, 'changing shared output releases held key on original output without writing new output');
  ok(J(safe.cancelOff) === J([[0x82, 60, 0]]), 'pointer cancellation releases held key');
  ok(/send failed/.test(safe.sendError) && safe.missingQuiet, 'failed or missing output displays failure and never falls back');
  ok(safe.invalidTemplateQuiet, 'SysEx builders reject status bytes inside parameter data instead of writing malformed frames');

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
  await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
