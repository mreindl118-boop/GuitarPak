// Independent routing recovered from b8ccb55's midi-ports suite, adapted to
// main's multi-input, app-sound and scale-lock service. Node VM + EventTarget
// ports only: these checks never request browser permissions or use hardware.
const fs = require('fs'), path = require('path'), vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../js/midi.js'), 'utf8');
const theorySource = fs.readFileSync(path.join(__dirname, '../js/theory.js'), 'utf8');
let checks = 0;
function ok(value, message) { if (!value) throw new Error(message); checks++; console.log('  PASS', message); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

class MidiPort extends EventTarget {
  constructor(id, name) {
    super(); this.id = id; this.name = name; this.state = 'connected';
    this.onmidimessage = null; this.sent = []; this.fail = false;
  }
  receive(bytes) {
    const event = new Event('midimessage');
    Object.defineProperty(event, 'data', { value: new Uint8Array(bytes) });
    if (typeof this.onmidimessage === 'function') this.onmidimessage(event);
    this.dispatchEvent(event);
  }
  send(bytes) { if (this.fail) throw new Error('port unavailable'); this.sent.push(Array.from(bytes)); }
}

function harness(options = {}) {
  const values = Object.assign({ 'lights.on': false, 'lights.v1': true, 'midi.allIn.v1': true }, options.seed);
  const events = [], bus = {}, posts = [], requests = [], timers = new Set();
  const input1 = new MidiPort('in1', 'Yamaha MODX'), input2 = new MidiPort('in2', 'LUMI Keys BLOCK');
  const output1 = new MidiPort('out1', 'Yamaha MODX'), output2 = new MidiPort('out2', 'LUMI Keys BLOCK');
  const gone = new MidiPort('gone', 'Disconnected'); gone.state = 'disconnected';
  const access = { inputs: new Map([['in1', input1], ['in2', input2], ['gone', gone]]),
    outputs: new Map([['out1', output1], ['out2', output2], ['gone', gone]]), sysexEnabled: !options.fallback };
  let helpLevel = 4;
  const App = {
    store: { get: (key, def) => values[key] === undefined ? def : values[key], set: (key, value) => { values[key] = value; } },
    on: (name, fn) => { (bus[name] || (bus[name] = [])).push(fn); },
    emit: (name, data) => { events.push({ name, data }); for (const fn of bus[name] || []) fn(data); },
    help: { level: () => helpLevel }, colors: {
      forNote: n => window.SLNotePalette.sample(n, values['fb.root'] || 0, 'interval', ['#ffab47','#e8d44d','#7ad97a','#4cc9b0','#6ea8fe','#b48ef0','#ff85b3'], []).color,
      lumiVelocity: n => window.SLNotePalette.nearest(App.colors.forNote(n))
    },
    scaleLock: { on: false, allows: () => true,
      contains: n => [0, 2, 4, 5, 7, 9, 11].includes(((n - (values['fb.root'] || 0)) % 12 + 12) % 12) }
  };
  const navigator = options.unsupported ? {} : { requestMIDIAccess: request => {
    requests.push(request);
    return options.fallback && request && request.sysex ? Promise.reject(new Error('SysEx declined')) : Promise.resolve(access);
  } };
  const window = {};
  if (options.native) window.SoundLabMidi = { post: text => posts.push(JSON.parse(text)) };
  const sandbox = { App, window, navigator, console,
    setTimeout: (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; },
    clearTimeout: t => { clearTimeout(t); timers.delete(t); },
    setInterval: (fn, ms) => { const t = setInterval(fn, ms); timers.add(t); return t; },
    clearInterval: t => { clearInterval(t); timers.delete(t); }
  };
  vm.createContext(sandbox); vm.runInContext(theorySource, sandbox);
  sandbox.Theory = window.Theory; vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/note-palette.js'), 'utf8'), sandbox); vm.runInContext(source, sandbox);
  return { midi: App.midi, App, window, values, events, posts, requests, access, input1, input2, output1, output2, gone,
    setHelp: n => { helpLevel = n; App.emit('help:level', n); },
    close: () => { for (const t of timers) { clearTimeout(t); clearInterval(t); } timers.clear(); } };
}

// Frame-specific tests deliberately configure the master display. Broad MIDI
// tests keep the legacy defaults to detect unrelated behavior changes.
function configureDisplay(h) {
  h.midi.setDisplayOutput('out2');
  h.midi.setDisplayEnabled(true);
}

(async function () {
  const contexts = [];
  function create(options) { const h = harness(options); contexts.push(h); return h; }
  try {
    console.log('# exact additive Web MIDI subscriptions');
    const unavailable = create({ unsupported: true });
    ok(!unavailable.midi.explicitPortsSupported && unavailable.midi.subscribeInput('in1', () => {}) === null,
      'unsupported environment advertises and rejects independent input');
    ok(!unavailable.midi.sendToOutput('out1', [0xf8]) && unavailable.midi.leaseKeybedOutput('out1', 'practice') === null,
      'unsupported independent output and lease never fall back');
    const h = create({ fallback: true, seed: { 'midi.inputId': 'in1', 'midi.outputId': 'out1' } });
    ok(!h.midi.explicitPortsSupported && h.midi.subscribeInput('in1', () => {}) === null,
      'independent ports remain unavailable before enable');
    await h.midi.enable();
    ok(h.requests.length === 2 && h.requests[0].sysex === true && h.requests[1] === undefined && !h.midi.sysexOk,
      'declined SysEx still permits independent ordinary Web MIDI');
    const mainHandler = h.input1.onmidimessage, selections = [h.midi.inputId, h.midi.outputId];
    const received = [], second = [];
    const off = h.midi.subscribeInput('in2', data => { received.push({ portId: data.portId, bytes: data.bytes.slice() }); data.bytes[1] = 1; });
    const offSecond = h.midi.subscribeInput('in2', data => second.push(data.bytes));
    h.events.length = 0; h.input2.receive([0x91, 61, 90]);
    ok(typeof off === 'function' && same(received, [{ portId: 'in2', bytes: [0x91, 61, 90] }]) && same(second, [[0x91, 61, 90]]),
      'exact subscribers receive independent raw copies with source ID');
    ok(!h.events.some(e => ['midi:note', 'note:input', 'midi:raw'].includes(e.name)),
      'observing an unselected input cannot feed shared note or Thru events');
    ok(mainHandler === h.input1.onmidimessage && same(selections, [h.midi.inputId, h.midi.outputId]),
      'additive subscription leaves shared handlers and selected ports intact');
    h.midi.setInput('in2'); h.midi.setInputFilter(bytes => { bytes[1] = 72; return bytes; });
    h.events.length = 0; h.input2.receive([0x92, 62, 70]);
    ok(second[1][1] === 62 && received[1].bytes[1] === 62 && h.events.find(e => e.name === 'midi:note').data.midi === 72,
      'raw subscribers coexist with the selected port and its mutating shared input filter');
    off(); off(); offSecond(); h.input2.receive([0x80, 62, 0]);
    ok(received.length === 2 && second.length === 2, 'unsubscribe is idempotent and removes only independent observers');
    ok(h.midi.subscribeInput('missing', () => {}) === null && h.midi.subscribeInput('gone', () => {}) === null && h.midi.subscribeInput('in1', null) === null,
      'missing, disconnected or invalid independent subscriptions reject explicitly');
    const identityBefore = h.midi.inputFingerprint('in2'), allIdentityBefore = h.midi.inputFingerprint('all');
    h.access.onstatechange();
    ok(h.midi.inputFingerprint('in2') === identityBefore && h.midi.inputFingerprint('all') === allIdentityBefore, 'output-only inventory notifications preserve input object fingerprints');
    const oldPort = h.input2, stale = [];
    const offStale = h.midi.subscribeInput('in2', data => stale.push(data));
    h.access.inputs.set('in2', new MidiPort('in2', 'Replacement LUMI'));
    oldPort.receive([0x90, 64, 80]); offStale();
    ok(h.midi.inputFingerprint('in2') !== identityBefore && h.midi.inputFingerprint('all') !== allIdentityBefore, 'same-ID input object replacement changes exact and All-input fingerprints');
    ok(stale.length === 0, 'replaced input objects cannot deliver stale independent answers');

    console.log('# existing all-keyboard, scale-lock and app-sound behavior');
    const all = create(); await all.midi.enable();
    ok(all.midi.inputId === 'all' && all.midi.inputsHeard.length === 2, 'all connected keyboards remain the default shared input');
    all.midi.setAppSound(false); all.events.length = 0;
    all.input1.receive([0x91, 60, 100]); all.input2.receive([0x92, 64, 90]);
    const notes = all.events.filter(e => e.name === 'midi:note' && e.data.on).map(e => e.data);
    ok(notes.length === 2 && notes.every(d => d.mute === true) && notes.map(d => d.port).join('|') === 'Yamaha MODX|LUMI Keys BLOCK',
      'both shared inputs retain source names and app-sound mute tags');
    ok(notes.map(d => d.portId).join('|') === 'in1|in2', 'shared notes identify each exact input ID alongside its display name');
    const raw = []; const offRaw = all.midi.subscribeInput('in1', d => raw.push(d.bytes));
    all.App.scaleLock.on = true; all.events.length = 0; all.input1.receive([0x90, 61, 100]);
    const blockedInput = all.events.find(e => e.name === 'midi:note' && e.data.on);
    ok(raw.length === 1 && raw[0][1] === 61 && blockedInput && blockedInput.data.blocked === true && blockedInput.data.mute === true,
      'independent answers and shared graders see exact forbidden notes while blocked/mute tags suppress sound');
    ok(all.events.find(e => e.name === 'midi:raw').data.portId === 'in1', 'raw shared input reports its exact source ID without changing independent subscription data');
    offRaw();

    console.log('# exact output has no selected-port or native fallback');
    h.output2.name = 'Other synth'; // this exercises musical routing, not the separately gated display
    h.events.length = 0; h.output1.sent.length = h.output2.sent.length = 0;
    const saved = [h.values['midi.inputId'], h.values['midi.outputId']];
    ok(h.midi.sendToOutput('out2', new Uint8Array([0x90, 60, 80])) && h.output1.sent.length === 0 && same(h.output2.sent, [[0x90, 60, 80]]),
      'explicit send reaches only the exact named output');
    ok(same(saved, [h.values['midi.inputId'], h.values['midi.outputId']]) && h.events.length === 1 && h.events[0].name === 'midi:out' && h.events[0].data.portId === 'out2',
      'successful exact send emits the monitor event without persistence or note events');
    const count = h.output1.sent.length + h.output2.sent.length;
    ok(!h.midi.sendToOutput('missing', [0x90, 60, 80]) && !h.midi.sendToOutput('gone', [0xf8]) && !h.midi.sendToOutput('', [0xf8]) && h.output1.sent.length + h.output2.sent.length === count,
      'missing, disconnected and empty output choices never fall back');
    h.output2.fail = true;
    ok(!h.midi.sendToOutput('out2', [0xf8]) && h.events.length === 1, 'failed exact send does not emit a successful monitor event');
    h.output2.fail = false;
    const n = create({ native: true }); await n.midi.enable();
    n.window.__glMIDI.onports({ inputs: [{ id: 1, name: 'MODX' }], outputs: [{ id: 2, name: 'LUMI' }] });
    const before = n.posts.length;
    ok(!n.midi.explicitPortsSupported && n.midi.subscribeInput(1, () => {}) === null && !n.midi.sendToOutput(2, [0xf8]) && n.midi.leaseKeybedOutput(2, 'practice') === null && n.posts.length === before,
      'native bridge rejects independent routes and leases without hardware sends');
    ok(n.midi.send([0xf8]) && n.posts.length === before + 1, 'the native selected-output service remains available');

    console.log('# pinned generic lease writes cannot move held notes to a new device');
    const pinned = create({ seed: { 'midi.outputId': 'out1' } }); await pinned.midi.enable();
    const pinnedLease = pinned.midi.leaseKeybedOutput('out1', 'sound-router');
    ok(typeof pinnedLease.send === 'function' && pinnedLease.send([0x93, 60, 110]) && same(pinned.output1.sent, [[0x93, 60, 110]]) && pinned.output2.sent.length === 0,
      'a generic synth lease sends notes only to its original exact output');
    ok(pinnedLease.send([0x83, 60, 0]) && same(pinned.output1.sent[1], [0x83, 60, 0]),
      'a generic lease permits the sound owner to release its own original-channel note');
    pinnedLease(); const afterPinnedRelease = pinned.output1.sent.length;
    ok(!pinnedLease.send([0x93, 62, 100]) && !pinnedLease.send([0x83, 60, 0]) && pinned.output1.sent.length === afterPinnedRelease,
      'released lease rejects new notes and cleanup writes');
    const changingLease = pinned.midi.leaseKeybedOutput('out1', 'sound-router');
    ok(changingLease.send([0x91, 64, 90]), 'a held sound note can precede a device inventory change');
    const sameNameReplacement = new MidiPort('out1', pinned.output1.name), oldWriteCount = pinned.output1.sent.length;
    pinned.access.outputs.set('out1', sameNameReplacement); pinned.access.onstatechange();
    ok(!changingLease.send([0x81, 64, 0]) && !changingLease.send([0x91, 64, 90]) && sameNameReplacement.sent.length === 0 && pinned.output1.sent.length === oldWriteCount,
      'same-ID same-name replacement receives neither old-note cleanup nor new notes from the stale lease');
    changingLease();
    const renamingLease = pinned.midi.leaseKeybedOutput('out1', 'sound-router'); sameNameReplacement.name = 'Different synth';
    ok(!renamingLease.send([0x90, 60, 100]) && sameNameReplacement.sent.length === 0,
      'pinned generic send rejects a renamed original port object');
    renamingLease();

    console.log('# bound musical callbacks pin controllers and cleanup to the original route');
    const bound = create({ seed: { 'fb.root': 0, 'midi.outputId': 'out1' } }); bound.output2.name = 'Second synth'; await bound.midi.enable();
    const boundSend = bound.midi.bindMusicalOutput();
    ok(typeof boundSend === 'function' && boundSend([0xb4, 1, 90]), 'binding without an ID captures the current selected synth output');
    bound.output1.sent.length = bound.output2.sent.length = 0; bound.midi.setOutput('out2');
    ok(boundSend([0xb4, 1, 0]) && same(bound.output1.sent, [[0xb4, 1, 0]]) && bound.output2.sent.length === 0,
      'a later selected-output switch does not redirect a bound controller cleanup callback');
    const boundReplacement = new MidiPort('out1', bound.output1.name); bound.access.outputs.set('out1', boundReplacement);
    ok(!boundSend([0xb4, 1, 0]) && boundReplacement.sent.length === 0,
      'a bound callback rejects same-ID same-name replacement rather than sending old controller cleanup there');
    const boundExact = bound.midi.bindMusicalOutput('out2'); bound.output2.name = 'Renamed synth';
    ok(!boundExact([0xb4, 1, 0]) && bound.midi.bindMusicalOutput('missing') === null,
      'bound exact routes reject renamed objects and missing IDs without fallback');
    bound.output2.name = 'Second synth'; const gatedBound = bound.midi.bindMusicalOutput('out2'); bound.App.scaleLock.on = true;
    ok(!gatedBound([0x90, 61, 100]) && gatedBound([0x90, 60, 100]), 'bound musical callbacks obey the same scale lock as every public output');
    bound.output2.sent.length = 0; bound.midi.flushMusicalOutputs('bound-cleanup');
    ok(bound.output2.sent.some(b => same(b, [0x80, 60, 0])), 'bound notes participate in exact-output musical cleanup');

    console.log('# sound-route release may suppress automatic shared layout restoration');
    const noRestore = create({ seed: { 'lights.on': true, 'fb.root': 0, 'fb.scale': 'major', 'midi.outputId': 'out2' } });
    await noRestore.midi.enable();
    configureDisplay(noRestore);
    const noRestoreSettings = JSON.stringify(noRestore.values), noRestoreLease = noRestore.midi.leaseKeybedOutput('out2', 'sound-router');
    ok(noRestoreLease.frame({ target: [60], channel: 4 }), 'a matching selected-output lease may hold an instructional frame before cleanup');
    noRestore.output2.sent.length = 0;
    ok(noRestoreLease({ restore: false }) && same(noRestore.output2.sent, [[0x84, 60, 0]]) && JSON.stringify(noRestore.values) === noRestoreSettings,
      'restore:false clears the original frame and releases ownership without NoteOn, SysEx, or settings changes');
    noRestore.midi.repaint();
    ok(noRestore.output2.sent.some(b => b[0] === 0x90), 'an explicit later repaint resumes shared lighting after restore:false cleanup');

    console.log('# scoped keybed lease prevents competing LED owners');
    const lights = create({ seed: { 'lights.on': true, 'fb.root': 0, 'fb.scale': 'major', 'midi.outputId': 'out2' } });
    await lights.midi.enable();
    ok(lights.output2.sent.some(b => b[0] === 0x90), 'shared LUMI keybed initially paints its normal scale');
    const settings = JSON.stringify(lights.values), release = lights.midi.leaseKeybedOutput('out2', 'lumipractice');
    ok(typeof release === 'function' && lights.output2.sent.some(b => b[0] === 0x80), 'lease acquisition releases the previously lit shared notes');
    ok(lights.midi.leaseKeybedOutput('out2', 'other') === null && lights.midi.leaseKeybedOutput('gone', 'other') === null && lights.midi.leaseKeybedOutput('out1', '') === null,
      'duplicate, disconnected and ownerless leases reject');
    lights.output2.sent.length = 0;
    lights.midi.guide(62, null); lights.midi.repaint(); lights.setHelp(2);
    lights.midi.light(64, 100); lights.midi.dark(64); lights.App.emit('colors');
    ok(lights.output2.sent.length === 0, 'shared guides, repaint, manual lights and colors stay silent on the leased output');
    ok(lights.midi.sendToOutput('out2', [0x90, 60, 80]) && lights.output2.sent.length === 1,
      'explicit page output still works while its shared keybed is suspended');
    release(); const restored = lights.output2.sent.length; release();
    ok(restored > 1 && lights.output2.sent.length === restored && JSON.stringify(lights.values) === settings,
      'release restores the current shared layout once without changing preferences');
    const releaseOther = lights.midi.leaseKeybedOutput('out1', 'other'); lights.output2.sent.length = 0;
    lights.midi.guide(65, null);
    ok(typeof releaseOther === 'function' && lights.output2.sent.some(b => b[0] === 0x90), 'leasing another output does not suspend the selected LUMI keybed');
    releaseOther();
    lights.midi.claim('pads');
    ok(lights.midi.leaseKeybedOutput('out2', 'practice') === null, 'an existing page claim cannot be displaced by an exact-output lease');
    lights.midi.release('pads');
    const releaseReplace = lights.midi.leaseKeybedOutput('out2', 'practice');
    const replacement = new MidiPort('out2', 'Replacement LUMI Keys BLOCK');
    lights.access.outputs.set('out2', replacement); lights.access.onstatechange(); lights.midi.repaint();
    ok(replacement.sent.length === 0, 'replacement of a leased port stays suspended until the page explicitly releases');
    releaseReplace();
    ok(replacement.sent.length === 0, 'cleanup never replays a released lease onto a replacement port object');
    lights.midi.repaint();
    ok(replacement.sent.some(b => b[0] === 0x90), 'a later explicit repaint can resume the existing shared keybed baseline');
    const releaseRenamed = lights.midi.leaseKeybedOutput('out2', 'practice');
    replacement.sent.length = 0; replacement.name = 'Yamaha MODX';
    lights.access.onstatechange(); lights.midi.repaint(); releaseRenamed();
    ok(replacement.sent.length === 0, 'cleanup does not replay key lights when the same output object changes device name');

    console.log('# semantic LUMI frames keep target and answer states distinct');
    const frames = create({ seed: { 'fb.root': 0, 'fb.scale': 'major', 'midi.outputId': 'out1' } });
    await frames.midi.enable();
    configureDisplay(frames); frames.output1.sent.length = frames.output2.sent.length = 0;
    const frameLease = frames.midi.leaseKeybedOutput('out2', 'instruction');
    frames.output2.sent.length = 0; // acquisition first clears the configured base-scale layer
    ok(typeof frameLease.frame === 'function' && typeof frameLease.clear === 'function', 'a live lease exposes semantic frame and clear methods');
    ok(frameLease.frame({ target: [60, 64, 67], correct: [], wrong: [], channel: 0 }), 'a target triad frame paints successfully');
    const targetMessages = frames.output2.sent.slice(), targetColor = targetMessages[0][2];
    ok(targetMessages.length === 3 && targetMessages.every(b => b[0] === 0x90 && b[2] === frames.App.colors.lumiVelocity(b[1])),
      'target frames use the same supported pitch-color mapping as the screen');
    frames.output2.sent.length = 0;
    ok(frameLease.frame({ target: [60, 64, 67], correct: [64, 67], wrong: [67], channel: 0 }), 'answer feedback updates a target frame');
    const feedback = frames.output2.sent.slice();
    ok(feedback.length === 0,
      'correct/wrong semantic feedback preserves each pitch hue without redundant writes');
    frames.output2.sent.length = 0;
    ok(frameLease.frame({ target: [60, 64, 67], correct: [64, 67], wrong: [67], channel: 0 }) && frames.output2.sent.length === 0,
      'an identical semantic frame sends no duplicate note messages');
    ok(frameLease.frame({ target: [60], correct: [], wrong: [], channel: 2 }), 'a later frame may change the display channel');
    const moved = frames.output2.sent.slice();
    ok(same(moved.filter(b => b[0] === 0x80).map(b => b[1]).sort((a, b) => a - b), [60, 64, 67]) && moved.filter(b => b[0] === 0x92).length === 1,
      'channel changes release every old note on its original channel before painting the new one');
    frames.output2.sent.length = 0;
    ok(frameLease.clear() && same(frames.output2.sent, [[0x82, 60, 0]]), 'clear releases the tracked note on its original display channel');
    const afterClear = frames.output2.sent.length;
    ok(frameLease.clear() && frames.output2.sent.length === afterClear, 'clearing an empty semantic frame is idempotent');
    frames.output2.sent.length = 0;
    ok(frameLease.frame({ target: [62], correct: [], wrong: [], channel: 1 }), 'a cleared live lease can display a later target');
    frames.output2.sent.length = 0; frameLease({ restore: false });
    ok(same(frames.output2.sent, [[0x81, 62, 0]]) && !frameLease.frame({ target: [64], channel: 0 }),
      'releasing a lease clears its semantic notes and prevents subsequent frames');
    ok(frames.output1.sent.length === 0 && frames.output2.sent.every(b => b.length === 3 && [0x80, 0x90].includes(b[0] & 0xf0)),
      'semantic frames contain only ordinary note messages on their exact output');
    for (const [label, invalid] of [
      ['high note', { target: [128], channel: 0 }], ['negative note', { target: [-1], channel: 0 }],
      ['fractional note', { target: [60.5], channel: 0 }], ['high channel', { target: [60], channel: 16 }],
      ['fractional channel', { target: [60], channel: 0.5 }]
    ]) {
      const invalidLease = frames.midi.leaseKeybedOutput('out2', 'invalid-' + label);
      frames.output2.sent.length = 0;
      ok(!invalidLease.frame(invalid) && frames.output2.sent.length === 0 && !invalidLease.frame({ target: [60], channel: 0 }),
        label + ' fails closed and requires a new lease before further output');
      invalidLease();
    }
    const wrongRoleLease = frames.midi.leaseKeybedOutput('out1', 'wrong-role');
    ok(!wrongRoleLease.frame({ target: [60], channel: 0 }) && frames.output1.sent.length === 0,
      'semantic LUMI frames reject a non-LUMI output despite a valid generic lease');
    wrongRoleLease();
    const renamedLease = frames.midi.leaseKeybedOutput('out2', 'renamed'); frames.output2.sent.length = 0;
    frames.output2.name = 'Yamaha MODX';
    ok(!renamedLease.frame({ target: [60], channel: 0 }) && frames.output2.sent.length === 0,
      'semantic frames reject an output renamed after acquisition');
    renamedLease(); frames.output2.name = 'LUMI Keys BLOCK';
    const staleLease = frames.midi.leaseKeybedOutput('out2', 'stale'), newOutput = new MidiPort('out2', 'LUMI Keys BLOCK');
    frames.access.outputs.set('out2', newOutput);
    ok(!staleLease.frame({ target: [60], channel: 0 }) && newOutput.sent.length === 0,
      'semantic frames cannot transfer their route to a same-ID replacement');
    staleLease();
    const failingLease = frames.midi.leaseKeybedOutput('out2', 'failed-send');
    const originalSend = newOutput.send.bind(newOutput); let sendAttempt = 0;
    newOutput.send = bytes => { if (++sendAttempt === 2) throw new Error('one-shot send failure'); originalSend(bytes); };
    ok(!failingLease.frame({ target: [60, 64, 67], channel: 0 }) && same(newOutput.sent, [[0x90, 60, targetColor], [0x80, 60, 0]]),
      'a partial frame send fails closed and releases the notes already sent without broad panic');
    failingLease();

    console.log('# failed frame cleanup retains uncertainty and original-channel retry');
    const failedOff = create({ seed: { 'lights.on': true, 'fb.root': 0, 'fb.scale': 'major', 'midi.outputId': 'out2' } });
    await failedOff.midi.enable();
    configureDisplay(failedOff);
    const failedOffLease = failedOff.midi.leaseKeybedOutput('out2', 'failed-noteoff');
    ok(failedOffLease.frame({ target: [60], channel: 3 }), 'a frame can be active before its device begins rejecting releases');
    failedOff.output2.sent.length = 0;
    const sendNormally = failedOff.output2.send.bind(failedOff.output2); let rejectedOffs = 0;
    failedOff.output2.send = bytes => { if ((bytes[0] & 0xf0) === 0x80) { rejectedOffs++; throw new Error('noteoff rejected'); } sendNormally(bytes); };
    ok(!failedOffLease.clear() && !failedOffLease() && rejectedOffs === 2 && failedOff.output2.sent.length === 0,
      'failed clear remains tracked for release retry and prevents shared-layout replay');
    ok(!failedOffLease() && rejectedOffs === 2 && failedOff.output2.sent.length === 0,
      'repeating release reports the failed outcome instead of false success');
    failedOff.output2.send = sendNormally;
    ok(failedOffLease.clear() && same(failedOff.output2.sent, [[0x83, 60, 0]]),
      'explicit cleanup retry retains the original failed note and channel');
    ok(!failedOffLease(), 'a later successful cleanup does not rewrite the previously reported release failure');

    console.log('# every public musical output obeys scale lock while note releases remain free');
    const gate = create({ seed: { 'fb.root': 0, 'fb.scale': 'major', 'midi.outputId': 'out1' } });
    await gate.midi.enable(); gate.App.scaleLock.on = true;
    const musicalLease = gate.midi.leaseKeybedOutput('out1', 'musical-gate'); gate.events.length = 0;
    const senders = [
      ['send', b => gate.midi.send(b)], ['sendTo', b => gate.midi.sendTo('out1', b)],
      ['sendToOutput', b => gate.midi.sendToOutput('out1', b)], ['lease.send', b => musicalLease.send(b)]
    ];
    for (const [name, send] of senders) {
      gate.output1.sent.length = 0; gate.events.length = 0;
      ok(send([0x93, 61, 100]) === false && gate.output1.sent.length === 0 && !gate.events.some(e => e.name === 'midi:out'),
        name + ' blocks an out-of-scale NoteOn without a successful output event');
      ok(send([0x93, 60, 100]) && send([0x83, 60, 0]) && send([0x83, 61, 0]) && send([0x93, 61, 0]),
        name + ' permits in-scale MPE notes and all NoteOff/velocity-zero releases');
      ok(!send([0xe3, 0, 80]) && send([0xe3, 0, 64]), name + ' blocks non-center pitch bend under scale lock while allowing bend reset');
    }
    ok(gate.midi.send([0xb3, 64, 127]) && gate.midi.send([0xb3, 64, 0]), 'scale lock leaves sustain control available on the original channel');
    gate.output1.sent.length = 0; gate.events.length = 0;
    ok(gate.midi.send([0x90, 60, 100, 0x91, 61, 100]) && gate.midi.send([0x90, 60, 100, 61, 100]) &&
      same(gate.output1.sent, [[0x90, 60, 100], [0x90, 60, 100]]) && gate.events.filter(e => e.name === 'midi:out').every(e => same(e.data.bytes, [0x90, 60, 100])),
      'packed and running-status packets keep allowed notes while removing every forbidden pitch');
    musicalLease({ restore: false }); gate.midi.flushMusicalOutputs('test-gate-cleanup');
    const bends = create({ seed: { 'midi.outputId': 'out1' } }); bends.output2.name = 'Second synth'; await bends.midi.enable();
    ok(bends.midi.send([0xe5, 0, 96]) && bends.midi.sendToOutput('out2', [0xe7, 0, 32]), 'unlocked pitch bends may reach separate exact synth outputs without held notes');
    bends.output1.sent.length = bends.output2.sent.length = 0; bends.midi.flushMusicalOutputs('bend-only');
    ok(same(bends.output1.sent, [[0xe5, 0, 64]]) && same(bends.output2.sent, [[0xe7, 0, 64]]),
      'bend-only musical cleanup centers the original channel on each exact output');

    console.log('# instructional LED feedback bypasses the musical note gate');
    const visual = create({ seed: { 'fb.root': 0, 'fb.scale': 'major', 'midi.outputId': 'out2' } });
    await visual.midi.enable(); configureDisplay(visual); visual.App.scaleLock.on = true;
    const visualLease = visual.midi.leaseKeybedOutput('out2', 'locked-feedback'); visual.output2.sent.length = 0;
    ok(visualLease.frame({ target: [60], wrong: [61], channel: 0 }) && visual.output2.sent.some(b => b[0] === 0x90 && b[1] === 61 && b[2] === visual.App.colors.lumiVelocity(61)),
      'a wrong C-sharp keeps its mapped pitch hue under C-major scale lock; semantic feedback stays separate');
    visual.output2.sent.length = 0; visual.midi.flushMusicalOutputs('visual-only');
    ok(visual.output2.sent.length === 0, 'the musical ledger does not mistake semantic LED frame notes for audible notes');
    visualLease({ restore: false }); visual.output2.sent.length = 0;
    visual.midi.light(61, 80); visual.midi.dark(61);
    ok(same(visual.output2.sent, [[0x90, 61, 80], [0x80, 61, 0]]), 'private shared-keybed lighting bypasses the musical gate and still clears its note');
    const synthVisual = create({ seed: { 'fb.root': 0, 'fb.scale': 'major', 'midi.outputId': 'out1' } });
    await synthVisual.midi.enable(); synthVisual.App.scaleLock.on = true; synthVisual.events.length = 0;
    synthVisual.midi.light(61, 80);
    ok(synthVisual.output1.sent.length === 0 && !synthVisual.events.some(e => e.name === 'midi:out'),
      'generic lighting aimed at a sounding synth cannot bypass the scale lock');
    synthVisual.midi.light(60, 80); synthVisual.output1.sent.length = 0; synthVisual.midi.flushMusicalOutputs('synth-visual-cleanup');
    ok(synthVisual.output1.sent.some(b => same(b, [0x80, 60, 0])) && synthVisual.output1.sent.some(b => same(b, [0xb0, 64, 0])),
      'an allowed generic-light note on a synth belongs to the musical cleanup ledger');
    const mixedVisual = create({ seed: { 'fb.root': 0, 'midi.outputId': 'out1' } }); mixedVisual.output1.name = 'LUMI MODX';
    await mixedVisual.midi.enable(); mixedVisual.App.scaleLock.on = true; mixedVisual.output1.sent.length = 0;
    mixedVisual.midi.light(61, 80);
    ok(mixedVisual.output1.sent.length === 0, 'a mixed LUMI/synth device name does not qualify for the private visual exemption');

    console.log('# context and route changes release exact musical notes and sustain');
    for (const event of ['fb:set', 'fb:scale', 'scale:lock']) {
      const change = create({ seed: { 'fb.root': 0, 'fb.scale': 'major', 'midi.outputId': 'out1' } }); await change.midi.enable();
      change.output2.name = 'Second synth';
      change.App.scaleLock.on = true;
      change.midi.send([0x91, 60, 100]); change.midi.send([0xb1, 64, 127]); change.midi.sendToOutput('out2', [0x95, 67, 100]);
      change.output1.sent.length = change.output2.sent.length = 0;
      change.values['fb.root'] = 2; if (event === 'scale:lock') change.App.scaleLock.on = true;
      change.App.emit(event, { root: 2, scale: 'major', on: true });
      ok(change.output1.sent.some(b => same(b, [0x81, 60, 0])) && change.output1.sent.some(b => same(b, [0xb1, 64, 0])) &&
        change.output2.sent.some(b => same(b, [0x85, 67, 0])) && change.output2.sent.some(b => same(b, [0xb5, 64, 0])),
        event + ' flushes every used exact output and original MPE channel');
      ok(change.midi.send([0x81, 60, 0]) && change.midi.send([0x91, 60, 0]), event + ' still permits later physical releases after the ledger flush');
    }
    const toggled = create({ seed: { 'fb.root': 0, 'fb.scale': 'major', 'midi.outputId': 'out1' } }); await toggled.midi.enable();
    toggled.midi.send([0x96, 61, 100]); toggled.output1.sent.length = 0;
    toggled.values['fb.root'] = 2; toggled.App.emit('fb:set', { root: 2, scale: 'major' });
    ok(toggled.output1.sent.length === 0, 'ordinary key changes keep musical output sounding while scale lock remains off');
    toggled.App.scaleLock.on = true; toggled.App.emit('scale:lock', { on: true });
    ok(toggled.output1.sent.some(b => same(b, [0x86, 61, 0])) && toggled.output1.sent.some(b => same(b, [0xb6, 64, 0])),
      'enabling scale lock releases a previously sounding chromatic note and its original-channel sustain');
    const toggledCount = toggled.output1.sent.length; toggled.App.emit('fb:set', { root: 2, scale: 'major' }); toggled.App.emit('scale:lock', { on: true });
    ok(toggled.output1.sent.length === toggledCount, 'duplicate notifications for the same lock/key boundary do not repeat musical cleanup');
    const ledger = create({ seed: { 'midi.outputId': 'out1' } }); ledger.output2.name = 'Second synth'; await ledger.midi.enable();
    const unusedOutput = new MidiPort('unused', 'Unused synth'); ledger.access.outputs.set('unused', unusedOutput);
    ledger.midi.send([0x93, 60, 100]); ledger.midi.send([0xb3, 64, 127]); ledger.midi.sendToOutput('out2', [0x97, 64, 90]);
    ledger.output1.sent.length = ledger.output2.sent.length = 0; ledger.midi.flushMusicalOutputs('explicit');
    ok(ledger.output1.sent.some(b => same(b, [0x83, 60, 0])) && ledger.output1.sent.some(b => same(b, [0xb3, 64, 0])) &&
      ledger.output2.sent.some(b => same(b, [0x87, 64, 0])) && ledger.output2.sent.some(b => same(b, [0xb7, 64, 0])) && unusedOutput.sent.length === 0,
      'explicit flush releases tracked notes and sustain only on previously used outputs/channels');
    ok([...ledger.output1.sent, ...ledger.output2.sent].every(b => b[0] < 0xf0 && ((b[0] & 0xf0) === 0x80 || ((b[0] & 0xf0) === 0xb0 && b[1] === 64 && b[2] === 0))),
      'musical flush sends no panic, program, SysEx, unrelated notes or unrelated controllers');
    const once = ledger.output1.sent.length + ledger.output2.sent.length; ledger.midi.flushMusicalOutputs('again');
    ok(ledger.output1.sent.length + ledger.output2.sent.length === once, 'a completed musical flush is idempotent');
    ledger.midi.send([0x92, 62, 100]); ledger.output1.sent.length = ledger.output2.sent.length = 0;
    ledger.midi.setOutput('out2');
    ok(ledger.output1.sent.some(b => same(b, [0x82, 62, 0])) && !ledger.output2.sent.some(b => b[0] < 0xf0),
      'selected output changes release the previous route before adopting the next output');
    ledger.midi.sendToOutput('out1', [0x94, 64, 100]); const ledgerReplacement = new MidiPort('out1', ledger.output1.name);
    ledger.access.outputs.set('out1', ledgerReplacement); ledger.midi.flushMusicalOutputs('replacement');
    ok(ledgerReplacement.sent.length === 0, 'musical cleanup never transfers old held notes to a same-ID same-name replacement');

    console.log('# native musical flush uses the original selected bridge route');
    const nativeGate = create({ native: true, seed: { 'fb.root': 0 } }); await nativeGate.midi.enable();
    nativeGate.window.__glMIDI.onports({ inputs: [{ id: 1, name: 'MODX' }], outputs: [{ id: 2, name: 'MODX' }, { id: 3, name: 'Other synth' }] });
    nativeGate.App.scaleLock.on = true; nativeGate.posts.length = 0;
    ok(nativeGate.midi.send([0x91, 61, 100]) === false && nativeGate.posts.length === 0, 'native selected-output NoteOn obeys the same central scale gate');
    nativeGate.midi.send([0x92, 60, 100]); nativeGate.midi.send([0xb2, 64, 127]); nativeGate.posts.length = 0;
    nativeGate.midi.setOutput(3);
    const switchedAt = nativeGate.posts.findIndex(p => p.cmd === 'setOutput' && p.id === 3);
    ok(switchedAt >= 0 && nativeGate.posts.slice(0, switchedAt).some(p => p.cmd === 'send' && same(p.data, [0x82, 60, 0])) &&
      nativeGate.posts.slice(0, switchedAt).some(p => p.cmd === 'send' && same(p.data, [0xb2, 64, 0])),
      'native route switch sends tracked note and sustain release before selecting a new device ID');
    nativeGate.posts.length = 0; nativeGate.midi.light(61, 80);
    ok(nativeGate.posts.length === 0, 'native generic synth lighting also obeys the central scale lock');
    nativeGate.midi.light(60, 80); nativeGate.posts.length = 0; nativeGate.midi.flushMusicalOutputs('native-generic-light');
    ok(nativeGate.posts.some(p => p.cmd === 'send' && same(p.data, [0x80, 60, 0])),
      'native generic synth lighting participates in musical note cleanup');

    console.log('# persistent master LUMI Display owns all visual output independently of sound');
    const master = create({ seed: { 'lights.on': true, 'fb.root': 0, 'fb.scale': 'major', 'midi.outputId': 'out2' } });
    await master.midi.enable(); configureDisplay(master);
    const enabledState = master.midi.displayState;
    ok(master.midi.displayEnabled === true && enabledState.enabled && enabledState.configured && enabledState.connected && enabledState.outputId === 'out2',
      'master display status identifies the explicitly configured connected LUMI');
    const otherLumi = new MidiPort('other-lumi', 'Other LUMI Keys BLOCK'); master.access.outputs.set('other-lumi', otherLumi);
    const otherDisplayLease = master.midi.leaseKeybedOutput('other-lumi', 'unconfigured-display');
    ok(!otherDisplayLease.frame({ target: [60], channel: 0 }) && otherLumi.sent.length === 0,
      'a second known LUMI cannot receive frames until that exact output is configured');
    otherDisplayLease({ restore: false });
    master.setHelp(0); master.output2.sent.length = 0; master.midi.repaint();
    ok(master.output2.sent.some(b => b[0] === 0x90), 'explicit display On keeps the base scale visible at every Help level');
    function replayLights(messages) { const lit = {}; messages.forEach(b => { if ((b[0] & 0xf0) === 0x90 && b[2] > 0) lit[b[1]] = b[2]; else if ((b[0] & 0xf0) === 0x80 || ((b[0] & 0xf0) === 0x90 && b[2] === 0)) delete lit[b[1]]; }); return lit; }
    master.midi.setDisplay(false); master.midi.guide(62, 64);
    const helpZeroGuide = Object.keys(replayLights(master.output2.sent)).map(Number).sort((a, b) => a - b);
    ok(same(helpZeroGuide, [62, 64]), 'explicit master On shows only now/next targets at Help0 even with guide-color style Off');
    master.midi.setDisplayEnabled(false); master.output2.sent.length = 0; master.midi.setDisplayEnabled(true);
    const resumedGuide = Object.keys(replayLights(master.output2.sent)).map(Number).sort((a, b) => a - b);
    ok(same(resumedGuide, [62, 64]), 'master Off then On resumes the stored current guide without restoring the full scale');
    master.midi.guide(null, null);
    const displayLease = master.midi.leaseKeybedOutput('out2', 'master-display');
    const soundLease = master.midi.leaseKeybedOutput('out1', 'independent-sound');
    ok(displayLease.frame({ target: [60], channel: 0 }) && soundLease.send([0x92, 64, 100]), 'display frames and independent synth sound may hold separate exact routes');
    master.output1.sent.length = master.output2.sent.length = 0; master.midi.setDisplayEnabled(false);
    ok(master.midi.displayEnabled === false && master.values['lights.displayEnabled'] === false && master.midi.displayState.enabled === false &&
      master.output2.sent.some(b => same(b, [0x80, 60, 0])) && master.output1.sent.length === 0,
      'master Off persists, releases display notes, and leaves the sound route untouched');
    master.output2.sent.length = 0;
    const frameWhileOff = displayLease.frame({ target: [62], wrong: [61], channel: 0 });
    master.midi.repaint(); master.midi.guide(62, 64); master.midi.light(61, 80); master.App.emit('colors');
    ok(!frameWhileOff && !master.output2.sent.some(b => (b[0] & 0xf0) === 0x90 && b[2] > 0),
      'master Off blocks every later LUMI NoteOn from frames, guides, repaint and pad-style light calls');
    ok(!master.midi.sendToOutput('out2', [0x90, 60, 80]) && !master.output2.sent.some(b => (b[0] & 0xf0) === 0x90 && b[2] > 0),
      'public musical labels cannot bypass master Off to send a known-LUMI NoteOn');
    ok(soundLease.send([0x92, 65, 90]) && master.output1.sent.some(b => same(b, [0x92, 65, 90])),
      'the existing independent synth lease keeps sending sound while LUMI Display is Off');
    soundLease.send([0x82, 64, 0]); soundLease.send([0x82, 65, 0]); soundLease({ restore: false });
    master.midi.guide(null, null);
    const noDevice = create({ unsupported: true });
    noDevice.midi.setDisplayEnabled(true);
    const absent = noDevice.midi.displayState;
    ok(!absent.connected && !absent.configured && typeof absent.reason === 'string' && absent.reason.length > 0 && noDevice.requests.length === 0 && noDevice.output1.sent.length === 0 && noDevice.output2.sent.length === 0,
      'enabling without a configured connected device reports the reason and never requests MIDI permission or sends');
    const legacyDisplay = create({ seed: { 'lights.on': true, 'fb.root': 0, 'fb.scale': 'major', 'midi.outputId': 'out2' } });
    await legacyDisplay.midi.enable(); legacyDisplay.setHelp(0); legacyDisplay.output2.sent.length = 0; legacyDisplay.midi.repaint();
    ok(legacyDisplay.midi.displayEnabled && legacyDisplay.values['lights.displayEnabled'] === undefined && !legacyDisplay.output2.sent.some(b => (b[0] & 0xf0) === 0x90 && b[2] > 0),
      'without an explicit master preference the legacy display keeps its Help-level behavior');
    console.log('ALL PASS (' + checks + ' checks)');
  } finally { contexts.forEach(h => h.close()); }
})().catch(error => { console.error('FAIL', error.stack); process.exitCode = 1; });
