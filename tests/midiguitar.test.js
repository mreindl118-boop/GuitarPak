// MIDI guitar (js/midiguitar.js + midi.js string-per-channel ingress) in a VM
// with a fake Rock Band 3 Squier on a fake UR24C MIDI port. No real devices.
const fs = require('fs'), path = require('path'), vm = require('vm');
let checks = 0;
function ok(value, message) { if (!value) throw new Error(message); checks++; console.log('  PASS', message); }
class Port {
  constructor(id, name) { this.id = id; this.name = name; this.state = 'connected'; this.sent = []; this.onmidimessage = null; }
  receive(bytes) { if (this.onmidimessage) this.onmidimessage({ data: bytes }); }
  send(bytes) { this.sent.push(Array.from(bytes)); }
}
function harness(values) {
  const events = [], bus = {}, timers = [];
  values = Object.assign({ 'midi.allIn.v1': true, 'midi.inputId': 'all', 'lights.on': false, 'lights.v1': true, 'lights.led': 'off' }, values || {});
  const ur = new Port('ur', 'Steinberg UR24C-1'), lumi = new Port('lumi', 'LUMI Keys BLOCK');
  const access = { inputs: new Map([['ur', ur], ['lumi', lumi]]), outputs: new Map(), sysexEnabled: true };
  const App = {
    store: { get: (k, d) => values[k] === undefined ? d : values[k], set: (k, v) => { values[k] = v; } },
    on: (n, fn) => { (bus[n] || (bus[n] = [])).push(fn); },
    emit: (n, d) => { events.push({ name: n, data: d }); for (const fn of bus[n] || []) fn(d); },
    help: { level: () => 0 }, colors: { forNote: () => '#ffaa22' },
    scaleLock: { on: false, contains: () => true }
  };
  const sandbox = { App, window: {}, navigator: { requestMIDIAccess: () => Promise.resolve(access) }, console,
    setInterval: () => 1, clearInterval: () => {},
    setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].live = false; } };
  vm.createContext(sandbox);
  for (const f of ['theory.js', 'note-palette.js', 'midi.js', 'midiguitar.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', f), 'utf8'), sandbox);
    if (f === 'theory.js') sandbox.Theory = sandbox.window.Theory;
  }
  return { App, values, ur, lumi, events, timers,
    notes: () => events.filter(e => e.name === 'midi:note').map(e => e.data),
    gnotes: () => events.filter(e => e.name === 'guitar:note').map(e => e.data),
    clear() { events.length = 0; },
    // run the ring timers that are still live and due within ms
    ring(ms) { timers.forEach(t => { if (t.live && t.ms <= ms) { t.live = false; t.fn(); } }); } };
}

