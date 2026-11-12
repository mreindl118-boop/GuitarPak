// MIDI Hub (js/midihub.js) against a fake Web MIDI device that records every
// byte sent: the Hub pill of the Synth tab, the raw tap + monitor, on-screen keys and
// controls going OUT on the Hub channel, rules (remap / transpose / block /
// channel) on Thru and on what soundLAB hears, device profiles + SysEx
// builders, panic, and the service additions (App.midi.send / setInputFilter /
// midi:raw / midi:out).
// 2.0 Phase A3a: two pieces of the Hub are shared files now and are checked
// here against what the Hub shows. The rule engine and the input-filter
// install are js/midirules.js (App.midiRules: the Hub's applyRules is its
// apply; the filter also follows midihub.rulesIn on a 'storage' event, the box
// ticked in another window). "Which output is the synth" is App.midi.synthOut
// in js/midi.js, the one copy the Hub header and the Player card name.
// The Player card (js/scoreplayer.js) is checked here for its REPAINT PATH: the
// Hub's hook (a Part button, the header's Synth out select) and, with that hook
// stubbed, the module's own 'midi:state' / 'lights' listeners.
// 2.0 Phase A3b: the Hub is a page of soundLAB Gear (gear.html, env.GEAR_URL),
// which boots on the Deck. Gear has no app voice (no Keys page, no App.keys), so
// the App voice box is hidden there, and "another page" is a Gear page (Helix):
// App.switchTo(<a soundLAB page>) inside Gear leaves for index.html.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }

