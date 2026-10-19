// No browser, permissions or hardware: exercise the shared MIDI service with
// EventTarget-like ports and a native bridge in isolated Node VM contexts.
const fs = require('fs'), path = require('path'), vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../js/midi.js'), 'utf8');
let checks = 0;
function ok(value, message) { if (!value) throw new Error(message); checks++; console.log('  PASS', message); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function port(id, name) {
  const listeners = new Set();
  return {
    id, name, state: 'connected', onmidimessage: null, sent: [], listeners,
    addEventListener(type, fn) { if (type === 'midimessage') listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'midimessage') listeners.delete(fn); },
    receive(bytes) {
      const event = { data: new Uint8Array(bytes) };
      if (this.onmidimessage) this.onmidimessage(event);
      for (const fn of [...listeners]) fn(event);
    },
    send(bytes) { if (this.fail) throw new Error('port unavailable'); this.sent.push(Array.from(bytes)); }
  };
}

function harness(options = {}) {
  const values = Object.assign({ 'lights.on': false, 'lights.v1': true }, options.seed);
  const events = [], bus = {}, posts = [], requests = [];
  const input1 = port('in1', options.inputName || 'Synth input'), input2 = port('in2', 'Other input');
  const output1 = port('out1', 'Synth output'), output2 = port('out2', 'Other output');
  const gone = port('gone', 'Disconnected'); gone.state = 'disconnected';
  const access = { inputs: new Map([['in1', input1], ['in2', input2], ['gone', gone]]), outputs: new Map([['out1', output1], ['out2', output2], ['gone', gone]]), sysexEnabled: !options.fallback };
  const App = {
    store: { get: (key, def) => values[key] === undefined ? def : values[key], set: (key, value) => { values[key] = value; } },
    on: (name, fn) => { (bus[name] || (bus[name] = [])).push(fn); },
    emit: (name, data) => { events.push({ name, data }); for (const fn of bus[name] || []) fn(data); }
  };
  const navigator = options.unsupported ? {} : { requestMIDIAccess: request => {
    requests.push(request);
    return options.fallback && request && request.sysex ? Promise.reject(new Error('SysEx declined')) : Promise.resolve(access);
  } };
  const window = {};
  if (options.native) window.SoundLabMidi = { post: text => { if (options.failNative) throw new Error('bridge failed'); posts.push(JSON.parse(text)); } };
  vm.runInNewContext(source, { App, window, navigator, Theory: {}, setTimeout, clearTimeout, setInterval, clearInterval, console });
  return { midi: App.midi, App, window, values, events, posts, requests, access, input1, input2, output1, output2, gone };
}

