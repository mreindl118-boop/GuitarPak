/* soundLAB Score: deliberately bounded, offline MusicXML pitch/rhythm preview.
 * No MIDI hardware I/O. Original import bytes are retained separately from the
 * preview model. See docs/SCORE.md for the supported subset and export contract.
 */
(function () {
  'use strict';

  var LIMIT_BYTES = 2 * 1024 * 1024, LIMIT_EVENTS = 2048, LIMIT_MEASURES = 256;
  var EPS = 0.000001, PPQ = 960;
  var LETTERS = 'CDEFGAB', NAT = [0, 2, 4, 5, 7, 9, 11];
  var TYPES = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625 };
  var SHORT = { w: 'whole', h: 'half', q: 'quarter', e: 'eighth', s: '16th' };
  var BASE_NOTICE = 'Limited pitch/rhythm preview, one part/staff/voice. Explicit accidentals; lyrics, dynamics, articulation, beaming and page layout are omitted. Sound is a local synth. MIDI exports pitches, durations, meter and tempo only.';
  var rootEl, els = {}, current = null, original = null, originalName = '', loadId = 0, playId = 0;
  var player = { playing: false, pending: false, timer: null, ctx: null, start: 0, index: 0, voices: [], timeline: [], duration: 0, speed: 1 };

  function fail(message) { throw new Error(message); }
  function esc(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function children(node, name) { return Array.prototype.filter.call(node.children || [], function (n) { return !name || n.localName === name; }); }
  function child(node, name) { return children(node, name)[0] || null; }
  function value(node, name, fallback) { var c = child(node, name); return c ? c.textContent.trim() : fallback; }
  function all(node, name) { return Array.prototype.slice.call(node.getElementsByTagNameNS('*', name)); }
  function number(text, label, min, max) {
    var n = Number(text);
    if (text === null || text === '' || !isFinite(n) || n < min || n > max) fail('Invalid ' + label + '.');
    return n;
  }
  function integer(text, label, min, max) { var n = number(text, label, min, max); if (Math.floor(n) !== n) fail('Invalid ' + label + '.'); return n; }
  function copyPitch(p) { return { step: p.step, alter: p.alter, octave: p.octave, midi: p.midi }; }
  function pitch(step, alter, octave) {
    if (!/^[CDEFGAB]$/.test(step)) fail('A pitch step must be exactly one letter C, D, E, F, G, A or B.');
    var i = LETTERS.indexOf(step);
    if (i < 0 || !Number.isInteger(alter) || alter < -2 || alter > 2 || !Number.isInteger(octave) || octave < 0 || octave > 8) fail('Only spelled pitches C0–B8 with up to double accidentals are supported.');
    var midi = (octave + 1) * 12 + NAT[i] + alter;
    if (midi < 0 || midi > 127) fail('Pitch outside the MIDI range.');
    return { step: step, alter: alter, octave: octave, midi: midi };
  }
  function pitchName(p) { return p.step + ({ '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' }[p.alter]) + p.octave; }
  function durationType(duration) {
    for (var type in TYPES) for (var dots = 0; dots <= 2; dots++) {
      if (Math.abs(TYPES[type] * (2 - Math.pow(0.5, dots)) - duration) < EPS) return { type: type, dots: dots };
    }
    return null;
  }
  function normalizeTempos(tempos) {
    tempos.sort(function (a, b) { return a.beat - b.beat; });
    var out = [];
    tempos.forEach(function (t) {
      var prev = out[out.length - 1];
      if (prev && Math.abs(prev.beat - t.beat) < EPS) {
        if (Math.abs(prev.bpm - t.bpm) > EPS) fail('Conflicting tempo markings at the same position.');
      } else out.push(t);
    });
    if (!out.length || out[0].beat > EPS) out.unshift({ beat: 0, bpm: 120 });
    return out;
  }
  function finish(model) {
    var open = {}, notes = [], count = 0;
    model.measures.forEach(function (measure) {
      measure.events.forEach(function (event) {
        count++;
        event.pitches.forEach(function (p) {
          var key = pitchName(p), prev = open[key], at = measure.start + event.start;
          if (p.tieStop) {
            if (!prev || Math.abs(prev.beat + prev.duration - at) > EPS) fail('A tie stop has no adjacent matching tie start (' + key + ').');
            prev.duration += event.duration;
            if (!p.tieStart) delete open[key];
          } else {
            if (prev) fail('A tied pitch is re-attacked before its tie ends (' + key + ').');
            var n = { beat: at, duration: event.duration, midi: p.midi, pitch: copyPitch(p) };
            notes.push(n);
            if (p.tieStart) open[key] = n;
          }
        });
      });
    });
    if (Object.keys(open).length) fail('An open tie has no matching tie stop.');
    if (!count) fail('The score contains no notes or rests.');
    if (count > LIMIT_EVENTS || model.measures.length > LIMIT_MEASURES) fail('Score limit: 256 measures and 2,048 note/rest events.');
    notes.sort(function (a, b) { return a.beat - b.beat || a.midi - b.midi; });
    // MIDI cannot distinguish simultaneous/unclosed same-pitch notes on one
    // channel. This subset avoids that ambiguity instead of shortening notes.
    var ends = {};
    notes.forEach(function (n) { if (ends[n.midi] > n.beat + EPS) fail('Overlapping repeated pitches cannot be exported faithfully.'); ends[n.midi] = n.beat + n.duration; });
    model.notes = notes;
    model.eventCount = count;
    model.tempos = normalizeTempos(model.tempos);
    model.totalBeats = model.measures.reduce(function (sum, m) { return sum + m.duration; }, 0);
    if (model.totalBeats > 4096) fail('Score limit: 4,096 quarter-note beats.');
    return model;
  }

  function parseMusicXML(text) {
    if (typeof text !== 'string' || text.length > LIMIT_BYTES) fail('MusicXML must be text smaller than 2 MB.');
    var encoding = /<\?xml[^>]*encoding\s*=\s*['"]([^'"]+)/i.exec(text);
    if (encoding && !/^utf-?8$/i.test(encoding[1])) fail('Use UTF-8 encoded MusicXML.');
    if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text)) fail('XML entity declarations and internal DTD subsets are not supported.');
    var doc = new DOMParser().parseFromString(text.replace(/<!DOCTYPE[^>]*>/gi, ''), 'application/xml');
    if (all(doc, 'parsererror').length || !doc.documentElement || doc.documentElement.localName !== 'score-partwise') fail('Use uncompressed, valid score-partwise MusicXML (.musicxml or .xml).');
    var top = doc.documentElement, parts = children(top, 'part');
    if (parts.length !== 1) fail('This preview supports exactly one pitched part. Export a single part first.');
    var part = parts[0], measures = children(part, 'measure');
    if (!measures.length || measures.length > LIMIT_MEASURES) fail('Use a score with 1–256 measures.');
    var forbidden = ['backup', 'forward', 'grace', 'cue', 'unpitched', 'time-modification', 'transpose', 'repeat', 'ending', 'segno', 'coda', 'ornaments', 'tremolo', 'octave-shift', 'pedal', 'scordatura', 'measure-style', 'swing', 'fermata'];
    forbidden.forEach(function (tag) { if (all(part, tag).length) fail('Unsupported MusicXML structure: ' + tag + '. The original remains unchanged.'); });
    all(part, 'sound').forEach(function (s) {
      Array.prototype.forEach.call(s.attributes, function (a) { if (/^(dacapo|dalsegno|tocoda|fine|forward-repeat|segno|coda|time-only)$/.test(a.name)) fail('Repeat/navigation playback is not supported.'); });
    });
    all(part, 'words').forEach(function (words) {
      var normalized = words.textContent.toLowerCase().replace(/[.\s]+/g, '');
      if (/^(dc|ds)(al|$)|dacapo|dalsegno|tocoda|^fine$|repeat|segno|coda/.test(normalized)) fail('Text repeat/navigation instructions are not supported.');
    });
    var model = { title: value(child(top, 'work') || top, 'work-title', '') || value(top, 'movement-title', '') || 'Imported score', measures: [], tempos: [], warnings: [] };
    var divisions = 1, beats = 4, beatType = 4, clef = 'treble', start = 0, voice = null;
    measures.forEach(function (measure, mi) {
      if (measure.getAttribute('non-controlling') === 'yes') fail('Non-controlling measures are not supported.');
      var m = { number: measure.getAttribute('number') || String(mi + 1), start: start, duration: 0, beats: beats, beatType: beatType, clef: clef, events: [] };
      var cursor = 0, previous = null;
      children(measure).forEach(function (item) {
        var tag = item.localName;
        if (tag === 'attributes') {
          if (cursor > EPS) fail('Mid-measure attribute changes are not supported.');
          if (child(item, 'divisions')) divisions = integer(value(item, 'divisions', ''), 'divisions', 1, 100000);
          if (child(item, 'staves') && integer(value(item, 'staves', ''), 'staves', 1, 128) !== 1) fail('This preview supports one staff only.');
          if (children(item, 'clef').length > 1 || children(item, 'time').length > 1) fail('Multiple simultaneous clefs/meters are not supported.');
          var time = child(item, 'time');
          if (time) {
            if (children(time, 'beats').length !== 1 || children(time, 'beat-type').length !== 1) fail('Use a simple numeric time signature.');
            beats = integer(value(time, 'beats', ''), 'meter numerator', 1, 32);
            beatType = integer(value(time, 'beat-type', ''), 'meter denominator', 1, 32);
            if ([1, 2, 4, 8, 16, 32].indexOf(beatType) < 0) fail('Unsupported meter denominator.');
          }
          var c = child(item, 'clef');
          if (c) {
            var sign = value(c, 'sign', ''), line = value(c, 'line', '');
            if (value(c, 'clef-octave-change', '0') !== '0') fail('Octave-transposing clefs are not supported.');
            if (sign === 'G' && line === '2') clef = 'treble';
            else if (sign === 'F' && line === '4') clef = 'bass';
            else fail('Only treble G2 and bass F4 clefs are supported.');
          }
          m.beats = beats; m.beatType = beatType; m.clef = clef;
        } else if (tag === 'direction') {
          var offset = value(item, 'offset', '0');
          if (Number(offset) !== 0) fail('Direction offsets are not supported.');
          var met = all(item, 'metronome'), sounds = all(item, 'sound'), tempo = null;
          met.forEach(function (mark) {
            var unit = value(mark, 'beat-unit', ''), per = value(mark, 'per-minute', '');
            if (!TYPES[unit] || !per || all(mark, 'beat-unit').length !== 1 || all(mark, 'per-minute').length !== 1 || all(mark, 'beat-unit-dot').length > 2) fail('Unsupported metronome marking.');
            tempo = number(per, 'tempo', 1, 1000) * TYPES[unit] * (2 - Math.pow(0.5, all(mark, 'beat-unit-dot').length));
          });
          sounds.forEach(function (s) { if (s.hasAttribute('tempo')) tempo = number(s.getAttribute('tempo'), 'quarter-note tempo', 1, 1000); });
          if (tempo !== null) model.tempos.push({ beat: start + cursor, bpm: tempo });
        } else if (tag === 'note') {
          if (['attack', 'release', 'time-only'].some(function (a) { return item.hasAttribute(a); })) fail('Note timing overrides are not supported.');
          if (item.getAttribute('print-object') === 'no' || item.getAttribute('print-spacing') === 'no') fail('Hidden notes are not supported.');
          var v = value(item, 'voice', '1');
          if (voice === null) voice = v;
          if (v !== voice) fail('Multiple voices are not supported. Export one voice first.');
          if (value(item, 'staff', '1') !== '1') fail('This preview supports one staff only.');
          var dur = number(value(item, 'duration', ''), 'note duration', EPS, 10000000) / divisions;
          var rest = child(item, 'rest'), chord = !!child(item, 'chord'), ps = [];
          var type = value(item, 'type', ''), dots = children(item, 'dot').length, shape = durationType(dur);
          if (rest && rest.getAttribute('measure') === 'yes') { type = 'measure'; dots = 0; }
          else {
            if (!type && shape) { type = shape.type; dots = shape.dots; }
            if (!TYPES[type] || dots > 2 || Math.abs(TYPES[type] * (2 - Math.pow(0.5, dots)) - dur) > EPS) fail('Unsupported or inconsistent note value (tuplets and irregular durations are not supported).');
          }
          if (!rest) {
            var pit = child(item, 'pitch');
            if (!pit) fail('A pitched note needs a pitch element.');
            var p = pitch(value(pit, 'step', ''), integer(value(pit, 'alter', '0'), 'pitch alteration', -2, 2), integer(value(pit, 'octave', ''), 'octave', 0, 8));
            var tieTypes = children(item, 'tie').concat(all(item, 'tied')).map(function (t) { return t.getAttribute('type'); });
            if (tieTypes.some(function (t) { return t !== 'start' && t !== 'stop'; })) fail('Only start/stop ties are supported.');
            p.tieStart = tieTypes.indexOf('start') !== -1; p.tieStop = tieTypes.indexOf('stop') !== -1;
            ps.push(p);
          } else if (all(item, 'tie').length || all(item, 'tied').length) fail('A rest cannot be tied.');
          if (chord) {
            if (rest || !previous || previous.rest || Math.abs(previous.duration - dur) > EPS) fail('Chord notes must share their onset and duration.');
            if (previous.pitches.some(function (p2) { return p2.midi === ps[0].midi; })) fail('Duplicate pitches in a chord are not supported.');
            if (previous.pitches.length >= 8) fail('Preview limit: eight notes in a chord.');
            previous.pitches.push(ps[0]);
          } else {
            previous = { start: cursor, duration: dur, rest: !!rest, pitches: ps, type: type, dots: dots };
            m.events.push(previous); cursor += dur;
          }
        } else if (tag === 'sound') {
          if (item.hasAttribute('tempo')) model.tempos.push({ beat: start + cursor, bpm: number(item.getAttribute('tempo'), 'tempo', 1, 1000) });
        } else if (['barline', 'print', 'harmony', 'figured-bass', 'grouping', 'bookmark', 'link'].indexOf(tag) < 0) fail('Unsupported measure element: ' + tag + '.');
      });
      var expected = beats * 4 / beatType;
      if (cursor < EPS || cursor > expected + EPS) fail('Measure ' + m.number + ' is empty or exceeds its meter.');
      if (cursor < expected - EPS && mi !== 0 && mi !== measures.length - 1 && measure.getAttribute('implicit') !== 'yes') fail('Incomplete middle measure ' + m.number + ' must be marked implicit.');
      m.duration = cursor; start += cursor; model.measures.push(m);
    });
    if (!all(part, 'sound').some(function (s) { return s.hasAttribute('tempo'); }) && !all(part, 'metronome').length) model.warnings.push('No numeric tempo found; preview and MIDI use 120 quarter notes/minute.');
    if (all(part, 'words').length) model.warnings.push('Text directions are retained only in the original. Text-only tempo changes (rit./accel.) do not affect playback.');
    if (all(part, 'harmony').length || all(part, 'figured-bass').length) model.warnings.push('Chord symbols/figured bass are omitted; only written notes sound.');
    return finish(model);
  }

  function createScore(tokens, options) {
    options = options || {};
    if (String(tokens).length > LIMIT_BYTES) fail('The melody is too large.');
    var bpm = number(String(options.bpm == null ? 100 : options.bpm), 'tempo', 20, 300);
    var sig = /^(\d+)\/(\d+)$/.exec(options.meter || '4/4');
    if (!sig || ['4/4', '3/4', '6/8'].indexOf(sig[0]) < 0) fail('Choose 4/4, 3/4 or 6/8.');
    var beats = +sig[1], beatType = +sig[2], capacity = beats * 4 / beatType;
    var model = { title: String(options.title || 'My score').slice(0, 120), measures: [], tempos: [{ beat: 0, bpm: bpm }], warnings: [] };
    var at = 0, m = null;
    String(tokens).trim().split(/\s+/).forEach(function (token) {
      if (!token) return;
      if (token === '|') { if (m && m.duration < capacity - EPS) fail('A barline follows an incomplete bar. Complete it with notes/rests, or remove the barline.'); return; }
      var match = /^(R|[A-G](?:#{1,2}|b{1,2})?[0-8]|\[[A-G0-8#b,]+\]):([whqes])(\.{0,2})$/.exec(token);
      if (!match) fail('Invalid token “' + token + '”. Use C4:q, F#4:e, R:h or [C4,E4,G4]:h.');
      var type = SHORT[match[2]], dots = match[3].length, duration = TYPES[type] * (2 - Math.pow(0.5, dots));
      if (!m || m.duration >= capacity - EPS) { m = { number: String(model.measures.length + 1), start: at, duration: 0, beats: beats, beatType: beatType, clef: options.clef === 'bass' ? 'bass' : 'treble', events: [] }; model.measures.push(m); }
      if (m.duration + duration > capacity + EPS) fail('“' + token + '” crosses a barline. Use shorter notes or finish the bar with a rest.');
      var ps = [];
      if (match[1] !== 'R') match[1].replace(/[\[\]]/g, '').split(',').forEach(function (s) {
        var p = /^([A-G])(#{1,2}|b{1,2})?([0-8])$/.exec(s);
        if (!p) fail('Invalid chord pitch.');
        var alter = !p[2] ? 0 : p[2][0] === '#' ? p[2].length : -p[2].length;
        var note = pitch(p[1], alter, +p[3]);
        if (ps.some(function (existing) { return existing.midi === note.midi; })) fail('A chord cannot repeat a MIDI pitch.');
        ps.push(note);
      });
      if (ps.length > 8) fail('Preview limit: eight notes in a chord.');
      m.events.push({ start: m.duration, duration: duration, rest: !ps.length, pitches: ps, type: type, dots: dots });
      m.duration += duration; at += duration;
    });
    if (!model.measures.length) fail('Enter at least one note or rest.');
    return finish(model);
  }

  function scoreXML(model) {
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><work><work-title>' + esc(model.title) + '</work-title></work><part-list><score-part id="P1"><part-name>Score</part-name></score-part></part-list><part id="P1">';
    model.measures.forEach(function (m, mi) {
      xml += '<measure number="' + (mi + 1) + '"' + (m.duration < m.beats * 4 / m.beatType - EPS ? ' implicit="yes"' : '') + '><attributes><divisions>' + PPQ + '</divisions><time><beats>' + m.beats + '</beats><beat-type>' + m.beatType + '</beat-type></time><clef><sign>' + (m.clef === 'bass' ? 'F' : 'G') + '</sign><line>' + (m.clef === 'bass' ? '4' : '2') + '</line></clef></attributes>';
      m.events.forEach(function (event) {
        model.tempos.forEach(function (t) { if (Math.abs(t.beat - m.start - event.start) < EPS) xml += '<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>' + t.bpm + '</per-minute></metronome></direction-type><sound tempo="' + t.bpm + '"/></direction>'; });
        var ps = event.rest ? [null] : event.pitches;
        ps.forEach(function (p, pi) {
          xml += '<note>' + (pi ? '<chord/>' : '') + (p ? '<pitch><step>' + p.step + '</step><alter>' + p.alter + '</alter><octave>' + p.octave + '</octave></pitch>' : '<rest' + (event.type === 'measure' ? ' measure="yes"' : '') + '/>') + '<duration>' + Math.round(event.duration * PPQ) + '</duration>';
          if (p && p.tieStop) xml += '<tie type="stop"/>';
          if (p && p.tieStart) xml += '<tie type="start"/>';
          if (event.type !== 'measure') xml += '<type>' + event.type + '</type>' + new Array(event.dots + 1).join('<dot/>');
          xml += '</note>';
        });
      });
      xml += '</measure>';
    });
    return xml + '</part></score-partwise>\n';
  }

  function beatSeconds(model, beat) {
    var seconds = 0, prev = 0, bpm = model.tempos[0].bpm;
    for (var i = 1; i < model.tempos.length && model.tempos[i].beat < beat; i++) {
      var t = model.tempos[i]; seconds += (t.beat - prev) * 60 / bpm; prev = t.beat; bpm = t.bpm;
    }
    return seconds + (beat - prev) * 60 / bpm;
  }
  function timeline(model) {
    return model.notes.map(function (n) { var at = beatSeconds(model, n.beat); return { midi: n.midi, at: at, duration: beatSeconds(model, n.beat + n.duration) - at }; });
  }
  function midiBytes(model) {
    var events = [], bytes = [], order = 0;
    function add(beat, data, priority) { var tick = Math.round(beat * PPQ); if (Math.abs(tick / PPQ - beat) > EPS) fail('This rhythm cannot be represented exactly at 960 MIDI ticks/quarter.'); events.push({ tick: tick, data: data, priority: priority, order: order++ }); }
    model.tempos.forEach(function (t) { var us = Math.round(60000000 / t.bpm); if (us < 1 || us > 0xffffff) fail('Tempo outside MIDI export range.'); add(t.beat, [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255], 0); });
    var lastMeter = '';
    model.measures.forEach(function (m) { var key = m.beats + '/' + m.beatType; if (key !== lastMeter) add(m.start, [0xff, 0x58, 4, m.beats, Math.log2(m.beatType), 24, 8], 0); lastMeter = key; });
    model.notes.forEach(function (n) { add(n.beat, [0x90, n.midi, 88], 2); add(n.beat + n.duration, [0x80, n.midi, 0], 1); });
    add(model.totalBeats, [0xff, 0x2f, 0], 3);
    events.sort(function (a, b) { return a.tick - b.tick || a.priority - b.priority || a.order - b.order; });
    function vlq(n) { var out = [n & 127]; while ((n = Math.floor(n / 128)) > 0) out.unshift((n & 127) | 128); return out; }
    var prev = 0;
    events.forEach(function (e) { bytes = bytes.concat(vlq(e.tick - prev), e.data); prev = e.tick; });
    var len = bytes.length;
    return new Uint8Array([77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, PPQ >> 8, PPQ & 255, 77, 84, 114, 107, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255].concat(bytes));
  }

  function status(message, error) { if (!els.status) return; els.status.textContent = message; els.status.classList.toggle('error', !!error); }
  function stateEvent() { App.emit('score:state', { playing: player.playing }); }
  function stop(message) {
    playId++;
    if (player.timer) clearInterval(player.timer);
    player.timer = null;
    player.voices.forEach(function (v) { try { v.osc.stop(); v.osc.disconnect(); v.gain.disconnect(); } catch (e) { /* already ended */ } });
    player.voices.length = 0; player.playing = false; player.pending = false; player.index = 0;
    if (els.play) els.play.textContent = 'Play score';
    if (App.wake) App.wake.release('score-run');
    if (rootEl) rootEl.querySelectorAll('.sc-now').forEach(function (n) { n.classList.remove('sc-now'); });
    stateEvent();
    if (message) status(message);
  }
  function sound(note, at, duration) {
    var ctx = player.ctx, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = 440 * Math.pow(2, (note - 69) / 12);
    var end = at + duration, attack = Math.min(0.009, duration / 4);
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(0.07, at + attack);
    gain.gain.setValueAtTime(0.07, Math.max(at + attack, end - Math.min(0.025, duration / 4)));
    gain.gain.linearRampToValueAtTime(0, end);
    osc.connect(gain); gain.connect(ctx.destination); // App shadows this with the master gain.
    var voice = { osc: osc, gain: gain }; player.voices.push(voice);
    osc.onended = function () { var i = player.voices.indexOf(voice); if (i >= 0) player.voices.splice(i, 1); osc.disconnect(); gain.disconnect(); };
    osc.start(at); osc.stop(end + 0.005);
  }
  function tick() {
    if (!player.playing) return;
    var now = player.ctx.currentTime, elapsed = (now - player.start) * player.speed;
    // A suspended/hidden/stalled tab must not burst all overdue notes at once.
    if (player.ctx.state !== 'running' || (player.index < player.timeline.length && player.timeline[player.index].at < elapsed - 0.35)) { stop('Playback stopped after an audio interruption.'); return; }
    while (player.index < player.timeline.length && player.timeline[player.index].at / player.speed + player.start < now + 0.1) {
      var n = player.timeline[player.index++];
      sound(n.midi, Math.max(now, player.start + n.at / player.speed), n.duration / player.speed);
    }
    var activeMeasure = current.measures.findIndex(function (m) { return elapsed >= beatSeconds(current, m.start) && elapsed < beatSeconds(current, m.start + m.duration); });
    rootEl.querySelectorAll('[data-sc-measure]').forEach(function (n) { n.classList.toggle('sc-now', Number(n.getAttribute('data-sc-measure')) === activeMeasure); });
    if (elapsed >= player.duration + 0.03) stop('Playback finished.');
  }
  async function play() {
    if (player.playing || player.pending) { stop('Stopped.'); return; }
    if (!current) return;
    stop();
    var id = playId;
    player.pending = true;
    try { player.ctx = App.getAudio(); } catch (e) { player.pending = false; status('Audio unavailable in this browser.', true); return; }
    var ctx = player.ctx;
    try { if (ctx.state === 'suspended') await ctx.resume(); } catch (e) { if (id === playId) { player.pending = false; status('Audio could not start. Tap Play again.', true); } return; }
    if (id !== playId) return;
    if (document.hidden || (App.active && App.active !== 'score')) { stop(); return; }
    player.pending = false;
    if (ctx.state !== 'running') { status('Audio could not start. Tap Play again.', true); return; }
    App.emit('transport:claim', { owner: 'score' });
    player.speed = Number(els.speed.value) || 1;
    player.timeline = timeline(current); player.duration = beatSeconds(current, current.totalBeats);
    player.start = ctx.currentTime + 0.12; player.playing = true;
    if (App.wake) App.wake.acquire('score-run');
    els.play.textContent = 'Stop score'; stateEvent(); status('Playing local synth · score tempos × ' + player.speed + '.');
    player.timer = setInterval(tick, 25); tick();
  }

  function staffSVG(measure) {
    var scale = Math.max(80, measure.events.length * 68 / measure.duration), width = 100 + measure.duration * scale;
    var steps = [];
    measure.events.forEach(function (e) { e.pitches.forEach(function (p) { steps.push(p.octave * 7 + LETTERS.indexOf(p.step)); }); });
    var topStep = measure.clef === 'bass' ? 26 : 38, bottomStep = topStep - 8;
    var hi = Math.max.apply(null, [topStep + 3].concat(steps)), lo = Math.min.apply(null, [bottomStep - 3].concat(steps));
    var topY = 45 + (hi - topStep) * 5, height = Math.max(160, 100 + (hi - lo) * 5);
    function y(step) { return topY + (topStep - step) * 5; }
    var out = '<svg viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" role="img" aria-label="' + esc('Measure ' + measure.number + ', ' + measure.clef + ' clef, ' + measure.beats + '/' + measure.beatType + '. See note table for exact pitches and durations.') + '">';
    for (var i = 0; i < 5; i++) out += '<line x1="6" y1="' + y(topStep - i * 2) + '" x2="' + (width - 6) + '" y2="' + y(topStep - i * 2) + '" class="sc-staffline"/>';
    out += '<text class="sc-music" x="9" y="' + y(measure.clef === 'bass' ? 24 : 32) + '">' + (measure.clef === 'bass' ? '\uE062' : '\uE050') + '</text><text class="sc-meter" x="49" y="' + (topY + 16) + '">' + measure.beats + '</text><text class="sc-meter" x="49" y="' + (topY + 35) + '">' + measure.beatType + '</text>';
    measure.events.forEach(function (e) {
      var x = 94 + e.start * scale;
      if (e.rest) {
        out += '<text x="' + x + '" y="' + (topY + 20) + '" class="sc-rest">rest</text>';
      } else e.pitches.forEach(function (p, pi) {
        var step = p.octave * 7 + LETTERS.indexOf(p.step), py = y(step), nx = x + (pi % 2 ? 3 : 0);
        for (var k = topStep + 2; k <= step; k += 2) out += '<line x1="' + (nx - 12) + '" x2="' + (nx + 12) + '" y1="' + y(k) + '" y2="' + y(k) + '" class="sc-ledger"/>';
        for (var k2 = bottomStep - 2; k2 >= step; k2 -= 2) out += '<line x1="' + (nx - 12) + '" x2="' + (nx + 12) + '" y1="' + y(k2) + '" y2="' + y(k2) + '" class="sc-ledger"/>';
        out += '<text x="' + (nx - 23 - pi * 2) + '" y="' + (py + 4) + '" class="sc-acc">' + ({ '-2': 'bb', '-1': 'b', 0: '\u266e', 1: '#', 2: 'x' }[p.alter]) + '</text>';
        out += '<ellipse cx="' + nx + '" cy="' + py + '" rx="7" ry="4.6" transform="rotate(-18 ' + nx + ' ' + py + ')" class="sc-note ' + (e.type === 'whole' || e.type === 'half' ? 'sc-open' : '') + '"/>';
        if (e.type !== 'whole') out += '<line x1="' + (nx + 6) + '" x2="' + (nx + 6) + '" y1="' + py + '" y2="' + (py - 28) + '" class="sc-ledger"/>';
        var flags = { eighth: 1, '16th': 2, '32nd': 3, '64th': 4 }[e.type] || 0;
        for (var f = 0; f < flags; f++) out += '<path d="M' + (nx + 6) + ',' + (py - 28 + f * 5) + 'q13,5 7,15" class="sc-flag"/>';
        for (var d = 0; d < e.dots; d++) out += '<circle cx="' + (nx + 13 + d * 5) + '" cy="' + (py - 2) + '" r="1.8" class="sc-note"/>';
        if (p.tieStart) out += '<path d="M' + (nx + 4) + ',' + (py + 10) + 'q18,12 34,0" class="sc-flag"/>';
      });
      out += '<text x="' + x + '" y="' + (height - 13) + '" class="sc-duration">' + e.duration + ' q' + (e.rest ? ' rest' : '') + '</text>';
    });
    out += '<line x1="' + (width - 7) + '" x2="' + (width - 7) + '" y1="' + topY + '" y2="' + (topY + 40) + '" class="sc-ledger"/></svg>';
    return out;
  }
  function render() {
    if (!current || !rootEl) return;
    els.result.hidden = false;
    els.title.textContent = current.title;
    els.meta.textContent = current.measures.length + ' measures · ' + current.notes.length + ' sounding notes · ' + current.tempos.map(function (t) { return Math.round(t.bpm * 100) / 100 + ' BPM at q' + (t.beat + 1); }).join(' → ');
    els.notices.textContent = BASE_NOTICE + (current.warnings.length ? ' ' + current.warnings.join(' ') : '');
    els.original.textContent = original ? 'Download original MusicXML' : 'Download MusicXML';
    els.staff.innerHTML = current.measures.map(function (m, i) { return '<section class="sc-measure" data-sc-measure="' + i + '"><h4>Measure ' + esc(m.number) + '</h4><div class="sc-scroll">' + staffSVG(m) + '</div></section>'; }).join('');
    var rows = '';
    current.measures.forEach(function (m) { m.events.forEach(function (e) { rows += '<tr><td>' + esc(m.number) + '</td><td>' + (e.start + 1) + '</td><td>' + (e.rest ? 'Rest' : e.pitches.map(function (p) { return esc(pitchName(p)) + (p.tieStop ? ' (tie stop)' : '') + (p.tieStart ? ' (tie start)' : ''); }).join(', ')) + '</td><td>' + e.duration + '</td></tr>'; }); });
    els.rows.innerHTML = rows;
  }
  function setScore(model, bytes, name) {
    loadId++; stop(); current = model; original = bytes ? new Uint8Array(bytes) : null; originalName = name || '';
    render(); status('Ready. ' + (original ? 'Imported original retained in memory.' : 'Created score; export it to keep a copy.'));
  }
  function importText(text) {
    stop();
    var model = parseMusicXML(text);
    setScore(model, new TextEncoder().encode(text), 'score.musicxml');
    return model;
  }
  async function importBytes(bytes, name) {
    if (bytes.byteLength > LIMIT_BYTES) fail('Choose a MusicXML file smaller than 2 MB.');
    var data = new Uint8Array(bytes);
    if (data[0] === 0x50 && data[1] === 0x4b) fail('Compressed .mxl is not supported. Export uncompressed .musicxml or .xml first.');
    var text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(data); } catch (e) { fail('Use UTF-8 encoded MusicXML.'); }
    var encoding = /<\?xml[^>]*encoding\s*=\s*['"]([^'"]+)/i.exec(text);
    if (encoding && !/^utf-?8$/i.test(encoding[1])) fail('Use UTF-8 encoded MusicXML.');
    var model = parseMusicXML(text); setScore(model, data, name); return model;
  }
  function download(bytes, name, type) {
    stop();
    var url = URL.createObjectURL(new Blob([bytes], { type: type })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    status('Download requested: ' + name + '.');
  }
  function filename(extension) { return (current.title.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 70) || 'score') + extension; }
  function guard(fn) { try { fn(); } catch (e) { status(e.message, true); } }
  function init(element) {
    rootEl = element;
    rootEl.innerHTML = '<div class="card sc-intro"><h2>Score</h2><p>Read a small MusicXML score, hear its written notes, or create a melody. Everything stays on this device.</p><p class="muted small">Uncompressed UTF-8 MusicXML · one part, staff and voice · treble/bass clef. Repeats, tuplets, multiple voices and transposing parts are rejected. PDF/photo recognition and audio transcription are outside this preview.</p><div class="row tight"><label class="btn sc-filelabel" for="sc-file">Open MusicXML<input id="sc-file" type="file" accept=".musicxml,.xml,application/vnd.recordare.musicxml+xml,application/xml,text/xml"></label><button class="btn" id="sc-demo" type="button">Load demo melody</button></div><details class="sc-details"><summary>Paste MusicXML</summary><label for="sc-xml">MusicXML source</label><textarea id="sc-xml" class="sc-input" spellcheck="false" placeholder="&lt;score-partwise ...&gt;"></textarea><button type="button" class="btn" id="sc-import">Read pasted XML</button></details><p id="sc-status" role="status" aria-live="polite" class="sc-status">Open a file or load the demo to begin.</p></div>' +
      '<details class="card sc-details"><summary>Create a melody</summary><p class="small muted">Write pitches with octave and duration: w whole, h half, q quarter, e eighth, s sixteenth. A dot adds half the value. R is a rest. Chords: [C4,E4,G4]:h. Bars fill automatically; notes must fit each bar.</p><label for="sc-name">Score title</label><input id="sc-name" class="sc-input" maxlength="120" value="My melody"><label for="sc-tokens">Notes and rests</label><textarea id="sc-tokens" class="sc-input" spellcheck="false">C4:q D4:q E4:q F4:q | G4:h E4:q R:q | [C4,E4,G4]:w</textarea><div class="sc-fields"><label>Quarter-note BPM<input type="number" id="sc-bpm" min="20" max="300" value="100"></label><label>Meter<select id="sc-meter"><option>4/4</option><option>3/4</option><option>6/8</option></select></label><label>Clef<select id="sc-clef"><option value="treble">Treble</option><option value="bass">Bass</option></select></label><button id="sc-create" class="btn primary" type="button">Create score</button></div></details>' +
      '<div class="card" id="sc-result" hidden><h2 id="sc-title"></h2><p id="sc-meta" class="muted small"></p><div class="sc-controls"><button type="button" class="btn primary" id="sc-play">Play score</button><button type="button" class="btn" id="sc-stop">Stop</button><label>Preview speed<select id="sc-speed"><option value="0.5">50%</option><option value="0.75">75%</option><option value="1" selected>100%</option><option value="1.25">125%</option><option value="1.5">150%</option></select></label><button type="button" class="btn" id="sc-original">Download MusicXML</button><button type="button" class="btn" id="sc-midi">Download MIDI</button></div><p id="sc-notices" class="sc-notice small"></p><div id="sc-staff"></div><details class="sc-details"><summary>Exact note table</summary><p class="small muted">Positions and durations are in quarter-note beats (q), even in 6/8. Tied segments sound as one sustained note.</p><div class="sc-scroll"><table class="sc-table"><thead><tr><th>Measure</th><th>Position (q)</th><th>Written pitches</th><th>Duration (q)</th></tr></thead><tbody id="sc-rows"></tbody></table></div></details></div>';
    ['status', 'result', 'title', 'meta', 'notices', 'original', 'staff', 'rows', 'play', 'speed'].forEach(function (key) { els[key] = rootEl.querySelector('#sc-' + key); });
    rootEl.querySelector('#sc-demo').onclick = function () { guard(function () { setScore(createScore('C4:q D4:q E4:q G4:q | A4:h G4:h | E4:q D4:q C4:h', { title: 'First light · demo melody', bpm: 100 })); }); };
    rootEl.querySelector('#sc-create').onclick = function () { guard(function () { setScore(createScore(rootEl.querySelector('#sc-tokens').value, { title: rootEl.querySelector('#sc-name').value, bpm: rootEl.querySelector('#sc-bpm').value, meter: rootEl.querySelector('#sc-meter').value, clef: rootEl.querySelector('#sc-clef').value })); }); };
    rootEl.querySelector('#sc-import').onclick = function () { loadId++; guard(function () { importText(rootEl.querySelector('#sc-xml').value); }); };
    rootEl.querySelector('#sc-file').onchange = async function (event) {
      var file = event.target.files[0], id = ++loadId; if (!file) return;
      stop();
      try { if (file.size > LIMIT_BYTES) fail('Choose a MusicXML file smaller than 2 MB.'); var bytes = await file.arrayBuffer(); if (id === loadId) await importBytes(bytes, file.name); }
      catch (e) { if (id === loadId) status(e.message, true); }
      event.target.value = '';
    };
    els.play.onclick = play; rootEl.querySelector('#sc-stop').onclick = function () { stop('Stopped.'); };
    els.speed.onchange = function () { stop('Preview speed changed. Press Play to restart; exports keep the score tempo.'); };
    els.original.onclick = function () { guard(function () { download(original || new TextEncoder().encode(scoreXML(current)), original ? (originalName || 'score.musicxml') : filename('.musicxml'), 'application/vnd.recordare.musicxml+xml'); }); };
    rootEl.querySelector('#sc-midi').onclick = function () { guard(function () { download(midiBytes(current), filename('.mid'), 'audio/midi'); }); };
    App.on('transport:claim', function (d) { if (d && d.owner !== 'score' && (player.playing || player.pending)) stop('Stopped by another transport.'); });
    App.on('sheet', function (d) { if (d && d.open && (player.playing || player.pending)) stop('Stopped while a utility sheet is open.'); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop('Stopped while the app was hidden.'); });
    window.addEventListener('pagehide', function () { stop(); });
  }
  var module = { init: init, onHide: function () { stop('Stopped after leaving Score.'); }, onKey: function (e) { if (e.code === 'Space' && !e.repeat && current) { e.preventDefault(); play(); } else if (e.key === 'Escape') stop('Stopped.'); } };
  window.SLScore = { module: module, parseMusicXML: parseMusicXML, createScore: createScore, scoreXML: scoreXML, midiBytes: midiBytes, timeline: timeline, beatSeconds: beatSeconds, importText: importText, importBytes: importBytes, play: play, stop: stop, toggle: play, get model() { return current; }, get playing() { return player.playing; }, get activeVoices() { return player.voices.length; }, get originalBytes() { return original ? new Uint8Array(original) : null; } };
  App.register('score', module);
})();
