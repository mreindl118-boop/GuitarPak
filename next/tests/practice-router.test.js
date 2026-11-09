// Standard-library VM simulation; no permissions, network or MIDI hardware.
// Feed the subscribed physical-input callback and inspect exact output bytes.
const fs = require('fs'), path = require('path'), vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../js/practice-router.js'), 'utf8');
let checks = 0;
function ok(value, message) { if (!value) throw new Error(message); checks++; console.log('  PASS', message); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function harness() {
  const bus = {}, win = {}, doc = {}, sent = [], mutes = [], events = [], values = { 'fb.root': 0, 'fb.scale': 'major' };
  let time = 0, listener = null, leased = 0, echoSend = null, failed = false;
  const inputs = [{ id: 'synth-in', name: 'Yamaha MODX' }, { id: 'other-in', name: 'Yamaha MODX' }, { id: 'lumi-in', name: 'LUMI Keys BLOCK' }];
  const outputs = [{ id: 'synth-out', name: 'Yamaha MODX' }, { id: 'other-out', name: 'Korg synth' }, { id: 'lumi-out', name: 'LUMI Keys BLOCK' }];
  const members = new Set([0, 2, 4, 5, 7, 9, 11]);
  const App = {
    store: { get: (key, def) => values[key] === undefined ? def : values[key] },
    on: (name, fn) => { (bus[name] || (bus[name] = [])).push(fn); },
    emit: (name, data) => { events.push({ name, data }); for (const fn of bus[name] || []) fn(data); },
    scaleLock: { on: true, contains: note => members.has(((note - values['fb.root']) % 12 + 12) % 12) },
    midi: {
      explicitPortsSupported: true, inputs, outputs,
      subscribeInput(id, fn) { listener = { id, fn }; return () => { listener = null; }; },
      sendToOutput(id, bytes) { sent.push({ id, bytes: Array.from(bytes) }); if (echoSend) echoSend(Array.from(bytes)); return !failed; },
      leaseKeybedOutput(id, owner) {
        const original = outputs.find(p => p.id === id), name = original && original.name;
        leased++;
        const release = options => { leased--; events.push({ name: 'lease-release', options }); return true; };
        release.send = bytes => outputs.find(p => p.id === id) === original && original.name === name && App.midi.sendToOutput(id, bytes);
        return release;
      },
      mute(owner, on) { mutes.push({ owner, on }); }
    }
  };
  const document = { hidden: false, addEventListener: (name, fn) => { doc[name] = fn; } };
  const window = { addEventListener: (name, fn) => { win[name] = fn; } };
  vm.runInNewContext(source, { App, window, document, performance: { now: () => time }, console });
  function recv(bytes, id = 'synth-in') { if (listener) listener.fn({ bytes, portId: id }); }
  return { App, route: App.practiceRouter, inputs, outputs, values, sent, mutes, events, members,
    recv, win, doc, document, advance: ms => { time += ms; }, echo: fn => { echoSend = fn; },
    fail: on => { failed = on; }, leased: () => leased, subscribed: () => !!listener,
    start: extra => App.practiceRouter.start(Object.assign({ inputId: 'synth-in', outputId: 'synth-out', displayOutputId: 'lumi-out', localControlOff: true }, extra)) };
}

console.log('# explicit routes and prerequisites');
{
  const h = harness();
  ok(!h.start({ localControlOff: false }) && !h.sent.length, 'Local Control OFF acknowledgement required; rejected startup sends nothing');
  h.values['midihub.thru'] = true;
  ok(!h.start() && !h.sent.length && /MIDI Hub Thru off/.test(h.route.state.reason), 'saved legacy Thru must be switched off before ownership can transfer');
  h.values['midihub.thru'] = false;
  for (const name of ['LUMI Keys', 'ROLI synth', 'MODX virtual', 'MODX LUMI', 'Helix Stadium', 'loopMIDI synth', 'Microsoft GS Wavetable Synth']) {
    ok(!h.route.validPort('outputs', { id: 'test', name }), 'excluded sound destination: ' + name);
  }
  ok(!h.start({ outputId: 'lumi-out' }) && !h.sent.length, 'LUMI display cannot become synth sound output');
  ok(!h.start({ displayOutputId: 'synth-out' }) && !h.sent.length, 'same display/sound output rejected');
  h.App.midi.outputId = 'synth-out'; h.App.midi.lightsOn = true;
  ok(!h.start() && !h.sent.length, 'synth sound output cannot share an active key-light painter');
  h.App.midi.lightsOn = false;
  h.App.midi.explicitPortsSupported = false;
  ok(!h.start() && !h.sent.length, 'native/unsupported independent routing rejected');
  h.App.midi.explicitPortsSupported = true;
  ok(h.start() && h.route.active && h.leased() === 1 && !h.sent.length, 'explicit start subscribes and leases sound keybed without sending notes');
  ok(h.mutes.some(m => m.owner === 'practice-router' && m.on), 'app piano voice is muted while synth route owns sound');
  h.recv([0x90, 60, 80], 'other-in');
  ok(!h.sent.length, 'identically named unselected input cannot reach sound output');
  h.route.stop();
  ok(!h.route.active && !h.subscribed() && h.leased() === 0 && h.mutes.at(-1).on === false, 'stop unsubscribes, releases lease and app mute owner');
  ok(h.events.some(e => e.name === 'lease-release' && e.options.restore === false), 'sound cleanup never restores a shared key-light Note On frame');
}

console.log('# chromatic blocking, original pitches and channel pairing');
{
  const h = harness(); h.start();
  for (let c = 0; c < 16; c++) for (let n = 60; n < 72; n++) {
    h.advance(50); h.recv([0x90 | c, n, 91]); h.recv([0x80 | c, n, 31]);
  }
  const ons = h.sent.filter(s => (s.bytes[0] & 0xf0) === 0x90 && s.bytes[2] > 0);
  const offs = h.sent.filter(s => (s.bytes[0] & 0xf0) === 0x80);
  ok(ons.length === 7 * 16 && offs.length === ons.length, 'all 16 channels forward seven allowed pitches and their corresponding offs');
  ok(ons.every(s => h.members.has(s.bytes[1] % 12) && s.bytes[2] === 91 && s.id === 'synth-out'), 'every sound note-on is in C major, unchanged velocity/pitch and exact sound destination');
  ok(ons.every((s, i) => same(offs[i].bytes, [0x80 | (s.bytes[0] & 15), s.bytes[1], 31])), 'physical note-off channel/pitch/release velocity preserved');
  ok(h.route.state.blocked === 5 * 16 && h.route.state.forwarded === 7 * 16, 'blocked pitches counted without quantization or substitute notes');
  h.recv([0x91, 60, 70]); h.recv([0x92, 60, 90]);
  const from = h.sent.length;
  h.recv([0x91, 60, 0]);
  ok(h.route.state.held === 1 && same(h.sent[from].bytes, [0x91, 60, 0]), 'velocity-zero Note On releases only its own MPE channel');
  h.recv([0x82, 60, 0]);
  ok(h.route.state.held === 0, 'other MPE channel remains independently paired until its off');
  const before = h.sent.length;
  h.recv([0x90, 61, 0]); h.recv([0x80, 61, 0]);
  ok(h.sent.length === before, 'unsent/blocked note offs never touch other voices');
  h.route.stop();
}

console.log('# packed, fragmented and realtime-interrupted input');
{
  const h = harness(); h.start();
  for (let channel = 0; channel < 16; channel++) {
    h.advance(50);
    h.recv([0x90 | channel, 60, 0xf8]); // partial note plus clock
    h.recv([81, 61, 90, 62, 0xfe]); // allowed, blocked, then partial running note
    h.recv([82]);
    h.recv([0xb0 | channel, 64]); h.recv([0xf8, 127]);
    h.recv([0x80 | channel, 60, 31, 0xfa, 62]); h.recv([40]);
    h.recv([0xb0 | channel, 64, 0xf8]); h.recv([0]);
  }
  const ons = h.sent.filter(s => (s.bytes[0] & 0xf0) === 0x90);
  const offs = h.sent.filter(s => (s.bytes[0] & 0xf0) === 0x80);
  ok(h.route.active && ons.length === 32 && offs.length === 32 && h.route.state.held === 0,
    'all 16 channels retain allowed on/off pairs across packed chunks, fragments and interleaved realtime');
  ok(ons.every(s => [60, 62].includes(s.bytes[1])) && h.route.state.blocked === 16 && h.route.state.forwarded === 32,
    'running-status disallowed note-ons never reach the selected sound output on any channel');
  ok(ons.every(s => offs.some(o => o.bytes[0] === (0x80 | (s.bytes[0] & 15)) && o.bytes[1] === s.bytes[1] && o.bytes[2] === (s.bytes[1] === 60 ? 31 : 40))),
    'fragmented running-status releases preserve each original channel, pitch and release velocity');
  const pedals = h.sent.filter(s => (s.bytes[0] & 0xf0) === 0xb0);
  ok(pedals.length === 32 && pedals.every((s, i) => s.bytes[1] === 64 && s.bytes[2] === (i % 2 === 0 ? 127 : 0)),
    'fragmented sustain down/up remains paired after physical notes have released');
  const before = h.sent.length;
  h.recv([0x9f, 64]); h.recv([0xf8, 100, 64]); h.recv([0xfe, 0]);
  ok(same(h.sent.slice(before).map(s => s.bytes), [[0x9f, 64, 100], [0x9f, 64, 0]]) && h.route.state.held === 0,
    'velocity-zero running status releases an allowed MPE-channel note even when its bytes are split');
  h.route.stop();
}
{
  const h = harness(); h.start();
  h.recv([0x93, 67, 80, 0xd3]); h.recv([20, 0xf8, 21, 0xa3, 67]); h.recv([22]);
  ok(h.sent.some(s => same(s.bytes, [0xd3, 20])) && h.sent.some(s => same(s.bytes, [0xd3, 21])) && h.sent.some(s => same(s.bytes, [0xa3, 67, 22])),
    'two-byte running channel pressure and three-byte poly pressure decode without changing allowed voices');
  const before = h.sent.length;
  h.recv([0xc3, 20, 21, 0xe3, 0, 70, 0xb3, 1, 80, 0xf2, 1, 2, 0xf8]);
  ok(h.sent.length === before, 'packed program, bend, unrelated controllers, system common and realtime are not mirrored');
  h.recv([0x83, 67]); h.recv([0xfe, 42]);
  ok(same(h.sent.at(-1).bytes, [0x83, 67, 42]), 'an allowed off still decodes after ignored packed nonmusical messages');
  h.recv([0x90, 60, 90]);
  const held = h.sent.length;
  h.recv([0x90, 62, 0xf0, 1, 2, 0xf8]); h.recv([3, 0xf7, 62, 80]);
  ok(h.sent.length === held && h.route.state.held === 1, 'SysEx cancels pending and running status without inventing an attack from its payload');
  h.recv([0x80, 60, 29]);
  ok(same(h.sent.at(-1).bytes, [0x80, 60, 29]) && h.route.state.held === 0, 'explicit allowed off following SysEx is never dropped');
  h.recv([0x90, 62, NaN, 62, 90]);
  ok(h.route.state.held === 0, 'invalid data resets pending status instead of inventing an allowed note');
  h.recv([0x90, 64]); h.recv([0xf1, 0, 64, 90]);
  ok(h.route.state.held === 0, 'system-common status cancels a pending channel attack and running status');
  h.recv([0x90, 60]); h.route.stop(); h.start(); const restarted = h.sent.length;
  h.recv([80, 60, 0]);
  ok(h.sent.length === restarted && h.route.state.held === 0, 'stop/restart discards incomplete messages and previous running status');
  h.recv([0x90, 60]); h.App.emit('midi:state', {}); h.start(); const reconnected = h.sent.length;
  h.recv([80]);
  ok(h.sent.length === reconnected, 'inventory/disconnect boundary resets a partial input before a new route starts');
  h.recv([0x90, 60, 80]); h.recv(new Array(16385).fill(0xf8));
  ok(!h.route.active && h.sent.some(s => same(s.bytes, [0x80, 60, 0])), 'oversized input disarms with original-voice cleanup instead of processing an unbounded chunk');
}

console.log('# root/scale changes and original-output cleanup');
{
  const h = harness(); h.start(); h.recv([0x93, 60, 99]); h.recv([0xb3, 64, 127]);
  h.values['fb.root'] = 1; h.App.emit('fb:scale', { root: 1, scale: 'major' });
  ok(!h.route.active && h.route.state.held === 0, 'root change disarms route and clears held ledger');
  ok(h.sent.some(s => same(s.bytes, [0x83, 60, 0])) && h.sent.some(s => same(s.bytes, [0xb3, 64, 0])), 'prior allowed note and sustain released even though C is now outside selected scale');
  ok(h.sent.every(s => s.id === 'synth-out'), 'scale cleanup remains on exact original sound destination');
  h.start({ outputId: 'other-out' }); h.recv([0x94, 61, 76]); h.route.stop();
  ok(h.sent.filter(s => s.bytes[1] === 61).every(s => s.id === 'other-out'), 'new routing cannot redirect old note-offs to a different output');
  h.start(); h.recv([0x95, 61, 88]); h.App.emit('midi:state', { outputName: 'changed' });
  ok(!h.route.active && h.sent.some(s => same(s.bytes, [0x85, 61, 0])), 'MIDI inventory/routing changes release original held note and never auto-rearm');
}

console.log('# one shared lock toggle');
{
  const h = harness(); h.App.scaleLock.on = false; h.start();
  h.recv([0x90, 61, 80]);
  ok(h.sent.some(s => same(s.bytes, [0x90, 61, 80])) && /Scale lock is off/.test(h.route.state.reason), 'master lock off passes original out-of-scale pitch with an explicit unlocked status');
  h.App.scaleLock.on = true; h.App.emit('scale:lock', { on: true });
  ok(!h.route.active && h.sent.some(s => same(s.bytes, [0x80, 61, 0])), 'turning master lock on flushes an existing out-of-scale held note');
  h.start(); const from = h.sent.length; h.recv([0x90, 61, 80]); h.recv([0x80, 61, 0]);
  ok(h.sent.length === from && h.route.state.blocked === 1, 'same route follows master lock on without a second routing-specific lock mode');
  h.App.scaleLock.on = false; h.App.emit('scale:lock', { on: false });
  ok(!h.route.active, 'turning master lock off stops and clears the prior route state before restart');
}

console.log('# sustain, pressure and excluded writes');
{
  const h = harness(); h.start(); h.recv([0x96, 64, 95]);
  h.recv([0xb6, 64, 127]); h.recv([0x86, 64, 0]);
  ok(h.route.state.held === 0 && h.sent.some(s => same(s.bytes, [0xb6, 64, 127])), 'sustain can retain a released allowed note until pedal up');
  const n = h.sent.length; h.recv([0xb6, 64, 0]);
  ok(h.sent.length === n + 1 && same(h.sent.at(-1).bytes, [0xb6, 64, 0]), 'pedal-up forwards even with no physically held notes');
  h.recv([0x97, 67, 84]); h.recv([0xa7, 67, 40]); h.recv([0xd7, 50]);
  ok(h.sent.some(s => same(s.bytes, [0xa7, 67, 40])) && h.sent.some(s => same(s.bytes, [0xd7, 50])), 'poly/channel pressure keeps original allowed MPE note/channel');
  const before = h.sent.length;
  [[0xa7, 66, 40], [0xe7, 0, 100], [0xb7, 7, 1], [0xc7, 4], [0xf0, 1, 0xf7], [0xf8], [0xff], [0x90, 200, 10], [0x90, 60], [0x90, 60, 200]].forEach(b => h.recv(b));
  ok(h.sent.length === before, 'no disallowed-key pressure, bend, patch/program/other CC/SysEx/realtime or malformed writes');
  h.route.stop();
  const reset = h.sent.filter(s => (s.bytes[0] & 0xf0) === 0xb0 && s.bytes[1] === 64 && s.bytes[2] === 0);
  ok(reset.every(s => [6, 7].includes(s.bytes[0] & 15)) && reset.some(s => s.bytes[0] === 0xb7), 'stop clears sustain only on channels used by this route');
}

console.log('# lifecycle, replacement and failed cleanup');
for (const boundary of ['blur', 'pagehide', 'hidden', 'disconnect', 'rename', 'replacement', 'failure']) {
  const h = harness(); h.start(); h.recv([0x98, 60, 80]);
  if (boundary === 'blur' || boundary === 'pagehide') h.win[boundary]();
  if (boundary === 'hidden') { h.document.hidden = true; h.doc.visibilitychange(); }
  if (boundary === 'disconnect') { h.outputs.splice(0, 1); h.App.emit('midi:state', {}); }
  if (boundary === 'rename') { h.outputs[0].name = 'LUMI synth'; h.recv([0x80, 60, 0]); }
  if (boundary === 'replacement') { h.outputs[0] = { id: 'synth-out', name: 'Yamaha MODX' }; h.App.emit('midi:state', {}); }
  if (boundary === 'failure') { h.fail(true); h.recv([0x98, 62, 80]); }
  ok(!h.route.active && !h.subscribed() && h.leased() === 0, boundary + ' disarms, unsubscribes and releases sound-output ownership');
  if (['disconnect', 'rename', 'replacement', 'failure'].includes(boundary)) {
    ok(h.route.state.cleanupFailed && /could not be confirmed/.test(h.route.state.reason), boundary + ' reports uncertain old-device cleanup explicitly');
    h.route.stop('Stopped again.');
    ok(h.route.state.cleanupFailed && /could not be confirmed/.test(h.route.state.reason), boundary + ' uncertainty is preserved across repeated Stop');
  } else ok(h.sent.some(s => same(s.bytes, [0x88, 60, 0])), boundary + ' sends original-channel held-note off');
  if (boundary === 'rename') ok(h.sent.length === 1, 'same-ID wrong-role replacement receives no cleanup writes');
  if (boundary === 'replacement') ok(h.sent.length === 1, 'same-ID same-name replacement receives no old-voice cleanup writes');
}

console.log('# echo and flood guards');
{
  const h = harness(); h.start(); h.echo(b => h.recv(b));
  h.recv([0x90, 60, 80]); h.recv([0x80, 60, 0]);
  ok(h.route.active && h.sent.length === 2, 'synchronous feedback cannot recursively retransmit note on/off');
  h.echo(null); h.advance(60); h.recv([0x90, 62, 80]);
  h.advance(5); h.recv([0x90, 62, 80]); h.recv([0x80, 62, 0]);
  const n = h.sent.length;
  h.advance(50); h.recv([0x90, 62, 80]); h.recv([0x80, 62, 0]);
  ok(h.sent.length === n + 2, 'short delayed echo is swallowed while later legitimate retrigger still forwards');
  const rapid = h.sent.length;
  [80, 81, 80, 80].forEach(v => { h.recv([0x91, 64, v]); h.recv([0x81, 64, 0]); });
  ok(h.sent.length === rapid + 8 && h.route.state.held === 0, 'sub-40ms same/changed-velocity retriggers preserve every allowed on/off pair');
  for (let i = 0; i < 1002; i++) h.recv([0xb0, 64, 0]);
  ok(!h.route.active && /Excessive/.test(h.route.state.reason), 'excessive input/loop disarms instead of indefinite forwarding');
}

// Structural integration assertion: the real Hub's raw forwarding is guarded.
const hub = fs.readFileSync(path.join(__dirname, '../js/midihub.js'), 'utf8');
ok(/!\(App\.practiceRouter && App\.practiceRouter\.active\) && g\('thru'/.test(hub), 'legacy Hub Thru cannot duplicate/bypass the active explicit practice route');
console.log('ALL PASS (' + checks + ' checks; cloud simulation only)');
