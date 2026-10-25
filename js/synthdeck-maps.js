/* soundLAB Synth Deck — default control maps (pure data, no DOM).
 *
 * window.SLSynthDeckMaps = { v, generic, yamaha, roland }. js/synthdeck.js
 * deep-merges a profile's map with the user's overrides (midihub.deck.maps)
 * into the effective map it renders and sends from.
 *
 * Control: { id, sec, name, kind:'cc'|'pc'|'sx', ui:'knob'|'toggle'|'momentary'
 *   |'radio'|'trigger', ch:'part'|'global'|0-15, num:0-127|null, on, off, def,
 *   group, val, sx:{addr,on,off,val}, conf:'verified'|'documented'|'unverified'
 *   |'learned', src, note }. In sx.addr a 'p' is the Part nibble (0-F), an
 * 's' the scene index; '{v}' in sx.val is the knob value as one 7-bit byte.
 * num null / sx.addr null = the number is not known yet (the deck shows '?'
 * and never sends it until Map or Learn fills it).
 *
 * Research 2026-10-24 (scratchpad/modx-research.md): MODX / MODX+ / MONTAGE
 * Checked on Matt's MODX8+ 2026-10-24 (tasks/20261025T0010Z-modx-check-claude.md,
 * docs/MODX-MIDI-REFERENCE.md 'Checked on the MODX8+'): 'verified' + src
 * 'checked on MODX8+ 2026-10-24' = seen on the real synth (transmit capture,
 * or write + Parameter Request readback + bulk-dump diff). The panel transmits
 * nothing for ARP / MOTION SEQ / Part edits, so the deck reads the synth back.
 * classic, SysEx model id 07, 3-byte addresses, Parameter Change
 * F0 43 1n 7F 1C 07 aH aM aL dd F7. Every default CC number is changeable on
 * the synth (Utility > Settings > MIDI I/O / Performance > Control Number).
 */
