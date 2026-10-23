// Production Woodshed SMF importer, with synthetic file bytes only. No MIDI
// device, hardware, browser permission, or invented audio/score transcription.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const sandbox = { console, App: { register() {}, on() {}, store: { get: (key, fallback) => fallback } } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/woodshed.js'), 'utf8'), sandbox);
const parse = sandbox.Woodshed.importMidi;
const ascii = sandbox.Woodshed.importAscii;
let checks = 0;
function ok(value, message) { assert(value, message); checks++; console.log('  PASS', message); }
function u16(n) { return [n >>> 8 & 255, n & 255]; }
function u32(n) { return [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255]; }
function vlq(n) { const bytes = [n & 127]; while ((n = Math.floor(n / 128))) bytes.unshift((n & 127) | 128); return bytes; }
function ev(delta, bytes) { return [...vlq(delta), ...bytes]; }
function end(delta = 0) { return ev(delta, [255, 47, 0]); }
function tempo(delta, us) { return ev(delta, [255, 81, 3, us >>> 16 & 255, us >>> 8 & 255, us & 255]); }
function smf(tracks, opts = {}) {
  const header = [...u16(opts.format ?? (tracks.length === 1 ? 0 : 1)), ...u16(opts.count ?? tracks.length), ...u16(opts.division ?? 480), ...(opts.extra || [])];
  return [77, 84, 104, 100, ...u32(header.length), ...header,
    ...tracks.flatMap(t => [77, 84, 114, 107, ...u32(t.length), ...t]), ...(opts.trailing || [])];
}
function read(bytes, name = 'Test.mid') { const array = Uint8Array.from(bytes); return parse(array.buffer, name); }
function warning(score, pattern) { return score.importWarnings.some(w => pattern.test(w)); }
function rejects(bytes, pattern, message) { assert.throws(() => read(bytes), pattern, message); checks++; console.log('  PASS', message); }
function basic() { return [...ev(0, [144, 60, 90]), ...ev(480, [128, 60, 0]), ...end()]; }

const score = read(smf([[
  ...tempo(0, 750000), ...ev(240, [144, 60, 96]), ...ev(0, [144, 64, 72]),
  ...ev(120, [128, 64, 0]), ...ev(240, [128, 60, 0]), ...end(360)
]]), 'Original.mid');
ok(score.title === 'Original' && score.source === 'midi' && score.instrument === 'piano', 'SMF0 becomes an actual pitched score with source provenance');
ok(score.bpm === 80 && score.importTempo.policy === 'constant-initial', 'initial beat-zero tempo explicitly sets the constant practice tempo');
ok(score.notes.length === 2 && score.notes.every(n => n.t === 0.5), 'leading rest and simultaneous chord attacks retain their original beats');
ok(score.notes[0].d === 0.75 && score.notes[1].d === 0.25 && score.notes[1].v === 72, 'independent note releases and attack velocities survive chord import');
ok(score.len === 2 && score.sourceLengthBeats === 2, 'trailing source rest is preserved without inventing a full bar');
ok(score.importWarnings.length === 0, 'a supported constant-tempo note file needs no omission warning');

const precise = read(smf([[...ev(1, [144, 60, 90]), ...ev(1, [128, 60, 0]), ...end()]], { division: 960, extra: [0, 0] }));
ok(precise.notes[0].t === 1 / 960 && precise.notes[0].d === 1 / 960, 'extended headers are bounded and sub-centibeat timings are not rounded or stretched');
const zero = read(smf([[...ev(0, [144, 60, 90]), ...ev(0, [128, 60, 0]), ...end(480)]]));
ok(zero.notes[0].d === 0 && zero.len === 1, 'zero-length notes remain exact while explicit source rest sets the length');

const changing = read(smf([
  [...tempo(0, 500000), ...tempo(960, 1000000), ...end()],
  [...ev(480, [144, 60, 90]), ...ev(480, [128, 60, 0]), ...end(480)]
]));
ok(changing.bpm === 120 && changing.notes[0].t === 1 && changing.notes[0].d === 1 && changing.len === 3,
  'SMF1 conductor tempo does not replace beat positions, durations, or trailing rests');
ok(changing.importTempo.variable && warning(changing, /Tempo changes are not followed/), 'variable tempo maps are explicitly declared unsupported at the chosen practice rate');
const late = read(smf([[...ev(0, [144, 60, 90]), ...tempo(240, 1000000), ...ev(240, [128, 60, 0]), ...end()]]));
ok(late.bpm === 120 && warning(late, /initial tempo/), 'a later first tempo event cannot rewrite the SMF default initial 120 bpm');
const conflict = read(smf([
  [...tempo(0, 500000), ...end(480)],
  [...tempo(0, 1000000), ...basic()]
]));
ok(conflict.bpm === 60 && warning(conflict, /Conflicting beat-zero tempos/), 'conflicting beat-zero tempos use the documented final track-order event');
const fractional = read(smf([[...tempo(0, 666667), ...basic()]]));
ok(fractional.bpm === 60000000 / 666667, 'legal fractional source tempo is preserved rather than silently rounded or clamped');

