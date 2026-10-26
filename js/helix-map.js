/* soundLAB HELIX DECK MAP — pure data for the Helix Stadium page (js/helix.js,
 * js/helix-routes.js = App.helix, js/helix-deck.js = the Perform face).
 *
 * window.SLHelixMap = { v, CONTROLS, ROWS, CHIPS, BUTTONS, FSMODES, MIX, LAYERS,
 *   CATS, COLOURS, CC, CC_NAMES, EXPLAIN, byId(id), ccName(n), mixCC(kind, strip),
 *   tour() }.
 *
 * Every control carries its message (CC n / Program Change / OSC address), the
 * channel it goes out on ('global' = hx.ch, 'ctl' = hx.ctlCh, 'layer' = the
 * Matrix output layer's channel, null = a bridge address), a confidence, the
 * firmware it needs and ONE Explain sentence. The deck's captions and the help
 * tour are built from those sentences, so there is one wording table.
 *
 * Numbers: the Helix Stadium manual's MIDI chapter as js/helix.js has sent them
 * since 0.82.0 and docs/HELIX-STADIUM.md tabulates them. Confidence:
 *   'verified'    seen on the pedal — CC 69 = 1 then 0 went out over USB MIDI on
 *                 2026-10-22 and /ActiveSnapshotIndexGet read 1 then 0 back; the
 *                 CC 32 + Program Change recall; every editor-protocol address
 *                 (checked against a Stadium XL on firmware 1.1.0)
 *   'documented'  the rest of the manual's MIDI table
 *   'unverified'  the setlist '5 + position' rule (never checked on hardware)
 *                 and everything that needs firmware 1.3 (Showcase / song
 *                 transport) or 1.4 (Matrix mixer) on a pedal that runs 1.1.0
 *   'learned'     your own Bypass/Control CCs, typed in or learned from the pedal
 *
 * NO DOM, NO App CALLS AT LOAD: the file evaluates under Node with window = {}
 * (the deck suite reads it that way). A self-check at the end throws when a
 * control lacks its explain or conf, so a bad edit fails at load, not on stage.
 */
