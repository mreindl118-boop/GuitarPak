// Synth Deck (js/synthdeck.js + js/synthdeck-maps.js) on the MIDI Hub against
// a four-output fake Web MIDI (a MODX on two ports, a LUMI, Windows' wavetable)
// that records every byte per port: mount in silence, the Hub's own knobs
// unchanged, the Now bar + factory names, Buttons (toggle / momentary / radio /
// SysEx / unverified / unmapped), per-Part state, MIDI Learn, Map edits and
// reset, knob pages with two-way sync, the sound library (save / recall plan /
// load / cancel / edit / star / search / import / export / Hub reset), the LUMI
// refusal, the lifecycle drains and the phone layout. Nothing may ever reach
// the LUMI bucket.
const { chromium } = require('playwright');
const env = require('./env');
let fails = 0;
function ok(c, msg) { if (c) console.log('  PASS', msg); else { fails++; console.log('  FAIL', msg); } }
const J = JSON.stringify;
// the Hub's shared musical ledger releases the sustain pedal (CC64 0, any
// channel) whenever the Part, profile or output changes and on leaving the
// page: that cleanup is expected and is the only traffic those paths may make
const CLEAN = /^(17[6-9]|18\d|19[01]) 64 0$/;
const clean = a => a.every(b => CLEAN.test(b));
const nonClean = a => a.filter(b => !CLEAN.test(b));