const running = read(smf([[
  ...ev(0, [144, 60, 80]), ...ev(120, [60, 100]), ...ev(120, [60, 0]), ...ev(120, [60, 0]), ...end()
]]));
ok(running.notes.length === 2 && running.notes[0].t === 0 && running.notes[1].t === 0.25 && running.notes.every(n => n.d === 0.5),
  'running status and velocity-zero releases retain overlapping repeated attacks using FIFO pairing');
ok(warning(running, /paired with releases in attack order; ties are not inferred/), 'ambiguous same-key overlap is reported rather than silently treated as a tie');
const channels = read(smf([[
  ...ev(0, [145, 60, 90]), ...ev(120, [146, 60, 70]), ...ev(120, [129, 60, 0]), ...ev(120, [130, 60, 0]), ...end()
]]));
ok(channels.notes[0].ch === 1 && channels.notes[1].ch === 2 && channels.notes.every(n => n.d === 0.5), 'same-pitch channel voices keep independent attack/release pairs');
const tracks = read(smf([basic(), [...ev(240, [144, 60, 75]), ...ev(480, [128, 60, 0]), ...end()]]));
ok(tracks.notes.length === 2 && tracks.notes[1].t === 0.5 && tracks.notes.every(n => n.d === 1), 'same-channel/pitch events in separate tracks never release each other');

const mixed = read(smf([[
  ...ev(0, [153, 36, 100]), ...ev(0, [144, 64, 80]), ...ev(240, [137, 36, 0]), ...ev(240, [128, 64, 0]), ...end()
]]));
ok(mixed.instrument === 'piano' && mixed.notes.length === 1 && mixed.notes[0].m === 64 && warning(mixed, /Channel 10 percussion was excluded/),
  'mixed percussion cannot exempt the pitched practice score from scale lock or turn it into a drum exercise');
const drums = read(smf([[
  ...ev(0, [153, 36, 100]), ...ev(240, [137, 36, 0]), ...ev(0, [153, 38, 80]), ...ev(240, [137, 38, 0]), ...end()
]]));
ok(drums.instrument === 'drums' && drums.notes.map(n => n.m).join() === '36,38' && drums.notes.map(n => n.lane).join() === '0,1', 'pure percussion keeps the recorded pitches and distinct display hits');
ok(warning(drums, /sticking and limb assignments are not encoded/), 'import never claims a MIDI file specifies drummer sticking');

const omitted = read(smf([[
  ...ev(0, [192, 4]), ...ev(0, [176, 64, 127]), ...ev(0, [224, 0, 64]), ...ev(0, [208, 42]), ...ev(0, [160, 60, 80]),
  ...ev(0, [240, 2, 1, 247]), ...ev(0, [255, 88, 4, 3, 2, 24, 8]), ...ev(0, [255, 89, 2, 0, 0]),
  ...ev(0, [255, 5, 1, 65]), ...basic()
]], { trailing: [0, 1] }));
ok(warning(omitted, /controllers \(including sustain\)/) && warning(omitted, /pitch bends/) && warning(omitted, /program changes/), 'controllers, sustain, bends and program changes receive explicit dropped-feature warnings');
ok(warning(omitted, /pressure/) && warning(omitted, /SysEx/) && warning(omitted, /time signatures/) && warning(omitted, /key signatures/) && warning(omitted, /text, lyrics/), 'unsupported expressive and score metadata is surfaced without inventing its semantics');
ok(warning(omitted, /Trailing data/) && omitted.notes[0].d === 1, 'trailing data is reported and ignored controls do not lengthen note-off durations');
const incomplete = read(smf([[
  ...ev(0, [128, 65, 0]), ...ev(0, [144, 62, 90]), ...basic()
]]));
ok(incomplete.notes.length === 1 && warning(incomplete, /without matching releases were omitted/) && warning(incomplete, /unmatched note releases/),
  'unpaired events are reported and no missing note duration is fabricated');
const many = [];
for (let i = 0; i < 1501; i++) many.push(...ev(0, [144, 60, 90]), ...ev(1, [128, 60, 0]));
many.push(...end());
const limited = read(smf([many]));
ok(limited.notes.length === 1500 && warning(limited, /first 1500 notes/), 'the existing practice size limit has an explicit truncation warning');