(function () {
  'use strict';

  var root = typeof window !== 'undefined' ? window : globalThis;

  // ---- the Stadium's MIDI map (Helix Stadium manual, "MIDI"; same as helix.js) ----
  var CC = { EXP1: 1, EXP2: 2, XYX: 7, XYY: 8, BTN: 9, SONGCUE: 10, SETLIST: 32, TOE: 36, FSMODE: 37, KNOB1: 38, MARKER: 46, RTZ: 47, CYCLE: 48, SONGPN: 49, MARKPN: 50, PLAY: 51,
    LCLEAR: 52, LUNDO: 53, LSPEED: 54, LDIR: 55, LREC: 58, LPLAY: 59, LONCE: 60, LBLOCK: 62, PLAYLIST: 63, TAP: 64, SNAP: 69, CLEARSOLO: 103 };
  // top-panel buttons = CC 9 values
  var BUTTON_ROWS = [[0, 'Home'], [1, 'Song'], [2, 'Amp'], [3, 'Save'], [4, 'XY'], [5, '‹ Page'], [6, 'Page ›'], [7, 'Matrix ¼"'], [8, 'Matrix XLR'], [9, 'Matrix Phones'], [10, 'Undo'], [11, 'Redo'],
    [14, 'Preset list'], [15, 'Preset info'], [16, 'Info ▲'], [17, 'Info ▼'], [18, 'Zoom +'], [19, 'Zoom −'], [20, 'Preset clip'], [21, 'Stopwatch'], [22, 'Stopwatch reset'], [23, 'Click'], [24, 'Mute all'], [25, 'Focus'], [26, 'Song list'], [27, 'Flag list'], [33, 'Song settings']];
  var BUTTONS = BUTTON_ROWS.map(function (r) { return { val: r[0], name: r[1] }; });
  var FSMODES = ['Stomp A', 'Stomp B', 'Preset', 'Snapshot', 'Combo', 'Unassigned', 'Transport'];
  // Matrix mixer strips: level CC; pan = +23, mute = +46, solo = +69 (firmware 1.4)
  var MIX_ROWS = [['Home (all paths)', 11], ['Path 1A', 12], ['Path 1B', 13], ['Path 2A', 14], ['Path 2B', 15], ['Song (all tracks)', 16], ['Track 1', 17], ['Track 2', 18], ['Track 3', 19], ['Track 4', 20],
    ['Track 5', 21], ['Track 6', 22], ['Track 7', 23], ['Track 8', 24], ['Click', 25], ['Count in', 26], ['USB in 1/2', 27], ['Bluetooth in', 28], ['Aux in', 29]];
  var MIX = MIX_ROWS.map(function (r) { return { name: r[0], level: r[1], pan: r[1] + 23, mute: r[1] + 46, solo: r[1] + 69 }; });
  var LAYERS = [{ id: 'qtr', name: '¼" out', ch: 3 }, { id: 'xlr', name: 'XLR out', ch: 4 }, { id: 'pho', name: 'Phones', ch: 5 }];
  var CATS = { 0: 'None', 1: 'Fav', 2: 'Amp', 3: 'Preamp', 5: 'Cab', 6: 'Dist', 7: 'Delay', 8: 'Reverb', 9: 'Mod', 10: 'Dyn', 11: 'EQ', 12: 'Pitch', 13: 'Wah', 14: 'Vol', 15: 'FX loop', 16: 'Looper', 17: 'Input', 18: 'Output', 19: 'Split', 20: 'Merge' };
  var COLOURS = ['amber', 'teal', 'blue', 'pink', 'green', 'grey'];
  var CONF = { verified: 1, documented: 1, unverified: 1, learned: 1 };

  // ---- sources and wording -------------------------------------------------------------
  var SRC = {
    manual: 'Helix Stadium manual, MIDI chapter (the table in docs/HELIX-STADIUM.md)',
    snap: 'manual; CC 69 = 1 then 0 sent over USB MIDI on 2026-10-22 and read back by /ActiveSnapshotIndexGet',
    recall: 'manual; CC 32 + Program Change recall as helix.js has sent it since 0.82.0 (Factory / User banks)',
    setlistPos: 'manual table: a setlist at position s is CC 32 = 5 + s — not checked on the pedal yet',
    song: 'manual; Showcase / song transport MIDI needs firmware 1.3 (Line 6 release notes) — this pedal runs 1.1.0',
    mix: 'manual §Matrix 1.4',
    stomp: 'your own Bypass/Control assignments on the Helix (Global Settings › MIDI, channel 2 by default)',
    osc: 'editor protocol over the bridge, checked against a Stadium XL on firmware 1.1.0 (docs/HELIX-STADIUM.md)'
  };
  var CHAN = { global: 'the Global channel', ctl: 'the Bypass/Control channel', layer: 'the output layer’s channel (¼" 3, XLR 4, Phones 5)' };

  var CONTROLS = [];
  function sentence(o, msg, what) {
    return o.name + ': ' + msg + (o.ch ? ' on ' + CHAN[o.ch] : '') + ' over ' + (o.kind === 'osc' ? 'the bridge' : 'MIDI') + ' — ' + what + '.';
  }
  // add(control, message, what): fills the defaults and the Explain sentence
  function add(o, msg, what) {
    if (!o.kind) o.kind = 'cc';
    if (o.kind === 'cc') { if (o.on == null) o.on = 127; if (o.off == null) o.off = 0; }
    if (o.ch === undefined) o.ch = o.kind === 'osc' ? null : 'global';
    if (o.num === undefined) o.num = null;
    if (!o.src) o.src = SRC.manual;
    if (!o.explain) o.explain = sentence(o, msg, what);
    CONTROLS.push(o);
    return o;
  }

  // ---- strips: knobs, pedals, XY ------------------------------------------------------
  var i;
  for (i = 0; i < 8; i++) {
    add({ id: 'knob:' + i, name: 'Knob ' + (i + 1), ui: 'strip', num: CC.KNOB1 + i, def: 64, conf: 'documented', row: i < 4 ? 'knobs14' : 'knobs58' },
      'CC ' + (CC.KNOB1 + i), 'whatever the Helix screen shows under Knob ' + (i + 1));
  }
  add({ id: 'exp:0', name: 'EXP 1', ui: 'strip', num: CC.EXP1, def: 0, conf: 'documented', row: 'pedals' }, 'CC 1', 'the EXP 1 pedal position, 0 heel to 127 toe');
  add({ id: 'exp:1', name: 'EXP 2', ui: 'strip', num: CC.EXP2, def: 0, conf: 'documented', row: 'pedals' }, 'CC 2', 'the EXP 2 pedal position, 0 heel to 127 toe');
  add({ id: 'xy', name: 'XY pad', ui: 'pad', num: CC.XYX, num2: CC.XYY, def: 64, conf: 'documented', row: 'pedals' }, 'CC 7 across and CC 8 up', 'the XY controller, 0–127 on each axis');
  add({ id: 'toe', name: 'Toe switch', ui: 'chip', num: CC.TOE, val: 127, conf: 'documented', row: 'pedals' }, 'CC 36 = 127', 'toggles the expression pedal’s toe switch');

  // ---- chips and radios on the Global channel --------------------------------------
  add({ id: 'fsmode', name: 'Footswitch mode', ui: 'radio', num: CC.FSMODE, vals: [0, 1, 2, 3, 4, 5, 6], names: FSMODES, conf: 'documented' },
    'CC 37 = 0–6', 'Stomp A, Stomp B, Preset, Snapshot, Combo, Unassigned or Transport');
  add({ id: 'tap', name: 'Tap', ui: 'chip', num: CC.TAP, val: 127, conf: 'documented' }, 'CC 64 = 127', 'one tap of Tap Tempo (any value from 64 up counts)');
  add({ id: 'apptempo', name: 'App tempo', ui: 'chip', num: CC.TAP, val: 127, conf: 'documented' }, 'four CC 64 = 127 taps spaced at soundLAB’s tempo', 'sets the Helix tempo to the app’s BPM');
  add({ id: 'tuner', name: 'Tuner', ui: 'chip', num: CC.BTN, val: 34, conf: 'documented' }, 'CC 9 = 34', 'the tuner on or off, as holding TAP does on the pedal');
  add({ id: 'click', name: 'Click', ui: 'chip', num: CC.BTN, val: 23, conf: 'documented' }, 'CC 9 = 23', 'the click on or off');
  add({ id: 'muteall', name: 'Mute all', ui: 'chip', num: CC.BTN, val: 24, conf: 'documented' }, 'CC 9 = 24', 'the panic button that mutes every output; when disarmed the chip becomes Arm & mute instead of refusing silently');
  add({ id: 'prev', name: 'Prev', ui: 'chip', num: CC.BTN, val: 12, conf: 'documented' }, 'CC 9 = 12', 'the previous preset in the setlist');
  add({ id: 'next', name: 'Next', ui: 'chip', num: CC.BTN, val: 13, conf: 'documented' }, 'CC 9 = 13', 'the next preset in the setlist');
  add({ id: 'button', name: 'Panel button', ui: 'chip', num: CC.BTN, val: null, vals: BUTTONS, conf: 'documented' },
    'CC 9 = the button’s number (0 Home … 33 Song settings)', 'presses that top-panel button once');

  // ---- preset address: setlist CC 32, Program Change, snapshot CC 69 ---------------
  add({ id: 'setlist', name: 'Setlist', ui: 'tile', num: CC.SETLIST, def: 1, conf: 'verified', src: SRC.recall },
    'CC 32 = 0 Factory, 1–4 User', 'picks the setlist the next Program Change chooses from; a pin sends it first');
  add({ id: 'setlist:pos', name: 'Setlist (yours)', ui: 'tile', num: CC.SETLIST, conf: 'unverified', src: SRC.setlistPos },
    'CC 32 = 5 + the setlist’s position', 'the manual’s rule for your own setlists, not yet checked on the pedal');
  add({ id: 'program', name: 'Preset', kind: 'pc', ui: 'tile', num: null, conf: 'verified', src: SRC.recall },
    'Program Change 0–127', 'the preset within the setlist, 30 ms after CC 32');
  add({ id: 'snapshot', name: 'Snapshot', ui: 'snap', num: CC.SNAP, vals: [0, 1, 2, 3, 4, 5, 6, 7], next: 8, prev: 9, def: 0, conf: 'verified', src: SRC.snap,
    explain: 'Snapshot 1–8: CC 69 = 0–7 on the Global channel over MIDI, or /activateSnapshot over the bridge when it is online — a pin sends it 300 ms after the preset, and the pedal reports the active one back on its change stream.' });
  add({ id: 'snapprev', name: 'Previous snapshot', ui: 'chip', num: CC.SNAP, val: 9, conf: 'documented' }, 'CC 69 = 9', 'steps to the previous snapshot');
  add({ id: 'snapnext', name: 'Next snapshot', ui: 'chip', num: CC.SNAP, val: 8, conf: 'documented' }, 'CC 69 = 8', 'steps to the next snapshot');

  // ---- looper CC 52–62 (momentary chips) ----------------------------------------------
  [['looprec', 'Record', CC.LREC, 127, 'starts recording a loop'],
    ['loopover', 'Overdub', CC.LREC, 0, 'overdubs onto the loop'],
    ['loopplay', 'Play', CC.LPLAY, 127, 'plays the loop'],
    ['loopstop', 'Stop', CC.LPLAY, 0, 'stops the loop'],
    ['looponce', 'Play once', CC.LONCE, 127, 'plays the loop once'],
    ['loopundo', 'Undo / Redo', CC.LUNDO, 127, 'undoes or redoes the last overdub'],
    ['loophalf', 'Half speed', CC.LSPEED, 127, 'plays the loop at half speed'],
    ['loopfull', 'Full speed', CC.LSPEED, 0, 'plays the loop at full speed'],
    ['looprev', 'Reverse', CC.LDIR, 127, 'plays the loop backwards'],
    ['loopfwd', 'Forward', CC.LDIR, 0, 'plays the loop forwards'],
    ['loopblockon', 'Looper block on', CC.LBLOCK, 127, 'switches the looper block on'],
    ['loopblockoff', 'Looper block off', CC.LBLOCK, 0, 'switches the looper block off'],
    ['loopclear', 'Clear loop', CC.LCLEAR, 127, 'clears the loop']
  ].forEach(function (r) {
    add({ id: r[0], name: r[1], ui: 'chip', num: r[2], val: r[3], conf: 'documented', momentary: true }, 'CC ' + r[2] + ' = ' + r[3], r[4]);
  });

  // ---- Showcase / song transport CC 10, 46–51, 63 (firmware 1.3) ----------------------
  [['playlist', 'Playlist', CC.PLAYLIST, null, 'strip', 'CC 63 = n', 'opens playlist n (0 = the Song Library)'],
    ['songcue', 'Song', CC.SONGCUE, null, 'strip', 'CC 10 = n', 'cues song n + 1 of the playlist'],
    ['marker', 'Marker', CC.MARKER, null, 'strip', 'CC 46 = n', 'cues marker n of the song'],
    ['rtz', 'Return to zero', CC.RTZ, 127, 'chip', 'CC 47 = 127', 'returns the song to its start'],
    ['cycle', 'Cycle', CC.CYCLE, 127, 'chip', 'CC 48 = 127', 'cycle on or off'],
    ['cyclemark', 'Cycle markers', CC.CYCLE, 0, 'chip', 'CC 48 = 0', 'cycles between the two markers'],
    ['songprev', 'Previous song', CC.SONGPN, 0, 'chip', 'CC 49 = 0', 'the previous song of the playlist'],
    ['songnext', 'Next song', CC.SONGPN, 127, 'chip', 'CC 49 = 127', 'the next song of the playlist'],
    ['markprev', 'Previous marker', CC.MARKPN, 0, 'chip', 'CC 50 = 0', 'the previous marker'],
    ['marknext', 'Next marker', CC.MARKPN, 127, 'chip', 'CC 50 = 127', 'the next marker'],
    ['songplay', 'Play / Pause', CC.PLAY, 127, 'chip', 'CC 51 = 127', 'plays or pauses the song']
  ].forEach(function (r) {
    add({ id: r[0], name: r[1], ui: r[4], num: r[2], val: r[3], conf: 'unverified', minFw: '1.3', src: SRC.song, momentary: r[4] === 'chip' }, r[5], r[6] + ' (needs firmware 1.3; this pedal runs 1.1.0)');
  });

  // ---- Matrix mixer on the output layer's channel (firmware 1.4) --------------------
  add({ id: 'mix:level', name: 'Mixer level', ui: 'strip', ch: 'layer', num: 11, last: 29, def: 100, conf: 'unverified', minFw: '1.4', src: SRC.mix, row: 'mix' },
    'CC 11–29 (one CC per strip, Home first)', 'that strip’s Matrix level, 0–127 (needs firmware 1.4)');
  add({ id: 'mix:pan', name: 'Mixer pan', ui: 'strip', ch: 'layer', num: 34, last: 52, def: 64, conf: 'unverified', minFw: '1.4', src: SRC.mix, row: 'mix' },
    'CC 34–52 (one CC per strip, Home first)', 'that strip’s pan, 64 = centre (needs firmware 1.4)');
  add({ id: 'mix:mute', name: 'Mixer mute', ui: 'chip', ch: 'layer', num: 57, last: 75, val: 127, conf: 'unverified', minFw: '1.4', src: SRC.mix, row: 'mix' },
    'CC 57–75 = 127 (one CC per strip, Home first)', 'toggles that strip’s mute, values from 64 up (needs firmware 1.4)');
  add({ id: 'mix:solo', name: 'Mixer solo', ui: 'chip', ch: 'layer', num: 80, last: 98, val: 127, conf: 'unverified', minFw: '1.4', src: SRC.mix, row: 'mix' },
    'CC 80–98 = 127 (one CC per strip, Home first)', 'toggles that strip’s solo, values from 64 up (needs firmware 1.4)');
  add({ id: 'mix:clearsolo', name: 'Clear solos', ui: 'chip', ch: 'layer', num: CC.CLEARSOLO, val: 127, conf: 'unverified', minFw: '1.4', src: SRC.mix, row: 'mix', momentary: true },
    'CC 103 = 127', 'clears every solo on that layer (needs firmware 1.4)');

  // ---- your own Bypass/Control CCs (channel hx.ctlCh) --------------------------------
  add({ id: 'stomp', name: 'Stomp', ui: 'chip', ch: 'ctl', num: null, conf: 'learned', src: SRC.stomp, row: 'stomps' },
    'the CC number you assigned on the Helix’s Bypass/Control screen (127 on / 0 off, or 0–127 for a knob)', 'the block or parameter you tied it to there; soundLAB only knows the number you typed');

  // ---- editor protocol over the bridge ------------------------------------------------
  add({ id: 'param', name: 'Block parameter', kind: 'osc', ui: 'strip', addr: '/ParamValueSet', conf: 'verified', src: SRC.osc, row: 'block' },
    '/ParamValueSet [path, slot, 0, pid, value, -1]', 'writes the open block’s parameter live, one write per 40 ms, and nothing is saved until Save');
  add({ id: 'bypass', name: 'Block bypass', kind: 'osc', ui: 'chip', addr: '/BlockEnableSet', conf: 'verified', src: SRC.osc, row: 'block' },
    '/BlockEnableSet [path, slot, 0 | 1]', 'bypasses or enables that block of the loaded preset');
  add({ id: 'snapname', name: 'Rename snapshot', kind: 'osc', ui: 'snap', addr: '/SetSnapshotName', conf: 'verified', src: SRC.osc },
    '/SetSnapshotName [i, name]', 'renames snapshot i on the pedal, 16 characters at most; long-press a snapshot');
  add({ id: 'save', name: 'Save', kind: 'osc', ui: 'chip', addr: '/SavePresetWithCID', conf: 'verified', src: SRC.osc, destructive: true },
    '/SavePresetWithCID [cid, 0, 0]', 'overwrites the active preset on the pedal with the edit buffer, after Arm and a confirm sheet');
  add({ id: 'load', name: 'Load', kind: 'osc', ui: 'tile', addr: '/LoadPresetWithCID', conf: 'verified', src: SRC.osc, destructive: true },
    '/LoadPresetWithCID [cid]', 'loads that preset and discards unsaved edits on the pedal, after Arm and a confirm sheet; a pin with an editor id recalls this way when MIDI is absent');

  // ---- rows, chips -------------------------------------------------------------------------
  var ROWS = [
    { id: 'knobs14', name: 'Knobs 1–4', ctl: ['knob:0', 'knob:1', 'knob:2', 'knob:3'] },
    { id: 'knobs58', name: 'Knobs 5–8', ctl: ['knob:4', 'knob:5', 'knob:6', 'knob:7'] },
    { id: 'pedals', name: 'Pedals', ctl: ['exp:0', 'exp:1', 'xy'], chips: ['toe'] },
    { id: 'stomps', name: 'Stomps', dynamic: true },
    { id: 'block', name: 'Block', dynamic: true, needs: 'net' },
    { id: 'mix', name: 'Mixer', minFw: '1.4', dynamic: true }
  ];
  var CHIPS = ['tuner', 'toe', 'tap', 'click', 'muteall', 'looprec', 'loopover', 'loopplay', 'loopstop', 'looponce', 'loopundo'];

  // ---- the ONE wording table: regions first, then every control's sentence ----------
  var EXPLAIN = {
    page: 'Control a Line 6 Helix Stadium from soundLAB: over USB MIDI the presets, snapshots, knobs, pedals, looper and the Matrix mixer, and with the bridge on this computer (node tools/helix-bridge.js) the loaded preset block by block.',
    arm: 'Output starts disarmed; Arm opens a 90-second window that every command renews, and leaving the page, hiding the app or switching windows disarms it again — reads never need arming.',
    mode: 'Perform is the stage face; Edit folds out the six technical views — Rig, Blocks, Presets, Looper & Song, Mixer and a Monitor of every message in and out.',
    explain: 'Explain writes one line under every region saying exactly what it sends, on which channel and over which route.',
    routes: 'MIDI is the Helix’s own USB or 5-pin port, net is the bridge on this computer, USB editing needs firmware 1.4 on the pedal; tap a badge to connect, nothing connects by itself.',
    usb: 'USB editing needs firmware 1.4 on the pedal (it adds a USB network link that the bridge can use).',
    now: 'The preset the pedal is on, its snapshot, the firmware and the live routes; Prev and Next send CC 9 = 12 / 13 on the Global channel over MIDI, Pin saves an address without sending, Save is the pedal’s own /SavePresetWithCID over the bridge.',
    prov: 'Grey = what soundLAB sent, amber = the pedal’s MIDI echo (not proof it landed), green = read from the editor or its change stream over the bridge.',
    pin: 'Pin saves the loaded preset’s address (setlist, program, snapshot) on this device — nothing is sent.',
    snaps: 'Snapshots 1–8 send CC 69 = 0–7 on the Global channel over MIDI, or /activateSnapshot over the bridge when it is online; green means the pedal reported it, amber a MIDI echo, grey what was sent.',
    pins: 'A pin is an address on the pedal — setlist CC 32, then the Program Change 30 ms later, then snapshot CC 69 300 ms after that, on the Global channel over MIDI (or the editor id over the bridge); tap to recall, tap again to cancel, long-press to edit, and saving never sends.',
    strips: 'Tap or drag anywhere on a strip to send its CC on the Global channel over MIDI; drag off it for fine steps, arrows step by 1 (Shift 10), Home and End jump, a double-tap resets.',
    hero: 'The hero strip is the control you reach for most, EXP 1 (CC 1 on the Global channel over MIDI) unless you pick another.',
    rows: 'Knobs 1–4 and 5–8 are CC 38–45, Pedals are EXP 1 / EXP 2 / XY on CC 1 / 2 / 7 + 8, Stomps your own CCs on the Bypass/Control channel, Block the open block’s parameters over the bridge, Mixer the Matrix (firmware 1.4).',
    knobs14: 'Knobs 1–4: CC 38–41 on the Global channel over MIDI — whatever the Helix screen shows under them.',
    knobs58: 'Knobs 5–8: CC 42–45 on the Global channel over MIDI — whatever the Helix screen shows under them.',
    pedals: 'Pedals: EXP 1 is CC 1, EXP 2 is CC 2, the XY pad CC 7 across and CC 8 up, the toe switch CC 36 = 127, all on the Global channel over MIDI.',
    stomps: 'Stomps: the CC numbers you assigned on the Helix’s Bypass/Control screen, on the Bypass/Control channel over MIDI — soundLAB only knows what you typed.',
    block: 'Block: the open block’s first parameters as /ParamValueSet writes over the bridge, live, one per 40 ms; nothing is saved until Save.',
    mix: 'Mixer: Matrix level CC 11–29, pan 34–52, mute 57–75, solo 80–98 on the output layer’s channel over MIDI — needs firmware 1.4, so this row stays off until the pedal reports it.',
    chips: 'Chips are momentary: each sends one message on the Global channel over MIDI and flashes, never showing an “on” state; a ? marks a number the pedal has not confirmed, a greyed chip names the firmware it needs.'
  };
  CONTROLS.forEach(function (c) { EXPLAIN[c.id] = c.explain; });

  // ---- lookups -------------------------------------------------------------------------------
  var BY_ID = {};
  CONTROLS.forEach(function (c) { BY_ID[c.id] = c; });
  function byId(id) { return BY_ID[id] || null; }
  // what an observed CC is called (the deck's provenance rows and the Edit monitor)
  var CC_NAMES = { 1: 'EXP 1', 2: 'EXP 2', 7: 'XY across', 8: 'XY up', 9: 'Button', 10: 'Song cue', 32: 'Setlist', 36: 'Toe switch', 37: 'Footswitch mode', 46: 'Marker', 47: 'Return to zero', 48: 'Cycle', 49: 'Song prev/next', 50: 'Marker prev/next', 51: 'Play / Pause',
    52: 'Looper clear', 53: 'Looper undo', 54: 'Looper speed', 55: 'Looper direction', 58: 'Looper record', 59: 'Looper play', 60: 'Looper play once', 62: 'Looper block', 63: 'Playlist', 64: 'Tap tempo', 69: 'Snapshot', 103: 'Clear solos' };
  function ccName(n) { return CC_NAMES[n] || (n >= CC.KNOB1 && n < CC.KNOB1 + 8 ? 'Knob ' + (n - CC.KNOB1 + 1) : ''); }
  // the Matrix CC for a kind ('level' | 'pan' | 'mute' | 'solo') and a strip (index into MIX or its level CC)
  function mixCC(kind, strip) {
    var s = typeof strip === 'number' && strip < MIX.length ? MIX[strip] : null;
    if (!s) MIX.forEach(function (m) { if (m.level === strip) s = m; });
    return s && typeof s[kind] === 'number' ? s[kind] : null;
  }

  // ---- the help tour (js/help.js TOURS.helix): the old four stops' intent — the page,
  // arming, the six views (now behind Edit) and favorites (now pins) — plus the Now
  // bar, snapshots, strips and chips; every x is an EXPLAIN sentence
  var TOUR = [
    { t: 'Helix Stadium', k: 'page' },
    { sel: '#hx-armrow', t: 'Nothing sends until you arm', k: 'arm' },
    { sel: '#hxd-now', t: 'Now', k: 'now' },
    { sel: '#hxd-snaps', t: 'Snapshots', k: 'snaps' },
    { sel: '#hxd-pins', t: 'Pins', k: 'pins' },
    { sel: '#hxd-strips', t: 'Strips', k: 'strips' },
    { sel: '#hxd-chips', t: 'Chips', k: 'chips' },
    { sel: '#hxd-mode', t: 'Perform and Edit', k: 'mode' }
  ];
  function tour() {
    return TOUR.map(function (s) { var o = { t: s.t, x: EXPLAIN[s.k] }; if (s.sel) o.sel = s.sel; return o; });
  }

  var MAP = { v: 1, CONTROLS: CONTROLS, ROWS: ROWS, CHIPS: CHIPS, BUTTONS: BUTTONS, FSMODES: FSMODES, MIX: MIX, LAYERS: LAYERS, CATS: CATS, COLOURS: COLOURS, CC: CC, CC_NAMES: CC_NAMES, EXPLAIN: EXPLAIN,
    byId: byId, ccName: ccName, mixCC: mixCC, tour: tour };

  // ---- self-check: a control without its sentence or confidence fails at load ------------
  (function check() {
    var seen = {};
    CONTROLS.forEach(function (c) {
      if (!c.id || seen[c.id]) throw new Error('helix-map: duplicate or missing control id ' + c.id);
      seen[c.id] = 1;
      if (typeof c.explain !== 'string' || !c.explain) throw new Error('helix-map: ' + c.id + ' lacks explain');
      if (!CONF[c.conf]) throw new Error('helix-map: ' + c.id + ' lacks conf');
      if (EXPLAIN[c.id] !== c.explain) throw new Error('helix-map: EXPLAIN misses ' + c.id);
      if (c.kind === 'cc' && c.num !== null && (typeof c.num !== 'number' || c.num < 0 || c.num > 127)) throw new Error('helix-map: ' + c.id + ' has a bad CC number');
    });
    CHIPS.forEach(function (id) { if (!seen[id]) throw new Error('helix-map: chip ' + id + ' is not a control'); });
    ROWS.forEach(function (r) {
      if (!EXPLAIN[r.id]) throw new Error('helix-map: row ' + r.id + ' lacks explain');
      (r.ctl || []).concat(r.chips || []).forEach(function (id) { if (!seen[id]) throw new Error('helix-map: row ' + r.id + ' names unknown control ' + id); });
    });
    tour().forEach(function (s) { if (!s.t || !s.x) throw new Error('helix-map: tour step without text'); });
  })();

  root.SLHelixMap = MAP;
  if (typeof module !== 'undefined' && module.exports) module.exports = MAP;
})();
