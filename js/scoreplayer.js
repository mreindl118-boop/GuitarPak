/* soundLAB Score Player — a MIDI or MusicXML file on the synth.
 * window.SLScorePlayer. Prefix mh-pl (the ids it had as the MIDI Hub's
 * Player view), settings still under midihub.pl*.
 *
 * 2.0 Phase A3a: cut out of js/midihub.js so the practice app does not need
 * the Hub ("Open a score" on the Songs page reads MusicXML and plays on the
 * synth through this file). The logic is the Hub's, moved; what it took from
 * the Hub's closure now comes from the shared services:
 *   settings     App.store, same keys (midihub.plTempo / plVel / plRoute /
 *                plLoop / plTrans / plShift), so they carry over
 *   the output   App.midi.synthOut {id, name, has, set} (js/midi.js; still
 *                stored as midihub.outId)
 *   Part / Ch    midihub.ch and midihub.profile, read from the store
 *   messages     App.toast (the Hub's own toast only shows on the Hub page)
 *
 * Plays through the synth output with the MIDI service's tracked musical
 * writer (App.midi.bindMusicalOutput), so Panic, leaving the page, a port
 * change or App.midi.flushMusicalOutputs release every note and the pedal.
 * Sends ONLY Note On/Off and sustain (CC64): program, bank, other
 * controllers and SysEx in a file are dropped, so the synth's sounds and
 * settings are never changed. Readers are local; nothing is uploaded.
 * Recognition (PDF -> notes) is not done here.
 *
 * ONE MOUNT PER DOCUMENT: mount(el, opts) renders the card into el and wires
 * it. The song, the transport and its one ticker are module state, so a
 * second mount (the Hub re-renders on Import and Reset) only swaps the DOM:
 * a running song is neither stopped nor doubled. opts:
 *   show     called by show(): bring the card on screen
 *   ports    true = a "Synth out" and a "Channel" select on the card, for a
 *            host with no Hub header (write midihub.outId / midihub.ch); the
 *            two texts that name the Hub ("the Part picked in Control", a
 *            tab "from the MIDI Hub Player") then name the card instead
 *   noOut    the line shown while there is no synth output
 *   connect  {label, run}: a button after that line
 * REPAINT: paint() is public (the Hub calls it when its ports, Part or
 * profile change) and the module calls it itself on 'midi:state' and
 * 'lights'; it returns at once while nothing is mounted.
 */