rejects([77, 84], /truncated/, 'short headers fail before any out-of-bounds read');
const shortHeader = smf([basic()]); shortHeader.splice(4, 4, ...u32(5));
rejects(shortHeader, /header length/, 'headers shorter than six payload bytes are rejected');
rejects(smf([basic()], { format: 2 }), /formats 0 and 1/, 'asynchronous SMF2 sequences are explicitly unsupported');
rejects(smf([basic()], { division: 0 }), /must be positive/, 'zero PPQN cannot generate infinite note times');
rejects(smf([basic()], { division: 0xe728 }), /SMPTE/, 'unsupported SMPTE division cannot masquerade as beat timing');
rejects(smf([basic()], { count: 0 }), /track count/, 'zero declared tracks are invalid');
rejects(smf([basic(), basic()], { format: 0 }), /track count/, 'SMF0 cannot silently consume multiple independent tracks');
const truncated = smf([basic()]); truncated.pop();
rejects(truncated, /truncated/, 'declared track lengths are bounded by the file');
rejects(smf([[...ev(0, [144, 60]), ...end()]]), /invalid MIDI|truncated/, 'incomplete channel events cannot read into the next track');
rejects(smf([[0, 60, 90, ...end()]]), /running status/, 'data without a prior channel status is invalid');
rejects(smf([[128, 128, 128, 128, 0, ...end()]]), /four bytes/, 'overlong VLQs cannot loop or cross chunk bounds');
rejects(smf([[0, 255, 1, 127, 65, ...end()]]), /truncated/, 'meta payload lengths are bounded by the current track');
rejects(smf([[0, 240, 127, 65, ...end()]]), /truncated/, 'SysEx payload lengths are bounded by the current track');
rejects(smf([[...tempo(0, 0), ...basic()]]), /tempo must be positive/, 'zero tempo is rejected instead of producing infinite BPM');
rejects(smf([[0, 255, 81, 2, 7, 161, ...basic()]]), /tempo event/, 'invalid tempo payload sizes are rejected');
rejects(smf([[0, 241, 0, ...end()]]), /unsupported system/, 'unsupported system events cannot desynchronize the SMF parser');
rejects(smf([[...ev(0, [144, 128, 80]), ...end()]]), /invalid MIDI data/, 'status bytes cannot be accepted as note numbers');
rejects(smf([[...basic().slice(0, -4)]]), /end-of-track/, 'a truncated score without its end marker is rejected');
rejects(smf([[...basic(), 0]]), /end-of-track/, 'events after an end marker cannot silently enter another sequence');
rejects(smf([[...end()]]), /no notes found/, 'an empty score cannot create a misleading playable exercise');
rejects(smf([[...ev(0, [144, 60, 90]), ...ev(0, [255, 1, 0]), ...ev(480, [60, 0]), ...end()]]), /running status/,
  'meta events correctly cancel channel running status');

console.log('# ASCII tab: pitch columns are shared, digit widths are per string');
const tab = ascii(['e|--12--8----|', 'B|--10--8----|', 'G|--9---9----|', 'D|----------|', 'A|----------|', 'E|----------|'].join('\n'), 'Original tab');
ok(tab.source === 'ascii' && tab.instrument === 'guitar' && tab.timingOk === false, 'ASCII import explicitly remains approximate guitar source material');
ok(tab.notes.length === 6 && tab.notes.slice(0, 3).every(n => n.t === 0) && tab.notes.slice(3).every(n => n.t === 0.5),
  'aligned multi-digit and single-digit frets form the two original chords without moving another string column');
ok(tab.notes.map(n => n.m).join() === '76,69,64,72,67,64' && tab.notes.map(n => n.str).join() === '0,1,2,0,1,2',
  'two-digit fret continuation is never a second note and all chord strings retain their correct pitch');
ok(warning(tab, /rhythm, rests and techniques are not interpreted/) && warning(tab, /Ties are not inferred/),
  'assumed tuning, rhythm, rests, durations, techniques and ties are disclosed rather than fabricated');
const initial = ascii([' e|12-------|', ' B|10-------|', ' G|9--------|', ' D|---------|', ' A|---------|', ' E|---------|'].join('\n'));
ok(initial.notes.length === 3 && initial.notes.every(n => n.t === 0) && initial.title === 'Pasted tab', 'initial fret numbers before any dash and indented lines are preserved');
const staggered = ascii(['e|--12------|', 'B|---8------|', 'G|----------|', 'D|----------|', 'A|----------|', 'E|----------|'].join('\n'), 'Stagger');
ok(staggered.notes.length === 2 && staggered.notes[0].m === 76 && staggered.notes[1].m === 67 && staggered.notes[1].t === 0.5,
  'a lower-string note aligned with a different string’s continuation digit retains its separate onset');
const range = ascii(['e|--24--25--123--|', 'B|---------------|', 'G|---------------|', 'D|---------------|', 'A|---------------|', 'E|---------------|'].join('\n'), 'Range');
ok(range.notes.length === 1 && range.notes[0].fret === 24 && warning(range, /2 unsupported fret numbers/),
  'unsupported frets are omitted once per number without inventing a fret from continuation digits');
const block = ['e|--3------|', 'B|---------|', 'G|---------|', 'D|---------|', 'A|---------|', 'E|---------|'];
const blocks = ascii(block.concat(block).join('\n'), 'Two systems');
ok(blocks.notes.length === 2 && blocks.notes[0].t === 0 && blocks.notes[1].t === 0.5, 'consecutive six-string systems are imported in order rather than silently dropping a second system');
assert.throws(() => ascii('arbitrary prose is not a parsed score'), /six string lines/);
checks++; console.log('  PASS arbitrary prose cannot become invented tab targets');

console.log('PASS performance import: ' + checks + ' checks (synthetic MIDI bytes; no hardware validated)');