async function newPage(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript((seed) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('soundlab2.' + k, 'true'));
    for (const k in seed) localStorage.setItem('soundlab2.' + k, JSON.stringify(seed[k]));
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
  await page.goto(env.GEAR_URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.midi.hasOutput && App.active === 'deck');
  return { ctx, page, errs };
}
const J = JSON.stringify;
// the same messages through the Hub's applyRules and through the shared engine
// (App.midiRules.apply, js/midirules.js), each as one line; [] reads 'blocked'
const flat = list => list.map(r => r.map(b => b.join(' ')).join('+') || 'blocked').join('|');
async function bothEngines(page, msgs) {
  const r = await page.evaluate(msgs => ({ hub: msgs.map(b => SLMidiHub.applyRules(b.slice())), eng: msgs.map(b => App.midiRules.apply(b.slice())) }), msgs);
  return { hub: flat(r.hub), eng: flat(r.eng) };
}

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
  ok(nav.active === 'midihub' && nav.group === 'Synth' && nav.pills === 'Deck|Live|Hub', 'MIDI Hub is the Hub pill of the Synth tab (1.3): ' + nav.pills);
  ok(nav.views === 'control,player,play,controls,rules,sysex,monitor,learn', 'eight views, Control first, then Player: ' + nav.views);
  // the shared service hears All keyboards by default (v0.79 multi-input)
  ok(nav.ports && nav.inSel === 'all' && nav.outSel === 'out1' && /In: All keyboards · Synth out: Synth Port 1/.test(nav.status), 'ports picked: All keyboards in, the synth port out: ' + nav.status);
  ok(nav.keys === '15/10' && nav.tour, 'two octaves of keys and a help tour');
  // "which output is the synth" is the service's one copy (App.midi.synthOut): the header shows it
  const so1 = await page.evaluate(() => ({
    id: App.midi.synthOut.id(), name: App.midi.synthOut.name(), has: App.midi.synthOut.has(), hub: SLMidiHub.outId,
    sel: document.getElementById('mh-out').value, status: document.getElementById('mh-status').textContent
  }));
  ok(so1.id === 'out1' && so1.sel === 'out1' && so1.hub === 'out1' && so1.name === 'Synth Port 1' && so1.has === true && so1.status.includes('Synth out: ' + so1.name),
    'App.midi.synthOut is the port the header shows: ' + J({ id: so1.id, name: so1.name, has: so1.has }));

  console.log('# no app voice in soundLAB Gear: the App voice box is hidden');
  // Gear loads no Keys page (no App.keys), so there is no app voice to switch: the box and its texts are out of sight
  const mu = await page.evaluate(() => {
    const seen = el => !!el && el.getClientRects().length > 0;
    const top = document.querySelector('#panel-midihub .mh-top'), box = document.getElementById('mh-hear');
    const heard = []; App.on('midi:note', d => heard.push(d.midi + ':' + (d.on ? 1 : 0)));
    __recv([0x90, 50, 90]); __recv([0x80, 50, 0]);
    return {
      keys: typeof App.keys, ports: seen(document.getElementById('mh-thru')), box: seen(box),
      label: [...top.querySelectorAll('label, span, button')].filter(el => /^\s*App voice\s*$/.test(el.textContent) && seen(el)).length,
      info: document.getElementById('mh-thruinfo').textContent, heard: heard.join()
    };
  });
  ok(mu.keys === 'undefined' && mu.ports && !mu.box && mu.label === 0, 'the ports row is shown (Thru is there) and the App voice box is not: ' + J({ keys: mu.keys, box: mu.box, label: mu.label }));
  ok(!/voice is muted/i.test(mu.info), 'the line under the ports says nothing about a muted app voice: ' + J(mu.info));
  ok(mu.heard === '50:1,50:0', 'incoming notes still reach the bus (midi:note): ' + mu.heard);

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
  ok(pan.length >= 64 && pan.filter(b => b[1] === 123).length === 16 && pan.filter(b => b[1] === 120).length === 16 &&
    pan.filter(b => (b[0] & 0xf0) === 0xe0 && b[1] === 0 && b[2] === 64).length === 16,
    'panic retains notes/sound off and bend centre on all 16 channels, plus scoped held-note/sustain cleanup');
  // the Player's messages are the app-wide toast (#app-toast) since A3a, the Hub keeps #mh-toast: on a phone
  // the two sit at the same place, so on the Hub page a Hub message takes an older app-wide one down
  const tw = await page.evaluate(() => {
    const shown = id => { const t = document.getElementById(id); return t && !t.hidden ? t.textContent : ''; };
    App.toast('Ready: Four'); const o = { before: shown('app-toast') };
    document.getElementById('mh-panic').click();
    o.app = shown('app-toast'); o.hub = shown('mh-toast');
    App.toast('Finished: Four'); o.newer = shown('app-toast'); // the other order: the app-wide toast is drawn above the Hub's
    // off the Hub page its toast is not on screen (the Deck and Live pages call into the Hub): the app-wide one stays
    App.switchTo('helix'); App.toast('On another page'); SLMidiHub.api.toast('Hub, off screen'); o.away = shown('app-toast');
    App.switchTo('midihub');
    return o;
  });
  ok(tw.before === 'Ready: Four' && tw.app === '' && /^Panic/.test(tw.hub), 'on the Hub page a Hub message replaces an older app-wide message (one at a time): ' + J(tw.hub));
  ok(tw.newer === 'Finished: Four' && tw.away === 'On another page', 'a newer app-wide message shows; off the Hub page the Hub\u2019s toast leaves it alone: ' + J([tw.newer, tw.away]));

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
  ok(lockThru.join('|') === '144 74 100', 'Scale lock on Thru: post-rule out-of-key notes and their unowned offs stay home; allowed note-on passes: ' + lockThru.join('|'));

  console.log('# one rule engine: the Hub and the shared js/midirules.js');
  // remap, transpose and block are stored: a note on / off / on with velocity 0 / past the top key, the remapped CC
  // and another CC, both kinds of aftertouch (the one "at" rule takes both), then bend, program, clock and SysEx
  const e1 = await bothEngines(page, [[0x91, 10, 1], [0x90, 60, 100], [0x80, 60, 0], [0x90, 60, 0], [0x90, 120, 100], [0xB0, 74, 40], [0xB0, 7, 100],
    [0xD0, 99], [0xA0, 60, 50], [0xE0, 0, 64], [0xC0, 9], [0xF8], [0xF0, 0x43, 0x00, 0xF7]]);
  ok(e1.eng === e1.hub, 'App.midiRules.apply gives what SLMidiHub.applyRules gives (set number, add, block): ' + e1.eng);
  ok(e1.eng === '145 22 1|144 72 100|128 72 0|128 72 0|144 127 100|176 1 40|176 7 100|blocked|blocked|224 0 64|192 9|248|240 67 0 247',
    'and it is what the rules say: notes +12 (velocity 0 leaves as a note off, 127 is the top), CC 74 as CC 1, aftertouch gone, the rest untouched');

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

  console.log('# the same switch set in another window (a storage event)');
  const st = await page.evaluate(() => {
    const K = 'soundlab2.midihub.rulesIn';
    // what another window of this origin does: it writes the key itself, this window only gets the event
    const write = v => { if (v === null) localStorage.removeItem(K); else localStorage.setItem(K, JSON.stringify(v)); };
    const tell = key => window.dispatchEvent(new StorageEvent('storage', { key: key, url: location.href, storageArea: localStorage }));
    const notes = []; App.on('midi:note', d => notes.push(d.midi + ':' + (d.on ? 1 : 0)));
    const states = []; App.on('midirules:state', () => states.push(App.midiRules.active().on));
    const box = () => document.getElementById('mh-rulesin').checked; // the Hub's "Apply to what soundLAB hears"
    const o = { start: !!App.midi.inputFilter, box: [box()] };
    write(true);
    o.written = !!App.midi.inputFilter; // nothing has read the switch again yet
    tell(K);
    o.on = { has: !!App.midi.inputFilter, active: App.midiRules.active() }; o.box.push(box());
    __recv([0x90, 48, 80]); __recv([0x80, 48, 0]); o.on.notes = notes.splice(0).join();
    write(false); tell(K);
    o.off = { has: !!App.midi.inputFilter, active: App.midiRules.active() }; o.box.push(box());
    __recv([0x90, 48, 80]); __recv([0x80, 48, 0]); o.off.notes = notes.splice(0).join();
    // a cleared store arrives as an event with no key: the switch is read again as well
    write(true); tell(K); o.again = !!App.midi.inputFilter;
    write(null); tell(null); o.cleared = !!App.midi.inputFilter;
    App.store.set('midihub.rulesIn', false); // as the Hub left it
    o.states = states.join();
    return o;
  });
  ok(!st.start && !st.written, 'writing midihub.rulesIn to storage alone installs nothing: the switch is read when the filter is installed');
  ok(st.on.has && st.on.notes === '60:1,60:0' && st.on.active.on === true && st.on.active.rules === 3,
    'a storage event for that key installs the filter: the app hears C3 as C4, active() = ' + J(st.on.active));
  ok(!st.off.has && st.off.notes === '48:1,48:0' && st.off.active.on === false, 'and removes it again the same way: plain notes, active() = ' + J(st.off.active));
  ok(st.again && !st.cleared, 'a cleared store (a storage event with no key) takes the filter off too');
  ok(st.states === 'true,false,true,false', 'midirules:state is sent each time the installed state changes: ' + st.states);
  ok(st.box.join() === 'false,true,false', 'the Hub\u2019s box follows the filter this window has installed: ticked by the other window, then unticked: ' + st.box.join());

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
  // stored now: "everything to channel 2", then the learned CC rule (it changes nothing, and after
  // the first rule nothing is on channel 6 any more): every kind of channel message, and clock
  const e2 = await bothEngines(page, [[0x93, 61, 70], [0x83, 61, 0], [0xB5, 11, 3], [0xB0, 7, 100], [0xE3, 0, 64], [0xD4, 55], [0xC7, 9], [0xA2, 60, 50], [0xF8]]);
  ok(e2.eng === e2.hub && e2.eng === '145 61 70|129 61 0|177 11 3|177 7 100|225 0 64|209 55|193 9|161 60 50|248',
    'the shared engine and the Hub agree on set channel, for every kind of channel message: ' + e2.eng);

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
      const from3 = __sent.length; App.switchTo('helix'); // another page of soundLAB Gear
      r({ n, label: document.getElementById('mh-clock').textContent, tr, left: __since(from3).map(b => b.join(' ')) });
    }, 520);
  }));
  ok(ck.n >= 20 && ck.n <= 28 && /off/.test(ck.label), '~24 clocks per beat at 120 BPM over half a second: ' + ck.n);
  ok(ck.tr.join() === '250,252', 'Start / Stop realtime: ' + ck.tr);
  ok(ck.left.includes('130 60 0') && ck.left.every(b => b === '130 60 0' || b === '178 64 0'),
    'leaving the page releases held keys and sustain only on the used channel: ' + ck.left.join('|'));

  ok(errs.length === 0, 'no page errors (one synth port)' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# synth control: a MODX + a LUMI + Windows\u2019 wavetable');
  ({ ctx, page, errs } = await (async () => {
    const c2 = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await c2.addInitScript(() => {
      ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('soundlab2.' + k, 'true'));
      localStorage.setItem('soundlab2.midi.outputId', JSON.stringify('lumi'));
      localStorage.setItem('soundlab2.midihub.profile', JSON.stringify('yamaha'));
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
    await pg.goto(env.GEAR_URL);
    await pg.waitForFunction(() => window.App && App.midi && App.midi.ready && App.midi.hasOutput && App.active === 'deck');
    return { ctx: c2, page: pg, errs: er };
  })());
  // before the Hub is opened: the service already knows which output is the synth (App.midi.synthOut)
  const pre = await page.evaluate(() => ({ active: App.active, id: App.midi.synthOut.id(), name: App.midi.synthOut.name(), has: App.midi.synthOut.has() }));
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
    o.plPart = [document.getElementById('mh-plpartlab').textContent];
    document.querySelector('#mh-parts [data-part="2"]').click();
    o.plPart.push(document.getElementById('mh-plpartlab').textContent); // the Player card, with no click on it
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
  ok(sc.plPart.join('|') === 'All on Part 1|All on Part 3', 'the Player card follows the Part button (the Hub\u2019s hook, SLScorePlayer.paint()): ' + sc.plPart.join(' -> '));
  ok(sc.two.cut === 20 && sc.two.label === '20' && sc.two.prog === '10' && sc.otherPart === 20, 'two-way: the MODX\u2019s own cutoff and program on Part 3 move the screen; other parts don\u2019t: ' + JSON.stringify(sc.two));
  ok(sc.next.join('|') === '178 0 63|178 32 0|194 10' && sc.pnum === '11', 'Next program: bank 63/0 then program 11 on Part 3: ' + sc.next.join('|'));
  ok(sc.sendAll === 17 && sc.reset === 64, 'Send all sends every knob (17); double-tap resets a knob to its start value');
  ok(sc.shared.lumi === 1 && sc.shared.modx === 0 && sc.back === 'modx1', 'Same as key lights is a deliberate choice; picking MODX-1 again goes back');

  console.log('# App.midi.synthOut: the one copy of "which output is the synth"');
  ok(pre.active !== 'midihub' && pre.id === 'modx1' && pre.name === 'MODX-1' && pre.has === true,
    'the service names the synth before the Hub is opened: MODX-1 (port 1 first), never the LUMI or the wavetable: ' + J(pre));
  ok(sc.outSel === pre.id && sc.status.includes('Synth out: ' + pre.name) && sc.cvout.includes(pre.name), 'the Hub header shows that port');
  const so = await page.evaluate(() => {
    const S = App.midi.synthOut, sel = document.getElementById('mh-out'), nn = v => v == null ? null : String(v);
    const snap = () => ({
      id: nn(S.id()), name: S.name(), has: S.has(), hub: nn(SLMidiHub.outId), sel: sel.value, status: document.getElementById('mh-status').textContent,
      cvout: document.getElementById('mh-cvout').textContent, plout: document.getElementById('mh-plout').textContent
    });
    const o = { picked: snap() }; // MODX-1, picked by hand at the end of the block above
    sel.value = 'shared'; sel.dispatchEvent(new Event('change')); o.shared = snap();
    // set() without the header (what a Player card with its own selects does): the same store key, and the card's paint() reads it
    S.set('modx2'); SLScorePlayer.paint();
    o.set = { id: nn(S.id()), name: S.name(), has: S.has(), hub: nn(SLMidiHub.outId), stored: App.store.get('midihub.outId', null), plout: document.getElementById('mh-plout').textContent };
    // the card's own listeners, with the Hub's hook taken away: the Hub calls SLScorePlayer.paint() through
    // the property, the module's 'midi:state' and 'lights' listeners hold the function itself
    const keep = SLScorePlayer.paint, plout = () => document.getElementById('mh-plout').textContent;
    SLScorePlayer.paint = function () {};
    sel.value = 'shared'; sel.dispatchEvent(new Event('change')); o.own = { hookGone: plout() }; // the header changed and could not tell the card
    App.emit('midi:state', {}); o.own.state = plout();
    S.set('modx2'); o.own.untold = plout(); App.emit('lights'); o.own.lights = plout();
    SLScorePlayer.paint = keep;
    sel.value = 'modx1'; sel.dispatchEvent(new Event('change')); o.back = snap();
    return o;
  });
  // id() / name() / has() against the header's select and status line, the Control card and the Player card
  const agrees = (s, id, name) => s.id === id && s.hub === id && s.sel === (id == null ? 'shared' : id) && s.name === name && s.has === true &&
    s.status.includes('Synth out: ' + name) && s.cvout.includes(name) && s.plout.includes(name);
  ok(agrees(so.picked, 'modx1', 'MODX-1'), 'a port picked in the header: id(), name() and has() are that port, and the Player card names it: ' + so.picked.plout);
  ok(agrees(so.shared, null, 'LUMI Keys BLOCK'), 'Same as key lights: id() is null and name() is the key-light output: ' + so.shared.status);
  ok(so.set.id === 'modx2' && so.set.name === 'MODX-2' && so.set.has === true && so.set.hub === 'modx2' && so.set.stored === 'modx2' && so.set.plout.includes('MODX-2'),
    'synthOut.set(id) writes midihub.outId: the Hub reads the same port and SLScorePlayer.paint() names it: ' + so.set.plout);
  ok(so.own.hookGone.includes('MODX-2') && so.own.state.includes('LUMI Keys BLOCK') && so.own.untold.includes('LUMI Keys BLOCK') && so.own.lights.includes('MODX-2'),
    'with the Hub\u2019s hook stubbed the card repaints itself on midi:state and on lights (what a mount without a Hub relies on): ' + J(so.own));
  ok(agrees(so.back, 'modx1', 'MODX-1'), 'and MODX-1 picked in the header again is MODX-1 everywhere');

  console.log('# the Player card after a Hub re-render (Reset Hub mounts it again)');
  // last on purpose: Reset Hub clears the Hub's settings (not the Synth out choice)
  const rm = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms)), q = id => document.getElementById(id);
    const ons = from => __by.modx1.slice(from).filter(b => (b[0] & 0xf0) === 0x90).length;
    SLScorePlayer.loadScore({ title: 'Remount', bpm: 120, len: 4, notes: [60, 62, 64, 65].map((m, i) => ({ t: i, d: 1, m, partId: 'p1', v: 100 })) });
    const before = document.querySelector('#mh-player .mh-pl');
    document.querySelector('#mh-views [data-view="learn"]').click(); q('mh-reset').click(); await wait(100);
    const o = { cards: document.querySelectorAll('.mh-pl').length, plays: document.querySelectorAll('#mh-plplay').length, fresh: document.querySelector('#mh-player .mh-pl') !== before,
      info: q('mh-plinfo').textContent, out: q('mh-plout').textContent, enabled: !q('mh-plplay').disabled };
    document.querySelector('#mh-views [data-view="player"]').click();
    const n = __by.modx1.length;
    q('mh-plplay').click(); o.click1 = { playing: SLScorePlayer.state.playing, btn: q('mh-plplay').textContent }; await wait(60);
    o.ons = ons(n); o.held = SLScorePlayer.state.held;
    q('mh-plplay').click(); o.click2 = { playing: SLScorePlayer.state.playing, btn: q('mh-plplay').textContent, held: SLScorePlayer.state.held };
    q('mh-plstop').click();
    return o;
  });
  ok(rm.cards === 1 && rm.plays === 1 && rm.fresh && /Remount/.test(rm.info) && rm.out.includes('MODX-1') && rm.enabled,
    'Reset Hub renders the Hub again: one new Player card, still on the open song and the synth out: ' + rm.info + ' ' + rm.out);
  ok(rm.click1.playing && rm.click1.btn === 'Pause' && rm.ons === 1 && rm.held === 1 && !rm.click2.playing && rm.click2.btn === 'Play' && rm.click2.held === 0,
    'the new card is wired once: one click plays (one Note On), the next click pauses and releases: ' + J({ click1: rm.click1, ons: rm.ons, click2: rm.click2 }));

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
  await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
