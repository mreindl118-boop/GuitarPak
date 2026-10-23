// Actual MIDI service in a VM; simulated Web/native ports and byte streams.
// Tests never request OS/device access. Logical raw frames are tapped once
// before input rules; stream fragments and embedded realtime are reconstructed.
const fs = require('fs'), path = require('path'), vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../js/midi.js'), 'utf8');
let checks = 0;
function ok(value, message) { if (!value) throw new Error(message); checks++; console.log('  PASS', message); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
class Port {
  constructor(id, name = 'Synth input') { this.id = id; this.name = name; this.state = 'connected'; this.sent = []; this.onmidimessage = null; }
  receive(bytes) { if (this.onmidimessage) this.onmidimessage({ data: bytes }); }
  send(bytes) { this.sent.push(Array.from(bytes)); }
}
function harness(native = false) {
  const events = [], bus = {}, posts = [], values = { 'midi.allIn.v1': true, 'midi.inputId': 'all', 'lights.on': false, 'lights.v1': true, 'lights.led': 'off' };
  const a = new Port('a', 'Identical synth'), b = new Port('b', 'Identical synth'), out = new Port('out', 'Sound output');
  const access = { inputs: new Map([['a', a], ['b', b]]), outputs: new Map([['out', out]]), sysexEnabled: true };
  const App = {
    store: { get: (k, d) => values[k] === undefined ? d : values[k], set: (k, v) => { values[k] = v; } },
    on: (n, fn) => { (bus[n] || (bus[n] = [])).push(fn); },
    emit: (n, d) => { events.push({ name: n, data: d }); for (const fn of bus[n] || []) fn(d); },
    help: { level: () => 0 }, colors: { forNote: () => '#ffaa22' },
    scaleLock: { on: false, contains: n => [0, 2, 4, 5, 7, 9, 11].includes(n % 12) }
  };
  const window = native ? { SoundLabMidi: { post: text => posts.push(JSON.parse(text)) } } : {};
  const sandbox = { App, window, navigator: { requestMIDIAccess: () => Promise.resolve(access) }, console,
    setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 1, clearTimeout: () => {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/theory.js'), 'utf8'), sandbox);
  sandbox.Theory = window.Theory;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/note-palette.js'), 'utf8'), sandbox);
  vm.runInContext(source, sandbox);
  async function enable() {
    await App.midi.enable();
    if (native) window.__glMIDI.onports({ inputs: [{ id: 1, name: a.name }, { id: 2, name: b.name }], outputs: [{ id: 3, name: out.name }] });
    events.length = 0; posts.length = 0;
  }
  return { App, midi: App.midi, window, a, b, out, access, events, posts, values, enable,
    recv(bytes, id = 'a') { if (native) window.__glMIDI.onmidi(id === 'a' ? 1 : id === 'b' ? 2 : id, bytes); else (id === 'a' ? a : b).receive(bytes); },
    raw: () => events.filter(e => e.name === 'midi:raw').map(e => ({ bytes: Array.from(e.data.bytes), id: e.data.portId, name: e.data.port })),
    notes: () => events.filter(e => e.name === 'midi:note').map(e => e.data),
    clear() { events.length = 0; out.sent.length = 0; posts.length = 0; } };
}

(async () => {
  for (const native of [false, true]) {
    const label = native ? 'native' : 'web', h = harness(native); await h.enable();
    const aid = native ? 1 : 'a', bid = native ? 2 : 'b';
    console.log('# ' + label + ': fragmented channel streams and realtime');
    h.recv([0x92, 60]);
    ok(!h.notes().length && !h.raw().length, label + ': incomplete frame produces neither a phantom attack nor duplicate raw grading');
    h.recv([0xf8, 91, 62, 0xfa]);
    ok(same(h.raw().map(x => x.bytes), [[0xf8], [0x92, 60, 91], [0xfa]]) && h.notes().length === 1, label + ': realtime inside note data is separated while pending running status survives');
    h.recv([0xfb, 87, 60, 0, 0x82, 62, 5]);
    ok(same(h.notes().map(n => [n.on, n.midi, n.vel, n.chan]), [[true, 60, 91, 2], [true, 62, 87, 2], [false, 60, 0, 2], [false, 62, 0, 2]]), label + ': packet-spanning running status and velocity-zero releases retain exact channel/pitch');
    ok(h.raw().filter(x => (x.bytes[0] & 0xf0) === 0x90).length === 3 && h.raw().every(x => x.id === aid && x.name === 'Identical synth'), label + ': one pre-rule raw frame per note with exact source ID and display name');
    ok(h.notes().every(n => n.vel >= 0 && n.vel <= 127), label + ': no realtime byte becomes an invalid velocity');
    h.clear(); h.recv([0xd4, 80, 81, 0xf8, 0xc2, 6, 7, 0x90, 60, 88]);
    ok(same(h.raw().map(x => x.bytes), [[0xd4, 80], [0xd4, 81], [0xf8], [0xc2, 6], [0xc2, 7], [0x90, 60, 88]]), label + ': one-data-byte pressure/program messages preserve their own running status lengths');
    ok(h.events.filter(e => e.name === 'midi:pressure').map(e => e.data.val).join() === '80,81' && h.notes().length === 1, label + ': channel pressure is dispatched without swallowing a following note status');
    h.recv([0x80, 60, 0]);
    h.clear(); h.recv([0x91, 64], 'a'); h.recv([0x95, 67], 'b'); h.recv([71], 'b'); h.recv([81], 'a');
    ok(same(h.notes().map(n => [n.portId, n.midi, n.vel, n.chan]), [[bid, 67, 71, 5], [aid, 64, 81, 1]]), label + ': simultaneous partial streams on identically named sources never share status/data');
    h.recv([0x81, 64, 0], 'a');
    ok(h.midi.held.join() === '67', label + ': releasing one source preserves another source’s held note');
    h.recv([0x85, 67, 0], 'b');
    h.clear(); h.recv([0x90, 60, 70], 'a'); h.recv([0x90, 60, 80], 'b'); h.recv([0x80, 60, 0], 'a');
    ok(h.midi.held.join() === '60', label + ': held summary retains equal pitches on another source/channel');

    console.log('# ' + label + ': system common, fragmented SysEx and malformed payloads');
    h.clear(); h.recv([0xf0, 0x00, 0x21, 0xf8]); h.recv([0x10, 0xf7, 0xf2, 1]); h.recv([0xfa, 2, 60, 90, 0xf6]);
    ok(same(h.raw().map(x => x.bytes), [[0xf8], [0xf0, 0, 0x21, 0x10, 0xf7], [0xfa], [0xf2, 1, 2], [0xf6]]), label + ': SysEx and system-common fragments finish once, with embedded realtime preserved separately');
    ok(!h.notes().length, label + ': system common cancels running status, so stray data cannot become notes');
    h.clear(); h.recv([0x90, 60, 0x91, 64, 80, 0xf4, 62, 80]);
    ok(h.notes().length === 1 && h.notes()[0].midi === 64 && h.notes()[0].chan === 1, label + ': a new status aborts an incomplete frame and undefined system status cannot generate a phantom note');
    h.clear(); h.recv([0xf0, 1, 2, 0x93, 65, 90]);
    ok(h.notes().length === 1 && h.notes()[0].midi === 65 && h.notes()[0].chan === 3 && !h.raw().some(x => x.bytes[0] === 0xf0), label + ': malformed unterminated SysEx resynchronizes at a channel status without leaking its data');
    h.clear(); h.recv([0x90, 60, NaN, 90, 0x90, 61, 300, 90, 0x90, 64, 88]);
    ok(h.notes().length === 1 && h.notes()[0].midi === 64 && h.notes()[0].vel === 88, label + ': invalid byte values abort pending messages instead of entering musical events');
    h.clear(); h.recv([0xf0].concat(new Array(65540).fill(1), [0xf8, 0xf7, 0x90, 69, 90]));
    ok(h.notes().length === 1 && h.notes()[0].midi === 69 && !h.raw().some(x => x.bytes[0] === 0xf0), label + ': oversized SysEx is bounded and safely discarded before subsequent valid notes');

    console.log('# ' + label + ': raw grading, rules and comprehensive sound guard');
    h.clear(); h.midi.setInputFilter(bytes => { bytes[1] += 1; return bytes; }); h.recv([0x90, 60, 87]);
    ok(h.raw()[0].bytes[1] === 60 && h.notes()[0].midi === 61, label + ': raw frame is immutable pre-rule input while app dispatch hears the changed pitch');
    h.midi.setInputFilter(() => null); h.recv([0x80, 60, 0]);
    ok(h.notes().at(-1).on === false && h.notes().at(-1).midi === 61 && !h.midi.held.includes(61), label + ': a changed/dropping rule cannot lose a previously delivered mapped note-off');
    h.midi.setInputFilter(() => [0x90, 60, 248]); h.clear(); h.recv([0x90, 64, 90]);
    ok(h.raw().length === 1 && !h.notes().length, label + ': malformed rule output cannot dispatch an invalid velocity');
    h.midi.setInputFilter(null); h.App.scaleLock.on = true;
    h.App.on('midi:raw', d => h.midi.send(d.bytes)); h.clear();
    for (let channel = 0; channel < 16; channel++) for (let note = 60; note < 72; note++) h.recv([0x90 | channel, note, 0xf8, 90, note, 0]);
    const ons = h.notes().filter(n => n.on), off = h.notes().filter(n => !n.on);
    ok(ons.length === 16 * 12 && off.length === ons.length && ons.filter(n => n.blocked && n.mute).length === 16 * 5, label + ': raw mistakes remain gradeable across every channel while blocked app sound is tagged mute');
    const sent = native ? h.posts.filter(p => p.cmd === 'send').map(p => p.data) : h.out.sent;
    const musicalOns = sent.filter(b => (b[0] & 0xf0) === 0x90 && b[2] > 0);
    ok(musicalOns.length === 16 * 7 && musicalOns.every(b => h.App.scaleLock.contains(b[1])), label + ': no disallowed note-on reaches the selected sound output, including packed realtime streams');
    ok(musicalOns.every(b => sent.some(o => ((o[0] & 0xf0) === 0x80 || (o[0] & 0xf0) === 0x90 && o[2] === 0) && (o[0] & 15) === (b[0] & 15) && o[1] === b[1])), label + ': every allowed channel/pitch retains its release at the selected output');
  }

  console.log('# selection/disconnect/replacement boundaries');
  {
    const h = harness(); await h.enable();
    h.recv([0x92, 60, 80, 64]);
    h.clear(); h.midi.setInput('b');
    ok(h.notes().length === 1 && !h.notes()[0].on && h.notes()[0].portId === 'a' && h.notes()[0].chan === 2 && !h.raw().length, 'selection change releases original source/channel in app without fabricating raw performance input');
    h.midi.setInput('a'); h.clear(); h.recv([91]);
    ok(!h.notes().length && !h.raw().length, 'returning to an input cannot finish a fragment from before the route change');
    h.recv([0x93, 62, 80, 65]); const staleHandler = h.a.onmidimessage;
    const replacement = new Port('a', 'Identical synth'); h.access.inputs.set('a', replacement); h.clear(); h.access.onstatechange();
    ok(h.notes().length === 1 && !h.notes()[0].on && h.notes()[0].midi === 62 && h.notes()[0].portId === 'a', 'same-ID replacement releases notes belonging to the original input object');
    h.clear(); replacement.receive([90]); staleHandler({ data: [0x90, 67, 90] });
    ok(!h.notes().length && !h.raw().length, 'replacement never inherits pending bytes and a stale saved input handler cannot feed the new route');
    replacement.receive([0x90, 64, 88]); h.clear(); replacement.state = 'disconnected'; h.access.onstatechange();
    ok(h.notes().length === 1 && !h.notes()[0].on && h.notes()[0].midi === 64 && !h.midi.held.length, 'disconnect clears held app notes without redirecting cleanup to another input');
  }
  {
    const h = harness(true); await h.enable(); h.recv([0x94, 65, 80, 67]); h.clear();
    h.window.__glMIDI.onports({ inputs: [{ id: 2, name: 'Identical synth' }], outputs: [{ id: 3, name: 'Sound output' }] });
    ok(h.notes().length === 1 && !h.notes()[0].on && h.notes()[0].portId === 1 && h.notes()[0].chan === 4, 'native inventory removal releases the original source/channel');
    h.clear(); h.window.__glMIDI.onmidi(2, [91]); h.window.__glMIDI.onmidi(99, [0x90, 60, 90]);
    ok(!h.notes().length && !h.raw().length, 'native unrelated/unknown sources cannot complete a removed input’s running-status fragment');
  }
  for (const native of [false, true]) {
    const h = harness(native); await h.enable();
    h.App.on('midi:raw', d => { if (d.bytes[0] === 0x90 && d.bytes[1] === 60) h.recv([0x92, 67, 80], 'b'); });
    h.recv([0x90, 60, 90], 'a');
    ok(same(h.notes().map(n => [n.portId, n.midi]), [[native ? 2 : 'b', 67], [native ? 1 : 'a', 60]]), (native ? 'native' : 'web') + ': nested raw subscribers preserve both original dispatch source identities');
  }
  {
    const h = harness(); await h.enable();
    h.recv([0x90, 60, 80]); h.midi.setInputFilter(bytes => (bytes[0] & 0xf0) === 0xb0 ? [0x91, 67, bytes[2]] : bytes);
    h.recv([0xb0, 60, 90]); h.recv([0x80, 60, 0]);
    ok(h.midi.held.join() === '67', 'a CC-to-note rule cannot overwrite a held physical note with the same controller number');
    h.recv([0xb0, 60, 0]);
    ok(!h.midi.held.length, 'converted controller release remains paired independently of the physical note route');
    h.midi.setInputFilter(null); h.clear(); h.recv([0x94, 69]); h.access.onstatechange(); h.recv([90]);
    ok(h.notes().length === 1 && h.notes()[0].midi === 69 && h.notes()[0].chan === 4, 'output-only Web inventory events preserve an unchanged input’s pending fragment');
  }
  console.log('ALL PASS (' + checks + ' checks)');
})().catch(error => { console.error(error); process.exitCode = 1; });
