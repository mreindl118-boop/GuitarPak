// The Synth tab (js/synthtab.js over js/synthdeck.js's perform API): the
// Synth group and its pills, the Deck's perform face against a fake MODX +
// LUMI (every byte recorded per port): strips that send coalesced CCs on the
// Part channel, the row picker and Assign-knob names from a Performance dump,
// chips and Scenes through the deck's funnel, Prev/Next, Perform <-> Edit
// (the borrowed Control view), Explain captions, Back, the phone layout.
// Nothing may ever reach the LUMI bucket.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const CLEAN = /^(17[6-9]|18\d|19[01]) 64 0$/;
const nonClean = a => a.filter(b => !CLEAN.test(b));

async function newPage(browser, seed, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1200, height: 900 }, hasTouch: !!(viewport && viewport.width < 800) });
  await ctx.addInitScript((seed) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.lights.on', 'false');
    localStorage.setItem('guitarlab.midi.outputId', JSON.stringify('lumi'));
    localStorage.setItem('guitarlab.midihub.profile', JSON.stringify('yamaha'));
    for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
    window.__by = { lumi: [], modx1: [] };
    const mk = (id, name) => ({ id, name, state: 'connected', send: b => { const a = Array.from(b); if (id !== 'lumi' || a[0] < 0xF0) window.__by[id].push(a); } });
    const outs = new Map([['lumi', mk('lumi', 'LUMI Keys BLOCK')], ['modx1', mk('modx1', 'MODX-1')]]);
    const modxIn = { id: 'mi', name: 'MODX-1', state: 'connected', onmidimessage: null };
    const lumiIn = { id: 'li', name: 'LUMI Keys BLOCK', state: 'connected', onmidimessage: null };
    const access = { inputs: new Map([['mi', modxIn], ['li', lumiIn]]), outputs: outs, sysexEnabled: true, onstatechange: null };
    window.__fromLumi = (bytes) => lumiIn.onmidimessage({ data: new Uint8Array(bytes) });
    navigator.requestMIDIAccess = () => Promise.resolve(access);
    window.__fromModx = (bytes) => modxIn.onmidimessage({ data: new Uint8Array(bytes) });
    window.__bytes = (id) => window.__by[id || 'modx1'].map(b => b.join(' '));
    window.__clear = () => Object.keys(window.__by).forEach(k => { window.__by[k].length = 0; });
    window.__wait = (ms) => new Promise(r => setTimeout(r, ms));
    window.__nonClean = (a) => a.filter(b => !/^(17[6-9]|18\d|19[01]) 64 0$/.test(b));
    window.__q = (s) => document.querySelector(s);
    window.__qa = (s) => Array.from(document.querySelectorAll(s));
    window.__pt = (el, type, x, y) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, clientX: r.left + x, clientY: r.top + (y == null ? r.height / 2 : y), button: 0 })); };
  }, seed || {});
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.midi.hasOutput && App.active === 'quiz');
  return { ctx, page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  let { ctx, page, errs } = await newPage(browser);

  console.log('# the Synth tab and the Deck face');
  const nav = await page.evaluate(async () => {
    App.switchTo('deck'); await __wait(400);
    const o = { active: App.active, group: (__q('#tabbar .tabbar-btn.active') || {}).textContent, pills: __qa('#subnav .subtab').map(b => b.textContent).join('|'), mode: SLSynthTab.mode(), borrowed: SLSynthTab.borrowed() };
    o.sent = __nonClean(__bytes()).length; o.lumi = __by.lumi.length;
    o.now = __q('#st-nowname').textContent; o.sub = __q('#st-nowsub').textContent;
    o.strips = __qa('#panel-deck .st-strip').length; o.labels = __qa('#panel-deck .st-lab').map(x => x.textContent);
    o.chips = __qa('#panel-deck .st-chip').map(b => b.textContent); o.scenes = __qa('#panel-deck .st-scene').length;
    o.editHidden = __q('#st-edit').hidden; o.controlInDeck = !!__q('#panel-deck .mh-view[data-view="control"]');
    return o;
  });
  ok(nav.active === 'deck' && nav.group === 'Synth' && nav.pills === 'Deck|Live|Hub', 'the Synth tab opens on the Deck with pills Deck|Live|Hub: ' + nav.group + ' / ' + nav.pills);
  ok(nav.sent === 0 && nav.lumi === 0, 'opening the Deck sends nothing to the synth and nothing to the LUMI');
  ok(/CFX \+ FM EP/.test(nav.now) && /Part 1/.test(nav.sub), 'the Now bar names the factory sound and the Part: ' + nav.now + ' · ' + nav.sub);
  ok(nav.strips === 5 && nav.labels.join('|') === 'Super Knob|Cutoff|Reverb|Attack|Assign knob 1', 'a Super Knob strip and four Favourites strips: ' + nav.labels.join('|'));
  ok(nav.chips.join('|') === 'Arpeggiator|Motion sequencer|Split|Assign Sw 1|Assign Sw 2|Sustain' && nav.scenes === 8, 'chips for arp, motion seq, split, the two Assign switches, sustain, and eight Scenes');
  ok(nav.mode === 'perform' && nav.editHidden && nav.borrowed && nav.controlInDeck, 'Perform is the default; the Hub Control view is borrowed but folded away');

  console.log('# strips: tap and drag anywhere, coalesced, on the Part channel');
  const st = await page.evaluate(async () => {
    const s = __q('#panel-deck .st-strip[data-cc="95"]');
    __clear();
    __pt(s, 'pointerdown', s.getBoundingClientRect().width * 0.5); await __wait(40);
    const o = { afterTap: __bytes().slice(), val: s.getAttribute('aria-valuenow'), shown: __q('#st-superval').textContent };
    for (let i = 0; i < 20; i++) __pt(s, 'pointermove', s.getBoundingClientRect().width * (0.5 + i * 0.02));
    await __wait(60); __pt(s, 'pointerup', s.getBoundingClientRect().width * 0.9); await __wait(40);
    o.afterDrag = __bytes().slice(); o.valEnd = s.getAttribute('aria-valuenow'); o.lumi = __by.lumi.length;
    // fine mode: far below the strip, 10 % of the width moves the value a quarter as much
    const c = __q('#panel-deck .st-strip[data-cc="74"]'); __clear();
    __pt(c, 'pointerdown', 0); await __wait(40);
    __pt(c, 'pointermove', 0, 200); __pt(c, 'pointermove', c.getBoundingClientRect().width * 0.4, 200); await __wait(60); __pt(c, 'pointerup', 0, 200); await __wait(40);
    o.fine = +c.getAttribute('aria-valuenow'); o.fineBytes = __bytes().slice();
    // the Hub's own knob twin follows
    o.hubKnob = SLMidiHub.knob(95);
    return o;
  });
  ok(st.afterTap.length === 1 && /^176 95 6[34]$/.test(st.afterTap[0]) && st.shown === '50 %', 'a tap half-way sends CC 95 ≈ 64 once on channel 1 and shows 50 %: ' + st.afterTap[0]);
  ok(st.afterDrag.length >= 2 && st.afterDrag.length <= 22 && st.afterDrag.every(b => /^176 95 /.test(b)) && +st.valEnd >= 110, 'a drag sends coalesced CC 95 values up to ' + st.valEnd + ' (' + st.afterDrag.length + ' sends for 20 moves)');
  ok(st.fine > 0 && st.fine <= 16 && st.fineBytes.every(b => /^176 74 /.test(b)), 'dragging below the strip gives fine steps (40 % of the width = ' + st.fine + ', not 51)');
  ok(st.lumi === 0 && st.hubKnob === +st.valEnd, 'nothing reached the LUMI; the Hub knob twin shows the same value (' + st.hubKnob + ')');

  console.log('# rows and Assign knob names');
  const rows = await page.evaluate(async () => {
    const o = {};
    __q('#panel-deck [data-row="as1"]').click(); await __wait(50);
    o.as = __qa('#panel-deck .st-lab').map(x => x.textContent).slice(1).join('|');
    // Read name from synth: the dump's name block, then the Assign-names block (30 50 00)
    __clear(); App.synthDeck.perform.readName(); await __wait(30);
    o.request = __bytes().filter(b => /^240 /.test(b)).length;
    const name = 'Sweep Pad'.padEnd(20).split('').map(c => c.charCodeAt(0));
    __fromModx([0xF0, 0x43, 0x00, 0x7F, 0x1C, 0x00, 0x62, 0x07, 0x30, 0x40, 0x00].concat(name, new Array(70).fill(0), [0x00, 0xF7]));
    const names = ['Sweep', 'Grit', 'Air', '', 'Wobble', '', '', 'Shimmer'].map(s => (s || 'Assigned').padEnd(16).split('').map(c => c.charCodeAt(0)));
    __fromModx([0xF0, 0x43, 0x00, 0x7F, 0x1C, 0x01, 0x04, 0x07, 0x30, 0x50, 0x00].concat(...names, [0x00, 0xF7]));
    await __wait(120);
    o.labels = __qa('#panel-deck .st-lab').map(x => x.textContent).slice(1).join('|');
    o.stored = App.synthDeck.perform.assignNames();
    o.nowName = __q('#st-nowname').textContent;
    __q('#panel-deck [data-row="fav"]').click(); await __wait(50);
    o.fav = __qa('#panel-deck .st-lab').map(x => x.textContent).slice(1).join('|');
    return o;
  });
  ok(rows.as === 'Assign knob 1|Assign knob 2|Assign knob 3|Assign knob 4', 'the Assign 1-4 row names its strips Assign knob 1-4: ' + rows.as);
  ok(rows.request === 1 && rows.nowName === 'Sweep Pad', 'Read name from synth asks once and takes the Performance name: ' + rows.nowName);
  ok(rows.stored && rows.stored.join(',') === 'Sweep,Grit,Air,,Wobble,,,Shimmer' && rows.labels === 'Assign knob 1 · Sweep|Assign knob 2 · Grit|Assign knob 3 · Air|Assign knob 4', 'the dump’s Assign-name block names the strips ("Assigned" = blank): ' + rows.labels);
  ok(rows.fav === 'Cutoff|Reverb|Attack|Assign knob 1 · Sweep', 'Favourites carries the name too: ' + rows.fav);

  console.log('# the preset builder: a full snapshot, a data-rich slot, and back');
  const pb = await page.evaluate(async () => {
    const o = {};
    App.emit('fb:set', { source: 't', root: 2, scale: 'dorian', mode: 0 }); await __wait(30);
    __q('#panel-deck [data-chip="scene3"]').click(); await __wait(30);
    __q('#st-save').click(); await __wait(50);
    o.open = !__q('#st-sheet').hidden; o.defaultName = __q('#st-pname').value;
    o.incs = __qa('#st-incs .st-inc').map(b => b.textContent.replace(/\s+/g, ' ').trim());
    __q('#st-pname').value = 'Dorian pad'; __q('#st-ptags').value = 'pad, soft';
    __q('#st-colours [data-colour="teal"]').click(); await __wait(20);
    __clear(); __q('#st-psave').click(); await __wait(80);
    o.sentOnSave = __nonClean(__bytes()).length; o.closed = __q('#st-sheet').hidden;
    const it = App.synthDeck.presets().filter(x => x.name === 'Dorian pad')[0];
    o.item = it && { star: it.star, colour: it.snap && it.snap.colour, app: it.snap && it.snap.app, fav: it.snap && it.snap.fav, scene: it.parts && it.parts['0'] && it.parts['0'].ctl && it.parts['0'].ctl.scene, prog: it.prog && it.prog.msb + '/' + it.prog.lsb + '/' + it.prog.pc };
    const slot = __q('#st-pins [data-preset="' + (it && it.id) + '"]');
    o.slot = slot && { text: slot.textContent.replace(/\s+/g, ' ').trim(), border: slot.style.borderLeft };
    // the app moves on, then the slot brings everything back: synth bytes first, the key after the load
    App.emit('fb:set', { source: 't', root: 7, scale: 'major', mode: 0 }); await __wait(30);
    __clear(); slot.click(); await __wait(900);
    o.loadBytes = __nonClean(__bytes()); o.rootAfter = App.store.get('fb.root'); o.scaleAfter = App.store.get('fb.scale');
    o.lumi = __by.lumi.length;
    return o;
  });
  ok(pb.open && /Sweep Pad|CFX \+ FM EP/.test(pb.defaultName) && pb.incs.length === 5 && /Scene 3/.test(pb.incs[2]) && /D dorian/.test(pb.incs[3]), 'Save preset opens the builder with the sound name and what it will remember: ' + pb.incs.join(' / '));
  ok(pb.sentOnSave === 0 && pb.closed && pb.item && pb.item.star && pb.item.colour === 'teal' && pb.item.app && pb.item.app.root === 2 && pb.item.app.scale === 'dorian' && pb.item.scene === 32 && pb.item.fav && pb.item.fav.length === 4, 'Save sends nothing, pins the preset and keeps colour, key/scale, Scene and the favourite strips: ' + JSON.stringify(pb.item));
  ok(pb.slot && /Dorian pad/.test(pb.slot.text) && /Scene 3/.test(pb.slot.text) && /D dorian/.test(pb.slot.text) && /47, 184, 160|2fb8a0/i.test(pb.slot.border), 'the slot shows its data (sound, Scene, key) and its colour: ' + pb.slot.text);
  ok(pb.loadBytes.length >= 4 && /^176 0 /.test(pb.loadBytes[0]) && pb.loadBytes.some(b => /^192 /.test(b)) && pb.loadBytes.some(b => b === '176 92 32') && pb.rootAfter === 2 && pb.scaleAfter === 'dorian' && pb.lumi === 0, 'tapping the slot sends bank/program, waits, re-sends Scene 3, then restores D dorian in the app; nothing to the LUMI (' + pb.loadBytes.length + ' bytes)');

  console.log('# the key split: LUMI keys below the point play another Part');
  const sp = await page.evaluate(async () => {
    const o = {};
    App.store.set('midihub.thru', true); SLMidiHub.split.set(null); await __wait(30);
    __q('#st-save').click(); await __wait(50);
    o.boxOff = __q('#st-splitbox [data-split="off"]').classList.contains('active');
    __q('#st-splitat').value = '60'; __q('#st-splitpart').value = '2';
    __q('#st-splitbox [data-split="two"]').click(); await __wait(50);
    o.spec = SLMidiHub.split.get(); o.text = SLMidiHub.split.text(); o.rules = SLMidiHub.split.rules().map(r => r.name + ' [' + r.m.port + ']');
    __q('#st-sheetclose').click(); await __wait(30);
    o.chip = (__q('#panel-deck [data-chip="split"]') || {}).textContent; o.chipOn = __q('#panel-deck [data-chip="split"]').classList.contains('active');
    __clear();
    __fromLumi([0x90, 48, 100]); __fromLumi([0x80, 48, 0]); __fromLumi([0x90, 72, 100]); __fromLumi([0x80, 72, 0]); __fromLumi([0xB0, 64, 127]); __fromLumi([0xB0, 64, 0]);
    __fromModx([0x90, 48, 100]); __fromModx([0x80, 48, 0]);
    await __wait(60);
    o.out = __nonClean(__bytes()); o.lumi = __by.lumi.length;
    // the chip toggles the split off: everything stays as played
    __q('#panel-deck [data-chip="split"]').click(); await __wait(40);
    o.offSpec = SLMidiHub.split.get(); o.chipOff = !__q('#panel-deck [data-chip="split"]').classList.contains('active');
    __clear(); __fromLumi([0x90, 48, 100]); __fromLumi([0x80, 48, 0]); await __wait(40); o.outOff = __nonClean(__bytes());
    __q('#panel-deck [data-chip="split"]').click(); await __wait(40); o.backOn = SLMidiHub.split.get() && SLMidiHub.split.get().on !== false;
    // a preset keeps the split; one saved with no split switches it off on load
    __q('#st-save').click(); await __wait(40); __q('#st-pname').value = 'Split bass'; __q('#st-psave').click(); await __wait(60);
    const it = App.synthDeck.presets().filter(x => x.name === 'Split bass')[0]; o.saved = it && it.snap && it.snap.split;
    SLMidiHub.split.set(null); await __wait(20);
    __q('#st-save').click(); await __wait(40); __q('#st-pname').value = 'Whole keys'; __q('#st-psave').click(); await __wait(60);
    const it2 = App.synthDeck.presets().filter(x => x.name === 'Whole keys')[0]; o.savedOff = it2 && it2.snap && it2.snap.split;
    __q('#st-pins [data-preset="' + it.id + '"]').click(); await __wait(900); o.afterLoad = SLMidiHub.split.get() && SLMidiHub.split.get().at;
    __q('#st-pins [data-preset="' + it2.id + '"]').click(); await __wait(900); o.afterLoadOff = SLMidiHub.split.get();
    // Thru never reaches a LUMI-named output
    App.store.set('midihub.outId', 'lumi'); __clear(); __fromLumi([0x90, 48, 100]); __fromLumi([0x80, 48, 0]); await __wait(40);
    o.lumiThru = __by.lumi.length; App.store.set('midihub.outId', null);
    App.store.set('midihub.thru', false);
    return o;
  });
  ok(sp.boxOff && sp.spec && sp.spec.at === 60 && sp.spec.parts[0] === 2 && sp.spec.port === 'LUMI' && sp.rules.length === 1 && /Split: C-1–B3 → Part 2 \[LUMI\]/.test(sp.rules[0]), 'the builder’s Two zones makes one split rule for the LUMI port: ' + sp.rules[0] + ' / ' + sp.text);
  ok(/Split C4/.test(sp.chip) && sp.chipOn, 'the Deck chip reads the split point and is on: ' + sp.chip);
  ok(sp.out.join('|') === '145 48 100|129 48 0|144 72 100|128 72 0|176 64 127|177 64 127|144 48 100|128 48 0' && sp.lumi === 0, 'LUMI C3 goes to channel 2 (note-off follows), C5 stays on 1, the hold pedal is copied to Part 2 (its release is pedal cleanup, filtered here), the MODX’s own C3 is untouched: ' + sp.out.join('|'));
  ok(sp.offSpec && sp.offSpec.on === false && sp.chipOff && sp.outOff.join('|') === '144 48 100|128 48 0' && sp.backOn, 'the chip switches the split off (keys play as played) and on again');
  ok(sp.saved && sp.saved.at === 60 && sp.savedOff && sp.savedOff.off === true && sp.afterLoad === 60 && sp.afterLoadOff === null, 'presets carry the split: one restores it on load, one saved without a split switches it off: ' + JSON.stringify([sp.saved, sp.savedOff]));
  ok(sp.lumiThru === 0, 'with the LUMI as Synth out, Thru forwards nothing to it');

  console.log('# Live sets: pages of 16, stepping, Go live, lock, panic');
  const lv = await page.evaluate(async () => {
    const o = {};
    window.prompt = () => 'Sunday service'; window.confirm = () => true;
    App.switchTo('liveset'); await __wait(300);
    o.emptyCard = !!__q('#st-lvnew');
    __q('#st-lvnew').click(); await __wait(50);
    o.set = SLSynthLive.active() && SLSynthLive.active().name; o.slots = __qa('#panel-liveset .st-lvslot').length;
    // edit: slot 1 = the preset "Dorian pad", slot 2 = MODX Live Set page 1 slot 2
    __q('#st-lvedit').click(); await __wait(30);
    __q('#panel-liveset [data-slot="0"]').click(); await __wait(30);
    const dp = App.synthDeck.presets().filter(x => x.name === 'Dorian pad')[0];
    __q('#st-lvpick [data-pick="preset"][data-id="' + dp.id + '"]').click(); await __wait(30);
    __q('#panel-liveset [data-slot="1"]').click(); await __wait(30);
    __q('#st-lvmpage').value = '1'; __q('#st-lvmslot').value = '2'; __q('#st-lvpick [data-pick="modx"]').click(); await __wait(30);
    __q('#st-lvpadd').click(); await __wait(30); // a second page with one slot
    __q('#panel-liveset [data-slot="0"]').click(); await __wait(30);
    __q('#st-lvpick [data-pick="preset"][data-id="' + dp.id + '"]').click(); await __wait(30);
    __q('#st-lvedit').click(); await __wait(30);
    o.pages = SLSynthLive.active().pages.length; o.names = [SLSynthLive.active().pages[0][0], SLSynthLive.active().pages[0][1], SLSynthLive.active().pages[1][0]].map(s => SLSynthLive.slotName(s));
    __q('#st-lvpprev').click(); await __wait(30);
    // tap slot 2: the MODX Live Set slot = MSB 62 / LSB 0 / PC 2
    __clear(); __q('#panel-liveset [data-slot="1"]').click(); await __wait(60);
    o.modxBytes = __nonClean(__bytes()); o.slotAfter = SLSynthLive.slot();
    // Next wraps across pages: slot 2 -> page 2 slot 1 -> page 1 slot 1
    SLSynthLive.step(1); await __wait(900); o.s1 = [SLSynthLive.pageIndex(), SLSynthLive.slot()];
    SLSynthLive.step(1); await __wait(900); o.s2 = [SLSynthLive.pageIndex(), SLSynthLive.slot()];
    SLSynthLive.step(-1); await __wait(900); o.s3 = [SLSynthLive.pageIndex(), SLSynthLive.slot()];
    // the foot switch: learn CC 86 from the MODX, then a press steps
    __q('#st-lvfs').click(); await __wait(20); __fromModx([0xB0, 86, 127]); await __wait(40);
    o.fs = App.store.get('synthtab.fsCC'); const before = [SLSynthLive.pageIndex(), SLSynthLive.slot()];
    __fromModx([0xB0, 86, 127]); await __wait(900); o.fsStep = [before, [SLSynthLive.pageIndex(), SLSynthLive.slot()]];
    __fromModx([0xB0, 86, 0]); await __wait(60); o.fsRelease = [SLSynthLive.pageIndex(), SLSynthLive.slot()];
    // Go live: the bars fold away, keep-awake is held, Lock makes slots press-and-hold, Panic clears every channel
    __q('#st-lvgo').click(); await __wait(60);
    o.live = { html: document.documentElement.classList.contains('st-live'), topbar: getComputedStyle(__q('.topbar')).display, tabs: getComputedStyle(__q('#tabbar-m')).display, now: (__q('#st-lvnowname') || {}).textContent, wake: App.wake && App.wake.held ? App.wake.held('synthlive') : 'n/a' };
    __q('#st-lvlock').click(); await __wait(20);
    __clear(); const sl = __q('#panel-liveset [data-slot="1"]'); sl.click(); await __wait(60); o.lockedTap = __nonClean(__bytes()).length;
    __pt(sl, 'pointerdown', 5); await __wait(500); __pt(sl, 'pointerup', 5); await __wait(60); o.lockedHold = __nonClean(__bytes()).length;
    __clear(); __q('#st-lvpanic').click(); await __wait(40); const pb = __bytes(); o.panic = { n: pb.length, allOff: pb.filter(b => /^(17[6-9]|18\d|19[01]) 123 0$/.test(b)).length, sus: pb.filter(b => /^(17[6-9]|18\d|19[01]) 64 0$/.test(b)).length };
    __q('#st-lvexit').click(); await __wait(40); o.exit = { html: document.documentElement.classList.contains('st-live'), topbar: getComputedStyle(__q('.topbar')).display };
    // the Deck shows the set's page
    App.switchTo('deck'); await __wait(300); o.deck = { slots: __qa('#st-pins [data-lvslot]').length, head: (__q('#st-pins .st-pinhead') || {}).textContent, lumi: __by.lumi.length };
    return o;
  });
  ok(lv.emptyCard && lv.set === 'Sunday service' && lv.slots === 16, 'a new set is 16 empty slots: ' + lv.set);
  ok(lv.pages === 2 && lv.names.join('|') === 'Dorian pad|Live Set 1-2|Dorian pad', 'Edit slots assigns a preset and a MODX Live Set slot, and adds a page: ' + lv.names.join('|'));
  ok(lv.modxBytes.join('|') === '176 0 62|176 32 0|192 1' && lv.slotAfter === 1, 'a MODX Live Set slot sends MSB 62 / LSB page / PC slot: ' + lv.modxBytes.join('|'));
  ok(lv.s1.join() === '1,0' && lv.s2.join() === '0,0' && lv.s3.join() === '1,0', 'Next / Prev step through filled slots across pages and wrap: ' + [lv.s1, lv.s2, lv.s3].join(' / '));
  ok(lv.fs === 86 && lv.fsStep[1].join() !== lv.fsStep[0].join() && lv.fsRelease.join() === lv.fsStep[1].join(), 'Learn takes the foot switch CC and a press steps once (release does nothing): ' + JSON.stringify(lv.fsStep));
  ok(lv.live.html && lv.live.topbar === 'none' && lv.live.tabs === 'none' && lv.live.now && lv.live.now !== '—', 'Go live hides the top bar and the tabs and shows the slot you are on: ' + lv.live.now);
  ok(lv.lockedTap === 0 && lv.lockedHold === 3, 'locked: a tap does nothing, a 400 ms hold loads the slot');
  ok(lv.panic.n >= 48 && lv.panic.allOff === 16 && lv.panic.sus === 16, 'Panic = all notes off + sustain off on all 16 channels: ' + JSON.stringify(lv.panic));
  ok(!lv.exit.html && lv.exit.topbar !== 'none' && lv.deck.slots === 16 && /Sunday service/.test(lv.deck.head) && lv.deck.lumi === 0, 'Exit brings the bars back; the Deck shows the set’s page; the LUMI never got a byte');

  console.log('# profiles: whole setups, switched without a send');
  const pf = await page.evaluate(async () => {
    const o = {};
    App.switchTo('liveset'); await __wait(200);
    const n0 = App.synthDeck.presets().length; o.n0 = n0;
    window.prompt = () => 'Church'; __clear();
    __q('#st-lvpnew').click(); await __wait(80);
    o.afterNew = { profiles: SLSynthLive.profiles().map(x => x.name), active: SLSynthLive.profile() && SLSynthLive.profile().name, presets: App.synthDeck.presets().length, sets: SLSynthLive.data().sets.length, sent: __nonClean(__bytes()).length };
    const first = SLSynthLive.profiles()[0];
    __q('#st-lvprofile').value = first.id; __q('#st-lvprofile').dispatchEvent(new Event('change', { bubbles: true })); await __wait(80);
    o.back = { active: SLSynthLive.profile() && SLSynthLive.profile().name, presets: App.synthDeck.presets().length, sets: SLSynthLive.data().sets.length, set: SLSynthLive.active() && SLSynthLive.active().name };
    const exp = SLSynthLive.exportProfile(); o.exported = exp && exp.soundlab === 'synthtab-profile' && exp.profile.data.deck.lib.items.length === n0;
    exp.profile.id = 'pf-imported'; exp.profile.name = 'From file';
    o.imported = SLSynthLive.importProfile(JSON.parse(JSON.stringify(exp)));
    o.afterImport = { active: SLSynthLive.profile() && SLSynthLive.profile().name, presets: App.synthDeck.presets().length, sets: SLSynthLive.data().sets.length };
    __q('#st-lvprofile').value = first.id; __q('#st-lvprofile').dispatchEvent(new Event('change', { bubbles: true })); await __wait(80);
    App.switchTo('deck'); await __wait(200);
    return o;
  });
  ok(pf.afterNew.profiles.join('|') === 'My setup|Church' && pf.afterNew.active === 'Church' && pf.afterNew.presets === 0 && pf.afterNew.sets === 0 && pf.afterNew.sent === 0, 'New makes an empty profile (the setup you had becomes "My setup"); switching sends nothing: ' + JSON.stringify(pf.afterNew));
  ok(pf.back.active === 'My setup' && pf.back.presets === pf.n0 && pf.back.sets === 1 && pf.back.set === 'Sunday service', 'switching back restores the sounds and the Live set: ' + JSON.stringify(pf.back));
  ok(pf.exported && pf.imported && pf.afterImport.active === 'From file' && pf.afterImport.presets === pf.n0 && pf.afterImport.sets === 1, 'Export is the whole profile; Import brings it back as a new profile: ' + JSON.stringify(pf.afterImport));

  console.log('# chips, Scenes, Prev / Next, Explain, Edit, Back');
  const ch = await page.evaluate(async () => {
    const o = {};
    __clear(); __q('#panel-deck [data-chip="arpMaster"]').click(); await __wait(30);
    o.arp = __bytes().slice(); o.arpOn = __q('#panel-deck [data-chip="arpMaster"]').classList.contains('active');
    __clear(); __q('#panel-deck [data-chip="scene3"]').click(); await __wait(30);
    o.scene = __bytes().slice(); o.scene3 = __q('#panel-deck [data-chip="scene3"]').classList.contains('active');
    __clear(); __q('#st-next').click(); await __wait(30); o.next = __bytes().slice(); o.nowAfter = __q('#st-nowname').textContent;
    o.caps0 = __qa('#panel-deck .st-cap').length; __q('#st-explain').click(); await __wait(30); o.caps1 = __qa('#panel-deck .st-cap').length; o.capText = (__q('#panel-deck .st-cap') || {}).textContent || '';
    __q('#st-explain').click(); await __wait(30); o.caps2 = __qa('#panel-deck .st-cap').length;
    __clear(); __q('#panel-deck [data-mode="edit"]').click(); await __wait(50);
    o.edit = { mode: SLSynthTab.mode(), performHidden: __q('#st-perform').hidden, controlShown: !__q('#panel-deck .mh-view[data-view="control"]').hidden, sent: __nonClean(__bytes()).length };
    __q('#panel-deck [data-mode="perform"]').click(); await __wait(30);
    o.perform = { mode: SLSynthTab.mode(), controlHidden: __q('#panel-deck .mh-view[data-view="control"]').hidden };
    __clear(); App.switchTo('midihub'); await __wait(150);
    o.leave = { active: App.active, controlBackInHub: !!__q('#panel-midihub .mh-view[data-view="control"]'), borrowed: SLSynthTab.borrowed(), lumi: __by.lumi.length };
    return o;
  });
  ok(ch.arp.join('|') === '240 67 16 127 28 7 48 71 3 1 247' && ch.arpOn, 'the Arp chip sends the arp-master SysEx through the deck and lights: ' + ch.arp.join('|'));
  ok(ch.scene.join('|') === '176 92 32' && ch.scene3, 'Scene 3 = CC 92 value 32 on the global channel');
  ok(ch.next.length === 3 && /^176 0 /.test(ch.next[0]) && /^192 /.test(ch.next[2]) && ch.nowAfter !== 'Sweep Pad', 'Next sends Bank Select + Program Change and the Now bar moves on: ' + ch.nowAfter);
  ok(ch.caps0 === 0 && ch.caps1 >= 5 && /Prev \/ Next/.test(ch.capText) && ch.caps2 === 0, 'Explain toggles the captions on and off (' + ch.caps1 + ' captions)');
  ok(ch.edit.mode === 'edit' && ch.edit.performHidden && ch.edit.controlShown && ch.edit.sent === 0, 'Edit folds the face away and shows the Hub Control view, sending nothing');
  ok(ch.perform.mode === 'perform' && ch.perform.controlHidden, 'Perform brings the face back');
  ok(ch.leave.active === 'midihub' && ch.leave.controlBackInHub && !ch.leave.borrowed && ch.leave.lumi === 0, 'leaving gives the Control view back to the Hub; the LUMI never got a byte');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# iPad: 768 x 1024, touch');
  ({ ctx, page, errs } = await newPage(browser, {}, { width: 768, height: 1024 }));
  const ip = await page.evaluate(async () => {
    App.switchTo('deck'); await __wait(400); window.scrollTo(0, 0);
    const vis = __qa('#panel-deck button, #panel-deck .st-strip').filter(b => b.offsetParent);
    const small = vis.filter(b => b.getBoundingClientRect().height < 40).map(b => (b.textContent || b.className).trim().slice(0, 14) + ':' + Math.round(b.getBoundingClientRect().height));
    const four = getComputedStyle(__q('#panel-deck .st-four')).gridTemplateColumns.split(' ').length;
    App.store.set('synthtab.live', { sets: [{ id: 'ls-ipad', name: 'iPad set', pages: [[null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]] }], active: 'ls-ipad', page: 0, slot: null });
    App.switchTo('liveset'); await __wait(300);
    const cols = getComputedStyle(__q('#st-lvgrid')).gridTemplateColumns.split(' ').length;
    return { scrollW: document.documentElement.scrollWidth, w: innerWidth, small, four, cols, tabs: __qa('#tabbar-m .tabbar-btn').length };
  });
  ok(ip.scrollW <= ip.w && ip.small.length === 0 && ip.four >= 2 && ip.cols === 4, 'iPad: no horizontal scroll, targets >= 40 px, four slot columns: ' + JSON.stringify(ip));
  ok(errs.length === 0, 'no page errors on the iPad' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();

  console.log('# phone: 375 wide, touch');
  ({ ctx, page, errs } = await newPage(browser, { 'synthtab.explain': true }, { width: 375, height: 812 }));
  const ph = await page.evaluate(async () => {
    App.switchTo('deck'); await __wait(400); window.scrollTo(0, 0);
    const vis = __qa('#panel-deck button, #panel-deck .st-strip').filter(b => b.offsetParent);
    const small = vis.filter(b => b.getBoundingClientRect().height < 40).map(b => (b.textContent || b.className).trim().slice(0, 14) + ':' + Math.round(b.getBoundingClientRect().height));
    return { scrollW: document.documentElement.scrollWidth, w: innerWidth, small, caps: __qa('#panel-deck .st-cap').length, nowSize: parseFloat(getComputedStyle(__q('#st-nowname')).fontSize), tabs: __qa('#tabbar-m .tabbar-btn').length };
  });
  ok(ph.scrollW <= ph.w && ph.small.length === 0 && ph.nowSize >= 30 && ph.caps >= 5 && ph.tabs === 6, 'no horizontal scroll, every target ≥ 40 px, the sound name ≥ 30 px, six bottom tabs: ' + JSON.stringify(ph.small));
  ok(errs.length === 0, 'no page errors on the phone' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close(); await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