(function () {
  'use strict';

  var root = null, els = {}, opt = {};

  // ---- what the Player used to take from the Hub's closure ----
  // a stored null (Reset Hub writes null) counts as absent: the fallback wins
  function g(k, d) { var v = App.store.get('midihub.' + k, d); return v === null ? d : v; }
  function set(k, v) { App.store.set('midihub.' + k, v); }
  function midi() { return App.midi; }
  // the Hub's channel (its Part buttons) and its Part / Ch wording (Yamaha says Part)
  function ch() { var c = parseInt(g('ch', 0), 10); return (c >= 0 && c < 16) ? c : 0; }
  function partLabel() { return g('profile', 'generic') === 'yamaha' ? 'Part' : 'Ch'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // the untracked write, only reached where the MIDI service has no tracked
  // writer (bindMusicalOutput): the synth output, else the selected output
  function sendOut(b) { var m = midi(), id = m.synthOut.id(); return id != null && m.sendTo ? m.sendTo(id, b) : m.send(b); }

  // ---- PLAYER: a MIDI or MusicXML file -> the synth ----
  var PL = { song: null, sender: null, timer: 0, playing: false, pos: 0, startWall: 0, startPos: 0, idx: 0, held: {}, sus: {}, painted: 0 };
  function plTempo() { var t = parseInt(g('plTempo', 100), 10); return t >= 25 && t <= 200 ? t : 100; }
  function plCap() { var v = parseInt(g('plVel', 90), 10); return v >= 20 && v <= 127 ? v : 90; }
  function plRoute() { return g('plRoute', 'file') === 'part' ? 'part' : 'file'; }
  function plLoop() { return g('plLoop', false) === true; }
  function clock(s) { s = Math.max(0, s || 0); var m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + (x < 10 ? '0' : '') + x; }

  // tidy raw note events: time order (offs before ons at the same moment),
  // a re-strike of a sounding note ends it first, strays dropped, nothing
  // left hanging at the end
  function finishSong(title, raw, warnings, source) {
    raw.sort(function (a, b) { return a.t - b.t || (a.k === 'off' ? 0 : a.k === 'sus' ? 1 : 2) - (b.k === 'off' ? 0 : b.k === 'sus' ? 1 : 2) || a.o - b.o; });
    var held = {}, out = [], peak = 1, chans = {}, notes = 0, end = 0;
    raw.forEach(function (e) {
      var key = e.ch + '/' + e.n;
      if (e.k === 'on') {
        if (held[key]) out.push({ t: e.t, k: 'off', ch: e.ch, n: e.n, v: 0 });
        held[key] = true; notes++; chans[e.ch + 1] = true; if (e.v > peak) peak = e.v;
        out.push(e);
      } else if (e.k === 'off') {
        if (!held[key]) return;
        held[key] = false; out.push(e);
      } else out.push(e);
      if (e.t > end) end = e.t;
    });
    Object.keys(held).forEach(function (key) { if (held[key]) { var p = key.split('/'); out.push({ t: end, k: 'off', ch: +p[0], n: +p[1], v: 0 }); } });
    if (!notes) throw new Error('No notes found in this file.');
    return { title: title, source: source, events: out, peak: peak, notes: notes, duration: end, channels: Object.keys(chans).map(Number).sort(function (a, b) { return a - b; }), warnings: warnings };
  }

  function readMidi(buf, fname) {
    var b = new Uint8Array(buf), warnings = [], raw = [], title = '', ord = 0;
    function str(at, n) { var s = ''; for (var q = at; q < at + n && q < b.length; q++) s += String.fromCharCode(b[q]); return s; }
    function u32(at) { return ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3]; }
    function u16(at) { return (b[at] << 8) | b[at + 1]; }
    if (b.length < 14 || str(0, 4) !== 'MThd') throw new Error('Not a MIDI file.');
    var hlen = u32(4), ntrk = u16(10), div = u16(12);
    if (div & 0x8000) throw new Error('SMPTE-timed MIDI files are not supported.');
    if (!div) throw new Error('Damaged MIDI file (no timing).');
    var i = 8 + hlen, dropped = 0;
    for (var t = 0; t < ntrk && i + 8 <= b.length; t++) {
      if (str(i, 4) !== 'MTrk') throw new Error('Damaged MIDI file (track ' + (t + 1) + ').');
      var j = i + 8, end = Math.min(b.length, j + u32(i + 4)), tick = 0, st = 0;
      while (j < end) {
        var v = 0, c;
        do { c = b[j++]; v = (v << 7) | (c & 0x7F); } while (c & 0x80 && j < end);
        tick += v;
        c = b[j];
        if (c === 0xFF) {
          var ty = b[j + 1], ln = 0; j += 2;
          do { c = b[j++]; ln = (ln << 7) | (c & 0x7F); } while (c & 0x80 && j < end);
          if (ty === 0x51 && ln === 3) raw.push({ tick: tick, o: ord++, k: 'tempo', us: (b[j] << 16) | (b[j + 1] << 8) | b[j + 2] });
          if (ty === 0x03 && !title && t <= 1 && ln < 120) title = str(j, ln).replace(/[^\x20-\x7e]/g, '').trim();
          j += ln; continue;
        }
        if (c === 0xF0 || c === 0xF7) { j++; var sl = 0; do { c = b[j++]; sl = (sl << 7) | (c & 0x7F); } while (c & 0x80 && j < end); j += sl; dropped++; continue; }
        if (c & 0x80) { st = c; j++; } else if (!st) throw new Error('Damaged MIDI file (running status).');
        var hi = st & 0xF0, ch = st & 15;
        if (hi === 0xC0 || hi === 0xD0) { j += 1; dropped++; continue; }
        if (hi < 0x80 || hi > 0xE0) throw new Error('Damaged MIDI file (unknown message).');
        var d1 = b[j], d2 = b[j + 1]; j += 2;
        if (hi === 0x90 && d2 > 0) raw.push({ tick: tick, o: ord++, k: 'on', ch: ch, n: d1, v: d2 });
        else if (hi === 0x80 || hi === 0x90) raw.push({ tick: tick, o: ord++, k: 'off', ch: ch, n: d1, v: 0 });
        else if (hi === 0xB0 && d1 === 64) raw.push({ tick: tick, o: ord++, k: 'sus', ch: ch, n: 64, v: d2 });
        else dropped++;
      }
      i = end;
    }
    raw.sort(function (a, x) { return a.tick - x.tick || (a.k === 'tempo' ? -1 : x.k === 'tempo' ? 1 : 0) || a.o - x.o; });
    var us = 500000, lastTick = 0, sec = 0, notes = [];
    raw.forEach(function (e) {
      sec += (e.tick - lastTick) * us / div / 1e6; lastTick = e.tick;
      if (e.k === 'tempo') { if (e.us > 0) us = e.us; return; }
      e.t = sec; notes.push(e);
    });
    var bpm0 = 120, firstT = raw.filter(function (e) { return e.k === 'tempo' && e.us > 0; })[0]; if (firstT) bpm0 = 60000000 / firstT.us;
    if (dropped) warnings.push(dropped + ' program, controller or SysEx message' + (dropped === 1 ? '' : 's') + ' left out (only notes and the sustain pedal are played).');
    if (notes.some(function (e) { return e.ch === 9; })) warnings.push('Channel 10 (drums in General MIDI) is included; on "All on one Part" those notes play pitched.');
    var songM = finishSong(title || fname.replace(/\.(mid|midi)$/i, ''), notes, warnings, 'MIDI');
    songM.bpm = bpm0;
    return songM;
  }

  function readMusicXml(text, fname) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('This MusicXML could not be read.');
    var root = doc.documentElement, warnings = [];
    if (root.nodeName === 'score-timewise') throw new Error('Timewise MusicXML is not supported; export it as partwise (the usual kind).');
    if (root.nodeName !== 'score-partwise') throw new Error('Not a MusicXML score.');
    var kids = function (n, name) { return Array.prototype.filter.call(n.children, function (c) { return c.nodeName === name; }); };
    var first = function (n, name) { return n.getElementsByTagName(name)[0] || null; };
    var num = function (n, name, d) { var x = n && first(n, name); var v = x ? parseFloat(x.textContent) : NaN; return isFinite(v) ? v : d; };
    var tnode = first(root, 'work-title') || first(root, 'movement-title');
    var title = tnode ? tnode.textContent.trim() : fname.replace(/\.(musicxml|xml|mxl)$/i, '');
    var STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    var tempos = [], notes = [], hasRepeat = false, graces = 0, unpitched = 0;
    kids(root, 'part').forEach(function (part, pi) {
      var ch = pi < 9 ? pi : Math.min(15, pi + 1); // skip channel 10 (GM drums)
      var divs = 1, pos = 0, lastStart = 0, tied = {};
      kids(part, 'measure').forEach(function (meas) {
        Array.prototype.forEach.call(meas.children, function (el) {
          var name = el.nodeName;
          if (name === 'attributes') { divs = num(el, 'divisions', divs) || divs; return; }
          if (name === 'backup') { pos -= num(el, 'duration', 0) / divs; return; }
          if (name === 'forward') { pos += num(el, 'duration', 0) / divs; return; }
          if (name === 'barline') { if (first(el, 'repeat')) hasRepeat = true; return; }
          if (name === 'sound' || name === 'direction') {
            var s = name === 'sound' ? el : first(el, 'sound');
            var bpm = s && parseFloat(s.getAttribute('tempo'));
            if (pi === 0 && bpm > 0) tempos.push({ beat: pos, bpm: bpm });
            return;
          }
          if (name !== 'note') return;
          if (first(el, 'grace')) { graces++; return; }
          var dur = num(el, 'duration', 0) / divs, chord = !!first(el, 'chord');
          var start = chord ? lastStart : pos;
          if (!chord) lastStart = pos;
          var pitch = first(el, 'pitch');
          if (pitch && !first(el, 'rest')) {
            var midiN = (num(pitch, 'octave', 4) + 1) * 12 + (STEP[(first(pitch, 'step') || {}).textContent] || 0) + Math.round(num(pitch, 'alter', 0));
            var ties = Array.prototype.map.call(el.getElementsByTagName('tie'), function (x) { return x.getAttribute('type'); });
            var key = ch + '/' + midiN, prev = tied[key];
            if (ties.indexOf('stop') !== -1 && prev && Math.abs(prev.end - start) < 0.02) {
              prev.end = start + dur;
              if (ties.indexOf('start') === -1) delete tied[key];
            } else if (midiN >= 0 && midiN <= 127 && dur > 0) {
              var note = { start: start, end: start + dur, n: midiN, ch: ch, o: notes.length };
              notes.push(note);
              if (ties.indexOf('start') !== -1) tied[key] = note; else delete tied[key];
            }
          } else if (first(el, 'unpitched')) unpitched++;
          if (!chord) pos += dur;
        });
      });
    });
    // beats -> seconds through the tempo marks (first part); none = the app's BPM
    var base = parseFloat(App.store.get('met.bpm', 100)) || 100;
    if (!tempos.length) { tempos.push({ beat: 0, bpm: base }); warnings.push('No tempo in the file: playing at the app tempo, ' + Math.round(base) + ' BPM.'); }
    tempos.sort(function (a, b) { return a.beat - b.beat; });
    if (tempos[0].beat > 0) tempos.unshift({ beat: 0, bpm: tempos[0].bpm });
    var secAt = function (beat) {
      var s = 0;
      for (var k = 0; k < tempos.length; k++) {
        var from = tempos[k].beat, to = k + 1 < tempos.length ? tempos[k + 1].beat : Infinity;
        if (beat <= from) break;
        s += (Math.min(beat, to) - from) * 60 / tempos[k].bpm;
      }
      return s;
    };
    if (hasRepeat) warnings.push('Repeats are played once (not expanded).');
    if (graces) warnings.push(graces + ' grace note' + (graces === 1 ? '' : 's') + ' left out.');
    if (unpitched) warnings.push(unpitched + ' unpitched (percussion) note' + (unpitched === 1 ? '' : 's') + ' left out.');
    var raw = [];
    notes.forEach(function (x) {
      var a = secAt(x.start), z = secAt(x.end);
      raw.push({ t: a, k: 'on', ch: x.ch, n: x.n, v: 80, o: x.o * 2 });
      raw.push({ t: Math.max(a + 0.02, z - 0.01), k: 'off', ch: x.ch, n: x.n, v: 0, o: x.o * 2 + 1 });
    });
    var songX = finishSong(title, raw, warnings, 'MusicXML');
    songX.bpm = tempos[0].bpm;
    return songX;
  }

  // .mxl = a zip: META-INF/container.xml names the score; stored or deflated
  async function readMxl(buf, fname) {
    var b = new Uint8Array(buf), dv = new DataView(buf);
    var eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('This .mxl is not a valid compressed MusicXML file.');
    var count = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), files = {};
    var dec = new TextDecoder('utf-8');
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('This .mxl is damaged.');
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      files[dec.decode(b.subarray(p + 46, p + 46 + nlen))] = { method: method, csize: csize, off: off };
      p += 46 + nlen + xlen + clen;
    }
    async function read(nm) {
      var f = files[nm]; if (!f) return null;
      var lh = f.off, start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true), data = b.subarray(start, start + f.csize);
      if (f.method === 0) return dec.decode(data);
      if (f.method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('This .mxl uses compression this browser cannot open.');
      var stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return dec.decode(await new Response(stream).arrayBuffer());
    }
    var container = await read('META-INF/container.xml'), path = null;
    if (container) { var m = /full-path\s*=\s*"([^"]+)"/.exec(container); if (m) path = m[1]; }
    if (!path) path = Object.keys(files).filter(function (k) { return /\.(xml|musicxml)$/i.test(k) && !/^META-INF\//i.test(k); })[0];
    var xml = path && await read(path);
    if (!xml) throw new Error('No score found inside this .mxl.');
    var song = readMusicXml(xml, fname);
    song.source = 'MusicXML (.mxl)';
    return song;
  }

  async function plLoadFile(name, buf) {
    var lower = String(name || '').toLowerCase();
    var head = new Uint8Array(buf.slice(0, 4)), sig = String.fromCharCode.apply(null, head);
    if (sig === 'MThd' || /\.(mid|midi)$/.test(lower)) return readMidi(buf, name);
    if (sig === 'PK\u0003\u0004' || /\.mxl$/.test(lower)) return readMxl(buf, name);
    return readMusicXml(new TextDecoder('utf-8').decode(buf), name);
  }
  // the open song as a format-0 MIDI file at its own tempo, notes shifted as
  // set (the Songs page turns it into guitar tab in the chosen key)
  function songToMidi(song) {
    var TPQ = 480, bpm = song.bpm > 0 ? song.bpm : 120, body = [], last = 0;
    var vlq = function (n) { var o = [n & 0x7f]; n >>= 7; while (n) { o.unshift((n & 0x7f) | 0x80); n >>= 7; } return o; };
    var title = Array.from(new TextEncoder().encode(String(song.title || 'Song').slice(0, 100))), us = Math.round(60000000 / bpm);
    body.push.apply(body, [0, 0xff, 0x03].concat(vlq(title.length), title, [0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255]));
    song.events.forEach(function (e) {
      var tick = Math.round(e.t * bpm / 60 * TPQ), st = e.k === 'on' ? 0x90 : e.k === 'off' ? 0x80 : 0xb0;
      body.push.apply(body, vlq(tick - last).concat([st | e.ch, e.k === 'sus' ? 64 : shiftNote(e.n), e.k === 'off' ? 0 : e.v]));
      last = tick;
    });
    body.push(0, 0xff, 0x2f, 0);
    var n = body.length, out = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (TPQ >> 8) & 255, TPQ & 255, 0x4d, 0x54, 0x72, 0x6b, (n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
    return new Uint8Array(out.concat(body));
  }
  function plOpenAsTab() {
    if (!PL.song) { App.toast('Open a file first'); return false; }
    if (!App.songs) { App.toast('The Songs page is not available'); return false; }
    var song = App.songs.fromMidi(songToMidi(PL.song), PL.song.title);
    if (!song) { App.toast('Nothing in this file fits a guitar'); return false; }
    // opts.ports = a host with no Hub around the card (the Songs page, A3b)
    song.from = 'from the ' + (opt.ports ? '' : 'MIDI Hub ') + 'Player' + (plShift().on || plTrans() ? ', in the chosen key' : '');
    App.songs.load(song); App.switchTo('songs');
    return true;
  }

  function plSet(song) {
    plStop();
    PL.song = song; PL.pos = 0; PL.idx = 0;
    var k = detectSongKey(song), sh = plShift();
    song.key = { root: k.root, scale: k.scale };
    set('plShift', { on: sh.on, fr: k.root, fs: k.scale, tr: sh.tr, ts: sh.ts }); shiftCache.key = '';
    paintPlayer();
    return { title: song.title, notes: song.notes, duration: song.duration, channels: song.channels.slice(), warnings: song.warnings.slice() };
  }

  // REVIEWED SCORES (the 1.1 Score review / practice-material format):
  // {title?, bpm, len (beats), rhythmKnown?, notes: [{t, d (beats), m, rest?, partId?, v?}]}.
  // Each partId gets its own channel in order of first appearance (channel
  // 10 skipped), chords stay chords, rests are silent.
  function checkScore(score) {
    if (!score || !Array.isArray(score.notes) || !score.notes.length || score.notes.length > 50000) throw new Error('Choose a nonempty reviewed score (at most 50,000 notes).');
    if (!isFinite(score.bpm) || score.bpm <= 0 || score.bpm > 1000) throw new Error('The score needs a reviewed tempo.');
    if (score.notes.some(function (n) { return !n || !isFinite(n.t) || n.t < 0 || !isFinite(n.d) || n.d < 0 || (!n.rest && (!Number.isInteger(n.m) || n.m < 0 || n.m > 127)); })) throw new Error('This score has an invalid note.');
    if (!score.notes.some(function (n) { return !n.rest; })) throw new Error('This score contains no pitched notes.');
    var parts = [], chOf = {};
    score.notes.forEach(function (n) { var p = n.partId == null ? '' : String(n.partId); if (!(p in chOf)) { var i = parts.length; parts.push(p); chOf[p] = i < 9 ? i : Math.min(15, i + 1); } });
    return chOf;
  }
  function scoreToSong(score) {
    var chOf = checkScore(score), spb = 60 / score.bpm, raw = [], warnings = [];
    score.notes.forEach(function (n, i) {
      if (n.rest || n.d <= 0) return;
      var a = n.t * spb, z = (n.t + n.d) * spb, c = chOf[n.partId == null ? '' : String(n.partId)];
      var v = Number.isInteger(n.v) && n.v > 0 && n.v <= 127 ? n.v : 80;
      raw.push({ t: a, k: 'on', ch: c, n: n.m, v: v, o: i * 2 });
      raw.push({ t: Math.max(a + 0.02, z - 0.01), k: 'off', ch: c, n: n.m, v: 0, o: i * 2 + 1 });
    });
    if (score.rhythmKnown === false) warnings.push('Rhythm was not confirmed in review: timing follows the draft’s beat positions.');
    var songS = finishSong(score.title || 'Reviewed score', raw, warnings, 'Reviewed score');
    songS.bpm = score.bpm;
    return songS;
  }
  // the same score as a standard MIDI file: format 1, a tempo track, one
  // track per part on its own channel, 480 ticks per beat
  function scoreToMidi(score) {
    var chOf = checkScore(score), TPQ = 480, tracks = [];
    var vlq = function (n) { var o = [n & 0x7f]; n >>= 7; while (n) { o.unshift((n & 0x7f) | 0x80); n >>= 7; } return o; };
    var finish = function (evs) { var body = [], last = 0; evs.sort(function (a, b) { return a.tick - b.tick || a.ord - b.ord; }); evs.forEach(function (e) { body.push.apply(body, vlq(e.tick - last).concat(e.b)); last = e.tick; }); body.push(0, 0xff, 0x2f, 0); return body; };
    var title = Array.from(new TextEncoder().encode(String(score.title || 'Reviewed score').slice(0, 100)));
    var us = Math.round(60000000 / score.bpm);
    tracks.push(finish([{ tick: 0, ord: 0, b: [0xff, 0x03].concat(vlq(title.length), title) }, { tick: 0, ord: 1, b: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255] }]));
    Object.keys(chOf).forEach(function (p) {
      var c = chOf[p], evs = [];
      score.notes.forEach(function (n, i) {
        if (n.rest || n.d <= 0 || (n.partId == null ? '' : String(n.partId)) !== p) return;
        var a = Math.round(n.t * TPQ), z = Math.max(a + 1, Math.round((n.t + n.d) * TPQ));
        var v = Number.isInteger(n.v) && n.v > 0 && n.v <= 127 ? n.v : 80;
        evs.push({ tick: a, ord: i * 2 + 1, b: [0x90 | c, n.m, v] }, { tick: z, ord: i * 2, b: [0x80 | c, n.m, 0] }); // offs first at equal ticks
      });
      tracks.push(finish(evs));
    });
    var out = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, (tracks.length >> 8) & 255, tracks.length & 255, (TPQ >> 8) & 255, TPQ & 255];
    tracks.forEach(function (body) { var n = body.length; out.push(0x4d, 0x54, 0x72, 0x6b, (n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255); for (var k = 0; k < n; k++) out.push(body[k]); });
    return new Uint8Array(out);
  }

  // KEY SHIFTER: transpose by semitones, and/or move the piece into another
  // key and scale by scale degree (C major -> A minor turns every 3rd, 6th
  // and 7th into the minor ones; notes outside the source scale move with
  // the key). Store midihub.plTrans (-12..12) and midihub.plShift
  // {on, fr, fs, tr, ts} (roots 0-11, seven-note Theory scale ids). The
  // source key is guessed when a song loads. Changing either while playing
  // re-starts the sounding notes, so every Note Off matches its Note On.
  var SHIFT_SCALES = ['major', 'aeolian', 'dorian', 'mixolydian', 'phrygian', 'lydian', 'locrian', 'harmonicMinor', 'melodicMinor', 'phrygDom'];
  function plTrans() { var t = parseInt(g('plTrans', 0), 10); return t >= -12 && t <= 12 ? t : 0; }
  function plShift() {
    var o = g('plShift', null) || {}, sc = function (x, d) { return SHIFT_SCALES.indexOf(x) !== -1 ? x : d; }, rt = function (x, d) { x = parseInt(x, 10); return x >= 0 && x <= 11 ? x : d; };
    return { on: o.on === true, fr: rt(o.fr, 0), fs: sc(o.fs, 'major'), tr: rt(o.tr, 9), ts: sc(o.ts, 'aeolian') };
  }
  function keyName(root, scale) { return Theory.pcName(root, Theory.FLAT_KEYS.has(root)) + ' ' + (scale === 'aeolian' ? 'minor' : Theory.SCALES[scale].name.replace(/\s*\(.*\)$/, '').toLowerCase()); }
  // duration-weighted pitch classes against each major / natural minor key;
  // ties go to the key whose tonic sounds most
  function detectSongKey(song) {
    var w = new Array(12).fill(0), open = {};
    song.events.forEach(function (e) {
      var k = e.ch + '/' + e.n;
      if (e.k === 'on') open[k] = e.t;
      else if (e.k === 'off' && open[k] != null) { w[e.n % 12] += Math.max(0.05, e.t - open[k]); delete open[k]; }
    });
    var best = { score: -1, root: 0, scale: 'major' };
    ['major', 'aeolian'].forEach(function (scale) {
      for (var r = 0; r < 12; r++) {
        var info = Theory.scaleInfo(r, scale), sc = 0;
        for (var pc = 0; pc < 12; pc++) if (info.pcSet.has(pc)) sc += w[pc];
        sc += w[r] * 0.5 + w[(r + 7) % 12] * 0.2;
        if (sc > best.score + 1e-9) best = { score: sc, root: r, scale: scale };
      }
    });
    return best;
  }
  var shiftCache = { key: '', map: null };
  function shiftMap() {
    var sh = plShift(), t = plTrans(), key = JSON.stringify([sh, t]);
    if (shiftCache.key === key) return shiftCache.map;
    var map = new Array(128);
    var from = Theory.scaleInfo(sh.fr, sh.fs), to = Theory.scaleInfo(sh.tr, sh.ts);
    var rootMove = ((sh.tr - sh.fr + 18) % 12) - 6; // nearest way to the new key: -6..+5
    for (var n = 0; n < 128; n++) {
      var m = n;
      if (sh.on) {
        var pc = n % 12, step = from.pcToStep.get(pc);
        if (step === undefined) m = n + rootMove;
        else {
          var rel = (pc - sh.fr + 12) % 12, trel = (to.pcs[step] - sh.tr + 12) % 12;
          m = n - rel + rootMove + trel;
        }
      }
      m += t;
      while (m > 127) m -= 12;
      while (m < 0) m += 12;
      map[n] = m;
    }
    shiftCache = { key: key, map: map };
    return map;
  }
  function shiftNote(n) { return shiftMap()[n]; }
  function plReshift(apply) { var was = PL.playing; if (was) plPause(); apply(); shiftCache.key = ''; if (was) plPlay(); else paintPlayer(); }

  function plNow() { return PL.startPos + (performance.now() - PL.startWall) / 1000 * plTempo() / 100; }
  function plSend(bytes) { if (PL.sender) PL.sender(bytes); }
  function plEmit(e) {
    var c = plRoute() === 'part' ? ch() : e.ch, n = e.k === 'sus' ? 64 : shiftNote(e.n), key = c + '/' + n;
    if (e.k === 'on') {
      if (PL.held[key]) plSend([0x80 | c, n, 0]);
      PL.held[key] = [c, n];
      plSend([0x90 | c, n, Math.max(1, Math.min(127, Math.round(e.v * plCap() / PL.song.peak)))]);
    } else if (e.k === 'off') {
      if (!PL.held[key]) return;
      delete PL.held[key];
      plSend([0x80 | c, n, 0]);
    } else {
      PL.sus[c] = e.v >= 64;
      plSend([0xB0 | c, 64, e.v]);
    }
  }
  function plRelease() {
    Object.keys(PL.held).forEach(function (k) { var h = PL.held[k]; plSend([0x80 | h[0], h[1], 0]); });
    Object.keys(PL.sus).forEach(function (c) { if (PL.sus[c]) plSend([0xB0 | +c, 64, 0]); });
    PL.held = {}; PL.sus = {};
  }
  function plSeekIdx(pos) { var ev = PL.song.events, i = 0; while (i < ev.length && ev[i].t < pos - 1e-6) i++; return i; }
  function plTick() {
    if (!PL.playing || !PL.song) return;
    var now = plNow(), ev = PL.song.events;
    while (PL.idx < ev.length && ev[PL.idx].t <= now) plEmit(ev[PL.idx++]);
    PL.pos = Math.min(now, PL.song.duration);
    if (PL.idx >= ev.length) {
      if (plLoop()) { plRelease(); PL.pos = 0; PL.startPos = 0; PL.startWall = performance.now(); PL.idx = 0; }
      else { plStop(); App.toast('Finished: ' + PL.song.title); return; }
    }
    if (performance.now() - PL.painted > 120) paintPlayerTime();
  }
  function plPlay() {
    if (!PL.song) { App.toast('Open a MIDI or MusicXML file first'); return false; }
    if (PL.playing) return true;
    var m = midi();
    if (!App.midi.synthOut.has()) { App.toast('No synth output — connect MIDI and pick one above'); return false; }
    PL.sender = m.bindMusicalOutput ? m.bindMusicalOutput(App.midi.synthOut.id()) : function (b) { return sendOut(b); };
    if (!PL.sender) { App.toast('The synth output is not available'); return false; }
    if (PL.pos >= PL.song.duration) PL.pos = 0;
    PL.idx = plSeekIdx(PL.pos);
    PL.playing = true; PL.startPos = PL.pos; PL.startWall = performance.now();
    clearInterval(PL.timer); PL.timer = setInterval(plTick, 8);
    plTick(); paintPlayer();
    return true;
  }
  function plPause() {
    if (!PL.playing) return;
    PL.pos = plNow(); PL.playing = false;
    clearInterval(PL.timer); PL.timer = 0;
    plRelease(); PL.sender = null; paintPlayer();
  }
  function plStop() {
    if (PL.playing) plPause();
    PL.pos = 0; PL.idx = 0; paintPlayer();
  }
  function plSeek(pos) {
    if (!PL.song) return;
    var was = PL.playing;
    if (was) plPause();
    PL.pos = Math.max(0, Math.min(PL.song.duration, pos)); PL.idx = plSeekIdx(PL.pos);
    if (was) plPlay(); else paintPlayer();
  }

  function paintPlayerTime() {
    PL.painted = performance.now();
    if (!els.pltime || !PL.song) return;
    els.pltime.textContent = clock(PL.pos / (plTempo() / 100)) + ' / ' + clock(PL.song.duration / (plTempo() / 100));
    if (els.plseek && document.activeElement !== els.plseek) els.plseek.value = Math.round(1000 * PL.pos / (PL.song.duration || 1));
  }
  // opts.ports: the card's own Synth out / Channel selects (the Hub has them in its header)
  function paintPlayerPorts() {
    if (!els.plports) return;
    var m = midi(), ready = !!(m && m.ready);
    els.plports.hidden = !ready;
    if (!ready) return;
    els.plsynth.innerHTML = '<option value="shared">Same as key lights</option>';
    m.outputs.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; els.plsynth.appendChild(o); });
    var id = m.synthOut.id(); els.plsynth.value = id == null ? 'shared' : String(id);
    els.plch.value = String(ch());
  }
  // a new output or channel under a playing song: release on the old one first,
  // so every Note Off matches its Note On (the same order as the Channels switch)
  function plRetarget(apply) { var was = PL.playing; if (was) plPause(); apply(); if (was) plPlay(); paintPlayer(); }
  function paintPlayer() {
    if (!els.plinfo) return;
    var s = PL.song;
    els.plinfo.innerHTML = s ? '<b>' + esc(s.title) + '</b> <span class="muted">· ' + esc(s.source) + ' · ' + s.notes + (s.notes === 1 ? ' note · ' : ' notes · ') + clock(s.duration) +
      ' · channel' + (s.channels.length === 1 ? ' ' : 's ') + s.channels.join(', ') + '</span>' : '<span class="muted">No file open.</span>';
    els.plwarn.hidden = !(s && s.warnings.length);
    els.plwarn.innerHTML = s ? s.warnings.map(esc).join('<br>') : '';
    els.plplay.textContent = PL.playing ? 'Pause' : 'Play';
    els.plplay.classList.toggle('active', PL.playing);
    els.plplay.disabled = els.plstop.disabled = els.plseek.disabled = !s;
    if (els.pltab) els.pltab.disabled = !s || !App.songs;
    var n = App.midi.synthOut.name();
    els.plout.textContent = n ? '→ ' + n + (plRoute() === 'part' ? ' · ' + partLabel() + ' ' + (ch() + 1) : '') : (opt.noOut || 'No synth output yet — connect MIDI above');
    if (els.plconnect) els.plconnect.hidden = !!n;
    paintPlayerPorts();
    els.plpartlab.textContent = 'All on ' + partLabel() + ' ' + (ch() + 1);
    var sh = plShift(), t = plTrans();
    els.plshift.checked = sh.on; els.plkeys.hidden = !sh.on; els.pltrans.value = String(t);
    els.plfr.value = String(sh.fr); els.plfs.value = sh.fs; els.pltr.value = String(sh.tr); els.plts.value = sh.ts;
    var parts = [];
    if (s && s.key) parts.push('Sounds like ' + keyName(s.key.root, s.key.scale) + '.');
    if (sh.on) parts.push('Playing ' + keyName(sh.fr, sh.fs) + ' as ' + keyName(sh.tr, sh.ts) + '.');
    if (t) parts.push('Transposed ' + (t > 0 ? 'up ' : 'down ') + Math.abs(t) + ' semitone' + (Math.abs(t) === 1 ? '' : 's') + '.');
    els.plkeyinfo.textContent = parts.join(' ');
    root.querySelectorAll('[data-plroute]').forEach(function (b) { var on = b.getAttribute('data-plroute') === plRoute(); b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
    paintPlayerTime();
  }
  function wirePlayer() {
    els.plfile.addEventListener('change', function () {
      var f = this.files && this.files[0]; this.value = '';
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) { App.toast('That file is over 8 MB'); return; }
      f.arrayBuffer().then(function (buf) { return plLoadFile(f.name, buf); }).then(function (song) { plSet(song); App.toast('Ready: ' + song.title); })
        .catch(function (e) { App.toast(e && e.message || 'Could not read that file'); });
    });
    els.plplay.addEventListener('click', function () { if (PL.playing) plPause(); else plPlay(); });
    els.plstop.addEventListener('click', plStop);
    els.plseek.addEventListener('change', function () { if (PL.song) plSeek(PL.song.duration * this.value / 1000); });
    els.pltempo.addEventListener('change', function () {
      var was = PL.playing; if (was) { PL.pos = plNow(); PL.startPos = PL.pos; PL.startWall = performance.now(); }
      set('plTempo', parseInt(this.value, 10)); paintPlayerTime();
    });
    els.plvel.addEventListener('input', function () { set('plVel', parseInt(this.value, 10)); els.plvelv.textContent = this.value; });
    els.plloop.addEventListener('change', function () { set('plLoop', this.checked); });
    if (els.pltab) els.pltab.addEventListener('click', plOpenAsTab);
    var roots = ''; for (var r = 0; r < 12; r++) roots += '<option value="' + r + '">' + Theory.pcName(r, Theory.FLAT_KEYS.has(r)) + '</option>';
    var scales = SHIFT_SCALES.map(function (x) { return '<option value="' + x + '">' + esc(Theory.SCALES[x].name.replace(/\s*\(.*\)$/, '')) + '</option>'; }).join('');
    els.plfr.innerHTML = els.pltr.innerHTML = roots; els.plfs.innerHTML = els.plts.innerHTML = scales;
    els.pltrans.addEventListener('change', function () { var v = parseInt(this.value, 10); plReshift(function () { set('plTrans', v); }); });
    els.plshift.addEventListener('change', function () { var on = this.checked; plReshift(function () { var sh = plShift(); sh.on = on; set('plShift', sh); }); });
    [['plfr', 'fr', true], ['plfs', 'fs', false], ['pltr', 'tr', true], ['plts', 'ts', false]].forEach(function (x) {
      els[x[0]].addEventListener('change', function () { var v = x[2] ? parseInt(this.value, 10) : this.value; plReshift(function () { var sh = plShift(); sh[x[1]] = v; set('plShift', sh); }); });
    });
    root.querySelector('.mh-plroute').addEventListener('click', function (e) {
      var b = e.target.closest('[data-plroute]'); if (!b) return;
      var was = PL.playing; if (was) plPause();
      set('plRoute', b.getAttribute('data-plroute'));
      if (was) plPlay(); else paintPlayer();
    });
    // per-mount extras (opts.ports / opts.connect): only where the host has no Hub header
    if (els.plsynth) els.plsynth.addEventListener('change', function () { var v = this.value || 'shared'; plRetarget(function () { App.midi.synthOut.set(v); }); });
    if (els.plch) els.plch.addEventListener('change', function () { var v = parseInt(this.value, 10); plRetarget(function () { set('ch', v >= 0 && v < 16 ? v : 0); }); });
    if (els.plconnect) els.plconnect.addEventListener('click', function () { if (opt.connect && typeof opt.connect.run === 'function') opt.connect.run(); });
  }

  // ---- the card ----
  var IDS = ['plout', 'plfile', 'plinfo', 'plplay', 'plstop', 'pltime', 'plseek', 'pltempo', 'plvel', 'plvelv', 'plloop', 'plwarn', 'plpartlab',
    'pltrans', 'plshift', 'plkeys', 'plfr', 'plfs', 'pltr', 'plts', 'plkeyinfo', 'pltab',
    'plports', 'plsynth', 'plch', 'plconnect']; // pltab only where the Songs page exists, the last four only where the mount asks for them
  function cardHTML() {
    var chOpts = ''; for (var c = 0; c < 16; c++) chOpts += '<option value="' + c + '">' + (c + 1) + '</option>';
    var portsRow = opt.ports ? '<div class="row tight" id="mh-plports" hidden>' +
      '<label class="field" title="Where the Player sends: your synth. The key lights keep their own output (Lights &amp; help).">Synth out<select id="mh-plsynth"></select></label>' +
      '<label class="field" title="The channel “All on one Part” plays on">Channel<select id="mh-plch">' + chOpts + '</select></label></div>' : '';
    var connectBtn = opt.connect && opt.connect.label ? '<button type="button" class="btn sm" id="mh-plconnect" hidden>' + esc(opt.connect.label) + '</button>' : '';
    // the Hub's Player card as it was, plus the per-mount pieces
    return (
      '<div class="card mh-pl">' +
        '<div class="mh-cv-head"><h2>Player</h2><span class="muted small" id="mh-plout"></span>' + connectBtn + '</div>' +
        portsRow +
        '<p class="muted small">Open a MIDI file (.mid) or a MusicXML score (.musicxml, .xml or .mxl, as exported by MuseScore, Sibelius, Dorico or Finale) and play it on your synth. Only notes and the sustain pedal are sent, so your synth\u2019s sounds and settings stay as they are.</p>' +
        '<div class="row tight"><label class="btn sm primary">Open file<input type="file" id="mh-plfile" accept=".mid,.midi,.musicxml,.xml,.mxl" hidden></label><span class="small" id="mh-plinfo"></span></div>' +
        '<div class="mh-pltrans"><button type="button" class="btn primary" id="mh-plplay">Play</button><button type="button" class="btn" id="mh-plstop">Stop</button><span class="mh-mono" id="mh-pltime">0:00 / 0:00</span></div>' +
        '<input type="range" id="mh-plseek" min="0" max="1000" value="0" aria-label="Position in the song">' +
        '<div class="row tight mh-plopts">' +
          '<label class="field">Tempo<select id="mh-pltempo">' + [50, 75, 90, 100, 110, 125, 150].map(function (t) { return '<option value="' + t + '"' + (t === plTempo() ? ' selected' : '') + '>' + t + ' %</option>'; }).join('') + '</select></label>' +
          '<label class="field">Loudest note<span class="row tight"><input type="range" id="mh-plvel" min="20" max="127" value="' + plCap() + '" style="width:110px"><span class="mh-mono" id="mh-plvelv">' + plCap() + '</span></span></label>' +
          '<div class="seg mh-plroute" role="group" aria-label="Channels"><button type="button" data-plroute="file">Channels as in file</button><button type="button" data-plroute="part" id="mh-plpartlab">All on one Part</button></div>' +
          '<label class="mh-chk"><input type="checkbox" id="mh-plloop"' + (plLoop() ? ' checked' : '') + '> Loop</label>' +
          (App.songs ? '<button type="button" class="btn sm" id="mh-pltab" disabled title="Show this as guitar tab on the Songs page, in the chosen key">Open as tab</button>'
            : '<span class="muted small">Open as tab is on the Songs page in soundLAB.</span>') +
        '</div>' +
        '<div class="row tight mh-plkey">' +
          '<label class="field">Transpose<select id="mh-pltrans">' + (function () { var h = ''; for (var t = -12; t <= 12; t++) h += '<option value="' + t + '"' + (t === plTrans() ? ' selected' : '') + '>' + (t > 0 ? '+' + t : t) + (t === 0 ? ' (as written)' : ' semitone' + (Math.abs(t) === 1 ? '' : 's')) + '</option>'; return h; })() + '</select></label>' +
          '<label class="mh-chk"><input type="checkbox" id="mh-plshift"' + (plShift().on ? ' checked' : '') + '> Change key</label>' +
          '<span class="mh-plkeys row tight" id="mh-plkeys"' + (plShift().on ? '' : ' hidden') + '>' +
            '<label class="field">From<span class="row tight"><select id="mh-plfr"></select><select id="mh-plfs"></select></span></label>' +
            '<label class="field">To<span class="row tight"><select id="mh-pltr"></select><select id="mh-plts"></select></span></label>' +
          '</span>' +
        '</div>' +
        '<p class="muted small" id="mh-plkeyinfo"></p>' +
        '<p class="mh-warn small" id="mh-plwarn" hidden></p>' +
        '<details class="tips"><summary>Sheet music as a PDF?</summary><p class="muted small">A notation app turns a score into a file this player opens: if it came from MuseScore, open the original score there and choose <b>Export \u203a MIDI</b> or <b>MusicXML</b>. For a printed or PDF score, a free recognizer such as Audiveris reads it into MusicXML; check its result against the page before you rely on it. \u201cChannels as in file\u201d plays each part or track on its own channel (Part 1 = channel 1 on a MODX in Multi mode); \u201cAll on one Part\u201d sends everything to ' + (opt.ports ? 'the Channel picked above' : 'the Part picked in Control') + '.</p></details>' +
      '</div>'
    );
  }

  // The card's own two lines of the Hub's sheet, and the four Hub classes its
  // markup uses (.mh-cv-head, .mh-mono, .mh-chk, .mh-warn) with the Hub's
  // declarations, so the card looks the same where the Hub's CSS is absent.
  // Injected when this file loads, which is before any page builds: the
  // Hub's own identical rules then come later in the document, and every tie
  // inside the Hub is decided exactly as before.
  App.injectCSS('scoreplayer',
    '.mh-pl .row{margin-top:10px}.mh-pltrans{display:flex;gap:10px;align-items:center;margin-top:12px}.mh-pltrans .btn{min-height:48px;min-width:96px;font-size:16px}' +
    '.mh-plkey{align-items:flex-end}.mh-plkeys{gap:10px}#mh-plseek{width:100%;margin-top:8px}.mh-plopts{align-items:flex-end}.mh-plroute{flex-wrap:wrap}.mh-pl details{margin-top:10px}' +
    '.mh-cv-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.mh-cv-head h2{margin:0}' +
    '.mh-mono{font-family:ui-monospace,Consolas,Menlo,monospace;font-size:12px;color:var(--text)}' +
    '.mh-chk{display:inline-flex;gap:6px;align-items:center;font-size:12.5px;color:var(--muted)}' +
    '.mh-warn{color:var(--red);margin-top:6px}' +
    '#mh-plports[hidden]{display:none}' // opts.ports: .row is display:flex, which beats the hidden attribute
  );

  // Renders the card into el and wires it. Idempotent: every listener sits on
  // an element inside the card, so a new card drops the old ones with the old
  // DOM; the bus listeners below are added once, when this file loads.
  function mount(el, opts) {
    if (!el) return;
    if (root && root !== el) root.innerHTML = ''; // one card per document: no second set of mh-pl ids
    root = el; opt = opts || {};
    root.innerHTML = cardHTML();
    els = {};
    IDS.forEach(function (id) { els[id] = root.querySelector('#mh-' + id); });
    wirePlayer();
    paintPlayer();
  }
  function paint() { if (!root) return; paintPlayer(); }

  // the output and Part label follow the ports: the two events the Hub
  // repaints its own port row on (a mount without a Hub relies on these)
  App.on('midi:state', paint);
  App.on('lights', paint);

  window.SLScorePlayer = {
    mount: mount, paint: paint,
    // load a file (name, ArrayBuffer) -> summary; play/pause/stop/seek(seconds)
    loadFile: function (name, buf) { return plLoadFile(name, buf).then(plSet); }, play: plPlay, pause: plPause, stop: plStop, seek: plSeek,
    // a reviewed practice score {title, bpm, len, notes:[{t, d, m, rest, partId, v}]}
    loadScore: function (score) { return plSet(scoreToSong(score)); },
    // key shifter: shiftNote(midi) under the current settings; the guessed key of the open song
    shiftNote: function (n) { return shiftNote(n); }, openAsTab: plOpenAsTab, toMidiBytes: function () { return PL.song ? songToMidi(PL.song) : null; }, get key() { return PL.song && PL.song.key ? { root: PL.song.key.root, scale: PL.song.key.scale } : null; },
    get state() { return { playing: PL.playing, pos: PL.pos, title: PL.song && PL.song.title, held: Object.keys(PL.held).length, duration: PL.song ? PL.song.duration : 0 }; },
    // the same reviewed score as a standard MIDI file (Uint8Array)
    scoreToMidi: scoreToMidi,
    // bring the card on screen (the mount says how: "Play on synth" on the Songs page)
    show: function () { if (typeof opt.show === 'function') opt.show(); }
  };
})();
