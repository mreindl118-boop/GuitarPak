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
    const out = { id: 'out1', name: 'Synth Port 1', state: 'connected', send: b => window.__sent.push(Array.from(b)) };
    const access = { inputs: new Map([['in1', inp]]), outputs: new Map([['out1', out]]), sysexEnabled: true, onstatechange: null };
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
  let { ctx, page, errs } = await newPage(browser, { 'lights.on': false });

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
  ok(nav.active === 'midihub' && nav.group === 'Keys' && nav.pills === 'Piano|Synth|Pads|MIDI', 'MIDI Hub is the fourth Keys pill: ' + nav.pills);
  ok(nav.views === 'control,play,controls,rules,sysex,monitor,learn', 'seven views, Control first: ' + nav.views);
  // the shared service hears All keyboards by default (v0.79 multi-input)
  ok(nav.ports && nav.inSel === 'all' && nav.outSel === 'out1' && /In: All keyboards · Synth out: Synth Port 1/.test(nav.status), 'ports picked: All keyboards in, the synth port out: ' + nav.status);
  ok(nav.keys === '15/10' && nav.tour, 'two octaves of keys and a help tour');

  console.log('# app voice muted on the Hub');
  const mu = await page.evaluate(() => {
    const notes = []; App.on('midi:note', d => notes.push(!!d.mute));
    __recv([0x90, 50, 90]); __recv([0x80, 50, 0]);
    const onHub = notes.slice();
    document.getElementById('mh-hear').checked = true; document.getElementById('mh-hear').dispatchEvent(new Event('change'));
    __recv([0x90, 50, 90]); __recv([0x80, 50, 0]);
    const hear = notes.slice(2);
    document.getElementById('mh-hear').checked = false; document.getElementById('mh-hear').dispatchEvent(new Event('change'));
    App.switchTo('piano');
    __recv([0x90, 50, 90]); __recv([0x80, 50, 0]);
    const piano = notes.slice(4);
    App.midi.setAppSound(false);
    __recv([0x90, 50, 90]); __recv([0x80, 50, 0]);
    const off = notes.slice(6);
    App.midi.setAppSound(true); App.switchTo('midihub');
    return { onHub, hear, piano, off, muted: App.midi.muted, info: document.getElementById('mh-thruinfo').textContent };
  });
  ok(mu.onHub.join() === 'true,true' && mu.hear.join() === 'false,false', 'Hub open: incoming notes carry mute, App voice ticked clears it: ' + J(mu));
  ok(mu.piano.join() === 'false,false' && mu.off.join() === 'true,true' && mu.muted && /muted here/.test(mu.info), 'other pages follow the Settings switch; back on the Hub it is muted again');

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
    // Panic then Clear in the same frame: Clear also drops the 64 rows still
    // waiting for the monitor's next frame (they used to show up after it)
    document.querySelector('#mh-views [data-view="monitor"]').click(); document.getElementById('mh-panic').click(); document.getElementById('mh-monclear').click();
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
  const lockThru = await page.evaluate(() => {
    const r0 = App.store.get('fb.root', 9), s0 = App.store.get('fb.scale', 'minorPent');
    App.store.set('fb.root', 0); App.store.set('fb.scale', 'major');
    App.scaleLock.set(true);
    const from = __sent.length;
    __recv([0x90, 61, 100]); __recv([0x80, 61, 0]); __recv([0x90, 62, 100]); // C# (out of C major), then D — each +12 by the rule
    const sent = __since(from).map(b => b.join(' '));
    App.scaleLock.set(false); App.store.set('fb.root', r0); App.store.set('fb.scale', s0);
    return sent;
  });
  ok(lockThru.join('|') === '128 73 0|144 74 100', 'Scale lock on Thru: checked on the note the rules produce; out-of-key note-ons stay home, note-offs pass: ' + lockThru.join('|'));

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

  ok(errs.length === 0, 'no page errors (one synth port)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# synth control: a MODX + a LUMI + Windows\u2019 wavetable');
  ({ ctx, page, errs } = await (async () => {
    const c2 = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await c2.addInitScript(() => {
      ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
      localStorage.setItem('guitarlab.midi.outputId', JSON.stringify('lumi'));
      localStorage.setItem('guitarlab.midihub.profile', JSON.stringify('yamaha'));
      window.__by = { lumi: [], gs: [], modx1: [], modx2: [] };
      const mk = (id, name) => ({ id, name, state: 'connected', send: b => window.__by[id].push(Array.from(b)) });
      const outs = new Map([['gs', mk('gs', 'Microsoft GS Wavetable Synth')], ['lumi', mk('lumi', 'LUMI Keys BLOCK')], ['modx2', mk('modx2', 'MODX-2')], ['modx1', mk('modx1', 'MODX-1')]]);
      const modxIn = { id: 'mi', name: 'MODX-1', state: 'connected', onmidimessage: null };
      const lumiIn = { id: 'li', name: 'LUMI Keys BLOCK', state: 'connected', onmidimessage: null };
      const access = { inputs: new Map([['mi', modxIn], ['li', lumiIn]]), outputs: outs, sysexEnabled: true, onstatechange: null };
      navigator.requestMIDIAccess = () => Promise.resolve(access);
      window.__fromModx = (bytes) => modxIn.onmidimessage({ data: new Uint8Array(bytes) });
    });
    const pg = await c2.newPage(), er = [];
    pg.on('pageerror', e => er.push(e.message));
    await pg.goto(env.URL);
    await pg.waitForFunction(() => window.App && App.midi && App.midi.ready && App.midi.hasOutput && App.active === 'quiz');
    return { ctx: c2, page: pg, errs: er };
  })());
  const sc = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    App.switchTo('midihub'); await wait(100);
    const o = {
      view: [...document.querySelectorAll('.mh-view')].filter(v => !v.hidden).map(v => v.dataset.view).join(),
      outSel: document.getElementById('mh-out').value, lights: App.midi.outputId, status: document.getElementById('mh-status').textContent,
      cvout: document.getElementById('mh-cvout').textContent,
      parts: document.querySelectorAll('#mh-parts [data-part]').length, plab: (document.querySelector('.mh-plab') || {}).textContent,
      hero: (document.querySelector('#mh-hero .mh-kn') || {}).textContent,
      knobs: [...document.querySelectorAll('#mh-knobs .mh-kn')].map(k => k.textContent).join('|'),
      extra: document.querySelectorAll('#mh-extra .mh-knob').length
    };
    Object.keys(__by).forEach(k => { __by[k].length = 0; });
    // keyboard: arrow up on Cutoff
    const cut = document.querySelector('.mh-knob[data-cc="74"]');
    cut.focus(); cut.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    // drag the Super Knob up 30 px
    const sk = document.querySelector('.mh-knob[data-cc="95"]'), r = sk.getBoundingClientRect();
    sk.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 10, clientY: r.top + 40, pointerId: 1 }));
    sk.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 10, clientY: r.top + 10, pointerId: 1 }));
    sk.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    o.cut = SLMidiHub.knob(74); o.sk = SLMidiHub.knob(95); o.skLabel = sk.querySelector('.mh-kv').textContent;
    o.toModx = __by.modx1.map(b => b.join(' ')); o.toLumi = __by.lumi.length; o.toGs = __by.gs.length; o.toModx2 = __by.modx2.length;
    // part 3, then a knob there and the values are per part
    document.querySelector('#mh-parts [data-part="2"]').click();
    o.p3 = { ch: App.store.get('midihub.ch'), cut: SLMidiHub.knob(74), sel: document.getElementById('mh-ch').value, active: document.querySelector('#mh-parts .active').textContent };
    __by.modx1.length = 0;
    document.querySelector('.mh-knob[data-cc="17"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    o.assign = __by.modx1.map(b => b.join(' '));
    // two-way: the MODX turns cutoff on part 3 and changes program
    __fromModx([0xB2, 74, 20]); __fromModx([0xC2, 9]);
    o.two = { cut: SLMidiHub.knob(74), label: document.querySelector('.mh-knob[data-cc="74"] .mh-kv').textContent, prog: document.getElementById('mh-cvpnum').textContent };
    __fromModx([0xB0, 74, 99]); // another part: ignored here
    o.otherPart = SLMidiHub.knob(74);
    // program prev / next, send all, double-tap reset
    __by.modx1.length = 0;
    document.getElementById('mh-cvnext').click();
    o.next = __by.modx1.map(b => b.join(' ')); o.pnum = document.getElementById('mh-cvpnum').textContent;
    __by.modx1.length = 0;
    document.getElementById('mh-cvsend').click();
    o.sendAll = __by.modx1.length;
    document.querySelector('.mh-knob[data-cc="74"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    o.reset = SLMidiHub.knob(74);
    // choosing the shared light output on purpose
    const sel = document.getElementById('mh-out'); sel.value = 'shared'; sel.dispatchEvent(new Event('change'));
    __by.lumi.length = 0; __by.modx1.length = 0;
    document.querySelector('.mh-knob[data-cc="71"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    o.shared = { lumi: __by.lumi.length, modx: __by.modx1.length };
    sel.value = 'modx1'; sel.dispatchEvent(new Event('change'));
    o.back = SLMidiHub.outId;
    return o;
  });
  ok(sc.view === 'control' && sc.outSel === 'modx1' && sc.lights === 'lumi', 'Control opens first; the Hub picks MODX-1 while the key lights keep the LUMI: ' + JSON.stringify({ v: sc.view, out: sc.outSel, lights: sc.lights }));
  ok(/Synth out: MODX-1 · Key lights: LUMI Keys BLOCK/.test(sc.status) && /Part 1 → MODX-1/.test(sc.cvout), 'status names both outputs: ' + sc.status + ' / ' + sc.cvout);
  ok(sc.parts === 16 && sc.plab === 'Part' && sc.hero === 'Super Knob' && sc.knobs === 'Cutoff|Resonance|Attack|Release|Reverb|Chorus|Volume|Pan' && sc.extra === 8, 'Yamaha: 16 Parts, a big Super Knob, 8 sound knobs, 8 Assign knobs');
  ok(sc.cut === 65 && sc.sk > 0 && String(sc.sk) === sc.skLabel, 'arrow key and drag turn knobs: cutoff ' + sc.cut + ', Super Knob ' + sc.sk);
  ok(sc.toModx[0] === '176 74 65' && sc.toModx.some(b => b.startsWith('176 95 ')) && sc.toLumi === 0 && sc.toGs === 0 && sc.toModx2 === 0, 'knobs go to MODX-1 only, never the LUMI or the wavetable: ' + sc.toModx.slice(0, 3));
  ok(sc.p3.ch === 2 && sc.p3.cut === 64 && sc.p3.sel === '2' && sc.p3.active === '3' && sc.assign[0] === '178 17 127', 'Part 3 has its own knob values and sends on channel 3: ' + sc.assign);
  ok(sc.two.cut === 20 && sc.two.label === '20' && sc.two.prog === '10' && sc.otherPart === 20, 'two-way: the MODX\u2019s own cutoff and program on Part 3 move the screen; other parts don\u2019t: ' + JSON.stringify(sc.two));
  ok(sc.next.join('|') === '178 0 63|178 32 0|194 10' && sc.pnum === '11', 'Next program: bank 63/0 then program 11 on Part 3: ' + sc.next.join('|'));
  ok(sc.sendAll === 17 && sc.reset === 64, 'Send all sends every knob (17); double-tap resets a knob to its start value');
  ok(sc.shared.lumi === 1 && sc.shared.modx === 0 && sc.back === 'modx1', 'Same as key lights is a deliberate choice; picking MODX-1 again goes back');

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
  await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