async function newPage(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.addInitScript((seed) => {
    ['help.seen', 'help.done', 'qz.landed', 'midi.wanted'].forEach(k => localStorage.setItem('guitarlab.' + k, 'true'));
    localStorage.setItem('guitarlab.lights.on', 'false');
    localStorage.setItem('guitarlab.midi.outputId', JSON.stringify('lumi'));
    localStorage.setItem('guitarlab.midihub.profile', JSON.stringify('yamaha'));
    for (const k in seed) localStorage.setItem('guitarlab.' + k, JSON.stringify(seed[k]));
    window.__by = { lumi: [], gs: [], modx1: [], modx2: [] };
    // the LUMI bucket keeps CHANNEL messages only: the shared lighting engine
    // sends its own SysEx to a LUMI (native-mode hand-back when the lights are
    // off) and that is not deck traffic. Any channel message there is a failure.
    const mk = (id, name) => ({ id, name, state: 'connected', send: b => { const a = Array.from(b); if (id !== 'lumi' || a[0] < 0xF0) window.__by[id].push(a); } });
    const outs = new Map([['gs', mk('gs', 'Microsoft GS Wavetable Synth')], ['lumi', mk('lumi', 'LUMI Keys BLOCK')], ['modx2', mk('modx2', 'MODX-2')], ['modx1', mk('modx1', 'MODX-1')]]);
    const modxIn = { id: 'mi', name: 'MODX-1', state: 'connected', onmidimessage: null };
    const lumiIn = { id: 'li', name: 'LUMI Keys BLOCK', state: 'connected', onmidimessage: null };
    const access = { inputs: new Map([['mi', modxIn], ['li', lumiIn]]), outputs: outs, sysexEnabled: true, onstatechange: null };
    navigator.requestMIDIAccess = () => Promise.resolve(access);
    window.__fromModx = (bytes) => modxIn.onmidimessage({ data: new Uint8Array(bytes) });
    // helpers shared by the blocks below
    window.__bytes = (id) => window.__by[id || 'modx1'].map(b => b.join(' '));
    window.__clear = () => Object.keys(window.__by).forEach(k => { window.__by[k].length = 0; });
    window.__toast = () => { const t = document.getElementById('mh-toast'); return t && !t.hidden ? t.textContent : ''; };
    window.__wait = (ms) => new Promise(r => setTimeout(r, ms));
    window.__q = (s) => document.querySelector(s);
    window.__qa = (s) => Array.from(document.querySelectorAll(s));
    window.__pd = (el, type) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, clientX: 5, clientY: 5, button: 0 }));
    window.__fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
  }, seed || {});
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(env.URL);
  await page.waitForFunction(() => window.App && App.midi && App.midi.ready && App.midi.hasOutput && App.active === 'quiz');
  return { ctx, page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: env.CHROMIUM, args: ['--autoplay-policy=no-user-gesture-required'] });
  // the Now bar starts on a factory sound: MSB 64 / LSB 0 / program 1 = 'CFX + FM EP'
  const { ctx, page, errs } = await newPage(browser, { 'midihub.msb': 64, 'midihub.lsb': 0, 'midihub.prog': 1 });

  console.log('# mount + silence');
  const mt = await page.evaluate(async () => {
    const boot = { modx1: __by.modx1.length, modx2: __by.modx2.length, gs: __by.gs.length, lumi: __by.lumi.length };
    App.switchTo('midihub'); await __wait(150);
    const tabs = __qa('#sdk-tabs button[data-tab]');
    return {
      boot, after: { modx1: __by.modx1.length, modx2: __by.modx2.length, gs: __by.gs.length, lumi: __by.lumi.length },
      api: !!(App.synthDeck && window.SLSynthDeck === App.synthDeck), version: App.synthDeck && App.synthDeck.version,
      fns: ['init', 'stop', 'onPart', 'onBack', 'hubKnobs', 'map', 'setControl', 'resetMap', 'learn', 'presets', 'save', 'load', 'recallPlan', 'cancelLoad', 'tab', 'names',
        'scopeFeed', 'scopeFrame', 'scopeState', 'migrate', 'exportJSON', 'importJSON', 'tx', 'nowText'].filter(f => typeof (App.synthDeck || {})[f] !== 'function'),
      now: !!__q('#mh-deck > #sdk-now.card.sdk-now'), nowname: !!__q('#sdk-now #sdk-nowname.sdk-name'), nowsub: !!__q('#sdk-now #sdk-nowsub'),
      acts: ['sdk-prev', 'sdk-next', 'sdk-star', 'sdk-save'].map(id => !!__q('#' + id + '.btn.sdk-big')).join(),
      pins: !!__q('#sdk-pins.sdk-pins'), ldst: __q('#sdk-ldst') && __q('#sdk-ldst').getAttribute('role') === 'status' && __q('#sdk-ldst').getAttribute('aria-live') === 'polite',
      native: __q('#sdk-native') && __q('#sdk-native').hidden, form: __q('#sdk-save-form') && __q('#sdk-save-form').hidden,
      tabIds: tabs.map(b => b.dataset.tab).join(), tabText: tabs.map(b => b.textContent.trim()).join('|'), tabRole: __q('#sdk-tabs') && __q('#sdk-tabs').getAttribute('role'),
      tab: App.synthDeck && App.synthDeck.tab && App.synthDeck.tab(), activeTab: (__q('#sdk-tabs button.active') || {}).dataset && __q('#sdk-tabs button.active').dataset.tab,
      pressed: tabs.map(b => b.getAttribute('aria-pressed')).join(),
      cvShown: !(__q('.card.mh-cv') || {}).hidden, deck2: __qa('#mh-deck2 .sdk-tab').map(t => t.dataset.tab).sort().join(), deck2Shown: __qa('#mh-deck2 .sdk-tab').filter(t => !t.hidden).map(t => t.dataset.tab).join(),
      pages: !!__q('#sdk-pages.card #sdk-pagesel'), knobs: __qa('#sdk-knobs .mh-knob[data-ctl]').length,
      order: (() => { const d = __q('#mh-deck'), cv = __q('.card.mh-cv'), d2 = __q('#mh-deck2'); return !!(d && cv && d2 && (d.compareDocumentPosition(cv) & 4) && (cv.compareDocumentPosition(d2) & 4)); })()
    };
  });
  ok(mt.api && mt.fns.length === 0 && mt.version != null, 'App.synthDeck = window.SLSynthDeck with the whole public surface, version ' + mt.version + (mt.fns.length ? ' (missing: ' + mt.fns.join() + ')' : ''));
  ok(mt.boot.modx1 + mt.boot.modx2 + mt.boot.gs + mt.boot.lumi === 0 && mt.after.modx1 + mt.after.modx2 + mt.after.gs + mt.after.lumi === 0, 'zero bytes on boot and on showing the Hub: ' + J(mt.after));
  ok(mt.now && mt.nowname && mt.nowsub && mt.acts === 'true,true,true,true' && mt.pins && mt.ldst, 'Now bar: name, sub line, Prev/Next/star/Save (.sdk-big), pins, a polite status line');
  ok(mt.native === true && mt.form === true, 'the native banner and the save form start hidden');
  ok(mt.tabIds === 'knobs,buttons,sounds,scope,map' && /Knobs.*Buttons.*Sounds.*Scope.*Map/.test(mt.tabText) && mt.tabRole === 'group', 'five sub-tabs in order: ' + mt.tabText);
  ok(mt.tab === 'knobs' && mt.activeTab === 'knobs' && mt.pressed === 'true,false,false,false,false', 'Knobs is the default tab (.active + aria-pressed)');
  ok(mt.cvShown && mt.order && mt.deck2 === 'buttons,knobs,map,scope,sounds' && mt.deck2Shown === 'knobs', 'the Hub knob card sits between the deck boxes; five panels, only knobs shown: ' + mt.deck2Shown);
  ok(mt.pages && mt.knobs > 0, 'the knobs tab renders a page selector and ' + mt.knobs + ' page knobs');
  ok(mt.after.lumi === 0, 'nothing reached the LUMI');

  console.log('# Hub knobs unchanged');
  const hk = await page.evaluate(() => {
    const ks = SLMidiHub.api.allKnobs();
    const o = {
      ccs: ks.map(k => k.cc).join(), defs: ks.map(k => k.def).join(), names: ks.map(k => k.name).join('|'),
      hero: (__q('#mh-hero .mh-kn') || {}).textContent, main: __qa('#mh-knobs .mh-kn').map(k => k.textContent).join('|'), extra: __qa('#mh-extra .mh-knob').length,
      gen: App.synthDeck.hubKnobs('generic'), rol: App.synthDeck.hubKnobs('roland'), ya: App.synthDeck.hubKnobs('yamaha')
    };
    __clear(); __q('#mh-cvsend').click();
    o.sendAll = __by.modx1.length; o.allCc = __by.modx1.every(b => b[0] === 0xB0);
    o.lumi = __by.lumi.length; __clear();
    return o;
  });
  ok(hk.ccs === '95,74,71,73,72,91,93,7,10,17,18,19,20,21,22,23,24' && hk.defs === '0,64,64,64,64,40,0,100,64,64,64,64,64,64,64,64,64', 'the Yamaha map yields exactly the built-in knob set: ' + hk.ccs + ' / ' + hk.defs);
  ok(hk.hero === 'Super Knob' && hk.main === 'Cutoff|Resonance|Attack|Release|Reverb|Chorus|Volume|Pan' && hk.extra === 8, 'Super Knob, 8 sound knobs, 8 Assign knobs on the Hub card');
  ok(hk.gen === null && hk.rol === null && hk.ya && hk.ya.hero && hk.ya.hero.cc === 95 && hk.ya.main.length === 8 && hk.ya.extra.length === 8, 'hubKnobs: null for generic/roland (built-ins), the Yamaha map for yamaha');
  ok(hk.sendAll === 17 && hk.allCc, 'Send all still sends 17 CCs: ' + hk.sendAll);
  ok(hk.lumi === 0, 'nothing reached the LUMI');

  console.log('# Now bar + factory names');
  await page.waitForFunction(() => (document.getElementById('sdk-nowname') || {}).textContent.trim() === 'CFX + FM EP', null, { timeout: 8000 }).catch(() => {});
  const nb = await page.evaluate(async () => {
    const o = { name: __q('#sdk-nowname').textContent.trim(), sub: __q('#sdk-nowsub').textContent, bad: __q('#sdk-nowsub').classList.contains('bad'), nt: App.synthDeck.nowText(), namesFn: typeof App.synthDeck.names() };
    __clear(); __q('#mh-cvnext').click(); await __wait(50);
    o.next = __bytes(); o.name2 = __q('#sdk-nowname').textContent.trim(); o.pnum = __q('#mh-cvpnum').textContent;
    __clear(); __fromModx([0xC0, 2]); await __wait(50);
    o.name3 = __q('#sdk-nowname').textContent.trim(); o.twoWaySent = __by.modx1.length;
    __q('#sdk-prev').click(); await __wait(50); o.prev = __bytes(); o.name4 = __q('#sdk-nowname').textContent.trim();
    __clear();
    // a sound nobody named: numeric fallback
    __fromModx([0xB0, 32, 36]); __fromModx([0xC0, 99]); await __wait(50);
    o.unnamed = __q('#sdk-nowname').textContent.trim(); o.unsub = __q('#sdk-nowsub').textContent;
    o.lumi = __by.lumi.length; __clear();
    return o;
  });
  ok(nb.name === 'CFX + FM EP' && nb.nt && nb.nt.name === 'CFX + FM EP' && nb.namesFn === 'function', 'factory name for 64/0/1 once data/modx-performances.json is in: ' + nb.name);
  ok(/Part 1 · Bank 64\/0 · Program 1 → MODX-1/.test(nb.sub) && !nb.bad && nb.nt.sub === nb.sub, 'sub line names Part, bank, program and the synth output: ' + nb.sub);
  ok(nb.next.join('|') === '176 0 64|176 32 0|192 1' && nb.name2 === 'CFX + FM EP 2' && nb.pnum === '2', 'the Hub’s Next moves the Now bar: ' + nb.name2);
  ok(nb.name3 === 'CFX Concert' && nb.twoWaySent === 0, 'a Program Change from the synth renames the Now bar without re-sending: ' + nb.name3);
  ok(nb.prev.join('|') === '176 0 64|176 32 0|192 1' && nb.name4 === 'CFX + FM EP 2', 'the deck’s Prev sends bank + program: ' + nb.prev.join('|'));
  ok(/^Program 100 · Bank 64\/36$/.test(nb.unnamed) && /Bank 64\/36 · Program 100/.test(nb.unsub), 'an unnamed user program falls back to its number: ' + nb.unnamed);
  ok(nb.lumi === 0, 'nothing reached the LUMI');

  console.log('# buttons');
  const bt = await page.evaluate(async () => {
    __fromModx([0xB0, 32, 0]); __fromModx([0xC0, 0]); // back to 64/0/1
    __q('#sdk-tabs [data-tab="buttons"]').click(); await __wait(50);
    const o = {
      tab: App.synthDeck.tab(), cvHidden: SLMidiHub.api.cv().hidden, shown: __qa('#mh-deck2 .sdk-tab').filter(t => !t.hidden).map(t => t.dataset.tab).join(),
      secs: __qa('#sdk-buttons section.sdk-sec[data-sec]').map(s => s.dataset.sec).join(), tips: !!__q('#sdk-buttons details.tips#sdk-btips'),
      addctl: !!__q('#sdk-addctl'), tipLines: __qa('#sdk-btips li, #sdk-btips p').filter(e => /Check on the synth:/.test(e.textContent)).length
    };
    const sus = __q('.sdk-btn[data-ctl="sus"]');
    o.susUi = sus && sus.dataset.ui; o.susPressed0 = sus && sus.getAttribute('aria-pressed');
    __clear(); sus.click(); await __wait(10);
    o.susOn = __bytes(); o.susPressed1 = sus.getAttribute('aria-pressed'); o.susActive = sus.classList.contains('active');
    __clear(); sus.click(); await __wait(10);
    o.susOff = __bytes(); o.susPressed2 = sus.getAttribute('aria-pressed');
    __clear(); sus.click(); await __wait(10); o.susOn2 = __bytes(); // leave it on for the Part test
    __clear(); __q('.sdk-btn[data-ctl="asw1"]').click(); await __wait(10); o.asw1 = __bytes();
    // momentary
    const mh = __q('.sdk-btn[data-ctl="msHold"]'); o.mhUi = mh && mh.dataset.ui;
    __clear(); __pd(mh, 'pointerdown'); await __wait(10);
    o.mhDown = __bytes(); o.held = App.synthDeck.held.slice(); o.mhPressed = mh.getAttribute('aria-pressed');
    __clear(); __pd(mh, 'pointerup'); await __wait(10);
    o.mhUp = __bytes(); o.held2 = App.synthDeck.held.slice(); o.mhPressed2 = mh.getAttribute('aria-pressed');
    // radio: scenes
    const grp = __q('#sdk-buttons [role="radiogroup"][data-group="scene"]');
    const members = grp ? Array.from(grp.querySelectorAll('[role="radio"]')) : [];
    o.scenes = members.length; o.sceneUi = members.length && members[2].dataset.ui;
    __clear(); if (members[2]) members[2].click(); await __wait(10);
    o.scene3 = __bytes(); o.checked = members.map(m => m.getAttribute('aria-checked')).join();
    __clear(); if (members[2]) members[2].click(); await __wait(10); o.scene3again = __bytes();
    // SysEx toggle
    const mute = __q('.sdk-btn[data-ctl="mute"]');
    __clear(); mute.click(); await __wait(10); o.muteOn = __bytes(); o.mutePressed = mute.getAttribute('aria-pressed');
    __clear(); mute.click(); await __wait(10); o.muteOff = __bytes();
    // unverified
    const arp = __q('.sdk-btn[data-ctl="arpPart"]');
    __clear(); arp.click(); await __wait(10); o.arp = __bytes(); o.arpToast = __toast(); o.arpPressed = arp.getAttribute('aria-pressed');
    // unmapped
    const fs = __q('.sdk-btn[data-ctl="fs"]');
    o.fsUnsure = fs && fs.classList.contains('unsure'); o.fsBadge = fs && (fs.querySelector('span.sdk-badge') || {}).textContent; o.fsDisabled = fs && fs.disabled;
    __clear(); if (fs) fs.click(); await __wait(10); o.fsSent = __by.modx1.length + __by.modx2.length + __by.gs.length; o.fsToast = __toast(); o.fsTab = App.synthDeck.tab();
    App.synthDeck.tab('buttons'); await __wait(20);
    // triggers
    const ao = __q('.sdk-btn[data-ctl="allOff"]'); o.aoUi = ao && ao.dataset.ui;
    __clear(); if (ao) ao.click(); await __wait(10); o.allOff = __bytes();
    o.lumi = __by.lumi.length; __clear();
    return o;
  });
  ok(bt.tab === 'buttons' && bt.cvHidden === true && bt.shown === 'buttons', 'Buttons tab: the Hub knob card hides, only the buttons panel shows');
  ok(/scenes/.test(bt.secs) && /arp/.test(bt.secs) && /motion/.test(bt.secs) && /part/.test(bt.secs) && /switches/.test(bt.secs) && /triggers/.test(bt.secs) && bt.addctl, 'Yamaha sections: ' + bt.secs);
  ok(bt.tips && bt.tipLines >= 4, 'tips list the synth-side checks (' + bt.tipLines + ' lines)');
  ok(bt.susUi === 'toggle' && bt.susPressed0 === 'false' && bt.susOn.join('|') === '176 64 127' && bt.susPressed1 === 'true' && bt.susActive, 'sustain toggle on: ' + bt.susOn.join('|'));
  ok(bt.susOff.join('|') === '176 64 0' && bt.susPressed2 === 'false' && bt.susOn2.join('|') === '176 64 127', 'sustain toggle off, then on again: ' + bt.susOff.join('|'));
  ok(bt.asw1.join('|') === '176 86 127', 'Assign switch 1 = CC 86: ' + bt.asw1.join('|'));
  ok(bt.mhUi === 'momentary' && bt.mhDown.join('|') === '176 88 127' && bt.held.join() === 'msHold' && bt.mhPressed === 'true', 'Motion seq hold: pointerdown sends on and is held: ' + bt.mhDown.join('|'));
  ok(bt.mhUp.join('|') === '176 88 0' && bt.held2.length === 0 && bt.mhPressed2 === 'false', 'pointerup sends off and releases it: ' + bt.mhUp.join('|'));
  ok(bt.scenes === 8 && bt.sceneUi === 'radio' && bt.scene3.join('|') === '176 92 32' && bt.checked === 'false,false,true,false,false,false,false,false', 'Scene 3 = CC 92 value 32 on the global channel 1, aria-checked follows: ' + bt.scene3.join('|'));
  ok(bt.scene3again.join('|') === '176 92 32', 'tapping the current scene re-sends it');
  ok(bt.muteOn.join('|') === '240 67 16 127 28 7 49 0 24 1 247' && bt.mutePressed === 'true' && bt.muteOff.join('|') === '240 67 16 127 28 7 49 0 24 0 247', 'Mute this Part = Yamaha parameter change 31 0p 18 with p = Part 1: ' + bt.muteOn.join('|'));
  ok(bt.arp.join('|') === '240 67 16 127 28 7 49 96 0 1 247' && /unverified/i.test(bt.arpToast) && bt.arpPressed === 'true', 'an unverified address still sends (31 6p 00) and says so once: ' + bt.arpToast);
  ok(bt.fsUnsure && bt.fsBadge === '?' && !bt.fsDisabled && bt.fsSent === 0 && (/No number yet/.test(bt.fsToast) || bt.fsTab === 'map'), 'Foot switch has no number: .unsure, a ? badge, enabled, never sends; tap toasts or opens Map: ' + (bt.fsToast || bt.fsTab));
  ok(bt.aoUi === 'trigger' && bt.allOff.join('|') === '176 123 0', 'All notes off trigger: ' + bt.allOff.join('|'));
  ok(bt.lumi === 0, 'nothing reached the LUMI');

  console.log('# Part 3 state isolation');
  const p3 = await page.evaluate(async () => {
    const o = {};
    // a held momentary is released when the Part changes
    __pd(__q('.sdk-btn[data-ctl="msHold"]'), 'pointerdown'); await __wait(10);
    __clear(); __q('#mh-parts [data-part="2"]').click(); await __wait(50);
    o.onSwitch = __bytes(); o.held = App.synthDeck.held.slice(); o.ch = SLMidiHub.api.ch();
    o.sub = __q('#sdk-nowsub').textContent;
    const sus = __q('.sdk-btn[data-ctl="sus"]');
    o.susP3 = sus.getAttribute('aria-pressed');
    __clear(); sus.click(); await __wait(10); o.susP3on = __bytes(); o.susP3pressed = sus.getAttribute('aria-pressed');
    const members = __qa('#sdk-buttons [data-group="scene"] [role="radio"]');
    __clear(); members[1].click(); await __wait(10); o.scene2 = __bytes();
    __clear(); __q('.sdk-btn[data-ctl="mute"]').click(); await __wait(10); o.muteP3 = __bytes();
    __clear(); __q('#mh-parts [data-part="0"]').click(); await __wait(50);
    o.backSent = __bytes();
    o.susP1 = __q('.sdk-btn[data-ctl="sus"]').getAttribute('aria-pressed');
    __clear(); __q('.sdk-btn[data-ctl="sus"]').click(); await __wait(10); o.susP1off = __bytes();
    o.muteP1 = __q('.sdk-btn[data-ctl="mute"]').getAttribute('aria-pressed');
    o.lumi = __by.lumi.length; __clear();
    return o;
  });
  ok(nonClean(p3.onSwitch).join('|') === '176 88 0' && p3.held.length === 0 && p3.ch === 2, 'switching to Part 3 releases the held momentary (plus the ledger’s sustain release) and nothing else: ' + p3.onSwitch.join('|'));
  ok(/Part 3/.test(p3.sub) && p3.susP3 === 'false' && p3.susP3on.join('|') === '178 64 127' && p3.susP3pressed === 'true', 'Part 3 has its own switch state and sends on channel 3: ' + p3.susP3on.join('|'));
  ok(p3.scene2.join('|') === '176 92 16', 'scenes stay on the global channel from Part 3: ' + p3.scene2.join('|'));
  ok(p3.muteP3.join('|') === '240 67 16 127 28 7 49 2 24 1 247', 'the Part nibble follows: mute on Part 3 = 31 02 18: ' + p3.muteP3.join('|'));
  ok(clean(p3.backSent) && p3.susP1 === 'false' && p3.susP1off.join('|') === '176 64 127', 'back on Part 1: the ledger released the pedals on the switch, the sustain button shows it, and a tap turns it on again: ' + p3.backSent.join('|') + ' / ' + p3.susP1off.join('|'));
  ok(p3.muteP1 === 'false', 'Part 3’s mute did not touch Part 1’s mute state');
  ok(p3.lumi === 0, 'nothing reached the LUMI');

  console.log('# MIDI Learn');
  const lr = await page.evaluate(async () => {
    const o = {};
    App.synthDeck.tab('map'); await __wait(50);
    o.tab = App.synthDeck.tab(); o.dev = (__q('#sdk-mapdev') || {}).textContent;
    o.rows = __qa('#sdk-mtable tbody tr[data-ctl]').length;
    const row = __q('#sdk-mtable tr[data-ctl="asw2"]');
    o.conf0 = row && row.querySelector('.sdk-conf').dataset.conf;
    const btn = row.querySelector('[data-learn="asw2"]');
    __clear(); btn.click(); await __wait(10);
    o.listening = btn.textContent + ' ' + __toast() + ' ' + (row.textContent);
    __fromModx([0xB0, 87, 127]); await __wait(20);
    const c = App.synthDeck.map('yamaha');
    const asw2 = (c.ctl && c.ctl.asw2) || (c.controls && c.controls.filter(x => x.id === 'asw2')[0]) || (Array.isArray(c) && c.filter(x => x.id === 'asw2')[0]);
    o.asw2 = asw2 && { num: asw2.num, conf: asw2.conf }; o.learnToast = __toast(); o.learnSent = __by.modx1.length;
    const row2 = __q('#sdk-mtable tr[data-ctl="asw2"]');
    o.rowNum = row2 && row2.querySelector('input[name="num"]').value; o.rowConf = row2 && row2.querySelector('.sdk-conf').dataset.conf;
    // Esc disarms
    const b1 = __q('#sdk-mtable [data-learn="asw1"]'); b1.click(); await __wait(10);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); await __wait(10);
    __fromModx([0xB0, 90, 127]); await __wait(20);
    const r1 = __q('#sdk-mtable tr[data-ctl="asw1"]');
    o.asw1Num = r1.querySelector('input[name="num"]').value; o.asw1Conf = r1.querySelector('.sdk-conf').dataset.conf;
    // Learn 2 moves on a SysEx control: address + the differing data byte
    const rm = __q('#sdk-mtable tr[data-ctl="mute"]');
    o.muteInputs = ['addr', 'on', 'off'].map(n => !!rm.querySelector('input[name="' + n + '"]')).join();
    rm.querySelector('[data-learn2="mute"]').click(); await __wait(10);
    __fromModx([0xF0, 0x43, 0x10, 0x7F, 0x1C, 0x07, 0x31, 0x01, 0x18, 0x7F, 0xF7]); await __wait(10);
    __fromModx([0xF0, 0x43, 0x10, 0x7F, 0x1C, 0x07, 0x31, 0x01, 0x18, 0x00, 0xF7]); await __wait(20);
    const rm2 = __q('#sdk-mtable tr[data-ctl="mute"]');
    o.muteAddr = SLMidiHub.hex(SLMidiHub.parseHex(rm2.querySelector('input[name="addr"]').value));
    o.muteOn = SLMidiHub.parseHex(rm2.querySelector('input[name="on"]').value).join(); o.muteOff = SLMidiHub.parseHex(rm2.querySelector('input[name="off"]').value).join();
    o.muteConf = rm2.querySelector('.sdk-conf').dataset.conf; o.learn2Sent = __by.modx1.length;
    App.synthDeck.tab('buttons'); await __wait(30);
    __clear(); __q('.sdk-btn[data-ctl="mute"]').click(); await __wait(10); o.muteLearned = __bytes();
    App.synthDeck.tab('map'); await __wait(30);
    __q('#sdk-mtable [data-mreset="mute"]').click(); await __wait(20);
    const rm3 = __q('#sdk-mtable tr[data-ctl="mute"]');
    o.muteAddrReset = rm3.querySelector('input[name="addr"]').value.replace(/\s+/g, ' ').trim().toUpperCase();
    App.synthDeck.tab('buttons'); await __wait(30);
    __clear(); __q('.sdk-btn[data-ctl="mute"]').click(); await __wait(10); o.muteReset = __bytes();
    o.lumi = __by.lumi.length; __clear();
    return o;
  });
  ok(lr.tab === 'map' && /Yamaha/.test(lr.dev) && lr.rows >= 20, 'Map tab lists the Yamaha controls (' + lr.rows + ' rows): ' + lr.dev);
  ok(/Listening/.test(lr.listening), 'Learn arms the row: ' + lr.listening.replace(/\s+/g, ' ').slice(0, 120));
  ok(lr.asw2 && lr.asw2.num === 87 && lr.asw2.conf === 'learned' && lr.rowNum === '87' && lr.rowConf === 'learned' && lr.learnSent === 0 && /Learned: CC 87/.test(lr.learnToast), 'the next CC fills asw2 (num 87, learned) without sending: ' + lr.learnToast);
  ok(lr.asw1Num === '86' && lr.asw1Conf !== 'learned', 'Esc disarms Learn: asw1 keeps CC 86');
  ok(lr.muteInputs === 'true,true,true' && lr.muteAddr === '31 01 18' && lr.muteOn === '127' && lr.muteOff === '0' && lr.muteConf === 'learned' && lr.learn2Sent === 0, 'Learn 2 moves: two frames give the address 31 01 18 and on 7F / off 00: ' + lr.muteAddr);
  ok(lr.muteLearned.join('|') === '240 67 16 127 28 7 49 1 24 127 247', 'the learned mute sends the learned bytes: ' + lr.muteLearned.join('|'));
  ok(/^31 0P 18$/i.test(lr.muteAddrReset) && /^240 67 16 127 28 7 49 0 24 \d+ 247$/.test(lr.muteReset.join('|')), 'Default restores the 31 0p 18 placeholder: ' + lr.muteAddrReset + ' / ' + lr.muteReset.join('|'));
  ok(lr.lumi === 0, 'nothing reached the LUMI');

  console.log('# Map edit: hero to CC 20, round trip, reset');
  const me = await page.evaluate(async () => {
    const o = {};
    App.synthDeck.tab('map'); await __wait(30);
    const hero = __q('#sdk-mtable tr[data-ctl="hero"]');
    o.heroRow = !!hero; o.heroNum0 = hero && hero.querySelector('input[name="num"]').value;
    const inp = hero.querySelector('input[name="num"]'); inp.value = '20'; __fire(inp, 'input'); __fire(inp, 'change'); await __wait(30);
    const hk = App.synthDeck.hubKnobs('yamaha'); o.heroCc = hk && hk.hero && hk.hero.cc; o.heroName = hk && hk.hero && hk.hero.name;
    SLMidiHub.api.renderControl(); await __wait(30);
    o.knob20 = !!__q('#mh-hero .mh-knob[data-cc="20"]'); o.knob95 = !!__q('#mh-hero .mh-knob[data-cc="95"]');
    o.label = (__q('#mh-hero .mh-knob[data-cc="20"] .mh-kn') || {}).textContent;
    __fromModx([0xB0, 20, 77]); await __wait(10);
    o.two = SLMidiHub.knob(20); o.twoLabel = (__q('#mh-hero .mh-knob[data-cc="20"] .mh-kv') || {}).textContent;
    const k = __q('#mh-hero .mh-knob[data-cc="20"]'); k.focus();
    __clear(); k.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); await __wait(10); o.up = __bytes();
    // setControl patches a number the same way
    App.synthDeck.setControl('asw1', { num: 90 }); await __wait(10);
    App.synthDeck.tab('buttons'); await __wait(30);
    __clear(); __q('.sdk-btn[data-ctl="asw1"]').click(); await __wait(10); o.asw1 = __bytes();
    App.synthDeck.tab('map'); await __wait(30);
    App.synthDeck.resetMap(); await __wait(30);
    const hk2 = App.synthDeck.hubKnobs('yamaha'); o.heroBack = hk2 && hk2.hero && hk2.hero.cc;
    SLMidiHub.api.renderControl(); await __wait(30);
    o.knob95back = !!__q('#mh-hero .mh-knob[data-cc="95"]');
    __clear(); __q('#mh-cvsend').click(); o.sendAll = __by.modx1.length; o.sendAllCcs = __by.modx1.map(b => b[1]).sort((a, b) => a - b).join();
    const r2 = __q('#sdk-mtable tr[data-ctl="asw2"]'); o.asw2Conf = r2 && r2.querySelector('.sdk-conf').dataset.conf;
    o.asw1Num = (__q('#sdk-mtable tr[data-ctl="asw1"] input[name="num"]') || {}).value;
    const stored = App.store.get('midihub.deck', null); o.mapsGone = !stored || !stored.maps || !stored.maps.yamaha;
    o.lumi = __by.lumi.length; __clear();
    return o;
  });
  ok(me.heroRow && me.heroNum0 === '95' && me.heroCc === 20 && me.heroName === 'Super Knob', 'editing the hero row to 20 changes the Hub knob definition: ' + J({ cc: me.heroCc, name: me.heroName }));
  ok(me.knob20 && !me.knob95 && me.label === 'Super Knob', 'renderControl rebuilds the Hub card with a Super Knob on CC 20');
  ok(me.two === 77 && me.twoLabel === '77' && me.up.join('|') === '176 20 78', 'two-way and the arrow key now ride CC 20: ' + me.up.join('|'));
  ok(/^176 90 (127|0)$/.test(me.asw1.join('|')), 'setControl(asw1, {num: 90}) → the button sends CC 90: ' + me.asw1.join('|'));
  ok(me.heroBack === 95 && me.knob95back && me.sendAll === 17 && me.sendAllCcs === '7,10,17,18,19,20,21,22,23,24,71,72,73,74,91,93,95', 'resetMap restores CC 95 and the 17-message Send all');
  ok(me.asw2Conf !== 'learned' && me.asw1Num === '86' && me.mapsGone, 'resetMap drops every override (learned asw2, patched asw1) and the stored map');
  ok(me.lumi === 0, 'nothing reached the LUMI');

  console.log('# knob pages');
  const pg = await page.evaluate(async () => {
    const o = {};
    App.synthDeck.tab('knobs'); await __wait(30);
    o.cvShown = !SLMidiHub.api.cv().hidden;
    const sel = __qa('#sdk-pagesel button[data-page]'); o.pages = sel.map(b => b.textContent.trim()).join('|');
    const exp = sel.filter(b => /Expression/.test(b.textContent))[0]; if (exp) exp.click(); await __wait(30);
    const ks = __qa('#sdk-knobs .mh-knob[data-ctl]');
    o.knobs = ks.map(k => k.dataset.ctl + ':' + k.dataset.cc + ':' + k.dataset.kind).join();
    o.markup = ks.every(k => k.getAttribute('role') === 'slider' && k.querySelector('svg') && k.querySelector('b.mh-kv') && k.querySelector('span.mh-kn') && k.querySelector('small'));
    const dk = __q('#sdk-knobs .mh-knob[data-ctl="decay"]'); o.decayCc = dk && dk.dataset.cc; o.decayVal = dk && dk.querySelector('.mh-kv').textContent;
    dk.focus(); __clear(); dk.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); await __wait(10);
    o.up = __bytes(); o.upLabel = dk.querySelector('.mh-kv').textContent; o.kv = SLMidiHub.api.kv(75);
    __clear(); __fromModx([0xB0, 75, 30]); await __wait(10);
    o.two = { label: dk.querySelector('.mh-kv').textContent, kv: SLMidiHub.api.kv(75), sent: __by.modx1.length };
    __fromModx([0xB2, 75, 99]); await __wait(10);
    o.otherPart = { label: dk.querySelector('.mh-kv').textContent, kv: SLMidiHub.api.kv(75) };
    dk.blur(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    __clear(); dk.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })); await __wait(10);
    o.wheelUnfocused = __by.modx1.length;
    dk.focus(); __clear(); dk.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })); await __wait(10);
    o.wheelFocused = __bytes();
    dk.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await __wait(10); o.dbl = SLMidiHub.api.kv(75);
    __clear(); __q('#sdk-pagesend').click(); await __wait(50);
    o.pageSend = __bytes();
    // the SysEx knobs on the Master page
    const master = __qa('#sdk-pagesel button[data-page]').filter(b => /Master/.test(b.textContent))[0]; if (master) master.click(); await __wait(30);
    const sk = __q('#sdk-knobs .mh-knob[data-ctl="superSx"]');
    o.sx = sk && { kind: sk.dataset.kind, small: sk.querySelector('small').textContent, val: sk.querySelector('.mh-kv').textContent };
    const tg = __q('#sdk-knobs .mh-knob[data-ctl="tgVol"]'); o.tgVal = tg && tg.querySelector('.mh-kv').textContent;
    sk.focus(); __clear(); sk.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); await __wait(10);
    o.sxUp = __bytes(); o.sxLabel = sk.querySelector('.mh-kv').textContent;
    o.slot = !!__q('#sdk-knobs .sdk-slot[data-slot]') || __qa('#sdk-knobs .mh-knob').length >= 8;
    o.btns = ['sdk-pagesend', 'sdk-addpage', 'sdk-pageedit'].map(id => !!__q('#' + id)).join();
    o.lumi = __by.lumi.length; __clear();
    return o;
  });
  ok(pg.cvShown && /Expression/.test(pg.pages) && /Master/.test(pg.pages), 'pages: ' + pg.pages);
  ok(pg.knobs === 'mod:1:cc,breath:2:cc,foot:4:cc,portaTime:5:cc,expr:11:cc,decay:75:cc,ribbon:16:cc' && pg.markup, 'the Expression page holds the seven CC knobs in the Hub’s knob markup: ' + pg.knobs);
  ok(pg.decayCc === '75' && pg.decayVal === '64' && pg.up.join('|') === '176 75 65' && pg.upLabel === '65' && pg.kv === 65, 'ArrowUp on Decay sends CC 75 = 65 and stores it in the Hub kv: ' + pg.up.join('|'));
  ok(pg.two.label === '30' && pg.two.kv === 30 && pg.two.sent === 0, 'two-way: the synth’s CC 75 moves a page knob the Hub does not own, never re-sent: ' + J(pg.two));
  ok(pg.otherPart.label === '30' && pg.otherPart.kv === 30, 'a CC on another Part is ignored');
  ok(pg.wheelUnfocused === 0 && pg.wheelFocused.join('|') === '176 75 34', 'the wheel turns only a focused knob: ' + pg.wheelFocused.join('|'));
  ok(pg.dbl === 64, 'double-tap resets to the control default');
  ok(pg.pageSend.length === 7 && pg.pageSend.every(b => /^176 /.test(b)) && pg.pageSend.includes('176 75 64'), 'Send page sends the seven knobs on Part 1: ' + pg.pageSend.join('|'));
  ok(pg.sx && pg.sx.kind === 'sx' && /SysEx/.test(pg.sx.small) && pg.sx.val === '0' && pg.tgVal === '127', 'Master page: SysEx knobs show "SysEx", Super Knob 0, Master volume 127');
  ok(pg.sxUp.join('|') === '240 67 16 127 28 7 48 75 0 1 247' && pg.sxLabel === '1', 'a SysEx knob builds 30 4B 00 with the value: ' + pg.sxUp.join('|'));
  ok(pg.btns === 'true,true,true', 'Send page / + Page / Edit in Map buttons');
  ok(pg.lumi === 0, 'nothing reached the LUMI');
  await page.waitForFunction(() => { const d = App.store.get('midihub.deckvals', null); return !!(d && d.ctl && d.ctl['0'] && d.ctl['0'].superSx != null); }, null, { timeout: 3000 }).catch(() => {});
  const dv = await page.evaluate(() => { const d = App.store.get('midihub.deckvals', null); return d && d.ctl && d.ctl['0'] && d.ctl['0'].superSx; });
  ok(dv === 1 || (dv && dv.val === 1) || (dv && dv.v === 1), 'the SysEx knob value persists in deckvals for Part 1: ' + J(dv));

  console.log('# sounds: save, plan, load');
  const sv = await page.evaluate(async () => {
    const o = {};
    SLMidiHub.api.sendProgram(12, 63, 0); SLMidiHub.api.turn(74, 20); await __wait(50);
    o.factory = __q('#sdk-nowname').textContent.trim();
    __clear();
    const p = App.synthDeck.save({ name: 'Warm Pad', tags: ['pad'], scope: 'part', incProg: true, incKnobs: true, incBtns: true });
    await __wait(50);
    const items = App.synthDeck.presets();
    o.saveSent = __by.modx1.length + __by.modx2.length + __by.gs.length;
    o.n = items.length; const wp = items.filter(i => i.name === 'Warm Pad')[0]; o.wp = wp && { prog: wp.prog, cc74: wp.parts && wp.parts['0'] && wp.parts['0'].cc && wp.parts['0'].cc['74'], tags: wp.tags, id: wp.id, hasPart0: !!(wp.parts && wp.parts['0']) };
    o.ret = p && (p.id || p.ok || p === true) ? 'ok' : typeof p;
    o.tabAfter = App.synthDeck.tab(); o.nowname = __q('#sdk-nowname').textContent.trim();
    o.tile = !!__q('#sdk-tiles .sdk-tile[data-preset="' + (wp && wp.id) + '"]');
    const tile = __q('#sdk-tiles .sdk-tile[data-preset="' + (wp && wp.id) + '"]');
    o.tsub = tile && (tile.querySelector('.sdk-tsub') || {}).textContent; o.tname = tile && (tile.querySelector('b.sdk-tname') || {}).textContent;
    o.empty = __q('#sdk-empty') && !__q('#sdk-empty').hidden && __q('#sdk-empty').offsetParent !== null;
    // the plan
    const plan = App.synthDeck.recallPlan(wp.id);
    o.plan0 = plan.slice(0, 3).map(s => s.bytes.join(' ')).join('|'); o.at0 = plan.slice(0, 3).map(s => s.at).join();
    o.at3 = plan[3] && plan[3].at; o.planLen = plan.length; o.planHas74 = plan.some(s => s.bytes.join(' ') === '176 74 20'); o.origins = plan.every(s => s.origin === 'raw' || s.origin === undefined || s.origin === null || typeof s.origin === 'string');
    o.planSent = __by.modx1.length;
    // the byte preview under the tile
    __q('#sdk-tiles .sdk-tmore[data-more="' + wp.id + '"]').click(); await __wait(20);
    tile.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true })); tile.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); await __wait(20);
    o.bytes = (__q('#sdk-bytes') || {}).textContent; o.row = !!__q('#sdk-tiles .sdk-trow[data-row="' + wp.id + '"]');
    o.rowActs = __qa('.sdk-trow[data-row="' + wp.id + '"] button[data-act]').map(b => b.dataset.act).join();
    // change the program and a knob, then load
    SLMidiHub.api.sendProgram(5); SLMidiHub.api.turn(74, 64); await __wait(50);
    __clear();
    const res = await App.synthDeck.load(wp.id);
    o.res = res; o.sent = __bytes(); o.ldst = __q('#sdk-ldst').textContent; o.pnum = __q('#mh-cvpnum').textContent; o.kv74 = SLMidiHub.knob(74);
    o.used = (App.synthDeck.presets().filter(i => i.id === wp.id)[0] || {}).used;
    o.pinActive = __qa('#sdk-pins .sdk-pin.active').length; o.tileActive = __qa('#sdk-tiles .sdk-tile.active').map(t => t.dataset.preset).join();
    o.lumi = __by.lumi.length; __clear();
    o.wpId = wp.id;
    return o;
  });
  ok(sv.factory === 'CFX Shrine', 'MSB 63 shares the factory names: 63/0/12 = ' + sv.factory);
  ok(sv.saveSent === 0 && sv.n === 1 && sv.wp && sv.wp.prog && sv.wp.prog.msb === 63 && sv.wp.prog.lsb === 0 && sv.wp.prog.pc === 12 && sv.wp.cc74 === 20 && sv.wp.hasPart0, 'save() keeps program + Part 1 values without sending: ' + J(sv.wp));
  ok(sv.tabAfter === 'sounds' && sv.nowname === 'Warm Pad' && sv.tile && sv.tname === 'Warm Pad' && /63\/0 · 12 · Part 1/.test(sv.tsub) && !sv.empty, 'the first save opens Sounds, the Now bar matches the library: ' + sv.tsub);
  ok(sv.plan0 === '176 0 63|176 32 0|192 11' && sv.at0 === '0,0,0' && sv.at3 >= 250 && sv.planHas74 && sv.planLen >= 4 && sv.planSent === 0, 'recallPlan: bank/program at 0, values after the 250 ms settle: ' + sv.plan0 + ' then ' + (sv.planLen - 3) + ' at ' + sv.at3);
  ok(/Load sends: B0 00 3F · B0 20 00 · C0 0B · then \d+ messages after 250 ms/.test(sv.bytes), 'the byte preview reads the same plan: ' + sv.bytes);
  ok(sv.row && sv.rowActs === 'load,edit,star,dup,del', 'the tile row offers Load / Edit / star / Duplicate / Delete: ' + sv.rowActs);
  ok(sv.res && sv.res.sent === sv.res.planned && sv.res.stopped === false && sv.sent.slice(0, 3).join('|') === '176 0 63|176 32 0|192 11' && sv.sent.length === sv.res.planned, 'load(): program first, then every value: ' + J(sv.res));
  ok(/Loaded Warm Pad → MODX-1/.test(sv.ldst) && sv.pnum === '12' && sv.kv74 === 20 && sv.used > 0, 'status line, the Hub’s program display and kv follow the load: ' + sv.ldst);
  ok(sv.lumi === 0, 'nothing reached the LUMI');

  console.log('# sounds: program-only, snapshot-only, cancel');
  const ps = await page.evaluate(async (wpId) => {
    const o = {};
    __clear();
    App.synthDeck.save({ name: 'Prog only', scope: 'prog', incProg: true, incKnobs: false, incBtns: false }); await __wait(30);
    const po = App.synthDeck.presets().filter(i => i.name === 'Prog only')[0];
    o.poPlan = App.synthDeck.recallPlan(po.id).map(s => s.bytes.join(' ')).join('|');
    __clear(); o.poRes = await App.synthDeck.load(po.id); o.poSent = __bytes();
    App.synthDeck.save({ name: 'Snap', scope: 'part', incProg: false, incKnobs: true, incBtns: true }); await __wait(30);
    const sn = App.synthDeck.presets().filter(i => i.name === 'Snap')[0];
    const plan = App.synthDeck.recallPlan(sn.id);
    o.snapBank = plan.some(s => (s.bytes[0] & 0xF0) === 0xC0 || ((s.bytes[0] & 0xF0) === 0xB0 && (s.bytes[1] === 0 || s.bytes[1] === 32)));
    o.snapAt0 = plan.length && plan[0].at; o.snapLen = plan.length;
    __clear(); o.snRes = await App.synthDeck.load(sn.id); o.snFirst = __bytes()[0];
    // cancel at a slow pace
    App.synthDeck.tab('sounds'); await __wait(20);
    const pace = __q('#sdk-pace'); pace.value = '20'; __fire(pace, 'input'); __fire(pace, 'change'); await __wait(20);
    __clear();
    const p1 = App.synthDeck.load(wpId);
    await __wait(330); App.synthDeck.cancelLoad();
    o.c1 = await p1; o.c1sent = __by.modx1.length; o.c1ldst = __q('#sdk-ldst').textContent;
    __clear();
    const p2 = App.synthDeck.load(wpId);
    await __wait(60); o.lstopShown = __q('#sdk-lstop') && !__q('#sdk-lstop').hidden && __q('#sdk-lstop').offsetParent !== null; o.loading = __q('#sdk-ldst').textContent;
    await __wait(270); __q('#sdk-lstop').click();
    o.c2 = await p2; o.c2ldst = __q('#sdk-ldst').textContent;
    // a new load cancels the running one
    __clear();
    const p3 = App.synthDeck.load(wpId); await __wait(20);
    const p4 = App.synthDeck.load(po.id);
    o.c3 = await p3; o.c4 = await p4;
    pace.value = '2'; __fire(pace, 'input'); __fire(pace, 'change'); await __wait(20);
    o.ids = { po: po.id, sn: sn.id };
    o.lumi = __by.lumi.length; __clear();
    return o;
  }, sv.wpId);
  ok(ps.poPlan === '176 0 63|176 32 0|192 11' && ps.poRes.sent === 3 && ps.poSent.join('|') === ps.poPlan, 'program-only = exactly the three bank/program messages: ' + ps.poSent.join('|'));
  ok(!ps.snapBank && ps.snapAt0 === 0 && ps.snapLen > 0 && ps.snRes.sent === ps.snRes.planned && /^176 /.test(ps.snFirst), 'snapshot-only sends no CC0/CC32/PC and starts at once: ' + ps.snapLen + ' messages');
  ok(ps.c1 && ps.c1.stopped === true && ps.c1.sent < ps.c1.planned && ps.c1.sent >= 3 && ps.c1sent === ps.c1.sent && /Load stopped at \d+\/\d+/.test(ps.c1ldst), 'cancelLoad() at pace 20 stops the chain: ' + J(ps.c1) + ' / ' + ps.c1ldst);
  ok(ps.lstopShown && /Loading Warm Pad/.test(ps.loading) && ps.c2.stopped === true && /Load stopped/.test(ps.c2ldst), 'the Stop button shows while loading and stops it: ' + ps.loading);
  ok(ps.c3.stopped === true && ps.c4.stopped === false && ps.c4.sent === 3, 'a new load cancels the one running');
  ok(ps.lumi === 0, 'nothing reached the LUMI');

  console.log('# sounds: form, edit, star, pins, search, delete');
  const sf = await page.evaluate(async (ids) => {
    const o = {};
    SLMidiHub.api.sendProgram(12, 63, 0); await __wait(20); __clear();
    __q('#sdk-save').click(); await __wait(20);
    const form = __q('#sdk-save-form');
    o.formShown = !form.hidden; o.progtxt = (__q('#sdk-progtxt') || {}).textContent;
    o.boxes = ['sdk-incprog', 'sdk-incknobs', 'sdk-incbtns'].map(id => __q('#' + id) && __q('#' + id).checked).join();
    o.scope = __qa('#sdk-pscope button[data-scope]').map(b => b.dataset.scope + ':' + b.getAttribute('aria-pressed')).join();
    o.pname = __q('#sdk-pname') && __q('#sdk-pname').maxLength; o.saveLabel = __q('#sdk-psave').textContent.trim();
    o.back = App.synthDeck.onBack(); o.formAfterBack = form.hidden; o.back2 = App.synthDeck.onBack();
    __q('#sdk-save').click(); await __wait(20);
    const nm = __q('#sdk-pname'); nm.value = 'Via Form'; __fire(nm, 'input');
    const tg = __q('#sdk-ptags'); tg.value = 'lead, bright'; __fire(tg, 'input');
    __q('#sdk-psave').click(); await __wait(50);
    const vf = App.synthDeck.presets().filter(i => i.name === 'Via Form')[0];
    o.viaForm = vf && { tags: vf.tags, prog: vf.prog && vf.prog.pc }; o.formHidden = form.hidden; o.formSent = __by.modx1.length;
    // edit
    const n0 = App.synthDeck.presets().length;
    App.synthDeck.tab('sounds'); await __wait(20);
    let more = __q('#sdk-tiles .sdk-tmore[data-more="' + ids.wp + '"]'); if (!__q('.sdk-trow[data-row="' + ids.wp + '"]')) { more.click(); await __wait(20); }
    __q('.sdk-trow[data-row="' + ids.wp + '"] [data-act="edit"]').click(); await __wait(20);
    o.editName = __q('#sdk-pname').value; o.editId = (__q('#sdk-pid') || {}).value; o.editLabel = __q('#sdk-psave').textContent.trim();
    const en = __q('#sdk-pname'); en.value = 'Warm Pad 2'; __fire(en, 'input'); __q('#sdk-psave').click(); await __wait(50);
    o.afterEdit = { n: App.synthDeck.presets().length, name: (App.synthDeck.presets().filter(i => i.id === ids.wp)[0] || {}).name, n0 };
    // duplicate
    if (!__q('.sdk-trow[data-row="' + ids.wp + '"]')) { __q('#sdk-tiles .sdk-tmore[data-more="' + ids.wp + '"]').click(); await __wait(20); }
    __q('.sdk-trow[data-row="' + ids.wp + '"] [data-act="dup"]').click(); await __wait(30);
    o.afterDup = App.synthDeck.presets().length;
    // the Now bar star marks whichever sound the bar names (several share 63/0/12), then unmarks it
    o.nowBefore = __q('#sdk-nowname').textContent.trim(); o.starPressed0 = __q('#sdk-star').getAttribute('aria-pressed');
    __q('#sdk-star').click(); await __wait(30);
    const byBar = App.synthDeck.presets().filter(i => i.name === o.nowBefore)[0];
    o.barStar = { star: byBar && byBar.star, pressed: __q('#sdk-star').getAttribute('aria-pressed'), pin: !!(byBar && __q('#sdk-pins .sdk-pin[data-preset="' + byBar.id + '"]')) };
    __q('#sdk-star').click(); await __wait(30);
    const byBar2 = App.synthDeck.presets().filter(i => i.name === o.nowBefore)[0];
    o.barUnstar = { star: byBar2 && byBar2.star, pressed: __q('#sdk-star').getAttribute('aria-pressed'), pin: !!(byBar2 && __q('#sdk-pins .sdk-pin[data-preset="' + byBar2.id + '"]')) };
    // the row star on Warm Pad 2
    if (!__q('.sdk-trow[data-row="' + ids.wp + '"]')) { __q('#sdk-tiles .sdk-tmore[data-more="' + ids.wp + '"]').click(); await __wait(20); }
    __q('.sdk-trow[data-row="' + ids.wp + '"] [data-act="star"]').click(); await __wait(30);
    const wp = App.synthDeck.presets().filter(i => i.id === ids.wp)[0];
    o.starred = wp && wp.star;
    o.pin = !!__q('#sdk-pins .sdk-pin[data-preset="' + ids.wp + '"]'); o.tileStar = !!__q('#sdk-tiles .sdk-tile[data-preset="' + ids.wp + '"].star');
    o.starSent = __by.modx1.length;
    // filter: starred only
    __q('#sdk-filt [data-f="star"]').click(); await __wait(20);
    o.starTiles = __qa('#sdk-tiles .sdk-tile').map(t => t.dataset.preset).join();
    __q('#sdk-filt [data-f="all"]').click(); await __wait(20);
    o.allTiles = __qa('#sdk-tiles .sdk-tile').length;
    // search
    const s = __q('#sdk-search'); s.value = 'warm'; __fire(s, 'input'); await __wait(30);
    o.search = __qa('#sdk-tiles .sdk-tile').map(t => t.querySelector('.sdk-tname').textContent);
    s.value = ''; __fire(s, 'input'); await __wait(30); o.searchCleared = __qa('#sdk-tiles .sdk-tile').length;
    // pin load
    SLMidiHub.api.sendProgram(3); await __wait(20); __clear();
    __q('#sdk-pins .sdk-pin[data-preset="' + ids.wp + '"]').click();
    o.ids = ids;
    return o;
  }, { wp: sv.wpId, po: ps.ids.po, sn: ps.ids.sn });
  await page.waitForFunction(() => /Loaded Warm Pad 2/.test(document.getElementById('sdk-ldst').textContent), null, { timeout: 5000 }).catch(() => {});
  const pl = await page.evaluate(async (ids) => {
    const o = { ldst: __q('#sdk-ldst').textContent, first: __bytes().slice(0, 3).join('|'), pnum: __q('#mh-cvpnum').textContent, pinActive: (__q('#sdk-pins .sdk-pin.active') || {}).dataset && __q('#sdk-pins .sdk-pin.active').dataset.preset };
    // Now bar name → Sounds tab
    App.synthDeck.tab('knobs'); await __wait(20); __q('#sdk-nowname').click(); await __wait(20); o.nameTap = App.synthDeck.tab();
    // delete, two-step
    __clear();
    if (!__q('.sdk-trow[data-row="' + ids.sn + '"]')) { __q('#sdk-tiles .sdk-tmore[data-more="' + ids.sn + '"]').click(); await __wait(20); }
    const del = __q('.sdk-trow[data-row="' + ids.sn + '"] [data-act="del"]'); del.click(); await __wait(20);
    o.really = (__q('.sdk-trow[data-row="' + ids.sn + '"] [data-act="del"]') || del).textContent; o.stillThere = App.synthDeck.presets().some(i => i.id === ids.sn);
    (__q('.sdk-trow[data-row="' + ids.sn + '"] [data-act="del"]') || del).click(); await __wait(30);
    o.gone = !App.synthDeck.presets().some(i => i.id === ids.sn) && !__q('#sdk-tiles .sdk-tile[data-preset="' + ids.sn + '"]');
    o.delSent = __by.modx1.length;
    o.lumi = __by.lumi.length; __clear();
    return o;
  }, sf.ids);
  ok(sf.formShown && /Bank 63\/0 · Program 12/.test(sf.progtxt) && sf.boxes === 'true,true,true' && sf.scope === 'part:true,all:false,prog:false' && sf.pname === 48 && sf.saveLabel === 'Save', 'Save sound opens the form: ' + sf.progtxt + ' / ' + sf.scope);
  ok(sf.back === true && sf.formAfterBack === true && sf.back2 === false, 'Back closes the form once, then falls through');
  ok(sf.viaForm && sf.viaForm.prog === 12 && Array.isArray(sf.viaForm.tags) && sf.viaForm.tags.join() === 'lead,bright' && sf.formHidden && sf.formSent === 0, 'the form saves name + tags without sending: ' + J(sf.viaForm));
  ok(sf.editName === 'Warm Pad' && sf.editId === sf.ids.wp && sf.editLabel === 'Update' && sf.afterEdit.n === sf.afterEdit.n0 && sf.afterEdit.name === 'Warm Pad 2', 'Edit reopens the form with the id and updates in place: ' + J(sf.afterEdit));
  ok(sf.afterDup === sf.afterEdit.n + 1, 'Duplicate adds one');
  ok(sf.starPressed0 === 'false' && sf.barStar.star === true && sf.barStar.pressed === 'true' && sf.barStar.pin && sf.barUnstar.star === false && sf.barUnstar.pressed === 'false' && !sf.barUnstar.pin, 'the Now bar star marks and unmarks the sound it names (' + sf.nowBefore + '), pin follows');
  ok(sf.starred === true && sf.pin && sf.tileStar && sf.starSent === 0, 'the row star marks Warm Pad 2, pins it and marks the tile, nothing sent');
  ok(sf.starTiles === sf.ids.wp && sf.allTiles >= 4, 'the star filter shows just the starred sound; All shows ' + sf.allTiles);
  ok(sf.search.length >= 1 && sf.search.length < sf.allTiles && sf.search.every(n => /warm/i.test(n)), 'search narrows the tiles: ' + sf.search.join('|'));
  ok(sf.searchCleared === sf.allTiles, 'clearing the search restores them');
  ok(/Loaded Warm Pad 2 → MODX-1/.test(pl.ldst) && pl.first === '176 0 63|176 32 0|192 11' && pl.pnum === '12' && pl.pinActive === sf.ids.wp, 'a pin loads its sound and becomes .active: ' + pl.ldst);
  ok(pl.nameTap === 'sounds', 'tapping the Now bar name opens Sounds');
  ok(/Really delete/.test(pl.really) && pl.stillThere && pl.gone && pl.delSent === 0, 'Delete is two-step: ' + pl.really);
  ok(pl.lumi === 0, 'nothing reached the LUMI');

  console.log('# sounds: bank browser, names, read name from synth');
  const bb = await page.evaluate(async () => {
    const o = {};
    App.synthDeck.tab('sounds'); await __wait(20);
    const wrap = __q('#sdk-bankwrap'); if (wrap && !wrap.open) wrap.open = true; await __wait(20);
    const sel = __q('#sdk-bank'); o.banks = sel ? Array.from(sel.options).map(op => op.value).join() : '';
    o.bankNames = sel ? Array.from(sel.options).map(op => op.textContent.trim()).join('|') : '';
    o.mode = __qa('#sdk-bankmode button[data-mode]').map(b => b.dataset.mode + ':' + b.getAttribute('aria-pressed')).join();
    sel.value = '63/0'; __fire(sel, 'change'); await __wait(30);
    const tiles = __qa('#sdk-bankgrid .sdk-pc[data-pc]'); o.pcs = tiles.length; o.pc0 = tiles[0] && tiles[0].textContent;
    o.active = (__q('#sdk-bankgrid .sdk-pc.active') || {}).dataset && __q('#sdk-bankgrid .sdk-pc.active').dataset.pc;
    __clear(); __q('#sdk-bankgrid .sdk-pc[data-pc="2"]').click(); await __wait(30);
    o.tap = __bytes(); o.tapActive = (__q('#sdk-bankgrid .sdk-pc.active') || {}).dataset && __q('#sdk-bankgrid .sdk-pc.active').dataset.pc; o.tapName = __q('#sdk-nowname').textContent.trim();
    // name it
    const ni = __q('#sdk-namein'); ni.value = 'My Lead'; __fire(ni, 'input'); __clear(); __q('#sdk-nameadd').click(); await __wait(30);
    o.named = __q('#sdk-nowname').textContent.trim(); o.tileNamed = __q('#sdk-bankgrid .sdk-pc[data-pc="2"]').textContent; o.nameSent = __by.modx1.length;
    __q('#sdk-namelib').click(); await __wait(30);
    const lib = App.synthDeck.presets().filter(i => i.name === 'My Lead')[0];
    o.libItem = lib && { pc: lib.prog && lib.prog.pc, msb: lib.prog && lib.prog.msb, parts: Object.keys(lib.parts || {}).length }; o.libSent = __by.modx1.length;
    // whole performance = MSB 64
    __q('#sdk-bankmode [data-mode="whole"]').click(); await __wait(30);
    __clear(); __q('#sdk-bankgrid .sdk-pc[data-pc="2"]').click(); await __wait(30); o.whole = __bytes();
    __q('#sdk-bankmode [data-mode="part"]').click(); await __wait(30);
    // read the name from the synth
    __clear(); __q('#sdk-bankgrid .sdk-pc[data-pc="5"]').click(); await __wait(30);
    o.rn = !!__q('#sdk-readname') && !__q('#sdk-readname').hidden;
    __clear(); __q('#sdk-readname').click(); await __wait(20); o.req = __bytes();
    const name = 'Test Perf'; const nb = []; for (let i = 0; i < 20; i++) nb.push(i < name.length ? name.charCodeAt(i) : 32);
    __fromModx([0xF0, 0x43, 0x00, 0x7F, 0x1C, 0x00, 0x1A, 0x07, 0x30, 0x40, 0x00].concat(nb, [0xF7])); await __wait(50);
    o.readName = __q('#sdk-nowname').textContent.trim(); o.readToast = __toast();
    o.lumi = __by.lumi.length; __clear();
    return o;
  });
  ok(/63\/0,63\/1/.test(bb.banks) && /63\/16/.test(bb.banks) && /63\/32/.test(bb.banks) && /63\/36/.test(bb.banks) && /Preset 1\|/.test(bb.bankNames) && /User 5/.test(bb.bankNames) && /Add bank/.test(bb.bankNames), 'Yamaha banks Preset 1–17 + User 1–5 (+ Add bank…): ' + bb.bankNames.slice(0, 60));
  ok(bb.mode === 'part:true,whole:false' && bb.pcs === 128 && /CFX \+ FM EP/.test(bb.pc0) && bb.active === '11', '128 program tiles with factory names, the current program active: ' + bb.pc0);
  ok(bb.tap.join('|') === '176 0 63|176 32 0|192 2' && bb.tapActive === '2' && bb.tapName === 'CFX Concert', 'tapping a tile is a program-only recall: ' + bb.tap.join('|'));
  ok(bb.named === 'My Lead' && /My Lead/.test(bb.tileNamed) && bb.nameSent === 0, 'Name it renames the tile and the Now bar: ' + bb.named);
  ok(bb.libItem && bb.libItem.pc === 3 && bb.libItem.msb === 63 && bb.libItem.parts === 0 && bb.libSent === 0, 'Add to library makes a program-only sound: ' + J(bb.libItem));
  ok(bb.whole.join('|') === '176 0 64|176 32 0|192 2', 'Whole performance = MSB 64: ' + bb.whole.join('|'));
  ok(bb.rn && bb.req.join('|') === '240 67 32 127 28 7 14 37 0 247', 'Read name from synth sends the bulk request: ' + bb.req.join('|'));
  ok(bb.readName === 'Test Perf', 'the 30 40 00 frame names the current program: ' + bb.readName + ' / ' + bb.readToast);
  ok(bb.lumi === 0, 'nothing reached the LUMI');
  await page.waitForFunction(() => { const n = App.store.get('midihub.names', null); return !!(n && n['63/0'] && n['63/0']['2'] === 'My Lead' && n['63/0']['5'] === 'Test Perf'); }, null, { timeout: 3000 }).catch(() => {});
  const nmStore = await page.evaluate(() => { const n = App.store.get('midihub.names', null); return n && n['63/0'] && [n.v, n['63/0']['2'], n['63/0']['5']].join('|'); });
  ok(nmStore === '1|My Lead|Test Perf', 'midihub.names persists both names under 63/0: ' + nmStore);

  console.log('# sounds: export / import / newer data / Hub reset + export');
  const ie = await page.evaluate(async () => {
    const o = {};
    __clear();
    const ex = App.synthDeck.exportJSON();
    o.ex = { tag: ex.soundlab, v: ex.v, items: ex.lib && ex.lib.items && ex.lib.items.length, names: !!(ex.names && ex.names['63/0']) };
    o.n0 = App.synthDeck.presets().length;
    o.junk = [App.synthDeck.importJSON(null), App.synthDeck.importJSON('junk'), App.synthDeck.importJSON({ soundlab: 'x' }), App.synthDeck.importJSON({ soundlab: 'synthdeck', v: 1, lib: 'nope' })].map(r => r && r.ok === false && typeof r.why === 'string');
    const r1 = App.synthDeck.importJSON({ soundlab: 'synthdeck', v: 1, lib: { v: 1, items: [{ id: 'p_imp1', name: 'Imported', star: false, tags: [], dev: 'yamaha', prog: { msb: 63, lsb: 0, pc: 3, ch: null }, parts: {}, created: 1, updated: 1, used: 0 }, { bad: true }] } });
    o.r1 = r1 && r1.ok; o.n1 = App.synthDeck.presets().length; o.imp = (App.synthDeck.presets().filter(i => i.id === 'p_imp1')[0] || {}).name;
    const r2 = App.synthDeck.importJSON({ soundlab: 'synthdeck', v: 1, lib: { v: 1, items: [{ id: 'p_imp1', name: 'Imported 2', prog: { msb: 63, lsb: 0, pc: 3, ch: null }, parts: {} }] } });
    o.r2 = r2 && r2.ok; o.n2 = App.synthDeck.presets().length; o.imp2 = (App.synthDeck.presets().filter(i => i.id === 'p_imp1')[0] || {}).name;
    o.impSent = __by.modx1.length;
    // the deck's own export button downloads soundlab-sounds.json
    const blobs = []; const cu = URL.createObjectURL; URL.createObjectURL = b => { blobs.push(b); return 'blob:null/x'; };
    const ck = HTMLAnchorElement.prototype.click; let dl = ''; HTMLAnchorElement.prototype.click = function () { dl = this.download; };
    App.synthDeck.tab('sounds'); await __wait(20); __q('#sdk-pexport').click(); await __wait(20);
    o.dl = dl; o.dlJson = blobs.length ? JSON.parse(await blobs[0].text()) : null;
    // the Hub's Export includes the library
    __q('#mh-export').click(); await __wait(20);
    const hub = blobs.length > 1 ? JSON.parse(await blobs[1].text()) : null;
    o.hubExport = hub && hub.decklib && hub.decklib.items && hub.decklib.items.length;
    URL.createObjectURL = cu; HTMLAnchorElement.prototype.click = ck;
    // data from a newer soundLAB is shown but never overwritten
    const libCopy = App.store.get('midihub.decklib', null);
    App.store.set('midihub.decklib', { v: 999, items: [] });
    __q('#mh-reset').click(); await __wait(100);
    o.banner = (__q('#mh-deck') || {}).textContent; o.resetSent = __bytes().concat(__bytes('modx2'), __bytes('gs'));
    App.synthDeck.save({ name: 'Blocked', scope: 'prog', incProg: true }); await __wait(400);
    o.newerKept = (App.store.get('midihub.decklib', null) || {}).v;
    App.store.set('midihub.decklib', libCopy);
    __q('#mh-reset').click(); await __wait(100);
    o.afterReset = App.synthDeck.presets().length; o.n2b = o.n2;
    o.deckCleared = App.store.get('midihub.deck', null) === null && App.store.get('midihub.deckvals', null) === null;
    o.profile = SLMidiHub.api.profileKey(); o.resetSent2 = __bytes().concat(__bytes('modx2'), __bytes('gs'));
    // back to the Yamaha map
    const pf = __q('#mh-profile'); pf.value = 'yamaha'; __fire(pf, 'change'); await __wait(100);
    o.profile2 = SLMidiHub.api.profileKey(); o.sections = __qa('#sdk-buttons section.sdk-sec').map(s => s.dataset.sec).join();
    o.lumi = __by.lumi.length; o.switchSent = __bytes(); __clear();
    return o;
  });
  ok(ie.ex.tag === 'synthdeck' && ie.ex.v === 1 && ie.ex.items === ie.n0 && ie.ex.names, 'exportJSON wraps the library and names: ' + J(ie.ex));
  ok(ie.junk.every(Boolean), 'importJSON refuses junk with {ok:false, why} and never throws');
  ok(ie.r1 === true && ie.n1 === ie.n0 + 1 && ie.imp === 'Imported' && ie.r2 === true && ie.n2 === ie.n1 && ie.imp2 === 'Imported 2' && ie.impSent === 0, 'import merges by id (new appended, same id updated, malformed dropped), nothing sent');
  ok(ie.dl === 'soundlab-sounds.json' && ie.dlJson && ie.dlJson.soundlab === 'synthdeck', 'the Export button downloads soundlab-sounds.json');
  ok(ie.hubExport === ie.n2, 'the Hub’s Export JSON carries decklib (' + ie.hubExport + ' sounds)');
  ok(/Sound data from a newer soundLAB/.test(ie.banner) && ie.newerKept === 999 && clean(ie.resetSent), 'a newer blob shows the banner and stays read-only: ' + J({ banner: /newer soundLAB/.test(ie.banner), kept: ie.newerKept, sent: ie.resetSent }));
  ok(ie.afterReset === ie.n2 && ie.deckCleared && ie.profile === 'generic' && clean(ie.resetSent2), 'Reset Hub clears deck + deckvals, keeps the library (' + ie.afterReset + '), sends nothing but the ledger cleanup: ' + J({ cleared: ie.deckCleared, profile: ie.profile, sent: ie.resetSent2 }));
  ok(ie.profile2 === 'yamaha' && /scenes/.test(ie.sections) && clean(ie.switchSent), 'switching the profile back rebuilds the Yamaha buttons in silence: ' + ie.sections + ' ' + J(ie.switchSent));
  ok(ie.lumi === 0, 'nothing reached the LUMI');

  console.log('# LUMI refusal');
  const lu = await page.evaluate(async () => {
    const o = {};
    const sel = __q('#mh-out'); sel.value = 'shared'; __fire(sel, 'change'); await __wait(50);
    o.outName = SLMidiHub.api.hubOutName(); o.sub = __q('#sdk-nowsub').textContent; o.bad = __q('#sdk-nowsub').classList.contains('bad');
    App.synthDeck.tab('buttons'); await __wait(30);
    const sus = __q('.sdk-btn[data-ctl="sus"]'); const p0 = sus.getAttribute('aria-pressed');
    __clear(); sus.click(); await __wait(20);
    o.lumi = __by.lumi.length; o.modx = __by.modx1.length; o.toast = __toast(); o.pressed = [p0, sus.getAttribute('aria-pressed')].join();
    o.tx = App.synthDeck.tx([0xB0, 64, 127]);
    const wp = App.synthDeck.presets().filter(i => i.name === 'Warm Pad 2')[0];
    __clear(); o.load = await App.synthDeck.load(wp.id); o.loadLumi = __by.lumi.length; o.ldst = __q('#sdk-ldst').textContent;
    sel.value = 'modx1'; __fire(sel, 'change'); await __wait(50);
    o.subBack = __q('#sdk-nowsub').textContent; o.badBack = __q('#sdk-nowsub').classList.contains('bad');
    __clear(); sus.click(); await __wait(20); o.again = __bytes();
    o.lumi2 = __by.lumi.length; __clear();
    return o;
  });
  ok(/LUMI/.test(lu.outName) && lu.bad && /LUMI \(key lights\)/.test(lu.sub) && /pick the synth under Synth out/.test(lu.sub), '"Same as key lights" on a LUMI: the sub line goes .bad: ' + lu.sub);
  ok(lu.lumi === 0 && lu.modx === 0 && /LUMI/.test(lu.toast) && lu.pressed === 'false,false' && lu.tx === false, 'a tap sends nothing, toasts, leaves the switch alone: ' + lu.toast);
  ok(lu.load && lu.load.sent === 0 && lu.loadLumi === 0 && /LUMI/.test(lu.ldst), 'a load is refused the same way: ' + lu.ldst);
  ok(!lu.badBack && /MODX-1/.test(lu.subBack) && lu.again.join('|') === '176 64 127' && lu.lumi2 === 0, 'back on MODX-1 the switch works again: ' + lu.again.join('|'));

  console.log('# lifecycle: drains, remount, beforeoutput, stop, lastBank, delete all');
  const lc = await page.evaluate(async () => {
    const o = {};
    const mh = () => __q('.sdk-btn[data-ctl="msHold"]');
    __pd(mh(), 'pointerdown'); await __wait(10); o.held0 = App.synthDeck.held.slice();
    __clear(); App.switchTo('piano'); await __wait(50);
    o.leave = __bytes(); o.held1 = App.synthDeck.held.slice();
    App.switchTo('midihub'); await __wait(100); o.showSent = __by.modx1.length - o.leave.length;
    // Reset Hub = remount: one tap = exactly one message
    __q('#mh-reset').click(); await __wait(100);
    const pf = __q('#mh-profile'); pf.value = 'yamaha'; __fire(pf, 'change'); await __wait(100);
    App.synthDeck.tab('buttons'); await __wait(30);
    __clear(); __q('.sdk-btn[data-ctl="sus"]').click(); await __wait(20); o.oneTap = __bytes();
    __clear(); __q('.sdk-btn[data-ctl="sus"]').click(); await __wait(20); o.oneTapOff = __bytes();
    // beforeoutput drains
    __pd(mh(), 'pointerdown'); await __wait(10); __clear();
    App.emit('midi:beforeoutput', { outputId: 'lumi' }); await __wait(20);
    o.before = __bytes(); o.held2 = App.synthDeck.held.slice(); o.pressed2 = mh().getAttribute('aria-pressed');
    // stop() drains
    __pd(mh(), 'pointerdown'); await __wait(10); __clear(); App.synthDeck.stop(); await __wait(20);
    o.stop = __bytes(); o.held3 = App.synthDeck.held.slice();
    // visibilitychange hidden drains
    __pd(mh(), 'pointerdown'); await __wait(10); __clear();
    const hd = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange')); await __wait(20);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    if (hd) { delete document.hidden; }
    o.hidden = __bytes().filter(b => b === '176 88 0'); o.held4 = App.synthDeck.held.slice();
    // lastBank from any channel
    __clear(); __fromModx([0xB5, 0, 63]); __fromModx([0xB5, 32, 1]); __fromModx([0xC5, 4]); await __wait(20);
    o.lbSent = __by.modx1.length;
    // delete all sounds, two-step
    App.synthDeck.tab('sounds'); await __wait(30);
    const n0 = App.synthDeck.presets().length;
    __q('#sdk-pclear').click(); await __wait(20); o.clearReally = __q('#sdk-pclear').textContent; o.clearKept = App.synthDeck.presets().length === n0 && n0 > 0;
    __q('#sdk-pclear').click(); await __wait(30); o.cleared = App.synthDeck.presets().length; o.empty = !!__q('#sdk-empty') && !__q('#sdk-empty').hidden && /No sounds yet/.test(__q('#sdk-empty').textContent);
    o.lumi = __by.lumi.length; __clear();
    return o;
  });
  ok(lc.held0.join() === 'msHold' && nonClean(lc.leave).join('|') === '176 88 0' && lc.held1.length === 0 && lc.showSent === 0, 'leaving the page releases a held momentary; coming back sends nothing: ' + lc.leave.join('|'));
  ok(lc.oneTap.join('|') === '176 64 127' && lc.oneTapOff.join('|') === '176 64 0', 'after Reset Hub (remount) one tap is exactly one message: ' + lc.oneTap.join('|') + ' / ' + lc.oneTapOff.join('|'));
  ok(nonClean(lc.before).join('|') === '176 88 0' && lc.held2.length === 0 && lc.pressed2 === 'false', 'midi:beforeoutput drains the held set: ' + lc.before.join('|'));
  ok(lc.stop.join('|') === '176 88 0' && lc.held3.length === 0, 'stop() drains it too');
  ok(lc.hidden.length === 1 && lc.held4.length === 0, 'hiding the app drains it: ' + lc.hidden.join('|'));
  ok(lc.lbSent === 0, 'bank/program from another channel is only recorded');
  ok(/Really/.test(lc.clearReally) && lc.clearKept && lc.cleared === 0 && lc.empty, 'Delete all sounds is two-step and leaves the empty note');
  ok(lc.lumi === 0, 'nothing reached the LUMI');
  await page.waitForFunction(() => { const d = App.store.get('midihub.deckvals', null); return !!(d && d.lastBank && d.lastBank.pc === 5); }, null, { timeout: 3000 }).catch(() => {});
  const lb = await page.evaluate(() => { const d = App.store.get('midihub.deckvals', null); return d && d.lastBank; });
  ok(lb && lb.msb === 63 && lb.lsb === 1 && lb.pc === 5 && lb.ch === 5 && lb.t > 0, 'deckvals.lastBank records CC0/CC32/PC from channel 6: ' + J(lb));

  console.log('# phone width');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(200);
  const ph = await page.evaluate(async () => {
    const o = { tabs: {}, sizes: {} };
    for (const t of ['knobs', 'buttons', 'sounds', 'scope', 'map']) {
      __q('#sdk-tabs [data-tab="' + t + '"]').click(); await __wait(80);
      o.tabs[t] = document.documentElement.scrollWidth <= window.innerWidth;
    }
    __q('#sdk-tabs [data-tab="knobs"]').click(); await __wait(50);
    const big = __q('#sdk-save').getBoundingClientRect(), tab = __q('#sdk-tabs [data-tab="knobs"]').getBoundingClientRect();
    o.sizes = { big: big.height, tab: tab.height, inner: window.innerWidth, scroll: document.documentElement.scrollWidth };
    o.lumi = __by.lumi.length;
    return o;
  });
  ok(Object.values(ph.tabs).every(Boolean), 'no horizontal page scroll at 390 px on any tab: ' + J(ph.tabs) + ' ' + J(ph.sizes));
  ok(ph.sizes.big >= 52 && ph.sizes.tab >= 44, 'touch sizes: .sdk-big ' + ph.sizes.big + 'px, tab ' + ph.sizes.tab + 'px');
  ok(ph.lumi === 0, 'nothing reached the LUMI');
  await page.setViewportSize({ width: 1200, height: 900 });

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
  await browser.close();
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e); process.exit(1); });
