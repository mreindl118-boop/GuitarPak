/* GuitarLab piano module — a keyboard twin of the fretboard.
 *
 * Keys are colored by scale degree with the SAME palette the fretboard uses
 * (fb.colors, customizable there), the key/scale follow the shared context
 * bar exactly like every other page (fb:set / fb:scale on the bus), labels
 * switch between note names / intervals / degrees, every key is playable
 * with a real sampled piano voice, and the Jam tab's sounding chord lights
 * up the keys live (jam:chord / jam:stopped).
 *
 * The keyboard rotates like the fretboard (pn.orient h|v — landscape strip
 * or a portrait column you scroll down), and it carries the fretboard's
 * whole practice engine: scale / group / interval patterns, direction,
 * shared tempo (met.bpm + tempo event), notes-per-beat, loop pauses with
 * start / end (top of the scale) / both-sides placement, note + click
 * toggles, and a runner that lights each key as it sounds. For 7-note
 * scales the exercise runs the highlighted modal octave, tonic to tonic.
 * DOM ids / CSS classes are prefixed pn-.
 */
(function () {
  'use strict';

  var els = {};
  var state = {
    display: 'notes',  // notes | intervals | degrees  (pn.display)
    orient: 'h'        // h = landscape strip, v = portrait column (pn.orient)
  };
  var jamLast = null;

  // ---- QWERTY keyboard input (iPad Magic Keyboard, any physical keyboard) ----
  // Ableton/GarageBand-style default: home row = white keys, top row = black
  // keys, Z/X shift octaves. Mapped by e.code (physical position, so it works
  // on any layout), fully remappable from the panel, persisted pn.qwMap.
  // every letter earns a note: I/O/P carry the upper black keys (aligned to
  // where they sit over K/L/;) and Quote extends the whites to F' — 19 slots
  var QW_DEFAULT = {
    KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6,
    KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyI: 13,
    KeyL: 14, KeyO: 15, Semicolon: 16, Quote: 17, KeyP: 18
  };
  var QW_SLOTS = 19; // chromatic offsets 0..18 from the base note
  var qw = { on: true, oct: 0, map: null, held: {}, learn: -1 };

  function qwBase() { return 60 + qw.oct * 12; } // C4 by default, Z/X shifts

  function qwKeyLabel(code) {
    if (/^Key([A-Z])$/.test(code)) return code.slice(3);
    if (/^Digit([0-9])$/.test(code)) return code.slice(5);
    return { Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
      BracketLeft: '[', BracketRight: ']', Backquote: '`', Minus: '-', Equal: '=' }[code] || code;
  }

  function qwCodeFor(offset) {
    for (var c in qw.map) if (qw.map[c] === offset) return c;
    return null;
  }

  function qwSaveMap() { App.store.set('pn.qwMap', qw.map); }

  // keyboard range: C2..C6 — brackets the guitar's practical range
  var LO = 36, HI = 84;
  var WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
  var W = 44, H = 190, BW = 27, BH = 118;

  // same defaults as the fretboard; live values come from the shared store so
  // a palette customized in the fretboard settings recolors this page too
  var DEG_DEFAULTS = ['#ffab47', '#e8d44d', '#7ad97a', '#4cc9b0', '#6ea8fe', '#b48ef0', '#ff85b3'];

  function degColors() {
    var cols = App.store.get('fb.colors', null);
    return (Array.isArray(cols) && cols.length === 7 &&
      cols.every(function (c) { return /^#[0-9a-fA-F]{6}$/.test(c); })) ? cols : DEG_DEFAULTS;
  }

  function curRoot() { var v = App.store.get('fb.root', 9); return (typeof v === 'number' && v >= 0 && v < 12) ? Math.floor(v) : 9; }
  function curScale() { var v = App.store.get('fb.scale', 'minorPent'); return Theory.SCALES[v] ? v : 'minorPent'; }
  function curMode() { var v = App.store.get('fb.mode', 1); return (typeof v === 'number' && v >= 1 && v <= 7) ? Math.floor(v) : 1; }
  function preferFlat() { return Theory.FLAT_KEYS.has(curRoot()); }

  // which hand the practice is for (pn.hand): decides WHERE the practice
  // window sits (right hand above middle C, left hand an octave below —
  // where that hand actually plays) and which fingering numbers are shown
  var hand = 'right';

  function handBase() { return hand === 'left' ? 36 : 48; }

  // the piano's twin of the fretboard's mode box: for 7-note scales, one
  // octave starting on the modal tonic, placed in the register the chosen
  // hand plays. Keys inside it draw at full color, in-scale keys outside
  // fade to half — and the practice runner plays exactly this window.
  function modeWindow(info) {
    if (!info || info.steps.length !== 7) return null;
    var m0 = handBase() + Theory.mod12(curRoot() + info.steps[curMode() - 1]);
    return [m0, m0 + 12];
  }

  // practice path: the highlighted octave (modal window for 7-note scales,
  // root octave otherwise), tonic to tonic
  function practicePath() {
    var info = Theory.scaleInfo(curRoot(), curScale(), preferFlat());
    var mwin = modeWindow(info);
    var lo = mwin ? mwin[0] : handBase() + Theory.mod12(curRoot());
    var hi = mwin ? mwin[1] : lo + 12;
    var path = [];
    for (var m = lo; m <= hi && m <= HI; m++) {
      if (info.pcSet.has(Theory.mod12(m))) path.push({ midi: m });
    }
    return path;
  }

  // standard scale fingering per ascending path position (1 = thumb …
  // 5 = pinky). Right hand ascends 1-2-3, 1-2-3-4, 5 on the top; the left
  // hand's ascending fingering is exactly the right hand's mirrored — which
  // also makes descents come out right, since a note keeps its finger
  // whichever direction the pattern moves through it.
  function fingerFor(pathIdx, n) {
    var rh;
    if (n === 8) rh = [1, 2, 3, 1, 2, 3, 4, 5];        // 7-note scales
    else if (n === 6) rh = [1, 2, 3, 1, 2, 5];          // pentatonics
    else {
      rh = [];
      for (var i = 0; i < n; i++) rh.push(i === n - 1 ? 5 : (i % 3) + 1);
    }
    if (pathIdx < 0 || pathIdx >= n) return 0;
    return hand === 'left' ? rh[n - 1 - pathIdx] : rh[pathIdx];
  }

  // ---------------- sampled piano voice — the TONE LIBRARY ----------------
  // All open source (samples/CREDITS.md): grand = Salamander Grand (real
  // recording, via tonejs-instruments), bright = FluidR3 piano, electric =
  // MusyngKite EP, organ = MusyngKite drawbar. Same anchor notes per set,
  // nearest-anchor pitch shift, synth fallback until decoded. trim = RMS-
  // measured loudness compensation per set. Chosen in Settings
  // (app.pianoTone, App.setPianoTone).
  var PIANO_SETS = {
    grand: { dir: 'samples/piano2/', trim: 0.21 },
    bright: { dir: 'samples/keys/', trim: 1.0 },
    electric: { dir: 'samples/epiano/', trim: 1.57 },
    organ: { dir: 'samples/organ/', trim: 1.17 }
  };
  var ANCHORS = { 48: 'C3', 52: 'E3', 57: 'A3', 60: 'C4', 64: 'E4', 69: 'A4', 72: 'C5' };
  var raw = { grand: {}, bright: {}, electric: {}, organ: {} };
  var buf = { grand: {}, bright: {}, electric: {}, organ: {} };
  var readyN = { grand: 0, bright: 0, electric: 0, organ: 0 };
  var fetched = {};

  function pianoTonePref() {
    var t = App.store.get('app.pianoTone', 'grand');
    return PIANO_SETS[t] ? t : 'grand';
  }

  function setPianoTone(tone) {
    if (!PIANO_SETS[tone]) tone = 'grand';
    App.store.set('app.pianoTone', tone);
    prefetch(tone); // start loading now; notes switch over as it decodes
  }

  function prefetch(tone) {
    tone = tone || pianoTonePref();
    if (!PIANO_SETS[tone] || fetched[tone]) return;
    fetched[tone] = true;
    Object.keys(ANCHORS).forEach(function (m) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', PIANO_SETS[tone].dir + ANCHORS[m] + '.mp3', true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = function () {
        if ((xhr.status === 200 || xhr.status === 0) && xhr.response) raw[tone][m] = xhr.response;
      };
      try { xhr.send(); } catch (e) { /* blocked — synth fallback */ }
    });
  }

  function decodeAll(ctx) {
    Object.keys(raw).forEach(function (tone) {
      Object.keys(raw[tone]).forEach(function (m) {
        var bytes = raw[tone][m];
        delete raw[tone][m]; // decodeAudioData detaches the buffer
        ctx.decodeAudioData(bytes, function (b) {
          buf[tone][m] = b;
          readyN[tone]++;
        }, function () { /* fallback */ });
      });
    });
  }

  // the decoded bank for the chosen tone (any ready bank stands in while
  // the chosen one is still decoding) + its loudness trim
  function pianoBank() {
    var tone = pianoTonePref();
    if (!readyN[tone]) {
      for (var t in readyN) {
        if (readyN[t]) return { bank: buf[t], trim: PIANO_SETS[t].trim };
      }
    }
    return { bank: buf[tone], trim: PIANO_SETS[tone].trim };
  }

  // held MIDI-keyboard voices: key = chan + '-' + midi. Kept open until
  // note-off so hold length is the player's (long/short presses), and so
  // per-channel bend (ROLI key wiggle) and pressure shape the live note.
  var heldVoices = {};

  function noteOn(midi, vel, chan) {
    var ctx;
    try { ctx = App.getAudio(); } catch (e) { return; }
    decodeAll(ctx);
    var pb = pianoBank();
    var gain = (0.12 + Math.pow((vel || 100) / 127, 1.4) * 0.62) * pb.trim; // hard/soft
    var best = null, bd = 99;
    for (var m in pb.bank) {
      var d = Math.abs(midi - m);
      if (d < bd) { bd = d; best = Number(m); }
    }
    if (best === null) { App.pluckSynth(midi, 0, 1.2, gain * 0.8); return; }
    var t = ctx.currentTime;
    var src = ctx.createBufferSource();
    src.buffer = pb.bank[best];
    var base = Math.pow(2, (midi - best) / 12);
    src.playbackRate.value = base;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    src.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    var key = chan + '-' + midi;
    if (heldVoices[key]) noteOff(midi, chan); // retrigger
    heldVoices[key] = { src: src, g: g, base: base, gain: gain, chan: chan };
  }

  function noteOff(midi, chan) {
    var key = chan + '-' + midi;
    var v = heldVoices[key];
    if (!v) return;
    delete heldVoices[key];
    try {
      var t = App.getAudio().currentTime;
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(Math.max(0.0001, v.g.gain.value), t);
      v.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      v.src.stop(t + 0.35);
    } catch (e) { /* context gone */ }
  }

  function bendChan(chan, semis) {
    for (var k in heldVoices) {
      var v = heldVoices[k];
      if (v.chan === chan) v.src.playbackRate.value = v.base * Math.pow(2, semis / 12);
    }
  }

  function pressChan(chan, val) {
    var ctx;
    try { ctx = App.getAudio(); } catch (e) { return; }
    for (var k in heldVoices) {
      var v = heldVoices[k];
      if (v.chan === chan) {
        v.g.gain.setTargetAtTime(v.gain * (0.35 + (val / 127) * 1.0), ctx.currentTime, 0.05);
      }
    }
  }

  function play(midi, when, dur, gain) {
    var ctx;
    try { ctx = App.getAudio(); } catch (e) { return; }
    decodeAll(ctx);
    when = Math.max(0, when || 0);
    dur = dur || 1.6;
    gain = gain == null ? 0.5 : gain;
    var t = ctx.currentTime + when;
    var pb = pianoBank();
    gain *= pb.trim;
    var best = null, bd = 99;
    for (var m in pb.bank) {
      var d = Math.abs(midi - m);
      if (d < bd) { bd = d; best = Number(m); }
    }
    if (best === null) { App.pluckSynth(midi, when, dur, gain * 0.8); return; }
    var src = ctx.createBufferSource();
    src.buffer = pb.bank[best];
    src.playbackRate.value = Math.pow(2, (midi - best) / 12);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    var rel = Math.min(0.4, Math.max(0.15, dur * 0.3));
    g.gain.setValueAtTime(gain, t + Math.max(0.02, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    src.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  // ---------------- keyboard rendering ----------------

  function whiteIndex(midi) { // count of white keys strictly below midi (from LO)
    var n = 0;
    for (var m = LO; m < midi; m++) if (WHITE_PCS.indexOf(Theory.mod12(m)) !== -1) n++;
    return n;
  }

  function keyLabel(midi, info, pf) {
    var pc = Theory.mod12(midi);
    var step = info.pcToStep.get(pc);
    if (step === undefined) return null;
    if (state.display === 'intervals') return info.intervals[step];
    if (state.display === 'degrees') return String(step + 1);
    return Theory.pcName(pc, pf);
  }

  function render() {
    var root = curRoot(), scaleId = curScale();
    var pf = preferFlat();
    var info = Theory.scaleInfo(root, scaleId, pf);
    var cols = degColors();
    var mwin = modeWindow(info);

    // fingering notation for the practice window: each key in the window
    // shows which finger plays it (for the chosen hand)
    var ppath = practicePath();
    var fingerMap = {};
    ppath.forEach(function (n, i) { fingerMap[n.midi] = fingerFor(i, ppath.length); });

    els.title.textContent = Theory.pcName(root, pf) + ' ' + Theory.SCALES[scaleId].name;
    updateOctLabel();

    var whites = '', blacks = '', dots = '', labels = '';
    var totalW = 0;
    for (var midi = LO; midi <= HI; midi++) {
      var pc = Theory.mod12(midi);
      var isWhite = WHITE_PCS.indexOf(pc) !== -1;
      var step = info.pcToStep.get(pc);
      var inScale = step !== undefined;
      var isRoot = pc === Theory.mod12(root);
      var x, cx, cy;
      if (isWhite) {
        x = whiteIndex(midi) * W;
        totalW = Math.max(totalW, x + W);
        whites += '<rect class="pn-key pn-w" data-midi="' + midi + '" data-pc="' + pc + '" x="' + x +
          '" y="0" width="' + W + '" height="' + H + '" rx="4"/>';
        cx = x + W / 2; cy = H - 26;
        if (pc === 0) { // octave marker under every C
          labels += '<text class="pn-oct" x="' + cx + '" y="' + (H + 16) + '" text-anchor="middle">C' +
            (Math.floor(midi / 12) - 1) + '</text>';
        }
      } else {
        x = whiteIndex(midi) * W - BW / 2;
        blacks += '<rect class="pn-key pn-b" data-midi="' + midi + '" data-pc="' + pc + '" x="' + x +
          '" y="0" width="' + BW + '" height="' + BH + '" rx="3"/>';
        cx = x + BW / 2; cy = BH - 18;
      }
      // QWERTY hints: the computer key that plays this piano key right now
      if (qw.on) {
        var qOff = midi - qwBase();
        if (qOff >= 0 && qOff < QW_SLOTS) {
          var qc = qwCodeFor(qOff);
          if (qc) {
            // white hints sit below the black-key zone where the key is clear
            labels += '<text class="' + (isWhite ? 'pn-qwl' : 'pn-qwlb') + '" x="' +
              (isWhite ? x + W / 2 : x + BW / 2) + '" y="' + (isWhite ? BH + 14 : 18) +
              '" text-anchor="middle">' + qwKeyLabel(qc) + '</text>';
          }
        }
      }
      // fingering numbers above the practice-window dots (1=thumb … 5=pinky)
      if (fingerMap[midi]) {
        labels += '<text class="' + (isWhite ? 'pn-fing' : 'pn-fingb') + '" x="' + cx +
          '" y="' + (cy - 17) + '" text-anchor="middle">' + fingerMap[midi] + '</text>';
      }
      if (inScale) {
        var col = cols[step % 7];
        // mode dimming hits the dot + label only — jam rings stay full so a
        // sounding chord reads clearly across the whole keyboard
        var dim = mwin && (midi < mwin[0] || midi > mwin[1]) ? ' opacity="0.5"' : '';
        dots += '<g class="pn-dotg" data-midi="' + midi + '" data-pc="' + pc + '" data-cx="' + cx + '" data-cy="' + cy + '">' +
          '<circle class="pn-jamring" data-pc="' + pc + '" cx="' + cx + '" cy="' + cy + '" r="15.5" fill="none"/>' +
          '<circle cx="' + cx + '" cy="' + cy + '" r="11.5" fill="' + col + '"' +
          (isRoot ? ' stroke="#ffffff" stroke-width="2"' : '') + dim + '/>' +
          '<text class="pn-dott" x="' + cx + '" y="' + (cy + 3.5) + '" text-anchor="middle"' + dim + '>' +
          keyLabel(midi, info, pf) + '</text></g>';
      }
    }

    var TH = H + 24;
    // horizontal: natural strip, scrolls sideways. Vertical: the whole group
    // rotates 90° cw as ONE unit (fretboard convention) into a portrait
    // column that scales to the container and scrolls down.
    var horiz = state.orient === 'h';
    els.stage.classList.toggle('pn-v', !horiz);
    els.stage.innerHTML =
      '<svg id="pn-svg" viewBox="0 0 ' + (horiz ? totalW + ' ' + TH : TH + ' ' + totalW) + '"' +
      (horiz ? ' width="' + totalW + '" height="' + TH + '"' : '') +
      ' xmlns="http://www.w3.org/2000/svg">' +
      (horiz ? '<g id="pn-rot">' : '<g id="pn-rot" transform="rotate(90) translate(0,-' + TH + ')">') +
      whites + blacks + dots + labels + '</g></svg>';

    if (jamLast) jamPaint(jamLast); // fresh svg — reapply the live chord overlay

    // legend: one colored chip per degree, same shape as the fretboard's
    var lg = '';
    for (var i = 0; i < info.pcs.length; i++) {
      lg += '<span class="pn-leg"><span class="legend-dot" style="background:' + cols[i % 7] +
        '"></span>' + info.intervals[i] + ' &middot; ' + info.names[i] + '</span>';
    }
    els.legend.innerHTML = lg;
  }

  function scrollToWindow() {
    var info = Theory.scaleInfo(curRoot(), curScale(), preferFlat());
    var mwin = modeWindow(info);
    var lo = mwin ? mwin[0] : 48 + Theory.mod12(curRoot());
    var frac = (whiteIndex(lo) * W) / (whiteIndex(HI) * W + W);
    if (state.orient === 'h') {
      els.stage.scrollLeft = Math.max(0, frac * els.stage.scrollWidth - els.stage.clientWidth / 4);
    } else {
      var svg = els.stage.querySelector('svg');
      if (svg) window.scrollTo({ top: els.stage.offsetTop + frac * svg.getBoundingClientRect().height - 220 });
    }
  }

  // ---------------- interaction ----------------

  function pressKey(midi, dur) {
    var svg = document.getElementById('pn-svg');
    if (!svg) return;
    var k = svg.querySelector('.pn-key[data-midi="' + midi + '"]');
    if (!k) return;
    k.classList.add('pn-down');
    setTimeout(function () { k.classList.remove('pn-down'); }, dur || 180);
  }

  // ---------------- practice runner (fretboard engine on the keys) ----------------

  var pp = {
    running: false, idx: 0, seq: null, path: [],
    pattern: 'scale', dir: 'up', bpm: 120, rate: 1, sound: true, click: true,
    pause: 0, pausePos: 'end', pausedAtIdx: -1, turn: -1,
    guide: false, guiding: false, target: -1,  // Guide: advance on the played note
    timer: null, raf: 0, nextT: 0, vis: [], ctx: null
  };

  // LED guidance on a connected MIDI keyboard: the sounding note bright, the
  // upcoming note dim — "play this, this is next". Cleared on stop.
  var led = { cur: -1, next: -1 };

  function ledGuide(cur, next) {
    if (!App.midi || !App.midi.hasOutput) return;
    if (led.cur !== -1 && led.cur !== cur && led.cur !== next) App.midi.dark(led.cur);
    if (led.next !== -1 && led.next !== next && led.next !== cur) App.midi.dark(led.next);
    if (cur !== -1) App.midi.light(cur, 120);
    if (next !== -1 && next !== cur) App.midi.light(next, 25);
    led.cur = cur; led.next = next;
  }

  function ledClear() {
    if (App.midi && App.midi.hasOutput) App.midi.allDark();
    led.cur = led.next = -1;
  }

  function ppSeq(path, pattern, dir) {
    var seq = Theory.exerciseSeq(path, pattern, dir);
    // up-down sequences are ascent + mirrored descent (top played once): the
    // first descent note sits at len/2 + 1 — where a "top of the scale" rest
    // belongs (same rule as the fretboard runner)
    pp.turn = dir === 'updown' && seq.length >= 4 ? seq.length / 2 + 1 : -1;
    return seq;
  }

  function ppStatus(msg) {
    if (els.status) els.status.textContent = msg || '';
  }

  function ppRestClick(t) {
    if (!pp.click) return;
    var o = pp.ctx.createOscillator(), gn = pp.ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 1150;
    gn.gain.setValueAtTime(0.09, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(gn);
    gn.connect(pp.ctx.destination);
    o.start(t);
    o.stop(t + 0.05);
  }

  function ppTick() {
    if (pp.nextT < pp.ctx.currentTime + 0.01) pp.nextT = pp.ctx.currentTime + 0.05;
    var horizon = pp.ctx.currentTime + 0.25;
    while (pp.nextT < horizon) {
      // loop rests — same semantics as the fretboard: one-way runs rest at
      // the wrap seam ("both" doubles it); up-down runs rest at the bottom
      // ("start"), the top turnaround ("end"), or both sides
      if (pp.pause > 0 && pp.pausedAtIdx !== pp.idx) {
        var pos = pp.idx % pp.seq.length;
        var restBeats = 0;
        if (pp.idx > 0 && pos === 0) {
          restBeats = pp.turn > 0 ?
            ((pp.pausePos === 'start' || pp.pausePos === 'both') ? pp.pause : 0) :
            (pp.pausePos === 'both' ? pp.pause * 2 : pp.pause);
        } else if (pp.turn > 0 && pos === pp.turn &&
                   (pp.pausePos === 'end' || pp.pausePos === 'both')) {
          restBeats = pp.pause;
        }
        if (restBeats > 0) {
          pp.pausedAtIdx = pp.idx;
          var beatLen = 60 / pp.bpm;
          for (var rb = 0; rb < restBeats; rb++) ppRestClick(pp.nextT + rb * beatLen);
          pp.nextT += restBeats * beatLen;
          continue;
        }
      }
      var node = pp.path[pp.seq[pp.idx % pp.seq.length]];
      var when = pp.nextT - pp.ctx.currentTime;
      var spn = 60 / pp.bpm / pp.rate;
      if (pp.sound) {
        var dur = Math.max(0.5, Math.min(1.7, spn * 1.5));
        play(node.midi, when, dur, pp.idx % (pp.rate > 1 ? pp.rate : 4) === 0 ? 0.55 : 0.42);
      }
      if (pp.click) {
        var o = pp.ctx.createOscillator(), gn = pp.ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 1150;
        gn.gain.setValueAtTime(0.15, pp.nextT);
        gn.gain.exponentialRampToValueAtTime(0.0001, pp.nextT + 0.03);
        o.connect(gn);
        gn.connect(pp.ctx.destination);
        o.start(pp.nextT);
        o.stop(pp.nextT + 0.05);
      }
      var nxt = pp.path[pp.seq[(pp.idx + 1) % pp.seq.length]];
      pp.vis.push({ t: pp.nextT, midi: node.midi, next: nxt ? nxt.midi : -1, step: pp.idx });
      if (pp.vis.length > 64) pp.vis.shift();
      pp.idx++;
      pp.nextT += spn;
    }
  }

  function ppRing(midi) {
    var svg = document.getElementById('pn-svg');
    if (!svg) return;
    var rot = document.getElementById('pn-rot');
    var ring = document.getElementById('pn-now');
    var g = svg.querySelector('.pn-dotg[data-midi="' + midi + '"]');
    if (!g) { if (ring) ring.setAttribute('opacity', '0'); return; }
    if (!ring) {
      ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('id', 'pn-now');
      ring.setAttribute('r', '15.5');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', 'var(--accent)');
      ring.setAttribute('stroke-width', '3.5');
      ring.setAttribute('pointer-events', 'none');
      rot.appendChild(ring);
    }
    ring.setAttribute('opacity', '1');
    ring.setAttribute('cx', g.getAttribute('data-cx'));
    ring.setAttribute('cy', g.getAttribute('data-cy'));
  }

  function ppDraw() {
    if (!pp.running) return;
    var now = pp.ctx.currentTime;
    var hit = null;
    while (pp.vis.length && pp.vis[0].t <= now) hit = pp.vis.shift();
    if (hit) {
      var spn = 60 / pp.bpm / pp.rate;
      pressKey(hit.midi, Math.max(120, spn * 700));
      ppRing(hit.midi);
      ledGuide(hit.midi, hit.next);
      showFinger(pp.seq[hit.step % pp.seq.length]);
      ppStatus((hit.step % pp.seq.length) + 1 + ' / ' + pp.seq.length);
    }
    pp.raf = requestAnimationFrame(ppDraw);
  }

  function ppPlayBtn(running) {
    if (els.playBtn) {
      els.playBtn.innerHTML = running ? App.icon('pause', 14) + ' Pause' : App.icon('play', 14) + ' Play';
    }
  }

  // ---- Guide mode: the app shows the note (screen ring + bright LED, next
  // note dim) and WAITS — you advance by playing the right key on the MIDI
  // keyboard or tapping it on screen. Wrong notes flash the status. ----

  function guideTarget() {
    var pathIdx = pp.seq[pp.idx % pp.seq.length];
    var node = pp.path[pathIdx];
    var nxt = pp.path[pp.seq[(pp.idx + 1) % pp.seq.length]];
    pp.target = node.midi;
    ppRing(node.midi);
    ledGuide(node.midi, nxt ? nxt.midi : -1);
    showFinger(pathIdx);
    var pf = preferFlat();
    var fing = fingerFor(pathIdx, pp.path.length);
    ppStatus('play ' + Theory.midiName(node.midi, pf) +
      (fing ? ' · finger ' + fing : '') + ' · ' +
      ((pp.idx % pp.seq.length) + 1) + ' / ' + pp.seq.length);
  }

  // big fingering readout next to the strip while the exercise runs
  function showFinger(pathIdx) {
    var el = document.getElementById('pn-finger');
    if (!el) return;
    var f = pp.path && pp.path.length ? fingerFor(pathIdx, pp.path.length) : 0;
    if (!f) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.textContent = f;
  }

  function guideStart() {
    pp.path = practicePath();
    if (!pp.path.length) { ppStatus('no notes'); return; }
    pp.seq = ppSeq(pp.path, pp.pattern, pp.dir);
    pp.guiding = true;
    App.wake.acquire('pn-run');
    ppPlayBtn(true);
    guideTarget();
  }

  function guideCheck(midi) {
    if (!pp.guiding) return;
    if (midi === pp.target) {
      pressKey(midi, 160);
      pp.idx++;
      guideTarget();
    } else if (Theory.mod12(midi) !== Theory.mod12(pp.target)) {
      ppStatus('not that one — play ' + Theory.midiName(pp.target, preferFlat()));
    }
  }

  function guideStop() {
    if (!pp.guiding) return;
    pp.guiding = false;
    App.wake.release('pn-run');
    ppPlayBtn(false);
  }

  function ppStart() {
    if (pp.guide) { guideStart(); return; }
    pp.path = practicePath();
    if (!pp.path.length) { ppStatus('no notes'); return; }
    pp.seq = ppSeq(pp.path, pp.pattern, pp.dir);
    try { pp.ctx = App.getAudio(); } catch (e) { ppStatus('audio unavailable'); return; }
    pp.vis.length = 0;
    pp.pausedAtIdx = -1;
    pp.nextT = pp.ctx.currentTime + 0.15;
    if (pp.pause > 0 && pp.idx % pp.seq.length === 0 &&
        (pp.pausePos === 'start' || pp.pausePos === 'both')) {
      var b0 = 60 / pp.bpm;
      for (var pi = 0; pi < pp.pause; pi++) ppRestClick(pp.nextT + pi * b0);
      pp.nextT += pp.pause * b0;
    }
    pp.running = true;
    App.wake.acquire('pn-run');
    pp.timer = setInterval(ppTick, 25);
    ppTick();
    pp.raf = requestAnimationFrame(ppDraw);
    ppPlayBtn(true);
  }

  function ppPause() {
    guideStop();
    if (!pp.running) { ledClear(); return; }
    if (pp.timer) { clearInterval(pp.timer); pp.timer = null; }
    if (pp.raf) { cancelAnimationFrame(pp.raf); pp.raf = 0; }
    pp.running = false;
    pp.vis.length = 0;
    App.wake.release('pn-run');
    ledClear();
    ppPlayBtn(false);
  }

  function ppStop() {
    ppPause();
    pp.idx = 0;
    pp.pausedAtIdx = -1;
    var ring = document.getElementById('pn-now');
    if (ring) ring.setAttribute('opacity', '0');
    var fing = document.getElementById('pn-finger');
    if (fing) fing.style.display = 'none';
    ppStatus('');
  }

  function ppToggle() { if (pp.running || pp.guiding) ppPause(); else ppStart(); }

  function ppRebuild() {
    pp.idx = 0;
    pp.pausedAtIdx = -1;
    if (pp.running) { pp.path = practicePath(); pp.seq = ppSeq(pp.path, pp.pattern, pp.dir); }
    if (pp.guiding) { pp.path = practicePath(); pp.seq = ppSeq(pp.path, pp.pattern, pp.dir); guideTarget(); }
  }

  // ---------------- QWERTY input handling ----------------

  // block QWERTY notes only where the user is actually TYPING text. Selects,
  // checkboxes and buttons keep focus after a tap/change — swallowing letters
  // there caused "you must click into the keyboard first" — so they don't count.
  function qwTyping(e) {
    var t = e.target;
    if (!t) return false;
    if (t.isContentEditable || t.tagName === 'TEXTAREA') return true;
    if (t.tagName === 'INPUT') {
      var ty = String(t.type || 'text').toLowerCase();
      return ty !== 'checkbox' && ty !== 'radio' && ty !== 'range' && ty !== 'button';
    }
    return false;
  }

  function qwFlashOctave() {
    ppStatus('keys octave: ' + Theory.midiName(qwBase(), false) + ' – ' +
      Theory.midiName(Math.min(HI, qwBase() + QW_SLOTS - 1), false));
  }

  // shift the typing-keyboard layout by whole octaves (Z/X or the on-page
  // selector), keeping the whole window on the drawn keyboard
  function qwShift(dir) {
    var nb = qwBase() + dir * 12;
    if (nb < LO || nb + QW_SLOTS - 1 > HI + 6) return;
    qw.oct += dir;
    App.store.set('pn.qwOct', qw.oct);
    render();
    qwFlashOctave();
  }

  function updateOctLabel() {
    var el = document.getElementById('pn-octlabel');
    if (el) {
      el.textContent = Theory.midiName(qwBase(), false) + ' – ' +
        Theory.midiName(Math.min(HI, qwBase() + QW_SLOTS - 1), false);
    }
    var row = document.getElementById('pn-octrow');
    if (row) row.style.display = qw.on ? '' : 'none';
  }

  function qwDown(e) {
    if (App.active !== 'piano' || !qw.on || qwTyping(e) || e.repeat ||
        e.ctrlKey || e.metaKey || e.altKey) return;
    // remap capture: the next key pressed claims the slot being edited
    if (qw.learn >= 0) {
      e.preventDefault();
      e.stopPropagation();
      var off = qw.learn;
      var old = qwCodeFor(off);
      if (old) delete qw.map[old];
      delete qw.map[e.code]; // a key maps to one note only
      qw.map[e.code] = off;
      qw.learn = -1;
      qwSaveMap();
      renderQwPanel();
      render();
      return;
    }
    if (e.code === 'KeyZ' || e.code === 'KeyX') {
      qwShift(e.code === 'KeyZ' ? -1 : 1);
      e.preventDefault();
      return;
    }
    var off2 = qw.map[e.code];
    if (off2 === undefined) return;
    var midi = qwBase() + off2;
    if (midi < LO || midi > HI) return;
    e.preventDefault();
    qw.held[e.code] = midi;
    noteOn(midi, 100, 99); // pseudo-channel for computer-keyboard voices
    pressKeyHold(midi, true);
    guideCheck(midi);
  }

  function qwUp(e) {
    var midi = qw.held[e.code];
    if (midi === undefined) return;
    delete qw.held[e.code];
    noteOff(midi, 99);
    pressKeyHold(midi, false);
  }

  // held visual (press for as long as the computer key is down)
  function pressKeyHold(midi, down) {
    var svg = document.getElementById('pn-svg');
    if (!svg) return;
    var k = svg.querySelector('.pn-key[data-midi="' + midi + '"]');
    if (k) k.classList.toggle('pn-down', down);
  }

  function renderQwPanel() {
    if (!els.qwPanel) return;
    var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#'];
    var h = '';
    for (var off = 0; off < QW_SLOTS; off++) {
      var code = qwCodeFor(off);
      h += '<button type="button" class="chip pn-qwslot' + (qw.learn === off ? ' active' : '') +
        '" data-pnqw="' + off + '" title="Tap, then press the key you want for this note">' +
        '<b>' + NOTE_NAMES[off] + (off >= 12 ? "'" : '') + '</b>' +
        (qw.learn === off ? 'press a key…' : (code ? qwKeyLabel(code) : '—')) + '</button>';
    }
    els.qwSlots.innerHTML = h;
  }

  // ---------------- jam follow (chord-over-keys, like the fretboard rings) ----------------

  function jamPaint(ev) {
    var svg = document.getElementById('pn-svg');
    if (!svg) return;
    var rings = svg.querySelectorAll('.pn-jamring');
    var tones = ev ? ev.tones : [];
    for (var i = 0; i < rings.length; i++) {
      var pc = parseInt(rings[i].getAttribute('data-pc'), 10);
      var on = !!ev && tones.indexOf(pc) !== -1;
      rings[i].classList.toggle('on', on);
      rings[i].classList.toggle('root', on && pc === ev.rootPc);
    }
  }

  // ---------------- init ----------------

  function init(rootEl) {
    App.injectCSS('piano',
      '.pn-title{font-family:var(--font-display);font-size:19px;font-weight:600;letter-spacing:1px;text-transform:uppercase}' +
      '.pn-stage{overflow-x:auto;-webkit-overflow-scrolling:touch;padding:6px 2px 2px;touch-action:pan-x}' +
      '.pn-stage svg{display:block}' +
      // portrait column: the rotated keyboard scales to a comfortable width
      // and the page scrolls down it, exactly like the vertical fretboard
      '.pn-stage.pn-v{overflow-x:visible;touch-action:manipulation;display:flex;justify-content:center}' +
      '.pn-stage.pn-v svg{width:min(360px,94%);height:auto}' +
      '.pn-key{cursor:pointer;transition:fill 60ms ease}' +
      // ivory + ebony in both themes — this is the instrument, not chrome
      '.pn-w{fill:#f7f3ea;stroke:#b9b0a2;stroke-width:1}' +
      '.pn-b{fill:#221d20;stroke:#000;stroke-width:1}' +
      // pressed keys light AMBER, unmistakably — held for the length of the
      // press, from screen taps, QWERTY and MIDI alike
      '.pn-w.pn-down{fill:#ffce7d;stroke:#e8912a}' +
      '.pn-b.pn-down{fill:#b9791f;stroke:#e8912a}' +
      '.pn-dotg{pointer-events:none}' +
      '.pn-dott{font:700 11px var(--font-body);fill:#1c1206}' +
      '.pn-oct{font:600 11px var(--font-body);fill:var(--muted)}' +
      '.pn-jamring{opacity:0;stroke:rgba(0,0,0,0.65);stroke-width:2.5;transition:opacity 0.25s ease}' +
      '.pn-jamring.on{opacity:0.95}' +
      '.pn-jamring.root{stroke:var(--accent);stroke-width:3.5}' +
      '.pn-leg{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted);font-weight:600}' +
      '.pn-legend{margin-top:12px}' +
      // QWERTY key hints on the drawn keys + the remap panel
      '.pn-qwl{font:600 10px var(--font-body);fill:#8d8375;pointer-events:none}' +
      '.pn-qwlb{font:600 10px var(--font-body);fill:#b9b0a2;pointer-events:none}' +
      '.pn-qwpanel{display:none;margin-top:12px;padding:12px 14px;background:var(--card2);' +
        'border:1px solid var(--line);border-radius:12px}' +
      '.pn-qwpanel.open{display:block}' +
      '.pn-qwslot{cursor:pointer;font-family:inherit;color:var(--text);gap:6px}' +
      '.pn-qwslot b{color:var(--accent);font-size:12px}' +
      // fingering numbers over the practice-window dots
      '.pn-fing{font:700 11px var(--font-body);fill:#a3562a}' +
      '.pn-fingb{font:700 11px var(--font-body);fill:#e8c48a}' +
      '#pn-octlabel{font-variant-numeric:tabular-nums}' +
      // compact practice strip — selects keep chevron clearance (fretboard rule)
      '.pn-practice{margin-top:12px}' +
      '.pn-practice select{padding:6px 26px 6px 9px;font-size:13px;background-position:right 8px center}' +
      '.pn-practice input[type=number]{padding:6px 8px;font-size:13px}'
    );

    rootEl.innerHTML =
      '<div class="card">' +
        '<div class="row tight spread">' +
          '<span class="pn-title" id="pn-title"></span>' +
          '<span class="row tight">' +
            '<div class="seg" id="pn-display">' +
              '<button type="button" data-pnmode="notes">Notes</button>' +
              '<button type="button" data-pnmode="intervals">Intervals</button>' +
              '<button type="button" data-pnmode="degrees">Degrees</button>' +
            '</div>' +
            '<button type="button" class="chip fb-chip" id="pn-qw" title="Play the piano with your computer or iPad keyboard — home row = white keys, top row = black keys, Z/X shift octaves">Keys</button>' +
            '<span class="row tight" id="pn-octrow" title="Which octaves the typing keys cover (Z / X also shift)">' +
              '<button type="button" class="btn sm" id="pn-octdn" aria-label="Keys octave down">' + App.icon('minus', 13) + '</button>' +
              '<span class="chip" id="pn-octlabel"></span>' +
              '<button type="button" class="btn sm" id="pn-octup" aria-label="Keys octave up">' + App.icon('plus', 13) + '</button>' +
            '</span>' +
            '<button type="button" class="btn sm" id="pn-qwmap" title="Remap which computer key plays which note">Remap</button>' +
            '<button type="button" class="btn sm" id="pn-rotate" title="Rotate the keyboard (portrait / landscape)" aria-label="Rotate the keyboard">' + App.icon('rotate', 14) + '</button>' +
          '</span>' +
        '</div>' +
        '<div class="pn-qwpanel" id="pn-qwpanel">' +
          '<div class="row tight" id="pn-qwslots"></div>' +
          '<div class="row tight" style="margin-top:10px">' +
            '<button type="button" class="btn sm" id="pn-qwreset">Reset layout</button>' +
            '<span class="muted small">Tap a note, then press the key you want for it. Z / X move the whole layout an octave down / up.</span>' +
          '</div>' +
        '</div>' +
        '<div class="row tight pn-practice">' +
          '<button type="button" class="btn sm primary" id="pn-play">' + App.icon('play', 14) + ' Play</button>' +
          '<button type="button" class="btn sm" id="pn-reset" title="Back to the first note">' + App.icon('restart', 14) + '</button>' +
          '<select id="pn-type" title="Pattern type">' +
            '<option value="scale">Scale</option>' +
            '<option value="group">Groups</option>' +
            '<option value="interval">Intervals</option>' +
          '</select>' +
          '<select id="pn-group" title="Notes per group" style="display:none">' +
            '<option value="3">3s</option><option value="4">4s</option>' +
            '<option value="5">5s</option><option value="6">6s</option>' +
            '<option value="7">7s</option>' +
          '</select>' +
          '<select id="pn-iv" title="Interval" style="display:none">' +
            '<option value="2">2nds</option><option value="3">3rds</option>' +
            '<option value="4">4ths</option><option value="5">5ths</option>' +
            '<option value="6">6ths</option><option value="7">7ths</option>' +
            '<option value="8">Octaves</option>' +
          '</select>' +
          '<div class="seg" id="pn-dir" title="Direction">' +
            '<button type="button" data-pndir="up" title="Ascending" aria-label="Ascending">' + App.icon('up', 15) + '</button>' +
            '<button type="button" data-pndir="down" title="Descending" aria-label="Descending">' + App.icon('down', 15) + '</button>' +
            '<button type="button" data-pndir="updown" title="Up, then back down" aria-label="Up, then back down">' + App.icon('updown', 15) + '</button>' +
          '</div>' +
          '<div class="seg" id="pn-handseg" title="Which hand you&#39;re practicing — sets where the practice octave sits (right above middle C, left an octave below) and the fingering numbers on the keys">' +
            '<button type="button" data-pnhand="right">R hand</button>' +
            '<button type="button" data-pnhand="left">L hand</button>' +
          '</div>' +
          '<span class="fb-stroke" id="pn-finger" style="display:none" title="Finger for the sounding note (1=thumb … 5=pinky)"></span>' +
          '<input type="number" id="pn-bpm" min="30" max="280" step="1" title="Tempo (BPM) — linked to the metronome" style="width:70px">' +
          '<select id="pn-rate" title="Notes per beat">' +
            '<option value="1">1 / beat</option>' +
            '<option value="2">8ths</option>' +
            '<option value="3">Triplets</option>' +
            '<option value="4">16ths</option>' +
          '</select>' +
          '<select id="pn-pause" title="Rest between loop repeats — smooths looping practice">' +
            '<option value="0">No pause</option><option value="1">1-beat pause</option>' +
            '<option value="2">2-beat pause</option><option value="3">3-beat pause</option>' +
            '<option value="4">4-beat pause</option>' +
          '</select>' +
          '<select id="pn-pausepos" title="Where the rest sits — on up-and-down runs: start = bottom, end = top of the scale, both = both" style="display:none">' +
            '<option value="start">at start</option><option value="end">at end</option>' +
            '<option value="both">both sides</option>' +
          '</select>' +
          '<label class="row tight small muted" style="gap:5px"><input type="checkbox" id="pn-sound">Notes</label>' +
          '<label class="row tight small muted" style="gap:5px"><input type="checkbox" id="pn-click">Click</label>' +
          '<button type="button" class="chip fb-chip" id="pn-guide" ' +
            'title="Guide mode: the app lights the note to play (on screen and on a connected MIDI keyboard&#39;s LEDs) and waits for you to play it — advance at your own pace">Guide</button>' +
          '<span class="muted small" id="pn-status"></span>' +
        '</div>' +
        '<div class="pn-stage" id="pn-stage"></div>' +
        '<div class="row tight pn-legend" id="pn-legend"></div>' +
        '<div class="muted small" style="margin-top:10px">Tap a key to hear it &mdash; or play with a MIDI keyboard, or any typing keyboard ' +
          '(iPad Magic Keyboard included): home row = white keys, top row = black keys, Z / X shift octaves, Remap to customize. ' +
          'Colors, key, scale and tempo are shared with the rest of the app; the practice runner plays the highlighted octave ' +
          'with the same patterns, direction and loop pauses as the fretboard, and the Jam tab&#39;s chords light up here live.</div>' +
      '</div>';

    els.title = document.getElementById('pn-title');
    els.stage = document.getElementById('pn-stage');
    els.legend = document.getElementById('pn-legend');
    els.playBtn = document.getElementById('pn-play');
    els.status = document.getElementById('pn-status');

    state.display = String(App.store.get('pn.display', 'notes'));
    if (!/^(notes|intervals|degrees)$/.test(state.display)) state.display = 'notes';
    state.orient = App.store.get('pn.orient', 'h') === 'v' ? 'v' : 'h';

    // QWERTY input: persisted toggle, octave, custom map
    qw.on = App.store.get('pn.qw', true) !== false;
    qw.oct = parseInt(App.store.get('pn.qwOct', 0), 10) || 0;
    if (qw.oct < -2 || qw.oct > 1) qw.oct = 0;
    var storedMap = App.store.get('pn.qwMap', null);
    qw.map = {};
    if (storedMap && typeof storedMap === 'object') {
      Object.keys(storedMap).forEach(function (c) {
        var v = parseInt(storedMap[c], 10);
        if (v >= 0 && v < QW_SLOTS && /^[A-Za-z0-9]+$/.test(c)) qw.map[c] = v;
      });
    }
    if (!Object.keys(qw.map).length) {
      Object.keys(QW_DEFAULT).forEach(function (c) { qw.map[c] = QW_DEFAULT[c]; });
    }
    els.qwPanel = document.getElementById('pn-qwpanel');
    els.qwSlots = document.getElementById('pn-qwslots');
    var qwChip = document.getElementById('pn-qw');
    qwChip.classList.toggle('active', qw.on);
    qwChip.addEventListener('click', function () {
      qw.on = !qw.on;
      App.store.set('pn.qw', qw.on);
      this.classList.toggle('active', qw.on);
      if (!qw.on) els.qwPanel.classList.remove('open');
      render();
    });
    document.getElementById('pn-qwmap').addEventListener('click', function () {
      els.qwPanel.classList.toggle('open');
      qw.learn = -1;
      renderQwPanel();
    });
    els.qwSlots.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-pnqw]');
      if (!b) return;
      var off = parseInt(b.getAttribute('data-pnqw'), 10);
      qw.learn = qw.learn === off ? -1 : off;
      renderQwPanel();
    });
    document.getElementById('pn-octdn').addEventListener('click', function () { qwShift(-1); });
    document.getElementById('pn-octup').addEventListener('click', function () { qwShift(1); });
    document.getElementById('pn-qwreset').addEventListener('click', function () {
      qw.map = {};
      Object.keys(QW_DEFAULT).forEach(function (c) { qw.map[c] = QW_DEFAULT[c]; });
      qw.learn = -1;
      qwSaveMap();
      renderQwPanel();
      render();
    });
    document.addEventListener('keydown', qwDown);
    document.addEventListener('keyup', qwUp);
    renderQwPanel();

    var seg = document.getElementById('pn-display');
    function paintSeg() {
      seg.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-pnmode') === state.display);
      });
    }
    paintSeg();
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-pnmode]');
      if (!b) return;
      state.display = b.getAttribute('data-pnmode');
      App.store.set('pn.display', state.display);
      paintSeg();
      render();
    });

    document.getElementById('pn-rotate').addEventListener('click', function () {
      state.orient = state.orient === 'h' ? 'v' : 'h';
      App.store.set('pn.orient', state.orient);
      render();
      scrollToWindow();
    });

    // ---- practice strip wiring (persisted under pn.pr.*; tempo is met.bpm) ----
    pp.pattern = String(App.store.get('pn.pr.pattern', 'scale'));
    if (!/^(scale|g[3-7]|i[2-8])$/.test(pp.pattern)) pp.pattern = 'scale';
    pp.dir = String(App.store.get('pn.pr.dir', 'up'));
    if (!/^(up|down|updown)$/.test(pp.dir)) pp.dir = 'up';
    pp.bpm = Math.max(30, Math.min(280, parseInt(App.store.get('met.bpm', 120), 10) || 120));
    pp.rate = [1, 2, 3, 4].indexOf(App.store.get('pn.pr.rate', 1)) !== -1 ? App.store.get('pn.pr.rate', 1) : 1;
    pp.pause = Math.max(0, Math.min(4, parseInt(App.store.get('pn.pr.pause', 0), 10) || 0));
    pp.pausePos = String(App.store.get('pn.pr.pausePos', 'end'));
    if (!/^(start|end|both)$/.test(pp.pausePos)) pp.pausePos = 'end';
    pp.sound = App.store.get('pn.pr.sound', true) !== false;
    pp.click = !!App.store.get('pn.pr.click', false);

    var typeSel = document.getElementById('pn-type');
    var groupSel = document.getElementById('pn-group');
    var ivSel = document.getElementById('pn-iv');
    var mm;
    if ((mm = /^g([3-7])$/.exec(pp.pattern))) { typeSel.value = 'group'; groupSel.value = mm[1]; }
    else if ((mm = /^i([2-8])$/.exec(pp.pattern))) { typeSel.value = 'interval'; ivSel.value = mm[1]; }
    else typeSel.value = 'scale';

    function paintPattern() {
      groupSel.style.display = typeSel.value === 'group' ? '' : 'none';
      ivSel.style.display = typeSel.value === 'interval' ? '' : 'none';
    }
    paintPattern();

    function patternChanged() {
      pp.pattern = typeSel.value === 'group' ? 'g' + groupSel.value :
        typeSel.value === 'interval' ? 'i' + ivSel.value : 'scale';
      App.store.set('pn.pr.pattern', pp.pattern);
      paintPattern();
      ppRebuild();
    }
    typeSel.addEventListener('change', patternChanged);
    groupSel.addEventListener('change', patternChanged);
    ivSel.addEventListener('change', patternChanged);

    var dirSeg = document.getElementById('pn-dir');
    function paintDir() {
      dirSeg.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-pndir') === pp.dir);
      });
    }
    paintDir();
    dirSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-pndir]');
      if (!b) return;
      pp.dir = b.getAttribute('data-pndir');
      App.store.set('pn.pr.dir', pp.dir);
      paintDir();
      ppRebuild();
    });

    var bpmInp = document.getElementById('pn-bpm');
    bpmInp.value = String(pp.bpm);
    bpmInp.addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      if (isNaN(v)) v = 120;
      v = Math.max(30, Math.min(280, v));
      this.value = String(v);
      pp.bpm = v;
      App.store.set('met.bpm', v);
      App.emit('tempo', { bpm: v, source: 'pn' });
    });
    App.on('tempo', function (d) {
      if (!d || d.source === 'pn') return;
      pp.bpm = Math.max(30, Math.min(280, Math.round(d.bpm)));
      bpmInp.value = String(pp.bpm);
    });

    var rateSel = document.getElementById('pn-rate');
    rateSel.value = String(pp.rate);
    rateSel.addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      pp.rate = (v >= 1 && v <= 4) ? v : 1;
      App.store.set('pn.pr.rate', pp.rate);
    });

    var pauseSel = document.getElementById('pn-pause');
    var pausePosSel = document.getElementById('pn-pausepos');
    pauseSel.value = String(pp.pause);
    pausePosSel.value = pp.pausePos;
    pausePosSel.style.display = pp.pause > 0 ? '' : 'none';
    pauseSel.addEventListener('change', function () {
      pp.pause = Math.max(0, Math.min(4, parseInt(this.value, 10) || 0));
      App.store.set('pn.pr.pause', pp.pause);
      pausePosSel.style.display = pp.pause > 0 ? '' : 'none';
    });
    pausePosSel.addEventListener('change', function () {
      pp.pausePos = /^(start|end|both)$/.test(this.value) ? this.value : 'end';
      App.store.set('pn.pr.pausePos', pp.pausePos);
    });

    var soundChk = document.getElementById('pn-sound');
    var clickChk = document.getElementById('pn-click');
    soundChk.checked = pp.sound;
    clickChk.checked = pp.click;
    soundChk.addEventListener('change', function () {
      pp.sound = !!this.checked;
      App.store.set('pn.pr.sound', pp.sound);
    });
    clickChk.addEventListener('change', function () {
      pp.click = !!this.checked;
      App.store.set('pn.pr.click', pp.click);
    });

    els.playBtn.addEventListener('click', ppToggle);
    document.getElementById('pn-reset').addEventListener('click', ppStop);

    // hand selection: practice register + fingering
    hand = App.store.get('pn.hand', 'right') === 'left' ? 'left' : 'right';
    var handSeg = document.getElementById('pn-handseg');
    function paintHand() {
      handSeg.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-pnhand') === hand);
      });
    }
    paintHand();
    handSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-pnhand]');
      if (!b) return;
      hand = b.getAttribute('data-pnhand') === 'left' ? 'left' : 'right';
      App.store.set('pn.hand', hand);
      paintHand();
      ppRebuild();
      render();
      scrollToWindow();
    });

    pp.guide = !!App.store.get('pn.pr.guide', false);
    var guideChip = document.getElementById('pn-guide');
    guideChip.classList.toggle('active', pp.guide);
    guideChip.addEventListener('click', function () {
      pp.guide = !pp.guide;
      App.store.set('pn.pr.guide', pp.guide);
      this.classList.toggle('active', pp.guide);
      ppStop(); // mode switch restarts cleanly
    });

    // pointerdown (not click) so keys feel instant, like the tap pads
    els.stage.addEventListener('pointerdown', function (e) {
      var k = e.target.closest ? e.target.closest('.pn-key') : null;
      if (!k) return;
      var midi = parseInt(k.getAttribute('data-midi'), 10);
      if (isNaN(midi)) return;
      play(midi, 0, 1.6, 0.55);
      pressKey(midi);
      guideCheck(midi);
    });

    // ---- MIDI keyboard: expressive input + guide answers, on every tab.
    // The on-screen key stays lit for EXACTLY as long as the physical key
    // is held — same visual language as QWERTY input. ----
    App.on('midi:note', function (d) {
      if (!d) return;
      if (d.on) {
        noteOn(d.midi, d.vel, d.chan);
        pressKeyHold(d.midi, true);
        guideCheck(d.midi);
      } else {
        noteOff(d.midi, d.chan);
        pressKeyHold(d.midi, false);
      }
    });
    App.on('midi:bend', function (d) { if (d) bendChan(d.chan, d.semis); });
    App.on('midi:pressure', function (d) { if (d) pressChan(d.chan, d.val); });

    // shared context: follow key/scale/mode changes from the bar, theory page…
    App.on('fb:set', function () { render(); ppRebuild(); });
    App.on('fb:scale', function () { render(); ppRebuild(); });
    App.on('jam:chord', function (ev) { jamLast = ev; jamPaint(ev); });
    App.on('jam:stopped', function () { jamLast = null; jamPaint(null); });

    // pause (keep position) when the whole app goes to the background
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) ppPause();
    });

    prefetch();
    render();
  }

  function onShow() {
    render();       // palette may have been customized in the fretboard settings
    scrollToWindow();
  }

  function onHide() {
    ppPause();      // exercise pauses (keeps its place) when leaving the tab
    // release any computer-keyboard notes whose keyup we'll never see
    Object.keys(qw.held).forEach(function (c) {
      noteOff(qw.held[c], 99);
      delete qw.held[c];
    });
  }

  App.register('piano', {
    init: init,
    onShow: onShow,
    onHide: onHide
  });

  // the sampled piano voice, shared with other modules (chords' piano
  // voicings), plus the tone-library setting surface for the Settings tab
  App.pianoPlay = play;
  App.setPianoTone = setPianoTone;
  Object.defineProperty(App, 'pianoTone', { get: pianoTonePref });
})();