(async () => {
  console.log('# no guitar chosen: keyboards keep their old behaviour');
  let h = harness();
  await h.App.midi.enable(); h.clear();
  h.ur.receive([0x90, 60, 90]); h.ur.receive([0x90, 60, 91]);
  ok(h.notes().filter(n => n.on).length === 2 && !h.notes().some(n => !n.on), 'a repeated Note On is not split while no MIDI guitar is set');
  ok(!h.gnotes().length, 'no guitar:note without a chosen guitar port');

  console.log('# the Squier on the UR24C, default layout (channel 1 = high E)');
  h = harness({ 'mg.port': 'Steinberg UR24C-1' });
  await h.App.midi.enable(); h.clear();
  h.ur.receive([0x95, 43, 100]); // channel 6 = low E, fret 3 = G2
  let g = h.gnotes()[0];
  ok(g && g.on && g.string === 6 && g.fret === 3 && g.valid, 'channel 6 note 43 = string 6 (low E) fret 3');
  h.ur.receive([0x90, 64, 80]);
  g = h.gnotes()[1];
  ok(g.string === 1 && g.fret === 0, 'channel 1 note 64 = high E open');
  ok(h.App.midiGuitar.held['6'].fret === 3 && h.App.midiGuitar.held['1'].fret === 0, 'held map knows both strings');

  console.log('# re-strum of the same fret (no Note Off between)');
  h.clear();
  h.ur.receive([0x95, 43, 110]);
  let n = h.notes();
  ok(n.length === 2 && !n[0].on && n[0].midi === 43 && n[1].on && n[1].midi === 43, 'a re-strum lets go first, then strikes again (quizzes hear it)');
  ok(h.App.midi.held.filter(m => m === 43).length === 1, 'held keeps one 43');

  console.log('# a new fret on the same string');
  h.clear();
  h.ur.receive([0x95, 45, 100]); // low E fret 5
  n = h.notes();
  ok(n.length === 2 && !n[0].on && n[0].midi === 43 && n[1].on && n[1].midi === 45, 'one string holds one note: the old fret lets go');
  ok(h.App.midiGuitar.held['6'].fret === 5, 'held moves to fret 5');
  h.ur.receive([0x85, 43, 0]);
  ok(!h.notes().slice(2).length, 'the late Note Off for a note already let go is dropped');

  console.log('# ring time');
  h.clear(); h.ring(3000);
  n = h.notes();
  ok(n.length === 2 && n.every(x => !x.on), 'after 3 s both strings let go by themselves');
  ok(!h.App.midi.held.length && !Object.keys(h.App.midiGuitar.held).length, 'nothing stays held');
  h.ur.receive([0x80, 64, 0]);
  ok(h.notes().length === 2, 'the real Note Off after ring time adds nothing');

  console.log('# other ports and channels are untouched');
  h.clear();
  h.lumi.receive([0x90, 60, 90]); h.lumi.receive([0x90, 60, 91]);
  ok(h.notes().filter(x => !x.on).length === 0 && !h.gnotes().length, 'the LUMI on the same app is not treated as a guitar');
  h.ur.receive([0x99, 36, 100]); h.ur.receive([0x99, 36, 100]);
  ok(!h.notes().some(x => !x.on && x.chan === 9) && !h.gnotes().some(x => x.chan === 9), 'channel 10 on the guitar port is not a string');

  console.log('# one-pluck set up');
  h = harness({ 'mg.port': 'Steinberg UR24C-1' });
  await h.App.midi.enable(); h.clear();
  ok(h.App.midiGuitar.setup() === true && h.App.midiGuitar.waiting, 'Set up listens');
  h.ur.receive([0x92, 52, 90]);
  ok(h.App.midiGuitar.waiting, 'a middle string does not finish set up');
  h.ur.receive([0x90, 52, 90]); // channel 1 open, octave up: guitar sends low E on ch 1, +1 octave
  ok(!h.App.midiGuitar.waiting && h.values['mg.layout'] === 'lo1' && h.values['mg.oct'] === 1, 'low E on channel 1 one octave up = layout lo1, octave +1');
  h.clear(); h.ur.receive([0x90, 57, 90]);
  const ons = () => h.gnotes().filter(x => x.on);
  ok(ons()[0].string === 6 && ons()[0].fret === 5, 'after set up: channel 1 note 57 = low E fret 5');
  h.ur.receive([0x95, 76, 90]);
  g = ons()[1];
  ok(g.string === 1 && g.fret === 0, 'and channel 6 note 76 = high E open');
  h.App.midiGuitar.setLayout('hi1');
  ok(h.App.midiGuitar.layout === 'hi1', 'the flip box writes back');

  console.log('# no ring release when the setting is "I move my finger"');
  h = harness({ 'mg.port': 'Steinberg UR24C-1', 'mg.ring': 0 });
  await h.App.midi.enable(); h.clear();
  h.ur.receive([0x93, 50, 90]);
  ok(!h.timers.some(t => t.live && t.ms === 3000), 'no ring timer');
  h.App.midiGuitar.setPort('');
  h.clear(); h.ur.receive([0x93, 50, 90]);
  ok(!h.gnotes().length, 'choosing No MIDI guitar turns it all off');

  console.log('# found by itself: one strum');
  h = harness();
  await h.App.midi.enable(); h.clear();
  h.lumi.receive([0x90, 60, 90]); h.lumi.receive([0x91, 64, 90]); h.lumi.receive([0x92, 67, 90]);
  ok(!h.values['mg.port'], 'a LUMI chord on three channels is never taken for a guitar');
  h.ur.receive([0x90, 60, 90]); h.ur.receive([0x90, 64, 90]);
  ok(!h.values['mg.port'], 'a keyboard on one channel is not a guitar');
  h.ur.receive([0x95, 40, 90]); h.ur.receive([0x94, 45, 90]); h.ur.receive([0x93, 50, 90]);
  ok(h.values['mg.port'] === 'Steinberg UR24C-1' && h.events.some(e => e.name === 'guitar:port' && e.data.auto), 'a strum across 3 strings picks the UR24C port by itself');
  h = harness({ 'mg.auto': false });
  await h.App.midi.enable();
  h.ur.receive([0x95, 40, 90]); h.ur.receive([0x94, 45, 90]); h.ur.receive([0x93, 50, 90]);
  ok(!h.values['mg.port'], 'after picking No MIDI guitar by hand it never picks one by itself');

  console.log('# string order by itself');
  h = harness({ 'mg.port': 'Steinberg UR24C-1' });
  await h.App.midi.enable(); h.clear();
  h.ur.receive([0x90, 43, 90]); // channel 1 playing 43: that is the low E string
  ok(h.values['mg.layout'] === 'lo1' && h.gnotes()[0].string === 6 && h.gnotes()[0].fret === 3, 'channel 1 below 63 flips to channel 1 = low E with no Set up');
  h.ur.receive([0x95, 66, 90]);
  ok(h.values['mg.layout'] === 'lo1' && h.gnotes().filter(x => x.on)[1].string === 1, 'channel 6 at 66 agrees: high E fret 2');
  h.App.midiGuitar.setLayout('hi1');
  h.ur.receive([0x90, 43, 90]);
  ok(h.values['mg.layout'] === 'hi1', 'a layout set by hand is never flipped by itself');

  console.log('ALL ' + checks + ' CHECKS PASS');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