(async function () {
  console.log('# unsupported and browser permission fallback');
  const unsupported = harness({ unsupported: true });
  ok(!unsupported.midi.supported && !unsupported.midi.explicitPortsSupported, 'unsupported environment advertises no independent ports');
  ok(unsupported.midi.subscribeInput('in1', () => {}) === null && !unsupported.midi.sendToOutput('out1', [0xF8]), 'unsupported explicit operations reject without fallback');
  const h = harness({ fallback: true, inputName: 'LUMI Keys BLOCK' });
  ok(!h.midi.explicitPortsSupported && h.midi.subscribeInput('in1', () => {}) === null, 'independent ports remain unavailable before enable');
  let originalCalls = 0;
  const original = () => originalCalls++;
  h.input1.onmidimessage = original;
  await h.midi.enable();
  ok(h.requests.length === 2 && h.requests[0].sysex && h.requests[1] === undefined && !h.midi.sysexOk, 'declined SysEx falls back to ordinary Web MIDI');
  ok(h.midi.explicitPortsSupported && h.midi.inputId === 'in1' && h.midi.outputId === 'out1', 'enabled Web MIDI supports independent ports and ordinary default picks');
  ok(h.midi.inputs.length === 2 && h.midi.outputs.length === 2, 'inventories omit disconnected ports still present in MIDI maps');
  ok(!h.midi.lumi && !h.midi.lightsOn && h.output1.sent.length === 0, 'LUMI input never identifies or automatically writes lights/SysEx to synth output');
  ok(h.input1.onmidimessage === original, 'selected Web input preserves existing onmidimessage handler');
  h.input1.receive([0x90, 60, 80]);
  ok(originalCalls === 1 && h.events.some(e => e.name === 'midi:note'), 'ordinary selected input and existing handler both receive notes');
  h.input1.receive([0x91, 60, 85]); h.input1.receive([0x80, 60, 0]);
  ok(same(h.midi.held, [60]), 'releasing one MIDI channel does not erase a note held on another');
  h.events.length = 0; h.midi.setInput('in2');
  ok(h.midi.held.length === 0 && h.events.some(e => e.name === 'midi:note' && e.data.chan === 1 && !e.data.on), 'switching selected input releases held notes on their original channels');
  h.midi.setInput('in1');

  console.log('# exact additive input subscriptions');
  h.events.length = 0;
  const received = [], second = [];
  const savedSelections = [h.values['midi.inputId'], h.values['midi.outputId']];
  const off = h.midi.subscribeInput('in2', data => { received.push([data.portId, data.bytes.slice()]); data.bytes[1] = 1; });
  const offSecond = h.midi.subscribeInput('in2', data => second.push(data.bytes));
  h.input2.receive([0x90, 61, 90]);
  ok(typeof off === 'function' && same(received, [['in2', [0x90, 61, 90]]]) && same(second, [[0x90, 61, 90]]), 'subscribers receive independent raw byte copies and exact port IDs');
  ok(!h.events.some(e => e.name === 'midi:note' || e.name === 'note:input' || e.name === 'midi:raw'), 'unselected-port subscriptions never feed graders, capture or shared raw Thru');
  ok(same(savedSelections, [h.values['midi.inputId'], h.values['midi.outputId']]), 'independent subscriptions never persist or change selections');
  h.midi.setInput('in2');
  h.midi.setInputFilter(bytes => [bytes[0], 72, bytes[2]]);
  h.events.length = 0;
  h.input2.receive([0x90, 62, 70]);
  ok(second[1][1] === 62 && h.events.find(e => e.name === 'midi:note').data.midi === 72, 'independent raw observation coexists with selected-input filtering');
  off(); off(); offSecond();
  h.input2.receive([0x80, 62, 0]);
  ok(received.length === 2 && second.length === 2, 'unsubscribe is idempotent and removes only its own listeners');
  ok(h.midi.subscribeInput('missing', () => {}) === null && h.midi.subscribeInput('gone', () => {}) === null, 'missing/disconnected inputs reject explicitly');
  const oldPort = h.input2, stale = [];
  const offStale = h.midi.subscribeInput('in2', data => stale.push(data));
  h.access.inputs.set('in2', port('in2', 'Reconnected'));
  oldPort.receive([0x90, 64, 80]);
  offStale();
  ok(stale.length === 0, 'a subscription cannot read a stale port object after replacement');

  console.log('# exact output and missing selection safety');
  h.events.length = 0;
  const outputPick = h.midi.outputId;
  ok(h.midi.sendToOutput('out2', new Uint8Array([0xB0, 1, 7])) && h.output1.sent.length === 0 && same(h.output2.sent, [[0xB0, 1, 7]]), 'explicit output sends solely to the named port');
  ok(h.midi.outputId === outputPick && h.values['midi.outputId'] === outputPick && h.events.length === 1 && h.events[0].name === 'midi:out' && h.events[0].data.portId === 'out2', 'explicit output emits successful monitor event without selection/capture side effects');
  ok(!h.midi.sendToOutput('missing', [0x90, 60, 100]) && !h.midi.sendToOutput('gone', [0xF8]), 'missing/disconnected explicit output never falls back to selected synth');
  h.output2.fail = true;
  ok(!h.midi.sendToOutput('out2', [0xF8]) && h.events.length === 1, 'failed explicit send has no successful-output event');
  h.midi.setOutput('missing'); h.access.onstatechange();
  ok(h.midi.outputId === null && !h.midi.send([0xF8]) && h.values['midi.outputId'] === 'missing', 'missing selected output stays missing across inventory changes');
  h.midi.setOutput('out1'); h.midi.setOutput(''); h.access.onstatechange();
  ok(h.midi.outputId === null && !h.midi.hasOutput && h.values['midi.outputId'] === '', 'explicit none selection remains off across inventory changes');
  h.midi.setOutput('out1');
  let releasedFrom = null;
  h.App.on('midi:beforeoutput', () => { releasedFrom = h.midi.outputId; h.midi.send([0x80, 60, 0]); });
  h.midi.setOutput('out2');
  ok(releasedFrom === 'out1' && same(h.output1.sent, [[0x80, 60, 0]]), 'beforeoutput cleanup sends releases to previous selected output before switching');

  console.log('# native backends cannot masquerade as independent Web ports');
  const n = harness({ native: true });
  await n.midi.enable();
  n.window.__glMIDI.onports({ inputs: [{ id: 1, name: 'Native input' }], outputs: [{ id: 2, name: 'Native synth' }] });
  ok(n.midi.ready && n.midi.native && !n.midi.explicitPortsSupported && n.requests.length === 0, 'native bridge stays authoritative even when browser MIDI is also present');
  const postsBefore = n.posts.length;
  ok(n.midi.subscribeInput(1, () => {}) === null && !n.midi.sendToOutput(2, [0xF8]) && n.posts.length === postsBefore, 'native independent input/output methods reject without bridge send or fallback');
  n.events.length = 0;
  ok(n.midi.send([0xF8]) && n.events.some(e => e.name === 'midi:out'), 'ordinary native selected-output send remains supported');
  n.midi.setOutput('missing'); n.window.__glMIDI.onports({ inputs: [], outputs: [{ id: 3, name: 'Unrelated native output' }] });
  ok(!n.midi.hasOutput && !n.midi.send([0xF8]), 'native missing output never selects unrelated replacement');
  n.midi.setOutput(''); n.window.__glMIDI.onports({ inputs: [], outputs: [{ id: 3, name: 'Unrelated native output' }] });
  ok(!n.midi.hasOutput, 'native none selection remains off across inventory updates');
  const f = harness({ native: true, failNative: true });
  await f.midi.enable().catch(() => {});
  ok(!f.midi.ready, 'failed native initialization remains unavailable');
  f.window.__glMIDI.onports({ outputs: [{ id: 2, name: 'Native synth' }] });
  f.events.length = 0;
  ok(!f.midi.send([0xF8]) && !f.events.some(e => e.name === 'midi:out'), 'failed native post never emits a successful-output event');
  console.log('ALL PASS (' + checks + ' checks)');
})().catch(error => { console.error('FAIL', error.stack); process.exitCode = 1; });