(function () {
  'use strict';

  function knob(id, sec, name, num, def, conf, src, slot) {
    var k = { id: id, sec: sec, name: name, kind: 'cc', ui: 'knob', ch: 'part', num: num, def: def, conf: conf, src: src || '' };
    if (slot) k.slot = slot;
    return k;
  }
  function toggle(id, sec, name, num, conf, src, note) {
    return { id: id, sec: sec, name: name, kind: 'cc', ui: 'toggle', ch: 'part', num: num, on: 127, off: 0, conf: conf, src: src || '', note: note || '' };
  }
  function sxToggle(id, sec, name, addr, conf, src, note, ch) {
    return { id: id, sec: sec, name: name, kind: 'sx', ui: 'toggle', ch: ch || 'part', num: null, sx: { addr: addr, on: '01', off: '00' }, conf: conf, src: src || '', note: note || '' };
  }
  function momentary(id, sec, name, num, conf, src) {
    return { id: id, sec: sec, name: name, kind: 'cc', ui: 'momentary', ch: 'part', num: num, on: 127, off: 0, conf: conf, src: src || '' };
  }
  function trigger(id, sec, name, num, val, src) {
    return { id: id, sec: sec, name: name, kind: 'cc', ui: 'trigger', ch: 'part', num: num, val: val, conf: 'verified', src: src || 'MIDI channel mode message' };
  }

  var HUB_MAIN = [
    ['main1', 'Cutoff', 74, 64, 'verified', 'CC 74 on the Part channel -> Part 31 0p 50; checked on MODX8+ 2026-10-24 (readback)'],
    ['main2', 'Resonance', 71, 64, 'verified', 'CC 71 on the Part channel -> Part 31 0p 51; checked on MODX8+ 2026-10-24 (readback)'],
    ['main3', 'Attack', 73, 64, 'verified', 'CC 73 -> Part 31 0p 46; checked on MODX8+ 2026-10-24 (readback)'],
    ['main4', 'Release', 72, 64, 'verified', 'CC 72 -> Part 31 0p 49; checked on MODX8+ 2026-10-24 (readback)'],
    ['main5', 'Reverb', 91, 40, 'verified', 'CC 91 -> Part 31 0p 29; checked on MODX8+ 2026-10-24 (readback)'],
    ['main6', 'Chorus', 93, 0, 'documented', 'GM-style chorus send (CC 93); on the MODX8+ 2026-10-24 CC 93 changed nothing in the Performance dump (not confirmed either way)'],
    ['main7', 'Volume', 7, 100, 'verified', 'CC 7 on the Part channel -> Part volume 31 0p 24; checked on MODX8+ 2026-10-24 (readback; Multi mode: ch 2 moved Part 2)'],
    ['main8', 'Pan', 10, 64, 'verified', 'CC 10 -> Part 31 0p 25; checked on MODX8+ 2026-10-24 (readback)']
  ];

  function yamahaHub() {
    var out = [knob('hero', 'hub', 'Super Knob', 95, 0, 'verified', 'Super Knob CC 95 on ch 1 both ways; checked on MODX8+ 2026-10-24 (panel turn captured; CC 95 -> 30 4B 00 readback)', 'hero')];
    HUB_MAIN.forEach(function (r) { out.push(knob(r[0], 'hub', r[1], r[2], r[3], r[4], r[5], 'main')); });
    for (var i = 0; i < 8; i++) out.push(knob('ex' + (i + 1), 'hub', 'Assign ' + (i + 1), 17 + i, 64, 'verified', 'Assignable Knob ' + (i + 1) + ' = CC ' + (17 + i) + ' (per Performance: Edit > Common > Control > Control Number); checked on MODX8+ 2026-10-24 (CC -> Part 31 0p ' + (0x6A + i).toString(16).toUpperCase() + ' readback; with Common selected the panel knobs send SysEx 30 40 53.., not CC)', 'extra'));
    return out;
  }

  function scenes() {
    var out = [];
    for (var s = 0; s < 8; s++) {
      out.push({ id: 'scene' + (s + 1), sec: 'scenes', name: 'Scene ' + (s + 1), kind: 'cc', ui: 'radio', group: 'scene', ch: 'global', num: 92, val: s * 16,
        conf: 'verified', src: 'Scene CC 92, bands of 16 (0-15 = Scene 1 … 112-127 = Scene 8) on channel 1; checked on MODX8+ 2026-10-24 (SCENE 1-8 panel presses transmit 0,16,…,112; received values land in 30 4C 00 byte 0)' });
    }
    return out;
  }

  var YAMAHA_CONTROLS = yamahaHub().concat(scenes(), [
    // arpeggiator
    sxToggle('arpMaster', 'arp', 'Arpeggiator', '30 47 03', 'verified', 'Performance Common Arp master switch; checked on MODX8+ 2026-10-24 (write + readback + dump diff). The panel button transmits nothing.', 'The panel [ARP ON/OFF] button. No plain CC exists for it.', 'global'),
    sxToggle('arpPart', 'arp', 'Arp on this Part', '31 6p 00', 'verified', 'Part Arpeggio switch; checked on MODX8+ 2026-10-24 (Part 1: wrote 00, read 0, dump 31 60 00 byte 0 1>0, restored 01)', 'Per-Part arpeggio switch.'),
    // motion sequencer
    sxToggle('msMaster', 'motion', 'Motion sequencer', '30 48 00', 'verified', 'Performance Common Motion Seq master switch; checked on MODX8+ 2026-10-24 (write + readback + dump diff). The panel button transmits nothing.', 'The panel [MOTION SEQ ON/OFF] button.', 'global'),
    momentary('msHold', 'motion', 'Motion seq hold', 88, 'verified', 'Motion Seq Hold = CC 88; checked on MODX8+ 2026-10-24 (the panel button latches: 127 on, 0 off, sent on every keyboard-control Part channel)'),
    momentary('msTrig', 'motion', 'Motion seq trigger', 89, 'verified', 'Motion Seq Trigger = CC 89; checked on MODX8+ 2026-10-24 (panel press 127 then 0)'),
    // this Part
    sxToggle('mute', 'part', 'Mute this Part', '31 0p 18', 'verified', 'Part Mute switch; checked on MODX8+ 2026-10-24 (write + readback + dump diff)', 'Mutes the selected Part.'),
    sxToggle('kbdCtl', 'part', 'Keyboard control', '31 0p 17', 'verified', 'Part Keyboard Control switch; checked on MODX8+ 2026-10-24 (write + readback + dump diff; Parts 9-16 are fixed off)', 'Whether the keyboard plays this Part.'),
    // switches
    toggle('sus', 'switches', 'Sustain', 64, 'verified', 'Hold/sustain pedal CC 64'),
    toggle('sost', 'switches', 'Sostenuto', 66, 'verified', 'CC 66'),
    toggle('soft', 'switches', 'Soft', 67, 'verified', 'CC 67'),
    toggle('porta', 'switches', 'Portamento', 65, 'verified', 'Portamento switch CC 65 -> Part 31 0p 31; checked on MODX8+ 2026-10-24 (readback)'),
    toggle('asw1', 'switches', 'Assign Sw 1', 86, 'verified', 'Assignable Switch 1 = CC 86; checked on MODX8+ 2026-10-24 (panel press 127, release 0, on every keyboard-control Part channel)', 'Latch or momentary is the panel button’s own setting.'),
    toggle('asw2', 'switches', 'Assign Sw 2', 87, 'verified', 'Assignable Switch 2 = CC 87; checked on MODX8+ 2026-10-24 (panel press 127, release 0)', 'Latch or momentary is the panel button’s own setting.'),
    toggle('fs', 'switches', 'Foot switch', null, 'unverified', 'FS Assign (Utility > Settings > MIDI I/O) default unknown', 'Set FS Assign to a CC number on the synth, then Learn it here.'),
    // triggers
    trigger('allOff', 'triggers', 'All notes off', 123, 0),
    trigger('resetCtl', 'triggers', 'Reset controllers', 121, 0),
    // Expression page
    knob('mod', 'expression', 'Mod wheel', 1, 0, 'verified', 'CC 1'),
    knob('breath', 'expression', 'Breath', 2, 0, 'documented', 'Breath controller CC 2 (per Performance: Control Number)'),
    knob('foot', 'expression', 'Foot ctrl 2', 4, 0, 'documented', 'Foot Controller 2 = CC 4 (per Performance)'),
    knob('portaTime', 'expression', 'Portamento time', 5, 0, 'verified', 'CC 5 -> Part 31 0p 32; checked on MODX8+ 2026-10-24 (readback)'),
    knob('expr', 'expression', 'Expression', 11, 127, 'verified', 'Foot Controller 1 / Expression = CC 11'),
    knob('decay', 'expression', 'Decay', 75, 64, 'verified', 'CC 75 -> Part 31 0p 47; checked on MODX8+ 2026-10-24 (readback)'),
    knob('ribbon', 'expression', 'Ribbon', 16, 64, 'documented', 'Ribbon controller = CC 16 (the MODX has no ribbon; incoming CC 16 acts as one)'),
    // Master page (SysEx knobs)
    { id: 'tgVol', sec: 'master', name: 'Master volume', kind: 'sx', ui: 'knob', ch: 'global', num: null, def: 127, sx: { addr: '00 00 00', val: '{v}' }, conf: 'verified', src: 'System: Tone Generator volume 00 00 00 (00-7F); checked on MODX8+ 2026-10-24 (reads 7F by Parameter Request)' },
    { id: 'superSx', sec: 'master', name: 'Super Knob (SysEx)', kind: 'sx', ui: 'knob', ch: 'global', num: null, def: 0, sx: { addr: '30 4B 00', val: '{v}' }, conf: 'verified', src: 'Performance Common: Super Knob value 30 4B 00; checked on MODX8+ 2026-10-24 (reads back and follows CC 95 and scene recalls)' }
  ]);

  var YAMAHA_BANKS = (function () {
    var b = [];
    for (var i = 0; i < 17; i++) b.push({ msb: 63, lsb: i, name: 'Preset ' + (i + 1) });
    for (var u = 0; u < 5; u++) b.push({ msb: 63, lsb: 32 + u, name: 'User ' + (u + 1) });
    return b;
  })();

  var yamaha = {
    name: 'Yamaha MODX / MONTAGE',
    short: 'MODX',
    sections: [
      { id: 'hub', name: 'Hub knobs' }, { id: 'scenes', name: 'Scenes' }, { id: 'arp', name: 'Arpeggiator' }, { id: 'motion', name: 'Motion sequencer' },
      { id: 'part', name: 'This Part' }, { id: 'switches', name: 'Switches' }, { id: 'triggers', name: 'Triggers' },
      { id: 'expression', name: 'Expression' }, { id: 'master', name: 'Master' }, { id: 'custom', name: 'Yours' }
    ],
    extraTitle: 'Assign knobs',
    controls: YAMAHA_CONTROLS,
    pages: [
      { id: 'expression', name: 'Expression', ctl: ['mod', 'breath', 'foot', 'portaTime', 'expr', 'decay', 'ribbon', null] },
      { id: 'master', name: 'Master', ctl: ['tgVol', 'superSx', null, null, null, null, null, null] }
    ],
    banks: YAMAHA_BANKS,
    bankModes: { part: 63, whole: 64 },
    bulk: { request: 'F0 43 20 7F 1C 07 0E 25 00 F7', nameAddr: '30 40 00', nameOffset: 11, nameLen: 20 },
    nameFile: 'data/modx-performances.json',
    identity: { 86: 'MODX6', 87: 'MODX7', 88: 'MODX8', 106: 'MODX8+' }, // 0x6A = the MODX8+ Device Inquiry reply (captured 2026-10-24)
    notes: [
      'Arp MIDI Out (Utility › Settings › MIDI I/O) must be On for the Scope to see arpeggio notes — it also makes incoming MIDI bypass the arpeggiator.',
      'Clock Out On and MIDI Sync Internal (same screen) give the Scope its beat grid from the synth’s own clock.',
      'Local Control Off avoids doubled notes when Thru is on.',
      'MIDI I/O Mode Multi (Utility › Settings › Advanced) = Part n listens on channel n; in Single mode everything is on one channel.',
      'The Scene CC (92) and Super Knob CC (95) numbers live in Utility › Settings › MIDI I/O; the Assign knob and switch numbers are per Performance (Edit › Common › Control › Control Number).',
      'The Motion Sequencer itself sends no MIDI — only the knob it drives, when that knob transmits a CC.',
      'A Performance change on the panel sends no Program Change — use Read name from synth under Sounds.',
      'Checked on a MODX8+ (2026-10-24): panel ARP / MOTION SEQ / Part edits transmit nothing, and the synth never echoes a Parameter Change it receives — Learn works for CCs and knobs; SysEx toggles are confirmed by reading the synth back (Parameter Request F0 43 30 7F 1C 07 addr F7).',
      'The active Scene is readable at 30 4C 00 (byte 0 = 0-7) but not settable there — Scene CC 92 is the way to change it.'
    ]
  };

  var GENERIC_CONTROLS = [
    toggle('sus', 'switches', 'Sustain', 64, 'verified', 'CC 64'),
    toggle('porta', 'switches', 'Portamento', 65, 'verified', 'CC 65'),
    toggle('sost', 'switches', 'Sostenuto', 66, 'verified', 'CC 66'),
    toggle('soft', 'switches', 'Soft', 67, 'verified', 'CC 67'),
    trigger('allOff', 'triggers', 'All notes off', 123, 0),
    trigger('resetCtl', 'triggers', 'Reset controllers', 121, 0),
    knob('mod', 'more', 'Mod', 1, 0, 'documented', 'GM2 CC 1'),
    knob('breath', 'more', 'Breath', 2, 0, 'documented', 'GM2 CC 2'),
    knob('foot', 'more', 'Foot', 4, 0, 'documented', 'GM2 CC 4'),
    knob('portaTime', 'more', 'Portamento time', 5, 0, 'documented', 'GM2 CC 5'),
    knob('expr', 'more', 'Expression', 11, 127, 'documented', 'GM2 CC 11'),
    knob('decay', 'more', 'Decay', 75, 64, 'documented', 'GM2 CC 75'),
    knob('vibRate', 'more', 'Vibrato rate', 76, 64, 'documented', 'GM2 CC 76'),
    knob('vibDepth', 'more', 'Vibrato depth', 77, 64, 'documented', 'GM2 CC 77')
  ];

  var generic = {
    name: 'Generic MIDI device',
    short: 'MIDI',
    sections: [{ id: 'switches', name: 'Switches' }, { id: 'triggers', name: 'Triggers' }, { id: 'more', name: 'More CCs' }, { id: 'custom', name: 'Yours' }],
    controls: GENERIC_CONTROLS,
    pages: [{ id: 'more', name: 'More CCs', ctl: ['mod', 'breath', 'foot', 'portaTime', 'expr', 'decay', 'vibRate', 'vibDepth'] }],
    banks: [{ msb: 0, lsb: 0, name: 'Bank 0/0' }],
    bankModes: null,
    bulk: null,
    nameFile: null,
    identity: null,
    notes: [
      'Which CC does what is in the device’s MIDI implementation chart. Learn fills a number from whatever the device sends.',
      'Banks and programs: Bank Select MSB (CC 0) + LSB (CC 32), then Program Change — many devices ignore banks entirely.'
    ]
  };

  var roland = {
    name: 'Roland',
    short: 'Roland',
    sections: generic.sections,
    controls: GENERIC_CONTROLS,
    pages: generic.pages,
    banks: generic.banks,
    bankModes: null,
    bulk: null,
    nameFile: null,
    identity: null,
    notes: [
      'Roland tones are picked with Bank MSB + LSB + Program; the pairs are listed per bank in the MIDI implementation.',
      'Deep parameters are DT1 SysEx with a 4-byte address and a checksum — the Map tab builds them when you add a SysEx control.'
    ]
  };

  window.SLSynthDeckMaps = { v: 1, generic: generic, yamaha: yamaha, roland: roland };
})();
